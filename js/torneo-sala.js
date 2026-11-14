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
 * LAS ZONAS SOBRE LA FOTO (`TorneoPagina.zonasSala`, las marcó el dueño el
 * 14/11/2026): una elipse por zona con su letra encima, y debajo de la foto
 * qué niveles juegan en cada una (el color nunca va solo: va la letra y el
 * nombre del color escrito). Cada torneo de la lista cae en la zona de los
 * niveles de sus jugadores y lleva su letra y su color.
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
  const ZS = (window.TorneoPagina && window.TorneoPagina.zonasSala) || null;
  const ZONAS = (ZS && ZS.zonas) || [];
  const NS = "http://www.w3.org/2000/svg";

  // La foto con las zonas encima: un marco con la foto, un SVG con las
  // elipses (en los píxeles de la foto, así escala con ella) y la letra.
  function dibujarZonas() {
    const foto = document.querySelector("#sala img.cac-sala-foto");
    if (!ZONAS.length || !foto || foto.closest(".cac-sala-plano")) return;
    const [ancho, alto] = ZS.foto;
    const marco = el("div", "cac-sala-plano");
    foto.replaceWith(marco);
    marco.appendChild(foto);
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + ancho + " " + alto);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "cac-sala-zonas");
    ZONAS.forEach((z) => {
      const [cx, cy, rx, ry] = z.elipse;
      [["#ffffff", 9], [z.trazo, 5]].forEach(([color, grueso]) => {
        const e = document.createElementNS(NS, "ellipse");
        e.setAttribute("cx", cx); e.setAttribute("cy", cy); e.setAttribute("rx", rx); e.setAttribute("ry", ry);
        e.setAttribute("fill", "none"); e.setAttribute("stroke", color); e.setAttribute("stroke-width", grueso);
        e.setAttribute("vector-effect", "non-scaling-stroke");
        svg.appendChild(e);
      });
    });
    marco.appendChild(svg);
    ZONAS.forEach((z) => {
      const [cx, cy, , ry] = z.elipse;
      const letra = el("span", "cac-sala-letra", z.letra);
      letra.setAttribute("aria-hidden", "true");
      letra.style.left = (cx / ancho * 100) + "%";
      letra.style.top = ((cy - ry) / alto * 100) + "%";
      letra.style.background = z.fondo;
      marco.appendChild(letra);
    });
    // Qué niveles juegan en cada zona, escrito.
    const orden = (window.TorneoPagina && window.TorneoPagina.ordenGrupos) || [];
    const ley = el("ul", "cac-sala-leyenda");
    ley.setAttribute("aria-label", "Las zonas de la sala");
    ZONAS.forEach((z) => {
      const li = el("li", "");
      const letra = el("span", "cac-sala-letra-chica", z.letra);
      letra.setAttribute("aria-hidden", "true");
      letra.style.background = z.fondo;
      const niveles = z.niveles.filter((n) => !orden.length || orden.includes(n));
      li.append(letra, el("span", "", "Zona " + z.letra + " (" + z.color + "): " + niveles.join(", ")));
      ley.appendChild(li);
    });
    marco.after(ley);
  }

  // La zona de un torneo: la que tiene más jugadores de sus niveles.
  function zonaDe(t) {
    let mejor = null, cuantos = 0;
    ZONAS.forEach((z) => {
      const n = t.jugadores.filter((j) => z.niveles.includes(j.grupo)).length;
      if (n > cuantos) { mejor = z; cuantos = n; }
    });
    return mejor;
  }

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
      const zona = zonaDe(t);
      const mesas = el("span", "cac-sala-mesas", t.mesas.desde === t.mesas.hasta ? "Mesa " + t.mesas.desde : "Mesas " + t.mesas.desde + " a " + t.mesas.hasta);
      if (zona) mesas.style.background = zona.fondo;
      li.appendChild(mesas);
      const quien = el("div", "cac-sala-quien");
      quien.appendChild(el("p", "font-bold", (zona ? "Zona " + zona.letra + " (" + zona.color + ") · " : chocan ? "Zona de " : "") + (t.texto || "")));
      if (niveles.length) quien.appendChild(el("p", "text-sm", niveles.map((g) => V.categoria(g)).join(" · ")));
      quien.appendChild(el("p", "text-sm", t.jugadores.length + (t.jugadores.length === 1 ? " jugador" : " jugadores")));
      li.appendChild(quien);
      ul.appendChild(li);
    });
    caja.replaceChildren(ul);
    if (chocan) caja.prepend(el("p", "text-sm font-semibold", (ZONAS.length ? "Cada torneo juega en su propia zona del gimnasio (las letras de la foto), con sus mesas numeradas desde la 1. Busca primero la zona de tu torneo (aquí abajo, por tu nivel) y después tu mesa" : "Cada torneo juega en su propia zona del gimnasio, con sus mesas numeradas desde la 1. Busca primero el cartel de la zona de tu torneo (aquí abajo, por tu nivel) y después tu mesa") + ", que sale en «Busca a tu jugador» y en «Pareos de la ronda»."));
  }

  document.addEventListener("cac-datos", pintar);
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('a[href="#sala"]');
    if (a) { pintar(); V.pedir().then(pintar, pintar); }
  });
  if (location.hash === "#sala") V.pedir().then(pintar, pintar);
  dibujarZonas();
  pintar();
})();

/*! rev bfb5bbb0d2d82f9f */
