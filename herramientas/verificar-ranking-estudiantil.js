/* Comprueba js/ranking-estudiantil.js (RankingEstudiantil), el cálculo del
   «Ranking estudiantil por categoría», sin navegador: con unos pocos torneos
   armados a mano en la MISMA forma de data/ajedrez-estudiantil*.json, leídos
   con js/jde-datos.js (el mismo lector de las páginas).

   Lo que se rompe callado acá:
   - que pese más un buen puesto en la regional que llegar a la final;
   - contar torneos por equipos (el puesto es del equipo) o blitz;
   - dejar afuera la final cuyo nombre llegó sin la rama («…Individual A»);
   - el lugar compartido de dos estudiantes iguales en todo;
   - la región, que es la de la regional (la final no tiene).

   Ver «Ranking estudiantil por categoría» en docs/decisiones/juegos-y-torneos.md.

   Uso:  node herramientas/verificar-ranking-estudiantil.js */
"use strict";
const fs = require("fs");
const path = require("path");
const RK = require("../js/ranking-estudiantil.js");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
  else console.log("  ✓ " + nombre);
}

// Los archivos, en su forma de siempre. Torneos 2026, categoría D:
//   1 Regional Alajuela abierta, 2 Regional Cartago abierta, 3 Nacional (sin
//   rama en el nombre), 4 Regional Alajuela femenina, 5 Nacional por equipos,
//   6 Regional Alajuela blitz, 7 una regional de otra categoría (C).
const COLS = ["clave", "anio", "etapa", "categoria", "nombre", "inicio", "lugar", "region", "jugadores", "rondas", "modalidad", "ritmo", "rama"];
const T = (clave, etapa, region, rama, extra) => Object.assign({ clave, anio: 2026, etapa, categoria: "D", nombre: "Torneo " + clave, inicio: "2026-03-0" + (clave % 9 + 1), lugar: "", region, jugadores: 6, rondas: 5, modalidad: "Individual", ritmo: "Clásico", rama }, extra || {});
const TORNEOS = [
  T(1, "Regional", "Alajuela", "Abierta"), T(2, "Regional", "Cartago", "Abierta"), T(3, "Nacional", "", ""),
  T(4, "Regional", "Alajuela", "Femenina"), T(5, "Nacional", "", "", { modalidad: "Equipos" }), T(6, "Regional", "Alajuela", "Abierta", { ritmo: "Blitz o rápido" }),
  T(7, "Regional", "Alajuela", "Abierta", { categoria: "C" }),
];
const JUG = ["Ana", "Beto", "Ciro", "Dora", "Eva", "Fito", "Gabi"].map((n) => [n, n.toLowerCase()]);
const INST = [["Liceo A", "liceo a"], ["CTP B", "ctp b"]];
// [torneo, jugador, institución, puesto, puntos, elo, snr]
const PART = [
  [1, 0, 0, 1, 5, null, null], [1, 1, 0, 2, 4, null, null], [1, 2, 1, 3, 3, null, null],   // Regional Alajuela: Ana, Beto, Ciro
  [2, 3, 1, 1, 4.5, null, null], [2, 4, 1, 2, 4.5, null, null],                         // Regional Cartago: Dora, Eva
  [3, 1, 0, 1, 4, null, null], [3, 3, 1, 2, 3, null, null], [3, 2, 1, 3, 3, null, null],   // Nacional: Beto, Dora, Ciro (Ana no fue)
  [4, 5, 0, 1, 5, null, null],                                                            // Femenina: Fito
  [5, 0, 0, 1, 4, null, null],                                                            // Equipos: Ana (no cuenta)
  [6, 6, 0, 1, 5, null, null],                                                            // Blitz: Gabi (no cuenta)
  [7, 6, 0, 1, 5, null, null],                                                            // Otra categoría: Gabi
];
const archivos = {
  "data/ajedrez-estudiantil.json": { actualizado: "2026-10-08", columnas: COLS, torneos: TORNEOS.map((t) => COLS.map((c) => t[c])) },
  "data/ajedrez-estudiantil-jugadores.json": { actualizado: "2026-10-08", jugadores: JUG, instituciones: INST, columnas_participaciones: ["clave", "jugador", "institucion", "puesto", "puntos", "elo", "snr"], participaciones: PART, columnas_equipos: ["clave", "institucion", "puesto", "puntos"], equipos: [[5, 0, 1, 14]] },
  "data/ajedrez-estudiantil-partidas.json": { actualizado: "2026-10-08", columnas: [], partidas: [] },
};
module.exports = { archivos };
if (require.main !== module) return;

