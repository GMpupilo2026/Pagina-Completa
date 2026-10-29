/* ===== Acta e informe arbitral JDE desde chess-results: el armado, sin pantalla =====
 *
 * Un evento de los JDE dirigido con Swiss-Manager y publicado en
 * chess-results (no en Pareo Integral) también necesita su informe oficial
 * de participación y resultados y su lista de clasificados a la etapa
 * siguiente. En vez de escribir otro informe, cada torneo leído de
 * chess-results (la Edge Function desempates-chess-results) se convierte en
 * el torneo de Pareo Integral con js/desempates-convertir.js, y el informe
 * lo arma el MISMO js/pareo/evento.js que usa Pareo Integral para sus
 * eventos de los JDE: la clasificación con los desempates de la normativa,
 * los clasificados del art. 66.1, el cuadro cruzado, las ausencias, el
 * medallero por centro y las firmas. Una sola copia de cada cosa.
 *
 * Lo que chess-results no trae (la etapa, el lugar, la sede, la fecha, el
 * árbitro y las incidencias) lo escribe quien arbitró. Y lo que no cuadra se
 * dice: si el puntaje reconstruido no coincide con el oficial, o si la
 * clasificación con los desempates de los JDE pone a alguien en otro puesto
 * que chess-results (las bases pudieron usar otros), sale en `avisos`.
 * Ver «Acta e informe arbitral JDE» en docs/decisiones/juegos-y-torneos.md.
 *
 *   ActaJde.armar(evento, lecturas) → { torneos, avisos }
 *     evento:   { anio, etapa, lugar, sede, fecha, arbitro, adjunto }
 *     lecturas: [{ datos (lo que devuelve la función), todos (bool|null) }]
 *   ActaJde.documento(evento, torneos, incidencias) → documento neutral
 *   ActaJde.clasificados(evento, torneos) → filas del Excel de la etapa siguiente
 */
