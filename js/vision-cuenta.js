/* ===== Ajedrez Integral — La visión de la cuenta =====
 *
 * Quien administra marca en admin.html si una persona ve poco (baja_vision) o
 * no ve (ciego). La marca vive en la base (public.vision_personas, que solo
 * escribe marcar_vision()) y este archivo la lleva a TODAS las páginas, sin
 * que esa persona tenga que encontrar ningún botón:
 *
 *   - Baja visión: se enciende «Activar voz» (js/voz-pagina.js), la voz del
 *     navegador que dice los avisos y las jugadas.
 *   - Ciego: se enciende el Modo Adaptado y además la clase `modo-ciego` del
 *     <html>, que trae:
 *       · el panel del alumno ADAPTADO (js/clases.js pinta otro, solo con lo
 *         que se puede usar con lector de pantalla);
 *       · lo que no está adaptado, oculto: los enlaces a esas páginas se
 *         esconden, y si igual se llega a una, se dice y se ofrece volver;
 *       · «Accesos rápidos» al principio de cada página y atajos de teclado
 *         (Alt + Mayúscula + una letra) para ir al panel, a la clase, a las
 *         tareas, al tablero o al recuadro donde se escribe la jugada.
 *
 * La voz se enciende UNA vez por cada marca nueva (la clave
 * `ai_vision_aplicada_v1`): si después la persona la apaga, se respeta. La
 * clase `modo-ciego` y el Modo Adaptado, en cambio, siguen a la marca: sin
 * ellos los tableros no traen su recuadro, y quien no ve no tiene cómo
 * notarlo. Los quita solo quien administra.
 *
 * js/adaptive-mode.js lo carga en todas las páginas con encabezado, y en el
 * <head> ya pone la clase con lo guardado, para no pintar primero el panel de
 * siempre y cambiarlo un instante después. Ver «La visión de la persona la
 * marca administración» en docs/decisiones/accesibilidad.md.
 */
