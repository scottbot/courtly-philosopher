#!/usr/bin/env python3
"""
build_data.py — turn the edition's source files (content/) into the JavaScript data
files the site reads (data/*.js). The site itself needs no build step: this script only
has to be re-run when a file in content/ changes.

content/  (human-edited sources, Markdown + JSON)
  squares_01_31.json, squares_32_63.json   board transcription + geometry (photo pixels)
  margins_01_31.json, centre.json          corner figures, inscriptions, centre features
  board_italian.md                          English glosses of the Italian inscriptions
  TRANSLATION_GUIDE.md                      the fixed English verse translations
  C_part1.md, C_part2.md                    Naples 1588 text: Spanish + English, by segment
  M_additions.md                            Madrid-Madrigal 1587 passages absent from C
  G_variants.md                             what is known of the Madrid 1587 princeps
  A_…, B_…, C_…, D_… .md                    square annotations (=== id: … blocks)
  E_story_about.md                          intro scenes, about pages, bibliography, note

data/  (generated; do not edit by hand)
  board.js  text.js  annotations.js  story.js  biblio.js

Markup understood in annotation/about prose:
  [@key, 144]  [@a, 12; @b, 3]  [board]  [@web:https://…]      citations
  {q|key|pdfN|printedPage|exact words}                            verified short quotations
  *italic*  **bold**  [text](url)  - lists  | tables |  #### headings

Usage: python3 tools/build_data.py
"""
import json, os, re, html

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
C = lambda f: os.path.join(ROOT, 'content', f)
SHEET_OFFSET = (56, 100)          # must match tools/make_images.py
SHEET_SIZE = (2594, 3402)


def read(f):
    return open(C(f), encoding='utf-8').read().replace('\r\n', '\n')


# ---------------------------------------------------------------- bibliography
def parse_biblio():
    txt = read('E_story_about.md')
    sec = txt.split('## C. Bibliography', 1)[1].split('\n## D.', 1)[0]
    sec += '\n' + read('bib_extra.md')      # web sources cited only in the annotations
    bib, order = {}, []
    group = ''
    for line in sec.split('\n'):
        if line.startswith('### '):
            group = line[4:].strip()
        m = re.match(r'- `([^`]+)` (.*)', line)
        if not m:
            continue
        key, ref = m.group(1), m.group(2).strip()
        dup = re.match(r'\*\*Duplicate\*\* of `([^`]+)`', ref)
        label = make_label(key, ref)
        bib[key] = {'key': key, 'ref': ref, 'label': label, 'group': group,
                    'dup': dup.group(1) if dup else None}
        order.append(key)
    # manual labels where the automatic rule is not good enough
    fix = {'ref:board': 'Cartaro 1588 (board)',
           'barrosFilosofiaCortesanaMoralizada1588': 'Barros 1588',
           'debarrosFilosofiaCortesana1587': 'Barros 1587 (M, mod. transcr.)',
           'GameGooseLargest': 'Ciompi & Seville, giochidelloca.it',
           'FilosofiaCortesanaBarros': 'Polifemo, catalogue page',
           'TarotHistoryForum': 'Tarot History Forum 2013',
           'ref:dadson1987ed': 'Dadson ed. 1987', 'ref:lucero2019ed': 'Lucero ed. 2019',
           'ref:blasco2014': 'Blasco ed. 2014', 'ref:bne2016': 'BNE facsimile 2016',
           'ref:careaga1612': 'Careaga 1612'}
    for k, v in fix.items():
        if k in bib:
            bib[k]['label'] = v
    for k, b in bib.items():
        if b['dup'] and b['dup'] in bib:
            b['label'] = bib[b['dup']]['label']
    return bib, order


def make_label(key, ref):
    if key.startswith('web:'):
        m = re.match(r'([^.]+?)\. (n\.d\.|\[?\d{4}\]?[a-z]?)', ref)
        who = m.group(1) if m else re.sub(r'https?://(www\.)?([^/]+).*', r'\2', key[4:])
        yr = m.group(2) if m else ''
        return f"{shorten(who)} {yr}".strip()
    m = re.match(r'(.+?)\. (n\.d\.|\[?\d{4}\]?[a-z]?)\.', ref)
    if not m:
        return key
    who, yr = m.group(1), m.group(2)
    return f"{shorten(who)} {yr}"


