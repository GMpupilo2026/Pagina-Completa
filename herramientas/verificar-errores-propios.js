/* Comprueba «Tus propios errores» (js/errores-propios.js) sin navegador ni
 * motor: la detección de errores, cómo se arma cada ejercicio y la regla que
 * corrige la página. La página, jugada con partidas y un motor de mentira, la
 * prueba herramientas/verificar-tipos-pagina.js.
 *
 *   - detectar(): solo cuenta las jugadas del alumno (con cualquier color y
 *     con la posición de inicio con las negras al turno), pide una caída de 2
 *     peones o más, separa «regalaste» (estaba bien y quedó mal) de «se te
 *     escapó» (ganaba y ya no), no cuenta lo que ya estaba perdido y se queda
 *     con los 3 más grandes de cada partida;
 *   - ejercicio(): descarta el error si la mirada honda pone la jugada de la
 *     partida entre las buenas, o si la mejor no deja 2 peones por encima;
 *     las buenas son las que quedan a menos de 0,5 de la mejor;
 *   - posiciones(): una partida que no se puede reproducir desde la inicial
 *     (empezó «desde el tablero») da null y no se analiza;
 *   - acierta(): cuenta cualquier jugada buena, con o sin «+», y reconoce la
 *     jugada de la partida;
 *   - temaDelError() / temasDe(): el tema de cada error con el reconocedor de
 *     la preparación de rivales (si regaló, el del castigo del rival; si se le
 *     escapó, el de la mejor que no vio) y cuál se repite;
 *   - leerJugadas(): una partida de torneo copiada de la planilla, en español
 *     o en inglés, con o sin números, o un PGN con comentarios y variantes,
 *     sale en SAN inglesa comprobada con chess.js; si una jugada no se puede
 *     hacer, dice cuál (número y color);
 *   - deLaWeb(): de las partidas de Lichess o Chess.com, solo las de ajedrez
 *     normal desde la inicial en que jugó el usuario, sin repetir, con el id
 *     del sitio como clave;
 *   - lineaDeApertura(): en las primeras 10 jugadas, la línea del banco de
 *     Aperturas que pasa por la posición (por la posición, no por el orden):
 *     la celada del rival en que cayó, o la teoría de su color;
 *   - deFilas(): lo que lee Informes desde training_state. No le cree nada al
 *     navegador del alumno: descarta lo que no tiene forma de ejercicio (una
 *     «jugada» que es HTML, un nivel que no existe, un JSON roto) y cuenta las
 *     estrellas solo de sus ejercicios.
 *
 * Uso: node herramientas/verificar-errores-propios.js
 */
"use strict";
const { Chess } = require("chess.js");
const E = require("../js/errores-propios.js");
const C = require("../js/tipos-catalogo.js");

let fallos = 0, pruebas = 0;
function ok(nombre, cond, detalle) {
  pruebas++;
  if (cond) { console.log("  ✓ " + nombre); return; }
  fallos++;
  console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : ""));
}

console.log("\n=== El catálogo ===");
const t = C.tipo("errores");
ok("«Tus propios errores» está en el catálogo, marcado como propio", !!t && t.propio === true);
ok("con sus dos niveles", t && t.niveles.map((n) => n.n).join() === "1,2");

console.log("\n=== detectar() ===");
{
  // Blancas: 0 → (blancas juegan) −300: regaló.
  const r = E.detectar([0, -300, -300], "w", "w");
  ok("blancas: de 0 a −3 es «regalaste»", r.length === 1 && r[0].ply === 0 && r[0].nivel === 1 && r[0].perdida === 300, JSON.stringify(r));
  // La jugada del rival no cuenta.
  ok("la jugada del rival no cuenta", E.detectar([0, 0, 400], "w", "w").length === 0);
  // Negras: la evaluación viene desde las blancas.
  const n = E.detectar([0, 0, 300], "b", "w");
  ok("negras: de 0 a +3 blanco es «regalaste» de las negras", n.length === 1 && n[0].ply === 1 && n[0].nivel === 1 && n[0].antes === 0 && n[0].despues === -300, JSON.stringify(n));
  // Posición de inicio con las negras al turno.
  const b0 = E.detectar([0, 300, 300], "b", "b");
  ok("con las negras al turno al empezar, la primera jugada es suya", b0.length === 1 && b0[0].ply === 0, JSON.stringify(b0));
  // Ganaba y se escapó.
  const g = E.detectar([500, 100, 100], "w", "w");
  ok("de +5 a +1 es «se te escapó»", g.length === 1 && g[0].nivel === 2, JSON.stringify(g));
  ok("de +6 a +3 no: sigue ganando", E.detectar([600, 300, 300], "w", "w").length === 0);
  ok("perder 1,5 no alcanza", E.detectar([0, -150, -150], "w", "w").length === 0);
  ok("lo que ya estaba perdido no cuenta (de −3 a −6)", E.detectar([-300, -600, -600], "w", "w").length === 0);
  ok("un mate cuenta como ±10: de 0 a recibir mate es «regalaste» con pérdida 10", (() => { const x = E.detectar([0, -10000, -10000], "w", "w"); return x.length === 1 && x[0].perdida === 1000; })());
  ok("sin evaluación (null) no se juzga", E.detectar([0, null, -500], "w", "w").length === 0);
  const muchos = E.detectar([0, -300, -300, -300, 0, 0, 0, -500, -500, -500, 0, 0, 0, -250], "w", "w");
  ok("de cada partida, los 3 más grandes, en orden de jugada", muchos.length === 3 && muchos.map((x) => x.ply).join() === "0,6,12", JSON.stringify(muchos.map((x) => [x.ply, x.perdida])));
}

