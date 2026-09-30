/* =========================================================================
   story.js — the scrolling introduction on index.html.

   The board stays fixed on one side; as each scene scrolls into the middle of
   the screen, the board glides to the part the scene is about (or the pages of
   the 1588 book appear). Scene texts come from content/E_story_about.md.
   ========================================================================= */
(function () {
  const { $, $$, esc } = FC.util;
  const W = 2594, H = 3402, OX = 56, OY = 100;             // sheet crop (see tools/make_images.py)
  const px = (x0, y0, x1, y1) => [(x0 - OX) / W, (y0 - OY) / H, (x1 - OX) / W, (y1 - OY) / H];

  // For each scene: a title, and what the board (or book) should show.
  const SCENES = {
    'madrid-1587':      { title: 'Madrid, 1587', rect: px(100, 180, 2600, 1100) },
    'barros':           { title: 'The king’s servant', rect: px(1780, 3250, 2620, 3470) },
    'goose-arrives':    { title: 'A game from Florence', square: 15 },
    'moral-map':        { title: 'A map of a career', rect: px(56, 100, 2650, 3502), mark: FC.sq.LABOUR, markCls: 'focus' },
    'sheet-and-book':   { title: 'A sheet and a little book', book: ['p007', 'p009'], caption: 'Title page and royal licence of the Naples edition, 1588 (Vienna, ÖNB 35 V 49)' },
    'reading-a-square': { title: 'How to read a square', square: 26 },
    'three-editions':   { title: 'Three editions in a year', book: ['p015', 'p066'], caption: 'Cervantes’s sonnet, and the first page of the rules, in the Naples edition of 1588' },
    'naples-cartaro':   { title: 'Naples, 1588', rect: px(1760, 3330, 2620, 3470) },
    'the-pot':          { title: 'The pot and the palm', rect: px(1080, 1730, 1760, 2690) },
    'cervantes':        { title: 'A sonnet by Cervantes', rect: px(930, 980, 1850, 2000) },
    'enter':            { title: 'Your turn', rect: px(150, 2590, 1000, 3460) },
  };

  let viewer;
  /** In the introduction the board is always in view, so its "(board)" citations are dropped. */
  function quiet(h) {
    return h.replace(/(; )?<a class="cite" href="about\.html#about-board" data-key="ref:board">board<\/a>(; )?/g, (m, a, b) => (a && b ? '; ' : ''))
            .replace(/<span class="cites">\(\)<\/span>/g, '').replace(/ +([.,;:])/g, '$1');
  }
  function show(id) {
    const s = SCENES[id] || {};
    const bv = $('#bookview');
    if (s.book) {
      $('.pages', bv).innerHTML = s.book.map(p => `<img src="img/book/${p}.jpg" alt="${esc(s.caption || '')}">`).join('');
      bv.classList.add('on');
      return;
    }
    bv.classList.remove('on');
    viewer.mark(s.mark || [], 'focus');
    if (s.square) { viewer.focusSquare(s.square, true, 3.4); viewer.mark([s.square], 'focus'); }
    else if (s.rect) viewer.focusRect(...s.rect, true);
  }

  document.addEventListener('DOMContentLoaded', () => {
    viewer = new FC.Viewer($('#viewer'), { src: 'img/board/board-2000.jpg', tools: false, tips: false, onSquare: null, wheel: false });
    viewer.el.style.height = '100%';
    const steps = $('#steps');
    FC.story.scenes.forEach((sc, i) => {
      const meta = SCENES[sc.id] || { title: '' };
      steps.insertAdjacentHTML('beforeend', `<article class="scene card" data-id="${sc.id}">
        <div class="card-inner"><div class="scene-n">${['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'][i]}</div>
        <h2>${esc(meta.title)}</h2>${quiet(sc.html)}
        ${meta.book ? `<p class="small muted">${esc(meta.caption)}</p>` : ''}
        ${sc.id === 'enter' ? '<p><a class="btn primary" href="play.html">Enter and play</a></p>' : ''}</div></article>`);
    });
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          $$('.scene.active').forEach(x => x.classList.remove('active'));
          e.target.classList.add('active');
          show(e.target.dataset.id);
        }
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    $$('.scene').forEach(s => io.observe(s));
  });
})();
