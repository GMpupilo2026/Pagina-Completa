/* El código de confites.html.

   Vivía escrito dentro de la página, en un <script> de 8 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* ===== Confites del caballo =====
 *
 * El paseo del caballo de toda la vida, contado como un juego: hay un confite
 * en cada una de las 64 casillas y el caballo los recoge saltando, pero cada
 * casilla que pisa queda bloqueada. La marca es cuántos confites juntó antes de
 * quedarse sin saltos; 64 es el recorrido completo.
 *
 * La pista usa la regla de Warnsdorff: ir siempre a la casilla desde la que
 * queden menos saltos. No es magia —hay posiciones donde falla— pero enseña la
 * idea que de verdad resuelve el problema, que es no dejar casillas aisladas.
 *
 * El progreso son dos marcas en localStorage, que viajan con la cuenta vía
 * js/progreso-usuario.js (hay que declararlas en sus CLAVES):
 *   confites_best         la mejor marca, con ayuda o sin ella
 *   confites_best_limpio  la mejor SIN pistas y SIN deshacer
 *
 * Cada ronda terminada además se registra en training_progress ("confites",
 * ver js/entreno-progress.js): es lo que hace que una ronda de acá cuente
 * para la racha de días de logros.html, igual que cualquier otro ejercicio.
 */
const FILAS = [8, 7, 6, 5, 4, 3, 2, 1];
const COLUMNAS = ["a", "b", "c", "d", "e", "f", "g", "h"];
const SALTOS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const CLAVE_RECORD = "confites_best";
const CLAVE_LIMPIO = "confites_best_limpio";

const $ = (id) => document.getElementById(id);

let pisadas = new Set();      // casillas ya visitadas (bloqueadas)
let camino = [];              // el recorrido, para deshacer
let caballo = null;           // casilla actual, o null antes de empezar
let conAyuda = false;         // se usó pista o deshacer en esta partida
let terminado = false;
let sugerida = null;

/* ---------------- Tablero ---------------- */
const columnaDe = (c) => COLUMNAS.indexOf(c[0]);
const filaDe = (c) => Number(c[1]);
const casilla = (col, fila) => (col >= 0 && col < 8 && fila >= 1 && fila <= 8) ? COLUMNAS[col] + fila : null;

function saltosDesde(desde, bloqueadas) {
  const col = columnaDe(desde), fila = filaDe(desde);
  const out = [];
  SALTOS.forEach(([dc, df]) => {
    const s = casilla(col + dc, fila + df);
    if (s && !bloqueadas.has(s)) out.push(s);
  });
  return out;
}

function construirTablero() {
  const board = $("board");
  board.innerHTML = "";
  FILAS.forEach((fila, i) => {
    COLUMNAS.forEach((col, j) => {
      const c = document.createElement("div");
      c.className = "casilla " + ((i + j) % 2 === 0 ? "clara" : "oscura");
      c.dataset.square = col + fila;
      c.setAttribute("role", "gridcell");
      c.addEventListener("click", () => tocar(col + fila));
      board.appendChild(c);
    });
  });
  if (window.Coordenadas) Coordenadas.aplicar(board);
}

function pintar() {
  const destinos = caballo && !terminado ? saltosDesde(caballo, pisadas) : [];
  document.querySelectorAll("#board .casilla").forEach((c) => {
    const s = c.dataset.square;
    c.classList.toggle("pisada", pisadas.has(s) && s !== caballo);
    c.classList.toggle("caballo", s === caballo);
    c.classList.toggle("destino", destinos.indexOf(s) !== -1);
    c.classList.toggle("sugerida", s === sugerida);
    c.classList.toggle("inicio-libre", !caballo && !terminado);

    let texto = "";
    let etiqueta = `${s}, `;
    if (s === caballo) { texto = "♞"; etiqueta += "el caballo"; }
    else if (pisadas.has(s)) { texto = ""; etiqueta += "casilla bloqueada"; }
    else { texto = "🍬"; etiqueta += "confite sin recoger"; }
    if (destinos.indexOf(s) !== -1) etiqueta += ", salto posible";

    [...c.childNodes].forEach((n) => { if (n.nodeType === Node.TEXT_NODE) n.remove(); });
    if (texto) c.insertBefore(document.createTextNode(texto), c.firstChild);
    c.setAttribute("aria-label", etiqueta);
  });

  $("m-confites").textContent = String(pisadas.size);
  $("m-salidas").textContent = caballo ? String(destinos.length) : "—";
  $("btn-deshacer").disabled = camino.length < 2;
  $("btn-pista").disabled = !caballo || terminado || !destinos.length;
  if (window.Coordenadas) Coordenadas.aplicar($("board"));
}

/* ---------------- Jugar ---------------- */
function tocar(s) {
  if (terminado) return;
  if (!caballo) { empezarEn(s); return; }
  if (saltosDesde(caballo, pisadas).indexOf(s) === -1) return;
  caballo = s;
  pisadas.add(s);
  camino.push(s);
  sugerida = null;
  pintar();
  revisarFinal();
}

