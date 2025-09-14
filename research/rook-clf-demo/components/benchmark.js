import { runInference, isModelLoaded } from '../model-utils.js';
import { Chess } from 'chess.js';

export class BenchmarkComponent {
  constructor() {
    this.isRunning = false;
    this.isPaused = false;
    this.currentBenchmark = null;
    this.benchmarkData = null;
    this.currentIndex = 0;
    this.results = [];
    this.startTime = null;
    this.chart = null;
    this.animationId = null;
    
    // Performance tracking
    this.positionsProcessed = 0;
    this.correctPredictions = 0;
    this.processingTimes = [];

    // Puzzle-level evaluation state
    this.evaluationMode = 'position'; // 'position' | 'puzzle'
    this.puzzleGroups = [];
    this.currentPuzzleIndex = 0;
    this.correctPuzzles = 0;
    this.totalPuzzles = 0;
  
    // DOM elements
    this.benchmarkSelect = null;
    this.startBtn = null;
    this.pauseBtn = null;
    this.resetBtn = null;
    this.accuracyEl = null;
    this.posPerSecEl = null;
    this.progressEl = null;
    this.etaEl = null;
    this.progressFillEl = null;
    this.resultsTableEl = null;
    this.chartCanvas = null;
  }
  
  async init() {
    console.log('Initializing Benchmark component');
    
    // Get DOM elements - wait for them to be available
    await this.waitForElements();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Initialize chart
    this.initChart();
    
    console.log('Benchmark component initialized');
  }
  
