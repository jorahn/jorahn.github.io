# Recommended Updates for HuggingFace Model Cards

## ROOK-LM-124M Model Card Updates

### Current Usage Section Should Include:

```markdown
## Usage

### Input Format
- **Format**: Raw FEN string (NO prefix required)
- **Example**: `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`

### Output Format
The model generates a complete response including the input:
```
P: [FEN] M: [moves] E: [evaluations] B: [best_move]
```

### Important Notes
- Do NOT add "P:" prefix to input - model expects raw FEN only
- Model will include the "P:" prefix in its output
- Best results with temperature 0.2 and top-k 10 for sampling

### Example Code
```python
from transformers import AutoModelForCausalLM, AutoTokenizer

model = AutoModelForCausalLM.from_pretrained("jrahn/ROOK-LM-124M")
tokenizer = AutoTokenizer.from_pretrained("jrahn/ROOK-LM-124M")

# Input: raw FEN without prefix
fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
inputs = tokenizer(fen, return_tensors="pt")

outputs = model.generate(
    **inputs,
    max_new_tokens=144,
    temperature=0.2,
    top_k=10,
    do_sample=True
)

response = tokenizer.decode(outputs[0], skip_special_tokens=True)
# Output: "P: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 M: e2e4 d2d4 g1f3 ... E: 0.3 0.2 0.1 ... B: e2e4"
```
```

## RookWorld-LM-124M Model Card Updates

### Current Usage Section Should Include:

```markdown
## Usage

### Policy Mode (Chess Playing)

#### Input Format
- **Format**: `P: [FEN]` (with space after colon)
- **Example**: `P: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`

#### Output Format
```
M: [candidate_moves] E: [evaluations] B: [best_move]
```

### Environment Mode (Chess Simulation)

#### Input Format
- **Format**: `A: [state]+[action]+[history]+`
- **CRITICAL**: History MUST include the current move being made, not just previous moves
- **Example**: `A: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1+e2e4+e2e4+`
  - Note: `e2e4` appears as both the action AND in the history

#### Output Format
```
[new_state]+[reward]+[terminated]+[truncated]+
```
- **new_state**: FEN after the move
- **reward**: Float (typically 0.001 for legal moves, -1/+1 for game end)
- **terminated**: 0 or 1 (game ended)
- **truncated**: 0 or 1 (illegal move)

### Important Implementation Notes

1. **History Format**: For environment mode, always include the current move in the history:
   ```python
   # Correct
   history_with_current = previous_moves + [current_move]
   history_str = ' '.join(history_with_current)

   # Incorrect
   history_str = ' '.join(previous_moves)  # Missing current move!
   ```

2. **Stopping Conditions**:
   - Policy mode: Stop after `B:` pattern with move
   - Environment mode: Stop after 4th `+` delimiter
   - If model generates `A:` during policy mode, stop immediately

3. **Sampling Parameters**:
   - Recommended: temperature=0.2, top_k=10
   - Greedy decoding (temperature=0) also works but less diverse

### Example Code

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

model = AutoModelForCausalLM.from_pretrained("jrahn/RookWorld-LM-124M")
tokenizer = AutoTokenizer.from_pretrained("jrahn/RookWorld-LM-124M")

# Policy Mode
policy_prompt = "P: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
inputs = tokenizer(policy_prompt, return_tensors="pt")

outputs = model.generate(
    **inputs,
    max_new_tokens=144,
    temperature=0.2,
    top_k=10,
    do_sample=True,
    # Custom stopping: look for "B:" pattern
)

response = tokenizer.decode(outputs[0], skip_special_tokens=True)
# Extract move after "B:"
import re
best_move_match = re.search(r'B:\s*([a-h][1-8][a-h][1-8][qrbn]?)', response)
best_move = best_move_match.group(1) if best_move_match else None

# Environment Mode
current_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
move = "e2e4"
previous_moves = []  # Empty for first move
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
    # Stop after 4 segments (state+reward+terminated+truncated+)
)

response = tokenizer.decode(outputs[0], skip_special_tokens=True)
# Parse environment output
parts = response.split('+')
new_state = parts[0] if len(parts) > 0 else None
reward = parts[1] if len(parts) > 1 else None
terminated = parts[2] == '1' if len(parts) > 2 else False
truncated = parts[3] == '1' if len(parts) > 3 else False
```

### Common Pitfalls to Avoid

1. **Wrong prefix format**: Don't forget the space after `P:` or `A:`
2. **Missing current move in history**: Environment mode requires current move in history
3. **Not stopping generation properly**: Model may continue generating next task
4. **Wrong model for task**: ROOK-LM doesn't support environment mode

### Performance Notes

- **Checkmate-in-one accuracy**: 32.1% (outperforms ChessGPT-Base 26.5% with 24x fewer parameters)
- **Action accuracy**: 26.2% on validation set
- **Self-play**: Average 36+ legal half-moves before illegal move
- **Environment accuracy**: 99.6% next state accuracy
```