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
 *     sistema: "suizo" | "todos",   dobleVuelta (solo en todos contra todos),
 *     rondasTotales, colorInicial: "w" | "b", baku (aceleración Baku),
 *     puntos: { victoria, tablas, derrota, bye },     bye = el que asigna el pareo
 *     desempates: ["BH-C1", "BH", "SB", …]            ver js/pareo/desempates.js
 *     jugadores: [{ id, nombre, sexo, titulo, elo, fed, fideId, nacimiento,
 *                   retiradoDespuesDe }],
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
    return Object.assign({
      formato: 1,
      nombre: "", ciudad: "", federacion: "", fechaInicio: "", fechaFin: "",
      arbitro: "", arbitroAdjunto: "", ritmo: "",
      sistema: "suizo", dobleVuelta: false, rondasTotales: 7,
      colorInicial: "w", baku: false,
      puntos: Object.assign({}, PUNTOS_FIDE),
      desempates: ["BH-C1", "BH", "SB", "DE", "WIN"],
      jugadores: [], numeracion: null, rondas: [],
    }, datos || {});
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
      let i = t.sistema === "todos" ? orden.length : orden.findIndex((id) => cmp(j, porId.get(id)) < 0);
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

  function rondaCompleta(R) {
    return R.mesas.every((m) => m.n === null || !!m.r);
  }

  // Quién juega la ronda que viene: los que no están retirados ni pidieron bye.
  function participantes(t, ronda, ausencias) {
    return ordenInicial(t).filter((id) => {
      const j = t.jugadores.find((x) => x.id === id);
      if (j.retiradoDespuesDe != null && ronda >= j.retiradoDespuesDe) return false;
      return !(ausencias && ausencias[id]);
    });
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
    cab("092", t.sistema === "todos" ? "Individual: Round-Robin" : "Individual: Swiss-System");
    cab("102", t.arbitro);
    cab("112", t.arbitroAdjunto);
    cab("122", t.ritmo);
    cab("142", t.sistema === "todos" ? rondasTodos(t) : t.rondasTotales);
    L.push("152 " + (t.colorInicial === "b" ? "B" : "W"));
    const lp = lineaPuntos(t);
    if (lp) L.push(lp);
    if (t.sistema !== "todos") L.push("192 " + (t.baku ? "FIDE_DUTCH_2026_BAKU" : "FIDE_DUTCH_2026"));

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
    if (t.sistema === "todos") t.rondasTotales = rondasTodos(t);
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
    PUNTOS_FIDE, TITULOS, nuevo, ordenInicial, fijarNumeracion, sortearNumeracion, numeros, situacion, puntos, puntosHasta,
    rondaCompleta, participantes, berger, rondaTodos, rondasTodos, aTrf, leerPareo, deTrf,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.PareoTorneo = api;
})(typeof self !== "undefined" ? self : this);
