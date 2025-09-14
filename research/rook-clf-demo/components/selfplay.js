import { Chess } from 'chess.js';
import { getPieceDataUrl } from '../chess-pieces.js';
import { runInference, getModelInfo } from '../model-utils.js';

export class SelfplayComponent {
  constructor() {
    this.board = null;
    this.game = new Chess();
    this.moveArrows = [];
    this.autoplayInterval = null;
    this.isAutoplayActive = true;
    this.lastPredictions = [];
    
    // DOM elements (will be set on init)
    this.statusEl = null;
    this.fenInput = null;
    this.currentFenEl = null;
    this.movesListEl = null;
    this.numClassesEl = null;
  }
  
  async init() {
    console.log('Initializing Selfplay component');
    
    // Get DOM elements
    this.statusEl = document.getElementById('status');
    this.fenInput = document.getElementById('fen-input');
    this.currentFenEl = document.getElementById('current-fen');
    this.movesListEl = document.getElementById('moves-list');
    this.numClassesEl = document.getElementById('num-classes');
    
    // Initialize chess board
    this.initBoard();
    
    // Set up event listeners
    this.setupEventListeners();
    
    console.log('Selfplay component initialized');
  }
  
  initBoard() {
    const config = {
      draggable: true,
      position: 'start',
      onDragStart: this.onDragStart.bind(this),
      onDrop: this.onDrop.bind(this),
      onSnapEnd: this.onSnapEnd.bind(this),
      pieceTheme: function(piece) {
        return getPieceDataUrl(piece);
      }
    };
    
    this.board = Chessboard('board', config);
    
    // Update FEN display
    this.currentFenEl.textContent = this.game.fen();
    this.fenInput.value = this.game.fen();
    
    $(window).resize(this.board.resize);
  }
  
  setupEventListeners() {
    // Position controls
    document.getElementById('randomize-btn').addEventListener('click', () => {
      this.randomizePosition().catch(console.error);
    });
    
    document.getElementById('start-pos-btn').addEventListener('click', () => {
      this.loadFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    });
    
    document.getElementById('load-fen-btn').addEventListener('click', () => {
      const fen = this.fenInput.value.trim();
      if (fen) {
        this.loadFen(fen);
      }
    });
    
    // Autoplay toggle
    document.getElementById('autoplay-toggle').addEventListener('change', this.toggleAutoplay.bind(this));
    
    // Modal controls
    document.getElementById('tokenization-info-btn').addEventListener('click', this.openModal);
    document.getElementById('close-modal').addEventListener('click', this.closeModal);
    
    // Close modal when clicking outside
    document.getElementById('tokenization-modal').addEventListener('click', (e) => {
      if (e.target.id === 'tokenization-modal') {
        this.closeModal();
      }
    });
  }
  
  async onActivate() {
    console.log('Selfplay component activated');
    
    // Update model info if available
    const modelInfo = getModelInfo();
    if (modelInfo && modelInfo.numClasses) {
      this.numClassesEl.textContent = modelInfo.numClasses;
    }
    
    // Start with initial analysis if model is loaded
    if (modelInfo && modelInfo.isLoaded) {
      setTimeout(() => this.analyzePosition(), 500);
    }
  }
  
  onDeactivate() {
    console.log('Selfplay component deactivated');
    this.stopAutoplay();
    this.clearMoveArrows();
  }
  
  onModelLoaded() {
    console.log('Model loaded notification received in Selfplay component');
    
    // Update model info display
    const modelInfo = getModelInfo();
    if (modelInfo && modelInfo.numClasses) {
      this.numClassesEl.textContent = modelInfo.numClasses;
    }
    
    // Update execution provider display
    const executionProviderEl = document.getElementById('execution-provider');
    if (executionProviderEl && modelInfo) {
      const provider = modelInfo.executionProvider;
      const displayText = provider === 'webgpu' ? 'ONNX WebGPU (GPU-accelerated)' :
                         provider === 'webgl' ? 'ONNX WebGL (GPU-accelerated)' :
                         'ONNX WebAssembly';
      executionProviderEl.textContent = displayText;
      
      // Add visual indicator for acceleration
      if (modelInfo.isAccelerated) {
        executionProviderEl.style.color = 'var(--success)';
        executionProviderEl.title = 'GPU acceleration available';
      }
    }
    
    this.statusEl.textContent = 'Model ready';
    
    // Auto-analyze starting position
    setTimeout(() => this.analyzePosition(), 500);
  }
  
