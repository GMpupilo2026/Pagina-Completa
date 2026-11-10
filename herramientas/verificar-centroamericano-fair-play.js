/* Fair Play del Centroamericano 2026: la pantalla del encargado (centroamericano-fair-play.html, sin cuenta, con su
   QR), la misma en la pestaña «Fair Play» del árbitro principal (centroamericano-mesas.html, con los QR de los
   encargados) y el borde dorado en la tablet del árbitro de mesa (centroamericano-arbitro.html).

   Sin navegador:
   - supabase/functions/centroamericano-fair-play/analisis.ts: los emparejamientos de chess-results (con el número de
     cada jugador, su Elo y el bye), la precisión con la fórmula de Lichess (sin la apertura ni lo ya decidido), lo de
     LiveChess (los tableros, la regla de los nombres IGUAL a la de centroamericano-mesas-vivo, la partida terminada, la
     jugada sin el reloj) y la evaluación que manda la pantalla (una por posición, o se rechaza);
   - el puntaje de Stockfish pasado a las blancas (también los mates);
   - CentroamericanoMesas.fairPlayDeMesa(): lo que dice la banda dorada antes del resultado, con un resultado elegido,
     cuando gana quien no aplica, en tablas y si nadie jugó.
   Con un doble de la Edge Function centroamericano-fair-play que se porta como la base:
   - sin QR, o con uno que la función no acepta, no se arma nada y lo dice;
   - el encargado ve su nombre, las alertas de los tableros (con «Ya la miré» y «Seguirlo en los sorteos»), las mesas
     con su peso y quién no aplica, sortea (pregunta antes, con la ronda de cada categoría), aprueba, descarta con
     motivo, anota la revisión eligiendo a quién; NO ve la sección de los QR ni lee tablas directo (todo por la función);
   - el principal ve lo mismo y además crea y apaga los QR de los encargados;
   - la tablet del árbitro marca con un borde dorado que se mueve la mesa entera si aplican los dos, o solo el bloque
     del jugador que aplica (y con el resultado, el del ganador), con una banda que dice a quién retener; al elegir el
     resultado, si gana quien no aplica, la banda dice que no aplica; con el resultado guardado, «Ya retuve a …»
     avisa a Fair Play (CentroamericanoMesas.fairPlayAlcance() decide dónde va el borde);
   - el encargado ve las NOVEDADES (el resultado que dice a quién revisar, el árbitro que lo retuvo, la alerta nueva),
     que vibran y suben al título de la pestaña; el ACUMULADO de cada jugador sumando sus partidas, con «Ya lo miré»
     y «Seguirlo»; la fila dice si su árbitro ya lo retuvo; y baja el INFORME de Fair Play del torneo en PDF;
   - a 820 px no se desplaza a lo ancho y el texto da 4,5 o más, en claro y en oscuro.

   Ver «El sorteo de Fair Play» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js centroamericano-fair-play      */
"use strict";
const { chromium } = require("./lib/playwright-con-sesion");
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const { TOKEN, dobleArbitro } = require("./lib/doble-centroamericano-arbitro");

const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");
const FP_TOKEN = "c".repeat(64);
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a === b) console.log("  ✓ " + nombre);
    else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}

