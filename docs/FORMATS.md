# The formats of the edition's source files

Everything a reader sees is built from the files in `content/` by `tools/build_data.py`. This
document describes those files well enough to read or reuse them without the code. Where this
document and `tools/build_data.py` disagree, the code is what the site does; correct whichever is
wrong.

## General conventions

- All text files are UTF-8 without a byte-order mark, in Unicode normalization form NFC. The
  hand-edited files use LF line endings (`.gitattributes` keeps Git from converting them).
- **Maintainers' notes** go in HTML comments, `<!-- … -->`, which may span lines. The build removes
  every comment before it reads a file, so nothing in a comment reaches the site. The comments stay
  in the raw files, which are public in the repository: write paths relative to the project
  (`notes/…`, `corpus/…`), never absolute ones.
- A text outside the structures described below is not read by the build. It is still published in
  the repository, so it must not hold working notes; those belong in the research notes.

## Inline markup

Used in annotation fields, the essays, the introduction, the editorial note, the bibliography, the
`EN` and `NOTE` fields of the text segments, and the fields of the first-edition readings.

| markup | meaning |
|---|---|
| `[@citekey, 144]` | a citation of printed page 144; several: `[@a, 12; @b, 144–45]` |
| `[@barrosFilosofiaCortesanaMoralizada1588, pdf 38]` | the Naples 1588 book, by page of the Google PDF; the build prints the printed page or the leaf, and links to `text.html#pdf38` |
| `[@citekey, pdf 3]` | another source cited by PDF page (only for sources with no printed pagination, such as the 12-page PDF of the Madrid 1587 transcription) |
| `[board]` | the 1588 board itself |
| `[@web:https://…]` | a web page; a matching entry `web:https://…` in the bibliography gives its label |
| `{q\|citekey\|pdfN\|printed page\|exact words}` | a short quotation, copied mechanically from the source and checked by `tools/verify_quotes.py` against PDF page N (it may run into N+1; `[…]` marks an omission). A citation of the same source and page written straight after it, or after a gloss in parentheses, is printed once |
| `*italic*`, `**bold**`, `` `code` `` | as in Markdown; nothing inside a code span is markup |
| `*words*{es}` (also `{it}`, `{la}`, `{fr}`, `{pt}`) | an italic passage in another language, marked for screen readers |
| `[text](https://…)`, bare `https://…` | an external link |
| `[text](atlas.html#43)` | a link to one of the edition's pages: `index`, `play`, `atlas`, `text` or `about`, with an optional `#anchor` |
| `![alt text](img/…)` | an image under `img/`; alone at the start of a paragraph it is a figure, and the rest of that paragraph its caption. An image path outside `img/` is not shown |

Straight double quotes in the edition's own prose are printed as curly quotes; quotations
(`{q|…}`), code and link addresses are left as written. Italic and quoted passages of two or more
words also get a language tag when their language is clear from their words.

Block-level Markdown in multi-paragraph fields and essays: paragraphs separated by blank lines;
headings (`##` to `######`; the essays use `####`); lists (`- `, `* `, `1. `), whose
following non-blank lines continue the item; tables (`| … |` rows, a `|---|` separator row);
quotations (`> `); a line `---` alone is dropped.

## Annotations: `A_…md`, `B_…md`, `C_39…md`, `D_…md`

Every file whose name starts with `A_` to `D_` (except `C_part1.md` and `C_part2.md`) holds
annotation blocks, one per square or figure:

```
=== id: sq39
title_en: False Friendship
title_es: Falsa amistad
board_it: Falsa amicitia
kind: marked
rule_short: Go back to 7, the Prodigal, and pay one stake.
table: One sentence read aloud on the Play card, with its citation [@…].
see: |
  What is engraved, for someone looking at it.
why: |
  What the square means in Barros's allegory, and why the rule sends the player where it does.
context: |
  …
variants: |
  …
readings: |
  …
barros_pdf: 38-39
sources: citekey1, citekey2
===
```