console.log("\n=== ejercicio() ===");
{
  const partida = { clave: "juego:abc", origen: "juego", color: "w", fecha: "2026-09-20T15:00:00Z" };
  const err = { ply: 4, antes: 0, despues: -300, perdida: 300, nivel: 1 };
  const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
  const ops = [{ san: "Bb5", eval: 0.3 }, { san: "Bc4", eval: 0.1 }, { san: "d4", eval: -0.5 }, { san: "Nxe5", eval: -2.8 }];
  const x = E.ejercicio(partida, err, fen, "Nxe5", ops);
  ok("arma el ejercicio", !!x && x.id === "juego-abc-4" && x.nivel === 1 && x.fen === fen && x.jugada === "Nxe5");
  ok("las buenas: a menos de 0,5 de la mejor", x && x.buenas.join() === "Bb5,Bc4" && x.mejor === "Bb5", x && x.buenas.join());
  ok("antes es lo que daba la mejor, desde el lado del alumno", x && x.antes === 30 && x.despues === -300);
  ok("no guarda el nombre del rival", x && !JSON.stringify(x).match(/white|black|rival|nombre/i));
  ok("si la honda pone la jugada de la partida entre las buenas, no hay ejercicio",
    E.ejercicio(partida, err, fen, "Bc4", ops) === null);
  ok("si la mejor no deja 2 peones por encima, tampoco",
    E.ejercicio(partida, err, fen, "Nxe5", [{ san: "Bb5", eval: -1.5 }, { san: "Nxe5", eval: -2.8 }]) === null);
  const neg = E.ejercicio({ clave: "practica:p1", origen: "practica", color: "b", fecha: "2026-09-21T15:00:00Z" },
    { ply: 1, antes: 0, despues: -300, perdida: 300, nivel: 1 }, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "f6",
    [{ san: "e5", eval: -0.2 }, { san: "c5", eval: 0.1 }, { san: "f6", eval: 3 }]);
  ok("con las negras, las evaluaciones se dan vuelta", !!neg && neg.buenas.join() === "e5,c5" && neg.antes === 20, JSON.stringify(neg));
  ok("y el rótulo dice que es de la práctica en clase", !!neg && /^Práctica en clase/.test(neg.resumen));
  ok("jaque y mate se comparan sin «+» ni «#»", (() => { const y = E.ejercicio(partida, err, fen, "Nxe5+", [{ san: "Bb5+", eval: 0.3 }, { san: "Nxe5", eval: -3 }]); return y && y.buenas.join() === "Bb5" && y.jugada === "Nxe5"; })());
}

