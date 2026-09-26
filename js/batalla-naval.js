/* ===== Batalla naval de ajedrez (batalla-naval.html) =====
 *
 * Las reglas viven en js/batalla-naval-motor.js; acá solo se cuenta lo que
 * pasa. Y se cuenta ESCRITO primero: la región viva (#aviso) es lo que lee el
 * lector de pantalla, cada casilla dice en su nombre qué pasó ahí, y
 * «historial» repasa todos los disparos. El tablero pintado es la ayuda de
 * quien mira, no la información: como en El Sonar, se juega igual sin verlo.
 *
 * El progreso son dos claves, declaradas en CLAVES de js/progreso-usuario.js:
 *   batalla_estrellas_v1  nivel → mejores estrellas   (maxPorClave)
 *   batalla_mejor_v1      nivel → menos disparos       (minPorClave)
 *   batalla_victorias_v1  duelos ganados               (maxNumero)
 * No escribe en training_progress: esa tabla tiene el CHECK de actividades y
 * sumar una es una migración aparte. El tiempo sí se registra, con
 * js/tiempo-plataforma.js (data-activity="batalla-naval").
 */
const $ = (id) => document.getElementById(id);
const B = window.BatallaNavalMotor;
const CLAVE_ESTRELLAS = "batalla_estrellas_v1";
const CLAVE_MEJOR = "batalla_mejor_v1";
const CLAVE_VICTORIAS = "batalla_victorias_v1";
const FILAS = [8, 7, 6, 5, 4, 3, 2, 1];

let partida = null;
let nivelActual = 1;
let tablero = null;
// Las casillas que la pista marcó como agua segura. Lo seguro sigue siéndolo:
// no se borran hasta la partida siguiente.
let marcadas = {};

const hablada = (sq) => (window.BlindNotation ? BlindNotation.squareSpoken(sq) : sq);
const lista = (xs) => xs.length <= 1 ? (xs[0] || "") : xs.slice(0, -1).join(", ") + " y " + xs[xs.length - 1];
const conArticulo = (t) => B.PIEZAS[t].articulo + " " + B.PIEZAS[t].nombre;
const Mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// «la torre hundida», «el alfil hundido»: el género va escrito, no deducido.
const hundida = (t) => B.PIEZAS[t].articulo === "la" ? "hundida" : "hundido";
const disparos = (n) => n === 1 ? "1 disparo" : n + " disparos";

function piezasApuntan(n, tuyas) {
  if (n === 0) return "ninguna " + (tuyas ? "de tus piezas" : "pieza") + " apunta ahí";
  if (n === 1) return "1 " + (tuyas ? "de tus piezas" : "pieza") + " apunta ahí";
  return n + (tuyas ? " de tus piezas" : " piezas") + " apuntan ahí";
}

/* Qué pasó con un disparo, dicho de una vez. */
function textoDisparo(d, tuyas) {
  if (d.resultado === "hundido") return tuyas ? "¡Te hundió " + conArticulo(d.tipo) + "!" : "¡Hundido! Era " + conArticulo(d.tipo) + ".";
  return "Agua: " + piezasApuntan(d.cuenta, tuyas) + ".";
}

