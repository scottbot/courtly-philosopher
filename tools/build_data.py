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
plain/ (generated) index.html book.html squares.html play.html about.html: the same text as
  static pages that need no JavaScript (see write_plain()); styled by css/plain.css

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

Content is treated as untrusted: ids and attributes are restricted to safe characters, web
citations must be http(s) addresses, images must lie under img/, and a NUL character stops the
build. Exit status 1 if anything was warned about (a warning is something a reader would meet).

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
    if '\x00' in t:            # the inline parser uses NUL as its own marker (and a NUL would hang it)
        sys.exit(f'content/{f}: contains a NUL character; remove it')
    return re.sub(r'<!--.*?-->', '', t, flags=re.S)


ATTR_OK = re.compile(r'^[\w.,:?–-]*$')


def attrs_of(s, where):
    """key=value attributes of a ::: seg / ::: gvar line. The values become HTML ids and
    attributes, so they may hold only letters, digits and . , : ? – -"""
    a = dict(re.findall(r'(\w+)=(\S*)', s))
    bad = {k: v for k, v in a.items() if not ATTR_OK.match(v)}
    if bad:
        sys.exit(f'{where}: attribute values may contain only letters, digits and . , : ? – - ; found {bad}')
    return a


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
        if not re.match(r'^[\w:./?=&%#~()+-]+$', key):
            sys.exit(f'bibliography key {key!r} has a character that is not allowed')
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
           # names the automatic rule cannot split (initials, three authors)
           'web:https://hdl.handle.net/11441/163180': 'Basulto et al. 2006',
           'web:https://ifc.dpz.es/recursos/publicaciones/25/27/13baltarrodriguez.pdf': 'Baltar Rodríguez 2001–2002',
           'ref:kubersky2011': 'Kubersky-Piredda & Salort Pons 2011',
           'web:https://e-archivo.uc3m.es/entities/publication/fd72eda9-ff37-4e59-96fa-81112999a5df': 'Reher & Ballesteros 1993',
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
G_LABOUR_ES = {}


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
    m = re.match(r'@web:(\S+?),?(?:\s+(.+))?$', item)
    if m:
        url = m.group(1).rstrip(',')
        wloc = (m.group(2) or '').strip()
        if not re.match(r'https?://[^\s"<>]+$', url):
            WARN.append(f'web citation is not an http(s) address (shown as text): {url}')
            return html.escape(item)
        b = BIB.get('web:' + url)
        lab = b['label'] if b else re.sub(r'https?://(www\.)?([^/]+).*', r'\2', url)
        shown = lab + (', ' + wloc if wloc else '')   # the page or passage cited, after the label
        return (f'<a class="cite" href="{html.escape(url)}" target="_blank" rel="noopener" '
                f'data-key="{html.escape("web:" + url)}" aria-expanded="false">{html.escape(shown)}</a>')
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
        if not re.match(r'^img/[\w./-]+$', src) or '..' in src:
            WARN.append(f'image path not under img/ (not shown): {src}')
            return stash(html.escape(m.group(0)))
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
    # a field with blank lines between paragraphs is wrapped Markdown, even if one of its
    # lines is long; without blank lines, a line over 600 characters marks one paragraph per line
    if '' not in lines[1:-1] and max((len(l) for l in lines), default=0) > 600:
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
        a = attrs_of(attrs, f'content/{fname}, ::: seg {attrs}')
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
        a = attrs_of(attrs, f'content/G_variants.md, ::: gvar {attrs}')
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
    # the tail's "## " headings would be h1; on the Book page they sit inside its own sections
    tail = re.sub(r'<(/?)h1>', r'<\1h3>', block_md(tail))
    return block_md(re.sub(r'^# .*\n', '', intro)), out, tail


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
def safe_id(i):
    """Scene and essay ids become HTML ids and links: a-z, 0-9 and - only."""
    if not re.match(r'^[a-z0-9-]+$', i):
        sys.exit(f'E_story_about.md: section id {i!r} may contain only a–z, 0–9 and -')
    return i


def parse_story():
    t = read('E_story_about.md')
    a = t.split('## A.', 1)[1].split('\n## B.', 1)[0]
    scenes = []
    for sid, body in re.findall(r'^### (\S+)\n(.*?)(?=^### |\Z)', a, re.S | re.M):
        safe_id(sid)
        body = re.sub(r'^visual: .*$', '', body, flags=re.M)   # notes for the editor; see js/story.js SCENES
        tm = re.search(r'^title: (.*)$', body, re.M)            # optional; js/story.js SCENES wins
        body = re.sub(r'^title: .*$', '', body, flags=re.M)
        scenes.append({'id': sid, 'title': curl(tm.group(1).strip()) if tm else '', 'html': block_md(body)})
    b = t.split('\n## B.', 1)[1].split('\n## C.', 1)[0]
    pages = []
    for pid, body in re.findall(r'^### (\S+)\n(.*?)(?=^### |\Z)', b, re.S | re.M):
        safe_id(pid)
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


