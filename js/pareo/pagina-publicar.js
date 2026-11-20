/* ===== Pareo Integral — la página (pareo.html): publicar y la organización =====
 *
 * La inscripción desde el celular, publicar en «Torneos en Pareo Integral» y las inscripciones en
 * línea, y «Tu organización».
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
  const { E, V, PREFIJO, C, leer, escribir, leerJSON, $, el, tx, estado, nuevoCodigoVivo, guardar, abrir, t,
    irA, pintarTodo, pintarJugadores, agregarJugadores, torneosDelEvento, guardarDelEvento, pintarEvento,
    CLAVE_VIVO_EVENTO, horaCR } = Pagina;

  // «Inscripción desde el celular»: un enlace (y su QR) para que el
  // entrenador de un centro mande a quien falta. Lo que llega queda en una
  // lista hasta que el árbitro lo acepta (entra con agregarJugadores(), que
  // ya lo anota en el acta como inscripción tardía y revisa la categoría) o
  // lo rechaza. Solo mientras esta pestaña tenga la inscripción abierta.
  const CLAVE_INSCRIBIR = "pareo_inscribir_v1_";
  const CLAVE_PENDIENTES = "pareo_inscripciones_v1_";
  function torneosParaInscribir(ev) { return torneosDelEvento(ev.id).filter((y) => !E.esDeEquipos(y)); }
  function pendientesDe(ev) { const x = leerJSON(CLAVE_PENDIENTES + ev.id, []); return Array.isArray(x) ? x : []; }
  function abrirInscripcion(ev) {
    let codigo = leer(CLAVE_INSCRIBIR + ev.id);
    if (!codigo) { codigo = nuevoCodigoVivo(); escribir(CLAVE_INSCRIBIR + ev.id, codigo); }
    const canal = window.sb.channel("pareo-inscribir-" + codigo);
    estado.inscribir = { id: ev.id, codigo, canal };
    const mandarEstado = () => canal.send({ type: "broadcast", event: "estado", payload: { evento: ev.nombre || "", torneos: torneosParaInscribir(ev).map((y) => V.nombreTorneo(y)) } });
    canal.on("broadcast", { event: "pedir" }, mandarEstado);
    canal.on("broadcast", { event: "inscripcion" }, (msg) => {
      const p = msg.payload || {};
      const texto = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
      const x = { id: "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), torneo: texto(p.torneo, 160), nombre: texto(p.nombre, 80),
        institucion: texto(p.institucion, 80), elo: Math.max(0, Math.min(3000, Math.floor(Number(p.elo) || 0))), autor: texto(p.autor, 60), hora: Date.now() };
      if (x.nombre.length < 3 || !torneosParaInscribir(ev).some((y) => V.nombreTorneo(y) === x.torneo)) return;
      const lista = pendientesDe(ev);
      if (lista.length >= 200 || lista.some((y) => y.torneo === x.torneo && y.nombre.toUpperCase() === x.nombre.toUpperCase())) return;
      escribir(CLAVE_PENDIENTES + ev.id, JSON.stringify(lista.concat(x)));
      canal.send({ type: "broadcast", event: "recibida", payload: { nombre: x.nombre } });
      Avisos.avisar(tx("inscribirLlego", { n: x.nombre, t: x.torneo }), { tipo: "info" });
      if (estado.ficha === "archivos") pintarEvento();
    });
    canal.subscribe((st) => { if (st === "SUBSCRIBED") mandarEstado(); });
  }
  function cerrarInscripcion() {
    if (!estado.inscribir) return;
    const c = estado.inscribir.canal;
    c.send({ type: "broadcast", event: "estado", payload: { cerrada: true } }).finally(() => c.unsubscribe());
    estado.inscribir = null;
  }
  function pintarInscripcionCelular(caja, ev) {
    const abierta = estado.inscribir && estado.inscribir.id === ev.id;
    const boton = el("button", { type: "button", id: "pi-inscribir", class: abierta ? C.botonSec : C.boton, "aria-pressed": abierta ? "true" : "false" }, tx(abierta ? "inscribirCerrar" : "inscribirAbrir"));
    boton.addEventListener("click", async () => {
      if (estado.inscribir && estado.inscribir.id === ev.id) cerrarInscripcion();
      else {
        try { await PareoVer.cargarSupabase(); } catch (e) { Avisos.avisar(tx("errorEnVivo", { e: e.message }), { tipo: "error" }); return; }
        abrirInscripcion(ev);
      }
      pintarEvento();
      const b = $("pi-inscribir");
      if (b) b.focus();
    });
    const qr = el("div", { id: "pi-inscribir-qr", class: "mt-2" });
    const lista = pendientesDe(ev);
    const filas = lista.map((x) => {
      const ya = torneosParaInscribir(ev).find((y) => V.nombreTorneo(y) === x.torneo);
      const repetido = ya && ya.jugadores.some((j) => j.nombre.toUpperCase() === x.nombre.toUpperCase());
      const si = el("button", { type: "button", class: C.mini, "data-aceptar-inscripcion": x.id }, tx("inscribirAceptar"));
      const no = el("button", { type: "button", class: C.miniPeligro, "data-rechazar-inscripcion": x.id }, tx("inscribirRechazar"));
      si.addEventListener("click", () => aceptarInscripcion(ev, x.id));
      no.addEventListener("click", () => { escribir(CLAVE_PENDIENTES + ev.id, JSON.stringify(pendientesDe(ev).filter((y) => y.id !== x.id))); pintarEvento(); });
      return el("li", { class: "flex flex-wrap items-center gap-2 border-t border-brand-100 dark:border-brand-800 pt-2" },
        el("span", { class: "flex-1 min-w-[14rem]" }, el("span", { class: "font-semibold", texto: x.nombre }),
          el("span", { texto: " · " + x.torneo + (x.institucion ? " · " + x.institucion : "") + (x.elo ? " · Elo " + x.elo : "") }),
          el("span", { class: C.nota, texto: " · " + horaCR(x.hora) + (x.autor ? " · " + tx("inscribirPor", { a: x.autor }) : "") }),
          repetido ? el("span", { class: "block text-sm font-semibold", texto: tx("inscribirRepetido") }) : null),
        si, no);
    });
    caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("inscribirTituloPanel") }),
      el("p", { class: C.nota, texto: tx("inscribirTextoPanel") }), el("div", { class: "mt-2" }, boton), qr,
      lista.length ? el("ul", { id: "pi-inscripciones", class: "mt-3 space-y-2 text-sm" }, filas) : null);
    if (abierta) {
      const url = location.origin + location.pathname + "#inscribir=" + estado.inscribir.codigo;
      PareoQr.cargar().then(() => qr.replaceChildren(el("div", { class: "w-40 bg-white p-2 rounded-lg" }, PareoQr.svg(url, tx("qrEtiqueta"))),
        el("p", { id: "pi-inscribir-url", class: "text-xs break-all mt-2 font-mono", texto: url }))).catch(() => qr.replaceChildren(el("p", { id: "pi-inscribir-url", class: "text-xs break-all font-mono", texto: url })));
    }
  }
  // Aceptar: el torneo se abre y la persona entra como cualquier otra
  // inscripción (con rondas jugadas, queda en el acta como tardía).
  function aceptarInscripcion(ev, id) {
    const x = pendientesDe(ev).find((y) => y.id === id);
    if (!x) return;
    const y = torneosParaInscribir(ev).find((z) => V.nombreTorneo(z) === x.torneo);
    escribir(CLAVE_PENDIENTES + ev.id, JSON.stringify(pendientesDe(ev).filter((z) => z.id !== id)));
    if (!y) { pintarEvento(); return; }
    if (y.__id && y.__id !== estado.id) abrir(y.__id);
    agregarJugadores([{ nombre: x.nombre, institucion: x.institucion, elo: x.elo || 0 }]);
    pintarTodo();
    Avisos.avisar(tx("inscribirAceptada", { n: x.nombre, t: x.torneo }));
  }

  // ---------- Publicar en «Torneos en Pareo Integral» ----------
  // El torneo se publica sin cuenta (js/pareo/publicar.js) y queda con su
  // clave (`t.publicado`): cada vez que se guarda, a los 5 segundos, se pone
  // al día solo (con una sola llamada aunque se anoten varios resultados en ese
  // rato), y la función toca a las páginas públicas que lo tienen abierto para
  // que lo vuelvan a leer ya. Eran 30 segundos; con la vuelta de un minuto de
  // la página pública, un resultado tardaba hasta minuto y medio en verse
  // (ver «El resultado de la mesa, al público al instante»). «Dejar de
  // publicar» lo quita del espacio público. Antes de tener jugadores se
  // publica como anuncio (`t.anuncio`), y se puede abrir la inscripción
  // previa (`t.inscripcion`): lo que llega se lee acá con la clave y entra a
  // la lista solo si se acepta.
  const ESPERA_PUBLICAR = 5000;
  // En un evento de la Mesa del árbitro las tablets leen las mesas de lo
  // publicado: lo que pone el principal tiene que llegarles en segundos
  // (ver «El resultado del principal llega solo a las tablets»). Sigue siendo
  // una publicación por espera, no una por cambio: varios resultados
  // seguidos salen juntos.
  const ESPERA_PUBLICAR_MESA = 4000;
  const publicando = new Map();
  // Lo que va con el torneo y no vive en él: el código del enlace en vivo de
  // su evento (en este navegador).
  const extraPublicar = (tor) => ({ codigoEvento: tor.evento ? leer(CLAVE_VIVO_EVENTO + tor.evento.id) || "" : "", organizador: organizacion() || undefined });
  function programarPublicacion() {
    const id = estado.id;
    if (publicando.has(id)) return;
    const deLaMesa = !!(estado.adjuntos && estado.adjuntos.idTorneo === id && estado.adjuntos.mesa);
    publicando.set(id, setTimeout(() => { publicando.delete(id); actualizarPublicado(id); }, deLaMesa ? ESPERA_PUBLICAR_MESA : ESPERA_PUBLICAR));
  }
  async function actualizarPublicado(id, boton) {
    const tor = id === estado.id ? t() : leerJSON(PREFIJO + id, null);
    if (!tor || !tor.publicado) return;
    if (boton) boton.disabled = true;
    const r = await PareoPublicar.actualizar(tor, extraPublicar(tor));
    if (boton) boton.disabled = false;
    if (r.ok) {
      tor.publicado.hora = Date.now();
      escribir(PREFIJO + id, JSON.stringify(tor));
      if (id === estado.id && estado.ficha === "archivos") pintarPublicar();
      if (boton) Avisos.avisar(tx("publicarAlDia"));
      return;
    }
    if (r.noExiste) {
      delete tor.publicado;
      escribir(PREFIJO + id, JSON.stringify(tor));
      if (id === estado.id && estado.ficha === "archivos") pintarPublicar();
    }
    if (boton || r.noExiste) Avisos.avisar(r.error || tx("publicarSinRed"), { tipo: "error" });
  }
  // Todo torneo se publica solo al emparejar la ronda 1 (lo decidió el dueño
  // del sitio: «que se vean todos los torneos que hagan todos los
  // árbitros», sin poder apagarlo). Sin internet, se vuelve a intentar con
  // el próximo cambio, como mucho una vez por minuto. Lo dicen la ficha
  // Torneo, la ronda 1 antes de emparejar, Archivos y la política de
  // privacidad.
  const publicandoSolo = new Set();
  const reintentoSolo = new Map();
  async function publicarSolo(id, ahora) {
    if (publicandoSolo.has(id) || (!ahora && (reintentoSolo.get(id) || 0) > Date.now())) return;
    const tor = id === estado.id ? t() : leerJSON(PREFIJO + id, null);
    if (!tor || tor.publicado || !tor.rondas.length) return;
    publicandoSolo.add(id);
    const r = await PareoPublicar.crear(tor, extraPublicar(tor));
    publicandoSolo.delete(id);
    if (!r.ok) { reintentoSolo.set(id, Date.now() + 60000); if (ahora) Avisos.avisar(r.error || tx("publicarSinRed"), { tipo: "error" }); return; }
    const actual = id === estado.id ? t() : leerJSON(PREFIJO + id, null);
    if (!actual || actual.publicado) return;
    actual.publicado = { id: r.id, clave: r.clave, hora: Date.now() };
    escribir(PREFIJO + id, JSON.stringify(actual));
    if (id === estado.id && estado.ficha === "archivos") pintarPublicar();
  }

  async function publicarTorneos(lista, boton) {
    boton.disabled = true;
    let bien = 0;
    let error = null;
    for (const tor of lista) {
      if (tor.publicado) { bien++; continue; }
      const r = await PareoPublicar.crear(tor, extraPublicar(tor));
      if (!r.ok) { error = r.error || tx("publicarSinRed"); break; }
      tor.publicado = { id: r.id, clave: r.clave, hora: Date.now() };
      if (tor === t() || tor.__id === estado.id) { estado.t.publicado = tor.publicado; guardar(); }
      else guardarDelEvento(tor);
      bien++;
    }
    boton.disabled = false;
    pintarPublicar();
    if (error) Avisos.avisar(error, { tipo: "error" });
    else Avisos.avisar(lista.length > 1 ? tx("publicadosVarios", { n: bien }) : tx("publicadoUno"));
    const x = $("pi-publicar-enlace"); if (x) x.focus();
  }

  // El anuncio: la hora, el contacto de la organización y las bases. Se
  // guarda al escribir y, si ya está publicado, se pone al día solo.
  function camposAnuncio(v) {
    const an = v.anuncio || {};
    const cambio = () => {
      v.anuncio = { hora: $("pi-anuncio-hora").value, contacto: $("pi-anuncio-contacto").value.trim().slice(0, 120), texto: $("pi-anuncio-texto").value.trim().slice(0, 1500) };
      guardar();
    };
    const campo = (id, etiqueta, control, ayuda) => el("div", {},
      el("label", { for: id, class: "block text-sm font-semibold mb-1", texto: etiqueta }), control,
      ayuda ? el("p", { class: C.nota + " mt-1", texto: ayuda }) : null);
    const hora = el("input", { id: "pi-anuncio-hora", type: "time", class: C.campoChico, value: an.hora || "" });
    const contacto = el("input", { id: "pi-anuncio-contacto", type: "text", maxlength: "120", autocomplete: "off", class: C.campo, value: an.contacto || "" });
    const texto = el("textarea", { id: "pi-anuncio-texto", rows: "4", maxlength: "1500", class: C.campo });
    texto.value = an.texto || "";
    for (const x of [hora, contacto, texto]) x.addEventListener("change", cambio);
    return el("fieldset", { class: "pi-revisar mt-3" },
      el("legend", { class: "pi-revisar-titulo px-1", texto: tx("anuncioTitulo") }),
      el("p", { class: C.nota + " mb-2", texto: v.fechaInicio ? tx("anuncioFecha", { f: window.HoraCR ? HoraCR.fecha(v.fechaInicio) : v.fechaInicio }) : tx("anuncioSinFecha") }),
      el("div", { class: "grid sm:grid-cols-2 gap-3" },
        campo("pi-anuncio-hora", tx("anuncioHora"), hora),
        campo("pi-anuncio-contacto", tx("anuncioContacto"), contacto, tx("anuncioContactoAyuda"))),
      el("div", { class: "mt-3" }, campo("pi-anuncio-texto", tx("anuncioTexto"), texto)));
  }

  // La inscripción previa: abrirla o cerrarla (con fecha límite) y leer lo
  // que llegó. Aceptar uno lo agrega a la lista de jugadores como cualquier
  // otro (agregarJugadores); rechazarlo solo lo marca. Ya decidida, se puede
  // cambiar: de rechazada a aceptada entra a la lista, y de aceptada a
  // rechazada sale de ella si todavía no hay rondas (con rondas, sigue y el
  // árbitro lo retira, para no tocar emparejamientos ya hechos). Las dos cosas piden
  // un comentario (el motivo, si se rechaza) que queda con la inscripción y,
  // si quien inscribió dejó un correo, le llega en el aviso (pareo-publicar).
  // Lo que se cambia en «Configurar el formulario» se publica SIN redibujar
  // la ficha (redibujarla movía la caja y se perdían teclas a medio
  // escribir) y de a uno: si llega otro cambio mientras sale uno, se manda
  // una vez más con lo último, para que uno viejo no pise a uno nuevo. Si
  // falla, el camino de siempre (actualizarPublicado) se encarga.
  let configEnVuelo = false, configOtraVez = false;
  async function publicarConfigInscripcion() {
    guardar();
    if (configEnVuelo) { configOtraVez = true; return; }
    configEnVuelo = true;
    try {
      do {
        configOtraVez = false;
        const tor = t();
        if (!tor.publicado) return;
        const r = await PareoPublicar.actualizar(tor, extraPublicar(tor));
        if (!r.ok) { actualizarPublicado(estado.id); return; }
        if (t() === tor && tor.publicado) { tor.publicado.hora = Date.now(); guardar(); }
      } while (configOtraVez);
    } finally { configEnVuelo = false; }
  }
  function cajaInscripcion(v) {
    const ins = v.inscripcion || {};
    const abierta = el("input", { type: "checkbox", id: "pi-insc-abierta", class: "mt-1", checked: !!ins.abierta });
    const hasta = el("input", { id: "pi-insc-hasta", type: "date", class: C.campoChico, value: ins.hasta || "" });
    const cambio = () => {
      v.inscripcion = { abierta: abierta.checked, hasta: hasta.value || "" };
      guardar();
      actualizarPublicado(estado.id);
      Avisos.avisar(tx(abierta.checked ? "inscAbierta" : "inscCerrada"));
    };
    abierta.addEventListener("change", cambio);
    hasta.addEventListener("change", cambio);
    const ver = el("button", { type: "button", id: "pi-insc-ver", class: C.botonSec, "aria-expanded": "false", "aria-controls": "pi-insc-lista" }, tx("inscVer"));
    const lista = el("div", { id: "pi-insc-lista", hidden: true });
    ver.addEventListener("click", () => {
      if (!lista.hidden) { lista.hidden = true; ver.setAttribute("aria-expanded", "false"); return; }
      cargarInscripciones(lista, ver);
    });
    return el("fieldset", { class: "pi-revisar mt-3" },
      el("legend", { class: "pi-revisar-titulo px-1", texto: tx("inscTitulo") }),
      el("p", { class: C.nota + " mb-2", texto: tx("inscAyuda") }),
      el("div", { class: "flex items-start gap-2 text-sm" }, abierta, el("label", { for: "pi-insc-abierta", texto: tx("inscAbrir") })),
      el("div", { class: "mt-2 flex flex-wrap items-center gap-2 text-sm" }, el("label", { for: "pi-insc-hasta", class: "font-semibold", texto: tx("inscHasta") }), hasta),
      // El formulario a la medida del torneo (js/pareo/inscripcion-config.js).
      window.PareoInscripcionConfig ? PareoInscripcionConfig.caja({ v, torneo: t, el, tx, C, alCambiar: publicarConfigInscripcion }) : null,
      el("div", { class: "mt-3" }, ver), lista);
  }
  async function cargarInscripciones(lista, ver) {
    const v = t();
    ver.disabled = true;
    const r = await PareoPublicar.inscripciones(v.publicado);
    ver.disabled = false;
    if (!r.ok) { Avisos.avisar(r.error || tx("publicarSinRed"), { tipo: "error" }); return; }
    pintarInscripciones(lista, r.inscripciones || []);
    lista.hidden = false;
    ver.setAttribute("aria-expanded", "true");
  }
  function pintarInscripciones(lista, todas) {
    const v = t();
    const pendientes = todas.filter((x) => x.estado === "pendiente");
    const esCorreo = (c) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(c || "").trim());
    // Antes de marcar: el comentario, y a quién le llega el aviso. Con una
    // sola inscripción que dejó un teléfono, quien organiza puede escribir
    // el correo y el aviso sale igual. `reaviso`: una ya decidida a la que
    // no le llegó el aviso (se decidió sin correo, o no salió): se le manda
    // ahora, sin cambiar la decisión.
    const decidir = async (cuales, estadoNuevo, boton, reaviso) => {
      const acepta = estadoNuevo === "aceptada";
      const conCorreo = cuales.filter((x) => esCorreo(x.contacto));
      const uno = cuales.length === 1 ? cuales[0] : null;
      const pideCorreo = !!uno && !conCorreo.length;
      // De aceptada a rechazada (cambiar una decisión): el cuadro dice si sale de la lista.
      const estabaAceptada = !acepta && cuales.some((x) => x.estado === "aceptada");
      const texto = (uno
        ? (conCorreo.length ? tx(acepta ? "inscAvisoCorreo" : "inscAvisoCorreoRechazo", { c: uno.contacto }) : tx(reaviso ? "inscAvisoTelefonoReaviso" : "inscAvisoTelefono", { c: uno.contacto }))
        : tx("inscAvisoVarios", { a: conCorreo.length, b: cuales.length - conCorreo.length }))
        + (estabaAceptada ? " " + tx(v.rondas.length ? "inscCambioConRondas" : "inscCambioSale") : "");
      const campos = [Object.assign({ nombre: "comentario", etiqueta: tx(acepta ? "inscComentario" : "inscMotivo"), tipo: "textarea", max: 300, valor: reaviso && uno ? uno.comentario || "" : "" }, acepta ? {} : { ayuda: tx("inscMotivoAyuda") })];
      if (pideCorreo) campos.unshift({ nombre: "correo", etiqueta: tx("inscCorreoAgregar"), inputmode: "email", max: 120, ayuda: tx(reaviso ? "inscCorreoAgregarAyudaReaviso" : "inscCorreoAgregarAyuda") });
      const r = await Avisos.formulario({
        titulo: uno ? tx(reaviso ? "inscAvisarTitulo" : acepta ? "inscAceptarTitulo" : "inscRechazarTitulo", { n: uno.nombre }) : tx("inscAceptarTodasTitulo", { n: cuales.length }),
        texto, cancelar: tx("cancelar"), peligro: !acepta && !reaviso,
        aceptar: tx(reaviso ? "inscAvisarSi" : conCorreo.length ? (acepta ? "inscAceptarSi" : "inscRechazarSi") : (acepta ? "inscAceptarSinAviso" : "inscRechazarSinAviso")),
        campos,
      });
      if (!r) { if (boton && boton.isConnected) boton.focus(); return; }
      const correo = String(r.correo || "").trim();
      if (correo && !esCorreo(correo)) { Avisos.avisar(tx("inscCorreoMalo", { c: correo }), { tipo: "error" }); if (boton && boton.isConnected) boton.focus(); return; }
      if (reaviso && !correo && !conCorreo.length) { Avisos.avisar(tx("inscCorreoFalta"), { tipo: "error" }); if (boton && boton.isConnected) boton.focus(); return; }
      marcar(cuales, estadoNuevo, boton, String(r.comentario || "").trim().slice(0, 300), { correo, reaviso: !!reaviso });
    };
    const marcar = async (cuales, estadoNuevo, boton, comentario, extra) => {
      const { correo = "", reaviso = false } = extra || {};
      if (boton) boton.disabled = true;
      // Al volver a avisar a una aceptada, ya está en la lista: no se agrega otra vez.
      if (estadoNuevo === "aceptada" && !reaviso) {
        // El sexo y la fecha de nacimiento, si la inscripción los trae (el
        // formulario de la Eliminatoria Cantonal JDN de Pérez Zeledón): sin
        // ellos no hay clasificación femenina ni revisión del año.
        agregarJugadores(cuales.map((x) => Object.assign({ nombre: x.nombre, institucion: x.institucion || "", categoria: x.categoria || "", elo: x.elo || 0, fideId: x.fide_id || "", titulo: "", fed: "" },
          x.sexo === "M" || x.sexo === "F" ? { sexo: x.sexo } : {}, /^\d{4}-\d{2}-\d{2}$/.test(x.nacimiento || "") ? { nacimiento: x.nacimiento } : {})));
      }
      const r = await PareoPublicar.marcar(v.publicado, cuales.map((x) => x.id), estadoNuevo, comentario, correo);
      if (!r.ok) { if (boton) boton.disabled = false; Avisos.avisar(r.error || tx("publicarSinRed"), { tipo: "error" }); return; }
      // De aceptada a rechazada: sale de la lista si todavía no hay rondas
      // (uno solo con ese nombre, el último que entró).
      if (estadoNuevo === "rechazada" && !v.rondas.length) {
        const quitados = [];
        for (const x of cuales.filter((y) => y.estado === "aceptada")) {
          const nom = (x.nombre || "").toUpperCase();
          const k = v.jugadores.map((j) => (j.nombre || "").toUpperCase()).lastIndexOf(nom);
          if (k >= 0) { v.jugadores.splice(k, 1); quitados.push(x.nombre); }
        }
        if (quitados.length) { guardar(); pintarJugadores(); Avisos.avisar(tx("inscQuitadoDeLista", { n: quitados.join(", ") })); }
      }
      const avisados = new Set(r.avisados || []);
      const ahora = new Date().toISOString();
      for (const x of cuales) { x.estado = estadoNuevo; x.comentario = comentario; x.avisado = avisados.has(x.id) ? ahora : null; }
      if (correo && cuales.length === 1) { cuales[0].contacto = r.contacto || correo; if (typeof r.nota === "string") cuales[0].nota = r.nota; }
      pintarInscripciones(lista, todas);
      if (reaviso) { if (avisados.size) Avisos.avisar(tx("inscAvisados", { n: avisados.size })); }
      else Avisos.avisar(tx(estadoNuevo === "aceptada" ? "inscAceptadas" : "inscRechazadas", { n: cuales.length }) + (avisados.size ? " " + tx("inscAvisados", { n: avisados.size }) : ""));
      // Lo que el árbitro tiene que hacer él: avisar a quien dejó un teléfono
      // y a quien no le salió el correo.
      const conTelefono = cuales.filter((x) => !esCorreo(x.contacto));
      const fallaron = cuales.filter((x) => esCorreo(x.contacto) && !avisados.has(x.id));
      if (conTelefono.length) Avisos.avisar(conTelefono.length === 1 ? tx("inscSinCorreoAviso", { n: conTelefono[0].nombre }) : tx("inscSinCorreoAvisos", { n: conTelefono.map((x) => x.nombre).join(", ") }), { tipo: "info" });
      if (fallaron.length) Avisos.avisar(tx("inscAvisoFallo", { n: fallaron.map((x) => x.nombre).join(", ") }), { tipo: "error" });
      const b = $("pi-insc-ver"); if (b) b.focus();
    };
    const resumen = el("p", { id: "pi-insc-resumen", class: "text-sm font-semibold mt-3", role: "status",
      texto: todas.length ? tx("inscResumen", { n: todas.length, p: pendientes.length }) : tx("inscNinguna") });
    const filas = todas.map((x) => {
      const yaEsta = v.jugadores.some((j) => (j.nombre || "").toUpperCase() === (x.nombre || "").toUpperCase());
      const acciones = x.estado === "pendiente"
        ? [el("button", { type: "button", class: C.mini, "data-aceptar": x.id, "aria-label": tx("inscAceptarA", { n: x.nombre }), onclick: (e) => decidir([x], "aceptada", e.currentTarget) }, tx("inscAceptar")),
           el("button", { type: "button", class: C.miniPeligro, "data-rechazar": x.id, "aria-label": tx("inscRechazarA", { n: x.nombre }), onclick: (e) => decidir([x], "rechazada", e.currentTarget) }, tx("inscRechazar"))]
        : [el("span", { class: "pi-sello " + (x.estado === "aceptada" ? "pi-sello-listo" : "pi-sello-falta"), texto: (x.estado === "aceptada" ? "✓ " : "✗ ") + tx(x.estado === "aceptada" ? "inscEstadoAceptada" : "inscEstadoRechazada") }),
           // Ya decidida y sin aviso: mandarlo ahora (con un teléfono, escribiendo el correo).
           x.avisado ? null : el("button", { type: "button", class: C.mini, "data-reavisar": x.id, "aria-label": tx("inscAvisarA", { n: x.nombre }), onclick: (e) => decidir([x], x.estado, e.currentTarget, true) }, tx("inscAvisar")),
           // Y cambiar la decisión.
           x.estado === "aceptada"
             ? el("button", { type: "button", class: C.miniPeligro, "data-cambiar": x.id, "aria-label": tx("inscCambiarRechazadaA", { n: x.nombre }), onclick: (e) => decidir([x], "rechazada", e.currentTarget) }, tx("inscCambiarRechazada"))
             : el("button", { type: "button", class: C.mini, "data-cambiar": x.id, "aria-label": tx("inscCambiarAceptadaA", { n: x.nombre }), onclick: (e) => decidir([x], "aceptada", e.currentTarget) }, tx("inscCambiarAceptada"))];
      return el("li", { class: "pi-dm-tarjeta", "data-insc": x.id },
        el("p", { class: "font-semibold", texto: x.nombre + (yaEsta && x.estado === "pendiente" ? " · " + tx("inscYaEsta") : "") }),
        el("p", { class: "text-xs", texto: [x.institucion, x.categoria, x.sexo === "F" ? "Femenino" : x.sexo === "M" ? "Masculino" : "", x.nacimiento ? "Nació " + x.nacimiento.split("-").reverse().join("/") : "", x.elo ? "Elo " + x.elo : "", x.fide_id ? "FIDE " + x.fide_id : ""].filter(Boolean).join(" · ") }),
        el("p", { class: "text-xs mt-1", texto: tx("inscQuien", { r: x.responsable, c: x.contacto }) }),
        x.nota ? el("p", { class: "text-xs mt-1 italic", texto: x.nota }) : null,
        el("div", { class: "mt-2 flex flex-wrap gap-2" }, acciones),
        // Ya marcada: el comentario que se escribió y si se le avisó.
        x.estado !== "pendiente" && x.comentario ? el("p", { class: "text-sm mt-2", "data-insc-comentario": x.id, texto: tx(x.estado === "aceptada" ? "inscComentarioDe" : "inscMotivoDe", { c: x.comentario }) }) : null,
        x.estado !== "pendiente" ? el("p", { class: C.nota + " mt-1", "data-insc-aviso": x.id,
          texto: x.avisado ? tx("inscAvisado") : tx(esCorreo(x.contacto) ? "inscNoAvisadoFallo" : "inscNoAvisadoTel") }) : null);
    });
    const todasB = pendientes.length > 1 ? el("button", { type: "button", id: "pi-insc-todas", class: C.boton + " mt-2", onclick: (e) => decidir(pendientes, "aceptada", e.currentTarget) }, tx("inscAceptarTodas", { n: pendientes.length })) : null;
    lista.replaceChildren(resumen, todasB, el("ul", { class: "mt-2 grid lg:grid-cols-2 gap-2" }, filas));
  }

  // ---------- Tu organización ----------
  // El nombre y el logo de quien organiza, sin cuenta: se guardan en la base
  // (pareo_organizadores, por la función pareo-publicar) con una clave que
  // queda en este navegador, y cada torneo que se publica desde acá queda a
  // su nombre. Salen en la lista pública, en su página de organizador y en
  // los PDF. El sello «Organizador verificado» lo pone solo Ajedrez
  // Integral. Ver «Torneos en Pareo Integral: el organizador y la
  // moderación» en docs/decisiones/juegos-y-torneos.md.
  const CLAVE_ORG = "pareo_organizador_v1";
  function organizacion() {
    const o = leerJSON(CLAVE_ORG, null);
    return o && typeof o.id === "string" && typeof o.clave === "string" ? o : null;
  }
  // El código para usarla en otra computadora: el id y la clave juntos.
  const codigoOrg = (o) => "org:" + o.id + ":" + o.clave;
  const LOGO_MAX = 190000;
  async function logoDeArchivo(archivo) {
    if (!/^image\/(png|jpeg|webp)$/.test(archivo.type)) throw new Error(tx("orgLogoTipo"));
    // Primero a 400 px; si aún pesa, a 200.
    for (const lado of [400, 200]) {
      const datos = await window.ImagenAchicar.comoDatos(await window.ImagenAchicar.logo(archivo, lado));
      if (datos.length <= LOGO_MAX) return datos;
    }
    throw new Error(tx("orgLogoPesado"));
  }
  function pintarOrganizacion() {
    const caja = $("pi-organizacion");
    if (!caja) return;
    const o = organizacion();
    let logoNuevo; // undefined: no se tocó; null: quitarlo; texto: el nuevo
    const nombre = el("input", { id: "pi-org-nombre", type: "text", maxlength: "120", autocomplete: "organization", class: C.campo + " w-full", value: (o && o.nombre) || "" });
    const archivo = el("input", { id: "pi-org-logo", type: "file", accept: "image/png,image/jpeg,image/webp", class: "text-sm" });
    const vista = el("img", { id: "pi-org-vista", alt: "", class: "h-16 w-auto max-w-[10rem] object-contain rounded bg-white border border-brand-200" });
    const quitar = el("button", { type: "button", id: "pi-org-quitar-logo", class: C.mini }, tx("orgQuitarLogo"));
    const estadoOrg = el("p", { id: "pi-org-estado", class: "text-sm mt-2", role: "status" });
    const ponerVista = () => {
      const src = logoNuevo === undefined ? (o && o.logo) : logoNuevo;
      vista.hidden = !src; quitar.hidden = !src;
      if (src) vista.src = src; else vista.removeAttribute("src");
    };
    archivo.addEventListener("change", async () => {
      const f = archivo.files && archivo.files[0];
      if (!f) return;
      try { logoNuevo = await logoDeArchivo(f); ponerVista(); estadoOrg.textContent = tx("orgLogoListo"); }
      catch (e) { archivo.value = ""; Avisos.avisar(e.message, { tipo: "error" }); }
    });
    quitar.addEventListener("click", () => { logoNuevo = null; archivo.value = ""; ponerVista(); estadoOrg.textContent = tx("orgLogoQuitado"); });
    const guardarB = el("button", { type: "submit", id: "pi-org-guardar", class: C.boton }, tx(o ? "orgGuardar" : "orgCrear"));
    // El correo: opcional, nunca se muestra entero (lo que hay lo dice
    // #pi-org-correo-estado); escribir uno nuevo pide el consentimiento.
    const correo = el("input", { id: "pi-org-correo", type: "email", maxlength: "200", autocomplete: "email", class: C.campo + " w-full", "aria-describedby": "pi-org-correo-ayuda" });
    const permisoCorreo = el("input", { type: "checkbox", id: "pi-org-correo-permiso", class: "mt-1" });
    const form = el("form", { id: "pi-org-form", class: "grid gap-3 sm:max-w-lg", novalidate: true },
      el("label", { for: "pi-org-nombre", class: "text-sm font-semibold" }, tx("orgNombre"), nombre),
      el("div", {}, el("label", { for: "pi-org-logo", class: "block text-sm font-semibold mb-1" }, tx("orgLogo")),
        el("div", { class: "flex flex-wrap items-center gap-3" }, vista, archivo, quitar),
        el("p", { class: C.nota + " mt-1", texto: tx("orgLogoAyuda") })),
      el("div", {}, el("label", { for: "pi-org-correo", class: "block text-sm font-semibold mb-1" }, tx("orgCorreo")), correo,
        el("p", { id: "pi-org-correo-ayuda", class: C.nota + " mt-1", texto: tx("orgCorreoAyuda") }),
        el("p", { id: "pi-org-correo-estado", class: "text-sm mt-1", role: "status" }),
        el("div", { class: "flex items-start gap-2 text-sm mt-2" }, permisoCorreo,
          el("label", { for: "pi-org-correo-permiso" }, tx("orgCorreoPermiso") + " ",
            el("a", { href: "privacidad.html#torneos", target: "_blank", rel: "noopener", class: "underline underline-offset-2 hover:no-underline", texto: tx("politicaPrivacidad") }), "."))),
      el("div", {}, guardarB), estadoOrg);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const n = nombre.value.trim();
      if (n.length < 2) { Avisos.avisar(tx("orgFaltaNombre"), { tipo: "error" }); nombre.focus(); return; }
      guardarB.disabled = true;
      estadoOrg.textContent = tx("orgGuardando");
      const pedido = { nombre: n };
      if (o) Object.assign(pedido, { id: o.id, clave: o.clave });
      if (logoNuevo !== undefined) pedido.logo = logoNuevo;
      else if (!o) pedido.logo = null;
      const nuevoCorreo = correo.value.trim();
      if (nuevoCorreo) {
        if (!permisoCorreo.checked) { guardarB.disabled = false; estadoOrg.textContent = ""; Avisos.avisar(tx("orgCorreoFaltaPermiso"), { tipo: "error" }); permisoCorreo.focus(); return; }
        Object.assign(pedido, { correo: nuevoCorreo, consentimiento: true });
      }
      const r = await PareoPublicar.guardarOrganizador(pedido);
      guardarB.disabled = false;
      if (!r.ok) { estadoOrg.textContent = ""; Avisos.avisar(r.error || tx("publicarSinRed"), { tipo: "error" }); return; }
      if (r.correoPendiente === true) Avisos.avisar(tx("orgCorreoEnviado", { c: nuevoCorreo }));
      else if (r.correoPendiente === false) Avisos.avisar(tx("orgCorreoNoSalio"), { tipo: "error" });
      const nueva = { id: r.id, clave: o ? o.clave : r.clave, nombre: n, logo: logoNuevo === undefined ? (o && o.logo) || null : logoNuevo };
      escribir(CLAVE_ORG, JSON.stringify(nueva));
      // Los torneos ya publicados desde acá pasan a su nombre (y con su
      // nombre nuevo) en la próxima puesta al día, que se pide ya.
      for (const x of estado.lista) {
        const y = x.id === estado.id ? t() : leerJSON(PREFIJO + x.id, null);
        if (y && y.publicado) actualizarPublicado(x.id);
      }
      pintarOrganizacion();
      Avisos.avisar(tx(o ? "orgGuardada" : "orgCreada", { n }));
      const sig = $("pi-org-nombre"); if (sig) sig.focus();
    });
    caja.replaceChildren(
      el("h2", { class: "font-serif text-xl font-bold mb-1", texto: tx("orgTitulo") }),
      el("p", { class: C.nota + " mb-3", texto: tx("orgAyuda") }), form);
    ponerVista();
    if (o) {
      const pagina = new URL("torneos-pareo.html#o=" + encodeURIComponent(o.id), location.href).href;
      const copiar = el("button", { type: "button", id: "pi-org-copiar", class: C.botonSec }, tx("orgCopiarCodigo"));
      copiar.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(codigoOrg(o)); Avisos.avisar(tx("orgCodigoCopiado")); }
        catch (e) { await Avisos.formulario({ titulo: tx("orgCopiarCodigo"), texto: tx("orgCodigoAMano"), aceptar: tx("cerrar"), campos: [{ nombre: "codigo", etiqueta: tx("orgCodigo"), valor: codigoOrg(o) }] }); }
      });
      caja.append(el("div", { class: "mt-4 flex flex-wrap items-center gap-3" },
        el("a", { id: "pi-org-pagina", href: pagina, target: "_blank", rel: "noopener", class: "text-sm underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" }, tx("orgVerPagina")),
        copiar),
        el("p", { class: C.nota + " mt-1", texto: tx("orgCodigoAyuda") }),
        el("div", { id: "pi-org-sello", class: "mt-4" }));
      pintarEstadoOrganizacion(o);
    } else {
      const usar = el("button", { type: "button", id: "pi-org-usar", class: C.botonSec + " mt-4" }, tx("orgUsarCodigo"));
      usar.addEventListener("click", async () => {
        const res = await Avisos.formulario({ titulo: tx("orgUsarCodigo"), texto: tx("orgUsarCodigoTexto"), aceptar: tx("orgUsar"), cancelar: tx("cancelar"),
          campos: [{ nombre: "codigo", etiqueta: tx("orgCodigo"), valor: "", max: 200 }] });
        if (!res) return;
        const m = /^org:([0-9a-f-]{36}):([0-9a-f]{20,100})$/.exec(String(res.codigo || "").trim());
        if (!m) { Avisos.avisar(tx("orgCodigoMalo"), { tipo: "error" }); return; }
        escribir(CLAVE_ORG, JSON.stringify({ id: m[1], clave: m[2], nombre: "", logo: null }));
        pintarOrganizacion();
        Avisos.avisar(tx("orgCodigoUsado"));
      });
      const recuperar = el("button", { type: "button", id: "pi-org-recuperar", class: C.botonSec + " mt-4" }, tx("orgRecuperar"));
      recuperar.addEventListener("click", async () => {
        const res = await Avisos.formulario({ titulo: tx("orgRecuperar"), texto: tx("orgRecuperarTexto"), aceptar: tx("orgRecuperarMandar"), cancelar: tx("cancelar"),
          campos: [{ nombre: "correo", etiqueta: tx("orgCorreo"), valor: "", max: 200 }] });
        if (!res || !String(res.correo || "").trim()) return;
        recuperar.disabled = true;
        const r = await PareoPublicar.recuperarOrganizador(String(res.correo).trim());
        recuperar.disabled = false;
        if (!r.ok) { Avisos.avisar(r.error || tx("publicarSinRed"), { tipo: "error" }); return; }
        Avisos.avisar(tx("orgRecuperarEnviado"));
      });
      caja.append(el("div", { class: "flex flex-wrap gap-2" }, usar, recuperar));
    }
  }

  // Lo que la organización ve de sí misma (con su clave, de la función): su
  // correo tapado y si está confirmado, y el sello o cómo pedirlo.
  async function pintarEstadoOrganizacion(o) {
    const r = await PareoPublicar.estadoOrganizador(o);
    const caja = $("pi-org-sello"), correoEstado = $("pi-org-correo-estado");
    if (!caja || !r.ok) return;
    if (correoEstado) {
      correoEstado.replaceChildren();
      if (r.correo) {
        const quitarC = el("button", { type: "button", id: "pi-org-correo-quitar", class: C.mini + " ml-2" }, tx("orgCorreoQuitar"));
        quitarC.addEventListener("click", async () => {
          const n = ($("pi-org-nombre").value || o.nombre || "").trim();
          const q = await PareoPublicar.guardarOrganizador({ id: o.id, clave: o.clave, nombre: n.length >= 2 ? n : o.nombre, correo: "" });
          if (!q.ok) { Avisos.avisar(q.error || tx("publicarSinRed"), { tipo: "error" }); return; }
          Avisos.avisar(tx("orgCorreoQuitado"));
          pintarEstadoOrganizacion(o);
        });
        correoEstado.append(tx(r.correoConfirmado ? "orgCorreoConfirmado" : "orgCorreoPendiente", { c: r.correo }), quitarC);
      }
    }
    if (r.verificado) { caja.replaceChildren(el("p", { class: "text-sm font-semibold", texto: tx("orgSelloTiene") })); return; }
    if (r.selloPendiente) { caja.replaceChildren(el("p", { class: "text-sm", texto: tx("orgSelloPendiente") })); return; }
    const abrirB = el("button", { type: "button", id: "pi-org-sello-abrir", class: C.botonSec, "aria-expanded": "false", "aria-controls": "pi-org-sello-form" }, tx("orgSello"));
    const campo = (id, etiqueta, max, tipo) => el("label", { for: id, class: "text-sm font-semibold" }, etiqueta,
      tipo === "textarea"
        ? el("textarea", { id, maxlength: String(max), rows: "3", class: C.campo + " w-full font-normal" })
        : el("input", { id, maxlength: String(max), type: "text", class: C.campo + " w-full font-normal" }));
    const permiso = el("input", { type: "checkbox", id: "pi-org-sello-permiso", class: "mt-1" });
    const mandarB = el("button", { type: "submit", id: "pi-org-sello-mandar", class: C.boton }, tx("orgSelloMandar"));
    const form = el("form", { id: "pi-org-sello-form", class: "grid gap-3 sm:max-w-lg mt-3", novalidate: true, hidden: true },
      el("p", { class: C.nota, texto: tx("orgSelloAyuda") }),
      campo("pi-org-sello-quien", tx("orgSelloQuien"), 120), campo("pi-org-sello-representa", tx("orgSelloRepresenta"), 200),
      campo("pi-org-sello-contacto", tx("orgSelloContacto"), 160), campo("pi-org-sello-nota", tx("orgSelloNota"), 800, "textarea"),
      el("div", { class: "flex items-start gap-2 text-sm" }, permiso,
        el("label", { for: "pi-org-sello-permiso" }, tx("orgSelloPermiso") + " ",
          el("a", { href: "privacidad.html#torneos", target: "_blank", rel: "noopener", class: "underline underline-offset-2 hover:no-underline", texto: tx("politicaPrivacidad") }), ".")),
      el("div", {}, mandarB));
    abrirB.addEventListener("click", () => {
      const abierto = abrirB.getAttribute("aria-expanded") === "true";
      abrirB.setAttribute("aria-expanded", abierto ? "false" : "true");
      form.hidden = abierto;
      if (!abierto) $("pi-org-sello-quien").focus();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = (id) => $(id).value.trim();
      const datos = { quien: v("pi-org-sello-quien"), representa: v("pi-org-sello-representa"), contacto: v("pi-org-sello-contacto"), nota: v("pi-org-sello-nota") };
      if (datos.quien.length < 2 || datos.representa.length < 2 || datos.contacto.length < 5) { Avisos.avisar(tx("orgSelloFalta"), { tipo: "error" }); return; }
      if (!permiso.checked) { Avisos.avisar(tx("orgSelloFaltaPermiso"), { tipo: "error" }); permiso.focus(); return; }
      mandarB.disabled = true;
      const q = await PareoPublicar.pedirSello(o, datos);
      mandarB.disabled = false;
      if (!q.ok) { Avisos.avisar(q.error || tx("publicarSinRed"), { tipo: "error" }); return; }
      Avisos.avisar(tx("orgSelloEnviado"));
      caja.replaceChildren(el("p", { class: "text-sm", tabindex: "-1", id: "pi-org-sello-listo", texto: tx("orgSelloPendiente") }));
      $("pi-org-sello-listo").focus();
    });
    caja.replaceChildren(abrirB, form);
  }

  // Los enlaces de los correos: confirmar el correo de la organización
  // (#org-correo=<id>.<token>) y recuperarla en este navegador
  // (#org-recuperar=<id>.<token>, que deja una clave nueva).
  async function enlaceOrganizacion(hash) {
    const m = /^#org-(correo|recuperar)=([0-9a-f-]{36})\.([0-9a-f]{20,100})$/.exec(hash);
    history.replaceState(null, "", location.pathname + location.search);
    if (!m) return;
    if (m[1] === "correo") {
      const r = await PareoPublicar.confirmarCorreo(m[2], m[3]);
      if (!r.ok) { Avisos.avisar(r.error || tx("publicarSinRed"), { tipo: "error", duracion: 0 }); return; }
      Avisos.avisar(tx("orgCorreoConfirmadoAviso", { n: r.nombre || "" }));
    } else {
      const r = await PareoPublicar.recuperarConfirmar(m[2], m[3]);
      if (!r.ok) { Avisos.avisar(r.error || tx("publicarSinRed"), { tipo: "error", duracion: 0 }); return; }
      escribir(CLAVE_ORG, JSON.stringify({ id: r.id, clave: r.clave, nombre: r.nombre || "", logo: r.logo || null }));
      Avisos.avisar(tx("orgRecuperada", { n: r.nombre || "" }), { duracion: 0 });
    }
    irA("archivos");
    pintarOrganizacion();
  }

  function pintarPublicar() {
    const caja = $("pi-publicar");
    if (!caja) return;
    const v = t();
    caja.replaceChildren(
      el("h2", { class: "font-serif text-xl font-bold mb-1", texto: tx("publicarTitulo") }),
      el("p", { class: C.nota + " mb-3", texto: tx("publicarAyuda") }));
    if (v.publicado) {
      const url = PareoPublicar.enlace(v.publicado.id);
      caja.append(
        el("p", { class: "text-sm font-semibold", role: "status", texto: "✓ " + tx(v.jugadores.length ? "publicadoEstado" : "publicadoAnuncio", { h: v.publicado.hora ? horaCR(v.publicado.hora) : "—" }) }),
        el("p", { class: "text-sm mt-1 break-all" }, el("a", { id: "pi-publicar-enlace", href: url, target: "_blank", rel: "noopener", class: "underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", texto: url })),
        el("p", { class: C.nota + " mt-1", texto: tx("publicadoAyuda") }));
      const ahora = el("button", { type: "button", id: "pi-publicar-ahora", class: C.botonSec }, tx("publicarAhora"));
      ahora.addEventListener("click", () => actualizarPublicado(estado.id, ahora));
      const quitarB = el("button", { type: "button", id: "pi-publicar-quitar", class: C.miniPeligro + " px-3 py-2" }, tx("publicarQuitar"));
      quitarB.addEventListener("click", async () => {
        if (!(await Avisos.confirmar(tx("publicarQuitarConfirma"), { aceptar: tx("publicarQuitar"), peligro: true }))) return;
        quitarB.disabled = true;
        const r = await PareoPublicar.borrar(v.publicado);
        quitarB.disabled = false;
        if (!r.ok) { Avisos.avisar(r.error || tx("publicarSinRed"), { tipo: "error" }); return; }
        delete v.publicado;
        guardar(); pintarPublicar();
        Avisos.avisar(tx("publicarQuitado"));
        const b = $("pi-publicar-permiso"); if (b) b.focus();
      });
      // Un torneo que ya empezó se publica siempre: no se quita.
      caja.append(el("div", { class: "mt-3 flex flex-wrap gap-2" }, ahora, v.rondas.length ? null : quitarB));
      if (!v.rondas.length) caja.append(camposAnuncio(v));
      caja.append(cajaInscripcion(v));
      return;
    }
    // Ya empezó y todavía no se pudo publicar (sin internet): se vuelve a
    // intentar solo; «Publicar ahora» no espera.
    if (v.rondas.length) {
      const ya = el("button", { type: "button", id: "pi-publicar-reintentar", class: C.boton }, tx("publicarAhora"));
      ya.addEventListener("click", () => publicarSolo(estado.id, true));
      caja.append(el("p", { class: "text-sm font-semibold", role: "status", texto: tx("publicarSoloPendiente") }), el("div", { class: "mt-3" }, ya));
      return;
    }
    // Sin jugadores todavía: se publica como anuncio (con la fecha de la
    // ficha Torneo), y la inscripción previa se abre después de publicarlo.
    const anuncio = !v.jugadores.length;
    if (anuncio) caja.append(el("p", { class: "text-sm mb-1", texto: tx("anuncioAyuda") }), camposAnuncio(v));
    const permiso = el("input", { type: "checkbox", id: "pi-publicar-permiso", class: "mt-1" });
    caja.append(el("div", { class: "flex items-start gap-2 text-sm mt-3" }, permiso,
      el("label", { for: "pi-publicar-permiso" }, tx("publicarPermiso") + " ",
        el("a", { href: "privacidad.html#torneos", target: "_blank", rel: "noopener", class: "underline underline-offset-2 hover:no-underline", texto: tx("politicaPrivacidad") }), ".")));
    const sinPermiso = () => { if (permiso.checked) return false; Avisos.avisar(tx("publicarFaltaPermiso"), { tipo: "error" }); permiso.focus(); return true; };
    const uno = el("button", { type: "button", id: "pi-publicar-uno", class: C.boton }, tx(anuncio ? "publicarAnuncio" : "publicarUno"));
    uno.addEventListener("click", () => {
      if (sinPermiso()) return;
      if (anuncio && !t().fechaInicio) { Avisos.avisar(tx("anuncioSinFecha"), { tipo: "error" }); return; }
      if (anuncio) t().anuncio = t().anuncio || { hora: "", contacto: "", texto: "" };
      publicarTorneos([t()], uno);
    });
    const fila = el("div", { class: "mt-3 flex flex-wrap gap-2" }, uno);
    const delEvento = v.evento ? torneosDelEvento().filter((x) => x.jugadores.length) : [];
    if (delEvento.length > 1) {
      const todos = el("button", { type: "button", id: "pi-publicar-evento", class: C.botonSec }, tx("publicarEvento", { n: delEvento.length }));
      todos.addEventListener("click", () => { if (!sinPermiso()) publicarTorneos(torneosDelEvento().filter((x) => x.jugadores.length), todos); });
      fila.append(todos);
    }
    caja.append(fila);
  }

  Object.assign(Pagina, { pintarInscripcionCelular, programarPublicacion, publicarSolo, organizacion,
    pintarOrganizacion, enlaceOrganizacion, pintarPublicar });
})();

/*! rev bfb5bbb0d2d82f9f */
