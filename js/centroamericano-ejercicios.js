/* «Ejercicios de la ronda» en la página del Centroamericano 2026: unas diez
 * posiciones de las partidas transmitidas de cada ronda, donde quien movía
 * tenía UNA sola jugada que gana. Las busca y las publica solo
 * herramientas/centroamericano-ejercicios.js (con Stockfish, desde GitHub) en
 * data/centroamericano-ejercicios.json; esto solo las muestra y deja
 * resolverlas. Ver «Los ejercicios de la ronda» en
 * docs/decisiones/juegos-y-torneos.md.
 *
 * - La ficha «Ejercicios de la ronda» (#ficha-ejercicios) se enciende en
 *   cuanto hay alguno; la ventana (#ejercicios) tiene un botón por ronda: los
 *   de las rondas anteriores no se pierden.
 * - Se contesta moviendo en el tablero (js/tablero-pregunta.js) o escribiendo
 *   la jugada («Cf3», «enroque corto»: js/comandos-tablero.js). Si no es, se
 *   vuelve a intentar; la pista marca la pieza; «Ver la solución» la juega.
 *   Cuando la línea pide más de una jugada, la del rival la hace la página.
 * - Nada de quién jugó: solo la categoría y, si en la partida se jugó la
 *   jugada buena, el apellido de quien la encontró (lo pidió el dueño).
 * - Los resueltos quedan marcados en este aparato (localStorage), sin cuenta.
 * - Una línea en «Hoy en el torneo» avisa de los de la última ronda.
 */
