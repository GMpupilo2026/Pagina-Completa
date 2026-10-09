/* ===== Buscaminas de ajedrez (buscaminas.html) =====
 *
 * Las reglas viven en js/buscaminas-motor.js; acá solo se cuenta lo que pasa.
 * Y se cuenta ESCRITO primero: la región viva (#aviso) es lo que lee el
 * lector de pantalla, cada casilla dice en su nombre qué hay revelado ahí, y
 * «trampas» repasa qué queda escondido. El tablero pintado es la ayuda de
 * quien mira, no la información: se juega igual sin verlo.
 *
 * Público, sin sesión: el progreso vive en localStorage y viaja con la
 * cuenta, si hay una, vía js/progreso-usuario.js (CLAVES). No se manda a
 * training_progress (esa tabla tiene el CHECK de actividades, y sumar una es
 * una migración aparte — como La partida perdida). El tiempo activo en la
 * página sí se cuenta, con js/tiempo-plataforma.js (data-activity="buscaminas").
 */
const $ = (id) => document.getElementById(id);
const M = window.BuscaminasMotor;
const CLAVE_ESTRELLAS = "buscaminas_estrellas_v1";
const CLAVE_MEJOR = "buscaminas_mejor_v1";
const FILAS = [8, 7, 6, 5, 4, 3, 2, 1];
const NUMEROS = ["cero", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete"];

let campo = null;
let nivelActual = 1;
let tablero = null;
let modoBandera = false;
let conAyuda = false;
let inicioMs = null;      // null hasta la primera jugada
let tiempoTimer = null;
let segundosFinal = null;
// Las casillas que la pista marcó como seguras. Lo seguro sigue siéndolo: no
// se borran hasta la partida siguiente.
let marcadas = {};

const hablada = (sq) => (window.BlindNotation ? BlindNotation.squareSpoken(sq) : sq);
const lista = (xs) => xs.length <= 1 ? (xs[0] || "") : xs.slice(0, -1).join(", ") + " y " + xs[xs.length - 1];
const conArticulo = (t) => M.PIEZAS[t].articulo + " " + M.PIEZAS[t].nombre;
// «pisaste la dama», «pisaste el caballo»: el género va escrito, no deducido.
const pisado = (t) => M.PIEZAS[t].articulo === "la" ? "pisada" : "pisado";

function piezasAtacan(n) {
  if (n === 0) return "ninguna pieza la ataca";
  if (n === 1) return "1 pieza la ataca";
  return n + " piezas la atacan";
}

/* «Escondidas: dos torres y dos alfiles.», o con ubicación al terminar:
   «Estaban en la dama en eva 4, …». Nunca dice dónde están mientras se juega:
   eso sería la respuesta. */
function piezasContadas(trampas) {
  const porTipo = {}, orden = [];
  trampas.forEach((p) => { if (!porTipo[p.tipo]) { porTipo[p.tipo] = 0; orden.push(p.tipo); } porTipo[p.tipo]++; });
  return orden.map((t) => {
    const n = porTipo[t];
    if (n === 1) return conArticulo(t);
    return (NUMEROS[n] || String(n)) + " " + M.PIEZAS[t].nombre + "s";
  });
}
function textoTrampas(conUbicacion) {
  let t = "Escondidas: " + lista(piezasContadas(campo.trampas)) + ".";
  if (conUbicacion) t += " Estaban en " + lista(campo.trampas.map((p) => conArticulo(p.tipo) + " en " + hablada(p.casilla))) + ".";
  return t;
}

/* --------------------------------------------------------------- avisar
   Una sola región viva. Se vacía y se vuelve a llenar con un respiro, porque si
   el texto es el mismo que antes no se anuncia. */
function avisar(texto) {
  const caja = $("aviso");
  caja.textContent = "";
  window.setTimeout(() => { caja.textContent = texto; }, 60);
  if (window.BlindNotation) BlindNotation.speak(texto);
}

/* ---------------------------------------------------------------- tiempo */
function formatoTiempo(s) { const m = Math.floor(s / 60), r = s % 60; return m + ":" + (r < 10 ? "0" : "") + r; }
function empezarReloj() {
  inicioMs = Date.now();
  tiempoTimer = window.setInterval(() => { $("m-tiempo").textContent = formatoTiempo(Math.floor((Date.now() - inicioMs) / 1000)); }, 500);
}
function detenerReloj() {
  if (tiempoTimer) window.clearInterval(tiempoTimer);
  tiempoTimer = null;
  if (inicioMs !== null) segundosFinal = Math.floor((Date.now() - inicioMs) / 1000);
}

/* ---------------------------------------------------------------- pintar */
function construir() {
  const board = $("board");
  board.innerHTML = "";
  FILAS.forEach((f, i) => {
    M.COLUMNAS.forEach((c, j) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "bm-casilla " + ((i + j) % 2 === 0 ? "clara" : "oscura");
      b.dataset.square = c + f;
      b.addEventListener("click", () => jugar(c + f));
      board.appendChild(b);
    });
  });
  if (window.Coordenadas) Coordenadas.aplicar(board);
}

