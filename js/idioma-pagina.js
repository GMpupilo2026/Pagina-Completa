/* El idioma de una página pública de torneo (español, inglés y francés), con
 * un botón que dice el de ahora y abre la lista de los tres.
 *
 * El español es el de la página, tal como está escrita. Para los otros dos
 * hay un mapa de cada texto en español (sin los espacios de más) a su
 * traducción: se cambia cada nodo de texto y los atributos que se leen (alt,
 * aria-label, title, placeholder, data-visor), y un MutationObserver traduce
 * también lo que se agrega después (una ventana que se arma, el «Cambiar a
 * modo claro» del botón del tema). Lo que va marcado con `data-no-traducir`
 * no se toca: lo pinta la página en el idioma que toca, con sus fechas y sus
 * números (avisa con `alCambiar`).
 *
 * Es el mismo de js/centroamericano.js, sacado aparte para que lo use otra
 * página. El Centroamericano 2026 se está jugando mientras se escribe esto
 * (del 1 al 9 de noviembre) y no se toca su página: se pasa a este módulo
 * cuando termine (ver «La página del Metropolitano 2026» en
 * docs/decisiones/cuentas-y-formularios.md).
 *
 *   IdiomaPagina.iniciar({
 *     mapas: { en: {…}, fr: {…} },  // «texto en español» → traducción
 *     patrones: { en: […], fr: […] }, // los textos con datos: [RegExp, reemplazo]
 *     titulos: { en, fr },           // el <title> de cada idioma
 *     clave,                         // localStorage: el que eligió
 *     boton, menu,                   // los id del botón y de su lista
 *     alCambiar(idioma),             // para volver a pintar lo suyo
 *   }) → { idioma() }
 *
 * `patrones` es para lo que la página arma con datos («Faltan 3 datos»,
 * «1. Ana Mora: Falta el sexo.»): si el texto no está en el mapa, se prueba
 * cada RegExp contra el texto ENTERO y se usa la primera que calza. El
 * reemplazo es un texto con $1, $2… o una función (calce, t) que arma la
 * traducción; `t(x)` traduce un pedazo (con el mapa y los patrones) y, si no
 * lo sabe, lo deja como estaba.
 *
 * `?lang=en` o `?lang=fr` en la dirección lo abre en ese idioma (para
 * compartir el enlace a una delegación).
 */
