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
 * partida. Y se puede acotar a las mesas con tablero electrónico («de la 1 a
 * la 10»): lo normal es que solo las primeras lo tengan.
 *
 *   PareoDGT.tnrDe(texto)                    → "1498221" | null
 *   PareoDGT.partidas(datos, {desde, hasta}) → las mesas con dos jugadores, en el rango
 *   PareoDGT.pgn(datos, opciones)            → el texto del PGN
 *   PareoDGT.firma(datos)                    → quién juega con quién en cada mesa (para ver si cambió)
 *   PareoDGT.decidir(guardado, datos)        → "esperar" | "nueva" | "cambio" | "igual"
 *   PareoDGT.nombreArchivo(nombre, ronda)    → "torneo-blitz-ronda-3.pgn"
 *   PareoDGT.formTorneo({...}) / formRonda({...}) → [[campo, valor]] para URLSearchParams
 *   PareoDGT.inicioRonda("2026.09.27", "3:00pm") → la hora de la ronda (ms), en hora de Costa Rica
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

  function partidas(datos, opciones) {
    const o = opciones || {};
    const desde = Number(o.desde) || 1;
    const hasta = Number(o.hasta) || Infinity;
    return ((datos && datos.mesas) || [])
      .filter((m) => m.negras && m.blancas && m.mesa >= desde && m.mesa <= hasta)
      .sort((a, b) => a.mesa - b.mesa);
  }

  function pgn(datos, opciones) {
    const o = opciones || {};
    const t = o.sinTildes ? quitarTildes : (s) => String(s || "");
    const evento = o.evento || datos.torneo || "Torneo";
    const fecha = /^\d{4}\.\d{2}\.\d{2}$/.test(datos.fecha || "") ? datos.fecha : "????.??.??";
    const bloques = partidas(datos, o).map((m) => {
      const tags = [
        ["Event", t(evento)],
        ["Site", t(o.sitio || "?")],
        ["Date", fecha],
        ["Round", String(datos.ronda || "?")],
        ["Board", String(m.mesa)],
        ["White", t(m.blancas.nombre)],
        ["Black", t(m.negras.nombre)],
        ["Result", "*"],
      ];
      if (m.blancas.titulo) tags.push(["WhiteTitle", m.blancas.titulo]);
      if (m.negras.titulo) tags.push(["BlackTitle", m.negras.titulo]);
      if (m.blancas.elo) tags.push(["WhiteElo", String(m.blancas.elo)]);
      if (m.negras.elo) tags.push(["BlackElo", String(m.negras.elo)]);
      if (m.blancas.fide) tags.push(["WhiteFideId", m.blancas.fide]);
      if (m.negras.fide) tags.push(["BlackFideId", m.negras.fide]);
      return tags.map(([k, v]) => "[" + k + ' "' + valor(v) + '"]').join("\n") + "\n\n*\n";
    });
    return bloques.join("\n");
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
  //   "cambio":  la misma ronda, pero con otro pareo (se corrigió en chess-results).
  //   "igual":   nada nuevo.
  function decidir(guardado, datos) {
    if (!datos || !datos.ronda || !partidas(datos).length) return "esperar";
    const ya = guardado && guardado.rondas && guardado.rondas[String(datos.ronda)];
    if (!ya) return "nueva";
    return ya.firma === firma(datos) ? "igual" : "cambio";
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

  const api = { tnrDe, quitarTildes, partidas, pgn, firma, decidir, nombreArchivo, formTorneo, formRonda, inicioRonda };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.PareoDGT = api;
})(typeof self !== "undefined" ? self : this);
