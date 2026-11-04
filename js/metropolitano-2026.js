/* El código de metropolitano-2026.html: toda la información del XLVII Torneo
 * Internacional Metropolitano 2026 en una página, como la del Centroamericano.
 *
 * Todo lo que es del torneo (categorías, ritmos, horarios, premios, costos)
 * sale de js/metropolitano-reglas.js, la misma copia que usa la inscripción:
 * si la FCA cambia una cifra, se cambia ahí y cambia en las dos.
 *
 * Los resultados (chess-results) y las partidas en vivo (Lichess) salen de la
 * ficha del torneo en «Torneos» (tabla salas_torneo, clave
 * «metropolitano-2026», que edita quien administra en admin.html#torneos):
 * mientras no tenga esos enlaces, sus fichas dicen «Pronto».
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
  const el = (tag, clase, texto) => { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; };
  const fechaLarga = (iso) => H.fecha(iso, { weekday: "long", day: "numeric", month: "long" });
  const horaDe = (iso) => H.hora(iso, { hour: "numeric", minute: "2-digit" });

  /* ===================== Las ventanas (con su dirección #) ===================== */
  function abrir(id) {
    const d = $(id);
    if (!d || d.tagName !== "DIALOG") return false;
    if (!d.open) d.showModal();
    return true;
  }
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest('a[href^="#"]');
    if (a && abrir(a.getAttribute("href").slice(1))) { ev.preventDefault(); history.replaceState(null, "", a.getAttribute("href")); }
    const c = ev.target.closest("[data-cerrar]");
    if (c) c.closest("dialog").close();
  });
  document.querySelectorAll("dialog").forEach((d) => {
    d.addEventListener("close", () => { if (location.hash === "#" + d.id) history.replaceState(null, "", location.pathname); });
    // Tocar fuera de la ventana la cierra.
    d.addEventListener("click", (ev) => { if (ev.target === d) d.close(); });
  });

  /* ===================== El plazo de inscripción ===================== */
  const hoy = H.hoy();
  const plazo = R.abierto(hoy);
  $("plazo").textContent = !plazo.blitz ? "La inscripción ya cerró."
    : !plazo.clasicos ? "Los clásicos ya cerraron; el blitz se recibe hasta el 26 de diciembre."
      : plazo.recargo ? "Inscripción tardía, con el 30 % de recargo en los clásicos, hasta el 20 de diciembre."
        : "La inscripción regular cierra el 16 de diciembre; del 17 al 20, con el 30 % de recargo.";
  if (!plazo.blitz) { $("boton-inscribirme").removeAttribute("href"); $("boton-inscribirme").setAttribute("aria-disabled", "true"); $("boton-inscribirme").textContent = "La inscripción cerró"; }

  /* ===================== Categorías ===================== */
  for (const [k, T] of Object.entries(R.TORNEOS)) {
    const c = el("div", "metro-caja");
    c.style.borderLeft = ".4rem solid " + T.color;
    c.append(el("h3", "", T.nombre), el("p", "font-semibold", "Ritmo: " + T.ritmo), el("p", "", "Quién juega: " + T.quien + "."));
    $("categorias-lista").append(c);
  }

  /* ===================== Calendario ===================== */
  const todas = Object.keys(R.TORNEOS).flatMap((t) => R.rondas(t));
  for (const [k, T] of Object.entries(R.TORNEOS)) {
    const caja = el("div", "metro-caja");
    caja.append(el("h3", "", T.nombre));
    const tabla = el("table", "w-full text-sm");
    const cap = el("caption", "sr-only", "Horario del " + T.nombre); tabla.append(cap);
    const cab = el("tr"); ["Ronda", "Día", "Hora"].forEach((x) => { const th = el("th", "text-left py-1 pr-2", x); th.scope = "col"; cab.append(th); });
    const thead = el("thead"); thead.append(cab); tabla.append(thead);
    const tb = el("tbody");
    R.rondas(k).forEach((r) => {
      const tr = el("tr", "border-t border-brand-100 dark:border-brand-800");
      const th = el("th", "text-left py-1 pr-2 font-semibold whitespace-nowrap", r.nombre); th.scope = "row";
      tr.append(th, el("td", "py-1 pr-2", fechaLarga(r.inicio)), el("td", "py-1 whitespace-nowrap", horaDe(r.inicio)));
      tb.append(tr);
    });
    tabla.append(tb); caja.append(tabla);
    $("calendario-tablas").append(caja);
  }
  const selCal = $("cal-torneo");
  [["", "Todo el torneo"], ...Object.entries(R.TORNEOS).map(([k, T]) => [k, T.nombre])].forEach(([v, t]) => { const o = el("option", "", t); o.value = v; selCal.append(o); });
  function bajarCalendario(torneo) {
    const lista = torneo ? R.rondas(torneo) : todas;
    const eventos = lista.map((r) => ({
      uid: "metropolitano-2026-" + r.torneo.toLowerCase() + "-" + r.numero + "@ajedrez-integral.com",
      inicio: r.inicio, fin: r.fin, resumen: R.TORNEOS[r.torneo].nombre + ": " + r.nombre, lugar: LUGAR,
      url: "https://ajedrez-integral.com/metropolitano-2026.html", aviso: "-PT30M",
      descripcion: "XLVII Torneo Internacional Metropolitano 2026 (FCA). Ritmo: " + R.TORNEOS[r.torneo].ritmo + ". Tiempo de espera: " + (r.torneo === "BLITZ" ? "3 minutos." : "30 minutos."),
    }));
    const { texto } = window.CalendarioIcs.armarHoras({ nombre: "Metropolitano 2026" + (torneo ? " · " + R.TORNEOS[torneo].nombre : ""), eventos });
    window.CalendarioIcs.bajar(texto, "metropolitano-2026" + (torneo ? "-" + torneo.toLowerCase() : "") + ".ics");
  }
  $("cal-bajar").addEventListener("click", () => bajarCalendario(selCal.value));
  $("hoy-ics").addEventListener("click", () => bajarCalendario(""));

  /* ===================== Hoy en el torneo: la cuenta regresiva ===================== */
  const porInicio = [...todas].sort((a, b) => a.inicio.localeCompare(b.inicio));
  function proxima(ahora) {
    const t = ahora.getTime();
    const sig = porInicio.find((r) => new Date(r.inicio).getTime() > t);
    if (!sig) return null;
    // Las rondas que empiezan a la misma hora van juntas («Ronda 1 del A y del U14»).
    const juntas = porInicio.filter((r) => r.inicio === sig.inicio);
    return { inicio: sig.inicio, rondas: juntas };
  }
  const cifras = $("hoy-cifras");
  const casillas = ["días", "horas", "min", "seg"].map((n) => { const c = el("div", "metro-cifra"); const b = el("b", "", "0"); c.append(b, el("span", "", n)); cifras.append(c); return b; });
  let ultimoMinuto = null;
  function pintarHoy() {
    const ahora = new Date();
    const p = proxima(ahora);
    if (!p) {
      $("hoy-principal").textContent = "El Metropolitano 2026 terminó. ¡Gracias por jugar!";
      cifras.hidden = true; $("hoy-texto").textContent = "El torneo terminó.";
      return;
    }
    const nombres = p.rondas.map((r) => (r.torneo === "BLITZ" ? "el Metropolitano Blitz" : r.nombre.toLowerCase() + " del " + R.TORNEOS[r.torneo].corto)).join(" y ");
    const cuando = fechaLarga(p.inicio) + ", " + horaDe(p.inicio);
    $("hoy-principal").textContent = "Lo próximo: " + nombres.charAt(0).toUpperCase() + nombres.slice(1) + " — " + cuando + (cuando.endsWith(".") ? "" : ".");
    let s = Math.max(0, Math.floor((new Date(p.inicio) - ahora) / 1000));
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    [d, h, m, s].forEach((v, i) => { casillas[i].textContent = String(v).padStart(i ? 2 : 1, "0"); });
    // El lector de pantalla oye una frase por minuto, no cada segundo.
    const minuto = d + "-" + h + "-" + m;
    if (minuto !== ultimoMinuto) {
      ultimoMinuto = minuto;
      $("hoy-texto").textContent = "Faltan " + (d ? d + (d === 1 ? " día, " : " días, ") : "") + h + (h === 1 ? " hora y " : " horas y ") + m + (m === 1 ? " minuto." : " minutos.");
    }
  }
  pintarHoy();
  setInterval(pintarHoy, 1000);

  /* ===================== Costos y pago ===================== */
  (function costos() {
    const t = $("costos-tabla");
    const cab = el("tr");
    ["Torneo", "Transferencia o SINPE", "En colones", "PayPal", "Del 17 al 20 de diciembre"].forEach((x) => { const th = el("th", "py-2 pr-3 align-bottom", x); th.scope = "col"; cab.append(th); });
    const thead = el("thead"); thead.append(cab); t.append(thead);
    const tb = el("tbody");
    for (const [k, T] of Object.entries(R.TORNEOS)) {
      const tr = el("tr", "border-t border-brand-100 dark:border-brand-800");
      const th = el("th", "py-2 pr-3 font-semibold", T.nombre); th.scope = "row";
      const tarde = T.clasico ? R.dinero(Math.round(T.usd * (1 + R.RECARGO) * 100) / 100) + " (PayPal " + R.dinero(Math.round(T.paypal * (1 + R.RECARGO) * 100) / 100) + ")" : "Igual: el blitz no lleva recargo";
      tr.append(th, el("td", "py-2 pr-3", R.dinero(T.usd)), el("td", "py-2 pr-3", R.colones(Math.round(T.usd * R.TIPO_CAMBIO))), el("td", "py-2 pr-3", R.dinero(T.paypal)), el("td", "py-2", tarde));
      tb.append(tr);
    }
    t.append(tb);
    [
      "La inscripción regular cierra el 16 de diciembre. Del 17 al 20, los clásicos llevan el 30 % de recargo; el blitz se recibe hasta el 26.",
      "Los mayores de " + R.EDAD_SENIOR + " (nacidos en " + (R.ANIO_TORNEO - R.EDAD_SENIOR) + " o antes) tienen un 10 % de descuento en los clásicos. No aplica en el blitz.",
      "Los GM, IM y WGM no pagan inscripción (tampoco el blitz) y reciben hospedaje y alimentación.",
      "En colones, a ₡" + R.TIPO_CAMBIO + " por dólar. La comisión de la transferencia o de PayPal la cubre quien se inscribe.",
      "Con factura electrónica se suma el 13 % de IVA, que asume quien se inscribe.",
      "Los entrenadores, acompañantes y delegados se inscriben sin costo; el hospedaje y la alimentación se piden en la inscripción y la organización confirma su costo.",
    ].forEach((x) => $("costos-notas").append(el("li", "", x)));
    for (const M of Object.values(R.METODOS)) {
      const c = el("div", "metro-caja");
      c.append(el("h3", "", M.nombre + (M.moneda === "CRC" ? " (colones)" : " (dólares)")));
      const ul = el("ul", "space-y-0.5"); M.datos.forEach((x) => ul.append(el("li", "", x))); c.append(ul);
      $("costos-metodos").append(c);
    }
  })();

  /* ===================== Premios ===================== */
  for (const [k, lista] of Object.entries(R.PREMIOS)) {
    const caja = el("div", "metro-caja");
    caja.style.borderLeft = ".4rem solid " + R.TORNEOS[k].color;
    caja.append(el("h3", "", R.TORNEOS[k].nombre));
    const tabla = el("table", "w-full text-sm");
    tabla.append(el("caption", "sr-only", "Premios del " + R.TORNEOS[k].nombre));
    const tb = el("tbody");
    lista.forEach(([n, usd]) => {
      const tr = el("tr", "border-t border-brand-100 dark:border-brand-800");
      const th = el("th", "text-left py-1 pr-2 font-normal", n); th.scope = "row";
      tr.append(th, el("td", "py-1 text-right font-semibold", R.dinero(usd)));
      tb.append(tr);
    });
    tabla.append(tb); caja.append(tabla);
    $("premios-tablas").append(caja);
  }

  /* ===================== Resultados y partidas en vivo (de «Torneos») ===================== */
  function ficha(caja, { href, titulo, texto, accion, emoji, tono, externo }) {
    caja.textContent = "";
    const a = el(href ? "a" : "div", "metro-ficha");
    a.dataset.tono = tono;
    if (href) { a.href = href; if (externo) { a.target = "_blank"; a.rel = "noopener"; } }
    else { a.tabIndex = 0; a.setAttribute("aria-disabled", "true"); }
    a.append(el("span", "metro-ficha-emoji", emoji), el("span", "metro-ficha-titulo", titulo), el("span", "metro-ficha-texto", texto));
    const ac = el("span", "metro-ficha-accion", accion);
    if (externo) ac.append(el("span", "sr-only", " (se abre en otra pestaña)"));
    a.querySelector(".metro-ficha-emoji").setAttribute("aria-hidden", "true");
    a.append(ac);
    caja.append(a);
  }
  function pintarEnVivo(enlaces) {
    const res = enlaces.filter((e) => /chess-results\.com/i.test(e.url));
    const vivo = enlaces.find((e) => /lichess\.org\/broadcast/i.test(e.url));
    ficha($("ficha-resultados"), res.length
      ? { href: res.length === 1 ? res[0].url : "#resultados", externo: res.length === 1, titulo: "Resultados en vivo", emoji: "📊", tono: 3,
        texto: "Emparejamientos, resultados y clasificación de cada ronda en chess-results.", accion: res.length === 1 ? "Abrir chess-results →" : "Elegir la categoría →" }
      : { titulo: "Resultados en vivo", emoji: "📊", tono: 3, texto: "Los emparejamientos y la clasificación de cada ronda, en chess-results.", accion: "Pronto: se publican cuando la FCA cree los torneos" });
    ficha($("ficha-partidas"), vivo
      ? { href: vivo.url, externo: true, titulo: "Partidas en vivo", emoji: "📺", tono: 5, texto: "La transmisión de los tableros en directo, jugada a jugada, en Lichess.", accion: "Ver las partidas →" }
      : { titulo: "Partidas en vivo", emoji: "📺", tono: 5, texto: "La transmisión de los tableros en directo, jugada a jugada.", accion: "Pronto: la transmisión todavía no está publicada" });
    if (res.length > 1) {
      // Varias categorías en chess-results: una ventana para elegir.
      let d = $("resultados");
      if (!d) {
        d = el("dialog", "metro-ventana"); d.id = "resultados"; d.setAttribute("aria-labelledby", "resultados-titulo");
        const cab = el("div", "metro-ventana-cabeza"); const h2 = el("h2", "", "📊 Resultados en vivo"); h2.id = "resultados-titulo";
        const b = el("button", "metro-boton", "Cerrar"); b.type = "button"; b.dataset.cerrar = "";
        cab.append(h2, b);
        const cu = el("div", "metro-ventana-cuerpo"); const ul = el("ul", "grid sm:grid-cols-2 gap-2"); ul.id = "resultados-lista"; cu.append(ul);
        d.append(cab, cu); document.querySelector("main").append(d);
        d.addEventListener("click", (ev) => { if (ev.target === d) d.close(); });
      }
      const ul = $("resultados-lista"); ul.textContent = "";
      res.forEach((e) => { const li = el("li"); const a = el("a", "metro-boton block", e.texto || e.url); a.href = e.url; a.target = "_blank"; a.rel = "noopener"; li.append(a); ul.append(li); });
    }
  }
  pintarEnVivo([]);
  (async () => {
    try {
      const sala = await window.SalasTorneo.porClave(CLAVE_SALA);
      if (sala && Array.isArray(sala.enlaces)) pintarEnVivo(sala.enlaces.filter((e) => e && typeof e.url === "string"));
    } catch (e) { /* sin la base, quedan en «Pronto» */ }
    if (location.hash) abrir(location.hash.slice(1));
  })();
})();
