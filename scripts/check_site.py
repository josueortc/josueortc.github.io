#!/usr/bin/env python3
"""Pre-publish checks for the static site. Run from the repo root:

    python3 scripts/check_site.py            # internal links, anchors, stale strings
    python3 scripts/check_site.py --external # also request every external URL (slower)

Exits non-zero if a problem is found.
"""
import glob
import html
import os
import re
import sys
import urllib.request

ROOT_PAGES = ['index.html', 'publications.html', 'cv.html', 'talks.html', '404.html', 'awards-conferences.html']
PAGES = ROOT_PAGES + sorted(glob.glob('projects/*/index.html'))

# Strings that should no longer appear anywhere (update when your role or year changes).
STALE = [
    (r'YOUR_ID', 'placeholder Google Scholar ID'),
    (r'© 2025', 'stale copyright year'),
    (r'Postdoctoral Associate', 'old job title'),
    (r'https://cardinlab\.org', 'cardinlab.org has a self-signed HTTPS certificate; use http://cardinlab.org/'),
    (r'github\.com/josueortc/flux(?![\w-])', 'FLUX repository is not public yet'),
    (r'Fondo de Mobilidad', 'typo: Movilidad'),
]
# "Wu Tsai Fellow" is allowed only in history (CV appointments, bio sentence).
WU_TSAI_OK = {'cv.html', 'index.html'}

problems = []
ids = {}


def page_ids(path):
    if path not in ids:
        with open(path, encoding='utf-8') as fh:
            ids[path] = set(re.findall(r'\sid="([^"]+)"', fh.read()))
    return ids[path]


def resolve(page, url):
    path, _, frag = url.partition('#')
    path = path.split('?', 1)[0]  # ignore cache-busting query strings
    if path.startswith('/'):
        target = path.lstrip('/')
    elif path == '':
        target = page
    else:
        target = os.path.normpath(os.path.join(os.path.dirname(page), path))
    if target in ('', '.') or path.endswith('/') or os.path.isdir(target):
        target = os.path.join(target, 'index.html') if target not in ('', '.') else 'index.html'
    return target, frag


external = set()
for page in PAGES:
    with open(page, encoding='utf-8') as fh:
        src = fh.read()
    for attr, value in re.findall(r'\s(href|src|srcset)="([^"]+)"', src):
        urls = [v.strip().split(' ')[0] for v in value.split(',')] if attr == 'srcset' else [value]
        for url in urls:
            url = html.unescape(url)
            if url.startswith(('http://', 'https://')):
                external.add(url)
                continue
            if url.startswith(('mailto:', 'data:', 'javascript:', 'tel:')):
                continue
            target, frag = resolve(page, url)
            if not os.path.exists(target):
                problems.append(f'{page}: broken link {url}')
            elif frag and target.endswith('.html') and frag not in page_ids(target):
                problems.append(f'{page}: missing anchor #{frag} in {target}')
    for pattern, why in STALE:
        if re.search(pattern, src):
            problems.append(f'{page}: {why} ({pattern})')
    if 'Wu Tsai Fellow' in src and page not in WU_TSAI_OK:
        problems.append(f'{page}: "Wu Tsai Fellow" outside the CV history (current title is Swartz Postdoctoral Fellow)')

if '--external' in sys.argv:
    skip = ('fonts.googleapis.com', 'fonts.gstatic.com')
    for url in sorted(external):
        if url.rstrip('/').endswith(skip):
            continue
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (site link check)'})
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                code = resp.status
        except urllib.error.HTTPError as err:
            code = err.code
        except Exception as err:  # network errors, TLS problems
            code = type(err).__name__
        # 403/429/999: publishers and LinkedIn block scripted requests; check these by hand.
        if code not in (200, 403, 429, 999):
            problems.append(f'external {url}: {code}')
        elif code != 200:
            print(f'note: {url} returned {code} (usually bot blocking)')

if problems:
    print('\n'.join(problems))
    print(f'\n{len(problems)} problem(s) found.')
    sys.exit(1)
print(f'OK: {len(PAGES)} pages checked, {len(external)} external links found.')
