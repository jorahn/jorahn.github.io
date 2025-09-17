#!/usr/bin/env python3
"""
Compare tokenization between Python and what JavaScript should produce.
This helps debug tokenization mismatches.
"""

from transformers import GPT2TokenizerFast

def analyze_tokenization():
    """Analyze the exact tokenization for our test prompts."""

    tokenizer = GPT2TokenizerFast.from_pretrained('./temp_models/RookWorld-LM-124M')

    # Test the exact prompt that JavaScript is using
    test_prompts = [
        # What RookWorld-LM should receive according to our logic
        "P: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 ",
        # What ROOK-LM should receive
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    ]

    for prompt in test_prompts:
        print("=" * 80)
        print(f"Prompt: '{prompt}'")
        print(f"Length: {len(prompt)}")
        print(f"Ends with space: {prompt.endswith(' ')}")

        # Tokenize without special tokens (like our JS code)
        tokens = tokenizer.encode(prompt, add_special_tokens=False)
        print(f"Tokens: {tokens}")
        print(f"Token count: {len(tokens)}")

        # With EOT prefix (like our JS code does)
        tokens_with_eot = [tokenizer.eos_token_id] + tokens
        print(f"With EOT: {tokens_with_eot}")
        print(f"Total tokens: {len(tokens_with_eot)}")

        # Show first 10 token IDs and their text
        print("First 10 tokens:")
        for i, token_id in enumerate(tokens_with_eot[:10]):
            token_text = tokenizer.decode([token_id])
            print(f"  {i}: {token_id} -> '{token_text}'")

        # Decode back to verify
        decoded = tokenizer.decode(tokens, skip_special_tokens=True)
        print(f"Decoded back: '{decoded}'")
        print(f"Roundtrip OK: {decoded == prompt}")

def test_individual_tokens():
    """Test individual token decoding to debug streaming."""

    tokenizer = GPT2TokenizerFast.from_pretrained('./temp_models/RookWorld-LM-124M')

    # Common tokens we expect to see
    test_tokens = [
        50256,  # <|endoftext|>
        47,     # 'P'
        25,     # ':'
        220,    # ' ' (space)
        44,     # 'M'
        68,     # 'e'
        17,     # '2'
        68,     # 'e'
        19,     # '4'
    ]

    print("\nIndividual token test:")
    for token_id in test_tokens:
        try:
            text = tokenizer.decode([token_id], skip_special_tokens=True)
            print(f"Token {token_id}: '{text}' (repr: {repr(text)})")
        except Exception as e:
            print(f"Token {token_id}: ERROR - {e}")

if __name__ == "__main__":
    analyze_tokenization()
    test_individual_tokens()