(function () {
  "use strict";

  const V = window.CentroamericanoVivo;
  const dialogo = document.getElementById("ejercicios");
  const contenido = document.getElementById("ejercicios-contenido");
  if (!V || !dialogo || !contenido || !window.Chess || !window.TableroPregunta) return;
  const el = V.el;
  const DATOS = "data/centroamericano-ejercicios.json";
  const CLAVE = "cac_ejercicios_resueltos";
  const RELEER_MS = 10 * 60000;

  const TEXTOS = {
    es: {
      cargando: "Cargando los ejercicios…",
      error: "No pudimos cargar los ejercicios. Vuelve a intentarlo en un rato.",
      vacio: "Los ejercicios de cada ronda aparecen aquí cuando la ronda termina.",
      intro: "Posiciones de verdad, de las partidas transmitidas de cada ronda: en cada una hay una sola jugada que gana, comprobada con Stockfish. No decimos quién jugó: solo en qué categoría pasó.",
      ronda: (n) => "Ronda " + n,
      rondaHecha: (n) => "Ronda " + n + ", todos resueltos",
      resueltos: (r, h, n) => "Ronda " + r + " · resolviste " + h + " de " + n,
      juegan: (c) => (c === "w" ? "Juegan las blancas" : "Juegan las negras"),
      mateEn: (n) => "mate en " + n,
      pregunta: (e) => (e.tema === "mate" ? (e.mate === 1 ? "¿Cómo das mate?" : "¿Cómo das mate en " + e.mate + "?") : "¿Cómo ganas?"),
      donde: (i, n, r, cat) => "Ejercicio " + i + " de " + n + " · Pasó en la ronda " + r + (cat ? " del " + cat : ""),
      volver: (n, r) => "← Los " + n + " de la ronda " + r,
      escribe: "O escribe tu jugada",
      ejemplo: "Por ejemplo: Cf3, Axh7+ o enroque corto",
      jugar: "Jugar",
      pista: "Una pista",
      pistaTexto: "La pieza que se mueve quedó marcada en el tablero.",
      verSolucion: "Ver la solución",
      ayuda: "Mueve una pieza en el tablero o escribe la jugada. Si no es esa, puedes volver a intentarlo.",
      noEntendi: "No entendí esa jugada. Escríbela como en la planilla, por ejemplo Cf3.",
      noEsa: (san) => san + " no es. Inténtalo otra vez.",
      sigue: (san) => "¡Bien! El rival contesta " + san + ". ¿Y ahora?",
      bien: "¡Bien! Esa es la jugada.",
      laSolucion: "La solución",
      gana: { mate: "dan mate", dama: "ganan la dama", corona: "coronan un peón", torre: "ganan una torre", pieza: "ganan una pieza", calidad: "ganan la calidad", ataque: "quedan con una ventaja que decide la partida" },
      explica: (linea, c, tema) => linea + ": las " + (c === "w" ? "blancas" : "negras") + " " + TEXTOS.es.gana[tema] + ".",
      despues: (l) => "Cómo sigue, según Stockfish: " + l + ".",
      logro: (a) => "En la partida la encontró " + a + ".",
      siguiente: "Siguiente ejercicio →",
      otraVez: "Volver a intentarlo",
      resuelto: "Resuelto",
      tablero: "Tablero del ejercicio",
      ficha: (r) => "Resolver los de la ronda " + r + " →",
      hoy: (r) => "Ya están los ejercicios de la ronda " + r + ". ¿Cuántos resuelves? →",
    },
    en: {
      cargando: "Loading the puzzles…",
      error: "We couldn't load the puzzles. Please try again in a while.",
      vacio: "The puzzles of each round show up here when the round is over.",
      intro: "Real positions from the broadcast games of each round: in each one there is only one winning move, checked with Stockfish. We don't say who played: only the section where it happened.",
      ronda: (n) => "Round " + n,
      rondaHecha: (n) => "Round " + n + ", all solved",
      resueltos: (r, h, n) => "Round " + r + " · you solved " + h + " of " + n,
      juegan: (c) => (c === "w" ? "White to move" : "Black to move"),
      mateEn: (n) => "mate in " + n,
      pregunta: (e) => (e.tema === "mate" ? (e.mate === 1 ? "How do you mate?" : "How do you mate in " + e.mate + "?") : "How do you win?"),
      donde: (i, n, r, cat) => "Puzzle " + i + " of " + n + " · From round " + r + (cat ? ", " + cat : ""),
      volver: (n, r) => "← The " + n + " of round " + r,
      escribe: "Or type your move",
      ejemplo: "For example: e4, exd5 or O-O",
      jugar: "Play",
      pista: "A hint",
      pistaTexto: "The piece that moves is marked on the board.",
      verSolucion: "Show the solution",
      ayuda: "Move a piece on the board or type the move. If it's not the one, you can try again.",
      noEntendi: "We didn't understand that move. Type it as on a scoresheet, for example e4 or exd5.",
      noEsa: (san) => san + " is not it. Try again.",
      sigue: (san) => "Good! The opponent replies " + san + ". And now?",
      bien: "Well done! That's the move.",
      laSolucion: "The solution",
      gana: { mate: "deliver mate", dama: "win the queen", corona: "promote a pawn", torre: "win a rook", pieza: "win a piece", calidad: "win the exchange", ataque: "get a winning advantage" },
      explica: (linea, c, tema) => linea + ": " + (c === "w" ? "White" : "Black") + " " + TEXTOS.en.gana[tema].replace(/^(\w+)/, (v) => v + "s") + ".",
      despues: (l) => "How it goes on, according to Stockfish: " + l + ".",
      logro: (a) => "In the game, " + a + " found it.",
      siguiente: "Next puzzle →",
      otraVez: "Try again",
      resuelto: "Solved",
      tablero: "Puzzle board",
      ficha: (r) => "Solve round " + r + " →",
      hoy: (r) => "The puzzles of round " + r + " are here. How many can you solve? →",
    },
  };
  const T = () => (V.idioma() === "fr" && window.CentroamericanoFR && window.CentroamericanoFR.ejercicios) || TEXTOS[V.idioma()] || TEXTOS.es;

  // La jugada como se lee en cada idioma (la misma regla de las partidas en vivo).
  const P = () => window.CentroamericanoPartidas;
  const sanVer = (san) => (P() && P().sanVer ? P().sanVer(san) : san);

  /* ---------------- los datos ---------------- */
  let datos = null, leido = 0, pidiendo = null, error = false;
  function cargar(forzar) {
    if (pidiendo) return pidiendo;
    if (datos && !forzar && Date.now() - leido < RELEER_MS) return Promise.resolve(datos);
    pidiendo = fetch(DATOS, { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error("ejercicios " + r.status); return r.json(); })
      .then((d) => { datos = limpiar(d); leido = Date.now(); error = false; return datos; }, (e) => { error = true; if (datos) return datos; throw e; })
      .finally(() => { pidiendo = null; pintarAfuera(); });
    return pidiendo;
  }
  // Solo lo que se puede jugar: un ejercicio con una posición o una línea que
  // chess.js no acepta no se muestra (el verificador lo revisa antes).
  function limpiar(d) {
    const rondas = {};
    Object.keys((d && d.rondas) || {}).forEach((k) => {
      const n = Number(k);
      const lista = (Array.isArray(d.rondas[k]) ? d.rondas[k] : []).filter((e) => {
        try {
          const g = new Chess(e.fen);
          return Array.isArray(e.solucion) && e.solucion.length % 2 === 1 && e.solucion.every((u) => jugar(g, u));
        } catch (x) { return false; }
      });
      if (n > 0 && lista.length) rondas[n] = lista;
    });
    return { rondas };
  }
  const rondasCon = () => (datos ? Object.keys(datos.rondas).map(Number).sort((a, b) => a - b) : []);
  const ultima = () => rondasCon().slice(-1)[0] || 0;

  function jugar(g, uci) {
    return g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
  }
  const uciDe = (m) => m.from + m.to + (m.promotion || "");

  /* ---------------- los resueltos, en este aparato ---------------- */
  const clave = (r, e) => r + "|" + e.fen;
  function resueltos() {
    try { const v = JSON.parse(localStorage.getItem(CLAVE) || "[]"); return new Set(Array.isArray(v) ? v : []); } catch (e) { return new Set(); }
  }
  function marcar(r, e) {
    const s = resueltos();
    s.add(clave(r, e));
    try { localStorage.setItem(CLAVE, JSON.stringify([...s].slice(-300))); } catch (x) { /* sin espacio: no se recuerda */ }
  }

  /* ---------------- la ficha y la línea de «Hoy» ---------------- */
  function pintarAfuera() {
    const r = ultima(), tx = T();
    const f = document.getElementById("ficha-ejercicios");
    if (f && r) {
      if (f.tagName !== "A") {
        const a = document.createElement("a");
        a.id = "ficha-ejercicios";
        a.href = "#ejercicios";
        a.dataset.color = f.dataset.color || "verde";
        a.className = "cac-ficha h-full flex flex-col rounded-3xl bg-white dark:bg-brand-900 shadow-md p-4 sm:p-6 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#ce1328]";
        [...f.childNodes].forEach((n) => a.appendChild(n));
        f.replaceWith(a);
      }
      const pie = document.querySelector("#ficha-ejercicios > span:last-child");
      if (pie) { pie.className = "mt-auto pt-3 sm:pt-4 text-xs sm:text-sm font-bold cac-accion"; pie.textContent = tx.ficha(r); }
    }
    const hoy = document.getElementById("hoy-ejercicios");
    if (hoy) {
      hoy.hidden = !r;
      if (r) {
        const a = el("a", "cac-accion underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ce1328]");
        a.href = "#ejercicios";
        a.appendChild(el("span", "", "🧩 ")).setAttribute("aria-hidden", "true");
        a.appendChild(document.createTextNode(tx.hoy(r)));
        hoy.replaceChildren(a);
      }
    }
  }

  /* ---------------- la ventana: la lista de una ronda ---------------- */
  let rondaVista = 0;
  let actual = null;   // el ejercicio abierto: { r, i, e, g, paso, t, listo }

  function pintarLista(foco) {
    actual = null;
    const tx = T();
    if (!datos) {
      contenido.replaceChildren(el("p", "text-brand-600 dark:text-brand-300", error ? tx.error : tx.cargando));
      cargar().then(() => { if (dialogo.open && !actual) pintarLista(); }, () => { if (dialogo.open && !actual) contenido.replaceChildren(el("p", "font-semibold", tx.error)); });
      return;
    }
    const rondas = rondasCon();
    if (!rondas.length) { contenido.replaceChildren(el("p", "font-semibold", tx.vacio)); return; }
    if (rondas.indexOf(rondaVista) === -1) rondaVista = rondas[rondas.length - 1];
    const hechos = resueltos();
    const lista = datos.rondas[rondaVista];
    const caja = el("div", "");
    caja.dataset.lista = "";
    caja.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-300", tx.intro));
    const botones = el("div", "mt-3 flex flex-wrap gap-2");
    botones.setAttribute("role", "group");
    botones.setAttribute("aria-label", tx.ronda("").trim());
    rondas.forEach((n) => {
      const todos = datos.rondas[n].every((e) => hechos.has(clave(n, e)));
      const b = el("button", "cac-jugador-boton cac-ejercicios-ronda", tx.ronda(n) + (todos ? " ✓" : ""));
      b.type = "button";
      b.dataset.ejerciciosRonda = n;
      b.setAttribute("aria-pressed", String(n === rondaVista));
      if (todos) b.setAttribute("aria-label", tx.rondaHecha(n));
      b.addEventListener("click", () => { rondaVista = n; pintarLista('[data-ejercicios-ronda="' + n + '"]'); });
      botones.appendChild(b);
    });
    caja.appendChild(botones);
    const n = lista.filter((e) => hechos.has(clave(rondaVista, e))).length;
    const cuenta = el("p", "mt-3 font-bold", tx.resueltos(rondaVista, n, lista.length));
    cuenta.setAttribute("role", "status");
    caja.appendChild(cuenta);
    const ul = el("ul", "cac-ejercicios-lista mt-3");
    lista.forEach((e, i) => {
      const color = e.fen.split(" ")[1];
      const hecho = hechos.has(clave(rondaVista, e));
      const li = el("li", "");
      const b = el("button", "cac-ejercicio-tarjeta" + (hecho ? " cac-ejercicio-hecho" : ""));
      b.type = "button";
      b.dataset.ejercicio = i;
      const tab = el("div", "cine-tablero cine-tablero-mini");
      tab.setAttribute("aria-hidden", "true");
      if (window.TableroFen) window.TableroFen.dibujar(tab, e.fen, null, { miniatura: true, girado: color === "b" });
      const cat = V.categoria(e.categoria);
      b.append(tab,
        el("span", "cac-ejercicio-nombre", (i + 1) + ". " + (cat || tx.ronda(rondaVista))),
        el("span", "cac-ejercicio-dato", tx.juegan(color) + (e.tema === "mate" ? " · " + tx.mateEn(e.mate) : "")));
      if (hecho) b.appendChild(el("span", "cac-ejercicio-resuelto", "✓ " + tx.resuelto));
      b.addEventListener("click", () => abrir(rondaVista, i));
      li.appendChild(b);
      ul.appendChild(li);
    });
    caja.appendChild(ul);
    contenido.replaceChildren(caja);
    if (foco) { const x = contenido.querySelector(foco); if (x) x.focus(); }
  }

  /* ---------------- un ejercicio ---------------- */
  // La línea con su numeración: «14. Cd5 g5 15. Cxg5» o «21… dxc3+».
  function lineaTexto(fen, ucis) {
    const g = new Chess(fen);
    let n = Number(fen.split(" ")[5]) || 1;
    const out = [];
    ucis.forEach((u, k) => {
      const blancas = g.turn() === "w";
      const m = jugar(g, u);
      if (!m) return;
      if (blancas) out.push(n + ". " + sanVer(m.san));
      else { out.push((k === 0 ? n + "… " : "") + sanVer(m.san)); n++; }
    });
    return out.join(" ");
  }

  function abrir(r, i) {
    const e = datos.rondas[r][i];
    actual = { r, i, e, g: new Chess(e.fen), paso: 0, listo: false };
    const tx = T(), lista = datos.rondas[r];
    const color = e.fen.split(" ")[1];
    const caja = el("div", "cac-ejercicio");
    caja.dataset.ejercicioAbierto = i;
    const volver = el("button", "cac-jugador-boton", tx.volver(lista.length, r));
    volver.type = "button";
    volver.dataset.volver = "";
    volver.addEventListener("click", () => pintarLista('[data-ejercicio="' + i + '"]'));
    const donde = el("p", "mt-3 text-sm font-bold text-brand-600 dark:text-brand-300", tx.donde(i + 1, lista.length, r, V.categoria(e.categoria)));
    const preg = el("h3", "cac-ejercicio-pregunta", tx.juegan(color) + ". " + tx.pregunta(e));
    preg.tabIndex = -1;
    const tablero = el("div", "cac-ejercicio-tablero grid grid-cols-8 aspect-square");
    tablero.setAttribute("role", "group");
    tablero.setAttribute("aria-label", tx.tablero);
    const aviso = el("p", "cac-ejercicio-aviso");
    aviso.setAttribute("role", "status");
    aviso.setAttribute("aria-live", "polite");
    aviso.dataset.aviso = "";

    // Escribir la jugada.
    const form = el("form", "cac-ejercicio-escribir");
    const label = el("label", "block text-sm font-bold", tx.escribe);
    const input = el("input", "cac-ejercicio-input");
    input.type = "text";
    input.autocomplete = "off";
    input.setAttribute("autocapitalize", "off");
    input.spellcheck = false;
    input.placeholder = tx.ejemplo;
    input.id = "ejercicio-jugada";
    label.htmlFor = input.id;
    const jugarB = el("button", "cac-jugador-boton", tx.jugar);
    jugarB.type = "submit";
    const fila = el("div", "flex gap-2 mt-1");
    fila.append(input, jugarB);
    form.append(label, fila);
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      if (actual.listo) return;
      // escribir() vuelve a pintar el tablero al terminar, así que lo que
      // dice si se entendió es que la jugada llegó a contestar().
      const a = actual;
      a.recibio = false;
      a.t.escribir(input.value);
      if (!a.recibio) decir(tx.noEntendi, "mal");
      else input.value = "";
    });

    const acciones = el("div", "mt-3 flex flex-wrap gap-2");
    acciones.dataset.acciones = "";
    const pista = el("button", "cac-jugador-boton", "");
    pista.type = "button";
    pista.dataset.pista = "";
    pista.appendChild(el("span", "", "💡 ")).setAttribute("aria-hidden", "true");
    pista.appendChild(document.createTextNode(tx.pista));
    pista.addEventListener("click", () => {
      if (actual.listo) return;
      const u = e.solucion[actual.paso];
      actual.t.pintar([u.slice(0, 2)]);
      decir(tx.pistaTexto, "");
    });
    const sol = el("button", "cac-jugador-boton", tx.verSolucion);
    sol.type = "button";
    sol.dataset.solucion = "";
    sol.addEventListener("click", () => terminar(false));
    acciones.append(pista, sol);

    const ayuda = el("p", "mt-2 text-sm text-brand-600 dark:text-brand-300", tx.ayuda);
    ayuda.dataset.ayuda = "";
    caja.append(volver, donde, preg, tablero, aviso, form, acciones, ayuda);
    contenido.replaceChildren(caja);
    actual.caja = caja;
    actual.t = TableroPregunta.montar(tablero, { fen: e.fen, tipo: "jugada", orientacion: color, alSeleccionar: (resp) => contestar(resp) });
    preg.focus();
  }

  function decir(texto, tipo) {
    const a = actual && actual.caja.querySelector("[data-aviso]");
    if (!a) return;
    a.textContent = texto;
    a.className = "cac-ejercicio-aviso" + (tipo ? " cac-ejercicio-aviso-" + tipo : "");
    // La cara del profe al lado (la pinta el CSS): «casi» si no era esa,
    // «muy bien» si va bien, «idea» con la pista; sin texto, ninguna.
    const cara = !texto ? "" : tipo === "mal" ? "casi" : tipo === "bien" ? "muy-bien" : "idea";
    if (cara) a.dataset.profe = cara; else delete a.dataset.profe;
  }

  function contestar(resp) {
    const a = actual;
    if (!a || a.listo) return;
    a.recibio = true;
    const tx = T(), e = a.e;
    const esperada = e.solucion[a.paso];
    const uci = resp.from + resp.to + (resp.promotion || "");
    const prueba = new Chess(a.g.fen());
    const m = jugar(prueba, uci);
    // La de la solución; en el último paso de un mate, cualquier mate vale.
    const ultimaPide = a.paso === e.solucion.length - 1;
    const vale = m && (uci === esperada || (ultimaPide && e.tema === "mate" && prueba.in_checkmate()));
    if (!vale) {
      decir(tx.noEsa(sanVer(resp.san)), "mal");
      const fen = a.g.fen();
      setTimeout(() => { if (actual === a && !a.listo) a.t.cargar(fen); }, 700);
      return;
    }
    jugar(a.g, uci);
    a.jugadas = (a.jugadas || []).concat(uci);
    if (ultimaPide) { terminar(true); return; }
    // La respuesta del rival, la hace la página.
    const resp2 = e.solucion[a.paso + 1];
    const m2 = jugar(new Chess(a.g.fen()), resp2);
    decir(tx.sigue(sanVer(m2.san)), "bien");
    setTimeout(() => {
      if (actual !== a || a.listo) return;
      const hecho = jugar(a.g, resp2);
      a.jugadas.push(resp2);
      a.paso += 2;
      a.t.cargar(a.g.fen());
      a.t.pintar([hecho.from, hecho.to]);
    }, 600);
  }

  // bien: lo resolvió; si no, pidió la solución (no cuenta como resuelto).
  function terminar(bien) {
    const a = actual;
    if (!a || a.listo) return;
    a.listo = true;
    const tx = T(), e = a.e;
    const color = e.fen.split(" ")[1];
    // Lo que se jugó (si lo resolvió, con su propio mate) o la solución entera.
    const linea = bien ? a.jugadas : e.solucion;
    const g = new Chess(e.fen);
    let ult = null;
    linea.forEach((u) => { ult = jugar(g, u); });
    a.t.cargar(g.fen());
    if (ult) a.t.pintar([ult.from, ult.to]);
    a.t.bloquear();
    if (bien) marcar(a.r, e);
    const caja = a.caja;
    caja.querySelector(".cac-ejercicio-escribir").hidden = true;
    caja.querySelector("[data-ayuda]").hidden = true;
    const acciones = caja.querySelector("[data-acciones]");
    const res = el("div", "cac-ejercicio-resultado" + (bien ? " cac-ejercicio-resultado-bien" : ""));
    res.dataset.resultado = bien ? "bien" : "solucion";
    const t = el("p", "font-extrabold", "");
    if (bien) t.dataset.profe = "excelente";
    if (bien) t.appendChild(el("span", "", "✓ ")).setAttribute("aria-hidden", "true");
    t.appendChild(document.createTextNode(bien ? tx.bien : tx.laSolucion));
    res.append(t, el("p", "mt-1", tx.explica(lineaTexto(e.fen, linea), color, e.tema)));
    if (e.despues && e.despues.length && !g.game_over()) {
      const sigue = lineaTexto(g.fen(), e.despues);
      if (sigue) res.appendChild(el("p", "mt-1 text-sm", tx.despues(sigue)));
    }
    if (e.logro) res.appendChild(el("p", "mt-1 text-sm font-semibold", tx.logro(e.logro)));
    const botones = el("div", "mt-3 flex flex-wrap gap-2");
    const lista = datos.rondas[a.r];
    if (a.i + 1 < lista.length) {
      const sig = el("button", "cac-boton", tx.siguiente);
      sig.type = "button";
      sig.dataset.siguiente = "";
      sig.addEventListener("click", () => abrir(a.r, a.i + 1));
      botones.appendChild(sig);
    }
    const otra = el("button", "cac-jugador-boton", tx.otraVez);
    otra.type = "button";
    otra.addEventListener("click", () => abrir(a.r, a.i));
    botones.appendChild(otra);
    acciones.replaceWith(res, botones);
    decir("", "");
    const foco = botones.querySelector("button");
    if (foco) foco.focus();
  }

  /* ---------------- abrir y cerrar ---------------- */
  new MutationObserver(() => {
    if (dialogo.open) { if (!actual) pintarLista(); }
    else { actual = null; contenido.replaceChildren(); }
  }).observe(dialogo, { attributes: true, attributeFilter: ["open"] });
  document.addEventListener("cac-idioma", () => {
    pintarAfuera();
    if (!dialogo.open) return;
    if (actual) abrir(actual.r, actual.i); else pintarLista();
  });
  cargar().catch(() => {});
  setInterval(() => { if (!document.hidden) cargar(true).then(() => { if (dialogo.open && !actual) pintarLista(); }, () => {}); }, RELEER_MS);
  if (dialogo.open) pintarLista();

  window.CentroamericanoEjercicios = { cargar: () => cargar(true), abrir: (r, i) => { rondaVista = r; abrir(r, i); } };
})();
