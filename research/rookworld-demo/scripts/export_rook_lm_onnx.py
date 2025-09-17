#!/usr/bin/env python3
"""
Export ROOK-LM/RookWorld-LM to ONNX format, adapted from ROOK-CLF export script.

Key differences from ROOK-CLF:
- Uses AutoModelForCausalLM instead of AutoModelForSequenceClassification
- Returns next token logits instead of classification logits
- Different input/output shapes and no attention_mask
"""

import argparse
from pathlib import Path
import torch
from transformers import AutoConfig, AutoModelForCausalLM, AutoTokenizer

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="HF repo id or local checkpoint path")
    parser.add_argument("--output", required=True, help="Path to write ONNX model")
    parser.add_argument("--seq-len", type=int, default=256, help="Max sequence length")
    parser.add_argument("--opset", type=int, default=14, help="ONNX opset version")
    parser.add_argument("--int32-inputs", action="store_true", help="Export with int32 inputs")
    args = parser.parse_args()

    print(f"Loading model: {args.model}")

    # Load config and disable complex features
    config = AutoConfig.from_pretrained(args.model)
    config.output_attentions = False
    config.output_hidden_states = False
    config.return_dict = True
    config.use_cache = False  # Critical: disable KV cache

    # Load model
    model = AutoModelForCausalLM.from_pretrained(args.model, config=config)
    model.eval()

    # Load tokenizer for vocab info
    tokenizer = AutoTokenizer.from_pretrained(args.model)

    print(f"Model loaded. Vocab size: {len(tokenizer.vocab)}")

    # Simple wrapper that returns only logits
    class LogitsOnlyLM(torch.nn.Module):
        def __init__(self, m):
            super().__init__()
            self.m = m

        def forward(self, input_ids):
            # Force disable cache and return dict
            out = self.m(input_ids=input_ids, use_cache=False, return_dict=True)
            return out.logits

    core = LogitsOnlyLM(model)

    # Create dummy inputs
    batch = 1
    seq = args.seq_len
    input_dtype = torch.int32 if args.int32_inputs else torch.int64
    ids = torch.zeros((batch, seq), dtype=input_dtype)

    # Cast wrapper for int32 inputs
    class CastInputsWrapper(torch.nn.Module):
        def __init__(self, core):
            super().__init__()
            self.core = core

        def forward(self, input_ids):
            if input_ids.dtype != torch.long:
                input_ids = input_ids.to(torch.long)
            return self.core(input_ids)

    export_module = CastInputsWrapper(core) if args.int32_inputs else core

    # Create output directory
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)

    print(f"Exporting to ONNX: {args.output}")
    print(f"Input shape: {ids.shape}, dtype: {ids.dtype}")

    # Export with minimal complexity
    with torch.no_grad():
        torch.onnx.export(
            export_module,
            ids,
            args.output,
            input_names=["input_ids"],
            output_names=["logits"],
            dynamic_axes={
                "input_ids": {0: "batch", 1: "sequence"},
                "logits": {0: "batch", 1: "sequence"}
            },
            do_constant_folding=True,
            opset_version=args.opset,
            verbose=False
        )

    print("✅ ONNX export completed")

    # Check file size
    size_mb = Path(args.output).stat().st_size / (1024 * 1024)
    print(f"📊 Model size: {size_mb:.1f} MB")

if __name__ == "__main__":
    main()