# Filosofía cortesana — a playable edition

A scholarly, playable web edition of Alonso de Barros's *Filosofía cortesana* (Madrid 1587),
the earliest known themed Game of the Goose: sixty-three squares tracing a petitioner's career
at the court of Philip II. Players play on the only board known to survive, Mario Cartaro's
engraving of Naples 1588 (British Museum 1869,0410.2463.+), with Barros's rules in any of the
three early editions, and read every square they land on: its picture, its Spanish and Italian
verses with English translations, Barros's own explanation, and notes on its history.

Plain HTML, CSS and JavaScript. No framework, no build step at runtime, no external requests.

## Pages

| file | what it is |
|---|---|
| `index.html` | the introduction: a scrolling story that moves over the board |
| `play.html` | the game, for two to six players on one screen (board view on desktop, the "path" on phones) |
| `atlas.html` | every square and every figure around the track, with full annotations (`atlas.html#39`) |
| `text.html` | the 1588 book: Spanish transcription and English translation, page images, Madrid variants (`text.html#pdf38`, `#C-038b`, `#M-41v-a`, `#G-05`) |
| `about.html` | essays (at a glance, author, court, kind of book, goose game, editions, board, rules, money, reception, debates), how the edition was made, bibliography |
| `404.html` | the page GitHub Pages shows for a missing address (self-contained) |

Every page carries `<meta name="robots" content="noindex">` while the edition is an unreviewed
draft; remove it from the five pages (and `404.html`) once a specialist has reviewed it.

## Publishing on GitHub Pages

Push this folder as the root of a repository and enable Pages (branch `main`, folder `/`).
All paths are relative, so the site also works under `https://user.github.io/repo/`.
The empty `.nojekyll` file stops GitHub from running Jekyll over `content/`.
To try it locally: `python3 -m http.server` in this folder, then open http://localhost:8000/.
The `og:image` sharing tag points at `img/board/board-1200.jpg` relatively; make it an absolute URL
once the site's address is known.

## How the code is organized

```
index.html play.html atlas.html text.html about.html 404.html
css/style.css        all styling, light and dark themes (tokens at the top)
css/play.css         styles used only by the Play page
css/fonts.css        self-hosted EB Garamond and IM Fell (SIL Open Font License, in fonts/)
js/common.js         shared: editions and where their boards differ (FC.EDITION_RULES), image formats
                     (FC.img), square data, board viewer (pan/zoom, keyboard), annotation builder,
                     drawer, citation pop-ups, draft notice
js/game.js           the rules engine — pure logic, every rule cites its source, choices marked DECISION
js/play.js           the Play page: setup, turn flow, the cards you click through
js/story.js          the introduction (scene titles, what each scene shows, "More:" links)
js/atlas.js js/text.js js/about.js   the other pages (about.js sets the order and titles of the essays)
data/*.js            GENERATED from content/ by tools/build_data.py — do not edit by hand
content/             the edition's sources (edit these)
img/                 GENERATED: tools/make_images.py (board, squares, figures, book pages),
                     tools/make_map.mjs (img/map-europe.svg)
tools/               build_data.py, make_images.py, make_map.mjs, verify_quotes.py, geometry.py
                     (the board crop, shared by the first two), requirements.txt
tests/engine.test.js rules tests: Barros's own worked example (Madrid 1587) + random games
```

Each data file is loaded only by the pages that need it: `data/story.js` (introduction scenes) by
index.html, `data/about.js` (essays and editorial note) by about.html, `data/board.js` by the pages
with a board.

**Images.** Every derived JPEG has an AVIF and a WebP twin with the same name. Markup offers them
with `<picture>` (`FC.img.pic(src, alt, attrs)` in scripts); where a script sets an image's `src`
(the board viewer, the page images), it waits for `FC.img.best`, which tests once which format the
browser decodes. The board viewer climbs a ladder of sizes (`board-800`, `-1200`, `-2000`, `-full`)
and fetches only the smallest one sharp enough for the current zoom. `img/feat/thumb-*.jpg` are
320-px versions of the figure crops for the Atlas grid. Of the figure crops in `img/feat/`, about
thirty are not shown by any page at present; they are kept for future annotations.

**Cache stamps.** `tools/build_data.py` ends by writing `?v=<hash of the file>` after every local
script and stylesheet in index, atlas, text, about and 404, so a deploy never mixes a new page with
an old cached script (GitHub Pages caches each file for ten minutes). A page outside that list is
stamped only if it already uses `?v=`. After editing a file in `js/` or `css/`, run the build again.

## Editing the content

Everything a reader sees comes from `content/`:

- `A_…md`, `B_…md`, `C_39…md`, `D_…md` — annotations, one `=== id: sq39 … ===` block per square or figure
  (fields `title_en`, `title_es`, `board_it`, `rule_short`, `table` — the one sentence read aloud on the
  Play card — `see`, `why`, `context`, `variants`, `readings`);
- `E_story_about.md` — introduction scenes (section A), About essays (B), bibliography (C), editorial note (D).
  A new scene needs an entry in `SCENES` in `js/story.js`; a new essay appears at the end of About
  unless it is added to `ORDER` in `js/about.js` (a `title:` line under its heading sets its title);
- `bib_extra.md` — further web sources cited in the annotations;
- `C_part1.md`, `C_part2.md` — the Naples 1588 text, Spanish and English, segment by segment;
- `M_additions.md` — passages of the Madrid (Madrigal) 1587 edition absent from Naples 1588;
- `G_variants.md` — what is known of the first edition (Madrid 1587, widow of Alonso Gómez), one
  `::: gvar` block per reading (fields `WHERE`, `G`, `M`, `C`, `EN`, `NOTE`); the Spanish of G's
  Labor couplets shown on the squares is read from block G-15;
