#!/bin/bash

# Complete setup script for RookWorld demo
# Downloads models, converts to ONNX, and deploys to demo directories

set -e  # Exit on any error

echo "🚀 Setting up RookWorld Demo..."
echo "================================"

# Check if we're in the right directory
if [[ ! -d "scripts" ]]; then
    echo "❌ Please run this script from the rookworld-demo directory"
    exit 1
fi

# Install required Python packages
echo "📦 Installing required packages..."
pip install transformers torch optimum[onnxruntime] huggingface_hub

# Step 1: Download models from HuggingFace
echo ""
echo "⬇️ Step 1: Downloading models from HuggingFace..."
python scripts/download_models.py --output-dir ./temp_models

# Check if download was successful
if [[ ! -d "./temp_models" ]]; then
    echo "❌ Model download failed"
    exit 1
fi

# Step 2: Convert to ONNX format with quantization
echo ""
echo "🔄 Step 2: Converting to ONNX with INT8 quantization..."
python scripts/convert_to_onnx.py \
    --input-dir ./temp_models \
    --output-dir ./onnx_models \
    --quantize

# Check if conversion was successful
if [[ ! -d "./onnx_models" ]]; then
    echo "❌ ONNX conversion failed"
    exit 1
fi

# Step 3: Deploy to demo directories
echo ""
echo "📂 Step 3: Deploying models to demo directories..."
python scripts/deploy_models.py \
    --source-dir ./onnx_models \
    --target-dir ./model

# Cleanup temporary directories
echo ""
echo "🧹 Cleaning up temporary files..."
rm -rf ./temp_models ./onnx_models

# Check if deployment was successful
if [[ -f "./model/RookWorld-LM-124M/model.onnx" ]] || [[ -f "./model/ROOK-LM-124M/model.onnx" ]]; then
    echo ""
    echo "✅ Setup completed successfully!"
    echo ""
    echo "📊 Demo ready at:"
    echo "   http://localhost:8080/research/rookworld-demo/"
    echo ""
    echo "🎯 Models deployed:"
    ls -la ./model/*/model.onnx 2>/dev/null || echo "   (Check model directories for available models)"
    echo ""
    echo "💡 The demo will now work with streaming chain-of-thought visualization!"
else
    echo ""
    echo "⚠️ Setup completed but no models were successfully deployed"
    echo "Please check the logs above for any errors"
fi