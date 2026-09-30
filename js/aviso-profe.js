/**
 * Ajedrez Integral — el aviso del profe, en una ventana que no se salta.
 *
 * El profe manda un aviso a sus alumnos desde su panel («Mañana no hay clase»,
 * «Traigan la tarea de finales»). Al alumno le aparece en una ventana que
 * tapa la página entera, en CUALQUIER página de la Academia, y no puede hacer
 * nada más hasta apretar «Marcar como leído»: así pidió el dueño de la
 * Academia que fuera, para que el aviso no se pierda entre tarjetas. Si tiene
 * varios, van uno detrás del otro, el más viejo primero.
 *
 * - Es un <dialog> abierto con showModal(): el navegador deja inerte todo lo
 *   de afuera (ni clic ni Tab llegan) y encierra el foco adentro. Escape NO lo
 *   cierra (se cancela el evento `cancel`): la única salida es el botón.
 * - Lo que dice el profe va por textContent: es texto de una persona.
 * - «Marcar como leído» lo anota la base (marcar_aviso_leido: solo la fila
 *   propia y solo la primera vez). Si la base no contesta, la ventana se
 *   cierra igual —dejar a alguien encerrado en la página por un corte de red
 *   sería peor— y como no quedó marcado, vuelve la próxima vez.
 * - Qué avisos tiene sin leer lo contesta mis_avisos_sin_leer(), que solo da
 *   los de quien pregunta: a un profe, a quien administra o a quien mira
 *   «como» otra persona (sigue siendo su propia cuenta) no le sale nada.
 *
 * La pone herramientas/academia-cabecera.py en todas las páginas de la
 * Academia menos examen.html (una ventana encima de un examen con reloj es
 * justo lo que el antitrampa evita). Ver «El aviso del profe» en
 * docs/decisiones/paneles.md.
 */
window.AvisoProfe = (function () {
  "use strict";

  const BTN = "rounded-lg px-4 py-2 text-sm font-semibold bg-accent-500 hover:bg-accent-600 text-brand-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-400 disabled:opacity-60";
  const FECHA = new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
  let sb = null, abierto = false;

  function el(tag, clases, texto) {
    const n = document.createElement(tag);
    if (clases) n.className = clases;
    if (texto != null) n.textContent = texto;
    return n;
  }

  function mostrar(avisos, i) {
    const a = avisos[i];
    if (!a) { abierto = false; return; }
    abierto = true;
    const d = el("dialog", "w-[calc(100%-2rem)] max-w-lg rounded-2xl shadow-2xl p-0 bg-white dark:bg-brand-900 text-brand-800 dark:text-white backdrop:bg-black/60");
    d.dataset.avisoProfe = a.id;
    d.setAttribute("aria-labelledby", "aviso-profe-titulo");
    d.setAttribute("aria-describedby", "aviso-profe-texto");
    const caja = el("div", "p-6");
    const titulo = el("h2", "font-serif text-xl font-bold");
    titulo.id = "aviso-profe-titulo";
    const icono = el("span", null, "📣 ");
    icono.setAttribute("aria-hidden", "true");
    titulo.append(icono, document.createTextNode("Aviso de " + (a.profesor || "tu profe")));
    const cuando = el("p", "text-xs text-brand-600 dark:text-brand-300 mt-1",
      (a.created_at ? FECHA.format(new Date(a.created_at)) : "") + (avisos.length > 1 ? " · " + (i + 1) + " de " + avisos.length : ""));
    const texto = el("p", "mt-4 text-base whitespace-pre-line break-words", a.texto);
    texto.id = "aviso-profe-texto";
    const pie = el("div", "mt-6 flex flex-wrap items-center justify-end gap-3");
    const error = el("p", "text-sm text-red-700 dark:text-red-300 mr-auto");
    error.setAttribute("role", "status");
    const boton = el("button", BTN, "Marcar como leído");
    boton.type = "button";
    boton.dataset.avisoLeido = "";
    pie.append(error, boton);
    caja.append(titulo, cuando, texto, pie);
    d.appendChild(caja);

    // Escape no cierra: la única salida es «Marcar como leído».
    d.addEventListener("cancel", (e) => e.preventDefault());
    boton.addEventListener("click", async () => {
      boton.disabled = true;
      let ok = false;
      try {
        const r = await sb.rpc("marcar_aviso_leido", { p_aviso: a.id });
        ok = !(r && r.error);
      } catch (e) { ok = false; }
      if (!ok) {
        // Se cierra igual: no se deja a nadie encerrado por un corte de red.
        // Como no quedó marcado, vuelve la próxima vez que abra una página.
        error.textContent = "No se pudo anotar: te lo vamos a volver a mostrar.";
        await new Promise((listo) => setTimeout(listo, 1500));
      }
      d.close();
      d.remove();
      mostrar(avisos, i + 1);
    });

    document.body.appendChild(d);
    d.showModal();
    boton.focus();
  }

  async function revisar() {
    if (abierto || !sb) return;
    try {
      const r = await sb.rpc("mis_avisos_sin_leer");
      if (r && !r.error && Array.isArray(r.data) && r.data.length) mostrar(r.data, 0);
    } catch (e) { /* sin red: vuelve a mirar en la próxima página */ }
  }

  async function autoIniciar() {
    const cliente = window.sb;
    if (!cliente || !cliente.auth || typeof cliente.rpc !== "function") return;
    try {
      const r = await cliente.auth.getSession();
      if (!r || !r.data || !r.data.session) return;
    } catch (e) { return; }
    sb = cliente;
    revisar();
    // Si vuelve a la pestaña (dejó el celular y regresa), se mira otra vez:
    // el aviso pudo llegar mientras tanto.
    document.addEventListener("visibilitychange", () => { if (!document.hidden) revisar(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoIniciar);
  else autoIniciar();

  return { revisar };
})();
