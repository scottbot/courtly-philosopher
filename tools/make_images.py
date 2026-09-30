#!/usr/bin/env python3
"""
make_images.py — derive every web image of the site from the two primary sources.

Sources (not included in the repository; paths given on the command line):
  BOARD  British Museum 1869,0410.2463.+ (Cartaro, Naples 1588), photograph
         FilosofiaCortesanaHiRes.jpg, 2778 x 3600 px. © The Trustees of the British
         Museum; used under licence by the project.
  BOOK   Google Books scan of Barros, Filosofia cortesana moralizada (Naples 1588),
         Vienna, ÖNB 35 V 49 (Google Books id 1FFfAAAAcAAJ), a PDF of 72 pages.

Outputs (under img/):
  board/board-full.jpg, board-2000.jpg, board-1200.jpg   the sheet, cropped to the paper
  sq/tile-NN.jpg     each square "unrolled" upright (perspective warp of its quad)
  sq/detail-NN.jpg   each square with its lettering, rotated upright, for annotations
  feat/<id>.jpg      corner figures, mottoes, centre features, title, signature
  book/pNNN.jpg      the book's pages (PDF pages 7-69), for the facsimile view

Geometry comes from content/squares_01_31.json, content/squares_32_63.json,
content/margins_01_31.json and content/centre.json (pixel coordinates in the
2778 x 3600 photograph). The crop offset below converts them to sheet coordinates.

Usage:  python3 tools/make_images.py BOARD.jpg BOOK.pdf
Requires Pillow and PyMuPDF (pip install pillow pymupdf).
"""
import json, math, os, sys
from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
Image.MAX_IMAGE_PIXELS = None

# The paper of the sheet within the photograph (the colour bar at the right is excluded).
SHEET = (56, 100, 2650, 3502)          # left, top, right, bottom in photo pixels
OX, OY = SHEET[0], SHEET[1]


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
    for name, width, q in (('full', None, 86), ('2000', 2000, 82), ('1200', 1200, 80)):
        im = sheet if width is None else sheet.resize(
            (width, round(sheet.height * width / sheet.width)), Image.LANCZOS)
        im.save(os.path.join(ROOT, 'img/board', f'board-{name}.jpg'), quality=q,
                optimize=True, progressive=True)

    squares, feats = load_geometry()
    for s in squares:
        n = s['n']
        warp(photo, s['quad'], 420).save(
            os.path.join(ROOT, 'img/sq', f'tile-{n:02d}.jpg'), quality=80, optimize=True)
        outer = n <= 35          # outer ring (1-35): lettering lies inside the bay
        q = extend(s['quad'], 0.06, 0.12 if outer else 0.62, 0.06)
        if n == 63:
            q = extend(s['quad'], 0.05, 0.40, 0.08)
        warp(photo, q, 900).save(
            os.path.join(ROOT, 'img/sq', f'detail-{n:02d}.jpg'), quality=82, optimize=True)

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
        c.save(os.path.join(ROOT, 'img/feat', f"{f['id']}.jpg"), quality=82, optimize=True)

    import pymupdf
    doc = pymupdf.open(book_path)
    for i in range(6, 69):                       # PDF pages 7..69 (1-based)
        pix = doc[i].get_pixmap(dpi=150)
        im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        ImageOps.grayscale(im).save(os.path.join(ROOT, 'img/book', f'p{i + 1:03d}.jpg'),
                                    quality=72, optimize=True)
    print('images written')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