- The block starts with a line `=== id: <id>` and ends with a line `===` alone.
- **Ids.** `sq1` to `sq63` for squares that have an annotation; `labour` (all nine Labor squares),
  `plain` (every square with no picture of its own), `gate`, `title`, `corner-swan`,
  `corner-dolphin`, `corner-occasion`, `corner-clock`, `centre-sea` and `centre-man` for the
  figures. The id, without `sq`, is the address of the entry on The Squares (`atlas.html#39`,
  `atlas.html#corner-clock`).
- **Fields.** A field starts at the beginning of a line with its name, a colon and a space. A
  one-line field has its value on the same line. A multi-line field is written `name: |` and its
  lines follow, **indented**: an unindented line of the form `word: …` would start a new field.
- Fields the build reads: `title_en`, `title_es`, `board_it` (plain text, shown as written);
  `rule_short` and `table` (one paragraph of inline markup each); `see`, `why`, `context`,
  `variants` and `readings` (block-level Markdown). In these five, a field written as one long line
  per paragraph (any line over 600 characters) has each line read as its own paragraph; a field
  wrapped at about 90 characters needs blank lines between paragraphs.
- `kind` (`marked`, `labour`, `dice`, `plain`, `corner`, `centre`, `gate`), `barros_pdf` (the PDF
  pages of the 1588 book where Barros explains the square) and `sources` (the citekeys used) are
  kept for maintainers; the build does not read them.

## The 1588 book and the Madrid passages: `C_part1.md`, `C_part2.md`, `M_additions.md`

The text is divided into segments:

```
::: seg id=C-038a pdf=38 page=32 sig=B4v kind=verse squares=28
ES: Si no ay dicha en negociar, / La suerte se buelue azar.
EN: If luck won't help your case along, / your throw of dice will turn out wrong.
LIT: If there is no luck in pressing one's case, the throw turns into a losing one.
VID: h28
NOTE: …
:::
```

- A segment starts with a line `::: seg` followed by its attributes and ends with a line `:::`
  alone. Segments are shown in the order of the files (`C_part1.md`, then `C_part2.md`).
- **Attributes**, written `name=value` with no spaces in the value. The values become HTML ids and
  attributes, so they may hold only letters, digits and `. , : ? – -`; the build stops on any other
  character.
  - `id`: the segment's permanent id (see `docs/ANCHORS.md`). Naples segments are
    `C-<PDF page, three digits><letter>` (`C-038a`, `C-038b`); Madrid passages are
    `M-<folio><letter>` (`M-17r-a`).
  - `pdf`: the page or pages of the Google PDF of the Vienna copy on which the segment stands
    (`38`, `37-38`). This numbering counts the two notice pages Google adds at the front: PDF
    page 7 is the title page. `pdfN` anchors on The Book are made from it.
  - `page`: the printed page or pages (`32`, `31-32`), empty for the unpaginated preliminaries
    (pagination starts at printed page 16, PDF page 22).
  - `sig`: the signature. The two parts follow different conventions, and both are kept as they
    are: in `C_part1.md` every segment carries the leaf on which it stands, recto or verso
    (`A1r`, `A2r-A3v`, `B4r-B4v`); in `C_part2.md` only a signature mark printed on one of the
    segment's pages is given (`B5`, `B6`, `C`, `C2,C3`, `C4`, `C6`), and segments on unsigned pages
    have none.
  - `fol` (Madrid passages only): the folio of the Madrigal edition, approximate (`17r`,
    `17r–17v`).
  - `replaces` (Madrid passages only): the id of the Naples segment the passage corresponds to.
  - `kind`: `heading`, `paratext`, `prose`, `verse`, `description` (a description of something on
    the page that is not text: an ornament, a stamp, a manuscript note; EN only) or `rules`.
    Missing means `prose`.
  - `squares`: the board squares the passage names or involves, comma-separated (`28`,
    `4,12,17`), or one of the words `labour`, `centre`, `corners`, `fortune-image`, `unknown`;
    `none` or empty when it names none.
