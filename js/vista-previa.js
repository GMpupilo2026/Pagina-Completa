/* La vista previa de un archivo, en una ventana encima de la página, sin
 * bajarlo: la usa la sección «Archivos» de admin.html.
 *
 *   - PDF: el visor del navegador, en un marco (el archivo es del mismo sitio:
 *     frame-src 'self' y X-Frame-Options SAMEORIGIN lo dejan).
 *   - Página (.html, las versiones accesibles): en un marco, sin sus programas
 *     (sandbox sin allow-scripts).
 *   - Imagen: entera, sobre un damero (para ver lo transparente).
 *   - Presentación (.pptx), Word (.docx) y Excel (.xlsx): son un .zip con XML
 *     adentro. Se abre acá mismo —DecompressionStream("deflate-raw") del
 *     navegador, sin librerías: la CSP no deja traerlas— y se pinta lo que
 *     trae: cada diapositiva con su fondo, sus textos y sus imágenes en su
 *     lugar; el texto y las tablas del Word; las hojas del Excel.
 *   - Lo viejo (.ppt, .doc, .xls) o lo que no se pueda leer: se dice, y se
 *     ofrece bajarlo.
 *
 * Todo texto del archivo entra por textContent: un documento puede traer
 * cualquier cosa. Las imágenes van como blob: (img-src lo permite) y se
 * sueltan al cerrar.
 *
 *   VistaPrevia.abrir(lista, indice)  lista: [{ ruta, titulo, ext? }]; con
 *                                     «Anterior» y «Siguiente» se recorre la
 *                                     lista. `ext` manda sobre la de la ruta.
 *
 * Ver «La vista previa» en docs/decisiones/cursos-y-material.md.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const EMU_POR_PUNTO = 12700;
  const MAX_FILAS_EXCEL = 300;

  let dialogo = null;
  let lista = [];
  let indice = 0;
  let urls = [];          // blob: de las imágenes, para soltarlas
  let turno = 0;          // un archivo que tarda no pisa al siguiente
  let volverA = null;     // el botón que la abrió, para devolverle el foco

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  const extension = (ruta) => ((String(ruta).match(/\.([a-z0-9]+)$/i) || [])[1] || "").toLowerCase();
  const nombreArchivo = (ruta) => String(ruta).split("/").pop();

  /* ======================= El .zip, a mano =======================
     Lo justo para leer un documento de Office: el directorio central, y cada
     archivo guardado tal cual (0) o comprimido con deflate (8). */
  function leerZip(buffer) {
    const v = new DataView(buffer);
    let fin = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
    }
    if (fin < 0) throw new Error("no es un archivo .zip");
    const cuantos = v.getUint16(fin + 10, true);
    let p = v.getUint32(fin + 16, true);
    const entradas = new Map();
    const dec = new TextDecoder();
    for (let n = 0; n < cuantos; n++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error("el .zip está dañado");
      const metodo = v.getUint16(p + 10, true);
      const comprimido = v.getUint32(p + 20, true);
      const largoNombre = v.getUint16(p + 28, true);
      const largoExtra = v.getUint16(p + 30, true);
      const largoComentario = v.getUint16(p + 32, true);
      const local = v.getUint32(p + 42, true);
      const nombre = dec.decode(new Uint8Array(buffer, p + 46, largoNombre));
      entradas.set(nombre, { metodo, comprimido, local });
      p += 46 + largoNombre + largoExtra + largoComentario;
    }
    async function bytes(nombre) {
      const e = entradas.get(nombre);
      if (!e) return null;
      const inicio = e.local + 30 + v.getUint16(e.local + 26, true) + v.getUint16(e.local + 28, true);
      const datos = new Uint8Array(buffer, inicio, e.comprimido);
      if (e.metodo === 0) return datos;
      if (e.metodo !== 8) throw new Error("compresión que no se puede leer");
      const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(flujo).arrayBuffer());
    }
    async function texto(nombre) {
      const b = await bytes(nombre);
      return b ? new TextDecoder().decode(b) : null;
    }
    async function xml(nombre) {
      const t = await texto(nombre);
      if (t == null) return null;
      const doc = new DOMParser().parseFromString(t, "application/xml");
      if (doc.getElementsByTagName("parsererror").length) throw new Error("XML dañado en " + nombre);
      return doc;
    }
    return { entradas, bytes, texto, xml };
  }

  // Los hijos y descendientes por nombre local, sin pelear con los espacios de nombres.
  const hijos = (nodo, nombre) => Array.from(nodo ? nodo.children : []).filter((c) => c.localName === nombre);
  const hijo = (nodo, nombre) => hijos(nodo, nombre)[0] || null;
  const todos = (nodo, nombre) => (nodo ? Array.from(nodo.getElementsByTagNameNS("*", nombre)) : []);
  const atr = (nodo, nombre) => {
    if (!nodo) return null;
    for (const a of nodo.attributes) if (a.localName === nombre) return a.value;
    return null;
  };

  // «ppt/slides/slide1.xml» + «../media/image1.png» → «ppt/media/image1.png»
  function resolver(base, destino) {
    if (destino.startsWith("/")) return destino.slice(1);
    const partes = base.split("/").slice(0, -1);
    for (const p of destino.split("/")) {
      if (p === "..") partes.pop();
      else if (p !== ".") partes.push(p);
    }
    return partes.join("/");
  }

  async function relaciones(zip, parte) {
    const i = parte.lastIndexOf("/");
    const doc = await zip.xml(parte.slice(0, i) + "/_rels/" + parte.slice(i + 1) + ".rels");
    const m = new Map();
    for (const r of todos(doc, "Relationship")) m.set(r.getAttribute("Id"), resolver(parte, r.getAttribute("Target")));
    return m;
  }

  const TIPO_IMAGEN = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp", bmp: "image/bmp" };
  async function urlDeImagen(zip, ruta) {
    const b = await zip.bytes(ruta);
    if (!b) return null;
    const tipo = TIPO_IMAGEN[extension(ruta)];
    if (!tipo) return null;     // .emf, .wmf: el navegador no los pinta
    const u = URL.createObjectURL(new Blob([b], { type: tipo }));
    urls.push(u);
    return u;
  }

  const color = (nodo) => {
    const c = nodo && todos(nodo, "srgbClr")[0];
    return c ? "#" + c.getAttribute("val") : null;
  };

  /* ======================= Presentación ======================= */
  async function pintarPresentacion(zip, caja, seguir) {
    const pres = await zip.xml("ppt/presentation.xml");
    if (!pres) throw new Error("no trae ppt/presentation.xml");
    const tam = todos(pres, "sldSz")[0];
    const ancho = Number(tam && tam.getAttribute("cx")) || 12192000;
    const alto = Number(tam && tam.getAttribute("cy")) || 6858000;
    const rels = await relaciones(zip, "ppt/presentation.xml");
    let diapositivas = todos(pres, "sldId").map((s) => rels.get(atr(s, "id"))).filter(Boolean);
    if (!diapositivas.length) {
      diapositivas = [...zip.entradas.keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    }
    const pct = (emu, total) => (Number(emu) / total * 100) + "%";
    const tamLetra = (sz) => (Number(sz) / 100 * EMU_POR_PUNTO / ancho * 100) + "cqw";

    caja.append(el("p", "text-sm text-brand-500 dark:text-brand-300 mb-3",
      diapositivas.length + (diapositivas.length === 1 ? " diapositiva." : " diapositivas.")));

    for (let n = 0; n < diapositivas.length; n++) {
      if (!seguir()) return;
      const parte = diapositivas[n];
      const doc = await zip.xml(parte);
      if (!doc) continue;
      const relsDiap = await relaciones(zip, parte);
      const fig = el("figure", "vista-diapositiva mb-4");
      fig.setAttribute("aria-label", "Diapositiva " + (n + 1) + " de " + diapositivas.length);
      const lamina = el("div", "relative overflow-hidden rounded-lg border border-brand-200 dark:border-brand-700 shadow-sm bg-white text-black");
      lamina.style.aspectRatio = ancho + " / " + alto;
      lamina.style.containerType = "inline-size";
      const fondo = color(todos(doc, "bg")[0]);
      if (fondo) lamina.style.background = fondo;

      // Las formas en el orden en que se dibujan (las de un grupo, aplanadas).
      const arbol = todos(doc, "spTree")[0];
      const formas = arbol ? Array.from(arbol.querySelectorAll("*")).filter((x) => ["sp", "pic", "graphicFrame"].includes(x.localName)) : [];
      for (const forma of formas) {
        const xfrm = todos(forma, "xfrm")[0];
        const off = xfrm && hijo(xfrm, "off");
        const ext = xfrm && hijo(xfrm, "ext");
        const bloque = el("div", "absolute overflow-hidden");
        if (off && ext) {
          bloque.style.left = pct(off.getAttribute("x"), ancho);
          bloque.style.top = pct(off.getAttribute("y"), alto);
          bloque.style.width = pct(ext.getAttribute("cx"), ancho);
          bloque.style.height = pct(ext.getAttribute("cy"), alto);
        } else {
          bloque.className = "relative";
        }
        if (forma.localName === "pic") {
          const blip = todos(forma, "blip")[0];
          const destino = blip && relsDiap.get(atr(blip, "embed"));
          const u = destino && await urlDeImagen(zip, destino);
          if (!u) continue;
          const img = el("img", "w-full h-full object-contain");
          img.src = u;
          const desc = todos(forma, "cNvPr")[0];
          img.alt = (desc && (desc.getAttribute("descr") || "")) || "";
          bloque.append(img);
        } else if (forma.localName === "graphicFrame") {
          const tabla = todos(forma, "tbl")[0];
          if (!tabla) continue;
          const t = el("table", "w-full border-collapse");
          t.style.fontSize = tamLetra(1200);
          for (const fila of todos(tabla, "tr")) {
            const tr = el("tr");
            for (const celda of hijos(fila, "tc")) {
              tr.append(el("td", "border border-brand-300 px-1", todos(celda, "t").map((x) => x.textContent).join(" ")));
            }
            t.append(tr);
          }
          bloque.append(t);
        } else {
          const relleno = hijo(hijo(forma, "spPr"), "solidFill");
          if (relleno) bloque.style.background = color(relleno);
          const cuerpo = hijo(forma, "txBody");
          if (!cuerpo && !relleno) continue;
          for (const parrafo of hijos(cuerpo, "p")) {
            const p = el("p", "leading-tight");
            const ppr = hijo(parrafo, "pPr");
            const alin = ppr && ppr.getAttribute("algn");
            p.style.textAlign = { ctr: "center", r: "right", just: "justify" }[alin] || "left";
            p.style.marginBottom = "0.4cqw";
            let tamPrimero = null;
            for (const r of Array.from(parrafo.children).filter((x) => x.localName === "r" || x.localName === "br")) {
              if (r.localName === "br") { p.append(el("br")); continue; }
              const rpr = hijo(r, "rPr");
              const s = el("span", null, (hijo(r, "t") || {}).textContent || "");
              const sz = rpr && rpr.getAttribute("sz");
              if (sz) { s.style.fontSize = tamLetra(sz); tamPrimero = tamPrimero || sz; }
              if (rpr && rpr.getAttribute("b") === "1") s.style.fontWeight = "700";
              if (rpr && rpr.getAttribute("i") === "1") s.style.fontStyle = "italic";
              const c = color(rpr);
              if (c) s.style.color = c;
              p.append(s);
            }
            if (!tamPrimero) p.style.fontSize = tamLetra(1800);
            if (!p.textContent.trim()) p.style.minHeight = "1cqw";
            bloque.append(p);
          }
        }
        lamina.append(bloque);
      }
      fig.append(lamina);
      fig.append(el("figcaption", "text-xs text-brand-500 dark:text-brand-300 mt-1", "Diapositiva " + (n + 1)));
      caja.append(fig);
    }
  }

  /* ======================= Word ======================= */
  async function pintarWord(zip, caja, seguir) {
    const doc = await zip.xml("word/document.xml");
    if (!doc) throw new Error("no trae word/document.xml");
    const rels = await relaciones(zip, "word/document.xml");
    const cuerpo = todos(doc, "body")[0];
    const hoja = el("div", "bg-white text-black rounded-lg border border-brand-200 dark:border-brand-700 shadow-sm p-6 md:p-10 max-w-3xl mx-auto space-y-2 text-sm");

    async function parrafo(p) {
      const estilo = atr(todos(p, "pStyle")[0], "val") || "";
      const titulo = /heading|ttulo|titulo|title/i.test(estilo);
      const e = el(titulo ? "h4" : "p", titulo ? "font-bold text-base mt-3" : "leading-relaxed");
      const alin = atr(todos(p, "jc")[0], "val");
      if (alin === "center") e.style.textAlign = "center";
      else if (alin === "right" || alin === "end") e.style.textAlign = "right";
      for (const r of todos(p, "r")) {
        for (const c of Array.from(r.children)) {
          if (c.localName === "t") {
            const s = el("span", null, c.textContent);
            const rpr = hijo(r, "rPr");
            if (rpr && hijo(rpr, "b") && atr(hijo(rpr, "b"), "val") !== "0") s.style.fontWeight = "700";
            if (rpr && hijo(rpr, "i") && atr(hijo(rpr, "i"), "val") !== "0") s.style.fontStyle = "italic";
            if (rpr && hijo(rpr, "u") && atr(hijo(rpr, "u"), "val") !== "none") s.style.textDecoration = "underline";
            e.append(s);
          } else if (c.localName === "tab") e.append(document.createTextNode("\t"));
          else if (c.localName === "br") e.append(el("br"));
          else if (c.localName === "drawing") {
            const blip = todos(c, "blip")[0];
            const destino = blip && rels.get(atr(blip, "embed"));
            const u = destino && await urlDeImagen(zip, destino);
            if (u) { const img = el("img", "inline-block max-w-full"); img.src = u; img.alt = ""; e.append(img); }
          }
        }
      }
      e.style.whiteSpace = "pre-wrap";
      if (!e.textContent.trim() && !e.querySelector("img")) e.style.minHeight = "0.75rem";
      return e;
    }

    for (const nodo of Array.from(cuerpo ? cuerpo.children : [])) {
      if (!seguir()) return;
      if (nodo.localName === "p") hoja.append(await parrafo(nodo));
      else if (nodo.localName === "tbl") {
        const t = el("table", "w-full border-collapse my-2");
        for (const fila of hijos(nodo, "tr")) {
          const tr = el("tr");
          for (const celda of hijos(fila, "tc")) {
            const td = el("td", "border border-gray-400 align-top p-1");
            for (const p of hijos(celda, "p")) td.append(await parrafo(p));
            tr.append(td);
          }
          t.append(tr);
        }
        hoja.append(t);
      }
    }
    caja.append(hoja);
  }

  /* ======================= Excel ======================= */
  function columnaANumero(ref) {
    const letras = (ref.match(/^[A-Z]+/) || ["A"])[0];
    let n = 0;
    for (const l of letras) n = n * 26 + (l.charCodeAt(0) - 64);
    return n - 1;
  }

  async function pintarExcel(zip, caja, seguir) {
    const libro = await zip.xml("xl/workbook.xml");
    if (!libro) throw new Error("no trae xl/workbook.xml");
    const rels = await relaciones(zip, "xl/workbook.xml");
    const compartidos = todos(await zip.xml("xl/sharedStrings.xml"), "si").map((si) => todos(si, "t").map((t) => t.textContent).join(""));
    for (const hojaNodo of todos(libro, "sheet")) {
      if (!seguir()) return;
      const parte = rels.get(atr(hojaNodo, "id"));
      const doc = parte && await zip.xml(parte);
      if (!doc) continue;
      const sec = el("section", "mb-6");
      sec.append(el("h3", "font-semibold text-brand-800 dark:text-white mb-2", "Hoja: " + (hojaNodo.getAttribute("name") || "")));
      const marco = el("div", "overflow-auto max-h-[60vh] rounded-lg border border-brand-200 dark:border-brand-700");
      const t = el("table", "text-sm border-collapse bg-white text-black");
      const filas = todos(doc, "row");
      filas.slice(0, MAX_FILAS_EXCEL).forEach((fila) => {
        const tr = el("tr");
        const celdas = [];
        for (const c of hijos(fila, "c")) {
          const col = columnaANumero(c.getAttribute("r") || "");
          const tipo = c.getAttribute("t");
          let valor = "";
          if (tipo === "s") valor = compartidos[Number((hijo(c, "v") || {}).textContent)] || "";
          else if (tipo === "inlineStr") valor = todos(c, "t").map((x) => x.textContent).join("");
          else valor = (hijo(c, "v") || {}).textContent || "";
          celdas[col] = valor;
        }
        for (let i = 0; i < celdas.length; i++) tr.append(el("td", "border border-gray-300 px-2 py-1 whitespace-nowrap", celdas[i] || ""));
        t.append(tr);
      });
      marco.append(t);
      sec.append(marco);
      if (filas.length > MAX_FILAS_EXCEL) {
        sec.append(el("p", "text-xs text-brand-500 dark:text-brand-300 mt-1",
          "Se ven las primeras " + MAX_FILAS_EXCEL + " filas de " + filas.length + ". Bájalo para verlo entero."));
      }
      caja.append(sec);
    }
  }

  /* ======================= La ventana ======================= */
  const BOTON = "inline-flex items-center gap-1 rounded-lg border border-brand-200 dark:border-brand-700 px-3 py-1.5 text-sm font-semibold text-brand-700 dark:text-brand-100 hover:border-accent-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-40";

  function armar() {
    if (dialogo) return dialogo;
    const d = el("dialog", "vista-previa w-[calc(100%-1rem)] max-w-5xl h-[calc(100%-1rem)] rounded-2xl shadow-2xl p-0 bg-brand-50 dark:bg-brand-950 text-brand-800 dark:text-white backdrop:bg-black/60");
    d.id = "vista-previa";
    d.setAttribute("aria-labelledby", "vista-previa-titulo");
    const marco = el("div", "flex flex-col h-full");
    const cab = el("div", "flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-900");
    const izq = el("div", "min-w-0");
    const titulo = el("h2", "font-serif text-lg font-bold truncate");
    titulo.id = "vista-previa-titulo";
    const sub = el("p", "text-xs text-brand-500 dark:text-brand-300 truncate");
    sub.id = "vista-previa-sub";
    izq.append(titulo, sub);
    const acciones = el("div", "flex flex-wrap items-center gap-2");
    const ant = el("button", BOTON, "◀ Anterior"); ant.type = "button"; ant.id = "vista-previa-anterior";
    const sig = el("button", BOTON, "Siguiente ▶"); sig.type = "button"; sig.id = "vista-previa-siguiente";
    const abrir = el("a", BOTON, "Abrir en otra pestaña"); abrir.id = "vista-previa-abrir"; abrir.target = "_blank"; abrir.rel = "noopener";
    const bajar = el("a", BOTON, "📥 Bajar"); bajar.id = "vista-previa-bajar";
    const cerrar = el("button", "inline-flex items-center rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Cerrar");
    cerrar.type = "button"; cerrar.id = "vista-previa-cerrar";
    acciones.append(ant, sig, abrir, bajar, cerrar);
    cab.append(izq, acciones);
    const cuerpo = el("div", "flex-1 min-h-0 overflow-auto p-4");
    cuerpo.id = "vista-previa-cuerpo";
    cuerpo.tabIndex = -1;
    const estado = el("p", "sr-only");
    estado.id = "vista-previa-estado";
    estado.setAttribute("role", "status");
    marco.append(cab, cuerpo, estado);
    d.append(marco);
    document.body.append(d);

    ant.addEventListener("click", () => mostrar(indice - 1));
    sig.addEventListener("click", () => mostrar(indice + 1));
    // Cerrar limpia y devuelve el foco en el acto. El evento «close» llega un
    // momento después: si el foco volviera recién ahí, le quitaría el foco a lo
    // que la persona ya eligió entre tanto. (Con Esc, el navegador cierra solo
    // y queda el evento.)
    function alCerrar() {
      if (!volverA && !cuerpo.firstChild) return;
      turno++;
      soltar();
      cuerpo.replaceChildren();
      const v = volverA;
      volverA = null;
      if (v && v.isConnected) v.focus();
    }
    cerrar.addEventListener("click", () => { d.close(); alCerrar(); });
    d.addEventListener("close", alCerrar);
    // Con las flechas del teclado (fuera de un campo o del visor) se pasa de archivo.
    d.addEventListener("keydown", (e) => {
      if (e.target.closest("input, select, textarea, iframe")) return;
      if (e.key === "ArrowLeft" && indice > 0) { e.preventDefault(); mostrar(indice - 1); }
      if (e.key === "ArrowRight" && indice < lista.length - 1) { e.preventDefault(); mostrar(indice + 1); }
    });
    dialogo = d;
    return d;
  }

  function soltar() {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
  }

  function aviso(caja, texto, a) {
    const p = el("div", "max-w-xl mx-auto mt-10 text-center space-y-3");
    p.append(el("p", "text-sm text-brand-600 dark:text-brand-200", texto));
    const b = el("a", "inline-flex items-center gap-1 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "📥 Bajar el archivo");
    b.href = a.ruta;
    b.setAttribute("download", nombreArchivo(a.ruta));
    p.append(b);
    caja.append(p);
  }

  async function mostrar(i) {
    if (i < 0 || i >= lista.length) return;
    indice = i;
    const a = lista[i];
    const yo = ++turno;
    const seguir = () => yo === turno && dialogo.open;
    soltar();
    const ext = a.ext || extension(a.ruta);
    $("vista-previa-titulo").textContent = a.titulo || nombreArchivo(a.ruta);
    $("vista-previa-sub").textContent = (lista.length > 1 ? (i + 1) + " de " + lista.length + " · " : "") + nombreArchivo(a.ruta);
    $("vista-previa-anterior").disabled = i === 0;
    $("vista-previa-siguiente").disabled = i === lista.length - 1;
    $("vista-previa-anterior").hidden = $("vista-previa-siguiente").hidden = lista.length < 2;
    const abrir = $("vista-previa-abrir");
    abrir.href = a.ruta;
    const esImagen = /^(png|jpe?g|gif|webp|avif|svg|ico)$/.test(ext);
    abrir.hidden = ext !== "pdf" && ext !== "html" && !esImagen;
    const bajar = $("vista-previa-bajar");
    bajar.href = a.ruta;
    bajar.setAttribute("download", nombreArchivo(a.ruta));

    const caja = $("vista-previa-cuerpo");
    caja.replaceChildren();
    caja.scrollTop = 0;
    const estado = $("vista-previa-estado");

    if (esImagen) {
      // La imagen entera, sobre un damero para que se note lo transparente
      // (un logo blanco sobre blanco no se vería). Como <img>, un SVG no corre
      // ningún programa.
      const marco = el("div", "flex items-center justify-center min-h-[60vh] rounded-lg border border-brand-200 dark:border-brand-700 p-4");
      marco.style.background = "repeating-conic-gradient(#d9e2ec 0% 25%, #f0f4f8 0% 50%) 50% / 24px 24px";
      const img = el("img", "max-w-full max-h-[75vh] object-contain");
      img.src = a.ruta;
      img.alt = a.titulo || nombreArchivo(a.ruta);
      marco.append(img);
      caja.append(marco);
      estado.textContent = "Vista previa de " + (a.titulo || nombreArchivo(a.ruta)) + ".";
      return;
    }
    if (ext === "pdf" || ext === "html") {
      const marco = el("iframe", "w-full h-full min-h-[70vh] rounded-lg border border-brand-200 dark:border-brand-700 bg-white");
      // Una página se ve sin sus programas: para leerla no hacen falta.
      if (ext === "html") marco.setAttribute("sandbox", "allow-same-origin allow-popups");
      marco.src = a.ruta + (ext === "pdf" ? "#view=FitH" : "");
      marco.title = "Vista previa: " + (a.titulo || nombreArchivo(a.ruta));
      caja.append(marco);
      estado.textContent = "Vista previa de " + (a.titulo || nombreArchivo(a.ruta)) + ".";
      return;
    }
    const pintor = { pptx: pintarPresentacion, docx: pintarWord, xlsx: pintarExcel, xlsm: pintarExcel }[ext];
    if (!pintor || typeof DecompressionStream === "undefined") {
      aviso(caja, pintor
        ? "Este navegador no puede abrir el archivo para verlo acá. Bájalo para verlo."
        : "Este formato (." + ext + ") no se puede ver en el navegador. Bájalo para abrirlo en su programa.", a);
      estado.textContent = "Sin vista previa para este archivo.";
      return;
    }
    const cargando = el("p", "text-sm text-brand-500 dark:text-brand-300 text-center mt-10", "Abriendo el archivo…");
    caja.append(cargando);
    estado.textContent = "Abriendo " + (a.titulo || nombreArchivo(a.ruta)) + "…";
    try {
      const r = await fetch(a.ruta, { credentials: "same-origin" });
      if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "no tienes permiso para verlo (" + r.status + ")" : "HTTP " + r.status);
      const zip = leerZip(await r.arrayBuffer());
      if (!seguir()) return;
      const contenido = el("div", "vista-contenido");
      await pintor(zip, contenido, seguir);
      if (!seguir()) return;
      caja.replaceChildren(contenido);
      estado.textContent = "Vista previa de " + (a.titulo || nombreArchivo(a.ruta)) + " lista.";
    } catch (e) {
      if (!seguir()) return;
      caja.replaceChildren();
      aviso(caja, "No se pudo armar la vista previa: " + (e.message || e) + ".", a);
      estado.textContent = "No se pudo armar la vista previa.";
    }
  }

  function abrir(nuevaLista, i) {
    lista = nuevaLista || [];
    volverA = document.activeElement;
    const d = armar();
    if (!d.open) d.showModal();
    mostrar(i || 0);
    $("vista-previa-cerrar").focus();
  }

  window.VistaPrevia = { abrir, leerZip };
})();
