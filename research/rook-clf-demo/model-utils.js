import * as ort from 'onnxruntime-web';

// Configure ONNX Runtime immediately  
ort.env.wasm.wasmPaths = {
  'ort-wasm.wasm': './libs/ort-wasm-simd-threaded.wasm',
  'ort-wasm-threaded.wasm': './libs/ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd.wasm': './libs/ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.wasm': './libs/ort-wasm-simd-threaded.wasm'
};
ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;

// WebGPU configuration
ort.env.webgpu.validateInputContent = false; // Faster inference
ort.env.webgpu.powerPreference = 'high-performance'; // Use dedicated GPU if available

// Model caching using IndexedDB
const MODEL_CACHE_DB = 'rook-clf-cache';
const MODEL_CACHE_VERSION = 1;
const MODEL_STORE = 'models';

// Shared state - accessible across all components
let session = null;
let interpretSession = null;
let tokenizerData = null;
let config = null;

// Loading state management
let isLoading = false;
let loadingPromise = null;

// Progress callback for UI updates
let progressCallback = null;

export function setProgressCallback(callback) {
  progressCallback = callback;
}

// Detect best available execution provider
async function getBestExecutionProvider() {
  const providers = [];
  
  // NOTE: WebGPU AND WebGL are disabled for the main ROOK-CLF model.
  // The ROOK-CLF ONNX graph requires int64 inputs which neither WebGPU nor WebGL support.
  // The model architecture was designed for int64 tokens and cannot be easily converted to int32.
  // Only the interpretation model (model.interpret.onnx) supports int32 and can use GPU acceleration.
  
  if ('gpu' in navigator) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        console.log('⚠️ WebGPU available but disabled for main model (int64 incompatibility)');
      }
    } catch (error) {
      console.log('❌ WebGPU not available:', error.message);
    }
  }
  
  // WASM is the only compatible provider for the main ROOK-CLF model
  providers.push('wasm');
  console.log('✅ WebAssembly - only compatible provider for ROOK-CLF model');
  
  console.log(`Execution provider priority: [${providers.join(', ')}]`);
  return providers;
}

// Create session with fallback support
async function createSessionWithFallback(modelData, executionProviders) {
  let actualProvider = null;
  
  for (let i = 0; i < executionProviders.length; i++) {
    const provider = executionProviders[i];
    try {
      console.log(`Attempting to create session with: ${provider}`);
      const session = await ort.InferenceSession.create(modelData, {
        executionProviders: [provider],
        graphOptimizationLevel: 'all'
      });
      console.log(`✅ Successfully created session with: ${provider}`);
      
      // Store the actual provider for later reference
      actualProvider = provider;
      session._actualProvider = provider;
      
      return session;
    } catch (error) {
      console.log(`❌ Failed to create session with ${provider}:`, error.message);
      if (i === executionProviders.length - 1) {
        // This was the last provider, re-throw the error
        throw error;
      }
      // Try next provider
    }
  }
}

function updateProgress(progress, status, details) {
  if (progressCallback) {
    progressCallback(progress, status, details);
  }
}

async function openModelCache() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MODEL_CACHE_DB, MODEL_CACHE_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(MODEL_STORE)) {
        db.createObjectStore(MODEL_STORE);
      }
    };
  });
}

async function getCachedModel(modelPath) {
  try {
    const db = await openModelCache();
    const transaction = db.transaction(MODEL_STORE, 'readonly');
    const store = transaction.objectStore(MODEL_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.get(modelPath);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  } catch (error) {
    console.log('Cache access failed:', error);
    return null;
  }
}

async function cacheModel(modelPath, modelData) {
  try {
    const db = await openModelCache();
    const transaction = db.transaction(MODEL_STORE, 'readwrite');
    const store = transaction.objectStore(MODEL_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.put(modelData, modelPath);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log('Model cached successfully');
        resolve();
      };
    });
  } catch (error) {
    console.log('Cache write failed:', error);
  }
}

