"""Smoke test of the Play page in a real browser (Playwright, Chromium).

Run from the site root with a local server:
    python3 -m http.server 8765 &
    python3 tests/play_smoke.py http://localhost:8765/play.html

Checks, with no console errors or page errors anywhere:
  1. a full three-player game on a phone-sized and a desktop screen, to the victory card;
  2. a double click on Continue does not dismiss the next card unread (15 → 26);
  3. "End this game" during the dice roll and during the hop leaves no error;
  4. a reload while a card is open shows that card again on "Resume it".
Dice are forced, where needed, by wrapping FC.engine.Game.prototype.roll.
"""
import json, sys, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/play.html'
RIG = """(() => { const G = FC.engine.Game.prototype, orig = G.roll; window.__dice = [];
  G.roll = function (v) { if (v) return orig.call(this, v); const d = window.__dice.shift();
    return d ? { dice: d, total: d.reduce((a, b) => a + b, 0) } : orig.call(this); }; })();"""


def visible(page, sel):
    loc = page.locator(sel)
    for i in range(loc.count()):
        if loc.nth(i).is_visible():
            return loc.nth(i)
    return None


def open_page(browser, vp, motion=False):
    ctx = browser.new_context(viewport=vp, reduced_motion='no-preference' if motion else 'reduce')
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append('pageerror: %s' % e))
    page.on('console', lambda m: errors.append('%s: %s' % (m.type, m.text)) if m.type in ('error', 'warning') else None)
    page.on('dialog', lambda d: d.accept())
    page.goto(URL)
    page.click('dialog.ai-notice button')
    page.evaluate(RIG)
    return ctx, page, errors


def click_continue(page):
    c = visible(page, '[data-continue]')
    assert c, 'no card on screen'
    time.sleep(0.4)                     # the page ignores a click in the first 350 ms (double-click guard)
    c.click()


def settle(page, limit=30):
    """Read every card until the next throw can be made."""
    t0 = time.time()
    while not visible(page, '.throw-btn:not([disabled])'):
        assert time.time() - t0 < limit, 'stuck'
        if visible(page, '[data-continue]'):
            click_continue(page)
        time.sleep(0.1)


def force(page, dice):
    page.evaluate('window.__dice.push(%s)' % json.dumps(dice))


def full_game(browser, vp, limit=600):
    ctx, page, errors = open_page(browser, vp)
    page.click('#begin')
    t0 = time.time()
    while not visible(page, '.victory'):
        assert time.time() - t0 < limit, 'game did not end'
        if visible(page, '[data-continue]'):
            click_continue(page)
        elif visible(page, '.throw-btn:not([disabled])'):
            visible(page, '.throw-btn:not([disabled])').click()
        time.sleep(0.05)
    assert page.locator('.victory .career-list > li').count() >= 3
    ctx.close()
    return errors


def main():
    problems = []
    with sync_playwright() as p:
        br = p.chromium.launch()
        for vp in ({'width': 1280, 'height': 850}, {'width': 390, 'height': 844}):
            problems += full_game(br, vp)
            # double click on Continue: Pedro throws 6 (square 6), Diego 2, Rodrigo 3, then Pedro 9 → 15 → 26
            ctx, page, errors = open_page(br, vp)
            page.click('#begin'); click_continue(page)
            for d in ([3, 3], [1, 1], [1, 2]):
                settle(page); force(page, d); visible(page, '.throw-btn:not([disabled])').click(); time.sleep(0.3)
            settle(page); force(page, [4, 5]); visible(page, '.throw-btn:not([disabled])').click(); time.sleep(0.8)
            time.sleep(0.4); visible(page, '[data-continue]').dblclick(); time.sleep(0.5)
            nxt = visible(page, '[data-continue]')
            if not nxt or '26' not in nxt.locator('xpath=ancestor::article[1]').inner_text():
                problems.append('double click skipped the card for 26 (%s)' % vp['width'])
            problems += errors; ctx.close()
        # End this game mid-roll and mid-hop
        for wait in (0.1, 0.9):
            ctx, page, errors = open_page(br, {'width': 1280, 'height': 850}, motion=True)
            page.click('#begin'); click_continue(page)
            force(page, [6, 5]); visible(page, '.throw-btn:not([disabled])').click(); time.sleep(wait)
            page.click('#quit'); time.sleep(2.5)
            if not page.locator('#begin').count():
                problems.append('quit did not return to the setup screen')
            problems += errors; ctx.close()
        # reload during a card
        ctx, page, errors = open_page(br, {'width': 1280, 'height': 850})
        page.click('#begin'); click_continue(page)
        force(page, [2, 2]); visible(page, '.throw-btn:not([disabled])').click(); time.sleep(0.8)
        before = visible(page, '[data-continue]').locator('xpath=ancestor::article[1]').inner_text()[:30]
        page.reload(); page.click('dialog.ai-notice button'); page.click('#resume'); time.sleep(0.8)
        c = visible(page, '[data-continue]')
        if not c or c.locator('xpath=ancestor::article[1]').inner_text()[:30] != before:
            problems.append('reload during a card did not show the card again')
        problems += errors; ctx.close()
        br.close()
    if problems:
        print('FAILED'); print('\n'.join(problems)); sys.exit(1)
    print('play smoke test: ok')


if __name__ == '__main__':
    main()
