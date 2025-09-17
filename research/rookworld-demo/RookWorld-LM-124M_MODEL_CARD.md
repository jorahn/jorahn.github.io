# RookWorld-LM-124M

A unified 124M parameter transformer model that combines chess policy (move generation) and environment simulation (world model) capabilities in a single architecture. Winner of key benchmarks, outperforming ChessGPT-Base with 24x fewer parameters.

## Model Details

### Model Description

RookWorld-LM-124M represents a breakthrough in unified agent-environment modeling for strategic reasoning. This single transformer can both play chess (policy mode) and simulate the chess environment (arbiter mode), enabling closed-loop self-play without external engines.

- **Developed by:** Jonathan Rahn, Jenia Jitsev (LAION/JSC), Qi Sun (Tokyo Tech/Sakana AI)
- **Model type:** Unified Policy + World Model Transformer (GPT-2 architecture)
- **Parameters:** 124M
- **Language:** Chess notation (FEN, UCI move format)
- **License:** MIT
- **Research:** [LAION Blog: ROOK](https://laion.ai/notes/rook/)
- **Demo:** [Interactive Demo](https://jorahn.github.io/research/rookworld-demo/)
- **Repository:** [GitHub](https://github.com/jorahn/RookWorld)

### Key Achievements

🏆 **32.1% Checkmate-in-One accuracy** - Outperforms ChessGPT-Base (26.5%) with 24x fewer parameters (124M vs 3B, Feng et al. NeurIPS'23)

### Model Sources

- **Repository:** [GitHub - RookWorld](https://github.com/jorahn/RookWorld)
- **Paper:** [LAION Research Note](https://laion.ai/notes/rook/)
- **Demo:** [Interactive Web Demo](https://jorahn.github.io/research/rookworld-demo/)
- **Dataset:** [rookworld_7m](https://huggingface.co/datasets/jrahn/rookworld_7m)

## Uses

### Direct Use

The model operates in two modes:

1. **Policy Mode:** Chess move generation with reasoning
2. **Environment Mode:** Chess state simulation and validation

### Applications

- Self-play chess without external engines
- Chess position analysis
- Environment dynamics learning
- Research on unified agent-environment models
- Educational chess tools

## Input/Output Formats

### Policy Mode (Chess Playing)

#### Input Format
- **Format:** `P: [FEN]` (with space after colon)
- **Example:** `P: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`

#### Output Format
```
M: [candidate_moves] E: [evaluations] B: [best_move]
```

Where:
- `M:` List of candidate moves in UCI format
- `E:` Evaluation scores for each candidate
- `B:` Selected best move

#### Example
**Input:**
```
P: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
```

**Output:**
```
M: e2e4 d2d4 g1f3 c2c4 g2g3 E: 0.3 0.3 0.2 0.1 0.0 B: e2e4
```

### Environment Mode (Chess Simulation)

#### Input Format
- **Format:** `A: [state]+[action]+[history]+`
- **CRITICAL:** History MUST include the current move being made, not just previous moves
- **Example:** `A: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1+e2e4+e2e4+`
  - Note: `e2e4` appears as both the action AND in the history

#### Output Format
```
[new_state]+[reward]+[terminated]+[truncated]+
```

Where:
- `new_state`: FEN after the move
- `reward`: Float (typically 0.001 for legal moves, -1/+1 for game end)
- `terminated`: 0 or 1 (game ended)
- `truncated`: 0 or 1 (illegal move)

#### Example
**Input:**
```
A: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1+e2e4+e2e4+
```

**Output:**
```
rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1+0.001+0+0+
```

## Code Examples

### Policy Mode (Chess Playing)

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch
import re

# Load model and tokenizer
model = AutoModelForCausalLM.from_pretrained("jrahn/RookWorld-LM-124M")
tokenizer = AutoTokenizer.from_pretrained("jrahn/RookWorld-LM-124M")

# Policy Mode - Chess Playing
policy_prompt = "P: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
inputs = tokenizer(policy_prompt, return_tensors="pt")

outputs = model.generate(
    **inputs,
    max_new_tokens=144,
    temperature=0.2,
    top_k=10,
    do_sample=True,
    pad_token_id=tokenizer.eos_token_id
)

response = tokenizer.decode(outputs[0], skip_special_tokens=True)
print("Policy response:", response)

# Extract best move
best_move_match = re.search(r'B:\s*([a-h][1-8][a-h][1-8][qrbn]?)', response)
if best_move_match:
    best_move = best_move_match.group(1)
    print(f"Best move: {best_move}")
```

### Environment Mode (State Simulation)

```python
# Environment Mode - Chess World Model
current_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
move = "e2e4"
previous_moves = []  # Empty for first move

# CRITICAL: Include current move in history
history_with_current = previous_moves + [move]
history_str = ' '.join(history_with_current)

env_prompt = f"A: {current_fen}+{move}+{history_str}+"
inputs = tokenizer(env_prompt, return_tensors="pt")

outputs = model.generate(
    **inputs,
    max_new_tokens=100,
    temperature=0.2,
    top_k=10,
    do_sample=True,
    pad_token_id=tokenizer.eos_token_id
)

response = tokenizer.decode(outputs[0], skip_special_tokens=True)
print("Environment response:", response)

# Parse environment output
# Remove prompt and split by '+'
output_only = response.replace(env_prompt, '').strip()
parts = output_only.split('+')

if len(parts) >= 4:
    new_state = parts[0]
    reward = float(parts[1]) if parts[1] else 0.0
    terminated = parts[2] == '1'
    truncated = parts[3] == '1'

    print(f"New state: {new_state}")
    print(f"Reward: {reward}")
    print(f"Game ended: {terminated}")
    print(f"Invalid move: {truncated}")
```

### Self-Play Example

```python
import chess

def play_game_with_rookworld(model, tokenizer, max_moves=100):
    """Play a self-play game using RookWorld-LM"""
    board = chess.Board()
    move_history = []

    for move_num in range(max_moves):
        # Get current position
        fen = board.fen()

        # Generate move using policy mode
        policy_prompt = f"P: {fen}"
        inputs = tokenizer(policy_prompt, return_tensors="pt")

        outputs = model.generate(
            **inputs,
            max_new_tokens=144,
            temperature=0.2,
            top_k=10,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id
        )

        response = tokenizer.decode(outputs[0], skip_special_tokens=True)

        # Extract best move
        best_move_match = re.search(r'B:\s*([a-h][1-8][a-h][1-8][qrbn]?)', response)
        if not best_move_match:
            print(f"No valid move found at move {move_num}")
            break

        uci_move = best_move_match.group(1)

        # Validate and make move
        try:
            move = chess.Move.from_uci(uci_move)
            if move in board.legal_moves:
                board.push(move)
                move_history.append(uci_move)
                print(f"Move {move_num + 1}: {uci_move}")
            else:
                print(f"Illegal move attempted: {uci_move}")
                break
        except:
            print(f"Invalid move format: {uci_move}")
            break

        # Check game end
        if board.is_game_over():
            result = board.result()
            print(f"Game over: {result}")
            break

    return board, move_history

# Run self-play
board, history = play_game_with_rookworld(model, tokenizer)
print(f"Game lasted {len(history)} moves")
```

## Important Implementation Notes

### Critical Details

1. **History Format for Environment Mode:**
   ```python
   # CORRECT - Include current move in history
   history_with_current = previous_moves + [current_move]
   history_str = ' '.join(history_with_current)

   # INCORRECT - Missing current move
   history_str = ' '.join(previous_moves)  # Will not work!
   ```

2. **Stopping Conditions:**
   - Policy mode: Stop after `B:` pattern with move
   - Environment mode: Stop after 4th `+` delimiter
   - Watch for mode switching (if `A:` appears during policy generation)

3. **Recommended Generation Parameters:**
   - Temperature: 0.2 (balanced diversity/quality)
   - Top-k: 10 (focused sampling)
   - Max tokens: 144 for policy, 100 for environment

## Performance

### Benchmarks

| Metric | RookWorld-LM | Comparison |
|--------|--------------|------------|
| **Checkmate-in-One** | **32.1%** | ChessGPT-Base: 26.5% (3B params) |
| Action Accuracy | 26.2% | ChessGPT-Base: comparable |
| Environment State Accuracy | 99.6% | N/A - unique capability |
| Self-play Legal Moves | 36+ half-moves | ROOK-LM: 41 half-moves |
| Parameters | 124M | ChessGPT: 3B (24x larger) |

### Multi-task Performance

The model successfully handles both policy and environment tasks:
- **Policy Performance:** Competitive with specialized chess models
- **Environment Performance:** 99.6% state prediction accuracy
- **Unified Benefit:** Enables closed-loop self-improvement

## Training Details

### Training Data

Trained on 7M samples combining:
- **5M Policy samples:** Chess positions with chain-of-thought from Stockfish
- **2M Environment samples:** State transitions from self-play rollouts
- **Data format:** Interleaved policy (P:) and environment (A:) examples

### Training Procedure

- **Architecture:** GPT-2 (124M parameters)
- **Training Framework:** llm.c
- **Hardware:** 8x NVIDIA A100 GPUs
- **Training time:** ~4 days
- **Batch size:** 64
- **Learning rate:** 6e-4 with cosine schedule
- **Epochs:** 3

## Limitations

### Known Limitations

1. **No deep search:** Single-step lookahead only
2. **Limited tactical ability:** May miss complex combinations
3. **Context window:** 2048 tokens maximum
4. **Environment accuracy:** ~99.6% accurate but not perfect

### Recommendations

- Use temperature=0.2 for best results
- Verify critical moves with external engine
- For tournaments, use with search augmentation
- Monitor for mode confusion (P: vs A:)

## Environmental Impact

- **Hardware Type:** NVIDIA A100 GPUs
- **Hours used:** ~96 hours total
- **Cloud Provider:** Academic cluster
- **Carbon Emitted:** Estimated <100 kg CO2

## Citation

```bibtex
@article{rahn2024rookworld,
  title={RookWorld: A Unified Chess Agent and Environment Model},
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
- **Website:** [jorahn.github.io](https://jorahn.github.io)

## Additional Information

### Why Unified Modeling Matters

RookWorld-LM demonstrates that a single transformer can learn both agent and environment dynamics, opening new possibilities for:
- Self-improvement through self-play
- Reduced system complexity
- Better generalization through multi-task learning
- Efficient deployment (one model vs two)

### Related Resources

- **Models:**
  - [ROOK-LM-124M](https://huggingface.co/jrahn/ROOK-LM-124M) - Policy-only model
  - [ROOK-CLF-9M](https://huggingface.co/jrahn/ROOK-CLF-9M) - Classification approach

- **Datasets:**
  - [rookworld_7m](https://huggingface.co/datasets/jrahn/rookworld_7m) - Combined training data
  - [rook-40m](https://huggingface.co/datasets/lfsm/rook-40m) - Large-scale policy data
  - [arbiter_2m](https://huggingface.co/datasets/jrahn/arbiter_2m) - Environment data

### Version History

- **2024-12:** Added interactive web demo with streaming inference
- **2024-11:** Released unified model achieving 32.1% checkmate-in-one
- **2024-10:** Published LAION research note
- **2024-09:** Initial RookWorld architecture development