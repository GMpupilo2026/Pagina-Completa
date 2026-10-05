/* El código de entreno/aperturas.html.

   Vivía escrito dentro de la página, en un <script> de 20 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* Entrenador de aperturas y celadas con repetición espaciada.
 *
 * El alumno juega la línea EN EL TABLERO, de memoria: el entrenador mueve por
 * el rival y él tiene que dar todas las jugadas de su color. Al terminar, la
 * línea se programa para más adelante según cómo le fue (js/repaso-espaciado.js).
 *
 * LA NOTA LA PONE LA PÁGINA, NO EL ALUMNO. Los SRS suelen preguntar "¿qué tal
 * te salió?", y con chicos eso no mide nada: el que quiere terminar rápido
 * aprieta "bien" siempre y el inseguro aprieta "mal" aunque le haya salido.
 * Acá la nota sale de lo que de verdad pasó — cuántas veces se equivocó y
 * cuántas pidió ver la jugada—, que es un dato que no se puede maquillar.
 *
 * El progreso se guarda en localStorage y js/progreso-usuario.js lo espeja en
 * la cuenta (claves aperturas_srs_v1 y aperturas_vistas_v1, declaradas en su
 * lista CLAVES), así que se puede estudiar en la compu y seguir en el celular.
 * Cada línea terminada también se registra en training_progress ("aperturas",
 * ver js/entreno-progress.js), que ya tiene esa actividad en su CHECK: es lo
 * que hace que repasar una línea acá cuente para la racha de días de
 * logros.html.
 */
const CLAVE_SRS = "aperturas_srs_v1";
const CLAVE_VISTAS = "aperturas_vistas_v1";
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const GLYPH = {
  w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
  b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
};
// Las jugadas se guardan en inglés porque es lo que entiende chess.js, y se
// enseñan en algebraica española (o en palabras, para quien no ve): lo decide
// ComandosTablero.jugadaParaMostrar, la misma en todo el sitio.
const NIVELES = { 1: "Principiante", 2: "Intermedio", 3: "Avanzado" };
const TIPOS = { celada: "Celada", apertura: "Apertura" };

function aEspanol(san) { return ComandosTablero.jugadaParaMostrar(san); }

let estado = {};          // id → ficha de repaso
/* «Mi repertorio» (js/repertorio-aperturas.js): las líneas del alumno, con id
   «mi:<uuid>», entrenadas igual que las del banco y en la misma cola de
   repaso. `modo` dice qué se está mirando: el repaso, todas o lo suyo. */
let mias = [];
let repertorio = null;
let modo = "repaso";
function todas() { return AperturasLineas.LINEAS.concat(mias); }
let cola = [];            // los ids que toca repasar, en orden
let linea = null, juego = null, indice = 0;
let errores = 0, pistas = 0;
let seleccion = null, promoPendiente = null, esperandoRival = false;

/* ---------------- guardar y leer ---------------- */
function leerEstado() {
  try { const v = JSON.parse(localStorage.getItem(CLAVE_SRS) || "{}"); return v && typeof v === "object" ? v : {}; }
  catch (e) { return {}; }
}
function guardarEstado() {
  try { localStorage.setItem(CLAVE_SRS, JSON.stringify(estado)); } catch (e) {}
}
function sumarVista() {
  try {
    const n = Number(localStorage.getItem(CLAVE_VISTAS) || 0) || 0;
    localStorage.setItem(CLAVE_VISTAS, String(n + 1));
  } catch (e) {}
}

/* ---------------- qué se está mirando ---------------- */
function lineasFiltradas() {
  const tipo = document.getElementById("f-tipo").value;
  const nivel = document.getElementById("f-nivel").value;
  return AperturasLineas.LINEAS.filter((L) =>
    (!tipo || L.tipo === tipo) && (!nivel || String(L.nivel) === nivel));
}

