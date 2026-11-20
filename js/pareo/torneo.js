/* ===== Pareo Integral — el torneo, sus puntos y el archivo TRF =====
 *
 * Lógica pura (sin DOM): la usan pareo.html y los verificadores en Node.
 * Quien EMPAREJA un suizo no es este archivo sino bbpPairings (js/pareo/motor.js):
 * acá se arma el TRF que se le pasa y se lee lo que devuelve. Ver «Pareo
 * Integral» en docs/decisiones/juegos-y-torneos.md.
 *
 * El torneo es un objeto plano, que se guarda tal cual en el navegador y en el
 * archivo .json que baja quien organiza:
 *
 *   { formato: 1, nombre, ciudad, federacion, fechaInicio, fechaFin, arbitro,
 *     arbitroAdjunto, ritmo,
 *     sistema: "suizo" | "todos" | "scheveningen" | "eliminacion" | "keizer",
 *     dobleEliminacion, tercerPuesto (en la eliminación directa),
 *     dobleVuelta (en todos contra todos y en Scheveningen),
 *     rondasTotales, colorInicial: "w" | "b", baku (aceleración Baku),
 *     puntos: { victoria, tablas, derrota, bye },     bye = el que asigna el pareo
 *     desempates: ["BH-C1", "BH", "SB", …]            ver js/pareo/desempates.js
 *     jugadores: [{ id, nombre, sexo, titulo, elo, fed, fideId, nacimiento,
 *                   retiradoDespuesDe, retiroAuto, vuelveTras }],
 *       (retiroAuto y vuelveTras: el retiro por incomparecencia, ver
 *       retirosPorIncomparecencia)
 *     numeracion: [id…]   los números de emparejamiento, fijos desde la ronda 1
 *     rondas: [{ mesas: [{ b, n, r }], ausencias: { id: "H" | "Z" | "F" } }] }
 *
 * Una mesa es { b: id de blancas, n: id de negras o null (bye del pareo),
 * r: resultado }. Los resultados, escritos desde las blancas:
 *   "1-0" "0-1" "="       partida jugada
 *   "+-" "-+"             incomparecencia (gana el que vino)
 *   "--"                  no vino ninguno
 *   null                  todavía sin resultado
 * Las ausencias de una ronda (se piden ANTES de emparejarla): "H" medio punto,
 * "Z" cero, "F" punto entero. Quien está retirado o todavía no se había
 * inscrito cuenta como "Z" sin escribirlo.
 */
