/* «Ediciones anteriores» en las páginas de los torneos universitarios
 * (cenfotec-2026.html, utn-2026.html): los campeones de cada edición y
 * quién volvió, con su puesto en cada una; y en la tarjeta de cada jugador
 * del buscador, cómo le fue en las anteriores.
 *
 * Esta edición sale de chess-results en vivo (js/centroamericano-vivo.js,
 * que tiene que cargar antes); las anteriores, de window.TorneoPagina.ediciones,
 * que escribe herramientas/torneo-universitario.js desde la configuración de
 * la página, con la clasificación final de chess-results de cada grupo.
 *
 * La misma persona de un año a otro es la que tiene los mismos apellidos y el
 * mismo primer nombre, sin tildes ni mayúsculas: chess-results la escribe a
 * veces con el segundo nombre y a veces sin él («Keicy» y «Keicy Pamela»), o
 * con una letra cambiada («Naomi» y «Naomy»). Lo que no alcanza a ver esa
 * regla (un apellido mal escrito) va revisado a mano en
 * TorneoPagina.mismaPersona; si dos jugadores de una misma edición dan la
 * misma clave, no se empareja ninguno: mejor no decir nada que decir algo de
 * otra persona. Todo lo de afuera (nombres) va por textContent.
 *
 * Ver «Las ediciones anteriores» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  const V = window.CentroamericanoVivo;
  const C = window.TorneoPagina || {};
  if (!V || !Array.isArray(C.ediciones) || !C.ediciones.length) return;
  const el = V.el;
  const MISMA = C.mismaPersona || {};
  const ESTA = C.edicion || "Esta edición";

  const llano = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  function clave(nombre) {
    const n = MISMA[nombre] || nombre;
    const coma = String(n).indexOf(",");
    if (coma < 0) return llano(n);
    return llano(n.slice(0, coma)) + "|" + llano(n.slice(coma + 1)).split(" ")[0];
  }
  // Un mapa clave → jugador que deja fuera las claves repetidas.
  function porClave(lista) {
    const m = new Map(), repetidas = new Set();
    lista.forEach((j) => { const k = clave(j.nombre); if (m.has(k)) repetidas.add(k); else m.set(k, j); });
    repetidas.forEach((k) => m.delete(k));
    return m;
  }
  const grupoDe = (g) => g || "—";
  const puesto = (p) => V.puestoTexto({ desde: p, hasta: p });
  const puntosTexto = (n) => { const s = V.fmtPuntos(n); return s + (s === "1" ? " punto" : " puntos"); };

  // Las anteriores, de la más vieja a la más nueva.
  const viejas = C.ediciones.map((e) => {
    const grupos = {};
    Object.keys(e.grupos).forEach((g) => {
      const lista = e.grupos[g].jugadores.map(([p, nombre, pts]) => ({ puesto: p, nombre, puntos: pts }));
      grupos[g] = { lista, de: lista.length, porClave: porClave(lista) };
    });
    return { nombre: e.nombre, grupos };
  });

  // Esta edición, por grupo, con el puesto dentro de su grupo.
  function actual() {
    const grupos = {};
    V.jugadores().forEach((x) => {
      const g = grupoDe(x.j.grupo);
      (grupos[g] = grupos[g] || []).push({ puesto: x.j._puestoGrupo || x.j.puesto, nombre: x.j.nombre, titulo: x.j.titulo, puntos: V.puntosNum(x.j.puntos) });
    });
    Object.keys(grupos).forEach((g) => {
      const lista = grupos[g].sort((a, b) => a.puesto - b.puesto);
      grupos[g] = { lista, de: lista.length, porClave: porClave(lista) };
    });
    return grupos;
  }

  /* La línea de la tarjeta del buscador: «En 2025 quedó 10.º de 42, con 4½
     puntos.» La pide js/centroamericano-vivo.js al pintar cada tarjeta. */
  function historial(j) {
    const k = clave(j.nombre), g = grupoDe(j.grupo);
    const antes = viejas.map((e) => {
      const gr = e.grupos[g];
      const v = gr && gr.porClave.get(k);
      return v ? e.nombre + ": " + puesto(v.puesto) + " de " + gr.de + ", con " + puntosTexto(v.puntos) : "";
    }).filter(Boolean);
    if (!antes.length) return "";
    return (antes.length === 1 ? "En la edición " : "En las ediciones ") + antes.join("; ") + ".";
  }
  window.TorneoEdiciones = { historial, clave };

  /* ---------------- el recuadro ---------------- */
  const caja = document.getElementById("ediciones-contenido");

  function tabla(cabeceras, filas, numericas, iFila) {
    const envoltura = el("div", "cac-tabla-envoltura");
    const t = el("table", "cac-tabla");
    const thead = el("thead"), tr = el("tr");
    cabeceras.forEach((c, i) => { const th = el("th", numericas.includes(i) ? "num" : "", c); th.scope = "col"; tr.appendChild(th); });
    thead.appendChild(tr);
    const tbody = el("tbody");
    filas.forEach((f) => {
      const fila = el("tr");
      f.forEach((c, i) => {
        const celda = el(i === iFila ? "th" : "td", numericas.includes(i) ? "num" : "", "");
        if (i === iFila) celda.scope = "row";
        if (c instanceof Node) celda.appendChild(c); else celda.textContent = c;
        fila.appendChild(celda);
      });
      tbody.appendChild(fila);
    });
    t.append(thead, tbody);
    envoltura.appendChild(t);
    return envoltura;
  }

  // «Subió 7 puestos» / «Bajó 2» / «Igual»: la flecha es adorno, el dato va escrito.
  function cambio(antes, ahora) {
    const d = antes - ahora;
    const s = el("span", "u-cambio");
    s.dataset.cambio = d > 0 ? "sube" : d < 0 ? "baja" : "igual";
    const flecha = el("span", "", d > 0 ? "▲ " : d < 0 ? "▼ " : "= ");
    flecha.setAttribute("aria-hidden", "true");
    const n = Math.abs(d);
    s.append(flecha, d === 0 ? "Mismo puesto" : (d > 0 ? "Subió " : "Bajó ") + n + (n === 1 ? " puesto" : " puestos"));
    return s;
  }

  function seccionGrupo(g, ahora, varios) {
    const sec = el("section", "u-edicion-grupo");
    if (varios) sec.appendChild(el("h3", "u-edicion-rama", V.categoria(g)));
    const hoy = ahora && ahora[g];

    // Los campeones y cuántos jugaron, edición por edición.
    sec.appendChild(el("h4", "u-edicion-titulo", "Los campeones"));
    const filas = viejas.filter((e) => e.grupos[g]).map((e) => {
      const c = e.grupos[g].lista[0];
      return [e.nombre, c.nombre, V.fmtPuntos(c.puntos), String(e.grupos[g].de)];
    });
    if (hoy && hoy.lista.length) {
      const c = hoy.lista[0];
      filas.push([ESTA, (c.titulo ? c.titulo + " " : "") + c.nombre, V.fmtPuntos(c.puntos), String(hoy.de)]);
    }
    sec.appendChild(tabla(["Edición", "Campeón", "Puntos", "Jugadores"], filas, [2, 3], 1));

    // Quién volvió: los de esta edición que jugaron alguna anterior.
    sec.appendChild(el("h4", "u-edicion-titulo", "Quién volvió"));
    if (!hoy) { sec.appendChild(el("p", "u-edicion-nota", "Buscando la clasificación de esta edición en chess-results…")); return sec; }
    const conG = viejas.filter((e) => e.grupos[g]);
    const vuelven = hoy.lista.map((j) => ({ j, antes: conG.map((e) => e.grupos[g].porClave.get(clave(j.nombre)) || null) }))
      .filter((x) => x.antes.some(Boolean));
    sec.appendChild(el("p", "u-edicion-nota", vuelven.length
      ? vuelven.length + " de los " + hoy.de + " de esta edición ya había" + (vuelven.length === 1 ? "" : "n") + " jugado antes."
      : "Nadie de esta edición había jugado antes."));
    if (!vuelven.length) return sec;
    const cab = ["Jugador"].concat(conG.map((e) => e.nombre), [ESTA, "Cambio"]);
    const filasV = vuelven.map((x) => {
      const ultimo = x.antes.filter(Boolean).pop();
      return [(x.j.titulo ? x.j.titulo + " " : "") + x.j.nombre]
        .concat(x.antes.map((a, i) => (a ? puesto(a.puesto) + " de " + conG[i].grupos[g].de : "—")),
          [puesto(x.j.puesto) + " de " + hoy.de, cambio(ultimo.puesto, x.j.puesto)]);
    });
    sec.appendChild(tabla(cab, filasV, [], 0));
    return sec;
  }

  function pintar() {
    if (!caja) return;
    const ahora = V.datos() ? actual() : null;
    const grupos = new Set();
    viejas.forEach((e) => Object.keys(e.grupos).forEach((g) => grupos.add(g)));
    if (ahora) Object.keys(ahora).forEach((g) => grupos.add(g));
    const lista = [...grupos].sort((a, b) => V.ordenGrupo(a) - V.ordenGrupo(b) || a.localeCompare(b));
    const nodos = lista.map((g) => seccionGrupo(g, ahora, lista.length > 1));
    nodos.push(el("p", "u-edicion-nota", "El puesto es el de la clasificación final de cada edición en chess-results; el cambio es contra la última edición que jugó. Un jugador cuenta como el mismo si tiene los mismos apellidos y el mismo primer nombre."));
    caja.replaceChildren(...nodos);
  }

  const dialogo = document.getElementById("ediciones");
  if (dialogo) new MutationObserver(() => { if (dialogo.open) pintar(); }).observe(dialogo, { attributes: true, attributeFilter: ["open"] });
  pintar();
  V.pedir().then(pintar, () => {});
})();
