#!/usr/bin/env python3
"""verify_quotes.py — check the edition's verified quotations against the research corpus.

Every {q|citekey|pdfN|printed page|exact words} in the given content files must occur
verbatim in <corpus>/<citekey>.md starting on PDF page N (it may run into page N+1; a
"[…]" in the quotation stands for an omission). Every [@citekey, …] citation must name a
citekey that exists in the corpus (web: and ref: keys are not checked).

The corpus (the bibliography converted to Markdown, with <a id="p.N"></a>`[p.N]` page
anchors) is not part of this repository. Maintainers' notes in <!-- … --> are skipped,
as the build skips them.

Usage: python3 tools/verify_quotes.py --corpus PATH content/*.md
Exit status 1 if anything fails.
"""
import argparse, os, re, sys

ANCH = re.compile(r'<a id="p\.(\d+)"></a>`\[p\.\d+\]`')
Q = re.compile(r'\{q\|([^|}]+)\|pdf(\d+)\|([^|}]*)\|([^}]+)\}')
CITE = re.compile(r'@([A-Za-z][\w:-]*)')


def norm(s):
    s = re.sub(r'[*_]', '', s).replace('­', '')
    return re.sub(r'\s+', ' ', s).strip()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--corpus', required=True, help='folder of <citekey>.md files')
    ap.add_argument('files', nargs='+')
    args = ap.parse_args()
    keys = {f[:-3] for f in os.listdir(args.corpus) if f.endswith('.md')}
    cache = {}

    def pages(key):
        if key not in cache:
            p = os.path.join(args.corpus, key + '.md')
            if not os.path.exists(p):
                cache[key] = None
            else:
                parts = ANCH.split(open(p, encoding='utf-8').read())
                pg = {0: norm(parts[0])}
                for i in range(1, len(parts), 2):
                    pg[int(parts[i])] = norm(parts[i + 1])
                cache[key] = pg
        return cache[key]

    bad = ok = 0
    for f in args.files:
        t = re.sub(r'<!--.*?-->', '', open(f, encoding='utf-8').read(), flags=re.S)
        for m in Q.finditer(t):
            key, n, q = m.group(1), int(m.group(2)), norm(m.group(4))
            segs = [s for s in re.split(r'\s*\[…\]\s*', q) if s]
            pg = pages(key)
            if pg is None:
                print(f'FAIL {f}: unknown citekey in quotation {key}'); bad += 1; continue
            hay = ' '.join(pg.get(i, '') for i in (n, n + 1))
            pos, good = 0, True
            for s in segs:
                j = hay.find(s, pos)
                if j < 0:
                    good = False; break
                pos = j + len(s)
            if good:
                ok += 1
            else:
                bad += 1
                full = ' '.join(pg.values())
                hint = ' (found elsewhere: wrong pdf page)' if all(s in full for s in segs) else ''
                print(f'FAIL {f}: [{key} pdf{n}] {q[:100]!r}{hint}')
        for m in re.finditer(r'\[([^\]]*@[^\]]*)\]', t):
            for k in CITE.findall(m.group(1)):
                if k.startswith(('web', 'ref:')):
                    continue
                if k not in keys:
                    print(f'FAIL {f}: unknown citekey @{k}'); bad += 1
    print(f'quotations verified {ok}, failures {bad}')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
