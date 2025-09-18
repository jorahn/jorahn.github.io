/**
 * Model utilities for ROOK-LM and RookWorld-LM
 * Working implementation based on test.html
 */

// Use local transformers
import { AutoTokenizer, env } from './node_modules/@huggingface/transformers/dist/transformers.min.js';

// Model configurations - Load from HuggingFace by default
// Set USE_LOCAL_MODELS=true in console to use local files for development
const USE_LOCAL = typeof window !== 'undefined' && window.USE_LOCAL_MODELS;

// Configure environment based on whether using local or HuggingFace models
if (USE_LOCAL) {
  // Local development mode
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.localModelPath = './model/';  // Path to local models
} else {
  // Production mode - load from HuggingFace
  env.allowLocalModels = false;  // Don't look for local files
  env.allowRemoteModels = true;   // Use HuggingFace CDN
  // The library will automatically use HuggingFace URLs for model IDs like 'jrahn/RookWorld-LM-124M'
}

export const MODEL_CONFIGS = {
  'rookworld': {
    name: 'RookWorld-LM-124M',
    // Load ONNX model from HuggingFace or local
    modelPath: USE_LOCAL
      ? './model/RookWorld-LM-124M/model.onnx'
      : 'https://huggingface.co/jrahn/RookWorld-LM-124M/resolve/main/onnx/model.onnx',
    // Tokenizer path - use model ID for HF, local path for local
    tokenizerPath: USE_LOCAL
      ? './model/RookWorld-LM-124M/'
      : 'jrahn/RookWorld-LM-124M',
    supportsEnvironment: true,
    usePrefix: true  // Uses "P: " prefix
  },
  'rook-lm': {
    name: 'ROOK-LM-124M',
    // Load ONNX model from HuggingFace or local
    modelPath: USE_LOCAL
      ? './model/ROOK-LM-124M/model.onnx'
      : 'https://huggingface.co/jrahn/ROOK-LM-124M/resolve/main/onnx/model.onnx',
    // Tokenizer path - use model ID for HF, local path for local
    tokenizerPath: USE_LOCAL
      ? './model/ROOK-LM-124M/'
      : 'jrahn/ROOK-LM-124M',
    supportsEnvironment: false,
    usePrefix: false  // No prefix, raw FEN
  }
};

// Global state
let currentModel = null;
let onnxSession = null;
let tokenizer = null;

// Utility: create tensor with proper dtype (from test.html)
function idsTensor(ids, dims, desiredType = 'int64') {
  if (desiredType === 'int64') {
    const arr = new BigInt64Array(ids.map(BigInt));
    return new ort.Tensor('int64', arr, dims);
  } else {
    const arr = new Int32Array(ids);
    return new ort.Tensor('int32', arr, dims);
  }
}

// Greedy argmax over last token logits (from test.html)
function greedyNextId(logitsTensor) {
  const { data, dims } = logitsTensor;
  if (dims.length === 2) {
    // [1, V]
    let max = -Infinity, idx = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      if (v > max) { max = v; idx = i; }
    }
    return idx;
  } else {
    // [1, T, V]
    const V = dims[dims.length - 1];
    const T = dims[dims.length - 2];
    const start = (T - 1) * V;
    let max = -Infinity, idx = 0;
    for (let i = 0; i < V; i++) {
      const v = data[start + i];
      if (v > max) { max = v; idx = i; }
    }
    return idx;
  }
}

