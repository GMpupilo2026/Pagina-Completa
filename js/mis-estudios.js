/* El código de entreno/mis-estudios.html: «Mis estudios».
 *
 * Los estudios del alumno, al estilo de los de Lichess (tabla
 * public.estudios). Un estudio tiene capítulos; cada capítulo es un árbol de
 * jugadas con variantes, comentarios, signos (! ? !? …) y marcas (casillas y
 * flechas), guardado en PGN con js/estudio-pgn.js.
 *
 * - Se guarda solo, un momento después de cada cambio (como en Lichess), y la
 *   barra dice «Guardado» o por qué no.
 * - El motor (Stockfish 19 lite, el mismo Worker de js/shared-engine.js)
 *   analiza la posición con sus tres mejores líneas, que se agregan como
 *   variante; «Buscar mejoras en la línea» revisa la línea principal jugada a
 *   jugada y, donde la jugada pierde, la marca (?!, ?, ??) y deja la del motor
 *   como variante.
 * - «Llevar a mi repertorio» manda la línea hasta la jugada elegida a
 *   public.repertorio (Aperturas y celadas → Mi repertorio), y «Hacer un
 *   estudio con mi repertorio» hace lo contrario: un capítulo por color con
 *   el árbol de sus líneas.
 * - Lo que se ve lo decide la RLS: el alumno, lo suyo; su profe (con
 *   ?alumno=<id>), solo lo que el alumno compartió, y en solo lectura.
 *
 * Ver «Mis estudios» en docs/decisiones/entrenamiento.md.
 */