- **Fields**, each starting at the beginning of a line with its label; following lines without a
  label continue the field above:
  - `ES`: the Spanish, copied mechanically from the diplomatic transcription, with its editorial
    marks: `[ ]` for an expansion, `[sic]` for a misprint (explained in the NOTE), `[?]` for a
    doubtful reading, and the others listed in the opening paragraph of each file. `*…*` marks
    italic type. In verse, ` / ` is a line break. ES is shown as written, with no other markup.
  - `EN`: the English translation (inline markup). In verse, ` / ` is a line break.
  - `LIT` (also written `LITERAL`): a literal rendering, shown under a verse.
  - `VID`: the id of the verse in the verse table of `TRANSLATION_GUIDE.md` whose fixed
    translation the segment uses.
  - `NOTE`: the translator's note (inline markup).
- The prose before the first segment of `M_additions.md` is shown on The Book as the introduction
  to the Madrid passages. The prose before the first segment of `C_part1.md` and `C_part2.md`
  records conventions and is not shown. Nothing after the last segment of any of these files is
  read; in `M_additions.md` it holds the table of corpus readings that are not Madrigal readings.

## The first edition: `G_variants.md`

```
::: gvar id=G-02 squares=none
WHERE: Royal privilege, opening
G: Por cuanto por parte de vos, Alonso de Barros, nuestro criados [@sanchezEdicionesAntiguasFilosofia2016oct16, 183]
M: Por cuanto por parte de vos, Alonso de Barros, nuestro criado [@sanchezEdicionesAntiguasFilosofia2016oct16, 183]
C: POR quanto por parte de vos Alonso de Barros, nuestro criado (pdf 9)
EN: Whereas, on behalf of you, Alonso de Barros, our servants [sic]
NOTE: …
:::
```

- Attributes as for segments: `id` (`G-01`, `G-02`, …) and `squares`.
- Fields: `WHERE` (the place in the work), `G` (Lucero's text of the first edition, copied
  exactly), `M` (his text of the Madrigal edition), `C` (the Naples reading, by PDF page), `EN`,
  `NOTE`. A field may run over several lines; each line is kept as a line. The Spanish fields keep
  their straight quotes.
- Block G-15 holds G's eight Labor couplets; the build reads them from its `G` field, split at each
  full stop, and lays them on squares 12, 17, 23, 30, 34, 41, 48 and 57.
- The prose before the first block and everything after the last are shown on The Book with the
  first-edition readings.

## Introduction, essays, bibliography and editorial note: `E_story_about.md`

The file is divided by four second-level headings, which must be written exactly so:
`## A. …` (introduction scenes), `## B. …` (essays), `## C. Bibliography` and `## D. …`
(editorial note). The text before `## A.` is not shown.

- **A, scenes.** Each scene starts with `### <id>` (`a-z`, `0–9` and `-` only). A `visual:` line
  says what the board shows during the scene (for maintainers; the views themselves are in
  `SCENES` in `js/story.js`); an optional `title:` line gives a title. The rest is block-level
  Markdown. Scene ids are anchors on the introduction (`index.html#scene-<id>`).
- **B, essays.** Each essay starts with `### about-<slug>` and a `title:` line; the rest is
  block-level Markdown. Their order on About is set by `ORDER` in `js/about.js`; an essay not
  listed there comes last.
- **C, bibliography.** `###` lines name the groups (Primary sources, Scholarship and editions, …).
  Each entry is one line:

  ```
  - `citekey` Author. Year. Title. … https://…
  ```

  The citekey is the name of the source's file in the research corpus; `web:<address>` for a web
  page cited as `[@web:…]`, and `ref:<name>` for works not in the corpus. Keys may hold only
  letters, digits and `_ : . / ? = & % # ~ ( ) + -`. The short label used in citations
  ("Lucero 2019a") is made from the author and year at the start of the reference (with a few fixed
  exceptions in `parse_biblio()`). An entry written ``**Duplicate** of `otherkey`: …`` is not
  listed; citations of it point to the other entry.
- **D, editorial note.** Everything after the `## D.` heading line, as block-level Markdown.

`bib_extra.md` holds further web sources cited only in the annotations, in the same format as
section C; its entries are added to the end of the bibliography.

