/* ===== Pareo Integral — la página (pareo.html): el enlace en vivo y compartir =====
 *
 * El evento en vivo desde el celular (y su QR), la lectura del enlace de solo lectura y en vivo del
 * torneo, y compartir por WhatsApp.
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
  const { E, V, C, leer, escribir, $, el, tx, estado, nuevoCodigoVivo, guardar, t, jugador, nombreDe,
    rondasCompletas, hasta, torneosDelEvento, CLAVE_HORARIO } = Pagina;

  // ---------- El evento en vivo, desde el celular ----------
  // El mismo canal de Supabase Realtime en modo Broadcast que el de un torneo
  // («El canal en vivo»), con todos los torneos del evento. El código queda
  // guardado por evento: el QR impreso sirve todo el día. Quien abre el
  // enlace pide el estado al entrar («pedir»), así no espera al próximo
  // resultado.
  const CLAVE_VIVO_EVENTO = "pareo_evento_vivo_v1_";
  async function prenderEventoVivo(ev) {
    try { await PareoVer.cargarSupabase(); }
    catch (e) { Avisos.avisar(tx("errorEnVivo", { e: e.message }), { tipo: "error" }); return false; }
    apagarEventoVivo();
    let codigo = leer(CLAVE_VIVO_EVENTO + ev.id);
    if (!codigo) { codigo = nuevoCodigoVivo(); escribir(CLAVE_VIVO_EVENTO + ev.id, codigo); }
    const canal = window.sb.channel("pareo-evento-" + codigo);
    estado.eventoVivo = { id: ev.id, codigo, canal };
    canal.on("broadcast", { event: "pedir" }, () => difundirEvento());
    canal.subscribe((st) => { if (st === "SUBSCRIBED") difundirEvento(); });
    return true;
  }
  function apagarEventoVivo() {
    if (estado.eventoVivo) { estado.eventoVivo.canal.unsubscribe(); estado.eventoVivo = null; }
  }
  function difundirEvento() {
    const x = estado.eventoVivo;
    if (!x) return;
    const lista = torneosDelEvento(x.id);
    if (!lista.length) return;
    // Las horas de cada ronda van solo si quien organiza puso el horario.
    const inicio = leer(CLAVE_HORARIO + x.id);
    const horario = inicio ? V.horario(lista, inicio, leer(CLAVE_HORARIO + x.id + "_descanso") || "10") : null;
    PareoVer.paraMandar(V.vistaEvento(lista[0].evento, lista, horario)).then((payload) => x.canal.send({ type: "broadcast", event: "estado", payload }));
  }
  // `pre`: el prefijo de los ids (la ficha Archivos y la ficha Torneo lo
  // muestran a la vez en la página).
  async function mostrarQrEvento(cont, pre) {
    pre = pre || "pi-evento";
    const url = location.origin + location.pathname + "#evento=" + estado.eventoVivo.codigo;
    try {
      await PareoQr.cargar();
      const copiar = el("button", { type: "button", class: C.mini }, tx("copiarEnlace"));
      copiar.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(url); Avisos.avisar(tx("enlaceCopiado")); }
        catch (e) { Avisos.avisar(tx("noCopia"), { tipo: "error" }); }
      });
      cont.replaceChildren(el("div", { class: "w-48 bg-white p-2 rounded-lg" }, PareoQr.svg(url, tx("qrEtiqueta"))),
        el("p", { id: pre + "-url", class: "text-xs break-all mt-2 font-mono", texto: url }), el("div", { class: "mt-1 flex flex-wrap gap-2" }, copiar,
          el("a", { id: pre + "-proyectar", href: url + "&proyectar", target: "_blank", rel: "noopener", class: C.mini }, tx("eventoProyectar"))),
        el("p", { class: C.nota + " mt-1", texto: tx("eventoVivoActivo") }));
    } catch (e) {
      Avisos.avisar(tx("errorQr", { e: e.message }), { tipo: "error" });
    }
  }

  // La misma «foto» para los dos caminos (el enlace del momento y la
  // difusión en vivo): la ronda r y la clasificación de ahora, con los
  // mismos datos que ya pintó la pantalla (filasFiltradas(), E.clasificacion()).
  function datosLecturaActual(r) {
    const v = t();
    const R = v.rondas[r];
    // Sin rondas todavía: va la lista de inscritos (V.inscritosVista).
    if (!R) return { v: 1, nombre: v.nombre || "", ronda: null, hasta: 0, clasificacion: [], ...V.inscritosVista(v),
      evento: enlacesDelEvento(v), pub: v.publicado && v.publicado.id ? v.publicado.id : undefined };
    const k = rondasCompletas();
    const filas = Pagina.filasFiltradas(E.clasificacion(hasta(k), v.desempates));
    return {
      v: 1,
      nombre: v.nombre || "",
      ronda: { n: r + 1, mesas: R.mesas.map((m, i) => Object.assign({ m: i + 1, f: V.mesaFisica(v, i), b: nombreDe(m.b), n: m.n == null ? null : nombreDe(m.n), r: m.r || null }, V.tablerosVista(v, m))) },
      // Las rondas terminadas que cuenta la clasificación: con la ronda en
      // juego, todavía no la suma, y quien mira lo tiene que saber.
      hasta: k,
      clasificacion: filas.map((f) => Object.assign({ p: f.puesto, n: jugador(f.id).nombre, pts: f.puntos }, E.esDeEquipos(v) ? { pt: E.puntosTablero(v, f.id, k) } : {})),
      ...V.mejoresVista(v, k),
      evento: enlacesDelEvento(v),
      pub: v.publicado && v.publicado.id ? v.publicado.id : undefined,
    };
  }

  // Los otros torneos del mismo evento, para pasar a ellos desde el celular:
  // el enlace del evento en vivo (que tiene a todos) abierto en cada uno.
  // Solo si el evento está en vivo desde esta pestaña: si no, el enlace
  // llevaría a una página que espera y no le llega nada.
  function enlacesDelEvento(v) {
    if (!v.evento || !estado.eventoVivo || estado.eventoVivo.id !== v.evento.id) return undefined;
    // Va el código, no la dirección: el celular la arma él (lo que llega por
    // el canal no se pone tal cual en un enlace).
    return { nombre: v.evento.nombre || "", codigo: estado.eventoVivo.codigo, este: V.nombreTorneo(v), torneos: torneosDelEvento(v.evento.id).map((y) => V.nombreTorneo(y)) };
  }

  // Un canal de Supabase Realtime en modo Broadcast: efímero, sin tabla y sin
  // RLS (no hay fila que proteger), público por default en este proyecto —
  // la única manera de que otro aparato reciba algo sin que Pareo Integral
  // tenga cuenta ni servidor propio de datos. Ver «El canal en vivo» en
  // docs/decisiones/juegos-y-torneos.md.
  function difundirEnVivo() {
    const v = t();
    // Antes de la ronda 1 también: se ven los inscritos.
    if (!estado.enVivo || !estado.canalVivo) return;
    const canal = estado.canalVivo;
    PareoVer.paraMandar(datosLecturaActual(Math.max(0, v.rondas.length - 1))).then((payload) => canal.send({ type: "broadcast", event: "estado", payload }));
  }

  async function activarEnVivo() {
    const v = t();
    const estadoTxt = $("pi-ver-en-vivo-estado");
    estadoTxt.hidden = false;
    estadoTxt.textContent = tx("conectandoEnVivo");
    try {
      await PareoVer.cargarSupabase();
    } catch (e) {
      estadoTxt.textContent = tx("errorEnVivo", { e: e.message });
      $("pi-ver-en-vivo").checked = false;
      return false;
    }
    if (!v.liveCodigo) { v.liveCodigo = nuevoCodigoVivo(); guardar(); }
    // Un torneo de un evento: el evento se pone en vivo también, así quien
    // mira este torneo puede pasar a los demás (enlacesDelEvento).
    if (v.evento && !estado.eventoVivo) await prenderEventoVivo(v.evento);
    estado.canalVivo = window.sb.channel("pareo-vivo-" + v.liveCodigo);
    // Quien abre el enlace pide el estado al entrar: así no espera al
    // próximo cambio (antes de la ronda 1 puede tardar mucho).
    estado.canalVivo.on("broadcast", { event: "pedir" }, () => difundirEnVivo());
    estado.canalVivo.subscribe((st) => { if (st === "SUBSCRIBED") difundirEnVivo(); });
    estado.enVivo = true;
    estadoTxt.textContent = tx("enVivoActivo");
    $("pi-ver-en-vivo-nuevo-codigo").hidden = false;
    difundirEnVivo();
    return true;
  }

  function desactivarEnVivo() {
    if (estado.canalVivo) { estado.canalVivo.unsubscribe(); estado.canalVivo = null; }
    estado.enVivo = false;
    const estadoTxt = $("pi-ver-en-vivo-estado");
    if (estadoTxt) estadoTxt.hidden = true;
    const nuevoCodigo = $("pi-ver-en-vivo-nuevo-codigo");
    if (nuevoCodigo) nuevoCodigo.hidden = true;
  }

  // Una «foto» de esta ronda y la clasificación de ahora, para ver desde el
  // celular sin tocar nada (ver «El enlace y el QR de solo lectura» en
  // docs/decisiones/juegos-y-torneos.md): nada se manda a ningún servidor,
  // los datos viajan comprimidos en la URL (de la mano a la cámara que la
  // lee, nunca por internet). Con «Actualizar sola» marcado, en vez de los
  // datos el enlace lleva el código del canal en vivo (`#vivo=`), y cada
  // `guardar()` manda la foto de nuevo mientras esta pestaña quede abierta.
  async function compartirLectura(r) {
    const v = t();
    const caja = $("pi-ver-compartir");
    const qrCont = $("pi-ver-qr");
    const dirTexto = $("pi-ver-direccion");
    caja.hidden = false;
    qrCont.replaceChildren();
    dirTexto.textContent = tx("generandoQr");
    try {
      const url = estado.enVivo
        ? location.origin + location.pathname + "#vivo=" + v.liveCodigo
        : location.origin + location.pathname + "#ver=" + await PareoVer.empaquetar(datosLecturaActual(r));
      await PareoQr.cargar();
      qrCont.replaceChildren(PareoQr.svg(url, tx("qrEtiqueta")));
      dirTexto.textContent = url;
    } catch (e) {
      dirTexto.textContent = "";
      Avisos.avisar(tx("errorQr", { e: e.message }), { tipo: "error" });
    }
  }

  // ---------- Compartir por WhatsApp ----------
  // El texto armado (js/pareo/compartir.js) en un cuadro para revisarlo,
  // con «Abrir WhatsApp» (wa.me: quien lo manda elige a quién) y «Copiar».
  // Si el torneo está en vivo, el mensaje lleva el enlace.
  function enlaceVivoActual() {
    const v = t();
    const base = location.origin + location.pathname;
    if (estado.eventoVivo && v.evento && v.evento.id === estado.eventoVivo.id) return base + "#evento=" + estado.eventoVivo.codigo;
    if (estado.enVivo && v.liveCodigo) return base + "#vivo=" + v.liveCodigo;
    return "";
  }
  function abrirCompartir(caja, boton, texto) {
    const abierto = !caja.hidden && caja.dataset.para === boton.id;
    caja.replaceChildren();
    for (const b of document.querySelectorAll("[aria-controls='" + caja.id + "']")) b.setAttribute("aria-expanded", "false");
    if (abierto) { caja.hidden = true; return; }
    caja.dataset.para = boton.id;
    const area = el("textarea", { id: caja.id + "-texto", class: C.campo + " font-mono text-xs", rows: "10", readonly: true });
    area.value = texto;
    const copiar = el("button", { type: "button", class: C.botonSec }, tx("whatsappCopiar"));
    copiar.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(texto); Avisos.avisar(tx("whatsappCopiado")); }
      catch (e) { area.focus(); area.select(); Avisos.avisar(tx("whatsappSeleccionado"), { tipo: "info" }); }
    });
    caja.append(el("div", { class: "pi-revisar mb-4" },
      el("label", { for: area.id, class: "block text-sm font-semibold mb-1", texto: tx("whatsappTexto") }), area,
      el("div", { class: "mt-2 flex flex-wrap gap-2" },
        el("a", { href: PareoCompartir.enlaceWhatsapp(texto), target: "_blank", rel: "noopener", class: C.boton, "data-whatsapp": "" }, tx("whatsappAbrir")),
        copiar)));
    caja.hidden = false;
    boton.setAttribute("aria-expanded", "true");
    area.focus();
  }

  Object.assign(Pagina, { CLAVE_VIVO_EVENTO, prenderEventoVivo, apagarEventoVivo, difundirEvento,
    mostrarQrEvento, difundirEnVivo, activarEnVivo, desactivarEnVivo, compartirLectura, enlaceVivoActual,
    abrirCompartir });
})();

/*! rev bfb5bbb0d2d82f9f */
