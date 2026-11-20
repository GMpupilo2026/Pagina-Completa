/* ===== Pareo Integral — la página (pareo.html): el arranque =====
 *
 * Abrir archivos (TRF, comprobador), enganchar los controles de la página, usarla sin internet y
 * arrancar(). Se carga de último: es el que arranca la página.
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
  const { T, E, V, motor, CLAVE_LISTA, CLAVE_IDIOMA, PREFIJO, CLAVE_MODO_JDE, C, leer, escribir, quitar, $,
    tx, estado, nuevoCodigoVivo, guardar, CLAVE_SONIDO, sonar, abrir, crear, t, jugador, rondasCompletas,
    nombreArchivo, bajar, FICHAS, irA, pintarArchivar, cambiarFiltroEvento, pintarTodo, nubeLocal,
    alTraerDeLaNube, engancharMenus, configFija, aplicarConfigJde, alCambiarTorneo, pintarDesempates,
    pintarJugadores, datosJugador, pintarCategorias, agregarJugadores, subirLista, recogerDeInscripcion,
    alEscribirTorneo, guardarBorrador, restaurarBorrador, guardarAlSalir, avisarPestanas, buscarEloNacional,
    CLAVE_LISTA_ELO, listaEloInicial, buscarEnListaElo, pintarListaElo, horaCR, activarEnVivo,
    desactivarEnVivo, compartirLectura, pintarClasificacion, enlaceOrganizacion, enlaceVivoActual,
    abrirCompartir, imprimirClasificacionPared, pintarCruzada, datosClasificacionPDF, datosCruzadaPDF,
    bajarPDF, recibirEvento, abrirRespaldo, comprobarTexto, leerArchivo, abrirProyector } = Pagina;

  // ---------- Archivos, comprobador y generador ----------
  function trfDelTorneo() {
    const k = rondasCompletas();
    if (k < t().rondas.length) Avisos.avisar(tx("trfSoloCompletas", { r: k }), { tipo: "info" });
    return T.aTrf(t(), { hasta: k });
  }

  function abrirTexto(nombre, texto) {
    let nuevo;
    if (/\.json$/i.test(nombre) || /^\s*\{/.test(texto)) {
      const datos = JSON.parse(texto);
      if (datos && datos.formato === V.FORMATO_RESPALDO) {
        if (!V.esRespaldo(datos)) throw new Error(tx("jsonNoEs"));
        abrirRespaldo(datos).catch((e) => Avisos.avisar(tx("noAbre", { e: e.message }), { tipo: "error" }));
        return;
      }
      if (!datos || datos.formato !== 1 || !Array.isArray(datos.jugadores) || !Array.isArray(datos.rondas)) throw new Error(tx("jsonNoEs"));
      nuevo = T.nuevo(datos);
    } else {
      nuevo = T.deTrf(texto);
      if (!nuevo.jugadores.length) throw new Error(tx("trfSinJugadores"));
    }
    crear(nuevo);
    pintarTodo();
    Avisos.avisar(tx("abierto", { n: nuevo.nombre || tx("sinNombre") }));
  }

  // ---------- Arranque ----------
  function enganchar() {
    $("pi-idioma").addEventListener("click", () => {
      Pagina.idioma = Pagina.idioma === "es" ? "en" : "es";
      escribir(CLAVE_IDIOMA, Pagina.idioma);
      pintarTodo();
    });
    $("pi-evento-filtro").addEventListener("change", (e) => cambiarFiltroEvento(e.target.value));
    $("pi-lista").addEventListener("change", (e) => { if (abrir(e.target.value)) { $("pi-otra-pestana").hidden = true; pintarTodo(); avisarPestanas(); } });
    $("pi-nuevo").addEventListener("click", () => {
      crear();
      estado.ficha = "torneo";
      pintarTodo();
      $("pi-form-torneo").elements.nombre.focus();
    });
    const fichas = $("pi-fichas");
    fichas.addEventListener("click", (e) => { const b = e.target.closest("[data-ficha]"); if (b) irA(b.dataset.ficha); });
    fichas.addEventListener("keydown", (e) => {
      // La barra es vertical en la computadora y horizontal en el celular: sirven las cuatro flechas.
      const visibles = FICHAS.filter((f) => $("pi-f-" + f).checkVisibility());
      const i = Math.max(0, visibles.indexOf(estado.ficha));
      const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: -i, End: visibles.length - 1 - i }[e.key];
      if (k == null) return;
      e.preventDefault();
      irA(visibles[(i + k + visibles.length) % visibles.length], true);
    });
    engancharMenus();
    $("pi-clas-proyectar").addEventListener("click", () => abrirProyector("clasificacion", "pi-clas-proyectar"));
    $("pi-ir-agregar").addEventListener("click", () => { $("pi-jug-agregar").scrollIntoView({ block: "start" }); $("pi-form-jugador").elements.nombre.focus(); });

    // «Solo lo de los JDE»: esconde el comprobador, el generador y los créditos.
    const modoJde = $("pi-modo-jde");
    modoJde.checked = leer(CLAVE_MODO_JDE) === "1";
    document.body.classList.toggle("pi-modo-jde", modoJde.checked);
    modoJde.addEventListener("change", () => {
      escribir(CLAVE_MODO_JDE, modoJde.checked ? "1" : "0");
      document.body.classList.toggle("pi-modo-jde", modoJde.checked);
      if (modoJde.checked && estado.ficha === "herramientas") irA("archivos");
    });
    const sonido = $("pi-sonido-ronda");
    sonido.checked = leer(CLAVE_SONIDO) === "1";
    sonido.addEventListener("change", () => { escribir(CLAVE_SONIDO, sonido.checked ? "1" : "0"); if (sonido.checked) sonar(); });
    $("pi-form-torneo").addEventListener("change", alCambiarTorneo);
    $("pi-config-jde-aplicar").addEventListener("click", aplicarConfigJde);
    $("pi-form-torneo").addEventListener("submit", (e) => e.preventDefault());
    $("pi-desempate-agregar").addEventListener("click", () => {
      const c = $("pi-desempate-nuevo").value;
      if (!c || configFija(t())) return;
      t().desempates.push(c);
      guardar();
      pintarDesempates();
      $("pi-desempate-nuevo").focus();
    });

    $("pi-form-torneo").addEventListener("input", alEscribirTorneo);
    $("pi-form-jugador").addEventListener("input", guardarBorrador);
    // La lista de categorías sigue a la fecha de nacimiento.
    $("pi-form-jugador").elements.nacimiento.addEventListener("change", () => pintarCategorias(true));
    $("pi-form-jugador").elements.categoria.addEventListener("input", () => pintarCategorias(false));
    $("pi-pegar").addEventListener("input", guardarBorrador);
    window.addEventListener("pagehide", guardarAlSalir);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") guardarAlSalir(); });
    $("pi-form-jugador").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      const d = datosJugador(Object.fromEntries(new FormData(f)));
      if (!d.nombre) { Avisos.avisar(tx("faltaNombre"), { tipo: "error" }); f.elements.nombre.focus(); return; }
      agregarJugadores([d]);
      f.reset();
      pintarCategorias(false);
      guardarBorrador();
      f.elements.nombre.focus();
    });
    $("pi-pegar-agregar").addEventListener("click", () => {
      const lineas = $("pi-pegar").value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const lista = lineas.map((l) => {
        const [nombre, institucion, elo, titulo, fed, fideId, categoria] = l.split(/\t|;/).map((x) => x.trim());
        return datosJugador({ nombre, institucion, elo, titulo, fed, fideId, categoria });
      });
      const n = agregarJugadores(lista);
      if (n) { $("pi-pegar").value = ""; guardarBorrador(); Avisos.avisar(tx("agregados", { n })); }
      else Avisos.avisar(tx("nadaQueAgregar"), { tipo: "error" });
    });
    $("pi-ir-subir-lista").addEventListener("click", () => {
      irA("torneo");
      $("pi-caja-subir-lista").scrollIntoView({ block: "nearest" });
      $("pi-subir-lista").focus();
    });
    $("pi-subir-lista").addEventListener("change", (e) => {
      const fs = Array.from(e.target.files || []);
      e.target.value = "";
      if (fs.length) subirLista(fs);
    });
    $("pi-elo-nacional").addEventListener("click", buscarEloNacional);
    $("pi-listas-lista").value = listaEloInicial();
    $("pi-listas-lista").addEventListener("change", (e) => { escribir(CLAVE_LISTA_ELO, e.target.value); pintarListaElo(); });
    $("pi-listas-form").addEventListener("submit", (e) => { e.preventDefault(); buscarEnListaElo(); });
    $("pi-buscar-jugador").addEventListener("input", (e) => { estado.filtroJugador = e.target.value; pintarJugadores(); });
    $("pi-ver-copiar").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText($("pi-ver-direccion").textContent); Avisos.avisar(tx("enlaceCopiado")); }
      catch (e) { Avisos.avisar(tx("noCopia"), { tipo: "error" }); }
    });
    $("pi-ver-en-vivo").addEventListener("change", async (e) => {
      if (e.target.checked) { if (!(await activarEnVivo())) return; } else desactivarEnVivo();
      if (estado.ronda != null) compartirLectura(estado.ronda);
    });
    $("pi-ver-en-vivo-nuevo-codigo").addEventListener("click", async () => {
      desactivarEnVivo();
      t().liveCodigo = nuevoCodigoVivo();
      guardar();
      $("pi-ver-en-vivo").checked = true;
      if (await activarEnVivo() && estado.ronda != null) compartirLectura(estado.ronda);
    });
    $("pi-clas-institucion").addEventListener("change", (e) => { estado.filtroInstitucion = e.target.value; pintarClasificacion(); });
    $("pi-cruzada-institucion").addEventListener("change", (e) => { estado.filtroInstitucion = e.target.value; pintarCruzada(); });
    $("pi-clas-pdf").addEventListener("click", () => bajarPDF($("pi-clas-pdf"), datosClasificacionPDF, "clasificacion"));
    $("pi-clas-pared").addEventListener("click", imprimirClasificacionPared);
    $("pi-clas-whatsapp").addEventListener("click", () => {
      const texto = PareoCompartir.textoClasificacion(t(), { idioma: Pagina.idioma, enlace: enlaceVivoActual() });
      if (!texto) { Avisos.avisar(tx("paredSinRondas"), { tipo: "error" }); return; }
      abrirCompartir($("pi-clas-compartir"), $("pi-clas-whatsapp"), texto);
    });
    $("pi-cruzada-pdf").addEventListener("click", () => bajarPDF($("pi-cruzada-pdf"), datosCruzadaPDF, "cruzada"));

    document.querySelectorAll(".pi-imprimir").forEach((b) => b.addEventListener("click", () => window.print()));
    $("pi-bajar-trf").addEventListener("click", () => {
      try { bajar(nombreArchivo(".trf"), trfDelTorneo()); }
      catch (e) { Avisos.avisar(e.message, { tipo: "error" }); }
    });
    $("pi-bajar-trf-equipos").addEventListener("click", () => {
      const k = rondasCompletas();
      if (k < t().rondas.length) Avisos.avisar(tx("trfSoloCompletas", { r: k }), { tipo: "info" });
      bajar(nombreArchivo("-equipos.trf"), E.aTrfEquipos(t(), k));
    });
    $("pi-bajar-json").addEventListener("click", () => bajar(nombreArchivo(".json"), JSON.stringify(t(), null, 1), "application/json"));
    $("pi-bajar-jugadores").addEventListener("click", () => {
      const v = t();
      if (!v.jugadores.length) { Avisos.avisar(tx("sinJugadoresQueExportar"), { tipo: "error" }); return; }
      const orden = T.ordenInicial(v);
      const filas = orden.map((id) => {
        const j = jugador(id);
        return [j.nombre, j.institucion || "", Number(j.elo) > 0 ? j.elo : "", j.titulo || "", j.fed || "", j.fideId || "", j.categoria || ""];
      });
      CsvExcel.bajar(nombreArchivo("-jugadores.csv"), [tx("nombre"), tx("institucion"), "Elo", tx("titulo"), tx("fed"), tx("fideId"), tx("categoria")], filas);
    });
    $("pi-archivar").addEventListener("click", () => {
      const caja = $("pi-archivar-caja");
      caja.hidden = !caja.hidden;
      $("pi-archivar").setAttribute("aria-expanded", caja.hidden ? "false" : "true");
      pintarArchivar();
    });
    $("pi-borrar").addEventListener("click", async () => {
      const ok = await Avisos.confirmar(tx("confirmarBorrar", { n: t().nombre || tx("sinNombre") }), { aceptar: tx("borrarTorneo"), peligro: true });
      if (!ok) return;
      quitar(PREFIJO + estado.id);
      estado.lista = estado.lista.filter((x) => x.id !== estado.id);
      escribir(CLAVE_LISTA, JSON.stringify(estado.lista));
      const otro = estado.lista.slice().sort((a, b) => b.actualizado - a.actualizado)[0];
      if (!otro || !abrir(otro.id)) crear();
      pintarTodo();
      Avisos.avisar(tx("borrado"));
    });
    $("pi-abrir").addEventListener("change", (e) => leerArchivo(e.target, (nombre, texto) => {
      try { abrirTexto(nombre, texto); } catch (x) { Avisos.avisar(tx("noAbre", { e: x.message }), { tipo: "error" }); }
    }));
    $("pi-fpc").addEventListener("click", () => {
      const texto = $("pi-fpc-texto").value;
      if (!texto.trim()) { Avisos.avisar(tx("pegaTrf"), { tipo: "error" }); return; }
      comprobarTexto(texto);
    });
    $("pi-fpc-este").addEventListener("click", () => {
      if (t().sistema !== "suizo") { Avisos.avisar(tx("soloSuizo"), { tipo: "info" }); return; }
      try { const trf = trfDelTorneo(); $("pi-fpc-texto").value = trf; comprobarTexto(trf); }
      catch (e) { Avisos.avisar(e.message, { tipo: "error" }); }
    });
    $("pi-fpc-archivo").addEventListener("change", (e) => leerArchivo(e.target, (n, texto) => { $("pi-fpc-texto").value = texto; comprobarTexto(texto); }));
    const semilla = () => {
      const s = Math.round(Number($("pi-rtg-semilla").value));
      if (s >= 1) return s;
      const nueva = 1 + Math.floor(Math.random() * 999999);
      $("pi-rtg-semilla").value = nueva;
      return nueva;
    };
    $("pi-rtg").addEventListener("click", async () => {
      const s = semilla();
      try { bajar("azar-" + s + ".trf", await motor.generar(s)); }
      catch (e) { Avisos.avisar(tx("errorMotor", { e: e.message }), { tipo: "error" }); }
    });
    $("pi-rtg-abrir").addEventListener("click", async () => {
      const s = semilla();
      try {
        const nuevo = T.deTrf(await motor.generar(s));
        nuevo.nombre = tx("torneoAzar", { s });
        crear(nuevo);
        estado.ficha = "clasificacion";
        pintarTodo();
        Avisos.avisar(tx("abierto", { n: nuevo.nombre }));
      } catch (e) { Avisos.avisar(tx("errorMotor", { e: e.message }), { tipo: "error" }); }
    });
  }

  // ---------- Usarlo sin internet ----------
  // El service worker del sitio va siempre a la red primero y, sin señal,
  // sirve lo que encuentre guardado (sw.js). Pero solo guarda lo que pasó por
  // él: el motor y su .wasm se piden recién al emparejar, y en la primera
  // visita la página carga antes de que él exista. Así que la página guarda
  // por su cuenta todo lo que necesita —ella misma con y sin .html, sus
  // scripts y hojas, el motor, el QR, las letras y el manual— en la caché que
  // no se borra al cambiar de versión (la misma de «Ejercicios sin internet»),
  // y la renueva cada 6 horas con señal. Lo en vivo, el Elo Nacional y pasar
  // el evento a otra computadora necesitan conexión: lo dice.
  const CACHE_SIN_RED = "ajedrez-integral-sin-red";
  const CLAVE_SIN_RED = "pareo_sin_red_v1";
  const EXTRA_SIN_RED = ["js/pareo/motor-worker.js", "js/vendor/bbppairings/bbppairings.js", "js/vendor/bbppairings/bbppairings.wasm",
    "js/vendor/qrcode.js", "pareo-manual.html", "js/pareo/manual.js", "img/favicon.svg", "manifest.json"];
  function decirSinRed(clave, vars) {
    const p = $("pi-sin-red");
    if (!p) return;
    p.hidden = false;
    p.textContent = tx(clave, vars);
  }
  async function archivosSinRed() {
    const urls = new Set();
    document.querySelectorAll("script[src], link[rel='stylesheet'][href], img[src]").forEach((n) => {
      const u = new URL(n.getAttribute("src") || n.getAttribute("href"), location.href);
      if (u.origin === location.origin) urls.add(u.pathname);
    });
    for (const x of EXTRA_SIN_RED) urls.add(new URL(x, location.href).pathname);
    // Las letras: las que nombra css/fuentes.css.
    try {
      const css = await (await fetch("css/fuentes.css", { cache: "no-store" })).text();
      for (const m of css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) urls.add(new URL(m[1], location.origin + "/css/").pathname);
    } catch (e) { /* sin las letras, se ve con las del sistema */ }
    return [...urls];
  }
  async function prepararSinRed() {
    if (!window.caches || !("serviceWorker" in navigator)) { decirSinRed("sinRedNoSePuede"); return; }
    if (navigator.onLine === false) {
      const ya = Number(leer(CLAVE_SIN_RED)) || 0;
      decirSinRed(ya ? "sinRedAhora" : "sinRedAhoraSinGuardar");
      return;
    }
    const ultima = Number(leer(CLAVE_SIN_RED)) || 0;
    if (Date.now() - ultima < 6 * 3600 * 1000 && await caches.has(CACHE_SIN_RED)) { decirSinRed("sinRedListo"); return; }
    decirSinRed("sinRedGuardando");
    try {
      const cache = await caches.open(CACHE_SIN_RED);
      let todo = true;
      const guardar1 = async (ruta, nombres) => {
        try {
          const r = await fetch(ruta, { cache: "no-store" });
          if (!r.ok) { todo = false; return; }
          // Sin la marca de «redirigida»: una así no sirve para abrir una página.
          const cuerpo = await r.blob();
          for (const n of nombres) await cache.put(n, new Response(cuerpo, { status: 200, headers: r.headers }));
        } catch (e) { todo = false; }
      };
      const base = location.pathname.replace(/\.html$/, "");
      await guardar1(base + ".html", [base + ".html", base]);
      await Promise.all((await archivosSinRed()).map((u) => guardar1(u, [u])));
      if (todo) { escribir(CLAVE_SIN_RED, String(Date.now())); decirSinRed("sinRedListo"); }
      else decirSinRed("sinRedIncompleto");
    } catch (e) { decirSinRed("sinRedIncompleto"); }
  }

  function arrancar() {
    // El enlace de solo lectura (#ver= o #vivo=) no toca nada del torneo
    // guardado en este navegador: ni lo lee ni lo pisa. Es una página
    // distinta adentro de la misma página.
    // Cada uno con su botón de idioma, que vuelve a abrir la misma dirección.
    const modoVer = () => {
      // Lo que ve el público (o el adjunto, el capitán…) va sin licencia:
      // el editor queda escondido. Ver js/candado-herramienta.js.
      if (window.CandadoHerramienta) window.CandadoHerramienta.liberar();
      $("pi-editor").hidden = true;
      $("pi-ver-barra").hidden = false;
      $("pi-ver-barra").prepend(PareoVer.botonIdioma(Pagina.idioma, (n) => { escribir(CLAVE_IDIOMA, n); location.reload(); }));
    };
    if (location.hash.startsWith("#ver=")) {
      modoVer();
      PareoVer.iniciar(location.hash.slice(5), Pagina.idioma);
      return;
    }
    // El adjunto que entra escribiendo su código (sin enlace, sin cuenta).
    if (location.hash === "#codigo" || location.hash.startsWith("#codigo=")) {
      modoVer();
      PareoVer.entrarConCodigo(location.hash.slice(8), Pagina.idioma);
      return;
    }
    if (location.hash.startsWith("#adjunto=")) {
      modoVer();
      PareoVer.iniciarAdjunto(location.hash.slice(9), Pagina.idioma);
      return;
    }
    if (location.hash.startsWith("#mesa=")) {
      modoVer();
      PareoVer.irAMesa(location.hash.slice(6), Pagina.idioma);
      return;
    }
    if (location.hash.startsWith("#firma=")) {
      modoVer();
      PareoVer.iniciarFirma(location.hash.slice(7), Pagina.idioma);
      return;
    }
    if (location.hash.startsWith("#inscribir=")) {
      modoVer();
      PareoVer.iniciarInscribir(location.hash.slice(11), Pagina.idioma);
      return;
    }
    if (location.hash.startsWith("#capitan=")) {
      modoVer();
      PareoVer.iniciarCapitan(location.hash.slice(9), Pagina.idioma);
      return;
    }
    // En las páginas para ver, pasar de un torneo a otro cambia solo el «#»:
    // se vuelve a cargar para abrir lo que dice.
    if (/^#(evento|vivo|ver)=/.test(location.hash)) window.addEventListener("hashchange", () => location.reload());
    if (location.hash.startsWith("#evento=")) {
      modoVer();
      PareoVer.iniciarEvento(location.hash.slice(8), Pagina.idioma);
      return;
    }
    if (location.hash.startsWith("#vivo=")) {
      modoVer();
      PareoVer.iniciarVivo(location.hash.slice(6), Pagina.idioma);
      return;
    }
    if (!FICHAS.includes(estado.ficha)) estado.ficha = "jugadores";
    const ultimo = leer("pareo_abierto_v1");
    if (!(ultimo && abrir(ultimo))) {
      const otro = estado.lista.slice().sort((a, b) => b.actualizado - a.actualizado)[0];
      if (!(otro && abrir(otro.id))) crear();
    }
    enganchar();
    pintarTodo();
    restaurarBorrador();
    if (window.PareoNube) window.PareoNube.iniciar({ tx, hora: horaCR, clases: C, local: nubeLocal, alTraer: alTraerDeLaNube });
    avisarPestanas();
    if (location.hash.startsWith("#recibir=")) recibirEvento(location.hash.slice(9));
    if (location.hash === "#desde=inscripcion-jde") recogerDeInscripcion();
    if (/^#org-(correo|recuperar)=/.test(location.hash)) enlaceOrganizacion(location.hash);
    // Después de pintar: que no compita con lo que se ve primero.
    setTimeout(() => { prepararSinRed(); }, 1500);
    window.addEventListener("offline", () => decirSinRed(leer(CLAVE_SIN_RED) ? "sinRedAhora" : "sinRedAhoraSinGuardar"));
    window.addEventListener("online", () => prepararSinRed());
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();

/*! rev bfb5bbb0d2d82f9f */