function empezarEn(s) {
  caballo = s;
  pisadas = new Set([s]);
  camino = [s];
  sugerida = null;
  avisar(`El caballo arranca en <strong>${s}</strong>. Salta a una casilla marcada para recoger su confite.`, "normal");
  pintar();
}

function revisarFinal() {
  const quedan = saltosDesde(caballo, pisadas);
  if (quedan.length) {
    if (quedan.length === 1) avisar("Cuidado: solo queda <strong>un salto</strong> posible.", "aviso");
    else avisar(`Vas por <strong>${pisadas.size}</strong> confites. Te quedan ${quedan.length} saltos.`, "normal");
    return;
  }
  terminado = true;
  guardarMarca();
  if (window.EntrenoProgress) EntrenoProgress.log("confites", { pisadas: pisadas.size, limpio: !conAyuda });
  const n = pisadas.size;
  avisar(`${cierre(n)} Recogiste <strong>${n} de 64</strong> confites${conAyuda ? " (con ayuda)" : ""}.`, n === 64 ? "logro" : "fin");
  pintar();
}

function cierre(n) {
  if (n === 64) return "🏆 ¡Paseo del caballo completo! Pisaste las 64 casillas sin repetir ninguna.";
  if (n >= 55) return "🎉 ¡Casi completo! Te faltó muy poco.";
  if (n >= 40) return "👏 Muy buen recorrido.";
  if (n >= 25) return "🙂 Buen intento: el caballo se quedó encerrado a mitad de camino.";
  return "🤔 Se encerró temprano. Prueba dejar para el final las casillas del centro.";
}

function avisar(html, tipo) {
  const caja = $("aviso");
  const estilos = {
    normal: "bg-brand-100 dark:bg-brand-900 text-brand-600 dark:text-brand-300",
    aviso: "bg-accent-50 dark:bg-brand-800 text-accent-700 dark:text-accent-400",
    fin: "bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-200 font-medium",
    logro: "bg-green-50 dark:bg-green-900/40 text-green-800 dark:text-green-300 font-medium",
  };
  caja.className = "mb-4 rounded-xl px-4 py-3 text-sm " + (estilos[tipo] || estilos.normal);
  caja.innerHTML = html;
}

/* ---------------- Pista (Warnsdorff) ---------------- */
function pista() {
  const destinos = saltosDesde(caballo, pisadas);
  if (!destinos.length) return;
  conAyuda = true;
  const conSalidas = destinos.map((s) => {
    const futuras = new Set(pisadas); futuras.add(s);
    return { s, salidas: saltosDesde(s, futuras).length };
  });
  const menos = Math.min.apply(null, conSalidas.map((d) => d.salidas));
  sugerida = conSalidas.find((d) => d.salidas === menos).s;
  avisar(`Prueba <strong>${sugerida}</strong>: desde ahí quedan ${menos} saltos, que son los menos. Las casillas con pocas salidas son las que hay que pisar primero.`, "aviso");
  pintar();
}

function deshacer() {
  if (camino.length < 2 || terminado) return;
  conAyuda = true;
  const ultima = camino.pop();
  pisadas.delete(ultima);
  caballo = camino[camino.length - 1];
  sugerida = null;
  avisar(`Deshecho. El caballo vuelve a <strong>${caballo}</strong>.`, "normal");
  pintar();
}

function reiniciar() {
  pisadas = new Set(); camino = []; caballo = null;
  conAyuda = false; terminado = false; sugerida = null;
  avisar("Elige la casilla donde se para el caballo. Cualquiera sirve… pero unas ayudan más que otras.", "normal");
  pintar();
}

/* ---------------- Récord ---------------- */
function leerNumero(clave) {
  try { return Number(localStorage.getItem(clave)) || 0; } catch (e) { return 0; }
}

function guardarMarca() {
  const n = pisadas.size;
  try {
    if (n > leerNumero(CLAVE_RECORD)) localStorage.setItem(CLAVE_RECORD, String(n));
    if (!conAyuda && n > leerNumero(CLAVE_LIMPIO)) localStorage.setItem(CLAVE_LIMPIO, String(n));
  } catch (e) {}
  pintarRecord();
}

function pintarRecord() {
  const mejor = leerNumero(CLAVE_RECORD);
  const limpio = leerNumero(CLAVE_LIMPIO);
  $("m-record").textContent = mejor ? String(mejor) : "—";
  $("m-record").nextElementSibling.textContent = (limpio && limpio !== mejor)
    ? `tu récord · ${limpio} sin pistas`
    : "tu récord";
}

/* ---------------- Arranque ---------------- */
$("btn-reiniciar").addEventListener("click", reiniciar);
$("btn-deshacer").addEventListener("click", deshacer);
$("btn-pista").addEventListener("click", pista);

(async function init() {
  construirTablero();
  if (window.EntrenoProgress) { try { await EntrenoProgress.init(); } catch (e) {} }
  if (window.ProgresoUsuario) { try { await ProgresoUsuario.init(); } catch (e) {} }
  pintarRecord();
  pintar();
})();
    