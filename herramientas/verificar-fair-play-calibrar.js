#!/usr/bin/env node
/* Comprueba herramientas/fair-play-calibrar.js (el modelo de Fair Play ajustado con miles de partidas analizadas en una
 * computadora), sin Stockfish ni red: un motor de mentira y una función de mentira.
 *   - lee el PGN como la pantalla de Fair Play: la MISMA huella y el MISMO filtro de ritmo (los compara con
 *     js/centroamericano-fair-play.js), sin las rápidas, sin las que no tienen Elo y sin repetir;
 *   - las evaluaciones van para las blancas (el motor las da para quien mueve; un mate es ±10000);
 *   - sigue donde quedó (no vuelve a mandar las que el evento ya tiene), manda las 20 opciones y la mirada corta, y al
 *     terminar pide recalcular el modelo; con --seco no manda nada;
 *   - las de prueba llevan quién hizo trampa y en qué proporción, solo con --prueba.
 * Ver «Más allá de Regan» en docs/decisiones/juegos-y-torneos.md.
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const Chess = require("chess.js").Chess;
const C = require("./fair-play-calibrar.js");

let fallos = 0;
const igual = (que, salio, esperaba) => {
    const ok = JSON.stringify(salio) === JSON.stringify(esperaba);
    console.log((ok ? "  ✓ " : "  ✗ ") + que);
    if (!ok) { fallos++; console.log("      esperaba: " + JSON.stringify(esperaba) + "\n      salió:    " + JSON.stringify(salio)); }
};

// Una partida legal inventada (siempre la misma): la primera jugada legal en orden alfabético, 30 veces cada uno.
function partida(h) {
    const g = new Chess();
    for (let i = 0; i < 60 && !g.game_over(); i++) g.move(g.moves().sort()[(i * 7) % g.moves().length]);
    Object.entries(h).forEach(([k, v]) => g.header(k, v));
    return g.pgn();
}
const PGN = [
    partida({ Event: "Prueba", White: "Uno", Black: "Dos", Date: "2026.01.01", Round: "1", WhiteElo: "1800", BlackElo: "1750", TimeControl: "5400+30" }),
    partida({ Event: "Prueba", White: "Tres", Black: "Cuatro", Date: "2026.01.01", Round: "1", WhiteElo: "1900", BlackElo: "1850", TimeControl: "180+2" }),
    partida({ Event: "Prueba", White: "Cinco", Black: "Seis", Date: "2026.01.01", Round: "2", TimeControl: "5400+30" }),
    partida({ Event: "Prueba", White: "Siete", Black: "Ocho", Date: "2026.01.02", Round: "3", WhiteElo: "1600", BlackElo: "1650", Trampa: "Negras", TrampaPorcentaje: "30%" }),
].join("\n\n");

(async () => {
    console.log("=== Leer el PGN como la pantalla ===");
    const ps = C.partidasDePgn(PGN + "\n\n" + PGN);
    igual("solo las clásicas con Elo (sin la rápida ni la que no tiene Elo); la repetida se quita al calibrar", [ps.length, ps.map((p) => [p.elo_b, p.elo_n, p.trampa, p.trampa_pct])],
        [4, [[1800, 1750, null, null], [1600, 1650, "negras", 30], [1800, 1750, null, null], [1600, 1650, "negras", 30]]]);
    const pantalla = fs.readFileSync(path.join(__dirname, "..", "js", "centroamericano-fair-play.js"), "utf8");
    const script = fs.readFileSync(path.join(__dirname, "fair-play-calibrar.js"), "utf8");
    const linea = (t, re) => ((t.match(re) || [""])[0]).replace(/\s+/g, " ").trim();
    igual("la huella, el filtro de ritmo y la proporción de las de prueba son los mismos que los de la pantalla (una partida no se carga dos veces)",
        [/const huella = [^\n]*/, /function esClasica\(tc\) \{[\s\S]*?\n\s*\}/, /const trampaPctDe = [^\n]*/].map((re) => linea(script, re) === linea(pantalla, re) && linea(script, re).length > 20), [true, true, true]);
    igual("el puntaje para las blancas: el motor lo da para quien mueve; un mate es ±10000",
        [C.paraBlancas(35, "8/8/8/8/8/8/8/K6k w - - 0 1"), C.paraBlancas(35, "8/8/8/8/8/8/8/K6k b - - 0 1"), C.paraBlancas(99997, "8/8/8/8/8/8/8/K6k b - - 0 1")], [35, -35, -10000]);

    console.log("\n=== Calibrar ===");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fp-cal-"));
    fs.writeFileSync(path.join(dir, "a.pgn"), PGN);
    fs.writeFileSync(path.join(dir, "b.pgn"), PGN);
    // El motor de mentira: para cada posición, sus jugadas legales en orden, con puntajes que bajan.
    const pedidos = [];
    const motor = { analizar: async (fen, multipv, prof) => { pedidos.push([multipv, prof]); const g = new Chess(fen); return g.moves({ verbose: true }).slice(0, multipv).map((m, i) => ({ uci: m.from + m.to + (m.promotion || ""), score: 50 - 10 * i })); } };
    const llamadas = [];
    const hechaYa = C.partidasDePgn(PGN)[0].partida;
    const falsa = async (url, op) => { const b = JSON.parse(op.body); llamadas.push(b); const d = b.action === "referencia_hechas" ? { ok: true, partidas: [hechaYa] } : b.action === "referencia_guardar" ? { ok: true, jugadas: 40 } : { ok: true };
        return { ok: true, json: async () => d }; };
    const base = { archivos: [path.join(dir, "a.pgn"), path.join(dir, "b.pgn")], evento: "TWIC de prueba", multipv: 20, profundidad: 12, superficial: 5, motores: [motor], token: "f".repeat(64), url: "https://x", anon: "anon", fetch: falsa, decir: () => {} };
    const r = await C.calibrar(Object.assign({}, base, { prueba: true }));
    const guardadas = llamadas.filter((l) => l.action === "referencia_guardar");
    igual("pregunta qué tiene el evento, manda solo la que falta (la otra ya estaba; las repetidas de los dos archivos, una vez) y al final recalcula el modelo",
        [llamadas.map((l) => l.action), r.hechas, r.ya, guardadas[0].evento, guardadas[0].token.length], [["referencia_hechas", "referencia_guardar", "modelo"], 1, 1, "TWIC de prueba", 64]);
    const g0 = guardadas[0];
    igual("con 20 opciones por posición desde la 15 (antes, nada), la mirada corta a profundidad 5 y quién hizo trampa y cuánto",
        [g0.opciones.slice(0, 15).every((o) => o === null), g0.opciones[20].length === Math.min(20, new Chess(C.partidasDePgn(PGN)[1].posiciones[20]).moves().length), g0.superficiales[20].length, g0.evals[20] === g0.opciones[20][0][1], [g0.trampa, g0.trampa_pct],
            pedidos.some((p) => p[0] === 20 && p[1] === 12), pedidos.some((p) => p[0] === 1 && p[1] === 5)], [true, true, 2, true, ["negras", 30], true, true]);
    igual("sin --prueba, no lleva la trampa (una partida normal no se toma como de prueba)", await (async () => {
        llamadas.length = 0; await C.calibrar(Object.assign({}, base, { prueba: false })); const g = llamadas.find((l) => l.action === "referencia_guardar"); return [g.trampa, g.trampa_pct]; })(), [null, null]);
    igual("con --seco analiza todas y no manda nada", await (async () => { llamadas.length = 0; const x = await C.calibrar(Object.assign({}, base, { seco: true })); return [x.hechas, llamadas.length]; })(), [2, 0]);
    igual("los argumentos: los archivos, el evento, los hilos y los topes", C.argumentos(["--evento", "X", "a.pgn", "--hilos", "4", "--multipv", "50", "--prueba", "b.pgn"]),
        { archivos: ["a.pgn", "b.pgn"], hilos: 4, multipv: 20, profundidad: 12, superficial: 5, prueba: true, seco: false, max: 0, evento: "X" });
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron." : "\nTodo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
