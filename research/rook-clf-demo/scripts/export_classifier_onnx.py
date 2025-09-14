#!/usr/bin/env python3
"""
Export ROOK-CLF to ONNX (classifier-only) with optional int32 inputs for WebGPU.

Outputs:
 - logits: [batch, num_labels]

This preserves the original forward pass (no attentions/hidden states) for efficiency.

Usage
  python export_classifier_onnx.py \
      --model jrahn/ROOK-CLF-9m \
      --output ./ROOK-CLF-9m-webgpu.onnx \
      --seq-len 78 \
      --int32-inputs
"""

import argparse
from pathlib import Path

import torch
from transformers import AutoConfig, AutoModelForSequenceClassification


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="HF repo id or local checkpoint path")
    parser.add_argument("--output", required=True, help="Path to write ONNX model")
    parser.add_argument("--seq-len", type=int, default=78, help="Sequence length (e.g., 78 for ROOK-CLF)")
    parser.add_argument("--opset", type=int, default=17, help="ONNX opset version")
    parser.add_argument("--int32-inputs", action="store_true", help="Export with int32 inputs (cast to int64 internally)")
    args = parser.parse_args()

    print(f"Loading model: {args.model}")
    config = AutoConfig.from_pretrained(args.model)
    config.output_attentions = False
    config.output_hidden_states = False
    config.return_dict = True

    model = AutoModelForSequenceClassification.from_pretrained(args.model, config=config)
    model.eval()

    # Simple module that returns logits only
    class LogitsOnly(torch.nn.Module):
        def __init__(self, m):
            super().__init__()
            self.m = m
        def forward(self, input_ids, attention_mask):
            out = self.m(input_ids=input_ids, attention_mask=attention_mask, return_dict=True)
            return out.logits

    core = LogitsOnly(model)

    batch = 1
    seq = args.seq_len
    input_dtype = torch.int32 if args.int32_inputs else torch.int64
    ids = torch.zeros((batch, seq), dtype=input_dtype)
    mask = torch.ones((batch, seq), dtype=input_dtype)

    # Cast wrapper to keep graph inputs int32, but ensure embeddings use int64
    class CastInputsWrapper(torch.nn.Module):
        def __init__(self, core):
            super().__init__()
            self.core = core
        def forward(self, input_ids, attention_mask):
            if input_ids.dtype != torch.long:
                input_ids = input_ids.to(torch.long)
            if attention_mask.dtype != torch.long:
                attention_mask = attention_mask.to(torch.long)
            return self.core(input_ids, attention_mask)

    export_module = CastInputsWrapper(core) if args.int32_inputs else core

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    print(f"Exporting to ONNX: {args.output}")
    torch.onnx.export(
        export_module,
        (ids, mask),
        args.output,
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "sequence"},
            "attention_mask": {0: "batch", 1: "sequence"},
            "logits": {0: "batch"}
        },
        do_constant_folding=True,
        opset_version=args.opset,
    )
    print("Done.")


if __name__ == "__main__":
    main()

