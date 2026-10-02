"""geometry.py — the one definition of where the paper of the board lies in the British
Museum photograph (FilosofiaCortesanaHiRes.jpg, 2778 x 3600 px). The colour bar at the
right of the photograph is excluded. Imported by make_images.py (to crop) and by
build_data.py (to turn photo pixels into fractions of the sheet, written to data/board.js
as FC.board.sheet, which js/story.js reads)."""
SHEET = (56, 100, 2650, 3502)                    # left, top, right, bottom in photo pixels
SHEET_OFFSET = SHEET[:2]
SHEET_SIZE = (SHEET[2] - SHEET[0], SHEET[3] - SHEET[1])   # 2594 x 3402