function pintarResumen() {
  const ids = AperturasLineas.LINEAS.map((L) => L.id);
  const r = RepasoEspaciado.resumen(ids, estado);
  const caja = document.getElementById("resumen");
  caja.innerHTML = "";
  // Cuatro tarjetas y no cinco: en un celular son dos filas de dos, sin que
  // quede una huérfana abajo. El total va en la bajada de la página.
  [[r.pendientes, "para hoy"], [r.nuevas, "sin empezar"],
   [r.aprendiendo, "aprendiendo"], [r.firmes, "firmes"]]
    .forEach(([n, etiqueta]) => {
      const d = document.createElement("div");
      const b = document.createElement("b"); b.textContent = String(n);
      const s = document.createElement("span"); s.textContent = etiqueta;
      d.append(b, s); caja.appendChild(d);
    });
  document.getElementById("sub-total").textContent =
    `${r.total} líneas para memorizar jugándolas. Lo que te sale bien vuelve más tarde cada vez; lo que fallas, vuelve hoy.`;
}

function cuandoTexto(ficha) {
  if (!ficha || !ficha.ultimo) return "sin empezar";
  const hoy = RepasoEspaciado.hoy();
  if (ficha.vence <= hoy) return "toca hoy";
  const dias = Math.round((Date.parse(ficha.vence) - Date.parse(hoy)) / 86400000);
  if (dias === 1) return "mañana";
  if (dias < 30) return "en " + dias + " días";
  return "en " + Math.round(dias / 30) + (Math.round(dias / 30) === 1 ? " mes" : " meses");
}

function pintarLista(soloPendientes) {
  const caja = document.getElementById("lista");
  caja.innerHTML = "";
  let lista = lineasFiltradas();
  if (soloPendientes) {
    const ids = new Set(RepasoEspaciado.pendientes(lista.map((L) => L.id), estado));
    lista = lista.filter((L) => ids.has(L.id));
    // El orden del repaso no es el del banco: primero lo más atrasado.
    const orden = RepasoEspaciado.pendientes(lista.map((L) => L.id), estado);
    lista.sort((a, b) => orden.indexOf(a.id) - orden.indexOf(b.id));
  }
  const vacia = document.getElementById("lista-vacia");
  vacia.classList.toggle("hidden", lista.length > 0);
  if (!lista.length) {
    vacia.textContent = soloPendientes
      ? "Por hoy no te toca repasar nada de este grupo. Puedes ver todas y estudiar alguna nueva."
      : "No hay líneas con ese filtro.";
    return;
  }
  lista.forEach((L) => {
    const f = estado[L.id];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ficha";
    const marca = document.createElement("span");
    marca.className = "estado";
    marca.setAttribute("aria-hidden", "true");
    marca.textContent = !f || !f.ultimo ? "•" : (f.intervalo >= 21 ? "✅" : (f.vence <= RepasoEspaciado.hoy() ? "🔁" : "🕑"));
    const info = document.createElement("span");
    info.className = "info";
    const n = document.createElement("span"); n.className = "nombre"; n.textContent = L.nombre;
    const d = document.createElement("span"); d.className = "detalle";
    d.textContent = `${TIPOS[L.tipo]} · ${L.apertura} · ${NIVELES[L.nivel]} · juegas con ${L.color === "w" ? "blancas" : "negras"}`;
    info.append(n, d);   // los dos son bloque: el <br> abría un renglón vacío
    const cuando = document.createElement("span");
    cuando.className = "cuando";
    cuando.textContent = cuandoTexto(f);
    btn.append(marca, info, cuando);
    btn.setAttribute("aria-label", `${L.nombre}. ${d.textContent}. ${cuando.textContent}.`);
    btn.addEventListener("click", () => empezar(L.id));
    caja.appendChild(btn);
  });
}

/* ---------------- el tablero ---------------- */
function esClara(casilla) {
  return ((casilla.charCodeAt(0) - 97) + (parseInt(casilla[1], 10) - 1)) % 2 === 1;
}

