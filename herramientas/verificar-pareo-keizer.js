/* Pareo Integral: el Sistema Keizer, la doble eliminación y el partido por el
 * tercer puesto (js/pareo/torneo.js, desempates.js, pagina.js, publicar.js).
 *
 * Lo que se rompe acá no da ningún error: un Keizer que no vuelve a contar
 * las rondas viejas con los valores nuevos da una lista que parece buena y no
 * lo es; una lista ordenada por un total y mostrada con otro; una doble
 * eliminación que deja fuera a alguien con una sola derrota, o que deja
 * seguir a quien lleva dos; una final que no pide la revancha cuando la gana
 * el que viene de perdedores. Dos partes:
 *
 *   1. La lógica, en Node: los puntos Keizer contados a mano, lo que suma
 *      cada forma de faltar y su tope, la lista siempre ordenada por lo que
 *      muestra, el emparejamiento de arriba abajo sin repetir rival, el libre
 *      repartido, los colores; en la doble eliminación, cuántas rondas, que
 *      nadie quede fuera con una derrota ni siga con dos, la final, la
 *      revancha y los puestos; el tercer puesto; el TRF y lo que se publica.
 *   2. La página, en un navegador: elegir cada sistema, emparejar, jugar
 *      hasta el final y ver la clasificación y el cuadro.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-keizer.js
 */
