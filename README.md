# josueortc.github.io

Personal academic website of Josué Ortega Caro. Plain static HTML, CSS, and JavaScript served by GitHub Pages (no build step; `.nojekyll`).

## Structure

```
index.html              Home: bio, news, research themes, projects, selected publications
publications.html       Full publication list (with First author / Conference / Journal / Preprint filter)
cv.html                 HTML CV; links files/josue_ortegacaro_CV.pdf
talks.html              Invited talks and posters (awards-conferences.html redirects here)
404.html                Not-found page (uses root-relative paths)
css/base.css            Shared design system: tokens, type, nav, buttons, footer (every page)
css/site.css            Root-page components
css/paper.css           Project-page components (hero, contents bar, method steps, schematics)
js/main.js              Nav menu, reveal-on-scroll, contents-bar highlighting, tabs, copy buttons, pub filter
js/viz-kit.js           Helpers for the animated schematics (HiDPI canvas, visibility-aware loops)
js/math.js              KaTeX auto-render for equations on project pages
projects/<name>/        Project pages (flux, prismt, brainlm): index.html, css/<name>.css (theme), js/<name>-viz.js
images/                 site/ (portrait), cards/ (project thumbnails), talks/, og/ (link-preview images)
scripts/check_site.py   Pre-publish checks (links, anchors, stale strings)
scripts/build_brain_mesh.py  Rebuilds the BrainLM 3D brain assets
```

## Preview locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
python3 scripts/check_site.py # add --external to also test outside links
```

## When the CV changes

The nav and footer are repeated in every page, so search and replace across all `*.html` files.

| Change | Where |
|---|---|
| Job title / affiliation | Hero and About on `index.html`; footer of every page; `<meta name="description">` and JSON-LD in `index.html`; Appointments in `cv.html` |
| New paper | `publications.html` (with `data-tags`: `first`, `conference`, `journal`, `preprint`); optionally Selected publications and a research theme on `index.html` |
| Venue change (preprint → accepted) | `publications.html`, `index.html` (theme list, project card, selected pubs, news), the project page badge and BibTeX |
| Award | Honors in `cv.html`; News on `index.html` |
| Talk | `talks.html` and Invited Talks in `cv.html` |
| New CV PDF | Replace `files/josue_ortegacaro_CV.pdf` (keep the file name) |
| Year | `© 2026` and “Last updated” in footers; `lastmod` in `sitemap.xml` |

Then add the old title or year to `STALE` in `scripts/check_site.py` so it can't come back.

## Images

Export figures as WebP near the size they are displayed (about 2× for sharp screens):

```bash
cwebp -q 82 -resize 1280 0 figure.png -o images/cards/name.webp     # project card (1280×542)
cwebp -q 80 -resize 2400 0 figure.png -o projects/x/images/fig.webp  # full-width paper figure
```

Always set `width`/`height` on `<img>`, and use `loading="lazy"` below the fold.

## Project pages

Each page loads `css/base.css`, `css/paper.css`, and a small theme file that sets `--accent` (plus schematic colours). The animated schematics are illustrative canvas drawings (labelled as such). They pause off-screen and respect `prefers-reduced-motion`. The BrainLM page shows real example data (OpenNeuro ds000228) on a decimated Brainder pial surface built by `scripts/build_brain_mesh.py`.
