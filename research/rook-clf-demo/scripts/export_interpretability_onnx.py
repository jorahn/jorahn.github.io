#!/usr/bin/env python3
"""
Export ROOK-CLF to ONNX with interpretability-friendly outputs.

Adds the following outputs without retraining:
 - logits: [batch, num_labels]
 - decision_hidden: [batch, hidden]  (hidden state for decision token)
 - classifier_weight: [hidden, num_labels] (transpose of the linear head)
 - attentions: [layers, batch, heads, seq, seq]
 - hidden_states: [layers+1, batch, seq, hidden]

Notes
 - This export keeps the original model graph (int64 token indices). It runs on WASM and WebGPU.
 - WebGL is not supported due to int64 ops in the graph (ORT WebGL limitation).
 - You can optionally export with int32 inputs (they will be cast to int64 inside the graph).

Usage
  python export_interpretability_onnx.py \
      --model jrahn/ROOK-CLF-9m \
      --output ./ROOK-CLF-9m-interpretability.onnx \
      --seq-len 78 \
      --int32-inputs

Or from a local checkpoint directory:
  python export_interpretability_onnx.py --model /path/to/checkpoint --output ./out.onnx
"""

import argparse
from pathlib import Path

import torch
from transformers import AutoConfig, AutoModelForSequenceClassification, AutoTokenizer


class InterpretabilityWrapper(torch.nn.Module):
    """Wraps a HF classifier to expose logits, decision token hidden state,
    classifier weight, attentions and hidden states as ONNX outputs."""

    def __init__(self, model: AutoModelForSequenceClassification, decision_token: str = "[CLS]"):
        super().__init__()
        self.model = model
        # Identify classification head weight (hidden -> num_labels)
        # For LlamaForSequenceClassification this is model.score.weight [num_labels, hidden]
        self.register_buffer("W_cls_T", model.score.weight.T.detach())  # [hidden, num_labels]
        # Decision token settings
        self.decision_token = decision_token

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor):
        outputs = self.model(
            input_ids=input_ids,
            attention_mask=attention_mask,
            output_attentions=True,
            output_hidden_states=True,
            return_dict=True,
        )
        # logits [B, C]
        logits = outputs.logits
        # hidden states: tuple(len=L+1) of [B, S, H]
        hidden_states = outputs.hidden_states
        # attentions: tuple(len=L) of [B, heads, S, S]
        attentions = outputs.attentions

        # Decision token: assume it is the last token in sequence for this model
        # If you pool differently, adapt here (e.g., first token or mean pooling)
        last_hidden = hidden_states[-1]  # [B, S, H]
        decision_hidden = last_hidden[:, -1, :]  # [B, H]

        # Stack lists into fixed-rank tensors for ONNX outputs
        attn_stack = torch.stack(attentions, dim=0)  # [L, B, heads, S, S]
        hs_stack = torch.stack(hidden_states, dim=0)  # [L+1, B, S, H]

        # classifier weight [H, C]
        W = self.W_cls_T  # already transposed

        return logits, decision_hidden, W, attn_stack, hs_stack


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="HF repo id or local checkpoint path")
    parser.add_argument("--output", required=True, help="Path to write ONNX model")
    parser.add_argument("--seq-len", type=int, default=78, help="Sequence length (e.g., 78 for ROOK-CLF)")
    parser.add_argument("--opset", type=int, default=15, help="ONNX opset version")
    parser.add_argument("--int32-inputs", action="store_true", help="Export with int32 inputs (cast to int64 internally)")
    args = parser.parse_args()

    print(f"Loading model: {args.model}")
    config = AutoConfig.from_pretrained(args.model)
    config.output_attentions = True
    config.output_hidden_states = True
    config.return_dict = True
    # Ensure eager attention implementation (no SDPA) for cleaner export
    try:
        config.attn_implementation = "eager"
    except Exception:
        pass

    model = AutoModelForSequenceClassification.from_pretrained(args.model, config=config)
    model.eval()

    wrapper = InterpretabilityWrapper(model)

    batch = 1
    seq = args.seq_len
    input_dtype = torch.int32 if args.int32_inputs else torch.int64
    ids = torch.zeros((batch, seq), dtype=input_dtype)
    mask = torch.ones((batch, seq), dtype=input_dtype)

    dynamic_axes = {
        "input_ids": {0: "batch", 1: "sequence"},
        "attention_mask": {0: "batch", 1: "sequence"},
        "logits": {0: "batch"},
        "decision_hidden": {0: "batch"},
        # attentions: [L, B, H, S, S] (L,H fixed by config; B,S dynamic)
        "attentions": {1: "batch", 3: "sequence", 4: "sequence"},
        # hidden_states: [L+1, B, S, H]
        "hidden_states": {1: "batch", 2: "sequence"},
    }

    output_names = [
        "logits",
        "decision_hidden",
        "classifier_weight",
        "attentions",
        "hidden_states",
    ]

    print(f"Exporting to ONNX: {args.output}")
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)

    with torch.no_grad():
        # If int32 inputs requested, cast to long inside traced graph for embedding
        class CastInputsWrapper(torch.nn.Module):
            def __init__(self, core):
                super().__init__()
                self.core = core

            def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor):
                if input_ids.dtype != torch.long:
                    input_ids = input_ids.to(torch.long)
                if attention_mask.dtype != torch.long:
                    attention_mask = attention_mask.to(torch.long)
                return self.core(input_ids, attention_mask)

        export_module = CastInputsWrapper(wrapper) if args.int32_inputs else wrapper

        # Use legacy torch.onnx.export (more stable across versions)
        print("Exporting with legacy torch.onnx.export")
        torch.onnx.export(
            export_module,
            (ids, mask),
            args.output,
            input_names=["input_ids", "attention_mask"],
            output_names=output_names,
            dynamic_axes=dynamic_axes,
            do_constant_folding=False,
            opset_version=args.opset,
        )

    print("Done. Outputs:")
    for name in output_names:
        print(" -", name)


if __name__ == "__main__":
    main()
