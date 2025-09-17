# RookWorld Demo

Interactive browser-based chess AI demonstration using ROOK-LM and RookWorld-LM language models with streaming chain-of-thought visualization.

## Features

### 🧠 Chain-of-Thought Analysis
- **Streaming reasoning**: Watch the model think in real-time
- **Interactive visualization**: Click candidate moves to highlight on board
- **Model comparison**: Switch between ROOK-LM and RookWorld-LM
- **Syntax highlighting**: Color-coded P:, M:, E:, B: sections

### ♟️ Self-Play with Reasoning
- **Complete games**: Watch models play against themselves
- **Live reasoning traces**: See the thought process for every move
- **Configurable speed**: Adjust move delays to follow reasoning
- **Game tracking**: Move history and game state display

## Technical Implementation

### Streaming Generation
- Token-by-token text generation using ONNX Runtime
- Real-time parsing of chain-of-thought format
- Progressive UI updates as reasoning unfolds
- Optimized for educational value over speed

### Model Support
- **RookWorld-LM-124M**: Unified agent+environment model
- **ROOK-LM-124M**: Policy-only model with chain-of-thought
- **Automatic caching**: IndexedDB storage for repeat visits
- **Progressive loading**: Chunked download with progress indication

## Usage

1. **Navigate to demo**: `/research/rookworld-demo/`
2. **Wait for model loading**: ~100MB download (cached after first visit)
3. **Try analysis**: Enter a FEN position or use random/starting positions
4. **Watch reasoning**: Observe the streaming chain-of-thought process
5. **Self-play**: Start a game and watch the model play against itself

## Model Hosting

### Option 1: HuggingFace (Recommended)
For large ONNX models, host them on HuggingFace:
1. Upload models to HuggingFace repository
2. Update `model-config.js` with your HuggingFace URLs
3. Models load directly from HuggingFace CDN

### Option 2: Local Hosting
Place ONNX models in:
- `model/RookWorld-LM-124M/model.onnx`
- `model/ROOK-LM-124M/model.onnx`
- Associated tokenizer and config files

## Performance Notes

- **Download time**: 30-60 seconds for first visit
- **Inference speed**: 2-5 seconds per move (streaming enhances the experience)
- **Memory usage**: ~200MB browser memory
- **Caching**: Subsequent visits load instantly from IndexedDB

The slower inference speed becomes a feature, allowing users to observe and understand the model's reasoning process in detail.

## Research

Based on research published at [LAION](https://laion.ai/notes/rook/):
- Chain-of-thought reasoning for chess
- Unified agent-environment modeling
- Self-improvement through filtered self-play