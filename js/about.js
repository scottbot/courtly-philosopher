/* =========================================================================
   about.js — the About page: essays, how this edition was made, bibliography.
   Anchors: about.html#about-rules, #note, #biblio, #bib-<citekey>.
   ========================================================================= */
(function () {
  const { $, esc } = FC.util;
  const TITLES = {
    'about-barros': 'Alonso de Barros', 'about-court': 'The court of Philip II and its petitioners',
    'about-goose': 'The Game of the Goose', 'about-editions': 'The three editions',
    'about-board': 'The board of 1588', 'about-rules': 'How the game is played',
    'about-reception': 'Readers, then and now',
  };
  const ORDER = ['about-barros', 'about-court', 'about-goose', 'about-editions', 'about-board', 'about-rules', 'about-reception'];

  document.addEventListener('DOMContentLoaded', () => {
    const pages = Object.fromEntries(FC.story.pages.map(p => [p.id, p]));
    let h = '', toc = '';
    ORDER.forEach(id => {
      if (!pages[id]) return;
      toc += `<li><a href="#${id}">${esc(TITLES[id])}</a></li>`;
      h += `<section class="about-sec" id="${id}"><h2>${esc(TITLES[id])}</h2>${pages[id].html}</section><hr>`;
    });
    toc += `<li><a href="#note">How this edition was made</a></li><li><a href="#biblio">Bibliography</a></li><li><a href="#credits">Credits and rights</a></li>`;
    h += `<section class="about-sec" id="note"><h2>How this edition was made</h2>${FC.story.note}</section><hr>`;
    const groups = {};
    FC.biblio.forEach(b => { (groups[b.group] = groups[b.group] || []).push(b); });
    h += `<section class="about-sec" id="biblio"><h2>Bibliography</h2><p class="small muted">Chicago author-date. Web sources consulted 30 September 2026. Short citations in the text (e.g. “Lucero 2021, 142”) point here; printed page numbers are given where the source has them.</p>`;
    Object.entries(groups).forEach(([g, list]) => {
      h += `<h3>${esc(g)}</h3><ul class="biblio">` + list.map(b => `<li id="bib-${esc(b.key)}"><b class="sc">${esc(b.label)}</b> — ${b.html}</li>`).join('') + `</ul>`;
    });
    h += `</section><hr><section class="about-sec" id="credits"><h2>Credits and rights</h2>
      <p><b>Who made this edition.</b> Claude, an AI model made by Anthropic, at the request of Scott B. Weingart, who set the brief, supplied the research library and the licensed British Museum photograph, and answered questions along the way. Claude read the sources, transcribed the 1588 book and the board from the page images, made the translations, wrote the annotations and essays, and wrote the code. Every quotation in the notes was checked by program against the text of its source. The transcriptions, translations and interpretations have not been reviewed by a specialist in early modern Spanish or Italian. This is a draft, and should not be trusted or cited as scholarship until it has been reviewed.</p>
      <p><b>Training.</b> None of the source material gathered for this project — the research library, the page images of the 1588 book and the British Museum photograph — was used by Anthropic to train its models. The model that made this edition had finished training before the work began and read the sources only while making it, and the account in which the work was done does not allow Anthropic to use its conversations or files for training. Whether publicly available copies of some of the works cited here were among the material the model was originally trained on is not something this edition can say.</p>
      <p><b>The board.</b> Mario Cartaro, <i>Filosofia cortesana de Alonso de Barros</i>, Naples 1588, etching and engraving, 531 × 404 mm. British Museum, 1869,0410.2463.+. Photograph © The Trustees of the British Museum, reproduced by this project under licence. The crops of individual squares and figures are details of that photograph.</p>
      <p><b>The book.</b> Alonso de Barros, <i>Filosofia cortesana moralizada</i>, Naples: Iosep Cacchij, 1588. Vienna, Österreichische Nationalbibliothek, 35 V 49, from the Google Books digitization (id 1FFfAAAAcAAJ). The page images are shown for study.</p>
      <p><b>Earlier work.</b> Earlier transcriptions and translations — Ciompi and Seville’s transcription on <a href="http://www.giochidelloca.it/scheda.php?id=1103" target="_blank" rel="noopener">giochidelloca.it</a> and the translation of the board on the <i>La Bella Donna</i> blog — were consulted and are cited where they are discussed, but not reused. The scholarship on which the notes rest is listed above; every claim is cited to it.</p>
      <p><b>Fonts.</b> EB Garamond (Georg Duffner and Octavio Pardo) and the IM Fell types (Igino Marini), from Google Fonts, under the SIL Open Font License.</p>
      <p><b>Licences.</b> What this edition made is free to reuse. The transcriptions, translations, annotations, essays, introduction and rule descriptions are under the <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">Creative Commons Attribution 4.0 International licence</a> (CC BY 4.0); the code — pages, stylesheets, scripts, tools and tests — is under the MIT License.</p>
      <p>Neither licence covers anything that comes from another source. That means: the words of Barros, Cartaro and the other early printed texts, which are in the public domain and not this edition’s to license; quotations from modern scholarship and other works, which remain their authors’ and are quoted for study and criticism; the board photograph and every detail cut from it (© The Trustees of the British Museum); the page images of the 1588 book (Österreichische Nationalbibliothek, digitized by Google Books); and the fonts (SIL Open Font License).</p></section>`;
    $('#about').innerHTML = h;
    $('#toc').innerHTML = toc;
    if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) setTimeout(() => t.scrollIntoView(), 50); }
  });
})();
