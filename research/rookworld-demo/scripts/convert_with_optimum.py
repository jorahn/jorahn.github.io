#!/usr/bin/env python3
"""
Convert ROOK-LM and RookWorld-LM using optimum.onnxruntime
Based on recommended approach to avoid unordered_map::at error
"""

import os
import argparse
from pathlib import Path
from optimum.onnxruntime import ORTQuantizer, ORTModelForCausalLM
from optimum.onnxruntime.configuration import QuantizationConfig, AutoQuantizationConfig
from transformers import AutoTokenizer

def convert_model_with_optimum(model_path, output_dir, quantize=True):
    """Convert model using optimum.onnxruntime"""

    print(f"Converting {model_path} using optimum.onnxruntime...")

    # Create paths
    onnx_path = Path(output_dir) / "fp32"
    quantized_path = Path(output_dir) / "quantized"

    os.makedirs(onnx_path, exist_ok=True)
    if quantize:
        os.makedirs(quantized_path, exist_ok=True)

    try:
        # Step 1: Export to ONNX FP32
        print("Exporting model to ONNX FP32 format...")
        model = ORTModelForCausalLM.from_pretrained(model_path, export=True)
        model.save_pretrained(onnx_path)

        # Save tokenizer
        tokenizer = AutoTokenizer.from_pretrained(model_path)
        tokenizer.save_pretrained(onnx_path)

        print("✅ FP32 ONNX export completed")

        if quantize:
            print("Applying INT8 quantization...")

            # Save tokenizer to quantized path too
            tokenizer.save_pretrained(quantized_path)

            # Step 2: Create quantization config
            qconfig = QuantizationConfig(
                is_static=True,
                format="QOperator",  # QOperator format for CPU
                mode="IntegerOps",   # Use integer-only operators
                activations_dtype="QUInt8",  # Quantize activations to unsigned 8-bit int
                weights_dtype="QInt8",       # Quantize weights to signed 8-bit int
                per_channel=False,   # Safer for web deployment
                # IMPORTANT: Only quantize MatMul operators for stability
                operators_to_quantize=["MatMul"]
            )

            # Step 3: Create quantizer and apply
            quantizer = ORTQuantizer.from_pretrained(onnx_path)

            # Apply quantization
            quantizer.quantize(
                save_dir=quantized_path,
                quantization_config=qconfig,
            )

            print("✅ INT8 quantization completed")

            # Use quantized model as final output
            final_path = quantized_path
        else:
            final_path = onnx_path

        # Step 4: Verify the model works
        print("Verifying model...")
        test_model = ORTModelForCausalLM.from_pretrained(final_path)

        # Test with chess prompt
        prompt = "P: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 "
        inputs = tokenizer(prompt, return_tensors="pt")
        outputs = test_model.generate(**inputs, max_length=inputs.input_ids.shape[1] + 50, do_sample=False)

        generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
        print(f"\nTest generation successful:")
        print(f"Input: {prompt}")
        print(f"Output: {generated_text}")

        # Check file sizes
        onnx_files = list(final_path.glob("*.onnx"))
        total_size = sum(f.stat().st_size for f in onnx_files) / (1024 * 1024)  # MB
        print(f"📊 Total ONNX model size: {total_size:.1f} MB")

        return str(final_path)

    except Exception as e:
        print(f"❌ Conversion failed: {e}")
        import traceback
        traceback.print_exc()
        return None

def main():
    parser = argparse.ArgumentParser(description="Convert models using optimum.onnxruntime")
    parser.add_argument("--input-dir", default="./temp_models", help="Input directory with downloaded models")
    parser.add_argument("--output-dir", default="./onnx_models_optimum", help="Output directory for ONNX models")
    parser.add_argument("--quantize", action="store_true", default=True, help="Apply INT8 quantization")
    parser.add_argument("--models", nargs="+",
                       choices=["rook-lm", "rookworld-lm", "all"],
                       default=["all"],
                       help="Which models to convert")

    args = parser.parse_args()

    models_to_convert = []

    if "all" in args.models or "rook-lm" in args.models:
        input_path = os.path.join(args.input_dir, "ROOK-LM-124M")
        output_path = os.path.join(args.output_dir, "ROOK-LM-124M")
        if os.path.exists(input_path):
            models_to_convert.append((input_path, output_path, "ROOK-LM-124M"))

    if "all" in args.models or "rookworld-lm" in args.models:
        input_path = os.path.join(args.input_dir, "RookWorld-LM-124M")
        output_path = os.path.join(args.output_dir, "RookWorld-LM-124M")
        if os.path.exists(input_path):
            models_to_convert.append((input_path, output_path, "RookWorld-LM-124M"))

    if not models_to_convert:
        print("❌ No models found to convert")
        return

    print(f"Converting {len(models_to_convert)} models with optimum.onnxruntime...")

    success_count = 0
    converted_paths = []

    for input_path, output_path, model_name in models_to_convert:
        print(f"\n🔄 Converting {model_name}...")
        result_path = convert_model_with_optimum(input_path, output_path, args.quantize)
        if result_path:
            success_count += 1
            converted_paths.append((model_name, result_path))

    print(f"\n📊 Converted {success_count}/{len(models_to_convert)} models successfully")

    if converted_paths:
        print("\n✅ Converted models:")
        for model_name, path in converted_paths:
            print(f"  {model_name}: {path}")

        print("\nNext step: Run deploy_optimum_models.py to copy to demo directories")

if __name__ == "__main__":
    main()