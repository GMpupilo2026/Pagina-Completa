/* Ajedrez Integral — Creación de gafetes (gafetes.html).
 *
 * Se sube un Excel con la gente, se arma el diseño mirando la vista previa
 * (logos, colores por rol, bandera, íconos, horario, QR…), se aprueba, y con
 * ese diseño se crean los PDF de TODOS, listos para la imprenta. El diseño
 * aprobado queda guardado en este navegador y se puede bajar a un archivo,
 * para usarlo después con otro Excel (el del año que viene, otro evento).
 *
 * Los datos del Excel NUNCA salen de la computadora: se leen, se dibujan y
 * se arma el PDF acá mismo. No hay nada que guardar en la base, y una lista
 * con nombres de menores de edad no viaja a ningún servidor.
 *
 * El dibujo es de js/gafetes-dibujo.js (el mismo para la vista previa y para
 * el PDF) y el archivo de js/gafetes-pdf.js. Ver «Creación de gafetes» en
 * docs/decisiones/paneles.md.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const D = () => window.GafetesDibujo;
  const DPI = 450;
  const PALETA = ["#1d4ed8", "#1e6b34", "#6b21a8", "#7f1d1d", "#1f2937", "#9a3412", "#0f766e", "#9d174d", "#3730a3", "#365314"];

  function disenoNuevo() {
    return {
      version: 1,
      nombreDiseno: "Mi evento",
      aprobado: false,
      tamano: { ancho: 100, alto: 140 },
      imagenes: {},
      titulo: { texto: "", color: "#1b2a4a" },
      nombre: { linea1: "{Apellidos}", linea2: "{Nombre}", propio: true },
      detalles: ["FIDE ID: {FIDE ID}", "{Categoría}", ""],
      bandera: { plantilla: "{Federación}", texto: true },
      franja: { plantilla: "{Rol}" },
      iconos: [{ columna: "", dibujo: "telefono", imagen: null }, { columna: "", dibujo: "camara", imagen: null }],
      colores: { columna: "Rol", valores: {}, omision: "#1d4ed8" },
      dorso: {
        vertical: "{Rol}", repetirLogos: true, qr: "", qrMarca: true,
        encabezados: ["Actividad", "Fecha", "Hora"], horario: [],
      },
      codigo: { plantilla: "", sinCodigoSi: "" },
      fuentes: { titulo: { id: "league-spartan" }, texto: { id: "quicksand" } },
      salida: { separarPor: "" },
      fotoRecorte: null,     // { arriba, alto, cabeza }: qué parte de cada foto va al marco
      fotoCentro: false,     // con foto: la foto en el medio y el nombre debajo
    };
  }

  /* El del Centroamericano 2026: para no arrancar de cero. Sus logos son los
     del sitio, y entran al diseño como imágenes propias (el archivo del
     diseño se lleva todo). */
  async function disenoCentroamericano() {
    const d = disenoNuevo();
    d.nombreDiseno = "Centroamericano 2026";
    d.titulo.texto = "XXI CAMPEONATO CENTROAMERICANO Y\nDEL CARIBE DE LA JUVENTUD.\nSAN JOSÉ, 2026.";
    d.titulo.color = "#1e6b34";
    d.colores.valores = { atleta: "#1d4ed8", delegado: "#6b21a8", entrenador: "#7f1d1d", acompanante: "#7f1d1d", arbitro: "#1f2937", organizacion: "#1e6b34" };
    d.colores.etiquetas = { atleta: "Atleta", delegado: "Delegado", entrenador: "Entrenador", acompanante: "Acompañante", arbitro: "Árbitro", organizacion: "Organización" };
    d.dorso.qr = "https://fcacostarica.com/campeonato-centroamericano-y-del-caribe-de-la-juventud-2026/";
    d.dorso.horario = [
      ["Llegada", "01/11/2026", "3:00 p.m."], ["Congresillo", "01/11/2026", "7:00 p.m."], ["Inauguración", "02/11/2026", "9:00 a.m."],
      ["Ronda 1", "02/11/2026", "9:30 a.m."], ["Ronda 2", "02/11/2026", "3:30 p.m."], ["Ronda 3", "03/11/2026", "9:00 a.m."],
      ["Rapid", "03/11/2026", "3:00 p.m."], ["Ronda 4", "04/11/2026", "9:00 a.m."], ["Ronda 5", "04/11/2026", "3:00 p.m."],
      ["Ronda 6", "05/11/2026", "9:00 a.m."], ["Blitz", "05/11/2026", "3:00 p.m."], ["Ronda 7", "06/11/2026", "9:00 a.m."],
      ["Ronda 8", "06/11/2026", "3:00 p.m."], ["Ronda 9", "07/11/2026", "9:00 a.m."], ["Clausura", "07/11/2026", "5:00 p.m."],
      ["Salida", "08/11/2026", "11:00 a.m."],
    ];
    d.codigo.plantilla = "{Federación} {n}";
    for (const [id, ruta] of [["logoIzq", "img/fca-logo.png"], ["logoDer", "img/centroamericano-2026/cca-logo.png"], ["ilustracion", "img/centroamericano-2026/mascota-tablero.png"]]) {
      try { d.imagenes[id] = { nombre: ruta.split("/").pop(), datos: await aDatos(await (await fetch(ruta)).blob()) }; } catch (e) { /* sin ese logo */ }
    }
    return d;
  }

  /* El de la Eliminatoria Cantonal JDN CCDRPZ – ADAPZ 2026 (Pérez Zeledón,
     22/11/2026): el del Centroamericano con los logos de la ADAPZ y del
     CCDR, 5,5 × 8,5 cm, la foto de cada jugador (del fotógrafo, recortada
     a pasaporte; sin foto, la profe Karina con su gafete), un color por
     categoría y el horario de las bases. En el dorso, la profe Karina
     muestra el QR, que es de cada jugador ({QR}): lleva a su ficha en el
     torneo publicado en Pareo Integral (su mesa de cada ronda, sus puntos y
     su puesto, al día). Los datos salen de «Traer los jugadores de Pareo»
     (traerJdnPz) y las fotos de «Subir las fotos» (subirFotos). */
  async function disenoJdnPz() {
    const d = disenoNuevo();
    d.nombreDiseno = "Eliminatoria JDN PZ 2026";
    // 5,5 × 8,5 cm: la medida que pidió el dueño para estos (no la de 10 × 14).
    d.tamano = { ancho: 55, alto: 85 };
    d.titulo.texto = "ELIMINATORIA CANTONAL JDN\nCCDRPZ – ADAPZ 2026\nHOTEL DEL SUR, PÉREZ ZELEDÓN";
    d.titulo.color = "#1b2a4a";
    d.nombre = { linea1: "{Apellidos}", linea2: "{Nombre}", propio: true };
    // El club va en la franja (lo pidió el dueño): la categoría, arriba de los detalles.
    d.detalles = ["{Categoría}", "Elo {Elo}", "Juega el torneo {Torneo}"];
    d.bandera = { plantilla: "", texto: true };
    d.franja = { plantilla: "{Club}" };
    // Contraste con la letra blanca: U12 6,0:1, U16 5,4:1 y U20 14,2:1. La
    // categoría va también escrita en la franja: el color nunca va solo.
    d.colores = { columna: "Edad", valores: { u12: "#1d64b0", u16: "#0e7490", u20: "#1b2a4a" }, etiquetas: { u12: "U12", u16: "U16", u20: "U20" }, omision: "#1b2a4a" };
    d.dorso.vertical = "{Categoría}";
    d.dorso.horarioCentro = true;
    d.dorso.qr = "{QR}";
    d.dorso.qrTexto = "Escanéalo: | tu mesa en cada ronda, | tus puntos y tu puesto";
    // Las fotos del fotógrafo son de medio cuerpo, frente al tablero: se
    // recortan a tamaño pasaporte desde la cabeza (el pelo, la cara y la camisa).
    d.fotoRecorte = { arriba: 0.12, alto: 0.5, cabeza: true };
    // Con foto: la foto en el medio y el nombre debajo (lo pidió el dueño).
    d.fotoCentro = true;
    d.dorso.encabezados = ["Actividad", "Fecha", "Hora"];
    // El calendario de las bases (el mismo de #calendario en jdn-pz-2026.html).
    d.dorso.horario = [
      ["Ronda 1", "22/11/2026", "8:00 a.m."], ["Ronda 2", "22/11/2026", "10:00 a.m."], ["Almuerzo", "22/11/2026", "12:00 p.m."],
      ["Ronda 3", "22/11/2026", "1:00 p.m."], ["Ronda 4", "22/11/2026", "3:00 p.m."], ["Ronda 5", "22/11/2026", "5:00 p.m."],
      ["Clausura", "22/11/2026", "7:30 p.m."],
    ];
    d.codigo.plantilla = "{Edad} {n}";
    d.salida.separarPor = "Torneo";
    for (const [id, ruta] of [["logoIzq", "img/adapz/logo.jpg"], ["logoDer", "img/adapz/ccdr-pz.jpg"], ["ilustracion", "img/avatar-profe-karina/bienvenidos.webp"], ["ilustracionDorso", "img/avatar-profe-karina/presentando.webp"]]) {
      try { d.imagenes[id] = { nombre: ruta.split("/").pop(), datos: await aDatos(await (await fetch(ruta)).blob()) }; } catch (e) { /* sin esa imagen */ }
    }
    return d;
  }

  /* Los jugadores de la eliminatoria, directo de Pareo Integral: los dos
     torneos que encuentra js/jdn-pz-inscripcion.js (la organización con el
     sello), tal como están publicados. Salen solo los que el árbitro ya
     aceptó; quien se retiró, no. Es lo publicado (de lectura pública), así
     que no viaja nada que no esté ya a la vista: el ID FIDE no se publica
     nunca, por eso el gafete lleva el Elo. Cada fila trae su QR: la ficha
     del jugador en su torneo (torneos-pareo#t=<torneo>&j=<jugador>), que
     no cambia en todo el torneo aunque el árbitro corrija el nombre. */
  const SITIO = "https://ajedrez-integral.com/";
  async function filasJdnPz() {
    if (!window.JdnPzInscripcion) throw new Error("no cargó el buscador de los torneos");
    const t = await window.JdnPzInscripcion.buscarTorneos();
    const ids = ["U12", "U20"].map((k) => t[k] && t[k].id).filter(Boolean);
    if (!ids.length) throw new Error("todavía no hay torneos de la eliminatoria publicados en Pareo Integral");
    const { data, error } = await sb.from("pareo_publicados").select("id, nombre, datos").in("id", ids);
    if (error) throw error;
    const filas = [["Apellidos", "Nombre", "Categoría", "Edad", "Torneo", "Club", "Elo", "QR"]];
    const orden = (x) => ["U12", "U20"].indexOf(Object.keys(t).find((k) => t[k] && t[k].id === x.id));
    for (const x of (data || []).sort((a, b) => orden(a) - orden(b))) {
      const torneo = Object.keys(t).find((k) => t[k] && t[k].id === x.id);
      const jugadores = ((x.datos && x.datos.jugadores) || []).filter((j) => j && j.nombre && j.retiradoDespuesDe == null);
      jugadores.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
      for (const j of jugadores) {
        const [apellidos, nombre] = j.nombre.includes(",") ? j.nombre.split(",").map((p) => p.trim()) : [j.nombre.trim(), ""];
        const cat = String(j.categoria || "").trim();
        const edad = (cat.match(/\bU\s?\d{2}\b/i) || [torneo])[0].replace(/\s/g, "").toUpperCase();
        filas.push([apellidos, nombre, cat || torneo, edad, torneo, j.institucion || "", Number(j.elo) > 0 ? String(j.elo) : "",
          SITIO + "torneos-pareo#t=" + x.id + "&j=" + encodeURIComponent(j.id)]);
      }
    }
    if (filas.length < 2) throw new Error("los torneos todavía no tienen jugadores aceptados");
    return filas;
  }

  // Lo que falte en un diseño viejo o recortado, con lo de uno nuevo.
  function completar(d) {
    const base = disenoNuevo();
    const mezclar = (a, b) => {
      if (Array.isArray(a)) return Array.isArray(b) ? b : a;
      if (a && typeof a === "object") {
        const o = { ...a };
        if (b && typeof b === "object") for (const k of Object.keys(b)) o[k] = k in a ? mezclar(a[k], b[k]) : b[k];
        return o;
      }
      return b === undefined ? a : b;
    };
    const r = mezclar(base, d || {});
    while (r.detalles.length < 3) r.detalles.push("");
    while (r.iconos.length < 2) r.iconos.push(base.iconos[r.iconos.length]);
    return r;
  }

  const aDatos = (blob) => new Promise((ok, mal) => {
    const fr = new FileReader();
    fr.onload = () => ok(fr.result);
    fr.onerror = () => mal(fr.error);
    fr.readAsDataURL(blob);
  });
  const aBase64 = async (archivo) => {
    const b = new Uint8Array(await archivo.arrayBuffer());
    let s = "";
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  };

  /* ===================== Guardado en este navegador ===================== */
  // IndexedDB y no localStorage: el diseño lleva las imágenes y pasa de 5 MB.
  const BASE = "ajedrez-gafetes", ALMACEN = "disenos";
  function abrirBase() {
    return new Promise((ok, mal) => {
      const r = indexedDB.open(BASE, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    });
  }
  async function guardarLocal(d) {
    try {
      const db = await abrirBase();
      await new Promise((ok, mal) => {
        const tx = db.transaction(ALMACEN, "readwrite");
        tx.objectStore(ALMACEN).put(d, "actual");
        tx.oncomplete = ok; tx.onerror = () => mal(tx.error);
      });
      db.close();
    } catch (e) { /* sin IndexedDB (ventana privada): se sigue, se pierde al cerrar */ }
  }
  async function leerLocal() {
    try {
      const db = await abrirBase();
      const d = await new Promise((ok) => {
        const r = db.transaction(ALMACEN).objectStore(ALMACEN).get("actual");
        r.onsuccess = () => ok(r.result || null);
        r.onerror = () => ok(null);
      });
      db.close();
      return d;
    } catch (e) { return null; }
  }

  /* ===================== Estado ===================== */
  let diseno = disenoNuevo();
  let datos = null;          // { hoja, titulos, filas: [objeto por fila] }
  let tablaCruda = null;     // las filas tal cual vienen del Excel
  let recursos = null;       // fuentes, imágenes y QR del diseño, ya cargados
  let recursosDe = "";       // de qué versión del diseño son los recursos
  let filaVista = 0;
  let ultimoCampo = null;    // la última plantilla tocada: ahí entra la columna que se elige

  /* ===================== El Excel ===================== */
  const letra = (i) => { let s = ""; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

  function armarDatos() {
    if (!tablaCruda) { datos = null; return; }
    const filaTitulos = Number($("g-fila-titulos").value) || 0;   // 0: sin títulos
    const crudas = tablaCruda.filas;
    const ancho = crudas.reduce((m, f) => Math.max(m, f.length), 0);
    const titulos = [];
    for (let i = 0; i < ancho; i++) {
      const t = filaTitulos ? String((crudas[filaTitulos - 1] || [])[i] || "").trim() : "";
      titulos.push(t || letra(i));
    }
    const nombres = new Set(titulos.map((t) => D().columnasDe("{" + t + "}")[0]).filter(Boolean).map((t) => t.toLowerCase()));
    const filas = [];
    crudas.slice(filaTitulos).forEach((f) => {
      if (!f.some((c) => String(c == null ? "" : c).trim())) return;     // fila vacía
      const o = {};
      titulos.forEach((t, i) => { o[t] = f[i] == null ? "" : String(f[i]); });
      // Las letras de columna sirven siempre ({C}), salvo que un título se llame así.
      for (let i = 0; i < ancho; i++) if (!nombres.has(letra(i).toLowerCase())) o[letra(i)] = f[i] == null ? "" : String(f[i]);
      filas.push(o);
    });
    datos = { hoja: tablaCruda.hoja, titulos, filas };
  }

  async function subirExcel(archivo) {
    try {
      const r = await window.ReporteExcel.leer(archivo);
      if (!r.filas.length) throw new Error("La hoja está vacía.");
      await cargarTabla(r, `«${archivo.name}»`);
    } catch (e) {
      Avisos.avisar("No se pudo leer el Excel: " + (e.message || e), { tipo: "error" });
    }
  }

  async function traerJdnPz() {
    const boton = $("g-pareo-pz");
    boton.disabled = true;
    try {
      const filas = await filasJdnPz();
      await cargarTabla({ hoja: "Eliminatoria JDN PZ (Pareo Integral)", filas }, "los torneos de Pareo Integral");
    } catch (e) {
      Avisos.avisar("No se pudieron traer los jugadores: " + (e.message || e) + ".", { tipo: "error" });
    } finally {
      boton.disabled = false;
    }
  }

  // Una tabla (del Excel o de Pareo) pasa a ser la lista de los gafetes.
  async function cargarTabla(r, origen) {
    tablaCruda = r;
    // La fila de títulos: la primera con al menos dos celdas escritas.
    const primera = r.filas.findIndex((f) => f.filter((c) => String(c == null ? "" : c).trim()).length >= 2);
    $("g-fila-titulos").value = String(primera >= 0 ? primera + 1 : 1);
    armarDatos();
    emparejar();
    pintarFotos();
    filaVista = 0;
    pintarDatos();
    detectarColores();
    llenarFormulario();
    await refrescar();
    Avisos.avisar(`Se leyeron ${datos.filas.length} filas de ${origen}.`);
  }

  function pintarDatos() {
    const caja = $("g-datos-resumen");
    const tabla = $("g-datos-tabla");
    tabla.textContent = "";
    if (!datos) { caja.textContent = "Todavía no hay un Excel."; $("g-columnas").textContent = ""; return; }
    caja.textContent = `${datos.filas.length} personas en la hoja «${datos.hoja}». Toca una columna para ponerla en el campo que estás llenando.`;
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");
    datos.titulos.forEach((t) => { const th = document.createElement("th"); th.scope = "col"; th.className = "px-2 py-1 text-left whitespace-nowrap"; th.textContent = t; tr.append(th); });
    thead.append(tr);
    const tbody = document.createElement("tbody");
    datos.filas.slice(0, 5).forEach((f) => {
      const r = document.createElement("tr");
      datos.titulos.forEach((t) => { const td = document.createElement("td"); td.className = "px-2 py-1 whitespace-nowrap border-t border-brand-100 dark:border-brand-800"; td.textContent = f[t]; r.append(td); });
      tbody.append(r);
    });
    tabla.append(thead, tbody);
    const chips = $("g-columnas");
    chips.textContent = "";
    datos.titulos.forEach((t) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip-columna text-xs font-semibold px-2.5 py-1 rounded-full border border-brand-200 dark:border-brand-700 hover:border-accent-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500";
      b.textContent = t;
      b.addEventListener("click", () => ponerColumna(t));
      chips.append(b);
    });
    pintarListasDeColumnas();
  }

  // Lleva la columna a la última plantilla tocada (o a la del nombre).
  function ponerColumna(t) {
    const campo = ultimoCampo && !ultimoCampo.disabled ? ultimoCampo : null;
    if (!campo) { Avisos.avisar("Toca primero el campo donde va (por ejemplo, la línea del nombre).", { tipo: "info" }); return; }
    if (campo.tagName === "SELECT") { campo.value = t; campo.dispatchEvent(new Event("change", { bubbles: true })); return; }
    const ini = campo.selectionStart ?? campo.value.length, fin = campo.selectionEnd ?? campo.value.length;
    campo.value = campo.value.slice(0, ini) + "{" + t + "}" + campo.value.slice(fin);
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    campo.focus();
  }

  // Las listas que eligen una columna entera (color, íconos, sin código, separar).
  function pintarListasDeColumnas() {
    const titulos = datos ? datos.titulos : [];
    document.querySelectorAll("select[data-columna]").forEach((s) => {
      const actual = leerRuta(s.dataset.campo) || "";
      s.textContent = "";
      const vacia = document.createElement("option"); vacia.value = ""; vacia.textContent = s.dataset.vacia || "— ninguna —"; s.append(vacia);
      const todas = [...titulos];
      if (actual && !todas.includes(actual)) todas.push(actual);
      todas.forEach((t) => { const o = document.createElement("option"); o.value = t; o.textContent = t; s.append(o); });
      s.value = actual;
    });
  }

  /* ===================== Las fotos ===================== */
  /* Una foto por persona, en el marco de pasaporte del frente (`g.foto`).
     Se suben todas juntas y se emparejan solas por el nombre del archivo:
     el fotógrafo de la PZ las nombró «21 SUSSY.jpg» (un número y el primer
     nombre), así que cuenta que TODAS las palabras del archivo estén en el
     nombre del jugador (una sola letra, «SAMUEL M», es una inicial). Solo se
     empareja lo que no deja duda: un archivo que le sirve a uno solo, y de
     los que le sirven, el más preciso («SOFIA BADILLA» antes que «SOFIA»).
     Lo dudoso (tres «SAMUEL») queda sin foto y se elige a mano en la lista.
     Como los datos, las fotos NO salen de la computadora ni se guardan: se
     achican en el navegador y se pierden al cerrar la página. */
  let fotos = [];                 // [{ nombre, lienzo }]
  const fotoDe = new Map();       // clave de la fila → índice en `fotos` (-1: sin foto)
  const claveFila = (f) => String(D().valor(f, "QR") || [D().valor(f, "Apellidos"), D().valor(f, "Nombre")].join(", "));
  const palabras = (t) => plano(t).split(/[^a-z0-9ñ]+/).filter(Boolean);
  function plano(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  // Lo que dice el archivo, sin el número, la extensión ni «v2».
  const palabrasDeArchivo = (n) => palabras(n.replace(/\.[a-z0-9]+$/i, "")).filter((w) => !/^\d+$/.test(w) && !/^v\d$/.test(w));
  function leSirve(archivo, f) {
    const de = palabrasDeArchivo(archivo);
    const suyas = palabras([D().valor(f, "Nombre"), D().valor(f, "Apellidos")].join(" "));
    return de.length > 0 && de.every((w) => (w.length === 1 ? suyas.some((x) => x[0] === w) : suyas.includes(w)));
  }
  function emparejar() {
    if (!datos) return;
    const elegidos = new Map();
    datos.filas.forEach((f) => {
      const k = claveFila(f);
      if (fotoDe.has(k)) return;                 // lo que se eligió a mano se respeta
      const sirven = fotos.map((x, i) => i).filter((i) => leSirve(fotos[i].nombre, f));
      if (!sirven.length) return;
      const largo = (i) => palabrasDeArchivo(fotos[i].nombre).length;
      const mejor = Math.max(...sirven.map(largo));
      let top = sirven.filter((i) => largo(i) === mejor);
      // Empate: la que empieza por su primer nombre («Yariela Sofía»: YARIELA, no SOFIA).
      if (top.length > 1) {
        const primero = palabras(D().valor(f, "Nombre"))[0];
        const conPrimero = top.filter((i) => palabrasDeArchivo(fotos[i].nombre)[0] === primero);
        if (conPrimero.length === 1) top = conPrimero;
      }
      if (top.length === 1) elegidos.set(k, top[0]);
    });
    // Un archivo que quedó para dos personas no es de ninguna.
    const usos = new Map();
    for (const i of elegidos.values()) usos.set(i, (usos.get(i) || 0) + 1);
    for (const [k, i] of elegidos) if (usos.get(i) === 1) fotoDe.set(k, i);
  }

  // Achica la foto (las del fotógrafo miden 4480 × 6720) y, si el diseño lo
  // pide, la recorta a pasaporte: 3,3 × 4,24, desde `arriba` y del `alto` dado.
  async function prepararFoto(archivo) {
    const url = URL.createObjectURL(archivo);
    try {
      const im = await D().cargarImagen(url);
      const W = im.naturalWidth, H = im.naturalHeight;
      const r = diseno.fotoRecorte;
      let sx = 0, sy = 0, sw = W, sh = H;
      if (r && r.alto > 0) {
        // Una foto que ya viene de cabeza y hombros (más ancha que 0,72, como
        // las que llegan sueltas por chat) no se recorta de más: entra entera
        // a lo alto, y solo se le quita lo que sobra de los lados.
        const yaEsRetrato = W / H >= 0.72;
        sh = yaEsRetrato ? Math.min(H, W * 42.4 / 33) : Math.min(H, H * r.alto);
        sw = Math.min(W, sh * 33 / 42.4);
        sx = (W - sw) / 2;
        // Con `cabeza`, el recorte empieza un poco arriba de donde empieza la
        // persona (el fondo del fotógrafo es blanco): un niño bajito sale
        // con la cara del mismo tamaño que uno alto. Sin encontrarla, `arriba`.
        const tope = r.cabeza ? topeDeLaPersona(im, sx, sw) : null;
        const desde = tope != null ? Math.max(0, tope - H * 0.035) : H * (r.arriba || 0);
        sy = Math.max(0, Math.min(H - sh, desde));
      }
      const k = Math.min(1, 1100 / sh);
      const c = document.createElement("canvas");
      c.width = Math.round(sw * k); c.height = Math.round(sh * k);
      c.getContext("2d").drawImage(im, sx, sy, sw, sh, 0, 0, c.width, c.height);
      return c;
    } finally { URL.revokeObjectURL(url); }
  }

  // La primera fila (de arriba abajo) donde, en la franja del recorte, más
  // del 4 % de los puntos no es fondo claro: ahí empieza el pelo. En la foto
  // achicada a 200 px de ancho; null si no la encuentra.
  function topeDeLaPersona(im, sx, sw) {
    const W = im.naturalWidth, H = im.naturalHeight, k = 200 / W;
    const c = document.createElement("canvas");
    c.width = 200; c.height = Math.round(H * k);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(im, 0, 0, c.width, c.height);
    const x0 = Math.round(sx * k), ancho = Math.max(1, Math.round(sw * k));
    const px = ctx.getImageData(x0, 0, ancho, c.height).data;
    for (let y = 0; y < c.height * 0.8; y++) {
      let oscuros = 0;
      for (let x = 0; x < ancho; x++) {
        const i = (y * ancho + x) * 4;
        if (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2] < 200) oscuros++;
      }
      if (oscuros > ancho * 0.04) return y / k;
    }
    return null;
  }

  async function subirFotos(lista) {
    let archivos = [...lista].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name));
    // El fotógrafo manda dos de cada una: la de «MEDIOS DIGITALES» lleva su
    // marca; si está la otra (el mismo número), se usa la otra.
    const numero = (n) => (n.match(/^\s*(\d+)/) || [])[1];
    const limpias = new Set(archivos.filter((f) => !/medios digitales/i.test(f.name)).map((f) => numero(f.name)).filter(Boolean));
    archivos = archivos.filter((f) => !(/medios digitales/i.test(f.name) && limpias.has(numero(f.name))));
    if (!archivos.length) { Avisos.avisar("No llegó ninguna foto (sirven JPG, PNG o WEBP).", { tipo: "error" }); return; }
    const estado = $("g-fotos-estado");
    const nuevas = [];
    for (const [i, f] of archivos.entries()) {
      estado.textContent = `Preparando la foto ${i + 1} de ${archivos.length}…`;
      try { nuevas.push({ nombre: f.name, lienzo: await prepararFoto(f) }); } catch (e) { /* una foto dañada no frena las demás */ }
    }
    fotos = nuevas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
    fotoDe.clear();
    emparejar();
    pintarFotos();
    await refrescar();
  }

  function pintarFotos() {
    const caja = $("g-fotos-lista"), estado = $("g-fotos-estado");
    caja.textContent = "";
    if (!fotos.length) { estado.textContent = "Sin fotos: el frente lleva la ilustración del diseño."; return; }
    if (!datos) { estado.textContent = `${fotos.length} fotos listas. Trae o sube la lista de personas para emparejarlas.`; return; }
    const usadas = new Set();
    let con = 0;
    datos.filas.forEach((f) => {
      const k = claveFila(f);
      const i = fotoDe.has(k) ? fotoDe.get(k) : -1;
      if (i >= 0) { con++; usadas.add(i); }
      const quien = [D().valor(f, "Apellidos"), D().valor(f, "Nombre")].filter(Boolean).join(", ") || "sin nombre";
      const li = document.createElement("li");
      li.className = "flex flex-wrap items-center gap-2 py-1 border-t border-brand-100 dark:border-brand-800";
      li.dataset.foto = i >= 0 ? fotos[i].nombre : "";
      const id = "g-foto-" + Math.random().toString(36).slice(2);
      const label = document.createElement("label");
      label.htmlFor = id; label.className = "text-sm min-w-[12rem] flex-1"; label.textContent = quien;
      const sel = document.createElement("select");
      sel.id = id;
      sel.className = "px-2 py-1 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm";
      const o0 = document.createElement("option"); o0.value = "-1"; o0.textContent = "— sin foto —"; sel.append(o0);
      fotos.forEach((x, j) => { const o = document.createElement("option"); o.value = String(j); o.textContent = x.nombre; sel.append(o); });
      sel.value = String(i);
      sel.addEventListener("change", () => { fotoDe.set(k, Number(sel.value)); pintarFotos(); refrescar(); });
      const marca = document.createElement("span");
      marca.className = "text-xs font-semibold " + (i >= 0 ? "text-green-800 dark:text-green-300" : "text-red-700 dark:text-red-300");
      marca.textContent = i >= 0 ? "✓ con foto" : "✗ sin foto";
      li.append(label, sel, marca);
      caja.append(li);
    });
    const sobran = fotos.filter((x, j) => !usadas.has(j)).map((x) => x.nombre);
    estado.textContent = `${con} de ${datos.filas.length} con foto.` + (con < datos.filas.length ? " Elige a mano las que faltan (las que el nombre no deja claras)." : "")
      + (sobran.length ? ` Fotos sin usar (${sobran.length}): ${sobran.slice(0, 12).join(", ")}${sobran.length > 12 ? "…" : ""}.` : "");
  }

  // Los gafetes con la foto de cada uno (y su propio fondo, que no se comparte).
  function conFotos(todos) {
    todos.forEach((g, n) => {
      const i = fotos.length ? fotoDe.get(claveFila(g.fila)) : undefined;
      if (i != null && i >= 0 && fotos[i]) { g.foto = fotos[i].lienzo; g.fotoClave = "foto-" + i; }
    });
    return todos;
  }

  /* ===================== El formulario del diseño ===================== */
  function leerRuta(ruta) { return ruta.split(".").reduce((o, k) => (o == null ? o : o[k]), diseno); }
  function ponerRuta(ruta, v) {
    const ks = ruta.split(".");
    let o = diseno;
    ks.slice(0, -1).forEach((k) => { o = o[k]; });
    o[ks[ks.length - 1]] = v;
  }

  function llenarFormulario() {
    document.querySelectorAll("[data-campo]").forEach((el) => {
      const v = leerRuta(el.dataset.campo);
      if (el.type === "checkbox") el.checked = !!v;
      else if (el.tagName !== "SELECT" || !el.dataset.columna) el.value = v == null ? "" : v;
    });
    pintarListasDeColumnas();
    $("g-horario").value = diseno.dorso.horario.map((f) => f.join(" | ")).join("\n");
    $("g-encabezados").value = diseno.dorso.encabezados.join(" | ");
    ["logoIzq", "logoDer", "ilustracion", "ilustracionDorso", "fondoFrente", "fondoDorso", "patrocinador", "icono0", "icono1"].forEach(pintarImagen);
    pintarFuentes();
    pintarColores();
    pintarAprobado();
  }

  function pintarImagen(id) {
    const caja = document.querySelector(`[data-imagen="${id}"] .g-imagen-nombre`);
    const quitar = document.querySelector(`[data-imagen="${id}"] .g-quitar`);
    if (!caja) return;
    const im = diseno.imagenes[id];
    caja.textContent = im ? im.nombre || "imagen" : "ninguna";
    quitar.classList.toggle("hidden", !im);
  }

  function pintarFuentes() {
    ["titulo", "texto"].forEach((cual) => {
      const f = diseno.fuentes[cual];
      $(`g-fuente-${cual}-nombre`).textContent = f.datos ? (f.nombre || "propia") : (f.id === "quicksand" ? "Quicksand (del sitio)" : "League Spartan (del sitio)");
      $(`g-fuente-${cual}-quitar`).classList.toggle("hidden", !f.datos);
    });
  }

  /* Los colores por rol: un color por cada valor distinto de la columna que
     decide el color, con su contraste MEDIDO contra el blanco (la franja
     lleva letra blanca y el nombre va de ese color sobre blanco). */
  function detectarColores() {
    if (!datos || !diseno.colores.columna) return;
    const vistos = [];
    for (const f of datos.filas) {
      const v = D().valor(f, diseno.colores.columna);
      const k = v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
      if (k && !vistos.some((x) => x.k === k)) vistos.push({ k, v });
    }
    let i = Object.keys(diseno.colores.valores).length;
    for (const x of vistos) if (!diseno.colores.valores[x.k]) diseno.colores.valores[x.k] = PALETA[i++ % PALETA.length];
    diseno.colores.etiquetas = { ...(diseno.colores.etiquetas || {}), ...Object.fromEntries(vistos.map((x) => [x.k, x.v])) };
    pintarColores();
  }

  const razon = (n) => n.toFixed(1).replace(".", ",") + ":1";

  function pintarColores() {
    const lista = $("g-colores");
    lista.textContent = "";
    const etiquetas = diseno.colores.etiquetas || {};
    const claves = Object.keys(diseno.colores.valores);
    if (!claves.length) {
      const p = document.createElement("p");
      p.className = "text-xs text-brand-500 dark:text-brand-300";
      p.textContent = "Al subir el Excel aparecen acá los valores de esa columna, cada uno con su color.";
      lista.append(p);
    }
    const fila = (texto, valor, alCambiar, quitar) => {
      const li = document.createElement("li");
      li.className = "flex items-center gap-2 flex-wrap";
      const id = "g-color-" + Math.random().toString(36).slice(2);
      const input = document.createElement("input");
      input.type = "color"; input.value = valor; input.id = id;
      input.className = "w-10 h-8 rounded border border-brand-200 dark:border-brand-700 bg-transparent";
      input.disabled = diseno.aprobado;
      const label = document.createElement("label");
      label.htmlFor = id; label.className = "text-sm font-semibold min-w-[7rem]"; label.textContent = texto;
      const c = D().contraste(valor, "#ffffff");
      const nota = document.createElement("span");
      nota.className = "text-xs " + (c >= 4.5 ? "text-green-800 dark:text-green-300" : "text-red-700 dark:text-red-300 font-semibold");
      nota.textContent = c >= 4.5 ? `contraste ${razon(c)} ✓` : `contraste ${razon(c)}: se lee mal con letra blanca (mínimo 4,5:1)`;
      input.addEventListener("input", () => { alCambiar(input.value); const k = D().contraste(input.value, "#ffffff"); nota.textContent = k >= 4.5 ? `contraste ${razon(k)} ✓` : `contraste ${razon(k)}: se lee mal con letra blanca (mínimo 4,5:1)`; nota.className = "text-xs " + (k >= 4.5 ? "text-green-800 dark:text-green-300" : "text-red-700 dark:text-red-300 font-semibold"); cambio(); });
      li.append(input, label, nota);
      if (quitar && !diseno.aprobado) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "text-xs underline text-brand-500 dark:text-brand-300 hover:text-accent-600";
        b.textContent = "Quitar"; b.setAttribute("aria-label", "Quitar el color de " + texto);
        b.addEventListener("click", () => { quitar(); pintarColores(); cambio(); });
        li.append(b);
      }
      lista.append(li);
    };
    claves.forEach((k) => fila(etiquetas[k] || k, diseno.colores.valores[k], (v) => { diseno.colores.valores[k] = v; },
      () => { delete diseno.colores.valores[k]; }));
    fila("Los demás", diseno.colores.omision, (v) => { diseno.colores.omision = v; }, null);
  }

  function pintarAprobado() {
    const ap = diseno.aprobado;
    $("g-diseno-campos").disabled = ap;
    $("g-aprobar").textContent = ap ? "Cambiar el diseño" : "Aprobar este diseño";
    $("g-estado-diseno").textContent = ap
      ? `Diseño aprobado: «${diseno.nombreDiseno}». Sube el Excel y crea los PDF; para tocarlo, «Cambiar el diseño».`
      : "Diseño en preparación: cuando la vista previa esté bien, apruébalo.";
    $("g-estado-diseno").className = "text-sm font-semibold " + (ap ? "text-green-800 dark:text-green-300" : "text-brand-600 dark:text-brand-300");
    document.querySelectorAll("#g-colores input").forEach((i) => { i.disabled = ap; });
  }

  let tGuardar = null, tRefrescar = null;
  function cambio() {
    clearTimeout(tGuardar);
    tGuardar = setTimeout(() => guardarLocal(diseno), 600);
    clearTimeout(tRefrescar);
    tRefrescar = setTimeout(refrescar, 250);
  }

  /* ===================== La vista previa ===================== */
  // Sin Excel todavía: una persona de ejemplo con las columnas que pide el diseño.
  const EJEMPLO = { apellidos: "Pérez Mora", nombre: "Valentina", "fide id": "6512345", fide: "6512345", categoria: "U12 Femenino", federacion: "CRC", pais: "CRC", fed: "CRC", rol: "Atleta" };
  function filaDeEjemplo() {
    const o = {};
    const plantillas = [diseno.nombre.linea1, diseno.nombre.linea2, ...diseno.detalles, diseno.bandera.plantilla, diseno.franja.plantilla, diseno.dorso.vertical, diseno.codigo.plantilla];
    for (const p of plantillas) for (const c of D().columnasDe(p)) {
      const k = c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      o[c] = EJEMPLO[k] || c;
    }
    if (diseno.colores.columna) o[diseno.colores.columna] = o[diseno.colores.columna] || "Atleta";
    return o;
  }

  async function asegurarRecursos() {
    const huella = JSON.stringify([diseno.fuentes, Object.keys(diseno.imagenes).map((k) => [k, (diseno.imagenes[k] || {}).datos ? (diseno.imagenes[k].datos.length + diseno.imagenes[k].datos.slice(-40)) : null]), diseno.iconos, diseno.dorso.qr, diseno.dorso.qrMarca]);
    if (recursos && huella === recursosDe) return recursos;
    recursos = await D().preparar(diseno);
    recursosDe = huella;
    return recursos;
  }

  function columnasQueFaltan() {
    if (!datos) return [];
    const usadas = new Set();
    const plantillas = [diseno.nombre.linea1, diseno.nombre.linea2, ...diseno.detalles, diseno.bandera.plantilla, diseno.franja.plantilla, diseno.dorso.vertical, diseno.codigo.plantilla];
    plantillas.forEach((p) => D().columnasDe(p).forEach((c) => usadas.add(c)));
    [diseno.colores.columna, diseno.codigo.sinCodigoSi, diseno.salida.separarPor, ...diseno.iconos.map((i) => i.columna)].forEach((c) => c && usadas.add(c));
    const hay = new Set(Object.keys(datos.filas[0] || {}).map((k) => k.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()));
    return [...usadas].filter((c) => !hay.has(c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()));
  }

  let pintando = 0;
  async function refrescar() {
    const turno = ++pintando;
    const avisosCaja = $("g-avisos");
    try {
      const r = await asegurarRecursos();
      if (turno !== pintando) return;
      const filas = datos ? datos.filas : [filaDeEjemplo()];
      filaVista = Math.max(0, Math.min(filaVista, filas.length - 1));
      const todos = conFotos(D().gafetes(diseno, filas));
      const g = todos[filaVista];
      const frente = await D().cara(diseno, r, g, "frente");
      const dorso = await D().cara(diseno, r, g, "dorso");
      if (turno !== pintando) return;
      const css = $("g-lienzo-frente").parentElement.clientWidth || 300;
      const px = (css / diseno.tamano.ancho) * (window.devicePixelRatio || 1);
      D().pintar($("g-lienzo-frente"), diseno, frente, px);
      D().pintar($("g-lienzo-dorso"), diseno, dorso, px);
      const quien = g.nombre.join(" ") || "sin nombre";
      $("g-lienzo-frente").setAttribute("aria-label", `Frente del gafete de ${quien}` + (g.franja ? `, ${g.franja.toLowerCase()}` : ""));
      $("g-lienzo-dorso").setAttribute("aria-label", `Dorso del gafete de ${quien}` + (g.codigo ? `, código ${g.codigo}` : ", sin código"));
      $("g-fila").textContent = datos ? `${filaVista + 1} de ${filas.length}: ${quien}` : "Persona de ejemplo (todavía no hay Excel)";
      $("g-anterior").disabled = filaVista <= 0;
      $("g-siguiente").disabled = filaVista >= filas.length - 1;
      const avisos = [...new Set([...frente.avisos, ...dorso.avisos])];
      const faltan = columnasQueFaltan();
      if (faltan.length) avisos.unshift(`El Excel no tiene ${faltan.length === 1 ? "la columna" : "las columnas"} ${faltan.map((c) => "«" + c + "»").join(", ")}.`);
      if (D().contraste(diseno.titulo.color, "#ffffff") < 4.5) avisos.push(`El color del título tiene ${razon(D().contraste(diseno.titulo.color, "#ffffff"))} con el blanco: se lee mal (mínimo 4,5:1).`);
      avisosCaja.textContent = "";
      avisos.forEach((a) => { const li = document.createElement("li"); li.textContent = a; avisosCaja.append(li); });
      $("g-avisos-caja").classList.toggle("hidden", !avisos.length);
    } catch (e) {
      avisosCaja.textContent = "";
      const li = document.createElement("li"); li.textContent = "No se pudo dibujar: " + (e.message || e); avisosCaja.append(li);
      $("g-avisos-caja").classList.remove("hidden");
    }
  }

  /* ===================== Crear los PDF ===================== */
  const fondoJpeg = (diseno2, c) => D().fondoJpeg(diseno2, c, DPI);

  const nombreSeguro = (t) => String(t).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "sin grupo";

  async function crear() {
    if (!datos || !datos.filas.length) { Avisos.avisar("Primero sube el Excel con la gente.", { tipo: "error" }); return; }
    if (!diseno.aprobado) { Avisos.avisar("Primero aprueba el diseño: los PDF salen del diseño aprobado.", { tipo: "error" }); return; }
    const faltan = columnasQueFaltan();
    if (faltan.length && !(await Avisos.confirmar(`El Excel no tiene ${faltan.map((c) => "«" + c + "»").join(", ")}: esos datos saldrán vacíos. ¿Crear los gafetes igual?`, { titulo: "Faltan columnas", aceptar: "Crear igual" }))) return;
    const boton = $("g-crear");
    boton.disabled = true;
    const barra = $("g-progreso"), texto = $("g-progreso-texto");
    barra.classList.remove("hidden");
    $("g-resultado").classList.add("hidden");
    try {
      const r = await asegurarRecursos();
      const todos = conFotos(D().gafetes(diseno, datos.filas));
      const grupos = new Map();
      todos.forEach((g) => {
        const k = diseno.salida.separarPor ? (D().valor(g.fila, diseno.salida.separarPor) || "Sin dato") : "";
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(g);
      });
      const medida = `${String(diseno.tamano.ancho / 10).replace(".", ",")}x${String(diseno.tamano.alto / 10).replace(".", ",")}`;
      const fondos = new Map();
      const avisos = new Set();
      const archivos = [];
      let hechas = 0;
      const total = todos.length * 2;
      barra.max = total;
      for (const [grupo, lista] of grupos) {
        const titulo = `Gafetes ${medida} - ${grupo || diseno.nombreDiseno}`;
        const pdf = window.GafetesPdf.nuevo(diseno.tamano.ancho, diseno.tamano.alto, titulo);
        for (const g of lista) {
          for (const lado of ["frente", "dorso"]) {
            const c = await D().cara(diseno, r, g, lado);
            c.avisos.forEach((a) => avisos.add(a));
            if (!fondos.has(c.clave)) fondos.set(c.clave, await fondoJpeg(diseno, c));
            await pdf.agregar({ clave: c.clave, ...fondos.get(c.clave), textos: c.textos });
            hechas++;
            barra.value = hechas;
            texto.textContent = `Gafete ${Math.ceil(hechas / 2)} de ${todos.length}…`;
            if (hechas % 4 === 0) await new Promise((ok) => setTimeout(ok));
          }
        }
        archivos.push({ nombre: nombreSeguro(titulo) + ".pdf", bytes: pdf.cerrar() });
      }
      let blob, nombre;
      if (archivos.length === 1) { blob = new Blob([archivos[0].bytes], { type: "application/pdf" }); nombre = archivos[0].nombre; }
      else { blob = new Blob([window.TablaExcel.zip(archivos)], { type: "application/zip" }); nombre = nombreSeguro(`Gafetes ${medida} - ${diseno.nombreDiseno}`) + ".zip"; }
      const enlace = $("g-bajar");
      if (enlace.href) URL.revokeObjectURL(enlace.href);
      enlace.href = URL.createObjectURL(blob);
      enlace.download = nombre;
      enlace.textContent = `📥 Bajar ${nombre}`;
      $("g-resultado-texto").textContent = `${todos.length} gafetes (${total} páginas de ${String(diseno.tamano.ancho / 10).replace(".", ",")} × ${String(diseno.tamano.alto / 10).replace(".", ",")} cm)` +
        (archivos.length > 1 ? `, en ${archivos.length} PDF dentro de un .zip` : "") +
        `. Cada página es una imagen de fondo a ${DPI} dpi y el texto en curvas, sin marcas de corte.`;
      const lista = $("g-resultado-avisos");
      lista.textContent = "";
      [...avisos].slice(0, 30).forEach((a) => { const li = document.createElement("li"); li.textContent = a; lista.append(li); });
      $("g-resultado").classList.remove("hidden");
      texto.textContent = "Listo.";
      enlace.click();
      enlace.focus();
    } catch (e) {
      texto.textContent = "";
      Avisos.avisar("No se pudieron crear los gafetes: " + (e.message || e), { tipo: "error" });
    } finally {
      boton.disabled = false;
      barra.classList.add("hidden");
    }
  }

  /* ===================== El archivo del diseño ===================== */
  function bajarDiseno() {
    const blob = new Blob([JSON.stringify({ tipo: "ajedrez-integral-gafetes", ...diseno })], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "diseno-gafetes-" + nombreSeguro(diseno.nombreDiseno).toLowerCase().replace(/\s+/g, "-") + ".json";
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function abrirDiseno(archivo) {
    try {
      const d = JSON.parse(await archivo.text());
      if (!d || d.tipo !== "ajedrez-integral-gafetes") throw new Error("no es un diseño de gafetes de esta herramienta");
      delete d.tipo;
      diseno = completar(d);
      recursos = null;
      if (datos) detectarColores();
      llenarFormulario();
      await guardarLocal(diseno);
      await refrescar();
      Avisos.avisar(`Diseño «${diseno.nombreDiseno}» abierto` + (diseno.aprobado ? ", ya aprobado." : "."));
    } catch (e) {
      Avisos.avisar("No se pudo abrir el diseño: " + (e.message || e), { tipo: "error" });
    }
  }

  /* ===================== Los controles ===================== */
  function conectar() {
    $("g-excel").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) subirExcel(f); e.target.value = ""; });
    $("g-fila-titulos").addEventListener("change", async () => { armarDatos(); filaVista = 0; pintarDatos(); detectarColores(); await refrescar(); });

    document.querySelectorAll("[data-campo]").forEach((el) => {
      const evento = el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input";
      el.addEventListener("focus", () => { if (el.dataset.plantilla != null || el.dataset.columna != null) ultimoCampo = el; });
      el.addEventListener(evento, () => {
        let v = el.type === "checkbox" ? el.checked : el.value;
        if (el.type === "number") v = Math.max(Number(el.min) || 1, Math.min(Number(el.max) || 1000, Number(v) || 0));
        ponerRuta(el.dataset.campo, v);
        if (el.dataset.campo === "colores.columna") detectarColores();
        cambio();
      });
    });
    $("g-horario").addEventListener("input", () => {
      diseno.dorso.horario = $("g-horario").value.split("\n").map((l) => l.split(/\t|\|/).map((c) => c.trim())).filter((f) => f.some(Boolean)).map((f) => [f[0] || "", f[1] || "", f[2] || ""]);
      cambio();
    });
    $("g-encabezados").addEventListener("input", () => {
      const e = $("g-encabezados").value.split(/\t|\|/).map((c) => c.trim());
      diseno.dorso.encabezados = [e[0] || "", e[1] || "", e[2] || ""];
      cambio();
    });

    document.querySelectorAll("[data-imagen]").forEach((caja) => {
      const id = caja.dataset.imagen;
      caja.querySelector("input[type=file]").addEventListener("change", async (e) => {
        const f = e.target.files[0];
        e.target.value = "";
        if (!f) return;
        if (f.size > 15 * 1024 * 1024) { Avisos.avisar("Esa imagen pesa más de 15 MB: achícala antes de subirla.", { tipo: "error" }); return; }
        let datosImg;
        if (/svg/.test(f.type) || /\.svg$/i.test(f.name)) datosImg = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(D().svgConTamano(await f.text()));
        else datosImg = await aDatos(f);
        try { await D().cargarImagen(datosImg); } catch (er) { Avisos.avisar("Esa imagen no se pudo abrir. Prueba con PNG, JPG o SVG.", { tipo: "error" }); return; }
        diseno.imagenes[id] = { nombre: f.name, datos: datosImg };
        if (id === "icono0" || id === "icono1") diseno.iconos[Number(id.slice(-1))].imagen = id;
        pintarImagen(id);
        cambio();
      });
      caja.querySelector(".g-quitar").addEventListener("click", () => {
        delete diseno.imagenes[id];
        if (id === "icono0" || id === "icono1") diseno.iconos[Number(id.slice(-1))].imagen = null;
        pintarImagen(id);
        cambio();
      });
    });

    ["titulo", "texto"].forEach((cual) => {
      $(`g-fuente-${cual}`).addEventListener("change", async (e) => {
        const f = e.target.files[0];
        e.target.value = "";
        if (!f) return;
        try {
          const b64 = await aBase64(f);
          window.opentype.parse(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer);
          diseno.fuentes[cual] = { nombre: f.name, datos: b64 };
          pintarFuentes();
          cambio();
        } catch (er) {
          Avisos.avisar("Esa fuente no se pudo leer. Sirven TTF, OTF o WOFF (no WOFF2).", { tipo: "error" });
        }
      });
      $(`g-fuente-${cual}-quitar`).addEventListener("click", () => {
        diseno.fuentes[cual] = { id: cual === "texto" ? "quicksand" : "league-spartan" };
        pintarFuentes();
        cambio();
      });
    });

    $("g-anterior").addEventListener("click", () => { filaVista--; refrescar(); });
    $("g-siguiente").addEventListener("click", () => { filaVista++; refrescar(); });

    $("g-aprobar").addEventListener("click", async () => {
      if (diseno.aprobado) {
        if (!(await Avisos.confirmar("El diseño deja de estar aprobado hasta que lo vuelvas a aprobar.", { titulo: "¿Cambiar el diseño?", aceptar: "Cambiar el diseño" }))) return;
        diseno.aprobado = false;
      } else {
        diseno.aprobado = true;
        Avisos.avisar("Diseño aprobado. Ya puedes crear los PDF; guárdalo en un archivo para usarlo con otro Excel.");
      }
      pintarAprobado();
      await guardarLocal(diseno);
    });
    $("g-guardar").addEventListener("click", bajarDiseno);
    $("g-abrir").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) abrirDiseno(f); });
    $("g-nuevo").addEventListener("click", async () => {
      if (!(await Avisos.confirmar("Se borra el diseño de este navegador (el archivo que guardaste no se toca).", { titulo: "¿Empezar un diseño nuevo?", aceptar: "Empezar de cero", peligro: true }))) return;
      diseno = disenoNuevo(); recursos = null; if (datos) detectarColores(); llenarFormulario(); await guardarLocal(diseno); refrescar();
    });
    $("g-ejemplo").addEventListener("click", async () => {
      if (!(await Avisos.confirmar("Se reemplaza el diseño actual por el de los gafetes del Centroamericano 2026.", { titulo: "¿Partir del Centroamericano 2026?", aceptar: "Usar ese diseño" }))) return;
      diseno = await disenoCentroamericano(); recursos = null; if (datos) detectarColores(); llenarFormulario(); await guardarLocal(diseno); refrescar();
    });
    $("g-ejemplo-pz").addEventListener("click", async () => {
      if (!(await Avisos.confirmar("Se reemplaza el diseño actual por el de los gafetes de la Eliminatoria JDN de Pérez Zeledón 2026.", { titulo: "¿Partir de la Eliminatoria JDN PZ 2026?", aceptar: "Usar ese diseño" }))) return;
      diseno = await disenoJdnPz(); recursos = null; if (datos) detectarColores(); llenarFormulario(); await guardarLocal(diseno); refrescar();
    });
    $("g-pareo-pz").addEventListener("click", traerJdnPz);
    $("g-fotos").addEventListener("change", (e) => { const l = [...e.target.files]; e.target.value = ""; if (l.length) subirFotos(l); });
    $("g-crear").addEventListener("click", crear);
    let tAncho = null;
    window.addEventListener("resize", () => { clearTimeout(tAncho); tAncho = setTimeout(refrescar, 200); });
  }

  async function iniciar() {
    const { data } = await sb.auth.getSession();
    const session = data.session;
    if (!session) { window.location.href = "login.html"; return; }
    const { data: perfil } = await sb.from("profiles").select("is_admin").eq("id", session.user.id).maybeSingle();
    $("loading").classList.add("hidden");
    if (!perfil || !perfil.is_admin) { $("denegado").classList.remove("hidden"); return; }
    $("app").classList.remove("hidden");
    const guardado = await leerLocal();
    diseno = completar(guardado);
    conectar();
    llenarFormulario();
    await refrescar();
  }

  window.Gafetes = { _estado: () => ({ diseno, datos, fotos, fotoDe }) };
  iniciar();
})();

/*! rev bfb5bbb0d2d82f9f */
