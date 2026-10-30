/* ===== Pareo para DGT — el PGN de cada ronda y lo que se le manda a Lichess =====
 *
 * pareo-dgt.html lee el pareo de una ronda en chess-results (Edge Function
 * pareo-dgt) y con él arma dos cosas:
 *   - el PGN que se importa en DGT LiveChess («Rounds» → importar pareo): una
 *     partida SIN jugadas por mesa, con los dos nombres, la ronda y la mesa.
 *     El manual de LiveChess 2.2 dice que el pareo se puede importar «desde
 *     un PGN preparado con otro programa de pareo»; las jugadas las lee
 *     LiveChess de los tableros.
 *   - los formularios de la API de transmisiones de Lichess: el torneo
 *     (/broadcast/new) y cada ronda (/broadcast/{id}/new), y el mismo PGN que
 *     se le empuja a la ronda (/api/broadcast/round/{id}/push) para que el
 *     pareo se vea en Lichess antes de la primera jugada.
 *
 * Solo van las mesas donde se juega: un bye o un «sin emparejar» no es una
 * partida. Y solo las que se eligen: de 100 mesas puede que se transmitan
 * dos («1-2», «1, 5, 12», «1-4, 10»); vacío son todas.
 *
 *   PareoDGT.tnrDe(texto)                    → "1498221" | null
 *   PareoDGT.leerMesas("1-2, 5")             → { mesas: "1-2, 5", lista: [[1,2],[5,5]] } | { error }
 *   PareoDGT.partidas(datos, {mesas})        → las mesas con dos jugadores, de las elegidas
 *   PareoDGT.pgn(datos, opciones)            → el texto del PGN (opciones.jugadas: { mesa: { texto, resultado } }
 *                                              para «Transmitir sin LiveChess»: las jugadas leídas de cada tablero)
 *   PareoDGT.firma(datos)                    → quién juega con quién en cada mesa (para ver si cambió)
 *   PareoDGT.resultadoCR("½ - ½")            → "1/2-1/2" (el resultado de chess-results, para el PGN) | null
 *   PareoDGT.decidir(guardado, datos, mesas) → "esperar" | "nueva" | "cambio" | "igual"
 *   PareoDGT.nombreArchivo(nombre, ronda)    → "torneo-blitz-ronda-3.pgn"
 *   PareoDGT.formTorneo({...}) / formRonda({...}) → [[campo, valor]] para URLSearchParams
 *   PareoDGT.inicioRonda("2026.09.27", "3:00pm") → la hora de la ronda (ms), en hora de Costa Rica
 *   PareoDGT.datosLiveChess(nombre, ficha)   → [{ campo, etiqueta, valor }] de la pestaña «Tournament» de LiveChess
 *   PareoDGT.textoDatos(datos)               → los mismos datos en líneas «Campo: valor» (solo los que tienen valor)
 *   PareoDGT.unirFicha(anterior, nueva)      → la ficha nueva, sin perder lo que ya se sabía
 *
 * Lógica pura, para el navegador y Node (lo prueba verificar-pareo-dgt.js).
 */
