/* ===== Pareo Integral — la ronda y los resultados en el proyector =====
 *
 * Desde Rondas o la Portada («Proyectar») o Clasificación («Proyectar la
 * clasificación») se abre a pantalla completa, para la pantalla grande de la
 * sala. Arriba: el nombre del torneo y la ronda a la izquierda, la marca de
 * agua de Ajedrez Integral en grande al centro y la hora a la derecha.
 * Abajo, cuántos resultados van (con su barra) y las mesas como una tabla:
 * «Mesa · Blancas · Resultado · Negras», con un cuadro blanco o negro y los
 * puntos de antes de la ronda junto a cada nombre (y el encabezado escrito: el color nunca va solo). O la
 * clasificación. Si no caben, pasa de página sola cada 12 segundos.
 *
 * Pantalla dividida: con un segundo torneo elegido abajo («Al lado»), cada
 * mitad muestra el suyo, con su ronda y su barra, y la marca queda arriba al
 * centro, para los dos.
 *
 * Se pone al día sola: pagina.js llama a actualizar() desde guardar(). Este
 * archivo solo pinta lo que le pasan: los modelos (mesas y clasificación,
 * con los nombres y los puntos ya escritos) y los textos los arma
 * js/pareo/pagina.js (modelosProyector). Todo lo que escribe una persona
 * entra por textContent.
 *
 * Teclado: flechas (página), Espacio (pausa), C (ronda / clasificación),
 * Escape (salir; el foco vuelve al botón que lo abrió). Ver «Proyectar la
 * ronda y los resultados» en docs/decisiones/juegos-y-torneos.md.
 */
