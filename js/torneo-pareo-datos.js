/* Los torneos de Pareo Integral con la forma de chess-results, para que la
 * página de un torneo dirigido en Pareo (hoy, tacho-chess-2.html) tenga lo
 * mismo que el Centroamericano: «Busca a tu jugador», sus rondas, la
 * clasificación, el podio y el proyector (js/centroamericano-vivo.js y
 * js/centroamericano-tablas.js), sin chess-results.
 *
 * js/centroamericano-vivo.js pide sus datos a la Edge Function sala-jugadores
 * (que lee chess-results). Con `fuente: "pareo"` en window.TorneoPagina, los
 * pide aquí: TorneoPareoDatos.leer() devuelve lo mismo que esa función,
 * { torneos: [...], modalidades: ["clasico"], modalidad: "clasico" }, y cada
 * torneo como lo arma ella:
 *   { tnr, texto, url, leido_en, ronda, rondas, terminado?,
 *     jugadores: [{ puesto, no, titulo, nombre, fed, elo, grupo, puntos, r }],
 *     pareo: { ronda, mesas: [{ mesa, blancas: { no, titulo, nombre }, negras, resultado }] } }
 *
 * - QUÉ TORNEOS: los publicados en Pareo (pareo_publicados, de lectura
 *   pública) por una organización con el sello «Organizador verificado», con
 *   el nombre que pide `TorneoPagina.pareo.nombre` y creados desde
 *   `TorneoPagina.pareo.desde`. Sin el sello, cualquiera publicaría uno con ese
 *   nombre y saldría en la página (ver js/tacho-chess-resultados.js).
 * - EL GRUPO de cada jugador es su categoría de Pareo (en Tacho Chess 2, su
 *   nivel: «Segundo grado»): así el puesto, la clasificación y el podio van por
 *   nivel, que es como se premia, aunque el torneo se juegue mezclado.
 * - EL PUESTO es el de la clasificación de Pareo (`resumen`, que calcula quien
 *   publica con los desempates del torneo, tras las rondas completas); sin
 *   rondas completas, el número inicial. Los puntos y las rondas son los de
 *   esas mismas rondas completas: la que se está jugando va en el pareo.
 * - LAS RONDAS («r») se escriben como el cuadro cruzado de chess-results:
 *   «5w1» (contra el 5, blancas, ganó), «9b½», «12w+» / «3b-» (incomparecencia),
 *   «-1» (bye o ausencia que vale 1), «-½», «-0».
 * - EL NÚMERO INICIAL es el de Pareo (PareoTorneo.ordenInicial) y LA MESA, la
 *   de la sala (la primera mesa del torneo + su lugar, como V.mesaFisica).
 *
 * Ver «Los resultados de Pareo, como en el Centroamericano» en
 * docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  const CONFIG = (window.TorneoPagina && window.TorneoPagina.pareo) || {};
  const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const NOMBRE = new RegExp("\\b" + sinTildes(CONFIG.nombre || "").replace(/[^a-z0-9 ]/g, "") + "\\b");

  // 4.5 → «4½», 0.5 → «½», 3 → «3» (como los escribe chess-results).
  const fmt = (n) => { const e = Math.floor(n), m = n - e >= 0.5; return e ? e + (m ? "½" : "") : (m ? "½" : "0"); };
  const RESULTADO = { "1-0": "1 - 0", "0-1": "0 - 1", "=": "½ - ½", "+-": "+ - -", "-+": "- - +", "--": "- - -" };
  const VALOR = { 1: "1", 0.5: "½", 0: "0" };

  // Los torneos de la última lectura, con su hora de actualización (para cambio()).
  let vistos = null;

  async function buscar() {
    const sb = window.sb;
    if (!sb) throw new Error("sin cliente");
    const { data: orgs, error: e1 } = await sb.from("pareo_organizadores").select("id").eq("verificado", true);
    if (e1) throw e1;
    const ids = (orgs || []).map((o) => o.id);
    if (!ids.length || !CONFIG.nombre) return [];
    const { data, error } = await sb.from("pareo_publicados").select("id, nombre, creado, actualizado, datos")
      .in("organizador_id", ids).ilike("nombre", "%" + CONFIG.nombre + "%").gte("creado", CONFIG.desde || "2000-01-01")
      .order("creado", { ascending: true }).range(0, 19);
    if (error) throw error;
    const lista = ordenar(sinRepetidos((data || []).filter((p) => NOMBRE.test(sinTildes(p.nombre)) && p.datos && Array.isArray(p.datos.jugadores))));
    vistos = lista.map((p) => ({ id: p.id, actualizado: p.actualizado }));
    return lista;
  }

  // ¿Cambió algo desde la última lectura? Pide solo la hora de actualización
  // de los torneos que ya se leyeron (unos bytes, no los datos enteros): así
  // la ventana de pareos puede preguntar cada pocos segundos sin bajarse todo.
  // Un torneo nuevo no se ve aquí: lo trae la lectura completa de cada tanto.
  // Ver «Los pareos de la ronda se ponen al día solos».
  async function cambio() {
    const sb = window.sb;
    if (!sb) throw new Error("sin cliente");
    if (!vistos) return true;
    if (!vistos.length) return false;
    const { data, error } = await sb.from("pareo_publicados").select("id, actualizado").in("id", vistos.map((v) => v.id));
    if (error) throw error;
    const ahora = new Map((data || []).map((x) => [x.id, x.actualizado]));
    return vistos.some((v) => ahora.get(v.id) !== v.actualizado);
  }

  // El mismo torneo publicado dos veces (pasó el 13/11/2026: «Publicar»
  // tocado dos veces, a 4 segundos, y la ficha mostraba dos «Tacho Chess 2»):
  // mismo nombre y mismos jugadores. Queda el que se actualizó último, que es
  // el que Pareo sigue poniendo al día; el otro quedó huérfano.
  function sinRepetidos(lista) {
    const clave = (p) => sinTildes(p.nombre).trim() + "|" + p.datos.jugadores.map((j) => sinTildes(j.nombre)).sort().join(",");
    const mejor = new Map();
    lista.forEach((p) => {
      const k = clave(p), antes = mejor.get(k);
      if (!antes || String(p.actualizado || p.creado) > String(antes.actualizado || antes.creado)) mejor.set(k, p);
    });
    return lista.filter((p) => mejor.get(clave(p)) === p);
  }

  // En el orden de los niveles (`TorneoPagina.ordenGrupos`): el torneo de
  // primer grado primero, no el que se publicó primero.
  function ordenar(lista) {
    const orden = (window.TorneoPagina && window.TorneoPagina.ordenGrupos) || [];
    const primero = (p) => Math.min(999, ...p.datos.jugadores.map((j) => { const i = orden.indexOf(j.categoria); return i < 0 ? 999 : i; }));
    return lista.slice().sort((a, b) => primero(a) - primero(b));
  }

  // Un torneo de Pareo, como lo devuelve sala-jugadores para uno de chess-results.
  function convertir(p) {
    const T = window.PareoTorneo;
    const d = p.datos;
    const t = { jugadores: d.jugadores, rondas: Array.isArray(d.rondas) ? d.rondas : [], numeracion: d.numeracion,
      puntos: d.puntos || { victoria: 1, tablas: 0.5, derrota: 0, bye: 1 } };
    const orden = T ? T.ordenInicial(t) : t.jugadores.map((j) => j.id);
    const numero = new Map(orden.map((id, i) => [id, i + 1]));
    const porId = new Map(t.jugadores.map((j) => [j.id, j]));
    const resumen = new Map((Array.isArray(d.resumen) ? d.resumen : []).map((x) => [x.id, x]));
    const completas = (Array.isArray(d.resumen) && d.resumen[0] && d.resumen[0].rondas) || 0;

    // Lo de cada jugador en cada ronda, como una casilla del cuadro cruzado.
    function casilla(id, r) {
      if (!T) return "";
      const s = T.situacion(t, r, id);
      const rival = s.rival == null ? "" : String(numero.get(s.rival) || "");
      if (s.tipo === "bye") return "-" + (VALOR[s.puntos] || "1");
      if (s.tipo === "ausente") return "-" + (VALOR[s.puntos] || "0");
      if (s.tipo === "pendiente") return rival + s.color;
      if (s.tipo === "incomparecencia") return rival + s.color + (s.codigo === "+" ? "+" : "-");
      return rival + s.color + (s.codigo === "1" ? "1" : s.codigo === "=" ? "½" : "0");
    }

    // Las rondas y los puntos, hasta la última ronda COMPLETA: los mismos con
    // que Pareo calculó el puesto (`resumen`). Si la ronda en juego sumara lo
    // que ya terminó, el podio mostraba a alguien con 1½ debajo de alguien
    // con 1. La ronda en juego va en el pareo («juega contra…»).
    const jugadores = t.jugadores.map((j) => {
      const r = t.rondas.slice(0, completas).map((_, i) => casilla(j.id, i));
      const pts = T ? T.puntosHasta(t, j.id, completas) : 0;
      const x = resumen.get(j.id);
      return { puesto: x ? x.puesto : 0, no: numero.get(j.id) || 0, titulo: j.titulo || "", nombre: j.nombre || "",
        fed: j.fed || "", elo: Number(j.elo) || 0, grupo: j.categoria || p.nombre, puntos: fmt(pts), r };
    });
    // Sin rondas completas, el puesto es el número inicial.
    jugadores.forEach((j) => { if (!j.puesto) j.puesto = j.no; });
    jugadores.sort((a, b) => a.puesto - b.puesto);

    // El pareo: la última ronda emparejada, con la mesa de la sala.
    const ultima = t.rondas.length ? t.rondas[t.rondas.length - 1] : null;
    const primera = Number(d.mesaInicial) > 1 ? Math.floor(Number(d.mesaInicial)) : 1;
    const persona = (id) => { const j = porId.get(id) || {}; return { no: numero.get(id) || 0, titulo: j.titulo || "", nombre: j.nombre || "" }; };
    const pareo = ultima ? { ronda: t.rondas.length, mesas: ultima.mesas.map((m, i) => ({
      mesa: primera + i, blancas: persona(m.b), negras: m.n == null ? null : persona(m.n),
      resultado: m.n == null ? "bye" : (RESULTADO[m.r] || ""),
    })) } : null;

    const rondas = Number(d.rondasTotales) || t.rondas.length;
    const terminado = completas > 0 && completas >= rondas;
    return {
      tnr: p.id, texto: p.nombre, url: "torneos-pareo.html?en-ventana=1#t=" + p.id, leido_en: new Date().toISOString(),
      // Las mesas de la sala que usa este torneo: desde su primera mesa, una
      // por cada dos jugadores (como V.mesasQueNecesita de Pareo). Para el
      // plano de la sala (js/torneo-sala.js).
      mesas: { desde: primera, hasta: primera + Math.max(1, Math.ceil(t.jugadores.length / 2)) - 1 },
      ronda: completas, rondas, jugadores, pareo: terminado ? null : pareo, ...(terminado ? { terminado: true } : {}),
    };
  }

  async function leer() {
    const torneos = (await buscar()).map(convertir);
    return { torneos, modalidades: ["clasico"], modalidad: "clasico" };
  }

  // `buscar` también la usa js/tacho-chess-resultados.js (la ficha de Pareo):
  // los mismos torneos, sin repetidos y en el mismo orden.
  window.TorneoPareoDatos = { leer, convertir, buscar, cambio };
})();

/*! rev bfb5bbb0d2d82f9f */
