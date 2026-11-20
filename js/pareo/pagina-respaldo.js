/* ===== Pareo Integral — la página (pareo.html): que no se pierda nada =====
 *
 * El campo a medio escribir, el borrador al salir, el respaldo en un archivo y el automático, el
 * historial de cambios y deshacer, dos pestañas con el mismo torneo, y pasar el evento a otra
 * computadora (abrir un respaldo, leer un archivo).
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
  const { T, V, motor, CLAVE_LISTA, PREFIJO, C, escribir, quitar, leerJSON, $, el, tx, estado,
    nuevoCodigoVivo, guardar, abrir, crear, t, bajar, pintarTodo, alCambiarTorneo, pintarCategorias,
    torneosDelEvento, pintarEvento, horaCR } = Pagina;

  // ---------- Que cerrar la página por accidente no borre nada ----------
  // Todo cambio ya se guarda al momento en el navegador (guardar). Lo que
  // quedaba fuera: lo escrito en un campo sin salir de él, el jugador o la
  // lista a medio escribir, lo marcado antes de emparejar (v.pedidas) y el
  // archivo del respaldo automático. Y que el navegador no borre los datos
  // por falta de espacio: se le pide guardarlos para siempre (persist).
  function pedirAlmacenamientoFijo() {
    if (estado.persistencia || !navigator.storage || !navigator.storage.persist) return;
    estado.persistencia = true;
    navigator.storage.persist().catch(() => {});
  }
  // Lo escrito en los datos del torneo se guarda mientras se escribe (no
  // solo al salir del campo).
  let temporizadorCampo = null, campoPendiente = null;
  function alEscribirTorneo(e) {
    const x = e.target;
    if (!x.name || x.type === "number" || x.type === "radio" || x.type === "checkbox" || x.tagName === "SELECT" || x.readOnly) return;
    clearTimeout(temporizadorCampo);
    campoPendiente = x;
    temporizadorCampo = setTimeout(guardarCampoPendiente, 500);
  }
  function guardarCampoPendiente() {
    clearTimeout(temporizadorCampo);
    temporizadorCampo = null;
    const x = campoPendiente;
    campoPendiente = null;
    if (x && x.isConnected) alCambiarTorneo({ target: x });
  }
  // El jugador y la lista a medio escribir: un borrador por torneo.
  const CLAVE_BORRADOR = "pareo_borrador_v1";
  function guardarBorrador() {
    const d = {};
    for (const x of $("pi-form-jugador").elements) if (x.name && x.value) d[x.name] = x.value;
    const pegar = $("pi-pegar").value;
    if (!Object.keys(d).length && !pegar.trim()) { escribir(CLAVE_BORRADOR, ""); return; }
    escribir(CLAVE_BORRADOR, JSON.stringify({ id: estado.id, jugador: d, pegar }));
  }
  function restaurarBorrador() {
    const b = leerJSON(CLAVE_BORRADOR, null);
    if (!b || b.id !== estado.id) return;
    const f = $("pi-form-jugador");
    for (const [k, val] of Object.entries(b.jugador || {})) if (f.elements[k]) f.elements[k].value = val;
    if (b.pegar) { $("pi-pegar").value = b.pegar; $("pi-pegar-caja").open = true; }
    pintarCategorias(false);
    Avisos.avisar(tx("borradorRecuperado"), { tipo: "info" });
  }
  // Al cerrar o esconder la pestaña: lo que estaba por guardarse, ya.
  function guardarAlSalir() {
    if (campoPendiente) guardarCampoPendiente();
    guardarBorrador();
  }

  // El archivo del respaldo automático se recuerda (IndexedDB guarda el
  // permiso de Chrome y Edge): al volver a abrir, un clic lo retoma.
  const BD_RESPALDO = "pareo-respaldo";
  function bdRespaldo(modo, fn) {
    return new Promise((ok, mal) => {
      if (!window.indexedDB) { ok(null); return; }
      const pedido = indexedDB.open(BD_RESPALDO, 1);
      pedido.onupgradeneeded = () => pedido.result.createObjectStore("archivos");
      pedido.onerror = () => mal(pedido.error);
      pedido.onsuccess = () => {
        try {
          const tx2 = pedido.result.transaction("archivos", modo);
          const r = fn(tx2.objectStore("archivos"));
          tx2.oncomplete = () => ok(r && "result" in r ? r.result : null);
          tx2.onerror = () => mal(tx2.error);
        } catch (e) { mal(e); } // (un archivo que no se puede guardar: no se recuerda)
      };
    });
  }
  const recordarArchivoRespaldo = (id, archivo) => bdRespaldo("readwrite", (s) => (archivo ? s.put(archivo, id) : s.delete(id))).catch(() => null);
  const archivoRecordado = (id) => bdRespaldo("readonly", (s) => s.get(id)).catch(() => null);
  async function retomarRespaldo(ev, archivo) {
    try {
      if ((await archivo.requestPermission({ mode: "readwrite" })) !== "granted") return;
    } catch (e) { return; }
    estado.respaldoArchivo = { id: ev.id, archivo };
    await escribirRespaldo();
    pintarEvento();
    Avisos.avisar(tx("respaldoRetomado", { a: archivo.name }));
  }

  function guardarDelEvento(tor) {
    if (tor === t() || tor.__id === estado.id) { guardar(); return true; }
    const ok = escribir(PREFIJO + tor.__id, JSON.stringify(tor));
    if (!ok) Avisos.avisar(tx("noGuarda"), { tipo: "error" });
    return ok;
  }

  // Los PDF de Pareo Integral llevan arriba el nombre y el logo de la
  // organización de este navegador, si tiene (la marca de agua sigue siendo
  // la de Ajedrez Integral). Si el logo no se puede armar, sale con el nombre.
  async function conOrganizacion(doc) {
    const o = Pagina.organizacion();
    if (!o || !o.nombre || doc.cabecera) return doc;
    let logo = null;
    if (o.logo && window.MarcaAgua && window.MarcaAgua.prepararDesdeDatos) {
      try { logo = await window.MarcaAgua.prepararDesdeDatos(o.logo); } catch (e) { logo = null; }
    }
    return Object.assign({}, doc, { cabecera: { nombre: o.nombre, color: "#102a43", logo } });
  }
  function bajarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: nombre });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function bajarDocumento(doc, sufijo, boton) {
    if (boton) boton.disabled = true;
    try {
      bajarBlob(await window.PareoPDF.generar(await conOrganizacion(doc)), window.PareoPDF.nombreArchivo(doc.subtitulo, sufijo));
    } catch (e) {
      Avisos.avisar(tx("noPdf", { e: e.message }), { tipo: "error" });
    } finally {
      if (boton) boton.disabled = false;
    }
  }

  // El historial de cambios de este torneo y «Deshacer el último cambio».
  // Vive en esta pestaña: al recargar la página empieza de cero.
  function pintarHistorial() {
    const caja = $("pi-historial");
    const lista = estado.historial.get(estado.id) || [];
    caja.replaceChildren(el("h3", { class: "font-semibold", texto: tx("histTitulo") }),
      el("p", { class: C.nota, texto: tx("histTexto") }));
    if (!lista.length) { caja.append(el("p", { class: C.nota + " mt-1", texto: tx("histVacio") })); return; }
    const b = el("button", { type: "button", id: "pi-deshacer", class: C.botonSec + " mt-2" }, tx("histDeshacer"));
    b.addEventListener("click", deshacerUltimo);
    caja.append(b, el("ol", { id: "pi-historial-lista", class: "mt-2 space-y-1 text-sm list-decimal pl-6" }, lista.slice().reverse().map((x) =>
      el("li", { texto: horaCR(x.hora) + " · " + x.cambios.slice(0, 4).map((c) => tx(c.clave, c.vars)).join("; ") + (x.cambios.length > 4 ? " (+" + (x.cambios.length - 4) + ")" : "") }))));
  }
  async function deshacerUltimo() {
    const lista = estado.historial.get(estado.id) || [];
    const x = lista[lista.length - 1];
    if (!x) return;
    const ok = await Avisos.confirmar(tx("histConfirmar", { c: x.cambios.map((c) => tx(c.clave, c.vars)).join("; ") }), { aceptar: tx("histDeshacer") });
    if (!ok || lista[lista.length - 1] !== x) return;
    lista.pop();
    estado.t = T.nuevo(JSON.parse(x.antes));
    estado.deshaciendo = true;
    guardar();
    estado.deshaciendo = false;
    pintarTodo();
    Avisos.avisar(tx("histDeshecho"));
  }

  // ---------- Dos pestañas con el mismo torneo ----------
  // Cada pestaña dice cuál torneo tiene abierto; si otra tiene el mismo, o
  // si otra pestaña lo guardó por debajo (el evento «storage» llega solo a
  // las demás), se avisa: lo que guarde esta puede pisar lo de la otra.
  const canalPestanas = (() => { try { return new BroadcastChannel("pareo-pestanas"); } catch (e) { return null; } })();
  const yo = "p" + Math.random().toString(36).slice(2);
  function avisarPestanas() { if (canalPestanas && estado.id) canalPestanas.postMessage({ yo, id: estado.id }); }
  function otraPestana(clave) {
    const caja = $("pi-otra-pestana");
    // «La otra guardó cambios» es más grave que «está abierta en otra»: no
    // se tapa con el aviso más leve (los dos llegan en cualquier orden).
    if (clave === "pestanaMisma" && !caja.hidden && caja.dataset.aviso === "pestanaCambio") return;
    caja.dataset.aviso = clave;
    const recargar = el("button", { type: "button", id: "pi-otra-cargar", class: C.botonSec + " mt-2" }, tx("pestanaCargar"));
    recargar.addEventListener("click", () => { if (abrir(estado.id)) { caja.hidden = true; pintarTodo(); } });
    caja.replaceChildren(el("p", { class: "font-semibold", texto: tx(clave) }), recargar);
    caja.hidden = false;
  }
  if (canalPestanas) canalPestanas.addEventListener("message", (e) => {
    const d = e.data || {};
    if (d.yo === yo || d.id !== estado.id) return;
    otraPestana("pestanaMisma");
    // Contestar una vez, para que la otra también se entere.
    if (!d.respuesta) canalPestanas.postMessage({ yo, id: estado.id, respuesta: true });
  });
  window.addEventListener("storage", (e) => {
    if (!estado.id || e.key !== PREFIJO + estado.id || e.newValue == null || e.newValue === estado.ultimoGuardado) return;
    otraPestana("pestanaCambio");
  });

  // ---------- El respaldo automático del evento ----------
  // Con un archivo elegido una vez (la API de archivos de Chrome y Edge), el
  // respaldo del evento se escribe solo, unos segundos después de cada
  // cambio. Sin esa API, se baja solo cada vez que se completa una ronda.
  let temporizadorRespaldo = null;
  function programarRespaldo() {
    clearTimeout(temporizadorRespaldo);
    temporizadorRespaldo = setTimeout(escribirRespaldo, 3000);
  }
  async function escribirRespaldo() {
    const r = estado.respaldoArchivo;
    if (!r) return;
    const lista = torneosDelEvento(r.id);
    if (!lista.length) return;
    const texto = JSON.stringify(V.respaldo(lista[0].evento, lista), null, 1);
    try {
      if (r.archivo) {
        const w = await r.archivo.createWritable();
        await w.write(texto);
        await w.close();
      } else {
        // Sin la API: solo cuando una ronda queda completa, y una vez por ronda.
        const clave = lista.map((x) => x.rondas.filter((R) => T.rondaCompleta(R)).length).join(",");
        if (clave === r.ultimaClave) return;
        r.ultimaClave = clave;
        bajar(window.PareoPDF.nombreArchivo(lista[0].evento.nombre, "respaldo").replace(/\.pdf$/, ".json"), texto, "application/json");
      }
      r.hora = Date.now();
      const x = $("pi-respaldo-estado");
      if (x) x.textContent = tx("respaldoAutoHecho", { h: horaCR(r.hora) });
    } catch (e) {
      Avisos.avisar(tx("respaldoAutoError", { e: e.message }), { tipo: "error" });
    }
  }
  async function prenderRespaldo(ev) {
    if (window.showSaveFilePicker) {
      try {
        const archivo = await window.showSaveFilePicker({ suggestedName: window.PareoPDF.nombreArchivo(ev.nombre, "respaldo").replace(/\.pdf$/, ".json"), types: [{ description: "JSON", accept: { "application/json": [".json"] } }] });
        estado.respaldoArchivo = { id: ev.id, archivo };
        recordarArchivoRespaldo(ev.id, archivo);
      } catch (e) { return; }
    } else {
      const lista = torneosDelEvento(ev.id);
      estado.respaldoArchivo = { id: ev.id, archivo: null, ultimaClave: lista.map((x) => x.rondas.filter((R) => T.rondaCompleta(R)).length).join(",") };
    }
    await escribirRespaldo();
    pintarEvento();
  }

  // ---------- Pasar el evento a otra computadora ----------
  // Un código nuevo cada vez y un canal de Supabase Realtime en modo
  // Broadcast (pareo-pasar-<código>). La otra computadora abre
  // pareo.html#recibir=<código> y pide; esta pregunta antes de mandar (el
  // evento trae datos de estudiantes) y lo manda comprimido, en partes.
  const PARTE = 60000;
  async function prenderPasar(ev) {
    try { await PareoVer.cargarSupabase(); }
    catch (e) { Avisos.avisar(tx("errorEnVivo", { e: e.message }), { tipo: "error" }); return; }
    const codigo = nuevoCodigoVivo();
    const canal = window.sb.channel("pareo-pasar-" + codigo);
    estado.pasar = { id: ev.id, codigo, canal, ocupado: false };
    canal.on("broadcast", { event: "pedir" }, async () => {
      const x = estado.pasar;
      if (!x || x.canal !== canal || x.ocupado) return;
      x.ocupado = true;
      try {
        const ok = await Avisos.confirmar(tx("pasarConfirmar", { e: ev.nombre || "" }), { aceptar: tx("pasarMandar") });
        if (!ok) { canal.send({ type: "broadcast", event: "negado", payload: {} }); return; }
        const texto = await PareoVer.empaquetar(V.respaldo(ev, torneosDelEvento(ev.id)));
        const n = Math.ceil(texto.length / PARTE);
        for (let i = 0; i < n; i++) await canal.send({ type: "broadcast", event: "parte", payload: { i, n, d: texto.slice(i * PARTE, (i + 1) * PARTE) } });
        Avisos.avisar(tx("pasarMandado"));
      } finally { x.ocupado = false; }
    });
    canal.subscribe();
  }
  function apagarPasar() {
    if (estado.pasar) { estado.pasar.canal.unsubscribe(); estado.pasar = null; }
  }
  async function mostrarPasar(cont) {
    const url = location.origin + location.pathname + "#recibir=" + estado.pasar.codigo;
    try { await PareoQr.cargar(); } catch (e) { Avisos.avisar(tx("errorQr", { e: e.message }), { tipo: "error" }); return; }
    cont.replaceChildren(el("div", { class: "flex flex-wrap items-start gap-4" },
      el("div", { class: "w-32 bg-white p-2 rounded-lg" }, PareoQr.svg(url, tx("qrEtiqueta"))),
      el("div", { class: "text-sm" }, el("p", { id: "pi-pasar-url", class: "break-all font-mono", texto: url }),
        el("p", { class: C.nota + " mt-1", texto: tx("pasarAyuda") }))));
  }
  // La que recibe: pide, junta las partes y lo abre como un respaldo.
  async function recibirEvento(codigo) {
    history.replaceState(null, "", location.pathname + location.search);
    try { await PareoVer.cargarSupabase(); }
    catch (e) { Avisos.avisar(tx("errorEnVivo", { e: e.message }), { tipo: "error" }); return; }
    const canal = window.sb.channel("pareo-pasar-" + String(codigo).replace(/[^a-z0-9]/g, ""));
    const partes = [];
    let listo = false;
    Avisos.avisar(tx("pasarEsperando"), { tipo: "info" });
    canal.on("broadcast", { event: "negado" }, () => { Avisos.avisar(tx("pasarNegado"), { tipo: "error" }); canal.unsubscribe(); });
    canal.on("broadcast", { event: "parte" }, async (msg) => {
      const p = msg.payload || {};
      if (listo || !Number.isInteger(p.i) || !Number.isInteger(p.n) || p.n < 1 || p.n > 200 || typeof p.d !== "string") return;
      partes[p.i] = p.d;
      if (partes.filter((x) => typeof x === "string").length < p.n) return;
      listo = true;
      canal.unsubscribe();
      try {
        const datos = await PareoVer.desempaquetar(partes.slice(0, p.n).join(""));
        if (!V.esRespaldo(datos)) throw new Error(tx("jsonNoEs"));
        await abrirRespaldo(datos);
      } catch (e) { Avisos.avisar(tx("noAbre", { e: e.message }), { tipo: "error" }); }
    });
    canal.subscribe((st) => { if (st === "SUBSCRIBED") canal.send({ type: "broadcast", event: "pedir", payload: {} }); });
  }

  // El respaldo de un evento: todos sus torneos de una vez. Si en este
  // navegador ya están (el mismo evento), se pregunta antes de reemplazarlos.
  async function abrirRespaldo(datos) {
    // Repetidos: del mismo evento Y con el mismo nombre que uno del archivo.
    // (Un archivo de torneos archivados trae solo algunos del evento: los que
    // siguen en este navegador no se tocan.)
    const nombres = new Set(datos.torneos.map((x) => x.nombre || ""));
    const ya = estado.lista.filter((x) => { const y = leerJSON(PREFIJO + x.id, null); return y && y.evento && y.evento.id === datos.evento.id && nombres.has(y.nombre || ""); });
    if (ya.length) {
      const ok = await Avisos.confirmar(tx("respaldoReemplazar", { n: ya.length }), { aceptar: tx("respaldoReemplazarSi"), peligro: true });
      if (!ok) return;
      for (const x of ya) quitar(PREFIJO + x.id);
      estado.lista = estado.lista.filter((x) => !ya.includes(x));
    }
    const ids = [];
    for (const x of datos.torneos) { crear(T.nuevo(x)); ids.push(estado.id); }
    const ahora = Date.now();
    ids.forEach((id, i) => { const x = estado.lista.find((y) => y.id === id); if (x) x.actualizado = ahora - i; });
    escribir(CLAVE_LISTA, JSON.stringify(estado.lista));
    abrir(ids[0]);
    pintarTodo();
    Avisos.avisar(tx("respaldoAbierto", { n: ids.length, e: datos.evento.nombre || "" }));
  }

  async function comprobarTexto(texto) {
    const caja = $("pi-fpc-resultado");
    caja.replaceChildren(el("p", { class: C.nota, texto: tx("comprobando") }));
    try {
      const r = await motor.comprobar(texto);
      const rondas = (r.salida.match(/: Round #\d+/g) || []).length;
      caja.replaceChildren(el("p", { class: "font-semibold " + (r.correcto ? "text-green-800 dark:text-green-300" : "text-red-700 dark:text-red-300"),
        texto: r.correcto ? tx("fpcBien", { r: rondas }) : tx("fpcMal") }));
      if (!r.correcto) caja.append(el("pre", { class: "mt-2 text-xs overflow-x-auto rounded-lg bg-brand-50 dark:bg-brand-950 p-3", texto: r.salida.trim() }));
    } catch (e) {
      caja.replaceChildren(el("p", { class: "font-semibold text-red-700 dark:text-red-300", texto: tx("fpcNoLee", { e: e.message }) }));
    }
  }

  function leerArchivo(input, hacer) {
    const f = input.files && input.files[0];
    input.value = "";
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { Avisos.avisar(tx("archivoGrande"), { tipo: "error" }); return; }
    f.text().then((texto) => hacer(f.name, texto)).catch((e) => Avisos.avisar(tx("noAbre", { e: e.message }), { tipo: "error" }));
  }

  Object.assign(Pagina, { pedirAlmacenamientoFijo, alEscribirTorneo, guardarBorrador, restaurarBorrador,
    guardarAlSalir, recordarArchivoRespaldo, archivoRecordado, retomarRespaldo, guardarDelEvento,
    conOrganizacion, bajarBlob, bajarDocumento, pintarHistorial, avisarPestanas, programarRespaldo,
    prenderRespaldo, prenderPasar, apagarPasar, mostrarPasar, recibirEvento, abrirRespaldo, comprobarTexto,
    leerArchivo });
})();

/*! rev bfb5bbb0d2d82f9f */
