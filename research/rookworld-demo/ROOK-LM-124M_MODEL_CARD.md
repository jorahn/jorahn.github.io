# ROOK-LM-124M

A 124M parameter language model trained for chess move generation with chain-of-thought reasoning. Part of the ROOK project (Reasoning Over Organized Knowledge) developed in collaboration with LAION.

## Model Details

### Model Description

ROOK-LM-124M is a GPT-2 based language model specifically trained for chess move generation with transparent reasoning traces. The model generates candidate moves, evaluates them, and selects the best move using a chain-of-thought approach without requiring search algorithms.

- **Developed by:** Jonathan Rahn, Jenia Jitsev (LAION/JSC), Qi Sun (Tokyo Tech/Sakana AI)
- **Model type:** Decoder-only Transformer (GPT-2 architecture)
- **Parameters:** 124M
- **Language:** Chess notation (FEN, UCI move format)
- **License:** MIT
- **Research:** [LAION Blog: ROOK](https://laion.ai/notes/rook/)
- **Demo:** [Interactive Demo](https://jorahn.github.io/research/rookworld-demo/)
- **Repository:** [GitHub](https://github.com/jorahn/RookWorld)

### Model Sources

- **Repository:** [GitHub - RookWorld](https://github.com/jorahn/RookWorld)
- **Paper:** [LAION Research Note](https://laion.ai/notes/rook/)
- **Demo:** [Interactive Web Demo](https://jorahn.github.io/research/rookworld-demo/)

## Uses

### Direct Use

The model is designed for:
- Chess move generation with reasoning
- Position analysis
- Chess education and research
- AI reasoning studies

### Input/Output Format

#### Input Format
- **Format:** Raw FEN string (NO prefix required)
- **Example:** `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`

#### Output Format
The model generates a complete response including the input:
```
P: [FEN] M: [moves] E: [evaluations] B: [best_move]
```

Where:
- `P:` The input position (added by model)
- `M:` List of candidate moves in UCI format
- `E:` Evaluation scores for each candidate
- `B:` Selected best move

### Example

**Input:**
```
rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
```

**Output:**
```
P: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 M: e2e4 d2d4 g1f3 c2c4 g2g3 E: 0.3 0.3 0.2 0.1 0.0 B: e2e4
```

### Code Example

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

# Load model and tokenizer
model = AutoModelForCausalLM.from_pretrained("jrahn/ROOK-LM-124M")
tokenizer = AutoTokenizer.from_pretrained("jrahn/ROOK-LM-124M")

# Input: raw FEN without prefix
fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
inputs = tokenizer(fen, return_tensors="pt")

# Generate with recommended parameters
outputs = model.generate(
    **inputs,
    max_new_tokens=144,
    temperature=0.2,
    top_k=10,
    do_sample=True,
    pad_token_id=tokenizer.eos_token_id
)

response = tokenizer.decode(outputs[0], skip_special_tokens=True)
print(response)

# Parse the output
import re
# Extract best move
best_move_match = re.search(r'B:\s*([a-h][1-8][a-h][1-8][qrbn]?)', response)
if best_move_match:
    best_move = best_move_match.group(1)
    print(f"Best move: {best_move}")

# Extract all candidate moves
moves_match = re.search(r'M:\s*([^E]*)', response)
if moves_match:
    moves = moves_match.group(1).strip().split()
    print(f"Candidates: {moves}")
```

### Out-of-Scope Use

The model should not be used for:
- Competitive chess playing without additional verification
- Time-sensitive tournament play
- Safety-critical applications

## Bias, Risks, and Limitations

### Limitations

- **No deep search:** Single-step lookahead only
- **Limited tactical ability:** May miss complex combinations
- **Context window:** 2048 tokens maximum
- **Training data bias:** Primarily trained on strong player games

### Recommendations

- Verify moves with a chess engine for critical applications
- Use temperature sampling (0.2) for better performance
- Consider ensemble with other models for improved accuracy

## Training Details

### Training Data

Trained on multiple chess datasets:
- **ROOK-40M:** 40 million chess positions with Stockfish annotations
- Human games from Lichess
- Computer self-play games
- All positions include chain-of-thought annotations from Stockfish

### Training Procedure

- **Architecture:** GPT-2 (124M parameters)
- **Training Framework:** llm.c
- **Hardware:** NVIDIA GPUs
- **Training time:** ~3 days on 8x A100
- **Batch size:** 64
- **Learning rate:** 6e-4 with cosine schedule
- **Epochs:** 3

## Evaluation

### Metrics

| Metric | Score |
|--------|-------|
| Action Accuracy | 22.2% |
| Checkmate-in-One (BIG-bench) | 24.4% |
| Top-5 Move Accuracy | 39.6% |
| Self-play Legal Moves | 41.4 half-moves |

### Comparison

Compared to larger models:
- Outperforms many larger general-purpose LLMs on chess tasks
- Comparable performance to specialized chess models with fewer parameters
- Efficient inference suitable for browser deployment

## Environmental Impact

- **Hardware Type:** NVIDIA A100 GPUs
- **Hours used:** ~72 hours total
- **Cloud Provider:** Academic cluster
- **Carbon Emitted:** Estimated <50 kg CO2

## Technical Specifications

### Model Architecture

- **Architecture:** Decoder-only Transformer (GPT-2)
- **Parameters:** 124M
- **Layers:** 12
- **Hidden size:** 768
- **Attention heads:** 12
- **Context length:** 2048 tokens
- **Vocabulary size:** 128

### Compute Infrastructure

- Training on NVIDIA A100 GPUs
- Inference optimized for CPU/WebAssembly (browser demo)
- ONNX export available for deployment

## Citation

If you use this model, please cite:

```bibtex
@article{rahn2024rook,
  title={ROOK: Reasoning Over Organized Knowledge},
  author={Rahn, Jonathan and Jitsev, Jenia and Sun, Qi},
  journal={LAION Blog},
  year={2024},
  url={https://laion.ai/notes/rook/}
}
```

## Model Card Contact

- **Author:** Jonathan Rahn
- **Email:** See GitHub profile
- **GitHub:** [@jorahn](https://github.com/jorahn)

## Additional Information

### Related Models
- [RookWorld-LM-124M](https://huggingface.co/jrahn/RookWorld-LM-124M) - Unified policy + environment model
- [ROOK-CLF-9M](https://huggingface.co/jrahn/ROOK-CLF-9M) - Classification approach

### Updates
- 2024-12: Added interactive web demo
- 2024-11: Released model and datasets
- 2024-10: Published LAION research note