# ---------------------------------------------------------------- book pages and leaves
# The Vienna copy's scan: pdf 7 is the title page (A1r), two scan pages per leaf; gatherings
# A and B have 12 leaves, then C. True page numbers count the title page as p. 1 (printed
# numbers start at 16 on A8v, pdf 22; pdf 54 is misprinted "38" for 48). Same rule as js/text.js.
BOOK_FIRST, BOOK_LAST = 7, 70
def leaf_of(n):
    if not BOOK_FIRST <= n <= BOOK_LAST:
        return ''
    l = (n - BOOK_FIRST) // 2
    return 'ABC'[l // 12] + str(l % 12 + 1) + ('v' if (n - BOOK_FIRST) % 2 else 'r')
def page_of(n):
    return n - BOOK_FIRST + 1 if BOOK_FIRST <= n <= 69 else 0


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


# ---------------------------------------------------------------- plain pages (no JavaScript)
# plain/*.html: the edition's text as static pages, for readers, printers, archives and text
# extractors that do not run scripts. They are written from the same parsed content as data/*.js.
# A few things exist only in the runtime pages (the draft notice, the credits, the scene and essay
# titles, the footer credit line, the version); they are read from those files, so that the plain
# pages always say the same, and the build warns if one cannot be found.
PLAIN_CSP = ("default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; "
             "object-src 'none'; base-uri 'none'; form-action 'none'")
PLAIN_PAGES = (('index.html', 'index.html', 'Start'), ('book.html', 'text.html', 'The Book'),
               ('squares.html', 'atlas.html', 'The Squares'), ('play.html', 'play.html', 'Playing at a table'),
               ('about.html', 'about.html', 'About and credits'))
PLAIN_FULL = {   # what the runtime page is, and what the plain page leaves out
    'index.html': ('the edition’s introduction', 'the same text, without the board that moves with it'),
    'book.html': ('the edition’s Book page', 'the same text, with every edition shown at once and the translator’s notes always shown'),
    'squares.html': ('the edition’s Squares page', 'the same text, without the clickable board'),
    'play.html': ('the edition’s Play page, where the game is played on screen', 'the rules and the board for a game with real dice'),
    'about.html': ('the edition’s About page', 'the same text, without the citation pop-ups'),
}
LABOUR = (4, 12, 17, 23, 30, 34, 41, 48, 57)           # the oxen (FC.sq.LABOUR in js/common.js)
G_LABOUR = {12: 'g1', 17: 'g2', 23: 'g3', 30: 't5', 34: 't7', 41: 'g6', 48: 't4', 57: 't3'}   # FC.EDITION_RULES.G
FEATURES = (('gate', 'entrance_gate'), ('labour', None), ('corner-swan', 'corner_bl_swan'),
            ('corner-dolphin', 'corner_tl_figure'), ('corner-occasion', 'corner_tr_figure'),
            ('corner-clock', 'corner_br_clock'), ('centre-sea', 'field'), ('centre-man', 'palm_man'),
            ('title', 'signature'), ('plain', None))      # atlas.js FEATURES, common.js FC.FEATURES
# used only if the runtime files cannot be read (the build then warns)
DRAFT_FALLBACK = ('<h2 id="ai-notice-title">An AI-produced draft</h2><p><b>It is a draft.</b> No specialist has '
                  'reviewed it. It should not be trusted, cited or taken as scholarship until that review has happened.</p>')


def site_text(rel):
    try:
        return open(os.path.join(ROOT, rel), encoding='utf-8').read()
    except OSError:
        return ''


def grab(rel, pat, what, flags=re.S):
    m = re.search(pat, site_text(rel), flags)
    if not m:
        WARN.append(f'plain pages: {what} not found in {rel}')
        return None
    return m.group(1)


def js_strings(src):
    """'key': 'value' pairs of a JavaScript object literal (single-quoted strings only)."""
    return {k: v.replace("\\'", "'") for k, v in re.findall(r"'([\w-]+)':\s*'((?:[^'\\]|\\.)*)'", src or '')}


def version():
    v = grab('js/common.js', r"FC\.VERSION\s*=\s*'([^']+)'", 'FC.VERSION')
    d = grab('js/common.js', r"FC\.VERSION_DATE\s*=\s*'([^']+)'", 'FC.VERSION_DATE')
    return v or '', d or ''


def from_template(h, what):
    """HTML copied out of a JavaScript template literal: fill in the version, refuse anything else."""
    v, d = version()
    h = re.sub(r'\$\{\s*(?:esc\()?FC\.VERSION_DATE\)?\s*\}', lambda m: d, h)
    h = re.sub(r'\$\{\s*(?:esc\()?FC\.VERSION\)?\s*\}', lambda m: v, h)
    # ${here ? esc(here) : 'at the address where you read it'}: a value only the browser knows; take the fallback
    h = re.sub(r"\$\{[^{}]*\?[^{}]*:\s*'([^'{}]*)'\s*\}", lambda m: m.group(1), h)
    if '${' in h:
        WARN.append(f'plain pages: {what} has a ${{…}} expression the build cannot fill in; it was left out')
        h = re.sub(r'\$\{[^}]*\}', '', h)
    return h


def jpeg_size(rel):
    """(width, height) of a baseline or progressive JPEG under the site root, or None."""
    try:
        with open(os.path.join(ROOT, rel), 'rb') as f:
            b = f.read(1 << 16)
    except OSError:
        return None
    i = 2
    while i + 9 < len(b):
        if b[i] != 0xFF:
            return None
        mk, ln = b[i + 1], int.from_bytes(b[i + 2:i + 4], 'big')
        if mk in (0xC0, 0xC1, 0xC2):
            return int.from_bytes(b[i + 7:i + 9], 'big'), int.from_bytes(b[i + 5:i + 7], 'big')
        i += 2 + ln
    return None


def plain_pic(src, alt, lazy=True):
    """<picture> with the AVIF and WebP twins, for a JPEG under img/ (path from the site root)."""
    if not os.path.exists(os.path.join(ROOT, src)):
        WARN.append(f'plain pages: image missing: {src}')
        return ''
    wh = jpeg_size(src)
    size = f' width="{wh[0]}" height="{wh[1]}"' if wh else ''
    base = '../' + src[:-4]
    lz = ' loading="lazy"' if lazy else ''
    return (f'<picture><source type="image/avif" srcset="{base}.avif"><source type="image/webp" srcset="{base}.webp">'
            f'<img src="{base}.jpg" alt="{html.escape(alt)}"{size}{lz}></picture>')


def plain_links(h):
    """Links of the runtime pages → the plain pages beside them (plain/), images → ../img/."""
    h = re.sub(r'\b(href|src|srcset)="img/', r'\1="../img/', h)
    h = re.sub(r'href="text\.html(?=[#"])', 'href="book.html', h)
    h = re.sub(r'href="atlas\.html#(?:sq)?([\w-]+)"', r'href="squares.html#\1"', h)
    h = h.replace('href="atlas.html"', 'href="squares.html"')
    h = re.sub(r' aria-expanded="false"| data-key="[^"]*"', '', h)       # citation pop-ups need scripts
    return re.sub(r' style="[^"]*"', '', h)                              # the plain pages allow no inline style


def plain_es(t, kind):
    """Spanish of the book: escaped, *italic* runs of the transcription, verse lines (as body() in js/text.js)."""
    h = html.escape(t)
    h = re.sub(r'(^|[\s(«“])\*(?!\s)([^*]+?)\*(?=[\s.,;:)»”]|$)', r'\1<em>\2</em>', h)
    return h.replace(' / ', '<br>') if kind == 'verse' else h


def pdf_range(pdf):
    a, _, b = str(pdf).partition('-')
    return list(range(int(a), int(b or a) + 1)) if a.isdigit() else []


def write_plain(squares, verses, ann, segC, segM, g_intro, gvars, g_tail, m_intro, scenes, pages, note, bib):
    E = html.escape
    out_dir = os.path.join(ROOT, 'plain')
    os.makedirs(out_dir, exist_ok=True)
    stamp = lambda rel: hashlib.sha1(open(os.path.join(ROOT, rel), 'rb').read()).hexdigest()[:8]
    ver, ver_date = version()

    draft = grab('js/common.js', r'const TEXT = `(.*?)<form method="dialog">', 'the draft notice') or DRAFT_FALLBACK
    draft = re.sub(r'<h2 id="ai-notice-title">(.*?)</h2>', r'<p class="notice-title" id="ai-notice-title">\1</p>',
                   from_template(draft, 'the draft notice'))
    credit = grab('index.html', r'<footer class="site-footer"><div class="wrap">\s*<p>(.*?)</p>', 'the footer credit line') \
        or ('Board © The Trustees of the British Museum, reproduced under license. <b>An AI-produced draft, '
            'not reviewed by a specialist.</b>')

    def page(name, title, body, desc):
        full = dict((p, f) for p, f, _ in PLAIN_PAGES)[name]
        nav = ''.join(f'<a href="{p}"' + (' aria-current="page"' if p == name else '') + f'>{E(t)}</a>'
                      for p, _, t in PLAIN_PAGES)
        vline = f' Version {E(ver)}' + (f', {E(ver_date)}' if ver_date else '') + '.' if ver else ''
        doc = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
               '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
               f'<meta http-equiv="Content-Security-Policy" content="{PLAIN_CSP}">\n'
               '<meta name="robots" content="noindex">\n'
               f'<title>{E(title)} — Filosofía cortesana (plain version)</title>\n'
               f'<meta name="description" content="{E(desc)}">\n'
               f'<link rel="stylesheet" href="../css/fonts.css?v={stamp("css/fonts.css")}">\n'
               f'<link rel="stylesheet" href="../css/plain.css?v={stamp("css/plain.css")}">\n'
               '</head>\n<body>\n<a class="skip" href="#main">Skip to content</a>\n'
               '<header class="plain-head"><p class="brand"><a href="index.html"><i>Filosofía cortesana</i></a>'
               ' <span>plain version, without JavaScript</span></p>\n'
               f'<nav aria-label="Plain pages">{nav}</nav></header>\n'
               f'<aside class="notice" aria-labelledby="ai-notice-title">{draft}</aside>\n'
               f'<main id="main">\n<h1>{E(title)}</h1>\n'
               f'<p class="fullver">This page needs no JavaScript. It is the plain version of <a href="../{full}">'
               f'{PLAIN_FULL[name][0]}</a>, which does, and gives {PLAIN_FULL[name][1]}.</p>\n'
               f'{body}\n</main>\n'
               f'<footer class="plain-foot"><p>{credit}</p>\n'
               f'<p><a href="about.html#credits">Credits, rights and how to cite</a> · <a href="about.html#note">How this '
               f'edition was made</a>.{vline}</p></footer>\n</body>\n</html>\n')
        doc = plain_links(doc)
        for pat in (r'<script', r'\son\w+=', r'javascript:', r'<!--', r'/home/|/mnt/|/tmp/', r'items\.json|Zotero'):
            if re.search(pat, doc, re.I):
                WARN.append(f'plain/{name}: contains {pat!r}')
        with open(os.path.join(out_dir, name), 'w', encoding='utf-8', newline='\r\n') as f:
            f.write(doc)

    def credit_img(src, alt, cap):
        p = plain_pic(src, alt)
        return f'<figure>{p}<figcaption>{cap}</figcaption></figure>' if p else ''

    bm = 'Detail of Mario Cartaro’s board (Naples 1588). © The Trustees of the British Museum.'

    # ---- index: what the edition is, the notice (above), the plain pages, the introduction
    lede = grab('index.html', r'<p class="lede">(.*?)</p>', 'the introduction’s opening paragraph') or ''
    titles = {k: v.replace("\\'", "'") for k, v in re.findall(
        r"'([\w-]+)':\s*\{\s*title:\s*'((?:[^'\\]|\\.)*)'",
        grab('js/story.js', r'const SCENES = \{(.*?)\n  \};', 'the scene titles (SCENES)') or '')}
    b = [f'<p class="lede">{lede}</p>' if lede else '',
         credit_img('img/board/board-1200.jpg', 'The board of the Filosofía cortesana, engraved by Mario Cartaro, Naples 1588: '
                    'a track of 63 numbered squares running round and inward to a palm at the center, with emblematic '
                    'figures in the corners.',
                    'Mario Cartaro, Naples 1588. British Museum 1869,0410.2463.+. © The Trustees of the British Museum, '
                    'reproduced under license. <a href="../img/board/board-full.jpg">The full-resolution photograph</a>.'),
         '<h2 id="pages">The plain pages</h2><ul class="pagelist">'
         '<li><a href="book.html">The Book</a>: Barros’s text of 1588, Spanish and English passage by passage, with the '
         'Madrid passages of 1587 and the known readings of the first edition.</li>'
         '<li><a href="squares.html">The Squares</a>: every square and figure of the board, with its verses, its rule '
         'and its notes.</li>'
         '<li><a href="play.html">Playing at a table</a>: the board, the rules and a table of what each square does, '
         'for a game with real dice.</li>'
         '<li><a href="about.html">About and credits</a>: the essays, how the edition was made, the bibliography, '
         'and the credits and rights.</li></ul>',
         '<h2 id="story">Introduction</h2>']
    for sc in scenes:
        t = sc['title'] or titles.get(sc['id'], '')
        b.append(f'<section class="scene" id="{E(sc["id"])}">' + (f'<h3>{E(t)}</h3>' if t else '') + f'{sc["html"]}</section>')
    page('index.html', 'Filosofía cortesana', '\n'.join(b),
         'Alonso de Barros’s board game of the court of Philip II (1587), and its only surviving board (Naples 1588): '
         'plain version, without JavaScript.')

    # ---- the book
    after = {}
    cids = [c['id'] for c in segC]
    for m in segM:                                     # where js/text.js places each Madrigal passage
        key = m['replaces']
        if re.match(r'^pdf\d+', key):
            n = int(re.sub(r'\D', '', key)[:4] or 0)
            key = next((c['id'] for c in segC if n in pdf_range(c['pdf'])), cids[-1])
        if key not in cids:
            key = cids[-1]
        after.setdefault(key, []).append(m)

    def sq_links(tags):
        return ''.join(f' · <a href="squares.html#{x}">square {x}</a>' for x in tags if x.isdigit())

    def cols(es, en, kind):
        en_h = plain_es_en(en) if kind == 'verse' else en
        return (f'<div class="cols"><div class="es" lang="es">{plain_es(es, kind)}</div>'
                f'<div class="en">{en_h}</div></div>')

    def plain_es_en(h):                    # English verse: already HTML; only the line breaks
        return h.replace(' / ', '<br>')

    toc = grab('text.html', r'<nav class="book-toc[^"]*"[^>]*>.*?(<ol>.*?</ol>)', 'the book’s table of contents') or ''
    b = ['<p>The text of the Naples edition of 1588, the one issued with the surviving board, transcribed from the '
         'Vienna copy (Österreichische Nationalbibliothek, 35 V 49, digitized by Google Books), with an English translation, '
         'passage by passage. Each passage gives its page and links to the page image. Passages of the Madrid edition of '
         'Pedro Madrigal (1587) that are not in the Naples edition are given in place, marked “Madrid 1587”; their Spanish '
         'is from the modernized transcription by Luigi Ciompi and Adrian Seville. The <a href="#first-edition">readings '
         'known of the first edition</a> (Madrid 1587, widow of Alonso Gómez) follow the text. Translator’s notes are set '
         'below the passages they concern.</p>']
    if toc:
        b.append(f'<nav class="toc" aria-label="Parts of the book">{toc}</nav>')
    b.append('<h2 id="naples">The Naples edition of 1588</h2>')
    seen = set()
    for s in segC:
        pp = pdf_range(s['pdf'])
        b.append(''.join(f'<span id="pdf{p}"></span>' + (f'<span id="p{page_of(p)}"></span>' if page_of(p) else '') +
                         (f'<span id="leaf-{leaf_of(p)}"></span>' if leaf_of(p) else '') for p in pp if p not in seen))
        seen.update(pp)
        lv = leaf_of(pp[0]) + ('' if leaf_of(pp[-1]) == leaf_of(pp[0]) else '–' + leaf_of(pp[-1])) if pp else ''
        where = ' · '.join(x for x in (f'p. {E(s["page"])}' if s['page'] else '', f'leaf {E(lv)}' if lv else '') if x)
        imgs = ', '.join(f'<a href="../img/book/p{p:03d}.jpg">{p}</a>' for p in pp
                         if os.path.exists(os.path.join(ROOT, f'img/book/p{p:03d}.jpg')))
        loc = (f'<p class="loc">{E(s["id"])}' + (f' · {where}' if where else '') +
               (f' · page image{"s" if len(pp) > 1 else ""} (PDF page{"s" if len(pp) > 1 else ""} {imgs})' if imgs else '') +
               sq_links(s['squares']) + '</p>')
        k = s['kind']
        h = f'<section class="seg seg-{E(k)}" id="{E(s["id"])}">{loc}'
        if k == 'description':
            h += f'<p class="desc">{s["en"]}</p>'
        elif k == 'heading':
            h += f'<div class="cols"><h3 class="es" lang="es">{plain_es(s["es"], k)}</h3><h3 class="en">{s["en"]}</h3></div>'
        else:
            h += cols(s['es'], s['en'], k)
            if s['lit']:
                h += f'<p class="lit">Literally: {E(s["lit"])}</p>'
        if s['note']:
            h += f'<div class="tnote"><p class="tnote-h">Translator’s note</p><p>{s["note"]}</p></div>'
        b.append(h + '</section>')
        for m in after.get(s['id'], []):
            mh = (f'<section class="seg m-add" id="{E(m["id"])}"><p class="badge">Madrid 1587 (Pedro Madrigal), fol. '
                  f'{E(m["fol"])}: Spanish from the modernized transcription by Luigi Ciompi and Adrian Seville; English '
                  f'translated from it{sq_links(m["squares"])}</p>' + cols(m['es'], m['en'], m['kind']))
            if m['note']:
                mh += f'<div class="tnote"><p class="tnote-h">Translator’s note</p><p>{m["note"]}</p></div>'
            b.append(mh + '</section>')
    b.append(f'<h2 id="madrigal">About the Madrid edition of Pedro Madrigal (1587)</h2>{m_intro}')
    g_notice = grab('js/text.js', r'<p class="notice">(No image or transcription of the first edition.*?)</p>',
                    'the first-edition notice')
    b.append('<h2 id="first-edition">The first edition (Madrid 1587, widow of Alonso Gómez)</h2>' +
             (f'<p class="notice-inline">{from_template(g_notice, "the first-edition notice")}</p>' if g_notice else '') + g_intro)
    for g in gvars:
        rows = ''.join(f'<dt>{lab}</dt><dd' + (' lang="es"' if k != 'en' else '') + f'>{g[k]}</dd>'
                       for k, lab in (('g', 'Madrid 1587, first edition (G)'), ('m', 'Madrid 1587, Madrigal (M)'),
                                      ('c', 'Naples 1588 (C)'), ('en', 'English')) if g.get(k))
        b.append(f'<section class="seg g-var" id="{E(g["id"])}"><p class="loc">{E(g["id"])} · <b>{g.get("where", "")}</b>'
                 f'{sq_links(g["squares"])}</p><dl class="g-rows">{rows}</dl>' +
                 (f'<div class="tnote"><p>{g["note"]}</p></div>' if g.get('note') else '') + '</section>')
    b.append(g_tail)
    page('book.html', 'The Book', '\n'.join(b),
         'Alonso de Barros, Filosofía cortesana moralizada (Naples 1588): Spanish transcription and English translation, '
         'with the Madrid 1587 variants; plain version, without JavaScript.')

    # ---- the squares
    VID = {1: 's1', **{n: f't{i}' for i, n in enumerate(LABOUR)}, **{n: f'h{n}' for n in range(1, 64) if f'h{n}' in verses}}
    cite_g = cite_item('@sanchezEdicionesAntiguasFilosofia2016oct16, 187–88')

    def lines(t):
        return E(t).replace(' / ', '<br>')

    def sect(t, body):
        return f'<h3>{t}</h3>{body}' if body else ''

    def barros(tags):
        segs = [s for s in segC if s['kind'] != 'rules' and any(x in tags for x in s['squares'])]
        if not segs:
            return ''
        h = (f'<p class="small">Barros’s own explanation, from the Naples 1588 book (Spanish as printed; English '
             f'translation by this edition). <a href="book.html#{E(segs[0]["id"])}">Read it in the whole book</a>.</p>')
        for s in segs:
            meta = f'p. {E(s["page"])}' if s['page'] else f'leaf {E(s["sig"])}'
            en = s['en'].replace(' / ', '<br>') if s['kind'] == 'verse' else s['en']
            h += (f'<div class="barros-seg"><p class="loc">{meta} · Naples 1588 · <a href="book.html#{E(s["id"])}">'
                  f'{E(s["id"])}</a></p><div class="cols"><div class="es" lang="es">{plain_es(s["es"], "verse")}</div>'
                  f'<div class="en">{en}</div></div></div>')
        return h

    def entry(a, key, n=None):
        d = squares[n - 1] if n else None
        title = (f'{n}. ' if n else '') + a['title_en']
        sub = [f'<span lang="es">{E(a["title_es"])}</span>' if a.get('title_es') and a['id'] != 'plain' else '',
               f'<span lang="it">{E(a["board_it"])}</span>' if a.get('board_it') and not a['board_it'].startswith('(none')
               and a['id'] != 'plain' else '']
        h = f'<section class="square" id="{E(key)}"><h2>{E(title)}</h2>'
        if any(sub):
            h += '<p class="sub">' + ' · '.join(x for x in sub if x) + '</p>'
        img = f'img/sq/detail-{n:02d}.jpg' if n else dict(FEATURES).get(key) and f'img/feat/{dict(FEATURES)[key]}.jpg'
        if key == 'labour':
            img = 'img/sq/detail-04.jpg'
        if img:
            h += credit_img(img, f'{a["title_en"]}: detail of the board', bm)
        if n == 60:
            h += ('<p class="notice-inline">In the first edition Poverty stands on 59, so under that edition’s rules this '
                  'square is plain. On the surviving board (and in the later editions) it is Poverty.</p>')
        vid = VID.get(n) if n else None
        v = verses.get(vid) if vid else None
        if v:
            h += f'<div class="verse"><p class="en">{lines(v["en"])}</p><p class="lit">Literally: {E(v["lit"])}</p><dl>'
            if d.get('es'):
                h += f'<dt>Spanish, on the board</dt><dd lang="es">{lines(d["es"])}</dd>'
            if d.get('it'):
                h += (f'<dt>Italian, on the board</dt><dd><span lang="it">{lines(d["it"])}</span>' +
                      (f'<br><span class="small">({E(d["it_gloss"])})</span>' if d.get('it_gloss') else '') + '</dd>')
            es_book = re.sub(r'\s*\((?:1587 )?princeps only\)', '', v['es'])
            h += f'<dt>Spanish, Naples 1588 book</dt><dd lang="es">{lines(es_book)}</dd>'
            mv = next((m for m in segM if m['kind'] == 'verse' and str(n) in m['squares']), None)
            if mv:
                h += (f'<dt>Spanish, Madrid 1587 (Madrigal), in Ciompi and Seville’s modernized transcription</dt>'
                      f'<dd lang="es">{lines(mv["es"])}</dd>')
            if n in G_LABOUR and n in G_ES:
                gv = verses.get(G_LABOUR[n], {})
                h += (f'<dt>Madrid 1587, first edition, as quoted by Lucero Sánchez <span class="cites">({cite_g})</span>'
                      f'{"; this couplet only in the first edition" if G_LABOUR[n].startswith("g") else ""}</dt>'
                      f'<dd><span lang="es">{E(G_ES[n])}</span>' +
                      (f'<br>{lines(gv["en"])}' if gv.get('en') else '') + '</dd>')
            h += '</dl></div>'
        if a.get('rule_short') or (d and d.get('rule')):
            h += f'<div class="rulebox"><p><b>Rule.</b> {a.get("rule_short", "")}</p>'
            if d and d.get('rule'):
                h += (f'<p class="small">On the board: <i lang="it">{E(d["rule"])}</i>' +
                      (f' — {E(d["rule_en"])}' if d.get('rule_en') else '') + '</p>')
            h += '</div>'
        h += sect('What you see', a.get('see', ''))
        h += sect('Why it is here', a.get('why', ''))
        tags = [str(n)] if n else {'gate': ['gate'], 'labour': ['labour', 'labor']}.get(key, [])
        h += sect('What Barros says', barros(tags))
        if n:
            madr = [m for m in segM if m['kind'] != 'rules' and str(n) in m['squares']]
            if madr:
                h += ('<p class="small">In the Madrid (Madrigal) edition of 1587: ' + ', '.join(
                    f'<a href="book.html#{E(m["id"])}">fol. {E(m["fol"])}</a>' for m in madr) + '.</p>')
        h += sect('Historical context', a.get('context', ''))
        h += sect('Differences between the editions', a.get('variants', ''))
        h += sect('What scholars say', a.get('readings', ''))
        if n in LABOUR:
            h += '<p><a href="#labour">About all nine Labor squares</a></p>'
        return h + '</section>'

    G_ES = {int(k): v for k, v in (G_LABOUR_ES or {}).items()}
    b = ['<p>Every square of the only surviving board, Mario Cartaro’s of Naples 1588, with its picture, its verses in '
         'Spanish and Italian with an English rendering, the rule it imposes, what Barros says about it, and what '
         'historians have found; then the figures around the track. The verses and rules are those of the Naples '
         'edition, with the first edition’s Labor couplets where they differ. Squares without a picture are '
         '<a href="#plain">plain squares</a>.</p>',
         '<nav class="toc" aria-label="Squares"><p>' + ' '.join(f'<a href="#{n}">{n}</a>' for n in range(1, 64)) +
         '</p><p>' + ' · '.join(f'<a href="#{k}">{E(ann[k]["title_en"])}</a>' for k, _ in FEATURES if k in ann) + '</p></nav>',
         '<h2 id="squares" class="part">The squares</h2>']
    for n in range(1, 64):
        a = ann.get(f'sq{n}')
        if a:
            b.append(entry(a, str(n), n))
            continue
        d = squares[n - 1]
        h = f'<section class="square square-plain" id="{n}"><h2>{n}. A plain square</h2>'
        if n == 59:
            h += ('<p class="notice-inline">In the first edition (Madrid, widow of Alonso Gómez, 1587) Poverty stands on '
                  'square <b>59</b>, not 60; the board printed with that edition is lost. See <a href="#60">square 60</a>.</p>')
        if d.get('desc'):
            h += f'<p>On the board: {E(d["desc"])}</p>'
        b.append(h + '<p><a href="#plain">About the plain squares</a></p></section>')
    b.append('<h2 id="around" class="part">Around the track</h2>')
    done = set()
    for k, _ in FEATURES:
        if k in ann:
            b.append(entry(ann[k], k)); done.add(k)
    for k, a in ann.items():                                    # any figure the lists above do not name
        if not k.startswith('sq') and k not in done:
            b.append(entry(a, k))
    page('squares.html', 'The Squares', '\n'.join(b),
         'Every square and figure of Mario Cartaro’s board for the Filosofía cortesana (Naples 1588), with verses, '
         'translations, rules and notes; plain version, without JavaScript.')

    # ---- playing at a table
    rules = next((p for p in pages if p['id'] == 'about-rules'), None)
    rows = []
    def row(label, a, d=None):
        brd = (f'<i lang="it">{E(d["rule"])}</i>' + (f' — {E(d["rule_en"])}' if d.get('rule_en') else '')) if d and d.get('rule') else ''
        return (f'<tr><th scope="row">{label}</th><td data-label="Name">{E(a["title_en"].split(" (")[0])}</td>'
                f'<td data-label="What happens">{a.get("rule_short", "")}</td>'
                f'<td data-label="On the board">{brd}</td></tr>')
    if 'gate' in ann:
        rows.append(row('<a href="squares.html#gate">gate</a>', ann['gate']))
    for n in range(1, 64):
        a = ann.get(f'sq{n}')
        if a:
            rows.append(row(f'<a href="squares.html#{n}">{n}</a>', a, squares[n - 1]))
    plain_rule = ann.get('plain', {}).get('rule_short', '')
    b = ['<p>Barros’s game was played on a printed sheet spread on a table, with dice, a marker for each player and '
         'stakes paid into a pot, while the little book explained each square. To play it that way, print the board '
         'below or show it on a screen, and use two dice (this edition’s choice; see “How many dice” below), a '
         'different marker for each player, and counters or coins for the stakes. The rules follow, with the choices '
         'this edition makes where the sources leave gaps, and then a table of what each square does.</p>',
         credit_img('img/board/board-2000.jpg', 'Mario Cartaro’s board for the Filosofía cortesana, Naples 1588, '
                    'for play: 63 numbered squares from the gate at bottom left to the palm at the center.',
                    'Mario Cartaro, Naples 1588. British Museum 1869,0410.2463.+. © The Trustees of the British Museum, '
                    'reproduced under license. <a href="../img/board/board-full.jpg">The full-resolution photograph</a>, '
                    'for printing large.')]
    if rules:
        b.append(f'<h2 id="rules">{E(rules.get("title") or "How the game is played")}</h2>{rules["html"]}')
    else:
        WARN.append('plain pages: the essay about-rules was not found')
    b.append('<h2 id="squares-table">What each square does</h2>'
             '<p>The rules of the Naples edition and its board, with this edition’s choices where the sources are silent. '
             'In the first edition (Madrid 1587, widow of Alonso Gómez) Poverty stands on 59, and 60 is plain.'
             + (f' Every other square is plain. On a plain square: {plain_rule}' if plain_rule else '') + '</p>'
             '<div class="table-wrap" tabindex="0" role="region" aria-label="Table: what each square does"><table class="sqtable">'
             '<thead><tr><th scope="col">Square</th><th scope="col">Name</th><th scope="col">What happens</th>'
             '<th scope="col">On the board</th></tr></thead><tbody>' + ''.join(rows) + '</tbody></table></div>')
    page('play.html', 'Playing at a table', '\n'.join(b),
         'How to play Barros’s Filosofía cortesana with real dice: the board, the rules, and what each square does; '
         'plain version, without JavaScript.')

    # ---- about: essays, how the edition was made, bibliography, credits
    about_js = site_text('js/about.js')
    ttl = js_strings(grab('js/about.js', r'const TITLES = \{(.*?)\};', 'the essay titles (TITLES)'))
    order = re.findall(r"'([\w-]+)'", grab('js/about.js', r'const ORDER = \[(.*?)\];', 'the essay order (ORDER)') or '')
    byid = {p['id']: p for p in pages}
    ids = [i for i in order if i in byid] + [p['id'] for p in pages if p['id'] not in order]
    bib_intro = grab('js/about.js', r'id="biblio"><h2>Bibliography</h2>(<p class="small muted">.*?</p>)', 'the bibliography’s note')
    credits = grab('js/about.js', r'<section class="about-sec" id="credits">(.*?)</section>`', 'the credits')
    cite = re.search(r'<section class="about-sec" id="cite"[^>]*>(.*?)</section>', about_js, re.S)
    toc = [(i, byid[i].get('title') or ttl.get(i) or i.replace('about-', '')) for i in ids] + \
          [('note', 'How this edition was made'), ('biblio', 'Bibliography'), ('credits', 'Credits and rights')]
    b = ['<nav class="toc" aria-label="Contents"><ol>' + ''.join(f'<li><a href="#{E(i)}">{E(t)}</a></li>' for i, t in toc) + '</ol></nav>']
    for i, t in toc[:len(ids)]:
        b.append(f'<section class="essay" id="{E(i)}"><h2>{E(t)}</h2>{byid[i]["html"]}</section>')
    b.append(f'<section class="essay" id="note"><h2>How this edition was made</h2>{note}</section>')
    groups = {}
    for x in bib:
        if not x.get('dup'):
            groups.setdefault(x['group'], []).append(x)
    bh = '<section class="essay" id="biblio"><h2>Bibliography</h2>' + (from_template(bib_intro, 'the bibliography note') if bib_intro else '')
    for g, lst in groups.items():
        bh += f'<h3>{E(g)}</h3><ul class="biblio">' + ''.join(
            f'<li id="bib-{E(x["key"])}"><b>{E(x["label"])}</b> — {x["html"]}</li>' for x in lst) + '</ul>'
    b.append(bh + '</section>')
    if credits:
        b.append(f'<section class="essay" id="credits">{from_template(credits, "the credits")}</section>')
    if cite and 'id="cite"' not in (credits or ''):
        b.append(f'<section class="essay" id="cite">{from_template(cite.group(1), "how to cite")}</section>')
    page('about.html', 'About and credits', '\n'.join(b),
         'Essays on Barros’s Filosofía cortesana, how this edition was made, the bibliography, and the credits and rights; '
         'plain version, without JavaScript.')