(function () {
  "use strict";

  const E = window.EstudioPGN;
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const ES_ID = /^[0-9a-f-]{36}$/i;
  const MAX_CAPITULOS = 64;
  const MAX_PGN = 100000;
  const COLOR_NOMBRE = { G: "verde", R: "roja", Y: "amarilla", B: "azul" };
  const COLOR_TRAZO = { G: "#15803d", R: "#b91c1c", Y: "#a16207", B: "#1d4ed8" };
  const PIEZA_NOMBRE = { k: "rey", q: "dama", r: "torre", b: "alfil", n: "caballo", p: "peón" };

  let yo = null, alumno = null, propio = true;
  let estudio = null;            // { id, titulo, descripcion, compartido, alumno_id, caps: [{ titulo, orientacion, pgn, partida }] }
  let capIdx = 0, nodoActual = null, seleccion = null, marcando = false, desdeMarca = null;

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
  }
  const esp = (san) => (window.ComandosTablero ? ComandosTablero.jugadaParaMostrar(san) : san);
  const fecha = (iso) => (window.HoraCR ? HoraCR.fecha(iso, { day: "numeric", month: "short", year: "numeric" }) : "");
  const nuevoJuego = (fen) => (fen === E.INICIAL ? new Chess() : new Chess(fen));

  // ===================================================================
  // La lista
  // ===================================================================
  async function cargarLista() {
    $("estado-lista").textContent = "Cargando tus estudios…";
    $("estado-lista").hidden = false;
    // Sin `capitulos`: la lista no necesita los PGN, y n_capitulos lo cuenta la base.
    const { data, error } = await sb.from("estudios")
      .select("id, titulo, descripcion, n_capitulos, compartido, created_at, updated_at")
      .eq("alumno_id", alumno).order("updated_at", { ascending: false }).range(0, 99);
    const lista = $("lista");
    lista.replaceChildren();
    if (error) { $("estado-lista").textContent = "No se pudieron leer los estudios. Revisa tu conexión y vuelve a intentarlo."; return; }
    if (!data || !data.length) {
      $("estado-lista").textContent = propio
        ? "Todavía no tienes estudios. Crea uno, importa tus partidas en PGN o arma uno con tu repertorio."
        : "Todavía no te compartió ningún estudio.";
      return;
    }
    $("estado-lista").hidden = true;
    data.forEach((f) => {
      const b = el("button", "ficha");
      b.type = "button";
      b.dataset.id = f.id;
      const ic = el("span", "estado", "🔬"); ic.setAttribute("aria-hidden", "true");
      const info = el("span", "info");
      info.append(el("span", "nombre", f.titulo));
      const n = f.n_capitulos || 0;
      info.append(el("span", "detalle", (n === 1 ? "1 capítulo" : n + " capítulos")
        + " · " + (f.updated_at && f.updated_at !== f.created_at ? "cambiado el " + fecha(f.updated_at) : "creado el " + fecha(f.created_at))
        + (propio ? (f.compartido ? " · lo ve tu profe" : " · solo tú") : "")));
      if (f.descripcion) info.append(el("span", "cuando", f.descripcion));
      b.append(ic, info);
      b.addEventListener("click", () => abrir(f.id, true));
      lista.appendChild(b);
    });
  }

  async function crear(titulo, caps, descripcion) {
    const capitulos = caps.map((c) => ({ titulo: c.titulo, orientacion: c.orientacion, pgn: c.pgn }));
    const { data, error } = await sb.from("estudios").insert({ titulo, descripcion: descripcion || null, capitulos }).select("id").single();
    if (error) { Avisos.avisar(mensajeError(error), { tipo: "error" }); return null; }
    return data && data.id;
  }

  function mensajeError(error) {
    const m = String((error && error.message) || "");
    if (/100 estudios|forma que se espera/.test(m)) return m;
    if (/acceso/i.test(m) || /row-level security/i.test(m)) return "No se pudo guardar: revisa que tu acceso a la Academia esté al día.";
    return "No se pudo guardar. Revisa tu conexión y vuelve a intentarlo.";
  }

  async function nuevoEstudio() {
    const r = await Avisos.formulario({
      titulo: "Nuevo estudio",
      campos: [
        { nombre: "titulo", etiqueta: "Título", tipo: "text", max: 100, valor: "" },
        { nombre: "orientacion", etiqueta: "El primer capítulo, visto desde", tipo: "select", valor: "w", opciones: [["w", "Las blancas"], ["b", "Las negras"]] },
        { nombre: "fen", etiqueta: "Empieza en (FEN; vacío = la posición inicial)", tipo: "text", max: 100, valor: "" },
      ],
      aceptar: "Crear el estudio",
    });
    if (!r) return;
    const titulo = String(r.titulo || "").trim();
    if (!titulo) { Avisos.avisar("Ponle un título al estudio.", { tipo: "error" }); return; }
    const partida = partidaDesdeFen(r.fen);
    if (!partida) return;
    const id = await crear(titulo, [{ titulo: "Capítulo 1", orientacion: r.orientacion === "b" ? "b" : "w", pgn: E.escribir(partida) }]);
    if (id) abrir(id, true);
  }

  function partidaDesdeFen(fen) {
    const f = String(fen || "").trim().replace(/\s+/g, " ");
    if (!f) return E.vacio();
    let motivo = null;
    try { if (!new Chess().validate_fen(f).valid) motivo = "Esa posición no se pudo leer. Revisa que el FEN esté completo."; }
    catch (e) { motivo = "Esa posición no se pudo leer."; }
    if (!motivo && window.PosicionValida) motivo = PosicionValida.motivo(f);
    if (motivo) { Avisos.avisar(motivo, { tipo: "error" }); return null; }
    return E.vacio(new Chess(f).fen());
  }

  // Cada partida del PGN, un capítulo. Devuelve { caps, avisos } o un error.
  function capitulosDesdePgn(texto, desde) {
    const partidas = E.leer(texto);
    if (!partidas.length) return { error: "No se encontró ninguna partida en ese texto." };
    const avisos = [];
    const caps = partidas.slice(0, MAX_CAPITULOS).map((p, i) => {
      p.avisos.forEach((a) => avisos.push("Capítulo " + (desde + i + 1) + ": " + a));
      const et = p.etiquetas;
      const titulo = (et.White && et.Black && et.White !== "?" ? et.White + " – " + et.Black
        : et.Event && et.Event !== "?" ? et.Event : "Capítulo " + (desde + i + 1)).slice(0, 100);
      return { titulo, orientacion: "w", pgn: E.escribir(p), partida: p };
    });
    if (partidas.length > MAX_CAPITULOS) avisos.push("Un estudio llega hasta " + MAX_CAPITULOS + " capítulos: el resto no entró.");
    const grande = caps.find((c) => c.pgn.length > MAX_PGN);
    if (grande) return { error: "«" + grande.titulo + "» es demasiado largo para un capítulo." };
    return { caps, avisos };
  }

  async function importar(ev) {
    ev.preventDefault();
    const error = $("importar-error");
    error.textContent = "";
    const r = capitulosDesdePgn($("importar-pgn").value, 0);
    if (r.error) { error.textContent = r.error; return; }
    const titulo = ($("importar-titulo").value.trim() || (r.caps[0].partida.etiquetas.Event || "Partidas importadas")).slice(0, 100);
    const id = await crear(titulo, r.caps);
    if (!id) return;
    $("importar-pgn").value = ""; $("importar-titulo").value = "";
    if (r.avisos.length) Avisos.avisar(r.avisos.slice(0, 3).join(" "), { tipo: "info" });
    abrir(id, true);
  }

  async function traerRepertorio() {
    const { data, error } = await sb.from("repertorio").select("color, nombre, jugadas").eq("alumno_id", yo).order("created_at").range(0, 199);
    if (error) { Avisos.avisar("No se pudo leer tu repertorio. Vuelve a intentarlo.", { tipo: "error" }); return; }
    if (!data || !data.length) {
      Avisos.avisar("Tu repertorio está vacío. Lo armas en Aperturas y celadas → Mi repertorio, o desde un estudio con «Llevar a mi repertorio».", { tipo: "info" });
      return;
    }
    const caps = [];
    [["w", "Con blancas"], ["b", "Con negras"]].forEach(([color, titulo]) => {
      const lineas = data.filter((L) => L.color === color);
      if (!lineas.length) return;
      const p = E.vacio();
      lineas.forEach((L) => {
        const fin = E.agregarLinea(p.raiz, L.jugadas || []);
        if (fin !== p.raiz && fin.comentario.indexOf(L.nombre) < 0) fin.comentario = (fin.comentario ? fin.comentario + " · " : "") + L.nombre;
      });
      caps.push({ titulo, orientacion: color, pgn: E.escribir(p) });
    });
    const id = await crear("Mi repertorio", caps, "Hecho con las líneas de tu repertorio. Ábrelo para buscarle mejoras con el motor y agregarle variantes.");
    if (id) abrir(id, true);
  }

  // ===================================================================
  // Un estudio
  // ===================================================================
  async function abrir(id, empujar) {
    const { data, error } = await sb.from("estudios")
      .select("id, alumno_id, titulo, descripcion, compartido, capitulos, created_at, updated_at").eq("id", id).maybeSingle();
    if (error || !data) {
      Avisos.avisar(error ? "No se pudo abrir el estudio. Revisa tu conexión." : "Ese estudio no existe o no es tuyo.", { tipo: "error" });
      mostrarLista(true);
      return;
    }
    estudio = {
      id: data.id, alumno_id: data.alumno_id, titulo: data.titulo, descripcion: data.descripcion || "",
      compartido: !!data.compartido,
      caps: (Array.isArray(data.capitulos) ? data.capitulos : []).map((c) => ({ titulo: c.titulo, orientacion: c.orientacion === "b" ? "b" : "w", pgn: c.pgn || "", partida: null })),
    };
    propio = estudio.alumno_id === yo;
    if (!estudio.caps.length) estudio.caps.push({ titulo: "Capítulo 1", orientacion: "w", pgn: E.escribir(E.vacio()), partida: null });
    if (empujar) history.pushState({ id }, "", "mis-estudios.html?id=" + encodeURIComponent(id) + (alumno !== yo ? "&alumno=" + alumno : ""));
    $("vista-lista").classList.add("hidden");
    $("vista-estudio").classList.remove("hidden");
    document.title = estudio.titulo + " — Mis estudios — Ajedrez Integral";
    [...document.querySelectorAll("#acciones-estudio button, #acciones-estudio label, #acciones-capitulo, #barra-marcas, #escribir-form, #acciones-nodo, #nags")]
      .forEach((n) => { n.classList.toggle("hidden", !propio); });
    $("bajar-pgn").classList.remove("hidden");
    $("comentario").readOnly = !propio;
    $("compartir-estudio").checked = estudio.compartido;
    $("estado-guardado").textContent = propio ? "" : "Solo lectura: es el estudio de tu alumno.";
    pintarCabecera();
    elegirCapitulo(0);
    $("titulo-estudio").focus();
  }

  function pintarCabecera() {
    $("titulo-estudio").textContent = estudio.titulo;
    $("descripcion-estudio").textContent = estudio.descripcion;
    $("descripcion-estudio").hidden = !estudio.descripcion;
  }

  function cap() { return estudio.caps[capIdx]; }
  function partida() {
    const c = cap();
    if (!c.partida) {
      const leidas = E.leer(c.pgn);
      c.partida = leidas[0] || E.vacio();
      $("avisos-capitulo").textContent = c.partida.avisos.join(" ");
    }
    return c.partida;
  }

  function elegirCapitulo(i) {
    detenerMotor();
    capIdx = Math.max(0, Math.min(i, estudio.caps.length - 1));
    $("avisos-capitulo").textContent = "";
    const p = partida();
    nodoActual = p.raiz;
    seleccion = null;
    pintarCapitulos();
    pintarTodo();
  }

  function pintarCapitulos() {
    const ol = $("capitulos");
    ol.replaceChildren();
    estudio.caps.forEach((c, i) => {
      const li = el("li");
      const b = el("button", null, (i + 1) + ". " + c.titulo);
      b.type = "button";
      if (i === capIdx) b.setAttribute("aria-current", "true");
      b.addEventListener("click", () => elegirCapitulo(i));
      li.appendChild(b);
      ol.appendChild(li);
    });
    $("subir-capitulo").disabled = capIdx === 0;
    $("bajar-capitulo").disabled = capIdx >= estudio.caps.length - 1;
    $("borrar-capitulo").disabled = estudio.caps.length <= 1;
    $("nuevo-capitulo").disabled = estudio.caps.length >= MAX_CAPITULOS;
  }

  function pintarTodo() {
    pintarTablero();
    pintarArbol();
    pintarEdicion();
    if (motorEncendido) analizarActual();
  }

  // ---------- El tablero ----------
  function pintarTablero() {
    const tablero = $("tablero");
    const juego = nuevoJuego(nodoActual.fen);
    const blancasAbajo = cap().orientacion !== "b";
    const filas = blancasAbajo ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
    const cols = blancasAbajo ? "abcdefgh".split("") : "hgfedcba".split("");
    const marcas = {};
    nodoActual.casillas.forEach((m) => { marcas[m.slice(1)] = m[0]; });
    tablero.replaceChildren();
    filas.forEach((rank) => cols.forEach((f) => {
      const cas = f + rank;
      const b = el("button", "sq " + ((((cas.charCodeAt(0) - 97) + (rank - 1)) % 2 === 1) ? "light" : "dark"));
      b.type = "button";
      b.dataset.square = cas;
      const p = juego.get(cas);
      let etiqueta = cas + (p ? ", " + PIEZA_NOMBRE[p.type] + " " + (p.color === "w" ? (p.type === "q" || p.type === "r" ? "blanca" : "blanco") : (p.type === "q" || p.type === "r" ? "negra" : "negro")) : "");
      if (marcas[cas]) { b.classList.add("marca-" + marcas[cas]); etiqueta += ", marcada en " + ({ G: "verde", R: "rojo", Y: "amarillo", B: "azul" })[marcas[cas]]; }
      b.setAttribute("aria-label", etiqueta);
      if (p) {
        const s = el("span");
        if (window.PiezaPreferida) PiezaPreferida.pintar(s, p.type, p.color);
        else { s.className = p.color === "w" ? "piece-white" : "piece-black"; s.textContent = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" }[p.type]; }
        s.setAttribute("aria-hidden", "true");
        b.appendChild(s);
      }
      if (nodoActual.desde === cas || nodoActual.hasta === cas) b.classList.add("ultima");
      if (cas === seleccion || cas === desdeMarca) b.classList.add("selected");
      b.addEventListener("click", () => tocar(cas));
      tablero.appendChild(b);
    }));
    if (window.Coordenadas) Coordenadas.aplicar(tablero);
    pintarFlechas(blancasAbajo);
    const turno = juego.turn() === "w" ? "blancas" : "negras";
    $("turno").textContent = juego.in_checkmate() ? "Jaque mate." : juego.in_stalemate() ? "Ahogado: tablas."
      : (nodoActual.san ? "Última: " + numeroDe(nodoActual, true) + esp(nodoActual.san) + ". " : "") + "Juegan las " + turno + ".";
    const textos = nodoActual.casillas.map((m) => "casilla " + m.slice(1) + " (" + ({ G: "verde", R: "rojo", Y: "amarillo", B: "azul" })[m[0]] + ")")
      .concat(nodoActual.flechas.map((m) => "flecha de " + m.slice(1, 3) + " a " + m.slice(3, 5) + " (" + COLOR_NOMBRE[m[0]] + ")"));
    $("marcas-texto").textContent = textos.length ? "Marcas: " + textos.join(", ") + "." : "";
    $("ir-inicio").disabled = $("ir-atras").disabled = !nodoActual.padre;
    $("ir-adelante").disabled = $("ir-final").disabled = !nodoActual.hijos.length;
  }

  function centro(cas, blancasAbajo) {
    const x = cas.charCodeAt(0) - 97, y = parseInt(cas[1], 10) - 1;
    return blancasAbajo ? [x + 0.5, 7 - y + 0.5] : [7 - x + 0.5, y + 0.5];
  }
  function pintarFlechas(blancasAbajo) {
    const svg = $("flechas");
    const NS = "http://www.w3.org/2000/svg";
    svg.replaceChildren();
    const defs = document.createElementNS(NS, "defs");
    Object.keys(COLOR_TRAZO).forEach((k) => {
      const m = document.createElementNS(NS, "marker");
      m.setAttribute("id", "punta-" + k); m.setAttribute("viewBox", "0 0 10 10"); m.setAttribute("refX", "5"); m.setAttribute("refY", "5");
      m.setAttribute("markerWidth", "3"); m.setAttribute("markerHeight", "3"); m.setAttribute("orient", "auto-start-reverse");
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", "M0,0 L10,5 L0,10 z"); path.setAttribute("fill", COLOR_TRAZO[k]);
      m.appendChild(path); defs.appendChild(m);
    });
    svg.appendChild(defs);
    nodoActual.flechas.forEach((f) => {
      const [x1, y1] = centro(f.slice(1, 3), blancasAbajo), [x2, y2] = centro(f.slice(3, 5), blancasAbajo);
      const largo = Math.hypot(x2 - x1, y2 - y1) || 1;
      const l = document.createElementNS(NS, "line");
      l.setAttribute("x1", x1); l.setAttribute("y1", y1);
      l.setAttribute("x2", x2 - (x2 - x1) / largo * 0.35); l.setAttribute("y2", y2 - (y2 - y1) / largo * 0.35);
      l.setAttribute("stroke", COLOR_TRAZO[f[0]]); l.setAttribute("stroke-width", "0.16"); l.setAttribute("stroke-linecap", "round");
      l.setAttribute("opacity", "0.85"); l.setAttribute("marker-end", "url(#punta-" + f[0] + ")");
      svg.appendChild(l);
    });
  }

  function tocar(cas) {
    if (!propio) return;
    if (marcando) { marcar(cas); return; }
    const juego = nuevoJuego(nodoActual.fen);
    if (!seleccion) {
      const p = juego.get(cas);
      if (p && p.color === juego.turn()) { seleccion = cas; pintarTablero(); }
      return;
    }
    if (cas === seleccion) { seleccion = null; pintarTablero(); return; }
    const posibles = juego.moves({ square: seleccion, verbose: true }).filter((m) => m.to === cas);
    if (!posibles.length) {
      const p = juego.get(cas);
      seleccion = p && p.color === juego.turn() ? cas : null;
      pintarTablero();
      return;
    }
    const desde = seleccion;
    seleccion = null;
    if (posibles.some((m) => m.promotion) && window.Coronacion) {
      Coronacion.pedir(juego.turn(), (pieza) => { if (pieza) jugarYa({ from: desde, to: cas, promotion: pieza }); else pintarTablero(); });
      return;
    }
    jugarYa({ from: desde, to: cas, promotion: posibles[0].promotion });
  }

  function jugarYa(mov) {
    const antes = nodoActual.hijos.length;
    const h = E.jugar(nodoActual, mov);
    if (!h) return;
    nodoActual = h;
    if (nodoActual.padre.hijos.length !== antes) cambio();
    pintarTodo();
  }

  function marcar(cas) {
    const color = $("color-marca").value;
    if (!desdeMarca) { desdeMarca = cas; pintarTablero(); return; }
    const desde = desdeMarca;
    desdeMarca = null;
    if (desde === cas) {
      const i = nodoActual.casillas.findIndex((m) => m.slice(1) === cas);
      if (i >= 0 && nodoActual.casillas[i][0] === color) nodoActual.casillas.splice(i, 1);
      else { if (i >= 0) nodoActual.casillas.splice(i, 1); nodoActual.casillas.push(color + cas); }
    } else {
      const i = nodoActual.flechas.findIndex((m) => m.slice(1) === desde + cas);
      if (i >= 0 && nodoActual.flechas[i][0] === color) nodoActual.flechas.splice(i, 1);
      else { if (i >= 0) nodoActual.flechas.splice(i, 1); nodoActual.flechas.push(color + desde + cas); }
    }
    cambio();
    pintarTablero();
  }

  // ---------- Las jugadas ----------
  function numeroDe(n, siempre) {
    const ply = n.ply - 1;
    return ply % 2 === 0 ? (Math.floor(ply / 2) + 1) + ". " : (siempre ? (Math.floor(ply / 2) + 1) + "… " : "");
  }

  function botonJugada(n, conNumero) {
    const b = el("button", "jug");
    b.type = "button";
    b.dataset.id = n.id;
    const signos = n.nags.map((g) => E.NAG_SIGNO[g] || "").join("");
    b.textContent = numeroDe(n, conNumero) + esp(n.san) + signos;
    const dichos = n.nags.map((g) => E.NAG_NOMBRE[g]).filter(Boolean);
    if (dichos.length) b.setAttribute("aria-label", b.textContent + " (" + dichos.join(", ") + ")");
    if (n === nodoActual) b.setAttribute("aria-current", "true");
    b.addEventListener("click", () => irA(n));
    return b;
  }

  function pintarLinea(desde, cont, conNumero) {
    let x = desde, pedir = conNumero;
    while (x.hijos.length) {
      const [p, ...vs] = x.hijos;
      cont.appendChild(botonJugada(p, pedir));
      cont.appendChild(document.createTextNode(" "));
      pedir = false;
      if (p.comentario) { cont.appendChild(el("span", "com", p.comentario)); pedir = true; }
      vs.forEach((v) => {
        const div = el("div", "variante");
        div.appendChild(botonJugada(v, true));
        div.appendChild(document.createTextNode(" "));
        if (v.comentario) div.appendChild(el("span", "com", v.comentario));
        pintarLinea(v, div, !!v.comentario);
        cont.appendChild(div);
        pedir = true;
      });
      x = p;
    }
  }

  function pintarArbol() {
    const arbol = $("arbol");
    arbol.replaceChildren();
    const raiz = partida().raiz;
    if (raiz.comentario) arbol.appendChild(el("p", "com", raiz.comentario));
    if (!raiz.hijos.length) {
      arbol.appendChild(el("p", "sub", propio ? "Todavía no hay jugadas. Juégalas en el tablero o escríbelas." : "Este capítulo no tiene jugadas."));
      return;
    }
    const principal = el("div", "principal");
    pintarLinea(raiz, principal, raiz.ply % 2 === 1);
    arbol.appendChild(principal);
    const actual = arbol.querySelector('[aria-current="true"]');
    if (actual && actual.scrollIntoView) actual.scrollIntoView({ block: "nearest" });
  }

  function pintarEdicion() {
    const esRaiz = !nodoActual.padre;
    $("comentario-etiqueta").textContent = esRaiz ? "Comentario del capítulo (antes de la primera jugada)"
      : "Comentario después de " + numeroDe(nodoActual, true) + esp(nodoActual.san);
    $("comentario").value = nodoActual.comentario || "";
    const nags = $("nags");
    nags.replaceChildren();
    E.NAG_DE_JUGADA.slice(0, 6).forEach((g) => {
      const b = el("button", "bctrl", E.NAG_SIGNO[g]);
      b.type = "button";
      b.title = E.NAG_NOMBRE[g];
      b.setAttribute("aria-label", "Marcar como " + E.NAG_NOMBRE[g]);
      b.setAttribute("aria-pressed", nodoActual.nags.indexOf(g) >= 0 ? "true" : "false");
      b.disabled = esRaiz;
      b.addEventListener("click", () => { E.cambiarNag(nodoActual, g); cambio(); pintarArbol(); pintarEdicion(); });
      nags.appendChild(b);
    });
    $("hacer-principal").disabled = $("promover").disabled = esRaiz || !E.esVariante(nodoActual);
    $("borrar-desde").disabled = esRaiz;
    const p = partida();
    $("al-repertorio").disabled = esRaiz || p.raiz.fen !== E.INICIAL || nodoActual.ply < 2 || nodoActual.ply > 40;
    $("al-repertorio").title = p.raiz.fen !== E.INICIAL ? "Solo las líneas que empiezan en la posición inicial van al repertorio."
      : nodoActual.ply < 2 ? "Elige una jugada de la línea: va desde el principio hasta ahí." : "";
  }

  function irA(n) {
    if (!n) return;
    detenerMotor();
    nodoActual = n;
    seleccion = null; desdeMarca = null;
    $("escribir-error").textContent = "";
    pintarTodo();
  }

  // ===================================================================
  // Guardar: un momento después de cada cambio
  // ===================================================================
  let espera = null, guardando = false, otraVez = false;
  function cambio() {
    if (!propio) return;
    cap().pgn = null; // se vuelve a escribir al guardar
    $("estado-guardado").textContent = "Sin guardar…";
    clearTimeout(espera);
    espera = setTimeout(guardar, 1200);
  }

  async function guardar() {
    if (!propio || !estudio) return;
    if (guardando) { otraVez = true; return; }
    guardando = true;
    const capitulos = estudio.caps.map((c) => {
      if (c.pgn == null || c.partida) c.pgn = E.escribir(c.partida || E.vacio());
      return { titulo: c.titulo, orientacion: c.orientacion, pgn: c.pgn };
    });
    const largo = capitulos.find((c) => c.pgn.length > MAX_PGN);
    if (largo) {
      guardando = false;
      $("estado-guardado").textContent = "No se guardó: «" + largo.titulo + "» quedó demasiado largo. Pasa parte a otro capítulo.";
      return;
    }
    $("estado-guardado").textContent = "Guardando…";
    const { error } = await sb.from("estudios").update({
      titulo: estudio.titulo, descripcion: estudio.descripcion || null, compartido: estudio.compartido, capitulos,
    }).eq("id", estudio.id);
    guardando = false;
    $("estado-guardado").textContent = error ? mensajeError(error) : "Guardado.";
    if (otraVez) { otraVez = false; guardar(); }
  }

  window.addEventListener("beforeunload", (e) => {
    if (espera && $("estado-guardado").textContent === "Sin guardar…") { guardar(); e.preventDefault(); e.returnValue = ""; }
  });

  // ===================================================================
  // El motor
  // ===================================================================
  let motorEncendido = false, motorPedido = 0, trabajador = null;

  function puntaje(info, fen) {
    // Stockfish da el puntaje desde quien juega; acá va siempre desde las blancas.
    const signo = String(fen).split(" ")[1] === "b" ? -1 : 1;
    if (info.mate != null) return { mate: info.mate * signo };
    return { cp: (info.cp || 0) * signo };
  }
  function puntajeEnCp(s) {
    if (s.mate != null) return s.mate > 0 ? 10000 - s.mate : -10000 - s.mate;
    return s.cp;
  }
  function puntajeTexto(s) {
    if (s.mate != null) return s.mate === 0 ? "Mate" : (s.mate > 0 ? "Las blancas dan mate en " : "Las negras dan mate en ") + Math.abs(s.mate);
    const v = s.cp / 100;
    const n = (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1).replace(".", ",");
    const a = Math.abs(v);
    const quien = v > 0 ? "las blancas" : "las negras";
    return n + " (" + (a < 0.3 ? "igualado" : a < 1 ? quien + " están algo mejor" : a < 2.5 ? quien + " están mejor" : quien + " están ganando") + ")";
  }

  function pvASan(fen, pv) {
    const juego = nuevoJuego(fen);
    const san = [];
    for (const u of pv) {
      const m = juego.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      if (!m) break;
      san.push(m.san);
    }
    return san;
  }

  // Una búsqueda. alInfo recibe las líneas a medida que crecen.
  function analizar(fen, profundidad, multipv, alInfo) {
    if (!window.SharedEngine) return Promise.resolve(null);
    return SharedEngine.runTask(async () => {
      const w = await SharedEngine.ensureEngine();
      if (!w) return null;
      trabajador = w;
      return new Promise((resolver) => {
        const lineas = [];
        let listo = false;
        const terminar = () => { if (!listo) { listo = true; clearTimeout(reloj); SharedEngine.setMessageHandler(null); resolver(lineas.filter(Boolean)); } };
        const reloj = setTimeout(() => { try { w.postMessage("stop"); } catch (e) {} setTimeout(terminar, 1500); }, 30000);
        SharedEngine.setMessageHandler((ev) => {
          const l = typeof ev.data === "string" ? ev.data : "";
          if (l.indexOf("bestmove") === 0) { terminar(); return; }
          if (l.indexOf("info") !== 0 || l.indexOf(" pv ") < 0) return;
          const m = /\bmultipv (\d+)/.exec(l), d = /\bdepth (\d+)/.exec(l);
          const cp = /\bscore cp (-?\d+)/.exec(l), mt = /\bscore mate (-?\d+)/.exec(l);
          const pv = l.split(" pv ")[1].trim().split(/\s+/);
          const i = m ? parseInt(m[1], 10) - 1 : 0;
          lineas[i] = { profundidad: d ? parseInt(d[1], 10) : 0, puntaje: puntaje({ cp: cp ? parseInt(cp[1], 10) : null, mate: mt ? parseInt(mt[1], 10) : null }, fen), pv };
          if (alInfo) alInfo(lineas.filter(Boolean));
        });
        w.postMessage("setoption name MultiPV value " + multipv);
        w.postMessage("position fen " + fen);
        w.postMessage("go depth " + Math.min(profundidad, SharedEngine.PROFUNDIDAD_MAXIMA));
      });
    });
  }

  function detenerMotor() {
    motorPedido++;
    if (trabajador) { try { trabajador.postMessage("stop"); } catch (e) {} }
  }

  function analizarActual() {
    const pedido = ++motorPedido;
    const fen = nodoActual.fen;
    const juego = nuevoJuego(fen);
    if (juego.game_over()) {
      $("motor-eval").textContent = juego.in_checkmate() ? "Jaque mate: no hay nada que analizar." : "La partida terminó: no hay nada que analizar.";
      $("motor-lineas").replaceChildren();
      return;
    }
    $("motor-eval").textContent = "El motor está pensando…";
    $("motor-lineas").replaceChildren();
    analizar(fen, 20, 3, (lineas) => { if (pedido === motorPedido) pintarLineas(fen, lineas); })
      .then((lineas) => {
        if (pedido !== motorPedido) return;
        if (lineas == null) $("motor-eval").textContent = "No se pudo cargar el motor en este aparato.";
        else pintarLineas(fen, lineas, true);
      });
  }

  function pintarLineas(fen, lineas, fin) {
    if (!lineas.length) return;
    const mejor = lineas[0];
    $("motor-eval").textContent = puntajeTexto(mejor.puntaje) + " · profundidad " + mejor.profundidad + (fin ? "" : "…");
    const ol = $("motor-lineas");
    ol.replaceChildren();
    const ply0 = E.plyDe(fen);
    lineas.forEach((L) => {
      const san = pvASan(fen, L.pv).slice(0, 10);
      if (!san.length) return;
      const li = el("li");
      const texto = san.map((s, i) => {
        const ply = ply0 + i;
        return (ply % 2 === 0 ? (Math.floor(ply / 2) + 1) + ". " : i === 0 ? (Math.floor(ply / 2) + 1) + "… " : "") + esp(s);
      }).join(" ");
      li.append(el("span", null, puntajeTexto(L.puntaje).split(" (")[0] + ": " + texto + " "));
      if (propio) {
        const b = el("button", "bctrl", "➕ Agregar");
        b.type = "button";
        b.style.padding = ".2rem .5rem"; b.style.minHeight = "32px";
        b.setAttribute("aria-label", "Agregar la línea " + texto + " como variante");
        b.addEventListener("click", () => {
          const n = nodoActual;
          const fin = E.agregarLinea(n, san);
          if (fin !== n) { cambio(); pintarArbol(); Avisos.avisar("La línea del motor quedó como variante."); }
        });
        li.appendChild(b);
      }
      ol.appendChild(li);
    });
  }

  function alternarMotor() {
    motorEncendido = !motorEncendido;
    $("motor-boton").setAttribute("aria-pressed", motorEncendido ? "true" : "false");
    if (motorEncendido) analizarActual();
    else { detenerMotor(); $("motor-eval").textContent = ""; $("motor-lineas").replaceChildren(); }
  }

  // «Buscar mejoras»: la línea principal desde la jugada elegida (o desde el
  // principio), jugada a jugada. Donde la jugada pierde contra la mejor, se
  // marca y la del motor queda como variante.
  let revisando = false;
  async function revisar() {
    if (revisando) { revisando = false; detenerMotor(); return; }
    const p = partida();
    let desde = nodoActual;
    if (!desde.hijos.length) desde = p.raiz;
    const jugadas = [];
    for (let x = desde; x.hijos.length && jugadas.length < 80; x = x.hijos[0]) jugadas.push(x.hijos[0]);
    if (!jugadas.length) { $("revisar-estado").textContent = "No hay jugadas que revisar en esta línea."; return; }
    revisando = true;
    if (motorEncendido) alternarMotor();
    $("revisar-boton").textContent = "⏹ Parar la revisión";
    let antes = await analizar(desde.fen, 14, 1);
    let marcadas = 0, i = 0;
    for (const n of jugadas) {
      if (!revisando) break;
      i++;
      $("revisar-estado").textContent = "Revisando la jugada " + i + " de " + jugadas.length + "…";
      const despues = nuevoJuego(n.fen).game_over() ? [] : await analizar(n.fen, 14, 1);
      if (!antes || despues == null) { $("revisar-estado").textContent = "No se pudo cargar el motor en este aparato."; break; }
      const mejor = antes[0];
      if (mejor && mejor.pv.length) {
        const blancas = n.padre.fen.split(" ")[1] === "w";
        const valorAntes = puntajeEnCp(mejor.puntaje);
        const valorDespues = despues.length ? puntajeEnCp(despues[0].puntaje) : (nuevoJuego(n.fen).in_checkmate() ? (blancas ? 10000 : -10000) : 0);
        const pierde = Math.min(1000, (blancas ? valorAntes - valorDespues : valorDespues - valorAntes));
        const sanMejor = pvASan(n.padre.fen, mejor.pv);
        if (sanMejor.length && sanMejor[0] !== n.san && pierde >= 70) {
          const g = pierde >= 300 ? 4 : pierde >= 150 ? 2 : 6;
          if (!n.nags.some((x) => E.NAG_DE_JUGADA.indexOf(x) >= 0)) n.nags.push(g);
          const ya = n.padre.hijos.find((h) => h.san === sanMejor[0]);
          const fin = E.agregarLinea(n.padre, sanMejor.slice(0, 6));
          const primera = n.padre.hijos.find((h) => h.san === sanMejor[0]);
          if (!ya && primera && !primera.comentario) primera.comentario = "Mejora del motor: " + puntajeTexto(mejor.puntaje).split(" (")[0] + ".";
          if (fin) marcadas++;
        }
      }
      antes = despues;
    }
    const terminado = revisando;
    revisando = false;
    $("revisar-boton").textContent = "🧪 Buscar mejoras en la línea";
    if (marcadas) cambio();
    pintarArbol(); pintarEdicion();
    $("revisar-estado").textContent = (terminado ? "Listo. " : "Revisión parada. ")
      + (marcadas ? (marcadas === 1 ? "Una jugada se pudo mejorar" : marcadas + " jugadas se pudieron mejorar") + ": están marcadas y la mejora del motor quedó como variante."
        : "El motor no encontró jugadas que pierdan en lo que revisó.");
  }

  // ===================================================================
  // Lo que se hace con un capítulo, una jugada y el estudio
  // ===================================================================
  async function nuevoCapitulo() {
    if (estudio.caps.length >= MAX_CAPITULOS) return;
    const r = await Avisos.formulario({
      titulo: "Nuevo capítulo",
      campos: [
        { nombre: "titulo", etiqueta: "Título", tipo: "text", max: 100, valor: "Capítulo " + (estudio.caps.length + 1) },
        { nombre: "orientacion", etiqueta: "Visto desde", tipo: "select", valor: cap().orientacion, opciones: [["w", "Las blancas"], ["b", "Las negras"]] },
        { nombre: "fen", etiqueta: "Empieza en (FEN; vacío = la posición inicial)", tipo: "text", max: 100, valor: "" },
        { nombre: "pgn", etiqueta: "O pega una o varias partidas en PGN (cada una, un capítulo)", tipo: "textarea", max: MAX_PGN, valor: "" },
      ],
      aceptar: "Agregar",
    });
    if (!r) return;
    let nuevos;
    if (String(r.pgn || "").trim()) {
      const x = capitulosDesdePgn(r.pgn, estudio.caps.length);
      if (x.error) { Avisos.avisar(x.error, { tipo: "error" }); return; }
      nuevos = x.caps.slice(0, MAX_CAPITULOS - estudio.caps.length);
      nuevos.forEach((c, i) => { c.orientacion = r.orientacion === "b" ? "b" : "w"; if (i === 0 && r.titulo && x.caps.length === 1) c.titulo = String(r.titulo).trim().slice(0, 100) || c.titulo; });
      if (x.avisos.length) Avisos.avisar(x.avisos.slice(0, 3).join(" "), { tipo: "info" });
    } else {
      const p = partidaDesdeFen(r.fen);
      if (!p) return;
      nuevos = [{ titulo: String(r.titulo || "").trim().slice(0, 100) || "Capítulo " + (estudio.caps.length + 1), orientacion: r.orientacion === "b" ? "b" : "w", pgn: E.escribir(p), partida: p }];
    }
    estudio.caps.push(...nuevos);
    cambio();
    elegirCapitulo(estudio.caps.length - nuevos.length);
  }

  async function renombrarCapitulo() {
    const t = await Avisos.pedir("El nombre del capítulo.", { valor: cap().titulo, etiqueta: "Título", aceptar: "Cambiar" });
    if (t == null) return;
    const v = String(t).trim().slice(0, 100);
    if (!v) return;
    cap().titulo = v;
    cambio();
    pintarCapitulos();
  }

  function moverCapitulo(d) {
    const j = capIdx + d;
    if (j < 0 || j >= estudio.caps.length) return;
    const [c] = estudio.caps.splice(capIdx, 1);
    estudio.caps.splice(j, 0, c);
    capIdx = j;
    cambio();
    pintarCapitulos();
  }

  async function borrarCapitulo() {
    if (estudio.caps.length <= 1) return;
    const ok = await Avisos.confirmar("Se borran sus jugadas, variantes y comentarios.", { titulo: "¿Borrar «" + cap().titulo + "»?", aceptar: "Borrar el capítulo", peligro: true });
    if (!ok) return;
    estudio.caps.splice(capIdx, 1);
    cambio();
    elegirCapitulo(Math.min(capIdx, estudio.caps.length - 1));
  }

  async function borrarDesdeAqui() {
    if (!nodoActual.padre) return;
    const cuantas = 1 + E.contar(nodoActual);
    if (cuantas > 1) {
      const ok = await Avisos.confirmar("Se van " + cuantas + " jugadas: esta y todo lo que sigue.", { titulo: "¿Borrar desde " + numeroDe(nodoActual, true) + esp(nodoActual.san) + "?", aceptar: "Borrar", peligro: true });
      if (!ok) return;
    }
    nodoActual = E.borrarDesde(nodoActual);
    cambio();
    pintarTodo();
  }

  async function alRepertorio() {
    const jugadas = E.camino(nodoActual).map((n) => n.san);
    const color = cap().orientacion;
    const nombre = await Avisos.pedir("Va a «Mi repertorio», en Aperturas y celadas, y el entrenador te la va a pedir de memoria jugando con " + (color === "w" ? "blancas" : "negras") + ". Para cambiar el color, gira el tablero.",
      { valor: cap().titulo, etiqueta: "Nombre de la línea", aceptar: "Llevar al repertorio" });
    if (nombre == null) return;
    const nom = String(nombre).trim().slice(0, 80);
    if (!nom) { Avisos.avisar("Ponle un nombre a la línea.", { tipo: "error" }); return; }
    const { error } = await sb.from("repertorio").insert({ color, nombre: nom, jugadas });
    if (error) {
      const m = String(error.message || "");
      Avisos.avisar(/duplicate|unique|23505/i.test(m + error.code) ? "Esa línea ya está en tu repertorio."
        : /repertorio ya juega|100 líneas/.test(m) ? m : "No se pudo agregar al repertorio. Vuelve a intentarlo.", { tipo: "error" });
      return;
    }
    Avisos.avisar("«" + nom + "» quedó en tu repertorio.");
  }

  function bajarPgn() {
    const texto = estudio.caps.map((c) => {
      const p = c.partida || E.leer(c.pgn)[0] || E.vacio();
      p.etiquetas = Object.assign({}, p.etiquetas, { Event: estudio.titulo, ChapterName: c.titulo, Orientation: c.orientacion === "b" ? "black" : "white" });
      return E.escribir(p);
    }).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([texto], { type: "application/x-chess-pgn" }));
    a.download = (estudio.titulo.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "estudio") + ".pgn";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  async function renombrarEstudio() {
    const r = await Avisos.formulario({
      titulo: "El estudio",
      campos: [
        { nombre: "titulo", etiqueta: "Título", tipo: "text", max: 100, valor: estudio.titulo },
        { nombre: "descripcion", etiqueta: "Descripción", tipo: "textarea", max: 1000, valor: estudio.descripcion },
      ],
      aceptar: "Guardar",
    });
    if (!r) return;
    const t = String(r.titulo || "").trim().slice(0, 100);
    if (!t) { Avisos.avisar("El estudio necesita un título.", { tipo: "error" }); return; }
    estudio.titulo = t;
    estudio.descripcion = String(r.descripcion || "").trim().slice(0, 1000);
    pintarCabecera();
    cambio();
  }

  async function borrarEstudio() {
    const ok = await Avisos.confirmar("Se borran todos sus capítulos. No se puede deshacer.", { titulo: "¿Borrar «" + estudio.titulo + "»?", aceptar: "Borrar el estudio", peligro: true });
    if (!ok) return;
    clearTimeout(espera); espera = null;
    const { error } = await sb.from("estudios").delete().eq("id", estudio.id);
    if (error) { Avisos.avisar("No se pudo borrar. Vuelve a intentarlo.", { tipo: "error" }); return; }
    Avisos.avisar("El estudio se borró.");
    estudio = null;
    mostrarLista(true);
  }

  function escribirJugada(ev) {
    ev.preventDefault();
    const texto = $("escribir-jugada").value.trim();
    if (!texto) return;
    const juego = nuevoJuego(nodoActual.fen);
    const mv = window.ComandosTablero ? ComandosTablero.jugadaEscrita(juego, texto) : null;
    const antes = nodoActual.hijos.length;
    const h = mv ? E.jugar(nodoActual, { from: mv.from, to: mv.to, promotion: mv.promotion || undefined }) : E.jugar(nodoActual, texto);
    if (!h) { $("escribir-error").textContent = "«" + texto + "» no es una jugada legal en esta posición."; return; }
    $("escribir-jugada").value = "";
    $("escribir-error").textContent = "";
    nodoActual = h;
    if (antes !== h.padre.hijos.length) cambio();
    pintarTodo();
    $("escribir-jugada").focus();
  }

  function mostrarLista(empujar) {
    detenerMotor();
    if (empujar) history.pushState({}, "", "mis-estudios.html" + (alumno !== yo ? "?alumno=" + alumno : ""));
    $("vista-estudio").classList.add("hidden");
    $("vista-lista").classList.remove("hidden");
    document.title = "Mis estudios — Entreno — Ajedrez Integral";
    cargarLista();
    $("titulo-lista").focus();
  }

  function teclas(e) {
    if (!estudio || $("vista-estudio").classList.contains("hidden")) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); irA(nodoActual.padre); }
    else if (e.key === "ArrowRight") { e.preventDefault(); irA(nodoActual.hijos[0]); }
    else if (e.key === "Home") { e.preventDefault(); irA(partida().raiz); }
    else if (e.key === "End") { e.preventDefault(); let x = nodoActual; while (x.hijos.length) x = x.hijos[0]; irA(x); }
  }

  // ===================================================================
  // Arranque
  // ===================================================================
  async function nombreDe(id) {
    try {
      const { data } = await sb.from("profiles").select("full_name").eq("id", id).maybeSingle();
      return (data && data.full_name) || "tu alumno";
    } catch (e) { return "tu alumno"; }
  }

  async function iniciar() {
    $("gate").classList.add("hidden");
    $("app").classList.remove("hidden");
    const pedido = params.get("alumno");
    alumno = pedido && ES_ID.test(pedido) ? pedido : yo;
    propio = alumno === yo;
    if (!propio) {
      const nombre = await nombreDe(alumno);
      $("titulo-lista").textContent = "Los estudios de " + nombre;
      $("intro-lista").textContent = "Los estudios que " + nombre + " decidió compartir contigo, en solo lectura. Puedes recorrerlos y analizarlos con el motor.";
      $("acciones-lista").classList.add("hidden");
      $("importar").classList.add("hidden");
    }
    $("nuevo-estudio").addEventListener("click", nuevoEstudio);
    $("traer-repertorio").addEventListener("click", traerRepertorio);
    $("importar-form").addEventListener("submit", importar);
    $("importar-archivo").addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (f.size > 2000000) { $("importar-error").textContent = "Ese archivo es muy grande (hasta 2 MB)."; return; }
      $("importar-pgn").value = await f.text();
      if (!$("importar-titulo").value) $("importar-titulo").value = f.name.replace(/\.pgn$/i, "").slice(0, 100);
    });
    $("volver-lista").addEventListener("click", (e) => { e.preventDefault(); guardar(); mostrarLista(true); });
    $("ir-inicio").addEventListener("click", () => irA(partida().raiz));
    $("ir-atras").addEventListener("click", () => irA(nodoActual.padre));
    $("ir-adelante").addEventListener("click", () => irA(nodoActual.hijos[0]));
    $("ir-final").addEventListener("click", () => { let x = nodoActual; while (x.hijos.length) x = x.hijos[0]; irA(x); });
    $("girar").addEventListener("click", () => { cap().orientacion = cap().orientacion === "b" ? "w" : "b"; if (propio) cambio(); pintarTablero(); });
    $("escribir-form").addEventListener("submit", escribirJugada);
    $("modo-marcar").addEventListener("click", () => {
      marcando = !marcando; desdeMarca = null; seleccion = null;
      $("modo-marcar").setAttribute("aria-pressed", marcando ? "true" : "false");
      Avisos.avisar(marcando ? "Marcar: toca una casilla dos veces para marcarla, o dos casillas distintas para una flecha." : "Listo: el tablero vuelve a jugar.", { tipo: "info" });
      pintarTablero();
    });
    $("borrar-marcas").addEventListener("click", () => { nodoActual.casillas = []; nodoActual.flechas = []; cambio(); pintarTablero(); });
    $("comentario").addEventListener("input", () => { nodoActual.comentario = $("comentario").value.slice(0, 2000); cambio(); });
    $("comentario").addEventListener("change", () => pintarArbol());
    $("hacer-principal").addEventListener("click", () => { if (E.hacerPrincipal(nodoActual)) { cambio(); pintarArbol(); pintarEdicion(); } });
    $("promover").addEventListener("click", () => { if (E.promover(nodoActual)) { cambio(); pintarArbol(); pintarEdicion(); } });
    $("borrar-desde").addEventListener("click", borrarDesdeAqui);
    $("al-repertorio").addEventListener("click", alRepertorio);
    $("nuevo-capitulo").addEventListener("click", nuevoCapitulo);
    $("renombrar-capitulo").addEventListener("click", renombrarCapitulo);
    $("subir-capitulo").addEventListener("click", () => moverCapitulo(-1));
    $("bajar-capitulo").addEventListener("click", () => moverCapitulo(1));
    $("borrar-capitulo").addEventListener("click", borrarCapitulo);
    $("renombrar-estudio").addEventListener("click", renombrarEstudio);
    $("compartir-estudio").addEventListener("change", () => { estudio.compartido = $("compartir-estudio").checked; cambio(); });
    $("bajar-pgn").addEventListener("click", bajarPgn);
    $("borrar-estudio").addEventListener("click", borrarEstudio);
    $("motor-boton").addEventListener("click", alternarMotor);
    $("revisar-boton").addEventListener("click", revisar);
    document.addEventListener("keydown", teclas);
    window.addEventListener("popstate", () => {
      const id = new URLSearchParams(location.search).get("id");
      if (id && ES_ID.test(id)) abrir(id, false); else mostrarLista(false);
    });
    const id = params.get("id");
    if (id && ES_ID.test(id)) abrir(id, false);
    else cargarLista();
  }

  async function arrancar() {
    let sesion = null;
    try { const { data } = await sb.auth.getSession(); sesion = data && data.session; } catch (e) { sesion = null; }
    if (!sesion) {
      $("gate-checking").textContent = "Necesitas iniciar sesión para ver tus estudios. Redirigiendo a iniciar sesión…";
      location.href = "../login.html?next=" + encodeURIComponent("entreno/mis-estudios.html" + location.search);
      return;
    }
    yo = sesion.user.id;
    iniciar();
  }

  arrancar();
})();
