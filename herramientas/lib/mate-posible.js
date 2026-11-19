/* ¿Puede un bando dar mate con ALGUNA serie de jugadas legales?

   Es la pregunta de las Leyes del Ajedrez cada vez que el resultado depende
   del material: la caída de bandera (art. 6.9), la segunda jugada ilegal
   (7.5.5), el abandono contra el rey solo (5.1.2), la posición muerta
   (5.2.2). La contesta el árbitro, y la contesta mal quien piensa en «mate
   forzado»: con rey y caballo no se fuerza nada, pero si el rival tiene un
   peón que tapa una casilla, la serie existe y gana el del caballo.

   Lo usa herramientas/verificar-aula-arbitraje.js para no dejar pasar ningún
   diagrama del Aula de Arbitraje con el resultado equivocado:

     legal(fen)                 → null o el motivo por el que no es legal.
     serieDeMate(fen, bando, n) → la serie más corta (jugadas en inglés, como
                                  las da chess.js) con la que `bando` ("w" o
                                  "b") da mate, de hasta n medias jugadas, con
                                  los dos jugando a favor del mate («ayudado»).
                                  null si no la hay en n.
     sinMate(fen, bando)        → { probado: true, motivo } si `bando` no
                                  puede dar mate NUNCA; { probado: false } si
                                  no se pudo demostrar (entonces el
                                  verificador falla: nada se da por bueno sin
                                  prueba).
     comprobarSerie(fen, serie, bando) → { ok, motivo }: repite una serie ya
                                  escrita y dice si termina en mate.

   La prueba de «nunca» es por material (rey solo; rey y una pieza menor
   contra rey solo; solo alfiles, todos del mismo color) o, en las posiciones
   bloqueadas, recorriendo TODAS las posiciones a las que se puede llegar: son
   pocas (solo se mueven los reyes) y si en ninguna hay mate, no lo hay. */
"use strict";
const { Chess } = require("chess.js");

function color(casilla) {
  const f = casilla.charCodeAt(0) - 97, r = Number(casilla[1]) - 1;
  return (f + r) % 2 === 0 ? "oscura" : "clara";
}

function piezas(g) {
  const out = [];
  g.SQUARES.forEach((c) => { const p = g.get(c); if (p) out.push({ casilla: c, tipo: p.type, color: p.color }); });
  return out;
}

function legal(fen) {
  const g = new Chess();
  const v = g.validate_fen(fen);
  if (!v.valid) return "la FEN no es válida: " + v.error;
  if (!g.load(fen)) return "la FEN no carga";
  const ps = piezas(g);
  for (const c of ["w", "b"]) {
    const mias = ps.filter((p) => p.color === c);
    const reyes = mias.filter((p) => p.tipo === "k").length;
    if (reyes !== 1) return "el bando " + c + " tiene " + reyes + " reyes";
    const peones = mias.filter((p) => p.tipo === "p").length;
    if (peones > 8) return "más de 8 peones";
    // Las piezas de más solo pueden salir de coronar: no más que los peones que faltan.
    const extra = Math.max(0, mias.filter((p) => p.tipo === "q").length - 1) + Math.max(0, mias.filter((p) => p.tipo === "r").length - 2)
      + Math.max(0, mias.filter((p) => p.tipo === "n").length - 2) + Math.max(0, mias.filter((p) => p.tipo === "b").length - 2);
    if (extra > 8 - peones) return "piezas de más que no salen de ninguna coronación";
    if (mias.length > 16) return "más de 16 piezas";
  }
  if (ps.some((p) => p.tipo === "p" && (p.casilla[1] === "1" || p.casilla[1] === "8"))) return "un peón en la primera o la última fila";
  const partes = fen.split(" ");
  partes[1] = partes[1] === "w" ? "b" : "w";
  partes[3] = "-";
  const alReves = new Chess();
  if (alReves.load(partes.join(" ")) && alReves.in_check()) return "el bando que no mueve está en jaque";
  // Derechos de enroque: el rey y la torre tienen que estar en su casilla.
  const enroque = fen.split(" ")[2];
  const en = (c, t, col) => { const p = g.get(c); return p && p.type === t && p.color === col; };
  if (/[KQ]/.test(enroque) && !en("e1", "k", "w")) return "derecho de enroque blanco sin el rey en e1";
  if (/[kq]/.test(enroque) && !en("e8", "k", "b")) return "derecho de enroque negro sin el rey en e8";
  if (enroque.includes("K") && !en("h1", "r", "w")) return "enroque corto blanco sin la torre en h1";
  if (enroque.includes("Q") && !en("a1", "r", "w")) return "enroque largo blanco sin la torre en a1";
  if (enroque.includes("k") && !en("h8", "r", "b")) return "enroque corto negro sin la torre en h8";
  if (enroque.includes("q") && !en("a8", "r", "b")) return "enroque largo negro sin la torre en a8";
  return null;
}

