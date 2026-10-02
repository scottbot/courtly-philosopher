#!/usr/bin/env python3
"""verify_quotes.py — check the edition's verified quotations against the research corpus.

Every {q|citekey|pdfN|printed page|exact words} in the given content files must occur
verbatim in <corpus>/<citekey>.md starting on PDF page N (it may run into page N+1; a
"[…]" in the quotation stands for an omission). Every [@citekey, …] citation must name a
citekey that exists in the corpus (web: and ref: keys are not checked).

The corpus (the bibliography converted to Markdown, with <a id="p.N"></a>`[p.N]` page
anchors) is not part of this repository. Maintainers' notes in <!-- … --> are skipped,
as the build skips them.

Where the Markdown conversion of a page is defective, a quotation can fail against the
corpus and still be right. Two fallbacks clear such quotations, and the report says which
route each pass took:
  --pdfs FOLDER   the folder of the original PDFs (the reference manager's "files/" folder):
                  the quotation is looked for in the PDF's own text layer (letters only, so
                  split words and interleaved columns do not matter; [bracketed] insertions are
                  ignored). The PDF is the one named by "source_file:" in the corpus file's
                  front matter. Needs pymupdf (tools/requirements.txt).
  image_verified.json (beside this script)
                  quotations read by eye on rendered page images, where neither the Markdown
                  nor the text layer has the words: [citekey, pdf page, quotation] triples.
At version 0.2 these eight quotations pass only by a fallback (defective pages in the
Markdown conversion):
  text layer:  lucerosanchezAsnoPenseQue2019 pdf3 and pdf11; decaceresTableroItalianoFilosofia2009
               pdf15 and pdf19 (two); wilsonCervantesItemEmmanuel1968 pdf3
  page images: wilsonCervantesItemEmmanuel1968 pdf7 ("Pay the others…", "He has caught his fish…")
Without --pdfs, the text-layer ones are reported as failures.

--write-manifest FILE writes, for each corpus file, its citekey, title, source file, the source
file's SHA-256 and page count (with --pdfs) and the page offset recorded in the reading notes
(with --notes FOLDER), so that a later maintainer can recognize the same sources.

Usage: python3 tools/verify_quotes.py --corpus PATH [--pdfs FOLDER] content/*.md
       python3 tools/verify_quotes.py --corpus PATH --pdfs FOLDER --notes FOLDER --write-manifest tools/corpus_manifest.json
Exit status 1 if anything fails.
"""
import argparse, hashlib, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ANCH = re.compile(r'<a id="p\.(\d+)"></a>`\[p\.\d+\]`')
Q = re.compile(r'\{q\|([^|}]+)\|pdf(\d+)\|([^|}]*)\|([^}]+)\}')
CITE = re.compile(r'@([A-Za-z][\w:-]*)')


def norm(s):
    s = re.sub(r'[*_]', '', s).replace('­', '')
    return re.sub(r'\s+', ' ', s).strip()


def flat(s):
    return re.sub(r'[\W_]+', '', s.lower())


def front(path, field):
    """A field of a corpus file's YAML front matter (first 3000 characters)."""
    head = open(path, encoding='utf-8').read(3000)
    m = re.search(r'^' + field + r':\s*"?(.*?)"?\s*$', head, re.M)
    return m.group(1) if m else None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--corpus', required=True, help='folder of <citekey>.md files')
    ap.add_argument('--pdfs', help='folder of the original PDFs (source_file: paths are read relative to its parent '
                                   'when they start with "files/")')
    ap.add_argument('--notes', help='folder of the reading notes (<citekey>.md), for the page offsets in the manifest')
    ap.add_argument('--write-manifest', metavar='FILE', help='write the corpus manifest and stop')
    ap.add_argument('files', nargs='*')
    args = ap.parse_args()
    keys = {f[:-3] for f in os.listdir(args.corpus) if f.endswith('.md')}

    def pdf_path(key):
        if not args.pdfs:
            return None
        src = front(os.path.join(args.corpus, key + '.md'), 'source_file')
        if not src or not src.lower().endswith('.pdf'):
            return None
        p = os.path.join(args.pdfs, re.sub(r'^files/', '', src))
        return p if os.path.exists(p) else None

    if args.write_manifest:
        out = []
        for key in sorted(keys):
            cf = os.path.join(args.corpus, key + '.md')
            rec = {'citekey': key, 'title': front(cf, 'title'), 'source_file': front(cf, 'source_file')}
            p = pdf_path(key) if rec['source_file'] else None
            if not p and args.pdfs and rec['source_file']:
                q = os.path.join(args.pdfs, re.sub(r'^files/', '', rec['source_file']))
                p = q if os.path.exists(q) else None
            if p:
                rec['sha256'] = hashlib.sha256(open(p, 'rb').read()).hexdigest()
                rec['bytes'] = os.path.getsize(p)
                if p.lower().endswith('.pdf'):
                    import pymupdf
                    rec['pages'] = pymupdf.open(p).page_count
            if args.notes and os.path.exists(os.path.join(args.notes, key + '.md')):
                m = re.search(r'\*\*Page offset[^*]*\*\*:?\s*(.+)', open(os.path.join(args.notes, key + '.md'),
                                                                         encoding='utf-8').read())
                if m:
                    rec['page_offset'] = re.split(r'(?<=[^.])\.\s', m.group(1).strip(), maxsplit=1)[0].rstrip('.')
            out.append(rec)
        with open(args.write_manifest, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
            f.write('\n')
        print(f'manifest: {len(out)} corpus files, {sum("sha256" in r for r in out)} with a checksum')
        return

    cache, pdfcache = {}, {}
    iv = os.path.join(HERE, 'image_verified.json')
    img_ok = {tuple(x) for x in json.load(open(iv, encoding='utf-8'))} if os.path.exists(iv) else set()

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

    def text_layer(key, n, segs):
        if key not in pdfcache:
            p = pdf_path(key)
            if p:
                import pymupdf
                pdfcache[key] = {i + 1: flat(pg.get_text()) for i, pg in enumerate(pymupdf.open(p))}
            else:
                pdfcache[key] = None
        P = pdfcache[key]
        if not P:
            return False
        hay = P.get(n, '') + P.get(n + 1, '')
        return all(flat(re.sub(r'\[[^\]]*\]', '', s)) in hay for s in segs)

    bad = 0
    route = {'corpus': 0, 'text layer': 0, 'page image': 0}
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
                route['corpus'] += 1
            elif (key, n, ' […] '.join(segs)) in img_ok:
                route['page image'] += 1
                print(f'page image {f}: [{key} pdf{n}] {q[:70]!r}')
            elif text_layer(key, n, segs):
                route['text layer'] += 1
                print(f'text layer {f}: [{key} pdf{n}] {q[:70]!r}')
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
    ok = sum(route.values())
    print(f'quotations verified {ok} (in the corpus {route["corpus"]}, in the PDF text layer {route["text layer"]}, '
          f'on page images {route["page image"]}), failures {bad}')
    if bad and not args.pdfs:
        print('(without --pdfs the PDF text-layer fallback was not tried)')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
