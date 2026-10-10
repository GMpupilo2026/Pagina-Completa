/* El código de juegos-estudiantiles.html: la página pública de los Juegos
   Estudiantiles MEP. Lee public.jde_eventos (lectura pública, sin candado:
   es justo lo que debe ver cualquier familia) y pinta las cuatro fases, cada
   una con sus regionales, con la MISMA plantilla —aunque esa fase todavía no
   tenga ningún evento publicado—. Los eventos los sube, sin cuenta,
   jde-arbitro.html. Ver «Juegos Estudiantiles MEP, modo árbitro» en
   docs/decisiones/juegos-y-torneos.md. */
(function () {
  "use strict";
  const F = window.JdeFases;
  const sb = window.sb;
  const $ = (id) => document.getElementById(id);

  function escVis(s) {
    return String(s == null ? "" : s);
  }

  function medalla(puesto) {
    if (puesto === 1) return "🥇 1.º";
    if (puesto === 2) return "🥈 2.º";
    if (puesto === 3) return "🥉 3.º";
    return puesto + ".º";
  }

  // PostgREST corta a mil filas sin avisar: se piden de mil en mil.
  async function pedirEventos(anio) {
    const eventos = [];
    let desde = 0;
    for (;;) {
      const { data, error } = await sb.from("jde_eventos").select("*")
        .eq("anio", anio).order("fase").order("region").order("nombre")
        .range(desde, desde + 999);
      if (error) throw error;
      eventos.push(...(data || []));
      if (!data || data.length < 1000) break;
      desde += 1000;
    }
    return eventos;
  }

  function tarjetaEvento(ev) {
    const art = document.createElement("article");
    art.className = "rounded-2xl bg-white dark:bg-brand-900 shadow-md p-5";

    const h3 = document.createElement("h3");
    h3.className = "font-semibold text-brand-800 dark:text-white";
    h3.textContent = escVis(ev.nombre);
    art.appendChild(h3);

    const partesMeta = [];
    if (ev.categoria) partesMeta.push(ev.categoria);
    if (ev.rama) partesMeta.push(F.ramaNombre(ev.rama));
    if (ev.sede) partesMeta.push(ev.sede);
    if (ev.fecha) partesMeta.push(window.HoraCR ? window.HoraCR.fecha(ev.fecha) : ev.fecha);
    if (ev.arbitro) partesMeta.push("Árbitro: " + ev.arbitro);
    if (partesMeta.length) {
      const p = document.createElement("p");
      p.className = "text-sm text-brand-500 dark:text-brand-300 mt-1";
      p.textContent = partesMeta.join(" · ");
      art.appendChild(p);
    }

    const filas = Array.isArray(ev.clasificacion) ? ev.clasificacion : [];
    if (filas.length) {
      const envoltorio = document.createElement("div");
      envoltorio.className = "mt-3 max-h-72 overflow-y-auto";
      const tabla = document.createElement("table");
      tabla.className = "w-full text-sm";
      const cuerpo = document.createElement("tbody");
      filas.forEach((f) => {
        const tr = document.createElement("tr");
        tr.className = "border-t border-brand-100 dark:border-brand-800";
        const tdPuesto = document.createElement("td");
        tdPuesto.className = "py-1 pr-2 whitespace-nowrap";
        tdPuesto.textContent = medalla(Number(f.puesto) || 0);
        const tdNombre = document.createElement("td");
        tdNombre.className = "py-1 pr-2";
        tdNombre.textContent = escVis(f.nombre);
        if (f.institucion) {
          const small = document.createElement("span");
          small.className = "block text-xs text-brand-450 dark:text-brand-350";
          small.textContent = escVis(f.institucion);
          tdNombre.appendChild(small);
        }
        const tdPuntos = document.createElement("td");
        tdPuntos.className = "py-1 text-right whitespace-nowrap";
        tdPuntos.textContent = String(f.puntos);
        tr.append(tdPuesto, tdNombre, tdPuntos);
        cuerpo.appendChild(tr);
      });
      tabla.appendChild(cuerpo);
      envoltorio.appendChild(tabla);
      art.appendChild(envoltorio);
    }
    return art;
  }

  function seccionRegion(region, eventos) {
    const div = document.createElement("div");
    const h4 = document.createElement("h4");
    h4.className = "font-serif text-lg font-bold text-brand-700 dark:text-brand-200 mb-3";
    h4.textContent = region || "Nacional";
    div.appendChild(h4);
    const grilla = document.createElement("div");
    grilla.className = "grid md:grid-cols-2 gap-4";
    eventos.forEach((ev) => grilla.appendChild(tarjetaEvento(ev)));
    div.appendChild(grilla);
    return div;
  }

  function seccionFase(fase, eventos) {
    const section = document.createElement("section");
    const h2 = document.createElement("h2");
    h2.className = "font-serif text-2xl font-bold text-brand-800 dark:text-white mb-4 pb-2 border-b border-brand-200 dark:border-brand-800";
    h2.textContent = F.faseNombre(fase);
    section.appendChild(h2);

    if (!eventos.length) {
      const p = document.createElement("p");
      p.className = "text-sm text-brand-500 dark:text-brand-300";
      p.textContent = "Todavía no hay eventos publicados de esta fase.";
      section.appendChild(p);
      return section;
    }

    const porRegion = new Map();
    eventos.forEach((ev) => {
      const clave = ev.region || "";
      if (!porRegion.has(clave)) porRegion.set(clave, []);
      porRegion.get(clave).push(ev);
    });
    [...porRegion.keys()].sort((a, b) => a.localeCompare(b, "es")).forEach((region) => {
      section.appendChild(seccionRegion(region, porRegion.get(region)));
    });
    return section;
  }

  function pintarNormativa(anio) {
    const caja = $("je-normativa");
    caja.textContent = "";
    const n = F.normativaDe(anio);
    if (!n) { caja.textContent = "Normativa de " + anio + " pendiente de publicar."; return; }
    const a = document.createElement("a");
    a.href = n.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "font-semibold text-brand-800 dark:text-white underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    a.textContent = "Ver la normativa de " + anio + " →";
    caja.appendChild(a);
  }

  async function cargar(anio) {
    const estado = $("je-estado");
    const caja = $("je-fases");
    caja.textContent = "";
    estado.textContent = "Cargando…";
    pintarNormativa(anio);
    let eventos;
    try { eventos = await pedirEventos(anio); }
    catch { estado.textContent = "No se pudieron cargar los eventos. Intenta de nuevo."; return; }
    estado.textContent = "";
    F.FASES.forEach((f) => {
      caja.appendChild(seccionFase(f.id, eventos.filter((ev) => ev.fase === f.id)));
    });
  }

  async function iniciar() {
    const select = $("je-anio");
    const anios = new Set(F.anios());
    try {
      const { data } = await sb.from("jde_eventos").select("anio");
      (data || []).forEach((f) => anios.add(f.anio));
    } catch { /* se queda con los años conocidos */ }
    [...anios].sort((a, b) => b - a).forEach((anio) => {
      const opt = document.createElement("option");
      opt.value = String(anio);
      opt.textContent = String(anio);
      select.appendChild(opt);
    });
    select.value = String(F.anioMasReciente());
    select.addEventListener("change", () => cargar(Number(select.value)));
    cargar(Number(select.value));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
