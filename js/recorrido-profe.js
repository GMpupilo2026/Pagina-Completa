/*
 * El recorrido del panel para quien da clase: cinco pasos que señalan dónde
 * está cada cosa la primera vez que un profesor entra a clases.html. Ver
 * «El recorrido del profesor nuevo» en docs/decisiones/paneles.md.
 *
 * - Sale UNA vez por cuenta y aparato (localStorage, con el id de la persona:
 *   en una computadora compartida, la siguiente cuenta lo ve igual). Es una
 *   comodidad: si el almacenamiento falla, sale de nuevo o no sale, y el panel
 *   funciona igual. «Ver el recorrido otra vez» (debajo del buscador) lo
 *   vuelve a abrir.
 * - No tapa el panel: es una tarjeta abajo, sin fondo oscuro, y la cosa de la
 *   que habla queda con un aro (la misma clase `buscar-resaltado` que usa el
 *   buscador de la clase). Se puede seguir usando el panel con la tarjeta
 *   abierta; Escape o «Saltar el recorrido» la cierran y no vuelve.
 * - Un paso cuya cosa no está en el panel de ESA persona (a quien le falta una
 *   tarjeta, o el «?» todavía no se destapó) se salta: un aro sobre nada
 *   confunde más que no decirlo.
 * - Cuando sale solo, NO mueve el foco: el panel acaba de dejarlo en su
 *   título y quien llegó puede estar ya escribiendo en el buscador. Lo dice
 *   por un role="status" y se llega a la tarjeta con Tab (es lo último de la
 *   página). Abierto con «Ver el recorrido otra vez», y en cada paso que se
 *   avanza, el foco va al título de la tarjeta; al cerrar vuelve a donde
 *   estaba.
 * - Escape lo cierra salvo que se esté escribiendo en otro campo: ese
 *   Escape es del campo (el buscador lo usa para borrar).
 */