window.PareoProyectar = (function () {
  "use strict";

  const SEGUNDOS = 12;
  // Filas por columna como máximo: con la letra en vh y vw, nueve filas
  // llenan la pantalla de cualquier proyector sin cortar ninguna.
  const FILAS = 9;
  const est = { caja: null, modelos: [], textos: {}, vista: "ronda", pagina: 0, pausa: false, timer: null, reloj: null,
    volver: null, pedido: null, marca: null, torneos: [], lado: "", alElegirLado: null };

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
    let s = est.textos[k] || k;
    for (const [a, b] of Object.entries(vars || {})) s = s.split("{" + a + "}").join(String(b));
    return s;
  };

  const dividida = () => est.modelos.length > 1;
  // Columnas de cada torneo: una por mitad en la pantalla dividida.
  const columnas = () => (dividida() || window.innerWidth < 1000 ? 1 : 2);
  const porPagina = () => columnas() * FILAS;
  const elementos = (m) => (est.vista === "clasificacion" ? m.clasificacion || [] : m.mesas || []);
  const paginasDe = (m) => Math.max(1, Math.ceil(elementos(m).length / porPagina()));
  const paginas = () => Math.max(...est.modelos.map(paginasDe));

  function horaCR() {
    return new Intl.DateTimeFormat("es-CR", { hour: "numeric", minute: "2-digit", timeZone: "America/Costa_Rica" }).format(new Date());
  }

  // El cuadro del color: blanco con borde, o negro con borde claro (se ve en el fondo oscuro).
  const cuadro = (lado) => el("span", { class: "pi-py-cuadro pi-py-cuadro-" + lado, "aria-hidden": "true" });
  function tarjetaMesa(x, m) {
    if (!x.n) {
      return el("li", { class: "pi-py-mesa pi-py-bye" },
        el("span", { class: "pi-py-num", texto: String(x.mesa) }),
        el("span", { class: "pi-py-jug" }, cuadro("b"), el("span", { class: "pi-py-nombre", texto: x.b.nombre }), el("span", { class: "pi-py-pts", texto: x.b.pts })),
        el("span", { class: "pi-py-res pi-py-res-bye", texto: m.bye }),
        el("span", {}));
    }
    const gana = x.r === "1-0" || x.r === "+-" ? "b" : x.r === "0-1" || x.r === "-+" ? "n" : null;
    const jug = (j, lado) => el("span", { class: "pi-py-jug" + (gana === lado ? " pi-py-gana" : "") },
      cuadro(lado), el("span", { class: "pi-py-nombre", texto: j.nombre }), el("span", { class: "pi-py-pts", texto: j.pts }));
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

  // Un torneo: su título, su barra, el encabezado de las columnas y su página.
  function bloque(m, k) {
    const esClas = est.vista === "clasificacion";
    const todos = elementos(m);
    const pag = est.pagina % paginasDe(m);
    const lista = todos.slice(pag * porPagina(), (pag + 1) * porPagina());
    const cols = columnas();
    // Las filas se reparten parejo entre las columnas (12 mesas: 6 y 6).
    const filas = Math.max(1, Math.min(FILAS, Math.ceil(lista.length / cols)));
    const idTitulo = "pi-py-titulo" + (k ? "-" + k : "");
    const titulo = el("div", { class: "pi-py-titulos" },
      el("p", { class: "pi-py-torneo", texto: m.torneo }),
      el("h2", { id: idTitulo, class: "pi-py-titulo", texto: esClas ? m.clasTitulo : m.rondaTitulo }));
    let avance = null;
    if (!esClas) {
      const pct = m.totalMesas ? Math.round(100 * (m.totalMesas - m.faltan) / m.totalMesas) : 100;
      avance = el("div", { class: "pi-py-avance" },
        el("p", { class: "pi-py-avance-texto", texto: m.faltan ? T("proyResultados", { k: m.totalMesas - m.faltan, m: m.totalMesas }) : T("proyCompleta") }),
        el("div", { class: "pi-py-barra", "aria-hidden": "true" }, el("span", { style: "width:" + pct + "%" })));
    }
    if (esClas && !lista.length) return el("section", { class: "pi-py-bloque", "aria-labelledby": idTitulo }, titulo, el("p", { class: "pi-py-vacio", texto: T("proyClasSin") }));
    // El encabezado de las columnas, una vez por columna de tarjetas.
    const cab = esClas ? null : el("div", { class: "pi-py-encabezados" + (cols === 2 ? " pi-py-dos" : ""), "aria-hidden": "true" },
      Array.from({ length: Math.min(cols, Math.max(1, Math.ceil(lista.length / filas))) }, () => el("div", { class: "pi-py-encabezado" },
        el("span", { texto: T("proyMesa") }), el("span", {}, cuadro("b"), T("proyBlancas")),
        el("span", { texto: T("proyResultado") }), el("span", {}, cuadro("n"), T("proyNegras")))));
    return el("section", { class: "pi-py-bloque", "aria-labelledby": idTitulo }, titulo, avance, cab,
      // Con pocas filas las tarjetas quedan altas: el nombre puede usar tres líneas.
      el("ol", { class: "pi-py-lista" + (cols === 2 ? " pi-py-dos" : "") + (filas <= 7 ? " pi-py-holgada" : ""), style: "--pi-py-filas:" + filas, "aria-label": esClas ? m.clasTitulo : m.rondaTitulo },
        lista.map((x) => (esClas ? filaClas(x) : tarjetaMesa(x, m)))));
  }

  function pintar() {
    if (!est.caja || !est.modelos.length) return;
    const total = paginas();
    if (est.pagina >= total) est.pagina = 0;
    const esClas = est.vista === "clasificacion";

    // Arriba: la marca de agua al centro y la hora a la derecha (y, con un
    // solo torneo, su nombre y la ronda a la izquierda).
    const marca = est.marca ? el("img", { class: "pi-py-marca", src: est.marca, alt: T("proyMarca") }) : null;
    const hora = el("p", { class: "pi-py-hora", "aria-hidden": "true", texto: horaCR() });
    const cuerpo = dividida()
      ? [el("header", { class: "pi-py-cab pi-py-cab-dividida" }, el("span", {}), marca, hora),
        el("div", { class: "pi-py-mitades" }, est.modelos.map((m, k) => bloque(m, k)))]
      : (() => {
        const b = bloque(est.modelos[0], 0);
        const titulos = b.querySelector(".pi-py-titulos");
        return [el("header", { class: "pi-py-cab" }, titulos, marca, hora), b];
      })();

    const boton = (id, texto, hacer, extra) => el("button", Object.assign({ type: "button", id, class: "pi-py-boton", onclick: hacer }, extra || {}), texto);
    let elegir = null;
    if (est.torneos.length && est.alElegirLado) {
      const sel = el("select", { id: "pi-py-lado", class: "pi-py-select" },
        el("option", { value: "", texto: T("proyLadoNinguno") }),
        est.torneos.map((x) => el("option", { value: x.id, texto: x.nombre })));
      sel.value = est.lado || "";
      sel.addEventListener("change", () => est.alElegirLado(sel.value));
      elegir = el("label", { class: "pi-py-elegir" }, el("span", { texto: T("proyLado") }), sel);
    }
    const pie = el("footer", { class: "pi-py-pie" },
      el("p", { class: "pi-py-pagina", role: "status", texto: total > 1 ? T("proyPagina", { i: est.pagina + 1, n: total }) + " · " + (est.pausa ? T("proyPausado") : T("proyCambiaSola", { s: SEGUNDOS })) : "" }),
      elegir,
      el("div", { class: "pi-py-botones" },
        total > 1 ? boton("pi-py-anterior", T("proyAnterior"), () => mover(-1)) : null,
        total > 1 ? boton("pi-py-pausa", est.pausa ? T("proySeguir") : T("proyPausar"), alternarPausa, { "aria-pressed": est.pausa ? "true" : "false" }) : null,
        total > 1 ? boton("pi-py-siguiente", T("proySiguiente"), () => mover(1)) : null,
        boton("pi-py-vista", esClas ? T("proyVerRonda") : T("proyVerClas"), alternarVista),
        boton("pi-py-salir", T("proySalir"), cerrar)),
      el("p", { class: "pi-py-ayuda", texto: T("proyAyuda") }));

    const foco = document.activeElement && est.caja.contains(document.activeElement) ? document.activeElement.id : null;
    est.caja.replaceChildren(el("div", { class: "pi-py-marco" + (dividida() ? " pi-py-dividido" : "") }, cuerpo, pie));
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
    if (e.target && e.target.tagName === "SELECT" && e.key !== "Escape" && e.key !== "Tab") return;
    if (e.key === "Escape") { e.preventDefault(); cerrar(); return; }
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); mover(1); return; }
    if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); mover(-1); return; }
    if (e.key === " " && !(e.target && e.target.closest && e.target.closest("button"))) { e.preventDefault(); alternarPausa(); return; }
    if ((e.key === "c" || e.key === "C") && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); alternarVista(); return; }
    if (e.key !== "Tab") return;
    const f = [...est.caja.querySelectorAll("button, select")];
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
  const alRedimensionar = () => pintar();
  const comoLista = (x) => (Array.isArray(x) ? x : x ? [x] : []);
  function opciones(o) {
    if ("torneos" in o) est.torneos = o.torneos || [];
    if ("lado" in o) est.lado = o.lado || "";
  }

  // `modelos`: uno, o dos para la pantalla dividida.
  function abrir(modelos, opcionesAbrir) {
    const o = opcionesAbrir || {};
    est.caja = document.getElementById("pi-proyectar");
    if (!est.caja) return;
    est.modelos = comoLista(modelos);
    est.textos = o.textos || {};
    est.vista = o.vista === "clasificacion" ? "clasificacion" : "ronda";
    est.pagina = 0;
    est.pausa = false;
    est.volver = o.volver || null;
    est.marca = o.marca || null;
    est.alElegirLado = o.alElegirLado || null;
    est.torneos = []; est.lado = "";
    opciones(o);
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
  // Lo nuevo (un resultado, una ronda emparejada, el torneo de al lado): se queda en la misma página.
  function actualizar(modelos, o) {
    if (!abierto()) return;
    est.modelos = comoLista(modelos);
    if (o) opciones(o);
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