const { chromium } = require("playwright");
const T = require("../js/pareo/torneo.js");
const D = require("../js/pareo/desempates.js");
const PP = require("../js/pareo/publicar.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));

// Un azar que se repite igual en cada corrida.
function azarFijo(semilla) {
  let s = semilla;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}
function torneo(n, datos) {
  const jugadores = [];
  for (let i = 1; i <= n; i++) jugadores.push({ id: "s" + i, nombre: "Semilla " + i, elo: 2500 - i * 10 });
  const t = T.nuevo(Object.assign({ jugadores }, datos));
  T.fijarNumeracion(t);
  return t;
}
const semilla = (id) => Number(id.slice(1));

function logicaKeizer() {
  console.log("\n=== Keizer: los puntos ===");
  const t = torneo(4, { sistema: "keizer", rondasTotales: 5 });
  const antes = T.puntuarKeizer(t);
  ok(antes.orden.join() === "s1,s2,s3,s4" && [4, 3, 2, 1].every((v, i) => antes.valor.get("s" + (i + 1)) === v && antes.total.get("s" + (i + 1)) === v),
    "antes de la ronda 1 el orden es el de la lista: el primero vale 4 (son cuatro), el último 1, y cada uno arranca con su propio valor");
  const r1 = T.emparejarKeizer(t, 0, {});
  ok(r1.length === 2 && [r1[0].b, r1[0].n].sort().join() === "s1,s2" && [r1[1].b, r1[1].n].sort().join() === "s3,s4", "se empareja de arriba abajo: el 1 con el 2 y el 3 con el 4", JSON.stringify(r1));
  // s1 le gana a s2; s3 y s4 hacen tablas. A mano: s1 = 4 + 3 = 7; s2 = 3;
  // s3 = 2 + 1/2 = 2,5; s4 = 1 + 2/2 = 2. El orden no cambia.
  for (const m of r1) m.r = [m.b, m.n].includes("s1") ? (m.b === "s1" ? "1-0" : "0-1") : "=";
  t.rondas.push({ mesas: r1, ausencias: {} });
  const p = T.puntuarKeizer(t);
  ok(p.total.get("s1") === 7 && p.total.get("s2") === 3 && p.total.get("s3") === 2.5 && p.total.get("s4") === 2,
    "ganar suma el valor del rival y unas tablas la mitad, más el valor propio una vez (7 · 3 · 2,5 · 2, contado a mano)", [...p.total].join(" "));

  // Vuelve a contar lo viejo con los valores nuevos: si s4 le gana a s1, sube,
  // y entonces a s3 sus tablas de la ronda 1 con s4 le valen MÁS que antes.
  const t2 = torneo(4, { sistema: "keizer", rondasTotales: 5 });
  t2.rondas.push({ mesas: [{ b: "s1", n: "s2", r: "1-0" }, { b: "s3", n: "s4", r: "=" }], ausencias: {} });
  const tablasAntes = T.puntuarKeizer(t2).valor.get("s4") / 2;
  t2.rondas.push({ mesas: [{ b: "s4", n: "s1", r: "1-0" }, { b: "s2", n: "s3", r: "=" }], ausencias: {} });
  const p2 = T.puntuarKeizer(t2);
  ok(p2.valor.get("s4") / 2 > tablasAntes, "las rondas viejas se cuentan otra vez con los valores nuevos: las tablas con quien subió valen más que cuando se jugaron",
    "antes " + tablasAntes + ", ahora " + p2.valor.get("s4") / 2);

  console.log("\n=== Keizer: faltar ===");
  const K = T.REGLAS_KEIZER;
  ok(K.victoria === 20 && K.tablas === 10 && K.derrota === 0 && K.libre === 10 && K.medio === 10 && K.falta === 7 && K.club === 14 && K.topeFaltas === 5 && K.sinRepetir === 3,
    "las reglas son las de chesspairing: 1, ½ y 0 del rival; ½ del propio por quedar libre o avisar; 35 % por faltar (hasta 5) y 70 % por el club; tres rondas sin repetir rival");
  // Uno solo, sin rivales que muevan su valor: 6 rondas faltando.
  const f = torneo(3, { sistema: "keizer", rondasTotales: 8 });
  for (let r = 0; r < 6; r++) f.rondas.push({ mesas: [{ b: "s1", n: "s2", r: "=" }], ausencias: {} });
  const pf = T.puntuarKeizer(f);
  const v3 = pf.valor.get("s3");
  ok(Math.abs(pf.total.get("s3") - (v3 + 5 * 0.35 * v3)) < 1e-9, "quien falta suma el 35 % de su valor, y de la sexta falta en adelante nada", pf.total.get("s3") + " con valor " + v3);
  const g = torneo(3, { sistema: "keizer", rondasTotales: 8 });
  g.rondas.push({ mesas: [{ b: "s1", n: "s2", r: "=" }], ausencias: { s3: "H" } }, { mesas: [{ b: "s2", n: "s1", r: "=" }], ausencias: { s3: "F" } }, { mesas: [{ b: "s1", n: "s2", r: "=" }, { b: "s3", n: null, r: null }], ausencias: {} });
  const pg = T.puntuarKeizer(g), vg = pg.valor.get("s3");
  ok(Math.abs(pg.total.get("s3") - (vg + 0.5 * vg + 0.7 * vg + 0.5 * vg)) < 1e-9, "avisar suma la mitad, jugar por el club el 70 % y quedar libre la mitad, siempre del valor propio", pg.total.get("s3") + " con valor " + vg);
  const ret = torneo(3, { sistema: "keizer", rondasTotales: 8 });
  ret.jugadores[2].retiradoDespuesDe = 0;
  ret.rondas.push({ mesas: [{ b: "s1", n: "s2", r: "=" }], ausencias: {} });
  const pr = T.puntuarKeizer(ret);
  ok(pr.total.get("s3") === pr.valor.get("s3"), "quien se retiró no suma por faltar");
  const inc = torneo(2, { sistema: "keizer" });
  inc.rondas.push({ mesas: [{ b: "s1", n: "s2", r: "-+" }], ausencias: {} });
  const pi = T.puntuarKeizer(inc);
  ok(pi.orden[0] === "s2" && pi.total.get("s1") === pi.valor.get("s1"), "ganar por incomparecencia suma el valor del rival; quien no se presentó, nada");

  console.log("\n=== Keizer: torneos al azar ===");
  const rnd = azarFijo(11);
  let listas = 0, desordenadas = 0, repetidas = 0, malPareo = "", libresMal = 0, saldoMax = 0;
  for (let caso = 0; caso < 120; caso++) {
    const n = 5 + Math.floor(rnd() * 28), rondas = 4 + Math.floor(rnd() * 10);
    const tt = torneo(n, { sistema: "keizer", rondasTotales: rondas });
    const libres = new Map(), saldo = new Map();
    for (let r = 0; r < rondas; r++) {
      const aus = {};
      for (const j of tt.jugadores) if (rnd() < 0.15) aus[j.id] = ["Z", "H", "F"][Math.floor(rnd() * 3)];
      const juegan = T.participantes(tt, r, aus);
      if (juegan.length < 2) continue;
      const mesas = T.emparejarKeizer(tt, r, aus);
      const vistos = new Set();
      for (const m of mesas) {
        for (const id of [m.b, m.n]) if (id) { if (vistos.has(id) || aus[id]) malPareo = malPareo || "ronda " + (r + 1) + ": " + id; vistos.add(id); }
        if (m.n === null) { libres.set(m.b, (libres.get(m.b) || 0) + 1); continue; }
        // Con 8 o más en la sala siempre hay forma de no repetir.
        if (juegan.length >= 8) for (let k = Math.max(0, r - 3); k < r; k++) if (tt.rondas[k] && tt.rondas[k].mesas.some((x) => (x.b === m.b && x.n === m.n) || (x.b === m.n && x.n === m.b))) repetidas++;
        m.r = ["1-0", "=", "0-1"][Math.floor(rnd() * 3)];
        saldo.set(m.b, (saldo.get(m.b) || 0) + 1); saldo.set(m.n, (saldo.get(m.n) || 0) - 1);
      }
      if (vistos.size !== juegan.length) malPareo = malPareo || "ronda " + (r + 1) + ": juegan " + vistos.size + " de " + juegan.length;
      tt.rondas.push({ mesas, ausencias: aus });
      const pp = T.puntuarKeizer(tt);
      listas++;
      for (let i = 1; i < pp.orden.length; i++) if (pp.total.get(pp.orden[i]) > pp.total.get(pp.orden[i - 1])) { desordenadas++; break; }
    }
    const veces = [...libres.values()];
    if (veces.length && Math.max(...veces) > Math.ceil(rondas / Math.max(1, n - 6)) + 1) libresMal++;
    for (const s of saldo.values()) saldoMax = Math.max(saldoMax, Math.abs(s));
  }
  ok(!malPareo, "en cada ronda juega cada presente una sola vez, y nadie que avisó que no viene", malPareo);
  ok(desordenadas === 0, listas + " clasificaciones: la lista va siempre ordenada por los puntos que muestra", desordenadas + " desordenadas");
  ok(repetidas === 0, "con ocho o más en la sala, nadie repite un rival de las últimas tres rondas", repetidas + " repeticiones");
  ok(libresMal === 0, "el libre se reparte: no le toca siempre al mismo", libresMal + " torneos");
  ok(saldoMax <= 4, "los colores se van parejando (nadie pasa de 4 de diferencia en 13 rondas)", "máximo " + saldoMax);
  // Pocos jugadores y muchas rondas: repetir es inevitable, y no se cuelga.
  const pocos = torneo(4, { sistema: "keizer", rondasTotales: 9 });
  for (let r = 0; r < 9; r++) { const m = T.emparejarKeizer(pocos, r, {}); m.forEach((x) => { x.r = "="; }); pocos.rondas.push({ mesas: m, ausencias: {} }); }
  ok(pocos.rondas.every((R) => R.mesas.length === 2), "con cuatro jugadores y nueve rondas se repite (no hay otra) y se empareja igual");

  console.log("\n=== Keizer: la clasificación, el TRF y lo que se publica ===");
  const c = torneo(6, { sistema: "keizer", rondasTotales: 4, desempates: ["KZ", "KV", "BH"] });
  for (let r = 0; r < 3; r++) { const m = T.emparejarKeizer(c, r, {}); m.forEach((x) => { x.r = semilla(x.b) > semilla(x.n) ? "1-0" : "0-1"; }); c.rondas.push({ mesas: m, ausencias: {} }); }
  const filas = D.clasificacion(c);
  const pk = T.puntuarKeizer(c);
  ok(filas.map((f) => f.id).join() === pk.orden.join() && filas.every((f) => f.valores.KZ === pk.total.get(f.id) && f.valores.KV === pk.valor.get(f.id)),
    "la clasificación sigue el orden del Keizer y trae sus puntos (KZ) y lo que vale cada uno (KV)");
  ok(!D.CATALOGO.some((x) => x.codigo === "KZ" || x.codigo === "KV") && D.CATALOGO_KEIZER.map((x) => x.codigo).join() === "KZ,KV"
    && require("../js/pareo/equipos.js").catalogo(c).some((x) => x.codigo === "KZ") && !require("../js/pareo/equipos.js").catalogo(Object.assign({}, c, { sistema: "suizo" })).some((x) => x.codigo === "KZ"),
    "KZ y KV no están en el catálogo de desempates de FIDE: solo se ofrecen y se nombran en un Keizer");
  const sinKz = D.clasificacion(Object.assign({}, c, { desempates: ["BH"] }));
  ok(sinKz.map((f) => f.id).join() === pk.orden.join(), "aunque se quite KZ de la lista de desempates, en un Keizer mandan los puntos Keizer");
  const suizo = D.clasificacion(Object.assign({}, c, { sistema: "suizo", desempates: ["BH"] }));
  ok(suizo.map((f) => f.id).join() !== pk.orden.join() || suizo[0].puntos >= suizo[1].puntos, "y en un suizo no se meten");
  const trf = T.aTrf(c, {});
  ok(/^092 Individual: Keizer/m.test(trf) && !/^192 /m.test(trf) && T.deTrf(trf).sistema === "keizer", "el TRF dice «Keizer», sin la línea 192 del Holandés, y se vuelve a leer como Keizer");
  const pub = PP.datosPublicos(c);
  ok(pub.sistema === "keizer" && pub.rondasTotales === 4 && pub.desempates[0] === "KZ", "se publica como Keizer, con sus rondas y sus desempates");
}

function logicaDoble() {
  console.log("\n=== Doble eliminación ===");
  const favorito = (m) => (semilla(m.b) < semilla(m.n) ? m.b : m.n);
  function jugar(n, gana) {
    const t = torneo(n, { sistema: "eliminacion", dobleEliminacion: true });
    const derrotas = new Map();
    let problema = "";
    for (let guarda = 0; t.rondas.length < T.rondasDelTorneo(t) && guarda < 60; guarda++) {
      const R = T.rondaFija(t, t.rondas.length);
      const enRonda = new Set();
      for (const m of R.mesas) {
        for (const id of [m.b, m.n]) if (id) {
          if (enRonda.has(id)) problema = problema || id + " juega dos veces en la ronda " + (t.rondas.length + 1);
          if ((derrotas.get(id) || 0) >= 2) problema = problema || id + " sigue jugando con dos derrotas";
          enRonda.add(id);
        }
        if (m.n === null) continue;
        const g = gana(m);
        m.r = g === m.b ? "1-0" : "0-1";
        const p = g === m.b ? m.n : m.b;
        derrotas.set(p, (derrotas.get(p) || 0) + 1);
      }
      t.rondas.push(R);
    }
    return { t, derrotas, problema };
  }
  const problemas = [];
  for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 12, 16, 17, 31, 32, 33]) {
    const { t, derrotas, problema } = jugar(n, favorito);
    if (problema) problemas.push(n + ": " + problema);
    let k = 0; for (let x = 2; x < n; x *= 2) k++;
    const esperadas = n <= 2 ? 2 : 2 * (k + 1);
    if (t.rondas.length !== esperadas) problemas.push(n + ": " + t.rondas.length + " rondas, esperaba " + esperadas);
    if (T.campeonEliminacion(t) !== "s1") problemas.push(n + ": el campeón es " + T.campeonEliminacion(t));
    // Todos menos el campeón quedaron fuera con dos derrotas exactas.
    for (const j of t.jugadores) if (j.id !== "s1" && derrotas.get(j.id) !== 2) problemas.push(n + ": " + j.id + " terminó con " + (derrotas.get(j.id) || 0) + " derrotas");
    if (derrotas.get("s1")) problemas.push(n + ": el campeón perdió");
    const clas = D.clasificacion(t, []);
    if (clas[0].id !== "s1" || clas[1].id !== "s2" || (n >= 3 && clas[2].id !== "s3")) problemas.push(n + ": los tres primeros son " + clas.slice(0, 3).map((f) => f.id).join());
    if (n >= 4 && !(clas[0].puesto === 1 && clas[1].puesto === 2 && clas[2].puesto === 3 && clas[3].puesto === 4)) problemas.push(n + ": los cuatro primeros no van del 1.º al 4.º, cada uno solo");
    if (n >= 8 && !(clas[4].puesto === 5 && clas[5].puesto === 5)) problemas.push(n + ": el 5.º no se comparte entre dos");
  }
  ok(!problemas.length, "de 2 a 33 jugadores, ganando siempre el favorito: las rondas que tocan, nadie fuera con una sola derrota ni jugando con dos, campeón el n.º 1 y los puestos del 1.º al 4.º cada uno solo", problemas.join(" | "));

  const rnd = azarFijo(5);
  const azar = [];
  for (let caso = 0; caso < 150; caso++) {
    const n = 2 + Math.floor(rnd() * 40);
    const { t, derrotas, problema } = jugar(n, (m) => (rnd() < 0.5 ? m.b : m.n));
    if (problema) azar.push(n + ": " + problema);
    const campeon = T.campeonEliminacion(t);
    if (!campeon) { azar.push(n + ": sin campeón"); continue; }
    if ((derrotas.get(campeon) || 0) > 1) azar.push(n + ": el campeón lleva dos derrotas");
    for (const j of t.jugadores) if (j.id !== campeon && derrotas.get(j.id) !== 2) azar.push(n + ": " + j.id + " terminó con " + (derrotas.get(j.id) || 0));
    const clas = D.clasificacion(t, []);
    if (clas[0].id !== campeon || clas.filter((f) => f.puesto === 1).length !== 1) azar.push(n + ": el campeón no es el primero de la clasificación");
  }
  ok(!azar.length, "150 torneos con resultados al azar: siempre hay un campeón, con una derrota como mucho, y los demás quedaron fuera con dos exactas", azar.slice(0, 4).join(" | "));

  // La revancha: el que viene de perdedores gana la primera final.
  const rv = jugar(8, (m) => (m.llave === "F" && m.fase === 1 ? m.deP : favorito(m)));
  const ultima = rv.t.rondas[rv.t.rondas.length - 1].mesas;
  const primera = rv.t.rondas[rv.t.rondas.length - 2].mesas[0];
  ok(rv.t.rondas.length === 7 && ultima.length === 1 && ultima[0].llave === "F" && ultima[0].fase === 2 && ultima[0].b === primera.n && ultima[0].n === primera.b,
    "si la final la gana el que viene de perdedores, se juega la revancha entre los mismos dos, con los colores cambiados", JSON.stringify(ultima));
  ok(T.campeonEliminacion(rv.t) === "s1" && rv.derrotas.get("s1") === 1 && rv.derrotas.get("s2") === 2, "y la revancha decide: el campeón termina con una derrota y el otro con dos");
  const sinRv = jugar(8, favorito);
  ok(sinRv.t.rondas.length === 6, "si la gana el de ganadores, no hay revancha");

  // Lo que va quedando a medio torneo, las tablas y lo que se publica.
  const medio = torneo(8, { sistema: "eliminacion", dobleEliminacion: true });
  const R1 = T.rondaFija(medio, 0);
  R1.mesas.forEach((m) => { m.r = "="; });
  medio.rondas.push(R1);
  let pendiente = false;
  try { T.rondaFija(medio, 1); } catch (e) { pendiente = true; }
  ok(pendiente && !T.rondaCompleta(R1), "unas tablas sin quién pasó no cierran la ronda ni dejan emparejar la siguiente");
  R1.mesas.forEach((m) => { m.pasa = favorito(m); m.desempate = "Armagedón"; });
  const R2 = T.rondaFija(medio, 1);
  ok(R2.mesas.filter((m) => m.llave === "G").length === 2 && R2.mesas.filter((m) => m.llave === "P").length === 2 && R2.mesas.every((m) => m.ko && m.fase >= 1),
    "la ronda 2 trae las dos llaves: los que ganaron siguen en ganadores y los que perdieron juegan en perdedores", JSON.stringify(R2.mesas.map((m) => m.llave + m.fase)));
  const enP = new Set(R2.mesas.filter((m) => m.llave === "P").flatMap((m) => [m.b, m.n]));
  ok(R1.mesas.every((m) => enP.has(m.pasa === m.b ? m.n : m.b)), "quien perdió el desempate en la mesa baja a perdedores");
  medio.rondas.push(R2);
  const alc = T.alcanceEliminacion(medio);
  ok([...alc.values()].every((x) => x === T.EN_CARRERA) && T.campeonEliminacion(medio) === undefined, "a medio torneo nadie es campeón todavía y los que siguen van juntos arriba");
  ok(T.fasesDeRonda(medio, 1).join() === "G2,P1" && T.fasesDeRonda(medio, 5).join() === "F1", "cada ronda sabe qué fases trae");
  const pub = PP.datosPublicos(sinRv.t);
  ok(pub.dobleEliminacion === true && pub.tercerPuesto === false && pub.rondasTotales === 6 && pub.rondas[1].mesas.every((m) => m.ko && (m.llave === "G" || m.llave === "P") && m.fase >= 1)
    && pub.rondas[5].mesas[0].deP === "s2", "se publica con la llave y la fase de cada mesa, y quién llegó a la final desde perdedores", JSON.stringify(pub.rondas[5].mesas[0]));
  const trf = T.aTrf(sinRv.t, {});
  ok(/^092 Individual: Double Knockout/m.test(trf) && T.deTrf(trf).dobleEliminacion === true, "el TRF dice «Double Knockout» y se vuelve a leer como doble eliminación");
  // Un «--» en ganadores: los dos quedan fuera y nadie baja.
  const dd = torneo(4, { sistema: "eliminacion", dobleEliminacion: true });
  const d1 = T.rondaFija(dd, 0); d1.mesas[0].r = "--"; d1.mesas[1].r = "1-0"; dd.rondas.push(d1);
  const d2 = T.rondaFija(dd, 1);
  ok(d2.mesas.every((m) => m.n === null), "si en una mesa no se presenta ninguno, quedan fuera los dos y los del otro lado pasan sin jugar", JSON.stringify(d2.mesas));

  console.log("\n=== El tercer puesto ===");
  const tp = torneo(8, { sistema: "eliminacion", tercerPuesto: true });
  for (let r = 0; r < 3; r++) { const R = T.rondaFija(tp, r); R.mesas.forEach((m) => { if (m.n !== null) m.r = favorito(m) === m.b ? "1-0" : "0-1"; }); tp.rondas.push(R); }
  const fin = tp.rondas[2].mesas;
  ok(T.rondasDelTorneo(tp) === 3 && fin.length === 2 && fin.filter((m) => m.tercer).length === 1 && [fin.find((m) => m.tercer).b, fin.find((m) => m.tercer).n].sort().join() === "s3,s4",
    "en la ronda de la final juegan también los dos que perdieron la semifinal", JSON.stringify(fin));
  const ct = D.clasificacion(tp, []);
  ok(ct.slice(0, 4).map((f) => f.id + ":" + f.puesto).join() === "s1:1,s2:2,s3:3,s4:4" && ct[4].puesto === 5, "y el 3.º y el 4.º dejan de compartir puesto (los de cuartos siguen compartiendo el 5.º)", ct.slice(0, 5).map((f) => f.id + ":" + f.puesto).join());
  ok(T.campeonEliminacion(tp) === "s1", "el campeón sale de la final, no del partido por el tercer puesto");
  const sin = torneo(8, { sistema: "eliminacion" });
  for (let r = 0; r < 3; r++) { const R = T.rondaFija(sin, r); R.mesas.forEach((m) => { if (m.n !== null) m.r = favorito(m) === m.b ? "1-0" : "0-1"; }); sin.rondas.push(R); }
  const cs = D.clasificacion(sin, []);
  ok(sin.rondas[2].mesas.length === 1 && cs[2].puesto === 3 && cs[3].puesto === 3, "sin la casilla, todo sigue como antes: una sola mesa en la final y el 3.º compartido");
  ok(PP.datosPublicos(tp).tercerPuesto === true && PP.datosPublicos(tp).rondas[2].mesas.some((m) => m.tercer === true), "y se publica con su marca");
}