window.IdiomaPagina = (function () {
  "use strict";

  const IDIOMAS = ["es", "en", "fr"];
  const NOMBRES = { es: "Español", en: "English", fr: "Français" };
  const ATRIBUTOS = ["alt", "aria-label", "title", "data-visor", "data-ventana", "placeholder"];
  const limpio = (t) => String(t || "").replace(/\s+/g, " ").trim();

  function iniciar(op) {
    const mapas = op.mapas || {};
    const titulos = Object.assign({ es: document.title }, op.titulos || {});
    let idioma = "es";
    const textosOriginales = [];       // [nodo de texto, su texto en español]
    const atributosOriginales = [];    // [elemento, atributo, su valor en español]

    const fuera = (el) => !el || !!el.closest("script, style, [data-no-traducir]");
    const propio = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    // La traducción de un texto limpio, o null si no se sabe.
    function traduccion(t) {
      const mapa = mapas[idioma] || {};
      if (propio(mapa, t)) return mapa[t];
      const lista = (op.patrones || {})[idioma] || [];
      for (let i = 0; i < lista.length; i++) {
        const re = lista[i][0], rep = lista[i][1];
        const m = re.exec(t);
        if (!m || m.index !== 0 || m[0].length !== t.length) continue;
        return typeof rep === "function" ? rep(m, (x) => { const y = traduccion(limpio(x)); return y == null ? x : y; }) : t.replace(re, rep);
      }
      return null;
    }

    // Lo que puso el traductor: su propio cambio vuelve por el vigía y no se
    // traduce otra vez (un patrón calzaría con el texto ya traducido).
    const puestos = new WeakMap();
    function traducirTexto(nodo) {
      if (fuera(nodo.parentElement)) return;
      const original = nodo.nodeValue;
      if (puestos.get(nodo) === original) return;
      const otro = traduccion(limpio(original));
      if (otro == null) return;
      const nuevo = original.match(/^\s*/)[0] + otro + original.match(/\s*$/)[0];
      // Se anota aunque quede igual («PayPal», «Total: $45.00»): ya está en el idioma.
      textosOriginales.push([nodo, original]);
      puestos.set(nodo, nuevo);
      if (nuevo !== original) nodo.nodeValue = nuevo;
    }
    function traducirAtributos(el) {
      if (fuera(el)) return;
      ATRIBUTOS.forEach((a) => {
        if (!el.hasAttribute(a)) return;
        const v = el.getAttribute(a);
        const ya = puestos.get(el);
        if (ya && ya[a] === v) return;
        const otro = traduccion(limpio(v));
        if (otro == null || otro === v) return;
        atributosOriginales.push([el, a, v]);
        puestos.set(el, Object.assign({}, ya, { [a]: otro }));
        el.setAttribute(a, otro);
      });
    }
    function traducir(raiz) {
      if (raiz.nodeType === Node.TEXT_NODE) { traducirTexto(raiz); return; }
      if (raiz.nodeType !== Node.ELEMENT_NODE) return;
      traducirAtributos(raiz);
      raiz.querySelectorAll("*").forEach(traducirAtributos);
      const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) traducirTexto(n);
    }
    function volverAlEspanol() {
      textosOriginales.splice(0).forEach(([nodo, original]) => { nodo.nodeValue = original; });
      atributosOriginales.splice(0).reverse().forEach(([el, a, v]) => el.setAttribute(a, v));
    }
    const vigia = new MutationObserver((cambios) => {
      if (idioma === "es") return;
      cambios.forEach((c) => {
        if (c.type === "childList") c.addedNodes.forEach(traducir);
        else if (c.type === "characterData") traducirTexto(c.target);
        else if (c.type === "attributes") traducirAtributos(c.target);
      });
    });

    const boton = document.getElementById(op.boton), menu = document.getElementById(op.menu);

    function poner(nuevo, recordar) {
      if (IDIOMAS.indexOf(nuevo) === -1) nuevo = "es";
      if (recordar && op.clave) { try { localStorage.setItem(op.clave, nuevo); } catch (e) { /* sin localStorage: solo esta visita */ } }
      if (nuevo === idioma) return;
      // Los mapas van del español a cada idioma: de inglés a francés se pasa por él.
      vigia.disconnect();
      volverAlEspanol();
      idioma = nuevo;
      if (idioma !== "es") {
        traducir(document.body);
        vigia.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
      }
      document.documentElement.lang = idioma;
      document.title = titulos[idioma] || titulos.es;
      // «Idioma · Language · Langue» va en los tres: lo tiene que encontrar
      // quien no lee el de ahora.
      if (boton) {
        boton.lang = idioma;
        boton.setAttribute("aria-label", "Idioma · Language · Langue : " + NOMBRES[idioma]);
        if (boton.children[0]) boton.children[0].textContent = idioma.toUpperCase();
        if (boton.children[1]) boton.children[1].textContent = NOMBRES[idioma];
      }
      if (menu) menu.querySelectorAll("[data-idioma]").forEach((b) => {
        if (b.dataset.idioma === idioma) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
      });
      if (op.alCambiar) op.alCambiar(idioma);
    }

    function inicial() {
      const pedido = new URLSearchParams(location.search).get("lang");
      if (IDIOMAS.indexOf(pedido) !== -1) return pedido;
      try {
        const g = op.clave && localStorage.getItem(op.clave);
        if (IDIOMAS.indexOf(g) !== -1) return g;
      } catch (e) { /* sin localStorage */ }
      // Sin elección, en español: es un torneo en Costa Rica, y tomarlo del
      // navegador le cambiaba la página a quien tiene el celular en inglés.
      return "es";
    }

    // El menú: se abre con el botón y se cierra al elegir, con Escape (el
    // foco vuelve al botón) o tocando afuera.
    if (boton && menu) {
      const caja = boton.parentElement;
      const abrir = (si) => { menu.hidden = !si; boton.setAttribute("aria-expanded", si ? "true" : "false"); };
      boton.addEventListener("click", () => {
        abrir(menu.hidden);
        if (!menu.hidden) (menu.querySelector("[aria-current]") || menu.querySelector("button")).focus();
      });
      menu.addEventListener("click", (e) => {
        const b = e.target.closest("[data-idioma]");
        if (!b) return;
        abrir(false);
        poner(b.dataset.idioma, true);
        boton.focus();
      });
      menu.addEventListener("keydown", (e) => {
        const bs = [...menu.querySelectorAll("button")], i = bs.indexOf(document.activeElement);
        if (e.key === "Escape") { e.preventDefault(); abrir(false); boton.focus(); }
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); bs[(i + (e.key === "ArrowDown" ? 1 : bs.length - 1)) % bs.length].focus(); }
      });
      document.addEventListener("click", (e) => { if (!menu.hidden && !caja.contains(e.target)) abrir(false); });
      menu.addEventListener("focusout", (e) => { if (!menu.hidden && e.relatedTarget && !caja.contains(e.relatedTarget)) abrir(false); });
    }

    const primero = inicial();
    if (primero !== "es") poner(primero, false);
    else if (menu) { const b = menu.querySelector('[data-idioma="es"]'); if (b) b.setAttribute("aria-current", "true"); }
    // Para los verificadores: los nodos de texto que se cambiaron al idioma de ahora.
    const api = { idioma: () => idioma, poner, traducir: (t) => (idioma === "es" ? t : traduccion(limpio(t)) || t),
      traducidos: () => new Set(textosOriginales.map((x) => x[0])) };
    window.IdiomaPagina.actual = api;
    return api;
  }

  return { iniciar, NOMBRES };
})();

/*! rev bfb5bbb0d2d82f9f */
