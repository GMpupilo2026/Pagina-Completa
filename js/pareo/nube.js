/* ===== Pareo Integral — los torneos guardados en la cuenta =====
 *
 * Cada torneo vive en el navegador (localStorage, ver js/pareo/pagina.js). Con
 * «Guardar mis torneos en mi cuenta» activado, además se guarda en la base
 * (public.pareo_nube_torneos), y al entrar con la misma cuenta en otra
 * computadora se bajan solos. Es opcional y pide consentimiento: los torneos
 * traen nombres y fechas de nacimiento de menores (ver «Pareo Integral: los
 * torneos en la cuenta» en docs/decisiones/juegos-y-torneos.md).
 *
 * Cómo se reparte el trabajo:
 *  - pagina.js avisa cada vez que escribe o quita un torneo (cambio(id),
 *    borrado(id)); acá se anota como «por subir» y se sube unos segundos
 *    después, todo junto. Sin internet queda anotado y se sube al volver.
 *  - Al abrir la página, al volver a la pestaña y al recuperar la conexión se
 *    compara la lista de la cuenta con la del navegador: lo que la cuenta
 *    tiene más nuevo se baja, lo del navegador más nuevo se sube y lo quitado
 *    en otra computadora se quita acá.
 *  - Cada torneo lleva su `version`. Si otra computadora guardó antes, la base
 *    no pisa nada (contesta `conflicto`): la versión de la cuenta queda como el
 *    torneo y lo de esta computadora se guarda como COPIA con otro nombre.
 *    Nunca se pierde lo anotado.
 *  - Este navegador queda unido a UNA cuenta (`cuenta` en META): si entra
 *    otra, no se le suben los torneos de la primera.
 *
 * Lo guardado en el navegador para esto (META, pareo_nube_v1):
 *   { cuenta, ver: {id: versión en la cuenta}, sucio: {id: 1} (por subir),
 *     borrar: {id: 1} (por quitar en la cuenta), excluidos: [ids que se
 *     quedan solo en este navegador] }
 * Se vuelve a leer en cada paso: dos pestañas abiertas lo comparten.
 *
 * Sin window.sb con auth y rpc (un verificador con su doble de Realtime, la
 * página sin conexión al abrir) no hace nada: Pareo sigue como siempre.
 */
