/* ===== Pareo Integral — la página (pareo.html): los árbitros adjuntos y los capitanes =====
 *
 * Los adjuntos que anotan desde el celular (el canal, la cola en la base, lo que mandan), el chat y
 * las llamadas con ellos, sus notas y discrepancias, y los capitanes que confirman la alineación.
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
  const { E, V, PREFIJO, C, leer, escribir, leerJSON, $, el, tx, estado, nuevoCodigoVivo, nuevoId, guardar, t,
    jugador, nombreDe, retirosAuto, avisarRetiros, CLAVE_HORARIO, pintarRondas, horaCR, textoIncidencia,
    anotarCorreccion } = Pagina;

  // ---------- Los árbitros adjuntos anotan desde el celular ----------
  // Un enlace por adjunto, cada uno con su código y sus mesas
  // (#adjunto=<código>&m=1-10), guardados en el torneo (`adjuntos`): si se
  // pierde un celular, ese enlace se apaga sin tocar los demás. Por el mismo
  // canal de Supabase Realtime en modo Broadcast que el enlace en vivo, el
  // adjunto pide la ronda («pedir») y manda cada resultado («resultado»).
  // Esta pestaña, la del árbitro principal, es la que decide: solo acepta un
  // resultado de la última ronda, de una mesa de su rango, que todavía no lo
  // tiene —nunca pisa lo que ya está— y de la lista; lo marca «lo anotó el
  // adjunto». En equipos, tablero por tablero. Mientras esta pestaña esté
  // abierta.
  const RESULTADOS_VALIDOS = new Set(["1-0", "=", "0-1", "+-", "-+", "--"]);
  async function enlaceAdjunto(r) {
    const v = t();
    const total = v.rondas[r].mesas.length;
    const res = await Avisos.formulario({ titulo: tx("adjuntoTitulo"), texto: tx("adjuntoTexto"), aceptar: tx("adjuntoCrear"), cancelar: tx("cancelar"),
      campos: [{ nombre: "arbitro", etiqueta: tx("adjuntoNombre"), valor: "", max: 60 },
        { nombre: "desde", etiqueta: tx("adjuntoDesde"), valor: "1", inputmode: "numeric" }, { nombre: "hasta", etiqueta: tx("adjuntoHasta"), valor: String(total), inputmode: "numeric" }] });
    if (!res || t() !== v) return;
    const arbitro = String(res.arbitro || "").trim().slice(0, 60);
    if (!arbitro) { Avisos.avisar(tx("adjuntoFaltaNombre"), { tipo: "error" }); return; }
    const desde = Math.max(1, Math.round(Number(res.desde)) || 1), hasta = Math.min(total, Math.round(Number(res.hasta)) || total);
    if (desde > hasta) { Avisos.avisar(tx("adjuntoRango"), { tipo: "error" }); return; }
    v.adjuntos = (v.adjuntos || []).concat({ codigo: nuevoCodigoVivo(), rango: desde + "-" + hasta, activo: true, nombre: arbitro });
    guardar();
    sincronizarAdjuntos(v);
    await conectarAdjuntos();
    pintarRondas();
  }
  async function conectarAdjuntos() {
    const v = t();
    const activos = (v.adjuntos || []).filter((a) => a.activo);
    if (!estado.adjuntos || estado.adjuntos.idTorneo !== estado.id) {
      if (!activos.length && !v.publicado) return true;
      desconectarAdjuntos();
      estado.adjuntos = { idTorneo: estado.id, canales: new Map() };
    }
    if (activos.length) {
      try { await PareoVer.cargarSupabase(); }
      catch (e) { Avisos.avisar(tx("errorEnVivo", { e: e.message }), { tipo: "error" }); return false; }
    }
    for (const a of activos) {
      if (estado.adjuntos.canales.has(a.codigo)) continue;
      const canal = window.sb.channel("pareo-adjunto-" + a.codigo);
      canal.on("broadcast", { event: "pedir" }, () => enviarAdjunto(a.codigo));
      canal.on("broadcast", { event: "resultado" }, (msg) => recibirDeAdjunto(a.codigo, msg.payload || {}));
      canal.on("broadcast", { event: "nota" }, (msg) => recibirNotaDeAdjunto(a.codigo, msg.payload || {}));
      canal.on("broadcast", { event: "chat" }, (msg) => recibirChatDeAdjunto(a.codigo, msg.payload || {}));
      canal.on("broadcast", { event: "llamada" }, (msg) => recibirLlamada(a.codigo, msg.payload || {}));
      // «Te dejé algo en la base»: se lee la cola ya, sin esperar la vuelta.
      canal.on("broadcast", { event: "cola" }, () => leerCola());
      canal.subscribe((st) => { if (st === "SUBSCRIBED") enviarAdjunto(a.codigo); });
      estado.adjuntos.canales.set(a.codigo, canal);
    }
    // Los apagados: se les avisa y se corta su canal.
    for (const [c, canal] of estado.adjuntos.canales) {
      if (activos.some((a) => a.codigo === c)) continue;
      canal.send({ type: "broadcast", event: "estado", payload: { apagado: true } });
      canal.unsubscribe();
      estado.adjuntos.canales.delete(c);
    }
    // La cola se lee cada 5 s en un evento de la Mesa, cada 15 s con adjuntos
    // propios y, si no hay ni lo uno ni lo otro, cada minuto (por si la
    // organización vincula el torneo con esta pestaña abierta). Lo ajusta leerCola.
    cadaCola(estado.adjuntos.mesa ? ESPERA_COLA_MESA : activos.length ? ESPERA_COLA : ESPERA_COLA_LENTA);
    leerCola();
    escucharCola(v);
    return true;
  }
  // El toque de la Mesa del árbitro: cuando un árbitro de la Mesa deja algo en
  // la cola, la Edge Function centroamericano-mesa toca el canal
  // `pareo-cola-<id publicado>` (sin el dato) y esta pestaña la lee en el
  // momento, en vez de esperar su vuelta. Si el toque no llega, la vuelta
  // sigue. Ver «El resultado de la mesa, al público al instante».
  async function escucharCola(v) {
    const id = v && v.publicado && v.publicado.id;
    if (!estado.adjuntos || !id || estado.adjuntos.canalCola) return;
    estado.adjuntos.canalCola = "abriendo";
    try { await PareoVer.cargarSupabase(); }
    catch (e) { if (estado.adjuntos) estado.adjuntos.canalCola = null; return; }
    if (!estado.adjuntos || estado.adjuntos.canalCola !== "abriendo") return;
    const canal = window.sb.channel("pareo-cola-" + id);
    canal.on("broadcast", { event: "cola" }, () => leerCola());
    canal.subscribe();
    estado.adjuntos.canalCola = canal;
  }
  function desconectarAdjuntos() {
    if (estado.adjuntos) {
      for (const canal of estado.adjuntos.canales.values()) canal.unsubscribe();
      if (estado.adjuntos.canalCola && estado.adjuntos.canalCola.unsubscribe) estado.adjuntos.canalCola.unsubscribe();
      clearInterval(estado.adjuntos.reloj);
    }
    estado.adjuntos = null;
  }
  // ---------- Lo que los adjuntos dejan en la base ----------
  // Cada resultado o incidencia que manda un adjunto queda primero en la
  // base (pareo_cola, por la Edge Function pareo-publicar con su código),
  // así que nada se pierde si esta pestaña estaba cerrada o sin internet.
  // Esta pestaña la lee —al abrir el torneo, con el toque «cola» del canal y
  // cada 15 segundos—, la pasa en orden por las MISMAS reglas de siempre
  // (recibirDeAdjunto, recibirNotaDeAdjunto) y la borra de la base. Necesita
  // el torneo publicado: es su clave la que la lee. Ver «Pareo Integral: lo
  // que anotan los adjuntos queda en la base».
  // En un evento de la Mesa del árbitro, cada 5 s: lo que guarda un árbitro
  // en su tablet tiene que llegar pronto a las demás (ver «El resultado del
  // principal llega solo a las tablets»). Leer la cola no pasa por el freno.
  const ESPERA_COLA = 15000, ESPERA_COLA_LENTA = 60000, ESPERA_COLA_MESA = 5000;
  function cadaCola(ms) {
    if (!estado.adjuntos || estado.adjuntos.cada === ms) return;
    clearInterval(estado.adjuntos.reloj);
    estado.adjuntos.cada = ms;
    estado.adjuntos.reloj = setInterval(leerCola, ms);
  }
  // Una fila de un árbitro de la Mesa del árbitro (asignacion_id): un adjunto
  // «virtual» con su nombre y su rango (en índices de Pareo), que la función
  // ya comprobó. SOLO sale de una fila de la cola, leída con la clave del
  // torneo: un mensaje del canal en vivo nunca lo trae (ver «La Mesa del
  // árbitro con torneos de Pareo Integral»).
  const adjuntoDeMesa = (x) => ({ codigo: "a:" + x.asignacion_id, nombre: String(x.nombre || "").slice(0, 80), rango: x.desde + "-" + x.hasta, activo: true, mesa: true });
  let leyendoCola = false;
  let otraVezCola = false;
  async function leerCola() {
    if (leyendoCola) { otraVezCola = true; return; }
    if (!estado.adjuntos || !window.PareoPublicar) return;
    const idT = estado.adjuntos.idTorneo;
    const v0 = torneoDelAdjunto();
    if (!v0 || !v0.publicado) return;
    leyendoCola = true;
    try {
      const r = await PareoPublicar.cola(v0.publicado);
      if (!r.ok || !Array.isArray(r.cola) || !estado.adjuntos || estado.adjuntos.idTorneo !== idT) return;
      estado.adjuntos.vistos = new Map((r.vistos || []).map((x) => [x.codigo, x.visto]));
      estado.adjuntos.mesa = !!r.mesa;
      cadaCola(r.mesa ? ESPERA_COLA_MESA : (v0.adjuntos || []).some((a) => a.activo) ? ESPERA_COLA : ESPERA_COLA_LENTA);
      let ultimo = 0;
      for (const x of r.cola) {
        if (!estado.adjuntos || estado.adjuntos.idTorneo !== idT) break;
        const d = Object.assign({}, x.datos || {}, { ronda: x.ronda });
        const virtual = x.asignacion_id && Number(x.desde) >= 1 && Number(x.hasta) >= Number(x.desde) ? adjuntoDeMesa(x) : null;
        const quien = virtual ? virtual.codigo : x.codigo;
        if (x.evento === "resultado") recibirDeAdjunto(quien, d, virtual);
        else if (x.evento === "nota") recibirNotaDeAdjunto(quien, d, virtual);
        ultimo = x.id;
      }
      if (ultimo) await PareoPublicar.colaBorrar(v0.publicado, ultimo);
    } finally {
      leyendoCola = false;
      // Un toque que llegó mientras se leía: otra lectura, un poco después
      // (y así una ráfaga de toques no se vuelve una ráfaga de lecturas).
      if (otraVezCola) { otraVezCola = false; setTimeout(leerCola, 1500); }
    }
  }
  // La lista de enlaces de adjunto, a la base apenas cambia (sin esperar los
  // 5 segundos de la publicación): un enlace nuevo ya anota por la base.
  function sincronizarAdjuntos(v) {
    if (v && v.publicado && window.PareoPublicar) PareoPublicar.adjuntos(v).catch(() => {});
  }
  const torneoDelAdjunto = () => estado.adjuntos && (estado.adjuntos.idTorneo === estado.id ? t() : leerJSON(PREFIJO + estado.adjuntos.idTorneo, null));
  const adjuntoActivo = (v, codigo) => (v.adjuntos || []).find((a) => a.codigo === codigo && a.activo);
  function enviarAdjunto(codigo) {
    const v = torneoDelAdjunto();
    const canal = estado.adjuntos && estado.adjuntos.canales.get(codigo);
    if (!v || !canal || !v.rondas.length) return;
    const R = v.rondas[v.rondas.length - 1];
    const nombre = (id) => (v.jugadores.find((j) => j.id === id) || {}).nombre || "?";
    const deEquipos = E.esDeEquipos(v);
    const integrante = (idE, idJ) => { const e = v.jugadores.find((x) => x.id === idE); const j = e && idJ && e.integrantes.find((y) => y.id === idJ); return j ? j.nombre : null; };
    // Las marcas de las incidencias y su detalle, para que el adjunto también
    // sepa quién ya tiene una ilegal; y a quién puede anotarle una.
    const marcas = V.marcasIncidencias(R);
    const marcaPara = (id) => { const mm = id && marcas.get(id); return mm ? { t: V.textoMarca(mm), d: mm.items.map(textoIncidencia), pierde: mm.ilegales >= 2 } : null; };
    const a = adjuntoActivo(v, codigo) || {};
    canal.send({ type: "broadcast", event: "estado", payload: {
      nombre: v.nombre || "", ronda: v.rondas.length,
      // Las cámaras de Notara del torneo (su código y el id publicado): el
      // adjunto ve sus mesas en vivo (js/pareo/camaras-adjunto.js). En equipos, no.
      camaras: v.camaras && v.camaras.activo && v.publicado && !deEquipos ? v.camaras.codigo : null, torneo: v.publicado ? v.publicado.id : null,
      camRetraso: (v.camaras && v.camaras.retraso) || 0,
      // Quién es él, quién es el principal, su chat y sus llamadas.
      arbitro: a.nombre || "", principal: v.arbitro || "",
      chat: chatDe(v, codigo).slice(-30).map((x) => ({ hora: x.hora, de: x.de === "principal" ? x.de : QUIEN_CHAT[x.de === codigo], nombre: x.nombre, texto: x.texto })),
      llamadas: (v.llamadas || []).filter((x) => x.codigo === codigo).slice(-5).map((x) => ({ hora: x.hora, mesa: x.mesa, atendida: x.atendida || null })),
      mesas: R.mesas.map((m, i) => {
        const x = { m: i + 1, f: V.mesaFisica(v, i), b: nombre(m.b), n: m.n == null ? null : nombre(m.n), r: m.r || null, mia: !!m.r && m.adjunto === codigo,
          mb: marcaPara(m.b), mn: m.n == null ? null : marcaPara(m.n), quien: jugadoresDeMesa(v, m).map(([k, , etiqueta]) => ({ k, e: etiqueta })) };
        if (deEquipos && m.n != null) {
          // Sin tocar lo guardado: una copia con la alineación de entrada.
          const copia = m.alineacion ? m : E.prepararMesa(v, JSON.parse(JSON.stringify(m)));
          x.tableros = E.tablerosDe(v, copia).map((k) => ({ t: k.k + 1, b: integrante(k.bBlancas ? m.b : m.n, k.blancas), n: integrante(k.bBlancas ? m.n : m.b, k.negras), r: k.r || null, fijo: k.fijo,
            mb: marcaPara(k.blancas), mn: marcaPara(k.negras) }));
        }
        return x;
      }),
    } });
  }
  function enviarAdjuntos() { if (estado.adjuntos) for (const c of estado.adjuntos.canales.keys()) enviarAdjunto(c); }
  // `virtual`: un árbitro de la Mesa del árbitro, solo desde leerCola (los
  // manejadores del canal nunca lo pasan).
  function recibirDeAdjunto(codigo, p, virtual) {
    const v = torneoDelAdjunto();
    const a = v && (virtual || adjuntoActivo(v, codigo));
    if (!a) return;
    const [desde, hasta] = a.rango.split("-").map(Number);
    const mesa = Number(p.mesa);
    const R = v.rondas[v.rondas.length - 1];
    const m = R && R.mesas[mesa - 1];
    const rechazar = () => enviarAdjunto(codigo);
    // Solo la última ronda, una mesa de su rango con rival, un resultado válido.
    if (!m || mesa < desde || mesa > hasta || Number(p.ronda) !== v.rondas.length || m.n == null || !RESULTADOS_VALIDOS.has(p.r)) return rechazar();
    let texto;
    if (E.esDeEquipos(v)) {
      E.prepararMesa(v, m);
      const k = Number(p.tablero) - 1;
      const x = E.tablerosDe(v, m)[k];
      if (x && !x.fijo && x.r && x.r !== p.r) anotarDiscrepancia(v, R, { mesa, tablero: k + 1, r: p.r, ya: x.r });
      if (!x || x.fijo || x.r || E.puntosDelEncuentro(v, m).incomparecencia) return rechazar();
      m.partidas[k].r = p.r;
      m.r = E.resultadoEncuentro(v, m);
      texto = tx("adjuntoLlegoTablero", { m: mesa, t: k + 1, r: tx("corto_" + p.r) });
    } else {
      // Corregir el que él mismo anotó (lo confirmó en su celular): sí, y
      // queda la constancia en las incidencias. Lo que anotó otro, nunca se
      // pisa: queda para que el principal lo confirme.
      const suya = !!m.r && !!p.corrige && m.adjunto === codigo;
      if (m.r && !suya) { if (m.r !== p.r) anotarDiscrepancia(v, R, { mesa, r: p.r, ya: m.r }); return rechazar(); }
      if (suya && m.r === p.r) return rechazar();
      const antes = m.r;
      m.r = p.r;
      if (suya) anotarCorreccion(R, mesa - 1, antes, p.r, tx("correccionAdjunto", { n: a.nombre || "—" }));
      texto = tx(suya ? "adjuntoCorrigio" : "adjuntoLlego", { m: mesa, r: tx("corto_" + p.r), n: a.nombre || "—" });
    }
    m.porAdjunto = a.nombre || true;
    m.adjunto = codigo;
    if (v === t()) { guardar(); if (estado.ficha === "rondas" && estado.ronda === v.rondas.length - 1) pintarRondas(); }
    else { avisarRetiros(v, retirosAuto(v)); escribir(PREFIJO + estado.adjuntos.idTorneo, JSON.stringify(v)); }
    Avisos.avisar(texto, { tipo: "info" });
    enviarAdjunto(codigo);
  }

  // ---------- El chat con los adjuntos y sus llamadas ----------
  // Los mensajes van con el torneo (`chat`, los últimos 300): a todos o a un
  // adjunto, y de cada adjunto al principal. Llegan por el mismo canal del
  // adjunto, con el estado (`enviarAdjunto`). Una llamada («Te necesitan en
  // la mesa X») queda en `llamadas` hasta que el principal toca «Voy».
  const QUIEN_CHAT = { true: "yo", false: "otro" };
  const chatDe = (v, codigo) => (v.chat || []).filter((x) => x.para === "todos" || x.para === codigo || x.de === codigo);
  function guardarDelAdjunto(v) {
    if (v === t()) guardar();
    else { escribir(PREFIJO + estado.adjuntos.idTorneo, JSON.stringify(v)); enviarAdjuntos(); }
  }
  function agregarChat(v, x) { v.chat = (v.chat || []).concat(Object.assign({ hora: Date.now() }, x)).slice(-300); }
  function recibirChatDeAdjunto(codigo, p) {
    const v = torneoDelAdjunto();
    const a = v && adjuntoActivo(v, codigo);
    const texto = typeof p.texto === "string" ? p.texto.trim().slice(0, 300) : "";
    if (!a || !texto) return;
    agregarChat(v, { de: codigo, nombre: a.nombre || "", para: "principal", texto });
    guardarDelAdjunto(v);
    Avisos.avisar(tx("chatLlego", { n: a.nombre || a.rango, t: texto }), { tipo: "info" });
    pintarChat();
  }
  function recibirLlamada(codigo, p) {
    const v = torneoDelAdjunto();
    const a = v && adjuntoActivo(v, codigo);
    if (!a || !v.rondas.length) return;
    const [desde, hasta] = a.rango.split("-").map(Number);
    const mesa = Number(p.mesa);
    if (!(mesa >= desde && mesa <= hasta)) return;
    v.llamadas = (v.llamadas || []).concat({ id: nuevoId(), hora: Date.now(), codigo, nombre: a.nombre || "", mesa, ronda: v.rondas.length }).slice(-100);
    guardarDelAdjunto(v);
    Avisos.avisar(tx("llamadaLlego", { n: a.nombre || a.rango, m: V.mesaFisica(v, mesa - 1) }), { tipo: "error" });
    pintarLlamadas();
  }
  // Las llamadas sin atender, arriba de la ronda, con «Voy» (que se lo dice
  // al adjunto también por el chat).
  function pintarLlamadas() {
    const caja = $("pi-llamadas");
    if (!caja) return;
    const v = t();
    const pendientes = (v.llamadas || []).filter((x) => !x.atendida);
    caja.replaceChildren();
    caja.hidden = !pendientes.length;
    if (!pendientes.length) return;
    caja.append(el("h3", { id: "pi-llamadas-titulo", class: "font-semibold" }, el("span", { "aria-hidden": "true", texto: "🔔 " }), tx("llamadasTitulo")),
      el("ul", { class: "mt-2 space-y-2 text-sm" }, pendientes.map((x) => el("li", { class: "flex flex-wrap items-center gap-2", "data-llamada": x.id },
        el("span", { class: "font-semibold", texto: tx("llamadaFila", { n: x.nombre || "—", m: V.mesaFisica(v, x.mesa - 1), h: horaCR(x.hora) }) }),
        el("button", { type: "button", class: C.boton + " px-3 py-1", "data-voy": x.id, onclick: () => {
          x.atendida = Date.now();
          agregarChat(v, { de: "principal", nombre: v.arbitro || tx("principal"), para: x.codigo, texto: tx("voyMesa", { m: V.mesaFisica(v, x.mesa - 1) }) });
          guardar();
          pintarLlamadas();
          pintarChat();
        } }, tx("voy"))))));
  }
  // El chat del principal: a todos los adjuntos o a uno.
  function pintarChat() {
    const caja = $("pi-chat-adjuntos");
    if (!caja) return;
    const v = t();
    const activos = (v.adjuntos || []).filter((a) => a.activo);
    caja.hidden = !activos.length;
    if (!activos.length) { caja.replaceChildren(); return; }
    const nombreDe = (c) => ((v.adjuntos || []).find((a) => a.codigo === c) || {}).nombre || c;
    const lista = el("ol", { id: "pi-chat-lista", class: "mt-2 space-y-1 text-sm max-h-64 overflow-y-auto", "aria-live": "polite" },
      (v.chat || []).slice(-50).map((x) => el("li", { class: x.de === "principal" ? "pi-chat-mio" : "" },
        el("span", { class: "text-xs " + C.nota, texto: horaCR(x.hora) + " · " }),
        el("span", { class: "font-semibold", texto: (x.de === "principal" ? tx("chatYo") + (x.para === "todos" ? " → " + tx("chatTodos") : " → " + nombreDe(x.para)) : x.nombre || nombreDe(x.de)) + ": " }),
        el("span", { texto: x.texto }))));
    const para = el("select", { id: "pi-chat-para", class: C.campoChico, "aria-label": tx("chatPara") },
      el("option", { value: "todos", texto: tx("chatTodos") }), activos.map((a) => el("option", { value: a.codigo, texto: a.nombre || a.rango })));
    if (caja.__para) para.value = caja.__para;
    para.addEventListener("change", () => { caja.__para = para.value; });
    const texto = el("input", { id: "pi-chat-texto", type: "text", maxlength: "300", autocomplete: "off", class: C.campo, "aria-label": tx("chatEscribe") });
    const mandar = el("button", { type: "submit", id: "pi-chat-mandar", class: C.botonSec }, tx("chatMandar"));
    const form = el("form", { class: "mt-2 flex flex-wrap items-center gap-2" }, para, texto, mandar);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const t2 = texto.value.trim().slice(0, 300);
      if (!t2) return;
      agregarChat(v, { de: "principal", nombre: v.arbitro || tx("principal"), para: para.value, texto: t2 });
      guardar();
      pintarChat();
      const x = $("pi-chat-texto"); if (x) x.focus();
    });
    caja.replaceChildren(el("h3", { class: "font-semibold" }, tx("chatTitulo")), lista, form);
    lista.scrollTop = lista.scrollHeight;
  }

  // Una nota de un adjunto para el informe: va a las incidencias de la
  // última ronda, con su nombre y, si la dice, la mesa (de su rango).
  function recibirNotaDeAdjunto(codigo, p, virtual) {
    const v = torneoDelAdjunto();
    const a = v && (virtual || adjuntoActivo(v, codigo));
    const R = v && v.rondas[v.rondas.length - 1];
    const texto = typeof p.texto === "string" ? p.texto.trim().slice(0, 500) : "";
    const autor = typeof p.autor === "string" ? p.autor.trim().slice(0, 60) : "";
    if (!a || !R || !texto || !autor) return;
    const [desde, hasta] = a.rango.split("-").map(Number);
    const mesa = Number(p.mesa);
    const enRango = mesa >= desde && mesa <= hasta && mesa <= R.mesas.length;
    // El tipo y el artículo, solo de las listas; el jugador, solo de su mesa
    // (por su lado: «b», «n», «t2b»… el celular no ve los ids).
    const tipo = ["reclamo", "sancion", "decision", "otra"].includes(p.tipo) ? p.tipo : "adjunto";
    const nueva = { hora: Date.now(), tipo, autor, texto, mesa: enRango ? mesa : null, porAdjunto: true };
    if (Object.prototype.hasOwnProperty.call(V.ARTICULOS, p.articulo)) nueva.articulo = p.articulo;
    const elegido = enRango && typeof p.lado === "string" ? jugadoresDeMesa(v, R.mesas[mesa - 1]).find(([k]) => k === p.lado) : null;
    if (elegido) nueva.jugador = elegido[1];
    R.incidencias = (R.incidencias || []).concat(nueva);
    if (v === t()) { guardar(); if (estado.ficha === "rondas" && estado.ronda === v.rondas.length - 1) pintarRondas(); }
    else escribir(PREFIJO + estado.adjuntos.idTorneo, JSON.stringify(v));
    Avisos.avisar(tx("notaAdjuntoLlego", { a: autor }), { tipo: "info" });
    const canal = estado.adjuntos && estado.adjuntos.canales.get(codigo);
    if (canal) canal.send({ type: "broadcast", event: "notaRecibida", payload: { hora: Date.now() } });
  }

  // Un adjunto mandó otro resultado para una mesa (o tablero) que ya estaba
  // anotada: no se pisa, pero queda para que el principal lo confirme.
  function anotarDiscrepancia(v, R, x) {
    R.discrepancias = R.discrepancias || [];
    if (R.discrepancias.some((y) => y.mesa === x.mesa && y.tablero === x.tablero && y.r === x.r && !y.resuelta)) return;
    R.discrepancias.push(Object.assign({ hora: Date.now() }, x));
    if (v === t()) { guardar(); if (estado.ficha === "rondas" && estado.ronda === v.rondas.length - 1) pintarRondas(); }
    else escribir(PREFIJO + estado.adjuntos.idTorneo, JSON.stringify(v));
    Avisos.avisar(tx("discrepanciaLlego", { m: x.mesa }), { tipo: "error" });
  }

  // Quiénes juegan en una mesa, para elegir a quién va una incidencia: en
  // individual, los dos; en equipos, cada integrante con su tablero. Con
  // la clave corta que usa el celular del adjunto («b», «n», «t2b»…).
  // El nombre de un jugador o de un integrante de un equipo, por su id.
  function nombreDeQuien(id) {
    const j = jugador(id);
    if (j) return j.nombre;
    for (const e of t().jugadores) { const y = (e.integrantes || []).find((z) => z.id === id); if (y) return y.nombre; }
    return "?";
  }
  function jugadoresDeMesa(v, m) {
    if (!m || m.n == null) return [];
    if (!E.esDeEquipos(v)) return [["b", m.b, tx("blancas") + ": " + nombreDe(m.b)], ["n", m.n, tx("negras") + ": " + nombreDe(m.n)]];
    const copia = m.alineacion ? m : E.prepararMesa(v, JSON.parse(JSON.stringify(m)));
    const out = [];
    for (const x of E.tablerosDe(v, copia)) {
      const eb = x.bBlancas ? m.b : m.n, en = x.bBlancas ? m.n : m.b;
      const nom = (idE, idJ) => ((jugador(idE) || { integrantes: [] }).integrantes.find((y) => y.id === idJ) || {}).nombre;
      if (x.blancas) out.push(["t" + (x.k + 1) + "b", x.blancas, tx("tableroN", { t: x.k + 1 }) + " · " + tx("blancas") + ": " + nom(eb, x.blancas)]);
      if (x.negras) out.push(["t" + (x.k + 1) + "n", x.negras, tx("tableroN", { t: x.k + 1 }) + " · " + tx("negras") + ": " + nom(en, x.negras)]);
    }
    return out;
  }

  // ---------- Los capitanes confirman la alineación desde su celular ----------
  // Un enlace por equipo (#capitan=<código>), guardado en el torneo
  // (`capitanes`: { idEquipo: código }). El capitán marca a los que juegan y
  // lo manda; esta pestaña lo acepta solo en la última ronda, si su
  // encuentro todavía no tiene ningún tablero anotado, y si todos son de su
  // equipo (hasta 4, en el orden de tableros). Queda dicho en el encuentro.
  function asegurarCapitanes() {
    const v = t();
    v.capitanes = v.capitanes || {};
    for (const e of v.jugadores) if (!v.capitanes[e.id]) v.capitanes[e.id] = nuevoCodigoVivo();
  }
  async function conectarCapitanes() {
    const v = t();
    const codigos = Object.entries(v.capitanes || {});
    if (!codigos.length) return true;
    if (estado.capitanes && estado.capitanes.idTorneo !== estado.id) desconectarCapitanes();
    if (!estado.capitanes) estado.capitanes = { idTorneo: estado.id, canales: new Map() };
    try { await PareoVer.cargarSupabase(); }
    catch (e) { Avisos.avisar(tx("errorEnVivo", { e: e.message }), { tipo: "error" }); return false; }
    for (const [idE, codigo] of codigos) {
      if (estado.capitanes.canales.has(codigo)) continue;
      const canal = window.sb.channel("pareo-capitan-" + codigo);
      canal.on("broadcast", { event: "pedir" }, () => enviarCapitan(codigo));
      canal.on("broadcast", { event: "alineacion" }, (msg) => recibirDeCapitan(codigo, msg.payload || {}));
      canal.subscribe((st) => { if (st === "SUBSCRIBED") enviarCapitan(codigo); });
      estado.capitanes.canales.set(codigo, { canal, idE });
    }
    return true;
  }
  function desconectarCapitanes() {
    if (estado.capitanes) for (const x of estado.capitanes.canales.values()) x.canal.unsubscribe();
    estado.capitanes = null;
  }
  const torneoDeCapitanes = () => estado.capitanes && (estado.capitanes.idTorneo === estado.id ? t() : leerJSON(PREFIJO + estado.capitanes.idTorneo, null));
  // El encuentro del equipo en la última ronda y de qué lado está.
  function encuentroDe(v, idE) {
    const R = v.rondas[v.rondas.length - 1];
    const m = R && R.mesas.find((x) => x.b === idE || x.n === idE);
    return m ? { m, lado: "bn"[m.b === idE ? 0 : 1] } : null;
  }
  // Hasta cuándo cambian los capitanes la alineación (lo elige el árbitro en
  // la ficha Torneo: `v.plazoAlineacion`, minutos antes de la ronda). La hora
  // de la ronda sale del horario del evento (Archivos, «Horario del día») y,
  // sin él, de cuando se echó a andar el reloj de la ronda. Sin plazo o sin
  // hora: hasta que se anote el primer tablero, como antes. En milisegundos.
  function inicioDeRonda(v, r) {
    const ev = v.evento;
    const inicio = ev ? leer(CLAVE_HORARIO + ev.id) : "";
    if (inicio) {
      const h = (V.horario([v], inicio, leer(CLAVE_HORARIO + ev.id + "_descanso") || "10")[0] || { rondas: [] }).rondas[r];
      const dia = window.HoraCR ? HoraCR.hoy() : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());
      // Costa Rica no cambia de hora: siempre UTC−6.
      if (h) return Date.parse(dia + "T" + h.hora.padStart(5, "0") + ":00-06:00");
    }
    const R = v.rondas[r];
    return R && R.inicio ? R.inicio : null;
  }
  function limiteAlineacion(v) {
    const min = Number(v.plazoAlineacion);
    if (!(min >= 0) || v.plazoAlineacion == null || v.plazoAlineacion === "" || !v.rondas.length) return null;
    const base = inicioDeRonda(v, v.rondas.length - 1);
    return base ? base - min * 60000 : null;
  }

  function enviarCapitan(codigo) {
    const v = torneoDeCapitanes();
    const x = estado.capitanes && estado.capitanes.canales.get(codigo);
    if (!v || !x) return;
    const e = v.jugadores.find((y) => y.id === x.idE);
    if (!e) return;
    const enc = v.rondas.length ? encuentroDe(v, e.id) : null;
    const m = enc && enc.m;
    const rival = m && m.n != null ? (v.jugadores.find((y) => y.id === (enc.lado === "b" ? m.n : m.b)) || {}).nombre : null;
    const alineacion = m && m.n != null ? ((m.alineacion && m.alineacion[enc.lado]) || E.alineacionPorOmision(v, e.id)) : [];
    const limite = limiteAlineacion(v);
    const vencido = !!limite && Date.now() > limite;
    x.canal.send({ type: "broadcast", event: "estado", payload: {
      nombre: v.nombre || "", equipo: e.nombre, ronda: v.rondas.length, rival,
      integrantes: e.integrantes.map((j) => ({ id: j.id, nombre: j.nombre })), alineacion,
      limite, vencido,
      bloqueada: !m || m.n == null || vencido || (m.partidas || []).some((p) => p.r),
      confirmada: (m && m.alineacionCapitan && m.alineacionCapitan[enc.lado]) || null,
    } });
  }
  function recibirDeCapitan(codigo, p) {
    const v = torneoDeCapitanes();
    const x = estado.capitanes && estado.capitanes.canales.get(codigo);
    if (!v || !x || Number(p.ronda) !== v.rondas.length) return enviarCapitan(codigo);
    // Pasado el plazo, ya no (lo decide esta pestaña, no el celular).
    const limite = limiteAlineacion(v);
    if (limite && Date.now() > limite) return enviarCapitan(codigo);
    const e = v.jugadores.find((y) => y.id === x.idE);
    const enc = e && encuentroDe(v, e.id);
    if (!enc || enc.m.n == null || (enc.m.partidas || []).some((q) => q.r)) return enviarCapitan(codigo);
    const ids = Array.isArray(p.alineacion) ? p.alineacion.map(String) : [];
    const deEquipo = e.integrantes.map((j) => j.id);
    if (ids.length > E.TABLEROS || new Set(ids).size !== ids.length || ids.some((id) => !deEquipo.includes(id))) return enviarCapitan(codigo);
    E.prepararMesa(v, enc.m);
    enc.m.alineacion[enc.lado] = deEquipo.filter((id) => ids.includes(id));
    enc.m.alineacionCapitan = Object.assign({}, enc.m.alineacionCapitan, { [enc.lado]: Date.now() });
    enc.m.r = E.resultadoEncuentro(v, enc.m);
    if (v === t()) { guardar(); if (estado.ficha === "rondas") pintarRondas(); }
    else escribir(PREFIJO + estado.capitanes.idTorneo, JSON.stringify(v));
    Avisos.avisar(tx("capitanLlego", { e: e.nombre }), { tipo: "info" });
    enviarCapitan(codigo);
  }
  async function mostrarCapitanes(cont, R) {
    const v = t();
    try { await PareoQr.cargar(); } catch (e) { Avisos.avisar(tx("errorQr", { e: e.message }), { tipo: "error" }); return; }
    const enLaRonda = R.mesas.flatMap((m) => (m.n == null ? [] : [m.b, m.n]));
    const lista = el("div", { class: "grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2" });
    for (const idE of enLaRonda) {
      const e = jugador(idE);
      const codigo = (v.capitanes || {})[idE];
      if (!e || !codigo) continue;
      const url = location.origin + location.pathname + "#capitan=" + codigo;
      // Mandárselo al capitán: por WhatsApp o por correo (el teléfono y el
      // correo los pone quien lo manda; Pareo no los guarda), o copiarlo.
      const mensaje = tx("capitanMensaje", { e: e.nombre, r: v.rondas.length, t: v.grupo || v.nombre || "", u: url });
      const copiar = el("button", { type: "button", class: C.mini, "data-capitan-copiar": idE, "aria-label": tx("capitanCopiarA", { e: e.nombre }) }, tx("copiarEnlace"));
      copiar.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(mensaje); Avisos.avisar(tx("enlaceCopiado")); }
        catch (err) { Avisos.avisar(tx("noCopia"), { tipo: "error" }); }
      });
      lista.append(el("div", { class: "rounded-xl border border-brand-200 dark:border-brand-700 p-3", "data-capitan-equipo": idE },
        el("h4", { class: "font-semibold", texto: e.nombre }),
        el("div", { class: "w-28 bg-white p-2 rounded-lg mt-2" }, PareoQr.svg(url, tx("qrEtiqueta"))),
        el("p", { class: "pi-capitan-url text-xs break-all mt-2 font-mono", texto: url }),
        el("div", { class: "flex flex-wrap gap-2 mt-2" },
          el("a", { href: PareoCompartir.enlaceWhatsapp(mensaje), target: "_blank", rel: "noopener", class: C.mini, "data-capitan-whatsapp": idE, "aria-label": tx("capitanWhatsappA", { e: e.nombre }) }, tx("capitanWhatsapp")),
          el("a", { href: "mailto:?subject=" + encodeURIComponent(tx("capitanAsunto", { e: e.nombre, r: v.rondas.length })) + "&body=" + encodeURIComponent(mensaje),
            class: C.mini, "data-capitan-correo": idE, "aria-label": tx("capitanCorreoA", { e: e.nombre }) }, tx("capitanCorreo")),
          copiar)));
    }
    cont.replaceChildren(el("p", { class: C.nota, texto: tx("capitanesAyuda") }), lista);
  }

  Object.assign(Pagina, { RESULTADOS_VALIDOS, enlaceAdjunto, conectarAdjuntos, sincronizarAdjuntos,
    enviarAdjuntos, pintarLlamadas, pintarChat, nombreDeQuien, jugadoresDeMesa, asegurarCapitanes,
    conectarCapitanes, limiteAlineacion, enviarCapitan, mostrarCapitanes });
})();

/*! rev bfb5bbb0d2d82f9f */