function marcarTexto(b, texto) {
  [...b.childNodes].forEach((n) => { if (!(n.classList && n.classList.contains("coord-etiqueta"))) n.remove(); });
  if (!texto) return;
  const s = document.createElement("span");
  s.className = "marca"; s.setAttribute("aria-hidden", "true"); s.textContent = texto;
  b.insertBefore(s, b.firstChild);
}

function pintar() {
  document.querySelectorAll("#board .bm-casilla").forEach((b) => {
    const sq = b.dataset.square;
    const revelada = campo.reveladas.hasOwnProperty(sq);
    const trampa = M.trampaEn(campo, sq);
    const bandera = !!campo.banderas[sq];
    const explotada = campo.explotadaEn === sq;
    const mostrada = !!trampa && campo.terminada && !explotada;
    const segura = !revelada && !bandera && !campo.terminada && !!marcadas[sq];
    b.classList.toggle("revelada", revelada);
    b.classList.toggle("explotada", explotada);
    b.classList.toggle("mostrada", mostrada);
    b.classList.toggle("segura", segura);
    let marca = "", dicho;
    if (explotada) { marca = M.PIEZAS[trampa.tipo].glifo; dicho = "pisaste " + conArticulo(trampa.tipo) + " acá"; }
    else if (mostrada) { marca = M.PIEZAS[trampa.tipo].glifo; dicho = conArticulo(trampa.tipo) + ", no la pisaste"; }
    else if (revelada) { const n = campo.reveladas[sq]; marca = String(n); dicho = "revelada, " + piezasAtacan(n); }
    else if (bandera) { marca = "🚩"; dicho = "con bandera"; }
    else if (segura) { dicho = "sin revelar, la pista dice que seguro no tiene pieza"; }
    else dicho = "sin revelar";
    marcarTexto(b, marca);
    b.dataset.etiquetaPropia = "1";
    b.setAttribute("aria-label", hablada(sq) + ", " + dicho);
  });
  if (tablero) tablero.refrescar();
  const total = 64 - campo.trampas.length;
  $("m-reveladas").textContent = String(Object.keys(campo.reveladas).length);
  $("m-reveladas-rotulo").textContent = "casillas de " + total;
  const mejor = leerMapa(CLAVE_MEJOR)[nivelActual];
  $("m-record").textContent = mejor ? formatoTiempo(mejor) : "—";
  $("trampas-texto").textContent = textoTrampas(campo.terminada);
  $("btn-pista").disabled = campo.terminada;
  pintarNiveles();
}

