#!/usr/bin/env python3
"""
Convert ROOK-LM and RookWorld-LM models from safetensors to quantized ONNX format
"""

import os
import torch
import argparse
from pathlib import Path
from transformers import AutoModelForCausalLM, AutoTokenizer
from optimum.onnxruntime import ORTModelForCausalLM, ORTOptimizer, ORTQuantizer
from optimum.onnxruntime.configuration import AutoQuantizationConfig, AutoOptimizationConfig
import json
import shutil

def convert_model_to_onnx(model_path, output_path, quantize=True):
    """Convert a HuggingFace model to ONNX format with optional quantization"""

    print(f"Converting {model_path} to ONNX...")

    # Create output directory
    os.makedirs(output_path, exist_ok=True)

    try:
        # Load model and tokenizer
        print("Loading model and tokenizer...")
        model = AutoModelForCausalLM.from_pretrained(
            model_path,
            torch_dtype=torch.float32,  # Use FP32 for better ONNX compatibility
            device_map="auto" if torch.cuda.is_available() else "cpu"
        )
        tokenizer = AutoTokenizer.from_pretrained(model_path)

        # Set pad token if not present
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        # Create example input for ONNX export
        example_text = "P: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 "
        example_inputs = tokenizer(example_text, return_tensors="pt", padding=True)

        print("Exporting to ONNX...")

        # Export to ONNX using optimum
        ort_model = ORTModelForCausalLM.from_pretrained(
            model_path,
            export=True,
            use_cache=False,  # Disable KV cache for simpler ONNX graph
        )

        # Save the basic ONNX model
        onnx_path = os.path.join(output_path, "model.onnx")
        ort_model.save_pretrained(output_path)

        print("✅ Basic ONNX export completed")

        if quantize:
            print("Applying INT8 quantization...")

            # Create quantization config
            quantization_config = AutoQuantizationConfig.avx512_vnni(is_static=False)

            # Create quantizer
            quantizer = ORTQuantizer.from_pretrained(output_path)

            # Apply quantization
            quantized_path = os.path.join(output_path, "model_quantized.onnx")
            quantizer.quantize(
                save_dir=output_path,
                quantization_config=quantization_config,
                file_suffix="_quantized"
            )

            print("✅ INT8 quantization completed")

            # Rename quantized model as the main model
            if os.path.exists(quantized_path):
                shutil.move(quantized_path, onnx_path)
                print("✅ Using quantized model as main model")

        # Save tokenizer
        tokenizer.save_pretrained(output_path)

        # Create a simplified config for web use
        config = {
            "model_type": "gpt2",
            "vocab_size": len(tokenizer.vocab),
            "max_position_embeddings": 2048,
            "hidden_size": getattr(model.config, 'hidden_size', 768),
            "num_hidden_layers": getattr(model.config, 'num_hidden_layers', 12),
            "num_attention_heads": getattr(model.config, 'num_attention_heads', 12),
            "bos_token_id": tokenizer.bos_token_id,
            "eos_token_id": tokenizer.eos_token_id,
            "pad_token_id": tokenizer.pad_token_id,
            "quantized": quantize
        }

        with open(os.path.join(output_path, "config.json"), "w") as f:
            json.dump(config, f, indent=2)

        # Check file sizes
        onnx_size = os.path.getsize(onnx_path) / (1024 * 1024)  # MB
        print(f"📊 Final ONNX model size: {onnx_size:.1f} MB")

        return True

    except Exception as e:
        print(f"❌ Conversion failed: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Convert models to ONNX format")
    parser.add_argument("--input-dir", default="./temp_models", help="Input directory with downloaded models")
    parser.add_argument("--output-dir", default="./onnx_models", help="Output directory for ONNX models")
    parser.add_argument("--quantize", action="store_true", default=True, help="Apply INT8 quantization")
    parser.add_argument("--models", nargs="+",
                       choices=["rook-lm", "rookworld-lm", "all"],
                       default=["all"],
                       help="Which models to convert")

    args = parser.parse_args()

    # Check if input directory exists
    if not os.path.exists(args.input_dir):
        print(f"❌ Input directory {args.input_dir} not found")
        print("Please run download_models.py first")
        return

    # Create output directory
    os.makedirs(args.output_dir, exist_ok=True)

    models_to_convert = []

    if "all" in args.models or "rook-lm" in args.models:
        input_path = os.path.join(args.input_dir, "ROOK-LM-124M")
        output_path = os.path.join(args.output_dir, "ROOK-LM-124M")
        if os.path.exists(input_path):
            models_to_convert.append((input_path, output_path, "ROOK-LM-124M"))
        else:
            print(f"⚠️ ROOK-LM-124M not found in {input_path}")

    if "all" in args.models or "rookworld-lm" in args.models:
        input_path = os.path.join(args.input_dir, "RookWorld-LM-124M")
        output_path = os.path.join(args.output_dir, "RookWorld-LM-124M")
        if os.path.exists(input_path):
            models_to_convert.append((input_path, output_path, "RookWorld-LM-124M"))
        else:
            print(f"⚠️ RookWorld-LM-124M not found in {input_path}")

    if not models_to_convert:
        print("❌ No valid models found to convert")
        return

    print(f"Converting {len(models_to_convert)} models...")
    print(f"Quantization: {'Enabled' if args.quantize else 'Disabled'}")

    success_count = 0
    for input_path, output_path, model_name in models_to_convert:
        print(f"\n🔄 Converting {model_name}...")
        if convert_model_to_onnx(input_path, output_path, args.quantize):
            success_count += 1
        else:
            print(f"❌ Failed to convert {model_name}")

    print(f"\n📊 Converted {success_count}/{len(models_to_convert)} models successfully")

    if success_count > 0:
        print(f"\n📂 ONNX models saved to: {os.path.abspath(args.output_dir)}")
        print("Next step: Run deploy_models.py to copy to demo directories")

if __name__ == "__main__":
    main()