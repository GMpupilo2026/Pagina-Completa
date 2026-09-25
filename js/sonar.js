/* El código de sonar.html.

   Vivía escrito dentro de la página, en un <script> de 17 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* ===== El Sonar =====
 *
 * Las reglas viven en js/sonar-motor.js; acá solo se cuenta lo que pasa. Y se
 * cuenta de TRES formas que dicen lo mismo: escrito (la región viva, que es lo
 * que lee el lector de pantalla), en tonos (Web Audio: tantos pitidos como
 * jugadas faltan) y, si se pide, con la voz del navegador. El tablero pintado
 * es la cuarta, para quien mira.
 *
 * El progreso son dos claves, declaradas en CLAVES de js/progreso-usuario.js:
 *   sonar_estrellas_v1  nivel → mejores estrellas   (maxPorClave)
 *   sonar_mejor_v1      nivel → menos jugadas        (minPorClave)
 * No escribe en training_progress: esa tabla tiene el CHECK de actividades y
 * sumar una es una migración aparte. El tiempo sí se registra, con
 * js/tiempo-plataforma.js (data-activity="sonar"), que no tiene CHECK.
 */
const $ = (id) => document.getElementById(id);
const S = window.SonarMotor;
const CLAVE_ESTRELLAS = "sonar_estrellas_v1";
const CLAVE_MEJOR = "sonar_mejor_v1";
const CLAVE_SONIDO = "sonar_sonido_v1";   // del aparato, como el tema: no viaja con la cuenta
const FILAS = [8, 7, 6, 5, 4, 3, 2, 1];

let partida = null;
let nivelActual = 1;
let tablero = null;

const hablada = (sq) => (window.BlindNotation ? BlindNotation.squareSpoken(sq) : sq);
const lista = (xs) => xs.length <= 1 ? (xs[0] || "") : xs.slice(0, -1).join(", ") + " y " + xs[xs.length - 1];
const pieza = () => S.PIEZAS[partida.pieza];
const cuantas = (n, p) => n === 1 ? "1 " + p.verbo : n + " " + p.verbos;

/* ---------------------------------------------------------------- el sonido
   Tonos hechos con el propio navegador, sin archivos: un pitido por cada jugada
   que falta (hasta seis; más no se cuentan de oído) y más agudo cuanto más
   cerca. El AudioContext se crea en el primer gesto de quien juega, que es lo
   único que los navegadores dejan. */
