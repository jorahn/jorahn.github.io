import * as ort from 'onnxruntime-web';
import { Chess } from 'chess.js';
import { getPieceDataUrl } from './chess-pieces.js';

// Configure ONNX Runtime immediately  
// Set WASM paths - use absolute path to libs folder
ort.env.wasm.wasmPaths = '/research/rook-clf-demo/libs/';
ort.env.wasm.numThreads = 1;

// Model caching using IndexedDB
const MODEL_CACHE_DB = 'rook-clf-cache';
const MODEL_CACHE_VERSION = 1;
const MODEL_STORE = 'models';

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

// Global variables
let board = null;
let game = new Chess();
let session = null;
let tokenizerData = null;
let config = null;
let moveArrows = [];
let attentionOverlay = null;
let autoplayInterval = null;
let isAutoplayActive = true;
let lastPredictions = [];

// DOM elements
const statusEl = document.getElementById('status');
const fenInput = document.getElementById('fen-input');
const currentFenEl = document.getElementById('current-fen');
const movesListEl = document.getElementById('moves-list');
const numClassesEl = document.getElementById('num-classes');

// Load model configuration and tokenizer
async function loadConfig() {
  const response = await fetch('./model/ROOK-CLF-9m-transformersjs/config.json');
  return await response.json();
}

async function loadTokenizer() {
  const response = await fetch('./model/ROOK-CLF-9m-transformersjs/tokenizer.json');
  return await response.json();
}

// Load chess positions dataset
async function loadChessPositions() {
  try {
    const response = await fetch('./chess_positions.json');
    return await response.json();
  } catch (error) {
    console.log('Could not load positions dataset, using fallback');
    return null;
  }
}