window.PareoNube = (function () {
  "use strict";

  const META = "pareo_nube_v1";
  const ESPERA_SUBIR = 3000;
  const ESPERA_REVISAR = 20000;
  const TANDA = 10;

  let cfg = null;
  let sb = null;
  let uid = "";
  let activa = false;
  let estadoTexto = "";
  let alDiaEn = 0;
  let temporizador = null;
  let reintento = null;
  let revisadoEn = 0;
  let ocupado = Promise.resolve();
  let vueltas = 0;

  // ---------- Lo guardado en el navegador ----------
  function leerMeta() {
    let m = null;
    try { m = JSON.parse(localStorage.getItem(META)); } catch (e) { m = null; }
    if (!m || typeof m !== "object") m = {};
    return { cuenta: m.cuenta || "", ver: m.ver || {}, sucio: m.sucio || {}, borrar: m.borrar || {}, excluidos: Array.isArray(m.excluidos) ? m.excluidos : [] };
  }
  function guardarMeta(m) { try { localStorage.setItem(META, JSON.stringify(m)); } catch (e) { /* sin almacenamiento */ } }
  function cambiarMeta(f) { const m = leerMeta(); f(m); guardarMeta(m); return m; }

  const tx = (k, v) => (cfg ? cfg.tx(k, v) : k);
  const $ = (id) => document.getElementById(id);

  // Un torneo recién creado, sin nombre ni jugadores, no se sube: cada
  // computadora nueva arranca con uno así y llenaría la cuenta de vacíos.
  function vacio(t) { return !t || (!t.nombre && !(t.jugadores || []).length && !(t.rondas || []).length); }

  // JSON con las claves en orden: la base (jsonb) las reordena, y dos copias
  // iguales tienen que dar igual.
  function canon(x) {
    if (Array.isArray(x)) return "[" + x.map(canon).join(",") + "]";
    if (x && typeof x === "object") return "{" + Object.keys(x).sort().filter((k) => x[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canon(x[k])).join(",") + "}";
    return JSON.stringify(x === undefined ? null : x);
  }

  // Un solo trabajo a la vez (también entre pestañas, donde se puede).
  function enFila(f) {
    const correr = () => (navigator.locks && navigator.locks.request ? navigator.locks.request("pareo-nube", f) : f());
    ocupado = ocupado.then(correr, correr);
    return ocupado;
  }

  async function rpc(nombre, args) {
    const r = await sb.rpc(nombre, args || {});
    if (r && r.error) throw Object.assign(new Error(r.error.message || String(r.error)), { deBase: true });
    return r ? r.data : null;
  }

  // ---------- Lo que avisa pagina.js ----------
  function cambio(id) {
    const m = leerMeta();
    if (!m.cuenta || m.excluidos.includes(id)) return;
    m.sucio[id] = 1;
    delete m.borrar[id];
    guardarMeta(m);
    programar();
  }
  function borrado(id) {
    const m = leerMeta();
    if (!m.cuenta || m.excluidos.includes(id)) return;
    delete m.sucio[id];
    if (m.ver[id]) m.borrar[id] = 1;
    guardarMeta(m);
    programar();
  }
  function programar() {
    if (!activa) { pintar(); return; }
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { enFila(subir); }, ESPERA_SUBIR);
    pintar();
  }

  // ---------- Subir ----------
  async function subir() {
    if (!activa) return;
    let m = leerMeta();
    if (m.cuenta !== uid) return;
    const pendientes = Object.keys(m.borrar).length + Object.keys(m.sucio).length;
    if (!pendientes) { ponerEstado("alDia"); return; }
    ponerEstado("guardando");
    try {
      for (const id of Object.keys(m.borrar)) {
        const r = await rpc("pareo_nube_borrar", { p_id: id, p_version: m.ver[id] || 0 });
        cambiarMeta((x) => {
          delete x.borrar[id];
          if (r && r.ok) x.ver[id] = r.version; // si otra computadora lo cambió después, al revisar vuelve
        });
      }
      let conflicto = false;
      m = leerMeta();
      for (const id of Object.keys(m.sucio)) {
        const texto = cfg.local.texto(id);
        const t = texto ? JSON.parse(texto) : null;
        if (!t || (vacio(t) && !m.ver[id])) { cambiarMeta((x) => { delete x.sucio[id]; }); continue; }
        const r = await rpc("pareo_nube_guardar", {
          p_id: id, p_nombre: t.nombre || "", p_evento: t.evento ? { id: t.evento.id, nombre: t.evento.nombre || "" } : null,
          p_datos: t, p_version: leerMeta().ver[id] || 0,
        });
        if (r && r.conflicto) { conflicto = true; continue; }
        cambiarMeta((x) => {
          x.ver[id] = r.version;
          // Si se anotó algo mientras subía, queda por subir.
          if (cfg.local.texto(id) === texto) delete x.sucio[id];
        });
      }
      if (conflicto) {
        // Una vuelta para traer lo de la otra computadora; si en esa vuelta
        // vuelve a chocar, se espera a la próxima revisión.
        if (vueltas < 2) { vueltas += 1; try { await revisarAhora(); } finally { vueltas -= 1; } }
        return;
      }
      if (Object.keys(leerMeta().sucio).length) programar();
      else { alDiaEn = Date.now(); ponerEstado("alDia"); }
    } catch (e) {
      falla(e);
    }
  }

  function falla(e) {
    ponerEstado(e && e.deBase ? "error" : "sinRed", e && e.message);
    clearTimeout(reintento);
    reintento = setTimeout(() => { revisar(true); }, 60000);
  }

  // ---------- Comparar con la cuenta ----------
  function revisar(forzar) {
    if (!activa) return Promise.resolve();
    if (!forzar && Date.now() - revisadoEn < ESPERA_REVISAR) return Promise.resolve();
    return enFila(revisarAhora);
  }

  async function revisarAhora() {
    if (!activa) return;
    revisadoEn = Date.now();
    ponerEstado("revisando");
    const cambios = { traidos: [], quitados: [], copias: [] };
    try {
      const lista = (await rpc("pareo_nube_lista")) || [];
      const remotos = new Map(lista.map((r) => [r.id, r]));
      const locales = new Set(cfg.local.ids());
      const bajar = [];
      let m = leerMeta();
      if (m.cuenta !== uid) return;
      for (const r of lista) {
        if (m.excluidos.includes(r.id)) continue;
        const aqui = locales.has(r.id);
        const conocida = m.ver[r.id] || 0;
        if (r.borrado) {
          if (aqui && m.sucio[r.id]) { cambiarMeta((x) => { x.ver[r.id] = r.version; }); continue; } // se cambió aquí: vuelve a la cuenta
          if (aqui && r.version !== conocida) { cfg.local.sacar(r.id); cambios.quitados.push(r.id); }
          cambiarMeta((x) => { x.ver[r.id] = r.version; delete x.sucio[r.id]; delete x.borrar[r.id]; });
          continue;
        }
        if (!aqui) {
          if (m.borrar[r.id] && r.version === conocida) continue; // quitado aquí, falta avisar
          bajar.push(r.id);
          continue;
        }
        if (r.version !== conocida) bajar.push(r.id);
      }
      // Lo que hay aquí y no en la cuenta: se sube (si ya estaba y desapareció,
      // es que se borraron las copias de la cuenta: va como nuevo).
      for (const id of locales) {
        if (remotos.has(id) || m.excluidos.includes(id)) continue;
        cambiarMeta((x) => { delete x.ver[id]; x.sucio[id] = 1; });
      }
      for (let i = 0; i < bajar.length; i += TANDA) {
        const trozo = (await rpc("pareo_nube_traer", { p_ids: bajar.slice(i, i + TANDA) })) || [];
        for (const r of trozo) {
          if (r.borrado || !r.datos) continue;
          m = leerMeta();
          const texto = cfg.local.texto(r.id);
          if (texto && m.sucio[r.id]) {
            // Cambiado aquí y en otra computadora. Si son iguales, nada que
            // hacer; si no, lo de aquí queda como copia.
            if (canon(JSON.parse(texto)) !== canon(r.datos)) {
              const nuevo = cfg.local.copia(JSON.parse(texto));
              if (nuevo) { cambios.copias.push(nuevo); cambiarMeta((x) => { x.sucio[nuevo] = 1; }); }
              cfg.local.poner(r.id, r.datos, r);
              cambios.traidos.push(r.id);
            }
          } else {
            cfg.local.poner(r.id, r.datos, r);
            cambios.traidos.push(r.id);
          }
          cambiarMeta((x) => { x.ver[r.id] = r.version; delete x.sucio[r.id]; delete x.borrar[r.id]; });
        }
      }
      if (cambios.traidos.length || cambios.quitados.length || cambios.copias.length) cfg.alTraer(cambios);
      await subir();
      if (estadoTexto === "revisando") { alDiaEn = Date.now(); ponerEstado("alDia"); }
    } catch (e) {
      falla(e);
    }
  }

  // ---------- Unir este navegador a la cuenta ----------
  // `todos`: al activarlo aquí, se sube todo sin preguntar. Al entrar en otra
  // computadora que ya tenía torneos, se pregunta: pueden ser de otra persona.
  async function unir(todos) {
    const propios = cfg.local.ids().filter((id) => { const s = cfg.local.texto(id); return s && !vacio(JSON.parse(s)); });
    let subirLos = todos;
    if (!todos && propios.length) {
      subirLos = await Avisos.confirmar(tx("nubePreguntaLocales", { n: propios.length }),
        { titulo: tx("nubePreguntaTitulo"), aceptar: tx("nubeSubirLocales"), cancelar: tx("nubeDejarLocales") });
    }
    const sucio = {};
    if (subirLos) for (const id of propios) sucio[id] = 1;
    guardarMeta({ cuenta: uid, ver: {}, sucio, borrar: {}, excluidos: subirLos ? [] : propios });
  }

  // ---------- Activar y apagar ----------
  async function activar(consiente) {
    if (!consiente) { Avisos.avisar(tx("nubeFaltaConsentimiento"), { tipo: "error" }); return; }
    try {
      await rpc("pareo_nube_activar");
    } catch (e) {
      Avisos.avisar(tx("nubeNoActiva", { e: e.message }), { tipo: "error" });
      return;
    }
    const m = leerMeta();
    if (m.cuenta !== uid) await unir(true);
    activa = true;
    abierto = false;
    Avisos.avisar(tx("nubeActivada"));
    await revisar(true);
  }

  async function apagar() {
    const si = await Avisos.confirmar(tx("nubeApagarPregunta"), { titulo: tx("nubeApagarTitulo"), aceptar: tx("nubeApagarSi"), cancelar: tx("nubeApagarNo") });
    if (!si) return;
    const borrar = await Avisos.confirmar(tx("nubeBorrarPregunta"), { titulo: tx("nubeBorrarTitulo"), aceptar: tx("nubeBorrarSi"), cancelar: tx("nubeBorrarNo"), peligro: true });
    try {
      await rpc("pareo_nube_apagar", { p_borrar: !!borrar });
    } catch (e) {
      Avisos.avisar(tx("nubeNoApaga", { e: e.message }), { tipo: "error" });
      return;
    }
    activa = false;
    clearTimeout(temporizador);
    // Se queda la versión que este navegador conocía de cada torneo: si se
    // vuelve a activar aquí, lo cambiado mientras tanto sube sin chocar.
    if (borrar) cambiarMeta((x) => { x.ver = {}; x.borrar = {}; });
    Avisos.avisar(tx(borrar ? "nubeApagadaBorrada" : "nubeApagada"));
    pintar();
  }

  // ---------- Lo que se ve ----------
  let abierto = false;
  let otraCuenta = false;
  function ponerEstado(e, detalle) { estadoTexto = e; ultimoDetalle = detalle || ""; pintar(); }
  let ultimoDetalle = "";

  function el(tag, attrs, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "texto") n.textContent = v;
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const h of hijos.flat()) if (h != null) n.append(h.nodeType ? h : document.createTextNode(String(h)));
    return n;
  }

  function textoEstado() {
    const m = leerMeta();
    const n = Object.keys(m.sucio).length + Object.keys(m.borrar).length;
    if (estadoTexto === "guardando") return tx("nubeGuardando");
    if (estadoTexto === "revisando") return tx("nubeRevisando");
    if (estadoTexto === "sinRed") return n ? tx("nubeSinRedPendientes", { n }) : tx("nubeSinRed");
    if (estadoTexto === "error") return tx("nubeError", { e: ultimoDetalle });
    if (n) return tx("nubePendientes", { n });
    return alDiaEn ? tx("nubeAlDia", { h: cfg.hora(alDiaEn) }) : tx("nubeAlDiaSinHora");
  }

  function pintar() {
    const caja = $("pi-nube");
    if (!caja || !cfg) return;
    const privado = document.querySelector('[data-t="privado"]');
    const C = cfg.clases;
    if (!uid) { caja.hidden = true; if (privado) privado.hidden = false; return; }
    caja.hidden = false;
    if (privado) privado.hidden = activa;
    if (otraCuenta) {
      const usar = el("button", { type: "button", id: "pi-nube-usar", class: C.mini }, tx("nubeUsarEsta"));
      usar.addEventListener("click", async () => { await unir(false); otraCuenta = false; activa = true; await revisar(true); });
      caja.replaceChildren(el("p", { class: "text-sm", texto: tx("nubeOtraCuenta") }), el("div", { class: "mt-2" }, usar));
      return;
    }
    if (activa) {
      const boton = el("button", { type: "button", id: "pi-nube-apagar", class: C.mini }, tx("nubeApagarBoton"));
      boton.addEventListener("click", apagar);
      const ahora = el("button", { type: "button", id: "pi-nube-ahora", class: C.mini }, tx("nubeRevisarAhora"));
      ahora.addEventListener("click", () => revisar(true));
      caja.replaceChildren(
        el("p", { class: "text-sm font-semibold", texto: tx("nubeActivaTitulo") }),
        el("p", { id: "pi-nube-estado", class: "text-xs text-brand-600 dark:text-brand-300 mt-1", role: "status", "data-estado": estadoTexto || "alDia", texto: textoEstado() }),
        el("div", { class: "mt-2 flex flex-wrap gap-2" }, ahora, boton));
      return;
    }
    // Apagada: el botón que despliega la explicación y el consentimiento.
    const abrir = el("button", { type: "button", id: "pi-nube-abrir", class: C.mini, "aria-expanded": abierto ? "true" : "false", "aria-controls": "pi-nube-caja" }, tx("nubeAbrirBoton"));
    abrir.addEventListener("click", () => { abierto = !abierto; pintar(); if (abierto) { const c = $("pi-nube-acepto"); if (c) c.focus(); } });
    const partes = [el("p", { class: "text-sm", texto: tx("nubeApagadaTexto") }), el("div", { class: "mt-2" }, abrir)];
    if (abierto) {
      const casilla = el("input", { type: "checkbox", id: "pi-nube-acepto", class: "mt-1" });
      const enlace = el("a", { href: "privacidad.html", class: "underline font-semibold", target: "_blank", rel: "noopener" }, tx("nubePrivacidad"));
      const activarB = el("button", { type: "button", id: "pi-nube-activar", class: C.boton }, tx("nubeActivarBoton"));
      activarB.addEventListener("click", () => activar(casilla.checked));
      partes.push(el("div", { id: "pi-nube-caja", class: "mt-3 rounded-xl border border-brand-200 dark:border-brand-700 p-4" },
        el("p", { class: "text-sm", texto: tx("nubeExplica") }),
        el("label", { for: "pi-nube-acepto", class: "mt-3 flex items-start gap-2 text-sm" }, casilla,
          el("span", {}, tx("nubeAcepto"), " ", enlace, ".")),
        el("div", { class: "mt-3" }, activarB)));
    }
    caja.replaceChildren(...partes);
  }

  // ---------- Arrancar ----------
  async function iniciar(opciones) {
    cfg = opciones;
    const candado = window.CandadoHerramienta;
    if (candado && candado.listo) { try { if (!(await candado.listo)) return; } catch (e) { return; } }
    sb = window.sb;
    if (!sb || !sb.auth || typeof sb.rpc !== "function") return;
    let sesion = null;
    try { const r = await sb.auth.getSession(); sesion = r && r.data && r.data.session; } catch (e) { sesion = null; }
    uid = (sesion && sesion.user && sesion.user.id) || "";
    if (!uid) return;
    const m = leerMeta();
    let estadoCuenta;
    try { estadoCuenta = await rpc("pareo_nube_estado"); } catch (e) {
      // Sin conexión al abrir: si este navegador ya guardaba en esta cuenta,
      // lo anotado se sube cuando vuelva.
      if (m.cuenta === uid) { activa = true; ponerEstado("sinRed"); }
      else uid = "";
      pintar();
      window.addEventListener("online", reiniciar, { once: true });
      return;
    }
    if (!(estadoCuenta && estadoCuenta.activa)) {
      // Apagado (aquí o en otra computadora): lo que se cambie queda anotado
      // y sube si se vuelve a activar.
      activa = false;
      pintar();
      return;
    }
    if (m.cuenta && m.cuenta !== uid) { otraCuenta = true; pintar(); return; }
    if (!m.cuenta) await unir(false);
    activa = true;
    pintar();
    await revisar(true);
  }
  let enganchado = false;
  function reiniciar() { if (cfg) { activa = false; iniciar(cfg); } }

  function enganchar() {
    if (enganchado) return;
    enganchado = true;
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") revisar(false); });
    window.addEventListener("online", () => { if (activa) revisar(true); });
  }

  return {
    iniciar(o) { enganchar(); return iniciar(o); },
    cambio,
    borrado,
    revisar,
    pintar,
    // Para el verificador.
    get estado() { return { activa, uid, estado: estadoTexto, otraCuenta }; },
    _canon: canon,
  };
})();


/*! rev bfb5bbb0d2d82f9f */
