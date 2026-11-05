#!/usr/bin/env node
/* La transmisión sin atraso para los árbitros del Centroamericano: lo que se puede comprobar sin navegador.
 *   - js/centroamericano-arbitro-vivo.js: los relojes que corren desde la lectura, el texto de cada mesa y la lectura
 *     que pasa al reloj apagado (sin atraso, la hora es la de la lectura menos lo que llevaba pensando);
 *   - la Edge Function centroamericano-mesas-vivo: la regla de los nombres es la MISMA que la del navegador, los
 *     jugadores salen de la lectura compartida de chess-results (no de la tablet), y nunca devuelve la clave;
 *   - las migraciones: solo service_role lee, guarda y quita la clave (en la bóveda);
 *   - las páginas: el botón de la tablet, la conexión de la organización y la copia privada de Pareo para DGT.
 * Ver «La transmisión sin atraso para los árbitros» en docs/decisiones/juegos-y-torneos.md.
 *
 *   node herramientas/verificar-centroamericano-mesas-vivo.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");
const V = require(path.join(RAIZ, "js/centroamericano-arbitro-vivo.js"));
const TX = require(path.join(RAIZ, "js/centroamericano-transmision-reloj.js"));

let fallas = 0, pruebas = 0;
function ok(nombre, cond, detalle) {
  pruebas++;
  if (!cond) { fallas++; console.error("✗ " + nombre + (detalle ? " — " + detalle : "")); }
}

// ---- los relojes de la tablet
const LEIDA = Date.UTC(2026, 10, 4, 16, 0, 0);
const enJuego = { mesa: 3, fen: "8/8/8/8/8/8/8/K6k b - - 0 24", estado: "*", reloj_b: 270000, reloj_n: 312000, piensa: 40 };
const r1 = V.relojes(enJuego, LEIDA + 20000, LEIDA);
ok("le toca a las negras: su reloj corre (lo que llevaba pensando + lo que pasó desde la lectura)", r1.turno === "negras" && r1.negras === 3120 - 60 && r1.blancas === 2700, JSON.stringify(r1));
const r2 = V.relojes(Object.assign({}, enJuego, { estado: "1-0" }), LEIDA + 20000, LEIDA);
ok("terminada: ningún reloj corre", r2.terminada && r2.negras === 3120 && r2.blancas === 2700);
const r3 = V.relojes({ fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", estado: "*", reloj_b: 540000, reloj_n: 540000, piensa: 100 }, LEIDA + 5000, LEIDA);
ok("sin ninguna jugada: el reloj no corre (todavía no empezó)", r3.blancas === 5400);
ok("el texto de la mesa", V.texto(enJuego, LEIDA, LEIDA) === "Van 24 jugadas · le toca a las negras · Blancas 45:00 · Negras 51:20", V.texto(enJuego, LEIDA, LEIDA));
ok("el texto de una terminada", /^Terminó en la transmisión: 1-0/.test(V.texto(Object.assign({}, enJuego, { estado: "1-0" }), LEIDA, LEIDA)));
ok("horas, minutos y segundos", V.hms(3725) === "1:02:05" && V.hms(59) === "0:59" && V.hms(-5) === "−0:05" && V.hms(null) === "—");

// ---- la lectura para el reloj apagado: sin atraso, la hora es la de la lectura menos lo que llevaba pensando
const c = TX.controlDe(V.lectura(enJuego), { ahora: LEIDA, atraso: 0 });
ok("sin atraso: el control es de la lectura menos lo que llevaba pensando", !c.error && new Date(c.ocurrio).getTime() === LEIDA - 40000 && c.atraso === 0, JSON.stringify(c));
ok("sin atraso: las jugadas y los relojes", c.j_blancas === 24 && c.j_negras === 23 && c.t_blancas === 2700 && c.t_negras === 3120);
const conInicio = TX.controlDe(V.lectura(enJuego), { ahora: LEIDA, atraso: 0, inicio: LEIDA - 40000 - ((5400 + 30 * 24 - 2700) + (5400 + 30 * 23 - 3120)) * 1000 });
ok("sin atraso y con la hora de inicio que cuadra: sin avisos", conInicio.avisos.length === 0, JSON.stringify(conInicio.avisos));

// ---- LiveChess: las jugadas con su reloj, el control de tiempos y las tablas
const JUG = ["e4 5457+5", "c5 5439+20", "Nf3 5482+5", "Nc6 5462+6", "Bb5 5509+3"];
const PRIMERA = Date.UTC(2026, 10, 3, 15, 3, 15);
const lj = V.leerJugadas(JUG, PRIMERA);
ok("LiveChess: cada jugada con su reloj y lo que pensó; la hora de cada una suma lo pensado desde la primera",
  lj.sans.join(" ") === "e4 c5 Nf3 Nc6 Bb5" && lj.relojes[4].reloj === 5509 && lj.relojes[4].ms === PRIMERA + (20 + 5 + 6 + 3) * 1000, JSON.stringify(lj.relojes[4]));
const cLc = V.control({ fuente: "livechess", jugadas: JUG, primera: PRIMERA });
ok("el control de LiveChess: el último reloj de cada uno, sus jugadas, el turno y la hora real de la última jugada",
  cLc.t_blancas === 5509 && cLc.t_negras === 5462 && cLc.j_blancas === 3 && cLc.j_negras === 2 && cLc.turno === "negras" && cLc.ocurrio === new Date(PRIMERA + 34000).toISOString() && cLc.fuente === "livechess", JSON.stringify(cLc));
ok("sin las dos jugadas no hay control", V.control({ fuente: "livechess", jugadas: ["e4 5457+5"], primera: PRIMERA }) === null);
const REP = "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Na5 Bc2 c5 d4 Qc7 Nbd2 Bd7 Nf1 Rfe8 Ng3 g6 Bg5 Bf8 Qd2 Bg7 Bh6 Bh8 Bg5 Bg7 Bh6 Bh8 Bg5 Bg7".split(" ");
const tRep = V.tablas(REP);
ok("la triple repetición, en la jugada en que pasa y en la notación de la planilla (A, no B)", tRep && tRep.repeticiones.length === 1 && tRep.repeticiones[0].ply === 40 && tRep.repeticiones[0].jugada === "20… Ag7" && !tRep.cinco, JSON.stringify(tRep && tRep.repeticiones));
ok("una jugada antes todavía no", V.tablas(REP.slice(0, 39)).repeticiones.length === 0);
const QUINT = REP.concat("Bh6 Bh8 Bg5 Bg7 Bh6 Bh8 Bg5 Bg7".split(" "));
const tQ = V.tablas(QUINT);
ok("la quíntuple: tablas sin reclamo (9.6.1)", tQ && tQ.cinco && tQ.cinco.ply === 48, JSON.stringify(tQ && tQ.cinco));
const vistas = new Set();
const mRep = V.normalizar({ mesa: 2, fuente: "livechess", jugadas: REP.map((x) => x + " 5000+10"), primera: PRIMERA, estado: "*" }, PRIMERA + 600000);
const al1 = V.alertasNuevas([mRep], 3, vistas), al2 = V.alertasNuevas([mRep], 3, vistas);
ok("la alerta sale una vez por mesa, tipo y jugada (al volver a leer no se repite)", al1.length === 1 && al1[0].tipo === "triple" && /art\. 9\.2/.test(al1[0].texto) && al2.length === 0, JSON.stringify(al1));
const m5 = V.normalizar({ mesa: 4, fuente: "livechess", jugadas: QUINT.map((x) => x + " 5000+10"), primera: PRIMERA, estado: "*" }, PRIMERA);
const al5 = V.alertasNuevas([m5], 3, new Set());
ok("con la quíntuple, el aviso es el de tablas sin reclamo (no el de reclamar)", al5.length === 1 && al5[0].tipo === "cinco" && /9\.6\.1/.test(al5[0].texto), JSON.stringify(al5));
ok("la posición que se ve sale de las jugadas, y lo que lleva pensando quien tiene el turno", /^r/.test(mRep.fen) && mRep.fen.split(" ")[1] === "w" && mRep.reloj_b === 500000 && mRep.piensa === 600 - 39 * 10, mRep.fen + " " + mRep.piensa);
// Las 50 jugadas (art. 9.3): una partida de verdad, armada con chess.js (determinista: la primera jugada en orden que no
// mueve un peón, no captura, no da jaque ni repite una posición), con 50 jugadas de cada uno sin peón ni captura.
const { Chess } = require("chess.js");
const PRINC = ["e4", "e5", "d4", "d5"];
const c50 = new Chess(); PRINC.forEach((x) => c50.move(x));
const clave50 = () => c50.fen().split(" ").slice(0, 4).join(" ");
const vistas50 = new Set([clave50()]), sin50 = [];
(function buscar() {
  if (sin50.length === 110) return true;
  for (const m of c50.moves({ verbose: true }).filter((x) => x.piece !== "p" && !x.captured).sort((a, b) => (a.san < b.san ? -1 : 1))) {
    c50.move(m.san);
    const k = clave50();
    if (!vistas50.has(k) && !c50.in_check()) { vistas50.add(k); sin50.push(m.san); if (buscar()) return true; sin50.pop(); vistas50.delete(k); }
    c50.undo();
  }
  return false;
})();
const t50 = V.tablas(PRINC.concat(sin50));
ok("las 50 jugadas: en la jugada en que se cumplen, con dónde empezó la cuenta, y sin repeticiones de por medio",
  t50 && t50.cincuenta && t50.cincuenta.ply === 104 && t50.cincuenta.jugada === "52… Aa4" && t50.cincuenta.desde === "3. Aa6" && !t50.repeticiones.length && !t50.setentaYCinco, JSON.stringify(t50 && t50.cincuenta));
ok("una jugada antes todavía no", !V.tablas(PRINC.concat(sin50.slice(0, 99))).cincuenta);
const m50 = V.normalizar({ mesa: 5, fuente: "livechess", jugadas: PRINC.concat(sin50).map((x) => x + " 5000+10"), primera: PRIMERA, estado: "*" }, PRIMERA);
const al50 = V.alertasNuevas([m50], 3, new Set());
ok("el aviso de las 50: se pueden reclamar (9.3), con la jugada y dónde empezó la cuenta", al50.length === 1 && al50[0].tipo === "50" && /art\. 9\.3/.test(al50[0].texto) && /52… Aa4/.test(al50[0].texto) && /empezó con 3\. Aa6/.test(al50[0].texto), JSON.stringify(al50));
ok("la tablet le pone su título al aviso de las 50", /"50": "50 jugadas sin peón ni captura"/.test(leer("js/centroamericano-arbitro.js")));
// La bandera caída (art. 6.9): con el reloj en vivo de LiveChess, o con el último registrado si no llega.
const TB = Date.UTC(2026, 10, 5, 16, 0, 0);
const mB = V.normalizar({ mesa: 3, fuente: "livechess", jugadas: ["e4 5457+5", "c5 40+20", "Nf3 5482+5"], primera: TB - 60000, estado: "*", en_vivo: true }, TB);
ok("sin reloj en vivo: el último registrado de quien tiene el turno menos lo que pasó (todavía le quedan 5 s: nada)", V.bandera(mB, TB, TB) === null);
const bB = V.bandera(mB, TB + 15000, TB);
ok("…y 15 s después, la bandera de las negras", bB && bB.color === "negras" && bB.queda === -10 && !bB.rivalSoloRey, JSON.stringify(bB));
ok("un tablero que dejó de transmitir no da bandera (no se sabe si el reloj sigue corriendo)", V.bandera(Object.assign({}, mB, { en_vivo: false }), TB + 15000, TB) === null);
const enVivo = Object.assign({}, mB, { reloj: { white: 5400, black: 3, run: false, time: TB } });
ok("con el reloj en vivo: corre el de las negras, a los 2 s todavía no; a los 4 s, sí", V.bandera(enVivo, TB + 2000, TB) === null && V.bandera(enVivo, TB + 4000, TB).color === "negras");
ok("con el reloj detenido (lo paró el árbitro) no hay bandera", V.bandera(Object.assign({}, mB, { reloj: { white: 5400, black: 0, run: null, time: TB } }), TB + 9000, TB) === null);
ok("con la partida terminada no hay bandera", V.bandera(Object.assign({}, enVivo, { estado: "1-0" }), TB + 9000, TB) === null);
const bSolo = V.bandera(Object.assign({}, mB, { fen: "8/8/8/8/8/8/8/K6k b - - 0 40", reloj: { white: 30, black: 0, run: false, time: TB } }), TB + 1000, TB);
ok("si al rival solo le queda el rey, se dice (serían tablas)", bSolo && bSolo.rivalSoloRey === true, JSON.stringify(bSolo));
const vistasB = new Set();
const alB = V.alertasBandera([enVivo], 5, TB + 4000, TB, vistasB), alB2 = V.alertasBandera([enVivo], 5, TB + 9000, TB, vistasB);
ok("el aviso de la bandera: una vez, con el color, la mesa y el art. 6.9", alB.length === 1 && alB[0].tipo === "bandera" && /a las negras de la mesa 3 se les acabó el tiempo/.test(alB[0].texto) && /art\. 6\.9/.test(alB[0].texto) && alB2.length === 0, JSON.stringify(alB));
ok("la tablet le pone su título y mira la bandera solo con datos de hace menos de 30 s", /bandera: "Bandera caída"/.test(leer("js/centroamericano-arbitro.js")) && /Date\.now\(\) - leidaMs < 30000\) alertasBandera\(/.test(leer("js/centroamericano-arbitro-vivo.js")));
ok("la notación de la planilla", V.esp("Nxe5+") === "Cxe5+" && V.esp("O-O") === "O-O" && V.esp("e8=Q") === "e8=D" && V.esp("Kh1") === "Rh1" && V.esp("Rd1") === "Td1");

// ---- la Edge Function
const fn = leer("supabase/functions/centroamericano-mesas-vivo/index.ts");
const deJs = leer("js/centroamericano-transmision-reloj.js");
// Las dos piezas de la regla (las palabras y la comparación), sin comentarios, sangría ni tipos de TypeScript.
const regla = (t) => {
  const p = (t.match(/const palabras = [^;]*;/) || [""])[0];
  const f = (t.match(/function mismoJugador\([^)]*\) \{[\s\S]*?\n\s*\}\n/) || [""])[0];
  return (p + "\n" + f).replace(/: unknown/g, "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//")).join("\n");
};
ok("la regla de los nombres es la misma en el navegador y en la función", regla(fn) && regla(fn) === regla(deJs), "\n" + regla(fn) + "\n---\n" + regla(deJs));
ok("los jugadores de sus mesas salen de la lectura compartida de chess-results y de su rango", /from\("centroamericano_lecturas"\)/.test(fn) && /m\.mesa >= a\.mesa_desde && m\.mesa <= a\.mesa_hasta/.test(fn));
ok("un enlace apagado o vencido no lee nada", /a\.revocada \|\| new Date\(a\.vence\)/.test(fn));
const respuestas = fn.match(/json\(\{[^;]*\}/g) || [];
const sinTextos = (x) => x.replace(/"(?:[^"\\]|\\.)*"/g, '""');
ok("nunca devuelve la clave ni los enlaces privados", respuestas.length > 5 && respuestas.every((x) => !/\btoken\b|\benlace\b|\bids\b/.test(sinTextos(x))), respuestas.filter((x) => /\btoken\b|\benlace\b|\bids\b/.test(sinTextos(x))).join(" | "));
ok("la organización necesita la herramienta «mesa-arbitro»", /tengo_herramienta", \{ p_herramienta: "mesa-arbitro" \}/.test(fn));
ok("la clave se prueba con Lichess y debe poder leer lo privado (study:read)", /\/api\/token\/test/.test(fn) && /includes\("study:read"\)/.test(fn));
const desplegadas = leer("supabase/esquema/funciones-desplegadas.txt");
ok("está en la lista de desplegadas, sin JWT (la tablet no tiene sesión)", /^centroamericano-mesas-vivo\s+false\s/m.test(desplegadas));

ok("LiveChess: nunca devuelve el id del torneo (es la transmisión sin atraso)", respuestas.every((x) => !/torneo_id/.test(sinTextos(x))));
ok("LiveChess: la mesa es el tablero, y los dos nombres tienen que coincidir", /pareos\[m\.mesa - 1\]/.test(fn) && /mismoJugador\(m\.blancas, nombreLc\(p\.white\)\) && mismoJugador\(m\.negras, nombreLc\(p\.black\)\)/.test(fn));
ok("LiveChess: solo los tableros que transmite cada categoría", /if \(tabs\.size && !tabs\.has\(m\.mesa\)\) return;/.test(fn));
const mLc = leer("supabase/migraciones/20261104050145_centroamericano_livechess.sql");
ok("los enlaces de LiveChess: con RLS, sin políticas y sin permisos para anon y authenticated (solo la función los lee)", /enable row level security/.test(mLc) && /revoke all on public\.centroamericano_livechess from public, anon, authenticated;/.test(mLc) && !/create policy/i.test(mLc) && !/\bdrop\b/i.test(mLc.replace(/--.*/g, "")));
ok("los enlaces de LiveChess no están en el repositorio", !/livechesscloud\.com\/#[0-9a-f]{8}-/i.test(mLc + fn + leer("js/centroamericano-arbitro-vivo.js") + leer("js/centroamericano-vivo-conectar.js")));

// ---- las migraciones
const m1 = leer("supabase/migraciones/20261104023302_centroamericano_vivo_arbitros.sql");
const m2 = leer("supabase/migraciones/20261104024300_centroamericano_vivo_varios_torneos.sql");
for (const f of ["centroamericano_vivo_leer()", "centroamericano_vivo_guardar(text, text)", "centroamericano_vivo_quitar()"]) {
  const todas = m1 + m2;
  ok(f + ": se le quita a public, anon y authenticated y solo la usa service_role",
    todas.includes("revoke all on function public." + f + " from public, anon, authenticated;") && todas.includes("grant execute on function public." + f + " to service_role;"));
}
ok("la clave va en la bóveda, no en una tabla", /vault\.create_secret\(p_token, 'centroamericano_vivo_token'\)/.test(m2) && !/create table/i.test(m1 + m2));
ok("las migraciones no borran nada", !/\bdrop\b|\bdelete\b/i.test(m1 + m2));

// ---- las páginas
const tablet = leer("centroamericano-arbitro.html");
ok("la tablet: el botón «Mis mesas en vivo» empieza escondido", /<button type="button" id="ver-vivo"[^>]*hidden>/.test(tablet));
const i1 = tablet.indexOf('src="js/tablero-fen.js"'), i2 = tablet.indexOf('src="js/centroamericano-arbitro-vivo.js"'), i3 = tablet.indexOf('src="js/centroamericano-arbitro.js"');
ok("la tablet carga el tablero y el módulo antes de su página", i1 > 0 && i2 > i1 && i3 > i2);
const arb = leer("js/centroamericano-arbitro.js");
ok("la tablet arranca el módulo con su token, su botón y el aviso de las tablas", /CentroamericanoArbitroVivo\.iniciar\(\{ token, boton: \$\("ver-vivo"\), alAlertar: alertaDeTablas \}\)/.test(arb));
const iC = tablet.indexOf('src="js/vendor/chess.js"'), iR = tablet.indexOf('src="js/reclamos-tablas.js"');
ok("la tablet carga chess.js y la regla de las tablas antes del módulo", iC > 0 && iR > iC && i2 > iR);
ok("el aviso de las tablas es lo primero de la página", /<div id="app" hidden>\s*<!--[\s\S]*?-->\s*<section id="alertas-vivo"/.test(tablet));
ok("el control de tiempos se llena solo con la transmisión y, si no la reconoce, queda a mano", /llenarConTx\(ctlTx\)/.test(arb) && /Anótalo a mano, como siempre\./.test(arb) && /anotarTodasTx/.test(arb));
ok("el reloj apagado usa primero la transmisión sin atraso", /VIVO\.deLaMesa\(mesa\)/.test(arb) && /atraso: v\.delay/.test(arb));
const vivo = leer("js/centroamericano-arbitro-vivo.js");
ok("la tablet le pide a la función nueva, con el token de su enlace", /functions\.invoke\("centroamericano-mesas-vivo", \{ body: \{ action: "mesas", arbitro_token: o\.token\(\) \} \}\)/.test(vivo));
const org = leer("centroamericano-mesas.html");
ok("la organización: la conexión con su clave en un campo de contraseña", /id="vivo-token" type="password"/.test(org) && /id="vivo-enlace"/.test(org) && /src="js\/centroamericano-vivo-conectar\.js"/.test(org));
ok("la organización: pegar la tabla de LiveChess, que la función prueba y guarda", /id="livechess-texto"/.test(org) && /llamar\("livechess_guardar", \{ texto \}\)/.test(leer("js/centroamericano-vivo-conectar.js")));
ok("la organización: la clave se borra del campo al conectar", /\$\("vivo-token"\)\.value = ""/.test(leer("js/centroamericano-vivo-conectar.js")));
const dgt = leer("js/pareo/dgt.js");
ok("Pareo para DGT: la visibilidad privada llega a Lichess", /d\.visibilidad === "private" \? d\.visibilidad/.test(dgt));
const dgtPag = leer("js/pareo-dgt.js"), dgtDir = leer("js/pareo-dgt-directo.js");
ok("Pareo para DGT: la copia de los árbitros es privada y cada jugada va también ahí", /visibilidad: "private"/.test(dgtPag) && /if \(r\.privada\) await API\(\)\.empujar\(r\.privada\.id, pgn\)/.test(dgtDir));
ok("Pareo para DGT: si la copia privada falla, la pública no se frena", /empujar\(r\.privada\.id, pgn\)\.catch\(/.test(dgtDir));
ok("la política de privacidad dice que la clave se guarda cifrada", /clave de su cuenta de Lichess que solo sirve para leer sus transmisiones privadas: queda cifrada/.test(leer("privacidad.html")));

if (fallas) { console.error("\n" + fallas + " de " + pruebas + " comprobaciones fallaron."); process.exit(1); }
console.log("✓ La transmisión sin atraso para los árbitros: " + pruebas + " comprobaciones.");
