# HuggingFace Model Upload Instructions

## Exact Files to Upload

### For ROOK-LM-124M
Upload ONLY the large ONNX model to HuggingFace:
```bash
/home/jrahn/dev/public/jorahn.github.io/research/rookworld-demo/model/ROOK-LM-124M/model.onnx (270MB)
```

Keep these smaller files in the GitHub repo (model/ROOK-LM-124M/):
- config.json (790B)
- ort_config.json (648B)
- special_tokens_map.json (583B)
- tokenizer.json (3.4MB)
- tokenizer_config.json (555B)
- vocab.json (780KB)

### For RookWorld-LM-124M
Upload ONLY the large ONNX model to HuggingFace:
```bash
/home/jrahn/dev/public/jorahn.github.io/research/rookworld-demo/model/RookWorld-LM-124M/model.onnx (270MB)
```

Keep these smaller files in the GitHub repo (model/RookWorld-LM-124M/):
- config.json (790B)
- ort_config.json (648B)
- special_tokens_map.json (583B)
- tokenizer.json (3.4MB)
- tokenizer_config.json (555B)
- vocab.json (780KB)

## Upload Commands

### Option 1: Using HuggingFace CLI
```bash
# Install huggingface-hub
pip install huggingface-hub

# Login
huggingface-cli login

# Upload ROOK-LM model
huggingface-cli upload {your-username}/rook-lm-124m-onnx \
  ./model/ROOK-LM-124M/model.onnx \
  model.onnx

# Upload RookWorld-LM model
huggingface-cli upload {your-username}/rookworld-lm-124m-onnx \
  ./model/RookWorld-LM-124M/model.onnx \
  model.onnx
```

### Option 2: Using Git LFS
```bash
# Clone your HuggingFace repo
git clone https://huggingface.co/{your-username}/rook-lm-124m-onnx
cd rook-lm-124m-onnx

# Copy the ONNX model
cp /path/to/model/ROOK-LM-124M/model.onnx .

# Track with Git LFS
git lfs track "*.onnx"
git add .gitattributes
git add model.onnx
git commit -m "Add ROOK-LM-124M ONNX model"
git push
```

## Update model-utils.js

After uploading, update the model paths:

```javascript
export const MODEL_CONFIGS = {
  'rookworld': {
    name: 'RookWorld-LM-124M',
    // Load ONNX from HuggingFace, tokenizer from local
    modelPath: 'https://huggingface.co/{your-username}/rookworld-lm-124m-onnx/resolve/main/model.onnx',
    tokenizerPath: './model/RookWorld-LM-124M/',  // Local tokenizer files
    supportsEnvironment: true,
    usePrefix: true
  },
  'rook-lm': {
    name: 'ROOK-LM-124M',
    // Load ONNX from HuggingFace, tokenizer from local
    modelPath: 'https://huggingface.co/{your-username}/rook-lm-124m-onnx/resolve/main/model.onnx',
    tokenizerPath: './model/ROOK-LM-124M/',  // Local tokenizer files
    supportsEnvironment: false,
    usePrefix: false
  }
};
```

## Note on Existing HuggingFace Models

The models are already on HuggingFace at:
- https://huggingface.co/jrahn/ROOK-LM-124M
- https://huggingface.co/jrahn/RookWorld-LM-124M

However, these repositories contain the PyTorch models, not the ONNX exports. You need to either:
1. Add the ONNX files to these existing repos
2. Create separate repos specifically for ONNX models

## Testing

After updating model-utils.js, test loading:
```bash
python3 -m http.server 8000
# Open http://localhost:8000 and check browser console
```

The models should load from HuggingFace while tokenizers load locally.