/* Verifica js/lector-reloj.js: leer el tiempo de un reloj de ajedrez de siete
 * segmentos en la imagen de la cámara. Sin navegador: se dibujan relojes de
 * mentira (en gris, como los lee la cámara) con lo que tienen los de verdad —
 * números inclinados, los dos puntos, el marco del reloj dentro del recuadro,
 * ruido, desenfoque, pantalla gris con números oscuros o luces sobre negro— y
 * se comprueba que lee el tiempo, o que NO lee nada cuando no hay un tiempo
 * que tenga sentido. Ver «El reloj leído de la imagen» en
 * docs/decisiones/juegos-y-torneos.md.
 *
 *   node herramientas/verificar-lector-reloj.js
 */
"use strict";
const R = require("../js/lector-reloj.js");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const ok = JSON.stringify(hallado) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log((ok ? "  ✓ " : "  ✗ ") + nombre + (ok ? "" : " — hallado " + JSON.stringify(hallado) + ", se esperaba " + JSON.stringify(esperado)));
}

// Qué rayas tiene cada número (a arriba, b arriba der., c abajo der., d abajo, e abajo izq., f arriba izq., g medio).
const SEG = { 0: "abcdef", 1: "bc", 2: "abdeg", 3: "abcdg", 4: "bcfg", 5: "acdfg", 6: "acdefg", 7: "abc", 8: "abcdefg", 9: "abcdfg" };

/* Un reloj de mentira: `texto` como «1:05:32» (los «:» son dos puntos y el
 * «.» un punto bajo), con su alto de número, su inclinación y su pantalla. */
function dibujar(texto, o) {
  o = Object.assign({ alto: 40, inclina: 0.15, fondo: 185, tinta: 45, marco: true, ruido: 12, borroso: true, W: 400, H: 140, x: 60, y: 40, sinUno: false }, o);
  const { W, H } = o;
  const img = new Float64Array(W * H).fill(o.marco ? 30 : o.fondo);
  // La pantalla del reloj (con el marco oscuro alrededor si `marco`).
  const px0 = o.x - 18, py0 = o.y - 14, px1 = o.x + 290, py1 = o.y + o.alto + 14;
  for (let y = py0; y < py1; y++) for (let x = px0; x < px1; x++) img[y * W + x] = o.fondo;
  const ancho = Math.round(o.alto * 0.55), grosor = Math.max(2, Math.round(o.alto * 0.11)), hueco = Math.max(1, Math.round(grosor / 3));
  const pinta = (x0, y0, x1, y1) => {
    for (let y = Math.round(y0); y < Math.round(y1); y++) for (let x = Math.round(x0); x < Math.round(x1); x++) {
      // La inclinación: lo de arriba corrido a la derecha.
      const xx = Math.round(x + o.inclina * (o.y + o.alto - 1 - y));
      if (xx >= 0 && xx < W && y >= 0 && y < H) img[y * W + xx] = o.tinta;
    }
  };
  let cx = o.x;
  for (const ch of texto) {
    if (ch === ":") { pinta(cx + 2, o.y + o.alto * 0.25, cx + 2 + grosor, o.y + o.alto * 0.25 + grosor); pinta(cx + 2, o.y + o.alto * 0.68, cx + 2 + grosor, o.y + o.alto * 0.68 + grosor); cx += grosor + 8; continue; }
    if (ch === ".") { pinta(cx + 2, o.y + o.alto - grosor, cx + 2 + grosor, o.y + o.alto); cx += grosor + 8; continue; }
    const s = SEG[ch], A = o.alto, w = ancho, t = grosor, m = A / 2;
    // El 1 de los relojes va a la derecha de su lugar, como en uno de verdad.
    if (s.includes("a")) pinta(cx + hueco, o.y, cx + w - hueco, o.y + t);
    if (s.includes("g")) pinta(cx + hueco, o.y + m - t / 2, cx + w - hueco, o.y + m + t / 2);
    if (s.includes("d")) pinta(cx + hueco, o.y + A - t, cx + w - hueco, o.y + A);
    if (s.includes("f")) pinta(cx, o.y + hueco, cx + t, o.y + m - hueco);
    if (s.includes("b")) pinta(cx + w - t, o.y + hueco, cx + w, o.y + m - hueco);
    if (s.includes("e")) pinta(cx, o.y + m + hueco, cx + t, o.y + A - hueco);
    if (s.includes("c")) pinta(cx + w - t, o.y + m + hueco, cx + w, o.y + A - hueco);
    cx += w + Math.round(A * 0.2);
  }
  // Desenfoque (una caja de 3 × 3) y ruido, como los de una cámara.
  let out = img;
  if (o.borroso) {
    out = new Float64Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += img[(y + dy) * W + x + dx];
      out[y * W + x] = s / 9;
    }
  }
  let semilla = 7;
  const g = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
    g[i] = Math.max(0, Math.min(255, Math.round(out[i] + ((semilla % (2 * o.ruido + 1)) - o.ruido))));
  }
  // El recuadro que marca la persona: un poco más grande que los números, con algo del marco adentro.
  return { g, W, H, recuadro: { x: px0 - 8, y: py0 - 6, w: 300 + 26, h: o.alto + 40 } };
}
const leer = (d) => { const r = R.leer(d.g, d.W, d.H, d.recuadro); return r && r.texto; };