// Load model configuration
async function loadConfig() {
  const response = await fetch('./model/ROOK-CLF-9m-transformersjs/config.json');
  return await response.json();
}

// Load tokenizer data
async function loadTokenizer() {
  const response = await fetch('./model/ROOK-CLF-9m-transformersjs/tokenizer.json');
  return await response.json();
}

// Direct port of Python process_fen function - FIXED to match research code exactly
export function processFen(fen) {
  const [position, turn, castling, enPassant, halfmove, fullmove] = fen.split(" ");
  
  // pad position with "." for empty squares, remove numbers and "/"
  const processedPosition = position
    .replace(/\d/g, (match) => '.'.repeat(parseInt(match)))
    .replace(/\//g, '');
  
  // CRITICAL FIX: Python's ljust() right-pads to the specified length (same as padEnd)
  // The original code was actually correct, but let's be extra explicit
  const processedCastling = castling.padEnd(4, ".");
  const processedEnPassant = enPassant.padEnd(2, ".");  
  const processedHalfmove = halfmove.padEnd(2, ".") + ".";
  const processedFullmove = fullmove.padEnd(3, ".");
  
  const result = processedPosition + turn + processedCastling + processedEnPassant + processedHalfmove + processedFullmove;
  
  console.log('CORRECTED Python port - breakdown:');
  console.log('  Position:', processedPosition, 'len:', processedPosition.length);
  console.log('  Turn:', turn, 'len:', turn.length);
  console.log('  Castling:', processedCastling, 'len:', processedCastling.length);  
  console.log('  En passant:', processedEnPassant, 'len:', processedEnPassant.length);
  console.log('  Halfmove:', processedHalfmove, 'len:', processedHalfmove.length);
  console.log('  Fullmove:', processedFullmove, 'len:', processedFullmove.length);
  console.log('  Result:', result);
  console.log('  Total length:', result.length, '(must be 77)');
  
  return result;
}

// Tokenizer for ROOK-CLF model
export function tokenizeRookFen(fen, vocab = null) {
  // Use cached tokenizer data if vocab not provided
  const vocabToUse = vocab || (tokenizerData?.model?.vocab) || {};
  
  // CRITICAL FIX: Only process FEN if it contains "/" (i.e., it's a standard FEN)
  // This matches the research code logic: process_fen(fen) if "/" in fen else fen
  const processed = (fen.includes('/') ? processFen(fen) : fen) + '[CLS]';
  
  console.log('Original FEN:', fen);
  console.log('Processed:', processed);
  console.log('Length:', processed.length);
  console.log('Turn char at pos 64:', processed[64]);
  console.log('Side to move:', processed[64] === 'w' ? 'WHITE' : 'BLACK');
  
  const tokens = [];
  
  // Tokenize: 77 chars + [CLS] as single token = 78 tokens
  const withoutCls = processed.slice(0, -5); // Remove '[CLS]'
  
  // Tokenize the 77 characters
  for (const char of withoutCls) {
    if (vocabToUse.hasOwnProperty(char)) {
      tokens.push(vocabToUse[char]);
    } else {
      tokens.push(vocabToUse['-'] || 0);
    }
  }
  
  // Add [CLS] as single token (id 34)
  tokens.push(34);
  
  // Ensure exactly 78 tokens (no padding!)
  if (tokens.length !== 78) {
    console.error('TOKEN LENGTH MISMATCH! Got', tokens.length, 'expected 78');
    console.error('This will cause wrong predictions!');
    // Truncate or pad to exactly 78
    if (tokens.length > 78) {
      tokens.length = 78;
    } else {
      while (tokens.length < 78) {
        tokens.push(vocabToUse['-'] || 0);
      }
    }
  }
  
  console.log('Final token IDs (first 20):', tokens.slice(0, 20), '...');
  console.log('Final token length:', tokens.length);
  
  // Create attention mask (all 1s, no padding)
  const attentionMask = new Array(78).fill(1);
  
  return { input_ids: tokens, attention_mask: attentionMask };
}

// Softmax function
export function softmax(logits) {
  const maxLogit = Math.max(...logits);
  const scores = logits.map(logit => Math.exp(logit - maxLogit));
  const sum = scores.reduce((a, b) => a + b, 0);
  return scores.map(score => score / sum);
}

// Main model loading function
export async function ensureModelLoaded() {
  // If model is already loaded, return immediately
  if (session && tokenizerData && config) {
    return { session, tokenizerData, config };
  }
  
  // If already loading, return the existing promise
  if (isLoading && loadingPromise) {
    return loadingPromise;
  }
  
  // Start loading
  isLoading = true;
  loadingPromise = loadModelInternal();
  
  try {
    const result = await loadingPromise;
    return result;
  } finally {
    isLoading = false;
    loadingPromise = null;
  }
}

export async function ensureInterpretModelLoaded() {
  // Reuse tokenizer/config
  if (!config) config = await loadConfig();
  if (!tokenizerData) tokenizerData = await loadTokenizer();
  if (interpretSession) return { session: interpretSession, tokenizerData, config };
  
  updateProgress(5, 'Loading interpretability model...', 'Preparing session');
  // Prefer simplified file if available
  let modelPath = './model/ROOK-CLF-9m-transformersjs/model.interpret.simplified.onnx';
  try {
    const head = await fetch(modelPath, { method: 'HEAD' });
    if (!head.ok) modelPath = './model/ROOK-CLF-9m-transformersjs/model.interpret.onnx';
  } catch (_) {
    modelPath = './model/ROOK-CLF-9m-transformersjs/model.interpret.onnx';
  }
  let modelData;
  try {
    modelData = await getCachedModel(modelPath);
    if (!modelData) {
      const resp = await fetch(modelPath);
      modelData = await resp.arrayBuffer();
      await cacheModel(modelPath, modelData);
    }
    interpretSession = await ort.InferenceSession.create(modelData, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all'
    });
    updateProgress(100, 'Interpretability model ready', '');
    return { session: interpretSession, tokenizerData, config };
  } catch (e) {
    console.error('Failed to load interpretability model', e);
    throw e;
  }
}