  async waitForElements() {
    // Wait for DOM elements to be available
    let attempts = 0;
    while (attempts < 10) {
      this.benchmarkSelect = document.getElementById('benchmark-select');
      this.startBtn = document.getElementById('start-benchmark-btn');
      this.pauseBtn = document.getElementById('pause-benchmark-btn');
      this.resetBtn = document.getElementById('reset-benchmark-btn');
      this.accuracyEl = document.getElementById('current-accuracy');
      this.posPerSecEl = document.getElementById('positions-per-sec');
      this.progressEl = document.getElementById('benchmark-progress');
      this.etaEl = document.getElementById('benchmark-eta');
      this.progressFillEl = document.getElementById('benchmark-progress-fill');
      this.resultsTableEl = document.getElementById('results-table');
      this.chartCanvas = document.getElementById('accuracy-chart');
      // Modal elements
      this.completeModal = document.getElementById('benchmark-complete-modal');
      this.completeModalClose = document.getElementById('benchmark-modal-close');
      this.completeModalBody = document.getElementById('benchmark-modal-body');
      
      if (this.benchmarkSelect && this.startBtn && this.chartCanvas) {
        console.log('Benchmark elements found');
        return;
      }
      
      console.log('Waiting for benchmark elements...', attempts);
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    console.warn('Some benchmark elements not found after waiting');
  }
  
  setupEventListeners() {
    // Remove existing listeners first to prevent duplicates
    this.removeEventListeners();
    
    if (this.startBtn) {
      this.startBenchmarkHandler = () => this.startBenchmark();
      this.startBtn.addEventListener('click', this.startBenchmarkHandler);
    }
    if (this.pauseBtn) {
      this.pauseBenchmarkHandler = () => this.pauseBenchmark();
      this.pauseBtn.addEventListener('click', this.pauseBenchmarkHandler);
    }
    if (this.resetBtn) {
      this.resetBenchmarkHandler = () => this.resetBenchmark();
      this.resetBtn.addEventListener('click', this.resetBenchmarkHandler);
    }
    if (this.benchmarkSelect) {
      this.benchmarkChangeHandler = () => this.onBenchmarkChange();
      this.benchmarkSelect.addEventListener('change', this.benchmarkChangeHandler);
    }
    if (this.completeModalClose && this.completeModal) {
      this.modalCloseHandler = () => this.hideCompletionModal();
      this.completeModalClose.addEventListener('click', this.modalCloseHandler);
      this.modalBackdropHandler = (e) => { if (e.target === this.completeModal) this.hideCompletionModal(); };
      this.completeModal.addEventListener('click', this.modalBackdropHandler);
    }
    
    console.log('Benchmark event listeners setup complete');
  }
  
  removeEventListeners() {
    if (this.startBtn && this.startBenchmarkHandler) {
      this.startBtn.removeEventListener('click', this.startBenchmarkHandler);
    }
    if (this.pauseBtn && this.pauseBenchmarkHandler) {
      this.pauseBtn.removeEventListener('click', this.pauseBenchmarkHandler);
    }
    if (this.resetBtn && this.resetBenchmarkHandler) {
      this.resetBtn.removeEventListener('click', this.resetBenchmarkHandler);
    }
    if (this.benchmarkSelect && this.benchmarkChangeHandler) {
      this.benchmarkSelect.removeEventListener('change', this.benchmarkChangeHandler);
    }
    if (this.completeModalClose && this.modalCloseHandler) {
      this.completeModalClose.removeEventListener('click', this.modalCloseHandler);
    }
    if (this.completeModal && this.modalBackdropHandler) {
      this.completeModal.removeEventListener('click', this.modalBackdropHandler);
    }
  }
  
  async onActivate() {
    console.log('Benchmark component activated');
    
    // Wait for DOM to be fully ready
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Always re-find elements on activation to be safe
    console.log('Re-finding DOM elements...');
    await this.waitForElements();
    
    // Always re-setup event listeners (they won't duplicate)
    this.setupEventListeners();
    
    // Always re-initialize chart
    this.initChart();
    
    // Show some content immediately as fallback
    this.showFallbackContent();
    
    // Update button states based on model loading status  
    this.updateButtonStates();
    
    // Update benchmark description for current selection
    this.updateBenchmarkDescription();
    
    console.log('Benchmark component activation complete');
  }
  
  showFallbackContent() {
    // Ensure there's always visible content
    if (this.resultsTableEl) {
      this.resultsTableEl.innerHTML = '<div class="results-placeholder">Choose a benchmark and click Start to begin evaluation</div>';
    }
    
    if (this.accuracyEl) this.accuracyEl.textContent = '0.0%';
    if (this.posPerSecEl) this.posPerSecEl.textContent = '0.0';
    if (this.progressEl) this.progressEl.textContent = '0 / 0';
    if (this.etaEl) this.etaEl.textContent = '--:--';
    if (this.progressFillEl) this.progressFillEl.style.width = '0%';
  }
  
  onDeactivate() {
    console.log('Benchmark component deactivated');
    
    // Pause any running benchmark
    if (this.isRunning && !this.isPaused) {
      this.pauseBenchmark();
    }
  }
  
  onModelLoaded() {
    console.log('Model loaded notification received in Benchmark component');
    this.updateButtonStates();
  }
  
  updateButtonStates() {
    const modelLoaded = isModelLoaded();
    
    if (!modelLoaded) {
      this.startBtn.disabled = true;
      this.startBtn.textContent = 'Model Loading...';
    } else {
      this.startBtn.disabled = false;
      this.startBtn.textContent = this.isRunning ? 'Resume' : 'Start Benchmark';
    }
  }
  
  onBenchmarkChange() {
    // Reset if changing benchmark while running
    if (this.isRunning) {
      this.resetBenchmark();
    }
    
    // Clear any cached data
    this.benchmarkData = null;
    
    // Update benchmark description
    this.updateBenchmarkDescription();
    
    console.log('Benchmark changed to:', this.benchmarkSelect.value);
  }
  
  updateBenchmarkDescription() {
    const benchmarkType = this.benchmarkSelect.value;
    
    const descriptions = {
      gdm_action: {
        title: "🚧 GDM Action Accuracy (Under Construction)",
        target: "Reported: 49%",
        count: "1,000 positions",
        description: "Single-position best move accuracy from GDM searchless chess data. Currently achieving 37% - implementation under review to reach published 49% target.",
        citation: "Ruoss et al. 2024. Grandmaster-level chess without search. arXiv:2402.04494",
        links: [
          { url: "https://arxiv.org/abs/2402.04494", text: "📄 Paper (arXiv:2402.04494)", class: "paper-link" },
          { url: "https://github.com/google-deepmind/searchless_chess", text: "💻 Code Repository", class: "code-link" },
          { url: "https://storage.googleapis.com/searchless_chess/data/puzzles.csv", text: "📊 Original Dataset", class: "data-link" }
        ],
        originalFormat: `Preprocessed dataset with "text" and "label" columns
text: processed_fen + "[CLS]", label: "h4f2"`,
        adaptedFormat: `{"fen": "4r1k1/2p1qpp1/3p4/1p1P2PQ/1P5b/3R3P/2PBr3/5RK1", 
 "correct_move": "h4f2"}`,
        originalMethod: "Action accuracy: single position → single best move prediction",
        adaptedMethod: "Direct FEN → move evaluation matching rook --eval_type action methodology"
      },
      
      gdm_puzzle: {
        title: "GDM Puzzle Solve Rate",
        target: "Reported: 50%",
        count: "1,000 positions",
        description: "Tactical puzzle solve rate from GDM searchless chess data. Tests model's ability to solve multi-move tactical sequences with checkmate fallback.",
        citation: "Ruoss et al. 2024. Grandmaster-level chess without search. arXiv:2402.04494",
        links: [
          { url: "https://arxiv.org/abs/2402.04494", text: "📄 Paper (arXiv:2402.04494)", class: "paper-link" },
          { url: "https://github.com/google-deepmind/searchless_chess", text: "💻 Code Repository", class: "code-link" },
          { url: "https://storage.googleapis.com/searchless_chess/data/puzzles.csv", text: "📊 Original Dataset", class: "data-link" }
        ],
        originalFormat: `PuzzleId,Rating,PGN,Solution,FEN,Moves
00MTG,669,1. e4 e5...,Bf2+ Rxf2...,4r1k1/2p1q...,h4f2 f1f2 e2f2`,
        adaptedFormat: `{"fen": "4r1k1/2p1qpp1/3p4/1p1P2PQ/1P6/3R3P/2PBrb2/5RK1", 
 "correct_move": "f1f2"}`,
        originalMethod: "Puzzle solve rate: model tested on every other move (i % 2 == 1) with checkmate fallback",
        adaptedMethod: "Sequential position evaluation with checkmate detection for alternative solutions"
      },
      
      bigbench: {
        title: "Google BIG-bench Checkmate-in-One", 
        target: "Reported: 57%",
        count: "3,500 positions",
        description: "Checkmate puzzle solve rate from Google's BIG-bench evaluation suite. Tests model's tactical ability to find immediate checkmate solutions.",
        citation: "Srivastava et al. 2023. Beyond the Imitation Game: Quantifying and extrapolating the capabilities of language models. Trans. Mach. Learn. Res.",
        links: [
          { url: "https://github.com/google/BIG-bench/tree/main/bigbench/benchmark_tasks/checkmate_in_one", text: "📄 BIG-bench Task", class: "paper-link" },
          { url: "https://github.com/google/BIG-bench", text: "💻 BIG-bench Repository", class: "code-link" },
          { url: "https://github.com/google/BIG-bench/raw/main/bigbench/benchmark_tasks/checkmate_in_one/task.json", text: "📊 Original Dataset", class: "data-link" }
        ],
        originalFormat: `{"input": "1. d4 d5 2. Nf3...", 
 "target": "Rg5#"}`,
        adaptedFormat: `{"fen": "6k1/2b2pp1/R6p/2pP1K2/2P5/2B1r3/1P4rP/8", 
 "correct_move": "g2g5"}`,
        originalMethod: "Checkmate puzzle solve rate: find mating move from PGN game sequences in standard algebraic notation",
        adaptedMethod: "Extracted final positions with UCI move notation for direct checkmate detection evaluation"
      },
      
      lichess: {
        title: "Lichess Tactical Puzzles",
        target: "Reported: 65%", 
        count: "2,253 positions",
        description: "Tactical move accuracy from Lichess.org community database. Evaluates model's per-position move accuracy in tactical sequences.",
        citation: "Lichess.org puzzle database",
        links: [
          { url: "https://lichess.org/training", text: "🎯 Lichess Training", class: "paper-link" },
          { url: "https://database.lichess.org/", text: "💻 Database Portal", class: "code-link" },
          { url: "https://database.lichess.org/lichess_db_puzzle.csv.zst", text: "📊 Original Dataset (253MB)", class: "data-link" }
        ],
        originalFormat: `PuzzleId,FEN,Moves,Rating,Themes,Popularity
00008,r6k/pp2r2p...b,f2g3 e6e7 b2b1...,1800,"crushing hangingPiece",95`,
        adaptedFormat: `{"fen": "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K", 
 "correct_move": "f2g3"}`,
        originalMethod: "Community tactical puzzles with move sequences - puzzle solutions for side-to-move",
        adaptedMethod: "Sequential evaluation at puzzle decision points (i % 2 == 0) - evaluating moves for the side indicated in FEN"
      }
    };
    
    const desc = descriptions[benchmarkType];
    if (!desc) return;
    
    // Update all description elements
    document.getElementById('benchmark-title').textContent = desc.title;
    document.getElementById('benchmark-target').textContent = desc.target;
    document.getElementById('benchmark-count').textContent = desc.count;
    document.getElementById('benchmark-source-desc').textContent = desc.description;
    document.getElementById('benchmark-citation').textContent = desc.citation;
    
    // Update chart title based on benchmark type
    const chartTitle = document.getElementById('chart-title');
    if (chartTitle) {
      if (benchmarkType === 'gdm_action') {
        chartTitle.textContent = 'Action Accuracy Over Time';
      } else if (benchmarkType === 'gdm_puzzle') {
        chartTitle.textContent = 'Puzzle Solve Rate Over Time';
      } else if (benchmarkType === 'bigbench') {
        chartTitle.textContent = 'Checkmate Accuracy Over Time';
      } else if (benchmarkType === 'lichess') {
        chartTitle.textContent = 'Tactical Accuracy Over Time';
      } else {
        chartTitle.textContent = 'Accuracy Over Time';
      }
    }
    
    // Update methodology examples
    const originalExample = document.querySelector('.methodology-original .method-example pre');
    const adaptedExample = document.querySelector('.methodology-adapted .method-example pre');
    const originalMethod = document.querySelector('.methodology-original .method-example p');
    const adaptedMethod = document.querySelector('.methodology-adapted .method-example p');
    
    if (originalExample) originalExample.textContent = desc.originalFormat;
    if (adaptedExample) adaptedExample.textContent = desc.adaptedFormat;
    if (originalMethod) originalMethod.innerHTML = `<strong>Evaluation:</strong> ${desc.originalMethod}`;
    if (adaptedMethod) adaptedMethod.innerHTML = `<strong>Evaluation:</strong> ${desc.adaptedMethod}`;
    
    // Update source links
    const sourceLinksContainer = document.querySelector('.source-links');
    if (sourceLinksContainer) {
      sourceLinksContainer.innerHTML = desc.links.map(link => 
        `<a href="${link.url}" target="_blank" class="source-link ${link.class}">${link.text}</a>`
      ).join('');
    }
  }
  
  async loadBenchmarkData(benchmarkType) {
    if (this.benchmarkData && this.currentBenchmark === benchmarkType) {
      return this.benchmarkData;
    }
    
    try {
      let filename;
      if (benchmarkType === 'gdm_action') {
        filename = './benchmarks/gdm_action.json';
      } else if (benchmarkType === 'gdm_puzzle') {
        filename = './benchmarks/gdm_searchless.json';
      } else if (benchmarkType === 'bigbench') {
        filename = './benchmarks/bigbench_checkmate.json';
      } else if (benchmarkType === 'lichess') {
        filename = './benchmarks/lichess_puzzles.json';
      } else {
        throw new Error(`Unknown benchmark type: ${benchmarkType}`);
      }
      
      console.log(`Loading benchmark data from ${filename}`);
      const response = await fetch(filename);
      
      if (!response.ok) {
        throw new Error(`Failed to load benchmark data: ${response.status}`);
      }
      
      this.benchmarkData = await response.json();
      this.currentBenchmark = benchmarkType;

      // Determine evaluation mode and prepare puzzle groups if available
      this.prepareEvaluationMode();
      
      console.log(`Loaded ${this.benchmarkData.positions.length} benchmark positions`);
      if (this.evaluationMode === 'puzzle') {
        console.log(`Detected ${this.totalPuzzles} puzzles (grouped by puzzle_id)`);
      }
      return this.benchmarkData;
      
    } catch (error) {
      console.error('Failed to load benchmark data:', error);
      this.benchmarkData = { name: 'Error', positions: [] };
      this.currentBenchmark = benchmarkType;
      if (this.resultsTableEl) {
        this.resultsTableEl.innerHTML = `<div class=\"results-placeholder\" style=\"color: var(--danger);\">Failed to load benchmark. Ensure benchmarks/*.json exists and is accessible. (${error.message})</div>`;
      }
      throw error;
    }
  }

  prepareEvaluationMode() {
    // Default to position mode
    this.evaluationMode = 'position';
    this.puzzleGroups = [];
    this.currentPuzzleIndex = 0;
    this.correctPuzzles = 0;
    this.totalPuzzles = 0;

    const positions = this.benchmarkData?.positions || [];
    const hasPuzzleIds = positions.some(p => p.metadata && p.metadata.puzzle_id);
    if (!hasPuzzleIds) return;

    // Enable puzzle mode for puzzle-type benchmarks to match reference reporting
    if (!(this.currentBenchmark === 'gdm_puzzle' || this.currentBenchmark === 'lichess')) return;

    // Group by puzzle_id
    const groups = new Map();
    for (const p of positions) {
      const id = p.metadata.puzzle_id;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(p);
    }

    // Sort each group's positions by move index when available
    const sortedGroups = Array.from(groups.entries()).map(([id, arr]) => {
      arr.sort((a, b) => {
        const ia = a.metadata?.move_index_in_sequence ?? 0;
        const ib = b.metadata?.move_index_in_sequence ?? 0;
        return ia - ib;
      });
      return { puzzle_id: id, positions: arr };
    });

    this.puzzleGroups = sortedGroups;
    this.totalPuzzles = sortedGroups.length;
    this.evaluationMode = 'puzzle';
  }
  
  // Sample data removed to ensure only real benchmarks are used
  
  async startBenchmark() {
    console.log('Starting benchmark...');
    
    if (!isModelLoaded()) {
      alert('Model is not loaded yet. Please wait for the model to finish loading.');
      return;
    }
    
    try {
      // Load benchmark data
      const benchmarkType = this.benchmarkSelect.value;
      await this.loadBenchmarkData(benchmarkType);
      
      if (!this.isRunning) {
        // Starting fresh
        this.isRunning = true;
        this.isPaused = false;
        this.currentIndex = 0;
        this.results = [];
        this.positionsProcessed = 0;
        this.correctPredictions = 0;
        this.processingTimes = [];
        this.startTime = Date.now();
        this.currentPuzzleIndex = 0;
        this.correctPuzzles = 0;
        
        // Clear chart
        this.clearChart();
      } else {
        // Resuming
        this.isPaused = false;
      }
      
      // Update UI
      this.updateButtonStates();
      this.startBtn.textContent = 'Running...';
      this.startBtn.disabled = true;
      this.pauseBtn.disabled = false;
      this.resetBtn.disabled = false;
      
      // Update progress display
      if (this.evaluationMode === 'puzzle') {
        this.progressEl.textContent = `0 / ${this.benchmarkData.positions.length} (0 / ${this.totalPuzzles} puzzles)`;
      } else {
        this.progressEl.textContent = `0 / ${this.benchmarkData.positions.length}`;
      }
      
      // Start processing
      this.runBenchmarkLoop();
      
    } catch (error) {
      console.error('Failed to start benchmark:', error);
      alert('Failed to start benchmark. Check console for details.');
      this.resetBenchmark();
    }
  }
  
  pauseBenchmark() {
    console.log('Pausing benchmark...');
    
    this.isPaused = true;
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    // Update UI
    this.startBtn.textContent = 'Resume';
    this.startBtn.disabled = false;
    this.pauseBtn.disabled = true;
  }
  
  resetBenchmark() {
    console.log('Resetting benchmark...');
    
    this.isRunning = false;
    this.isPaused = false;
    this.currentIndex = 0;
    this.results = [];
    this.positionsProcessed = 0;
    this.correctPredictions = 0;
    this.processingTimes = [];
    this.startTime = null;
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    // Reset UI
    this.startBtn.textContent = 'Start Benchmark';
    this.startBtn.disabled = false;
    this.pauseBtn.disabled = true;
    this.resetBtn.disabled = false;
    
    this.accuracyEl.textContent = '0.0%';
    this.posPerSecEl.textContent = '0.0';
    this.progressEl.textContent = '0 / 0';
    this.etaEl.textContent = '--:--';
    this.progressFillEl.style.width = '0%';
    
    // Clear results table
    this.resultsTableEl.innerHTML = '<div class="results-placeholder">Start a benchmark to see results</div>';
    
    // Clear chart
    this.clearChart();
  }
  
  async runBenchmarkLoop() {
    if (!this.isRunning || this.isPaused) {
      return;
    }
    
    if (
      (this.evaluationMode === 'position' && this.currentIndex >= this.benchmarkData.positions.length) ||
      (this.evaluationMode === 'puzzle' && this.currentPuzzleIndex >= this.totalPuzzles)
    ) {
      // Benchmark complete
      this.onBenchmarkComplete();
      return;
    }
    
    try {
      if (this.evaluationMode === 'position') {
        await this.processSinglePosition();
      } else {
        await this.processSinglePuzzle();
      }
      
      // Schedule next iteration
      this.animationId = requestAnimationFrame(() => this.runBenchmarkLoop());
      
    } catch (error) {
      console.error('Error processing position:', error);
      // Skip this position and continue
      if (this.evaluationMode === 'position') {
        this.currentIndex++;
      } else {
        this.currentPuzzleIndex++;
      }
      this.animationId = requestAnimationFrame(() => this.runBenchmarkLoop());
    }
  }

  async processSinglePosition() {
    const position = this.benchmarkData.positions[this.currentIndex];
    const startTime = performance.now();
    const predictions = await runInference(position.fen);
    const endTime = performance.now();
    const processingTime = endTime - startTime;

    const topPrediction = predictions[0];
    const isCorrect = topPrediction && topPrediction.label === position.correct_move;

    this.positionsProcessed++;
    if (isCorrect) this.correctPredictions++;
    this.processingTimes.push(processingTime);

    this.results.push({
      index: this.currentIndex,
      fen: position.fen,
      correctMove: position.correct_move,
      predictedMove: topPrediction ? topPrediction.label : 'N/A',
      confidence: topPrediction ? topPrediction.score : 0,
      isCorrect,
      processingTime
    });

    this.updateMetrics();
    this.updateChart();
    this.updateResultsTable();
    this.currentIndex++;
  }

  async processSinglePuzzle() {
    const group = this.puzzleGroups[this.currentPuzzleIndex];
    let puzzleCorrect = true;

    for (let i = 0; i < group.positions.length; i++) {
      const position = group.positions[i];
      const startTime = performance.now();
      const predictions = await runInference(position.fen);
      const endTime = performance.now();
      const processingTime = endTime - startTime;

      const topPrediction = predictions[0];
      let isCorrect = topPrediction && topPrediction.label === position.correct_move;

      // Checkmate credit: if wrong but predicts a mating move, count puzzle as solved
      if (!isCorrect) {
        try {
          const board = new Chess(position.fen);
          const move = topPrediction ? topPrediction.label : null;
          // Validate and play the predicted move
          if (move) {
            const legalMoves = board.moves({ verbose: true });
            const found = legalMoves.find(m => (m.from + m.to + (m.promotion || '')) === move);
            if (found) {
              board.move(found);
              if (board.isCheckmate()) {
                isCorrect = true; // credit as correct for puzzle-level
                // Mark rest of puzzle as satisfied
                this.positionsProcessed++;
                this.correctPredictions++;
                this.processingTimes.push(processingTime);
                this.results.push({
                  index: this.currentIndex,
                  fen: position.fen,
                  correctMove: position.correct_move,
                  predictedMove: move,
                  confidence: topPrediction ? topPrediction.score : 0,
                  isCorrect: true,
                  processingTime
                });
                puzzleCorrect = true;
                // Update metrics/UI for this step
                this.updateMetrics();
                this.updateChart();
                this.updateResultsTable();
                // Count puzzle solved and skip remaining positions
                this.correctPuzzles++;
                this.currentPuzzleIndex++;
                // Update UI after increment to avoid off-by-one visuals
                this.updateMetrics();
                this.updateChart();
                this.updateResultsTable();
                return;
              }
            }
          }
        } catch (e) {
          // Ignore chess validation errors
        }
      }

      this.positionsProcessed++;
      if (!isCorrect) puzzleCorrect = false; else this.correctPredictions++;
      this.processingTimes.push(processingTime);
      this.results.push({
        index: this.currentIndex,
        fen: position.fen,
        correctMove: position.correct_move,
        predictedMove: topPrediction ? topPrediction.label : 'N/A',
        confidence: topPrediction ? topPrediction.score : 0,
        isCorrect,
        processingTime
      });

      this.currentIndex++;
      this.updateMetrics();
      this.updateChart();
      this.updateResultsTable();

      if (!isCorrect) {
        // Early stop on first incorrect (no mate)
        puzzleCorrect = false;
        break;
      }
    }

    if (puzzleCorrect) this.correctPuzzles++;
    this.currentPuzzleIndex++;
    // Ensure UI reflects latest puzzle count at the end of a puzzle
    this.updateMetrics();
    this.updateChart();
  }
  
  updateMetrics() {
    // Calculate accuracy
    const accuracy = this.positionsProcessed > 0 ? 
      (this.correctPredictions / this.positionsProcessed) * 100 : 0;

    // Puzzle-level accuracy (if in puzzle mode)
    const puzzleAccuracy = this.evaluationMode === 'puzzle' && this.currentPuzzleIndex > 0
      ? (this.correctPuzzles / this.currentPuzzleIndex) * 100
      : null;
    
    // Calculate throughput and ETA based on primary unit (puzzles for puzzle mode)
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    const unitsDone = this.evaluationMode === 'puzzle' ? this.currentPuzzleIndex : this.positionsProcessed;
    const unitsTotal = this.evaluationMode === 'puzzle' ? this.totalPuzzles : this.benchmarkData.positions.length;
    const unitsPerSecond = unitsDone > 0 ? unitsDone / elapsedSeconds : 0;
    
    // Calculate ETA
    const remaining = Math.max(unitsTotal - unitsDone, 0);
    const etaSeconds = unitsPerSecond > 0 ? remaining / unitsPerSecond : Infinity;
    const etaMinutes = Math.floor(etaSeconds / 60);
    const etaSecondsRemainder = Math.floor(etaSeconds % 60);
    const eta = isFinite(etaSeconds) ? 
      `${etaMinutes}:${etaSecondsRemainder.toString().padStart(2, '0')}` : '--:--';
    
    // Update UI: puzzle solve rate is primary; per-position is auxiliary (smaller)
    if (puzzleAccuracy !== null) {
      this.accuracyEl.innerHTML = `${puzzleAccuracy.toFixed(1)}% <span class="aux-metric">(per-position ${accuracy.toFixed(1)}%)</span>`;
    } else {
      this.accuracyEl.textContent = `${accuracy.toFixed(1)}%`;
    }
    this.posPerSecEl.textContent = unitsPerSecond.toFixed(1);
    this.progressEl.textContent = this.evaluationMode === 'puzzle'
      ? `${this.currentPuzzleIndex} / ${this.totalPuzzles} puzzles`
      : `${this.positionsProcessed} / ${this.benchmarkData.positions.length}`;
    this.etaEl.textContent = eta;
    
    // Update progress bar
    const progressPercent = unitsTotal > 0 ? (unitsDone / unitsTotal) * 100 : 0;
    this.progressFillEl.style.width = `${progressPercent.toFixed(1)}%`;
  }
  
  initChart() {
    if (!this.chartCanvas) {
      console.warn('Chart canvas not found');
      return;
    }
    
    const ctx = this.chartCanvas.getContext('2d');
    
    // Get actual displayed size
    const containerRect = this.chartCanvas.parentElement.getBoundingClientRect();
    const width = containerRect.width - 30; // Account for padding
    const height = 300; // Fixed height
    
    // Handle high DPI displays for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    
    // Set canvas display size
    this.chartCanvas.style.width = width + 'px';
    this.chartCanvas.style.height = height + 'px';
    
    // Set actual canvas size in memory (scaled up for high DPI)
    this.chartCanvas.width = width * dpr;
    this.chartCanvas.height = height * dpr;
    
    // Scale the drawing context so everything draws at the higher resolution
    ctx.scale(dpr, dpr);
    
    // Simple canvas-based chart
    this.chart = {
      ctx: ctx,
      width: width,
      height: height,
      data: [],
      targetAccuracy: 49, // Will be updated based on benchmark type
      dpr: dpr
    };
    
    console.log(`Chart initialized: ${width}x${height} (DPR: ${dpr})`);
    this.clearChart();
  }
  
  clearChart() {
    if (!this.chart) return;
    
    const { ctx, width, height } = this.chart;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Set background
    ctx.fillStyle = '#101010';
    ctx.fillRect(0, 0, width, height);
    
    // Draw grid lines
    ctx.strokeStyle = 'rgba(93, 212, 157, 0.1)';
    ctx.lineWidth = 1;
    
    // Horizontal lines (accuracy levels)
    for (let i = 0; i <= 100; i += 20) {
      const y = height - (i / 100) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Vertical lines (progress markers)
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    // Set target accuracy based on benchmark
    const benchmarkType = this.benchmarkSelect.value;
    if (benchmarkType === 'gdm_action') {
      this.chart.targetAccuracy = 49;
    } else if (benchmarkType === 'gdm_puzzle') {
      this.chart.targetAccuracy = 50;
    } else if (benchmarkType === 'bigbench') {
      this.chart.targetAccuracy = 57;
    } else if (benchmarkType === 'lichess') {
      this.chart.targetAccuracy = 65;
    } else {
      this.chart.targetAccuracy = 50; // fallback
    }
    
    // Draw target line
    const targetY = height - (this.chart.targetAccuracy / 100) * height;
    ctx.strokeStyle = '#f5a623';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, targetY);
    ctx.lineTo(width, targetY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Reset chart data
    this.chart.data = [];
  }
  
  updateChart() {
    if (!this.chart || this.results.length === 0) return;
    
    const positionAcc = (this.correctPredictions / Math.max(this.positionsProcessed, 1)) * 100;
    const puzzleAcc = (this.evaluationMode === 'puzzle' && this.currentPuzzleIndex > 0) 
      ? (this.correctPuzzles / this.currentPuzzleIndex) * 100 
      : null;
    
    // For Lichess, use per-position accuracy as primary (matches reported performance)
    const primaryAcc = (this.currentBenchmark === 'lichess') ? positionAcc : 
                      (puzzleAcc !== null) ? puzzleAcc : positionAcc;
    this.chart.data.push(primaryAcc);
    
    const { ctx, width, height, data } = this.chart;
    
    // Enable anti-aliasing for crisp lines
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Redraw background and grid
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#101010';
    ctx.fillRect(0, 0, width, height);
    
    // Draw subtle grid
    ctx.strokeStyle = 'rgba(93, 212, 157, 0.05)';
    ctx.lineWidth = 0.5;
    
    // Horizontal grid lines (every 10%)
    for (let i = 0; i <= 100; i += 10) {
      const y = height - (i / 100) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Draw target line
    const targetY = height - (this.chart.targetAccuracy / 100) * height;
    ctx.strokeStyle = '#f5a623';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(0, targetY);
    ctx.lineTo(width, targetY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw accuracy line with smooth curves
    if (data.length > 1) {
      ctx.strokeStyle = '#5cd49d';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      
      for (let i = 0; i < data.length; i++) {
        const x = (i / Math.max(data.length - 1, 1)) * width;
        const y = height - (data[i] / 100) * height;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      
      ctx.stroke();
      
      // Draw data points
      ctx.fillStyle = '#5cd49d';
      for (let i = 0; i < data.length; i++) {
        const x = (i / Math.max(data.length - 1, 1)) * width;
        const y = height - (data[i] / 100) * height;
        
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }
  
  updateResultsTable() {
    if (this.results.length === 0) {
      this.resultsTableEl.innerHTML = '<div class="results-placeholder">Processing...</div>';
      return;
    }
    
    // Show last 10 results
    const recentResults = this.results.slice(-10).reverse();
    
    let html = `
      <div style="display: grid; grid-template-columns: 60px 100px 100px 80px 60px; gap: 10px; font-size: 0.85rem; margin-bottom: 10px; color: var(--muted); border-bottom: 1px solid var(--border); padding-bottom: 8px;">
        <div><strong>#</strong></div>
        <div><strong>Expected</strong></div>
        <div><strong>Predicted</strong></div>
        <div><strong>Confidence</strong></div>
        <div><strong>Result</strong></div>
      </div>
    `;
    
    recentResults.forEach(result => {
      const resultColor = result.isCorrect ? 'var(--success)' : 'var(--danger)';
      const resultIcon = result.isCorrect ? '✓' : '✗';
      
      html += `
        <div style="display: grid; grid-template-columns: 60px 100px 100px 80px 60px; gap: 10px; font-size: 0.85rem; margin-bottom: 8px; padding: 8px; background: var(--glass-bg); border-radius: 6px;">
          <div style="color: var(--muted);">${result.index + 1}</div>
          <div style="font-family: monospace; color: var(--text);">${result.correctMove}</div>
          <div style="font-family: monospace; color: ${resultColor};">${result.predictedMove}</div>
          <div style="color: var(--text);">${(result.confidence * 100).toFixed(1)}%</div>
          <div style="color: ${resultColor}; font-weight: bold;">${resultIcon}</div>
        </div>
      `;
    });
    
    this.resultsTableEl.innerHTML = html;
  }
  
  onBenchmarkComplete() {
    console.log('Benchmark complete!');
    
    this.isRunning = false;
    
    // Final UI update
    this.startBtn.textContent = 'Start New Benchmark';
    this.startBtn.disabled = false;
    this.pauseBtn.disabled = true;
    this.etaEl.textContent = 'Complete!';
    
    // Prepare completion summary
    const positionAcc = (this.correctPredictions / Math.max(this.positionsProcessed, 1)) * 100;
    const puzzleAcc = (this.evaluationMode === 'puzzle' && this.currentPuzzleIndex > 0)
      ? (this.correctPuzzles / this.currentPuzzleIndex) * 100
      : null;
    const finalAccuracy = (puzzleAcc !== null) ? puzzleAcc : positionAcc;
    const benchmarkName = this.benchmarkData.name;
    const targetAccuracy = this.chart.targetAccuracy;
    
    console.log(`Benchmark "${benchmarkName}" completed with ${finalAccuracy.toFixed(1)}% accuracy (target: ${targetAccuracy}%)`);
    const progressLine = this.evaluationMode === 'puzzle'
      ? `Puzzles processed: ${this.currentPuzzleIndex} / ${this.totalPuzzles}`
      : `Positions processed: ${this.positionsProcessed} / ${this.benchmarkData.positions.length}`;
    this.showCompletionModal(benchmarkName, finalAccuracy, targetAccuracy, progressLine, positionAcc, puzzleAcc);
  }

  showCompletionModal(title, finalAcc, targetAcc, progressLine, positionAcc, puzzleAcc) {
    if (!this.completeModal || !this.completeModalBody) return;
    const primaryLine = (puzzleAcc !== null)
      ? `<strong>Final accuracy:</strong> ${finalAcc.toFixed(1)}% <span class="aux-metric">(per-position ${positionAcc.toFixed(1)}%)</span>`
      : `<strong>Final accuracy:</strong> ${finalAcc.toFixed(1)}%`;
    const bodyHtml = `
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div>${primaryLine} <span class="aux-metric">(target: ${targetAcc}%)</span></div>
        <div><strong>${progressLine}</strong></div>
      </div>
    `;
    const titleEl = document.getElementById('benchmark-modal-title');
    if (titleEl) titleEl.textContent = `${title}`;
    this.completeModalBody.innerHTML = bodyHtml;
    this.completeModal.classList.remove('hidden');
  }

  hideCompletionModal() {
    if (this.completeModal) this.completeModal.classList.add('hidden');
  }
}