console.log("\nLos números de siete segmentos");
for (const [texto, esperado] of [["1:05:32", "1:05:32"], ["0.58.10", "58:10"], ["14:07", "14:07"], ["9:41", "9:41"], ["0:00", "0:00"], ["1:29:59", "1:29:59"], ["2:00:00", "2:00:00"], ["0.03.08", "3:08"]]) {
  igual("«" + texto + "» se lee " + esperado, leer(dibujar(texto)), esperado);
}
igual("todos los números del 0 al 9 (dos relojes)", [leer(dibujar("3:45:12")), leer(dibujar("6:07:89".replace("89", "59")))], ["3:45:12", "6:07:59"]);
igual("y el 8 y el 0 juntos", leer(dibujar("8:08")), "8:08");

console.log("\nComo los ve la cámara");
igual("sin inclinación", leer(dibujar("1:05:32", { inclina: 0 })), "1:05:32");
igual("muy inclinados (0,28)", leer(dibujar("1:05:32", { inclina: 0.28 })), "1:05:32");
igual("más chicos (20 px de alto)", leer(dibujar("12:34", { alto: 20 })), "12:34");
igual("más grandes (70 px)", leer(dibujar("12:34", { alto: 70, x: 40 })), "12:34");
igual("con poca diferencia entre números y pantalla", leer(dibujar("1:05:32", { fondo: 150, tinta: 90 })), "1:05:32");
igual("un reloj de luces (claras sobre negro)", leer(dibujar("1:05:32", { fondo: 20, tinta: 230, marco: false })), "1:05:32");
igual("con más ruido", leer(dibujar("47:15", { ruido: 25 })), "47:15");

console.log("\nLo que NO es un tiempo no se usa");
igual("un recuadro sin números no da nada", R.leer(dibujar("1:05:32").g, 400, 140, { x: 0, y: 0, w: 30, h: 30 }), null);
igual("más de 59 segundos no es un tiempo", R.tiempo("1075"), null);
igual("más de 59 minutos con cuatro números, tampoco", R.tiempo("7512"), null);
igual("los números leídos pasan a tiempo: 1:05:32", R.tiempo("10532"), 3932000);
igual("números seguidos sin separadores no son un tiempo (pedazos de dos pantallas)", leer(dibujar("32058")), null);
{
  // Una raya tapada (una mano encima, un reflejo): ese número no se reconoce y la lectura no vale.
  const d = dibujar("1:05:32");
  // La mitad de arriba del «0» (el segundo número; con la inclinación, lo de arriba va corrido a la derecha).
  for (let y = 38; y < 59; y++) for (let x = 100; x < 136; x++) d.g[y * d.W + x] = 185;
  igual("con un número tapado a medias no inventa un tiempo", leer(d), null);
}

