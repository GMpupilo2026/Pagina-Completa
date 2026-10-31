/* El código de centroamericano-2026.html: tres cosas que la página hace sola.
 *
 * 1. «Hoy en el torneo» (#hoy): con las horas del calendario —el data-inicio
 *    de cada fila de #calendario, en hora de Costa Rica, y data-minutos, lo que
 *    dura—, la cuenta regresiva antes del festival, lo que se juega ahora y lo
 *    que sigue durante, y el cierre después. Una sola copia de las horas: la
 *    tabla. Se vuelve a pintar cada 30 segundos.
 * 2. Sin internet: la página se guarda entera en la caché del aparato
 *    («ajedrez-integral-sin-red», la que sw.js no borra al cambiar de versión),
 *    con sus scripts, hojas, imágenes, fuentes y el PDF de las bases. Se vuelve
 *    a guardar cada vez que se abre con señal, como «Ejercicios sin internet»:
 *    así no queda un HTML de un día con el CSS de otro.
 * 3. El inglés y el francés (el botón #cac-idioma, que dice el idioma de
 *    ahora y abre la lista #cac-idiomas con los tres): cambian cada texto de la página
 *    por el suyo de js/centroamericano-en.js o js/centroamericano-fr.js
 *    —también lo que se arma después, como la ventana de las bases— y lo
 *    dejan como estaba al volver al español. La elección se recuerda en este
 *    aparato; sin elección, va en español. `?lang=en`, `?lang=fr` o
 *    `?lang=es` en la dirección mandan (el cartel lleva el enlace en inglés).
 *
 * 4. Los botones de «Qué hacer en el tiempo libre» (#paseos), que filtran los
 *    lugares por su etiqueta.
 *
 * Ver «La página del Centroamericano 2026» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  const ZONA = "America/Costa_Rica";
  const CACHE = "ajedrez-integral-sin-red";
  const CLAVE_IDIOMA = "cac_idioma_v1";
  const IDIOMAS = ["es", "en", "fr"];
  const MAPAS = {
    en: (window.CentroamericanoEN && window.CentroamericanoEN.textos) || {},
    fr: (window.CentroamericanoFR && window.CentroamericanoFR.textos) || {},
  };
  const NOMBRES = { es: "Español", en: "English", fr: "Français" };
  const ATRIBUTOS = ["alt", "aria-label", "title", "data-ventana", "placeholder"];
  const $ = (id) => document.getElementById(id);

  let idioma = "es";

  /* ---------------- el idioma ---------------- */
  const limpio = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const textosOriginales = [];       // [nodo de texto, su texto en español]
  const atributosOriginales = [];    // [elemento, atributo, su valor en español]

  function fueraDeTraduccion(el) {
    return !el || !!el.closest("script, style, [data-no-traducir]");
  }

  function traducirTexto(nodo) {
    if (fueraDeTraduccion(nodo.parentElement)) return;
    const original = nodo.nodeValue;
    const otro = (MAPAS[idioma] || {})[limpio(original)];
    if (otro == null) return;
    const antes = original.match(/^\s*/)[0], despues = original.match(/\s*$/)[0];
    const nuevo = antes + otro + despues;
    if (nuevo === original) return;
    textosOriginales.push([nodo, original]);
    nodo.nodeValue = nuevo;
  }

  function traducirAtributos(el) {
    if (fueraDeTraduccion(el)) return;
    ATRIBUTOS.forEach((a) => {
      if (!el.hasAttribute(a)) return;
      const v = el.getAttribute(a);
      const otro = (MAPAS[idioma] || {})[limpio(v)];
      if (otro == null || otro === v) return;
      atributosOriginales.push([el, a, v]);
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

  // Lo que se arma con la página en inglés (la ventana de las bases, el
  // «Cambiar a modo claro» del botón del tema) también se traduce.
  const vigia = new MutationObserver((cambios) => {
    if (idioma === "es") return;
    cambios.forEach((c) => {
      if (c.type === "childList") c.addedNodes.forEach(traducir);
      else if (c.type === "characterData") traducirTexto(c.target);
      else if (c.type === "attributes") traducirAtributos(c.target);
    });
  });

  const TITULO = { es: document.title, en: (window.CentroamericanoEN && window.CentroamericanoEN.titulo) || document.title,
    fr: (window.CentroamericanoFR && window.CentroamericanoFR.titulo) || document.title };

  function ponerIdioma(nuevo, recordar) {
    if (IDIOMAS.indexOf(nuevo) === -1) nuevo = "es";
    if (recordar) { try { localStorage.setItem(CLAVE_IDIOMA, nuevo); } catch (e) {} }
    if (nuevo === idioma) { pintarHoy(); return; }
    // Los mapas van del español a cada idioma: de inglés a francés se pasa por él.
    vigia.disconnect();
    volverAlEspanol();
    idioma = nuevo;
    if (idioma !== "es") {
      traducir(document.body);
      vigia.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
    }
    document.documentElement.lang = idioma;
    document.title = TITULO[idioma];
    // Lo que se arma con datos (js/centroamericano-vivo.js) se vuelve a pintar en el idioma nuevo.
    document.dispatchEvent(new CustomEvent("cac-idioma", { detail: idioma }));
    // El botón dice el idioma de ahora («ES», «EN», «FR» en el celular, con
    // el nombre completo en una pantalla ancha y para el lector), y en la
    // lista queda marcado. «Idioma · Language · Langue» va en los tres: lo
    // tiene que encontrar quien no lee el de ahora.
    const boton = $("cac-idioma");
    if (boton) {
      boton.lang = idioma;
      boton.setAttribute("aria-label", "Idioma · Language · Langue : " + NOMBRES[idioma]);
      boton.children[0].textContent = idioma.toUpperCase();
      boton.children[1].textContent = NOMBRES[idioma];
    }
    document.querySelectorAll("#cac-idiomas [data-idioma]").forEach((b) => {
      if (b.dataset.idioma === idioma) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
    });
    pintarHoy();
  }

  function idiomaInicial() {
    const pedido = new URLSearchParams(location.search).get("lang");
    if (IDIOMAS.indexOf(pedido) !== -1) return pedido;
    try {
      const guardado = localStorage.getItem(CLAVE_IDIOMA);
      if (IDIOMAS.indexOf(guardado) !== -1) return guardado;
    } catch (e) {}
    // Sin elección, en español: la página es de un torneo en Costa Rica, y
    // tomarlo del navegador la cambiaba a quien tiene el celular en inglés.
    return "es";
  }

  /* ---------------- «Hoy en el torneo» ---------------- */
  const TEXTOS = {
    es: {
      cuenta: "Cuenta regresiva", hoy: "Hoy en el torneo", termino: "El festival terminó",
      faltan: (n, u) => "Faltan " + n + " " + u, dias: ["día", "días"], horas: ["hora", "horas"], minutos: ["minuto", "minutos"],
      empieza: (ev, cuando) => "Empieza con «" + ev + "», " + cuando + ".",
      ronda1: (cuando) => " La ronda 1 se juega " + cuando + ".",
      ahora: (ev) => "Ahora: " + ev, proximo: (ev) => "Lo próximo: " + ev,
      empezo: (h) => "Empezó a las " + h + ".", despues: (ev, cuando) => " Después: " + ev + ", " + cuando + ".",
      cuando: (cuando, falta) => cuando.charAt(0).toUpperCase() + cuando.slice(1) + " (faltan " + falta + ").",
      hoyA: (h) => "hoy a las " + h, mananaA: (d, h) => "mañana, " + d + ", a las " + h, diaA: (d, h) => "el " + d + " a las " + h,
      gracias: "¡Gracias por venir a Costa Rica!", final: "La clasificación final de cada categoría está en «Resultados en vivo».",
      zona: "hora de Costa Rica", locale: "es-CR",
    },
    en: {
      cuenta: "Countdown", hoy: "Today at the tournament", termino: "The festival is over",
      faltan: (n, u) => n + " " + u + " to go", dias: ["day", "days"], horas: ["hour", "hours"], minutos: ["minute", "minutes"],
      empieza: (ev, cuando) => "It starts with “" + ev + "”, " + cuando + ".",
      ronda1: (cuando) => " Round 1 is played " + cuando + ".",
      ahora: (ev) => "Now: " + ev, proximo: (ev) => "Up next: " + ev,
      empezo: (h) => "It started at " + h + ".", despues: (ev, cuando) => " Then: " + ev + ", " + cuando + ".",
      cuando: (cuando, falta) => cuando.charAt(0).toUpperCase() + cuando.slice(1) + " (in " + falta + ").",
      hoyA: (h) => "today at " + h, mananaA: (d, h) => "tomorrow, " + d + ", at " + h, diaA: (d, h) => "on " + d + " at " + h,
      gracias: "Thank you for coming to Costa Rica!", final: "The final standings of every section are in “Live results”.",
      zona: "Costa Rica time", locale: "en-US",
    },
    // El francés está en js/centroamericano-fr.js (sin él, esta página va en español).
    fr: window.CentroamericanoFR ? window.CentroamericanoFR.hoy : null,
  };

  function eventos() {
    return [...document.querySelectorAll("#calendario tr[data-inicio]")].map((tr) => {
      const inicio = new Date(tr.dataset.inicio + ":00-06:00");   // Costa Rica no tiene horario de verano
      const fin = new Date(inicio.getTime() + (Number(tr.dataset.minutos) || 60) * 60000);
      return { tr, inicio, fin, nombre: () => limpio(tr.querySelector("th").textContent) };
    }).filter((e) => !isNaN(e.inicio)).sort((a, b) => a.inicio - b.inicio);
  }

  const plural = (n, par) => n + " " + (n === 1 ? par[0] : par[1]);
  const diaCR = (d) => d.toLocaleDateString("en-CA", { timeZone: ZONA });
  function hora(d, t) { return d.toLocaleTimeString(t.locale, { hour: "numeric", minute: "2-digit", timeZone: ZONA }); }
  // «domingo 1 de noviembre» (sin la coma que pone es-CR) / «Sunday, November 1».
  function dia(d, t) {
    const s = d.toLocaleDateString(t.locale, { weekday: "long", day: "numeric", month: "long", timeZone: ZONA });
    return t.locale === "es-CR" ? s.replace(",", "") : s;
  }

  function cuando(d, ahora, t) {
    const hoy = diaCR(ahora), ese = diaCR(d);
    const manana = diaCR(new Date(ahora.getTime() + 24 * 3600000));
    if (ese === hoy) return t.hoyA(hora(d, t));
    if (ese === manana) return t.mananaA(dia(d, t), hora(d, t));
    return t.diaA(dia(d, t), hora(d, t));
  }

  function falta(ms, t) {
    const min = Math.max(1, Math.round(ms / 60000));
    if (min < 60) return plural(min, t.minutos);
    const h = Math.floor(min / 60), m = min % 60;
    return h + " h" + (m ? " " + m + " min" : "");
  }

  function pintarHoy() {
    const caja = $("hoy");
    if (!caja) return;
    const t = TEXTOS[idioma] || TEXTOS.es;
    const evs = eventos();
    if (!evs.length) return;
    const ahora = new Date();
    const primero = evs[0], ultimo = evs[evs.length - 1];
    let etiqueta, principal, detalle;
    if (ahora < primero.inicio) {
      const ms = primero.inicio - ahora;
      const dias = Math.floor(ms / 86400000);
      etiqueta = t.cuenta;
      principal = dias >= 2 ? t.faltan(dias, t.dias[1])
        : ms >= 3600000 ? t.faltan(Math.floor(ms / 3600000), Math.floor(ms / 3600000) === 1 ? t.horas[0] : t.horas[1])
        : t.faltan(Math.max(1, Math.round(ms / 60000)), Math.round(ms / 60000) === 1 ? t.minutos[0] : t.minutos[1]);
      const r1 = evs.find((e) => e.tr.hasAttribute("data-primera-ronda"));
      detalle = t.empieza(primero.nombre(), cuando(primero.inicio, ahora, t) + " (" + t.zona + ")")
        + (r1 ? t.ronda1(cuando(r1.inicio, ahora, t)) : "");
    } else if (ahora >= ultimo.fin) {
      etiqueta = t.termino;
      principal = t.gracias;
      detalle = t.final;
    } else {
      etiqueta = t.hoy;
      const enCurso = evs.filter((e) => e.inicio <= ahora && ahora < e.fin).pop();
      const siguiente = evs.find((e) => e.inicio > ahora);
      if (enCurso) {
        principal = t.ahora(enCurso.nombre());
        detalle = t.empezo(hora(enCurso.inicio, t)) + (siguiente ? t.despues(siguiente.nombre(), cuando(siguiente.inicio, ahora, t)) : "");
      } else {
        principal = t.proximo(siguiente.nombre());
        detalle = t.cuando(cuando(siguiente.inicio, ahora, t), falta(siguiente.inicio - ahora, t));
      }
    }
    $("hoy-etiqueta").textContent = etiqueta;
    $("hoy-principal").textContent = principal;
    // «9:30 a. m.» ya trae su punto: no se le pone otro.
    $("hoy-detalle").textContent = detalle.replace(/\.\./g, ".");
    caja.dataset.estado = ahora < primero.inicio ? "antes" : ahora >= ultimo.fin ? "despues" : "durante";
    // Lo fijo de la franja va en el idioma de la página.
    const fijo = { es: { calendario: "Ver el calendario completo →", sinRed: "Esta página quedó guardada en este aparato: la puedes abrir aunque no haya internet en la sala.", ics: "Agregar a mi calendario" },
      en: window.CentroamericanoEN && window.CentroamericanoEN.franja, fr: window.CentroamericanoFR && window.CentroamericanoFR.franja }[idioma] || {};
    if (fijo.calendario) {
      $("hoy-calendario").textContent = fijo.calendario;
      $("hoy-sin-red-texto").textContent = fijo.sinRed;
      $("hoy-ics-texto").textContent = fijo.ics;
    }
  }

  /* ---------------- sin internet ---------------- */
  // Todo lo que la página necesita para abrir sin red: ella misma (con y sin
  // .html: Cloudflare redirige una a la otra), lo que ya cargó del sitio
  // (scripts, hojas, imágenes, fuentes) y el PDF de las bases.
  function archivosDeLaPagina() {
    const urls = new Set();
    const propio = (u) => { try { const x = new URL(u, location.href); if (x.origin === location.origin) urls.add(x.pathname); } catch (e) {} };
    const p = location.pathname;
    urls.add(p);
    urls.add(/\.html$/.test(p) ? p.replace(/\.html$/, "") : p + ".html");
    document.querySelectorAll("script[src], link[rel='stylesheet'][href], img[src]").forEach((n) => propio(n.getAttribute("src") || n.getAttribute("href")));
    (performance.getEntriesByType ? performance.getEntriesByType("resource") : []).forEach((e) => propio(e.name));
    document.querySelectorAll("a[data-ventana][href$='.pdf']").forEach((a) => propio(a.getAttribute("href")));
    return [...urls];
  }

  async function guardarParaSinRed() {
    if (!window.caches || navigator.onLine === false) return;
    try {
      const cache = await caches.open(CACHE);
      const urls = archivosDeLaPagina();
      const hechos = await Promise.all(urls.map((u) => cache.add(u).then(() => true, () => false)));
      if (hechos[0] || hechos[1]) $("hoy-sin-red").hidden = false;
    } catch (e) { /* sin caché (navegación privada): la página igual funciona con señal */ }
  }

  /* ---------------- instalar en iPhone ---------------- */
  // Safari no avisa que la página se puede instalar (no tiene
  // beforeinstallprompt, que en Android usa js/pwa.js): se explica cómo, una
  // vez, hasta que se toca «Entendido». Instalada, los avisos pueden llegar.
  const CLAVE_IOS = "cac_instalar_ios_v1";
  function ofrecerIos() {
    const caja = $("instalar-ios");
    if (!caja) return;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const instalada = window.navigator.standalone === true || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
    let visto = false;
    try { visto = localStorage.getItem(CLAVE_IOS) === "1"; } catch (e) {}
    if (!ios || instalada || visto) return;
    caja.hidden = false;
    caja.querySelector("[data-instalar-ios-no]").addEventListener("click", () => {
      caja.hidden = true;
      try { localStorage.setItem(CLAVE_IOS, "1"); } catch (e) {}
    });
  }

  /* ---------------- los paseos ---------------- */
  // «Qué hacer en el tiempo libre» (#paseos): cada botón deja los lugares que
  // tienen su etiqueta (data-etiquetas); «Todos», todos. El puesto dice
  // aria-pressed y lleva «✓», no solo el color.
  const paseos = document.querySelector("#paseos [data-paseos]");
  if (paseos) {
    const filtros = document.querySelectorAll("#paseos [data-paseo-filtro]");
    filtros.forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.paseoFiltro;
      filtros.forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
      paseos.querySelectorAll(".cac-paseo").forEach((li) => { li.hidden = k !== "todos" && li.dataset.etiquetas.split(" ").indexOf(k) === -1; });
    }));
  }

  /* ---------------- arranque ---------------- */
  ofrecerIos();
  // El menú de idiomas: se abre con el botón y se cierra al elegir, con
  // Escape (el foco vuelve al botón) o tocando afuera.
  const boton = $("cac-idioma"), menu = $("cac-idiomas");
  if (boton && menu) {
    const abrir = (si) => { menu.hidden = !si; boton.setAttribute("aria-expanded", si ? "true" : "false"); };
    boton.addEventListener("click", () => {
      abrir(menu.hidden);
      if (!menu.hidden) (menu.querySelector("[aria-current]") || menu.querySelector("button")).focus();
    });
    menu.addEventListener("click", (e) => {
      const b = e.target.closest("[data-idioma]");
      if (!b) return;
      abrir(false);
      ponerIdioma(b.dataset.idioma, true);
      boton.focus();
    });
    menu.addEventListener("keydown", (e) => {
      const bs = [...menu.querySelectorAll("button")], i = bs.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); abrir(false); boton.focus(); }
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); bs[(i + (e.key === "ArrowDown" ? 1 : bs.length - 1)) % bs.length].focus(); }
    });
    document.addEventListener("click", (e) => { if (!menu.hidden && !e.target.closest(".cac-idioma")) abrir(false); });
    menu.addEventListener("focusout", (e) => { if (!menu.hidden && e.relatedTarget && !e.relatedTarget.closest(".cac-idioma")) abrir(false); });
  }
  ponerIdioma(idiomaInicial(), false);
  setInterval(pintarHoy, 30000);
  if (document.readyState === "complete") guardarParaSinRed();
  else window.addEventListener("load", guardarParaSinRed);
})();
