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
   - Un torneo que todavía no empieza sale como anuncio («Próximos torneos»),
     con su formulario de inscripción si quien organiza la abrió: lo que se
     manda va a la Edge Function y lo ve solo quien organiza.
   - «Estadísticas»: blancas, negras y tablas, las sorpresas y los mejores
     rendimientos; y las partidas que el árbitro subió en PGN, en un tablero.
   - «Seguir a un jugador»: sin cuenta, los nombres que se siguen quedan en
     este navegador (localStorage) y nunca viajan; la página los pone arriba
     en cada torneo donde juegan (su puesto y su mesa de la ronda) y en la
     portada, con sus últimos torneos publicados.

   Ver «Torneos en Pareo Integral: el espacio público» y «Torneos en Pareo
   Integral: inscripción, anuncios, partidas y estadísticas» en
   docs/decisiones/juegos-y-torneos.md. */
(function () {
  "use strict";
  const T = window.PareoTorneo;
  const E = window.PareoEquipos;
  const V = window.PareoEvento;
  const $ = (id) => document.getElementById(id);
  const COLUMNAS = "id,nombre,evento,lugar,fecha,rondas,rondas_total,jugadores,actualizado,organizador_id";
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
  // El día de hoy en Costa Rica (AAAA-MM-DD): para separar los próximos.
  const hoy = () => (window.HoraCR ? HoraCR.hoy() : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date()));
  const clave = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

  // ---------- Los jugadores que sigo ----------
  // El nombre tal como lo escribió el árbitro: es el mismo criterio con que
  // la ficha busca los otros torneos del jugador (la búsqueda es exacta).
  const CLAVE_SEGUIDOS = "torneos-pareo.seguidos";
  const MAX_SEGUIDOS = 30;
  function seguidos() {
    try {
      const x = JSON.parse(localStorage.getItem(CLAVE_SEGUIDOS) || "[]");
      return Array.isArray(x) ? x.filter((n) => typeof n === "string" && n).slice(0, MAX_SEGUIDOS) : [];
    } catch (e) { return []; }
  }
  const sigo = (nombre) => seguidosAhora().includes(nombre);
  // Devuelve si quedó seguido (false también si ya no cabe otro).
  function alternarSeguir(nombre) {
    const l = seguidosAhora();
    const ya = l.includes(nombre);
    if (!ya && l.length >= MAX_SEGUIDOS) return false;
    const nueva = ya ? l.filter((n) => n !== nombre) : l.concat(nombre);
    try { localStorage.setItem(CLAVE_SEGUIDOS, JSON.stringify(nueva)); } catch (e) { /* sin almacenamiento: dura lo que la pestaña */ }
    memoriaSeguidos = nueva;
    return !ya;
  }
  // Sin almacenamiento (ventana privada que lo bloquea), la lista vive en la pestaña.
  let memoriaSeguidos = null;
  const seguidosAhora = () => { const l = seguidos(); return l.length || !memoriaSeguidos ? l : memoriaSeguidos; };
  const marcaSeguido = () => [el("span", { "aria-hidden": "true", class: "tp-estrella", texto: "★ " }), el("span", { class: "sr-only", texto: "(lo sigues) " })];

  // ---------- La ruta: #t=<id>&j=<id>&r=<n>&v=<vista> ----------
  function leerRuta() {
    const p = new URLSearchParams(location.hash.replace(/^#/, ""));
    return { t: p.get("t") || "", j: p.get("j") || "", r: p.get("r") || "", v: p.get("v") || "", n: p.get("n") || "", o: p.get("o") || "" };
  }
  function irA(cambios) {
    const r = Object.assign(leerRuta(), cambios);
    const p = new URLSearchParams();
    for (const k of ["t", "v", "r", "j", "n", "o"]) if (r[k]) p.set(k, r[k]);
    const h = "#" + p.toString();
    if (location.hash !== h) location.hash = h; else pintar();
  }

  // ---------- Los organizadores ----------
  // El nombre y el sello de cada organización (pareo_organizadores, de
  // lectura pública). Para la lista, sin el logo: pesa. Se piden de cien en
  // cien y se guardan por id. Ver «Torneos en Pareo Integral: el organizador
  // y la moderación» en docs/decisiones/juegos-y-torneos.md.
  const organizadores = new Map();
  async function cargarOrganizadores(ids) {
    const faltan = [...new Set(ids.filter((id) => id && !organizadores.has(id)))];
    for (let i = 0; i < faltan.length; i += 100) {
      const { data, error } = await window.sb.from("pareo_organizadores").select("id,nombre,verificado").in("id", faltan.slice(i, i + 100));
      if (error) return;
      for (const o of data || []) organizadores.set(o.id, o);
    }
  }
  const orgDe = (x) => (x && x.organizador_id && organizadores.get(x.organizador_id)) || null;
  // Con el logo: para la ficha de un torneo y la página del organizador.
  const conLogo = new Map();
  async function organizadorCompleto(id) {
    if (!id) return null;
    if (!conLogo.has(id)) {
      const { data, error } = await window.sb.from("pareo_organizadores").select("id,nombre,verificado,logo").eq("id", id).maybeSingle();
      if (error) return null;
      conLogo.set(id, data || null);
      if (data) organizadores.set(id, { id: data.id, nombre: data.nombre, verificado: data.verificado });
    }
    return conLogo.get(id);
  }
  // Solo una imagen chica en base64 llega a un <img>: lo mismo que exige la tabla.
  const logoValido = (x) => typeof x === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(x);
  function bloqueOrganizador(o, enlace) {
    return el("div", { id: "tp-organizador", class: "flex items-center gap-3 mt-3" },
      logoValido(o.logo) ? el("img", { src: o.logo, alt: "Logo de " + o.nombre, class: "tp-org-logo" }) : null,
      el("p", { class: "text-sm" }, el("span", { class: "font-semibold", texto: "Organiza: " }), nombreOrg(o, enlace)));
  }
  // El sello, escrito (el color no va solo).
  const sello = () => el("span", { class: "tp-verificado", title: "Organizador verificado por Ajedrez Integral" },
    el("span", { "aria-hidden": "true", texto: "✓ " }), "Verificado");
  const nombreOrg = (o, enlace) => el(enlace ? "a" : "span", Object.assign({ class: "tp-org" }, enlace ? { href: "#o=" + encodeURIComponent(o.id) } : {}),
    el("span", { class: "sr-only", texto: "Organiza: " }), o.nombre, o.verificado ? sello() : null);

  // ---------- La lista ----------
  // Además de las columnas, unos pocos campos del torneo, leídos dentro de
  // `datos` por la base (PostgREST): bajarse cada torneo entero para la lista
  // sería pesado.
  const COLUMNAS_LISTA = COLUMNAS + ",ritmo:datos->>ritmo,fin:datos->>fechaFin,fed:datos->>federacion,sistema:datos->>sistema,tipo:datos->>tipo,inscripcion:datos->inscripcion,elo:datos->>validoElo";
  let lista = null;
  async function pedirLista() {
    // PostgREST corta a mil filas sin avisar: se piden de mil en mil.
    const filas = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await window.sb.from("pareo_publicados").select(COLUMNAS_LISTA)
        .order("actualizado", { ascending: false }).range(desde, desde + 999);
      if (error) throw error;
      filas.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return filas;
  }
  // Próximo: todavía sin jugadores (un anuncio) o con fecha más adelante.
  const esProximo = (x) => !x.jugadores || (x.fecha && x.fecha > hoy());
  // En curso: ya empezó, le faltan rondas y no pasó de su último día.
  const enCurso = (x) => !esProximo(x) && x.rondas_total > 0 && x.rondas < x.rondas_total && (x.fin || x.fecha || "") >= HoraCR.sumarDias(hoy(), -1);
  const inscribe = (x) => !!(x.inscripcion && x.inscripcion.abierta && (!x.inscripcion.hasta || x.inscripcion.hasta >= hoy()));
  const RITMO = { clasico: "Clásico", rapido: "Rápido", blitz: "Relámpago" };
  const ritmoDe = (x) => RITMO[window.RitmoControl ? RitmoControl.deducir(x.ritmo || "", x.nombre) : ""] || "";
  const SISTEMA = { suizo: "Suizo", todos: "Todos contra todos" };
  const MODALIDAD = { equipos: "Por equipos", individual: "Individual" };
  const ELO = { fide: "FIDE", nacional: "Nacional", no: "No" };
  const lugarDe = (x) => [x.lugar, x.fed].filter(Boolean).join(", ");
  function estadoDe(x) {
    if (esProximo(x)) return { texto: "Próximo", clase: "tp-estado-proximo" };
    if (enCurso(x)) return { texto: "En curso", clase: "tp-estado-curso" };
    return { texto: "Terminado", clase: "tp-estado-fin" };
  }

  // La fecha de la fila: «23–25 / OCT», o «23 OCT / 11 DIC» si cambia de mes.
  function bloqueFecha(desde, hasta) {
    if (!desde) return el("span", { class: "tp-fecha", "aria-hidden": "true" }, el("span", { class: "tp-fecha-dia", texto: "—" }));
    const dia = (f) => HoraCR.fecha(f, { day: "numeric" });
    const mes = (f) => HoraCR.fecha(f, { month: "short" }).replace(".", "").toUpperCase();
    const fin = hasta && hasta > desde ? hasta : "";
    const leer = HoraCR.fecha(desde) + (fin ? " al " + HoraCR.fecha(fin) : "");
    const cuerpo = !fin || fin.slice(0, 7) === desde.slice(0, 7)
      ? [el("span", { class: "tp-fecha-dia", texto: dia(desde) + (fin ? "–" + dia(fin) : "") }), el("span", { class: "tp-fecha-mes", texto: mes(desde) })]
      : [el("span", { class: "tp-fecha-par", texto: dia(desde) + " " + mes(desde) }), el("span", { class: "tp-fecha-par", texto: dia(fin) + " " + mes(fin) })];
    return el("span", { class: "tp-fecha" }, el("span", { class: "sr-only", texto: leer + ". " }), el("span", { "aria-hidden": "true", class: "contents" }, cuerpo));
  }
  // Un dato con su etiqueta escrita arriba (el color nunca va solo).
  const dato = (etiqueta, valor, extra) => el("span", Object.assign({ class: "tp-dato" }, extra || {}),
    el("span", { class: "tp-dato-etiqueta", texto: etiqueta }), el("span", { class: "tp-dato-valor" }, valor || "—"));
  function datosDe(x) {
    const rondas = !x.rondas_total ? (x.rondas ? String(x.rondas) : "—") : esProximo(x) ? String(x.rondas_total) : x.rondas + "/" + x.rondas_total;
    const abierta = inscribe(x);
    return [
      dato("Inscripción", [el("span", { class: "tp-punto " + (abierta ? "tp-punto-si" : "tp-punto-no"), "aria-hidden": "true" }), abierta ? "Abierta" : "Cerrada"], { "data-col": "inscripcion" }),
      dato("Participantes", String(x.jugadores || 0), { "data-col": "participantes" }),
      dato("Rondas", rondas, { "data-col": "rondas" }),
      dato("Elo", ELO[x.elo] || "", { "data-col": "elo", title: { fide: "Válido para Elo FIDE y Nacional", nacional: "Válido solo para Elo Nacional", no: "No varía el Elo" }[x.elo] || null }),
      dato("Sistema", SISTEMA[x.sistema] || "", { "data-col": "sistema" }),
      dato("Ritmo", ritmoDe(x), { "data-col": "ritmo", title: x.ritmo || null }),
      dato("Modalidad", MODALIDAD[x.tipo] || MODALIDAD.individual, { "data-col": "modalidad" }),
    ];
  }
  function filaTorneo(x, hijo) {
    const est = estadoDe(x);
    const sigue = !hijo && x.evento ? el("span", { class: "tp-fila-evento", texto: x.evento }) : null;
    return el("li", { class: "tp-item" },
      el("a", { href: "#t=" + encodeURIComponent(x.id), class: "tp-fila" + (hijo ? " tp-fila-hijo" : ""), "data-torneo": x.id },
        hijo ? el("span", { class: "tp-fecha", "aria-hidden": "true" }) : bloqueFecha(x.fecha, x.fin),
        el("span", { class: "tp-principal" },
          el("span", { class: "tp-nombre", texto: x.nombre }), sigue,
          el("span", { class: "tp-lugar" }, hijo ? null : lugarDe(x), el("span", { class: "tp-estado " + est.clase, texto: est.texto }), orgDe(x) ? nombreOrg(orgDe(x)) : null)),
        el("span", { class: "tp-datos" }, datosDe(x)),
        el("span", { class: "tp-flecha", "aria-hidden": "true", texto: "›" })));
  }
  // Un evento con varios torneos: una fila que se despliega.
  const desplegados = new Set();
  function filaEvento(clave, torneos, abrir) {
    const x = torneos[0];
    const id = "tp-ev-" + clave.replace(/[^a-z0-9]+/gi, "-").slice(0, 60);
    const abierto = abrir || desplegados.has(clave);
    const fin = torneos.map((t) => t.fin || t.fecha || "").sort().pop();
    const total = torneos.reduce((s, t) => s + (t.jugadores || 0), 0);
    const ritmos = [...new Set(torneos.map(ritmoDe).filter(Boolean))];
    const hijos = el("ul", { id, class: "tp-hijos", hidden: !abierto }, torneos.map((t) => filaTorneo(t, true)));
    const est = torneos.some(enCurso) ? estadoDe(torneos.find(enCurso)) : estadoDe(x);
    const boton = el("button", { type: "button", class: "tp-fila tp-fila-evento-boton", "aria-expanded": abierto ? "true" : "false", "aria-controls": id, "data-evento": clave },
      bloqueFecha(x.fecha, fin),
      el("span", { class: "tp-principal" },
        el("span", { class: "tp-nombre", texto: x.evento }),
        el("span", { class: "tp-lugar" }, lugarDe(x), el("span", { class: "tp-estado " + est.clase, texto: est.texto }), orgDe(x) ? nombreOrg(orgDe(x)) : null)),
      el("span", { class: "tp-datos" },
        dato("Torneos", String(torneos.length)),
        dato("Participantes", String(total), { "data-col": "participantes" }),
        dato("Ritmo", ritmos.join(" · "), { "data-col": "ritmo" })),
      el("span", { class: "tp-flecha tp-flecha-abre", "aria-hidden": "true", texto: "›" }));
    boton.addEventListener("click", () => {
      const ya = boton.getAttribute("aria-expanded") === "true";
      boton.setAttribute("aria-expanded", ya ? "false" : "true");
      hijos.hidden = ya;
      if (ya) desplegados.delete(clave); else desplegados.add(clave);
    });
    return el("li", { class: "tp-item tp-grupo", "data-grupo": clave }, boton, hijos);
  }
  // Los torneos de un día, con los de un mismo evento juntos.
  function filasDelDia(torneos, abrir) {
    const porEvento = new Map();
    for (const x of torneos) {
      const k = x.evento ? x.evento + "|" + (x.fecha || "") : "\u0000" + x.id;
      if (!porEvento.has(k)) porEvento.set(k, []);
      porEvento.get(k).push(x);
    }
    return [...porEvento].map(([k, l]) => (l.length > 1 ? filaEvento(k, l.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), abrir) : filaTorneo(l[0], false)));
  }
  // Por día, con su encabezado («Jueves, 22 de octubre de 2026»). Dentro del
  // día, primero lo que se está jugando y después por nombre.
  function porDia(torneos, ascendente, abrir) {
    const dias = new Map();
    for (const x of torneos) {
      const d = x.fecha || "";
      if (!dias.has(d)) dias.set(d, []);
      dias.get(d).push(x);
    }
    const orden = [...dias.keys()].sort((a, b) => (!a ? 1 : !b ? -1 : ascendente ? a.localeCompare(b) : b.localeCompare(a)));
    return orden.map((d) => {
      const l = dias.get(d).sort((a, b) => (enCurso(b) - enCurso(a)) || String(a.evento || a.nombre).localeCompare(String(b.evento || b.nombre), "es"));
      const titulo = d ? HoraCR.fecha(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Sin fecha";
      return el("section", { class: "tp-dia", "data-dia": d },
        el("h3", { class: "tp-dia-titulo", texto: titulo.charAt(0).toUpperCase() + titulo.slice(1) }),
        el("ul", { class: "tp-filas" }, filasDelDia(l, abrir)));
    });
  }
  // ---------- Los filtros ----------
  // Lo que pide cada uno, leído de los controles. «ritmo» compara con lo que
  // se muestra (Clásico, Rápido, Relámpago); «lugar», el lugar escrito igual.
  function filtros() {
    const v = (id) => ($(id) ? $(id).value : "");
    const c = (id) => !!($(id) && $(id).checked);
    return { ritmo: v("tp-f-ritmo"), lugar: v("tp-f-lugar"), elo: v("tp-f-elo"), abierta: c("tp-f-abierta"), curso: c("tp-f-curso"), verificado: c("tp-f-verificado") };
  }
  const hayFiltro = (f) => !!(f.ritmo || f.lugar || f.elo || f.abierta || f.curso || f.verificado);
  function pasa(x, f) {
    if (f.ritmo && ritmoDe(x) !== f.ritmo) return false;
    if (f.lugar && (x.lugar || "") !== f.lugar) return false;
    if (f.elo === "sin" ? x.elo === "fide" || x.elo === "nacional" : f.elo && x.elo !== f.elo) return false;
    if (f.abierta && !inscribe(x)) return false;
    if (f.curso && !enCurso(x)) return false;
    if (f.verificado && !(orgDe(x) && orgDe(x).verificado)) return false;
    return true;
  }
  // Los lugares que hay, para elegir uno (se vuelven a armar con la lista).
  function pintarLugares() {
    const sel = $("tp-f-lugar");
    if (!sel) return;
    const elegido = sel.value;
    const lugares = [...new Set((lista || []).map((x) => x.lugar || "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    sel.replaceChildren(el("option", { value: "", texto: "Todos" }), ...lugares.map((l) => el("option", { value: l, texto: l })));
    sel.value = lugares.includes(elegido) ? elegido : "";
  }

  function pintarLista() {
    const caja = $("tp-contenido");
    const q = clave($("tp-buscar") ? $("tp-buscar").value : "");
    const f = filtros();
    const cuales = (lista || []).filter((x) => (!q || clave([x.nombre, x.evento, x.lugar].join(" ")).includes(q)) && pasa(x, f));
    // Los próximos, primero el día más cercano; los demás, el más reciente
    // primero. Buscando o filtrando, los eventos se abren para que se vea qué
    // coincidió.
    const abrir = !!q || hayFiltro(f);
    $("tp-lista").replaceChildren(...porDia(cuales.filter((x) => !esProximo(x)), false, abrir));
    const proximos = cuales.filter(esProximo);
    $("tp-proximos").replaceChildren(...porDia(proximos, true, abrir));
    if ($("tp-f-quitar")) $("tp-f-quitar").hidden = !hayFiltro(f);
    if ($("tp-resultados-vacio")) $("tp-resultados-vacio").hidden = !(lista && lista.length && (q || hayFiltro(f)) && !cuales.some((x) => !esProximo(x)));
    $("tp-proximos-caja").hidden = !proximos.length;
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

  // ---------- Compartir y el calendario ----------
  // El enlace para compartir pasa por el worker (/t/<id>): WhatsApp y las
  // redes no leen lo que va después del «#», así que la vista previa de
  // torneos-pareo.html#t=… sería la de la portada. El worker contesta con el
  // nombre, la fecha y cómo va el torneo, y manda acá. Ver «La tarjeta al
  // compartir un torneo» en docs/decisiones/juegos-y-torneos.md.
  const SITIO = "https://ajedrez-integral.com";
  const enlaceCompartir = (id) => SITIO + "/t/" + encodeURIComponent(id);
  const ELO_LARGO = { fide: "Válido para Elo FIDE", nacional: "Válido para Elo Nacional", no: "No varía el Elo" };
  function textoCompartir(fila, t) {
    const fechas = [fechaTexto(t.fechaInicio), fechaTexto(t.fechaFin)].filter(Boolean).join(" al ");
    const como = !t.rondas.length ? (t.jugadores.length ? t.jugadores.length + " inscritos" : "")
      : "Ronda " + rondasCompletas(t) + (t.rondasTotales ? " de " + t.rondasTotales : "") + " · " + t.jugadores.length + " participantes";
    return ["♟️ *" + fila.nombre + "*", [fechas, t.ciudad].filter(Boolean).join(" · "), como, enlaceCompartir(fila.id)].filter(Boolean).join("\n");
  }
  // El torneo entero en el calendario (días completos; la hora va escrita).
  function agregarAlCalendario(fila, t) {
    const an = t.anuncio || {};
    const descripcion = [an.hora ? "Empieza a las " + an.hora + "." : "", t.ritmo ? "Ritmo: " + t.ritmo + "." : "",
      ELO_LARGO[t.validoElo] ? ELO_LARGO[t.validoElo] + "." : "", an.contacto ? "Contacto: " + an.contacto + "." : "",
      "Rondas y resultados: " + enlaceCompartir(fila.id)].filter(Boolean).join(" ");
    const { texto } = CalendarioIcs.armarDias({ nombre: fila.nombre, eventos: [{
      uid: "torneo-" + fila.id + "@ajedrez-integral.com", desde: t.fechaInicio || fila.fecha, hasta: t.fechaFin,
      resumen: fila.nombre, lugar: t.ciudad, descripcion, url: enlaceCompartir(fila.id), aviso: "-PT15H",
    }] });
    CalendarioIcs.bajar(texto, (clave(fila.nombre).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "torneo") + ".ics");
  }
  const terminado = (t) => t.rondasTotales > 0 && rondasCompletas(t) >= t.rondasTotales;
  function acciones(fila, t) {
    const boton = C.pestana + " bg-white dark:bg-brand-900 inline-flex items-center gap-2";
    const estado = el("span", { id: "tp-compartir-estado", class: "sr-only", role: "status" });
    const copiar = el("button", { type: "button", id: "tp-copiar", class: boton }, el("span", { "aria-hidden": "true", texto: "🔗" }), "Copiar el enlace");
    copiar.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(enlaceCompartir(fila.id)); estado.textContent = "Enlace copiado."; Avisos.avisar("Enlace copiado."); }
      catch (e) { Avisos.avisar("No se pudo copiar. El enlace es " + enlaceCompartir(fila.id), { tipo: "error" }); }
    });
    const hijos = [
      el("a", { id: "tp-whatsapp", href: window.PareoCompartir.enlaceWhatsapp(textoCompartir(fila, t)), target: "_blank", rel: "noopener", class: boton },
        el("span", { "aria-hidden": "true", texto: "💬" }), "Compartir por WhatsApp", el("span", { class: "sr-only", texto: " (se abre en otra pestaña)" })),
      copiar,
    ];
    if ((t.fechaInicio || fila.fecha) && !terminado(t)) {
      const cal = el("button", { type: "button", id: "tp-calendario", class: boton }, el("span", { "aria-hidden": "true", texto: "📅" }), "Agregar a mi calendario");
      cal.addEventListener("click", () => agregarAlCalendario(fila, t));
      hijos.push(cal);
    }
    const reportarB = el("button", { type: "button", id: "tp-reportar", class: boton }, el("span", { "aria-hidden": "true", texto: "⚑" }), "Reportar este torneo");
    reportarB.addEventListener("click", () => reportar(fila, reportarB));
    hijos.push(reportarB);
    return el("div", { class: "flex flex-wrap gap-2 mt-3" }, hijos, estado);
  }

  // «Reportar este torneo»: sin cuenta, lo lee solo Ajedrez Integral, que lo
  // revisa y, si hace falta, lo oculta de la lista (nunca se borra solo).
  async function reportar(fila, boton) {
    const res = await Avisos.formulario({ titulo: "Reportar este torneo", texto: "Cuéntanos qué está mal. Lo lee Ajedrez Integral, que lo revisa y, si hace falta, lo oculta de la lista. No se guarda quién lo mandó.",
      aceptar: "Mandar el reporte", cancelar: "Cancelar", campos: [
        { nombre: "motivo", etiqueta: "Qué pasa", tipo: "select", valor: "", opciones: [["", "Elige una opción"], ["inapropiado", "Tiene contenido inapropiado"], ["datos_personales", "Muestra datos personales que no debería"], ["falso", "Es falso o de prueba"], ["error", "Tiene un error (nombres, resultados…)"], ["otro", "Otra cosa"]] },
        { nombre: "detalle", etiqueta: "Detalle (si quieres)", tipo: "textarea", valor: "", max: 500 }] });
    if (!res) return;
    if (!res.motivo) { Avisos.avisar("Elige qué pasa con el torneo para mandar el reporte.", { tipo: "error" }); return; }
    boton.disabled = true;
    const r = await window.PareoPublicar.reportar(fila.id, res.motivo, String(res.detalle || "").trim());
    boton.disabled = false;
    if (!r.ok) { Avisos.avisar(r.error || "No se pudo mandar. Revisa la conexión e intenta de nuevo.", { tipo: "error" }); return; }
    Avisos.avisar("Gracias: el reporte llegó a Ajedrez Integral.");
    boton.focus();
  }

  function cabecera(fila, t) {
    const partes = [t.evento && t.evento.nombre, t.ciudad, [fechaTexto(t.fechaInicio), fechaTexto(t.fechaFin)].filter(Boolean).join(" al ")].filter(Boolean);
    const datos = [t.sistema === "todos" ? "Todos contra todos" : "Suizo de " + (t.rondasTotales || "?") + " rondas", t.ritmo, ELO_LARGO[t.validoElo] || "", t.arbitro ? "Árbitro: " + t.arbitro : ""].filter(Boolean);
    return el("div", { class: "mb-6" },
      el("a", { href: "#", class: C.enlace + " text-sm", texto: "← Todos los torneos" }),
      el("h1", { id: "tp-titulo", class: "font-serif text-3xl md:text-4xl font-bold text-brand-800 dark:text-white mt-3", tabindex: "-1", texto: fila.nombre }),
      partes.length ? el("p", { class: "text-brand-600 dark:text-brand-300 mt-1", texto: partes.join(" · ") }) : null,
      el("p", { class: C.nota + " mt-1", texto: datos.join(" · ") }),
      el("p", { id: "tp-actualizado", class: "text-xs text-brand-600 dark:text-brand-300 mt-2", role: "status", texto: "Actualizado: " + (window.HoraCR ? HoraCR.fechaHora(fila.actualizado) : fila.actualizado) + " · se vuelve a leer cada minuto" }),
      fila.organizador_id && conLogo.get(fila.organizador_id) ? bloqueOrganizador(conLogo.get(fila.organizador_id), true) : null,
      acciones(fila, t));
  }

  function pestanas(actual) {
    const p = (v, texto) => el("a", { href: "#" + new URLSearchParams({ t: leerRuta().t, v }).toString(), class: C.pestana + (actual === v ? " bg-accent-500 text-brand-900" : " bg-white dark:bg-brand-900"), "aria-current": actual === v ? "page" : null, texto });
    return el("nav", { class: "flex flex-wrap gap-2 mb-5", "aria-label": "Partes del torneo" },
      p("clasificacion", "Clasificación"), p("rondas", "Rondas"), p("jugadores", "Jugadores"), p("estadisticas", "Estadísticas"));
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
        const suyo = !E.esDeEquipos(t) && sigo(j.nombre);
        return el("tr", { "data-id": f.id, class: suyo ? "tp-seguido" : null, "data-seguido": suyo ? "1" : null },
          el("td", { class: "num", texto: f.puesto }),
          el("td", {}, suyo ? marcaSeguido() : null, el("a", { href: "#" + new URLSearchParams({ t: leerRuta().t, v: "jugadores", j: f.id }).toString(), class: C.enlace + " font-semibold", texto: j.nombre + (j.titulo ? " (" + j.titulo + ")" : "") })),
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
      const suya = !deEquipos && (sigo(nombreDe(t, m.b)) || (m.n != null && sigo(nombreDe(t, m.n))));
      const fila = el("tr", { "data-mesa": String(V.mesaFisica(t, k)), "data-nombres": clave(nombreDe(t, m.b) + " " + (m.n ? nombreDe(t, m.n) : "")),
        class: suya ? "tp-seguido" : null, "data-seguido": suya ? "1" : null },
        el("td", { class: "num", texto: V.mesaFisica(t, k) }),
        el("td", { class: "font-semibold" }, sigo(nombreDe(t, m.b)) && !deEquipos ? marcaSeguido() : null, conPuntos(m.b)),
        el("td", { class: "num whitespace-nowrap", texto: m.n === null ? "Libre" : m.r ? RESULTADO[m.r] || m.r : "jugando" }),
        el("td", { class: "font-semibold" }, m.n !== null && !deEquipos && sigo(nombreDe(t, m.n)) ? marcaSeguido() : null, m.n === null ? "" : conPuntos(m.n)),
        el("td", {}, m.pgn && m.n ? el("button", { type: "button", class: C.pestana + " bg-white dark:bg-brand-900 text-xs px-2 py-1", "data-ver-pgn": String(k),
          "aria-label": "Ver la partida de la mesa " + V.mesaFisica(t, k), onclick: () => verPartida(t, i, k) }, "Ver partida") : null));
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
        el("th", { class: "num", scope: "col", texto: "Resultado" }), el("th", { scope: "col", texto: "Negras" }),
        el("th", { scope: "col" }, el("span", { class: "sr-only", texto: "Partida" })))), tbody);
    const nadie = el("p", { class: C.nota + " mt-2", role: "status", hidden: true, texto: "Nadie con ese nombre en esta ronda." });
    // «Solo los que sigo»: aparece si alguno de los que sigues juega esta ronda.
    const soloMios = el("input", { type: "checkbox", id: "tp-solo-mios" });
    const filtrar = () => {
      const q = clave(buscar.value);
      let hay = 0;
      for (const tr of tbody.children) { const si = (!q || tr.dataset.nombres.includes(q)) && (!soloMios.checked || tr.dataset.seguido === "1"); tr.hidden = !si; if (si) hay++; }
      nadie.hidden = !!hay;
    };
    buscar.addEventListener("input", filtrar);
    soloMios.addEventListener("change", filtrar);
    const hayMios = [...tbody.children].some((tr) => tr.dataset.seguido === "1");
    caja.append(hayMios ? el("div", { class: "flex items-center gap-2 text-sm mb-2" }, soloMios, el("label", { for: "tp-solo-mios", texto: "Solo las mesas de los jugadores que sigo" })) : null,
      el("div", { class: "overflow-x-auto" }, tabla), nadie, el("div", { id: "tp-partida", class: "mt-6", hidden: true }));
    return caja;
  }

  // La partida de una mesa (la subió el árbitro en PGN): se lee jugada por
  // jugada con chess.js (js/pareo/partida.js) y se recorre en el tablero de
  // js/visor-linea.js, con el teclado y el lector de pantalla.
  function verPartida(t, r, k) {
    const caja = $("tp-partida");
    const m = t.rondas[r].mesas[k];
    const lectura = window.Chess ? PareoPartida.leer(m.pgn, window.Chess) : { ok: false };
    const titulo = "Mesa " + V.mesaFisica(t, k) + ": " + nombreDe(t, m.b) + " – " + nombreDe(t, m.n) + (m.r ? " (" + (RESULTADO[m.r] || m.r) + ")" : "");
    caja.hidden = false;
    caja.replaceChildren(el("h3", { id: "tp-partida-titulo", class: "font-serif text-lg font-bold mb-2", tabindex: "-1", texto: titulo }));
    if (!lectura.ok || !lectura.jugadas.length) {
      caja.append(el("p", { class: C.nota, role: "alert", texto: "Esta partida no se pudo leer." }));
    } else {
      const tablero = el("div", { id: "tp-visor" });
      caja.append(tablero);
      const visor = VisorLinea.montar(tablero, { nombre: "Tablero de la partida" });
      visor.cargar(lectura.jugadas, { en: 0 });
    }
    $("tp-partida-titulo").focus();
  }

  // El botón de la ficha: dice a quién y si ya lo sigues (aria-pressed).
  function botonSeguir(nombre) {
    const si = sigo(nombre);
    const estado = el("span", { id: "tp-seguir-estado", class: "sr-only", role: "status" });
    const b = el("button", { type: "button", id: "tp-seguir", "aria-pressed": si ? "true" : "false",
      class: C.pestana + " mt-3 " + (si ? "bg-accent-500 text-brand-900" : "bg-white dark:bg-brand-900") },
      el("span", { "aria-hidden": "true", texto: si ? "★ " : "☆ " }), si ? "Sigues a " + nombre + " · dejar de seguir" : "Seguir a " + nombre);
    b.addEventListener("click", () => {
      const antes = sigo(nombre);
      const ahora = alternarSeguir(nombre);
      if (!antes && !ahora) { estado.textContent = "Ya sigues a " + MAX_SEGUIDOS + " jugadores: deja de seguir a alguno para agregar otro."; return; }
      mostrarTorneo(abierto.fila, leerRuta(), "tp-seguir");
      $("tp-seguir-estado").textContent = ahora ? "Ahora sigues a " + nombre + ": sale arriba en cada torneo donde juegue." : "Dejaste de seguir a " + nombre + ".";
    });
    return el("div", {}, b, estado,
      el("p", { class: "text-xs text-brand-600 dark:text-brand-300 mt-1", texto: "Se guarda solo en este navegador, sin cuenta." }));
  }

  // Cómo le va en este torneo a alguien que sigo: su puesto y su mesa de la
  // última ronda emparejada (o lo que hizo en ella).
  function resumenJugador(t, jid) {
    const { k, filas } = clasificacion(t);
    const f = filas.find((x) => x.id === jid);
    const partes = [];
    if (f) partes.push("Puesto " + f.puesto + " con " + puntosTexto(f.puntos) + (f.puntos === 1 ? " punto" : " puntos") + " tras la ronda " + k);
    const r = t.rondas.length - 1;
    if (r >= 0) {
      const s = T.situacion(t, r, jid);
      const mesa = t.rondas[r].mesas.findIndex((m) => m.b === jid || m.n === jid);
      const color = s.color === "w" ? "blancas" : "negras";
      if (s.tipo === "bye") partes.push("Ronda " + (r + 1) + ": libre");
      else if (s.tipo === "ausente") partes.push("Ronda " + (r + 1) + ": no juega");
      else partes.push("Ronda " + (r + 1) + ": mesa " + V.mesaFisica(t, mesa) + ", con " + color + " contra " + nombreDe(t, s.rival)
        + (s.tipo === "pendiente" ? " (jugando)" : " (" + puntosTexto(s.puntos) + ")"));
    }
    return partes.join(" · ");
  }
  function cajaSeguidos(t) {
    if (E.esDeEquipos(t)) return null;
    const mios = t.jugadores.filter((j) => sigo(j.nombre));
    if (!mios.length) return null;
    return el("section", { id: "tp-mis-jugadores", class: C.tarjeta + " mb-5 border-l-4 border-accent-500", "aria-labelledby": "tp-mis-titulo" },
      el("h2", { id: "tp-mis-titulo", class: "font-serif text-lg font-bold mb-2" }, el("span", { "aria-hidden": "true", texto: "★ " }), "Los jugadores que sigues"),
      el("ul", { class: "space-y-2 text-sm" }, mios.map((j) => el("li", { "data-seguido": j.id },
        el("a", { href: "#" + new URLSearchParams({ t: leerRuta().t, v: "jugadores", j: j.id }).toString(), class: C.enlace + " font-semibold", texto: j.nombre }),
        el("span", { texto: " · " + (resumenJugador(t, j.id) || "Inscrito") })))));
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
      suFila ? el("p", { class: "mt-1 font-semibold", texto: "Puesto " + suFila.puesto + " · " + puntosTexto(suFila.puntos) + " puntos" }) : null,
      E.esDeEquipos(t) ? null : botonSeguir(j.nombre)));
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

  // ---------- Estadísticas del torneo ----------
  // Con las partidas jugadas (no las ganadas por incomparecencia ni los
  // byes): cómo les fue a las blancas y a las negras, las sorpresas (gana
  // quien tenía menos Elo, con los dos con Elo) y los mejores rendimientos
  // (js/pareo/elo.js, la cuenta de FIDE). Los porcentajes van escritos, no
  // solo en la barra.
  function estadisticas(t) {
    const deEquipos = E.esDeEquipos(t);
    let blancas = 0, negras = 0, tablas = 0;
    const sorpresas = [];
    const elo = (id) => Number((t.jugadores.find((j) => j.id === id) || {}).elo) || 0;
    t.rondas.forEach((R, r) => {
      for (const m of R.mesas) {
        if (!m.n) continue;
        const partidas = deEquipos ? (m.partidas || []).map((p) => p && p.r) : [m.r];
        for (const res of partidas) {
          if (res === "1-0") blancas++; else if (res === "0-1") negras++; else if (res === "=") tablas++;
        }
        if (deEquipos || (m.r !== "1-0" && m.r !== "0-1")) continue;
        const [g, p] = m.r === "1-0" ? [m.b, m.n] : [m.n, m.b];
        const eg = elo(g), ep = elo(p);
        if (eg && ep && ep - eg >= 100) sorpresas.push({ r: r + 1, g, p, eg, ep, dif: ep - eg });
      }
    });
    sorpresas.sort((a, b) => b.dif - a.dif);
    const k = rondasCompletas(t);
    const rendimientos = !deEquipos && window.PareoElo && k ? [...PareoElo.calcular(t, k).entries()]
      .filter(([, x]) => x.rp != null && x.partidas >= Math.min(3, k)).map(([id, x]) => ({ id, rp: x.rp, partidas: x.partidas, elo: x.elo }))
      .sort((a, b) => b.rp - a.rp).slice(0, 5) : [];
    return { blancas, negras, tablas, total: blancas + negras + tablas, sorpresas: sorpresas.slice(0, 5), rendimientos, deEquipos };
  }
  function vistaEstadisticas(t) {
    const e = estadisticas(t);
    const caja = el("section", { class: C.tarjeta, "aria-labelledby": "tp-est-titulo" },
      el("h2", { id: "tp-est-titulo", class: "font-serif text-xl font-bold mb-3", texto: "Estadísticas del torneo" }));
    if (!e.total) { caja.append(el("p", { class: C.nota, texto: "Todavía no hay partidas jugadas." })); return caja; }
    const pct = (n) => Math.round((n / e.total) * 100);
    const barra = (texto, n, clase) => el("div", { class: "mb-2", "data-est": texto },
      el("div", { class: "flex justify-between text-sm" }, el("span", { class: "font-semibold", texto }), el("span", { texto: pct(n) + " % (" + n + ")" })),
      el("div", { class: "pi-est-barra", "aria-hidden": "true" }, relleno(clase, pct(n))));
    // El ancho va por el CSSOM, no en un atributo style (la CSP no lo deja).
    const relleno = (clase, p) => { const x = el("span", { class: "pi-est-relleno " + clase }); x.style.width = p + "%"; return x; };
    caja.append(el("p", { class: "text-sm mb-3", texto: e.total + (e.total === 1 ? " partida jugada" : " partidas jugadas") + (e.deEquipos ? " (tablero por tablero)" : "") + "." }),
      barra(e.deEquipos ? "Gana el equipo con blancas en el tablero" : "Ganan las blancas", e.blancas, "pi-est-blancas"),
      barra(e.deEquipos ? "Gana el equipo con negras en el tablero" : "Ganan las negras", e.negras, "pi-est-negras"),
      barra("Tablas", e.tablas, "pi-est-tablas"));
    if (!e.deEquipos) {
      caja.append(el("h3", { class: "font-semibold mt-5 mb-1", texto: "Las sorpresas" }),
        e.sorpresas.length
          ? el("ol", { id: "tp-sorpresas", class: "list-decimal pl-6 space-y-1 text-sm" }, e.sorpresas.map((x) => el("li", {},
            el("span", { class: "font-semibold", texto: nombreDe(t, x.g) + " (" + x.eg + ")" }), " le ganó a " + nombreDe(t, x.p) + " (" + x.ep + ") en la ronda " + x.r + ": " + x.dif + " puntos de Elo de diferencia.")))
          : el("p", { class: C.nota, texto: "Nadie le ganó a alguien con 100 puntos de Elo o más que él." }),
        el("h3", { class: "font-semibold mt-5 mb-1", texto: "Los mejores rendimientos" }),
        e.rendimientos.length
          ? el("ol", { id: "tp-rendimientos", class: "list-decimal pl-6 space-y-1 text-sm" }, e.rendimientos.map((x) => el("li", {},
            el("span", { class: "font-semibold", texto: nombreDe(t, x.id) }), ": rendimiento de " + x.rp + " en " + x.partidas + (x.partidas === 1 ? " partida" : " partidas") + " contra rivales con Elo (tiene " + x.elo + ").")))
          : el("p", { class: C.nota, texto: "Hace falta Elo en los jugadores y partidas entre ellos." }),
        el("p", { class: "text-xs text-brand-600 dark:text-brand-300 mt-3", texto: "El rendimiento se calcula como FIDE: el Elo medio de los rivales más lo que da el porcentaje de puntos, solo con las partidas jugadas contra rivales con Elo." }));
    }
    return caja;
  }

  // ---------- El anuncio y la inscripción ----------
  function tarjetaAnuncio(t) {
    const an = t.anuncio || {};
    const filas = [["Fecha", [fechaTexto(t.fechaInicio), fechaTexto(t.fechaFin)].filter(Boolean).join(" al ")], ["Hora", an.hora || ""], ["Lugar", t.ciudad],
      ["Ritmo", t.ritmo], ["Sistema", t.sistema === "todos" ? "Todos contra todos" : "Suizo de " + (t.rondasTotales || "?") + " rondas"], ["Contacto", an.contacto || ""],
      ["Inscritos", t.jugadores.length ? String(t.jugadores.length) : ""]].filter(([, v]) => v);
    return el("section", { id: "tp-anuncio", class: C.tarjeta + " mb-6", "aria-labelledby": "tp-anuncio-titulo" },
      el("h2", { id: "tp-anuncio-titulo", class: "font-serif text-xl font-bold mb-3", texto: "Próximamente" }),
      el("dl", { class: "grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm" }, filas.map(([k, v]) => el("div", {}, el("dt", { class: "inline font-semibold", texto: k + ": " }), el("dd", { class: "inline", texto: v })))),
      an.texto ? el("p", { class: "text-sm mt-3 whitespace-pre-line", texto: an.texto }) : null);
  }
  const inscripcionAbierta = (t) => !!(t.inscripcion && t.inscripcion.abierta && (!t.inscripcion.hasta || t.inscripcion.hasta >= hoy()));
  function formularioInscripcion(t, fila) {
    const caja = el("section", { id: "tp-inscribir", class: C.tarjeta + " mb-6", "aria-labelledby": "tp-inscribir-titulo" },
      el("h2", { id: "tp-inscribir-titulo", class: "font-serif text-xl font-bold mb-1", texto: "Inscribir a un jugador" }),
      el("p", { class: C.nota + " mb-3", texto: (t.inscripcion.hasta ? "Hasta el " + fechaTexto(t.inscripcion.hasta) + ". " : "") + "Quien organiza revisa cada inscripción y te contacta si falta algo. Tu contacto lo ve solo quien organiza." }));
    const campo = (id, etiqueta, control, obligatorio) => el("div", {},
      el("label", { for: id, class: "block text-sm font-semibold mb-1" }, etiqueta, obligatorio ? el("span", { "aria-hidden": "true", texto: " *" }) : null), control);
    const entrada = (id, extra) => el("input", Object.assign({ id, type: "text", autocomplete: "off", class: C.campo + " w-full" }, extra || {}));
    const cats = [...new Set(t.jugadores.map((j) => String(j.categoria || "").trim()).filter(Boolean))];
    const categoria = cats.length ? el("select", { id: "tp-i-categoria", class: C.campo + " w-full" }, el("option", { value: "", texto: "—" }), cats.map((c) => el("option", { value: c, texto: c }))) : entrada("tp-i-categoria", { maxlength: "30" });
    const permiso = el("input", { type: "checkbox", id: "tp-i-permiso", class: "mt-1", required: true });
    const estadoTxt = el("p", { id: "tp-i-estado", class: "text-sm font-semibold mt-3", role: "status" });
    const enviar = el("button", { type: "submit", id: "tp-i-enviar", class: "bg-accent-500 hover:bg-accent-600 text-brand-900 font-bold px-5 py-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-800 focus-visible:ring-offset-2 disabled:opacity-50" }, "Mandar la inscripción");
    const form = el("form", { id: "tp-i-form", novalidate: true },
      el("div", { class: "grid sm:grid-cols-2 gap-3" },
        campo("tp-i-nombre", "Nombre de quien juega", entrada("tp-i-nombre", { maxlength: "100", required: true, "aria-required": "true" }), true),
        campo("tp-i-institucion", "Colegio, escuela o club", entrada("tp-i-institucion", { maxlength: "100" })),
        campo("tp-i-categoria", "Categoría", categoria),
        campo("tp-i-elo", "Elo (si tiene)", entrada("tp-i-elo", { inputmode: "numeric", maxlength: "4" })),
        campo("tp-i-fide", "ID FIDE (si tiene)", entrada("tp-i-fide", { inputmode: "numeric", maxlength: "12" })),
        campo("tp-i-responsable", "Quién lo inscribe", entrada("tp-i-responsable", { maxlength: "100", required: true, "aria-required": "true" }), true),
        campo("tp-i-contacto", "Correo o teléfono de quien inscribe", entrada("tp-i-contacto", { maxlength: "120", required: true, "aria-required": "true" }), true),
        campo("tp-i-nota", "Algo que deba saber quien organiza", entrada("tp-i-nota", { maxlength: "300" }))),
      el("div", { class: "flex items-start gap-2 text-sm mt-3" }, permiso,
        el("label", { for: "tp-i-permiso" }, "Acepto que mis datos y los de quien juega se usen para esta inscripción, como dice la ",
          el("a", { href: "privacidad.html#torneos", target: "_blank", rel: "noopener", class: C.enlace, texto: "Política de privacidad" }), ". Si quien juega es menor de edad, soy su encargado o tengo su permiso.")),
      el("div", { class: "mt-3" }, enviar), estadoTxt);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = (id) => ($(id).value || "").trim();
      const falta = [["tp-i-nombre", 2], ["tp-i-responsable", 2], ["tp-i-contacto", 5]].find(([id, n]) => v(id).length < n);
      if (falta) { estadoTxt.textContent = "Falta un dato obligatorio (los que llevan *)."; $(falta[0]).focus(); return; }
      if (!permiso.checked) { estadoTxt.textContent = "Marca que aceptas la política de privacidad."; permiso.focus(); return; }
      enviar.disabled = true;
      estadoTxt.textContent = "Mandando…";
      const r = await PareoPublicar.inscribir(fila.id, { nombre: v("tp-i-nombre"), institucion: v("tp-i-institucion"), categoria: v("tp-i-categoria"),
        elo: v("tp-i-elo"), fideId: v("tp-i-fide"), responsable: v("tp-i-responsable"), contacto: v("tp-i-contacto"), nota: v("tp-i-nota") });
      enviar.disabled = false;
      if (!r.ok) { estadoTxt.textContent = r.error || "No se pudo mandar. Revisa la conexión e intenta de nuevo."; return; }
      const nombre = v("tp-i-nombre");
      form.reset();
      estadoTxt.textContent = "✓ Inscripción de " + nombre + " enviada. Quien organiza la revisa; si quieres, inscribe a otra persona.";
      $("tp-i-nombre").focus();
    });
    caja.append(form);
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

  // En la portada: cada jugador que sigo con sus últimos torneos publicados
  // (los tres más recientes, con su puesto y su mesa). Se buscan una vez por
  // visita: escribir en el buscador de torneos no los vuelve a pedir.
  const torneosDe = new Map();
  async function buscarTorneosDe(nombre) {
    if (!torneosDe.has(nombre)) {
      torneosDe.set(nombre, (async () => {
        const r = await window.sb.from("pareo_publicados").select(COLUMNAS + ",datos")
          .contains("datos", { jugadores: [{ nombre }] }).order("actualizado", { ascending: false }).range(0, 2);
        if (r.error) throw r.error;
        return r.data || [];
      })());
      torneosDe.get(nombre).catch(() => torneosDe.delete(nombre));
    }
    return torneosDe.get(nombre);
  }
  async function pintarSeguidosPortada() {
    const nombres = seguidosAhora();
    const ul = $("tp-seguidos");
    $("tp-seguidos-caja").hidden = !nombres.length;
    if (!nombres.length) { ul.replaceChildren(); return; }
    ul.replaceChildren(...nombres.map((nombre) => {
      const dejar = el("button", { type: "button", class: C.pestana + " bg-white dark:bg-brand-900 text-xs px-2 py-1", "data-dejar": nombre, "aria-label": "Dejar de seguir a " + nombre }, "Dejar de seguir");
      dejar.addEventListener("click", () => {
        alternarSeguir(nombre);
        pintarSeguidosPortada();
        $("tp-seguidos-estado").textContent = "Dejaste de seguir a " + nombre + ".";
        const otro = $("tp-seguidos").querySelector("[data-dejar]");
        (otro || $("tp-buscar")).focus();
      });
      const torneos = el("ul", { class: "mt-1 space-y-1 text-sm" }, el("li", { class: C.nota, texto: "Buscando sus torneos…" }));
      buscarTorneosDe(nombre).then((filas) => {
        if (!filas.length) { torneos.replaceChildren(el("li", { class: C.nota, texto: "Todavía no aparece en ningún torneo publicado." })); return; }
        torneos.replaceChildren(...filas.map((x) => {
          const j = x.datos.jugadores.find((y) => y.nombre === nombre);
          return el("li", { "data-torneo-de": x.id },
            el("a", { href: "#" + new URLSearchParams({ t: x.id, v: "jugadores", j: j ? j.id : "" }).toString(), class: C.enlace + " font-semibold", texto: x.nombre }),
            el("span", { texto: " · " + [fechaTexto(x.fecha), j ? resumenJugador(x.datos, j.id) : ""].filter(Boolean).join(" · ") }));
        }));
      }, () => torneos.replaceChildren(el("li", { class: C.nota, texto: "No se pudieron buscar sus torneos." })));
      return el("li", { class: C.tarjeta, "data-sigo": nombre },
        el("div", { class: "flex flex-wrap items-center justify-between gap-2" },
          el("span", { class: "font-semibold text-brand-800 dark:text-white" }, el("span", { "aria-hidden": "true", texto: "★ " }), nombre), dejar),
        torneos);
    }));
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
    if (fila.organizador_id) await organizadorCompleto(fila.organizador_id);
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
    // Antes de empezar: el anuncio y, si está abierta, la inscripción. Un
    // anuncio sin jugadores no tiene nada más que mostrar. (El formulario no
    // se vuelve a pintar con la relectura de cada minuto: se perdería lo escrito.)
    if (silencioso && $("tp-i-form") && $("tp-i-form").contains(document.activeElement)) return;
    const previo = !t.rondas.length ? [tarjetaAnuncio(t), inscripcionAbierta(t) ? formularioInscripcion(t, fila) : null] : [];
    if (!t.jugadores.length) { caja.replaceChildren(cabecera(fila, t), ...previo.filter(Boolean)); if (!foco) $("tp-titulo").focus(); return; }
    caja.replaceChildren(cabecera(fila, t), ...previo.filter(Boolean), ...[cajaSeguidos(t)].filter(Boolean), pestanas(vista),
      vista === "rondas" ? vistaRondas(t, ruta.r) : vista === "jugadores" ? vistaJugadores(t, jid, fila) : vista === "estadisticas" ? vistaEstadisticas(t) : vistaClasificacion(t));
    if (buscado && $("tp-buscar-mesa")) { $("tp-buscar-mesa").value = buscado; $("tp-buscar-mesa").dispatchEvent(new Event("input")); }
    if (foco && $(foco)) $(foco).focus();
    else if (!foco) $("tp-titulo").focus();
  }

  // ---------- La página de un organizador (#o=<id>) ----------
  // Su logo, su nombre, el sello y todos sus torneos publicados, por día.
  async function pintarOrganizador(id) {
    const caja = $("tp-contenido");
    $("tp-portada").hidden = true;
    caja.hidden = false;
    caja.replaceChildren(el("p", { class: C.nota, role: "status", texto: "Cargando…" }));
    let o = null, torneos = [];
    try {
      o = await organizadorCompleto(id);
      if (o) {
        for (let desde = 0; ; desde += 1000) {
          const { data, error } = await window.sb.from("pareo_publicados").select(COLUMNAS_LISTA).eq("organizador_id", id)
            .order("fecha", { ascending: false }).range(desde, desde + 999);
          if (error) throw error;
          torneos.push(...(data || []));
          if (!data || data.length < 1000) break;
        }
      }
    } catch (e) {
      caja.replaceChildren(el("p", { class: C.nota, role: "alert", texto: "No se pudo leer el organizador. Revisa la conexión e intenta de nuevo." }));
      return;
    }
    if (!o) {
      caja.replaceChildren(el("p", { class: "font-semibold", role: "alert", texto: "Este organizador ya no está en la lista." }), el("a", { href: "#", class: C.enlace, texto: "Ver todos los torneos" }));
      return;
    }
    document.title = o.nombre + " — Torneos en Pareo Integral | Ajedrez Integral";
    const proximos = torneos.filter(esProximo), jugados = torneos.filter((x) => !esProximo(x));
    caja.replaceChildren(
      el("a", { href: "#", class: C.enlace + " text-sm", texto: "← Todos los torneos" }),
      el("div", { class: "flex flex-wrap items-center gap-4 mt-3 mb-6" },
        logoValido(o.logo) ? el("img", { src: o.logo, alt: "Logo de " + o.nombre, class: "tp-org-logo tp-org-logo-grande" }) : null,
        el("div", {},
          el("h1", { id: "tp-titulo", tabindex: "-1", class: "font-serif text-3xl md:text-4xl font-bold text-brand-800 dark:text-white" }, o.nombre),
          el("p", { class: "mt-1 flex flex-wrap items-center gap-2 text-sm" }, o.verificado ? sello() : null,
            el("span", { id: "tp-org-cuantos", texto: torneos.length === 1 ? "1 torneo publicado" : torneos.length + " torneos publicados" })))),
      proximos.length ? el("h2", { class: "font-serif text-2xl font-bold text-brand-800 dark:text-white mb-3", texto: "Próximos torneos" }) : null,
      ...porDia(proximos, true, false),
      jugados.length ? el("h2", { class: "font-serif text-2xl font-bold text-brand-800 dark:text-white mb-3", texto: "Resultados" }) : null,
      el("div", { id: "tp-org-lista" }, porDia(jugados, false, false)));
    $("tp-titulo").focus();
  }

  async function pintar() {
    if (refresco) { clearInterval(refresco); refresco = null; }
    const ruta = leerRuta();
    if (ruta.o && !ruta.t) { abierto = null; await pintarOrganizador(ruta.o); return; }
    if (!ruta.t) {
      abierto = null;
      document.title = "Torneos en Pareo Integral | Ajedrez Integral";
      if (!lista) {
        $("tp-cuantos").textContent = "Cargando…";
        try { lista = await pedirLista(); } catch (e) { $("tp-cuantos").textContent = "No se pudo leer la lista. Revisa la conexión e intenta de nuevo."; return; }
        await cargarOrganizadores(lista.map((x) => x.organizador_id));
      }
      pintarLugares();
      pintarLista();
      pintarSeguidosPortada();
      return;
    }
    await pintarTorneo(ruta, false);
    refresco = setInterval(() => {
      if (document.visibilityState === "visible" && leerRuta().t === ruta.t) pintarTorneo(leerRuta(), true);
    }, REFRESCO_MS);
  }

  $("tp-buscar").addEventListener("input", pintarLista);
  for (const id of ["tp-f-ritmo", "tp-f-lugar", "tp-f-elo", "tp-f-abierta", "tp-f-curso", "tp-f-verificado"]) $(id).addEventListener("change", pintarLista);
  $("tp-f-quitar").addEventListener("click", () => {
    for (const id of ["tp-f-ritmo", "tp-f-lugar", "tp-f-elo"]) $(id).value = "";
    for (const id of ["tp-f-abierta", "tp-f-curso", "tp-f-verificado"]) $(id).checked = false;
    pintarLista();
    $("tp-f-ritmo").focus();
  });
  window.addEventListener("hashchange", pintar);
  pintar();
})();
