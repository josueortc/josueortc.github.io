/* Typeset TeX on project pages with KaTeX auto-render (loaded with `defer`
   before this file). Inline math: \( … \); display math: \[ … \]. */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var main = document.getElementById('main');
  if (!main || typeof window.renderMathInElement !== 'function') return;
  window.renderMathInElement(main, {
    delimiters: [
      { left: '\\[', right: '\\]', display: true },
      { left: '\\(', right: '\\)', display: false }
    ],
    ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'canvas'],
    throwOnError: false
  });
});
