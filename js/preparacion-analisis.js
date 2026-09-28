/* Preparación de rivales: el análisis de un PGN, sin pantalla.
 *
 * Lo usan preparacion-rivales.html (por js/preparacion-trabajador.js, en
 * segundo plano) y herramientas/verificar-preparacion-rivales.js en Node, sin
 * navegador. Por eso acá no hay DOM ni motor: solo cuentas. La página le pone
 * Stockfish con tareasDelMotor() / aplicarMotor().
 *
 * Qué hace, en orden:
 *   leerPgn(texto)          → las partidas (etiquetas, jugadas SAN y relojes).
 *   jugadores(partidas)     → quién aparece y en cuántas, para elegir al rival.
 *   analizar(partidas, rival, { ritmos, desde })
 *                           → todo lo demás, con las partidas que pasan los
 *                             filtros: cuánto saca por color, ritmo, año y Elo;
 *                             su repertorio; dónde rinde menos y dónde más; qué
 *                             jugarle con cada color; FODA.
 *
 * Decisiones (ver «La preparación de rivales» en docs/decisiones/paneles.md):
 *   - El árbol se arma por POSICIÓN: 1.d4 Cf6 2.c4 e6 y 1.c4 e6 2.d4 Cf6 son
 *     el mismo nodo, y cuenta lo de los dos órdenes. La clave de cada posición
 *     la saca js/preparacion-posiciones.js (chess.js tardaba casi un minuto con
 *     30.000 partidas). Cada arista guarda cuántas veces se jugó ESA jugada
 *     desde ESA posición: el reparto de sus respuestas sale de ahí.
 *   - Nada se decide con una muestra chica. Una línea cuenta desde minimo()
 *     partidas, y su puntuación se «encoge» hacia el promedio del rival
 *     (suavizada) antes de compararla: 3 de 3 no es 100 %.
 *   - Todo el texto sale en notación española (js/preparacion-lineas.js).
 */
