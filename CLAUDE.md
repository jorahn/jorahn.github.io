# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a static portfolio website for Jonathan Rahn, an AI researcher focused on chess AI through language models. The site showcases research projects, publications, and interactive demos related to strategic reasoning in transformer models.

## Architecture

### Core Structure
- **Static HTML/CSS/JavaScript website** - No build process or framework dependencies
- **GitHub Pages deployment** - Served directly from repository files
- **Research demos** - Interactive web applications using ONNX Runtime for in-browser AI inference

### Key Directories
- `/` - Main site (index.html, styles.css, avatar.jpg)
- `/research/` - Research projects overview page
- `/research/rook-clf-demo/` - Multi-component chess AI platform (ROOK-CLF-9M model)
- `/blog/` - Blog section (links to external blog)

### Research Demo Architecture (Multi-Component Platform)
The ROOK-CLF demo is now a comprehensive evaluation platform:

#### **Component System**
- **`app.js`** - Component manager initialization and navigation
- **`model-utils.js`** - Shared model loading, tokenization, and inference
- **`component-manager.js`** - Navigation, state management, component lifecycle
- **`components/`** - Modular component implementations:
  - **`selfplay.js`** - Interactive chess analysis with board
  - **`benchmark.js`** - Professional model evaluation with real-time metrics
  - **`interpretability.js`** - Attention visualization and model analysis

#### **Benchmark System**
- **Real research datasets** - ChessBench, BIG-bench Checkmate, Lichess Puzzles
- **Authentic evaluation** - Matches published research methodologies  
- **Real-time visualization** - Canvas-based accuracy charts with target reference lines
- **Performance metrics** - Live accuracy, throughput, progress tracking

#### **Model Infrastructure**
- **GPU acceleration** - WebGPU support with intelligent WASM fallback (WebGL disabled for int64 compatibility)
- **Shared resources** - Single model load serves all components with interpretation model support
- **Progressive loading** - IndexedDB caching with detailed progress feedback and error recovery
- **Custom tokenization** - Research-accurate FEN processing pipeline (77 chars + [CLS] = 78 tokens)
- **Dual models** - Main inference model + interpretation model for attention analysis

## Development Commands

### Research Demo (rook-clf-demo)
```bash
# From main site root (serves entire site including demo)
cd jorahn.github.io
python3 -m http.server 8080 --bind 0.0.0.0    # Start local server

# Demo-specific setup (if working only on demo)
cd research/rook-clf-demo
npm install                    # Install dependencies
uv run --python 3.11 --with python-chess convert_benchmarks.py  # Generate benchmark data
```

### Demo Access
- **Main site**: http://localhost:8080
- **Research page**: http://localhost:8080/research/
- **ROOK-CLF demo**: http://localhost:8080/research/rook-clf-demo/

### Main Site
No build process required - open index.html directly or serve via any static file server.

## Technology Stack

### Main Site
- **HTML5/CSS3** - Semantic markup with modern CSS features
- **Vanilla JavaScript** - Mobile navigation and interactive elements
- **Custom CSS architecture** - CSS variables, responsive design, glass morphism effects

### Chess Demo (Multi-Component Architecture)
- **ONNX Runtime Web** - Machine learning inference with GPU acceleration fallback
- **Chess.js** - Chess game logic and validation
- **ChessBoard.js** - Interactive chess board UI (selfplay component)
- **jQuery** - DOM manipulation (legacy dependency)
- **IndexedDB** - Client-side model caching and benchmark data
- **Canvas API** - Real-time benchmark visualization
- **Component System** - Modular architecture with shared model utilities

## Key Features

### Responsive Design
- Mobile-first CSS with hamburger navigation
- Adaptive layouts for different screen sizes
- Touch-friendly interactive elements

### Multi-Component Chess AI Platform
- **Selfplay Component**: Real-time position analysis with interactive chess board and move visualization
- **Benchmark Component**: Professional model evaluation with real-time charts and authentic research datasets
- **Interpretability Component**: Attention rollout heatmaps, early logit lens, and interactive model diagram
- **Shared Model System**: Efficient resource sharing across all components with dual model support
- **GPU Acceleration**: WebGPU support with intelligent fallback system for optimal performance

### Model Loading & Caching
- Progressive loading with user feedback
- Automatic caching in IndexedDB for subsequent visits
- Fallback handling for network issues

## Content Management

### Research Projects
The site showcases multiple research projects in chess AI:
- **RookWorld-RLVR** - Current development (reinforcement learning)
- **RookWorld-LM-124M** - Unified agent+environment model
- **ROOK-CLF-9M** - Classification approach with interactive demo
- **YoloChess** - Foundation work using BERT

### External Links
- HuggingFace models and datasets
- GitHub repositories
- LAION research notes
- External blog hosted separately

## Deployment

The site is deployed on GitHub Pages with automatic deployment from the main branch. No build step is required as all content is static.

## Performance Considerations

### Model Loading
- 9.5 MB quantized ONNX model with progressive download
- IndexedDB caching prevents re-downloading on subsequent visits
- WASM backend provides efficient CPU inference

### Chess Engine
- Lightweight chess.js for game logic
- Custom FEN tokenization (77 chars + [CLS] token = 78 tokens)
- Real-time move validation and visualization

## Current Implementation Status

### **Completed Features**
- ✅ **Multi-component architecture** with tab navigation
- ✅ **Shared model system** with GPU acceleration
- ✅ **Real benchmark datasets** (ChessBench, BIG-bench, Lichess)
- ✅ **Responsive selfplay component** (desktop side-by-side, mobile stacked)
- ✅ **Professional benchmark evaluation** with real-time charts
- ✅ **Interpretability component** with attention rollout, logit lens, and interactive model diagram

### **Mobile Responsiveness**
- ✅ **Selfplay**: Fully responsive with proper desktop/mobile layouts
- ✅ **Benchmark**: Mobile-optimized layout with stacked components and touch-friendly controls
- ✅ **Interpretability**: Responsive design with adaptive canvas sizing and touch interactions
- ✅ **Navigation**: Touch-optimized component tabs with horizontal scrolling

### **Known Issues & Future Work**
- **GPU acceleration**: WebGPU available but WebGL disabled due to int64 tensor compatibility
- **Performance optimization**: Could benefit from Web Worker implementation for intensive processing
- **Interpretability features**: Attention rollout, logit lens, and model diagram completed with responsive UI

### **Benchmark Data Sources**
- **ChessBench Puzzles**: Tactical puzzle positions (per paper)
- **Big-Bench Checkmate**: 3,500 checkmate positions (57% reported solve rate)  
- **Lichess Puzzles**: 1,000+ community puzzles (65% estimated solve rate)

## Notes

- No package.json in root (only in demo subdirectory)
- No build tools or CI/CD beyond GitHub Pages
- Models and datasets hosted externally (HuggingFace) and locally (benchmarks/)
- Pure static site with progressive enhancement via JavaScript
- Component architecture enables easy extension for future AI analysis tools