(function (raiz) {
  "use strict";

  const PUNTOS_FIDE = { victoria: 1, tablas: 0.5, derrota: 0, bye: 1 };
  // C.04.2: el orden inicial es por Elo, después por título y después por nombre.
  const TITULOS = ["GM", "IM", "WGM", "FM", "WIM", "CM", "WFM", "WCM"];

  function nuevo(datos) {
    const t = Object.assign({
      formato: 1,
      nombre: "", ciudad: "", federacion: "", fechaInicio: "", fechaFin: "",
      arbitro: "", arbitroAdjunto: "", ritmo: "",
      sistema: "suizo", dobleVuelta: false, rondasTotales: 7,
      colorInicial: "w", baku: false,
      puntos: Object.assign({}, PUNTOS_FIDE),
      desempates: ["BH-C1", "BH", "SB", "DE", "WIN"],
      jugadores: [], numeracion: null, rondas: [],
    }, datos || {});
    // Los códigos de desempate de antes de 2026 (GE → REP), al día al abrir.
    if (Array.isArray(t.desempates)) {
      const D = typeof module !== "undefined" && module.exports ? require("./desempates.js") : raiz.PareoDesempates;
      if (D && D.codigosAlDia) t.desempates = D.codigosAlDia(t.desempates);
    }
    return t;
  }

  function pesoTitulo(t) {
    const i = TITULOS.indexOf(String(t || "").toUpperCase());
    return i < 0 ? TITULOS.length : i;
  }

  function porCriterio(t) {
    return (a, b) =>
      (Number(b.elo) || 0) - (Number(a.elo) || 0) ||
      pesoTitulo(a.titulo) - pesoTitulo(b.titulo) ||
      String(a.nombre).localeCompare(String(b.nombre), "es", { sensitivity: "base" }) ||
      String(a.id).localeCompare(String(b.id));
  }

  // El orden inicial (los números de emparejamiento): Elo, título, nombre.
  // Queda FIJO en `numeracion` al emparejar la ronda 1 (o al importar un TRF,
  // que trae la suya). Quien se inscribe tarde se intercala donde le toca por
  // el mismo criterio, sin cambiar el orden de los demás entre sí (C.04.2
  // permite volver a numerar); el historial va por id, así que nada se pierde.
  function ordenInicial(t) {
    const cmp = porCriterio(t);
    const porId = new Map(t.jugadores.map((j) => [j.id, j]));
    if (!Array.isArray(t.numeracion)) return t.jugadores.slice().sort(cmp).map((j) => j.id);
    const orden = t.numeracion.filter((id) => porId.has(id));
    const tardios = t.jugadores.filter((j) => !orden.includes(j.id)).sort(cmp);
    for (const j of tardios) {
      let i = fijo(t) ? orden.length : orden.findIndex((id) => cmp(j, porId.get(id)) < 0);
      if (i < 0) i = orden.length;
      orden.splice(i, 0, j.id);
    }
    return orden;
  }

  function fijarNumeracion(t) {
    t.numeracion = ordenInicial(t);
    return t.numeracion;
  }

  // Todos contra todos: los números se sortean (C.05) antes de la ronda 1.
  function sortearNumeracion(t, azar) {
    const a = ordenInicial(t);
    const rnd = azar || Math.random;
    for (let i = a.length - 1; i > 0; i--) {
      const k = Math.floor(rnd() * (i + 1));
      [a[i], a[k]] = [a[k], a[i]];
    }
    t.numeracion = a;
    return a;
  }

  // El color del n.º 1 en la ronda 1, a cara o sello.
  const sortearColor = (azar) => ((azar || Math.random)() < 0.5 ? "w" : "b");

  function numeros(t) {
    const m = new Map();
    ordenInicial(t).forEach((id, i) => m.set(id, i + 1));
    return m;
  }

  // Lo que le pasó a cada jugador en una ronda:
  //   { tipo: "partida" | "incomparecencia" | "bye" | "ausente",
  //     rival, color: "w" | "b" | null, puntos, codigo }
  // codigo es el de la columna de resultado del TRF: 1 = 0 + - U H Z F.
  function situacion(t, ronda, id) {
    const R = t.rondas[ronda];
    const p = t.puntos;
    for (const m of R.mesas) {
      if (m.n === null && m.b === id) return { tipo: "bye", rival: null, color: null, puntos: p.bye, codigo: "U" };
      if (m.b !== id && m.n !== id) continue;
      const blancas = m.b === id;
      const rival = blancas ? m.n : m.b;
      const color = blancas ? "w" : "b";
      if (!m.r) return { tipo: "pendiente", rival, color, puntos: 0, codigo: null };
      if (m.r === "=") return { tipo: "partida", rival, color, puntos: p.tablas, codigo: "=" };
      if (m.r === "1-0" || m.r === "0-1") {
        const gana = (m.r === "1-0") === blancas;
        return { tipo: "partida", rival, color, puntos: gana ? p.victoria : p.derrota, codigo: gana ? "1" : "0" };
      }
      // Incomparecencias: "+-" gana blancas, "-+" gana negras, "--" ninguno.
      const gana = (m.r === "+-" && blancas) || (m.r === "-+" && !blancas);
      return { tipo: "incomparecencia", rival, color, puntos: gana ? p.victoria : 0, codigo: gana ? "+" : "-" };
    }
    const a = (R.ausencias || {})[id] || "Z";
    return { tipo: "ausente", rival: null, color: null, codigo: a,
      puntos: a === "H" ? p.tablas : a === "F" ? p.victoria : 0 };
  }

  function puntosHasta(t, id, hasta) {
    let s = 0;
    for (let r = 0; r < Math.min(hasta, t.rondas.length); r++) s += situacion(t, r, id).puntos;
    return s;
  }

  const puntos = (t, id) => puntosHasta(t, id, t.rondas.length);

  // En la eliminación directa, unas tablas sin el desempate no cierran la mesa.
  function rondaCompleta(R) {
    return R.mesas.every((m) => m.n === null || (!!m.r && !(m.ko && m.r === "=" && m.pasa !== m.b && m.pasa !== m.n)));
  }

  // Quién juega la ronda que viene: los que no están retirados ni pidieron bye.
  function participantes(t, ronda, ausencias) {
    return ordenInicial(t).filter((id) => {
      const j = t.jugadores.find((x) => x.id === id);
      if (j.retiradoDespuesDe != null && ronda >= j.retiradoDespuesDe) return false;
      return !(ausencias && ausencias[id]);
    });
  }

  // Quien pierde por incomparecencia («+-», «-+» o «--») en la última ronda
  // queda fuera de las que siguen (Leyes del Ajedrez, art. 6.7 y la práctica
  // de FIDE: el que no se presenta sin avisar se retira), hasta que el árbitro
  // lo vuelva a poner. Se marca `retiroAuto` (la ronda desde la que no juega)
  // para distinguirlo de un retiro a mano: si el resultado se corrige, el
  // retiro automático se deshace; y si el árbitro lo devuelve (`vuelveTras`,
  // la ronda de la incomparecencia), esa misma no lo vuelve a sacar.
  // Muta el torneo; devuelve { fuera: [id…], vuelven: [id…] }.
  function retirosPorIncomparecencia(t) {
    const fuera = [], vuelven = [];
    const L = t.rondas.length - 1;
    if (L < 0) return { fuera, vuelven };
    const pierde = new Set();
    for (const m of t.rondas[L].mesas) {
      if (m.n == null) continue;
      if (m.r === "-+" || m.r === "--") pierde.add(m.b);
      if (m.r === "+-" || m.r === "--") pierde.add(m.n);
    }
    for (const j of t.jugadores) {
      if (pierde.has(j.id)) {
        if (j.retiradoDespuesDe == null && j.vuelveTras !== L) { j.retiradoDespuesDe = L + 1; j.retiroAuto = L + 1; fuera.push(j.id); }
      } else if (j.retiroAuto === L + 1 && j.retiradoDespuesDe === L + 1) {
        j.retiradoDespuesDe = null;
        delete j.retiroAuto;
        vuelven.push(j.id);
      }
    }
    return { fuera, vuelven };
  }

  // ---------- Todos contra todos: las tablas de Berger (C.05, Anexo 1) ----------
  // Con n par (con impar se agrega un «libre» como n), en la ronda r el n juega
  // con el (k+1), k = (r-1)·n/2 mod (n-1): con negras en las rondas impares y con
  // blancas en las pares. Los demás se emparejan simétricos alrededor de k.
  function berger(n, r) {
    const m = n - 1;
    const k = ((r - 1) * (n / 2)) % m;
    const mesas = [r % 2 === 1 ? [k + 1, n] : [n, k + 1]];
    for (let i = 1; i < n / 2; i++) mesas.push([((k + i) % m) + 1, ((k - i + m) % m) + 1]);
    return mesas;
  }

  function rondaTodos(t, ronda) {
    const orden = ordenInicial(t);
    const n = orden.length % 2 ? orden.length + 1 : orden.length;
    const vuelta = Math.floor(ronda / (n - 1));
    const mesas = [];
    const ausencias = {};
    for (let [a, b] of berger(n, (ronda % (n - 1)) + 1)) {
      if (vuelta % 2 === 1) [a, b] = [b, a];
      const A = orden[a - 1], B = orden[b - 1];
      if (A === undefined || B === undefined) ausencias[A === undefined ? B : A] = "Z";
      else mesas.push({ b: A, n: B, r: null });
    }
    return { mesas, ausencias };
  }

  function rondasTodos(t) {
    const n = t.jugadores.length % 2 ? t.jugadores.length + 1 : t.jugadores.length;
    return (n - 1) * (t.dobleVuelta ? 2 : 1);
  }

  // ---------- Scheveningen: dos equipos, cada uno contra todos los del otro ----------
  // Los equipos son las dos instituciones de los jugadores, y cada equipo va
  // en su orden inicial (Elo, título, nombre): ese es su orden de tableros. El
  // equipo A es el del n.º 1. En la ronda r, el tablero i es A[i] contra
  // B[(i + r) mod n]: en n rondas, cada uno juega una vez con cada rival.
  //
  // Los colores salen de COLORES_SCHEVENINGEN, no de una fórmula: con ese giro
  // ninguna fórmula simple deja a los dos equipos parejos (con n par, el
  // jugador de B llevaría siempre el mismo color). Las tablas se buscaron por
  // fuerza bruta: cada jugador, de A y de B, termina con tantas blancas como
  // negras (con n impar, a lo sumo una de diferencia) y nunca lleva el mismo
  // color tres rondas seguidas. Con n par, cada equipo lleva blancas en la
  // mitad de los tableros de cada ronda, salvo con 2, 6 y 10 (n/2 impar), donde
  // eso no se puede sin desparejar a alguien y una ronda lleva una de más.
  // verificar-pareo-scheveningen.js lo comprueba todo. Fila = ronda, letra i =
  // color de A[i] (B blancas, N negras).
  const COLORES_SCHEVENINGEN = {
    1: ["B"],
    2: ["BB", "NN"],
    3: ["BNB", "NBN", "NNB"],
    4: ["BNBN", "NBNB", "NBNB", "BNBN"],
    5: ["BNBNB", "NBNBN", "NBNNB", "BNBBN", "BNNBN"],
    6: ["BNBNBB", "NBNBNN", "NBNNBB", "BNBBNB", "BBNBNN", "NNBNBN"],
    7: ["BNBNBNB", "NBNBNBN", "NBNBNNB", "BNBNBBN", "BNBNNBN", "NBNBNNB", "NBBNBNB"],
    8: ["BNBNBNBN", "NBNBNBNB", "NBNBNBNB", "BNBNBNBN", "BNBNBNBN", "NBNBNBNB", "NBNBNBNB", "BNBNBNBN"],
    9: ["BNBNBNBNB", "NBNBNBNBN", "NBNBNBNNB", "BNBNBNBBN", "BNBNBNNBN", "NBNBNBNNB", "NBNBNBBNB", "BNBNBNBBN", "BNBNBNNBN"],
    10: ["BNBNBNBNBN", "NBNBNBBBNN", "NBNBNNNBBB", "BNBNBBNNNB", "BNBBNNBBNN", "NBNNBBNBBB", "NBBBNBNNNB", "BNNBBNBBBN", "NBNNBBNNBN", "BNBNNNBNNB"],
    11: ["BNBNBNBNBNB", "NBNBNBNBNBN", "NBNBNBNBNNB", "BNBNBNBNBBN", "BNBNBNBNNBN", "NBNBNBNBNNB", "NBNBNBBNBNB", "BNBNBNBBNBN", "BNBNBNNBNBN", "NBNBNBNNBNB", "NBNBBNBNBNB"],
    12: ["BNBNBNBNBNBN", "NBNBNBNBNBNB", "NBNBNBNBNBNB", "BNBNBNBNBNBN", "BNBNBNBNBNBN", "NBNBNBNBNBNB", "NBNBNBNBNBNB", "BNBNBNBNBNBN", "BNBNBNBNBNBN", "NBNBNBNBNBNB", "NBNBNBNBNBNB", "BNBNBNBNBNBN"],
  };
  const MAX_SCHEVENINGEN = 12;

  // Las dos instituciones se comparan sin tildes, sin mayúsculas y sin
  // espacios de más: «Liceo  de Costa Rica» y «liceo de costa rica» son la misma.
  const claveEquipo = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

  // { a: { nombre, ids }, b: { nombre, ids }, n } o { error, … } si no se puede.
  function equiposScheveningen(t) {
    const orden = ordenInicial(t);
    const porId = new Map(t.jugadores.map((j) => [j.id, j]));
    const sin = orden.filter((id) => !claveEquipo(porId.get(id).institucion));
    if (sin.length) return { error: "sinEquipo", ids: sin };
    const grupos = new Map();
    for (const id of orden) {
      const j = porId.get(id);
      const k = claveEquipo(j.institucion);
      if (!grupos.has(k)) grupos.set(k, { nombre: String(j.institucion).trim(), ids: [] });
      grupos.get(k).ids.push(id);
    }
    const lista = [...grupos.values()];
    if (lista.length !== 2) return { error: "dosEquipos", cuantos: lista.length, nombres: lista.map((g) => g.nombre) };
    const [a, b] = lista;
    if (a.ids.length !== b.ids.length) return { error: "mismoNumero", a, b };
    if (a.ids.length > MAX_SCHEVENINGEN) return { error: "muchos", a, b, max: MAX_SCHEVENINGEN };
    return { a, b, n: a.ids.length };
  }

  function rondasScheveningen(t) {
    const e = equiposScheveningen(t);
    const n = e.error ? Math.ceil(t.jugadores.length / 2) : e.n;
    return n * (t.dobleVuelta ? 2 : 1);
  }

  function rondaScheveningen(t, ronda) {
    const e = equiposScheveningen(t);
    if (e.error) { const x = new Error(e.error); x.detalle = e; throw x; }
    const n = e.n;
    const r = ronda % n;
    // En la segunda vuelta, los mismos encuentros con los colores al revés.
    const vuelta = Math.floor(ronda / n) % 2 === 1;
    const alReves = vuelta !== (t.colorInicial === "b");
    const mesas = [];
    for (let i = 0; i < n; i++) {
      const A = e.a.ids[i], B = e.b.ids[(i + r) % n];
      const aBlancas = (COLORES_SCHEVENINGEN[n][r][i] === "B") !== alReves;
      mesas.push(aBlancas ? { b: A, n: B, r: null } : { b: B, n: A, r: null });
    }
    return { mesas, ausencias: {} };
  }

  // Cuánto lleva cada equipo: los puntos de cada ronda y el total (con los
  // puntos del torneo: victoria, tablas, derrota).
  function marcadorScheveningen(t, hastaRonda) {
    const e = equiposScheveningen(t);
    if (e.error) return null;
    const deA = new Set(e.a.ids);
    const p = t.puntos;
    const hasta = hastaRonda == null ? t.rondas.length : hastaRonda;
    const valor = (r, blancas) => {
      switch (r) {
        case "1-0": case "+-": return blancas ? p.victoria : p.derrota;
        case "0-1": case "-+": return blancas ? p.derrota : p.victoria;
        case "=": return p.tablas;
        case "--": return p.derrota;
        default: return null;
      }
    };
    const rondas = [];
    let totalA = 0, totalB = 0;
    for (let k = 0; k < hasta; k++) {
      let a = 0, b = 0, faltan = 0;
      for (const m of t.rondas[k].mesas) {
        if (m.n == null) continue;
        const vb = valor(m.r, true), vn = valor(m.r, false);
        if (vb == null) { faltan++; continue; }
        if (deA.has(m.b)) { a += vb; b += vn; } else { a += vn; b += vb; }
      }
      rondas.push({ a, b, faltan });
      totalA += a; totalB += b;
    }
    return { a: e.a.nombre, b: e.b.nombre, n: e.n, rondas, totalA, totalB };
  }

  // ---------- Eliminación directa: el cuadro ----------
  // Las semillas son el orden inicial (Elo, título, nombre) y van en el cuadro
  // de siempre: el 1 y el 2 solo se cruzan en la final, el 1 y el 4 en
  // semifinales, y así. Si no son potencia de dos, los primeros pasan la
  // ronda 1 con un bye. Cada mesa lleva su lugar en el cuadro (`slot`): la
  // ronda que sigue cruza a los ganadores de los lugares 2k y 2k + 1.
  //
  // Una partida en tablas no deja pasar a nadie: el desempate (un blitz, un
  // Armagedón) se juega ahí mismo y la mesa guarda quién pasó (`pasa`) y
  // cómo (`desempate`, el formato). El resultado de la partida queda «=»:
  // es el que va al TRF y al Elo. Sin `pasa`, la ronda no está completa.
  function semillasCuadro(tam) {
    let a = [1, 2];
    while (a.length < tam) {
      const n = a.length * 2 + 1;
      a = a.flatMap((x) => [x, n - x]);
    }
    return a.slice(0, tam);
  }
  const tamCuadro = (n) => { let k = 1; while (k < n) k *= 2; return Math.max(2, k); };
  function rondasEliminacion(t) {
    let r = 0;
    for (let k = tamCuadro(t.jugadores.length); k > 1; k /= 2) r++;
    if (!t.dobleEliminacion) return r;
    const plan = planDoble(r);
    return plan.length + (hayRevancha(t, plan.length) ? 1 : 0);
  }

  // ---------- Doble eliminación: nadie queda fuera con una sola derrota ----------
  // Dos llaves: la de ganadores («G», el cuadro de siempre) y la de
  // perdedores («P»), a la que baja quien pierde en la de ganadores. Quien
  // pierde en la de perdedores queda fuera. La final («F») la juegan el
  // campeón de cada llave; si la gana el que viene de perdedores, los dos
  // llevan una derrota y se juega la revancha, que decide.
  //
  // Cada mesa lleva su llave, su fase (la ronda DENTRO de la llave) y su
  // lugar: { llave: "G" | "P" | "F", fase, slot }. Qué fases se juegan en
  // cada ronda del torneo lo dice planDoble(k), con k = log2 del cuadro:
  //   ronda 1: G1 · ronda 2: G2 y P1 · ronda 3: P2 · ronda 4: G3 y P3 ·
  //   ronda 5: P4 · … · la última: F1 (y F2 si hace falta la revancha).
  // En la llave de perdedores, las fases impares cruzan a los que ya estaban
  // en ella y las pares les traen a los que acaban de perder en ganadores.
  function planDoble(k) {
    const plan = [[["G", 1]]];
    if (k >= 2) {
      plan.push([["G", 2], ["P", 1]], [["P", 2]]);
      for (let j = 3; j <= k; j++) plan.push([["G", j], ["P", 2 * j - 3]], [["P", 2 * j - 2]]);
    }
    plan.push([["F", 1]]);
    return plan;
  }
  const claveDoble = (llave, fase, slot) => llave + fase + ":" + slot;
  // Quién pierde una mesa: su id; null si nadie baja (un bye, o «--»);
  // undefined si todavía no se sabe.
  function perdedorDe(m) {
    if (m.n === null) return null;
    const g = pasaDe(m);
    return g === undefined ? undefined : g === null ? null : g === m.b ? m.n : m.b;
  }
  // Lo jugado hasta ahora, por lugar del cuadro: quién ganó y quién perdió.
  // Una mesa que no existe (no había nadie para jugarla) no está en el mapa.
  function estadoDoble(t, hasta) {
    const e = new Map();
    const R = hasta == null ? t.rondas.length : Math.min(hasta, t.rondas.length);
    for (let r = 0; r < R; r++) for (const m of t.rondas[r].mesas) {
      if (m.llave) e.set(claveDoble(m.llave, m.fase, m.slot), { gan: pasaDe(m), per: perdedorDe(m) });
    }
    return e;
  }
  // ¿Ganó la primera final el que venía de la llave de perdedores?
  function hayRevancha(t, rondasBase) {
    const R = t.rondas[rondasBase - 1];
    const f = R && R.mesas.find((m) => m.llave === "F" && m.fase === 1);
    if (!f || f.n === null) return false;
    const g = pasaDe(f);
    return !!g && g === f.deP;
  }
  function rondaDoble(t, ronda) {
    const orden = ordenInicial(t);
    const semilla = new Map(orden.map((id, i) => [id, i + 1]));
    const tam = tamCuadro(orden.length);
    let k = 0;
    for (let x = tam; x > 1; x /= 2) k++;
    const plan = planDoble(k);
    const alterna = (i) => (i % 2 === 0) === (t.colorInicial !== "b");
    const previa = t.rondas[ronda - 1];
    if (ronda > 0 && !previa) throw new Error("falta la ronda anterior");
    if (previa && !rondaCompleta(previa)) { const x = new Error("pendiente"); x.detalle = { error: "pendiente" }; throw x; }
    const e = estadoDoble(t, ronda);
    const de = (llave, fase, slot, cual) => { const x = e.get(claveDoble(llave, fase, slot)); return x ? x[cual] || null : null; };
    const blancas = new Map();
    for (let r = 0; r < ronda; r++) for (const m of t.rondas[r].mesas) if (m.n !== null) blancas.set(m.b, (blancas.get(m.b) || 0) + 1);
    const mesas = [];
    const pon = (A, B, extra, i) => {
      if (!A && !B) return;
      if (!A || !B) { mesas.push(Object.assign({ b: A || B, n: null, r: null, ko: true }, extra)); return; }
      const [alto, bajo] = semilla.get(A) < semilla.get(B) ? [A, B] : [B, A];
      const ba = blancas.get(alto) || 0, bb = blancas.get(bajo) || 0;
      const altoBlancas = ba !== bb ? ba < bb : alterna(i + ronda);
      mesas.push(Object.assign(altoBlancas ? { b: alto, n: bajo } : { b: bajo, n: alto }, { r: null, ko: true }, extra));
    };
    // La revancha: los mismos dos de la primera final, con los colores cambiados.
    if (ronda === plan.length) {
      const f = previa.mesas.find((m) => m.llave === "F" && m.fase === 1);
      if (!f || !hayRevancha(t, plan.length)) throw new Error("el torneo ya terminó");
      mesas.push({ b: f.n, n: f.b, r: null, ko: true, llave: "F", fase: 2, slot: 0, deP: f.deP });
      return { mesas, ausencias: {} };
    }
    if (ronda > plan.length) throw new Error("el torneo ya terminó");
    for (const [llave, fase] of plan[ronda]) {
      if (llave === "G" && fase === 1) {
        const s = semillasCuadro(tam);
        for (let i = 0; i < tam / 2; i++) pon(orden[s[2 * i] - 1], orden[s[2 * i + 1] - 1], { llave, fase, slot: i }, i);
      } else if (llave === "G") {
        const n = tam / Math.pow(2, fase);
        for (let i = 0; i < n; i++) pon(de("G", fase - 1, 2 * i, "gan"), de("G", fase - 1, 2 * i + 1, "gan"), { llave, fase, slot: i }, i);
      } else if (llave === "P" && fase === 1) {
        for (let i = 0; i < tam / 4; i++) pon(de("G", 1, 2 * i, "per"), de("G", 1, 2 * i + 1, "per"), { llave, fase, slot: i }, i);
      } else if (llave === "P" && fase % 2 === 0) {
        // Llegan los que acaban de perder en ganadores. En las fases 2, 6,
        // 10… entran en el orden contrario, para que no se repita enseguida
        // la partida de la ronda anterior.
        const i0 = fase / 2, n = tam / Math.pow(2, i0 + 1);
        for (let i = 0; i < n; i++) pon(de("P", fase - 1, i, "gan"), de("G", i0 + 1, i0 % 2 === 1 ? n - 1 - i : i, "per"), { llave, fase, slot: i }, i);
      } else if (llave === "P") {
        const n = tam / Math.pow(2, (fase + 1) / 2 + 1);
        for (let i = 0; i < n; i++) pon(de("P", fase - 1, 2 * i, "gan"), de("P", fase - 1, 2 * i + 1, "gan"), { llave, fase, slot: i }, i);
      } else {
        const deG = de("G", k, 0, "gan");
        const deP = k === 1 ? de("G", 1, 0, "per") : de("P", 2 * k - 2, 0, "gan");
        pon(deG, deP, { llave: "F", fase: 1, slot: 0, deP: deP || undefined }, 0);
      }
    }
    return { mesas, ausencias: {} };
  }
  // El nombre de una fase de la doble eliminación: la llave y su número, o
  // «final» y «revancha».
  function fasesDeRonda(t, ronda) {
    const R = t.rondas[ronda];
    if (R) return [...new Set(R.mesas.filter((m) => m.llave).map((m) => m.llave + m.fase))];
    let k = 0;
    for (let x = tamCuadro(t.jugadores.length); x > 1; x /= 2) k++;
    const plan = planDoble(k);
    return ronda < plan.length ? plan[ronda].map(([l, f]) => l + f) : ["F2"];
  }
  // Quién pasa de una mesa: su id; null si no pasa nadie («--»); undefined
  // si todavía no se sabe (sin resultado, o tablas sin el desempate).
  function pasaDe(m) {
    if (m.n === null) return m.b;
    switch (m.r) {
      case "1-0": case "+-": return m.b;
      case "0-1": case "-+": return m.n;
      case "--": return null;
      case "=": return m.pasa === m.b || m.pasa === m.n ? m.pasa : undefined;
      default: return undefined;
    }
  }
  function rondaEliminacion(t, ronda) {
    if (t.dobleEliminacion) return rondaDoble(t, ronda);
    const orden = ordenInicial(t);
    const semilla = new Map(orden.map((id, i) => [id, i + 1]));
    const tam = tamCuadro(orden.length);
    const alterna = (k) => (k % 2 === 0) === (t.colorInicial !== "b");
    const mesas = [];
    if (ronda === 0) {
      const s = semillasCuadro(tam);
      for (let k = 0; k < tam / 2; k++) {
        const A = orden[s[2 * k] - 1], B = orden[s[2 * k + 1] - 1];
        if (A === undefined && B === undefined) continue;
        if (A === undefined || B === undefined) { mesas.push({ b: A === undefined ? B : A, n: null, r: null, slot: k, ko: true }); continue; }
        mesas.push(alterna(k) ? { b: A, n: B, r: null, slot: k, ko: true } : { b: B, n: A, r: null, slot: k, ko: true });
      }
      return { mesas, ausencias: {} };
    }
    const previa = t.rondas[ronda - 1];
    if (!previa) throw new Error("falta la ronda anterior");
    const ganador = new Map();
    const perdedor = new Map();
    for (const m of previa.mesas) {
      const g = pasaDe(m);
      if (g === undefined) { const x = new Error("pendiente"); x.detalle = { error: "pendiente" }; throw x; }
      ganador.set(m.slot, g);
      perdedor.set(m.slot, perdedorDe(m));
    }
    // Cuántas blancas lleva cada uno: el que menos tiene, juega con blancas.
    const blancas = new Map();
    for (let r = 0; r < ronda; r++) for (const m of t.rondas[r].mesas) if (m.n !== null) blancas.set(m.b, (blancas.get(m.b) || 0) + 1);
    const lugares = tam / Math.pow(2, ronda + 1);
    for (let k = 0; k < lugares; k++) {
      const A = ganador.get(2 * k), B = ganador.get(2 * k + 1);
      if (!A && !B) continue;
      if (!A || !B) { mesas.push({ b: A || B, n: null, r: null, slot: k, ko: true }); continue; }
      const [alto, bajo] = semilla.get(A) < semilla.get(B) ? [A, B] : [B, A];
      const ba = blancas.get(alto) || 0, bb = blancas.get(bajo) || 0;
      const altoBlancas = ba !== bb ? ba < bb : alterna(k + ronda);
      mesas.push(altoBlancas ? { b: alto, n: bajo, r: null, slot: k, ko: true } : { b: bajo, n: alto, r: null, slot: k, ko: true });
    }
    // El partido por el tercer puesto: los dos que perdieron la semifinal, en
    // la misma ronda que la final. Si alguno pasó la semifinal sin jugar (o no
    // se presentó nadie), no hay partido.
    if (t.tercerPuesto && lugares === 1) {
      const A = perdedor.get(0), B = perdedor.get(1);
      if (A && B) {
        const [alto, bajo] = semilla.get(A) < semilla.get(B) ? [A, B] : [B, A];
        const ba = blancas.get(alto) || 0, bb = blancas.get(bajo) || 0;
        const altoBlancas = ba !== bb ? ba < bb : alterna(ronda + 1);
        mesas.push(Object.assign(altoBlancas ? { b: alto, n: bajo } : { b: bajo, n: alto }, { r: null, slot: 1, ko: true, tercer: true }));
      }
    }
    return { mesas, ausencias: {} };
  }
  // Hasta qué ronda llegó cada uno: cuántas pasó. El campeón pasó todas.
  // Con partido por el tercer puesto, ganarlo vale medio escalón: el 3.º y el
  // 4.º dejan de compartir puesto.
  // En la doble eliminación el número es otra cosa, pero se lee igual (más
  // es mejor, e iguales comparten puesto): la ronda en que quedó fuera; quien
  // sigue en carrera va por encima de todos los que ya salieron, y el campeón
  // por encima de todos.
  const EN_CARRERA = 1000, CAMPEON = 2000;
  function alcanceEliminacion(t, hasta) {
    const out = new Map(t.jugadores.map((j) => [j.id, 0]));
    const R = hasta == null ? t.rondas.length : Math.min(hasta, t.rondas.length);
    if (t.dobleEliminacion) {
      const derrotas = new Map(), fuera = new Map();
      const pierde = (id, r) => { derrotas.set(id, (derrotas.get(id) || 0) + 1); if (derrotas.get(id) >= 2 && !fuera.has(id)) fuera.set(id, r + 1); };
      for (let r = 0; r < R; r++) for (const m of t.rondas[r].mesas) {
        if (m.n === null) continue;
        const g = pasaDe(m);
        if (g === undefined) continue;
        // Si no se presentó ninguno, los dos quedan fuera ahí mismo.
        if (g === null) { for (const id of [m.b, m.n]) if (!fuera.has(id)) fuera.set(id, r + 1); continue; }
        pierde(g === m.b ? m.n : m.b, r);
      }
      const total = rondasEliminacion(t);
      const ultima = R === total && R > 0 ? t.rondas[R - 1] : null;
      const final = ultima && rondaCompleta(ultima) ? ultima.mesas.find((m) => m.llave === "F") : null;
      const campeon = final ? pasaDe(final) : undefined;
      for (const j of t.jugadores) {
        out.set(j.id, j.id === campeon ? CAMPEON : fuera.has(j.id) ? fuera.get(j.id) : R ? EN_CARRERA : 0);
      }
      return out;
    }
    for (let r = 0; r < R; r++) for (const m of t.rondas[r].mesas) {
      const g = pasaDe(m);
      if (g) out.set(g, (out.get(g) || 0) + (m.tercer ? 0.5 : 1));
    }
    return out;
  }
  // El campeón, cuando el torneo ya terminó (si no, undefined).
  function campeonEliminacion(t) {
    const total = rondasEliminacion(t);
    if (t.rondas.length !== total || !total) return undefined;
    const U = t.rondas[total - 1];
    const final = U.mesas.find((m) => (t.dobleEliminacion ? m.llave === "F" : !m.tercer && m.slot === 0));
    return final && rondaCompleta(U) ? pasaDe(final) || undefined : undefined;
  }
  // El nombre de una ronda del cuadro: final, semifinal, cuartos…
  function nombreRondaEliminacion(t, ronda) {
    const quedan = rondasEliminacion(t) - ronda;
    return ["final", "semifinal", "cuartos", "octavos"][quedan - 1] || "ronda";
  }

  // ---------- El Sistema Keizer ----------
  //
  // Es el sistema de los torneos de club de toda la temporada, donde no todos
  // vienen todas las noches: juega quien vino, y nadie queda fuera por faltar.
  //
  // - Cada jugador VALE según su puesto: el primero vale tantos puntos como
  //   jugadores hay, el segundo uno menos… y el último vale 1.
  // - Ganarle a alguien da su valor; unas tablas, la mitad; perder, nada. Y
  //   cada uno suma, una sola vez, su propio valor.
  // - Quien queda libre por ser impares suma la mitad de SU valor, igual que
  //   quien pide medio punto; quien falta, el 35 % (hasta 5 faltas: de la sexta
  //   en adelante, nada); quien falta por jugar para el club, el 70 %.
  // - Después de cada ronda se vuelve a ordenar a todos, cada uno pasa a valer
  //   lo de su nuevo puesto y TODAS las rondas se cuentan otra vez con los
  //   valores nuevos. Se repite hasta que el orden deja de cambiar.
  // - Se empareja de arriba abajo: el 1 con el 2, el 3 con el 4… sin repetir un
  //   rival de las últimas tres rondas (si no hay otra forma, se afloja).
  //
  // Los valores por omisión son los de la librería chesspairing (la misma con
  // la que se comparan los desempates del C.07), con una diferencia a
  // propósito: el libre va al último que menos veces quedó libre, no siempre
  // al último, para que a nadie le toque dos veces antes que a todos una.
  //
  // Todo se cuenta en vigésimos de punto (1, ½, 0,35 y 0,7 son enteros en
  // vigésimos): así dos totales iguales son iguales, sin decimales que bailen.

  const VEINTE = 20; // un punto, en vigésimos
  const REGLAS_KEIZER = {
    victoria: 20, tablas: 10, derrota: 0,   // del valor del RIVAL
    libre: 10, medio: 10,                   // del valor PROPIO
    falta: 7, club: 14,
    topeFaltas: 5,
    sinRepetir: 3,                          // rondas sin volver a jugar con el mismo
    vueltas: 30,                            // tope del ir y venir del orden
  };

  // Lo que le pasó a `id` en la ronda r, en la moneda del Keizer:
  //   { de: "rival" | "propio" | null, id (el rival), parte (vigésimos) }
  function hechoKeizer(t, r, id, faltas) {
    const s = situacion(t, r, id);
    if (s.tipo === "partida") return { de: "rival", id: s.rival, parte: s.codigo === "1" ? REGLAS_KEIZER.victoria : s.codigo === "=" ? REGLAS_KEIZER.tablas : REGLAS_KEIZER.derrota };
    if (s.tipo === "incomparecencia") return { de: "rival", id: s.rival, parte: s.codigo === "+" ? REGLAS_KEIZER.victoria : 0 };
    if (s.tipo === "bye") return { de: "propio", parte: REGLAS_KEIZER.libre };
    if (s.tipo !== "ausente") return { de: null, parte: 0 };
    if (s.codigo === "H") return { de: "propio", parte: REGLAS_KEIZER.medio };
    if (s.codigo === "F") return { de: "propio", parte: REGLAS_KEIZER.club };
    // Quien ya se retiró no suma por faltar: no es una falta, ya no está.
    const j = t.jugadores.find((x) => x.id === id);
    if (j && j.retiradoDespuesDe != null && r >= j.retiradoDespuesDe) return { de: null, parte: 0 };
    faltas.n++;
    return { de: "propio", parte: faltas.n <= REGLAS_KEIZER.topeFaltas ? REGLAS_KEIZER.falta : 0 };
  }

  // La puntuación Keizer tras `hasta` rondas (todas, si no se dice):
  //   { orden: [id…] del primero al último, valor: Map id → valor,
  //     total: Map id → puntos Keizer, veinte: Map id → lo mismo en vigésimos }
  function puntuarKeizer(t, hasta) {
    const R = hasta == null ? t.rondas.length : Math.min(hasta, t.rondas.length);
    const inicial = ordenInicial(t);
    const lugar = new Map(inicial.map((id, i) => [id, i]));
    const n = inicial.length;
    // Lo que pasó no cambia de una vuelta a otra: solo cuánto vale cada uno.
    const hechos = new Map();
    for (const id of inicial) {
      const faltas = { n: 0 }, lista = [];
      for (let r = 0; r < R; r++) lista.push(hechoKeizer(t, r, id, faltas));
      hechos.set(id, lista);
    }
    const clasico = new Map(inicial.map((id) => [id, puntosHasta(t, id, R)]));
    // Cada vuelta: con el orden que hay, cuánto vale cada uno; con eso, los
    // totales; con los totales, el orden nuevo. Termina cuando el orden ya no
    // cambia. A veces dos jugadores se quedan cambiando de lugar sin fin (el
    // de arriba vale más, y eso baja al otro): ahí se corta en la primera
    // vuelta que repite un orden ya visto. En los dos casos la lista que sale
    // va ordenada por los totales que muestra, y `valor` es lo que cada uno
    // valió para contarlos.
    let orden = inicial.slice(), valor, veinte;
    const vistos = new Set([orden.join(",")]);
    for (let v = 0; v < REGLAS_KEIZER.vueltas; v++) {
      valor = new Map(orden.map((id, i) => [id, n - i]));
      veinte = new Map();
      for (const id of inicial) {
        let s = valor.get(id) * VEINTE;
        for (const h of hechos.get(id)) {
          if (h.de === "rival") s += (valor.get(h.id) || 0) * h.parte;
          else if (h.de === "propio") s += valor.get(id) * h.parte;
        }
        veinte.set(id, s);
      }
      const antes = orden.join(",");
      orden = inicial.slice().sort((x, y) => veinte.get(y) - veinte.get(x) || clasico.get(y) - clasico.get(x) || lugar.get(x) - lugar.get(y));
      const firma = orden.join(",");
      if (firma === antes || vistos.has(firma)) break;
      vistos.add(firma);
    }
    const total = new Map([...veinte].map(([id, x]) => [id, x / VEINTE]));
    return { orden, valor, total, veinte };
  }

  // Los colores y los rivales que lleva cada uno hasta la ronda r.
  function historiaKeizer(t, r) {
    const h = new Map(t.jugadores.map((j) => [j.id, { colores: [], ultima: new Map(), libres: 0 }]));
    for (let k = 0; k < Math.min(r, t.rondas.length); k++) for (const m of t.rondas[k].mesas) {
      if (m.n === null) { if (h.has(m.b)) h.get(m.b).libres++; continue; }
      if (!h.has(m.b) || !h.has(m.n)) continue;
      h.get(m.b).ultima.set(m.n, k);
      h.get(m.n).ultima.set(m.b, k);
      // Una partida que no se jugó no cuenta como color llevado.
      if (m.r === "+-" || m.r === "-+" || m.r === "--") continue;
      h.get(m.b).colores.push("w");
      h.get(m.n).colores.push("b");
    }
    return h;
  }

  // Con qué color juega el de arriba (`a`) contra el de abajo (`b`).
  function colorDeArriba(h, a, b, mesa, colorInicial) {
    const ca = h.get(a).colores, cb = h.get(b).colores;
    const saldo = (c) => c.filter((x) => x === "w").length - c.filter((x) => x === "b").length;
    const sa = saldo(ca), sb = saldo(cb);
    if (sa !== sb) return sa < sb ? "w" : "b";
    // Mismo saldo: mirando hacia atrás, la primera ronda en que llevaron
    // colores distintos; cada uno cambia el suyo.
    for (let i = 1; i <= Math.min(ca.length, cb.length); i++) {
      const xa = ca[ca.length - i], xb = cb[cb.length - i];
      if (xa !== xb) return xa === "w" ? "b" : "w";
    }
    const inicial = colorInicial === "b" ? "b" : "w";
    return mesa % 2 === 0 ? inicial : inicial === "w" ? "b" : "w";
  }

  // Parejas de arriba abajo sin repetir un rival de las últimas `sinRepetir`
  // rondas. Devuelve null si no hay forma (o si buscarla se hace eterno).
  function parejasKeizer(lista, h, r, sinRepetir) {
    let pasos = 0;
    const puede = (a, b) => {
      const k = h.get(a).ultima.get(b);
      return k === undefined || r - k > sinRepetir;
    };
    const buscar = (resto) => {
      if (!resto.length) return [];
      if (++pasos > 50000) return null;
      const a = resto[0];
      for (let i = 1; i < resto.length; i++) {
        if (!puede(a, resto[i])) continue;
        const sigue = buscar(resto.slice(1, i).concat(resto.slice(i + 1)));
        if (sigue) return [[a, resto[i]]].concat(sigue);
      }
      return null;
    };
    return buscar(lista);
  }

  // Las mesas de la ronda `r` (0 es la primera), para quienes juegan:
  // todos menos los retirados y los que avisaron que no vienen (`ausencias`).
  function emparejarKeizer(t, r, ausencias) {
    const juegan = new Set(participantes(t, r, ausencias));
    const lista = puntuarKeizer(t, r).orden.filter((id) => juegan.has(id));
    const h = historiaKeizer(t, r);
    let libre = null;
    if (lista.length % 2 === 1) {
      // El último de los que menos veces quedaron libres.
      const menos = Math.min(...lista.map((id) => h.get(id).libres));
      for (let i = lista.length - 1; i >= 0; i--) if (h.get(lista[i]).libres === menos) { libre = lista.splice(i, 1)[0]; break; }
    }
    let pares = null;
    for (let s = REGLAS_KEIZER.sinRepetir; s >= 0 && !pares; s--) pares = parejasKeizer(lista, h, r, s);
    if (!pares) { pares = []; for (let i = 0; i + 1 < lista.length; i += 2) pares.push([lista[i], lista[i + 1]]); }
    const mesas = pares.map(([a, b], i) => (colorDeArriba(h, a, b, i, t.colorInicial) === "w" ? { b: a, n: b, r: null } : { b: b, n: a, r: null }));
    if (libre) mesas.push({ b: libre, n: null, r: null });
    return mesas;
  }


  // Los sistemas con el calendario fijo de antemano (no se empareja ronda a
  // ronda con el motor): todos contra todos, Scheveningen y la eliminación
  // directa (que depende de quién pasó, pero no del motor).
  const fijo = (t) => t.sistema === "todos" || t.sistema === "scheveningen" || t.sistema === "eliminacion";
  function rondasFijas(t) {
    return t.sistema === "scheveningen" ? rondasScheveningen(t) : t.sistema === "eliminacion" ? rondasEliminacion(t) : rondasTodos(t);
  }
  function rondaFija(t, r) {
    return t.sistema === "scheveningen" ? rondaScheveningen(t, r) : t.sistema === "eliminacion" ? rondaEliminacion(t, r) : rondaTodos(t, r);
  }
  // Cuántas rondas tiene el torneo, sea cual sea el sistema.
  function rondasDelTorneo(t) { return fijo(t) ? rondasFijas(t) : Number(t.rondasTotales) || 0; }

  // ---------- TRF ----------
  const izq = (s, w) => String(s == null ? "" : s).slice(0, w).padEnd(w, " ");
  const der = (s, w) => String(s == null ? "" : s).slice(-w).padStart(w, " ");
  const decimal = (x) => (Math.round(x * 10) / 10).toFixed(1);
  const fechaTrf = (f) => (f ? String(f).replace(/-/g, "/") : "");

  function lineaPuntos(t) {
    const p = t.puntos;
    const std = p.victoria === 1 && p.tablas === 0.5 && p.derrota === 0 && p.bye === 1;
    if (std) return null;
    const cod = [["W", p.victoria], ["D", p.tablas], ["L", p.derrota], ["P", p.bye]];
    return "162  " + cod.map(([c, v]) => c + der(decimal(v), 4)).join("    ");
  }

  // Arma el TRF del torneo con las rondas [0, hasta). Si `proxima` viene
  // ({ ausencias }), agrega la ronda `hasta` sin emparejar, con quien no juega
  // marcado: es el archivo que se le pasa a bbpPairings para emparejarla.
  function aTrf(t, opciones) {
    const o = opciones || {};
    const hasta = o.hasta == null ? t.rondas.length : o.hasta;
    const num = numeros(t);
    const orden = ordenInicial(t);
    const total = puntosPorId(t, hasta);
    const lugar = new Map();
    orden.slice().sort((a, b) => total.get(b) - total.get(a) || num.get(a) - num.get(b))
      .forEach((id, i) => lugar.set(id, i + 1));

    const L = [];
    const cab = (c, v) => { if (v !== "" && v != null) L.push(c + " " + v); };
    cab("012", t.nombre);
    cab("022", t.ciudad);
    cab("032", t.federacion);
    cab("042", fechaTrf(t.fechaInicio));
    cab("052", fechaTrf(t.fechaFin));
    cab("062", t.jugadores.length);
    cab("072", t.jugadores.filter((j) => Number(j.elo) > 0).length);
    cab("082", 0);
    cab("092", t.sistema === "todos" ? "Individual: Round-Robin" : t.sistema === "scheveningen" ? "Individual: Scheveningen"
      : t.sistema === "eliminacion" ? (t.dobleEliminacion ? "Individual: Double Knockout" : "Individual: Knockout")
      : t.sistema === "keizer" ? "Individual: Keizer" : "Individual: Swiss-System");
    cab("102", t.arbitro);
    cab("112", t.arbitroAdjunto);
    cab("122", t.ritmo);
    cab("142", rondasDelTorneo(t));
    L.push("152 " + (t.colorInicial === "b" ? "B" : "W"));
    const lp = lineaPuntos(t);
    if (lp) L.push(lp);
    if (!fijo(t) && t.sistema !== "keizer") L.push("192 " + (t.baku ? "FIDE_DUTCH_2026_BAKU" : "FIDE_DUTCH_2026"));

    for (const id of orden) {
      const j = t.jugadores.find((x) => x.id === id);
      let s = "001 " + der(num.get(id), 4) + " " + izq(j.sexo || "", 1) + der(j.titulo || "", 3) + " " +
        izq(j.nombre, 33) + " " + der(Number(j.elo) > 0 ? j.elo : "", 4) + " " + izq(j.fed || "", 3) + " " +
        der(j.fideId || "", 11) + " " + izq(fechaTrf(j.nacimiento), 10) + " " +
        der(decimal(total.get(id)), 4) + " " + der(lugar.get(id), 4);
      for (let r = 0; r < hasta; r++) s += "  " + bloque(t, r, id, num);
      if (o.proxima) {
        const a = (o.proxima.ausencias || {})[id];
        const ret = j.retiradoDespuesDe != null && hasta >= j.retiradoDespuesDe;
        if (a || ret) s += "  0000 - " + (ret ? "Z" : a);
      }
      L.push(s.replace(/\s+$/, ""));
    }
    return L.join("\r\n") + "\r\n";
  }

  function bloque(t, r, id, num) {
    const s = situacion(t, r, id);
    if (s.tipo === "bye") return "0000 - U";
    if (s.tipo === "ausente") return "0000 - " + s.codigo;
    if (s.tipo === "pendiente") throw new Error("La ronda " + (r + 1) + " tiene partidas sin resultado.");
    return der(num.get(s.rival), 4) + " " + s.color + " " + s.codigo;
  }

  function puntosPorId(t, hasta) {
    const m = new Map();
    for (const j of t.jugadores) m.set(j.id, puntosHasta(t, j.id, hasta));
    return m;
  }

  // Lo que devuelve bbpPairings con -p: la cantidad de mesas y una por línea,
  // «blancas negras» con los números de emparejamiento (0 = bye del pareo), ya en
  // el orden de las mesas.
  function leerPareo(t, salida) {
    const porNumero = ordenInicial(t);
    const lineas = String(salida).trim().split(/\r?\n|\r/).map((l) => l.trim()).filter(Boolean);
    const cantidad = Number(lineas.shift());
    if (!Number.isInteger(cantidad) || cantidad !== lineas.length) throw new Error("Respuesta del motor ilegible.");
    return lineas.map((l) => {
      const [a, b] = l.split(/\s+/).map(Number);
      const A = porNumero[a - 1];
      if (b === 0) return { b: A, n: null, r: "bye" };
      return { b: A, n: porNumero[b - 1], r: null };
    });
  }

  // Lee un TRF (de Swiss-Manager, de otro programa o de esta misma página) y
  // arma el torneo. Las rondas salen de las líneas 001: cada partida aparece en
  // las dos líneas, y se toma desde las blancas.
  function deTrf(texto) {
    const t = nuevo({ desempates: ["BH-C1", "BH", "SB", "DE", "WIN"] });
    const lineas = String(texto).split(/\r\n|\r|\n/);
    const filas = [];
    const puntosLeidos = {};
    let rondasLeidas = null;
    let colorLeido = null;
    for (const l of lineas) {
      const c = l.slice(0, 3);
      const v = l.slice(4).trim();
      if (c === "012") t.nombre = v;
      else if (c === "022") t.ciudad = v;
      else if (c === "032") t.federacion = v;
      else if (c === "042") t.fechaInicio = v.replace(/\//g, "-").slice(0, 10);
      else if (c === "052") t.fechaFin = v.replace(/\//g, "-").slice(0, 10);
      else if (c === "092" && /round.?robin/i.test(v)) t.sistema = "todos";
      else if (c === "092" && /scheveningen/i.test(v)) t.sistema = "scheveningen";
      else if (c === "092" && /knock.?out/i.test(v)) { t.sistema = "eliminacion"; if (/double/i.test(v)) t.dobleEliminacion = true; }
      else if (c === "092" && /keizer/i.test(v)) t.sistema = "keizer";
      else if (c === "102") t.arbitro = v;
      else if (c === "112") t.arbitroAdjunto = v;
      else if (c === "122") t.ritmo = v;
      else if (c === "142" || c === "XXR") rondasLeidas = Number(v) || null;
      else if (c === "152") colorLeido = /^B/i.test(v) ? "b" : "w";
      else if (c === "XXC") { if (/black1/.test(v)) colorLeido = "b"; else if (/white1/.test(v)) colorLeido = "w"; }
      else if (c === "192") t.baku = /BAKU/.test(v);
      else if (c === "162") {
        for (let i = 5; i + 4 < l.length + 1; i += 9) {
          const cod = l[i], val = Number(l.slice(i + 1, i + 5));
          if (cod === "W") puntosLeidos.victoria = val;
          else if (cod === "D") puntosLeidos.tablas = val;
          else if (cod === "L") puntosLeidos.derrota = val;
          else if (cod === "P") puntosLeidos.bye = val;
        }
      } else if (c === "BBW") puntosLeidos.victoria = Number(v);
      else if (c === "BBD") puntosLeidos.tablas = Number(v);
      else if (c === "BBU") puntosLeidos.bye = Number(v);
      else if (c === "001") filas.push(l);
    }
    Object.assign(t.puntos, puntosLeidos);
    if (puntosLeidos.victoria != null && puntosLeidos.bye == null) t.puntos.bye = puntosLeidos.victoria;

    const porNumero = new Map();
    for (const l of filas) {
      const n = Number(l.slice(4, 8));
      if (!n) throw new Error("Línea 001 sin número: " + l);
      const j = {
        id: "j" + n,
        sexo: l.slice(9, 10).trim(), titulo: l.slice(10, 13).trim(),
        nombre: l.slice(14, 47).trim(), elo: Number(l.slice(48, 52)) || 0,
        fed: l.slice(53, 56).trim(), fideId: l.slice(57, 68).trim(),
        nacimiento: l.slice(69, 79).trim().replace(/\//g, "-"), retiradoDespuesDe: null,
      };
      const juegos = [];
      for (let i = 91; i + 7 < l.length + 1; i += 10) {
        const op = l.slice(i, i + 4), col = l[i + 5], res = (l[i + 7] || " ").toUpperCase();
        if (op.trim() === "" && col === " " && res === " ") { juegos.push(null); continue; }
        juegos.push({ rival: op.trim() === "" || op === "0000" ? 0 : Number(op), color: col, res });
      }
      porNumero.set(n, { j, juegos });
    }
    t.jugadores = [...porNumero.values()].map((x) => x.j);
    // Se respeta la numeración del archivo, que puede no ser la de Elo.
    t.numeracion = [...porNumero.keys()].sort((a, b) => a - b).map((n) => "j" + n);
    t.numeracionDeArchivo = true;

    const nRondas = Math.max(0, ...[...porNumero.values()].map((x) => x.juegos.length));
    for (let r = 0; r < nRondas; r++) {
      const R = { mesas: [], ausencias: {} };
      for (const { j, juegos } of porNumero.values()) {
        const g = juegos[r];
        if (!g) { continue; }
        const jugada = "1=0WDL".includes(g.res);
        if (g.rival === 0) {
          if (g.res === "U" || g.res === "+") R.mesas.push({ b: j.id, n: null, r: "bye" });
          else if (g.res === "H" || g.res === "=" || g.res === "D") R.ausencias[j.id] = "H";
          else if (g.res === "F" || g.res === "1" || g.res === "W") R.ausencias[j.id] = "F";
          else R.ausencias[j.id] = "Z";
          continue;
        }
        if (g.color !== "w") continue;          // la partida se lee desde las blancas
        const otro = "j" + g.rival;
        const rival = porNumero.get(g.rival).juegos[r];
        let resultado;
        if (jugada) resultado = g.res === "1" || g.res === "W" ? "1-0" : g.res === "0" || g.res === "L" ? "0-1" : "=";
        else resultado = g.res === "+" ? "+-" : rival && rival.res === "+" ? "-+" : "--";
        R.mesas.push({ b: j.id, n: otro, r: resultado });
      }
      t.rondas.push(R);
    }
    // Sin línea 152, el color inicial se deduce como lo hace bbpPairings: el
    // color en la primera ronda del primero por número que la jugó; si es el
    // k-ésimo, al revés k veces (en la ronda 1 los colores se alternan).
    t.colorInicial = colorLeido || colorDeducido(porNumero) || "w";
    // Sin línea 142 (bbpPairings no la escribe si ya se jugaron todas), el
    // torneo tiene las rondas que trae; nunca menos de las que trae.
    t.rondasTotales = Math.max(rondasLeidas || 0, t.rondas.length) || t.rondasTotales;
    if (fijo(t)) t.rondasTotales = rondasFijas(t);
    return t;
  }

  function colorDeducido(porNumero) {
    const numeros = [...porNumero.keys()].sort((a, b) => a - b);
    const largo = Math.max(0, ...[...porNumero.values()].map((x) => x.juegos.length));
    for (let r = 0; r < largo; r++) {
      let k = 0;
      for (const n of numeros) {
        const g = porNumero.get(n).juegos[r];
        const jugo = g && (g.rival !== 0 || g.res === "U" || g.res === "+");
        if (!jugo) continue;
        if (g.color === "w" || g.color === "b") return k % 2 === 0 ? g.color : g.color === "w" ? "b" : "w";
        k++;
      }
    }
    return null;
  }

  const api = {
    PUNTOS_FIDE, TITULOS, nuevo, ordenInicial, fijarNumeracion, sortearNumeracion, sortearColor, numeros, situacion, puntos, puntosHasta,
    rondaCompleta, participantes, retirosPorIncomparecencia, berger, rondaTodos, rondasTodos, aTrf,
    COLORES_SCHEVENINGEN, MAX_SCHEVENINGEN, equiposScheveningen, rondaScheveningen, rondasScheveningen, marcadorScheveningen,
    semillasCuadro, rondasEliminacion, rondaEliminacion, pasaDe, perdedorDe, alcanceEliminacion, nombreRondaEliminacion,
    planDoble, fasesDeRonda, campeonEliminacion, EN_CARRERA, CAMPEON,
    REGLAS_KEIZER, puntuarKeizer, emparejarKeizer,
    fijo, rondasFijas, rondaFija, rondasDelTorneo, leerPareo, deTrf,
    // El formato de las columnas del TRF: lo usa también el TRF de equipos (js/pareo/equipos.js).
    formatoTrf: { izq, der, decimal, fechaTrf },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.PareoTorneo = api;
})(typeof self !== "undefined" ? self : this);

/*! rev bfb5bbb0d2d82f9f */
