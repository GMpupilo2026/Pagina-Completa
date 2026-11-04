/* Un documento en una ventanita encima de la página, para que nadie se vaya
 * del sitio a leerlo: las bases de un torneo, la política de privacidad, la
 * clasificación de chess-results o la transmisión de Lichess.
 *
 * Por qué no un enlace a otra pestaña: en el celular, un PDF en otra pestaña
 * es otra app (el lector de PDF, el navegador del WhatsApp…) y volver a la
 * página con toda la información del torneo es justo lo que no se sabe hacer.
 * Acá el documento se abre encima y se cierra con «Cerrar», tocando afuera,
 * con Escape o con el botón «Atrás» del celular, que en vez de sacar a la
 * persona de la página cierra la ventanita (ver «Los documentos se abren
 * encima» en docs/decisiones/cuentas-y-formularios.md).
 *
 *   - PDF: pdf.js (js/pdf.min.js, se pide la primera vez) pinta cada página en
 *     un lienzo del ancho de la ventana. Se pinta solo lo que está cerca de
 *     verse. El visor de PDF del navegador en un marco no sirve: Chrome en
 *     Android no lo tiene y Safari en el iPhone muestra solo la primera hoja.
 *     El texto de cada página va también escrito, para el lector de pantalla.
 *   - Una página del sitio (.html) o de chess-results: en un marco.
 *   - Lichess: su versión para incrustar (lichess.org/embed/broadcast/…).
 *   Siempre queda, arriba, el botón para bajarlo o abrirlo aparte.
 *
 * Uso:
 *   <a href="documentos/…/bases.pdf" data-visor="Bases del torneo">…</a>
 *   El clic normal lo abre encima; Ctrl/⌘ + clic o el botón del medio
 *   siguen abriendo otra pestaña, para quien lo quiere así.
 *   VisorDocumento.abrir({ ruta, titulo })   desde el código.
 */
