# ROOK-CLF-9m Pure ONNX Demo

A minimal web application for running the ROOK-CLF-9m chess move classifier directly in the browser using ONNX Runtime Web.

## Features

- **Pure ONNX inference** - No dependency on transformers.js
- **Custom tokenization** - Lightweight tokenizer specifically for chess FENs
- **Browser-based** - Runs entirely client-side with WebAssembly
- **1968 chess move classes** - Comprehensive move classification

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the web server:
```bash
python3 -m http.server 8080
# or
uv run --python 3.11 -m http.server 8080
```

3. Open http://localhost:8080 in your browser

## Project Structure

```
rook-clf-demo/
├── index.html          # Main HTML file
├── app.js              # Pure ONNX inference implementation
├── styles.css          # UI styles
├── package.json        # Node dependencies (only onnxruntime-web)
└── model/              # ONNX model files
    └── ROOK-CLF-9m-transformersjs/
        ├── config.json           # Model configuration and label mappings
        ├── model.quant.onnx      # Quantized ONNX model
        ├── tokenizer.json        # Tokenizer vocabulary
        └── ...
```

## Technical Details

- **Model**: LlamaForSequenceClassification exported to ONNX
- **Runtime**: ONNX Runtime Web with WASM backend
- **Tokenization**: Custom implementation reading tokenizer.json vocabulary
- **Input**: Chess FEN strings
- **Output**: Probability distribution over 1968 chess moves

## Dependencies

- `onnxruntime-web`: ONNX inference in the browser

## Notes

This implementation bypasses transformers.js entirely since LlamaForSequenceClassification is not yet supported in that library. Instead, it uses ONNX Runtime directly with custom tokenization.