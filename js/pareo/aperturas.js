/* ===== Pareo Integral — qué apertura se jugó en cada partida =====
 *
 * «Torneos en Pareo Integral» cuenta las aperturas de las partidas que quien
 * organiza publicó en PGN: en un torneo (pestaña Estadísticas), en la ficha
 * de un jugador (con qué abre y cómo le va) y en el año (Ranking del año).
 *
 * La apertura sale de las JUGADAS, nunca de lo que diga el encabezado del
 * PGN: se busca en la lista de abajo la secuencia más larga con la que
 * empieza la partida. Cada secuencia se comprueba con chess.js en
 * herramientas/verificar-pareo-aperturas.js (que cada jugada sea legal, que
 * ninguna se repita y que cada nombre tenga a su familia), así que una mal
 * escrita no reconoce a nadie sin dar error: el verificador es el que avisa.
 * Lo que no está en la lista queda en su familia (lo más largo que sí está)
 * o en «Otras aperturas».
 *
 *   AperturasPareo.reconocer(jugadas)      → { familia, nombre, ply } (SAN de chess.js)
 *   AperturasPareo.deTexto(pgn, Chess)     → la misma, leyendo el PGN con PareoPartida
 *   AperturasPareo.contar(partidas)        → [{ familia, n, blancas, tablas, negras, nombres: [{ nombre, n }] }]
 *                                            partidas: [{ jugadas, r }], r como en una mesa ("1-0", "0-1", "½-½")
 *   AperturasPareo.LISTA                   → [familia, nombre, "jugadas en SAN"]
 *
 * Lógica pura (recibe la clase Chess cuando hace falta), para el navegador y Node.
 */
