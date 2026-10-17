/* Comprueba la medición de la prueba de estilo (js/estilo-perfil.js), la
 * recomendación (js/estilo-aperturas.js) y el estilo en las partidas
 * (js/estilo-partidas.js). Sin navegador ni motor.
 *
 * Lo que se rompe callado acá es que el resultado diga más de lo que sabe:
 *
 *  1. LAS ETIQUETAS. Quien elige siempre lo mismo sale «claramente»; quien
 *     elige al azar sale «claramente» en menos del 5 % de los ejes (el margen
 *     es del 95 %: 9 de 10 al azar pasa), y menos todavía si falla los
 *     controles.
 *  2. LOS PESOS. Las mismas elecciones con «me da igual» dejan un margen más
 *     ancho que con «muy seguro»; tardar 2 minutos pesa menos que 10 segundos;
 *     un control que no coincide ensancha los tres márgenes; un control no
 *     suma como respuesta.
 *  3. LAS PARTIDAS. 200 momentos de las partidas no dan vuelta 10
 *     respuestas: corrigen la prueba, no la reemplazan.
 *  4. LA CALIBRACIÓN. Una posición que tira hacia un polo (`b`) le resta a
 *     quien la eligió en ese sentido.
 *  5. LA PRUEBA ADAPTATIVA. Un estilo claro termina en 32 posiciones (30 y los
 *     dos controles); al azar puede seguir, pero nunca pasa de 47 ni repite
 *     una posición; y nunca pasa de las 60 respuestas que acepta la base.
 *  6. EL ESPEJO. Cada una de las 45 posiciones dada vuelta es legal, sus dos
 *     jugadas también, y medidas con estilo-medidas.js dan el MISMO polo.
 *  7. LA RECOMENDACIÓN. Cada apertura que propone es una línea medida de
 *     Aperturas y celadas del grupo que corresponde; a quien ataca le propone
 *     aperturas que atacan más que las que le propone a quien maniobra; la que
 *     ya juega se mantiene si queda casi igual de bien; y a quien empieza no
 *     le propone teoría de nivel 3 si hay otra.
 *  8. LAS PARTIDAS DEL ALUMNO. Un momento cuenta solo si su jugada estaba
 *     entre las buenas; el seguimiento separa antes y después de la fecha y
 *     solo cuenta las partidas que pasan por la apertura recomendada.
 *
 * Uso:  npm install && node herramientas/verificar-estilo-perfil.js
 */
"use strict";
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const { Chess } = require(path.join(RAIZ, "node_modules", "chess.js"));
global.Chess = Chess;
const M = require("../js/estilo-medidas.js");
const B = require("../js/estilo-items.js");
const P = require("../js/estilo-perfil.js");
const A = require("../js/estilo-aperturas.js");
const EP = require("../js/estilo-partidas.js");
const { LINEAS } = require("../js/aperturas-lineas.js");

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) { console.log("  ✓ " + nombre); return; }
  fallos++;
  console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : ""));
}

let semilla = 12345;
const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
const primeroDe = (eje) => M.POLOS[eje][0];
/* La elección de una persona: `quiere(eje)` → 1 (primer polo), 0 o null (al azar). */
function elegir(item, quiere) {
  const q = quiere(item.eje);
  const uno = q == null ? azar() < 0.5 : q === 1;
  return (item.a.polo === primeroDe(item.eje)) === uno ? "a" : "b";
}
function respuestas(quiere, o) {
  const op = o || {};
  const out = [];
  for (const eje of P.EJES) {
    B.ITEMS.filter((i) => i.eje === eje).slice(0, op.n || 10).forEach((it) => {
      out.push({ id: it.id, eleccion: elegir(it, quiere), seguridad: op.seguridad || 3, ms: op.ms || 8000 });
    });
  }
  return out;
}
const ancho = (x) => x.hi - x.lo;

