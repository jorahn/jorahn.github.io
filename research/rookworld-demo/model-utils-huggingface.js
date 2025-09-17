/**
 * Model utilities configured for HuggingFace hosting
 * Replace {your-username} with your actual HuggingFace username
 */

import { AutoTokenizer, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2';

// CRITICAL: Enable local model loading
env.allowLocalModels = true;
env.allowRemoteModels = false;

// Model configurations with HuggingFace URLs
// IMPORTANT: Replace {your-username} with your HuggingFace username
export const MODEL_CONFIGS = {
  'rookworld': {
    name: 'RookWorld-LM-124M',
    // HuggingFace hosted model (replace {your-username})
    modelPath: 'https://huggingface.co/{your-username}/rookworld-lm-124m-onnx/resolve/main/model.onnx',
    tokenizerPath: 'https://huggingface.co/{your-username}/rookworld-lm-124m-onnx/resolve/main/',
    supportsEnvironment: true,
    usePrefix: true  // Uses "P: " prefix
  },
  'rook-lm': {
    name: 'ROOK-LM-124M',
    // HuggingFace hosted model (replace {your-username})
    modelPath: 'https://huggingface.co/{your-username}/rook-lm-124m-onnx/resolve/main/model.onnx',
    tokenizerPath: 'https://huggingface.co/{your-username}/rook-lm-124m-onnx/resolve/main/',
    supportsEnvironment: false,
    usePrefix: false  // No prefix, raw FEN
  }
};

// Rest of the file remains the same as model-utils.js
// Copy all the functions below from the original model-utils.js