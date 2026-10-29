/* ranking-estudiantil.html: el «Ranking estudiantil por categoría».
 *
 * Carga los datos de los juegos estudiantiles con js/jde-datos.js (los
 * mismos de historial-jugador.html y estadisticas-colegios.html), arma el
 * ranking con js/ranking-estudiantil.js y lo pinta. Los filtros van en la
 * dirección (?anio=2026&categoria=D&rama=Abierta&region=Alajuela) para que un
 * enlace compartido abra el mismo ranking. Ver «Ranking estudiantil por
 * categoría» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";
  const J = window.JdeDatos;
  const R = window.RankingEstudiantil;
  const $ = (id) => document.getElementById(id);

  let datos = null;
  let filas = [];

  function opcion(valor, texto) {
    const o = document.createElement("option");
    o.value = valor;
    o.textContent = texto;
    return o;
  }

  function filtros() {
    return { anio: Number($("re-anio").value), categoria: $("re-categoria").value, rama: $("re-rama").value, region: $("re-region").value };
  }
  function aLaDireccion(f) {
    const u = new URL(location.href);
    u.search = "";
    u.searchParams.set("anio", f.anio);
    u.searchParams.set("categoria", f.categoria);
    u.searchParams.set("rama", f.rama);
    if (f.region) u.searchParams.set("region", f.region);
    history.replaceState(null, "", u);
  }

  function pintar() {
    const f = filtros();
    aLaDireccion(f);
    filas = R.armar(datos, f);
    const texto = J.normalizar($("re-buscar").value);
    const visibles = texto ? filas.filter((x) => J.normalizar(x.jugador.nombre + " " + x.instituciones.join(" ")).includes(texto)) : filas;
    const rama = f.rama === "Femenina" ? "femenina" : "abierta";
    $("re-tesis").textContent = filas.length
      ? filas.length + (filas.length === 1 ? " estudiante" : " estudiantes") + " en la categoría " + f.categoria + " " + rama + " de " + f.anio + (f.region ? ", región " + f.region : "") +
        ". En el primer lugar, " + filas[0].jugador.nombre + ": " + R.resultadoTexto(filas[0]) + "."
      : "No hay torneos de la categoría " + f.categoria + " " + rama + " en " + f.anio + (f.region ? " en la región " + f.region : "") + ".";
    $("re-cuenta").textContent = texto ? visibles.length + " de " + filas.length : "";
    const tb = $("re-tabla").querySelector("tbody");
    tb.replaceChildren();
    for (const x of visibles.slice(0, 500)) {
      const tr = document.createElement("tr");
      const celda = (contenido, clase) => {
        const td = document.createElement("td");
        if (clase) td.className = clase;
        if (contenido && contenido.nodeType) td.append(contenido); else td.textContent = contenido == null ? "" : String(contenido);
        tr.append(td);
      };
      celda(x.lugar, "ae-n");
      const a = document.createElement("a");
      a.href = "historial-jugador.html?j=" + encodeURIComponent(x.jugador.clave);
      a.className = "underline underline-offset-2 hover:no-underline";
      a.textContent = x.jugador.nombre;
      celda(a);
      celda(x.instituciones.join(" · "));
      celda(x.region || "—");
      // La etapa va escrita, con su color de siempre al lado (nunca solo el color).
      const etapa = document.createElement("span");
      const muestra = document.createElement("span");
      muestra.className = "ae-muestra " + (J.CLASE_ETAPA[x.etapa] || "");
      muestra.setAttribute("aria-hidden", "true");
      etapa.append(muestra, " " + R.resultadoTexto(x));
      celda(etapa);
      celda(J.puntos.format(x.puntos) + " de " + x.partidas, "ae-n");
      celda(x.torneos, "ae-n");
      tb.append(tr);
    }
    if (visibles.length > 500) $("re-cuenta").textContent = "Se muestran los primeros 500 de " + visibles.length + ": busca para ver los demás.";
  }

  function bajar() {
    const f = filtros();
    window.TablaExcel.bajar("ranking-jde-" + f.anio + "-" + f.categoria + "-" + f.rama.toLowerCase() + (f.region ? "-" + J.normalizar(f.region).replace(/ /g, "-") : "") + ".xlsx", [{
      nombre: "Ranking " + f.categoria + " " + f.anio,
      filas: [["Lugar", "Estudiante", "Institución", "Región", "Etapa más alta", "Mejor puesto", "De", "Puntos en esa etapa", "Puntos del año", "Partidas", "Torneos"]]
        .concat(filas.map((x) => [x.lugar, x.jugador.nombre, x.instituciones.join(" · "), x.region, x.etapa, x.puesto || "", x.de || "", x.puntosEtapa, x.puntos, x.partidas, x.torneos])),
    }]);
  }

  async function iniciar() {
    try {
      datos = await J.cargar();
    } catch (e) {
      $("re-tesis").textContent = "No se pudieron cargar los datos. Vuelve a intentarlo en un rato.";
      return;
    }
    const o = R.opciones(datos);
    $("re-anio").replaceChildren(...o.anios.map((a) => opcion(a, a)));
    $("re-categoria").replaceChildren(...o.categorias.map((c) => opcion(c, "Categoría " + c)));
    o.regiones.forEach((r) => $("re-region").append(opcion(r, r)));
    const q = new URL(location.href).searchParams;
    const poner = (id, v) => { if (v && [...$(id).options].some((x) => x.value === v)) $(id).value = v; };
    poner("re-anio", q.get("anio"));
    poner("re-categoria", q.get("categoria"));
    poner("re-rama", q.get("rama"));
    poner("re-region", q.get("region"));
    if (datos.actualizado) $("re-actualizado").textContent = "Datos al " + J.fechaLarga(datos.actualizado) + ".";
    ["re-anio", "re-categoria", "re-rama", "re-region"].forEach((id) => $(id).addEventListener("change", pintar));
    $("re-buscar").addEventListener("input", pintar);
    $("re-excel").addEventListener("click", bajar);
    pintar();
  }
  iniciar();
})();
