/* Site behaviour shared by every page: navigation, reveal-on-scroll, section
   tracking for the paper table of contents, tabs, copy buttons, and the
   publications filter. No dependencies. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---- Navigation ----------------------------------------------------------
  var nav = document.querySelector('.nav');
  if (nav) {
    var toggle = nav.querySelector('.nav__toggle');
    var menu = toggle && document.getElementById(toggle.getAttribute('aria-controls'));

    var setOpen = function (open) {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };

    if (toggle && menu) {
      toggle.addEventListener('click', function () {
        setOpen(!nav.classList.contains('is-open'));
      });
      menu.addEventListener('click', function (e) {
        if (e.target.closest('a')) setOpen(false);
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && nav.classList.contains('is-open')) {
          setOpen(false);
          toggle.focus();
        }
      });
      document.addEventListener('click', function (e) {
        if (nav.classList.contains('is-open') && !nav.contains(e.target)) setOpen(false);
      });
      var wide = window.matchMedia('(min-width: 801px)');
      var onWide = function (e) { if (e.matches) setOpen(false); };
      if (wide.addEventListener) wide.addEventListener('change', onWide);
      else wide.addListener(onWide);
    }

    // Home page only: the nav starts transparent over the hero.
    if (nav.hasAttribute('data-overlay')) {
      var onScroll = function () { nav.classList.toggle('is-scrolled', window.scrollY > 8); };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }
  }

  // ---- Reveal on scroll ----------------------------------------------------
  var reveals = document.querySelectorAll('.reveal');
  if (reveals.length) {
    if (!('IntersectionObserver' in window) || reduceMotion.matches) {
      reveals.forEach(function (el) { el.classList.add('is-visible'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
      reveals.forEach(function (el) { io.observe(el); });
    }
  }

  // ---- Paper table of contents: highlight the section being read -----------
  var toc = document.querySelector('.toc');
  if (toc) {
    var scroller = toc.querySelector('.toc__inner');
    var links = Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]'));
    var sections = links
      .map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); })
      .filter(Boolean);
    var current = null;
    var ticking = false;

    var setActive = function (id) {
      if (id === current) return;
      current = id;
      links.forEach(function (a) {
        var on = a.getAttribute('href') === '#' + id;
        a.classList.toggle('is-active', on);
        if (on) {
          a.setAttribute('aria-current', 'location');
          if (scroller && scroller.scrollWidth > scroller.clientWidth) {
            var left = a.offsetLeft - 24;
            if (left < scroller.scrollLeft || a.offsetLeft + a.offsetWidth > scroller.scrollLeft + scroller.clientWidth) {
              scroller.scrollTo({ left: left, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
            }
          }
        } else {
          a.removeAttribute('aria-current');
        }
      });
    };

    var update = function () {
      ticking = false;
      var offset = (nav ? nav.offsetHeight : 0) + toc.offsetHeight + 32;
      var id = null;
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].getBoundingClientRect().top - offset <= 0) id = sections[i].id;
        else break;
      }
      setActive(id);
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  // ---- Tabs (ARIA tablist) ---------------------------------------------------
  document.querySelectorAll('[role="tablist"]').forEach(function (list) {
    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    var select = function (tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
    };
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab, false); });
      tab.addEventListener('keydown', function (e) {
        var n = tabs.length;
        var j = null;
        if (e.key === 'ArrowRight') j = (i + 1) % n;
        else if (e.key === 'ArrowLeft') j = (i - 1 + n) % n;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = n - 1;
        if (j !== null) { e.preventDefault(); select(tabs[j], true); }
      });
    });
  });

  // ---- Copy buttons: <button data-copy="#selector"> ---------------------------
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    var label = btn.querySelector('.btn__label') || btn;
    var original = label.textContent;
    var timer = 0;
    var done = function (ok) {
      label.textContent = ok ? 'Copied' : 'Press Ctrl+C';
      clearTimeout(timer);
      timer = setTimeout(function () { label.textContent = original; }, 1800);
    };
    btn.addEventListener('click', function () {
      var target = document.querySelector(btn.getAttribute('data-copy'));
      if (!target) return;
      var text = target.textContent.replace(/\s+$/, '');
      var fallback = function () {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
        document.body.removeChild(ta);
        done(ok);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
      } else {
        fallback();
      }
    });
  });

  // ---- Publications filter -------------------------------------------------------
  var filter = document.querySelector('[data-pub-filter]');
  if (filter) {
    var buttons = Array.prototype.slice.call(filter.querySelectorAll('button[data-filter]'));
    var pubs = Array.prototype.slice.call(document.querySelectorAll('.pub'));
    var groups = Array.prototype.slice.call(document.querySelectorAll('.pub-group'));
    var status = document.getElementById('pub-count');
    var apply = function (value) {
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-filter') === value)); });
      var shown = 0;
      pubs.forEach(function (p) {
        var tags = (p.getAttribute('data-tags') || '').split(/\s+/);
        var visible = value === 'all' || tags.indexOf(value) !== -1;
        p.hidden = !visible;
        if (visible) shown++;
      });
      groups.forEach(function (g) { g.hidden = !g.querySelector('.pub:not([hidden])'); });
      if (status) status.textContent = shown + (shown === 1 ? ' paper' : ' papers');
    };
    buttons.forEach(function (b) {
      b.addEventListener('click', function () { apply(b.getAttribute('data-filter')); });
    });
    apply('all');
  }
})();