async function pruebaPagina(browser) {
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE);
  const lista = (n) => ["Ana;;2000", "Beto;;1900", "Caro;;1800", "Dani;;1700", "Eva;;1600", "Fede;;1500", "Gabi;;1400", "Hugo;;1300"].slice(0, n).join("\n");
  async function armar(nombre, sistema, n) {
    await page.click('[data-ficha="torneo"]');
    await page.fill('#pi-form-torneo [name="nombre"]', nombre);
    await page.check('#pi-form-torneo input[name="sistema"][value="' + sistema + '"]');
  }
  async function jugadores(n) {
    await page.click('[data-ficha="jugadores"]');
    await page.click("#pi-pegar-caja summary");
    await page.fill("#pi-pegar", lista(n));
    await page.click("#pi-pegar-agregar");
    await page.click('[data-ficha="rondas"]');
  }

  // --- Keizer ---
  await armar("PRUEBA Keizer", "keizer");
  ok(await P.vis(page, "#pi-campo-rondas") && !(await P.vis(page, "#pi-campo-baku")) && !(await P.vis(page, "#pi-campo-doble-elim")) && !(await P.vis(page, "#pi-campo-tercer")),
    "con Keizer hay «Número de rondas», y no la aceleración ni las casillas de la eliminación");
  await page.fill('#pi-form-torneo [name="rondasTotales"]', "3");
  await page.dispatchEvent('#pi-form-torneo [name="rondasTotales"]', "change");
  await jugadores(5);
  ok(/Sistema Keizer/.test(await page.textContent("#pi-ronda")), "antes de emparejar explica cómo funciona");
  const rotulos = await page.locator("#pi-ronda select option").allTextContents();
  ok(rotulos.some((x) => /35 %/.test(x)) && rotulos.some((x) => /70 %/.test(x)) && rotulos.some((x) => /50 %/.test(x)), "y cada forma de no venir dice cuánto suma", rotulos.slice(0, 4).join(" | "));
  await page.click("#pi-emparejar");
  await page.waitForSelector("#pi-ronda table");
  let k1 = (await P.leerTodos(page)).find((x) => x.nombre === "PRUEBA Keizer");
  ok(k1.sistema === "keizer" && k1.rondas.length === 1 && k1.rondas[0].mesas.length === 3 && k1.rondas[0].mesas[2].n === null && k1.desempates[0] === "KZ",
    "la ronda 1 sale sin pasar por el motor: dos mesas, el último libre, y los puntos Keizer primeros en la lista", JSON.stringify(k1.rondas[0].mesas));
  await P.anotar(page, "1-0");
  await P.jugarRondas(page, "1-0");
  k1 = (await P.leerTodos(page)).find((x) => x.nombre === "PRUEBA Keizer");
  ok(k1.rondas.length === 3 && k1.rondas.every((R) => R.mesas.filter((m) => m.n === null).length === 1), "se juegan las tres rondas, con un libre en cada una", k1.rondas.length + " rondas");
  ok(new Set(k1.rondas.map((R) => R.mesas.find((m) => m.n === null).b)).size === 3, "y el libre no le toca dos veces al mismo");
  await page.click('[data-ficha="clasificacion"]');
  const cab = (await page.locator("#pi-tabla-clas thead th").allTextContents()).map((x) => x.trim());
  const esperado = T.puntuarKeizer(k1);
  const primero = await page.textContent("#pi-tabla-clas tbody tr:first-child td:nth-child(3)");
  const nombreDe = (id) => k1.jugadores.find((j) => j.id === id).nombre;
  ok(cab.includes("KZ") && cab.includes("KV") && primero.trim().startsWith(nombreDe(esperado.orden[0])), "la clasificación trae las columnas KZ y KV y arriba va quien manda en el Keizer", cab.join(",") + " · " + primero);
  ok(!(await P.vis(page, "#pi-clas-cuadro")), "sin cuadro: no es una eliminación");
  ok(errores.length === 0, "sin errores de JavaScript en la página", errores.join(" | "));
  await ctx.close();

  // --- Doble eliminación ---
  await armarDoble(browser, lista);
}