console.log("-- 1. Las etiquetas");
{
  const pf = P.medir(respuestas(() => 1));
  ok("siempre el primer polo: «claramente» en los tres ejes", P.EJES.every((e) => pf[e].etiqueta.tipo === "claro" && pf[e].etiqueta.polo === primeroDe(e)),
    P.EJES.map((e) => pf[e].etiqueta.texto).join(" | "));
  const pf2 = P.medir(respuestas(() => 0));
  ok("siempre el segundo: «claramente» el otro polo", P.EJES.every((e) => pf2[e].etiqueta.tipo === "claro" && pf2[e].etiqueta.polo === M.POLOS[e][1]));
  let afirma = 0;
  for (let k = 0; k < 200; k++) {
    const pf3 = P.medir(respuestas(() => null));
    afirma += P.EJES.filter((e) => pf3[e].etiqueta.tipo === "claro").length;
  }
  ok("al azar, «claramente» en menos del 5 % de 600 ejes", afirma < 30, afirma + " de 600");
  // Con los dos controles fallados (lo esperable al azar) el margen se ensancha y afirma menos.
  let conControles = 0;
  for (let k = 0; k < 200; k++) {
    const r = respuestas(() => null);
    const f = (x) => ({ id: x.id, control: x.id, eleccion: x.eleccion === "a" ? "b" : "a", seguridad: 3, ms: 5000 });
    const pf4 = P.medir(r.concat([f(r[0]), f(r[12])]));
    conControles += P.EJES.filter((e) => pf4[e].etiqueta.tipo === "claro").length;
  }
  ok("y fallando los controles, menos todavía", conControles < afirma, conControles + " contra " + afirma);
  const sinNada = P.medir([]);
  ok("sin respuestas: «sin definir», con el margen ancho", P.EJES.every((e) => sinNada[e].etiqueta.tipo === "sin definir" && ancho(sinNada[e]) > 0.8));
}

console.log("-- 2. Los pesos");
{
  const quiere = (e) => (e === "ataque" ? 1 : null);
  semilla = 99;
  const seguro = P.medir(respuestas(() => 1, { seguridad: 3 }));
  const igual = P.medir(respuestas(() => 1, { seguridad: 1 }));
  ok("«me da igual» deja el margen más ancho que «muy seguro»", P.EJES.every((e) => ancho(igual[e]) > ancho(seguro[e]) + 0.05));
  const lento = P.medir(respuestas(() => 1, { ms: 120000 }));
  ok("tardar 2 minutos pesa menos que 8 segundos", P.EJES.every((e) => ancho(lento[e]) > ancho(seguro[e])));
  ok("el peso del tiempo: 1 hasta 20 s, 0,7 desde 90 s", P.pesoTiempo(5000) === 1 && P.pesoTiempo(20000) === 1 && Math.abs(P.pesoTiempo(55000) - 0.85) < 1e-9 && P.pesoTiempo(200000) === 0.7);
  const base = respuestas(quiere);
  const it0 = B.ITEMS.find((i) => i.id === base[0].id);
  const it1 = B.ITEMS.find((i) => i.id === base[12].id);
  const igualA = (r) => ({ id: r.id, control: r.id, eleccion: r.eleccion, seguridad: 3, ms: 5000 });
  const otraA = (r) => ({ id: r.id, control: r.id, eleccion: r.eleccion === "a" ? "b" : "a", seguridad: 3, ms: 5000 });
  const coinciden = P.medir(base.concat([igualA(base[0]), igualA(base[12])]));
  const noCoinciden = P.medir(base.concat([otraA(base[0]), otraA(base[12])]));
  const sinControles = P.medir(base);
  ok("los controles se cuentan", coinciden.controles.total === 2 && coinciden.controles.fallados === 0 && noCoinciden.controles.fallados === 2, JSON.stringify([coinciden.controles, noCoinciden.controles, it0.eje, it1.eje]));
  ok("un control que coincide no suma como respuesta (mismo resultado que sin él)", P.EJES.every((e) => Math.abs(coinciden[e].theta - sinControles[e].theta) < 1e-12 && coinciden[e].n === sinControles[e].n));
  ok("dos controles que no coinciden ensanchan los tres márgenes un 50 %", P.EJES.every((e) => Math.abs(noCoinciden[e].se / sinControles[e].se - 1.5) < 1e-9));
}

console.log("-- 3. Las partidas");
{
  const pf = P.medir(respuestas(() => 0));
  const muchas = Array.from({ length: 200 }, () => ({ eje: "ataque", primero: true }));
  const conPartidas = P.medir(respuestas(() => 0), muchas);
  ok("200 momentos que dicen lo contrario no dan vuelta 10 respuestas firmes", conPartidas.ataque.p < 0.5, "p = " + conPartidas.ataque.p.toFixed(2));
  ok("pero sí la mueven", conPartidas.ataque.p > pf.ataque.p + 0.05);
  ok("y se cuentan aparte", conPartidas.ataque.nPartidas === 200 && conPartidas.ataque.n === 10);
}

