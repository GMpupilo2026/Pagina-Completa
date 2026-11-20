/* ===== Pareo Integral — la ronda y los resultados en el proyector =====
 *
 * Desde Rondas («Proyectar») o Clasificación («Proyectar la clasificación»)
 * se abre a pantalla completa, para la pantalla grande de la sala: el
 * nombre del torneo, la ronda, cuántos resultados van (con su barra) y las
 * mesas en tarjetas grandes; o la clasificación. Si no caben, pasa de página
 * sola cada 12 segundos. Se pone al día sola: cada resultado que se anota
 * (en esta computadora o desde el celular de un adjunto) llega al proyector
 * al guardarse (pagina.js llama a actualizar() desde guardar()).
 *
 * Este archivo solo pinta lo que le pasan: el modelo (las mesas y la
 * clasificación, ya con los nombres y los puntos escritos) y los textos los
 * arma js/pareo/pagina.js (modeloProyector), así que aquí no se calcula nada
 * del torneo. Todo lo que escribe una persona entra por textContent.
 *
 * Teclado: flechas (página), Espacio (pausa), C (ronda / clasificación),
 * Escape (salir; el foco vuelve al botón que lo abrió). Ver «Proyectar la
 * ronda y los resultados» en docs/decisiones/juegos-y-torneos.md.
 */
