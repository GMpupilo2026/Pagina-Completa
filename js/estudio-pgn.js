/* ===== Ajedrez Integral — el árbol de jugadas de un estudio =====
 *
 * «Mis estudios» (entreno/mis-estudios.html) guarda cada capítulo en PGN, el
 * formato que entienden Lichess, Chess.com y cualquier programa de ajedrez:
 * así un alumno puede traer sus partidas y llevarse sus estudios. Este módulo
 * pasa de PGN a un árbol y de vuelta, sin pantalla (se prueba en Node con
 * chess.js en verificar-mis-estudios.js).
 *
 * Un nodo es { id, san, fen, ply, comentario, nags, casillas, flechas, hijos }.
 * La raíz no tiene jugada: lleva el FEN de arranque y el comentario de antes
 * de la primera jugada. hijos[0] es la línea principal; los demás, variantes.
 *
 * Lo que se lee de un PGN:
 *   - las etiquetas [Event "…"], también [FEN "…"] para empezar en otra
 *     posición;
 *   - las jugadas, que se juegan con chess.js: una que no es legal corta ahí
 *     esa línea y se avisa (`avisos`), nunca se guarda una jugada imposible;
 *   - las variantes ( … ), anidadas;
 *   - los comentarios { … } y ; …, y en ellos las marcas de Lichess:
 *     [%csl Ge4,Rd5] (casillas) y [%cal Ge2e4] (flechas);
 *   - los NAG: $1 o !, ?, !!, ??, !?, ?!, y los de posición (=, +=, ±…).
 *   - varias partidas seguidas: cada una es un capítulo.
 *
 * Ver «Mis estudios» en docs/decisiones/entrenamiento.md.
 */
