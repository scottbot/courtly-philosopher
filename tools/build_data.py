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
  board.js  text.js  annotations.js  story.js (intro scenes)  about.js (essays, note)
  biblio.js

Markup understood in annotation/about prose:
  [@key, 144]  [@a, 12; @b, 3]  [board]  [@web:https://…]      citations
  {q|key|pdfN|printedPage|exact words}                            verified short quotations
  *italic*  **bold**  `code`  [text](url)  bare https://… URLs
  *words in another language*{es}   (also {it} {la} {fr} {pt}): sets lang= on the run
  ![alt text](img/…)                an image (alone in its paragraph: a figure; any
                                    further lines of that paragraph become its caption)
  - lists  | tables |  > quotations  #### headings
  <!-- … -->                        a note for maintainers: removed before anything is built

Annotation blocks (=== id: … ===) take the fields title_en, title_es, board_it,
rule_short, table, see, why, context, variants, readings.

After the build, the pages' <script>/<link> tags get a ?v=<hash> of the file they load,
so a browser never mixes a new script with old cached data (see stamp_pages()).

Usage: python3 tools/build_data.py
"""
import hashlib, json, os, re, html, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.dont_write_bytecode = True        # no __pycache__ in the published tools/ folder
sys.path.insert(0, HERE)
from geometry import SHEET_OFFSET, SHEET_SIZE          # the board crop, shared with make_images.py

C = lambda f: os.path.join(ROOT, 'content', f)
WARN = []


def read(f):
    """A content file, with maintainers' <!-- … --> notes removed."""
    t = open(C(f), encoding='utf-8').read().replace('\r\n', '\n')
    return re.sub(r'<!--.*?-->', '', t, flags=re.S)


# ---------------------------------------------------------------- bibliography
def parse_biblio():
    txt = read('E_story_about.md')
    sec = txt.split('## C. Bibliography', 1)[1].split('\n## D.', 1)[0]
    sec += '\n' + read('bib_extra.md')      # web sources cited only in the annotations
    bib, order = {}, []
    group = ''
    for line in sec.split('\n'):
        if line.startswith('### '):
            group = re.sub(r'\s+in items\.json$', '', line[4:].strip())
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
           'debarrosFilosofiaCortesana1587': 'Barros 1587, Madrigal ed.',   # the entry itself credits the transcription
           'GameGooseLargest': 'Ciompi & Seville, giochidelloca.it',
           'FilosofiaCortesanaBarros': 'Polifemo, catalog page',
           'TarotHistoryForum': 'Tarot History Forum 2013',
           'ref:dadson1987ed': 'Dadson ed. 1987', 'ref:lucero2019ed': 'Lucero ed. 2019',
           'ref:blasco2014': 'Blasco ed. 2014', 'ref:bne2016': 'BNE facsimile 2016',
           'ref:careaga1612': 'Careaga 1612',
           # filed under "Lucero Sánchez", apart from Lucero 2019a–d: no letter needed
           'lucerosanchezAsnoPenseQue2019': 'Lucero Sánchez 2019'}
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
        # class cite-board: the introduction drops these, since the board is always in view
        return ('<a class="cite cite-board" href="about.html#about-board" data-key="ref:board" '
                'aria-expanded="false">board</a>')
    m = re.match(r'@web:(\S+)', item)
    if m:
        url = m.group(1).rstrip(',')
        b = BIB.get('web:' + url)
        lab = b['label'] if b else re.sub(r'https?://(www\.)?([^/]+).*', r'\2', url)
        return (f'<a class="cite" href="{html.escape(url)}" target="_blank" rel="noopener" '
                f'data-key="{html.escape("web:" + url)}" aria-expanded="false">{html.escape(lab)}</a>')
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
            if len(nums) > 1 and nums[0] >= 22 and nums[-1] != nums[0]:
                loc = f"pp. {nums[0] - 6}–{nums[-1] - 6}"      # a range of printed pages
            else:
                loc = pdf_to_printed(nums[0])
            href = f'text.html#pdf{nums[0]}'
    elif loc.startswith('pdf'):
        loc = 'PDF ' + loc[3:].strip()
    txt = html.escape(lab + (', ' + loc if loc else ''))
    return f'<a class="cite" href="{href}" data-key="{html.escape(key)}" aria-expanded="false">{txt}</a>'


