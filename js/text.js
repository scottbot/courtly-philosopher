/* =========================================================================
   text.js — "The Book": the Naples 1588 text, Spanish beside English, segment by
   segment, with a facsimile of each page; optionally the Madrid 1587 passages.
   Anchors: text.html#C-038b (a segment) or text.html#pdf38 (a page of the scan).
   ========================================================================= */
(function () {
  const { $, $$, esc } = FC.util;
  let ed = 'C';

  function loc(s) {
    const pdfs = String(s.pdf).split('-').map(Number).filter(Boolean);
    const first = pdfs[0];
    const where = s.page ? `p. ${esc(s.page)}` : s.sig ? `sig. ${esc(s.sig)}` : '';
    return `${where}<a href="#" data-facs="${first}" title="Show the page of the 1588 book">page image</a><a href="#${s.id}" title="Link to this passage">¶ ${esc(s.id)}</a>`;
  }
  /** Spanish/English text: escape, keep *italic* runs of the transcription, verse lines. */
  function body(t, kind) {
    let h = esc(t).replace(/(^|[\s(«“])\*(?!\s)([^*]+?)\*(?=[\s.,;:)»”]|$)/g, '$1<em>$2</em>');
    return kind === 'verse' ? h.replace(/ \/ /g, '<br>') : h;
  }

  function render() {
    const C = FC.text.C, M = FC.text.M;
    const after = {};                                    // Madrigal passages placed after a Naples segment
    if (ed !== 'C') M.forEach(m => {
      let key = m.replaces;
      if (/^pdf\d+/.test(key)) { const n = +key.slice(3); const c = C.find(c => String(c.pdf).split('-').map(Number).includes(n)); key = c ? c.id : C[C.length - 1].id; }
      if (!C.find(c => c.id === key)) key = C[C.length - 1].id;
      (after[key] = after[key] || []).push(m);
    });
    const seenPdf = new Set();
    let h = '';
    C.forEach(s => {
      const pdfs = String(s.pdf).split('-').map(Number).filter(Boolean);
      const anchors = pdfs.filter(p => !seenPdf.has(p)).map(p => { seenPdf.add(p); return `<span id="pdf${p}"></span>`; }).join('');
      h += `${anchors}<div class="seg ${esc(s.kind)}" id="${esc(s.id)}">`;
      if (s.kind === 'description') h += `<div class="en desc small muted">${s.en}</div>`;
      else h += `<div class="es" lang="es">${body(s.es, s.kind)}</div><div class="en">${s.kind === 'verse' ? body(s.en, 'verse') + (s.lit ? `<div class="small muted" style="font-family:var(--f-body)">Literally: ${esc(s.lit)}</div>` : '') : s.en}</div>`;
      h += `<div class="loc">${loc(s)}${s.squares.filter(x => /^\d+$/.test(x)).map(x => `<a href="atlas.html#${x}">square ${x}</a>`).join('')}</div>`;
      if (s.note) h += `<div class="full tnote">${s.note}</div>`;
      h += `</div>`;
      (after[s.id] || []).forEach(m => {
        h += `<div class="seg m-add" id="${esc(m.id)}"><div class="full badge">Madrid 1587 (Pedro Madrigal) — fol. ${esc(m.fol)}; modernized transcription</div>
          <div class="es" lang="es">${body(m.es, m.kind)}</div><div class="en">${m.kind === 'verse' ? body(m.en, 'verse') : m.en}</div><div class="loc">fol. ${esc(m.fol)}</div>
          ${m.note ? `<div class="full tnote">${m.note}</div>` : ''}</div>`;
      });
    });
    $('#text').innerHTML = h;
    $('#gnote').innerHTML = ed === 'C' ? '' :
      `<details class="sect" open><summary>About the ${ed === 'G' ? 'first edition (Madrid 1587, widow of Alonso Gómez)' : 'Madrid edition of Pedro Madrigal (1587)'}</summary>
       ${ed === 'G' ? `<p class="notice">No image or transcription of the first edition is available to us. What is known of its text comes from Ernesto Lucero Sánchez’s collation (Criticón 2016) and articles; it is gathered below. The Madrigal passages are also shown in the text, marked in gold.</p>${FC.text.G_html}` : FC.text.M_intro}</details>`;
    applyToggles();
  }

  function applyToggles() {
    document.body.classList.toggle('show-es-only', lang === 'es');
    document.body.classList.toggle('show-en-only', lang === 'en');
    $$('.tnote').forEach(n => { n.hidden = !$('#notes').checked; });
  }
  let lang = 'both';

  document.addEventListener('DOMContentLoaded', () => {
    ed = FC.prefs.get('edition', 'C');
    $$('#edsel button').forEach(b => {
      b.setAttribute('aria-pressed', b.dataset.ed === ed);
      b.addEventListener('click', () => { ed = b.dataset.ed; FC.prefs.set('edition', ed); $$('#edsel button').forEach(x => x.setAttribute('aria-pressed', x === b)); render(); });
    });
    $$('#langsel button').forEach(b => b.addEventListener('click', () => { lang = b.dataset.lang; $$('#langsel button').forEach(x => x.setAttribute('aria-pressed', x === b)); applyToggles(); }));
    $('#notes').addEventListener('change', applyToggles);
    render();
    const facs = $('#facs');
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-facs]');
      if (a) {
        e.preventDefault();
        const n = +a.dataset.facs, p = String(n).padStart(3, '0');
        $('img', facs).src = `img/book/p${p}.jpg`;
        $('.cap', facs).textContent = `Naples 1588, PDF page ${n} (Vienna, ÖNB 35 V 49; Google Books)`;
        facs.classList.add('open');
      }
      if (e.target.closest('#facs [data-close]')) { e.preventDefault(); facs.classList.remove('open'); }
    });
    if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) setTimeout(() => t.scrollIntoView(), 50); }
  });
})();
