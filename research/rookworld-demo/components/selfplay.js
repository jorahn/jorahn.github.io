import { loadModel, generateText, simulateEnvironment, parseCoTResponse, isModelLoaded, currentModel } from '../model-utils.js';
import { getPieceDataUrl } from '../chess-pieces.js';
import { Chess } from 'chess.js';

export class SelfPlayComponent {
  constructor() {
    this.chess = new Chess();
    this.board = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.moveHistory = [];
    this.gameHistory = [];
    this.moveDelay = 2000;
    this.currentMoveNumber = 1;
    this.useEnvironmentSimulation = true; // Default: use full RookWorld simulation
    this.errorCount = 0;
    this.maxErrors = 3; // Reset game after 3 errors
  }

  async init() {
    console.log('Initializing Self-Play component');

    // Initialize chess board
    this.board = Chessboard('selfplay-board', {
      position: 'start',
      draggable: false,
      showNotation: true,
      pieceTheme: function(piece) {
        return getPieceDataUrl(piece);
      }
    });

    // Set up event listeners
    this.setupEventListeners();

    // Update display
    this.updateGameInfo();
  }

  setupEventListeners() {
    const startBtn = document.getElementById('start-selfplay-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => this.startSelfPlay());
    }

    const pauseBtn = document.getElementById('pause-selfplay-btn');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => this.pauseSelfPlay());
    }

    const resetBtn = document.getElementById('reset-selfplay-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetGame());
    }

    const delaySelect = document.getElementById('move-delay');
    if (delaySelect) {
      delaySelect.addEventListener('change', (e) => {
        this.moveDelay = parseInt(e.target.value);
      });
    }

    const envToggle = document.getElementById('environment-toggle');
    if (envToggle) {
      envToggle.addEventListener('change', (e) => {
        this.useEnvironmentSimulation = e.target.checked;
        this.updateEnvironmentToggleState();
      });
    }
  }

  async startSelfPlay() {
    if (!isModelLoaded()) {
      await loadModel('rookworld'); // Force RookWorld for self-play
    }

    this.isPlaying = true;
    this.isPaused = false;

    const startBtn = document.getElementById('start-selfplay-btn');
    const pauseBtn = document.getElementById('pause-selfplay-btn');

    if (startBtn) {
      startBtn.disabled = true;
      startBtn.textContent = 'Playing...';
    }
    if (pauseBtn) pauseBtn.disabled = false;

    this.updateGameStatus('Self-play in progress...');

    try {
      await this.playSelfPlayGame();
    } catch (error) {
      console.error('Self-play failed:', error);
      this.updateGameStatus(`Error: ${error.message}`);
    } finally {
      this.isPlaying = false;
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = 'Start Self-Play';
      }
      if (pauseBtn) pauseBtn.disabled = true;
    }
  }

  async playSelfPlayGame() {
    const maxMoves = 100; // Prevent infinite games
    this.errorCount = 0;

    for (let moveCount = 0; moveCount < maxMoves && this.isPlaying; moveCount++) {
      if (this.isPaused) {
        await this.waitForUnpause();
      }

      if (this.chess.isGameOver()) {
        this.handleGameEnd();
        break;
      }

      const currentFen = this.chess.fen();
      const turn = this.chess.turn() === 'w' ? 'White' : 'Black';

      this.updateGameStatus(`${turn} is thinking...`);

      try {
        // Step 1: Get move from policy
        const policyResult = await this.getMoveFromPolicy(currentFen);

        if (!policyResult || !policyResult.move) {
          await this.handleError('Policy failed to generate valid move', 'No move generated');
          break;
        }

        const { move, reasoning } = policyResult;

        // Step 2: Validate move legality with chess.js
        const legalMoves = this.chess.moves({ verbose: true });
        const isLegalMove = legalMoves.some(lm => lm.san === move || lm.lan === move || lm.from + lm.to === move);

        if (!isLegalMove) {
          await this.handleError(`Illegal move: ${move}`, `Move ${move} is not legal in position ${currentFen}`);
          continue; // Try to continue game after error
        }

        // Step 3: Make the move with chess.js
        const moveResult = this.chess.move(move);
        if (!moveResult) {
          await this.handleError(`Chess.js rejected move: ${move}`, `Move could not be applied to position`);
          continue;
        }

        const newFenFromChessJs = this.chess.fen();

        // Step 4: Environment simulation (if enabled and RookWorld model)
        if (this.useEnvironmentSimulation && currentModel === 'rookworld') {
          this.updateGameStatus(`${turn} validating with environment model...`);

          try {
            const envResult = await this.simulateEnvironmentStep(currentFen, move);

            // Compare environment prediction with chess.js reality
            if (envResult.nextState && envResult.nextState !== newFenFromChessJs) {
              await this.handleError(
                'Environment simulation mismatch',
                `Environment predicted: ${envResult.nextState}\nChess.js computed: ${newFenFromChessJs}\nMove: ${move}`
              );
              continue;
            }

            // Log environment accuracy
            console.log('Environment simulation accurate:', {
              move,
              predicted: envResult.nextState,
              actual: newFenFromChessJs,
              reward: envResult.reward,
              terminated: envResult.terminated
            });

          } catch (envError) {
            await this.handleError('Environment simulation failed', envError.message);
            continue;
          }
        }

        // Step 5: Update display
        this.board.position(newFenFromChessJs);
        this.moveHistory.push(move);
        this.gameHistory.push({
          move,
          fen: currentFen,
          newFen: newFenFromChessJs,
          reasoning,
          turn
        });

        // Update game info
        this.currentMoveNumber = Math.ceil(this.moveHistory.length / 2);
        this.updateGameInfo();

        // Reset error count on successful move
        this.errorCount = 0;

        // Wait for move delay
        if (this.moveDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, this.moveDelay));
        }

      } catch (error) {
        console.error('Self-play step failed:', error);
        await this.handleError('Self-play error', error.message);
        break;
      }
    }

    if (moveCount >= maxMoves) {
      this.updateGameStatus('Game ended - maximum moves reached');
    }
  }

  async getMoveFromPolicy(fen) {
    const liveReasoningEl = document.getElementById('live-reasoning');

    // Clear previous reasoning
    if (liveReasoningEl) {
      liveReasoningEl.innerHTML = '<div class="live-trace-container"></div>';
    }

    let fullResponse = '';
    let bestMove = null;

    // Stream the reasoning
    await generateText(fen, 256, async (token, fullText) => {
      fullResponse = fullText;

      // Update live reasoning display
      if (liveReasoningEl) {
        const container = liveReasoningEl.querySelector('.live-trace-container');
        if (container) {
          let displayText = fullText;

          // Add syntax highlighting
          displayText = displayText
            .replace(/M:\s*([^\n]*)/g, '<div class="trace-section moves"><strong>M:</strong> $1</div>')
            .replace(/E:\s*([^\n]*)/g, '<div class="trace-section evals"><strong>E:</strong> $1</div>')
            .replace(/B:\s*([^\n]*)/g, '<div class="trace-section best"><strong>B:</strong> $1</div>');

          container.innerHTML = displayText + '<span class="live-cursor">▊</span>';
          container.scrollTop = container.scrollHeight;
        }
      }

      // Extract best move as soon as it's available
      const parsed = parseCoTResponse('P: ' + fen + ' ' + fullText);
      if (parsed.bestMove && !bestMove) {
        bestMove = parsed.bestMove;
      }

      await new Promise(resolve => setTimeout(resolve, 30));
    });

    // Remove cursor
    if (liveReasoningEl) {
      const cursor = liveReasoningEl.querySelector('.live-cursor');
      if (cursor) cursor.remove();
    }

    // Parse final response
    const finalParsed = parseCoTResponse('P: ' + fen + ' ' + fullResponse);

    return {
      move: bestMove || finalParsed.bestMove,
      reasoning: fullResponse,
      candidates: finalParsed.moves,
      evaluations: finalParsed.evaluations
    };
  }

  async simulateEnvironmentStep(state, action) {
    try {
      const result = await simulateEnvironment(state, action, this.moveHistory);
      return result;
    } catch (error) {
      console.error('Environment simulation failed:', error);
      throw error;
    }
  }

  async handleError(title, details) {
    this.errorCount++;

    // Show error in live reasoning
    const liveReasoningEl = document.getElementById('live-reasoning');
    if (liveReasoningEl) {
      liveReasoningEl.innerHTML = `
        <div class="error-display">
          <h4>⚠️ ${title}</h4>
          <pre>${details}</pre>
          <p>Error ${this.errorCount}/${this.maxErrors} - ${this.maxErrors - this.errorCount} attempts remaining</p>
        </div>
      `;
    }

    // Update game status
    this.updateGameStatus(`Error: ${title}`);

    // Wait 5 seconds as requested
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Reset game if too many errors
    if (this.errorCount >= this.maxErrors) {
      this.updateGameStatus('Too many errors - resetting game...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      this.resetGame();
      this.errorCount = 0;

      // Restart self-play automatically
      if (this.isPlaying) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        this.startSelfPlay();
      }
    }
  }

  updateEnvironmentToggleState() {
    const envToggle = document.getElementById('environment-toggle');
    const description = document.querySelector('.toggle-description');

    if (!envToggle) return;

    // Force disable environment simulation for ROOK-LM
    if (currentModel === 'rook-lm') {
      envToggle.checked = false;
      envToggle.disabled = true;
      this.useEnvironmentSimulation = false;
      if (description) {
        description.textContent = 'Environment simulation not available with ROOK-LM (policy-only model)';
      }
    } else {
      envToggle.disabled = false;
      this.useEnvironmentSimulation = envToggle.checked;
      if (description) {
        description.textContent = envToggle.checked
          ? 'Using RookWorld\'s environment model to validate moves and simulate state transitions'
          : 'Policy-only mode - moves validated by chess.js only';
      }
    }
  }

  pauseSelfPlay() {
    this.isPaused = !this.isPaused;
    const pauseBtn = document.getElementById('pause-selfplay-btn');

    if (pauseBtn) {
      pauseBtn.textContent = this.isPaused ? 'Resume' : 'Pause';
    }

    this.updateGameStatus(this.isPaused ? 'Game paused' : 'Resuming...');
  }

  async waitForUnpause() {
    while (this.isPaused && this.isPlaying) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  resetGame() {
    this.isPlaying = false;
    this.isPaused = false;
    this.chess.reset();
    this.board.position('start');
    this.moveHistory = [];
    this.gameHistory = [];
    this.currentMoveNumber = 1;

    // Reset UI
    const startBtn = document.getElementById('start-selfplay-btn');
    const pauseBtn = document.getElementById('pause-selfplay-btn');
    const liveReasoningEl = document.getElementById('live-reasoning');

    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = 'Start Self-Play';
    }
    if (pauseBtn) {
      pauseBtn.disabled = true;
      pauseBtn.textContent = 'Pause';
    }
    if (liveReasoningEl) {
      liveReasoningEl.innerHTML = '<p class="placeholder">Start a self-play game to see live reasoning traces...</p>';
    }

    this.updateGameInfo();
    this.updateGameStatus('Ready to start');
  }

  handleGameEnd() {
    let result = 'Game ended';

    if (this.chess.isCheckmate()) {
      const winner = this.chess.turn() === 'w' ? 'Black' : 'White';
      result = `Checkmate! ${winner} wins`;
    } else if (this.chess.isDraw()) {
      result = 'Draw';
    } else if (this.chess.isStalemate()) {
      result = 'Stalemate';
    }

    this.updateGameStatus(result);
    console.log('Game finished:', result, 'Moves:', this.moveHistory.length);
  }

  updateGameInfo() {
    const moveCountEl = document.getElementById('move-count');
    const currentTurnEl = document.getElementById('current-turn');

    if (moveCountEl) moveCountEl.textContent = this.currentMoveNumber;
    if (currentTurnEl) {
      currentTurnEl.textContent = this.chess.turn() === 'w' ? 'White' : 'Black';
    }
  }

  updateGameStatus(status) {
    const statusEl = document.getElementById('game-status');
    if (statusEl) statusEl.textContent = status;
  }
}