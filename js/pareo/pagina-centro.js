/* ===== Pareo Integral — la página (pareo.html): el Centro del evento =====
 *
 * El Centro del evento (códigos, QR por mesa, adjuntos), el sorteo del congresillo en el proyector,
 * la partida de una mesa (PGN) y la de la foto de las planillas.
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
  const { T, E, V, C, $, el, tx, estado, guardar, t, nombreDe, irA, pintarTorneo, pintarRondas, enlaceAdjunto,
    conectarAdjuntos, sincronizarAdjuntos, cargarVivo, pedirCodigoCamaras, enlaceCamaraDe, conQrDeCamaras,
    imprimirQrCamaras, conectarCamaras, claveCamara, SIN_NOTICIAS_MS, pintarConfirmar } = Pagina;

  // ---------- El Centro del evento ----------
  // Todo el torneo de un vistazo para el árbitro principal, con lo que esta
  // pestaña ya sabe: la ronda en juego y cuántas mesas faltan, lo que espera
  // confirmación (la misma lista de la ficha Rondas, pintarConfirmar, más las
  // segundas ilegales sin resultado), los árbitros adjuntos (su código, sus
  // mesas, cuánto anotaron y la última vez que la base supo de ellos), las
  // cámaras de Notara mesa por mesa y los enlaces para compartir. No guarda
  // nada propio: cada acción es la de siempre (crear un enlace de adjunto,
  // anotar lo de la cámara, ir a la ronda). Se vuelve a pintar sola cuando
  // cambia lo que muestra (centroFirma), nunca con el foco adentro. Ver
  // «Pareo Integral: el Centro del evento».
  const ESPERA_CENTRO = 4000;
  let relojCentro = null;
  let firmaCentro = "";
  const codigoLindo = (c) => String(c || "").slice(0, 4).toUpperCase() + "-" + String(c || "").slice(4).toUpperCase();
  const deletreado = (c) => String(c || "").toUpperCase().split("").join(" ");
  function haceCuanto(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    if (!(ms >= 0)) return "";
    const min = Math.floor(ms / 60000);
    return min < 1 ? tx("centroHaceSeg") : min < 60 ? tx("centroHaceMin", { n: min }) : tx("centroHaceHoras", { n: Math.floor(min / 60) });
  }
  // Lo que pinta el Centro, en datos: si cambia, se vuelve a pintar.
  function modeloCentro(v) {
    const r = v.rondas.length - 1;
    const R = v.rondas[r];
    const nombre = (id) => (v.jugadores.find((j) => j.id === id) || {}).nombre || "?";
    const conRival = R.mesas.filter((m) => m.n != null);
    const hechas = conRival.filter((m) => m.r).length;
    // Las segundas ilegales de una mesa todavía sin resultado (art. 7.5.5).
    const marcas = V.marcasIncidencias(R);
    const ilegales = [];
    R.mesas.forEach((m, k) => {
      if (m.r || m.n == null) return;
      for (const id of [m.b, m.n]) { const x = marcas.get(id); if (x && x.ilegales >= 2) ilegales.push({ mesa: V.mesaFisica(v, k), nombre: nombre(id) }); }
    });
    const vistos = (estado.adjuntos && estado.adjuntos.idTorneo === estado.id && estado.adjuntos.vistos) || new Map();
    const adjuntos = (v.adjuntos || []).filter((a) => a.activo).map((a) => {
      const [desde, hasta] = a.rango.split("-").map(Number);
      const suyas = R.mesas.filter((m, k) => k + 1 >= desde && k + 1 <= hasta && m.n != null);
      return { codigo: a.codigo, nombre: a.nombre || "", rango: a.rango, visto: vistos.get(a.codigo) || null,
        anoto: suyas.filter((m) => m.adjunto === a.codigo && m.r).length, hechas: suyas.filter((m) => m.r).length, total: suyas.length };
    });
    const cam = estado.camaras && estado.camaras.idTorneo === estado.id ? estado.camaras : null;
    const ahora = Date.now();
    const camaras = !E.esDeEquipos(v) && v.camaras && v.camaras.activo ? R.mesas.map((m, k) => {
      const f = V.mesaFisica(v, k), clave = claveCamara(f, null);
      const ultima = cam && cam.mesas.get(clave);
      const ayuda = cam && [...cam.alertas.values()].some((x) => x.m === clave);
      // (Con if y no con ternarios: verificar-pareo-pagina.js toma las dos palabras de un ternario como claves de textos.)
      let est = "sinSenal";
      if (m.n == null) est = "bye";
      else if (m.r) est = "termino";
      else if (ayuda) est = "ayuda";
      else if (ultima && ahora - ultima < SIN_NOTICIAS_MS) est = "transmite";
      return { mesa: f, est };
    }) : null;
    return { r, total: conRival.length, hechas, ilegales, adjuntos, camaras, qr: camaras && centroQr, publicado: v.publicado ? v.publicado.id : null,
      confirmar: JSON.stringify([R.discrepancias, R.deCamaras, R.confirmadas]) };
  }
  // La mesa cuyo QR de cámara se está mostrando en el Centro (o null).
  let centroQr = null;
  async function verQrDeMesa(mesa) {
    if (centroQr === mesa) centroQr = null;
    else {
      try { await PareoQr.cargar(); await cargarVivo(); } catch (e) { Avisos.avisar(tx("errorQr", { e: e.message }), { tipo: "error" }); return; }
      centroQr = mesa;
    }
    if (estado.ficha !== "centro") return;
    pintarCentro();
    const b = document.querySelector('[data-centro-camara="' + mesa + '"] button');
    if (b) b.focus();
  }
  function pintarCentro() {
    const cont = $("pi-centro");
    clearInterval(relojCentro);
    relojCentro = null;
    if (!cont) return;
    const v = t();
    if (!v.rondas.length) {
      firmaCentro = "";
      cont.replaceChildren(el("h2", { class: "font-serif text-xl font-bold mb-2", texto: tx("fCentro") }),
        el("p", { class: C.nota, texto: tx("centroSinRondas") }),
        el("button", { type: "button", class: C.botonSec + " mt-3", onclick: () => irA("rondas", true) }, tx("centroIrRondas")));
      return;
    }
    // Lo que alimenta esta ficha se conecta aunque no se haya abierto la ronda.
    if ((v.adjuntos || []).some((a) => a.activo)) conectarAdjuntos();
    if (!E.esDeEquipos(v) && v.camaras && v.camaras.activo) conectarCamaras();
    const M = modeloCentro(v);
    firmaCentro = JSON.stringify(M);
    const tarjeta = (id, titulo, ...hijos) => el("section", { id, class: "rounded-xl border border-brand-100 dark:border-brand-800 p-4", "aria-labelledby": id + "-t" },
      el("h3", { id: id + "-t", class: "font-semibold mb-2", texto: titulo }), ...hijos);
    const terminada = M.hechas === M.total;
    const ronda = el("section", { id: "pi-centro-ronda", class: "rounded-xl bg-brand-50 dark:bg-brand-800 p-4", "aria-labelledby": "pi-centro-ronda-t" },
      el("p", { class: "text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300", texto: tx(terminada ? "centroRondaTerminada" : "centroRondaEnJuego", { r: M.r + 1, n: T.rondasDelTorneo(v) }) }),
      el("h3", { id: "pi-centro-ronda-t", class: "text-2xl font-bold", texto: tx("centroMesas", { k: M.hechas, n: M.total }) }),
      el("progress", { class: "pi-centro-avance w-full max-w-md mt-2", max: String(Math.max(1, M.total)), value: String(M.total ? M.hechas : 1), "aria-label": tx("centroMesas", { k: M.hechas, n: M.total }) }),
      el("div", { class: "flex flex-wrap gap-2 mt-3" },
        el("button", { type: "button", id: "pi-centro-ir-ronda", class: terminada ? C.boton : C.botonSec, onclick: () => { estado.ronda = M.r; irA("rondas", true); } }, tx(terminada ? "centroIrEmparejar" : "centroIrRonda"))));

    // Lo que espera al árbitro principal.
    const espera = el("div");
    pintarConfirmar(espera, M.r, "pi-centro-confirmar");
    const ilegales = M.ilegales.map((x) => el("li", { class: "flex flex-wrap items-center gap-2" },
      el("span", { class: "font-semibold text-red-800 dark:text-red-200", texto: tx("centroSegundaIlegal", { m: x.mesa, n: x.nombre }) }),
      el("button", { type: "button", class: C.mini, onclick: () => { estado.ronda = M.r; irA("rondas", true); } }, tx("centroDecidir"))));
    const pendientes = tarjeta("pi-centro-pendientes", tx("centroPendientes"),
      espera.childNodes.length || ilegales.length ? null : el("p", { class: C.nota, texto: tx("centroNadaEspera") }),
      ilegales.length ? el("ul", { class: "space-y-2 text-sm mb-3" }, ilegales) : null, ...espera.childNodes);

    // Los árbitros adjuntos.
    const filasAdj = M.adjuntos.map((a) => el("li", { class: "flex flex-wrap items-center gap-3 py-2 border-t border-brand-100 dark:border-brand-800", "data-centro-adjunto": a.codigo },
      el("div", { class: "flex-1 min-w-0" },
        el("p", { class: "font-semibold" }, a.nombre || "—", el("span", { class: C.nota + " font-normal", texto: " · " + tx("centroSusMesas", { r: a.rango }) })),
        el("p", { class: C.nota, texto: (a.visto ? tx("centroVisto", { h: haceCuanto(a.visto) }) : tx(M.publicado ? "centroNoEntro" : "centroSinBase")) + " · " + tx("centroAnoto", { k: a.anoto, h: a.hechas, n: a.total }) })),
      el("strong", { class: "font-mono text-base bg-brand-50 dark:bg-brand-800 rounded-md px-2 py-1", "aria-label": tx("adjuntoCodigo") + " " + deletreado(a.codigo) }, codigoLindo(a.codigo))));
    const adjuntos = tarjeta("pi-centro-adjuntos", tx("centroAdjuntos"),
      M.adjuntos.length ? el("ul", {}, filasAdj) : el("p", { class: C.nota, texto: tx("centroSinAdjuntos") }),
      M.publicado ? null : el("p", { class: C.nota + " mt-2", texto: tx("centroSinPublicar") }),
      el("div", { class: "flex flex-wrap gap-2 mt-3" },
        el("button", { type: "button", id: "pi-centro-agregar", class: C.botonSec, onclick: async () => { await enlaceAdjunto(M.r); if (estado.ficha === "centro") pintarCentro(); } }, tx("centroAgregar")),
        M.adjuntos.length ? el("button", { type: "button", id: "pi-centro-codigos", class: C.botonSec, onclick: () => imprimirCodigos(v) }, tx("centroCodigosPapel")) : null),
      el("p", { class: C.nota + " mt-2" }, tx("centroDondeEntran"), " ", el("span", { class: "font-mono break-all", texto: location.origin + "/pareo.html#codigo" })));

    // Las cámaras de Notara.
    const EST = { transmite: ["centroCamTransmite", "text-green-800 dark:text-green-300"], termino: ["centroCamTermino", "text-brand-600 dark:text-brand-300"],
      ayuda: ["centroCamAyuda", "text-red-800 dark:text-red-200"], sinSenal: ["centroCamSinSenal", "text-accent-700 dark:text-accent-300"], bye: ["centroCamBye", "text-brand-600 dark:text-brand-300"] };
    // Tocar una mesa muestra su QR: el celular que lo lee queda transmitiendo esa mesa.
    const qrDeCamaras = conQrDeCamaras(v);
    // (Con if y no con un ternario: verificar-pareo-pagina.js toma las dos palabras de un ternario como claves de textos.)
    let etiquetaMesaCam = "div";
    if (qrDeCamaras) etiquetaMesaCam = "button";
    const urlQr = qrDeCamaras && M.qr && window.PartidaEnVivo && window.qrcode ? enlaceCamaraDe(v, M.qr) : null;
    const panelQr = urlQr ? el("div", { class: "mt-3 rounded-xl border border-accent-500 p-3 flex flex-wrap items-start gap-3", "data-centro-qr": String(M.qr), "data-enlace": urlQr },
      el("div", { class: "w-40 bg-white p-2 rounded-lg shrink-0" }, PareoQr.svg(urlQr, tx("camaraQrEtiqueta", { m: M.qr }))),
      el("div", { class: "flex-1 min-w-[12rem]" },
        el("h4", { class: "font-semibold", texto: tx("centroQrTitulo", { m: M.qr }) }),
        el("p", { class: C.nota + " mt-1", texto: tx("centroQrTexto") }),
        el("div", { class: "flex flex-wrap gap-2 mt-2" },
          el("button", { type: "button", class: C.mini, onclick: async () => { try { await navigator.clipboard.writeText(urlQr); Avisos.avisar(tx("enlaceCopiado")); } catch (e) { Avisos.avisar(tx("noCopia"), { tipo: "error" }); } } }, tx("copiarEnlace")),
          el("button", { type: "button", class: C.mini, onclick: () => verQrDeMesa(M.qr) }, tx("cerrar"))))) : null;
    const camaras = tarjeta("pi-centro-camaras", tx("centroCamaras"),
      M.camaras && qrDeCamaras ? el("p", { class: C.nota + " mb-2", texto: tx("centroCamToca") }) : null,
      M.camaras ? el("ul", { class: "grid grid-cols-3 sm:grid-cols-5 gap-2" }, M.camaras.map((c) => el("li", { "data-centro-camara": String(c.mesa), "data-estado": c.est },
        el(etiquetaMesaCam, Object.assign({ class: "block w-full rounded-lg border p-2 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 " + (M.qr === c.mesa ? "border-accent-500 ring-2 ring-accent-500" : "border-brand-100 dark:border-brand-800") },
          qrDeCamaras ? { type: "button", "aria-expanded": String(M.qr === c.mesa), "aria-controls": "pi-centro-qr", onclick: () => verQrDeMesa(c.mesa) } : {}),
          el("span", { class: "block font-bold", texto: tx("mesa") + " " + c.mesa }),
          el("span", { class: "block text-xs font-semibold " + EST[c.est][1], texto: tx(EST[c.est][0]) })))))
        : el("p", { class: C.nota, texto: tx(E.esDeEquipos(v) ? "centroCamEquipos" : "centroSinCamaras") }),
      el("div", { id: "pi-centro-qr", hidden: !panelQr }, panelQr),
      M.camaras && qrDeCamaras ? el("button", { type: "button", id: "pi-centro-camaras-qr", class: C.botonSec + " mt-3", onclick: imprimirQrCamaras }, el("span", { "aria-hidden": "true", texto: "🖨️ " }), tx("camarasQrBoton")) : null,
      M.camaras || E.esDeEquipos(v) ? null : el("button", { type: "button", id: "pi-centro-camaras-poner", class: C.botonSec + " mt-3", onclick: pedirCodigoCamaras }, tx("centroCamPoner")),
      M.camaras || !E.esDeEquipos(v) ? null : el("button", { type: "button", class: C.botonSec + " mt-3", onclick: () => { estado.ronda = M.r; irA("rondas", true); } }, tx("centroIrRonda")));

    // Los enlaces para compartir.
    const copiar = (url) => async () => {
      try { await navigator.clipboard.writeText(url); Avisos.avisar(tx("enlaceCopiado")); }
      catch (e) { Avisos.avisar(tx("noCopia"), { tipo: "error" }); }
    };
    const enlace = (titulo, url) => el("li", { class: "flex flex-wrap items-center gap-2 py-2 border-t border-brand-100 dark:border-brand-800" },
      el("div", { class: "flex-1 min-w-0" }, el("p", { class: "font-semibold text-sm", texto: titulo }), el("p", { class: C.nota + " break-all", texto: url })),
      el("button", { type: "button", class: C.mini, onclick: copiar(url) }, tx("copiarEnlace")));
    const enlaces = tarjeta("pi-centro-enlaces", tx("centroEnlaces"), el("ul", {},
      M.publicado ? enlace(tx("centroEnlacePublico"), PareoPublicar.enlace(M.publicado)) : null,
      enlace(tx("centroEnlaceCodigo"), location.origin + "/pareo.html#codigo"),
      enlace(tx("centroEnlaceMesa"), location.origin + "/mesa-arbitro.html")));

    cont.replaceChildren(
      el("h2", { class: "font-serif text-xl font-bold mb-1", texto: tx("fCentro") + (v.nombre ? " · " + v.nombre : "") }),
      el("p", { class: C.nota + " mb-4", texto: tx("centroTexto") }),
      el("div", { class: "grid lg:grid-cols-2 gap-4" },
        el("div", { class: "space-y-4" }, ronda, pendientes),
        el("div", { class: "space-y-4" }, adjuntos, camaras, enlaces)));
    // Se pone al día sola mientras está abierta, sin quitarle el foco a nadie.
    relojCentro = setInterval(() => {
      if (estado.ficha !== "centro" || !estado.t || !estado.t.rondas.length) return;
      if (cont.contains(document.activeElement) && document.activeElement !== document.body) return;
      if (JSON.stringify(modeloCentro(t())) !== firmaCentro) pintarCentro();
    }, ESPERA_CENTRO);
  }
  // Los códigos de los adjuntos en papel: una fila por árbitro (nombre, mesas
  // y código) y dónde se escriben, sin el enlace. Con la plantilla de la
  // pared (misma hoja y marca de agua).
  function imprimirCodigos(v) {
    const activos = (v.adjuntos || []).filter((a) => a.activo);
    const cont = $("pi-plantilla");
    Pagina.empezarHoja(cont, el("div", { class: "pi-plantilla-hoja" },
      el("h1", { class: "pi-plantilla-titulo", texto: tx("centroCodigosTitulo") }),
      v.nombre ? el("p", { class: "pi-plantilla-torneo", texto: v.nombre }) : null,
      el("p", { texto: tx("centroCodigosComo", { u: location.host + "/pareo.html#codigo" }) }),
      el("table", { class: "pi-plantilla-tabla" },
        el("thead", {}, el("tr", {}, el("th", { texto: tx("centroArbitro") }), el("th", { texto: tx("centroMesasCol") }), el("th", { texto: tx("centroCodigo") }))),
        el("tbody", {}, activos.map((a) => el("tr", {}, el("td", { texto: a.nombre || "—" }), el("td", { texto: a.rango }), el("td", { class: "font-mono", texto: codigoLindo(a.codigo) })))))));
    Pagina.imprimirCon("pi-imprimiendo-plantilla");
  }

  async function mostrarAdjuntos(cont) {
    const v = t();
    const activos = (v.adjuntos || []).filter((a) => a.activo);
    cont.hidden = !activos.length;
    if (!activos.length) return;
    try { await PareoQr.cargar(); } catch (e) { Avisos.avisar(tx("errorQr", { e: e.message }), { tipo: "error" }); return; }
    const lista = el("div", { class: "grid sm:grid-cols-2 gap-3 mt-2" });
    for (const a of activos) {
      const url = location.origin + location.pathname + "#adjunto=" + a.codigo + "&m=" + a.rango;
      const copiar = el("button", { type: "button", class: C.mini }, tx("copiarEnlace"));
      copiar.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(url); Avisos.avisar(tx("enlaceCopiado")); }
        catch (e) { Avisos.avisar(tx("noCopia"), { tipo: "error" }); }
      });
      const apagar = el("button", { type: "button", class: C.miniPeligro, "data-apagar": a.codigo }, tx("adjuntoApagar"));
      apagar.addEventListener("click", async () => {
        const ok = await Avisos.confirmar(tx("adjuntoApagarConfirmar", { r: a.rango }), { aceptar: tx("adjuntoApagar"), peligro: true });
        if (!ok) return;
        a.activo = false;
        guardar();
        sincronizarAdjuntos(v);
        await conectarAdjuntos();
        pintarRondas();
        Avisos.avisar(tx("adjuntoApagado", { r: a.rango }));
      });
      lista.append(el("div", { class: "rounded-xl border border-brand-200 dark:border-brand-700 p-3", "data-adjunto": a.codigo },
        el("h4", { class: "font-semibold", texto: (a.nombre ? a.nombre + " · " : "") + tx("adjuntoListo", { r: a.rango }) }),
        // El código para escribir a mano en la Mesa del árbitro (sin cámara para el QR).
        el("p", { class: "pi-adjunto-codigo text-sm mt-1" }, tx("adjuntoCodigo"), " ",
          el("strong", { class: "font-mono text-base", "aria-label": a.codigo.toUpperCase().split("").join(" ") }, a.codigo.slice(0, 4).toUpperCase() + "-" + a.codigo.slice(4).toUpperCase())),
        el("div", { class: "w-32 bg-white p-2 rounded-lg mt-2" }, PareoQr.svg(url, tx("qrEtiqueta"))),
        el("p", { class: "pi-adjunto-url text-xs break-all mt-2 font-mono", texto: url }),
        el("div", { class: "flex flex-wrap gap-2 mt-1" }, copiar, apagar)));
    }
    cont.replaceChildren(el("p", { class: C.nota, texto: tx("adjuntoAyuda") }), lista);
  }

  // ---------- El sorteo del congresillo, en el proyector ----------
  // Los números de salida (todos contra todos) o el color del n.º 1 en la
  // ronda 1 (suizo), sorteados a pantalla completa para que la sala lo vea:
  // primero se barajan a la vista y después se anuncian uno por uno. Con
  // «menos movimiento» del sistema sale todo de una vez. Queda anotado en el
  // torneo (t.sorteo) y el acta del evento lo trae con la hora.
  function anotarSorteo(v, tipo) {
    v.sorteo = { tipo, hora: Date.now(), orden: tipo === "numeros" ? v.numeracion.slice() : undefined, color: tipo === "color" ? v.colorInicial : undefined };
  }
  let sorteoTimer = null;
  function cerrarSorteo() {
    const caja = $("pi-sorteo");
    if (sorteoTimer) { clearTimeout(sorteoTimer); sorteoTimer = null; }
    caja.hidden = true;
    caja.replaceChildren();
    document.body.classList.remove("pi-sorteo-abierto");
    // Al salir de la pantalla completa el navegador suelta el foco: se
    // devuelve al botón después de salir.
    const volver = () => { const b = $(caja.dataset.volver || ""); if (b) b.focus(); };
    if (document.fullscreenElement) document.exitFullscreen().then(volver, volver);
    else volver();
  }
  function abrirSorteo(tipo) {
    const v = t();
    if (v.rondas.length) return;
    const caja = $("pi-sorteo");
    caja.dataset.volver = tipo === "color" ? "pi-sortear-color" : "pi-sortear-proyector";
    const quieto = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const estadoTxt = el("p", { id: "pi-sorteo-estado", class: "pi-sorteo-estado", role: "status" });
    const cuerpo = el("div", { class: "pi-sorteo-cuerpo" });
    const sortear = el("button", { type: "button", id: "pi-sorteo-sortear", class: "pi-sorteo-boton" }, tx("sorteoSortear"));
    const cerrar = el("button", { type: "button", id: "pi-sorteo-cerrar", class: "pi-sorteo-boton pi-sorteo-sec" }, tx("cerrar"));
    cerrar.addEventListener("click", cerrarSorteo);
    caja.replaceChildren(el("div", { class: "pi-sorteo-marco" },
      el("p", { class: "pi-sorteo-torneo", texto: v.grupo || v.nombre || "" }),
      el("h2", { id: "pi-sorteo-titulo", class: "pi-sorteo-titulo", texto: tx(tipo === "color" ? "sorteoTituloColor" : "sorteoTituloNumeros") }),
      cuerpo, estadoTxt, el("div", { class: "pi-sorteo-botones" }, sortear, cerrar)));
    caja.onkeydown = (e) => {
      if (e.key === "Escape") { e.preventDefault(); cerrarSorteo(); return; }
      if (e.key !== "Tab") return;
      const f = [...caja.querySelectorAll("button:not([disabled])")];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    // Antes de sortear: los nombres (o la pregunta del color).
    if (tipo === "numeros") cuerpo.append(el("ol", { class: "pi-sorteo-lista" }, T.ordenInicial(v).map((id) => el("li", {}, el("span", { class: "pi-sorteo-num", texto: "?" }), el("span", { texto: nombreDe(id) })))));
    else cuerpo.append(el("p", { class: "pi-sorteo-color", texto: tx("sorteoPreguntaColor", { n: nombreDe(T.ordenInicial(v)[0]) }) }));
    sortear.addEventListener("click", () => {
      sortear.disabled = true;
      if (tipo === "color") {
        v.colorInicial = T.sortearColor();
        anotarSorteo(v, "color"); guardar();
        const fin = () => {
          cuerpo.replaceChildren(el("p", { class: "pi-sorteo-color pi-sorteo-resultado", texto: v.colorInicial === "b" ? tx("sorteoColorNegras", { n: nombreDe(T.ordenInicial(v)[0]) }) : tx("sorteoColorBlancas", { n: nombreDe(T.ordenInicial(v)[0]) }) }));
          estadoTxt.textContent = tx("sorteoListo"); cerrar.focus(); pintarTorneo(); pintarRondas();
        };
        if (quieto) fin(); else { cuerpo.replaceChildren(el("p", { class: "pi-sorteo-color pi-sorteo-girando", "aria-hidden": "true", texto: "♔ ♚" })); sorteoTimer = setTimeout(fin, 1800); }
        return;
      }
      T.sortearNumeracion(v); anotarSorteo(v, "numeros"); guardar();
      const orden = v.numeracion.slice();
      const ol = el("ol", { class: "pi-sorteo-lista" });
      cuerpo.replaceChildren(ol);
      let i = 0;
      const uno = () => {
        ol.append(el("li", { class: "pi-sorteo-nuevo" }, el("span", { class: "pi-sorteo-num", texto: String(i + 1) }), el("span", { texto: nombreDe(orden[i]) })));
        estadoTxt.textContent = tx("sorteoUno", { n: i + 1, j: nombreDe(orden[i]) });
        i++;
        if (i < orden.length) sorteoTimer = setTimeout(uno, quieto ? 0 : 1200);
        else { estadoTxt.textContent = tx("sorteoListo"); cerrar.focus(); pintarRondas(); }
      };
      if (quieto) { while (i < orden.length - 1) { ol.append(el("li", {}, el("span", { class: "pi-sorteo-num", texto: String(i + 1) }), el("span", { texto: nombreDe(orden[i]) }))); i++; } uno(); }
      else uno();
    });
    caja.hidden = false;
    document.body.classList.add("pi-sorteo-abierto");
    if (caja.requestFullscreen) caja.requestFullscreen().catch(() => {});
    sortear.focus();
  }

  // ---------- La partida de una mesa (PGN) ----------
  // Se pega, se comprueba jugada por jugada con chess.js (js/pareo/partida.js,
  // que acepta las letras en español) y se guarda en la mesa (`m.pgn`): sale
  // en torneos-pareo.html si el torneo está publicado. chess.js se carga
  // solo la primera vez que se usa (Pareo Integral no lo necesita para nada más).
  let cargaChess = null;
  function cargarChess() {
    if (window.Chess) return Promise.resolve();
    if (!cargaChess) cargaChess = new Promise((listo, fallo) => {
      const sc = document.createElement("script");
      sc.src = "js/vendor/chess.js";
      sc.addEventListener("load", listo);
      sc.addEventListener("error", () => { cargaChess = null; fallo(new Error("No cargó chess.js")); });
      document.head.appendChild(sc);
    });
    return cargaChess;
  }
  // `deFoto`: el PGN que salió de la foto de las planillas (leerPlanilla), con
  // lo que conviene revisar. Se abre en el mismo cuadro y se guarda igual.
  async function editarPartida(r, i, boton, deFoto) {
    const v = t();
    const m = v.rondas[r].mesas[i];
    const mesa = V.mesaFisica(v, i);
    const datos = await Avisos.formulario({ titulo: tx("pgnTitulo", { m: mesa }), texto: deFoto ? deFoto.texto : tx("pgnTexto"), aceptar: tx("pgnGuardar"),
      campos: [{ nombre: "pgn", etiqueta: tx("pgnCampo"), tipo: "textarea", valor: deFoto ? deFoto.pgn : m.pgn || "", max: 12000, ayuda: deFoto ? deFoto.ayuda || undefined : undefined }] });
    if (!datos) return;
    const texto = String(datos.pgn || "").trim();
    if (!texto) {
      if (m.pgn) { delete m.pgn; guardar(); pintarRondas(); Avisos.avisar(tx("pgnQuitada")); }
      return;
    }
    try { await cargarChess(); } catch (e) { Avisos.avisar(tx("publicarSinRed"), { tipo: "error" }); return; }
    const lectura = PareoPartida.leer(texto, window.Chess);
    if (!lectura.ok) { Avisos.avisar(tx("pgnMala", { j: lectura.fallaEn || 1 }), { tipo: "error" }); return; }
    m.pgn = texto;
    delete m.pgnCamara; // escrita a mano: la cámara ya no la cambia
    guardar();
    pintarRondas();
    Avisos.avisar(tx("pgnGuardada", { j: Math.ceil(lectura.jugadas.length / 2) }));
    const b = document.querySelector('#pi-ronda [data-pgn="' + i + '"]'); if (b) b.focus();
  }

  // ---------- La partida de la foto de las planillas ----------
  // «📷 Planilla» en cada mesa: una o dos fotos (las dos planillas juntas o
  // una por foto) → Google Vision (ocr-scoresheet, con el tope diario del
  // lector) → la partida legal que mejor explica lo escrito
  // (js/pareo/planilla.js, el mismo lector del Centroamericano). No guarda
  // nada: abre «Partida (PGN)» con lo leído y lo que conviene revisar.
  let leyendoPlanilla = false;
  // La última lectura de cada mesa («⬇ Lectura»), solo en esta pestaña: trae
  // lo escrito en la planilla y no tiene por qué quedarse en el aparato.
  const lecturasPlanilla = new WeakMap(); // torneo → Map("ronda|mesa" → lectura)
  const lecturasDe = (v) => { if (!lecturasPlanilla.has(v)) lecturasPlanilla.set(v, new Map()); return lecturasPlanilla.get(v); };
  function bajarLectura(v, r, i) {
    const x = lecturasDe(v).get(r + "|" + i);
    if (!x) return;
    const nombre = window.PareoPDF ? window.PareoPDF.nombreArchivo("lectura " + (v.nombre || "torneo") + " ronda " + (r + 1) + " mesa " + V.mesaFisica(v, i), "lectura").replace(/\.pdf$/, ".json")
      : "lectura-ronda-" + (r + 1) + "-mesa-" + V.mesaFisica(v, i) + ".json";
    const a = el("a", { href: URL.createObjectURL(new Blob([JSON.stringify(x, null, 1)], { type: "application/json" })), download: nombre, hidden: true });
    document.body.append(a); a.click(); a.remove();
  }
  function elegirFotos() {
    return new Promise((listo) => {
      const input = el("input", { type: "file", accept: "image/*", multiple: true, hidden: true });
      input.addEventListener("change", () => { const f = [...(input.files || [])]; input.remove(); listo(f); });
      input.addEventListener("cancel", () => { input.remove(); listo([]); });
      document.body.append(input);
      input.click();
    });
  }
  async function leerPlanilla(r, i, boton) {
    if (leyendoPlanilla) return;
    const v = t();
    const m = v.rondas[r].mesas[i];
    if (m.pgn && !(await Avisos.confirmar(tx("planillaYaHay"), { titulo: tx("planillaTitulo", { m: V.mesaFisica(v, i) }), aceptar: tx("planillaLeerIgual") }))) return;
    const fotos = await elegirFotos();
    if (!fotos.length) return;
    if (fotos.length > window.PareoPlanilla.MAX_FOTOS) Avisos.avisar(tx("planillaDos"));
    const original = boton.textContent;
    const decir = (clave, datos) => { boton.textContent = tx(clave, datos); };
    leyendoPlanilla = true;
    boton.disabled = true;
    boton.setAttribute("aria-busy", "true");
    try {
      let token = null;
      try {
        const s = window.sb && window.sb.auth ? (await window.sb.auth.getSession()).data.session : null;
        token = s && s.access_token;
      } catch (e) { token = null; }
      if (!token || !navigator.onLine) throw new Error(tx("planillaSinSesion"));
      await cargarChess();
      const datosMesa = { torneo: v.nombre || "", ronda: r + 1, mesa: V.mesaFisica(v, i), leida: new Date().toISOString() };
      const lectura = await window.PareoPlanilla.leer(fotos, { token, decir, datos: datosMesa });
      lecturasDe(v).set(r + "|" + i, lectura.lectura);
      // el día de la ronda (cuando se empezó su reloj) o el de hoy, en hora de Costa Rica
      const R = v.rondas[r];
      const fecha = (R.inicio ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date(R.inicio))
        : window.HoraCR ? HoraCR.hoy() : "").replace(/-/g, ".") || "????.??.??";
      const pgn = window.PareoPlanilla.pgn(window.Chess, lectura.resultado, {
        Event: v.nombre || "?", Site: "?", Date: fecha, Round: String(r + 1),
        White: nombreDe(m.b), Black: nombreDe(m.n), Result: m.r || "*",
        Annotator: tx("planillaAnotador", { m: V.mesaFisica(v, i) }),
      });
      const res = window.PareoPlanilla.resumen(lectura.resultado, tx);
      if (lectura.metodo === "filas") res.texto += " " + tx("planillaFilas");
      if (lectura.chica) res.texto += " " + tx("planillaChica", { a: lectura.chica.ancho, b: lectura.chica.alto });
      boton.textContent = original;
      pintarRondas(); // aparece «⬇ Lectura» en la mesa, aunque no se guarde la partida
      await editarPartida(r, i, boton, { pgn, texto: res.texto, ayuda: res.ayuda });
    } catch (e) {
      if (e && e.lectura) { lecturasDe(v).set(r + "|" + i, e.lectura); pintarRondas(); }
      const msj = e && e.message === "vacia" ? tx("planillaVacia") + (e.chica ? " " + tx("planillaChica", { a: e.chica.ancho, b: e.chica.alto }) : "")
        : /failed to fetch|networkerror|load failed/i.test(String(e && e.message)) ? tx("planillaNoContesto")
        : String((e && e.message) || e);
      Avisos.avisar(tx("planillaError", { e: msj }), { tipo: "error" });
    } finally {
      leyendoPlanilla = false;
      boton.disabled = false;
      boton.removeAttribute("aria-busy");
      if (boton.isConnected && boton.textContent !== original) boton.textContent = original;
    }
  }

  Object.assign(Pagina, { pintarCentro, mostrarAdjuntos, anotarSorteo, abrirSorteo, cargarChess,
    editarPartida, lecturasDe, bajarLectura, leerPlanilla });
})();

/*! rev bfb5bbb0d2d82f9f */
