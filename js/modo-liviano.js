/* Modo liviano: las páginas de tablet del Centroamericano (la del árbitro, la
   de la organización y la de Fair Play) en una tablet vieja.

   Escrito A PROPÓSITO en JavaScript viejo (ES5: var, function, sin flechas):
   es lo primero que corre y tiene que correr en cualquier tablet, también en
   las que no entienden el resto del sitio. Se carga en el <head>, antes de que
   se pinte nada, para que la página no se dibuje con adornos y después los
   pierda.

   Hace tres cosas:

   1. Rellena lo que le falta a un navegador viejo y usan estas páginas:
      `replaceChildren` (Chrome 86, Safari 14), `Array.flat` (Chrome 69,
      Safari 12), `Object.fromEntries`, `Promise.finally`, `String.replaceAll`,
      `Array.at`, `globalThis` y el <dialog> (`showModal`, Safari 15.4), que
      usan los avisos del sitio (`js/avisos.js`) y las ventanas de «Mis
      pareos» y «Todas las mesas». Sin esto, la página se quedaba en
      «Entrando a tus mesas…» sin decir nada.

   2. Decide si la tablet es vieja o lenta y enciende el modo liviano
      (`<html data-liviano="si">`): sin animaciones, sin sombras difuminadas,
      sin las hojas de la portada y con algunas consultas menos seguidas. Lo
      que la tablet DICE de sí misma: poca memoria (`deviceMemory` ≤ 2 GB),
      dos núcleos o menos, «ahorro de datos» o un navegador que no trae lo de
      arriba. Y lo que se MIDE: si en los primeros segundos dibuja menos de
      12 cuadros por segundo, va lenta aunque no lo diga; eso se recuerda para
      la próxima vez.

   3. Deja que el árbitro decida: el botón «Liviano» (cualquier botón con
      `data-modo-liviano-boton`) lo enciende o lo apaga y la elección se
      recuerda en esa tablet. Su elección manda sobre lo detectado.

   Las páginas preguntan con `ModoLiviano.activo()` y se enteran del cambio con
   `ModoLiviano.alCambiar(fn)`. Ver «Las tablets viejas: el modo liviano» en
   docs/decisiones/juegos-y-torneos.md. Lo revisa verificar-modo-liviano.js. */
