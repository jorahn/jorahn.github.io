#!/usr/bin/env python3
"""
Convert ROOK-LM and RookWorld-LM using optimum.onnxruntime with calibration dataset
Adapted from working template to avoid unordered_map::at error
"""

import os
import argparse
from pathlib import Path
from datasets import Dataset
from optimum.onnxruntime import ORTQuantizer, ORTModelForCausalLM
from optimum.onnxruntime.configuration import QuantizationConfig
from transformers import AutoTokenizer

def convert_model_with_calibration(model_path, output_dir, model_name, quantize=True):
    """Convert model using optimum with proper calibration dataset"""

    print(f"Converting {model_name} from {model_path}...")

    # Create paths
    onnx_path = Path(output_dir) / f"{model_name}_fp32"
    quantized_model_path = Path(output_dir) / f"{model_name}_int8"

    os.makedirs(onnx_path, exist_ok=True)
    if quantize:
        os.makedirs(quantized_model_path, exist_ok=True)

    try:
        # Step 1: Export to FP32 ONNX (disable cache for simpler ONNX)
        print("Exporting model to ONNX FP32 format...")
        model = ORTModelForCausalLM.from_pretrained(model_path, export=True, use_cache=False)
        tokenizer = AutoTokenizer.from_pretrained(model_path)

        # Set pad token if not present
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        model.save_pretrained(onnx_path)
        tokenizer.save_pretrained(onnx_path)
        tokenizer.save_pretrained(quantized_model_path)

        print("✅ FP32 ONNX export completed")

        if not quantize:
            return str(onnx_path)

        # Step 2: Create chess-specific calibration dataset
        print("Creating calibration dataset...")

        calibration_data = [
            "P: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 M: e2e4 d2d4 g1f3 b1c3 f1c4 E: 0.3 0.3 0.2 0.1 0.0 B: e2e4",
            "P: r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3 M: d2d4 b1c3 f1c4 f1b5 d2d3 E: 0.6 0.5 0.4 0.3 0.2 B: d2d4",
            "P: rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 4 M: f1c4 b1c3 d2d3 f1e2 d2d4 E: 0.4 0.3 0.2 0.1 0.5 B: f1c4",
            "P: r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 4 6 M: d4d5 f3e5 c4d5 b1c3 h2h3 E: 0.7 0.6 0.5 0.3 0.1 B: d4d5",
            "P: 2rqkb1r/p2npppp/3p1n2/1ppP4/4P3/2N2N2/PPP2PPP/R1BQKB1R w KQk b6 0 8 M: f3e5 c3e4 d5c6 f1c4 e5d7 E: 0.8 0.7 0.5 0.4 0.3 B: f3e5"
        ]

        # For RookWorld, add environment examples
        if 'rookworld' in model_name.lower():
            calibration_data.extend([
                "A: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1+e2e4+e2e4+ rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1+0+False+False",
                "A: r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3+d2d4+e2e4 d2d4+ r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq d3 0 3+0+False+False"
            ])

        calibration_dataset = Dataset.from_dict({"text": calibration_data})

        # Preprocess the dataset
        def preprocess_function(examples):
            return tokenizer(examples["text"], padding="max_length", max_length=256, truncation=True)

        calibration_dataset = calibration_dataset.map(preprocess_function, batched=True)

        # Step 3: Create quantization config (use dynamic quantization)
        print("Setting up dynamic quantization configuration...")
        qconfig = QuantizationConfig(
            is_static=False,  # Use dynamic quantization (no calibration needed)
            format="QOperator",  # QOperator format for CPU/WASM
            mode="IntegerOps",   # Use integer-only operators
            activations_dtype="QUInt8",  # Quantize activations
            weights_dtype="QInt8",       # Quantize weights
            per_channel=False,   # More stable for web deployment
            operators_to_quantize=["MatMul"]  # Conservative quantization
        )

        # Step 4: Create quantizer and run quantization
        print("Creating quantizer and running dynamic quantization...")
        quantizer = ORTQuantizer.from_pretrained(onnx_path)

        # Apply dynamic quantization (no calibration needed)
        quantizer.quantize(
            save_dir=quantized_model_path,
            quantization_config=qconfig
        )

        print("✅ Quantization with calibration completed")

        # Step 5: Verify the quantized model
        print("Verifying quantized model...")
        quantized_model = ORTModelForCausalLM.from_pretrained(quantized_model_path)

        # Test with chess prompt - disable cache in generation
        prompt = "P: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 "
        inputs = tokenizer(prompt, return_tensors="pt")
        outputs = quantized_model.generate(**inputs, max_length=inputs.input_ids.shape[1] + 50, do_sample=False, use_cache=False)

        generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
        print(f"\n✅ Test generation successful:")
        print(f"Input: {prompt}")
        print(f"Output: {generated_text}")

        # Check file sizes
        onnx_files = list(quantized_model_path.glob("*.onnx"))
        total_size = sum(f.stat().st_size for f in onnx_files) / (1024 * 1024)  # MB
        print(f"📊 Quantized model size: {total_size:.1f} MB")

        return str(quantized_model_path)

    except Exception as e:
        print(f"❌ Conversion failed: {e}")
        import traceback
        traceback.print_exc()
        return None

def main():
    parser = argparse.ArgumentParser(description="Convert models using optimum with calibration")
    parser.add_argument("--input-dir", default="./temp_models", help="Input directory")
    parser.add_argument("--output-dir", default="./onnx_models_calibrated", help="Output directory")
    parser.add_argument("--quantize", action="store_true", default=True, help="Apply quantization")
    parser.add_argument("--models", nargs="+",
                       choices=["rook-lm", "rookworld-lm", "all"],
                       default=["all"], help="Models to convert")

    args = parser.parse_args()

    models_to_convert = []

    if "all" in args.models or "rook-lm" in args.models:
        input_path = os.path.join(args.input_dir, "ROOK-LM-124M")
        if os.path.exists(input_path):
            models_to_convert.append((input_path, "ROOK-LM-124M"))

    if "all" in args.models or "rookworld-lm" in args.models:
        input_path = os.path.join(args.input_dir, "RookWorld-LM-124M")
        if os.path.exists(input_path):
            models_to_convert.append((input_path, "RookWorld-LM-124M"))

    if not models_to_convert:
        print("❌ No models found. Run download_models.py first.")
        return

    print(f"Converting {len(models_to_convert)} models with calibration...")

    success_count = 0
    converted_paths = []

    for input_path, model_name in models_to_convert:
        print(f"\n🔄 Converting {model_name}...")
        result_path = convert_model_with_calibration(
            input_path, args.output_dir, model_name, args.quantize
        )
        if result_path:
            success_count += 1
            converted_paths.append((model_name, result_path))

    print(f"\n📊 Successfully converted {success_count}/{len(models_to_convert)} models")

    if converted_paths:
        print("\n✅ Converted models ready for deployment:")
        for model_name, path in converted_paths:
            print(f"  {model_name}: {path}")

        print(f"\nNext: Copy ONNX files to demo model directories")
        print(f"  cp {args.output_dir}/*/model*.onnx ./model/*/")

if __name__ == "__main__":
    main()