/* Comprueba con chess.js el banco de js/aperturas-lineas.js.
 *
 * Lo que se busca es el error que NO se ve: una jugada mal escrita no falla en
 * pantalla, simplemente hace que el alumno nunca pueda terminar esa línea — se
 * queda intentando una jugada que el tablero no acepta y no entiende por qué.
 *
 * Comprueba de una corrida:
 *   - que no haya ids repetidos, y que ninguno tenga caracteres raros
 *     (el id es la clave con la que queda guardado el avance de cada alumno);
 *   - que TODAS las jugadas de cada línea sean legales, una por una;
 *   - que la línea empiece por las blancas y alterne bien;
 *   - que si la jugada dice "#" sea mate de verdad, y si dice "+" sea jaque;
 *   - que el alumno tenga al menos tres jugadas que dar (si no, no hay nada
 *     que memorizar);
 *   - que cada línea traiga nombre, apertura, idea y clave, con tipo, color y
 *     nivel de la lista permitida;
 *   - que la traducción a la notación de acá no invente ni pierda jugadas.
 *
 * Necesita chess.js instalado aparte:
 *   npm install chess.js@0.10.3 && node herramientas/verificar-aperturas.js   */
const path = require("path");
const { LINEAS, jugadasDelAlumno } = require(path.join(__dirname, "..", "js", "aperturas-lineas.js"));

let Chess;
try {
  const mod = require("chess.js");
  Chess = mod.Chess || mod;
} catch (e) {
  console.error("Falta chess.js. Instálalo con:  npm install chess.js@0.10.3");
  process.exit(2);
}

const TIPOS = new Set(["celada", "apertura"]);
const COLORES = new Set(["w", "b"]);
const NIVELES = new Set([1, 2, 3]);
const MINIMO_DEL_ALUMNO = 3;

// La misma tabla que usa la página para enseñar las jugadas en español.
const PIEZAS = { N: "C", B: "A", R: "T", Q: "D", K: "R" };
function aEspanol(san) {
  return String(san).replace(/[NBRQK]/g, (l) => PIEZAS[l]);
}

let fallos = 0;
function mal(donde, que) { console.log("  ✗ " + donde + ": " + que); fallos += 1; }

const vistos = new Set();
let jugadasRevisadas = 0;

LINEAS.forEach((L, indice) => {
  const donde = `${L.id || "(sin id)"} [${indice}]`;

  // ---- identidad
  if (!L.id) mal(donde, "no tiene id");
  else if (!/^[a-z0-9-]+$/.test(L.id)) mal(donde, "el id lleva caracteres que no son letras minúsculas, números o guiones");
  else if (vistos.has(L.id)) mal(donde, "el id está repetido");
  vistos.add(L.id);

  ["nombre", "apertura", "idea", "clave"].forEach((campo) => {
    if (!L[campo] || !String(L[campo]).trim()) mal(donde, "le falta " + campo);
  });
  if (!TIPOS.has(L.tipo)) mal(donde, "tipo desconocido: " + L.tipo);
  if (!COLORES.has(L.color)) mal(donde, "color desconocido: " + L.color);
  if (!NIVELES.has(L.nivel)) mal(donde, "nivel fuera de 1 a 3: " + L.nivel);

  // ---- las jugadas
  if (!Array.isArray(L.jugadas) || !L.jugadas.length) { mal(donde, "no tiene jugadas"); return; }

  const juego = new Chess();
  let rota = false;
  L.jugadas.forEach((san, i) => {
    if (rota) return;
    // La línea empieza siempre por las blancas y alterna.
    const tocaA = i % 2 === 0 ? "w" : "b";
    if (juego.turn() !== tocaA) { mal(donde, `en la jugada ${i + 1} (${san}) le toca a ${juego.turn()} y debería tocarle a ${tocaA}`); rota = true; return; }

    const hecha = juego.move(san, { sloppy: true });
    if (!hecha) { mal(donde, `la jugada ${i + 1} no es legal ahí: "${san}"  ·  FEN ${juego.fen()}`); rota = true; return; }
    jugadasRevisadas += 1;

    // Lo que promete la notación tiene que ser verdad.
    if (san.indexOf("#") !== -1 && !(juego.in_checkmate && juego.in_checkmate())) {
      mal(donde, `"${san}" dice mate y no es mate`);
    }
    if (san.indexOf("+") !== -1 && san.indexOf("#") === -1 && !(juego.in_check && juego.in_check())) {
      mal(donde, `"${san}" dice jaque y no es jaque`);
    }
    // Y al revés: si es mate, que lo diga, porque es lo que el alumno escribe.
    if (juego.in_checkmate && juego.in_checkmate() && san.indexOf("#") === -1) {
      mal(donde, `la jugada ${i + 1} ("${san}") da mate y no lleva el "#"`);
    }
  });
  if (rota) return;

  // ---- que haya algo que memorizar
  const mias = jugadasDelAlumno(L);
  if (mias < MINIMO_DEL_ALUMNO) {
    mal(donde, `al alumno solo le tocan ${mias} jugadas; hacen falta al menos ${MINIMO_DEL_ALUMNO}`);
  }

  // ---- la traducción no puede perder ni inventar jugadas
  const traducidas = L.jugadas.map(aEspanol);
  if (traducidas.length !== L.jugadas.length) mal(donde, "la traducción cambió la cantidad de jugadas");
  traducidas.forEach((t, i) => {
    if (/[NBQK]/.test(t) && !/O-O/.test(L.jugadas[i])) {
      mal(donde, `la jugada ${i + 1} quedó a medio traducir: "${t}"`);
    }
  });
});