// Run a forward pass that returns interpretability tensors
export async function runInterpretForward(fen) {
  const { session } = await ensureInterpretModelLoaded();
  const vocab = tokenizerData.model?.vocab || {};
  const encoded = tokenizeRookFen(fen, vocab);
  // Interpretability model was exported with int32 inputs (cast internally).
  const inputIds = new ort.Tensor('int32', Int32Array.from(encoded.input_ids), [1, encoded.input_ids.length]);
  const attentionMask = new ort.Tensor('int32', Int32Array.from(encoded.attention_mask), [1, encoded.attention_mask.length]);
  const outputs = await session.run({ input_ids: inputIds, attention_mask: attentionMask });
  // Expected names: logits, decision_hidden, classifier_weight, attentions, hidden_states
  return outputs;
}

// Attention rollout utility (residual-corrected)
export function attentionRollout(attn, alpha = 0.2, uptoLayers = null) {
  // attn: [L, B, Hh, S, S] (Float32Array)
  const L = attn.dims[0];
  const B = attn.dims[1];
  const Hh = attn.dims[2];
  const S = attn.dims[3];
  const Luse = uptoLayers ? Math.min(uptoLayers, L) : L;
  if (B !== 1) console.warn('attentionRollout expects batch=1');

  // Initialize R as identity
  let R = new Float32Array(S * S);
  for (let i = 0; i < S; i++) R[i * S + i] = 1.0;

  // Helper to get attn layer slice
  const data = attn.data; // Float32Array
  const layerStride = B * Hh * S * S;
  const batchStride = Hh * S * S;
  const headStride = S * S;

  for (let l = 0; l < Luse; l++) {
    // Mean over heads -> [S,S]
    const A = new Float32Array(S * S);
    for (let h = 0; h < Hh; h++) {
      const base = (l * layerStride) + (0 * batchStride) + (h * headStride);
      for (let i = 0; i < S * S; i++) A[i] += data[base + i];
    }
    for (let i = 0; i < S * S; i++) A[i] /= Hh;
    // Row normalize
    for (let r = 0; r < S; r++) {
      let sum = 0;
      for (let c = 0; c < S; c++) sum += A[r * S + c];
      if (sum > 0) {
        for (let c = 0; c < S; c++) A[r * S + c] /= sum;
      }
    }
    // Residual correction: Atilde = alpha*I + (1-alpha)*A
    for (let i = 0; i < S; i++) {
      for (let j = 0; j < S; j++) {
        const idx = i * S + j;
        A[idx] = (1 - alpha) * A[idx] + (i === j ? alpha : 0);
      }
    }
    // R = R @ Atilde
    const Rnew = new Float32Array(S * S);
    for (let i = 0; i < S; i++) {
      for (let j = 0; j < S; j++) {
        let acc = 0;
        for (let k = 0; k < S; k++) acc += R[i * S + k] * A[k * S + j];
        Rnew[i * S + j] = acc;
      }
    }
    R = Rnew;
  }
  return { R, S };
}
async function loadModelInternal() {
  updateProgress(5, 'Initializing...', 'Setting up environment');
  
  try {
    updateProgress(8, 'Detecting hardware...', 'Checking for GPU acceleration');
    const executionProviders = await getBestExecutionProvider();
    
    updateProgress(10, 'Loading configuration...', 'Fetching model config');
    config = await loadConfig();
    console.log('Config loaded, classes:', Object.keys(config.id2label).length);
    
    updateProgress(20, 'Loading tokenizer...', 'Preparing text processing');
    tokenizerData = await loadTokenizer();
    console.log('Tokenizer loaded');
    // Choose model path based on available providers (prefer WebGPU-specific model if present)
    let modelPath = './model/ROOK-CLF-9m-transformersjs/model.quant.onnx';
    if (executionProviders[0] === 'webgpu') {
      try {
        const probe = await fetch('./model/ROOK-CLF-9m-transformersjs/model.webgpu.fp16.onnx', { method: 'HEAD' });
        if (probe.ok) {
          modelPath = './model/ROOK-CLF-9m-transformersjs/model.webgpu.fp16.onnx';
          console.log('Selecting WebGPU fp16 model');
        } else {
          console.log('WebGPU model not found; falling back to quantized WASM model');
        }
      } catch (e) {
        console.log('WebGPU model probe failed; using quantized WASM model');
      }
    }
    
    // Try to load from cache first
    updateProgress(25, 'Checking cache...', 'Looking for cached model');
    let cachedModel = await getCachedModel(modelPath);
    
    if (cachedModel) {
      console.log('Loading model from cache');
      updateProgress(50, 'Loading from cache...', 'Found cached model, loading');
      session = await createSessionWithFallback(cachedModel, executionProviders);
      updateProgress(95, 'Finalizing...', 'Model loaded successfully');
    } else {
      console.log('Loading model from network (first time)');
      updateProgress(30, 'Downloading model...', 'This may take a moment (9.5 MB)');
      
      // Fetch the model file with progress tracking
      const response = await fetch(modelPath);
      const reader = response.body.getReader();
      const contentLength = +response.headers.get('Content-Length');
      
      let receivedLength = 0;
      let chunks = [];
      
      while(true) {
        const {done, value} = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        receivedLength += value.length;
        
        // Update progress (30-80% for download)
        const downloadProgress = (receivedLength / contentLength) * 50 + 30;
        const mbReceived = (receivedLength / 1024 / 1024).toFixed(1);
        const mbTotal = (contentLength / 1024 / 1024).toFixed(1);
        updateProgress(
          Math.min(downloadProgress, 80),
          'Downloading model...',
          `${mbReceived} MB / ${mbTotal} MB`
        );
      }
      
      // Combine chunks into single array
      updateProgress(85, 'Processing model...', 'Preparing model data');
      let chunksAll = new Uint8Array(receivedLength);
      let position = 0;
      for(let chunk of chunks) {
        chunksAll.set(chunk, position);
        position += chunk.length;
      }
      
      const modelData = chunksAll.buffer;
      
      // Create session
      updateProgress(90, 'Initializing model...', 'Creating inference session');
      session = await createSessionWithFallback(modelData, executionProviders);
      
      // Cache for future use
      updateProgress(95, 'Caching model...', 'Saving for faster future loads');
      await cacheModel(modelPath, modelData);
    }
    
    console.log('ONNX model loaded');
    
    // Log which execution provider was actually used
    const actualProvider = session._actualProvider || session.executionProviders?.[0] || 'wasm';
    console.log(`🚀 Model running on: ${actualProvider.toUpperCase()}`);
    
    // Update progress with execution provider info
    updateProgress(100, 'Ready!', `Model loaded (WebAssembly - int64 compatible)`);
    
    return { session, tokenizerData, config };
  } catch (err) {
    console.error('Failed to load model:', err);
    updateProgress(0, 'Error', `Failed to load model: ${err.message}`);
    throw err;
  }
}

