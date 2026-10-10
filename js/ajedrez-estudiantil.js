/* ajedrez-estudiantil.html: la participación en los torneos estudiantiles de
 * Costa Rica publicados en chess-results.com, por año, etapa, región y
 * categoría. Los datos son data/ajedrez-estudiantil.json (lo arma
 * herramientas/ajedrez-estudiantil.py) y todo se cuenta acá, en el navegador:
 * son las filas fijas de un archivo, no una tabla de la base.
 *
 * «Participaciones» es la suma de inscritos de los torneos de ritmo clásico
 * (individuales y por equipos): un mismo estudiante cuenta una vez por etapa y
 * por modalidad. Los blitz y rápidos no se suman porque repiten a los mismos
 * jugadores del clásico.
 *
 * Los filtros (una o varias regiones, categoría, etapa, modalidad, rama y los
 * años) cambian todo lo de la página y van en la dirección
 * (?region=Cartago&region=Heredia&categoria=D&desde=2022…) para que un enlace
 * compartido abra la misma vista. Con cinco filtros que se combinan, las
 * cuentas se hacen cada vez sobre los torneos que pasan (son unos 1400).
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
  const MODALIDADES = { Individual: "individual", Equipos: "por equipos" };
  const RAMAS = { Abierta: "abierta", Femenina: "femenina" };
  // El año de la historia de la portada: desde 2023 las regiones empezaron a
  // publicar su eliminatoria. Sin elegir años, las cifras comparan contra él.
  const ANIO_COMPARACION = 2023;
  const SVG = "http://www.w3.org/2000/svg";

  const numero = new Intl.NumberFormat("es-CR");
  const miles = (n) => numero.format(n);
  const decimal = new Intl.NumberFormat("es-CR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const veces = (v) => "×" + decimal.format(v);
  const $ = (id) => document.getElementById(id);
  const texto = (id, t) => { $(id).textContent = t; };

  let torneos = [];
  let PRIMER = 2009, ULTIMO = 2026;   // el primer y el último año con torneos; salen de los datos
  let REGIONES = [];
  const estado = { regiones: [], categoria: "", etapa: "", modalidad: "", rama: "", desde: 0, hasta: 0, orden: { col: "anio", dir: -1 } };

  // ---------- Las cuentas ----------

  // Categoría, modalidad y rama: valen para todo lo de la página.
  const pasaComunes = (t) => (!estado.categoria || t.categoria === estado.categoria)
    && (!estado.modalidad || t.modalidad === estado.modalidad)
    && (!estado.rama || t.rama === estado.rama);
  // Con regiones elegidas, la final nacional queda fuera: no es de ninguna región.
  const pasaRegion = (t) => !estado.regiones.length || (estado.regiones.includes(t.region) && t.etapa !== "Nacional");
  const enRango = (t) => t.anio >= estado.desde && t.anio <= estado.hasta;
  const etapasVisibles = () => estado.etapa ? ETAPAS.filter((e) => e.k === estado.etapa)
    : estado.regiones.length ? ETAPAS.filter((e) => e.k !== "nacional") : ETAPAS;

  /* Una fila por año del rango, con las participaciones de cada etapa y los
     torneos. `conRegion: false` ignora las regiones elegidas (la final);
     `etapas` dice cuáles contar (por omisión, las visibles). */
  function porAnio(opciones) {
    const o = opciones || {};
    const ver = new Set((o.etapas || etapasVisibles()).map((e) => e.k));
    const filas = new Map();
    for (let y = estado.desde; y <= estado.hasta; y++) filas.set(y, { anio: y, institucional: 0, regional: 0, interregional: 0, nacional: 0, total: 0, torneos: 0 });
    for (const t of torneos) {
      const k = CLAVE_ETAPA[t.etapa];
      if (!k || !ver.has(k) || !enRango(t) || !pasaComunes(t)) continue;
      if (o.conRegion !== false && !pasaRegion(t)) continue;
      const f = filas.get(t.anio);
      f.torneos += 1;
      if (t.ritmo === "Clásico") { f[k] += t.jugadores; f.total += t.jugadores; }
    }
    return [...filas.values()];
  }

  // Regiones distintas con torneos de etapa regional o de circuito, por año
  // (con la categoría, la modalidad y la rama elegidas; no con las regiones).
  function regionesPorAnio() {
    const por = {};
    for (const t of torneos) {
      const k = CLAVE_ETAPA[t.etapa];
      if ((k !== "regional" && k !== "institucional") || !t.region || !enRango(t) || !pasaComunes(t)) continue;
      (por[t.anio] = por[t.anio] || new Set()).add(t.region);
    }
    const cuenta = {};
    for (const y in por) cuenta[y] = por[y].size;
    return cuenta;
  }

  // El año contra el que se compara el último: el «desde» elegido o, sin
  // elegirlo, 2023.
  function anioBase() {
    if (estado.desde >= estado.hasta) return null;
    if (estado.desde === PRIMER && ANIO_COMPARACION > estado.desde && ANIO_COMPARACION < estado.hasta) return ANIO_COMPARACION;
    return estado.desde;
  }

  function resumen() {
    const filas = porAnio();
    const ref = estado.hasta, base = anioBase();
    const de = (y) => (filas.find((r) => r.anio === y) || { total: 0 }).total;
    const con = filas.filter((r) => r.torneos > 0);
    const reg = regionesPorAnio();
    const finales = porAnio({ conRegion: false, etapas: ETAPAS.filter((e) => e.k === "nacional") });
    return {
      ref, base, pRef: de(ref), pBase: base ? de(base) : 0,
      veces: base && de(base) > 0 && de(ref) > 0 ? de(ref) / de(base) : null,
      primer: con.length ? Math.min(...con.map((r) => r.anio)) : null,
      ultimo: con.length ? Math.max(...con.map((r) => r.anio)) : null,
      anios: con.length,
      torneos: con.reduce((s, r) => s + r.torneos, 0),
      regRef: reg[ref] || 0, regBase: base ? reg[base] || 0 : 0,
      conTorneos: (y) => new Set(torneos.filter((t) => t.anio === y && CLAVE_ETAPA[t.etapa] && pasaComunes(t) && pasaRegion(t)).map((t) => t.region)).size,
      finalEn: (y) => (finales.find((r) => r.anio === y) || { nacional: 0 }).nacional > 0
    };
  }

  const lista = (xs) => xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " y " + xs[xs.length - 1];
  const nombreEtapa = (k) => ETAPAS.find((e) => e.k === k).n;
  const sinFiltros = () => !estado.regiones.length && !estado.categoria && !estado.etapa && !estado.modalidad && !estado.rama;
  const rangoCompleto = () => estado.desde === PRIMER && estado.hasta === ULTIMO;

  // «Cartago y Heredia, categoría D, etapa regional, por equipos, rama femenina»;
  // sin región, la primera parte lleva su artículo («la categoría D, …»).
  function ambito() {
    const partes = [];
    const conArticulo = !estado.regiones.length;
    if (estado.regiones.length) partes.push(lista(estado.regiones));
    if (estado.categoria) partes.push((conArticulo && !partes.length ? "la " : "") + "categoría " + estado.categoria);
    if (estado.etapa) partes.push((conArticulo && !partes.length ? "la " : "") + "etapa " + nombreEtapa(estado.etapa).toLowerCase());
    if (estado.modalidad) partes.push(conArticulo && !partes.length ? "los torneos " + (estado.modalidad === "Equipos" ? "por equipos" : "individuales") : MODALIDADES[estado.modalidad]);
    if (estado.rama) partes.push((conArticulo && !partes.length ? "la " : "") + "rama " + RAMAS[estado.rama]);
    return partes.join(", ");
  }

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
    const n = estado.regiones.length, a = ambito();
    const x = resumen();
    const periodo = estado.desde === estado.hasta ? "en " + estado.desde : "de " + estado.desde + " a " + estado.hasta;
    texto("ae-c1-et", a ? "Participaciones de " + a + ", " + x.ref : "Participaciones en los JDE, " + x.ref);
    texto("ae-c1-nota", (estado.etapa ? "etapa " + nombreEtapa(estado.etapa).toLowerCase() : n ? "etapas institucional, regional e interregional" : "todas las etapas") + ", ritmo clásico");
    texto("ae-c1", miles(x.pRef));
    texto("ae-c2-et", x.base ? "Crecimiento desde " + x.base : "Crecimiento");
    if (x.veces != null) { texto("ae-c2", veces(x.veces)); texto("ae-c2-nota", x.base + " tuvo " + miles(x.pBase) + " participaciones"); }
    else if (!x.base) { texto("ae-c2", "—"); texto("ae-c2-nota", "elige más de un año para comparar"); }
    else { texto("ae-c2", "—"); texto("ae-c2-nota", x.pRef > 0 ? "sin torneos en chess-results en " + x.base : "sin torneos en chess-results en " + x.ref + "; en " + x.base + " tuvo " + miles(x.pBase)); }
    if (n === 1) { texto("ae-c3-et", "Años con torneos en chess-results"); texto("ae-c3", x.anios); texto("ae-c3-nota", x.primer ? "el primero, " + x.primer : ""); }
    else if (n > 1) { texto("ae-c3-et", "Regiones elegidas con torneos en " + x.ref); texto("ae-c3", x.conTorneos(x.ref)); texto("ae-c3-nota", "de las " + n + " elegidas"); }
    else { texto("ae-c3-et", "Regiones con su eliminatoria en chess-results, " + x.ref); texto("ae-c3", x.regRef); texto("ae-c3-nota", x.base ? "en " + x.base + " eran " + x.regBase : ""); }
    texto("ae-c4-et", a ? "Torneos de " + a : "Torneos de los JDE encontrados");
    texto("ae-c4", miles(x.torneos));
    texto("ae-c4-nota", periodo + (a ? ", en sus etapas" : ""));

    let frase;
    if (sinFiltros() && x.base) {
      frase = "Los Juegos Deportivos Estudiantiles pasaron de " + miles(x.pBase) + " participaciones en chess-results en " + x.base + " a " + miles(x.pRef) + " en " + x.ref + ".";
      if (x.base <= ANIO_COMPARACION) frase += " Buena parte de ese salto es registro: las regiones que publican su eliminatoria pasaron de " + x.regBase + " a " + x.regRef + ".";
    } else if (x.pRef > 0) {
      frase = "En " + (a || "los JDE") + (a.includes(",") ? "," : "") + " hay " + miles(x.pRef) + " participaciones en chess-results en " + x.ref;
      if (x.base) frase += x.pBase > 0 ? ", contra " + miles(x.pBase) + " en " + x.base + "." : "; en " + x.base + " no hay ningún torneo en el sitio.";
      else frase += ".";
      if (n) frase += " Hay torneos en " + x.anios + (x.anios === 1 ? " año" : " años") + " de este periodo, desde " + x.primer + ".";
      else if (x.base) frase += " Las regiones con eliminatoria" + (estado.categoria ? " de esta categoría" : "") + " pasaron de " + x.regBase + " a " + x.regRef + ".";
      if (!n && estado.categoria && x.base && x.finalEn(x.base) !== x.finalEn(x.ref)) frase += " Ojo al comparar: la final nacional de esta categoría está en chess-results en " + (x.finalEn(x.ref) ? x.ref + " y no en " + x.base + "." : x.base + " y no en " + x.ref + ".");
    } else if (x.ultimo) {
      frase = "En " + (a || "los JDE") + (a.includes(",") ? "," : "") + " no hay torneos de ritmo clásico en chess-results en " + x.ref + "; el último año con torneos es " + x.ultimo + ".";
    } else {
      frase = "No hay torneos de " + (a || "los JDE") + " en chess-results " + periodo + ".";
    }
    texto("ae-tesis", frase);
  }

  function grafEtapas() {
    const a = ambito();
    texto("ae-etapas-t", a ? "Participaciones de " + a + " por año" + (estado.etapa ? "" : " y etapa") : "Participaciones en los JDE por año y etapa");
    const capas = etapasVisibles();
    const ley = $("ae-leyenda");
    ley.replaceChildren(...capas.map((e) => { const s = document.createElement("span"); const i = document.createElement("i"); i.className = "ae-muestra " + e.clase; s.append(i, document.createTextNode(e.n)); return s; }));
    const datos = porAnio();
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
    const n = estado.regiones.length;
    const caja = $("ae-graf-regiones");
    if (n) {
      texto("ae-regiones-t", "Torneos de " + ambito() + " por año");
      texto("ae-regiones-sub", (n === 1 ? "Torneos de la región" : "Torneos de las " + n + " regiones juntas") + (estado.etapa ? " en la etapa " + nombreEtapa(estado.etapa).toLowerCase() : " en las etapas institucional, regional e interregional") + ", de todos los ritmos." + (n > 1 ? " Para verlas una al lado de la otra, abajo está cada región por separado." : ""));
      const datos = porAnio().map((d) => ({ anio: d.anio, v: d.torneos }));
      barras(caja, datos, [{ k: "v", n: "Torneos", clase: "ae-e2" }], { alto: 220, formato: miles, vacio: "Sin torneos", resaltar: estado.hasta });
    } else {
      texto("ae-regiones-t", estado.categoria ? "Regiones que suben su eliminatoria de la categoría " + estado.categoria : "Regiones que suben su eliminatoria");
      texto("ae-regiones-sub", "Direcciones regionales del MEP con torneos de etapa regional o de circuito en chess-results. Buena parte del salto de 2024 viene de acá: más regiones empezaron a publicar.");
      const cuenta = regionesPorAnio();
      const datos = []; for (let y = estado.desde; y <= estado.hasta; y++) datos.push({ anio: y, v: cuenta[y] || 0 });
      barras(caja, datos, [{ k: "v", n: "Regiones", clase: "ae-e2" }], { alto: 220, formato: String, vacio: "Ninguna región", resaltar: estado.hasta });
    }
  }

  function grafNacional() {
    $("ae-nacional-nota").hidden = !estado.regiones.length;
    const datos = porAnio({ conRegion: false, etapas: ETAPAS.filter((e) => e.k === "nacional") }).map((d) => ({ anio: d.anio, v: d.nacional }));
    barras($("ae-graf-nacional"), datos, [{ k: "v", n: estado.categoria ? "Final, categoría " + estado.categoria : "Participaciones en la final", clase: "ae-e4" }], { alto: 220, formato: miles, vacio: "Sin final en chess-results", resaltar: estado.hasta });
  }

  /* Una cajita por región con los últimos cuatro años del rango, todas en la
     misma escala. Sin regiones elegidas, las que publicaron al menos dos de
     esos años; con regiones elegidas, solo esas, para compararlas. */
  function multiples() {
    const caja = $("ae-multi");
    const elegidas = estado.regiones;
    const etapa = estado.etapa && estado.etapa !== "nacional" ? [estado.etapa] : ["regional", "institucional"];
    texto("ae-multi-t", (estado.etapa && estado.etapa !== "nacional" ? "La etapa " + nombreEtapa(estado.etapa).toLowerCase() : "La etapa regional") + (estado.categoria ? " de la categoría " + estado.categoria : "") + ", región por región");
    const y1 = estado.hasta, y0 = Math.max(estado.desde, y1 - 3);
    const anios4 = []; for (let y = y0; y <= y1; y++) anios4.push(y);
    texto("ae-multi-sub", "Participaciones " + (y0 === y1 ? "de " + y0 : "de " + y0 + " a " + y1) + (elegidas.length ? " en las regiones elegidas" : " en las regiones que publicaron al menos " + (anios4.length > 1 ? "dos de esos años" : "ese año")) + ", todas en la misma escala. Un año en blanco es un año sin torneos de esa región en chess-results, no un año sin juegos.");
    caja.replaceChildren();
    const aviso = (t) => { const p = document.createElement("p"); p.className = "ae-tarjeta-sub"; p.textContent = t; caja.appendChild(p); };
    if (estado.etapa === "nacional") { aviso("La final nacional reúne a todo el país y no se separa por región."); return; }
    const por = new Map();
    for (const t of torneos) {
      if (!etapa.includes(CLAVE_ETAPA[t.etapa]) || !t.region || t.ritmo !== "Clásico" || t.anio < y0 || t.anio > y1 || !pasaComunes(t)) continue;
      if (elegidas.length && !elegidas.includes(t.region)) continue;
      if (!por.has(t.region)) por.set(t.region, {});
      const r = por.get(t.region);
      r[t.anio] = (r[t.anio] || 0) + t.jugadores;
    }
    for (const r of elegidas) if (!por.has(r)) por.set(r, {});
    const suma = (k) => Object.values(por.get(k)).reduce((s, v) => s + v, 0);
    const minimo = Math.min(2, anios4.length);
    const regiones = [...por.keys()].filter((k) => elegidas.length || Object.keys(por.get(k)).length >= minimo).sort((a, b) => suma(b) - suma(a));
    if (!regiones.length) { aviso("Ninguna región tiene torneos con estos filtros en " + (anios4.length > 1 ? "dos o más de estos años." : "ese año.")); return; }
    const max = Math.max(1, ...regiones.flatMap((k) => Object.values(por.get(k))));
    for (const reg of regiones) {
      const fig = document.createElement("figure");
      const cap = document.createElement("figcaption");
      cap.textContent = reg;
      fig.appendChild(cap);
      const W = 160, H = 96;
      const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H, role: "img" }, fig);
      const desc = anios4.map((a) => a + ": " + (por.get(reg)[a] ? miles(por.get(reg)[a]) : "sin torneos")).join("; ");
      el("title", {}, svg).textContent = reg + ". " + desc;
      el("line", { x1: 0, x2: W, y1: H - 16, y2: H - 16, class: "ae-rejilla" }, svg);
      const banda = W / Math.max(4, anios4.length), ancho = banda * 0.7;
      anios4.forEach((a, i) => {
        const x = i * banda + (banda - ancho) / 2;
        el("text", { x: x + ancho / 2, y: H - 3, "text-anchor": "middle", class: "ae-eje ae-eje-chico" }, svg).textContent = "'" + String(a).slice(2);
        const v = por.get(reg)[a];
        if (!v) return;
        const alto = (v / max) * (H - 32);
        el("rect", { x, y: H - 16 - alto, width: ancho, height: alto, rx: 3, class: "ae-barra ae-e2" }, svg);
        el("text", { x: x + ancho / 2, y: H - 19 - alto, "text-anchor": "middle", class: "ae-valor ae-eje-chico" }, svg).textContent = miles(v);
      });
      caja.appendChild(fig);
    }
  }

  function tablaInternacional() {
    $("ae-int-nota").hidden = !estado.regiones.length && !estado.categoria && !estado.etapa;
    const grupos = new Map();
    for (const t of torneos) {
      if (!INTERNACIONAL.includes(t.etapa) || !enRango(t)) continue;
      if ((estado.modalidad && t.modalidad !== estado.modalidad) || (estado.rama && t.rama !== estado.rama)) continue;
      const k = t.anio + "|" + t.etapa;
      if (!grupos.has(k)) grupos.set(k, { anio: t.anio, etapa: t.etapa, torneos: 0, jugadores: 0 });
      const g = grupos.get(k);
      g.torneos += 1;
      if (t.ritmo === "Clásico") g.jugadores += t.jugadores;
    }
    const tbody = $("ae-tabla-int").tBodies[0];
    const filas = [...grupos.values()].sort((a, b) => a.anio - b.anio || a.etapa.localeCompare(b.etapa));
    if (!filas.length) {
      const tr = document.createElement("tr"), td = document.createElement("td");
      td.colSpan = 4; td.textContent = "Ninguno con estos filtros.";
      tr.appendChild(td); tbody.replaceChildren(tr); return;
    }
    tbody.replaceChildren(...filas.map((g) => {
      const tr = document.createElement("tr");
      [g.anio, g.etapa, miles(g.torneos), g.jugadores ? miles(g.jugadores) : "sin inscritos aún"].forEach((v, i) => { const td = document.createElement(i === 0 ? "th" : "td"); if (i === 0) td.scope = "row"; td.textContent = v; if (i >= 2) td.className = "ae-n"; tr.appendChild(td); });
      return tr;
    }));
  }

  function tablaTorneos() {
    const a = ambito();
    texto("ae-torneos-t", a ? "Torneos de " + a : "Todos los torneos");
    const q = $("ae-buscar").value.trim().toLowerCase();
    const base = torneos.filter((t) => enRango(t) && pasaComunes(t)
      && (!estado.regiones.length || estado.regiones.includes(t.region))
      && (!estado.etapa || CLAVE_ETAPA[t.etapa] === estado.etapa));
    const { col, dir } = estado.orden;
    const num = col === "anio" || col === "jugadores";
    const filas = base
      .filter((t) => !q || (t.nombre + " " + t.lugar + " " + t.region).toLowerCase().includes(q))
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

  // ---------- Los filtros ----------

  function etiquetaRegiones() {
    const n = estado.regiones.length;
    return !n ? "Todo el país" : n === 1 ? estado.regiones[0] : n === 2 ? lista(estado.regiones) : n + " regiones";
  }

  function filtros() {
    $("ae-regiones-boton").textContent = etiquetaRegiones();
    $("ae-regiones-lista").querySelectorAll("input").forEach((c) => { c.checked = estado.regiones.includes(c.value); });
    $("ae-categoria").value = estado.categoria;
    $("ae-etapa").value = estado.etapa;
    $("ae-modalidad").value = estado.modalidad;
    $("ae-rama").value = estado.rama;
    $("ae-desde").value = String(estado.desde);
    $("ae-hasta").value = String(estado.hasta);
    $("ae-quitar").hidden = sinFiltros() && rangoCompleto();
    const notas = [];
    if (estado.rama) {
      const sin = torneos.filter((t) => CLAVE_ETAPA[t.etapa] && !t.rama && enRango(t)).length;
      if (sin) notas.push(miles(sin) + " torneos de los JDE de estos años no dicen su rama en el nombre (chess-results lo cortó) y no entran con este filtro.");
    }
    if (estado.etapa === "nacional" && estado.regiones.length) notas.push("La final nacional reúne a todo el país y no se separa por región: con regiones elegidas no hay participaciones de esa etapa.");
    $("ae-filtros-nota").hidden = !notas.length;
    texto("ae-filtros-nota", notas.join(" "));
    const p = new URLSearchParams();
    for (const r of estado.regiones) p.append("region", r);
    if (estado.categoria) p.set("categoria", estado.categoria);
    if (estado.etapa) p.set("etapa", estado.etapa);
    if (estado.modalidad) p.set("modalidad", estado.modalidad);
    if (estado.rama) p.set("rama", estado.rama);
    if (estado.desde !== PRIMER) p.set("desde", estado.desde);
    if (estado.hasta !== ULTIMO) p.set("hasta", estado.hasta);
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

  function leerDireccion() {
    const p = new URLSearchParams(location.search);
    estado.regiones = REGIONES.filter((r) => p.getAll("region").includes(r));
    estado.categoria = CATEGORIAS.includes(p.get("categoria")) ? p.get("categoria") : "";
    estado.etapa = ETAPAS.some((e) => e.k === p.get("etapa")) ? p.get("etapa") : "";
    estado.modalidad = p.get("modalidad") in MODALIDADES ? p.get("modalidad") : "";
    estado.rama = p.get("rama") in RAMAS ? p.get("rama") : "";
    const anio = (k, porOmision) => { const v = Number(p.get(k)); return Number.isInteger(v) && v >= PRIMER && v <= ULTIMO ? v : porOmision; };
    estado.desde = anio("desde", PRIMER);
    estado.hasta = anio("hasta", ULTIMO);
    if (estado.desde > estado.hasta) [estado.desde, estado.hasta] = [estado.hasta, estado.desde];
  }

  // El panel de regiones: un botón que lo abre y lo dice (aria-expanded), las
  // casillas, y se cierra con Escape, con «Listo» o al tocar afuera.
  function panelRegiones() {
    const boton = $("ae-regiones-boton"), panel = $("ae-regiones-panel");
    $("ae-regiones-lista").append(...REGIONES.map((r) => {
      const l = document.createElement("label");
      const c = document.createElement("input");
      c.type = "checkbox"; c.value = r;
      c.addEventListener("change", () => {
        estado.regiones = REGIONES.filter((x) => x === r ? c.checked : estado.regiones.includes(x));
        dibujar();
      });
      l.append(c, document.createTextNode(r));
      return l;
    }));
    const abrir = (si, volver) => {
      panel.hidden = !si;
      boton.setAttribute("aria-expanded", si ? "true" : "false");
      if (si) panel.querySelector("input").focus();
      else if (volver) boton.focus();
    };
    boton.addEventListener("click", () => abrir(panel.hidden));
    $("ae-regiones-listo").addEventListener("click", () => abrir(false, true));
    $("ae-regiones-todas").addEventListener("click", () => { estado.regiones = []; dibujar(); abrir(false, true); });
    panel.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); abrir(false, true); } });
    document.addEventListener("pointerdown", (e) => { if (!panel.hidden && !panel.contains(e.target) && e.target !== boton) abrir(false); });
    document.addEventListener("focusin", (e) => { if (!panel.hidden && !panel.contains(e.target) && e.target !== boton) abrir(false); });
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
    // El rango va de los primeros torneos (CODICADER 2009) a los últimos.
    const todos = torneos.map((t) => t.anio);
    PRIMER = Math.min(...todos); ULTIMO = Math.max(...todos);
    texto("ae-consulta", "La última vez que se sumó algo de chess-results fue el " + window.HoraCR.fecha(datos.actualizado, { day: "numeric", month: "long", year: "numeric" }) + ".");

    REGIONES = [...new Set(torneos.map((t) => t.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    panelRegiones();
    $("ae-categoria").append(...CATEGORIAS.map((x) => new Option(x, x)));
    $("ae-etapa").append(...ETAPAS.map((e) => new Option(e.n, e.k)));
    for (let y = PRIMER; y <= ULTIMO; y++) { $("ae-desde").append(new Option(y, y)); $("ae-hasta").append(new Option(y, y)); }
    leerDireccion();

    const al = (id, k) => $(id).addEventListener("change", (e) => { estado[k] = e.target.value; dibujar(); });
    al("ae-categoria", "categoria"); al("ae-etapa", "etapa"); al("ae-modalidad", "modalidad"); al("ae-rama", "rama");
    // Si «desde» pasa a «hasta» (o al revés), el otro lo sigue: el rango nunca queda al revés.
    $("ae-desde").addEventListener("change", (e) => { estado.desde = Number(e.target.value); if (estado.hasta < estado.desde) estado.hasta = estado.desde; dibujar(); });
    $("ae-hasta").addEventListener("change", (e) => { estado.hasta = Number(e.target.value); if (estado.desde > estado.hasta) estado.desde = estado.hasta; dibujar(); });
    $("ae-quitar").addEventListener("click", () => {
      Object.assign(estado, { regiones: [], categoria: "", etapa: "", modalidad: "", rama: "", desde: PRIMER, hasta: ULTIMO });
      dibujar(); $("ae-regiones-boton").focus();
    });
    $("ae-buscar").addEventListener("input", tablaTorneos);
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
