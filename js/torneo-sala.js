/* «La sala de juego»: la ventana #sala de tacho-chess-2.html, con la foto del
 * gimnasio y qué mesas son de cada torneo. Lo pidió el dueño el 13/11/2026
 * («sí, ambas»: la foto en la página y el plano).
 *
 * Las mesas salen de Pareo Integral, no se escriben aquí: cada torneo trae en
 * `mesas` su primera mesa de la sala y la última que usa (una por cada dos
 * jugadores), que pone js/torneo-pareo-datos.js con la misma cuenta de
 * Pareo. Si los torneos comparten números (cada uno empieza en la 1), cada
 * torneo es una zona del gimnasio con su numeración; si la sala está numerada
 * seguida, va en el orden de las mesas. Igual que en los pareos. Con los
 * niveles de cada torneo (las categorías de sus jugadores, en el orden de
 * `ordenGrupos`), quien llega sabe hacia dónde caminar.
 *
 * Con las mesas marcadas sobre la foto (`TorneoPagina.mesasSala`,
 * js/torneo-sala-foto.js), la foto lleva cada mesa numerada y cada torneo de
 * la lista, el color de su zona.
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
  const FOTO = window.TorneoSalaFoto || null;

  function pintar() {
    const lista = (((V.datos() || {}).torneos) || []).filter((t) => t.mesas && Array.isArray(t.jugadores) && t.jugadores.length);
    if (!lista.length) {
      caja.replaceChildren(el("p", "", V.datos() ? "Las mesas de cada torneo aparecen cuando los torneos estén publicados en Pareo Integral." : "Cargando las mesas…"));
      return;
    }
    // Dos torneos con los mismos números: cada torneo juega en SU ZONA del
    // gimnasio, con sus mesas desde la 1 (lo eligió el dueño el 13/11/2026:
    // los torneos se crearon por separado en Pareo, sin evento, y no hay
    // «Numerar seguido»). Entonces cada uno va como una zona, en el orden de
    // los niveles, y se dice que primero se busca la zona y después la mesa.
    // Con la sala numerada seguida, va en el orden de las mesas, sin zonas.
    const chocan = lista.some((t, i) => lista.some((u, k) => k !== i && t.mesas.desde <= u.mesas.hasta && u.mesas.desde <= t.mesas.hasta));
    const orden = chocan ? lista.slice() : lista.slice().sort((a, b) => a.mesas.desde - b.mesas.desde);
    const ul = el("ul", "cac-sala-lista");
    orden.forEach((t) => {
      const niveles = [...new Set(t.jugadores.map((j) => j.grupo).filter(Boolean))].sort((a, b) => V.ordenGrupo(a) - V.ordenGrupo(b));
      const li = el("li", "cac-sala-torneo");
      // Con las mesas marcadas en la foto (js/torneo-sala-foto.js), la zona
      // dice su color y el número lleva el fondo de su torneo.
      const zona = FOTO && FOTO.torneoDe(t);
      const mesas = el("span", "cac-sala-mesas", t.mesas.desde === t.mesas.hasta ? "Mesa " + t.mesas.desde : "Mesas " + t.mesas.desde + " a " + t.mesas.hasta);
      if (zona) mesas.style.background = zona.fondo;
      li.appendChild(mesas);
      const quien = el("div", "cac-sala-quien");
      quien.appendChild(el("p", "font-bold", (zona ? "Zona " + zona.color + " · " : chocan ? "Zona de " : "") + (t.texto || "")));
      if (niveles.length) quien.appendChild(el("p", "text-sm", niveles.map((g) => V.categoria(g)).join(" · ")));
      quien.appendChild(el("p", "text-sm", t.jugadores.length + (t.jugadores.length === 1 ? " jugador" : " jugadores")));
      li.appendChild(quien);
      ul.appendChild(li);
    });
    caja.replaceChildren(ul);
    if (chocan) caja.prepend(el("p", "text-sm font-semibold", "Cada torneo juega en su propia zona del gimnasio, con sus mesas numeradas desde la 1. Busca primero el cartel de la zona de tu torneo (aquí abajo, por tu nivel) y después tu mesa, que sale en «Busca a tu jugador» y en «Pareos de la ronda»."));
  }

  document.addEventListener("cac-datos", pintar);
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('a[href="#sala"]');
    if (a) { pintar(); V.pedir().then(pintar, pintar); }
  });
  if (location.hash === "#sala") V.pedir().then(pintar, pintar);
  // La foto con todas las mesas numeradas (si el torneo las tiene marcadas).
  if (FOTO) FOTO.enSala();
  pintar();
})();

/*! rev bfb5bbb0d2d82f9f */