// Direct port of Python process_fen function
function processFen(fen) {
  const [position, turn, castling, enPassant, halfmove, fullmove] = fen.split(" ");
  
  // pad position with "." for empty squares, remove numbers and "/"
  const processedPosition = position
    .replace(/\d/g, (match) => '.'.repeat(parseInt(match)))
    .replace(/\//g, '');
  
  // left pad castling with "." for 4 characters
  const processedCastling = castling.padEnd(4, ".");
  
  // left pad en_passant with "." for 2 characters  
  const processedEnPassant = enPassant.padEnd(2, ".");
  
  // left pad halfmove with "." for 2 characters + add "."
  const processedHalfmove = halfmove.padEnd(2, ".") + ".";
  
  // left pad fullmove with "." for 3 characters
  const processedFullmove = fullmove.padEnd(3, ".");
  
  const result = processedPosition + turn + processedCastling + processedEnPassant + processedHalfmove + processedFullmove;
  
  console.log('Direct Python port - breakdown:');
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
function tokenizeRookFen(fen, vocab) {
  // Process FEN to match training format
  const processed = processFen(fen) + '[CLS]';
  
  console.log('Original FEN:', fen);
  console.log('Processed:', processed);
  console.log('Length:', processed.length);
  console.log('Turn char at pos 64:', processed[64]);
  console.log('Side to move:', processed[64] === 'w' ? 'WHITE' : 'BLACK');
  
  // Character-by-character comparison with Python expected
  const pythonExpected = 'rnbqkb.rpppp.ppp.....n......p.......P...........PPPP.PPPRNBQKBNRbKQkq-.2..2..';
  console.log('Expected (Python):', pythonExpected);
  console.log('Expected length:', pythonExpected.length);
  console.log('Strings match?', processed.slice(0, -5) === pythonExpected);
  
  if (processed.slice(0, -5) !== pythonExpected) {
    console.log('MISMATCH FOUND:');
    for (let i = 0; i < Math.max(processed.length - 5, pythonExpected.length); i++) {
      const ourChar = processed[i] || '∅';
      const expectedChar = pythonExpected[i] || '∅';
      if (ourChar !== expectedChar) {
        console.log(`  Pos ${i}: got "${ourChar}" expected "${expectedChar}"`);
        break;
      }
    }
  }
  
  const tokens = [];
  
  // Tokenize: 77 chars + [CLS] as single token = 78 tokens
  const withoutCls = processed.slice(0, -5); // Remove '[CLS]'
  
  // Tokenize the 77 characters
  for (const char of withoutCls) {
    if (vocab.hasOwnProperty(char)) {
      tokens.push(vocab[char]);
    } else {
      tokens.push(vocab['-'] || 0);
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
        tokens.push(vocab['-'] || 0);
      }
    }
  }
  
  console.log('Final token IDs (first 20):', tokens.slice(0, 20), '...');
  console.log('Final token length:', tokens.length);
  
  // Create attention mask (all 1s, no padding)
  const attentionMask = new Array(78).fill(1);
  
  return { input_ids: tokens, attention_mask: attentionMask };
}

// Update loading UI
function updateLoadingProgress(progress, status, details) {
  const overlay = document.getElementById('loading-overlay');
  const progressFill = document.getElementById('progress-fill');
  const statusEl = document.querySelector('.loading-status');
  const detailsEl = document.getElementById('loading-details');
  
  if (progressFill) progressFill.style.width = `${progress}%`;
  if (statusEl) statusEl.textContent = status;
  if (detailsEl) detailsEl.textContent = details;
  
  // Hide overlay when done
  if (progress >= 100 && overlay) {
    setTimeout(() => {
      overlay.classList.add('hidden');
    }, 500);
  }
}

// Load ONNX model
async function ensureModelLoaded() {
  if (session) return session;
  
  statusEl.textContent = 'Loading model...';
  updateLoadingProgress(5, 'Initializing...', 'Setting up environment');
  
  try {
    updateLoadingProgress(10, 'Loading configuration...', 'Fetching model config');
    config = await loadConfig();
    console.log('Config loaded, classes:', Object.keys(config.id2label).length);
    numClassesEl.textContent = Object.keys(config.id2label).length;
    
    updateLoadingProgress(20, 'Loading tokenizer...', 'Preparing text processing');
    tokenizerData = await loadTokenizer();
    console.log('Tokenizer loaded');
    
    const modelPath = './model/ROOK-CLF-9m-transformersjs/model.quant.onnx';
    
    // Try to load from cache first
    updateLoadingProgress(25, 'Checking cache...', 'Looking for cached model');
    statusEl.textContent = 'Loading model (checking cache)...';
    let cachedModel = await getCachedModel(modelPath);
    
    if (cachedModel) {
      console.log('Loading model from cache');
      updateLoadingProgress(50, 'Loading from cache...', 'Found cached model, loading');
      statusEl.textContent = 'Loading model (from cache)...';
      session = await ort.InferenceSession.create(cachedModel, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
      });
      updateLoadingProgress(95, 'Finalizing...', 'Model loaded successfully');
    } else {
      console.log('Loading model from network (first time)');
      updateLoadingProgress(30, 'Downloading model...', 'This may take a moment (9.5 MB)');
      statusEl.textContent = 'Loading model (downloading)...';
      
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
        updateLoadingProgress(
          Math.min(downloadProgress, 80),
          'Downloading model...',
          `${mbReceived} MB / ${mbTotal} MB`
        );
      }
      
      // Combine chunks into single array
      updateLoadingProgress(85, 'Processing model...', 'Preparing model data');
      let chunksAll = new Uint8Array(receivedLength);
      let position = 0;
      for(let chunk of chunks) {
        chunksAll.set(chunk, position);
        position += chunk.length;
      }
      
      const modelData = chunksAll.buffer;
      
      // Create session
      updateLoadingProgress(90, 'Initializing model...', 'Creating inference session');
      session = await ort.InferenceSession.create(modelData, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
      });
      
      // Cache for future use
      updateLoadingProgress(95, 'Caching model...', 'Saving for faster future loads');
      await cacheModel(modelPath, modelData);
    }
    
    console.log('ONNX model loaded');
    updateLoadingProgress(100, 'Ready!', 'Model loaded successfully');
    
    statusEl.textContent = 'Model ready';
    return session;
  } catch (err) {
    console.error('Failed to load model:', err);
    statusEl.textContent = 'Failed to load model';
    updateLoadingProgress(0, 'Error', `Failed to load model: ${err.message}`);
    throw err;
  }
}

