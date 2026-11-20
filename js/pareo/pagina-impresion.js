/* ===== Pareo Integral — la página (pareo.html): lo que se imprime =====
 *
 * La hoja de impresión, todo lo de una ronda, la plantilla de mesas, los gafetes, los rótulos, el
 * plano de la sala, las planillas de firma, la clasificación para la pared (A3) y las firmas del acta.
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
  const { T, E, V, C, leer, escribir, $, el, tx, estado, nuevoCodigoVivo, guardar, t, jugador, nombreDe,
    rondasCompletas, hasta, puntosTexto, torneosDelEvento, guardarDelEvento, pintarEvento, CLAVE_VIVO_EVENTO,
    horaCR, imprimirAlineaciones, imprimirPlanillasAnotacion } = Pagina;

  // Imprimir varias cosas de una ronda en un solo trabajo de impresión: los
  // armadores de cada hoja, mientras `juntando` está prendido, agregan en vez
  // de vaciar su contenedor y no imprimen; «Todo para imprimir» los llama
  // uno detrás de otro e imprime una vez.
  const impresion = { juntando: false, clases: new Set() };
  function empezarHoja(cont, ...nodos) {
    if (impresion.juntando) cont.append(...nodos);
    else cont.replaceChildren(...nodos);
  }
  function imprimirCon(clase) {
    if (impresion.juntando) { impresion.clases.add(clase); return; }
    document.body.classList.add(clase);
    window.print();
  }
  async function imprimirTodoDeRonda(r) {
    $("pi-plantilla").replaceChildren();
    $("pi-firmas").replaceChildren();
    impresion.juntando = true;
    impresion.clases.clear();
    try {
      imprimirPlantillaMesas(r);
      if (E.esDeEquipos(t())) imprimirAlineaciones(r);
      imprimirPlanillasFirma(r);
      await imprimirPlanillasAnotacion(r);
    } finally {
      impresion.juntando = false;
    }
    for (const c of impresion.clases) document.body.classList.add(c);
    window.print();
  }

  // Una hoja aparte para pegar en la pared antes de la ronda: mesa, blancas,
  // negras y un espacio en blanco para anotar el resultado a mano (nunca el
  // que ya está en la base: eso es justo lo que no se quiere acá). Separada
  // de la tabla de arriba, que es la que se imprime para el archivo de la
  // ronda ya jugada.
  function imprimirPlantillaMesas(r, deOtro) {
    const v = deOtro || t();
    const R = v.rondas[r];
    const num = T.numeros(v);
    const cont = $("pi-plantilla");
    // (Con `deOtro`, la de otro torneo del evento: los nombres salen de él.)
    const nombreDe = (id) => (v.jugadores.find((j) => j.id === id) || {}).nombre || "?";
    // Una tabla de columnas fijas (mesa, blancas, negras, resultado): cada
    // fila queda alineada aunque un nombre ocupe dos líneas, y la casilla
    // del resultado nunca se sale de la hoja. Desde la ronda 2, los puntos
    // de cada uno antes de la ronda, como en las listas de pareo de FIDE.
    const jugadorCelda = (id) => el("span", { class: "pi-plantilla-jugador" },
      el("span", { class: "pi-plantilla-nro", texto: num.get(id) + "." }),
      el("span", { class: "pi-plantilla-nombre", texto: nombreDe(id) }),
      r > 0 ? el("span", { class: "pi-plantilla-pts", texto: "(" + puntosTexto(T.puntosHasta(v, id, r)) + ")" }) : null);
    // Cada plantilla es su hoja: con las de todas las categorías juntas,
    // una por hoja (css: .pi-plantilla-hoja + .pi-plantilla-hoja).
    const hoja = el("div", { class: "pi-plantilla-hoja" }, el("h1", { class: "pi-plantilla-titulo" }, tx("plantillaTitulo", { r: r + 1 })),
      v.nombre ? el("p", { class: "pi-plantilla-torneo", texto: v.nombre }) : null);
    empezarHoja(cont, hoja);
    const lista = el("div", { class: "pi-plantilla-lista" },
      el("div", { class: "pi-plantilla-cab", "aria-hidden": "true" },
        el("span", { texto: tx("mesa") }), el("span", { texto: tx("blancas") }), el("span"),
        el("span", { texto: tx("negras") }), el("span", { texto: tx("resultado") })));
    R.mesas.forEach((m, i) => {
      if (m.n === null) {
        lista.append(el("div", { class: "pi-plantilla-mesa pi-plantilla-mesa-bye" },
          el("span", { class: "pi-plantilla-num", texto: V.mesaFisica(v, i) }),
          jugadorCelda(m.b),
          el("span", { class: "pi-plantilla-bye", texto: tx("byePareo", { p: puntosTexto(v.puntos.bye) }) })));
        return;
      }
      lista.append(el("div", { class: "pi-plantilla-mesa" },
        el("span", { class: "pi-plantilla-num", texto: V.mesaFisica(v, i) }),
        jugadorCelda(m.b),
        el("span", { class: "pi-plantilla-vs" }, "–"),
        jugadorCelda(m.n),
        el("span", { class: "pi-plantilla-resultado" })));
    });
    hoja.append(lista);
    imprimirCon("pi-imprimiendo-plantilla");
  }
  // Los gafetes: nombre, categoría, centro educativo y un QR a «Mi jugador»
  // en el enlace del evento, ocho por hoja carta para recortar. El código
  // del evento queda guardado desde ya (el QR impreso sirve cuando el evento
  // se ponga en vivo, aunque hoy no lo esté).
  async function imprimirGafetes(ev, lista) {
    let codigo = leer(CLAVE_VIVO_EVENTO + ev.id);
    if (!codigo) { codigo = nuevoCodigoVivo(); escribir(CLAVE_VIVO_EVENTO + ev.id, codigo); }
    const base = location.origin + location.pathname + "#evento=" + codigo + "&q=";
    try { await PareoQr.cargar(); } catch (e) { Avisos.avisar(tx("errorQr", { e: e.message }), { tipo: "error" }); return; }
    const personas = [];
    for (const y of lista) {
      const cat = V.nombreTorneo(y);
      if (E.esDeEquipos(y)) for (const e of y.jugadores) for (const j of e.integrantes) personas.push({ n: j.nombre, c: cat, i: e.nombre });
      else for (const j of y.jugadores) personas.push({ n: j.nombre, c: cat, i: j.institucion || "" });
    }
    if (!personas.length) { Avisos.avisar(tx("sinJugadoresQueExportar"), { tipo: "error" }); return; }
    const cont = $("pi-firmas");
    cont.replaceChildren(el("div", { class: "pi-gafetes" }, personas.map((x) => el("div", { class: "pi-gafete" },
      el("div", { class: "pi-gafete-texto" },
        el("p", { class: "pi-gafete-evento", texto: ev.nombre || "" }),
        el("p", { class: "pi-gafete-nombre", texto: x.n }),
        el("p", { class: "pi-gafete-cat", texto: x.c }),
        x.i ? el("p", { class: "pi-gafete-centro", texto: x.i }) : null,
        el("p", { class: "pi-gafete-ayuda", texto: tx("gafeteAyuda") })),
      el("div", { class: "pi-gafete-qr" }, PareoQr.svg(base + encodeURIComponent(x.n), tx("anotacionQr", { n: x.n })))))));
    document.body.classList.add("pi-imprimiendo-firmas");
    window.print();
  }
  // Los rótulos de mesa: el número grande, la categoría y un QR que lleva
  // al adjunto directo a esa mesa (#mesa=12, ver irAMesa en js/pareo/ver.js),
  // seis por hoja carta para recortar y pegar. El número es el de la sala
  // (V.mesaFisica), el mismo de la plantilla y de las planillas.
  async function imprimirRotulos(ev, lista) {
    try { await PareoQr.cargar(); } catch (e) { Avisos.avisar(tx("errorQr", { e: e.message }), { tipo: "error" }); return; }
    const base = location.origin + location.pathname + "#mesa=";
    const mesas = [];
    for (const y of lista) for (let i = 0; i < V.mesasQueNecesita(y); i++) mesas.push({ n: V.mesaFisica(y, i), c: V.nombreTorneo(y) });
    mesas.sort((a, b) => a.n - b.n);
    const cont = $("pi-firmas");
    cont.replaceChildren(el("div", { class: "pi-rotulos" }, mesas.map((x) => el("div", { class: "pi-rotulo", "data-rotulo": String(x.n) },
      el("p", { class: "pi-rotulo-mesa", texto: tx("mesa") }),
      el("p", { class: "pi-rotulo-n", texto: String(x.n) }),
      el("p", { class: "pi-rotulo-cat", texto: x.c }),
      el("div", { class: "pi-rotulo-qr" }, PareoQr.svg(base + x.n, tx("rotuloQr", { m: x.n }))),
      el("p", { class: "pi-rotulo-ayuda", texto: tx("rotuloAyuda") })))));
    document.body.classList.add("pi-imprimiendo-firmas");
    window.print();
  }
  // El plano para la entrada: qué mesas son de cada categoría.
  function imprimirPlanoDeLaSala(ev, lista) {
    const cont = $("pi-plantilla");
    const filas = lista.map((y) => el("tr", {}, el("td", { class: "pi-plano-torneo", texto: V.nombreTorneo(y) }),
      el("td", { class: "pi-plano-mesas", texto: tx("salaDeA", { a: V.mesaFisica(y, 0), b: V.mesaFisica(y, V.mesasQueNecesita(y) - 1) }) }),
      el("td", { class: "num", texto: String(y.jugadores.length) })));
    cont.replaceChildren(el("div", { class: "pi-plantilla-hoja pi-plano" },
      el("h1", { class: "pi-plantilla-titulo", texto: tx("salaPlanoTitulo") }),
      el("p", { class: "pi-plantilla-torneo", texto: ev.nombre || "" }),
      el("table", { class: "pi-plano-tabla" },
        el("thead", {}, el("tr", {}, [tx("salaTorneo"), tx("salaMesas"), E.esDeEquipos(lista[0]) ? tx("salaEquipos") : tx("salaJugadores")].map((x) => el("th", { scope: "col", texto: x })))),
        el("tbody", {}, filas))));
    document.body.classList.add("pi-imprimiendo-plantilla");
    window.print();
  }

  // La ronda en juego de cada torneo del evento (el que ya está emparejado):
  // su plantilla, todas juntas, en el orden de la lista de torneos.
  function imprimirPlantillasDelEvento() {
    const lista = torneosDelEvento().filter((y) => y.rondas.length);
    if (!lista.length) { Avisos.avisar(tx("eventoPlantillasNada"), { tipo: "error" }); return; }
    $("pi-plantilla").replaceChildren();
    impresion.juntando = true;
    impresion.clases.clear();
    try {
      for (const y of lista) imprimirPlantillaMesas(y.rondas.length - 1, y);
    } finally {
      impresion.juntando = false;
    }
    document.body.classList.add("pi-imprimiendo-plantilla");
    window.print();
  }

  // Una hoja POR MESA (salto de página entre una y la siguiente) para que el
  // árbitro la recoja firmada: a diferencia de la plantilla de la pared, esta
  // SÍ muestra el resultado ya anotado (si lo hay) — es para confirmarlo, no
  // para ocultarlo. Un bye no tiene con quién firmar: va sin líneas de firma.
  function imprimirPlanillasFirma(r, solo) {
    const v = t();
    const R = v.rondas[r];
    const num = T.numeros(v);
    const cont = $("pi-firmas");
    empezarHoja(cont);
    // Una tarjeta por mesa, cuatro (o más) por hoja: arriba la mesa y la
    // ronda; los dos jugadores lado a lado con su color; el resultado ya
    // anotado o tres casillas para marcarlo; y una línea para cada firma,
    // debajo de su nombre. Se corta por la línea punteada.
    const cabeza = (i) => el("div", { class: "pi-ft-cabeza" },
      el("span", { class: "pi-ft-mesa", texto: tx("mesa") + " " + V.mesaFisica(v, i) }),
      el("span", { class: "pi-ft-torneo", texto: tx("rondaN", { r: r + 1 }) + (v.nombre ? " · " + v.nombre : "") }));
    const lado = (color, id) => el("div", { class: "pi-ft-lado" },
      el("span", { class: "pi-ft-color", texto: tx(color) }),
      el("span", { class: "pi-ft-nombre", texto: num.get(id) + ". " + nombreDe(id) }));
    const casillas = (rr) => (rr
      ? el("span", { class: "pi-ft-anotado", texto: tx("corto_" + rr) })
      : el("span", { class: "pi-ft-casillas" }, ["1-0", "=", "0-1"].map((x) => el("span", { class: "pi-ft-casilla", texto: "☐ " + tx("corto_" + x) }))));
    const firma = (texto) => el("div", { class: "pi-ft-firma" }, el("span", { class: "pi-ft-raya" }), el("span", { class: "pi-ft-quien", texto }));
    R.mesas.forEach((m, i) => {
      if (solo != null && i !== solo) return;
      const hoja = el("div", { class: "pi-firma-mesa pi-ft" }, cabeza(i));
      if (m.n === null) {
        hoja.append(el("div", { class: "pi-ft-jugadores" }, lado("blancas", m.b), el("div", { class: "pi-ft-lado pi-ft-bye", texto: tx("byePareo", { p: puntosTexto(v.puntos.bye) }) })));
        cont.append(hoja);
        return;
      }
      if (E.esDeEquipos(v)) {
        // Un encuentro: los cuatro tableros con quién juega con cada color y
        // su resultado (si ya está), y la firma de los dos capitanes.
        E.prepararMesa(v, m);
        const nombreDeJ = (idE, idJ) => { const j = idJ && jugador(idE).integrantes.find((x) => x.id === idJ); return j ? j.nombre : tx("nadie"); };
        hoja.append(el("div", { class: "pi-ft-jugadores" }, lado("blancas", m.b), lado("negras", m.n)));
        const tabla = el("div", { class: "pi-ft-tableros" });
        for (const x of E.tablerosDe(v, m)) {
          const eb = x.bBlancas ? m.b : m.n, en = x.bBlancas ? m.n : m.b;
          tabla.append(el("div", { class: "pi-ft-tablero" },
            el("span", { class: "pi-ft-t", texto: tx("tableroN", { t: x.k + 1 }) }),
            el("span", { texto: nombreDeJ(eb, x.blancas) + " – " + nombreDeJ(en, x.negras) }),
            casillas(x.r)));
        }
        hoja.append(tabla, el("div", { class: "pi-ft-firmas" }, firma(tx("firmaCapitan", { e: nombreDe(m.b) })), firma(tx("firmaCapitan", { e: nombreDe(m.n) }))));
        cont.append(hoja);
        return;
      }
      hoja.append(
        el("div", { class: "pi-ft-jugadores" }, lado("blancas", m.b), el("span", { class: "pi-ft-vs", texto: "–" }), lado("negras", m.n)),
        el("div", { class: "pi-ft-resultado" }, el("span", { class: "pi-ft-etiqueta", texto: tx("resultado") + ":" }), casillas(m.r)),
        el("div", { class: "pi-ft-firmas" }, firma(tx("firmaDe", { n: nombreDe(m.b) })), firma(tx("firmaDe", { n: nombreDe(m.n) }))));
      cont.append(hoja);
    });
    imprimirCon("pi-imprimiendo-firmas");
  }

  // El afterprint llega sea que se imprima o se cancele: ahí se limpia, una
  // sola vez para toda la página (no hace falta re-engancharlo).
  window.addEventListener("afterprint", () => {
    document.body.classList.remove("pi-imprimiendo-plantilla", "pi-imprimiendo-firmas", "pi-imprimiendo-pared");
    const plantilla = $("pi-plantilla");
    if (plantilla) plantilla.replaceChildren();
    const firmas = $("pi-firmas");
    if (firmas) firmas.replaceChildren();
  });

  // ---------- La clasificación para la pared (A3) ----------
  // Una hoja A3 con letra grande, para pegarla después de cada ronda: el
  // puesto, el nombre, el centro, los puntos y los dos primeros desempates,
  // con la ronda y la hora en que se imprimió (una hoja vieja en la pared
  // engaña: la hora lo dice). @page pared en css/styles.css.
  function imprimirClasificacionPared() {
    const v = t();
    const k = rondasCompletas();
    if (!k) { Avisos.avisar(tx("paredSinRondas"), { tipo: "error" }); return; }
    const filas = V.aplicarDesempate(v, E.clasificacion(hasta(k), v.desempates));
    const des = (v.desempates || []).slice(0, 2);
    const hoja = el("div", { class: "pi-pared" },
      el("h1", { class: "pi-pared-titulo", texto: v.grupo || v.nombre || tx("fClasificacion") }),
      el("p", { class: "pi-pared-sub", texto: tx("clasificacionTras", { r: k }) + (k < V.totalRondas(v) ? " · " + tx("paredDe", { t: V.totalRondas(v) }) : "") }),
      el("p", { class: "pi-pared-hora", texto: tx("paredImpresa", { h: horaCR(Date.now()), f: window.HoraCR ? HoraCR.fecha(Date.now()) : new Date().toLocaleDateString("es-CR", { timeZone: "America/Costa_Rica" }) }) }),
      el("table", { class: "pi-pared-tabla" },
        el("thead", {}, el("tr", {},
          el("th", { class: "num", scope: "col", texto: tx("puesto") }), el("th", { scope: "col", texto: tx("nombre") }),
          el("th", { scope: "col", texto: E.esDeEquipos(v) ? tx("equipo") : tx("institucion") }), el("th", { class: "num", scope: "col", texto: tx("pts") }),
          des.map((c) => el("th", { class: "num", scope: "col", texto: c })))),
        el("tbody", {}, filas.map((f) => {
          const j = jugador(f.id) || {};
          return el("tr", {},
            el("td", { class: "num", texto: f.puesto }), el("td", { class: "pi-pared-nombre", texto: j.nombre || "?" }),
            el("td", { texto: E.esDeEquipos(v) ? "" : (j.institucion || "") }), el("td", { class: "num pi-pared-pts", texto: puntosTexto(f.puntos) }),
            des.map((c) => el("td", { class: "num", texto: Pagina.valorDesempate(c, f.valores[c]) })));
        }))));
    $("pi-plantilla").replaceChildren(hoja);
    imprimirCon("pi-imprimiendo-pared");
  }

  // ---------- Las firmas del acta ----------
  // Se guardan en el evento de cada torneo (todos llevan su copia).
  function guardarFirmas(idEvento, firmas) {
    for (const tor of torneosDelEvento(idEvento)) { tor.evento.firmas = firmas; guardarDelEvento(tor); }
    if (t().evento && t().evento.id === idEvento) { t().evento.firmas = firmas; guardar(); }
  }
  // Una firma válida (de esta pantalla o de un celular).
  function firmaValida(f) {
    return !!f && Object.prototype.hasOwnProperty.call(V.CARGOS_FIRMA, f.cargo) && typeof f.nombre === "string" && f.nombre.trim() &&
      typeof f.jpeg === "string" && f.jpeg.length < 300000 && /^[A-Za-z0-9+/=]+$/.test(f.jpeg) &&
      Number.isInteger(f.ancho) && Number.isInteger(f.alto) && f.ancho > 0 && f.alto > 0 && f.ancho <= 2000 && f.alto <= 2000;
  }
  const limpiaFirma = (f) => ({ cargo: f.cargo, nombre: f.nombre.trim().slice(0, 80), jpeg: f.jpeg, ancho: f.ancho, alto: f.alto, hora: Date.now() });
  // El diálogo para firmar en esta pantalla: quién firma, como qué, y el
  // recuadro para la firma (PareoVer.padFirma).
  function pedirFirma() {
    return new Promise((listo) => {
      const pad = PareoVer.padFirma(tx);
      const cargo = el("select", { id: "pi-firma-cargo", class: C.campo }, Object.entries(V.CARGOS_FIRMA).map(([k, x]) => el("option", { value: k, texto: x })));
      const nombre = el("input", { id: "pi-firma-nombre", type: "text", maxlength: "80", autocomplete: "off", class: C.campo });
      const error = el("p", { class: "text-sm text-red-700 dark:text-red-300 mt-2", role: "alert" });
      const guardarB = el("button", { type: "button", id: "pi-firma-guardar", class: C.boton }, tx("firmaGuardar"));
      const cancelarB = el("button", { type: "button", class: C.botonSec }, tx("cancelar"));
      const d = el("dialog", { id: "pi-firma-dialogo", class: "rounded-2xl p-5 max-w-lg w-full bg-white dark:bg-brand-900 text-brand-800 dark:text-white", "aria-labelledby": "pi-firma-dialogo-t" },
        el("h2", { id: "pi-firma-dialogo-t", class: "font-serif text-xl font-bold mb-3", texto: tx("firmarAqui") }),
        el("label", { for: "pi-firma-cargo", class: "block text-sm font-semibold mb-1", texto: tx("firmaCargo") }), cargo,
        el("label", { for: "pi-firma-nombre", class: "block text-sm font-semibold mb-1 mt-3", texto: tx("firmaNombre") }), nombre,
        el("p", { class: "block text-sm font-semibold mb-1 mt-3", texto: tx("firmaRecuadro") }), pad.nodo, error,
        el("div", { class: "flex flex-wrap gap-2 mt-4" }, guardarB, cancelarB));
      const cerrar = (x) => { d.close(); d.remove(); listo(x); };
      cancelarB.addEventListener("click", () => cerrar(null));
      d.addEventListener("cancel", (e) => { e.preventDefault(); cerrar(null); });
      guardarB.addEventListener("click", () => {
        if (!nombre.value.trim()) { error.textContent = tx("firmaFaltaNombre"); nombre.focus(); return; }
        if (pad.vacio()) { error.textContent = tx("firmaFaltaFirma"); return; }
        cerrar(limpiaFirma(Object.assign({ cargo: cargo.value, nombre: nombre.value }, pad.imagen())));
      });
      document.body.append(d);
      d.showModal();
      nombre.focus();
    });
  }
  // Firmar desde un celular: el mismo patrón que pasar el evento (un canal
  // con un código nuevo); lo que llega se pregunta antes de ir al acta.
  async function prenderFirmaCelular(ev) {
    try { await PareoVer.cargarSupabase(); }
    catch (e) { Avisos.avisar(tx("errorEnVivo", { e: e.message }), { tipo: "error" }); return; }
    const codigo = nuevoCodigoVivo();
    const canal = window.sb.channel("pareo-firma-" + codigo);
    estado.firmaCelular = { id: ev.id, codigo, canal };
    const contestar = (evento, payload) => canal.send({ type: "broadcast", event: evento, payload: payload || {} });
    canal.on("broadcast", { event: "pedir" }, () => contestar("estado", { evento: ev.nombre || "", cargos: V.CARGOS_FIRMA }));
    canal.on("broadcast", { event: "firma" }, async (msg) => {
      const f = msg.payload || {};
      if (!firmaValida(f)) { contestar("negada"); return; }
      const ok = await Avisos.confirmar(tx("firmaLlego", { n: f.nombre.trim().slice(0, 80), c: V.CARGOS_FIRMA[f.cargo] }), { aceptar: tx("firmaAgregar") });
      if (!ok) { contestar("negada"); return; }
      guardarFirmas(ev.id, (t().evento.firmas || []).concat(limpiaFirma(f)));
      contestar("recibida");
      if (estado.ficha === "archivos") pintarEvento();
      Avisos.avisar(tx("firmaGuardada", { n: f.nombre.trim().slice(0, 80) }));
    });
    canal.subscribe();
  }
  async function mostrarFirmaCelular(cont) {
    const url = location.origin + location.pathname + "#firma=" + estado.firmaCelular.codigo;
    try { await PareoQr.cargar(); } catch (e) { Avisos.avisar(tx("errorQr", { e: e.message }), { tipo: "error" }); return; }
    cont.replaceChildren(el("div", { class: "flex flex-wrap items-start gap-4" },
      el("div", { class: "w-32 bg-white p-2 rounded-lg" }, PareoQr.svg(url, tx("qrEtiqueta"))),
      el("div", { class: "text-sm" }, el("p", { id: "pi-firma-url", class: "break-all font-mono", texto: url }),
        el("p", { class: C.nota + " mt-1", texto: tx("firmarCelularAyuda") }))));
  }

  Object.assign(Pagina, { empezarHoja, imprimirCon, imprimirTodoDeRonda, imprimirPlantillaMesas,
    imprimirGafetes, imprimirRotulos, imprimirPlanoDeLaSala, imprimirPlantillasDelEvento,
    imprimirPlanillasFirma, imprimirClasificacionPared, guardarFirmas, pedirFirma, prenderFirmaCelular,
    mostrarFirmaCelular });
})();

/*! rev bfb5bbb0d2d82f9f */
