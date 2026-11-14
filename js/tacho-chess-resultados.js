/* Los resultados del Torneo Intereducativo Tacho Chess 2 (tacho-chess-2.html):
 * se publican en Pareo Integral (lo dijo el dueño el 12/11/2026). Este módulo
 * encuentra el torneo solo, sin tocar el código, y cambia la ficha
 * «Resultados» de «Pronto» al enlace a su página pública en Pareo
 * (torneos-pareo.html#t=<id>), que js/ventana-enlace.js abre encima.
 *
 * - Cuenta solo un torneo de una organización de Pareo con el sello
 *   «Organizador verificado» (lo pone solo administración: sin el sello,
 *   cualquiera publicaría un «Tacho Chess» y la ficha llevaría a él), con
 *   «Tacho» en el nombre y creado desde octubre de 2026 (no la edición 1).
 * - Si la organización juega los niveles en varios torneos, salen todos: la
 *   ficha abre la ventana #resultados con un enlace por torneo.
 * - Sin torneo, la ficha se queda «Pronto»: nunca lleva a la lista de Pareo,
 *   que trae los torneos de otros.
 *
 * Se lee con la clave anónima: pareo_organizadores y pareo_publicados son de
 * lectura pública (sus políticas dejan fuera lo oculto).
 *
 * Ver «La del Tacho Chess 2» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const NOMBRE = /\btacho\b/;
  const DESDE = "2026-10-01";
  const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  async function buscar() {
    // Con js/torneo-pareo-datos.js en la página, su búsqueda: sin el torneo
    // publicado dos veces y en el orden de los niveles.
    if (window.TorneoPareoDatos && window.TorneoPareoDatos.buscar) return window.TorneoPareoDatos.buscar();
    const sb = window.sb;
    if (!sb) throw new Error("sin cliente");
    const { data: orgs, error: e1 } = await sb.from("pareo_organizadores").select("id").eq("verificado", true);
    if (e1) throw e1;
    const ids = (orgs || []).map((o) => o.id);
    if (!ids.length) return [];
    const { data, error } = await sb.from("pareo_publicados").select("id, nombre, creado")
      .in("organizador_id", ids).ilike("nombre", "%tacho%").gte("creado", DESDE)
      .order("creado", { ascending: true }).range(0, 49);
    if (error) throw error;
    return (data || []).filter((t) => NOMBRE.test(sinTildes(t.nombre)));
  }

  const enlaceTorneo = (t, titulo) => {
    const a = document.createElement("a");
    a.href = "torneos-pareo.html?en-ventana=1#t=" + encodeURIComponent(t.id);
    a.dataset.ventana = titulo;
    return a;
  };

  // La ficha «Pronto» pasa a ser un enlace: al torneo, o a la ventana con todos.
  function pintar(torneos) {
    const vieja = $("ficha-resultados");
    if (!vieja || !torneos.length || vieja.tagName === "A") return;
    let a;
    if (torneos.length === 1) a = enlaceTorneo(torneos[0], "Resultados de Tacho Chess 2");
    else {
      a = document.createElement("a");
      a.href = "#resultados";
      const lista = $("resultados-lista");
      lista.replaceChildren(...torneos.map((t) => {
        const li = document.createElement("li");
        const e = enlaceTorneo(t, t.nombre);
        e.className = "tacho-boton";
        e.textContent = t.nombre + " →";
        li.append(e);
        return li;
      }));
      $("resultados-estado").textContent = "La organización juega los niveles en " + torneos.length + " torneos. Elige el tuyo:";
    }
    a.id = vieja.id;
    a.dataset.color = vieja.dataset.color;
    a.className = vieja.className.replace("bg-white/70 dark:bg-brand-900/70 border-2 border-dashed border-brand-300 dark:border-brand-700", "bg-white dark:bg-brand-900 shadow-md");
    a.removeAttribute("tabindex");
    const partes = [...vieja.children];
    const fin = document.createElement("span");
    fin.className = "mt-auto pt-3 sm:pt-4 text-xs sm:text-sm font-bold cac-accion";
    fin.textContent = (torneos.length === 1 ? "Ver el torneo" : "Ver los torneos") + " →";
    a.append(...partes.slice(0, -1), fin);
    vieja.replaceWith(a);
  }

  buscar().then(pintar).catch(() => { /* sin conexión: la ficha sigue «Pronto» */ });
})();

/*! rev bfb5bbb0d2d82f9f */
