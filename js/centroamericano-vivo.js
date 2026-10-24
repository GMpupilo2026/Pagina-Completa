/* «Busca a tu jugador» y el medallero de centroamericano-2026.html.
 *
 * Los datos salen de chess-results por la Edge Function sala-jugadores (el
 * navegador no le puede pedir nada a chess-results: no manda CORS). La función
 * recibe la clave de la sala de Torneos y lee solo los torneos de chess-results
 * que esa sala tiene entre sus enlaces: la clasificación (con el grupo de cada
 * jugador, que es su categoría) y la ronda emparejada más reciente.
 *
 * - Se piden la primera vez que alguien escribe un nombre o abre el medallero,
 *   y de nuevo cada 2 minutos mientras la página está a la vista: no a cada
 *   visita, que es casi siempre para ver otra cosa.
 * - Lo último que llegó queda en este aparato (localStorage): sin señal en la
 *   sala se muestra eso, con la hora en que se leyó.
 * - Todo lo que se pinta va por textContent: los nombres vienen de afuera.
 * - Se pinta en el idioma de la página (el evento «cac-idioma» de
 *   js/centroamericano.js), con sus propios textos: lo de acá no pasa por el
 *   diccionario de js/centroamericano-en.js.
 *
 * Ver «Busca a tu jugador y el medallero» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  const SALA = "centroamericano-2026";
  const CLAVE_GUARDADO = "cac_jugadores_v1";
  const REFRESCO_MS = 120000;
  const MAX_RESULTADOS = 8;
  const $ = (id) => document.getElementById(id);
  const ZONA = "America/Costa_Rica";

  const TEXTOS = {
    es: {
      cargando: "Buscando en chess-results…",
      error: "No pudimos leer chess-results ahora mismo. Vuelve a intentarlo en un rato.",
      guardado: (h) => "Sin conexión: estos son los datos leídos en chess-results el " + h + ".",
      leido: (h) => "Leído en chess-results: " + h + ".",
      corto: "Escribe al menos 3 letras.",
      nadie: "No encontramos a nadie con ese nombre. Prueba solo con el apellido, sin tildes no importa.",
      cuantos: (n, m) => n > m ? "Hay " + n + " jugadores con ese nombre: te mostramos " + m + ". Escribe un poco más." : (n === 1 ? "1 jugador." : n + " jugadores."),
      categoria: (g) => categoria(g, "es"),
      inicial: (n) => "Número inicial " + n,
      elo: (e) => "Elo " + e,
      puesto: (p, de, g) => "Puesto " + p + " de " + de + " en " + g,
      puntos: (p) => p + (p === "1" ? " punto" : " puntos"),
      sinPareo: (r) => r ? "No aparece en el pareo de la ronda " + r + "." : "El pareo de la ronda 1 todavía no está publicado.",
      bye: (r) => "Ronda " + r + ": tiene bye (descansa).",
      mesa: (r, m, color, rival) => "Ronda " + r + " · Mesa " + m + " · Juega con " + color + " contra " + rival,
      blancas: "blancas", negras: "negras",
      resultado: (r) => "Resultado: " + r,
      medalleroAntes: "Los podios aparecen cuando termine la ronda 1.",
      provisional: (r, de) => "Provisional: así quedaría después de la ronda " + r + (de ? " de " + de : "") + ".",
      final: "Final: la clasificación después de la última ronda.",
      federacion: "Federación", oro: "Oro", plata: "Plata", bronce: "Bronce", total: "Total",
      medallasDe: "Medallas por federación",
      podios: "Los podios de cada categoría",
      locale: "es-CR",
    },
    en: {
      cargando: "Searching chess-results…",
      error: "We couldn't read chess-results right now. Please try again in a while.",
      guardado: (h) => "Offline: this is the data read from chess-results on " + h + ".",
      leido: (h) => "Read from chess-results: " + h + ".",
      corto: "Type at least 3 letters.",
      nadie: "We couldn't find anyone with that name. Try just the last name; accents don't matter.",
      cuantos: (n, m) => n > m ? n + " players match: showing " + m + ". Type a little more." : (n === 1 ? "1 player." : n + " players."),
      categoria: (g) => categoria(g, "en"),
      inicial: (n) => "Starting number " + n,
      elo: (e) => "Rating " + e,
      puesto: (p, de, g) => "Place " + p + " of " + de + " in " + g,
      puntos: (p) => p + (p === "1" ? " point" : " points"),
      sinPareo: (r) => r ? "Not in the pairings of round " + r + "." : "The pairings of round 1 are not published yet.",
      bye: (r) => "Round " + r + ": has a bye (rests).",
      mesa: (r, m, color, rival) => "Round " + r + " · Board " + m + " · Plays " + color + " against " + rival,
      blancas: "white", negras: "black",
      resultado: (r) => "Result: " + r,
      medalleroAntes: "The podiums show up once round 1 is over.",
      provisional: (r, de) => "Provisional: the standings after round " + r + (de ? " of " + de : "") + ".",
      final: "Final: the standings after the last round.",
      federacion: "Federation", oro: "Gold", plata: "Silver", bronce: "Bronze", total: "Total",
      medallasDe: "Medals by federation",
      podios: "The podium of every section",
      locale: "en-US",
    },
  };

  const idioma = () => (document.documentElement.lang === "en" ? "en" : "es");
  const t = () => TEXTOS[idioma()];

  // «U18F» → «Sub-18 Femenino» / «U18 Girls»; «U08» → «Sub-8 Absoluto» / «U8 Open».
  function categoria(g, lang) {
    const m = String(g || "").match(/^U0?(\d+)(F?)$/i);
    if (!m) return g || "";
    return lang === "en" ? "U" + m[1] + (m[2] ? " Girls" : " Open") : "Sub-" + m[1] + (m[2] ? " Femenino" : " Absoluto");
  }
  const ordenGrupo = (g) => { const m = String(g).match(/^U0?(\d+)(F?)$/i); return m ? Number(m[1]) * 2 + (m[2] ? 1 : 0) : 999; };

  // Sin tildes, sin mayúsculas y sin comas: «Muñoz, José» → «munoz jose».
  const plano = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

  const el = (tag, clase, texto) => { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; };
  const hora = (iso) => new Date(iso).toLocaleTimeString(t().locale, { hour: "numeric", minute: "2-digit", day: "numeric", month: "short", timeZone: ZONA });

  /* ---------------- los datos ---------------- */
  let datos = null;          // { torneos: [...], recibido: ISO }
  let deGuardado = false;
  let pidiendo = null;
  let ultimoPedido = 0;

  function guardados() {
    try { return JSON.parse(localStorage.getItem(CLAVE_GUARDADO) || "null"); } catch (e) { return null; }
  }

  function pedir() {
    if (pidiendo) return pidiendo;
    if (datos && !deGuardado && Date.now() - ultimoPedido < REFRESCO_MS) return Promise.resolve(datos);
    ultimoPedido = Date.now();
    pidiendo = (async () => {
      try {
        if (!window.sb || !window.sb.functions) throw new Error("sin cliente");
        const { data, error } = await window.sb.functions.invoke("sala-jugadores", { body: { clave: SALA } });
        if (error || !data || !Array.isArray(data.torneos)) throw error || new Error("respuesta rara");
        datos = { torneos: data.torneos, recibido: new Date().toISOString() };
        deGuardado = false;
        try { localStorage.setItem(CLAVE_GUARDADO, JSON.stringify(datos)); } catch (e) {}
      } catch (e) {
        const g = guardados();
        if (g && !datos) { datos = g; deGuardado = true; }
        if (!datos) throw e;
      } finally {
        pidiendo = null;
      }
      return datos;
    })();
    return pidiendo;
  }

  // Todos los jugadores de todos los torneos de la sala, cada uno con su ronda.
  function jugadores() {
    const out = [];
    (datos ? datos.torneos : []).forEach((tor) => {
      if (!Array.isArray(tor.jugadores)) return;
      const porNo = new Map(tor.jugadores.map((j) => [j.no, j]));
      const enGrupo = {};
      tor.jugadores.forEach((j) => { (enGrupo[j.grupo] = enGrupo[j.grupo] || []).push(j); });
      Object.values(enGrupo).forEach((lista) => lista.sort((a, b) => a.puesto - b.puesto).forEach((j, i) => { j._puestoGrupo = i + 1; j._deGrupo = lista.length; }));
      const pareo = tor.pareo || { ronda: 0, mesas: [] };
      tor.jugadores.forEach((j) => {
        let partida = null;
        (pareo.mesas || []).some((m) => {
          if (m.blancas && m.blancas.no === j.no) { partida = { mesa: m.mesa, color: "blancas", rival: m.negras, resultado: m.resultado }; return true; }
          if (m.negras && m.negras.no === j.no) { partida = { mesa: m.mesa, color: "negras", rival: m.blancas, resultado: m.resultado }; return true; }
          return false;
        });
        out.push({ j, torneo: tor, ronda: pareo.ronda || 0, partida, rivalDe: (no) => porNo.get(no) });
      });
    });
    return out;
  }

  /* ---------------- el buscador ---------------- */
  function pintarBuscador() {
    const campo = $("buscador-nombre"), estado = $("buscador-estado"), lista = $("buscador-resultados");
    if (!campo) return;
    const tx = t();
    const q = plano(campo.value);
    lista.replaceChildren();
    if (!q) { estado.textContent = ""; return; }
    if (q.replace(/ /g, "").length < 3) { estado.textContent = tx.corto; return; }
    if (!datos) { estado.textContent = tx.cargando; return; }
    const palabras = q.split(" ");
    const hallados = jugadores().filter((x) => { const n = plano(x.j.nombre); return palabras.every((p) => n.includes(p)); });
    const alguno = datos.torneos.find((tor) => tor.leido_en);
    const cuando = alguno ? (deGuardado ? tx.guardado(hora(alguno.leido_en)) : tx.leido(hora(alguno.leido_en))) : "";
    // «10:05 a. m.» ya trae su punto: no se le pone otro.
    const decir = (s) => { estado.textContent = s.replace(/\.\./g, "."); };
    if (!hallados.length) { decir(tx.nadie + (cuando ? " " + cuando : "")); return; }
    decir(tx.cuantos(hallados.length, MAX_RESULTADOS) + (cuando ? " " + cuando : ""));
    hallados.slice(0, MAX_RESULTADOS).forEach((x) => lista.appendChild(tarjeta(x, tx)));
  }

  function tarjeta(x, tx) {
    const { j } = x;
    const li = el("li", "cac-jugador");
    const nombre = el("p", "cac-jugador-nombre", (j.titulo ? j.titulo + " " : "") + j.nombre + " ");
    if (j.fed) nombre.appendChild(el("span", "cac-fed", j.fed));
    li.appendChild(nombre);
    const datosJ = [tx.categoria(j.grupo)];
    if (j.elo) datosJ.push(tx.elo(j.elo));
    if (x.torneo.ronda > 0 && j._puestoGrupo) datosJ.push(tx.puesto(j._puestoGrupo, j._deGrupo, tx.categoria(j.grupo)), tx.puntos(j.puntos));
    else datosJ.push(tx.inicial(j.no));
    li.appendChild(el("p", "text-sm", datosJ.filter(Boolean).join(" · ")));
    let linea;
    if (x.partida && !x.partida.rival) linea = tx.bye(x.ronda);
    else if (x.partida) {
      const r = x.rivalDe(x.partida.rival.no) || {};
      const rival = (x.partida.rival.titulo ? x.partida.rival.titulo + " " : "") + x.partida.rival.nombre
        + (r.fed || r.elo ? " (" + [r.fed, r.elo || ""].filter(Boolean).join(", ") + ")" : "");
      linea = tx.mesa(x.ronda, x.partida.mesa, x.partida.color === "blancas" ? tx.blancas : tx.negras, rival);
    } else linea = tx.sinPareo(x.ronda);
    li.appendChild(el("p", "cac-jugador-ronda", linea));
    const res = x.partida && x.partida.resultado && x.partida.resultado !== "bye" && /\d|½/.test(x.partida.resultado) ? x.partida.resultado : "";
    if (res) li.appendChild(el("p", "text-sm", tx.resultado(res)));
    return li;
  }

  let espera = null;
  function alEscribir() {
    clearTimeout(espera);
    espera = setTimeout(() => {
      pintarBuscador();
      if (plano($("buscador-nombre").value).replace(/ /g, "").length >= 3) {
        pedir().then(pintarBuscador, () => { $("buscador-estado").textContent = t().error; });
      }
    }, 200);
  }

  /* ---------------- el medallero ---------------- */
  function pintarMedallero() {
    const caja = $("medallero-contenido");
    if (!caja) return;
    const tx = t();
    caja.replaceChildren();
    if (!datos) { caja.appendChild(el("p", "text-brand-600 dark:text-brand-300", tx.cargando)); return; }
    const torneos = datos.torneos.filter((tor) => Array.isArray(tor.jugadores) && tor.jugadores.length);
    const ronda = Math.max(0, ...torneos.map((tor) => tor.ronda || 0));
    const rondas = Math.max(0, ...torneos.map((tor) => tor.rondas || 0));
    if (!ronda) { caja.appendChild(el("p", "font-semibold", tx.medalleroAntes)); return; }
    caja.appendChild(el("p", "font-semibold", rondas && ronda >= rondas ? tx.final : tx.provisional(ronda, rondas)));

    // Los tres primeros de cada grupo, en el orden de la clasificación.
    const grupos = {};
    torneos.forEach((tor) => tor.jugadores.forEach((j) => { (grupos[j.grupo || "—"] = grupos[j.grupo || "—"] || []).push(j); }));
    const nombres = Object.keys(grupos).sort((a, b) => ordenGrupo(a) - ordenGrupo(b) || a.localeCompare(b));
    const medallas = {};
    nombres.forEach((g) => {
      grupos[g].sort((a, b) => a.puesto - b.puesto).slice(0, 3).forEach((j, i) => {
        const f = j.fed || "—";
        medallas[f] = medallas[f] || [0, 0, 0];
        medallas[f][i] += 1;
      });
    });

    caja.appendChild(el("h3", "mt-5 font-bold text-lg", tx.medallasDe));
    const envoltura = el("div", "mt-2 overflow-x-auto rounded-2xl border border-brand-100 dark:border-brand-800 bg-white dark:bg-brand-900");
    const tabla = el("table", "cac-medallas");
    const cab = el("tr", "bg-brand-100 dark:bg-brand-800");
    // El emoji de cada medalla va escondido para el lector: el nombre ya lo dice.
    [["", tx.federacion], ["🥇 ", tx.oro], ["🥈 ", tx.plata], ["🥉 ", tx.bronce], ["", tx.total]].forEach(([e, c]) => {
      const th = el("th"); th.scope = "col";
      if (e) { const s = el("span", "", e); s.setAttribute("aria-hidden", "true"); th.appendChild(s); }
      th.appendChild(document.createTextNode(c));
      cab.appendChild(th);
    });
    const thead = el("thead"); thead.appendChild(cab); tabla.appendChild(thead);
    const tbody = el("tbody", "divide-y divide-brand-100 dark:divide-brand-800");
    Object.entries(medallas).sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1] || b[1][2] - a[1][2] || a[0].localeCompare(b[0])).forEach(([f, m]) => {
      const tr = el("tr");
      const th = el("th", "font-semibold", f); th.scope = "row"; tr.appendChild(th);
      m.concat(m[0] + m[1] + m[2]).forEach((n) => tr.appendChild(el("td", "", String(n))));
      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);
    envoltura.appendChild(tabla);
    caja.appendChild(envoltura);

    caja.appendChild(el("h3", "mt-6 font-bold text-lg", tx.podios));
    const rejilla = el("div", "cac-podios mt-2");
    nombres.forEach((g) => {
      const c = el("section", "cac-podio");
      c.appendChild(el("h3", "", tx.categoria(g)));
      const ol = el("ol");
      grupos[g].slice(0, 3).forEach((j, i) => {
        const li = el("li");
        const medalla = el("span", "", ["🥇", "🥈", "🥉"][i] + " ");
        medalla.setAttribute("aria-hidden", "true");
        li.append(medalla, document.createTextNode((i + 1) + ". " + (j.titulo ? j.titulo + " " : "") + j.nombre + " "));
        if (j.fed) li.appendChild(el("span", "cac-fed", j.fed));
        li.appendChild(document.createTextNode(" · " + tx.puntos(j.puntos)));
        ol.appendChild(li);
      });
      c.appendChild(ol);
      rejilla.appendChild(c);
    });
    caja.appendChild(rejilla);
  }

  function abrirMedallero() {
    pintarMedallero();
    pedir().then(pintarMedallero, () => {
      const caja = $("medallero-contenido");
      if (caja) caja.replaceChildren(el("p", "font-semibold", t().error));
    });
  }

  /* ---------------- arranque ---------------- */
  const g = guardados();
  if (g && Array.isArray(g.torneos)) { datos = g; deGuardado = true; }

  const campo = $("buscador-nombre");
  if (campo) campo.addEventListener("input", alEscribir);

  // El medallero se abre como las demás ventanas (js/ventana-enlace.js, con el
  // enlace #medallero o la dirección); cuando se abre, se llena.
  const dialogo = $("medallero");
  if (dialogo) {
    new MutationObserver(() => { if (dialogo.open) abrirMedallero(); }).observe(dialogo, { attributes: true, attributeFilter: ["open"] });
    if (dialogo.open) abrirMedallero();
  }

  document.addEventListener("cac-idioma", () => { pintarBuscador(); if (dialogo && dialogo.open) pintarMedallero(); });

  // Mientras la página está a la vista y alguien ya buscó, se pone al día sola.
  setInterval(() => {
    if (document.hidden || !campo || plano(campo.value).length < 3) return;
    pedir().then(pintarBuscador, () => {});
  }, REFRESCO_MS);
})();
