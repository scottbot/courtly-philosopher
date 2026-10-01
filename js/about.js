/* =========================================================================
   about.js — the About page: essays, how this edition was made, bibliography.
   Anchors: about.html#about-glance, #about-rules, …, #note, #biblio, #bib-<citekey>.
   The essays come from content/E_story_about.md, section B (data/about.js); their
   order and titles are set here (a "title:" line under an essay's heading overrides).
   ========================================================================= */
(function () {
  const { $, esc } = FC.util;
  const TITLES = {
    'about-glance': 'At a glance', 'about-barros': 'Alonso de Barros', 'about-court': 'The court of Philip II and its petitioners',
    'about-kind': 'What kind of book?', 'about-goose': 'The Game of the Goose', 'about-editions': 'The three editions',
    'about-board': 'The board of 1588', 'about-rules': 'How the game is played', 'about-money': 'Playing for money',
    'about-reception': 'Readers, then and now', 'about-debates': 'Where scholars disagree',
  };
  const ORDER = ['about-glance', 'about-barros', 'about-court', 'about-kind', 'about-goose', 'about-editions', 'about-board',
    'about-rules', 'about-money', 'about-reception', 'about-debates'];

  document.addEventListener('DOMContentLoaded', () => {
    const pages = Object.fromEntries(FC.about.pages.map(p => [p.id, p]));
    // essays the content has but this list does not: shown at the end rather than lost
    const ids = ORDER.concat(FC.about.pages.map(p => p.id).filter(id => !ORDER.includes(id)));
    let h = '', toc = '';
    ids.forEach(id => {
      if (!pages[id]) return;
      const title = pages[id].title || TITLES[id] || id.replace(/^about-/, '');
      toc += `<li><a href="#${id}">${esc(title)}</a></li>`;
      h += `<section class="about-sec" id="${id}" aria-labelledby="h-${id}"><h2 id="h-${id}">${esc(title)}</h2>${pages[id].html}</section><hr>`;
    });
    toc += `<li><a href="#note">How this edition was made</a></li><li><a href="#biblio">Bibliography</a></li><li><a href="#credits">Credits and rights</a></li>`;
    h += `<section class="about-sec" id="note"><h2>How this edition was made</h2>${FC.about.note}</section><hr>`;
    const groups = {};
    // duplicate records are not listed: citations of them already point to the original
    FC.biblio.filter(b => !b.dup).forEach(b => { (groups[b.group] = groups[b.group] || []).push(b); });
    h += `<section class="about-sec" id="biblio"><h2>Bibliography</h2><p class="small muted">Chicago author-date. Web sources consulted 30 September 2026. Short citations in the text (e.g. “Lucero 2021, 142”) point here; printed page numbers are given where the source has them.</p>`;
    Object.entries(groups).forEach(([g, list]) => {
      h += `<h3>${esc(g)}</h3><ul class="biblio">` + list.map(b => `<li id="bib-${esc(b.key)}"><b class="sc">${esc(b.label)}</b> — ${b.html}</li>`).join('') + `</ul>`;
    });
    h += `</section><hr><section class="about-sec" id="credits"><h2>Credits and rights</h2>
      <p><b>Who made this edition.</b> Claude, an AI model made by Anthropic, at the request of Scott B. Weingart, who set the brief, supplied the research library and the licensed British Museum photograph, and answered questions along the way. Claude read the sources, transcribed the 1588 book and the board from the page images, made the translations, wrote the annotations and essays, and wrote the code. The short quotations marked as verified in the source files (146 of them) were checked by program against the text of their sources; many other quotations were compared with their sources by the independent audits, but not all of them. The transcriptions, translations and interpretations have not been reviewed by a specialist in early modern Spanish or Italian. This is a draft, and should not be trusted or cited as scholarship until it has been reviewed.</p>
      <p><b>Training.</b> None of the source material gathered for this project — the research library, the page images of the 1588 book and the British Museum photograph — was used by Anthropic to train its models. The model that made this edition had finished training before the work began and read the sources only while making it, and the account in which the work was done does not allow Anthropic to use its conversations or files for training. Whether publicly available copies of some of the works cited here were among the material the model was originally trained on is not something this edition can say.</p>
      <p><b>The board.</b> Mario Cartaro, <i>Filosofia cortesana de Alonso de Barros</i>, Naples 1588, etching and engraving, 531 × 404 mm. British Museum, 1869,0410.2463.+. Photograph © The Trustees of the British Museum, reproduced by this project under license. The crops of individual squares and figures are details of that photograph.</p>
      <p><b>The book.</b> Alonso de Barros, <i>Filosofia cortesana moralizada</i>, Naples: Iosep Cacchij, 1588. Vienna, Österreichische Nationalbibliothek, 35 V 49, from the Google Books digitization (id 1FFfAAAAcAAJ). The page images are shown for study.</p>
      <p><b>Earlier work.</b> The Spanish of the Madrid 1587 (Pedro Madrigal) edition, wherever it appears on the site (on the Book and Play pages, in the Squares and in quotations in the notes), is copied from the modernized transcription by Luigi Ciompi and Adrian Seville on <a href="http://www.giochidelloca.it/scheda.php?id=1103" target="_blank" rel="noopener">giochidelloca.it</a>, made from Trevor J. Dadson’s 1987 edition. It is their work, credited where it appears, and it is not covered by this edition’s public-domain dedication; the edition’s English of that edition is translated from it. The English translation of the board on the <i>La Bella Donna</i> blog was compared with this edition’s own and is cited where it is discussed; no text was taken from it. The scholarship on which the notes rest is listed above; every claim is cited to it.</p>
      <p><b>Fonts.</b> EB Garamond (Georg Duffner and Octavio Pardo) and the IM Fell types (Igino Marini), from Google Fonts, under the SIL Open Font License.</p>
      <p><b>Map.</b> The map in “At a glance” is drawn from Natural Earth data, which is in the public domain.</p>
      <p><b>Rights.</b> No rights are claimed in what this edition made. To the extent that copyright subsists in this AI-produced work, Scott B. Weingart waives it under <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener">CC0 1.0 Universal</a>. That covers the transcriptions, translations, annotations, essays, introduction and rule descriptions, and the code: pages, stylesheets, scripts, tools and tests.</p>
      <p>This means only that no rights are claimed in the material presented here. It is not a statement that any of it is in the public domain: an AI-produced work can repeat or closely follow material that exists elsewhere under other terms, and this edition has not checked everything it contains against everything published. Before treating any part of it as free of rights, check it independently.</p>
      <p>It does not cover anything that comes from another source: the words of Barros, Cartaro and the other early printed texts, which are in the public domain already; the Spanish of the Madrid (Madrigal) edition, which is Ciompi and Seville’s transcription; quotations from modern scholarship and other works, which remain their authors’ and are quoted for study and criticism; the board photograph and every detail cut from it (© The Trustees of the British Museum); the page images of the 1588 book (Österreichische Nationalbibliothek, digitized by Google Books); and the fonts (SIL Open Font License).</p></section>`;
    $('#about').innerHTML = h;
    $('#toc').innerHTML = toc;
    if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) setTimeout(() => t.scrollIntoView(), 50); }
  });
})();