// Run inference on a FEN position
export async function runInference(fen) {
  const { session, tokenizerData, config } = await ensureModelLoaded();
  
  const vocab = tokenizerData.model?.vocab || {};
  const encoded = tokenizeRookFen(fen, vocab);
  
  // Prepare tensors - ROOK-CLF model always requires int64 tensors (WASM only)
  console.log('Creating int64 tensors with shape:', [1, encoded.input_ids.length]);
  
  const inputIds = new ort.Tensor('int64', 
    BigInt64Array.from(encoded.input_ids.map(x => BigInt(x))), 
    [1, encoded.input_ids.length]
  );
  const attentionMask = new ort.Tensor('int64', 
    BigInt64Array.from(encoded.attention_mask.map(x => BigInt(x))), 
    [1, encoded.attention_mask.length]
  );
  
  console.log('Tensor shapes - input:', inputIds.dims, 'attention:', attentionMask.dims);
  console.log('Tensor types - input:', inputIds.type, 'attention:', attentionMask.type);
  
  // Run inference
  const results = await session.run({
    input_ids: inputIds,
    attention_mask: attentionMask
  });
  
  // Process results
  const logitsOutput = results.logits || results.output || results[Object.keys(results)[0]];
  const logits = Array.from(logitsOutput.data);
  const probs = softmax(logits);
  
  // Map to moves
  const predictions = [];
  for (let i = 0; i < probs.length; i++) {
    if (config.id2label && config.id2label[i]) {
      predictions.push({
        label: config.id2label[i],
        score: probs[i]
      });
    }
  }
  
  predictions.sort((a, b) => b.score - a.score);
  return predictions;
}

// Get model info (useful for UI display)
export function getModelInfo() {
  if (!config) {
    return null;
  }
  
  const executionProvider = session?._actualProvider || session?.executionProviders?.[0] || 'wasm';
  
  return {
    numClasses: Object.keys(config.id2label).length,
    isLoaded: session !== null,
    tokenizerData: tokenizerData !== null,
    configLoaded: config !== null,
    executionProvider: executionProvider,
    isAccelerated: executionProvider === 'webgpu' || executionProvider === 'webgl'
  };
}

// Check if model is fully loaded
export function isModelLoaded() {
  return session !== null && tokenizerData !== null && config !== null;
}

// Reset model state (useful for testing)
export function resetModel() {
  session = null;
  tokenizerData = null;
  config = null;
  isLoading = false;
  loadingPromise = null;
}