(function (raiz, fabrica) {
  "use strict";
  const req = (nombre, global) => (raiz && raiz[global]) || (typeof require === "function" ? require(nombre) : null);
  const api = fabrica(req("./preparacion-lineas.js", "PreparacionLineas"), req("./preparacion-posiciones.js", "PreparacionPosiciones"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else raiz.PreparacionAnalisis = api;
})(typeof self !== "undefined" ? self : this, function (L, Pos) {
  "use strict";

  const { sanEs, lineaEs, pct, textoEval, fenDe } = L;

  const MAX_JUGADAS_ARBOL = 16;     // medias jugadas que entran al árbol
  const MAX_PARTIDAS = 60000;       // lo que se lee de un PGN, como mucho
  const SUAVIZADO = 8;              // partidas «imaginarias» al promedio del rival
  const PROFUNDIDAD_PLAN = 10;      // medias jugadas del plan principal

  // ------------------------------------------------------------ el PGN

  function limpiarJugadas(texto) {
    let t = String(texto || "");
    t = t.replace(/\{[^}]*\}/g, " ");          // comentarios
    t = t.replace(/;[^\n]*/g, " ");             // comentario de línea
    // Variantes, anidadas: se quitan de adentro hacia afuera.
    let antes;
    do { antes = t; t = t.replace(/\([^()]*\)/g, " "); } while (t !== antes);
    t = t.replace(/\$\d+/g, " ");               // NAG
    return t;
  }

  // Las jugadas y, si el PGN los trae ([%clk 0:02:59] de Lichess y Chess.com),
  // los segundos que le quedaban a quien jugó cada una. Los relojes están en los
  // comentarios, así que se leen antes de limpiarlos.
  function jugadasYRelojes(texto) {
    const relojes = [];
    let hay = false;
    // Cada comentario con reloj se cambia por una marca «⌚segundos» pegada a su jugada.
    const conMarcas = String(texto || "").replace(/\{[^}]*\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\][^}]*\}/g,
      (m, h, mi, se) => " ⌚" + (Number(h) * 3600 + Number(mi) * 60 + Math.round(Number(se))) + " ");
    const jugadas = [];
    for (let tok of limpiarJugadas(conMarcas).split(/\s+/)) {
      if (!tok) continue;
      if (tok[0] === "⌚") {
        if (jugadas.length && relojes.length === jugadas.length - 1) { relojes.push(Number(tok.slice(1))); hay = true; }
        continue;
      }
      if (relojes.length < jugadas.length) relojes.push(null);
      const j = sanDeToken(tok);
      if (j === false) break;
      if (j) jugadas.push(j);
    }
    while (relojes.length < jugadas.length) relojes.push(null);
    return { jugadas, relojes: hay ? relojes : null };
  }

  // Un token del texto de jugadas: la SAN limpia, null si no es una jugada, o
  // false si la partida termina ahí.
  function sanDeToken(tok0) {
    let tok = tok0.replace(/^\d+\.(\.\.)?/, "");   // «12.» o «12...» pegado
    if (!tok || /^\.+$/.test(tok)) return null;
    if (/^(1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(tok)) return false;
    if (tok === "--" || tok === "Z0") return false;  // jugada nula: la partida ya no es real
    tok = tok.replace(/[!?+#]+$/g, "").replace(/^0-0-0$/, "O-O-O").replace(/^0-0$/, "O-O");
    if (!/^([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=?[QRBN])?|O-O(-O)?)$/.test(tok)) return null;
    return tok.replace(/([a-h][18])([QRBN])$/, "$1=$2");
  }

  function jugadasDe(texto) {
    const out = [];
    for (let tok of limpiarJugadas(texto).split(/\s+/)) {
      if (!tok) continue;
      tok = tok.replace(/^\d+\.(\.\.)?/, "");   // «12.» o «12...» pegado
      if (!tok || /^\.+$/.test(tok)) continue;
      if (/^(1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(tok)) break;
      if (tok === "--" || tok === "Z0") break;  // jugada nula: la partida ya no es real
      tok = tok.replace(/[!?+#]+$/g, "").replace(/^0-0-0$/, "O-O-O").replace(/^0-0$/, "O-O");
      if (!/^([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=?[QRBN])?|O-O(-O)?)$/.test(tok)) continue;
      out.push(tok.replace(/([a-h][18])([QRBN])$/, "$1=$2"));
    }
    return out;
  }

  function leerPgn(texto) {
    const partidas = [];
    const lineas = String(texto || "").replace(/\r\n?/g, "\n").replace(/^﻿/, "").split("\n");
    let etiquetas = {};
    let cuerpo = [];
    let hayEtiquetas = false;
    function cerrar() {
      if (!hayEtiquetas && !cuerpo.join("").trim()) return;
      const { jugadas, relojes } = jugadasYRelojes(cuerpo.join("\n"));
      // Cómo terminó: si la última jugada es mate, se sabe aunque no lo diga la etiqueta.
      const mate = /#\s*(\{[^}]*\}\s*)*(1-0|0-1)?\s*$/.test(cuerpo.join(" ").replace(/\s+(1-0|0-1|1\/2-1\/2|\*)\s*$/, " $1"));
      if (hayEtiquetas || jugadas.length) partidas.push(relojes ? { etiquetas, jugadas, relojes, mate } : { etiquetas, jugadas, mate });
      etiquetas = {}; cuerpo = []; hayEtiquetas = false;
    }
    for (const linea of lineas) {
      if (partidas.length >= MAX_PARTIDAS) break;
      const m = linea.match(/^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/);
      if (m) {
        if (cuerpo.join("").trim()) cerrar();
        etiquetas[m[1]] = m[2].replace(/\\(.)/g, "$1");
        hayEtiquetas = true;
      } else {
        cuerpo.push(linea);
      }
    }
    cerrar();
    return partidas;
  }

  // ------------------------------------------------------------ nombres

  // «Angulo, Oscar», «oscar angulo» y «Óscar Angulo» son la misma persona.
  function claveNombre(nombre) {
    return String(nombre || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9_\-\s]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
  }

  // Cada jugador una vez, con la forma de escribir su nombre que más se repite.
  function jugadores(partidas) {
    const porClave = new Map();
    for (const p of partidas) {
      for (const lado of ["White", "Black"]) {
        const nombre = (p.etiquetas[lado] || "").trim();
        const clave = claveNombre(nombre);
        if (!clave || clave === "?") continue;
        if (!porClave.has(clave)) porClave.set(clave, { clave, partidas: 0, formas: new Map() });
        const j = porClave.get(clave);
        j.partidas += 1;
        j.formas.set(nombre, (j.formas.get(nombre) || 0) + 1);
      }
    }
    return [...porClave.values()].map((j) => ({
      clave: j.clave, partidas: j.partidas,
      nombre: [...j.formas.entries()].sort((a, b) => b[1] - a[1])[0][0],
    })).sort((a, b) => b.partidas - a.partidas || a.nombre.localeCompare(b.nombre));
  }

  // ------------------------------------------------------------ datos de cada partida

  function numero(x) {
    const n = parseInt(String(x || "").replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  // Ritmo como lo cuenta Lichess: base + 40 × incremento, en segundos.
  function ritmoDe(etiquetas) {
    const tc = String(etiquetas.TimeControl || "").trim();
    const m = tc.match(/^(\d+)(?:\+(\d+))?$/);
    if (m) {
      const s = parseInt(m[1], 10) + 40 * parseInt(m[2] || "0", 10);
      if (s < 30) return "hiperbullet";
      if (s < 180) return "bullet";
      if (s < 480) return "blitz";
      if (s < 1500) return "rápida";
      return "clásica";
    }
    const ev = String(etiquetas.Event || "").toLowerCase();
    if (/ultra ?bullet|hyper ?bullet/.test(ev)) return "hiperbullet";
    if (/bullet/.test(ev)) return "bullet";
    if (/blitz|relámpago|relampago/.test(ev)) return "blitz";
    if (/rapid|rápid/.test(ev)) return "rápida";
    if (/classical|clásic|clasic|standard/.test(ev)) return "clásica";
    return "sin dato";
  }

  function fechaDe(etiquetas) {
    const f = String(etiquetas.Date || etiquetas.UTCDate || "");
    const m = f.match(/^(\d{4})[.\-/](\d{2}|\?\?)[.\-/](\d{2}|\?\?)/);
    if (!m) return null;
    return m[1] + "-" + (m[2] === "??" ? "01" : m[2]) + "-" + (m[3] === "??" ? "01" : m[3]);
  }

  // Cómo terminó una partida, en pocas categorías. Lichess dice «Normal» para
  // mate, abandono y tablas por acuerdo; Chess.com lo escribe en inglés
  // («Juan won by resignation»). Lo que no se reconoce queda como «otro».
  function finDe(e, res, mate) {
    const t = String(e.Termination || "").toLowerCase();
    if (/time|tiempo/.test(t)) return res === "T" ? "tablas" : "tiempo";
    if (/abandon/.test(t)) return "abandonada";
    // «stalemate» (ahogado) también dice «mate»: va antes.
    if (/stalemate/.test(t)) return "ahogado";
    if (/checkmate/.test(t) || mate) return "mate";
    if (/resign/.test(t)) return "abandono";
    if (/repetition/.test(t)) return "repeticion";
    if (/insufficient/.test(t)) return "material";
    if (/agreement|50/.test(t)) return "tablas";
    if (res === "T") return "tablas";
    if (/normal|won/.test(t)) return "abandono";
    return "otro";
  }

  // El ritmo en números: tiempo inicial e incremento, en segundos.
  function controlDe(e) {
    const m = String(e.TimeControl || "").trim().match(/^(\d+)(?:\+(\d+))?$/);
    return m ? { base: Number(m[1]), inc: Number(m[2] || 0) } : null;
  }

  // ------------------------------------------------------------ los finales

  const VALOR = { Q: 9, R: 5, B: 3, N: 3, P: 1 };
  function valorPiezas(l) { return l.Q * 9 + l.R * 5 + l.B.length * 3 + l.N * 3; }
  function cuantasPiezas(l) { return l.Q + l.R + l.B.length + l.N; }

  // Un final: cada lado con 13 puntos de piezas o menos (sin contar peones) y
  // dos piezas como mucho. Torre y alfil contra torre es un final; dama y
  // torre contra dama, no.
  function esFinal(pz) {
    return valorPiezas(pz.w) <= 13 && valorPiezas(pz.b) <= 13 && cuantasPiezas(pz.w) <= 2 && cuantasPiezas(pz.b) <= 2;
  }

  function tipoDeFinal(pz) {
    const tipos = new Set();
    for (const l of [pz.w, pz.b]) {
      if (l.Q) tipos.add("Q");
      if (l.R) tipos.add("R");
      if (l.B.length) tipos.add("B");
      if (l.N) tipos.add("N");
    }
    const solo = (...t) => [...tipos].every((x) => t.includes(x));
    if (!tipos.size) return "de peones";
    if (solo("R")) return "de torres";
    if (solo("Q")) return "de damas";
    if (solo("B")) {
      if (pz.w.B.length === 1 && pz.b.B.length === 1) return pz.w.B[0] !== pz.b.B[0] ? "de alfiles de distinto color" : "de alfiles del mismo color";
      return "de alfiles";
    }
    if (solo("N")) return "de caballos";
    if (solo("B", "N")) {
      const unoContraUno = cuantasPiezas(pz.w) === 1 && cuantasPiezas(pz.b) === 1;
      return unoContraUno ? "de alfil contra caballo" : "de piezas menores";
    }
    if (!tipos.has("Q")) return "de torre y pieza menor";
    return "con dama y otras piezas";
  }

  // El primer momento en que la partida entra en un final: en qué media
  // jugada, de qué tipo y cuánto material de ventaja tenía el rival (peones
  // incluidos; en puntos). Solo se mira después de una captura o una
  // coronación, que es lo único que cambia el material.
  function finalDe(p, color) {
    // Guardado por color: la ventaja es la del rival, y en el mismo archivo se
    // puede analizar a cualquiera de los dos jugadores.
    if (!p._final) Object.defineProperty(p, "_final", { value: {}, enumerable: false });
    if (p._final[color] !== undefined) return p._final[color];
    let e = Pos.inicial();
    let final = null;
    for (let i = 0; i < p.jugadas.length; i++) {
      const san = p.jugadas[i];
      e = Pos.aplicar(e, san);
      if (!e) break;
      if (san.indexOf("x") < 0 && san.indexOf("=") < 0) continue;
      const pz = Pos.piezas(e);
      if (esFinal(pz)) {
        const val = (l) => valorPiezas(l) + l.P * VALOR.P;
        const rival = color === "w" ? pz.w : pz.b, otro = color === "w" ? pz.b : pz.w;
        final = { ply: i + 1, tipo: tipoDeFinal(pz), dif: val(rival) - val(otro) };
        break;
      }
    }
    p._final[color] = final;
    return final;
  }

  // Las partidas del rival, desde su lado: color, resultado, Elos.
  function partidasDelRival(partidas, claveRival) {
    const out = [];
    for (const p of partidas) {
      const e = p.etiquetas;
      let color = null;
      if (claveNombre(e.White) === claveRival) color = "w";
      else if (claveNombre(e.Black) === claveRival) color = "b";
      if (!color) continue;
      const r = String(e.Result || "").trim();
      let res = null;
      if (r === "1-0") res = color === "w" ? "G" : "P";
      else if (r === "0-1") res = color === "b" ? "G" : "P";
      else if (r === "1/2-1/2" || r === "½-½") res = "T";
      if (!res) continue;
      out.push({
        color, res,
        jugadas: p.jugadas,
        relojes: p.relojes || null,
        fin: finDe(e, res, p.mate),
        control: controlDe(e),
        // El final al que llegó (si llegó): se calcula una vez por partida y
        // queda guardado en ella, porque los filtros vuelven a pedirlo.
        final: finalDe(p, color),
        elo: numero(color === "w" ? e.WhiteElo : e.BlackElo),
        eloRival: numero(color === "w" ? e.BlackElo : e.WhiteElo),
        oponente: (color === "w" ? e.Black : e.White) || "",
        fecha: fechaDe(e),
        ritmo: ritmoDe(e),
      });
    }
    return out;
  }

  // ------------------------------------------------------------ cuentas

  function vacio() { return { n: 0, g: 0, t: 0, p: 0 }; }
  function sumar(c, res) { c.n += 1; if (res === "G") c.g += 1; else if (res === "T") c.t += 1; else c.p += 1; }
  function puntos(c) { return c.n ? (c.g + c.t / 2) / c.n : null; }
  function resumen(c) { return { n: c.n, g: c.g, t: c.t, p: c.p, puntos: puntos(c) }; }

  function suavizada(c, base) { return (c.g + c.t / 2 + SUAVIZADO * base) / (c.n + SUAVIZADO); }

  // Cuánto se aparta de su promedio, en desviaciones: con pocas partidas,
  // una diferencia grande no dice nada.
  function z(c, base) {
    const v = Math.max(base * (1 - base), 0.1) / Math.max(c.n, 1);
    return (puntos(c) - base) / Math.sqrt(v);
  }

  function minimo(total) { return Math.min(30, Math.max(4, Math.round(total * 0.01))); }

  function nuevoNodo() { return { c: vacio(), hijos: new Map() }; }

  // El árbol por posición. Primero la secuencia de cada partida (hasta
  // MAX_JUGADAS_ARBOL medias jugadas); después cada nodo de la secuencia se
  // junta con los demás que llegan a la MISMA posición. Queda un grafo: cada
  // nodo es una posición, con la cuenta de todas las partidas que pasaron por
  // ella (`c`), y cada arista es una jugada desde esa posición, con la cuenta
  // de las partidas que la jugaron AHÍ (`arista`).
  function armarArbol(lista) {
    const raiz = nuevoNodo();
    for (const x of lista) {
      sumar(raiz.c, x.res);
      let nodo = raiz;
      const tope = Math.min(MAX_JUGADAS_ARBOL, x.jugadas.length);
      for (let i = 0; i < tope; i++) {
        const san = x.jugadas[i];
        if (!nodo.hijos.has(san)) nodo.hijos.set(san, nuevoNodo());
        nodo = nodo.hijos.get(san);
        sumar(nodo.c, x.res);
      }
    }
    return aGrafo(raiz);
  }

  function nodoGrafo() { return { c: vacio(), hijos: new Map() }; }

  function aGrafo(raizSec) {
    const porClave = new Map();
    const inicial = Pos.inicial();
    const raiz = nodoGrafo();
    porClave.set(Pos.clave(inicial), raiz);
    Object.assign(raiz.c, raizSec.c);
    // Recorrido con pila: una partida larga no puede agotar la recursión.
    const pila = [{ sec: raizSec, pos: inicial, nodo: raiz }];
    while (pila.length) {
      const { sec, pos, nodo } = pila.pop();
      for (const [san, h] of sec.hijos) {
        const p2 = Pos.aplicar(pos, san);
        if (!p2) continue;   // una jugada que no se puede hacer corta la rama
        const k = Pos.clave(p2);
        let destino = porClave.get(k);
        if (!destino) { destino = nodoGrafo(); porClave.set(k, destino); }
        sumarCuenta(destino.c, h.c);
        let arista = nodo.hijos.get(san);
        if (!arista) { arista = { nodo: destino, c: vacio() }; nodo.hijos.set(san, arista); }
        sumarCuenta(arista.c, h.c);
        pila.push({ sec: h, pos: p2, nodo: destino });
      }
    }
    return raiz;
  }

  function sumarCuenta(a, b) { a.n += b.n; a.g += b.g; a.t += b.t; a.p += b.p; }

  // Las jugadas desde una posición, de la más jugada ahí a la menos. `nodo.c`
  // es la posición a la que lleva (todos los órdenes); `arista` es cuántas
  // veces se jugó esa jugada desde esta posición.
  function hijosOrdenados(nodo) {
    return [...nodo.hijos.entries()].map(([san, a]) => ({ san, nodo: a.nodo, arista: a.c }))
      .sort((a, b) => b.arista.n - a.arista.n || b.nodo.c.n - a.nodo.c.n);
  }

  function totalAristas(nodo) { let n = 0; for (const a of nodo.hijos.values()) n += a.c.n; return n; }

  // ¿A quién le toca después de `profundidad` medias jugadas? El rival juega
  // en las pares si lleva blancas, en las impares si lleva negras.
  function leTocaAlRival(color, profundidad) { return (profundidad % 2 === 0) === (color === "w"); }

  // ------------------------------------------------------------ líneas notables

  // Cada posición una vez, por el camino más jugado (el primero que la encuentra).
  function recorrer(raiz, color, visitar) {
    const vistos = new Set([raiz]);
    (function paso(nodo, sec) {
      for (const { san, nodo: h } of hijosOrdenados(nodo)) {
        if (vistos.has(h)) continue;
        vistos.add(h);
        const s = sec.concat(san);
        visitar(h, s);
        paso(h, s);
      }
    })(raiz, []);
  }

  function esPrefijo(a, b) { return a.length <= b.length && a.every((x, i) => x === b[i]); }

  // Las líneas donde el rival se aparta de su promedio. Una línea larga que
  // son casi las mismas partidas que su comienzo no se repite: queda la más
  // corta, que es la que se puede buscar.
  function lineasNotables(raiz, color, base, minN, signo) {
    const cands = [];
    recorrer(raiz, color, (h, sec) => {
      if (sec.length < 2 || h.c.n < minN) return;
      const zz = z(h.c, base);
      const dif = puntos(h.c) - base;
      if (signo < 0 ? (zz <= -1.28 && dif <= -0.05) : (zz >= 1.28 && dif >= 0.05)) {
        cands.push({ sec, c: h.c, peso: Math.abs(dif) * Math.sqrt(h.c.n) });
      }
    });
    cands.sort((a, b) => b.peso - a.peso);
    const elegidas = [];
    for (const x of cands) {
      const repetida = elegidas.some((y) =>
        (esPrefijo(y.sec, x.sec) || esPrefijo(x.sec, y.sec)) &&
        Math.max(x.c.n, y.c.n) <= 1.25 * Math.min(x.c.n, y.c.n));
      if (repetida) continue;
      elegidas.push(x);
      if (elegidas.length >= 8) break;
    }
    return elegidas.map((x) => ({ color, sec: x.sec, ...resumen(x.c), base }));
  }

  // Su línea principal: mientras repita la misma jugada en la mitad o más de
  // las partidas, y queden al menos minN.
  function lineaPrincipal(raiz, minN) {
    const sec = [];
    let nodo = raiz, n = raiz.c.n;
    const vistos = new Set([raiz]);
    for (;;) {
      const hs = hijosOrdenados(nodo);
      if (!hs.length) break;
      const h = hs[0];
      if (h.arista.n < minN || h.arista.n < 0.5 * totalAristas(nodo) || vistos.has(h.nodo)) break;
      sec.push(h.san);
      vistos.add(h.nodo);
      nodo = h.nodo;
      n = h.arista.n;
    }
    return { sec, n: sec.length ? n : nodo.c.n, puntos: puntos(nodo.c) };
  }

  // Donde le toca a él y no tiene una jugada fija: la más jugada no llega al
  // 40 % de las veces.
  function dondeImprovisa(raiz, color, minN) {
    const out = [];
    recorrer(raiz, color, (h, sec) => {
      if (!leTocaAlRival(color, sec.length) || h.c.n < 2 * minN || sec.length > 8) return;
      const hs = hijosOrdenados(h);
      if (hs.length < 2) return;
      const reparto = hs[0].arista.n / Math.max(totalAristas(h), 1);
      if (reparto < 0.4) out.push({ color, sec, n: h.c.n, reparto, opciones: hs.slice(0, 4).map((x) => ({ san: x.san, n: x.arista.n })) });
    });
    out.sort((a, b) => b.n - a.n);
    return out.slice(0, 4);
  }

  // ------------------------------------------------------------ qué jugarle

  // El plan desde un nodo. Cuando nos toca, la jugada donde el rival saca
  // menos (suavizada); cuando le toca a él, sus respuestas más jugadas, y a
  // cada una la nuestra. La principal se sigue más hondo que las demás.
  function plan(nodo, color, base, minN, prof, profundidadTotal) {
    if (prof <= 0) return [];
    const hs = hijosOrdenados(nodo).filter((x) => x.nodo.c.n >= minN);
    if (!hs.length) return [];
    if (!leTocaAlRival(color, profundidadTotal)) {
      let mejor = null;
      for (const x of hs) {
        const s = suavizada(x.nodo.c, base);
        if (!mejor || s < mejor.s) mejor = { ...x, s };
      }
      return [{
        san: mejor.san, quien: "tu", ...resumen(mejor.nodo.c),
        hijos: plan(mejor.nodo, color, base, minN, prof - 1, profundidadTotal + 1),
      }];
    }
    // La más jugada se sigue hasta el fondo. Las otras, también si él las
    // juega una de cada cuatro veces o más y todavía se está en la apertura
    // (sus dos primeras jugadas): 1.e4 y 1.d4 de un rival que abre con las
    // dos son dos preparaciones, no una y una nota al pie. El resto, dos
    // medias jugadas: la respuesta y la primera de él.
    const total = Math.max(totalAristas(nodo), 1);
    const respuestas = hs.filter((x) => x.arista.n >= minN && x.arista.n >= 0.1 * total).slice(0, 3);
    return respuestas.map((x, i) => {
      const reparto = x.arista.n / total;
      const hondo = i === 0 || (reparto >= 0.25 && profundidadTotal <= 3);
      return {
        san: x.san, quien: "rival", reparto, ...resumen(x.nodo.c),
        hijos: plan(x.nodo, color, base, minN, hondo ? prof - 1 : Math.min(prof - 1, 2), profundidadTotal + 1),
      };
    });
  }

  // Tabla de primeras jugadas (o respuestas) nuestras en un nodo: de la que
  // más le cuesta a la que menos.
  function opcionesNuestras(nodo, base, minN) {
    return hijosOrdenados(nodo).filter((x) => x.nodo.c.n >= minN)
      .map((x) => ({ san: x.san, ...resumen(x.nodo.c), suavizada: suavizada(x.nodo.c, base) }))
      .sort((a, b) => a.suavizada - b.suavizada);
  }

  // ------------------------------------------------------------ grupos

  function agrupar(lista, clave) {
    const m = new Map();
    for (const x of lista) {
      const k = clave(x);
      if (k == null) continue;
      if (!m.has(k)) m.set(k, vacio());
      sumar(m.get(k), x.res);
    }
    return m;
  }

  const ORDEN_RITMO = ["hiperbullet", "bullet", "blitz", "rápida", "clásica", "sin dato"];
  const TRAMOS_ELO = [
    { etiqueta: "Rival 300 o más por debajo", desde: -Infinity, hasta: -300 },
    { etiqueta: "150 a 300 por debajo", desde: -300, hasta: -150 },
    { etiqueta: "50 a 150 por debajo", desde: -150, hasta: -50 },
    { etiqueta: "Parejos (±50)", desde: -50, hasta: 50 },
    { etiqueta: "50 a 150 por encima", desde: 50, hasta: 150 },
    { etiqueta: "150 a 300 por encima", desde: 150, hasta: 300 },
    { etiqueta: "Rival 300 o más por encima", desde: 300, hasta: Infinity },
  ];

  function mediana(xs) {
    if (!xs.length) return null;
    const s = xs.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  // ------------------------------------------------------------ el análisis

  // Los filtros: `ritmos` (lista; vacía o ausente = todos) y `desde`
  // ("AAAA-MM-DD"; las partidas sin fecha quedan afuera si se pide una).
  function pasaFiltros(x, f) {
    if (f.ritmos && f.ritmos.length && !f.ritmos.includes(x.ritmo)) return false;
    if (f.desde && !(x.fecha && x.fecha >= f.desde)) return false;
    return true;
  }

  // Con cuántas partidas se contaría cada ritmo y cada año, sin filtrar: lo que
  // la página ofrece para elegir.
  function disponibles(lista) {
    const ritmos = agrupar(lista, (x) => x.ritmo);
    const anios = agrupar(lista, (x) => (x.fecha ? x.fecha.slice(0, 4) : null));
    return {
      ritmos: ORDEN_RITMO.filter((r) => ritmos.has(r)).map((r) => ({ ritmo: r, n: ritmos.get(r).n })),
      anios: [...anios.keys()].sort().map((a) => ({ anio: a, n: anios.get(a).n })),
    };
  }

  // ------------------------------------------------------------ más allá de la apertura

  const FINES_DECISIVOS = ["tiempo", "abandono", "mate", "abandonada", "otro"];
  const mediana2 = (xs) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  // Cómo termina, cuándo pierde, cómo usa el reloj y qué le pasa en los finales.
  function masAllaDe(lista, base, minN) {
    const cuenta = (xs, clave) => {
      const m = new Map();
      xs.forEach((x) => { const k = clave(x); m.set(k, (m.get(k) || 0) + 1); });
      return [...m.entries()].map(([k, n]) => ({ fin: k, n, reparto: n / xs.length })).sort((a, b) => b.n - a.n);
    };
    const perdidas = lista.filter((x) => x.res === "P");
    const ganadas = lista.filter((x) => x.res === "G");
    // Cuándo pierde: en el final si ya había entrado en uno; si no, por la jugada.
    const fase = (x) => (x.final && x.final.ply <= x.jugadas.length ? "final" : x.jugadas.length <= 40 ? "apertura" : "medio");
    const fases = { apertura: 0, medio: 0, final: 0 };
    perdidas.forEach((x) => { fases[fase(x)] += 1; });

    // El reloj: solo con las partidas que lo traen y cuyo ritmo se conoce.
    let reloj = null;
    const conReloj = lista.filter((x) => x.relojes && x.control && x.control.base > 0);
    if (conReloj.length >= minN) {
      const suyo = (x, jugada) => x.relojes[2 * (jugada - 1) + (x.color === "w" ? 0 : 1)];
      const delOtro = (x, jugada) => x.relojes[2 * (jugada - 1) + (x.color === "w" ? 1 : 0)];
      const usado = (x, clk, jugada) => (x.control.base + jugada * x.control.inc - clk) / x.control.base;
      const en = (jugada, deQuien) => mediana2(conReloj.map((x) => { const c = deQuien(x, jugada); return c == null ? null : c / x.control.base; }).filter((v) => v != null));
      const gastoApertura = (deQuien) => mediana2(conReloj.map((x) => { const c = deQuien(x, 15); return c == null ? null : usado(x, c, 15); }).filter((v) => v != null));
      const enApuros = conReloj.filter((x) => x.relojes.some((c, i) => c != null && (i % 2 === 0) === (x.color === "w") && c < 0.1 * x.control.base)).length;
      reloj = {
        partidas: conReloj.length,
        queda20: en(20, suyo), queda40: en(40, suyo),
        rivales20: en(20, delOtro),
        apertura: gastoApertura(suyo), aperturaRivales: gastoApertura(delOtro),
        apuros: enApuros / conReloj.length,
      };
    }

    // Los finales: a cuáles llega, cuánto saca en cada uno y si convierte.
    const conFinal = lista.filter((x) => x.final);
    const porTipo = agrupar(conFinal, (x) => x.final.tipo);
    const finales = [...porTipo.entries()].map(([tipo, c]) => ({ tipo, ...resumen(c) })).sort((a, b) => b.n - a.n);
    const conVentaja = conFinal.filter((x) => x.final.dif >= 2);
    const enDesventaja = conFinal.filter((x) => x.final.dif <= -2);
    return {
      derrotas: cuenta(perdidas, (x) => x.fin), victorias: cuenta(ganadas, (x) => x.fin),
      perdidas: perdidas.length, ganadas: ganadas.length,
      fases,
      reloj,
      llegaFinal: lista.length ? conFinal.length / lista.length : 0,
      finales,
      conversion: {
        ventaja: { n: conVentaja.length, ganadas: conVentaja.filter((x) => x.res === "G").length },
        desventaja: { n: enDesventaja.length, salvadas: enDesventaja.filter((x) => x.res !== "P").length },
      },
      base,
    };
  }

  // Menos de esto, y la página avisa que dice poco.
  const POCAS = 30;

  function analizar(partidas, rival, opciones) {
    const o = opciones || {};
    const clave = claveNombre(rival);
    const todas = partidasDelRival(partidas, clave);
    if (!todas.length) return null;
    const filtros = { ritmos: (o.ritmos || []).slice(), desde: o.desde || null };
    const lista = todas.filter((x) => pasaFiltros(x, filtros));
    if (!lista.length) return { version: 3, vacio: true, rival: nombreDe(partidas, clave, rival), totalRival: todas.length, filtros, disponibles: disponibles(todas) };
    const total = lista.length;
    const minN = o.minimo || minimo(total);

    const global = vacio();
    lista.forEach((x) => sumar(global, x.res));
    const porColor = { w: vacio(), b: vacio() };
    lista.forEach((x) => sumar(porColor[x.color], x.res));
    const base = { w: puntos(porColor.w) ?? puntos(global), b: puntos(porColor.b) ?? puntos(global) };

    const arbol = { w: armarArbol(lista.filter((x) => x.color === "w")), b: armarArbol(lista.filter((x) => x.color === "b")) };

    const ritmos = agrupar(lista, (x) => x.ritmo);
    const anios = agrupar(lista, (x) => (x.fecha ? x.fecha.slice(0, 4) : null));
    const tramos = agrupar(lista, (x) => {
      if (!x.elo || !x.eloRival) return null;
      const d = x.eloRival - x.elo;
      const t = TRAMOS_ELO.find((tt) => d >= tt.desde && d < tt.hasta);
      return t ? t.etiqueta : null;
    });

    const fechas = lista.map((x) => x.fecha).filter(Boolean).sort();
    const recientes = lista.filter((x) => x.fecha && x.elo).sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 50);

    // Cuánto duran: una derrota corta suele ser un problema de apertura.
    const largo = (res) => {
      const xs = lista.filter((x) => x.res === res && x.jugadas.length).map((x) => Math.ceil(x.jugadas.length / 2));
      return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
    };
    const perdidas = lista.filter((x) => x.res === "P" && x.jugadas.length);
    const perdidasCortas = perdidas.filter((x) => x.jugadas.length <= 50).length;

    const resultado = {
      version: 3,
      rival: nombreDe(partidas, clave, rival),
      generado: new Date().toISOString(),
      total,
      totalRival: todas.length,
      pocas: total < POCAS,
      filtros,
      disponibles: disponibles(todas),
      minimo: minN,
      fechas: { desde: fechas[0] || null, hasta: fechas[fechas.length - 1] || null },
      elo: { reciente: mediana(recientes.map((x) => x.elo)), maximo: lista.reduce((m, x) => Math.max(m, x.elo || 0), 0) || null },
      global: resumen(global),
      porColor: { w: resumen(porColor.w), b: resumen(porColor.b) },
      porRitmo: ORDEN_RITMO.filter((r) => ritmos.has(r)).map((r) => ({ ritmo: r, ...resumen(ritmos.get(r)) })),
      porAnio: [...anios.keys()].sort().slice(-8).map((a) => ({ anio: a, ...resumen(anios.get(a)) })),
      porElo: TRAMOS_ELO.filter((t) => tramos.has(t.etiqueta)).map((t) => ({ tramo: t.etiqueta, ...resumen(tramos.get(t.etiqueta)) })),
      duracion: {
        ganadas: largo("G"), perdidas: largo("P"),
        perdidasCortas, perdidasConJugadas: perdidas.length,
      },
      repertorio: {
        blancas: hijosOrdenados(arbol.w).map((x) => ({ san: x.san, ...resumen(x.arista), reparto: x.arista.n / Math.max(totalAristas(arbol.w), 1) })).slice(0, 8),
        negras: hijosOrdenados(arbol.b).filter((x) => x.arista.n >= minN).slice(0, 6).map((x) => ({
          contra: x.san, n: x.arista.n,
          respuestas: hijosOrdenados(x.nodo).slice(0, 5).map((y) => ({ san: y.san, ...resumen(y.arista), reparto: y.arista.n / Math.max(totalAristas(x.nodo), 1) })),
        })),
      },
      principal: { w: lineaPrincipal(arbol.w, minN), b: lineaPrincipal(arbol.b, minN) },
      improvisa: dondeImprovisa(arbol.w, "w", minN).concat(dondeImprovisa(arbol.b, "b", minN)),
      debiles: lineasNotables(arbol.w, "w", base.w, minN, -1).concat(lineasNotables(arbol.b, "b", base.b, minN, -1)),
      fuertes: lineasNotables(arbol.w, "w", base.w, minN, 1).concat(lineasNotables(arbol.b, "b", base.b, minN, 1)),
      conBlancas: {
        // Tú con blancas: el rival lleva negras.
        primeras: opcionesNuestras(arbol.b, base.b, minN),
        plan: plan(arbol.b, "b", base.b, minN, PROFUNDIDAD_PLAN, 0),
      },
      conNegras: {
        // Tú con negras: el rival lleva blancas y empieza él.
        contra: hijosOrdenados(arbol.w).filter((x) => x.arista.n >= minN).slice(0, 5).map((x) => ({
          san: x.san, n: x.arista.n, reparto: x.arista.n / Math.max(totalAristas(arbol.w), 1),
          respuestas: opcionesNuestras(x.nodo, base.w, minN),
        })),
        plan: plan(arbol.w, "w", base.w, minN, PROFUNDIDAD_PLAN, 0),
      },
      masAlla: masAllaDe(lista, puntos(global), minN),
      motor: null,
    };
    resultado.debiles.sort((a, b) => (a.puntos - a.base) - (b.puntos - b.base));
    resultado.fuertes.sort((a, b) => (b.puntos - b.base) - (a.puntos - a.base));
    resultado.foda = foda(resultado);
    return resultado;
  }

  function nombreDe(partidas, clave, rival) {
    return (jugadores(partidas).find((j) => j.clave === clave) || { nombre: rival }).nombre;
  }

  // ------------------------------------------------------------ FODA

  function colorEs(c) { return c === "w" ? "blancas" : "negras"; }

  const FIN_ES = { tiempo: "por tiempo", abandono: "abandonando", mate: "con mate", abandonada: "abandonando la partida (desconexión)", otro: "de otra forma", tablas: "en tablas", ahogado: "por ahogado", repeticion: "por repetición", material: "por material insuficiente" };
  const pctEntero = (x) => Math.round(100 * x) + " %";

  // Lo que la etapa 2 agrega al FODA: cómo pierde, el reloj y los finales.
  function fodaMasAlla(r, F, D, O, A) {
    const m = r.masAlla;
    const porTiempo = m.derrotas.find((x) => x.fin === "tiempo");
    if (m.perdidas >= r.minimo && porTiempo && porTiempo.reparto >= 0.25) {
      D.push("El " + pctEntero(porTiempo.reparto) + " de sus derrotas son por tiempo (" + porTiempo.n + " de " + m.perdidas + ").");
      O.push("Pierde mucho por tiempo: complícale la posición y aprieta el reloj.");
    }
    const conMate = m.derrotas.find((x) => x.fin === "mate");
    if (m.perdidas >= r.minimo && conMate && conMate.reparto >= 0.25) {
      D.push("El " + pctEntero(conMate.reparto) + " de sus derrotas terminan en mate: no abandona y se deja atacar.");
    }
    if (m.perdidas >= r.minimo && m.fases.apertura / m.perdidas >= 0.4) {
      O.push("El " + pctEntero(m.fases.apertura / m.perdidas) + " de sus derrotas se decide hasta la jugada 20: la preparación de apertura rinde.");
    }
    if (m.reloj) {
      if (m.reloj.apuros >= 0.3) D.push("Se queda en apuros de tiempo (menos del 10 % de su reloj) en el " + pctEntero(m.reloj.apuros) + " de sus partidas.");
      if (m.reloj.apertura != null && m.reloj.aperturaRivales != null && m.reloj.apertura - m.reloj.aperturaRivales >= 0.1) {
        O.push("En la apertura gasta más tiempo que sus rivales (" + pctEntero(m.reloj.apertura) + " de su reloj en 15 jugadas, contra " + pctEntero(m.reloj.aperturaRivales) + "): una línea poco común lo obliga a pensar.");
      }
    }
    for (const f of m.finales) {
      if (f.n < r.minimo) continue;
      const zz = z(f, m.base), dif = f.puntos - m.base;
      if (zz <= -1.28 && dif <= -0.05) {
        D.push("En los finales " + f.tipo + " saca " + pct(f.puntos) + " (" + f.n + " partidas; su promedio es " + pct(m.base) + ").");
        O.push("Busca cambiar piezas hacia un final " + f.tipo + ".");
      } else if (zz >= 1.28 && dif >= 0.05) {
        F.push("En los finales " + f.tipo + " saca " + pct(f.puntos) + " (" + f.n + " partidas).");
        A.push("Evita los finales " + f.tipo + ": ahí rinde más que en el resto.");
      }
    }
    const v = m.conversion.ventaja, d = m.conversion.desventaja;
    if (v.n >= r.minimo && v.ganadas / v.n < 0.6) D.push("Le cuesta ganar los finales con ventaja: de " + v.n + " convirtió " + v.ganadas + " (" + pctEntero(v.ganadas / v.n) + ").");
    if (d.n >= r.minimo && d.salvadas / d.n >= 0.4) F.push("Se defiende bien en los finales con desventaja: salvó " + d.salvadas + " de " + d.n + ".");
  }

  function foda(r) {
    const F = [], D = [], O = [], A = [];
    const w = r.porColor.w, b = r.porColor.b;
    if (w.n >= r.minimo && b.n >= r.minimo && Math.abs(w.puntos - b.puntos) >= 0.03) {
      const mejor = w.puntos > b.puntos ? "w" : "b";
      const peor = mejor === "w" ? "b" : "w";
      F.push("Rinde más con " + colorEs(mejor) + ": " + pct(r.porColor[mejor].puntos) + " en " + r.porColor[mejor].n + " partidas.");
      D.push("Con " + colorEs(peor) + " saca menos: " + pct(r.porColor[peor].puntos) + " en " + r.porColor[peor].n + " partidas.");
    }
    r.fuertes.slice(0, 3).forEach((l) => {
      F.push("Con " + colorEs(l.color) + ", en " + lineaEs(l.sec) + " saca " + pct(l.puntos) + " (" + l.n + " partidas; su promedio con ese color es " + pct(l.base) + ").");
    });
    r.debiles.slice(0, 4).forEach((l) => {
      D.push("Con " + colorEs(l.color) + ", en " + lineaEs(l.sec) + " saca " + pct(l.puntos) + " (" + l.n + " partidas; su promedio con ese color es " + pct(l.base) + ").");
    });

    const ritmos = r.porRitmo.filter((x) => x.n >= r.minimo && x.ritmo !== "sin dato");
    if (ritmos.length >= 2) {
      const orden = ritmos.slice().sort((a, b) => b.puntos - a.puntos);
      const alto = orden[0], bajo = orden[orden.length - 1];
      if (alto.puntos - bajo.puntos >= 0.05) {
        F.push("Su mejor ritmo es " + alto.ritmo + ": " + pct(alto.puntos) + " en " + alto.n + " partidas.");
        D.push("En " + bajo.ritmo + " rinde menos: " + pct(bajo.puntos) + " en " + bajo.n + " partidas. Mira también contra quién jugó en cada ritmo (tabla de Elo).");
      }
    }
    const d = r.duracion;
    if (d.perdidasConJugadas >= r.minimo && d.perdidasCortas / d.perdidasConJugadas >= 0.3) {
      D.push(Math.round(100 * d.perdidasCortas / d.perdidasConJugadas) + " % de sus derrotas terminan antes de la jugada 25: suele caer temprano, en la apertura o el medio juego.");
    }
    const parejos = r.porElo.find((x) => x.tramo === "Parejos (±50)");
    if (parejos && parejos.n >= r.minimo) {
      (parejos.puntos >= 0.55 ? F : D).push("Contra rivales de su mismo Elo saca " + pct(parejos.puntos) + " (" + parejos.n + " partidas).");
    }

    r.improvisa.slice(0, 3).forEach((x) => {
      O.push("Con " + colorEs(x.color) + ", después de " + lineaEs(x.sec) + " no tiene una jugada fija: la más usada, " + sanEs(x.opciones[0].san) + ", sale solo en el " + Math.round(100 * x.reparto) + " % de las veces. Ahí improvisa.");
    });
    ["w", "b"].forEach((c) => {
      const p = r.principal[c];
      if (p.sec.length >= 6) {
        O.push("Con " + colorEs(c) + " es predecible: repite " + lineaEs(p.sec) + " (" + p.n + " partidas). Se puede preparar a fondo.");
      }
    });
    if (r.porAnio.length >= 3) {
      const ult = r.porAnio[r.porAnio.length - 1];
      if (ult.n >= r.minimo && r.global.puntos - ult.puntos >= 0.05) {
        O.push("Viene a la baja: en " + ult.anio + " saca " + pct(ult.puntos) + ", contra " + pct(r.global.puntos) + " de su historial.");
      }
    }

    r.fuertes.slice(0, 3).forEach((l) => {
      A.push("Evita " + lineaEs(l.sec) + ": ahí saca " + pct(l.puntos) + " con " + colorEs(l.color) + ".");
    });
    if (parejos && parejos.n >= r.minimo && r.porElo.length) {
      const arriba = r.porElo.filter((x) => /encima/.test(x.tramo) && x.n >= r.minimo);
      arriba.forEach((x) => {
        if (x.puntos >= 0.4) A.push("Aguanta bien contra gente más fuerte: " + pct(x.puntos) + " cuando el rival tiene " + x.tramo.toLowerCase() + " (" + x.n + " partidas).");
      });
    }
    if (r.masAlla) fodaMasAlla(r, F, D, O, A);
    return { fortalezas: F, debilidades: D, oportunidades: O, amenazas: A };
  }

  // ------------------------------------------------------------ el motor

  // Las posiciones que vale la pena mirar con Stockfish:
  //   - cada jugada del RIVAL en los planes: ¿su jugada de siempre es buena?
  //     Si pierde medio peón o más, es una trampa para prepararle.
  //   - cada jugada NUESTRA en los planes: que la recomendación no sea un
  //     error (los números pueden premiar una jugada mala que él no castigó).
  // Cada tarea trae la secuencia ANTES de la jugada y la jugada.
  function tareasDelMotor(r, tope) {
    const max = tope || 30;
    const tareas = [];
    const vistas = new Set();
    function juntar(nodos, sec, lado, profundidad) {
      for (const x of nodos) {
        const clave = sec.concat(x.san).join(" ");
        if (!vistas.has(clave) && profundidad <= 8) {
          vistas.add(clave);
          tareas.push({ clave, lado, sec: sec.slice(), jugada: x.san, quien: x.quien, n: x.n, profundidad });
        }
        juntar(x.hijos || [], sec.concat(x.san), lado, profundidad + 1);
      }
    }
    juntar(r.conBlancas.plan, [], "conBlancas", 0);
    juntar(r.conNegras.plan, [], "conNegras", 0);
    // Primero lo más jugado y lo más temprano: si se corta, se cortó lo menos importante.
    tareas.sort((a, b) => b.n - a.n || a.profundidad - b.profundidad);
    return tareas.slice(0, max);
  }

  // `evals` trae, por clave: { antes: eval de la posición antes (desde las
  // blancas), mejor: SAN de la mejor jugada, despues: eval tras la jugada }.
  function aplicarMotor(r, tareas, evals, detalle) {
    const errores = [], cuidado = [], lineas = [];
    for (const t of tareas) {
      const e = evals[t.clave];
      if (!e || e.antes == null || e.despues == null) continue;
      const mueveBlancas = t.sec.length % 2 === 0;
      const signo = mueveBlancas ? 1 : -1;
      const perdida = signo * (e.antes - e.despues);   // cuánto empeora para quien mueve
      const fila = { lado: t.lado, sec: t.sec, jugada: t.jugada, quien: t.quien, n: t.n, antes: e.antes, despues: e.despues, mejor: e.mejor, perdida };
      lineas.push(fila);
      if (e.mejor && e.mejor === t.jugada) continue;
      if (t.quien === "rival" && perdida >= 0.6) errores.push(fila);
      if (t.quien === "tu" && perdida >= 1.0) cuidado.push(fila);
    }
    errores.sort((a, b) => b.perdida * Math.sqrt(b.n) - a.perdida * Math.sqrt(a.n));
    r.motor = { detalle: detalle || "", errores, cuidado, lineas };
    // Lo que el motor encontró va también al FODA.
    const f = foda(r);
    errores.slice(0, 4).forEach((x) => {
      f.oportunidades.unshift("Después de " + lineaEs(x.sec) + " suele jugar " + sanEs(x.jugada) + " (" + x.n + " partidas), y Stockfish dice que es un error: la posición pasa de " + textoEval(x.antes) + " a " + textoEval(x.despues) + ". Lo mejor era " + (x.mejor ? sanEs(x.mejor) : "otra jugada") + ".");
    });
    cuidado.slice(0, 3).forEach((x) => {
      f.amenazas.unshift("Ojo con " + lineaEs(x.sec.concat(x.jugada)) + ": a él le fue mal ahí, pero Stockfish la da como error (" + textoEval(x.antes) + " → " + textoEval(x.despues) + "). Mejor " + (x.mejor ? sanEs(x.mejor) : "otra jugada") + ".");
    });
    r.foda = f;
    return r;
  }

  return {
    leerPgn, jugadasDe, jugadasYRelojes, jugadores, claveNombre, analizar, ritmoDe, finDe, partidasDelRival,
    sanEs, lineaEs, pct, textoEval, minimo, POCAS, tipoDeFinal, esFinal, FIN_ES,
    tareasDelMotor, aplicarMotor, fenDe,
  };
});