def pages_of(loc):
    """'134–35, 140 n. 6' -> {134, 135, 140}"""
    out = set()
    for a, b in re.findall(r'(\d+)(?:\s*[–-]\s*(\d+))?', re.sub(r'n\.\s*\d+', '', loc or '')):
        a = int(a)
        if b:
            b = int(b if len(b) >= len(str(a)) else str(a)[:len(str(a)) - len(b)] + b)
            out.update(range(a, b + 1))
        else:
            out.add(a)
    return out


def same_page(cited, printed):
    """Does the citation written after a quotation cover the quotation's own page?"""
    norm = lambda s: re.sub(r'\s+', '', (s or '').replace('–', '-')).lower()
    if norm(cited) == norm(printed):
        return True
    if not re.search(r'\d', printed or ''):
        return not (cited or '').strip()          # e.g. a web page: [@key] alone
    return bool(pages_of(printed)) and pages_of(printed) <= pages_of(cited)


# A citation that repeats the quotation's own source, written straight after it:
# {q|key|…} [@key, p]   {q|key|…} (gloss) [@key, p]   "English" ({q|key|…}) [@key, p]
GLOSS = r'\((?:[^()]|\([^()]*\))*\)'


def inline(s, curly=True):
    """Markdown-ish inline markup + citations -> HTML. curly: set the edition's straight
    double quotes as “ ”; verified quotations, code, links and attributes are stashed first and
    never touched. (Off for the Spanish of other editions' readings, quoted as their editor
    prints them.)"""
    tokens = []
    def stash(h):
        tokens.append(h); return f'\x00{len(tokens) - 1}\x00'
    # code spans first: nothing inside them is markup
    s = re.sub(r'`([^`]+)`', lambda m: stash('<code>' + html.escape(m.group(1)) + '</code>'), s)
    def qrep(m):
        key, pdf, printed, text = m.group(1), m.group(2), m.group(3).strip(), m.group(4).strip()
        q = f'<q class="sq" lang="{guess_lang(text, default="en")}">{fmt(html.escape(text))}</q>'
        after = re.match(r'\s*\)?\s*(?:' + GLOSS + r'\s*)?\)?\s*\[@' + re.escape(key) +
                         r'\s*(?:,\s*([^\];]*))?(?:;[^\]]*)?\]', m.string[m.end():])
        if after and same_page(after.group(1), printed):
            return stash(q)                         # the citation written next to it is enough
        c = cite_item(f'@{key}, {printed}' if printed else f'@{key}')
        return stash(q + f' <span class="cites">({c})</span>')
    s = re.sub(r'\{q\|([^|}]+)\|pdf(\d+)\|([^|}]*)\|([^}]+)\}', qrep, s)
    def crep(m):
        inner = m.group(1)
        if '@' not in inner and inner.strip() != 'board':
            return m.group(0)
        items = [i for i in re.split(r';\s*(?=@|board)', inner) if i.strip()]
        return stash('<span class="cites">(' + '; '.join(cite_item(i) for i in items) + ')</span>')
    s = re.sub(r'\[((?:@|board)[^\]]*)\](?!\()', crep, s)
    # images and links, stashed so that later rules never see their attributes
    def irep(m):
        alt, src = m.group(1), m.group(2)
        if not re.match(r'^img/[\w./-]+$', src):
            WARN.append(f'image path not under img/: {src}')
        return stash(f'<img src="{html.escape(src)}" alt="{html.escape(alt)}" loading="lazy">')
    s = re.sub(r'!\[([^\]]*)\]\(([^)\s]+)\)', irep, s)
    # internal links to the edition's own pages: [text](atlas.html#43), [text](about.html#about-rules)
    s = re.sub(r'\[([^\]]+)\]\(((?:index|play|atlas|text|about)\.html(?:#[\w.-]+)?)\)',
               lambda m: stash(f'<a href="{html.escape(m.group(2))}">'
                               f'{fmt(html.escape(m.group(1), quote=False))}</a>'), s)
    s = re.sub(r'\[([^\]]+)\]\((https?://[^)\s]+)\)',
               lambda m: stash(f'<a href="{html.escape(m.group(2))}" target="_blank" rel="noopener">'
                               f'{fmt(html.escape(m.group(1), quote=False))}</a>'), s)
    s = re.sub(r'(?<![\w"=/])(https?://[^\s<>"\x00]+?)(?=[.,;:)\]]*(?:\s|$|<|\x00))',
               lambda m: stash(f'<a href="{html.escape(m.group(1))}" target="_blank" rel="noopener">'
                               f'{html.escape(m.group(1))}</a>'), s)
    s = html.escape(s, quote=False)
    if curly:
        s = curl(s)
    s = fmt(s)
    s = langs_in_quotes(s)
    while '\x00' in s:
        s = re.sub(r'\x00(\d+)\x00', lambda m: tokens[int(m.group(1))], s)
    return s


