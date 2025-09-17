#!/usr/bin/env python3
"""
Simple ONNX conversion script using basic transformers + torch.onnx
"""

import os
import torch
import argparse
import json
from pathlib import Path
from transformers import AutoModelForCausalLM, AutoTokenizer

def convert_model_to_onnx(model_path, output_path):
    """Convert model to ONNX with basic torch.onnx export"""

    print(f"Converting {model_path} to ONNX...")

    # Create output directory
    os.makedirs(output_path, exist_ok=True)

    try:
        # Load model and tokenizer
        print("Loading model and tokenizer...")
        model = AutoModelForCausalLM.from_pretrained(
            model_path,
            torch_dtype=torch.float32,
            low_cpu_mem_usage=True
        )
        model = model.cpu()  # Ensure on CPU
        tokenizer = AutoTokenizer.from_pretrained(model_path)

        # Set pad token if not present
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        # Put model in eval mode
        model.eval()

        # Create dummy input
        example_text = "P: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 "
        inputs = tokenizer(example_text, return_tensors="pt", padding=True)

        # Get input_ids tensor
        input_ids = inputs["input_ids"]

        print(f"Input shape: {input_ids.shape}")
        print("Exporting to ONNX...")

        # Export to ONNX
        onnx_path = os.path.join(output_path, "model.onnx")

        # Create a wrapper to handle the model output properly
        class ModelWrapper(torch.nn.Module):
            def __init__(self, model):
                super().__init__()
                self.model = model

            def forward(self, input_ids):
                # Force the model to return only logits, not the full output with cache
                with torch.no_grad():
                    outputs = self.model(input_ids, use_cache=False)
                    return outputs.logits

        wrapped_model = ModelWrapper(model)
        wrapped_model.eval()

        with torch.no_grad():
            # Try the new dynamo-based export first
            try:
                torch.onnx.export(
                    wrapped_model,
                    input_ids,
                    onnx_path,
                    input_names=["input_ids"],
                    output_names=["logits"],
                    dynamic_axes={
                        "input_ids": {0: "batch_size", 1: "sequence_length"},
                        "logits": {0: "batch_size", 1: "sequence_length"}
                    },
                    opset_version=14,
                    dynamo=True,  # Use new export method
                    verbose=False
                )
            except Exception as e:
                print(f"Dynamo export failed: {e}")
                print("Trying legacy export without complex features...")

                # Fallback: ATEN fallback method for transformers
                torch.onnx.export(
                    wrapped_model,
                    input_ids,
                    onnx_path,
                    input_names=["input_ids"],
                    output_names=["logits"],
                    opset_version=11,
                    export_params=True,
                    do_constant_folding=False,
                    verbose=False,
                    operator_export_type=torch.onnx.OperatorExportTypes.ONNX_ATEN_FALLBACK
                )

        print("✅ ONNX export completed")

        # Save tokenizer files
        tokenizer.save_pretrained(output_path)

        # Create simplified config
        config = {
            "model_type": "gpt2",
            "vocab_size": len(tokenizer.vocab),
            "max_position_embeddings": getattr(model.config, 'max_position_embeddings', 2048),
            "hidden_size": getattr(model.config, 'hidden_size', 768),
            "num_hidden_layers": getattr(model.config, 'num_hidden_layers', 12),
            "num_attention_heads": getattr(model.config, 'num_attention_heads', 12),
            "bos_token_id": tokenizer.bos_token_id,
            "eos_token_id": tokenizer.eos_token_id,
            "pad_token_id": tokenizer.pad_token_id,
            "quantized": False
        }

        with open(os.path.join(output_path, "config.json"), "w") as f:
            json.dump(config, f, indent=2)

        # Check file size
        onnx_size = os.path.getsize(onnx_path) / (1024 * 1024)
        print(f"📊 ONNX model size: {onnx_size:.1f} MB")

        return True

    except Exception as e:
        print(f"❌ Conversion failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    parser = argparse.ArgumentParser(description="Convert models to ONNX format (simple)")
    parser.add_argument("--input-dir", default="./temp_models", help="Input directory with downloaded models")
    parser.add_argument("--output-dir", default="./onnx_models", help="Output directory for ONNX models")
    parser.add_argument("--models", nargs="+",
                       choices=["rook-lm", "rookworld-lm", "all"],
                       default=["all"],
                       help="Which models to convert")

    args = parser.parse_args()

    # Check input directory
    if not os.path.exists(args.input_dir):
        print(f"❌ Input directory {args.input_dir} not found")
        return

    # Create output directory
    os.makedirs(args.output_dir, exist_ok=True)

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

    print(f"Converting {len(models_to_convert)} models...")

    success_count = 0
    for input_path, output_path, model_name in models_to_convert:
        print(f"\n🔄 Converting {model_name}...")
        if convert_model_to_onnx(input_path, output_path):
            success_count += 1

    print(f"\n📊 Converted {success_count}/{len(models_to_convert)} models successfully")

    if success_count > 0:
        print(f"📂 ONNX models saved to: {os.path.abspath(args.output_dir)}")

if __name__ == "__main__":
    main()