// Softmax function
function softmax(logits) {
  const maxLogit = Math.max(...logits);
  const scores = logits.map(logit => Math.exp(logit - maxLogit));
  const sum = scores.reduce((a, b) => a + b, 0);
  return scores.map(score => score / sum);
}

// Run inference on current position
async function analyzePosition() {
  statusEl.textContent = 'Analyzing position...';
  
  try {
    await ensureModelLoaded();
    
    const fen = game.fen();
    const vocab = tokenizerData.model?.vocab || {};
    const encoded = tokenizeRookFen(fen, vocab);
    
    // Prepare tensors - ensure exact same format as Python
    console.log('Creating tensors with shape:', [1, encoded.input_ids.length]);
    console.log('Input IDs match Python?', JSON.stringify(encoded.input_ids.slice(0, 20)) === JSON.stringify([30, 27, 19, 29, 26, 19, 1, 30, 28, 28, 28, 28, 1, 28, 28, 28, 1, 1, 1, 1]));
    
    const inputIds = new ort.Tensor('int64', 
      BigInt64Array.from(encoded.input_ids.map(x => BigInt(x))), 
      [1, encoded.input_ids.length]
    );
    const attentionMask = new ort.Tensor('int64', 
      BigInt64Array.from(encoded.attention_mask.map(x => BigInt(x))), 
      [1, encoded.attention_mask.length]
    );
    
    console.log('Tensor shapes - input:', inputIds.dims, 'attention:', attentionMask.dims);
    
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
    
    // Display top moves
    displayTopMoves(predictions.slice(0, 10));
    
    // Store predictions for autoplay
    lastPredictions = predictions;
    
    // Always visualize top 5 moves
    visualizeMoves(predictions.slice(0, 5));
    
    statusEl.textContent = 'Analysis complete';
    
    // Trigger autoplay move if active
    if (isAutoplayActive) {
      scheduleAutoplayMove();
    }
  } catch (err) {
    console.error('Analysis failed:', err);
    statusEl.textContent = 'Analysis failed';
  }
}

// Check if a move is legal in the current position
function isMoveLegal(moveNotation) {
  if (moveNotation.length < 4) return false;
  
  const from = moveNotation.substring(0, 2);
  const to = moveNotation.substring(2, 4);
  const promotion = moveNotation.length > 4 ? moveNotation[4] : undefined;
  
  try {
    // Try the move without actually making it
    const testGame = new Chess(game.fen());
    const move = testGame.move({
      from: from,
      to: to,
      promotion: promotion
    });
    return move !== null;
  } catch {
    return false;
  }
}

// Display top moves in the panel with illegal move highlighting
function displayTopMoves(predictions) {
  movesListEl.innerHTML = '';
  
  let illegalMovesProbability = 0;
  let legalMovesCount = 0;
  let illegalMovesCount = 0;
  
  predictions.forEach((pred, idx) => {
    const isLegal = isMoveLegal(pred.label);
    
    if (isLegal) {
      legalMovesCount++;
    } else {
      illegalMovesCount++;
      illegalMovesProbability += pred.score;
    }
    
    const moveItem = document.createElement('div');
    moveItem.className = `move-item ${isLegal ? 'legal-move' : 'illegal-move'}`;
    
    const rank = document.createElement('div');
    rank.className = 'move-rank';
    rank.textContent = `#${idx + 1}`;
    
    const notation = document.createElement('div');
    notation.className = 'move-notation';
    notation.textContent = pred.label + (isLegal ? '' : ' ⚠');
    
    const barContainer = document.createElement('div');
    barContainer.className = 'move-bar';
    const barFill = document.createElement('div');
    barFill.className = `move-bar-fill ${isLegal ? 'legal-bar' : 'illegal-bar'}`;
    barFill.style.width = `${pred.score * 100}%`;
    barContainer.appendChild(barFill);
    
    const score = document.createElement('div');
    score.className = 'move-score';
    score.textContent = `${(pred.score * 100).toFixed(2)}%`;
    
    moveItem.appendChild(rank);
    moveItem.appendChild(notation);
    moveItem.appendChild(barContainer);
    moveItem.appendChild(score);
    
    moveItem.addEventListener('click', () => executeMove(pred.label));
    
    movesListEl.appendChild(moveItem);
  });
  
  // Add illegal moves percentage indicator
  if (illegalMovesCount > 0) {
    const illegalSummary = document.createElement('div');
    illegalSummary.className = 'illegal-summary';
    illegalSummary.innerHTML = `
      <small>
        ⚠ <strong>${illegalMovesCount}/${predictions.length}</strong> illegal moves 
        (<strong>${(illegalMovesProbability * 100).toFixed(1)}%</strong> probability)
      </small>
    `;
    movesListEl.insertBefore(illegalSummary, movesListEl.firstChild);
  }
}

