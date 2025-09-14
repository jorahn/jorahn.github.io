import { ensureInterpretModelLoaded, runInterpretForward, attentionRollout, processFen } from '../model-utils.js';

export class InterpretabilityComponent {
  constructor() {
    this.fenInput = null;
    this.runBtn = null;
    this.layerSlider = null;
    this.layerVal = null;
    this.heatmap = null;
    this.statusEl = null;
    this.attnTensor = null; // last attentions
    this.id2label = null;   // move labels from config
    this.lensPanel = null;
    this.lastHeatmapValues = null; // last 64 heatmap values
    // board removed for interpretability heatmap view
    this.metaRowEl = null;
    this.metaTokenChars = null;
    this.lastMetaValues = null;
    // heads diagram state (to be wired next)
    this.diagramEl = null;
    this.headMode = 'mean';
    this.selectedHead = null;
    // New visuals
    this.pathsCanvas = null;
    this.occlCanvas = null;
    this.alpha = 0.2; // residual weight for rollout/flow
    // Caches/state
    this.lastOutputs = null;
    this.label2id = null;
    this.randomBtn = null;
  }
  
  async init() {
    this.fenInput = document.getElementById('interp-fen');
    this.runBtn = document.getElementById('interp-run');
    this.layerSlider = document.getElementById('interp-layer');
    this.layerVal = document.getElementById('interp-layer-val');
    this.statusEl = document.getElementById('interp-status');
    this.heatmap = document.getElementById('interp-heatmap');
    this.lensPanel = document.getElementById('interp-lens');
    this.metaRowEl = document.getElementById('interp-meta-row');
    this.diagramEl = document.getElementById('interp-diagram');
    this.pathsCanvas = document.getElementById('interp-paths');
    this.occlCanvas = document.getElementById('interp-occlusion');
    this.randomBtn = document.getElementById('interp-random-fen');
    const meanBtn = document.getElementById('heads-mean-btn');
    if (meanBtn) meanBtn.addEventListener('click', () => { this.headMode = 'mean'; this.selectedHead = null; this.renderRollout(); });
    if (this.lensPanel) {
      // Event delegation for hover highlights on moves
      this.lensPanel.addEventListener('mouseover', (e) => {
        const target = e.target.closest('[data-move]');
        if (target && target.dataset.move) {
          this.highlightMove(target.dataset.move);
        }
      });
      this.lensPanel.addEventListener('mouseleave', () => {
        this.clearHighlights();
      });
      // Recompute occlusion on click for selected move
      this.lensPanel.addEventListener('click', (e) => {
        const target = e.target.closest('[data-move]');
        if (target && target.dataset.move) {
          this.computeOcclusion(this.lastOutputs, target.dataset.move).catch(console.warn);
        }
      });
    }

    if (this.runBtn) this.runBtn.addEventListener('click', () => this.run());
    if (this.layerSlider) this.layerSlider.addEventListener('input', () => this.updateLayer());
    if (this.randomBtn) this.randomBtn.addEventListener('click', () => this.loadRandomFen());

    // Pre-fill FEN with current board (if present) or start position
    if (this.fenInput && !this.fenInput.value) {
      this.fenInput.value = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    }

    this.status('Load interpretability model to begin');
  }
  
  async onActivate() {
    try {
      this.status('Loading interpretability model...');
      await ensureInterpretModelLoaded();
      this.status('Model ready. Enter FEN and click Run.');
      // Load labels for logit lens
      try {
        const resp = await fetch('./model/ROOK-CLF-9m-transformersjs/config.json');
        const cfg = await resp.json();
        this.id2label = cfg.id2label || null;
        if (this.id2label) {
          this.label2id = Object.fromEntries(Object.entries(this.id2label).map(([k,v]) => [v, parseInt(k,10)]));
        }
      } catch (_) {}
      // Auto-run once when tab opens
      await this.run();
    } catch (e) {
      this.status('Failed to load interpretability model. Ensure model.interpret.onnx exists.');
    }
  }
  
  onDeactivate() {}
  onModelLoaded() {}

  status(msg) { if (this.statusEl) this.statusEl.textContent = msg; }

