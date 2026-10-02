# Stable anchors

Readers cite the edition by its addresses, so the anchors below are kept from version to version.
A change to any of them is a change to every citation that uses it.

## The anchors that are kept

| address | what it points to |
|---|---|
| `atlas.html#N` (N = 1–63; `#sqN` also works) | square N on The Squares, with its annotation open |
| `atlas.html#<figure id>` | a figure: `gate`, `labour`, `plain`, `title`, `corner-swan`, `corner-dolphin`, `corner-occasion`, `corner-clock`, `centre-sea`, `centre-man` |
| `text.html#C-…` | a segment of the Naples 1588 book (`#C-038b`) |
| `text.html#M-…` | a passage of the Madrid 1587 (Madrigal) edition absent from Naples (`#M-41v-a`) |
| `text.html#G-…` | a recorded reading of the first edition (`#G-05`) |
| `text.html#pdfN` (N = 7–69) | the first segment on page N of the Google Books PDF of the Vienna copy (the PDF identified under "Masters" in the README; its pages 1–2 are Google's notices, page 7 the title page) |
| `text.html#pN` (N = 1–63) | page N of the 1588 book, counting the title page as p. 1: the printed numbers begin at 16 (leaf A8v) and run to 63; pp. 1–15 are unnumbered in the book. Page 48 is misprinted "38" (corrected by hand to "48" in the Vienna copy); `#p48` is that page, and `#p38` is the page that really is 38 |
| `text.html#leaf-<gathering><leaf><side>` | a leaf of the 1588 book by its position, as bibliographers cite it: `#leaf-A1r` is the title page, `#leaf-B4v` the back of the fourth leaf of gathering B. Gatherings A and B have twelve leaves each; C follows. Only some leaves carry a printed signature; the others are counted |
| `about.html#about-<slug>` | an essay (`#about-rules`) |
| `about.html#note`, `#biblio`, `#credits` | the editorial note, the bibliography, credits and rights |
| `about.html#bib-<citekey>` | a bibliography entry |
| `index.html#scene-<id>` | a scene of the introduction |

## Rules for maintainers

1. **Segment ids are never renumbered or reused.** An id names a passage, not a position: the
   letters in `C-038a`, `C-038b` record the order in which the segments were first made, and the
   site shows segments in the order of the files, whatever their ids.
   - A segment split in two keeps its id for the first part; the second part takes the next letter
     not yet used on that page (after `C-038b` and `C-038c`, a new segment on PDF page 38 is
     `C-038d`, wherever it stands).
   - Two segments joined keep the id of the first. The id of the second is not used again; record
     the join in `CHANGELOG.md`, so that a link to it can be followed by hand.
   - A removed segment's id is not used again.
   The same rules hold for `M-…` and `G-…` ids, annotation ids, essay ids (`about-…`), scene ids and
   citekeys.
2. **`pdfN` means page N of that one PDF.** If the book is ever shown from another scan, keep the
   `pdfN` anchors as they are and add new ones beside them; do not renumber. `#pN` and `#leaf-…`
   belong to the book itself, not to the scan, and stay right for any copy of the Naples edition
   with the same collation. They are computed from the scan page in `js/text.js` and
   `tools/build_data.py` (`leaf_of`, `page_of`: the title page is PDF page 7, two PDF pages per
   leaf); if another scan is used, change that one rule in both places.
3. **A page or leaf with no passage on it** (a blank page, such as A1v or the last leaf) goes to the
   next passage, or to the last one; an address that is not a page or leaf of the book stays at the
   top of the page.
4. **Squares keep their numbers.** `atlas.html#N` is the square numbered N on the Naples board;
   when an edition's board differs (the first edition put Poverty on 59), the annotation says so,
   and the number is not changed.
5. **Before a release**, `python3 tools/build_data.py` reports links inside the edition to
   `text.html#pdfN` or `#C-…` anchors that do not exist. If an anchor in the table above has to go
   all the same, say so in `CHANGELOG.md`, with the old and the new address.

## The plain pages

The plain pages in `plain/` are generated. `plain/book.html` carries the same `#pdfN`, `#pN` and
`#leaf-…` anchors as `text.html`, but its ids are not otherwise promised here; cite the main pages.
