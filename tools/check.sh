#!/bin/sh
# check.sh — rebuild everything generated into a scratch copy of the site and fail if any
# committed file differs from what the tools make; then run the rules tests and the checks
# of the plain pages (tests/plain_pages.py).
#
#   tools/check.sh                      data/, plain/ and the cache stamps (seconds)
#   tools/check.sh BOARD.jpg BOOK.pdf   also every image under img/ from the two masters
#                                       (about 5 minutes; byte-identical only with the
#                                       versions in tools/requirements.txt)
#
# Optional, if the research corpus is at hand (it is not in this repository):
#   CORPUS=/path/to/corpus [PDFS=/path/to/files] tools/check.sh
# also re-checks every verified quotation (tools/verify_quotes.py).
# The map (img/map-europe.svg) is not rebuilt here: see tools/make_map.mjs.
set -e
here=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -a "$here/." "$tmp/"
rm -rf "$tmp/.git"
(cd "$tmp" && python3 tools/build_data.py)      # prints its counts, and any warning (then stops)
if [ $# -eq 2 ]; then
  (cd "$tmp" && python3 tools/make_images.py "$1" "$2" >/dev/null)
elif [ $# -ne 0 ]; then
  echo "usage: tools/check.sh [BOARD.jpg BOOK.pdf]" >&2; exit 2
fi
node "$here/tests/engine.test.js" >/dev/null
echo "check: rules tests pass"
python3 "$tmp/tests/plain_pages.py"
if [ -n "$CORPUS" ]; then
  python3 "$here/tools/verify_quotes.py" --corpus "$CORPUS" ${PDFS:+--pdfs "$PDFS"} "$here"/content/*.md | tail -1
fi
if diff -r -q -x .git "$here" "$tmp"; then
  echo "check: all generated files match"
else
  echo "check: the files above differ from what the tools make: rebuild, look at the differences, and commit them" >&2
  exit 1
fi
