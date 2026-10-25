/* Lo que se arma con los datos de chess-results en centroamericano-2026.html,
 * además del buscador y el medallero (js/centroamericano-vivo.js):
 *
 * - La clasificación completa de cada categoría (#clasificacion), con el
 *   rendimiento de cada jugador.
 * - La tabla por país (#delegaciones): puntos, porcentaje y ronda a ronda.
 * - El pareo para proyectar (#proyector): letra grande, pasa solo por el pareo
 *   y la clasificación de cada categoría cada 15 segundos (o solo uno de los
 *   dos), con la hora, cómo va la ronda y un QR a la página; con el torneo
 *   terminado, empieza por los podios. Para una pantalla en la sala.
 * - Las sorpresas (el de menos Elo que puntúa contra el de más) y los invictos (#sorpresas).
 * - Cara a cara (#cara-a-cara): dos jugadores lado a lado y su partida.
 * - El diploma de cada jugador al terminar el torneo, en imagen y en PDF.
 * - La hoja de la delegación en PDF: sus jugadores en la ronda, con mesa,
 *   color y rival (js/reporte-pdf.js).
 * - La imagen para compartir a un jugador (con su puesto ronda a ronda), la
 *   del resumen de una delegación y «Así terminó el día» (los líderes, la
 *   sorpresa del día y la delegación elegida), con la marca de agua de Ajedrez
 *   Integral (js/tabla-imagen.js, la misma copia).
 *
 * Los datos, las rondas de cada jugador y los textos comunes salen de
 * window.CentroamericanoVivo: una sola copia. Todo lo de afuera (nombres) va
 * por textContent o al lienzo, nunca como HTML.
 *
 * Otra página de torneo (la de CENFOTEC) pone en window.TorneoPagina el
 * nombre, la dirección y la cara de su imagen para compartir; sin eso, es la
 * del Centroamericano. Con el torneo terminado (ver normalizar() en
 * js/centroamericano-vivo.js), el proyector pasa los podios y la
 * clasificación final, no un pareo.
 *
 * Ver «La clasificación, la tabla por país y el pareo para proyectar» en
 * docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  const V = window.CentroamericanoVivo;
  if (!V) return;
  const $ = (id) => document.getElementById(id);
  const el = V.el;
  const SEGUNDOS_PROYECTOR = 15;
  const MESAS_POR_PAGINA = 12;
  const CONFIG = window.TorneoPagina || {};
  const URL_PAGINA = CONFIG.url || "ajedrez-integral.com/centroamericano-2026.html";
  const NOMBRE_CORTO = CONFIG.nombreCorto || "Centroamericano 2026";
  // La cara de la imagen para compartir: la banda de arriba, su dibujo (redondo
  // como el pizote o ancho como un logo) y las franjas de abajo.
  const CARA = Object.assign({
    banda: "#40478f", tinta: "#1e2453", acento: "#40478f", suave: "#f4f4fb",
    dibujo: "img/centroamericano-2026/mascota.jpg", redondo: true, archivo: "centroamericano-2026",
    franjas: [["#1e4c8a", 1040], ["#ffffff", 1050], ["#ce1328", 1058], ["#ffffff", 1066], ["#1e4c8a", 1072]],
  }, CONFIG.imagen || {});

  const TEXTOS = {
    es: {
      cargando: "Buscando en chess-results…",
      error: "No pudimos leer chess-results ahora mismo. Vuelve a intentarlo en un rato.",
      antes: "Lista inicial: el torneo todavía no empieza.",
      despues: (r) => "Después de la ronda " + r + ".",
      final: (r) => "Clasificación final, después de la ronda " + r + ".",
      colPuesto: "Puesto", colJugador: "Jugador", colFed: "FED", colElo: "Elo", colPuntos: "Puntos", colRend: "Rend.",
      colPais: "País", colJugadores: "Jugadores", colDe: "De", colPorc: "%",
      colRonda: (r) => "R" + r,
      nadie: "Nadie con ese nombre en esta categoría.",
      sinResultados: "Los puntos aparecen cuando termine la ronda 1. Mientras, cuántos jugadores trae cada país:",
      notaPaises: "«De» son los puntos posibles: un punto por cada ronda con resultado (los byes cuentan). Ordenada por el porcentaje.",
      proyTitulo: (r, cat, pag, de) => "Ronda " + r + " · " + cat + (de > 1 ? " · " + pag + "/" + de : ""),
      proySinPareo: "El pareo de la ronda todavía no está publicado.",
      proyMesa: "Mesa", proyBlancas: "Blancas", proyNegras: "Negras", proyResultado: "Resultado",
      proyBye: "bye (descansa)",
      pausa: "Pausa", seguir: "Seguir",
      imgSub: "XXI Festival Centroamericano y del Caribe de la Juventud · Costa Rica",
      imgPuesto: (p, de) => "Puesto " + p + " de " + de,
      imgPuntos: (pts, r) => pts + (pts === "1" ? " punto" : " puntos") + " tras la ronda " + r,
      imgFinal: (pts, r) => pts + (pts === "1" ? " punto" : " puntos") + " en " + r + " rondas",
      imgInicial: (n) => "Número inicial " + n,
      imgAntes: "El torneo empieza el 2 de noviembre",
      imgRonda: (r, que, rival) => "Ronda " + r + ": " + que + (rival ? " " + rival : ""),
      compartirTexto: (n) => n + " en el Centroamericano 2026:",
      imagenLista: "Listo: la imagen se bajó a tu aparato.",
      imagenError: "No se pudo armar la imagen. Intenta de nuevo.",
      sorpresa: (r, cat, yo, gano, rival, dif) => "Ronda " + r + " · " + cat + ": " + yo + (gano ? " le ganó a " : " hizo tablas con ") + rival + ", " + dif + " puntos de Elo más.",
      sorpresasRonda: (r) => "Las sorpresas de la ronda " + r,
      sorpresasTorneo: "Las sorpresas del torneo",
      ningunaSorpresa: "Ninguna todavía: hasta ahora ganó siempre el de más Elo.",
      sinSorpresas: "Las sorpresas aparecen cuando termine la ronda 1.",
      invictos: "Invictos de cada categoría",
      nadieInvicto: "Nadie va invicto.",
      puntosCortos: (p) => p + (p === "1" ? " punto" : " puntos"),
      modoTodo: "Pareo y clasificación", modoPareo: "Solo el pareo", modoClasif: "Solo la clasificación",
      proyClasif: (r, cat, pag, de) => "Clasificación · " + cat + " · tras la ronda " + r + (de > 1 ? " · " + pag + "/" + de : ""),
      proyPodios: "Los podios",
      imgResumenSub: "Centroamericano 2026 · Costa Rica",
      imgMas: (n) => "y " + n + " más",
      imgPuestos: (lista) => "Puesto ronda a ronda: " + lista,
      diaBoton: "Imagen del día para compartir",
      diaTermino: "Así terminó el día", diaVa: "Así va el día",
      diaFecha: (fecha, rondas) => fecha.charAt(0).toUpperCase() + fecha.slice(1).replace(",", "") + " · " + (rondas.length === 1 ? "ronda " + rondas[0] : "rondas " + rondas.join(" y ")),
      diaLideres: "Los líderes de cada categoría",
      diaLider: (cat, nombre, pts, mas) => cat + ": " + nombre + " · " + pts + (mas ? " (empatado con " + mas + (mas === 1 ? " más)" : " más)") : ""),
      diaSorpresa: "La sorpresa del día",
      diaSinSorpresa: "Hoy ganó siempre el de más Elo.",
      diaDeleg: (pais, pts, de, g, e, p) => {
        const cuenta = [[g, g === 1 ? " ganada" : " ganadas"], [e, " en tablas"], [p, p === 1 ? " perdida" : " perdidas"]].filter(([n]) => n).map(([n, s]) => n + s).join(", ");
        return pais + " hoy: " + pts + " de " + de + " puntos" + (cuenta ? " (" + cuenta + ")" : "");
      },
      diaAntes: "La imagen del día sale cuando termine la ronda 1.",
      diaTexto: (titulo) => titulo + " en el Centroamericano 2026:",
      caraElige: "Escribe el apellido de cada uno y elígelo de la lista.",
      caraMismo: "Elige dos jugadores distintos.",
      caraVarios: (n) => "Hay " + n + " jugadores con ese nombre: elige uno de la lista.",
      caraNadie: "No encontramos a nadie con ese nombre.",
      caraDistintas: "Juegan en categorías distintas: no se pueden enfrentar en este torneo.",
      caraNoJugaron: "Todavía no se han enfrentado.",
      caraJugaron: (r, a, color, res, b) => "Se enfrentaron en la ronda " + r + ": " + a + " (con " + color + ") " + (res === 1 ? "le ganó a " + b : res === 0.5 ? "hizo tablas con " + b : "perdió con " + b) + ".",
      caraJuegan: (r, a, color, b) => "Se enfrentan en la ronda " + r + ": " + a + " juega con " + color + " contra " + b + ".",
      caraFilas: ["Categoría", "País", "Elo", "Puesto", "Puntos", "Rendimiento"],
      caraRonda: "Ronda",
      dipEvento: "XXI Festival Centroamericano y del Caribe de la Juventud",
      dipTitulo: "Diploma",
      dipOtorga: "Se otorga a",
      dipPodio: (p, cat) => "por obtener el " + (p === 1 ? "1.er" : p === 3 ? "3.er" : p + ".º") + " lugar (" + ["oro", "plata", "bronce"][p - 1] + ") en la categoría " + cat,
      dipParticipa: (cat) => "por su participación en la categoría " + cat,
      dipDetalle: (pts, rondas, p, de) => pts + (pts === "1" ? " punto" : " puntos") + (rondas ? " en " + rondas + " rondas" : "") + " · puesto " + p + " de " + de,
      dipLugar: "Gimnasio Nacional, La Sabana · San José, Costa Rica · del 1 al 8 de noviembre de 2026",
      dipPie: "Según la clasificación final publicada en chess-results",
      dipListo: "Listo: el diploma se bajó a tu aparato.",
      dipCompartir: (n) => "El diploma de " + n + " en el " + NOMBRE_CORTO + ":",
      pdfTitulo: (pais, r) => pais + (r ? " · Ronda " + r : " · Lista inicial"),
      pdfSub: "XXI Festival Centroamericano y del Caribe de la Juventud · Costa Rica 2026 · Hoja de la delegación",
      pdfResumen: (n, r) => (n === 1 ? "1 jugador" : n + " jugadores") + (r ? " · pareo de la ronda " + r : " · el pareo de la ronda 1 todavía no está publicado"),
      pdfColPts: "Pts.", pdfColMesa: "Mesa", pdfColColor: "Color", pdfColRival: "Rival", pdfColRes: "Res.",
      pdfNoAparece: "no aparece en el pareo",
      pdfNota: (leido) => (leido ? leido + " " : "") + "Lo oficial es lo que publica el árbitro en chess-results.",
      pdfPie: "Ajedrez Integral · ajedrez-integral.com/centroamericano-2026.html",
      pdfPagina: (n, total) => "Página " + n + " de " + total,
      pdfLista: "Listo: la hoja se bajó a tu aparato.",
      pdfError: "No se pudo armar la hoja. Intenta de nuevo.",
      locale: "es-CR",
    },
    en: {
      cargando: "Searching chess-results…",
      error: "We couldn't read chess-results right now. Please try again in a while.",
      antes: "Starting list: the tournament hasn't started yet.",
      despues: (r) => "After round " + r + ".",
      final: (r) => "Final standings, after round " + r + ".",
      colPuesto: "Place", colJugador: "Player", colFed: "FED", colElo: "Rating", colPuntos: "Points", colRend: "Perf.",
      colPais: "Country", colJugadores: "Players", colDe: "Of", colPorc: "%",
      colRonda: (r) => "R" + r,
      nadie: "Nobody with that name in this section.",
      sinResultados: "Points show up once round 1 is over. Meanwhile, how many players each country brings:",
      notaPaises: "“Of” is the possible points: one per round with a result (byes count). Sorted by percentage.",
      proyTitulo: (r, cat, pag, de) => "Round " + r + " · " + cat + (de > 1 ? " · " + pag + "/" + de : ""),
      proySinPareo: "The pairings of the round are not published yet.",
      proyMesa: "Board", proyBlancas: "White", proyNegras: "Black", proyResultado: "Result",
      proyBye: "bye (rests)",
      pausa: "Pause", seguir: "Resume",
      imgSub: "21st Central American and Caribbean Youth Festival · Costa Rica",
      imgPuesto: (p, de) => "Place " + p + " of " + de,
      imgPuntos: (pts, r) => pts + (pts === "1" ? " point" : " points") + " after round " + r,
      imgFinal: (pts, r) => pts + (pts === "1" ? " point" : " points") + " in " + r + " rounds",
      imgInicial: (n) => "Starting number " + n,
      imgAntes: "The tournament starts on November 2",
      imgRonda: (r, que, rival) => "Round " + r + ": " + que + (rival ? " " + rival : ""),
      compartirTexto: (n) => n + " at the Centroamericano 2026:",
      imagenLista: "Done: the image was saved to your device.",
      imagenError: "We couldn't make the image. Please try again.",
      sorpresa: (r, cat, yo, gano, rival, dif) => "Round " + r + " · " + cat + ": " + yo + (gano ? " beat " : " drew with ") + rival + ", rated " + dif + " points higher.",
      sorpresasRonda: (r) => "The upsets of round " + r,
      sorpresasTorneo: "The upsets of the tournament",
      ningunaSorpresa: "None yet: so far the higher-rated player always won.",
      sinSorpresas: "Upsets show up once round 1 is over.",
      invictos: "Unbeaten players in each section",
      nadieInvicto: "Nobody is unbeaten.",
      puntosCortos: (p) => p + (p === "1" ? " point" : " points"),
      modoTodo: "Pairings and standings", modoPareo: "Pairings only", modoClasif: "Standings only",
      proyClasif: (r, cat, pag, de) => "Standings · " + cat + " · after round " + r + (de > 1 ? " · " + pag + "/" + de : ""),
      proyPodios: "The podiums",
      imgResumenSub: "Centroamericano 2026 · Costa Rica",
      imgMas: (n) => "and " + n + " more",
      imgPuestos: (lista) => "Place round by round: " + lista,
      diaBoton: "Today's image to share",
      diaTermino: "How the day ended", diaVa: "How the day is going",
      diaFecha: (fecha, rondas) => fecha + " · " + (rondas.length === 1 ? "round " + rondas[0] : "rounds " + rondas.join(" and ")),
      diaLideres: "The leaders of each section",
      diaLider: (cat, nombre, pts, mas) => cat + ": " + nombre + " · " + pts + (mas ? " (tied with " + mas + " more)" : ""),
      diaSorpresa: "The upset of the day",
      diaSinSorpresa: "Today the higher-rated player always won.",
      diaDeleg: (pais, pts, de, g, e, p) => {
        const cuenta = [[g, g === 1 ? " win" : " wins"], [e, e === 1 ? " draw" : " draws"], [p, p === 1 ? " loss" : " losses"]].filter(([n]) => n).map(([n, s]) => n + s).join(", ");
        return pais + " today: " + pts + " of " + de + " points" + (cuenta ? " (" + cuenta + ")" : "");
      },
      diaAntes: "Today's image is ready once round 1 is over.",
      diaTexto: (titulo) => titulo + " at the Centroamericano 2026:",
      caraElige: "Type each one's last name and choose them from the list.",
      caraMismo: "Choose two different players.",
      caraVarios: (n) => n + " players match that name: choose one from the list.",
      caraNadie: "We couldn't find anyone with that name.",
      caraDistintas: "They play in different sections: they can't meet in this tournament.",
      caraNoJugaron: "They haven't met yet.",
      caraJugaron: (r, a, color, res, b) => "They met in round " + r + ": " + a + " (" + color + ") " + (res === 1 ? "beat " + b : res === 0.5 ? "drew with " + b : "lost to " + b) + ".",
      caraJuegan: (r, a, color, b) => "They meet in round " + r + ": " + a + " plays " + color + " against " + b + ".",
      caraFilas: ["Section", "Country", "Rating", "Place", "Points", "Performance"],
      caraRonda: "Round",
      dipEvento: "21st Central American and Caribbean Youth Festival",
      dipTitulo: "Certificate",
      dipOtorga: "Awarded to",
      dipPodio: (p, cat) => "for " + ["1st", "2nd", "3rd"][p - 1] + " place (" + ["gold", "silver", "bronze"][p - 1] + ") in the " + cat + " section",
      dipParticipa: (cat) => "for taking part in the " + cat + " section",
      dipDetalle: (pts, rondas, p, de) => pts + (pts === "1" ? " point" : " points") + (rondas ? " in " + rondas + " rounds" : "") + " · place " + p + " of " + de,
      dipLugar: "National Gymnasium, La Sabana · San José, Costa Rica · November 1–8, 2026",
      dipPie: "According to the final standings published on chess-results",
      dipListo: "Done: the certificate was saved to your device.",
      dipCompartir: (n) => n + "'s certificate at the " + NOMBRE_CORTO + ":",
      pdfTitulo: (pais, r) => pais + (r ? " · Round " + r : " · Starting list"),
      pdfSub: "21st Central American and Caribbean Youth Festival · Costa Rica 2026 · Delegation sheet",
      pdfResumen: (n, r) => (n === 1 ? "1 player" : n + " players") + (r ? " · pairings of round " + r : " · the pairings of round 1 are not published yet"),
      pdfColPts: "Pts.", pdfColMesa: "Board", pdfColColor: "Color", pdfColRival: "Opponent", pdfColRes: "Res.",
      pdfNoAparece: "not in the pairings",
      pdfNota: (leido) => (leido ? leido + " " : "") + "The official pairings and results are the ones the arbiter publishes on chess-results.",
      pdfPie: "Ajedrez Integral · ajedrez-integral.com/centroamericano-2026.html",
      pdfPagina: (n, total) => "Page " + n + " of " + total,
      pdfLista: "Done: the sheet was saved to your device.",
      pdfError: "We couldn't make the sheet. Please try again.",
      locale: "en-US",
    },
  };
  const T = () => TEXTOS[V.idioma()];
  const decir = (nodo, s) => { nodo.textContent = String(s).replace(/\.\./g, "."); };
  const nombreCompleto = (j) => (j.titulo ? j.titulo + " " : "") + j.nombre;

  const anunciar = V.anunciar;

  // `iFila` es la columna que nombra la fila (el jugador, el país): va en <th scope="row">.
  function tabla(cabeceras, filas, numericas, iFila) {
    const envoltura = el("div", "cac-tabla-envoltura");
    const t = el("table", "cac-tabla");
    const thead = el("thead"), tr = el("tr");
    cabeceras.forEach((c, i) => { const th = el("th", numericas.includes(i) ? "num" : "", c); th.scope = "col"; tr.appendChild(th); });
    thead.appendChild(tr);
    const tbody = el("tbody");
    filas.forEach((f) => {
      const fila = el("tr");
      f.forEach((c, i) => {
        const celda = el(i === iFila ? "th" : "td", numericas.includes(i) ? "num" : "", c);
        if (i === iFila) celda.scope = "row";
        fila.appendChild(celda);
      });
      tbody.appendChild(fila);
    });
    t.append(thead, tbody);
    envoltura.appendChild(t);
    return envoltura;
  }

  const rondaActual = () => Math.max(0, ...((V.datos() || { torneos: [] }).torneos.map((t) => t.ronda || 0)));
  const terminado = () => { const d = V.datos(); return !!(d && d.torneos.length && d.torneos.every((t) => t.terminado)); };
  const comoVa = (r) => (terminado() ? T().final(r) : T().despues(r));

  /* ---------------- la clasificación completa ---------------- */
  let categoriaElegida = "";
  function pintarClasificacion() {
    const caja = $("clasificacion-contenido"), sel = $("clasificacion-categoria"), q = $("clasificacion-buscar");
    if (!caja) return;
    const tx = T();
    if (!V.datos()) { caja.replaceChildren(el("p", "", tx.cargando)); return; }
    const todos = V.jugadores();
    const grupos = [...new Set(todos.map((x) => x.j.grupo || "—"))].sort((a, b) => V.ordenGrupo(a) - V.ordenGrupo(b) || a.localeCompare(b));
    const firma = V.idioma() + ":" + grupos.join(",");
    if (sel.dataset.firma !== firma) {
      sel.dataset.firma = firma;
      sel.replaceChildren(...grupos.map((g) => { const o = el("option", "", V.categoria(g)); o.value = g; return o; }));
      // Con una sola categoría (un torneo sin grupos) no hay nada que elegir.
      const etiqueta = sel.closest("label");
      if (etiqueta) etiqueta.hidden = grupos.length < 2;
    }
    if (!grupos.includes(categoriaElegida)) categoriaElegida = grupos[0] || "";
    sel.value = categoriaElegida;
    const lista = todos.filter((x) => (x.j.grupo || "—") === categoriaElegida).sort((a, b) => a.j.puesto - b.j.puesto);
    const ronda = rondaActual();
    const palabras = V.plano(q.value).split(" ").filter(Boolean);
    const filas = [];
    lista.forEach((x, i) => {
      if (palabras.length && !palabras.every((p) => V.plano(x.j.nombre).includes(p))) return;
      const rend = ronda ? V.rendimiento(x) : null;
      filas.push([String(ronda ? i + 1 : "—"), nombreCompleto(x.j), x.j.fed || "", x.j.elo ? String(x.j.elo) : "—", ronda ? x.j.puntos || "0" : "—", rend ? String(rend.rp) : "—"]);
    });
    const estado = el("p", "font-semibold");
    decir(estado, (ronda ? comoVa(ronda) : tx.antes) + V.cuandoSeLeyo());
    caja.replaceChildren(estado);
    if (!filas.length) { caja.appendChild(el("p", "mt-3", tx.nadie)); return; }
    caja.appendChild(tabla([tx.colPuesto, tx.colJugador, tx.colFed, tx.colElo, tx.colPuntos, tx.colRend], filas, [0, 3, 4, 5], 1));
  }

  /* ---------------- la tabla por país ---------------- */
  function pintarDelegaciones() {
    const caja = $("delegaciones-contenido");
    if (!caja) return;
    const tx = T();
    if (!V.datos()) { caja.replaceChildren(el("p", "", tx.cargando)); return; }
    const porFed = {};
    let rondas = 0;
    V.jugadores().forEach((x) => {
      const f = x.j.fed || "—";
      const d = porFed[f] || (porFed[f] = { f, jugadores: 0, puntos: 0, de: 0, porRonda: [] });
      d.jugadores++;
      V.rondasDe(x).forEach((o) => {
        if (o.puntos === null) return;
        d.puntos += o.puntos; d.de += 1;
        d.porRonda[o.ronda - 1] = (d.porRonda[o.ronda - 1] || 0) + o.puntos;
        rondas = Math.max(rondas, o.ronda);
      });
    });
    const lista = Object.values(porFed);
    caja.replaceChildren();
    if (!rondas) {
      caja.appendChild(el("p", "font-semibold", tx.sinResultados));
      lista.sort((a, b) => b.jugadores - a.jugadores || V.pais(a.f).localeCompare(V.pais(b.f), tx.locale));
      caja.appendChild(tabla([tx.colPais, tx.colJugadores], lista.map((d) => [V.pais(d.f), String(d.jugadores)]), [1], 0));
      return;
    }
    const estado = el("p", "font-semibold");
    decir(estado, comoVa(rondaActual() || rondas) + V.cuandoSeLeyo());
    caja.appendChild(estado);
    lista.sort((a, b) => (b.de ? b.puntos / b.de : 0) - (a.de ? a.puntos / a.de : 0) || b.puntos - a.puntos || a.f.localeCompare(b.f));
    const cab = ["#", tx.colPais, tx.colJugadores, tx.colPuntos, tx.colDe, tx.colPorc];
    for (let r = 1; r <= rondas; r++) cab.push(tx.colRonda(r));
    const filas = lista.map((d, i) => {
      const f = [String(i + 1), V.pais(d.f), String(d.jugadores), V.fmtPuntos(d.puntos), String(d.de), d.de ? Math.round((100 * d.puntos) / d.de) + " %" : "—"];
      for (let r = 0; r < rondas; r++) f.push(d.porRonda[r] === undefined ? "—" : V.fmtPuntos(d.porRonda[r]));
      return f;
    });
    caja.appendChild(tabla(cab, filas, cab.map((_, i) => i).filter((i) => i !== 1), 1));
    caja.appendChild(el("p", "mt-3 text-sm text-brand-600 dark:text-brand-300", tx.notaPaises));
  }

  /* ---------------- sorpresas e invictos ---------------- */
  // Una partida es sorpresa cuando el de menos Elo puntúa contra el de más (los
  // dos con Elo, jugada en el tablero). Las tablas cuentan la mitad.
  function sorpresas() {
    const lista = [];
    V.jugadores().forEach((x) => {
      if (!x.j.elo) return;
      V.rondasDe(x).forEach((o) => {
        if (o.bye || o.incomparecencia || !o.puntos || !o.rival || !o.rival.elo || o.rival.elo <= x.j.elo) return;
        const dif = o.rival.elo - x.j.elo;
        lista.push({ x, o, dif, peso: dif * o.puntos });
      });
    });
    return lista.sort((a, b) => b.peso - a.peso || b.dif - a.dif);
  }
  function invictos() {
    const porGrupo = {};
    V.jugadores().forEach((x) => {
      const jugadas = V.rondasDe(x).filter((o) => !o.bye && o.puntos !== null);
      if (!jugadas.length || jugadas.some((o) => o.puntos === 0)) return;
      (porGrupo[x.j.grupo || "—"] = porGrupo[x.j.grupo || "—"] || []).push(x);
    });
    return porGrupo;
  }
  function lineaSorpresa(s, tx) {
    const yo = nombreCompleto(s.x.j) + " (" + [s.x.j.fed, s.x.j.elo].filter(Boolean).join(", ") + ")";
    const rival = nombreCompleto(s.o.rival) + " (" + [s.o.rival.fed, s.o.rival.elo].filter(Boolean).join(", ") + ")";
    return tx.sorpresa(s.o.ronda, V.categoria(s.x.j.grupo), yo, s.o.puntos === 1, rival, s.dif);
  }
  function pintarSorpresas() {
    const caja = $("sorpresas-contenido");
    if (!caja) return;
    const tx = T();
    if (!V.datos()) { caja.replaceChildren(el("p", "", tx.cargando)); return; }
    const todas = sorpresas();
    caja.replaceChildren();
    const ronda = Math.max(0, ...V.jugadores().flatMap((x) => V.rondasDe(x).filter((o) => o.puntos !== null).map((o) => o.ronda)));
    if (!ronda) { caja.appendChild(el("p", "font-semibold", tx.sinSorpresas)); return; }
    const seccion = (titulo, items, vacio) => {
      caja.appendChild(el("h3", "mt-4 font-bold text-lg", titulo));
      if (!items.length) { caja.appendChild(el("p", "mt-1", vacio)); return; }
      const ol = el("ol", "cac-sorpresas mt-2");
      items.forEach((s) => ol.appendChild(el("li", "", lineaSorpresa(s, tx))));
      caja.appendChild(ol);
    };
    seccion(tx.sorpresasRonda(ronda), todas.filter((s) => s.o.ronda === ronda).slice(0, 8), tx.ningunaSorpresa);
    seccion(tx.sorpresasTorneo, todas.slice(0, 8), tx.ningunaSorpresa);
    const inv = invictos();
    caja.appendChild(el("h3", "mt-6 font-bold text-lg", tx.invictos));
    const grupos = Object.keys(inv).sort((a, b) => V.ordenGrupo(a) - V.ordenGrupo(b) || a.localeCompare(b));
    if (!grupos.length) { caja.appendChild(el("p", "mt-1", tx.nadieInvicto)); return; }
    const rejilla = el("div", "cac-podios mt-2");
    grupos.forEach((g) => {
      const c = el("section", "cac-podio");
      c.appendChild(el("h4", "font-bold", V.categoria(g)));
      const ul = el("ul", "mt-1 text-sm");
      inv[g].sort((a, b) => a.j.puesto - b.j.puesto).forEach((x) => ul.appendChild(el("li", "", nombreCompleto(x.j) + (x.j.fed ? " (" + x.j.fed + ")" : "") + " · " + tx.puntosCortos(x.j.puntos || "0"))));
      c.appendChild(ul);
      rejilla.appendChild(c);
    });
    caja.appendChild(rejilla);
  }

  /* ---------------- el pareo para proyectar ---------------- */
  // Tres modos: el pareo y la clasificación de cada categoría seguidos (el de
  // siempre), solo el pareo o solo la clasificación. Con el torneo terminado,
  // empieza por los podios. Lo elegido queda en este aparato (la pantalla de la sala).
  const CLAVE_MODO = "cac_proyector_modo_v1";
  const FILAS_CLASIF = 12;
  let modo = (() => { try { const m = localStorage.getItem(CLAVE_MODO); return ["todo", "pareo", "clasif"].includes(m) ? m : "todo"; } catch (e) { return "todo"; } })();
  let paginas = [], pagina = 0, pausado = false, reloj = null, refresco = null, segundos = 0;

  function armarPaginas() {
    const salida = [];
    const datos = V.datos();
    if (!datos) return salida;
    const todos = V.jugadores();
    const ronda = rondaActual();
    const porGrupoJug = {};
    todos.forEach((x) => { (porGrupoJug[x.j.grupo || "—"] = porGrupoJug[x.j.grupo || "—"] || []).push(x); });
    const orden = (a, b) => V.ordenGrupo(a) - V.ordenGrupo(b) || a.localeCompare(b);
    // Terminado: la clasificación ya es la de la última ronda.
    if (datos.torneos.some((t) => t.rondas && t.ronda >= t.rondas)) {
      const grupos = Object.keys(porGrupoJug).sort(orden);
      const de = Math.ceil(grupos.length / 3);
      for (let i = 0; i < de; i++) salida.push({ tipo: "podios", grupos: grupos.slice(i * 3, i * 3 + 3), porGrupo: porGrupoJug, pag: i + 1, de });
    }
    const pareoDe = {};
    datos.torneos.forEach((tor) => {
      const pareo = tor.pareo;
      if (!pareo || !pareo.ronda || !Array.isArray(pareo.mesas) || !pareo.mesas.length) return;
      const porNo = new Map((tor.jugadores || []).map((j) => [j.no, j]));
      pareo.mesas.slice().sort((a, b) => a.mesa - b.mesa).forEach((m) => {
        const g = (porNo.get(m.blancas.no) || {}).grupo || "—";
        (pareoDe[g] = pareoDe[g] || { ronda: pareo.ronda, porNo, mesas: [] }).mesas.push(m);
      });
    });
    const grupos = [...new Set(Object.keys(pareoDe).concat(ronda ? Object.keys(porGrupoJug) : []))].sort(orden);
    grupos.forEach((g) => {
      const p = pareoDe[g];
      if (p && modo !== "clasif") {
        const de = Math.ceil(p.mesas.length / MESAS_POR_PAGINA);
        for (let i = 0; i < de; i++) salida.push({ tipo: "pareo", ronda: p.ronda, grupo: g, pag: i + 1, de, mesas: p.mesas.slice(i * MESAS_POR_PAGINA, (i + 1) * MESAS_POR_PAGINA), porNo: p.porNo });
      }
      if (ronda && porGrupoJug[g] && modo !== "pareo") {
        const lista = porGrupoJug[g].slice().sort((a, b) => a.j.puesto - b.j.puesto);
        const de = Math.ceil(lista.length / FILAS_CLASIF);
        for (let i = 0; i < de; i++) salida.push({ tipo: "clasif", ronda, grupo: g, pag: i + 1, de, desde: i * FILAS_CLASIF, filas: lista.slice(i * FILAS_CLASIF, (i + 1) * FILAS_CLASIF) });
      }
    });
    return salida;
  }

  function tablaProyector(cabeceras, filas, clases) {
    const t = el("table", "cac-proyector-tabla");
    const cab = el("tr");
    cabeceras.forEach((c) => { const th = el("th", "", c); th.scope = "col"; cab.appendChild(th); });
    const thead = el("thead"); thead.appendChild(cab);
    const tbody = el("tbody");
    filas.forEach((f) => { const tr = el("tr"); f.forEach((c, i) => tr.appendChild(el("td", clases[i] || "", c))); tbody.appendChild(tr); });
    t.append(thead, tbody);
    return t;
  }

  function pintarProyector() {
    const caja = $("proyector-contenido"), titulo = $("proyector-titulo");
    if (!caja) return;
    const tx = T();
    $("proyector-pausa").textContent = pausado ? tx.seguir : tx.pausa;
    $("proyector-pausa").setAttribute("aria-pressed", pausado ? "true" : "false");
    const sel = $("proyector-modo");
    if (sel && sel.dataset.idioma !== V.idioma()) {
      sel.dataset.idioma = V.idioma();
      sel.replaceChildren(...[["todo", tx.modoTodo], ["pareo", tx.modoPareo], ["clasif", tx.modoClasif]].map(([v, t]) => { const o = el("option", "", t); o.value = v; return o; }));
    }
    if (sel) sel.value = modo;
    const prog = V.progresoRonda(), linea = $("proyector-progreso");
    linea.hidden = !prog;
    if (prog) linea.textContent = prog.hechas === prog.total ? V.textos().rondaTerminada(prog.ronda) : V.textos().progreso(prog.ronda, prog.hechas, prog.total);
    if (!paginas.length) {
      titulo.textContent = NOMBRE_CORTO;
      caja.replaceChildren(el("p", "cac-proyector-vacio", V.datos() ? tx.proySinPareo : tx.cargando));
      return;
    }
    if (pagina >= paginas.length) pagina = 0;
    const p = paginas[pagina];
    const conFed = (j, n) => nombreCompleto(n || j) + (j && j.fed ? " (" + j.fed + ")" : "");
    if (p.tipo === "pareo") {
      titulo.textContent = tx.proyTitulo(p.ronda, V.categoria(p.grupo), p.pag, p.de);
      const quien = (n) => (n ? conFed(p.porNo.get(n.no), n) : "");
      caja.replaceChildren(tablaProyector([tx.proyMesa, tx.proyBlancas, tx.proyResultado, tx.proyNegras], p.mesas.map((m) => [
        String(m.mesa), quien(m.blancas), m.negras ? (/\d|½|\+/.test(m.resultado || "") ? m.resultado : "–") : "", m.negras ? quien(m.negras) : tx.proyBye]), ["mesa", "", "res", ""]));
    } else if (p.tipo === "clasif") {
      titulo.textContent = tx.proyClasif(p.ronda, V.categoria(p.grupo), p.pag, p.de);
      caja.replaceChildren(tablaProyector([tx.colPuesto, tx.colJugador, tx.colPuntos, tx.colRend], p.filas.map((x, i) => {
        const r = V.rendimiento(x);
        return [String(p.desde + i + 1), conFed(x.j), x.j.puntos || "0", r ? String(r.rp) : "—"];
      }), ["mesa", "", "res", "res"]));
    } else {
      titulo.textContent = tx.proyPodios + (p.de > 1 ? " · " + p.pag + "/" + p.de : "");
      const rejilla = el("div", "cac-proyector-podios");
      p.grupos.forEach((g) => {
        const c = el("section", "");
        c.appendChild(el("h3", "", V.categoria(g)));
        const ol = el("ol", "");
        p.porGrupo[g].slice().sort((a, b) => a.j.puesto - b.j.puesto).slice(0, 3).forEach((x, i) => {
          const li = el("li", "");
          const m = el("span", "", ["🥇", "🥈", "🥉"][i] + " ");
          m.setAttribute("aria-hidden", "true");
          li.append(m, document.createTextNode((i + 1) + ". " + conFed(x.j) + " · " + tx.puntosCortos(x.j.puntos || "0")));
          ol.appendChild(li);
        });
        c.appendChild(ol);
        rejilla.appendChild(c);
      });
      caja.replaceChildren(rejilla);
    }
  }

  function ponerReloj() {
    const r = $("proyector-reloj");
    if (r) r.textContent = new Date().toLocaleTimeString(T().locale, { hour: "numeric", minute: "2-digit", timeZone: V.ZONA });
  }

  function avanzar(paso) {
    segundos = 0;
    if (!paginas.length) return;
    pagina = (pagina + paso + paginas.length) % paginas.length;
    pintarProyector();
  }

  function abrirProyector() {
    paginas = armarPaginas();
    pintarProyector();
    ponerReloj();
    const qr = $("proyector-qr");
    if (qr && !qr.firstChild && window.QrSvg) {
      const svg = window.QrSvg.dibujar("https://" + URL_PAGINA, "QR");
      if (svg) qr.appendChild(svg);
    }
    clearInterval(reloj);
    segundos = 0;
    reloj = setInterval(() => {
      ponerReloj();
      if (pausado) return;
      if (++segundos >= SEGUNDOS_PROYECTOR) { segundos = 0; avanzar(1); }
    }, 1000);
    clearInterval(refresco);
    const traer = () => V.pedir().then(() => { paginas = armarPaginas(); pintarProyector(); }, () => pintarProyector());
    traer();
    refresco = setInterval(traer, 60000);
  }
  function cerrarProyector() {
    clearInterval(reloj); clearInterval(refresco);
    reloj = refresco = null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  /* ---------------- la imagen para compartir ---------------- */
  function cargarImagen(src) {
    return new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  }
  function renglones(ctx, texto, ancho, max) {
    const salida = [];
    let linea = "";
    for (const p of String(texto).split(/\s+/).filter(Boolean)) {
      const prueba = linea ? linea + " " + p : p;
      if (ctx.measureText(prueba).width <= ancho || !linea) linea = prueba;
      else { salida.push(linea); linea = p; }
    }
    if (linea) salida.push(linea);
    if (salida.length > max) { salida.length = max; salida[max - 1] = salida[max - 1].replace(/\s*\S*$/, "") + "…"; }
    return salida;
  }

  // 1080 × 1080, como un estado de WhatsApp cuadrado. Colores medidos sobre su
  // fondo real (WCAG AA): blanco sobre #40478F 8,35; #1E2453 sobre blanco 14,7 y
  // sobre #F4F4FB 13,4; #40478F sobre blanco 8,35; #1F2937 sobre blanco 14,7.
  async function imagenJugador(x) {
    const tx = T();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const letra = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
    const c = document.createElement("canvas");
    c.width = 1080; c.height = 1080;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 1080, 1080);
    // La banda de arriba, con el pizote (o el logo de la página).
    ctx.fillStyle = CARA.banda; ctx.fillRect(0, 0, 1080, 250);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 66px " + letra; ctx.textBaseline = "alphabetic";
    ctx.fillText(NOMBRE_CORTO, 60, 120);
    ctx.font = "500 28px " + letra;
    renglones(ctx, CONFIG.imgSub || tx.imgSub, CARA.redondo ? 760 : 600, 2).forEach((l, i) => ctx.fillText(l, 60, 172 + i * 36));
    const dibujo = await cargarImagen(CARA.dibujo);
    if (dibujo && CARA.redondo) {
      ctx.save(); ctx.beginPath(); ctx.arc(950, 125, 95, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
      const lado = Math.min(dibujo.width, dibujo.height);
      ctx.drawImage(dibujo, (dibujo.width - lado) / 2, (dibujo.height - lado) / 2, lado, lado, 855, 30, 190, 190);
      ctx.restore();
      ctx.lineWidth = 6; ctx.strokeStyle = "#ffffff"; ctx.beginPath(); ctx.arc(950, 125, 95, 0, Math.PI * 2); ctx.stroke();
    } else if (dibujo) {
      // Un logo, a la derecha de la banda y sin recortar: hasta 330 de ancho
      // y 190 de alto (el de la UTN es casi cuadrado).
      const ancho = Math.round(Math.min(330, (190 * dibujo.width) / dibujo.height)), alto = Math.round((ancho * dibujo.height) / dibujo.width);
      ctx.drawImage(dibujo, 1080 - 60 - ancho, Math.round((250 - alto) / 2), ancho, alto);
    }
    // El nombre y su categoría.
    ctx.fillStyle = CARA.tinta; ctx.font = "800 72px " + letra;
    let y = 360;
    renglones(ctx, nombreCompleto(x.j), 960, 2).forEach((l) => { ctx.fillText(l, 60, y); y += 84; });
    ctx.fillStyle = CARA.acento; ctx.font = "700 40px " + letra;
    ctx.fillText([V.categoria(x.j.grupo), x.j.fed, x.j.elo ? "Elo " + x.j.elo : ""].filter(Boolean).join(" · "), 60, y + 10);
    y += 60;
    // El recuadro de cómo va (un poco más bajo si abajo va su puesto ronda a ronda).
    const puestos = V.puestosDe(x);
    const bajo = puestos.length > 0;
    ctx.fillStyle = CARA.suave;
    const r = 36, cx = 60, cy = y, cw = 960, ch = bajo ? 200 : 220;
    ctx.beginPath(); ctx.moveTo(cx + r, cy); ctx.arcTo(cx + cw, cy, cx + cw, cy + ch, r); ctx.arcTo(cx + cw, cy + ch, cx, cy + ch, r);
    ctx.arcTo(cx, cy + ch, cx, cy, r); ctx.arcTo(cx, cy, cx + cw, cy, r); ctx.closePath(); ctx.fill();
    ctx.fillStyle = CARA.acento; ctx.fillRect(cx, cy + 30, 12, ch - 60);
    ctx.fillStyle = CARA.tinta;
    const ronda = x.torneo.ronda || 0;
    ctx.font = "800 84px " + letra;
    ctx.fillText(ronda && x.j._puestoGrupo ? tx.imgPuesto(x.j._puestoGrupo, x.j._deGrupo) : tx.imgInicial(x.j.no), cx + 50, cy + (bajo ? 100 : 110));
    ctx.font = "600 42px " + letra;
    ctx.fillText(ronda ? (x.torneo.terminado ? tx.imgFinal(x.j.puntos || "0", ronda) : tx.imgPuntos(x.j.puntos || "0", ronda)) : tx.imgAntes, cx + 50, cy + (bajo ? 165 : 180));
    y = cy + ch + (bajo ? 56 : 62);
    // La última ronda (o la de hoy, si todavía no tiene resultado) y, abajo, su
    // puesto después de cada ronda. Todo cabe antes de la dirección (y = 1010).
    const rondas = V.rondasDe(x);
    const ultima = rondas[rondas.length - 1];
    if (ultima) {
      const q = V.queHizo(ultima, V.textos());
      ctx.fillStyle = "#1f2937";
      // Con la línea del puesto debajo, la ronda va un poco más chica.
      const paso = puestos.length ? 46 : 50;
      ctx.font = "500 " + (puestos.length ? 36 : 38) + "px " + letra;
      renglones(ctx, tx.imgRonda(ultima.ronda, q.que, q.rival), 960, puestos.length ? (y + 2 * paso <= 940 ? 2 : 1) : 3).forEach((l) => { ctx.fillText(l, 60, y); y += paso; });
    }
    if (puestos.length && y <= 940) {
      ctx.fillStyle = CARA.acento; ctx.font = "600 32px " + letra;
      const texto = tx.imgPuestos(puestos.map((p) => V.puestoTexto(p)).join(" → "));
      renglones(ctx, texto, 960, y <= 890 ? 2 : 1).forEach((l) => { ctx.fillText(l, 60, y + 4); y += 42; });
    }
    // Abajo: la dirección y las franjas (la bandera, en el Centroamericano).
    ctx.fillStyle = CARA.acento; ctx.font = "700 32px " + letra;
    ctx.fillText(URL_PAGINA, 60, 1010);
    CARA.franjas.forEach(([color, yy], i, arr) => {
      ctx.fillStyle = color; ctx.fillRect(0, yy, 1080, (arr[i + 1] ? arr[i + 1][1] : 1080) - yy);
    });
    if (window.TablaImagen && window.TablaImagen.marcar) await window.TablaImagen.marcar(c);
    return new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error("sin imagen"))), "image/png"));
  }

  // Lo manda con el menú de compartir del celular o, si no hay, lo baja.
  async function compartirBlob(blob, nombre, texto) {
    const archivo = new File([blob], nombre, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try { await navigator.share({ files: [archivo], text: texto }); } catch (e) { if (e && e.name !== "AbortError") throw e; }
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    anunciar(T().imagenLista);
  }

  // El resumen de la ronda de una delegación, para un estado o las redes: 1080
  // de ancho y el alto que pidan sus jugadores (hasta 14, y «y N más»). Mismos
  // colores medidos que la imagen de un jugador.
  async function imagenResumen(d) {
    const tx = T();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const letra = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
    const MAX = 14;
    const lineas = d.lineas.slice(0, MAX);
    const alto = Math.max(1080, 560 + lineas.length * 54 + (d.lineas.length > MAX ? 54 : 0) + 140);
    const c = document.createElement("canvas");
    c.width = 1080; c.height = alto;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 1080, alto);
    ctx.fillStyle = "#40478f"; ctx.fillRect(0, 0, 1080, 230);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 64px " + letra;
    ctx.fillText(renglones(ctx, d.pais, 760, 1)[0], 60, 115);
    ctx.font = "600 34px " + letra;
    ctx.fillText(tx.imgResumenSub, 60, 175);
    const mascota = await cargarImagen("img/centroamericano-2026/mascota.jpg");
    if (mascota) {
      ctx.save(); ctx.beginPath(); ctx.arc(950, 115, 90, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
      const lado = Math.min(mascota.width, mascota.height);
      ctx.drawImage(mascota, (mascota.width - lado) / 2, (mascota.height - lado) / 2, lado, lado, 860, 25, 180, 180);
      ctx.restore();
      ctx.lineWidth = 6; ctx.strokeStyle = "#ffffff"; ctx.beginPath(); ctx.arc(950, 115, 90, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = "#1e2453"; ctx.font = "800 52px " + letra;
    let y = 320;
    renglones(ctx, d.resumen, 960, 2).forEach((l) => { ctx.fillText(l, 60, y); y += 62; });
    ctx.fillStyle = "#40478f"; ctx.font = "700 38px " + letra;
    ctx.fillText(d.puntos, 60, y + 4);
    y += 80;
    ctx.fillStyle = "#1f2937"; ctx.font = "500 32px " + letra;
    lineas.forEach((l) => { ctx.fillText(renglones(ctx, l, 960, 1)[0], 60, y); y += 54; });
    if (d.lineas.length > MAX) { ctx.fillText(tx.imgMas(d.lineas.length - MAX), 60, y); y += 54; }
    ctx.fillStyle = "#40478f"; ctx.font = "700 32px " + letra;
    ctx.fillText(URL_PAGINA, 60, alto - 70);
    [["#1e4c8a", alto - 40], ["#ffffff", alto - 30], ["#ce1328", alto - 22], ["#ffffff", alto - 14], ["#1e4c8a", alto - 8]].forEach(([color, yy], i, arr) => {
      ctx.fillStyle = color; ctx.fillRect(0, yy, 1080, (arr[i + 1] ? arr[i + 1][1] : alto) - yy);
    });
    if (window.TablaImagen && window.TablaImagen.marcar) await window.TablaImagen.marcar(c);
    return new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error("sin imagen"))), "image/png"));
  }

  async function compartirResumen(d, boton) {
    if (boton) boton.disabled = true;
    try {
      const blob = await imagenResumen(d);
      await compartirBlob(blob, "centroamericano-2026-" + V.plano(d.pais).replace(/ /g, "-") + "-ronda-" + d.ronda + ".png", d.pais + " · " + d.resumen + " https://" + URL_PAGINA);
    } catch (e) {
      anunciar(T().imagenError);
    } finally {
      if (boton) boton.disabled = false;
    }
  }

  async function compartirJugador(x, boton) {
    const tx = T();
    if (boton) boton.disabled = true;
    try {
      const blob = await imagenJugador(x);
      const nombre = CARA.archivo + "-" + V.plano(x.j.nombre).replace(/ /g, "-") + ".png";
      await compartirBlob(blob, nombre, (CONFIG.compartirTexto ? CONFIG.compartirTexto(x.j.nombre) : tx.compartirTexto(x.j.nombre)) + " https://" + URL_PAGINA);
    } catch (e) {
      anunciar(tx.imagenError);
    } finally {
      if (boton) boton.disabled = false;
    }
  }

  /* ---------------- «Así terminó el día» ---------------- */
  // Las rondas del calendario de la página con su día (hora de Costa Rica):
  // <tr data-ronda="N" data-inicio="AAAA-MM-DDTHH:MM">. Una sola copia de las horas.
  function rondasDelCalendario() {
    return [...document.querySelectorAll("#calendario tr[data-ronda][data-inicio]")]
      .map((tr) => ({ ronda: Number(tr.dataset.ronda), dia: tr.dataset.inicio.slice(0, 10) }));
  }
  // La última ronda con todas sus partidas terminadas.
  function rondaCerrada() {
    const p = V.progresoRonda();
    if (!p) return 0;
    return p.hechas === p.total ? p.ronda : p.ronda - 1;
  }
  // Lo del día de la última ronda cerrada: sus rondas, los líderes de cada
  // categoría después de ella, la sorpresa más grande y cómo le fue a la
  // delegación elegida en este aparato.
  function resumenDelDia() {
    const R = rondaCerrada();
    if (R < 1) return null;
    const tx = T();
    const cal = rondasDelCalendario();
    const dia = (cal.find((c) => c.ronda === R) || {}).dia;
    const rondas = dia ? cal.filter((c) => c.dia === dia && c.ronda <= R).map((c) => c.ronda).sort((a, b) => a - b) : [R];
    const termino = !dia || !cal.some((c) => c.dia === dia && c.ronda > R);
    const porGrupo = {};
    V.jugadores().forEach((x) => { (porGrupo[x.j.grupo || "—"] = porGrupo[x.j.grupo || "—"] || []).push(x); });
    const lideres = Object.keys(porGrupo).sort((a, b) => V.ordenGrupo(a) - V.ordenGrupo(b) || a.localeCompare(b)).map((g) => {
      const lista = porGrupo[g];
      const pts = V.puntosTras(lista.map((x) => x.j), R);
      const max = Math.max(...pts);
      const arriba = lista.filter((x, i) => pts[i] === max).sort((a, b) => a.j.puesto - b.j.puesto);
      return tx.diaLider(V.categoria(g), nombreCompleto(arriba[0].j) + (arriba[0].j.fed ? " (" + arriba[0].j.fed + ")" : ""), tx.puntosCortos(V.fmtPuntos(max)), arriba.length - 1);
    });
    const s = sorpresas().find((y) => rondas.includes(y.o.ronda));
    let delegacion = "";
    const fed = V.delegacionGuardada();
    if (fed) {
      let pts = 0, de = 0, g = 0, e = 0, p = 0;
      V.jugadores().filter((x) => x.j.fed === fed).forEach((x) => V.rondasDe(x).forEach((o) => {
        if (!rondas.includes(o.ronda) || o.puntos === null) return;
        de++; pts += o.puntos;
        if (!o.bye) { if (o.puntos === 1) g++; else if (o.puntos === 0.5) e++; else p++; }
      }));
      if (de) delegacion = tx.diaDeleg(V.pais(fed), V.fmtPuntos(pts), de, g, e, p);
    }
    const fecha = dia ? new Date(dia + "T12:00:00-06:00").toLocaleDateString(tx.locale, { weekday: "long", day: "numeric", month: "long", timeZone: V.ZONA }) : "";
    return {
      titulo: termino ? tx.diaTermino : tx.diaVa,
      fecha: fecha ? tx.diaFecha(fecha, rondas) : "",
      lideres, sorpresa: s ? lineaSorpresa(s, tx) : "", delegacion, dia: dia || "ronda-" + R,
    };
  }

  // 1080 de ancho y el alto que pidan las categorías. Los mismos colores
  // medidos que las otras imágenes, y la marca de agua.
  async function imagenDia(d) {
    const tx = T();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const letra = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
    const medir = document.createElement("canvas").getContext("2d");
    medir.font = "500 32px " + letra;
    // Cada líder en hasta dos renglones: sus puntos no se cortan nunca.
    const lideres = d.lideres.map((l) => renglones(medir, l, 930, 2));
    const renglonesLideres = lideres.reduce((a, l) => a + l.length, 0);
    medir.font = "500 34px " + letra;
    const sorpresa = d.sorpresa ? renglones(medir, d.sorpresa, 960, 3) : [tx.diaSinSorpresa];
    const deleg = d.delegacion ? renglones(medir, d.delegacion, 960, 2) : [];
    const alto = Math.max(1080, 400 + 70 + renglonesLideres * 42 + lideres.length * 8 + 90 + sorpresa.length * 46 + (deleg.length ? 30 + deleg.length * 46 : 0) + 160);
    const c = document.createElement("canvas");
    c.width = 1080; c.height = alto;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 1080, alto);
    ctx.fillStyle = "#40478f"; ctx.fillRect(0, 0, 1080, 230);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 64px " + letra;
    ctx.fillText(d.titulo, 60, 115);
    ctx.font = "600 34px " + letra;
    ctx.fillText(tx.imgResumenSub, 60, 175);
    const mascota = await cargarImagen("img/centroamericano-2026/mascota.jpg");
    if (mascota) {
      ctx.save(); ctx.beginPath(); ctx.arc(950, 115, 90, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
      const lado = Math.min(mascota.width, mascota.height);
      ctx.drawImage(mascota, (mascota.width - lado) / 2, (mascota.height - lado) / 2, lado, lado, 860, 25, 180, 180);
      ctx.restore();
      ctx.lineWidth = 6; ctx.strokeStyle = "#ffffff"; ctx.beginPath(); ctx.arc(950, 115, 90, 0, Math.PI * 2); ctx.stroke();
    }
    let y = 310;
    if (d.fecha) { ctx.fillStyle = "#40478f"; ctx.font = "700 40px " + letra; ctx.fillText(renglones(ctx, d.fecha, 960, 1)[0], 60, y); }
    y += 90;
    ctx.fillStyle = "#1e2453"; ctx.font = "800 44px " + letra;
    ctx.fillText(tx.diaLideres, 60, y);
    y += 62;
    ctx.fillStyle = "#1f2937"; ctx.font = "500 32px " + letra;
    lideres.forEach((renglon) => {
      renglon.forEach((l, i) => { ctx.fillText(l, i ? 90 : 60, y); y += 42; });
      y += 8;
    });
    y += 40;
    ctx.fillStyle = "#1e2453"; ctx.font = "800 44px " + letra;
    ctx.fillText(tx.diaSorpresa, 60, y);
    y += 58;
    ctx.fillStyle = "#1f2937"; ctx.font = "500 34px " + letra;
    sorpresa.forEach((l) => { ctx.fillText(l, 60, y); y += 46; });
    if (deleg.length) {
      y += 30;
      ctx.fillStyle = "#40478f"; ctx.font = "700 34px " + letra;
      deleg.forEach((l) => { ctx.fillText(l, 60, y); y += 46; });
    }
    ctx.fillStyle = "#40478f"; ctx.font = "700 32px " + letra;
    ctx.fillText(URL_PAGINA, 60, alto - 70);
    [["#1e4c8a", alto - 40], ["#ffffff", alto - 30], ["#ce1328", alto - 22], ["#ffffff", alto - 14], ["#1e4c8a", alto - 8]].forEach(([color, yy], i, arr) => {
      ctx.fillStyle = color; ctx.fillRect(0, yy, 1080, (arr[i + 1] ? arr[i + 1][1] : alto) - yy);
    });
    if (window.TablaImagen && window.TablaImagen.marcar) await window.TablaImagen.marcar(c);
    return new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error("sin imagen"))), "image/png"));
  }

  async function compartirDia(boton) {
    const estado = $("imagen-dia-estado");
    if (boton) boton.disabled = true;
    if (estado) estado.textContent = "";
    try {
      await V.pedir();
      const d = resumenDelDia();
      if (!d) { if (estado) estado.textContent = T().diaAntes; return; }
      const blob = await imagenDia(d);
      await compartirBlob(blob, "centroamericano-2026-" + d.dia + ".png", T().diaTexto(d.titulo) + " https://" + URL_PAGINA);
    } catch (e) {
      if (estado) estado.textContent = V.datos() ? T().imagenError : T().error;
    } finally {
      if (boton) boton.disabled = false;
    }
  }

  /* ---------------- cara a cara ---------------- */
  // Dos jugadores lado a lado: sus datos, su partida si se enfrentaron y cada
  // ronda con lo que hizo y su puesto después (por puntos, como en «Sus rondas»).
  const etiqueta = (x) => nombreCompleto(x.j) + " · " + [x.j.fed, V.categoria(x.j.grupo)].filter(Boolean).join(" · ");
  function elegido(campo, todos, tx) {
    const q = campo.value.trim();
    if (!q) return { x: null };
    const exacto = todos.find((x) => etiqueta(x) === q);
    if (exacto) return { x: exacto };
    const palabras = V.plano(q).split(" ").filter(Boolean);
    const hallados = todos.filter((x) => palabras.every((p) => V.plano(x.j.nombre).includes(p)));
    if (hallados.length === 1) return { x: hallados[0] };
    return { x: null, aviso: hallados.length ? tx.caraVarios(hallados.length) : tx.caraNadie };
  }
  function pintarCaraACara() {
    const caja = $("cara-a-cara-contenido"), campoA = $("cara-a"), campoB = $("cara-b"), lista = $("cara-lista");
    if (!caja) return;
    const tx = T(), vx = V.textos();
    if (!V.datos()) { caja.replaceChildren(el("p", "", tx.cargando)); return; }
    const todos = V.jugadores();
    const firma = V.idioma() + ":" + todos.length;
    if (lista.dataset.firma !== firma) {
      lista.dataset.firma = firma;
      lista.replaceChildren(...todos.map((x) => { const o = document.createElement("option"); o.value = etiqueta(x); return o; }));
    }
    const a = elegido(campoA, todos, tx), b = elegido(campoB, todos, tx);
    caja.replaceChildren();
    if (!a.x || !b.x) { caja.appendChild(el("p", "font-semibold", a.aviso || b.aviso || tx.caraElige)); return; }
    if (a.x.j === b.x.j) { caja.appendChild(el("p", "font-semibold", tx.caraMismo)); return; }
    const jugo = (x) => x.torneo.ronda > 0;
    // Dos fichas lado a lado (una debajo de la otra en el celular): una tabla
    // de tres columnas obligaba a correrla de lado y no se comparaba nada.
    const fichas = el("div", "cac-cara mt-2");
    [a.x, b.x].forEach((x) => {
      const rend = V.rendimiento(x);
      const ficha = el("section", "cac-podio");
      ficha.appendChild(el("h3", "", nombreCompleto(x.j)));
      const dl = el("dl", "cac-cara-datos");
      [[0, V.categoria(x.j.grupo)], [1, x.j.fed ? V.pais(x.j.fed) : "—"], [2, x.j.elo ? String(x.j.elo) : "—"],
        [3, jugo(x) && x.j._puestoGrupo ? x.j._puestoGrupo + " / " + x.j._deGrupo : "—"], [4, jugo(x) ? x.j.puntos || "0" : "—"],
        [5, rend ? String(rend.rp) : "—"]].forEach(([i, v]) => { dl.append(el("dt", "", tx.caraFilas[i]), el("dd", "", v)); });
      ficha.appendChild(dl);
      fichas.appendChild(ficha);
    });
    caja.appendChild(fichas);
    // La partida entre los dos (si están en la misma categoría del mismo torneo).
    const mismaCategoria = a.x.torneo === b.x.torneo && a.x.j.grupo === b.x.j.grupo;
    const entreEllos = mismaCategoria ? V.rondasDe(a.x).find((o) => o.rival === b.x.j) : null;
    const color = (o) => (o.color === "blancas" ? vx.blancas : o.color === "negras" ? vx.negras : "");
    const frase = !mismaCategoria ? tx.caraDistintas : !entreEllos ? tx.caraNoJugaron
      : entreEllos.puntos === null ? tx.caraJuegan(entreEllos.ronda, nombreCompleto(a.x.j), color(entreEllos), nombreCompleto(b.x.j))
      : tx.caraJugaron(entreEllos.ronda, nombreCompleto(a.x.j), color(entreEllos), entreEllos.puntos, nombreCompleto(b.x.j));
    caja.appendChild(el("p", "mt-4 font-bold", frase));
    // Ronda a ronda: cada ronda con una línea por jugador (su apellido adelante).
    const rondasA = V.rondasDe(a.x), rondasB = V.rondasDe(b.x);
    const puestosA = V.puestosDe(a.x), puestosB = V.puestosDe(b.x);
    const n = Math.max(0, ...rondasA.map((o) => o.ronda), ...rondasB.map((o) => o.ronda));
    if (!n) return;
    const linea = (x, rondas, puestos, r) => {
      const o = rondas.find((y) => y.ronda === r);
      const quien = String(x.j.nombre).split(",")[0] + ": ";
      if (!o) return quien + "—";
      const q = V.queHizo(o, vx);
      const p = puestos.find((y) => y.ronda === r);
      return quien + q.que + (q.rival ? " " + q.rival : "") + (p ? " · " + V.puestoTexto(p) : "");
    };
    const ol = el("ol", "cac-cara-rondas mt-3");
    for (let r = 1; r <= n; r++) {
      const li = el("li", "");
      li.appendChild(el("p", "font-bold", tx.caraRonda + " " + r));
      const ul = el("ul", "");
      ul.append(el("li", "", linea(a.x, rondasA, puestosA, r)), el("li", "", linea(b.x, rondasB, puestosB, r)));
      li.appendChild(ul);
      ol.appendChild(li);
    }
    caja.appendChild(ol);
  }

  /* ---------------- el diploma ---------------- */
  // Un A4 apaisado a 200 puntos por pulgada (2339 × 1654), con la clasificación
  // final de chess-results: el puesto, los puntos y la categoría. Con la cara
  // de las bases (la misma de la portada de la página): el morado degradado
  // (#40478F a #5A5FA3), las hojas en las esquinas, la letra blanca en
  // mayúsculas con su sombra y la píldora roja con el evento. Al podio le dice
  // el lugar y la medalla (escrita, no solo el color del círculo). Contraste
  // medido: blanco sobre #40478F 8,35 y sobre #5A5FA3 5,83 (el más claro del
  // degradado), blanco sobre el rojo #CE1328 5,6; el número de la medalla,
  // en medalla(). El evento, el lugar, el dibujo y los colores los puede cambiar otra
  // página (window.TorneoPagina.diploma). Lleva la marca de agua de Ajedrez Integral.
  // Cada metal en tres tonos: el brillo, el color y el borde. El número va en
  // #1E2453 sobre el tono del medio: 8,0 en el oro, 9,1 en la plata y 4,4 en el
  // bronce (letra grande: pide 3).
  const MEDALLAS = [["#fff3b0", "#e0b43a", "#8f6a10"], ["#ffffff", "#c4c6cc", "#6f727a"], ["#f6d0a8", "#c27a3e", "#6e3d1a"]];
  // La medalla con su corona de laureles (la opción B que eligió el dueño): el
  // disco con su brillo de metal, un anillo hundido, el número en relieve, dos
  // ramas de laurel alrededor y una estrella del mismo metal arriba. Los
  // laureles son adorno: ningún dato va encima de ellos.
  const LAURELES = ["#7fbf6a", "#4e9a43"];
  function medalla(ctx, x, y, r, p, letra) {
    const [luz, color, borde] = MEDALLAS[p - 1];
    // Las dos ramas: ocho hojas por lado, de abajo hacia arriba.
    [-1, 1].forEach((lado) => {
      for (let i = 0; i < 8; i++) {
        const a = Math.PI / 2 + lado * (0.35 + i * 0.32), rr = r * 1.39;
        ctx.save(); ctx.translate(x + rr * Math.cos(a), y + rr * Math.sin(a)); ctx.rotate(a + lado * 1.2);
        ctx.fillStyle = LAURELES[i % 2]; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.28, r * 0.107, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    });
    // La sombra y el disco con su brillo arriba a la izquierda.
    ctx.fillStyle = "rgba(0, 0, 0, 0.22)"; ctx.beginPath(); ctx.arc(x + 5, y + 8, r, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, luz); g.addColorStop(0.55, color); g.addColorStop(1, borde);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = borde; ctx.stroke();
    // El anillo de adentro, con el metal al revés (hundido).
    const g2 = ctx.createRadialGradient(x + r * 0.25, y + r * 0.3, r * 0.05, x, y, r * 0.74);
    g2.addColorStop(0, luz); g2.addColorStop(1, color);
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(x, y, r * 0.74, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = borde; ctx.stroke();
    // La estrella de arriba, del mismo metal.
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.15 : r * 0.37;
      ctx.lineTo(x + rr * Math.cos(a), y - r * 1.52 + rr * Math.sin(a));
    }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = borde; ctx.stroke();
    // El número en relieve: una luz corrida hacia arriba y el número encima.
    ctx.textAlign = "center";
    ctx.font = "800 " + Math.round(r * 1.05) + "px " + letra;
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)"; ctx.fillText(String(p), x - 2, y + r * 0.36 - 3);
    ctx.fillStyle = "#1e2453"; ctx.fillText(String(p), x, y + r * 0.36);
  }
  // chess-results escribe «Apellidos, Nombre»; en el diploma va al derecho,
  // con el título adelante: «WIM Sofia Mayorga Araya».
  function nombreAlDerecho(j) {
    const partes = String(j.nombre || "").split(",").map((t) => t.trim()).filter(Boolean);
    const nombre = partes.length === 2 ? partes[1] + " " + partes[0] : partes.join(" ");
    return (j.titulo ? j.titulo + " " : "") + nombre;
  }
  async function diploma(x) {
    const tx = T();
    const D = Object.assign({
      evento: tx.dipEvento, lugar: tx.dipLugar, fondo: ["#40478f", "#5a5fa3"], pildora: "#ce1328",
      dibujo: "img/centroamericano-2026/mascota-trofeo.png", hojas: "img/centroamericano-2026/hojas.png",
    }, CONFIG.diploma || {});
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const letra = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
    const W = 2339, H = 1654, cx = W / 2;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    // El morado de las bases, en diagonal (165°, como la portada).
    const fondo = ctx.createLinearGradient(W * 0.37, 0, W * 0.63, H);
    fondo.addColorStop(0, D.fondo[0]); fondo.addColorStop(1, D.fondo[1]);
    ctx.fillStyle = fondo; ctx.fillRect(0, 0, W, H);
    // Las hojas en las cuatro esquinas, tenues como en la portada.
    const hojas = D.hojas ? await cargarImagen(D.hojas) : null;
    if (hojas) {
      const ah = 560, alh = Math.round((ah * hojas.height) / hojas.width);
      ctx.save(); ctx.globalAlpha = 0.55;
      [[1, 1, 0, 0], [-1, 1, W, 0], [1, -1, 0, H], [-1, -1, W, H]].forEach(([sx, sy, tx0, ty0]) => {
        ctx.save(); ctx.translate(tx0, ty0); ctx.scale(sx, sy); ctx.drawImage(hojas, -8, -8, ah, alh); ctx.restore();
      });
      ctx.restore();
    }
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    // Letra blanca con la sombra de las bases (#1E2453 al 45 %, corrida hacia abajo).
    const conSombra = (pintar, corrida) => {
      ctx.save(); ctx.fillStyle = "rgba(30, 36, 83, 0.45)"; ctx.translate(0, corrida); pintar(); ctx.restore();
      ctx.fillStyle = "#ffffff"; pintar();
    };
    const centrado = (texto, y, fuente, ancho, corrida) => {
      ctx.font = fuente;
      let t = String(texto);
      while (ctx.measureText(t).width > (ancho || 1700) && t.length > 4) t = t.slice(0, -2).replace(/\s*\S*$/, "") + "…";
      conSombra(() => ctx.fillText(t, cx, y), corrida || 0);
    };
    // Arriba, el pizote del trofeo (o el dibujo de la página).
    const dibujo = D.dibujo ? await cargarImagen(D.dibujo) : null;
    if (dibujo) {
      const alto = 300, ancho = Math.round((alto * dibujo.width) / dibujo.height);
      ctx.drawImage(dibujo, cx - ancho / 2, 90, ancho, alto);
    }
    centrado(tx.dipTitulo.toUpperCase(), 560, "800 150px " + letra, 1700, 7);
    // La píldora roja con el nombre del evento, como «XXI CAMPEONATO» en las bases.
    ctx.font = "800 44px " + letra;
    const evento = D.evento.toUpperCase();
    const anchoP = Math.min(1800, ctx.measureText(evento).width + 90);
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)"; ctx.beginPath(); ctx.roundRect(cx - anchoP / 2, 615, anchoP, 82, 22); ctx.fill();
    ctx.fillStyle = D.pildora; ctx.beginPath(); ctx.roundRect(cx - anchoP / 2, 607, anchoP, 82, 22); ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.fillText(evento, cx, 664);
    const p = x.j._puestoGrupo || x.j.puesto, de = x.j._deGrupo || 0;
    const podio = p >= 1 && p <= 3;
    centrado(tx.dipOtorga.toUpperCase(), 800, "700 44px " + letra);
    // El nombre, en una línea: si no cabe, la letra se achica (nunca se corta).
    let tam = 120;
    const nombre = nombreAlDerecho(x.j).toUpperCase();
    ctx.font = "800 " + tam + "px " + letra;
    while (ctx.measureText(nombre).width > (podio ? 1440 : 1800) && tam > 60) { tam -= 4; ctx.font = "800 " + tam + "px " + letra; }
    conSombra(() => ctx.fillText(nombre, cx, 945), 6);
    // La medalla a cada lado del nombre, con el número del puesto.
    if (podio) [cx - 930, cx + 930].forEach((mx) => medalla(ctx, mx, 930, 92, p, letra));
    if (x.j.fed) centrado(V.pais(x.j.fed).toUpperCase(), 1030, "700 46px " + letra);
    const cat = V.categoria(x.j.grupo);
    centrado(podio ? tx.dipPodio(p, cat) : tx.dipParticipa(cat), 1150, "700 54px " + letra, 1700, 3);
    if (de) centrado(tx.dipDetalle(x.j.puntos || "0", x.torneo.ronda || x.torneo.rondas || 0, p, de), 1230, "600 42px " + letra);
    centrado(D.lugar, 1390, "600 34px " + letra, 1650);
    centrado(tx.dipPie + " · " + URL_PAGINA, 1470, "500 28px " + letra, 1500);
    ctx.textAlign = "start";
    if (window.TablaImagen && window.TablaImagen.marcar) await window.TablaImagen.marcar(c);
    return c;
  }


  // El diploma en las dos formas: la imagen (para WhatsApp, con el menú de
  // compartir del celular) y el PDF de una página para imprimir
  // (ReportePDF.deImagen, la misma copia de los PDF del sitio).
  async function descargarDiploma(x, formato, boton) {
    const tx = T();
    if (boton) boton.disabled = true;
    try {
      const c = await diploma(x);
      const archivo = CARA.archivo + "-diploma-" + V.plano(x.j.nombre).replace(/ /g, "-");
      if (formato === "pdf") {
        const jpeg = await new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error("sin imagen"))), "image/jpeg", 0.92));
        const blob = window.ReportePDF.deImagen({ jpeg: new Uint8Array(await jpeg.arrayBuffer()), ancho: c.width, alto: c.height,
          horizontal: true, titulo: tx.dipTitulo + " · " + nombreAlDerecho(x.j), autor: "Ajedrez Integral" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = archivo + ".pdf";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        anunciar(tx.dipListo);
      } else {
        const png = await new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error("sin imagen"))), "image/png"));
        await compartirBlob(png, archivo + ".png", tx.dipCompartir(nombreAlDerecho(x.j)) + " https://" + URL_PAGINA);
      }
    } catch (e) {
      anunciar(tx.imagenError);
    } finally {
      if (boton) boton.disabled = false;
    }
  }

  /* ---------------- la hoja de la delegación (PDF) ---------------- */
  // Lo que el entrenador lleva en la mano en la sala: todos sus jugadores en la
  // ronda emparejada, por categoría, con mesa, color, rival y resultado. Es el
  // documento neutral de js/reporte-pdf.js (una sola copia), que le pone la
  // marca de agua de Ajedrez Integral (js/marca-agua.js).
  function documentoDelegacion(fed) {
    const tx = T();
    const suyos = V.jugadores().filter((x) => x.j.fed === fed);
    const ronda = Math.max(0, ...suyos.map((x) => x.ronda || 0));
    const porGrupo = {};
    suyos.forEach((x) => { (porGrupo[x.j.grupo || "—"] = porGrupo[x.j.grupo || "—"] || []).push(x); });
    const bloques = [{ tipo: "parrafo", texto: tx.pdfResumen(suyos.length, ronda) }];
    Object.keys(porGrupo).sort((a, b) => V.ordenGrupo(a) - V.ordenGrupo(b) || a.localeCompare(b)).forEach((g) => {
      bloques.push({ tipo: "titulo", texto: V.categoria(g) });
      const filas = porGrupo[g].sort((a, b) => a.j.puesto - b.j.puesto).map((x) => {
        const p = x.partida;
        const jugo = x.torneo.ronda > 0;
        let rival = tx.pdfNoAparece, mesa = "—", color = "—", res = "";
        if (p && !p.rival) rival = tx.proyBye;
        else if (p) {
          mesa = String(p.mesa);
          color = p.color === "blancas" ? tx.proyBlancas : tx.proyNegras;
          rival = V.rivalTexto(x.rivalDe(p.rival.no) || p.rival);
          res = /\d|½/.test(String(p.resultado || "")) ? String(p.resultado) : "";
        }
        return [mesa, nombreCompleto(x.j), jugo ? x.j.puntos || "0" : "—", color, rival, res];
      });
      // En una A4 de pie no caben más columnas sin cortar el nombre del rival,
      // que es lo que el entrenador busca en la sala.
      bloques.push({ tipo: "tabla", encabezados: [tx.pdfColMesa, tx.colJugador, tx.pdfColPts, tx.pdfColColor, tx.pdfColRival, tx.pdfColRes],
        filas, anchos: [8, 26, 6, 10, 42, 8] });
    });
    const leido = V.cuandoSeLeyo().trim().replace(/\.+$/, ".");
    bloques.push({ tipo: "nota", texto: tx.pdfNota(leido) });
    return { titulo: tx.pdfTitulo(V.pais(fed), ronda), subtitulo: tx.pdfSub, autor: "Ajedrez Integral", color: "#40478f",
      pie: tx.pdfPie, pagina: tx.pdfPagina, bloques, ronda };
  }

  async function hojaDelegacion(fed, boton, estado) {
    const tx = T();
    if (boton) boton.disabled = true;
    if (estado) estado.textContent = "";
    try {
      await V.pedir();
      const d = documentoDelegacion(fed);
      const blob = await window.ReportePDF.generar(d);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "centroamericano-2026-" + fed.toLowerCase() + (d.ronda ? "-ronda-" + d.ronda : "") + ".pdf";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      if (estado) estado.textContent = tx.pdfLista;
    } catch (e) {
      if (estado) estado.textContent = V.datos() ? tx.pdfError : tx.error;
    } finally {
      if (boton) boton.disabled = false;
    }
  }

  /* ---------------- arranque ---------------- */
  const botonDia = $("imagen-dia");
  if (botonDia) {
    const rotular = () => {
      const emoji = el("span", "", "📸 ");
      emoji.setAttribute("aria-hidden", "true");
      botonDia.replaceChildren(emoji, document.createTextNode(T().diaBoton));
    };
    rotular();
    document.addEventListener("cac-idioma", rotular);
    botonDia.addEventListener("click", () => compartirDia(botonDia));
  }
  // Cada ventana se llena al abrirse (js/ventana-enlace.js las abre con su
  // enlace o con la dirección) y se pone al día con los datos nuevos.
  function alAbrir(id, pintar, alCerrar) {
    const d = $(id);
    if (!d) return;
    const cargar = () => { pintar(); V.pedir().then(pintar, () => { const c = $(id + "-contenido"); if (c && !V.datos()) c.replaceChildren(el("p", "font-semibold", T().error)); }); };
    new MutationObserver(() => { if (d.open) cargar(); else if (alCerrar) alCerrar(); }).observe(d, { attributes: true, attributeFilter: ["open"] });
    if (d.open) cargar();
  }
  alAbrir("clasificacion", pintarClasificacion);
  alAbrir("delegaciones", pintarDelegaciones);
  alAbrir("sorpresas", pintarSorpresas);
  alAbrir("cara-a-cara", pintarCaraACara);
  ["cara-a", "cara-b"].forEach((id) => { const c = $(id); if (c) c.addEventListener("input", pintarCaraACara); });
  const proy = $("proyector");
  if (proy) {
    new MutationObserver(() => { if (proy.open) abrirProyector(); else cerrarProyector(); }).observe(proy, { attributes: true, attributeFilter: ["open"] });
    if (proy.open) abrirProyector();
    $("proyector-anterior").addEventListener("click", () => avanzar(-1));
    $("proyector-siguiente").addEventListener("click", () => avanzar(1));
    $("proyector-pausa").addEventListener("click", () => { pausado = !pausado; pintarProyector(); });
    $("proyector-modo").addEventListener("change", (e) => {
      modo = e.target.value;
      try { localStorage.setItem(CLAVE_MODO, modo); } catch (err) {}
      paginas = armarPaginas(); pagina = 0; segundos = 0; pintarProyector();
    });
    $("proyector-completa").addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else if (proy.requestFullscreen) proy.requestFullscreen().catch(() => {});
    });
    proy.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { avanzar(1); e.preventDefault(); }
      if (e.key === "ArrowLeft") { avanzar(-1); e.preventDefault(); }
    });
  }
  const sel = $("clasificacion-categoria"), buscar = $("clasificacion-buscar");
  if (sel) sel.addEventListener("change", () => { categoriaElegida = sel.value; pintarClasificacion(); });
  if (buscar) buscar.addEventListener("input", pintarClasificacion);

  const repintar = () => {
    if ($("clasificacion") && $("clasificacion").open) pintarClasificacion();
    if ($("delegaciones") && $("delegaciones").open) pintarDelegaciones();
    if ($("sorpresas") && $("sorpresas").open) pintarSorpresas();
    if ($("cara-a-cara") && $("cara-a-cara").open) pintarCaraACara();
    if (proy && proy.open) { paginas = armarPaginas(); pintarProyector(); }
  };
  document.addEventListener("cac-datos", repintar);
  document.addEventListener("cac-idioma", repintar);

  window.CentroamericanoTablas = { compartirJugador, imagenJugador, compartirResumen, imagenResumen, resumenDelDia, imagenDia, compartirDia, documentoDelegacion, hojaDelegacion, diploma, descargarDiploma, nombreAlDerecho };
})();
