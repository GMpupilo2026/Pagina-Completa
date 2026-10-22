/* El código de torneos-pareo.html: «Torneos en Pareo Integral», el espacio
   público donde se ve todo torneo que su organizador publicó desde
   pareo.html (js/pareo/publicar.js → Edge Function pareo-publicar).

   Lee public.pareo_publicados, que es de lectura pública: la lista con sus
   columnas (sin abrir el JSON) y, al elegir uno, su `datos` (el torneo tal
   como lo limpió la función). La clasificación se calcula acá con los
   mismos módulos de Pareo Integral (js/pareo/), así sale igual que en la
   computadora del árbitro. La clave de cada torneo no se puede leer: su
   columna no tiene permiso de lectura.

   - #t=<id> abre un torneo; &j=<id> abre a un jugador; &r=<n> una ronda.
   - El torneo abierto se vuelve a leer cada minuto mientras la pestaña está
     a la vista (el árbitro lo pone al día mientras juegan).
   - La ficha del jugador trae los otros torneos publicados con el mismo
     nombre escrito igual.

   Ver «Torneos en Pareo Integral: el espacio público» en
   docs/decisiones/juegos-y-torneos.md. */
(function () {
  "use strict";
  const T = window.PareoTorneo;
  const E = window.PareoEquipos;
  const V = window.PareoEvento;
  const $ = (id) => document.getElementById(id);
  const COLUMNAS = "id,nombre,evento,lugar,fecha,rondas,rondas_total,jugadores,actualizado";
  const REFRESCO_MS = 60000;

  function el(tag, attrs, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "texto") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const h of hijos.flat()) if (h != null) n.append(h.nodeType ? h : document.createTextNode(String(h)));
    return n;
  }
  const C = {
    campo: "rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-900 text-brand-800 dark:text-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
    enlace: "underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
    nota: "text-sm text-brand-600 dark:text-brand-300",
    tarjeta: "rounded-2xl bg-white dark:bg-brand-900 shadow-md p-5",
    pestana: "px-4 py-2 rounded-lg text-sm font-semibold border border-brand-200 dark:border-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
  };
  const puntosTexto = (x) => {
    const n = Math.floor(x), m = x - n;
    return (n || !m ? String(n) : "") + (Math.abs(m - 0.5) < 1e-9 ? "½" : "");
  };
  const RESULTADO = { "1-0": "1 – 0", "0-1": "0 – 1", "=": "½ – ½", "+-": "+ – −", "-+": "− – +", "--": "− – −" };
  const fechaTexto = (iso) => (iso ? (window.HoraCR ? HoraCR.fecha(iso) : iso) : "");
  const clave = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

  // ---------- La ruta: #t=<id>&j=<id>&r=<n>&v=<vista> ----------
  function leerRuta() {
    const p = new URLSearchParams(location.hash.replace(/^#/, ""));
    return { t: p.get("t") || "", j: p.get("j") || "", r: p.get("r") || "", v: p.get("v") || "", n: p.get("n") || "" };
  }
  function irA(cambios) {
    const r = Object.assign(leerRuta(), cambios);
    const p = new URLSearchParams();
    for (const k of ["t", "v", "r", "j", "n"]) if (r[k]) p.set(k, r[k]);
    const h = "#" + p.toString();
    if (location.hash !== h) location.hash = h; else pintar();
  }

  // ---------- La lista ----------
  let lista = null;
  async function pedirLista() {
    // PostgREST corta a mil filas sin avisar: se piden de mil en mil.
    const filas = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await window.sb.from("pareo_publicados").select(COLUMNAS)
        .order("actualizado", { ascending: false }).range(desde, desde + 999);
      if (error) throw error;
      filas.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return filas;
  }
  function tarjetaLista(x) {
    const partes = [x.evento, x.lugar, fechaTexto(x.fecha)].filter(Boolean);
    const avance = x.rondas_total ? "Ronda " + x.rondas + " de " + x.rondas_total : x.rondas + " rondas";
    return el("li", {},
      el("a", { href: "#t=" + encodeURIComponent(x.id), class: "block " + C.tarjeta + " hover:ring-2 hover:ring-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "data-torneo": x.id },
        el("span", { class: "block font-semibold text-brand-800 dark:text-white", texto: x.nombre }),
        partes.length ? el("span", { class: "block " + C.nota + " mt-1", texto: partes.join(" · ") }) : null,
        el("span", { class: "block text-sm mt-2", texto: avance + " · " + x.jugadores + " participantes" }),
        el("span", { class: "block text-xs text-brand-600 dark:text-brand-300 mt-1", texto: "Actualizado: " + (window.HoraCR ? HoraCR.fechaHora(x.actualizado) : x.actualizado) })));
  }
  function pintarLista() {
    const caja = $("tp-contenido");
    const q = clave($("tp-buscar") ? $("tp-buscar").value : "");
    const cuales = (lista || []).filter((x) => !q || clave([x.nombre, x.evento, x.lugar].join(" ")).includes(q));
    const ul = $("tp-lista");
    ul.replaceChildren(...cuales.map(tarjetaLista));
    $("tp-cuantos").textContent = !lista ? "" : !lista.length ? "Todavía no hay torneos publicados."
      : cuales.length === lista.length ? lista.length + (lista.length === 1 ? " torneo publicado." : " torneos publicados.")
      : cuales.length + " de " + lista.length + " torneos.";
    caja.hidden = true;
    $("tp-portada").hidden = false;
  }

  // ---------- Un torneo ----------
  let abierto = null; // { fila, t }
  let refresco = null;
  async function pedirTorneo(id) {
    const { data, error } = await window.sb.from("pareo_publicados").select(COLUMNAS + ",datos").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }
  const nombreDe = (t, id) => ((t.jugadores.find((j) => j.id === id) || {}).nombre || "?");
  const rondasCompletas = (t) => V.rondasCompletas(t);
  function clasificacion(t) {
    const k = rondasCompletas(t);
    if (!k) return { k, filas: [] };
    return { k, filas: V.aplicarDesempate(t, E.clasificacion(Object.assign({}, t, { rondas: t.rondas.slice(0, k) }), t.desempates)) };
  }

  function cabecera(fila, t) {
    const partes = [t.evento && t.evento.nombre, t.ciudad, [fechaTexto(t.fechaInicio), fechaTexto(t.fechaFin)].filter(Boolean).join(" al ")].filter(Boolean);
    const datos = [t.sistema === "todos" ? "Todos contra todos" : "Suizo de " + (t.rondasTotales || "?") + " rondas", t.ritmo, t.arbitro ? "Árbitro: " + t.arbitro : ""].filter(Boolean);
    return el("div", { class: "mb-6" },
      el("a", { href: "#", class: C.enlace + " text-sm", texto: "← Todos los torneos" }),
      el("h1", { id: "tp-titulo", class: "font-serif text-3xl md:text-4xl font-bold text-brand-800 dark:text-white mt-3", tabindex: "-1", texto: fila.nombre }),
      partes.length ? el("p", { class: "text-brand-600 dark:text-brand-300 mt-1", texto: partes.join(" · ") }) : null,
      el("p", { class: C.nota + " mt-1", texto: datos.join(" · ") }),
      el("p", { id: "tp-actualizado", class: "text-xs text-brand-600 dark:text-brand-300 mt-2", role: "status", texto: "Actualizado: " + (window.HoraCR ? HoraCR.fechaHora(fila.actualizado) : fila.actualizado) + " · se vuelve a leer cada minuto" }));
  }

  function pestanas(actual) {
    const p = (v, texto) => el("a", { href: "#" + new URLSearchParams({ t: leerRuta().t, v }).toString(), class: C.pestana + (actual === v ? " bg-accent-500 text-brand-900" : " bg-white dark:bg-brand-900"), "aria-current": actual === v ? "page" : null, texto });
    return el("nav", { class: "flex flex-wrap gap-2 mb-5", "aria-label": "Partes del torneo" },
      p("clasificacion", "Clasificación"), p("rondas", "Rondas"), p("jugadores", "Jugadores"));
  }

  function vistaClasificacion(t) {
    const { k, filas } = clasificacion(t);
    const caja = el("section", { class: C.tarjeta, "aria-labelledby": "tp-clas-titulo" },
      el("h2", { id: "tp-clas-titulo", class: "font-serif text-xl font-bold mb-1", texto: k ? "Clasificación tras la ronda " + k : "Clasificación" }));
    if (!k) { caja.append(el("p", { class: C.nota, texto: "Todavía no hay una ronda completa." })); return caja; }
    if (k < (t.sistema === "todos" ? T.rondasTodos(t) : Number(t.rondasTotales) || 0)) caja.append(el("p", { class: C.nota + " mb-2", texto: "Provisional: faltan rondas." }));
    const des = t.desempates || [];
    caja.append(el("div", { class: "overflow-x-auto" }, el("table", { id: "tp-tabla-clas", class: "pi-tabla" },
      el("thead", {}, el("tr", {},
        el("th", { class: "num", scope: "col", texto: "Puesto" }), el("th", { scope: "col", texto: "Nombre" }),
        el("th", { scope: "col", texto: E.esDeEquipos(t) ? "Equipo" : "Institución" }), el("th", { class: "num", scope: "col", texto: "Elo" }),
        el("th", { class: "num", scope: "col", texto: "Pts" }), des.map((c) => el("th", { class: "num", scope: "col", texto: c })))),
      el("tbody", {}, filas.map((f) => {
        const j = t.jugadores.find((x) => x.id === f.id) || {};
        return el("tr", { "data-id": f.id },
          el("td", { class: "num", texto: f.puesto }),
          el("td", {}, el("a", { href: "#" + new URLSearchParams({ t: leerRuta().t, v: "jugadores", j: f.id }).toString(), class: C.enlace + " font-semibold", texto: j.nombre + (j.titulo ? " (" + j.titulo + ")" : "") })),
          el("td", { texto: E.esDeEquipos(t) ? "" : (j.institucion || "") }),
          el("td", { class: "num", texto: Number(j.elo) > 0 ? j.elo : "" }),
          el("td", { class: "num font-bold", texto: puntosTexto(f.puntos) }),
          des.map((c) => el("td", { class: "num", texto: c === "TB" ? E.textoTableros(f.valores[c], t.tableros) : formato(f.valores[c]) })));
      })))));
    return caja;
  }
  const formato = (x) => (x == null ? "" : String(Math.round(Number(x) * 100) / 100).replace(".", ","));

  function vistaRondas(t, r) {
    const caja = el("section", { class: C.tarjeta, "aria-labelledby": "tp-ronda-titulo" });
    if (!t.rondas.length) { caja.append(el("p", { class: C.nota, texto: "Todavía no hay rondas emparejadas." })); return caja; }
    const i = Math.min(t.rondas.length - 1, Math.max(0, (Number(r) || t.rondas.length) - 1));
    const sel = el("select", { id: "tp-ronda", class: C.campo }, t.rondas.map((x, k) => el("option", { value: String(k + 1), selected: k === i, texto: "Ronda " + (k + 1) })));
    sel.addEventListener("change", () => irA({ v: "rondas", r: sel.value, j: "" }));
    const buscar = el("input", { id: "tp-buscar-mesa", type: "search", class: C.campo + " w-full sm:w-64", autocomplete: "off" });
    caja.append(el("div", { class: "flex flex-wrap items-end justify-between gap-3 mb-3" },
      el("h2", { id: "tp-ronda-titulo", class: "font-serif text-xl font-bold", texto: "Ronda " + (i + 1) }),
      el("div", { class: "flex flex-wrap items-end gap-3" },
        el("label", { for: "tp-ronda", class: "flex flex-col text-sm" }, el("span", { class: "font-semibold", texto: "Ver la ronda" }), sel),
        el("label", { for: "tp-buscar-mesa", class: "flex flex-col text-sm" }, el("span", { class: "font-semibold", texto: "Buscar a un jugador" }), buscar))));
    const R = t.rondas[i];
    const deEquipos = E.esDeEquipos(t);
    const conPuntos = (id) => nombreDe(t, id) + (i > 0 && !deEquipos ? " (" + puntosTexto(T.puntosHasta(t, id, i)) + ")" : "");
    const tbody = el("tbody");
    R.mesas.forEach((m, k) => {
      const fila = el("tr", { "data-mesa": String(V.mesaFisica(t, k)), "data-nombres": clave(nombreDe(t, m.b) + " " + (m.n ? nombreDe(t, m.n) : "")) },
        el("td", { class: "num", texto: V.mesaFisica(t, k) }),
        el("td", { class: "font-semibold", texto: conPuntos(m.b) }),
        el("td", { class: "num whitespace-nowrap", texto: m.n === null ? "Libre" : m.r ? RESULTADO[m.r] || m.r : "jugando" }),
        el("td", { class: "font-semibold", texto: m.n === null ? "" : conPuntos(m.n) }));
      tbody.append(fila);
      // En equipos, las partidas de cada tablero, si el árbitro anotó la alineación.
      if (deEquipos && m.alineacion && Array.isArray(m.partidas) && m.n) {
        const eqB = t.jugadores.find((x) => x.id === m.b) || {}, eqN = t.jugadores.find((x) => x.id === m.n) || {};
        const de = (eq, id) => ((eq.integrantes || []).find((x) => x.id === id) || {}).nombre || "—";
        m.partidas.forEach((p, b) => tbody.append(el("tr", { class: "text-sm text-brand-600 dark:text-brand-300", "data-nombres": fila.dataset.nombres },
          el("td", { class: "num", texto: "T" + (b + 1) }), el("td", { texto: de(eqB, (m.alineacion.b || [])[b]) }),
          el("td", { class: "num", texto: p && p.r ? RESULTADO[p.r] || p.r : "" }), el("td", { texto: de(eqN, (m.alineacion.n || [])[b]) }))));
      }
    });
    const tabla = el("table", { id: "tp-tabla-ronda", class: "pi-tabla" },
      el("thead", {}, el("tr", {}, el("th", { class: "num", scope: "col", texto: "Mesa" }), el("th", { scope: "col", texto: "Blancas" }),
        el("th", { class: "num", scope: "col", texto: "Resultado" }), el("th", { scope: "col", texto: "Negras" }))), tbody);
    const nadie = el("p", { class: C.nota + " mt-2", role: "status", hidden: true, texto: "Nadie con ese nombre en esta ronda." });
    buscar.addEventListener("input", () => {
      const q = clave(buscar.value);
      let hay = 0;
      for (const tr of tbody.children) { const si = !q || tr.dataset.nombres.includes(q); tr.hidden = !si; if (si) hay++; }
      nadie.hidden = !!hay;
    });
    caja.append(el("div", { class: "overflow-x-auto" }, tabla), nadie);
    return caja;
  }

  function vistaJugadores(t, jid, fila) {
    const caja = el("section", { class: C.tarjeta, "aria-labelledby": "tp-jug-titulo" });
    const orden = T.ordenInicial(t);
    const sel = el("select", { id: "tp-jugador", class: C.campo }, el("option", { value: "", texto: "Elige a un jugador…" }),
      orden.map((id) => el("option", { value: id, selected: id === jid, texto: nombreDe(t, id) })));
    sel.addEventListener("change", () => irA({ v: "jugadores", j: sel.value, r: "", n: "" }));
    caja.append(el("h2", { id: "tp-jug-titulo", class: "font-serif text-xl font-bold mb-3", texto: "Cada jugador con sus rivales" }),
      el("label", { for: "tp-jugador", class: "flex flex-col text-sm max-w-md" }, el("span", { class: "font-semibold", texto: "Jugador" }), sel));
    const j = t.jugadores.find((x) => x.id === jid);
    if (!j) return caja;
    const { filas } = clasificacion(t);
    const suFila = filas.find((f) => f.id === jid);
    caja.append(el("div", { id: "tp-ficha", class: "mt-4" },
      el("p", { class: "text-lg font-bold", texto: j.nombre + (j.titulo ? " (" + j.titulo + ")" : "") }),
      el("p", { class: C.nota, texto: [j.institucion, Number(j.elo) > 0 ? "Elo " + j.elo : "Sin Elo", j.categoria ? "Categoría " + j.categoria : ""].filter(Boolean).join(" · ") }),
      suFila ? el("p", { class: "mt-1 font-semibold", texto: "Puesto " + suFila.puesto + " · " + puntosTexto(suFila.puntos) + " puntos" }) : null));
    const tbody = el("tbody");
    t.rondas.forEach((R, r) => {
      const s = T.situacion(t, r, jid);
      const rival = s.rival ? t.jugadores.find((x) => x.id === s.rival) : null;
      const color = s.color === "w" ? "Blancas" : s.color === "b" ? "Negras" : "—";
      const res = s.tipo === "pendiente" ? "jugando" : s.tipo === "bye" ? "Libre (" + puntosTexto(s.puntos) + ")"
        : s.tipo === "ausente" ? "No jugó (" + puntosTexto(s.puntos) + ")" : puntosTexto(s.puntos) + (s.tipo === "incomparecencia" ? " (sin jugar)" : "");
      tbody.append(el("tr", { "data-ronda": String(r + 1) },
        el("td", { class: "num", texto: r + 1 }),
        el("td", {}, rival ? el("a", { href: "#" + new URLSearchParams({ t: leerRuta().t, v: "jugadores", j: rival.id }).toString(), class: C.enlace, texto: rival.nombre }) : "—"),
        el("td", { class: "num", texto: rival && Number(rival.elo) > 0 ? rival.elo : "" }),
        el("td", { texto: color }),
        el("td", { class: "num", texto: res })));
    });
    caja.append(el("div", { class: "overflow-x-auto mt-3" }, el("table", { id: "tp-tabla-jugador", class: "pi-tabla" },
      el("thead", {}, el("tr", {}, el("th", { class: "num", scope: "col", texto: "Ronda" }), el("th", { scope: "col", texto: "Rival" }),
        el("th", { class: "num", scope: "col", texto: "Elo" }), el("th", { scope: "col", texto: "Color" }), el("th", { class: "num", scope: "col", texto: "Puntos" }))),
      tbody)));
    const otros = el("div", { id: "tp-otros", class: "mt-6" });
    caja.append(otros);
    if (!E.esDeEquipos(t)) pintarOtrosTorneos(otros, j.nombre, fila.id);
    return caja;
  }

  // La ficha del jugador entre torneos: los otros torneos publicados donde
  // aparece el mismo nombre, escrito igual (la búsqueda es exacta: «PÉREZ» y
  // «PEREZ» son dos nombres para la base).
  async function pintarOtrosTorneos(caja, nombre, idActual) {
    caja.append(el("h3", { class: "font-semibold mb-1", texto: "Otros torneos de " + nombre }),
      el("p", { id: "tp-otros-estado", class: C.nota, role: "status", texto: "Buscando…" }));
    let data;
    try {
      const r = await window.sb.from("pareo_publicados").select(COLUMNAS + ",datos")
        .contains("datos", { jugadores: [{ nombre }] }).neq("id", idActual).order("actualizado", { ascending: false }).range(0, 49);
      if (r.error) throw r.error;
      data = r.data || [];
    } catch (e) {
      $("tp-otros-estado").textContent = "No se pudieron buscar sus otros torneos.";
      return;
    }
    if (!caja.isConnected) return;
    if (!data.length) { $("tp-otros-estado").textContent = "No aparece en otros torneos publicados."; return; }
    $("tp-otros-estado").textContent = data.length === 1 ? "Aparece en 1 torneo más." : "Aparece en " + data.length + " torneos más.";
    caja.append(el("ul", { id: "tp-otros-lista", class: "mt-2 space-y-2" }, data.map((x) => {
      const t = x.datos;
      const j = t.jugadores.find((y) => y.nombre === nombre);
      const { filas } = clasificacion(t);
      const f = j && filas.find((y) => y.id === j.id);
      return el("li", {},
        el("a", { href: "#" + new URLSearchParams({ t: x.id, v: "jugadores", j: j ? j.id : "" }).toString(), class: C.enlace + " font-semibold", texto: x.nombre }),
        el("span", { class: C.nota, texto: " · " + [x.evento, fechaTexto(x.fecha), f ? "puesto " + f.puesto + " con " + puntosTexto(f.puntos) + " puntos" : ""].filter(Boolean).join(" · ") }));
    })));
  }

  async function pintarTorneo(ruta, silencioso) {
    const caja = $("tp-contenido");
    $("tp-portada").hidden = true;
    caja.hidden = false;
    // Dentro del mismo torneo (otra ronda, otro jugador) no se vuelve a pedir:
    // se pinta lo que ya está, y el foco se queda donde estaba.
    const mismo = !silencioso && abierto && abierto.fila.id === ruta.t;
    if (mismo) { mostrarTorneo(abierto.fila, ruta, document.activeElement ? document.activeElement.id : ""); return; }
    if (!silencioso) caja.replaceChildren(el("p", { class: C.nota, role: "status", texto: "Cargando el torneo…" }));
    let fila;
    try { fila = await pedirTorneo(ruta.t); } catch (e) {
      if (!silencioso) caja.replaceChildren(el("p", { class: C.nota, role: "alert", texto: "No se pudo leer el torneo. Revisa la conexión e intenta de nuevo." }));
      return;
    }
    if (!fila) {
      caja.replaceChildren(el("p", { class: "font-semibold", role: "alert", texto: "Este torneo ya no está publicado." }), el("a", { href: "#", class: C.enlace, texto: "Ver todos los torneos" }));
      return;
    }
    if (silencioso && abierto && abierto.fila.actualizado === fila.actualizado) {
      const a = $("tp-actualizado"); if (a) a.textContent = "Actualizado: " + (window.HoraCR ? HoraCR.fechaHora(fila.actualizado) : fila.actualizado) + " · se vuelve a leer cada minuto";
      return;
    }
    abierto = { fila, t: fila.datos };
    mostrarTorneo(fila, ruta, silencioso && document.activeElement ? document.activeElement.id || "-" : "", silencioso);
  }

  // foco: el id del control que tenía el foco ("" lo manda al título).
  function mostrarTorneo(fila, ruta, foco, silencioso) {
    const caja = $("tp-contenido");
    const t = fila.datos;
    document.title = fila.nombre + " — Torneos en Pareo Integral | Ajedrez Integral";
    let jid = ruta.j;
    if (!jid && ruta.n) { const j = t.jugadores.find((x) => x.nombre === ruta.n); if (j) jid = j.id; }
    const vista = ruta.v || (jid ? "jugadores" : "clasificacion");
    // Lo que se está mirando no se pierde al volver a pintar (el buscador, el foco).
    const buscado = silencioso && $("tp-buscar-mesa") ? $("tp-buscar-mesa").value : "";
    caja.replaceChildren(cabecera(fila, t), pestanas(vista),
      vista === "rondas" ? vistaRondas(t, ruta.r) : vista === "jugadores" ? vistaJugadores(t, jid, fila) : vistaClasificacion(t));
    if (buscado && $("tp-buscar-mesa")) { $("tp-buscar-mesa").value = buscado; $("tp-buscar-mesa").dispatchEvent(new Event("input")); }
    if (foco && $(foco)) $(foco).focus();
    else if (!foco) $("tp-titulo").focus();
  }

  async function pintar() {
    if (refresco) { clearInterval(refresco); refresco = null; }
    const ruta = leerRuta();
    if (!ruta.t) {
      abierto = null;
      document.title = "Torneos en Pareo Integral | Ajedrez Integral";
      if (!lista) {
        $("tp-cuantos").textContent = "Cargando…";
        try { lista = await pedirLista(); } catch (e) { $("tp-cuantos").textContent = "No se pudo leer la lista. Revisa la conexión e intenta de nuevo."; return; }
      }
      pintarLista();
      return;
    }
    await pintarTorneo(ruta, false);
    refresco = setInterval(() => {
      if (document.visibilityState === "visible" && leerRuta().t === ruta.t) pintarTorneo(leerRuta(), true);
    }, REFRESCO_MS);
  }

  $("tp-buscar").addEventListener("input", pintarLista);
  window.addEventListener("hashchange", pintar);
  pintar();
})();