(function (raiz) {
  "use strict";

  function tnrDe(entrada) {
    const s = String(entrada == null ? "" : entrada).trim();
    if (/^\d{3,9}$/.test(s)) return s;
    const m = s.match(/^(?:https?:\/\/)?(?:s\d{1,2}\.|www\.)?chess-results\.com\/tnr(\d{3,9})\.aspx(?:[?#].*)?$/i);
    return m ? m[1] : null;
  }

  function quitarTildes(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "");
  }

  // Un valor de encabezado de PGN: sin comillas ni barras sueltas, en una línea.
  function valor(s) {
    return String(s == null ? "" : s).replace(/[\r\n]+/g, " ").replace(/\\/g, "\\\\").replace(/"/g, '\\"').trim();
  }

  // Las mesas elegidas, escritas como en Lichess («slices»): números y rangos
  // separados por comas. Vacío: todas. Devuelve el texto ordenado y sin
  // repetir (así dos formas de escribir lo mismo no cuentan como un cambio).
  const MAX_MESA = 999;
  function leerMesas(texto) {
    const t = String(texto == null ? "" : texto).trim();
    if (!t || /^todas$/i.test(t)) return { mesas: "", lista: [] };
    const tramos = [];
    for (const parte of t.split(/[,;\s]+/).filter(Boolean)) {
      const m = parte.match(/^(\d{1,3})(?:-(\d{1,3}))?$/);
      if (!m) return { error: "«" + parte + "» no es una mesa ni un rango. Escribe, por ejemplo, 1-2 o 1, 5, 12." };
      const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
      if (a < 1 || b > MAX_MESA) return { error: "Las mesas van de 1 a " + MAX_MESA + "." };
      if (b < a) return { error: "En «" + parte + "» el rango va al revés: escribe " + b + "-" + a + "." };
      tramos.push([a, b]);
    }
    tramos.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const lista = [];
    for (const [a, b] of tramos) {
      const ult = lista[lista.length - 1];
      if (ult && a <= ult[1] + 1) ult[1] = Math.max(ult[1], b);
      else lista.push([a, b]);
    }
    return { mesas: lista.map(([a, b]) => (a === b ? String(a) : a + "-" + b)).join(", "), lista };
  }

  function partidas(datos, opciones) {
    const o = opciones || {};
    const elegidas = leerMesas(o.mesas);
    const lista = elegidas.lista || [];
    const entra = (n) => !lista.length || lista.some(([a, b]) => n >= a && n <= b);
    return ((datos && datos.mesas) || [])
      .filter((m) => m.negras && m.blancas && entra(m.mesa))
      .sort((a, b) => a.mesa - b.mesa);
  }

  function pgn(datos, opciones) {
    const o = opciones || {};
    const t = o.sinTildes ? quitarTildes : (s) => String(s || "");
    const evento = o.evento || datos.torneo || "Torneo";
    const fecha = /^\d{4}\.\d{2}\.\d{2}$/.test(datos.fecha || "") ? datos.fecha : "????.??.??";
    const bloques = partidas(datos, o).map((m) => {
      const j = o.jugadas && o.jugadas[m.mesa];
      const resultado = j && /^(1-0|0-1|1\/2-1\/2)$/.test(j.resultado) ? j.resultado : "*";
      const tags = [
        ["Event", t(evento)],
        ["Site", t(o.sitio || "?")],
        ["Date", fecha],
        ["Round", String(datos.ronda || "?")],
        ["Board", String(m.mesa)],
        ["White", t(m.blancas.nombre)],
        ["Black", t(m.negras.nombre)],
        ["Result", resultado],
      ];
      if (m.blancas.titulo) tags.push(["WhiteTitle", m.blancas.titulo]);
      if (m.negras.titulo) tags.push(["BlackTitle", m.negras.titulo]);
      if (m.blancas.elo) tags.push(["WhiteElo", String(m.blancas.elo)]);
      if (m.negras.elo) tags.push(["BlackElo", String(m.negras.elo)]);
      if (m.blancas.fide) tags.push(["WhiteFideId", m.blancas.fide]);
      if (m.negras.fide) tags.push(["BlackFideId", m.negras.fide]);
      return tags.map(([k, v]) => "[" + k + ' "' + valor(v) + '"]').join("\n") + "\n\n" + (j && j.texto ? j.texto : "*") + "\n";
    });
    return bloques.join("\n");
  }

  // El resultado de una mesa como lo escribe chess-results («1 - 0», «½ - ½»,
  // «+ - -» si uno no se presentó), en el formato del PGN; null si todavía no
  // está o no es una partida (los dos ausentes: «- - -»).
  function resultadoCR(texto) {
    const s = String(texto || "").replace(/\s+/g, "").replace(/½/g, "1/2").replace(/0\.5|0,5/g, "1/2");
    if (s === "1-0" || s === "+--" || s === "+-") return "1-0";
    if (s === "0-1" || s === "--+" || s === "-+") return "0-1";
    if (s === "1/2-1/2") return "1/2-1/2";
    return null;
  }

  // Quién juega con quién en cada mesa, por número inicial y nombre: si
  // chess-results vuelve a subir la ronda con un cambio, la firma cambia.
  function firma(datos) {
    return ((datos && datos.mesas) || [])
      .map((m) => m.mesa + ":" + m.blancas.no + "/" + m.blancas.nombre + "-" + (m.negras ? m.negras.no + "/" + m.negras.nombre : m.sinRival || "-"))
      .join("|");
  }

  // Qué hacer con lo que se acaba de leer, frente a lo que ya se hizo con ese
  // torneo. `guardado`: { rondas: { "3": { firma } } }.
  //   "esperar": todavía no hay ronda emparejada (ninguna mesa con dos jugadores).
  //   "nueva":   una ronda que todavía no tiene archivo.
  //   "cambio":  la misma ronda, pero con otro pareo (se corrigió en chess-results)
  //              o con otras mesas elegidas: hay que volver a armar el archivo.
  //   "igual":   nada nuevo.
  function decidir(guardado, datos, mesas) {
    if (!datos || !datos.ronda || !partidas(datos).length) return "esperar";
    const ya = guardado && guardado.rondas && guardado.rondas[String(datos.ronda)];
    if (!ya) return "nueva";
    const elegidas = leerMesas(mesas).mesas || "";
    return ya.firma === firma(datos) && (ya.mesasElegidas || "") === elegidas ? "igual" : "cambio";
  }

  function slug(s) {
    return quitarTildes(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "torneo";
  }

  function nombreArchivo(nombre, ronda) {
    return slug(nombre) + "-ronda-" + (Number(ronda) || 0) + ".pgn";
  }

  // El torneo de la transmisión. ritmo: "blitz" | "rapid" | "standard".
  const RITMO_TEXTO = { blitz: "Blitz", rapid: "Rápidas", standard: "Clásicas" };
  function formTorneo(d) {
    const nombre = String(d.nombre || "").trim().slice(0, 80);
    const campos = [
      ["name", nombre.length >= 3 ? nombre : (nombre + " — torneo").slice(0, 80)],
      ["visibility", d.visibilidad === "unlisted" ? "unlisted" : "public"],
      ["showScores", "true"],
      ["info.timeZone", "America/Costa_Rica"],
    ];
    if (RITMO_TEXTO[d.ritmo]) campos.push(["info.tc", RITMO_TEXTO[d.ritmo]], ["info.fideTC", d.ritmo]);
    if (d.lugar) campos.push(["info.location", String(d.lugar).slice(0, 80)]);
    if (d.tnr) campos.push(["info.standings", "https://chess-results.com/tnr" + d.tnr + ".aspx?lan=2"]);
    if (d.descripcion) campos.push(["markdown", String(d.descripcion).slice(0, 20000)]);
    return campos;
  }

  // Una ronda alimentada a mano (push): sin syncUrl.
  function formRonda(d) {
    const campos = [["name", "Ronda " + (Number(d.ronda) || 0)]];
    if (d.inicio && d.inicio > 1356998400070) campos.push(["startsAt", String(d.inicio)]);
    return campos;
  }

  // La hora de la ronda que dice chess-results («2026.09.27» y «3:00pm»), en
  // hora de Costa Rica, como milisegundos. Costa Rica no cambia de hora: es
  // UTC−6 todo el año. Sin fecha u hora, null (Lichess la deja sin hora).
  function inicioRonda(fecha, hora) {
    const f = String(fecha || "").match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
    const h = String(hora || "").match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
    if (!f || !h) return null;
    let horas = Number(h[1]) % 24;
    if (h[3]) horas = (Number(h[1]) % 12) + (/pm/i.test(h[3]) ? 12 : 0);
    return Date.UTC(Number(f[1]), Number(f[2]) - 1, Number(f[3]), horas + 6, Number(h[2]));
  }

  // La pestaña «Tournament» de LiveChess no se puede escribir desde afuera (no
  // tiene API ni importación), así que se le da a quien la llena cada campo
  // listo para copiar. `campo` es el rótulo que LiveChess muestra, `etiqueta`
  // su traducción. «Laws of chess» y «Starting position» ya vienen bien de
  // fábrica (leyes estándar, posición inicial): no se tocan. `ficha` es la que
  // lee la Edge Function de chess-results: { control, lugar, pais, rondas },
  // y cada dato puede faltar; entonces el valor queda vacío.
  function datosLiveChess(nombre, ficha) {
    const f = ficha || {};
    const n = String(nombre || "").trim();
    const nombreReal = n && !/^tnr\d+$/i.test(n) ? n : "";
    const rondas = Number(f.rondas) > 0 ? String(Number(f.rondas)) : "";
    return [
      { campo: "Short title", etiqueta: "Título corto", valor: nombreReal ? slug(nombreReal) : "" },
      { campo: "Name", etiqueta: "Nombre", valor: nombreReal },
      { campo: "Location", etiqueta: "Lugar", valor: String(f.lugar || "").trim() },
      { campo: "Country", etiqueta: "País", valor: String(f.pais || "").trim() },
      { campo: "Time control", etiqueta: "Control de tiempo", valor: String(f.control || "").trim() },
      { campo: "Number of rounds", etiqueta: "Número de rondas", valor: rondas },
    ];
  }

  function textoDatos(datos) {
    return (datos || []).filter((d) => d.valor).map((d) => d.campo + ": " + d.valor).join("\n");
  }

  // Un torneo que terminó hace más de dos semanas ya no muestra su ficha en
  // chess-results: la lectura sale vacía y no debe borrar lo que ya se sabía.
  function unirFicha(anterior, nueva) {
    const sale = Object.assign({}, anterior || {});
    for (const [k, v] of Object.entries(nueva || {})) {
      if (v) sale[k] = v;
    }
    return sale;
  }

  const api = { datosLiveChess, textoDatos, unirFicha, tnrDe, quitarTildes, leerMesas, partidas, pgn, firma, resultadoCR, decidir, nombreArchivo, formTorneo, formRonda, inicioRonda };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.PareoDGT = api;
})(typeof self !== "undefined" ? self : this);
