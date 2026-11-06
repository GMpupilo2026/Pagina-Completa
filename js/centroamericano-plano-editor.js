/* «Plano de la sala» en centroamericano-mesas.html: la organización corrige el
 * plano de la sala de juego que ven las familias (js/centroamericano-plano.js).
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
  const avisar = (texto, error) => (window.Avisos ? window.Avisos.avisar(texto, { tipo: error ? "error" : "ok" }) : null);

  let plano = null;       // el que se está editando
  let guardado = "";      // el último guardado, para saber si hay cambios
  let torneos = [];       // los textos de los torneos de la sala
  let elegida = null;     // { fi, gi, mi }
  let listo = false;

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
    // La primera fila (Sub-18 Femenino) la contó el dueño mesa por mesa: va sin duda.
    plano = P().borrador(lista.map((n) => ({ torneo: n, tableros: por.get(n) || 2 })), lista[0] === ORDEN[0] ? [0] : []);
    elegida = null;
    pintar();
  }

  /* ---------------- el dibujo y la mesa elegida ---------------- */

  function pintar() {
    const caja = $("pl-dibujo");
    if (!caja) return;
    $("pl-guardar").disabled = !plano;
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

  /* ---------------- guardar ---------------- */

  async function guardar() {
    if (!plano) return;
    plano.frente = $("pl-frente").value;
    plano.fondo = $("pl-fondo").value;
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
    for (const id of ["pl-frente", "pl-fondo"]) $(id).addEventListener("change", () => { if (plano) { plano[id === "pl-frente" ? "frente" : "fondo"] = $(id).value; pintar(); } });
    // Se lee al abrir la pestaña por primera vez.
    new MutationObserver(() => { if (!$("panel-plano").hidden && !listo) cargar(); }).observe($("panel-plano"), { attributes: true, attributeFilter: ["hidden"] });
    if (!$("panel-plano").hidden) cargar();
    window.addEventListener("beforeunload", (ev) => { if (hayCambios()) { ev.preventDefault(); ev.returnValue = ""; } });
  }
  iniciar();
  window.CentroamericanoPlanoEditor = { cargar, armarBorrador, guardar, estado: () => ({ plano, elegida, hayCambios: hayCambios() }) };
})();

/*! rev bfb5bbb0d2d82f9f */
