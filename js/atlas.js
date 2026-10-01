/* =========================================================================
   atlas.js — "The Squares": every square and every figure around the track,
   on the board and as a grid; each opens its full annotation.
   Deep links: atlas.html#39 (a square) or atlas.html#corner-clock (a figure).
   Opening an entry adds a history entry, so Back (or the Android back gesture)
   closes the drawer; a deep link opens its entry once the draft notice is dismissed.
   ========================================================================= */
(function () {
  const { $, $$, esc } = FC.util;
  let ed = FC.prefs.get('edition', 'C'), show = 'adorned', viewer;
  if (!FC.EDITIONS[ed]) ed = 'C';
  const FEATURES = ['gate', 'labour', 'corner-swan', 'corner-dolphin', 'corner-occasion', 'corner-clock', 'centre-sea', 'centre-man', 'title', 'plain'];
  let fromHistory = false;                       // the drawer is being closed by Back

  /** '39', 'sq39', 'corner-clock' → 39 or 'corner-clock'; anything else → null */
  function parse(key) {
    key = String(key).replace(/^sq/, '');
    if (/^\d+$/.test(key)) { const n = +key; return n >= 1 && n <= 63 ? n : null; }
    return Object.hasOwn(FC.annotations, key) ? key : null;
  }

  function open(key, push = true) {
    const k = parse(key);
    if (k === null) return;
    const n = typeof k === 'number' ? k : null;
    FC.drawer.open(FC.annotate(k, ed), n ? `Square ${n}` : '', () => {
      // closed by the user: step back past the entry we added, or clear a deep link's hash
      if (fromHistory) return;
      if (history.state && history.state.fc === 'drawer') history.back();
      else history.replaceState(null, '', location.pathname + location.search);
    });
    if (push && location.hash.slice(1) !== String(k)) history.pushState({ fc: 'drawer' }, '', '#' + k);
    const link = FC.drawer.body.querySelector('[data-show-on-board]');
    if (link) link.addEventListener('click', e => {
      e.preventDefault(); FC.drawer.close();
      viewer.el.scrollIntoView({ behavior: FC.util.reducedMotion() ? 'auto' : 'smooth', block: 'center' });
      setTimeout(() => { viewer.focusSquare(n); viewer.mark([n], 'focus'); }, 350);
    });
  }

  function grid() {
    let h = '';
    for (let n = 1; n <= 63; n++) {
      const ad = FC.sq.adorned(n, ed);
      if (show === 'adorned' && !ad) continue;
      const v = FC.sq.verse(n, ed);
      h += `<a href="#${n}" data-open="${n}" class="${ad ? '' : 'plain'}">${FC.img.pic(FC.sq.tile(n), '', 'loading="lazy" width="315" height="420"')}<div class="cap"><b>${n}</b>${ad ? esc(FC.sq.name(n, ed)) : 'plain'}${v ? `<div class="small muted" style="font-style:italic">${esc(v.en.split(' / ')[0])}…</div>` : ''}</div></a>`;
    }
    $('#grid').innerHTML = h;
    $('#feats').innerHTML = FEATURES.map(id => `<a href="#${id}" data-open="${id}">${FC.img.pic(FC.featureThumb(id), '', 'loading="lazy"')}<div class="cap">${esc(FC.annotations[id].title_en)}</div></a>`).join('');
  }

  function setEd(e) {
    ed = e; FC.prefs.set('edition', e);
    $$('#edsel button').forEach(b => b.setAttribute('aria-pressed', b.dataset.ed === e));
    viewer.showEdition(e);
    viewer.names($('#namesel') && $('#namesel').checked, e);
    grid();
  }

  const fromHash = () => decodeURIComponent(location.hash.slice(1));

  document.addEventListener('DOMContentLoaded', () => {
    viewer = new FC.Viewer($('#viewer'), { onSquare: n => open(n) });
    $$('#edsel button').forEach(b => {
      b.title = 'Printed by ' + FC.EDITIONS[b.dataset.ed].printer;
      b.addEventListener('click', () => setEd(b.dataset.ed));
    });
    $('#namesel').addEventListener('change', () => { FC.prefs.set('names', $('#namesel').checked); viewer.names($('#namesel').checked, ed); });
    $('#namesel').checked = FC.prefs.get('names', true);
    $$('#showsel button').forEach(b => b.addEventListener('click', () => {
      show = b.dataset.show; $$('#showsel button').forEach(x => x.setAttribute('aria-pressed', x === b)); grid();
    }));
    document.addEventListener('click', e => { const a = e.target.closest('[data-open]'); if (a) { e.preventDefault(); open(a.dataset.open); } });
    setEd(ed);
    // Back and Forward: the hash says which entry, if any, is open
    addEventListener('popstate', () => {
      const h = fromHash();
      if (h && parse(h) !== null) open(h, false);
      else if (FC.drawer.isOpen) { fromHistory = true; FC.drawer.close(); fromHistory = false; }
    });
    addEventListener('hashchange', () => { const h = fromHash(); if (h && parse(h) !== null && !FC.drawer.isOpen) open(h, false); });
    const h = fromHash();
    if (h && parse(h) !== null) FC.afterNotice(() => open(h, false));
  });
})();