(function (raiz) {
  "use strict";

  // [familia, nombre, jugadas]. La primera de cada familia es la familia
  // misma (su nombre general). Los nombres, como se dicen acá.
  const LISTA = [
    ["Apertura del peón de rey", "Apertura del peón de rey", "e4"],
    ["Defensa Siciliana", "Defensa Siciliana", "e4 c5"],
    ["Defensa Siciliana", "Siciliana abierta", "e4 c5 Nf3 d6 d4"],
    ["Defensa Siciliana", "Siciliana abierta", "e4 c5 Nf3 Nc6 d4"],
    ["Defensa Siciliana", "Siciliana abierta", "e4 c5 Nf3 e6 d4"],
    ["Defensa Siciliana", "Siciliana Najdorf", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6"],
    ["Defensa Siciliana", "Siciliana Dragón", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6"],
    ["Defensa Siciliana", "Siciliana Scheveningen", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6"],
    ["Defensa Siciliana", "Siciliana clásica", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6"],
    ["Defensa Siciliana", "Siciliana Sveshnikov", "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5"],
    ["Defensa Siciliana", "Siciliana Taimanov", "e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6"],
    ["Defensa Siciliana", "Siciliana Kan", "e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6"],
    ["Defensa Siciliana", "Siciliana Rossolimo", "e4 c5 Nf3 Nc6 Bb5"],
    ["Defensa Siciliana", "Siciliana Moscú", "e4 c5 Nf3 d6 Bb5+"],
    ["Defensa Siciliana", "Siciliana Alapin", "e4 c5 c3"],
    ["Defensa Siciliana", "Siciliana cerrada", "e4 c5 Nc3"],
    ["Defensa Siciliana", "Gambito Smith-Morra", "e4 c5 d4 cxd4 c3"],
    ["Defensa Francesa", "Defensa Francesa", "e4 e6"],
    ["Defensa Francesa", "Francesa, variante del avance", "e4 e6 d4 d5 e5"],
    ["Defensa Francesa", "Francesa, variante del cambio", "e4 e6 d4 d5 exd5"],
    ["Defensa Francesa", "Francesa Winawer", "e4 e6 d4 d5 Nc3 Bb4"],
    ["Defensa Francesa", "Francesa clásica", "e4 e6 d4 d5 Nc3 Nf6"],
    ["Defensa Francesa", "Francesa Rubinstein", "e4 e6 d4 d5 Nc3 dxe4"],
    ["Defensa Francesa", "Francesa Rubinstein", "e4 e6 d4 d5 Nd2 dxe4"],
    ["Defensa Francesa", "Francesa Tarrasch", "e4 e6 d4 d5 Nd2"],
    ["Defensa Caro-Kann", "Defensa Caro-Kann", "e4 c6"],
    ["Defensa Caro-Kann", "Caro-Kann, variante del avance", "e4 c6 d4 d5 e5"],
    ["Defensa Caro-Kann", "Caro-Kann, variante del cambio", "e4 c6 d4 d5 exd5 cxd5"],
    ["Defensa Caro-Kann", "Caro-Kann Panov", "e4 c6 d4 d5 exd5 cxd5 c4"],
    ["Defensa Caro-Kann", "Caro-Kann clásica", "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5"],
    ["Defensa Caro-Kann", "Caro-Kann clásica", "e4 c6 d4 d5 Nd2 dxe4 Nxe4 Bf5"],
    ["Defensa Escandinava", "Defensa Escandinava", "e4 d5"],
    ["Defensa Alekhine", "Defensa Alekhine", "e4 Nf6"],
    ["Defensa Pirc", "Defensa Pirc", "e4 d6 d4 Nf6 Nc3 g6"],
    ["Defensa Moderna", "Defensa Moderna", "e4 g6"],
    ["Defensa Owen", "Defensa Owen", "e4 b6"],
    ["Apertura abierta (1.e4 e5)", "Apertura abierta (1.e4 e5)", "e4 e5"],
    ["Apertura Española", "Apertura Española", "e4 e5 Nf3 Nc6 Bb5"],
    ["Apertura Española", "Española, defensa Berlinesa", "e4 e5 Nf3 Nc6 Bb5 Nf6"],
    ["Apertura Española", "Española, variante del cambio", "e4 e5 Nf3 Nc6 Bb5 a6 Bxc6"],
    ["Apertura Española", "Española abierta", "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Nxe4"],
    ["Apertura Española", "Española cerrada", "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7"],
    ["Apertura Española", "Española, ataque Marshall", "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5"],
    ["Apertura Italiana", "Apertura Italiana", "e4 e5 Nf3 Nc6 Bc4"],
    ["Apertura Italiana", "Giuoco Piano", "e4 e5 Nf3 Nc6 Bc4 Bc5"],
    ["Apertura Italiana", "Gambito Evans", "e4 e5 Nf3 Nc6 Bc4 Bc5 b4"],
    ["Apertura Italiana", "Defensa de los dos caballos", "e4 e5 Nf3 Nc6 Bc4 Nf6"],
    ["Apertura Italiana", "Defensa Húngara", "e4 e5 Nf3 Nc6 Bc4 Be7"],
    ["Apertura Escocesa", "Apertura Escocesa", "e4 e5 Nf3 Nc6 d4"],
    ["Apertura Escocesa", "Gambito Escocés", "e4 e5 Nf3 Nc6 d4 exd4 Bc4"],
    ["Apertura abierta (1.e4 e5)", "Apertura de los tres caballos", "e4 e5 Nf3 Nc6 Nc3"],
    ["Apertura de los cuatro caballos", "Apertura de los cuatro caballos", "e4 e5 Nf3 Nc6 Nc3 Nf6"],
    ["Apertura abierta (1.e4 e5)", "Apertura Ponziani", "e4 e5 Nf3 Nc6 c3"],
    ["Defensa Petrov", "Defensa Petrov", "e4 e5 Nf3 Nf6"],
    ["Defensa Philidor", "Defensa Philidor", "e4 e5 Nf3 d6"],
    ["Apertura abierta (1.e4 e5)", "Gambito Letón", "e4 e5 Nf3 f5"],
    ["Gambito de rey", "Gambito de rey", "e4 e5 f4"],
    ["Gambito de rey", "Gambito de rey aceptado", "e4 e5 f4 exf4"],
    ["Gambito de rey", "Contragambito Falkbeer", "e4 e5 f4 d5"],
    ["Apertura abierta (1.e4 e5)", "Apertura Vienesa", "e4 e5 Nc3"],
    ["Apertura abierta (1.e4 e5)", "Apertura del alfil", "e4 e5 Bc4"],
    ["Apertura abierta (1.e4 e5)", "Apertura del centro", "e4 e5 d4 exd4 Qxd4"],
    ["Apertura abierta (1.e4 e5)", "Gambito danés", "e4 e5 d4 exd4 c3"],
    ["Apertura del peón de dama", "Apertura del peón de dama", "d4"],
    ["Apertura del peón de dama", "Sistema Londres", "d4 d5 Bf4"],
    ["Apertura del peón de dama", "Sistema Londres", "d4 d5 Nf3 Nf6 Bf4"],
    ["Apertura del peón de dama", "Sistema Londres", "d4 Nf6 Bf4"],
    ["Apertura del peón de dama", "Sistema Londres", "d4 Nf6 Nf3 d5 Bf4"],
    ["Apertura del peón de dama", "Sistema Colle", "d4 d5 Nf3 Nf6 e3"],
    ["Apertura del peón de dama", "Ataque Trompowsky", "d4 Nf6 Bg5"],
    ["Apertura del peón de dama", "Defensa Holandesa", "d4 f5"],
    ["Gambito de dama", "Gambito de dama", "d4 d5 c4"],
    ["Gambito de dama", "Gambito de dama aceptado", "d4 d5 c4 dxc4"],
    ["Gambito de dama", "Gambito de dama rehusado", "d4 d5 c4 e6"],
    ["Gambito de dama", "Defensa Tarrasch", "d4 d5 c4 e6 Nc3 c5"],
    ["Gambito de dama", "Defensa Eslava", "d4 d5 c4 c6"],
    ["Gambito de dama", "Defensa Semieslava", "d4 d5 c4 c6 Nf3 Nf6 Nc3 e6"],
    ["Gambito de dama", "Defensa Semieslava", "d4 d5 c4 e6 Nc3 Nf6 Nf3 c6"],
    ["Gambito de dama", "Contragambito Albin", "d4 d5 c4 e5"],
    ["Gambito de dama", "Defensa Chigorin", "d4 d5 c4 Nc6"],
    ["Defensas indias", "Defensas indias", "d4 Nf6"],
    ["Defensas indias", "Defensa India de rey", "d4 Nf6 c4 g6 Nc3 Bg7 e4"],
    ["Defensas indias", "Defensa Grünfeld", "d4 Nf6 c4 g6 Nc3 d5"],
    ["Defensas indias", "Defensa Nimzoindia", "d4 Nf6 c4 e6 Nc3 Bb4"],
    ["Defensas indias", "Defensa India de dama", "d4 Nf6 c4 e6 Nf3 b6"],
    ["Defensas indias", "Defensa Bogoindia", "d4 Nf6 c4 e6 Nf3 Bb4+"],
    ["Defensas indias", "Apertura Catalana", "d4 Nf6 c4 e6 g3"],
    ["Defensas indias", "Defensa Benoni", "d4 Nf6 c4 c5 d5"],
    ["Defensas indias", "Gambito Benko", "d4 Nf6 c4 c5 d5 b5"],
    ["Defensas indias", "Gambito Budapest", "d4 Nf6 c4 e5"],
    ["Apertura Inglesa", "Apertura Inglesa", "c4"],
    ["Apertura Inglesa", "Inglesa simétrica", "c4 c5"],
    ["Apertura Inglesa", "Inglesa, siciliana invertida", "c4 e5"],
    ["Apertura Réti", "Apertura Réti", "Nf3"],
    ["Apertura Réti", "Réti, con c4", "Nf3 d5 c4"],
    ["Otras aperturas", "Apertura Bird", "f4"],
    ["Otras aperturas", "Apertura Larsen", "b3"],
    ["Otras aperturas", "Apertura Polaca", "b4"],
    ["Otras aperturas", "Apertura Grob", "g4"],
    ["Otras aperturas", "Apertura del fianchetto de rey (1.g3)", "g3"],
  ];
  const OTRAS = { familia: "Otras aperturas", nombre: "Otras aperturas", ply: 0 };
  const LINEAS = LISTA.map(([familia, nombre, jugadas]) => ({ familia, nombre, jugadas: jugadas.split(" ") }));

  // La secuencia más larga con la que empieza la partida. Los jaques se
  // comparan sin el «+» (una partida anotada sin él es la misma).
  const sinJaque = (s) => String(s || "").replace(/[+#]+$/, "");
  function reconocer(jugadas) {
    const js = (jugadas || []).map(sinJaque);
    let mejor = null;
    for (const l of LINEAS) {
      if (l.jugadas.length > js.length || (mejor && l.jugadas.length <= mejor.ply)) continue;
      if (l.jugadas.every((x, i) => sinJaque(x) === js[i])) mejor = { familia: l.familia, nombre: l.nombre, ply: l.jugadas.length };
    }
    return mejor || Object.assign({}, OTRAS);
  }

  // Del PGN (o del pedazo que llegue: solo hacen falta las primeras
  // jugadas). PareoPartida lee también las letras en español.
  function deTexto(texto, Chess) {
    const PP = raiz.PareoPartida || (typeof require === "function" ? require("./partida.js") : null);
    if (!PP || !Chess || !texto) return null;
    const l = PP.leer(texto, Chess);
    return l.jugadas.length ? reconocer(l.jugadas) : null;
  }

  const ganador = (r) => {
    const s = String(r || "").replace(/\s+/g, "");
    if (s === "1-0") return "blancas";
    if (s === "0-1") return "negras";
    if (/^(½-½|1\/2-1\/2|=)$/.test(s)) return "tablas";
    return null;
  };

  // Por familia, de la más jugada a la menos, con cómo le fue a cada color y
  // los nombres que hay dentro. Solo cuentan las partidas con resultado.
  function contar(partidas) {
    const por = new Map();
    for (const p of partidas || []) {
      const g = ganador(p.r);
      if (!g || !p.jugadas || !p.jugadas.length) continue;
      const a = reconocer(p.jugadas);
      const f = por.get(a.familia) || { familia: a.familia, n: 0, blancas: 0, tablas: 0, negras: 0, nombres: new Map() };
      f.n += 1;
      f[g] += 1;
      f.nombres.set(a.nombre, (f.nombres.get(a.nombre) || 0) + 1);
      por.set(a.familia, f);
    }
    return [...por.values()]
      .map((f) => Object.assign(f, { nombres: [...f.nombres].map(([nombre, n]) => ({ nombre, n })).sort((x, y) => y.n - x.n || x.nombre.localeCompare(y.nombre, "es")) }))
      .sort((x, y) => y.n - x.n || x.familia.localeCompare(y.familia, "es"));
  }

  const api = { LISTA, reconocer, deTexto, contar, ganador };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.AperturasPareo = api;
})(typeof self !== "undefined" ? self : this);