function leerMapa(clave) { try { const v = JSON.parse(localStorage.getItem(clave) || "{}"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } }

function pintarNiveles() {
  const estrellas = leerMapa(CLAVE_ESTRELLAS);
  $("niveles").innerHTML = "";
  M.NIVELES.forEach((n) => {
    const b = document.createElement("button");
    b.type = "button";
    const activo = n.id === nivelActual;
    b.className = "text-left rounded-xl px-3 py-2 text-sm font-semibold border transition-colors " + (activo
      ? "bg-accent-500 text-brand-900 border-accent-500"
      : "bg-white dark:bg-brand-900 text-brand-700 dark:text-brand-200 border-brand-200 dark:border-brand-700 hover:border-accent-500");
    b.setAttribute("aria-pressed", activo ? "true" : "false");
    const t = document.createElement("span"); t.textContent = n.id + ". " + n.titulo; b.appendChild(t);
    // La coma va escrita, solo para el lector: un `display: block` no pone
    // espacio, y «…alfilessin jugar» se pegaba (igual que en Batalla naval).
    const sep = document.createElement("span"); sep.className = "sr-only"; sep.textContent = ", "; b.appendChild(sep);
    const s = document.createElement("span"); s.className = "block text-xs font-normal";
    const e = Number(estrellas[n.id]) || 0;
    s.textContent = e ? "★".repeat(e) + "☆".repeat(3 - e) : "sin jugar";
    s.setAttribute("aria-hidden", "true"); b.appendChild(s);
    const sr = document.createElement("span"); sr.className = "sr-only";
    sr.textContent = e ? e + " de 3 estrellas" : "sin jugar"; b.appendChild(sr);
    b.addEventListener("click", () => empezar(n.id));
    $("niveles").appendChild(b);
  });
}

/* ----------------------------------------------------------------- jugar */
function empezar(idNivel) {
  nivelActual = M.nivel(idNivel) ? Number(idNivel) : 1;
  campo = M.nuevaPartida(nivelActual);
  marcadas = {};
  conAyuda = false;
  modoBandera = false;
  segundosFinal = null;
  detenerReloj();
  inicioMs = null;
  $("btn-bandera").setAttribute("aria-pressed", "false");
  $("m-tiempo").textContent = "0:00";
  pintar();
  const n = M.nivel(nivelActual);
  avisar("Nivel " + n.id + ", " + n.titulo + ". " + n.resumen + " " + textoTrampas(false) +
    " Escribe una casilla para revelarla, como e4 o eva 4.");
}

function jugar(sq) {
  if (campo.terminada) { avisar("Esta partida ya terminó. Escribe «nuevo» para otra, o elige un nivel."); return; }
  if (modoBandera) { marcar(sq); return; }
  if (campo.banderas[sq]) { avisar(hablada(sq) + " tiene bandera: quítasela («marcar " + sq + "») antes de revelarla, o activa «Modo bandera» para marcar y desmarcar."); return; }
  if (inicioMs === null) empezarReloj();
  const r = M.revelar(campo, sq);
  if (!r.ok) {
    if (r.motivo === "repetido") avisar("Ya revelaste " + hablada(sq) + ".");
    else avisar("No entendí esa casilla. Escribe una como e4 o eva 4.");
    return;
  }
  if (r.resultado === "trampa") { terminar("Pisaste " + conArticulo(r.tipo) + " en " + hablada(sq) + ".", false); return; }
  let texto = "Revelaste " + hablada(sq) + ": " + piezasAtacan(r.cuenta) +
    (r.cuenta === 0 && r.cadena.length > 1 ? "; se destaparon " + (r.cadena.length - 1) + " casillas más alrededor" : "") + ".";
  if (campo.terminada && campo.gano) { terminar(texto, true); return; }
  pintar();
  avisar(texto);
}

function marcar(sq) {
  const r = M.marcar(campo, sq);
  if (!r.ok) {
    if (r.motivo === "revelada") avisar(hablada(sq) + " ya está revelada: no se puede marcar.");
    else avisar("No entendí esa casilla. Escribe una como e4 o eva 4.");
    return;
  }
  pintar();
  avisar(hablada(sq) + (r.puesta ? ": bandera puesta." : ": bandera quitada."));
}

function estrellasPorTiempo(n, segundos) {
  if (segundos <= n.segundos3) return 3;
  if (segundos <= n.segundos2) return 2;
  return 1;
}

function terminar(texto, gano) {
  detenerReloj();
  pintar();
  if (!gano) { avisar(texto + " " + textoTrampas(true) + " Escribe «nuevo» para otra partida."); return; }
  const n = M.nivel(nivelActual);
  const estrellas = leerMapa(CLAVE_ESTRELLAS), mejor = leerMapa(CLAVE_MEJOR);
  const e = estrellasPorTiempo(n, segundosFinal);
  const record = !mejor[n.id] || segundosFinal < mejor[n.id];
  try {
    if (e > (Number(estrellas[n.id]) || 0)) { estrellas[n.id] = e; localStorage.setItem(CLAVE_ESTRELLAS, JSON.stringify(estrellas)); }
    if (record) { mejor[n.id] = segundosFinal; localStorage.setItem(CLAVE_MEJOR, JSON.stringify(mejor)); }
  } catch (err) {}
  pintar();
  const siguiente = M.nivel(n.id + 1);
  avisar(texto + " ¡Destapaste todo el campo en " + formatoTiempo(segundosFinal) + "! " +
    e + (e === 1 ? " estrella" : " estrellas") + " de 3" + (conAyuda ? ", con pista" : "") +
    ". Tres estrellas son hasta " + formatoTiempo(n.segundos3) + " sin pista." +
    (record ? " ¡Es tu mejor tiempo en este nivel!" : "") + " " + textoTrampas(true) +
    (siguiente ? " Escribe «siguiente» para el nivel " + siguiente.id + ", o «nuevo» para otra partida de este." : " Escribe «nuevo» para otra partida."));
}

function decirPosicion() {
  const n = Object.keys(campo.reveladas).length, total = 64 - campo.trampas.length;
  let t = "Nivel " + nivelActual + ". Revelaste " + n + " de " + total + " casillas.";
  const bs = M.banderas(campo);
  if (bs.length) t += " Con bandera: " + lista(bs.map(hablada)) + ".";
  t += " " + textoTrampas(campo.terminada);
  if (inicioMs !== null) t += " Llevas " + formatoTiempo(campo.terminada ? segundosFinal : Math.floor((Date.now() - inicioMs) / 1000)) + ".";
  if (campo.terminada) t += " La partida terminó: escribe «nuevo» para otra.";
  avisar(t);
}

function decirBanderas() {
  const bs = M.banderas(campo);
  if (!bs.length) { avisar("No pusiste ninguna bandera todavía."); return; }
  avisar("Con bandera: " + lista(bs.map(hablada)) + ".");
}

function pista() {
  if (campo.terminada) { avisar("La partida terminó."); return; }
  conAyuda = true;
  const segs = M.seguras(campo).filter((s) => !campo.reveladas.hasOwnProperty(s) && !marcadas[s]);
  segs.forEach((s) => { marcadas[s] = true; });
  pintar();
  const total = Object.keys(marcadas).filter((s) => !campo.reveladas.hasOwnProperty(s)).length;
  if (!total) avisar("Todavía no hay ninguna casilla que la pista pueda asegurar. Revela una sin bandera y busca un 0, que despeja mucho.");
  else avisar("Pista. Hay " + (total === 1 ? "1 casilla" : total + " casillas") + " sin revelar que seguro no tienen pieza; quedan marcadas con un aro." + (segs.length ? "" : " Ya estaban marcadas."));
}

function ayuda() {
  avisar("Escribe una casilla para revelarla, como e4 o eva 4. Si está vacía, dice cuántas piezas escondidas la atacan con su propio movimiento; un 0 destapa en cadena a sus vecinas. Si pisas una pieza, se acaba. «Marcar» y una casilla le pone o le quita bandera, para recordar dónde sospechas. Comandos: trampas dice qué queda escondido; banderas repasa dónde las pusiste; pista marca casillas seguras; nuevo empieza otra partida; siguiente, con la partida terminada, pasa al nivel que sigue; nivel y un número cambia de nivel, del 1 al " + M.NIVELES.length + ".");
}

function normalizarPedido(t) {
  return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

$("cmd-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("cmd-input");
  const texto = input.value;
  if (/^\s*(siguiente|el siguiente|siguiente nivel|proximo|próximo|proximo nivel|próximo nivel)\s*$/i.test(texto)) {
    input.value = "";
    const sig = M.nivel(nivelActual + 1);
    if (campo.terminada) { empezar(sig ? sig.id : nivelActual); return; }
    avisar("La partida sigue: todavía queda campo por revelar. Para dejarla, escribe «nuevo» (otra partida de este nivel)" +
      (sig ? " o «nivel " + sig.id + "» para el siguiente." : "."));
    return;
  }
  const pedido = normalizarPedido(texto);
  if (/^(tiempo|el tiempo|reloj|cuanto tiempo|cuanto tiempo llevo|segundos)$/.test(pedido)) {
    input.value = "";
    const s = inicioMs === null ? 0 : (campo.terminada ? segundosFinal : Math.floor((Date.now() - inicioMs) / 1000));
    avisar("Llevas " + formatoTiempo(s) + ".");
    return;
  }
  if (/^(posicion|la posicion|como esta la posicion|cual es la posicion|describe la posicion|describir la posicion|leer la posicion|lee la posicion|tablero|el tablero|que hay en el tablero|como voy|como va)$/.test(pedido)) {
    input.value = "";
    decirPosicion();
    return;
  }
  const c = M.leerComando(texto);
  input.value = "";
  if (!c) { avisar("No entendí «" + texto.trim() + "». Escribe una casilla, como e4 o eva 4, o «ayuda»."); return; }
  if (c.cmd === "revelar") jugar(c.casilla);
  else if (c.cmd === "marcar") marcar(c.casilla);
  else if (c.cmd === "trampas") avisar(textoTrampas(campo.terminada));
  else if (c.cmd === "banderas") decirBanderas();
  else if (c.cmd === "pista") pista();
  else if (c.cmd === "ayuda") ayuda();
  else if (c.cmd === "nuevo") empezar(nivelActual);
  else if (c.cmd === "nivel") {
    if (!M.nivel(c.nivel)) { avisar("Hay niveles del 1 al " + M.NIVELES.length + "."); return; }
    empezar(c.nivel);
  }
});

$("btn-bandera").addEventListener("click", () => {
  modoBandera = !modoBandera;
  $("btn-bandera").setAttribute("aria-pressed", modoBandera ? "true" : "false");
  avisar(modoBandera ? "Modo bandera activado: tocar una casilla sin revelar le pone o le quita bandera." : "Modo bandera desactivado: tocar una casilla la revela.");
});
$("btn-pista").addEventListener("click", pista);
$("btn-trampas").addEventListener("click", () => avisar(textoTrampas(campo.terminada)));
$("btn-nuevo").addEventListener("click", () => empezar(nivelActual));

async function init() {
  construir();
  if (new URLSearchParams(location.search).get("modo") === "ciego" && window.AdaptiveMode) AdaptiveMode.set(true);
  // Sin partida de ajedrez detrás: cada casilla lleva su propio nombre (qué se
  // reveló ahí), y las flechas e Intro funcionan igual que en Batalla naval.
  tablero = window.TableroAccesible && TableroAccesible.montar($("board"), {
    nombre: "El campo donde revelas",
    cuadro: () => $("cmd-input"),
  });
  if (window.BlindNotation && BlindNotation.setupSpeechToggle) BlindNotation.setupSpeechToggle("btn-voz", () => true);
  else $("btn-voz").remove();
  if (window.ProgresoUsuario) { try { await ProgresoUsuario.init(); } catch (e) {} }
  const pedido = Number(new URLSearchParams(location.search).get("nivel"));
  $("cmd-input").focus();
  empezar(M.nivel(pedido) ? pedido : 1);
}
init();
