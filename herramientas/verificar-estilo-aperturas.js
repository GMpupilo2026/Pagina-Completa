/* Comprueba el carácter de cada apertura (bloque MEDIDO de js/estilo-aperturas.js).
 *
 * Sin navegador ni motor. Todo lo que puede estar mal se rompe callado: la
 * recomendación sale igual de prolija y propone una apertura por un dato que
 * no es suyo.
 *
 *  1. EL BLOQUE A MANO. Se vuelve a medir todo con
 *     herramientas/estilo-aperturas-medir.js, sobre las mismas partidas, y
 *     tiene que dar exactamente lo guardado.
 *  2. UNA APERTURA QUE NO EXISTE O QUE FALTA. Cada fila es una línea de
 *     «Aperturas y celadas» (js/aperturas-lineas.js) y cada línea de apertura
 *     tiene su fila: si se agrega una, entra a la recomendación midiéndola.
 *  3. MEDIR LO QUE NO ES. Con menos partidas que el mínimo, sin medir; y si
 *     se midió quitando una jugada, la quitada es del rival (nunca una propia:
 *     medir el gambito de rey con todas las partidas de 1.e4 e5 sería medir
 *     la española).
 *  3b. UNA APERTURA QUE NUNCA SE RECOMIENDA. Ninguna queda sin medir: lo que
 *     no se midió no se recomienda nunca, sin que nadie se entere. Si una
 *     línea nueva no tiene partidas, se buscan en KingBase
 *     (herramientas/estilo-aperturas-kingbase.js).
 *  4. UNA RECOMENDACIÓN SIN OPCIONES. Con blancas, contra 1.e4 y contra 1.d4
 *     hay al menos 6 aperturas medidas para elegir.
 *
 * Uso:  npm install && node herramientas/verificar-estilo-aperturas.js
 */
"use strict";
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const { Chess } = require(path.join(RAIZ, "node_modules", "chess.js"));
const Medir = require("./estilo-aperturas-medir.js");
const A = require("../js/estilo-aperturas.js");
const { LINEAS } = require("../js/aperturas-lineas.js");

const fallas = [];
const falla = (id, msg) => fallas.push(id + ": " + msg);

// 1. Medido de nuevo, igual.
const otra = Medir.medir();
const porId = new Map(otra.map((x) => [x.id, x]));
for (const m of A.MEDIDO) {
  const o = porId.get(m.id);
  if (!o) { falla(m.id, "no sale al volver a medir"); continue; }
  if (JSON.stringify(o) !== JSON.stringify(m)) falla(m.id, "no es lo que da medir de nuevo (¿se editó a mano?): " + JSON.stringify(o).slice(0, 160));
}

// 3b. Ninguna sin medir.
for (const m of A.MEDIDO) if (!m.n) falla(m.id, "sin medir (menos de " + Medir.MINIMO + " partidas): búscale partidas con herramientas/estilo-aperturas-kingbase.js");

// 2. Una fila por línea de apertura, y ninguna de más.
const aperturas = LINEAS.filter((l) => l.tipo === "apertura");
for (const l of aperturas) if (!A.medidaDe(l.id)) falla(l.id, "la línea no tiene su medida");
for (const m of A.MEDIDO) if (!aperturas.some((l) => l.id === m.id)) falla(m.id, "no es una línea de apertura de Aperturas y celadas");

// 3. El mínimo, y nunca quitar una jugada propia.
for (const m of A.MEDIDO) {
  const l = aperturas.find((x) => x.id === m.id);
  if (!l) continue;
  if (m.n && m.n < Medir.MINIMO) falla(m.id, "medida con " + m.n + " partidas (el mínimo es " + Medir.MINIMO + ")");
  if (!m.n) continue;
  if (JSON.stringify(m.define) !== JSON.stringify(l.jugadas.slice(0, m.define.length))) falla(m.id, "su posición propia no es de su línea");
  if (m.base !== "variante") {
    if (!Array.isArray(m.base) || m.base.length !== m.define.length - 1) { falla(m.id, "solo se puede quitar UNA jugada: " + JSON.stringify(m.base)); continue; }
    const quitada = m.define.length - 1;   // media jugada quitada (desde 0)
    const deQuien = quitada % 2 === 0 ? "w" : "b";
    if (deQuien === l.color) falla(m.id, "se midió quitando una jugada propia (" + m.define[quitada] + ")");
  }
  for (const e of A.EJES) if (!(m.car[e] >= -1 && m.car[e] <= 1)) falla(m.id, "car." + e + " fuera de −1…1");
  try { const c = new Chess(); m.define.forEach((s) => { if (!c.move(s)) throw new Error(s); }); } catch (e) { falla(m.id, "su posición propia no se puede jugar: " + e.message); }
}

// 4. Opciones para elegir.
for (const [g, def] of Object.entries(A.GRUPOS)) {
  const n = A.MEDIDO.filter((m) => m.n && m.color === def.color && (!def.contra || m.contra === def.contra)).length;
  if (n < 6) falla(g, "solo " + n + " aperturas medidas para recomendar");
}

if (fallas.length) {
  console.error("✗ El carácter de las aperturas: " + fallas.length + " problema(s)\n  " + fallas.join("\n  "));
  process.exit(1);
}
console.log("✓ El carácter de las aperturas: " + A.MEDIDO.filter((m) => m.n).length + " de " + A.MEDIDO.length + " medidas, iguales al volver a medir");