(function () {
  "use strict";
  if (window.ModoLiviano) return;

  var EP = window.Element && Element.prototype;
  // Lo que trae el navegador, ANTES de rellenarlo: un navegador al que le falta es viejo.
  var faltaba = [];

  // ------------------------------------------------------------- 1. lo que le falta a un navegador viejo

  function definir(obj, nombre, valor) {
    if (!obj || obj[nombre]) return;
    if (faltaba.indexOf(nombre) < 0) faltaba.push(nombre);
    try { Object.defineProperty(obj, nombre, { value: valor, writable: true, configurable: true }); }
    catch (e) { obj[nombre] = valor; }
  }

  function reemplazarHijos() {
    while (this.lastChild) this.removeChild(this.lastChild);
    for (var i = 0; i < arguments.length; i++) {
      var h = arguments[i];
      this.appendChild(h && h.nodeType ? h : document.createTextNode(String(h)));
    }
  }
  if (EP) definir(EP, "replaceChildren", reemplazarHijos);
  if (window.Document) definir(Document.prototype, "replaceChildren", reemplazarHijos);
  if (window.DocumentFragment) definir(DocumentFragment.prototype, "replaceChildren", reemplazarHijos);

  // append / prepend (Chrome 54, Safari 10): las tablets más viejas que todavía andan.
  function anexar() {
    for (var i = 0; i < arguments.length; i++) {
      var h = arguments[i];
      this.appendChild(h && h.nodeType ? h : document.createTextNode(String(h)));
    }
  }
  if (EP) definir(EP, "append", anexar);
  if (window.DocumentFragment) definir(DocumentFragment.prototype, "append", anexar);
  if (EP) definir(EP, "remove", function () { if (this.parentNode) this.parentNode.removeChild(this); });

  definir(Array.prototype, "flat", function (hondo) {
    var n = hondo === undefined ? 1 : Number(hondo) || 0, out = [];
    (function aplanar(lista, nivel) {
      for (var i = 0; i < lista.length; i++) {
        if (Array.isArray(lista[i]) && nivel > 0) aplanar(lista[i], nivel - 1);
        else if (i in lista) out.push(lista[i]);
      }
    })(this, n);
    return out;
  });
  definir(Array.prototype, "at", function (i) {
    i = Math.trunc ? Math.trunc(i) || 0 : (i | 0);
    if (i < 0) i += this.length;
    return i < 0 || i >= this.length ? undefined : this[i];
  });
  definir(Object, "fromEntries", function (pares) {
    var o = {};
    if (pares && typeof pares.forEach === "function") pares.forEach(function (p) { o[p[0]] = p[1]; });
    else for (var i = 0; i < pares.length; i++) o[pares[i][0]] = pares[i][1];
    return o;
  });
  definir(String.prototype, "replaceAll", function (busca, pone) {
    if (busca instanceof RegExp) return this.replace(busca, pone);
    return String(this).split(String(busca)).join(String(pone));
  });
  if (window.Promise) {
    definir(Promise.prototype, "finally", function (fn) {
      var P = this.constructor || Promise;
      return this.then(
        function (v) { return P.resolve(fn()).then(function () { return v; }); },
        function (e) { return P.resolve(fn()).then(function () { throw e; }); });
    });
  }
  if (typeof window.globalThis === "undefined") { faltaba.push("globalThis"); window.globalThis = window; }

  // <dialog> (Safari 15.4). Sin él, `showModal()` no existe y los avisos del sitio («¿Anular esta
  // anotación?») ni se abren. Esto es lo justo: abrir encima de todo con un fondo que tapa la página,
  // cerrar con su valor, Escape y `<form method="dialog">`. Los estilos van por element.style (la CSP
  // deja; un <style> metido no hace falta).
  var dialogoNativo = (function () {
    try { return typeof document.createElement("dialog").showModal === "function"; } catch (e) { return false; }
  })();
  var abiertos = [];
  if (!dialogoNativo && EP) {
    faltaba.push("dialog");
    var protoDialogo = Object.getPrototypeOf(document.createElement("dialog"));
    var esDialogo = function (n) { return n && n.tagName === "DIALOG"; };
    var ponerFondo = function (d) {
      var f = document.createElement("div");
      f.setAttribute("data-dialogo-fondo", "");
      f.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:2147483000;";
      f.addEventListener("click", function (ev) { ev.stopPropagation(); });
      document.body.appendChild(f);
      d.__fondo = f;
    };
    var mostrar = function (d, modal) {
      if (!esDialogo(d)) return;
      if (d.hasAttribute("open")) return;
      d.setAttribute("open", "");
      d.style.display = "block";
      d.style.position = "fixed";
      d.style.left = "50%";
      d.style.top = "50%";
      d.style.margin = "0";
      d.style.maxHeight = "92vh";
      d.style.maxWidth = d.style.maxWidth || "calc(100% - 1rem)";
      d.style.overflow = "auto";
      d.style.zIndex = "2147483001";
      d.style.webkitTransform = d.style.transform = "translate(-50%, -50%)";
      if (modal) { ponerFondo(d); abiertos.push(d); }
    };
    var cerrar = function (d, valor) {
      if (!esDialogo(d) || !d.hasAttribute("open")) return;
      if (valor !== undefined) d.returnValue = String(valor);
      d.removeAttribute("open");
      d.style.display = "none";
      if (d.__fondo && d.__fondo.parentNode) d.__fondo.parentNode.removeChild(d.__fondo);
      d.__fondo = null;
      var i = abiertos.indexOf(d);
      if (i >= 0) abiertos.splice(i, 1);
      var ev;
      try { ev = new Event("close"); } catch (e) { ev = document.createEvent("Event"); ev.initEvent("close", false, false); }
      d.dispatchEvent(ev);
    };
    try {
      Object.defineProperty(protoDialogo, "showModal", { configurable: true, writable: true, value: function () { mostrar(this, true); } });
      Object.defineProperty(protoDialogo, "show", { configurable: true, writable: true, value: function () { mostrar(this, false); } });
      Object.defineProperty(protoDialogo, "close", { configurable: true, writable: true, value: function (v) { cerrar(this, v); } });
      Object.defineProperty(protoDialogo, "open", { configurable: true, get: function () { return esDialogo(this) ? this.hasAttribute("open") : undefined; }, set: function (v) { if (v) this.setAttribute("open", ""); else this.removeAttribute("open"); } });
    } catch (e) { /* sin defineProperty en el prototipo: queda sin diálogo */ }
    // El botón de enviar que se tocó (el Enter en un campo también «toca» el botón por omisión).
    var ultimoEnvio = null;
    document.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest("button, input[type=submit]") : null;
      if (b && (b.type === "submit")) ultimoEnvio = b;
    }, true);
    document.addEventListener("submit", function (ev) {
      var f = ev.target;
      if (!f || String(f.getAttribute("method") || "").toLowerCase() !== "dialog") return;
      ev.preventDefault();
      var d = f.closest ? f.closest("dialog") : null;
      var valor = ultimoEnvio && f.contains(ultimoEnvio) ? (ultimoEnvio.value || "") : "";
      ultimoEnvio = null;
      if (d) cerrar(d, valor);
    }, true);
    document.addEventListener("keydown", function (ev) {
      if ((ev.key !== "Escape" && ev.key !== "Esc") || !abiertos.length) return;
      var d = abiertos[abiertos.length - 1];
      var c;
      try { c = new Event("cancel", { cancelable: true }); } catch (e) { c = document.createEvent("Event"); c.initEvent("cancel", false, true); }
      if (d.dispatchEvent(c)) cerrar(d);
      ev.preventDefault();
    }, true);
    // Los <dialog> escritos en el HTML y sin abrir no se ven (un navegador sin <dialog> los pinta).
    document.addEventListener("DOMContentLoaded", function () {
      var todos = document.getElementsByTagName("dialog");
      for (var i = 0; i < todos.length; i++) if (!todos[i].hasAttribute("open")) todos[i].style.display = "none";
    });
  }

  // ------------------------------------------------------------- 2. ¿es una tablet vieja o lenta?

  var CLAVE = "modo_liviano_v1"; // "si" | "no" (lo que eligió quien la usa); sin valor: automático
  var CLAVE_MEDIDO = "modo_liviano_medido_v1"; // "lenta": se midió en una visita anterior
  var raiz = document.documentElement;
  var oyentes = [];

  function leer(clave) { try { return window.localStorage.getItem(clave); } catch (e) { return null; } }
  function escribir(clave, v) { try { if (v == null) window.localStorage.removeItem(clave); else window.localStorage.setItem(clave, v); } catch (e) { /* sin almacenamiento */ } }

  // En un navegador manejado por pruebas automáticas (`navigator.webdriver`; una tablet de verdad nunca lo tiene) no
  // se decide solo: lo que mediría depende de cuán cargada esté la máquina ese día, y encenderlo a mitad de una
  // prueba cambiaba lo que la prueba miraba. Solo si la prueba lo pide (`window.__modoLivianoAuto`, lo pone
  // verificar-modo-liviano.js). Lo que elige la persona con el botón vale siempre.
  var automatizado = !!(window.navigator && window.navigator.webdriver) && !window.__modoLivianoAuto;

  // Lo que la tablet dice de sí misma (no hace falta medir nada).
  function motivosDelAparato() {
    var n = window.navigator || {}, m = [];
    if (automatizado) return m;
    if (typeof n.deviceMemory === "number" && n.deviceMemory > 0 && n.deviceMemory <= 2) m.push("poca memoria (" + n.deviceMemory + " GB)");
    if (typeof n.hardwareConcurrency === "number" && n.hardwareConcurrency > 0 && n.hardwareConcurrency <= 2) m.push("procesador de " + n.hardwareConcurrency + " núcleos");
    if (n.connection && n.connection.saveData) m.push("ahorro de datos encendido");
    // Un navegador al que le faltó algo de arriba es viejo: `replaceAll` llegó junto con el `?.` y el `??`
    // que usa la librería de Supabase (Safari 13.1; Chrome 85, cinco versiones después). No se prueba la
    // sintaxis con `new Function`: depende de que la CSP deje `unsafe-eval`, y sin eso toda tablet sería «vieja».
    if (faltaba.length) m.push("navegador antiguo");
    if (leer(CLAVE_MEDIDO) === "lenta") m.push("dibujó lento en una visita anterior");
    return m;
  }

  var motivos = motivosDelAparato();
  var eleccion = function () { var v = leer(CLAVE); return v === "si" || v === "no" ? v : "auto"; };
  var activo = false;

  function aplicar() {
    var e = eleccion();
    var antes = activo;
    activo = e === "si" || (e === "auto" && motivos.length > 0);
    if (activo) raiz.setAttribute("data-liviano", "si"); else raiz.removeAttribute("data-liviano");
    pintarBotones();
    if (antes !== activo) for (var i = 0; i < oyentes.length; i++) { try { oyentes[i](activo); } catch (err) { /* que un oyente no frene a los otros */ } }
  }

  function pintarBotones() {
    if (!document.querySelectorAll) return;
    var bs = document.querySelectorAll("[data-modo-liviano-boton]");
    for (var i = 0; i < bs.length; i++) {
      bs[i].setAttribute("aria-pressed", activo ? "true" : "false");
      var estado = bs[i].querySelector("[data-modo-liviano-estado]");
      if (estado) estado.textContent = activo ? "sí" : "no";
      bs[i].title = activo
        ? "Modo liviano encendido" + (eleccion() === "auto" ? " solo (" + motivos.join(", ") + ")" : "") + ". Toca para apagarlo."
        : "Modo liviano apagado. Tócalo si la tablet va lenta: quita animaciones y adornos.";
    }
  }

  // Medir: los cuadros que dibuja en 3 s, un rato después de abrir (lo que pesa al cargar no cuenta).
  function medir() {
    if (automatizado || activo || eleccion() === "no" || !window.requestAnimationFrame) return;
    if (document.hidden) return; // pestaña de fondo: el navegador frena los cuadros a propósito
    var cuadros = 0, inicio = 0;
    function cuadro(t) {
      if (document.hidden) return;
      if (!inicio) inicio = t;
      cuadros++;
      if (t - inicio < 3000) { window.requestAnimationFrame(cuadro); return; }
      var porSegundo = cuadros / ((t - inicio) / 1000);
      if (porSegundo < 12) {
        escribir(CLAVE_MEDIDO, "lenta");
        motivos.push("dibuja " + Math.round(porSegundo) + " cuadros por segundo");
        aplicar();
        anunciar();
      }
    }
    window.requestAnimationFrame(cuadro);
  }

  // Se avisa UNA vez por visita, cuando se encendió solo (si lo encendió la persona, ya lo sabe).
  function anunciar() {
    if (!activo || eleccion() !== "auto") return;
    try { if (window.sessionStorage.getItem("modo_liviano_avisado")) return; window.sessionStorage.setItem("modo_liviano_avisado", "1"); } catch (e) { /* sin almacenamiento: se avisa igual */ }
    if (!window.Avisos || !document.querySelector("[data-modo-liviano-boton]")) return;
    window.Avisos.avisar("Esta tablet es antigua o va lenta: se encendió el modo liviano (sin animaciones ni adornos). Si quieres, lo apagas arriba, en «Liviano».", { tipo: "info", duracion: 9000 });
  }

  aplicar();

  document.addEventListener("DOMContentLoaded", function () {
    pintarBotones();
    var bs = document.querySelectorAll("[data-modo-liviano-boton]");
    for (var i = 0; i < bs.length; i++) {
      bs[i].addEventListener("click", function () {
        // Lo que se elige es lo contrario de lo que hay; si coincide con lo automático, igual se recuerda.
        escribir(CLAVE, activo ? "no" : "si");
        if (activo) escribir(CLAVE_MEDIDO, null); // lo apagó: lo medido antes ya no manda
        aplicar();
        if (window.Avisos) window.Avisos.avisar(activo ? "Modo liviano encendido: sin animaciones ni adornos." : "Modo liviano apagado.", { tipo: "info" });
      });
    }
  });
  window.addEventListener("load", function () {
    anunciar();
    window.setTimeout(medir, 2500);
  });

  window.ModoLiviano = {
    activo: function () { return activo; },
    motivos: function () { return motivos.slice(); },
    eleccion: eleccion,
    // "si" | "no" | "auto"
    elegir: function (v) { escribir(CLAVE, v === "si" || v === "no" ? v : null); aplicar(); },
    alCambiar: function (fn) { if (typeof fn === "function") oyentes.push(fn); },
    // Para quien quiera saber qué se rellenó (el verificador lo mira).
    rellenado: function () { return faltaba.slice(); }
  };
})();

/*! rev bfb5bbb0d2d82f9f */