// Sample from logits with temperature and top-k
function sampleNextId(logitsTensor, temperature = 0.2, topK = 10) {
  const { data, dims } = logitsTensor;
  let logits;

  if (dims.length === 2) {
    // [1, V]
    logits = Array.from(data);
  } else {
    // [1, T, V]
    const V = dims[dims.length - 1];
    const T = dims[dims.length - 2];
    const start = (T - 1) * V;
    logits = Array.from(data.slice(start, start + V));
  }

  // Apply temperature
  if (temperature > 0) {
    logits = logits.map(x => x / temperature);
  }

  // Get top-k indices and values
  const indexed = logits.map((val, idx) => ({ val, idx }));
  indexed.sort((a, b) => b.val - a.val);
  const topKItems = indexed.slice(0, topK);

  // Convert to probabilities with softmax
  const maxLogit = Math.max(...topKItems.map(x => x.val));
  const expValues = topKItems.map(x => Math.exp(x.val - maxLogit));
  const sumExp = expValues.reduce((a, b) => a + b, 0);
  const probs = expValues.map(x => x / sumExp);

  // Sample from the distribution
  const random = Math.random();
  let cumSum = 0;
  for (let i = 0; i < probs.length; i++) {
    cumSum += probs[i];
    if (random < cumSum) {
      return topKItems[i].idx;
    }
  }

  return topKItems[0].idx; // Fallback to highest probability
}

// Discover input names from ONNX session (from test.html)
function discoverInputs(session) {
  const inNames = session.inputNames;
  return {
    inputIds: inNames.find(n => n.includes('input_ids')) || inNames[0],
    attnMask: inNames.find(n => n.includes('attention_mask')) || null,
    posIds: inNames.find(n => n.includes('position_ids')) || null,
  };
}

// Initialize model and tokenizer
export async function initializeModel(modelType = 'rookworld', onProgress = null) {
  try {
    const config = MODEL_CONFIGS[modelType];
    if (!config) throw new Error(`Unknown model type: ${modelType}`);

    currentModel = modelType;

    // Log whether using HuggingFace or local models
    console.log(`Loading ${config.name} from ${USE_LOCAL ? 'local files' : 'HuggingFace'}`);
    console.log(`Model path: ${config.modelPath}`);
    console.log(`Tokenizer path: ${config.tokenizerPath}`);

    // Load tokenizer
    if (onProgress) onProgress({ stage: 'tokenizer', progress: 0 });
    tokenizer = await AutoTokenizer.from_pretrained(config.tokenizerPath);
    if (onProgress) onProgress({ stage: 'tokenizer', progress: 100 });

    // Load ONNX model
    if (onProgress) onProgress({ stage: 'model', progress: 0 });

    // Configure ONNX Runtime
    // Use WASM files from rook-clf-demo's node_modules
    ort.env.wasm.wasmPaths = '/research/rook-clf-demo/node_modules/onnxruntime-web/dist/';
    // Use more threads for better performance (adjust based on CPU)
    ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;

    onnxSession = await ort.InferenceSession.create(config.modelPath, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });

    if (onProgress) onProgress({ stage: 'model', progress: 100 });

    console.log(`Initialized ${config.name} successfully`);
    return true;
  } catch (error) {
    console.error('Error initializing model:', error);

    // Provide helpful error messages
    if (error.message.includes('fetch')) {
      throw new Error(`Failed to download model from HuggingFace. Please check your internet connection. You can also set window.USE_LOCAL_MODELS=true in the console to use local files.`);
    } else if (error.message.includes('CORS')) {
      throw new Error(`CORS error loading from HuggingFace. The models should be publicly accessible. Please try refreshing the page.`);
    }

    throw error;
  }
}