function dibujar() {
  const board = document.getElementById("board");
  board.innerHTML = "";
  // Se pinta desde el lado del alumno: quien juega con negras ve su lado abajo.
  const filas = linea.color === "w" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const cols = linea.color === "w" ? FILES : FILES.slice().reverse();
  filas.forEach((rank) => {
    cols.forEach((f) => {
      const casilla = f + rank;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sq " + (esClara(casilla) ? "light" : "dark");
      btn.dataset.square = casilla;
      const pieza = juego.get(casilla);
      if (pieza) {
        const span = document.createElement("span");
        if (window.PiezaPreferida) PiezaPreferida.pintar(span, pieza.type, pieza.color);
        else {
          span.className = pieza.color === "w" ? "piece-white" : "piece-black";
          span.textContent = GLYPH[pieza.color][pieza.type];
        }
        span.setAttribute("aria-hidden", "true");
        btn.appendChild(span);
      }
      // Qué dice cada casilla lo escribe js/tablero-accesible.js: acá solo el
      // estado. Antes no decían NADA, ni siquiera su nombre.
      if (casilla === seleccion) { btn.classList.add("selected"); btn.dataset.estado = "seleccionada"; }
      btn.addEventListener("click", () => tocar(casilla));
      board.appendChild(btn);
    });
  });
  if (window.Coordenadas) Coordenadas.aplicar(board);
  montarTeclado();
  montarComandos();
}

/* ---------------- El teclado y el recuadro (Modo Adaptado) ----------------
 * Memorizar una línea de memoria es justo lo que se puede hacer sin ver el
 * tablero —son jugadas, no dibujos— y era la única página de Entrenamiento
 * donde no había forma de intentarlo. */
let teclado = null;
function montarTeclado() {
  if (teclado || !window.TableroAccesible) return;
  teclado = TableroAccesible.montar(document.getElementById("board"), {
    nombre: "Tablero de la línea",
    juego: () => juego,
  });
}

let comandos = null;
function montarComandos() {
  if (comandos || !window.CuadroComandos) return;
  comandos = CuadroComandos.montar(document.getElementById("q-comandos"), {
    etiqueta: "Escribe tu jugada, o una pregunta sobre la posición",
    juego: () => juego,
    tablero: () => teclado,
    onEnviar: jugarEscribiendo,
  });
  comandos.ayuda('Jugada: "Cf3", "Dxh7+", "e2 e4". Pregunta: "caballos", "qué hay en e4". Escribe "ayuda" para todo.');
}

function jugarEscribiendo(texto, api) {
  /* «pista» escrita: el botón se llama «Enséñame la jugada», y quien no ve
     escribe «pista» como en el resto de Entrenamiento. */
  if (/^(pista|dame una pista|ensename la jugada|ensename)$/.test(CuadroComandos.normalizar(texto))) {
    api.limpiar();
    if (!meToca() || esperandoRival) { api.decir("Ahora no te toca mover."); return; }
    pista();
    return;
  }
  if (esperandoRival || promoPendiente || indice >= linea.jugadas.length || !meToca()) {
    api.decir("Ahora no te toca mover.");
    return;
  }
  // El intérprete busca la jugada entre las LEGALES y no toca la partida: quien
  // decide si es la de la línea es intentar(), la misma puerta que el clic.
  const mv = ComandosTablero.jugadaEscrita(juego, texto);
  // No se entendió, o no es legal: js/comandos-tablero.js dice cuál de las dos.
  if (!mv) { api.decir(ComandosTablero.noSePudoJugar(texto)); return; }
  api.limpiar().decir("");
  intentar({ from: mv.from, to: mv.to, promotion: mv.promotion });
}

function marcarMal(casilla) {
  const c = document.querySelector('[data-square="' + casilla + '"]');
  if (!c) return;
  c.classList.add("wrong-flash");
  setTimeout(() => c.classList.remove("wrong-flash"), 350);
}

function decir(texto, clase) {
  const e = document.getElementById("round-status");
  e.textContent = texto;
  e.className = "round-status" + (clase ? " " + clase : "");
  // El mismo aviso, repetido en el recuadro: quien contesta escribiendo tiene el
  // foco ahí y el renglón del tablero le queda lejos.
  if (comandos) comandos.decir(texto);
}

