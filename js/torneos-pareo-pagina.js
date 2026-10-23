/* El código de torneos-pareo.html: «Torneos en Pareo Integral», el espacio
   público donde se ve todo torneo que su organizador publicó desde
   pareo.html (js/pareo/publicar.js → Edge Function pareo-publicar).

   Lee public.pareo_publicados, que es de lectura pública: la lista de 50 en
   50 la arma la base con la búsqueda y los filtros (public.pareo_lista) y,
   al elegir uno, se lee su `datos` (el torneo tal
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
    return { t: p.get("t") || "", j: p.get("j") || "", r: p.get("r") || "", v: p.get("v") || "", n: p.get("n") || "", o: p.get("o") || "", p: p.get("p") || "",
      i: p.get("i") || "", vs: p.get("vs") || "", vi: p.get("vi") || "", c: p.get("c") || "", ranking: p.get("ranking") || "" };
  }
  function irA(cambios) {
    const r = Object.assign(leerRuta(), cambios);
    const p = new URLSearchParams();
    for (const k of ["t", "v", "r", "j", "n", "o", "p", "i", "vs", "vi", "c", "ranking"]) if (r[k]) p.set(k, r[k]);
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
  // ---------- La lista, de 50 en 50 ----------
  // La arma la base (public.pareo_lista): la búsqueda, los filtros, el orden
  // y de a 50 grupos (los torneos de un evento y un día van juntos y nunca
  // se parten entre dos páginas). Los próximos y los jugados se piden por
  // separado, cada uno con su «Ver más». Antes se bajaba la tabla entera y se
  // filtraba acá. Ver «Torneos en Pareo Integral: la lista de 50 en 50» en
  // docs/decisiones/juegos-y-torneos.md.
  const POR_PAGINA = 50;
  let resumen = null; // { total, lugares }: lo que la portada necesita entero
  const partes = { proximos: null, resultados: null }; // { filas, grupos, torneos, desde }
  let pedido = 0; // la respuesta que llega tarde (ya se pidió otra cosa) no se pinta
  function argumentos(parte, desde) {
    const f = filtros();
    return { p_parte: parte, p_desde: desde, p_cuantos: POR_PAGINA, p_buscar: $("tp-buscar").value.trim(),
      p_ritmo: f.ritmo, p_lugar: f.lugar, p_elo: f.elo, p_abierta: f.abierta, p_curso: f.curso, p_verificado: f.verificado };
  }
  async function pedirParte(parte, desde) {
    const { data, error } = await window.sb.rpc("pareo_lista", argumentos(parte, desde));
    if (error) throw error;
    return data || { filas: [], grupos: 0, torneos: 0 };
  }
  // La primera página de las dos partes. Devuelve false si mientras tanto
  // se pidió otra cosa.
  async function cargarLista() {
    const yo = ++pedido;
    const [p, r] = await Promise.all([pedirParte("proximos", 0), pedirParte("resultados", 0)]);
    if (yo !== pedido) return false;
    await cargarOrganizadores([...p.filas, ...r.filas].map((x) => x.organizador_id));
    if (yo !== pedido) return false;
    partes.proximos = Object.assign(p, { desde: POR_PAGINA });
    partes.resultados = Object.assign(r, { desde: POR_PAGINA });
    return true;
  }
  async function verMas(parte, boton) {
    const yo = pedido, ya = partes[parte];
    boton.disabled = true;
    try {
      const d = await pedirParte(parte, ya.desde);
      await cargarOrganizadores(d.filas.map((x) => x.organizador_id));
      if (yo !== pedido) return;
      ya.filas.push(...d.filas);
      Object.assign(ya, { grupos: d.grupos, torneos: d.torneos, desde: ya.desde + POR_PAGINA });
      const antes = ya.filas.length - d.filas.length;
      pintarLista();
      // El foco sigue en «Ver más» si queda; si no, en el último torneo.
      const otro = $("tp-mas-" + parte);
      if (otro) otro.focus();
      else { const l = $(parte === "proximos" ? "tp-proximos" : "tp-lista").querySelectorAll("a[data-torneo], button[data-evento]"); if (l.length) l[l.length - 1].focus(); }
      $("tp-cuantos").textContent += " Se agregaron " + (ya.filas.length - antes) + ".";
    } catch (e) {
      boton.disabled = false;
      Avisos.avisar("No se pudieron traer más torneos. Revisa la conexión e intenta de nuevo.", { tipo: "error" });
    }
  }
  // Volver a pedir con lo que dicen la búsqueda y los filtros.
  async function recargar() {
    pintarEnVivo();
    try { if (await cargarLista()) pintarLista(); }
    catch (e) { $("tp-cuantos").textContent = "No se pudo leer la lista. Revisa la conexión e intenta de nuevo."; }
  }
  let esperaBuscar = null;
  const buscarLuego = () => { clearTimeout(esperaBuscar); esperaBuscar = setTimeout(recargar, 300); };
  // Próximo: todavía sin jugadores (un anuncio) o con fecha más adelante.
  const esProximo = (x) => !x.jugadores || (x.fecha && x.fecha > hoy());
  // En curso: ya empezó, le faltan rondas y no pasó de su último día.
  const enCurso = (x) => !esProximo(x) && x.rondas_total > 0 && x.rondas < x.rondas_total && (x.fin || x.fecha || "") >= HoraCR.sumarDias(hoy(), -1);
  const inscribe = (x) => !!(x.inscripcion && x.inscripcion.abierta && (!x.inscripcion.hasta || x.inscripcion.hasta >= hoy()));
  const RITMO = { clasico: "Clásico", rapido: "Rápido", blitz: "Relámpago" };
  const ritmoDe = (x) => RITMO[x.ritmo_tipo || (window.RitmoControl ? RitmoControl.deducir(x.ritmo || "", x.nombre) : "")] || "";
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
          el("span", { class: "tp-lugar" }, hijo ? null : lugarDe(x), el("span", { class: "tp-estado " + est.clase, texto: est.texto }), orgDe(x) ? nombreOrg(orgDe(x)) : null),
          repetidos.has(x.id) ? el("span", { class: "tp-fila-evento", "data-tambien": "1", texto: "También anunciado en ajedrezcostarica.com" }) : null),
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
  // Lo que pide cada uno, leído de los controles; los aplica la base
  // (public.pareo_lista). «ritmo» es clasico, rapido o blitz; «lugar», el
  // lugar escrito igual.
  function filtros() {
    const v = (id) => ($(id) ? $(id).value : "");
    const c = (id) => !!($(id) && $(id).checked);
    return { ritmo: v("tp-f-ritmo"), lugar: v("tp-f-lugar"), elo: v("tp-f-elo"), abierta: c("tp-f-abierta"), curso: c("tp-f-curso"), verificado: c("tp-f-verificado") };
  }
  const hayFiltro = (f) => !!(f.ritmo || f.lugar || f.elo || f.abierta || f.curso || f.verificado);
  // Los lugares que hay, para elegir uno (se vuelven a armar con la lista).
  // Las siete provincias primero (la base las deduce del lugar si quien
  // organiza no la eligió, public.pareo_provincia) y después cada lugar.
  const PROVINCIAS = ["San José", "Alajuela", "Cartago", "Heredia", "Guanacaste", "Puntarenas", "Limón"];
  function pintarLugares() {
    const sel = $("tp-f-lugar");
    if (!sel) return;
    const elegido = sel.value;
    const lugares = ((resumen && resumen.lugares) || []).filter((l) => !PROVINCIAS.includes(l)).sort((a, b) => a.localeCompare(b, "es"));
    sel.replaceChildren(el("option", { value: "", texto: "Todos" }),
      el("optgroup", { label: "Provincia" }, PROVINCIAS.map((l) => el("option", { value: l, texto: l }))),
      lugares.length ? el("optgroup", { label: "Lugar" }, lugares.map((l) => el("option", { value: l, texto: l }))) : null);
    sel.value = PROVINCIAS.includes(elegido) || lugares.includes(elegido) ? elegido : "";
    pintarProvincias();
  }
  // «Por provincia»: cuántos torneos vienen en cada una (los de Pareo
  // Integral y los de ajedrezcostarica.com), con un botón que filtra.
  function pintarProvincias() {
    const caja = $("tp-provincias");
    if (!caja) return;
    const cuenta = Object.assign({}, (resumen && resumen.provincias) || {});
    const hoyCR = hoy();
    for (const x of externos || []) {
      const d = diaExterno(x);
      if (x.provincia && (d.hasta || d.desde) >= hoyCR) cuenta[x.provincia] = (cuenta[x.provincia] || 0) + 1;
    }
    const elegida = $("tp-f-lugar") ? $("tp-f-lugar").value : "";
    const con = PROVINCIAS.filter((p) => cuenta[p]);
    caja.hidden = !con.length;
    $("tp-provincias-lista").replaceChildren(...con.map((p) => {
      const b = el("button", { type: "button", "data-provincia": p, "aria-pressed": elegida === p ? "true" : "false",
        class: C.pestana + " " + (elegida === p ? "bg-accent-500 text-brand-900" : "bg-white dark:bg-brand-900") },
        p, el("span", { class: "font-normal", texto: " · " + cuenta[p] + (cuenta[p] === 1 ? " torneo" : " torneos") }));
      b.addEventListener("click", () => {
        $("tp-f-lugar").value = elegida === p ? "" : p;
        recargar().then(() => { const otro = document.querySelector('#tp-provincias-lista [data-provincia="' + p + '"]'); if (otro) otro.focus(); });
      });
      return b;
    }));
  }

  // «Ver más» al pie de una parte, mientras queden grupos sin traer.
  function botonMas(parte) {
    const p = partes[parte];
    if (!p || p.desde >= p.grupos) return null;
    const b = el("button", { type: "button", id: "tp-mas-" + parte, class: C.pestana + " bg-white dark:bg-brand-900 mt-4" },
      "Ver más torneos", el("span", { class: "font-normal", texto: " · van " + p.filas.length + " de " + p.torneos }));
    b.addEventListener("click", () => verMas(parte, b));
    return b;
  }
  function pintarLista() {
    // Una lista que llega tarde (un filtro, «Ver más») no pinta la portada
    // encima de un torneo, una ficha o el ranking que se abrió mientras tanto.
    const ruta = leerRuta();
    if (ruta.t || ruta.o || ruta.p || ruta.c || ruta.ranking) return;
    const caja = $("tp-contenido");
    const q = $("tp-buscar") ? $("tp-buscar").value.trim() : "";
    const f = filtros();
    const p = partes.proximos || { filas: [], torneos: 0 }, r = partes.resultados || { filas: [], torneos: 0 };
    // Buscando o filtrando, los eventos se abren para que se vea qué coincidió.
    const abrir = !!q || hayFiltro(f);
    $("tp-lista").replaceChildren(...porDia(r.filas, false, abrir), botonMas("resultados") || "");
    $("tp-proximos").replaceChildren(...porDia(p.filas, true, abrir), botonMas("proximos") || "");
    if ($("tp-f-quitar")) $("tp-f-quitar").hidden = !hayFiltro(f);
    const total = resumen ? resumen.total : 0, cuantos = p.torneos + r.torneos;
    if ($("tp-resultados-vacio")) $("tp-resultados-vacio").hidden = !(total && (q || hayFiltro(f)) && !r.torneos);
    $("tp-proximos-caja").hidden = !p.filas.length;
    $("tp-cuantos").textContent = !resumen ? "" : !total ? "Todavía no hay torneos publicados."
      : !q && !hayFiltro(f) ? total + (total === 1 ? " torneo publicado." : " torneos publicados.")
      : cuantos + " de " + total + " torneos.";
    pintarExternos();
    caja.hidden = true;
    $("tp-portada").hidden = false;
  }

  // ---------- También en Costa Rica (ajedrezcostarica.com) ----------
  // Los torneos que se anuncian en ajedrezcostarica.com, leídos una vez al
  // día por la Edge Function torneos-externos (public.torneos_externos). Son
  // pocos: se piden de una vez y se filtran acá. Cada fila lleva a su ficha
  // de allá, que es donde se inscribe. Ver «Torneos en Pareo Integral: los
  // torneos de ajedrezcostarica.com» en docs/decisiones/juegos-y-torneos.md.
  let externos = null;
  let externosVisibles = []; // los que se ven ahora, para el calendario
  const ELO_EXTERNO = { ambos: "FIDE", fide: "FIDE", nacional: "Nacional", no: "No" };
  const ELO_EXTERNO_LARGO = { ambos: "Válido para Elo FIDE y Nacional", fide: "Válido para Elo FIDE", nacional: "Válido solo para Elo Nacional", no: "No varía el Elo" };
  // Vienen con `repetido_de`: el torneo de Pareo Integral que es el mismo
  // (mismo día, mismo ritmo y nombre parecido, public.torneos_externos_lista).
  // Ese no se muestra dos veces: su fila de Pareo Integral dice que también
  // está anunciado allá, y su ficha lleva el enlace.
  const repetidos = new Map(); // id del torneo de Pareo Integral → la ficha de allá
  async function cargarExternos() {
    if (externos) return;
    try {
      const { data, error } = await window.sb.rpc("torneos_externos_lista");
      if (error) throw error;
      externos = (data || []).filter((x) => !x.repetido_de);
      for (const x of data || []) if (x.repetido_de) repetidos.set(x.repetido_de, x.url);
    } catch (e) { externos = []; }
  }
  // El día en Costa Rica de cada punta, como los de Pareo Integral.
  const diaExterno = (x) => ({ desde: x.inicio ? HoraCR.dia(x.inicio) : "", hasta: x.fin ? HoraCR.dia(x.fin) : "" });
  function externosFiltrados() {
    const f = filtros();
    // Lo que allá no existe (el lugar escrito igual, «en curso», el sello de
    // Pareo Integral) no se puede pedir: con esos filtros, la parte se calla.
    // Una provincia sí: allá cada torneo dice la suya.
    const porProvincia = PROVINCIAS.includes(f.lugar);
    if ((f.lugar && !porProvincia) || f.curso || f.verificado) return [];
    const q = clave($("tp-buscar") ? $("tp-buscar").value : "");
    const hoyCR = hoy();
    return (externos || []).filter((x) => {
      const d = diaExterno(x);
      if ((d.hasta || d.desde) && (d.hasta || d.desde) < hoyCR) return false;
      if (porProvincia && x.provincia !== f.lugar) return false;
      if (f.ritmo && x.ritmo !== f.ritmo) return false;
      if (f.elo === "fide" && !["fide", "ambos"].includes(x.elo)) return false;
      if (f.elo === "nacional" && x.elo !== "nacional") return false;
      if (f.elo === "sin" && x.elo !== "no") return false;
      if (f.abierta && !x.inscripcion_abierta) return false;
      if (q && !clave([x.titulo, x.lugar, x.provincia, x.organizador].join(" ")).includes(q)) return false;
      return true;
    });
  }
  const precioDe = (x) => (x.precio == null ? "" : !Number(x.precio) ? "Gratis"
    : new Intl.NumberFormat("es-CR", { style: "currency", currency: x.moneda || "CRC", maximumFractionDigits: 0 }).format(Number(x.precio)));
  function filaExterna(x) {
    const d = diaExterno(x);
    const ritmo = RITMO[x.ritmo] || (x.ritmo === "bala" ? "Bala" : "");
    const tiempo = x.minutos != null ? x.minutos + " min" + (x.incremento ? " + " + x.incremento + " s" : "") : "";
    return el("li", { class: "tp-item" },
      el("a", { href: x.url, target: "_blank", rel: "noopener", class: "tp-fila", "data-externo": String(x.id_externo) },
        bloqueFecha(d.desde, d.hasta),
        el("span", { class: "tp-principal" },
          el("span", { class: "tp-nombre", texto: x.titulo }),
          el("span", { class: "tp-lugar" }, [x.lugar, x.provincia].filter(Boolean).join(", ") || null,
            x.organizador ? el("span", { class: "tp-fila-evento", texto: "Organiza: " + x.organizador }) : null),
          el("span", { class: "sr-only", texto: " (abre ajedrezcostarica.com en otra pestaña)" })),
        el("span", { class: "tp-datos" },
          dato("Inscripción", [el("span", { class: "tp-punto " + (x.inscripcion_abierta ? "tp-punto-si" : "tp-punto-no"), "aria-hidden": "true" }), x.inscripcion_abierta ? "Abierta" : "Cerrada"], { "data-col": "inscripcion" }),
          dato("Elo", ELO_EXTERNO[x.elo] || "", { "data-col": "elo", title: ELO_EXTERNO_LARGO[x.elo] || null }),
          dato("Ritmo", [ritmo, tiempo].filter(Boolean).join(" · "), { "data-col": "ritmo" }),
          dato("Modalidad", { equipos: "Por equipos", individual: "Individual" }[x.formato] || "", { "data-col": "modalidad" }),
          dato("Costo", precioDe(x), { "data-col": "costo" })),
        el("span", { class: "tp-flecha", "aria-hidden": "true", texto: "↗" })));
  }
  // Todos los de la lista, de una vez, al calendario (días completos).
  function externosAlCalendario(lista) {
    const { texto } = CalendarioIcs.armarDias({ nombre: "Torneos de ajedrez en Costa Rica", eventos: lista.map((x) => {
      const d = diaExterno(x);
      return { uid: "ajedrezcostarica-" + x.id_externo + "@ajedrez-integral.com", desde: d.desde, hasta: d.hasta, resumen: x.titulo,
        lugar: [x.lugar, x.provincia].filter(Boolean).join(", "),
        descripcion: [x.organizador ? "Organiza: " + x.organizador + "." : "", ELO_EXTERNO_LARGO[x.elo] ? ELO_EXTERNO_LARGO[x.elo] + "." : "", "Inscripción y detalles: " + x.url].filter(Boolean).join(" "),
        url: x.url, aviso: "-PT15H" };
    }) });
    CalendarioIcs.bajar(texto, "torneos-costa-rica.ics");
  }
  function pintarExternos() {
    const caja = $("tp-externos-caja");
    if (!caja) return;
    pintarProvincias();
    const lista = externosFiltrados().sort((a, b) => String(a.inicio || "9").localeCompare(String(b.inicio || "9")));
    caja.hidden = !lista.length;
    if (!lista.length) { $("tp-externos").replaceChildren(); return; }
    $("tp-externos").replaceChildren(el("ul", { class: "tp-filas" }, lista.map(filaExterna)));
    externosVisibles = lista;
    $("tp-externos-calendario").lastChild.textContent = lista.length === 1 ? "Agregar este torneo a mi calendario" : "Agregar estos " + lista.length + " torneos a mi calendario";
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
  // El calendario para suscribirse lo arma el worker
  // (/calendario/torneos.ics, con ?o=<id> los de un organizador): la app
  // del celular lo vuelve a leer sola. Ver «La tarjeta del organizador y el
  // calendario para suscribirse» en docs/decisiones/juegos-y-torneos.md.
  const direccionCalendario = (org) => SITIO + "/calendario/torneos.ics" + (org ? "?o=" + encodeURIComponent(org) : "");
  function cajaSuscribir(org, id) {
    const https = direccionCalendario(org);
    const boton = C.pestana + " bg-white dark:bg-brand-900 inline-flex items-center gap-2";
    const copiar = el("button", { type: "button", id: id + "-copiar", class: boton }, el("span", { "aria-hidden": "true", texto: "🔗" }), "Copiar la dirección");
    copiar.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(https); Avisos.avisar("Dirección del calendario copiada."); }
      catch (e) { Avisos.avisar("No se pudo copiar. La dirección es " + https, { tipo: "error" }); }
    });
    return el("div", { id, class: "flex flex-wrap items-center gap-2" },
      el("a", { id: id + "-abrir", href: https.replace(/^https:/, "webcal:"), class: boton },
        el("span", { "aria-hidden": "true", texto: "📅 " }), org ? "Suscribirme a sus torneos" : "Suscribirme al calendario de torneos"),
      copiar,
      el("p", { class: C.nota + " w-full", texto: "Tu calendario lo vuelve a leer solo: los torneos nuevos aparecen sin hacer nada. En Google Calendar: «Otros calendarios», «Desde URL», y pega la dirección copiada." }));
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
    if (repetidos.has(fila.id)) {
      hijos.push(el("a", { id: "tp-tambien", href: repetidos.get(fila.id), target: "_blank", rel: "noopener", class: boton },
        el("span", { "aria-hidden": "true", texto: "↗" }), "Su anuncio en ajedrezcostarica.com", el("span", { class: "sr-only", texto: " (se abre en otra pestaña)" })));
    }
    const incrustar = el("button", { type: "button", id: "tp-incrustar", class: boton, "aria-expanded": incrustarAbierto ? "true" : "false", "aria-controls": "tp-incrustar-caja" },
      el("span", { "aria-hidden": "true", texto: "</>" }), "Ponerlo en tu página");
    const panel = cajaIncrustar(fila, t);
    incrustar.addEventListener("click", () => {
      incrustarAbierto = !incrustarAbierto;
      incrustar.setAttribute("aria-expanded", incrustarAbierto ? "true" : "false");
      panel.hidden = !incrustarAbierto;
      if (incrustarAbierto) $("tp-incrustar-codigo").focus();
    });
    hijos.push(incrustar);
    return el("div", {}, el("div", { class: "flex flex-wrap gap-2 mt-3" }, hijos, estado), panel);
  }
  // El código para incrustar la clasificación (o las mesas de la ronda) en la
  // página de un club: un <iframe> a /incrustar/<id>, que arma el worker. Ver
  // «La clasificación para incrustar en otra página» en
  // docs/decisiones/juegos-y-torneos.md.
  let incrustarAbierto = false;
  let incrustarVer = "";
  function codigoIncrustar(fila, ver) {
    const src = SITIO + "/incrustar/" + encodeURIComponent(fila.id) + (ver ? "?ver=" + ver : "");
    const titulo = (ver === "ronda" ? "Mesas de la ronda de " : "Clasificación de ") + fila.nombre;
    return '<iframe src="' + src + '" title="' + titulo.replace(/[&"<>]/g, (c) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[c]) + '" width="100%" height="520" style="border:0" loading="lazy"></iframe>';
  }
  function cajaIncrustar(fila, t) {
    const codigo = el("textarea", { id: "tp-incrustar-codigo", rows: "3", readonly: true, class: C.campo + " w-full font-mono text-xs" });
    codigo.value = codigoIncrustar(fila, incrustarVer);
    const opciones = E.esDeEquipos(t) ? null : el("fieldset", { class: "mb-2" },
      el("legend", { class: "text-sm font-semibold mb-1", texto: "Qué mostrar" }),
      [["", "La clasificación"], ["ronda", "Las mesas de la última ronda"]].map(([v, texto]) => {
        const r = el("input", { type: "radio", name: "tp-incrustar-ver", id: "tp-incrustar-ver-" + (v || "clas"), value: v, checked: v === incrustarVer, class: "mr-1" });
        r.addEventListener("change", () => { incrustarVer = v; codigo.value = codigoIncrustar(fila, v); });
        return el("label", { class: "inline-flex items-center text-sm mr-4" }, r, texto);
      }));
    const copiar = el("button", { type: "button", id: "tp-incrustar-copiar", class: C.pestana + " bg-white dark:bg-brand-900 mt-2" }, "Copiar el código");
    copiar.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(codigo.value); Avisos.avisar("Código copiado: pégalo en tu página."); }
      catch (e) { codigo.select(); Avisos.avisar("No se pudo copiar solo: el código quedó marcado, cópialo con Ctrl + C.", { tipo: "error" }); }
    });
    return el("div", { id: "tp-incrustar-caja", class: C.tarjeta + " mt-3", hidden: !incrustarAbierto },
      el("p", { class: "text-sm mb-2", texto: "Pega este código en la página de tu club o tu federación: se ve la clasificación de este torneo y se pone al día sola cada minuto." }),
      opciones,
      el("label", { for: "tp-incrustar-codigo", class: "block text-sm font-semibold mb-1", texto: "Código para tu página" }), codigo, copiar);
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
          el("td", {}, E.esDeEquipos(t) || !j.institucion ? "" : enlaceColegio(j.institucion)),
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
      if (abierto) mostrarTorneo(abierto.fila, leerRuta(), "tp-seguir");
      else { pintar().then(() => { const b2 = $("tp-seguir"); if (b2) b2.focus(); }); return; }
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
      E.esDeEquipos(t) ? null : botonSeguir(j.nombre),
      E.esDeEquipos(t) ? null : el("div", { class: "mt-2" }, cajaAvisoCorreo(j.nombre, j.ident || "")),
      E.esDeEquipos(t) ? null : el("p", { class: "mt-2" }, el("a", { id: "tp-ficha-todos", href: "#" + new URLSearchParams(j.ident ? { p: j.nombre, i: j.ident } : { p: j.nombre }).toString(), class: C.enlace + " text-sm font-semibold", texto: "Su ficha en todos los torneos →" }))));
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

  // ---------- La ficha de un jugador en todos sus torneos (#p=<nombre>) ----------
  // Cada torneo publicado donde aparece el nombre escrito igual (como «Otros
  // torneos de…»): su puesto, sus puntos, sus partidas y, con Elo, su
  // rendimiento y cuánto ganaría o perdería con las reglas de FIDE
  // (js/pareo/elo.js). Ver «La ficha de un jugador en todos sus torneos» en
  // docs/decisiones/juegos-y-torneos.md.
  const MAX_FICHA = 100;
  function filaFicha(x, j) {
    const t = x.datos;
    if (!j) return null;
    const { filas } = clasificacion(t);
    const f = filas.find((y) => y.id === j.id);
    let g = 0, e = 0, p = 0;
    t.rondas.forEach((R, r) => {
      const s = T.situacion(t, r, j.id);
      if (s.tipo !== "partida") return;
      if (s.codigo === "1") g++; else if (s.codigo === "=") e++; else if (s.codigo === "0") p++;
    });
    const elo = window.PareoElo && rondasCompletas(t) ? PareoElo.calcular(t).get(j.id) : null;
    return { id: x.id, torneo: x.nombre, evento: x.evento, fecha: x.fecha || t.fechaInicio || "", jid: j.id, puesto: f ? f.puesto : null, de: filas.length,
      puntos: f ? f.puntos : null, rondas: rondasCompletas(t), g, e, p, elo: Number(j.elo) || 0, rp: elo ? elo.rp : null, cambio: elo ? elo.cambio : null,
      institucion: j.institucion || "", categoria: j.categoria || "", titulo: j.titulo || "" };
  }
  // ¿Quién es él en este torneo? Con huella (`i`), el de esa huella o, si no
  // la tiene nadie, el del mismo nombre sin huella (pudo jugar sin su ID
  // FIDE); nunca el del mismo nombre con OTRA huella: es otra persona. Sin
  // huella, el del mismo nombre (sin tildes ni mayúsculas).
  function elDe(t, nombre, ident) {
    const k = clave(nombre);
    if (ident) return t.jugadores.find((y) => y.ident === ident) || t.jugadores.find((y) => !y.ident && clave(y.nombre) === k) || null;
    return t.jugadores.find((y) => clave(y.nombre) === k) || null;
  }
  // Las personas distintas con ese nombre: una por huella.
  function homonimos(data, nombre) {
    const k = clave(nombre), por = new Map();
    for (const x of data) {
      if (E.esDeEquipos(x.datos)) continue;
      for (const y of x.datos.jugadores) {
        if (clave(y.nombre) !== k || !y.ident) continue;
        const h = por.get(y.ident) || { ident: y.ident, nombre: y.nombre, institucion: y.institucion || "", torneos: 0 };
        h.torneos++;
        por.set(y.ident, h);
      }
    }
    return [...por.values()];
  }
  async function torneosDeJugador(nombre, ident) {
    const { data, error } = await window.sb.rpc("pareo_torneos_de", { p_nombre: nombre, p_ident: ident || "" });
    if (error) throw error;
    return data || [];
  }
  async function pintarFichaJugador(ruta) {
    const nombre = ruta.p;
    const caja = $("tp-contenido");
    $("tp-portada").hidden = true;
    caja.hidden = false;
    caja.replaceChildren(el("p", { class: C.nota, role: "status", texto: "Buscando sus torneos…" }));
    let data;
    try { data = await torneosDeJugador(nombre, ruta.i); } catch (e) {
      caja.replaceChildren(el("p", { class: C.nota, role: "alert", texto: "No se pudieron buscar sus torneos. Revisa la conexión e intenta de nuevo." }));
      return;
    }
    if (leerRuta().p !== nombre) return;
    document.title = nombre + " — Torneos en Pareo Integral | Ajedrez Integral";
    const volver = el("a", { href: "#", class: C.enlace + " text-sm", texto: "← Todos los torneos" });
    const titulo = el("h1", { id: "tp-titulo", tabindex: "-1", class: "font-serif text-3xl md:text-4xl font-bold text-brand-800 dark:text-white mt-3", texto: nombre });
    // Dos personas con el mismo nombre (dos huellas): se pregunta cuál, en vez
    // de sumarlas.
    const otros = ruta.i ? [] : homonimos(data, nombre);
    if (otros.length > 1) {
      caja.replaceChildren(volver, titulo,
        el("p", { id: "tp-homonimos", class: "mt-3 font-semibold", role: "status", texto: "Hay " + otros.length + " personas distintas con este nombre (tienen distinto ID FIDE). ¿Cuál buscas?" }),
        el("ul", { class: "mt-2 space-y-2" }, otros.map((h) => el("li", {},
          el("a", { href: "#" + new URLSearchParams({ p: nombre, i: h.ident }).toString(), class: C.enlace + " font-semibold", "data-ident": h.ident, texto: h.nombre }),
          el("span", { class: C.nota, texto: " · " + [h.institucion, h.torneos === 1 ? "1 torneo" : h.torneos + " torneos"].filter(Boolean).join(" · ") })))));
      titulo.focus();
      return;
    }
    const elegidos = data.filter((x) => !E.esDeEquipos(x.datos)).map((x) => ({ x, j: elDe(x.datos, nombre, ruta.i) })).filter((y) => y.j);
    const filas = elegidos.map(({ x, j }) => filaFicha(x, j)).filter(Boolean);
    if (!filas.length) {
      caja.replaceChildren(volver, titulo, el("p", { id: "tp-ficha-vacia", class: C.nota + " mt-3", role: "status", texto: "No aparece en ningún torneo individual publicado con ese nombre." }));
      titulo.focus();
      return;
    }
    const ident = ruta.i || (elegidos.find((y) => y.j.ident) || { j: {} }).j.ident || "";
    const ultimo = filas[0];
    const conElo = filas.filter((x) => x.elo).slice().reverse();
    const suma = (k) => filas.reduce((a, x) => a + x[k], 0);
    const cambios = filas.filter((x) => x.cambio != null);
    const totalCambio = Math.round(cambios.reduce((a, x) => a + x.cambio, 0) * 10) / 10;
    const resumen = [
      ["Torneos", String(filas.length)],
      ["Partidas", String(suma("g") + suma("e") + suma("p"))],
      ["Ganadas, tablas y perdidas", suma("g") + " · " + suma("e") + " · " + suma("p")],
      conElo.length ? ["Elo", conElo.length > 1 && conElo[0].elo !== conElo[conElo.length - 1].elo ? "De " + conElo[0].elo + " a " + conElo[conElo.length - 1].elo : String(conElo[conElo.length - 1].elo)] : null,
      cambios.length ? ["Elo que suman sus torneos (cálculo de FIDE)", PareoElo.textoCambio(totalCambio)] : null,
    ].filter(Boolean);
    const tbody = el("tbody", {}, filas.map((x) => el("tr", { "data-ficha-torneo": x.id },
      el("td", { texto: fechaTexto(x.fecha) }),
      el("td", {}, el("a", { href: "#" + new URLSearchParams({ t: x.id, v: "jugadores", j: x.jid }).toString(), class: C.enlace + " font-semibold", texto: x.torneo }),
        x.evento && x.evento !== x.torneo ? el("span", { class: "block text-xs text-brand-600 dark:text-brand-300", texto: x.evento }) : null),
      el("td", { class: "num", texto: x.puesto ? x.puesto + " de " + x.de : "—" }),
      el("td", { class: "num", texto: x.puntos == null ? "—" : puntosTexto(x.puntos) + (x.rondas ? " de " + x.rondas : "") }),
      el("td", { class: "num", texto: x.g + " · " + x.e + " · " + x.p }),
      el("td", { class: "num", texto: x.elo ? String(x.elo) : "—" }),
      el("td", { class: "num", texto: x.rp == null ? "—" : String(x.rp) }),
      el("td", { class: "num", texto: x.cambio == null ? "—" : PareoElo.textoCambio(x.cambio) }))));
    const copiar = el("button", { type: "button", id: "tp-ficha-copiar", class: C.pestana + " bg-white dark:bg-brand-900 inline-flex items-center gap-2" },
      el("span", { "aria-hidden": "true", texto: "🔗" }), "Copiar el enlace de su ficha");
    copiar.addEventListener("click", async () => {
      const enlace = SITIO + "/torneos-pareo.html#" + new URLSearchParams(ruta.i ? { p: nombre, i: ruta.i } : { p: nombre }).toString();
      try { await navigator.clipboard.writeText(enlace); Avisos.avisar("Enlace copiado."); }
      catch (e) { Avisos.avisar("No se pudo copiar. El enlace es " + enlace, { tipo: "error" }); }
    });
    caja.replaceChildren(volver, titulo,
      el("p", { class: C.nota + " mt-1" }, [ultimo.titulo, ultimo.institucion ? enlaceColegio(ultimo.institucion) : null, ultimo.categoria ? "Categoría " + ultimo.categoria : ""]
        .filter(Boolean).flatMap((x, i) => (i ? [" · ", x] : [x]))),
      el("div", { class: "mt-3 flex flex-wrap items-start gap-3" }, botonSeguir(nombre), copiar, cajaAvisoCorreo(nombre, ident)),
      cajaCaraACara(elegidos, nombre, ident, ruta),
      el("dl", { id: "tp-ficha-resumen", class: "mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3" }, resumen.map(([k, v]) => el("div", { class: "rounded-2xl bg-white dark:bg-brand-900 shadow-md p-3" },
        el("dt", { class: "text-xs font-semibold text-brand-600 dark:text-brand-300", texto: k }), el("dd", { class: "text-lg font-bold", texto: v })))),
      el("h2", { class: "font-serif text-2xl font-bold text-brand-800 dark:text-white mt-6 mb-2", texto: "Torneo por torneo" }),
      el("div", { class: "overflow-x-auto" }, el("table", { id: "tp-ficha-tabla", class: "pi-tabla" },
        el("caption", { class: "sr-only", texto: "Los torneos de " + nombre + ", del más reciente al más viejo" }),
        el("thead", {}, el("tr", {}, ["Fecha", "Torneo", "Puesto", "Puntos", "Ganadas · tablas · perdidas", "Elo", "Rendimiento", "± Elo"].map((h, i) =>
          el("th", { scope: "col", class: i >= 2 ? "num" : null, texto: h })))),
        tbody)),
      el("p", { class: "text-xs text-brand-600 dark:text-brand-300 mt-3", texto: "Los torneos individuales publicados con Pareo Integral donde aparece: con su ID FIDE (que no se publica: se reconoce por una huella) o, si no lo tiene, con este nombre (sin importar tildes ni mayúsculas). El Elo es el que tenía en cada torneo; el rendimiento y el ± Elo se calculan como FIDE, solo con las partidas contra rivales con Elo, y no son oficiales."
        + (data.length >= MAX_FICHA ? " Se muestran los " + MAX_FICHA + " más recientes." : "") }));
    titulo.focus();
  }

  // ---------- Cara a cara (#p=A&vs=B) ----------
  // Las partidas entre dos jugadores en los torneos publicados donde jugaron
  // los dos (de los de A, que ya están leídos). Los rivales para elegir son
  // los que A tuvo enfrente alguna vez.
  function rivalesDe(elegidos) {
    const por = new Map();
    for (const { x, j } of elegidos) {
      const t = x.datos;
      t.rondas.forEach((R, r) => {
        const s = T.situacion(t, r, j.id);
        if (s.tipo !== "partida" || !s.rival) return;
        const y = t.jugadores.find((z) => z.id === s.rival);
        if (!y) return;
        const k = y.ident ? "i:" + y.ident : "n:" + clave(y.nombre);
        if (!por.has(k)) por.set(k, { nombre: y.nombre, ident: y.ident || "", veces: 0 });
        por.get(k).veces++;
      });
    }
    return [...por.values()].sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre, "es"));
  }
  function partidasEntre(elegidos, vs, vi) {
    const out = [];
    for (const { x, j } of elegidos) {
      const t = x.datos;
      const b = elDe(t, vs, vi);
      if (!b || b.id === j.id) continue;
      t.rondas.forEach((R, r) => {
        const s = T.situacion(t, r, j.id);
        if (s.tipo !== "partida" || s.rival !== b.id) return;
        out.push({ id: x.id, torneo: x.nombre, fecha: x.fecha || t.fechaInicio || "", ronda: r + 1, color: s.color === "w" ? "Blancas" : "Negras", codigo: s.codigo, jid: j.id });
      });
    }
    return out;
  }
  function cajaCaraACara(elegidos, nombre, ident, ruta) {
    const rivales = rivalesDe(elegidos);
    const caja = el("section", { id: "tp-cara", class: C.tarjeta + " mt-5", "aria-labelledby": "tp-cara-titulo" },
      el("h2", { id: "tp-cara-titulo", class: "font-serif text-xl font-bold mb-2", texto: "Cara a cara" }));
    if (!rivales.length) { caja.append(el("p", { class: C.nota, texto: "Todavía no tiene partidas jugadas en torneos publicados." })); return caja; }
    const sel = el("select", { id: "tp-cara-rival", class: C.campo }, el("option", { value: "", texto: "Elige un rival…" }),
      rivales.map((v) => el("option", { value: JSON.stringify([v.nombre, v.ident]), selected: clave(v.nombre) === clave(ruta.vs) && (v.ident || "") === (ruta.vi || ""),
        texto: v.nombre + (v.veces > 1 ? " (" + v.veces + " partidas)" : "") })));
    sel.addEventListener("change", () => {
      const [vs, vi] = sel.value ? JSON.parse(sel.value) : ["", ""];
      irA({ vs, vi });
    });
    caja.append(el("label", { for: "tp-cara-rival", class: "flex flex-col text-sm max-w-md" }, el("span", { class: "font-semibold", texto: "Sus partidas contra" }), sel));
    if (!ruta.vs) return caja;
    const lista = partidasEntre(elegidos, ruta.vs, ruta.vi);
    const g = lista.filter((x) => x.codigo === "1").length, e = lista.filter((x) => x.codigo === "=").length, p = lista.filter((x) => x.codigo === "0").length;
    caja.append(el("p", { id: "tp-cara-marcador", class: "mt-3 text-lg font-bold", role: "status",
      texto: !lista.length ? "No jugaron entre ellos en torneos publicados." : nombre + " " + g + " · tablas " + e + " · " + ruta.vs + " " + p }));
    if (lista.length) {
      const res = { "1": "Ganó " + nombre, "=": "Tablas", "0": "Ganó " + ruta.vs };
      caja.append(el("div", { class: "overflow-x-auto mt-2" }, el("table", { id: "tp-cara-tabla", class: "pi-tabla" },
        el("caption", { class: "sr-only", texto: "Las partidas entre " + nombre + " y " + ruta.vs }),
        el("thead", {}, el("tr", {}, ["Fecha", "Torneo", "Ronda", "Color de " + nombre, "Resultado"].map((h) => el("th", { scope: "col", texto: h })))),
        el("tbody", {}, lista.map((x) => el("tr", {},
          el("td", { texto: fechaTexto(x.fecha) }),
          el("td", {}, el("a", { href: "#" + new URLSearchParams({ t: x.id, v: "rondas", r: String(x.ronda) }).toString(), class: C.enlace, texto: x.torneo })),
          el("td", { class: "num", texto: x.ronda }), el("td", { texto: x.color }), el("td", { texto: res[x.codigo] || "—" })))))));
    }
    return caja;
  }

  // ---------- Avisarme por correo ----------
  // Quien sigue a un jugador deja su correo; la función le manda un enlace
  // para confirmarlo y, desde entonces, un aviso cuando ese jugador juega una
  // ronda nueva y cuando termina un torneo (pareo-publicar, avisos.ts).
  function cajaAvisoCorreo(nombre, ident) {
    const boton = el("button", { type: "button", id: "tp-aviso-abrir", "aria-expanded": "false", "aria-controls": "tp-aviso-form",
      class: C.pestana + " bg-white dark:bg-brand-900 inline-flex items-center gap-2" }, el("span", { "aria-hidden": "true", texto: "✉" }), "Avisarme por correo");
    const correo = el("input", { id: "tp-aviso-correo", type: "email", autocomplete: "email", maxlength: "200", required: true, class: C.campo + " w-full" });
    const permiso = el("input", { id: "tp-aviso-permiso", type: "checkbox", class: "mt-1" });
    const estado = el("p", { id: "tp-aviso-estado", class: "text-sm font-semibold mt-2", role: "status" });
    const mandar = el("button", { type: "submit", id: "tp-aviso-mandar", class: "bg-accent-500 hover:bg-accent-600 text-brand-900 font-bold px-4 py-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-800 disabled:opacity-50" }, "Pedir los avisos");
    const form = el("form", { id: "tp-aviso-form", class: C.tarjeta + " w-full mt-2", hidden: true, novalidate: true },
      el("p", { class: "text-sm mb-2", texto: "Te escribimos cuando " + nombre + " juegue una ronda nueva en un torneo publicado (su mesa y su rival) y cuando termine el torneo. Primero te llega un correo para confirmar." }),
      el("label", { for: "tp-aviso-correo", class: "block text-sm font-semibold mb-1", texto: "Tu correo" }), correo,
      el("div", { class: "flex items-start gap-2 text-sm mt-3" }, permiso,
        el("label", { for: "tp-aviso-permiso" }, "Acepto que se guarde mi correo solo para estos avisos, como dice la ",
          el("a", { href: "privacidad.html#torneos", target: "_blank", rel: "noopener", class: C.enlace, texto: "Política de privacidad" }), ". Cada correo trae cómo dejar de recibirlos.")),
      el("div", { class: "mt-3" }, mandar), estado);
    boton.addEventListener("click", () => {
      const abrir = form.hidden;
      form.hidden = !abrir;
      boton.setAttribute("aria-expanded", abrir ? "true" : "false");
      if (abrir) correo.focus();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const c = correo.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) { estado.textContent = "Ese correo no parece bien escrito."; correo.focus(); return; }
      if (!permiso.checked) { estado.textContent = "Marca que aceptas la política de privacidad."; permiso.focus(); return; }
      mandar.disabled = true;
      estado.textContent = "Mandando…";
      const r = await PareoPublicar.seguirCorreo(nombre, ident, c);
      mandar.disabled = false;
      estado.textContent = r.ok ? "✓ Listo: revisa tu correo y toca el enlace para confirmar los avisos." : (r.error || "No se pudo mandar. Revisa la conexión e intenta de nuevo.");
    });
    return el("div", { class: "w-full" }, boton, form);
  }
  // Los enlaces que llegan por correo: confirmar los avisos o dejarlos.
  async function enlaceAvisos() {
    const m = location.hash.match(/^#seguir-(ok|baja)=([0-9a-f-]{36})\.([0-9a-f]{20,100})$/);
    if (!m) return false;
    history.replaceState(null, "", location.pathname + location.search);
    const r = m[1] === "ok" ? await PareoPublicar.seguirConfirmar(m[2], m[3]) : await PareoPublicar.seguirBaja(m[2], m[3]);
    if (!r.ok) Avisos.avisar(r.error || "No se pudo. Revisa la conexión e intenta de nuevo.", { tipo: "error" });
    else Avisos.avisar(m[1] === "ok" ? "✓ Avisos confirmados" + (r.nombre ? ": te vamos a escribir cuando " + r.nombre + " juegue." : ".") : "Listo: ya no te vamos a mandar esos avisos.");
    return true;
  }

  // ---------- La ficha de un colegio o club (#c=<nombre>) ----------
  // Sus jugadores, sus torneos, sus podios y su año a año, de los torneos
  // individuales publicados (public.pareo_institucion, con el nombre escrito
  // sin importar tildes ni mayúsculas).
  const enlaceColegio = (nombre) => el("a", { href: "#" + new URLSearchParams({ c: nombre }).toString(), class: C.enlace, "data-colegio": nombre, texto: nombre });
  async function pintarColegio(nombre) {
    const caja = $("tp-contenido");
    $("tp-portada").hidden = true;
    caja.hidden = false;
    caja.replaceChildren(el("p", { class: C.nota, role: "status", texto: "Cargando…" }));
    let d;
    try {
      const r = await window.sb.rpc("pareo_institucion", { p_nombre: nombre });
      if (r.error) throw r.error;
      d = r.data;
    } catch (e) {
      caja.replaceChildren(el("p", { class: C.nota, role: "alert", texto: "No se pudo leer. Revisa la conexión e intenta de nuevo." }));
      return;
    }
    if (leerRuta().c !== nombre) return;
    const volver = el("a", { href: "#", class: C.enlace + " text-sm", texto: "← Todos los torneos" });
    const titulo = el("h1", { id: "tp-titulo", tabindex: "-1", class: "font-serif text-3xl md:text-4xl font-bold text-brand-800 dark:text-white mt-3", texto: d ? d.nombre : nombre });
    if (!d) {
      caja.replaceChildren(volver, titulo, el("p", { id: "tp-colegio-vacio", class: C.nota + " mt-3", role: "status", texto: "No aparece en ningún torneo individual publicado." }));
      titulo.focus();
      return;
    }
    document.title = d.nombre + " — Torneos en Pareo Integral | Ajedrez Integral";
    const fichaDe = (x) => "#" + new URLSearchParams(x.ident ? { p: x.nombre, i: x.ident } : { p: x.nombre }).toString();
    const tabla = (id, titulo2, cabeza, filas) => el("div", { class: "overflow-x-auto" }, el("table", { id, class: "pi-tabla" },
      el("caption", { class: "sr-only", texto: titulo2 }),
      el("thead", {}, el("tr", {}, cabeza.map(([h, num]) => el("th", { scope: "col", class: num ? "num" : null, texto: h })))), el("tbody", {}, filas)));
    const h2 = (texto) => el("h2", { class: "font-serif text-2xl font-bold text-brand-800 dark:text-white mt-6 mb-2", texto });
    caja.replaceChildren(volver, titulo,
      el("p", { id: "tp-colegio-resumen", class: C.nota + " mt-1", texto: [d.jugadores.length + (d.jugadores.length === 1 ? " jugador" : " jugadores"), d.torneos.length + (d.torneos.length === 1 ? " torneo" : " torneos"), d.podios.length + (d.podios.length === 1 ? " podio" : " podios")].join(" · ") }),
      h2("Año a año"),
      tabla("tp-colegio-anios", "Año a año", [["Año"], ["Torneos", 1], ["Jugadores", 1], ["Podios", 1]], d.anios.map((a) => el("tr", {},
        el("td", { texto: a.anio }), el("td", { class: "num", texto: a.torneos }), el("td", { class: "num", texto: a.jugadores }), el("td", { class: "num", texto: a.podios })))),
      h2("Sus jugadores"),
      tabla("tp-colegio-jugadores", "Sus jugadores", [["Nombre"], ["Torneos", 1], ["Podios", 1], ["Mejor puesto", 1]], d.jugadores.map((x) => el("tr", {},
        el("td", {}, el("a", { href: fichaDe(x), class: C.enlace + " font-semibold", texto: x.nombre })), el("td", { class: "num", texto: x.torneos }),
        el("td", { class: "num", texto: x.podios }), el("td", { class: "num", texto: x.mejor || "—" })))),
      d.podios.length ? h2("Podios") : null,
      d.podios.length ? el("ul", { id: "tp-colegio-podios", class: "space-y-1 text-sm" }, d.podios.map((x) => el("li", {},
        el("span", { class: "font-semibold", texto: ({ 1: "1.º", 2: "2.º", 3: "3.º" })[x.puesto] + " " }), x.nombre, " en ",
        el("a", { href: "#" + new URLSearchParams({ t: x.id, v: "clasificacion" }).toString(), class: C.enlace, texto: x.torneo }), el("span", { class: C.nota, texto: " · " + fechaTexto(x.fecha) })))) : null,
      h2("Sus torneos"),
      tabla("tp-colegio-torneos", "Sus torneos", [["Fecha"], ["Torneo"], ["Sus jugadores", 1], ["Mejor puesto", 1]], d.torneos.map((x) => el("tr", {},
        el("td", { texto: fechaTexto(x.fecha) }), el("td", {}, el("a", { href: "#" + new URLSearchParams({ t: x.id }).toString(), class: C.enlace, texto: x.nombre })),
        el("td", { class: "num", texto: x.cuantos }), el("td", { class: "num", texto: x.mejor ? x.mejor + " de " + x.de : "—" })))),
      el("p", { class: "text-xs text-brand-600 dark:text-brand-300 mt-3", texto: "De los torneos individuales publicados con Pareo Integral donde el colegio o club está escrito así (sin importar tildes ni mayúsculas)." }));
    titulo.focus();
  }

  // ---------- El ranking del año (#ranking=1) ----------
  // Lo arma la base con el resumen de cada jugador en cada torneo
  // (public.pareo_ranking): un jugador es su huella del ID FIDE o, si no la
  // tiene, su nombre.
  const ranking = { anio: 0, orden: "torneos", categoria: "", institucion: "" };
  const ORDEN_RANKING = [["torneos", "Más torneos"], ["podios", "Más podios"], ["rendimiento", "Mejor rendimiento"], ["elo", "Más Elo sumado"]];
  async function pintarRanking(enfocar) {
    const caja = $("tp-contenido");
    $("tp-portada").hidden = true;
    caja.hidden = false;
    if (!ranking.anio) ranking.anio = Number(hoy().slice(0, 4));
    if (!$("tp-ranking")) caja.replaceChildren(el("p", { class: C.nota, role: "status", texto: "Cargando…" }));
    let d;
    try {
      const r = await window.sb.rpc("pareo_ranking", { p_anio: ranking.anio, p_orden: ranking.orden, p_categoria: ranking.categoria, p_institucion: ranking.institucion });
      if (r.error) throw r.error;
      d = r.data || { filas: [], anios: [], categorias: [] };
    } catch (e) {
      caja.replaceChildren(el("p", { class: C.nota, role: "alert", texto: "No se pudo leer el ranking. Revisa la conexión e intenta de nuevo." }));
      return;
    }
    if (!leerRuta().ranking) return;
    document.title = "Ranking del año — Torneos en Pareo Integral | Ajedrez Integral";
    const sel = (id, etiqueta, opciones, valor, cambio) => {
      const s2 = el("select", { id, class: C.campo }, opciones.map(([v, t]) => el("option", { value: String(v), selected: String(v) === String(valor), texto: t })));
      s2.addEventListener("change", () => { cambio(s2.value); pintarRanking(id); });
      return el("label", { class: "text-sm" }, el("span", { class: "block font-semibold mb-1", texto: etiqueta }), s2);
    };
    const anios = [...new Set([ranking.anio, ...(d.anios || [])])].filter(Boolean).sort((a, b) => b - a);
    const colegio = el("input", { id: "tp-rk-colegio", type: "search", autocomplete: "off", value: ranking.institucion, class: C.campo });
    let espera = null;
    colegio.addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(() => { ranking.institucion = colegio.value.trim(); pintarRanking("tp-rk-colegio"); }, 400); });
    const cols = { torneos: "Torneos", podios: "Podios", rendimiento: "Rendimiento", elo: "± Elo" };
    caja.replaceChildren(
      el("a", { href: "#", class: C.enlace + " text-sm", texto: "← Todos los torneos" }),
      el("h1", { id: "tp-titulo", tabindex: "-1", class: "font-serif text-3xl md:text-4xl font-bold text-brand-800 dark:text-white mt-3" }, el("span", { "aria-hidden": "true", texto: "🏆 " }), "Ranking del año"),
      el("div", { id: "tp-ranking", class: "flex flex-wrap items-end gap-3 mt-4 mb-4" },
        sel("tp-rk-anio", "Año", [[0, "Todos los años"], ...anios.map((a) => [a, String(a)])], ranking.anio, (v) => { ranking.anio = Number(v); }),
        sel("tp-rk-orden", "Ordenar por", ORDEN_RANKING, ranking.orden, (v) => { ranking.orden = v; }),
        sel("tp-rk-cat", "Categoría", [["", "Todas"], ...(d.categorias || []).map((c) => [c, c])], ranking.categoria, (v) => { ranking.categoria = v; }),
        el("label", { class: "text-sm" }, el("span", { class: "block font-semibold mb-1", texto: "Colegio o club" }), colegio)),
      el("p", { id: "tp-rk-cuantos", class: C.nota + " mb-2", role: "status", texto: d.filas.length ? (d.filas.length === 100 ? "Los primeros 100." : d.filas.length + (d.filas.length === 1 ? " jugador." : " jugadores.")) : "Nadie todavía con lo que elegiste." }),
      d.filas.length ? el("div", { class: "overflow-x-auto" }, el("table", { id: "tp-rk-tabla", class: "pi-tabla" },
        el("caption", { class: "sr-only", texto: "Ranking: " + ORDEN_RANKING.find(([v]) => v === ranking.orden)[1] }),
        el("thead", {}, el("tr", {}, [["#", 1], ["Nombre"], ["Colegio o club"], ["Torneos", 1], ["Partidas", 1], ["Puntos", 1], ["Podios", 1], ["Rendimiento", 1], ["± Elo", 1]]
          .map(([h, num]) => el("th", { scope: "col", class: (num ? "num" : "") + (cols[ranking.orden] === h ? " font-bold" : ""), texto: h })))),
        el("tbody", {}, d.filas.map((x, i) => el("tr", { "data-persona": x.persona },
          el("td", { class: "num", texto: i + 1 }),
          el("td", {}, el("a", { href: "#" + new URLSearchParams(x.ident ? { p: x.nombre, i: x.ident } : { p: x.nombre }).toString(), class: C.enlace + " font-semibold", texto: x.nombre }),
            x.categoria ? el("span", { class: "block text-xs text-brand-600 dark:text-brand-300", texto: x.categoria }) : null),
          el("td", {}, x.institucion ? enlaceColegio(x.institucion) : ""),
          el("td", { class: "num", texto: x.torneos }), el("td", { class: "num", texto: x.partidas }), el("td", { class: "num", texto: puntosTexto(Number(x.puntos)) }),
          el("td", { class: "num", texto: x.podios }), el("td", { class: "num", texto: x.rp == null ? "—" : x.rp }),
          el("td", { class: "num", texto: x.cambio == null ? "—" : PareoElo.textoCambio(Number(x.cambio)) })))))) : null,
      el("p", { class: "text-xs text-brand-600 dark:text-brand-300 mt-3", texto: "De los torneos individuales publicados con Pareo Integral. El rendimiento es el promedio de sus torneos, pesado por las partidas contra rivales con Elo, y solo cuenta con 9 de esas partidas o más; el ± Elo es la suma de lo que daría FIDE en cada torneo. No es un ranking oficial." }));
    // Al cambiar un filtro, el foco vuelve a ese control (la tabla se volvió a armar).
    (enfocar && $(enfocar) || $("tp-titulo")).focus();
  }

  // ---------- Se están jugando ahora ----------
  async function pintarEnVivo() {
    const caja = $("tp-vivo-caja");
    if (!caja) return;
    const f = filtros(), q = $("tp-buscar") ? $("tp-buscar").value.trim() : "";
    // Buscando o filtrando, la lista de abajo ya muestra lo que coincide.
    if (q || hayFiltro(f)) { caja.hidden = true; return; }
    try {
      const { data, error } = await window.sb.rpc("pareo_lista", { p_parte: "resultados", p_desde: 0, p_cuantos: 20, p_curso: true });
      if (error) throw error;
      const filas = (data && data.filas) || [];
      await cargarOrganizadores(filas.map((x) => x.organizador_id));
      caja.hidden = !filas.length;
      $("tp-vivo").replaceChildren(...filasDelDia(filas, false));
    } catch (e) { caja.hidden = true; }
  }

  // ---------- La página de un organizador (#o=<id>) ----------
  // Su logo, su nombre, el sello y todos sus torneos publicados, por día.
  // Su enlace para compartir pasa por el worker (/o/<id>), como el de un
  // torneo: la vista previa dice su nombre y no la portada.
  function botonCompartirOrg(o) {
    const enlace = SITIO + "/o/" + encodeURIComponent(o.id);
    const b = el("button", { type: "button", id: "tp-org-compartir", class: C.pestana + " bg-white dark:bg-brand-900 inline-flex items-center gap-2" },
      el("span", { "aria-hidden": "true", texto: "🔗" }), "Copiar el enlace de esta página");
    b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(enlace); Avisos.avisar("Enlace copiado."); }
      catch (e) { Avisos.avisar("No se pudo copiar. El enlace es " + enlace, { tipo: "error" }); }
    });
    return b;
  }
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
      el("div", { class: "mb-6 flex flex-wrap items-start gap-2" }, botonCompartirOrg(o), cajaSuscribir(o.id, "tp-org-suscribir")),
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
    await cargarExternos();
    if (ruta.p && !ruta.t) { abierto = null; await pintarFichaJugador(ruta); return; }
    if (ruta.c && !ruta.t) { abierto = null; await pintarColegio(ruta.c); return; }
    if (ruta.ranking && !ruta.t) { abierto = null; await pintarRanking(); return; }
    if (!ruta.t) {
      abierto = null;
      document.title = "Torneos en Pareo Integral | Ajedrez Integral";
      if (!resumen) {
        $("tp-cuantos").textContent = "Cargando…";
        try {
          const { data, error } = await window.sb.rpc("pareo_lista_resumen");
          if (error) throw error;
          resumen = data || { total: 0, lugares: [] };
          pintarLugares();
          await cargarLista();
        } catch (e) { resumen = null; $("tp-cuantos").textContent = "No se pudo leer la lista. Revisa la conexión e intenta de nuevo."; return; }
      }
      pintarLugares();
      pintarLista();
      pintarSeguidosPortada();
      pintarEnVivo();
      return;
    }
    await pintarTorneo(ruta, false);
    refresco = setInterval(() => {
      if (document.visibilityState === "visible" && leerRuta().t === ruta.t) pintarTorneo(leerRuta(), true);
    }, REFRESCO_MS);
  }

  $("tp-buscar").addEventListener("input", buscarLuego);
  for (const id of ["tp-f-ritmo", "tp-f-lugar", "tp-f-elo", "tp-f-abierta", "tp-f-curso", "tp-f-verificado"]) $(id).addEventListener("change", recargar);
  $("tp-f-quitar").addEventListener("click", () => {
    for (const id of ["tp-f-ritmo", "tp-f-lugar", "tp-f-elo"]) $(id).value = "";
    for (const id of ["tp-f-abierta", "tp-f-curso", "tp-f-verificado"]) $(id).checked = false;
    recargar();
    $("tp-f-ritmo").focus();
  });
  $("tp-externos-calendario").addEventListener("click", () => externosAlCalendario(externosVisibles));
  $("tp-suscribir").append(cajaSuscribir(null, "tp-suscribir-caja"));
  window.addEventListener("hashchange", pintar);
  enlaceAvisos().then(pintar);
})();