def shorten(who):
    who = re.sub(r',? (ed|engr|eds)\.$', '', who.strip())
    parts = re.split(r',? and ', who)
    fams = []
    for i, p in enumerate(parts):
        p = p.strip()
        if i == 0:
            fams.append(p.split(',')[0].strip())
        else:
            fams.append(p.split()[-1])
    return ' & '.join(fams[:2]) + (' et al.' if len(fams) > 2 else '')


BIB, BIB_ORDER = {}, []


# ---------------------------------------------------------------- inline markup
def pdf_to_printed(n):
    """Naples 1588: PDF page -> printed page (pagination starts at p.16 = pdf 22)
    or signature for the unpaginated preliminaries (pdf 7 = A1r)."""
    if n >= 22:
        return f"p. {n - 6}"
    k = n - 7
    return f"sig. A{k // 2 + 1}{'rv'[k % 2]}"


def cite_item(item):
    item = item.strip()
    if item == 'board':
        return '<a class="cite" href="about.html#about-board" data-key="ref:board">board</a>'
    m = re.match(r'@web:(\S+)', item)
    if m:
        url = m.group(1).rstrip(',')
        b = BIB.get('web:' + url)
        lab = b['label'] if b else re.sub(r'https?://(www\.)?([^/]+).*', r'\2', url)
        return f'<a class="cite" href="{html.escape(url)}" target="_blank" rel="noopener" data-key="{html.escape("web:" + url)}">{html.escape(lab)}</a>'
    m = re.match(r'@([\w:-]+)\s*(?:,\s*(.*))?$', item)
    if not m:
        return html.escape(item)
    key, loc = m.group(1), (m.group(2) or '').strip()
    b = BIB.get(key)
    if b and b['dup']:
        key = b['dup']; b = BIB.get(key)
    lab = b['label'] if b else key
    href = f'about.html#bib-{key}'
    if key == 'barrosFilosofiaCortesanaMoralizada1588' and loc.startswith('pdf'):
        nums = [int(x) for x in re.findall(r'\d+', loc)]
        if nums:
            loc = pdf_to_printed(nums[0]) + (f"–{nums[-1] - 6}" if len(nums) > 1 and nums[0] >= 22 else '')
            href = f'text.html#pdf{nums[0]}'
    elif loc.startswith('pdf'):
        loc = 'PDF ' + loc[3:].strip()
    txt = html.escape(lab + (', ' + loc if loc else ''))
    return f'<a class="cite" href="{href}" data-key="{html.escape(key)}">{txt}</a>'


def inline(s):
    """Markdown-ish inline markup + citations -> HTML."""
    out, pos = [], 0
    # protect quotations and citations first
    tokens = []
    def stash(h):
        tokens.append(h); return f'\x00{len(tokens) - 1}\x00'
    def qrep(m):
        key, pdf, printed, text = m.group(1), m.group(2), m.group(3).strip(), m.group(4).strip()
        c = cite_item(f'@{key}, {printed}' if printed else f'@{key}')
        return stash(f'<q class="sq" lang="{guess_lang(text)}">{fmt(html.escape(text))}</q> <span class="cites">({c})</span>')
    s = re.sub(r'\{q\|([^|}]+)\|pdf(\d+)\|([^|}]*)\|([^}]+)\}', qrep, s)
    def crep(m):
        inner = m.group(1)
        if '@' not in inner and inner.strip() != 'board':
            return m.group(0)
        items = [i for i in re.split(r';\s*(?=@|board)', inner) if i.strip()]
        return stash('<span class="cites">(' + '; '.join(cite_item(i) for i in items) + ')</span>')
    s = re.sub(r'\[((?:@|board)[^\]]*)\](?!\()', crep, s)
    s = html.escape(s, quote=False)
    s = re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)', r'<a href="\2" target="_blank" rel="noopener">\1</a>', s)
    s = fmt(s)
    s = re.sub(r'\x00(\d+)\x00', lambda m: tokens[int(m.group(1))], s)
    return s