def curl(s):
    """Straight double quotes in the edition's own prose → “ ”."""
    return re.sub(r'(^|[\s(\[—–/-])"', r'\1“', s).replace('"', '”')


LANGS = 'es|it|la|fr|pt'


def fmt(s):
    s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
    # *words*{es}: an explicit language
    # (never across another asterisk: an earlier *italic* in the paragraph must not be swallowed)
    s = re.sub(r'(?<![\w*])\*(?!\s)([^*]+?)(?<!\s)\*\{(' + LANGS + r')\}', r'<em lang="\2">\1</em>', s)
    def em(m):
        t = m.group(1)
        lg = guess_lang(strip_tokens(t), phrase=True)
        return f'<em lang="{lg}">{t}</em>' if lg else f'<em>{t}</em>'
    s = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*{])', em, s)
    return s


def langs_in_quotes(s):
    """A passage of two or more words in another language inside plain double quotes
    ("No pidas la mano agena / si la tuya no va llena") gets its own lang."""
    def rep(m):
        lg = guess_lang(strip_tokens(m.group(2)), phrase=True)
        return f'<span lang="{lg}">{m.group(0)}</span>' if lg else m.group(0)
    return re.sub(r'(["“])([^"“”<>\x00]{6,}?)(["”])', rep, s)


def strip_tokens(t):
    return re.sub(r'\x00\d+\x00|<[^>]+>|&\w+;', ' ', t)


# Words that mark a language. Weight 2: found in that language only (among these five);
# weight 1: shared with another of them.
LANG_WORDS = {
    'es': {2: 'el los las y por porque una hay ay sólo entonces siempre está como para sus les muy sin quien donde cuando pues ni mas más ello vn esta este aquel otro otra todos señor uno ser tiene puede hasta nuestro buelue',
           1: 'que la de del al en se no con un a o mi es le lo su'},
    'it': {2: 'il gli della delle dello degli nel nella alla alle che chi di per è più ma questo questa sua suo dal dalla ne sono essere ò à anni gioco',
           1: 'la le non se un una con lo e si da del al in'},
    'la': {2: 'et est ipsum atque quae quod sed ad cum ex ab ut sunt erat enim nihil omnia deo gratias laus',
           1: 'in non per qui de'},
    'fr': {2: 'les du des et une est plus jeu oie au aux pas ne qui',
           1: 'le la de en un que'},
    'en': {2: 'the and of is to was while you without for each with this that are be by his her it which from as at or have not',
           1: 'a in no on'},
}
LANG_WORDS = {lg: {w: wt for wt, ws in d.items() for w in ws.split()} for lg, d in LANG_WORDS.items()}


def guess_lang(t, default=None, phrase=False):
    """Language of a run of text, for the lang attribute.
    phrase=True (italic runs, quoted passages in English prose): only runs of two or more
    words, and only when another language clearly wins; otherwise None, leaving the run in
    the language of the page. Single loanwords (merced, privado) are left alone."""
    low = t.lower()
    words = re.findall(r"[a-zà-ÿñ]+", low)
    if phrase and len(words) < 2:
        return None
    score = {lg: sum(d.get(w, 0) for w in words) for lg, d in LANG_WORDS.items()}
    strong = {lg: sum(2 for w in words if d.get(w) == 2) for lg, d in LANG_WORDS.items()}
    if re.search(r'[ñ¿¡]|ción\b|ciones\b', low):
        score['es'] += 3; strong['es'] += 3
    if re.search(r'zione\b|zioni\b|[àèìòù]|\b(?:l|dell|nell|all|sull|d|un)\'', low):
        score['it'] += 3; strong['it'] += 3
    if re.search(r'\b\w{3,}(?:orum|ibus|atur|untur)\b', low):
        score['la'] += 3; strong['la'] += 3
    best = max(score, key=score.get)
    if not score[best]:
        return default
    if phrase:
        if best == 'en':
            return None
        second = max(v for k, v in score.items() if k != best)
        # a clear winner, carried by at least one word found only in that language
        if strong[best] < 2 or score[best] < 2 * score['en'] or score[best] == second:
            return None
    return best


