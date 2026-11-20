/* ===== Pareo Integral — la página (pareo.html): los torneos por equipos =====
 *
 * Los encuentros, las alineaciones y las planillas de anotación de un torneo por equipos, y el
 * sistema Scheveningen.
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
  const { T, E, V, C, $, el, tx, estado, normalizarBusqueda, guardar, t, jugador, nombreDe, puntosTexto,
    pintarRondas, RESULTADOS, horaCR, marcaDe, asegurarCapitanes, conectarCapitanes, mostrarCapitanes,
    confirmarCambio, pedirMotivo, anotarCorreccion } = Pagina;

  // ---------- Los encuentros de un torneo por equipos ----------
  // Cada encuentro: los dos equipos con sus puntos de encuentro antes de la
  // ronda, quiénes juegan de cada lado (los cuatro primeros del orden de
  // tableros, que el árbitro cambia si falta alguien: los de abajo suben y
  // el suplente entra al final) y el resultado de cada tablero. El del
  // encuentro sale solo de los tableros (js/pareo/equipos.js).
  function pintarEncuentros(caja, r) {
    const v = t();
    const R = v.rondas[r];
    const num = T.numeros(v);
    const marcasEq = V.marcasIncidencias(R);
    const antes = (id) => T.puntosHasta(v, id, r);
    const nombreIntegrante = (idEquipo, idJ) => {
      const e = jugador(idEquipo);
      const j = e && e.integrantes.find((x) => x.id === idJ);
      return j ? j.nombre : "—";
    };
    const lista = el("div", { class: "space-y-4" });
    R.mesas.forEach((m) => { if (m.n !== null) E.prepararMesa(v, m); });
    const avisos = E.avisosAlineacion(v, r);
    const listaAvisos = (cuales, id) => (cuales.length ? el("ul", { id, class: "mt-2 space-y-1 text-sm" }, cuales.map((a) =>
      el("li", {}, el("span", { class: "font-semibold", texto: tx("cortosAviso") + " " }), tx(TEXTO_ALINEACION[a.tipo], { e: a.nombre, n: a.presentes, k: a.pierde })))) : null);
    const generales = listaAvisos(avisos.filter((a) => a.mesa == null), "pi-alin-generales");
    if (generales) caja.append(generales);
    // Los capitanes confirman la alineación desde su celular (la última ronda).
    if (r === v.rondas.length - 1) {
      const cajaCap = el("div", { id: "pi-capitanes-caja", class: "no-imprimir mb-4" });
      const bCap = el("button", { type: "button", id: "pi-capitanes", class: C.botonSec, "aria-expanded": estado.verCapitanes ? "true" : "false" }, tx("capitanesBoton"));
      bCap.addEventListener("click", async () => {
        estado.verCapitanes = !estado.verCapitanes;
        if (estado.verCapitanes) { asegurarCapitanes(); guardar(); await conectarCapitanes(); }
        pintarRondas();
      });
      caja.append(el("div", { class: "no-imprimir mb-3" }, bCap), cajaCap);
      if ((v.capitanes && Object.keys(v.capitanes).length)) conectarCapitanes();
      if (estado.verCapitanes) mostrarCapitanes(cajaCap, R);
    }
    R.mesas.forEach((m, i) => {
      if (m.n === null) {
        lista.append(el("p", { class: "rounded-xl border border-brand-200 dark:border-brand-700 p-3 text-sm" },
          el("span", { class: "font-semibold", texto: tx("mesa") + " " + V.mesaFisica(v, i) + ": " + num.get(m.b) + ". " + nombreDe(m.b) }),
          " — " + tx("byeEquipo", { p: puntosTexto(v.puntos.bye), t: puntosTexto(E.TABLEROS / 2) })));
        return;
      }
      E.prepararMesa(v, m);
      const pe = E.puntosDelEncuentro(v, m);
      const nombresEnc = [nombreDe(m.b), nombreDe(m.n)].concat([m.b, m.n].flatMap((idE) => (jugador(idE) || { integrantes: [] }).integrantes.map((j) => j.nombre)));
      const tarjeta = el("section", { class: "rounded-xl border border-brand-200 dark:border-brand-700 p-3", "aria-labelledby": "pi-enc-" + i + "-t", "data-nombres": normalizarBusqueda(nombresEnc.join(" ")) });
      tarjeta.append(el("h3", { id: "pi-enc-" + i + "-t", class: "font-semibold" },
        tx("mesa") + " " + V.mesaFisica(v, i) + ": " + num.get(m.b) + ". " + nombreDe(m.b) + " (" + puntosTexto(antes(m.b)) + ") – " +
        num.get(m.n) + ". " + nombreDe(m.n) + " (" + puntosTexto(antes(m.n)) + ")"));
      tarjeta.append(el("p", { id: "pi-enc-" + i + "-r", class: "text-sm mt-1", role: "status" },
        m.r ? tx(pe.incomparecencia ? "encuentroIncomp" : "encuentroResultado", {
          b: puntosTexto(pe.b), n: puntosTexto(pe.n),
          g: m.r === "=" ? tx("empate") : tx("ganaEquipo", { e: nombreDe(m.r === "1-0" || m.r === "+-" ? m.b : m.n) }),
        }) : tx("encuentroFalta", { b: puntosTexto(pe.b), n: puntosTexto(pe.n) })));
      const deEsta = listaAvisos(avisos.filter((a) => a.mesa === i), "pi-enc-" + i + "-avisos");
      if (deEsta) tarjeta.append(deEsta);

      // Quiénes juegan: una casilla por integrante, hasta cuatro.
      const alineacion = el("div", { class: "grid sm:grid-cols-2 gap-3 mt-2 no-imprimir" });
      for (const lado of "bn") {
        const e = jugador(m[lado]);
        const elegidos = m.alineacion[lado];
        const lleno = elegidos.length >= E.TABLEROS;
        const fs = el("fieldset", { class: "text-sm" }, el("legend", { class: "font-semibold", texto: tx("juegan", { e: e.nombre }) }));
        const porCapitan = m.alineacionCapitan && m.alineacionCapitan[lado];
        if (porCapitan) fs.append(el("p", { class: C.nota, "data-capitan": lado, texto: tx("capitanConfirmo", { h: horaCR(porCapitan) }) }));
        e.integrantes.forEach((j, k) => {
          const id = "pi-enc-" + i + "-" + lado + "-" + k;
          const si = elegidos.includes(j.id);
          fs.append(el("label", { class: "flex items-center gap-2" },
            el("input", { type: "checkbox", id, checked: si, disabled: !si && lleno, onchange: (ev) => {
              const marcados = new Set(m.alineacion[lado]);
              if (ev.target.checked) marcados.add(j.id); else marcados.delete(j.id);
              // Siempre en el orden de tableros (sistema olímpico).
              m.alineacion[lado] = e.integrantes.map((x) => x.id).filter((x) => marcados.has(x));
              alCambiarEncuentro(m, id);
            } }),
            el("span", { texto: (k + 1) + ". " + j.nombre + (k >= E.TABLEROS ? " (" + tx("suplente") + ")" : "") })));
        });
        alineacion.append(fs);
      }
      tarjeta.append(alineacion);

      // Los tableros: con quién juega cada uno y el resultado. Una lista, no
      // una tabla: en el celular, cuatro columnas con nombres largos sacan de
      // la pantalla a las negras. El equipo de cada uno se alterna (el de la
      // izquierda con blancas en los tableros 1 y 3) y va en el título.
      const tableros = el("ol", { class: "mt-3 space-y-2" });
      for (const x of E.tablerosDe(v, m)) {
        const equipoBlancas = x.bBlancas ? m.b : m.n, equipoNegras = x.bBlancas ? m.n : m.b;
        const blancas = x.blancas ? nombreIntegrante(equipoBlancas, x.blancas) : tx("nadie");
        const negras = x.negras ? nombreIntegrante(equipoNegras, x.negras) : tx("nadie");
        let celda;
        if (x.fijo || pe.incomparecencia) celda = el("span", { class: "text-sm", texto: tx("corto_" + (pe.incomparecencia ? m.r : x.r)) + " · " + tx("incomparecencia") });
        else {
          const id = "pi-enc-" + i + "-t" + x.k;
          const sel = el("select", { id, "data-resultado": "", class: C.campoChico, "aria-label": tx("resultadoTablero", { t: x.k + 1, b: blancas, n: negras }) });
          for (const [val, clave] of RESULTADOS) sel.append(el("option", { value: val, texto: tx(clave) }));
          sel.value = x.r || "";
          sel.addEventListener("change", async () => {
            const antes = m.partidas[x.k].r;
            if (r < v.rondas.length - 1 && antes && sel.value !== antes) {
              const motivo = await pedirMotivo(r, i, antes, sel.value || null, x.k + 1);
              if (!motivo) { sel.value = antes || ""; return; }
              anotarCorreccion(R, i, antes, sel.value || null, motivo, x.k + 1);
            } else if (antes && sel.value !== antes) {
              // En la ronda en juego: cambiar uno ya anotado pide confirmarlo y queda la constancia.
              if (!(await confirmarCambio(r, i, antes, sel.value || null, x.k + 1))) { sel.value = antes || ""; return; }
              anotarCorreccion(R, i, antes, sel.value || null, tx("correccionPrincipal"), x.k + 1);
            }
            m.partidas[x.k].r = sel.value || null;
            alCambiarEncuentro(m, id);
          });
          celda = el("span", {}, sel, el("span", { class: "pi-solo-imprimir", texto: x.r ? tx("corto_" + x.r) : "" }));
        }
        const [mBl, dBl] = x.blancas ? marcaDe(marcasEq, x.blancas, blancas) : [null, null];
        const [mNe, dNe] = x.negras ? marcaDe(marcasEq, x.negras, negras) : [null, null];
        tableros.append(el("li", { class: "flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-brand-100 dark:border-brand-800 pt-2", "data-tablero": x.k + 1 },
          el("span", { class: "font-mono text-xs font-bold", texto: tx("tableroN", { t: x.k + 1 }) }),
          el("span", { class: "text-sm flex-1 min-w-[12rem]" },
            el("span", { class: "font-semibold", title: nombreDe(equipoBlancas), texto: blancas }), mBl ? " " : null, mBl, " ",
            el("span", { class: C.nota, texto: "(" + tx("blancas") + ")" }), " – ",
            el("span", { class: "font-semibold", title: nombreDe(equipoNegras), texto: negras }), mNe ? " " : null, mNe, " ",
            el("span", { class: C.nota, texto: "(" + tx("negras") + ")" })),
          celda, dBl ? el("div", { class: "basis-full" }, dBl) : null, dNe ? el("div", { class: "basis-full" }, dNe) : null));
      }
      tarjeta.append(tableros);
      lista.append(tarjeta);
    });
    caja.append(lista);
  }

  const TEXTO_ALINEACION = { menos2: "alinMenos2", incompleto: "alinIncompleto", fueraDeOrden: "alinFueraDeOrden", ajeno: "alinAjeno", ordenCambiado: "alinOrdenCambiado" };

  // La hoja de alineación de cada equipo en cada encuentro de la ronda: el
  // capitán marca a los cuatro que juegan, en el orden de tableros, y la
  // entrega firmada antes de la ronda (art. 66.2.h).
  function imprimirAlineaciones(r) {
    const v = t();
    const R = v.rondas[r];
    const num = T.numeros(v);
    const cont = $("pi-firmas");
    Pagina.empezarHoja(cont);
    R.mesas.forEach((m, i) => {
      if (m.n === null) return;
      for (const [id, rival] of [[m.b, m.n], [m.n, m.b]]) {
        const e = jugador(id);
        const hoja = el("div", { class: "pi-firma-mesa" },
          el("h1", { class: "pi-firma-titulo" }, tx("alineacionTitulo", { r: r + 1, m: V.mesaFisica(v, i) }) + (v.nombre ? " — " + v.nombre : "")),
          el("p", { class: "pi-firma-jugador" }, tx("alineacionEquipos", { e: num.get(id) + ". " + e.nombre, r: num.get(rival) + ". " + nombreDe(rival) })),
          el("p", { class: "pi-firma-resultado" }, tx("alineacionInstrucciones", { t: E.TABLEROS })));
        e.integrantes.forEach((j, k) => hoja.append(el("p", { class: "pi-firma-jugador" },
          "☐  " + (k < E.TABLEROS ? tx("tableroN", { t: k + 1 }) : tx("suplente")) + ": " + j.nombre)));
        hoja.append(el("p", { class: "pi-firma-linea" }, tx("firmaCapitan", { e: e.nombre })), el("p", { class: "pi-firma-linea" }, tx("alineacionHora")));
        cont.append(hoja);
      }
    });
    if (!cont.children.length) return;
    Pagina.imprimirCon("pi-imprimiendo-firmas");
  }

  // Las planillas de anotación de la ronda: una por mesa (en equipos, una
  // por tablero), con los nombres, la ronda y la mesa ya escritos y 60
  // jugadas en dos columnas, como la planilla oficial. Cada una es UNA hoja
  // sin los márgenes del navegador (@page planilla, en css/styles.css): así
  // no sale la dirección ni el número de página y las 60 jugadas caben con
  // renglones altos para escribir.
  async function imprimirPlanillasAnotacion(r, solo) {
    const v = t();
    const R = v.rondas[r];
    // Con el evento en vivo, un QR por jugador que abre «Mi jugador» en el
    // enlace del evento ya con su nombre: la familia escanea la planilla.
    let base = v.evento && estado.eventoVivo && estado.eventoVivo.id === v.evento.id
      ? location.origin + location.pathname + "#evento=" + estado.eventoVivo.codigo + "&q=" : null;
    if (base) { try { await PareoQr.cargar(); } catch (e) { base = null; } }
    const cont = $("pi-firmas");
    Pagina.empezarHoja(cont);
    const lado = (color, nombre, quien) => el("div", { class: "pi-pl-lado" },
      el("span", { class: "pi-ft-color", texto: color }), el("span", { class: "pi-pl-nombre", texto: nombre }),
      base && quien ? el("span", { class: "pi-pl-qr", title: tx("anotacionQr", { n: quien }) }, PareoQr.svg(base + encodeURIComponent(quien), tx("anotacionQr", { n: quien }))) : null);
    const firma = (texto) => el("div", { class: "pi-ft-firma" }, el("span", { class: "pi-ft-raya" }), el("span", { class: "pi-ft-quien", texto }));
    const hoja = (titulo, blancas, negras, quienB, quienN) => {
      const tabla = el("table", { class: "pi-planilla-tabla" },
        el("colgroup", {}, ["pi-pl-col-n", "", "", "pi-pl-col-n pi-pl-col-mitad", "", ""].map((c) => el("col", c ? { class: c } : {}))),
        el("thead", {}, el("tr", {}, ["#", tx("blancas"), tx("negras"), "#", tx("blancas"), tx("negras")].map((x, k) => el("th", { scope: "col", class: k === 3 ? "pi-pl-mitad" : "", texto: x })))),
        el("tbody", {}, Array.from({ length: 30 }, (_, i) => el("tr", {},
          el("td", { class: "pi-planilla-n", texto: i + 1 }), el("td"), el("td"),
          el("td", { class: "pi-planilla-n pi-pl-mitad", texto: i + 31 }), el("td"), el("td")))));
      cont.append(el("div", { class: "pi-firma-mesa pi-planilla" },
        el("div", { class: "pi-pl-cabeza" },
          el("h1", { class: "pi-pl-torneo", texto: v.nombre || "" }),
          el("p", { class: "pi-pl-datos", texto: titulo + (v.fechaInicio ? " · " + v.fechaInicio : "") + (v.ritmo ? " · " + v.ritmo : "") })),
        el("div", { class: "pi-pl-jugadores" }, lado(tx("blancas"), blancas, quienB), lado(tx("negras"), negras, quienN)),
        tabla,
        el("div", { class: "pi-pl-pie" },
          el("p", { class: "pi-ft-resultado" }, el("span", { class: "pi-ft-etiqueta", texto: tx("resultado") + ":" }),
            el("span", { class: "pi-ft-casillas" }, ["1-0", "=", "0-1"].map((x) => el("span", { class: "pi-ft-casilla", texto: "☐ " + tx("corto_" + x) })))),
          el("div", { class: "pi-ft-firmas pi-pl-firmas" }, firma(tx("firmaDe", { n: blancas })), firma(tx("firmaDe", { n: negras }))))));
    };
    R.mesas.forEach((m, i) => {
      if (m.n === null || (solo != null && i !== solo)) return;
      if (E.esDeEquipos(v)) {
        const copia = m.alineacion ? m : E.prepararMesa(v, JSON.parse(JSON.stringify(m)));
        const quien = (idE, idJ) => { const e = jugador(idE); const j = e && idJ && e.integrantes.find((y) => y.id === idJ); return j ? j.nombre : null; };
        const de = (idE, idJ) => { const q = quien(idE, idJ); return q ? q + " (" + nombreDe(idE) + ")" : tx("nadie"); };
        for (const x of E.tablerosDe(v, copia)) {
          if (!x.blancas || !x.negras) continue;
          const eb = x.bBlancas ? m.b : m.n, en = x.bBlancas ? m.n : m.b;
          hoja(tx("anotacionTituloTablero", { r: r + 1, m: V.mesaFisica(v, i), t: x.k + 1 }), de(eb, x.blancas), de(en, x.negras), quien(eb, x.blancas), quien(en, x.negras));
        }
      } else hoja(tx("anotacionTitulo", { r: r + 1, m: V.mesaFisica(v, i) }), nombreDe(m.b), nombreDe(m.n), nombreDe(m.b), nombreDe(m.n));
    });
    if (!cont.children.length) return;
    Pagina.imprimirCon("pi-imprimiendo-firmas");
  }

  // Cada cambio de un tablero o de una alineación vuelve a sacar el
  // resultado del encuentro, guarda y vuelve a pintar la ronda, con el foco
  // en el mismo control.
  function alCambiarEncuentro(m, idFoco) {
    const v = t();
    m.r = E.resultadoEncuentro(v, m);
    guardar();
    pintarRondas();
    const x = $(idFoco);
    if (x) x.focus();
  }

  // ---------- Scheveningen ----------
  // Por qué no se puede emparejar, dicho con los nombres.
  function textoErrorSchev(e) {
    if (e.error === "sinEquipo") return tx("schevSinEquipo", { l: e.ids.map(nombreDe).join(", ") });
    if (e.error === "dosEquipos") return tx("schevDosEquipos", { n: e.cuantos, l: e.nombres.join(", ") });
    if (e.error === "mismoNumero") return tx("schevMismoNumero", { a: e.a.nombre, na: e.a.ids.length, b: e.b.nombre, nb: e.b.ids.length });
    return tx("schevMuchos", { m: e.max, n: Math.max(e.a.ids.length, e.b.ids.length) });
  }

  // Antes de la ronda 1: los dos equipos con su orden de tableros, o lo que
  // falta para poder armarlos.
  function equiposSchevVista(v) {
    const e = T.equiposScheveningen(v);
    if (e.error) return el("p", { class: "mb-4 text-sm font-semibold text-red-800 dark:text-red-200", role: "status", texto: textoErrorSchev(e) });
    const lista = (letra, eq) => el("div", {},
      el("h4", { class: "font-semibold text-sm", texto: tx("schevEquipoTitulo", { l: letra, e: eq.nombre }) }),
      el("ol", { class: "list-decimal pl-6 text-sm" }, eq.ids.map((id) => el("li", { texto: nombreDe(id) }))));
    return el("div", { class: "mb-4" },
      el("h3", { class: "font-semibold mb-1", texto: tx("schevEquipos") }),
      el("div", { class: "grid sm:grid-cols-2 gap-4" }, lista("A", e.a), lista("B", e.b)));
  }

  // El marcador del encuentro: lo que importa en un Scheveningen es qué
  // equipo suma más. Va arriba de la clasificación individual.
  function pintarMarcadorSchev(v) {
    const caja = $("pi-clas-schev");
    if (!caja) return;
    caja.replaceChildren();
    const m = v.sistema === "scheveningen" && v.rondas.length ? T.marcadorScheveningen(v) : null;
    caja.hidden = !m;
    if (!m) return;
    const total = T.rondasDelTorneo(v);
    const terminado = v.rondas.length === total && m.rondas.every((x) => !x.faltan);
    const frase = m.totalA === m.totalB ? tx(terminado ? "schevEmpateFinal" : "schevEmpate")
      : tx(terminado ? "schevGano" : "schevGana", { e: m.totalA > m.totalB ? m.a : m.b });
    const filas = m.rondas.map((x, k) => el("tr", {},
      el("th", { scope: "row", class: "num", texto: k + 1 }),
      el("td", { class: "num", texto: puntosTexto(x.a) }), el("td", { class: "num", texto: puntosTexto(x.b) }),
      el("td", { texto: x.faltan ? tx("schevFaltan", { n: x.faltan }) : "" })));
    caja.append(
      el("h3", { class: "font-semibold", texto: tx("schevMarcador") }),
      el("p", { class: "text-lg font-bold mt-1", texto: tx("schevMarcadorTotal", { a: m.a, pa: puntosTexto(m.totalA), pb: puntosTexto(m.totalB), b: m.b }) }),
      el("p", { class: "text-sm mb-2", texto: frase }),
      el("div", { class: "overflow-x-auto" }, el("table", { class: "pi-tabla" },
        el("thead", {}, el("tr", {}, el("th", { scope: "col", class: "num", texto: tx("schevRonda") }),
          el("th", { scope: "col", class: "num", texto: m.a }), el("th", { scope: "col", class: "num", texto: m.b }), el("th", { scope: "col", texto: tx("schevPendientes") }))),
        el("tbody", {}, filas))));
  }

  Object.assign(Pagina, { pintarEncuentros, imprimirAlineaciones, imprimirPlanillasAnotacion, textoErrorSchev,
    equiposSchevVista, pintarMarcadorSchev });
})();

/*! rev bfb5bbb0d2d82f9f */