  async run() {
    if (!this.fenInput || !this.heatmap) return;
    const fen = this.fenInput.value.trim();
    if (!fen) { this.status('Enter a FEN'); return; }
    try {
      this.status('Running forward pass...');
      const outputs = await runInterpretForward(fen);
      this.lastOutputs = outputs;
      this.metaTokenChars = this.parseMetaTokensFromFen(fen);
      // Cache the meta token characters for this run
      this.metaTokenChars = this.parseMetaTokensFromFen(fen);
      // Robustly select attentions tensor
      let attn = outputs.attentions;
      if (!attn) {
        const k = Object.keys(outputs).find(k => outputs[k] && outputs[k].dims && outputs[k].dims.length === 5);
        if (k) attn = outputs[k];
      }
      if (!attn) {
        this.status('Interpretability outputs missing attentions tensor.');
        return;
      }
      this.attnTensor = attn;
      const maxLayers = attn.dims[0];
      if (this.layerSlider) {
        this.layerSlider.max = String(maxLayers);
        this.layerSlider.value = String(maxLayers);
        this.layerVal.textContent = 'all';
      }
      await this.renderRollout();
      await this.renderLogitLens(outputs);
      await this.renderDiagram();
      // Compute additional mech‑interp views (non‑blocking)
      this.computeAndRenderPaths().catch(console.warn);
      this.computeOcclusion(outputs).catch(console.warn);
      // Highlight the last layer row initially
      this.highlightLensRow(maxLayers);
      // Populate meta row values
      this.updateMetaRow();
      this.status('Done. Adjust layer slider to explore.');
    } catch (e) {
      console.error(e);
      this.status('Error during forward/rollout. See console.');
    }
  }

  async loadRandomFen() {
    try {
      const resp = await fetch('./benchmarks/lichess_puzzles.json');
      const data = await resp.json();
      if (!Array.isArray(data) || data.length === 0) return;
      const idx = Math.floor(Math.random() * data.length);
      const fen = data[idx]?.fen;
      if (fen) {
        if (this.fenInput) this.fenInput.value = fen;
        await this.run();
      }
    } catch (e) {
      console.warn('Failed to load random FEN', e);
    }
  }

  updateLayer() { this.renderRollout(); this.computeAndRenderPaths().catch(()=>{}); }

  async renderRollout() {
    if (!this.attnTensor || !this.heatmap) return;
    const upto = this.layerSlider ? parseInt(this.layerSlider.value, 10) : null;
    const L = this.attnTensor.dims[0];
    const B = this.attnTensor.dims[1];
    const Hh = this.attnTensor.dims[2];
    const S = this.attnTensor.dims[3];
    if (this.layerVal) this.layerVal.textContent = upto ? String(upto) : 'all';

    // Direct CLS attention at the selected layer (sanity and stronger contrast)
    const lIdx = upto ? Math.max(1, Math.min(upto, L)) - 1 : (L - 1);
    const data = this.attnTensor.data; // Float32Array of length L*B*Hh*S*S
    const layerStride = B * Hh * S * S;
    const batchStride = Hh * S * S;
    const headStride = S * S;
    const cls = S - 1; // CLS at end (77)
    // Head selection or mean over heads for CLS query row
    const clsRow = new Float32Array(S);
    if (this.headMode === 'single' && this.selectedHead && this.selectedHead.layer === (lIdx+1)) {
      const h = this.selectedHead.head - 1; // 1-indexed in UI
      const base = (lIdx * layerStride) + (0 * batchStride) + (h * headStride) + (cls * S);
      for (let j = 0; j < S; j++) clsRow[j] = data[base + j];
    } else {
      for (let h = 0; h < Hh; h++) {
        const base = (lIdx * layerStride) + (0 * batchStride) + (h * headStride) + (cls * S);
        for (let j = 0; j < S; j++) clsRow[j] += data[base + j];
      }
      for (let j = 0; j < S; j++) clsRow[j] /= Hh;
    }
    // Normalize first 64 tokens
    let minv = Infinity, maxv = -Infinity;
    for (let i = 0; i < 64; i++) { const v = clsRow[i]; if (v < minv) minv = v; if (v > maxv) maxv = v; }
    const denom = (maxv - minv) || 1e-6;
    const board64 = new Float32Array(64);
    for (let i = 0; i < 64; i++) board64[i] = Math.max(0, (clsRow[i] - minv) / denom);
    // Metadata strip
    const meta13 = new Float32Array(13);
    for (let i = 0; i < 13; i++) meta13[i] = Math.max(0, clsRow[64 + i] || 0);
    let mmax = 0; for (let i = 0; i < 13; i++) if (meta13[i] > mmax) mmax = meta13[i];
    if (mmax > 0) for (let i = 0; i < 13; i++) meta13[i] /= mmax;
    this.lastHeatmapValues = board64;
    this.lastMetaValues = meta13;
    this.drawHeatmap(board64, meta13);
    this.updateMetaRow();
    this.highlightLensRow(upto || L);
  }