  // Chess board event handlers
  onDragStart(source, piece, position, orientation) {
    // Check if game is over
    if (this.game.isGameOver()) return false;
    
    // Only pick up pieces for the side to move
    const turn = this.game.turn();
    if ((turn === 'w' && piece.search(/^b/) !== -1) ||
        (turn === 'b' && piece.search(/^w/) !== -1)) {
      return false;
    }
    
    return true;
  }
  
  onDrop(source, target) {
    // Stop autoplay when user manually moves
    if (this.isAutoplayActive) {
      this.stopAutoplay();
    }
    
    // Try to make the move
    try {
      const move = this.game.move({
        from: source,
        to: target,
        promotion: 'q' // Always promote to queen for simplicity
      });
      
      // If move was successful, update displays
      if (move) {
        this.currentFenEl.textContent = this.game.fen();
        this.fenInput.value = this.game.fen();
        
        // Clear any existing visualizations
        this.clearMoveArrows();
        
        console.log('Move made:', move.san, '| New FEN:', this.game.fen());
        
        // Automatically analyze the new position
        setTimeout(() => this.analyzePosition(), 100);
        return;
      }
    } catch (error) {
      console.log('Invalid move attempt:', source, 'to', target);
    }
    
    // If we get here, the move was invalid
    return 'snapback';
  }
  
  onSnapEnd() {
    // Sync board position with game state
    this.board.position(this.game.fen());
  }
  
  // Analysis functionality
  async analyzePosition() {
    this.statusEl.textContent = 'Analyzing position...';
    
    try {
      const fen = this.game.fen();
      const predictions = await runInference(fen);
      
      // Display top moves
      this.displayTopMoves(predictions.slice(0, 10));
      
      // Store predictions for autoplay
      this.lastPredictions = predictions;
      
      // Always visualize top 5 moves
      this.visualizeMoves(predictions.slice(0, 5));
      
      this.statusEl.textContent = 'Analysis complete';
      
      // Trigger autoplay move if active
      if (this.isAutoplayActive) {
        this.scheduleAutoplayMove();
      }
    } catch (err) {
      console.error('Analysis failed:', err);
      this.statusEl.textContent = 'Analysis failed';
    }
  }
  