def block_md(text):
    """Block-level Markdown: paragraphs, #### headings, lists, tables, quotations, figures."""
    lines = text.strip('\n').split('\n')
    out, i = [], 0
    starts_block = r'(#{2,6} |\||>|\s*([-*]|\d+\.) )'
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
            # an empty corner cell is not a header: write it as a plain cell
            th = lambda c: f'<th scope="col">{inline(c)}</th>' if c else '<td></td>'
            # a scrollable region needs a name, and a different one for each table on a page
            heads = ', '.join(c for c in (re.sub(r'<[^>]+>', '', inline(x)).strip() for x in head) if c)
            name = html.escape(f'Table: {heads}' if heads else 'Table', quote=True)
            t = (f'<div class="table-wrap" tabindex="0" role="region" aria-label="{name}">'
                 '<table><thead><tr>' + ''.join(th(c) for c in head) + '</tr></thead><tbody>')
            t += ''.join('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in body)
            out.append(t + '</tbody></table></div>'); continue
        if re.match(r'\s*([-*]|\d+\.) ', l):
            ordered = bool(re.match(r'\s*\d+\. ', l))
            items = []
            # every non-blank line that does not start another block continues the list
            # (the annotation parser strips indentation, so continuations are not indented)
            while i < len(lines) and (re.match(r'\s*([-*]|\d+\.) ', lines[i]) or
                                      (items and lines[i].strip() and not re.match(r'(#{2,6} |\||>)', lines[i]))):
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
            t = ' '.join(q)
            lg = guess_lang(re.sub(r'\[@[^\]]*\]|\{q\|[^}]*\}|[*`]', ' ', t), phrase=True)
            attr = f' lang="{lg}"' if lg else ''
            out.append(f'<blockquote{attr}>{inline(t)}</blockquote>'); continue
        if l.strip() == '---':
            i += 1; continue
        para = [l.strip()]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(starts_block, lines[i]):
            para.append(lines[i].strip()); i += 1
        fig = re.match(r'^!\[([^\]]*)\]\(([^)\s]+)\)$', para[0])
        if fig:
            cap = ' '.join(para[1:])
            out.append(f'<figure class="md-fig">{inline(para[0])}'
                       + (f'<figcaption>{inline(cap)}</figcaption>' if cap else '') + '</figure>')
            continue
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
            for k in ('title_en', 'title_es', 'board_it'):
                a[k] = fields.get(k, '').strip()
            for k in ('title_en', 'title_es', 'board_it'):   # plain text (escaped by the page);
                a[k] = curl(a[k])                            # only the edition's own quote marks occur
            a['rule_short'] = inline(fields.get('rule_short', '').strip())
            # one sentence read aloud on the Play card (shared contract with js/play.js)
            a['table'] = inline(' '.join(fields.get('table', '').split()))
            for k in ('see', 'why', 'context', 'variants', 'readings'):
                a[k] = paras(fields.get(k, ''))
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


def parse_gvars():
    """G_variants.md: the introduction, one record per ::: gvar block, and what follows the
    last block (tables and lists). Fields WHERE, G, M, C, EN, NOTE; continuation lines
    belong to the field above them."""
    t = read('G_variants.md')
    intro = t.split('::: gvar', 1)[0]
    out = []
    for attrs, body in re.findall(r'^::: gvar (.*?)\n(.*?)\n:::\s*$', t, re.S | re.M):
        a = dict(re.findall(r'(\w+)=(\S*)', attrs))
        f, cur = {}, None
        for line in body.split('\n'):
            m = re.match(r'^(WHERE|G|M|C|EN|NOTE): ?(.*)$', line)
            if m:
                cur = m.group(1); f[cur] = m.group(2)
            elif cur:
                f[cur] += '\n' + line
        rec = {'id': a.get('id'), 'squares': [x for x in a.get('squares', '').split(',') if x and x != 'none']}
        for k, v in f.items():
            v = v.strip()
            # a field may run over several lines (EN of G-15 lists the verses): keep the lines
            rec[k.lower()] = '<br>'.join(inline(x.strip(), curly=k not in ('G', 'M', 'C')) for x in v.split('\n') if x.strip())
        rec['g_raw'] = f.get('G', '').strip()
        out.append(rec)
    tail = re.split(r'^:::\s*$', t, flags=re.M)[-1]
    return block_md(re.sub(r'^# .*\n', '', intro)), out, block_md(tail)


def g_labour_spanish(gvars):
    """G's eight Labor couplets as Lucero quotes them (G-15), in G's order, for the
    squares on which this edition lays them (see FC.sq.G_LABOUR in js/common.js).
    Copied mechanically from the G: line; the bracketed citation is removed."""
    rec = next((g for g in gvars if g['id'] == 'G-15'), None)
    if not rec:
        WARN.append('G-15 (Labor couplets of G) not found: G Labor Spanish not shown')
        return {}
    raw = re.sub(r'\s*\[@[^\]]*\]\s*$', '', rec['g_raw'])
    parts = [p.strip() for p in re.split(r'(?<=\.)\s+(?:…\s+)?', raw) if p.strip() and p.strip() != '…']
    sq = [12, 17, 23, 30, 34, 41, 48, 57]
    if len(parts) != len(sq):
        WARN.append(f'G-15 has {len(parts)} couplets, expected 8: G Labor Spanish not shown')
        return {}
    return {str(n): p for n, p in zip(sq, parts)}


# ---------------------------------------------------------------- board
def parse_board(verses):
    squares = []
    for f in ('squares_01_31.json', 'squares_32_63.json'):
        squares += json.load(open(C(f), encoding='utf-8'))
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
            'n': n, 'it': s.get('it') or '', 'es': s.get('es') or '', 'rule': s.get('rule') or '',
            'desc': s.get('image_desc') or '',
            'center': rel(s['center']), 'quad': [rel(p) for p in s['quad']],
            'it_gloss': g.get('it_gloss', ''), 'rule_en': g.get('rule_en', '')})
    return out


