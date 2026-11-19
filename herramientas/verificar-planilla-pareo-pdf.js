/* La planilla para imprimir (herramientas/planilla-pareo-pdf.js) se lee bien con «📷 Planilla».
 *
 * No hay Google Vision acá: se abre la planilla en el navegador, se mide dónde quedó de verdad
 * cada número impreso y cada casilla, y se arman las «palabras» que devolvería Vision (el número
 * con su caja, y una jugada escrita en cada casilla). Eso pasa por
 * PlanillaReconstruir.hojasDeLaFoto(), el mismo código que lee las fotos, y cada jugada tiene que
 * caer en SU casilla:
 *   - escrita al centro de la casilla (lo que pide la planilla);
 *   - escrita pegada al borde izquierdo de la casilla de las Negras, o al derecho de la de las
 *     Blancas (lo peor que se hace a mano): la raya entre Blancas y Negras tiene que caer donde el
 *     lector parte las dos;
 *   - con las DOS planillas en una sola foto, una al lado de la otra, y un poco torcidas;
 *   - y que de las 60 jugadas salga la partida entera con reconstruir().
 * Además: el PDF está en la raíz y la planilla lleva la marca de agua.
 *     node herramientas/verificar-todo.js planilla-pareo-pdf */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { Chess } = require("chess.js");
const R = require("../js/planilla-reconstruir.js");
const { html } = require("./planilla-pareo-pdf.js");

let pruebas = 0, fallos = 0;
function ok(nombre, cond, detalle) {
  pruebas++;
  if (cond) console.log("  ✓ " + nombre);
  else { fallos++; console.log("  ✗ " + nombre + (detalle ? " → " + detalle : "")); }
}