  async renderDiagram() {
    if (!this.diagramEl || !this.attnTensor) return;
    const L = this.attnTensor.dims[0];
    const Hh = this.attnTensor.dims[2];
    let html = '';
    for (let l = 1; l <= L; l++) {
      html += `<div class="diagram-layer">Layer ${l}</div>`;
      for (let h = 1; h <= Hh; h++) {
        const active = (this.headMode === 'single' && this.selectedHead && this.selectedHead.layer === l && this.selectedHead.head === h) ? ' style="outline:2px solid var(--accent)"' : '';
        html += `<button class="benchmark-btn secondary" data-layer="${l}" data-head="${h}"${active}>H${h}</button>`;
      }
    }
    this.diagramEl.innerHTML = html;
    this.diagramEl.querySelectorAll('button[data-layer]').forEach(btn => {
      btn.addEventListener('click', () => {
        const layer = parseInt(btn.dataset.layer, 10);
        const head = parseInt(btn.dataset.head, 10);
        this.headMode = 'single';
        this.selectedHead = { layer, head };
        // Sync layer slider to clicked layer
        if (this.layerSlider) {
          this.layerSlider.value = String(layer);
          if (this.layerVal) this.layerVal.textContent = String(layer);
        }
        this.renderRollout();
        this.computeAndRenderPaths().catch(()=>{});
        this.renderDiagram();
      });
    });
  }

