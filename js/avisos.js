/* ===== Ajedrez Integral — Avisos y confirmaciones de TODO el sitio =====
 *
 * Reemplaza a `alert()`, `confirm()` y `prompt()` del navegador. Esas tres
 * ventanas no siguen el modo oscuro ni el tema de la plataforma, congelan la
 * página entera (el reloj de una partida incluido), en el celular parecen un
 * error del sistema y no dejan ofrecer «Deshacer». Había más de cien repartidas
 * en veinte páginas, cada una con su propia redacción.
 *
 *   Avisos.avisar(texto, { tipo, deshacer, duracion })
 *       Un mensaje corto arriba de la página que se va solo. `tipo` es "ok"
 *       (por defecto), "info" o "error". Los de error NO se van solos: se
 *       cierran con ✕, porque un error que desaparece mientras uno lo lee es
 *       un error que no se leyó. `deshacer` es una función: el mensaje lleva
 *       el botón «Deshacer» y queda más tiempo.
 *
 *   await Avisos.confirmar(texto, { titulo, aceptar, cancelar, peligro })
 *       → true / false. Diálogo propio en vez de `confirm()`. `aceptar` dice
 *       lo que va a pasar ("Eliminar", "Enviar"), nunca "Aceptar": el botón se
 *       entiende sin leer la pregunta. Con `peligro` el botón va en rojo y el
 *       foco arranca en «Cancelar», así un Enter apurado no borra nada.
 *
 *   await Avisos.alerta(texto, { titulo, aceptar })
 *       Lo que hay que leer sí o sí antes de seguir (el aviso de salida de un
 *       examen, el usuario de una cuenta recién creada). Un solo botón.
 *
 *   await Avisos.pedir(texto, { valor, etiqueta, aceptar })
 *       → el texto escrito, o null si se canceló. En vez de `prompt()`.
 *
 *   await Avisos.formulario({ titulo, texto, campos, aceptar })
 *       → { nombre: valor, … } o null. Varios datos de una vez (el pago de un
 *       cobro: monto, método y comprobante) en vez de tres `prompt()` seguidos.
 *       Cada campo: { nombre, etiqueta, tipo: "text"|"select", valor,
 *       opciones: [[valor, texto]…], ayuda, inputmode }.
 *
 * Todo texto entra por `textContent`: lo que se muestra suele llevar el
 * nombre de un alumno o el mensaje de error de la base.
 *
 * Se carga con un <script> normal (no módulo) y deja `window.Avisos`. Los
 * colores son pares que ya se usan en el sitio y que
 * herramientas/verificar-avisos.js mide contra el fondo real.
 */
