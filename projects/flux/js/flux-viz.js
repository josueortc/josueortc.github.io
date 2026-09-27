/* FLUX — interactive schematics (illustrative; not model output).
   1. Teaser: unpaired snapshots on a curved manifold, transported between
      adjacent snapshots; colour = active regime (router's expert).
   2. Adjacent-marginal chaining: OT pairs, local time τ, global time t.
   3. Geometry-aware paths: bend network displaces the straight interpolant;
      path energy under the learned metric drops as the path bends.
   4. Mixture-of-experts velocity: soft vs straight-through routing.
   Requires /js/viz-kit.js. */
(function () {
  'use strict';

  var K = window.VizKit;
  if (!K) return;

  var REG = [K.css('--regime-1') || '#e3a21a', K.css('--regime-2') || '#4fa83d', K.css('--regime-3') || '#3e54a3'];
  var ACCENT = K.css('--accent') || '#3e54a3';
  var INK = '#1b1b24';
  var TEXT2 = '#4b4b5a';
  var TEXT3 = '#6a6a7b';
  var SAMPLE = 'rgba(40, 40, 52, 0.5)';
  var OFF = '#c2410c';
  var loops = [];

  function font(size, weight) { return (weight || 500) + ' ' + size + 'px Inter, system-ui, -apple-system, sans-serif'; }
  function dot(c, x, y, r, fill, stroke) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    if (stroke) { c.lineWidth = 1.2; c.strokeStyle = stroke; c.stroke(); }
  }
  function label(c, text, x, y, opts) {
    opts = opts || {};
    c.font = font(opts.size || 12, opts.weight || 500);
    c.textAlign = opts.align || 'center';
    c.textBaseline = opts.baseline || 'middle';
    if (opts.halo !== false) {
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(255,255,255,0.9)';
      c.lineJoin = 'round';
      c.strokeText(text, x, y);
    }
    c.fillStyle = opts.color || TEXT2;
    c.fillText(text, x, y);
  }

  // Text with a numeric subscript (e.g. t_1), centred on (x, y).
  function subLabel(c, base, sub, x, y, opts) {
    opts = opts || {};
    var size = opts.size || 12.5, weight = opts.weight || 600;
    c.font = font(size, weight);
    var bw = c.measureText(base).width;
    c.font = font(size * 0.72, weight);
    var sw = c.measureText(sub).width;
    var x0 = x - (bw + sw + 1) / 2;
    label(c, base, x0, y, { align: 'left', size: size, weight: weight, color: opts.color || INK, halo: opts.halo });
    label(c, sub, x0 + bw + 1, y + size * 0.32, { align: 'left', size: size * 0.72, weight: weight, color: opts.color || INK, halo: opts.halo });
  }

  // ---------------------------------------------------------------------------
  // 1. Teaser
  // ---------------------------------------------------------------------------
  function initTeaser() {
    var root = document.getElementById('flux-teaser');
    if (!root) return;
    var canvas = root.querySelector('canvas');
    var readout = root.querySelector('[data-readout]');

    var T = 5;
    var SEG_REGIME = [0, 1, 1, 2];
    var N = 56;
    var CYCLE = 10;
    var HOLD = 1.6;
    var rand = K.rng(7);
    var marg = [];
    var mode = 'geo';
    var mix = 0;
    var phase = CYCLE * 0.62;
    var geo = null;

    function uOf(k) { return 0.05 + 0.9 * k / (T - 1); }

    for (var k = 0; k < T; k++) {
      var pts = [];
      for (var i = 0; i < N; i++) {
        pts.push({ u: K.clamp(uOf(k) + 0.022 * K.gauss(rand), 0, 1), o: K.clamp(0.42 * K.gauss(rand), -1, 1) });
      }
      pts.sort(function (a, b) { return a.u - b.u; }); // monotone coupling along the manifold
      marg.push(pts);
    }

    var st = K.stage(canvas, build);

    function build(w, h) {
      var plotH = h - 44;
      var M = 480;
      var raw = [];
      var len = [0];
      var i;
      // Spiral in unit coordinates, then fitted to the plot area (bounded anisotropy).
      for (i = 0; i <= M; i++) {
        var s = i / M;
        var th = 2.7 + s * 4.8;
        var r = 0.34 + 0.62 * s;
        raw.push([r * Math.cos(th), r * Math.sin(th)]);
      }
      var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      raw.forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
      var marX = 44, marY = 34;
      var kx = (w - 2 * marX) / (maxX - minX), ky = (plotH - 2 * marY) / (maxY - minY);
      kx = Math.min(kx, ky * 1.75);
      ky = Math.min(ky, kx * 1.15);
      var ox = (w - (maxX - minX) * kx) / 2 - minX * kx;
      var oy = (plotH - (maxY - minY) * ky) / 2 - minY * ky;
      var cx = ox, cy = oy;
      for (i = 0; i <= M; i++) {
        raw[i] = [ox + raw[i][0] * kx, oy + raw[i][1] * ky];
        if (i) len.push(len[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
      }
      var total = len[M];
      var U = 600;
      var samples = [];
      var j = 0;
      for (var q = 0; q <= U; q++) {
        var target = total * q / U;
        while (j < M - 1 && len[j + 1] < target) j++;
        var f = (target - len[j]) / ((len[j + 1] - len[j]) || 1);
        var tx = raw[j + 1][0] - raw[j][0], ty = raw[j + 1][1] - raw[j][1];
        var tl = Math.hypot(tx, ty) || 1;
        samples.push({ x: K.lerp(raw[j][0], raw[j + 1][0], f), y: K.lerp(raw[j][1], raw[j + 1][1], f), nx: -ty / tl, ny: tx / tl });
      }
      geo = { samples: samples, U: U, hw: K.clamp(Math.min(w, plotH) * 0.04, 7, 18), cx: cx, cy: cy, plotH: plotH };

      // Straight chords between snapshot centres; mark parts that leave the band.
      geo.chords = [];
      for (var c = 0; c < T - 1; c++) {
        var a = at(uOf(c)), b = at(uOf(c + 1));
        var pieces = [];
        var n = 48;
        for (var m = 0; m < n; m++) {
          var t0 = m / n, t1 = (m + 1) / n;
          var mx = K.lerp(a.x, b.x, (t0 + t1) / 2), my = K.lerp(a.y, b.y, (t0 + t1) / 2);
          pieces.push({ x0: K.lerp(a.x, b.x, t0), y0: K.lerp(a.y, b.y, t0), x1: K.lerp(a.x, b.x, t1), y1: K.lerp(a.y, b.y, t1), off: distToCurve(mx, my) > geo.hw * 1.1 });
        }
        geo.chords.push(pieces);
      }
      draw();
    }

    function at(u) {
      var s = geo.samples;
      var f = K.clamp(u, 0, 1) * geo.U;
      var i = Math.min(geo.U - 1, Math.floor(f));
      var r = f - i;
      var p = s[i], q = s[i + 1];
      return { x: K.lerp(p.x, q.x, r), y: K.lerp(p.y, q.y, r), nx: K.lerp(p.nx, q.nx, r), ny: K.lerp(p.ny, q.ny, r) };
    }
    function place(p) { var c = at(p.u); return [c.x + c.nx * p.o * geo.hw, c.y + c.ny * p.o * geo.hw]; }
    function distToCurve(x, y) {
      var best = Infinity;
      for (var i = 0; i <= geo.U; i += 2) {
        var s = geo.samples[i];
        var d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
        if (d < best) best = d;
      }
      return Math.sqrt(best);
    }
    function position(i, t) {
      var seg = Math.min(T - 2, Math.floor(t * (T - 1)));
      var tau = t * (T - 1) - seg;
      var a = marg[seg][i], b = marg[seg + 1][i];
      var g = at(K.lerp(a.u, b.u, tau));
      var o = K.lerp(a.o, b.o, tau);
      var gx = g.x + g.nx * o * geo.hw, gy = g.y + g.ny * o * geo.hw;
      if (mix <= 0.001) return [gx, gy, seg];
      var pa = place(a), pb = place(b);
      return [K.lerp(gx, K.lerp(pa[0], pb[0], tau), mix), K.lerp(gy, K.lerp(pa[1], pb[1], tau), mix), seg];
    }
    function strokeBand(u0, u1, width, color) {
      var c = st.ctx, s = geo.samples;
      var i0 = Math.round(u0 * geo.U), i1 = Math.round(u1 * geo.U);
      c.beginPath();
      c.moveTo(s[i0].x, s[i0].y);
      for (var i = i0 + 1; i <= i1; i++) c.lineTo(s[i].x, s[i].y);
      c.lineWidth = width;
      c.strokeStyle = color;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.stroke();
    }

    function draw() {
      var c = st.ctx, w = st.w, h = st.h;
      c.clearRect(0, 0, w, h);
      if (!geo) return;
      var hw = geo.hw;
      var t = Math.min(1, phase / CYCLE);
      var fade = 1 - K.smooth((phase - (CYCLE + HOLD - 0.5)) / 0.5);

      // Manifold band, tinted by regime like the paper's Figure 1
      strokeBand(0, 1, 2 * hw + 12, 'rgba(62, 84, 163, 0.045)');
      for (var k = 0; k < T - 1; k++) strokeBand(uOf(k), uOf(k + 1), 2 * hw, K.rgba(REG[SEG_REGIME[k]], 0.14));

      // Snapshot samples
      for (k = 0; k < T; k++) {
        for (var i = 0; i < N; i++) {
          var p = place(marg[k][i]);
          dot(c, p[0], p[1], 2.1, SAMPLE);
        }
      }

      // Straight (Euclidean) chords
      if (mix > 0.01) {
        c.save();
        c.globalAlpha = mix;
        c.setLineDash([5, 4]);
        c.lineCap = 'butt';
        geo.chords.forEach(function (pieces) {
          pieces.forEach(function (pc) {
            c.beginPath();
            c.moveTo(pc.x0, pc.y0);
            c.lineTo(pc.x1, pc.y1);
            c.lineWidth = pc.off ? 2.2 : 1.4;
            c.strokeStyle = pc.off ? OFF : TEXT3;
            c.stroke();
          });
        });
        c.setLineDash([]);
        var last = geo.chords[geo.chords.length - 1];
        var mid = last[Math.floor(last.length / 2)];
        label(c, 'off-manifold shortcut', mid.x0, mid.y0 + 16, { color: OFF, size: 11.5, weight: 600 });
        c.restore();
      }

      // Particles with short trails; colour = regime of the active segment
      c.save();
      c.globalAlpha = fade;
      for (i = 0; i < N; i++) {
        var head = position(i, t);
        var col = REG[SEG_REGIME[head[2]]];
        var prev = head;
        for (var j = 1; j <= 9; j++) {
          var tj = t - j * 0.011;
          if (tj < 0) break;
          var q = position(i, tj);
          c.beginPath();
          c.moveTo(prev[0], prev[1]);
          c.lineTo(q[0], q[1]);
          c.lineWidth = 2;
          c.strokeStyle = K.rgba(col, 0.5 * (1 - j / 10));
          c.stroke();
          prev = q;
        }
        dot(c, head[0], head[1], 2.8, col, '#fff');
      }
      c.restore();

      // Snapshot labels, placed outside the spiral
      for (k = 0; k < T; k++) {
        var m = at(uOf(k));
        var dx = m.x - geo.cx, dy = m.y - geo.cy;
        var sign = (m.nx * dx + m.ny * dy) >= 0 ? 1 : -1;
        subLabel(c, 't', String(k + 1), m.x + m.nx * sign * (hw + 16), m.y + m.ny * sign * (hw + 16), { size: 13 });
      }

      // Regime timeline (router's hard assignment over global time)
      var y = h - 17, x0 = 72, x1 = w - 22;
      label(c, 'regime', 16, y, { align: 'left', color: TEXT3, size: 11, halo: false });
      for (k = 0; k < T - 1; k++) {
        var a = x0 + (x1 - x0) * k / (T - 1), b = x0 + (x1 - x0) * (k + 1) / (T - 1);
        var reached = K.clamp((t * (T - 1) - k), 0, 1);
        c.fillStyle = K.rgba(REG[SEG_REGIME[k]], 0.22);
        c.fillRect(a, y - 3.5, b - a, 7);
        c.fillStyle = REG[SEG_REGIME[k]];
        c.fillRect(a, y - 3.5, (b - a) * reached, 7);
      }
      for (k = 0; k < T; k++) {
        var xk = x0 + (x1 - x0) * k / (T - 1);
        c.fillStyle = '#fff';
        c.fillRect(xk - 1, y - 6, 2, 12);
        subLabel(c, 't', String(k + 1), xk, y - 15, { size: 11, weight: 500, color: TEXT3, halo: false });
      }
      dot(c, x0 + (x1 - x0) * t, y, 5, INK, '#fff');

      if (readout) {
        var seg = Math.min(T - 2, Math.floor(t * (T - 1)));
        readout.innerHTML = 't = <strong>' + t.toFixed(2) + '</strong> · regime <strong>' + (SEG_REGIME[seg] + 1) + '</strong>';
      }
    }

    function step(dt) {
      var target = mode === 'euc' ? 1 : 0;
      if (dt === 0) mix = target;
      else mix += K.clamp(target - mix, -dt * 2.5, dt * 2.5);
      phase += dt;
      if (phase > CYCLE + HOLD) phase = 0;
      draw();
    }

    var lp = K.loop(root, step);
    loops.push(lp);
    K.playButton(root.querySelector('[data-play]'), lp);
    K.segmented(root.querySelector('[data-mode]'), function (v) {
      mode = v;
      if (!lp.isPlaying()) lp.render();
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Adjacent-marginal chaining
  // ---------------------------------------------------------------------------
  function initChain() {
    var root = document.getElementById('flux-chain');
    if (!root) return;
    var canvas = root.querySelector('canvas');
    var readout = root.querySelector('[data-readout]');
    var T = 4, N = 18;
    var rand = K.rng(11);
    var spec = [
      { y: 0.60, sx: 0.016, sy: 0.12 },
      { y: 0.42, sx: 0.015, sy: 0.09 },
      { y: 0.55, sx: 0.018, sy: 0.14 },
      { y: 0.34, sx: 0.014, sy: 0.08 }
    ];
    var raw = spec.map(function () {
      var a = [];
      for (var i = 0; i < N; i++) a.push({ gx: K.gauss(rand), gy: K.gauss(rand) });
      a.sort(function (p, q) { return p.gy - q.gy; }); // 1-D OT coupling = sorted matching
      return a;
    });
    var pts = [];
    var padX = 0;
    var active = { k: 1, i: 12 };
    var tau = 0.45;
    var timer = 0.7;

    var st = K.stage(canvas, function (w, h) {
      var plotH = h - 70;
      padX = Math.max(46, w * 0.11);
      pts = spec.map(function (sp, k) {
        var xk = padX + k * (w - 2 * padX) / (T - 1);
        return raw[k].map(function (p) { return [xk + p.gx * sp.sx * w, 26 + (sp.y + p.gy * sp.sy) * plotH]; });
      });
      draw();
    });

    function pick() { active = { k: Math.floor(rand() * (T - 1)), i: 3 + Math.floor(rand() * (N - 6)) }; }

    function draw() {
      var c = st.ctx, w = st.w, h = st.h;
      c.clearRect(0, 0, w, h);
      if (!pts.length) return;
      var k, i;

      // All coupling pairs, faint
      c.lineWidth = 1;
      c.strokeStyle = 'rgba(27, 27, 36, 0.075)';
      for (k = 0; k < T - 1; k++) {
        for (i = 0; i < N; i++) {
          c.beginPath();
          c.moveTo(pts[k][i][0], pts[k][i][1]);
          c.lineTo(pts[k + 1][i][0], pts[k + 1][i][1]);
          c.stroke();
        }
      }
      // Snapshot samples + labels
      for (k = 0; k < T; k++) {
        var top = Infinity, cxk = 0;
        for (i = 0; i < N; i++) {
          dot(c, pts[k][i][0], pts[k][i][1], 2.8, SAMPLE);
          top = Math.min(top, pts[k][i][1]);
          cxk += pts[k][i][0] / N;
        }
        subLabel(c, 'μ', String(k + 1), cxk, Math.max(12, top - 14), { size: 13.5 });
      }

      // Active training sample
      var a = pts[active.k][active.i], b = pts[active.k + 1][active.i];
      c.beginPath();
      c.moveTo(a[0], a[1]);
      c.lineTo(b[0], b[1]);
      c.lineWidth = 1.8;
      c.strokeStyle = K.rgba(ACCENT, 0.85);
      c.stroke();
      dot(c, a[0], a[1], 4.2, '#fff', ACCENT);
      dot(c, b[0], b[1], 4.2, '#fff', ACCENT);
      var zx = K.lerp(a[0], b[0], tau), zy = K.lerp(a[1], b[1], tau);
      var len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      var ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
      K.arrow(c, zx, zy, zx + ux * 38, zy + uy * 38, 8, INK, 1.6);
      dot(c, zx, zy, 5, ACCENT, '#fff');
      label(c, 'ż', zx + ux * 38 + 10, zy + uy * 38 - 10, { color: INK, weight: 600, size: 13 });
      label(c, 'τ = ' + tau.toFixed(2), zx, zy + 20, { color: ACCENT, weight: 600, size: 11.5 });

      // Global time axis aligned under the snapshots
      var y = h - 26, x0 = padX, x1 = w - padX;
      c.strokeStyle = 'rgba(27,27,36,0.25)';
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
      var ticks = ['0', '⅓', '⅔', '1'];
      for (k = 0; k < T; k++) {
        var xk = x0 + (x1 - x0) * k / (T - 1);
        c.beginPath(); c.moveTo(xk, y - 4); c.lineTo(xk, y + 4); c.stroke();
        label(c, ticks[k], xk, y + 14, { size: 11, color: TEXT3, halo: false });
      }
      label(c, 'global time t', x0, y - 13, { align: 'left', size: 11, color: TEXT3, halo: false });
      var t = (active.k + tau) / (T - 1);
      c.fillStyle = K.rgba(ACCENT, 0.18);
      c.fillRect(x0 + (x1 - x0) * active.k / (T - 1), y - 3, (x1 - x0) / (T - 1), 6);
      dot(c, x0 + (x1 - x0) * t, y, 5, ACCENT, '#fff');

      if (readout) {
        readout.innerHTML = 'k = <strong>' + (active.k + 1) + '</strong> · τ = <strong>' + tau.toFixed(2) + '</strong> → t = <strong>' + t.toFixed(2) + '</strong>';
      }
    }

    function step(dt) {
      if (dt > 0) {
        timer += dt;
        tau = K.easeInOut(K.clamp(timer / 1.5, 0, 1));
        if (timer > 2.1) { timer = 0; pick(); }
      }
      draw();
    }

    var lp = K.loop(root, step);
    loops.push(lp);
    K.playButton(root.querySelector('[data-play]'), lp);
  }

  // ---------------------------------------------------------------------------
  // 3. Geometry-aware paths
  // ---------------------------------------------------------------------------
  function initGeometry() {
    var root = document.getElementById('flux-geometry');
    if (!root) return;
    var canvas = root.querySelector('canvas');
    var slider = root.querySelector('input[type="range"]');
    var readout = root.querySelector('[data-readout]');
    var PH0 = Math.PI * 0.87, PH1 = Math.PI * 0.13;
    var G = null;
    var bg = null;
    var lam = 0.65;
    var clock = 1.6;
    var travel = 0.35;
    var manual = false;

    var st = K.stage(canvas, function (w, h) { build(w, h); draw(); });

    function build(w, h) {
      var R = Math.min(w * 0.35, h * 0.6);
      G = { cx: w * 0.5, cy: h * 0.5 + R * 0.46, R: R, sig: Math.min(w, h) * 0.055 };
      var gw = Math.ceil(w / 4), gh = Math.ceil(h / 4);
      bg = document.createElement('canvas');
      bg.width = gw;
      bg.height = gh;
      var bctx = bg.getContext('2d');
      var img = bctx.createImageData(gw, gh);
      var lo = [255, 255, 255], hi = [220, 226, 242];
      var mmax = Math.log(1 / 0.05);
      for (var y = 0; y < gh; y++) {
        for (var x = 0; x < gw; x++) {
          var v = K.clamp(Math.log(metric(x * 4 + 2, y * 4 + 2)) / mmax, 0, 1);
          var idx = (y * gw + x) * 4;
          img.data[idx] = lo[0] + (hi[0] - lo[0]) * v;
          img.data[idx + 1] = lo[1] + (hi[1] - lo[1]) * v;
          img.data[idx + 2] = lo[2] + (hi[2] - lo[2]) * v;
          img.data[idx + 3] = 255;
        }
      }
      bctx.putImageData(img, 0, 0);
      var rand = K.rng(3);
      G.dots = [];
      for (var i = 0; i < 110; i++) {
        var ph = K.lerp(PH1 - 0.06, PH0 + 0.06, rand());
        var rr = G.R + K.gauss(rand) * G.sig * 0.42;
        G.dots.push([G.cx + rr * Math.cos(ph), G.cy - rr * Math.sin(ph)]);
      }
      G.E0 = energy(0);
    }
    function distArc(x, y) {
      var dx = x - G.cx, dy = G.cy - y;
      var ang = Math.atan2(dy, dx);
      if (ang >= PH1 - 0.12 && ang <= PH0 + 0.12) return Math.abs(Math.hypot(dx, dy) - G.R);
      var e0x = G.cx + G.R * Math.cos(PH0 + 0.12), e0y = G.cy - G.R * Math.sin(PH0 + 0.12);
      var e1x = G.cx + G.R * Math.cos(PH1 - 0.12), e1y = G.cy - G.R * Math.sin(PH1 - 0.12);
      return Math.min(Math.hypot(x - e0x, y - e0y), Math.hypot(x - e1x, y - e1y));
    }
    // Manifold score h(x) ∈ (0, 1]; metric M(x) = (h + ε)^-α with ε = 0.05, α = 1
    function metric(x, y) {
      var d = distArc(x, y);
      return 1 / (Math.exp(-d * d / (2 * G.sig * G.sig)) + 0.05);
    }
    function end(ph) { return [G.cx + G.R * Math.cos(ph), G.cy - G.R * Math.sin(ph)]; }
    // γ(τ) = (1−τ)x0 + τx1 + λ·[4τ(1−τ)Δ(τ)], with Δ chosen so λ = 1 lies on the arc
    function path(tau, l) {
      var a = end(PH0), b = end(PH1);
      var lx = K.lerp(a[0], b[0], tau), ly = K.lerp(a[1], b[1], tau);
      var ph = K.lerp(PH0, PH1, tau);
      var ax = G.cx + G.R * Math.cos(ph), ay = G.cy - G.R * Math.sin(ph);
      return [lx + l * (ax - lx), ly + l * (ay - ly), lx, ly];
    }
    function energy(l) {
      var E = 0, n = 90, prev = path(0, l);
      for (var i = 1; i <= n; i++) {
        var p = path(i / n, l);
        var dx = p[0] - prev[0], dy = p[1] - prev[1];
        E += (dx * dx + dy * dy) * n * metric((p[0] + prev[0]) / 2, (p[1] + prev[1]) / 2);
        prev = p;
      }
      return E;
    }

    function draw() {
      var c = st.ctx, w = st.w, h = st.h;
      c.clearRect(0, 0, w, h);
      if (!G) return;
      c.imageSmoothingEnabled = true;
      c.drawImage(bg, 0, 0, w, h);
      G.dots.forEach(function (d) { dot(c, d[0], d[1], 2.2, SAMPLE); });

      var a = end(PH0), b = end(PH1);
      // Straight interpolant
      c.setLineDash([6, 5]);
      c.lineWidth = 1.6;
      c.strokeStyle = TEXT3;
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
      c.setLineDash([]);

      // Bend displacements 4τ(1−τ)Δψ
      if (lam > 0.04) {
        [0.2, 0.35, 0.5, 0.65, 0.8].forEach(function (tau) {
          var p = path(tau, lam);
          K.arrow(c, p[2], p[3], p[0], p[1], 7, K.rgba(ACCENT, 0.55), 1.3);
        });
      }
      // Current path
      c.beginPath();
      for (var i = 0; i <= 80; i++) {
        var p = path(i / 80, lam);
        if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]);
      }
      c.lineWidth = 3;
      c.strokeStyle = ACCENT;
      c.stroke();

      // Point travelling along the path with its tangent (velocity target)
      var q = path(travel, lam), q2 = path(Math.min(1, travel + 0.01), lam);
      var tl = Math.hypot(q2[0] - q[0], q2[1] - q[1]) || 1;
      K.arrow(c, q[0], q[1], q[0] + (q2[0] - q[0]) / tl * 34, q[1] + (q2[1] - q[1]) / tl * 34, 8, INK, 1.6);
      dot(c, q[0], q[1], 5, ACCENT, '#fff');

      dot(c, a[0], a[1], 5.5, INK, '#fff');
      dot(c, b[0], b[1], 5.5, INK, '#fff');
      subLabel(c, 'x', '0', a[0] - 17, a[1], { size: 14 });
      subLabel(c, 'x', '1', b[0] + 17, b[1], { size: 14 });
      label(c, 'data manifold', G.cx, G.cy - G.R - 22, { color: TEXT2, size: 11.5, weight: 600 });
      if (lam < 0.5) label(c, 'straight path crosses empty space', G.cx, a[1] + 22, { color: TEXT3, size: 11.5 });

      var ratio = energy(lam) / G.E0;
      if (readout) readout.innerHTML = 'λ = <strong>' + lam.toFixed(2) + '</strong> · path energy <strong>×' + ratio.toFixed(2) + '</strong>';
    }

    function step(dt) {
      if (dt > 0) {
        travel = (travel + dt / 2.4) % 1;
        if (!manual) {
          clock = (clock + dt) % 7;
          if (clock < 2.6) lam = K.easeInOut(clock / 2.6);
          else if (clock < 4.2) lam = 1;
          else if (clock < 5.8) lam = 1 - K.easeInOut((clock - 4.2) / 1.6);
          else lam = 0;
          if (slider) slider.value = Math.round(lam * 100);
        }
      }
      draw();
    }

    var lp = K.loop(root, step);
    loops.push(lp);
    K.playButton(root.querySelector('[data-play]'), lp);
    lp.onChange(function (playing) { if (playing) manual = false; });
    if (slider) {
      slider.value = Math.round(lam * 100);
      slider.addEventListener('input', function () {
        manual = true;
        lam = slider.value / 100;
        if (!lp.isPlaying()) lp.render();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Mixture-of-experts velocity field
  // ---------------------------------------------------------------------------
  function initMoE() {
    var root = document.getElementById('flux-moe');
    if (!root) return;
    var canvas = root.querySelector('canvas');
    var slider = root.querySelector('input[type="range"]');
    var readout = root.querySelector('[data-readout]');
    var BOX = { x0: -1.6, x1: 1.6, y0: -1, y1: 1 };
    var C = [0.17, 0.5, 0.83];
    var SIG = 0.12;
    var routing = 'hard';
    var t = 0.36;
    var manual = false;
    var rand = K.rng(21);
    var F = [[0, 0], [0, 0], [0, 0]];
    var W = [0, 0, 0];
    var V = [0, 0];
    var parts = [];
    var STRIP = 54;

    var st = K.stage(canvas, function () { draw(); });

    function sx(x) { return (x - BOX.x0) / (BOX.x1 - BOX.x0) * st.w; }
    function sy(y) { return (1 - (y - BOX.y0) / (BOX.y1 - BOX.y0)) * (st.h - STRIP - 8) + 4; }

    function experts(x, y) {
      var ax = x, ay = y;                               // f1: rotation about the origin
      F[0][0] = -1.3 * ay - 0.15 * ax; F[0][1] = 1.3 * ax - 0.15 * ay;
      F[1][0] = 1.05; F[1][1] = 0.45 * Math.sin(2.4 * x); // f2: drift with a wave
      var bx = x - 0.85, by = y - 0.05;                  // f3: attractor at (0.85, 0.05)
      F[2][0] = -1.2 * bx + 0.35 * by; F[2][1] = -1.2 * by - 0.35 * bx;
    }
    // Router logits depend on time and (weakly) on position
    function weights(tt, x, mode) {
      var xn = x / 1.6, l0 = 0, best = 0, lmax = -Infinity, l = [0, 0, 0];
      for (var m = 0; m < 3; m++) {
        var d = tt - C[m] - 0.1 * xn;
        l[m] = -d * d / (2 * SIG * SIG);
        if (l[m] > lmax) { lmax = l[m]; best = m; }
      }
      if (mode === 'hard') { W[0] = W[1] = W[2] = 0; W[best] = 1; return best; }
      for (m = 0; m < 3; m++) { W[m] = Math.exp(l[m] - lmax); l0 += W[m]; }
      for (m = 0; m < 3; m++) W[m] /= l0;
      return best;
    }
    function velocity(tt, x, y) {
      experts(x, y);
      var best = weights(tt, x, routing);
      V[0] = W[0] * F[0][0] + W[1] * F[1][0] + W[2] * F[2][0];
      V[1] = W[0] * F[0][1] + W[1] * F[1][1] + W[2] * F[2][1];
      return best;
    }
    function spawn(p) {
      p.x = K.lerp(BOX.x0, BOX.x1, rand());
      p.y = K.lerp(BOX.y0, BOX.y1, rand());
      p.life = 1.4 + rand() * 2.6;
      p.trail = [];
    }
    function advance(dt) {
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.best = velocity(t, p.x, p.y);
        p.trail.push(p.x, p.y);
        if (p.trail.length > 18) p.trail.splice(0, 2);
        p.x += V[0] * dt * 0.55;
        p.y += V[1] * dt * 0.55;
        p.life -= dt;
        if (p.life <= 0 || p.x < BOX.x0 || p.x > BOX.x1 || p.y < BOX.y0 || p.y > BOX.y1) spawn(p);
      }
    }
    for (var i = 0; i < 110; i++) { var p = {}; spawn(p); p.life *= rand(); parts.push(p); }
    for (i = 0; i < 50; i++) advance(0.03); // pre-roll so the first frame has trails

    function colorFor(mode) {
      if (mode === 'hard') { return REG[W.indexOf(1)]; }
      return K.blend(REG, W);
    }

    function draw() {
      var c = st.ctx, w = st.w, h = st.h;
      c.clearRect(0, 0, w, h);
      var plotH = h - STRIP;

      // Router decision boundaries at time t (hard assignment changes across x)
      c.setLineDash([4, 4]);
      c.lineWidth = 1;
      c.strokeStyle = 'rgba(27,27,36,0.28)';
      for (var m = 0; m < 2; m++) {
        var mid = (C[m] + C[m + 1]) / 2;
        var xb = 1.6 * (t - mid) / 0.1;
        if (xb > BOX.x0 && xb < BOX.x1) {
          c.beginPath(); c.moveTo(sx(xb), 4); c.lineTo(sx(xb), plotH - 6); c.stroke();
        }
      }
      c.setLineDash([]);

      // Vector field
      var nx = Math.max(12, Math.round(w / 46)), ny = Math.max(7, Math.round((plotH - 10) / 46));
      var cell = Math.min(w / nx, (plotH - 10) / ny);
      for (var ix = 0; ix < nx; ix++) {
        for (var iy = 0; iy < ny; iy++) {
          var x = K.lerp(BOX.x0, BOX.x1, (ix + 0.5) / nx);
          var y = K.lerp(BOX.y0, BOX.y1, (iy + 0.5) / ny);
          velocity(t, x, y);
          var mag = Math.hypot(V[0], V[1]) || 1;
          var L = cell * 0.5 * Math.min(1, 0.4 + mag / 1.6);
          var px = sx(x), py = sy(y);
          var ux = V[0] / mag, uy = -V[1] / mag;
          c.globalAlpha = 0.62;
          K.arrow(c, px - ux * L / 2, py - uy * L / 2, px + ux * L / 2, py + uy * L / 2, 6, colorFor(routing), 1.7);
          c.globalAlpha = 1;
        }
      }

      // Particles
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var col = REG[p.best || 0];
        var tr = p.trail;
        if (tr.length >= 4) {
          c.beginPath();
          c.moveTo(sx(tr[0]), sy(tr[1]));
          for (var j = 2; j < tr.length; j += 2) c.lineTo(sx(tr[j]), sy(tr[j + 1]));
          c.lineTo(sx(p.x), sy(p.y));
          c.lineWidth = 1.5;
          c.strokeStyle = K.rgba(col, 0.35);
          c.stroke();
        }
        dot(c, sx(p.x), sy(p.y), 2.3, col);
      }

      // Bottom strip: regime timeline at x = 0 and routing weights
      c.fillStyle = '#fff';
      c.fillRect(0, plotH, w, STRIP);
      c.strokeStyle = 'rgba(27,27,36,0.1)';
      c.beginPath(); c.moveTo(0, plotH + 0.5); c.lineTo(w, plotH + 0.5); c.stroke();
      var y0 = plotH + 30, xa = 16, xb2 = w - 150;
      label(c, 'router output over time (x = 0)', xa, plotH + 14, { align: 'left', size: 10.5, color: TEXT3, halo: false });
      var steps = 120;
      for (var s = 0; s < steps; s++) {
        var tt = s / steps;
        weights(tt, 0, routing);
        c.fillStyle = colorFor(routing);
        c.fillRect(xa + (xb2 - xa) * s / steps, y0 - 4, (xb2 - xa) / steps + 0.6, 8);
      }
      dot(c, xa + (xb2 - xa) * t, y0, 5.5, INK, '#fff');

      weights(t, 0, routing);
      var bx = w - 126, bw = 110;
      label(c, 'w(t, 0)', bx, plotH + 14, { align: 'left', size: 10.5, color: TEXT3, halo: false });
      var acc = 0;
      for (m = 0; m < 3; m++) {
        c.fillStyle = REG[m];
        c.fillRect(bx + bw * acc, y0 - 6, Math.max(0, bw * W[m] - 1), 12);
        acc += W[m];
      }

      if (readout) {
        readout.innerHTML = 't = <strong>' + t.toFixed(2) + '</strong> · w = (' +
          W.map(function (v) { return '<strong>' + v.toFixed(2) + '</strong>'; }).join(', ') + ')';
      }
    }

    function step(dt) {
      if (dt > 0) {
        if (!manual) {
          t += dt / 12;
          if (t > 1) t = 0;
          if (slider) slider.value = Math.round(t * 1000);
        }
        advance(dt);
      }
      draw();
    }

    var lp = K.loop(root, step);
    loops.push(lp);
    K.playButton(root.querySelector('[data-play]'), lp);
    lp.onChange(function (playing) { if (playing) manual = false; });
    K.segmented(root.querySelector('[data-mode]'), function (v) {
      routing = v;
      if (!lp.isPlaying()) lp.render();
    });
    if (slider) {
      slider.value = Math.round(t * 1000);
      slider.addEventListener('input', function () {
        manual = true;
        t = slider.value / 1000;
        if (!lp.isPlaying()) lp.render();
      });
    }
  }

  function init() {
    initTeaser();
    initChain();
    initGeometry();
    initMoE();
    // Re-render static frames once Inter has loaded so canvas labels use it.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { loops.forEach(function (lp) { lp.render(); }); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