def main():
    global BIB, BIB_ORDER, G_LABOUR_ES
    BIB, BIB_ORDER = parse_biblio()
    verses = parse_verses()
    squares = parse_board(verses)
    ann = parse_annotations()
    segC = parse_segments('C_part1.md') + parse_segments('C_part2.md')
    segM = parse_segments('M_additions.md')
    scenes, pages, note = parse_story()
    g_intro, gvars, g_tail = parse_gvars()
    g_es = g_labour_spanish(gvars)
    G_LABOUR_ES = g_es
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
    write_plain(squares, verses, ann, segC, segM, g_intro, gvars, g_tail, m_intro, scenes, pages, note, bib)
    stamp_pages()
    missing = sorted({m for a in ann.values() for m in re.findall(r'about\.html#bib-([\w:-]+)', json.dumps(a)) if m not in BIB})
    print(f'squares {len(squares)}, annotations {len(ann)}, C segs {len(segC)}, M segs {len(segM)}, '
          f'G readings {len(gvars)}, scenes {len(scenes)}, pages {len(pages)}, bib {len(bib)}')
    if missing:
        print('citekeys cited but not in bibliography:', missing)
    check(ann, segC, segM, scenes, pages, note, gvars, bib, (g_intro, g_tail, m_intro))
    for w in WARN:
        print('warning:', w)
    sys.exit(1 if WARN else 0)      # a warning is something a reader would meet: fix it before publishing


if __name__ == '__main__':
    main()
