/**
 * BrainLM embedded real fMRI visualization.
 * 1) 3D brain schematic
 * 2) ROI segmentation (400 areas on 3D brain)
 * 3) Each area as a point in 3D (400 points from coords)
 * 4) Tokenization schematic (timepoint-major, patches per parcel)
 * Data: data/example_recording.json, data/example_meta.json
 */
(function () {
  'use strict';

  const DATA_URL = 'data/example_recording.json';
  const META_URL = 'data/example_meta.json';
  const PATCH_SIZE = 20;

  function fetchJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('Fetch failed: ' + url);
      return r.json();
    });
  }

  function initViz() {
    Promise.all([
      fetchJSON(DATA_URL).catch(function () {
        return null;
      }),
      fetchJSON(META_URL).catch(function () {
        return null;
      })
    ]).then(function (results) {
      const data = results[0];
      const meta = results[1];
      if (!data || !data.recording) {
        document.getElementById('brainlm-viz-caption').textContent =
          'Example data not found. Generate data/example_recording.json (see plan).';
        return;
      }
      var recording = data.recording;
      var coords = data.coords || [];
      var nTime = recording.length;
      var nParcel = recording[0].length;

      // Caption
      var cap = document.getElementById('brainlm-viz-caption');
      cap.textContent = 'Recording shape: ' + nTime + ' × ' + nParcel + ' (timepoints × parcels).';
      if (meta) {
        cap.textContent += ' Source: ' + (meta.source || '') + ', atlas: ' + (meta.atlas || '') + '.';
      }

      // 3D brain + ROI points (Three.js) in hero and tokenization sections
      var hero3d = document.getElementById('hero-brainlm-viz-3d');
      if (hero3d && typeof THREE !== 'undefined' && coords.length >= nParcel) {
        init3DBrain(hero3d, coords, recording, nParcel);
      }

      var container3d = document.getElementById('brainlm-viz-3d');
      if (container3d && typeof THREE !== 'undefined' && coords.length >= nParcel) {
        init3DBrain(container3d, coords, recording, nParcel);
      } else if (container3d) {
        container3d.innerHTML = '<p style="color:var(--text-secondary);">3D view requires coords in JSON. Load example_recording.json with coords.</p>';
      }

      // 400 points as 2D projection (if no Three.js or fallback)
      var containerPoints = document.getElementById('brainlm-viz-points');
      if (containerPoints && coords.length >= nParcel) {
        initPoints2D(containerPoints, coords, recording, nParcel);
      }

      // Tokenization schematic
      var containerTok = document.getElementById('brainlm-viz-tokenization');
      if (containerTok) {
        initTokenizationSchematic(containerTok, nTime, nParcel);
      }
    });
  }

  function init3DBrain(container, coords, recording, nParcel) {
    var width = Math.min(500, container.offsetWidth || 500);
    var height = 320;
    container.style.width = width + 'px';
    container.style.height = height + 'px';

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0x0a0e1a, 0);
    container.appendChild(renderer.domElement);

    // Brain material (used for fallback mesh and optional loaded mesh)
    var brainMat = new THREE.MeshPhongMaterial({
      color: 0x1a2332,
      transparent: true,
      opacity: 0.7,
      wireframe: false,
      shininess: 40,
      specular: 0x223344
    });

    // Fallback brain: two-hemisphere mesh (left + right lobes)
    var fallbackBrainGroup = new THREE.Group();
    (function addFallbackBrain() {
      var leftGeom = new THREE.SphereGeometry(0.5, 36, 28);
      leftGeom.scale(0.9, 1.1, 0.95);
      leftGeom.translate(-0.26, 0, 0);
      var leftBrain = new THREE.Mesh(leftGeom, brainMat);
      fallbackBrainGroup.add(leftBrain);

      var rightGeom = new THREE.SphereGeometry(0.5, 36, 28);
      rightGeom.scale(0.9, 1.1, 0.95);
      rightGeom.translate(0.26, 0, 0);
      var rightBrain = new THREE.Mesh(rightGeom, brainMat);
      fallbackBrainGroup.add(rightBrain);
    })();
    scene.add(fallbackBrainGroup);

    // Scale coords to fit inside brain volume (normalize, centered)
    var scale = 0.75;
    var xs = coords.map(function (c) { return c[0]; });
    var ys = coords.map(function (c) { return c[1]; });
    var zs = coords.map(function (c) { return c[2]; });
    var minX = Math.min.apply(null, xs);
    var maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys);
    var maxY = Math.max.apply(null, ys);
    var minZ = Math.min.apply(null, zs);
    var maxZ = Math.max.apply(null, zs);
    var cx = 0.5 * (minX + maxX);
    var cy = 0.5 * (minY + maxY);
    var cz = 0.5 * (minZ + maxZ);
    var dx = maxX - minX;
    var dy = maxY - minY;
    var dz = maxZ - minZ;
    var maxR = Math.max(dx, dy, dz) * 0.5 || 1;
    var pointsGeom = new THREE.BufferGeometry();
    var positions = new Float32Array(nParcel * 3);
    var colors = new Float32Array(nParcel * 3);
    for (var i = 0; i < nParcel; i++) {
      var px = coords[i][0] - cx;
      var py = coords[i][1] - cy;
      var pz = coords[i][2] - cz;
      positions[i * 3] = (px / maxR) * scale;
      positions[i * 3 + 1] = (py / maxR) * scale;
      positions[i * 3 + 2] = (pz / maxR) * scale;
    }
    pointsGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    var colorAttr = new THREE.BufferAttribute(colors, 3);
    pointsGeom.setAttribute('color', colorAttr);
    var pointsMat = new THREE.PointsMaterial({
      size: 0.045,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95
    });
    var points = new THREE.Points(pointsGeom, pointsMat);
    scene.add(points);

    var light = new THREE.DirectionalLight(0xffffff, 0.9);
    light.position.set(2, 2, 2);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    camera.position.set(2.2, 1.5, 2.2);
    camera.lookAt(0, 0, 0);

    // Load real brain mesh (Brainder pial surface) via OBJLoader; keep fallback if unavailable.
    if (typeof THREE.OBJLoader === 'function') {
      var objLoader = new THREE.OBJLoader();
      objLoader.load(
        'data/brain.obj',
        function (object) {
          scene.remove(fallbackBrainGroup);

          object.traverse(function (child) {
            if (child.isMesh) {
              child.material = brainMat;
            }
          });

          var box = new THREE.Box3().setFromObject(object);
          var center = new THREE.Vector3();
          var size = new THREE.Vector3();
          box.getCenter(center);
          box.getSize(size);

          object.position.sub(center);

          var maxDim = Math.max(size.x, size.y, size.z) || 1;
          var meshScale = (scale * 2) / maxDim;
          object.scale.set(meshScale, meshScale, meshScale);

          scene.add(object);
        },
        undefined,
        function (err) {
          console.error('BrainLM: failed to load brain.obj, using fallback mesh.', err);
        }
      );
    } else {
      console.warn('BrainLM: THREE.OBJLoader not available, using fallback mesh.');
    }

    var nTime = recording.length;
    var timeIdx = 0;
    var frameCount = 0;

    function animate() {
      requestAnimationFrame(animate);
      frameCount++;
      if (frameCount % 2 === 0) {
        timeIdx = (timeIdx + 1) % nTime;
        var row = recording[timeIdx];
        var minV = row[0];
        var maxV = row[0];
        for (var k = 1; k < row.length; k++) {
          if (row[k] < minV) minV = row[k];
          if (row[k] > maxV) maxV = row[k];
        }
        var range = maxV - minV || 1;
        for (var i = 0; i < nParcel; i++) {
          var v = (row[i] - minV) / range;
          v = Math.max(0, Math.min(1, v));
          colors[i * 3] = 0.15 + 0.85 * v;
          colors[i * 3 + 1] = 0.4 + 0.6 * v;
          colors[i * 3 + 2] = 0.6 + 0.4 * v;
        }
        colorAttr.needsUpdate = true;
      }
      renderer.render(scene, camera);
    }
    animate();
  }

  function initPoints2D(container, coords, recording, nParcel) {
    var w = Math.min(500, container.offsetWidth || 500);
    var h = 220;
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.style.maxWidth = '100%';
    canvas.style.borderRadius = '8px';
    canvas.style.background = 'rgba(255,255,255,0.03)';
    container.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    var xs = coords.map(function (c) { return c[0]; });
    var ys = coords.map(function (c) { return c[1]; });
    var minX = Math.min.apply(null, xs);
    var maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys);
    var maxY = Math.max.apply(null, ys);
    var pad = 30;
    var scaleX = (w - 2 * pad) / (maxX - minX || 1);
    var scaleY = (h - 2 * pad) / (maxY - minY || 1);
    var scale = Math.min(scaleX, scaleY);
    function px(x) { return pad + (x - minX) * scale; }
    function py(y) { return h - pad - (y - minY) * scale; }

    ctx.fillStyle = 'rgba(94, 184, 212, 0.6)';
    for (var i = 0; i < nParcel; i++) {
      ctx.beginPath();
      ctx.arc(px(coords[i][0]), py(coords[i][1]), 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#a0a3b5';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText('400 brain areas (X, Y projection of parcel coordinates)', pad, 14);
  }

  function initTokenizationSchematic(container, nTime, nParcel) {
    var patchSize = PATCH_SIZE;
    var numPatchesPerParcel = Math.floor(nTime / patchSize);
    var totalTokens = numPatchesPerParcel * nParcel + 1;

    var wrap = document.createElement('div');
    wrap.style.marginTop = '16px';
    wrap.style.padding = '16px';
    wrap.style.background = 'rgba(255,255,255,0.03)';
    wrap.style.borderRadius = '8px';
    wrap.style.fontSize = '14px';
    wrap.style.color = 'var(--text-secondary)';

    var p1 = document.createElement('p');
    p1.textContent = 'Tokenization: each parcel has ' + nTime + ' timepoints → ' + numPatchesPerParcel + ' patches (patch size ' + patchSize + '). Token order: timepoint-major → [CLS, all ' + nParcel + ' parcels at t=0, all at t=1, …, all at t=' + (numPatchesPerParcel - 1) + ']. Total tokens: ' + totalTokens + ' (including CLS).';
    wrap.appendChild(p1);

    var grid = document.createElement('div');
    grid.style.display = 'flex';
    grid.style.flexWrap = 'wrap';
    grid.style.gap = '6px';
    grid.style.marginTop = '12px';
    for (var t = 0; t < Math.min(10, numPatchesPerParcel); t++) {
      var block = document.createElement('div');
      block.style.background = 'rgba(94, 184, 212, 0.15)';
      block.style.color = 'var(--accent-teal)';
      block.style.padding = '8px 12px';
      block.style.borderRadius = '6px';
      block.style.fontFamily = 'JetBrains Mono, monospace';
      block.style.fontSize = '12px';
      block.textContent = 't=' + t + ' (' + nParcel + ')';
      grid.appendChild(block);
    }
    if (numPatchesPerParcel > 10) {
      var ellip = document.createElement('div');
      ellip.style.padding = '8px 12px';
      ellip.style.fontSize = '12px';
      ellip.textContent = '…';
      grid.appendChild(ellip);
    }
    wrap.appendChild(grid);
    container.appendChild(wrap);
  }

  function initPageInteractivity() {
    var nav = document.querySelector('.nav');
    var navToggle = document.querySelector('.nav__toggle');
    var navMenu = document.querySelector('.nav__menu');
    if (navToggle && navMenu) {
      navToggle.addEventListener('click', function () {
        navMenu.classList.toggle('nav__menu--open');
        navToggle.classList.toggle('nav__toggle--open');
        document.body.classList.toggle('no-scroll');
      });
      document.querySelectorAll('.nav__link').forEach(function (link) {
        link.addEventListener('click', function () {
          navMenu.classList.remove('nav__menu--open');
          navToggle.classList.remove('nav__toggle--open');
          document.body.classList.remove('no-scroll');
        });
      });
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('fade-in--visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -60px 0px', threshold: 0.1 });
    document.querySelectorAll('.fade-in').forEach(function (el) { observer.observe(el); });
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener('click', function (e) {
        var targetId = this.getAttribute('href');
        if (targetId === '#') return;
        var target = document.querySelector(targetId);
        if (target && nav) {
          e.preventDefault();
          window.scrollTo({ top: target.getBoundingClientRect().top + window.pageYOffset - nav.offsetHeight - 50, behavior: 'smooth' });
        }
      });
    });
    var copyBtn = document.getElementById('copy-cite-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var code = document.querySelector('.code-block--cite code');
        if (code && navigator.clipboard) {
          navigator.clipboard.writeText(code.textContent).then(function () {
            copyBtn.textContent = 'Copied!';
            setTimeout(function () { copyBtn.textContent = 'Copy BibTeX'; }, 2000);
          });
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initViz();
      initPageInteractivity();
    });
  } else {
    initViz();
    initPageInteractivity();
  }
})();
