#!/usr/bin/env python3
"""
Export simple ONNX models without KV cache for demo usage.
This creates cleaner models with just input_ids -> logits.
"""

import os
import torch
from transformers import AutoModelForCausalLM, GPT2TokenizerFast
from optimum.onnxruntime import ORTModelForCausalLM

def export_simple_model(model_path, output_path, model_name):
    """Export model with use_cache=False for simpler inference."""

    print(f"Exporting {model_name} without KV cache...")

    # Load model
    model = AutoModelForCausalLM.from_pretrained(model_path, local_files_only=True)
    tokenizer = GPT2TokenizerFast.from_pretrained(model_path, local_files_only=True)

    # Set pad token
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    print(f"Model config before export: use_cache = {getattr(model.config, 'use_cache', 'undefined')}")

    # Force disable cache in config
    model.config.use_cache = False

    print(f"Model config after setting: use_cache = {model.config.use_cache}")

    # Export with optimum (should respect use_cache=False)
    ort_model = ORTModelForCausalLM.from_pretrained(
        model_path,
        export=True,
        use_cache=False,
        local_files_only=True
    )

    # Save the simplified model
    os.makedirs(output_path, exist_ok=True)
    ort_model.save_pretrained(output_path)
    tokenizer.save_pretrained(output_path)

    print(f"✅ Exported to {output_path}")

    # Verify the exported model inputs
    import onnxruntime as ort
    sess = ort.InferenceSession(os.path.join(output_path, "model.onnx"))
    print(f"Exported model inputs: {[inp.name for inp in sess.get_inputs()]}")
    print(f"Exported model outputs: {[out.name for out in sess.get_outputs()]}")

    return output_path

def main():
    models = [
        {
            'name': 'RookWorld-LM-124M-Simple',
            'input_path': './temp_models/RookWorld-LM-124M',
            'output_path': './model_simple/RookWorld-LM-124M'
        },
        {
            'name': 'ROOK-LM-124M-Simple',
            'input_path': './temp_models/ROOK-LM-124M',
            'output_path': './model_simple/ROOK-LM-124M'
        }
    ]

    for model_info in models:
        try:
            export_simple_model(
                model_info['input_path'],
                model_info['output_path'],
                model_info['name']
            )
        except Exception as e:
            print(f"❌ Failed to export {model_info['name']}: {e}")

    print("\n🎯 To use simple models, update MODEL_CONFIGS in model-utils.js:")
    print("Change modelPath from './model/RookWorld-LM-124M/model.onnx'")
    print("to './model_simple/RookWorld-LM-124M/model.onnx'")

if __name__ == "__main__":
    main()