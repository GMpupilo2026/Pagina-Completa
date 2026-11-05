#!/usr/bin/env node
/* Fair Play: el modelo ajustado con MILES de partidas, analizadas en una computadora con Stockfish.
 *
 * La pantalla de Fair Play carga partidas de referencia de a pocas (la analiza Stockfish en el navegador, una por una).
 * Regan ajusta su modelo con millones de jugadas de todos los niveles: para acercarse, este script analiza en la
 * computadora, con el Stockfish instalado y en varios hilos, los PGN que se le den (los de TWIC, una transmisión de
 * Lichess bajada, una base de partidas), con más opciones por posición que la pantalla (20 por omisión) y la mirada corta
 * (para las trampas), y los manda a la función centroamericano-fair-play («referencia_guardar») con el QR de un encargado
 * de Fair Play. La función vuelve a armar cada partida con chess.js y comprueba la evaluación: este script no decide nada.
 * Sigue donde quedó: pregunta qué partidas del evento ya están («referencia_hechas»).
 * Ver «Más allá de Regan» en docs/decisiones/juegos-y-torneos.md.
 *
 *   apt install stockfish   (o STOCKFISH=/ruta/al/binario)
 *   FP_TOKEN=<el token del QR de un encargado> node herramientas/fair-play-calibrar.js \
 *       --evento "TWIC 1600" partidas1.pgn partidas2.pgn [--hilos 4] [--multipv 20] [--profundidad 12] [--superficial 5]
 *       [--prueba]   (partidas de prueba: respeta [Trampa "Blancas"] y [TrampaPorcentaje "30"])
 *       [--max 500]  (a lo sumo tantas partidas)   [--seco]  (analiza y muestra, sin mandar nada)
 *
 * Solo partidas clásicas (60 minutos o más para 60 jugadas), con el Elo de al menos uno y 20 jugadas o más. Los nombres
 * NO se mandan: cada partida se identifica por una huella (la misma que usa la pantalla).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const Chess = require("chess.js").Chess;

const URL_SUPABASE = "https://bgtijpimpcokxatxxbki.supabase.co";
const DESDE = 15;   // la primera posición que se evalúa (como la pantalla: las 8 primeras jugadas de cada uno son apertura)

// La MISMA huella y el MISMO filtro de ritmo que js/centroamericano-fair-play.js (el verificador lo comprueba).
const huella = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
function esClasica(tc) {
    const m = String(tc || "").match(/^(?:\d+\/)?(\d+)(?:\+(\d+))?/);
    return !m || Number(m[1]) + 60 * Number(m[2] || 0) >= 3600;
}
const trampaPctDe = (h) => { const n = Math.round(Number(String((h && (h.TrampaPorcentaje || h.CheatPercent)) || "").replace(/[%\s]/g, ""))); return n >= 1 && n <= 100 ? n : null; };
function trampaDe(h) {
    const t = String((h && (h.Trampa || h.Cheat)) || "").trim().toLowerCase();
    return /^(blancas|white|w)$/.test(t) ? "blancas" : /^(negras|black|b)$/.test(t) ? "negras" : null;
}
function partidasDePgn(texto) {
    return String(texto || "").split(/\r?\n\s*\r?\n(?=\[Event )/).map((bloque) => {
        const juego = new Chess();
        if (!juego.load_pgn(bloque, { sloppy: true })) return null;
        const h = juego.header(), jugadas = juego.history();
        const elo_b = Number(h.WhiteElo) || null, elo_n = Number(h.BlackElo) || null;
        if ((!elo_b && !elo_n) || jugadas.length < 20 || !esClasica(h.TimeControl)) return null;
        const repaso = new Chess(), posiciones = jugadas.map((m) => { repaso.move(m); return repaso.fen(); });
        return { partida: huella([h.White, h.Black, h.Date, h.Round, jugadas.join(" ")].join("|")), elo_b, elo_n, jugadas, posiciones, trampa: trampaDe(h), trampa_pct: trampaPctDe(h) };
    }).filter(Boolean);
}

// De lo que da herramientas/lib/motor-uci.js (el puntaje para quien mueve, un mate ±100000) al de la función: para las
// blancas, en centipeones, un mate ±10000.
const paraBlancas = (score, fen) => { const v = Math.abs(score) >= 50000 ? Math.sign(score) * 10000 : Math.max(-10000, Math.min(10000, score)); return fen.split(" ")[1] === "b" ? -v : v; };
async function analizarPartida(motor, p, o) {
    const evals = p.posiciones.map(() => null), opciones = p.posiciones.map(() => null), superficiales = p.posiciones.map(() => null);
    for (let i = DESDE; i < p.posiciones.length; i++) {
        const fen = p.posiciones[i];
        if (new Chess(fen).game_over()) continue;
        const lineas = await motor.analizar(fen, o.multipv, o.profundidad);
        if (!lineas.length) continue;
        opciones[i] = lineas.slice(0, o.multipv).map((l) => [l.uci, paraBlancas(l.score, fen)]);
        evals[i] = opciones[i][0][1];
        if (o.superficial) { const c = await motor.analizar(fen, 1, o.superficial); if (c[0]) superficiales[i] = [c[0].uci, paraBlancas(c[0].score, fen)]; }
    }
    return { evals, opciones, superficiales };
}

async function llamar(cuerpo, o) {
    const r = await (o.fetch || fetch)(o.url + "/functions/v1/centroamericano-fair-play", {
        method: "POST", headers: { "Content-Type": "application/json", apikey: o.anon, Authorization: "Bearer " + o.anon },
        body: JSON.stringify(Object.assign({ token: o.token }, cuerpo)),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(d.error || "la función contestó " + r.status);
    return d;
}

// Todo el trabajo: las partidas que faltan, repartidas entre los motores; cada una se manda apenas termina.
async function calibrar(o) {
    let partidas = [];
    for (const f of o.archivos) partidas.push(...partidasDePgn(fs.readFileSync(f, "utf8")));
    const vistas = new Set();
    partidas = partidas.filter((p) => !vistas.has(p.partida) && vistas.add(p.partida));
    const ya = o.seco ? new Set() : new Set((await llamar({ action: "referencia_hechas", evento: o.evento }, o)).partidas || []);
    const faltan = partidas.filter((p) => !ya.has(p.partida)).slice(0, o.max || Infinity);
    o.decir(partidas.length + " partidas clásicas con Elo; " + ya.size + " ya estaban; faltan " + faltan.length + ".");
    let hechas = 0, jugadas = 0, siguiente = 0;
    const inicio = Date.now();
    const trabajar = async (motor) => {
        for (let k = siguiente++; k < faltan.length; k = siguiente++) {
            const p = faltan[k];
            const a = await analizarPartida(motor, p, o);
            const cuerpo = { action: "referencia_guardar", evento: o.evento, partida: p.partida, elo_b: p.elo_b, elo_n: p.elo_n, jugadas: p.jugadas,
                evals: a.evals, opciones: a.opciones, superficiales: a.superficiales, trampa: o.prueba ? p.trampa : null, trampa_pct: o.prueba ? p.trampa_pct : null };
            if (!o.seco) jugadas += (await llamar(cuerpo, o)).jugadas || 0;
            hechas++;
            const min = Math.round(((Date.now() - inicio) / hechas) * (faltan.length - hechas) / 60000);
            o.decir("Partida " + hechas + " de " + faltan.length + (o.seco ? "" : " · " + jugadas + " jugadas guardadas") + (faltan.length > hechas ? " · faltan unos " + min + " min" : ""));
        }
    };
    await Promise.all(o.motores.map(trabajar));
    // Al final, el modelo se vuelve a ajustar ya (no a los 15 minutos).
    if (!o.seco && hechas) await llamar({ action: "modelo", forzar: true }, o).catch((e) => o.decir("El modelo se recalculará solo: " + e.message));
    return { partidas: partidas.length, ya: ya.size, hechas, jugadas };
}

function argumentos(argv) {
    const o = { archivos: [], hilos: 2, multipv: 20, profundidad: 12, superficial: 5, prueba: false, seco: false, max: 0, evento: "" };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--evento") o.evento = argv[++i];
        else if (a === "--hilos") o.hilos = Math.max(1, Number(argv[++i]) || 1);
        else if (a === "--multipv") o.multipv = Math.min(20, Math.max(5, Number(argv[++i]) || 20));
        else if (a === "--profundidad") o.profundidad = Math.min(30, Math.max(8, Number(argv[++i]) || 12));
        else if (a === "--superficial") o.superficial = Math.min(8, Math.max(0, Number(argv[++i]) || 0));
        else if (a === "--max") o.max = Number(argv[++i]) || 0;
        else if (a === "--prueba") o.prueba = true;
        else if (a === "--seco") o.seco = true;
        else o.archivos.push(a);
    }
    return o;
}

if (require.main === module) {
    (async () => {
        const o = argumentos(process.argv.slice(2));
        o.evento = String(o.evento || "").trim().slice(0, 80);
        o.token = process.env.FP_TOKEN || "";
        o.url = process.env.SUPABASE_URL || URL_SUPABASE;
        const cliente = fs.readFileSync(path.join(__dirname, "..", "js", "supabase-client.js"), "utf8");
        o.anon = process.env.SUPABASE_ANON_KEY || (cliente.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/) || [])[1];
        if (!o.archivos.length || !o.evento) { console.error("Uso: FP_TOKEN=… node herramientas/fair-play-calibrar.js --evento \"Nombre\" partidas.pgn [más.pgn] [--hilos 4]"); process.exit(2); }
        if (!o.seco && !/^[0-9a-f]{64}$/.test(o.token)) { console.error("Falta FP_TOKEN: el token del QR de un encargado de Fair Play (lo que va después del # en su enlace)."); process.exit(2); }
        const { Motor } = require("./lib/motor-uci.js");
        o.motores = Array.from({ length: o.hilos }, () => new Motor());
        o.decir = (t) => process.stdout.write("\r" + t.padEnd(100));
        try {
            const r = await calibrar(o);
            console.log("\nListo: " + r.hechas + " partidas analizadas" + (o.seco ? " (sin mandar)." : ", " + r.jugadas + " jugadas en «" + o.evento + "»."));
        } catch (e) { console.error("\nNo se pudo: " + e.message); process.exitCode = 1; }
        finally { o.motores.forEach((m) => m.cerrar()); }
    })();
}

module.exports = { partidasDePgn, esClasica, huella, analizarPartida, calibrar, argumentos, paraBlancas };
