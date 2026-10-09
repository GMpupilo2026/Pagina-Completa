/* estadisticas-colegios.html: los colegios y escuelas en los Juegos Deportivos
 * Estudiantiles (JDE), con lo que se leyó de chess-results: cuántos
 * estudiantes llevó cada uno, sus podios regionales y nacionales (individuales
 * y por equipos) y cuántos llegaron a la final; y lo mismo región por región.
 * Los datos, en js/jde-datos.js.
 *
 * Solo cuentan los torneos de los JDE de ritmo clásico, como las
 * participaciones de ajedrez-estudiantil.html: los blitz y rápidos repiten a
 * los mismos estudiantes. Un podio es un 1.º, 2.º o 3.º; los regionales
 * suman las etapas institucional, regional e interregional.
 *
 * Los filtros y la institución abierta van en la dirección
 * (?region=…&categoria=…&anio=…&i=…) para compartir la vista.
 */
(function () {
  "use strict";

  const D = window.JdeDatos;
  const $ = (id) => document.getElementById(id);
  const SVG = "http://www.w3.org/2000/svg";
  const TOPE_GRAFICO = 15;
  const CATEGORIAS = ["A", "B", "C", "D", "E"];

  let datos = null;
  let regionDe = new Map();      // institución → región
  const estado = { region: "", categoria: "", anio: "", buscar: "", orden: { col: "estudiantes", dir: -1 }, abierta: null };

  function el(etiqueta, clase, texto) {
    const e = document.createElement(etiqueta);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }
  function svg(etiqueta, atributos, texto) {
    const e = document.createElementNS(SVG, etiqueta);
    for (const k in atributos) e.setAttribute(k, atributos[k]);
    if (texto != null) e.textContent = texto;
    return e;
  }
  const n = (v) => D.numero.format(v);

  const cuenta = (t) => t.jde && t.ritmo === "Clásico";
  const nacional = (t) => t.etapa === "Nacional";

  // La región de una institución: la de la mayoría de sus torneos de los
  // JDE con región (la final nacional no tiene).
  function armarRegiones() {
    const votos = new Map();
    const votar = (inst, t) => {
      if (!inst || !t.jde || !t.region) return;
      if (!votos.has(inst)) votos.set(inst, new Map());
      const m = votos.get(inst);
      m.set(t.region, (m.get(t.region) || 0) + 1);
    };
    for (const p of datos.participaciones) votar(p.institucion, p.torneo);
    for (const e of datos.equipos) votar(e.institucion, e.torneo);
    regionDe = new Map();
    for (const [inst, m] of votos) regionDe.set(inst, [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))[0][0]);
  }

  function pasa(t) {
    return cuenta(t) && (!estado.categoria || t.categoria === estado.categoria) && (!estado.anio || String(t.anio) === estado.anio);
  }

  // ---------- Las cuentas ----------

  function porInstitucion() {
    const filas = new Map();
    const fila = (inst) => {
      if (!filas.has(inst)) filas.set(inst, { inst, region: regionDe.get(inst) || "", estudiantes: new Set(), participaciones: 0, podiosReg: 0, podiosNac: 0, equiposReg: 0, equiposNac: 0, final: new Set(), anios: new Set(), oros: 0 });
      return filas.get(inst);
    };
    for (const p of datos.participaciones) {
      if (!p.institucion || !pasa(p.torneo)) continue;
      const f = fila(p.institucion);
      f.estudiantes.add(p.jugador);
      f.participaciones += 1;
      f.anios.add(p.torneo.anio);
      if (nacional(p.torneo)) f.final.add(p.jugador);
      if (p.torneo.modalidad !== "Equipos" && p.puesto && p.puesto <= 3) {
        if (nacional(p.torneo)) f.podiosNac += 1; else f.podiosReg += 1;
        if (p.puesto === 1 && nacional(p.torneo)) f.oros += 1;
      }
    }
    for (const e of datos.equipos) {
      if (!e.institucion || !pasa(e.torneo)) continue;
      const f = fila(e.institucion);
      f.anios.add(e.torneo.anio);
      if (e.puesto && e.puesto <= 3) { if (nacional(e.torneo)) f.equiposNac += 1; else f.equiposReg += 1; }
    }
    return [...filas.values()]
      .filter((f) => !estado.region || f.region === estado.region)
      .map((f) => Object.assign(f, { nEst: f.estudiantes.size, nFinal: f.final.size, podios: f.podiosReg + f.equiposReg, podiosNacionales: f.podiosNac + f.equiposNac }));
  }

  function porRegion(filas) {
    const r = new Map();
    for (const f of filas) {
      const k = f.region || "Sin región";
      if (!r.has(k)) r.set(k, { region: k, inst: 0, est: new Set(), nac: 0, final: new Set() });
      const o = r.get(k);
      o.inst += 1;
      for (const j of f.estudiantes) o.est.add(j);
      for (const j of f.final) o.final.add(j);
      o.nac += f.podiosNacionales;
    }
    return [...r.values()].sort((a, b) => b.est.size - a.est.size || a.region.localeCompare(b.region, "es"));
  }

  // ---------- Pintar ----------

  function frase(filas) {
    const est = new Set();
    for (const f of filas) for (const j of f.estudiantes) est.add(j);
    const donde = estado.region ? " de la región " + estado.region : "";
    const cuando = estado.anio ? " en " + estado.anio : "";
    const cat = estado.categoria ? ", categoría " + estado.categoria : "";
    $("ec-tesis").textContent = filas.length
      ? n(filas.length) + " instituciones" + donde + " llevaron a " + n(est.size) + " estudiantes a los JDE" + cuando + cat + ", según los torneos publicados en chess-results."
      : "No hay instituciones con estos filtros.";
    const masNac = filas.slice().sort((a, b) => b.podiosNacionales - a.podiosNacionales || b.nEst - a.nEst)[0];
    const masEst = filas.slice().sort((a, b) => b.nEst - a.nEst)[0];
    $("ec-c1").textContent = n(filas.length);
    $("ec-c2").textContent = n(est.size);
    $("ec-c3").textContent = masEst ? masEst.inst.nombre : "—";
    $("ec-c3-nota").textContent = masEst ? n(masEst.nEst) + " estudiantes" : "";
    $("ec-c4").textContent = masNac && masNac.podiosNacionales ? masNac.inst.nombre : "—";
    $("ec-c4-nota").textContent = masNac && masNac.podiosNacionales ? n(masNac.podiosNacionales) + (masNac.podiosNacionales === 1 ? " podio" : " podios") + " en la final (individual y por equipos)" : "nadie con podio en la final";
  }

  function grafico(filas) {
    const caja = $("ec-graf");
    caja.replaceChildren();
    const top = filas.slice().sort((a, b) => b.nEst - a.nEst || a.inst.nombre.localeCompare(b.inst.nombre, "es")).slice(0, TOPE_GRAFICO);
    if (!top.length) return;
    const ancho = Math.max(caja.clientWidth || 600, 280);
    const etiqueta = ancho < 520 ? 130 : 260;
    const fila = 24, alto = top.length * fila + 8;
    const max = Math.max(...top.map((f) => f.nEst));
    const s = svg("svg", { width: ancho, height: alto, viewBox: "0 0 " + ancho + " " + alto, "aria-hidden": "true" });
    top.forEach((f, i) => {
      const y = i * fila + 4;
      const largo = Math.max(2, (ancho - etiqueta - 48) * f.nEst / max);
      const nombre = f.inst.nombre.length > (ancho < 520 ? 18 : 38) ? f.inst.nombre.slice(0, ancho < 520 ? 17 : 37) + "…" : f.inst.nombre;
      s.append(svg("text", { x: etiqueta - 8, y: y + 14, "text-anchor": "end", class: "ae-eje" }, nombre));
      s.append(svg("rect", { x: etiqueta, y: y + 2, width: largo, height: fila - 8, rx: 3, class: "ae-e2" }));
      s.append(svg("text", { x: etiqueta + largo + 6, y: y + 14, class: "ae-valor" }, n(f.nEst)));
    });
    caja.append(s);
    caja.setAttribute("aria-label", "Las " + top.length + " instituciones con más estudiantes: " + top.map((f) => f.inst.nombre + ", " + f.nEst).join("; ") + ".");
  }

  const COLUMNAS = {
    nombre: (f) => f.inst.nombre, region: (f) => f.region, estudiantes: (f) => f.nEst, participaciones: (f) => f.participaciones,
    podios: (f) => f.podios, nacionales: (f) => f.podiosNacionales, final: (f) => f.nFinal, anios: (f) => f.anios.size
  };

  function tabla(filas) {
    const q = D.normalizar(estado.buscar);
    const vistas = filas.filter((f) => !q || f.inst.clave.includes(q) || D.normalizar(f.inst.nombre).includes(q));
    const { col, dir } = estado.orden;
    const valor = COLUMNAS[col];
    vistas.sort((a, b) => {
      const x = valor(a), y = valor(b);
      const c = typeof x === "number" ? x - y : String(x).localeCompare(String(y), "es");
      return c * dir || b.nEst - a.nEst || a.inst.nombre.localeCompare(b.inst.nombre, "es");
    });
    for (const th of $("ec-tabla").tHead.rows[0].cells) {
      const b = th.querySelector("button");
      th.setAttribute("aria-sort", b && b.dataset.col === col ? (dir > 0 ? "ascending" : "descending") : "none");
    }
    const cuerpo = $("ec-tabla").tBodies[0];
    cuerpo.replaceChildren();
    for (const f of vistas) {
      const tr = el("tr");
      const td = el("td");
      const b = el("button", "ec-abrir", f.inst.nombre);
      b.type = "button";
      b.dataset.clave = f.inst.clave;
      b.setAttribute("aria-expanded", estado.abierta === f.inst ? "true" : "false");
      b.setAttribute("aria-controls", "ec-detalle");
      b.addEventListener("click", () => abrir(f.inst, true));
      td.append(b);
      tr.append(td, el("td", null, f.region || "—"));
      for (const v of [f.nEst, f.participaciones, f.podios, f.podiosNacionales, f.nFinal]) tr.append(el("td", "ae-n", n(v)));
      tr.append(el("td", "ae-n", [...f.anios].sort().join(", ")));
      cuerpo.append(tr);
    }
    $("ec-cuenta").textContent = vistas.length === filas.length ? n(filas.length) + " instituciones" : n(vistas.length) + " de " + n(filas.length) + " instituciones";
  }

  function tablaRegiones(filas) {
    const cuerpo = $("ec-regiones").tBodies[0];
    cuerpo.replaceChildren();
    for (const r of porRegion(filas)) {
      const tr = el("tr");
      tr.append(el("th", null, r.region));
      tr.firstChild.scope = "row";
      for (const v of [r.inst, r.est.size, r.final.size, r.nac]) tr.append(el("td", "ae-n", n(v)));
      cuerpo.append(tr);
    }
  }

  // ---------- Una institución ----------

  function abrir(inst, mover) {
    estado.abierta = inst;
    const caja = $("ec-detalle");
    caja.hidden = false;
    $("ec-detalle-t").textContent = inst.nombre;
    $("ec-detalle-region").textContent = regionDe.get(inst) ? "Región " + regionDe.get(inst) + "." : "";

    // Año por año, con los mismos filtros de categoría (no el de año: se
    // quiere ver la serie).
    const anios = new Map();
    const delAnio = (a) => {
      if (!anios.has(a)) anios.set(a, { est: new Set(), etapa: 0, podios: 0 });
      return anios.get(a);
    };
    const jugadores = new Map();
    const podios = [];
    for (const p of datos.participaciones) {
      const t = p.torneo;
      if (p.institucion !== inst || !cuenta(t) || (estado.categoria && t.categoria !== estado.categoria)) continue;
      const a = delAnio(t.anio);
      a.est.add(p.jugador);
      a.etapa = Math.max(a.etapa, D.NIVEL_ETAPA[t.etapa]);
      if (t.modalidad !== "Equipos" && p.puesto && p.puesto <= 3) { a.podios += 1; podios.push({ t, puesto: p.puesto, quien: p.jugador }); }
      const j = jugadores.get(p.jugador) || { j: p.jugador, torneos: 0, etapa: 0, anios: new Set() };
      j.torneos += 1;
      j.etapa = Math.max(j.etapa, D.NIVEL_ETAPA[t.etapa]);
      j.anios.add(t.anio);
      jugadores.set(p.jugador, j);
    }
    for (const e of datos.equipos) {
      const t = e.torneo;
      if (e.institucion !== inst || !cuenta(t) || (estado.categoria && t.categoria !== estado.categoria)) continue;
      const a = delAnio(t.anio);
      a.etapa = Math.max(a.etapa, D.NIVEL_ETAPA[t.etapa]);
      if (e.puesto && e.puesto <= 3) { a.podios += 1; podios.push({ t, puesto: e.puesto, quien: null }); }
    }

    const cuerpo = $("ec-anios").tBodies[0];
    cuerpo.replaceChildren();
    for (const [a, o] of [...anios].sort((x, y) => y[0] - x[0])) {
      const tr = el("tr");
      tr.append(el("td", null, String(a)), el("td", "ae-n", n(o.est.size)));
      const etapa = el("td");
      if (o.etapa) {
        const nombre = D.ETAPAS_JDE[o.etapa - 1];
        const m = el("span", "ae-muestra " + D.CLASE_ETAPA[nombre]);
        m.setAttribute("aria-hidden", "true");
        etapa.append(m, document.createTextNode(" " + nombre));
      }
      tr.append(etapa, el("td", "ae-n", n(o.podios)));
      cuerpo.append(tr);
    }

    const lista = $("ec-podios");
    lista.replaceChildren();
    podios.sort((x, y) => D.NIVEL_ETAPA[y.t.etapa] - D.NIVEL_ETAPA[x.t.etapa] || y.t.anio - x.t.anio || x.puesto - y.puesto);
    $("ec-podios-t").hidden = !podios.length;
    for (const p of podios.slice(0, 40)) {
      const li = el("li");
      li.append(el("strong", null, p.puesto + ".º"), document.createTextNode(" " + p.t.etapa + (p.t.categoria ? " " + p.t.categoria : "") + " " + p.t.anio + (p.quien ? " · " : " · por equipos")));
      if (p.quien) {
        const a = el("a", null, p.quien.nombre);
        a.href = "historial-jugador.html?j=" + encodeURIComponent(p.quien.clave);
        li.append(a);
      }
      const t = el("a", "hj-sub", p.t.nombre);
      t.href = p.t.enlace;
      t.target = "_blank";
      t.rel = "noopener";
      li.append(t);
      lista.append(li);
    }
    if (podios.length > 40) lista.append(el("li", "hj-sub", "y " + n(podios.length - 40) + " más."));

    const quienes = $("ec-jugadores");
    quienes.replaceChildren();
    const orden = [...jugadores.values()].sort((a, b) => b.etapa - a.etapa || b.torneos - a.torneos || a.j.nombre.localeCompare(b.j.nombre, "es"));
    $("ec-jugadores-nota").textContent = orden.length > 30 ? "Los 30 que llegaron más lejos, de " + n(orden.length) + "." : "";
    for (const j of orden.slice(0, 30)) {
      const li = el("li");
      const a = el("a", null, j.j.nombre);
      a.href = "historial-jugador.html?j=" + encodeURIComponent(j.j.clave);
      li.append(a, document.createTextNode(" · " + D.ETAPAS_JDE[j.etapa - 1].toLowerCase() + " · " + [...j.anios].sort().join(", ")));
      quienes.append(li);
    }

    for (const b of document.querySelectorAll(".ec-abrir")) b.setAttribute("aria-expanded", b.dataset.clave === inst.clave ? "true" : "false");
    guardarDireccion();
    if (mover) {
      $("ec-detalle-t").focus();
      caja.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // ---------- Filtros ----------

  function guardarDireccion() {
    const u = new URL(location.href);
    for (const [k, v] of [["region", estado.region], ["categoria", estado.categoria], ["anio", estado.anio], ["i", estado.abierta ? estado.abierta.clave : ""]]) {
      if (v) u.searchParams.set(k, v); else u.searchParams.delete(k);
    }
    history.replaceState(null, "", u);
  }

  function pintar() {
    const filas = porInstitucion();
    frase(filas);
    grafico(filas);
    tabla(filas);
    tablaRegiones(filas);
    $("ec-quitar").hidden = !(estado.region || estado.categoria || estado.anio);
    if (estado.abierta) abrir(estado.abierta, false);
    guardarDireccion();
  }

  function opciones(id, valores) {
    const s = $(id);
    for (const v of valores) s.append(new Option(v, v));
  }

  async function iniciar() {
    try {
      datos = await D.cargar();
    } catch (e) {
      $("ec-tesis").textContent = "No se pudieron cargar los datos. Vuelve a intentarlo en un rato.";
      return;
    }
    if (!datos.participaciones.length) {
      $("ec-tesis").textContent = "Todavía no hay jugadores leídos de chess-results.";
      return;
    }
    armarRegiones();
    opciones("ec-region", [...new Set(regionDe.values())].sort((a, b) => a.localeCompare(b, "es")));
    opciones("ec-categoria", CATEGORIAS);
    const anios = [...new Set(datos.participaciones.filter((p) => cuenta(p.torneo)).map((p) => p.torneo.anio))].sort((a, b) => b - a);
    opciones("ec-anio", anios.map(String));
    $("ec-actualizado").textContent = D.fechaLarga(datos.actualizado) ? "Datos al " + D.fechaLarga(datos.actualizado) + "." : "";

    const u = new URL(location.href).searchParams;
    for (const [k, id] of [["region", "ec-region"], ["categoria", "ec-categoria"], ["anio", "ec-anio"]]) {
      const v = u.get(k) || "";
      if ([...$(id).options].some((o) => o.value === v)) { estado[k] = v; $(id).value = v; }
    }
    const pedida = u.get("i");
    if (pedida) estado.abierta = datos.instituciones.find((i) => i.clave === pedida) || null;

    for (const [k, id] of [["region", "ec-region"], ["categoria", "ec-categoria"], ["anio", "ec-anio"]]) {
      $(id).addEventListener("change", () => { estado[k] = $(id).value; pintar(); });
    }
    $("ec-quitar").addEventListener("click", () => {
      estado.region = estado.categoria = estado.anio = "";
      for (const id of ["ec-region", "ec-categoria", "ec-anio"]) $(id).value = "";
      pintar();
      $("ec-region").focus();
    });
    $("ec-buscar").addEventListener("input", () => { estado.buscar = $("ec-buscar").value; tabla(porInstitucion()); });
    for (const b of $("ec-tabla").tHead.querySelectorAll("button")) {
      b.addEventListener("click", () => {
        const col = b.dataset.col;
        estado.orden = estado.orden.col === col ? { col, dir: -estado.orden.dir } : { col, dir: col === "nombre" || col === "region" ? 1 : -1 };
        tabla(porInstitucion());
      });
    }
    let ancho = innerWidth;
    addEventListener("resize", () => {
      if (Math.abs(innerWidth - ancho) < 40) return;
      ancho = innerWidth;
      grafico(porInstitucion());
    });
    pintar();
  }

  iniciar();
})();