function pintarJugadas() {
  const caja = document.getElementById("jugadas-hechas");
  caja.innerHTML = "";
  // Vacío se vería como una caja rota: no se enseña hasta que hay jugadas.
  caja.classList.toggle("hidden", indice === 0);
  for (let i = 0; i < indice; i++) {
    if (i % 2 === 0) {
      const n = document.createElement("span");
      n.className = "num";
      n.textContent = (i / 2 + 1) + ". ";
      caja.appendChild(n);
    }
    const s = document.createElement("span");
    const esMia = (linea.color === "w") === (i % 2 === 0);
    if (esMia) s.className = "mia";
    s.textContent = aEspanol(linea.jugadas[i]) + " ";
    caja.appendChild(s);
  }
}

function meToca() {
  return indice < linea.jugadas.length && (linea.color === "w") === (indice % 2 === 0);
}

function actualizarBanner() {
  const b = document.getElementById("turn-banner");
  if (indice >= linea.jugadas.length) { b.textContent = "Línea completa."; return; }
  b.textContent = meToca()
    ? "Te toca a ti — juegas con " + (linea.color === "w" ? "blancas" : "negras")
    : "Juega el rival…";
}

// El rival mueve solo, con una pausa para que se vea qué hizo.
function jugarRival() {
  if (meToca() || indice >= linea.jugadas.length) { actualizarBanner(); return; }
  esperandoRival = true;
  actualizarBanner();
  setTimeout(() => {
    const hecha = juego.move(linea.jugadas[indice], { sloppy: true });
    indice += 1;
    esperandoRival = false;
    seleccion = null;
    dibujar();
    pintarJugadas();
    /* QUÉ JUGÓ EL RIVAL, DICHO. La lista de jugadas se repinta, pero no es una
       región viva: quien no ve la pantalla oía "juega el rival…" y después "te
       toca a ti", sin enterarse nunca de qué se había jugado — o sea sin poder
       seguir la línea, que es el ejercicio entero. No daba ningún error.
       Se dice con el nombre de la pieza y las columnas habladas
       (js/blind-notation.js), no deletreando "Cf3". */
    if (hecha && comandos) {
      const dicha = window.BlindNotation ? BlindNotation.sanSpoken(hecha.san) : aEspanol(hecha.san);
      comandos.decir("El rival juega " + dicha + ".");
    }
    if (indice >= linea.jugadas.length) terminar();
    else actualizarBanner();
  }, 550);
}

function tocar(casilla) {
  if (esperandoRival || promoPendiente || indice >= linea.jugadas.length || !meToca()) return;
  if (!seleccion) {
    const p = juego.get(casilla);
    if (!p || p.color !== juego.turn()) return;
    seleccion = casilla;
    dibujar();
    return;
  }
  if (casilla === seleccion) { seleccion = null; dibujar(); return; }

  const posibles = juego.moves({ square: seleccion, verbose: true }).filter((m) => m.to === casilla);
  if (!posibles.length) {
    // Puede que esté eligiendo otra pieza suya.
    const p = juego.get(casilla);
    if (p && p.color === juego.turn()) { seleccion = casilla; dibujar(); return; }
    marcarMal(casilla);
    return;
  }
  if (posibles.length > 1 && posibles[0].promotion) {
    // Coronar: se pregunta en qué pieza. Importa — hay celadas que solo
    // funcionan coronando caballo.
    promoPendiente = { from: seleccion, to: casilla };
    document.getElementById("promo").classList.remove("hidden");
    return;
  }
  intentar({ from: seleccion, to: casilla, promotion: posibles[0].promotion });
}

