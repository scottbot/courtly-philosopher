/* =========================================================================
   story.js — the scrolling introduction on index.html.

   The board stays fixed on one side; as each scene scrolls into the middle of
   the screen, the board glides to the part the scene is about (or pages of the
   1588 book, or an upright detail of a square, appear). Scene texts come from
   content/E_story_about.md, section A, in that order; each "### id" there needs an
   entry below (a title and what to show). The "visual:" lines in the content are
   notes for the editor and are not read.
   ========================================================================= */
(function () {
  const { $, $$, esc } = FC.util;
  const S = FC.board.sheet, [OX, OY] = S.crop;                 // the sheet's crop in photo pixels
  const px = (x0, y0, x1, y1) => [(x0 - OX) / S.w, (y0 - OY) / S.h, (x1 - OX) / S.w, (y1 - OY) / S.h];
  const BOOK = 'Vienna, ÖNB 35 V 49; Google Books';

  // For each scene: a title; what to show (rect: a part of the board, in photo pixels;
  // square: one square, outlined; book: pages of the 1588 book; image: one picture);
  // and "more": where to read further.
  const SCENES = {
    'madrid-1587':      { title: 'Madrid, 1587', rect: px(56, 100, 2650, 3502),
                          more: [['about.html#about-court', 'The court and its petitioners'], ['about.html#about-glance', 'Who’s who, words, dates']] },
    'barros':           { title: 'The king’s servant', rect: px(1780, 3250, 2620, 3470),
                          more: [['about.html#about-barros', 'Alonso de Barros']] },
    'goose-arrives':    { title: 'A game from Florence', square: 15,
                          more: [['about.html#about-goose', 'The Game of the Goose'], ['atlas.html#15', 'Square 15, the Pass of Hope']] },
    'moral-map':        { title: 'A map of a career', rect: px(56, 100, 2650, 3502), mark: FC.sq.LABOUR, markCls: 'focus',
                          more: [['atlas.html#labour', 'The nine Labor squares'], ['atlas.html#46', 'The Death of the Patron']] },
    'sheet-and-book':   { title: 'A sheet and a little book',
                          book: [['p007', 'Title page of the Naples edition, 1588'], ['p009', 'First page of the royal license, Naples edition, 1588']],
                          caption: `Title page and royal license of the Naples edition, 1588 (${BOOK})`,
                          more: [['text.html#C-022b', 'Read the book'], ['about.html#about-kind', 'What kind of book?']] },
    'reading-a-square': { title: 'How to read a square', square: 26,
                          image: ['img/sq/detail-26.jpg', 'Square 26, the Favorite, turned upright: a man at a doorway offers something to another; above, the label “Paga”; below, the heading and two couplets'],
                          caption: 'Square 26, turned upright. Detail of Cartaro’s board, Naples 1588. © The Trustees of the British Museum',
                          more: [['atlas.html#26', 'Square 26 in full'], ['atlas.html', 'All the squares']] },
    'what-for':         { title: 'What it was for', square: 1, rect: px(150, 2590, 1000, 3460),
                          more: [['text.html#C-016a', 'Barros to the reader'], ['atlas.html#gate', 'The gate'], ['atlas.html#1', 'Square 1']] },
    'three-editions':   { title: 'Three editions in a year',
                          book: [['p015', 'Cervantes’s sonnet in the Naples edition, 1588'], ['p066', 'First page of the rules in the Naples edition, 1588']],
                          caption: `Cervantes’s sonnet, and the first page of the rules, in the Naples edition of 1588 (${BOOK})`,
                          more: [['about.html#about-editions', 'The three editions'], ['text.html', 'Read the book']] },
    'naples-cartaro':   { title: 'Naples, 1588', rect: px(1760, 3330, 2620, 3470),
                          more: [['about.html#about-board', 'The board of 1588']] },
    'the-pot':          { title: 'The pot and the palm', rect: px(1080, 1730, 1760, 2690),
                          more: [['atlas.html#63', 'The Palm'], ['about.html#about-money', 'Playing for money'], ['about.html#about-rules', 'How the game is played']] },
    'cervantes':        { title: 'A sonnet by Cervantes', rect: px(930, 980, 1850, 2000),
                          more: [['text.html#C-015a', 'Cervantes’s sonnet'], ['atlas.html#centre-sea', 'The Sea of Suffering']] },
    'barros-board':     { title: 'Barros on his own board', square: 46,
                          more: [['atlas.html#46', 'Square 46 in full'], ['about.html#about-barros', 'Alonso de Barros']] },
    'enter':            { title: 'Your turn', rect: px(150, 2590, 1000, 3460),
                          more: [['atlas.html#gate', 'The gate'], ['atlas.html#1', 'Square 1'], ['about.html#about-rules', 'How the game is played']] },
  };

  function roman(n) {
    let s = '';
    for (const [v, r] of [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (n >= v) { s += r; n -= v; }
    return s;
  }

  let viewer;
  /** In the introduction the board is always in view, so its "(board)" citations are dropped. */
  function quiet(h) {
    const t = document.createElement('template');
    t.innerHTML = h;
    t.content.querySelectorAll('.cites').forEach(sp => {
      if (!sp.querySelector('.cite-board')) return;
      const rest = Array.from(sp.querySelectorAll('a.cite:not(.cite-board)'));
      if (rest.length) { sp.innerHTML = '(' + rest.map(a => a.outerHTML).join('; ') + ')'; return; }
      const prev = sp.previousSibling, next = sp.nextSibling;
      sp.remove();
      // "… a doorway (board)." → "… a doorway."; "… pay (board) (Collar 2009)" → "… pay (Collar 2009)"
      if (prev && prev.nodeType === 3 && (!next || next.nodeType === 3)) prev.data = prev.data.replace(/\s+$/, '');
    });
    return t.innerHTML;
  }

  function show(id) {
    const s = SCENES[id] || {};
    const bv = $('#bookview');
    const on = !!(s.book || s.image);
    if (on) {
      $('.pages', bv).innerHTML = s.book
        ? s.book.map(([p, alt]) => FC.img.pic(`img/book/${p}.jpg`, alt)).join('')
        : FC.img.pic(s.image[0], s.image[1], 'class="single"');
    }
    bv.classList.toggle('on', on);
    bv.setAttribute('aria-hidden', String(!on));
    bv.inert = !on;
    if (s.book) return;
    viewer.mark(s.mark || [], 'focus');
    if (s.rect) viewer.focusRect(...s.rect, true);
    else if (s.square) viewer.focusSquare(s.square, true, 3.4);
    if (s.square) viewer.mark([s.square], 'focus');
  }

  document.addEventListener('DOMContentLoaded', () => {
    viewer = new FC.Viewer($('#viewer'), { tools: false, tips: false, onSquare: null, wheel: false });
    viewer.el.style.height = '100%';
    const bv = $('#bookview'); bv.setAttribute('aria-hidden', 'true'); bv.inert = true;
    const steps = $('#steps');
    FC.story.scenes.forEach((sc, i) => {
      // a scene not listed in SCENES takes its title from a "title:" line and shows the whole board
      const meta = SCENES[sc.id] || { title: sc.title || '', rect: px(56, 100, 2650, 3502) };
      if (!SCENES[sc.id]) SCENES[sc.id] = meta;
      const more = (meta.more || []).map(([href, label]) => `<a href="${href}">${esc(label)}</a>`).join(' ');
      steps.insertAdjacentHTML('beforeend', `<article class="scene card" id="scene-${esc(sc.id)}" data-id="${esc(sc.id)}">
        <div class="card-inner"><div class="scene-n">${roman(i + 1)}</div>
        <h2>${esc(meta.title || sc.title)}</h2>${quiet(sc.html)}
        ${meta.caption ? `<p class="small muted">${esc(meta.caption)}</p>` : ''}
        ${sc.id === 'enter' ? '<p><a class="btn primary" href="play.html">Enter and play</a></p>' : ''}
        ${more ? `<p class="small more"><span class="muted">More:</span> ${more}</p>` : ''}</div></article>`);
    });
    // Which scene is current: the last one whose top has passed a reading line. On wide screens
    // the line is 40% down the screen, so a long scene's heading is still in view; on phones,
    // where the board sits on top, it is a little below the bottom of the board's panel.
    const sticky = $('.scrolly .sticky'), scenes = $$('.scene');
    const tag = document.createElement('div');
    tag.className = 'scene-tag'; tag.setAttribute('aria-hidden', 'true');
    sticky.append(tag);
    const total = roman(scenes.length);
    let current = null, ticking = false;
    function readingLine() {
      // stacked (board above the text) only on narrow screens that are not a phone on its side;
      // keep in step with the two max-width: 900px blocks in css/style.css
      const stacked = matchMedia('(max-width: 900px)').matches &&
        !matchMedia('(orientation: landscape) and (max-height: 540px)').matches;
      if (!stacked) return innerHeight * 0.4;
      const b = sticky.getBoundingClientRect().bottom;
      return b + Math.min(140, (innerHeight - b) * 0.3);
    }
    function pick() {
      ticking = false;
      const y = readingLine();
      let el = scenes[0];
      for (const s of scenes) { if (s.getBoundingClientRect().top <= y) el = s; else break; }
      if (el === current) return;
      if (current) current.classList.remove('active');
      el.classList.add('active'); current = el;
      const i = scenes.indexOf(el);
      tag.innerHTML = `<b>${roman(i + 1)}</b> of ${total} · ${esc(SCENES[el.dataset.id].title || '')}`;
      show(el.dataset.id);
    }
    const queue = () => { if (!ticking) { ticking = true; requestAnimationFrame(pick); } };
    addEventListener('scroll', queue, { passive: true });
    // the panel changes size when the screen turns: refit the current view
    addEventListener('resize', () => { if (current) show(current.dataset.id); queue(); });
    pick();
  });
})();