(function () {
  "use strict";

  const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  function claseChess() {
    if (typeof Chess !== "undefined") return Chess;
    if (typeof require === "function") { const m = require("chess.js"); return m.Chess || m; }
    return null;
  }
  function nuevoJuego(fen) {
    const C = claseChess();
    return fen && fen !== INICIAL ? new C(fen) : new C();
  }

  // Los NAG de jugada y de posición, con el signo que se ve en pantalla.
  const NAG_SIGNO = { 1: "!", 2: "?", 3: "!!", 4: "??", 5: "!?", 6: "?!", 7: "□", 10: "=", 13: "∞", 14: "⩲", 15: "⩱", 16: "±", 17: "∓", 18: "+−", 19: "−+", 22: "⨀", 32: "⟳", 36: "→", 40: "↑", 132: "⇆", 146: "N" };
  const SIGNO_NAG = { "!": 1, "?": 2, "!!": 3, "??": 4, "!?": 5, "?!": 6 };
  // Qué quiere decir cada uno, para el lector de pantalla y el título del botón.
  const NAG_NOMBRE = { 1: "buena jugada", 2: "error", 3: "jugada brillante", 4: "error grave", 5: "jugada interesante", 6: "jugada dudosa", 7: "única jugada", 10: "posición igualada", 13: "posición poco clara", 14: "las blancas están algo mejor", 15: "las negras están algo mejor", 16: "las blancas están mejor", 17: "las negras están mejor", 18: "las blancas ganan", 19: "las negras ganan", 22: "zugzwang", 32: "ventaja de desarrollo", 36: "iniciativa", 40: "ataque", 132: "contrajuego", 146: "novedad" };
  const NAG_DE_JUGADA = [1, 2, 3, 4, 5, 6, 7];

  let siguienteId = 1;
  const nuevoId = () => "n" + (siguienteId++);

  function nodo(datos) {
    return Object.assign({ id: nuevoId(), san: null, fen: INICIAL, ply: 0, comentario: "", nags: [], casillas: [], flechas: [], hijos: [], padre: null }, datos);
  }

  // ---------- Comentarios: el texto y las marcas de Lichess ----------
  const MARCA = /\[%(csl|cal)\s+([^\]]*)\]/g;
  function leerComentario(texto, n) {
    let limpio = String(texto).replace(MARCA, (_, tipo, lista) => {
      lista.split(/[\s,]+/).filter(Boolean).forEach((m) => {
        if (tipo === "csl" && /^[GRYB][a-h][1-8]$/.test(m)) n.casillas.push(m);
        if (tipo === "cal" && /^[GRYB][a-h][1-8][a-h][1-8]$/.test(m)) n.flechas.push(m);
      });
      return " ";
    });
    // Las demás órdenes [%clk …], [%eval …] no son del alumno: no se muestran.
    limpio = limpio.replace(/\[%[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
    if (limpio) n.comentario = n.comentario ? n.comentario + " " + limpio : limpio;
  }

  function escribirComentario(n) {
    const partes = [];
    if (n.casillas.length) partes.push("[%csl " + n.casillas.join(",") + "]");
    if (n.flechas.length) partes.push("[%cal " + n.flechas.join(",") + "]");
    // Una llave dentro del comentario lo cerraría antes de tiempo.
    if (n.comentario) partes.push(String(n.comentario).replace(/[{}]/g, ""));
    return partes.length ? "{ " + partes.join(" ") + " }" : "";
  }

  // ---------- Leer PGN ----------
  function fichas(texto) {
    const out = [];
    let i = 0;
    const s = String(texto || "").replace(/\r\n?/g, "\n");
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === "[") {
        const fin = s.indexOf("]", i);
        const linea = s.slice(i, fin < 0 ? s.length : fin + 1);
        const m = /^\[\s*([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]$/.exec(linea);
        if (m) out.push({ t: "tag", k: m[1], v: m[2].replace(/\\(.)/g, "$1") });
        i = fin < 0 ? s.length : fin + 1;
        continue;
      }
      if (c === "{") {
        const fin = s.indexOf("}", i);
        out.push({ t: "com", v: s.slice(i + 1, fin < 0 ? s.length : fin) });
        i = fin < 0 ? s.length : fin + 1;
        continue;
      }
      if (c === ";") {
        const fin = s.indexOf("\n", i);
        out.push({ t: "com", v: s.slice(i + 1, fin < 0 ? s.length : fin) });
        i = fin < 0 ? s.length : fin + 1;
        continue;
      }
      if (c === "(") { out.push({ t: "(" }); i++; continue; }
      if (c === ")") { out.push({ t: ")" }); i++; continue; }
      if (c === "$") {
        const m = /^\$(\d+)/.exec(s.slice(i));
        if (m) { out.push({ t: "nag", v: parseInt(m[1], 10) }); i += m[0].length; continue; }
        i++; continue;
      }
      const m = /^[^\s{}();[\]$]+/.exec(s.slice(i));
      const pal = m ? m[0] : c;
      i += pal.length;
      if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(pal)) { out.push({ t: "res", v: pal }); continue; }
      // «12.» o «12...» sueltos, o pegados a la jugada («12.e4»).
      const sinNumero = pal.replace(/^\d+\.+/, "");
      if (!sinNumero) continue;
      const nag = /^(.*?)([!?]{1,2})$/.exec(sinNumero);
      if (nag && nag[1]) { out.push({ t: "jug", v: nag[1] }); if (SIGNO_NAG[nag[2]]) out.push({ t: "nag", v: SIGNO_NAG[nag[2]] }); continue; }
      if (SIGNO_NAG[sinNumero]) { out.push({ t: "nag", v: SIGNO_NAG[sinNumero] }); continue; }
      const pos = { "=": 10, "+=": 14, "=+": 15, "+/=": 14, "=/+": 15, "+/-": 16, "-/+": 17, "+-": 18, "-+": 19, "∞": 13, "±": 16, "∓": 17, "⩲": 14, "⩱": 15 }[sinNumero];
      if (pos) { out.push({ t: "nag", v: pos }); continue; }
      out.push({ t: "jug", v: sinNumero });
    }
    return out;
  }

  // Lee un texto con una o varias partidas. Devuelve [{ etiquetas, raiz, resultado, avisos }].
  function leer(texto) {
    const fs = fichas(texto);
    const partidas = [];
    let p = null;
    let k = 0;

    function empezar() {
      p = { etiquetas: {}, raiz: null, resultado: "*", avisos: [] };
      partidas.push(p);
    }
    function raizDe(p) {
      if (p.raiz) return p.raiz;
      let fen = INICIAL;
      const pedido = p.etiquetas.FEN;
      if (pedido) {
        try {
          const ok = nuevoJuego().validate_fen(pedido);
          if (ok && ok.valid) fen = new (claseChess())(pedido).fen();
          else p.avisos.push("La posición de arranque (FEN) no se pudo leer: el capítulo empieza en la posición inicial.");
        } catch (e) { p.avisos.push("La posición de arranque (FEN) no se pudo leer."); }
      }
      p.raiz = nodo({ fen, ply: plyDe(fen) });
      return p.raiz;
    }

    while (k < fs.length) {
      const f = fs[k];
      if (f.t === "tag") {
        if (!p || p.raiz) empezar();
        p.etiquetas[f.k] = f.v;
        k++;
        continue;
      }
      if (!p) empezar();
      // La línea de jugadas de esta partida, con sus variantes.
      const raiz = raizDe(p);
      // pila de { ultimo, roto }: «ultimo» es el nodo tras el que va la próxima jugada.
      const pila = [];
      let ultimo = raiz, roto = false;
      while (k < fs.length && fs[k].t !== "tag") {
        const g = fs[k++];
        if (g.t === "res") { if (!pila.length) { p.resultado = g.v; break; } continue; }
        if (g.t === "com") { leerComentario(g.v, ultimo); continue; }
        if (g.t === "nag") { if (ultimo !== raiz && ultimo.nags.indexOf(g.v) < 0) ultimo.nags.push(g.v); continue; }
        if (g.t === "(") {
          // La variante es otra jugada EN LUGAR de la última: sale de su padre.
          pila.push({ ultimo, roto });
          ultimo = ultimo.padre || ultimo;
          continue;
        }
        if (g.t === ")") {
          const prev = pila.pop();
          if (prev) { ultimo = prev.ultimo; roto = prev.roto; }
          continue;
        }
        if (roto) continue;
        const hijo = jugar(ultimo, g.v);
        if (!hijo) {
          roto = true;
          p.avisos.push("La jugada «" + g.v + "» no es legal en su posición: la línea se corta ahí.");
          continue;
        }
        ultimo = hijo;
      }
      // Lo que venga después (con etiquetas o sin ellas) es otra partida.
      p = null;
    }
    return partidas.filter((x) => x.raiz && (x.raiz.hijos.length || Object.keys(x.etiquetas).length || x.raiz.comentario));
  }

  function plyDe(fen) {
    const partes = String(fen).split(" ");
    const n = parseInt(partes[5], 10) || 1;
    return (n - 1) * 2 + (partes[1] === "b" ? 1 : 0);
  }

  // Juega `san` después de `n`. Si ya estaba, devuelve ese hijo (no se duplica).
  function jugar(n, san, promocion) {
    let juego;
    try { juego = nuevoJuego(n.fen); } catch (e) { return null; }
    let mv = null;
    try {
      mv = typeof san === "object" ? juego.move(san) : juego.move(String(san).replace(/[+#]+$/, "").replace(/^0-0-0$/, "O-O-O").replace(/^0-0$/, "O-O"), { sloppy: true });
    } catch (e) { mv = null; }
    if (!mv) return null;
    const ya = n.hijos.find((h) => h.san === mv.san);
    if (ya) return ya;
    const h = nodo({ san: mv.san, fen: juego.fen(), ply: n.ply + 1, padre: n, desde: mv.from, hasta: mv.to });
    n.hijos.push(h);
    return h;
  }

  // ---------- Escribir PGN ----------
  function numero(ply, negrasDespuesDeAlgo) {
    const n = Math.floor(ply / 2) + 1;
    return ply % 2 === 0 ? n + ". " : (negrasDespuesDeAlgo ? n + "... " : "");
  }

  function escribirLinea(n, forzarNumero) {
    // Escribe la línea que sigue a `n` (su hijos[0]) con las variantes de cada paso.
    const trozos = [];
    let actual = n, pedirNumero = forzarNumero;
    while (actual.hijos.length) {
      const [prin, ...otras] = actual.hijos;
      trozos.push(escribirJugada(prin, pedirNumero));
      pedirNumero = false;
      const comPrin = escribirComentario(prin);
      if (comPrin) { trozos.push(comPrin); pedirNumero = true; }
      otras.forEach((v) => {
        const dentro = [escribirJugada(v, true)];
        const c = escribirComentario(v);
        if (c) dentro.push(c);
        const resto = escribirLinea(v, !!c);
        if (resto) dentro.push(resto);
        trozos.push("(" + dentro.join(" ") + ")");
        pedirNumero = true;
      });
      actual = prin;
    }
    return trozos.join(" ");
  }

  function escribirJugada(n, pedirNumero) {
    const ply = n.ply - 1;
    const num = ply % 2 === 0 ? (Math.floor(ply / 2) + 1) + ". " : (pedirNumero ? (Math.floor(ply / 2) + 1) + "... " : "");
    return num + n.san + n.nags.map((g) => " $" + g).join("");
  }

  function comillas(v) { return String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " "); }

  function escribir(partida) {
    const et = Object.assign({}, partida.etiquetas || {});
    const raiz = partida.raiz;
    if (raiz.fen !== INICIAL) { et.SetUp = "1"; et.FEN = raiz.fen; } else { delete et.SetUp; delete et.FEN; }
    const res = partida.resultado || "*";
    et.Result = res;
    const orden = ["Event", "Site", "Date", "Round", "White", "Black", "Result"];
    const claves = orden.filter((k) => k in et).concat(Object.keys(et).filter((k) => orden.indexOf(k) < 0));
    const cabecera = claves.map((k) => "[" + k + ' "' + comillas(et[k]) + '"]').join("\n");
    const cuerpo = [];
    const c0 = escribirComentario(raiz);
    if (c0) cuerpo.push(c0);
    const linea = escribirLinea(raiz, raiz.ply % 2 === 1);
    if (linea) cuerpo.push(linea);
    cuerpo.push(res);
    return cabecera + "\n\n" + cuerpo.join(" ") + "\n";
  }

  // ---------- Recorrer y cambiar el árbol ----------
  function camino(n) {
    const out = [];
    for (let x = n; x && x.san; x = x.padre) out.unshift(x);
    return out;
  }
  function lineaPrincipal(raiz) {
    const out = [];
    for (let x = raiz; x.hijos.length; x = x.hijos[0]) out.push(x.hijos[0]);
    return out;
  }
  function buscar(raiz, id) {
    if (raiz.id === id) return raiz;
    for (const h of raiz.hijos) { const r = buscar(h, id); if (r) return r; }
    return null;
  }
  // Sube la variante un lugar entre sus hermanas; si ya es la primera, sube
  // la rama de la que cuelga (como «Promover variante» de Lichess).
  function promover(n) {
    let x = n;
    while (x.padre && x.padre.hijos[0] === x) x = x.padre;
    if (!x.padre) return false;
    const hs = x.padre.hijos;
    const i = hs.indexOf(x);
    hs.splice(i, 1);
    hs.splice(i - 1, 0, x);
    return true;
  }
  function hacerPrincipal(n) {
    let movio = false;
    for (let x = n; x.padre; x = x.padre) {
      const hs = x.padre.hijos;
      const i = hs.indexOf(x);
      if (i > 0) { hs.splice(i, 1); hs.unshift(x); movio = true; }
    }
    return movio;
  }
  function borrarDesde(n) {
    if (!n.padre) return null;
    const hs = n.padre.hijos;
    hs.splice(hs.indexOf(n), 1);
    return n.padre;
  }
  function esVariante(n) {
    for (let x = n; x.padre; x = x.padre) if (x.padre.hijos[0] !== x) return true;
    return false;
  }
  function contar(raiz) {
    let c = 0;
    (function r(x) { x.hijos.forEach((h) => { c++; r(h); }); })(raiz);
    return c;
  }
  function cambiarNag(n, g) {
    const i = n.nags.indexOf(g);
    if (i >= 0) { n.nags.splice(i, 1); return; }
    // Uno solo de los de jugada (! ? !! …) y uno de los de posición.
    const deJugada = NAG_DE_JUGADA.indexOf(g) >= 0;
    n.nags = n.nags.filter((x) => (NAG_DE_JUGADA.indexOf(x) >= 0) !== deJugada);
    n.nags.push(g);
    n.nags.sort((a, b) => a - b);
  }
  // Agrega una línea (SAN o UCI) como variante desde `n`. Devuelve el último nodo.
  function agregarLinea(n, jugadas) {
    let x = n;
    for (const j of jugadas) {
      const uci = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(j) ? { from: j.slice(0, 2), to: j.slice(2, 4), promotion: j[4] } : j;
      const h = jugar(x, uci);
      if (!h) break;
      x = h;
    }
    return x;
  }
  function vacio(fen) {
    return { etiquetas: {}, raiz: nodo({ fen: fen || INICIAL, ply: plyDe(fen || INICIAL) }), resultado: "*", avisos: [] };
  }

  const api = {
    INICIAL, NAG_SIGNO, NAG_NOMBRE, NAG_DE_JUGADA,
    leer, escribir, jugar, camino, lineaPrincipal, buscar, promover, hacerPrincipal,
    borrarDesde, esVariante, contar, cambiarNag, agregarLinea, vacio, plyDe,
  };
  if (typeof window !== "undefined") window.EstudioPGN = api;
  if (typeof module !== "undefined") module.exports = api;
})();
