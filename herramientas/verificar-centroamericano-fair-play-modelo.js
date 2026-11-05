#!/usr/bin/env node
/*
 * Verifica la función «modelo» de la Edge Function centroamericano-fair-play ENTERA (no solo sus piezas de
 * analisis.ts): se arma con esbuild para node, con un cliente de Supabase de mentira que filtra como PostgREST, y se la
 * corre sobre un torneo inventado con jugadas que siguen el modelo:
 *   - una categoría de menores clásica (60 jugadores, uno usa el motor en 4 de cada 10 jugadas y piensa siempre
 *     parecido) y una rápida (30), 4 rondas, resultados según la fuerza de cada uno;
 *   - un tercio de los jugadores es 150 puntos más fuerte que su Elo (el Elo atrasado de los niños), y uno de cada siete
 *     no tiene Elo; cada uno piensa más donde se espera perder más (menos el tramposo, que tarda parecido en todas);
 *   - una partida de referencia «de prueba» donde se sabe que las negras usaron el motor.
 * Comprueba que corre (y rápido: la función tiene un tope de tiempo de procesador), que ajusta cada ritmo por su lado,
 * que reconoce Elo de más a los que rindieron más y nunca de menos, que la correlación entre las señales sale medida,
 * que el tramposo queda arriba de su categoría y con el tiempo más parejo, y que los casos de prueba se miden aparte.
 * Ver «Más precisión: el Elo de los niños, el ritmo, el tiempo y los casos de prueba» en docs/decisiones/juegos-y-torneos.md.
 *
 * Uso: node herramientas/verificar-centroamericano-fair-play-modelo.js
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const FUNCION = path.join(RAIZ, "supabase/functions/centroamericano-fair-play");
let fallos = 0;
const igual = (que, salio, esperaba) => {
    const ok = JSON.stringify(salio) === JSON.stringify(esperaba);
    console.log((ok ? "  ✓ " : "  ✗ ") + que);
    if (!ok) { fallos++; console.log("      esperaba: " + JSON.stringify(esperaba) + "\n      salió:    " + JSON.stringify(salio)); }
};

(async () => {
    // La función, armada para node: los dos paquetes de npm se cambian por dobles y se exporta «modelo».
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fp-modelo-"));
    const codigo = fs.readFileSync(path.join(FUNCION, "index.ts"), "utf8")
        .replace('"npm:@supabase/supabase-js@2"', '"./supabase-falso.mjs"').replace('"npm:chess.js@0.10.3"', '"./chess-falso.mjs"') + "\nexport { modelo };\n";
    fs.writeFileSync(path.join(dir, "index.ts"), codigo);
    fs.copyFileSync(path.join(FUNCION, "analisis.ts"), path.join(dir, "analisis.ts"));
    fs.writeFileSync(path.join(dir, "supabase-falso.mjs"), "export const createClient = () => ({});\n");
    fs.writeFileSync(path.join(dir, "chess-falso.mjs"), "export class Chess {}\n");
    const esbuild = require("esbuild");
    esbuild.buildSync({ entryPoints: [path.join(dir, "index.ts")], bundle: true, platform: "node", format: "esm", outfile: path.join(dir, "funcion.mjs"), logLevel: "warning" });
    esbuild.buildSync({ entryPoints: [path.join(dir, "analisis.ts")], format: "esm", outfile: path.join(dir, "analisis.mjs"), logLevel: "warning" });
    globalThis.Deno = { env: { get: () => "x" }, serve: () => {} };
    const { modelo } = await import(path.join(dir, "funcion.mjs"));
    const A = await import(path.join(dir, "analisis.mjs"));

    // El torneo inventado (con una semilla fija: el mismo cada vez).
    let t = 7; const rnd = () => { t = (t * 1103515245 + 12345) % 2147483648; return t / 2147483648; };
    const pos = () => { const d = [0]; for (let i = 1; i < 5; i++) d.push(Math.round((d[i - 1] + rnd() * (i === 1 ? 15 : 8)) * 10) / 10); return d; };
    const jugar = (d, s, c) => { const pr = A.probabilidades(d, 30, s, c); let x = rnd(); for (let i = 0; i < pr.p.length; i++) { x -= pr.p[i]; if (x <= 0) return { rango: i + 1, dj: d[i] }; } return { rango: 0, dj: pr.dOtras }; };
    const T = { centroamericano_torneos: [{ tnr: "A", nombre: "Sub-12 Absoluto", prueba: false }, { tnr: "B", nombre: "Rápido Sub-12", prueba: false }, { tnr: "Z", nombre: "PRUEBA", prueba: true }],
        centroamericano_fp_jugadas: [], centroamericano_fp_partidas: [], centroamericano_fp_referencia: [], centroamericano_fp_modelo: [],
        centroamericano_fp_fide: [], centroamericano_fp_elo_fide: [] };
    const TRAMPOSO = "A Jugador 3";
    // El que usa el motor SOLO en las posiciones difíciles para su nivel (las rachas): en las fáciles juega como siempre.
    const DECISIVO = "A Jugador 10";
    // Lo difícil para él: el tercio más difícil de SUS posiciones (con su propio azar, para no mover el del torneo).
    let umbralD = null;
    const umbralDecisivo = (s) => {
        if (umbralD == null) { let u = 11; const r2 = () => { u = (u * 1103515245 + 12345) % 2147483648; return u / 2147483648; };
            const v = Array.from({ length: 3000 }, () => { const d = [0]; for (let i = 1; i < 5; i++) d.push(Math.round((d[i - 1] + r2() * (i === 1 ? 15 : 8)) * 10) / 10); return A.dificultadEsperada({ deltas: d, n: 30 }, s, 0.9); }).sort((a, b) => a - b);
            umbralD = v[Math.floor(v.length * 2 / 3)]; }
        return umbralD;
    };
    const crear = (tnr, n, rapido) => {
        const js = Array.from({ length: n }, (_, k) => { const elo = k % 7 === 0 ? null : 1100 + Math.floor(rnd() * 1000); return { nombre: tnr + " Jugador " + k, elo, fuerza: (elo || 1300) + (k % 3 === 0 ? 150 : 0) }; });
        for (let ronda = 1; ronda <= 4; ronda++) for (let m = 0; m < n / 2; m++) {
            const b = js[(m * 2 + ronda) % n], ne = js[(m * 2 + 1 + ronda * 3) % n];
            if (b === ne) continue;
            const eb = 1 / (1 + 10 ** ((ne.fuerza - b.fuerza) / 400)), x = rnd();
            T.centroamericano_fp_partidas.push({ tnr, ronda, mesa: m + 1, blancas: b.nombre, negras: ne.nombre, elo_b: b.elo, elo_n: ne.elo, resultado: x < eb - 0.1 ? "1 - 0" : x < eb + 0.1 ? "½ - ½" : "0 - 1" });
            for (const [color, j] of [["blancas", b], ["negras", ne]]) {
                const s = A.sDeElo(Math.log(8) + (rapido ? 0.4 : 0), -0.6, j.fuerza), trampa = j.nombre === TRAMPOSO;
                for (let ply = 16; ply < 56; ply++) {
                    const d = pos(), dificil = j.nombre === DECISIVO && A.dificultadEsperada({ deltas: d, n: 30 }, s, 0.9) > umbralDecisivo(s);
                    const motor = (trampa && rnd() < 0.4) || (dificil && rnd() < 0.8);
                    // A una persona la trampa la atrae: cae más de lo que dice el modelo (que solo mira lo hondo).
                    const celada = d[1] >= 8 && (ply % 3 === 0);
                    const y = motor ? { rango: 1, dj: 0 } : celada && j.nombre !== TRAMPOSO && rnd() < 0.3 ? { rango: 2, dj: d[1] } : jugar(d, s, 0.9);
                    // Una de cada tres posiciones donde la segunda pierde 8 o más es una trampa: a primera vista parece mejor la segunda.
                    T.centroamericano_fp_jugadas.push({ tnr, ronda, mesa: m + 1, color, ply, deltas: d, n_legales: 30, rango: y.rango, delta_jugada: y.dj, dificil: d[1] >= 10,
                        antes: ((ply * 37) % 400) - 200, sup_rango: celada ? 2 : 1, cayo: celada ? y.rango === 2 : false,
                        segundos: trampa ? 25 + Math.round(rnd() * 10) : Math.round(5 + 4 * A.dificultadEsperada({ deltas: d, n: 30 }, s, 0.9) + rnd() * 20) });
                }
            }
        }
    };
    crear("A", 60, false); crear("B", 30, true);
    // Su Elo en FIDE: los que juegan 150 por encima de su Elo (uno de cada tres) vienen subiendo 20 puntos por mes en el
    // último año; los demás, parejos. Los meses, contados desde hoy (como los lee la función).
    const MESES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const hoy = A.mesDe(new Date());
    const periodo = (m) => Math.floor(m / 12) + "-" + MESES[m % 12];
    for (let k = 0; k < 60; k++) {
        const nombre = "A Jugador " + k, p = T.centroamericano_fp_partidas.find((x) => x.tnr === "A" && (x.blancas === nombre || x.negras === nombre));
        const elo = p ? (p.blancas === nombre ? p.elo_b : p.elo_n) : null;
        if (!elo) continue;
        const id = String(1000000 + k), sube = k % 3 === 0;
        T.centroamericano_fp_fide.push({ tnr: "A", clave: A.claveDe(nombre), fide_id: id });
        T.centroamericano_fp_elo_fide.push({ fide_id: id, historial: Array.from({ length: 12 }, (_, i) => ({ periodo: periodo(hoy - i), std: elo - (sube ? 20 * i : 0), rpd: null, blz: null })) });
    }
    for (let ply = 16; ply < 60; ply++) {
        const d = pos(), color = ply % 2 ? "negras" : "blancas", y = color === "negras" ? { rango: 1, dj: 0 } : jugar(d, A.sDeElo(Math.log(8), -0.6, 1700), 0.9);
        T.centroamericano_fp_referencia.push({ evento: "P", partida: "p1", ply, color, elo: 1700, deltas: d, n_legales: 30, rango: y.rango, delta_jugada: y.dj, dificil: d[1] >= 10, trampa: "negras" });
    }
    // El cliente de mentira: eq, in, not null, rango y maybeSingle, filtrando de verdad.
    const consulta = (tabla) => {
        const f = []; let desde = 0, hasta = 1e9;
        const filas = () => (T[tabla] || []).filter((r) => f.every((g) => g(r)));
        const q = { select: () => q, order: () => q, eq: (c, v) => { f.push((r) => r[c] === v); return q; }, in: (c, v) => { f.push((r) => v.includes(r[c])); return q; },
            not: (c) => { f.push((r) => r[c] != null); return q; }, range: (a, b) => { desde = a; hasta = b; return q; },
            maybeSingle: () => Promise.resolve({ data: filas()[0] || null, error: null }),
            then: (ok, ko) => Promise.resolve({ data: filas().slice(desde, hasta + 1), error: null }).then(ok, ko) };
        return q;
    };
    let guardado = null;
    const inicio = process.hrtime.bigint();
    const r = await modelo({ from: consulta }, async (fn, args) => { if (fn === "centroamericano_fp_modelo_guardar") guardado = args; return 1; }, true);
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;

    console.log("=== El modelo de la función, sobre un torneo inventado ===");
    igual("corre y guarda el índice de los 90 jugadores y de cada partida medida, en menos de 1,5 s (la función tiene un tope de tiempo de procesador)",
        [r.ok, r.jugadores, r.partidas > 300, !!guardado, ms < 1500], [true, 90, true, true, true]);
    const v = guardado.p_modelo.validacion, ix = guardado.p_indice;
    igual("cada ritmo se ajusta por su lado: en los dos, con más Elo se escapan menos diferencias (b < 0); la rápida, con su propia sensibilidad",
        [Object.keys(v.parametros).sort(), v.parametros.clasico.b < 0, v.parametros.rapido.b < 0, v.parametros.rapido.a !== v.parametros.clasico.a], [["clasico", "rapido"], true, true, true]);
    igual("cada jugador lleva el ritmo de su categoría", [...new Set(ix.filter((x) => x.tnr === "A").map((x) => x.ritmo))].concat([...new Set(ix.filter((x) => x.tnr === "B").map((x) => x.ritmo))]), ["clasico", "rapido"]);
    const conElo = ix.filter((x) => x.elo);
    igual("el Elo reconocido: nunca menos que su Elo, a algunos de más (con su rendimiento) y nunca más de 200; sin Elo, ninguno",
        [conElo.every((x) => x.elo_usado >= x.elo && x.elo_usado - x.elo <= 200), conElo.some((x) => x.elo_usado > x.elo && x.rendimiento > x.elo), ix.filter((x) => !x.elo).every((x) => x.elo_usado == null)], [true, true, true]);
    const R = v.grupos.clasico.R;
    igual("la correlación entre las señales sale medida en la gente (no la inicial) y entre 0 y 0,95", [R.t1dj !== 0.5, [R.t1dj, R.t1dif, R.djdif].every((x) => x >= 0 && x <= 0.95)], [true, true]);
    const clasicos = ix.filter((x) => x.ritmo === "clasico").sort((a, b) => b.roi - a.roi);
    igual("los dos que usaron el motor quedan primeros de su categoría", clasicos.slice(0, 2).map((x) => x.jugador).sort(), [DECISIVO, TRAMPOSO].sort());
    const rhos = ix.filter((x) => x.tiempo_rho != null && x.jugador !== TRAMPOSO).map((x) => x.tiempo_rho).sort((a, b) => a - b);
    const tramposo = ix.find((x) => x.jugador === TRAMPOSO);
    igual("el tiempo: los honestos piensan más donde es más difícil (la mitad, con una correlación de más de 0,15); el que espera la jugada, casi nada (debajo de todos)",
        [rhos[Math.floor(rhos.length / 2)] > 0.15, tramposo.tiempo_rho < rhos[0], tramposo.tiempo_jugadas], [true, true, 160]);
    // Las jugadas que entran al ajuste: las de quien tiene Elo, más las 22 del rival limpio en la partida de prueba
    // (las 22 del que usó el motor, no).
    const eloDe = new Map(T.centroamericano_fp_partidas.flatMap((p) => [[p.tnr + "|" + p.ronda + "|" + p.mesa + "|blancas", p.elo_b], [p.tnr + "|" + p.ronda + "|" + p.mesa + "|negras", p.elo_n]]));
    const conEloJugadas = T.centroamericano_fp_jugadas.filter((j) => eloDe.get(j.tnr + "|" + j.ronda + "|" + j.mesa + "|" + j.color)).length;
    igual("los casos de prueba se miden aparte (una partida de prueba: el que usó el motor y su rival limpio) y el lado que hizo trampa no entra al ajuste",
        [v.casos.con_trampa, v.casos.sin_trampa, guardado.p_modelo.referencia, guardado.p_modelo.movimientos], [1, 1, 44, conEloJugadas + 22]);
    igual("y las alarmas falsas de la gente de verdad, bajas (un tercio juega más fuerte que su Elo)", v.falsas_alta <= 5, true);

    console.log("\n=== Cómo viene su Elo en FIDE ===");
    const enA = ix.filter((x) => x.tnr === "A" && x.elo);
    const sube = (x) => Number(x.jugador.split(" ").pop()) % 3 === 0;
    igual("quien viene subiendo 20 por mes lleva su tendencia (20 por mes, 60 de los 3 meses de atraso); los parejos, 0",
        [enA.filter(sube).every((x) => x.elo_tendencia === 60 && Number(x.tendencia_mes) === 20), enA.filter((x) => !sube(x)).every((x) => x.elo_tendencia === 0 && Number(x.tendencia_mes) === 0)], [true, true]);
    // Lo mismo sin la tendencia (solo con lo que rindió): con ella, a quien viene subiendo se lo compara más arriba.
    const sinTend = (x) => A.eloUsado(x.elo, x.rendimiento != null ? { rp: x.rendimiento, n: x.rendimiento_partidas } : null, true, 0);
    igual("y se compara más arriba que solo con lo que rindió (nunca menos; a quien rinde muy por debajo, lo que rinde lo baja hasta su Elo igual), nunca por debajo de su Elo",
        [enA.filter(sube).every((x) => x.elo_usado >= sinTend(x)) && enA.filter(sube).filter((x) => x.elo_usado > sinTend(x)).length >= 0.5 * enA.filter(sube).length, enA.filter((x) => !sube(x)).every((x) => x.elo_usado === sinTend(x)), enA.every((x) => x.elo_usado >= x.elo)], [true, true, true]);
    igual("y en la rápida (sin ficha de FIDE), sin tendencia", ix.filter((x) => x.tnr === "B").every((x) => x.elo_tendencia == null), true);

    console.log("\n=== Más allá de Regan ===");
    const tramp = ix.find((x) => x.jugador === TRAMPOSO), honestosT = ix.filter((x) => x.tnr === "A" && x.jugador !== TRAMPOSO && x.jugador !== DECISIVO && x.trampas_z != null).map((x) => Number(x.trampas_z)).sort((a, b) => a - b);
    igual("las trampas de la mirada corta: el que usa el motor cae menos de lo esperable para su nivel (por encima de casi todos los honestos), y los honestos rondan 0",
        [tramp.trampas_n > 10, Number(tramp.trampas_z) > honestosT[Math.floor(honestosT.length * 0.9)], Math.abs(honestosT[Math.floor(honestosT.length / 2)]) < 1, v.atraccion.clasico > 2], [true, true, true, true]);
    igual("la vara para el tamaño del torneo: con los jugadores medidos de cada ritmo (Bonferroni al 5 %), más alta en la clásica, que tiene más",
        [v.grupos.clasico.umbral > v.grupos.rapido.umbral, v.grupos.clasico.umbral > 2.9 && v.grupos.clasico.umbral < 3.4, ix.every((x) => x.umbral_z === v.grupos[x.ritmo].umbral)], [true, true, true]);
    igual("todas las señales en una cuenta: su correlación medida en la gente (una matriz de 4) y los dos que usaron el motor quedan arriba",
        [v.grupos.clasico.M.length, ix.filter((x) => x.tnr === "A" && x.roi_combinado != null).sort((a, b) => b.roi_combinado - a.roi_combinado).slice(0, 3).map((x) => x.jugador).filter((j) => j === TRAMPOSO || j === DECISIVO).length], [4, 2]);
    igual("el contexto: el modelo ajusta cuánto pesa lo desigual de la posición (un número razonable) y sin reloj no toca el del reloj",
        [Number.isFinite(v.parametros.clasico.kv) && Math.abs(v.parametros.clasico.kv) < 1.5, v.parametros.clasico.kr], [true, 0]);

    console.log("\n=== Las rachas ===");
    const dec = ix.find((x) => x.jugador === DECISIVO), tra = ix.find((x) => x.jugador === TRAMPOSO);
    const honestos = ix.filter((x) => x.tnr === "A" && x.jugador !== DECISIVO && x.jugador !== TRAMPOSO && x.contraste_z != null).map((x) => Number(x.contraste_z)).sort((a, b) => a - b);
    igual("quien usa el motor solo en lo difícil: muy alto en las difíciles, normal en las fáciles y el contraste por encima de 2 (y de todos los honestos)",
        [Number(dec.crit_z) >= 2, Math.abs(Number(dec.facil_z)) < 2, Number(dec.contraste_z) >= 2, Number(dec.contraste_z) > honestos[honestos.length - 1]], [true, true, true, true]);
    igual("el que lo usa en cualquier jugada no tiene contraste (sale parejo en las dos), y en los honestos el contraste ronda 0", [Math.abs(Number(tra.contraste_z)) < 1.5, Number(tra.contraste_z) < Number(dec.contraste_z), Math.abs(honestos[Math.floor(honestos.length / 2)]) < 1], [true, true, true]);
    igual("su racha más rara: varias difíciles seguidas, todas la primera, muy improbable para su nivel", [dec.racha_largo >= 5, Number(dec.racha_log10) <= -3], [true, true]);

    fs.rmSync(dir, { recursive: true, force: true });
    console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron." : "\nTodo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
