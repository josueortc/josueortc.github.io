document.addEventListener('DOMContentLoaded', () => {
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

  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target && nav) {
        e.preventDefault();
        const offset = nav.offsetHeight + 50;
        window.scrollTo({
          top: target.getBoundingClientRect().top + window.pageYOffset - offset,
          behavior: 'smooth'
        });
      }
    });
  });

  document.querySelectorAll('.arch-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const panelId = tab.dataset.tab;
      if (!panelId) return;
      document.querySelectorAll('.arch-tab').forEach(t => t.classList.remove('arch-tab--active'));
      document.querySelectorAll('.arch-panel').forEach(p => p.classList.remove('arch-panel--active'));
      tab.classList.add('arch-tab--active');
      const panel = document.getElementById('panel-' + panelId);
      if (panel) panel.classList.add('arch-panel--active');
    });
  });

  const copyBtn = document.getElementById('copy-cite-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const codeEl = document.querySelector('.code-block--cite code');
      if (!codeEl) return;
      const bibtex = codeEl.textContent;
      navigator.clipboard.writeText(bibtex).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy BibTeX'; }, 2000);
      });
    });
  }

  function initFluxHero() {
    const container = document.getElementById('hero-flux-graphic');
    if (!container) return;

    const w = 400;
    const h = 380;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', '100%');
    svg.style.maxWidth = w + 'px';

    const defs = document.createElementNS(ns, 'defs');
    const grad = document.createElementNS(ns, 'linearGradient');
    grad.setAttribute('id', 'fluxFlowGrad');
    grad.setAttribute('x1', '0%');
    grad.setAttribute('y1', '0%');
    grad.setAttribute('x2', '100%');
    grad.setAttribute('y2', '0%');
    [['0%', '#6366f1'], ['100%', '#8b5cf6']].forEach(([o, c]) => {
      const stop = document.createElementNS(ns, 'stop');
      stop.setAttribute('offset', o);
      stop.setAttribute('stop-color', c);
      grad.appendChild(stop);
    });
    defs.appendChild(grad);
    svg.appendChild(defs);

    const cy = h * 0.52;
    const nMarg = 6;
    const x0 = 40;
    const x1 = w - 40;
    const xs = [];
    for (let i = 0; i < nMarg; i++) {
      xs.push(x0 + (i / (nMarg - 1)) * (x1 - x0));
    }

    const path = document.createElementNS(ns, 'path');
    let d = `M ${xs[0]} ${cy - 40}`;
    for (let i = 1; i < nMarg; i++) {
      const dx = (xs[i] - xs[i - 1]) * 0.45;
      d += ` C ${xs[i - 1] + dx} ${cy - 55 + (i % 2) * 30}, ${xs[i] - dx} ${cy - 25 - (i % 2) * 35}, ${xs[i]} ${cy - 35 + (i % 3) * 12}`;
    }
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'url(#fluxFlowGrad)');
    path.setAttribute('stroke-width', '3');
    path.setAttribute('stroke-linecap', 'round');
    path.style.opacity = '0.85';
    svg.appendChild(path);

    xs.forEach((x, i) => {
      const g = document.createElementNS(ns, 'g');
      const ell = document.createElementNS(ns, 'ellipse');
      ell.setAttribute('cx', String(x));
      ell.setAttribute('cy', String(cy + 28 + (i % 2) * 6));
      ell.setAttribute('rx', '22');
      ell.setAttribute('ry', '10');
      ell.setAttribute('fill', 'rgba(99, 102, 241, 0.15)');
      ell.setAttribute('stroke', 'rgba(99, 102, 241, 0.45)');
      ell.setAttribute('stroke-width', '1');
      g.appendChild(ell);
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', String(x));
      c.setAttribute('cy', String(cy + (i % 2) * 4));
      c.setAttribute('r', String(5 + (i % 3)));
      c.setAttribute('fill', i % 2 === 0 ? '#6366f1' : '#8b5cf6');
      c.style.opacity = String(0.55 + (i % 4) * 0.1);
      g.appendChild(c);
      svg.appendChild(g);
    });

    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', String(w / 2));
    label.setAttribute('y', '24');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', '#64748b');
    label.setAttribute('font-size', '11');
    label.setAttribute('font-family', 'Inter, sans-serif');
    label.textContent = 'Marginal chain · flow path';
    svg.appendChild(label);

    container.appendChild(svg);
  }

  initFluxHero();
});
