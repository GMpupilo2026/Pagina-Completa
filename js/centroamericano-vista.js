/* CÓMO VE CADA ÁRBITRO SUS MESAS (centroamericano-arbitro.html): lo único que la tablet recuerda es QUÉ VISTA eligió («clasica» o «tres»).
   Vive en su propio archivo a propósito: la página del árbitro (js/centroamericano-arbitro.js) NO puede tocar localStorage, sessionStorage,
   IndexedDB ni cookies —el token de su enlace no se guarda en ningún lado, y `verificar-centroamericano-mesas.js` lo comprueba—, y esta
   preferencia no tiene nada que ver con el token: solo guarda una palabra bajo una llave propia, nunca lo que se le pase de la página.
   Cualquier falla (modo privado, datos bloqueados) se traga: sin almacenamiento la elección vale mientras la página esté abierta.
   Ver «Cada árbitro elige cómo ver sus mesas» en docs/decisiones/juegos-y-torneos.md. */
(function (raiz) {
  "use strict";
  var LLAVE = "cam-vista-mesas";
  var VALIDAS = ["clasica", "tres"];
  function leer() {
    try { var v = raiz.localStorage.getItem(LLAVE); return VALIDAS.indexOf(v) >= 0 ? v : null; } catch (e) { return null; }
  }
  function guardar(v) {
    if (VALIDAS.indexOf(v) < 0) return false;
    try { raiz.localStorage.setItem(LLAVE, v); return true; } catch (e) { return false; }
  }
  raiz.CentroamericanoVista = { LLAVE: LLAVE, VALIDAS: VALIDAS, leer: leer, guardar: guardar };
})(typeof window !== "undefined" ? window : this);

/*! rev bfb5bbb0d2d82f9f */
