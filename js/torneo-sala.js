/* «La sala de juego»: la ventana #sala de tacho-chess-2.html, con la foto del
 * gimnasio y qué mesas son de cada torneo. Lo pidió el dueño el 13/11/2026
 * («sí, ambas»: la foto en la página y el plano).
 *
 * Las mesas salen de Pareo Integral, no se escriben aquí: cada torneo trae en
 * `mesas` su primera mesa de la sala y la última que usa (una por cada dos
 * jugadores), que pone js/torneo-pareo-datos.js con la misma cuenta de
 * Pareo. Si el árbitro usa «Numerar seguido» o cambia la primera mesa de un
 * torneo, aquí cambia solo, igual que en los pareos («Mesa 12»). Con los
 * niveles de cada torneo (las categorías de sus jugadores, en el orden de
 * `ordenGrupos`), quien llega sabe hacia dónde caminar.
 *
 * Todo lo que viene de afuera (los nombres de los torneos) va por textContent.
 * Ver «La sala de juego» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";
  const V = window.CentroamericanoVivo;
  const caja = document.getElementById("sala-mesas");
  if (!V || !caja) return;
  const el = V.el;

  function pintar() {
    const lista = (((V.datos() || {}).torneos) || []).filter((t) => t.mesas && Array.isArray(t.jugadores) && t.jugadores.length);
    if (!lista.length) {
      caja.replaceChildren(el("p", "", V.datos() ? "Las mesas de cada torneo aparecen cuando los torneos estén publicados en Pareo Integral." : "Cargando las mesas…"));
      return;
    }
    // Dos torneos con los mismos números (en Pareo todavía no se numeró la
    // sala seguida: todos empiezan en la mesa 1) confundirían a quien llega:
    // entonces no se dan números, solo los torneos y sus niveles.
    const orden = lista.slice().sort((a, b) => a.mesas.desde - b.mesas.desde);
    const chocan = orden.some((t, i) => i > 0 && t.mesas.desde <= orden[i - 1].mesas.hasta);
    const ul = el("ul", "cac-sala-lista");
    orden.forEach((t) => {
      const niveles = [...new Set(t.jugadores.map((j) => j.grupo).filter(Boolean))].sort((a, b) => V.ordenGrupo(a) - V.ordenGrupo(b));
      const li = el("li", "cac-sala-torneo" + (chocan ? " cac-sala-sin" : ""));
      if (!chocan) li.appendChild(el("span", "cac-sala-mesas", t.mesas.desde === t.mesas.hasta ? "Mesa " + t.mesas.desde : "Mesas " + t.mesas.desde + " a " + t.mesas.hasta));
      const quien = el("div", "cac-sala-quien");
      quien.appendChild(el("p", "font-bold", t.texto || ""));
      if (niveles.length) quien.appendChild(el("p", "text-sm", niveles.map((g) => V.categoria(g)).join(" · ")));
      quien.appendChild(el("p", "text-sm", t.jugadores.length + (t.jugadores.length === 1 ? " jugador" : " jugadores")));
      li.appendChild(quien);
      ul.appendChild(li);
    });
    caja.replaceChildren(ul);
    if (chocan) caja.prepend(el("p", "text-sm font-semibold", "Los números de mesa de cada torneo aparecen aquí cuando la organización termine de acomodar la sala. Mientras tanto, tu mesa sale en «Pareos de la ronda» y en «Busca a tu jugador»."));
  }

  document.addEventListener("cac-datos", pintar);
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('a[href="#sala"]');
    if (a) { pintar(); V.pedir().then(pintar, pintar); }
  });
  if (location.hash === "#sala") V.pedir().then(pintar, pintar);
  pintar();
})();

/*! rev bfb5bbb0d2d82f9f */