function intentar(jugada) {
  const esperada = linea.jugadas[indice];
  const hecha = juego.move(jugada);
  if (!hecha) { marcarMal(jugada.to); return; }
  if (hecha.san !== esperada) {
    // Es legal pero no es la de la línea: se deshace y se avisa.
    juego.undo();
    errores += 1;
    seleccion = null;
    marcarMal(jugada.to);
    // «Respuesta incorrecta» y no «no es legal»: la jugada se pudo hacer. En
    // Modo Adaptado, en palabras.
    const dicha = CuadroComandos.activo() && window.BlindNotation ? BlindNotation.sanSpoken(hecha.san) : aEspanol(hecha.san);
    decir(ComandosTablero.incorrecta(dicha, "No es la jugada de esta línea: vuelve a intentarlo."), "bad");
    dibujar();
    return;
  }
  indice += 1;
  seleccion = null;
  decir("", "");
  dibujar();
  pintarJugadas();
  if (indice >= linea.jugadas.length) terminar();
  else jugarRival();
}

/* ---------------- empezar, pista, terminar ---------------- */
function empezar(id) {
  linea = todas().find((L) => L.id === id);
  if (!linea) return;
  juego = new Chess();
  indice = 0; errores = 0; pistas = 0;
  seleccion = null; promoPendiente = null; esperandoRival = false;

  document.getElementById("linea-nombre").textContent = linea.nombre;
  document.getElementById("linea-apertura").textContent = linea.propia
    ? `Mi repertorio · juegas con ${linea.color === "w" ? "blancas" : "negras"}`
    : `${TIPOS[linea.tipo]} · ${linea.apertura} · ${NIVELES[linea.nivel]}`;
  document.getElementById("final").classList.add("hidden");
  document.getElementById("promo").classList.add("hidden");
  document.getElementById("pista-btn").disabled = false;
  decir("", "");
  dibujar();
  pintarJugadas();
  mostrar("vista-tablero");
  window.scrollTo({ top: 0 });
  if (!meToca()) jugarRival(); else actualizarBanner();
}

function pista() {
  if (!meToca() || indice >= linea.jugadas.length) return;
  pistas += 1;
  const esperada = linea.jugadas[indice];
  /* En Modo Adaptado se contesta escribiendo, y la jugada se dice en palabras:
     «Hazla en el tablero» mandaba a quien no ve a un tablero que no usa. */
  const adaptado = document.documentElement.classList.contains("adaptive-mode");
  decir(adaptado
    ? "La jugada es " + (window.BlindNotation && BlindNotation.sanSpoken ? BlindNotation.sanSpoken(esperada) : aEspanol(esperada)) + ". Escríbela en el recuadro."
    : "La jugada es " + aEspanol(esperada) + ". Hazla en el tablero.", "");
  // Se marca de dónde sale, que es la mitad del trabajo de encontrarla.
  const prueba = new Chess(juego.fen());
  const m = prueba.move(esperada, { sloppy: true });
  if (m) {
    const c = document.querySelector('[data-square="' + m.from + '"]');
    if (c) c.classList.add("selected");
  }
}

// La nota sale de lo que pasó, no de lo que el alumno diga que pasó.
function notaDe() {
  if (errores === 0 && pistas === 0) return "bien";
  if (pistas >= 2 || errores >= 3) return "mal";
  return "regular";
}

const EXPLICACION = {
  bien: "Te salió entera y sin ayuda. ",
  regular: "Te salió, pero con alguna ayuda. ",
  mal: "Esta todavía no está. ",
};

function terminar() {
  const nota = notaDe();
  estado[linea.id] = RepasoEspaciado.calificar(estado[linea.id], nota);
  guardarEstado();
  sumarVista();
  if (window.EntrenoProgress) EntrenoProgress.log("aperturas", { linea_id: linea.id, nota: nota });

  document.getElementById("turn-banner").textContent = "Línea completa.";
  decir("", "");
  document.getElementById("pista-btn").disabled = true;

  const f = estado[linea.id];
  document.getElementById("final-nota").textContent =
    (nota === "bien" ? "✅ " : nota === "regular" ? "🟡 " : "🔁 ") + EXPLICACION[nota];
  document.getElementById("final-idea").textContent = linea.idea;
  document.getElementById("final-clave").textContent = linea.clave;
  document.getElementById("final-clave").classList.toggle("hidden", !linea.clave);
  document.getElementById("final-cuando").textContent = f.intervalo === 0
    ? "Vuelve a aparecer hoy mismo."
    : "Vuelve a aparecer " + (f.intervalo === 1 ? "mañana." : "en " + f.intervalo + " días.");
  document.getElementById("final").classList.remove("hidden");
  pintarResumen();
  if (repertorio) repertorio.pintar();
}

