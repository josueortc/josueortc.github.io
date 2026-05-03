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

});
