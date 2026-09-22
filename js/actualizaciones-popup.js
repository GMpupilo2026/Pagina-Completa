/**
 * Ajedrez Integral — el popup de "novedades de la plataforma".
 *
 * Es SOLO de administración (profiles.is_admin), no del equipo docente ni
 * del alumnado: son avisos entre quienes administran el sitio, redactados a
 * mano desde admin.html, y un profesor no tiene con qué actuar sobre ellos.
 * La RLS de `actualizaciones_plataforma` ya lo hace cumplir (ver CLAUDE.md);
 * este módulo solo pinta lo que la base le entrega.
 *
 * Se llama una vez, al entrar al panel:
 *
 *     await ActualizacionesPopup.mostrarSiHayNuevas(sb, profile);
 *
 * `profile` ya viene cargado por la página (select("*") de profiles), así
 * que no hace falta una segunda consulta para saber desde cuándo mirar.
 *
 * Lo nuevo se decide contra `profile.ultima_vista_actualizaciones`: NULL
 * quiere decir que esta cuenta nunca cerró el popup, así que se le muestran
 * todas las que haya. Al cerrarlo se guarda la fecha de la más nueva que se
 * llegó a mostrar (no "ahora"): así una que se creó en el instante en que el
 * popup estaba abierto no se pierde sin que nadie la haya visto.
 */
(function () {
  "use strict";

  var LIMITE = 20;

  function crearModal() {
    var overlay = document.createElement("div");
    overlay.id = "actualizaciones-modal";
    overlay.className = "fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "actualizaciones-modal-titulo");

    var caja = document.createElement("div");
    caja.className = "bg-white dark:bg-brand-900 rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[85vh] flex flex-col";

    var titulo = document.createElement("h3");
    titulo.id = "actualizaciones-modal-titulo";
    titulo.className = "font-serif text-lg font-bold text-brand-800 dark:text-white mb-1";
    titulo.textContent = "📣 Novedades de la plataforma";

    var sub = document.createElement("p");
    sub.className = "text-xs text-brand-450 dark:text-brand-350 mb-4";
    sub.textContent = "Lo que cambió desde tu última visita.";

    var lista = document.createElement("div");
    lista.id = "actualizaciones-modal-lista";
    lista.className = "space-y-4 overflow-y-auto pr-1 -mr-1";

    var pie = document.createElement("div");
    pie.className = "flex justify-end mt-5 pt-4 border-t border-brand-100 dark:border-brand-700";
    var cerrar = document.createElement("button");
    cerrar.type = "button";
    cerrar.id = "actualizaciones-modal-cerrar";
    cerrar.className = "px-4 py-2 rounded-lg text-sm font-semibold bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    cerrar.textContent = "Entendido";
    pie.appendChild(cerrar);

    caja.appendChild(titulo);
    caja.appendChild(sub);
    caja.appendChild(lista);
    caja.appendChild(pie);
    overlay.appendChild(caja);
    document.body.appendChild(overlay);
    return { overlay: overlay, lista: lista, cerrar: cerrar };
  }

  function fechaLegible(iso) {
    try {
      return new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric" });
    } catch (e) {
      return "";
    }
  }

  function pintarItem(lista, item) {
    var art = document.createElement("article");
    art.className = "pb-4 border-b border-brand-100 dark:border-brand-700 last:border-0 last:pb-0";

    var h4 = document.createElement("h4");
    h4.className = "font-semibold text-brand-800 dark:text-white text-sm";
    h4.textContent = item.titulo;

    var fecha = document.createElement("p");
    fecha.className = "text-xs text-brand-450 dark:text-brand-350 mb-1";
    fecha.textContent = fechaLegible(item.created_at);

    var desc = document.createElement("p");
    desc.className = "text-sm text-brand-600 dark:text-brand-300 whitespace-pre-line";
    desc.textContent = item.descripcion;

    art.appendChild(h4);
    art.appendChild(fecha);
    art.appendChild(desc);
    lista.appendChild(art);
  }

  async function marcarVista(sb, uid, fecha) {
    try {
      await sb.from("profiles").update({ ultima_vista_actualizaciones: fecha }).eq("id", uid);
    } catch (e) {
      // Si esto falla, el peor caso es volver a ver el mismo aviso la
      // próxima vez que entre: no vale la pena bloquear nada por esto.
    }
  }

  window.ActualizacionesPopup = {
    mostrarSiHayNuevas: async function (sb, profile) {
      if (!sb || !profile || !profile.is_admin) return;
      var q = sb
        .from("actualizaciones_plataforma")
        .select("id, titulo, descripcion, created_at")
        .order("created_at", { ascending: false })
        .limit(LIMITE);
      if (profile.ultima_vista_actualizaciones) {
        q = q.gt("created_at", profile.ultima_vista_actualizaciones);
      }
      var r;
      try {
        r = await q;
      } catch (e) {
        return;
      }
      var items = (r && r.data) || [];
      if (!items.length) return;

      var m = crearModal();
      items.forEach(function (item) { pintarItem(m.lista, item); });

      var focoAnterior = document.activeElement;
      var cerrado = false;
      function cerrar() {
        if (cerrado) return;
        cerrado = true;
        document.removeEventListener("keydown", alEscape);
        m.overlay.remove();
        if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
        marcarVista(sb, profile.id, items[0].created_at);
      }
      function alEscape(e) {
        if (e.key === "Escape") cerrar();
      }
      m.cerrar.addEventListener("click", cerrar);
      document.addEventListener("keydown", alEscape);
      m.cerrar.focus();
    },
  };
})();
