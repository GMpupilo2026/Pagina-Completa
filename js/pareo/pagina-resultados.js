/* ===== Pareo Integral — la página (pareo.html): los resultados de la ronda =====
 *
 * Las marcas de las incidencias, los resultados para confirmar, el reloj del retraso, la
 * incomparecencia y las correcciones con motivo, las incidencias y las sanciones, las mesas de un
 * torneo individual, la eliminación directa, quiénes no juegan y modificar la ronda en juego.
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
  const { T, E, V, C, $, el, tx, estado, normalizarBusqueda, guardar, t, nombreDe, puntosTexto, datosJugador,
    agregarJugadores, pintarRondas, RESULTADOS, horaCR, pintarRondasNav } = Pagina;

  // ---------- Las marcas de las incidencias junto a cada nombre ----------
  // «i» por jugada ilegal y «!» por cada otra irregularidad de esta ronda
  // (V.marcasIncidencias). La marca es un botón chico: al tocarlo se abre,
  // debajo de la mesa, de qué fue cada una; así no estorba a la vista.
  function textoIncidencia(x) {
    return horaCR(x.hora) + " · " + tx(TEXTO_INCIDENCIA[x.tipo] || TEXTO_INCIDENCIA.otra) + (x.articulo ? " (" + V.articuloTexto(x.articulo) + ")" : "") +
      (x.autor ? " · " + x.autor : "") + ": " + x.texto;
  }
  // Devuelve [la marca, su detalle] (o [null, null] si no tiene nada).
  function marcaDe(marcas, id, nombre, alAbrir) {
    const m = marcas.get(id);
    if (!m) return [null, null];
    const idDet = "pi-inc-det-" + id + "-" + Math.random().toString(36).slice(2, 7);
    const det = el("div", { id: idDet, class: "pi-inc-detalle text-sm", hidden: true },
      el("p", { class: "font-semibold", texto: nombre + (m.ilegales >= 2 ? " · " + tx("marcaPierde") : m.ilegales === 1 ? " · " + tx("marcaUnaIlegal") : "") }),
      el("ul", { class: "list-disc pl-5" }, m.items.map((x) => el("li", { texto: textoIncidencia(x) }))));
    const b = el("button", { type: "button", class: "pi-marca-inc", "data-marca": V.textoMarca(m), "aria-expanded": "false", "aria-controls": idDet,
      title: tx("marcaVer", { n: nombre, i: m.ilegales, x: m.irregularidades }), "aria-label": tx("marcaVer", { n: nombre, i: m.ilegales, x: m.irregularidades }) }, V.textoMarca(m));
    b.addEventListener("click", () => {
      det.hidden = !det.hidden;
      b.setAttribute("aria-expanded", det.hidden ? "false" : "true");
      if (alAbrir) alAbrir();
    });
    return [b, det];
  }

  // ---------- Los resultados para confirmar ----------
  // Las sorpresas de Elo (V.sorpresas) y lo que un adjunto anotó distinto.
  // No bloquea nada: cada uno se confirma con un botón, o se cambia.
  // También en el Centro del evento (`idBase` distinto, para no repetir ids
  // con la ficha Rondas): cada botón vuelve a pintar la ficha abierta.
  function pintarConfirmar(caja, r, idBase) {
    const base = idBase || "pi-confirmar";
    const repintar = () => (estado.ficha === "centro" ? Pagina.pintarCentro() : pintarRondas());
    const v = t();
    const R = v.rondas[r];
    const vistas = new Set(R.confirmadas || []);
    const sorpresas = V.sorpresas(v, r).filter((x) => !vistas.has(x.mesa + "|" + x.r));
    const discrepancias = (R.discrepancias || []).map((x, k) => Object.assign({ k }, x)).filter((x) => !x.resuelta);
    const deCamaras = (R.deCamaras || []).map((x, k) => Object.assign({ k }, x)).filter((x) => !x.resuelta);
    if (!sorpresas.length && !discrepancias.length && !deCamaras.length) return;
    const lista = el("ul", { class: "mt-2 space-y-2 text-sm" });
    for (const x of sorpresas) {
      const bien = el("button", { type: "button", class: C.mini, "data-confirmar": String(x.mesa) }, tx("confirmarBien"));
      bien.addEventListener("click", () => { R.confirmadas = (R.confirmadas || []).concat(x.mesa + "|" + x.r); guardar(); repintar(); });
      lista.append(el("li", { class: "flex flex-wrap items-center gap-2" },
        el("span", {}, el("span", { class: "font-semibold", texto: tx("cortosAviso") + " " }),
          tx("sorpresaTexto", { m: x.mesa + 1, g: x.gana, p: x.pierde, d: x.dif })), bien));
    }
    for (const x of discrepancias) {
      const dejar = el("button", { type: "button", class: C.mini, "data-discrepancia": String(x.k) }, tx("discrepanciaDejar", { r: tx("corto_" + x.ya) }));
      dejar.addEventListener("click", () => { R.discrepancias[x.k].resuelta = "dejar"; guardar(); repintar(); });
      const poner = el("button", { type: "button", class: C.mini, "data-poner": String(x.k) }, tx("discrepanciaPoner", { r: tx("corto_" + x.r) }));
      poner.addEventListener("click", () => {
        const m = R.mesas[x.mesa - 1];
        if (x.tablero) { E.prepararMesa(v, m); m.partidas[x.tablero - 1].r = x.r; m.r = E.resultadoEncuentro(v, m); }
        else m.r = x.r;
        R.discrepancias[x.k].resuelta = "poner";
        guardar(); repintar();
      });
      lista.append(el("li", { class: "flex flex-wrap items-center gap-2" },
        el("span", {}, el("span", { class: "font-semibold", texto: tx("cortosAviso") + " " }),
          tx(x.tablero ? "discrepanciaTablero" : "discrepanciaTexto", { m: x.mesa, t: x.tablero, r: tx("corto_" + x.r), y: tx("corto_" + x.ya) })),
        dejar, r === v.rondas.length - 1 ? poner : null));
    }
    for (const x of deCamaras) {
      const m = R.mesas[x.mesa - 1];
      // En un encuentro por equipos, el resultado es del tablero; el del encuentro sale de los tableros.
      const ahora = () => (x.tablero ? (E.prepararMesa(v, m).partidas[x.tablero - 1] || {}).r : m.r);
      const ya = m ? ahora() : null;
      const anotar = el("button", { type: "button", class: C.mini, "data-camara-anotar": String(x.k) }, tx("camaraAnotar", { r: tx("corto_" + x.r) }));
      anotar.addEventListener("click", async () => {
        const antes = ahora();
        if (antes && antes !== x.r) {
          if (!(await confirmarCambio(r, x.mesa - 1, antes, x.r, x.tablero))) return;
          anotarCorreccion(R, x.mesa - 1, antes, x.r, tx("correccionCamara"), x.tablero);
        }
        if (x.tablero) { m.partidas[x.tablero - 1].r = x.r; m.r = E.resultadoEncuentro(v, m); }
        else m.r = x.r;
        R.deCamaras[x.k].resuelta = "anotado";
        guardar(); repintar();
      });
      const descartar = el("button", { type: "button", class: C.mini, "data-camara-descartar": String(x.k) }, tx("camaraDescartar"));
      descartar.addEventListener("click", () => { R.deCamaras[x.k].resuelta = "descartado"; guardar(); repintar(); });
      lista.append(el("li", { class: "flex flex-wrap items-center gap-2" },
        el("span", {}, el("span", { class: "font-semibold", texto: tx("cortosAviso") + " " }),
          tx(ya && ya !== x.r ? "camaraDistinto" : "camaraConfirmar", { m: Pagina.verLugar(Pagina.claveCamara(V.mesaFisica(v, x.mesa - 1), x.tablero)), r: tx("corto_" + x.r), y: ya ? tx("corto_" + ya) : "" })),
        r === v.rondas.length - 1 ? anotar : null, descartar,
        Pagina.fotoDe(Pagina.claveCamara(V.mesaFisica(v, x.mesa - 1), x.tablero), x.hora) ? Pagina.botonFoto(Pagina.fotoDe(Pagina.claveCamara(V.mesaFisica(v, x.mesa - 1), x.tablero), x.hora)) : null));
    }
    caja.append(el("section", { id: base, class: "no-imprimir mb-4 rounded-xl border-2 border-accent-500 p-3", "aria-labelledby": base + "-titulo" },
      el("h3", { id: base + "-titulo", class: "font-semibold", texto: tx("confirmarTitulo") }),
      el("p", { class: C.nota, texto: tx("confirmarTexto", { d: V.DIFERENCIA_SORPRESA }) }), lista));
  }

  // ---------- El reloj del retraso ----------
  // Quien no está sentado al empezar la ronda se marca, y la página cuenta
  // los minutos: en ajedrez pierde cuando su reloj cae a cero (art. 30), es
  // decir, al pasar el tiempo base del ritmo (V.minutosBase). Se vuelve a
  // pintar cada 20 segundos mientras la ronda esté en pantalla.
  let relojIntervalo = null;
  function pintarReloj(caja, r) {
    const v = t();
    const R = v.rondas[r];
    if (relojIntervalo) { clearInterval(relojIntervalo); relojIntervalo = null; }
    const base = V.minutosBase(v.ritmo);
    const sec = el("section", { id: "pi-reloj", class: "no-imprimir mb-4 rounded-xl border border-brand-200 dark:border-brand-700 p-3", "aria-labelledby": "pi-reloj-titulo" },
      el("h3", { id: "pi-reloj-titulo", class: "font-semibold", texto: tx("relojTitulo") }));
    caja.append(sec);
    if (!R.inicio) {
      sec.append(el("p", { class: C.nota, texto: base ? tx("relojTexto", { m: base }) : tx("relojSinRitmo") }),
        el("button", { type: "button", id: "pi-reloj-empezar", class: C.botonSec + " mt-2", onclick: () => {
          R.inicio = Date.now(); guardar(); pintarRondas(); const x = $("pi-reloj-quien"); if (x) x.focus();
        } }, tx("relojEmpezar")));
      return;
    }
    R.tarde = R.tarde || {};
    sec.append(el("p", { class: "text-sm", texto: tx("relojEmpezo", { h: horaCR(R.inicio) }) + " " + (base ? tx("relojTexto", { m: base }) : tx("relojSinRitmo")) }));
    const enMesa = [];
    R.mesas.forEach((m, i) => { if (m.n !== null) enMesa.push([m.b, i], [m.n, i]); });
    const sel = el("select", { id: "pi-reloj-quien", class: C.campoChico, "aria-label": tx("relojQuien") },
      el("option", { value: "", texto: tx("relojElegir") }),
      enMesa.filter(([id]) => !R.tarde[id]).map(([id, i]) => el("option", { value: id, texto: tx("mesa") + " " + V.mesaFisica(t(), i) + ": " + nombreDe(id) })));
    const agregar = el("button", { type: "button", id: "pi-reloj-agregar", class: C.mini }, tx("relojNoLlego"));
    agregar.addEventListener("click", () => {
      if (!sel.value) return;
      R.tarde[sel.value] = { llego: null };
      guardar(); pintarRondas();
      const x = $("pi-reloj-quien"); if (x) x.focus();
    });
    sec.append(el("div", { class: "flex flex-wrap items-center gap-2 mt-2" }, sel, agregar));
    const ul = el("ul", { id: "pi-reloj-lista", class: "mt-2 space-y-2 text-sm" });
    // La ronda atrasada: pasó lo que dura con este ritmo y hay mesas jugando.
    const dura = V.duracionRonda(v.ritmo);
    const atrasada = el("p", { id: "pi-reloj-atrasada", class: "text-sm font-semibold mt-2", role: "status" });
    const pintarLista = () => {
      const lleva = Math.floor((Date.now() - R.inicio) / 60000);
      const jugando = R.mesas.map((m, i) => (m.n !== null && !m.r ? V.mesaFisica(v, i) : 0)).filter(Boolean);
      atrasada.textContent = dura && lleva > dura && jugando.length ? tx("cortosAviso") + " " + tx("relojAtrasada", { l: lleva, d: dura, m: jugando.join(", ") }) : "";
      atrasada.hidden = !atrasada.textContent;
      ul.replaceChildren();
      for (const [id, x] of Object.entries(R.tarde)) {
        const e = V.estadoRetraso(R, id, Date.now(), base);
        const i = R.mesas.findIndex((m) => m.b === id || m.n === id);
        const m = R.mesas[i];
        const li = el("li", { class: "flex flex-wrap items-center gap-2", "data-reloj": id },
          el("span", { class: "font-semibold", texto: nombreDe(id) }),
          el("span", { texto: e.llego ? tx("relojLlegoTarde", { m: e.minutos }) : e.vencido ? tx("relojVencido", { m: e.minutos }) : base ? tx("relojLleva", { m: e.minutos, b: base }) : tx("relojLlevaSinBase", { m: e.minutos }) }));
        if (!e.llego) li.append(el("button", { type: "button", class: C.mini, "aria-label": tx("relojLlegoA", { n: nombreDe(id) }), onclick: () => { x.llego = Date.now(); guardar(); pintarRondas(); } }, tx("relojLlego")));
        if (e.vencido && m && !m.r) li.append(el("button", { type: "button", class: C.miniPeligro, onclick: () => anotarIncomparecencia(r, i, id) }, tx("relojAnotar")));
        li.append(el("button", { type: "button", class: C.mini, "aria-label": tx("relojQuitarA", { n: nombreDe(id) }), onclick: () => { delete R.tarde[id]; guardar(); pintarRondas(); } }, tx("quitar")));
        ul.append(li);
      }
    };
    pintarLista();
    sec.append(atrasada, ul);
    if (Object.keys(R.tarde).length || R.mesas.some((m) => m.n !== null && !m.r)) {
      relojIntervalo = setInterval(() => {
        if (!document.body.contains(ul)) { clearInterval(relojIntervalo); relojIntervalo = null; return; }
        pintarLista();
      }, 20000);
    }
  }

  // Su reloj cayó: pierde por incomparecencia. En equipos, el equipo entero
  // (sin nadie presente pierde el encuentro). Queda anotado en las incidencias.
  function anotarIncomparecencia(r, i, id) {
    const v = t();
    const R = v.rondas[r];
    const m = R.mesas[i];
    if (E.esDeEquipos(v)) { E.prepararMesa(v, m); m.alineacion[Object.keys(m.alineacion).find((k) => m[k] === id)] = []; m.r = E.resultadoEncuentro(v, m); }
    else m.r = m.b === id ? "-+" : "+-";
    R.incidencias = (R.incidencias || []).concat({ hora: Date.now(), mesa: i + 1, tipo: "decision", texto: tx("relojIncidencia", { n: nombreDe(id) }) });
    guardar();
    pintarRondas();
    Avisos.avisar(tx("relojAnotado", { n: nombreDe(id) }));
  }

  // ¿Cambiar un resultado que ya estaba anotado? (la ronda en juego).
  function confirmarCambio(r, i, antes, despues, tablero) {
    const corto = (x) => (x ? tx("corto_" + x) : tx("resSin"));
    return Avisos.confirmar(tx("cambiarResultadoConfirma", { m: V.mesaFisica(t(), i), a: corto(antes), d: corto(despues) }) + (tablero ? " (" + tx("tableroN", { t: tablero }) + ")" : ""),
      { aceptar: tx("cambiarResultadoSi"), cancelar: tx("cambiarResultadoNo") });
  }

  // El motivo de una corrección (null si se cancela).
  async function pedirMotivo(r, i, antes, despues, tablero) {
    const corto = (x) => (x ? tx("corto_" + x) : tx("resSin"));
    const res = await Avisos.formulario({
      titulo: tx("correccionTitulo", { r: r + 1, m: V.mesaFisica(t(), i) }) + (tablero ? " · " + tx("tableroN", { t: tablero }) : ""),
      texto: tx("correccionTexto", { a: corto(antes), d: corto(despues) }),
      aceptar: tx("correccionSi"), cancelar: tx("cancelar"),
      campos: [{ nombre: "motivo", etiqueta: tx("correccionMotivo"), max: 300 }],
    });
    const motivo = res && String(res.motivo || "").trim();
    if (res && !motivo) Avisos.avisar(tx("correccionFalta"), { tipo: "error" });
    return motivo || null;
  }
  function anotarCorreccion(R, i, antes, despues, motivo, tablero) {
    const corto = (x) => (x ? tx("corto_" + x) : tx("resSin"));
    R.incidencias = (R.incidencias || []).concat({ hora: Date.now(), mesa: i + 1, tipo: "correccion",
      texto: (tablero ? tx("tableroN", { t: tablero }) + ": " : "") + tx("correccionIncidencia", { a: corto(antes), d: corto(despues), m: motivo }) });
  }

  // ---------- Las incidencias de la ronda ----------
  // Reclamos, sanciones y decisiones del árbitro, con su hora y su mesa: van
  // al informe oficial (V.incidenciasDe).
  const TEXTO_INCIDENCIA = { reclamo: "incReclamo", sancion: "incSancion", decision: "incDecision", apelacion: "incApelacion", correccion: "incCorreccion", adjunto: "incAdjunto", otra: "incOtra" };
  function pintarIncidencias(caja, r) {
    const R = t().rondas[r];
    const sec = el("section", { id: "pi-incidencias", class: "no-imprimir mt-6", "aria-labelledby": "pi-inc-titulo" },
      el("h3", { id: "pi-inc-titulo", class: "font-semibold", texto: tx("incTitulo") }),
      el("p", { class: C.nota, texto: tx("incTexto") }));
    const lista = el("ul", { id: "pi-inc-lista", class: "mt-2 space-y-1 text-sm" });
    (R.incidencias || []).forEach((x, k) => lista.append(el("li", { class: "flex flex-wrap items-start gap-2" },
      el("span", { texto: horaCR(x.hora) + (x.mesa ? " · " + tx("mesa") + " " + V.mesaFisica(t(), x.mesa - 1) : "") + " · " + tx(TEXTO_INCIDENCIA[x.tipo] || TEXTO_INCIDENCIA.otra) +
        (x.articulo ? " (" + V.articuloTexto(x.articulo) + ")" : "") + (x.autor ? " · " + x.autor : "") + (x.jugador ? " · " + tx("incA", { n: Pagina.nombreDeQuien(x.jugador) }) : "") + ": " + x.texto +
        (x.presenta ? " " + tx("apelacionPresenta", { p: x.presenta }) : "") + (x.tipo === "apelacion" ? " " + tx("apelacionResolucion", { r: x.resolucion || tx("apelacionPendiente") }) : "") }),
      x.foto && Pagina.FOTO_VALIDA.test(x.foto) ? el("button", { type: "button", class: C.mini, "data-foto-inc": String(k),
        onclick: () => Pagina.verFoto({ h: x.hora, motivo: null, img: x.foto, mesa: x.mesa ? V.mesaFisica(t(), x.mesa - 1) : null, tablero: null }) },
        el("span", { "aria-hidden": "true", texto: "📷 " }), tx("fotoVer")) : null,
      x.tipo === "apelacion" ? el("button", { type: "button", class: C.mini, onclick: () => resolverApelacion(R, k) }, tx(x.resolucion ? "apelacionCambiar" : "apelacionResolver")) : null,
      x.tipo === "sancion" && x.mesa && !E.esDeEquipos(t()) && R.mesas[x.mesa - 1] && R.mesas[x.mesa - 1].n
        ? el("button", { type: "button", class: C.mini, "data-sancion": k, onclick: () => aplicarSancion(R, k) }, tx(x.aplicada ? "sancionCambiar" : "sancionAplicar")) : null,
      el("button", { type: "button", class: C.mini, onclick: () => { R.incidencias.splice(k, 1); guardar(); pintarRondas(); } }, tx("quitar")))));
    const mesa = el("select", { id: "pi-inc-mesa", class: C.campoChico, "aria-label": tx("mesa") },
      el("option", { value: "", texto: tx("incSinMesa") }), R.mesas.map((m, i) => el("option", { value: String(i + 1), texto: tx("mesa") + " " + V.mesaFisica(t(), i) })));
    const tipo = el("select", { id: "pi-inc-tipo", class: C.campoChico, "aria-label": tx("incTipo") },
      Object.entries(TEXTO_INCIDENCIA).filter(([k]) => k !== "correccion" && k !== "adjunto").map(([k, c]) => el("option", { value: k, texto: tx(c) })));
    // A quién va (de los que juegan esa mesa): con él sale su marca en el pareo.
    const quien = el("select", { id: "pi-inc-jugador", class: C.campoChico, "aria-label": tx("incJugador"), disabled: true });
    const llenarQuien = () => {
      const lista = mesa.value ? Pagina.jugadoresDeMesa(t(), R.mesas[Number(mesa.value) - 1]) : [];
      quien.replaceChildren(el("option", { value: "", texto: tx("incSinJugador") }), ...lista.map(([, id, etiqueta]) => el("option", { value: id, texto: etiqueta })));
      quien.disabled = !lista.length;
    };
    mesa.addEventListener("change", llenarQuien);
    llenarQuien();
    // El artículo de las Leyes del Ajedrez, para que el informe lo lleve.
    const articulo = el("select", { id: "pi-inc-articulo", class: C.campoChico, "aria-label": tx("incArticulo") },
      el("option", { value: "", texto: tx("incSinArticulo") }), Object.keys(V.ARTICULOS).map((k) => el("option", { value: k, texto: V.articuloTexto(k) })));
    // En una apelación, quién la presenta (la resolución del comité se
    // anota después, en la lista).
    const presenta = el("input", { id: "pi-inc-presenta", type: "text", maxlength: "80", class: C.campo + " mt-2", "aria-label": tx("apelacionQuien"), placeholder: tx("apelacionQuien") });
    const cajaPresenta = el("div", { hidden: true }, presenta);
    tipo.addEventListener("change", () => { cajaPresenta.hidden = tipo.value !== "apelacion"; });
    const texto = el("textarea", { id: "pi-inc-texto", class: C.campo + " mt-2", rows: "2", maxlength: "500", "aria-label": tx("incQue") });
    const anotar = el("button", { type: "button", id: "pi-inc-anotar", class: C.botonSec + " mt-2" }, tx("incAnotar"));
    anotar.addEventListener("click", () => {
      const q = texto.value.trim();
      if (!q) { Avisos.avisar(tx("incFalta"), { tipo: "error" }); texto.focus(); return; }
      const nueva = { hora: Date.now(), mesa: mesa.value ? Number(mesa.value) : null, tipo: tipo.value, texto: q.slice(0, 500) };
      if (articulo.value) nueva.articulo = articulo.value;
      if (quien.value) nueva.jugador = quien.value;
      if (tipo.value === "apelacion") {
        if (!presenta.value.trim()) { Avisos.avisar(tx("apelacionFaltaQuien"), { tipo: "error" }); presenta.focus(); return; }
        nueva.presenta = presenta.value.trim().slice(0, 80);
        nueva.resolucion = "";
      }
      R.incidencias = (R.incidencias || []).concat(nueva);
      guardar();
      pintarRondas();
      const x = $("pi-inc-texto"); if (x) x.focus();
      Avisos.avisar(tx("incAnotada"));
    });
    sec.append(lista, el("div", { class: "flex flex-wrap gap-2 mt-2" }, mesa, quien, tipo, articulo), cajaPresenta, texto, anotar);
    caja.append(sec);
  }

  // Una sanción que cambia el resultado de su mesa (una partida perdida por
  // el celular, por ejemplo): un clic, y la corrección queda anotada.
  async function aplicarSancion(R, k) {
    const x = R.incidencias[k];
    const m = R.mesas[x.mesa - 1];
    const r = await Avisos.formulario({ titulo: tx("sancionTitulo", { m: x.mesa }), texto: x.texto, aceptar: tx("sancionGuardar"), cancelar: tx("cancelar"),
      campos: [{ nombre: "r", etiqueta: tx("sancionResultado", { b: nombreDe(m.b), n: nombreDe(m.n) }), tipo: "select", valor: x.aplicada || "-+",
        opciones: RESULTADOS.filter(([val]) => val).map(([val, clave]) => [val, tx(clave)]) }] });
    if (!r || !Pagina.RESULTADOS_VALIDOS.has(r.r)) return;
    const antes = m.r || null;
    m.r = r.r;
    x.aplicada = r.r;
    anotarCorreccion(R, x.mesa - 1, antes, r.r, tx("sancionMotivo"));
    guardar();
    pintarRondas();
  }

  async function resolverApelacion(R, k) {
    const x = R.incidencias[k];
    const r = await Avisos.formulario({ titulo: tx("apelacionResolver"), texto: x.texto, aceptar: tx("apelacionGuardar"), cancelar: tx("cancelar"),
      campos: [{ nombre: "resolucion", etiqueta: tx("apelacionQueResolvio"), valor: x.resolucion || "", max: 300 }] });
    if (!r) return;
    x.resolucion = String(r.resolucion || "").trim().slice(0, 300);
    guardar();
    pintarRondas();
  }

  function pintarMesasIndividuales(caja, r) {
    const v = t();
    const R = v.rondas[r];
    const num = T.numeros(v);
    const antes = (id) => T.puntosHasta(v, id, r);
    const marcas = V.marcasIncidencias(R);
    const tabla = el("table", { class: "pi-tabla" });
    tabla.append(el("thead", {}, el("tr", {},
      el("th", { class: "num", scope: "col", texto: tx("mesa") }),
      el("th", { class: "num", scope: "col", texto: tx("nro") }), el("th", { scope: "col", texto: tx("blancas") }), el("th", { class: "num", scope: "col", texto: tx("pts") }),
      el("th", { class: "text-center", scope: "col", texto: tx("resultado") }),
      el("th", { class: "num", scope: "col", texto: tx("pts") }), el("th", { scope: "col", texto: tx("negras") }), el("th", { class: "num", scope: "col", texto: tx("nro") }))));
    const cuerpo = el("tbody");
    R.mesas.forEach((m, i) => {
      if (m.n === null) {
        cuerpo.append(el("tr", {},
          el("td", { class: "num", texto: V.mesaFisica(v, i) }), el("td", { class: "num", texto: num.get(m.b) }),
          el("td", { class: "font-semibold", texto: nombreDe(m.b) }), el("td", { class: "num", texto: puntosTexto(antes(m.b)) }),
          el("td", { class: "text-center", colspan: 4, texto: tx("byePareo", { p: puntosTexto(v.puntos.bye) }) })));
        return;
      }
      const sel = el("select", { id: "pi-mesa-" + i, "data-resultado": "", class: C.campoChico, "aria-label": tx("resultadoMesa", { m: V.mesaFisica(v, i), b: nombreDe(m.b), n: nombreDe(m.n) }) });
      for (const [val, clave] of RESULTADOS) sel.append(el("option", { value: val, texto: tx(clave) }));
      sel.value = m.r || "";
      sel.addEventListener("change", async () => {
        // Corregir una ronda ya cerrada (la siguiente ya se emparejó) pide
        // el motivo, y queda en las incidencias.
        if (r < v.rondas.length - 1 && m.r && sel.value !== m.r) {
          const motivo = await pedirMotivo(r, i, m.r, sel.value || null);
          if (!motivo) { sel.value = m.r || ""; return; }
          anotarCorreccion(R, i, m.r, sel.value || null, motivo);
        } else if (m.r && sel.value !== m.r) {
          // En la ronda en juego: cambiar un resultado ya anotado (por un
          // error al tocar) pide confirmarlo, y queda la constancia.
          if (!(await confirmarCambio(r, i, m.r, sel.value || null))) { sel.value = m.r || ""; return; }
          anotarCorreccion(R, i, m.r, sel.value || null, tx("correccionPrincipal"));
        }
        m.r = sel.value || null;
        // En la eliminación directa, unas tablas piden quién pasó; otro
        // resultado borra lo que se había anotado del desempate.
        if (m.ko && m.r !== "=") { delete m.pasa; delete m.desempate; }
        guardar();
        if (m.ko) { pintarRondas(); return; }
        const quedan = R.mesas.filter((x) => x.n && !T.rondaCompleta({ mesas: [x] })).length;
        const estadoTxt = caja.querySelector('[role="status"]');
        if (estadoTxt) estadoTxt.textContent = quedan ? tx("faltanResultados", { n: quedan }) : tx("rondaCompleta");
        if (!quedan) pintarRondasNav();
      });
      // Las marcas de las incidencias de cada uno, y su detalle en una fila
      // aparte que se abre al tocar la marca.
      const filaDet = el("tr", { class: "pi-inc-fila", hidden: true });
      const verDet = () => { filaDet.hidden = ![...filaDet.querySelectorAll(".pi-inc-detalle")].some((d) => !d.hidden); };
      const [mb, db] = marcaDe(marcas, m.b, nombreDe(m.b), verDet);
      const [mn, dn] = marcaDe(marcas, m.n, nombreDe(m.n), verDet);
      filaDet.append(el("td", { colspan: 8 }, db, dn));
      cuerpo.append(el("tr", { "data-nombres": normalizarBusqueda(nombreDe(m.b) + " " + nombreDe(m.n)) },
        el("td", { class: "num", texto: V.mesaFisica(v, i) }), el("td", { class: "num", texto: num.get(m.b) }),
        el("td", { class: "font-semibold" }, nombreDe(m.b), mb ? " " : null, mb), el("td", { class: "num", texto: puntosTexto(antes(m.b)) }),
        el("td", { class: "text-center" }, sel, el("span", { class: "pi-solo-imprimir", texto: m.r ? tx("corto_" + m.r) : "" }),
          m.ko && (m.llave || m.tercer) ? el("span", { class: "block text-xs " + C.nota, "data-llave": m.tercer ? "T" : m.llave + m.fase, texto: rotuloLlave(m) }) : null,
          m.ko && m.r === "=" ? desempateDeMesa(v, R, m, i) : null,
          m.porAdjunto ? el("span", { class: "block text-xs " + C.nota, texto: typeof m.porAdjunto === "string" ? tx("adjuntoAnotoNombre", { n: m.porAdjunto }) : tx("adjuntoAnoto") }) : null,
          el("button", { type: "button", class: C.mini + " no-imprimir block mx-auto mt-1", "data-pgn": String(i), "aria-label": tx("pgnBotonA", { m: V.mesaFisica(v, i) }),
            onclick: (e) => Pagina.editarPartida(r, i, e.currentTarget) }, (m.pgn ? "✓ " : "") + tx("pgnBoton")),
          window.PareoPlanilla ? el("button", { type: "button", class: C.mini + " no-imprimir block mx-auto mt-1", "data-planilla": String(i), "aria-label": tx("planillaBotonA", { m: V.mesaFisica(v, i) }),
            onclick: (e) => Pagina.leerPlanilla(r, i, e.currentTarget) }, tx("planillaBoton")) : null,
          Pagina.lecturasDe(v).has(r + "|" + i) ? el("button", { type: "button", class: C.mini + " no-imprimir block mx-auto mt-1", "data-lectura": String(i), "aria-label": tx("planillaLecturaA", { m: V.mesaFisica(v, i) }),
            onclick: () => Pagina.bajarLectura(v, r, i) }, tx("planillaLectura")) : null),
        el("td", { class: "num", texto: puntosTexto(antes(m.n)) }), el("td", { class: "font-semibold" }, nombreDe(m.n), mn ? " " : null, mn),
        el("td", { class: "num", texto: num.get(m.n) })));
      if (mb || mn) cuerpo.append(filaDet);
    });
    tabla.append(cuerpo);
    caja.append(el("div", { class: "overflow-x-auto" }, tabla));
  }

  // El nombre de la ronda en una eliminación directa: «Final», «Cuartos de final»…
  const RONDA_ELIM = { final: "elimRonda_final", semifinal: "elimRonda_semifinal", cuartos: "elimRonda_cuartos", octavos: "elimRonda_octavos", ronda: "elimRonda_ronda" };
  function nombreRondaElim(v, r) {
    if (v.dobleEliminacion) return T.fasesDeRonda(v, r).map(nombreFaseDoble).join(" · ");
    return tx(RONDA_ELIM[T.nombreRondaEliminacion(v, r)], { r: r + 1 }) + (v.tercerPuesto && T.nombreRondaEliminacion(v, r) === "final" ? " · " + tx("tercerNombre") : "");
  }
  // Una fase de la doble eliminación: «G2» es la ronda 2 de la llave de
  // ganadores, «P1» la 1 de perdedores, «F1» la final y «F2» la revancha.
  function nombreFaseDoble(f) {
    return f === "F1" ? tx("dobleFinal") : f === "F2" ? tx("dobleRevancha") : tx(f[0] === "G" ? "dobleGanadores" : "doblePerdedores", { n: f.slice(1) });
  }
  // De qué llave es una mesa, escrito: va al lado del resultado.
  function rotuloLlave(m) {
    if (m.tercer) return tx("tercerNombre");
    if (!m.llave) return "";
    return nombreFaseDoble(m.llave + m.fase);
  }

  // En la eliminación directa, unas tablas se desempatan en la mesa: quién
  // pasó y cómo (el resultado de la partida queda «=», que es el que va al
  // TRF y al Elo).
  function desempateDeMesa(v, R, m, i) {
    const mesa = V.mesaFisica(v, i);
    const pasa = el("select", { class: C.campoChico + " mt-1", "data-pasa": String(i), "aria-label": tx("elimPasaA", { m: mesa }) },
      el("option", { value: "", texto: tx("elimPasaFalta") }),
      el("option", { value: m.b, texto: tx("elimPasa") + ": " + nombreDe(m.b) }),
      el("option", { value: m.n, texto: tx("elimPasa") + ": " + nombreDe(m.n) }));
    pasa.value = m.pasa || "";
    const formatos = tx("elimFormatos").split("|");
    const como = el("select", { class: C.campoChico + " mt-1", "data-desempate-mesa": String(i), "aria-label": tx("elimDesempateA", { m: mesa }) },
      formatos.map((f) => el("option", { value: f, texto: f })));
    como.value = formatos.includes(m.desempate) ? m.desempate : formatos[0];
    pasa.addEventListener("change", () => {
      if (pasa.value) { m.pasa = pasa.value; m.desempate = como.value; } else { delete m.pasa; delete m.desempate; }
      guardar();
      pintarRondas();
    });
    como.addEventListener("change", () => { if (m.pasa) { m.desempate = como.value; guardar(); } });
    return el("span", { class: "block no-imprimir" }, pasa, " ", como,
      m.pasa ? el("span", { class: "pi-solo-imprimir", texto: tx("elimPasoDesempate", { n: nombreDe(m.pasa), f: m.desempate || formatos[0] }) }) : null);
  }

  // Cómo se llama cada forma de no jugar una ronda. En el Keizer dice además
  // qué parte de su propio valor suma (T.REGLAS_KEIZER).
  function rotuloAusencia(v, c) {
    const base = c === "H" ? tx("byeMedio", { p: puntosTexto(v.puntos.tablas) }) : c === "F" ? tx("byeEntero", { p: puntosTexto(v.puntos.victoria) }) : tx(T.fijo(v) ? "libre" : "byeCero");
    if (v.sistema !== "keizer") return base;
    const K = T.REGLAS_KEIZER;
    return tx(c === "H" ? "keizerAviso" : c === "F" ? "keizerClub" : "keizerFalta", { p: Math.round((c === "H" ? K.medio : c === "F" ? K.club : K.falta) * 5) });
  }

  // Quienes no jugaron esta ronda: byes pedidos, retirados, inscritos después.
  function pintarNoJuegan(caja, r) {
    const v = t();
    // En la eliminación directa, quien no está en una mesa ya quedó fuera.
    if (v.sistema === "eliminacion") return;
    const R = v.rondas[r];
    const num = T.numeros(v);
    const enMesa = new Set();
    for (const m of R.mesas) { enMesa.add(m.b); if (m.n) enMesa.add(m.n); }
    const fuera = T.ordenInicial(v).filter((id) => !enMesa.has(id));
    if (fuera.length) {
      const ul = el("ul", { class: "mt-2 space-y-1" });
      for (const id of fuera) {
        const actual = (R.ausencias || {})[id] || "Z";
        const s = el("select", { class: C.campoChico, "aria-label": tx("ausenciaDe", { n: nombreDe(id) }) },
          el("option", { value: "H", texto: rotuloAusencia(v, "H") }),
          el("option", { value: "Z", texto: rotuloAusencia(v, "Z") }),
          el("option", { value: "F", texto: rotuloAusencia(v, "F") }));
        s.value = actual;
        const papel = el("span", { class: "pi-solo-imprimir", texto: s.selectedOptions[0].textContent });
        let antes = s.value;
        s.addEventListener("change", async () => {
          if (await confirmarByeEntero(s, antes)) {
            R.ausencias = R.ausencias || {};
            if (s.value === "Z") delete R.ausencias[id]; else R.ausencias[id] = s.value;
            antes = s.value;
            guardar();
          }
          papel.textContent = s.selectedOptions[0].textContent;
        });
        ul.append(el("li", { class: "flex flex-wrap items-center gap-2" }, el("span", { class: "font-semibold", texto: num.get(id) + ". " + nombreDe(id) }), s, papel));
      }
      caja.append(el("h3", { class: "font-semibold mt-5", texto: tx("noJuegan") }), ul);
    }
  }

  // FIDE desaconseja el bye de punto entero: se puede dar, pero el programa
  // avisa antes (lista de verificación de los programas de torneo, punto 17).
  // Si quien arbitra se arrepiente, el select vuelve a lo que tenía y la
  // función devuelve false. `antes`: el valor que tenía el select.
  async function confirmarByeEntero(s, antes) {
    if (s.value !== "F" || antes === "F") return true;
    const ok = await Avisos.confirmar(tx("byeEnteroAviso"), { titulo: tx("byeEnteroTitulo"), aceptar: tx("byeEnteroSi"), cancelar: tx("byeEnteroNo") });
    if (!ok) s.value = antes;
    return ok;
  }

  // ---------- Modificar la ronda en juego, sin deshacerla ----------
  // Cambiar a dos de lugar (también a uno que no juega por uno que sí),
  // invertir colores, sacar a alguien, armar una mesa con quienes no juegan y
  // agregar un jugador nuevo ahí mismo. Lo que se puede y lo que no lo decide
  // V.modificarRonda (js/pareo/evento.js); cada cambio queda en las
  // incidencias y en el historial («Deshacer el último cambio»).
  const ERROR_MODIFICAR = { noSePuede: "modErr_noSePuede", sinRival: "modErr_sinRival", conResultado: "modErr_conResultado", mismo: "modErr_mismo", retirado: "modErr_retirado",
    ningunoJuega: "modErr_ningunoJuega", noJuega: "modErr_noJuega", yaJuega: "modErr_yaJuega", yaHayBye: "modErr_yaHayBye" };
  function pintarModificarRonda(caja, r) {
    const v = t();
    const R = v.rondas[r];
    const lado = (l) => tx(l === "b" ? "blancas" : "negras").toLowerCase();
    // Cada jugador con su lugar en la ronda, para elegirlo.
    const lugarDe = (id) => {
      const p = V.dondeJuega(R, id);
      if (!p) return tx("modSinMesa", { n: nombreDe(id) });
      if (R.mesas[p.i].n == null) return tx("modEnBye", { n: nombreDe(id) });
      return tx("modEnMesa", { m: V.mesaFisica(v, p.i), c: lado(p.lado), n: nombreDe(id) });
    };
    const enRonda = [];
    R.mesas.forEach((m) => { enRonda.push(m.b); if (m.n != null) enRonda.push(m.n); });
    const fuera = V.sinMesa(v, r);
    const todos = enRonda.concat(fuera);
    const opciones = (ids) => ids.map((id) => el("option", { value: id, texto: lugarDe(id) }));
    const libres = R.mesas.map((m, i) => [m, i]).filter(([m]) => m.n != null && !m.r && !m.pgn);
    const fila = (...hijos) => el("div", { class: "flex flex-wrap items-end gap-2 mt-1" }, ...hijos);
    const campo = (id, etiqueta, control) => el("div", {}, el("label", { for: id, class: "block text-xs font-semibold mb-0.5", texto: etiqueta }), control);
    const bloque = (id, titulo, ayuda, ...hijos) => el("section", { id, class: "mt-3", "aria-labelledby": id + "-titulo" },
      el("h4", { id: id + "-titulo", class: "font-semibold text-sm", texto: titulo }),
      ayuda ? el("p", { class: C.nota, texto: ayuda }) : null, ...hijos);

    // Hace el cambio, lo anota y vuelve a pintar con el panel abierto.
    function hacer(op, incidencia, focoId) {
      const res = V.modificarRonda(v, r, op);
      if (res.error) {
        Avisos.avisar(tx(ERROR_MODIFICAR[res.error] || "modErr_noSePuede", { m: res.mesa != null ? V.mesaFisica(v, res.mesa) : "" }), { tipo: "error" });
        return;
      }
      R.incidencias = (R.incidencias || []).concat({ hora: Date.now(), tipo: "decision", texto: incidencia(res) });
      delete R.pareoVisto;
      // Quien se inscribió tarde y entra en esta misma ronda: en el acta, su
      // inscripción vale desde esta ronda y no desde la siguiente.
      for (const id of [op.a, op.b, op.n]) {
        const x = id && V.dondeJuega(R, id) && (v.tardios || []).find((y) => y.ronda === r + 2 && y.nombre === nombreDe(id));
        if (x) x.ronda = r + 1;
      }
      guardar();
      estado.modificarAbierto = true;
      pintarRondas();
      const avisos = [tx("modListo", { r: r + 1 })];
      for (const x of res.repetidas || []) avisos.push(tx("modRepetida", { b: nombreDe(x.b), n: nombreDe(x.n), r: x.ronda }));
      if (res.sinRival) avisos.push(tx("modSinRivalAviso", { n: nombreDe(res.sinRival) }));
      Avisos.avisar(avisos.join(" "), { tipo: (res.repetidas || []).length || res.sinRival ? "info" : undefined });
      const f = $(focoId);
      if (f) f.focus();
    }

    const det = el("details", { id: "pi-modificar", class: "no-imprimir mt-5 rounded-xl border border-brand-200 dark:border-brand-700 p-3", open: !!estado.modificarAbierto });
    det.addEventListener("toggle", () => { estado.modificarAbierto = det.open; });
    det.append(el("summary", { class: "cursor-pointer font-semibold rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", texto: tx("modTitulo") }),
      el("p", { class: C.nota + " mt-1", texto: tx("modTexto") }));

    // Cambiar a dos de lugar.
    const selA = el("select", { id: "pi-mod-a", class: C.campoChico }, opciones(todos));
    const selB = el("select", { id: "pi-mod-b", class: C.campoChico }, opciones(todos));
    // El recién agregado (abajo) queda elegido para entrar.
    const preferido = fuera.includes(estado.modNuevo) ? estado.modNuevo : fuera[0];
    if (todos.length > 1) selB.value = fuera.length ? preferido : todos[1];
    det.append(bloque("pi-mod-cambio", tx("modIntercambiarTitulo"), tx("modIntercambiarAyuda"),
      fila(campo("pi-mod-a", tx("modJugadorA"), selA), campo("pi-mod-b", tx("modJugadorB"), selB),
        el("button", { type: "button", id: "pi-mod-intercambiar", class: C.mini, onclick: () => {
          const a = selA.value, b = selB.value;
          hacer({ tipo: "intercambiar", a, b }, () => tx("modIncCambio", { a: nombreDe(a), b: nombreDe(b) }), "pi-mod-intercambiar");
        } }, tx("modIntercambiar")))));

    // Invertir los colores.
    if (libres.length) {
      const selM = el("select", { id: "pi-mod-mesa", class: C.campoChico },
        libres.map(([m, i]) => el("option", { value: String(i), texto: tx("modMesaOpcion", { m: V.mesaFisica(v, i), b: nombreDe(m.b), n: nombreDe(m.n) }) })));
      det.append(bloque("pi-mod-colores", tx("modColoresTitulo"), null,
        fila(campo("pi-mod-mesa", tx("mesa"), selM),
          el("button", { type: "button", id: "pi-mod-invertir", class: C.mini, onclick: () => {
            const m = R.mesas[Number(selM.value)];
            hacer({ tipo: "colores", mesa: Number(selM.value) }, () => tx("modIncColores", { b: nombreDe(m.n), n: nombreDe(m.b) }), "pi-mod-invertir");
          } }, tx("modColores")))));
    }

    // Sacar a alguien de la ronda.
    if (enRonda.length) {
      const selS = el("select", { id: "pi-mod-sacar", class: C.campoChico }, opciones(enRonda));
      det.append(bloque("pi-mod-salir", tx("modSacarTitulo"), tx("modSacarAyuda"),
        fila(campo("pi-mod-sacar", tx("nombre"), selS),
          el("button", { type: "button", id: "pi-mod-sacar-boton", class: C.mini, onclick: () => {
            const id = selS.value;
            hacer({ tipo: "sacar", id }, (res) => res.sinRival ? tx("modIncSacarRival", { n: nombreDe(id), o: nombreDe(res.sinRival) }) : tx("modIncSacar", { n: nombreDe(id) }), "pi-mod-sacar-boton");
          } }, tx("modSacar")))));
    }

    // Armar una mesa con quienes no juegan (o darle a uno el bye del pareo).
    const hayBye = R.mesas.some((m) => m.n == null);
    if (fuera.length >= (hayBye ? 2 : 1)) {
      const selBl = el("select", { id: "pi-mod-blancas", class: C.campoChico }, fuera.map((id) => el("option", { value: id, texto: nombreDe(id) })));
      const selNe = el("select", { id: "pi-mod-negras", class: C.campoChico }, fuera.map((id) => el("option", { value: id, texto: nombreDe(id) })),
        hayBye ? null : el("option", { value: "", texto: tx("byePareo", { p: puntosTexto(v.puntos.bye) }) }));
      selBl.value = preferido;
      selNe.value = fuera.find((id) => id !== preferido) || "";
      det.append(bloque("pi-mod-armar", tx("modArmarTitulo"), null,
        fila(campo("pi-mod-blancas", tx("blancas"), selBl), campo("pi-mod-negras", tx("negras"), selNe),
          el("button", { type: "button", id: "pi-mod-armar-boton", class: C.mini, onclick: () => {
            const b = selBl.value, n = selNe.value || null;
            hacer({ tipo: "mesa", b, n }, () => n ? tx("modIncMesa", { b: nombreDe(b), n: nombreDe(n) }) : tx("modIncBye", { n: nombreDe(b) }), "pi-mod-armar-boton");
          } }, tx("modArmar")))));
    } else if (!fuera.length) det.append(el("p", { class: C.nota + " mt-3", texto: tx("modNadieSinMesa") }));

    // Un jugador nuevo, sin salir de la ronda.
    const fNombre = el("input", { id: "pi-mod-nuevo-nombre", type: "text", maxlength: "33", autocomplete: "off", class: C.campoChico });
    const fInst = el("input", { id: "pi-mod-nuevo-inst", type: "text", maxlength: "80", autocomplete: "off", class: C.campoChico });
    const fElo = el("input", { id: "pi-mod-nuevo-elo", type: "number", min: "0", max: "3500", inputmode: "numeric", class: C.campoChico + " w-24" });
    const form = el("form", { class: "flex flex-wrap items-end gap-2 mt-1" },
      campo("pi-mod-nuevo-nombre", tx("nombre"), fNombre), campo("pi-mod-nuevo-inst", tx("institucion"), fInst), campo("pi-mod-nuevo-elo", tx("modElo"), fElo),
      el("button", { type: "submit", id: "pi-mod-nuevo-agregar", class: C.mini }, tx("modNuevoAgregar")));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const d = datosJugador({ nombre: fNombre.value, institucion: fInst.value, elo: fElo.value });
      if (!d.nombre) { Avisos.avisar(tx("faltaNombre"), { tipo: "error" }); fNombre.focus(); return; }
      if (!agregarJugadores([d])) return;
      estado.modNuevo = v.jugadores[v.jugadores.length - 1].id;
      estado.modificarAbierto = true;
      pintarRondas();
      Avisos.avisar(tx("modNuevoListo", { n: d.nombre }));
      const sig = $("pi-mod-blancas") || $("pi-mod-b");
      if (sig) sig.focus();
    });
    det.append(bloque("pi-mod-nuevo", tx("modNuevoTitulo"), tx("modNuevoAyuda"), form));
    caja.append(det);
  }

  Object.assign(Pagina, { textoIncidencia, marcaDe, pintarConfirmar, pintarReloj, confirmarCambio,
    pedirMotivo, anotarCorreccion, pintarIncidencias, pintarMesasIndividuales, RONDA_ELIM, nombreRondaElim,
    nombreFaseDoble, rotuloAusencia, pintarNoJuegan, confirmarByeEntero, pintarModificarRonda });
})();

/*! rev bfb5bbb0d2d82f9f */
