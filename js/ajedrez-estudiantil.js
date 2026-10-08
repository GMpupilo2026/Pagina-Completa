/* ajedrez-estudiantil.html: la participación en los torneos estudiantiles de
 * Costa Rica publicados en chess-results.com, por año, etapa, región y
 * categoría. Los datos son data/ajedrez-estudiantil.json (lo arma
 * herramientas/ajedrez-estudiantil.py) y todo se cuenta acá, en el navegador:
 * son 1082 filas fijas, no una tabla de la base.
 *
 * «Participaciones» es la suma de inscritos de los torneos de ritmo clásico
 * (individuales y por equipos): un mismo estudiante cuenta una vez por etapa y
 * por modalidad. Los blitz y rápidos no se suman porque repiten a los mismos
 * jugadores del clásico.
 *
 * Los filtros (región y categoría) van en la dirección (?region=…&categoria=…)
 * para que un enlace compartido abra la misma vista.
 */
(function () {
  "use strict";

  const ETAPAS = [
    { k: "institucional", n: "Institucional o circuital", clase: "ae-e1" },
    { k: "regional", n: "Regional", clase: "ae-e2" },
    { k: "interregional", n: "Interregional", clase: "ae-e3" },
    { k: "nacional", n: "Nacional", clase: "ae-e4" }
  ];
  const CLAVE_ETAPA = { "Institucional o circuital": "institucional", "Regional": "regional", "Interregional": "interregional", "Nacional": "nacional" };
  const INTERNACIONAL = ["Internacional (CODICADER)", "Internacional federativo", "Otro estudiantil"];
  const CATEGORIAS = ["A", "B", "C", "D", "E"];
  const PRIMER_ANIO = 2008, ULTIMO_ANIO = 2026;
  const SVG = "http://www.w3.org/2000/svg";

  const numero = new Intl.NumberFormat("es-CR");
  const miles = (n) => numero.format(n);
  const decimal = new Intl.NumberFormat("es-CR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const veces = (v) => "×" + decimal.format(v);
  const $ = (id) => document.getElementById(id);
  const texto = (id, t) => { $(id).textContent = t; };

  let torneos = [];
  let serie = new Map();          // "region|categoria|anio" → fila
  const estado = { region: "", categoria: "", orden: { col: "anio", dir: -1 } };

  // ---------- Las cuentas ----------

  function fila(region, categoria, anio) {
    const k = region + "|" + categoria + "|" + anio;
    if (!serie.has(k)) serie.set(k, { region, categoria, anio, institucional: 0, regional: 0, interregional: 0, nacional: 0, total: 0, torneos: 0, torneos_regionales: 0 });
    return serie.get(k);
  }

  function armarSerie() {
    serie = new Map();
    for (const t of torneos) {
      const k = CLAVE_ETAPA[t.etapa];
      if (!k) continue;
      const regiones = ["Todas"].concat(t.region && k !== "nacional" ? [t.region] : []);
      for (const r of regiones) {
        for (const c of ["Todas", t.categoria]) {
          const o = fila(r, c, t.anio);
          o.torneos += 1;
          if (k === "regional" || k === "institucional") o.torneos_regionales += 1;
          if (t.ritmo === "Clásico") { o[k] += t.jugadores; o.total += t.jugadores; }
        }
      }
    }
    const combos = new Set([...serie.values()].map((o) => o.region + "|" + o.categoria));
    for (const c of combos) {
      const [r, cat] = c.split("|");
      for (let y = PRIMER_ANIO; y <= ULTIMO_ANIO; y++) fila(r, cat, y);
    }
  }

  const anios = (region, categoria) => {
    const out = [];
    for (let y = PRIMER_ANIO; y <= ULTIMO_ANIO; y++) out.push(serie.get(region + "|" + categoria + "|" + y) || fila(region, categoria, y));
    return out;
  };

  // Regiones distintas con torneos de etapa regional o de circuito, por año.
  function regionesPorAnio(categoria) {
    const cuenta = {};
    for (const o of serie.values()) {
      if (o.region === "Todas" || o.categoria !== categoria) continue;
      if (o.torneos_regionales > 0) cuenta[o.anio] = (cuenta[o.anio] || 0) + 1;
    }
    return cuenta;
  }

  function resumen(region, categoria) {
    const filas = anios(region, categoria);
    const con = filas.filter((r) => r.torneos > 0);
    const p = (y) => filas.find((r) => r.anio === y).total;
    const reg = regionesPorAnio(categoria);
    return {
      part2023: p(2023), part2026: p(2026),
      veces: p(2023) > 0 && p(2026) > 0 ? p(2026) / p(2023) : null,
      primer: con.length ? Math.min(...con.map((r) => r.anio)) : null,
      ultimo: con.length ? Math.max(...con.map((r) => r.anio)) : null,
      anios: con.length,
      torneos: con.reduce((s, r) => s + r.torneos, 0),
      regiones2023: reg[2023] || 0, regiones2026: reg[2026] || 0,
      finalEn: (y) => filas.find((r) => r.anio === y).nacional > 0
    };
  }

  const R = () => estado.region || "Todas";
  const C = () => estado.categoria || "Todas";
  function ambito() {
    const r = estado.region, c = estado.categoria;
    if (r && c) return r + ", categoría " + c;
    if (r) return r;
    if (c) return "la categoría " + c;
    return "";
  }
  const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // ---------- SVG a mano ----------

  function el(nombre, attrs, padre) {
    const n = document.createElementNS(SVG, nombre);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
    if (padre) padre.appendChild(n);
    return n;
  }

  function pasoEjes(max) {
    if (max <= 0) return 1;
    const crudo = max / 4;
    const p = Math.pow(10, Math.floor(Math.log10(crudo)));
    const m = crudo / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  }

  function tooltip(caja) {
    let t = caja.querySelector(".ae-tip");
    if (!t) { t = document.createElement("div"); t.className = "ae-tip"; t.hidden = true; caja.appendChild(t); }
    return t;
  }

  function mostrarTip(caja, t, titulo, lineas, x, y) {
    t.replaceChildren();
    const h = document.createElement("div"); h.className = "ae-tip-t"; h.textContent = titulo; t.appendChild(h);
    for (const [clase, nombre, valor] of lineas) {
      const l = document.createElement("div"); l.className = "ae-tip-l";
      const a = document.createElement("span");
      if (clase) { const i = document.createElement("i"); i.className = "ae-muestra " + clase; a.appendChild(i); }
      a.appendChild(document.createTextNode(nombre));
      const b = document.createElement("span"); b.textContent = valor;
      l.append(a, b); t.appendChild(l);
    }
    t.hidden = false;
    const w = caja.clientWidth, tw = t.offsetWidth;
    t.style.left = Math.max(0, Math.min(w - tw, x - tw / 2)) + "px";
    t.style.top = Math.max(0, y - t.offsetHeight - 10) + "px";
  }

  /* Barras por año, apiladas por capas. `capas`: [{k, clase, n}]; con una sola
     capa es un gráfico de barras simple. Cada año es un blanco que se alcanza
     con Tab y dice su valor (al pasar el puntero o al tener el foco). */
  function barras(caja, datos, capas, opciones) {
    const H = opciones.alto, W = Math.max(280, caja.clientWidth);
    caja.querySelectorAll("svg").forEach((s) => s.remove());
    const tip = tooltip(caja); tip.hidden = true;
    const total = (d) => capas.reduce((s, c) => s + d[c.k], 0);
    const max = Math.max(1, ...datos.map(total));
    const paso = pasoEjes(max), tope = Math.ceil(max / paso) * paso;
    const ticks = []; for (let v = 0; v <= tope; v += paso) ticks.push(v);
    const izq = 10 + 7.5 * Math.max(...ticks.map((v) => miles(v).length)), der = 4, arr = 14, abj = 26;
    const banda = (W - izq - der) / datos.length, ancho = Math.max(2, banda * 0.72);
    const y = (v) => H - abj - (v / tope) * (H - abj - arr);
    const x = (i) => izq + i * banda + (banda - ancho) / 2;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H, "aria-hidden": "true", focusable: "false" });
    for (const v of ticks) {
      el("line", { x1: izq, x2: W - der, y1: y(v), y2: y(v), class: "ae-rejilla" }, svg);
      el("text", { x: izq - 6, y: y(v) + 4, "text-anchor": "end", class: "ae-eje" }, svg).textContent = miles(v);
    }
    const cada = W < 420 ? 3 : W < 640 ? 2 : 1;
    datos.forEach((d, i) => {
      if ((datos.length - 1 - i) % cada === 0) el("text", { x: x(i) + ancho / 2, y: H - 8, "text-anchor": "middle", class: "ae-eje" }, svg).textContent = cada > 1 ? "'" + String(d.anio).slice(2) : d.anio;
    });
    if (opciones.pandemia) {
      const i0 = datos.findIndex((d) => d.anio === 2020), i1 = datos.findIndex((d) => d.anio === 2021);
      if (i0 >= 0 && i1 >= 0) {
        const x0 = izq + i0 * banda, x1 = izq + (i1 + 1) * banda;
        el("rect", { x: x0, y: arr, width: x1 - x0, height: H - abj - arr, class: "ae-pandemia" }, svg);
        if (W >= 480) {
          const t = el("text", { x: (x0 + x1) / 2, y: (arr + H - abj) / 2, "text-anchor": "middle", class: "ae-eje" }, svg);
          t.textContent = "Pandemia";
          el("tspan", { x: (x0 + x1) / 2, dy: "1.2em" }, t).textContent = "sin torneos";
        }
      }
    }
    datos.forEach((d, i) => {
      let base = 0;
      const tot = total(d);
      capas.forEach((c, j) => {
        const v = d[c.k];
        if (v <= 0) return;
        const arriba = base + v;
        const esTope = capas.slice(j + 1).every((cc) => d[cc.k] <= 0);
        const y0 = y(base), y1 = y(arriba);
        const alto = Math.max(0, y0 - y1 - (base > 0 ? 2 : 0));
        el("rect", { x: x(i), y: y1, width: ancho, height: alto, rx: esTope ? 3 : 0, class: "ae-barra " + (opciones.resaltar && d.anio !== opciones.resaltar ? "ae-apagada" : c.clase) }, svg);
        base = arriba;
      });
      if (tot > 0 && i === datos.length - 1) el("text", { x: x(i) + ancho / 2, y: y(tot) - 5, "text-anchor": "middle", class: "ae-valor" }, svg).textContent = miles(tot);
    });
    caja.insertBefore(svg, tip);
    // Blancos para el puntero y el teclado, uno por año.
    caja.querySelectorAll(".ae-blanco").forEach((b) => b.remove());
    datos.forEach((d, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "ae-blanco";
      b.style.left = (izq + i * banda) / W * 100 + "%";
      b.style.width = banda / W * 100 + "%";
      b.style.height = (H - abj) + "px";
      const tot = total(d);
      const lineas = tot > 0
        ? capas.slice().reverse().filter((c) => d[c.k] > 0).map((c) => [capas.length > 1 ? c.clase : null, c.n, opciones.formato(d[c.k])]).concat(capas.length > 1 ? [[null, "Total", opciones.formato(tot)]] : [])
        : [[null, opciones.vacio, ""]];
      b.setAttribute("aria-label", d.anio + ": " + lineas.map((l) => l[1] + (l[2] ? " " + l[2] : "")).join(", "));
      const ver = () => mostrarTip(caja, tip, String(d.anio) + (opciones.torneos && d.torneos ? " · " + d.torneos + " torneos" : ""), lineas, (x(i) + ancho / 2) / W * caja.clientWidth, Math.min(y(tot), H - 70));
      b.addEventListener("pointerenter", ver);
      b.addEventListener("focus", ver);
      b.addEventListener("pointerleave", () => { tip.hidden = true; });
      b.addEventListener("blur", () => { tip.hidden = true; });
      caja.appendChild(b);
    });
  }

  // ---------- Lo que se pinta ----------

  function cifras() {
    const r = estado.region, c = estado.categoria, a = ambito();
    const x = resumen(R(), C());
    texto("ae-c1-et", a ? "Participaciones de " + a + ", 2026" : "Participaciones en los JDE, 2026");
    texto("ae-c1-nota", r ? "etapas institucional, regional e interregional" : "todas las etapas, ritmo clásico");
    texto("ae-c1", miles(x.part2026));
    if (x.veces != null) { texto("ae-c2", veces(x.veces)); texto("ae-c2-nota", "2023 tuvo " + miles(x.part2023) + " participaciones"); }
    else { texto("ae-c2", "—"); texto("ae-c2-nota", x.part2026 > 0 ? "sin torneos en chess-results en 2023" : "sin torneos en chess-results en 2026; en 2023 tuvo " + miles(x.part2023)); }
    if (r) { texto("ae-c3-et", "Años con torneos en chess-results"); texto("ae-c3", x.anios); texto("ae-c3-nota", x.primer ? "el primero, " + x.primer : ""); }
    else { texto("ae-c3-et", "Regiones con su eliminatoria en chess-results, 2026"); texto("ae-c3", x.regiones2026); texto("ae-c3-nota", "en 2023 eran " + x.regiones2023); }
    texto("ae-c4-et", a ? "Torneos de " + a : "Torneos de los JDE encontrados");
    texto("ae-c4", miles(x.torneos));
    texto("ae-c4-nota", a ? "de todos los años, en todas sus etapas" : "de 2011 a 2026");

    let frase;
    if (!r && !c) {
      frase = "Los Juegos Deportivos Estudiantiles pasaron de " + miles(x.part2023) + " participaciones en chess-results en 2023 a " + miles(x.part2026) + " en 2026. Buena parte de ese salto es registro: las regiones que publican su eliminatoria pasaron de " + x.regiones2023 + " a " + x.regiones2026 + ".";
    } else if (x.part2026 > 0) {
      frase = mayuscula(a) + " suma " + miles(x.part2026) + " participaciones en chess-results en 2026";
      frase += x.part2023 > 0 ? ", contra " + miles(x.part2023) + " en 2023." : "; en 2023 no hay torneos suyos en el sitio.";
      frase += r ? " Tiene torneos en " + x.anios + (x.anios === 1 ? " año" : " años") + ", desde " + x.primer + "." : " Las regiones con eliminatoria de esta categoría pasaron de " + x.regiones2023 + " a " + x.regiones2026 + ".";
      if (!r && x.finalEn(2023) !== x.finalEn(2026)) frase += " Ojo al comparar: la final nacional de esta categoría está en chess-results en " + (x.finalEn(2026) ? "2026 y no en 2023." : "2023 y no en 2026.");
    } else if (x.ultimo) {
      frase = mayuscula(a) + " no tiene torneos de ritmo clásico en chess-results en 2026; su último año con torneos es " + x.ultimo + ".";
    } else {
      frase = "No hay torneos de " + a + " en chess-results.";
    }
    texto("ae-tesis", frase);
  }

  function grafEtapas() {
    const a = ambito();
    texto("ae-etapas-t", a ? "Participaciones de " + a + " por año y etapa" : "Participaciones en los JDE por año y etapa");
    const capas = estado.region ? ETAPAS.filter((e) => e.k !== "nacional") : ETAPAS;
    const ley = $("ae-leyenda");
    ley.replaceChildren(...capas.map((e) => { const s = document.createElement("span"); const i = document.createElement("i"); i.className = "ae-muestra " + e.clase; s.append(i, document.createTextNode(e.n)); return s; }));
    const datos = anios(R(), C());
    barras($("ae-graf-etapas"), datos, capas, { alto: 320, formato: miles, vacio: "Sin torneos en chess-results", pandemia: true, torneos: true });
    // La misma información, como tabla.
    const thead = $("ae-tabla-etapas").tHead, tbody = $("ae-tabla-etapas").tBodies[0];
    const tr = document.createElement("tr");
    ["Año"].concat(capas.map((e) => e.n), ["Total", "Torneos"]).forEach((h, i) => { const th = document.createElement("th"); th.scope = "col"; th.textContent = h; if (i > 0) th.className = "ae-n"; tr.appendChild(th); });
    thead.replaceChildren(tr);
    tbody.replaceChildren(...datos.filter((d) => d.torneos > 0).map((d) => {
      const f = document.createElement("tr");
      [d.anio].concat(capas.map((e) => miles(d[e.k])), [miles(capas.reduce((s, e) => s + d[e.k], 0)), d.torneos]).forEach((v, i) => { const td = document.createElement(i === 0 ? "th" : "td"); if (i === 0) td.scope = "row"; td.textContent = v; if (i > 0) td.className = "ae-n"; f.appendChild(td); });
      return f;
    }));
  }

  function grafRegiones() {
    const r = estado.region, c = estado.categoria;
    const caja = $("ae-graf-regiones");
    if (r) {
      texto("ae-regiones-t", "Torneos de " + ambito() + " por año");
      texto("ae-regiones-sub", "Torneos de la región en las etapas institucional, regional e interregional, de todos los ritmos.");
      const datos = anios(R(), C()).filter((d) => d.anio >= 2011).map((d) => ({ anio: d.anio, v: d.torneos }));
      barras(caja, datos, [{ k: "v", n: "Torneos", clase: "ae-e2" }], { alto: 220, formato: miles, vacio: "Sin torneos", resaltar: 2026 });
    } else {
      texto("ae-regiones-t", c ? "Regiones que suben su eliminatoria de la categoría " + c : "Regiones que suben su eliminatoria");
      texto("ae-regiones-sub", "Direcciones regionales del MEP con torneos de etapa regional o de circuito en chess-results. Buena parte del salto de 2024 viene de acá: más regiones empezaron a publicar.");
      const cuenta = regionesPorAnio(C());
      const datos = []; for (let y = 2011; y <= ULTIMO_ANIO; y++) datos.push({ anio: y, v: cuenta[y] || 0 });
      barras(caja, datos, [{ k: "v", n: "Regiones", clase: "ae-e2" }], { alto: 220, formato: String, vacio: "Ninguna región", resaltar: 2026 });
    }
  }

  function grafNacional() {
    $("ae-nacional-nota").hidden = !estado.region;
    const datos = anios("Todas", C()).filter((d) => d.anio >= 2011).map((d) => ({ anio: d.anio, v: d.nacional }));
    barras($("ae-graf-nacional"), datos, [{ k: "v", n: estado.categoria ? "Final, categoría " + estado.categoria : "Participaciones en la final", clase: "ae-e4" }], { alto: 220, formato: miles, vacio: "Sin final en chess-results", resaltar: 2026 });
  }

  function multiples() {
    const caja = $("ae-multi");
    texto("ae-multi-t", estado.categoria ? "La etapa regional de la categoría " + estado.categoria + ", región por región" : "La etapa regional, región por región");
    const anios4 = [2023, 2024, 2025, 2026];
    const por = new Map();
    for (const o of serie.values()) {
      if (o.region === "Todas" || o.categoria !== C() || o.anio < 2023) continue;
      const p = o.regional + o.institucional;
      if (p <= 0) continue;
      if (!por.has(o.region)) por.set(o.region, {});
      por.get(o.region)[o.anio] = p;
    }
    const elegida = estado.region;
    const suma = (k) => Object.values(por.get(k)).reduce((s, v) => s + v, 0);
    let regiones = [...por.keys()].filter((k) => Object.keys(por.get(k)).length >= 2 || k === elegida).sort((a, b) => suma(b) - suma(a));
    if (elegida && regiones.includes(elegida)) regiones = [elegida].concat(regiones.filter((k) => k !== elegida));
    caja.replaceChildren();
    if (!regiones.length) { const p = document.createElement("p"); p.className = "ae-tarjeta-sub"; p.textContent = "Ninguna región tiene torneos de esta categoría en dos o más de estos años."; caja.appendChild(p); return; }
    const max = Math.max(1, ...regiones.flatMap((k) => Object.values(por.get(k))));
    for (const reg of regiones) {
      const fig = document.createElement("figure");
      const cap = document.createElement("figcaption");
      cap.textContent = reg + (reg === elegida ? " · elegida" : "");
      fig.appendChild(cap);
      const W = 160, H = 96;
      const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H, role: "img" }, fig);
      const desc = anios4.map((a) => a + ": " + (por.get(reg)[a] ? miles(por.get(reg)[a]) : "sin torneos")).join("; ");
      el("title", {}, svg).textContent = reg + ". " + desc;
      el("line", { x1: 0, x2: W, y1: H - 16, y2: H - 16, class: "ae-rejilla" }, svg);
      const banda = W / 4, ancho = banda * 0.7;
      anios4.forEach((a, i) => {
        const x = i * banda + (banda - ancho) / 2;
        el("text", { x: x + ancho / 2, y: H - 3, "text-anchor": "middle", class: "ae-eje ae-eje-chico" }, svg).textContent = "'" + String(a).slice(2);
        const v = por.get(reg)[a];
        if (!v) return;
        const alto = (v / max) * (H - 32);
        el("rect", { x, y: H - 16 - alto, width: ancho, height: alto, rx: 3, class: "ae-barra " + (!elegida || reg === elegida ? "ae-e2" : "ae-apagada") }, svg);
        el("text", { x: x + ancho / 2, y: H - 19 - alto, "text-anchor": "middle", class: "ae-valor ae-eje-chico" }, svg).textContent = miles(v);
      });
      caja.appendChild(fig);
    }
  }

  function tablaInternacional() {
    $("ae-int-nota").hidden = !estado.region && !estado.categoria;
    const grupos = new Map();
    for (const t of torneos) {
      if (!INTERNACIONAL.includes(t.etapa)) continue;
      const k = t.anio + "|" + t.etapa;
      if (!grupos.has(k)) grupos.set(k, { anio: t.anio, etapa: t.etapa, torneos: 0, jugadores: 0 });
      const g = grupos.get(k);
      g.torneos += 1;
      if (t.ritmo === "Clásico") g.jugadores += t.jugadores;
    }
    const tbody = $("ae-tabla-int").tBodies[0];
    tbody.replaceChildren(...[...grupos.values()].sort((a, b) => a.anio - b.anio || a.etapa.localeCompare(b.etapa)).map((g) => {
      const tr = document.createElement("tr");
      [g.anio, g.etapa, miles(g.torneos), g.jugadores ? miles(g.jugadores) : "sin inscritos aún"].forEach((v, i) => { const td = document.createElement(i === 0 ? "th" : "td"); if (i === 0) td.scope = "row"; td.textContent = v; if (i >= 2) td.className = "ae-n"; tr.appendChild(td); });
      return tr;
    }));
  }

  function tablaTorneos() {
    const a = ambito();
    texto("ae-torneos-t", a ? "Torneos de " + a : "Todos los torneos");
    const q = $("ae-buscar").value.trim().toLowerCase();
    const et = $("ae-etapa").value;
    const base = torneos.filter((t) => (!estado.region || t.region === estado.region) && (!estado.categoria || t.categoria === estado.categoria));
    const { col, dir } = estado.orden;
    const num = col === "anio" || col === "jugadores";
    const filas = base
      .filter((t) => (!et || t.etapa === et) && (!q || (t.nombre + " " + t.lugar + " " + t.region).toLowerCase().includes(q)))
      .sort((x, y) => {
        const A = x[col], B = y[col];
        const k = num ? A - B : String(A).localeCompare(String(B), "es");
        return k * dir || (x.inicio < y.inicio ? 1 : x.inicio > y.inicio ? -1 : 0);
      });
    const frag = document.createDocumentFragment();
    for (const t of filas) {
      const tr = document.createElement("tr");
      [t.anio, t.etapa, t.categoria, null, t.lugar, t.region, miles(t.jugadores)].forEach((v, i) => {
        const td = document.createElement("td");
        if (i === 3) {
          const enlace = document.createElement("a");
          enlace.href = "https://chess-results.com/tnr" + t.clave + ".aspx?lan=2";
          enlace.target = "_blank"; enlace.rel = "noopener";
          enlace.textContent = t.nombre;
          td.appendChild(enlace);
        } else td.textContent = v;
        if (i === 6) td.className = "ae-n";
        tr.appendChild(td);
      });
      frag.appendChild(tr);
    }
    $("ae-tabla-torneos").tBodies[0].replaceChildren(frag);
    texto("ae-cuenta", miles(filas.length) + " de " + miles(base.length) + " torneos");
    document.querySelectorAll("#ae-tabla-torneos th").forEach((th) => {
      const c = th.querySelector("button").dataset.col;
      th.setAttribute("aria-sort", c === col ? (dir > 0 ? "ascending" : "descending") : "none");
    });
  }

  function filtros() {
    $("ae-region").value = estado.region;
    $("ae-categoria").value = estado.categoria;
    $("ae-quitar").hidden = !estado.region && !estado.categoria;
    const p = new URLSearchParams();
    if (estado.region) p.set("region", estado.region);
    if (estado.categoria) p.set("categoria", estado.categoria);
    const q = p.toString();
    history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + location.hash);
  }

  function dibujar() {
    filtros();
    cifras();
    grafEtapas();
    grafRegiones();
    grafNacional();
    multiples();
    tablaInternacional();
    tablaTorneos();
  }

  // ---------- Arranque ----------

  async function iniciar() {
    let datos;
    try {
      const r = await fetch("data/ajedrez-estudiantil.json", { cache: "no-cache" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      datos = await r.json();
    } catch (e) {
      texto("ae-tesis", "No se pudieron cargar los datos. Revisa tu conexión y vuelve a abrir la página.");
      return;
    }
    torneos = datos.torneos.map((f) => Object.fromEntries(datos.columnas.map((c, i) => [c, f[i]])));
    armarSerie();
    texto("ae-consulta", "Datos consultados en chess-results el " + window.HoraCR.fecha(datos.consulta, { day: "numeric", month: "long", year: "numeric" }) + ".");

    const regiones = [...new Set(torneos.map((t) => t.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    $("ae-region").append(...regiones.map((x) => new Option(x, x)));
    $("ae-categoria").append(...CATEGORIAS.map((x) => new Option(x, x)));
    $("ae-etapa").append(...[...new Set(torneos.map((t) => t.etapa))].sort((a, b) => a.localeCompare(b, "es")).map((x) => new Option(x, x)));

    const p = new URLSearchParams(location.search);
    if (regiones.includes(p.get("region"))) estado.region = p.get("region");
    if (CATEGORIAS.includes(p.get("categoria"))) estado.categoria = p.get("categoria");

    $("ae-region").addEventListener("change", (e) => { estado.region = e.target.value; dibujar(); });
    $("ae-categoria").addEventListener("change", (e) => { estado.categoria = e.target.value; dibujar(); });
    $("ae-quitar").addEventListener("click", () => { estado.region = ""; estado.categoria = ""; dibujar(); $("ae-region").focus(); });
    $("ae-buscar").addEventListener("input", tablaTorneos);
    $("ae-etapa").addEventListener("change", tablaTorneos);
    document.querySelectorAll("#ae-tabla-torneos th button").forEach((b) => b.addEventListener("click", () => {
      const c = b.dataset.col;
      estado.orden.dir = estado.orden.col === c ? -estado.orden.dir : (c === "anio" || c === "jugadores" ? -1 : 1);
      estado.orden.col = c;
      tablaTorneos();
    }));
    let ancho = window.innerWidth;
    window.addEventListener("resize", () => {
      if (Math.abs(window.innerWidth - ancho) < 40) return;
      ancho = window.innerWidth;
      grafEtapas(); grafRegiones(); grafNacional();
    });
    dibujar();
  }

  iniciar();
})();
