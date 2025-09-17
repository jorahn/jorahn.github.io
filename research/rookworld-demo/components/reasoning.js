import { initializeModel, generateText, generateEnvironment, parseChessOutput, parseEnvironmentOutput, isModelReady, getCurrentModel, switchModel as switchToModel } from '../model-utils.js';
import { getPieceDataUrl } from '../chess-pieces.js';
import { Chess } from 'chess.js';

export class ReasoningComponent {
  constructor() {
    this.chess = new Chess();
    this.board = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.moveHistory = [];
    this.gameHistory = [];
    this.moveDelay = 0;
    this.currentMoveNumber = 1;
    this.useEnvironmentSimulation = false; // Default to disabled
    this.errorCount = 0;
    this.maxErrors = 3;
    this.abortController = null; // For canceling generation
    this.cancellationToken = { cancelled: false }; // For new model-utils
  }

  async init() {
    // console.log('Initializing Reasoning component');

    // Wait for DOM elements to be available
    await this.waitForElements();

    // Initialize chess board
    const boardElement = document.getElementById('board');
    if (!boardElement) {
      console.error('Board element not found');
      return;
    }

    this.board = Chessboard('board', {
      position: 'start',
      draggable: false,
      showNotation: true,
      pieceTheme: function(piece) {
        return getPieceDataUrl(piece);
      }
    });

    // Set up event listeners
    this.setupEventListeners();

    // Initialize environment toggle and game state
    await this.initializeEnvironmentToggle();
  }

