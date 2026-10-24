/* Lo que se arma con los datos de chess-results en centroamericano-2026.html,
 * además del buscador y el medallero (js/centroamericano-vivo.js):
 *
 * - La clasificación completa de cada categoría (#clasificacion), con el
 *   rendimiento de cada jugador.
 * - La tabla por país (#delegaciones): puntos, porcentaje y ronda a ronda.
 * - El pareo para proyectar (#proyector): letra grande, pasa solo por las
 *   categorías cada 15 segundos, con la hora; para una pantalla en la sala.
 * - La imagen para compartir a un jugador (WhatsApp), con la marca de agua de
 *   Ajedrez Integral (js/tabla-imagen.js, la misma copia).
 *
 * Los datos, las rondas de cada jugador y los textos comunes salen de
 * window.CentroamericanoVivo: una sola copia. Todo lo de afuera (nombres) va
 * por textContent o al lienzo, nunca como HTML.
 *
 * Otra página de torneo (la de CENFOTEC) pone en window.TorneoPagina el
 * nombre, la dirección y la cara de su imagen para compartir; sin eso, es la
 * del Centroamericano. Con el torneo terminado (ver normalizar() en
 * js/centroamericano-vivo.js), el proyector pasa la clasificación final.
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
      proyFinal: (cat, pag, de) => "Clasificación final" + (cat ? " · " + cat : "") + (de > 1 ? " · " + pag + "/" + de : ""),
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
      locale: "es-CR",
    },
    en: {
      cargando: "Searching chess-results…",
      error: "We couldn't read chess-results right now. Please try again in a while.",
      antes: "Starting list: the tournament hasn't started yet.",
      despues: (r) => "After round " + r + ".",
      final: (r) => "Final standings, after round " + r + ".",
      proyFinal: (cat, pag, de) => "Final standings" + (cat ? " · " + cat : "") + (de > 1 ? " · " + pag + "/" + de : ""),
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
      locale: "en-US",
    },
  };
  const T = () => TEXTOS[V.idioma()];
  const decir = (nodo, s) => { nodo.textContent = String(s).replace(/\.\./g, "."); };
  const nombreCompleto = (j) => (j.titulo ? j.titulo + " " : "") + j.nombre;

  // Un aviso para el lector de pantalla (y nada en la pantalla).
  function anunciar(texto) {
    let r = $("cac-anuncio");
    if (!r) {
      r = el("p", "sr-only");
      r.id = "cac-anuncio";
      r.setAttribute("role", "status");
      r.setAttribute("data-no-traducir", "");
      document.body.appendChild(r);
    }
    r.textContent = "";
    setTimeout(() => { r.textContent = texto; }, 50);
  }

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

  /* ---------------- el pareo para proyectar ---------------- */
  let paginas = [], pagina = 0, pausado = false, reloj = null, refresco = null;

  function armarPaginas() {
    const salida = [];
    const datos = V.datos();
    if (!datos) return salida;
    datos.torneos.forEach((tor) => {
      // Terminado, no hay pareo que mostrar: pasa la clasificación final.
      if (tor.terminado && Array.isArray(tor.jugadores)) {
        const lista = V.jugadores().filter((x) => x.torneo === tor).sort((a, b) => a.j.puesto - b.j.puesto);
        const de = Math.ceil(lista.length / MESAS_POR_PAGINA);
        const grupo = lista.length ? lista[0].j.grupo || "" : "";
        for (let i = 0; i < de; i++) salida.push({ final: true, grupo, pag: i + 1, de, filas: lista.slice(i * MESAS_POR_PAGINA, (i + 1) * MESAS_POR_PAGINA) });
        return;
      }
      const pareo = tor.pareo;
      if (!pareo || !pareo.ronda || !Array.isArray(pareo.mesas) || !pareo.mesas.length) return;
      const porNo = new Map((tor.jugadores || []).map((j) => [j.no, j]));
      const porGrupo = {};
      pareo.mesas.slice().sort((a, b) => a.mesa - b.mesa).forEach((m) => {
        const g = (porNo.get(m.blancas.no) || {}).grupo || "—";
        (porGrupo[g] = porGrupo[g] || []).push(m);
      });
      Object.keys(porGrupo).sort((a, b) => V.ordenGrupo(a) - V.ordenGrupo(b) || a.localeCompare(b)).forEach((g) => {
        const mesas = porGrupo[g];
        const de = Math.ceil(mesas.length / MESAS_POR_PAGINA);
        for (let i = 0; i < de; i++) salida.push({ ronda: pareo.ronda, grupo: g, pag: i + 1, de, mesas: mesas.slice(i * MESAS_POR_PAGINA, (i + 1) * MESAS_POR_PAGINA), porNo });
      });
    });
    return salida;
  }

  function pintarProyector() {
    const caja = $("proyector-contenido"), titulo = $("proyector-titulo");
    if (!caja) return;
    const tx = T();
    $("proyector-pausa").textContent = pausado ? tx.seguir : tx.pausa;
    $("proyector-pausa").setAttribute("aria-pressed", pausado ? "true" : "false");
    if (!paginas.length) {
      titulo.textContent = NOMBRE_CORTO;
      caja.replaceChildren(el("p", "cac-proyector-vacio", V.datos() ? tx.proySinPareo : tx.cargando));
      return;
    }
    if (pagina >= paginas.length) pagina = 0;
    const p = paginas[pagina];
    if (p.final) { pintarFinal(p, tx, titulo, caja); return; }
    titulo.textContent = tx.proyTitulo(p.ronda, V.categoria(p.grupo), p.pag, p.de);
    const quien = (n) => { const j = n && p.porNo.get(n.no); return n ? nombreCompleto(n) + (j && j.fed ? " (" + j.fed + ")" : "") : ""; };
    const t = el("table", "cac-proyector-tabla");
    const cab = el("tr");
    [tx.proyMesa, tx.proyBlancas, tx.proyResultado, tx.proyNegras].forEach((c) => { const th = el("th", "", c); th.scope = "col"; cab.appendChild(th); });
    const thead = el("thead"); thead.appendChild(cab);
    const tbody = el("tbody");
    p.mesas.forEach((m) => {
      const tr = el("tr");
      tr.appendChild(el("td", "mesa", String(m.mesa)));
      tr.appendChild(el("td", "", quien(m.blancas)));
      tr.appendChild(el("td", "res", m.negras ? (/\d|½|\+/.test(m.resultado || "") ? m.resultado : "–") : ""));
      tr.appendChild(el("td", "", m.negras ? quien(m.negras) : tx.proyBye));
      tbody.appendChild(tr);
    });
    t.append(thead, tbody);
    caja.replaceChildren(t);
  }

  // Una página de la clasificación final, con la misma letra grande del pareo.
  function pintarFinal(p, tx, titulo, caja) {
    titulo.textContent = tx.proyFinal(p.grupo ? V.categoria(p.grupo) : "", p.pag, p.de);
    const t = el("table", "cac-proyector-tabla");
    const cab = el("tr");
    [tx.colPuesto, tx.colJugador, tx.colPuntos, tx.colRend].forEach((c) => { const th = el("th", "", c); th.scope = "col"; cab.appendChild(th); });
    const thead = el("thead"); thead.appendChild(cab);
    const tbody = el("tbody");
    p.filas.forEach((x) => {
      const tr = el("tr");
      const rend = V.rendimiento(x);
      tr.appendChild(el("td", "mesa", String(x.j.puesto)));
      tr.appendChild(el("td", "", nombreCompleto(x.j)));
      tr.appendChild(el("td", "res", x.j.puntos || "0"));
      tr.appendChild(el("td", "res", rend ? String(rend.rp) : "—"));
      tbody.appendChild(tr);
    });
    t.append(thead, tbody);
    caja.replaceChildren(t);
  }

  function ponerReloj() {
    const r = $("proyector-reloj");
    if (r) r.textContent = new Date().toLocaleTimeString(T().locale, { hour: "numeric", minute: "2-digit", timeZone: V.ZONA });
  }

  function avanzar(paso) {
    if (!paginas.length) return;
    pagina = (pagina + paso + paginas.length) % paginas.length;
    pintarProyector();
  }

  function abrirProyector() {
    paginas = armarPaginas();
    pintarProyector();
    ponerReloj();
    clearInterval(reloj);
    let segundos = 0;
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
    // El recuadro de cómo va.
    ctx.fillStyle = CARA.suave;
    const r = 36, cx = 60, cy = y, cw = 960, ch = 230;
    ctx.beginPath(); ctx.moveTo(cx + r, cy); ctx.arcTo(cx + cw, cy, cx + cw, cy + ch, r); ctx.arcTo(cx + cw, cy + ch, cx, cy + ch, r);
    ctx.arcTo(cx, cy + ch, cx, cy, r); ctx.arcTo(cx, cy, cx + cw, cy, r); ctx.closePath(); ctx.fill();
    ctx.fillStyle = CARA.acento; ctx.fillRect(cx, cy + 30, 12, ch - 60);
    ctx.fillStyle = CARA.tinta;
    const ronda = x.torneo.ronda || 0;
    ctx.font = "800 84px " + letra;
    ctx.fillText(ronda && x.j._puestoGrupo ? tx.imgPuesto(x.j._puestoGrupo, x.j._deGrupo) : tx.imgInicial(x.j.no), cx + 50, cy + 110);
    ctx.font = "600 42px " + letra;
    ctx.fillText(ronda ? (x.torneo.terminado ? tx.imgFinal(x.j.puntos || "0", ronda) : tx.imgPuntos(x.j.puntos || "0", ronda)) : tx.imgAntes, cx + 50, cy + 180);
    y = cy + ch + 70;
    // La última ronda (o la de hoy, si todavía no tiene resultado).
    const rondas = V.rondasDe(x);
    const ultima = rondas[rondas.length - 1];
    if (ultima) {
      const q = V.queHizo(ultima, V.textos());
      ctx.fillStyle = "#1f2937"; ctx.font = "500 38px " + letra;
      renglones(ctx, tx.imgRonda(ultima.ronda, q.que, q.rival), 960, 3).forEach((l) => { ctx.fillText(l, 60, y); y += 50; });
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

  async function compartirJugador(x, boton) {
    const tx = T();
    if (boton) boton.disabled = true;
    try {
      const blob = await imagenJugador(x);
      const nombre = CARA.archivo + "-" + V.plano(x.j.nombre).replace(/ /g, "-") + ".png";
      const archivo = new File([blob], nombre, { type: "image/png" });
      const texto = (CONFIG.compartirTexto ? CONFIG.compartirTexto(x.j.nombre) : tx.compartirTexto(x.j.nombre)) + " https://" + URL_PAGINA;
      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        try { await navigator.share({ files: [archivo], text: texto }); } catch (e) { if (e && e.name !== "AbortError") throw e; }
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nombre;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      anunciar(tx.imagenLista);
    } catch (e) {
      anunciar(tx.imagenError);
    } finally {
      if (boton) boton.disabled = false;
    }
  }

  /* ---------------- arranque ---------------- */
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
  const proy = $("proyector");
  if (proy) {
    new MutationObserver(() => { if (proy.open) abrirProyector(); else cerrarProyector(); }).observe(proy, { attributes: true, attributeFilter: ["open"] });
    if (proy.open) abrirProyector();
    $("proyector-anterior").addEventListener("click", () => avanzar(-1));
    $("proyector-siguiente").addEventListener("click", () => avanzar(1));
    $("proyector-pausa").addEventListener("click", () => { pausado = !pausado; pintarProyector(); });
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
    if (proy && proy.open) { paginas = armarPaginas(); pintarProyector(); }
  };
  document.addEventListener("cac-datos", repintar);
  document.addEventListener("cac-idioma", repintar);

  window.CentroamericanoTablas = { compartirJugador, imagenJugador };
})();
