/* ===== Pareo Integral — la página (pareo.html): agregar jugadores de una lista =====
 *
 * Subir un Word o un Excel, recoger la inscripción de los JDE, buscar en el Elo Nacional y agregar
 * desde una lista de Elo.
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
  const { G, V, C, leer, $, el, tx, estado, guardar, t, irA, pintarJugadores, datosJugador, agregarJugadores } = Pagina;

  // ---------- Subir una lista (Word o Excel) ----------
  // Las mismas claves que ya entiende "Pegar una lista", en el mismo orden,
  // para cuando el archivo no trae una cabecera reconocible.
  const ORDEN_LISTA = ["nombre", "institucion", "elo", "titulo", "fed", "fideId", "categoria"];
  // De cada etiqueta posible (sin tildes, en minúscula) a su campo. Una sola
  // tabla, no una de arrays: dos claves "palabra" seguidas entre corchetes
  // son justo el patrón con el que verificar-pareo-pagina.js reconoce una
  // lista de opciones traducible, y esta no lo es.
  const SINONIMOS_COLUMNA = {
    nombre: "nombre", name: "nombre", jugador: "nombre", player: "nombre",
    "nombre completo": "nombre",
    institucion: "institucion", colegio: "institucion", escuela: "institucion",
    "centro educativo": "institucion", "nombre de centro educativo": "institucion",
    "nombre del centro educativo": "institucion",
    club: "institucion", institution: "institucion", school: "institucion",
    elo: "elo", rating: "elo",
    titulo: "titulo", title: "titulo",
    fed: "fed", federacion: "fed", pais: "fed", country: "fed", federation: "fed",
    fideid: "fideId", "fide id": "fideId", "id fide": "fideId",
    "codigo fide": "fideId", "fide code": "fideId",
    categoria: "categoria", category: "categoria", nivel: "categoria", division: "categoria",
    // Lo que trae la inscripción de los JDE (y cualquier lista parecida):
    // con estas tres se sugiere partirla en torneos (js/pareo/grupos.js).
    sexo: "sexo", genero: "sexo", sex: "sexo", gender: "sexo",
    // El torneo, cuando el archivo lo dice aparte del sexo (Mujeres o
    // Abierto): en el abierto juegan también mujeres.
    torneo: "torneo", rama: "torneo", "torneo (mujeres/abierto)": "torneo", seccion: "torneo", section: "torneo",
    fdn: "nacimiento", nacimiento: "nacimiento", "fecha de nacimiento": "nacimiento",
    "date of birth": "nacimiento", "birth date": "nacimiento", birthday: "nacimiento",
    "equipo/ind": "modalidad", "equipo / ind": "modalidad", "equipo/individual": "modalidad",
    "equipo o individual": "modalidad", modalidad: "modalidad", "team/individual": "modalidad",
    "direccion regional": "region", regional: "region",
    // La etapa de la que viene una lista de clasificados (la escribe
    // js/pareo/evento.js): con ella se ofrece armar la etapa que sigue.
    etapa: "etapa", stage: "etapa",
    // El puesto también lo trae solo una lista de clasificados (también las
    // que se bajaron antes de que existiera la columna «Etapa»).
    puesto: "puesto",
    // Solo para reconocer a la misma persona inscrita dos veces: no se
    // guarda en el torneo (soloJugador).
    "documento de identidad": "documento", documento: "documento", cedula: "documento",
    identificacion: "documento",
  };
  const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

  // Una fila es cabecera si reconoce al menos la columna "nombre" (con
  // cualquiera de sus etiquetas); si no, se lee en ORDEN_LISTA y la primera
  // fila es ya un jugador. Nunca se adivina a medias: o se reconoce el
  // nombre, o se cae al orden fijo entero.
  function columnasDeLista(primeraFila) {
    const mapa = {};
    (primeraFila || []).forEach((celda, i) => {
      const campo = SINONIMOS_COLUMNA[sinTildes(celda)];
      if (campo && mapa[campo] == null) mapa[campo] = i;
    });
    return mapa.nombre != null ? mapa : null;
  }

  // La cabecera se busca en las primeras filas, no solo en la primera: el
  // Excel de los JDE trae arriba el título del reporte y la fecha en que se
  // exportó, y sin esto esas dos filas entraban como jugadores.
  const FILAS_ANTES_DE_CABECERA = 10;

  // Cada jugador, con la modalidad y la regional aparte: sirven para sugerir
  // cómo partir la lista, pero no son datos del jugador en el torneo.
  function filasAJugadores(filas) {
    if (!filas || !filas.length) return [];
    let fila0 = -1, conCabecera = null;
    for (let i = 0; i < Math.min(filas.length, FILAS_ANTES_DE_CABECERA) && !conCabecera; i++) {
      conCabecera = columnasDeLista(filas[i]);
      if (conCabecera) fila0 = i;
    }
    const mapa = conCabecera || Object.fromEntries(ORDEN_LISTA.map((campo, i) => [campo, i]));
    const datos = conCabecera ? filas.slice(fila0 + 1) : filas;
    const celda = (fila, campo) => (mapa[campo] != null ? fila[mapa[campo]] : "");
    const ordenFecha = G.ordenFechas(datos.map((fila) => celda(fila, "nacimiento")));
    return datos.map((fila) => Object.assign(datosJugador({
      nombre: mapa.nombre != null ? fila[mapa.nombre] : "",
      institucion: mapa.institucion != null ? fila[mapa.institucion] : "",
      elo: mapa.elo != null ? fila[mapa.elo] : "",
      titulo: mapa.titulo != null ? fila[mapa.titulo] : "",
      fed: mapa.fed != null ? fila[mapa.fed] : "",
      fideId: mapa.fideId != null ? fila[mapa.fideId] : "",
      categoria: mapa.categoria != null ? fila[mapa.categoria] : "",
      sexo: G.leerSexo(celda(fila, "sexo")),
      nacimiento: G.leerFecha(celda(fila, "nacimiento"), ordenFecha),
    }), {
      modalidad: G.leerModalidad(celda(fila, "modalidad")),
      region: String(celda(fila, "region") || "").trim(),
      documento: String(celda(fila, "documento") || "").trim(),
      torneo: G.leerTorneo(celda(fila, "torneo")),
      etapaOrigen: G.leerEtapa(celda(fila, "etapa")),
      deClasificados: mapa.puesto != null || mapa.etapa != null,
    })).filter((d) => d.nombre);
  }

  // Lo que se guarda del jugador: sin la modalidad ni la regional.
  // La Dirección Regional sí se guarda: la usa la lista de clasificados
  // para la etapa siguiente (js/pareo/evento.js).
  const soloJugador = ({ modalidad, alAbierto, documento, torneo, origen, etapaOrigen, deClasificados, ...d }) => (d.region ? d : (delete d.region, d));

  // Uno o varios archivos: en la Etapa Interregional llegan los
  // clasificados de cada Dirección Regional por separado (la lista que baja
  // «Clasificados», en la ficha Archivos), y se suben juntos.
  async function subirLista(archivos) {
    const estadoEl = $("pi-subir-lista-estado");
    const todos = Array.from(archivos.length != null ? archivos : [archivos]);
    if (todos.some((a) => a.size > 5 * 1024 * 1024)) { Avisos.avisar(tx("archivoGrande"), { tipo: "error" }); return; }
    estadoEl.textContent = tx("leyendoArchivo");
    try {
      const leida = [];
      for (const archivo of todos) {
        const nombreArch = (archivo.name || "").toLowerCase();
        let filas;
        if (archivo.filas) filas = archivo.filas; // la lista que pasa la inscripción de los JDE: ya son filas
        else if (nombreArch.endsWith(".docx")) filas = await window.ReporteTextos.filasDeDocx(archivo);
        else if (nombreArch.endsWith(".doc")) { estadoEl.textContent = ""; Avisos.avisar(tx("archivoDocAntiguo"), { tipo: "error" }); return; }
        else filas = (await window.ReporteExcel.leer(archivo)).filas;
        // El archivo de cada uno: si una persona viene en dos listas, se avisa.
        leida.push(...filasAJugadores(filas).map((j) => Object.assign(j, { origen: archivo.name || "" })));
      }
      const archivo = todos[0];
      estadoEl.textContent = "";
      if (!leida.length) { Avisos.avisar(tx("archivoSinJugadores"), { tipo: "error" }); return; }
      // La inscripción de una etapa subida junto con los clasificados de la
      // anterior (los que traen «Etapa»): se comparan, y juega la inscripción.
      const conEtapa = leida.filter((j) => j.deClasificados), sinEtapa = leida.filter((j) => !j.deClasificados);
      const comparar = conEtapa.length > 0 && sinEtapa.length > 0;
      const extra = { siguiente: V.siguienteDe((comparar ? conEtapa : leida).map((j) => j.etapaOrigen)), comparacion: comparar ? V.compararEtapa(sinEtapa, conEtapa) : null };
      const limpia = G.quitarRepetidos(comparar ? sinEtapa : leida);
      const lista = limpia.lista;
      G.pasarMujeresAlAbierto(lista, true);
      if (G.agrupar(lista).grupos.length > 1) { Pagina.sugerirGrupos(lista, archivo.name, limpia, extra); return; }
      const sobran = limpia.repetidos.reduce((a, r) => a + r.veces - 1, 0);
      if (sobran) Avisos.avisar(tx("repetidasQuitadas", { n: sobran }), { tipo: "info" });
      agregarTodos(lista);
    } catch (err) {
      estadoEl.textContent = "";
      Avisos.avisar(tx("noAbre", { e: err.message }), { tipo: "error" });
    }
  }

  // «Abrir en Pareo Integral», de la inscripción de los JDE (inscripcion-jde.html): las filas
  // de su Excel llegan por el almacenamiento del navegador, sin servidor. Se leen una vez, se
  // borran y valen diez minutos; entran por el mismo camino que «Subir una lista».
  function recogerDeInscripcion() {
    let carga = null;
    try { carga = JSON.parse(localStorage.getItem("ij_para_pareo_v1")); localStorage.removeItem("ij_para_pareo_v1"); } catch (e) { /* sin almacenamiento */ }
    history.replaceState(null, "", location.pathname + location.search);
    if (!carga || !Array.isArray(carga.filas) || Date.now() - Number(carga.hora) > 10 * 60 * 1000) { Avisos.avisar(tx("desdeInscripcionVacia"), { tipo: "error" }); return; }
    if (estado.ficha !== "torneo") irA("torneo");
    subirLista([{ name: String(carga.nombre || "inscripcion-jde.xlsx"), filas: carga.filas }]);
  }

  function agregarTodos(lista) {
    const n = agregarJugadores(lista.map(soloJugador));
    // Subida desde la ficha Torneo: se ve la lista que quedó.
    if (n && estado.ficha !== "jugadores") irA("jugadores");
    if (n) Avisos.avisar(tx("agregados", { n }));
    else Avisos.avisar(tx("nadaQueAgregar"), { tipo: "error" });
  }

  // El mismo bolsillo de palabras que usa la Edge Function, para emparejar
  // su respuesta (que viene por nombre, no por id) con el jugador de acá.
  function bolsilloNombre(nombre) {
    const limpio = String(nombre || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toUpperCase().replace(/[^A-Z ,]/g, " ").replace(/,/g, " ");
    return limpio.split(/\s+/).filter(Boolean).sort().join(" ");
  }

  const TOPE_BUSQUEDA_ELO = 40;   // el mismo tope que exige la Edge Function

  async function buscarEloNacional() {
    const v = t();
    const todosFaltantes = v.jugadores.filter((j) => !(Number(j.elo) > 0));
    if (!todosFaltantes.length) { Avisos.avisar(tx("sinQuienBuscar")); return; }
    const faltantes = todosFaltantes.slice(0, TOPE_BUSQUEDA_ELO);
    const boton = $("pi-elo-nacional");
    const estadoEl = $("pi-elo-nacional-estado");
    const barraEl = $("pi-elo-barra-caja");
    boton.disabled = true;
    estadoEl.textContent = tx("buscandoElo", { n: faltantes.length });
    // Es UNA sola llamada que solo contesta al terminar (ver elo-nacional.js):
    // no hay un «n de total» real que mostrar sin partirla en varios pedidos,
    // y eso gastaría varias veces el tope por hora del freno por la misma
    // búsqueda. La barra es indeterminada a propósito: nunca un número inventado.
    barraEl.hidden = false;
    const r = await window.PareoEloNacional.buscar(faltantes.map((j) => j.nombre));
    barraEl.hidden = true;
    boton.disabled = false;
    estadoEl.textContent = "";
    if (!r || r.ok === false) { Avisos.avisar((r && r.error) || tx("eloNacionalError"), { tipo: "error" }); return; }
    // Por índice, no por nombre: dos jugadores con el mismo nombre piden la
    // misma búsqueda pero son personas distintas, y el bolsillo de palabras
    // los mezclaría. La función contesta en el mismo orden en que se le manda.
    const resultados = r.resultados || [];
    let n = 0, conId = 0;
    const pendientes = [];
    faltantes.forEach((j, i) => {
      const res = resultados[i];
      if (res && res.estado === "encontrado" && Number(res.nacional) > 0) {
        j.elo = res.nacional; n++;
        // La lista nacional identifica a cada jugador por su ID FIDE: si no
        // lo tenía, queda puesto (el TRF lo necesita para el Elo).
        if (!j.fideId && res.fideId && /^\d{3,11}$/.test(String(res.fideId))) { j.fideId = String(res.fideId); conId++; }
      }
      else pendientes.push({ id: j.id, nombre: j.nombre, estado: (res && res.estado) || "no_encontrado",
        candidatos: (res && Array.isArray(res.candidatos)) ? res.candidatos.slice(0, 5) : [], totalCandidatos: (res && Number(res.totalCandidatos)) || 0 });
    });
    if (n) guardar();
    estado.eloPendientes = pendientes;
    pintarJugadores();
    Avisos.avisar(tx("eloNacionalResultado", { n: n, total: faltantes.length }) + (conId ? " " + tx("eloNacionalConId", { n: conId }) : ""));
    if (todosFaltantes.length > TOPE_BUSQUEDA_ELO) {
      Avisos.avisar(tx("eloNacionalTope", { tope: TOPE_BUSQUEDA_ELO }), { tipo: "info" });
    }
  }

  // ---------- Agregar desde una lista de Elo ----------
  // FIDE (Estándar, Rápido, Blitz) o la nacional de Costa Rica, por la Edge
  // Function pareo-listas-elo (elo-nacional.js). Las tres de FIDE salen de la
  // misma búsqueda: cada fila trae los tres Elo y la lista elegida decide
  // cuál entra. Ver «Pareo Integral: agregar jugadores desde las listas de
  // Elo» en docs/decisiones/juegos-y-torneos.md.
  const CLAVE_LISTA_ELO = "pareo_lista_elo_v1";
  const LISTAS_ELO = { estandar: "listaEstandar", rapido: "listaRapido", blitz: "listaBlitz", nacional: "listaNacional" };
  const fuenteDeLista = (lista) => (lista === "nacional" && lista) || "fide";
  const eloDeLista = (f, lista) => (Number(f[lista]) > 0 ? Math.round(Number(f[lista])) : 0);

  function listaEloInicial() {
    const g = leer(CLAVE_LISTA_ELO);
    if (LISTAS_ELO[g]) return g;
    return (t() && t().validoElo === "nacional" && "nacional") || "estandar";
  }

  async function buscarEnListaElo() {
    const lista = $("pi-listas-lista").value;
    const caja = $("pi-listas-q");
    const q = caja.value.replace(/\s+/g, " ").trim();
    const estadoEl = $("pi-listas-estado");
    if (q.length < 3) { estadoEl.textContent = tx("listasCorto"); caja.focus(); return; }
    const boton = $("pi-listas-buscar");
    boton.disabled = true;
    estadoEl.textContent = tx("listasBuscando");
    const r = await window.PareoEloNacional.buscarEnLista(fuenteDeLista(lista), q);
    boton.disabled = false;
    if (!r || r.ok === false) {
      estadoEl.textContent = "";
      Avisos.avisar((r && r.error) || tx("listasError"), { tipo: "error" });
      return;
    }
    const filas = (Array.isArray(r.filas) ? r.filas : []).filter((f) => f && f.nombre && /^\d{3,11}$/.test(String(f.fideId)));
    estado.listaElo = { fuente: fuenteDeLista(lista), q, filas, total: Number(r.total) || filas.length, hayMas: !!r.hayMas, periodo: r.periodo || null };
    pintarListaElo();
  }

  function pintarListaElo() {
    const tabla = $("pi-listas-resultados");
    const estadoEl = $("pi-listas-estado");
    const b = estado.listaElo;
    const lista = $("pi-listas-lista").value;
    // Lo buscado en FIDE sirve para las tres listas de FIDE; si se cambia a
    // la nacional (o al revés), hay que volver a buscar.
    if (!b || b.fuente !== fuenteDeLista(lista)) {
      tabla.hidden = true;
      tabla.replaceChildren();
      if (b) { estado.listaElo = null; estadoEl.textContent = ""; }
      return;
    }
    const textos = [b.filas.length
      ? (b.hayMas ? tx("listasHayMas", { n: b.filas.length, total: b.total }) : tx("listasEncontrados", { n: b.filas.length }))
      : tx("listasNadie", { q: b.q })];
    if (b.periodo) textos.push(tx("listasPeriodo", { p: b.periodo }));
    const texto = textos.join(" ");
    // El mismo texto no se vuelve a escribir: aria-live lo leería otra vez
    // cada vez que se pinta la ficha.
    if (estadoEl.textContent !== texto) estadoEl.textContent = texto;
    tabla.hidden = !b.filas.length;
    const ya = new Set(t().jugadores.map((j) => String(j.fideId || "")).filter(Boolean));
    const nacional = b.fuente === "nacional";
    const sexo = (x) => (x === "m" ? tx("masculino") : x === "w" ? tx("femenino") : "");
    tabla.replaceChildren(
      el("thead", {}, el("tr", {},
        el("th", { scope: "col", texto: tx("nombre") }), el("th", { scope: "col", texto: tx("titulo") }),
        el("th", { scope: "col", texto: tx("fed") }), el("th", { class: "num", scope: "col", texto: tx(LISTAS_ELO[lista]) }),
        el("th", { scope: "col", texto: tx("fideId") }),
        nacional ? el("th", { scope: "col", texto: tx("listasClub") }) : el("th", { class: "num", scope: "col", texto: tx("listasNacimiento") }),
        nacional ? el("th", { scope: "col", texto: tx("listasSexo") }) : null,
        el("th", { scope: "col" }, el("span", { class: "sr-only", texto: tx("listasAgregar") })))),
      el("tbody", {}, b.filas.map((f) => {
        const esta = ya.has(String(f.fideId));
        const elo = eloDeLista(f, lista);
        return el("tr", {},
          el("td", { texto: f.nombre }), el("td", { texto: f.titulo || "" }), el("td", { texto: f.fed || "" }),
          el("td", { class: "num", texto: elo || "—" }), el("td", { texto: f.fideId }),
          nacional ? el("td", { texto: f.club || "" }) : el("td", { class: "num", texto: f.nacimiento || "" }),
          nacional ? el("td", { texto: sexo(f.sexo) }) : null,
          el("td", {}, el("button", {
            type: "button", class: C.mini, "data-fide-id": f.fideId, disabled: esta,
            "aria-label": esta ? tx("listasYaEstaA", { n: f.nombre }) : tx("listasAgregarA", { n: f.nombre }),
            onclick: (e) => agregarDeLista(f, lista, e.currentTarget),
          }, esta ? tx("listasYaEsta") : tx("listasAgregar"))));
      })));
  }

  function agregarDeLista(f, lista, boton) {
    if (t().jugadores.some((j) => String(j.fideId || "") === String(f.fideId))) return;
    const elo = eloDeLista(f, lista);
    // El año de nacimiento de FIDE NO se guarda como fecha: Pareo pide el día
    // exacto, y un 1 de enero inventado cambiaría la categoría de los JDE.
    const datos = datosJugador({ nombre: f.nombre, elo, titulo: f.titulo, fed: f.fed, fideId: f.fideId, sexo: f.sexo });
    // El foco va al botón «Agregar» siguiente (o al buscador): el de esta fila
    // queda deshabilitado al repintar y lo perdería.
    const botones = Array.from($("pi-listas-resultados").querySelectorAll("button[data-fide-id]"));
    const siguiente = botones.slice(botones.indexOf(boton) + 1).find((x) => !x.disabled);
    const idSiguiente = siguiente ? siguiente.dataset.fideId : null;
    if (!agregarJugadores([datos])) return;
    Avisos.avisar(elo ? tx("listasAgregado", { n: datos.nombre, e: elo }) : tx("listasAgregadoSinElo", { n: datos.nombre }));
    const destino = idSiguiente && $("pi-listas-resultados").querySelector("button[data-fide-id='" + idSiguiente + "']");
    (destino || $("pi-listas-q")).focus();
  }

  Object.assign(Pagina, { sinTildes, soloJugador, subirLista, recogerDeInscripcion, agregarTodos,
    bolsilloNombre, buscarEloNacional, CLAVE_LISTA_ELO, listaEloInicial, buscarEnListaElo, pintarListaElo });
})();

/*! rev bfb5bbb0d2d82f9f */
