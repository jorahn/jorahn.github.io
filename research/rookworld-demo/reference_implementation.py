#!/usr/bin/env python3
"""
Reference implementation for ROOK-LM and RookWorld-LM ONNX inference

This script demonstrates the correct prompt formats and inference for:
- ROOK-LM: Policy-only model using raw FEN prompts
- RookWorld-LM: Unified model with both policy (P:) and environment (A:) capabilities

Prompt Formats:
--------------
ROOK-LM (policy only):
    Input: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    Output: "P: [FEN] M: [moves] E: [evals] B: [best_move]"

RookWorld-LM (policy):
    Input: "P: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    Output: "M: [moves] E: [evals] B: [best_move]"

RookWorld-LM (environment):
    Input: "A: [state]+[action]+[history_with_current]+""
    Output: "[new_state]+[reward]+[terminated]+[truncated]+""
    Note: History MUST include the current move being made

Example usage:
    python reference_implementation.py
"""

import os
import onnxruntime as ort
import numpy as np
from transformers import AutoTokenizer


def test_rook_lm_policy(tokenizer_path="./assets/", model_path="./assets/model_rook.onnx"):
    """Test ROOK-LM policy generation (raw FEN input)"""
    print("\n" + "="*60)
    print("Testing ROOK-LM (Policy Only)")
    print("="*60)

    # Load tokenizer and model
    tokenizer = AutoTokenizer.from_pretrained(tokenizer_path)
    session = ort.InferenceSession(model_path)

    # ROOK-LM uses raw FEN without prefix
    fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    print(f"Input FEN: {fen}")

    # Tokenize
    tokens = tokenizer(fen, add_special_tokens=False, return_tensors="np")
    generated_ids = list(tokens.input_ids[0])

    print("Generating response...")
    generated_text = ""

    for i in range(100):
        # Prepare inputs
        input_ids = np.array([generated_ids], dtype=np.int64)
        attention_mask = np.ones((1, len(generated_ids)), dtype=np.int64)
        position_ids = np.arange(0, len(generated_ids), dtype=np.int64).reshape(1, -1)

        # Run inference
        outputs = session.run(None, {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "position_ids": position_ids
        })

        # Get next token (greedy)
        logits = outputs[0]
        next_token_id = int(np.argmax(logits[0, -1, :]))
        generated_ids.append(next_token_id)

        # Decode new token
        token_text = tokenizer.decode([next_token_id])
        generated_text += token_text

        # Stop after best move
        if "B:" in generated_text and len(generated_text.split("B:")[-1]) > 5:
            break

    full_text = tokenizer.decode(generated_ids)
    print(f"\nOutput: {full_text}")

    # Parse response
    if "B:" in full_text:
        best_move = full_text.split("B:")[-1].strip().split()[0]
        print(f"Best move: {best_move}")

    return full_text


def test_rookworld_policy(tokenizer_path="./assets/", model_path="./assets/model_rookworld.onnx"):
    """Test RookWorld-LM policy generation (P: prompt)"""
    print("\n" + "="*60)
    print("Testing RookWorld-LM (Policy Task)")
    print("="*60)

    # Load tokenizer and model
    tokenizer = AutoTokenizer.from_pretrained(tokenizer_path)
    session = ort.InferenceSession(model_path)

    # RookWorld-LM policy uses "P: " prefix
    fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    prompt = f"P: {fen}"
    print(f"Input prompt: {prompt}")

    # Tokenize
    tokens = tokenizer(prompt, add_special_tokens=False, return_tensors="np")
    generated_ids = list(tokens.input_ids[0])

    print("Generating response...")
    generated_text = ""

    for i in range(100):
        # Prepare inputs
        input_ids = np.array([generated_ids], dtype=np.int64)
        attention_mask = np.ones((1, len(generated_ids)), dtype=np.int64)
        position_ids = np.arange(0, len(generated_ids), dtype=np.int64).reshape(1, -1)

        # Run inference
        outputs = session.run(None, {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "position_ids": position_ids
        })

        # Get next token (greedy)
        logits = outputs[0]
        next_token_id = int(np.argmax(logits[0, -1, :]))
        generated_ids.append(next_token_id)

        # Decode new token
        token_text = tokenizer.decode([next_token_id])
        generated_text += token_text

        # Stop after best move
        if "B:" in generated_text and len(generated_text.split("B:")[-1]) > 5:
            break

    full_text = tokenizer.decode(generated_ids)
    print(f"\nOutput: {full_text}")

    # Parse response
    if "B:" in full_text:
        best_move = full_text.split("B:")[-1].strip().split()[0]
        print(f"Best move: {best_move}")

    return full_text


