/* El código de metropolitano-2026.html: toda la información del XLVII Torneo
 * Internacional Metropolitano 2026 en una página, como la del Centroamericano,
 * en español, inglés y francés.
 *
 * Todo lo que es del torneo (categorías, ritmos, horarios, premios, costos)
 * sale de js/metropolitano-reglas.js, la misma copia que usa la inscripción:
 * si la FCA cambia una cifra, se cambia ahí y cambia en las dos.
 *
 * El idioma: lo escrito en el HTML lo cambia js/idioma-pagina.js con los mapas
 * de js/metropolitano-en.js y js/metropolitano-fr.js. Lo que se arma aquí con
 * datos (las tablas, las fechas, la cuenta regresiva) va marcado
 * `data-no-traducir` y se vuelve a pintar en el idioma nuevo con sus textos
 * (`TX`: el español aquí; el inglés y el francés en `dinamico` de esos dos
 * archivos), y las fechas con el formato de cada idioma.
 *
 * Los resultados (chess-results) y las partidas en vivo (Lichess) salen de la
 * ficha del torneo en «Torneos» (tabla salas_torneo, clave
 * «metropolitano-2026», que edita quien administra en admin.html#torneos):
 * mientras no tenga esos enlaces, resultados dice «Pronto» y partidas queda
 * abajo, con su candado, como «Pendiente».
 *
 * Ver «La página del Metropolitano 2026» en docs/decisiones/cuentas-y-formularios.md.
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const R = window.MetropolitanoReglas;
  const H = window.HoraCR;
  const CLAVE_SALA = "metropolitano-2026";
  const LUGAR = "Estadio Nacional de Costa Rica, La Sabana, San José";
  const LOCALES = { es: "es-CR", en: "en-US", fr: "fr-FR" };
  const el = (tag, clase, texto) => { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; };
  const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /* ===================== Los textos que se arman con datos ===================== */
  const TX = {
    es: {
      plazo: { cerro: "La inscripción ya cerró.", clasicos: "Los clásicos ya cerraron; el blitz se recibe hasta el 26 de diciembre.",
        recargo: "Inscripción tardía, con el 30 % de recargo en los clásicos, hasta el 20 de diciembre.",
        regular: "La inscripción regular cierra el 16 de diciembre; del 17 al 20, con el 30 % de recargo.", boton: "La inscripción cerró" },
      quien: { A: "1900 o más de Elo FIDE estándar", B: "menos de 1900 de Elo FIDE estándar, o sin Elo", U14: "nacidos desde el 1 de enero de 2012", BLITZ: "abierto a todos (30 de diciembre, 16:00)" },
      ritmo: "Ritmo: ", quienJuega: (q) => "Quién juega: " + q + ".",
      columnas: ["Ronda", "Día", "Hora"], horarioDel: (n) => "Horario del " + n,
      ronda: (n) => "Ronda " + n, blitz: "Blitz", todo: "Todo el torneo",
      ics: { resumen: (t, r) => t + ": " + r, descripcion: (ritmo, blitz) => "XLVII Torneo Internacional Metropolitano 2026 (FCA). Ritmo: " + ritmo + ". Tiempo de espera: " + (blitz ? "3 minutos." : "30 minutos.") },
      hoy: { casillas: ["días", "horas", "min", "seg"], termino: "El Metropolitano 2026 terminó. ¡Gracias por jugar!", terminoCorto: "El torneo terminó.",
        nombreRonda: (r, T) => (r.torneo === "BLITZ" ? "el Metropolitano Blitz" : "la ronda " + r.numero + " del " + T.corto), y: " y ",
        proximo: (n, cuando) => "Lo próximo: " + n + " — " + cuando + ".",
        faltan: (d, h, m) => "Faltan " + (d ? d + (d === 1 ? " día, " : " días, ") : "") + h + (h === 1 ? " hora y " : " horas y ") + m + (m === 1 ? " minuto." : " minutos.") },
      costos: { columnas: ["Torneo", "Transferencia o SINPE", "En colones", "PayPal", "Del 17 al 20 de diciembre"], sinRecargo: "Igual: el blitz no lleva recargo",
        notas: (R) => [
          "La inscripción regular cierra el 16 de diciembre. Del 17 al 20, los clásicos llevan el 30 % de recargo; el blitz se recibe hasta el 26.",
          "Los mayores de " + R.EDAD_SENIOR + " (nacidos en " + (R.ANIO_TORNEO - R.EDAD_SENIOR) + " o antes) tienen un 10 % de descuento en los clásicos. No aplica en el blitz.",
          "Los GM, IM y WGM no pagan inscripción (tampoco el blitz) y reciben hospedaje y alimentación.",
          "En colones, a ₡" + R.TIPO_CAMBIO + " por dólar. La comisión de la transferencia o de PayPal la cubre quien se inscribe.",
          "Con factura electrónica se suma el 13 % de IVA, que asume quien se inscribe.",
          "Los entrenadores, acompañantes y delegados se inscriben sin costo; el hospedaje y la alimentación se piden en la inscripción y la organización confirma su costo.",
        ],
        moneda: { CRC: " (colones)", USD: " (dólares)" } },
      metodos: {}, datos: {},
      premiosDel: (n) => "Premios del " + n, premios: {},
      vivo: { resultados: "Resultados en vivo", textoRes: "Emparejamientos, resultados y clasificación de cada ronda en chess-results.",
        textoResPronto: "Los emparejamientos y la clasificación de cada ronda, en chess-results.", abrirRes: "Abrir chess-results →", elegir: "Elegir la categoría →",
        pronto: "Pronto: se publican cuando la FCA cree los torneos",
        partidas: "Partidas en vivo", textoPartidas: "La transmisión de los tableros en directo, jugada a jugada, en Lichess.", verPartidas: "Ver las partidas →",
        textoPartidasPendiente: "La transmisión de los tableros en directo, jugada a jugada, para seguir las partidas desde aquí.",
        pendiente: "Pendiente", todavia: "Todavía no está habilitado", cerrar: "Cerrar" },
    },
  };
  TX.en = Object.assign({}, TX.es, (window.MetropolitanoEN && window.MetropolitanoEN.dinamico) || {});
  TX.fr = Object.assign({}, TX.es, (window.MetropolitanoFR && window.MetropolitanoFR.dinamico) || {});

  let idioma = "es";
  const t = () => TX[idioma] || TX.es;
  // Las fechas, en hora de Costa Rica y con el formato del idioma de la página.
  const fechaLarga = (iso) => (idioma === "es" ? H.fecha(iso, { weekday: "long", day: "numeric", month: "long" })
    : new Date(iso).toLocaleDateString(LOCALES[idioma], { weekday: "long", day: "numeric", month: "long", timeZone: "America/Costa_Rica" }));
  const horaDe = (iso) => (idioma === "es" ? H.hora(iso, { hour: "numeric", minute: "2-digit" })
    : new Date(iso).toLocaleTimeString(LOCALES[idioma], { hour: "numeric", minute: "2-digit", timeZone: "America/Costa_Rica" }));
  const nombreRonda = (r) => (r.torneo === "BLITZ" ? t().blitz : t().ronda(r.numero));
  // Lo que se pinta aquí no lo toca el traductor del HTML.
  const DINAMICOS = ["plazo", "categorias-lista", "calendario-tablas", "cal-torneo", "hoy-principal", "hoy-cifras", "hoy-texto",
    "costos-tabla", "costos-notas", "costos-metodos", "premios-tablas", "ficha-resultados", "ficha-partidas", "ficha-mi-ronda", "ficha-hospedaje", "paseos-lista"];
  DINAMICOS.forEach((id) => { const e = $(id); if (e) e.setAttribute("data-no-traducir", ""); });

  /* ===================== Las ventanas (con su dirección #) ===================== */
  // Abrir una ventana deja una entrada en el historial: el botón «Atrás» del
  // celular la cierra, en vez de sacar a la persona de la página.
  function abrir(id) {
    const d = $(id);
    if (!d || d.tagName !== "DIALOG") return false;
    if (!d.open) d.showModal();
    return true;
  }
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest('a[href^="#"]');
    if (a && abrir(a.getAttribute("href").slice(1))) {
      ev.preventDefault();
      const id = a.getAttribute("href").slice(1);
      if (!(history.state && history.state.metroVentana === id)) history.pushState({ metroVentana: id }, "", "#" + id);
    }
    const c = ev.target.closest("[data-cerrar]");
    if (c) c.closest("dialog").close();
  });
  function alCerrar(d) {
    if (history.state && history.state.metroVentana === d.id) history.back();
    else if (location.hash === "#" + d.id) history.replaceState(null, "", location.pathname + location.search);
  }
  document.addEventListener("close", (ev) => { const d = ev.target; if (d.tagName === "DIALOG" && d.classList.contains("metro-ventana")) alCerrar(d); }, true);
  document.addEventListener("click", (ev) => { const d = ev.target; if (d.tagName === "DIALOG" && d.classList.contains("metro-ventana") && d.open) d.close(); });
  window.addEventListener("popstate", () => {
    const quedan = history.state && history.state.metroVentana;
    document.querySelectorAll("dialog.metro-ventana[open]").forEach((d) => { if (d.id !== quedan) d.close(); });
  });

  /* ===================== El plazo de inscripción ===================== */
  const plazo = R.abierto(H.hoy());
  function pintarPlazo() {
    const P = t().plazo;
    $("plazo").textContent = !plazo.blitz ? P.cerro : !plazo.clasicos ? P.clasicos : plazo.recargo ? P.recargo : P.regular;
    if (!plazo.blitz) {
      const b = $("boton-inscribirme");
      b.removeAttribute("href"); b.setAttribute("aria-disabled", "true"); b.setAttribute("data-no-traducir", ""); b.textContent = P.boton;
    }
  }

  /* ===================== Categorías ===================== */
  function pintarCategorias() {
    const caja = $("categorias-lista"); caja.textContent = "";
    for (const [k, T] of Object.entries(R.TORNEOS)) {
      const c = el("div", "metro-caja");
      c.style.borderLeft = ".4rem solid " + T.color;
      c.append(el("h3", "", T.nombre), el("p", "font-semibold", t().ritmo + T.ritmo), el("p", "", t().quienJuega(t().quien[k] || T.quien)));
      caja.append(c);
    }
  }

  /* ===================== Calendario ===================== */
  const todas = Object.keys(R.TORNEOS).flatMap((k) => R.rondas(k));
  function pintarCalendario() {
    const caja = $("calendario-tablas"); caja.textContent = "";
    for (const [k, T] of Object.entries(R.TORNEOS)) {
      const c = el("div", "metro-caja");
      c.append(el("h3", "", T.nombre));
      const tabla = el("table", "w-full text-sm");
      tabla.append(el("caption", "sr-only", t().horarioDel(T.nombre)));
      const cab = el("tr"); t().columnas.forEach((x) => { const th = el("th", "text-left py-1 pr-2", x); th.scope = "col"; cab.append(th); });
      const thead = el("thead"); thead.append(cab); tabla.append(thead);
      const tb = el("tbody");
      R.rondas(k).forEach((r) => {
        const tr = el("tr", "border-t border-brand-100 dark:border-brand-800");
        const th = el("th", "text-left py-1 pr-2 font-semibold whitespace-nowrap", nombreRonda(r)); th.scope = "row";
        tr.append(th, el("td", "py-1 pr-2", fechaLarga(r.inicio)), el("td", "py-1 whitespace-nowrap", horaDe(r.inicio)));
        tb.append(tr);
      });
      tabla.append(tb); c.append(tabla);
      caja.append(c);
    }
    const sel = $("cal-torneo"), antes = sel.value;
    sel.textContent = "";
    [["", t().todo], ...Object.entries(R.TORNEOS).map(([k, T]) => [k, T.nombre])].forEach(([v, x]) => { const o = el("option", "", x); o.value = v; sel.append(o); });
    sel.value = antes || "";
  }
  function bajarCalendario(torneo) {
    const lista = torneo ? R.rondas(torneo) : todas;
    const I = t().ics;
    const eventos = lista.map((r) => ({
      uid: "metropolitano-2026-" + r.torneo.toLowerCase() + "-" + r.numero + "@ajedrez-integral.com",
      inicio: r.inicio, fin: r.fin, resumen: I.resumen(R.TORNEOS[r.torneo].nombre, nombreRonda(r)), lugar: LUGAR,
      url: "https://ajedrez-integral.com/metropolitano-2026.html", aviso: "-PT30M",
      descripcion: I.descripcion(R.TORNEOS[r.torneo].ritmo, r.torneo === "BLITZ"),
    }));
    const { texto } = window.CalendarioIcs.armarHoras({ nombre: "Metropolitano 2026" + (torneo ? " · " + R.TORNEOS[torneo].nombre : ""), eventos });
    window.CalendarioIcs.bajar(texto, "metropolitano-2026" + (torneo ? "-" + torneo.toLowerCase() : "") + ".ics");
  }
  $("cal-bajar").addEventListener("click", () => bajarCalendario($("cal-torneo").value));
  $("hoy-ics").addEventListener("click", () => bajarCalendario(""));

  /* ===================== Hoy en el torneo: la cuenta regresiva ===================== */
  const porInicio = [...todas].sort((a, b) => a.inicio.localeCompare(b.inicio));
  function proxima(ahora) {
    const ms = ahora.getTime();
    const sig = porInicio.find((r) => new Date(r.inicio).getTime() > ms);
    if (!sig) return null;
    // Las rondas que empiezan a la misma hora van juntas («la ronda 1 del A y del U14»).
    return { inicio: sig.inicio, rondas: porInicio.filter((r) => r.inicio === sig.inicio) };
  }
  const cifras = $("hoy-cifras");
  let casillas = [];
  function armarCifras() {
    cifras.textContent = "";
    casillas = t().hoy.casillas.map((n) => { const c = el("div", "metro-cifra"); const b = el("b", "", "0"); c.append(b, el("span", "", n)); cifras.append(c); return b; });
  }
  let ultimoMinuto = null;
  function pintarHoy() {
    const ahora = new Date();
    const p = proxima(ahora);
    const T = t().hoy;
    if (!p) {
      $("hoy-principal").textContent = T.termino;
      cifras.hidden = true; $("hoy-texto").textContent = T.terminoCorto;
      return;
    }
    const nombres = p.rondas.map((r) => T.nombreRonda(r, R.TORNEOS[r.torneo])).join(T.y);
    const cuando = fechaLarga(p.inicio) + ", " + horaDe(p.inicio);
    $("hoy-principal").textContent = T.proximo(mayuscula(nombres), cuando.replace(/\.$/, ""));
    let s = Math.max(0, Math.floor((new Date(p.inicio) - ahora) / 1000));
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    [d, h, m, s].forEach((v, i) => { casillas[i].textContent = String(v).padStart(i ? 2 : 1, "0"); });
    // El lector de pantalla oye una frase por minuto, no cada segundo.
    const minuto = idioma + "-" + d + "-" + h + "-" + m;
    if (minuto !== ultimoMinuto) { ultimoMinuto = minuto; $("hoy-texto").textContent = T.faltan(d, h, m); }
  }

  /* ===================== Costos y pago ===================== */
  function pintarCostos() {
    const C = t().costos;
    const tabla = $("costos-tabla"); tabla.textContent = "";
    const cab = el("tr");
    C.columnas.forEach((x) => { const th = el("th", "py-2 pr-3 align-bottom", x); th.scope = "col"; cab.append(th); });
    const thead = el("thead"); thead.append(cab); tabla.append(thead);
    const tb = el("tbody");
    for (const T of Object.values(R.TORNEOS)) {
      const tr = el("tr", "border-t border-brand-100 dark:border-brand-800");
      const th = el("th", "py-2 pr-3 font-semibold", T.nombre); th.scope = "row";
      const tarde = T.clasico ? R.dinero(Math.round(T.usd * (1 + R.RECARGO) * 100) / 100) + " (PayPal " + R.dinero(Math.round(T.paypal * (1 + R.RECARGO) * 100) / 100) + ")" : C.sinRecargo;
      tr.append(th, el("td", "py-2 pr-3", R.dinero(T.usd)), el("td", "py-2 pr-3", R.colones(Math.round(T.usd * R.TIPO_CAMBIO))), el("td", "py-2 pr-3", R.dinero(T.paypal)), el("td", "py-2", tarde));
      tb.append(tr);
    }
    tabla.append(tb);
    const notas = $("costos-notas"); notas.textContent = "";
    C.notas(R).forEach((x) => notas.append(el("li", "", x)));
    const metodos = $("costos-metodos"); metodos.textContent = "";
    for (const [k, M] of Object.entries(R.METODOS)) {
      const c = el("div", "metro-caja");
      c.append(el("h3", "", (t().metodos[k] || M.nombre) + C.moneda[M.moneda]));
      // Las etiquetas («Cuenta:», «A nombre de:») en el idioma; los números, tal cual.
      const ul = el("ul", "space-y-0.5");
      M.datos.forEach((x) => {
        let y = x;
        for (const [es, otro] of Object.entries(t().datos)) if (y.indexOf(es) === 0) { y = otro + y.slice(es.length); break; }
        ul.append(el("li", "", y));
      });
      c.append(ul);
      metodos.append(c);
    }
  }

  /* ===================== Premios ===================== */
  function pintarPremios() {
    const caja = $("premios-tablas"); caja.textContent = "";
    for (const [k, lista] of Object.entries(R.PREMIOS)) {
      const c = el("div", "metro-caja");
      c.style.borderLeft = ".4rem solid " + R.TORNEOS[k].color;
      c.append(el("h3", "", R.TORNEOS[k].nombre));
      const tabla = el("table", "w-full text-sm");
      tabla.append(el("caption", "sr-only", t().premiosDel(R.TORNEOS[k].nombre)));
      const tb = el("tbody");
      lista.forEach(([n, usd]) => {
        const tr = el("tr", "border-t border-brand-100 dark:border-brand-800");
        const th = el("th", "text-left py-1 pr-2 font-normal", t().premios[n] || n); th.scope = "row";
        tr.append(th, el("td", "py-1 text-right font-semibold", R.dinero(usd)));
        tb.append(tr);
      });
      tabla.append(tb); c.append(tabla);
      caja.append(c);
    }
  }

  /* ===================== Resultados y partidas en vivo (de «Torneos») ===================== */
  // Lo de afuera (chess-results, Lichess) se abre en la ventanita de
  // js/visor-documento.js, encima de esta página: nadie se va de aquí.
  function ficha(caja, { href, titulo, texto, accion, emoji, tono, visor, pendiente }) {
    caja.textContent = "";
    const a = el(href ? "a" : "div", "metro-ficha");
    a.dataset.tono = tono;
    if (href) { a.href = href; if (visor) a.dataset.visor = visor; }
    else { a.tabIndex = 0; a.setAttribute("aria-disabled", "true"); }
    if (pendiente) {
      const p = el("span", "metro-ficha-pendiente"); const c = el("span", "", "🔒"); c.setAttribute("aria-hidden", "true");
      p.append(c, " " + t().vivo.pendiente); a.append(p);
    }
    const e = el("span", "metro-ficha-emoji", emoji); e.setAttribute("aria-hidden", "true");
    a.append(e, el("span", "metro-ficha-titulo", titulo), el("span", "metro-ficha-texto", texto), el("span", "metro-ficha-accion", accion));
    caja.append(a);
  }
  let enlaces = [];
  function pintarEnVivo() {
    const V = t().vivo;
    const res = enlaces.filter((e) => /chess-results\.com/i.test(e.url));
    const vivo = enlaces.find((e) => /lichess\.org\/broadcast/i.test(e.url));
    ficha($("ficha-resultados"), res.length
      ? { href: res.length === 1 ? res[0].url : "#resultados", visor: res.length === 1 ? (res[0].texto || V.resultados) : "", titulo: V.resultados, emoji: "📊", tono: 3,
        texto: V.textoRes, accion: res.length === 1 ? V.abrirRes : V.elegir }
      : { titulo: V.resultados, emoji: "📊", tono: 3, texto: V.textoResPronto, accion: V.pronto });
    ficha($("ficha-partidas"), vivo
      ? { href: vivo.url, visor: V.partidas, titulo: V.partidas, emoji: "📺", tono: 5, texto: V.textoPartidas, accion: V.verPartidas }
      : { titulo: V.partidas, emoji: "📺", tono: 5, texto: V.textoPartidasPendiente, accion: V.todavia, pendiente: true });
    if (res.length > 1) {
      // Varias categorías en chess-results: una ventana para elegir.
      let d = $("resultados");
      if (!d) {
        d = el("dialog", "metro-ventana"); d.id = "resultados"; d.setAttribute("aria-labelledby", "resultados-titulo"); d.setAttribute("data-no-traducir", "");
        const cab = el("div", "metro-ventana-cabeza"); const h2 = el("h2"); h2.id = "resultados-titulo";
        const b = el("button", "metro-boton"); b.type = "button"; b.dataset.cerrar = ""; b.id = "resultados-cerrar";
        cab.append(h2, b);
        const cu = el("div", "metro-ventana-cuerpo"); const ul = el("ul", "grid sm:grid-cols-2 gap-2"); ul.id = "resultados-lista"; cu.append(ul);
        d.append(cab, cu); document.querySelector("main").append(d);
      }
      $("resultados-titulo").textContent = "📊 " + V.resultados;
      $("resultados-cerrar").textContent = V.cerrar;
      const ul = $("resultados-lista"); ul.textContent = "";
      res.forEach((e) => { const li = el("li"); const a = el("a", "metro-boton block", e.texto || e.url); a.href = e.url; a.dataset.visor = e.texto || V.resultados; li.append(a); ul.append(li); });
    }
  }

  /* ===================== Todo, en el idioma de la página ===================== */
  function pintarTodo() {
    pintarPlazo(); pintarCategorias(); pintarCalendario(); armarCifras(); ultimoMinuto = null; pintarHoy();
    pintarCostos(); pintarPremios(); pintarEnVivo();
    if (window.PaseosSabana && $("paseos-lista")) window.PaseosSabana.pintar($("paseos-lista"), idioma);
    if (window.MetroMiRonda) window.MetroMiRonda.pintar(idioma, $("ficha-mi-ronda"));
    if (window.MetropolitanoHospedaje) window.MetropolitanoHospedaje.pintarPagina(idioma, $("ficha-hospedaje"));
  }
  const idiomas = window.IdiomaPagina.iniciar({
    mapas: { en: (window.MetropolitanoEN && window.MetropolitanoEN.textos) || {}, fr: (window.MetropolitanoFR && window.MetropolitanoFR.textos) || {} },
    titulos: { en: window.MetropolitanoEN && window.MetropolitanoEN.titulo, fr: window.MetropolitanoFR && window.MetropolitanoFR.titulo },
    clave: "metro_idioma_v1", boton: "metro-idioma", menu: "metro-idiomas",
    alCambiar: (nuevo) => { idioma = nuevo; pintarTodo(); },
  });
  idioma = idiomas.idioma();
  pintarTodo();
  setInterval(pintarHoy, 1000);

  (async () => {
    try {
      const sala = await window.SalasTorneo.porClave(CLAVE_SALA);
      if (sala && Array.isArray(sala.enlaces)) { enlaces = sala.enlaces.filter((e) => e && typeof e.url === "string"); pintarEnVivo(); }
    } catch (e) { /* sin la base, quedan en «Pronto» */ }
    if (location.hash) abrirPorDireccion(location.hash.slice(1));
  })();

  // Desde la tarjeta de «Torneos» (js/salas-torneo.js, PORTADAS) se llega con
  // #bases o #resultados: se abren encima, como con su ficha.
  // Y el QR del gafete, con #mi-ronda=<nombre> (js/metropolitano-mi-ronda.js).
  function abrirPorDireccion(id) {
    if (window.MetroMiRonda && window.MetroMiRonda.deDireccion(id)) return;
    if (abrir(id)) return;
    if (id === "bases") { const a = document.querySelector("#fichas a[data-visor][href$='.pdf']"); if (a) a.click(); }
    else if (id === "resultados") { const a = document.querySelector("#ficha-resultados a"); if (a) a.click(); }
  }
})();
