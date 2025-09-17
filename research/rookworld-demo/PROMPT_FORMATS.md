# Prompt Format Documentation

## Critical Discovery: Different Models Require Different Formats

After extensive testing, we've discovered that **ROOK-LM and RookWorld-LM require different prompt formats**:

### ROOK-LM-124M
- **Format**: Raw FEN only (no prefix)
- **Example**: `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`
- **Output**: Generates full P: M: E: B: format

### RookWorld-LM-124M
- **Format**: `P: [FEN]` or `P: [FEN] ` (with or without trailing space)
- **Example**: `P: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`
- **Output**: Adds padding automatically, then generates M: E: B: sections
- **Environment Mode**: `A: [FEN]+[action]+[history]+`

### Important Notes

1. **DO NOT** use the training format with padding to column 92 - this causes both models to fail
2. The models handle their own internal padding/formatting
3. RookWorld-LM is a unified model supporting both policy (P:) and environment (A:) modes

## Test Results

### ROOK-LM with raw FEN:
```
Input: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
Output: Full formatted response with moves, evaluations, and best move
```

### RookWorld-LM with P: prefix:
```
Input: P: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
Output: [padding] M: e2e4 g1f3 d2d4 ... E: 0.48 0.2 ... B: e2e4
```

## Implementation in JavaScript

The `model-utils.js` should detect the model type and use appropriate formatting:

```javascript
if (currentModel === 'rook-lm') {
    // ROOK-LM: Use raw FEN
    fullPrompt = prompt;
} else if (currentModel === 'rookworld') {
    // RookWorld-LM: Add P: prefix
    fullPrompt = prompt.startsWith('P: ') ? prompt : `P: ${prompt}`;
}
```