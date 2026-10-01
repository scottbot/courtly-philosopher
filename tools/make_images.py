#!/usr/bin/env python3
"""
make_images.py — derive every web image of the site from the two primary sources.

Sources (not included in the repository; paths given on the command line):
  BOARD  British Museum 1869,0410.2463.+ (Cartaro, Naples 1588), photograph
         FilosofiaCortesanaHiRes.jpg, 2778 x 3600 px. © The Trustees of the British
         Museum; used under licence by the project.
  BOOK   Google Books scan of Barros, Filosofia cortesana moralizada (Naples 1588),
         Vienna, ÖNB 35 V 49 (Google Books id 1FFfAAAAcAAJ), a PDF of 72 pages.

Outputs (under img/). Every JPEG has an AVIF and a WebP twin of the same size and name
(…/x.jpg, …/x.avif, …/x.webp); pages offer them with <picture> or FC.img (js/common.js).
  board/board-full.jpg, board-2000.jpg, board-1200.jpg, board-800.jpg
                     the sheet, cropped to the paper (the viewer climbs this ladder)
  sq/tile-NN.jpg     each square "unrolled" upright (perspective warp of its quad)
  sq/detail-NN.jpg   each square with its lettering, rotated upright, for annotations
  feat/<id>.jpg      corner figures, mottoes, centre features, title, signature
  feat/thumb-<id>.jpg  the same at 320 px wide, for the Atlas grid
  book/pNNN.jpg      the book's pages (PDF pages 7-69), for the facsimile view

Geometry comes from content/squares_01_31.json, content/squares_32_63.json,
content/margins_01_31.json and content/centre.json (pixel coordinates in the
2778 x 3600 photograph); the crop of the sheet is in tools/geometry.py.

Usage:  python3 tools/make_images.py BOARD.jpg BOOK.pdf [--keep-jpeg]
  --keep-jpeg   do not rewrite JPEGs that already exist; write only missing files and
                the AVIF/WebP twins (used to add formats without touching committed files)
Requires Pillow 12.2.0 with AVIF support and PyMuPDF 1.28.2 (tools/requirements.txt);
with these versions the output is byte for byte reproducible.
"""
import json, math, os, sys
from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.dont_write_bytecode = True        # no __pycache__ in the published tools/ folder
sys.path.insert(0, HERE)
from geometry import SHEET                  # the paper of the sheet within the photograph
Image.MAX_IMAGE_PIXELS = None
OX, OY = SHEET[0], SHEET[1]
KEEP_JPEG = False


def save(im, rel, quality):
    """Write img/<rel>.jpg (unless kept) and its .avif and .webp twins."""
    base = os.path.join(ROOT, 'img', rel)
    if not (KEEP_JPEG and os.path.exists(base + '.jpg')):
        im.save(base + '.jpg', quality=quality, optimize=True, **({'progressive': True} if rel.startswith('board/') else {}))
    if im.mode not in ('RGB', 'L'):
        im = im.convert('RGB')
    im.save(base + '.avif', quality=55, speed=4)
    im.save(base + '.webp', quality=80, method=6)


def load_geometry():
    sq = []
    for f in ('squares_01_31.json', 'squares_32_63.json'):
        sq += json.load(open(os.path.join(ROOT, 'content', f), encoding='utf-8'))
    feats = []
    for f in ('margins_01_31.json', 'centre.json'):
        feats += json.load(open(os.path.join(ROOT, 'content', f), encoding='utf-8'))
    return sorted(sq, key=lambda s: s['n']), feats


def dist(p, q):
    return math.hypot(p[0] - q[0], p[1] - q[1])


def warp(im, quad, height=None):
    """Map a square's quad (order: bottom-left, top-left, top-right, bottom-right of the
    upright square) onto an upright rectangle."""
    BL, TL, TR, BR = quad
    w = (dist(TL, TR) + dist(BL, BR)) / 2
    h = (dist(TL, BL) + dist(TR, BR)) / 2
    out = im.transform((int(w), int(h)), Image.QUAD, data=(*TL, *BL, *BR, *TR),
                       resample=Image.BICUBIC, fillcolor=(214, 206, 188))
    if height:
        out.thumbnail((int(height * w / h) + 1, height), Image.LANCZOS)
    return out


def extend(quad, top=0.08, bottom=0.55, side=0.10):
    """Grow a quad outward so that lettering engraved beside the square is included."""
    BL, TL, TR, BR = [list(map(float, p)) for p in quad]
    def lerp(a, b, t):
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    nTL, nBL = lerp(BL, TL, 1 + top), lerp(TL, BL, 1 + bottom)
    nTR, nBR = lerp(BR, TR, 1 + top), lerp(TR, BR, 1 + bottom)
    TL2, TR2 = lerp(nTR, nTL, 1 + side), lerp(nTL, nTR, 1 + side)
    BL2, BR2 = lerp(nBR, nBL, 1 + side), lerp(nBL, nBR, 1 + side)
    return [BL2, TL2, TR2, BR2]


def main(board_path, book_path):
    photo = Image.open(board_path).convert('RGB')
    sheet = photo.crop(SHEET)
    for name, width, q in (('full', None, 86), ('2000', 2000, 82), ('1200', 1200, 80), ('800', 800, 80)):
        im = sheet if width is None else sheet.resize(
            (width, round(sheet.height * width / sheet.width)), Image.LANCZOS)
        save(im, f'board/board-{name}', q)

    squares, feats = load_geometry()
    for s in squares:
        n = s['n']
        save(warp(photo, s['quad'], 420), f'sq/tile-{n:02d}', 80)
        outer = n <= 35          # outer ring (1-35): lettering lies inside the bay
        q = extend(s['quad'], 0.06, 0.12 if outer else 0.62, 0.06)
        if n == 63:
            q = extend(s['quad'], 0.05, 0.40, 0.08)
        save(warp(photo, q, 900), f'sq/detail-{n:02d}', 82)

    for f in feats:
        box = f.get('bbox')
        if not box:
            continue
        pad = 12
        c = photo.crop((box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad))
        rot = f.get('rot') or 0
        if rot:
            c = c.rotate(rot, expand=True, fillcolor=(214, 206, 188), resample=Image.BICUBIC)
        c.thumbnail((1000, 1000), Image.LANCZOS)
        save(c, f"feat/{f['id']}", 82)
        t = c.copy()
        if t.width > 320:
            t = t.resize((320, max(1, round(t.height * 320 / t.width))), Image.LANCZOS)
        save(t, f"feat/thumb-{f['id']}", 80)

    import pymupdf                               # PyMuPDF >= 1.24.3 (the "pymupdf" name)
    doc = pymupdf.open(book_path)
    for i in range(6, 69):                       # PDF pages 7..69 (1-based)
        pix = doc[i].get_pixmap(dpi=150)
        im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        save(ImageOps.grayscale(im), f'book/p{i + 1:03d}', 72)
    print('images written')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    KEEP_JPEG = '--keep-jpeg' in sys.argv
    if len(args) != 2:
        sys.exit(__doc__)
    main(*args)