def fmt(s):
    s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<em>\1</em>', s)
    s = re.sub(r'`([^`]+)`', r'<code>\1</code>', s)
    return s


def guess_lang(t):
    """Language of a quotation, for the lang attribute (Spanish, Italian, French, English)."""
    t = ' ' + re.sub(r'[^\w\s]', ' ', t.lower()) + ' '
    words = {
        'es': ('que', 'la', 'el', 'los', 'las', 'y', 'en', 'por', 'una', 'se', 'no', 'hay', 'ay', 'con', 'del', 'al', 'porque', 'sólo', 'entonces', 'siempre', 'está'),
        'it': ('il', 'che', 'della', 'di', 'gli', 'non', 'per', 'lo', 'nel'),
        'fr': ('le', 'les', 'du', 'des', 'une', 'et', 'est', 'plus', 'jeu', 'oie'),
        'en': ('the', 'and', 'of', 'is', 'to', 'a', 'was', 'while', 'you', 'without', 'for', 'each'),
    }
    score = {k: sum(t.count(f' {w} ') for w in ws) for k, ws in words.items()}
    if re.search(r'[ñ¿¡]|ción\b', t):
        score['es'] += 2
    best = max(score, key=score.get)
    return best if score[best] else 'en'


def block_md(text):
    """Block-level Markdown: paragraphs, #### headings, lists, tables."""
    lines = text.strip('\n').split('\n')
    out, i = [], 0
    while i < len(lines):
        l = lines[i].rstrip()
        if not l.strip():
            i += 1; continue
        m = re.match(r'(#{2,6}) (.*)', l)
        if m:
            lvl = min(len(m.group(1)) - 1, 5)
            out.append(f'<h{lvl}>{inline(m.group(2))}</h{lvl}>'); i += 1; continue
        if l.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                rows.append(lines[i]); i += 1
            cells = [[c.strip() for c in r.strip().strip('|').split('|')] for r in rows]
            head, body = cells[0], [r for r in cells[1:] if not all(re.match(r'^:?-+:?$', c) for c in r)]
            t = '<div class="table-wrap"><table><thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in head) + '</tr></thead><tbody>'
            t += ''.join('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in body)
            out.append(t + '</tbody></table></div>'); continue
        if re.match(r'\s*([-*]|\d+\.) ', l):
            ordered = bool(re.match(r'\s*\d+\. ', l))
            items = []
            while i < len(lines) and (re.match(r'\s*([-*]|\d+\.) ', lines[i]) or (lines[i].startswith('  ') and lines[i].strip() and items)):
                if re.match(r'\s*([-*]|\d+\.) ', lines[i]):
                    items.append(re.sub(r'^\s*([-*]|\d+\.) ', '', lines[i]))
                else:
                    items[-1] += ' ' + lines[i].strip()
                i += 1
            tag = 'ol' if ordered else 'ul'
            out.append(f'<{tag}>' + ''.join(f'<li>{inline(x)}</li>' for x in items) + f'</{tag}>'); continue
        if l.startswith('>'):
            q = []
            while i < len(lines) and lines[i].startswith('>'):
                q.append(lines[i].lstrip('>').strip()); i += 1
            out.append(f'<blockquote>{inline(" ".join(q))}</blockquote>'); continue
        if l.strip() == '---':
            i += 1; continue
        para = [l.strip()]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r'(#{2,6} |\||>|\s*([-*]|\d+\.) )', lines[i]):
            para.append(lines[i].strip()); i += 1
        out.append(f'<p>{inline(" ".join(para))}</p>')
    return '\n'.join(out)


def paras(text):
    """Annotation multi-line fields. Two writing styles occur in content/:
    one long line per paragraph (A_, C_), or lines wrapped at ~90 characters with
    blank lines between paragraphs (B_, D_). Long-line fields get a paragraph per
    line; wrapped fields are read as ordinary Markdown."""
    lines = [l.strip() for l in text.split('\n')]
    if max((len(l) for l in lines), default=0) > 600:
        out = []
        for l in lines:
            if not l:
                continue
            if out and not (l.startswith('- ') and out[-1].startswith('- ')):
                out.append('')
            out.append(l)
        text = '\n'.join(out)
    return block_md(text)