(function () {
  "use strict";
  if (window.RecorridoProfe) return;

  var CLAVE = "recorrido_profe_v1:";

  /* Cada paso: qué señala (el primer selector que exista y se vea) y qué
     dice. Los textos dicen lo que hay, no lo que se puede imaginar. */
  var PASOS = [
    { donde: ["#buscar-panel"], titulo: "Busca lo que necesites",
      texto: "Escribe lo que quieres hacer o el nombre de un alumno: el panel deja solo lo que coincide y Enter lo abre. Desde cualquier página de la Academia, Ctrl + K te trae acá." },
    { donde: ["#grupo-clase-en-vivo"], titulo: "Tu clase en vivo",
      texto: "Desde aquí abres la clase. Adentro, «¿Qué quieres hacer?» encuentra cualquier herramienta (una ronda, un cuestionario, los puntos…) sin salir de la clase." },
    { donde: ["#grupo-tus-alumnos"], titulo: "Tus alumnos",
      texto: "Crear la cuenta de un alumno nuevo, ponerle tareas y exámenes, y ver sus informes y justificaciones." },
    { donde: ["#tile-grid a[href='informes.html']"], titulo: "El informe de cada alumno",
      texto: "Cómo viene cada uno. Arriba de su informe, «Con este alumno» te deja ponerle una tarea o un examen, o abrir su bitácora, su cuaderno y su libreta, sin volver al panel." },
    { donde: ["#ayuda-guia", "#tile-grid a[href='guia-del-profesor-accesible.html']"], titulo: "Si te trabas, la guía",
      texto: "El «?» de arriba, en cada página, abre el capítulo de la Guía del profesor que la explica. La guía completa está también en «Tu cuenta»." },
  ];

  function clave(uid) { return CLAVE + uid; }
  function visto(uid) { try { return localStorage.getItem(clave(uid)) === "1"; } catch (e) { return false; } }
  function marcarVisto(uid) { try { localStorage.setItem(clave(uid), "1"); } catch (e) {} }

  function seVe(el) { return !!el && (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null); }
  function objetivoDe(paso) {
    for (var i = 0; i < paso.donde.length; i++) {
      var el = document.querySelector(paso.donde[i]);
      if (seVe(el)) return el;
    }
    return null;
  }

  var anuncio = null;
  var tarjeta = null, resaltado = null, volverA = null, uidActual = null, pasos = [], i = 0;

  function quitarResaltado() {
    if (resaltado) resaltado.classList.remove("buscar-resaltado");
    resaltado = null;
  }

  function cerrar() {
    // El foco vuelve solo si estaba en la tarjeta: si no, ya está donde la persona lo puso.
    var devolver = tarjeta && tarjeta.contains(document.activeElement);
    quitarResaltado();
    if (tarjeta) tarjeta.remove();
    if (anuncio) anuncio.textContent = "";
    tarjeta = null;
    document.removeEventListener("keydown", alTeclear, true);
    if (uidActual) marcarVisto(uidActual);
    if (devolver && volverA && document.contains(volverA)) volverA.focus();
    volverA = null;
  }

  function alTeclear(e) {
    if (e.key !== "Escape" || !tarjeta) return;
    var t = e.target;
    var enOtroCampo = t && t.closest && !tarjeta.contains(t) && t.closest("input, textarea, select, [contenteditable]");
    if (enOtroCampo) return;
    e.preventDefault();
    cerrar();
  }

  function boton(texto, principal) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = texto;
    b.className = principal
      ? "text-sm font-bold px-4 py-2 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2"
      : "text-sm font-semibold px-3 py-2 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    return b;
  }

  function pintar(conFoco) {
    var paso = pasos[i];
    var el = paso.el;
    quitarResaltado();
    if (el) {
      resaltado = el;
      el.classList.add("buscar-resaltado");
      var quieto = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "center" });
    }
    tarjeta.replaceChildren();
    var cuenta = document.createElement("p");
    cuenta.className = "text-xs font-semibold text-brand-500 dark:text-brand-300";
    cuenta.textContent = "Paso " + (i + 1) + " de " + pasos.length;
    var h = document.createElement("h2");
    h.id = "recorrido-titulo";
    h.tabIndex = -1;
    h.className = "font-serif text-lg font-bold text-brand-800 dark:text-white mt-0.5 focus:outline-none";
    h.textContent = paso.titulo;
    var p = document.createElement("p");
    p.id = "recorrido-texto";
    p.className = "text-sm text-brand-700 dark:text-brand-200 mt-1";
    p.textContent = paso.texto;
    var fila = document.createElement("div");
    fila.className = "flex flex-wrap items-center justify-between gap-2 mt-4";
    var saltar = boton("Saltar el recorrido", false);
    saltar.addEventListener("click", cerrar);
    var der = document.createElement("div");
    der.className = "flex gap-2";
    if (i > 0) {
      var ant = boton("Anterior", false);
      ant.addEventListener("click", function () { i--; pintar(true); });
      der.appendChild(ant);
    }
    var ultimo = i === pasos.length - 1;
    var sig = boton(ultimo ? "Listo, a trabajar" : "Siguiente", true);
    sig.addEventListener("click", function () { if (ultimo) cerrar(); else { i++; pintar(true); } });
    der.appendChild(sig);
    fila.append(saltar, der);
    tarjeta.append(cuenta, h, p, fila);
    if (conFoco) h.focus({ preventScroll: true });
    else if (anuncio) anuncio.textContent = "Recorrido del panel, paso 1 de " + pasos.length + ": " + paso.titulo + ". Lo encuentras al final de la página.";
  }

  /* Abre el recorrido. `auto`: solo si esta persona todavía no lo vio. */
  function abrir(opciones) {
    opciones = opciones || {};
    var uid = opciones.uid;
    if (!uid || tarjeta) return false;
    if (opciones.auto && visto(uid)) return false;
    pasos = PASOS.map(function (p) { return { titulo: p.titulo, texto: p.texto, el: objetivoDe(p) }; })
      .filter(function (p) { return p.el; });
    if (!pasos.length) return false;
    uidActual = uid;
    i = 0;
    volverA = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    tarjeta = document.createElement("section");
    tarjeta.id = "recorrido-profe";
    tarjeta.setAttribute("role", "dialog");
    tarjeta.setAttribute("aria-modal", "false");
    tarjeta.setAttribute("aria-labelledby", "recorrido-titulo");
    tarjeta.setAttribute("aria-describedby", "recorrido-texto");
    tarjeta.className = "fixed z-50 bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:w-[24rem] bg-white dark:bg-brand-900 rounded-2xl shadow-2xl border border-brand-200 dark:border-brand-700 p-5";
    document.body.appendChild(tarjeta);
    if (!anuncio) {
      anuncio = document.createElement("p");
      anuncio.className = "sr-only";
      anuncio.setAttribute("role", "status");
      document.body.appendChild(anuncio);
    }
    document.addEventListener("keydown", alTeclear, true);
    pintar(!opciones.auto);
    return true;
  }

  window.RecorridoProfe = { abrir: abrir, PASOS: PASOS, visto: visto };
})();
