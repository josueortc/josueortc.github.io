/* BrainLM — interactive schematics.
   1. Teaser: real resting-state BOLD (OpenNeuro ds000228, Schaefer-400) painted
      onto a pial surface (both hemispheres; each vertex shows its nearest
      parcel), with a synchronized carpet plot.
   2. Patching: parcel time series → patches → tokens (real data).
   3. Masked autoencoding: random / future masking → encoder → decoder
      (illustrative; colours follow the paper's architecture figure).
   4. Block-causal attention mask of the open-source implementation.
   Requires /js/viz-kit.js; the 3D view also needs three.js (r128). */
(function () {
  'use strict';

  var K = window.VizKit;
  if (!K) return;

  var ACCENT = K.css('--accent') || '#6b46c1';
  var C_DATA = K.css('--tok-data') || '#3b9ad9';
  var C_MASK = K.css('--tok-mask') || '#e0474c';
  var C_ENC = K.css('--tok-enc') || '#3a9a4b';
  var C_PRED = K.css('--tok-pred') || '#7d3c98';
  var INK = '#1b1b24';
  var TEXT2 = '#4b4b5a';
  var TEXT3 = '#6a6a7b';
  var BOLD_SCALE = 2.3; // ~98th percentile of |z| in the example recording
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
  function rrect(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r);
    else c.rect(x, y, w, h);
  }
  function boldColor(v) { return K.colormap(K.DIVERGING, 0.5 + 0.5 * K.clamp(v / BOLD_SCALE, -1, 1)); }

  var recordingPromise = null;
  function getRecording() {
    if (!recordingPromise) {
      recordingPromise = fetch('data/example_recording.json').then(function (r) {
        if (!r.ok) throw new Error('recording');
        return r.json();
      });
    }
    return recordingPromise;
  }

  // ---------------------------------------------------------------------------
  // 1. Teaser: 3D brain + carpet plot
  // ---------------------------------------------------------------------------
  function initTeaser() {
    var root = document.getElementById('brainlm-teaser');
    if (!root) return;
    var stageEl = root.querySelector('.viz__stage');
    var carpet = root.querySelector('.carpet');
    var readout = root.querySelector('[data-readout]');
    var rec = null;
    var nT = 1, nP = 1;
    var tr = 60;
    var yaw = 0, pitch = 0.08, userYaw = 0;
    var three = null;

    function message(msg) {
      var m = document.createElement('p');
      m.className = 'viz__message';
      m.textContent = msg;
      stageEl.appendChild(m);
    }

    // Carpet plot: parcels (rows, averaged in groups of 4) × TRs
    var carpetImg = null;
    var cst = K.stage(carpet, function () { drawCarpet(); });
    function buildCarpet() {
      var rows = Math.ceil(nP / 4);
      var off = document.createElement('canvas');
      off.width = nT;
      off.height = rows;
      var ctx = off.getContext('2d');
      var img = ctx.createImageData(nT, rows);
      var rgb = [0, 0, 0];
      for (var r = 0; r < rows; r++) {
        for (var t = 0; t < nT; t++) {
          var s = 0, n = 0;
          for (var k = r * 4; k < Math.min(nP, r * 4 + 4); k++) { s += rec[t][k]; n++; }
          K.colormapRGB(K.DIVERGING, 0.5 + 0.5 * K.clamp(s / n / BOLD_SCALE, -1, 1), rgb);
          var o = (r * nT + t) * 4;
          img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      carpetImg = off;
    }
    function drawCarpet() {
      var c = cst.ctx, w = cst.w, h = cst.h;
      c.clearRect(0, 0, w, h);
      if (!carpetImg) return;
      var x0 = 80, x1 = w - 12;
      c.imageSmoothingEnabled = false;
      c.drawImage(carpetImg, x0, 6, x1 - x0, h - 12);
      text(c, '400 parcels', 10, h / 2 - 7, { size: 10.5, color: TEXT3 });
      text(c, '× ' + nT + ' TRs', 10, h / 2 + 8, { size: 10.5, color: TEXT3 });
      var x = x0 + (x1 - x0) * (tr / (nT - 1));
      c.fillStyle = INK;
      c.fillRect(x - 1, 2, 2, h - 4);
    }

    function setupThree(meshData, lookup) {
      if (typeof THREE === 'undefined') { message('The 3D view could not load (three.js unavailable). The carpet plot below still shows the recording.'); return null; }
      var renderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch (e) {
        message('3D view needs WebGL, which is unavailable in this browser.');
        return null;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      stageEl.appendChild(renderer.domElement);
      renderer.domElement.setAttribute('role', 'img');
      renderer.domElement.setAttribute('aria-label', 'Rotating 3D cortical surface painted with BOLD activity from 400 parcels.');

      var scene = new THREE.Scene();
      var camera = new THREE.PerspectiveCamera(26, 2, 0.1, 100);
      camera.position.set(-4.6, 3.3, -3.4);
      camera.lookAt(0, 0, 0);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8f8a9e, 0.85));
      var key = new THREE.DirectionalLight(0xffffff, 0.75);
      key.position.set(-4, 5, -3);
      scene.add(key);
      var rim = new THREE.DirectionalLight(0xffffff, 0.25);
      rim.position.set(4, 1, 4);
      scene.add(rim);

      var nV = meshData.pos.length / 3;
      var center = [(meshData.min[0] + meshData.max[0]) / 2, (meshData.min[1] + meshData.max[1]) / 2, (meshData.min[2] + meshData.max[2]) / 2];
      var geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(meshData.pos, 3));
      var colors = new Float32Array(nV * 3).fill(0.93);
      var colorAttr = new THREE.BufferAttribute(colors, 3);
      colorAttr.setUsage(THREE.DynamicDrawUsage);
      geom.setAttribute('color', colorAttr);
      geom.setIndex(new THREE.BufferAttribute(meshData.idx, 1));
      geom.translate(-center[0], -center[1], -center[2]);
      geom.computeVertexNormals();
      var mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
      var brain = new THREE.Mesh(geom, mat);

      var model = new THREE.Group();   // MNI-like axes: x right, y anterior, z superior
      model.add(brain);
      model.rotation.x = -Math.PI / 2; // z-up → y-up
      model.scale.setScalar(1 / 58);
      var pivot = new THREE.Group();
      pivot.add(model);
      scene.add(pivot);

      function resize() {
        var r = stageEl.getBoundingClientRect();
        var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        camera.aspect = w / h;
        camera.fov = w / h < 1.3 ? 34 : 26; // keep the whole brain in view on portrait stages
        camera.updateProjectionMatrix();
      }

      var parcelRGB = new Float32Array(nP * 3);
      var rgb = [0, 0, 0];
      function paint() {
        var t0 = Math.floor(tr), t1 = Math.min(nT - 1, t0 + 1), f = tr - t0;
        for (var i = 0; i < nP; i++) {
          var v = rec[t0][i] * (1 - f) + rec[t1][i] * f;
          K.colormapRGB(K.DIVERGING, 0.5 + 0.5 * K.clamp(v / BOLD_SCALE, -1, 1), rgb);
          parcelRGB[3 * i] = rgb[0] / 255; parcelRGB[3 * i + 1] = rgb[1] / 255; parcelRGB[3 * i + 2] = rgb[2] / 255;
        }
        for (var k = 0; k < nV; k++) {
          var p3 = lookup[k] * 3, o = 3 * k;
          colors[o] = parcelRGB[p3]; colors[o + 1] = parcelRGB[p3 + 1]; colors[o + 2] = parcelRGB[p3 + 2];
        }
        colorAttr.needsUpdate = true;
      }
      function render() {
        pivot.rotation.y = yaw + userYaw;
        pivot.rotation.x = pitch;
        if (rec) paint();
        renderer.render(scene, camera);
      }
      if ('ResizeObserver' in window) new ResizeObserver(function () { resize(); render(); }).observe(stageEl);
      resize();
      return { render: render, canvas: renderer.domElement };
    }

    function frame() {
      if (three) three.render();
      drawCarpet();
      if (readout && rec) readout.innerHTML = 'TR <strong>' + (Math.floor(tr) + 1) + '</strong> / ' + nT;
    }

    var lp = K.loop(root, function (dt) {
      if (dt > 0 && rec) {
        tr = (tr + dt * 5) % (nT - 1);
        yaw += dt * 0.16;
      }
      frame();
    });
    loops.push(lp);
    K.playButton(root.querySelector('[data-play]'), lp);

    // Drag to rotate
    var dragging = false, lastX = 0, lastY = 0;
    stageEl.addEventListener('pointerdown', function (e) {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      if (stageEl.setPointerCapture) stageEl.setPointerCapture(e.pointerId);
    });
    stageEl.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      userYaw += (e.clientX - lastX) * 0.01;
      pitch = K.clamp(pitch + (e.clientY - lastY) * 0.006, -0.6, 0.8);
      lastX = e.clientX; lastY = e.clientY;
      if (!lp.isPlaying()) frame();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      stageEl.addEventListener(ev, function () { dragging = false; });
    });

    Promise.all([
      getRecording(),
      fetch('data/brain-vertex-parcel.bin').then(function (r) { if (!r.ok) throw new Error('lookup'); return r.arrayBuffer(); }),
      fetch('data/brain-mesh.bin').then(function (r) { if (!r.ok) throw new Error('mesh'); return r.arrayBuffer(); })
    ]).then(function (res) {
      rec = res[0].recording;
      nT = rec.length;
      nP = rec[0].length;
      // The example file pads the scan by repeating its last volume; drop the copies.
      var same = function (a, b) { for (var j = 0; j < a.length; j++) if (a[j] !== b[j]) return false; return true; };
      while (nT > 2 && same(rec[nT - 1], rec[nT - 2])) nT--;
      buildCarpet();
      var buf = res[2];
      var dv = new DataView(buf);
      var nV = dv.getUint32(4, true), nF = dv.getUint32(8, true);
      var o = [dv.getFloat32(12, true), dv.getFloat32(16, true), dv.getFloat32(20, true)], step = dv.getFloat32(24, true);
      var qv = new Uint16Array(buf, 32, nV * 3);
      var pos = new Float32Array(nV * 3);
      var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (var i = 0; i < nV * 3; i++) {
        var a = i % 3;
        pos[i] = o[a] + qv[i] * step;
        if (pos[i] < mn[a]) mn[a] = pos[i];
        if (pos[i] > mx[a]) mx[a] = pos[i];
      }
      var idx = new Uint16Array(buf, 32 + nV * 6, nF * 3);
      three = setupThree({ pos: pos, idx: idx, min: mn, max: mx }, new Uint16Array(res[1]));
      frame();
    }).catch(function () {
      message('The example recording could not be loaded.');
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Patching real parcel time series into tokens
  // ---------------------------------------------------------------------------
  function initPatch() {
    var root = document.getElementById('brainlm-patch');
    if (!root) return;
    var canvas = root.querySelector('canvas');
    var readout = root.querySelector('[data-readout]');
    var P = 6, TR = 100, PATCH = 20, W = TR / PATCH;
    var traces = null;
    var clock = 3.2;
    var PER = 0.28;
    var st = K.stage(canvas, function () { draw(); });

    getRecording().then(function (d) {
      var rec = d.recording;
      var pick = [12, 71, 138, 205, 266, 344];
      traces = pick.map(function (p) { var s = []; for (var t = 0; t < TR; t++) s.push(rec[t + 40][p]); return s; });
      draw();
    }).catch(function () {});

    function draw() {
      var c = st.ctx, w = st.w, h = st.h;
      c.clearRect(0, 0, w, h);
      if (!traces) return;
      var narrow = w < 560;
      var tx0 = 40, tx1 = narrow ? w - 16 : w * 0.6, ty0 = 34, th = (narrow ? h * 0.55 : h - 60) - ty0;
      var rowH = th / P;
      var n = P * W;
      var done = Math.min(n, Math.floor(clock / PER));

      text(c, 'parcel time series', tx0, 14, { size: 11, weight: 600 });
      text(c, 'time →', tx1, 14, { align: 'right', size: 10.5, color: TEXT3 });
      for (var p = 0; p < P; p++) {
        var y0 = ty0 + p * rowH, mid = y0 + rowH / 2;
        text(c, String(p + 1), tx0 - 10, mid, { align: 'right', size: 10.5, color: TEXT3 });
        for (var wdw = 0; wdw < W; wdw++) {
          var k = wdw * P + p; // timepoint-major token index
          var x0 = tx0 + (tx1 - tx0) * wdw / W, x1 = tx0 + (tx1 - tx0) * (wdw + 1) / W;
          c.strokeStyle = 'rgba(59,154,217,0.55)';
          c.setLineDash([3, 3]);
          c.lineWidth = 1;
          c.strokeRect(x0 + 1.5, y0 + 2, x1 - x0 - 3, rowH - 4);
          c.setLineDash([]);
          if (k < done) { c.fillStyle = 'rgba(59,154,217,0.10)'; c.fillRect(x0 + 1.5, y0 + 2, x1 - x0 - 3, rowH - 4); }
          if (k === done) { c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(x0 + 1.5, y0 + 2, x1 - x0 - 3, rowH - 4); }
        }
        c.beginPath();
        for (var t = 0; t < TR; t++) {
          var x = tx0 + (tx1 - tx0) * t / (TR - 1);
          var y = mid - K.clamp(traces[p][t] / 3.2, -1, 1) * (rowH * 0.42);
          if (t) c.lineTo(x, y); else c.moveTo(x, y);
        }
        c.strokeStyle = '#2a2a33';
        c.lineWidth = 1.1;
        c.stroke();
      }

      // Token grid (parcels × windows), filled in timepoint-major order
      var gx, gy, cell;
      if (narrow) { cell = Math.min(26, (w - 80) / W); gx = (w - cell * W) / 2; gy = ty0 + th + 40; }
      else { cell = Math.min(34, (w * 0.4 - 70) / W, th / P); gx = w * 0.6 + 44; gy = ty0 + (th - cell * P) / 2; }
      text(c, 'tokens (parcel × patch)', gx, gy - 14, { size: 11, weight: 600 });
      for (p = 0; p < P; p++) {
        for (wdw = 0; wdw < W; wdw++) {
          k = wdw * P + p;
          var cx = gx + wdw * cell, cy = gy + p * cell;
          rrect(c, cx + 2, cy + 2, cell - 4, cell - 4, 4);
          if (k < done) { c.fillStyle = C_DATA; c.fill(); }
          else { c.strokeStyle = 'rgba(27,27,36,0.18)'; c.lineWidth = 1; c.stroke(); }
        }
      }
      var ey = gy + P * cell + 18;
      text(c, '+ parcel [x, y, z] embedding', gx, ey, { size: 10.5, color: ACCENT, weight: 600 });
      text(c, '+ temporal embedding [t]', gx, ey + 16, { size: 10.5, color: ACCENT, weight: 600 });
      if (readout) readout.innerHTML = 'patch size <strong>' + PATCH + '</strong> TRs · <strong>' + Math.min(done, n) + '</strong> / ' + n + ' tokens';
    }
    var lp = K.loop(root, function (dt) {
      clock += dt;
      if (clock > P * W * PER + 1.8) clock = 0;
      draw();
    });
    loops.push(lp);
    K.playButton(root.querySelector('[data-play]'), lp);
  }

  // ---------------------------------------------------------------------------
  // 3. Masked autoencoding pipeline (illustrative)
  // ---------------------------------------------------------------------------
  function initMAE() {
    var root = document.getElementById('brainlm-mae');
    if (!root) return;
    var canvas = root.querySelector('canvas');
    var readout = root.querySelector('[data-readout]');
    var P = 4, W = 8;
    var mode = 'random';
    var clock = 5.2, CYCLE = 7.5;
    var rand = K.rng(9);
    var randomMask = [];
    for (var i = 0; i < P * W; i++) randomMask.push(rand() < 0.35);
    function masked(p, w) { return mode === 'random' ? randomMask[p * W + w] : w >= W - 2; }
    var st = K.stage(canvas, function () { draw(); });

    function grid(c, x, y, cell, colorFn, title) {
      text(c, title, x, y - 12, { size: 11, weight: 600 });
      for (var p = 0; p < P; p++) {
        for (var w = 0; w < W; w++) {
          c.fillStyle = colorFn(p, w);
          c.fillRect(x + w * cell + 1, y + p * cell + 1, cell - 2, cell - 2);
        }
      }
      c.strokeStyle = 'rgba(27,27,36,0.35)';
      c.lineWidth = 1;
      c.strokeRect(x + 0.5, y + 0.5, W * cell - 1, P * cell - 1);
    }
    function column(c, x, y, n, cell, colorFn, alpha) {
      c.globalAlpha = alpha;
      for (var i = 0; i < n; i++) { c.fillStyle = colorFn(i); c.fillRect(x, y + i * cell + 1, cell, cell - 2); }
      c.globalAlpha = 1;
    }
    function block(c, x, y, w, h, label, active) {
      rrect(c, x, y, w, h, 8);
      c.fillStyle = active ? '#e9e1cf' : '#f3efe6';
      c.fill();
      c.strokeStyle = active ? '#9a8a66' : 'rgba(27,27,36,0.18)';
      c.lineWidth = active ? 1.6 : 1;
      c.stroke();
      if (w >= h) {
        text(c, label, x + w / 2, y + h / 2, { align: 'center', size: 11, weight: 600, color: INK });
        return;
      }
      c.save();
      c.translate(x + w / 2, y + h / 2);
      c.rotate(-Math.PI / 2);
      text(c, label, 0, 0, { align: 'center', size: 11, weight: 600, color: INK });
      c.restore();
    }

    function draw() {
      var c = st.ctx, w = st.w, h = st.h;
      c.clearRect(0, 0, w, h);
      var ph = clock;
      var narrow = w < 560;
      var cell = narrow ? Math.min(18, (w - 40) / (W * 2 + 2)) : Math.min(22, w / 40);
      var gridW = W * cell, gridH = P * cell;
      var y0 = narrow ? 40 : (h - gridH) / 2;
      var inX = narrow ? 16 : 20;
      var maskOn = ph > 0.8;

      grid(c, inX, y0, cell, function (p, ww) { return maskOn && masked(p, ww) ? C_MASK : C_DATA; }, maskOn ? (mode === 'random' ? 'random masking' : 'future masking') : 'input patches');

      var nMasked = 0, nVis = 0;
      for (var p = 0; p < P; p++) for (var ww = 0; ww < W; ww++) { if (masked(p, ww)) nMasked++; else nVis++; }

      if (narrow) {
        // Compact vertical flow for small screens
        var cy = y0 + gridH + 34;
        block(c, inX, cy, w - 2 * inX, 34, 'Transformer encoder (visible tokens)', ph > 1.8 && ph < 3.4);
        var cy2 = cy + 52;
        block(c, inX, cy2, w - 2 * inX, 34, 'Transformer decoder (+ mask tokens)', ph > 3.4 && ph < 4.8);
        var gy = cy2 + 64;
        if (ph > 4.6) grid(c, inX, gy, cell, function (p2, w2) { return masked(p2, w2) ? C_PRED : C_ENC; }, 'prediction (loss on masked tokens)');
      } else {
        var colX = inX + gridW + 40;
        var n = P * W;
        var tall = Math.min(h - 50, n * 7.5), tcell = tall / n;
        var ty = (h - tall) / 2;
        // Visible tokens + embeddings
        var visAlpha = K.clamp((ph - 1.2) / 0.6, 0, 1);
        text(c, 'visible', colX - 6, ty - 12, { size: 10.5, color: TEXT3 });
        column(c, colX, ty + (tall - nVis * tcell) / 2, nVis, tcell, function () { return C_DATA; }, visAlpha);
        var encX = colX + 40, encW = 38;
        block(c, encX, ty, encW, tall, 'Transformer encoder', ph > 1.8 && ph < 3.4);
        var e2X = encX + encW + 30;
        var encAlpha = K.clamp((ph - 2.6) / 0.6, 0, 1);
        text(c, 'encoded + mask', e2X - 20, ty - 12, { size: 10.5, color: TEXT3 });
        column(c, e2X, ty, n, tcell, function (k) { var p3 = k % P, w3 = Math.floor(k / P); return masked(p3, w3) ? C_MASK : C_ENC; }, encAlpha);
        var decX = e2X + 40, decW = 38;
        block(c, decX, ty, decW, tall, 'Transformer decoder', ph > 3.4 && ph < 4.8);
        var outX = decX + decW + 36;
        var outAlpha = K.clamp((ph - 4.4) / 0.6, 0, 1);
        c.globalAlpha = outAlpha;
        grid(c, outX, y0, cell, function (p2, w2) { return masked(p2, w2) ? C_PRED : C_ENC; }, 'prediction');
        c.globalAlpha = 1;
        // Flow arrows
        K.arrow(c, inX + gridW + 8, h / 2, colX - 6, h / 2, 7, '#8b8b99', 1.4);
        K.arrow(c, colX + tcell + 6, h / 2, encX - 4, h / 2, 7, '#8b8b99', 1.4);
        K.arrow(c, encX + encW + 4, h / 2, e2X - 6, h / 2, 7, '#8b8b99', 1.4);
        K.arrow(c, e2X + tcell + 6, h / 2, decX - 4, h / 2, 7, '#8b8b99', 1.4);
        K.arrow(c, decX + decW + 4, h / 2, outX - 6, h / 2, 7, '#8b8b99', 1.4);
        if (outAlpha > 0.5) text(c, 'reconstruction loss on masked tokens', outX, y0 + gridH + 20, { size: 10.5, color: TEXT3 });
      }
      if (readout) {
        var stage = ph < 0.8 ? 'patchify' : ph < 1.8 ? 'mask ' + nMasked + ' of ' + (P * W) + ' tokens' : ph < 3.4 ? 'encode visible tokens' : ph < 4.8 ? 'decode with mask tokens' : 'predict masked patches';
        readout.textContent = stage;
      }
    }

    var lp = K.loop(root, function (dt) {
      clock += dt;
      if (clock > CYCLE) clock = 0;
      draw();
    });
    loops.push(lp);
    K.playButton(root.querySelector('[data-play]'), lp);
    K.segmented(root.querySelector('[data-mode]'), function (v) {
      mode = v;
      if (!lp.isPlaying()) lp.render();
    });
  }

  // ---------------------------------------------------------------------------
  // 4. Block-causal attention mask (open-source implementation)
  // ---------------------------------------------------------------------------
  function initAttention() {
    var root = document.getElementById('brainlm-attn');
    if (!root) return;
    K.attentionMask(root.querySelector('[data-mask]'), {
      groups: 3,
      perGroup: 4,
      label: function (g, i) { return 'w' + (g + 1) + '·p' + (i + 1); },
      colorOn: K.rgba(ACCENT, 0.7),
      colorOff: '#ecebf0',
      info: root.querySelector('[data-info]'),
      infoDefault: 'Hover a cell: row = query token, column = key token.',
      ariaLabel: 'Block-causal attention mask over timepoint-major tokens'
    });
  }

  function init() {
    initTeaser();
    initPatch();
    initMAE();
    initAttention();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { loops.forEach(function (lp) { lp.render(); }); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