(function () {
  "use strict";

  let pdfjs = null;
  function cargarPdfjs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfjs) {
      pdfjs = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "js/pdf.min.js";
        s.onload = () => (window.pdfjsLib ? resolve(window.pdfjsLib) : reject(new Error("sin pdfjsLib")));
        s.onerror = () => reject(new Error("no se pudo bajar pdf.js"));
        document.head.appendChild(s);
      }).catch((e) => { pdfjs = null; throw e; });
    }
    return pdfjs;
  }

  const ZOOMS = [1, 1.5, 2, 3];
  let dlg = null, cuerpo = null, titulo = null, estado = null, aparte = null, masB = null, menosB = null;
  let turno = 0, doc = null, observador = null, zoom = 0, volverA = null, conHistoria = false;

  function boton(texto, clase) {
    const b = document.createElement("button");
    b.type = "button"; b.className = clase || "visor-doc-boton"; b.textContent = texto;
    return b;
  }

  function armar() {
    if (dlg) return;
    dlg = document.createElement("dialog");
    dlg.className = "visor-doc";
    dlg.setAttribute("aria-labelledby", "visor-doc-titulo");
    const cab = document.createElement("div"); cab.className = "visor-doc-cabeza";
    titulo = document.createElement("h2"); titulo.id = "visor-doc-titulo";
    menosB = boton("−"); menosB.setAttribute("aria-label", "Más chico");
    masB = boton("+"); masB.setAttribute("aria-label", "Más grande");
    aparte = document.createElement("a"); aparte.className = "visor-doc-boton"; aparte.rel = "noopener";
    const cerrarB = boton("Cerrar", "visor-doc-boton visor-doc-cerrar");
    cab.append(titulo, menosB, masB, aparte, cerrarB);
    estado = document.createElement("p"); estado.className = "visor-doc-estado"; estado.setAttribute("role", "status");
    cuerpo = document.createElement("div"); cuerpo.className = "visor-doc-cuerpo"; cuerpo.tabIndex = 0;
    dlg.append(cab, estado, cuerpo);
    document.body.append(dlg);

    cerrarB.addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (ev) => { if (ev.target === dlg) dlg.close(); });
    menosB.addEventListener("click", () => cambiarZoom(-1));
    masB.addEventListener("click", () => cambiarZoom(1));
    dlg.addEventListener("close", () => {
      turno++;
      limpiar();
      // Si la abrimos con una entrada en el historial, se saca: así «Atrás»
      // después de cerrarla no vuelve a abrir nada.
      if (conHistoria && history.state && history.state.visorDocumento) { conHistoria = false; history.back(); }
      conHistoria = false;
      if (volverA && document.contains(volverA)) volverA.focus();
      volverA = null;
    });
    // «Atrás» del celular con la ventanita abierta: la cierra y nada más.
    window.addEventListener("popstate", () => {
      if (dlg.open && !(history.state && history.state.visorDocumento)) { conHistoria = false; dlg.close(); }
    });
  }

  function limpiar() {
    if (observador) { observador.disconnect(); observador = null; }
    if (doc) { try { doc.destroy(); } catch (e) { /* ya estaba cerrado */ } doc = null; }
    cuerpo.textContent = "";
    estado.textContent = "";
    zoom = 0;
  }

  function tipoDe(ruta) {
    let u;
    try { u = new URL(ruta, location.href); } catch (e) { return { tipo: "marco", url: ruta }; }
    if (/\.pdf$/i.test(u.pathname)) return { tipo: "pdf", url: u.href };
    if (/(^|\.)lichess\.org$/i.test(u.hostname) && /^\/broadcast\//.test(u.pathname)) {
      return { tipo: "marco", url: "https://lichess.org/embed" + u.pathname };
    }
    return { tipo: "marco", url: u.href };
  }

  function abrir({ ruta, titulo: t }) {
    armar();
    turno++;
    limpiar();
    const { tipo, url } = tipoDe(ruta);
    titulo.textContent = t || "Documento";
    const esPdf = tipo === "pdf";
    const mismoSitio = new URL(url, location.href).origin === location.origin;
    aparte.href = esPdf ? url : ruta;
    if (esPdf && mismoSitio) { aparte.setAttribute("download", ""); aparte.removeAttribute("target"); aparte.textContent = "Bajar"; aparte.setAttribute("aria-label", "Bajar el PDF"); }
    else { aparte.removeAttribute("download"); aparte.target = "_blank"; aparte.textContent = "Abrir aparte"; aparte.setAttribute("aria-label", "Abrir aparte, en otra pestaña"); }
    menosB.hidden = masB.hidden = !esPdf;
    volverA = document.activeElement;
    if (!dlg.open) {
      dlg.showModal();
      if (!(history.state && history.state.visorDocumento)) {
        history.pushState(Object.assign({}, history.state, { visorDocumento: true }), "");
        conHistoria = true;
      }
    }
    if (esPdf) pintarPdf(url, turno);
    else {
      const f = document.createElement("iframe");
      f.className = "visor-doc-marco";
      f.src = url;
      f.title = t || "Documento";
      f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      cuerpo.append(f);
    }
  }

  async function pintarPdf(url, miTurno) {
    estado.textContent = "Abriendo el documento…";
    try {
      const lib = await cargarPdfjs();
      lib.GlobalWorkerOptions.workerSrc = "js/pdf.worker.min.js";
      const d = await lib.getDocument({ url }).promise;
      if (miTurno !== turno) { d.destroy(); return; }
      doc = d;
      const primera = await d.getPage(1);
      const vp = primera.getViewport({ scale: 1 });
      const proporcion = vp.height / vp.width;
      estado.textContent = d.numPages === 1 ? "1 página." : d.numPages + " páginas. Desliza para leerlas.";
      observador = new IntersectionObserver((entradas) => {
        entradas.forEach((e) => { if (e.isIntersecting) pintarPagina(e.target, miTurno); });
      }, { root: cuerpo, rootMargin: "800px 0px" });
      for (let i = 1; i <= d.numPages; i++) {
        const fig = document.createElement("figure");
        fig.className = "visor-doc-pagina";
        fig.dataset.pagina = String(i);
        fig.style.aspectRatio = "1 / " + proporcion;
        fig.setAttribute("aria-label", "Página " + i + " de " + d.numPages);
        cuerpo.append(fig);
        observador.observe(fig);
      }
    } catch (e) {
      if (miTurno !== turno) return;
      estado.textContent = "No se pudo abrir el documento aquí. Usa «" + aparte.textContent + "».";
    }
  }

  async function pintarPagina(fig, miTurno) {
    const n = Number(fig.dataset.pagina);
    const nivel = String(zoom);
    if (fig.dataset.pintada === nivel || fig.dataset.pintando === nivel) return;
    fig.dataset.pintando = nivel;
    try {
      const p = await doc.getPage(n);
      if (miTurno !== turno) return;
      const ancho = fig.clientWidth || cuerpo.clientWidth || 800;
      const base = p.getViewport({ scale: 1 });
      const escala = (ancho / base.width) * Math.min(window.devicePixelRatio || 1, 2);
      const vp = p.getViewport({ scale: escala });
      const lienzo = document.createElement("canvas");
      lienzo.width = Math.round(vp.width); lienzo.height = Math.round(vp.height);
      lienzo.setAttribute("aria-hidden", "true");
      await p.render({ canvasContext: lienzo.getContext("2d"), viewport: vp }).promise;
      if (miTurno !== turno || String(zoom) !== nivel) return;
      let texto = fig.querySelector(".sr-only");
      if (!texto) {
        texto = document.createElement("div"); texto.className = "sr-only";
        const c = await p.getTextContent();
        texto.textContent = (c.items || []).map((it) => (it.str || "") + (it.hasEOL ? "\n" : " ")).join("").replace(/[ \t]+/g, " ").trim();
      }
      fig.textContent = "";
      fig.append(lienzo, texto);
      fig.dataset.pintada = nivel;
    } catch (e) {
      if (miTurno === turno) fig.dataset.error = "1";
    } finally {
      if (fig.dataset.pintando === nivel) delete fig.dataset.pintando;
    }
  }

  function cambiarZoom(d) {
    const nuevo = Math.max(0, Math.min(ZOOMS.length - 1, zoom + d));
    if (nuevo === zoom || !doc) return;
    // Se guarda qué parte se estaba leyendo, para no perderla al agrandar.
    const relativo = cuerpo.scrollHeight ? cuerpo.scrollTop / cuerpo.scrollHeight : 0;
    zoom = nuevo;
    cuerpo.style.setProperty("--visor-zoom", String(ZOOMS[zoom]));
    cuerpo.classList.toggle("visor-doc-ampliado", zoom > 0);
    cuerpo.scrollTop = relativo * cuerpo.scrollHeight;
    menosB.disabled = zoom === 0; masB.disabled = zoom === ZOOMS.length - 1;
    estado.textContent = zoom ? "Tamaño: " + ZOOMS[zoom] + " veces." : "Tamaño normal.";
    cuerpo.querySelectorAll(".visor-doc-pagina").forEach((fig) => {
      const r = fig.getBoundingClientRect(), c = cuerpo.getBoundingClientRect();
      if (r.bottom > c.top - 800 && r.top < c.bottom + 800) pintarPagina(fig, turno);
    });
    // Las que no se ven, se pintan al llegar a ellas.
    if (observador) cuerpo.querySelectorAll(".visor-doc-pagina").forEach((fig) => { observador.unobserve(fig); observador.observe(fig); });
  }

  document.addEventListener("click", (ev) => {
    const a = ev.target.closest && ev.target.closest("a[data-visor]");
    if (!a || ev.defaultPrevented) return;
    if (ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    abrir({ ruta: a.getAttribute("href"), titulo: a.dataset.visor || a.textContent.trim() });
  });

  window.VisorDocumento = { abrir };
})();
