"""Checks of the plain pages (plain/*.html, written by tools/build_data.py), standard library only.

    python3 tests/plain_pages.py

For each page: the Content-Security-Policy and noindex tags, the draft notice at the top and
the credit line at the bottom, no script, no event-handler attribute and no inline style, no
address outside the site except http(s) links, and every local link pointing at a file that
exists and, where it names one, at an id that exists in the plain page it points to.
Exit status 1 if anything fails.
"""
import os, re, sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'plain')
PAGES = ('index.html', 'book.html', 'squares.html', 'play.html', 'about.html')


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids, self.links, self.bad, self.meta = [], [], [], {}

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            self.ids.append(a['id'])
        if tag == 'meta':
            self.meta[a.get('name') or a.get('http-equiv') or a.get('charset') or '?'] = a.get('content', '')
        for k in ('href', 'src'):
            if k in a:
                self.links.append(a[k])
        if 'srcset' in a:
            self.links += [x.strip().split()[0] for x in a['srcset'].split(',') if x.strip()]
        if tag in ('script', 'iframe', 'object', 'embed', 'base') or 'style' in a or any(k.startswith('on') for k in a):
            self.bad.append(f'<{tag} {" ".join(a)}>')


def main():
    fails = []
    pages = {}
    for name in PAGES:
        path = os.path.join(P, name)
        if not os.path.exists(path):
            fails.append(f'{name}: missing (run tools/build_data.py)'); continue
        src = open(path, encoding='utf-8').read()
        pg = Page(); pg.feed(src); pages[name] = (pg, src)
    for name, (pg, src) in pages.items():
        csp = pg.meta.get('Content-Security-Policy', '')
        if "script-src 'none'" not in csp or "default-src 'self'" not in csp:
            fails.append(f'{name}: Content-Security-Policy missing or not strict: {csp!r}')
        if pg.meta.get('robots') != 'noindex':
            fails.append(f'{name}: no robots noindex')
        main_at = src.find('<main')
        if 'class="notice"' not in src[:main_at] or 'AI-produced draft' not in src[:main_at]:
            fails.append(f'{name}: the draft notice is not at the top')
        if 'The Trustees of the British Museum' not in src[src.rfind('<footer'):]:
            fails.append(f'{name}: the credit line is not at the bottom')
        if src.count('<h1') != 1:
            fails.append(f'{name}: {src.count("<h1")} h1 headings')
        dup = sorted({i for i in pg.ids if pg.ids.count(i) > 1})
        if dup:
            fails.append(f'{name}: duplicate ids {dup[:8]}')
        fails += [f'{name}: not allowed: {b}' for b in pg.bad]
        for v in pg.links:
            if re.match(r'https?://', v):
                continue
            if re.match(r'[a-z][a-z0-9+.-]*:', v, re.I):
                fails.append(f'{name}: link with another scheme: {v}'); continue
            path, _, frag = v.partition('#')
            path = path.split('?')[0]
            target = os.path.normpath(os.path.join(P, path)) if path else os.path.join(P, name)
            if not target.startswith(ROOT + os.sep):
                fails.append(f'{name}: link outside the site: {v}'); continue
            if not os.path.exists(target):
                fails.append(f'{name}: missing file: {v}'); continue
            other = os.path.basename(target) if os.path.dirname(target) == P else None
            if frag and other in pages and frag not in pages[other][0].ids:
                fails.append(f'{name}: no id for {v}')
    for f in fails:
        print('FAIL', f)
    print(f'plain pages: {len(pages)} checked, {len(fails)} failures')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
