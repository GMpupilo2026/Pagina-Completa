/* La entrada de la Mesa del árbitro (mesa-arbitro.html): «¿Sobre qué vas a
   trabajar?». Pareo Integral y chess-results llevan a la organización del
   evento (centroamericano-mesas.html); «Dirijo solo» (#solo) muestra la mesa
   de siempre, la de un árbitro que anota él mismo. Un enlace de adjunto
   (#adjunto=… o #codigo=…) entra directo a esa mesa, para que sigan sirviendo
   los que ya se repartieron. Ver «La Mesa del árbitro con torneos de Pareo
   Integral» en docs/decisiones/juegos-y-torneos.md. */
(function () {
  "use strict";
  const entrada = document.getElementById("entrada");
  const solo = document.getElementById("solo");
  if (!entrada || !solo) return;
  const esSolo = () => /^#(solo|adjunto=|codigo=)/.test(location.hash);
  function mostrar(enfocar) {
    const s = esSolo();
    entrada.hidden = s;
    solo.hidden = !s;
    if (enfocar) {
      const destino = s ? solo.querySelector("h2") : document.getElementById("t-entrada");
      if (destino) { destino.setAttribute("tabindex", "-1"); destino.focus(); }
    }
  }
  window.addEventListener("hashchange", () => mostrar(true));
  const volver = document.getElementById("volver-entrada");
  if (volver) volver.addEventListener("click", (e) => {
    e.preventDefault();
    try { history.pushState(null, "", location.pathname + location.search); } catch (err) { location.hash = ""; }
    mostrar(true);
  });
  mostrar(false);
})();

/*! rev bfb5bbb0d2d82f9f */
