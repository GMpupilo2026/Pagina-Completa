/* ===== Pareo Integral — la página (pareo.html): la ficha «Clasificación» =====
 *
 * El filtro por institución, el cuadro de la eliminación directa, la clasificación, los mejores
 * tableros, los premios especiales, la tabla cruzada y sus PDF.
 *
 * Es una parte de la página de Pareo Integral, que se partió por zonas el
 * 20/11/2026 (ver «Pareo Integral: la página partida por zonas» en
 * docs/decisiones/juegos-y-torneos.md). Lo de las otras partes llega por
 * window.PareoPagina: arriba, lo de las que ya cargaron; como Pagina.<nombre>,
 * lo de las que cargan después.
 */
(function () {
  "use strict";

  const Pagina = window.PareoPagina;
  const { T, E, V, C, $, el, tx, estado, guardar, t, jugador, nombreDe, rondasCompletas, hasta, formatoNum,
    puntosTexto, pintarSelectInstitucion, conOrganizacion, bajarBlob, RONDA_ELIM, nombreFaseDoble,
    pintarMarcadorSchev } = Pagina;

  // Las mismas filas de E.clasificacion(), acotadas a la institución elegida
  // (si hay una elegida): la usan la pantalla y el PDF por igual, para que
  // lo que se baja sea siempre lo que se está viendo.
  function filasFiltradas(todasFilas) {
    return estado.filtroInstitucion
      ? todasFilas.filter((f) => jugador(f.id).institucion === estado.filtroInstitucion) : todasFilas;
  }

  // El cuadro de una eliminación directa: cada ronda con sus mesas y quién
  // pasó, escrito (no solo en negrita).
  function pintarCuadroElim(v) {
    const caja = $("pi-clas-cuadro");
    if (!caja) return;
    caja.replaceChildren();
    caja.hidden = !(v.sistema === "eliminacion" && v.rondas.length);
    if (caja.hidden) return;
    const llego = T.alcanceEliminacion(v);
    const campeon = T.campeonEliminacion(v);
    const enCarrera = v.dobleEliminacion ? v.jugadores.filter((j) => llego.get(j.id) === T.EN_CARRERA).length
      : v.jugadores.filter((j) => llego.get(j.id) === v.rondas.length && v.rondas[v.rondas.length - 1].mesas.some((m) => !m.tercer && (m.b === j.id || m.n === j.id))).length;
    caja.append(el("h3", { class: "font-semibold", texto: tx("elimCuadro") }),
      el("p", { class: "text-sm mb-2", texto: campeon ? tx("elimCampeon", { n: nombreDe(campeon) }) : tx("elimEnJuego", { n: enCarrera }) }));
    // Una mesa del cuadro, escrita: quiénes, el resultado y qué pasó después.
    // En la final y en el tercer puesto nadie «pasa»: gana.
    const linea = (m) => {
      if (m.n === null) return el("li", { texto: tx("elimLibre", { n: nombreDe(m.b) }) });
      const g = T.pasaDe(m);
      const gana = m.tercer || m.llave === "F";
      const que = g === undefined ? "" : g === null ? tx("elimSinPasar")
        : m.r === "=" ? tx(gana ? "elimGanoDesempate" : "elimPasoDesempate", { n: nombreDe(g), f: m.desempate || "" }) : tx(gana ? "elimGanoPor" : "elimPasoPor", { n: nombreDe(g) });
      return el("li", {}, nombreDe(m.b) + " – " + nombreDe(m.n) + (m.r ? " · " + tx("corto_" + m.r) : ""), que ? el("strong", { texto: " · " + que }) : null);
    };
    const bloque = (titulo, mesas) => { if (mesas.length) caja.append(el("h4", { class: "font-semibold text-sm mt-3", texto: titulo }), el("ul", { class: "text-sm space-y-1" }, mesas.map(linea))); };
    v.rondas.forEach((R, r) => {
      if (v.dobleEliminacion) {
        // Cada ronda puede traer mesas de las dos llaves: van por separado.
        for (const f of T.fasesDeRonda(v, r)) bloque(tx("rondaN", { r: r + 1 }) + " · " + nombreFaseDoble(f), R.mesas.filter((m) => m.llave + m.fase === f));
        return;
      }
      bloque(tx(RONDA_ELIM[T.nombreRondaEliminacion(v, r)], { r: r + 1 }), R.mesas.filter((m) => !m.tercer));
      bloque(tx("tercerNombre"), R.mesas.filter((m) => m.tercer));
    });
  }

  // ---------- Clasificación ----------
  function pintarClasificacion() {
    const v = t();
    // En la eliminación directa el puesto sale del cuadro: los desempates no ordenan nada.
    const desList = v.sistema === "eliminacion" ? [] : v.desempates;
    const k = rondasCompletas();
    const tc = hasta(k);
    const todasFilas = E.clasificacion(tc, desList);
    const filas = filasFiltradas(todasFilas);
    const num = T.numeros(v);
    $("pi-clas-titulo").textContent = k ? tx("clasificacionTras", { r: k }) : tx("fClasificacion");
    $("pi-clas-nota").textContent = (k < v.rondas.length ? tx("clasSoloCompletas", { r: k }) : (v.nombre || ""))
      + (estado.filtroInstitucion ? tx("clasFiltroNota", { n: filas.length, total: todasFilas.length, inst: estado.filtroInstitucion }) : "");
    pintarSelectInstitucion($("pi-clas-institucion"));
    pintarMarcadorSchev(v);
    pintarCuadroElim(v);
    const tabla = $("pi-tabla-clas");
    tabla.replaceChildren();
    if (!v.jugadores.length) return;
    // El Elo que gana o pierde cada uno (js/pareo/elo.js), si hay Elo.
    const elos = conElo(v) ? PareoElo.calcular(v, k) : null;
    const thElo = elos ? [["Rp", "eloRp"], ["K", "eloK"], ["±Elo", "eloCambio"]].map(([c, d]) => el("th", { class: "num", scope: "col" }, el("abbr", { title: tx(d), texto: c }))) : [];
    tabla.append(el("thead", {}, el("tr", {},
      el("th", { class: "num", scope: "col", texto: tx("puesto") }), el("th", { class: "num", scope: "col", texto: tx("nro") }),
      el("th", { scope: "col", texto: tx("nombre") }), el("th", { scope: "col", texto: tx("institucion") }),
      el("th", { scope: "col", texto: tx("fed") }), el("th", { class: "num", scope: "col", texto: "Elo" }),
      el("th", { class: "num", scope: "col", texto: tx("pts") }),
      desList.map((c) => el("th", { class: "num", scope: "col" }, el("abbr", { title: (E.catalogo(v).find((x) => x.codigo === c) || {})[Pagina.idioma], texto: c }))), thElo)));
    const cuerpo = el("tbody");
    for (const f of filas) {
      const j = jugador(f.id);
      const x = elos && elos.get(f.id);
      cuerpo.append(el("tr", { "data-id": f.id },
        el("td", { class: "num", texto: f.puesto }), el("td", { class: "num", texto: num.get(f.id) }),
        el("td", { class: "font-semibold", texto: j.nombre + (j.titulo ? " (" + j.titulo + ")" : "") }),
        el("td", { texto: j.institucion || "" }),
        el("td", { texto: j.fed || "" }), el("td", { class: "num", texto: Number(j.elo) > 0 ? j.elo : "" }),
        el("td", { class: "num font-bold", texto: puntosTexto(f.puntos) }),
        desList.map((c) => el("td", { class: "num", texto: valorDesempate(c, f.valores[c]) })),
        elos ? celdasElo(x).map((c) => el("td", { class: "num", "data-elo": c[0], texto: c[1] })) : null));
    }
    tabla.append(cuerpo);
    const dl = $("pi-clas-leyenda");
    dl.replaceChildren();
    if (elos) {
      for (const [c, d] of [["Rp", "eloRp"], ["K", "eloK"], ["±Elo", "eloCambio"]]) dl.append(el("div", {}, el("dt", { class: "inline font-semibold", texto: c + ": " }), el("dd", { class: "inline", texto: tx(d) })));
      dl.append(el("p", { class: C.nota + " mt-1", texto: tx("eloNota") }));
    }
    for (const c of desList) {
      const info = E.catalogo(v).find((x) => x.codigo === c);
      if (info) dl.append(el("div", {}, el("dt", { class: "inline font-semibold", texto: c + ": " }), el("dd", { class: "inline", texto: info[Pagina.idioma] })));
    }
    pintarMejoresTableros(k);
    pintarPremios(k);
  }

  // En un torneo por equipos, el mejor de cada tablero (como en las
  // olimpiadas): js/pareo/equipos.js, mejoresTableros.
  function pintarMejoresTableros(k) {
    const v = t();
    const caja = $("pi-clas-tableros");
    caja.replaceChildren();
    if (!E.esDeEquipos(v) || !k) return;
    const tableros = E.mejoresTableros(v, k);
    caja.append(el("h3", { class: "font-serif text-lg font-bold mt-6 mb-1", texto: tx("mejorTableroTitulo") }),
      el("p", { class: C.nota + " mb-2", texto: tx("mejorTableroAyuda", { m: tableros[0].minimo }) }));
    for (const x of tableros) {
      caja.append(el("h4", { class: "font-semibold mt-3", texto: tx("tableroN", { t: x.tablero }) }));
      if (!x.filas.length) { caja.append(el("p", { class: C.nota, texto: tx("mejorTableroNadie") })); continue; }
      caja.append(el("div", { class: "overflow-x-auto" }, el("table", { class: "pi-tabla", "data-tablero": x.tablero },
        el("thead", {}, el("tr", {},
          el("th", { class: "num", scope: "col", texto: tx("puesto") }), el("th", { scope: "col", texto: tx("nombre") }),
          el("th", { scope: "col", texto: tx("equipo") }), el("th", { class: "num", scope: "col", texto: tx("pts") }),
          el("th", { class: "num", scope: "col", texto: tx("partidas") }), el("th", { class: "num", scope: "col", texto: "%" }))),
        el("tbody", {}, x.filas.slice(0, 5).map((f) => el("tr", {},
          el("td", { class: "num", texto: f.puesto }), el("td", { class: "font-semibold", texto: f.nombre }),
          el("td", { texto: f.institucion }), el("td", { class: "num", texto: puntosTexto(f.puntos) }),
          el("td", { class: "num", texto: f.jugadas }), el("td", { class: "num", texto: Math.round(f.porcentaje * 100) })))))));
    }
  }

  // ---------- Los premios especiales ----------
  // Además del podio: por franja de Elo, por categoría, la mejor mujer y el
  // mejor sin Elo (js/pareo/premios.js). Nadie se lleva dos premios: el
  // podio primero y después cada premio en el orden en que está anotado.
  // Solo en individual (en equipos ya está el mejor de cada tablero).
  function pintarPremios(k) {
    const v = t();
    const caja = $("pi-premios");
    caja.replaceChildren();
    if (E.esDeEquipos(v) || !v.jugadores.length) return;
    const lista = (v.premiosEspeciales || []).map(PareoPremios.normalizar).filter(Boolean);
    const sec = el("section", { class: "mt-6", "aria-labelledby": "pi-premios-titulo" },
      el("h3", { id: "pi-premios-titulo", class: "font-serif text-lg font-bold mb-1", texto: tx("premiosTitulo") }),
      el("p", { class: C.nota + " mb-2", texto: tx("premiosAyuda") }));
    caja.append(sec);
    if (lista.length) {
      const filas = k ? V.aplicarDesempate(v, E.clasificacion(hasta(k), v.desempates)) : [];
      const reparto = PareoPremios.asignar(Object.assign({}, v, { premiosEspeciales: lista }), filas, jugador);
      if (k && k < V.totalRondas(v)) sec.append(el("p", { class: "text-sm font-semibold mb-2", texto: tx("premiosProvisional", { r: k, t: V.totalRondas(v) }) }));
      const ul = el("ul", { id: "pi-premios-lista", class: "space-y-2" });
      reparto.especiales.forEach((x, i) => {
        const ganan = !k ? tx("premiosSinRondas")
          : x.ganadores.length ? x.ganadores.map((g) => (x.premio.cuantos > 1 ? g.lugar + ". " : "") + nombreDe(g.id) + " (" + tx("puesto").toLowerCase() + " " + g.puesto + ", " + puntosTexto(g.puntos) + " " + tx("pts").toLowerCase() + ")").join(" · ")
          : x.candidatos ? tx("premiosYaPremiados") : tx("premiosNadie");
        ul.append(el("li", { class: "pi-revisar flex flex-wrap items-start justify-between gap-2", "data-premio": String(i) },
          el("div", {},
            el("p", { class: "font-semibold", texto: PareoPremios.etiqueta(x.premio, Pagina.idioma) + (x.premio.cuantos > 1 ? " · " + tx("premiosCuantos", { n: x.premio.cuantos }) : "") }),
            el("p", { class: "text-sm", "data-ganadores": "", texto: ganan })),
          el("button", { type: "button", class: C.miniPeligro, "aria-label": tx("premiosQuitarA", { p: PareoPremios.etiqueta(x.premio, Pagina.idioma) }), onclick: () => {
            v.premiosEspeciales = lista.filter((_, j) => j !== i); guardar(); pintarClasificacion();
            const b = $("pi-premio-tipo"); if (b) b.focus();
          } }, tx("quitar"))));
      });
      sec.append(ul);
    }
    // Agregar uno: el tipo y lo que pide cada tipo (desde/hasta, la categoría).
    const tipo = el("select", { id: "pi-premio-tipo", class: C.campoChico },
      el("option", { value: "elo", texto: tx("premioTipoElo") }), el("option", { value: "categoria", texto: tx("premioTipoCategoria") }),
      el("option", { value: "mujer", texto: tx("premioTipoMujer") }), el("option", { value: "sinElo", texto: tx("premioTipoSinElo") }));
    const desde = el("input", { id: "pi-premio-desde", type: "number", min: "0", max: "3500", step: "1", inputmode: "numeric", class: C.campoChico + " w-24" });
    const hastaElo = el("input", { id: "pi-premio-hasta", type: "number", min: "0", max: "3500", step: "1", inputmode: "numeric", class: C.campoChico + " w-24" });
    const cats = PareoPremios.categorias(v);
    const categoria = el("select", { id: "pi-premio-categoria", class: C.campoChico }, cats.map((c) => el("option", { value: c, texto: c })));
    const cuantos = el("select", { id: "pi-premio-cuantos", class: C.campoChico }, [1, 2, 3].map((n) => el("option", { value: String(n), texto: String(n) })));
    const campo = (id, texto, control) => el("label", { for: id, class: "flex flex-col text-sm" }, el("span", { class: "font-semibold", texto }), control);
    const cElo = el("div", { class: "flex flex-wrap gap-2" }, campo("pi-premio-desde", tx("premioDesde"), desde), campo("pi-premio-hasta", tx("premioHasta"), hastaElo));
    const cCat = cats.length ? campo("pi-premio-categoria", tx("premioTipoCategoria"), categoria) : el("p", { class: C.nota, texto: tx("premiosSinCategorias") });
    const mostrar = () => { cElo.hidden = tipo.value !== "elo"; cCat.hidden = tipo.value !== "categoria"; };
    tipo.addEventListener("change", mostrar);
    const agregar = el("button", { type: "button", id: "pi-premio-agregar", class: C.botonSec }, tx("premiosAgregar"));
    agregar.addEventListener("click", () => {
      const p = PareoPremios.normalizar({ tipo: tipo.value, desde: desde.value, hasta: hastaElo.value, valor: tipo.value === "categoria" && cats.length ? categoria.value : "", cuantos: cuantos.value });
      if (!p) { Avisos.avisar(tx(tipo.value === "elo" ? "premiosEloMal" : "premiosCategoriaMal"), { tipo: "error" }); return; }
      v.premiosEspeciales = lista.concat([p]);
      guardar(); pintarClasificacion();
      Avisos.avisar(tx("premiosAgregado", { p: PareoPremios.etiqueta(p, Pagina.idioma) }));
      const b = $("pi-premio-tipo"); if (b) b.focus();
    });
    sec.append(el("div", { class: "mt-3 flex flex-wrap items-end gap-3" },
      campo("pi-premio-tipo", tx("premioTipo"), tipo), cElo, cCat, campo("pi-premio-cuantos", tx("premioCuantosCampo"), cuantos), agregar));
    mostrar();
  }

  // El Elo que gana o pierde cada uno: solo en individual y si alguien tiene Elo.
  const conElo = (v) => !E.esDeEquipos(v) && v.jugadores.some((j) => Number(j.elo) > 0);
  const celdasElo = (x) => (x && x.partidas
    ? [["rp", String(x.rp)], ["k", String(x.k)], ["cambio", PareoElo.textoCambio(x.cambio, Pagina.idioma)]]
    : [["rp", ""], ["k", x && x.k ? String(x.k) : ""], ["cambio", ""]]);

  // El desempate por tableros es un número armado (E.codificarTableros): se
  // escribe tablero por tablero.
  const valorDesempate = (c, x) => (c === "TB" ? E.textoTableros(x, t().tableros) : formatoNum(x));

  // ---------- Tabla cruzada ----------
  // Cada casilla la escribe V.celdaCruzada (la misma del informe oficial).
  const letraCruzada = () => (Pagina.idioma === "en" ? { w: "w", b: "b", bye: tx("cBye") } : { w: "b", b: "n", bye: tx("cBye") });
  function pintarCruzada() {
    const v = t();
    pintarSelectInstitucion($("pi-cruzada-institucion"));
    const tabla = $("pi-tabla-cruzada");
    tabla.replaceChildren();
    if (!v.jugadores.length) return;
    const k = rondasCompletas();
    const todasFilas = E.clasificacion(hasta(k), v.desempates);
    const filas = filasFiltradas(todasFilas);
    const num = T.numeros(v);
    const R = v.rondas.length;
    tabla.append(el("thead", {}, el("tr", {},
      el("th", { class: "num", scope: "col", texto: tx("puesto") }), el("th", { class: "num", scope: "col", texto: tx("nro") }),
      el("th", { scope: "col", texto: tx("nombre") }), el("th", { class: "num", scope: "col", texto: "Elo" }),
      Array.from({ length: R }, (_, r) => el("th", { class: "text-center", scope: "col", texto: tx("rCorta", { r: r + 1 }) })),
      el("th", { class: "num", scope: "col", texto: tx("pts") }))));
    const cuerpo = el("tbody");
    const letra = letraCruzada();
    for (const f of filas) {
      const j = jugador(f.id);
      const celdas = [];
      for (let r = 0; r < R; r++) celdas.push(el("td", { class: "text-center whitespace-nowrap", texto: V.celdaCruzada(v, r, f.id, num, letra, false) }));
      cuerpo.append(el("tr", {},
        el("td", { class: "num", texto: f.puesto }), el("td", { class: "num", texto: num.get(f.id) }),
        el("td", { class: "font-semibold", texto: j.nombre }), el("td", { class: "num", texto: Number(j.elo) > 0 ? j.elo : "" }),
        celdas, el("td", { class: "num font-bold", texto: puntosTexto(T.puntos(v, f.id)) })));
    }
    tabla.append(cuerpo);
  }

  // El subtítulo del PDF: nombre del torneo, la institución si hay una
  // elegida, y quién lo hizo.
  function subtituloPDF() {
    return [t().nombre, estado.filtroInstitucion, "Pareo Integral"].filter(Boolean).join(" · ");
  }

  function datosClasificacionPDF() {
    const v = t();
    const k = rondasCompletas();
    const todasFilas = E.clasificacion(hasta(k), v.desempates);
    const filas = filasFiltradas(todasFilas);
    const num = T.numeros(v);
    const elos = conElo(v) ? PareoElo.calcular(v, k) : null;
    const encabezados = [tx("puesto"), tx("nro"), tx("nombre"), tx("institucion"), tx("fed"), "Elo", tx("pts")]
      .concat(v.desempates, elos ? ["Rp", "K", "+/-Elo"] : []);
    const anchos = [1, 1, 3, 2.2, 1, 1, 1].concat(v.desempates.map(() => 1), elos ? [1, 0.7, 1] : []);
    const filasTabla = filas.map((f) => {
      const j = jugador(f.id);
      return [String(f.puesto), String(num.get(f.id)), j.nombre + (j.titulo ? " (" + j.titulo + ")" : ""),
        j.institucion || "", j.fed || "", Number(j.elo) > 0 ? String(j.elo) : "", puntosTexto(f.puntos)]
        .concat(v.desempates.map((c) => valorDesempate(c, f.valores[c])), elos ? celdasElo(elos.get(f.id)).map((c) => c[1]) : []);
    });
    const notas = v.desempates.map((c) => {
      const info = E.catalogo(v).find((x) => x.codigo === c);
      return info ? c + ": " + info[Pagina.idioma] : c;
    }).concat(elos ? ["Rp: " + tx("eloRp"), "K: " + tx("eloK"), "+/-Elo: " + tx("eloCambio"), tx("eloNota")] : []);
    return {
      titulo: k ? tx("clasificacionTras", { r: k }) : tx("fClasificacion"),
      subtitulo: subtituloPDF(), encabezados, anchos, filas: filasTabla, notas,
    };
  }

  // Igual que pintarCruzada, pero en caracteres sencillos: el PDF escribe
  // Latin-1/WinAnsi a mano (js/reporte-pdf.js) y un signo menos de verdad
  // («−», U+2212) no está en esa tabla y se perdería sin avisar. Un guion
  // común sí.
  function datosCruzadaPDF() {
    const v = t();
    const k = rondasCompletas();
    const todasFilas = E.clasificacion(hasta(k), v.desempates);
    const filas = filasFiltradas(todasFilas);
    const num = T.numeros(v);
    const R = v.rondas.length;
    const letra = letraCruzada();
    const encabezados = [tx("puesto"), tx("nro"), tx("nombre"), "Elo"]
      .concat(Array.from({ length: R }, (_, r) => tx("rCorta", { r: r + 1 }))).concat([tx("pts")]);
    const anchos = [1, 1, 3, 1].concat(Array.from({ length: R }, () => 1)).concat([1]);
    const filasTabla = filas.map((f) => {
      const j = jugador(f.id);
      const celdas = [];
      for (let r = 0; r < R; r++) celdas.push(V.celdaCruzada(v, r, f.id, num, letra, true));
      return [String(f.puesto), String(num.get(f.id)), j.nombre, Number(j.elo) > 0 ? String(j.elo) : ""]
        .concat(celdas).concat([puntosTexto(T.puntos(v, f.id))]);
    });
    return { titulo: tx("fCruzada"), subtitulo: subtituloPDF(), encabezados, anchos, filas: filasTabla, notas: [tx("cruzadaAyuda")] };
  }

  async function bajarPDF(boton, datosFn, sufijo) {
    const v = t();
    if (!v.jugadores.length) { Avisos.avisar(tx("sinNadaQueExportar"), { tipo: "error" }); return; }
    boton.disabled = true;
    const original = boton.textContent;
    boton.textContent = tx("generandoPdf");
    try {
      const doc = await conOrganizacion(window.PareoPDF.documento(datosFn()));
      bajarBlob(await window.PareoPDF.generar(doc), window.PareoPDF.nombreArchivo(v.nombre, sufijo));
    } catch (e) {
      Avisos.avisar(tx("errorPdf", { e: e.message }), { tipo: "error" });
    } finally {
      boton.disabled = false;
      boton.textContent = original;
    }
  }

  Object.assign(Pagina, { filasFiltradas, pintarClasificacion, valorDesempate, pintarCruzada,
    datosClasificacionPDF, datosCruzadaPDF, bajarPDF });
})();

/*! rev bfb5bbb0d2d82f9f */