console.log("-- 4. La calibración");
{
  const id = B.ITEMS[0].id;
  const r = [{ id, eleccion: B.ITEMS[0].a.polo === primeroDe(B.ITEMS[0].eje) ? "a" : "b", seguridad: 3, ms: 5000 }];
  const sin = P.medir(r);
  const guardado = B.CALIBRADO[id];
  B.CALIBRADO[id] = { a: 1, b: -2, n: 99 };   // casi todos eligen el primer polo acá
  const con = P.medir(r);
  if (guardado) B.CALIBRADO[id] = guardado; else delete B.CALIBRADO[id];
  ok("elegir lo que elige casi todo el mundo dice menos", con[B.ITEMS[0].eje].p < sin[B.ITEMS[0].eje].p);
}

console.log("-- 4b. La calibración recupera lo que se le esconde");
{
  // 400 personas simuladas, con posiciones de tirón y distinción conocidos.
  const Cal = require("./estilo-calibrar.js");
  const normal = () => { const u = Math.max(1e-9, azar()), v = azar(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const verdad = {};
  B.ITEMS.forEach((it, k) => { verdad[it.id] = { a: [0.3, 1, 2][k % 3], b: -1.5 + 3 * ((k * 7) % 15) / 14 }; });
  const pruebas = [];
  for (let j = 0; j < 400; j++) {
    const t = { ataque: 1.2 * normal(), estructura: 1.2 * normal(), cambios: 1.2 * normal() };
    const respuestas = B.ITEMS.map((it) => {
      const v = verdad[it.id];
      const uno = azar() < P.sigma(v.a * (t[it.eje] - v.b));
      return { id: it.id, eleccion: (it.a.polo === primeroDe(it.eje)) === uno ? "a" : "b", seguridad: 3, ms: 5000 };
    });
    pruebas.push({ version: B.VERSION, respuestas });
  }
  const cal = Cal.calibrar(pruebas);
  const ids = B.ITEMS.map((i) => i.id);
  const corr = (xs, ys) => {
    const mx = xs.reduce((s, x) => s + x, 0) / xs.length, my = ys.reduce((s, y) => s + y, 0) / ys.length;
    let n = 0, dx = 0, dy = 0;
    xs.forEach((x, i) => { n += (x - mx) * (ys[i] - my); dx += (x - mx) ** 2; dy += (ys[i] - my) ** 2; });
    return n / Math.sqrt(dx * dy);
  };
  ok("calibra las 45 (todas con más de 30 respuestas)", ids.every((id) => cal[id] && cal[id].n === 400));
  const conA = ids.filter((id) => verdad[id].a >= 1);
  const rb = corr(conA.map((id) => verdad[id].b), conA.map((id) => cal[id].b));
  ok("recupera el tirón de las posiciones que distinguen (correlación > 0,85)", rb > 0.85, "correlación " + rb.toFixed(2));
  const media = (va) => { const l = ids.filter((id) => verdad[id].a === va).map((id) => cal[id].a); return l.reduce((s, x) => s + x, 0) / l.length; };
  ok("y distingue las que distinguen de las que no (a: 0,3 < 1 < 2)", media(0.3) < media(1) && media(1) < media(2), [0.3, 1, 2].map((v) => v + "→" + media(v).toFixed(2)).join(" "));
  const pocas = Cal.calibrar(pruebas.slice(0, 20));
  ok("con menos de 30 respuestas por posición no escribe nada", Object.keys(pocas).length === 0);
}

console.log("-- 5. La prueba adaptativa");
{
  const correr = (quiere, partidas) => {
    const pr = P.Prueba({ azar, Chess, partidas });
    const ids = [];
    let it, n = 0;
    while ((it = pr.siguiente()) && n < 100) {
      ids.push(it.id);
      pr.responder(it, { eleccion: elegir(it, quiere), seguridad: 3, ms: 6000 });
      n++;
    }
    return { n, ids, respuestas: pr.respuestas };
  };
  const claro = correr(() => 1);
  ok("un estilo claro termina en 32 posiciones", claro.n === 32, "vio " + claro.n);
  ok("con los dos controles marcados", claro.respuestas.filter((r) => r.control).length === 2);
  let max = 0, alguna = false, repite = false;
  for (let k = 0; k < 40; k++) {
    const r = correr(() => null);
    max = Math.max(max, r.n);
    if (r.n > 32) alguna = true;
    if (new Set(r.ids).size !== r.ids.length) repite = true;
  }
  ok("al azar, a veces sigue preguntando", alguna);
  ok("pero nunca pasa de 47", max <= 47, "máximo " + max);
  ok("ni repite una posición", !repite);
  ok("ni pasa de las 60 respuestas que acepta la base", max <= 60);
}

console.log("-- 6. El espejo");
{
  let malos = [];
  for (const it of B.ITEMS) {
    try {
      const e = P.espejo(it, Chess);
      const ma = M.medir(Chess, e.fen, e.a.linea), mb = M.medir(Chess, e.fen, e.b.linea);
      const polo = M.poloDe(it.eje, ma, mb, M.tipoDeJugada(Chess, e.fen, e.a.uci), M.tipoDeJugada(Chess, e.fen, e.b.uci));
      const esperado = it.a.polo === primeroDe(it.eje) ? "a" : "b";
      if (polo !== esperado) malos.push(it.id + " (polo " + polo + ")");
      if (e.fen.split(" ")[1] === it.fen.split(" ")[1]) malos.push(it.id + " (mismo turno)");
    } catch (err) { malos.push(it.id + " (" + err.message + ")"); }
  }
  ok("las 45 posiciones dadas vuelta son legales y miden el mismo polo", !malos.length, malos.join(", "));
}

console.log("-- 7. La recomendación");
{
  const medidas = new Set(A.MEDIDO.filter((m) => m.n).map((m) => m.id));
  const ataca = P.medir(respuestas((e) => (e === "ataque" ? 1 : null)));
  const maniobra = P.medir(respuestas((e) => (e === "ataque" ? 0 : null)));
  const ctx = { ritmo: "clasicas", estudio: "mucho", elo: 1900, actual: {} };
  const ra = A.recomendar(ataca, ctx), rm = A.recomendar(maniobra, ctx);
  const validas = (r) => Object.entries(A.GRUPOS).every(([g, def]) => {
    const x = r[g];
    return x && [x.principal, x.alternativa].filter(Boolean).every((op) => {
      const l = LINEAS.find((y) => y.id === op.id);
      return l && medidas.has(op.id) && l.color === def.color && (!def.contra || l.jugadas[0] === def.contra);
    }) && x.alternativa && x.alternativa.apertura !== x.principal.apertura;
  });
  ok("cada apertura propuesta es una línea medida de su grupo, y la alternativa es de otra familia", validas(ra) && validas(rm));
  const car = (r, g) => A.medidaDe(r[g].principal.id).car.ataque;
  ok("a quien ataca le propone aperturas de más ataque que a quien maniobra",
    Object.keys(A.GRUPOS).every((g) => car(ra, g) > car(rm, g)), Object.keys(A.GRUPOS).map((g) => g + ": " + car(ra, g) + " contra " + car(rm, g)).join(" · "));
  ok("cada una dice su porqué y de dónde sale el dato", Object.keys(A.GRUPOS).every((g) => ra[g].principal.porque.some((t) => /partidas de maestros/.test(t))));
  // La que ya juega: con la mejor misma, se mantiene; con una que le queda mal, no.
  const mejor = ra.blancas.principal.id;
  const conLaMisma = A.recomendar(ataca, Object.assign({}, ctx, { actual: { blancas: mejor } }));
  ok("si ya juega la que mejor le queda, se le dice que siga con la suya", conLaMisma.blancas.mantener && conLaMisma.blancas.principal.id === mejor);
  const peor = [...medidas].map((id) => A.medidaDe(id)).filter((m) => m.color === "w")
    .sort((x, y) => A.distancia(ataca, y, 1, 3) - A.distancia(ataca, x, 1, 3))[0].id;
  const conLaPeor = A.recomendar(ataca, Object.assign({}, ctx, { actual: { blancas: peor } }));
  ok("si la suya le queda mal, se le recomienda otra", !conLaPeor.blancas.mantener && conLaPeor.blancas.principal.id !== peor);
  const empieza = A.recomendar(ataca, { ritmo: "blitz", estudio: "poco", elo: 900, actual: {} });
  const hayBaja = (g) => LINEAS.some((l) => medidas.has(l.id) && l.nivel < 3 && l.color === A.GRUPOS[g].color && (!A.GRUPOS[g].contra || l.jugadas[0] === A.GRUPOS[g].contra));
  ok("a quien empieza no le propone teoría de nivel 3 si hay otra", Object.keys(A.GRUPOS).every((g) => !hayBaja(g) || empieza[g].principal.nivel < 3),
    Object.keys(A.GRUPOS).map((g) => g + ": " + empieza[g].principal.id + " (" + empieza[g].principal.nivel + ")").join(" · "));
  ok("el nivel que conviene baja con el ritmo rápido y el poco estudio", A.nivelQueConviene({ elo: 1800 }) === 3 && A.nivelQueConviene({ elo: 1800, ritmo: "blitz" }) === 2 && A.nivelQueConviene({ elo: 1800, ritmo: "blitz", estudio: "poco" }) === 1);
  ok("la recomendación cabe en la base (32 KB)", Buffer.byteLength(JSON.stringify(ra)) < 32768, Buffer.byteLength(JSON.stringify(ra)) + " bytes");
}

console.log("-- 8. Las partidas del alumno");
{
  // Un momento: la posición de una pregunta del banco, con sus dos jugadas
  // como las «líneas del motor». La del alumno es la «a».
  const it = B.ITEMS.find((i) => i.eje === "ataque");
  const lineas = [{ uci: it.a.uci, score: 20, pv: it.a.linea }, { uci: it.b.uci, score: 15, pv: it.b.linea }];
  const m = EP.momentoDe({ fen: it.fen, jugada: it.a.uci }, lineas);
  ok("halla el momento en su eje, con el polo de la jugada que hizo", m.length >= 1 && m.some((x) => x.eje === "ataque" && x.primero === (it.a.polo === "atacar")), JSON.stringify(m));
  const malo = EP.momentoDe({ fen: it.fen, jugada: it.a.uci }, [{ uci: it.b.uci, score: 20, pv: it.b.linea }, { uci: it.a.uci, score: -60, pv: it.a.linea }]);
  ok("si su jugada no estaba entre las buenas, no cuenta", malo.length === 0);
  const decidida = EP.momentoDe({ fen: it.fen, jugada: it.a.uci }, [{ uci: it.a.uci, score: 400, pv: it.a.linea }, { uci: it.b.uci, score: 390, pv: it.b.linea }]);
  ok("con la posición decidida, no cuenta", decidida.length === 0);

  // El seguimiento: la apertura recomendada con blancas, antes y después.
  const rec = { blancas: { principal: { id: "espanola-cerrada", nombre: "Española, variante cerrada" } } };
  const esp = A.medidaDe("espanola-cerrada");
  const partida = (blancas, negras, fecha, res, jugadas) => ({ etiquetas: { White: blancas, Black: negras, UTCDate: fecha, Result: res }, jugadas });
  const espanola = LINEAS.find((l) => l.id === "espanola-cerrada").jugadas;
  const italiana = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"];
  const lista = [
    partida("ana", "x", "2026.05.01", "0-1", espanola), partida("ana", "x", "2026.05.02", "1/2-1/2", espanola),
    partida("ana", "x", "2026.10.01", "1-0", espanola), partida("ana", "x", "2026.10.02", "1-0", espanola), partida("Ana", "x", "2026.10.03", "0-1", espanola),
    partida("ana", "x", "2026.10.04", "0-1", italiana), partida("x", "ana", "2026.10.05", "1-0", espanola),
  ];
  const s = EP.seguimiento(lista, "ana", rec, "2026-09-01").blancas;
  ok("cuenta antes y después de la fecha, solo las que pasan por la apertura y con su color",
    s && s.antes.n === 2 && s.despues.n === 3 && Math.abs(s.despues.puntos - 2 / 3) < 1e-9 && s.resto.n === 1 && s.resto.puntos === 0, JSON.stringify(s));
  ok("con pocas partidas lo dice y no saca conclusiones", /hacen falta 5/.test(EP.fraseSeguimiento(s, true)), EP.fraseSeguimiento(s, true));
  ok("su posición propia es la de la medición", JSON.stringify(esp.define) === JSON.stringify(espanola.slice(0, esp.define.length)));
}

if (fallos) { console.log(`\n✗ ${fallos} comprobación(es) fallaron.`); process.exit(1); }
console.log("\n✓ La medición, la recomendación y las partidas de la prueba de estilo dicen lo que saben.");