// Visualize moves with SVG arrows
function visualizeMoves(predictions) {
  clearMoveArrows();
  
  predictions.forEach((pred, idx) => {
    const move = pred.label;
    if (move.length >= 4) {
      const from = move.substring(0, 2);
      const to = move.substring(2, 4);
      
      drawArrow(from, to, pred.score, idx);
    }
  });
}

// Draw SVG arrow from source to target square
function drawArrow(from, to, score, index, isSelected = false) {
  const boardEl = document.getElementById('board');
  const fromSquare = boardEl.querySelector(`.square-${from}`);
  const toSquare = boardEl.querySelector(`.square-${to}`);
  
  if (!fromSquare || !toSquare) return;
  
  // Get square positions relative to board container
  const boardContainer = boardEl.parentElement;
  const containerRect = boardContainer.getBoundingClientRect();
  const fromRect = fromSquare.getBoundingClientRect();
  const toRect = toSquare.getBoundingClientRect();
  
  // Calculate relative positions to container (not just board)
  const fromX = fromRect.left - containerRect.left + fromRect.width / 2;
  const fromY = fromRect.top - containerRect.top + fromRect.height / 2;
  const toX = toRect.left - containerRect.left + toRect.width / 2;
  const toY = toRect.top - containerRect.top + toRect.height / 2;
  
  // All arrows are green, opacity based on rank
  const color = '#4cc38a';
  const opacity = isSelected ? 1 : Math.max(0.4, Math.min(0.9, 0.9 - index * 0.15));
  
  // Create SVG arrow
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.pointerEvents = 'none';
  svg.style.zIndex = '10';
  svg.classList.add('move-arrow');
  
  // Add pulse animation for selected moves
  if (isSelected) {
    svg.classList.add('selected-arrow');
  }
  
  // Create arrow path
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', fromX);
  line.setAttribute('y1', fromY);
  line.setAttribute('x2', toX);
  line.setAttribute('y2', toY);
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '3');
  line.setAttribute('stroke-opacity', opacity);
  
  // Create unique arrow head marker for each color
  const markerId = `arrowhead-${index}`;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', markerId);
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '7');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '3.5');
  marker.setAttribute('orient', 'auto');
  
  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
  polygon.setAttribute('fill', color);
  polygon.setAttribute('fill-opacity', opacity);
  
  marker.appendChild(polygon);
  defs.appendChild(marker);
  line.setAttribute('marker-end', `url(#${markerId})`);
  svg.appendChild(defs);
  svg.appendChild(line);
  
  // Position SVG over board
  boardContainer.style.position = 'relative';
  boardContainer.appendChild(svg);
}

// Clear move arrows (keep highlights for attention)
function clearMoveArrows() {
  const boardContainer = document.querySelector('.board-container');
  const arrows = boardContainer.querySelectorAll('.move-arrow');
  arrows.forEach(arrow => arrow.remove());
}


