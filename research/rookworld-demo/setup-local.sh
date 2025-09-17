#!/bin/bash

# Setup script to download dependencies locally instead of using CDN

echo "Setting up local dependencies for RookWorld Demo..."

# Install npm dependencies
echo "Installing npm packages..."
npm install

echo ""
echo "Setup complete! To use local dependencies instead of CDN:"
echo "1. In index.html, change:"
echo "   FROM: <script src=\"https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/ort.min.js\"></script>"
echo "   TO:   <script src=\"./node_modules/onnxruntime-web/dist/ort.min.js\"></script>"
echo ""
echo "2. In model-utils.js, change:"
echo "   FROM: import { AutoTokenizer, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2';"
echo "   TO:   import { AutoTokenizer, env } from './node_modules/@huggingface/transformers/dist/transformers.min.js';"
echo ""
echo "   AND:"
echo "   FROM: ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/';"
echo "   TO:   ort.env.wasm.wasmPaths = './node_modules/onnxruntime-web/dist/';"
echo ""
echo "Note: CDN is recommended for GitHub Pages deployment to avoid large file sizes."