- `TRANSLATION_GUIDE.md` — the fixed English verse translations and translation principles;
- `squares_*.json`, `margins_01_31.json`, `centre.json`, `board_italian.md` — the board: transcriptions and geometry.

Markup: citations `[@citekey, printed page]`, `[board]` or `[@web:URL]`; short verified quotations
`{q|citekey|pdfN|printed page|exact words}` (a citation of the same source and page written right
after a quotation, or after its gloss in parentheses, is printed once); `*italic*`, `**bold**`,
`` `code` ``, `[text](url)`, bare `https://` addresses (made into links); `*words*{es}` (also `{it}`,
`{la}`, `{fr}`, `{pt}`) marks a passage in another language for screen readers (italic and quoted
passages of two or more words are also tagged automatically when their language is clear, and
single loanwords are left alone); `![alt text](img/…)` alone in a paragraph is a figure, and the
rest of that paragraph its caption. **Notes for maintainers** go in `<!-- … -->` comments: the build
removes them, and it warns when a file path, a tool name or a catalog remark would reach readers.

After editing, run:

```
python3 tools/build_data.py                                     # rebuild data/*.js (and the cache stamps)
python3 tools/verify_quotes.py --corpus <corpus folder> content/*.md   # after changing quotations
node tests/engine.test.js                                       # after changing js/game.js
```

The build also reports `text.html#pdfN` or `#C-…` links that point at no passage, and citekeys
missing from the bibliography.

`tools/make_images.py BOARD.jpg BOOK.pdf` rebuilds all images from the British Museum photograph
and the Google Books PDF of the 1588 book (neither is in this repository). With the versions in
`tools/requirements.txt` (Pillow 12.2.0 with AVIF support, PyMuPDF 1.28.2) the output is byte for
byte the same; `--keep-jpeg` leaves existing JPEGs alone and writes only missing files and the AVIF
and WebP twins.

`tools/make_map.mjs` draws `img/map-europe.svg` from Natural Earth data (public domain) with the npm
packages `world-atlas`, `d3-geo` and `topojson-client`. They are not needed by the site and must not
be published: install them outside it and point `MAP_DEPS` at that folder:

```
npm install --prefix /tmp/fc-map world-atlas@2 d3-geo@3 topojson-client@3
MAP_DEPS=/tmp/fc-map node tools/make_map.mjs
```

The research behind the edition (the bibliography converted to Markdown with page anchors, reading
notes with mechanically verified quotations, transcription notes and review reports) is not in this
repository. `tools/verify_quotes.py --corpus <folder>` re-checks every `{q|…}` quotation against
that corpus.

## Who made it

Made by Claude, an AI model made by Anthropic, at the request of Scott B. Weingart, who set the brief,
supplied the research library and the licensed British Museum photograph, and answered questions along
the way. Claude read the sources, transcribed the 1588 book and the board from the page images, made the
translations, wrote the annotations and essays, and wrote the code. The short quotations marked as verified
in `content/` (`{q|…}`) are checked by program against the text of their sources (`tools/verify_quotes.py`);
many other quotations were compared with their sources by the independent audits, but not all of them. The transcriptions, translations and interpretations have not
been reviewed by a specialist in early modern Spanish or Italian. **This is a draft**, and should not be trusted
or cited as scholarship until it has been reviewed; every page opens with a notice saying so (`js/common.js`,
"draft notice").

None of the source material gathered for this project (the research library, the page images of the 1588 book
and the British Museum photograph) was used by Anthropic to train its models. The model that made the edition
had finished training before the work began and read the sources only while making it, and the account in which
the work was done does not allow Anthropic to use its conversations or files for training. Whether publicly
available copies of some of the works cited were among the material the model was originally trained on is
not something this edition can say.

## Rights

No rights are claimed in what this edition made: to the extent that copyright subsists in this
AI-produced work, Scott B. Weingart waives it under CC0 1.0 Universal (see `LICENSE`). That covers the
transcriptions, translations, annotations, essays, introduction and rule descriptions (`content/`, and
`data/`, which is generated from it) and the code (`*.html`, `css/`, `js/`, `tools/`, `tests/`).

This means only that no rights are claimed in the material presented here. It is not a statement that any
of it is in the public domain: an AI-produced work can repeat or closely follow material that exists
elsewhere under other terms, and this edition has not checked everything it contains against everything
published. Before treating any part of it as free of rights, check it independently.

The dedication does not cover anything from another source:

- the words of Barros, Cartaro and the other early printed texts (public domain, not this edition's to dedicate);
- the Spanish of the Madrid 1587 (Madrigal) edition, wherever it appears (Book and Play pages, Squares,
  quotations in the notes), copied from the
  modernized transcription by Luigi Ciompi and Adrian Seville (giochidelloca.it), made from Dadson's 1987
  edition; the edition's English of that edition is translated from it;
- quotations from modern scholarship and other works, which remain their authors' and are quoted for study
  and criticism;
- the board photograph and every detail cut from it: © The Trustees of the British Museum, reproduced under
  license, which covers publication on the web. Keep the credit lines on every page;
- the page images of the 1588 book: Vienna, Österreichische Nationalbibliothek, 35 V 49, from the Google Books scan;
- the fonts: SIL Open Font License (see `fonts/`);
- the map: drawn from Natural Earth data (public domain).

The site carries `noindex` until a specialist has reviewed it; remove the `robots` meta tag from the five
pages to let search engines index it.