// Generate text with streaming (adapted from test.html)
export async function generateText(prompt, options = {}) {
  const {
    maxTokens = 144,
    onToken = null,
    onComplete = null,
    stopOnPattern = true,
    cancellationToken = null,
    temperature = 0.2,  // Default temperature for sampling
    topK = 10,         // Default top-k for sampling
    useGreedy = false,  // Set to true to use greedy decoding instead of sampling
    customStopCheck = null  // Custom function to check if generation should stop
  } = options;

  if (!onnxSession || !tokenizer) {
    throw new Error('Model not initialized');
  }

  const config = MODEL_CONFIGS[currentModel];

  // Apply correct prompt format - only use P: prefix for RookWorld-LM in policy mode
  const formattedPrompt = (config.usePrefix && currentModel === 'rookworld') ? `P: ${prompt}` : prompt;
  // console.log(`Using prompt: "${formattedPrompt}" for model: ${config.name}`);

  // Tokenize prompt
  const enc = await tokenizer(formattedPrompt, { add_special_tokens: false });

  // Extract token IDs (handle different return formats)
  let promptIds;
  if (enc.input_ids) {
    if (enc.input_ids.data) {
      promptIds = Array.from(enc.input_ids.data, x => Number(x));
    } else if (Array.isArray(enc.input_ids)) {
      promptIds = enc.input_ids;
    } else {
      promptIds = Array.from(enc.input_ids);
    }
  } else {
    promptIds = [];
  }

  // console.log(`Token IDs (${promptIds.length}): [${promptIds.slice(0, 10).join(', ')}...]`);

  // Generate tokens
  const names = discoverInputs(onnxSession);
  const inputDType = 'int64'; // Models expect int64
  let allIds = promptIds.slice();
  let generatedText = '';

  for (let t = 0; t < maxTokens; t++) {
    // Check for cancellation
    if (cancellationToken?.cancelled) {
      // console.log('Generation cancelled');
      break;
    }

    // Yield to UI thread every 2 tokens to prevent blocking
    if (t > 0 && t % 2 === 0) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    // Prepare inputs (full sequence, no KV cache)
    const feeds = {};
    feeds[names.inputIds] = idsTensor(allIds, [1, allIds.length], inputDType);

    if (names.attnMask) {
      feeds[names.attnMask] = new ort.Tensor('int64',
        new BigInt64Array(allIds.length).fill(1n), [1, allIds.length]);
    }

    if (names.posIds) {
      const pos = BigInt64Array.from({ length: allIds.length }, (_, i) => BigInt(i));
      feeds[names.posIds] = new ort.Tensor('int64', pos, [1, pos.length]);
    }

    // Run inference
    const outputs = await onnxSession.run(feeds);

    // Use sampling or greedy decoding based on options
    const nextId = useGreedy ?
      greedyNextId(outputs.logits) :
      sampleNextId(outputs.logits, temperature, topK);

    allIds.push(nextId);

    // Decode full sequence
    const fullDecoded = await tokenizer.decode(allIds, {
      skip_special_tokens: true,
      clean_up_tokenization_spaces: false
    });
    generatedText = fullDecoded.slice(formattedPrompt.length);

    // Stream callback
    if (onToken) {
      onToken(generatedText);
    }

    // Check for custom stop condition
    if (customStopCheck && customStopCheck(generatedText)) {
      // console.log(`Stopped early at token ${t + 1} (custom stop condition met)`);
      break;
    }

    // Check for stop pattern (B: <move> or A: which indicates environment task)
    if (stopOnPattern) {
      if (/B:\s*[a-h][1-8][a-h][1-8][qrbn]?/i.test(generatedText)) {
        // console.log(`Stopped early at token ${t + 1} (found B: pattern)`);
        break;
      }
      // Also stop if model starts generating A: (environment) content
      if (/\bA:\s*/i.test(generatedText)) {
        // console.log(`Stopped early at token ${t + 1} (found A: pattern - model switching to environment mode)`);
        // Remove the A: part from the output
        generatedText = generatedText.replace(/\s*A:.*$/i, '').trim();
        break;
      }
    }
  }

  // Parse the output
  const parsed = parseChessOutput(generatedText);

  if (onComplete) {
    onComplete(generatedText, parsed);
  }

  return { text: generatedText, parsed };
}

// Parse chess output (from test.html)
export function parseChessOutput(text) {
  // More precise regex that looks for the next section marker
  const m = /M:\s*([^]*?)(?=\s*E:|$)/i.exec(text);
  const e = /E:\s*([^]*?)(?=\s*B:|$)/i.exec(text);
  const b = /B:\s*([a-h][1-8][a-h][1-8][qrbn]?)/i.exec(text);

  const toMoves = s => s ? Array.from(s.matchAll(/\b[a-h][1-8][a-h][1-8][qrbn]?\b/ig))
    .map(x => x[0].toLowerCase()) : [];
  const toFloats = s => s ? s.trim().split(/[\s,]+/)
    .map(x => parseFloat(x))
    .filter(x => !isNaN(x)) : [];

  const result = {
    moves: toMoves(m?.[1] || ''),
    evaluations: toFloats(e?.[1] || ''),
    bestMove: b?.[1]?.toLowerCase() || null,
    raw: text
  };

  // Only warn about mismatch if we have B: (indicating generation is complete)
  // This avoids false warnings during streaming
  if (b && result.moves.length > 0 && result.evaluations.length > 0) {
    if (result.moves.length !== result.evaluations.length) {
      console.warn('Move/Eval count mismatch in final output:', {
        movesCount: result.moves.length,
        moves: result.moves,
        evalsCount: result.evaluations.length,
        evals: result.evaluations,
        bestMove: result.bestMove
      });
    }
  }

  return result;
}

