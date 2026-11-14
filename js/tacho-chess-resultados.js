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

  // «Partidas en vivo»: un torneo con las cámaras de Notara conectadas en
  // Pareo (el código que publica en `datos.camaras`, el mismo del QR de cada
  // mesa) lleva a tablero-vivo.html#<código>&t=<id>, que muestra todas las
  // mesas de la ronda, jugada por jugada. El árbitro conecta las cámaras con
  // el torneo ya empezado, así que se vuelve a preguntar cada minuto, solo
  // por el código y las rondas (unos bytes, no el torneo entero). Un torneo
  // terminado ya no lo muestra.
  const CODIGO = /^[a-hjkmnp-z2-9]{8}$/;
  const CADA = 60000;
  const corto = (nombre) => { const m = /\(([^)]+)\)/.exec(nombre || ""); return m ? m[1] : nombre; };

  async function leerVivo(torneos) {
    const { data, error } = await window.sb.from("pareo_publicados").select("id, rondas, rondas_total, camaras:datos->>camaras")
      .in("id", torneos.map((t) => t.id));
    if (error) throw error;
    const porId = new Map((data || []).map((x) => [x.id, x]));
    return torneos.map((t) => ({ t, x: porId.get(t.id) }))
      .filter(({ x }) => x && CODIGO.test(x.camaras || "") && !(x.rondas_total > 0 && x.rondas >= x.rondas_total))
      .map(({ t, x }) => ({ id: t.id, nombre: t.nombre, codigo: x.camaras }));
  }

  function pintarVivo(conCamaras) {
    const caja = document.querySelector("#hoy .cac-hoy");
    if (!caja) return;
    let zona = $("hoy-vivo");
    const clave = conCamaras.map((v) => v.id + ":" + v.codigo).join(",");
    if (zona && zona.dataset.clave === clave) return; // igual que antes: no se rearma (ni se pierde el foco)
    if (!conCamaras.length) { if (zona) zona.remove(); return; }
    if (!zona) {
      zona = document.createElement("div");
      zona.id = "hoy-vivo";
      zona.className = "mt-4";
      caja.append(zona);
    }
    zona.dataset.clave = clave;
    const p = document.createElement("p");
    p.className = "text-sm font-bold";
    p.textContent = "Partidas en vivo, jugada por jugada, desde las cámaras de las mesas:";
    const ul = document.createElement("ul");
    ul.className = "mt-2 flex flex-wrap gap-2";
    conCamaras.forEach((v) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.className = "tacho-boton";
      a.href = "tablero-vivo.html#" + v.codigo + "&t=" + encodeURIComponent(v.id);
      const ico = document.createElement("span");
      ico.setAttribute("aria-hidden", "true");
      ico.textContent = "📺 ";
      a.append(ico, conCamaras.length === 1 ? "Ver las partidas en vivo →" : "En vivo: " + corto(v.nombre) + " →");
      li.append(a);
      ul.append(li);
    });
    zona.replaceChildren(p, ul);
  }

  function vigilarVivo(torneos) {
    if (!torneos.length || !window.sb) return;
    const una = () => leerVivo(torneos).then(pintarVivo).catch(() => { /* sin conexión: queda lo último que se vio */ });
    una();
    setInterval(() => { if (!document.hidden) una(); }, CADA);
  }

  buscar().then((torneos) => { pintar(torneos); vigilarVivo(torneos); })
    .catch(() => { /* sin conexión: la ficha sigue «Pronto» */ });
})();

/*! rev bfb5bbb0d2d82f9f */