/* La flota, contada en palabras: «quedan la dama y el caballo». */
function textoFlota(mar) {
  const flote = B.aFlote(mar).map((p) => conArticulo(p.tipo));
  const hundidas = mar.flota.filter((p) => p.hundida).map((p) => conArticulo(p.tipo) + " en " + hablada(p.casilla));
  let t = flote.length ? "A flote: " + lista(flote) + "." : "No queda ninguna pieza a flote.";
  if (hundidas.length) t += " Hundidas: " + lista(hundidas) + ".";
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

/* ---------------------------------------------------------------- pintar */
function construir(id, conClic) {
  const board = $(id);
  board.innerHTML = "";
  FILAS.forEach((f, i) => {
    B.COLUMNAS.forEach((c, j) => {
      const b = document.createElement(conClic ? "button" : "div");
      if (conClic) { b.type = "button"; b.addEventListener("click", () => jugar(c + f)); }
      b.className = "naval-casilla " + ((i + j) % 2 === 0 ? "clara" : "oscura");
      b.dataset.square = c + f;
      board.appendChild(b);
    });
  });
  if (window.Coordenadas) Coordenadas.aplicar(board);
}

function marcar(b, texto) {
  [...b.childNodes].forEach((n) => { if (!(n.classList && n.classList.contains("coord-etiqueta"))) n.remove(); });
  if (!texto) return;
  const s = document.createElement("span");
  s.className = "marca"; s.setAttribute("aria-hidden", "true"); s.textContent = texto;
  b.insertBefore(s, b.firstChild);
}

function pintarMar(id, mar, propio) {
  const revelar = propio || partida.terminada;
  document.querySelectorAll("#" + id + " .naval-casilla").forEach((b) => {
    const sq = b.dataset.square;
    const d = B.disparoEn(mar, sq);
    const p = B.piezaEn(mar, sq);
    const segura = !propio && !d && marcadas[sq];
    b.classList.toggle("agua", !!d && d.resultado === "agua");
    b.classList.toggle("hundida", !!d && d.resultado === "hundido");
    b.classList.toggle("revelada", !d && !!p && revelar);
    b.classList.toggle("segura", !!segura);
    let marca = "", dicho = "";
    if (d && d.resultado === "hundido") { marca = B.PIEZAS[d.tipo].glifo; dicho = (propio ? "tu " : "") + B.PIEZAS[d.tipo].nombre + " " + hundida(d.tipo); }
    else if (d) { marca = String(d.cuenta); dicho = (propio ? "la computadora disparó, agua, " : "agua, ") + piezasApuntan(d.cuenta, propio); }
    else if (p && revelar) { marca = B.PIEZAS[p.tipo].glifo; dicho = propio ? "tu " + B.PIEZAS[p.tipo].nombre + ", a flote" : B.PIEZAS[p.tipo].nombre + " que no hundiste"; }
    else if (segura) { dicho = "sin disparar, la pista dice que es agua segura"; }
    else dicho = "sin disparar";
    marcar(b, marca);
    // El nombre accesible lo escribe la página entera (data-etiqueta-propia):
    // «vacía» sería mentira en una casilla sin disparar, que puede esconder
    // una pieza.
    b.dataset.etiquetaPropia = "1";
    b.setAttribute("aria-label", hablada(sq) + ", " + dicho);
  });
}

function pintar() {
  const n = B.nivel(nivelActual);
  pintarMar("board", partida.mar, false);
  if (tablero) tablero.refrescar();
  $("mi-zona").classList.toggle("hidden", !partida.duelo);
  $("btn-acomodar").classList.toggle("hidden", !partida.duelo || partida.mar.disparos.length > 0);
  if (partida.duelo) {
    pintarMar("mi-board", partida.miMar, true);
    $("mi-flota-texto").textContent = textoFlota(partida.miMar);
  }
  $("flota-texto").textContent = textoFlota(partida.mar);
  $("m-disparos").textContent = String(partida.mar.disparos.length);
  $("m-flote").textContent = B.aFlote(partida.mar).length + " de " + partida.mar.flota.length;
  if (partida.duelo) {
    $("m-tercero").textContent = B.aFlote(partida.miMar).length + " de " + partida.miMar.flota.length;
    $("m-tercero-rotulo").textContent = "tu flota a flote";
  } else {
    const m = leerMapa(CLAVE_MEJOR)[nivelActual];
    $("m-tercero").textContent = m ? String(m) : "—";
    $("m-tercero-rotulo").textContent = "tu mejor marca";
  }
  $("mar-titulo").textContent = n.duelo ? "El mar de la computadora: aquí disparas" : "El mar: aquí disparas";
  pintarNiveles();
}

function victorias() { try { return Number(localStorage.getItem(CLAVE_VICTORIAS)) || 0; } catch (e) { return 0; } }
function leerMapa(clave) { try { const v = JSON.parse(localStorage.getItem(clave) || "{}"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } }

function pintarNiveles() {
  const estrellas = leerMapa(CLAVE_ESTRELLAS);
  $("niveles").innerHTML = "";
  B.NIVELES.forEach((n) => {
    const b = document.createElement("button");
    b.type = "button";
    const activo = n.id === nivelActual;
    b.className = "text-left rounded-xl px-3 py-2 text-sm font-semibold border transition-colors " + (activo
      ? "bg-accent-500 text-brand-900 border-accent-500"
      : "bg-white dark:bg-brand-900 text-brand-700 dark:text-brand-200 border-brand-200 dark:border-brand-700 hover:border-accent-500");
    b.setAttribute("aria-pressed", activo ? "true" : "false");
    const t = document.createElement("span"); t.textContent = n.id + ". " + n.titulo; b.appendChild(t);
    const s = document.createElement("span"); s.className = "block text-xs font-normal";
    const e = Number(estrellas[n.id]) || 0;
    // Las estrellas van ESCRITAS: «2 de 3 estrellas», no solo dibujadas.
    if (n.duelo) {
      const g = victorias();
      s.textContent = g ? (g === 1 ? "1 victoria" : g + " victorias") : "sin ganar todavía";
      b.appendChild(s);
    } else {
      s.textContent = e ? "★".repeat(e) + "☆".repeat(3 - e) : "sin jugar";
      s.setAttribute("aria-hidden", "true"); b.appendChild(s);
      const sr = document.createElement("span"); sr.className = "sr-only";
      sr.textContent = e ? ", " + e + " de 3 estrellas" : ", sin jugar"; b.appendChild(sr);
    }
    b.addEventListener("click", () => empezar(n.id));
    $("niveles").appendChild(b);
  });
}

/* ----------------------------------------------------------------- jugar */
function empezar(idNivel) {
  nivelActual = B.nivel(idNivel) ? Number(idNivel) : 1;
  partida = B.nuevaPartida(nivelActual);
  marcadas = {};
  const n = B.nivel(nivelActual);
  pintar();
  const flota = lista(n.flota.map(conArticulo));
  avisar("Nivel " + n.id + ", " + n.titulo + ". " + n.resumen + " La flota: " + flota + "." +
    (n.duelo ? " La tuya es igual y ya está acomodada; «acomodar» la cambia antes de empezar. Disparas primero." : "") +
    " Escribe una casilla para disparar, como e4 o eva 4.");
}

function jugar(sq) {
  if (partida.terminada) { avisar("Esta partida ya terminó. Escribe «nuevo» para otra, o elige un nivel."); return; }
  const r = B.disparar(partida, sq);
  if (!r.ok) {
    if (r.motivo === "repetido") avisar("Ya disparaste a " + hablada(sq) + ". " + textoDisparo(r.disparo, false) + " Elige otra casilla.");
    else avisar("No entendí esa casilla. Escribe una como e4 o eva 4.");
    return;
  }
  let texto = "Disparaste a " + hablada(sq) + ". " + textoDisparo(r.disparo, false);
  if (partida.terminada) { terminar(texto); return; }
  if (partida.duelo) {
    const c = B.turnoComputadora(partida);
    texto += " La computadora dispara a " + hablada(c.disparo.casilla) + ". " + textoDisparo(c.disparo, true);
    if (partida.terminada) { terminar(texto); return; }
  }
  pintar();
  avisar(texto);
}

function terminar(texto) {
  const n = B.nivel(nivelActual);
  const estrellas = leerMapa(CLAVE_ESTRELLAS), mejor = leerMapa(CLAVE_MEJOR);
  const tiros = partida.mar.disparos.length;
  if (partida.duelo) {
    if (partida.ganador === "yo") {
      try { localStorage.setItem(CLAVE_VICTORIAS, String(victorias() + 1)); } catch (e) {}
    }
    pintar();
    const quedan = B.aFlote(partida.miMar).length;
    avisar(texto + (partida.ganador === "yo"
      ? " ¡Ganaste! Hundiste toda la flota de la computadora con " + disparos(tiros) + ", y te quedaron " + quedan + " a flote."
      : " Perdiste: la computadora hundió toda tu flota. En su mar quedaban " + lista(B.aFlote(partida.mar).map((p) => conArticulo(p.tipo) + " en " + hablada(p.casilla))) + ".") +
      " Escribe «nuevo» para la revancha.");
    return;
  }
  const e = B.estrellas(partida);
  const record = !mejor[n.id] || tiros < mejor[n.id];
  try {
    if (e > (Number(estrellas[n.id]) || 0)) { estrellas[n.id] = e; localStorage.setItem(CLAVE_ESTRELLAS, JSON.stringify(estrellas)); }
    if (record) { mejor[n.id] = tiros; localStorage.setItem(CLAVE_MEJOR, JSON.stringify(mejor)); }
  } catch (err) {}
  pintar();
  const siguiente = B.nivel(n.id + 1);
  avisar(texto + " ¡Hundiste toda la flota con " + disparos(tiros) + "! " +
    e + (e === 1 ? " estrella" : " estrellas") + " de 3" + (partida.ayudas ? ", con pista" : "") +
    ". Tres estrellas son hasta " + n.estrellas3 + " disparos sin pista." +
    (record ? " ¡Es tu mejor marca en este nivel!" : "") +
    " Escribe «nuevo» para otra partida" + (siguiente ? " o «nivel " + siguiente.id + "» para el siguiente." : "."));
}

function decirHistorial() {
  const ds = partida.mar.disparos;
  if (!ds.length) { avisar("Todavía no disparaste."); return; }
  avisar("Tus disparos. " + ds.map((d) => hablada(d.casilla) + ": " + (d.resultado === "hundido" ? B.PIEZAS[d.tipo].nombre + " " + hundida(d.tipo) : "agua, " + d.cuenta)).join(". ") + ".");
}

function decirFlota() {
  avisar("La flota de la computadora. " + textoFlota(partida.mar) + (partida.duelo ? " Tu flota. " + textoFlota(partida.miMar) : ""));
}

function decirMia() {
  if (!partida.duelo) { avisar("En este nivel no tienes flota: solo disparas. En el nivel 4, el duelo, sí."); return; }
  const ps = partida.miMar.flota.map((p) => conArticulo(p.tipo) + " en " + hablada(p.casilla) + (p.hundida ? ", " + hundida(p.tipo) : ""));
  const agua = partida.miMar.disparos.filter((d) => d.resultado === "agua").map((d) => hablada(d.casilla));
  avisar("Tu flota: " + lista(ps) + "." + (agua.length ? " La computadora falló en " + lista(agua) + "." : " La computadora todavía no disparó."));
}

function pista() {
  if (partida.terminada) { avisar("La partida terminó."); return; }
  const k = B.conocimiento(partida.mar);
  partida.ayudas++;
  k.seguras.forEach((s) => { marcadas[s] = true; });
  pintar();
  const vistos = {};
  const partes = [];
  k.restantes.forEach((t) => {
    if (vistos[t]) return; vistos[t] = true;
    const ps = k.posibles[t];
    partes.push(Mayus(conArticulo(t)) + (ps.length === 1 ? " solo puede estar en " + hablada(ps[0]) : ps.length <= 4 ? " puede estar en " + lista(ps.map(hablada)) : " puede estar en " + ps.length + " casillas"));
  });
  const seguras = k.seguras.length;
  avisar("Pista. " + partes.join(". ") + "." + (seguras
    ? " Hay " + (seguras === 1 ? "1 casilla" : seguras + " casillas") + " sin disparar que seguro son agua; quedan marcadas con un aro."
    : " Todavía no hay ninguna casilla que seguro sea agua: dispara donde nadie haya disparado, y busca un 0, que despeja mucho."));
}

function acomodar() {
  if (!B.acomodar(partida)) { avisar("Tu flota ya no se puede mover: la batalla empezó."); return; }
  pintar();
  avisar("Acomodaste tu flota de nuevo. " + lista(partida.miMar.flota.map((p) => conArticulo(p.tipo) + " en " + hablada(p.casilla))) + ".");
}

function ayuda() {
  avisar("Escribe una casilla para disparar, como e4 o eva 4. Si cae en el agua, te dice cuántas piezas de la flota apuntan a esa casilla, contando cada pieza como si estuviera sola en el tablero. Comandos: flota dice qué queda a flote; historial repasa tus disparos; pista dice dónde pueden estar las piezas; mi flota, en el duelo, dice dónde están las tuyas; acomodar las cambia antes de empezar; nuevo empieza otra partida; nivel y un número cambia de nivel, del 1 al " + B.NIVELES.length + ".");
}

$("cmd-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("cmd-input");
  const texto = input.value;
  const c = B.leerComando(texto);
  input.value = "";
  if (!c) { avisar("No entendí «" + texto.trim() + "». Escribe una casilla, como e4 o eva 4, o «ayuda»."); return; }
  if (c.cmd === "disparar") jugar(c.casilla);
  else if (c.cmd === "flota") decirFlota();
  else if (c.cmd === "mia") decirMia();
  else if (c.cmd === "historial") decirHistorial();
  else if (c.cmd === "pista") pista();
  else if (c.cmd === "acomodar") acomodar();
  else if (c.cmd === "ayuda") ayuda();
  else if (c.cmd === "nuevo") empezar(nivelActual);
  else if (c.cmd === "nivel") {
    if (!B.nivel(c.nivel)) { avisar("Hay niveles del 1 al " + B.NIVELES.length + "."); return; }
    empezar(c.nivel);
  }
});

$("btn-flota").addEventListener("click", decirFlota);
$("btn-historial").addEventListener("click", decirHistorial);
$("btn-pista").addEventListener("click", pista);
$("btn-acomodar").addEventListener("click", acomodar);
$("btn-nuevo").addEventListener("click", () => empezar(nivelActual));

async function init() {
  let sesion = null;
  try { const { data } = await sb.auth.getSession(); sesion = data && data.session; } catch (e) { sesion = null; }
  if (!sesion) {
    $("loading").textContent = "Necesitas iniciar sesión para jugar. Redirigiendo…";
    window.location.href = "login.html?next=" + encodeURIComponent("batalla-naval.html");
    return;
  }
  if (window.ProgresoUsuario) { try { await ProgresoUsuario.init(); } catch (e) {} }
  if (new URLSearchParams(location.search).get("modo") === "ciego" && window.AdaptiveMode) AdaptiveMode.set(true);
  construir("board", true);
  construir("mi-board", false);
  // Sin partida de ajedrez detrás: cada casilla lleva su propio nombre (qué
  // disparo recibió), y las flechas e Intro funcionan igual.
  tablero = window.TableroAccesible && TableroAccesible.montar($("board"), {
    nombre: "El mar donde disparas",
    cuadro: () => $("cmd-input"),
  });
  if (window.BlindNotation && BlindNotation.setupSpeechToggle) BlindNotation.setupSpeechToggle("btn-voz", () => true);
  else $("btn-voz").remove();
  const pedido = Number(new URLSearchParams(location.search).get("nivel"));
  $("loading").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("cmd-input").focus();
  empezar(B.nivel(pedido) ? pedido : 1);
}
init();
