/* =========================================================================
   play.js — the Play page: setup, the board or the unrolled path, and the
   turn-by-turn reading of every square a player lands on.

   Flow: setup → new FC.engine.Game → an opening card at the Gate (not a move) →
   on "Throw", game.play() returns steps → the steps are shown one by one; every
   adorned square reached (by throw, by Labor, or by being sent there) opens a
   card that must be clicked through. At the end, "Your careers at court" lists
   the figured squares each player reached.

   Screen readers: one status region (#say) receives one composed message each
   time the game waits for the players (a card, or the next throw).
   ========================================================================= */
(function () {
  const { $, $$, esc, html, plural } = FC.util;
  const E = FC.engine;
  const COLORS = ['#8e2c1c', '#2f5d62', '#9b7426', '#4a3d7a', '#3f6b2f', '#6b4a2f'];
  const col = id => COLORS[id] || COLORS[0];
  const WHY = {
    rebound: 'for counting back from the Palm', hope: 'the toll at the Pass of Hope', favourite: 'on reaching the Favorite',
    well: 'one to each of the other players', 'well-ropes': '<i lang="es">“para sogas”</i>, for the ropes',
    back: 'for going back', bumped: 'for going back', alms: 'as alms', win: 'the whole pot',
  };
  const BM = '© The Trustees of the British Museum';
  const SAVE_VERSION = 2;
  const NAMES = ['Pedro', 'Diego', 'Rodrigo', 'Juan', 'Isabel', 'Catalina', 'Luis', 'Ana'];
  const DEFAULT_PLAYERS = [{ name: 'Pedro', token: 'ring' }, { name: 'Diego', token: 'real' }, { name: 'Rodrigo', token: 'doblon' }];

  let game = null, setup = null, viewer = null, queue = [], busy = false, view = 'board', pending = [];
  let gen = 0;            // bumped when a game is left: pending timers and awaits then stop
  let shown = null;       // the player whose steps are on screen (null when waiting for a throw)
  let lastMove = '', turnThrow = null, lastState = null, lastPurse = {}, lastPot = null, deltas = {};
  let mbObserver = null, sayTimer = 0, spoken = [];

  const ed = () => setup.edition;
  const pl = id => game.players[id];
  const phone = () => matchMedia('(max-width: 899px)').matches;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Plain text of a piece of the page's own HTML (parsed inertly: no scripts, no image loads). */
  const toText = h => new DOMParser().parseFromString(String(h), 'text/html').body.textContent;
  const pic = (src, alt, attrs = '') => FC.img && FC.img.pic ? FC.img.pic(src, alt, attrs) : `<img src="${src}" alt="${esc(alt)}" ${attrs}>`;
  const tok = (id, token) => `<span class="tokwrap" style="border-color:${col(id)}">${FC.tokens.svg(token)}</span>`;
  /** A citation of the Naples book, in the form the build gives citations. */
  const cite = (pdf, pages) => `<span class="cites">(<a class="cite" href="text.html#pdf${pdf}" data-key="barrosFilosofiaCortesanaMoralizada1588">Barros 1588, ${/–/.test(pages) ? 'pp.' : 'p.'} ${pages}</a>)</span>`;
  /** A sentence end after a name that may already end in ? or … */
  const stop = t => /[?!.…]["”’]?$/.test(t) ? t : t + '.';
  /** A stretch of the edition's English of a Naples segment, copied from the data, never retyped. */
  function excerpt(id, from, to) {
    const s = ((FC.text && FC.text.C) || []).find(x => x.id === id);
    if (!s || !s.en) return '';
    const i = s.en.indexOf(from); if (i < 0) return '';
    const j = s.en.indexOf(to, i);
    return j < 0 ? '' : s.en.slice(i, j + to.length);
  }
  const listOr = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' or ' + a[a.length - 1];
  const ordinal = n => n + (n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : n % 10 === 1 && n % 100 !== 11 ? 'st' : 'th');

  /** Forget any turn in progress (a card left open, steps not yet shown, timers running). */
  function resetTurn() { gen++; busy = false; queue = []; pending = []; shown = null; turnThrow = null; spoken = []; }

  /* ------------------------------------------------------------ speech (one status region) */
  function note(t) { if (t) spoken.push(String(t)); }
  function say(extra = '') {
    const el = $('#say');
    const msg = spoken.concat(extra ? [extra] : []).join(' ').replace(/\s+/g, ' ').trim();
    spoken = [];
    if (!el) return;
    el.textContent = '';
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { el.textContent = msg; }, 60);
  }
  /** What a card says, without its buttons, credits or closed details. */
  function cardSpeech(root) {
    const c = root.cloneNode(true);
    c.querySelectorAll('.actions, .credit, .cites, .es-dup, [aria-hidden="true"], details > :not(summary)').forEach(x => x.remove());
    c.querySelectorAll('*').forEach(x => x.after(' '));
    return c.textContent;
  }

  /* ------------------------------------------------------------ the rules in brief */
  const HOWTO = `<div class="notice howto"><h2 class="howto-h sc">How the game goes</h2><ul class="howto-list">
    <li>Throw, and move that many squares. Most squares are plain; the 26 with figures and verses are each shown for you to read out, and many of them send you on or back, or make you pay.</li>
    <li>Two cannot share a square: if you land on a rival, they must take the square you have just left.</li>
    <li>Misfortunes cost stakes, paid into the pot or to the other players.</li>
    <li>Land exactly on 63, the Palm, and you take the whole pot. Throw too much and you count back, paying a stake.</li></ul>
    <p class="small" style="margin:0"><a href="about.html#about-rules">How the game is played, in full →</a></p></div>`;

  /* ------------------------------------------------------------ setup */
  function validPlayers(v) {
    const okTok = t => FC.tokens.list.some(x => x.id === t);
    return Array.isArray(v) && v.length >= 2 && v.length <= 6
      && v.every(p => p && typeof p.name === 'string' && okTok(p.token))
      && new Set(v.map(p => p.token)).size === v.length;
  }
  function validSavedPlayers(v) {
    return Array.isArray(v) && v.length >= 2 && v.length <= 6 && v.every(p => p && typeof p.name === 'string' && FC.tokens.list.some(x => x.id === p.token));
  }
  function validSetup(s) {
    return s && typeof s === 'object' && FC.EDITIONS[s.edition] && [1, 2].includes(s.dice)
      && ['all', 'overshoot'].includes(s.backPay) && [1, 2].includes(s.fortuneThrows) && Number.isFinite(s.purse);
  }

  function renderSetup() {
    resetTurn();
    if (mbObserver) { mbObserver.disconnect(); mbObserver = null; }
    document.documentElement.style.scrollPaddingBottom = '';
    let saved = FC.prefs.get('game', null);
    if (!saved || typeof saved !== 'object' || ![1, SAVE_VERSION].includes(saved.v) || !validSetup(saved.setup)
        || !saved.g || !validSavedPlayers(saved.g.players)) saved = null;
    let players = FC.prefs.get('players', null);
    if (!validPlayers(players)) players = DEFAULT_PLAYERS.map(p => Object.assign({}, p));
    players = players.map(p => ({ name: p.name.slice(0, 24), token: p.token }));
    const o = FC.prefs.get('options', {}), opts = o && typeof o === 'object' ? o : {};
    let edition = FC.prefs.get('edition', 'C'); if (!FC.EDITIONS[edition]) edition = 'C';
    $('#app').innerHTML = `
    <section class="setup">
      <p class="kicker sc" style="color:var(--rubric);letter-spacing:.08em;margin:0">A game for two or more, on one screen</p>
      <h1 style="margin-top:.2em">Enter through the Gate of Opinion</h1>
      <p class="measure">Each player is a petitioner at the court of Philip II. You move by the dice from the Gate of Opinion toward the Palm of Victory at the center, through sixty-three squares that stand, says Barros in Madrigal’s Madrid edition of 1587, for <i lang="es">“los años de la vida que se gastan en una pretensión y los que también la gastan a ella”</i> — the years of life that are spent in a petition, and the years that also wear the petition out. Every square with a figure that you land on is shown for you to read out, as the book was read beside the sheet.</p>
      <p class="measure small muted">The game was new at court. In August 1585 the king’s jester wrote from Monzón that the prince, the infanta and a third player had won forty escudos from him at a game of the goose played with two dice ${'<span class="cites">(<a class="cite" href="about.html#bib-infantesPinturaQueSe2010" data-key="infantesPinturaQueSe2010">Infantes 2010, 134–35</a>)</span>'}. <a href="about.html#about-goose">Where the game came from →</a></p>
      ${saved && !saved.over ? `<p class="notice">A game is in progress (round ${+saved.round || 1}). <button class="btn small primary" id="resume">Resume it</button> <button class="btn small" id="discard">Start afresh</button></p>` : ''}
      <fieldset><legend>The players</legend>
        <p class="small muted">Barros’s worked example has three players: Pedro with a ring, Diego with a <i lang="es">real de a dos</i> (a silver two-real coin), Rodrigo with a <i lang="es">doblón</i> (a gold doubloon). He asks only that every marker be different. The one listed first plays first (<i lang="es">“jugó Pedro de mano”</i>, Pedro played first).</p>
        <div class="player-rows" id="rows"></div>
        <p style="margin:.6rem 0 0"><button class="btn small" id="add" type="button">+ Add a player</button></p>
      </fieldset>
      <fieldset><legend>Which edition?</legend>
        <p class="small muted">Three editions appeared within a year. You always play on the only board known to survive, Cartaro’s of 1588; the choice changes the verses and texts where the editions differ, and, for the first edition, the square of Poverty. <a href="about.html#about-editions">About the editions</a>.</p>
        <div class="version-cards">${['C', 'M', 'G'].map(k => `
          <label><input type="radio" name="ed" value="${k}" ${edition === k ? 'checked' : ''}> <span class="vt">${FC.EDITIONS[k].short}</span>
          <div class="vd">${{ C: 'The book printed with the surviving board: Italian and Spanish verses, Italian rule labels on the sheet.', M: 'The second edition, printed by Pedro Madrigal: expanded, with Barros’s full rules and worked example. Its own board is lost.', G: 'The first edition, printed by the widow of Alonso Gómez: Poverty stands on square 59, and four of its eight later Labor verses are its own, the other four in a different order. Its board is lost.' }[k]}</div></label>`).join('')}
        </div>
      </fieldset>
      ${HOWTO}
      <details class="sect"><summary>Rules where the sources are silent</summary>
        <p class="small">Barros leaves some things unsaid. Our choices, and the alternatives, are explained on <a href="about.html#about-rules">How the game is played</a>.</p>
        <div class="opt-row"><label for="o-dice">Dice</label><select id="o-dice"><option value="2">two dice (as in Madrigal’s Madrid edition, 1587)</option><option value="1">one die (“el dado”, as in the first edition and Naples 1588)</option></select>
          <span class="small muted">two dice: about 10 minutes for three players; one die: about twice as long</span></div>
        <div class="opt-row"><label for="o-back">Paying for going back</label><select id="o-back"><option value="all">every move back costs one stake</option><option value="overshoot">only counting back from the Palm</option></select></div>
        <div class="opt-row"><label for="o-fortune">House of Fortune (51)</label><select id="o-fortune"><option value="1">one extra throw</option><option value="2">two extra throws</option></select></div>
        <div class="opt-row"><label for="o-purse">Stakes in each purse</label><input id="o-purse" type="number" min="5" max="200" value="20"></div>
      </details>
      <p style="margin-top:1.4rem"><button class="btn primary" id="begin" type="button">Put your stakes in the pot, and begin ☞</button></p>
    </section>`;
    const rows = $('#rows');
    function drawRows() {
      rows.innerHTML = players.map((p, i) => {
        const who = esc(p.name) || 'player ' + (i + 1);
        return `
        <div class="player-row" data-i="${i}">
          <span class="swatch" style="background:${col(i)}" aria-hidden="true"></span>
          <input type="text" value="${esc(p.name)}" aria-label="Name of player ${i + 1}" maxlength="24">
          <div class="tok-pick" role="radiogroup" aria-label="Marker for ${who}">${FC.tokens.list.map(t => `<button type="button" role="radio" title="${esc(t.name)}" aria-label="${esc(t.name)}" aria-checked="${p.token === t.id}" tabindex="${p.token === t.id ? 0 : -1}" data-tok="${t.id}">${FC.tokens.svg(t.id)}</button>`).join('')}</div>
          <button class="btn small" type="button" data-del ${players.length <= 2 ? 'disabled' : ''} aria-label="Remove ${who}">✕</button>
        </div>`;
      }).join('');
      $$('.player-row', rows).forEach(r => {
        const i = +r.dataset.i;
        $('input', r).addEventListener('input', e => { players[i].name = e.target.value; });
        const pick = t => {
          const other = players.find((q, j) => j !== i && q.token === t);
          if (other) other.token = players[i].token;              // swap: markers must differ
          players[i].token = t; drawRows();
          const again = $(`.player-row[data-i="${i}"] [data-tok="${t}"]`, rows); if (again) again.focus();
        };
        $$('[data-tok]', r).forEach(b => b.addEventListener('click', () => pick(b.dataset.tok)));
        // one tab stop per player; the arrow keys move between markers, as in a radio group
        $('.tok-pick', r).addEventListener('keydown', e => {
          const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
          if (!d) return;
          e.preventDefault();
          const L = FC.tokens.list, k = L.findIndex(t => t.id === players[i].token);
          pick(L[(k + d + L.length) % L.length].id);
        });
        $('[data-del]', r).addEventListener('click', () => { players.splice(i, 1); drawRows(); $('#add').focus(); });
      });
      $('#add').disabled = players.length >= 6;
    }
    drawRows();
    $('#add').addEventListener('click', () => {
      const used = players.map(p => p.token), free = FC.tokens.list.find(t => !used.includes(t.id));
      const names = players.map(p => p.name.trim());
      players.push({ name: NAMES.find(n => !names.includes(n)) || 'Petitioner', token: free.id });
      drawRows();
    });
    $('#o-dice').value = String(opts.dice === 1 ? 1 : 2); $('#o-back').value = opts.backPay === 'overshoot' ? 'overshoot' : 'all';
    $('#o-fortune').value = String(opts.fortuneThrows === 2 ? 2 : 1); $('#o-purse').value = FC.util.clamp(+opts.purse || 20, 5, 200);
    $('#begin').addEventListener('click', () => {
      const chosen = $('input[name=ed]:checked'), edition = chosen && FC.EDITIONS[chosen.value] ? chosen.value : 'C';
      const options = { edition, dice: +$('#o-dice').value === 1 ? 1 : 2, backPay: $('#o-back').value === 'overshoot' ? 'overshoot' : 'all',
        fortuneThrows: +$('#o-fortune').value === 2 ? 2 : 1, purse: FC.util.clamp(Math.round(+$('#o-purse').value) || 20, 5, 200) };
      const ps = players.map((p, i) => ({ name: p.name.trim() || `Player ${i + 1}`, token: p.token, color: col(i) }));
      FC.prefs.set('players', players); FC.prefs.set('options', options); FC.prefs.set('edition', edition);
      start(ps, options);
    });
    window.scrollTo(0, 0);
    if (saved && !saved.over) {
      $('#resume').addEventListener('click', () => resume(saved));
      $('#discard').addEventListener('click', () => { FC.prefs.set('game', null); renderSetup(); });
    }
  }

  /* ------------------------------------------------------------ start / save */
  function initRecords() {
    game.log = [{ t: `Each player puts one stake in the pot: the pot holds ${game.pot}.` }];
    game.careers = game.players.map(() => []);
    game.seen = {};                    // square → visits this game (for the shorter repeat cards)
    game.flags = { rebound: false, bump: false, credit: {} };
    game.fortuneOpen = null;           // a Fortune visit whose extra throws are still being played
  }
  function start(players, options) {
    resetTurn();
    setup = options;
    game = new E.Game(players, options);
    initRecords();
    lastMove = '';
    renderGame();
    save();
    opening();
  }
  function save() {
    if (!game) return;
    const g = Object.assign({}, game); delete g.history;
    FC.prefs.set('game', { v: SAVE_VERSION, setup, g, over: game.over, round: game.round, queue, shown, lastMove, turnThrow });
  }
  function resume(saved) {
    try {
      resetTurn();
      setup = saved.setup;
      game = new E.Game(saved.g.players.map(p => ({ name: String(p.name), token: p.token })), setup);
      const keep = { log: game.log };
      Object.assign(game, saved.g); game.history = [];
      game.opt = Object.assign({}, E.DEFAULTS, setup);
      if (!validSavedPlayers(game.players) || game.players.length !== saved.g.players.length) throw new Error('bad save');
      game.players.forEach((p, i) => { p.id = i; p.name = String(p.name); p.pos = FC.util.clamp(+p.pos || 0, 0, 63); p.purse = +p.purse || 0; p.skip = p.skip ? 1 : 0; });
      // older saves kept the record of play as HTML; keep only its text
      game.log = (Array.isArray(game.log) ? game.log : keep.log || []).map(l => typeof l === 'string' ? { t: toText(l), b: /^<b>/.test(l) } : { t: String(l && l.t || ''), b: !!(l && l.b) });
      if (!Array.isArray(game.careers) || game.careers.length !== game.players.length) game.careers = game.players.map(() => []);
      if (!game.seen || typeof game.seen !== 'object') game.seen = {};
      if (!game.flags || typeof game.flags !== 'object') game.flags = { rebound: false, bump: false, credit: {} };
      if (!game.flags.credit) game.flags.credit = {};
      game.turn = FC.util.clamp(+game.turn || 0, 0, game.players.length - 1);
      lastMove = typeof saved.lastMove === 'string' ? saved.lastMove : '';
      log('(Game resumed.)');
      const q = saved.v === SAVE_VERSION && Array.isArray(saved.queue) ? saved.queue.filter(s => s && typeof s.type === 'string' && s.state && Array.isArray(s.state.players)) : [];
      if (q.length) {
        shown = Number.isInteger(saved.shown) && saved.shown >= 0 && saved.shown < game.players.length ? saved.shown : null;
        turnThrow = saved.turnThrow && Array.isArray(saved.turnThrow.dice) ? saved.turnThrow : null;
        game.opened = true;
        queue = q; busy = true;
        renderGame(true);
        pump();
      } else {
        if (saved.v !== SAVE_VERSION) game.opened = true;       // saves from before the opening card
        renderGame();
        if (!game.opened) opening();
      }
    } catch (e) {
      FC.prefs.set('game', null); renderSetup();
    }
  }
  function log(t, b = false) { game.log.push({ t, b }); }

  /* ------------------------------------------------------------ game screen */
  function renderGame(resuming = false) {
    const mobile = phone();
    view = FC.prefs.get('view-' + (mobile ? 'm' : 'd'), mobile ? 'path' : 'board');
    if (view !== 'board' && view !== 'path') view = mobile ? 'path' : 'board';
    lastPurse = {}; lastPot = null; deltas = {};
    $('#app').innerHTML = `
      <h1 class="visually-hidden">Playing the Filosofía cortesana</h1>
      <div id="say" class="visually-hidden" role="status" aria-live="polite" aria-atomic="true"></div>
      <div class="play-layout">
        <div class="board-col" id="boardcol"></div>
        <aside class="side" id="side" aria-label="The game">
          <div class="card turn-panel" id="turn"></div>
          <div id="cardslot"></div>
          <div class="card" style="padding:.6rem .9rem"><h2 class="visually-hidden">The players</h2><ul class="players" id="plist"></ul>
            <p class="small collection" id="coll"></p></div>
          <div class="card options" style="padding:.6rem .9rem">
            <h2 class="visually-hidden">Options and rules</h2>
            <div class="board-toggle"><span class="sc small muted">View</span>
              <div class="seg-toggle" role="group" aria-label="View"><button type="button" data-view="board" aria-pressed="${view === 'board'}">Board</button><button type="button" data-view="path" aria-pressed="${view === 'path'}">Path</button></div>
              <label class="small" style="margin-left:auto"><input type="checkbox" id="follow" ${FC.prefs.get('follow', true) ? 'checked' : ''}> follow the play</label></div>
            <label class="small"><input type="checkbox" id="names" ${FC.prefs.get('names', false) ? 'checked' : ''}> English names on the board</label>
            <label class="small"><input type="checkbox" id="bigtext" ${FC.prefs.get('tableText', false) ? 'checked' : ''}> Large text, for reading across a table</label>
            <p class="small" style="margin:.3rem 0"><button class="btn small" type="button" id="cites"></button></p>
            <details class="log"><summary class="sc">Record of play</summary><ol id="log"></ol></details>
            <p class="small" style="margin:.4rem 0 0"><a href="#" id="rules">Barros’s rules for this edition</a> · <a href="#" id="quit">End this game</a> · <span class="muted">${esc(FC.EDITIONS[ed()].short)}</span></p>
          </div>
        </aside>
      </div>
      <div class="mobile-bar" id="mbar"></div>`;
    document.body.classList.toggle('table-text', !!FC.prefs.get('tableText', false));
    $$('#side [data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    $('#follow').addEventListener('change', e => FC.prefs.set('follow', e.target.checked));
    $('#names').addEventListener('change', e => { FC.prefs.set('names', e.target.checked); if (viewer) viewer.names(e.target.checked, ed()); });
    $('#bigtext').addEventListener('change', e => { FC.prefs.set('tableText', e.target.checked); document.body.classList.toggle('table-text', e.target.checked); });
    bindCites();
    $('#rules').addEventListener('click', e => { e.preventDefault(); showRules(); });
    $('#quit').addEventListener('click', e => {
      e.preventDefault();
      if (!confirm('End this game? It cannot be resumed.')) return;
      FC.prefs.set('game', null); renderSetup();
    });
    // keep focused elements clear of the fixed bottom bar on phones (WCAG 2.4.11)
    if (mbObserver) mbObserver.disconnect();
    const mb = $('#mbar');
    mbObserver = new ResizeObserver(() => {
      document.documentElement.style.scrollPaddingBottom = (getComputedStyle(mb).display === 'none' ? 0 : mb.offsetHeight + 12) + 'px';
    });
    mbObserver.observe(mb);
    setView(view, true);
    lastState = game.snapshot();
    if (resuming) {
      turnPanel(`${turnThrow ? `<div class="dice">${diceSVG(turnThrow.dice)}<span class="sc dice-total">${turnThrow.total}</span></div>` : '<div class="dice"></div>'}<button class="btn primary throw-btn" type="button" disabled style="width:100%">Throw</button>`, shown !== null ? pl(shown) : game.current);
      drawAll(queue[0] ? queue[0].state : game.snapshot());
    } else {
      drawAll(game.snapshot());
      if (game.opened || game.over) idle();
    }
    window.scrollTo(0, 0);
    const here = $('#path li.here'); if (here && !resuming) scrollLi(here, 'center', true);
  }

  /** The references toggle, also on the Play page's own panel (the footer is hidden on desktop). */
  function bindCites() {
    const b = $('#cites'); if (!b) return;
    const label = () => document.body.classList.contains('hide-cites') ? 'Show references in the text' : 'Hide references in the text';
    const sync = () => { b.textContent = label(); $$('[data-toggle-cites]').forEach(x => { x.textContent = label(); }); };
    sync();
    b.addEventListener('click', () => { const on = document.body.classList.toggle('hide-cites'); FC.prefs.set('hideCites', on); sync(); });
    if (!bindCites.obs) { bindCites.obs = new MutationObserver(() => { const c = $('#cites'); if (c) c.textContent = label(); }); bindCites.obs.observe(document.body, { attributes: true, attributeFilter: ['class'] }); }
  }

  function setView(v, first) {
    view = v;
    FC.prefs.set('view-' + (phone() ? 'm' : 'd'), v);
    $$('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === v));
    const colEl = $('#boardcol');
    if (viewer) { if (viewer.destroy) viewer.destroy(); else if (viewer.ro) viewer.ro.disconnect(); }
    colEl.innerHTML = '';
    viewer = null;
    if (v === 'board') {
      const div = document.createElement('div'); colEl.append(div);
      viewer = new FC.Viewer(div, { onSquare: n => openAnnotation(n) });
      viewer.edition = ed();
      if (viewer.showEdition) viewer.showEdition(ed());
      else if (game.poverty !== 60) { viewer.mark([game.poverty], 'variant'); viewer.labels([{ n: game.poverty, text: 'Poverty (1587)' }, { n: 60, text: 'plain (1587)' }]); }
      viewer.names(FC.prefs.get('names', false), ed());
      colEl.append(html(`<p class="credit">Board: Mario Cartaro, Naples 1588. ${BM}. Click any square to read it.</p>`));
    } else {
      colEl.append(renderPath());
      colEl.append(html(`<p class="credit">Squares: details of Mario Cartaro’s board, Naples 1588. ${BM}.</p>`));
    }
    if (!first) drawAll(lastState || game.snapshot());
  }

  function renderPath() {
    const ul = document.createElement('ol');
    ul.className = 'path'; ul.id = 'path';
    let h = `<li class="gate-li adorned" data-n="0">${pic('img/feat/entrance_gate.jpg', '', 'loading="lazy"')}<div><div class="pt">The Gate: before square 1</div><div class="pv">Where every petitioner waits to enter, under the swan that sings “Know thyself”.</div><div class="ptoks"></div></div>
      <button type="button" class="path-open" data-n="0" data-label="The Gate, before square 1" aria-label="The Gate, before square 1"></button></li>`;
    for (let n = 1; n <= 63; n++) {
      const ad = FC.sq.adorned(n, ed()), v = FC.sq.verse(n, ed());
      const label = `Square ${n}${ad ? ', ' + esc(FC.sq.name(n, ed())) : ', plain'}`;
      h += `<li class="${ad ? 'adorned' : ''}" data-n="${n}">${pic(FC.sq.tile(n), '', 'loading="lazy" width="84" height="112"')}
        <div><div class="pn">${n}</div><div class="pt">${ad ? esc(FC.sq.name(n, ed())) : '<span class="muted">a plain square</span>'}</div>
        ${v ? `<div class="pv">${esc(v.en)}</div>` : ''}<div class="ptoks"></div></div>
        <button type="button" class="path-open" data-n="${n}" data-label="${label}" aria-label="${label}"></button></li>`;
    }
    ul.innerHTML = h;
    ul.addEventListener('click', e => { const b = e.target.closest('.path-open'); if (!b) return; const n = +b.dataset.n; openAnnotation(n || 'gate'); });
    return ul;
  }

  /** Barros's own rules, in the edition being played, after the four-line summary. */
  function showRules() {
    const seg = s => `<div class="barros-seg"><div class="es" lang="es">${esc(s.es)}</div><div class="en">${s.en}</div>${s.note ? `<div class="tnote">${s.note}</div>` : ''}</div>`;
    let h = HOWTO + `<p class="small muted">Barros’s own words follow.</p><h2>How Barros says the game is played</h2>`;
    if (ed() === 'M') {
      h += `<p class="small muted">Madrid, Pedro Madrigal, 1587: “Declaración del juego y orden de jugarle”. Spanish copied from the modernized transcription by Luigi Ciompi and Adrian Seville (<a href="http://www.giochidelloca.it/scheda.php?id=1103" target="_blank" rel="noopener">giochidelloca.it</a>), made from Dadson’s 1987 edition; their work, not this edition’s, and not covered by its public-domain dedication. English: this edition’s translation from it.</p>`;
      h += FC.text.M.filter(s => s.kind === 'rules' || /Declaraci/.test(s.es)).map(seg).join('');
    } else {
      h += `<p class="small muted">Naples, Cacchij, 1588, pp. 60–63: “EL YVEGO SE juega en esta forma”.</p>`;
      h += FC.text.C.filter(s => s.kind === 'rules' || s.id === 'C-066a').map(seg).join('');
      if (ed() === 'G') h += `<p class="notice">The first edition (Madrid 1587) has short rules like these, headed “Esto se juega en esta forma”, of which Lucero quotes only the start and the end: Poverty on square 59, and a close with “Deo gratias” and no rule for winning (Lucero Sánchez 2016, 189–90; Lucero 2019a, 204).</p>`;
    }
    h += `<p><a href="about.html#about-rules">What this edition decides where Barros is silent →</a></p>`;
    FC.drawer.open(h, 'Rules');
  }

  function openAnnotation(key) {
    const title = typeof key === 'number' ? `Square ${key}` : '';
    FC.drawer.open(FC.annotate(key, ed()), title);
    const link = FC.drawer.body.querySelector('[data-show-on-board]');
    if (link) link.addEventListener('click', e => { e.preventDefault(); FC.drawer.close(); if (view !== 'board') setView('board'); setTimeout(() => viewer && viewer.focusSquare(key), 60); });
  }

  /* ------------------------------------------------------------ drawing */
  function subline(q) {
    return `${q.pos ? `square ${q.pos}${FC.sq.adorned(q.pos, ed()) ? ', ' + esc(FC.sq.name(q.pos, ed())) : ''}` : 'at the gate'} · ${plural(q.purse, 'stake', 'stakes')}`;
  }
  function drawAll(state) {
    if (!game || !$('#plist')) return;
    lastState = state;
    const players = game.players.map(p => Object.assign({}, p, state.players.find(s => s.id === p.id) || {}));
    const cur = shown ?? game.turn;
    if (viewer) viewer.tokens(players.map(p => Object.assign({}, p, { color: col(p.id) })));
    if ($('#path')) {
      $$('#path .ptoks').forEach(d => { d.innerHTML = ''; });
      $$('#path li.here').forEach(li => li.classList.remove('here'));
      const at = {};
      players.forEach(p => {
        const li = $(`#path li[data-n="${p.pos}"]`);
        if (li) { $('.ptoks', li).insertAdjacentHTML('beforeend', `<span title="${esc(p.name)}">${tok(p.id, p.token)}</span>`); (at[p.pos] = at[p.pos] || []).push(p.name); }
      });
      $$('#path .path-open').forEach(b => {
        const names = at[b.dataset.n];
        b.setAttribute('aria-label', b.dataset.label + (names ? `. Here: ${names.join(', ')}` : ''));
      });
      const c = players.find(p => p.id === cur); const li = c && !game.over && $(`#path li[data-n="${c.pos}"]`); if (li) li.classList.add('here');
    }
    // payments: a "+1" or "−1" beside each purse that changed, for a moment
    const now = performance.now();
    players.forEach(p => {
      if (lastPurse[p.id] !== undefined && lastPurse[p.id] !== p.purse) { deltas[p.id] = { d: p.purse - lastPurse[p.id], t: now }; setTimeout(() => { if (lastState) drawAll(lastState); }, 1700); }
      lastPurse[p.id] = p.purse;
    });
    $('#plist').innerHTML = players.map(p => {
      const dl = deltas[p.id] && now - deltas[p.id].t < 1600 ? deltas[p.id].d : 0;
      const isCur = p.id === cur && !game.over;
      return `<li class="${isCur ? 'current' : ''}">
      ${tok(p.id, p.token)}
      <span class="pname">${isCur ? `<span class="visually-hidden">(${shown !== null ? 'playing' : 'to play'}) </span>` : ''}${esc(p.name)}${p.skip ? ` <span class="chip">${p.pos === 32 ? 'in the Well' : 'misses a round'}</span>` : ''}</span>
      <span class="pos">${p.pos ? `square ${p.pos}` : 'at the gate'}<br><span class="small">${p.pos && FC.sq.adorned(p.pos, ed()) ? esc(FC.sq.name(p.pos, ed())) : ''}</span></span>
      <span class="purse">${p.purse} <span aria-hidden="true">◉</span><span class="visually-hidden">stakes</span>${dl ? `<span class="delta ${dl > 0 ? 'up' : 'down'}" aria-hidden="true">${dl > 0 ? '+' : '−'}${Math.abs(dl)}</span>` : ''}</span></li>`;
    }).join('');
    // the pot, and the line under the name of the player whose turn is on screen
    $$('.pot-n').forEach(b => {
      b.textContent = state.pot;
      if (lastPot !== null && lastPot !== state.pot) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
    });
    lastPot = state.pot;
    if (shown !== null) {
      const q = players.find(x => x.id === shown);
      if (q) { const a = $('#who-sub'); if (a) a.innerHTML = subline(q); const b = $('#mbar .mb-sub-t'); if (b) b.innerHTML = subline(q); }
    }
    const st = $('#mbar .mb-st');
    if (st) st.innerHTML = players.map(q => `${esc(q.name)} ${q.pos ? q.pos : 'gate'} · ${q.purse}<span aria-hidden="true">◉</span>`).join(' — ');
    $('#log').innerHTML = game.log.slice(-80).map(l => `<li>${l.b ? `<b>${esc(l.t)}</b>` : esc(l.t)}</li>`).join('');
    const met = collection().length;
    $('#coll').innerHTML = `<a href="atlas.html">Squares you have met: ${met} of 26 →</a>`;
  }

  /** Figured squares carded in any game on this browser (annotation ids), for the Atlas link. */
  function collect(aid) { const met = collection(); if (!met.includes(aid)) { met.push(aid); FC.prefs.set('seen', met); return true; } return false; }
  function collection() { const c = FC.prefs.get('seen', []); return Array.isArray(c) ? c.filter(x => typeof x === 'string') : []; }

  function turnPanel(inner, p = game.current) {
    const subTxt = subline(p);
    $('#turn').innerHTML = `<div class="who">${tok(p.id, p.token)}<div><div class="nm">${esc(p.name)}</div><div class="small muted" id="who-sub">${subTxt}</div></div>
      <div class="pot" style="margin-left:auto"><span>pot</span><b class="pot-n">${lastPot ?? game.pot}</b></div></div>
      <p class="small muted pot-note">The pot (<i lang="es">la polla</i>): the winner takes it.</p>${inner}`;
    $('#turn').style.borderTop = `6px solid ${col(p.id)}`;
    const mb = $('#mbar');
    mb.style.borderTop = `6px solid ${col(p.id)}`;
    mb.innerHTML = `<div class="row">${tok(p.id, p.token)}<div class="grow"><div class="nm">${esc(p.name)}</div><div class="small muted mb-sub"><span class="mb-sub-t">${subTxt}</span> · pot <b class="pot-n">${lastPot ?? game.pot}</b></div></div>
      <div class="seg-toggle" role="group" aria-label="View"><button type="button" data-view="board" aria-pressed="${view === 'board'}">Board</button><button type="button" data-view="path" aria-pressed="${view === 'path'}">Path</button></div></div>
      <div class="mb-standings small"><span class="mb-st"></span> <a href="#side" class="mb-more">all players, rules ↓</a></div>
      <div class="mb-inner">${inner}</div>`;
    $$('#mbar [data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    if (lastState) drawAll(lastState);
  }

  function diceSVG(vals, rolling) {
    const pip = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
    return vals.map(v => `<svg class="die${rolling ? ' rolling' : ''}" viewBox="-24 -24 48 48" ${rolling ? 'aria-hidden="true"' : `role="img" aria-label="${+v}"`}><rect x="-21" y="-21" width="42" height="42" rx="7"/>${(pip[v] || []).map(([x, y]) => `<circle cx="${x * 11}" cy="${y * 11}" r="4.3"/>`).join('')}</svg>`).join('');
  }

  /* ------------------------------------------------------------ what wins from here */
  /** The totals that would take player i to the Palm on this throw, worked out by the engine itself. */
  function winningThrows(i) {
    const n = game.opt.dice, res = [];
    for (let t = n; t <= 6 * n; t++) {
      const g = new E.Game(game.players.map(q => ({ name: q.name, token: q.token })), game.opt);
      g.players.forEach((q, k) => { q.pos = game.players[k].pos; q.skip = 0; });
      g.turn = i; g.extra = 0;
      const first = Math.min(6, t - 1);
      g.play(n === 1 ? [t] : [first, t - first]);
      if (g.winner === i) res.push(t);
    }
    return res;
  }
  function needsLine(p) {
    const n = game.opt.dice, wins = winningThrows(p.id);
    if (!wins.length && p.pos < 51) return '';
    if (!wins.length) return `No throw of ${n === 2 ? 'two dice' : 'one die'} reaches the Palm from square ${p.pos}${p.pos + n > 63 ? ': every throw counts back' : ''}.`;
    const k = wins.reduce((a, t) => a + (n === 2 ? 6 - Math.abs(t - 7) : 1), 0);
    return `${esc(p.name)} needs ${listOr(wins)} to reach the Palm (${plural(k, 'chance', 'chances')} in ${n === 2 ? 36 : 6}).`;
  }

  /* ------------------------------------------------------------ the turn */
  /** Before the first throw: the Gate of Opinion and the four rules. Not a move. */
  function opening() {
    busy = true;
    const my = gen, v = FC.sq.verse(1, ed()), gt = FC.annotations.gate || {};
    const htmlStr = `<article class="card event-card opening">
      <div class="ev-img">${pic(FC.sq.tile(1), '')}<div>
        <div class="small muted">Before the first throw. This is not a move.</div><div class="ev-num">1</div><h2 class="ev-title">Every petitioner enters here</h2>
        ${v ? `<div class="ev-verse">${esc(v.en).replace(' / ', '<br>')}</div>` : ''}
      </div></div>
      <div class="ev-body">
        ${HOWTO}
        ${gt.table || v ? `<details class="ev-again"><summary class="small">The gate, in Barros’s words</summary>${v ? `<div class="ev-verse es-dup">${esc(v.en).replace(' / ', '<br>')}</div>` : ''}${gt.table ? `<p class="ev-table">${gt.table}</p>` : ''}${v ? `<div class="ev-verse-es" lang="es">${esc(v.es_board || v.es_book)}</div>` : ''}</details>` : ''}
        <p class="credit">Square 1, the Gate of Opinion: detail of Mario Cartaro’s board, Naples 1588. ${BM}.</p>
        <div class="actions"><button class="btn primary" type="button" data-continue>Enter</button><button class="btn" type="button" data-read="1">Read about this square</button></div>
      </div></article>`;
    turnPanel('');
    card(htmlStr).then(() => { if (my !== gen) return; collect('sq1'); game.opened = true; busy = false; idle(); });
  }

  function idle(extraNote = '') {
    if (game.over) return;
    shown = null;
    const p = game.current;
    const again = game.extra > 0, skipping = p.skip && !again;
    const wellNote = skipping ? `<p class="small">${esc(p.name)} ${p.pos === 32 ? 'is in the Well of Oblivion and misses this round.' : 'was pushed out of the Well of Oblivion but still misses this round.'}</p>` : '';
    const needs = skipping ? '' : needsLine(p);
    const label = skipping ? 'Pass the round' : again ? 'Throw again (Fortune)' : game.opt.dice === 2 ? 'Throw the dice' : 'Throw the die';
    turnPanel(`${lastMove ? `<p class="small muted last-move">↳ ${esc(lastMove)}</p>` : ''}${extraNote}${wellNote}${needs ? `<p class="small needs">${needs}</p>` : ''}<div class="dice"></div><button class="btn primary throw-btn" type="button" aria-label="${esc(p.name)}: ${label}" style="width:100%"><span>${label}</span></button>`);
    $$('.throw-btn').forEach(b => b.addEventListener('click', doThrow));
    drawAll(game.snapshot());
    save();
    const a = document.activeElement;
    if (!a || a === document.body || !a.isConnected) {
      const t = $(phone() ? '#mbar .throw-btn' : '#turn .throw-btn');
      if (t) t.focus({ preventScroll: true });
    }
    say(`${p.name}’s turn: ${p.pos ? 'square ' + p.pos : 'at the gate'}, ${plural(p.purse, 'stake', 'stakes')}; the pot holds ${game.pot}.${again ? ' Fortune: throw again.' : ''}${skipping ? ' ' + toText(wellNote) : ''}${needs ? ' ' + toText(needs) : ''}`);
  }

  function doThrow() {
    if (busy || !game || game.over) return;
    busy = true;
    const my = gen;
    shown = game.turn;
    if (!game.extra) turnThrow = null;
    if (viewer && $('#follow') && $('#follow').checked) viewer.fit(true);
    const steps = game.play();
    queue = steps.slice();
    save();                                        // a reload now replays this whole turn
    $$('.throw-btn').forEach(b => { b.disabled = true; });
    $$('.last-move, .needs').forEach(x => x.remove());
    const t = steps.find(s => s.type === 'throw');
    if (t) {
      $$('.dice').forEach(d => { d.innerHTML = diceSVG(t.dice.map(() => 1 + Math.floor(Math.random() * 6)), true); });
      setTimeout(() => { if (my === gen) pump(); }, reduced() ? 0 : 550);
    } else pump();
  }

  /** After a card has been read: save, so that a reload resumes from the next card. */
  function afterCard() { save(); }

  /** Work through the queue of steps; stop at every card. */
  async function pump() {
    const my = gen;
    while (queue.length) {
      const s = queue.shift();
      const p = pl(s.player);
      switch (s.type) {
        case 'throw':
          turnThrow = { dice: s.dice.map(Number), total: +s.total };
          $$('.dice').forEach(d => { d.innerHTML = diceSVG(turnThrow.dice) + `<span class="sc dice-total">${turnThrow.total}</span>`; });
          log(`${p.name} throws ${s.dice.join(' + ')} = ${s.total}${s.extra ? ' (Fortune’s extra throw)' : ''}.`);
          note(`${p.name} throws ${s.dice.join(' and ')}: ${s.total}${s.extra ? ', Fortune’s extra throw' : ''}.`);
          break;
        case 'skip':
          log(`${p.name} misses this round${p.pos === 32 ? ' in the Well of Oblivion' : ', the round lost in the Well'}.`);
          await card(wellSkipCard(p));
          if (my !== gen) return;
          afterCard();
          break;
        case 'move':
          await animateMove(s);
          if (my !== gen) return;
          break;
        case 'rebound': {
          const first = !game.flags.rebound; game.flags.rebound = true;
          const t = `Past the Palm by ${plural(s.bounce, 'square', 'squares')}: count back to square ${s.square}${first ? ' (<i lang="es">“buelue atras los que sobran”</i>, “he goes back by those that are over”)' : ''}.${s.poor ? ' Onto Poverty: the poor pay nothing for going back.' : ''}`;
          pending.push(t); log(`${p.name}: ${toText(t)}`);
          while (queue[0] && queue[0].type === 'pay') { const q = queue.shift(); pending.push(effectText(q)); log(toText(effectText(q))); drawAll(q.state); }
          break;
        }
        case 'arrive': {
          if (s.kind === 'goal') { record(s, []); drawAll(s.state); note(`${p.name} reaches the Palm, square 63.`); break; }      // the victory card follows at once
          const effects = collectEffects();
          effects.pre = pending; pending = [];
          const plainByThrow = !FC.sq.adorned(s.square, ed()) && s.kind === 'plain' && !effects.pre.length && !effects.list.length;
          drawAll(s.state);
          if (plainByThrow) { const t = `${p.name} ${s.via === 'labour' ? 'labors on to' : 'comes to'} square ${s.square}.`; log(t); note(t); break; }
          log(stop(`${p.name} ${s.via === 'labour' ? 'labors on to' : s.via === 'transfer' ? 'is sent to' : 'comes to'} square ${s.square}${FC.sq.adorned(s.square, ed()) ? ', ' + FC.sq.name(s.square, ed()) : ''}`));
          record(s, effects.list);
          await card(arriveCard(s, effects));
          if (my !== gen) return;
          applyEffects(effects);
          afterCard();
          break;
        }
        case 'win': {
          drawAll(s.state);
          log(`${p.name} reaches the Palm and wins the pot of ${s.amount}.`, true);
          FC.prefs.set('game', null);
          busy = false;
          showVictory(p, s.amount);
          return;
        }
        case 'again':
          drawAll(s.state);
          busy = false;
          lastMove = moveLine(s);
          idle(`<p class="small"><b>Fortune:</b> ${esc(p.name)} throws again${s.left > 1 ? ` (${s.left} throws left)` : ''}.</p>`);
          return;
        case 'next':
          drawAll(s.state);
          busy = false;
          lastMove = moveLine(s);
          game.fortuneOpen = null;                    // the turn is over: any extra throws are spent
          { const li = $(`#path li[data-n="${(s.state.players.find(x => x.id === game.turn) || {}).pos}"]`); if (li) scrollLi(li, 'center'); }
          idle();
          return;
        default:
          drawAll(s.state);
      }
    }
    busy = false; idle();
  }

  /** One line for the panel after a turn: what the mover threw and where they now stand. */
  function moveLine(s) {
    const id = shown; if (id === null || id === undefined) return '';
    const q = s.state.players.find(x => x.id === id); if (!q) return '';
    const nm = pl(id).name;
    const where = q.pos ? `square ${q.pos}${FC.sq.adorned(q.pos, ed()) ? ', ' + FC.sq.name(q.pos, ed()) : ''}` : 'the Gate';
    if (!turnThrow) return q.skip || q.pos === 32 ? `${nm} missed the round.` : stop(`${nm} missed the round and is on ${where}`);
    return stop(`${nm} threw ${turnThrow.dice.join(' + ')} = ${turnThrow.total} and is now ${q.pos ? 'on' : 'back at'} ${where}`);
  }

  /** Keep each player's career: the figured squares reached, and which were Barros's losing throws. */
  function record(s, list) {
    const n = s.square, id = s.player, c = game.careers[id] || (game.careers[id] = []);
    const lossKinds = ['back', 'well', 'death', 'poverty'];
    if (lossKinds.includes(s.kind) && game.fortuneOpen && game.fortuneOpen.p === id) {
      const f = c[game.fortuneOpen.i]; if (f) f.l = true;          // "fortuna mal aprouechada": the extra throw was lost
      game.fortuneOpen = null;
    }
    if (n === 63 || FC.sq.adorned(n, ed())) c.push({ n, l: lossKinds.includes(s.kind) });
    if (s.kind === 'fortune') game.fortuneOpen = { p: id, i: c.length - 1 };
    if (list.some(e => e.type === 'transfer' && e.to === 0)) c.push({ n: 0 });
  }

  /**
   * Gather the effect steps that belong to the square just reached (payments, being sent
   * on, displacing another player…), so that they are shown on that square's card.
   * A Labor square's effect is the move that follows it: that move is taken out of the
   * queue here, described on the card, and put back by applyEffects() so that the token
   * is animated after the player has read the card.
   */
  function collectEffects() {
    const list = [];
    while (queue.length && ['pay', 'transfer', 'bump', 'skipset', 'loop'].includes(queue[0].type)) list.push(queue.shift());
    // Labor: the following move is part of this square's effect
    if (queue[0] && queue[0].type === 'move' && queue[0].via === 'labour') list.push(Object.assign({ labour: true }, queue.shift()));
    return { pre: [], list };
  }

  function effectText(e) {
    const who = (id, cap) => id === 'pot' ? (cap ? 'The pot' : 'the pot') : esc(pl(id).name);
    switch (e.type) {
      case 'pay': return `${who(e.from, true)} pays ${plural(e.amount, 'stake', 'stakes')} to ${who(e.to)} — ${WHY[e.why] || ''}.`;
      case 'transfer': return e.to === 0 ? 'Back to the Gate, to begin the game again.' : stop(`Go to square ${e.to}, ${esc(FC.sq.name(e.to, ed()))}`);
      case 'bump': {
        const first = !game.flags.bump;
        return `${who(e.victim)} was on this square and must take the one ${esc(pl(e.player).name)} left: ${e.to ? `square ${e.to}` : 'back to the gate, with no square'}${e.forward ? ' (which, as it happens, is further on)' : ''}${first ? ' — <i lang="es">“porque assi es el vso de la competencia”</i>, “for such is the custom of rivalry”' : ''}.${e.from === 32 && e.skip ? ` ${who(e.victim)} still loses the round in the Well.` : ''}`;
      }
      case 'skipset': return 'Miss the next round: the ropes are paid for.';
      case 'loop': return 'The Labor moves would go round in a circle; you stop here.';
      case 'move': return e.bounce ? `Labor: go on ${e.by} more squares, past the Palm.` : `Labor: go on ${e.by} more squares, to square ${e.to}.`;
    }
    return '';
  }

  /** After Continue: record the effects in the log, show their result, re-queue a Labor move. */
  function applyEffects(effects) {
    effects.list.forEach(e => {
      if (e.labour) return;                          // the move step itself animates later
      if (e.type === 'pay') log(toText(effectText(e)));
      if (e.type === 'transfer' && e.to === 0) log(`${pl(e.player).name}: ${toText(effectText(e))}`);
      if (e.type === 'bump') { log(toText(effectText(e))); game.flags.bump = true; }
    });
    const last = [...effects.list].reverse().find(e => !e.labour);
    if (last) drawAll(last.state);
    // put the labor move back at the head of the queue so it animates
    const lab = effects.list.find(e => e.labour);
    if (lab) queue.unshift(Object.assign({}, lab, { labour: undefined }));
  }

  /* Where a square sends a player, the destination's card says why Barros pairs them. */
  const DEST_GLOSS = {
    7: `False Friendship sends you back to the Prodigal: the remedy is to be prodigal again, even with those you once trusted least ${cite(39, '33–34')}.`,
    10: `The Change of Ministers sends you back to Flattery, to bow to whoever now holds the post ${cite(42, '36')}.`,
    20: `“I Thought…” sends the careless back to Diligence, to watch the beetle push a ball of dung, a load greater than its strength, toward its hole ${cite(49, '43–44')}.`,
    28: `What Will They Say? sends you back to the Dice, to seek another throw, another kind of luck, at pressing your case ${cite(37, '31')}.`,
    53: `Poverty sends you here with alms, to the Dice and a throw of eleven, usually a good one; but for the poor no throw is good ${cite(52, '46')}.`,
  };
  /* Barros's worked example (Madrid 1587, Madrigal) plays out on three squares. */
  const EXAMPLE = {
    4: ['M-44v-a', 'Diego threw 4, landed here, and went on by 4 more to square 8.'],
    15: ['M-45r-a', 'Pedro, on square 6, threw 9, came here and paid one stake, then paid another at 26.'],
    26: ['M-46r-a', 'Rodrigo came here from the Pass of Hope, found Pedro’s ring on the square, and sent Pedro back to square 5, where Rodrigo had been; Pedro paid one stake for going back.'],
  };

  function arriveCard(s, effects) {
    const n = s.square, p = pl(s.player);
    const aid = FC.sq.annId(n, ed());
    const v = FC.sq.verse(n, ed()), a = FC.annotations[aid];
    const visits = game.seen[n] = (game.seen[n] || 0) + 1, repeat = visits > 1 && FC.sq.adorned(n, ed());
    // several one-stake payments of the same kind (the Well, alms) are shown as one line
    const grouped = [];
    effects.list.forEach(e => {
      const last = grouped[grouped.length - 1];
      if (e.type === 'pay' && (e.why === 'well' || e.why === 'alms') && last && last.type === 'pay' && last.why === e.why) last.n = (last.n || 1) + 1;
      else grouped.push(Object.assign({}, e));
    });
    const effs = effects.pre.concat(grouped.map(e => e.n
      ? (e.why === 'well' ? `${esc(pl(e.from).name)} pays one stake to each of the ${e.n} other players.`
                          : `Each of the ${e.n} other players gives ${esc(pl(e.to).name)} one stake as alms.`)
      : effectText(e)).filter(Boolean));
    if (s.kind === 'fortune') effs.push(game.opt.fortuneThrows > 1 ? 'Throw twice more at once.' : 'Throw again at once.');
    if (s.via === 'transfer' && s.kind === 'destination' && DEST_GLOSS[n]) effs.push(DEST_GLOSS[n]);
    if (s.via === 'transfer' && !effs.length) effs.push(n === 26 ? 'You are here by the Pass of Hope.' : 'Nothing more befalls you here.');
    if (!effs.length && s.kind === 'plain') effs.push('Nothing befalls you here.');
    // a purse empty for the first time
    const after = ([...effects.list].reverse().find(e => !e.labour) || s).state;
    after.players.forEach(q => {
      if (q.purse <= 0 && !game.flags.credit[q.id]) { game.flags.credit[q.id] = true; effs.push(`${esc(pl(q.id).name)} has nothing left in the purse and plays on credit.`); }
    });
    const extra = [];
    if (s.kind === 'fortune') {
      const w = winningThrows(s.player), q = excerpt('C-047a', 'the game is so arranged', 'put off.');
      extra.push(`<p class="small">${w.length ? `From here ${listOr(w)} wins the pot.` : 'From here no single throw wins the pot.'}${q ? ` Barros: “…${q}” ${cite(47, '41')}` : ''}</p>`);
    }
    if (EXAMPLE[n] && !repeat) extra.push(`<p class="small">In Barros’s own example game (Madrid 1587): ${EXAMPLE[n][1]} <a href="text.html#${EXAMPLE[n][0]}">Read it →</a></p>`);
    if (aid !== 'plain') {
      if (collect(aid)) extra.push('<p class="small muted">New to your collection.</p>');
    }
    const headline = s.via === 'transfer' ? `${esc(p.name)} is sent to` : s.via === 'labour' ? `${esc(p.name)} labors on to` : `${esc(p.name)} lands on`;
    let table = a && a.id !== 'plain' ? a.table || '' : '';
    if (!table && FC.sq.LABOUR.includes(n) && FC.annotations.labour) table = FC.annotations.labour.table || '';
    const title = FC.sq.adorned(n, ed()) ? esc(FC.sq.name(n, ed())) : 'A plain square';
    const verseEn = v ? `<div class="ev-verse">${esc(v.en).replace(' / ', '<br>')}</div>` : '';
    const top = repeat
      ? (v || table ? `<details class="ev-again"><summary class="small">The verse</summary>${verseEn}${table ? `<p class="ev-table">${table}</p>` : ''}</details>` : '')
      : `${verseEn}${v ? `<div class="ev-verse-es" lang="es">${esc(v.es_board || v.es_book)}</div>` : ''}`;
    return `<article class="card event-card">
      <div class="ev-img">${pic(FC.sq.tile(n), '')}<div>
        <div class="small muted">${headline}</div><div class="ev-num">${n}</div><h2 class="ev-title">${title}${repeat ? ` <span class="small muted">(${ordinal(visits)} time this game)</span>` : ''}</h2>
        ${top}
      </div></div>
      <div class="ev-body">
        ${!repeat && table ? `<p class="ev-table">${table}</p>` : ''}
        ${effs.length ? `<ul class="effects">${effs.map(t => `<li>${t}</li>`).join('')}</ul>` : ''}
        ${!repeat && v ? `<div class="ev-verse-es es-dup" lang="es">${esc(v.es_board || v.es_book)}</div>` : ''}
        ${extra.length ? `<div class="ev-extra">${extra.join('')}</div>` : ''}
        <p class="credit">Square ${n}: detail of Mario Cartaro’s board, Naples 1588. ${BM}.</p>
        <div class="actions"><button class="btn primary" type="button" data-continue>Continue</button><button class="btn" type="button" data-read="${n}">Read about this square</button></div>
      </div></article>`;
  }

  function wellSkipCard(p) {
    const inWell = p.pos === 32;
    return `<article class="card event-card"><div class="ev-img">${pic(FC.sq.tile(32), '')}<div>
      <div class="small muted">${esc(p.name)} ${inWell ? 'is still in' : 'was pushed out of'}</div><div class="ev-num">32</div><h2 class="ev-title">The Well of Oblivion</h2>
      <div class="ev-verse">${esc(FC.board.verses.h32.en).replace(' / ', '<br>')}</div></div></div>
      <div class="ev-body"><ul class="effects"><li>${inWell ? 'A round without playing, until the ropes of liberality pull the petitioner out.' : `Another petitioner took ${esc(p.name)}’s place in the Well, but the round is still lost: no throw this time.`}</li></ul>
      <p class="credit">Square 32: detail of Mario Cartaro’s board, Naples 1588. ${BM}.</p>
      <div class="actions"><button class="btn primary" type="button" data-continue>Continue</button><button class="btn" type="button" data-read="32">Read about this square</button></div></div></article>`;
  }

  function scrollLi(li, block = 'center', instant = false) {
    li.scrollIntoView({ block: phone() ? 'start' : block, behavior: instant || reduced() ? 'auto' : 'smooth' });
  }

  /** On a phone in Board view, fit the board into the strip above the bottom sheet. */
  function fitBoardAboveSheet(on) {
    if (!viewer || !phone()) return;
    if (!on) { viewer.el.style.height = ''; return; }
    const hh = ($('.site-header') || { offsetHeight: 0 }).offsetHeight, mbh = $('#mbar').offsetHeight;
    viewer.el.style.height = Math.max(140, innerHeight - mbh - hh - 8) + 'px';
    const top = $('#boardcol').getBoundingClientRect().top + scrollY - hh;
    window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
    viewer.layout();
  }

  /** Show a card (side panel on desktop, bottom bar on phones) and wait for Continue. */
  function card(htmlStr) {
    return new Promise(resolve => {
      const my = gen;
      const slot = $('#cardslot'), mbar = $('#mbar'), mb = $('#mbar .mb-inner');
      if (!slot) return;
      slot.innerHTML = htmlStr;
      if (mb) mb.innerHTML = htmlStr;
      if (mbar) mbar.classList.add('has-card');
      const n = +(slot.querySelector('[data-read]') || {}).dataset?.read;
      if (n) {
        const follow = $('#follow') && $('#follow').checked;
        if (viewer && follow) { fitBoardAboveSheet(true); viewer.focusSquare(n, true, 2.4); }
        if (viewer) viewer.mark([n], 'focus');
        const li = $(`#path li[data-n="${n}"]`);
        if (li) { $$('#path li.dest').forEach(x => x.classList.remove('dest')); li.classList.add('dest'); scrollLi(li); }
      }
      $$('[data-read]').forEach(b => b.addEventListener('click', () => openAnnotation(+b.dataset.read || b.dataset.read)));
      const shownAt = performance.now();
      $$('[data-continue]').forEach(b => b.addEventListener('click', e => {
        if (e.detail > 1 || performance.now() - shownAt < 350) return;   // the second click of a double click
        if (my !== gen) return;
        slot.innerHTML = ''; if (mb) mb.innerHTML = '';
        if (mbar) mbar.classList.remove('has-card');
        $$('#path li.dest').forEach(x => x.classList.remove('dest'));
        fitBoardAboveSheet(false);
        if (viewer) viewer.mark([], 'focus');
        resolve();
      }));
      say(cardSpeech(slot.firstElementChild || slot));
      const target = phone() ? $('#mbar [data-continue]') : slot.querySelector('[data-continue]');
      if (target) {
        target.focus({ preventScroll: true });
        if (!phone()) showCardTop(slot, target);
      }
    });
  }

  /** Desktop: show the whole card if it fits under the turn panel, otherwise start at its top. */
  function showCardTop(slot, target) {
    const side = $('#side'); if (!side) return;
    side.scrollTop = 0;
    const sr = side.getBoundingClientRect(), tr = target.getBoundingClientRect();
    if (tr.bottom > sr.bottom - 8) side.scrollTop = slot.getBoundingClientRect().top - sr.top - 8;
  }

  /** Hop the token square by square (and back, if it overshoots the Palm). */
  function animateMove(s) {
    return new Promise(resolve => {
      const my = gen;
      const path = [];
      if (s.bounce) { for (let i = s.from + 1; i <= 63; i++) path.push(i); for (let i = 62; i >= s.to; i--) path.push(i); }
      else for (let i = s.from + 1; i <= s.to; i++) path.push(i);
      const delay = reduced() ? 0 : Math.max(40, Math.min(140, 1400 / Math.max(1, path.length)));
      const base = s.state.players.map(x => Object.assign({}, x));
      let i = 0;
      const tick = () => {
        if (my !== gen) { resolve(); return; }
        if (i >= path.length) { drawAll(s.state); resolve(); return; }
        const st = { pot: s.state.pot, players: base.map(x => x.id === s.player ? Object.assign({}, x, { pos: path[i] }) : x) };
        drawAll(st);
        const li = $(`#path li[data-n="${path[i]}"]`); if (li && i === path.length - 1) scrollLi(li);
        i++; setTimeout(tick, delay);
      };
      if (!path.length) { drawAll(s.state); resolve(); } else tick();
    });
  }

  /* ------------------------------------------------------------ the end */
  function showVictory(p, amount) {
    collect('sq63');
    const v = FC.board.verses, start = setup.purse;
    const careers = game.players.map(q => {
      const c = game.careers[q.id] || [];
      const lost = c.filter(e => e.l).length;
      const chips = c.map(e => {
        if (!e.n) return '<span class="chip gate-chip" title="Back to the Gate">to the Gate</span>';
        const nm = FC.sq.adorned(e.n, ed()) ? FC.sq.name(e.n, ed()) : `Square ${e.n}`;
        const lab = `${e.n}, ${nm}${e.l ? ': one of Barros’s losing throws' : ''}`;
        return `<a class="sqchip${e.l ? ' lost' : ''}" href="atlas.html#${e.n}" title="${esc(lab)}">${pic(FC.sq.tile(e.n), lab, 'width="40" height="53" loading="lazy"')}</a>`;
      }).join('');
      return `<li><div class="career-h">${tok(q.id, q.token)} <b>${esc(q.name)}</b> <span class="small muted">${lost ? `${lost} of Barros’s losing throws` : 'none of Barros’s losing throws'}</span></div><div class="chips">${chips || '<span class="small muted">no figured square reached</span>'}</div></li>`;
    }).join('');
    const course = excerpt('C-022e', 'To open their eyes', 'stands outside shows.');
    const rows = game.players.map(q => Object.assign({}, q, { gain: q.purse - start })).sort((a, b) => b.gain - a.gain)
      .map(q => `<tr><td>${esc(q.name)}</td><td>${q.paid}</td><td>${q.received}</td><td>${q.purse}</td><td>${q.gain > 0 ? '+' : q.gain < 0 ? '−' : ''}${Math.abs(q.gain)}</td></tr>`).join('');
    const htmlStr = `<article class="card victory">
      ${pic('img/feat/aedicule.jpg', 'The gate of Victory with the palm', 'class="victory-img"')}
      <p class="credit">The Palm of Victory: detail of Mario Cartaro’s board, Naples 1588. ${BM}.</p>
      <p class="sc muted" style="margin:.6rem 0 0">Vitoria</p><h2 tabindex="-1">${esc(p.name)} takes the pot: ${amount} stakes</h2>
      <p style="font-family:var(--f-display);font-size:1.2rem">${esc(v.h63.en).replace(' / ', '<br>')}</p>
      <p class="small"><i lang="es">“Ni lo mucho, ni lo poco”</i>: neither too much nor too little. Barros reads the exact throw as temperance, and warns that no prize at court is secure ${cite(53, '47–48')}. Outside the palm a man clings to it: he seems to have caught a fish, but he leaves a shoe behind. Nothing is won for nothing ${cite(55, '49–50')}.</p>
      <div class="careers"><h3>Your careers at court</h3>
        <p class="small muted">The figured squares each player reached, in order. A red frame marks the squares Barros names as the course’s losing throws; Fortune counts only when its extra throw was then lost.</p>
        <ul class="career-list">${careers}</ul>
        ${course ? `<blockquote class="small">“${course}”<footer>Barros’s own account of the course, in the Naples edition of 1588 ${cite(22, '16–19')}. <a href="text.html#C-022e">Read Barros’s introduction →</a></footer></blockquote>` : ''}
        <p class="small"><a href="about.html#about-court">Who were the petitioners? →</a> · <a href="about.html#about-goose">Where the game came from →</a></p>
      </div>
      <p class="small" style="font-family:var(--f-display)">${esc(v.h63b.en).replace(' / ', '<br>')}</p>
      <div class="table-wrap"><table><thead><tr><th>Player</th><th>Paid out</th><th>Received</th><th>Purse</th><th>Gain or loss</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p><button class="btn primary again" type="button">Play again</button> <button class="btn" type="button" data-read="63">Read about the Palm</button></p></article>`;
    shown = null;
    turnPanel('<p class="small">The game is over.</p>', p);
    $('#cardslot').innerHTML = htmlStr; $('#mbar .mb-inner').innerHTML = htmlStr;
    $('#mbar').classList.add('has-card');
    $$('.again').forEach(b => b.addEventListener('click', renderSetup));
    $$('[data-read]').forEach(b => b.addEventListener('click', () => openAnnotation(+b.dataset.read)));
    if (viewer) viewer.focusSquare(63, true, 2.2);
    const side = $('#side'); if (side) side.scrollTop = 0;
    say(`${p.name} takes the pot: ${amount} stakes. ${game.players.map(q => { const k = (game.careers[q.id] || []).filter(e => e.l).length; return `${q.name}: ${k ? k + ' of Barros’s losing throws' : 'none of Barros’s losing throws'}.`; }).join(' ')}`);
    const h = phone() ? $('#mbar .victory h2') : $('#cardslot .victory h2');
    if (h) h.focus({ preventScroll: phone() });
  }

  document.addEventListener('DOMContentLoaded', renderSetup);
})();
