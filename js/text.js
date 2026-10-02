/* =========================================================================
   text.js — "The Book": the Naples 1588 text, Spanish beside English, segment by
   segment, with a facsimile of each page; optionally the Madrid 1587 passages, and
   what is known of the first edition (G).
   Anchors: text.html#C-038b (a segment), text.html#pdf38 (a page of the scan), #p32 (a page
   of the book, by its true pagination: the title page is p. 1, the first printed number is
   16 on A8v; pdf 54, misprinted "38", is #p48), #leaf-B4v (a leaf by gathering, leaf and
   side: A1r = title page; gatherings A and B of 12 leaves, then C), #M-41v-a (a Madrigal
   passage), #G-05 (a G reading). A page, leaf or scan page that no passage covers (a blank)
   goes to the next passage. See docs/ANCHORS.md.
   ========================================================================= */
(function () {
  const { $, $$, esc } = FC.util;
  let ed = 'C', lang = 'both';

  /** '66-69' → [66, 67, 68, 69] */
  function pdfRange(pdf) {
    const [a, b] = String(pdf).split('-').map(Number);
    if (!a) return [];
    const out = []; for (let p = a; p <= (b || a); p++) out.push(p); return out;
  }
  /** The Vienna copy's scan: pdf 7 is the title page (A1r); two scan pages per leaf. */
  const FIRST = 7, LAST = 70;
  function leafOf(n) {
    if (n < FIRST || n > LAST) return '';
    const l = Math.floor((n - FIRST) / 2);
    return 'ABC'[Math.floor(l / 12)] + (l % 12 + 1) + ((n - FIRST) % 2 ? 'v' : 'r');
  }
  /** True page number (title page = 1); printed from p. 16 (pdf 22) to p. 63 (pdf 69). */
  function pageOf(n) { return n >= FIRST && n <= 69 ? n - FIRST + 1 : 0; }
  function pdfOfHash(h) {
    let m;
    if ((m = /^pdf(\d+)$/.exec(h))) return +m[1];
    if ((m = /^p(\d+)$/.exec(h))) return +m[1] + FIRST - 1;
    if ((m = /^leaf-([ABC])(\d{1,2})([rv])$/i.exec(h))) {
      const l = 'ABC'.indexOf(m[1].toUpperCase()) * 12 + (+m[2] - 1);
      if (+m[2] < 1 || +m[2] > 12) return 0;
      return FIRST + 2 * l + (m[3].toLowerCase() === 'v' ? 1 : 0);
    }
    return 0;
  }
  const span = (a, b) => a === b ? a : `${a}–${b}`;
  function loc(s) {
    const pp = pdfRange(s.pdf), first = pp[0], last = pp[pp.length - 1];
    const pages = s.page ? `p. ${esc(s.page)}` : '';
    const leaves = first ? `<span title="leaf: gathering, leaf and side (r = front, v = back), counted from the title page, A1r">leaf ${span(leafOf(first), leafOf(last))}</span>` : '';
    const where = [pages, leaves].filter(Boolean).join(' · ');
    return `${where}<a href="#" data-facs="${first}" title="Show the page of the 1588 book">page image</a><a href="#${esc(s.id)}" aria-label="Link to this passage (${esc(s.id)})" title="Link to this passage">link</a>`;
  }
  /** Spanish/English text: escape, keep *italic* runs of the transcription, verse lines. */
  function body(t, kind) {
    let h = esc(t).replace(/(^|[\s(«“])\*(?!\s)([^*]+?)\*(?=[\s.,;:)»”]|$)/g, '$1<em>$2</em>');
    return kind === 'verse' ? h.replace(/ \/ /g, '<br>') : h;
  }

  /** What is known of the first edition: Lucero's quotations, reading by reading. */
  function gList() {
    const T = FC.text;
    const row = (lab, h, lg) => h ? `<div><b class="sc small muted">${lab}</b> <span${lg ? ` lang="${lg}"` : ''}>${h}</span></div>` : '';
    return T.G_intro + T.G.map(v => `<div class="seg g-var" id="${esc(v.id)}">
      <div class="full"><b>${v.where || ''}</b>${v.squares.filter(x => /^\d+$/.test(x)).map(x => ` · <a href="atlas.html#${x}">square ${x}</a>`).join('')}</div>
      <div class="full g-rows">${row('Madrid 1587, first edition (G)', v.g, 'es')}${row('Madrid 1587, Madrigal (M)', v.m, 'es')}${row('Naples 1588 (C)', v.c, 'es')}${row('English', v.en)}</div>
      ${v.note ? `<div class="full tnote">${v.note}</div>` : ''}</div>`).join('') + T.G_tail;
  }

  function render() {
    const C = FC.text.C, M = FC.text.M;
    const after = {};                                    // Madrigal passages placed after a Naples segment
    if (ed !== 'C') M.forEach(m => {
      let key = m.replaces;
      if (/^pdf\d+/.test(key)) { const n = +key.slice(3); const c = C.find(c => pdfRange(c.pdf).includes(n)); key = c ? c.id : C[C.length - 1].id; }
      if (!C.find(c => c.id === key)) key = C[C.length - 1].id;
      (after[key] = after[key] || []).push(m);
    });
    const seenPdf = new Set();
    let h = '';
    C.forEach(s => {
      const anchors = pdfRange(s.pdf).filter(p => !seenPdf.has(p)).map(p => {
        seenPdf.add(p);
        return `<span id="pdf${p}"></span>` + (pageOf(p) ? `<span id="p${pageOf(p)}"></span>` : '') + (leafOf(p) ? `<span id="leaf-${leafOf(p)}"></span>` : '');
      }).join('');
      h += `${anchors}<div class="seg ${esc(s.kind)}" id="${esc(s.id)}">`;
      if (s.kind === 'description') h += `<div class="en desc small muted">${s.en}</div>`;
      else if (s.kind === 'heading') h += `<h2 class="es" lang="es">${body(s.es, s.kind)}</h2><h2 class="en">${s.en}</h2>`;
      else h += `<div class="es" lang="es">${body(s.es, s.kind)}</div><div class="en">${s.kind === 'verse' ? body(s.en, 'verse') + (s.lit ? `<div class="small muted" style="font-family:var(--f-body)">Literally: ${esc(s.lit)}</div>` : '') : s.en}</div>`;
      h += `<div class="loc">${loc(s)}${s.squares.filter(x => /^\d+$/.test(x)).map(x => `<a href="atlas.html#${x}">square ${x}</a>`).join('')}</div>`;
      if (s.note) h += `<div class="full tnote">${s.note}</div>`;
      h += `</div>`;
      (after[s.id] || []).forEach(m => {
        h += `<div class="seg m-add" id="${esc(m.id)}"><div class="full badge">Madrid 1587 (Pedro Madrigal), fol. ${esc(m.fol)}: Spanish from the modernized transcription by Luigi Ciompi and Adrian Seville; English translated from it</div>
          <div class="es" lang="es">${body(m.es, m.kind)}</div><div class="en">${m.kind === 'verse' ? body(m.en, 'verse') : m.en}</div><div class="loc">fol. ${esc(m.fol)}</div>
          ${m.note ? `<div class="full tnote">${m.note}</div>` : ''}</div>`;
      });
    });
    $('#text').innerHTML = h;
    $('#gnote').innerHTML = ed === 'C' ? '' :
      `<details class="sect" open><summary>About the ${ed === 'G' ? 'first edition (Madrid 1587, widow of Alonso Gómez)' : 'Madrid edition of Pedro Madrigal (1587)'}</summary>
       ${ed === 'G' ? `<p class="notice">No image or transcription of the first edition is available to us. What is known of its text comes from Ernesto Lucero Sánchez’s collation (Criticón 2016) and articles; it is gathered below. The Madrigal passages are also shown in the text, marked in gold.</p>${gList()}` : FC.text.M_intro}</details>`;
    applyToggles();
  }

  function applyToggles() {
    document.body.classList.toggle('show-es-only', lang === 'es');
    document.body.classList.toggle('show-en-only', lang === 'en');
    $$('.tnote').forEach(n => { n.hidden = !$('#notes').checked; });
  }

  function setEdButtons() { $$('#edsel button').forEach(x => x.setAttribute('aria-pressed', x.dataset.ed === ed)); }

  document.addEventListener('DOMContentLoaded', () => {
    ed = FC.prefs.get('edition', 'C');
    if (!FC.EDITIONS[ed]) ed = 'C';
    // a link to a Madrigal passage or a G reading needs that edition shown
    if (/^#M-/.test(location.hash) && ed === 'C') ed = 'M';
    if (/^#G-/.test(location.hash)) ed = 'G';
    setEdButtons();
    $$('#edsel button').forEach(b => {
      b.title = 'Printed by ' + FC.EDITIONS[b.dataset.ed].printer;
      b.addEventListener('click', () => {
        // keep the reader's place: the first passage still on screen stays on screen
        const top = $('.text-controls').getBoundingClientRect().bottom - 4;
        const segs = $$('#text .seg');
        const anchor = segs.find(s => s.getBoundingClientRect().top >= top) || segs.find(s => s.getBoundingClientRect().bottom > top);
        const before = anchor && anchor.getBoundingClientRect().top;
        ed = b.dataset.ed; FC.prefs.set('edition', ed); setEdButtons(); render();
        const again = anchor && document.getElementById(anchor.id);
        if (again) window.scrollBy(0, again.getBoundingClientRect().top - before);
      });
    });
    $$('#langsel button').forEach(b => b.addEventListener('click', () => { lang = b.dataset.lang; $$('#langsel button').forEach(x => x.setAttribute('aria-pressed', x === b)); applyToggles(); }));
    $('#notes').addEventListener('change', applyToggles);
    render();

    // the page image panel
    const facs = $('#facs');
    const closeFacs = () => {
      facs.classList.remove('open'); document.body.classList.remove('facs-open');
      if (facs._opener && facs._opener.isConnected) facs._opener.focus();
    };
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-facs]');
      if (a) {
        e.preventDefault();
        const n = +a.dataset.facs, p = String(n).padStart(3, '0'), img = $('img', facs);
        FC.img.best.then(ext => { img.src = FC.img.swap(`img/book/p${p}.jpg`, ext); });
        img.alt = `Page image: Naples 1588, PDF page ${n}`;
        $('.cap', facs).textContent = `Naples 1588, PDF page ${n} (Vienna, ÖNB 35 V 49; Google Books)`;
        facs.classList.add('open'); document.body.classList.add('facs-open');
        facs._opener = a; facs.focus();
      }
      if (e.target.closest('#facs [data-close]')) { e.preventDefault(); closeFacs(); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && facs.classList.contains('open')) closeFacs(); });

    if (location.hash) {
      let id = ''; try { id = decodeURIComponent(location.hash.slice(1)); } catch (e) { id = ''; }
      let t = id && document.getElementById(id);
      if (!t && id) {                          // a blank page or leaf: go to the next passage
        const n = pdfOfHash(id);
        if (n) for (let k = n; k <= LAST && !t; k++) t = document.getElementById('pdf' + k);
        if (n && !t) for (let k = n; k >= FIRST && !t; k--) t = document.getElementById('pdf' + k);  // after the last passage
      }
      if (t) setTimeout(() => t.scrollIntoView(), 50);
    }
  });
})();
