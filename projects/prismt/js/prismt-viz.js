/* PRISMT — interactive schematics (illustrative; synthetic signals, not model output).
   Cortex maps use the 41-region grid atlas (data/cortex-grid.bin, from grid_values.npy).
   1. Teaser: dorsal-cortex calcium and ACh maps over a trial, with the
      matching area × time token matrix, masked tokens, and causal attention.
   2. Tokenization: one scalar token per region × time × modality, plus CLS.
   3. Masking & reconstruction with a toy causal estimator.
   4. Block-causal attention mask (hover to inspect).
   5. PRISMt attribution: rollout routing × signed value message, reduced over
      layer-head pairs by class-discriminative weights.
   6. Structured motifs (non-negative CP, modality simplex), early → late learning.
   Requires /js/viz-kit.js. */
(function () {
  'use strict';

  var K = window.VizKit;
  if (!K) return;

  var ACCENT = K.css('--accent') || '#0f766e';
  var CA = K.css('--ca') || '#b8325a';
  var ACH = K.css('--ach') || '#0f8a7e';
  var INK = '#1b1b24';
  var TEXT2 = '#4b4b5a';
  var TEXT3 = '#6a6a7b';
  var loops = [];

  function font(size, weight) { return (weight || 500) + ' ' + size + 'px Inter, system-ui, -apple-system, sans-serif'; }
  function text(c, s, x, y, opts) {
    opts = opts || {};
    c.font = font(opts.size || 11.5, opts.weight || 500);
    c.textAlign = opts.align || 'left';
    c.textBaseline = opts.baseline || 'middle';
    c.fillStyle = opts.color || TEXT2;
    c.fillText(s, x, y);
  }
  function viridis(v) { return K.colormap(K.VIRIDIS, v); }
  function hatch(c, x, y, w, h) {
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    c.fillStyle = '#f1f1f4';
    c.fillRect(x, y, w, h);
    c.strokeStyle = '#c9c9d3';
    c.lineWidth = 1;
    for (var d = -h; d < w; d += 5) {
      c.beginPath();
      c.moveTo(x + d, y + h);
      c.lineTo(x + d + h, y);
      c.stroke();
    }
    c.restore();
  }

  // ---------------------------------------------------------------------------
  // Stylized dorsal cortex (two hemispheres, Voronoi-partitioned areas)
  // ---------------------------------------------------------------------------
  var AREAS = [
    { id: 'MOs', x: 0.2, y: 0.15, frontal: true },
    { id: 'MOp', x: 0.52, y: 0.22, frontal: true },
    { id: 'SSp', x: 0.66, y: 0.46 },
    { id: 'SSb', x: 0.9, y: 0.52 },
    { id: 'PTLp', x: 0.42, y: 0.56 },
    { id: 'RSP', x: 0.11, y: 0.62 },
    { id: 'VISp', x: 0.6, y: 0.82 },
    { id: 'VISm', x: 0.3, y: 0.84 },
    { id: 'AUD', x: 0.95, y: 0.77 }
  ];
  var NA = AREAS.length;
  var cortexCache = {};

  function stylizedMask(pw, ph) {
    var key = 's' + pw + 'x' + ph;
    if (cortexCache[key]) return cortexCache[key];
    var gap = Math.max(2, Math.round(pw * 0.025));
    var hw = (pw - gap) / 2;
    var labels = new Int16Array(pw * ph).fill(-1);
    for (var py = 0; py < ph; py++) {
      var v = (py + 0.5) / ph;
      for (var px = 0; px < pw; px++) {
        var left = px < hw;
        if (!left && px < hw + gap) continue;
        var u = left ? (hw - px - 0.5) / hw : (px + 0.5 - hw - gap) / hw;
        var ext = 0.62 + 0.38 * Math.pow(v, 0.7);
        if (Math.pow(u / ext, 2.6) + Math.pow(Math.abs(2 * v - 1), 2.6) > 1) continue;
        var best = 0, bd = Infinity;
        for (var r = 0; r < NA; r++) {
          var dx = u - AREAS[r].x, dy = (v - AREAS[r].y) * 1.15;
          var d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = r; }
        }
        labels[py * pw + px] = best + (left ? 0 : NA);
      }
    }
    var edge = new Uint8Array(pw * ph);
    for (py = 0; py < ph; py++) {
      for (px = 0; px < pw; px++) {
        var i = py * pw + px, l = labels[i];
        if (l < 0) continue;
        if ((px + 1 < pw && labels[i + 1] !== l) || (py + 1 < ph && labels[i + pw] !== l) ||
            (px > 0 && labels[i - 1] < 0) || (py > 0 && labels[i - pw] < 0)) edge[i] = 1;
      }
    }
    var canvas = document.createElement('canvas');
    canvas.width = pw;
    canvas.height = ph;
    var m = { pw: pw, ph: ph, labels: labels, edge: edge, canvas: canvas, ctx: canvas.getContext('2d'), img: null, hw: hw, gap: gap };
    m.img = m.ctx.createImageData(pw, ph);
    cortexCache[key] = m;
    return m;
  }

  // Real parcellation: the 41-region grid atlas used by PRISMt (grid_values.npy,
  // left/right masks merged and transposed as in evaluation/visualization.py, cropped to
  // the full cortex extent and rotated 180° so anterior is up).
  var atlas = null;
  function loadAtlas() {
    return fetch('data/cortex-grid.bin?v=2').then(function (r) {
      if (!r.ok) throw new Error('atlas');
      return r.arrayBuffer();
    }).then(function (buf) {
      var dv = new DataView(buf), w = dv.getUint16(0, true), h = dv.getUint16(2, true);
      var lab = new Uint8Array(buf, 4, w * h);
      var R = 0;
      for (var i = 0; i < lab.length; i++) if (lab[i] > R) R = lab[i];
      // Functional group of each region from its left-hemisphere centroid (for the synthetic signals).
      var sx = new Float64Array(R + 1), sy = new Float64Array(R + 1), n = new Float64Array(R + 1);
      for (var y = 0; y < h; y++) for (var x = 0; x < w / 2; x++) {
        var l = lab[y * w + x];
        if (l) { sx[l] += x; sy[l] += y; n[l]++; }
      }
      var ymin = Infinity, ymax = -Infinity, xmid = w / 2;
      for (l = 1; l <= R; l++) if (n[l]) { var cy = sy[l] / n[l]; ymin = Math.min(ymin, cy); ymax = Math.max(ymax, cy); }
      var group = new Int16Array(R + 1).fill(0);
      for (l = 1; l <= R; l++) {
        if (!n[l]) continue;
        var u = (xmid - sx[l] / n[l]) / xmid;                 // 0 midline → 1 lateral
        var v = (sy[l] / n[l] - ymin) / (ymax - ymin);         // anterior (top, narrow end) → posterior
        var best = 0, bd = Infinity;
        for (var r = 0; r < NA; r++) {
          var dx = u - AREAS[r].x, dy = (v - AREAS[r].y) * 1.15, d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = r; }
        }
        group[l] = best;
      }
      atlas = { w: w, h: h, lab: lab, group: group };
      cortexCache = {};
    });
  }

  function cortexMask(pw, ph) {
    if (!atlas) return stylizedMask(pw, ph);
    var key = 'g' + pw + 'x' + ph;
    if (cortexCache[key]) return cortexCache[key];
    var labels = new Int32Array(pw * ph).fill(-1); // packs region·1000 + group; needs 32 bits
    for (var py = 0; py < ph; py++) {
      var ay = Math.min(atlas.h - 1, Math.floor((py + 0.5) / ph * atlas.h));
      for (var px = 0; px < pw; px++) {
        var ax = Math.min(atlas.w - 1, Math.floor((px + 0.5) / pw * atlas.w));
        var l = atlas.lab[ay * atlas.w + ax];
        if (l) labels[py * pw + px] = atlas.group[l] + (ax < atlas.w / 2 ? 0 : NA) + 1000 * l; // group, hemisphere, region
      }
    }
    var edge = new Uint8Array(pw * ph);
    for (py = 0; py < ph; py++) for (px = 0; px < pw; px++) {
      var i = py * pw + px, lb = labels[i];
      if (lb < 0) continue;
      var reg = Math.floor(lb / 1000);
      var nb = function (j) { return labels[j] < 0 ? -1 : Math.floor(labels[j] / 1000); };
      if ((px + 1 < pw && nb(i + 1) !== reg) || (py + 1 < ph && nb(i + pw) !== reg) ||
          (px > 0 && labels[i - 1] < 0) || (py > 0 && labels[i - pw] < 0)) edge[i] = 1;
      labels[i] = lb % 1000;
    }
    var canvas = document.createElement('canvas');
    canvas.width = pw; canvas.height = ph;
    var m = { pw: pw, ph: ph, labels: labels, edge: edge, canvas: canvas, ctx: canvas.getContext('2d'), img: null };
    m.img = m.ctx.createImageData(pw, ph);
    cortexCache[key] = m;
    return m;
  }

  // values: array of 2·NA numbers in [0, 1] (left hemisphere groups first)
  function drawCortex(c, dpr, x, y, w, h, values) {
    var pw = Math.max(8, Math.round(w * dpr)), ph = Math.max(8, Math.round(h * dpr));
    var m = cortexMask(pw, ph);
    var cols = [];
    for (var r = 0; r < 2 * NA; r++) cols.push(K.colormapRGB(K.VIRIDIS, values[r], [0, 0, 0]));
    var d = m.img.data, L = m.labels, E = m.edge;
    for (var i = 0, n = pw * ph; i < n; i++) {
      var l = L[i], o = i * 4;
      if (l < 0) { d[o + 3] = 0; continue; }
      if (E[i]) { d[o] = 255; d[o + 1] = 255; d[o + 2] = 255; d[o + 3] = 235; continue; }
      var col = cols[l];
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    m.ctx.putImageData(m.img, 0, 0);
    c.drawImage(m.canvas, x, y, w, h);
  }

  // Synthetic trial responses (latency, amplitude): visual first, then parietal, then frontal.
  var RESP = {
    MOs: { ca: [0.42, 0.55], ach: [0.28, 0.5] },
    MOp: { ca: [0.38, 0.6], ach: [0.3, 0.42] },
    SSp: { ca: [0.3, 0.42], ach: [0.3, 0.34] },
    SSb: { ca: [0.3, 0.34], ach: [0.34, 0.3] },
    PTLp: { ca: [0.16, 0.62], ach: [0.26, 0.38] },
    RSP: { ca: [0.2, 0.48], ach: [0.26, 0.42] },
    VISp: { ca: [0.06, 0.95], ach: [0.24, 0.34] },
    VISm: { ca: [0.1, 0.74], ach: [0.25, 0.34] },
    AUD: { ca: [0.14, 0.3], ach: [0.3, 0.3] }
  };
  function alpha(t, lat, tau) { var x = (t - lat) / tau; return x <= 0 ? 0 : x * Math.exp(1 - x); }
  function activity(area, mod, t, late) {
    var p = RESP[area.id][mod];
    var visual = area.id === 'VISp' || area.id === 'VISm';
    var gain = (mod === 'ach' && late) ? (area.frontal ? 1.75 : visual ? 0.55 : 1) : 1;
    var tau = mod === 'ca' ? 0.16 : 0.3;
    return K.clamp(0.1 + 0.85 * gain * p[1] * alpha(t, p[0], tau), 0, 1);
  }

  // ---------------------------------------------------------------------------
  // 1. Teaser
  // ---------------------------------------------------------------------------
  function initTeaser() {
    var root = document.getElementById('prismt-teaser');
    if (!root) return;
    var canvas = root.querySelector('canvas');
    var readout = root.querySelector('[data-readout]');
    var T0 = -0.2, T1 = 1.0, BINS = 12;
    var late = false;
    var clock = 1.6;
    var DUR = 5.2, HOLD = 1.0;
    var rand = K.rng(5);
    var masked = [];
    for (var r = 0; r < 2 * NA; r++) {
      masked.push([]);
      for (var b = 0; b < BINS; b++) masked[r].push(rand() < 0.14);
    }
    var hemiNoise = [];
    for (r = 0; r < 2 * NA; r++) hemiNoise.push(0.94 + 0.12 * rand());

    var st = K.stage(canvas, function () { draw(); });

    function trialTime() { return T0 + (T1 - T0) * Math.min(1, clock / DUR); }

    function draw() {
      var c = st.ctx, w = st.w, h = st.h;
      c.clearRect(0, 0, w, h);
      var t = trialTime();
      var narrow = w < 640;

      // Layout: maps (left/top) and token matrix (right/bottom)
      var mapBox, matBox;
      if (narrow) {
        mapBox = { x: 12, y: 22, w: w - 24, h: h * 0.42 };
        matBox = { x: 70, y: h * 0.42 + 56, w: w - 84, h: h * 0.58 - 84 };
      } else {
        mapBox = { x: 20, y: 34, w: w * 0.42, h: h - 96 };
        matBox = { x: w * 0.42 + 110, y: 36, w: w * 0.58 - 136, h: h - 92 };
      }

      // Two cortex maps
      var mw = Math.min((mapBox.w - 24) / 2, (mapBox.h - 64) / 1.05);
      var mh = mw * 185 / 204;
      var my = mapBox.y + Math.max(18, (mapBox.h - (mh + 64)) / 2 + 18);
      var mods = narrow
        ? [{ key: 'ca', name: 'Ca²⁺ (jRCaMP1b)', color: CA }, { key: 'ach', name: 'ACh (ACh3.0)', color: ACH }]
        : [{ key: 'ca', name: 'Calcium (jRCaMP1b)', color: CA }, { key: 'ach', name: 'Acetylcholine (ACh3.0)', color: ACH }];
      mods.forEach(function (mod, j) {
        var mx = mapBox.x + j * (mw + 24) + (mapBox.w - 2 * mw - 24) / 2;
        var vals = [];
        for (var hemi = 0; hemi < 2; hemi++) {
          for (var a = 0; a < NA; a++) vals.push(K.clamp(activity(AREAS[a], mod.key, t, late) * hemiNoise[hemi * NA + a], 0, 1));
        }
        drawCortex(c, st.dpr, mx, my, mw, mh, vals);
        text(c, mod.name, mx + mw / 2, my - 14, { align: 'center', size: 11.5, weight: 600, color: mod.color });
      });

      // Trial-time axis under the maps
      var ay = my + mh + 22, ax0 = mapBox.x + 16, ax1 = mapBox.x + mapBox.w - 16;
      c.strokeStyle = 'rgba(27,27,36,0.25)';
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(ax0, ay); c.lineTo(ax1, ay); c.stroke();
      var X = function (tt) { return ax0 + (ax1 - ax0) * (tt - T0) / (T1 - T0); };
      c.fillStyle = 'rgba(179,67,58,0.9)';
      c.fillRect(X(0) - 0.75, ay - 7, 1.5, 14);
      text(c, 'stimulus', X(0), ay + 14, { align: 'center', size: 10, color: TEXT3 });
      text(c, '−0.2 s', ax0, ay + 14, { align: 'center', size: 10, color: TEXT3 });
      text(c, '1.0 s', ax1, ay + 14, { align: 'center', size: 10, color: TEXT3 });
      c.beginPath(); c.arc(X(t), ay, 5, 0, Math.PI * 2); c.fillStyle = INK; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = '#fff'; c.stroke();

      // Token matrix: 2 modality blocks × NA areas, BINS time bins
      var rows = 2 * NA + 1; // +1 spacer between blocks
      var cw = matBox.w / BINS, ch = matBox.h / rows;
      var cur = Math.min(BINS - 1, Math.floor((t - T0) / (T1 - T0) * BINS));
      for (var m = 0; m < 2; m++) {
        for (var a = 0; a < NA; a++) {
          var ry = matBox.y + (m * (NA + 1) + a) * ch;
          if (ch >= 9) text(c, AREAS[a].id, matBox.x - 8, ry + ch / 2, { align: 'right', size: Math.max(8.5, Math.min(10.5, ch * 0.75)), color: TEXT3 });
          for (var bb = 0; bb < BINS; bb++) {
            var bt = T0 + (bb + 0.5) * (T1 - T0) / BINS;
            var v = activity(AREAS[a], m ? 'ach' : 'ca', bt, late);
            var x0 = matBox.x + bb * cw, y0 = ry;
            var isMasked = masked[m * NA + a][bb];
            if (isMasked && bb > cur) hatch(c, x0 + 1, y0 + 1, cw - 2, ch - 2);
            else {
              c.fillStyle = viridis(v);
              c.fillRect(x0 + 1, y0 + 1, cw - 2, ch - 2);
              if (isMasked) { c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.strokeRect(x0 + 2, y0 + 2, cw - 4, ch - 4); }
            }
          }
        }
        var by = matBox.y + m * (NA + 1) * ch;
        c.save();
        c.translate(matBox.x - 58, by + NA * ch / 2);
        c.rotate(-Math.PI / 2);
        text(c, m ? 'ACh' : 'Ca²⁺', 0, 0, { align: 'center', size: 11.5, weight: 700, color: m ? ACH : CA });
        c.restore();
      }
      // Future (causally masked) columns
      var fx = matBox.x + (cur + 1) * cw;
      if (cur < BINS - 1) {
        c.fillStyle = 'rgba(251,250,247,0.72)';
        c.fillRect(fx, matBox.y, matBox.x + matBox.w - fx, matBox.h);
        text(c, 'future: not attended', (fx + matBox.x + matBox.w) / 2, matBox.y + matBox.h + 14, { align: 'center', size: 10, color: TEXT3 });
      }
      // Attention from one query token in the current column to its causal context
      var qRow = Math.floor((clock * 1.3) % (2 * NA));
      var qm = qRow >= NA ? 1 : 0, qa = qRow % NA;
      var qx = matBox.x + cur * cw + cw / 2, qy = matBox.y + (qm * (NA + 1) + qa) * ch + ch / 2;
      var lr = K.rng(1000 + cur * 37 + qRow);
      for (var k = 0; k < 14; k++) {
        var tb = Math.floor(lr() * (cur + 1));
        var tm = lr() < 0.55 ? qm : 1 - qm;
        var ta = lr() < 0.35 ? qa : Math.floor(lr() * NA);
        var kx = matBox.x + tb * cw + cw / 2, ky = matBox.y + (tm * (NA + 1) + ta) * ch + ch / 2;
        var wgt = 0.25 + 0.75 * lr();
        c.beginPath();
        c.moveTo(qx, qy);
        c.quadraticCurveTo((qx + kx) / 2, Math.min(qy, ky) - 18 - 14 * wgt, kx, ky);
        c.strokeStyle = K.rgba(ACCENT, 0.18 + 0.45 * wgt);
        c.lineWidth = 0.8 + 1.6 * wgt;
        c.stroke();
      }
      c.strokeStyle = INK;
      c.lineWidth = 2;
      c.strokeRect(matBox.x + cur * cw + 0.5, matBox.y - 3, cw - 1, matBox.h + 6);
      c.beginPath(); c.arc(qx, qy, 3.5, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.5; c.stroke();
      text(c, 'time →', matBox.x + matBox.w, matBox.y - 12, { align: 'right', size: 10, color: TEXT3 });
      text(c, 'tokens: region groups × time', matBox.x, matBox.y - 12, { size: 10, color: TEXT3 });

      if (readout) readout.innerHTML = 'trial time <strong>' + (t >= 0 ? '+' : '') + t.toFixed(2) + ' s</strong>';
    }

    function step(dt) {
      clock += dt;
      if (clock > DUR + HOLD) clock = 0;
      draw();
    }

    var lp = K.loop(root, step);
    loops.push(lp);
    K.playButton(root.querySelector('[data-play]'), lp);
    K.segmented(root.querySelector('[data-mode]'), function (v) {
      late = v === 'late';
      if (!lp.isPlaying()) lp.render();
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Tokenization
  // ---------------------------------------------------------------------------
  function initTokens() {
    var root = document.getElementById('prismt-tokens');
    if (!root) return;
    var canvas = root.querySelector('canvas');
    var readout = root.querySelector('[data-readout]');
    var NR = 4, NT = 5, NM = 2;
    var MODS = [{ name: 'Ca²⁺', color: CA }, { name: 'ACh', color: ACH }];
    var N = NR * NT * NM + 1; // + CLS
    var PER = 2.4 / N;
    var clock = 1.9;
    var vals = [];
    for (var m = 0; m < NM; m++) {
      vals.push([]);
      for (var r = 0; r < NR; r++) {
        vals[m].push([]);
        for (var t = 0; t < NT; t++) vals[m][r].push(0.2 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.9 + r * 1.3 + m * 2.1)));
      }
    }
    // Token order: CLS, then time-major (all regions and modalities at t1, then t2, ...)
    var order = [null];
    for (t = 0; t < NT; t++) for (m = 0; m < NM; m++) for (r = 0; r < NR; r++) order.push({ t: t, m: m, r: r });
    var st = K.stage(canvas, function () { draw(); });

    function draw() {
      var c = st.ctx, w = st.w, h = st.h;
      c.clearRect(0, 0, w, h);
      var progress = Math.min(N, Math.floor(clock / PER));
      var frac = K.clamp((clock - progress * PER) / PER, 0, 1);

      var cell = Math.min((w - 110) / (2 * NT + 1), (h - 190) / NR, 44);
      var gridW = NT * cell, gap = cell;
      var gx0 = (w - (2 * gridW + gap)) / 2, gy = 40;
      function cellRect(o) { return [gx0 + o.m * (gridW + gap) + o.t * cell + 1, gy + o.r * cell + 1, cell - 2, cell - 2]; }
      for (m = 0; m < NM; m++) {
        var x0 = gx0 + m * (gridW + gap);
        text(c, MODS[m].name, x0, gy - 14, { size: 11.5, weight: 700, color: MODS[m].color });
        if (m === NM - 1) text(c, 'time →', x0 + gridW, gy - 14, { align: 'right', size: 10.5, color: TEXT3 });
        for (r = 0; r < NR; r++) {
          if (m === 0) text(c, 'r' + (r + 1), x0 - 8, gy + r * cell + cell / 2, { align: 'right', size: 10.5, color: TEXT3 });
          for (t = 0; t < NT; t++) {
            c.fillStyle = viridis(vals[m][r][t]);
            c.fillRect(x0 + t * cell + 1, gy + r * cell + 1, cell - 2, cell - 2);
          }
        }
      }

      var perRow = 14, tokW = Math.min(30, (w - 40) / perRow - 4), tokH = 22;
      var rowW = perRow * (tokW + 4) - 4, sx0 = (w - rowW) / 2;
      var seqY = gy + NR * cell + 44;
      text(c, 'sequence: [CLS] + one token per region × time × modality (time-major)', w / 2, seqY - 18, { align: 'center', size: 11, weight: 600, color: TEXT2 });
      function slot(i) { return [sx0 + (i % perRow) * (tokW + 4), seqY + Math.floor(i / perRow) * (tokH + 7)]; }
      function tok(x, y, o) {
        c.fillStyle = '#fff'; c.strokeStyle = 'rgba(27,27,36,0.2)'; c.lineWidth = 1;
        c.beginPath(); if (c.roundRect) c.roundRect(x, y, tokW, tokH, 5); else c.rect(x, y, tokW, tokH); c.fill(); c.stroke();
        if (!o) { c.fillStyle = K.rgba(ACCENT, 0.14); c.fillRect(x + 2, y + 2, tokW - 4, tokH - 4); text(c, 'CLS', x + tokW / 2, y + tokH / 2, { align: 'center', size: 8.5, weight: 700, color: ACCENT }); return; }
        c.fillStyle = viridis(vals[o.m][o.r][o.t]); c.fillRect(x + 3, y + 3, tokW - 6, tokH - 8);
        c.fillStyle = MODS[o.m].color; c.fillRect(x + 3, y + tokH - 4, tokW - 6, 2);
      }
      for (var i = 0; i < N; i++) {
        var p = slot(i), o = order[i];
        if (i < progress) tok(p[0], p[1], o);
        else if (i === progress) {
          if (o) {
            var src = cellRect(o);
            c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(src[0] - 1, src[1] - 1, src[2] + 2, src[3] + 2);
            var e = K.easeInOut(frac);
            tok(K.lerp(src[0], p[0], e), K.lerp(src[1], p[1], e), o);
          } else tok(p[0], p[1], o);
        } else {
          c.strokeStyle = 'rgba(27,27,36,0.12)'; c.setLineDash([3, 3]); c.strokeRect(p[0] + 0.5, p[1] + 0.5, tokW - 1, tokH - 1); c.setLineDash([]);
        }
      }
      var embY = seqY + Math.ceil(N / perRow) * (tokH + 7) + 12;
      text(c, 'Linear(1 → d) + learned token embedding   ·   cortex: 41 × 10 × 2 = 820 tokens + CLS', w / 2, embY, { align: 'center', size: 10.5, color: ACCENT, weight: 600 });
      if (readout) readout.innerHTML = '<strong>' + Math.min(progress, N) + '</strong> / ' + N + ' tokens';
    }
    var lp = K.loop(root, function (dt) {
      clock += dt;
      if (clock > N * PER + 1.6) clock = 0;
      draw();
    });
    loops.push(lp);
    K.playButton(root.querySelector('[data-play]'), lp);
  }

  // ---------------------------------------------------------------------------
  // 3. Masking & reconstruction (toy causal estimator)
  // ---------------------------------------------------------------------------
  function initMask() {
    var root = document.getElementById('prismt-mask');
    if (!root) return;
    var canvas = root.querySelector('canvas');
    var status = root.querySelector('[data-readout]');
    var NT = 10, NAR = 14;
    var rand = K.rng(17);
    var signal = [], mask = [], recon = null, sweep = -1;
    var pad = { l: 44, t: 30, r: 14, b: 14 };

    function generate() {
      signal = [];
      var phase = rand() * 6;
      for (var t = 0; t < NT; t++) {
        var row = [];
        for (var a = 0; a < NAR; a++) {
          var wave = Math.sin(t * 0.55 - a * 0.42 + phase) * 0.28 + Math.sin(a * 0.9 + phase) * 0.12;
          row.push(K.clamp(0.5 + wave + (rand() - 0.5) * 0.12, 0.02, 0.98));
        }
        signal.push(row);
      }
      mask = signal.map(function (row) { return row.map(function () { return false; }); });
      recon = null;
      sweep = -1;
    }

    // Uses only past timepoints of the same area and visible areas at the same timepoint.
    function estimate() {
      var out = signal.map(function (row) { return row.slice(); });
      for (var t = 0; t < NT; t++) {
        var same = [];
        for (var a = 0; a < NAR; a++) if (!mask[t][a]) same.push(signal[t][a]);
        for (a = 0; a < NAR; a++) {
          if (!mask[t][a]) continue;
          var past = null;
          for (var s = t - 1; s >= 0; s--) if (!mask[s][a]) { past = out[s][a]; break; }
          var nb = [];
          if (a > 0 && !mask[t][a - 1]) nb.push(signal[t][a - 1]);
          if (a < NAR - 1 && !mask[t][a + 1]) nb.push(signal[t][a + 1]);
          var local = nb.length ? nb.reduce(function (x, y) { return x + y; }, 0) / nb.length : null;
          var mean = same.length ? same.reduce(function (x, y) { return x + y; }, 0) / same.length : 0.5;
          var parts = [], wts = [];
          if (past !== null) { parts.push(past); wts.push(0.45); }
          if (local !== null) { parts.push(local); wts.push(0.4); }
          parts.push(mean); wts.push(0.15);
          var ws = wts.reduce(function (x, y) { return x + y; }, 0);
          out[t][a] = parts.reduce(function (acc, v, i) { return acc + v * wts[i]; }, 0) / ws;
        }
      }
      return out;
    }

    var st = K.stage(canvas, function () { draw(); });
    function geom() {
      var cw = (st.w - pad.l - pad.r) / NAR, ch = (st.h - pad.t - pad.b) / NT;
      return { cw: cw, ch: ch };
    }
    function draw() {
      var c = st.ctx, w = st.w, h = st.h;
      c.clearRect(0, 0, w, h);
      var g = geom();
      text(c, 'areas →', w - pad.r, 14, { align: 'right', size: 10.5, color: TEXT3 });
      text(c, 'time ↓', 6, 14, { size: 10.5, color: TEXT3 });
      for (var t = 0; t < NT; t++) {
        text(c, 't' + (t + 1), pad.l - 8, pad.t + t * g.ch + g.ch / 2, { align: 'right', size: 10, color: TEXT3 });
        for (var a = 0; a < NAR; a++) {
          var x = pad.l + a * g.cw, y = pad.t + t * g.ch;
          var m = mask[t][a];
          var shown = recon && m && t <= sweep;
          if (m && !shown) hatch(c, x + 1, y + 1, g.cw - 2, g.ch - 2);
          else {
            c.fillStyle = viridis(shown ? recon[t][a] : signal[t][a]);
            c.fillRect(x + 1, y + 1, g.cw - 2, g.ch - 2);
          }
          if (shown) { c.strokeStyle = ACCENT; c.lineWidth = 2; c.strokeRect(x + 2, y + 2, g.cw - 4, g.ch - 4); }
        }
      }
      if (recon && sweep >= 0 && sweep < NT) {
        c.strokeStyle = INK;
        c.lineWidth = 1.5;
        c.strokeRect(pad.l - 2, pad.t + sweep * g.ch, NAR * g.cw + 4, g.ch);
      }
    }
    function report() {
      var n = 0;
      mask.forEach(function (row) { row.forEach(function (m) { if (m) n++; }); });
      if (!status) return;
      if (recon && sweep >= NT - 1 && n) {
        var err = 0;
        for (var t = 0; t < NT; t++) for (var a = 0; a < NAR; a++) if (mask[t][a]) err += Math.pow(recon[t][a] - signal[t][a], 2);
        status.innerHTML = '<strong>' + n + '</strong> masked · toy estimate MSE <strong>' + (err / n).toFixed(4) + '</strong>';
      } else {
        status.innerHTML = '<strong>' + n + '</strong> of ' + (NT * NAR) + ' tokens masked';
      }
    }
    var animating = false;
    function reconstruct() {
      if (!mask.some(function (row) { return row.some(Boolean); })) return;
      recon = estimate();
      if (K.reduceMotion.matches) { sweep = NT - 1; draw(); report(); return; }
      sweep = -1;
      animating = true;
      var last = 0;
      (function tick(ts) {
        if (!last) last = ts;
        if (ts - last > 110) { sweep++; last = ts; draw(); report(); }
        if (sweep < NT - 1) requestAnimationFrame(tick);
        else animating = false;
      })(0);
    }
    canvas.addEventListener('click', function (e) {
      if (animating) return;
      var r = canvas.getBoundingClientRect(), g = geom();
      var a = Math.floor((e.clientX - r.left - pad.l) / g.cw), t = Math.floor((e.clientY - r.top - pad.t) / g.ch);
      if (a < 0 || a >= NAR || t < 0 || t >= NT) return;
      mask[t][a] = !mask[t][a];
      recon = null;
      sweep = -1;
      draw();
      report();
    });
    root.querySelector('[data-action="random"]').addEventListener('click', function () {
      if (animating) return;
      mask = signal.map(function (row) { return row.map(function () { return rand() < 0.3; }); });
      recon = null; sweep = -1; draw(); report();
    });
    root.querySelector('[data-action="reconstruct"]').addEventListener('click', function () { if (!animating) reconstruct(); });
    root.querySelector('[data-action="reset"]').addEventListener('click', function () { if (!animating) { generate(); draw(); report(); } });

    generate();
    mask = signal.map(function (row) { return row.map(function () { return rand() < 0.28; }); });
    report();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
  }

  // ---------------------------------------------------------------------------
  // 4. Causal attention mask
  // ---------------------------------------------------------------------------
  function initAttention() {
    var root = document.getElementById('prismt-attn');
    if (!root) return;
    var holder = root.querySelector('[data-mask]');
    var info = root.querySelector('[data-info]');
    var selT = root.querySelector('select[name="timepoints"]');
    var selN = root.querySelector('select[name="areas"]');
    function build() {
      K.attentionMask(holder, {
        groups: +selT.value,
        perGroup: +selN.value,
        label: function (g, i) { return 't' + (g + 1) + '·a' + (i + 1); },
        colorOn: K.rgba(ACCENT, 0.72),
        colorOff: '#ecebf0',
        info: info,
        infoDefault: 'Hover a cell: row = query token, column = key token.',
        ariaLabel: 'Causal temporal attention mask'
      });
    }
    selT.addEventListener('change', build);
    selN.addEventListener('change', build);
    build();
  }

  // ---------------------------------------------------------------------------
  // 5. PRISMt attribution: routing × signed value message, reduced over layers/heads
  // ---------------------------------------------------------------------------
  function initAttribution() {
    var root = document.getElementById('prismt-attr');
    if (!root) return;
    var canvas = root.querySelector('canvas');
    var readout = root.querySelector('[data-readout]');
    var NR = NA, NT = 10, L = 3, H = 4, P = L * H;
    var rand = K.rng(41);
    // Synthetic ground truth: frontal ACh late in the trial carries the class signal.
    function used(r, t, m) { return (m === 1 && AREAS[r].frontal && t >= 5) ? 1 : 0; }
    function decoy(r, t, m) { return (m === 0 && (AREAS[r].id === 'VISp' || AREAS[r].id === 'VISm') && t >= 2 && t <= 4) ? 1 : 0; }
    var pairs = [];
    for (var p = 0; p < P; p++) {
      var align = rand();                 // how much this head carries the class signal
      var rho = [], sgn = [], G = [];
      for (var m = 0; m < 2; m++) for (var r = 0; r < NR; r++) for (var t = 0; t < NT; t++) {
        var route = 0.15 + 0.5 * rand() + 0.9 * (used(r, t, m) + decoy(r, t, m)) * (0.4 + 0.6 * rand());
        var msg = (rand() - 0.5) * 0.5 + align * 1.6 * used(r, t, m) + (rand() - 0.5) * 1.2 * decoy(r, t, m);
        rho.push(route); sgn.push(msg); G.push(route * msg);
      }
      pairs.push({ rho: rho, s: sgn, G: G, align: align });
    }
    // Discriminative weights w_lh ∝ D_lh (here: alignment with the used pathway)
    var D = pairs.map(function (q) { return 0.1 + q.align * q.align; });
    var Ds = D.reduce(function (a, b) { return a + b; }, 0);
    var W = D.map(function (d) { return d / Ds; });
    var Gt = pairs[0].G.map(function (_, i) { return pairs.reduce(function (acc, q, k) { return acc + W[k] * q.G[i]; }, 0); });
    var clock = P * 0.55 * 0.6, PER = 0.55, HOLD = 3.2;
    var st = K.stage(canvas, function () { draw(); });

    function grid(c, x, y, cw, ch, data, fn, title) {
      text(c, title, x, y - 10, { size: 11, weight: 600, color: TEXT2 });
      for (var m = 0; m < 2; m++) for (var r = 0; r < NR; r++) for (var t = 0; t < NT; t++) {
        var i = (m * NR + r) * NT + t;
        c.fillStyle = fn(data[i]);
        c.fillRect(x + t * cw, y + (m * (NR + 1) + r) * ch, cw - 0.8, ch - 0.8);
      }
    }
    function draw() {
      var c = st.ctx, w = st.w, h = st.h;
      c.clearRect(0, 0, w, h);
      var narrow = w < 600;
      var gw = narrow ? (w - 70) / 3 : Math.min((w - 150) / 3, 190);
      var cw = gw / NT, ch = Math.min(cw * 0.8, (h - 150) / (2 * NR + 1));
      var y0 = 40, x0 = narrow ? 28 : (w - (3 * gw + 80)) / 2 + 20;
      var k = Math.floor(clock / PER), final = k >= P;
      var q = pairs[Math.min(k, P - 1)];
      var grey = function (v) { return K.mixHex('#ffffff', '#1b1b24', K.clamp(v / 1.8, 0, 1)); };
      var div = function (v) { return K.colormap(K.DIVERGING, 0.5 + 0.5 * K.clamp(v / 1.1, -1, 1)); };
      if (!final) {
        grid(c, x0, y0, cw, ch, q.rho, grey, 'routing ρ (rollout)');
        text(c, '×', x0 + gw + 10, y0 + (NR + 0.5) * ch, { align: 'center', size: 16, color: TEXT3 });
        grid(c, x0 + gw + 20, y0, cw, ch, q.s, div, 'signed message s');
        text(c, '=', x0 + 2 * gw + 30, y0 + (NR + 0.5) * ch, { align: 'center', size: 16, color: TEXT3 });
        grid(c, x0 + 2 * gw + 40, y0, cw, ch, q.G, div, 'G for (ℓ=' + (Math.floor(k / H) + 1) + ', h=' + (k % H + 1) + ')');
      } else {
        grid(c, x0, y0, cw, ch, pairs[0].rho.map(function (_, i) { return pairs.reduce(function (a, qq) { return a + qq.rho[i]; }, 0) / P; }), grey, 'mean routing (rollout only)');
        grid(c, x0 + 2 * gw + 40, y0, cw, ch, Gt, div, 'PRISMt: Σ w_ℓh G');
        text(c, 'vs', x0 + 1.5 * gw + 20, y0 + (NR + 0.5) * ch, { align: 'center', size: 13, weight: 600, color: TEXT3 });
      }
      [['Ca²⁺', CA, 0], ['ACh', ACH, 1]].forEach(function (lab) {
        text(c, lab[0], x0 - 6, y0 + (lab[2] * (NR + 1) + NR / 2) * ch, { align: 'right', size: 10, weight: 700, color: lab[1] });
      });
      // Layer × head weights
      var sy = y0 + (2 * NR + 1) * ch + 34, bw = narrow ? (w - 60) / P : Math.min(34, (w - 200) / P);
      var sx = (w - P * bw) / 2;
      text(c, 'layer-head weights w_ℓh (class-discriminative)', w / 2, sy - 14, { align: 'center', size: 10.5, color: TEXT3 });
      var bh = h - sy - 26;
      for (var p = 0; p < P; p++) {
        var hh = Math.max(2, bh * W[p] / Math.max.apply(null, W));
        c.fillStyle = (p === k && !final) ? ACCENT : (final ? K.rgba(ACCENT, 0.75) : 'rgba(27,27,36,0.22)');
        c.fillRect(sx + p * bw + 3, sy + bh - hh, bw - 6, hh);
        if (p % H === 0) text(c, 'ℓ' + (p / H + 1), sx + p * bw + 3, sy + bh + 12, { size: 9.5, color: TEXT3 });
      }
      if (readout) readout.innerHTML = final ? '<strong>reduced attribution</strong> keeps the pathway the model uses' : 'layer <strong>' + (Math.floor(k / H) + 1) + '</strong>, head <strong>' + (k % H + 1) + '</strong>';
    }
    var lp = K.loop(root, function (dt) {
      clock += dt;
      if (clock > P * PER + HOLD) clock = 0;
      draw();
    });
    loops.push(lp);
    K.playButton(root.querySelector('[data-play]'), lp);
  }

  // ---------------------------------------------------------------------------
  // 6. Structured motifs: non-negative CP with a modality simplex, early → late
  // ---------------------------------------------------------------------------
  function initMotifs() {
    var root = document.getElementById('prismt-motifs');
    if (!root) return;
    var canvas = root.querySelector('canvas');
    var readout = root.querySelector('[data-readout]');
    var NT = 10;
    function prof(ids, base) { return AREAS.map(function (a) { return ids.indexOf(a.id) !== -1 ? 1 : base; }); }
    function bump(c0, wdt) { var e = []; for (var t = 0; t < NT; t++) e.push(Math.exp(-Math.pow(t - c0, 2) / (2 * wdt * wdt))); return e; }
    var M = [
      { name: 'Calcium-dominant', d0: prof(['MOs', 'MOp', 'SSp', 'SSb', 'VISp', 'VISm', 'PTLp'], 0.45), d1: prof(['MOs', 'MOp', 'SSp', 'SSb', 'VISp', 'VISm', 'PTLp'], 0.45), e: bump(3, 1.6), f0: 0.86, f1: 0.86 },
      { name: 'ACh-dominant', d0: prof(['VISp', 'VISm'], 0.12), d1: prof(['MOs', 'MOp'], 0.12), e: bump(5.5, 1.8), f0: 0.18, f1: 0.12 },
      { name: 'Shared', d0: prof(['PTLp', 'RSP'], 0.2), d1: prof(['PTLp', 'RSP', 'SSp'], 0.2), e: bump(4.5, 2.2), f0: 0.55, f1: 0.52 }
    ];
    var clock = 5.5, CYCLE = 9;
    var st = K.stage(canvas, function () { draw(); });
    function phase() {           // 0 = early Stage 2, 1 = late Stage 2 (hold at each end)
      var u = (clock % CYCLE) / CYCLE;
      if (u < 0.3) return 0; if (u < 0.5) return K.easeInOut((u - 0.3) / 0.2);
      if (u < 0.8) return 1; return 1 - K.easeInOut((u - 0.8) / 0.2);
    }
    function draw() {
      var c = st.ctx, w = st.w, h = st.h;
      c.clearRect(0, 0, w, h);
      var s = phase();
      var rows = M.length, rh = (h - 44) / rows, y0 = 32;
      var narrow = w < 560;
      var colMap = narrow ? 8 : 150, colT = colMap + (rh - 8) * 204 / 185 + (narrow ? 14 : 26);
      text(c, 'spatial d_k(r)', narrow ? 8 : colMap, 14, { size: 10.5, color: TEXT3 });
      text(c, 'temporal e_k(t)', colT, 14, { size: 10.5, color: TEXT3 });
      text(c, 'modality f_k: Ca²⁺ ↔ ACh', w - 24, 14, { align: 'right', size: 10.5, color: TEXT3 });
      M.forEach(function (mo, k) {
        var y = y0 + k * rh;
        var d = mo.d0.map(function (v, i) { return K.lerp(v, mo.d1[i], s); });
        var f = K.lerp(mo.f0, mo.f1, s);
        if (!narrow) {
          text(c, 'motif ' + (k + 1), 16, y + rh * 0.38, { size: 12, weight: 700, color: INK });
          text(c, f > 0.65 ? 'Ca²⁺-dominant' : (1 - f) > 0.65 ? 'ACh-dominant' : 'shared', 16, y + rh * 0.38 + 17, { size: 10.5, weight: 600, color: f > 0.65 ? CA : (1 - f) > 0.65 ? ACH : TEXT2 });
        }
        var mh = rh - 8, mw = mh * 204 / 185;
        var vals = d.concat(d).map(function (v) { return 0.06 + 0.9 * v; });
        drawCortex(c, st.dpr, colMap, y + (rh - mh) / 2, mw, mh, vals);
        // temporal profile
        var tx = colT, tw = (w - 24 - 150) - tx - 20, ty = y + rh * 0.2, th = rh * 0.55;
        if (narrow) tw = w - 24 - 110 - tx;
        c.strokeStyle = 'rgba(27,27,36,0.2)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(tx, ty + th); c.lineTo(tx + tw, ty + th); c.stroke();
        c.beginPath();
        for (var t = 0; t < NT; t++) { var px = tx + tw * t / (NT - 1), py = ty + th - th * mo.e[t]; if (t) c.lineTo(px, py); else c.moveTo(px, py); }
        c.strokeStyle = ACCENT; c.lineWidth = 2; c.stroke();
        // modality simplex
        var bw = narrow ? 96 : 130, bx = w - 24 - bw, by = y + rh * 0.42;
        var grad = c.createLinearGradient(bx, 0, bx + bw, 0);
        grad.addColorStop(0, CA); grad.addColorStop(1, ACH);
        c.fillStyle = grad; c.globalAlpha = 0.28; c.fillRect(bx, by - 4, bw, 8); c.globalAlpha = 1;
        var mx = bx + bw * (1 - f);
        c.beginPath(); c.arc(mx, by, 6, 0, Math.PI * 2); c.fillStyle = K.mixHex(CA, ACH, 1 - f); c.fill(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke();
        text(c, 'Ca ' + f.toFixed(2), bx, by + 18, { size: 9.5, color: TEXT3 });
        text(c, 'ACh ' + (1 - f).toFixed(2), bx + bw, by + 18, { align: 'right', size: 9.5, color: TEXT3 });
        if (k < rows - 1) { c.strokeStyle = 'rgba(27,27,36,0.08)'; c.beginPath(); c.moveTo(8, y + rh); c.lineTo(w - 8, y + rh); c.stroke(); }
      });
      if (readout) readout.innerHTML = s < 0.02 ? '<strong>early</strong> Stage 2' : s > 0.98 ? '<strong>late</strong> Stage 2' : 'early → late';
    }
    var lp = K.loop(root, function (dt) { clock += dt; draw(); });
    loops.push(lp);
    K.playButton(root.querySelector('[data-play]'), lp);
  }

  function init() {
    initTeaser();
    initTokens();
    initMask();
    initAttention();
    initAttribution();
    initMotifs();
    var rerender = function () { loops.forEach(function (lp) { lp.render(); }); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(rerender);
    loadAtlas().then(rerender).catch(function () { /* keep the stylized fallback */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