(function (raiz) {
  "use strict";
  const enNode = typeof module !== "undefined" && module.exports;
  const C = enNode ? require("./desempates-convertir.js") : raiz.DesempatesConvertir;
  const G = enNode ? require("./pareo/grupos.js") : raiz.PareoGrupos;
  const EV = enNode ? require("./pareo/evento.js") : raiz.PareoEvento;
  const D = enNode ? require("./pareo/desempates.js") : raiz.PareoDesempates;

  const ETAPAS = { institucional: "Institucional", regional: "Regional", interregional: "Interregional", nacional: "Nacional" };

  function jdeDe(evento) {
    return { anio: Number(evento.anio) || 0, etapa: evento.etapa, lugar: evento.lugar || "" };
  }
  function nombreEvento(evento) {
    const lugar = EV.lugarTexto(jdeDe(evento));
    return ["JDE " + (Number(evento.anio) || ""), "Etapa " + (ETAPAS[evento.etapa] || ""), lugar].filter((x) => x.trim()).join(" · ");
  }

  /* El nombre de un desempate como lo escribe chess-results (Swiss-Manager)
     → su código de FIDE (C.07), el que entiende js/pareo/desempates.js.
     Primero el código entre paréntesis («Direct Encounter (DE)»); si no
     trae, por el nombre y sus parámetros («Buchholz … (Gamepoints, Cut1)»).
     null si no se reconoce: entonces no se adivina. */
  const CON_CODIGO = /\((DE|WIN|WON|BPG|BWG|GE|KS|ARO|TPR|PTP|PS|STD|FB|AOB|APRO|APPO|AFB)\)/;
  function codigoDesempate(nombre) {
    const s = String(nombre || "");
    const m = CON_CODIGO.exec(s);
    if (m) return m[1];
    const corte = /Cut\s*2/i.test(s) ? 2 : /Cut\s*1?\b/i.test(s) ? 1 : 0;
    const mediano = /Median\s*2/i.test(s) ? 2 : /Median/i.test(s) ? 1 : 0;
    if (/Buchholz/i.test(s)) return mediano ? "BH-M" + mediano : corte ? "BH-C" + corte : "BH";
    if (/Sonneborn/i.test(s)) return corte ? "SB-C1" : "SB";
    if (/Koya/i.test(s)) return "KS";
    if (/Progressive|Progresiv/i.test(s)) return corte ? "PS-C1" : "PS";
    if (/Average Rating of Opponents/i.test(s)) return corte ? "ARO-C1" : "ARO";
    if (/Performance/i.test(s)) return "TPR";
    if (/Direct Encounter|Encuentro directo/i.test(s)) return "DE";
    if (/number of wins|victories/i.test(s)) return "WIN";
    return null;
  }

  function armar(evento, lecturas) {
    const avisos = [];
    const torneos = lecturas.map((l, i) => {
      const datos = l.datos;
      const todos = l.todos == null ? C.convertir(datos, {}).posibleTodos : !!l.todos;
      const { t, advertencias } = C.convertir(datos, { todos });
      const porId = new Map(datos.jugadores.map((j) => [C.idDe(j.snr), j]));
      t.jugadores.forEach((p) => {
        const j = porId.get(p.id) || {};
        Object.assign(p, {
          institucion: j.club || "", sexo: j.sexo === "w" ? "w" : j.sexo === "m" ? "m" : "",
          nacimiento: j.nacimiento || "", fideId: j.fideId ? String(j.fideId) : "", elo: j.eloFide || j.elo || 0,
        });
      });
      // El bye de un punto entero que trae chess-results es, en los JDE, el
      // del pareo (número impar de jugadores): se anota como tal ({ n: null })
      // y no como un bye pedido, que en el informe saldría «Pidió bye».
      t.rondas.forEach((R) => {
        for (const [id, a] of Object.entries(R.ausencias || {})) {
          if (a !== "F") continue;
          delete R.ausencias[id];
          R.mesas.push({ b: id, n: null, r: "bye" });
        }
      });
      t.grupo = datos.titulo || ("Torneo " + (i + 1));
      // Los desempates del torneo, los que dice chess-results; si alguno no se
      // reconoce, los de los JDE (art. 66), y se avisa.
      const deCr = (datos.desempates || []).map(codigoDesempate);
      if (deCr.length && deCr.every(Boolean)) t.desempates = deCr;
      else {
        t.desempates = (todos ? G.JDE_DESEMPATES_TODOS : G.JDE_DESEMPATES_SUIZO).slice();
        avisos.push({ torneo: datos.titulo || "", tipo: "desempates", texto: deCr.length
          ? "No se reconoció el desempate «" + datos.desempates.filter((_, k) => !deCr[k]).join("», «") + "» de chess-results: se usan los de los JDE (" + t.desempates.join(", ") + ")."
          : "chess-results no dice qué desempates usó: se usan los de los JDE (" + t.desempates.join(", ") + ")." });
      }
      t.ciudad = evento.sede || "";
      t.arbitro = evento.arbitro || "";
      t.arbitroAdjunto = evento.adjunto || "";
      t.fechaInicio = evento.fecha || "";
      // Lo que no cuadra con chess-results, dicho.
      advertencias.forEach((a) => avisos.push({ torneo: t.grupo, tipo: "puntos", texto: a.nombre + ": chess-results dice " + a.oficial + " puntos y las partidas suman " + a.calculado + " (alguna ronda no se pudo leer)." }));
      if ((datos.faltantes || []).length) avisos.push({ torneo: t.grupo, tipo: "faltan", texto: "No se pudo leer la ficha de " + datos.faltantes.length + (datos.faltantes.length === 1 ? " jugador" : " jugadores") + ": vuelve a cargar en un rato." });
      const rondas = EV.rondasCompletas(t);
      if (rondas) {
        const filas = D.clasificacion(Object.assign({}, t, { rondas: t.rondas.slice(0, rondas) }), t.desempates);
        const distintos = filas.filter((f) => { const j = porId.get(f.id); return j && j.puesto && j.puesto !== f.puesto; });
        if (distintos.length) avisos.push({ torneo: t.grupo, tipo: "orden", texto: "Recalculado con el motor de Pareo Integral y los desempates " + t.desempates.join(", ") + ", " + distintos.length + (distintos.length === 1 ? " persona queda" : " personas quedan") + " en otro puesto que en chess-results: " +
          distintos.slice(0, 5).map((f) => porId.get(f.id).nombre + " (" + f.puesto + ".º recalculado, " + porId.get(f.id).puesto + ".º en chess-results)").join("; ") + (distintos.length > 5 ? "…" : "") +
          ". El informe usa el orden de chess-results, que es el oficial; si las bases decían otros desempates, corrígelo en Swiss-Manager antes de firmar." });
      }
      // El informe va con el orden oficial de chess-results; los desempates
      // quedan escritos aparte (sin columnas: los números serían los de acá).
      t.ordenOficial = {};
      datos.jugadores.forEach((j) => { if (j.puesto) t.ordenOficial[C.idDe(j.snr)] = j.puesto; });
      t.desempatesOficiales = deCr.length && deCr.every(Boolean) ? deCr : [];
      t.desempates = [];
      if (!datos.final) avisos.push({ torneo: t.grupo, tipo: "provisional", texto: "chess-results todavía no dice «Clasificación final»: el informe sale provisional." });
      return t;
    });
    return { torneos, avisos };
  }

  function documento(evento, torneos, incidencias) {
    const ev = { nombre: nombreEvento(evento), jde: jdeDe(evento), creado: evento.fecha || "" };
    const doc = EV.informe(ev, torneos);
    // Las incidencias las escribe quien arbitró (chess-results no las tiene):
    // reemplazan el «No se anotaron incidencias» de Pareo Integral.
    const lista = String(incidencias || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const i = doc.bloques.findIndex((b) => b.tipo === "titulo" && b.texto === "Incidencias");
    if (i >= 0 && lista.length) doc.bloques.splice(i + 1, 1, { tipo: "lista", items: lista });
    // Debajo de cada clasificación, con qué desempates salió ese orden.
    torneos.forEach((t) => {
      const k = doc.bloques.findIndex((b) => b.tipo === "subtitulo" && b.texto === EV.nombreTorneo(t));
      const tabla = k < 0 ? -1 : doc.bloques.findIndex((b, i) => i > k && b.tipo === "tabla");
      if (tabla >= 0) doc.bloques.splice(tabla + 1, 0, { tipo: "nota", texto: "Orden oficial de chess-results" + ((t.desempatesOficiales || []).length ? ", con los desempates " + t.desempatesOficiales.join(", ") : "") + "." });
    });
    if (evento.adjunto) {
      const f = doc.bloques.findIndex((b) => b.tipo === "titulo" && b.texto === "Firmas");
      if (f >= 0) doc.bloques.splice(f + 2, 0, { tipo: "parrafo", texto: "______________________________   Árbitro adjunto: " + evento.adjunto });
    }
    doc.pie = "Acta e informe arbitral JDE · ajedrez-integral.com";
    return doc;
  }

  function clasificados(evento, torneos) {
    return EV.filasClasificados({ jde: jdeDe(evento) }, torneos);
  }

  const api = { codigoDesempate, armar, documento, clasificados, nombreEvento, ETAPAS, ENCABEZADOS: EV.ENCABEZADOS };
  if (enNode) module.exports = api;
  else raiz.ActaJde = api;
})(typeof self !== "undefined" ? self : this);