// ---------------------------------------------------------------- 1. el cálculo, sin navegador
function pruebasDelCalculo() {
    console.log("\n=== El cálculo (analisis.ts) ===");
    const html = '<table class="CRs1"><tr class="CRg1b"><th>M.</th><th>No.</th><th></th><th></th><th>White</th><th>Elo</th><th>Pts.</th><th>Resultado</th><th>Pts.</th><th></th><th>Black</th><th>Elo</th><th></th><th>No.</th></tr>'
        + '<tr><td class="CRc">1</td><td>2</td><td></td><td></td><td><a href="x.aspx?art=9&amp;snr=2">Garcia Tabasco, Alberto</a></td><td>2023</td><td>1</td> <td>1 - 0</td><td>1</td><td></td><td><a href="x.aspx?art=9&amp;snr=21">Reynoso Almonte, Owen</a></td><td>1596</td><td></td><td>21</td></tr>'
        + '<tr><td class="CRc">2</td><td>20</td><td></td><td></td><td><a href="x.aspx?snr=20">Ordonez Ch., Dylan</a></td><td>1609</td><td>1</td> <td></td><td>1</td><td>AIM</td><td><a href="x.aspx?snr=3">Farley, Jeremiah</a></td><td>1874</td><td></td><td>3</td></tr>'
        + '<tr><td class="CRc">3</td><td>45</td><td></td><td></td><td><a href="x.aspx?snr=45">Barrantes, Matias</a></td><td>0</td><td>1</td> <td>1 - -</td><td></td><td></td><td>bye</td><td></td><td></td><td></td></tr>'
        + '<tr><td class="CRc">4</td><td>5</td><td></td><td></td><td><a href="x.aspx?snr=5">Valle, Moises</a></td><td>2094</td><td>0</td> <td>&frac12; - &frac12;</td><td>0</td><td></td><td><a href="x.aspx?snr=25">Esquivel, Jeremy</a></td><td>1842</td><td></td><td>25</td></tr></table>';
    // Una partida de 40 jugadas (la evaluación después de cada una): las blancas siempre dejan la evaluación igual
    // (precisión ~100), las negras pierden 50 centipeones cada vez desde la jugada 9, hasta pasar los 6 peones (desde
    // ahí ya no cuenta).
    const evals = [];
    let ev = 20;
    for (let i = 1; i <= 40; i++) { evals.push(ev); if (i >= 9) ev += 50; evals.push(ev); }
    const codigo = `
      const A = await import(${JSON.stringify(path.join(RAIZ, "supabase/functions/centroamericano-fair-play/analisis.ts"))});
      const p = A.leerPareos(${JSON.stringify(html)});
      const P = await import(${JSON.stringify(path.join(RAIZ, "supabase/functions/_compartido/pareos-publicos.ts"))});
      const copia = P.leerPareos(${JSON.stringify(html)});
      const m = A.medir(${JSON.stringify(evals)});
      const conNull = ${JSON.stringify(evals)}.map((e, i) => (i < A.DESDE_POSICION ? null : e));
      console.log(JSON.stringify({ p, copia, m, mSinApertura: A.medir(conNull),
        tabs: [A.tablerosDe("1-5"), A.tablerosDe("1-3, 7"), A.tablerosDe("")],
        nombres: [A.mismoJugador("Guevara Ruiz, Santiago", A.nombreLc({ lname: "Guevara Ruiz", fname: "Santiago", mname: null })), A.mismoJugador("Guevara Ruiz, Santiago", "Clarke Raef")],
        terminadas: [{ result: "0-1", live: false }, { result: "1/2-1/2", live: false }, { result: "*", live: true }, { result: "1-0", live: true }, null].map(A.terminadaLc),
        san: [A.sanDe("Nf3 5482+5"), A.sanDe("O-O 5358+48"), A.sanDe("e8=Q+ 10+2")], desde: A.DESDE_POSICION,
        copias: (() => { const largo = Array.from({ length: 60 }, (_, i) => (i % 2 ? "Nf6 5400+3" : "Nf3 5400+3")), otra = largo.slice(0, 50).concat(["e4"]);
          return [A.copiaDeOtra(largo, largo.map((x) => x.split(" ")[0] + " 1+1")), A.copiaDeOtra(largo, largo.slice(0, 45)), A.copiaDeOtra(largo.slice(0, 20), largo.slice(0, 30)), A.copiaDeOtra(otra, largo), A.copiaDeOtra(["e4", "e5"], ["d4"]), A.copiaDeOtra([], largo)]; })(),
        detalle: (() => {
          const L = (m, c) => Object.fromEntries(m.map((u, i) => [u, { captura: !!(c && c[i]), jaque: false }]));
          const plies = Array.from({ length: 20 }, (_, j) => ({ san: "x", uci: "a1a2", legales: {}, segundos: 1, hora: 1000 + j }));
          plies[16] = { san: "e4", uci: "e2e4", legales: L(["e2e4", "d2d4"]), segundos: 5, hora: 2000 };
          plies[17] = { san: "e5", uci: "e7e5", legales: L(["e7e5"]), segundos: 3, hora: 61000 };
          plies[18] = { san: "h3", uci: "h2h3", legales: L(["g1f3", "b1c3", "f1c4", "h2h3"]), segundos: 60, hora: 200000 };
          plies[19] = { san: "dxe4", uci: "d5e4", legales: L(["d5e4", "c7c5"], [true, false]), segundos: 4, hora: 401000 };
          const evals = Array(20).fill(null); evals[15] = 50; evals[16] = 50; evals[17] = 40; evals[18] = -50; evals[19] = -40;
          const op = Array(20).fill(null); op[15] = [["e2e4", 50], ["d2d4", -100]]; op[16] = [["e7e5", 40]]; op[17] = [["g1f3", 30], ["b1c3", 20], ["f1c4", 10]]; op[18] = [["d5e4", -40], ["c7c5", 300]];
          const r = A.detallar(plies, evals, op, [{ color: "negras", hora: 1000 }]);
          return { jugadas: r.jugadas.map((d) => [d.ply, d.color, d.rango, d.perdida, d.forzada, d.dificil, d.tras_levantarse]), blancas: r.resumen.blancas, negras: r.resumen.negras };
        })(),
        segundos: [A.segundosDe("Nf3 5482+5"), A.segundosDe("O-O 10+12"), A.segundosDe("d4 +396"), A.segundosDe("")],
        opciones: [A.opcionesValidas([null, [["e2e4", 30], ["d2d4", 10.4]]], 2), A.opcionesValidas([null], 2), A.opcionesValidas([[["e9e4", 1]]], 1), A.opcionesValidas([[["e2e4", 99999]]], 1), A.opcionesValidas([Array.from({ length: 21 }, () => ["e2e4", 1])], 1)],
        deltas16: (() => { const L = { e2e4: { captura: false, jaque: false }, d2d4: { captura: false, jaque: false } };
          const plies = Array.from({ length: 18 }, () => ({ san: "x", uci: "a1a2", legales: {}, segundos: 1, hora: 1 })); plies[16] = { san: "e4", uci: "e2e4", legales: L, segundos: 5, hora: 1 };
          const ev = Array(18).fill(null); ev[15] = 50; ev[16] = 50; const op = Array(18).fill(null); op[15] = [["e2e4", 50], ["d2d4", -100]];
          const d = A.detallar(plies, ev, op, []).jugadas[0]; return [d.deltas, d.n_legales, d.delta_jugada]; })(),
        modelo: (() => {
          let t = 7; const rnd = () => { t = (t * 1103515245 + 12345) % 2147483648; return t / 2147483648; };
          const pos = () => { const d = [0]; for (let i = 1; i < 5; i++) d.push(Math.round((d[i - 1] + rnd() * (i === 1 ? 15 : 8)) * 10) / 10); return d; };
          const jugar = (d, s, c) => { const pr = A.probabilidades(d, 30, s, c); let x = rnd(); for (let i = 0; i < pr.p.length; i++) { x -= pr.p[i]; if (x <= 0) return { rango: i + 1, dj: d[i] }; } return { rango: 0, dj: pr.dOtras }; };
          const jug = []; for (let k = 0; k < 80; k++) { const elo = 1000 + Math.floor(rnd() * 1200), s = A.sDeElo(Math.log(8), -0.6, elo); const movs = [];
            for (let i = 0; i < 80; i++) { const d = pos(), j = jugar(d, s, 0.9); movs.push({ deltas: d, n: 30, rango: j.rango, dj: j.dj, dificil: d[1] >= 10, elo }); } jug.push({ elo, movs }); }
          const aj = A.ajustar(jug.flatMap((j) => j.movs));
          const crudas = jug.map((j) => A.zCruda(A.esperado(j.movs, A.sDeElo(aj.a, aj.b, j.elo), aj.c)));
          const cf = A.centroYFactor(crudas);
          const v = A.validar(jug.map((j) => ({ movs: j.movs, s: A.sDeElo(aj.a, aj.b, j.elo) })), aj.c, cf.factor, cf.centro);
          const tramposo = jug[0].movs.map((m) => ({ ...m, rango: 1, dj: 0 }));
          const pr = A.probabilidades([0, 5, 12], 20, 6, 0.8);
          return { b: aj.b, honestosAltos: v.falsas_alta, deteccion30: v.deteccion["0.3"].a_mirar, deteccion10: v.deteccion["0.1"].a_mirar,
            tramposo: A.indice(A.esperado(tramposo, A.sDeElo(aj.a, aj.b, jug[0].elo), aj.c), cf.factor, cf.centro).roi,
            suma: Math.round((pr.p.reduce((x, y) => x + y, 0) + pr.otras) * 1e9) / 1e9, orden: pr.p[0] > pr.p[1] && pr.p[1] > pr.p[2] && pr.p[2] > pr.otras / 17,
            pocos: A.centroYFactor([1, 2, 3]),
            casos: A.casosDePrueba([{ movs: tramposo, s: A.sDeElo(aj.a, aj.b, jug[0].elo), trampa: true }].concat(jug.slice(1, 21).map((j) => ({ movs: j.movs, s: A.sDeElo(aj.a, aj.b, j.elo), trampa: false }))), aj.c, cf.factor, cf.centro) };
        })(),
        precision: (() => {
          const rp = A.rendimiento([{ eloRival: 1600, puntos: 1 }, { eloRival: 1500, puntos: 1 }, { eloRival: 1700, puntos: 0.5 }, { eloRival: null, puntos: 1 }]);
          const e = { n: 40, t1: 30, eT1: 20, vT1: 9, dj: 20, eDj: 60, vDj: 400, dificiles: 6, t1Dif: 6, eT1Dif: 2, vT1Dif: 1.5 };
          const r2 = (x) => Math.round(x * 100) / 100;
          const R = A.correlaciones(Array.from({ length: 20 }, (_, i) => ({ zT1: i, zDj: i * 2 + 1, zDif: (i * 7) % 5 })));
          return { rp, res: ["1 - 0", "½ - ½", "0 - 1", "+ - -", ""].map(A.puntosBlancas),
            usados: [A.eloUsado(1500, rp, true), A.eloUsado(1500, rp, false), A.eloUsado(1500, { rp: 1300, n: 5 }, true), A.eloUsado(1500, null, true), A.eloUsado(1500, { rp: 2500, n: 9 }, true)],
            ritmo: [A.esJoven("Sub-10 Absoluto"), A.esJoven("Rápido Sub-12"), A.esJoven("Abierto"), A.esRapido("Rápido Sub-12"), A.esRapido("Sub-10 Absoluto"), A.esRapido("Blitz final")],
            tiempo: [A.spearman(Array.from({ length: 25 }, (_, i) => [i * 3 + 1, i])), A.spearman(Array.from({ length: 25 }, (_, i) => [30 - i, i])), A.spearman(Array.from({ length: 25 }, (_, i) => [30, i])), A.spearman([[1, 2], [3, 4]])],
            dificultad: A.dificultadEsperada({ deltas: [0, 30, 40], n: 20 }, 6, 0.8) < A.dificultadEsperada({ deltas: [0, 1, 2], n: 20 }, 6, 0.8),
            z2: r2(A.zCruda({ ...e, dificiles: 2 })), viejo: r2(((30 - 20) / 3 + (60 - 20) / 20) / Math.sqrt(3)),
            z3: r2(A.zCruda(e)), z3alta: r2(A.zCruda(e, { t1dj: 0.9, t1dif: 0.9, djdif: 0.9 })),
            R: [R.t1dj, R.t1dif >= 0 && R.t1dif <= 0.95, R.djdif >= 0 && R.djdif <= 0.95], Rpocos: A.correlaciones([{ zT1: 1, zDj: 2, zDif: null }]), suma: A.sumar(e, e) };
        })(),
        teoria: (() => {
          const plies = ["e2e4", "e7e5", "g1f3", "a7a6", "f1c4"].map((u) => ({ san: "x", uci: u, legales: {}, segundos: null, hora: null }));
          const fens = ["f0", "f1", "f2", "f3", "f4"];
          const base = { f0: { jugadas: [{ uci: "e2e4", w: 900, d: 800, b: 700 }] }, f1: { jugadas: [{ uci: "e7e5", w: 300, d: 300, b: 300 }] }, f2: { jugadas: [{ uci: "g1f3", w: 100, d: 90, b: 80 }] }, f3: { jugadas: [{ uci: "b8c6", w: 50, d: 40, b: 30 }, { uci: "a7a6", w: 1, d: 1, b: 1 }] } };
          return [A.finDeTeoria(plies, fens, (f) => base[f]), A.finDeTeoria(plies, fens, (f) => (f === "f2" ? null : base[f])), A.inicioDeMedida({ fin: 3, seguro: true }), A.inicioDeMedida({ fin: 21, seguro: true }), A.inicioDeMedida({ fin: 2, seguro: false }), A.inicioDeMedida(null),
            A.fenExplorador("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1")];
        })(),
        cobertura: (() => {
          // Inventados (sin nadie de verdad): la lista inicial de chess-results y la ficha de FIDE, como vienen.
          const lista = '<table class="CRs1"><tr class="CRng1b"><th>No.</th><th>Nombre</th><th>FIDE-ID</th></tr>'
            + '<tr><td>1</td><td><a class="CRdb" href="https://chess-results.com/tnr1.aspx?lan=2&amp;art=9&amp;snr=1">Pérez, Ana</a></td><td><a href="http://ratings.fide.com/profile/9990001">9990001</a></td></tr>'
            + '<tr><td>2</td><td><a class="CRdb" href="https://chess-results.com/tnr1.aspx?lan=2&amp;art=9&amp;snr=2">Sin, Ficha</a></td><td></td></tr></table>';
          const fila = (p, std, rpd) => '<tr><td>&nbsp;' + p + '&nbsp;</td><td>&nbsp;' + std + '&nbsp;</td><td>0</td><td>&nbsp;' + rpd + '&nbsp;</td><td>0</td><td>&nbsp;0&nbsp;</td><td>0</td></tr>';
          const ficha = '<table class="profile-table_calc"><thead><tr><th>Period</th></tr></thead><tbody>' + fila("2026-Nov", 1660, 1500) + fila("2026-Oct", 1640, "") + fila("2026-Sep", 1620, 1490) + fila("2026-Aug", 1600, 1480) + fila("2026-Jul", 1580, 1470) + '</tbody></table>';
          const hist = A.leerHistorialFide(ficha);
          const nov = 2026 * 12 + 10;
          const plies = Array.from({ length: 24 }, (_, i) => ({ san: "x", uci: "a2a3", legales: { a2a3: { captura: false, jaque: false }, b2b3: { captura: false, jaque: false } }, segundos: null, hora: null }));
          const evals = plies.map(() => 0), ops = plies.map(() => [["a2a3", 0], ["b2b3", -200]]);
          return {
            ids: A.leerFideIds(lista), hist: hist.slice(0, 2), mal: A.leerHistorialFide("<p>nada</p>"),
            tend: [A.tendencia(hist, "clasico", nov, true), A.tendencia(hist, "clasico", nov, false), A.tendencia(hist, "rapido", nov, true), A.tendencia(hist.slice(0, 3), "clasico", nov, true), A.tendencia(hist, "clasico", nov + 24, true), A.tendencia(null, "clasico", nov, true)],
            baja: A.tendencia(hist.map((h, i) => ({ ...h, std: 1500 + 20 * i })), "clasico", nov, true),
            usados: [A.eloUsado(1500, null, true, 60), A.eloUsado(1500, null, true, 500), A.eloUsado(1500, { rp: 1300, n: 9 }, true, 60) < 1560, A.eloUsado(1500, { rp: 1000, n: 30 }, true, 60), A.eloUsado(1500, { rp: 1700, n: 9 }, true, 60) > A.eloUsado(1500, { rp: 1700, n: 9 }, true, 0)],
            mes: [A.mesDe(new Date("2026-11-01T03:00:00Z")) % 12, A.mesDe(new Date("2026-11-01T07:00:00Z")) % 12],
            resultado: ["1 - 0", "0 - 1", "½ - ½", "", "+ - -"].map(A.resultadoDe),
            planilla: [A.planillaValida(Array(19).fill("e4"), []), A.planillaValida(Array(20).fill("Nf3"), [3, 3, 99, -1, "2"]), A.planillaValida(Array(20).fill("e4 x"), [])],
            saltar: [A.detallar(plies, evals, ops, []).jugadas.length, A.detallar(plies, evals, ops, [], 16, new Set([17, 19])).jugadas.map((d) => d.ply)],
            mediana: [A.mediana([3, 1, 2]), A.mediana([4, 1, 2, 3]), A.mediana([])],
            // Más allá de Regan
            reloj: [A.relojDe("Nf3 5482+5"), A.relojDe("Nf3")],
            sup: [A.superficialesValidas(null, 2), A.superficialesValidas([null, ["e2e4", 20]], 2), A.superficialesValidas([["zz", 1]], 1), A.superficialesValidas([null], 2)],
            detSup: (() => { const d = A.detallar(plies, evals, ops, [], 16, new Set(), plies.map((_, i) => (i === 16 ? ["b2b3", 0] : i === 17 ? ["a2a3", 0] : null))).jugadas; return d.slice(0, 3).map((x) => [x.ply, x.sup_rango, x.cayo]); })(),
            ctx: [A.contextoDe(300, 100), A.contextoDe(-900, null), A.contextoDe(null, 500), Math.round(A.factorContexto({ v: 1, r: 1 }, 0.5, -0.2) * 1000) / 1000],
            trampas: (() => {
              const t = (cayo) => ({ deltas: [0, 20, 30], n: 20, rango: cayo ? 2 : 1, dj: 0, sup: 2, cayo });
              const muchas = (k) => Array.from({ length: 10 }, (_, i) => t(i < k));
              const r1 = A.trampas(muchas(0), 6, 0.8, 6), r2 = A.trampas(muchas(4), 6, 0.8, 6), pocas = A.trampas(muchas(0).slice(0, 4), 6, 0.8);
              const sinTrampa = A.trampas([{ deltas: [0, 3, 30], n: 20, rango: 1, dj: 0, sup: 2, cayo: false }, { deltas: [0, 20], n: 20, rango: 1, dj: 0, sup: 1, cayo: false }], 6, 0.8);
              return [r1.n, r1.cayo, r1.z > 2, r2.z < r1.z, pocas.z, sinTrampa.n, A.atraccionDe([{ n: 10, cayo: 12, esperado: 3 }, { n: 10, cayo: 8, esperado: 2 }]), A.atraccionDe([{ n: 2, cayo: 1, esperado: 1 }])];
            })(),
            umbral: [A.umbralTorneo(1), A.umbralTorneo(10), A.umbralTorneo(300), Math.round(A.normalInversa(0.975) * 1000) / 1000],
            combinada: (() => { const M = A.correlacionDe(Array.from({ length: 20 }, (_, i) => [i, i * 2, (i * 7) % 5, null])); return [M.length, M[0][1], M[0][3], A.combinada([2, 2, null, null], [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]), A.combinada([2, 2, null, null], [[1, 1, 0, 0], [1, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]), A.combinada([null, 2], M)]; })(),
            casos: (() => {
              const w = A.wilson(8, 10), a = [A.auc([3, 4], [0, 1]), A.auc([1], [1]), A.auc([], [1])];
              const mv = (r) => Array.from({ length: 20 }, () => ({ deltas: [0, 5, 10], n: 20, rango: r, dj: r === 1 ? 0 : 5 }));
              const c = A.casosDePrueba([{ movs: mv(1), s: 6, trampa: true, pct: 30 }, { movs: mv(1), s: 6, trampa: true, pct: 30 }, { movs: mv(2), s: 6, trampa: false }], 0.8, 1, 0);
              return [w, a, c.por_porcentaje && c.por_porcentaje["30"].casos, Array.isArray(c.ic_marcados), c.auc];
            })(),
          };
        })(),
        clave: [A.claveDe("Pérez Ñuñez,  José."), A.claveDe("  ANA  maría ")],
        validas: [A.evalsValidas([null, 30, -10000], 3), A.evalsValidas([null, 30], 3), A.evalsValidas([null, "30", 1], 3), A.evalsValidas([null, 99999, 1], 3), A.evalsValidas("x", 1)] }));`;
    const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", codigo], { encoding: "utf8" });
    if (r.status !== 0) { console.log("  ✗ no se pudo correr analisis.ts: " + r.stderr); fallos++; return; }
    const d = JSON.parse(r.stdout);
    igual("chess-results: cada mesa con el número de cada jugador en el torneo, su nombre, su Elo y el resultado", d.p[0], { mesa: 1, snr_b: 2, snr_n: 21, blancas: "Garcia Tabasco, Alberto", negras: "Reynoso Almonte, Owen", elo_b: 2023, elo_n: 1596, resultado: "1 - 0" });
    igual("«Mis pareos» (centroamericano-mesa) lee la misma página IGUAL que Fair Play: las dos copias del lector dan lo mismo mesa por mesa", d.copia, d.p);
    igual("una mesa sin resultado todavía queda con el resultado vacío", [d.p[1].mesa, d.p[1].negras, d.p[1].resultado], [2, "Farley, Jeremiah", ""]);
    igual("chess-results escribe las tablas como «&frac12; - &frac12;»: se decodifica y la partida NO queda sin resultado (en los dos lectores)", [d.p[3].resultado, d.copia[3].resultado], ["½ - ½", "½ - ½"]);
    igual("el bye: un solo jugador, negras vacío y sin Elo inventado (un 0 no es un Elo)", [d.p[2].mesa, d.p[2].negras, d.p[2].snr_n, d.p[2].elo_b], [3, "", null, null]);
    igual("la precisión sale sin la apertura (desde la jugada 9) y sin lo ya decidido (6 peones): blancas perfectas y negras bajas, con el mismo número de jugadas medidas", [d.m.blancas.precision > 99, d.m.negras.precision < 90, d.m.blancas.jugadas, d.m.negras.jugadas, d.m.negras.acpl], [true, true, 12, 12, 50]);
    igual("la pantalla manda null antes de la posición 15 (la apertura): la medida es la misma", d.mSinApertura, d.m);
    igual("LiveChess: los tableros de cada categoría («1-5», «1-3, 7»)", d.tabs, [[1, 2, 3, 4, 5], [1, 2, 3, 7], []]);
    igual("LiveChess: el jugador de chess-results contra el de LiveChess (y otro no)", d.nombres, [true, false]);
    igual("LiveChess: solo las partidas terminadas (con resultado y fuera de vivo)", d.terminadas, [true, true, false, false, false]);
    igual("LiveChess: la jugada sin el reloj ni lo pensado, y desde qué posición hace falta evaluar", [d.san, d.desde], [["Nf3", "O-O", "e8=Q+"], 15]);
    igual("jugada por jugada: la primera del motor (rango 1), la que no está entre las 3 (rango 0, con lo que perdió), la única jugada legal y la captura obvia como forzadas, la difícil (una sola buena, sin jaque ni captura) y la hecha en los 5 minutos después de levantarse",
        d.detalle.jugadas, [[16, "blancas", 1, 0, false, true, false], [17, "negras", 1, 0, true, false, true], [18, "blancas", 0, 80, false, false, false], [19, "negras", 1, 0, true, false, false]]);
    igual("el resumen de las blancas: 2 que cuentan, 1 primera del motor, 1 difícil acertada en 5 s (la jugada 9), y 60 s en las demás", d.detalle.blancas,
        { consideradas: 2, t1: 1, top3: 1, dificiles: 1, dificiles_ok: 1, seg_dificil: 5, seg_resto: 60, tras_levantarse: 0, tras_levantarse_t1: 0, momentos: [{ jugada: 9, san: "e4", segundos: 5 }] });
    igual("el de las negras: sus dos jugadas eran forzadas (no cuentan), y una fue después de levantarse", [d.detalle.negras.consideradas, d.detalle.negras.t1, d.detalle.negras.tras_levantarse, d.detalle.negras.tras_levantarse_t1], [0, 0, 1, 0]);
    igual("lo que pensó en cada jugada de LiveChess («Nf3 5482+5» son 5 s)", d.segundos, [5, 12, null, null]);
    igual("las 3 mejores que manda la pantalla: una lista por posición, jugadas UCI y centipeones; si no, se rechaza entera", d.opciones, [[null, [["e2e4", 30], ["d2d4", 10]]], null, null, null, null]);
    igual("cada jugada con cuánto peor es cada opción que la mejor, en puntos de probabilidad de ganar (la fórmula de Lichess), las jugadas legales y lo que perdió lo jugado", d.deltas16, [[0, 13.7], 2, 0]);
    igual("el modelo por jugada: las probabilidades suman 1 y van de la mejor a la peor; con menos de 8 jugadores no hay centro ni factor", [d.modelo.suma, d.modelo.orden, d.modelo.pocos], [1, true, { centro: 0, factor: 1 }]);
    igual("con 80 jugadores inventados que juegan según el modelo: el ajuste encuentra que con más Elo se escapan menos diferencias (b < 0), casi nadie honesto pasa de 70 (la vara de FIDE para actuar), y quien usa el motor en 3 de cada 10 jugadas sale desde 65 más de 3 de cada 10 veces (y mucho más que con 1 de cada 10): con las varas de FIDE se marca menos, a cambio de casi no acusar a nadie limpio",
        [d.modelo.b < -0.2, d.modelo.honestosAltos <= 1, d.modelo.deteccion30 > 30, d.modelo.deteccion30 > 3 * d.modelo.deteccion10], [true, true, true, true]);
    igual("y quien juega siempre la del motor sale muy por encima de 70", d.modelo.tramposo > 75, true);
    igual("los casos de prueba: de 21 partidas donde se sabe la respuesta, marca al que usó el motor y casi a ninguno de los 20 que jugaron limpio",
        [d.modelo.casos.con_trampa, d.modelo.casos.marcados_a_mirar, d.modelo.casos.marcados_alta, d.modelo.casos.sin_trampa, d.modelo.casos.falsos_a_mirar <= 10], [1, 100, 100, 20, true]);
    console.log("\n=== Más precisión ===");
    igual("los resultados de chess-results para las blancas («+ - -», una incomparecencia, no cuenta)", d.precision.res, [1, 0.5, 0, null, null]);
    igual("el rendimiento de FIDE en el torneo: el Elo medio de los rivales con Elo más lo que da su porcentaje (5 de 6: +280)", d.precision.rp, { rp: 1880, n: 3 });
    igual("el Elo que se le reconoce: parte de lo que rindió según lo inseguro de cada medida (3 partidas: un 30 % a un menor, un 10 % a un adulto), con tope de 200 a un menor y 100 a los demás, y nunca menos que su Elo",
        d.precision.usados, [1613, 1536, 1500, 1500, 1700]);
    igual("menores (Sub-8 … Sub-18) y ritmo rápido o relámpago, por el nombre de la categoría", d.precision.ritmo, [true, true, false, true, false, true]);
    igual("el tiempo: piensa más donde es más difícil (1), al revés (−1), siempre lo mismo (ninguna relación: 0) o con pocas jugadas (no se mide)", d.precision.tiempo, [1, -1, 0, null]);
    igual("lo difícil de una posición, para alguien de su nivel: donde la mejor es clarísima se espera perder menos que donde muchas jugadas pierden un poco", d.precision.dificultad, true);
    igual("las señales juntas: sin 4 posiciones difíciles, igual que antes (√3); con ellas suman más; y cuanto más se parecen entre sí, menos pesa sumarlas",
        [d.precision.z2 === d.precision.viejo, d.precision.z3 > d.precision.z2, d.precision.z3alta < d.precision.z3], [true, true, true]);
    igual("la correlación medida en la gente (nunca más de 0,95 ni negativa) y, con menos de 8 jugadores, la inicial", [d.precision.R, d.precision.Rpocos], [[0.95, true, true], { t1dj: 0.5, t1dif: 0.3, djdif: 0.3 }]);
    igual("lo esperable de dos grupos de jugadas se suma campo por campo (la historia en otros eventos)", [d.precision.suma.n, d.precision.suma.t1, d.precision.suma.vT1Dif], [80, 60, 3]);
    igual("la teoría: hasta la primera jugada que no está en las partidas de maestros (o con menos de 5); si no se sabe, lo dice; desde ahí se mide (nunca antes de la 5.ª de cada uno), y sin saberlo, desde la 9.ª; el FEN del explorador sin la casilla al paso",
        d.teoria, [{ fin: 3, seguro: true }, { fin: 2, seguro: false }, 8, 21, 16, 16, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -"]);
    igual("la clave de un nombre, igual que interno.fp_clave() en la base", d.clave, ["perez nunez jose", "ana maria"]);
    console.log("\n=== Para todos los torneos: FIDE, planillas ===");
    const c = d.cobertura;
    igual("la lista inicial de chess-results: cada jugador con su ID FIDE (quien no tiene, no sale)", c.ids, [{ nombre: "Pérez, Ana", fide: "9990001" }]);
    igual("la ficha de FIDE: el Elo de cada mes (una celda vacía es null); si la página cambió, nada", [c.hist, c.mal], [[{ periodo: "2026-Nov", std: 1660, rpd: 1500, blz: null }, { periodo: "2026-Oct", std: 1640, rpd: null, blz: null }], []]);
    igual("la tendencia: sube 20 por mes → 60 en 3 meses a un menor (75 de tope a un adulto: también 60), la rápida con su propio Elo (sin el mes que falta: 7,4 por mes → 22), con menos de 4 meses o fuera del último año nada, y sin ficha nada",
        c.tend, [{ puntos: 60, pendiente: 20, meses: 5 }, { puntos: 60, pendiente: 20, meses: 5 }, { puntos: 22, pendiente: 7.4, meses: 4 }, null, null, null]);
    igual("quien viene bajando no recibe nada (nunca de menos)", c.baja, { puntos: 0, pendiente: -20, meses: 5 });
    igual("el Elo reconocido con la tendencia: se parte de su Elo más ella (con el tope de 200), lo que rinde lo corrige hacia abajo sin bajar de su Elo, y hacia arriba suma",
        c.usados, [1560, 1700, true, 1500, true]);
    igual("el mes, en hora de Costa Rica (el 1.° a las 9 p. m. todavía es octubre)", c.mes, [9, 10]);
    igual("el resultado de chess-results como el de una partida: «½ - ½» son tablas; sin resultado o por incomparecencia, nada", c.resultado, ["1-0", "0-1", "1/2-1/2", null, null]);
    igual("la planilla: con menos de 20 medias jugadas no; las dudosas se ordenan sin repetidas ni fuera de la partida; una jugada con espacio, no",
        c.planilla, [null, { jugadas: Array(20).fill("Nf3"), dudosas: [2, 3] }, null]);
    igual("las jugadas dudosas de la planilla no se miden (las demás, sí)", c.saltar, [8, [16, 18, 20, 21, 22, 23]]);
    igual("la mediana (la mitad más difícil de las jugadas de cada uno, para las rachas)", c.mediana, [2, 2.5, null]);
    console.log("\n=== Más allá de Regan ===");
    igual("lo que le quedaba en el reloj después de cada jugada de LiveChess", c.reloj, [5482, null]);
    igual("la mirada corta que manda la pantalla: una por posición o ninguna (sin ella, todas null); si no, se rechaza", c.sup, [[null, null], [null, ["e2e4", 20]], null, null]);
    igual("cada jugada dice dónde quedó lo que parecía mejor a primera vista y si cayó en eso", c.detSup, [[16, null, null], [17, 2, false], [18, 1, true]]);
    igual("el contexto: lo desigual de la posición (de 0 a 1, tope 6 peones) y el reloj apurado (menos de 5 min), y lo que corren la sensibilidad",
        c.ctx, [{ v: 0.5, r: 1 }, { v: 1, r: 0 }, { v: 0, r: 0 }, 1.35]);
    igual("las trampas: quien no cae en ninguna, con lo que atraen de verdad, sale alto; cayendo en algunas, menos; con menos de 5 no se mide; la que no es trampa no cuenta; la atracción se mide en la gente (y sin datos, 1)",
        c.trampas, [10, 0, true, true, null, 0, 4, 1]);
    igual("la vara para el tamaño del torneo (Bonferroni al 5 %): nunca menos de «vigilar» (3, el 65 de FIDE); con 10 jugadores, 3; con 300, 3,6", c.umbral, [3, 3, 3.59, 1.96]);
    igual("todas las señales en una cuenta: la correlación medida (nunca negativa; sin datos, 0), independientes suman más, parecidas no cuentan doble, y sin el índice no hay",
        c.combinada, [4, 0.95, 0, 2.83, 2, null]);
    igual("los casos de prueba con su margen (Wilson), cuánto separan (AUC) y por proporción de uso del motor", c.casos, [[49, 94.3], [1, 0.5, null], 2, true, 1]);
    igual("el tablero sin limpiar: la partida de la ronda anterior (entera, o con lo que siguió, desde 40 jugadas) es copia; 20 jugadas iguales de apertura o una que se aparta, no", d.copias, [true, true, false, false, false, false]);
    igual("la evaluación de la pantalla: una por posición, números de ±10000 o null; si no, se rechaza entera", d.validas, [[null, 30, -10000], null, null, null, null]);
    const regla = (t) => {
        const p = (t.match(/const palabras = [^;]*;/) || [""])[0];
        const f = (t.match(/function mismoJugador\([^)]*\) \{[\s\S]*?\n\s*\}\n/) || [""])[0];
        return (p + "\n" + f).replace(/: unknown/g, "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//")).join("\n");
    };
    const leerArchivo = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8");
    const reglaFp = regla(leerArchivo("supabase/functions/centroamericano-fair-play/analisis.ts"));
    igual("la regla de los nombres es la misma que la de las mesas en vivo (las tablets) letra por letra", !!reglaFp && reglaFp === regla(leerArchivo("supabase/functions/centroamericano-mesas-vivo/index.ts")), true);
    const fn = leerArchivo("supabase/functions/centroamericano-fair-play/index.ts");
    igual("la función no mide la copia de la ronda anterior (ni al darla ni al guardarla)", (fn.match(/copiaDeOtra\(g\.moves/g) || []).length, 2);
    igual("la función ya no lee la transmisión de Lichess (de Lichess solo usa el explorador de maestros, para la teoría), y nunca devuelve el enlace de LiveChess (torneo_id) a la pantalla", [/lichess\.org\/(api|broadcast)/.test(fn) || (fn.match(/lichess\.org\/[a-z]+/g) || []).some((u) => u !== "lichess.org/masters"), (fn.match(/return \{[^;]*\}/g) || []).some((x) => /torneo_id/.test(x)) || /partidas\.push\(\{[^}]*torneo_id/.test(fn)], [false, false]);
    // Fair Play es uno solo para todo el sitio: sin enlace, de la casa; no basta la licencia (ver «Cada evento de la Mesa del árbitro tiene dueño»).
    igual("sin enlace, hace falta ser de la casa (centroamericano_soy_casa), no solo la licencia", /comoQuienLlama\.rpc\("centroamericano_soy_casa"\)/.test(fn) && !/rpc\("tengo_herramienta"/.test(fn), true);
    igual("la función compara los DOS nombres con LiveChess antes de tomar una partida", /mismoJugador\(f\.blancas, nombreLc\(p\.white\)\) && mismoJugador\(f\.negras, nombreLc\(p\.black\)\)/.test(fn), true);

    console.log("\n=== El puntaje de Stockfish, para las blancas ===");
    global.window = {}; global.document = { getElementById: () => null };
    require(path.join(RAIZ, "js/centroamericano-fair-play.js"));
    const P = window.CentroamericanoFairPlay.puntaje;
    igual("con blancas al turno, igual; con negras, dado vuelta; un mate vale ±10000; «mate 0» es que quien mueve ya está en mate; sin puntaje, null",
        [P("info depth 12 score cp 35 nodes 9", "8/8/8/8/8/8/8/8 w - - 0 1"), P("info depth 12 score cp 35", "8/8/8/8/8/8/8/8 b - - 0 1"), P("info depth 9 score mate 3", "x w"), P("info depth 9 score mate -2", "x w"), P("info depth 0 score mate 0", "x b - -"), P(null, "x w")],
        [35, -35, 10000, -10000, 10000, null]);
    const O = window.CentroamericanoFairPlay.opcionesDe;
    igual("las 3 mejores de Stockfish (MultiPV), en orden y para las blancas; en una posición terminada, sin opciones",
        [O({ 2: "info depth 10 multipv 2 score cp 20 nodes 5 pv d2d4 d7d5", 1: "info depth 10 multipv 1 score cp 35 nodes 5 pv e2e4 e7e5", 3: "info depth 10 multipv 3 score mate 2 pv g1f3" }, null, "x b - -"), O({}, "info depth 0 score mate 0", "x w - -")],
        [{ cp: -35, opciones: [["e2e4", -35], ["d2d4", -20], ["g1f3", -10000]] }, { cp: -10000, opciones: [] }]);
    const X = window.CentroamericanoFairPlay.explicar, Rz = window.CentroamericanoFairPlay.resumenAlerta;
    const alerta = { precision: 97.13, jugadas: 36, esperada: 87.5, z: 2.6, comparado: "elo", consideradas: 30, t1: 25, top3: 29, esperada_t1: 52, z_t1: 3.1, dificiles: 5, dificiles_ok: 5, esperada_dif: 30, z_dif: 2.8,
        seg_dificil: 12, seg_resto: 70, tiempo_raro: true, tras_levantarse: 3, tras_levantarse_t1: 3, momentos: [{ jugada: 23, san: "Nxe5", segundos: 8 }], senales: 3 };
    igual("el porqué, señal por señal, con su comparación y lo alto marcado", X(alerta).map((x) => [!!x.alto, x.texto]), [
        [true, "Precisión: 97,1 % en 36 jugadas; lo esperable para su Elo en este torneo: 87,5 % (2,6 desviaciones arriba)."],
        [true, "Jugó la primera opción de Stockfish en 25 de 30 jugadas (83 %); lo esperable para su Elo en este torneo: 52,0 % (3,1 desviaciones arriba). Una de las tres mejores: 29 de 30."],
        [true, "Posiciones difíciles (una sola jugada buena, que no es jaque ni captura): 5, y acertó 5; lo esperable para su Elo en este torneo: 30,0 % de acierto (2,8 desviaciones arriba)."],
        [true, "Tiempo: en las difíciles pensó 12 s en promedio; en las demás, 1 min 10 s. Pensó menos justo donde era más difícil."],
        [true, "El árbitro anotó que se levantó de la mesa: en las 3 jugadas de los 5 minutos siguientes, jugó la primera del motor 3 veces."],
        [false, "Jugada 23. Nxe5: la única buena de la posición, en 8 s."]]);
    igual("sin Elo se compara con su categoría; pocas jugadas, lo avisa; la frase de arriba cuenta las señales altas",
        [X(Object.assign({}, alerta, { comparado: "categoria", consideradas: 12, t1: 6, top3: 9, z: 0.5, z_t1: 0.4, dificiles: 0, momentos: [] }))[0].texto, X(Object.assign({}, alerta, { consideradas: 12 })).some((x) => /Pocas jugadas medidas \(12\)/.test(x.texto)), Rz(alerta), Rz(Object.assign({}, alerta, { z: 1, z_dif: 1, tiempo_raro: false })), Rz({ precision: 90 })],
        ["Precisión: 97,1 % en 36 jugadas; el promedio de su categoría (no tiene Elo): 87,5 % (0,5 desviaciones arriba).", true,
         "3 señales altas de 3: precisión, primera del motor, posiciones difíciles, y el tiempo.", "1 señal alta de 3: primera del motor.", "Solo con la precisión (analizada antes de las señales jugada por jugada)."]);
    const conIndice = Object.assign({}, alerta, { roi: 66.4, z_modelo: 3.28, m_jugadas: 30, m_t1: 25, m_e_t1: 15.2, m_dj: 36, m_e_dj: 135, m_z_t1: 3.1, m_z_dj: 2.4, desde_jugada: 11, profunda: true });
    igual("con el modelo: el índice como el de FIDE, lo esperable según lo difícil de cada posición, lo perdido, desde dónde se midió (la teoría) y si se confirmó a fondo",
        X(conIndice).slice(0, 5).map((x) => [!!x.alto, x.texto]), [
        [true, "Índice como el de FIDE: 66,4 (lo normal es 50; cada 5 puntos es una desviación; desde 65 se vigila y desde 70 se actúa)."],
        [true, "Según lo difícil de cada posición, alguien de su Elo jugaría la primera del motor unas 15,2 de 30 veces; la jugó 25."],
        [true, "Perdió en promedio 1,2 puntos de probabilidad de ganar por jugada; lo esperable para su Elo: 4,5."],
        [false, "Se midió desde la jugada 11: lo de antes era teoría (partidas de maestros) o apertura."],
        [false, "Confirmado con el análisis hondo (profundidad 20)."]]);
    igual("la frase de arriba, con el índice", [Rz(conIndice), Rz(Object.assign({}, conIndice, { roi: 48, z_modelo: -0.4, z: 0, z_t1: 0, z_dif: 0 })), X(Object.assign({}, conIndice, { comparado: "categoria" }))[1].texto],
        ["Índice 66,4: 3,3 desviaciones arriba de lo normal para su nivel (por azar, 1 de cada 1\u00a0927 jugadores limpios). Otras señales altas: precisión, primera del motor, posiciones difíciles.", "Índice 48,0: dentro de lo normal para su nivel.",
         "Según lo difícil de cada posición, alguien de su categoría jugaría la primera del motor unas 15,2 de 30 veces; la jugó 25."]);
    // Los dos ejemplos del seminario de FIDE (Andy Howie, «Understanding Chess Statistics»): XXX, 67,8 en la prueba rápida y
    // z = −1,78 en la completa (estaba limpia); yyy, 89,0 y z = 7,11 («1 in 1,723,536,022,721»).
    const { nivelIndice, porAzar } = window.CentroamericanoFairPlay;
    const enCifras = (t) => Number((t.match(/1 de cada ([\d\s\u00a0.]+) jugadores/) || [, "0"])[1].replace(/[^\d]/g, ""));
    igual("los ejemplos de FIDE: 67,8 es «a mirar» (no «muy alta»), 89,0 «muy alta»; las varas justas en 65 y 70",
        [nivelIndice(67.8), nivelIndice(89), nivelIndice(64.9), nivelIndice(65), nivelIndice(69.9), nivelIndice(70)],
        ["a_mirar", "alta", "normal", "a_mirar", "a_mirar", "alta"]);
    igual("lo que pasaría por azar con z = 7,11 da la cifra de FIDE (1 de cada 1 723 536 022 721, a menos de 0,01 %); con z negativo (−1,78, jugó peor de lo esperado) no se dice nada",
        [Math.abs(enCifras(porAzar(7.11)) / 1723536022721 - 1) < 1e-4, porAzar(-1.78)], [true, ""]);
    delete global.window; delete global.document;

    console.log("\n=== La banda dorada de la tablet (fairPlayDeMesa) ===");
    const C = require(path.join(RAIZ, "js/centroamericano-mesas.js"));
    const fp = { estado: "aprobada", color_si_tablas: "blancas", aplica_blancas: true, aplica_negras: false, no_aplica: "Seis, Fio no aplica: se revisó en la ronda 2" };
    const m = { mesa: 3, blancas: "Cinco, Eva", negras: "Seis, Fio", valor: "0" };
    const t = (v, mm) => C.fairPlayDeMesa(fp, mm || m, v);
    igual("sin resultado: retener al ganador, el color si es tablas y quién no aplica", [t().tipo, /retén al GANADOR/.test(t().texto), /juega con blancas/.test(t().texto), /Seis, Fio no aplica: se revisó en la ronda 2/.test(t().texto)], ["esperando", true, true, true]);
    igual("si el árbitro elige que gana quien SÍ aplica: «retén a Cinco, Eva»", [t("1").tipo, /retén a Cinco, Eva \(blancas\)/.test(t("1").texto)], ["retener", true]);
    igual("si elige que gana quien NO aplica: lo dice y la mesa queda sin efecto, con el motivo de esa persona", [t("3").tipo, t("3").texto], ["no-aplica", "🛡 Fair Play: con este resultado, Seis, Fio NO APLICA (se revisó en la ronda 2). La mesa queda sin efecto: no hace falta retenerlo."]);
    igual("en tablas se retiene al color sorteado; si nadie jugó, sin efecto; ya revisada, solo lo dice", [t("2").tipo, /Cinco, Eva/.test(t("2").texto), t("6").tipo, C.fairPlayDeMesa(Object.assign({}, fp, { estado: "revisada" }), m).tipo], ["retener", true, "no-aplica", "revisada"]);
    igual("con el resultado ya en chess-results (sin elegir otro) dice lo mismo, sin «con este resultado»", [t(undefined, Object.assign({}, m, { valor: "3" })).tipo, /con este resultado/.test(t(undefined, Object.assign({}, m, { valor: "3" })).texto)], ["no-aplica", false]);
    igual("una mesa que no es de Fair Play no lleva banda", C.fairPlayDeMesa(undefined, m, "1"), null);
    const fijo = { estado: "aprobada", color_si_tablas: "negras", aplica_blancas: false, aplica_negras: true, revisar_fijo: "negras", revisar_color: "negras" };
    const tf = (v) => C.fairPlayDeMesa(fijo, m, v);
    igual("elegida a mano con el de negras: lo retiene gane, pierda o empate; si no se presentó, sin efecto",
        [tf().tipo, /gane, pierda o empate\), retén a Seis, Fio \(negras\)/.test(tf().texto), tf("1").tipo, /retén a Seis, Fio/.test(tf("1").texto), tf("2").tipo, tf("4").tipo, /Seis, Fio no se presentó/.test(tf("4").texto), tf("5").tipo, tf("6").tipo],
        ["esperando", true, "retener", true, "retener", "no-aplica", true, "retener", "no-aplica"]);

    console.log("\n=== Dónde va el borde dorado que se mueve (fairPlayAlcance) ===");
    const al = (x) => C.fairPlayAlcance(Object.assign({ estado: "aprobada", aplica_blancas: true, aplica_negras: true, revisar_color: null }, x));
    igual("aplican los dos: la mesa entera; solo blancas o solo negras: ese jugador", [al({}), al({ aplica_negras: false }), al({ aplica_blancas: false })], ["mesa", "blancas", "negras"]);
    igual("con el resultado guardado, el ganador que se revisa (aunque aplicaran los dos)", [al({ revisar_color: "negras" }), al({ revisar_color: "blancas", aplica_negras: false })], ["negras", "blancas"]);
    igual("sorteada, revisada o sin efecto: no se mueve; sin Fair Play, nada", [al({ estado: "sorteada" }), al({ estado: "revisada" }), al({ estado: "sin_efecto", revisar_color: "blancas" }), C.fairPlayAlcance(null)], [null, null, null, null]);
}

// Una partida de verdad (24 jugadas de una italiana, legales para chess.js) como la da «vivo_pendientes»: sus posiciones.
const POSICIONES = (() => {
    const { Chess } = require("chess.js");
    const j = new Chess();
    return "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Bd2 Bxd2+ Nbxd2 d5 exd5 Nxd5 Qb3 Nce7 O-O O-O Rfe1 c6".split(" ").map((m) => { j.move(m); return j.fen(); });
})();

const PGN_TRANSMISION = '[Event "Abierto 2025"]\n[White "E"]\n[Black "F"]\n[WhiteElo "2100"]\n[BlackElo "2050"]\n[TimeControl "5400+30"]\n[Result "1/2-1/2"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3 Be7 9. Qd2 O-O 10. O-O-O Nbd7 11. g4 b5 1/2-1/2\n';

// ---------------------------------------------------------------- 2. el doble de la Edge Function
// Lo mismo que hacen la función y la base: el QR, la ronda de cada categoría, las candidatas con su peso y quién no
// aplica, el sorteo sin repetir, aprobar, descartar con motivo, revisar (con nota si no fue «Sin novedad») y las alertas.
const SERVIDOR_FP = `
  window.__fp = { llamadas: [], enlaces: [{ id: "en-1", token: "${"d".repeat(64)}", nombre: "Laura Mora", vence: "2099-01-01T00:00:00Z", revocada: false, creada: "2026-11-03T10:00:00Z", ultimo_uso: null }],
    rondas: [{ tnr: "100", nombre: "Sub-12 Absoluto", prueba: false, ronda: 3 }, { tnr: "200", nombre: "Sub-14 Femenino", prueba: false, ronda: 3 }, { tnr: "900", nombre: "PRUEBA", prueba: true, ronda: 1 }],
    mesas: {
      "100": [
        { mesa: 1, blancas: "Clark, Arty", negras: "Garcia, Alberto", snr_b: 15, snr_n: 2, elo_b: 1644, elo_n: 2023, peso: 1.5, motivos: ["Diferencia de 379 de Elo"], aplica_blancas: true, aplica_negras: true, no_aplica: null, excluida: null },
        { mesa: 2, blancas: "Cinco, Eva", negras: "Seis, Fio", snr_b: 5, snr_n: 6, elo_b: 1700, elo_n: 1710, peso: 2, motivos: ["Se levantó 2 veces en esta ronda"], aplica_blancas: true, aplica_negras: false, no_aplica: "Seis, Fio no aplica: se revisó en la ronda 2", excluida: null },
        { mesa: 3, blancas: "Siete, Gil", negras: "Ocho, Hugo", snr_b: 7, snr_n: 8, elo_b: 1500, elo_n: 1500, peso: 1, motivos: [], aplica_blancas: false, aplica_negras: false, no_aplica: "…", excluida: "Ninguno de los dos aplica" }],
      "200": [{ mesa: 1, blancas: "Ana", negras: "Bea", snr_b: 1, snr_n: 2, elo_b: 1400, elo_n: 1420, peso: 1, motivos: [], aplica_blancas: true, aplica_negras: true, no_aplica: null, excluida: null }],
      "900": [] },
    sorteos: [],
    alertas: [{ tnr: "100", ronda: 2, mesa: 4, color: "negras", jugador: "Castro, Alana", elo: 1588, rival: "Ruiz, Mia", rival_elo: 1810, resultado: "0-1", jugadas: 36, precision: 97.13, acpl: 7.7, esperada: 87.5, z: 2.6, nivel: "alta", partida_url: "https://lichess.org/broadcast/x/y/z", estado: "nueva", nota: null, vista_por_nombre: null, vista_en: null , comparado: "elo", consideradas: 30, t1: 25, top3: 29, esperada_t1: 52, z_t1: 3.1, dificiles: 5, dificiles_ok: 5, esperada_dif: 30, z_dif: 2.8, seg_dificil: 12, seg_resto: 70, tiempo_raro: true, tras_levantarse: 3, tras_levantarse_t1: 3, momentos: [{ jugada: 23, san: "Nxe5", segundos: 8 }], senales: 3}],
    avisos: [],
    vivo: [{ tnr: "100", ronda: 3, mesa: 1, blancas: "Clark, Arty", negras: "Garcia, Alberto", resultado: "1-0", posiciones: ${JSON.stringify(POSICIONES)}, desde: 15, multipv: 5, profundidad: 12, honda: false },
           { tnr: "100", ronda: 2, mesa: 4, blancas: "Ruiz, Mia", negras: "Castro, Alana", resultado: "0-1", posiciones: ${JSON.stringify(POSICIONES)}, desde: 15, multipv: 5, profundidad: 16, honda: true }], guardados: [], referencias: [],
    indice: [{ tnr: "100", clave: "perez luis", jugador: "Pérez, Luis", elo: 1500, comparado: "elo", partidas: 3, rondas: "1, 2, 3", jugadas: 90, t1: 70, e_t1: 45.2, z_t1: 3.1, dificiles: 8, t1_dif: 8, e_t1_dif: 3.4, roi: 66.4,
               ritmo: "clasico", elo_usado: 1620, rendimiento: 1800, rendimiento_partidas: 3, hist_partidas: 4, hist_roi: 51.3, tiempo_rho: 0.05, tiempo_z: 2.4, tiempo_jugadas: 40,
               elo_tendencia: 40, tendencia_mes: 13.3, crit_z: 3.2, facil_z: 0.4, contraste_z: 2, racha_largo: 6, racha_log10: -3.4,
               z: 3.28, trampas_n: 12, trampas_cayo: 0, trampas_e: 3.4, trampas_z: 2.3, roi_combinado: 68.2, umbral_z: 2.6 },
             { tnr: "200", clave: "nina sin elo", jugador: "Niña, Sin Elo", elo: null, comparado: "categoria", partidas: 2, rondas: "2, 3", jugadas: 50, t1: 22, e_t1: 21.5, z_t1: 0.1, dificiles: 0, t1_dif: 0, e_t1_dif: 0, roi: 51.2,
               ritmo: "rapido", elo_usado: null, rendimiento: null, hist_partidas: null, tiempo_rho: 0.42, tiempo_z: -0.3, tiempo_jugadas: 30 }],
    modelo: { movimientos: 9000, referencia: 1200, factor: 1.2, centro: -0.3, ajustado: "2026-11-04T22:00:00Z", validacion: { jugadores: 140, falsas_a_mirar: 3.1, falsas_alta: 0.7, esperadas_a_mirar: 2.3, esperadas_alta: 0.6, deteccion: { "0.1": { a_mirar: 30, alta: 20 }, "0.2": { a_mirar: 62, alta: 50 }, "0.3": { a_mirar: 85, alta: 74 } },
      casos: { con_trampa: 6, marcados_a_mirar: 83.3, marcados_alta: 66.7, sin_trampa: 6, falsos_a_mirar: 0 }, rapido: { jugadores: 40, falsas_a_mirar: 2.5, falsas_alta: 0 } } },
    acumulado: [{ tnr: "100", clave: "perez luis", jugador: "Pérez, Luis", elo: 1500, partidas: 3, rondas: "1, 2, 3", precision_media: 91.2, esperada_media: 84, z: 2.31, nivel: "a_mirar", sin_mirar: 2, seguir: false }] };
  let n = 0;
  window.__fpServidor = (b, conSesion) => {
    const S = window.__fp; S.llamadas.push(JSON.parse(JSON.stringify(b)));
    const err = (estado, error) => ({ data: null, error: { context: { status: estado, json: () => Promise.resolve({ error }) } } });
    const ok = (d) => ({ data: Object.assign({ ok: true }, d), error: null });
    if (b.action === "mesas_arbitro") return ok({ mesas: S.sorteos.filter((f) => f.estado !== "sorteada" && f.estado !== "descartada").map((f) => ({ mesa: f.mesa, estado: f.estado, color_si_tablas: f.color_si_tablas, aplica_blancas: f.aplica_blancas, aplica_negras: f.aplica_negras, no_aplica: f.no_aplica, revisar_color: f.revisar_color || null, retenido_en: f.retenido_en || null })) });
    let quien;
    if (b.token) { const e = S.enlaces.find((x) => x.token === b.token); if (!e) return err(404, "Este enlace no es válido. Pídele al árbitro principal que te mande el QR de nuevo."); if (e.revocada) return err(410, "El árbitro principal apagó este enlace."); quien = e.nombre + " (Fair Play)"; }
    else if (conSesion) quien = "Oscar Principal"; else return err(401, "Falta el enlace de Fair Play.");
    const rondas = S.rondas.filter((r) => !b.token || !r.prueba);
    if (b.action === "leer") return ok({ nombre: quien.replace(" (Fair Play)", ""), principal: !b.token, evento: "Centroamericano 2026", rondas, sorteos: JSON.parse(JSON.stringify(S.sorteos.filter((f) => rondas.some((r) => r.tnr === f.tnr)))), alertas: JSON.parse(JSON.stringify(S.alertas.filter((a) => a.estado === "seguir" || a.nivel !== "normal"))), acumulado: JSON.parse(JSON.stringify(S.acumulado)), indice: S.indice, modelo: S.modelo, leidos: Object.fromEntries(S.avisos.map((a) => [a.id, a.leido_en])), actualizado: "2026-11-03T16:00:00Z" });
    if (b.action === "candidatas") return ok({ mesas: (S.mesas[b.tnr] || []).map((m) => Object.assign({}, m, { excluida: m.excluida || (S.sorteos.some((f) => f.tnr === b.tnr && f.ronda === b.ronda && f.mesa === m.mesa) ? "Ya salió en esta ronda" : null) })) });
    if (b.action === "sortear") {
      const salen = [];
      for (const tnr of b.tnrs) {
        const pozo = (S.mesas[tnr] || []).filter((m) => !m.excluida && !S.sorteos.some((f) => f.tnr === tnr && f.ronda === b.ronda && f.mesa === m.mesa));
        for (const m of pozo.slice(0, b.cantidad)) {
          const f = Object.assign({}, m, { id: "fp-" + (++n), tnr, ronda: b.ronda, mesas_en_sorteo: pozo.length, color_si_tablas: m.aplica_negras ? "negras" : "blancas", estado: "sorteada", sorteada_por: quien, creado: new Date().toISOString() });
          delete f.excluida; S.sorteos.push(f); salen.push(f);
        }
      }
      return ok({ sorteos: salen });
    }
    const f = S.sorteos.find((x) => x.id === b.id);
    if (b.action === "aprobar") {
      if (!f || f.estado !== "sorteada") return err(400, "Ese sorteo ya se decidió");
      const av = { id: "av-" + (++n), leido_en: null, mesa: f.mesa, texto: "🛡 FAIR PLAY · mesa " + f.mesa }; S.avisos.push(av);
      Object.assign(f, { estado: "aprobada", aviso_id: av.id, arbitro: "Ana Árbitra", decidida_por_nombre: quien }); return ok({ sorteo: f });
    }
    if (b.action === "borrar") {
      if (!String(b.motivo || "").trim()) return err(400, "Para borrar una mesa hace falta el motivo: queda anotado");
      if (!f) return err(400, "Esa mesa ya no está en la lista");
      S.sorteos.splice(S.sorteos.indexOf(f), 1); (S.borrados = S.borrados || []).push({ fila: f, motivo: b.motivo, por: quien }); return ok({ sorteo: f });
    }
    if (b.action === "descartar") { if (!String(b.motivo || "").trim()) return err(400, "Para descartar una mesa hace falta el motivo"); Object.assign(f, { estado: "descartada", motivo: b.motivo }); return ok({ sorteo: f }); }
    if (b.action === "revisar") {
      if (b.resultado !== "sin_novedad" && !String(b.nota || "").trim()) return err(400, "Con ese resultado hace falta anotar qué pasó");
      Object.assign(f, { estado: "revisada", resultado: b.resultado, jugador_color: b.color, jugador: b.color === "negras" ? f.negras : f.blancas, nota: b.nota || null, revisada_por_nombre: quien }); return ok({ sorteo: f });
    }
    if (b.action === "alerta") { const a = S.alertas.find((x) => x.tnr === b.tnr && x.ronda === b.ronda && x.mesa === b.mesa && x.color === b.color); Object.assign(a, { estado: b.estado, nota: b.nota, vista_por_nombre: quien, vista_en: new Date().toISOString() }); return ok({ alerta: a }); }
    if (b.action === "vivo_pendientes") return ok({ conectada: true, partidas: S.vivo.splice(0, 3), quedan: 0, nodos: 3000 });
    if (b.action === "vivo_guardar") { S.guardados.push(b); return ok({ medidas: [] }); }
    if (b.action === "referencia_guardar") { S.referencias.push(b); return ok({ jugadas: 9 }); }
    if (b.action === "jugador") {
      const cl = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[^a-z ]/g, "").replace(/ +/g, " ").trim();
      return ok({ partidas: S.alertas.filter((a) => a.tnr === b.tnr && cl(a.jugador) === b.clave), indice: S.indice.find((x) => x.tnr === b.tnr && x.clave === b.clave) || null });
    }
    if (b.action === "referencia_hechas") return ok({ partidas: S.referencias.filter((r) => r.evento === b.evento).map((r) => r.partida) });
    if (b.action === "modelo") { (S.modelos = S.modelos || []).push(b); return ok({ insuficiente: true, movimientos: 420 }); }
    if (b.action === "acumulado") { const x = S.acumulado.find((y) => y.tnr === b.tnr && y.clave === b.clave); if (b.estado === "seguir") x.seguir = true; x.sin_mirar = 0; return ok({ marcadas: x.partidas }); }
    if (b.action === "actualizar") return ok({ pareos: 30, analizadas: 4, errores: [] });
    if (b.action === "pareo") return ok({ pareo: b.tnr === "100" && b.ronda === 2 && b.mesa === 7 ? { blancas: "Tres, Caro", negras: "Once, Kai", elo_b: 1600, elo_n: 1500, resultado: "1 - 0" } : null });
    if (b.action === "elegir") {
      if (!String(b.motivo || "").trim()) return err(400, "Una mesa elegida a mano lleva el motivo: queda en el acta");
      const m = (S.mesas[b.tnr] || []).find((x) => x.mesa === b.mesa);
      if (!m) return err(400, "La mesa " + b.mesa + " no tiene un árbitro con enlace vigente en esa categoría");
      if (S.sorteos.some((x) => x.tnr === b.tnr && x.ronda === b.ronda && x.mesa === b.mesa)) return err(400, "La mesa " + b.mesa + " ya está en la lista de esta ronda");
      const fijo = b.revisar === "ganador" ? null : b.revisar;
      if (fijo && !(fijo === "blancas" ? m.aplica_blancas : m.aplica_negras)) return err(400, (fijo === "blancas" ? m.blancas : m.negras) + " no aplica para Fair Play (" + m.no_aplica + ")");
      const f = Object.assign({}, m, { id: "fp-" + (++n), tnr: b.tnr, ronda: b.ronda, mesas_en_sorteo: 1, color_si_tablas: fijo || "blancas", estado: "sorteada", origen: "elegida", motivo: b.motivo, revisar_fijo: fijo, revisar_color: fijo,
        aplica_blancas: fijo === "negras" ? false : m.aplica_blancas, aplica_negras: fijo === "blancas" ? false : m.aplica_negras, no_aplica: fijo ? null : m.no_aplica, sorteada_por: quien, creado: new Date().toISOString() });
      delete f.excluida; S.sorteos.push(f);
      if (b.avisar) { const av = { id: "av-" + (++n), leido_en: null, mesa: f.mesa, texto: "🛡 FAIR PLAY · mesa " + f.mesa }; S.avisos.push(av); Object.assign(f, { estado: "aprobada", aviso_id: av.id, arbitro: "Ana Árbitra", decidida_por_nombre: quien }); }
      return ok({ sorteo: f });
    }
    if (b.action === "manual") {
      if (b.resultado !== "sin_novedad" && !String(b.nota || "").trim()) return err(400, "Con ese resultado hace falta anotar qué pasó");
      if (S.sorteos.some((f) => f.tnr === b.tnr && f.ronda === b.ronda && f.mesa === b.mesa)) return err(400, "La mesa " + b.mesa + " de la ronda " + b.ronda + " ya tiene un registro de Fair Play: corrígelo desde la lista");
      const jug = b.tnr === "100" && b.ronda === 2 && b.mesa === 7 ? (b.color === "negras" ? "Once, Kai" : "Tres, Caro") : b.jugador;
      if (!jug) return err(400, "No sé quién jugó en esa mesa: escribe el nombre del jugador");
      const f = { id: "fp-" + (++n), tnr: b.tnr, ronda: b.ronda, mesa: b.mesa, mesas_en_sorteo: 1, color_si_tablas: b.color, estado: "revisada", origen: "manual", resultado: b.resultado, jugador: jug, jugador_color: b.color, nota: b.nota || null, sorteada_por: quien, revisada_por_nombre: quien, motivos: ["Anotada a mano"], peso: 1, creado: new Date().toISOString() };
      S.sorteos.push(f); return ok({ sorteo: f });
    }
    return err(400, "Acción desconocida.");
  };`;

// La pantalla del encargado: solo la función (functions.invoke); cualquier lectura directa de una tabla queda anotada.
const DOBLE_ENCARGADO = `(function(){
  ${SERVIDOR_FP}
  window.__directo = [];
  const R = (data, error) => Promise.resolve({ data, error: error || null });
  window.sb = {
    auth: { getSession: () => R({ session: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    functions: { invoke: (f, o) => f === "centroamericano-fair-play" ? Promise.resolve(window.__fpServidor(o.body, false)) : R(null, { message: "otra función" }) },
    rpc: (f) => { window.__directo.push("rpc " + f); return R(null, { message: "sin permiso" }); },
    from: (t) => { window.__directo.push("from " + t); const q = {}; ["select","eq","order","range","insert","update","in"].forEach((m) => q[m] = () => q); q.then = (ok) => R(null, { message: "sin permiso" }).then(ok); return q; },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
})();`;

// La pestaña del principal: su sesión, la función sin token, y los QR de los encargados por la tabla (con su RLS).
const DOBLE_PRINCIPAL = `(function(){
  ${SERVIDOR_FP}
  window.__llamadas = [];
  const R = (data, error) => Promise.resolve({ data, error: error || null });
  const T = { centroamericano_torneos: [{ tnr: "100", nombre: "Sub-12 Absoluto", orden: 1, sid_en_boveda: true, acceso_tnr: "100" }], centroamericano_fp_enlaces: window.__fp.enlaces };
  window.sb = {
    auth: { getSession: () => R({ session: { user: { id: "yo" }, access_token: "x" } }), getUser: () => R({ user: { id: "yo" } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      mfa: { getAuthenticatorAssuranceLevel: () => R({ currentLevel: "aal1", nextLevel: "aal1" }), listFactors: () => R({ all: [], totp: [] }) } },
    rpc: (f, a) => R(f === "tengo_herramienta" ? a.p_herramienta === "mesa-arbitro" : null),
    storage: { from: () => ({ createSignedUrl: () => R({ signedUrl: "" }) }) },
    functions: { invoke: (f, o) => f === "centroamericano-fair-play" ? Promise.resolve(window.__fpServidor(o.body, true)) : R({ ok: true }) },
    from: (tabla) => { const f = {}; let accion = "select", valores = null;
      const q = { select: () => q, order: () => q, range: () => q, limit: () => q, in: () => q, is: () => q, eq: (c, v) => { f[c] = v; return q; },
        maybeSingle: () => R(null), insert: (v) => { accion = "insert"; valores = v; return q; }, update: (v) => { accion = "update"; valores = v; return q; },
        then: (ok, ko) => { const L = T[tabla] || [];
          if (accion === "insert") { L.push(Object.assign({ id: "en-" + (L.length + 1), token: "e".repeat(64), revocada: false, creada: new Date().toISOString(), ultimo_uso: null }, valores)); window.__llamadas.push({ insert: tabla, valores }); return R(null).then(ok, ko); }
          if (accion === "update") { L.filter((r) => Object.entries(f).every(([c, v]) => r[c] === v)).forEach((r) => Object.assign(r, valores)); window.__llamadas.push({ update: tabla, valores, f }); return R(null).then(ok, ko); }
          return R(L.filter((r) => Object.entries(f).every(([c, v]) => r[c] === v)).map((r) => Object.assign({}, r))).then(ok, ko); } };
      return q; },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
})();`;

async function abrir(browser, pagina, doble, { hash = "", ancho = 820, esquema = "light" } = {}) {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: ancho, height: 900 }, acceptDownloads: true, colorScheme: esquema });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager|cloudflareinsights/, (r) => r.abort());
    // La nube de Lichess: solo conoce una posición (la 19, donde las blancas pueden enrocar), a profundidad 30, con el
    // enroque escrito como lo escribe Lichess («e1h1»); las demás no las tiene (404) y las calcula Stockfish aquí.
    await ctx.route("https://lichess.org/api/cloud-eval**", (r) => {
        const fen = new URL(r.request().url()).searchParams.get("fen");
        if (fen !== POSICIONES[19]) return r.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No cloud evaluation available for that position"}' });
        return r.fulfill({ contentType: "application/json", body: JSON.stringify({ fen, knodes: 90000, depth: 30, pvs: [{ moves: "e1h1 g8f8", cp: 40 }, { moves: "a1c1 c7c6", cp: 30 }, { moves: "f3e5 c7c6", cp: 20 }, { moves: "d2e4 c7c6", cp: 10 }, { moves: "b3b7 c8b7", cp: -50 }] }) });
    });
    await ctx.route("https://lichess.org/api/broadcast/round/abc123.pgn", (r) => r.fulfill({ contentType: "application/x-chess-pgn", body: PGN_TRANSMISION }));
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(BASE + "/" + pagina + (hash ? "#" + hash : ""), { waitUntil: "load" });
    return { ctx, p, errores };
}