console.log("\n=== posiciones() ===");
{
  const bien = E.posiciones(Chess, { fenInicial: null, jugadas: ["e4", "e5", "Nf3"] });
  ok("una partida normal da una posición más que jugadas", Array.isArray(bien) && bien.length === 4);
  ok("una que empezó «desde el tablero» no se puede reproducir: null", E.posiciones(Chess, { fenInicial: null, jugadas: ["e4", "e5", "Qh5", "Kf7"] }) === null);
  const desde = E.posiciones(Chess, { fenInicial: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", jugadas: ["e4", "Kd7"] });
  ok("la de la práctica arranca de su posición", Array.isArray(desde) && desde.length === 3);
}

console.log("\n=== acierta() ===");
{
  const item = { fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3", buenas: ["Bb5", "Bc4"], jugada: "Nxe5" };
  ok("cualquier buena cuenta", E.acierta(Chess, item, "Bc4").ok && E.acierta(Chess, item, "Bb5").ok);
  const p = E.acierta(Chess, item, "Nxe5");
  ok("la de la partida no, y se reconoce", !p.ok && p.esLaDeLaPartida);
  ok("una ilegal no es legal", !E.acierta(Chess, item, "Ke3").legal);
}

console.log("\n=== temaDelError() y temasDe() ===");
{
  const T = require("../js/preparacion-tactica.js");
  ok("regaló (Tc1) y el rival lo castiga con una horquilla (Ce2+)", E.temaDelError(T, Chess, 1, "4k3/8/8/8/5n2/8/8/R5K1 w - - 0 1", null, "Rc1", "Ne2+") === "horquilla");
  ok("se le escapó una horquilla (Cc7+): el tema es la mejor que no vio", E.temaDelError(T, Chess, 2, "r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1", "Nc7+") === "horquilla");
  ok("el mate se reconoce aunque el motor mande la jugada sin «#»", E.temaDelError(T, Chess, 2, "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", "Ra8") === "mate");
  ok("una jugada que no es legal no inventa tema", E.temaDelError(T, Chess, 1, "4k3/8/8/8/5n2/8/8/R5K1 w - - 0 1", null, "Rc9", "Ne2+") === null);
  ok("sin el reconocedor, sin tema", E.temaDelError(null, Chess, 2, "r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1", "Nc7+") === null);
  const x = E.ejercicio({ clave: "juego:t", origen: "juego", color: "w", fecha: "2026-09-20T15:00:00Z" }, { ply: 4, antes: 0, despues: -300, perdida: 300, nivel: 1 },
    "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3", "Nxe5", [{ san: "Bb5", eval: 0.3 }, { san: "Nxe5", eval: -3 }], "otra");
  ok("«otra» no se guarda como tema", x && x.tema === null);
  const t = E.temasDe([{ tema: "clavada" }, { tema: "horquilla" }, { tema: "clavada" }, { tema: null }, { tema: "inventado" }], T.TEMAS);
  ok("temasDe cuenta, ordena y trae el tema para practicar", t.map((y) => y.tema + ":" + y.n).join() === "clavada:2,horquilla:1" && t[0].practica === "pin" && t[0].plural === "clavadas", JSON.stringify(t));
}

console.log("\n=== deFilas() (lo que lee Informes) ===");
{
  const bueno = (id, fecha, extra) => Object.assign({ id, nivel: 1, fen: "8/8/8/8/8/8/8/K6k w - - 0 1", jugada: "Nxf7", buenas: ["Bxf7+"], antes: 13, despues: -455, fecha }, extra || {});
  const ej = {
    a: bueno("a", "2026-09-01"), b: bueno("b", "2026-09-03", { nivel: 2 }),
    html: bueno("html", "2026-09-05", { jugada: "<img src=x onerror=alert(1)>" }),
    nivel: bueno("nivel", "2026-09-05", { nivel: 7 }),
    buena: bueno("buena", "2026-09-05", { buenas: ["<b>"] }),
    num: bueno("num", "2026-09-05", { antes: "13" }),
  };
  const r = E.deFilas([
    { key: "errores_propios_v1", value: { raw: JSON.stringify(ej) } },
    { key: "errores_analizadas_v1", value: { raw: JSON.stringify({ "juego:1": "x", "juego:2": "x" }) } },
    { key: "tipos_estrellas_v1", value: { raw: JSON.stringify({ "errores:a": 2, "errores:html": 3, "detective:q": 3, "errores:b": 0 }) } },
  ]);
  ok("solo los que tienen forma de ejercicio, del más reciente al más viejo", r.ejercicios.map((x) => x.id).join() === "b,a", r.ejercicios.map((x) => x.id).join());
  ok("cuenta las partidas revisadas", r.revisadas === 2);
  ok("las estrellas, solo de sus ejercicios y con una o más", JSON.stringify(r.resueltos) === JSON.stringify({ a: 2 }), JSON.stringify(r.resueltos));
  const roto = E.deFilas([{ key: "errores_propios_v1", value: { raw: "{no es json" } }, { key: "errores_analizadas_v1", value: null }]);
  ok("un JSON roto o una fila vacía no rompen nada", roto.ejercicios.length === 0 && roto.revisadas === 0);
  ok("sin filas, vacío", E.deFilas([]).ejercicios.length === 0 && E.deFilas(null).revisadas === 0);
  const conTema = E.deFilas([{ key: "errores_propios_v1", value: { raw: JSON.stringify({ a: bueno("a", "1", { tema: "clavada" }), b: bueno("b", "2", { tema: "<script>" }) }) } }]);
  ok("el tema se lee, y uno que no tiene forma de tema se descarta", conTema.ejercicios.map((x) => x.id + ":" + x.tema).join() === "b:null,a:clavada", conTema.ejercicios.map((x) => x.id + ":" + x.tema).join());
}

console.log("\n=== leerJugadas(): una partida de torneo copiada de la planilla ===");
{
  const L = (t) => E.leerJugadas(Chess, t);
  const ESPERADO = ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7", "Re1", "b5", "Bb3", "d6", "c3", "O-O"];
  const es = L("1. e4 e5 2. Cf3 Cc6 3. Ab5 a6 4. Aa4 Cf6 5. 0-0 Ae7 6. Te1 b5 7. Ab3 d6 8. c3 0-0 1/2-1/2");
  ok("en español (R D T A C, enroque con ceros) sale en SAN inglesa", es.notacion === "es" && JSON.stringify(es.jugadas) === JSON.stringify(ESPERADO), JSON.stringify(es));
  const en = L("1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Be7 6.Re1 b5 7.Bb3 d6 8.c3 O-O");
  ok("en inglés y sin espacio después del número", en.notacion === "en" && JSON.stringify(en.jugadas) === JSON.stringify(ESPERADO), JSON.stringify(en));
  const sinNumeros = L("e4 e5 Cf3 Cc6 Ab5 a6 Aa4 Cf6 O-O Ae7 Te1 b5 Ab3 d6 c3 O-O");
  ok("sin números de jugada", JSON.stringify(sinNumeros.jugadas) === JSON.stringify(ESPERADO), JSON.stringify(sinNumeros));
  const sueltos = L("1 e4 e5 2 Cf3 Cc6 3 Ab5 a6 4 Aa4 Cf6 5 O-O Ae7 6 Te1 b5 7 Ab3 d6 8 c3 O-O");
  ok("con los números sin punto", JSON.stringify(sueltos.jugadas) === JSON.stringify(ESPERADO), JSON.stringify(sueltos));
  const pgn = L('[Event "Abierto"]\n[White "Alguien"]\n\n1. e4 {la de siempre} e5 2. Nf3 Nc6 (2... d6 3. d4 (3. Bc4)) 3. Bb5 $1 a6!? 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 1-0');
  ok("un PGN: sin etiquetas, comentarios, variantes (una dentro de otra), NAG ni resultado", JSON.stringify(pgn.jugadas) === JSON.stringify(ESPERADO), JSON.stringify(pgn));
  const negras = L("1. e4 e5 2. Cf3 Cc6 3. Ab5 a6 4. Aa4 Cf6 5. 0-0 Ae7 6. Te1 b5 7. Ab3 d6 8. c3 0-0 9. h3 Ca5 10. Ac2 c5 11. d4 Dc7 12. Cbd2 cxd4 13. cxd4 Ab7 14. d5 Tac8");
  ok("los «...» y la dama (D) y torre (T) de las negras", negras.jugadas && negras.jugadas.slice(-4).join() === "cxd4,Bb7,d5,Rac8" && negras.jugadas[21] === "Qc7", JSON.stringify(negras.jugadas));
  const corona = L("1. a4 b5 2. axb5 a6 3. bxa6 Ab7 4. axb7 Cc6 5. bxa8=D Dc8");
  ok("la coronación en español (=D) es a dama", corona.jugadas && corona.jugadas[8] === "bxa8=Q", JSON.stringify(corona));
  const corona2 = L("1. a4 b5 2. axb5 a6 3. bxa6 Bb7 4. axb7 Nc6 5. bxa8Q Qc8");
  ok("y sin el «=», en inglés", corona2.jugadas && corona2.jugadas[8] === "bxa8=Q", JSON.stringify(corona2));
  const mal = L("1. e4 e5 2. Cf3 Cc6 3. Ab5 a6 4. Axc6 dxc6 5. Cxe5 Dd4 6. Cxf7 Dxe4+ 7. De2 Rxf7");
  ok("una partida legal en español con R = rey", mal.jugadas && mal.jugadas[13] === "Kxf7", JSON.stringify(mal));
  const ilegal = L("1. e4 e5 2. Cf3 Cc6 3. Ab5 a6 4. Ab5");
  ok("una jugada que no es legal: su número, el color y lo que se escribió", ilegal.error && ilegal.error.numero === 4 && ilegal.error.color === "w" && ilegal.error.jugada === "Ab5", JSON.stringify(ilegal));
  const ilegalN = L("1. e4 e5 2. Cf3 Cc6 3. Ab5 Cd5");
  ok("y de las negras", ilegalN.error && ilegalN.error.numero === 3 && ilegalN.error.color === "b" && ilegalN.error.jugada === "Cd5", JSON.stringify(ilegalN));
  ok("vacía, o solo números y resultado: «vacía»", L("").error.vacia === true && L("1. 2. 1-0").error.vacia === true);
  ok("nada que sea HTML pasa como jugada", !!L("1. e4 <img src=x> 2. Cf3").error);
}

console.log("\n=== compararConPlan() / textoPreparacion(): la partida contra lo preparado ===");
{
  const plan = [{ san: "e4", quien: "tu", hijos: [
    { san: "e5", quien: "rival", hijos: [{ san: "Nf3", quien: "tu", hijos: [{ san: "Nc6", quien: "rival", hijos: [] }, { san: "d6", quien: "rival", hijos: [] }] }] },
    { san: "c5", quien: "rival", hijos: [] }] }];
  const es = (x) => x.replace(/^N/, "C").replace(/^B/, "A");
  const c1 = E.compararConPlan(plan, ["e4", "e5", "Bc4", "Nc6"]);
  ok("se salió él (el alumno): dónde, qué jugó y qué decía el plan", JSON.stringify(c1) === JSON.stringify({ hasta: 2, salio: "tu", jugada: "Bc4", ultima: "e5", esperadas: ["Nf3"] }), JSON.stringify(c1));
  ok("…en palabras", E.textoPreparacion(Object.assign({ origen: "propio", rival: "PedroP" }, c1), true, es) === "La partida siguió tu preparación contra PedroP hasta 1…e5; ahí jugaste 2.Ac4 (el plan decía 2.Cf3).", E.textoPreparacion(Object.assign({ origen: "propio", rival: "PedroP" }, c1), true, es));
  const c2 = E.compararConPlan(plan, ["e4", "e5", "Nf3", "Nf6+"]);
  ok("se salió el rival, con todas las que el plan esperaba", c2.salio === "rival" && c2.hasta === 3 && c2.esperadas.join() === "Nc6,d6");
  ok("…y dicho de otra persona (el profe mirando)", E.textoPreparacion(Object.assign({ origen: "profe", rival: "PedroP" }, c2), false, es) === "La partida siguió el plan de su profe contra PedroP hasta 2.Cf3; ahí su rival jugó 2…Cf6+, que el plan no esperaba (el plan decía 2…Cc6 o 2…d6).");
  ok("el «+» no cuenta para seguir el plan", E.compararConPlan(plan, ["e4+", "e5", "Nf3", "Nc6", "a3"]).salio === "fin");
  ok("se acabó el plan: «hasta el final del plan»", E.textoPreparacion(Object.assign({ origen: "propio" }, E.compararConPlan(plan, ["e4", "c5", "Nf3"])), true) === "Seguiste tu preparación hasta el final del plan.");
  ok("se salió en la primera jugada", E.textoPreparacion(Object.assign({ origen: "propio" }, E.compararConPlan(plan, ["d4"])), true) === "Desde la primera jugada te saliste de tu preparación: jugaste 1.d4 (el plan decía 1.e4).");
  ok("un plan vacío no compara nada", E.compararConPlan([], ["e4"]) === null);
  ok("lo guardado que no tiene forma no se escribe (una «jugada» que es HTML)", E.textoPreparacion({ origen: "propio", hasta: 2, salio: "tu", jugada: "<img src=x>", esperadas: [] }, true) === "");
}

console.log("\n=== deLaWeb(): las partidas de Lichess y Chess.com ===");
{
  /* El PGN como lo manda cada sitio, leído con el MISMO lector de la
     preparación de rivales. Se quedan solo las de ajedrez normal desde la
     inicial en que jugó el usuario (sin distinguir mayúsculas). */
  const A = require("../js/preparacion-analisis.js");
  const partida = (et, cuerpo) => Object.entries(et).map(([k, v]) => "[" + k + ' "' + v + '"]').join("\n") + "\n\n" + cuerpo + "\n";
  const JUEGO = "1. e4 { [%clk 0:03:00] } e5 { [%clk 0:03:00] } 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 0-1";
  const pgnLichess = [
    partida({ Event: "Rated blitz", Site: "https://lichess.org/AbCd1234", UTCDate: "2026.09.20", UTCTime: "15:00:00", White: "PepeRojas", Black: "otro", Variant: "Standard" }, JUEGO),
    partida({ Event: "Rated blitz", Site: "https://lichess.org/Nuev0000", UTCDate: "2026.09.25", UTCTime: "08:30:00", White: "otro", Black: "peperojas", Variant: "Standard" }, JUEGO),
    partida({ Event: "960", Site: "https://lichess.org/Chs96000", UTCDate: "2026.09.26", White: "PepeRojas", Black: "otro", Variant: "Chess960" }, JUEGO),
    partida({ Event: "Desde posición", Site: "https://lichess.org/Posi0000", UTCDate: "2026.09.26", White: "PepeRojas", Black: "otro", Variant: "From Position", SetUp: "1", FEN: "8/8/8/8/8/8/8/K6k w - - 0 1" }, "1. Kb1 1/2-1/2"),
    partida({ Event: "Ajena", Site: "https://lichess.org/Ajen0000", UTCDate: "2026.09.27", White: "alguien", Black: "otro", Variant: "Standard" }, JUEGO),
    partida({ Event: "Enlace raro", Site: "https://evil.example/AbCd1234", UTCDate: "2026.09.27", White: "PepeRojas", Black: "otro" }, JUEGO),
    partida({ Event: "Repetida", Site: "https://lichess.org/AbCd1234", UTCDate: "2026.09.20", UTCTime: "15:00:00", White: "PepeRojas", Black: "otro", Variant: "Standard" }, JUEGO),
  ].join("\n");
  const L = E.deLaWeb(A.leerPgn(pgnLichess), "lichess", "@peperojas");
  ok("Lichess: solo las suyas, estándar y desde la inicial, sin repetir, la más nueva primero",
    L.map((p) => p.clave + ":" + p.color).join() === "lichess:Nuev0000:b,lichess:AbCd1234:w", L.map((p) => p.clave + ":" + p.color).join());
  ok("con las jugadas limpias (sin relojes ni «+») y la fecha del sitio",
    L[1] && L[1].jugadas.length === 12 && L[1].jugadas[11] === "Qxe4" && L[1].fecha === "2026-09-20T15:00:00Z" && L[1].origen === "lichess" && L[1].fenInicial === null, JSON.stringify(L[1]));
  const pgnCom = [
    partida({ Event: "Live Chess", Site: "Chess.com", Date: "2026.09.21", White: "PepeRojas", Black: "x", Link: "https://www.chess.com/game/live/123456789", UTCDate: "2026.09.21", UTCTime: "20:10:05" }, JUEGO),
    partida({ Event: "Daily", Site: "Chess.com", Date: "2026.09.22", White: "y", Black: "PEPEROJAS", Link: "https://www.chess.com/game/daily/555", UTCDate: "2026.09.22", UTCTime: "01:00:00" }, JUEGO),
    partida({ Event: "960", Site: "Chess.com", Date: "2026.09.23", White: "PepeRojas", Black: "x", Link: "https://www.chess.com/game/live/777", Variant: "Chess960", UTCDate: "2026.09.23" }, JUEGO),
  ].join("\n");
  const Cc = E.deLaWeb(A.leerPgn(pgnCom), "chesscom", "PepeRojas");
  ok("Chess.com: el id sale del Link (live y daily), sin Chess960", Cc.map((p) => p.clave + ":" + p.color).join() === "chesscom:555:b,chesscom:123456789:w", Cc.map((p) => p.clave + ":" + p.color).join());
  ok("un sitio que no es ninguno de los dos, o sin usuario, no da nada", E.deLaWeb(A.leerPgn(pgnLichess), "otro", "PepeRojas").length === 0 && E.deLaWeb(A.leerPgn(pgnLichess), "lichess", "").length === 0);
  ok("el ejercicio dice de dónde salió la partida", /^Partida de Lichess del /.test(E.ejercicio(L[1], { ply: 6, nivel: 1, despues: -300 }, "fen", "Nxe5", [{ san: "c3", eval: 0.2 }]).resumen)
    && /^Partida de Chess\.com del /.test(E.ejercicio(Cc[1], { ply: 6, nivel: 1, despues: -300 }, "fen", "Nxe5", [{ san: "c3", eval: 0.2 }]).resumen));
  ok("y su id no choca con las de Juegos", E.ejercicio(L[1], { ply: 6, nivel: 1, despues: -300 }, "fen", "Nxe5", [{ san: "c3", eval: 0.2 }]).id === "lichess-AbCd1234-6");
}

console.log("\n=== La apertura: lineaDeApertura() con el banco de Aperturas ===");
{
  const AP = require("../js/aperturas-lineas.js");
  const fenTras = (jugadas) => { const g = new Chess(); jugadas.forEach((m) => g.move(m)); return g.fen(); };
  const blackburne = fenTras(["e4", "e5", "Nf3", "Nc6", "Bc4", "Nd4"]);
  const r1 = E.lineaDeApertura(Chess, { fen: blackburne, jugada: "Nxe5", buenas: ["c3", "O-O"] }, AP.LINEAS);
  ok("con blancas, comer en e5 tras Cd4 es caer en la celada Blackburne (línea del otro color)", r1 && r1.caso === "celada" && r1.linea.id === "blackburne", JSON.stringify(r1 && [r1.caso, r1.linea.id]));
  ok("si no jugó la jugada que la celada espera, no «cayó»", !E.lineaDeApertura(Chess, { fen: blackburne, jugada: "d3", buenas: ["c3"] }, AP.LINEAS));
  const pastor = fenTras(["e4", "e5", "Bc4", "Nc6", "Qh5"]);
  const r0 = E.lineaDeApertura(Chess, { fen: pastor, jugada: "Nf6", buenas: ["g6", "Qe7"] }, AP.LINEAS);
  ok("con negras, Cf6 frente a Dh5 es caer en el mate del pastor", r0 && r0.caso === "celada" && r0.linea.id === "pastor-mate", JSON.stringify(r0 && [r0.caso, r0.linea.id]));
  const r2 = E.lineaDeApertura(Chess, { fen: pastor, jugada: "d6", buenas: ["g6", "Qe7"] }, AP.LINEAS);
  ok("con negras frente a Dh5: la teoría de su color, con la jugada de la línea si es de las buenas", r2 && r2.caso === "teoria" && r2.linea.id === "pastor-refutacion" && r2.jugada === "g6" && r2.buena === true, JSON.stringify(r2 && [r2.caso, r2.linea.id, r2.jugada, r2.buena]));
  const r3 = E.lineaDeApertura(Chess, { fen: pastor, jugada: "d6", buenas: ["Qe7"] }, AP.LINEAS);
  ok("y si la jugada de la línea no está entre las buenas del motor, no se la ofrece como respuesta", r3 && r3.caso === "teoria" && r3.buena === false, JSON.stringify(r3 && [r3.caso, r3.buena]));
  ok("se reconoce por la posición, aunque se llegue en otro orden", !!E.lineaDeApertura(Chess, { fen: fenTras(["e4", "Nc6", "Bc4", "e5", "Qh5"]), jugada: "Nf6", buenas: ["g6"] }, AP.LINEAS));
  ok("una posición que no está en ninguna línea no da nada", E.lineaDeApertura(Chess, { fen: fenTras(["a3", "h6", "h3", "a6"]), jugada: "b3", buenas: ["e4"] }, AP.LINEAS) === null);
  ok("enLaApertura: hasta la jugada 10, sí; en la 11, no", E.enLaApertura("8/8/8/8/8/8/8/K6k w - - 0 10") && !E.enLaApertura("8/8/8/8/8/8/8/K6k w - - 0 11") && !E.enLaApertura("sin fen"));
  ok("después de la jugada 10 no se busca línea", E.lineaDeApertura(Chess, { fen: blackburne.replace(/ \d+$/, " 11"), jugada: "Nxe5", buenas: ["c3"] }, AP.LINEAS) === null);
}

console.log("\n=== El final: finalDelError() y finalDelBanco() ===");
{
  const P = require("../js/preparacion-posiciones.js");
  const F = require("../entreno/data/finales.json").finales;
  // Posiciones del banco de Finales, con el número de jugada de una partida.
  const deBanco = (id, jugada) => F.find((f) => f.id === id).fen.replace(/ \d+$/, " " + jugada);
  const r = E.finalDelError(P, deBanco("philidor", 45));
  ok("un error con torre contra torre es de un final de torres", r && r.tipo === "de torres" && r.grupo === "de torres", JSON.stringify(r));
  ok("los de alfiles del mismo o distinto color van juntos", E.finalDelError(P, deBanco("distinto-color", 50)).grupo === "de alfiles");
  ok("con mucho material no es un final", E.finalDelError(P, "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 13") === null);
  ok("y en la apertura no se cuenta como final", E.finalDelError(P, deBanco("philidor", 8)) === null);
  const torres = F.filter((f) => E.finalDelError(P, f.fen.replace(/ \d+$/, " 40")) && E.finalDelError(P, f.fen.replace(/ \d+$/, " 40")).grupo === "de torres").map((f) => f.id);
  ok("finalDelBanco: el primero del grupo que todavía no logró", E.finalDelBanco(P, F, "de torres", { [torres[0]]: true }) === torres[1], torres.join());
  ok("si ya los logró todos, el primero", E.finalDelBanco(P, F, "de torres", Object.fromEntries(torres.map((t) => [t, true]))) === torres[0]);
  ok("un grupo que el banco no tiene da null", E.finalDelBanco(P, F, "con dama y otras piezas", {}) === null);
}

console.log("\n=== El reloj: apurado() y lo que guarda el ejercicio ===");
{
  ok("con menos de 30 segundos, apurado", E.apurado({ reloj: 29, base: 600 }) && !E.apurado({ reloj: 30, base: 300 }));
  ok("con menos del 10 % de lo que tenía, apurado aunque sean más de 30", E.apurado({ reloj: 50, base: 600 }) && !E.apurado({ reloj: 61, base: 600 }));
  ok("sin reloj o sin ritmo, nunca", !E.apurado({ reloj: 5 }) && !E.apurado({}) && !E.apurado(null));
  const A = require("../js/preparacion-analisis.js");
  const pgn = '[Event "x"]\n[Site "https://lichess.org/Reloj000"]\n[UTCDate "2026.09.20"]\n[UTCTime "10:00:00"]\n[White "yo"]\n[Black "otro"]\n[TimeControl "180+2"]\n\n' +
    "1. e4 { [%clk 0:03:00] } e5 { [%clk 0:03:00] } 2. Nf3 { [%clk 0:02:55] } Nc6 { [%clk 0:02:50] } 3. Bc4 { [%clk 0:02:40] } Nd4 { [%clk 0:02:30] } 4. Nxe5 { [%clk 0:00:12] } 1-0\n";
  const w = E.deLaWeb(A.leerPgn(pgn), "lichess", "yo")[0];
  ok("deLaWeb guarda los relojes y el ritmo", w && w.relojes && w.relojes[6] === 12 && w.control && w.control.base === 180 && w.control.inc === 2, JSON.stringify(w && [w.relojes, w.control]));
  const x = E.ejercicio(w, { ply: 6, nivel: 1, despues: -300 }, "fen", "Nxe5", [{ san: "c3", eval: 0.2 }]);
  ok("el ejercicio lleva con cuánto tiempo se jugó el error", x.reloj === 12 && x.base === 180 && E.apurado(x), JSON.stringify([x.reloj, x.base]));
  const sin = E.ejercicio({ clave: "juego:1", origen: "juego", color: "w", fecha: "2026-09-20T10:00:00Z" }, { ply: 6, nivel: 1, despues: -300 }, "fen", "Nxe5", [{ san: "c3", eval: 0.2 }]);
  ok("y el de una partida sin reloj, no", !("reloj" in sin));
}

console.log("\n=== La curva: curva() y tendencia() ===");
{
  const v = {
    a: { r: "x", f: "2026-07-05T15:00:00Z", e1: 2, e2: 1 }, b: { r: "x", f: "2026-07-20T15:00:00Z", e1: 3, e2: 0 },
    c: { r: "x", f: "2026-08-02T15:00:00Z", e1: 1, e2: 1 },
    d: { r: "x", f: "2026-09-01T03:00:00Z", e1: 0, e2: 0 },   // 31 de agosto en Costa Rica
    e: { r: "x", f: "2026-09-10T15:00:00Z", e1: 1, e2: 0 }, f: { r: "x", f: "2026-09-12T15:00:00Z", e1: 0, e2: 0 }, g: { r: "x", f: "2026-09-20T15:00:00Z", e1: 0, e2: 1 },
    vieja: "2026-09-21T10:00:00Z", sinCuenta: { r: "x", f: "2026-09-22T10:00:00Z" }, rara: { r: "x", f: "2026-09-22T10:00:00Z", e1: -1, e2: 0 },
  };
  const c = E.curva(v);
  ok("por mes de la partida en hora de Costa Rica; las viejas y las raras no cuentan",
    c.map((m) => m.mes + ":" + m.partidas + ":" + m.regalados + "+" + m.escapados).join() === "2026-07:2:5+1,2026-08:2:1+1,2026-09:3:1+1", c.map((m) => m.mes + ":" + m.partidas + ":" + m.regalados + "+" + m.escapados).join());
  ok("y los errores por partida", c[0].porPartida === 3 && Math.abs(c[2].porPartida - 2 / 3) < 1e-9);
  const t = E.tendencia(c);
  ok("tendencia: el último mes contra el promedio de los anteriores", t && t.sentido === "mejor" && t.antes === 2 && Math.abs(t.ahora - 2 / 3) < 1e-9, JSON.stringify(t));
  ok("con pocas partidas en el último mes no se dice nada", E.tendencia(E.curva({ a: v.a, b: v.b, e: v.e })) === null);
  ok("peor, si subió", E.tendencia([{ partidas: 3, regalados: 1, escapados: 0, porPartida: 1 / 3 }, { partidas: 3, regalados: 5, escapados: 1, porPartida: 2 }]).sentido === "peor");
  ok("se queda con los últimos 6 meses", E.curva(Object.fromEntries(Array.from({ length: 9 }, (_, i) => ["k" + i, { f: "2026-0" + (i + 1) + "-15T12:00:00Z", e1: 1, e2: 0 }]))).length === 6);
  const r = E.deFilas([{ key: "errores_analizadas_v1", value: { raw: JSON.stringify(v) } }]);
  ok("Informes: deFilas trae la curva y sigue contando todas las revisadas", r.curva.length === 3 && r.revisadas === 10, JSON.stringify([r.curva.length, r.revisadas]));
}

console.log("\n=== La celada, guardada en el ejercicio ===");
{
  global.Chess = Chess;
  const AP = require("../js/aperturas-lineas.js");
  const g = new Chess(); ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nd4"].forEach((m) => g.move(m));
  const x = E.conCelada({ id: "a", fen: g.fen(), jugada: "Nxe5", buenas: ["c3"] }, AP.LINEAS);
  ok("conCelada anota el id de la línea", x.celada === "blackburne");
  const y = E.conCelada({ id: "b", fen: g.fen(), jugada: "d3", buenas: ["c3"] }, AP.LINEAS);
  ok("y null si no fue una celada (la clave queda: ya se miró)", "celada" in y && y.celada === null);
  ok("uno ya mirado no se vuelve a mirar", E.conCelada({ id: "c", fen: g.fen(), jugada: "Nxe5", buenas: ["c3"], celada: null }, AP.LINEAS).celada === null);
  const bien = (id, extra) => Object.assign({ id, fen: g.fen(), nivel: 1, jugada: "Nxe5", buenas: ["c3"], antes: 20, despues: -300, fecha: "2026-09-0" + id.length + "T00:00:00Z" }, extra);
  const r = E.deFilas([{ key: "errores_propios_v1", value: { raw: JSON.stringify({ a: bien("a", { celada: "blackburne", reloj: 12, base: 180 }), bb: bien("bb", { celada: "<img>", reloj: "x", base: 180 }) }) } }]);
  const porId = Object.fromEntries(r.ejercicios.map((e) => [e.id, e]));
  ok("deFilas: la celada y el reloj se leen, y lo que no tiene forma se descarta", porId.a.celada === "blackburne" && porId.a.reloj === 12 && porId.bb.celada === null && porId.bb.reloj === undefined, JSON.stringify(r.ejercicios.map((e) => [e.id, e.celada, e.reloj])));
}

console.log(fallos ? "\n✗ " + fallos + " de " + pruebas + " comprobaciones fallaron." : "\n✓ Las " + pruebas + " comprobaciones pasaron.");
process.exit(fallos ? 1 : 0);
