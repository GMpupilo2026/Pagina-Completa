/* Abre un enlace en una ventana encima de la página, sin salir de ella
 * (y, más abajo, las ventanas ya escritas en la propia página).
 *
 * Un <a href="…" data-ventana="Título"> abre su dirección en un <dialog> con
 * un marco, en vez de otra pestaña. El <dialog> con showModal() ya encierra el
 * foco, deja inerte lo de atrás y cierra con Escape; al cerrar, el foco vuelve
 * al enlace. Sin JavaScript, o con Ctrl/⌘/Mayús o la rueda, el enlace hace lo
 * de siempre (su target="_blank").
 *
 * Lo que se abre aquí tiene que estar en frame-src de la CSP de _headers, y el
 * sitio de afuera tiene que dejarse enmarcar: como eso no se puede saber desde
 * la página, la ventana trae siempre «Abrir en otra pestaña».
 * Ver «La página del Centroamericano 2026» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  let serie = 0;

  function abrir(enlace) {
    const titulo = enlace.dataset.ventana || enlace.textContent.trim();
    const id = "ventana-enlace-" + (++serie);
    const d = el("dialog", "ventana-enlace w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-w-5xl h-[90vh] rounded-2xl shadow-2xl p-0 bg-white dark:bg-brand-900 text-brand-800 dark:text-white backdrop:bg-black/60");
    d.setAttribute("aria-labelledby", id + "-titulo");

    const caja = el("div", "h-full flex flex-col");
    const barra = el("div", "flex flex-wrap items-center gap-2 px-4 py-3 border-b border-brand-100 dark:border-brand-800");
    const h = el("h2", "font-serif text-lg font-bold flex-1 min-w-0 truncate", titulo);
    h.id = id + "-titulo";
    barra.appendChild(h);

    const afuera = el("a", "text-sm font-semibold text-accent-700 dark:text-accent-400 underline underline-offset-2 hover:no-underline rounded px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Abrir en otra pestaña ↗");
    afuera.href = enlace.href;
    afuera.target = "_blank";
    afuera.rel = "noopener";
    barra.appendChild(afuera);

    const cerrar = el("button", "bg-brand-800 hover:bg-brand-700 text-white font-semibold text-sm px-4 py-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2", "Cerrar");
    cerrar.type = "button";
    cerrar.addEventListener("click", () => d.close());
    barra.appendChild(cerrar);
    caja.appendChild(barra);

    const marco = el("iframe", "flex-1 w-full bg-white");
    marco.src = enlace.href;
    marco.title = titulo;
    marco.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    caja.appendChild(marco);

    caja.appendChild(el("p", "px-4 py-2 text-xs text-brand-600 dark:text-brand-300 border-t border-brand-100 dark:border-brand-800",
      "¿No se ve? Algunos sitios no se dejan mostrar aquí: usa «Abrir en otra pestaña»."));
    d.appendChild(caja);

    d.addEventListener("close", () => {
      d.remove();
      if (document.contains(enlace)) enlace.focus();
    });
    // Un clic en el fondo oscuro (fuera de la caja) también cierra.
    d.addEventListener("click", (ev) => { if (ev.target === d) d.close(); });

    document.body.appendChild(d);
    d.showModal();
    cerrar.focus();
    return d;
  }

  /* Las ventanas de la propia página: un <dialog class="ficha-dialogo" id="x">
     ya escrito en el HTML (con su botón [data-cerrar]) se abre con cualquier
     enlace a «#x» —la ficha, el menú o el pie— y al entrar con «#x» en la
     dirección. Al cerrar, el foco vuelve a quien la abrió. */
  let quienAbrio = null;
  function dialogoDe(hash) {
    if (!hash || hash.length < 2) return null;
    const d = document.getElementById(decodeURIComponent(hash.slice(1)));
    return d && d.matches("dialog.ficha-dialogo") ? d : null;
  }
  function abrirDialogo(d, desde) {
    if (d.open) return;
    quienAbrio = desde || null;
    d.showModal();
    d.scrollTop = 0;
    const cerrar = d.querySelector("[data-cerrar]");
    if (cerrar) cerrar.focus();
  }
  document.querySelectorAll("dialog.ficha-dialogo").forEach((d) => {
    d.querySelectorAll("[data-cerrar]").forEach((b) => b.addEventListener("click", () => d.close()));
    d.addEventListener("click", (ev) => { if (ev.target === d) d.close(); });
    d.addEventListener("close", () => {
      if (location.hash === "#" + d.id) history.replaceState(null, "", location.pathname + location.search);
      if (quienAbrio && document.contains(quienAbrio)) quienAbrio.focus();
      quienAbrio = null;
    });
  });
  const alEntrar = dialogoDe(location.hash);
  if (alEntrar && typeof alEntrar.showModal === "function") abrirDialogo(alEntrar, null);

  /* Entrar con «#x», si x es una ficha a[data-ventana], la abre encima: así
     otra página del sitio lleva a «los resultados» sin mandar a nadie afuera
     (la ficha del Centroamericano en Torneos, js/salas-torneo.js). Al cerrar
     se quita el «#x» y el foco queda en la ficha. */
  function fichaDe(hash) {
    if (!hash || hash.length < 2) return null;
    const a = document.getElementById(decodeURIComponent(hash.slice(1)));
    return a && a.matches("a[data-ventana]") ? a : null;
  }
  const fichaAlEntrar = fichaDe(location.hash);
  if (fichaAlEntrar && typeof HTMLDialogElement === "function") {
    abrir(fichaAlEntrar).addEventListener("close", () => {
      if (location.hash === "#" + fichaAlEntrar.id) history.replaceState(null, "", location.pathname + location.search);
    });
  }

  document.addEventListener("click", (ev) => {
    const interno = ev.target.closest && ev.target.closest('a[href^="#"]');
    if (interno && ev.button === 0 && !ev.defaultPrevented) {
      const d = dialogoDe(interno.getAttribute("href"));
      if (d && typeof d.showModal === "function") {
        ev.preventDefault();
        // Desde el menú del celular, que queda abierto detrás, igual se abre encima.
        abrirDialogo(d, interno);
        return;
      }
    }
    const a = ev.target.closest && ev.target.closest("a[data-ventana]");
    if (!a || ev.defaultPrevented || ev.button !== 0) return;
    if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
    if (typeof HTMLDialogElement !== "function") return;
    ev.preventDefault();
    abrir(a);
  });

  window.VentanaEnlace = { abrir, abrirDialogo };
})();