# ---------------------------------------------------------------- story & about
def parse_story():
    t = read('E_story_about.md')
    a = t.split('## A.', 1)[1].split('\n## B.', 1)[0]
    scenes = []
    for sid, body in re.findall(r'^### (\S+)\n(.*?)(?=^### |\Z)', a, re.S | re.M):
        body = re.sub(r'^visual: .*$', '', body, flags=re.M)   # notes for the editor; see js/story.js SCENES
        tm = re.search(r'^title: (.*)$', body, re.M)            # optional; js/story.js SCENES wins
        body = re.sub(r'^title: .*$', '', body, flags=re.M)
        scenes.append({'id': sid, 'title': curl(tm.group(1).strip()) if tm else '', 'html': block_md(body)})
    b = t.split('\n## B.', 1)[1].split('\n## C.', 1)[0]
    pages = []
    for pid, body in re.findall(r'^### (\S+)\n(.*?)(?=^### |\Z)', b, re.S | re.M):
        tm = re.search(r'^title: (.*)$', body, re.M)
        body = re.sub(r'^title: .*$', '', body, flags=re.M)
        pages.append({'id': pid, 'title': curl(tm.group(1).strip()) if tm else '', 'html': block_md(body)})
    d = t.split('\n## D.', 1)[1]
    note = block_md(re.sub(r'^.*?\n', '', d, count=1))
    return scenes, pages, note


def js(name, obj):
    with open(os.path.join(ROOT, 'data', name + '.js'), 'w', encoding='utf-8', newline='\r\n') as f:
        f.write('/* generated by tools/build_data.py from content/ — do not edit by hand */\n')
        f.write(f'window.FC = window.FC || {{}};\nFC.{name} = ')
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write(';\n')


# ---------------------------------------------------------------- cache stamps
MY_PAGES = ('index.html', 'atlas.html', 'text.html', 'about.html', '404.html')


