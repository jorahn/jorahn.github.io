import { initializeModel } from './model-utils.js';
import { ReasoningComponent } from './components/reasoning.js';

class RookWorldApp {
  constructor() {
    this.components = {};
    this.activeComponent = 'reasoning'; // Single component mode
  }

  async init() {
    // console.log('Initializing RookWorld Demo App');

    // Initialize only the reasoning component (which now handles self-play)
    this.components.reasoning = new ReasoningComponent();

    // Initialize the component
    await this.components.reasoning.init();

    // Start loading the model in background
    this.loadModelInBackground();
  }

  // Component navigation removed - single component mode

  async loadModelInBackground() {
    try {
      // Start with RookWorld-LM as default
      // Models are loaded from HuggingFace by default
      // Set window.USE_LOCAL_MODELS=true in console to use local files
      await initializeModel('rookworld', (progress) => {
        const statusElements = document.querySelectorAll('.loading-status, #reasoning-status');
        statusElements.forEach(el => {
          if (el) {
            if (progress.stage === 'tokenizer') {
              el.textContent = `Loading tokenizer... ${progress.progress}%`;
            } else if (progress.stage === 'model') {
              el.textContent = `Loading model... ${progress.progress}%`;
            }
          }
        });
      });
      // console.log('Model loaded successfully');

      // Update UI to show model is ready
      const statusElements = document.querySelectorAll('.loading-status, #reasoning-status');
      statusElements.forEach(el => {
        if (el) el.textContent = 'Model ready - RookWorld-LM';
      });

      // Hide loading overlay
      const loadingOverlay = document.getElementById('loading-overlay');
      if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
      }

      // Update environment toggle state after model loads
      if (this.components.reasoning) {
        this.components.reasoning.updateEnvironmentToggleState();
      }

    } catch (error) {
      console.error('Background model loading failed:', error);

      // Show error in UI
      const statusElements = document.querySelectorAll('.loading-status, #reasoning-status');
      statusElements.forEach(el => {
        if (el) el.textContent = `Model loading failed: ${error.message}`;
      });
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  const app = new RookWorldApp();
  await app.init();
});

