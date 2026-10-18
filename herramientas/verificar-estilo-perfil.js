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
 *  3. LAS PARTIDAS. 200 momentos de las partidas no dan vuelta las 8
 *     respuestas de un eje: corrigen la prueba, no la reemplazan.
 *  3c. LA OPINIÓN DEL PROFE. Pesa lo mismo que dos preguntas a su lado;
 *     «las dos por igual» achica el margen sin mover la tendencia; una
 *     opinión sobre un eje que esa versión no mide no cuenta; y no decide si
 *     la prueba agrega preguntas (eso es lo que contesta el alumno).
 *  4. LA CALIBRACIÓN. Una posición que tira hacia un polo (`b`) le resta a
 *     quien la eligió en ese sentido.
 *  5. LA PRUEBA ADAPTATIVA. Un estilo claro termina en 34 posiciones (32 y los
 *     dos controles); al azar puede seguir, pero nunca pasa de 58 ni repite
 *     una posición; y nunca pasa de las 60 respuestas que acepta la base.
 *  5c. LA VERSIÓN CORTA (para quien empieza). Solo sus posiciones simples,
 *     26 con un estilo claro, nunca más de 34, se guarda con su versión, y lo
 *     que se recomienda es de nivel 1.
 *  5b. LA VERSIÓN 1. Una prueba vieja se lee con sus tres ejes (no con un
 *     cuarto «sin definir») y con el tope de partidas de entonces (5).
 *  6. EL ESPEJO. Cada una de las 60 posiciones dada vuelta es legal, sus dos
 *     jugadas también, y medidas con estilo-medidas.js dan el MISMO polo.
 *  7. LA RECOMENDACIÓN. Cada apertura que propone es una línea medida de
 *     Aperturas y celadas del grupo que corresponde; a quien ataca le propone
 *     aperturas que atacan más que las que le propone a quien maniobra, y a
 *     quien da material, aperturas que dan más que a quien lo guarda; la que
 *     ya juega se mantiene si queda casi igual de bien; y a quien empieza no
 *     le propone teoría de nivel 3 si hay otra.
 *  8. LAS PARTIDAS DEL ALUMNO. Un momento cuenta solo si su jugada estaba
 *     entre las buenas; el seguimiento separa antes y después de la fecha y
 *     solo cuenta las partidas que pasan por la apertura recomendada.
 *  9. EL RENDIMIENTO SEGÚN EL TIPO DE PARTIDA. Con partidas de maestros de
 *     verdad, a las que se les pone el resultado: si gana las abiertas y
 *     pierde las cerradas, lo ve (y lo mide igual con blancas o negras); si
 *     el resultado es al azar, no lo afirma; con pocas partidas, tampoco. Y
 *     la recomendación lo suma: a quien le va mejor abierto, aperturas más
 *     abiertas que a quien le va mejor cerrado, con el porqué y los números.
 * 10. EL PLAN DE 4 SEMANAS. Una tarea por apertura recomendada y una de
 *     repaso, cada una de 7 días y empezando cuando termina la anterior; cada
 *     renglón es uno que Tareas sabe contar (Aperturas y celadas, la línea
 *     que existe, cantidad 1; o minutos), y lo que falta en la recomendación
 *     no se inventa.
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
    B.ITEMS.filter((i) => i.eje === eje).slice(0, op.n || B.FORMA.porEje).forEach((it) => {
      out.push({ id: it.id, eleccion: elegir(it, quiere), seguridad: op.seguridad || 3, ms: op.ms || 8000 });
    });
  }
  return out;
}
const ancho = (x) => x.hi - x.lo;

