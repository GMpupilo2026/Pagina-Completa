/* Comprueba js/acta-jde.js (ActaJde), el armado del «Acta e informe arbitral
   JDE», sin navegador y con un torneo armado a mano con la forma que
   devuelve desempates-chess-results: cinco jugadores, tres rondas, un bye
   del pareo, una incomparecencia, un bye pedido de medio punto y un empate
   en puntos.

   Lo que se rompe callado acá:
   - el bye de un punto del pareo leído como un bye pedido (el informe diría
     «Pidió bye (avisó)» de quien no pidió nada);
   - un orden recalculado en el informe en lugar del oficial de chess-results
     (el que firmó el árbitro), o un recálculo distinto sin avisar;
   - los desempates de chess-results mal traducidos a los códigos de FIDE;
   - los clasificados del art. 66.1 con otro cupo, o el Excel con otras
     columnas que las que lee Pareo Integral.

   Ver «Acta e informe arbitral JDE» en docs/decisiones/juegos-y-torneos.md.

   Uso:  node herramientas/verificar-acta-jde.js */
"use strict";
const A = require("../js/acta-jde.js");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
  else console.log("  ✓ " + nombre);
}

const P = (ronda, rivalSnr, rivalNombre, color, puntos, extra) => Object.assign({ ronda, rivalSnr, rivalNombre, bye: false, incomparecencia: null, color, puntos, rivalFide: 0, rivalNacional: 0 }, extra || {});
const BYE = (ronda, puntos) => P(ronda, 0, "bye", null, puntos, { bye: true });
const J = (snr, nombre, club, puesto, puntos, partidas) => ({ snr, nombre, club, puesto, puntos, elo: 0, titulo: "", fed: "", sexo: "", eloFide: 0, eloNacional: 0, nacimiento: 2011, fideId: 0, cambioFide: null, partidas });
// R1: 1–2 1-0, 3–4 ½, 5 bye del pareo. R2: 3–1 0-1, 5–2 incomparecencia de 5, 4 bye del pareo.
// R3: 1–4 ½, 2–3 0-1, 5 pidió bye de ½.
const DATOS = {
  titulo: "Etapa Regional JDE Categoría C Individual Abierto", final: true, rondasJugadas: 3, faltantes: [],
  desempates: ["Direct Encounter (DE)", "Number of wins including byes (WIN) (Matchpoints, Forfeited games count)"],
  jugadores: [
    J(1, "Uno, Ana", "Liceo de Limón", 1, 2.5, [P(1, 2, "Dos, Beto", "w", 1), P(2, 3, "Tres, Cata", "b", 1), P(3, 4, "Cuatro, Dani", "w", 0.5)]),
    J(4, "Cuatro, Dani", "CTP Batán", 2, 2, [P(1, 3, "Tres, Cata", "b", 0.5), BYE(2, 1), P(3, 1, "Uno, Ana", "b", 0.5)]),
    J(3, "Tres, Cata", "Liceo de Limón", 3, 1.5, [P(1, 4, "Cuatro, Dani", "w", 0.5), P(2, 1, "Uno, Ana", "w", 0), P(3, 2, "Dos, Beto", "b", 1)]),
    J(5, "Cinco, Eva", "Escuela Cieneguita", 4, 1.5, [BYE(1, 1), P(2, 2, "Dos, Beto", "w", 0, { incomparecencia: "pierde" }), BYE(3, 0.5)]),
    J(2, "Dos, Beto", "CTP Batán", 5, 1, [P(1, 1, "Uno, Ana", "b", 0), P(2, 5, "Cinco, Eva", "b", 1, { incomparecencia: "gana" }), P(3, 3, "Tres, Cata", "w", 0)]),
  ],
};
const EV = { anio: 2026, etapa: "regional", lugar: "Limón", sede: "Liceo de Limón", fecha: "2026-06-12", arbitro: "Ana Árbitra", adjunto: "Luis Adjunto" };

console.log("\n=== Los desempates de chess-results, en códigos de FIDE ===");
igual("los nombres que usa Swiss-Manager", [
  "Direct Encounter (DE) (Forfeited games count)", "Buchholz Tie-Break Variable (2026) (Gamepoints, Cut1)", "Buchholz Tie-Break Variable (2023) (Gamepoints)",
  "Sonneborn Berger Tie-Break Variable (2023) (Gamepoints)", "Number of wins including byes (WIN) (Matchpoints, Forfeited games count)",
  "Number of games played with black (BPG) (Matchpoints)", "Buchholz Tie-Break Variable (2026) (Gamepoints, Cut2)", "Algo que nadie conoce"].map(A.codigoDesempate),
  ["DE", "BH-C1", "BH", "SB", "WIN", "BPG", "BH-C2", null]);

