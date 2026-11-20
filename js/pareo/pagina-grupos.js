/* ===== Pareo Integral — la página (pareo.html): un torneo por grupo =====
 *
 * La sugerencia de un torneo por grupo (categorías, topes, repetidos, pase abierto) y crear los
 * torneos del evento.
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
  const { T, G, E, V, CLAVE_LISTA, CLAVE_FICHA, C, escribir, $, el, tx, estado, apagarEnVivo, nuevoId,
    idJugador, guardar, abrir, t, irA, pintarTodo, configuracionPara, TEXTO_ETAPA, pedirEtapaJde,
    nombreConGrupo, soloJugador, agregarTodos } = Pagina;

  // ---------- La sugerencia: un torneo por grupo ----------
  // Cuando la lista trae a la vez a hombres y mujeres, equipos e individual o
  // varias categorías, no se agrega a nadie todavía: se le muestra al árbitro
  // cómo quedaría partida, con cada grupo marcado (menos el que tiene un solo
  // jugador, que no alcanza para un torneo), y él decide.
  function sugerirGrupos(lista, nombreArchivo, limpia, extra) {
    const regiones = [...new Set(lista.map((j) => j.region).filter(Boolean))];
    const base = regiones.length === 1 ? tx("grupoRegional", { r: regiones[0] })
      : String(nombreArchivo || "").replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
    // El año del torneo: el de su fecha de inicio, o el de hoy.
    const anio = Number(String(t().fechaInicio || "").slice(0, 4)) || Number((window.HoraCR ? HoraCR.hoy() : "").slice(0, 4)) || G.JDE_ANIO_NORMATIVA;
    // Una lista de clasificados (con su columna «Etapa») trae la etapa que sigue.
    const siguiente = extra ? extra.siguiente : V.siguienteDe(lista.map((j) => j.etapaOrigen));
    estado.sugerencia = { lista, base, anio, region: regiones, siguiente, comparacion: extra ? extra.comparacion : null, pasarMujeres: true, grupos: [], elegidos: new Map(), abiertos: new Set(), limpia, dondeQueda: new Map(), configJde: true, amistoso: true };
    calcularSugerencia();
    // La lista se sube en la ficha Torneo, y ahí sale la sugerencia.
    if (estado.ficha !== "torneo") irA("torneo");
    pintarSugerencia();
    const caja = $("pi-sugerencia");
    caja.scrollIntoView({ block: "nearest" });
    caja.focus();
  }

  // Cuántos equipos (centros educativos) hay en un grupo de equipos: es lo
  // que se empareja, y de eso sale el sistema.
  const equiposDelGrupo = (g) => new Set(g.jugadores.map((j) => String(j.institucion || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase())).size;
  const participantesDelGrupo = (g) => (g.modalidad === "equipo" ? equiposDelGrupo(g) : g.jugadores.length);

  // Los grupos y la revisión de categorías salen de la lista con o sin el
  // pase de mujeres al abierto, según la casilla. Un grupo que ya estaba
  // conserva su marca; uno nuevo viene marcado si tiene al menos dos.
  function calcularSugerencia() {
    const s = estado.sugerencia;
    // Quien está en dos modalidades o categorías (art. 66.1.h) queda en la
    // que elija el árbitro; mientras no elija, en las dos. La inscripción que
    // no elige sale antes de todo lo demás: el pase, los equipos y los grupos
    // se arman sin ella.
    const fuera = new Set();
    ((s.limpia && s.limpia.dosModalidades) || []).forEach((d, k) => {
      const elegida = s.dondeQueda.get(k);
      if (elegida != null) d.inscripciones.forEach((x, i) => { if (i !== elegida) fuera.add(x.jugador); });
    });
    s.fueraPorModalidad = fuera;
    const lista = s.lista.filter((j) => !fuera.has(j));
    s.pase = G.pasarMujeresAlAbierto(lista, s.pasarMujeres);
    // En cada equipo de más de cinco juegan los que eligió el árbitro (de
    // entrada, los cinco primeros de la inscripción); el resto queda
    // descartado y no entra a ningún torneo.
    s.equipos = G.equiposDeMas(lista).map((e) => Object.assign(e, { maximo: G.JDE_MAX_EQUIPO, tipo: "eq" }));
    s.individuales = G.individualesDeMas(lista).map((e) => Object.assign(e, { maximo: G.JDE_MAX_INDIVIDUAL, tipo: "ind" }));
    s.descartados = new Set();
    // La elección se guarda por equipo y por estado de la casilla del pase:
    // los integrantes de un equipo cambian al prenderla o apagarla, y al
    // volver, cada equipo queda como el árbitro lo había dejado. Si el
    // árbitro desmarca a alguien, el lugar queda libre para que elija.
    // Lo mismo para el tope de dos por centro en individual (art. 66.1.f).
    for (const e of s.equipos.concat(s.individuales)) {
      e.eleccion = e.tipo + "|" + e.clave + "|" + (s.pasarMujeres ? "pase" : "sin-pase");
      const antes = s.elegidos.get(e.eleccion);
      const elegidos = antes ? e.integrantes.filter((j) => antes.has(j)) : e.integrantes.slice(0, e.maximo);
      s.elegidos.set(e.eleccion, new Set(elegidos));
      for (const j of e.integrantes) if (!elegidos.includes(j)) s.descartados.add(j);
    }
    s.juegan = lista.filter((j) => !s.descartados.has(j));
    const { dimensiones, grupos } = G.agrupar(s.juegan);
    const antes = new Map(s.grupos.map((g) => [g.clave, g.marcado]));
    s.dimensiones = dimensiones;
    s.grupos = grupos.map((g) => Object.assign(g, { marcado: antes.has(g.clave) ? antes.get(g.clave) : participantesDelGrupo(g) >= 2 }));
    s.revision = G.revisarCategorias(s.juegan, s.anio);
    s.cortos = G.equiposCortos(s.juegan);
    s.hombresEnMujeres = G.hombresEnMujeres(s.juegan);
  }

  // Los equipos que quedan con menos de tres, con quiénes son: se recalcula
  // con cada decisión del árbitro (pase, los cinco, dónde queda quien estaba
  // en dos modalidades).
  // Quien está anotado como hombre en un torneo de mujeres (individual o
  // equipo): se avisa con su nombre, su centro y el torneo.
  function pintarHombresEnMujeres(s) {
    if (!s.hombresEnMujeres || !s.hombresEnMujeres.length) return null;
    const modo = (j) => tx(j.modalidad === "equipo" ? "grupoEquipos" : "grupoIndividual");
    return el("div", { id: "pi-hombres-mujeres", class: "pi-revisar" },
      el("h4", { class: "pi-revisar-titulo", texto: tx("hombresTitulo") }),
      el("p", { class: "text-sm mt-1", texto: tx("hombresTexto", { n: s.hombresEnMujeres.length }) }),
      el("ul", { id: "pi-hombres-lista", class: "mt-1 space-y-1 text-sm list-disc pl-5" }, s.hombresEnMujeres.map((j) =>
        el("li", {}, el("span", { class: "font-semibold", texto: tx("cortosAviso") + " " }),
          tx("hombresCaso", { n: j.nombre, i: j.institucion || "—", m: modo(j), c: String(j.categoria || "").trim() })))));
  }

  function pintarEquiposCortos(s) {
    if (!s.cortos || !s.cortos.length) return null;
    return el("div", { id: "pi-equipos-cortos", class: "pi-revisar" },
      el("h4", { class: "pi-revisar-titulo", texto: tx("cortosTitulo", { m: G.JDE_MIN_EQUIPO }) }),
      el("p", { class: "text-sm mt-1", texto: tx("cortosTexto", { m: G.JDE_MIN_EQUIPO, n: s.cortos.length }) }),
      el("ul", { id: "pi-cortos-lista", class: "mt-1 space-y-1 text-sm list-disc pl-5" }, s.cortos.map((e) =>
        el("li", {}, el("span", { class: "font-semibold", texto: tx("cortosAviso") + " " }),
          tx(e.integrantes.length === 1 ? "cortosUno" : "cortosVarios", {
            i: e.institucion || "—", c: e.categoria, t: tx(e.torneo === "w" ? "grupoMujeres" : "grupoAbierto"),
            k: e.integrantes.length, n: e.integrantes.map((j) => j.nombre).join(", "),
          })))));
  }

  // Lo que se limpió de la lista antes de partirla: las inscripciones
  // repetidas (se dejó una) y quien está en dos modalidades o categorías
  // (art. 66.1.h: se avisa, decide el árbitro).
  function pintarRepetidos(s) {
    const { repetidos, dosModalidades } = s.limpia || { repetidos: [], dosModalidades: [] };
    if (!repetidos.length && !dosModalidades.length) return null;
    const caja = el("div", { id: "pi-repetidos", class: "pi-revisar" });
    caja.append(el("h4", { class: "pi-revisar-titulo", texto: tx("repetidosTitulo") }));
    if (repetidos.length) {
      const sobran = repetidos.reduce((a, r) => a + r.veces - 1, 0);
      caja.append(el("p", { class: "text-sm mt-1" },
        el("span", { class: "pi-sello pi-sello-listo mr-2", texto: "✓ " + tx("repetidosResuelto") }),
        tx("repetidosTexto", { p: repetidos.length, n: sobran })),
        el("details", { class: "mt-1" },
          el("summary", { class: "cursor-pointer text-sm rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", texto: tx("repetidosVer") }),
          el("ul", { id: "pi-repetidos-lista", class: "mt-1 space-y-1 text-sm list-disc pl-5" }, repetidos.map((r) =>
            el("li", { texto: tx("repetidosCaso", { n: r.jugador.nombre, i: r.jugador.institucion || "—", v: r.veces }) })))));
    }
    if (dosModalidades.length) {
      // Una pregunta por persona: en cuál de sus inscripciones queda, o
      // «todavía no decido» (queda en las dos), que es como viene. Cada una
      // en su tarjeta: el nombre arriba, el centro debajo y las opciones como
      // botones; la tarjeta dice con letra (no solo con color) si ya se decidió.
      const modo = (x) => tx(x.modalidad === "equipo" ? "grupoEquipos" : "grupoIndividual") + " " + x.categoria;
      const sinDecidir = dosModalidades.filter((d, k) => !s.dondeQueda.has(k)).length;
      caja.append(
        el("h5", { class: "font-semibold text-sm mt-3", texto: tx("dosModalidadesSub") }),
        el("p", { class: "text-sm mt-1" },
          el("span", { id: "pi-dm-faltan", class: "pi-sello mr-2 " + (sinDecidir ? "pi-sello-falta" : "pi-sello-listo"),
            texto: sinDecidir ? tx("dosModalidadesFaltan", { n: sinDecidir }) : "✓ " + tx("dosModalidadesListo") }),
          tx("dosModalidadesTexto")));
      const lista = el("div", { id: "pi-dos-modalidades", class: "mt-2 grid lg:grid-cols-2 gap-2" });
      dosModalidades.forEach((d, k) => {
        const nombre = "pi-dm-" + k;
        const elegida = s.dondeQueda.has(k) ? s.dondeQueda.get(k) : -1;
        const opcion = (valor, texto) => {
          const id = nombre + "-" + (valor < 0 ? "x" : valor);
          return el("label", { class: "pi-dm-opcion" },
            el("input", { type: "radio", name: nombre, id, value: String(valor), checked: valor === elegida, onchange: () => {
              if (valor < 0) s.dondeQueda.delete(k); else s.dondeQueda.set(k, valor);
              calcularSugerencia(); pintarSugerencia(); $(id).focus();
            } }),
            el("span", { texto }));
        };
        const estado = elegida < 0 ? tx("dosModalidadesPendiente") : tx("dosModalidadesQueda", { m: modo(d.inscripciones[elegida]) });
        lista.append(el("fieldset", { class: "pi-dm-tarjeta" + (elegida < 0 ? "" : " pi-dm-lista") },
          el("legend", { class: "sr-only", texto: tx("dosModalidadesCaso", { n: d.jugador.nombre, i: d.jugador.institucion || "—", m: d.inscripciones.map(modo).join(" y ") }) }),
          el("div", { "aria-hidden": "true" },
            el("p", { class: "font-semibold text-sm leading-snug", texto: d.jugador.nombre }),
            el("p", { class: "text-xs text-brand-600 dark:text-brand-300", texto: (d.jugador.institucion || "—") + " · " + d.inscripciones.map(modo).join(" y ") })),
          el("p", { class: "text-xs font-semibold mt-1 " + (elegida < 0 ? "pi-dm-pendiente" : ""), texto: (elegida < 0 ? "⏳ " : "✓ ") + estado }),
          el("div", { class: "flex flex-wrap gap-1.5 mt-2" },
            d.inscripciones.map((x, i) => opcion(i, tx("dosModalidadesDejar", { m: modo(x) }))),
            opcion(-1, tx("dosModalidadesNoDecido")))));
      });
      caja.append(lista);
    }
    return caja;
  }

  // Quien viene en las listas de dos Direcciones Regionales (al subir juntos
  // los clasificados de varias, en la Interregional): es un error de una de
  // ellas, y lo resuelve el árbitro con las dos. Queda una sola inscripción.
  function pintarVariosOrigenes(s) {
    const varios = (s.limpia && s.limpia.variosOrigenes) || [];
    if (!varios.length) return null;
    return el("div", { id: "pi-varios-origenes", class: "pi-revisar" },
      el("h4", { class: "pi-revisar-titulo", texto: tx("origenesTitulo") }),
      el("p", { class: "text-sm mt-1", texto: tx("origenesTexto", { n: varios.length }) }),
      el("ul", { id: "pi-origenes-lista", class: "mt-1 space-y-1 text-sm list-disc pl-5" }, varios.map((x) =>
        el("li", {}, el("span", { class: "font-semibold", texto: tx("cortosAviso") + " " }),
          tx("origenesCaso", { n: x.jugador.nombre, i: x.jugador.institucion || "—", o: x.origenes.join(" " + tx("y") + " ") })))));
  }

  // La inscripción contra los clasificados de la etapa anterior: quién se
  // inscribió sin haber clasificado (queda para revisar antes de la ronda 1)
  // y quién clasificó y no viene.
  function pintarComparacion(s) {
    const c = s.comparacion;
    if (!c) return null;
    const persona = (j) => j.nombre + " (" + (j.institucion || "—") + ")";
    const caja = el("div", { id: "pi-comparacion", class: "pi-revisar" },
      el("h4", { class: "pi-revisar-titulo", texto: tx("compTitulo") }));
    if (!c.noClasificaron.length && !c.faltan.length) { caja.append(el("p", { class: "text-sm mt-1", texto: tx("compIgual") })); return caja; }
    if (c.noClasificaron.length) caja.append(el("p", { class: "text-sm mt-1", texto: tx("compNoClasificaron", { n: c.noClasificaron.length }) }),
      el("ul", { id: "pi-comp-no", class: "mt-1 space-y-1 text-sm list-disc pl-5" }, c.noClasificaron.map((j) => el("li", {}, el("span", { class: "font-semibold", texto: tx("cortosAviso") + " " }), persona(j)))));
    if (c.faltan.length) caja.append(el("p", { class: "text-sm mt-2", texto: tx("compFaltan", { n: c.faltan.length }) }),
      el("ul", { id: "pi-comp-faltan", class: "mt-1 space-y-1 text-sm list-disc pl-5" }, c.faltan.map((j) => el("li", {}, el("span", { class: "font-semibold", texto: tx("cortosAviso") + " " }), persona(j)))));
    return caja;
  }

  // Elegir los cinco de cada equipo que se pasa: una casilla por integrante,
  // y con cinco marcados las demás no se pueden marcar.
  // Los mismos controles para los dos topes: los equipos de más de cinco y
  // los centros con más de dos en un torneo individual.
  function pintarEquiposDeMas(s) {
    return pintarTopes(s, s.equipos, { id: "pi-equipos-de-mas", casilla: "pi-eq-", titulo: "equiposTitulo", texto: "equiposTexto", resumen: "equiposResumen", maximo: G.JDE_MAX_EQUIPO });
  }
  function pintarIndividualesDeMas(s) {
    return pintarTopes(s, s.individuales, { id: "pi-individuales-de-mas", casilla: "pi-ind-", titulo: "individualesTitulo", texto: "individualesTexto", resumen: "individualesResumen", maximo: G.JDE_MAX_INDIVIDUAL });
  }
  function pintarTopes(s, cuales, o) {
    if (!cuales.length) return null;
    const caja = el("div", { id: o.id, class: "pi-revisar" });
    const fuera = cuales.reduce((a, e) => a + e.integrantes.length - s.elegidos.get(e.eleccion).size, 0);
    caja.append(
      el("h4", { class: "pi-revisar-titulo", texto: tx(o.titulo, { m: o.maximo }) }),
      el("p", { class: "text-sm mt-1", texto: tx(o.texto, { m: o.maximo, d: fuera }) }));
    cuales.forEach((e, k) => {
      const elegidos = s.elegidos.get(e.eleccion);
      const lleno = elegidos.size >= o.maximo;
      const detalles = el("details", { class: "mt-2", "data-equipo": e.clave, open: s.abiertos.has(e.clave) });
      detalles.addEventListener("toggle", () => { if (detalles.open) s.abiertos.add(e.clave); else s.abiertos.delete(e.clave); });
      detalles.append(el("summary", { class: "cursor-pointer text-sm font-semibold rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
        texto: tx(o.resumen, { i: e.institucion || "—", c: e.categoria, t: tx(e.torneo === "w" ? "grupoMujeres" : "grupoAbierto"), n: e.integrantes.length, e: elegidos.size, m: o.maximo }) }));
      const ul = el("ul", { class: "mt-1 space-y-1 text-sm pl-2" });
      e.integrantes.forEach((j, i) => {
        const id = o.casilla + k + "-" + i;
        const si = elegidos.has(j);
        ul.append(el("li", { class: "flex items-start gap-2" },
          el("input", { type: "checkbox", id, class: "mt-1", checked: si, disabled: !si && lleno, onchange: (ev) => {
            if (ev.target.checked) elegidos.add(j); else elegidos.delete(j);
            calcularSugerencia(); pintarSugerencia(); $(id).focus();
          } }),
          el("label", { for: id, texto: j.nombre + (si ? "" : " — " + tx("equiposDescartado")) })));
      });
      detalles.append(ul);
      caja.append(detalles);
    });
    return caja;
  }

  // Las mujeres de equipos que no alcanzan para un equipo propio (art.
  // 66.1.g) y pasan al abierto de su centro, con la casilla para no hacerlo.
  function pintarPaseAbierto(s) {
    const { pasadas, sinAbierto } = s.pase;
    if (!pasadas.length && !sinAbierto.length) return null;
    const caja = el("div", { id: "pi-pase-abierto", class: "pi-revisar" });
    caja.append(el("h4", { class: "pi-revisar-titulo", texto: tx("paseTitulo") }));
    const nombres = (c) => c.mujeres.map((j) => j.nombre).join(", ");
    if (pasadas.length) {
      caja.append(
        el("p", { class: "text-sm mt-1", texto: tx("paseTexto", { m: G.JDE_MIN_EQUIPO }) }),
        el("label", { class: "flex items-start gap-2 text-sm mt-2" },
          el("input", { type: "checkbox", id: "pi-pase-abierto-si", class: "mt-1", checked: s.pasarMujeres, onchange: (e) => {
            s.pasarMujeres = e.target.checked; calcularSugerencia(); pintarSugerencia(); $("pi-pase-abierto-si").focus();
          } }),
          el("span", { class: "font-semibold", texto: tx("paseCasilla", { n: pasadas.reduce((a, c) => a + c.mujeres.length, 0) }) })),
        el("ul", { id: "pi-pase-lista", class: "mt-2 space-y-1 text-sm list-disc pl-5" }, pasadas.map((c) =>
          el("li", { texto: tx(c.mujeres.length === 1 ? "paseUna" : "paseDos", { i: c.institucion || "—", c: c.categoria, n: nombres(c), a: c.abierto, t: c.abierto + c.mujeres.length }) }))));
    }
    if (sinAbierto.length) {
      caja.append(el("p", { class: C.nota + " mt-2", texto: tx("paseSinAbierto") }),
        el("ul", { id: "pi-pase-sin", class: "mt-1 space-y-1 text-sm list-disc pl-5" }, sinAbierto.map((c) =>
          el("li", { texto: tx("paseSinAbiertoCaso", { i: c.institucion || "—", c: c.categoria, n: nombres(c) }) }))));
    }
    return caja;
  }

  function etiquetaGrupo(g) {
    const partes = [];
    if (g.modalidad) partes.push(tx(g.modalidad === "equipo" ? "grupoEquipos" : "grupoIndividual"));
    else if (estado.sugerencia.dimensiones.includes("modalidad")) partes.push(tx("grupoSinModalidad"));
    if (g.categoria) partes.push(tx("grupoCategoria", { c: g.categoria }));
    else if (estado.sugerencia.dimensiones.includes("categoria")) partes.push(tx("grupoSinCategoria"));
    if (g.sexo) partes.push(tx(g.sexo === "w" ? "grupoMujeres" : "grupoAbierto"));
    else if (estado.sugerencia.dimensiones.includes("sexo")) partes.push(tx("grupoSinSexo"));
    return partes.join(" · ");
  }

  function pintarSugerencia() {
    const caja = $("pi-sugerencia");
    const s = estado.sugerencia;
    caja.replaceChildren();
    caja.hidden = !s;
    if (!s) return;
    const marcados = s.grupos.filter((g) => g.marcado).length;
    const nombresDim = { modalidad: tx("dimensionModalidad"), categoria: tx("dimensionCategoria"), sexo: tx("dimensionSexo") };
    const dims = s.dimensiones.map((d) => nombresDim[d]);
    const unidas = dims.length > 1 ? dims.slice(0, -1).join(", ") + " " + tx("y") + " " + dims[dims.length - 1] : dims[0];
    // Una sección por modalidad (Individual, Equipos) y en cada una una
    // tarjeta por grupo: la categoría y el sexo en grande, cuántos son a la
    // derecha y, abajo, el sistema sugerido. La modalidad no se repite en
    // cada tarjeta (va en el título de la sección), pero sigue en el texto
    // para el lector de pantalla (sr-only).
    const porModalidad = s.dimensiones.includes("modalidad");
    const secciones = new Map();
    s.grupos.forEach((g, i) => {
      const k = porModalidad ? (g.modalidad || "") : "";
      if (!secciones.has(k)) secciones.set(k, []);
      secciones.get(k).push([g, i]);
    });
    const tarjeta = (g, i) => {
      // En equipos se empareja por equipos: el sistema sale de cuántos hay.
      const nEquipos = g.modalidad === "equipo" ? equiposDelGrupo(g) : 0;
      const n = g.jugadores.length;
      const sistema = G.sistemaSugerido(nEquipos || n);
      const id = "pi-sugerencia-g" + i;
      const etiqueta = etiquetaGrupo(g);
      const sinModalidad = porModalidad ? etiqueta.split(" · ").slice(1).join(" · ") : etiqueta;
      const prefijo = porModalidad ? etiqueta.split(" · ")[0] + " · " : "";
      return el("li", { class: "pi-sug-tarjeta" + (g.marcado ? " pi-sug-si" : "") + (sistema ? "" : " pi-sug-no") },
        el("input", { type: "checkbox", id, class: "mt-1 shrink-0", checked: g.marcado, onchange: (e) => { g.marcado = e.target.checked; pintarSugerencia(); $(id).focus(); } }),
        el("label", { for: id, class: "flex-1 min-w-0" },
          el("span", { class: "flex flex-wrap items-baseline justify-between gap-x-3" },
            el("span", { class: "font-semibold text-base" }, prefijo ? el("span", { class: "sr-only", texto: prefijo }) : null, sinModalidad),
            el("span", { class: "sr-only", texto: " — " }),
            el("span", { class: "pi-sug-cuantos", texto: tx(n === 1 ? "grupoUnJugador" : "grupoJugadores", { n }) + (nEquipos ? " " + tx(nEquipos === 1 ? "grupoUnEquipo" : "grupoEnEquipos", { e: nEquipos }) : "") })),
          el("span", { class: "block text-sm mt-0.5 " + (sistema ? "text-brand-600 dark:text-brand-300" : "font-semibold") },
            el("span", { class: "sr-only", texto: " · " }),
            sistema ? tx(sistema === "todos" ? "sugeridoTodos" : "sugeridoSuizo", { r: G.JDE_RONDAS_SUIZO }) : tx("grupoNoAlcanza"))));
    };
    const listas = [...secciones].map(([k, xs]) => {
      const jugadores = xs.reduce((a, [g]) => a + g.jugadores.length, 0);
      return el("section", { class: "mt-4" },
        k || porModalidad ? el("h4", { class: "font-semibold flex flex-wrap items-baseline gap-x-2" },
          tx(k === "equipo" ? "grupoEquipos" : k ? "grupoIndividual" : "grupoSinModalidad"),
          el("span", { class: C.nota, texto: tx("sugSeccionCuenta", { t: xs.length, n: jugadores }) })) : null,
        el("ul", { class: "mt-2 grid sm:grid-cols-2 xl:grid-cols-3 gap-2 text-sm" }, xs.map(([g, i]) => tarjeta(g, i))));
    });
    const lista = el("div", {}, listas);
    const noAlcanzan = s.grupos.filter((g) => !G.sistemaSugerido(g.modalidad === "equipo" ? equiposDelGrupo(g) : g.jugadores.length)).length;
    const hayEquipos = s.grupos.some((g) => g.modalidad === "equipo");
    const porSexo = s.dimensiones.includes("sexo");
    // Lo que hay que revisar, abajo: un índice arriba para ir directo a
    // cada parte (con una inscripción grande la propuesta es larga).
    const partes = [pintarRepetidos(s), pintarVariosOrigenes(s), pintarComparacion(s), pintarPaseAbierto(s), pintarEquiposDeMas(s),
      pintarIndividualesDeMas(s), pintarHombresEnMujeres(s), pintarEquiposCortos(s), pintarRevisionCategorias(s.revision)].filter(Boolean);
    const indice = partes.length ? el("nav", { id: "pi-sugerencia-indice", class: "mt-3 text-sm rounded-lg bg-accent-50 dark:bg-brand-800 border border-accent-300 dark:border-brand-700 p-2", "aria-label": tx("sugerenciaIndice") },
      el("span", { class: "font-semibold mr-1", texto: tx("sugerenciaIndice") + ":" }),
      partes.map((x) => {
        const h = x.querySelector("h4");
        x.tabIndex = -1;
        return el("button", { type: "button", class: C.mini + " mr-1 mb-1", "data-ir": x.id, onclick: () => { x.scrollIntoView({ block: "start" }); x.focus({ preventScroll: true }); } }, h ? h.textContent : x.id);
      })) : null;
    // El resumen en números, arriba, antes de la explicación.
    const cifra = (n, texto) => el("span", { class: "pi-sug-cifra" }, el("strong", { texto: String(n) }), " " + texto);
    caja.append(...[
      el("h3", { id: "pi-sugerencia-titulo", class: "font-serif text-lg font-bold", texto: tx("sugerenciaTitulo", { n: s.grupos.length }) }),
      el("p", { class: "text-sm mt-1", texto: tx("sugerenciaTexto", { total: s.juegan.length, d: unidas }) }),
      el("div", { id: "pi-sug-resumen", class: "flex flex-wrap gap-2 mt-2" },
        cifra(s.juegan.length, tx("sugCifraJugadores")), cifra(marcados, tx("sugCifraCrear")),
        noAlcanzan ? cifra(noAlcanzan, tx("sugCifraNoAlcanzan")) : null),
      indice,
      s.siguiente ? el("p", { id: "pi-sugerencia-siguiente", class: "text-sm mt-2 font-semibold", texto: tx("sugerenciaSiguiente", { d: tx(TEXTO_ETAPA[s.siguiente.desde]), e: tx(TEXTO_ETAPA[s.siguiente.etapa]) }) }) : null,
      el("fieldset", {}, el("legend", { class: "sr-only", texto: tx("sugerenciaLeyenda") }), lista),
      ...partes,
      // Cómo se arman: se lee una vez, así que va plegado.
      el("details", { id: "pi-sugerencia-como", class: "mt-4" },
        el("summary", { class: "cursor-pointer text-sm font-semibold rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", texto: tx("sugerenciaComo") }),
        porSexo ? el("p", { class: C.nota + " mt-2", texto: tx("sugerenciaAbierto") }) : null,
        hayEquipos ? el("p", { class: C.nota + " mt-2", texto: tx("sugerenciaEquipos") }) : null,
        el("p", { class: C.nota + " mt-2", texto: tx("sugerenciaNormativa", { r: G.JDE_RONDAS_SUIZO, ritmo: G.JDE_RITMO_MINIMO }) }),
        el("p", { class: C.nota + " mt-2", texto: s.configJde ? tx("sugerenciaNombreJde") : tx("sugerenciaNombre", { b: t().nombre.trim() || s.base }) })),
      el("label", { class: "flex items-start gap-2 text-sm mt-3" },
        el("input", { type: "checkbox", id: "pi-config-jde", class: "mt-1", checked: s.configJde, onchange: (e) => { s.configJde = e.target.checked; pintarSugerencia(); $("pi-config-jde").focus(); } }),
        el("span", {}, el("span", { class: "font-semibold", texto: tx("configJdeCasilla") }), " " + tx("configJdeAyuda", { r: G.JDE_RONDAS_SUIZO, ritmo: G.JDE_RITMO_MINIMO }))),
      sinRivales(s).length >= 2 ? el("label", { class: "flex items-start gap-2 text-sm mt-3" },
        el("input", { type: "checkbox", id: "pi-amistoso", class: "mt-1", checked: s.amistoso, onchange: (e) => { s.amistoso = e.target.checked; pintarSugerencia(); $("pi-amistoso").focus(); } }),
        el("span", {}, el("span", { class: "font-semibold", texto: tx("amistosoCasilla", { n: sinRivales(s).length }) }), " " + tx("amistosoAyuda"))) : null,
      el("div", { class: "flex flex-wrap gap-2 mt-3" },
        el("button", { type: "button", id: "pi-sugerencia-crear", class: C.boton, disabled: marcados === 0, onclick: crearTorneosDeGrupos, texto: tx("sugerenciaCrear", { n: marcados }) }),
        el("button", { type: "button", id: "pi-sugerencia-todos", class: C.botonSec, onclick: () => { const l = s.juegan; estado.sugerencia = null; pintarSugerencia(); agregarTodos(l); }, texto: tx("sugerenciaTodosAqui", { n: s.juegan.length }) }),
        el("button", { type: "button", id: "pi-sugerencia-descartar", class: C.botonSec, onclick: () => { estado.sugerencia = null; pintarSugerencia(); Avisos.avisar(tx("sugerenciaDescartada"), { tipo: "info" }); }, texto: tx("sugerenciaDescartar") }))].flat().filter(Boolean));
  }

  // Lo que dice la revisión de categoría por año (art. 17 y 18): cada caso
  // escrito entero, con «Permitido» o «No permitido» al frente (el color de
  // la lista nunca va solo).
  function pintarRevisionCategorias(r) {
    if (!r || (!r.revisados && !r.sinFecha.length)) return null;
    const caja = el("div", { id: "pi-revision-categorias", class: "pi-revisar" });
    const enSuCategoria = r.revisados - r.permitidos.length - r.noPermitidos.length;
    caja.append(
      el("h4", { class: "pi-revisar-titulo", texto: tx("catTitulo") }),
      el("p", { class: "text-sm mt-1", texto: tx("catResumen", { n: r.revisados, ok: enSuCategoria, p: r.permitidos.length, x: r.noPermitidos.length }) }));
    if (r.anio !== r.normativa) caja.append(el("p", { class: C.nota + " mt-1", texto: tx("catOtroAnio", { a: r.anio, b: r.normativa }) }));
    // Cada caso, con «Permitido» o «No permitido» al frente y el nombre en
    // negrita; agrupados por motivo, cada grupo plegable con cuántos son
    // (con muchos, la lista no tapa todo lo demás).
    const CLAVE = { mayor: "catMayor", individual: "catIndividual", salto: "catSalto", tope: "catTope", "": "catPermitido" };
    const GRUPO_CAT = { mayor: "catGrupoMayor", individual: "catGrupoIndividual", salto: "catGrupoSalto", tope: "catGrupoTope", permitido: "catGrupoPermitido" };
    const caso = (c) => {
      const j = c.jugador;
      const v = { n: j.nombre, i: j.institucion || "—", a: c.nace, p: c.propia, c: c.categoria, d: c.desde, k: c.cuantos, m: G.JDE_MAX_ASCENSOS };
      const texto = tx(CLAVE[c.motivo || ""], v);
      const resto = texto.startsWith(j.nombre) ? texto.slice(j.nombre.length) : " " + texto;
      return el("li", {}, el("span", { class: "pi-cat-sello", texto: tx(c.motivo ? "catNoPermitido" : "catSiPermitido") + " " }),
        el("strong", { texto: texto.startsWith(j.nombre) ? j.nombre : "" }), resto);
    };
    const porMotivo = (lista, id) => {
      const grupos = new Map();
      for (const c of lista) { const k = c.motivo || ""; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(c); }
      return el("div", { id, class: "mt-2 space-y-2" }, [...grupos].map(([k, cs]) => el("details", { class: "rounded-lg border border-brand-100 dark:border-brand-800 px-3 py-2", open: cs.length <= 5 },
        el("summary", { class: "cursor-pointer text-sm font-semibold rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" },
          tx(k ? "catNoPermitido" : "catSiPermitido") + " " + tx(GRUPO_CAT[k || "permitido"]), el("span", { class: "pi-sug-cifra ml-2", texto: String(cs.length) })),
        el("ul", { class: "mt-2 space-y-1 text-sm list-disc pl-5" }, cs.map(caso)))));
    };
    if (r.noPermitidos.length) caja.append(porMotivo(r.noPermitidos, "pi-cat-no"));
    if (r.permitidos.length) caja.append(porMotivo(r.permitidos, "pi-cat-si"));
    if (r.sinFecha.length) caja.append(el("p", { class: C.nota + " mt-2", texto: tx("catSinFecha", { n: r.sinFecha.length }) }));
    return caja;
  }

  // Un torneo por cada grupo marcado, con los datos del que está abierto
  // (ciudad, fechas, árbitros, ritmo, puntos, desempates) y el sistema
  // sugerido por la normativa de los JDE: el suizo con al menos 5 rondas y,
  // si el abierto no tiene ritmo, el mínimo que pide. Si el abierto está vacío —sin jugadores ni rondas— se usa para
  // el primer grupo, en vez de dejar un torneo «(sin nombre)» de más.
  // Los que se quedan sin torneo por falta de rivales (un grupo de uno, o
  // un solo equipo en su categoría): juegan juntos un torneo individual,
  // «Categoría Amistoso», para no irse a la casa sin jugar. No clasifica ni
  // suma medallas al medallero (V.clasificados, V.medallero).
  const sinRivales = (s) => s.grupos.filter((g) => !g.marcado && !G.sistemaSugerido(participantesDelGrupo(g))).flatMap((g) => g.jugadores);

  async function crearTorneosDeGrupos() {
    const s = estado.sugerencia;
    const elegidos = s.grupos.filter((g) => g.marcado);
    const amistosos = s.amistoso ? sinRivales(s) : [];
    if (amistosos.length >= 2) elegidos.push({ modalidad: "individual", jugadores: amistosos, amistoso: true });
    if (!elegidos.length) return;
    const actual = t();
    // Con la configuración de los JDE, primero la etapa y el lugar: el
    // nombre de cada torneo sale de ahí.
    let jde = null;
    if (s.configJde) {
      jde = await pedirEtapaJde(s.siguiente ? { etapa: s.siguiente.etapa } : actual.jde, s.region);
      if (!jde || estado.sugerencia !== s || t() !== actual) return;
      // En la Interregional, una Dirección Regional que no es de esa
      // interregional casi siempre es un archivo equivocado: se pregunta.
      const inter = jde.etapa === "interregional" && G.JDE_INTERREGIONALES.find((x) => x.numero === jde.lugar);
      const ajenas = inter ? [...new Set(s.region.map((r) => G.direccionDe(r)).filter((d) => d && !inter.regiones.includes(d)))] : [];
      if (ajenas.length) {
        const ok = await Avisos.confirmar(tx("interregionalAjena", { d: ajenas.join(", "), i: G.nombreInterregional(inter) }), { aceptar: tx("interregionalAjenaSi") });
        if (!ok || estado.sugerencia !== s || t() !== actual) return;
      }
    }
    const base = actual.nombre.trim() || s.base;
    // El evento: lo que tienen en común los torneos que se crean ahora, con
    // las decisiones del árbitro en la sugerencia (para el acta del
    // congresillo, js/pareo/evento.js). Cada torneo guarda su copia.
    const evento = { id: "e" + nuevoId(), nombre: jde ? G.nombreEventoJde(jde) : base, jde: jde || undefined,
      creado: window.HoraCR ? HoraCR.hoy() : "", decisiones: Pagina.decisionesDe(s) };
    if (!jde) delete evento.jde;
    // Con la configuración de los JDE (la casilla, marcada de entrada), cada
    // torneo lleva la suya según cuántos juegan; sin ella, copia las rondas,
    // el ritmo, los puntos y los desempates del abierto tal cual.
    const comunes = {
      ciudad: actual.ciudad, provincia: actual.provincia, federacion: actual.federacion, fechaInicio: actual.fechaInicio, fechaFin: actual.fechaFin,
      arbitro: actual.arbitro, arbitroAdjunto: actual.arbitroAdjunto, ritmo: actual.ritmo, validoElo: actual.validoElo,
      colorInicial: actual.colorInicial, baku: actual.baku, rondasTotales: actual.rondasTotales,
      puntos: Object.assign({}, actual.puntos), desempates: actual.desempates.slice(),
    };
    const reusar = !actual.jugadores.length && !actual.rondas.length;
    apagarEnVivo();
    const ids = [];
    elegidos.forEach((g, i) => {
      const jugadores = g.jugadores.map((j) => Object.assign({ id: idJugador(), retiradoDespuesDe: null }, soloJugador(j)));
      // Un grupo de equipos es un torneo por equipos: un participante por
      // centro educativo, con sus integrantes en el orden de la inscripción
      // (que es el orden de tableros hasta que el árbitro lo cambie).
      const deEquipos = g.modalidad === "equipo";
      const participantes = deEquipos ? E.armarEquipos(jugadores, idJugador) : jugadores;
      const n = participantes.length;
      const grupo = g.amistoso ? tx("amistosoGrupo") : etiquetaGrupo(g);
      const datos = Object.assign({}, comunes, {
        nombre: jde ? nombreConGrupo(jde, grupo) : (base ? base + " — " : "") + grupo,
        grupo, jde: jde || undefined, evento, ordenEnEvento: i,
        sistema: G.sistemaSugerido(n) || "suizo",
      }, deEquipos ? { puntos: Object.assign({}, E.PUNTOS_EQUIPOS), desempates: E.desempatesPara(G.sistemaSugerido(n) || "suizo") } : {},
      s.configJde ? configuracionPara(n, actual, deEquipos, jde.etapa) : {}, {
        tipo: deEquipos ? "equipos" : undefined, tableros: deEquipos ? E.TABLEROS : undefined,
        jugadores: participantes,
        rondas: [], numeracion: null,
      });
      if (!deEquipos) { delete datos.tipo; delete datos.tableros; }
      if (g.amistoso) datos.amistoso = true;
      if (!jde) delete datos.jde;
      if (i === 0 && reusar) estado.t = T.nuevo(Object.assign({}, actual, datos));
      else { estado.id = nuevoId(); estado.t = T.nuevo(datos); }
      guardar();
      ids.push(estado.id);
    });
    // Se guardaron en el mismo milisegundo: «Mis torneos» (el más reciente
    // arriba) los mostraría en cualquier orden. Quedan en el de la sugerencia.
    const ahora = Date.now();
    ids.forEach((id, i) => { const x = estado.lista.find((y) => y.id === id); if (x) x.actualizado = ahora - i; });
    escribir(CLAVE_LISTA, JSON.stringify(estado.lista));
    abrir(ids[0]);
    estado.ficha = "jugadores";
    escribir(CLAVE_FICHA, "jugadores");
    pintarTodo();
    Avisos.avisar(tx("torneosCreados", { n: ids.length }));
  }

  Object.assign(Pagina, { sugerirGrupos, pintarSugerencia });
})();

/*! rev bfb5bbb0d2d82f9f */
