/* «Plano de la sala» en centroamericano-mesas.html: la organización corrige el
 * plano de la sala de juego que ven las familias (js/centroamericano-plano.js).
 *
 * En «Medidas del salón y material» se ponen las medidas del salón y de la
 * mesa: con ellas el borrador parte las filas donde se acaba el ancho, y
 * debajo del plano se ve si cabe y qué material y cuántos árbitros hacen
 * falta (la cuenta, en js/plano-logistica.js). Las medidas se guardan con el
 * plano, en plano.salon.
 *
 * Se toca una mesa del dibujo y abajo se cambian sus dos números, el torneo de
 * su grupo y si ya se revisó; se agregan o quitan mesas, pasillos y filas, y
 * «Numerar seguido» completa el resto de la fila desde la mesa tocada. Nada
 * llega a la página pública hasta «Guardar el plano» (sala_plano_guardar(),
 * que deja solo a quien administra o tiene la Mesa del árbitro).
 * Ver «El plano de la sala» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  const SALA = "centroamericano-2026";
  // El orden de las filas desde adelante, como lo contó el dueño el 6/11/2026:
  // empieza en Sub-18 Femenino y baja de categoría fila por fila hacia el fondo.
  const ORDEN = ["Sub-18 Femenino", "Sub-18 Absoluto", "Sub-16 Absoluto", "Sub-16 Femenino", "Sub-14 Absoluto", "Sub-14 Femenino", "Sub-12 Absoluto", "Sub-12 Femenino", "Sub-10 Absoluto", "Sub-10 Femenino", "Sub-8 Absoluto", "Sub-8 Femenino"];

  const $ = (id) => document.getElementById(id);
  const P = () => window.CentroamericanoPlano;
  const L = () => window.PlanoLogistica;
  const avisar = (texto, error) => (window.Avisos ? window.Avisos.avisar(texto, { tipo: error ? "error" : "ok" }) : null);

  let plano = null;       // el que se está editando
  let guardado = "";      // el último guardado, para saber si hay cambios
  let torneos = [];       // los textos de los torneos de la sala
  let elegida = null;     // { fi, gi, mi }
  let listo = false;
  let salon = null;       // las medidas del salón y del material (js/plano-logistica.js)

  function el(tag, attrs, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "texto") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const h of hijos.flat()) if (h != null) n.append(h.nodeType ? h : document.createTextNode(String(h)));
    return n;
  }

  const hayCambios = () => plano && JSON.stringify(plano) !== guardado;

  /* ---------------- lo que se lee ---------------- */

  async function cargar() {
    $("pl-estado").textContent = "Cargando el plano…";
    const { data, error } = await window.sb.from("salas_torneo").select("plano, enlaces").eq("clave", SALA).maybeSingle();
    if (error || !data) { $("pl-estado").textContent = "No se pudo leer la sala. Revisa la conexión y vuelve a abrir la pestaña."; return; }
    // Los torneos son los enlaces de chess-results de la sala, con su texto.
    torneos = (Array.isArray(data.enlaces) ? data.enlaces : [])
      .filter((e) => e && /chess-results\.com\/tnr\d+/i.test(String(e.url || "")) && e.texto)
      .map((e) => String(e.texto));
    plano = P().limpiar(data.plano);
    guardado = plano ? JSON.stringify(plano) : "";
    salon = L().limpiarSalon(plano && plano.salon);
    ponerCampos();
    listo = true;
    pintar();
  }

  // Cuántos tableros usa cada torneo: los de la ronda emparejada o, antes de
  // la primera, la mitad de los inscritos (sala-jugadores, el clásico).
  async function tablerosPorTorneo() {
    const { data, error } = await window.sb.functions.invoke("sala-jugadores", { body: { clave: SALA, modalidad: "clasico" } });
    if (error || !data || !Array.isArray(data.torneos)) throw new Error("sin datos");
    const por = new Map();
    data.torneos.forEach((t) => {
      // El bye no ocupa tablero: solo cuentan las mesas con rival.
      const mesas = t.pareo && Array.isArray(t.pareo.mesas) ? t.pareo.mesas.filter((m) => m && m.negras).length : 0;
      const inscritos = Array.isArray(t.jugadores) ? Math.floor(t.jugadores.length / 2) : 0;
      por.set(t.texto, Math.max(mesas, inscritos));
    });
    return por;
  }

  async function armarBorrador() {
    if (plano && window.Avisos) {
      const sigue = await window.Avisos.confirmar("El plano que ves se reemplaza por uno nuevo, armado con los torneos y los inscritos de chess-results. Lo que corregiste y no guardaste se pierde; lo guardado sigue en la página hasta que guardes el nuevo.", { titulo: "Armar el borrador otra vez", aceptar: "Sí, armar el borrador" });
      if (!sigue) return;
    }
    $("pl-estado").textContent = "Leyendo los inscritos de chess-results…";
    let por;
    try { por = await tablerosPorTorneo(); } catch (e) { $("pl-estado").textContent = "No se pudieron leer los torneos de chess-results. Inténtalo de nuevo en un momento."; return; }
    const lista = ORDEN.filter((n) => por.has(n)).concat([...por.keys()].filter((n) => ORDEN.indexOf(n) === -1));
    salon = leerCampos();
    elegida = null;
    if (salon.usar) {
      // Con las medidas: las filas se parten donde se acaba el ancho del salón.
      const r = L().borrador(lista.map((n) => ({ torneo: n, tableros: por.get(n) || 2, dv: salon.dv[n] || 0 })), salon);
      if (!r) { $("pl-estado").textContent = "Con esas medidas no cabe ni una mesa a lo ancho. Revisa el largo y el ancho del salón."; return; }
      plano = P().limpiar(r.plano);
      pintar();
      if (r.sobran) avisar("El borrador está armado, pero " + r.sobran + (r.sobran === 1 ? " mesa queda" : " mesas quedan") + " en filas que ya no caben en el salón. Abajo dice cuánto falta.", true);
      return;
    }
    // La primera fila (Sub-18 Femenino) la contó el dueño mesa por mesa: va sin duda.
    plano = P().borrador(lista.map((n) => ({ torneo: n, tableros: por.get(n) || 2 })), lista[0] === ORDEN[0] ? [0] : []);
    ponerSalon();
    pintar();
  }

  /* ---------------- el dibujo y la mesa elegida ---------------- */

  function pintar() {
    const caja = $("pl-dibujo");
    if (!caja) return;
    $("pl-guardar").disabled = !plano;
    pintarDv();
    pintarLogistica();
    if (!plano) {
      caja.replaceChildren(el("p", { class: "font-semibold" }, "Todavía no hay plano. Arma el borrador con los torneos de la sala y corrígelo mesa por mesa."));
      $("pl-mesa").replaceChildren();
      $("pl-estado").textContent = "";
      return;
    }
    $("pl-frente").value = plano.frente;
    $("pl-fondo").value = plano.fondo;
    pintarDibujo();
    pintarMesa();
  }

  // Solo el dibujo y el estado: lo que cambia al escribir un número, sin
  // rehacer el formulario donde se está escribiendo.
  function pintarDibujo() {
    const caja = $("pl-dibujo");
    const svg = P().dibujar(plano, { editor: true, elegida, alTocar: (fi, gi, mi) => { elegida = { fi, gi, mi }; pintar(); const c = $("pl-derecha"); if (c) c.focus(); } });
    caja.replaceChildren(svg);
    pintarLogistica();
    const d = P().dudas(plano);
    $("pl-estado").textContent = (d ? "Faltan por revisar " + d + (d === 1 ? " mesa" : " mesas") + " (borde punteado y «?»). " : "Todas las mesas están revisadas. ")
      + (hayCambios() ? "Hay cambios sin guardar." : "Lo que ves es lo que está publicado.");
  }

  const mesaElegida = () => {
    if (!elegida || !plano) return null;
    const f = plano.filas[elegida.fi];
    const g = f && f.grupos[elegida.gi];
    const m = g && g.mesas[elegida.mi];
    return m ? { f, g, m } : null;
  };

  function pintarMesa() {
    const caja = $("pl-mesa");
    const x = mesaElegida();
    if (!x) {
      caja.replaceChildren(el("p", { class: "cam-herramientas-nota" }, "Toca una mesa del dibujo para corregirla."));
      return;
    }
    const k = P().mesasDeFila(x.f).findIndex((y) => y.m === x.m) + 1;
    const opciones = [...new Set(torneos.concat(x.g.torneo ? [x.g.torneo] : []))];
    const numeroCampo = (id, etiqueta, i) => el("div", {},
      el("label", { for: id, class: "block text-sm font-bold" }, etiqueta),
      el("input", { id, type: "number", oninput: (ev) => ev.target.dispatchEvent(new Event("change")), min: "1", max: "999", inputmode: "numeric", class: "cam-campo", value: x.m.t[i] || "",
        onchange: (ev) => { const n = parseInt(ev.target.value, 10); x.m.t[i] = Number.isInteger(n) && n > 0 && n < 1000 ? n : null; pintarDibujo(); } }));
    const boton = (texto, accion, peligro) => el("button", { type: "button", class: "cam-btn " + (peligro ? "cam-btn-rojo" : "cam-btn-claro") + " cam-btn-chico", onclick: accion }, texto);
    caja.replaceChildren(
      el("h4", { class: "font-bold text-lg" }, "Fila " + (elegida.fi + 1) + " · la " + k + ".ª mesa desde la derecha"),
      el("div", { class: "grid gap-3 sm:grid-cols-3 mt-2" },
        numeroCampo("pl-derecha", "Mesa de la derecha", 0),
        numeroCampo("pl-izquierda", "Mesa de la izquierda", 1),
        el("div", {},
          el("label", { for: "pl-torneo", class: "block text-sm font-bold" }, "Torneo de este grupo"),
          el("select", { id: "pl-torneo", class: "cam-select", onchange: (ev) => { x.g.torneo = ev.target.value; pintarDibujo(); } },
            opciones.map((o) => { const op = el("option", { value: o }, o); if (o === x.g.torneo) op.selected = true; return op; })))),
      el("label", { class: "mt-3 flex items-center gap-2 font-semibold" },
        el("input", { type: "checkbox", id: "pl-revisada", checked: !x.m.duda, onchange: (ev) => { x.m.duda = !ev.target.checked; pintarDibujo(); } }),
        "Ya la revisé en la sala"),
      el("p", { class: "cam-herramientas-nota mt-1" }, "Mirando hacia el fondo, «Mesa de la derecha» es el tablero del lado derecho de esa mesa."),
      el("div", { class: "mt-3 flex flex-wrap gap-2" },
        boton("Numerar seguido hacia la izquierda", numerarSeguido),
        boton("Marcar la fila como revisada", () => { x.f.grupos.forEach((g) => g.mesas.forEach((m) => { m.duda = false; })); pintar(); }),
        boton("Agregar una mesa a la izquierda", () => { x.g.mesas.splice(elegida.mi + 1, 0, { t: [null, null], duda: true }); elegida.mi += 1; pintar(); }),
        boton("Poner un pasillo a la izquierda", partirGrupo),
        boton("Juntar con el grupo de la izquierda", juntarGrupo),
        boton("Agregar una fila al fondo", () => { plano.filas.push({ grupos: [{ torneo: x.g.torneo, mesas: [{ t: [null, null], duda: true }] }] }); elegida = { fi: plano.filas.length - 1, gi: 0, mi: 0 }; pintar(); }),
        boton("Quitar esta mesa", quitarMesa, true),
        boton("Quitar esta fila", quitarFila, true)));
  }

  // Desde la mesa elegida hacia la izquierda, las del mismo torneo de la fila
  // siguen la numeración: si esta es «1 2», la siguiente queda «3 4».
  function numerarSeguido() {
    const x = mesaElegida();
    if (!x) return;
    let n = x.m.t[1] || x.m.t[0];
    if (!n) { avisar("Primero pon el número de esta mesa.", true); return; }
    const todas = P().mesasDeFila(x.f);
    const desde = todas.findIndex((y) => y.m === x.m);
    todas.slice(desde + 1).filter((y) => y.g.torneo === x.g.torneo).forEach((y) => { y.m.t = [n + 1, n + 2]; n += 2; });
    pintar();
  }

  function partirGrupo() {
    const x = mesaElegida();
    if (!x || elegida.mi === x.g.mesas.length - 1) { avisar("A la izquierda de esta mesa ya hay un pasillo.", true); return; }
    const resto = x.g.mesas.splice(elegida.mi + 1);
    x.f.grupos.splice(elegida.gi + 1, 0, { torneo: x.g.torneo, mesas: resto });
    pintar();
  }

  function juntarGrupo() {
    const x = mesaElegida();
    const otro = x && x.f.grupos[elegida.gi + 1];
    if (!otro) { avisar("A la izquierda de este grupo no hay otro.", true); return; }
    x.g.mesas.push(...otro.mesas);
    x.f.grupos.splice(elegida.gi + 1, 1);
    pintar();
  }

  function quitarMesa() {
    const x = mesaElegida();
    if (!x) return;
    x.g.mesas.splice(elegida.mi, 1);
    if (!x.g.mesas.length) x.f.grupos.splice(elegida.gi, 1);
    elegida = null;
    pintar();
  }

  async function quitarFila() {
    if (!elegida) return;
    if (window.Avisos) {
      const sigue = await window.Avisos.confirmar("Se quita la fila " + (elegida.fi + 1) + " con todas sus mesas. Las filas de más atrás bajan un número.", { titulo: "Quitar la fila", aceptar: "Sí, quitar la fila", peligro: true });
      if (!sigue) return;
    }
    plano.filas.splice(elegida.fi, 1);
    elegida = null;
    pintar();
  }

  /* ---------------- las medidas del salón y el material ---------------- */

  // Las medidas viajan con el plano solo si se tocaron: un plano sin medidas
  // queda como estaba.
  const salonTocado = (s) => !!(s && (s.largo || s.ancho || s.usar || Object.keys(s.dv).length
    || JSON.stringify({ ...s, dv: {} }) !== JSON.stringify(L().limpiarSalon({}))));
  function ponerSalon() {
    if (!plano) return;
    if (salonTocado(salon)) plano.salon = salon; else delete plano.salon;
  }

  function leerCampos() {
    const o = {};
    document.querySelectorAll("#pl-salon-caja [data-salon]").forEach((c) => { o[c.dataset.salon] = c.value === "" ? 0 : c.value; });
    o.separar = $("pl-s-separar").checked;
    o.usar = $("pl-s-usar").checked;
    o.dv = {};
    document.querySelectorAll("#pl-s-dv [data-torneo]").forEach((c) => { o.dv[c.dataset.torneo] = c.value; });
    // Los de torneos que ya no están en la sala no se pierden.
    Object.keys((salon && salon.dv) || {}).forEach((k) => { if (!(k in o.dv)) o.dv[k] = salon.dv[k]; });
    return L().limpiarSalon(o);
  }

  function ponerCampos() {
    const s = salon || L().limpiarSalon({});
    document.querySelectorAll("#pl-salon-caja [data-salon]").forEach((c) => { const v = s[c.dataset.salon]; c.value = v ? String(v) : (c.dataset.salon === "largo" || c.dataset.salon === "ancho" ? "" : "0"); });
    $("pl-s-separar").checked = s.separar;
    $("pl-s-usar").checked = s.usar;
    if (s.largo || s.ancho || s.usar) $("pl-salon-caja").open = true;
    pintarDv(true);
  }

  // Un campo por torneo de la sala para los jugadores con discapacidad visual.
  function pintarDv(forzar) {
    const caja = $("pl-s-dv");
    if (!caja) return;
    const nombres = [...new Set(torneos.concat(Object.keys((salon && salon.dv) || {})))];
    const ya = [...caja.querySelectorAll("[data-torneo]")].map((c) => c.dataset.torneo);
    if (!forzar && JSON.stringify(ya) === JSON.stringify(nombres)) return;
    if (!nombres.length) { caja.replaceChildren(el("p", { class: "cam-herramientas-nota" }, "La sala todavía no tiene torneos.")); return; }
    caja.replaceChildren(...nombres.map((n, i) => el("div", {},
      el("label", { for: "pl-s-dv-" + i, class: "block text-sm font-bold" }, n),
      el("input", { id: "pl-s-dv-" + i, "data-torneo": n, type: "number", min: "0", step: "1", inputmode: "numeric", class: "cam-campo", value: String((salon && salon.dv[n]) || 0),
        oninput: alCambiarSalon }))));
  }

  function alCambiarSalon() {
    salon = leerCampos();
    ponerSalon();
    if (plano) pintarDibujo(); else pintarLogistica();
  }

  const metros = (n) => n.toLocaleString("es-CR", { maximumFractionDigits: 2 }) + " m";

  function pintarLogistica() {
    const caja = $("pl-log-contenido");
    if (!caja) return;
    if (!plano) { caja.replaceChildren(el("p", { class: "cam-herramientas-nota" }, "Cuando haya plano, aquí sale si cabe en el salón y el material que hay que llevar.")); return; }
    const s = salon || L().limpiarSalon({});
    const inv = L().inventario(plano, s);
    const m = L().medir(plano, s);
    let cabe;
    if (!m) cabe = el("p", { class: "font-semibold" }, "Pon el largo y el ancho del salón (en «Medidas del salón y material») para saber si el plano cabe.");
    else if (m.cabe) cabe = el("p", { id: "pl-log-cabe", class: "font-semibold", "data-cabe": "si" },
      "✓ Cabe en el salón. La fila más ancha mide " + metros(m.anchoMax) + " de " + metros(m.anchoUtil) + " útiles, y las " + m.filas + " filas ocupan " + metros(m.fondo) + " de " + metros(m.fondoUtil) + " de fondo. Con estas medidas caben " + m.capacidad + " mesas; el plano usa " + m.mesas + " (" + m.ocupacion + " %).");
    else {
      const por = [];
      if (m.filasAnchas.length) por.push((m.filasAnchas.length === 1 ? "la fila " : "las filas ") + m.filasAnchas.join(", ") + " se " + (m.filasAnchas.length === 1 ? "sale" : "salen") + " por los lados (el ancho útil es de " + metros(m.anchoUtil) + ")");
      if (m.fondo > m.fondoUtil) por.push("las " + m.filas + " filas ocupan " + metros(m.fondo) + " de fondo y hay " + metros(m.fondoUtil) + " (caben " + m.filasQueCaben + " filas)");
      cabe = el("p", { id: "pl-log-cabe", class: "font-semibold", "data-cabe": "no" }, "✗ No cabe en el salón: " + por.join("; ") + ". Prueba con más mesas por tramo, pasillos más angostos o sin empezar cada torneo en fila nueva.");
    }
    const fila = (a, b) => el("tr", {}, el("td", { texto: a }), el("td", { class: "text-right", texto: String(b) }));
    const material = [
      ["Mesas de juego (180 × 74 cm)", inv.mesas],
      ["Mesas de apoyo (principal, árbitros, registro)", inv.mesasApoyo],
      ["Sillas", inv.sillas],
      ["Tableros", inv.tableros],
      ["Juegos de piezas", inv.piezas],
      ["Relojes", inv.relojes],
    ].concat(inv.adaptados ? [["Tableros adaptados", inv.adaptados], ["Relojes parlantes", inv.parlantes]] : [])
      .concat([["Planillas (" + s.rondas + (s.rondas === 1 ? " ronda" : " rondas") + ")", inv.planillas]]);
    const tablaMaterial = el("table", { class: "cam-tabla cam-rejilla", id: "pl-log-material" },
      el("caption", { class: "sr-only" }, "Material que hay que llevar"),
      el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "Material"), el("th", { scope: "col", class: "text-right" }, "Cantidad"))),
      el("tbody", {}, material.map(([a, b]) => fila(a, b))));
    const tablaArbitros = el("table", { class: "cam-tabla cam-rejilla", id: "pl-log-arbitros" },
      el("caption", { class: "sr-only" }, "Árbitros que hacen falta por torneo"),
      el("thead", {}, el("tr", {}, ["Torneo", "Partidas", "Mesas", "Con discapacidad visual", "Árbitros de sector"].map((t, i) => el("th", { scope: "col", class: i ? "text-right" : "" }, t)))),
      el("tbody", {}, inv.torneos.map((r) => el("tr", {}, el("td", { texto: r.torneo || "Sin torneo" }),
        ...[r.partidas, r.mesas, r.dv, r.arbitros].map((v) => el("td", { class: "text-right", texto: String(v) }))))));
    const a = inv.arbitros;
    caja.replaceChildren(
      cabe,
      el("div", { class: "mt-3 grid gap-4 sm:grid-cols-2" },
        el("div", { class: "cam-tabla-envoltura" }, tablaMaterial),
        el("div", { class: "cam-tabla-envoltura" }, tablaArbitros)),
      el("p", { id: "pl-log-equipo", class: "font-semibold mt-3" }, a.total ? "Equipo arbitral: " + a.total + " árbitros (principal" + (a.adjunto ? ", adjunto" : "") + " y " + a.sector + " de sector, a " + s.porArbitro + " partidas por árbitro)." : "Sin partidas en el plano, no hacen falta árbitros."),
      el("p", { class: "cam-herramientas-nota mt-1" }, "Se cuenta con las mesas del plano que ves (también lo corregido sin guardar). Los tableros, las piezas, los relojes y las planillas ya traen " + s.reserva + " % de reserva. Las sillas son dos por partida, más el equipo arbitral y las de más. Quién va a cada zona lo decide «Los árbitros en la sala», abajo."));
  }

  /* ---------------- guardar ---------------- */

  async function guardar() {
    if (!plano) return;
    plano.frente = $("pl-frente").value;
    plano.fondo = $("pl-fondo").value;
    salon = leerCampos();
    ponerSalon();
    const limpio = P().limpiar(plano);
    const malos = P().problemas(limpio);
    if (malos.length) { avisar(malos.slice(0, 3).join(" "), true); return; }
    const boton = $("pl-guardar");
    boton.disabled = true;
    const { error } = await window.sb.rpc("sala_plano_guardar", { p_clave: SALA, p_plano: limpio });
    boton.disabled = false;
    if (error) { avisar("No se guardó el plano: " + (error.message || "inténtalo de nuevo."), true); return; }
    plano = limpio;
    guardado = JSON.stringify(plano);
    avisar("Plano guardado: ya lo ven las familias en la página del torneo.");
    pintar();
  }

  function iniciar() {
    if (!$("panel-plano")) return;
    $("pl-guardar").addEventListener("click", guardar);
    $("pl-borrador").addEventListener("click", armarBorrador);
    document.querySelectorAll("#pl-salon-caja [data-salon], #pl-s-separar, #pl-s-usar").forEach((c) => c.addEventListener("input", alCambiarSalon));
    for (const id of ["pl-frente", "pl-fondo"]) $(id).addEventListener("change", () => { if (plano) { plano[id === "pl-frente" ? "frente" : "fondo"] = $(id).value; pintar(); } });
    // Se lee al abrir la pestaña por primera vez.
    new MutationObserver(() => { if (!$("panel-plano").hidden && !listo) cargar(); }).observe($("panel-plano"), { attributes: true, attributeFilter: ["hidden"] });
    if (!$("panel-plano").hidden) cargar();
    window.addEventListener("beforeunload", (ev) => { if (hayCambios()) { ev.preventDefault(); ev.returnValue = ""; } });
  }
  iniciar();
  window.CentroamericanoPlanoEditor = { cargar, armarBorrador, guardar, tablerosPorTorneo, estado: () => ({ plano, elegida, hayCambios: hayCambios(), listo, salon }) };
})();

/*! rev bfb5bbb0d2d82f9f */
