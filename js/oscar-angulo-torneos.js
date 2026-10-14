/* oscar-angulo-torneos.html: los torneos de chess-results.com en que Oscar
 * Angulo Cubero figura como árbitro principal, adjunto, árbitro, director u
 * organizador. Los datos son data/oscar-angulo-torneos.json (lo arma
 * herramientas/oscar-angulo-torneos.py) y todo se cuenta acá, en el navegador:
 * son unas mil filas fijas de un archivo, no una tabla de la base.
 *
 * Los filtros (texto, rol, tipo, ritmo, modalidad, país, título, forma del
 * nombre y los años) cambian todo lo de la página y van en la dirección
 * (?rol=ap&pais=Honduras&desde=2016…) para que un enlace compartido abra la
 * misma vista; uno que no existe se ignora. Las barras de cada resumen son
 * botones: tocar una pone ese filtro, y tocarla de nuevo lo quita.
 */
(function () {
  "use strict";

  const PASO = 100;   // filas de la tabla que se muestran de una vez
  const numero = new Intl.NumberFormat("es-CR");
  const miles = (n) => numero.format(n);
  const $ = (id) => document.getElementById(id);
  const texto = (id, t) => { $(id).textContent = t; };
  const sinTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  let datos = null, torneos = [], NOMBRE_ROL = {}, PRIMER = 0, ULTIMO = 0;
  const estado = { q: "", rol: "", tipo: "", ritmo: "", modalidad: "", pais: "", titulo: "", forma: "", desde: 0, hasta: 0, orden: { col: "inicio", dir: -1 }, mostrar: PASO };
  const SELECTS = ["rol", "tipo", "ritmo", "modalidad", "pais", "titulo", "forma"];

  // Un día de calendario «AAAA-MM-DD» se escribe tal cual, sin pasar por Date
  // (que lo leería como medianoche UTC y en Costa Rica sería el día anterior).
  const fecha = (t) => t.inicio ? t.inicio.slice(8, 10) + "/" + t.inicio.slice(5, 7) + "/" + t.inicio.slice(0, 4) : (t.anioAprox ? "hacia " : "") + t.anio;
  const nombreTitulo = (k) => k ? datos.titulos[k] : "Sin título escrito";

  // ---------- Los filtros ----------

  function pasa(t, salvo) {
    if (salvo !== "anio" && (t.anio < estado.desde || t.anio > estado.hasta)) return false;
    if (salvo !== "rol" && estado.rol && !t.roles.includes(estado.rol)) return false;
    if (salvo !== "tipo" && estado.tipo && t.tipo !== estado.tipo) return false;
    if (salvo !== "ritmo" && estado.ritmo && t.ritmo !== estado.ritmo) return false;
    if (salvo !== "modalidad" && estado.modalidad && t.modalidad !== estado.modalidad) return false;
    if (salvo !== "pais" && estado.pais && t.pais !== estado.pais) return false;
    if (salvo !== "titulo" && estado.titulo && (estado.titulo === "-" ? t.titulo : t.titulo !== estado.titulo)) return false;
    if (salvo !== "forma" && estado.forma && !t.formas.includes(estado.forma)) return false;
    if (estado.q && !t.busca.includes(sinTildes(estado.q.trim()))) return false;
    return true;
  }
  const filtrados = (salvo) => torneos.filter((t) => pasa(t, salvo));
  const conFiltros = () => !!(estado.q.trim() || SELECTS.some((k) => estado[k]) || estado.desde !== PRIMER || estado.hasta !== ULTIMO);

  function opciones(select, valores) {
    const primera = select.options[0];
    select.replaceChildren(primera, ...valores.map(([v, n]) => { const o = document.createElement("option"); o.value = v; o.textContent = n; return o; }));
  }

  function llenarFiltros() {
    const cuenta = (f) => { const c = new Map(); for (const t of torneos) for (const v of [].concat(f(t))) c.set(v, (c.get(v) || 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1]); };
    opciones($("oa-rol"), datos.roles.map((r) => [r.codigo, r.nombre]));
    opciones($("oa-tipo"), cuenta((t) => t.tipo).map(([v]) => [v, v]));
    opciones($("oa-ritmo"), ["Clásico", "Rápido", "Blitz", "Sin dato"].filter((r) => torneos.some((t) => t.ritmo === r)).map((r) => [r, r === "Sin dato" ? "Sin dato del ritmo" : r]));
    opciones($("oa-modalidad"), [["Individual", "Individual"], ["Equipos", "Por equipos"]]);
    opciones($("oa-pais"), cuenta((t) => t.pais).map(([v]) => [v, v]));
    opciones($("oa-titulo"), ["IA", "FA", "AN"].map((k) => [k, datos.titulos[k]]).concat([["-", "Sin título escrito"]]));
    opciones($("oa-forma"), datos.variantes.map((v) => [v.forma, v.forma]));
    const anios = []; for (let y = PRIMER; y <= ULTIMO; y++) anios.push([String(y), String(y)]);
    for (const id of ["oa-desde", "oa-hasta"]) $(id).replaceChildren(...anios.map(([v, n]) => { const o = document.createElement("option"); o.value = v; o.textContent = n; return o; }));
  }

  function leerDireccion() {
    const p = new URLSearchParams(location.search);
    const valido = (id, v) => [...$(id).options].some((o) => o.value === v);
    estado.q = p.get("q") || "";
    for (const k of SELECTS) { const v = p.get(k) || ""; estado[k] = v && valido("oa-" + k, v) ? v : ""; }
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
    $("oa-buscar").value = estado.q;
    for (const k of SELECTS) $("oa-" + k).value = estado[k];
    $("oa-desde").value = String(estado.desde); $("oa-hasta").value = String(estado.hasta);
    $("oa-quitar").hidden = !conFiltros();
  }

  function cambiar(cambios) {
    Object.assign(estado, cambios, { mostrar: PASO });
    if (estado.desde > estado.hasta) { if ("desde" in cambios) estado.hasta = estado.desde; else estado.desde = estado.hasta; }
    escribirDireccion();
    pintar();
  }

  // ---------- Barras (js/barras-filtro.js) ----------

  const barras = (...a) => window.BarrasFiltro.pintar(...a);

  function contar(lista, f) {
    const c = new Map();
    for (const t of lista) for (const v of [].concat(f(t))) c.set(v, (c.get(v) || 0) + 1);
    return c;
  }

  // ---------- Lo que se pinta ----------

  function cifras(lista) {
    const anios = [...new Set(lista.map((t) => t.anio))].sort((a, b) => a - b);
    const paises = [...contar(lista, (t) => t.pais).entries()].filter(([p]) => p !== "Sin dato").sort((a, b) => b[1] - a[1]);
    const principal = lista.filter((t) => t.roles.includes("ap")).length;
    const sinJugadores = lista.filter((t) => !t.jugadores).length;
    texto("oa-c-torneos", miles(lista.length));
    texto("oa-c-torneos-nota", sinJugadores ? miles(sinJugadores) + (sinJugadores === 1 ? " no tiene" : " no tienen") + " jugadores en chess-results" : "todos con jugadores");
    texto("oa-c-principal", miles(principal));
    texto("oa-c-principal-nota", lista.length ? Math.round(principal / lista.length * 100) + " % de los torneos" : "");
    texto("oa-c-jugadores", miles(lista.reduce((s, t) => s + t.jugadores, 0)));
    texto("oa-c-rondas", miles(lista.reduce((s, t) => s + t.rondas, 0)));
    texto("oa-c-anios", miles(anios.length));
    texto("oa-c-anios-nota", anios.length ? (anios.length === 1 ? "en " + anios[0] : "de " + anios[0] + " a " + anios[anios.length - 1]) : "");
    texto("oa-c-paises", miles(paises.length));
    texto("oa-c-paises-nota", paises.map(([p]) => p).join(", "));

    let frase;
    if (!lista.length) frase = "Ningún torneo cumple con estos filtros.";
    else {
      const roles = [...contar(lista, (t) => t.roles).entries()].sort((a, b) => b[1] - a[1]);
      frase = (conFiltros() ? "Con estos filtros, " : "") + miles(lista.length) + (lista.length === 1 ? " torneo" : " torneos")
        + (anios.length > 1 ? " de " + anios[0] + " a " + anios[anios.length - 1] : " en " + anios[0])
        + ", con " + miles(lista.reduce((s, t) => s + t.jugadores, 0)) + " jugadores inscritos en total. "
        + "Su rol más frecuente: " + NOMBRE_ROL[roles[0][0]].toLowerCase() + " (" + miles(roles[0][1]) + ").";
      if (!conFiltros()) {
        const mejor = [...contar(lista, (t) => t.anio).entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
        frase += " El año con más torneos fue " + mejor[0] + ", con " + miles(mejor[1]) + ".";
      }
    }
    texto("oa-tesis", frase);
  }

  function resumenes() {
    // Cada resumen cuenta con todos los filtros menos el suyo: así se ve qué
    // pasaría al tocar otra barra, y la elegida no deja a las demás en cero.
    const porAnio = contar(filtrados("anio"), (t) => t.anio);
    const anios = []; for (let y = PRIMER; y <= ULTIMO; y++) anios.push({ clave: y, nombre: String(y), n: porAnio.get(y) || 0 });
    const unAnio = estado.desde === estado.hasta && (estado.desde !== PRIMER || estado.hasta !== ULTIMO) ? estado.desde : null;
    barras($("oa-por-anio"), anios, unAnio, (y) => cambiar(y ? { desde: y, hasta: y } : { desde: PRIMER, hasta: ULTIMO }), "");

    const roles = contar(filtrados("rol"), (t) => t.roles);
    barras($("oa-por-rol"), datos.roles.map((r) => ({ clave: r.codigo, nombre: r.nombre, n: roles.get(r.codigo) || 0 })).filter((f) => f.n), estado.rol, (v) => cambiar({ rol: v }), "Ningún torneo.");
    const orden = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ clave: k, nombre: k, n }));
    barras($("oa-por-tipo"), orden(contar(filtrados("tipo"), (t) => t.tipo)), estado.tipo, (v) => cambiar({ tipo: v }), "Ningún torneo.");
    barras($("oa-por-ritmo"), orden(contar(filtrados("ritmo"), (t) => t.ritmo)).map((f) => f.clave === "Sin dato" ? { ...f, nombre: "Sin dato del ritmo" } : f), estado.ritmo, (v) => cambiar({ ritmo: v }), "Ningún torneo.");
    barras($("oa-por-pais"), orden(contar(filtrados("pais"), (t) => t.pais)), estado.pais, (v) => cambiar({ pais: v }), "Ningún torneo.");
  }

  function celda(fila, valor, clase, encabezado) {
    const c = document.createElement(encabezado ? "th" : "td");
    if (encabezado) c.scope = "row";
    if (clase) c.className = clase;
    if (valor instanceof Node) c.appendChild(valor); else c.textContent = valor;
    fila.appendChild(c);
  }

  function titulos(lista) {
    const por = new Map();
    for (const t of lista) {
      const k = t.titulo || "-";
      const x = por.get(k) || { n: 0, primero: null, ultimo: null };
      x.n += 1;
      if (!x.primero || clave(t) < clave(x.primero)) x.primero = t;
      if (!x.ultimo || clave(t) > clave(x.ultimo)) x.ultimo = t;
      por.set(k, x);
    }
    $("oa-tabla-titulos").tBodies[0].replaceChildren(...["IA", "FA", "AN", "-"].filter((k) => por.has(k)).map((k) => {
      const x = por.get(k), f = document.createElement("tr");
      celda(f, nombreTitulo(k === "-" ? "" : k), "", true);
      celda(f, miles(x.n), "ae-n");
      celda(f, fecha(x.primero) + " · " + x.primero.nombre);
      celda(f, fecha(x.ultimo) + " · " + x.ultimo.nombre);
      return f;
    }));
  }

  function formas(lista) {
    const veces = contar(lista, (t) => t.formas);
    $("oa-tabla-formas").tBodies[0].replaceChildren(...datos.variantes.filter((v) => veces.get(v.forma)).map((v) => {
      const f = document.createElement("tr");
      celda(f, v.forma, "", true);
      celda(f, miles(veces.get(v.forma)), "ae-n");
      const ul = document.createElement("ul"); ul.className = "oa-ejemplos";
      for (const e of v.comoAparece) { const li = document.createElement("li"); li.textContent = "«" + e + "»"; ul.appendChild(li); }
      celda(f, ul);
      return f;
    }));
  }

  const clave = (t) => (t.inicio || t.anio + "-00-00") + String(t.clave).padStart(8, "0");
  const rolesTexto = (t) => t.roles.map((r) => NOMBRE_ROL[r]).join(", ");
  const lugar = (t) => [t.lugar, t.pais !== "Costa Rica" ? t.pais : ""].filter(Boolean).join(" · ");

  function ordenar(lista) {
    const { col, dir } = estado.orden;
    const valor = col === "inicio" ? clave : col === "roles" ? rolesTexto : col === "lugar" ? lugar : (t) => t[col];
    return lista.slice().sort((a, b) => {
      const x = valor(a), y = valor(b);
      const c = typeof x === "number" ? x - y : String(x).localeCompare(String(y), "es");
      return c * dir || (clave(b) < clave(a) ? -1 : 1);
    });
  }

  function tabla(lista) {
    const ordenada = ordenar(lista);
    const ver = ordenada.slice(0, estado.mostrar);
    $("oa-tabla-torneos").tBodies[0].replaceChildren(...ver.map((t) => {
      const f = document.createElement("tr");
      celda(f, fecha(t));
      const a = document.createElement("a");
      a.href = "https://chess-results.com/tnr" + t.clave + ".aspx?lan=2";
      a.target = "_blank"; a.rel = "noopener"; a.className = "underline underline-offset-2 hover:no-underline";
      a.textContent = t.nombre;
      celda(f, a, "", true);
      celda(f, rolesTexto(t) + (t.titulo ? " · " + t.titulo : ""));
      celda(f, t.tipo + (t.modalidad === "Equipos" ? " · por equipos" : ""));
      celda(f, t.ritmo === "Sin dato" ? "—" : t.ritmo);
      celda(f, lugar(t));
      celda(f, t.jugadores ? miles(t.jugadores) : "—", "ae-n");
      celda(f, t.rondas ? miles(t.rondas) : "—", "ae-n");
      return f;
    }));
    texto("oa-cuenta", lista.length ? (ver.length < lista.length ? "Se muestran " + miles(ver.length) + " de " + miles(lista.length) + " torneos." : miles(lista.length) + (lista.length === 1 ? " torneo." : " torneos.")) : "Ningún torneo cumple con estos filtros.");
    $("oa-mas").hidden = ver.length >= lista.length;
    $("oa-mas").textContent = "Mostrar " + miles(Math.min(PASO, lista.length - ver.length)) + " más";
    $("oa-excel").disabled = !lista.length;
    for (const th of $("oa-tabla-torneos").tHead.rows[0].cells) {
      const col = th.querySelector("button").dataset.col;
      th.setAttribute("aria-sort", col === estado.orden.col ? (estado.orden.dir < 0 ? "descending" : "ascending") : "none");
    }
  }

  function excel() {
    const lista = ordenar(filtrados());
    const filas = [["Inicio", "Fin", "Torneo", "Rol", "Título", "Tipo", "Modalidad", "Ritmo", "Lugar", "País", "Jugadores", "Rondas", "Enlace"]]
      .concat(lista.map((t) => [t.inicio || String(t.anio), t.fin, t.nombre, rolesTexto(t), t.titulo, t.tipo, t.modalidad, t.ritmo, t.lugar, t.pais, t.jugadores, t.rondas, "https://chess-results.com/tnr" + t.clave + ".aspx?lan=2"]));
    window.TablaExcel.bajar("torneos-oscar-angulo.xlsx", [{ nombre: "Torneos", filas }]);
  }

  function pintar() {
    ponerControles();
    const lista = filtrados();
    cifras(lista);
    resumenes();
    titulos(lista);
    formas(lista);
    tabla(lista);
  }

  // ---------- Arranque ----------

  function conectar() {
    let espera = null;
    $("oa-buscar").addEventListener("input", (e) => { clearTimeout(espera); const v = e.target.value; espera = setTimeout(() => cambiar({ q: v }), 200); });
    for (const k of SELECTS) $("oa-" + k).addEventListener("change", (e) => cambiar({ [k]: e.target.value }));
    $("oa-desde").addEventListener("change", (e) => cambiar({ desde: parseInt(e.target.value, 10) }));
    $("oa-hasta").addEventListener("change", (e) => cambiar({ hasta: parseInt(e.target.value, 10) }));
    $("oa-quitar").addEventListener("click", () => { cambiar({ q: "", rol: "", tipo: "", ritmo: "", modalidad: "", pais: "", titulo: "", forma: "", desde: PRIMER, hasta: ULTIMO }); $("oa-buscar").focus(); });
    $("oa-mas").addEventListener("click", () => { estado.mostrar += PASO; tabla(filtrados()); });
    $("oa-excel").addEventListener("click", excel);
    for (const b of $("oa-tabla-torneos").tHead.querySelectorAll("button")) {
      b.addEventListener("click", () => {
        const col = b.dataset.col;
        estado.orden = { col, dir: estado.orden.col === col ? -estado.orden.dir : (col === "inicio" || col === "jugadores" || col === "rondas" ? -1 : 1) };
        tabla(filtrados());
      });
    }
  }

  fetch("data/oscar-angulo-torneos.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then((d) => {
      datos = d;
      torneos = d.torneos.map((t) => ({ ...t, busca: sinTildes([t.nombre, t.lugar, t.pais, t.tipo].join(" ")) }));
      NOMBRE_ROL = Object.fromEntries(d.roles.map((r) => [r.codigo, r.nombre]));
      PRIMER = Math.min(...torneos.map((t) => t.anio)); ULTIMO = Math.max(...torneos.map((t) => t.anio));
      texto("oa-id", d.idFide);
      const [a, m, dia] = d.actualizado.split("-");
      texto("oa-actualizado", dia + "/" + m + "/" + a);
      llenarFiltros();
      leerDireccion();
      conectar();
      pintar();
    })
    .catch(() => { texto("oa-tesis", "No se pudieron cargar los datos. Vuelve a cargar la página en un momento."); });
})();