window.VisionCuenta = (function () {
  "use strict";

  var CLAVE = "ai_vision_v1";
  var APLICADA = "ai_vision_aplicada_v1";
  var VALIDAS = { baja_vision: true, ciego: true };

  /* Las páginas que todavía no se pueden usar sin ver: tableros sin cuadro de
     comandos ni casillas que se recorran (las modalidades de Juegos que no son
     Estándar ni Niebla, Confites, Ilumina el tablero, Concentración) y las
     salas de transmisión, que son pura imagen. Una página que se adapte sale
     de esta lista. */
  var NO_ADAPTADAS = [
    "bot.html", "cartas.html", "concentracion.html", "confites.html", "crazyhouse.html",
    "cuatro-jugadores.html", "duelo.html", "ilumina-tablero.html", "variante.html",
    "transmision.html", "torneos-en-vivo.html", "lector-planilla.html",
  ];

  /* De dónde se cargó este archivo: la raíz del sitio es su carpeta de arriba. */
  var RAIZ = ((document.currentScript && document.currentScript.src) || "").replace(/js\/vision-cuenta\.js(\?.*)?$/, "");

  function leer(clave) { try { return localStorage.getItem(clave); } catch (e) { return null; } }
  function escribir(clave, valor) {
    try {
      if (valor === null) localStorage.removeItem(clave);
      else localStorage.setItem(clave, valor);
    } catch (e) {}
  }

  function guardada() {
    try {
      var g = JSON.parse(leer(CLAVE) || "null");
      return g && VALIDAS[g.vision] ? g : null;
    } catch (e) { return null; }
  }
  function actual() { var g = guardada(); return g ? g.vision : null; }
  function esCiego() { return document.documentElement.classList.contains("modo-ciego"); }

  function anunciar(texto) {
    if (!document.body) return;
    var nota = document.createElement("div");
    nota.setAttribute("role", "status");
    nota.className = "sr-only";
    document.body.appendChild(nota);
    setTimeout(function () { nota.textContent = texto; }, 80);
    setTimeout(function () { nota.remove(); }, 8000);
  }

  /* La voz se enciende con el botón de la página si ya está (así el botón dice
     que está puesta y avisa «Voz activada»); si todavía no llegó, se deja la
     preferencia escrita y el botón nace encendido. */
  function encenderVoz() {
    var btn = document.querySelector("#voz-toggle, #speech-toggle-btn, #btn-voz");
    if (btn && btn.getAttribute("aria-pressed") === "false") { btn.click(); return; }
    escribir("oscarSpeechMode_v1", "1");
  }

  function aplicar(vision) {
    var html = document.documentElement;
    html.classList.toggle("modo-ciego", vision === "ciego");
    try { document.dispatchEvent(new CustomEvent("vision:cambio", { detail: { vision: vision } })); } catch (e) {}
    if (vision === "ciego") {
      /* Siempre, no solo la primera vez: sin el Modo Adaptado los tableros
         no traen su recuadro de comandos, y quien no ve no tiene cómo
         notarlo para volver a encenderlo. */
      if (window.AdaptiveMode && !AdaptiveMode.isOn()) AdaptiveMode.set(true);
      montarCiego();
    } else desmontarCiego();
  }

  /* La primera vez que llega una marca (o cuando cambia) se encienden las
     ayudas y se dice qué pasó. Las siguientes, nada: la persona manda. */
  function primeraVez(persona, vision) {
    var marca = persona + ":" + (vision || "");
    if (leer(APLICADA) === marca) return;
    escribir(APLICADA, marca);
    if (vision === "baja_vision") {
      encenderVoz();
      anunciar("Tu cuenta tiene la voz encendida: el navegador te dice en voz alta los avisos y las jugadas. Se apaga con el botón de la voz, arriba.");
    } else if (vision === "ciego") {
      anunciar("Tu cuenta tiene el modo adaptado completo: el panel trae solo lo que se usa con lector de pantalla. Alt más Mayúscula más H dice los atajos del teclado.");
    }
  }

  /* Pregunta a la base. Sin sesión o sin conexión no toca nada: se queda lo
     guardado. */
  function sincronizar() {
    if (!window.sb || !sb.auth || !sb.from) return Promise.resolve(actual());
    return sb.auth.getSession().then(function (r) {
      var sesion = r && r.data && r.data.session;
      if (!sesion || !sesion.user) return actual();
      var persona = sesion.user.id;
      return sb.from("vision_personas").select("vision").eq("persona_id", persona).maybeSingle()
        .then(function (res) {
          if (res.error) return actual();
          var vision = res.data && VALIDAS[res.data.vision] ? res.data.vision : null;
          escribir(CLAVE, vision ? JSON.stringify({ persona: persona, vision: vision }) : null);
          aplicar(vision);
          primeraVez(persona, vision);
          return vision;
        });
    }).catch(function () { return actual(); });
  }

  /* ---------------------------------------------------------------- modo ciego */

  function ruta(pagina) { return RAIZ + pagina; }
  function paginaActual() {
    var p = location.pathname.replace(/\/+$/, "/index.html");
    return p.slice(p.lastIndexOf("/") + 1) || "index.html";
  }
  /* Salir de la clase en vivo o de un examen tiene su propio camino (cierra la
     asistencia, congela el examen): ahí los atajos solo mueven el foco, nunca
     cambian de página. Es la misma excepción que js/atajo-buscar.js. */
  function puedeSalir() {
    var p = paginaActual();
    return p !== "sesion.html" && p !== "examen.html";
  }

  function esNoAdaptada(href) {
    if (!href) return false;
    var u;
    try { u = new URL(href, location.href); } catch (e) { return false; }
    if (u.origin !== location.origin) return false;
    var nombre = u.pathname.slice(u.pathname.lastIndexOf("/") + 1);
    return NO_ADAPTADAS.indexOf(nombre) !== -1;
  }

  var ATAJOS = [
    { tecla: "p", que: "Ir a tu panel", corto: "Tu panel", ir: "clases.html" },
    { tecla: "v", que: "Ir a la clase en vivo", corto: "Clase en vivo", ir: "sesion.html" },
    { tecla: "t", que: "Ir a tus tareas", corto: "Tareas", ir: "tareas.html" },
    { tecla: "e", que: "Ir a entrenar (la lista adaptada de tu panel)", corto: "Entrenar", ir: "clases.html#entrenar" },
    { tecla: "d", que: "Oír dónde estás: la página, el camino y sus secciones", foco: "donde" },
    { tecla: "s", que: "Ir a la siguiente sección de esta página", foco: "seccion" },
    { tecla: "a", que: "Volver a la página anterior", foco: "atras" },
    { tecla: "m", que: "Saltar al contenido de esta página", foco: "contenido" },
    { tecla: "b", que: "Ir al tablero de esta página", foco: "tablero" },
    { tecla: "c", que: "Ir al recuadro donde se escribe la jugada", foco: "comandos" },
    { tecla: "h", que: "Oír esta lista de atajos", foco: "ayuda" },
  ];

  function textoAtajos() {
    return "Atajos: Alt más Mayúscula más " + ATAJOS.map(function (a) {
      return a.tecla.toUpperCase() + ", " + a.que.toLowerCase();
    }).join("; ") + ".";
  }

  function enfocar(el) {
    if (!el) return false;
    if (!el.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.setAttribute("tabindex", "-1");
    el.focus();
    return document.activeElement === el;
  }

  function visible(el) {
    return !!el && (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);
  }

  /* Los títulos de sección que se ven: con ellos se arma «dónde estás» y se
     salta de una sección a la otra. Los del encabezado y los accesos rápidos
     no cuentan. */
  function secciones() {
    var main = document.getElementById("main-content") || document.querySelector("main") || document.body;
    return Array.prototype.slice.call(main.querySelectorAll("h1, h2")).filter(function (h) {
      return visible(h) && h.textContent.trim() && !h.closest("#accesos-rapidos");
    });
  }
  // Lo que se lee, sin lo que es adorno (los emojis van en aria-hidden).
  function textoDe(el) {
    var copia = el.cloneNode(true);
    Array.prototype.forEach.call(copia.querySelectorAll('[aria-hidden="true"]'), function (x) { x.remove(); });
    return copia.textContent.replace(/\s+/g, " ").trim();
  }

  function dondeEstas() {
    var hs = secciones();
    var h1 = hs.filter(function (h) { return h.tagName === "H1"; })[0];
    var titulo = h1 ? textoDe(h1) : document.title.replace(/ — Ajedrez Integral$/, "");
    var migas = Array.prototype.slice.call(document.querySelectorAll("#migas li")).map(textoDe).filter(Boolean);
    var partes = ["Estás en " + titulo + "."];
    if (migas.length > 1) partes.push("Camino: " + migas.join(", ") + ".");
    var h2 = hs.filter(function (h) { return h.tagName === "H2"; }).map(textoDe);
    if (h2.length) partes.push(h2.length === 1 ? "Tiene una sección: " + h2[0] + "." : "Tiene " + h2.length + " secciones: " + h2.join("; ") + ".");
    if (document.querySelector('[aria-roledescription="tablero de ajedrez"]')) partes.push("Hay un tablero: Alt más Mayúscula más B lo enfoca.");
    return partes.join(" ");
  }

  function siguienteSeccion() {
    var hs = secciones();
    if (!hs.length) { anunciar("Esta página no tiene secciones con título."); return; }
    var actual = document.activeElement;
    var sig = hs.filter(function (h) {
      return actual && actual !== document.body && (actual.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING) && !actual.contains(h);
    })[0] || hs[0];
    enfocar(sig);
  }

  function irAFoco(que) {
    if (que === "ayuda") { anunciar(textoAtajos()); return; }
    if (que === "donde") { anunciar(dondeEstas()); return; }
    if (que === "seccion") { siguienteSeccion(); return; }
    if (que === "atras") {
      if (!puedeSalir()) { anunciar("Desde aquí no se sale con un atajo: usa el enlace de la página para salir."); return; }
      history.back();
      return;
    }
    if (que === "contenido") {
      if (!enfocar(document.getElementById("main-content") || document.querySelector("main"))) anunciar("Esta página no tiene contenido principal marcado.");
      return;
    }
    if (que === "tablero") {
      /* El tablero más grande a la vista: su casilla con tabindex=0 (una sola
         parada, js/tablero-accesible.js). */
      var tableros = Array.prototype.slice.call(document.querySelectorAll('[aria-roledescription="tablero de ajedrez"]')).filter(visible);
      tableros.sort(function (a, b) { return b.getBoundingClientRect().width - a.getBoundingClientRect().width; });
      var casilla = tableros.length && (tableros[0].querySelector('[tabindex="0"]') || tableros[0].querySelector("[data-square]"));
      if (!casilla || !enfocar(casilla)) anunciar("En esta página no hay un tablero a la vista.");
      return;
    }
    if (que === "comandos") {
      /* Todos los recuadros donde se escribe la jugada del sitio: el común
         (.cc-input) y los propios de Tablero, Juegos, Sonar, Batalla naval,
         4×4, Visualización, Tipos y los cursos. Si hay un diálogo abierto (la
         pregunta de la clase), primero el suyo. */
      var SEL = ".cc-input, #blind-input, #move-input, #cmd-input, #blind-move-input, #answer-input, #jugada-input, .f100-cmd-input, .cp-cmd-input, [data-cuadro-comandos] input";
      var campos = Array.prototype.slice.call(document.querySelectorAll(SEL)).filter(function (c) { return visible(c) && !c.disabled; });
      var campo = campos.filter(function (c) { return c.closest("dialog[open], [role=dialog]:not([hidden]), [role=alertdialog]:not([hidden])"); })[0] || campos[0];
      if (!campo || !enfocar(campo)) anunciar("En esta página no hay un recuadro para escribir la jugada.");
    }
  }

  function alTeclear(e) {
    if (!esCiego() || !e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
    /* e.code y no e.key: con Alt + Mayúscula, en Mac e.key trae otro símbolo. */
    var letra = /^Key([A-Z])$/.exec(e.code || "");
    if (!letra) return;
    var a = ATAJOS.filter(function (x) { return x.tecla === letra[1].toLowerCase(); })[0];
    if (!a) return;
    e.preventDefault();
    if (a.foco) { irAFoco(a.foco); return; }
    if (!puedeSalir()) { anunciar("Desde aquí no se sale con un atajo: usa el enlace de la página para salir."); return; }
    location.href = ruta(a.ir);
  }

  function estilos() {
    if (document.getElementById("vc-estilos")) return;
    var st = document.createElement("style");
    st.id = "vc-estilos";
    st.textContent =
      "#accesos-rapidos{background:#102a43;color:#fff;padding:.5rem 1rem;font-size:1rem;line-height:1.4}" +
      "#accesos-rapidos ul{display:flex;flex-wrap:wrap;gap:.25rem .75rem;margin:0 auto;padding:0;list-style:none;max-width:80rem;align-items:center}" +
      "#accesos-rapidos a,#accesos-rapidos summary{color:#fff;text-decoration:underline;text-underline-offset:3px;display:inline-block;min-height:44px;padding:.6rem .25rem;cursor:pointer}" +
      "#accesos-rapidos a:focus-visible,#accesos-rapidos summary:focus-visible{outline:3px solid #f0b429;outline-offset:2px}" +
      "#accesos-rapidos details ul{display:block;padding:.25rem 0 .5rem 1rem}" +
      "#accesos-rapidos details li{padding:.15rem 0}" +
      "#vc-no-adaptada{max-width:40rem;margin:3rem auto;padding:1.5rem;border-radius:1rem;background:#fff;color:#102a43;border:3px solid #102a43;font-size:1.125rem;line-height:1.5}" +
      "html.dark #vc-no-adaptada{background:#102a43;color:#fff;border-color:#f0b429}" +
      "#vc-no-adaptada a{color:inherit;font-weight:700;text-decoration:underline}";
    document.head.appendChild(st);
  }

  /* Al principio de la página, justo después de «Saltar al contenido»: es por
     donde empieza quien la recorre con el lector. */
  function ponerAccesos() {
    if (document.getElementById("accesos-rapidos") || !document.body) return;
    if (!document.getElementById("theme-toggle")) return;   // documentos sueltos sin encabezado del sitio
    estilos();
    var nav = document.createElement("nav");
    nav.id = "accesos-rapidos";
    nav.setAttribute("aria-label", "Accesos rápidos");
    var ul = document.createElement("ul");
    ATAJOS.forEach(function (a) {
      if (!a.ir) return;
      var li = document.createElement("li");
      var enlace = document.createElement("a");
      enlace.href = ruta(a.ir);
      enlace.textContent = a.corto;
      enlace.setAttribute("aria-keyshortcuts", "Alt+Shift+" + a.tecla.toUpperCase());
      li.appendChild(enlace);
      ul.appendChild(li);
    });
    var liAyuda = document.createElement("li");
    var det = document.createElement("details");
    var sum = document.createElement("summary");
    sum.textContent = "Atajos del teclado";
    var lista = document.createElement("ul");
    ATAJOS.forEach(function (a) {
      var li = document.createElement("li");
      li.textContent = "Alt + Mayúscula + " + a.tecla.toUpperCase() + ": " + a.que + ".";
      lista.appendChild(li);
    });
    det.append(sum, lista);
    liAyuda.appendChild(det);
    ul.appendChild(liAyuda);
    nav.appendChild(ul);
    var salto = document.querySelector('a[href="#main-content"]');
    if (salto && salto.parentNode === document.body) document.body.insertBefore(nav, salto.nextSibling);
    else document.body.insertBefore(nav, document.body.firstChild);
  }

  /* Lo que no está adaptado no se ofrece: un enlace a una de esas páginas se
     esconde (y con él su tarjeta, si es lo único que hay en su casilla de la
     lista). Se vuelve a mirar cuando la página pinta cosas nuevas. */
  function ocultarNoAdaptado(raiz) {
    var enlaces = (raiz || document).querySelectorAll ? (raiz || document).querySelectorAll("a[href]") : [];
    Array.prototype.forEach.call(enlaces, function (a) {
      if (a.dataset.vcOculto || a.closest("#accesos-rapidos")) return;
      if (!esNoAdaptada(a.getAttribute("href"))) return;
      var li = a.closest("li");
      var quitar = li && li.querySelectorAll("a[href]").length === 1 ? li : a;
      quitar.hidden = true;
      quitar.dataset.vcOculto = "1";
      a.dataset.vcOculto = "1";
    });
  }
  function mostrarLoOculto() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-vc-oculto]"), function (el) {
      el.hidden = false;
      delete el.dataset.vcOculto;
    });
  }

  /* Si igual se llega a una página no adaptada (un enlace guardado, el
     historial), se dice en vez de dejar a la persona sola con un tablero que
     no puede usar. El contenido se queda debajo, por si alguien la acompaña. */
  function avisarPaginaNoAdaptada() {
    if (NO_ADAPTADAS.indexOf(paginaActual()) === -1 || document.getElementById("vc-no-adaptada")) return;
    estilos();
    var caja = document.createElement("section");
    caja.id = "vc-no-adaptada";
    caja.setAttribute("aria-labelledby", "vc-no-adaptada-titulo");
    var h = document.createElement("h1");
    h.id = "vc-no-adaptada-titulo";
    h.tabIndex = -1;
    h.textContent = "Esta página todavía no está adaptada";
    var p = document.createElement("p");
    p.textContent = "Aquí se juega mirando el tablero, sin recuadro para escribir la jugada ni casillas que se puedan recorrer. Mientras se adapta, lo que sí puedes usar está en tu panel.";
    var volver = document.createElement("a");
    volver.href = ruta("clases.html");
    volver.textContent = "Volver a tu panel";
    caja.append(h, p, volver);
    var main = document.getElementById("main-content") || document.querySelector("main");
    Array.prototype.forEach.call(main ? main.children : [], function (hijo) {
      if (hijo === caja) return;
      if (!hijo.hidden) { hijo.hidden = true; hijo.dataset.vcOculto = "1"; }
    });
    if (main) main.insertBefore(caja, main.firstChild);
    else document.body.appendChild(caja);
    h.focus();
  }

  var observador = null;
  function montarCiego() {
    if (!document.body) return;
    ponerAccesos();
    ocultarNoAdaptado(document);
    avisarPaginaNoAdaptada();
    if (!observador && window.MutationObserver) {
      observador = new MutationObserver(function (registros) {
        registros.forEach(function (r) {
          Array.prototype.forEach.call(r.addedNodes, function (n) {
            if (n.nodeType !== 1) return;
            if (n.matches && n.matches("a[href]")) ocultarNoAdaptado(n.parentNode);
            else ocultarNoAdaptado(n);
          });
        });
      });
      observador.observe(document.body, { childList: true, subtree: true });
    }
  }
  function desmontarCiego() {
    if (observador) { observador.disconnect(); observador = null; }
    var nav = document.getElementById("accesos-rapidos");
    if (nav) nav.remove();
    var caja = document.getElementById("vc-no-adaptada");
    if (caja) caja.remove();
    mostrarLoOculto();
  }

  document.addEventListener("keydown", alTeclear);

  function arrancar() {
    if (esCiego()) montarCiego();
    sincronizar();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();

  return {
    actual: actual,
    esCiego: esCiego,
    sincronizar: sincronizar,
    esNoAdaptada: esNoAdaptada,
    NO_ADAPTADAS: NO_ADAPTADAS,
    ATAJOS: ATAJOS,
    textoAtajos: textoAtajos,
  };
})();