def test_rookworld_environment(tokenizer_path="./assets/", model_path="./assets/model_rookworld.onnx"):
    """Test RookWorld-LM environment simulation (A: prompt)"""
    print("\n" + "="*60)
    print("Testing RookWorld-LM (Environment Task)")
    print("="*60)

    # Load tokenizer and model
    tokenizer = AutoTokenizer.from_pretrained(tokenizer_path)
    session = ort.InferenceSession(model_path)

    # Environment task format
    state = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    action = "e2e4"
    history = "e2e4"  # IMPORTANT: Include current move in history

    prompt = f"A: {state}+{action}+{history}+"
    print(f"Input prompt: {prompt}")
    print("Expected format: [new_state]+[reward]+[terminated]+[truncated]+")

    # Tokenize
    tokens = tokenizer(prompt, add_special_tokens=False, return_tensors="np")
    generated_ids = list(tokens.input_ids[0])

    print("\nGenerating response...")
    generated_text = ""
    plus_count = 0

    for i in range(150):
        # Prepare inputs
        input_ids = np.array([generated_ids], dtype=np.int64)
        attention_mask = np.ones((1, len(generated_ids)), dtype=np.int64)
        position_ids = np.arange(0, len(generated_ids), dtype=np.int64).reshape(1, -1)

        # Run inference
        outputs = session.run(None, {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "position_ids": position_ids
        })

        # Get next token (greedy)
        logits = outputs[0]
        next_token_id = int(np.argmax(logits[0, -1, :]))
        generated_ids.append(next_token_id)

        # Decode new token
        token_text = tokenizer.decode([next_token_id])
        generated_text += token_text

        # Count '+' delimiters to know when to stop
        if token_text == "+":
            plus_count += 1
            if plus_count >= 4:  # Stop after truncated field
                break

    full_text = tokenizer.decode(generated_ids)
    print(f"\nOutput: {full_text}")

    # Parse environment output
    output_only = full_text.replace(prompt, "").strip()
    parts = output_only.split("+")

    if len(parts) >= 4:
        print(f"\nParsed environment output:")
        print(f"  New state: {parts[0]}")
        print(f"  Reward: {parts[1]}")
        print(f"  Terminated: {parts[2]}")
        print(f"  Truncated: {parts[3]}")

    return full_text


if __name__ == "__main__":
    print("ROOK-LM and RookWorld-LM Reference Implementation")
    print("="*60)

    # Check for models
    rook_model = "./assets/model_rook.onnx"
    rookworld_model = "./assets/model_rookworld.onnx"

    if os.path.exists(rook_model):
        print(f"✓ Found ROOK-LM model: {rook_model}")
    else:
        print(f"✗ ROOK-LM model not found: {rook_model}")

    if os.path.exists(rookworld_model):
        print(f"✓ Found RookWorld-LM model: {rookworld_model}")
    else:
        print(f"✗ RookWorld-LM model not found: {rookworld_model}")

    # Test available models
    if os.path.exists(rook_model):
        test_rook_lm_policy()

    if os.path.exists(rookworld_model):
        test_rookworld_policy()
        test_rookworld_environment()

    if not os.path.exists(rook_model) and not os.path.exists(rookworld_model):
        print("\nNo models found. To export models:")
        print("  python scripts/export_simple_onnx.py")