# ---------------------------------------------------------------- annotations
def parse_annotations():
    ann = {}
    for f in sorted(os.listdir(os.path.join(ROOT, 'content'))):
        if not re.match(r'[A-D]_.*\.md$', f) or f.startswith('C_part'):
            continue
        for blk in re.findall(r'^=== id: (.+?)\n(.*?)\n===\s*$', read(f), re.S | re.M):
            bid, body = blk[0].strip(), blk[1]
            fields, cur = {}, None
            for line in body.split('\n'):
                m = re.match(r'^([a-z_]+): ?(\|)?(.*)$', line)
                if m and not line.startswith(' '):
                    cur = m.group(1)
                    fields[cur] = '' if m.group(2) else m.group(3).strip()
                    if m.group(2):
                        fields[cur] = ''
                elif cur:
                    fields[cur] += line.strip() + '\n'
            a = {'id': bid}
            for k in ('title_en', 'title_es', 'board_it', 'kind', 'barros_pdf'):
                a[k] = fields.get(k, '').strip()
            a['rule_short'] = inline(fields.get('rule_short', '').strip())
            for k in ('see', 'why', 'context', 'variants', 'readings'):
                a[k] = paras(fields.get(k, ''))
            a['sources'] = [s.strip() for s in fields.get('sources', '').split(',') if s.strip()]
            a['file'] = f
            ann[bid] = a
    return ann


# ---------------------------------------------------------------- verses
def parse_verses():
    v = {}
    for line in read('TRANSLATION_GUIDE.md').split('\n'):
        m = re.match(r'\| (\S+) \| (.*?) \| (.*?) \| (.*?) \|$', line)
        if m and m.group(1) not in ('id', '---'):
            v[m.group(1)] = {'es': m.group(2), 'en': m.group(3), 'lit': m.group(4)}
    return v


# ---------------------------------------------------------------- text segments
def parse_segments(fname):
    segs = []
    for attrs, body in re.findall(r'^::: seg (.*?)\n(.*?)\n:::\s*$', read(fname), re.S | re.M):
        a = dict(re.findall(r'(\w+)=(\S*)', attrs))
        fields, cur = {}, None
        for line in body.split('\n'):
            m = re.match(r'^(ES|EN|NOTE|LIT|LITERAL|VID): ?(.*)$', line)
            if m:
                cur = 'LIT' if m.group(1) == 'LITERAL' else m.group(1)
                fields[cur] = (fields.get(cur, '') + '\n' + m.group(2)).strip()
            elif cur:
                fields[cur] += '\n' + line
        sq = a.get('squares', '')
        segs.append({
            'id': a.get('id'), 'pdf': a.get('pdf', ''), 'page': a.get('page', ''),
            'fol': a.get('fol', ''), 'sig': a.get('sig', ''), 'kind': a.get('kind', 'prose'),
            'replaces': a.get('replaces', ''),
            'squares': [x for x in sq.split(',') if x and x != 'none'],
            'es': fields.get('ES', ''), 'en': inline(fields.get('EN', '')),
            'note': inline(fields.get('NOTE', '')), 'lit': fields.get('LIT', ''),
            'vid': fields.get('VID', '')})
    return segs


def md_intro(fname):
    """The prose before the first segment (used for notes on the text page)."""
    t = read(fname)
    t = t.split('::: seg', 1)[0]
    return block_md(re.sub(r'^# .*\n', '', t))