function siguiente() {
  // La cola se recalcula: si la línea se falló, vuelve a estar en ella. Una
  // línea del repertorio sigue con las del repertorio.
  const lista = (linea.propia ? mias : lineasFiltradas()).map((L) => L.id);
  cola = RepasoEspaciado.pendientes(lista, estado).filter((id) => id !== linea.id);
  if (cola.length) { empezar(cola[0]); return; }
  if (linea.propia) { elegirModo("mio"); return; }
  mostrar("vista-lista");
  pintarLista(true);
  pintarResumen();
}

/* ---------------- ir y venir ---------------- */
function mostrar(cual) {
  document.getElementById("vista-lista").classList.toggle("hidden", cual !== "vista-lista");
  document.getElementById("vista-mio").classList.toggle("hidden", cual !== "vista-mio");
  document.getElementById("barra-modos").classList.toggle("hidden", cual === "vista-tablero");
  document.getElementById("vista-tablero").classList.toggle("hidden", cual !== "vista-tablero");
  // Con el tablero abierto, el resumen de arriba no aporta nada y en un celular
  // empuja el tablero fuera de la pantalla.
  document.getElementById("resumen").classList.toggle("hidden", cual !== "vista-lista");
}

/* Tres modos, una barra: el repaso del banco, todo el banco y lo suyo. Cada
   botón dice si está elegido (aria-pressed), no solo con el color. */
function elegirModo(m) {
  modo = m;
  [["btn-repaso", "repaso"], ["btn-todas", "todas"], ["btn-mio", "mio"]].forEach(([id, cual]) => {
    const b = document.getElementById(id);
    b.classList.toggle("active", m === cual);
    b.setAttribute("aria-pressed", m === cual ? "true" : "false");
  });
  if (m === "mio") {
    mostrar("vista-mio");
    if (repertorio) repertorio.pintar();
    return;
  }
  mostrar("vista-lista");
  pintarLista(m === "repaso");
  pintarResumen();
}
document.getElementById("btn-repaso").addEventListener("click", () => elegirModo("repaso"));
document.getElementById("btn-todas").addEventListener("click", () => elegirModo("todas"));
document.getElementById("btn-mio").addEventListener("click", () => elegirModo("mio"));
document.getElementById("f-tipo").addEventListener("change", () =>
  pintarLista(document.getElementById("btn-repaso").classList.contains("active")));
document.getElementById("f-nivel").addEventListener("change", () =>
  pintarLista(document.getElementById("btn-repaso").classList.contains("active")));
document.getElementById("volver-btn").addEventListener("click", () => {
  if (linea && linea.propia) { elegirModo("mio"); document.getElementById("mio-titulo").focus(); return; }
  mostrar("vista-lista");
  pintarLista(document.getElementById("btn-repaso").classList.contains("active"));
  pintarResumen();
  // El botón se escondió con el tablero: el foco va al título de la lista, no al <body>.
  document.getElementById("lista-titulo").focus();
});
document.getElementById("pista-btn").addEventListener("click", pista);
document.getElementById("reiniciar-btn").addEventListener("click", () => empezar(linea.id));
document.getElementById("siguiente-btn").addEventListener("click", siguiente);
document.getElementById("repetir-btn").addEventListener("click", () => empezar(linea.id));
document.querySelectorAll(".promo-btn").forEach((b) => b.addEventListener("click", () => {
  if (!promoPendiente) return;
  const jugada = Object.assign({ promotion: b.dataset.pieza }, promoPendiente);
  promoPendiente = null;
  document.getElementById("promo").classList.add("hidden");
  intentar(jugada);
}));

