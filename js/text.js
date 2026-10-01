/* =========================================================================
   text.js — "The Book": the Naples 1588 text, Spanish beside English, segment by
   segment, with a facsimile of each page; optionally the Madrid 1587 passages, and
   what is known of the first edition (G).
   Anchors: text.html#C-038b (a segment), text.html#pdf38 (a page of the scan; every
   page a segment covers has one), #M-41v-a (a Madrigal passage), #G-05 (a G reading).
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
  function loc(s) {
    const first = pdfRange(s.pdf)[0];
    const where = s.page ? `p. ${esc(s.page)}` : s.sig ? `<span title="signature: the printer’s mark for gathering and leaf">leaf ${esc(s.sig)}</span>` : '';
    return `${where}<a href="#" data-facs="${first}" title="Show the page of the 1588 book">page image</a><a href="#${s.id}" aria-label="Link to this passage (${esc(s.id)})" title="Link to this passage">link</a>`;
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
      const anchors = pdfRange(s.pdf).filter(p => !seenPdf.has(p)).map(p => { seenPdf.add(p); return `<span id="pdf${p}"></span>`; }).join('');
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

    if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) setTimeout(() => t.scrollIntoView(), 50); }
  });
})();