  async computeAndRenderPaths() {
    if (!this.pathsCanvas || !this.attnTensor) return;
    const upto = this.layerSlider ? parseInt(this.layerSlider.value, 10) : null;
    const L = this.attnTensor.dims[0];
    const B = this.attnTensor.dims[1];
    const Hh = this.attnTensor.dims[2];
    const S = this.attnTensor.dims[3];
    const useL = upto ? Math.min(upto, L) : L;
    if (B !== 1) return;
    // Build Atilde per layer (mean over heads)
    const data = this.attnTensor.data;
    const layerStride = B * Hh * S * S;
    const batchStride = Hh * S * S;
    const headStride = S * S;
    const cls = S - 1;
    const Atilde = [];
    for (let l = 0; l < useL; l++) {
      const A = new Float32Array(S * S);
      // mean over heads for queries at all tokens
      for (let h = 0; h < Hh; h++) {
        const base = (l * layerStride) + (0 * batchStride) + (h * headStride);
        for (let i = 0; i < S*S; i++) A[i] += data[base + i];
      }
      for (let i = 0; i < S*S; i++) A[i] /= Hh;
      // row normalize
      for (let q = 0; q < S; q++) {
        let sum = 0; for (let j = 0; j < S; j++) sum += A[q*S + j];
        if (sum > 1e-9) { for (let j = 0; j < S; j++) A[q*S + j] /= sum; }
      }
      // residual correction
      for (let i = 0; i < S; i++) A[i*S + i] = this.alpha + (1 - this.alpha) * A[i*S + i];
      for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) if (i !== j) A[i*S + j] = (1 - this.alpha) * A[i*S + j];
      Atilde.push(A);
    }
    // Beam search for top-k paths to CLS
    const K = 5; const BEAM = 40;
    let states = [];
    for (let i = 0; i < 64; i++) states.push({ node: i, score: 1, path: [i] });
    for (let l = 0; l < useL; l++) {
      const A = Atilde[l];
      const next = [];
      for (const st of states) {
        // take top fan-out from this node
        const row = st.node;
        // precompute top-8 destinations
        const dests = Array.from({length: S}, (_, j) => ({ j, w: A[row*S + j] }))
          .sort((a,b)=>b.w-a.w).slice(0,8);
        for (const {j, w} of dests) {
          next.push({ node: j, score: st.score * (w || 1e-9), path: [...st.path, j] });
        }
      }
      next.sort((a,b)=>b.score-a.score);
      states = next.slice(0, BEAM);
    }
    // Ensure end at CLS by appending a final jump probability
    const endPaths = states
      .map(s => {
        const wToCls = useL > 0 ? Atilde[useL-1][s.node*S + cls] : 0;
        return { node: cls, score: s.score * (wToCls || 1e-12), path: [...s.path, cls] };
      })
      .sort((a,b)=>b.score-a.score)
      .slice(0, K);
    // Draw
    const ctx = this.pathsCanvas.getContext('2d');
    const w = this.pathsCanvas.width, h = this.pathsCanvas.height;
    ctx.clearRect(0,0,w,h);
    // draw faint board grid
    const boardSize = Math.min(w, h);
    const cellW = boardSize/8, cellH = boardSize/8;
    const x0 = Math.floor((w - boardSize)/2), y0 = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let r=0;r<8;r++) for (let f=0;f<8;f++) ctx.strokeRect(x0+f*cellW,y0+r*cellH,cellW,cellH);
    // helper to get square center for token index
    const center = (idx) => {
      if (idx < 64) {
        const r = Math.floor(idx/8), f = idx%8;
        return { x: x0 + f*cellW + cellW/2, y: y0 + r*cellH + cellH/2 };
      } else { // metadata/CLS: place near bottom center
        return { x: w/2, y: y0 + boardSize + 10 };
      }
    };
    for (const p of endPaths) {
      ctx.beginPath();
      // draw segments between successive board-square nodes, skipping non-board hops
      let last = null;
      for (let t = 0; t < p.path.length; t++) {
        const node = p.path[t];
        if (node < 64) {
          const c = center(node);
          if (!last) ctx.moveTo(c.x, c.y);
          else ctx.lineTo(c.x, c.y);
          last = c;
        }
      }
      const alpha = Math.min(1, 0.15 + 0.85 * (p.score / (endPaths[0]?.score || 1e-9)));
      ctx.strokeStyle = `rgba(138,232,216,${alpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  async computeOcclusion(baselineOutputs, targetLabel = null) {
    if (!this.occlCanvas) return;
    try {
      // Determine target class (top‑1) or provided label
      let logits = baselineOutputs?.logits?.data || null;
      if (!logits) {
        // Fall back to recomputing
        const fen = this.fenInput.value.trim();
        baselineOutputs = await runInterpretForward(fen);
        logits = baselineOutputs.logits.data;
      }
      let target;
      if (targetLabel && this.label2id && this.label2id[targetLabel] != null) {
        target = this.label2id[targetLabel];
      } else {
        let best = -Infinity; target = 0;
        for (let i=0;i<logits.length;i++){ if (logits[i] > best){ best = logits[i]; target = i; } }
      }
      const baseScore = logits[target];
      // Build processed string for masking
      const fen = this.fenInput.value.trim();
      const processed = fen.includes('/') ? processFen(fen) : fen;
      const chars = processed.split(''); // length 77
      const deltas = new Float32Array(64);
      for (let i=0;i<64;i++) {
        const orig = chars[i];
        if (orig === '.') { deltas[i] = 0; continue; }
        chars[i] = '.';
        const masked = chars.join('');
        const out = await runInterpretForward(masked);
        const score = out.logits.data[target];
        deltas[i] = Math.max(0, baseScore - score);
        chars[i] = orig; // restore
        // throttle UI a bit
        if (i % 8 === 7) await new Promise(r=>setTimeout(r,0));
      }
      // normalize 0..1
      let m=0; for (let i=0;i<64;i++) if (deltas[i]>m) m=deltas[i];
      if (m>0) for (let i=0;i<64;i++) deltas[i]/=m;
      this.drawBoardHeatmapOnCanvas(this.occlCanvas, deltas);
    } catch (e) {
      console.warn('Occlusion failed', e);
    }
  }

  drawBoardHeatmapOnCanvas(canvas, values) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);
    const boardSize = Math.min(w, h);
    const cellW = boardSize/8, cellH = boardSize/8;
    const x0 = Math.floor((w - boardSize)/2), y0 = 0;
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const idx = r*8+f;
        const v = Math.max(0, Math.min(1, values[idx] || 0));
        const a = 0.6 + 0.4 * v;
        const red = Math.floor(255 * v);
        const green = Math.floor(100 * (1 - v));
        const blue = Math.floor(200 * (1 - v));
        ctx.fillStyle = `rgba(${red},${green},${blue},${a})`;
        const x = x0 + f*cellW, y = y0 + r*cellH;
        ctx.fillRect(x,y,cellW,cellH);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.strokeRect(x,y,cellW,cellH);
      }
    }
  }

  drawHeatmap(values, metaValues) {
    if (!this.heatmap) return;
    const ctx = this.heatmap.getContext('2d');
    const w = this.heatmap.width, h = this.heatmap.height;
    ctx.clearRect(0, 0, w, h);
    // Use full canvas for the 8x8 board (no extra bottom row)
    const boardSize = Math.min(w, h);
    const cellW = boardSize / 8, cellH = boardSize / 8;
    const x0 = Math.floor((w - boardSize) / 2);
    const y0 = 0;
    // Board coordinates: FEN order is ranks 8->1, files a->h, left-to-right
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const idx = r * 8 + f; // 0..63
        const v = Math.max(0, Math.min(1, values[idx] || 0));
        const x = x0 + f * cellW;
        const y = y0 + r * cellH;
        // Cool-to-warm color map
        const a = 0.6 + 0.4 * v;
        const red = Math.floor(255 * v);
        const green = Math.floor(100 * (1 - v));
        const blue = Math.floor(200 * (1 - v));
        ctx.fillStyle = `rgba(${red},${green},${blue},${a})`;
        ctx.fillRect(x, y, cellW, cellH);
        // subtle grid overlay
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.strokeRect(x, y, cellW, cellH);
        // Square label (e.g., a8), readable over color
        const fileChar = String.fromCharCode('a'.charCodeAt(0) + f);
        const rank = 8 - r;
        const label = `${fileChar}${rank}`;
        ctx.font = `${Math.max(10, Math.floor(cellH * 0.22))}px ui-monospace, monospace`;
        ctx.fillStyle = (red + green + blue) / 3 > 140 ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + cellW / 2, y + cellH / 2);
      }
    }
    // Metadata visualization moved to DOM meta row.
  }

  // Highlight from/to squares for a UCI move (e2e4, e7e8q)
  highlightMove(uci) {
    if (!this.heatmap) return;
    if (this.lastHeatmapValues) this.drawHeatmap(this.lastHeatmapValues, this.lastMetaValues);
    const sq = (s) => {
      const file = s.charCodeAt(0) - 'a'.charCodeAt(0); // 0..7
      const rank = parseInt(s[1], 10); // 1..8
      const row = 8 - rank; // 0..7, top is 0
      const col = file;
      return { row, col };
    };
    const from = uci.slice(0,2);
    const to = uci.slice(2,4);
    const f = sq(from), t = sq(to);
    const ctx = this.heatmap.getContext('2d');
    const w = this.heatmap.width, h = this.heatmap.height;
    const boardSize = Math.min(w, h);
    const cellW = boardSize / 8, cellH = boardSize / 8;
    const x0 = Math.floor((w - boardSize) / 2);
    const y0 = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(245, 166, 35, 0.9)'; // amber
    ctx.strokeRect(x0 + f.col * cellW + 1.5, y0 + f.row * cellH + 1.5, cellW - 3, cellH - 3);
    ctx.strokeStyle = 'rgba(92, 212, 157, 0.9)'; // green
    ctx.strokeRect(x0 + t.col * cellW + 1.5, y0 + t.row * cellH + 1.5, cellW - 3, cellH - 3);
  }

  clearHighlights() {
    if (this.lastHeatmapValues) this.drawHeatmap(this.lastHeatmapValues, this.lastMetaValues);
  }

  highlightLensRow(layerIndex) {
    if (!this.lensPanel) return;
    const rows = this.lensPanel.querySelectorAll('tbody tr');
    rows.forEach(r => r.classList.remove('active'));
    if (!layerIndex) return;
    const idx = Math.max(1, Math.min(layerIndex, rows.length));
    const row = rows[idx-1];
    if (row) row.classList.add('active');
  }

  updateMetaRow() {
    if (!this.metaRowEl || !this.lastMetaValues) return;
    const vals = this.lastMetaValues;
    const chars = this.metaTokenChars || (this.fenInput ? this.parseMetaTokensFromFen(this.fenInput.value.trim()) : null) || Array(13).fill('');
    let html = '';
    for (let i = 0; i < 13; i++) {
      const v = Math.max(0, Math.min(1, vals[i] || 0));
      const red = Math.floor(255 * v);
      const green = Math.floor(100 * (1 - v));
      const blue = Math.floor(200 * (1 - v));
      const bg = `rgba(${red},${green},${blue},0.8)`;
      const border = '1px solid var(--border)';
      const color = (red + green + blue) / 3 > 140 ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.95)';
      html += `<div class="meta-cell" style="background:${bg}; border:${border}; color:${color};">${chars[i] || ''}</div>`;
    }
    this.metaRowEl.innerHTML = html;
  }

  parseMetaTokensFromFen(fen) {
    try {
      const parts = fen.split(' ');
      const turn = (parts[1] || 'w')[0];
      const castling = (parts[2] || '').padEnd(4, '.');
      let ep = parts[3] || '-';
      if (ep === '-') ep = '..';
      ep = ep.padEnd(2, '.');
      const half = (parts[4] || '0').padEnd(2, '.') + '.';
      const full = (parts[5] || '1').padEnd(3, '.');
      const meta = [turn, ...castling.slice(0,4), ...ep.slice(0,2), ...half.slice(0,3), ...full.slice(0,3)];
      return meta.slice(0,13);
    } catch {
      return null;
    }
  }

  // Board rendering removed: using heatmap canvas only

  async renderLogitLens(outputs) {
    if (!this.lensPanel || !outputs?.hidden_states || !outputs?.classifier_weight) return;
    const hs = outputs.hidden_states; // ort.Tensor [L+1, B, S, H]
    const W = outputs.classifier_weight; // ort.Tensor [H, C]
    const Lp1 = hs.dims[0];
    const S = hs.dims[2];
    const H = hs.dims[3];
    const C = W.dims[1];
    const layersToShow = Math.min(Lp1 - 1, 8); // show up to 8 layers for brevity

    const wData = W.data; // Float32Array length H*C
    // Build table rows per layer with top-5 moves
    const rows = [];
    for (let l = 1; l <= layersToShow; l++) {
      // h_l at CLS token: hs[l,0,S-1,:]
      const base = (l * 1 * S * H) + ((S - 1) * H);
      // Multiply h_l [H] by W [H,C] => logits [C]
      const logits = new Float32Array(C);
      for (let c = 0; c < C; c++) {
        let acc = 0;
        for (let h = 0; h < H; h++) acc += hs.data[base + h] * wData[h * C + c];
        logits[c] = acc;
      }
      // Softmax for readability
      let maxLog = -Infinity; for (let c = 0; c < C; c++) if (logits[c] > maxLog) maxLog = logits[c];
      let sum = 0; const probs = new Float32Array(C);
      for (let c = 0; c < C; c++) { probs[c] = Math.exp(logits[c] - maxLog); sum += probs[c]; }
      for (let c = 0; c < C; c++) probs[c] /= sum;
      // Top-5 moves
      const indices = Array.from({length: C}, (_, i) => i).sort((a,b) => probs[b] - probs[a]).slice(0,5);
      const labels = indices.map(i => this.id2label ? this.id2label[String(i)] : String(i));
      rows.push({ layer: l, entries: labels.map((lab,k)=>({ move: lab, prob: probs[indices[k]] })) });
    }
    // Render table
    let html = '<table class="lens-table"><thead><tr><th>Layer</th><th>Top 1</th><th>Top 2</th><th>Top 3</th><th>Top 4</th><th>Top 5</th></tr></thead><tbody>';
    for (const r of rows) {
      html += `<tr><td>L${r.layer}</td>`;
      for (let i = 0; i < 5; i++) {
        const cell = r.entries[i];
        const label = cell ? cell.move : '';
        const p = cell ? (cell.prob*100).toFixed(1) : '';
        html += `<td class="lens-cell" data-move="${label}">${label} <span class="aux-metric">${p}%</span></td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    this.lensPanel.innerHTML = html;
  }
}