// La clave de una posición para no visitarla dos veces: piezas, turno, enroque y al paso.
const clave = (fen) => fen.split(" ").slice(0, 4).join(" ");

function serieDeMate(fen, bando, maxPly) {
  const inicio = new Chess(fen);
  const otro = bando === "w" ? "b" : "w";
  const vistos = new Map([[clave(inicio.fen()), null]]);
  let frente = [inicio.fen()];
  for (let ply = 0; ply < maxPly && frente.length; ply++) {
    const siguiente = [];
    for (const f of frente) {
      const g = new Chess(f);
      for (const m of g.moves({ verbose: true })) {
        g.move(m);
        const nf = g.fen(), k = clave(nf);
        if (!vistos.has(k)) {
          vistos.set(k, { de: clave(f), san: m.san });
          if (g.in_checkmate() && g.turn() === otro) {
            const serie = [];
            let x = k;
            while (vistos.get(x)) { serie.unshift(vistos.get(x).san); x = vistos.get(x).de; }
            return serie;
          }
          if (!g.game_over()) siguiente.push(nf);
        }
        g.undo();
      }
    }
    frente = siguiente;
  }
  return null;
}

function sinMate(fen, bando, tope) {
  const g = new Chess(fen);
  const ps = piezas(g);
  const mias = ps.filter((p) => p.color === bando && p.tipo !== "k");
  const suyas = ps.filter((p) => p.color !== bando && p.tipo !== "k");
  if (!mias.length) return { probado: true, motivo: "solo tiene el rey" };
  if (mias.length === 1 && "nb".includes(mias[0].tipo) && !suyas.length) return { probado: true, motivo: "rey y una pieza menor contra el rey solo" };
  const resto = ps.filter((p) => p.tipo !== "k");
  if (resto.length && resto.every((p) => p.tipo === "b") && new Set(resto.map((p) => color(p.casilla))).size === 1) {
    return { probado: true, motivo: "solo hay alfiles, todos de casillas del mismo color" };
  }
  // Recorrer todo lo que se puede alcanzar (solo sirve si es poco: posiciones bloqueadas).
  const otro = bando === "w" ? "b" : "w";
  const max = tope || 200000;
  const vistos = new Set([clave(g.fen())]);
  const cola = [g.fen()];
  while (cola.length) {
    if (vistos.size > max) return { probado: false, motivo: "demasiadas posiciones para recorrerlas todas" };
    const f = cola.pop();
    const h = new Chess(f);
    for (const m of h.moves({ verbose: true })) {
      h.move(m);
      if (h.in_checkmate() && h.turn() === otro) return { probado: false, motivo: "hay una posición alcanzable con mate", fen: h.fen() };
      const k = clave(h.fen());
      if (!vistos.has(k)) { vistos.add(k); cola.push(h.fen()); }
      h.undo();
    }
  }
  return { probado: true, motivo: "se recorrieron las " + vistos.size + " posiciones alcanzables y en ninguna hay mate" };
}

/* Repite una serie ya escrita (en inglés, como chess.js) y dice si termina en
   mate del rival de `bando`. Es lo que corre el verificador: buscar la serie
   es lento, comprobarla es instantáneo. */
function comprobarSerie(fen, serie, bando) {
  const g = new Chess(fen);
  for (const san of serie) if (!g.move(san, { sloppy: true })) return { ok: false, motivo: "la jugada " + san + " no es legal" };
  if (!g.in_checkmate()) return { ok: false, motivo: "la serie no termina en mate" };
  if (g.turn() === bando) return { ok: false, motivo: "el mate es contra el bando equivocado" };
  return { ok: true };
}

module.exports = { legal, serieDeMate, sinMate, comprobarSerie };

/*! rev bfb5bbb0d2d82f9f */
