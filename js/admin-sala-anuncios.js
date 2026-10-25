/* Los avisos de la organización de una sala de Torneos, en admin.html#torneos:
 * publicarlos («la ronda 6 se atrasa 30 minutos») y quitarlos.
 *
 * Escribe solo por las funciones de la base, que validan que quien llama
 * administra: sala_anuncio_publicar() y sala_anuncio_quitar(). Publicar sale
 * arriba en la página del torneo y al celular de quien activó «Avisarme en
 * este celular» en esa sala (lo manda la Edge Function sala-jugadores), así
 * que se pregunta antes. Ver «Los avisos de la organización» en
 * docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  const hora = (iso) => new Date(iso).toLocaleString("es-CR", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Costa_Rica" });

  function decir(texto, error) {
    const p = $("anuncio-estado");
    p.textContent = texto;
    p.className = "mt-3 text-sm font-semibold " + (error ? "text-red-700 dark:text-red-300" : "text-green-800 dark:text-green-200");
  }

  async function cargarVigentes() {
    const ul = $("anuncios-admin");
    const { data, error } = await sb.from("sala_anuncios").select("id, sala, texto, texto_en, creado, hasta").order("creado", { ascending: false }).limit(50);
    ul.replaceChildren();
    if (error) { ul.appendChild(el("li", "text-sm text-red-700 dark:text-red-300", "No se pudieron leer los avisos.")); return; }
    if (!data.length) { ul.appendChild(el("li", "text-sm text-brand-500 dark:text-brand-300", "No hay avisos vigentes.")); return; }
    data.forEach((a) => {
      const li = el("li", "py-3 flex flex-wrap items-start gap-3");
      const info = el("div", "min-w-0 flex-1");
      info.appendChild(el("p", "text-sm text-brand-800 dark:text-white", a.texto));
      if (a.texto_en) info.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-300", a.texto_en));
      info.appendChild(el("p", "text-xs text-brand-500 dark:text-brand-300 mt-1", a.sala + " · publicado " + hora(a.creado) + " · hasta " + hora(a.hasta)));
      li.appendChild(info);
      const quitar = el("button", "px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 hover:bg-red-100 dark:bg-red-950 dark:hover:bg-red-900 text-red-700 dark:text-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Quitar");
      quitar.type = "button";
      quitar.setAttribute("aria-label", "Quitar el aviso «" + a.texto.slice(0, 60) + "»");
      quitar.addEventListener("click", async () => {
        if (!(await Avisos.confirmar("Deja de verse en la página. A quien ya le llegó al celular, ahí le queda.", { titulo: "¿Quitar este aviso?", aceptar: "Quitar el aviso", peligro: true }))) return;
        const { error: e } = await sb.rpc("sala_anuncio_quitar", { p_id: a.id });
        if (e) { decir("No se pudo quitar. Vuelve a intentarlo.", true); return; }
        decir("Listo: el aviso ya no se ve en la página.");
        cargarVigentes();
      });
      li.appendChild(quitar);
      ul.appendChild(li);
    });
  }

  async function publicar(ev) {
    ev.preventDefault();
    const sala = $("anuncio-sala").value, texto = $("anuncio-texto").value.trim(), en = $("anuncio-texto-en").value.trim();
    const horas = Number($("anuncio-horas").value) || 24;
    if (!sala) { decir("Elige la sala del aviso.", true); $("anuncio-sala").focus(); return; }
    if (texto.length < 3) { decir("Escribe el aviso (al menos 3 letras).", true); $("anuncio-texto").focus(); return; }
    if (en && en.length < 3) { decir("El texto en inglés es muy corto: escríbelo o déjalo vacío.", true); $("anuncio-texto-en").focus(); return; }
    const nombre = $("anuncio-sala").selectedOptions[0].textContent;
    if (!(await Avisos.confirmar("Sale arriba en la página de «" + nombre + "» por " + horas + " horas y les llega al celular a todos los que activaron los avisos de esa sala.",
      { titulo: "¿Publicar este aviso?", aceptar: "Publicar y avisar" }))) return;
    const boton = $("anuncio-publicar");
    boton.disabled = true;
    try {
      const { error } = await sb.rpc("sala_anuncio_publicar", { p_sala: sala, p_texto: texto, p_texto_en: en || null, p_horas: horas });
      if (error) { decir(error.code === "42501" ? "Tu cuenta no tiene permiso para publicar avisos." : "No se pudo publicar. Revisa el texto (de 3 a 280 letras) e intenta de nuevo.", true); return; }
      $("anuncio-texto").value = "";
      $("anuncio-texto-en").value = "";
      decir("Listo: el aviso ya está en la página y va saliendo a los celulares.");
      cargarVigentes();
    } finally {
      boton.disabled = false;
    }
  }

  let iniciado = false;
  async function iniciar() {
    if (iniciado || !$("anuncio-form")) return;
    iniciado = true;
    $("anuncio-form").addEventListener("submit", publicar);
    try {
      const salas = (await SalasTorneo.listar()).filter((s) => s.visible);
      const sel = $("anuncio-sala");
      sel.replaceChildren(el("option", "", "Elige la sala"));
      sel.firstChild.value = "";
      salas.forEach((s) => { const o = el("option", "", s.nombre); o.value = s.clave; sel.appendChild(o); });
      if (salas.some((s) => s.clave === "centroamericano-2026")) sel.value = "centroamericano-2026";
    } catch (e) {
      decir("No se pudieron cargar las salas. Recarga la página.", true);
    }
    cargarVigentes();
  }

  window.AdminSalaAnuncios = { iniciar };
})();