(function () {
  "use strict";
  if (window.Avisos) return;

  const DURACION = { ok: 6000, info: 6000, error: 0 };
  const DURACION_DESHACER = 10000;
  const MAX_VISIBLES = 3;

  const CLASES_MENSAJE = {
    ok: "bg-brand-900 text-white",
    info: "bg-brand-900 text-white",
    error: "bg-red-700 text-white",
  };
  const ICONO = { ok: "✓", info: "ℹ️", error: "⚠️" };

  function el(tag, clases, texto) {
    const n = document.createElement(tag);
    if (clases) n.className = clases;
    if (texto != null) n.textContent = texto;
    return n;
  }

  // ------------------------------------------------------------- mensajes
  let zona = null;

  /* Dónde van los mensajes: en la página, o DENTRO del diálogo modal que esté
     abierto. Un diálogo modal deja inerte todo lo de afuera, así que un
     mensaje que saliera en la página mientras el diálogo está abierto se
     vería detrás, oscurecido, y su «Deshacer» no se podría tocar. */
  function duenoDeLosMensajes() {
    const modales = [...document.querySelectorAll("dialog")].filter((d) => d.matches(":modal"));
    return modales.length ? modales[modales.length - 1] : document.body;
  }

  function zonaDeMensajes() {
    const dueno = duenoDeLosMensajes();
    if (zona && zona.parentNode === dueno) return zona;
    const nueva = el("div", "fixed top-3 inset-x-0 z-[80] flex flex-col items-center gap-2 px-4 pointer-events-none");
    nueva.id = "avisos-zona";
    nueva.setAttribute("role", "region");
    nueva.setAttribute("aria-label", "Avisos");
    dueno.appendChild(nueva);
    // Los que ya estaban a la vista se mudan con la zona: no se pierde ninguno.
    if (zona) { [...zona.children].forEach((m) => nueva.appendChild(m)); zona.remove(); }
    zona = nueva;
    return zona;
  }

  /* Al cerrarse un diálogo, los mensajes que salieron adentro vuelven a la
     página, con su tiempo y su «Deshacer» intactos. */
  function devolverMensajes(dialogo) {
    if (!zona || !dialogo.contains(zona)) return;
    const quedan = [...zona.children];
    zona.remove();
    zona = null;
    if (!quedan.length) return;
    const caja = zonaDeMensajes();
    quedan.forEach((m) => caja.appendChild(m));
  }

  function avisar(texto, opciones) {
    const o = opciones || {};
    const tipo = CLASES_MENSAJE[o.tipo] ? o.tipo : "ok";
    const caja = zonaDeMensajes();
    while (caja.children.length >= MAX_VISIBLES) caja.firstElementChild.remove();

    const m = el("div", "avisos-mensaje pointer-events-auto w-full max-w-md rounded-xl shadow-lg px-4 py-3 text-sm flex items-start gap-3 " + CLASES_MENSAJE[tipo]);
    m.dataset.tipo = tipo;
    // Un error interrumpe al lector de pantalla; un "listo" espera su turno.
    m.setAttribute("role", tipo === "error" ? "alert" : "status");
    const icono = el("span", "shrink-0", ICONO[tipo]);
    icono.setAttribute("aria-hidden", "true");
    m.appendChild(icono);
    const cuerpo = el("p", "flex-1 min-w-0 whitespace-pre-line break-words", String(texto));
    m.appendChild(cuerpo);

    let timer = null;
    const cerrar = () => { clearTimeout(timer); m.remove(); };

    if (typeof o.deshacer === "function") {
      const b = el("button", "shrink-0 font-bold underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white", "Deshacer");
      b.type = "button";
      b.dataset.avisosDeshacer = "";
      b.addEventListener("click", async () => {
        cerrar();
        try { await o.deshacer(); }
        catch (err) { avisar("No se pudo deshacer: " + (err && err.message ? err.message : err), { tipo: "error" }); }
      });
      m.appendChild(b);
    }
    const x = el("button", "shrink-0 w-6 h-6 -mr-1 rounded leading-none opacity-90 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white", "✕");
    x.type = "button";
    x.setAttribute("aria-label", "Cerrar aviso");
    x.addEventListener("click", cerrar);
    m.appendChild(x);

    const dura = o.duracion != null ? o.duracion
      : (typeof o.deshacer === "function" ? DURACION_DESHACER : DURACION[tipo]);
    const programar = () => { if (dura > 0) timer = setTimeout(cerrar, dura); };
    // Mientras el mouse o el foco están encima, no se va: nadie tiene que
    // alcanzar a apretar «Deshacer» contra reloj.
    m.addEventListener("mouseenter", () => clearTimeout(timer));
    m.addEventListener("mouseleave", programar);
    m.addEventListener("focusin", () => clearTimeout(timer));
    m.addEventListener("focusout", (e) => { if (!m.contains(e.relatedTarget)) programar(); });

    caja.appendChild(m);
    programar();
    return { cerrar };
  }

  // ------------------------------------------------------------- diálogos
  // Uno a la vez: si una página pide dos confirmaciones seguidas, la segunda
  // espera a que se conteste la primera en vez de taparla.
  let cola = Promise.resolve();
  function enCola(fn) {
    const p = cola.then(fn, fn);
    cola = p.catch(() => {});
    return p;
  }

  const BTN_BASE = "font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-brand-900";
  const BTN_CANCELAR = BTN_BASE + " border border-brand-200 dark:border-brand-700 text-brand-700 dark:text-brand-200 hover:border-accent-400";
  const BTN_ACEPTAR = BTN_BASE + " bg-accent-500 hover:bg-accent-600 text-brand-900";
  const BTN_PELIGRO = BTN_BASE + " bg-red-700 hover:bg-red-800 text-white";
  const CAMPO = "w-full rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 text-brand-800 dark:text-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";

  let serie = 0;

  /* El diálogo base: <dialog> con showModal(), que ya encierra el foco, pone
     el fondo inerte y cierra con Escape. Devuelve los valores de los campos
     (o {} si no hay), o null si se canceló. */
  function abrir(conf) {
    return enCola(() => new Promise((resolver) => {
      const id = "avisos-" + (++serie);
      const antes = document.activeElement;
      const d = el("dialog", "avisos-dialogo w-[calc(100%-2rem)] max-w-md rounded-2xl shadow-2xl p-0 bg-white dark:bg-brand-900 text-brand-800 dark:text-white backdrop:bg-black/50");
      d.dataset.avisos = conf.clase;
      const form = el("form", "p-6");
      form.method = "dialog";
      d.appendChild(form);

      if (conf.titulo) {
        const h = el("h2", "font-serif text-lg font-bold mb-2", conf.titulo);
        h.id = id + "-titulo";
        form.appendChild(h);
        d.setAttribute("aria-labelledby", h.id);
      }
      if (conf.texto) {
        const p = el("p", "text-sm text-brand-600 dark:text-brand-200 whitespace-pre-line break-words", conf.texto);
        p.id = id + "-texto";
        form.appendChild(p);
        if (conf.titulo) d.setAttribute("aria-describedby", p.id);
        else d.setAttribute("aria-labelledby", p.id);
      }

      const entradas = [];
      (conf.campos || []).forEach((c, i) => {
        const envoltura = el("div", "mt-4");
        const lab = el("label", "block text-sm font-semibold mb-1", c.etiqueta || "");
        const campoId = id + "-campo-" + i;
        lab.htmlFor = campoId;
        let input;
        if (c.tipo === "select") {
          input = el("select", CAMPO);
          (c.opciones || []).forEach(([valor, texto]) => {
            const op = el("option", null, texto);
            op.value = valor;
            input.appendChild(op);
          });
        } else {
          input = el("input", CAMPO);
          input.type = "text";
          if (c.inputmode) input.inputMode = c.inputmode;
          input.autocomplete = "off";
        }
        input.id = campoId;
        input.name = c.nombre;
        if (c.valor != null) input.value = String(c.valor);
        if (c.soloLectura) { input.readOnly = true; }
        if (c.etiqueta) envoltura.appendChild(lab);
        else input.setAttribute("aria-label", conf.texto || c.nombre);
        envoltura.appendChild(input);
        if (c.ayuda) {
          const ay = el("p", "text-xs text-brand-500 dark:text-brand-300 mt-1", c.ayuda);
          ay.id = campoId + "-ayuda";
          input.setAttribute("aria-describedby", ay.id);
          envoltura.appendChild(ay);
        }
        form.appendChild(envoltura);
        entradas.push(input);
      });

      const botones = el("div", "mt-6 flex flex-wrap justify-end gap-2");
      let cancelar = null;
      if (conf.cancelar !== false) {
        cancelar = el("button", BTN_CANCELAR, conf.cancelar || "Cancelar");
        cancelar.type = "button";
        cancelar.dataset.avisosCancelar = "";
        cancelar.addEventListener("click", () => d.close("cancelar"));
        botones.appendChild(cancelar);
      }
      const aceptar = el("button", conf.peligro ? BTN_PELIGRO : BTN_ACEPTAR, conf.aceptar || "Aceptar");
      aceptar.type = "submit";
      aceptar.value = "aceptar";
      aceptar.dataset.avisosAceptar = "";
      botones.appendChild(aceptar);
      form.appendChild(botones);

      d.addEventListener("close", () => {
        const ok = d.returnValue === "aceptar";
        const valores = {};
        entradas.forEach((i) => { valores[i.name] = i.value; });
        devolverMensajes(d);
        d.remove();
        if (antes && typeof antes.focus === "function" && document.contains(antes)) antes.focus();
        resolver(ok ? valores : null);
      });

      document.body.appendChild(d);
      d.returnValue = "";
      d.showModal();
      // Si había mensajes a la vista, se mudan adentro: afuera quedarían inertes.
      if (zona && zona.children.length) zonaDeMensajes();
      // Dónde arranca el foco: en el primer campo si hay que escribir; si no,
      // en «Cancelar» cuando lo que sigue no tiene vuelta atrás.
      const primero = entradas[0] || (conf.peligro && cancelar) || aceptar;
      primero.focus();
      if (entradas[0] && entradas[0].select && entradas[0].tagName === "INPUT") entradas[0].select();
    }));
  }

  function confirmar(texto, opciones) {
    const o = opciones || {};
    return abrir({ clase: "confirmar", titulo: o.titulo, texto, aceptar: o.aceptar || "Sí, seguir",
                   cancelar: o.cancelar, peligro: !!o.peligro })
      .then((r) => r !== null);
  }

  function alerta(texto, opciones) {
    const o = opciones || {};
    return abrir({ clase: "alerta", titulo: o.titulo, texto, aceptar: o.aceptar || "Entendido", cancelar: false })
      .then(() => undefined);
  }

  function pedir(texto, opciones) {
    const o = opciones || {};
    return abrir({ clase: "pedir", titulo: o.titulo, texto, aceptar: o.aceptar || "Listo",
                   campos: [{ nombre: "valor", etiqueta: o.etiqueta, valor: o.valor, inputmode: o.inputmode,
                              soloLectura: o.soloLectura }] })
      .then((r) => (r === null ? null : r.valor));
  }

  function formulario(conf) {
    return abrir({ clase: "formulario", titulo: conf.titulo, texto: conf.texto, campos: conf.campos,
                   aceptar: conf.aceptar || "Guardar", cancelar: conf.cancelar });
  }

  window.Avisos = { avisar, confirmar, alerta, pedir, formulario };
})();
