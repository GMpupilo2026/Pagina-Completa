// Lo corre herramientas/verificar-mesa-pareo-fuente.js con `node --experimental-strip-types`: prueba
// supabase/functions/_compartido/fuente-pareo.ts (la Mesa del árbitro con torneos de Pareo Integral).
import { lecturaDePareo, indiceDe, fisicaDe, baseDe, filaCola, DE_PAREO, A_PAREO, ARTICULO_PAREO, esTnrPareo, partidasDePareo, TEXTO_PAREO } from "../../supabase/functions/_compartido/fuente-pareo.ts";
import { limpiarEnvio } from "../../supabase/functions/_compartido/pareo-adjuntos.ts";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

let fallos = 0;
const igual = (nombre, hallado, esperado) => {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a === b) console.log("  ✓ " + nombre); else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
};

const jugadores = [
  { id: "a", nombre: "Ana Mora", fed: "CRC" }, { id: "b", nombre: "Beto Solís", fed: "PAN" },
  { id: "c", nombre: "Caro Díaz" }, { id: "d", nombre: "Dani Ruiz", fed: "CRC" }, { id: "e", nombre: "Eva Lara" },
];
const ronda1 = { mesas: [{ b: "a", n: "b", r: "1-0" }, { b: "c", n: "d", r: null }, { b: "e", n: null, r: "+-" }] };

console.log("Lectura desde lo publicado:");
const sinRondas = lecturaDePareo({ jugadores, rondas: [] }, "U12");
igual("sin ronda emparejada: ronda 0 y sin mesas", [sinRondas.ronda, sinRondas.mesas.length], [0, 0]);
const l1 = lecturaDePareo({ jugadores, rondas: [ronda1] }, "U12");
igual("la ronda abierta es la última", l1.ronda, 1);
igual("el bye no es una partida (no se sirve)", l1.mesas.map((m) => m.mesa), [1, 2]);
igual("nombres y resultado en el código de la tablet", l1.mesas[0], { mesa: 1, blancas: "Ana Mora", negras: "Beto Solís", valor: "1" });
igual("sin resultado: 0", l1.mesas[1].valor, "0");
igual("índice de Pareo por mesa física", l1.indices, { 1: 1, 2: 2, 3: 3 });
igual("banderas de lo publicado", [l1.feds.get("ana mora"), l1.feds.get("caro diaz")], ["CRC", undefined]);

// Con mesaInicial (una sala con varias categorías): la mesa física corre, el índice no.
const l21 = lecturaDePareo({ jugadores, mesaInicial: 21, rondas: [ronda1, { mesas: [{ b: "b", n: "c", r: "=" }, { b: "d", n: "a", r: null }] }] }, "U16");
igual("mesaInicial 21: las mesas físicas empiezan en 21", l21.mesas.map((m) => m.mesa), [21, 22]);
igual("mesaInicial 21: la física 22 es el índice 2", l21.indices[22], 2);
igual("mesaInicial 21: ronda 2 (la última)", l21.ronda, 2);
igual("todas las rondas, para «Mis pareos»", l21.rondas.map((r) => r.length), [2, 2]);
igual("física ↔ índice", [indiceDe({ mesaInicial: 21 }, 25), fisicaDe({ mesaInicial: 21 }, 5), baseDe({}), baseDe({ mesaInicial: 0.5 })], [5, 25, 1, 1]);
igual("por equipos: no", lecturaDePareo({ tipo: "equipos", jugadores, rondas: [] }, "X"), null);
igual("tnr de Pareo", [esTnrPareo("p" + "a".repeat(32)), esTnrPareo("1529719")], [true, false]);

console.log("Las tablas, iguales a las del navegador:");
const M = require("../../js/mesa-arbitro.js");
igual("DE_PAREO igual a js/mesa-arbitro.js", DE_PAREO, M.DE_PAREO);
igual("A_PAREO es la inversa", Object.keys(DE_PAREO).every((k) => A_PAREO[DE_PAREO[k]] === k), true);
const fs = require("node:fs");
const fuenteMesa = fs.readFileSync(new URL("../../js/mesa-arbitro-pareo.js", import.meta.url), "utf8");
const enMesa = fuenteMesa.match(/ARTICULO_PAREO = (\{[^}]*\})/);
igual("ARTICULO_PAREO igual a js/mesa-arbitro-pareo.js", enMesa && JSON.parse(enMesa[1].replace(/'/g, '"')), ARTICULO_PAREO);

console.log("Las partidas para Fair Play (centroamericano_fp_partidas):");
const conElo = jugadores.map((j, i) => ({ ...j, elo: [1850, 0, 1500, 99, 2100][i] }));
const fp = partidasDePareo({ jugadores: conElo, mesaInicial: 21, numeracion: ["e", "a", "b", "c", "d"], rondas: [ronda1, { mesas: [{ b: "b", n: "c", r: "=" }, { b: "d", n: "a", r: null }] }] });
igual("todas las rondas, sin el bye", fp.map((p) => p.ronda + "/" + p.mesa), ["1/21", "1/22", "2/21", "2/22"]);
igual("la primera, entera", fp[0], { ronda: 1, mesa: 21, snr_b: 2, snr_n: 3, blancas: "Ana Mora", negras: "Beto Solís", elo_b: 1850, elo_n: null, resultado: "1 - 0" });
igual("tablas como chess-results y sin resultado vacío", [fp[2].resultado, fp[1].resultado], ["½ - ½", ""]);
igual("Elo menor que 100: sin Elo", fp[1].elo_n, null);
igual("sin numeración fija: sin número inicial", partidasDePareo({ jugadores, rondas: [ronda1] })[0].snr_b, null);
igual("por equipos o sin datos: nada", [partidasDePareo({ tipo: "equipos", jugadores, rondas: [ronda1] }).length, partidasDePareo(null).length], [0, 0]);
igual("TEXTO_PAREO cubre los mismos resultados que DE_PAREO", Object.keys(TEXTO_PAREO).sort(), Object.keys(DE_PAREO).sort());

console.log("La fila de la cola (vía de la Mesa):");
const a = { id: "00000000-0000-0000-0000-000000000001", arbitro: "Árbitro 1", mesa_desde: 21, mesa_hasta: 25 };
const datos = limpiarEnvio("resultado", { mesa: l21.indices[22], r: "1-0" });
const fila = filaCola(a, "pid", { mesaInicial: 21 }, "resultado", 2, datos);
igual("rango pasado a índices de Pareo (21-25 → 1-5)", [fila.desde, fila.hasta], [1, 5]);
igual("va por asignacion_id, sin código", [fila.asignacion_id, fila.codigo, fila.nombre], [a.id, null, "Árbitro 1"]);
igual("la mesa en la cola es el índice", fila.datos.mesa, 2);

if (fallos) { console.log("\n✗ " + fallos + " fallo(s)"); process.exit(1); }
console.log("\n✓ fuente-pareo.ts: todo en orden");

/*! rev bfb5bbb0d2d82f9f */
