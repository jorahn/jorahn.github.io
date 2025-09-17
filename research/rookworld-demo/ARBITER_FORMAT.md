# Arbiter (Environment) Task Format Documentation

## Overview
The Arbiter/Environment task (A:) simulates chess environment dynamics, predicting the next state after a move.

## Prompt Format

```
A: [previous_state]+[action]+[recent_moves]+
```

### Components:
- **previous_state**: FEN notation of current position
- **action**: UCI move format (e.g., "e2e4", "g8f6")
- **recent_moves**: Space-separated history INCLUDING the current move (up to 10 moves)
- **+**: Delimiter between components

### Example Input:
```
A: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1+e2e4+e2e4+
```
(Starting position, move e2e4, history includes current move "e2e4")

## Expected Output Format

```
[new_state]+[reward]+[terminated]+[truncated]+
```

### Components:
- **new_state**: FEN after applying the move
- **reward**: Float value (typically 0.001 for legal moves, -1/+1 for wins)
- **terminated**: 0 or 1 (1 if game ended: checkmate, stalemate, etc.)
- **truncated**: 0 or 1 (1 if illegal move or invalid state)
- **+**: Delimiter (including final + to mark completion)

### Example Output:
```
rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1+0.001+0+0+
```

## Common Issues and Solutions

### Issue 1: Extra UCI Moves in Output
**Problem**: Model generates extra moves before the expected output format.
```
A: [fen]+e2e4++
Output: e2e4 d7d5 e4d5+[new_fen]+0.001+0+0+...
```

**Cause**: Model may be confused between policy (P:) and environment (A:) modes.

**Solution**:
- Ensure model is properly trained on A: examples
- Stop generation after the 4th "+" delimiter
- Use the `parseEnvironmentOutput` function that checks for `complete: true`

### Issue 2: Incomplete Output
**Problem**: Model doesn't generate all 4 segments.

**Solution**: Check for the `complete` flag which verifies all 4 segments + final delimiter.

### Issue 3: State Mismatch
**Problem**: Generated FEN doesn't match actual position after move.

**Solution**:
- Use chess.js to verify the actual state
- Log mismatches for debugging but continue game with chess.js state
- This is expected with current model accuracy

## Training Data Format

From RookWorld codebase (`make_dataset.py`):
```python
text = f"{previous_state}+{action}+{' '.join(recent_moves)}+{new_state}+{reward}+{int(terminated)}+{int(truncated)}"
```

With "A: " prefix added during dataset creation:
```python
def add_arbiter_prefix(ex):
    ex["text"] = f"A: {ex['text']}"
    return ex
```

## JavaScript Implementation

```javascript
// Generate environment response
// IMPORTANT: History must include the current move
const historyWithCurrent = [...previousMoves, currentMove];
const historyStr = historyWithCurrent.join(' ');
const prompt = `A: ${currentFen}+${move}+${historyStr}+`;
const result = await generateEnvironment(currentFen, move, historyStr);

// Parse output
const parseEnvironmentOutput = (text) => {
  const parts = text.split('+').filter(p => p);
  return {
    state: parts[0],
    reward: parts[1],
    termination: parts[2] === '1',
    truncation: parts[3] === '1',
    complete: text.endsWith('+') && parts.length >= 4
  };
};
```

## Notes

1. The model should stop generating after the 4th "+" delimiter
2. Move history MUST include the current move (never empty for moves after start)
3. Rewards are typically 0.001 for continuing moves, -1/+1 for game endings
4. Both terminated and truncated can be true simultaneously
5. The environment model accuracy is currently ~70-80% for state prediction