## Verses: `TRANSLATION_GUIDE.md`

The guide states the translation principles, the fixed English terms and the square names, which
the build does not read. It also holds the table of fixed verse translations, which it does read:

```
| id | Spanish (Naples 1588 book) | verse | literal |
|---|---|---|---|
| h28 | Si no ay dicha en negociar, / La suerte se buelue azar. | If luck won't help your case along, / … | If there is no luck … |
```

Every table row with four cells whose first cell is a single word is read as a verse, keyed by that
word; other tables in the guide must not have that shape.

## The board: `squares_01_31.json`, `squares_32_63.json`, `margins_01_31.json`, `centre.json`, `board_italian.md`

**Coordinates** are pixels of the master photograph `FilosofiaCortesanaHiRes.jpg` (2778 × 3600 px,
SHA-256 `6d739da80fac8c7ae0b3861c81f9e9ca31ca17a90bb5b4e218eb589c4c9fdb4b`; see "Masters" in the
README), with x to the right and y down. The paper of the sheet lies at (56, 100)–(2650, 3502) in
that photograph (`tools/geometry.py`); `data/board.js` gives the squares as fractions of that crop.
A different photograph, even of the same sheet, does not fit these numbers.

**`squares_*.json`**: one object per square, in a list.

| key | meaning |
|---|---|
| `n` | square number, 1–63 |
| `heading` | the Italian heading engraved on the square, if any |
| `it`, `es` | the Italian and Spanish verses as engraved (` / ` = line break) |
| `rule` | the rule label engraved beside the square, if any |
| `image_desc` | a description of the picture |
| `blank` | true for a plain square: no emblem or verse, only its number and a plant or two |
| `center` | [x, y] |
| `quad` | four corners [x, y], in the order outer-start, inner-start, inner-end, outer-end: "inner" is the side nearer the center of the board, "start" the divider shared with the previous square. With the inner edge up, this is bottom-left, top-left, top-right, bottom-right; the square's images are cut from it |
| `rot` | degrees counterclockwise that turn a crop so that its lettering reads upright (Pillow's `Image.rotate` convention), measured on the lettering |
| `rot_track` | (1–31 only) the same angle computed from the square's geometry, inner edge up |
| `img_bbox` | [left, top, right, bottom] of the picture; for a plain square, its picture zone |
| `img_bbox_kind`, `confidence` | (1–31 only) what `img_bbox` covers, and how sure the reading is |
| `notes` | the transcriber's notes on readings and geometry |

**`margins_01_31.json`** (title, corner figures and mottoes, entrance, signature, privileges) and
**`centre.json`** (the sea, the palm and Victory, and the figures around them): one object per
feature, in a list, with `id`, `bbox` [left, top, right, bottom], `rot` (as above; `null` where the
feature has no single orientation), and a text and description: `text` and `description` in the
margins; `label`, `desc`, and where there is lettering `text`, `text_it` and `text_es`, and
sometimes `notes`, in the center. Each feature's crop is `img/feat/<id>.jpg`.

**`board_italian.md`** gives every inscription with a literal English gloss, as tables for
readers of the file. The build reads only its last section, a fenced ` ```json ` block: an object
keyed by `sq<n>` and by feature names, each with `it` and `it_gloss` (the Italian and its literal
English), `rule_en` (the rule label in English), `note`, and for squares `heading_it`,
`heading_en` and `rule_it`. The site shows `it_gloss` and `rule_en` with each square.

## The generated data: `data/*.js`

Written by `tools/build_data.py`; never edited by hand. Each file is

```
/* generated by tools/build_data.py from content/ — do not edit by hand */
window.FC = window.FC || {};
FC.<name> = <JSON>;
```

with CRLF line endings. To read one as JSON, take what follows `FC.<name> = ` on the third line
and drop the final `;`. `board.js` holds the squares, verses and sheet crop; `text.js` the segments of C, M
and G; `annotations.js`, `story.js`, `about.js` and `biblio.js` the rest. Their HTML strings are
the output of the inline and block markup above.