console.log("-- 1. Las etiquetas");
{
  const pf = P.medir(respuestas(() => 1));
  ok("siempre el primer polo: «claramente» en los cuatro ejes", P.EJES.every((e) => pf[e].etiqueta.tipo === "claro" && pf[e].etiqueta.polo === primeroDe(e)),
    P.EJES.map((e) => pf[e].etiqueta.texto).join(" | "));
  const pf2 = P.medir(respuestas(() => 0));
  ok("siempre el segundo: «claramente» el otro polo", P.EJES.every((e) => pf2[e].etiqueta.tipo === "claro" && pf2[e].etiqueta.polo === M.POLOS[e][1]));
  let afirma = 0;
  for (let k = 0; k < 200; k++) {
    const pf3 = P.medir(respuestas(() => null));
    afirma += P.EJES.filter((e) => pf3[e].etiqueta.tipo === "claro").length;
  }
  ok("al azar, «claramente» en menos del 5 % de 800 ejes", afirma < 40, afirma + " de 800");
  // Con los dos controles fallados (lo esperable al azar) el margen se ensancha y afirma menos.
  let conControles = 0;
  for (let k = 0; k < 200; k++) {
    const r = respuestas(() => null);
    const f = (x) => ({ id: x.id, control: x.id, eleccion: x.eleccion === "a" ? "b" : "a", seguridad: 3, ms: 5000 });
    const pf4 = P.medir(r.concat([f(r[0]), f(r[B.FORMA.porEje])]));
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
  const otroEje = B.FORMA.porEje;   // la primera respuesta del segundo eje
  const it1 = B.ITEMS.find((i) => i.id === base[otroEje].id);
  const igualA = (r) => ({ id: r.id, control: r.id, eleccion: r.eleccion, seguridad: 3, ms: 5000 });
  const otraA = (r) => ({ id: r.id, control: r.id, eleccion: r.eleccion === "a" ? "b" : "a", seguridad: 3, ms: 5000 });
  const coinciden = P.medir(base.concat([igualA(base[0]), igualA(base[otroEje])]));
  const noCoinciden = P.medir(base.concat([otraA(base[0]), otraA(base[otroEje])]));
  const sinControles = P.medir(base);
  ok("los controles se cuentan", coinciden.controles.total === 2 && coinciden.controles.fallados === 0 && noCoinciden.controles.fallados === 2, JSON.stringify([coinciden.controles, noCoinciden.controles, it0.eje, it1.eje]));
  ok("un control que coincide no suma como respuesta (mismo resultado que sin él)", P.EJES.every((e) => Math.abs(coinciden[e].theta - sinControles[e].theta) < 1e-12 && coinciden[e].n === sinControles[e].n));
  ok("dos controles que no coinciden ensanchan los cuatro márgenes un 50 %", P.EJES.every((e) => Math.abs(noCoinciden[e].se / sinControles[e].se - 1.5) < 1e-9));
}

console.log("-- 3. Las partidas");
{
  const pf = P.medir(respuestas(() => 0));
  const muchas = Array.from({ length: 200 }, () => ({ eje: "ataque", primero: true }));
  const conPartidas = P.medir(respuestas(() => 0), muchas);
  ok("200 momentos que dicen lo contrario no dan vuelta 8 respuestas firmes", conPartidas.ataque.p < 0.5, "p = " + conPartidas.ataque.p.toFixed(2));
  ok("pero sí la mueven", conPartidas.ataque.p > pf.ataque.p + 0.05);
  ok("y se cuentan aparte", conPartidas.ataque.nPartidas === 200 && conPartidas.ataque.n === B.FORMA.porEje);
  ok("el tope de las partidas es la mitad de las preguntas del eje (4 hoy, 5 en la versión 1)", P.topePartidas() === 4 && P.topePartidas(1) === 5);
}

console.log("-- 3b. La versión 1, con su regla");
{
  // Una prueba de la versión 1: las 10 primeras de cada uno de sus tres ejes.
  const v1 = [];
  for (const eje of B.FORMAS[1].ejes) B.ITEMS.filter((i) => i.eje === eje).slice(0, 10)
    .forEach((it) => v1.push({ id: it.id, eleccion: elegir(it, () => 1), seguridad: 3, ms: 8000 }));
  const pf = P.medir(v1, [], 1);
  ok("se lee con sus tres ejes, sin un cuarto «sin definir»", JSON.stringify(pf.lista) === JSON.stringify(["ataque", "estructura", "cambios"]) && !pf.material && !("material" in pf.ejes));
  ok("y dice lo mismo que decía", pf.lista.every((e) => pf[e].etiqueta.tipo === "claro" && pf[e].n === 10));
  const hoy = P.medir(v1);
  ok("leída con la regla de hoy, el cuarto eje saldría sin definir (por eso se pasa la versión)", hoy.material && hoy.material.etiqueta.tipo === "sin definir");
}

console.log("-- 3c. La opinión del profe");
{
  const it = B.ITEMS.filter((i) => i.eje === "material");
  const primero = (x) => ({ id: x.id, eleccion: x.a.polo === "material" ? "a" : "b", seguridad: 3, ms: 5000 });
  const dos = P.medir([primero(it[0]), primero(it[1])]);
  const conProfe = P.medir([], [], undefined, [{ eje: "material", opinion: 1 }]);
  ok("una opinión pesa lo que dos preguntas a su lado", Math.abs(conProfe.material.theta - dos.material.theta) < 1e-9 && conProfe.material.nProfe === 1 && conProfe.material.n === 0,
    conProfe.material.theta + " contra " + dos.material.theta);
  const igual = P.medir([], [], undefined, [{ eje: "material", opinion: 0 }]);
  const nada = P.medir([]);
  ok("«las dos por igual» achica el margen sin mover la tendencia", Math.abs(igual.material.theta) < 1e-9 && igual.material.se < nada.material.se);
  const v1 = P.medir([], [], 1, [{ eje: "material", opinion: 1 }]);
  ok("en una prueba que no mide ese eje, no cuenta", !v1.material && v1.lista.length === 3);
  ok("lo dice en la frase", /lo que ve tu profe/.test(P.frase("material", conProfe.material, true)) && /lo que ven sus profes/.test(P.frase("material", P.medir([], [], undefined, [{ eje: "material", opinion: 1 }, { eje: "material", opinion: 1 }]).material, false)));
  // La prueba adaptativa: con o sin opiniones, las mismas preguntas.
  const correr = (opiniones) => {
    semilla = 4242;
    const pr = P.Prueba({ azar, Chess, opiniones });
    let x, n = 0;
    while ((x = pr.siguiente()) && n < 100) { pr.responder(x, { eleccion: elegir(x, () => null), seguridad: 3, ms: 6000 }); n++; }
    return { n, perfil: pr.perfil() };
  };
  const sinOp = correr([]);
  const conOp = correr(["ataque", "estructura", "cambios", "material"].map((e) => ({ eje: e, opinion: 1 })));
  ok("la opinión no decide si la prueba agrega preguntas, pero sí entra al resultado", sinOp.n === conOp.n && conOp.perfil.material.nProfe === 1 && conOp.perfil.material.p > sinOp.perfil.material.p, sinOp.n + " / " + conOp.n);
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
    const t = {};
    for (const e of P.EJES) t[e] = 1.2 * normal();
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
  ok("calibra las 60 (todas con más de 30 respuestas)", ids.every((id) => cal[id] && cal[id].n === 400));
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
  ok("un estilo claro termina en 34 posiciones", claro.n === 34, "vio " + claro.n);
  ok("con los dos controles marcados", claro.respuestas.filter((r) => r.control).length === 2);
  let max = 0, alguna = false, repite = false;
  for (let k = 0; k < 40; k++) {
    const r = correr(() => null);
    max = Math.max(max, r.n);
    if (r.n > 34) alguna = true;
    if (new Set(r.ids).size !== r.ids.length) repite = true;
  }
  ok("al azar, a veces sigue preguntando", alguna);
  ok("pero nunca pasa de 58", max <= 58, "máximo " + max);
  ok("ni repite una posición", !repite);
  ok("ni pasa de las 60 respuestas que acepta la base", max <= 60);
}

console.log("-- 5c. La versión corta, para quien empieza");
{
  const V = B.VERSION_INICIAL, F = B.FORMAS[V];
  const correr = (quiere) => {
    const pr = P.Prueba({ azar, Chess, version: V });
    const ids = [];
    let it, n = 0;
    while ((it = pr.siguiente()) && n < 100) {
      ids.push(it.control || it.id);
      pr.responder(it, { eleccion: elegir(it, quiere), seguridad: 3, ms: 6000 });
      n++;
    }
    return { n, ids, pr };
  };
  const claro = correr(() => 1);
  ok("un estilo claro termina en 26 posiciones (6 por eje y los dos controles)", claro.n === 26, "vio " + claro.n);
  ok("solo con sus posiciones simples", claro.ids.every((id) => F.posiciones.includes(id)));
  ok("y la prueba sabe su versión (la que se guarda)", claro.pr.version === V);
  let max = 0;
  for (let k = 0; k < 30; k++) max = Math.max(max, correr(() => null).n);
  ok("al azar nunca pasa de 34", max <= 34, "máximo " + max);
  const pf = claro.pr.perfil();
  ok("se lee con sus cuatro ejes", pf.lista.length === 4 && pf.lista.every((e) => pf[e].etiqueta.tipo === "claro"));
  const rec = A.recomendar(pf, { ritmo: "clasicas", estudio: "mucho", elo: 1900, inicial: true, actual: {} });
  const nivelDe = (id) => (LINEAS.find((l) => l.id === id) || {}).nivel;
  const hayUno = (g) => LINEAS.some((l) => l.tipo === "apertura" && l.nivel === 1 && A.medidaDe(l.id) && A.medidaDe(l.id).n
    && l.color === A.GRUPOS[g].color && (!A.GRUPOS[g].contra || l.jugadas[0] === A.GRUPOS[g].contra));
  ok("lo que recomienda es de nivel 1, aunque diga Elo 1900 y mucho estudio", A.nivelQueConviene({ elo: 1900, estudio: "mucho", inicial: true }) === 1
    && Object.keys(A.GRUPOS).every((g) => !hayUno(g) || nivelDe(rec[g].principal.id) === 1),
    Object.keys(A.GRUPOS).map((g) => rec[g].principal.id + " (" + nivelDe(rec[g].principal.id) + ")").join(" · "));
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
  ok("las 60 posiciones dadas vuelta son legales y miden el mismo polo", !malos.length, malos.join(", "));
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
  const da = P.medir(respuestas((e) => (e === "material" ? 0 : null)));
  const guarda = P.medir(respuestas((e) => (e === "material" ? 1 : null)));
  const rd = A.recomendar(da, ctx), rg = A.recomendar(guarda, ctx);
  const mat = (r, g) => A.medidaDe(r[g].principal.id).car.material;
  ok("a quien da material le propone aperturas que dan más que a quien lo guarda",
    Object.keys(A.GRUPOS).every((g) => mat(rd, g) < mat(rg, g)), Object.keys(A.GRUPOS).map((g) => g + ": " + rd[g].principal.id + " " + mat(rd, g) + " contra " + rg[g].principal.id + " " + mat(rg, g)).join(" · "));
  const v1 = A.recomendar(P.medir(respuestas(() => 1).filter((r) => B.ITEMS.find((i) => i.id === r.id).eje !== "material"), [], 1), ctx);
  ok("con una prueba de la versión 1 (sin el cuarto eje) también recomienda", Object.keys(A.GRUPOS).every((g) => v1[g] && v1[g].principal));
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

console.log("-- 9. El rendimiento según el tipo de partida");
{
  const PM = require("./lib/partidas-maestros.js");
  const INICIAL = new Chess().fen();
  const reales = PM.leer(Chess).filter((p) => p.inicial === INICIAL && p.sans.length >= 40).slice(0, 400);
  const tipos = reales.map((p) => EP.tipoDePartida({ jugadas: p.sans }));
  const mediana = tipos.map((x) => x.estructura).sort((a, b) => a - b)[Math.floor(tipos.length / 2)];
  // «ana» juega la mitad con blancas y la mitad con negras; gana las abiertas.
  const conResultado = (gana) => reales.map((p, k) => {
    const blancas = k % 2 === 0;
    const g = gana(tipos[k], k);
    const res = g === 0.5 ? "1/2-1/2" : (g === 1) === blancas ? "1-0" : "0-1";
    return { etiquetas: { White: blancas ? "ana" : "x", Black: blancas ? "x" : "ana", Result: res, UTCDate: "2026.01.01" }, jugadas: p.sans };
  });
  const abiertas = EP.rendimiento(conResultado((x) => (x.estructura > mediana ? 1 : 0)), "ana");
  ok("si gana las abiertas y pierde las cerradas, lo ve", abiertas.ejes.estructura.cuenta && abiertas.ejes.estructura.d > 0.5, JSON.stringify(abiertas.ejes.estructura));
  ok("el tipo de partida es el mismo para los dos bandos (no mira quién va ganando)",
    JSON.stringify(EP.tipoDePartida({ jugadas: reales[0].sans })) === JSON.stringify(tipos[0]) && abiertas.n === reales.length);
  semilla = 7;
  let afirma = 0;
  for (let k = 0; k < 20; k++) {
    const r = EP.rendimiento(conResultado(() => (azar() < 0.5 ? 1 : 0)), "ana");
    afirma += ["estructura", "cambios"].filter((e) => r.ejes[e].cuenta).length;
  }
  ok("con el resultado al azar casi nunca lo afirma (menos de 4 de 40)", afirma < 4, afirma + " de 40");
  const pocas = EP.rendimiento(conResultado((x) => (x.estructura > mediana ? 1 : 0)).slice(0, 24), "ana");
  ok("con menos de 15 partidas por mitad no cuenta, aunque la diferencia sea total", !pocas.ejes.estructura.cuenta, JSON.stringify(pocas.ejes.estructura));
  ok("el ataque y el material no se miden así (dirían solo que gana cuando va ganando)", !("ataque" in abiertas.ejes) && !("material" in abiertas.ejes));

  const neutro = P.medir([]);
  const ctx = { ritmo: "clasicas", estudio: "mucho", elo: 1900, actual: {} };
  const rinde = (d) => ({ n: 80, ejes: { estructura: { alto: { n: 40, puntos: 0.5 + d / 2 }, bajo: { n: 40, puntos: 0.5 - d / 2 }, d, z: 3 * Math.sign(d), cuenta: true } } });
  const ra = A.recomendar(neutro, Object.assign({}, ctx, { rendimiento: rinde(0.3) }));
  const rc = A.recomendar(neutro, Object.assign({}, ctx, { rendimiento: rinde(-0.3) }));
  const est = (r, g) => A.medidaDe(r[g].principal.id).car.estructura;
  ok("a quien le va mejor abierto le propone aperturas más abiertas que a quien le va mejor cerrado",
    Object.keys(A.GRUPOS).every((g) => est(ra, g) > est(rc, g)), Object.keys(A.GRUPOS).map((g) => g + ": " + est(ra, g) + " contra " + est(rc, g)).join(" · "));
  ok("y lo dice con sus números", Object.keys(A.GRUPOS).some((g) => ra[g].principal.porque.some((f) => /En tus partidas te va mejor cuando el juego queda abierto: 65 % de los puntos en 40 partidas, contra 35 % en 40/.test(f))),
    JSON.stringify(ra.blancas.principal.porque));
  const sinCuenta = rinde(0.3);
  sinCuenta.ejes.estructura.cuenta = false;
  const rs = A.recomendar(neutro, Object.assign({}, ctx, { rendimiento: sinCuenta }));
  ok("si la diferencia puede ser del azar, no cambia nada", JSON.stringify(rs) === JSON.stringify(A.recomendar(neutro, ctx)));
}


console.log("-- 10. El plan de 4 semanas");
{
  // El catálogo de Tareas es un script de página (window.MaterialPlataforma).
  const win = {};
  new Function("window", require("fs").readFileSync(path.join(RAIZ, "js/material-plataforma.js"), "utf8"))(win);
  const Mp = win.MaterialPlataforma;
  const rec = A.recomendar(P.medir([]), { ritmo: "clasicas", estudio: "mucho", elo: 1800, actual: {} });
  const ahora = "2026-10-18T12:00:00.000Z";
  const plan = A.plan(rec, { ahora, minutos: 25 });
  ok("cuatro semanas: con blancas, contra 1.e4, contra 1.d4 y repaso", plan.map((s) => s.grupo).join() === "blancas,e4,d4,repaso" && plan.map((s) => s.semana).join() === "1,2,3,4");
  const dia = 24 * 3600 * 1000;
  ok("cada una de 7 días, la primera desde hoy y cada una cuando termina la anterior",
    plan[0].desde === null && plan.every((s, k) => Date.parse(s.vence) === Date.parse(ahora) + 7 * (k + 1) * dia && (k === 0 || s.desde === plan[k - 1].vence)));
  const h = Mp.herramienta("aperturas");
  const lineas = new Set(LINEAS.map((l) => l.id));
  const malos = [];
  plan.forEach((s) => s.items.forEach((it) => {
    if (it.material_slug !== "aperturas" || !h.metas.includes(it.meta_tipo) || !(it.meta_cantidad > 0)) malos.push(s.semana + ": " + JSON.stringify(it));
    if (it.meta_tipo === "cantidad" && (it.meta_cantidad !== 1 || !lineas.has(it.filtro_clave) || it.material_href !== h.hrefRecorte(it.filtro_clave))) malos.push(s.semana + ": línea " + it.filtro_clave);
  }));
  ok("cada renglón es uno que Tareas sabe contar (la línea que existe, una vez; o minutos)", !malos.length, malos.join(" | "));
  ok("las semanas de cada apertura piden su línea, la que se le recomendó", ["blancas", "e4", "d4"].every((g, k) => plan[k].items[0].filtro_clave === rec[g].principal.id));
  ok("los minutos que elige el profe, y el repaso al menos 30", plan[0].items[1].meta_cantidad === 25 && plan[3].items[0].meta_cantidad === 30);
  const sinE4 = Object.assign({}, rec, { e4: null });
  ok("si falta una recomendación, no la inventa", A.plan(sinE4, { ahora }).map((s) => s.grupo).join() === "blancas,d4,repaso");
  ok("sin nada recomendado, no hay plan", A.plan({}, { ahora }).length === 0);
}

if (fallos) { console.log(`\n✗ ${fallos} comprobación(es) fallaron.`); process.exit(1); }
console.log("\n✓ La medición, la recomendación y las partidas de la prueba de estilo dicen lo que saben.");