// Una partida de verdad de 60 jugadas (la de la planilla del Centroamericano, alargada con jugadas legales).
function partida(n) {
  const g = new Chess();
  const base = "f4 Nf6 Nf3 d5 e3 c5 b3 Nc6 Bb5 Bd7 Bb2 Qb6 Bxc6 Bxc6 O-O g6 a4 Bg7 Qe2 O-O Ne5 Rad8 d3 Qc7 Nxc6 Qxc6 Nd2 Rfe8 Rad1 a6 g4 b5 axb5 axb5 Qf3 Qd7 h3 Ra8 g5 Nh5 Bxg7 Nxg7 c4 Red8 Nb1 bxc4 dxc4 d4 Nc3 Rab8 Nb5 Nf5 Rfe1 d3 Rd2".split(" ");
  base.forEach((m) => g.move(m));
  // se completa con la primera jugada legal que no sea captura ni jaque, para que la partida siga larga
  while (g.history().length < n) {
    const ms = g.moves({ verbose: true });
    const m = ms.find((x) => !x.captured && !/[+#]/.test(x.san)) || ms[0];
    if (!m) break;
    g.move(m.san);
  }
  return g.history();
}
const ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
const enEspanol = (s) => s.replace(/^[KQRBN]/, (p) => ES[p]).replace(/=([QRBN])/, (m, p) => "=" + ES[p]).replace(/O/g, "0");

(async () => {
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 2 });
  await pagina.setContent(html(), { waitUntil: "load" });
  const medida = await pagina.evaluate(() => {
    const caja = (el) => { const r = el.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; };
    const n = [...document.querySelectorAll("[data-n]")].map((el) => {
      // la caja del número es la del texto, no la de la casilla
      const rango = document.createRange(); rango.selectNodeContents(el);
      const r = rango.getBoundingClientRect();
      return { n: +el.dataset.n, caja: { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom } };
    });
    const c = {};
    document.querySelectorAll("[data-celda]").forEach((el) => { c[el.dataset.celda] = caja(el); });
    const marca = document.querySelector("img.marca");
    return { n, c, marca: marca ? { src: marca.src.slice(0, 30), visible: marca.checkVisibility(), alto: marca.getBoundingClientRect().height, abajo: marca.getBoundingClientRect().bottom } : null, ancho: document.querySelector(".hoja").getBoundingClientRect().width, primeraCasilla: document.querySelector("table.bloque").getBoundingClientRect().top };
  });
  await navegador.close();

  const jugadas = partida(120);
  const ESCALA = 3; // px de la foto por px de la página (una foto de unos 2400 px de ancho)

  /* Las palabras de una planilla: los 60 números y una jugada por casilla. `donde` dice en qué parte
     de la casilla se escribe; dx/inclinacion mueven y tuercen la hoja en la foto. */
  function palabras({ donde = "centro", dx = 0, inclinacion = 0 } = {}) {
    const p = (x, y) => ({ x: (x + dx + y * inclinacion) * ESCALA, y: (y - x * inclinacion) * ESCALA });
    const w = (text, b) => {
      const a = p(b.x0, b.y0), z = p(b.x1, b.y1);
      return { text, bbox: { x0: Math.round(a.x), y0: Math.round(a.y), x1: Math.round(z.x), y1: Math.round(z.y) } };
    };
    const out = medida.n.map((x) => w(String(x.n), x.caja));
    jugadas.forEach((san, i) => {
      const fila = Math.floor(i / 2) + 1, negras = i % 2 === 1;
      const c = medida.c[fila + (negras ? "n" : "b")];
      if (!c) return;
      const texto = enEspanol(san);
      const largo = Math.min(c.x1 - c.x0 - 4, texto.length * 13); // ~13 px (3,4 mm) por letra a mano
      let x0 = (c.x0 + c.x1) / 2 - largo / 2;
      if (donde === "borde") x0 = negras ? c.x0 + 2 : c.x1 - 2 - largo;
      out.push(w(texto, { x0, x1: x0 + largo, y0: c.y0 + (c.y1 - c.y0) * 0.2, y1: c.y1 - (c.y1 - c.y0) * 0.2 }));
    });
    return out;
  }
  const esperado = jugadas.slice(0, 120).map(enEspanol);
  const comparar = (hoja) => esperado.map((s, i) => (hoja[i] === s ? null : `${i}: «${hoja[i] || ""}» en vez de «${s}»`)).filter(Boolean);

  console.log("\n=== La planilla: números, casillas y marca de agua ===");
  ok("los 60 números impresos, en tres bloques de 20", medida.n.length === 60 && medida.n.every((x, i) => x.n === i + 1), String(medida.n.length));
  ok("las 120 casillas (Blancas y Negras de cada renglón)", Object.keys(medida.c).length === 120, String(Object.keys(medida.c).length));
  ok("lleva la marca de agua de Ajedrez Integral, visible y en el encabezado (no sobre las casillas)",
    medida.marca && medida.marca.visible && medida.marca.src.startsWith("data:image/png") && medida.marca.abajo < medida.primeraCasilla,
    JSON.stringify(medida.marca));

  console.log("\n=== Lo que se escribe, en su casilla ===");
  const una = R.hojasDeLaFoto(palabras());
  ok("una planilla sola: sale por los números (no por filas sueltas)", una.metodo === "numeros" && una.hojas.length === 1, una.metodo + " " + una.hojas.length);
  const malCentro = comparar(una.hojas[0] || []);
  ok("escritas al centro de la casilla, las 120 medias jugadas caen cada una en la suya", !malCentro.length, malCentro.slice(0, 4).join(" · "));
  const borde = R.hojasDeLaFoto(palabras({ donde: "borde" }));
  const malBorde = comparar(borde.hojas[0] || []);
  ok("pegadas a la raya entre Blancas y Negras, tampoco se cruzan de lado", !malBorde.length, malBorde.slice(0, 4).join(" · "));

  console.log("\n=== Las dos planillas en una foto ===");
  const dos = R.hojasDeLaFoto(palabras({ inclinacion: 0.012 }).concat(palabras({ dx: medida.ancho + 30, inclinacion: 0.012 })));
  ok("encuentra las dos planillas", dos.hojas.length === 2, String(dos.hojas.length));
  const malDos = dos.hojas.map(comparar);
  ok("y en las dos, torcidas un poco (0,7°), cada jugada en su casilla", malDos.length === 2 && malDos.every((m) => !m.length), malDos.map((m) => m.slice(0, 3).join(" · ")).join(" | "));

  console.log("\n=== Y la partida entera ===");
  const r = R.reconstruir(Chess, dos.hojas);
  const salio = r.jugadas.map((j) => j.san);
  const hasta = jugadas.findIndex((s, i) => salio[i] !== s);
  ok("reconstruir() saca las 120 medias jugadas exactas", hasta === -1 && salio.length === 120, `hasta ${hasta}, ${salio.length} medias`);

  console.log("\n=== El PDF ===");
  const pdf = path.join(__dirname, "..", "planilla-pareo-integral.pdf");
  ok("planilla-pareo-integral.pdf está en la raíz (node herramientas/planilla-pareo-pdf.js)", fs.existsSync(pdf) && fs.statSync(pdf).size > 20000, fs.existsSync(pdf) ? fs.statSync(pdf).size + " bytes" : "no está");

  console.log(`\n${pruebas - fallos}/${pruebas} comprobaciones bien.`);
  if (fallos) { console.log(`✗ ${fallos} fallaron.`); process.exit(1); }
  console.log("✓ Todo bien.");
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
