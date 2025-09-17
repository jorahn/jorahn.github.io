# HuggingFace Model Hosting Setup

This guide explains how to host the RookWorld demo models on HuggingFace for browser loading without user interaction.

## Required Files

You need to upload these files for each model to HuggingFace:

### For ROOK-LM-124M:
```
model.onnx                 (270MB) - The ONNX model file
tokenizer.json            (2.1MB) - Tokenizer configuration
tokenizer_config.json      (514B) - Tokenizer settings
vocab.json                 (780KB) - Vocabulary
merges.txt                 (446KB) - BPE merges
config.json                (808B) - Model configuration
special_tokens_map.json    (optional)
```

### For RookWorld-LM-124M:
```
model.onnx                 (270MB) - The ONNX model file
tokenizer.json            (2.1MB) - Tokenizer configuration
tokenizer_config.json      (514B) - Tokenizer settings
vocab.json                 (780KB) - Vocabulary
merges.txt                 (446KB) - BPE merges
config.json                (813B) - Model configuration
special_tokens_map.json    (optional)
```

## Step-by-Step Setup

### 1. Create HuggingFace Repositories

Create two model repositories on HuggingFace:
- `{your-username}/rook-lm-124m-onnx`
- `{your-username}/rookworld-lm-124m-onnx`

### 2. Upload Files

For each repository:

```bash
# Clone the repo
git clone https://huggingface.co/{your-username}/rook-lm-124m-onnx
cd rook-lm-124m-onnx

# Copy model files
cp /path/to/rookworld-demo/assets/model.onnx .
cp /path/to/rookworld-demo/assets/tokenizer.json .
cp /path/to/rookworld-demo/assets/tokenizer_config.json .
cp /path/to/rookworld-demo/assets/vocab.json .
cp /path/to/rookworld-demo/assets/merges.txt .
cp /path/to/rookworld-demo/assets/config.json .

# Add and commit
git add .
git commit -m "Add ROOK-LM-124M ONNX model for browser inference"
git push
```

Repeat for RookWorld-LM-124M repository.

### 3. Update model-utils.js

Update the model paths in `model-utils.js`:

```javascript
// Replace {your-username} with your HuggingFace username
export const MODEL_CONFIGS = {
  'rookworld': {
    name: 'RookWorld-LM-124M',
    // HuggingFace URLs for browser loading
    modelPath: 'https://huggingface.co/{your-username}/rookworld-lm-124m-onnx/resolve/main/model.onnx',
    tokenizerPath: 'https://huggingface.co/{your-username}/rookworld-lm-124m-onnx/resolve/main/',
    supportsEnvironment: true,
    usePrefix: true
  },
  'rook-lm': {
    name: 'ROOK-LM-124M',
    // HuggingFace URLs for browser loading
    modelPath: 'https://huggingface.co/{your-username}/rook-lm-124m-onnx/resolve/main/model.onnx',
    tokenizerPath: 'https://huggingface.co/{your-username}/rook-lm-124m-onnx/resolve/main/',
    supportsEnvironment: false,
    usePrefix: false
  }
};
```

### 4. Enable CORS (Important!)

The models need to be accessible from the browser. HuggingFace automatically handles CORS for the `/resolve/main/` endpoint.

### 5. Test the Setup

1. Update your local `model-utils.js` with the HuggingFace URLs
2. Run a local server: `python3 -m http.server 8000`
3. Open the demo and verify models load from HuggingFace

## Benefits of HuggingFace Hosting

- **No size limits**: GitHub Pages has a 100MB file limit
- **CDN delivery**: Fast global content delivery
- **Version control**: Track model versions
- **Analytics**: See download statistics
- **No CORS issues**: HuggingFace handles CORS properly
- **Direct browser access**: No authentication needed for public repos

## Alternative: Use Existing Models

If you have already published models on HuggingFace, you can use them directly if they include ONNX exports. The tokenizer files must be in the same repository.

## Troubleshooting

### CORS Errors
- Ensure you're using `/resolve/main/` in the URL path
- Check that the repository is public

### 404 Errors
- Verify the file names match exactly (case-sensitive)
- Ensure all required tokenizer files are uploaded

### Loading Issues
- Check browser console for specific error messages
- Verify the model.onnx file is the correct ONNX format
- Ensure tokenizer files are complete

## Example Repository Structure

Your HuggingFace repository should look like:
```
rook-lm-124m-onnx/
├── model.onnx
├── tokenizer.json
├── tokenizer_config.json
├── vocab.json
├── merges.txt
├── config.json
├── special_tokens_map.json (optional)
└── README.md (optional but recommended)
```

## Notes

- The demo will automatically cache models in IndexedDB after first download
- Users only need to download once per browser
- Consider using quantized models (int8) to reduce size if available
- Add a README to your HuggingFace repo explaining the model and usage