(async () => {
  const ventana = {};
  const pedir = async (u) => ({ ok: true, json: async () => JSON.parse(JSON.stringify(archivos[u])) });
  new Function("window", "fetch", fs.readFileSync(path.join(__dirname, "..", "js", "jde-datos.js"), "utf8"))(ventana, pedir);
  const datos = await ventana.JdeDatos.cargar();

  console.log("\n=== El orden ===");
  const r = RK.armar(datos, { anio: 2026, categoria: "D", rama: "Abierta" });
  igual("la final pesa más que la regional: Beto (1.º en la Nacional), Dora, Ciro, y después Ana (1.ª en la regional), Eva",
    r.map((x) => x.lugar + " " + x.jugador.nombre), ["1 Beto", "2 Dora", "3 Ciro", "4 Ana", "5 Eva"]);
  igual("la final sin rama en el nombre cuenta como abierta", r[0].etapa, "Nacional");
  igual("lo que llegó, escrito", r.map(RK.resultadoTexto), ["1.º de 3 en la Nacional", "2.º de 3 en la Nacional", "3.º de 3 en la Nacional", "1.º de 3 en la Regional", "2.º de 2 en la Regional"]);
  igual("ni el torneo por equipos ni el blitz ni la otra categoría: Ana con 5 puntos, sin Gabi", [r.find((x) => x.jugador.nombre === "Ana").puntos, r.some((x) => x.jugador.nombre === "Gabi")], [5, false]);
  igual("los puntos y las partidas del año: Beto 4 + 4 de 10", [r[0].puntos, r[0].partidas, r[0].torneos], [8, 10, 2]);
  igual("la región es la de su regional (la de Beto, Alajuela; la de Dora, Cartago)", r.map((x) => x.region), ["Alajuela", "Cartago", "Alajuela", "Alajuela", "Cartago"]);

  console.log("\n=== Lugares compartidos y filtros ===");
  const iguales = JSON.parse(JSON.stringify(archivos));
  iguales["data/ajedrez-estudiantil-jugadores.json"].participaciones[4] = [2, 4, 1, 1, 4.5, null, null]; // Eva también 1.ª en Cartago con 4,5
  const v2 = {};
  new Function("window", "fetch", fs.readFileSync(path.join(__dirname, "..", "js", "jde-datos.js"), "utf8"))(v2, async (u) => ({ ok: true, json: async () => iguales[u] }));
  const r2 = RK.armar(await v2.JdeDatos.cargar(), { anio: 2026, categoria: "D", rama: "Abierta" });
  igual("Ana (1.ª con 5) y Eva (1.ª con 4,5) en sus regionales: no empatan, desempatan los puntos", r2.slice(3).map((x) => x.lugar + " " + x.jugador.nombre), ["4 Ana", "5 Eva"]);
  iguales["data/ajedrez-estudiantil-jugadores.json"].participaciones[0] = [1, 0, 0, 1, 4.5, null, null];
  const v3 = {};
  new Function("window", "fetch", fs.readFileSync(path.join(__dirname, "..", "js", "jde-datos.js"), "utf8"))(v3, async (u) => ({ ok: true, json: async () => iguales[u] }));
  igual("Ana y Eva, las dos 1.ª de su regional con 4,5: comparten el 4.º lugar", RK.armar(await v3.JdeDatos.cargar(), { anio: 2026, categoria: "D", rama: "Abierta" }).slice(3).map((x) => x.lugar + " " + x.jugador.nombre),
    ["4 Ana", "4 Eva"]);
  igual("la región Cartago: solo quien jugó la regional ahí", RK.armar(datos, { anio: 2026, categoria: "D", rama: "Abierta", region: "Cartago" }).map((x) => x.jugador.nombre), ["Dora", "Eva"]);
  igual("la rama femenina: Fito, solo", RK.armar(datos, { anio: 2026, categoria: "D", rama: "Femenina" }).map((x) => x.jugador.nombre), ["Fito"]);
  igual("las opciones de los filtros: sin el blitz ni el de equipos", RK.opciones(datos), { anios: [2026], categorias: ["C", "D"], regiones: ["Alajuela", "Cartago"] });

  console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();
