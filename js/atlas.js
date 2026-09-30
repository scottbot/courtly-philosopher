/* =========================================================================
   atlas.js — "The Squares": every square and every figure around the track,
   on the board and as a grid; each opens its full annotation.
   Deep links: atlas.html#39 (a square) or atlas.html#corner-clock (a figure).
   ========================================================================= */
(function () {
  const { $, $$, esc } = FC.util;
  let ed = FC.prefs.get('edition', 'C'), show = 'adorned', viewer;
  const FEATURES = [
    ['gate', 'img/feat/entrance_gate.jpg'], ['labour', 'img/sq/detail-04.jpg'], ['corner-swan', 'img/feat/corner_bl_swan.jpg'],
    ['corner-dolphin', 'img/feat/corner_tl_figure.jpg'], ['corner-occasion', 'img/feat/corner_tr_figure.jpg'],
    ['corner-clock', 'img/feat/corner_br_clock.jpg'], ['centre-sea', 'img/feat/field.jpg'], ['centre-man', 'img/feat/palm_man.jpg'],
    ['title', 'img/feat/signature.jpg'], ['plain', 'img/sq/tile-02.jpg'],
  ];

  function open(key) {
    const n = /^\d+$/.test(String(key)) ? +key : null;
    const k = n || key;
    if (!n && !FC.annotations[k]) return;
    FC.drawer.open(FC.annotate(k, ed), n ? `Square ${n}` : '', () => history.replaceState(null, '', location.pathname));
    history.replaceState(null, '', '#' + k);
    const link = FC.drawer.body.querySelector('[data-show-on-board]');
    if (link) link.addEventListener('click', e => { e.preventDefault(); FC.drawer.close(); viewer.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => { viewer.focusSquare(n); viewer.mark([n], 'focus'); }, 350); });
  }

  function grid() {
    let h = '';
    for (let n = 1; n <= 63; n++) {
      const ad = FC.sq.adorned(n, ed);
      if (show === 'adorned' && !ad) continue;
      const v = FC.sq.verse(n, ed);
      h += `<a href="#${n}" data-open="${n}" class="${ad ? '' : 'plain'}"><img loading="lazy" src="${FC.sq.tile(n)}" alt="Square ${n}"><div class="cap"><b>${n}</b>${ad ? esc(FC.sq.name(n, ed)) : 'plain'}${v ? `<div class="small muted" style="font-style:italic">${esc(v.en.split(' / ')[0])}…</div>` : ''}</div></a>`;
    }
    $('#grid').innerHTML = h;
    $('#feats').innerHTML = FEATURES.map(([id, img]) => `<a href="#${id}" data-open="${id}"><img loading="lazy" src="${img}" alt=""><div class="cap">${esc(FC.annotations[id].title_en)}</div></a>`).join('');
  }

  function setEd(e) {
    ed = e; FC.prefs.set('edition', e);
    $$('#edsel button').forEach(b => b.setAttribute('aria-pressed', b.dataset.ed === e));
    viewer.edition = e;
    if (e === 'G') { viewer.mark([59], 'variant'); viewer.labels([{ n: 59, text: 'Poverty (1587)' }, { n: 60, text: 'plain (1587)' }]); }
    else { viewer.mark([], 'variant'); viewer.labels([]); }
    viewer.names($('#namesel') && $('#namesel').checked, e);
    grid();
  }

  document.addEventListener('DOMContentLoaded', () => {
    viewer = new FC.Viewer($('#viewer'), { onSquare: n => open(n) });
    $$('#edsel button').forEach(b => b.addEventListener('click', () => setEd(b.dataset.ed)));
    $('#namesel').addEventListener('change', () => { FC.prefs.set('names', $('#namesel').checked); viewer.names($('#namesel').checked, ed); });
    $('#namesel').checked = FC.prefs.get('names', true);
    $$('#showsel button').forEach(b => b.addEventListener('click', () => {
      show = b.dataset.show; $$('#showsel button').forEach(x => x.setAttribute('aria-pressed', x === b)); grid();
    }));
    document.addEventListener('click', e => { const a = e.target.closest('[data-open]'); if (a) { e.preventDefault(); open(a.dataset.open); } });
    setEd(ed);
    const h = decodeURIComponent(location.hash.slice(1)).replace(/^sq/, '');
    if (h) open(h);
  });
})();
