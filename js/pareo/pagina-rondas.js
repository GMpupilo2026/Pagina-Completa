/* ===== Pareo Integral — la página (pareo.html): la ficha «Rondas» =====
 *
 * La lista de rondas, la ronda jugada y sus atajos, revisar el pareo antes de anunciarlo, la ronda
 * nueva, pasar lista, emparejar y deshacer la ronda.
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
  const { T, E, V, motor, C, $, el, tx, estado, normalizarBusqueda, guardar, t, jugador, nombreDe,
    totalRondas, puntosTexto, menuDeBotones, textoRevisar, claveRevisar, sinRevisar, devolverAlTorneo,
    compartirLectura, enlaceVivoActual, abrirCompartir } = Pagina;

  // ---------- Rondas ----------
  function pintarRondas() {
    const v = t();
    const nav = $("pi-rondas-nav");
    nav.replaceChildren();
    const total = totalRondas();
    const hay = v.rondas.length;
    const siguiente = hay < total ? hay : null;
    if (estado.ronda == null || estado.ronda > hay || (estado.ronda === hay && siguiente == null)) {
      estado.ronda = siguiente != null && (hay === 0 || T.rondaCompleta(v.rondas[hay - 1])) ? hay : Math.max(0, hay - 1);
    }
    for (let r = 0; r < hay + (siguiente != null ? 1 : 0); r++) {
      const si = r === estado.ronda;
      nav.append(el("button", {
        type: "button", "aria-pressed": si ? "true" : "false",
        class: C.rondaBoton,
        onclick: () => { estado.ronda = r; pintarRondas(); },
      }, tx("rondaN", { r: r + 1 }) + (r === hay ? " · " + tx("porEmparejar") : T.rondaCompleta(v.rondas[r]) ? "" : " · " + tx("enJuego"))));
    }
    const caja = $("pi-ronda");
    caja.replaceChildren();
    if (!v.jugadores.length) { caja.append(el("p", { class: C.nota, texto: tx("primeroJugadores") })); return; }
    if (estado.ronda < hay) pintarRondaJugada(caja, estado.ronda);
    else if (siguiente != null) pintarRondaNueva(caja, siguiente);
    else caja.append(el("p", { class: C.nota, texto: tx("torneoTerminado") }));
  }

  const RESULTADOS = [["", "resSin"], ["1-0", "res10"], ["=", "resTablas"], ["0-1", "res01"], ["+-", "resMasMenos"], ["-+", "resMenosMas"], ["--", "resMenosMenos"]];

  // «Reimprimir una mesa»: la planilla de anotación o la de firmar de una
  // sola mesa (la que se rompió o se perdió), sin sacar toda la ronda. Va
  // debajo de las mesas: sus selects de resultado son los primeros de la
  // ronda (el teclado y las pruebas los buscan así).
  function pintarReimprimirMesa(caja, r) {
    const R = t().rondas[r];
    const mesas = R.mesas.map((m, i) => [m, i]).filter(([m]) => m.n !== null);
    if (!mesas.length) return;
    const sel = el("select", { id: "pi-imprimir-mesa", class: C.campoChico, "aria-label": tx("reimprimirMesa") },
      mesas.map(([, i]) => el("option", { value: String(i), texto: tx("mesa") + " " + V.mesaFisica(t(), i) })));
    const una = () => Number(sel.value);
    caja.append(el("div", { class: "no-imprimir mt-4 mb-4 flex flex-wrap items-center gap-2" },
      el("span", { class: "text-sm font-semibold", texto: tx("reimprimirMesa") }), sel,
      el("button", { type: "button", id: "pi-una-anotacion", class: C.mini, onclick: () => Pagina.imprimirPlanillasAnotacion(r, una()) }, tx("reimprimirAnotacion")),
      el("button", { type: "button", id: "pi-una-firma", class: C.mini, onclick: () => Pagina.imprimirPlanillasFirma(r, una()) }, tx("reimprimirFirma"))));
  }

  function pintarRondaJugada(caja, r) {
    const v = t();
    const R = v.rondas[r];
    const pendientes = R.mesas.filter((m) => m.n && !T.rondaCompleta({ mesas: [m] })).length;
    const ultima = r === v.rondas.length - 1;
    // Los botones de la ronda, en tres menús (Imprimir, Compartir, Árbitros y
    // cámaras) en vez de once sueltos; «Deshacer el emparejamiento» va aparte,
    // al final («Los botones de Rondas, agrupados» en docs/decisiones/juegos-y-torneos.md).
    caja.append(el("div", { class: "flex flex-wrap items-baseline justify-between gap-3 mb-3" },
      el("h2", { class: "font-serif text-xl font-bold", texto: tx("emparejamientosRonda", { r: r + 1 }) + (v.sistema === "eliminacion" ? " · " + Pagina.nombreRondaElim(v, r) : "") + (v.nombre ? " — " + v.nombre : "") }),
      el("div", { class: "flex flex-wrap gap-2 no-imprimir" },
        menuDeBotones("pi-menu-imprimir", tx("menuImprimir"), [
          el("button", { type: "button", onclick: () => window.print() }, tx("imprimir")),
          el("button", { type: "button", onclick: () => Pagina.imprimirPlantillaMesas(r) }, tx("plantillaMesas")),
          el("button", { type: "button", id: "pi-planillas-firma", onclick: () => Pagina.imprimirPlanillasFirma(r) }, tx("planillasFirma")),
          el("button", { type: "button", id: "pi-planillas-anotacion", onclick: () => Pagina.imprimirPlanillasAnotacion(r) }, tx("anotacionBoton")),
          E.esDeEquipos(v) ? el("button", { type: "button", id: "pi-alineaciones", onclick: () => Pagina.imprimirAlineaciones(r) }, tx("alineacionesImprimir")) : null,
          el("button", { type: "button", id: "pi-imprimir-todo", onclick: () => Pagina.imprimirTodoDeRonda(r) }, tx("imprimirTodo")),
        ]),
        menuDeBotones("pi-menu-compartir", tx("menuCompartir"), [
          el("button", { type: "button", onclick: () => compartirLectura(r) }, tx("verDesdeElCelular")),
          el("button", { type: "button", id: "pi-ronda-whatsapp", "aria-expanded": "false", "aria-controls": "pi-ronda-compartir",
            onclick: (e) => abrirCompartir($("pi-ronda-compartir"), e.currentTarget, PareoCompartir.textoRonda(t(), r, { idioma: Pagina.idioma, enlace: enlaceVivoActual() })) }, tx("whatsappBoton")),
        ]),
        ultima ? menuDeBotones("pi-menu-arbitros", tx("menuArbitros"), [
          el("button", { type: "button", id: "pi-adjunto", onclick: () => Pagina.enlaceAdjunto(r) }, tx("adjuntoBoton")),
          el("button", { type: "button", id: "pi-camaras", onclick: Pagina.pedirCodigoCamaras }, tx("camarasBoton")),
        ]) : null)));
    caja.append(el("div", { id: "pi-ronda-compartir", class: "no-imprimir", hidden: true }));
    caja.append(el("p", { class: C.nota + " mb-3 no-imprimir", role: "status", texto: pendientes ? tx("faltanResultados", { n: pendientes }) : tx("rondaCompleta") }));
    if (!ultima) caja.append(el("p", { class: C.nota + " mb-3 no-imprimir", texto: tx("avisoCorregir") }));

    // Buscar una mesa por el nombre de quien juega, y los atajos del teclado.
    const buscarMesa = el("input", { id: "pi-buscar-mesa", type: "search", autocomplete: "off", class: C.campo, "aria-describedby": "pi-atajos-ayuda" });
    caja.append(el("div", { class: "no-imprimir mb-3 max-w-md" },
      el("label", { for: "pi-buscar-mesa", class: "block text-sm font-semibold mb-1", texto: tx("buscarMesa") }), buscarMesa,
      el("details", { class: "pi-ayuda" }, el("summary", { texto: tx("atajosTitulo") }),
        el("p", { id: "pi-atajos-ayuda", class: C.nota + " mt-1", texto: tx("atajosAyuda") }))));
    buscarMesa.addEventListener("input", () => filtrarMesas(buscarMesa.value));
    buscarMesa.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const primero = [...document.querySelectorAll("#pi-ronda select[data-resultado]")].find((s) => s.checkVisibility());
      if (primero) primero.focus();
    });
    if (ultima || v.rondas[r].inicio) Pagina.pintarReloj(caja, r);
    const cajaAdjunto = el("div", { id: "pi-adjunto-caja", class: "no-imprimir mb-4", hidden: true });
    // Las llamadas de los adjuntos y el chat con ellos.
    const cajaLlamadas = el("section", { id: "pi-llamadas", class: "no-imprimir mb-4 rounded-xl border-2 border-accent-500 p-3", role: "region", "aria-labelledby": "pi-llamadas-titulo", hidden: true });
    const cajaChat = el("section", { id: "pi-chat-adjuntos", class: "no-imprimir mb-4 rounded-xl border border-brand-200 dark:border-brand-700 p-3", hidden: true });
    const cajaCamaras = el("section", { id: "pi-camaras-caja", class: "no-imprimir mb-4 rounded-xl border border-brand-200 dark:border-brand-700 p-3", hidden: true });
    caja.append(cajaLlamadas, cajaAdjunto, cajaChat, cajaCamaras);
    if (ultima && (v.adjuntos || []).some((a) => a.activo)) { Pagina.conectarAdjuntos(); Pagina.mostrarAdjuntos(cajaAdjunto); }
    if (ultima && !E.esDeEquipos(v) && v.camaras && v.camaras.activo) Pagina.conectarCamaras().then(Pagina.pintarCamaras);
    if (ultima) Pagina.pintarCamaras();
    if (ultima) { Pagina.pintarLlamadas(); Pagina.pintarChat(); }
    if (E.esDeEquipos(v)) Pagina.pintarEncuentros(caja, r);
    else Pagina.pintarMesasIndividuales(caja, r);
    pintarReimprimirMesa(caja, r);
    Pagina.pintarNoJuegan(caja, r);
    if (ultima && V.sePuedeModificar(v, r)) Pagina.pintarModificarRonda(caja, r);
    pintarRevisionPareo(caja, r);
    Pagina.pintarConfirmar(caja, r);
    Pagina.pintarIncidencias(caja, r);
    if (ultima) caja.append(el("section", { class: "pi-zona-peligro no-imprimir", "aria-labelledby": "pi-peligro-titulo" },
      el("h3", { id: "pi-peligro-titulo", texto: tx("peligroTitulo") }),
      el("p", { class: C.nota, texto: tx("peligroAyuda", { r: r + 1 }) }),
      el("button", { type: "button", class: C.miniPeligro + " px-3 py-2", onclick: () => deshacerRonda(r) }, tx("deshacerRonda"))));
    for (const s of caja.querySelectorAll("select[data-resultado]")) atajosResultado(s);
  }

  // Esconde las mesas en que no juega nadie con ese nombre (sin tildes ni
  // mayúsculas). Cada mesa lleva sus nombres en data-nombres.
  function filtrarMesas(texto) {
    const q = normalizarBusqueda(texto).trim();
    for (const fila of document.querySelectorAll("#pi-ronda [data-nombres]")) fila.hidden = !!q && !fila.dataset.nombres.includes(q);
  }

  // Los atajos de un resultado: 1 gana blancas, 0 gana negras, = (o 5)
  // tablas; y salta solo al siguiente. En la ronda en juego no pide nada;
  // en una cerrada, el diálogo del motivo sale igual (lo pide el cambio).
  const ATAJOS = { "1": "1-0", "0": "0-1", "=": "=", "5": "=" };
  function atajosResultado(sel) {
    sel.addEventListener("keydown", (e) => {
      const val = ATAJOS[e.key];
      if (!val || e.altKey || e.ctrlKey || e.metaKey || ![...sel.options].some((o) => o.value === val)) return;
      e.preventDefault();
      const id = sel.id;
      sel.value = val;
      sel.dispatchEvent(new Event("change"));
      // El cambio puede volver a pintar la ronda: el siguiente se busca de nuevo.
      setTimeout(() => {
        if (document.querySelector('dialog[open]')) return;
        const todos = [...document.querySelectorAll("#pi-ronda select[data-resultado]")].filter((s) => s.checkVisibility());
        const k = todos.findIndex((s) => s.id === id);
        const siguiente = todos[k + 1];
        if (siguiente) siguiente.focus();
      }, 0);
    });
  }

  // ---------- Revisar el pareo antes de anunciarlo ----------
  // Lo que conviene mirar en la última ronda emparejada, mientras no tenga
  // resultados (V.revisarPareo). Si algo no gusta, «Deshacer el
  // emparejamiento» y volver a emparejar; si está bien, «Visto».
  function pintarRevisionPareo(caja, r) {
    const v = t();
    const R = v.rondas[r];
    if (r !== v.rondas.length - 1 || R.pareoVisto || R.mesas.some((m) => m.n != null && m.r && !E.esDeEquipos(v) && m.r !== "+-" && m.r !== "-+" && m.r !== "--")) return;
    const avisos = V.revisarPareo(v, r);
    if (!avisos.length) return;
    const texto = (x) => x.tipo === "centro" ? tx("pareoCentro", { m: x.mesa + 1, c: x.centro, b: x.b, n: x.n })
      : x.tipo === "colores" ? tx("pareoColores", { m: x.mesa + 1, j: x.nombre, c: tx(x.color === "w" ? "blancas" : "negras") })
      : tx("pareoPuntos", { m: x.mesa + 1, b: x.b, n: x.n, pb: puntosTexto(x.pb), pn: puntosTexto(x.pn) });
    const visto = el("button", { type: "button", id: "pi-pareo-visto", class: C.mini }, tx("pareoVisto"));
    visto.addEventListener("click", () => { R.pareoVisto = true; guardar(); pintarRondas(); });
    caja.append(el("section", { id: "pi-revision-pareo", class: "no-imprimir mb-4 rounded-xl border-2 border-accent-500 p-3", "aria-labelledby": "pi-revision-pareo-titulo" },
      el("h3", { id: "pi-revision-pareo-titulo", class: "font-semibold", texto: tx("pareoTitulo") }),
      el("p", { class: C.nota, texto: tx("pareoTexto") }),
      el("ul", { class: "mt-2 space-y-1 text-sm list-disc pl-5" }, avisos.map((x) => el("li", { texto: texto(x) }))),
      el("div", { class: "mt-2" }, visto)));
  }

  function pintarRondasNav() {
    // Repinta solo la barra de rondas (el foco queda en la mesa que se estaba llenando).
    const foco = document.activeElement;
    const r = estado.ronda;
    pintarRondas();
    estado.ronda = r;
    if (foco && foco.getAttribute && foco.getAttribute("aria-label")) {
      const igual = [...document.querySelectorAll("#pi-ronda select")].find((s) => s.getAttribute("aria-label") === foco.getAttribute("aria-label"));
      if (igual) igual.focus();
    }
  }

  function pintarRondaNueva(caja, r) {
    const v = t();
    if (r > 0 && !T.rondaCompleta(v.rondas[r - 1])) {
      caja.append(el("p", { class: C.nota, texto: tx("primeroResultados", { r }) }));
      return;
    }
    caja.append(el("h2", { class: "font-serif text-xl font-bold mb-2", texto: tx("emparejarRonda", { r: r + 1 }) }));
    if (r === 0) {
      const sinCategoria = v.jugadores.filter((j) => !j.categoria).length;
      const sinInstitucion = v.jugadores.filter((j) => !j.institucion).length;
      const sinElo = v.jugadores.filter((j) => !(Number(j.elo) > 0)).length;
      const problemas = [
        sinCategoria && [sinCategoria, "sinCategoriaResumen"],
        sinInstitucion && [sinInstitucion, "sinInstitucionResumen"],
        sinElo && [sinElo, "sinEloResumen"],
      ].filter(Boolean);
      if (problemas.length) {
        caja.append(el("div", { class: "mb-4" },
          el("p", { class: C.nota, texto: tx("antesDeEmparejar") }),
          el("ul", { class: "list-disc pl-6 text-sm text-brand-600 dark:text-brand-300" },
            problemas.map(([n, clave]) => el("li", { texto: tx(clave, { n }) })))));
      }
    }
    // Lo que quedó de la inscripción para revisar (evento de los JDE): cada
    // punto se marca como visto, y hasta marcarlos todos no se empareja.
    if (r === 0 || (v.pasarLista && !T.fijo(v))) pintarPasarLista(caja, pintarRondas);
    // En un suizo, quien no se acreditó no se empareja en ninguna ronda; en
    // todos contra todos, se decide antes de sortear la ronda 1.
    const ausentes = r === 0 || !T.fijo(v) ? noLlegaron(v) : [];
    let faltanRevisar = () => 0;
    const revisarEstado = el("p", { id: "pi-revisar-estado", class: "text-sm mt-2 font-semibold", role: "status" });
    if (r === 0) {
      const pend = V.pendientes(v);
      if (pend.length) {
        const vistos = new Set(v.revisadoAntes || []);
        const ul = el("ul", { id: "pi-revisar-lista", class: "mt-2 space-y-1 text-sm" });
        pend.forEach((x, i) => {
          const id = "pi-revisar-" + i, k = claveRevisar(x);
          ul.append(el("li", { class: "flex items-start gap-2" },
            el("input", { type: "checkbox", id, class: "mt-1", checked: vistos.has(k), onchange: (e) => {
              if (e.target.checked) vistos.add(k); else vistos.delete(k);
              v.revisadoAntes = [...vistos];
              guardar();
              actualizarRevision();
            } }),
            el("label", { for: id, texto: textoRevisar(x) })));
        });
        faltanRevisar = () => sinRevisar(v);
        caja.append(el("section", { id: "pi-revisar", class: "mb-4 rounded-xl border-2 border-accent-500 p-3", "aria-labelledby": "pi-revisar-titulo" },
          el("h3", { id: "pi-revisar-titulo", class: "font-semibold", texto: tx("revisarTitulo") }),
          el("p", { class: "text-sm mt-1", texto: tx("revisarTexto") }), ul, revisarEstado));
      }
    }
    // Quienes quedaron fuera de esta ronda por perder por incomparecencia en
    // la anterior (T.retirosPorIncomparecencia): por si alguno llegó y avisó,
    // se devuelve con un clic, antes de emparejar.
    const fueraPorIncomparecencia = r > 0 ? v.jugadores.filter((j) => j.retiroAuto === r && j.retiradoDespuesDe === r) : [];
    if (fueraPorIncomparecencia.length) {
      caja.append(el("section", { id: "pi-fuera-incomparecencia", class: "mb-4 rounded-xl border-2 border-accent-500 p-3", "aria-labelledby": "pi-fuera-titulo" },
        el("h3", { id: "pi-fuera-titulo", class: "font-semibold", texto: tx("fueraTitulo", { r: r + 1 }) }),
        el("p", { class: "text-sm mt-1", texto: tx("fueraTexto") }),
        el("ul", { class: "mt-2 space-y-1 text-sm" }, fueraPorIncomparecencia.map((j) => el("li", { class: "flex flex-wrap items-center gap-2" },
          el("span", { class: "font-semibold", texto: j.nombre + (j.institucion ? " (" + j.institucion + ")" : "") }),
          el("button", { type: "button", class: C.mini, "data-devolver": j.id, "aria-label": tx("volverA", { n: j.nombre }), onclick: () => {
            devolverAlTorneo(j);
            pintarRondas();
            const sig = document.querySelector("#pi-fuera-incomparecencia [data-devolver]") || $("pi-emparejar");
            if (sig) sig.focus();
          } }, tx("volver")))))));
    }
    // Lo que el árbitro marca antes de emparejar (byes pedidos, «no viene»)
    // se guarda con el torneo: si se cierra la página antes de emparejar, no
    // se pierde. Lo que sale de la acreditación no: se recalcula cada vez
    // (marcarlo presente después tiene que sacarlo de «no viene»).
    if (!v.pedidas || v.pedidas.r !== r) v.pedidas = { r, ausencias: {} };
    const elegidas = v.pedidas.ausencias;
    const pedidas = Object.assign({}, elegidas);
    // El Keizer se explica y sigue como el suizo: abajo va la lista para
    // marcar quién no viene, que en un Keizer es lo de todas las noches.
    if (v.sistema === "keizer") caja.append(el("p", { class: C.nota + " mb-3", texto: tx("keizerAyuda") }));
    if (v.sistema === "eliminacion") {
      caja.append(el("p", { class: C.nota + " mb-3", texto: tx(v.dobleEliminacion ? "elimDobleAyuda" : "elimAyuda") }));
      if (v.tercerPuesto && !v.dobleEliminacion) caja.append(el("p", { class: C.nota + " mb-3", texto: tx("tercerAyuda") }));
    } else if (v.sistema === "scheveningen") {
      caja.append(el("p", { class: C.nota + " mb-3", texto: tx("schevAyuda") }));
      if (r === 0) caja.append(Pagina.equiposSchevVista(v));
    } else if (v.sistema === "todos") {
      caja.append(el("p", { class: C.nota + " mb-3", texto: tx("todosAyuda") }));
      if (r === 0) {
        const lista = el("ol", { class: "list-decimal pl-6 mb-3 text-sm" });
        for (const id of T.ordenInicial(v)) lista.append(el("li", { texto: nombreDe(id) }));
        caja.append(el("h3", { class: "font-semibold", texto: tx("numerosSorteo") }), lista,
          el("div", { class: "flex flex-wrap gap-2 mb-4" },
            el("button", { type: "button", class: C.botonSec, onclick: () => { T.sortearNumeracion(v); Pagina.anotarSorteo(v, "numeros"); guardar(); pintarRondas(); Avisos.avisar(tx("sorteados")); } }, tx("sortear")),
            el("button", { type: "button", id: "pi-sortear-proyector", class: C.botonSec, onclick: () => Pagina.abrirSorteo("numeros") }, tx("sorteoProyector"))));
      }
    } else {
      caja.append(el("p", { class: C.nota + " mb-3", texto: tx(v.sistema === "keizer" ? "byesAyudaKeizer" : "byesAyuda") }));
      // El color del n.º 1 en la ronda 1, sorteado a la vista de todos.
      if (r === 0) caja.append(el("div", { class: "flex flex-wrap items-center gap-2 mb-3" },
        el("span", { class: "text-sm", texto: tx("sorteoColorActual", { c: (v.colorInicial === "b" ? tx("negras") : tx("blancas")).toLowerCase() }) }),
        el("button", { type: "button", id: "pi-sortear-color", class: C.mini, onclick: () => Pagina.abrirSorteo("color") }, tx("sorteoColorBoton"))));
      const ul = el("ul", { class: "grid sm:grid-cols-2 gap-x-6 gap-y-1 mb-4" });
      const num = T.numeros(v);
      for (const id of T.ordenInicial(v)) {
        const j = jugador(id);
        if (j.retiradoDespuesDe != null && r >= j.retiradoDespuesDe) {
          ul.append(el("li", { class: "text-sm text-brand-600 dark:text-brand-300", texto: num.get(id) + ". " + j.nombre + " — " + tx("retirado") }));
          continue;
        }
        const s = el("select", { class: C.campoChico, "aria-label": tx("juegaRonda", { n: j.nombre, r: r + 1 }) },
          el("option", { value: "", texto: tx("juega") }),
          el("option", { value: "H", texto: Pagina.rotuloAusencia(v, "H") }),
          el("option", { value: "Z", texto: Pagina.rotuloAusencia(v, "Z") }),
          el("option", { value: "F", texto: Pagina.rotuloAusencia(v, "F") }));
        const noViene = el("button", { type: "button", class: C.mini });
        const actualizarNoViene = () => {
          const marcado = s.value === "Z";
          noViene.textContent = tx(marcado ? "deshacerNoViene" : "noViene");
          noViene.setAttribute("aria-label", tx(marcado ? "deshacerNoVieneA" : "noVieneA", { n: j.nombre }));
        };
        s.addEventListener("change", async () => {
          if (!(await Pagina.confirmarByeEntero(s, pedidas[id] || ""))) return;
          if (s.value) { pedidas[id] = s.value; elegidas[id] = s.value; } else { delete pedidas[id]; delete elegidas[id]; }
          actualizarNoViene();
          guardar();
        });
        if (pedidas[id]) s.value = pedidas[id];
        // Quien no llegó al pasar lista queda de entrada como «no viene».
        if (ausentes.includes(id)) { s.value = "Z"; pedidas[id] = "Z"; }
        noViene.addEventListener("click", () => { s.value = s.value === "Z" ? "" : "Z"; s.dispatchEvent(new Event("change")); });
        actualizarNoViene();
        ul.append(el("li", { class: "flex items-center justify-between gap-2" }, el("span", { class: "text-sm", texto: num.get(id) + ". " + j.nombre }), el("div", { class: "flex items-center gap-1" }, s, noViene)));
      }
      caja.append(ul);
    }
    if (r === 0 && !v.publicado) caja.append(el("p", { id: "pi-publico-ronda1", class: C.nota + " mb-3", texto: tx("publicarSoloRonda1") }));
    const boton = el("button", { type: "button", id: "pi-emparejar", class: C.boton }, tx("emparejarRonda", { r: r + 1 }));
    const msg = el("p", { class: "mt-3 text-sm", role: "status", "aria-live": "polite" });
    function actualizarRevision() {
      const f = faltanRevisar();
      boton.disabled = f > 0;
      revisarEstado.textContent = f ? tx(f === 1 ? "revisarFaltaUno" : "revisarFaltan", { n: f }) : tx("revisarListo");
    }
    actualizarRevision();
    boton.addEventListener("click", async () => {
      if (faltanRevisar()) { Avisos.avisar(revisarEstado.textContent, { tipo: "error" }); return; }
      // El repaso de lo que conviene mirar antes de seguir: no bloquea, se
      // emparejan igual si el árbitro lo dice.
      const dudas = dudasAntesDeEmparejar(v, r);
      if (dudas.length) {
        const seguir = await Avisos.confirmar(tx("dudasTexto", { r: r + 1 }) + "\n\n• " + dudas.join("\n• "), { aceptar: tx("dudasEmparejar"), cancelar: tx("dudasRevisar") });
        if (!seguir || t() !== v || v.rondas.length !== r) return;
      }
      if (r === 0 && ausentes.length) {
        const nombres = ausentes.map(nombreDe);
        if (T.fijo(v)) {
          // En todos contra todos no hay «no viene» por ronda: o se sacan
          // del torneo antes de sortear, o juegan todos.
          const sacar = await Avisos.confirmar(tx("listaSacar", { n: ausentes.length, l: nombres.join(", ") }), { aceptar: tx("listaSacarSi"), cancelar: tx("listaConTodos") });
          if (t() !== v || v.rondas.length) return;
          if (sacar) {
            v.jugadores = v.jugadores.filter((j) => !ausentes.includes(j.id));
            v.noSePresentaron = (v.noSePresentaron || []).concat(nombres);
            guardar();
          }
        } else v.noSePresentaron = nombres.filter((n, k) => pedidas[ausentes[k]] === "Z");
      }
      boton.disabled = true;
      msg.textContent = tx("emparejando");
      // Con muchos jugadores el Sistema Holandés tarda (crece con el cubo de
      // cuántos son: 800 son unos 20 segundos): se dice y se cuenta.
      const juegan = T.fijo(v) ? v.jugadores.length : T.participantes(v, r, pedidas).length;
      const desde = Date.now();
      // (El aviso se lee una vez; la cuenta de segundos va aparte, fuera de
      // la región que lee el lector de pantalla, para no repetirlo cada segundo.)
      const lleva = el("span", { id: "pi-emparejar-lleva", class: "block" });
      if (juegan >= 250) { msg.textContent = tx("emparejandoMucho", { n: juegan, s: Math.max(5, Math.round(20 * Math.pow(juegan / 800, 3))) }); msg.after(lleva); }
      const cuenta = juegan >= 250 ? setInterval(() => { lleva.textContent = tx("emparejandoLleva", { l: Math.round((Date.now() - desde) / 1000) }); }, 1000) : null;
      try {
        await emparejar(r, pedidas);
        // Quienes quedaron fuera por no estar acreditados (van así al informe).
        const R0 = v.rondas[r];
        const sinAcreditar = R0 && R0.ausencias ? ausentes.filter((id) => R0.ausencias[id] === "Z") : [];
        if (sinAcreditar.length) { R0.sinAcreditar = sinAcreditar; guardar(); }
        estado.ronda = r;
        pintarRondas();
        Avisos.avisar(tx("rondaLista", { r: r + 1 }));
        const primero = document.querySelector("#pi-ronda select");
        if (primero) primero.focus();
      } catch (e) {
        msg.textContent = "";
        Avisos.avisar(e.codigo === 1 ? tx("sinPareoPosible") : tx("errorMotor", { e: e.message }), { tipo: "error" });
      } finally {
        if (cuenta) clearInterval(cuenta);
        lleva.remove();
        boton.disabled = faltanRevisar() > 0;
      }
    });
    caja.append(boton, msg);
  }

  // Pasar lista antes de la ronda 1: quién llegó. Se prende con la casilla;
  // apagada, no cambia nada.
  const noLlegaron = (v) => (v.pasarLista ? v.jugadores.filter((j) => !(v.asistencia || {})[j.id] && j.retiradoDespuesDe == null).map((j) => j.id) : []);
  // La acreditación (pasar lista): en la ficha Jugadores y antes de
  // emparejar cada ronda. Quien no está marcado presente no se empareja en
  // ninguna ronda (en un suizo, queda como «no viene») hasta que el árbitro
  // lo marque. `repintar`: la ficha donde está.
  function pintarPasarLista(caja, repintar, pre) {
    pre = pre || "pi";
    const v = t();
    const det = el("details", { id: pre + "-asistencia", class: "mb-4 rounded-xl border border-brand-200 dark:border-brand-700 p-3", open: !!v.pasarLista });
    det.append(el("summary", { class: "cursor-pointer font-semibold rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", texto: tx("listaTitulo") }),
      el("p", { class: C.nota + " mt-1", texto: tx("listaTexto") }),
      el("label", { class: "flex items-start gap-2 text-sm mt-2" },
        el("input", { type: "checkbox", id: pre + "-asistencia-activar", class: "mt-1", checked: !!v.pasarLista, onchange: (e) => {
          v.pasarLista = e.target.checked;
          if (v.pasarLista && !v.asistencia) v.asistencia = {};
          guardar(); repintar();
          const x = $(pre + "-asistencia-activar"); if (x) x.focus();
        } }),
        el("span", { class: "font-semibold", texto: tx("listaActivar") })));
    if (v.pasarLista) {
      const orden = T.ordenInicial(v);
      det.append(el("p", { id: pre + "-asistencia-cuenta", class: "text-sm mt-2", role: "status", texto: tx("listaCuenta", { n: orden.filter((id) => v.asistencia[id]).length, t: orden.length }) }),
        el("button", { type: "button", id: pre + "-asistencia-todos", class: C.mini + " mt-1", onclick: () => { for (const id of orden) v.asistencia[id] = true; guardar(); repintar(); } }, tx("listaTodos")));
      const ul = el("ul", { class: "mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm" });
      for (const id of orden) {
        const cid = pre + "-llego-" + id;
        ul.append(el("li", { class: "flex items-start gap-2" },
          el("input", { type: "checkbox", id: cid, class: "mt-1", checked: !!v.asistencia[id], onchange: (e) => {
            if (e.target.checked) v.asistencia[id] = true; else delete v.asistencia[id];
            guardar(); repintar();
            const x = $(cid); if (x) x.focus();
          } }),
          el("label", { for: cid, texto: nombreDe(id) })));
      }
      det.append(ul);
    }
    caja.append(det);
  }

  // Lo que conviene revisar antes de emparejar la ronda r+1: las sorpresas
  // de Elo y lo que un adjunto anotó distinto en la ronda anterior que nadie
  // miró (pintarConfirmar), y un nombre que está dos veces en la lista (un
  // jugador inscrito dos veces juega contra todos por partida doble).
  const claveNombre = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  function dudasAntesDeEmparejar(v, r) {
    const out = [];
    const R = r > 0 ? v.rondas[r - 1] : null;
    if (R) {
      const vistas = new Set(R.confirmadas || []);
      for (const x of V.sorpresas(v, r - 1)) if (!vistas.has(x.mesa + "|" + x.r)) out.push(tx("sorpresaTexto", { m: V.mesaFisica(v, x.mesa), g: x.gana, p: x.pierde, d: x.dif }));
      for (const x of R.discrepancias || []) if (!x.resuelta) out.push(tx(x.tablero ? "discrepanciaTablero" : "discrepanciaTexto", { m: x.mesa, t: x.tablero, r: tx("corto_" + x.r), y: tx("corto_" + x.ya) }));
    }
    const vistos = new Map();
    for (const j of v.jugadores) {
      if (j.retiradoDespuesDe != null && r >= j.retiradoDespuesDe) continue;
      const k = claveNombre(j.nombre);
      if (!k) continue;
      vistos.set(k, (vistos.get(k) || []).concat(j.nombre));
    }
    for (const nombres of vistos.values()) if (nombres.length > 1) out.push(tx("dudaRepetido", { n: nombres[0], k: nombres.length }));
    return out;
  }

  async function emparejar(r, pedidas) {
    const v = t();
    if (v.rondas.length !== r) throw new Error(tx("yaEmparejada"));
    if (r === 0 && !Array.isArray(v.numeracion)) T.fijarNumeracion(v);
    if (r === 0) E.fijarOrden(v);
    let ronda;
    if (v.sistema === "eliminacion" && E.esDeEquipos(v)) throw new Error(tx("elimSoloIndividual"));
    if (v.sistema === "scheveningen") {
      if (E.esDeEquipos(v)) throw new Error(tx("schevSoloIndividual"));
      const eq = T.equiposScheveningen(v);
      if (eq.error) throw new Error(Pagina.textoErrorSchev(eq));
    }
    if (T.fijo(v)) {
      if (v.jugadores.length < 2) throw new Error(tx("pocosJugadores"));
      ronda = T.rondaFija(v, r);
      // En todos contra todos el calendario es fijo: el retirado no se saca
      // de la ronda, pierde su partida sin jugarla (y si faltan los dos, «--»).
      const fuera = (id) => { const j = v.jugadores.find((x) => x.id === id); return !!j && j.retiradoDespuesDe != null && r >= j.retiradoDespuesDe; };
      if (!E.esDeEquipos(v)) for (const m of ronda.mesas) {
        if (m.n == null) continue;
        const fb = fuera(m.b), fn = fuera(m.n);
        if (fb || fn) m.r = fb && fn ? "--" : fb ? "-+" : "+-";
      }
    } else if (v.sistema === "keizer") {
      // El Keizer no pasa por el motor del Holandés: se empareja de arriba
      // abajo por sus puntos (T.emparejarKeizer).
      if (E.esDeEquipos(v)) throw new Error(tx("keizerSoloIndividual"));
      if (T.participantes(v, r, pedidas).length < 2) throw new Error(tx("pocosJugadores"));
      ronda = { mesas: T.emparejarKeizer(v, r, pedidas), ausencias: Object.assign({}, pedidas) };
    } else {
      const juegan = T.participantes(v, r, pedidas);
      if (juegan.length < 2) throw new Error(tx("pocosJugadores"));
      const trf = T.aTrf(v, { hasta: r, proxima: { ausencias: pedidas } });
      const mesas = T.leerPareo(v, await motor.emparejar(trf));
      ronda = { mesas, ausencias: Object.assign({}, pedidas) };
    }
    if (t() !== v || v.rondas.length !== r) throw new Error(tx("yaEmparejada"));
    // En un torneo por equipos, cada encuentro trae su alineación (los cuatro
    // primeros del orden de tableros) y un resultado por tablero.
    // Un equipo que ya de entrada no llega a dos (art. 66.2.f) pierde el
    // encuentro al emparejar: el resultado queda puesto, no «falta».
    if (E.esDeEquipos(v)) for (const m of ronda.mesas) {
      if (m.n === null) continue;
      E.prepararMesa(v, m);
      if (E.puntosDelEncuentro(v, m).incomparecencia) m.r = E.resultadoEncuentro(v, m);
    }
    // Quien tiene mesa fija (una silla de ruedas…) queda en su mesa.
    const movidas = V.aplicarMesasFijas(v, ronda);
    v.rondas.push(ronda);
    delete v.pedidas;
    guardar();
    if (movidas.length) Avisos.avisar(tx("mesasFijasAplicadas", { l: movidas.map((x) => x.nombre + " → " + tx("mesa") + " " + x.mesa).join(", ") }), { tipo: "info" });
  }

  async function deshacerRonda(r) {
    const v = t();
    const conResultados = v.rondas[r].mesas.some((m) => m.n && m.r);
    const ok = await Avisos.confirmar(tx(conResultados ? "confirmarDeshacerConResultados" : "confirmarDeshacer", { r: r + 1 }),
      { aceptar: tx("deshacerRonda"), peligro: true });
    if (!ok || v.rondas.length !== r + 1) return;
    const deshecha = v.rondas.pop();
    // Lo que el árbitro había marcado antes de emparejar esta ronda (byes
    // pedidos, «no viene») vuelve a quedar marcado: deshacer para agregar a
    // alguien no le borra a quién ya había anotado como ausente. Lo de la
    // acreditación no se guarda aquí (se recalcula con la lista), así quien
    // se marque presente después sale solo de «no viene».
    const sinAcreditar = new Set(deshecha.sinAcreditar || []);
    const marcadas = Object.fromEntries(Object.entries(deshecha.ausencias || {}).filter(([id]) => !sinAcreditar.has(id)));
    v.pedidas = { r, ausencias: marcadas };
    if (r === 0 && v.sistema !== "todos" && !v.numeracionDeArchivo) v.numeracion = null;
    // Sin la ronda 1, el orden de tableros se vuelve a poder cambiar.
    if (r === 0) delete v.ordenTableros;
    guardar();
    estado.ronda = r;
    pintarRondas();
  }

  Object.assign(Pagina, { pintarRondas, RESULTADOS, pintarRondasNav, pintarPasarLista });
})();

/*! rev bfb5bbb0d2d82f9f */