/* ---------------- Mi repertorio ---------------- */
async function cargarRepertorio() {
  if (!window.RepertorioAperturas) return;
  let filas = [];
  try {
    const { data: ses } = await sb.auth.getSession();
    const yo = ses && ses.session ? ses.session.user.id : null;
    const { data, error } = await sb.from("repertorio").select("id, color, nombre, jugadas, created_at")
      .eq("alumno_id", yo).order("created_at", { ascending: true });
    if (error) throw error;
    filas = data || [];
  } catch (e) {
    document.getElementById("repertorio").textContent = "No se pudo cargar tu repertorio. Vuelve a intentarlo en un rato.";
    return;
  }
  repertorio = RepertorioAperturas.montar(document.getElementById("repertorio"), {
    sb, filas, banco: AperturasLineas.LINEAS,
    cuando: (id) => cuandoTexto(estado[id]),
    entrenar: (id) => empezar(id),
    avisar: (texto, tipo) => (window.Avisos ? Avisos.avisar(texto, { tipo: tipo || "ok" }) : decir(texto, tipo === "error" ? "bad" : "")),
    confirmar: (texto, op) => (window.Avisos ? Avisos.confirmar(texto, op) : Promise.resolve(false)),
    alCambiar: (lineas) => {
      mias = lineas;
      /* Una línea borrada deja su ficha de repaso marcada como borrada, con
         fecha de hoy y sin vencimiento: si solo se quitara, la copia de la
         cuenta (que se queda con la ficha MÁS RECIENTE de cada línea) la
         devolvería, y el «Repaso del día» seguiría contando una línea que ya
         no existe. */
      const vivas = new Set(lineas.map((L) => L.id));
      Object.keys(estado).forEach((id) => {
        if (id.indexOf(RepertorioAperturas.PREFIJO) === 0 && !vivas.has(id) && !(estado[id] && estado[id].borrada)) {
          estado[id] = { borrada: true, ultimo: new Date().toISOString(), vence: "9999-12-31", intervalo: 0 };
        }
      });
      guardarEstado();
    },
  });
  mias = repertorio.lineas();
}

/* ---------------- arranque ---------------- */
async function init() {
  // La tarjeta de estudio de entreno/aprender.html manda para acá con
  // ?linea=<id> para practicarla de una, en vez de ir a buscarla en la lista.
  const idLinea = new URLSearchParams(location.search).get("linea");
  const rutaActual = "entreno/aperturas.html" + (idLinea ? "?linea=" + encodeURIComponent(idLinea) : "");

  let hay = false;
  try {
    const { data } = await sb.auth.getSession();
    hay = !!(data && data.session);
  } catch (e) { hay = false; }
  if (!hay) {
    document.getElementById("gate-checking").textContent =
      "Necesitas iniciar sesión en el sitio para entrar a Entrenamiento. Redirigiendo…";
    window.location.href = "../login.html?next=" + encodeURIComponent(rutaActual);
    return;
  }
  // El avance viaja con la cuenta: se baja y se funde ANTES de pintar, para
  // seguir donde se quedó aunque sea otro aparato.
  if (window.ProgresoUsuario) await ProgresoUsuario.init();
  if (window.EntrenoProgress) await EntrenoProgress.init();
  estado = leerEstado();
  await cargarRepertorio();

  document.getElementById("gate").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  elegirModo(new URLSearchParams(location.search).get("ver") === "mio" ? "mio" : "repaso");

  // Si el id no existe (línea borrada o mal escrita) se cae a la lista de
  // siempre, en vez de quedarse mostrando un tablero de mentira.
  if (idLinea && todas().some((L) => L.id === idLinea)) empezar(idLinea);
  // Con la cuenta ciega, el foco empieza en el título de la lista y no en el
  // <body>: desde ahí, el siguiente Tab ya son los filtros y las líneas.
  else if (document.documentElement.classList.contains("modo-ciego")) document.getElementById("lista-titulo").focus();
}
init();