// Generate for environment mode (RookWorld-LM only)
export async function generateEnvironment(state, action, history = '', options = {}) {
  if (currentModel !== 'rookworld') {
    throw new Error('Environment mode only available for RookWorld-LM');
  }

  // Format as A: prompt with fen+move+history+
  const prompt = `${state}+${action}+${history}+`;

  // IMPORTANT: Don't use P: prefix for environment mode, use raw prompt
  const formattedPrompt = `A: ${prompt}`;
  console.log('Environment prompt:', formattedPrompt);

  // We need to override the prefix logic for environment mode
  const config = MODEL_CONFIGS[currentModel];
  const originalUsePrefix = config.usePrefix;
  config.usePrefix = false; // Temporarily disable P: prefix for A: prompt

  const result = await generateText(formattedPrompt, {
    ...options,
    stopOnPattern: false, // Don't stop on B: for environment mode
    // Custom stop function for environment mode
    customStopCheck: (text) => {
      const parsed = parseEnvironmentOutput(text);
      return parsed.complete; // Stop when we have all 4 fields
    }
  });

  // Restore original prefix setting
  config.usePrefix = originalUsePrefix;

  // Parse environment response
  return parseEnvironmentOutput(result.text);
}

// Parse environment output - format: newstate+reward+termination+truncation+
export function parseEnvironmentOutput(text) {
  // Remove any prefix if present and split by +
  const cleanText = text.replace(/^[AS]:\s*/i, '').trim();
  const parts = cleanText.split('+').map(p => p.trim()).filter(p => p);

  // Expected format: [new_fen, reward, termination, truncation]
  const [state, reward, termination, truncation] = parts;

  // Parse termination and truncation as booleans
  const isTerminated = termination === '1' || termination === 'True' || termination === 'true';
  const isTruncated = truncation === '1' || truncation === 'True' || truncation === 'true';

  // Determine winner if terminated
  let winner = null;
  if (isTerminated && state) {
    // Check who's turn it was when game ended - opposite player wins
    const fenParts = state.split(' ');
    const turn = fenParts[1];
    winner = turn === 'w' ? 'Black' : 'White'; // Opposite of turn wins in checkmate
  }

  // Check if we have all 4 fields (state, reward, terminated, truncated)
  // Complete when we have truncated field with 0 or 1 value
  const hasAllFields = parts.length >= 4 &&
    (truncation === '0' || truncation === '1' ||
     truncation === 'True' || truncation === 'False' ||
     truncation === 'true' || truncation === 'false');

  return {
    state: state || null,
    reward: reward || '0',
    termination: isTerminated,
    truncation: isTruncated,
    winner: winner,
    raw: text,
    complete: hasAllFields  // Stop as soon as we have all 4 fields
  };
}

// Switch between models
export async function switchModel(modelType, onProgress = null) {
  if (currentModel === modelType && onnxSession) {
    console.log(`Already using ${modelType}`);
    return true;
  }

  // Clear current session
  if (onnxSession) {
    onnxSession = null;
  }

  return await initializeModel(modelType, onProgress);
}

// Get current model info
export function getCurrentModel() {
  return currentModel ? MODEL_CONFIGS[currentModel] : null;
}

// Check if model is initialized
export function isModelReady() {
  return onnxSession !== null && tokenizer !== null;
}

// Export for debugging
export { tokenizer, onnxSession };