/* theme.js — apply the remembered light/dark choice before the page is drawn. Loaded in <head>
   (not deferred), so that a dark page never flashes light. It is a file rather
   than an inline script because the pages' Content-Security-Policy allows scripts from this site
   only. The key is FC.prefs's 'theme' (js/common.js), with the same site prefix. */
try{var t=JSON.parse(localStorage.getItem('filosofia-cortesana:theme'));if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}
