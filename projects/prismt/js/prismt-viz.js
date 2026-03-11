document.addEventListener('DOMContentLoaded', () => {

  // ============================================================
  //  Page Interactivity: nav, fade-in, smooth scroll, tabs
  // ============================================================

  const nav = document.querySelector('.nav');
  const navToggle = document.querySelector('.nav__toggle');
  const navMenu = document.querySelector('.nav__menu');

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      navMenu.classList.toggle('nav__menu--open');
      navToggle.classList.toggle('nav__toggle--open');
      document.body.classList.toggle('no-scroll');
    });
    document.querySelectorAll('.nav__link').forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('nav__menu--open');
        navToggle.classList.remove('nav__toggle--open');
        document.body.classList.remove('no-scroll');
      });
    });
  }

  // Fade-in observer
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const siblings = entry.target.parentElement.querySelectorAll('.fade-in');
        const idx = Math.max(0, Array.from(siblings).indexOf(entry.target));
        entry.target.style.transitionDelay = Math.min(idx * 80, 400) + 'ms';
        entry.target.classList.add('fade-in--visible');
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -60px 0px', threshold: 0.1 });
  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const offset = nav.offsetHeight + 50;
        window.scrollTo({ top: target.getBoundingClientRect().top + window.pageYOffset - offset, behavior: 'smooth' });
      }
    });
  });

  // Architecture tab switching
  document.querySelectorAll('.arch-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.arch-tab').forEach(t => t.classList.remove('arch-tab--active'));
      document.querySelectorAll('.arch-panel').forEach(p => p.classList.remove('arch-panel--active'));
      tab.classList.add('arch-tab--active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('arch-panel--active');
    });
  });

  // Copy BibTeX
  const copyBtn = document.getElementById('copy-cite-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const bibtex = document.querySelector('.code-block--cite code').textContent;
      navigator.clipboard.writeText(bibtex).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy BibTeX'; }, 2000);
      });
    });
  }

  // ============================================================
  //  Hero Brain Grid Animation
  // ============================================================

  function initHeroBrainGrid() {
    const container = document.getElementById('hero-brain-grid');
    if (!container) return;

    const size = 380;
    const rows = 10;
    const cols = 8;
    const cellW = size / cols;
    const cellH = size / rows;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('width', '100%');
    svg.style.maxWidth = size + 'px';

    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const x = c * cellW + 1.5;
        const y = r * cellH + 1.5;
        const w = cellW - 3;
        const h = cellH - 3;
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', w);
        rect.setAttribute('height', h);
        rect.setAttribute('rx', '4');
        rect.style.transition = 'fill 0.6s ease';
        cells.push({ el: rect, r, c });
        svg.appendChild(rect);
      }
    }

    container.appendChild(svg);

    function colorCell(cell) {
      const val = Math.random();
      const tealR = 94, tealG = 184, tealB = 212;
      const coralR = 224, coralG = 107, coralB = 94;
      const mix = Math.random();
      const red = Math.round(tealR * (1 - mix) + coralR * mix);
      const green = Math.round(tealG * (1 - mix) + coralG * mix);
      const blue = Math.round(tealB * (1 - mix) + coralB * mix);
      const alpha = 0.1 + val * 0.5;
      cell.el.setAttribute('fill', `rgba(${red},${green},${blue},${alpha})`);
    }

    function animateStep() {
      const count = 6 + Math.floor(Math.random() * 8);
      for (let i = 0; i < count; i++) {
        colorCell(cells[Math.floor(Math.random() * cells.length)]);
      }
    }

    cells.forEach(colorCell);
    setInterval(animateStep, 800);
  }

  initHeroBrainGrid();

  // ============================================================
  //  Token Order Visualization
  // ============================================================

  function initTokenOrderViz() {
    const container = document.getElementById('token-order-viz');
    if (!container) return;

    const T = 4, N = 5;
    const colors = {
      t0: 'rgba(94,184,212,0.6)',
      t1: 'rgba(224,107,94,0.6)',
      t2: 'rgba(212,160,94,0.6)',
      t3: 'rgba(130,200,130,0.6)'
    };
    const borderColors = {
      t0: 'rgba(94,184,212,0.9)',
      t1: 'rgba(224,107,94,0.9)',
      t2: 'rgba(212,160,94,0.9)',
      t3: 'rgba(130,200,130,0.9)'
    };

    let html = '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">';
    for (let t = 0; t < T; t++) {
      for (let b = 0; b < N; b++) {
        const key = 't' + t;
        html += `<div style="
          padding:6px 12px;border-radius:6px;font-family:var(--font-mono);font-size:0.75rem;
          background:${colors[key]};border:1px solid ${borderColors[key]};color:#fff;
          white-space:nowrap;
        ">t${t}_b${b}</div>`;
      }
      if (t < T - 1) {
        html += '<div style="color:var(--text-tertiary);font-size:0.8rem;padding:0 2px;">|</div>';
      }
    }
    html += '</div>';
    html += '<p style="margin-top:14px;font-size:0.82rem;color:var(--text-tertiary);">Token order: all brain areas at t=0, then all at t=1, etc. Colors group tokens by timepoint.</p>';
    container.innerHTML = html;
  }

  initTokenOrderViz();

  // ============================================================
  //  Demo 1: Masking & Reconstruction (Canvas)
  // ============================================================

  function initMaskingDemo() {
    const canvas = document.getElementById('masking-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const T = 12;
    const N = 16;
    const PAD_LEFT = 50;
    const PAD_TOP = 30;
    const PAD_RIGHT = 20;
    const PAD_BOTTOM = 20;
    const cellW = (canvas.width - PAD_LEFT - PAD_RIGHT) / N;
    const cellH = (canvas.height - PAD_TOP - PAD_BOTTOM) / T;

    let signalData = [];
    // 2D mask: maskState[t][n] — each individual token can be masked
    let maskState = [];
    let reconState = false;
    let reconData = [];

    function initMask() {
      maskState = [];
      for (let t = 0; t < T; t++) {
        maskState.push(new Array(N).fill(false));
      }
    }

    function hasMaskedTokens() {
      for (let t = 0; t < T; t++) {
        for (let n = 0; n < N; n++) {
          if (maskState[t][n]) return true;
        }
      }
      return false;
    }

    function generateSignal() {
      signalData = [];
      for (let t = 0; t < T; t++) {
        const row = [];
        for (let n = 0; n < N; n++) {
          const base = Math.sin(t * 0.5 + n * 0.3) * 0.3 + 0.5;
          row.push(base + (Math.random() - 0.5) * 0.3);
        }
        signalData.push(row);
      }
    }

    function generateRecon() {
      reconData = [];
      for (let t = 0; t < T; t++) {
        const row = [];
        for (let n = 0; n < N; n++) {
          if (maskState[t][n]) {
            const noise = (Math.random() - 0.5) * 0.08;
            row.push(signalData[t][n] + noise);
          } else {
            row.push(signalData[t][n]);
          }
        }
        reconData.push(row);
      }
    }

    function valToColor(val, masked, reconstructed) {
      val = Math.max(0, Math.min(1, val));
      if (reconstructed) {
        const base = 0.3;
        const r = Math.round(60 + 164 * (base + val * (1 - base)));
        const g = Math.round(30 + 77 * (base + val * (1 - base)));
        const b = Math.round(25 + 69 * (base + val * (1 - base)));
        return `rgb(${r},${g},${b})`;
      }
      if (masked) {
        return `rgba(255,255,255,${0.05 + val * 0.08})`;
      }
      const base = 0.15;
      const r = Math.round(20 + 74 * (base + val * (1 - base)));
      const g = Math.round(50 + 134 * (base + val * (1 - base)));
      const b = Math.round(60 + 152 * (base + val * (1 - base)));
      return `rgb(${r},${g},${b})`;
    }

    function roundedRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#0d1220';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Column labels
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#8a8da0';
      ctx.textAlign = 'center';
      for (let n = 0; n < N; n++) {
        const x = PAD_LEFT + n * cellW + cellW / 2;
        ctx.fillText('B' + n, x, PAD_TOP - 8);
      }

      // Row labels
      ctx.textAlign = 'right';
      for (let t = 0; t < T; t++) {
        const y = PAD_TOP + t * cellH + cellH / 2 + 4;
        ctx.fillText('t' + t, PAD_LEFT - 8, y);
      }

      // Cells — per-token masking
      for (let t = 0; t < T; t++) {
        for (let n = 0; n < N; n++) {
          const x = PAD_LEFT + n * cellW;
          const y = PAD_TOP + t * cellH;

          const masked = maskState[t][n];
          const reconstructed = reconState && masked;
          const val = reconstructed ? reconData[t][n] : signalData[t][n];

          ctx.fillStyle = valToColor(val, masked && !reconState, reconstructed);
          roundedRect(ctx, x + 1, y + 1, cellW - 2, cellH - 2, 3);
          ctx.fill();

          if (masked && !reconState) {
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }
    }

    initMask();
    generateSignal();
    draw();

    // Click to toggle mask on individual tokens
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;
      const col = Math.floor((cx - PAD_LEFT) / cellW);
      const row = Math.floor((cy - PAD_TOP) / cellH);
      if (col >= 0 && col < N && row >= 0 && row < T) {
        maskState[row][col] = !maskState[row][col];
        reconState = false;
        draw();
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;
      const col = Math.floor((cx - PAD_LEFT) / cellW);
      const row = Math.floor((cy - PAD_TOP) / cellH);
      canvas.style.cursor = (col >= 0 && col < N && row >= 0 && row < T) ? 'pointer' : 'default';
    });

    document.getElementById('mask-random-btn').addEventListener('click', () => {
      reconState = false;
      for (let t = 0; t < T; t++) {
        for (let n = 0; n < N; n++) {
          maskState[t][n] = Math.random() < 0.3;
        }
      }
      draw();
    });

    document.getElementById('mask-reset-btn').addEventListener('click', () => {
      reconState = false;
      initMask();
      generateSignal();
      draw();
    });

    document.getElementById('mask-reconstruct-btn').addEventListener('click', () => {
      if (!hasMaskedTokens()) return;
      generateRecon();

      // Collect all masked token positions for the animation
      const maskedTokens = [];
      for (let t = 0; t < T; t++) {
        for (let n = 0; n < N; n++) {
          if (maskState[t][n]) maskedTokens.push({ t, n });
        }
      }

      const tempRecon = reconData.map(row => [...row]);
      reconData = signalData.map(row => [...row]);
      reconState = true;

      // Animate reconstruction row-by-row (timepoint sweep)
      let step = 0;
      function animStep() {
        if (step >= T) {
          reconData = tempRecon;
          draw();
          return;
        }
        for (let n = 0; n < N; n++) {
          if (maskState[step][n]) {
            reconData[step][n] = tempRecon[step][n];
          }
        }
        draw();
        step++;
        requestAnimationFrame(animStep);
      }
      animStep();
    });
  }

  initMaskingDemo();

  // ============================================================
  //  Demo 2: Causal Temporal Attention Heatmap (D3.js)
  // ============================================================

  function initAttentionHeatmap() {
    const container = document.getElementById('attention-heatmap');
    if (!container || typeof d3 === 'undefined') return;

    const tooltip = document.getElementById('attention-tooltip');

    function buildHeatmap() {
      container.innerHTML = '';

      const T = parseInt(document.getElementById('attn-timepoints').value);
      const N = parseInt(document.getElementById('attn-areas').value);
      const totalTokens = T * N;

      const labels = [];
      for (let t = 0; t < T; t++) {
        for (let b = 0; b < N; b++) {
          labels.push(`t${t}_b${b}`);
        }
      }

      // Build causal mask
      const mask = [];
      for (let i = 0; i < totalTokens; i++) {
        for (let j = 0; j < totalTokens; j++) {
          const ti = Math.floor(i / N);
          const tj = Math.floor(j / N);
          mask.push({ row: i, col: j, value: tj <= ti ? 1 : 0 });
        }
      }

      const margin = { top: 60, right: 20, bottom: 20, left: 60 };
      const cellSize = Math.min(28, Math.max(14, 500 / totalTokens));
      const width = cellSize * totalTokens;
      const height = cellSize * totalTokens;

      const svg = d3.select(container).append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

      const x = d3.scaleBand().domain(d3.range(totalTokens)).range([0, width]).padding(0.08);
      const y = d3.scaleBand().domain(d3.range(totalTokens)).range([0, height]).padding(0.08);

      // Timepoint group separators
      for (let t = 1; t < T; t++) {
        const pos = t * N;
        svg.append('line')
          .attr('x1', x(pos)).attr('y1', 0).attr('x2', x(pos)).attr('y2', height)
          .attr('stroke', 'rgba(255,255,255,0.1)').attr('stroke-width', 1);
        svg.append('line')
          .attr('x1', 0).attr('y1', y(pos)).attr('x2', width).attr('y2', y(pos))
          .attr('stroke', 'rgba(255,255,255,0.1)').attr('stroke-width', 1);
      }

      // Cells
      svg.selectAll('.attn-cell')
        .data(mask)
        .join('rect')
        .attr('class', 'attn-cell')
        .attr('x', d => x(d.col))
        .attr('y', d => y(d.row))
        .attr('width', x.bandwidth())
        .attr('height', y.bandwidth())
        .attr('rx', 2)
        .attr('fill', d => d.value ? 'rgba(94,184,212,0.55)' : 'rgba(255,255,255,0.02)')
        .attr('stroke', d => d.value ? 'rgba(94,184,212,0.15)' : 'none')
        .style('cursor', 'crosshair')
        .on('mouseenter', function(event, d) {
          d3.select(this).attr('fill', d.value ? 'rgba(94,184,212,0.85)' : 'rgba(255,255,255,0.08)');
          // Highlight row and column
          svg.selectAll('.attn-cell')
            .attr('opacity', dd => (dd.row === d.row || dd.col === d.col) ? 1 : 0.4);
          const ti = Math.floor(d.row / N);
          const bi = d.row % N;
          const tj = Math.floor(d.col / N);
          const bj = d.col % N;
          const canAttend = d.value ? 'Yes' : 'No';
          tooltip.innerHTML = `<strong>${labels[d.row]}</strong> &rarr; <strong>${labels[d.col]}</strong><br>` +
            `Time ${ti}, Area ${bi} attends to Time ${tj}, Area ${bj}<br>` +
            `<span style="color:${d.value ? 'var(--accent-teal)' : 'var(--accent-coral)'}">Can attend: ${canAttend}</span>`;
          tooltip.classList.add('visible');
          tooltip.style.left = (event.clientX + 14) + 'px';
          tooltip.style.top = (event.clientY - 10) + 'px';
        })
        .on('mousemove', function(event) {
          tooltip.style.left = (event.clientX + 14) + 'px';
          tooltip.style.top = (event.clientY - 10) + 'px';
        })
        .on('mouseleave', function() {
          svg.selectAll('.attn-cell').attr('opacity', 1);
          d3.select(this).attr('fill', d => {
            const dd = d3.select(this).datum();
            return dd.value ? 'rgba(94,184,212,0.55)' : 'rgba(255,255,255,0.02)';
          });
          tooltip.classList.remove('visible');
        });

      // Column labels (top)
      svg.selectAll('.col-label')
        .data(labels)
        .join('text')
        .attr('class', 'col-label')
        .attr('x', (d, i) => x(i) + x.bandwidth() / 2)
        .attr('y', -6)
        .attr('text-anchor', 'end')
        .attr('transform', (d, i) => `rotate(-45, ${x(i) + x.bandwidth() / 2}, -6)`)
        .attr('fill', 'var(--text-tertiary)')
        .attr('font-size', Math.min(10, cellSize * 0.5) + 'px')
        .attr('font-family', 'var(--font-mono)')
        .text(d => d);

      // Row labels (left)
      svg.selectAll('.row-label')
        .data(labels)
        .join('text')
        .attr('class', 'row-label')
        .attr('x', -6)
        .attr('y', (d, i) => y(i) + y.bandwidth() / 2 + 3)
        .attr('text-anchor', 'end')
        .attr('fill', 'var(--text-tertiary)')
        .attr('font-size', Math.min(10, cellSize * 0.5) + 'px')
        .attr('font-family', 'var(--font-mono)')
        .text(d => d);

      // Axis titles
      svg.append('text')
        .attr('x', width / 2).attr('y', -margin.top + 14)
        .attr('text-anchor', 'middle').attr('fill', 'var(--text-secondary)')
        .attr('font-size', '11px').attr('font-weight', '600')
        .text('Key (attended to)');
      svg.append('text')
        .attr('x', -height / 2).attr('y', -margin.left + 12)
        .attr('text-anchor', 'middle').attr('fill', 'var(--text-secondary)')
        .attr('font-size', '11px').attr('font-weight', '600')
        .attr('transform', 'rotate(-90)')
        .text('Query (attending)');
    }

    buildHeatmap();

    document.getElementById('attn-timepoints').addEventListener('change', buildHeatmap);
    document.getElementById('attn-areas').addEventListener('change', buildHeatmap);
  }

  initAttentionHeatmap();

});