window.PareoProyectar = (function () {
  "use strict";

  const SEGUNDOS = 12;
  // Filas por columna: con la letra en vh, nueve filas llenan la pantalla
  // de cualquier proyector sin cortar ninguna.
  const FILAS = 9;
  const est = { caja: null, modelo: null, textos: {}, vista: "ronda", pagina: 0, pausa: false, timer: null, reloj: null, volver: null, pedido: null };

  function el(tag, attrs, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "texto") n.textContent = v;
      // Por el CSSOM, no por el atributo: la CSP no deja estilos escritos en el HTML.
      else if (k === "style") n.style.cssText = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const h of hijos.flat()) if (h != null) n.append(h.nodeType ? h : document.createTextNode(String(h)));
    return n;
  }
  const T = (k, vars) => {
    let s = (est.textos && est.textos[k]) || k;
    for (const [a, b] of Object.entries(vars || {})) s = s.split("{" + a + "}").join(String(b));
    return s;
  };

  const columnas = () => (window.innerWidth >= 1000 ? 2 : 1);
  const porPagina = () => columnas() * FILAS;
  function elementos() {
    const m = est.modelo;
    if (est.vista === "clasificacion") return m.clasificacion || [];
    return m.mesas || [];
  }
  const paginas = () => Math.max(1, Math.ceil(elementos().length / porPagina()));

  function horaCR() {
    return new Intl.DateTimeFormat("es-CR", { hour: "numeric", minute: "2-digit", timeZone: "America/Costa_Rica" }).format(new Date());
  }

  function tarjetaMesa(x) {
    if (!x.n) {
      return el("li", { class: "pi-py-mesa pi-py-bye" },
        el("span", { class: "pi-py-num", texto: String(x.mesa) }),
        el("span", { class: "pi-py-jug" }, el("span", { class: "pi-py-nombre", texto: x.b.nombre }), el("span", { class: "pi-py-pts", texto: x.b.pts })),
        el("span", { class: "pi-py-res pi-py-res-bye", texto: T("proyBye") }),
        el("span", { class: "pi-py-jug" }));
    }
    const gana = x.r === "1-0" || x.r === "+-" ? "b" : x.r === "0-1" || x.r === "-+" ? "n" : null;
    const jug = (j, lado) => el("span", { class: "pi-py-jug pi-py-" + lado + (gana === lado ? " pi-py-gana" : "") },
      el("span", { class: "pi-py-ficha", "aria-hidden": "true", texto: lado === "b" ? "♔" : "♚" }),
      el("span", { class: "pi-py-nombre", texto: j.nombre }), el("span", { class: "pi-py-pts", texto: j.pts }));
    return el("li", { class: "pi-py-mesa" + (x.r ? "" : " pi-py-pendiente") },
      el("span", { class: "pi-py-num", texto: String(x.mesa) }),
      jug(x.b, "b"),
      el("span", { class: "pi-py-res" + (x.r ? "" : " pi-py-res-juego"), texto: x.r ? x.rTexto : T("proyEnJuego") }),
      jug(x.n, "n"));
  }
  function filaClas(f) {
    return el("li", { class: "pi-py-mesa pi-py-clas" + (f.p <= 3 ? " pi-py-podio" : "") },
      el("span", { class: "pi-py-num", texto: String(f.p) }),
      el("span", { class: "pi-py-jug" }, el("span", { class: "pi-py-nombre", texto: f.nombre }), f.inst ? el("span", { class: "pi-py-inst", texto: f.inst }) : null),
      el("span", { class: "pi-py-res", texto: f.pts }));
  }

  function pintar() {
    const m = est.modelo;
    if (!est.caja || !m) return;
    const total = paginas();
    if (est.pagina >= total) est.pagina = 0;
    const lista = elementos().slice(est.pagina * porPagina(), (est.pagina + 1) * porPagina());
    const esClas = est.vista === "clasificacion";

    const cab = el("header", { class: "pi-py-cab" },
      el("div", {},
        el("p", { class: "pi-py-torneo", texto: m.torneo }),
        el("h2", { id: "pi-py-titulo", class: "pi-py-titulo", texto: esClas ? m.clasTitulo : m.rondaTitulo })),
      el("p", { class: "pi-py-hora", "aria-hidden": "true", texto: horaCR() }));
    let avance = null;
    if (!esClas) {
      const pct = m.totalMesas ? Math.round(100 * (m.totalMesas - m.faltan) / m.totalMesas) : 100;
      avance = el("div", { class: "pi-py-avance" },
        el("p", { class: "pi-py-avance-texto", texto: m.faltan ? T("proyResultados", { k: m.totalMesas - m.faltan, m: m.totalMesas }) : T("proyCompleta") }),
        el("div", { class: "pi-py-barra", "aria-hidden": "true" }, el("span", { style: "width:" + pct + "%" })));
    }
    let cuerpo;
    if (esClas && !lista.length) cuerpo = el("p", { class: "pi-py-vacio", texto: T("proyClasSin") });
    else cuerpo = el("ol", { class: "pi-py-lista" + (columnas() === 2 ? " pi-py-dos" : ""), style: "--pi-py-filas:" + FILAS, "aria-label": esClas ? m.clasTitulo : m.rondaTitulo },
      lista.map(esClas ? filaClas : tarjetaMesa));

    const boton = (id, texto, hacer, extra) => el("button", Object.assign({ type: "button", id, class: "pi-py-boton", onclick: hacer }, extra || {}), texto);
    const pie = el("footer", { class: "pi-py-pie" },
      el("p", { class: "pi-py-pagina", role: "status", texto: total > 1 ? T("proyPagina", { i: est.pagina + 1, n: total }) + " · " + (est.pausa ? T("proyPausado") : T("proyCambiaSola", { s: SEGUNDOS })) : "" }),
      el("div", { class: "pi-py-botones" },
        total > 1 ? boton("pi-py-anterior", T("proyAnterior"), () => mover(-1)) : null,
        total > 1 ? boton("pi-py-pausa", est.pausa ? T("proySeguir") : T("proyPausar"), alternarPausa, { "aria-pressed": est.pausa ? "true" : "false" }) : null,
        total > 1 ? boton("pi-py-siguiente", T("proySiguiente"), () => mover(1)) : null,
        boton("pi-py-vista", esClas ? T("proyVerRonda") : T("proyVerClas"), alternarVista),
        boton("pi-py-salir", T("proySalir"), cerrar)),
      el("p", { class: "pi-py-ayuda", texto: T("proyAyuda") }));

    const foco = document.activeElement && est.caja.contains(document.activeElement) ? document.activeElement.id : null;
    est.caja.replaceChildren(el("div", { class: "pi-py-marco" }, cab, avance, cuerpo, pie));
    const f = foco && document.getElementById(foco);
    if (f) f.focus();
    programar();
  }

  function programar() {
    clearTimeout(est.timer);
    if (est.pausa || paginas() < 2) return;
    est.timer = setTimeout(() => mover(1), SEGUNDOS * 1000);
  }
  function mover(d) { est.pagina = (est.pagina + d + paginas()) % paginas(); pintar(); }
  function alternarPausa() { est.pausa = !est.pausa; pintar(); }
  function alternarVista() { est.vista = est.vista === "ronda" ? "clasificacion" : "ronda"; est.pagina = 0; pintar(); }

  function teclas(e) {
    if (e.key === "Escape") { e.preventDefault(); cerrar(); return; }
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); mover(1); return; }
    if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); mover(-1); return; }
    if (e.key === " " && !(e.target && e.target.closest && e.target.closest("button"))) { e.preventDefault(); alternarPausa(); return; }
    if ((e.key === "c" || e.key === "C") && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); alternarVista(); return; }
    if (e.key !== "Tab") return;
    const f = [...est.caja.querySelectorAll("button")];
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
  const alRedimensionar = () => pintar();

  function abrir(modelo, opciones) {
    const o = opciones || {};
    est.caja = document.getElementById("pi-proyectar");
    if (!est.caja) return;
    est.modelo = modelo;
    est.textos = o.textos || {};
    est.vista = o.vista === "clasificacion" ? "clasificacion" : "ronda";
    est.pagina = 0;
    est.pausa = false;
    est.volver = o.volver || null;
    est.caja.setAttribute("aria-label", T("proyTitulo"));
    est.caja.hidden = false;
    document.body.classList.add("pi-proyectando");
    est.caja.onkeydown = teclas;
    window.addEventListener("resize", alRedimensionar);
    clearInterval(est.reloj);
    est.reloj = setInterval(() => { const h = est.caja && est.caja.querySelector(".pi-py-hora"); if (h) h.textContent = horaCR(); }, 30000);
    pintar();
    est.pedido = est.caja.requestFullscreen ? est.caja.requestFullscreen().catch(() => {}) : null;
    const salir = document.getElementById("pi-py-salir");
    if (salir) salir.focus();
  }
  // Lo nuevo (un resultado, una ronda emparejada): se queda en la misma página.
  function actualizar(modelo) {
    if (!abierto()) return;
    est.modelo = modelo;
    pintar();
  }
  function cerrar() {
    if (!est.caja) return;
    clearTimeout(est.timer);
    clearInterval(est.reloj);
    window.removeEventListener("resize", alRedimensionar);
    est.caja.hidden = true;
    est.caja.replaceChildren();
    est.caja.onkeydown = null;
    document.body.classList.remove("pi-proyectando");
    const volver = () => { const b = est.volver && document.getElementById(est.volver); if (b) b.focus(); };
    // Si se sale enseguida, el pedido de pantalla completa puede seguir en
    // camino: se espera a que llegue y recién ahí se sale y se devuelve el foco.
    Promise.resolve(est.pedido).then(() => {
      if (document.fullscreenElement) return document.exitFullscreen().then(volver, volver);
      volver();
    });
  }
  const abierto = () => !!(est.caja && !est.caja.hidden);
  const vista = () => est.vista;

  return { abrir, actualizar, cerrar, abierto, vista };
})();

/*! rev bfb5bbb0d2d82f9f */