  async waitForElements() {
    // Wait for required DOM elements to be available
    const requiredElements = ['board', 'start-selfplay-btn', 'live-reasoning'];

    for (const elementId of requiredElements) {
      while (!document.getElementById(elementId)) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // console.log('All required DOM elements found');
  }

  setupEventListeners() {
    // Self-play controls (now in reasoning component)
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

    // Move delay
    const delaySelect = document.getElementById('move-delay');
    if (delaySelect) {
      delaySelect.addEventListener('change', (e) => {
        this.moveDelay = parseInt(e.target.value);
      });
    }

    // Environment toggle
    const envToggle = document.getElementById('environment-toggle');
    if (envToggle) {
      envToggle.addEventListener('change', (e) => {
        // console.log('Toggle clicked:', e.target.checked);
        this.useEnvironmentSimulation = e.target.checked;
        // Don't call updateEnvironmentToggleState here as it would override the user's choice
      });
    }

    // Model selector
    const modelSelect = document.getElementById('model-select');
    if (modelSelect) {
      modelSelect.addEventListener('change', async (e) => {
        await this.switchModel(e.target.value);
      });
    }
  }

  async startSelfPlay() {
    if (!isModelReady()) {
      this.showError('Please load a model first');
      return;
    }

    this.isPlaying = true;
    this.isPaused = false;
    this.errorCount = 0;
    this.cancellationToken = { cancelled: false };

    // Update UI
    document.getElementById('start-selfplay-btn').disabled = true;
    document.getElementById('pause-selfplay-btn').disabled = false;
    document.getElementById('reset-selfplay-btn').disabled = false;

    // Show immediate feedback that self-play is starting
    const statusEl = document.getElementById('reasoning-status');
    if (statusEl) {
      statusEl.textContent = 'Starting self-play...';
    }

    // Update game status to Playing
    this.updateGameStatus('Playing...');

    const traceEl = document.getElementById('live-reasoning');
    if (traceEl) {
      traceEl.innerHTML = '<div class="thinking-text">Initializing self-play game...</div>';
    }

    // Small delay to let UI update
    await new Promise(resolve => setTimeout(resolve, 10));

    await this.playSelfPlayGame();

    // Only update buttons if game actually ended (not just paused)
    if (!this.isPaused) {
      // Game ended naturally
      document.getElementById('start-selfplay-btn').disabled = false;
      document.getElementById('pause-selfplay-btn').disabled = true;
    }
    // If paused, keep pause button enabled so user can resume
  }

  pauseSelfPlay() {
    this.isPaused = !this.isPaused;
    const btn = document.getElementById('pause-selfplay-btn');
    btn.textContent = this.isPaused ? 'Resume' : 'Pause';

    if (this.isPaused) {
      // Cancel current generation when pausing
      if (this.cancellationToken) {
        this.cancellationToken.cancelled = true;
      }
      // Update status to show paused
      this.updateGameStatus('Paused');
    } else {
      // Resuming - create fresh cancellation token
      this.cancellationToken = { cancelled: false };
      // Update status to show playing again
      this.updateGameStatus('Playing...');
      if (this.isPlaying) {
        this.playSelfPlayGame();
      }
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
    this.errorCount = 0;

    // Cancel any ongoing generation
    if (this.cancellationToken) {
      this.cancellationToken.cancelled = true;
    }

    // Update UI
    document.getElementById('start-selfplay-btn').disabled = false;
    document.getElementById('pause-selfplay-btn').disabled = true;
    document.getElementById('pause-selfplay-btn').textContent = 'Pause';
    document.getElementById('reset-selfplay-btn').disabled = false;

    // Update game status to show reset
    this.updateGameStatus('Ready to start');
    this.updateGameInfo();
    this.updateFenDisplay();
    this.clearLiveReasoning();
  }

  async playSelfPlayGame() {
    const maxMoves = 100;

    while (this.isPlaying && !this.isPaused && this.moveHistory.length < maxMoves && !this.chess.isGameOver()) {
      try {
        const currentFen = this.chess.fen();
        const turn = this.chess.turn() === 'w' ? 'White' : 'Black';

        // Step 1: Generate move using policy model
        const { text: reasoning, parsed } = await this.streamAnalysis(currentFen);

        if (!reasoning || this.cancellationToken.cancelled) break;

        const move = parsed.bestMove;
        if (!move) {
          await this.handleError('No valid move generated', 'The model did not produce a valid move');
          continue;
        }

        // Step 2: Validate move with chess.js
        let moveResult;
        try {
          moveResult = this.chess.move({
            from: move.substring(0, 2),
            to: move.substring(2, 4),
            promotion: move.length > 4 ? move[4] : undefined
          });
        } catch (e) {
          await this.handleError('Invalid move attempted', `Move ${move} is not legal in position ${currentFen}`);
          continue;
        }

        const newFenFromChessJs = this.chess.fen();

        // Step 3 (optional): Environment simulation for RookWorld-LM
        // Only run if explicitly enabled by user (toggle is checked)
        if (this.useEnvironmentSimulation) {
          try {
            // Build history string including current move
            const historyWithCurrent = [...this.moveHistory, move];
            const historyStr = historyWithCurrent.join(' ');

            // Don't clear the reasoning display, just add environment info
            await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to see the move

            const traceEl = document.getElementById('live-reasoning');

            // Create environment section for streaming
            const envContainer = document.createElement('div');
            envContainer.className = 'environment-container';
            envContainer.innerHTML = '<div class="trace-section environment-section"><strong>Environment:</strong> Simulating state transition...</div>';
            if (traceEl) {
              traceEl.appendChild(envContainer);
            }

            const envResult = await generateEnvironment(currentFen, move, historyStr, {
              maxTokens: 100,
              cancellationToken: this.cancellationToken,
              onToken: (text) => {
                // Stream environment output with formatting
                if (envContainer) {
                  const formatted = this.formatEnvironmentText(text);
                  envContainer.innerHTML = `<div class="environment-section">${formatted}</div>`;
                }

                // Stop generation after complete schema (4 segments + final delimiter)
                const parsed = parseEnvironmentOutput(text);
                if (parsed.complete) {
                  this.cancellationToken.cancelled = true;
                }
              }
            });

            // Use environment output to update game state
            if (envResult && envResult.state) {
              const isCorrect = envResult.state === newFenFromChessJs;

              // Final display with game outcome
              if (envContainer) {
                let outcomeText = '';
                if (envResult.termination) {
                  outcomeText = `<div class="env-outcome"><strong>Game Over:</strong> ${envResult.winner || 'Draw'} wins!</div>`;
                } else if (envResult.truncation) {
                  outcomeText = `<div class="env-outcome"><strong>Invalid:</strong> Move/position truncated</div>`;
                }

                envContainer.innerHTML = `
                  <div class="environment-section ${isCorrect ? 'env-correct' : 'env-incorrect'}">
                    ${this.formatEnvironmentText(envResult.raw)}
                    ${outcomeText}
                    <div class="env-validation">
                      <strong>Validation:</strong>
                      <span class="${isCorrect ? 'env-match' : 'env-mismatch'}">
                        ${isCorrect ? '✓ Correct state' : '✗ State mismatch'}
                      </span>
                    </div>
                  </div>
                `;
              }

              // Now update the board position after environment generation is complete
              this.board.position(newFenFromChessJs);

              // Use environment's state if available and correct
              if (isCorrect && envResult.state) {
                // Update chess.js with environment's FEN
                this.chess.load(envResult.state);

                // Check game end conditions from environment
                if (envResult.termination) {
                  this.updateGameStatus(`Game Over - ${envResult.winner || 'Draw'}`);
                  this.isPlaying = false;

                  // Keep visible for final state
                  await new Promise(resolve => setTimeout(resolve, 3000));
                  break; // End the game loop
                }

                if (envResult.truncation) {
                  await this.handleError('Invalid move/position', 'Environment detected truncation');
                  continue; // Skip this move
                }
              } else if (!isCorrect) {
                console.warn('Environment state mismatch, using chess.js:', {
                  move,
                  predicted: envResult.state,
                  actual: newFenFromChessJs
                });
              }

              // Keep environment result visible for 2 seconds
              await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
              // If environment generation failed, update board now
              this.board.position(newFenFromChessJs);
            }
          } catch (envError) {
            await this.handleError('Environment simulation failed', envError.message);
            // Continue with game even if environment simulation fails
          }
        }

        // Step 4: Update display (but don't update board position yet if environment sim is running)
        this.clearBoardAnnotations(); // Clear candidate move highlights

        // Only update board immediately if environment simulation is disabled
        if (!this.useEnvironmentSimulation) {
          this.board.position(newFenFromChessJs);
        }
        // Otherwise board will be updated after environment generation completes

        this.moveHistory.push(move);
        this.gameHistory.push({ move, fen: currentFen, newFen: newFenFromChessJs, reasoning, turn });

        this.currentMoveNumber = Math.ceil(this.moveHistory.length / 2);
        this.updateGameInfo();
        this.updateFenDisplay();
        this.errorCount = 0;

        if (this.moveDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, this.moveDelay));
        }

      } catch (error) {
        console.error('Self-play step failed:', error);
        await this.handleError('Self-play error', error.message);
        break;
      }
    }

    // Check game end conditions
    if (this.chess.isGameOver()) {
      let status = 'Game Over - ';
      if (this.chess.isCheckmate()) status += 'Checkmate!';
      else if (this.chess.isDraw()) status += 'Draw';
      else if (this.chess.isStalemate()) status += 'Stalemate';
      this.updateGameStatus(status);
    } else if (this.moveHistory.length >= maxMoves) {
      this.updateGameStatus('Game ended - maximum moves reached');
    }

    this.isPlaying = false;
  }