console.log("\n=== El armado ===");
const { torneos, avisos } = A.armar(EV, [{ datos: DATOS, todos: false }]);
const t = torneos[0];
igual("el bye de un punto es el del pareo (mesa sin rival), no un bye pedido", t.rondas.map((R) => R.mesas.filter((m) => m.n == null).map((m) => m.b)), [["p5"], ["p4"], []]);
igual("el bye pedido de medio punto sigue como bye pedido", t.rondas[2].ausencias, { p5: "H" });
igual("cada jugador con su centro educativo", t.jugadores.map((j) => j.institucion), ["Liceo de Limón", "CTP Batán", "Liceo de Limón", "Escuela Cieneguita", "CTP Batán"]);
igual("los desempates del torneo quedan escritos (DE, WIN)", t.desempatesOficiales, ["DE", "WIN"]);
igual("Tres y Cinco quedan empatados en el recálculo y chess-results los separa: se avisa", avisos.filter((a) => a.tipo === "orden").length, 1);

console.log("\n=== El informe ===");
const doc = A.documento(EV, torneos, "Ronda 2, mesa 2: Cinco, Eva no se presentó.\n\nRonda 3: todo en orden.");
const tabla = (k) => doc.bloques.filter((b) => b.tipo === "tabla")[k];
const clasif = doc.bloques.find((b) => b.tipo === "tabla" && b.encabezados[0] === "Pto.");
igual("la clasificación es la oficial de chess-results, sin columnas de desempates", [clasif.encabezados, clasif.filas.map((f) => f[0] + " " + f[1])],
  [["Pto.", "Nombre", "Centro", "Pts.", "Clasifica"], ["1 Uno, Ana", "2 Cuatro, Dani", "3 Tres, Cata", "4 Cinco, Eva", "5 Dos, Beto"]]);
igual("y dice con qué desempates salió", doc.bloques.some((b) => b.tipo === "nota" && b.texto === "Orden oficial de chess-results, con los desempates DE, WIN."), true);
igual("Regional de Limón (interregional de dos regiones): clasifican tres (art. 66.1.i)", clasif.filas.map((f) => f[4]), ["Sí", "Sí", "Sí", "", ""]);
const aus = doc.bloques.find((b) => b.tipo === "tabla" && b.encabezados[3] === "Qué pasó");
igual("ausencias: la incomparecencia de Cinco y su bye pedido, no los byes del pareo", aus.filas.map((f) => f[0] + " " + f[1] + " · " + f[3]),
  ["2 Cinco, Eva · Perdió por incomparecencia", "3 Cinco, Eva · Pidió bye (avisó)"]);
const inc = doc.bloques[doc.bloques.findIndex((b) => b.tipo === "titulo" && b.texto === "Incidencias") + 1];
igual("las incidencias que escribió el árbitro, una por línea", inc.items, ["Ronda 2, mesa 2: Cinco, Eva no se presentó.", "Ronda 3: todo en orden."]);
igual("las firmas: principal, adjunto y comité", doc.bloques.slice(doc.bloques.findIndex((b) => b.texto === "Firmas") + 1).map((b) => b.texto.replace(/^_+\s+/, "")),
  ["Árbitro principal: Ana Árbitra", "Árbitro adjunto: Luis Adjunto", "Comité Organizador"]);
igual("el título del evento", doc.subtitulo, "JDE 2026 · Etapa Regional · DRE Limón");
igual("el medallero por centro, con el orden oficial", tabla(doc.bloques.filter((b) => b.tipo === "tabla").findIndex((b) => b.encabezados[1] === "Oro")).filas.map((f) => f[0] + " " + f.slice(1).join("")),
  ["Liceo de Limón 1012", "CTP Batán 0101"]);

console.log("\n=== Los clasificados, para la etapa siguiente ===");
const filas = A.clasificados(EV, torneos);
igual("las columnas que lee «Subir una lista» de Pareo Integral", A.ENCABEZADOS.slice(0, 4), ["Nombre", "Sexo", "FDN", "Nombre de Centro Educativo"]);
igual("los tres primeros, con su centro, su regional, su puesto y de qué etapa vienen", filas.map((f) => [f[0], f[3], f[4], f[10], f[11], f[12]]),
  [["Uno, Ana", "Liceo de Limón", "Limón", "1", "Regional", "DRE Limón"], ["Cuatro, Dani", "CTP Batán", "Limón", "2", "Regional", "DRE Limón"], ["Tres, Cata", "Liceo de Limón", "Limón", "3", "Regional", "DRE Limón"]]);
igual("de la Nacional no se clasifica a nada", A.clasificados(Object.assign({}, EV, { etapa: "nacional" }), torneos).length, 0);

console.log("\n=== Lo que no se reconoce, se dice ===");
const raro = A.armar(EV, [{ datos: Object.assign({}, DATOS, { desempates: ["Algo que nadie conoce"], final: false }), todos: false }]);
igual("un desempate desconocido: se usan los de los JDE y se avisa", [raro.torneos[0].desempatesOficiales, raro.avisos.some((a) => a.tipo === "desempates" && a.texto.includes("«Algo que nadie conoce»"))], [[], true]);
igual("sin «Clasificación final», provisional", raro.avisos.some((a) => a.tipo === "provisional"), true);
const corto = JSON.parse(JSON.stringify(DATOS));
corto.jugadores[0].puntos = 3;
igual("si las partidas no suman lo que dice chess-results, se avisa", A.armar(EV, [{ datos: corto, todos: false }]).avisos.some((a) => a.tipo === "puntos" && a.texto.startsWith("Uno, Ana")), true);

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);