{
  // Un número tapado entero: sin el chequeo de los grupos de a dos daría «1:53:2».
  const d = dibujar("1:05:32");
  for (let y = 30; y < 90; y++) for (let x = 98; x < 136; x++) d.g[y * d.W + x] = 185;
  igual("con un número tapado entero, tampoco", leer(d), null);
}

console.log("\nGirado, como lo ve una cámara encima de la mesa");
// La imagen entera girada (y su recuadro con ella).
function girar(d, giro) {
  const { g, W, H, recuadro: r } = d;
  if (giro === 180) {
    const o = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) o[i] = g[W * H - 1 - i];
    return { g: o, W, H, recuadro: { x: W - r.x - r.w, y: H - r.y - r.h, w: r.w, h: r.h } };
  }
  // 90 en el sentido del reloj: (x, y) → (H - 1 - y, x).
  const o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) o[x * H + (H - 1 - y)] = g[y * W + x];
  return { g: o, W: H, H: W, recuadro: { x: H - r.y - r.h, y: r.x, w: r.h, h: r.w } };
}
const conGiro = (d) => { const r = R.leer(d.g, d.W, d.H, d.recuadro); return r && [r.texto, r.giro]; };
igual("girado un cuarto de vuelta", conGiro(girar(dibujar("1:05:32"), 90)), ["1:05:32", 270]);
igual("girado tres cuartos", conGiro(girar(girar(girar(dibujar("1:05:32"), 90), 90), 90)), ["1:05:32", 90]);
igual("de cabeza (la cámara del lado de las negras): lo dice la inclinación", conGiro(girar(dibujar("46:08"), 180)), ["46:08", 180]);
igual("y derecho sigue derecho", conGiro(dibujar("46:08")), ["46:08", 0]);

console.log("\nBuscar el reloj en la imagen entera");
{
  // Una escena: la mesa, un tablero (cuadros que no son números) y el reloj con sus dos tiempos.
  const W = 900, H = 600, g = new Uint8Array(W * H);
  let semilla = 3;
  for (let i = 0; i < W * H; i++) { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; g[i] = 120 + (semilla % 13) - 6; }
  for (let y = 40; y < 440; y++) for (let x = 40; x < 440; x++) g[y * W + x] = ((Math.floor((x - 40) / 50) + Math.floor((y - 40) / 50)) % 2) ? 200 : 70;
  const pegar = (d, ox, oy) => { for (let y = 0; y < d.H; y++) for (let x = 0; x < d.W; x++) g[(oy + y) * W + ox + x] = d.g[y * d.W + x]; };
  pegar(dibujar("1:05:32", { W: 400, H: 140 }), 480, 100);
  pegar(dibujar("58:10", { W: 400, H: 140 }), 480, 300);
  const fuera = (x, y) => x >= 30 && x < 450 && y >= 30 && y < 450;
  const hallados = R.buscar(g, W, H, { fuera });
  igual("encuentra los dos tiempos, cada uno en su lugar", hallados.map((h) => [h.texto, h.y < 250 ? "arriba" : "abajo"]).sort(), [["1:05:32", "arriba"], ["58:10", "abajo"]]);
  igual("y en el tablero no ve ningún reloj", hallados.every((h) => h.x >= 450), true);
  const sinReloj = R.buscar(g.map((v, i) => ((i % W) >= 470 ? 120 : v)), W, H, { fuera });
  igual("sin reloj en la mesa, no inventa ninguno", sinReloj, []);
  const g90 = girar({ g, W, H, recuadro: { x: 0, y: 0, w: 1, h: 1 } }, 90);
  igual("con la cámara girada, los encuentra igual", R.buscar(g90.g, g90.W, g90.H, { fuera: (x, y) => fuera(y, H - 1 - x) }).map((h) => h.texto).sort(), ["1:05:32", "58:10"]);
}

console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nEl reloj se lee como se pidió.");
process.exit(fallos ? 1 : 0);