// Una foto del banco, para que se vea si queda cojo de algún lado.
const porTipo = {}, porNivel = {}, porColor = {};
LINEAS.forEach((L) => {
  porTipo[L.tipo] = (porTipo[L.tipo] || 0) + 1;
  porNivel[L.nivel] = (porNivel[L.nivel] || 0) + 1;
  porColor[L.color] = (porColor[L.color] || 0) + 1;
});
console.log(`${LINEAS.length} líneas · ${jugadasRevisadas} jugadas comprobadas con chess.js`);
console.log(`  por tipo:  ${JSON.stringify(porTipo)}`);
console.log(`  por nivel: ${JSON.stringify(porNivel)}`);
console.log(`  de qué lado juega el alumno: ${JSON.stringify(porColor)}`);
if (!porTipo.celada || !porTipo.apertura) { console.log("  ✗ el banco tiene que traer celadas Y aperturas"); fallos += 1; }
if (!porColor.w || !porColor.b) { console.log("  ✗ tiene que haber líneas de los dos colores"); fallos += 1; }

// ===========================================================================
// El otro pedazo: la repetición espaciada (js/repaso-espaciado.js).
// Va acá porque es el módulo que mueve este banco, y un error suyo tampoco se
// ve: la línea simplemente deja de aparecer, o aparece todos los días.
// ===========================================================================
const SRS = require(path.join(__dirname, "..", "js", "repaso-espaciado.js"));
const D = "2026-01-01";
function comprueba(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
}

console.log("\nRepetición espaciada:");
{
  // Acertar siempre: los intervalos crecen, y cada vez más porque la facilidad
  // también sube. 1, 3 días fijos y de ahí en adelante multiplicando.
  let f = SRS.fichaNueva(), dia = D;
  const pasos = [];
  for (let i = 0; i < 6; i++) { f = SRS.calificar(f, "bien", dia); pasos.push(f.intervalo); dia = f.vence; }
  comprueba("siempre bien: los intervalos crecen", pasos, [1, 3, 8, 23, 69, 180]);
  comprueba("y se topan en medio año", SRS.calificar({ ...f, intervalo: 170 }, "bien", dia).intervalo, SRS.TOPE_DIAS);

  // Fallar devuelve la línea a hoy y la manda al principio.
  const tras = SRS.calificar({ facilidad: 2.5, intervalo: 21, repasos: 4, fallos: 0, vence: D, ultimo: null }, "mal", D);
  comprueba("fallar: vuelve hoy y empieza de cero",
    { intervalo: tras.intervalo, repasos: tras.repasos, vence: tras.vence },
    { intervalo: 0, repasos: 0, vence: D });
  comprueba("fallar baja la facilidad", Math.round(tras.facilidad * 100) / 100, 2.3);

  // La facilidad no se escapa por ningún lado por mucho que se insista.
  let dura = SRS.fichaNueva();
  for (let i = 0; i < 20; i++) dura = SRS.calificar(dura, "mal", D);
  comprueba("la facilidad tiene piso", dura.facilidad, SRS.FACILIDAD_MINIMA);
  let facil = SRS.fichaNueva();
  for (let i = 0; i < 20; i++) facil = SRS.calificar(facil, "bien", facil.vence);
  comprueba("y techo", facil.facilidad, SRS.FACILIDAD_MAXIMA);

  // "Regular" avanza, pero menos que "bien", y deja la línea marcada.
  const unaBien = SRS.calificar(SRS.fichaNueva(), "bien", D);
  comprueba("regular avanza menos que bien",
    SRS.calificar(unaBien, "regular", D).intervalo < SRS.calificar(unaBien, "bien", D).intervalo, true);
  comprueba("regular baja la facilidad", SRS.calificar(unaBien, "regular", D).facilidad < unaBien.facilidad, true);

  // A quién le toca hoy: lo vencido primero, lo nuevo al final.
  const estado = {
    vieja:    { facilidad: 2.5, intervalo: 3, repasos: 2, fallos: 0, vence: "2025-12-01", ultimo: "2025-11-28T00:00:00Z" },
    reciente: { facilidad: 2.5, intervalo: 3, repasos: 2, fallos: 0, vence: "2025-12-20", ultimo: "2025-12-17T00:00:00Z" },
    futura:   { facilidad: 2.5, intervalo: 9, repasos: 3, fallos: 0, vence: "2026-06-01", ultimo: "2026-01-01T00:00:00Z" },
  };
  comprueba("pendientes: lo más atrasado primero, lo nuevo al final",
    SRS.pendientes(["futura", "nueva", "reciente", "vieja"], estado, D), ["vieja", "reciente", "nueva"]);
  comprueba("una que todavía no vence no aparece", SRS.pendientes(["futura"], estado, D), []);
  comprueba("una nunca vista siempre toca", SRS.toca(undefined, D), true);
  comprueba("el resumen cuenta bien",
    SRS.resumen(["futura", "nueva", "reciente", "vieja"], estado, D),
    { total: 4, nuevas: 1, pendientes: 3, aprendiendo: 3, firmes: 0 });

  // Calificar devuelve una ficha nueva, no toca la que recibe: si la mutara,
  // el estado quedaría cambiado aunque el guardado fallara después.
  const original = SRS.fichaNueva();
  const copia = JSON.parse(JSON.stringify(original));
  SRS.calificar(original, "bien", D);
  comprueba("calificar no toca la ficha original", original, copia);
}

console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
