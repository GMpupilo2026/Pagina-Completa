/* «Volver a intentar» lleva a la página que no se pudo abrir (main.js la
   manda en ?volver=), solo si es del sitio. */
(function () {
  "use strict";
  var volver = new URLSearchParams(location.search).get("volver") || "";
  var ok = /^https:\/\/ajedrez-integral\.com\//.test(volver);
  if (ok) document.getElementById("volver").href = volver;
})();

/*! rev bfb5bbb0d2d82f9f */