// Execute a move on the board (when clicked in sidebar)
function executeMove(moveNotation) {
  if (moveNotation.length >= 4) {
    const from = moveNotation.substring(0, 2);
    const to = moveNotation.substring(2, 4);
    const promotion = moveNotation.length > 4 ? moveNotation[4] : 'q';
    
    try {
      const move = game.move({
        from: from,
        to: to,
        promotion: promotion
      });
      
      if (move) {
        // Update board and displays
        board.position(game.fen());
        currentFenEl.textContent = game.fen();
        fenInput.value = game.fen();
        
        console.log('Executed move:', move.san, '| New FEN:', game.fen());
        
        // Automatically analyze the new position
        setTimeout(() => analyzePosition(), 100);
      }
    } catch (error) {
      console.log('Invalid move:', moveNotation);
      // Just highlight the move if it can't be executed
      highlightMove(moveNotation);
    }
  }
}

// Highlight a specific move (fallback for invalid moves)
function highlightMove(moveNotation) {
  clearMoveArrows();
  
  if (moveNotation.length >= 4) {
    const from = moveNotation.substring(0, 2);
    const to = moveNotation.substring(2, 4);
    drawArrow(from, to, 1, 0, true);
  }
}

// Generate random position
async function randomizePosition() {
  const positions = await loadChessPositions();
  
  if (positions && positions.length > 0) {
    // Sample from professional games dataset
    const randomPos = positions[Math.floor(Math.random() * positions.length)];
    console.log(`Loading ${randomPos.phase} position (move ${randomPos.move_number}, ${randomPos.turn} to move)`);
    loadFen(randomPos.fen);
  } else {
    // Fallback to hardcoded positions
    const fallbackPositions = [
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 2 2',
      'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
      'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
      'rnbqk2r/pp1pppbp/3P1np1/8/3pP3/2N2N2/PPP2PPP/R1BQKB1R b KQkq e3 0 5',
      '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
      'r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1'
    ];
    
    const randomFen = fallbackPositions[Math.floor(Math.random() * fallbackPositions.length)];
    loadFen(randomFen);
  }
}

// Load FEN string
function loadFen(fen) {
  try {
    game.load(fen);
    board.position(game.fen());
    currentFenEl.textContent = game.fen();
    fenInput.value = game.fen();
    clearMoveArrows();
    
    // Automatically analyze the new position
    setTimeout(() => analyzePosition(), 200);
  } catch (err) {
    console.error('Invalid FEN:', err);
    statusEl.textContent = 'Invalid FEN string';
  }
}

// Initialize chess board
function initBoard() {
  const config = {
    draggable: true,
    position: 'start',
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd,
    pieceTheme: function(piece) {
      return getPieceDataUrl(piece);
    }
  };
  
  board = Chessboard('board', config);
  
  // Update FEN display
  currentFenEl.textContent = game.fen();
  fenInput.value = game.fen();
  
  $(window).resize(board.resize);
}

// Chess board event handlers
function onDragStart(source, piece, position, orientation) {
  // Check if game is over
  if (game.isGameOver()) return false;
  
  // Only pick up pieces for the side to move
  const turn = game.turn();
  if ((turn === 'w' && piece.search(/^b/) !== -1) ||
      (turn === 'b' && piece.search(/^w/) !== -1)) {
    return false;
  }
  
  return true;
}

function onDrop(source, target) {
  // Stop autoplay when user manually moves
  if (isAutoplayActive) {
    stopAutoplay();
  }
  
  // Try to make the move
  try {
    const move = game.move({
      from: source,
      to: target,
      promotion: 'q' // Always promote to queen for simplicity
    });
    
    // If move was successful, update displays
    if (move) {
      currentFenEl.textContent = game.fen();
      fenInput.value = game.fen();
      
      // Clear any existing visualizations
      clearMoveArrows();
      
      console.log('Move made:', move.san, '| New FEN:', game.fen());
      
      // Automatically analyze the new position
      setTimeout(() => analyzePosition(), 100);
      return;
    }
  } catch (error) {
    console.log('Invalid move attempt:', source, 'to', target);
  }
  
  // If we get here, the move was invalid
  return 'snapback';
}