// La doble eliminación, en una página limpia (otro navegador, otro torneo).
async function armarDoble(browser, lista) {
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE);
  const armar = async (nombre, sistema) => {
    await page.click('[data-ficha="torneo"]');
    await page.fill('#pi-form-torneo [name="nombre"]', nombre);
    await page.check('#pi-form-torneo input[name="sistema"][value="' + sistema + '"]');
  };
  const jugadores = async (n) => {
    await page.click('[data-ficha="jugadores"]');
    await page.click("#pi-pegar-caja summary");
    await page.fill("#pi-pegar", lista(n));
    await page.click("#pi-pegar-agregar");
    await page.click('[data-ficha="rondas"]');
  };
  await armar("PRUEBA Doble", "eliminacion");
  ok(await P.vis(page, "#pi-campo-doble-elim") && await P.vis(page, "#pi-campo-tercer"), "con eliminación directa aparecen las dos casillas");
  await page.check('#pi-form-torneo input[name="dobleEliminacion"]');
  ok(!(await P.vis(page, "#pi-campo-tercer")), "con doble eliminación no se ofrece el tercer puesto (sale solo de la llave de perdedores)");
  await jugadores(4);
  ok(/doble eliminación/.test(await page.textContent("#pi-ronda")), "antes de emparejar explica la doble eliminación");
  await P.jugarRondas(page, "1-0");
  const dobleT = (await P.leerTodos(page)).find((x) => x.nombre === "PRUEBA Doble");
  ok(dobleT.dobleEliminacion === true && dobleT.rondas.length >= 4 && dobleT.rondas[1].mesas.some((m) => m.llave === "P") && dobleT.rondas[dobleT.rondas.length - 1].mesas[0].llave === "F",
    "se juega entera: la llave de perdedores desde la ronda 2 y la final al terminar", dobleT.rondas.map((R) => R.mesas.map((m) => (m.llave || "?") + (m.fase || "")).join("+")).join(" / "));
  ok(T.campeonEliminacion(dobleT) !== undefined && T.rondasDelTorneo(dobleT) === dobleT.rondas.length, "y termina con un campeón (con revancha si hizo falta)");
  const llaves = await page.locator("#pi-ronda [data-llave]").allTextContents();
  ok(llaves.length > 0 && llaves.every((x) => x.trim().length > 0), "cada mesa dice de qué llave es, escrito", llaves.join(" | "));
  await page.click('[data-ficha="clasificacion"]');
  const cuadro = await page.textContent("#pi-clas-cuadro");
  ok(/Campeón: /.test(cuadro) && /Ganadores, ronda 1/.test(cuadro) && /Perdedores, ronda 1/.test(cuadro) && /Final/.test(cuadro), "la clasificación trae el cuadro con las dos llaves y el campeón, escrito", cuadro.slice(0, 200));
  const puestos = (await page.locator("#pi-tabla-clas tbody tr td:first-child").allTextContents()).map((x) => x.trim());
  ok(puestos.join() === "1,2,3,4", "y los cuatro puestos, cada uno solo", puestos.join());
  ok(errores.length === 0, "sin errores de JavaScript en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  logicaKeizer();
  logicaDoble();
  const browser = await chromium.launch({ executablePath: require("fs").existsSync(CHROME) ? CHROME : undefined });
  try { console.log("\n=== La página ==="); await pruebaPagina(browser); }
  catch (e) { mal("la página: " + e.message); }
  finally { await browser.close(); }
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\n✓ Todo bien");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