let audio = null;
function sonidoEncendido() { try { return localStorage.getItem(CLAVE_SONIDO) !== "no"; } catch (e) { return true; } }
function ctx() {
  if (!sonidoEncendido()) return null;
  try {
    if (!audio) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; audio = new A(); }
    if (audio.state === "suspended") audio.resume();
    return audio;
  } catch (e) { return null; }
}
function tono(freq, inicio, dur) {
  const a = ctx(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = "sine"; o.frequency.value = freq;
  const t = a.currentTime + inicio;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function sonarSuena(lectura) {
  if (!lectura) return;
  if (lectura.tendencia) {
    // Aguas turbias: dos notas que suben (más cerca), bajan (más lejos) o se repiten.
    if (lectura.tendencia === "cerca") { tono(440, 0, .18); tono(660, .2, .22); }
    else if (lectura.tendencia === "lejos") { tono(660, 0, .18); tono(330, .2, .22); }
    else if (lectura.tendencia === "igual") { tono(500, 0, .18); tono(500, .2, .18); }
    return;
  }
  const d = Math.min(6, lectura.distancia);
  const freq = 260 + (7 - d) * 90;
  for (let i = 0; i < d; i++) tono(freq, i * 0.18, 0.12);
}
function fanfarria() { [523, 659, 784, 1047].forEach((f, i) => tono(f, i * 0.12, 0.2)); }
function error() { tono(180, 0, .25); }

/* --------------------------------------------------------------- avisar
   Una sola región viva. Se vacía y se vuelve a llenar con un respiro, porque si
   el texto es el mismo que antes (pedir «sonar» dos veces) no se anuncia. */
function avisar(texto) {
  const caja = $("aviso");
  caja.textContent = "";
  window.setTimeout(() => { caja.textContent = texto; }, 60);
  if (window.BlindNotation) BlindNotation.speak(texto);
}

function textoLectura(l) {
  const p = pieza();
  if (l.tendencia) {
    if (l.tendencia === "inicio") return "El agua está turbia: el sonar no da números. Mueve y te dirá si quedaste más cerca o más lejos.";
    if (l.tendencia === "cerca") return "Sonar: más cerca que antes.";
    if (l.tendencia === "lejos") return "Sonar: más lejos que antes.";
    return "Sonar: igual de lejos que antes.";
  }
  if (l.distancia === 1) return "Sonar: ¡a " + cuantas(1, p) + "! La próxima puede ser la buena.";
  return "Sonar: el tesoro " + (l.quedan > 1 ? "más cercano " : "") + "está a " + cuantas(l.distancia, p) + ".";
}

/* ---------------------------------------------------------------- pintar */
function construirTablero() {
  const board = $("board");
  board.innerHTML = "";
  FILAS.forEach((f, i) => {
    S.COLUMNAS.forEach((c, j) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sonar-casilla " + ((i + j) % 2 === 0 ? "clara" : "oscura");
      b.dataset.square = c + f;
      b.addEventListener("click", () => jugar(c + f));
      board.appendChild(b);
    });
  });
  if (window.Coordenadas) Coordenadas.aplicar(board);
}

function pintar() {
  const p = pieza();
  const legales = partida.terminada ? [] : S.jugadasLegales(partida);
  const ultima = {};
  partida.lecturas.forEach((l) => { ultima[l.casilla] = l; });
  const glifo = partida.pieza === "k" ? "♔" : "♘";
  document.querySelectorAll("#board .sonar-casilla").forEach((b) => {
    const sq = b.dataset.square;
    const aqui = sq === partida.pos;
    const recogido = partida.recogidos.indexOf(sq) !== -1;
    const l = ultima[sq];
    b.classList.toggle("pieza", aqui);
    b.classList.toggle("tesoro", recogido && !aqui);
    b.classList.toggle("pisada", !!l && !aqui && !recogido);
    b.classList.toggle("puede", legales.indexOf(sq) !== -1);
    // El texto de la casilla se reemplaza, no las etiquetas de coordenadas.
    [...b.childNodes].forEach((n) => { if (!(n.classList && n.classList.contains("coord-etiqueta"))) n.remove(); });
    let marca = "";
    if (aqui) marca = glifo;
    else if (recogido) marca = "💎";
    else if (l) marca = l.tendencia ? ({ cerca: "↓", lejos: "↑", igual: "=", inicio: "·" })[l.tendencia] : String(l.distancia);
    if (marca) { const s = document.createElement("span"); s.className = "lectura"; s.setAttribute("aria-hidden", "true"); s.textContent = marca; b.insertBefore(s, b.firstChild); }
    // Lo que se ANUNCIA de la casilla: el nombre lo pone js/tablero-accesible.js
    // y el estado va acá. Es la memoria de quien no ve los números pintados.
    const estado = [];
    if (recogido) estado.push("tesoro recogido");
    if (l && !aqui && !recogido) estado.push("ya estuviste, " + (l.tendencia ? ({ cerca: "marcó más cerca", lejos: "marcó más lejos", igual: "marcó igual", inicio: "saliste de acá" })[l.tendencia] : "el sonar marcó " + l.distancia));
    if (legales.indexOf(sq) !== -1) estado.push("puedes ir");
    if (estado.length) b.dataset.estado = estado.join(", "); else delete b.dataset.estado;
  });
  if (tablero) tablero.refrescar();

  const l = partida.lecturas[partida.lecturas.length - 1];
  $("m-sonar").textContent = l.tendencia ? ({ cerca: "más cerca", lejos: "más lejos", igual: "igual", inicio: "—" })[l.tendencia] : (partida.terminada ? "💎" : String(l.distancia));
  $("m-sonar-rotulo").textContent = l.tendencia ? "el sonar, turbio" : "el sonar, en " + p.verbos;
  $("m-jugadas").textContent = String(partida.jugadas);
  pintarRecord();
  pintarNiveles();
}

function leerMapa(clave) { try { const v = JSON.parse(localStorage.getItem(clave) || "{}"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } }

function pintarNiveles() {
  const estrellas = leerMapa(CLAVE_ESTRELLAS);
  $("niveles").innerHTML = "";
  S.NIVELES.forEach((n) => {
    const b = document.createElement("button");
    b.type = "button";
    const activo = n.id === nivelActual;
    b.className = "text-left rounded-xl px-3 py-2 text-sm font-semibold border transition-colors " + (activo
      ? "bg-accent-500 text-brand-900 border-accent-500"
      : "bg-white dark:bg-brand-900 text-brand-700 dark:text-brand-200 border-brand-200 dark:border-brand-700 hover:border-accent-500");
    b.setAttribute("aria-pressed", activo ? "true" : "false");
    const e = Number(estrellas[n.id]) || 0;
    // Las estrellas van ESCRITAS: «2 de 3 estrellas», no solo dibujadas.
    b.innerHTML = "";
    const t = document.createElement("span"); t.textContent = n.id + ". " + n.titulo; b.appendChild(t);
    const s = document.createElement("span"); s.className = "block text-xs font-normal";
    s.textContent = e ? "★".repeat(e) + "☆".repeat(3 - e) : "sin jugar";
    s.setAttribute("aria-hidden", "true"); b.appendChild(s);
    const sr = document.createElement("span"); sr.className = "sr-only";
    sr.textContent = e ? ", " + e + " de 3 estrellas" : ", sin jugar"; b.appendChild(sr);
    b.addEventListener("click", () => empezar(n.id, true));
    $("niveles").appendChild(b);
  });
}

function pintarRecord() {
  const m = leerMapa(CLAVE_MEJOR)[nivelActual];
  $("m-record").textContent = m ? String(m) : "—";
}

/* ----------------------------------------------------------------- jugar */
function empezar(idNivel, avisarlo) {
  nivelActual = S.nivel(idNivel) ? Number(idNivel) : 1;
  partida = S.nuevaPartida(nivelActual);
  const n = S.nivel(nivelActual), p = pieza();
  pintar();
  const primera = partida.lecturas[0];
  const texto = "Nivel " + n.id + ", " + n.titulo + ". " + n.resumen + " Tu " + p.nombre + " empieza en " + hablada(partida.pos) + ". " + textoLectura(primera);
  if (avisarlo !== false) avisar(texto); else $("aviso").textContent = texto;
  sonarSuena(primera);
}

function jugar(destino) {
  ctx();   // el primer gesto habilita el audio
  if (partida.terminada) { avisar("Esta partida ya terminó. Escribe «nuevo» para otra, o elige un nivel."); return; }
  const p = pieza();
  const antes = partida.pos;
  const r = S.mover(partida, destino);
  if (!r.ok) {
    error();
    if (r.motivo === "misma") { avisar("Tu " + p.nombre + " ya está en " + hablada(destino) + "."); return; }
    const opciones = S.jugadasLegales(partida).map(hablada);
    avisar("Desde " + hablada(antes) + " el " + p.nombre + " no llega a " + hablada(destino) + ". Puede ir a " + lista(opciones) + ".");
    return;
  }
  pintar();
  const verbo = partida.pieza === "k" ? "Fuiste a " : "Saltaste a ";
  if (r.encontrado) {
    fanfarria();
    if (!r.terminada) {
      avisar("¡Tesoro! Encontraste uno en " + hablada(destino) + ". Queda otro. " + textoLectura(r.lectura));
      window.setTimeout(() => sonarSuena(r.lectura), 700);
      return;
    }
    terminar();
    return;
  }
  sonarSuena(r.lectura);
  avisar(verbo + hablada(destino) + ". " + textoLectura(r.lectura));
}

function terminar() {
  const e = S.estrellas(partida);
  const p = pieza();
  const estrellas = leerMapa(CLAVE_ESTRELLAS), mejor = leerMapa(CLAVE_MEJOR);
  const record = !mejor[nivelActual] || partida.jugadas < mejor[nivelActual];
  try {
    if (e > (Number(estrellas[nivelActual]) || 0)) { estrellas[nivelActual] = e; localStorage.setItem(CLAVE_ESTRELLAS, JSON.stringify(estrellas)); }
    if (record) { mejor[nivelActual] = partida.jugadas; localStorage.setItem(CLAVE_MEJOR, JSON.stringify(mejor)); }
  } catch (err) {}
  pintar();
  const siguiente = S.nivel(nivelActual + 1);
  avisar("¡Tesoro! " + (partida.recogidos.length > 1 ? "Recogiste los dos" : "Lo encontraste en " + hablada(partida.pos)) +
    " con " + cuantas(partida.jugadas, p) + ". El camino más corto, sabiendo dónde estaba, era de " + cuantas(partida.minimo, p) + ". " +
    e + (e === 1 ? " estrella" : " estrellas") + " de 3" + (partida.ayudas ? ", con pista" : "") + "." +
    (record ? " ¡Es tu mejor marca en este nivel!" : "") +
    " Escribe «nuevo» para otra partida" + (siguiente ? " o «nivel " + siguiente.id + "» para el siguiente." : "."));
}

function decirDonde() {
  const p = pieza();
  avisar("Tu " + p.nombre + " está en " + hablada(partida.pos) + ". Llevas " + cuantas(partida.jugadas, p) + ". " +
    (partida.tesoros.length > 1 ? "Quedan dos tesoros. " : "") + textoLectura(partida.lecturas[partida.lecturas.length - 1]));
}

function decirJugadas() {
  const vistas = {};
  partida.lecturas.forEach((l) => { vistas[l.casilla] = true; });
  const js = S.jugadasLegales(partida).map((sq) => hablada(sq) + (vistas[sq] ? " (ya estuviste)" : ""));
  avisar("Desde " + hablada(partida.pos) + " tu " + pieza().nombre + " puede ir a " + lista(js) + ".");
}

function decirHistorial() {
  const partes = partida.lecturas.map((l, i) => (i === 0 ? "Empezaste en " : "") + hablada(l.casilla) + ": " +
    (l.tendencia ? ({ inicio: "salida", cerca: "más cerca", lejos: "más lejos", igual: "igual" })[l.tendencia] : (partida.recogidos.indexOf(l.casilla) !== -1 && l.distancia === 0 ? "tesoro" : l.distancia)));
  avisar("Historial del sonar. " + partes.join(". ") + ".");
}

function pista() {
  const c = S.candidatas(partida);
  partida.ayudas++;
  if (c === null) { avisar("Pista: con dos tesoros escondidos, cada lectura mide el más cercano. Busca uno moviéndote hacia donde el número baja; cuando recojas el primero, la pista podrá contar las casillas posibles."); return; }
  if (!c.length) { avisar("Pista: con lo que dijo el sonar no queda ninguna casilla posible. Revisa el historial."); return; }
  if (c.length <= 5) avisar("Pista: el tesoro solo puede estar en " + lista(c.map(hablada)) + ".");
  else avisar("Pista: el tesoro todavía puede estar en " + c.length + " casillas. Muévete a una casilla nueva para escuchar otra lectura: dos lecturas desde lugares distintos descartan muchísimas.");
}

function ayuda() {
  avisar("Escribe una casilla para mover, como e4 o eva 4. Comandos: sonar repite la última lectura; dónde dice dónde estás; jugadas dice a dónde puedes ir; historial repasa todas las lecturas; pista cuenta las casillas posibles; nuevo empieza otra partida; nivel y un número cambia de nivel, del 1 al " + S.NIVELES.length + ".");
}

$("cmd-form").addEventListener("submit", (e) => {
  e.preventDefault();
  ctx();
  const input = $("cmd-input");
  const texto = input.value;
  const c = S.leerComando(texto);
  input.value = "";
  if (!c) { error(); avisar("No entendí «" + texto.trim() + "». Escribe una casilla, como e4 o eva 4, o «ayuda»."); return; }
  if (c.cmd === "mover") jugar(c.casilla);
  else if (c.cmd === "sonar") { const l = partida.lecturas[partida.lecturas.length - 1]; sonarSuena(l); avisar(partida.terminada ? "La partida terminó. Escribe «nuevo» para otra." : textoLectura(l)); }
  else if (c.cmd === "donde") decirDonde();
  else if (c.cmd === "jugadas") decirJugadas();
  else if (c.cmd === "historial") decirHistorial();
  else if (c.cmd === "pista") pista();
  else if (c.cmd === "ayuda") ayuda();
  else if (c.cmd === "nuevo") empezar(nivelActual);
  else if (c.cmd === "nivel") {
    if (!S.nivel(c.nivel)) { avisar("Hay niveles del 1 al " + S.NIVELES.length + "."); return; }
    empezar(c.nivel);
  }
});

$("btn-sonar").addEventListener("click", () => { const l = partida.lecturas[partida.lecturas.length - 1]; sonarSuena(l); avisar(partida.terminada ? "La partida terminó." : textoLectura(l)); });
$("btn-historial").addEventListener("click", decirHistorial);
$("btn-pista").addEventListener("click", pista);
$("btn-nuevo").addEventListener("click", () => empezar(nivelActual));

function pintarSonido() {
  const on = sonidoEncendido();
  $("btn-sonido").setAttribute("aria-pressed", on ? "true" : "false");
  $("btn-sonido").innerHTML = '<span aria-hidden="true">' + (on ? "🔔 " : "🔕 ") + "</span>Sonidos del sonar";
}
$("btn-sonido").addEventListener("click", () => {
  try { localStorage.setItem(CLAVE_SONIDO, sonidoEncendido() ? "no" : "si"); } catch (e) {}
  pintarSonido();
  if (sonidoEncendido()) tono(600, 0, .12);
});

async function init() {
  let sesion = null;
  try { const { data } = await sb.auth.getSession(); sesion = data && data.session; } catch (e) { sesion = null; }
  if (!sesion) {
    $("loading").textContent = "Necesitas iniciar sesión para jugar. Redirigiendo…";
    window.location.href = "login.html?next=" + encodeURIComponent("sonar.html");
    return;
  }
  if (window.ProgresoUsuario) { try { await ProgresoUsuario.init(); } catch (e) {} }
  // El hub de Ciegos enlaza con "?modo=ciego": entra ya en Modo Adaptado, sin
  // tener que buscar el interruptor. Por AdaptiveMode.set(), que es lo que
  // enciende la clase del <html> Y avisa al resto de la página.
  if (new URLSearchParams(location.search).get("modo") === "ciego" && window.AdaptiveMode) AdaptiveMode.set(true);
  construirTablero();
  // Para el teclado del tablero, la partida se presenta como la pediría una
  // de ajedrez: dónde está tu pieza y a dónde puede ir. Así "o", "z" y "m"
  // contestan igual que en el resto del sitio. El tesoro NO está: no lo ve nadie.
  tablero = window.TableroAccesible && TableroAccesible.montar($("board"), {
    nombre: "Tablero del sonar",
    cuadro: () => $("cmd-input"),
    juego: () => partida && {
      get: (sq) => sq === partida.pos ? { type: partida.pieza, color: "w" } : null,
      moves: (o) => (o && o.square && o.square !== partida.pos) ? [] : S.jugadasLegales(partida).map((to) => ({ from: partida.pos, to: to, flags: "n" })),
      turn: () => "w",
    },
  });
  if (window.BlindNotation && BlindNotation.setupSpeechToggle) BlindNotation.setupSpeechToggle("btn-voz", () => true);
  else $("btn-voz").remove();
  pintarSonido();
  const pedido = Number(new URLSearchParams(location.search).get("nivel"));
  $("loading").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("cmd-input").focus();
  // Después del foco y con un respiro: el lector lee primero el recuadro, y
  // la región viva recién creada no se anuncia si se llena en el mismo instante.
  empezar(S.nivel(pedido) ? pedido : 1, true);
}
init();
    