const CONTRASTE = (sel) => {
    const luz = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const rgba = (s) => { const m = s.match(/[\d.]+/g).map(Number); return { c: m.slice(0, 3), a: m.length > 3 ? m[3] : 1 }; };
    const fondo = (n) => { for (let x = n; x; x = x.parentElement) { const b = rgba(getComputedStyle(x).backgroundColor); if (b.a >= 0.99) return b.c; } return [255, 255, 255]; };
    return [...document.querySelectorAll(sel)].filter((n) => n.checkVisibility() && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())).map((n) => {
        const a = luz(rgba(getComputedStyle(n).color).c), b = luz(fondo(n));
        return [n.textContent.trim().slice(0, 30), Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100]; }).filter((x) => x[1] < 4.5);
};
const TEXTO_PANEL = "#fp-app p, #fp-app td, #fp-app td span, #fp-app .cam-chip, #fp-app li, #fp-app summary, #fp-app h3, #fp-app strong";

(async () => {
    pruebasDelCalculo();
    const browser = await chromium.launch();
    try {
        console.log("\n=== La pantalla del encargado: el QR ===");
        let e = await abrir(browser, "centroamericano-fair-play.html", DOBLE_ENCARGADO);
        await e.p.waitForFunction(() => !document.getElementById("sin-enlace").hidden);
        igual("sin QR no se arma nada y dice que se abre con el QR de Fair Play", await e.p.evaluate(() => [document.getElementById("sin-enlace").textContent.includes("QR de Fair Play"), document.getElementById("fp-app").checkVisibility(), window.__fp.llamadas.length]), [true, false, 0]);
        await e.ctx.close();
        e = await abrir(browser, "centroamericano-fair-play.html", DOBLE_ENCARGADO, { hash: "f".repeat(64) });
        await e.p.waitForFunction(() => !document.getElementById("sin-enlace").hidden);
        igual("con un QR que la función no acepta, dice lo que contestó la función", await e.p.$eval("#sin-enlace", (n) => n.textContent), "Este enlace no es válido. Pídele al árbitro principal que te mande el QR de nuevo.");
        await e.ctx.close();

        console.log("\n=== La pantalla del encargado: sortear, aprobar, revisar y las alertas ===");
        e = await abrir(browser, "centroamericano-fair-play.html", DOBLE_ENCARGADO, { hash: "d".repeat(64) });
        const p = e.p;
        await p.waitForFunction(() => document.getElementById("fp-categoria") && document.getElementById("fp-categoria").options.length > 1);
        igual("dice quién es el encargado, y el título de la pestaña lleva su nombre", await p.evaluate(() => [document.getElementById("fp-estado").textContent.startsWith("Encargado: Laura Mora · chess-results leído a las "), document.title.startsWith("Fair Play de Laura Mora")]), [true, true]);
        igual("las categorías con su ronda, sin las de ensayo", await p.$$eval("#fp-categoria option", (l) => l.map((o) => o.textContent)), ["Todas las categorías (2)", "Sub-12 Absoluto — ronda 3", "Sub-14 Femenino — ronda 3"]);
        igual("el encargado NO ve la sección de los QR de los encargados y no lee ninguna tabla directo: todo pasa por la función", await p.evaluate(() => [!!document.getElementById("fp-t-encargados"), window.__directo]), [false, []]);
        igual("la pantalla no tiene texto suelto («null») de una sección que no va", await p.evaluate(() => [...document.getElementById("fp-app").childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).length), 0);
        igual("la alerta de los tableros: jugador, Elo, rival, precisión contra la esperable, desviaciones, el enlace a la partida y sus dos botones", await p.$eval("#fp-alertas .cam-fp-alerta", (a) => [a.dataset.nivel, a.querySelector(".cam-chip").textContent, /Castro, Alana \(1588\).*contra Ruiz, Mia \(1810\)/.test(a.textContent), a.querySelector(".cam-fp-resumen").textContent, [...a.querySelectorAll(".cam-fp-por-que li")].map((li) => [li.dataset.alto === "si", getComputedStyle(li).fontWeight >= 700]), /Jugada 23\. Nxe5: la única buena de la posición, en 8 s\./.test(a.textContent), !!a.querySelector('a[href^="https://lichess.org/"]'), [...a.querySelectorAll("button")].map((b) => b.textContent)]),
            ["alta", "Muy alta", true, "3 señales altas de 3: precisión, primera del motor, posiciones difíciles, y el tiempo.", [[true, true], [true, true], [true, true], [true, true], [true, true], [false, false]], true, true, ["Ya la miré", "Seguirlo en los sorteos"]]);
        await p.click("#fp-alertas .cam-fp-no-significa summary");
        igual("«Qué no significa esto» se abre y dice que no prueba nada", await p.$eval("#fp-alertas .cam-fp-no-significa p", (n) => n.checkVisibility() && /no prueba que haya trampa/.test(n.textContent)), true);
        igual("el contador de alertas sin mirar (la de la partida y el acumulado)", await p.evaluate(() => [document.getElementById("fp-alertas-n").checkVisibility(), document.getElementById("fp-alertas-n").textContent]), [true, "2"]);
        igual("al abrir no hay novedades: solo lo que pasa después", await p.evaluate(() => document.getElementById("fp-novedades-caja").checkVisibility()), false);
        // Stockfish en esta computadora: la partida terminada que da la función (directo de LiveChess) se analiza AQUÍ.
        await p.waitForFunction(() => window.__fp.guardados.length === 2, null, { timeout: 120000 });
        igual("la partida terminada se analiza con Stockfish en la pantalla: una evaluación por posición (null antes de la 15, números desde ahí) y vuelve a la función con su categoría, ronda y mesa y el token",
            await p.evaluate(() => { const g = window.__fp.guardados[0]; return [g.tnr, g.ronda, g.mesa, g.token.length, g.evals.length, g.evals.slice(0, 15).every((x) => x === null), g.evals.slice(15).every((x) => typeof x === "number" && Math.abs(x) < 10000)]; }),
            ["100", 3, 1, 64, 24, true, true]);
        igual("y con cada evaluación, las mejores jugadas del motor (las 5 que pide la función, MultiPV 5): en UCI, la primera con la misma evaluación",
            await p.evaluate(() => { const g = window.__fp.guardados[0]; return [g.opciones.length, g.opciones.slice(0, 15).every((x) => x === null),
                g.opciones.slice(15).every((o) => Array.isArray(o) && o.length >= 1 && o.length <= 5 && o.every((x) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(x[0]) && typeof x[1] === "number")),
                g.opciones.slice(15).filter((o) => o.length === 5).length >= 5, g.opciones.slice(15).every((o, i) => o[0][1] === g.evals[15 + i])]; }),
            [24, true, true, true, true]);
        igual("la segunda pasada: la partida con alerta que la función da «honda» vuelve marcada así (y la primera, no)", await p.evaluate(() => window.__fp.guardados.map((g) => [g.mesa, g.honda])), [[1, false], [4, true]]);
        igual("la posición que ya está en la nube de Lichess (a profundidad 30) sale de allá: sus 5 opciones tal cual, con el enroque «e1h1» pasado a «e1g1»",
            await p.evaluate(() => { const g = window.__fp.guardados[0]; return [g.evals[19], g.opciones[19]]; }), [40, [["e1g1", 40], ["a1c1", 30], ["f3e5", 20], ["d2e4", 10], ["b3b7", -50]]]);
        await p.waitForFunction(() => /Al día/.test(document.getElementById("fp-motor-estado").textContent));
        igual("después dice que está al día, cuántas analizó aquí y la casilla queda encendida", await p.evaluate(() => [document.getElementById("fp-motor-estado").textContent, document.getElementById("fp-motor-si").checked]),
            ["Al día: ninguna partida terminada por analizar · 2 analizadas en esta computadora · 2 de 18 posiciones salieron de la nube de Lichess (más hondas). Se vuelve a mirar cada 45 s.", true]);
        igual("el índice del torneo: del más alto al más bajo, con su chip, lo jugado contra lo esperable y, sin Elo, contra su categoría", await p.$$eval("#fp-indice tr", (l) => l.map((tr) => [tr.dataset.nivel, ...[...tr.children].slice(0, 6).map((td) => { const c = td.cloneNode(true); c.querySelectorAll(".cam-fp-informe-jugador").forEach((b) => b.remove()); return c.textContent; })])),
            [["a_mirar", "Pérez, Luis (1500)", "Sub-12 Absoluto", "3 (rondas 1, 2, 3) · 90 jugadas", "66,4 A mirar", "70 / 45,2 (+3,1)", "8 de 8 / 3,4"],
             ["normal", "Niña, Sin EloSin Elo: comparado con su categoría", "Sub-14 Femenino", "2 (rondas 2, 3) · 50 jugadas", "51,2", "22 / 21,5 (+0,1)", "—"]]);
        igual("y lo que se tuvo en cuenta de cada uno, una frase por línea: el Elo que se le reconoció, su historia en otros eventos, el tiempo (la señal alta en negrita) y el ritmo",
            await p.$$eval("#fp-indice tr", (l) => l.map((tr) => [...tr.children[6].querySelectorAll(":scope > .cam-fp-detalle")].map((n) => [n.textContent.slice(0, 40), getComputedStyle(n).fontWeight >= 700, getComputedStyle(n).display]))),
            [[["Se lo comparó como un 1620: su Elo es 15", false, "block"], ["Su historia: en otras categorías o event", false, "block"], ["Señal alta: Tiempo: pensó parecido en la", true, "block"], ["Señal alta: Rachas: en las posiciones di", true, "block"], ["Señal alta: Trampas: tuvo 12 posiciones ", true, "block"], ["Señal alta: Con todas las señales juntas", true, "block"], ["Señal alta: Raro aun para un torneo de e", true, "block"]],
             [["Partidas rápidas: se compara con lo espe", false, "block"], ["Tiempo: piensa más donde es más difícil,", false, "block"]]]);
        igual("las cifras van con su coma: la correlación con dos decimales y el índice de su historia con uno", await p.$eval("#fp-indice tr", (tr) => [/correlación 0,05 en 40 jugadas; 2,4 desviaciones/.test(tr.textContent), /su índice fue 51,3\./.test(tr.textContent)]), [true, true]);
        igual("cómo viene su Elo en FIDE (va en el Elo con que se compara) y las rachas: alto en lo difícil, normal en lo fácil, y su racha más rara con lo improbable que es",
            await p.$eval("#fp-indice tr", (tr) => [/viene subiendo en FIDE unos 13,3 puntos por mes \(se le reconocen 40 que la lista todavía no refleja\) y rindió 1800 en 3 partidas/.test(tr.textContent),
                /sale muy alto \(\+3,2 desviaciones\) y en las fáciles, normal \(\+0,4\)/.test(tr.textContent), /6 jugadas difíciles seguidas de una partida, todas la primera del motor \(para su nivel, 1 vez en 2\s512\)/.test(tr.textContent)]), [true, true, true]);
        await p.click("#fp-confianza summary");
        igual("«¿Qué tan confiable es?»: las alarmas falsas contra las del azar y cuánto detectaría", await p.$$eval("#fp-confianza-texto p", (l) => l.map((x) => x.textContent).slice(0, 3)), [
            "Medido con los 140 jugadores que tienen 30 jugadas o más analizadas.",
            "Alarmas falsas: 3,1 % pasa de 65 y 0,7 % de 70. Por pura casualidad se esperaría 2,3 % y 0,6 %. Como casi todos juegan limpio, esto es lo más que se equivoca.",
            "Si alguien usara el motor en 1 de cada 10 jugadas, lo marcaría el 30,0 % (20,0 % muy alto) de las veces; en 2 de cada 10, el 62,0 % (50,0 % muy alto); en 3 de cada 10, el 85,0 % (74,0 % muy alto)."]);
        igual("y con los casos de prueba (se sabe quién usó el motor) y las rápidas, aparte", await p.$$eval("#fp-confianza-texto p", (l) => l.map((x) => x.textContent).slice(3, 5)), [
            "Con casos de prueba (partidas donde se sabe quién usó el motor): marcó a 83,3 % de los 6 que hicieron trampa, 66,7 % muy alto, y a 0,0 % de sus 6 rivales, que jugaron limpio.",
            "En las rápidas (con su propio ajuste, 40 jugadores): alarmas falsas 2,5 % y 0,0 %."]);
        await p.click("#fp-motor-si");
        igual("apagado en esta computadora: lo dice y se recuerda", await p.evaluate(() => [/Apagado en esta computadora/.test(document.getElementById("fp-motor-estado").textContent), localStorage.getItem("fp_motor_v1")]), [true, "no"]);
        await p.click("#fp-motor-si");
        await p.click('#fp-alertas .cam-fp-alerta [data-accion="seguir"]');
        await p.waitForSelector("dialog[open] input, dialog[open] textarea");
        await p.fill("dialog[open] input, dialog[open] textarea", "Muy rápida en el medio juego");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => document.querySelector("#fp-alertas .cam-fp-alerta").dataset.estado === "seguir");
        igual("«Seguirlo en los sorteos» llega a la función con la nota, y queda con quién y cuándo", await p.evaluate(() => [window.__fp.llamadas.filter((l) => l.action === "alerta").map((l) => [l.estado, l.nota, l.token.length]), /En seguimiento por Laura Mora \(Fair Play\) a las .*: Muy rápida en el medio juego/.test(document.querySelector("#fp-alertas .cam-fp-alerta").textContent), document.getElementById("fp-alertas-n").textContent]),
            [[["seguir", "Muy rápida en el medio juego", 64]], true, "1"]);
        igual("el acumulado: sumadas sus 3 partidas, precisión media contra la esperable, las desviaciones juntas y cuántas faltan por mirar", await p.$eval("#fp-acumulado .cam-fp-alerta", (a) => [a.dataset.nivel, a.querySelector(".cam-chip").textContent, /Pérez, Luis \(1500\) · Sub-12 Absoluto/.test(a.textContent), /3 partidas medidas \(rondas 1, 2, 3\) · precisión media 91,2 %, la esperable para su Elo: 84,0 % · juntas, 2,3 desviaciones arriba/.test(a.textContent), /2 partidas sin mirar/.test(a.textContent), [...a.querySelectorAll("button")].map((b) => b.textContent), document.getElementById("fp-t-acumulado").checkVisibility()]),
            ["a_mirar", "A mirar", true, true, true, ["Ya lo miré", "Seguirlo en los sorteos"], true]);
        await p.click('#fp-acumulado [data-accion="acumulado-vista"]');
        await p.waitForSelector("dialog[open] input, dialog[open] textarea");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => /Ya se miraron todas sus partidas/.test(document.getElementById("fp-acumulado").textContent));
        igual("«Ya lo miré» en el acumulado marca todas sus partidas (por su nombre normalizado) y apaga el contador", await p.evaluate(() => [window.__fp.llamadas.filter((l) => l.action === "acumulado").map((l) => [l.tnr, l.clave, l.estado, l.token.length]), document.getElementById("fp-alertas-n").hidden]),
            [[["100", "perez luis", "vista", 64]], true]);

        await p.click("#fp-ver-mesas");
        await p.waitForFunction(() => document.querySelectorAll("#fp-mesas tr").length === 3);
        igual("«Ver las mesas y su peso»: cada mesa con su Elo, su peso y su porcentaje, por qué pesa y quién no aplica; la que no entra dice por qué", await p.$$eval("#fp-mesas tr", (l) => l.map((tr) => [...tr.children].map((td) => td.textContent))),
            [["1", "Clark, Arty (1644)", "Garcia, Alberto (2023)", "1,5 (43 %)", "Diferencia de 379 de Elo", "—"],
             ["2", "Cinco, Eva (1700)", "Seis, Fio (1710)", "2 (57 %)", "Se levantó 2 veces en esta ronda", "Seis, Fio no aplica: se revisó en la ronda 2"],
             ["3", "Siete, Gil (1500)", "Ocho, Hugo (1500)", "—", "Ninguno de los dos aplica", "…"]]);
        igual("el botón dice si la lista está abierta", await p.getAttribute("#fp-ver-mesas", "aria-expanded"), "true");

        await p.selectOption("#fp-categoria", "100");
        await p.selectOption("#fp-cantidad", "2");
        await p.click("#fp-sortear");
        await p.waitForSelector("dialog[open]");
        igual("antes de sortear pregunta, con la categoría, la ronda y que todavía no se avisa a nadie", await p.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [t.includes("2 mesas en Sub-12 Absoluto (ronda 3)"), t.includes("Todavía no se avisa a nadie")]; }), [true, true]);
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => document.querySelectorAll("#fp-lista tr").length === 2);
        igual("el sorteo llega a la función con SU ronda y el token; salen 2 mesas «de 2», con el peso, los motivos y quién no aplica", await p.evaluate(() => [window.__fp.llamadas.filter((l) => l.action === "sortear").map((l) => [l.ronda, l.tnrs, l.cantidad, l.token.length]),
            [...document.querySelectorAll("#fp-lista tr")].map((tr) => [tr.children[2].textContent, tr.children[3].textContent, tr.children[4].textContent])]),
            [[[3, ["100"], 2, 64]], [["Mesa 1 (de 2, peso 1,5)Diferencia de 379 de Elo", "Blancas: Clark, Arty (1644)Negras: Garcia, Alberto (2023)", "El ganador · si es tablas: Negras"],
                                     ["Mesa 2 (de 2, peso 2)Se levantó 2 veces en esta ronda", "Blancas: Cinco, Eva (1700)Negras: Seis, Fio (1710)⚠ Seis, Fio no aplica: se revisó en la ronda 2", "El ganador · si es tablas: Blancas"]]]);
        const fila = (mesa) => '#fp-lista tr:nth-child(' + mesa + ')';
        await p.click(fila(2) + ' [data-accion="aprobar"]');
        await p.waitForSelector("dialog[open]");
        igual("aprobar avisa del borde dorado y de quién no aplica", await p.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [t.includes("borde dorado"), t.includes("Ojo: Seis, Fio no aplica")]; }), [true, true]);
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction((s) => document.querySelector(s).dataset.estado === "aprobada", fila(2));
        igual("aprobada: le llegó el aviso a su árbitro y la fila dice que todavía no lo lee", await p.$eval(fila(2), (tr) => tr.children[5].textContent), "Aprobada: avisado su árbitro⏳ Ana Árbitra todavía no lo ha leído");
        // Su árbitro guarda el resultado (gana Cinco, Eva): una novedad que vibra fuerte y sube al título.
        await p.evaluate(() => { window.__vibra = []; navigator.vibrate = (x) => { window.__vibra.push(x); return true; };
            const f = window.__fp.sorteos.find((x) => x.mesa === 2); Object.assign(f, { revisar_color: "blancas", resultado_mesa: "1-0" }); window.__fp.avisos.find((a) => a.id === f.aviso_id).leido_en = new Date().toISOString(); window.CentroamericanoFairPlay.cargar(); });
        await p.waitForFunction(() => document.getElementById("fp-novedades-caja").checkVisibility());
        igual("novedades: el resultado que dice a quién ir a revisar y que su árbitro leyó el aviso; vibra fuerte y el título lleva cuántas", await p.evaluate(() => [[...document.querySelectorAll("#fp-novedades li")].map((li) => [li.textContent.replace(/^.*? · /, ""), li.dataset.fuerte || ""]), window.__vibra.length, window.__vibra[0].length, document.title.startsWith("(2) ")]),
            [[["🛡 Sub-12 Absoluto, ronda 3, mesa 2: terminó (1-0). Ve a revisar a Cinco, Eva.", "si"], ["✓ Ana Árbitra leyó el aviso de la Sub-12 Absoluto, ronda 3, mesa 2.", ""]], 1, 5, true]);
        igual("y la fila dice que falta que su árbitro confirme que lo retuvo", await p.$eval(fila(2), (tr) => /⏳ Terminó: falta que su árbitro confirme que lo retuvo/.test(tr.children[5].textContent)), true);
        await p.evaluate(() => { Object.assign(window.__fp.sorteos.find((x) => x.mesa === 2), { retenido_en: new Date().toISOString(), retenido_por: "Ana Árbitra (árbitro de mesa)" }); window.CentroamericanoFairPlay.cargar(); });
        await p.waitForFunction(() => document.querySelectorAll("#fp-novedades li").length === 3);
        igual("cuando su árbitro toca «Ya lo retuve»: la novedad arriba y la fila con la hora y quién", await p.evaluate(() => [document.querySelector("#fp-novedades li").textContent.replace(/^.*? · /, ""), /✋ Retenido a las .* \(Ana Árbitra \(árbitro de mesa\)\)/.test(document.querySelector('#fp-lista tr[data-estado="aprobada"]').children[5].textContent)]),
            ["✋ Ana Árbitra (árbitro de mesa) ya retuvo a Cinco, Eva (Sub-12 Absoluto, ronda 3, mesa 2).", true]);
        await p.click("#fp-novedades-listo");
        igual("«Ya las vi» las quita, y el título vuelve a ser el de antes", await p.evaluate(() => [document.getElementById("fp-novedades-caja").checkVisibility(), document.title.startsWith("(")]), [false, false]);
        await p.click(fila(1) + ' [data-accion="descartar"]');
        await p.waitForSelector("dialog[open] input, dialog[open] textarea");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForTimeout(300);
        igual("descartar sin motivo no llega a la función", await p.evaluate(() => window.__fp.llamadas.filter((l) => l.action === "descartar").length), 0);
        await p.click(fila(2) + ' [data-accion="revisar"]');
        await p.waitForSelector("dialog[open] select");
        igual("la revisión pregunta a quién se revisó entre los dos de la mesa", await p.$$eval("dialog[open] select", (l) => l.map((s) => [...s.options].map((o) => o.textContent))[1]), ["Cinco, Eva (blancas)", "Seis, Fio (negras)"]);
        await p.selectOption("dialog[open] select >> nth=0", "se_nego");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => /hace falta anotar qué pasó/.test(document.body.textContent));
        igual("«Se negó» sin decir qué pasó: la función lo rechaza y la mesa sigue aprobada", await p.$eval(fila(2), (tr) => tr.dataset.estado), "aprobada");
        await p.click(fila(2) + ' [data-accion="revisar"]');
        await p.waitForSelector("dialog[open] select");
        await p.selectOption("dialog[open] select >> nth=0", "sin_novedad");
        await p.selectOption("dialog[open] select >> nth=1", "blancas");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction((s) => document.querySelector(s).dataset.estado === "revisada", fila(2));
        igual("«Sin novedad» con Cinco, Eva: queda revisada con su nombre y quién la revisó", await p.$eval(fila(2), (tr) => [tr.children[4].textContent, tr.children[5].textContent]), ["Cinco, Eva", "RevisadaSin novedad · Laura Mora (Fair Play)"]);
        console.log("\n=== Anotar a mano una revisión de una ronda anterior ===");
        await p.click("#fp-manual");
        await p.waitForSelector("dialog[open] select");
        igual("primero pregunta la categoría, la ronda (de la 1 a la abierta, y empieza en la anterior) y la mesa", await p.$$eval("dialog[open] select", (l) => [[...l[0].options].map((o) => o.textContent), [...l[1].options].map((o) => o.textContent), l[1].value]), [["Sub-12 Absoluto", "Sub-14 Femenino"], ["Ronda 1", "Ronda 2", "Ronda 3"], "2"]);
        await p.selectOption("dialog[open] select >> nth=0", "100");
        await p.fill('dialog[open] input:not([type="hidden"])', "7");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => { const d = document.querySelector("dialog[open]"); return d && /ronda 2, mesa 7/.test(d.textContent); });
        igual("después, los dos jugadores de esa mesa con su Elo (de chess-results) para elegir a quién se revisó", await p.$$eval("dialog[open] select", (l) => [...l[0].options].map((o) => o.textContent)), ["Tres, Caro (1600) (blancas)", "Once, Kai (1500) (negras)"]);
        await p.selectOption("dialog[open] select >> nth=0", "negras");
        await p.selectOption("dialog[open] select >> nth=1", "hallazgo");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => /hace falta anotar qué pasó/.test(document.body.textContent));
        igual("un hallazgo sin decir qué pasó no se guarda (lo rechaza la base)", await p.evaluate(() => window.__fp.sorteos.filter((f) => f.origen === "manual").length), 0);
        await p.click("#fp-manual");
        await p.waitForSelector("dialog[open] select");
        await p.selectOption("dialog[open] select >> nth=0", "100");
        await p.fill('dialog[open] input:not([type="hidden"])', "7");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => { const d = document.querySelector("dialog[open]"); return d && /ronda 2, mesa 7/.test(d.textContent); });
        await p.selectOption("dialog[open] select >> nth=0", "negras");
        await p.selectOption("dialog[open] select >> nth=1", "hallazgo");
        await p.fill("dialog[open] textarea", "Tenía un papel con jugadas");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => document.querySelectorAll("#fp-lista tr").length === 3);
        igual("anotada: llega a la función con la categoría, la ronda, la mesa, a quién, el hallazgo y la nota, y el token del encargado", await p.evaluate(() => window.__fp.llamadas.filter((l) => l.action === "manual").map((l) => [l.tnr, l.ronda, l.mesa, l.color, l.resultado, l.nota, l.token.length]).pop()), ["100", 2, 7, "negras", "hallazgo", "Tenía un papel con jugadas", 64]);
        igual("en la lista: ronda 2, «Anotada a mano por» el encargado, a quién y el hallazgo", await p.$$eval("#fp-lista tr", (l) => l.filter((tr) => tr.children[1].textContent === "2").map((tr) => [tr.children[2].textContent, tr.children[4].textContent, tr.children[5].textContent])),
            [["Mesa 7Anotada a mano por Laura Mora (Fair Play)", "Once, Kai", "RevisadaHallazgo (se informa al principal) · Tenía un papel con jugadas · Laura Mora (Fair Play)"]]);
        // Una mesa sin emparejamientos leídos: pide escribir el nombre.
        await p.click("#fp-manual");
        await p.waitForSelector("dialog[open] select");
        await p.selectOption("dialog[open] select >> nth=0", "200");
        await p.selectOption("dialog[open] select >> nth=1", "1");
        await p.fill('dialog[open] input:not([type="hidden"])', "3");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => { const d = document.querySelector("dialog[open]"); return d && /ronda 1, mesa 3/.test(d.textContent); });
        igual("sin los emparejamientos de esa mesa, pide escribir el nombre (y con qué color jugaba)", await p.evaluate(() => [/escribe el nombre como aparece en chess-results/.test(document.querySelector("dialog[open]").textContent), !!document.querySelector('dialog[open] input:not([type="hidden"])')]), [true, true]);
        await p.fill('dialog[open] input:not([type="hidden"])', "Ana Pérez");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => document.querySelectorAll("#fp-lista tr").length === 4);
        igual("y queda con ese nombre", await p.evaluate(() => window.__fp.sorteos.filter((f) => f.origen === "manual").map((f) => [f.tnr, f.ronda, f.mesa, f.jugador, f.resultado])), [["100", 2, 7, "Once, Kai", "hallazgo"], ["200", 1, 3, "Ana Pérez", "sin_novedad"]]);

        console.log("\n=== Elegir una mesa a mano (no por sorteo) ===");
        await p.selectOption("#fp-categoria", "200");
        await p.click("#fp-elegir");
        await p.waitForFunction(() => { const d = document.querySelector("dialog[open]"); return d && /Elegir una mesa a mano · Sub-14 Femenino, ronda 3/.test(d.textContent); });
        igual("con la categoría desplegada: sus mesas libres con los jugadores, a quién se revisa y si se avisa ya", await p.$$eval("dialog[open] select", (l) => l.map((x) => [...x.options].map((o) => o.value))),
            [["1"], ["blancas", "negras", "ganador"], ["si", "no"]]);
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => /lleva el motivo/.test(document.body.textContent));
        igual("sin motivo no se elige", await p.evaluate(() => window.__fp.llamadas.filter((l) => l.action === "elegir").length), 0);
        await p.click("#fp-elegir");
        await p.waitForSelector("dialog[open] textarea");
        await p.selectOption("dialog[open] select >> nth=1", "blancas");
        await p.fill("dialog[open] textarea", "Lo pidió el árbitro principal");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => window.__fp.sorteos.some((f) => f.origen === "elegida") && /ya tiene el aviso de retener a Ana \(blancas\)/.test(document.body.textContent));
        igual("llega a la función: la categoría, la ronda, la mesa, el de blancas, el motivo y que avise ya", await p.evaluate(() => window.__fp.llamadas.filter((l) => l.action === "elegir").map((l) => [l.tnr, l.ronda, l.mesa, l.revisar, l.motivo, l.avisar]).pop()),
            ["200", 3, 1, "blancas", "Lo pidió el árbitro principal", true]);
        await p.waitForFunction(() => [...document.querySelectorAll("#fp-lista tr")].some((tr) => /Elegida a mano/.test(tr.textContent)));
        igual("en la lista: «Elegida a mano por» con el motivo, a quién (gane, pierda o empate) y aprobada", await p.$$eval("#fp-lista tr", (l) => l.filter((tr) => /Elegida a mano/.test(tr.textContent)).map((tr) => [tr.children[2].textContent, tr.children[4].textContent, tr.dataset.estado])),
            [["Mesa 1✋ Elegida a mano por Laura Mora (Fair Play) · Lo pidió el árbitro principal", "Ana (blancas), gane, pierda o empate", "aprobada"]]);
        await p.click("#fp-elegir");
        await p.waitForFunction(() => /no queda ninguna mesa por elegir/.test(document.body.textContent));
        igual("una mesa ya elegida no se vuelve a ofrecer", await p.evaluate(() => !document.querySelector("dialog[open]")), true);
        console.log("\n=== Borrar una mesa que no correspondía ===");
        const filaElegida = '#fp-lista tr[data-id="' + await p.evaluate(() => window.__fp.sorteos.find((f) => f.origen === "elegida").id) + '"]';
        igual("cada mesa de la lista tiene su «Borrar», con el nombre de la mesa para el lector de pantalla", await p.$$eval("#fp-lista tr", (l) => l.every((tr) => !!tr.querySelector('[data-accion="borrar"]'))), true);
        await p.click(filaElegida + ' [data-accion="borrar"]');
        await p.waitForSelector("dialog[open] input:not([type=hidden])");
        igual("avisa qué pasa al borrar (sale del registro y su árbitro recibe el aviso) y pide el motivo", await p.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [/deja de contar para el descanso/.test(t), /ya no hay que retener a nadie/.test(t), /Borrar la mesa/.test(t)]; }), [true, true, true]);
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => /hace falta el motivo/.test(document.body.textContent));
        igual("sin motivo no se borra", await p.evaluate(() => window.__fp.sorteos.some((f) => f.origen === "elegida")), true);
        await p.click(filaElegida + ' [data-accion="borrar"]');
        await p.waitForSelector("dialog[open] input:not([type=hidden])");
        await p.fill("dialog[open] input:not([type=hidden])", "Era de prueba");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction((s) => !document.querySelector(s), filaElegida);
        igual("borrada: llega a la función con su motivo y sale de la lista", await p.evaluate(() => [window.__fp.llamadas.filter((l) => l.action === "borrar").map((l) => l.motivo).pop(), window.__fp.sorteos.some((f) => f.origen === "elegida")]), ["Era de prueba", false]);
        await p.click("#fp-elegir");
        await p.waitForFunction(() => { const d = document.querySelector("dialog[open]"); return d && /Elegir una mesa a mano/.test(d.textContent); });
        igual("y la mesa se puede volver a elegir", await p.$$eval("dialog[open] select >> nth=0", (l) => [...l[0].options].map((o) => o.value)), ["1"]);
        await p.click("dialog[open] [data-avisos-cancelar]");
        await p.selectOption("#fp-categoria", "");

        const [bajada] = await Promise.all([p.waitForEvent("download"), p.click("#fp-pdf")]);
        const bytes = fs.readFileSync(await bajada.path()).toString("latin1");
        igual("el registro en PDF, con la marca de agua", [bajada.suggestedFilename(), bytes.startsWith("%PDF"), /\/SMask \d+ 0 R/.test(bytes)], ["fair-play-centroamericano-2026.pdf", true, true]);
        const [informe] = await Promise.all([p.waitForEvent("download"), p.click("#fp-informe")]);
        const ib = fs.readFileSync(await informe.path()).toString("latin1");
        igual("el informe de Fair Play del torneo en PDF: con la marca de agua, el resumen, las revisiones, el acumulado y las alertas", [informe.suggestedFilename(), ib.startsWith("%PDF"), /\/SMask \d+ 0 R/.test(ib), ...["Resumen", "Por categor", "Las revisiones", "Tenia un papel|Ten\\355a un papel|Ten.a un papel", "P.rez, Luis", "Castro, Alana"].map((x) => new RegExp(x).test(ib))],
            ["informe-fair-play-centroamericano-2026.pdf", true, true, true, true, true, true, true, true]);
        igual("en el informe ninguna celda ni encabezado sale cortado con «...»: parten en renglones", /\.\.\.\) Tj/.test(ib), false);
        // El informe de UN jugador (para presentar un caso): sus partidas, sus señales y el método.
        const [deJugador] = await Promise.all([p.waitForEvent("download"), p.click("#fp-indice tr >> nth=0 >> [data-accion='informe-jugador']")]);
        const jb = fs.readFileSync(await deJugador.path()).toString("latin1");
        igual("el informe de un jugador en PDF: lo pide con su categoría y su clave, con la marca de agua, su índice, lo que se tuvo en cuenta, partida por partida y cómo se midió",
            [deJugador.suggestedFilename(), await p.evaluate(() => window.__fp.llamadas.filter((l) => l.action === "jugador").map((l) => [l.tnr, l.clave]).pop()), jb.startsWith("%PDF"), /\/SMask \d+ 0 R/.test(jb),
                ...["El jugador", "como el de FIDE", "Lo que se tuvo en cuenta", "Partida por partida", "C.mo se midi", "Rachas"].map((x) => new RegExp(x).test(jb))],
            ["fair-play-perez-luis.pdf", ["100", "perez luis"], true, true, true, true, true, true, true, true]);
        igual("a 820 px no se desplaza a lo ancho, y sin errores en la página", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth).then((x) => [x, e.errores]), [true, []]);
        igual("en claro, todo el texto da 4,5 o más", await p.evaluate(CONTRASTE, TEXTO_PANEL), []);
        await e.ctx.close();
        const o = await abrir(browser, "centroamericano-fair-play.html", DOBLE_ENCARGADO, { hash: "d".repeat(64), esquema: "dark" });
        await o.p.waitForSelector(".cam-fp-alerta");
        await o.p.evaluate(() => { document.querySelector(".cam-fp-reglas").open = true; });
        igual("la guía de FIDE trae los dos ejemplos del seminario y los casos que enseñan", await o.p.evaluate(() => {
            const t = document.querySelector(".cam-fp-reglas").textContent;
            return ["Dos ejemplos del seminario", "z = −1,78", "z = 7,11", "2610 ± 212", "Shevchenko", "Docx", "Rausis", "Sandu", "Carlsen y Niemann", "Kramnik", "Toronto"].filter((x) => !t.includes(x));
        }), []);
        igual("en oscuro, todo el texto da 4,5 o más", await o.p.evaluate(CONTRASTE, TEXTO_PANEL), []);
        await o.ctx.close();

        console.log("\n=== La pestaña del árbitro principal: los QR de los encargados ===");
        const q = await abrir(browser, "centroamericano-mesas.html", DOBLE_PRINCIPAL, { hash: "fairplay" });
        await q.p.waitForFunction(() => document.querySelectorAll("#fp-enlaces .cam-fp-enlace").length === 1);
        igual("es la misma pantalla (sortear, alertas, sorteadas) y además los encargados con su QR; la función se llama sin token (con la sesión)", await q.p.evaluate(() => [!!document.getElementById("fp-sortear"), !!document.getElementById("fp-alertas"), document.querySelector("#fp-enlaces .cam-fp-enlace p").textContent, !!document.querySelector("#fp-enlaces svg"), window.__fp.llamadas.every((l) => !l.token)]), [true, true, "Laura Mora", true, true]);
        await q.p.fill("#fp-enlace-nombre", "Pedro Solís");
        await q.p.click('#fp-form-enlace button[type="submit"]');
        await q.p.waitForFunction(() => document.querySelectorAll("#fp-enlaces .cam-fp-enlace").length === 2);
        // Vence a los 10 días (lo que dura un evento): sirve para cualquier torneo, no solo el Centroamericano.
        const creados = await q.p.evaluate(() => window.__llamadas.filter((l) => l.insert === "centroamericano_fp_enlaces").map((l) => l.valores));
        igual("«Crear su QR» crea el enlace con el nombre y vence a los 10 días", creados.map((c) => ({ nombre: c.nombre, dias: Math.round((new Date(c.vence) - Date.now()) / 864e5) })), [{ nombre: "Pedro Solís", dias: 10 }]);
        await q.p.click('#fp-enlaces .cam-fp-enlace[data-id="en-1"] [data-accion="apagar"]');
        await q.p.waitForSelector("dialog[open]");
        await q.p.click("dialog[open] [data-avisos-aceptar]");
        await q.p.waitForFunction(() => document.querySelectorAll("#fp-enlaces .cam-fp-enlace").length === 1);
        igual("«Apagar» lo apaga (no lo borra) y deja de verse", await q.p.evaluate(() => window.__llamadas.filter((l) => l.update === "centroamericano_fp_enlaces").map((l) => [l.valores, l.f])), [[{ revocada: true }, { id: "en-1" }]]);
        // Las partidas de referencia: dos PGN (una partida con Elo, otra sin Elo que no se usa, la misma otra vez y una
        // relámpago que se salta), analizadas aquí y mandadas sin nombres.
        await q.p.waitForFunction(() => /Al día/.test((document.getElementById("fp-motor-estado") || {}).textContent || ""), null, { timeout: 120000 });
        const partidaA = '[Event "Nacional 2025"]\n[White "A"]\n[Black "B"]\n[WhiteElo "1800"]\n[BlackElo "1700"]\n[TimeControl "5400+30"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Bd2 Bxd2+ 8. Nbxd2 d5 9. exd5 Nxd5 10. Qb3 Nce7 11. O-O O-O *\n\n';
        const sinElo = '[Event "Nacional 2025"]\n[White "C"]\n[Black "D"]\n[Result "*"]\n\n1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 h6 7. Bh4 b6 8. cxd5 Nxd5 9. Bxe7 Qxe7 10. Nxd5 exd5 11. Rc1 Be6 *\n\n';
        const relampago = '[Event "Blitz 2025"]\n[White "G"]\n[Black "H"]\n[WhiteElo "1900"]\n[BlackElo "1850"]\n[TimeControl "180+2"]\n[Result "*"]\n\n1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 h6 7. Bh4 b6 8. cxd5 Nxd5 9. Bxe7 Qxe7 10. Nxd5 exd5 11. Rc1 Be6 *\n';
        await q.p.fill("#fp-ref-evento", "Nacional 2025");
        await q.p.setInputFiles("#fp-ref-archivo", [{ name: "nacional.pgn", mimeType: "text/plain", buffer: Buffer.from(partidaA + sinElo) }, { name: "otra.pgn", mimeType: "text/plain", buffer: Buffer.from(partidaA + relampago) }]);
        await q.p.click("#fp-ref-cargar");
        await q.p.waitForFunction(() => /hacen falta 600/.test(document.getElementById("fp-ref-estado").textContent), null, { timeout: 120000 });
        igual("la referencia: de los dos archivos, una sola vez la partida con Elo (la sin Elo, la repetida y la relámpago no), con sus jugadas (sin nombres), una evaluación y hasta 10 mejores por posición desde la 15, y el modelo recalculado al terminar", await q.p.evaluate(() => {
            const r = window.__fp.referencias; const g = r[0] || {};
            return [r.length, g.evento, g.elo_b, g.elo_n, (g.jugadas || []).length, Object.keys(g).some((k) => /white|black|nombre/i.test(k)), g.evals.slice(15).every((x) => typeof x === "number"), g.opciones.slice(15).every((o) => o.length >= 1 && o.length <= 10), g.trampa, document.getElementById("fp-ref-estado").textContent]; }),
            [1, "Nacional 2025", 1800, 1700, 22, false, true, true, null, "Listo: 1 partida de «Nacional 2025» (9 jugadas). El modelo todavía no se ajusta: hay 420 jugadas de jugadores con Elo y hacen falta 600."]);
        igual("al terminar de cargar, el modelo se recalcula ya (forzado), una sola vez", await q.p.evaluate(() => (window.__fp.modelos || []).map((m) => m.forzar)), [true]);
        // Volver a cargar lo mismo sigue donde quedó: no se repite nada.
        await q.p.click("#fp-ref-cargar");
        await q.p.waitForFunction(() => /ya estaban cargadas/.test(document.getElementById("fp-ref-estado").textContent), null, { timeout: 60000 });
        igual("volver a cargar lo mismo no repite nada (sigue donde quedó una carga cortada)", await q.p.evaluate(() => [window.__fp.referencias.length, document.getElementById("fp-ref-estado").textContent]),
            [1, "Todas esas partidas de «Nacional 2025» ya estaban cargadas."]);
        // Una transmisión de Lichess (una ronda), por su enlace.
        await q.p.fill("#fp-ref-evento", "Abierto 2025");
        await q.p.setInputFiles("#fp-ref-archivo", []);
        await q.p.fill("#fp-ref-enlace", "https://lichess.org/broadcast/abierto-2025/ronda-1/abc123");
        await q.p.click("#fp-ref-cargar");
        await q.p.waitForFunction(() => window.__fp.referencias.length === 2 && /Listo/.test(document.getElementById("fp-ref-estado").textContent), null, { timeout: 120000 });
        igual("una transmisión de Lichess por su enlace (de una ronda): se pide su PGN y se carga como cualquier otra", await q.p.evaluate(() => { const g = window.__fp.referencias[1]; return [g.evento, g.elo_b, g.elo_n, g.jugadas.length]; }), ["Abierto 2025", 2100, 2050, 22]);
        // Las de prueba: solo las que dicen quién usó el motor, con ese dato.
        await q.p.fill("#fp-ref-evento", "Pruebas con motor");
        await q.p.fill("#fp-ref-enlace", "");
        await q.p.selectOption("#fp-ref-tipo", "prueba");
        await q.p.setInputFiles("#fp-ref-archivo", { name: "pruebas.pgn", mimeType: "text/plain", buffer: Buffer.from(partidaA.replace('[Result "*"]', '[Trampa "Negras"]\n[Result "*"]') + partidaA.replace('[White "A"]', '[White "Z"]')) });
        await q.p.click("#fp-ref-cargar");
        await q.p.waitForFunction(() => window.__fp.referencias.length === 3 && /Listo/.test(document.getElementById("fp-ref-estado").textContent), null, { timeout: 120000 });
        igual("las de prueba: solo la que trae [Trampa \"Negras\"] (la otra, sin la etiqueta, no), y va con quién hizo trampa", await q.p.evaluate(() => window.__fp.referencias.slice(2).map((g) => [g.evento, g.trampa])), [["Pruebas con motor", "negras"]]);
        igual("y sin errores en la página", q.errores, []);
        await q.ctx.close();

        console.log("\n=== La tablet del árbitro: el borde dorado ===");
        const t = await abrir(browser, "centroamericano-arbitro.html", dobleArbitro(), { hash: TOKEN });
        await t.p.waitForSelector(".cam-mesa");
        // La función de Fair Play contesta que su mesa 2 está aprobada y que si ganan negras no aplica.
        await t.p.evaluate(() => {
            const original = window.sb.functions.invoke;
            const negras = "Acuña Porras Fabio";   // la mesa 2 del doble (MESAS de lib/doble-centroamericano-arbitro.js)
            window.__mesasFp = [{ mesa: 2, estado: "aprobada", color_si_tablas: "blancas", aplica_blancas: true, aplica_negras: false, no_aplica: negras + " no aplica: se revisó en la ronda 1", revisar_color: null }];
            // Una COPIA, como llega por la red: si devolviera el mismo objeto que la prueba cambia después, la página
            // vería el cambio sin pedirlo (y solo lo pintaba porque antes rearmaba las tarjetas siempre).
            window.sb.functions.invoke = (f, o) => f === "centroamericano-fair-play" ? Promise.resolve({ data: { ok: true, mesas: JSON.parse(JSON.stringify(window.__mesasFp)) }, error: null }) : original(f, o);
        });
        await t.p.click("#actualizar");
        await t.p.waitForSelector('.cam-mesa[data-fair-play="aprobada"]', { timeout: 30000 });
        const mesa2 = '.cam-mesa[data-mesa="2"]';
        // Dónde se mueve el borde: [la mesa, el bloque de blancas, el de negras] → [animación, animación del ::before].
        const borde = () => t.p.evaluate((s) => { const a = document.querySelector(s);
            const de = (n) => [getComputedStyle(n).animationName, getComputedStyle(n, "::before").animationName];
            return [de(a), de(a.querySelector('.cam-jugador[data-color="blancas"]')), de(a.querySelector('.cam-jugador[data-color="negras"]')), a.getAttribute("aria-label")]; }, mesa2);
        const QUIETO = ["none", "none"], MUEVE = ["cam-fp-brillo", "cam-fp-giro"];
        igual("solo blancas aplica: el borde dorado se mueve SOLO en su bloque, no en la mesa ni en negras (y la banda lo dice escrito)", [await t.p.evaluate(() => document.querySelectorAll(".cam-mesa[data-fair-play]").length), ...(await borde()), await t.p.$eval(mesa2 + " .cam-fp-banda", (b) => b.checkVisibility() && /retén al GANADOR/.test(b.textContent))],
            [1, QUIETO, MUEVE, QUIETO, "Mesa 2, elegida para Fair Play (blancas)", true]);
        const cambiar = async (x, espera) => { await t.p.evaluate((x) => { Object.assign(window.__mesasFp[0], x); }, x); await t.p.click("#actualizar"); await t.p.waitForFunction(espera, null, { timeout: 30000 }); };
        await cambiar({ aplica_blancas: false, aplica_negras: true }, () => document.querySelector('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="negras"][data-fair-play="si"]'));
        igual("solo negras aplica: solo su bloque", await borde(), [QUIETO, QUIETO, MUEVE, "Mesa 2, elegida para Fair Play (negras)"]);
        await cambiar({ aplica_blancas: true, aplica_negras: true }, () => document.querySelector('.cam-mesa[data-mesa="2"]').dataset.fpAlcance === "mesa");
        igual("aplican los dos: se mueve la ficha completa", await borde(), [MUEVE, QUIETO, QUIETO, "Mesa 2, elegida para Fair Play"]);
        await t.p.emulateMedia({ reducedMotion: "reduce" });
        igual("con «reducir movimiento», el borde dorado queda quieto (pero sigue)", await t.p.evaluate((s) => { const cs = getComputedStyle(document.querySelector(s)); return [cs.animationName, cs.boxShadow !== "none"]; }, mesa2), ["none", true]);
        await t.p.emulateMedia({ reducedMotion: "no-preference" });
        await cambiar({ aplica_blancas: true, aplica_negras: false }, () => document.querySelector('.cam-mesa[data-mesa="2"]').dataset.fpAlcance === "blancas");
        await t.p.selectOption("#res-2", "3");
        igual("al elegir que ganan negras (que no aplica), la banda lo dice: no aplica, la mesa queda sin efecto", await t.p.$eval(mesa2 + " .cam-fp-banda", (b) => [b.dataset.tipo, /NO APLICA \(se revisó en la ronda 1\)\. La mesa queda sin efecto/.test(b.textContent)]), ["no-aplica", true]);
        await t.p.selectOption("#res-2", "1");
        igual("y si ganan blancas: «retén a …»", await t.p.$eval(mesa2 + " .cam-fp-banda", (b) => [b.dataset.tipo, /retén a .* \(blancas\)/.test(b.textContent)]), ["retener", true]);
        // El resultado ya guardado: gana blancas, que aplica. «Ya retuve a …» avisa a Fair Play.
        await t.p.evaluate(() => { window.__retener = []; const antes = window.sb.functions.invoke;
            window.sb.functions.invoke = (f, o) => { if (f === "centroamericano-fair-play" && o.body.action === "retener") { window.__retener.push(o.body); window.__mesasFp[0].retenido_en = new Date().toISOString(); return Promise.resolve({ data: { ok: true, mesa: { mesa: 2, retenido_en: window.__mesasFp[0].retenido_en } }, error: null }); } return antes(f, o); }; });
        await t.p.selectOption("#res-2", "");
        await cambiar({ revisar_color: "blancas" }, () => document.querySelector('.cam-mesa[data-mesa="2"] [data-accion="retener"]'));
        igual("con el resultado guardado, el borde se mueve en el ganador y aparece «Ya retuve a …»", [(await borde())[1], await t.p.$eval(mesa2 + ' [data-accion="retener"]', (b) => b.textContent)], [MUEVE, "✋ Ya retuve a Harvey Ian"]);
        await t.p.click(mesa2 + ' [data-accion="retener"]');
        await t.p.waitForSelector(mesa2 + " .cam-fp-retenido");
        igual("«Ya retuve» llega a la función con SU token, la ronda y la mesa, y la banda dice que ya avisó", await t.p.evaluate((s) => [window.__retener.map((b) => [b.arbitro_token.length, typeof b.ronda, b.mesa]), /✓ Avisaste a Fair Play que retuviste a .* \(.*\)\. Que no se vaya/.test(document.querySelector(s + " .cam-fp-retenido").textContent), !document.querySelector(s + ' [data-accion="retener"]')], mesa2),
            [[[64, "number", 2]], true, true]);
        igual("la banda dorada (y su botón) da 4,5 o más", await t.p.evaluate(CONTRASTE, ".cam-fp-banda p, .cam-fp-banda button"), []);
        igual("y sin errores en la tablet", t.errores, []);
        await t.ctx.close();
    } finally {
        await browser.close();
    }
    console.log(fallos ? "\n" + fallos + " fallo(s)." : "\nTodo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
