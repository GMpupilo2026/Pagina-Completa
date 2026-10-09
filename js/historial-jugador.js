/* historial-jugador.html: todos los torneos estudiantiles de una persona en
 * chess-results, año tras año (etapa, categoría, colegio, puesto, puntos y
 * Elo). Los datos y cómo se junta a una persona, en js/jde-datos.js.
 *
 * La persona elegida va en la dirección (?j=<nombre normalizado>) para
 * compartir el enlace.
 */
(function () {
  "use strict";

  const D = window.JdeDatos;
  const $ = (id) => document.getElementById(id);
  const SVG = "http://www.w3.org/2000/svg";
  const MAX_RESULTADOS = 30;

  let datos = null;
  let actual = null;

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

  const ordinal = (n) => n + ".º";
  const plural = (n, uno, varios) => D.numero.format(n) + " " + (n === 1 ? uno : varios);

  function institucionesDe(j) {
    const vistas = [];
    for (const p of j.part) if (p.institucion && !vistas.includes(p.institucion.nombre)) vistas.push(p.institucion.nombre);
    return vistas;
  }
  function aniosDe(j) {
    const a = j.part.map((p) => p.torneo.anio);
    const min = Math.min(...a), max = Math.max(...a);
    return min === max ? String(min) : min + "–" + max;
  }

  // ---------- Buscar ----------

  function buscar(texto) {
    const q = D.normalizar(texto);
    const lista = $("hj-resultados");
    lista.replaceChildren();
    $("hj-cuenta").textContent = "";
    if (q.length < 3) {
      if (q.length) $("hj-cuenta").textContent = "Escribe al menos tres letras.";
      return;
    }
    const partes = q.split(" ");
    const halladas = datos.jugadores.filter((j) => j.part.length && partes.every((p) => j.clave.includes(p)));
    halladas.sort((a, b) => b.part.length - a.part.length || a.nombre.localeCompare(b.nombre, "es"));
    $("hj-cuenta").textContent = halladas.length
      ? (halladas.length > MAX_RESULTADOS ? "Hay " + D.numero.format(halladas.length) + " nombres que coinciden; se muestran los primeros " + MAX_RESULTADOS + ". Escribe más del nombre para acotar." : plural(halladas.length, "nombre coincide.", "nombres coinciden."))
      : "Ningún nombre coincide. Prueba con los apellidos, como salen en chess-results.";
    for (const j of halladas.slice(0, MAX_RESULTADOS)) {
      const li = el("li");
      const b = el("button", "hj-resultado");
      b.type = "button";
      b.append(el("span", "hj-resultado-n", j.nombre));
      const inst = institucionesDe(j);
      b.append(el("span", "hj-resultado-d", [aniosDe(j), plural(j.part.length, "torneo", "torneos")].concat(inst.length ? [inst.slice(0, 2).join(", ") + (inst.length > 2 ? "…" : "")] : []).join(" · ")));
      b.addEventListener("click", () => mostrar(j, true));
      li.append(b);
      lista.append(li);
    }
  }

  // ---------- La ficha ----------

  function cifra(etiqueta, valor, nota) {
    const d = el("div", "ae-cifra");
    d.append(el("span", "ae-cifra-et", etiqueta), el("span", "ae-cifra-num font-serif hj-cifra-num", valor));
    if (nota) d.append(el("span", "ae-cifra-nota", nota));
    return d;
  }

  function resumen(j) {
    const jde = j.part.filter((p) => p.torneo.jde);
    const cont = $("hj-cifras");
    cont.replaceChildren();
    cont.append(cifra("Torneos estudiantiles", D.numero.format(j.part.length), jde.length === j.part.length ? "todos de los JDE" : D.numero.format(jde.length) + " de los JDE"));
    cont.append(cifra("Años", aniosDe(j), plural(new Set(j.part.map((p) => p.torneo.anio)).size, "año con torneos", "años con torneos")));

    const alta = jde.reduce((m, p) => (!m || D.NIVEL_ETAPA[p.torneo.etapa] > D.NIVEL_ETAPA[m.torneo.etapa] ? p : m), null);
    cont.append(cifra("Etapa más alta de los JDE", alta ? alta.torneo.etapa : "—", alta ? "por primera vez en " + alta.torneo.anio : "no jugó los JDE"));

    // El mejor puesto: el más alto en la etapa más alta (un 1.º regional vale
    // más que un 5.º institucional, y un 3.º nacional más que los dos).
    const conPuesto = jde.filter((p) => p.puesto);
    const mejor = conPuesto.reduce((m, p) => {
      if (!m) return p;
      const a = D.NIVEL_ETAPA[p.torneo.etapa], b = D.NIVEL_ETAPA[m.torneo.etapa];
      return a > b || (a === b && p.puesto < m.puesto) ? p : m;
    }, null);
    cont.append(cifra("Mejor puesto", mejor ? ordinal(mejor.puesto) + (mejor.torneo.modalidad === "Equipos" ? " por equipos" : "") : "—",
      mejor ? mejor.torneo.etapa + (mejor.torneo.categoria ? ", categoría " + mejor.torneo.categoria : "") + ", " + mejor.torneo.anio : ""));

    const inst = institucionesDe(j);
    $("hj-instituciones").textContent = inst.length ? (inst.length === 1 ? "Institución: " : "Instituciones: ") + inst.join(" · ") : "";
    const elos = j.part.filter((p) => p.elo);
    $("hj-elo").textContent = elos.length ? "Último Elo publicado en un torneo: " + elos[elos.length - 1].elo + " (" + elos[elos.length - 1].torneo.anio + ")." : "";
  }

  // El camino por etapas: un punto por torneo de los JDE, por año (eje x) y
  // etapa (eje y). El nombre de cada etapa va escrito en el eje: el color
  // nunca va solo.
  function camino(j) {
    const caja = $("hj-camino");
    caja.replaceChildren();
    const jde = j.part.filter((p) => p.torneo.jde);
    $("hj-camino-t").parentElement.hidden = !jde.length;
    if (!jde.length) return;
    const anios = jde.map((p) => p.torneo.anio);
    let desde = Math.min(...anios), hasta = Math.max(...anios);
    if (hasta - desde < 3) { desde = Math.max(2011, hasta - 3); }
    const ancho = Math.max(caja.clientWidth || 600, 280), alto = 210;
    const izq = ancho < 480 ? 92 : 150, der = 16, arriba = 12, abajo = 28;
    const x = (a) => izq + (hasta === desde ? (ancho - izq - der) / 2 : (a - desde) / (hasta - desde) * (ancho - izq - der));
    const y = (nivel) => arriba + (4 - nivel) * (alto - arriba - abajo) / 3;
    const s = svg("svg", { width: ancho, height: alto, viewBox: "0 0 " + ancho + " " + alto, "aria-hidden": "true" });
    D.ETAPAS_JDE.forEach((etapa, i) => {
      const yy = y(i + 1);
      s.append(svg("line", { x1: izq, x2: ancho - der, y1: yy, y2: yy, class: "ae-rejilla" }));
      s.append(svg("text", { x: izq - 8, y: yy + 4, "text-anchor": "end", class: "ae-eje" + (ancho < 480 ? " ae-eje-chico" : "") },
        ancho < 480 ? ["Instit.", "Regional", "Interreg.", "Nacional"][i] : etapa));
    });
    const paso = Math.max(1, Math.ceil((hasta - desde + 1) / Math.floor((ancho - izq) / 44)));
    for (let a = desde; a <= hasta; a += paso) s.append(svg("text", { x: x(a), y: alto - 8, "text-anchor": "middle", class: "ae-eje" }, String(a)));
    // Varios torneos en el mismo año y etapa (clásico y blitz, individual y
    // equipos): se corren un poco para que se vean todos.
    const usados = {};
    const porAnio = {};
    for (const p of jde) {
      const nivel = D.NIVEL_ETAPA[p.torneo.etapa];
      const k = p.torneo.anio + "|" + nivel;
      const n = usados[k] = (usados[k] || 0) + 1;
      porAnio[p.torneo.anio] = Math.max(porAnio[p.torneo.anio] || 0, nivel);
      s.append(svg("circle", { cx: x(p.torneo.anio) + (n - 1) * 7, cy: y(nivel), r: 6, class: D.CLASE_ETAPA[p.torneo.etapa] + " hj-punto" }));
    }
    const ruta = Object.keys(porAnio).map(Number).sort((a, b) => a - b).map((a, i) => (i ? "L" : "M") + x(a) + " " + y(porAnio[a])).join(" ");
    s.insertBefore(svg("path", { d: ruta, class: "hj-ruta" }), s.querySelector("circle"));
    caja.append(s);
    const frase = Object.keys(porAnio).sort().map((a) => a + ": " + D.ETAPAS_JDE[porAnio[a] - 1].toLowerCase()).join("; ");
    caja.setAttribute("aria-label", "La etapa más alta de cada año. " + frase + ".");
  }

  function tabla(j) {
    const cuerpo = $("hj-tabla").tBodies[0];
    cuerpo.replaceChildren();
    for (const p of j.part.slice().reverse()) {
      const t = p.torneo;
      const tr = el("tr");
      tr.append(el("td", null, String(t.anio)));
      const etapa = el("td");
      if (t.jde) {
        const m = el("span", "ae-muestra " + D.CLASE_ETAPA[t.etapa]);
        m.setAttribute("aria-hidden", "true");
        etapa.append(m, document.createTextNode(" " + t.etapa));
      } else etapa.textContent = t.etapa;
      tr.append(etapa, el("td", null, t.categoria || "—"));
      const nombre = el("td");
      const a = el("a", null, t.nombre);
      a.href = t.enlace;
      a.target = "_blank";
      a.rel = "noopener";
      nombre.append(a);
      const det = [t.modalidad === "Equipos" ? "por equipos" : "individual"].concat(t.ritmo === "Clásico" ? [] : [t.ritmo.toLowerCase()]).concat(t.region ? [t.region] : []);
      nombre.append(el("span", "hj-sub", det.join(" · ")));
      tr.append(nombre, el("td", null, p.institucion ? p.institucion.nombre : "—"));
      tr.append(el("td", "ae-n", p.puesto ? ordinal(p.puesto) + (t.de ? " de " + t.de : "") + (t.modalidad === "Equipos" ? " (equipo)" : "") : "—"));
      tr.append(el("td", "ae-n", p.puntos != null ? D.puntos.format(p.puntos) + (t.rondas ? " de " + t.rondas : "") : "—"));
      tr.append(el("td", "ae-n", p.elo ? String(p.elo) : "—"));
      cuerpo.append(tr);
    }
  }

  function mostrar(j, mover) {
    actual = j;
    $("hj-ficha").hidden = false;
    $("hj-nombre").textContent = j.nombre;
    document.title = j.nombre + " — Historial en los juegos estudiantiles — Ajedrez Integral";
    resumen(j);
    tabla(j);
    camino(j);
    const u = new URL(location.href);
    u.searchParams.set("j", j.clave);
    history.replaceState(null, "", u);
    if (mover) {
      $("hj-nombre").focus();
      $("hj-ficha").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function iniciar() {
    try {
      datos = await D.cargar();
    } catch (e) {
      $("hj-estado").textContent = "No se pudieron cargar los datos. Vuelve a intentarlo en un rato.";
      return;
    }
    const personas = datos.jugadores.filter((j) => j.part.length).length;
    if (!personas) {
      $("hj-estado").textContent = "Todavía no hay jugadores leídos de chess-results.";
      return;
    }
    $("hj-estado").textContent = "Busca entre " + D.numero.format(personas) + " nombres de " + D.numero.format(new Set(datos.participaciones.map((p) => p.torneo.clave)).size) + " torneos estudiantiles.";
    $("hj-actualizado").textContent = D.fechaLarga(datos.actualizado) ? "Datos al " + D.fechaLarga(datos.actualizado) + "." : "";
    const caja = $("hj-buscar");
    caja.disabled = false;
    let espera = 0;
    caja.addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(() => buscar(caja.value), 150); });
    const pedida = new URL(location.href).searchParams.get("j");
    const j = pedida && datos.jugadores.find((x) => x.clave === D.normalizar(pedida) && x.part.length);
    if (j) mostrar(j, false);
    let ancho = innerWidth;
    addEventListener("resize", () => {
      if (Math.abs(innerWidth - ancho) < 40 || !actual) return;
      ancho = innerWidth;
      camino(actual);
    });
  }

  iniciar();
})();
