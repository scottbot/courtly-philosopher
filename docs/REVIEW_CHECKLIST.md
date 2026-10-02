# Checklists: releasing a version, and the change from draft to reviewed

## Releasing a version

1. Set the version and date in every place the edition names them, all to the same values:
   `CHANGELOG.md` (a new entry, listing what changed and any anchor that changed; see
   `docs/ANCHORS.md`), `CITATION.cff` (`version`), the README (the line under the title and
   "How to cite"), and the credits on About (`js/about.js`).
2. Rebuild and check:
   ```
   python3 tools/build_data.py
   tools/check.sh
   python3 tools/verify_quotes.py --corpus <corpus folder> --pdfs <folder of the source PDFs> content/*.md
   node tests/engine.test.js
   python3 tests/play_smoke.py
   ```
   The build must print no warnings, and `tools/check.sh` must report that every generated file
   matches.
3. Look at the five pages, and at the pages in `plain/`, with JavaScript on and off, and in a print
   preview: each must show the draft notice (or, after review, the reviewed notice) and the credits.
4. Before the first push from a new machine or account, check the commit email (README,
   "Publishing").
5. Commit, tag the version (`git tag v0.2`), and push. Images that have to be regenerated are best
   regenerated in a release of their own: each regeneration adds the full size of `img/` to the
   repository's history.

## When a specialist has reviewed the edition

Do all of this in one release, so that no page says "draft" while another says "reviewed".

1. **Search engines.** Remove `<meta name="robots" content="noindex">` from `index.html`,
   `play.html`, `atlas.html`, `text.html`, `about.html` and `404.html`, and from the page template
   of the plain pages in `tools/build_data.py`, then rebuild.
2. **The draft notice** that opens on every page: its text is in `js/common.js` (search for
   "draft notice"). Replace it with a statement of who reviewed the edition, when, and what the
   review covered, or remove it.
3. **The other places that say "draft".** The footer sentence "An AI-produced draft, not reviewed
   by a specialist." in each of the five pages; the `<noscript>` notice in each page; the notice at
   the top of each plain page (written by `tools/build_data.py`); the print stylesheet's heading line
   (`css/style.css`, `@media print`); the credits on About (`js/about.js`); the editorial note,
   section D of `content/E_story_about.md`; the README ("Who made it", "Rights", the `noindex`
   paragraphs); `CITATION.cff` (`message`). Then search for any left:
   ```
   grep -rniI 'draft\|not reviewed\|specialist\|noindex' --exclude-dir=img --exclude-dir=fonts .
   ```
4. **Credits.** Name the reviewer, and what they reviewed, in the credits on About, in the
   editorial note, in the README and in `CHANGELOG.md`, in the words the reviewer approves. Keep
   the account of who made the edition (Claude) as it is: the review does not change who made it.
5. **Version.** A new version number, chosen by the editor, in every place listed under
   "Releasing a version".
6. Release as above.
