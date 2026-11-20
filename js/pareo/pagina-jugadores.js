/* ===== Pareo Integral — la página (pareo.html): la ficha «Jugadores» =====
 *
 * La inscripción a mano, las instituciones, el Elo pendiente, los equipos y sus integrantes, las
 * categorías, editar un jugador, borrar en bloque, pasarlo a otro torneo, retirarlo y eliminarlo.
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
  const { T, G, E, PREFIJO, C, escribir, leerJSON, $, el, tx, estado, normalizarBusqueda, idJugador, guardar,
    t, jugador, puntosTexto } = Pagina;

  // ---------- Jugadores ----------
  function instituciones() {
    const v = t();
    const vistas = new Set();
    for (const j of v.jugadores) if (j.institucion) vistas.add(j.institucion);
    return [...vistas].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }

  function pintarSelectInstitucion(sel) {
    const lista = instituciones();
    sel.replaceChildren(el("option", { value: "", texto: tx("todasInstituciones") }));
    for (const inst of lista) sel.append(el("option", { value: inst, texto: inst }));
    // Si la institución filtrada ya no tiene a nadie (se borró o se editó),
    // el filtro vuelve a «todas»: nunca se queda filtrando en silencio algo
    // que el select ya no ofrece.
    if (!lista.includes(estado.filtroInstitucion)) estado.filtroInstitucion = "";
    sel.value = estado.filtroInstitucion;
  }

  function pintarEloPendientes() {
    const ul = $("pi-elo-pendientes");
    estado.eloPendientes = estado.eloPendientes.filter((x) => {
      const j = jugador(x.id);
      return j && !(Number(j.elo) > 0);
    });
    ul.replaceChildren();
    ul.hidden = !estado.eloPendientes.length;
    const motivo = { ambiguo: "eloAmbiguo", parecido: "eloParecido" };
    for (const x of estado.eloPendientes) {
      const li = el("li", {},
        el("div", { class: "flex items-center justify-between gap-2" },
          el("span", {},
            el("span", { class: "font-semibold", texto: x.nombre }), " — ",
            el("span", { class: "text-brand-600 dark:text-brand-300", texto: tx(motivo[x.estado] || "eloNoEncontrado") })),
          el("button", { type: "button", class: C.mini, "aria-label": tx("editarA", { n: x.nombre }), onclick: () => editarJugador(x.id) }, tx("editar"))));
      // Los candidatos de la lista nacional (nombres que tienen todas las
      // palabras escritas): nunca se asignan solos, quien organiza elige.
      const cands = x.candidatos || [];
      if (cands.length) {
        const sub = el("ul", { class: "mt-1 ml-4 space-y-1" });
        for (const c of cands) {
          const datos = [c.nombre, c.club, Number(c.nacional) > 0 ? tx("eloCandidatoElo", { e: c.nacional }) : tx("eloCandidatoSinElo")].filter(Boolean).join(" · ");
          sub.append(el("li", { class: "flex items-center justify-between gap-2" },
            el("span", { texto: datos }),
            Number(c.nacional) > 0
              ? el("button", { type: "button", class: C.mini, "aria-label": tx("eloUsarA", { c: c.nombre, n: x.nombre }), onclick: () => usarCandidatoElo(x.id, c) }, tx("eloUsar"))
              : null));
        }
        if (x.totalCandidatos > cands.length) sub.append(el("li", { class: C.nota, texto: tx("eloMasCandidatos", { n: x.totalCandidatos - cands.length }) }));
        li.append(sub);
      }
      ul.append(li);
    }
  }

  // Quien organiza confirmó que ese candidato de la lista nacional es su
  // jugador: le pone el Elo y, si no tenía, el ID FIDE (el TRF lo necesita).
  // El nombre se queda como lo escribió.
  function usarCandidatoElo(id, c) {
    const j = jugador(id);
    if (!j || !(Number(c.nacional) > 0)) return;
    j.elo = Number(c.nacional);
    if (!j.fideId && c.fideId && /^\d{3,11}$/.test(String(c.fideId))) j.fideId = String(c.fideId);
    guardar();
    pintarJugadores();
    Avisos.avisar(tx("eloUsado", { n: j.nombre, c: c.nombre, e: j.elo }));
  }

  function pintarJugadores() {
    const v = t();
    // Cada parte empieza por lo que más se usa: con gente inscrita, la lista
    // va arriba y «Agregar un jugador» debajo (con un botón que lleva ahí).
    const panelJ = $("pi-p-jugadores"), cajaAgregar = $("pi-jug-agregar"), cajaInscritos = $("pi-jug-inscritos");
    const listaPrimero = v.jugadores.length > 0;
    if ((panelJ.firstElementChild === cajaInscritos) !== listaPrimero) panelJ.prepend(listaPrimero ? cajaInscritos : cajaAgregar);
    $("pi-ir-agregar").hidden = !listaPrimero || E.esDeEquipos(v);
    const num = T.numeros(v);
    const orden = T.ordenInicial(v);
    const tabla = $("pi-tabla-jugadores");
    tabla.replaceChildren();
    // La acreditación, en la lista de inscritos (antes de emparejar también
    // está en Rondas). En equipos no: se acredita el equipo en la sala.
    const acred = $("pi-acreditacion");
    acred.replaceChildren();
    if (!E.esDeEquipos(v) && v.jugadores.length) Pagina.pintarPasarLista(acred, pintarJugadores, "pi-j");
    // En un torneo por equipos no se agrega gente a mano ni se busca el Elo
    // Nacional de un equipo: los equipos salen de la inscripción.
    const deEquipos = E.esDeEquipos(v);
    $("pi-nota-equipos").hidden = !deEquipos;
    $("pi-form-jugador").hidden = deEquipos;
    $("pi-pegar-caja").hidden = deEquipos;
    $("pi-listas-caja").hidden = deEquipos;
    if (!deEquipos) { Pagina.pintarListaElo(); pintarCategorias(false); }
    $("pi-caja-elo-nacional").hidden = deEquipos;
    tabla.hidden = deEquipos;
    $("pi-masivo").hidden = true;
    $("pi-equipos").hidden = !deEquipos;
    if (deEquipos) {
      $("pi-cuenta").textContent = v.jugadores.length;
      $("pi-sin-jugadores").hidden = v.jugadores.length > 0;
      $("pi-sin-coincidencias").hidden = true;
      $("pi-orden-ayuda").textContent = tx(v.rondas.length ? "ordenTablerosFijo" : "ordenTablerosAyuda");
      Pagina.pintarSugerencia();
      pintarEquipos();
      return;
    }
    $("pi-cuenta").textContent = v.jugadores.length;
    $("pi-sin-jugadores").hidden = v.jugadores.length > 0;
    $("pi-orden-ayuda").textContent = tx(Array.isArray(v.numeracion) ? "ordenFijo" : "ordenAyuda");
    $("pi-buscar-jugador").value = estado.filtroJugador;
    pintarEloPendientes();
    Pagina.pintarSugerencia();
    if (!v.jugadores.length) { $("pi-sin-coincidencias").hidden = true; return; }
    const q = normalizarBusqueda(estado.filtroJugador);
    const filtrado = q ? orden.filter((id) => {
      const j = jugador(id);
      return normalizarBusqueda(j.nombre).includes(q) || normalizarBusqueda(j.institucion).includes(q);
    }) : orden;
    $("pi-sin-coincidencias").hidden = filtrado.length > 0;
    if (!filtrado.length) return;
    // Marcar varios (o todos los que se ven) para eliminarlos de una vez.
    for (const id of [...estado.marcados]) if (!jugador(id)) estado.marcados.delete(id);
    const todosMarcados = filtrado.every((id) => estado.marcados.has(id));
    pintarMasivo(filtrado);
    tabla.append(el("thead", {}, el("tr", {},
      el("th", { scope: "col", class: "w-8" }, el("input", { type: "checkbox", id: "pi-marcar-todos", "aria-label": tx("marcarTodos"), checked: todosMarcados, onchange: (e) => {
        for (const id of filtrado) { if (e.target.checked) estado.marcados.add(id); else estado.marcados.delete(id); }
        pintarJugadores();
        const x = $("pi-marcar-todos"); if (x) x.focus();
      } })),
      el("th", { class: "num", scope: "col", texto: tx("nro") }), el("th", { scope: "col", texto: tx("nombre") }),
      el("th", { scope: "col", texto: tx("institucion") }), el("th", { scope: "col", texto: tx("categoria") }),
      el("th", { scope: "col", texto: tx("titulo") }), el("th", { class: "num", scope: "col", texto: "Elo" }),
      el("th", { scope: "col", texto: tx("fed") }), el("th", { scope: "col", texto: tx("fideId") }),
      el("th", { class: "num", scope: "col", texto: tx("pts") }), el("th", { scope: "col", texto: tx("estado") }),
      el("th", { scope: "col", texto: tx("acciones") }))));
    const cuerpo = el("tbody");
    const enUnaMesa = new Set();
    for (const R of v.rondas) for (const m of R.mesas) { enUnaMesa.add(m.b); if (m.n) enUnaMesa.add(m.n); }
    for (const id of filtrado) {
      const j = jugador(id);
      const retirado = j.retiradoDespuesDe != null;
      const cid = "pi-marcar-" + id;
      cuerpo.append(el("tr", {},
        el("td", {}, el("input", { type: "checkbox", id: cid, "aria-label": tx("marcarA", { n: j.nombre }), checked: estado.marcados.has(id), onchange: (e) => {
          if (e.target.checked) estado.marcados.add(id); else estado.marcados.delete(id);
          pintarJugadores();
          const x = $(cid); if (x) x.focus();
        } })),
        el("td", { class: "num", texto: num.get(id) }),
        el("td", { class: "font-semibold" }, j.nombre, j.mesaFija ? el("span", { class: "block text-xs font-normal", texto: tx("mesaFijaEn", { m: j.mesaFija }) }) : null),
        el("td", { texto: j.institucion || "" }),
        el("td", { texto: j.categoria || "" }),
        el("td", { texto: j.titulo || "" }),
        el("td", { class: "num", texto: Number(j.elo) > 0 ? j.elo : "" }),
        el("td", { texto: j.fed || "" }),
        el("td", { texto: j.fideId || "" }),
        el("td", { class: "num", texto: puntosTexto(T.puntos(v, id)) }),
        el("td", { texto: retirado ? tx(j.retiroAuto != null ? "retiradoIncomparecencia" : "retiradoDesde", { r: j.retiradoDespuesDe + 1 }) : tx("activo") }),
        el("td", { class: "whitespace-nowrap" },
          el("button", { type: "button", class: C.mini, "aria-label": tx("editarA", { n: j.nombre }), onclick: () => editarJugador(id) }, tx("editar")), " ",
          v.evento && !v.rondas.length ? el("button", { type: "button", class: C.mini, "aria-label": tx("moverA", { n: j.nombre }), onclick: () => moverDeTorneo(id) }, tx("mover")) : null, " ",
          enUnaMesa.has(id) || v.rondas.length
            ? el("button", { type: "button", class: C.mini, "aria-label": tx(retirado ? "volverA" : "retirarA", { n: j.nombre }), onclick: () => retirar(id) }, tx(retirado ? "volver" : "retirar"))
            : el("button", { type: "button", class: C.miniPeligro, "aria-label": tx("eliminarA", { n: j.nombre }), onclick: () => eliminar(id) }, tx("eliminar"))
        )));
    }
    tabla.append(cuerpo);
  }

  // Los equipos, cada uno con su orden de tableros (art. 66.2.h): se da en
  // el congresillo y se mantiene en toda la etapa, así que ↑ y ↓ solo
  // funcionan antes de la ronda 1. El quinto es el suplente.
  function pintarEquipos() {
    const v = t();
    const num = T.numeros(v);
    const caja = $("pi-equipos");
    caja.replaceChildren();
    caja.append(formularioEquipo());
    if (!v.jugadores.length) return;
    const fijo = v.rondas.length > 0;
    caja.append(el("div", { class: "flex flex-wrap gap-2" },
      el("button", { type: "button", class: C.botonSec, onclick: imprimirOrdenTableros }, tx("imprimirOrdenTableros"))));
    for (const id of T.ordenInicial(v)) {
      const e = jugador(id);
      const ol = el("ol", { class: "mt-1 space-y-1 text-sm" });
      e.integrantes.forEach((j, k) => {
        const mover = (d) => () => {
          if (!E.moverIntegrante(v, id, k, d)) return;
          guardar();
          pintarEquipos();
          const b = $("pi-orden-" + id + "-" + (k + d) + (d < 0 ? "-sube" : "-baja"));
          if (b && !b.disabled) b.focus();
        };
        ol.append(el("li", { class: "flex flex-wrap items-center gap-2" },
          el("span", { class: "font-mono text-xs font-bold w-24", texto: k < E.TABLEROS ? tx("tableroN", { t: k + 1 }) : tx("suplente") }),
          el("span", { class: "flex-1 min-w-[10rem]", texto: j.nombre + (Number(j.elo) > 0 ? " (" + j.elo + ")" : "") }),
          el("button", { type: "button", id: "pi-orden-" + id + "-" + k + "-sube", class: C.mini, disabled: fijo || k === 0, "aria-label": tx("subir", { n: j.nombre }), onclick: mover(-1) }, "↑"),
          el("button", { type: "button", id: "pi-orden-" + id + "-" + k + "-baja", class: C.mini, disabled: fijo || k === e.integrantes.length - 1, "aria-label": tx("bajar", { n: j.nombre }), onclick: mover(1) }, "↓"),
          fijo ? null : el("button", { type: "button", id: "pi-reemplazar-" + id + "-" + k, class: C.mini, "aria-label": tx("reemplazarA", { n: j.nombre }), onclick: () => reemplazarIntegrante(id, k) }, tx("reemplazar")),
          fijo ? null : el("button", { type: "button", id: "pi-quitar-" + id + "-" + k, class: C.miniPeligro, "aria-label": tx("quitarIntegranteA", { n: j.nombre, e: e.nombre }), onclick: () => quitarIntegrante(id, k) }, tx("quitar"))));
      });
      caja.append(el("section", { class: "rounded-xl border border-brand-200 dark:border-brand-700 p-3", "data-equipo": id },
        el("h3", { class: "font-semibold", texto: num.get(id) + ". " + e.nombre }),
        el("p", { class: C.nota, texto: tx("equipoResumen", { n: e.integrantes.length, p: puntosTexto(T.puntos(v, id)), pt: puntosTexto(E.puntosTablero(v, id)), elo: e.elo || "—" }) }),
        ol));
    }
  }

  // Cambiar a un integrante antes de la ronda 1 (si la normativa y el
  // congresillo lo permiten): por uno de los descartados de su centro o por
  // alguien escrito a mano. Entra en el mismo lugar del orden de tableros y
  // queda en el acta.
  async function reemplazarIntegrante(idE, k) {
    const v = t();
    const e = jugador(idE);
    const sale = e.integrantes[k];
    const descartados = ((v.evento && v.evento.decisiones && v.evento.decisiones.descartados) || [])
      .filter((x) => Pagina.sinTildes(x.institucion) === Pagina.sinTildes(e.institucion)).map((x) => x.nombre);
    const campos = [];
    if (descartados.length) campos.push({ nombre: "descartado", etiqueta: tx("reemplazoDescartado"), tipo: "select", valor: "", opciones: [["", tx("reemplazoOtro")]].concat(descartados.map((n) => [n, n])) });
    campos.push({ nombre: "nombre", etiqueta: tx("reemplazoNombre"), valor: "", max: 33 });
    const r = await Avisos.formulario({ titulo: tx("reemplazarA", { n: sale.nombre }), texto: tx("reemplazoTexto", { e: e.nombre }), aceptar: tx("reemplazar"), cancelar: tx("cancelar"), campos });
    if (!r || t() !== v || v.rondas.length) return;
    const nombre = String(r.descartado || r.nombre || "").trim().slice(0, 33);
    if (!nombre) { Avisos.avisar(tx("faltaNombre"), { tipo: "error" }); return; }
    e.integrantes[k] = { id: idJugador(), nombre, institucion: sale.institucion || e.institucion, sexo: sale.sexo, categoria: sale.categoria, region: sale.region, retiradoDespuesDe: null };
    if (!e.integrantes[k].region) delete e.integrantes[k].region;
    e.elo = E.eloDeEquipo(e.integrantes);
    v.reemplazos = (v.reemplazos || []).concat({ equipo: e.nombre, sale: sale.nombre, entra: nombre });
    guardar();
    pintarEquipos();
    Avisos.avisar(tx("reemplazado", { s: sale.nombre, e: nombre }));
    const b = $("pi-reemplazar-" + idE + "-" + k); if (b) b.focus();
  }

  // Sacar a un integrante que no vino (antes de la ronda 1): queda en el
  // acta. Un equipo que se queda sin nadie sale del torneo.
  async function quitarIntegrante(idE, k) {
    const v = t();
    const e = jugador(idE);
    const sale = e.integrantes[k];
    const ok = await Avisos.confirmar(tx("quitarIntegranteTexto", { n: sale.nombre, e: e.nombre, q: e.integrantes.length - 1, m: G.JDE_MIN_EQUIPO }), { aceptar: tx("quitarIntegranteSi"), peligro: true });
    if (!ok || t() !== v || v.rondas.length) return;
    e.integrantes.splice(k, 1);
    v.bajasEquipo = (v.bajasEquipo || []).concat({ equipo: e.nombre, nombre: sale.nombre });
    if (!e.integrantes.length) v.jugadores = v.jugadores.filter((x) => x.id !== idE);
    else e.elo = E.eloDeEquipo(e.integrantes);
    guardar();
    pintarJugadores();
    Avisos.avisar(tx("integranteQuitado", { n: sale.nombre, e: e.nombre }));
    const b = $("pi-quitar-" + idE + "-" + Math.min(k, e.integrantes.length - 1)) || $("pi-eq-nuevo-centro");
    if (b) b.focus();
  }

  // Un equipo que llegó y no estaba en la lista: su centro y sus
  // integrantes (uno por línea, en el orden de tableros). Con rondas ya
  // jugadas entra desde la siguiente y queda en el acta como inscripción
  // tardía, como un jugador.
  function formularioEquipo() {
    const centro = el("input", { id: "pi-eq-nuevo-centro", class: C.campo + " w-full", maxlength: "80", autocomplete: "off" });
    const lista = el("textarea", { id: "pi-eq-nuevo-integrantes", rows: "5", class: C.campo + " w-full font-mono text-xs" });
    const boton = el("button", { type: "button", id: "pi-eq-nuevo-agregar", class: C.botonSec + " mt-2" }, tx("equipoNuevoAgregar"));
    boton.addEventListener("click", () => {
      const v = t();
      const inst = centro.value.trim();
      const nombres = lista.value.split(/\r?\n/).map((l) => l.split(/\t|;/).map((x) => x.trim())).filter((x) => x[0]);
      if (!inst) { Avisos.avisar(tx("equipoNuevoFaltaCentro"), { tipo: "error" }); centro.focus(); return; }
      if (!nombres.length) { Avisos.avisar(tx("equipoNuevoFaltan"), { tipo: "error" }); lista.focus(); return; }
      if (nombres.length > G.JDE_MAX_EQUIPO) { Avisos.avisar(tx("equipoNuevoDeMas", { n: G.JDE_MAX_EQUIPO }), { tipo: "error" }); return; }
      if (v.jugadores.some((x) => mismoCentro(x.institucion || x.nombre, inst))) { Avisos.avisar(tx("equipoNuevoYaEsta", { i: inst }), { tipo: "error" }); return; }
      const integrantes = nombres.map(([nombre, elo]) => ({ id: idJugador(), nombre: nombre.slice(0, 33), institucion: inst, elo: Number(elo) > 0 ? Number(elo) : 0, retiradoDespuesDe: null }));
      const eq = E.armarEquipos(integrantes, idJugador)[0];
      eq.categoria = categoriaDe(v);
      v.jugadores.push(eq);
      if (v.rondas.length) v.tardios = (v.tardios || []).concat({ nombre: eq.nombre, institucion: inst, ronda: v.rondas.length + 1, hora: Date.now(), aviso: "" });
      guardar();
      pintarJugadores();
      Avisos.avisar(tx("equipoNuevoListo", { i: inst, n: integrantes.length }) + (integrantes.length < G.JDE_MIN_EQUIPO ? " " + tx("equipoNuevoCorto", { m: G.JDE_MIN_EQUIPO }) : "") +
        (v.rondas.length ? " " + tx("inscripcionTardia", { r: v.rondas.length }) : ""));
      const x = $("pi-eq-nuevo-centro"); if (x) x.focus();
    });
    // Queda abierto al volver a pintar (para agregar otro seguido).
    const det = el("details", { id: "pi-eq-nuevo", class: "rounded-xl border border-brand-200 dark:border-brand-700 p-3", open: !!estado.equipoNuevoAbierto });
    det.addEventListener("toggle", () => { estado.equipoNuevoAbierto = det.open; });
    det.append(
      el("summary", { class: "cursor-pointer font-semibold rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", texto: tx("equipoNuevoTitulo") }),
      el("p", { class: C.nota + " mt-1", texto: tx("equipoNuevoTexto") }),
      el("label", { for: "pi-eq-nuevo-centro", class: "block text-sm font-semibold mt-2 mb-1", texto: tx("institucion") }), centro,
      el("label", { for: "pi-eq-nuevo-integrantes", class: "block text-sm font-semibold mt-2 mb-1", texto: tx("equipoNuevoIntegrantes") }), lista, boton);
    return det;
  }

  // El orden de tableros de cada equipo, una hoja por equipo, para que el
  // delegado la firme en el congresillo.
  function imprimirOrdenTableros() {
    const v = t();
    const cont = $("pi-firmas");
    cont.replaceChildren();
    for (const id of T.ordenInicial(v)) {
      const e = jugador(id);
      const hoja = el("div", { class: "pi-firma-mesa" },
        el("h1", { class: "pi-firma-titulo", texto: tx("ordenTablerosTitulo", { e: e.nombre }) + (v.nombre ? " — " + v.nombre : "") }));
      e.integrantes.forEach((j, k) => hoja.append(el("p", { class: "pi-firma-jugador",
        texto: (k < E.TABLEROS ? tx("tableroN", { t: k + 1 }) : tx("suplente")) + ": " + j.nombre })));
      hoja.append(el("p", { class: "pi-firma-linea", texto: tx("firmaDelegado") }), el("p", { class: "pi-firma-linea", texto: tx("firmaArbitro") }));
      cont.append(hoja);
    }
    document.body.classList.add("pi-imprimiendo-firmas");
    window.print();
  }

  function datosJugador(f) {
    const g = (k) => String(f[k] == null ? "" : f[k]).trim();
    const elo = Math.round(Number(g("elo")) || 0);
    return {
      nombre: g("nombre").slice(0, 33), institucion: g("institucion").slice(0, 80), categoria: g("categoria").slice(0, 40),
      elo: elo > 0 && elo <= 3500 ? elo : 0,
      titulo: ["GM", "IM", "WGM", "FM", "WIM", "CM", "WFM", "WCM"].includes(g("titulo").toUpperCase()) ? g("titulo").toUpperCase() : "",
      fed: g("fed").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3),
      fideId: g("fideId").replace(/\D/g, "").slice(0, 11),
      sexo: g("sexo") === "m" || g("sexo") === "w" ? g("sexo") : "",
      nacimiento: /^\d{4}-\d{2}-\d{2}$/.test(g("nacimiento")) ? g("nacimiento") : "",
    };
  }

  // La categoría al inscribir a mano se elige de una lista (el <datalist> del
  // campo). En un torneo de los JDE —con el evento de los JDE o con «Categoría
  // X» en el nombre— salen solo las que le permite su año de nacimiento
  // (Normativa, art. 17, G.categoriasDeNacimiento: casi siempre una, B o C en
  // 2013 y 2014; en individual no se sube, art. 18), y sin fecha, las cinco.
  // En cualquier otro torneo, las que ya tienen sus jugadores. Ver «Pareo
  // Integral: la categoría al inscribir y los ausentes al deshacer».
  const esDeLosJDE = (v) => !!(v.evento && v.evento.jde) || !!G.JDE_CATEGORIAS[categoriaDe(v)];
  function categoriasParaInscribir(v, nacimiento) {
    if (!esDeLosJDE(v)) {
      const usadas = [...new Set(v.jugadores.map((j) => String(j.categoria || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
      return { jde: false, lista: usadas };
    }
    const anio = (v.evento && v.evento.jde && v.evento.jde.anio) || Number(String(v.fechaInicio || "").slice(0, 4)) || G.JDE_ANIO_NORMATIVA;
    const nace = Number(String(nacimiento || "").slice(0, 4)) || 0;
    const propias = nace ? G.categoriasDeNacimiento(nace, anio) : Object.keys(G.JDE_CATEGORIAS);
    // Un torneo de una sola categoría: si le corresponde, va primero.
    const delTorneo = categoriaDe(v);
    const lista = delTorneo && propias.includes(delTorneo) ? [delTorneo].concat(propias.filter((c) => c !== delTorneo)) : propias;
    return { jde: true, anio, nace, lista };
  }
  const listaCategorias = (l) => l.join(" " + tx("o") + " ");
  function pintarCategorias(rellenar) {
    const f = $("pi-form-jugador");
    if (!f) return;
    const v = t();
    const campo = f.elements.categoria;
    const op = categoriasParaInscribir(v, f.elements.nacimiento.value);
    $("pi-categorias").replaceChildren(...op.lista.map((c) => el("option", { value: c })));
    // Con una sola posible, se pone sola, pero solo en un campo vacío: lo que
    // el árbitro escribió no se cambia en silencio (si no le toca, la nota lo
    // dice y al agregar salta el aviso de siempre).
    if (rellenar && op.jde && op.nace && op.lista.length === 1 && !campo.value.trim()) campo.value = op.lista[0];
    const nota = $("pi-categoria-nota");
    let texto = "";
    if (op.jde && op.nace) {
      const c = campo.value.trim().toUpperCase();
      if (!op.lista.length) texto = tx("categoriaNinguna", { a: op.nace, j: op.anio });
      else if (c && !op.lista.includes(c)) texto = tx("categoriaPuedeNo", { a: op.nace, l: listaCategorias(op.lista), c });
      else texto = tx("categoriaPuede", { a: op.nace, l: listaCategorias(op.lista) });
    } else if (op.jde) texto = tx("categoriaElegir");
    nota.textContent = texto;
    nota.hidden = !texto;
  }

  // Quienes comparten nombre (sin tildes ni importar el orden de apellidos y
  // nombre, el mismo bolsillo que usa el Elo Nacional) entre los recién
  // agregados y el resto del torneo: no se bloquea, puede ser un homónimo de
  // verdad, pero se avisa para que quien organiza revise si es la misma
  // persona anotada dos veces.
  function duplicadosEntre(idsNuevos) {
    const v = t();
    const porBolsillo = new Map();
    for (const j of v.jugadores) {
      const b = Pagina.bolsilloNombre(j.nombre);
      if (!b) continue;
      if (!porBolsillo.has(b)) porBolsillo.set(b, 0);
      porBolsillo.set(b, porBolsillo.get(b) + 1);
    }
    const vistos = new Set();
    const nombres = [];
    for (const id of idsNuevos) {
      const j = jugador(id);
      const b = Pagina.bolsilloNombre(j.nombre);
      if (porBolsillo.get(b) > 1 && !vistos.has(b)) {
        vistos.add(b);
        nombres.push(j.nombre);
      }
    }
    return nombres;
  }

  function agregarJugadores(lista) {
    const v = t();
    let n = 0;
    const idsNuevos = [];
    for (const datos of lista) {
      if (!datos.nombre) continue;
      const id = idJugador();
      v.jugadores.push(Object.assign({ id, retiradoDespuesDe: null }, datos));
      idsNuevos.push(id);
      n++;
    }
    if (n) {
      // En los JDE: la categoría según el año de nacimiento, y quien entra
      // con rondas ya jugadas queda en el acta como inscripción tardía.
      const nuevos = idsNuevos.map((id) => v.jugadores.find((j) => j.id === id));
      const anio = v.evento && v.evento.jde && v.evento.jde.anio;
      const rev = anio ? G.revisarCategorias(nuevos, anio) : null;
      const malos = rev ? rev.noPermitidos : [];
      for (const c of malos) Avisos.avisar(tx("tardioCategoria", { n: c.jugador.nombre, c: c.categoria, a: c.nace, p: c.propia || "—" }), { tipo: "error" });
      if (v.rondas.length && v.evento) {
        v.tardios = (v.tardios || []).concat(nuevos.map((j) => ({ nombre: j.nombre, institucion: j.institucion || "", ronda: v.rondas.length + 1, hora: Date.now(),
          aviso: (malos.find((c) => c.jugador === j) ? "No está en la categoría de su año de nacimiento." : "") })));
      }
      guardar();
      pintarJugadores();
      if (v.rondas.length) Avisos.avisar(tx("inscripcionTardia", { r: v.rondas.length }), { tipo: "info" });
      const repetidos = duplicadosEntre(idsNuevos);
      if (repetidos.length) Avisos.avisar(tx("nombresRepetidos", { n: repetidos.join(", ") }), { tipo: "info" });
    }
    return n;
  }

  async function editarJugador(id) {
    const j = jugador(id);
    const r = await Avisos.formulario({
      titulo: tx("editarA", { n: j.nombre }),
      aceptar: tx("guardarCambios"),
      campos: [
        { nombre: "nombre", etiqueta: tx("nombreJugador"), valor: j.nombre, max: 33 },
        { nombre: "institucion", etiqueta: tx("institucion"), valor: j.institucion || "", max: 80 },
        { nombre: "categoria", etiqueta: tx("categoria"), valor: j.categoria || "", max: 40 },
        { nombre: "elo", etiqueta: "Elo FIDE", valor: String(j.elo || ""), inputmode: "numeric" },
        { nombre: "titulo", etiqueta: tx("titulo"), tipo: "select", valor: j.titulo || "", opciones: [["", "—"]].concat(T.TITULOS.map((x) => [x, x])) },
        { nombre: "fed", etiqueta: tx("fed"), valor: j.fed || "", max: 3 },
        { nombre: "fideId", etiqueta: tx("fideId"), valor: j.fideId || "", inputmode: "numeric", max: 11 },
        { nombre: "sexo", etiqueta: tx("sexo"), tipo: "select", valor: j.sexo || "", opciones: [["", "—"], ["m", tx("masculino")], ["w", tx("femenino")]] },
        { nombre: "nacimiento", etiqueta: tx("nacimientoFormato"), valor: j.nacimiento || "", max: 10 },
        { nombre: "kFide", etiqueta: tx("eloKCampo"), tipo: "select", valor: j.kFide ? String(j.kFide) : "", ayuda: tx("eloKAyuda"),
          opciones: [["", tx("eloKAuto")]].concat([40, 20, 10].map((n) => [String(n), String(n)])) },
        { nombre: "mesaFija", etiqueta: tx("mesaFija"), valor: j.mesaFija ? String(j.mesaFija) : "", inputmode: "numeric", max: 3, ayuda: tx("mesaFijaAyuda") },
      ],
    });
    if (!r) return;
    const d = datosJugador(r);
    if (!d.nombre) { Avisos.avisar(tx("faltaNombre"), { tipo: "error" }); return; }
    const mesa = Math.round(Number(String(r.mesaFija || "").trim()) || 0);
    d.mesaFija = mesa >= 1 && mesa <= 500 ? mesa : null;
    d.kFide = ["40", "20", "10"].includes(r.kFide) ? Number(r.kFide) : null;
    Object.assign(j, d);
    guardar();
    pintarJugadores();
  }

  // La barra de los marcados: cuántos hay y «Eliminar los marcados». Quien
  // ya jugó una ronda no se elimina (se retira, uno por uno): se dice cuántos
  // quedan fuera y por qué.
  function pintarMasivo(visibles) {
    const barra = $("pi-masivo");
    const v = t();
    const n = estado.marcados.size;
    barra.hidden = false;
    // replaceChildren escribe «null» si le llega un null: van filtrados.
    barra.replaceChildren(...[
      el("span", { id: "pi-masivo-cuenta", class: "text-sm", role: "status", texto: n ? tx("marcadosCuenta", { n }) : tx("marcadosNinguno") }),
      el("button", { type: "button", id: "pi-marcar-visibles", class: C.mini, onclick: () => { for (const id of visibles) estado.marcados.add(id); pintarJugadores(); } },
        tx(visibles.length === v.jugadores.length ? "marcarTodosBoton" : "marcarVisibles", { n: visibles.length })),
      n ? el("button", { type: "button", id: "pi-desmarcar", class: C.mini, onclick: () => { estado.marcados.clear(); pintarJugadores(); } }, tx("desmarcar")) : null,
      n ? el("button", { type: "button", id: "pi-eliminar-marcados", class: C.miniPeligro, onclick: eliminarMarcados }, tx("eliminarMarcados", { n })) : null,
    ].filter(Boolean));
  }

  async function eliminarMarcados() {
    const v = t();
    const enUnaMesa = new Set();
    for (const R of v.rondas) for (const m of R.mesas) { enUnaMesa.add(m.b); if (m.n) enUnaMesa.add(m.n); }
    const ids = [...estado.marcados].filter((id) => jugador(id));
    const se = ids.filter((id) => !enUnaMesa.has(id));
    const no = ids.length - se.length;
    if (!se.length) { Avisos.avisar(tx("eliminarNingunoJugo"), { tipo: "error" }); return; }
    const ok = await Avisos.confirmar(tx("confirmarEliminarMarcados", { n: se.length }) + (no ? " " + tx("eliminarQuedanFuera", { n: no }) : ""),
      { aceptar: tx("eliminarMarcados", { n: se.length }), peligro: true });
    if (!ok || t() !== v) return;
    const fuera = new Set(se);
    v.jugadores = v.jugadores.filter((j) => !fuera.has(j.id));
    for (const id of se) estado.marcados.delete(id);
    guardar();
    pintarJugadores();
    Avisos.avisar(tx("eliminadosMarcados", { n: se.length }));
  }

  // Pasar a alguien a otro torneo del mismo evento (lo decide el
  // congresillo), antes de la ronda 1 de los dos. Queda en el acta.
  // ¿Puede jugar en la categoría del torneo al que va? La Normativa de los
  // JDE (G.revisarCategorias): por año de nacimiento (art. 17) y subir solo
  // en equipos, de A a B, de C a D o de D a E, hasta tres por equipo (art.
  // 18). Sin fecha de nacimiento o sin categoría en el torneo, no se revisa.
  const MODALIDAD_DE = { true: "equipo", false: "individual" };
  const TEXTO_CATEGORIA_NO = { mayor: "categoriaNoMayor", individual: "categoriaNoIndividual", salto: "categoriaNoSalto", tope: "categoriaNoTope" };
  const categoriaDe = (y) => (/Categoría (\S+)/.exec(y.grupo || y.nombre || "") || [])[1] || "";
  const mismoCentro = (a, b) => String(a || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim() === String(b || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
  function revisarCategoriaDestino(j, destino, equipo) {
    const cat = categoriaDe(destino);
    if (!cat || !j.nacimiento) return { ok: true };
    const anio = (destino.jde && destino.jde.anio) || Number(String(destino.fechaInicio || "").slice(0, 4)) || G.JDE_ANIO_NORMATIVA;
    const deEquipos = E.esDeEquipos(destino);
    // Todos «al abierto»: el tope se cuenta por equipo, sin separar por sexo.
    const comoEn = (x) => Object.assign({}, x, { categoria: cat, modalidad: MODALIDAD_DE[deEquipos], institucion: equipo ? equipo.institucion : x.institucion, alAbierto: true });
    const yo = Object.assign(comoEn(j), { esteEs: true });
    const r = G.revisarCategorias((equipo ? equipo.integrantes.map(comoEn) : []).concat(yo), anio);
    const no = r.noPermitidos.find((c) => c.jugador.esteEs);
    if (no) return { ok: false, texto: tx(TEXTO_CATEGORIA_NO[no.motivo], { n: j.nombre, a: no.nace, c: cat, p: no.propia || "—", i: equipo ? equipo.nombre : j.institucion || "—", x: (no.cuantos || 1) - 1 }) };
    const sube = r.permitidos.find((c) => c.jugador.esteEs);
    return { ok: true, texto: sube ? tx("categoriaSube", { n: j.nombre, p: sube.propia, c: cat }) : "" };
  }

  async function moverDeTorneo(id) {
    const v = t();
    const j = jugador(id);
    // A otro torneo del mismo evento que no empezó: individual o por equipos
    // (entra al equipo de su centro, si tiene cupo).
    const destinos = estado.lista.filter((x) => x.id !== estado.id).map((x) => [x.id, leerJSON(PREFIJO + x.id, null)])
      .filter(([, y]) => y && y.evento && v.evento && y.evento.id === v.evento.id && !y.rondas.length);
    if (!destinos.length) { Avisos.avisar(tx("moverSinDestino"), { tipo: "error" }); return; }
    const r = await Avisos.formulario({
      titulo: tx("moverA", { n: j.nombre }), texto: tx("moverTexto"), aceptar: tx("moverSi"), cancelar: tx("cancelar"),
      campos: [{ nombre: "destino", etiqueta: tx("moverDestino"), tipo: "select", valor: destinos[0][0], opciones: destinos.map(([idT, y]) => [idT, y.grupo || y.nombre]) }],
    });
    if (!r || t() !== v || v.rondas.length) return;
    const destino = leerJSON(PREFIJO + r.destino, null);
    if (!destino || destino.rondas.length) { Avisos.avisar(tx("moverSinDestino"), { tipo: "error" }); return; }
    const deEquipos = E.esDeEquipos(destino);
    const equipo = deEquipos ? destino.jugadores.find((e) => mismoCentro(e.institucion || e.nombre, j.institucion)) : null;
    // El equipo de su centro, lleno: primero hay que sacar a alguien.
    if (equipo && equipo.integrantes.length >= G.JDE_MAX_EQUIPO) {
      Avisos.avisar(tx("moverEquipoLleno", { i: equipo.nombre, n: G.JDE_MAX_EQUIPO }), { tipo: "error" });
      return;
    }
    const cat = revisarCategoriaDestino(j, destino, equipo);
    if (!cat.ok) { Avisos.avisar(cat.texto, { tipo: "error" }); return; }
    v.jugadores = v.jugadores.filter((x) => x.id !== id);
    if (!deEquipos) destino.jugadores.push(j);
    else if (equipo) { equipo.integrantes.push(Object.assign({}, j, { id: idJugador() })); equipo.elo = E.eloDeEquipo(equipo.integrantes); }
    else destino.jugadores.push(E.armarEquipos([Object.assign({}, j, { id: idJugador() })], idJugador)[0]);
    destino.movimientos = (destino.movimientos || []).concat({ nombre: j.nombre, institucion: j.institucion || "", desde: v.grupo || v.nombre });
    if (!escribir(PREFIJO + r.destino, JSON.stringify(destino))) { Avisos.avisar(tx("noGuarda"), { tipo: "error" }); return; }
    guardar();
    pintarJugadores();
    Avisos.avisar(tx("movido", { n: j.nombre, t: destino.grupo || destino.nombre }) + (cat.texto ? " " + cat.texto : "") +
      (deEquipos && !equipo ? " " + tx("moverEquipoNuevo", { i: j.institucion || "—", m: G.JDE_MIN_EQUIPO }) : ""));
  }

  // Vuelve a los emparejamientos. Si lo sacó una incomparecencia, esa misma
  // ya no lo vuelve a sacar (T.retirosPorIncomparecencia).
  function devolverAlTorneo(j) {
    j.retiradoDespuesDe = null;
    if (j.retiroAuto != null) { j.vuelveTras = j.retiroAuto - 1; delete j.retiroAuto; }
    guardar();
  }

  async function retirar(id) {
    const j = jugador(id);
    const v = t();
    if (j.retiradoDespuesDe != null) {
      devolverAlTorneo(j);
      pintarJugadores();
      Avisos.avisar(tx("vuelve", { n: j.nombre }));
      return;
    }
    // No juega desde la ronda que todavía no está emparejada.
    const desde = v.rondas.length;
    const ok = await Avisos.confirmar(tx("confirmarRetiro", { n: j.nombre, r: desde + 1 }), { aceptar: tx("retirar") });
    if (!ok) return;
    j.retiradoDespuesDe = desde;
    guardar();
    pintarJugadores();
  }

  async function eliminar(id) {
    const j = jugador(id);
    const ok = await Avisos.confirmar(tx("confirmarEliminar", { n: j.nombre }), { aceptar: tx("eliminar"), peligro: true });
    if (!ok) return;
    t().jugadores = t().jugadores.filter((x) => x.id !== id);
    guardar();
    pintarJugadores();
  }

  Object.assign(Pagina, { pintarSelectInstitucion, pintarJugadores, datosJugador, pintarCategorias,
    agregarJugadores, devolverAlTorneo });
})();

/*! rev bfb5bbb0d2d82f9f */
