/* oscar-angulo-fide.html: los torneos registrados en FIDE en que Oscar Angulo
 * figura como árbitro u organizador, y si cumplen las condiciones de un
 * torneo para una norma de Árbitro FIDE (AF) y de Árbitro Internacional (AI).
 * Los datos son data/oscar-angulo-fide.json (lo arma
 * herramientas/oscar-angulo-fide.py, que es donde se aplica el reglamento):
 * acá solo se filtra, se cuenta y se pinta.
 *
 * Los filtros van en la dirección (?ai=si&cargo=Chief&desde=2020…); uno que
 * no existe se ignora. Las barras (js/barras-filtro.js) ponen su filtro al
 * tocarlas.
 */
(function () {
  "use strict";

  const PASO = 100;
  const numero = new Intl.NumberFormat("es-CR");
  const miles = (n) => numero.format(n);
  const $ = (id) => document.getElementById(id);
  const texto = (id, t) => { $(id).textContent = t; };
  const sinTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // Cómo se dice cada estado de una norma, y su orden al ordenar la tabla.
  const ESTADOS = {
    si: { n: "Vale", largo: "Vale" },
    una: { n: "Vale (una así)", largo: "Vale, pero solo una así por solicitud" },
    opcion: { n: "Vale una vez", largo: "Vale una vez por solicitud (opción)" },
    revisar: { n: "Revisar", largo: "Puede valer: revisar" },
    no: { n: "No", largo: "No vale" }
  };
  const ORDEN_ESTADO = { si: 0, una: 1, opcion: 2, revisar: 3, no: 4 };
  // El filtro de norma junta estados: «vale» es sí, una u opción.
  const FILTRO_NORMA = { vale: ["si", "una", "opcion"], si: ["si"], revisar: ["revisar"], no: ["no"] };
  const NOMBRE_FILTRO_NORMA = { vale: "Vale (con o sin condición)", si: "Vale sin condición", revisar: "Revisar", no: "No vale" };

  let datos = null, torneos = [], PRIMER = 0, ULTIMO = 0;
  const SELECTS = ["af", "ai", "cargo", "ritmo", "sistema", "pais"];
  const estado = { q: "", af: "", ai: "", cargo: "", ritmo: "", sistema: "", pais: "", desde: 0, hasta: 0, orden: { col: "inicio", dir: -1 }, mostrar: PASO };

  const fecha = (d) => d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : "";
  const cargoTexto = (t) => t.cargos.map((c) => datos.cargos[c] || c).join(", ");
  const vale = (n) => n.estado !== "no";

  function pasa(t, salvo) {
    if (salvo !== "anio" && (t.anio < estado.desde || t.anio > estado.hasta)) return false;
    if (salvo !== "af" && estado.af && !FILTRO_NORMA[estado.af].includes(t.af.estado)) return false;
    if (salvo !== "ai" && estado.ai && !FILTRO_NORMA[estado.ai].includes(t.ai.estado)) return false;
    if (salvo !== "cargo" && estado.cargo && !t.cargos.includes(estado.cargo)) return false;
    if (salvo !== "ritmo" && estado.ritmo && t.ritmo !== estado.ritmo) return false;
    if (salvo !== "sistema" && estado.sistema && t.sistema !== estado.sistema) return false;
    if (salvo !== "pais" && estado.pais && t.pais !== estado.pais) return false;
    if (estado.q.trim() && !t.busca.includes(sinTildes(estado.q.trim()))) return false;
    return true;
  }
  const filtrados = (salvo) => torneos.filter((t) => pasa(t, salvo));
  const conFiltros = () => !!(estado.q.trim() || SELECTS.some((k) => estado[k]) || estado.desde !== PRIMER || estado.hasta !== ULTIMO);

  function contar(lista, f) {
    const c = new Map();
    for (const t of lista) for (const v of [].concat(f(t))) c.set(v, (c.get(v) || 0) + 1);
    return c;
  }

  function opciones(select, valores, conPrimera) {
    const nuevas = valores.map(([v, n]) => { const o = document.createElement("option"); o.value = v; o.textContent = n; return o; });
    if (conPrimera) select.replaceChildren(select.options[0], ...nuevas); else select.replaceChildren(...nuevas);
  }

  function llenarFiltros() {
    const normas = Object.entries(NOMBRE_FILTRO_NORMA);
    opciones($("of-af"), normas, true);
    opciones($("of-ai"), normas, true);
    opciones($("of-cargo"), Object.entries(datos.cargos).filter(([k]) => torneos.some((t) => t.cargos.includes(k))), true);
    opciones($("of-ritmo"), Object.entries(datos.ritmos).filter(([k]) => torneos.some((t) => t.ritmo === k)), true);
    opciones($("of-sistema"), Object.entries(datos.sistemas).filter(([k]) => torneos.some((t) => t.sistema === k)), true);
    opciones($("of-pais"), [...contar(torneos, (t) => t.pais).entries()].sort((a, b) => b[1] - a[1]).map(([p]) => [p, p]), true);
    const anios = []; for (let y = PRIMER; y <= ULTIMO; y++) anios.push([String(y), String(y)]);
    opciones($("of-desde"), anios, false);
    opciones($("of-hasta"), anios, false);
  }

  function leerDireccion() {
    const p = new URLSearchParams(location.search);
    const valido = (id, v) => [...$(id).options].some((o) => o.value === v);
    estado.q = p.get("q") || "";
    for (const k of SELECTS) { const v = p.get(k) || ""; estado[k] = v && valido("of-" + k, v) ? v : ""; }
    const anio = (k, def) => { const v = parseInt(p.get(k), 10); return v >= PRIMER && v <= ULTIMO ? v : def; };
    estado.desde = anio("desde", PRIMER); estado.hasta = anio("hasta", ULTIMO);
    if (estado.desde > estado.hasta) estado.hasta = estado.desde;
  }

  function escribirDireccion() {
    const p = new URLSearchParams();
    if (estado.q.trim()) p.set("q", estado.q.trim());
    for (const k of SELECTS) if (estado[k]) p.set(k, estado[k]);
    if (estado.desde !== PRIMER) p.set("desde", estado.desde);
    if (estado.hasta !== ULTIMO) p.set("hasta", estado.hasta);
    const q = p.toString();
    history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + location.hash);
  }

  function ponerControles() {
    $("of-buscar").value = estado.q;
    for (const k of SELECTS) $("of-" + k).value = estado[k];
    $("of-desde").value = String(estado.desde); $("of-hasta").value = String(estado.hasta);
    $("of-quitar").hidden = !conFiltros();
  }

  function cambiar(cambios) {
    Object.assign(estado, cambios, { mostrar: PASO });
    if (estado.desde > estado.hasta) { if ("desde" in cambios) estado.hasta = estado.desde; else estado.desde = estado.hasta; }
    escribirDireccion();
    pintar();
  }

  // ---------- Lo que se pinta ----------

  function cifras(lista) {
    const anios = [...new Set(lista.map((t) => t.anio))].sort((a, b) => a - b);
    const principal = lista.filter((t) => t.cargos.includes("Chief")).length;
    const af = lista.filter((t) => vale(t.af)), ai = lista.filter((t) => vale(t.ai));
    const firmes = (l, k) => l.filter((t) => t[k].estado !== "revisar").length;
    texto("of-c-torneos", miles(lista.length));
    texto("of-c-torneos-nota", lista.length ? miles(lista.filter((t) => t.ritmo === "Standard").length) + " de ritmo clásico" : "");
    texto("of-c-principal", miles(principal));
    texto("of-c-principal-nota", miles(lista.filter((t) => t.cargos.includes("Dep. Chief")).length) + " como adjunto principal, " + miles(lista.filter((t) => t.cargos.includes("Arbiter")).length) + " como árbitro");
    texto("of-c-elo", miles(lista.reduce((s, t) => s + t.conElo, 0)));
    texto("of-c-af", miles(af.length));
    texto("of-c-af-nota", miles(firmes(af, "af")) + " sin nada que revisar");
    texto("of-c-ai", miles(ai.length));
    texto("of-c-ai-nota", miles(firmes(ai, "ai")) + " sin nada que revisar, " + miles(ai.length - firmes(ai, "ai")) + " para revisar");
    texto("of-c-anios", miles(anios.length));
    texto("of-c-anios-nota", anios.length ? (anios.length === 1 ? "en " + anios[0] : "de " + anios[0] + " a " + anios[anios.length - 1]) : "");
    texto("of-tesis", !lista.length ? "Ningún torneo cumple con estos filtros."
      : (conFiltros() ? "Con estos filtros, " : "") + miles(lista.length) + (lista.length === 1 ? " torneo en FIDE" : " torneos en FIDE")
        + (anios.length > 1 ? " de " + anios[0] + " a " + anios[anios.length - 1] : " en " + anios[0])
        + ". Con el reglamento de hoy, " + miles(af.length) + " cumplen las condiciones de una norma de AF y " + miles(ai.length) + " las de una norma de AI"
        + (ai.length > firmes(ai, "ai") ? " (" + miles(ai.length - firmes(ai, "ai")) + " para revisar)" : "") + ".");
  }

  function resumenes() {
    const porAnio = contar(filtrados("anio"), (t) => t.anio);
    const anios = []; for (let y = PRIMER; y <= ULTIMO; y++) anios.push({ clave: y, nombre: String(y), n: porAnio.get(y) || 0 });
    const unAnio = estado.desde === estado.hasta && (estado.desde !== PRIMER || estado.hasta !== ULTIMO) ? estado.desde : null;
    BarrasFiltro.pintar($("of-por-anio"), anios, unAnio, (y) => cambiar(y ? { desde: y, hasta: y } : { desde: PRIMER, hasta: ULTIMO }));
    const cargos = contar(filtrados("cargo"), (t) => t.cargos);
    BarrasFiltro.pintar($("of-por-cargo"), Object.entries(datos.cargos).map(([k, n]) => ({ clave: k, nombre: n, n: cargos.get(k) || 0 })).filter((f) => f.n), estado.cargo, (v) => cambiar({ cargo: v }), "Ningún torneo.");
    const ritmos = contar(filtrados("ritmo"), (t) => t.ritmo);
    BarrasFiltro.pintar($("of-por-ritmo"), Object.entries(datos.ritmos).map(([k, n]) => ({ clave: k, nombre: n, n: ritmos.get(k) || 0 })).filter((f) => f.n), estado.ritmo, (v) => cambiar({ ritmo: v }), "Ningún torneo.");
  }

  function celda(fila, valor, clase, encabezado) {
    const c = document.createElement(encabezado ? "th" : "td");
    if (encabezado) c.scope = "row";
    if (clase) c.className = clase;
    if (valor instanceof Node) c.appendChild(valor); else c.textContent = valor;
    fila.appendChild(c);
    return c;
  }

  function enlace(href, txt) {
    const a = document.createElement("a");
    a.href = href; a.target = "_blank"; a.rel = "noopener"; a.className = "underline underline-offset-2 hover:no-underline";
    a.textContent = txt;
    return a;
  }

  // El estado escrito (nunca solo un color) y, debajo, por qué.
  function norma(n) {
    const caja = document.createElement("div");
    const e = document.createElement("strong"); e.className = "of-estado"; e.dataset.estado = n.estado; e.textContent = ESTADOS[n.estado].n;
    const d = document.createElement("span"); d.className = "of-detalle"; d.textContent = n.detalle;
    caja.append(e, d);
    return caja;
  }

  const valorCol = {
    inicio: (t) => t.inicio + String(t.id).padStart(8, "0"),
    nombre: (t) => t.nombre, cargo: cargoTexto, ritmo: (t) => (datos.ritmos[t.ritmo] || "") + (datos.sistemas[t.sistema] || ""),
    contados: (t) => t.contados, rondas: (t) => t.rondas || 0, feds: (t) => t.federaciones.length,
    af: (t) => ORDEN_ESTADO[t.af.estado], ai: (t) => ORDEN_ESTADO[t.ai.estado]
  };

  function ordenar(lista) {
    const { col, dir } = estado.orden;
    const v = valorCol[col];
    return lista.slice().sort((a, b) => {
      const x = v(a), y = v(b);
      const c = typeof x === "number" ? x - y : String(x).localeCompare(String(y), "es");
      return c * dir || (valorCol.inicio(b) < valorCol.inicio(a) ? -1 : 1);
    });
  }

  function tabla(lista) {
    const ver = ordenar(lista).slice(0, estado.mostrar);
    $("of-tabla").tBodies[0].replaceChildren(...ver.map((t) => {
      const f = document.createElement("tr");
      celda(f, fecha(t.inicio));
      const nombre = document.createElement("div");
      nombre.appendChild(enlace("https://ratings.fide.com/tournament_information.phtml?event=" + t.id, t.nombre));
      const sub = document.createElement("span"); sub.className = "of-detalle";
      sub.textContent = [t.ciudad, t.pais].filter(Boolean).join(", ") + (t.valorado ? " · valorado en " + t.valorado : "");
      nombre.appendChild(sub);
      if (t.chessResults) {
        const cr = enlace("https://chess-results.com/tnr" + t.chessResults + ".aspx?lan=2", "en chess-results");
        cr.classList.add("of-detalle");
        nombre.appendChild(cr);
      }
      celda(f, nombre, "", true);
      celda(f, cargoTexto(t));
      celda(f, (datos.ritmos[t.ritmo] || t.ritmo || "—") + " · " + (datos.sistemas[t.sistema] || t.sistema || "—"));
      celda(f, miles(t.contados) + (t.contados !== t.conElo ? " de " + miles(t.conElo) : ""), "ae-n");
      celda(f, t.rondas ? miles(t.rondas) : "—", "ae-n");
      celda(f, miles(t.federaciones.length), "ae-n").title = t.federaciones.join(", ");
      celda(f, norma(t.af));
      celda(f, norma(t.ai));
      return f;
    }));
    texto("of-cuenta", lista.length ? (ver.length < lista.length ? "Se muestran " + miles(ver.length) + " de " + miles(lista.length) + " torneos." : miles(lista.length) + (lista.length === 1 ? " torneo." : " torneos.")) + " «Con Elo» cuenta a quien no faltó a más de una ronda." : "Ningún torneo cumple con estos filtros.");
    $("of-mas").hidden = ver.length >= lista.length;
    $("of-mas").textContent = "Mostrar " + miles(Math.min(PASO, lista.length - ver.length)) + " más";
    $("of-excel").disabled = !lista.length;
    for (const th of $("of-tabla").tHead.rows[0].cells) {
      const col = th.querySelector("button").dataset.col;
      th.setAttribute("aria-sort", col === estado.orden.col ? (estado.orden.dir < 0 ? "descending" : "ascending") : "none");
    }
  }

  function excel() {
    const filas = [["Inicio", "Fin", "Torneo", "Ciudad", "País", "Cargo", "Ritmo", "Sistema", "Jugadores", "Con Elo", "Con Elo que cuentan", "Rondas", "Federaciones", "Norma de AF", "Por qué (AF)", "Norma de AI", "Por qué (AI)", "FIDE", "chess-results"]]
      .concat(ordenar(filtrados()).map((t) => [t.inicio, t.fin, t.nombre, t.ciudad, t.pais, cargoTexto(t), datos.ritmos[t.ritmo] || t.ritmo, datos.sistemas[t.sistema] || t.sistema,
        t.jugadores, t.conElo, t.contados, t.rondas || "", t.federaciones.join(" "), ESTADOS[t.af.estado].largo, t.af.detalle, ESTADOS[t.ai.estado].largo, t.ai.detalle,
        "https://ratings.fide.com/tournament_information.phtml?event=" + t.id, t.chessResults ? "https://chess-results.com/tnr" + t.chessResults + ".aspx?lan=2" : ""]));
    window.TablaExcel.bajar("oscar-angulo-fide-normas.xlsx", [{ nombre: "Torneos FIDE", filas }]);
  }

  function pintar() {
    ponerControles();
    const lista = filtrados();
    cifras(lista);
    resumenes();
    tabla(lista);
  }

  function conectar() {
    let espera = null;
    $("of-buscar").addEventListener("input", (e) => { clearTimeout(espera); const v = e.target.value; espera = setTimeout(() => cambiar({ q: v }), 200); });
    for (const k of SELECTS) $("of-" + k).addEventListener("change", (e) => cambiar({ [k]: e.target.value }));
    $("of-desde").addEventListener("change", (e) => cambiar({ desde: parseInt(e.target.value, 10) }));
    $("of-hasta").addEventListener("change", (e) => cambiar({ hasta: parseInt(e.target.value, 10) }));
    $("of-quitar").addEventListener("click", () => { cambiar({ q: "", af: "", ai: "", cargo: "", ritmo: "", sistema: "", pais: "", desde: PRIMER, hasta: ULTIMO }); $("of-buscar").focus(); });
    $("of-mas").addEventListener("click", () => { estado.mostrar += PASO; tabla(filtrados()); });
    $("of-excel").addEventListener("click", excel);
    for (const b of $("of-tabla").tHead.querySelectorAll("button")) {
      b.addEventListener("click", () => {
        const col = b.dataset.col;
        estado.orden = { col, dir: estado.orden.col === col ? -estado.orden.dir : (["inicio", "contados", "rondas", "feds"].includes(col) ? -1 : 1) };
        tabla(filtrados());
      });
    }
  }

  fetch("data/oscar-angulo-fide.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then((d) => {
      datos = d;
      torneos = d.torneos.map((t) => ({ ...t, busca: sinTildes([t.nombre, t.ciudad, t.pais].join(" ")) }));
      PRIMER = Math.min(...torneos.map((t) => t.anio)); ULTIMO = Math.max(...torneos.map((t) => t.anio));
      $("of-perfil").href = "https://ratings.fide.com/profile/" + d.idFide;
      $("of-regla").href = d.reglamento.enlace;
      const [a, m, dia] = d.actualizado.split("-");
      texto("of-actualizado", dia + "/" + m + "/" + a);
      llenarFiltros();
      leerDireccion();
      conectar();
      pintar();
    })
    .catch(() => { texto("of-tesis", "No se pudieron cargar los datos. Vuelve a cargar la página en un momento."); });
})();