  // Initialize environment toggle state on load
  async initializeEnvironmentToggle() {
    this.updateEnvironmentToggleState();

    // Set initial game info
    this.updateGameInfo();
    this.updateFenDisplay();

    // Do NOT automatically enable environment simulation
    // Keep it disabled by default as set in constructor
  }

  drawCandidateMoves(moves, evaluations) {
    // Clear previous annotations
    this.clearBoardAnnotations();

    if (!moves || moves.length === 0) return;

    // console.log('Drawing candidate moves:', moves, evaluations);

    // Get board container - ChessBoard.js creates a div with class board-b72b1 inside #board
    const $board = $('#board');
    const $boardInner = $board.find('.board-b72b1');
    const $targetContainer = $boardInner.length > 0 ? $boardInner : $board;

    if ($targetContainer.length === 0 || $targetContainer.width() === 0) {
      // console.log('Board not ready for arrows');
      return;
    }

    const boardPos = $targetContainer.position();
    const squareSize = $targetContainer.width() / 8;
    // console.log('Board dimensions:', $targetContainer.width(), 'x', $targetContainer.height(), 'Square size:', squareSize);

    // Create SVG overlay if it doesn't exist
    let $svg = $('#board-arrows-svg');
    if ($svg.length === 0) {
      $svg = $(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
        .attr('id', 'board-arrows-svg')
        .attr('width', $targetContainer.width())
        .attr('height', $targetContainer.height())
        .css({
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          zIndex: 100
        });
      $targetContainer.css('position', 'relative'); // Ensure container is relatively positioned
      $targetContainer.append($svg);
      // console.log('Created SVG overlay on', $targetContainer.attr('class') || $targetContainer.attr('id'));
    } else {
      // Clear existing arrows
      $svg.empty();
    }

    // Add arrow definitions for different colors
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    ['green', 'red', 'yellow', 'blue'].forEach(color => {
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', `arrowhead-${color}`);
      marker.setAttribute('markerWidth', '10');
      marker.setAttribute('markerHeight', '10');
      marker.setAttribute('refX', '9');
      marker.setAttribute('refY', '3');
      marker.setAttribute('orient', 'auto');

      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', '0 0, 10 3, 0 6');
      polygon.setAttribute('fill', this.getArrowColor(color));
      marker.appendChild(polygon);
      defs.appendChild(marker);
    });
    $svg[0].appendChild(defs);

    moves.forEach((move, idx) => {
      if (move.length >= 4) {
        const from = move.substring(0, 2);
        const to = move.substring(2, 4);

        // Determine color based on evaluation
        let colorName = 'yellow';  // Default/pending
        if (evaluations && evaluations[idx] !== undefined) {
          const evalValue = evaluations[idx];
          if (evalValue > 0.3) colorName = 'green';
          else if (evalValue < -0.3) colorName = 'red';
          else colorName = 'yellow';
        }

        // console.log(`Drawing arrow: ${from} -> ${to} (${colorName})`);
        this.drawArrow($svg[0], from, to, colorName, squareSize);
      }
    });
  }

  getArrowColor(colorName) {
    const colors = {
      green: '#4caf50',
      red: '#f44336',
      yellow: '#ffc107',
      blue: '#2196f3'
    };
    return colors[colorName] || colors.yellow;
  }

  drawArrow(svg, from, to, colorName, squareSize) {
    const fromFile = from.charCodeAt(0) - 97; // a=0, b=1, etc.
    const fromRank = 8 - parseInt(from[1]);
    const toFile = to.charCodeAt(0) - 97;
    const toRank = 8 - parseInt(to[1]);

    const x1 = (fromFile + 0.5) * squareSize;
    const y1 = (fromRank + 0.5) * squareSize;
    const x2 = (toFile + 0.5) * squareSize;
    const y2 = (toRank + 0.5) * squareSize;

    // Shorten arrow slightly so it doesn't overlap the piece
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const shortenBy = squareSize * 0.15;
    const x2Short = x2 - (dx / length) * shortenBy;
    const y2Short = y2 - (dy / length) * shortenBy;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2Short);
    line.setAttribute('y2', y2Short);
    line.setAttribute('stroke', this.getArrowColor(colorName));
    line.setAttribute('stroke-width', '3');
    line.setAttribute('opacity', '0.7');
    line.setAttribute('marker-end', `url(#arrowhead-${colorName})`);
    line.classList.add('candidate-arrow');

    svg.appendChild(line);
  }