function onSnapEnd() {
  // Sync board position with game state
  board.position(game.fen());
}

// Autoplay functionality
function toggleAutoplay() {
  const autoplayToggle = document.getElementById('autoplay-toggle');
  isAutoplayActive = autoplayToggle.checked;
  
  if (isAutoplayActive) {
    console.log('Autoplay started');
    scheduleAutoplayMove();
  } else {
    console.log('Autoplay stopped');
    if (autoplayInterval) {
      clearTimeout(autoplayInterval);
      autoplayInterval = null;
    }
  }
}

function stopAutoplay() {
  isAutoplayActive = false;
  const autoplayToggle = document.getElementById('autoplay-toggle');
  autoplayToggle.checked = false;
  
  if (autoplayInterval) {
    clearTimeout(autoplayInterval);
    autoplayInterval = null;
  }
  
  console.log('Autoplay stopped');
}

function scheduleAutoplayMove() {
  if (!isAutoplayActive || game.isGameOver()) {
    stopAutoplay();
    return;
  }
  
  autoplayInterval = setTimeout(() => {
    executeAutoplayMove();
  }, 2000); // 2 second delay
}

// Probability-weighted sampling from top moves
function sampleMove(predictions) {
  // Filter to only legal moves from top 10
  const legalMoves = predictions.slice(0, 10).filter(pred => isMoveLegal(pred.label));
  
  if (legalMoves.length === 0) {
    console.log('No legal moves in top 10, declaring defeat');
    return null;
  }
  
  // Normalize probabilities for legal moves only
  const totalProb = legalMoves.reduce((sum, pred) => sum + pred.score, 0);
  const normalizedMoves = legalMoves.map(pred => ({
    ...pred,
    normalizedScore: pred.score / totalProb
  }));
  
  // Weighted random sampling
  const random = Math.random();
  let cumulativeProb = 0;
  
  for (const move of normalizedMoves) {
    cumulativeProb += move.normalizedScore;
    if (random <= cumulativeProb) {
      return move;
    }
  }
  
  // Fallback to first legal move
  return legalMoves[0];
}

function executeAutoplayMove() {
  if (!isAutoplayActive || !lastPredictions.length) {
    stopAutoplay();
    return;
  }
  
  // Sample move using probability weighting
  const selectedMove = sampleMove(lastPredictions);
  
  if (!selectedMove) {
    console.log('No legal moves found, declaring defeat');
    statusEl.textContent = 'Game over - No legal moves';
    stopAutoplay();
    return;
  }
  
  console.log('Autoplay sampled:', selectedMove.label, 
    `(${(selectedMove.score * 100).toFixed(2)}% original, ${(selectedMove.normalizedScore * 100).toFixed(2)}% normalized)`);
  executeMove(selectedMove.label);
}

// Modal functionality
function openModal() {
  document.getElementById('tokenization-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('tokenization-modal').classList.add('hidden');
}

// Event listeners
document.getElementById('randomize-btn').addEventListener('click', () => {
  randomizePosition().catch(console.error);
});
document.getElementById('start-pos-btn').addEventListener('click', () => {
  loadFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
});

document.getElementById('load-fen-btn').addEventListener('click', () => {
  const fen = fenInput.value.trim();
  if (fen) {
    loadFen(fen);
  }
});

document.getElementById('autoplay-toggle').addEventListener('change', toggleAutoplay);
document.getElementById('tokenization-info-btn').addEventListener('click', openModal);
document.getElementById('close-modal').addEventListener('click', closeModal);

// Close modal when clicking outside
document.getElementById('tokenization-modal').addEventListener('click', (e) => {
  if (e.target.id === 'tokenization-modal') {
    closeModal();
  }
});


// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  initBoard();
  ensureModelLoaded().then(() => {
    // Auto-analyze starting position
    setTimeout(() => analyzePosition(), 500);
  }).catch(console.error);
});