# ---------------------------------------------------------------- board
def parse_board(verses):
    squares = []
    for f in ('squares_01_31.json', 'squares_32_63.json'):
        squares += json.load(open(C(f), encoding='utf-8'))
    feats = json.load(open(C('margins_01_31.json'), encoding='utf-8')) + \
        json.load(open(C('centre.json'), encoding='utf-8'))
    it = read('board_italian.md')
    it_json = json.loads(re.search(r'```json\n(.*?)\n```', it, re.S).group(1))
    W, H = SHEET_SIZE
    def rel(p):
        return [round((p[0] - SHEET_OFFSET[0]) / W, 5), round((p[1] - SHEET_OFFSET[1]) / H, 5)]
    out = []
    for s in sorted(squares, key=lambda s: s['n']):
        n = s['n']
        g = it_json.get(f'sq{n}', {}) if isinstance(it_json, dict) else {}
        out.append({
            'n': n, 'heading': s.get('heading') or '', 'it': s.get('it') or '',
            'es': s.get('es') or '', 'rule': s.get('rule') or '',
            'desc': s.get('image_desc') or '', 'blank': bool(s.get('blank')),
            'center': rel(s['center']), 'quad': [rel(p) for p in s['quad']],
            'rot': s.get('rot') or 0, 'it_gloss': g.get('it_gloss', ''),
            'rule_en': g.get('rule_en', ''), 'it_note': g.get('note', ''),
            'notes': s.get('notes') or ''})
    fo = []
    for f in feats:
        if not f.get('bbox'):
            continue
        b = f['bbox']
        fo.append({'id': f['id'], 'label': f.get('label') or '', 'desc': f.get('desc') or f.get('description') or '',
                   'text': f.get('text') or '', 'text_it': f.get('text_it') or '', 'text_es': f.get('text_es') or '',
                   'box': rel(b[:2]) + rel(b[2:])})
    return out, fo, it_json


# ---------------------------------------------------------------- story & about
def parse_story():
    t = read('E_story_about.md')
    a = t.split('## A.', 1)[1].split('\n## B.', 1)[0]
    scenes = []
    for sid, body in re.findall(r'^### (\S+)\n(.*?)(?=^### |\Z)', a, re.S | re.M):
        vm = re.search(r'^visual: (.*)$', body, re.M)
        body = re.sub(r'^visual: .*$', '', body, flags=re.M)
        scenes.append({'id': sid, 'visual': vm.group(1).strip() if vm else '', 'html': block_md(body)})
    b = t.split('\n## B.', 1)[1].split('\n## C.', 1)[0]
    pages = []
    for pid, body in re.findall(r'^### (\S+)\n(.*?)(?=^### |\Z)', b, re.S | re.M):
        m = re.search(r'^#### (.*)$', body, re.M)
        pages.append({'id': pid, 'html': block_md(body)})
    d = t.split('\n## D.', 1)[1]
    note = block_md(re.sub(r'^.*?\n', '', d, count=1))
    return scenes, pages, note


def js(name, obj):
    with open(os.path.join(ROOT, 'data', name + '.js'), 'w', encoding='utf-8', newline='\r\n') as f:
        f.write('/* generated by tools/build_data.py from content/ — do not edit by hand */\n')
        f.write(f'window.FC = window.FC || {{}};\nFC.{name} = ')
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write(';\n')


def main():
    global BIB, BIB_ORDER
    BIB, BIB_ORDER = parse_biblio()
    verses = parse_verses()
    squares, feats, it_json = parse_board(verses)
    ann = parse_annotations()
    segC = parse_segments('C_part1.md') + parse_segments('C_part2.md')
    segM = parse_segments('M_additions.md')
    scenes, pages, note = parse_story()
    g_html = block_md(re.sub(r'^# .*\n', '', read('G_variants.md')))
    m_intro = md_intro('M_additions.md')
    js('board', {'squares': squares, 'features': feats, 'italian': it_json, 'verses': verses,
                 'sheet': {'w': SHEET_SIZE[0], 'h': SHEET_SIZE[1]}})
    js('text', {'C': segC, 'M': segM, 'G_html': g_html, 'M_intro': m_intro})
    js('annotations', ann)
    js('story', {'scenes': scenes, 'pages': pages, 'note': note})
    bib = [dict(BIB[k], html=inline(BIB[k]['ref'])) for k in BIB_ORDER]
    js('biblio', bib)
    missing = sorted({m for a in ann.values() for m in re.findall(r'about\.html#bib-([\w:-]+)', json.dumps(a)) if m not in BIB})
    print(f'squares {len(squares)}, features {len(feats)}, annotations {len(ann)}, '
          f'C segs {len(segC)}, M segs {len(segM)}, scenes {len(scenes)}, pages {len(pages)}, bib {len(bib)}')
    if missing:
        print('citekeys cited but not in bibliography:', missing)


if __name__ == '__main__':
    main()