  clearBoardAnnotations() {
    const $svg = $('#board-arrows-svg');
    if ($svg.length > 0) {
      $svg.empty();
      // console.log('Cleared board annotations');
    }
  }

  formatEnvironmentText(text) {
    // Format environment output: newstate+reward+termination+truncation+
    const sections = [];

    // Remove prefix and split by +
    const cleanText = text.replace(/^[AS]:\s*/i, '').trim();
    const parts = cleanText.split('+');

    // Format each part on its own line with proper styling
    const labels = ['State', 'Reward', 'Terminated', 'Truncated'];
    const classes = ['state-section', 'reward-section', 'term-section', 'trunc-section'];

    parts.forEach((part, index) => {
      if (part.trim() && index < 4) {
        const content = part.trim();
        let displayValue = content;

        // Format specific values for better display
        if (index === 1) {
          // Reward - show as number
          displayValue = parseFloat(content) || content;
        } else if (index === 2 || index === 3) {
          // Terminated/Truncated - show as boolean
          displayValue = content === '1' ? 'True' : content === '0' ? 'False' : content;
        } else if (index === 0 && content.length > 60) {
          // Truncate long FEN for display
          displayValue = content.substring(0, 60) + '...';
        }

        sections.push(
          `<div class="trace-section ${classes[index]}">
            <strong>${labels[index]}:</strong> <span class="env-value">${displayValue}</span>
          </div>`
        );
      }
    });

    // Add cursor if still generating
    const isComplete = text.endsWith('+') && parts.length > 4;
    if (!isComplete) {
      const cursorHtml = '<span class="thinking-cursor">▊</span>';
      if (sections.length > 0) {
        // Add cursor to last section
        sections[sections.length - 1] = sections[sections.length - 1].replace('</div>', cursorHtml + '</div>');
      } else {
        // Show raw text with cursor if no sections yet
        return `<div class="trace-section environment-section">${text}${cursorHtml}</div>`;
      }
    }

    return sections.join('');
  }

