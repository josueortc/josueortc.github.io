/* VizKit — small helpers shared by the interactive schematics on project pages.
   - stage():  canvas that tracks its CSS size and devicePixelRatio
   - loop():   requestAnimationFrame loop that only runs while visible, in a
               visible tab, and playing; starts paused under reduced motion
   - playButton(), segmented(): wire controls to state
   - attentionMask(): accessible SVG heatmap of a (block-)causal attention mask
   No dependencies. Exposes window.VizKit. */
(function (global) {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var SVGNS = 'http://www.w3.org/2000/svg';

  var ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.3-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5.5" y="4" width="4.5" height="16" rx="1.2"/><rect x="14" y="4" width="4.5" height="16" rx="1.2"/></svg>';

  function css(name, el) {
    return getComputedStyle(el || document.documentElement).getPropertyValue(name).trim();
  }

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  // Deterministic PRNG (xorshift32) so schematics look the same on every load.
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  function gauss(rand) {
    var u = 1 - rand();
    var v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(hex, a) {
    var c = hexToRgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  function mixHex(a, b, t) {
    var x = hexToRgb(a), y = hexToRgb(b);
    return 'rgb(' + Math.round(lerp(x[0], y[0], t)) + ',' + Math.round(lerp(x[1], y[1], t)) + ',' + Math.round(lerp(x[2], y[2], t)) + ')';
  }
  // Weighted mix of several hex colours (weights sum to 1).
  function blend(colors, weights) {
    var r = 0, g = 0, b = 0;
    for (var i = 0; i < colors.length; i++) {
      var c = hexToRgb(colors[i]);
      r += c[0] * weights[i]; g += c[1] * weights[i]; b += c[2] * weights[i];
    }
    return 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';
  }

  // Perceptual colormaps sampled at 9 stops (viridis; blue–white–red diverging).
  var VIRIDIS = ['#440154', '#472d7b', '#3b528b', '#2c728e', '#21918c', '#28ae80', '#5ec962', '#addc30', '#fde725'];
  var DIVERGING = ['#2f5e9e', '#4f7fbf', '#86a8d6', '#c3d3ea', '#f2f0ee', '#efc3b5', '#e08f78', '#c75a47', '#a2312a'];
  function colormap(stops, t) {
    t = clamp(t, 0, 1) * (stops.length - 1);
    var i = Math.min(stops.length - 2, Math.floor(t));
    return mixHex(stops[i], stops[i + 1], t - i);
  }
  function colormapRGB(stops, t, out) {
    t = clamp(t, 0, 1) * (stops.length - 1);
    var i = Math.min(stops.length - 2, Math.floor(t));
    var a = hexToRgb(stops[i]), b = hexToRgb(stops[i + 1]), f = t - i;
    out[0] = a[0] + (b[0] - a[0]) * f;
    out[1] = a[1] + (b[1] - a[1]) * f;
    out[2] = a[2] + (b[2] - a[2]) * f;
    return out;
  }

  // HiDPI canvas bound to its CSS box. onResize(w, h) receives CSS pixels.
  // The first onResize runs in a microtask so callers can use the returned
  // object inside it.
  function stage(canvas, onResize) {
    var ctx = canvas.getContext('2d');
    var s = { canvas: canvas, ctx: ctx, w: 0, h: 0, dpr: 1 };
    var ready = false;
    function fit() {
      var r = canvas.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.max(1, Math.round(r.width));
      var h = Math.max(1, Math.round(r.height));
      if (w === s.w && h === s.h && dpr === s.dpr) return;
      s.w = w; s.h = h; s.dpr = dpr;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (onResize && ready) onResize(w, h);
    }
    fit();
    Promise.resolve().then(function () {
      ready = true;
      if (onResize) onResize(s.w, s.h);
      if ('ResizeObserver' in window) new ResizeObserver(fit).observe(canvas);
      else window.addEventListener('resize', fit);
    });
    s.fit = fit;
    return s;
  }

  // Visibility-aware animation loop. step(dt) is called with seconds since the
  // previous frame (0 for one-off renders).
  function loop(el, step, opts) {
    opts = opts || {};
    var playing = opts.autoplay !== false && !reduceMotion.matches;
    var onScreen = !('IntersectionObserver' in window);
    var raf = 0;
    var last = 0;
    var listeners = [];

    function running() { return playing && onScreen && !document.hidden; }
    function frame(ts) {
      raf = 0;
      if (!running()) { last = 0; return; }
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60;
      last = ts;
      step(dt);
      raf = requestAnimationFrame(frame);
    }
    function kick() { if (running() && !raf) raf = requestAnimationFrame(frame); }
    function notify() { listeners.forEach(function (fn) { fn(playing); }); }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[entries.length - 1].isIntersecting;
        kick();
      }, { rootMargin: '120px 0px' }).observe(el);
    }
    document.addEventListener('visibilitychange', kick);

    var api = {
      isPlaying: function () { return playing; },
      play: function () { playing = true; notify(); kick(); },
      pause: function () { playing = false; notify(); },
      toggle: function () { if (playing) api.pause(); else api.play(); },
      render: function () { step(0); },
      onChange: function (fn) { listeners.push(fn); fn(playing); }
    };
    requestAnimationFrame(function () { step(0); kick(); });
    return api;
  }

  function playButton(btn, lp) {
    if (!btn) return;
    lp.onChange(function (p) {
      btn.innerHTML = p ? ICON_PAUSE : ICON_PLAY;
      btn.setAttribute('aria-label', p ? 'Pause animation' : 'Play animation');
      btn.setAttribute('aria-pressed', String(p));
    });
    btn.addEventListener('click', lp.toggle);
  }

  // <div class="segmented"><button data-value="a" aria-pressed="true">…</button>…</div>
  function segmented(root, onChange) {
    if (!root) return;
    var buttons = Array.prototype.slice.call(root.querySelectorAll('button[data-value]'));
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        buttons.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        onChange(b.getAttribute('data-value'));
      });
    });
  }

  // Draw an arrow from (x0,y0) to (x1,y1) on a 2D context.
  function arrow(ctx, x0, y0, x1, y1, head, color, width) {
    var dx = x1 - x0, dy = y1 - y0;
    var len = Math.hypot(dx, dy);
    if (len < 0.5) return;
    var ux = dx / len, uy = dy / len;
    head = Math.min(head, len * 0.6);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1 - ux * head * 0.6, y1 - uy * head * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux * head - uy * head * 0.5, y1 - uy * head + ux * head * 0.5);
    ctx.lineTo(x1 - ux * head + uy * head * 0.5, y1 - uy * head - ux * head * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  function svg(tag, attrs, parent) {
    var el = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  /* Block-causal attention mask as an SVG heatmap.
     opts: { groups, perGroup, groupLabel(i), itemLabel(j), colorOn, colorOff,
             info: element to receive the hover description, cls: optional first token }
     Token k in group g(k) may attend to token m iff g(m) <= g(k).            */
  function attentionMask(container, opts) {
    var G = opts.groups, P = opts.perGroup;
    var hasCls = !!opts.cls;
    var N = G * P + (hasCls ? 1 : 0);
    var cell = Math.max(12, Math.min(26, Math.floor(420 / N)));
    var pad = { l: 64, t: 64, r: 8, b: 8 };
    var W = pad.l + N * cell + pad.r, H = pad.t + N * cell + pad.b;
    container.innerHTML = '';
    var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': opts.ariaLabel || 'Attention mask' }, container);
    root.style.maxWidth = W + 'px';
    root.style.width = '100%';
    root.style.height = 'auto';

    function group(k) { return hasCls && k === 0 ? -1 : Math.floor((k - (hasCls ? 1 : 0)) / P); }
    function label(k) {
      if (hasCls && k === 0) return 'CLS';
      var i = k - (hasCls ? 1 : 0);
      return opts.label(Math.floor(i / P), i % P);
    }
    function allowed(q, k) {
      var gq = group(q), gk = group(k);
      if (gq === -1) return true;          // CLS attends to everything
      if (gk === -1) return true;          // every token can read CLS
      return gk <= gq;
    }

    var cells = [];
    var gCells = svg('g', {}, root);
    for (var q = 0; q < N; q++) {
      for (var k = 0; k < N; k++) {
        var on = allowed(q, k);
        var r = svg('rect', {
          x: pad.l + k * cell + 1, y: pad.t + q * cell + 1,
          width: cell - 2, height: cell - 2, rx: 2.5,
          fill: on ? opts.colorOn : opts.colorOff
        }, gCells);
        r.__q = q; r.__k = k; r.__on = on;
        cells.push(r);
      }
    }
    // Group separators
    var sepColor = 'rgba(27,27,36,0.28)';
    for (var g = 1; g < G; g++) {
      var p = pad.l + ((hasCls ? 1 : 0) + g * P) * cell;
      var py = pad.t + ((hasCls ? 1 : 0) + g * P) * cell;
      svg('line', { x1: p, y1: pad.t - 4, x2: p, y2: pad.t + N * cell, stroke: sepColor, 'stroke-width': 1 }, root);
      svg('line', { x1: pad.l - 4, y1: py, x2: pad.l + N * cell, y2: py, stroke: sepColor, 'stroke-width': 1 }, root);
    }
    // Labels
    var fs = Math.max(8, Math.min(10.5, cell * 0.45));
    for (var i = 0; i < N; i++) {
      var tx = pad.l + i * cell + cell / 2;
      var t1 = svg('text', { x: tx, y: pad.t - 8, 'font-size': fs, 'text-anchor': 'start', fill: '#6a6a7b', 'font-family': 'JetBrains Mono, monospace', transform: 'rotate(-55 ' + tx + ' ' + (pad.t - 8) + ')' }, root);
      t1.textContent = label(i);
      var t2 = svg('text', { x: pad.l - 8, y: pad.t + i * cell + cell / 2 + fs * 0.35, 'font-size': fs, 'text-anchor': 'end', fill: '#6a6a7b', 'font-family': 'JetBrains Mono, monospace' }, root);
      t2.textContent = label(i);
    }
    var axq = svg('text', { x: 12, y: pad.t + (N * cell) / 2, 'font-size': 11, 'font-weight': 600, fill: '#4b4b5a', 'text-anchor': 'middle', transform: 'rotate(-90 12 ' + (pad.t + (N * cell) / 2) + ')', 'font-family': 'Inter, sans-serif' }, root);
    axq.textContent = 'query (attending)';
    var axk = svg('text', { x: pad.l + (N * cell) / 2, y: 12, 'font-size': 11, 'font-weight': 600, fill: '#4b4b5a', 'text-anchor': 'middle', 'font-family': 'Inter, sans-serif' }, root);
    axk.textContent = 'key (attended to)';

    function describe(r) {
      if (!opts.info) return;
      opts.info.innerHTML = '<strong>' + label(r.__q) + '</strong> → <strong>' + label(r.__k) + '</strong>: ' +
        (r.__on ? 'allowed' : '<span style="color:#a2312a">blocked (future timepoint)</span>');
    }
    function highlight(r) {
      cells.forEach(function (c) {
        var inCross = c.__q === r.__q || c.__k === r.__k;
        c.setAttribute('opacity', inCross ? 1 : 0.35);
      });
      describe(r);
    }
    function clear() {
      cells.forEach(function (c) { c.setAttribute('opacity', 1); });
      if (opts.info) opts.info.textContent = opts.infoDefault || '';
    }
    gCells.addEventListener('pointerover', function (e) { if (e.target.__q !== undefined) highlight(e.target); });
    gCells.addEventListener('pointerleave', clear);
    clear();
  }

  global.VizKit = {
    reduceMotion: reduceMotion,
    css: css, clamp: clamp, lerp: lerp, smooth: smooth, easeInOut: easeInOut,
    rng: rng, gauss: gauss, rgba: rgba, mixHex: mixHex, blend: blend, hexToRgb: hexToRgb,
    VIRIDIS: VIRIDIS, DIVERGING: DIVERGING, colormap: colormap, colormapRGB: colormapRGB,
    stage: stage, loop: loop, playButton: playButton, segmented: segmented,
    arrow: arrow, svg: svg, attentionMask: attentionMask
  };
})(window);