def stamp_pages():
    """Give every local script and stylesheet a ?v=<content hash>, so that a deploy never
    serves a new page with an old cached script (GitHub Pages caches files for 10 minutes).
    Pages not in MY_PAGES are stamped only if they already use ?v= (opt in)."""
    digest = {}
    def h(path):
        if path not in digest:
            p = os.path.join(ROOT, path)
            digest[path] = hashlib.sha1(open(p, 'rb').read()).hexdigest()[:8] if os.path.exists(p) else None
        return digest[path]
    for page in sorted(os.listdir(ROOT)):
        if not page.endswith('.html'):
            continue
        p = os.path.join(ROOT, page)
        src = open(p, encoding='utf-8', newline='').read()
        if page not in MY_PAGES and '?v=' not in src:
            continue
        def rep(m):
            v = h(m.group(2))
            return f'{m.group(1)}="{m.group(2)}' + (f'?v={v}' if v else '') + '"'
        new = re.sub(r'\b(src|href)="((?:data|js|css)/[\w.-]+\.(?:js|css))(?:\?v=\w+)?"', rep, src)
        if new != src:
            open(p, 'w', encoding='utf-8', newline='').write(new)


# ---------------------------------------------------------------- checks
def check(ann, segC, segM, scenes, pages, note, gvars, bib, extra=()):
    """Problems a reader would meet: anchors that do not exist, maintainers' notes."""
    covered = set()
    for s in segC:
        a, _, b = s['pdf'].partition('-')
        if a:
            covered.update(range(int(a), int(b or a) + 1))
    blob = json.dumps([ann, segC, segM, scenes, pages, note, gvars], ensure_ascii=False)
    bad = sorted({int(n) for n in re.findall(r'text\.html#pdf(\d+)', blob)} - covered)
    if bad:
        WARN.append(f'text.html#pdfN links with no segment on that page: {bad}')
    ids = {s['id'] for s in segC} | {s['id'] for s in segM} | {g['id'] for g in gvars}
    bad = sorted({m for m in re.findall(r'text\.html#([CMG]-[\w-]+)', blob)} - ids)
    if bad:
        WARN.append(f'text.html#… links to passages that do not exist: {bad}')
    every = blob + json.dumps([bib, list(extra)], ensure_ascii=False)
    for pat, what in ((r'items\.json', 'items.json'), (r'\b(?:corpus|notes|work)/[\w./-]+\.md', 'a project file path'),
                      (r'Zotero', 'Zotero'), (r'PyMuPDF', 'a tool name')):
        n = len(re.findall(pat, every))
        if n:
            WARN.append(f'{n}× {what} in published text (wrap maintainers\' notes in <!-- -->)')


def main():
    global BIB, BIB_ORDER
    BIB, BIB_ORDER = parse_biblio()
    verses = parse_verses()
    squares = parse_board(verses)
    ann = parse_annotations()
    segC = parse_segments('C_part1.md') + parse_segments('C_part2.md')
    segM = parse_segments('M_additions.md')
    scenes, pages, note = parse_story()
    g_intro, gvars, g_tail = parse_gvars()
    g_es = g_labour_spanish(gvars)
    for g in gvars:
        g.pop('g_raw', None)
    m_intro = md_intro('M_additions.md')
    js('board', {'squares': squares, 'verses': verses, 'G_labour_es': g_es,
                 'sheet': {'w': SHEET_SIZE[0], 'h': SHEET_SIZE[1], 'crop': list(SHEET_OFFSET)}})
    js('text', {'C': segC, 'M': segM, 'G_intro': g_intro, 'G': gvars, 'G_tail': g_tail, 'M_intro': m_intro})
    js('annotations', ann)
    js('story', {'scenes': scenes})
    js('about', {'pages': pages, 'note': note})
    bib = [dict(BIB[k], html=inline(BIB[k]['ref'])) for k in BIB_ORDER]
    js('biblio', bib)
    stamp_pages()
    missing = sorted({m for a in ann.values() for m in re.findall(r'about\.html#bib-([\w:-]+)', json.dumps(a)) if m not in BIB})
    print(f'squares {len(squares)}, annotations {len(ann)}, C segs {len(segC)}, M segs {len(segM)}, '
          f'G readings {len(gvars)}, scenes {len(scenes)}, pages {len(pages)}, bib {len(bib)}')
    if missing:
        print('citekeys cited but not in bibliography:', missing)
    check(ann, segC, segM, scenes, pages, note, gvars, bib, (g_intro, g_tail, m_intro))
    for w in WARN:
        print('warning:', w)


if __name__ == '__main__':
    main()
