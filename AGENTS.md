# Repository Guidelines

## Project Structure & Module Organization
- **Root**: `index.html`, `styles.css`, `avatar.jpg` — static site served by GitHub Pages
- **`blog/`** — blog landing page (`index.html`)
- **`research/`** — research overview (`index.html`)
- **`research/rook-clf-demo/`** — multi-component chess AI platform with:
  - `app.js` — application entry point and component manager initialization
  - `component-manager.js` — tab navigation and component lifecycle management
  - `model-utils.js` — shared model loading, tokenization, and inference utilities
  - `components/` — modular component implementations (selfplay, benchmark, interpretability)
  - `model/` — ONNX models and tokenizer configuration
  - `benchmarks/` — research dataset files (ChessBench, BIG-bench, Lichess)
  - `package.json` — Node.js dependencies for chess engine and UI libraries
- **`research/rookworld-demo/`** — ROOK-LM and RookWorld-LM browser inference demo with:
  - `test.html` — working single-model inference with greedy generation
  - `compare.html` — side-by-side ROOK-LM vs RookWorld-LM comparison
  - `assets/` — quantized ONNX models and tokenizer files
  - `model/` — ROOK-LM-124M and RookWorld-LM-124M models
  - Working JavaScript implementation with proper tokenization and KV-free inference

## Build, Test, and Development Commands

### Main Site Development
```bash
# Serve entire site locally (includes all components)
python3 -m http.server 8080 --bind 0.0.0.0
# Access: http://localhost:8080 (main site)
# Access: http://localhost:8080/research/rook-clf-demo/ (chess demo)
```

### Chess Demo Development
```bash
# Install dependencies
cd research/rook-clf-demo
npm install

# Generate benchmark datasets (optional - files included)
uv run --python 3.11 --with python-chess convert_benchmarks.py

# Serve from repo root for proper asset loading
cd ../..
python3 -m http.server 8080
```

### System Requirements
- **Node.js 18+** for demo dependencies (chess.js, chessboard.js, etc.)
- **Python 3.10+** for local HTTP server
- **Modern browser** with ES modules support (Chrome 63+, Firefox 60+, Safari 11+)
- **WebGPU support** optional but recommended for best performance

## Coding Style & Naming Conventions

### General Guidelines
- **Languages**: Vanilla HTML/CSS/JS only (no global build step)
- **Indentation**: 2 spaces, UTF-8, LF line endings
- **Filenames**: lowercase kebab-case (`model-utils.js`, `component-manager.js`)
- **Directory structure**: each section exposes `index.html` (`blog/index.html`, `research/index.html`)

### JavaScript Patterns
- **ES Modules**: Use `import`/`export` with `type="module"` scripts
- **Classes**: ES6 class syntax for components (`class SelfplayComponent`)
- **Async/Await**: Preferred over Promise chains for async operations
- **Error Handling**: Comprehensive try/catch blocks with user-friendly fallbacks
- **DOM Access**: Simple, direct manipulation; minimal jQuery usage (legacy dependency only)

### CSS Architecture
- **CSS Variables**: Use design system tokens (`--accent`, `--panel`, `--border`)
- **Mobile-First**: Responsive design with min-width breakpoints
- **Component Scoping**: Prefix classes by component (`interp-grid`, `benchmark-metrics`)
- **Glass Morphism**: Consistent backdrop-filter and transparency effects

### Asset Management
- **Models**: Large files in `research/rook-clf-demo/model/` or external hosting
- **Datasets**: Research data in `research/rook-clf-demo/benchmarks/`
- **Images**: Optimize for web, use WebP where supported
- **Dependencies**: Pin versions in `package.json`, prefer CDN for external libs

## Testing Guidelines

### Manual Testing Checklist
**Main Site:**
- [ ] Navigation works on desktop and mobile
- [ ] All links load without 404 errors
- [ ] Responsive design adapts properly to different screen sizes
- [ ] No console errors during normal usage

**Chess Demo Components:**
- [ ] **Model Loading**: Progress bar displays, IndexedDB caching works on subsequent visits
- [ ] **Selfplay**: Chess board responsive, move analysis displays, autoplay functions correctly
- [ ] **Benchmark**: Dataset selection works, real-time charts render, accuracy calculations are correct
- [ ] **Interpretability**: Attention heatmaps render, layer slider works, logit lens displays properly
- [ ] **Component Navigation**: Tab switching preserves state, mobile navigation is touch-friendly
- [ ] **Performance**: Model inference completes within reasonable time, UI remains responsive

### Browser Compatibility
- **Chrome/Edge 88+**: Full WebGPU support for optimal performance
- **Firefox 78+**: WebAssembly fallback, excellent compatibility
- **Safari 14+**: Good ES modules support, WASM performance
- **Mobile browsers**: Touch interactions, responsive layout, acceptable performance

**Note**: No formal CI/CD pipeline. Scripts in `research/rook-clf-demo/scripts/` are development utilities.

## Commit & Pull Request Guidelines
- Commits: imperative, concise, and scoped. Examples from history:
  - "Add mobile-friendly navigation and avatar"
  - "Fix ONNX WASM path to use absolute URL"
- PRs should include: purpose/summary, key files/sections changed, before/after screenshots for UI, local verification steps, and links to related issues.

## Security & Configuration Tips

### Static Site Security
- **No secrets**: This is a fully static site with no server-side code or API keys
- **HTTPS**: All external resources loaded over HTTPS (HuggingFace, external APIs)
- **CSP Ready**: ES modules without inline scripts for Content Security Policy compatibility
- **Input Validation**: FEN string validation and sanitization in chess components

### Asset Hosting Strategy
- **Small assets**: Repository-local paths for GitHub Pages compatibility
- **Large models**: Self-hosted in `research/rook-clf-demo/model/` (9.5MB ONNX files)
- **External datasets**: HuggingFace datasets linked but processed locally
- **Progressive loading**: IndexedDB caching reduces bandwidth on repeat visits

### Performance Considerations
- **Model loading**: Progressive download with detailed progress feedback
- **GPU detection**: Automatic WebGPU/WASM fallback for broad compatibility
- **Component lazy loading**: Components loaded on-demand to reduce initial bundle size
- **Responsive images**: Proper sizing and optimization for mobile devices