// Add some custom CSS for the new components
const style = document.createElement('style');
style.textContent = `
  /* Chain-of-Thought specific styles */
  .reasoning-content {
    display: grid;
    grid-template-columns: 1fr;
    gap: 20px;
    width: 100%;
    margin: 0;
    padding: 20px;
  }

  .reasoning-main {
    display: grid;
    grid-template-columns: minmax(400px, 600px) 1fr;
    gap: 30px;
    align-items: start;
  }

  .board-panel {
    max-width: 600px;
  }

  .reasoning-panel {
    background: var(--glass-bg);
    border-radius: 12px;
    padding: 20px;
    border: 1px solid var(--border);
    min-width: 500px;
    flex: 1;
  }

  .reasoning-trace {
    min-height: 300px;
    background: var(--code-bg);
    border-radius: 8px;
    padding: 15px;
    margin: 15px 0;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.9rem;
    line-height: 1.4;
    overflow-y: auto;
    max-height: 400px;
  }

  .reasoning-section {
    margin-bottom: 10px;
  }

  .prompt-section {
    color: var(--primary);
    font-weight: bold;
  }

  .thinking-section {
    color: var(--text);
  }

  .moves-section {
    color: var(--accent);
  }

  .evals-section {
    color: var(--warning);
  }

  .best-section {
    color: var(--success);
    font-weight: bold;
  }

  .thinking-cursor {
    animation: blink 1s infinite;
    color: var(--primary);
  }

  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }

  .candidate-move {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    margin: 5px 0;
    background: var(--glass-bg);
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .candidate-move:hover {
    background: var(--hover-bg);
  }

  .candidate-move.complete {
    opacity: 1;
  }

  .candidate-move.pending {
    opacity: 0.6;
  }

  .candidate-move.good-move {
    background: rgba(76, 175, 80, 0.2);
    border-left: 3px solid #4caf50;
  }

  .candidate-move.bad-move {
    background: rgba(244, 67, 54, 0.2);
    border-left: 3px solid #f44336;
  }

  .candidate-move.neutral-move {
    background: rgba(255, 193, 7, 0.2);
    border-left: 3px solid #ffc107;
  }

  .candidate-move.best-move {
    background: rgba(33, 150, 243, 0.3);
    border: 2px solid #2196f3;
    font-weight: bold;
  }

  .move-eval.pending {
    color: #999;
    font-style: italic;
  }

  /* Ensure chess board container is relatively positioned for arrow overlay */
  .board-container {
    position: relative;
  }

  #board {
    position: relative;
  }

  /* Arrow animation */
  .candidate-arrow {
    animation: fadeIn 0.3s ease-in;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 0.7; }
  }

  .move-notation {
    font-family: monospace;
    font-weight: bold;
    min-width: 50px;
  }

  .move-eval {
    font-family: monospace;
    min-width: 50px;
    text-align: right;
  }

  .eval-bar {
    flex: 1;
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
  }

  .eval-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--error), var(--warning), var(--success));
    transition: width 0.3s ease;
  }

  /* Self-play specific styles */
  .selfplay-content {
    width: 100%;
    margin: 0;
    padding: 20px;
  }

  .selfplay-main {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
    align-items: start;
  }

  .selfplay-reasoning {
    background: var(--glass-bg);
    border-radius: 12px;
    padding: 20px;
    border: 1px solid var(--border);
    max-height: 500px;
    overflow-y: auto;
  }

  .live-reasoning {
    background: var(--code-bg);
    border-radius: 8px;
    padding: 15px;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.85rem;
    line-height: 1.4;
    min-height: 200px;
  }

  .live-trace-container {
    white-space: pre-wrap;
  }

  .trace-section {
    display: block;
    margin: 5px 0;
  }

  .trace-section.moves { color: var(--accent); }
  .trace-section.evals { color: var(--warning); }
  .trace-section.best { color: var(--success); font-weight: bold; }

  /* Environment output sections */
  .trace-section.state-section { color: var(--primary); }
  .trace-section.reward-section { color: var(--accent); }
  .trace-section.term-section { color: var(--warning); }
  .trace-section.trunc-section { color: var(--info); }

  .environment-section {
    color: var(--primary);
    margin-top: 10px;
    padding: 8px;
    background: rgba(var(--primary-rgb), 0.1);
    border-radius: 4px;
  }

  .env-match {
    color: var(--success);
    font-weight: bold;
  }

  .env-mismatch {
    color: var(--error);
    font-weight: bold;
  }

  .env-correct {
    border-left: 3px solid var(--success);
  }

  .env-incorrect {
    border-left: 3px solid var(--error);
  }

  .live-cursor {
    animation: blink 1s infinite;
    color: var(--primary);
  }

  .game-info {
    background: var(--glass-bg);
    border-radius: 8px;
    padding: 15px;
    margin-top: 15px;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    margin: 5px 0;
  }

  .selfplay-settings {
    margin: 10px 0;
  }

  .selfplay-settings label {
    display: block;
    margin-bottom: 5px;
    color: var(--text);
  }

  .selfplay-settings select {
    width: 100%;
    padding: 8px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--glass-bg);
    color: var(--text);
  }

  /* Highlight best move */
  .highlight-best {
    background-color: rgba(var(--success-rgb), 0.3) !important;
  }

  /* Mobile responsiveness */
  @media (max-width: 768px) {
    .reasoning-main,
    .selfplay-main {
      grid-template-columns: 1fr;
      gap: 20px;
    }

    .board-panel {
      order: 1;
    }

    .reasoning-panel,
    .selfplay-reasoning {
      order: 2;
    }
  }
`;

document.head.appendChild(style);