  isMoveLegal(move) {
    // Check if a move is legal in the current position
    if (!move || move.length < 4) return false;

    try {
      const from = move.substring(0, 2);
      const to = move.substring(2, 4);
      const promotion = move.length > 4 ? move[4] : undefined;

      // Try the move on a copy of the game
      const testGame = new Chess(this.chess.fen());
      const result = testGame.move({ from, to, promotion });
      return result !== null;
    } catch (e) {
      return false;
    }
  }

  formatReasoningText(text) {
    // Format the reasoning text with proper sections and colors
    let formatted = text;

    // First, split into sections if they exist
    const sections = [];

    // Match M: section (moves) - use lookahead to find next section
    const movesMatch = text.match(/M:\s*([^]*?)(?=\s*E:|$)/i);
    if (movesMatch) {
      let moves = movesMatch[1].trim();

      // Clean up incomplete section markers during streaming
      // Remove standalone E or B at the end that might be the start of next section
      moves = moves.replace(/\s+[EB]\s*$/, '');

      // Only show valid chess moves (lowercase letters and digits)
      const validMoves = moves.match(/\b[a-h][1-8][a-h][1-8][qrbn]?\b/g);
      if (validMoves) {
        moves = validMoves.join(' ');
      }

      sections.push(`<div class="trace-section moves"><strong>M:</strong> ${moves}</div>`);
    }

    // Match E: section (evaluations) - use lookahead to find next section
    const evalsMatch = text.match(/E:\s*([^]*?)(?=\s*B:|$)/i);
    if (evalsMatch) {
      let evals = evalsMatch[1].trim();

      // Clean up incomplete section markers during streaming
      // Remove standalone B at the end that might be the start of next section
      evals = evals.replace(/\s+B\s*$/, '');

      sections.push(`<div class="trace-section evals"><strong>E:</strong> ${evals}</div>`);
    }

    // Match B: section (best move)
    const bestMatch = text.match(/B:\s*([a-h][1-8][a-h][1-8][qrbn]?)/i);
    if (bestMatch) {
      const best = bestMatch[1].trim();
      sections.push(`<div class="trace-section best"><strong>B:</strong> ${best}</div>`);
    }

    // If we have sections, return them formatted
    if (sections.length > 0) {
      return sections.join('');
    }

    // Otherwise return the raw text (for early streaming)
    return `<div class="trace-section">${text}</div>`;
  }

