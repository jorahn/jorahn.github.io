# RookWorld Demo Setup

The demo framework is ready, but model conversion encountered environment issues. Here's the status and next steps:

## ✅ Completed
- Demo UI and streaming visualization framework
- Model download from HuggingFace (tokenizer files available)
- Component architecture for chain-of-thought display
- Self-play interface with reasoning traces

## 🚧 Model Conversion Issue

The ONNX conversion failed due to transformers/torchvision compatibility issues.

### Current Status:
```
📂 temp_models/ROOK-LM-124M/     # Downloaded from HF (safetensors format)
📂 model/ROOK-LM-124M/           # Tokenizer files copied
❌ model/ROOK-LM-124M/model.onnx # Missing - conversion failed
```

### Manual Conversion Options:

1. **Use different environment:**
   ```bash
   # Create clean conda env
   conda create -n onnx-convert python=3.10
   conda activate onnx-convert
   pip install torch transformers onnx
   python scripts/convert_to_onnx_simple.py
   ```

2. **Use HuggingFace Optimum (if available):**
   ```bash
   pip install optimum[onnxruntime]
   optimum-cli export onnx --model temp_models/ROOK-LM-124M/ model/ROOK-LM-124M/
   ```

3. **Manual torch.onnx.export:**
   The script is ready in `scripts/convert_to_onnx_simple.py` - just needs a clean environment.

## Next Steps

1. **Fix environment and convert models** to ONNX format
2. **Place ONNX files** in correct directories:
   - `model/ROOK-LM-124M/model.onnx`
   - `model/RookWorld-LM-124M/model.onnx`
3. **Test demo** at http://localhost:8080/research/rookworld-demo/

## Demo Features Ready

Once models are converted, the demo will provide:
- 🧠 **Streaming chain-of-thought** visualization
- ♟️ **Self-play with reasoning** traces
- 🔄 **Model switching** (ROOK-LM vs RookWorld-LM)
- 📱 **Mobile responsive** design

The streaming inference will make the slower speed beneficial for understanding the reasoning process!