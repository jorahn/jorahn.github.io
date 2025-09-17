/**
 * Model configuration with support for HuggingFace hosting
 * This allows hosting large ONNX models on HuggingFace instead of GitHub Pages
 */

// HuggingFace model repository URLs
// Replace these with your actual HuggingFace model repository URLs
const HF_MODEL_BASE = 'https://huggingface.co/{username}/{repo}/resolve/main/';

export const MODEL_CONFIGS = {
  'rookworld': {
    name: 'RookWorld-LM-124M',
    // Option 1: Load from HuggingFace (recommended for large models)
    // modelPath: `${HF_MODEL_BASE}rookworld-lm-124m/model.onnx`,
    // tokenizerPath: `${HF_MODEL_BASE}rookworld-lm-124m/`,

    // Option 2: Load from local (current setup)
    modelPath: './model/RookWorld-LM-124M/model.onnx',
    tokenizerPath: './model/RookWorld-LM-124M/',

    supportsEnvironment: true,
    usePrefix: true  // Uses "P: " prefix for policy mode
  },
  'rook-lm': {
    name: 'ROOK-LM-124M',
    // Option 1: Load from HuggingFace
    // modelPath: `${HF_MODEL_BASE}rook-lm-124m/model.onnx`,
    // tokenizerPath: `${HF_MODEL_BASE}rook-lm-124m/`,

    // Option 2: Load from local
    modelPath: './model/ROOK-LM-124M/model.onnx',
    tokenizerPath: './model/ROOK-LM-124M/',

    supportsEnvironment: false,
    usePrefix: false  // No prefix, raw FEN
  }
};

/**
 * To use HuggingFace hosting:
 * 1. Upload your ONNX models to HuggingFace model repository
 * 2. Update the HF_MODEL_BASE URL with your username and repo name
 * 3. Uncomment the HuggingFace modelPath and tokenizerPath lines
 * 4. Comment out the local modelPath and tokenizerPath lines
 *
 * Benefits:
 * - No size limits from GitHub Pages
 * - Faster CDN delivery
 * - Version control for models
 * - Usage analytics
 */