  async streamAnalysis(fen) {
    const traceEl = document.getElementById('live-reasoning');
    const statusEl = document.getElementById('reasoning-status');
    const candidatesEl = document.getElementById('candidates-list');

    // Clear previous results and add spinning indicator
    if (traceEl) {
      traceEl.innerHTML = '<div class="thinking-indicator"><span class="spinner"></span> <span class="thinking-text">Thinking...</span></div>';
    }
    if (candidatesEl) candidatesEl.innerHTML = '<p class="placeholder">Analyzing...</p>';
    if (statusEl) statusEl.innerHTML = '<span class="spinner"></span> Thinking...';

    // Ensure we have a cancellation token
    if (!this.cancellationToken) {
      this.cancellationToken = { cancelled: false };
    }

    // Create live reasoning display
    const reasoningContainer = document.createElement('div');
    reasoningContainer.className = 'live-reasoning-container';

    const promptSection = document.createElement('div');
    promptSection.className = 'reasoning-section prompt-section';

    // Display prompt based on model type
    const modelInfo = getCurrentModel();
    const displayPrompt = modelInfo?.usePrefix ? `P: ${fen}` : fen;
    promptSection.innerHTML = `<strong>${modelInfo?.usePrefix ? 'P:' : 'FEN:'}</strong> <span class="fen-text">${fen}</span>`;
    reasoningContainer.appendChild(promptSection);

    const thinkingSection = document.createElement('div');
    thinkingSection.className = 'reasoning-section thinking-section';
    thinkingSection.innerHTML = '<div class="thinking-indicator"><span class="spinner"></span> <span class="thinking-text">Generating reasoning...</span></div>';
    reasoningContainer.appendChild(thinkingSection);

    if (traceEl) {
      traceEl.innerHTML = ''; // Clear the initial spinner
      traceEl.appendChild(reasoningContainer);
    }

    let fullResponse = '';
    let parsed = null;

    try {
      // Generate text with new API
      const result = await generateText(fen, {
        maxTokens: 144,
        onToken: async (text) => {
          fullResponse = text;
          // console.log('Streaming token update:', text.length, 'chars');

          // Update the thinking section with streaming text
          if (thinkingSection) {
            // Parse and format the streaming text
            let formattedText = this.formatReasoningText(text);
            thinkingSection.innerHTML = formattedText + '<span class="thinking-cursor">▊</span>';

            // Force a repaint
            thinkingSection.offsetHeight;
          }

          // Update candidates list in real-time as moves are generated
          const tempParsed = parseChessOutput(text);
          if (candidatesEl && tempParsed.moves.length > 0) {
            candidatesEl.innerHTML = '';
            tempParsed.moves.forEach((move, idx) => {
              const moveEl = document.createElement('div');
              moveEl.className = 'candidate-move';

              // Color-code based on evaluation if available
              let evalDisplay = '';
              let evalClass = '';
              if (tempParsed.evaluations[idx] !== undefined) {
                const evalValue = tempParsed.evaluations[idx];
                evalDisplay = `<span class="move-eval">${evalValue.toFixed(2)}</span>`;
                // Color based on eval value
                if (evalValue > 0.3) evalClass = 'good-move';
                else if (evalValue < -0.3) evalClass = 'bad-move';
                else evalClass = 'neutral-move';
              } else {
                evalDisplay = '<span class="move-eval pending">...</span>';
              }

              // Check if move is legal
              const isLegal = this.isMoveLegal(move);
              const legalityIndicator = isLegal ? '' : '<span class="illegal-indicator" title="Illegal move">⚠️</span>';

              moveEl.className += ' ' + evalClass;
              if (!isLegal) moveEl.className += ' illegal-move';

              moveEl.innerHTML = `
                <span class="move-notation">${move}</span>
                ${evalDisplay}
                ${legalityIndicator}
              `;
              candidatesEl.appendChild(moveEl);
            });

            // Draw arrows on board for candidate moves
            this.drawCandidateMoves(tempParsed.moves, tempParsed.evaluations);
          }
        },
        stopOnPattern: true,
        cancellationToken: this.cancellationToken
      });

      fullResponse = result.text;
      parsed = result.parsed;

      // Final update - remove cursor
      if (thinkingSection) {
        let formattedText = this.formatReasoningText(fullResponse);
        thinkingSection.innerHTML = formattedText;
      }

      // Update candidate moves with legality check
      if (candidatesEl && parsed.moves.length > 0) {
        candidatesEl.innerHTML = '';
        parsed.moves.forEach((move, idx) => {
          const moveEl = document.createElement('div');
          moveEl.className = 'candidate-move';
          if (move === parsed.bestMove) {
            moveEl.classList.add('best-move');
          }

          // Check if move is legal
          const isLegal = this.isMoveLegal(move);
          if (!isLegal) {
            moveEl.classList.add('illegal-move');
          }

          const legalityIndicator = isLegal ? '' : '<span class="illegal-indicator" title="Illegal move">⚠️</span>';

          moveEl.innerHTML = `
            <span class="move-notation">${move}</span>
            ${parsed.evaluations[idx] !== undefined ?
              `<span class="move-eval">${parsed.evaluations[idx].toFixed(2)}</span>` : ''}
            ${legalityIndicator}
          `;
          candidatesEl.appendChild(moveEl);
        });
      }

      if (statusEl) {
        statusEl.textContent = parsed.bestMove ? `Best move: ${parsed.bestMove}` : 'Analysis complete';
      }

      // Add a delay after B: is complete so users can see the result
      if (parsed.bestMove && this.isPlaying) {
        // Visual feedback that we're showing the result
        if (statusEl) {
          statusEl.textContent = `Best move: ${parsed.bestMove} - Moving in 2s...`;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (error) {
      console.error('Analysis failed:', error);
      if (statusEl) {
        statusEl.textContent = 'Analysis failed';
        statusEl.style.color = '#f44336';
      }
    }

    return { text: fullResponse, parsed: parsed || { moves: [], evaluations: [], bestMove: null } };
  }

  async handleError(title, message) {
    console.error(`${title}: ${message}`);
    this.errorCount++;

    // Display error with 5-second countdown
    const errorEl = document.getElementById('error-display');
    if (errorEl) {
      errorEl.style.display = 'block';
      errorEl.innerHTML = `
        <div class="error-title">${title}</div>
        <div class="error-message">${message}</div>
        <div class="error-countdown">Continuing in <span id="countdown">5</span> seconds...</div>
      `;

      // Countdown
      for (let i = 5; i > 0; i--) {
        const countdownEl = document.getElementById('countdown');
        if (countdownEl) countdownEl.textContent = i;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      errorEl.style.display = 'none';
    }

    // Reset game after max errors
    if (this.errorCount >= this.maxErrors) {
      this.updateGameStatus('Too many errors - resetting game');
      await new Promise(resolve => setTimeout(resolve, 2000));
      this.resetGame();
    }
  }

  updateGameInfo() {
    const turnEl = document.getElementById('current-turn');
    const moveCountEl = document.getElementById('move-count');
    const statusEl = document.getElementById('game-status');

    if (turnEl) {
      const turn = this.chess.turn() === 'w' ? 'White' : 'Black';
      turnEl.textContent = turn;
    }

    if (moveCountEl) {
      moveCountEl.textContent = this.currentMoveNumber;
    }

    if (statusEl) {
      if (this.chess.isCheckmate()) {
        statusEl.textContent = 'Checkmate!';
      } else if (this.chess.isCheck()) {
        statusEl.textContent = 'Check!';
      } else if (this.chess.isDraw()) {
        statusEl.textContent = 'Draw';
      } else if (this.chess.isStalemate()) {
        statusEl.textContent = 'Stalemate';
      } else if (this.isPlaying) {
        statusEl.textContent = 'Playing...';
      } else {
        statusEl.textContent = 'Ready';
      }
    }
  }

  updateFenDisplay() {
    const fenEl = document.getElementById('current-fen');
    if (fenEl) {
      fenEl.textContent = this.chess.fen();
    }
  }

  updateGameStatus(status) {
    const statusEl = document.getElementById('game-status');
    if (statusEl) {
      statusEl.textContent = status;
    }

    // Also update reasoning header status with spinner only if actively playing
    const reasoningStatusEl = document.getElementById('reasoning-status');
    if (reasoningStatusEl) {
      if (status === 'Playing...' && this.isPlaying && !this.isPaused) {
        reasoningStatusEl.innerHTML = '<span class="spinner"></span> Playing...';
      } else {
        // No spinner for other statuses
        reasoningStatusEl.textContent = status;
      }
    }
  }

  clearLiveReasoning() {
    const traceEl = document.getElementById('reasoning-trace');
    if (traceEl) {
      traceEl.innerHTML = '';
    }

    const candidatesEl = document.getElementById('candidates-list');
    if (candidatesEl) {
      candidatesEl.innerHTML = '<p class="placeholder">Waiting for analysis...</p>';
    }

    const statusEl = document.getElementById('reasoning-status');
    if (statusEl) {
      statusEl.textContent = 'Ready';
      statusEl.style.color = '';
    }
  }

  showError(message) {
    const statusEl = document.getElementById('reasoning-status');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.style.color = '#f44336';
    }
  }

  async switchModel(modelType) {
    try {
      const statusEl = document.getElementById('reasoning-status');
      if (statusEl) {
        statusEl.textContent = 'Loading model...';
        statusEl.style.color = '';
      }

      await switchToModel(modelType, (progress) => {
        if (statusEl) {
          if (progress.stage === 'tokenizer') {
            statusEl.textContent = `Loading tokenizer... ${progress.progress}%`;
          } else if (progress.stage === 'model') {
            statusEl.textContent = `Loading model... ${progress.progress}%`;
          }
        }
      });

      if (statusEl) {
        statusEl.textContent = `Switched to ${modelType}`;
        statusEl.style.color = '';
      }

      // Update environment toggle state when model changes
      this.updateEnvironmentToggleState();
    } catch (error) {
      this.showError(`Failed to switch to ${modelType}: ${error.message}`);
    }
  }

  updateEnvironmentToggleState() {
    const envToggle = document.getElementById('environment-toggle');
    const envLabel = document.querySelector('.toggle-label');

    if (!envToggle || !envLabel) return;

    const modelInfo = getCurrentModel();
    const supportsEnvironment = modelInfo?.supportsEnvironment || false;

    if (!supportsEnvironment) {
      // Model doesn't support environment - disable it
      envToggle.disabled = true;
      envToggle.checked = false;
      this.useEnvironmentSimulation = false;
      envLabel.style.opacity = '0.5';
      envLabel.title = 'Environment simulation only available with RookWorld-LM';
    } else {
      // Model supports environment but DON'T auto-enable
      // Just update the UI state without changing the simulation setting
      envToggle.disabled = false;
      // Keep the current checked state (default is unchecked)
      // Don't change this.useEnvironmentSimulation - keep it as user set it
      envLabel.style.opacity = '1';
      envLabel.title = 'Use RookWorld-LM environment simulation';
    }
  }

  // Method to analyze a specific position
  async analyzePosition(fen) {
    if (!isModelReady()) {
      this.showError('Please load a model first');
      return;
    }

    const statusEl = document.getElementById('reasoning-status');
    const traceEl = document.getElementById('reasoning-trace');
    const candidatesEl = document.getElementById('candidates-list');

    if (statusEl) statusEl.innerHTML = '<span class="spinner"></span> Analyzing position...';
    if (traceEl) traceEl.innerHTML = '';
    if (candidatesEl) candidatesEl.innerHTML = '<p class="placeholder">Analyzing...</p>';

    // Create a new cancellation token for this analysis
    // (Resume already creates a fresh token, so this won't interfere)
    if (!this.cancellationToken) {
      this.cancellationToken = { cancelled: false };
    }

    try {
      const result = await generateText(fen, {
        maxTokens: 256,
        onToken: (text) => {
          // Check if generation was cancelled
          if (this.cancellationToken.cancelled) {
            console.log('Generation cancelled');
            return;
          }

          // Update display with streaming text
          if (traceEl) {
            let displayText = text
              .replace(/M:\s*([^\n]*)/g, '<span class="moves-section"><strong>M:</strong> $1</span>')
              .replace(/E:\s*([^\n]*)/g, '<span class="evals-section"><strong>E:</strong> $1</span>')
              .replace(/B:\s*([^\n]*)/g, '<span class="best-section"><strong>B:</strong> $1</span>');

            traceEl.innerHTML = `<div class="live-reasoning-container">
              <div class="reasoning-section thinking-section">${displayText}<span class="thinking-cursor">▊</span></div>
            </div>`;
          }
        },
        stopOnPattern: true,
        cancellationToken: this.cancellationToken
      });

      // Final display
      if (traceEl) {
        let displayText = result.text
          .replace(/M:\s*([^\n]*)/g, '<span class="moves-section"><strong>M:</strong> $1</span>')
          .replace(/E:\s*([^\n]*)/g, '<span class="evals-section"><strong>E:</strong> $1</span>')
          .replace(/B:\s*([^\n]*)/g, '<span class="best-section"><strong>B:</strong> $1</span>');

        traceEl.innerHTML = `<div class="live-reasoning-container">
          <div class="reasoning-section thinking-section">${displayText}</div>
        </div>`;
      }

      // Update candidate moves
      if (candidatesEl && result.parsed.moves.length > 0) {
        candidatesEl.innerHTML = '';
        result.parsed.moves.forEach((move, idx) => {
          const moveEl = document.createElement('div');
          moveEl.className = 'candidate-move';
          if (move === result.parsed.bestMove) {
            moveEl.classList.add('best-move');
          }
          moveEl.innerHTML = `
            <span class="move-notation">${move}</span>
            ${result.parsed.evaluations[idx] !== undefined ?
              `<span class="move-eval">${result.parsed.evaluations[idx].toFixed(2)}</span>` : ''}
          `;
          candidatesEl.appendChild(moveEl);
        });
      }

      if (statusEl) {
        statusEl.textContent = result.parsed.bestMove ?
          `Best move: ${result.parsed.bestMove}` : 'Analysis complete';
      }

    } catch (error) {
      console.error('Position analysis failed:', error);
      this.showError('Analysis failed: ' + error.message);
    }
  }

  destroy() {
    // Cancel any ongoing generation
    if (this.cancellationToken) {
      this.cancellationToken.cancelled = true;
    }

    if (this.board) {
      this.board.destroy();
    }
  }
}