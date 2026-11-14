/* La Mesa del árbitro con torneos de Pareo Integral: «Vincular» un torneo de
   Pareo Integral a un evento de la organización (centroamericano-mesas.html,
   pestaña «Torneos»). Ver «La Mesa del árbitro con torneos de Pareo Integral»
   en docs/decisiones/juegos-y-torneos.md.

   Lee los torneos que Pareo Integral guarda en ESTE navegador (la misma
   computadora donde el árbitro principal lleva su Pareo): la lista
   `pareo_lista_v1` y cada torneo `pareo_torneo_v1_<id>` (CLAVE_LISTA y PREFIJO
   de js/pareo/pagina.js; verificar-mesa-pareo-fuente.js comprueba que sean
   los mismos). NUNCA escribe ahí: si Pareo está abierto, su próximo guardado
   lo pisaría.

   Para vincular hace falta que el torneo esté PUBLICADO (Pareo lo publica
   solo al emparejar la ronda 1; antes, el principal toca «Publicar» en
   Archivos): la clave del torneo (`publicado.clave`) va a la base en el
   momento, que la compara con su sha256 (centroamericano_pareo_vincular) y
   no la guarda. Esta página tampoco la guarda ni la muestra. */
(function (raiz) {
  "use strict";
  const CLAVE_LISTA = "pareo_lista_v1";
  const PREFIJO = "pareo_torneo_v1_";

  const leer = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };

  // Los torneos de Pareo de este navegador, lo más reciente primero.
  function torneosLocales() {
    const lista = Array.isArray(leer(CLAVE_LISTA)) ? leer(CLAVE_LISTA) : [];
    return lista.slice().sort((a, b) => (Number(b && b.actualizado) || 0) - (Number(a && a.actualizado) || 0)).map((x) => {
      const t = x && x.id ? leer(PREFIJO + x.id) : null;
      if (!t || typeof t !== "object") return null;
      const pub = t.publicado && typeof t.publicado.id === "string" && typeof t.publicado.clave === "string" ? t.publicado : null;
      return {
        id: x.id, nombre: String(t.nombre || x.nombre || "Torneo sin nombre").slice(0, 80), evento: t.evento && t.evento.nombre ? String(t.evento.nombre).slice(0, 80) : "",
        equipos: t.tipo === "equipos", jugadores: Array.isArray(t.jugadores) ? t.jugadores.length : 0, rondas: Array.isArray(t.rondas) ? t.rondas.length : 0,
        ritmo: String(t.ritmo || ""), fecha: String(t.fechaFin || t.fechaInicio || ""), publicado: pub,
      };
    }).filter(Boolean);
  }

  // El ritmo propuesto (del control de tiempo, la única cuenta: js/ritmo-control.js).
  const ritmoPropuesto = (t) => (raiz.RitmoControl && raiz.RitmoControl.deducir(t.ritmo, t.nombre)) || "clasico";
  // La tablet del árbitro reconoce el Rápido y el Blitz por el NOMBRE (ver renombrarTorneo en centroamericano-mesas-pagina.js):
  // si el nombre no lo dice, se le agrega.
  function nombreConRitmo(nombre, ritmo, C) {
    const dice = C && C.ritmoRapido ? C.ritmoRapido(nombre, null) || "clasico" : "clasico";
    if (dice === ritmo) return nombre;
    if (ritmo === "clasico") return nombre.replace(/\s*\((r[aá]pido|blitz)\)\s*$/i, "");
    return (nombre + " (" + (ritmo === "blitz" ? "Blitz" : "Rápido") + ")").slice(0, 80);
  }

  function iniciar(o) {
    const { raiz: caja, sb, C, el } = o;
    if (!caja) return { pintar() {} };
    let enviando = false;

    function pintar() {
      const locales = torneosLocales();
      const vinculados = new Map((o.torneos() || []).filter((t) => t.fuente === "pareo" && t.pareo_id).map((t) => [t.pareo_id, t]));
      const eventos = o.eventos() || [];
      const evento = el("input", { id: "pv-evento", type: "text", maxlength: "80", class: "cam-campo", autocomplete: "off", list: "pv-eventos", "aria-describedby": "pv-evento-ayuda",
        value: caja.__evento || eventos[0] || (locales.find((t) => t.evento) || {}).evento || "" });
      evento.addEventListener("input", () => { caja.__evento = evento.value; });
      const estado = el("p", { id: "pv-estado", class: "text-sm mt-2", role: "status" });
      const filas = locales.map((t) => {
        const ya = t.publicado && vinculados.get(t.publicado.id);
        const ritmo = el("select", { class: "cam-select", "aria-label": "Ritmo de " + t.nombre, "data-ritmo": t.id },
          ...[["clasico", "Clásico"], ["rapido", "Rápido"], ["blitz", "Blitz"]].map(([v, txt]) => el("option", { value: v, texto: txt })));
        ritmo.value = ya ? (C.ritmoDe ? C.ritmoDe(ya) : "clasico") : ritmoPropuesto(t);
        const situacion = t.equipos ? "Por equipos: todavía no va en la Mesa del árbitro."
          : !t.publicado ? "Sin publicar. Ábrelo en Pareo Integral y toca «Publicar» (pestaña «Archivos y comprobador»): así se puede vincular desde antes de la ronda 1."
          : (t.rondas ? "Publicado · ronda " + t.rondas : "Publicado · todavía sin rondas") + " · " + t.jugadores + " jugadores" + (ya ? " · ✓ Vinculado al evento «" + ya.evento + "»" : "");
        const boton = el("button", { type: "button", class: "cam-btn cam-btn-chico" + (ya ? " cam-btn-claro" : ""), "data-accion": "vincular", "data-pareo": t.id,
          disabled: !t.publicado || t.equipos, "aria-label": (ya ? "Volver a vincular " : "Vincular ") + t.nombre }, ya ? "Volver a vincular" : "Vincular");
        boton.addEventListener("click", () => vincular(t, ritmo.value, evento, estado));
        return el("li", { class: "cam-estado-torneo", "data-pareo": t.id, "data-vinculado": ya ? "si" : "no" },
          el("p", { class: "font-bold", texto: t.nombre }),
          el("p", { class: "text-sm mt-1", texto: situacion }),
          el("div", { class: "cam-acciones" }, el("label", { class: "text-sm font-bold flex items-center gap-2" }, "Ritmo", ritmo), boton));
      });
      caja.replaceChildren(
        el("h2", { id: "t-pareo-vincular", class: "cam-subtitulo" }, "Torneos de Pareo Integral"),
        el("p", { class: "mt-1", texto: "Elige sobre qué torneos vas a trabajar. Salen los de Pareo Integral de esta computadora (la misma donde llevas tu Pareo). Al vincular uno, en «Árbitros y mesas» creas los enlaces de tus árbitros: anotan en su tablet y lo que anotan le llega a tu Pareo Integral, que lo acepta como a cualquier adjunto (tiene que estar abierto; si está cerrado, entra al abrirlo)." }),
        el("label", { for: "pv-evento", class: "block text-sm font-bold mt-3", texto: "Evento" }), evento,
        el("datalist", { id: "pv-eventos" }, ...eventos.map((e) => el("option", { value: e }))),
        el("p", { id: "pv-evento-ayuda", class: "text-sm mt-1", texto: "El nombre que agrupa los torneos (por ejemplo, «Eliminatoria Cantonal JDN Pérez Zeledón 2026»). Si no existe, se crea a tu nombre." }),
        locales.length ? el("ul", { class: "cam-torneos mt-3", id: "pv-lista" }, ...filas)
          : el("p", { class: "mt-3", id: "pv-vacio", texto: "En esta computadora no hay torneos de Pareo Integral. Ábrelo aquí (pareo.html), carga o abre tu torneo y vuelve a esta pestaña." }),
        estado);
    }

    async function vincular(t, ritmo, evento, estado) {
      if (enviando) return;
      const nombreEvento = evento.value.replace(/\s+/g, " ").trim();
      if (!nombreEvento) { estado.textContent = "✗ Escribe el nombre del evento."; evento.focus(); return; }
      // Se vuelve a leer en el momento: la clave nunca queda en esta página.
      const fresco = torneosLocales().find((x) => x.id === t.id);
      if (!fresco || !fresco.publicado) { estado.textContent = "✗ Ese torneo ya no está publicado en esta computadora: ábrelo en Pareo Integral y publícalo."; return; }
      enviando = true;
      estado.textContent = "Vinculando «" + t.nombre + "»…";
      const { data, error } = await sb.rpc("centroamericano_pareo_vincular", {
        p_evento: nombreEvento, p_pareo: fresco.publicado.id, p_clave: fresco.publicado.clave,
        p_nombre: nombreConRitmo(fresco.nombre, ritmo, C), p_categoria: null, p_rama: null, p_ritmo: ritmo, p_prueba: !!(o.ensayo && o.ensayo()),
      });
      enviando = false;
      if (error) { estado.textContent = "✗ No se pudo vincular: " + error.message; return; }
      estado.textContent = "✓ «" + t.nombre + "» quedó en el evento «" + nombreEvento + "». Ya puedes crear los enlaces de sus árbitros en «Árbitros y mesas».";
      caja.__evento = nombreEvento;
      if (o.alVincular) await o.alVincular(data, fresco);
    }

    pintar();
    return { pintar };
  }

  const api = { CLAVE_LISTA, PREFIJO, torneosLocales, nombreConRitmo, iniciar };
  if (typeof module === "object" && module.exports) module.exports = api;
  else raiz.MesaPareoVincular = api;
})(typeof window !== "undefined" ? window : globalThis);

/*! rev bfb5bbb0d2d82f9f */
