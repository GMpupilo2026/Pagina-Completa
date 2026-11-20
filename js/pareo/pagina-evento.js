/* ===== Pareo Integral — la página (pareo.html): el evento =====
 *
 * Repetir un evento, lo que falta revisar, los torneos del evento y los retiros por incomparecencia,
 * las ausencias, la pantalla del evento (pintarEvento), el horario, el desempate en vivo, las
 * constancias, los certificados, el cartel y los diplomas, cuánto duró cada ronda y las mesas de la
 * sala.
 *
 * Es una parte de la página de Pareo Integral, que se partió por zonas el
 * 20/11/2026 (ver «Pareo Integral: la página partida por zonas» en
 * docs/decisiones/juegos-y-torneos.md). Lo de las otras partes llega por
 * window.PareoPagina: arriba, lo de las que ya cargaron; como Pagina.<nombre>,
 * lo de las que cargan después.
 */
(function () {
  "use strict";

  const Pagina = window.PareoPagina;
  const { T, G, E, V, X, CLAVE_LISTA, CLAVE_FICHA, PREFIJO, C, leer, escribir, leerJSON, $, el, tx, estado,
    apagarEnVivo, nuevoId, guardar, abrir, t, puntosTexto, bajar, quitarArchivados, pintarTodo,
    nombreConGrupo, horaCR } = Pagina;

  // ---------- Repetir un evento ----------
  // El evento del año pasado (o de la etapa anterior) como punto de partida:
  // los mismos torneos, con su configuración, sus plazos y el horario del
  // día, pero sin jugadores, rondas, fechas ni nada de lo que pasó ese día
  // (actas, firmas, incidencias, publicación, enlaces). Se copia campo por
  // campo, nunca el torneo entero: lo que no está en esta lista no viaja.
  // Ver «Repetir un evento» en docs/decisiones/juegos-y-torneos.md.
  const COPIA_REPETIR = ["grupo", "ciudad", "provincia", "federacion", "arbitro", "arbitroAdjunto", "ritmo", "validoElo", "sistema", "dobleVuelta",
    "rondasTotales", "colorInicial", "baku", "tipo", "tableros", "amistoso", "ordenEnEvento", "mesaInicial", "configLibre", "plazoAlineacion"];
  // «Abierto 2025» → «Abierto 2026»: el año del evento viejo en el nombre.
  const conAnio = (texto, viejo, nuevo) => (viejo && viejo !== nuevo ? String(texto || "").replace(new RegExp("\\b" + viejo + "\\b", "g"), nuevo) : String(texto || ""));
  async function repetirEvento(ev, torneos) {
    if (!torneos.length) return;
    const ok = await Avisos.confirmar(tx("repetirEventoPregunta", { n: torneos.length }), { aceptar: tx("repetirEventoSi"), cancelar: tx("repetirEventoNo") });
    if (!ok) return;
    const hoy = window.HoraCR ? HoraCR.hoy() : "";
    const anioNuevo = hoy.slice(0, 4);
    const anioViejo = String((ev.jde && ev.jde.anio) || (torneos[0].fechaInicio || ev.creado || "").slice(0, 4));
    const jde = ev.jde ? Object.assign({}, ev.jde, { anio: anioNuevo ? Number(anioNuevo) || anioNuevo : ev.jde.anio }) : undefined;
    const evento = { id: "e" + nuevoId(), nombre: jde ? G.nombreEventoJde(jde) : conAnio(ev.nombre, anioViejo, anioNuevo), creado: hoy, decisiones: {} };
    if (jde) evento.jde = jde;
    apagarEnVivo();
    const ids = [];
    torneos.forEach((y) => {
      const datos = { evento, jugadores: [], rondas: [], numeracion: null, fechaInicio: "", fechaFin: "",
        puntos: Object.assign({}, y.puntos), desempates: (y.desempates || []).slice() };
      for (const k of COPIA_REPETIR) if (y[k] !== undefined) datos[k] = y[k];
      if (jde) { datos.jde = jde; datos.nombre = nombreConGrupo(jde, y.grupo); }
      else datos.nombre = conAnio(y.nombre, anioViejo, anioNuevo);
      estado.id = nuevoId();
      estado.t = T.nuevo(datos);
      estado.ultimoGuardado = null;
      guardar();
      ids.push(estado.id);
    });
    // El horario del día (hora de inicio y descanso) es del evento.
    for (const sufijo of ["", "_descanso"]) {
      const x = leer(CLAVE_HORARIO + ev.id + sufijo);
      if (x) escribir(CLAVE_HORARIO + evento.id + sufijo, x);
    }
    const ahora = Date.now();
    ids.forEach((id, i) => { const x = estado.lista.find((z) => z.id === id); if (x) x.actualizado = ahora - i; });
    escribir(CLAVE_LISTA, JSON.stringify(estado.lista));
    abrir(ids[0]);
    estado.ficha = "torneo";
    escribir(CLAVE_FICHA, "torneo");
    pintarTodo();
    Avisos.avisar(tx("repetirEventoListo", { n: ids.length, e: evento.nombre }), { duracion: 12000 });
  }

  // Lo que decidió el árbitro en la sugerencia, en texto llano y en español
  // (va al acta, que es un documento oficial del MEP).
  function decisionesDe(s) {
    const es = (clave, vars) => X.t("es", clave, vars);
    const MODO = { equipo: "Equipos", individual: "Individual" };
    const TORNEO = { w: "Mujeres", m: "Abierto" };
    const modo = (x) => (MODO[x.modalidad] || MODO.individual) + " " + x.categoria;
    const grupoDe = (e, equipo) => (equipo ? MODO.equipo : MODO.individual) + " · Categoría " + e.categoria + " · " + (TORNEO[e.torneo] || TORNEO.m);
    const limpia = s.limpia || { repetidos: [], dosModalidades: [] };
    const descartados = [];
    for (const e of s.equipos.concat(s.individuales)) {
      const elegidos = s.elegidos.get(e.eleccion);
      for (const j of e.integrantes) if (!elegidos.has(j)) descartados.push({ nombre: j.nombre, institucion: e.institucion, grupo: grupoDe(e, e.tipo === "eq") });
    }
    const r = s.revision || { permitidos: [], noPermitidos: [] };
    const caso = (c) => {
      const j = c.jugador;
      const v = { n: j.nombre, i: j.institucion || "—", a: c.nace, p: c.propia, c: c.categoria, d: c.desde, k: c.cuantos, m: G.JDE_MAX_ASCENSOS };
      const clave = c.motivo ? { mayor: "catMayor", individual: "catIndividual", salto: "catSalto", tope: "catTope" }[c.motivo] : "catPermitido";
      return es(c.motivo ? "catNoPermitido" : "catSiPermitido") + " " + es(clave, v);
    };
    return {
      repetidos: limpia.repetidos.map((x) => ({ nombre: x.jugador.nombre, institucion: x.jugador.institucion || "—", veces: x.veces })),
      dosModalidades: limpia.dosModalidades.map((d, k) => ({
        nombre: d.jugador.nombre, institucion: d.jugador.institucion || "—", inscripciones: d.inscripciones.map(modo).join(" y "),
        queda: s.dondeQueda.has(k) ? modo(d.inscripciones[s.dondeQueda.get(k)]) : "",
      })),
      pase: s.pasarMujeres ? s.pase.pasadas.map((c) => ({ institucion: c.institucion || "—", categoria: c.categoria, nombres: c.mujeres.map((j) => j.nombre).join(", ") })) : [],
      descartados,
      cortos: (s.cortos || []).map((e) => ({ institucion: e.institucion || "—", grupo: grupoDe(e, true), cuantos: e.integrantes.length, nombres: e.integrantes.map((j) => j.nombre).join(", ") })),
      categorias: r.noPermitidos.concat(r.permitidos).map(caso),
      hombresEnMujeres: (s.hombresEnMujeres || []).map((j) => j.nombre + " (" + (j.institucion || "—") + ")"),
      variosOrigenes: (limpia.variosOrigenes || []).map((x) => ({ nombre: x.jugador.nombre, institucion: x.jugador.institucion || "—", origenes: x.origenes.join(" y ") })),
      comparacion: s.comparacion ? {
        noClasificaron: s.comparacion.noClasificaron.map((j) => j.nombre + " (" + (j.institucion || "—") + ")"),
        faltan: s.comparacion.faltan.map((j) => j.nombre + " (" + (j.institucion || "—") + ")"),
      } : undefined,
      // Lo que el árbitro tiene que marcar como visto antes de emparejar la
      // ronda 1 de cada torneo (js/pareo/evento.js: pendientes). Sin texto
      // armado: se escribe en el idioma de la página al mostrarlo.
      revisar: [].concat(
        limpia.dosModalidades.filter((d, k) => !s.dondeQueda.has(k)).map((d) => ({ tipo: "dosModalidades", personas: [d.jugador.nombre],
          vars: { n: d.jugador.nombre, i: d.jugador.institucion || "—", m: d.inscripciones.map(modo).join(" / ") } })),
        (limpia.variosOrigenes || []).map((x) => ({ tipo: "origenes", personas: [x.jugador.nombre], vars: { n: x.jugador.nombre, i: x.jugador.institucion || "—", o: x.origenes.join(" / ") } })),
        r.noPermitidos.map((c) => ({ tipo: "categoria", motivo: c.motivo, personas: [c.jugador.nombre],
          vars: { n: c.jugador.nombre, i: c.jugador.institucion || "—", a: c.nace, p: c.propia, c: c.categoria, d: c.desde, k: c.cuantos, m: G.JDE_MAX_ASCENSOS } })),
        (s.hombresEnMujeres || []).map((j) => ({ tipo: "hombre", personas: [j.nombre], vars: { n: j.nombre, i: j.institucion || "—" } })),
        (s.comparacion ? s.comparacion.noClasificaron : []).map((j) => ({ tipo: "noClasifico", personas: [j.nombre], vars: { n: j.nombre, i: j.institucion || "—" } })),
        (s.cortos || []).map((e) => ({ tipo: "corto", personas: e.integrantes.map((j) => j.nombre), vars: { i: e.institucion || "—", k: e.integrantes.length, m: G.JDE_MIN_EQUIPO } }))),
    };
  }

  // Lo que hay que revisar antes de la ronda 1, escrito.
  const TEXTO_REVISAR = { dosModalidades: "revisarDosModalidades", origenes: "revisarOrigenes", hombre: "revisarHombre", corto: "revisarCorto", noClasifico: "revisarNoClasifico" };
  const MOTIVO_CATEGORIA = { mayor: "catMayor", individual: "catIndividual", salto: "catSalto", tope: "catTope" };
  const textoRevisar = (x) => (x.tipo === "categoria" ? tx("catNoPermitido") + " " + tx(MOTIVO_CATEGORIA[x.motivo], x.vars) : tx(TEXTO_REVISAR[x.tipo], x.vars));
  const claveRevisar = (x) => x.tipo + "|" + x.personas.join(",");
  // Cuántos puntos de la revisión siguen sin marcar en un torneo (0 si ya
  // arrancó: después de la ronda 1 la revisión no detiene nada).
  const sinRevisar = (v) => {
    if (v.rondas.length) return 0;
    const vistos = new Set(v.revisadoAntes || []);
    return V.pendientes(v).filter((x) => !vistos.has(claveRevisar(x))).length;
  };

  // ---------- El evento: acta, informe y clasificados ----------
  // Los torneos del mismo evento que el abierto, en el orden en que se
  // crearon (el de la sugerencia). El abierto, con lo último que tiene.
  function torneosDelEvento(idEvento) {
    const id = idEvento || (t().evento && t().evento.id);
    if (!id) return [];
    const otros = estado.lista.map((x) => {
      const y = x.id === estado.id ? t() : leerJSON(PREFIJO + x.id, null);
      if (y && !Object.prototype.hasOwnProperty.call(y, "__id")) Object.defineProperty(y, "__id", { value: x.id });
      return y;
    }).filter((x) => x && x.evento && x.evento.id === id);
    return otros.sort((a, b) => (a.ordenEnEvento || 0) - (b.ordenEnEvento || 0));
  }

  // Guardar un torneo del evento que puede no ser el abierto.
  // Quien pierde por incomparecencia queda fuera de las rondas que siguen
  // hasta que el árbitro lo vuelva a poner (js/pareo/torneo.js). En un torneo
  // por equipos no: ahí la incomparecencia es de un tablero o del encuentro.
  const retirosAuto = (v) => (E.esDeEquipos(v) ? { fuera: [], vuelven: [] } : T.retirosPorIncomparecencia(v));
  function avisarRetiros(v, x) {
    const nombres = (ids) => ids.map((id) => (v.jugadores.find((j) => j.id === id) || {}).nombre || "?").join(", ");
    if (x.fuera.length) Avisos.avisar(tx("incomparecenciaFuera", { n: nombres(x.fuera), r: v.rondas.length + 1 }), { tipo: "info" });
    if (x.vuelven.length) Avisos.avisar(tx("incomparecenciaVuelve", { n: nombres(x.vuelven) }), { tipo: "info" });
  }

  // Las ausencias y las incomparecencias de los torneos del evento
  // (V.ausenciasDe), con si justificó: lo anota el árbitro y va al informe
  // oficial. Se guarda en cada torneo (`justificaciones`, por «ronda|id»).
  const TEXTO_AUSENCIA = { incomparecencia: "ausTipoIncomparecencia", noViene: "ausTipoNoViene", sinAcreditar: "ausTipoSinAcreditar", bye: "ausTipoBye", sacado: "ausTipoSacado" };
  function pintarAusencias(caja, torneos) {
    const aus = torneos.flatMap((tor) => V.ausenciasDe(tor).map((x) => ({ tor, x })));
    if (!aus.length) return;
    const filas = aus.map(({ tor, x }, k) => {
      const sel = el("select", { id: "pi-aus-" + k, class: C.campoChico, "data-ausencia": x.clave, "aria-label": tx("ausJustificoA", { n: x.nombre, r: x.ronda }) },
        el("option", { value: "", texto: tx("ausSinDecidir") }), el("option", { value: "si", texto: tx("ausSi") }), el("option", { value: "no", texto: tx("ausNo") }));
      sel.value = x.justificada === true ? "si" : x.justificada === false ? "no" : "";
      sel.addEventListener("change", () => {
        tor.justificaciones = Object.assign({}, tor.justificaciones);
        if (sel.value) tor.justificaciones[x.clave] = sel.value === "si";
        else delete tor.justificaciones[x.clave];
        Pagina.guardarDelEvento(tor);
      });
      const siguio = x.fuera ? tx("ausFuera", { r: x.ronda + 1 }) : x.volvio ? tx("ausVolvio") : "";
      return el("tr", {}, el("td", { texto: V.nombreTorneo(tor) }), el("td", { class: "num", texto: x.ronda }),
        el("td", { class: "font-semibold", texto: x.nombre }), el("td", { texto: tx(TEXTO_AUSENCIA[x.tipo]) + (siguio ? " · " + siguio : "") }), el("td", {}, sel));
    });
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("ausTitulo") }), el("p", { class: C.nota, texto: tx("ausTexto") }),
      el("div", { class: "overflow-x-auto mt-2" }, el("table", { id: "pi-ausencias", class: "pi-tabla" },
        el("thead", {}, el("tr", {}, el("th", { scope: "col", texto: tx("ausTorneo") }), el("th", { class: "num", scope: "col", texto: tx("ausRonda") }),
          el("th", { scope: "col", texto: tx("nombre") }), el("th", { scope: "col", texto: tx("ausQuePaso") }), el("th", { scope: "col", texto: tx("ausJustifico") }))),
        el("tbody", {}, filas))));
  }

  function pintarEvento() {
    Pagina.pintarHistorial();
    Pagina.pintarPublicar();
    Pagina.pintarOrganizacion();
    $("pi-bajar-trf-equipos").hidden = !E.esDeEquipos(t());
    const caja = $("pi-evento");
    caja.replaceChildren();
    const ev = t().evento;
    caja.hidden = !ev;
    if (!ev) return;
    const torneos = torneosDelEvento();
    const n = V.cupo(ev.jde);
    const siguiente = ev.jde ? V.SIGUIENTE[ev.jde.etapa] : null;
    caja.append(
      el("h2", { class: "font-serif text-xl font-bold mb-1", texto: tx("eventoTitulo") }),
      el("p", { class: "font-semibold", texto: ev.nombre }),
      el("p", { class: C.nota + " mb-3", texto: tx("eventoTexto", { n: torneos.length }) }));
    const acciones = el("div", { class: "flex flex-wrap gap-2" });
    const bActa = el("button", { type: "button", id: "pi-evento-acta", class: C.boton }, tx("eventoActa"));
    bActa.addEventListener("click", () => Pagina.bajarDocumento(V.acta(ev, torneosDelEvento()), "acta-congresillo", bActa));
    const bInforme = el("button", { type: "button", id: "pi-evento-informe", class: C.botonSec }, tx("eventoInforme"));
    bInforme.addEventListener("click", () => Pagina.bajarDocumento(V.informe(ev, torneosDelEvento()), "informe-oficial", bInforme));
    const bPremiacion = el("button", { type: "button", id: "pi-evento-premiacion", class: C.botonSec }, tx("eventoPremiacion"));
    bPremiacion.addEventListener("click", () => Pagina.bajarDocumento(V.premiacion(ev, torneosDelEvento()), "premiacion", bPremiacion));
    const bDiplomas = el("button", { type: "button", id: "pi-evento-diplomas", class: C.botonSec }, tx("eventoDiplomas"));
    bDiplomas.addEventListener("click", () => imprimirDiplomas(V.diplomas(ev, torneosDelEvento())));
    const bEstadisticas = el("button", { type: "button", id: "pi-evento-estadisticas", class: C.botonSec }, tx("eventoEstadisticas"));
    bEstadisticas.addEventListener("click", () => {
      window.TablaExcel.bajar(window.PareoPDF.nombreArchivo(ev.nombre, "estadisticas").replace(/\.pdf$/, ".xlsx"), V.estadisticas(ev, torneosDelEvento()));
    });
    const bConstancias = el("button", { type: "button", id: "pi-evento-constancias", class: C.botonSec }, tx("eventoConstancias"));
    bConstancias.addEventListener("click", () => imprimirConstancias(V.constancias(ev, torneosDelEvento())));
    const bCertificados = el("button", { type: "button", id: "pi-evento-certificados", class: C.botonSec }, tx("eventoCertificados"));
    bCertificados.addEventListener("click", () => imprimirCertificadosArbitro(V.certificadosArbitro(ev, torneosDelEvento())));
    const bCartel = el("button", { type: "button", id: "pi-evento-cartel", class: C.botonSec }, tx("eventoCartel"));
    bCartel.addEventListener("click", () => imprimirCartel(ev));
    const bRepetir = el("button", { type: "button", id: "pi-evento-repetir", class: C.botonSec }, tx("repetirEvento"));
    bRepetir.addEventListener("click", () => repetirEvento(ev, torneosDelEvento()));
    acciones.append(bActa, bInforme, bPremiacion, bDiplomas, bConstancias, bCertificados, bEstadisticas, bCartel, bRepetir);
    caja.append(acciones, el("p", { class: C.nota + " mt-2", texto: tx("eventoPapelesAyuda") }),
      el("p", { class: C.nota + " mt-1", texto: tx("eventoPremiacionAyuda") }));
    pintarAusencias(caja, torneos);

    // El medallero por centro educativo, con las medallas de todos los torneos.
    const med = V.medallero(torneos);
    if (med.length) {
      caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("medalleroTitulo") }),
        el("p", { class: C.nota, texto: tx("medalleroTexto") }),
        el("div", { class: "overflow-x-auto mt-2" }, el("table", { id: "pi-medallero", class: "pi-tabla" },
          el("thead", {}, el("tr", {}, el("th", { class: "num", scope: "col", texto: tx("puesto") }), el("th", { scope: "col", texto: tx("institucion") }),
            el("th", { class: "num", scope: "col", texto: tx("oro") }), el("th", { class: "num", scope: "col", texto: tx("plata") }),
            el("th", { class: "num", scope: "col", texto: tx("bronce") }), el("th", { class: "num", scope: "col", texto: tx("total") }))),
          el("tbody", {}, med.map((x, i) => el("tr", {}, el("td", { class: "num", texto: i + 1 }), el("td", { class: "font-semibold", texto: x.centro }),
            el("td", { class: "num", texto: x.oro }), el("td", { class: "num", texto: x.plata }), el("td", { class: "num", texto: x.bronce }), el("td", { class: "num", texto: x.total })))))));
    }

    // Por Dirección Regional, cuando el evento junta varias (la Interregional).
    const dres = V.porDireccion(torneos, n);
    if (dres.length > 1) {
      caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("porDreTitulo") }),
        el("div", { class: "overflow-x-auto mt-2" }, el("table", { id: "pi-por-dre", class: "pi-tabla" },
          el("thead", {}, el("tr", {}, el("th", { scope: "col", texto: tx("porDreRegion") }), el("th", { class: "num", scope: "col", texto: tx("porDreEstudiantes") }),
            el("th", { class: "num", scope: "col", texto: tx("oro") }), el("th", { class: "num", scope: "col", texto: tx("plata") }),
            el("th", { class: "num", scope: "col", texto: tx("bronce") }), el("th", { class: "num", scope: "col", texto: tx("porDreClasifican") }))),
          el("tbody", {}, dres.map((x) => el("tr", {}, el("td", { class: "font-semibold", texto: x.region }), el("td", { class: "num", texto: x.estudiantes }),
            el("td", { class: "num", texto: x.oro }), el("td", { class: "num", texto: x.plata }), el("td", { class: "num", texto: x.bronce }), el("td", { class: "num", texto: x.clasifican })))))));
    }

    // El horario del día: la hora de cada ronda según el ritmo de cada torneo.
    const inicio = el("input", { id: "pi-horario-inicio", type: "time", value: leer(CLAVE_HORARIO + ev.id) || "08:00", class: C.campoChico });
    const descanso = el("input", { id: "pi-horario-descanso", type: "number", min: "0", max: "120", value: leer(CLAVE_HORARIO + ev.id + "_descanso") || "10", inputmode: "numeric", class: C.campoChico + " w-20" });
    const listaHorario = el("ul", { id: "pi-horario-lista", class: "mt-2 space-y-1 text-sm" });
    const pintarHorario = () => {
      escribir(CLAVE_HORARIO + ev.id, inicio.value);
      escribir(CLAVE_HORARIO + ev.id + "_descanso", descanso.value);
      listaHorario.replaceChildren(...V.horario(torneosDelEvento(), inicio.value, descanso.value).map((x) => el("li", {},
        el("span", { class: "font-semibold", texto: x.torneo + ": " }),
        x.dura ? x.rondas.map((rr) => tx("rondaN", { r: rr.n }) + " " + rr.hora).join(" · ") : tx("horarioSinRitmo"))));
    };
    // Al cambiarlo, el enlace del evento recibe las horas nuevas (la cuenta
    // regresiva de la próxima ronda).
    inicio.addEventListener("change", () => { pintarHorario(); Pagina.difundirEvento(); });
    descanso.addEventListener("change", () => { pintarHorario(); Pagina.difundirEvento(); });
    const bHorario = el("button", { type: "button", id: "pi-horario-imprimir", class: C.botonSec }, tx("horarioImprimir"));
    bHorario.addEventListener("click", () => imprimirHorario(ev, V.horario(torneosDelEvento(), inicio.value, descanso.value)));
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("horarioTitulo") }),
      el("p", { class: C.nota, texto: tx("horarioTexto") }),
      el("div", { class: "flex flex-wrap items-end gap-3 mt-2" },
        el("label", { class: "text-sm" }, el("span", { class: "block font-semibold", texto: tx("horarioInicio") }), inicio),
        el("label", { class: "text-sm" }, el("span", { class: "block font-semibold", texto: tx("horarioDescanso") }), descanso),
        bHorario),
      listaHorario);
    pintarHorario();

    // Lo que falta revisar antes de la ronda 1, en todo el evento.
    const conPendientes = torneos.map((x) => [x, sinRevisar(x)]).filter(([, k]) => k > 0);
    if (conPendientes.length) {
      caja.append(el("div", { id: "pi-evento-revisar", class: "mt-4" },
        el("p", { class: "text-sm font-semibold", texto: tx("cortosAviso") + " " + tx("eventoRevisar") }),
        el("ul", { class: "list-disc pl-6 text-sm" }, conPendientes.map(([x, k]) => el("li", { texto: (x.grupo || x.nombre) + ": " + k })))));
    }

    // Para chess-results: el TRF de cada torneo, en un .zip. chess-results no
    // recibe archivos directo: se abren en Swiss-Manager y se suben desde ahí.
    const bChess = el("button", { type: "button", id: "pi-evento-chess", class: C.botonSec }, tx("chessBajar"));
    bChess.addEventListener("click", () => {
      const lista = torneosDelEvento();
      const partes = [];
      const faltan = [];
      for (const x of lista) {
        const k = x.rondas.filter((R) => T.rondaCompleta(R)).length;
        const nombre = window.PareoPDF.nombreArchivo(x.grupo || x.nombre, "").replace(/-?\.pdf$/, "");
        try {
          partes.push({ nombre: nombre + ".trf", texto: T.aTrf(x, { hasta: k }) });
          if (E.esDeEquipos(x)) partes.push({ nombre: nombre + "-equipos.trf", texto: E.aTrfEquipos(x, k) });
        } catch (e) { faltan.push(x.grupo || x.nombre); }
      }
      if (!partes.length) { Avisos.avisar(tx("chessNada"), { tipo: "error" }); return; }
      bajar(window.PareoPDF.nombreArchivo(ev.nombre, "chess-results").replace(/\.pdf$/, ".zip"), window.TablaExcel.zip(partes), "application/zip");
      Avisos.avisar(tx("chessListo", { n: partes.length }) + (faltan.length ? " " + tx("chessFaltan", { t: faltan.join(", ") }) : ""));
    });
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("chessTitulo") }),
      el("p", { class: C.nota, texto: tx("chessTexto") }), el("div", { class: "mt-2" }, bChess));

    // Comparado con el año anterior (los torneos de chess-results que ya
    // tiene «Ajedrez estudiantil en Costa Rica»).
    if (ev.jde && ev.jde.etapa !== "institucional") {
      const cajaAnio = el("div", { id: "pi-anio-anterior", class: "mt-2" });
      const bAnio = el("button", { type: "button", id: "pi-evento-anio", class: C.botonSec }, tx("anioBoton", { a: ev.jde.anio - 1 }));
      bAnio.addEventListener("click", () => compararAnio(ev, cajaAnio, bAnio));
      caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("anioTitulo") }),
        el("p", { class: C.nota, texto: tx("anioTexto") }), el("div", { class: "mt-2" }, bAnio), cajaAnio);
    }

    // El cierre: lo que falta, y el paquete final en un .zip.
    const cierre = V.revisarCierre(ev, torneos);
    const faltan = cierre.filter((x) => x.problemas.length);
    const bCierre = el("button", { type: "button", id: "pi-evento-cierre", class: faltan.length ? C.botonSec : C.boton }, tx("cierreBajar"));
    bCierre.addEventListener("click", async () => {
      if (faltan.length) {
        const ok = await Avisos.confirmar(tx("cierreIgual", { n: faltan.length }), { aceptar: tx("cierreBajarIgual") });
        if (!ok) return;
      }
      bajarPaquete(ev, bCierre);
    });
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("cierreTitulo") }),
      el("p", { class: C.nota, texto: tx("cierreTexto") }),
      faltan.length
        ? el("ul", { id: "pi-cierre-faltan", class: "mt-2 space-y-1 text-sm list-disc pl-6" }, faltan.map((x) => el("li", {},
          el("span", { class: "font-semibold", texto: x.torneo + ": " }), x.problemas.map((p) => tx(p.clave, p.vars)).join(" · "))))
        : el("p", { id: "pi-cierre-listo", class: "text-sm font-semibold mt-2", texto: tx("cierreListo") }),
      el("div", { class: "mt-2" }, bCierre));

    // El enlace en vivo de todo el evento: un solo QR para el público.
    const vivo = estado.eventoVivo && estado.eventoVivo.id === ev.id;
    const qr = el("div", { id: "pi-evento-qr", class: "mt-3" });
    const bVivo = el("button", { type: "button", id: "pi-evento-vivo", class: vivo ? C.botonSec : C.boton, "aria-pressed": vivo ? "true" : "false" },
      tx(vivo ? "eventoVivoApagar" : "eventoVivoPrender"));
    bVivo.addEventListener("click", async () => {
      if (estado.eventoVivo && estado.eventoVivo.id === ev.id) Pagina.apagarEventoVivo();
      else if (!(await Pagina.prenderEventoVivo(ev))) return;
      pintarEvento();
      const b = $("pi-evento-vivo");
      if (b) b.focus();
    });
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("eventoVivoTitulo") }),
      el("p", { class: C.nota, texto: tx("eventoVivoTexto") }), el("div", { class: "mt-2" }, bVivo), qr);
    if (vivo) Pagina.mostrarQrEvento(qr);

    // El respaldo: todos los torneos del evento en un solo archivo.
    const bRespaldo = el("button", { type: "button", id: "pi-evento-respaldo", class: C.botonSec }, tx("eventoRespaldo"));
    bRespaldo.addEventListener("click", () => {
      const lista = torneosDelEvento();
      bajar(window.PareoPDF.nombreArchivo(ev.nombre, "respaldo").replace(/\.pdf$/, ".json"), JSON.stringify(V.respaldo(ev, lista), null, 1), "application/json");
      Avisos.avisar(tx("eventoRespaldoListo", { n: lista.length }));
    });
    const auto = estado.respaldoArchivo && estado.respaldoArchivo.id === ev.id;
    const bAuto = el("button", { type: "button", id: "pi-respaldo-auto", class: C.botonSec, "aria-pressed": auto ? "true" : "false" },
      tx(auto ? "respaldoAutoApagar" : (window.showSaveFilePicker ? "respaldoAutoPrender" : "respaldoAutoPrenderDescarga")));
    bAuto.addEventListener("click", () => {
      if (estado.respaldoArchivo && estado.respaldoArchivo.id === ev.id) { estado.respaldoArchivo = null; Pagina.recordarArchivoRespaldo(ev.id, null); pintarEvento(); }
      else Pagina.prenderRespaldo(ev);
    });
    // Se cerró la página con el respaldo prendido: un clic lo retoma en el
    // mismo archivo (el navegador pide el permiso otra vez).
    const bRetomar = el("button", { type: "button", id: "pi-respaldo-retomar", class: C.boton, hidden: true });
    if (!auto && window.showSaveFilePicker) Pagina.archivoRecordado(ev.id).then((archivo) => {
      if (!archivo || !bRetomar.isConnected || estado.respaldoArchivo) return;
      bRetomar.textContent = tx("respaldoRetomar", { a: archivo.name });
      bRetomar.hidden = false;
      bRetomar.onclick = () => Pagina.retomarRespaldo(ev, archivo);
    });
    // Las firmas del acta: en esta pantalla (con el dedo o el mouse) o desde
    // un celular, con su enlace. Van como imagen en el PDF del acta.
    const firmas = ev.firmas || [];
    const listaFirmas = el("ul", { id: "pi-firmas-lista", class: "mt-2 space-y-1 text-sm" }, firmas.map((f, k) => el("li", { class: "flex flex-wrap items-center gap-2" },
      el("span", { texto: (V.CARGOS_FIRMA[f.cargo] || f.cargo) + ": " + f.nombre + " · " + horaCR(f.hora) }),
      el("button", { type: "button", class: C.mini, "data-quitar-firma": String(k), onclick: () => { Pagina.guardarFirmas(ev.id, firmas.filter((x, i) => i !== k)); pintarEvento(); } }, tx("quitar")))));
    const bFirmar = el("button", { type: "button", id: "pi-firmar-aqui", class: C.botonSec }, tx("firmarAqui"));
    bFirmar.addEventListener("click", async () => {
      const f = await Pagina.pedirFirma();
      if (!f) return;
      Pagina.guardarFirmas(ev.id, (t().evento.firmas || []).concat(f));
      pintarEvento();
      Avisos.avisar(tx("firmaGuardada", { n: f.nombre }));
    });
    const firmando = estado.firmaCelular && estado.firmaCelular.id === ev.id;
    const bCelular = el("button", { type: "button", id: "pi-firmar-celular", class: C.botonSec, "aria-pressed": firmando ? "true" : "false" }, tx(firmando ? "firmarCelularApagar" : "firmarCelular"));
    bCelular.addEventListener("click", async () => {
      if (estado.firmaCelular && estado.firmaCelular.id === ev.id) { estado.firmaCelular.canal.unsubscribe(); estado.firmaCelular = null; }
      else await Pagina.prenderFirmaCelular(ev);
      pintarEvento();
      const b = $("pi-firmar-celular"); if (b) b.focus();
    });
    const cajaFirmaCel = el("div", { id: "pi-firma-celular-caja", class: "mt-2" });
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("firmasTitulo") }),
      el("p", { class: C.nota, texto: tx("firmasTexto") }), listaFirmas,
      el("div", { class: "mt-2 flex flex-wrap gap-2" }, bFirmar, bCelular), cajaFirmaCel);
    if (firmando) Pagina.mostrarFirmaCelular(cajaFirmaCel);

    // El informe para la prensa: un texto corto para pegar.
    const cajaPrensa = el("div", { id: "pi-prensa-caja", class: "mt-2" });
    const bPrensa = el("button", { type: "button", id: "pi-evento-prensa", class: C.botonSec }, tx("prensaArmar"));
    bPrensa.addEventListener("click", () => {
      const texto = V.informePrensa(ev, torneosDelEvento(), window.HoraCR.dia(Date.now()));
      const area = el("textarea", { id: "pi-prensa-texto", rows: "12", readonly: true, class: C.campo + " font-mono text-xs mt-2", "aria-label": tx("prensaTitulo") });
      area.value = texto;
      const copiar = el("button", { type: "button", id: "pi-prensa-copiar", class: C.mini + " mt-2" }, tx("prensaCopiar"));
      copiar.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(area.value); Avisos.avisar(tx("prensaCopiado")); }
        catch (e) { area.select(); Avisos.avisar(tx("noCopia"), { tipo: "error" }); }
      });
      cajaPrensa.replaceChildren(area, copiar);
      area.focus();
    });
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("prensaTitulo") }),
      el("p", { class: C.nota, texto: tx("prensaTexto") }), el("div", { class: "mt-2" }, bPrensa), cajaPrensa);

    // Pasar el evento a otra computadora, por el mismo canal que el enlace en
    // vivo: la otra abre la dirección, lo pide y esta pregunta antes de mandarlo.
    const pasando = estado.pasar && estado.pasar.id === ev.id;
    const bPasar = el("button", { type: "button", id: "pi-evento-pasar", class: C.botonSec, "aria-pressed": pasando ? "true" : "false" }, tx(pasando ? "pasarApagar" : "pasarPrender"));
    bPasar.addEventListener("click", async () => {
      if (estado.pasar && estado.pasar.id === ev.id) Pagina.apagarPasar(); else await Pagina.prenderPasar(ev);
      pintarEvento();
      const b = $("pi-evento-pasar");
      if (b) b.focus();
    });
    const cajaPasar = el("div", { id: "pi-pasar-caja", class: "mt-2" });
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("pasarTitulo") }),
      el("p", { class: C.nota, texto: tx("pasarTexto") }), el("div", { class: "mt-2" }, bPasar), cajaPasar);
    if (pasando) Pagina.mostrarPasar(cajaPasar);
    // La inscripción tardía desde el celular de los entrenadores.
    Pagina.pintarInscripcionCelular(caja, ev);
    // Cuánto duró cada ronda de cada categoría, para el horario del próximo.
    pintarDuraciones(caja, ev);
    // Las mesas de la sala: cada torneo con su rango de mesas físicas, para
    // que ningún número se repita con varias categorías en la misma sala.
    pintarMesasDeLaSala(caja, ev);
    // Las plantillas de la pared de la ronda en juego de TODAS las
    // categorías, en un solo trabajo de impresión (una por hoja).
    const bPlantillas = el("button", { type: "button", id: "pi-evento-plantillas", class: C.botonSec }, tx("eventoPlantillas"));
    bPlantillas.addEventListener("click", () => Pagina.imprimirPlantillasDelEvento());
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("eventoPlantillasTitulo") }),
      el("p", { class: C.nota, texto: tx("eventoPlantillasTexto") }), el("div", { class: "mt-2" }, bPlantillas));
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("eventoRespaldoTitulo") }),
      el("p", { class: C.nota, texto: tx("eventoRespaldoTexto") }), el("div", { class: "mt-2 flex flex-wrap gap-2" }, bRetomar, bRespaldo, bAuto),
      el("p", { id: "pi-respaldo-estado", class: C.nota + " mt-1", role: "status",
        texto: auto ? (estado.respaldoArchivo.hora ? tx("respaldoAutoHecho", { h: horaCR(estado.respaldoArchivo.hora) }) : tx(window.showSaveFilePicker ? "respaldoAutoActivo" : "respaldoAutoActivoDescarga")) : tx(window.showSaveFilePicker ? "respaldoAutoAyuda" : "respaldoAutoAyudaDescarga") }));

    if (!siguiente || !n) return;
    // Los clasificados: los primeros n de cada torneo (art. 66.1).
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("clasificadosTitulo", { e: tx(TEXTO_ETAPA_SIGUIENTE[siguiente]), n }) }),
      el("p", { class: C.nota, texto: tx("clasificadosTexto", { n }) }));
    const lista = el("div", { id: "pi-clasificados", class: "mt-2 space-y-3" });
    for (const tor of torneos) {
      const c = V.clasificados(tor, n);
      const sec = el("section", { class: "text-sm" }, el("h4", { class: "font-semibold", texto: tor.grupo || tor.nombre }));
      if (!c.filas.length) sec.append(el("p", { class: C.nota, texto: tx("clasificadosSinRondas") }));
      else {
        if (!c.terminado) sec.append(el("p", { class: C.nota, texto: tx("clasificadosProvisional", { r: c.rondas, t: c.total }) }));
        sec.append(el("ol", { class: "list-decimal pl-6" }, c.filas.map((f) => {
          const p = tor.jugadores.find((j) => j.id === f.id);
          return el("li", { texto: p.nombre + " (" + (p.institucion || "—") + ") · " + puntosTexto(f.puntos) });
        })));
        if (c.empate) sec.append(el("p", { class: "font-semibold" }, tx("cortosAviso") + " " + tx("clasificadosEmpate")));
        const empatados = V.empatadosEnCorte(Object.assign({}, tor, { desempateCorte: null }), n);
        if (empatados.length) {
          const resuelto = c.filas.some((f) => f.porDesempate);
          const d = tor.desempateCorte;
          const enVivo = d && d.vivo && !d.orden && sonLosMismos(d.empatados, empatados);
          if (resuelto) sec.append(el("p", { class: "text-sm", texto: tx("desempateHecho", { f: d.formato || tx("desempateRapido") }) }));
          if (enVivo) sec.append(panelDesempateVivo(tor, empatados));
          const b = el("button", { type: "button", class: C.mini + " mt-1", "data-desempate": tor.__id }, tx(resuelto ? "desempateCambiar" : "desempateArmar"));
          b.addEventListener("click", () => armarDesempate(tor, empatados, n));
          const bVivo = el("button", { type: "button", class: C.mini + " mt-1 ml-2", "data-desempate-vivo": tor.__id }, tx("desempateJugar"));
          bVivo.addEventListener("click", () => empezarDesempateVivo(tor, empatados));
          sec.append(b, enVivo || resuelto ? null : bVivo);
        }
      }
      lista.append(sec);
    }
    const bLista = el("button", { type: "button", id: "pi-evento-clasificados", class: C.botonSec + " mt-3" }, tx("clasificadosBajar"));
    bLista.addEventListener("click", () => {
      const filas = V.filasClasificados(ev, torneosDelEvento());
      if (!filas.length) { Avisos.avisar(tx("clasificadosNadie"), { tipo: "error" }); return; }
      window.TablaExcel.bajar(window.PareoPDF.nombreArchivo(ev.nombre, "clasificados").replace(/\.pdf$/, ".xlsx"), [{ nombre: "Clasificados", filas: [V.ENCABEZADOS].concat(filas) }]);
    });
    caja.append(lista, bLista, el("p", { class: C.nota + " mt-2", texto: tx("clasificadosAyuda") }));
  }
  const CLAVE_HORARIO = "pareo_horario_v1_";

  async function compararAnio(ev, cont, boton) {
    boton.disabled = true;
    try {
      const r = await fetch("data/ajedrez-estudiantil.json", { cache: "no-cache" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const c = V.compararAnioAnterior(ev, torneosDelEvento(), await r.json());
      if (!c.torneosAntes) { cont.replaceChildren(el("p", { class: "text-sm mt-2", texto: tx("anioNada", { a: c.anio }) })); return; }
      cont.replaceChildren(
        el("p", { class: "text-sm mt-2 font-semibold", texto: tx("anioResumen", { a: c.anio, t: c.torneosAntes, x: c.totalAntes, y: c.totalAhora }) }),
        el("div", { class: "overflow-x-auto mt-2" }, el("table", { id: "pi-anio-tabla", class: "pi-tabla" },
          el("thead", {}, el("tr", {}, el("th", { scope: "col", texto: tx("anioGrupo") }), el("th", { class: "num", scope: "col", texto: String(c.anio) }), el("th", { class: "num", scope: "col", texto: String(c.anio + 1) }))),
          el("tbody", {}, c.filas.map((f) => el("tr", {}, el("td", { texto: f.grupo }), el("td", { class: "num", texto: f.antes == null ? "—" : f.antes }), el("td", { class: "num", texto: f.ahora == null ? "—" : f.ahora })))))),
        el("p", { class: C.nota + " mt-1", texto: tx("anioNota") }));
    } catch (e) {
      cont.replaceChildren(el("p", { class: "text-sm mt-2", texto: tx("anioError", { e: e.message }) }));
    } finally {
      boton.disabled = false;
    }
  }

  // El paquete final del evento: el acta, el informe y la premiación en
  // PDF, los clasificados y las estadísticas en Excel y el respaldo, en un
  // solo .zip (js/tabla-excel.js: zip).
  async function bajarPaquete(ev, boton) {
    boton.disabled = true;
    try {
      const lista = torneosDelEvento();
      const pdf = async (doc) => new Uint8Array(await (await window.PareoPDF.generar(doc)).arrayBuffer());
      const partes = [
        { nombre: "acta-congresillo.pdf", bytes: await pdf(V.acta(ev, lista)) },
        { nombre: "informe-oficial.pdf", bytes: await pdf(V.informe(ev, lista)) },
        { nombre: "premiacion.pdf", bytes: await pdf(V.premiacion(ev, lista)) },
        { nombre: "estadisticas.xlsx", bytes: window.TablaExcel.armar(V.estadisticas(ev, lista)) },
        { nombre: "respaldo.json", texto: JSON.stringify(V.respaldo(ev, lista), null, 1) },
      ];
      const filas = V.filasClasificados(ev, lista);
      if (filas.length) partes.splice(3, 0, { nombre: "clasificados.xlsx", bytes: window.TablaExcel.armar([{ nombre: "Clasificados", filas: [V.ENCABEZADOS].concat(filas) }]) });
      const archivo = window.PareoPDF.nombreArchivo(ev.nombre, "paquete-final").replace(/\.pdf$/, ".zip");
      bajar(archivo, window.TablaExcel.zip(partes), "application/zip");
      Avisos.avisar(tx("cierreBajado", { n: partes.length }));
      // El paquete ya trae el respaldo: se ofrece sacar el evento de la lista.
      const ok = await Avisos.confirmar(tx("cierreArchivar", { n: lista.length, a: archivo }), { aceptar: tx("cierreArchivarSi"), cancelar: tx("cierreArchivarNo") });
      if (ok) {
        quitarArchivados(lista.map((y) => y.__id).filter(Boolean), archivo, lista.map((y) => y.nombre || ""), ev.nombre);
        Avisos.avisar(tx("cierreArchivado", { n: lista.length }));
      }
    } catch (e) {
      Avisos.avisar(tx("noPdf", { e: e.message }), { tipo: "error" });
    } finally {
      boton.disabled = false;
    }
  }

  // El desempate rápido del corte: el formato y el orden en que quedaron.
  // Lo jugado fuera de Pareo Integral (un blitz, un Armagedón) se anota acá
  // y ordena a los empatados (V.aplicarDesempate).
  async function armarDesempate(tor, empatados, n) {
    const nombre = (id) => (tor.jugadores.find((j) => j.id === id) || {}).nombre || "?";
    const opciones = empatados.map((id) => [id, nombre(id)]);
    const previo = (tor.desempateCorte && tor.desempateCorte.orden) || empatados;
    const campos = [{ nombre: "formato", etiqueta: tx("desempateFormato"), valor: (tor.desempateCorte && tor.desempateCorte.formato) || tx("desempateBlitz"), max: 60 }]
      .concat(empatados.map((id, k) => ({ nombre: "p" + k, etiqueta: tx("desempatePuesto", { p: k + 1 }), tipo: "select", opciones, valor: previo[k] || id })));
    const r = await Avisos.formulario({ titulo: tx("desempateTitulo", { t: tor.grupo || tor.nombre }), texto: tx("desempateTexto", { n }), aceptar: tx("desempateGuardar"), cancelar: tx("cancelar"), campos });
    if (!r) return;
    const orden = empatados.map((id, k) => r["p" + k]);
    if (new Set(orden).size !== orden.length) { Avisos.avisar(tx("desempateRepetido"), { tipo: "error" }); return; }
    tor.desempateCorte = { formato: String(r.formato || "").trim().slice(0, 60), orden };
    if (!Pagina.guardarDelEvento(tor)) return;
    pintarEvento();
    Avisos.avisar(tx("desempateListo"));
  }

  const sonLosMismos = (a, b) => Array.isArray(a) && a.length === b.length && a.every((x) => b.includes(x));

  // El desempate jugado acá: Pareo Integral arma cada partida (todos contra
  // todos, y si siguen empatados, un Armagedón o otra vuelta) y ordena el
  // corte solo cuando ya no queda nadie empatado (V.resolverDesempate).
  async function empezarDesempateVivo(tor, empatados) {
    const r = await Avisos.formulario({
      titulo: tx("desempateTitulo", { t: tor.grupo || tor.nombre }), texto: tx("desempateJugarTexto", { k: empatados.length }),
      aceptar: tx("desempateJugarEmpezar"), cancelar: tx("cancelar"),
      campos: [{ nombre: "formato", etiqueta: tx("desempateFormato"), valor: tx("desempateBlitz"), max: 60 }],
    });
    if (!r) return;
    tor.desempateCorte = { formato: String(r.formato || "").trim().slice(0, 60) || tx("desempateBlitz"), vivo: true, empatados: empatados.slice(), partidas: [], orden: null };
    V.resolverDesempate(tor.desempateCorte, empatados);
    if (!Pagina.guardarDelEvento(tor)) return;
    pintarEvento();
  }

  function panelDesempateVivo(tor, empatados) {
    const d = tor.desempateCorte;
    const nombre = (id) => (tor.jugadores.find((j) => j.id === id) || {}).nombre || "?";
    const filas = d.partidas.map((p, k) => {
      const sel = el("select", { class: C.campoChico, "data-desempate-partida": String(k), "aria-label": tx("desempatePartidaA", { b: nombre(p.b), n: nombre(p.n) }) },
        Pagina.RESULTADOS.slice(0, 4).map(([val, clave]) => el("option", { value: val, texto: tx(clave) })));
      sel.value = p.r || "";
      sel.addEventListener("change", () => {
        p.r = sel.value || null;
        // Una partida cambiada puede deshacer lo que venía después: se vuelve
        // a resolver desde cero con las que siguen sirviendo.
        V.resolverDesempate(d, empatados);
        if (!Pagina.guardarDelEvento(tor)) return;
        pintarEvento();
        if (d.orden) Avisos.avisar(tx("desempateResuelto", { l: d.orden.map((id, i) => (i + 1) + ". " + nombre(id)).join(", ") }));
      });
      return el("li", { class: "flex flex-wrap items-center gap-2" },
        el("span", { texto: (p.arm ? tx("desempateArm") + ": " : "") + nombre(p.b) + " – " + nombre(p.n) }), sel);
    });
    return el("div", { class: "mt-2 rounded-lg border border-brand-200 dark:border-brand-700 p-3", "data-desempate-panel": tor.__id },
      el("p", { class: "font-semibold text-sm", texto: tx("desempateEnJuego", { f: d.formato }) }),
      el("ul", { class: "mt-1 space-y-1 text-sm" }, filas),
      d.partidas.some((p) => p.arm) ? el("p", { class: C.nota + " mt-1", texto: tx("desempateArmNota") }) : null);
  }

  // El horario del día en una hoja, para la pared y las delegaciones.
  function imprimirHorario(ev, horario) {
    const cont = $("pi-firmas");
    cont.replaceChildren();
    const hoja = el("div", { class: "pi-firma-mesa" }, el("h1", { class: "pi-firma-titulo", texto: tx("horarioTitulo") + " — " + ev.nombre }));
    for (const x of horario) {
      hoja.append(el("p", { class: "pi-firma-jugador font-semibold", texto: x.torneo }),
        el("p", { class: "pi-firma-resultado", texto: x.dura ? x.rondas.map((rr) => tx("rondaN", { r: rr.n }) + ": " + rr.hora).join("   ·   ") : tx("horarioSinRitmo") }));
    }
    cont.append(hoja);
    document.body.classList.add("pi-imprimiendo-firmas");
    window.print();
  }

  // Las constancias de participación: como los diplomas, una por hoja.
  function imprimirConstancias(lista) {
    if (!lista.length) { Avisos.avisar(tx("constanciasNadie"), { tipo: "error" }); return; }
    const cont = $("pi-firmas");
    cont.replaceChildren();
    const primero = torneosDelEvento()[0] || {};
    for (const c of lista) {
      const x = V.textoConstancia(c);
      cont.append(el("div", { class: "pi-diploma", lang: "es" },
        el("p", { class: "pi-diploma-evento", texto: x.encabezado }),
        el("p", { class: "pi-diploma-nombre", texto: x.titulo }),
        el("p", { class: "pi-diploma-otorga", texto: x.otorga }),
        el("p", { class: "pi-diploma-nombre", texto: x.nombre }),
        x.centro ? el("p", { class: "pi-diploma-texto", texto: x.centro }) : null,
        el("p", { class: "pi-diploma-texto", texto: x.motivo }),
        el("div", { class: "pi-diploma-firmas" },
          el("p", { class: "pi-firma-linea", texto: "Árbitro principal" + (primero.arbitro ? ": " + primero.arbitro : "") }),
          el("p", { class: "pi-firma-linea", texto: "Comité Organizador" }))));
    }
    document.body.classList.add("pi-imprimiendo-firmas");
    window.print();
  }

  // Los certificados de los árbitros: como las constancias, uno por hoja.
  function imprimirCertificadosArbitro(lista) {
    if (!lista.length) { Avisos.avisar(tx("certificadosNadie"), { tipo: "error" }); return; }
    const cont = $("pi-firmas");
    cont.replaceChildren();
    for (const c of lista) {
      const x = V.textoCertificadoArbitro(c);
      cont.append(el("div", { class: "pi-diploma", lang: "es" },
        el("p", { class: "pi-diploma-evento", texto: x.encabezado }),
        el("p", { class: "pi-diploma-nombre", texto: x.titulo }),
        el("p", { class: "pi-diploma-otorga", texto: x.otorga }),
        el("p", { class: "pi-diploma-nombre", texto: x.nombre }),
        el("p", { class: "pi-diploma-texto", texto: x.motivo }),
        el("div", { class: "pi-diploma-firmas" },
          el("p", { class: "pi-firma-linea", texto: "Comité Organizador" }),
          el("p", { class: "pi-firma-linea", texto: "Comisión de Árbitros" }))));
    }
    document.body.classList.add("pi-imprimiendo-firmas");
    window.print();
  }

  // El cartel para la entrada: el nombre del evento, el QR del enlace en
  // vivo (lo prende si hace falta), el horario y los torneos.
  async function imprimirCartel(ev) {
    if (!(estado.eventoVivo && estado.eventoVivo.id === ev.id)) {
      const ok = await Avisos.confirmar(tx("cartelPrender"), { aceptar: tx("eventoVivoPrender") });
      if (!ok || !(await Pagina.prenderEventoVivo(ev))) return;
      pintarEvento();
    }
    try { await PareoQr.cargar(); } catch (e) { Avisos.avisar(tx("errorQr", { e: e.message }), { tipo: "error" }); return; }
    const url = location.origin + location.pathname + "#evento=" + estado.eventoVivo.codigo;
    const lista = torneosDelEvento(ev.id);
    const inicio = leer(CLAVE_HORARIO + ev.id);
    const horario = inicio ? V.horario(lista, inicio, leer(CLAVE_HORARIO + ev.id + "_descanso") || "10") : [];
    const cont = $("pi-firmas");
    cont.replaceChildren(el("div", { class: "pi-cartel", lang: "es" },
      el("h1", { class: "pi-cartel-titulo", texto: ev.nombre || "" }),
      el("p", { class: "pi-cartel-texto", texto: "Resultados, rondas y clasificación en vivo: escanea el código con el celular." }),
      el("div", { class: "pi-cartel-qr" }, PareoQr.svg(url, tx("qrEtiqueta"))),
      el("p", { class: "pi-cartel-url", texto: url }),
      horario.some((x) => x.rondas.length) ? el("div", { class: "pi-cartel-horario" },
        el("h2", { texto: "Horario" }),
        el("ul", {}, horario.filter((x) => x.rondas.length).map((x) => el("li", { texto: x.torneo + ": " + x.rondas.map((rr) => "R" + rr.n + " " + rr.hora).join(" · ") })))) : null,
      el("div", { class: "pi-cartel-torneos" },
        el("h2", { texto: "Torneos" }),
        el("ul", {}, lista.map((x) => el("li", { texto: (x.grupo || x.nombre) + " · " + x.jugadores.length + (E.esDeEquipos(x) ? " equipos" : " participantes") }))))));
    document.body.classList.add("pi-imprimiendo-firmas");
    window.print();
  }

  const TEXTO_ETAPA_SIGUIENTE = { regional: "etapaRegional", interregional: "etapaInterregionalNombre", nacional: "etapaNacional" };

  // Un diploma por hoja, apaisado (el texto, de js/pareo/evento.js: en
  // español, como el acta).
  function imprimirDiplomas(lista) {
    if (!lista.length) { Avisos.avisar(tx("diplomasNadie"), { tipo: "error" }); return; }
    const cont = $("pi-firmas");
    cont.replaceChildren();
    const primero = torneosDelEvento()[0] || {};
    for (const d of lista) {
      const x = V.textoDiploma(d);
      cont.append(el("div", { class: "pi-diploma", lang: "es" },
        el("p", { class: "pi-diploma-evento", texto: x.encabezado }),
        el("p", { class: "pi-diploma-otorga", texto: x.otorga }),
        el("p", { class: "pi-diploma-nombre", texto: x.nombre }),
        x.centro ? el("p", { class: "pi-diploma-texto", texto: x.centro }) : null,
        el("p", { class: "pi-diploma-texto", texto: x.motivo }),
        el("div", { class: "pi-diploma-firmas" },
          el("p", { class: "pi-firma-linea", texto: "Árbitro principal" + (primero.arbitro ? ": " + primero.arbitro : "") }),
          el("p", { class: "pi-firma-linea", texto: "Comité Organizador" }))));
    }
    document.body.classList.add("pi-imprimiendo-firmas");
    window.print();
  }

  // «Cuánto duró cada ronda»: de cada torneo del evento, cuándo se emparejó,
  // cuándo empezó el reloj, cuándo terminó la última mesa y cuántos minutos
  // fueron; en pantalla y en un Excel, para armar el horario del próximo
  // evento con datos de verdad.
  function pintarDuraciones(caja, ev) {
    const filas = V.duraciones(torneosDelEvento()).filter((x) => x.emparejada || x.fin);
    if (!filas.length) return;
    const hora = (ms) => (ms ? horaCR(ms) : "—");
    const enExcel = el("button", { type: "button", id: "pi-duraciones-excel", class: C.botonSec }, tx("duracionesExcel"));
    enExcel.addEventListener("click", () => {
      const tabla = [[tx("salaTorneo"), tx("duracionRonda"), tx("duracionEmparejada"), tx("duracionInicio"), tx("duracionFin"), tx("duracionMinutos")]]
        .concat(filas.map((x) => [x.torneo, x.ronda, hora(x.emparejada), hora(x.inicio), hora(x.fin), x.minutos == null ? "" : x.minutos]));
      bajar(window.PareoPDF.nombreArchivo(ev.nombre, "duracion-de-las-rondas").replace(/\.pdf$/, ".xlsx"),
        window.TablaExcel.armar([{ nombre: tx("duracionesHoja"), filas: tabla }]), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    });
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("duracionesTitulo") }),
      el("p", { class: C.nota, texto: tx("duracionesTexto") }),
      el("div", { class: "overflow-x-auto mt-2" }, el("table", { id: "pi-duraciones", class: "pi-tabla" },
        el("thead", {}, el("tr", {}, [tx("salaTorneo"), tx("duracionRonda"), tx("duracionEmparejada"), tx("duracionInicio"), tx("duracionFin"), tx("duracionMinutos")].map((x) => el("th", { scope: "col", texto: x })))),
        el("tbody", {}, filas.map((x) => el("tr", {}, el("td", { texto: x.torneo }), el("td", { class: "num", texto: x.ronda }),
          el("td", { texto: hora(x.emparejada) }), el("td", { texto: hora(x.inicio) }), el("td", { texto: hora(x.fin) }),
          el("td", { class: "num", texto: x.minutos == null ? "—" : String(x.minutos) })))))),
      el("div", { class: "mt-2" }, enExcel));
  }

  // «Las mesas de la sala»: la primera mesa de cada torneo (t.mesaInicial),
  // «Numerar seguido» (cada uno empieza donde terminó el anterior), «Volver
  // a 1, 2, 3…» y el plano para pegar en la entrada.
  function pintarMesasDeLaSala(caja, ev) {
    const lista = torneosDelEvento();
    if (lista.length < 2) return;
    const filas = lista.map((y) => {
      const desde = V.mesaFisica(y, 0);
      const campo = el("input", { type: "number", min: "1", max: "999", step: "1", value: String(desde), class: C.campoChico + " w-20",
        "data-mesa-inicial": y.__id || "", "aria-label": tx("salaPrimeraMesaDe", { t: V.nombreTorneo(y) }) });
      campo.addEventListener("change", () => {
        const n = Math.max(1, Math.min(999, Math.floor(Number(campo.value) || 1)));
        y.mesaInicial = n > 1 ? n : undefined;
        if (Pagina.guardarDelEvento(y)) pintarEvento();
      });
      return el("tr", {}, el("td", { class: "font-semibold", texto: V.nombreTorneo(y) }), el("td", { class: "num", texto: V.mesasQueNecesita(y) }),
        el("td", {}, campo), el("td", { class: "num", texto: V.mesaFisica(y, V.mesasQueNecesita(y) - 1) }));
    });
    const seguido = el("button", { type: "button", id: "pi-sala-seguido", class: C.botonSec }, tx("salaSeguido"));
    seguido.addEventListener("click", () => {
      for (const x of V.numerarSala(lista)) { x.t.mesaInicial = x.desde > 1 ? x.desde : undefined; Pagina.guardarDelEvento(x.t); }
      pintarEvento();
      Avisos.avisar(tx("salaNumerada"));
    });
    const reiniciar = el("button", { type: "button", class: C.botonSec }, tx("salaReiniciar"));
    reiniciar.addEventListener("click", () => {
      for (const y of lista) { y.mesaInicial = undefined; Pagina.guardarDelEvento(y); }
      pintarEvento();
    });
    const plano = el("button", { type: "button", id: "pi-sala-plano", class: C.botonSec }, tx("salaPlano"));
    const rotulos = el("button", { type: "button", id: "pi-sala-rotulos", class: C.botonSec }, tx("rotulosBoton"));
    rotulos.addEventListener("click", () => Pagina.imprimirRotulos(ev, lista));
    const gafetes = el("button", { type: "button", id: "pi-gafetes", class: C.botonSec }, tx("gafetesBoton"));
    gafetes.addEventListener("click", () => Pagina.imprimirGafetes(ev, lista));
    plano.addEventListener("click", () => Pagina.imprimirPlanoDeLaSala(ev, lista));
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("salaTitulo") }),
      el("p", { class: C.nota, texto: tx("salaTexto") }),
      el("div", { class: "overflow-x-auto mt-2" }, el("table", { id: "pi-sala-tabla", class: "pi-tabla" },
        el("thead", {}, el("tr", {}, [tx("salaTorneo"), tx("salaNecesita"), tx("salaPrimera"), tx("salaUltima")].map((x) => el("th", { scope: "col", texto: x })))),
        el("tbody", {}, filas))),
      el("div", { class: "mt-2 flex flex-wrap gap-2" }, seguido, reiniciar, plano, rotulos, gafetes));
  }

  Object.assign(Pagina, { decisionesDe, textoRevisar, claveRevisar, sinRevisar, torneosDelEvento, retirosAuto,
    avisarRetiros, pintarEvento, CLAVE_HORARIO });
})();

/*! rev bfb5bbb0d2d82f9f */
