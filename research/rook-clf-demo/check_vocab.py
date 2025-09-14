#!/usr/bin/env python3
import json

# Load our demo tokenizer
with open('model/ROOK-CLF-9m-transformersjs/tokenizer.json', 'r') as f:
    tokenizer = json.load(f)

demo_vocab = tokenizer['model']['vocab']

# Research vocab from const.py
research_vocab = ["-", ".", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "B", "K", "N", "P", "Q", "R", "a", "b", "c", "d", "e", "f", "g", "h", "k", "n", "p", "q", "r", "w"]

print("=== VOCABULARY COMPARISON ===")
print(f"Research vocab length: {len(research_vocab)}")
print(f"Demo vocab length: {len(demo_vocab)}")

print("\nResearch vocab (first 32):")
for i, token in enumerate(research_vocab):
    print(f'{i:2d}: "{token}"')

print("\nDemo vocab (first 36):")
for token, id in sorted(demo_vocab.items(), key=lambda x: x[1]):
    if id < 36:
        print(f'{id:2d}: "{token}"')

print("\n=== DIFFERENCES ===")
# Check if vocabs match
research_vocab_dict = {token: i for i, token in enumerate(research_vocab)}

differences = []
for token, demo_id in demo_vocab.items():
    if token in research_vocab_dict:
        research_id = research_vocab_dict[token]
        if demo_id != research_id:
            differences.append(f'Token "{token}": demo={demo_id}, research={research_id}')
    else:
        if demo_id < 32:  # Only care about core vocab differences
            differences.append(f'Token "{token}": demo={demo_id}, NOT in research vocab')

for diff in differences:
    print(diff)

if not differences:
    print("✅ Core vocabularies match!")
else:
    print(f"❌ Found {len(differences)} differences in core vocabulary")