  // Check if a move is legal in the current position
  isMoveLegal(moveNotation) {
    if (moveNotation.length < 4) return false;
    
    const from = moveNotation.substring(0, 2);
    const to = moveNotation.substring(2, 4);
    const promotion = moveNotation.length > 4 ? moveNotation[4] : undefined;
    
    try {
      // Try the move without actually making it
      const testGame = new Chess(this.game.fen());
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
  displayTopMoves(predictions) {
    this.movesListEl.innerHTML = '';
    
    let illegalMovesProbability = 0;
    let legalMovesCount = 0;
    let illegalMovesCount = 0;
    
    predictions.forEach((pred, idx) => {
      const isLegal = this.isMoveLegal(pred.label);
      
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
      
      moveItem.addEventListener('click', () => this.executeMove(pred.label));
      
      this.movesListEl.appendChild(moveItem);
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
      this.movesListEl.insertBefore(illegalSummary, this.movesListEl.firstChild);
    }
  }
  
  // Visualize moves with SVG arrows
  visualizeMoves(predictions) {
    this.clearMoveArrows();
    
    predictions.forEach((pred, idx) => {
      const move = pred.label;
      if (move.length >= 4) {
        const from = move.substring(0, 2);
        const to = move.substring(2, 4);
        
        this.drawArrow(from, to, pred.score, idx);
      }
    });
  }
  
  // Draw SVG arrow from source to target square
  drawArrow(from, to, score, index, isSelected = false) {
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
  
  // Clear move arrows
  clearMoveArrows() {
    const boardContainer = document.querySelector('.board-container');
    if (boardContainer) {
      const arrows = boardContainer.querySelectorAll('.move-arrow');
      arrows.forEach(arrow => arrow.remove());
    }
  }
  
  // Execute a move on the board (when clicked in sidebar)
  executeMove(moveNotation) {
    if (moveNotation.length >= 4) {
      const from = moveNotation.substring(0, 2);
      const to = moveNotation.substring(2, 4);
      const promotion = moveNotation.length > 4 ? moveNotation[4] : 'q';
      
      try {
        const move = this.game.move({
          from: from,
          to: to,
          promotion: promotion
        });
        
        if (move) {
          // Update board and displays
          this.board.position(this.game.fen());
          this.currentFenEl.textContent = this.game.fen();
          this.fenInput.value = this.game.fen();
          
          console.log('Executed move:', move.san, '| New FEN:', this.game.fen());
          
          // Automatically analyze the new position
          setTimeout(() => this.analyzePosition(), 100);
        }
      } catch (error) {
        console.log('Invalid move:', moveNotation);
        // Just highlight the move if it can't be executed
        this.highlightMove(moveNotation);
      }
    }
  }
  
  // Highlight a specific move (fallback for invalid moves)
  highlightMove(moveNotation) {
    this.clearMoveArrows();
    
    if (moveNotation.length >= 4) {
      const from = moveNotation.substring(0, 2);
      const to = moveNotation.substring(2, 4);
      this.drawArrow(from, to, 1, 0, true);
    }
  }
  
  // Generate random position
  async randomizePosition() {
    const positions = await this.loadChessPositions();
    
    if (positions && positions.length > 0) {
      // Sample from professional games dataset
      const randomPos = positions[Math.floor(Math.random() * positions.length)];
      console.log(`Loading ${randomPos.phase} position (move ${randomPos.move_number}, ${randomPos.turn} to move)`);
      this.loadFen(randomPos.fen);
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
      this.loadFen(randomFen);
    }
  }
  
  // Load chess positions dataset
  async loadChessPositions() {
    try {
      const response = await fetch('./chess_positions.json');
      return await response.json();
    } catch (error) {
      console.log('Could not load positions dataset, using fallback');
      return null;
    }
  }
  
  // Load FEN string
  loadFen(fen) {
    try {
      this.game.load(fen);
      this.board.position(this.game.fen());
      this.currentFenEl.textContent = this.game.fen();
      this.fenInput.value = this.game.fen();
      this.clearMoveArrows();
      
      // Automatically analyze the new position
      setTimeout(() => this.analyzePosition(), 200);
    } catch (err) {
      console.error('Invalid FEN:', err);
      this.statusEl.textContent = 'Invalid FEN string';
    }
  }
  
  // Autoplay functionality
  toggleAutoplay() {
    const autoplayToggle = document.getElementById('autoplay-toggle');
    this.isAutoplayActive = autoplayToggle.checked;
    
    if (this.isAutoplayActive) {
      console.log('Autoplay started');
      this.scheduleAutoplayMove();
    } else {
      console.log('Autoplay stopped');
      if (this.autoplayInterval) {
        clearTimeout(this.autoplayInterval);
        this.autoplayInterval = null;
      }
    }
  }
  
  stopAutoplay() {
    this.isAutoplayActive = false;
    const autoplayToggle = document.getElementById('autoplay-toggle');
    if (autoplayToggle) {
      autoplayToggle.checked = false;
    }
    
    if (this.autoplayInterval) {
      clearTimeout(this.autoplayInterval);
      this.autoplayInterval = null;
    }
    
    console.log('Autoplay stopped');
  }
  
  scheduleAutoplayMove() {
    if (!this.isAutoplayActive || this.game.isGameOver()) {
      this.stopAutoplay();
      return;
    }
    
    this.autoplayInterval = setTimeout(() => {
      this.executeAutoplayMove();
    }, 2000); // 2 second delay
  }
  
  // Probability-weighted sampling from top moves
  sampleMove(predictions) {
    // Filter to only legal moves from top 10
    const legalMoves = predictions.slice(0, 10).filter(pred => this.isMoveLegal(pred.label));
    
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
  
  executeAutoplayMove() {
    if (!this.isAutoplayActive || !this.lastPredictions.length) {
      this.stopAutoplay();
      return;
    }
    
    // Sample move using probability weighting
    const selectedMove = this.sampleMove(this.lastPredictions);
    
    if (!selectedMove) {
      console.log('No legal moves found, declaring defeat');
      this.statusEl.textContent = 'Game over - No legal moves';
      this.stopAutoplay();
      return;
    }
    
    console.log('Autoplay sampled:', selectedMove.label, 
      `(${(selectedMove.score * 100).toFixed(2)}% original, ${(selectedMove.normalizedScore * 100).toFixed(2)}% normalized)`);
    this.executeMove(selectedMove.label);
  }
  
  // Modal functionality
  openModal() {
    document.getElementById('tokenization-modal').classList.remove('hidden');
  }
  
  closeModal() {
    document.getElementById('tokenization-modal').classList.add('hidden');
  }
}