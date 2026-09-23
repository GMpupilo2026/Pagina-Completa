/*
 * El botón «Mejorar informe», escrito una vez para las dos pantallas que lo
 * usan: la ficha de asistencia presencial (lo que se hizo en la clase) y el
 * informe mensual (el resumen del mes).
 *
 * El botón SOLO aparece si public.ia_disponible() dice que sí, y esa función
 * no dice nada más: ni qué modelo usa la academia ni cuánto le queda. Eso es de
 * quien administra, y a propósito no llega a esta pantalla.
 *
 * El texto mejorado NO reemplaza nada solo: se enseña debajo y quien lo
 * escribió decide si lo usa. Lo que escribió a mano se respeta hasta que diga
 * que sí — un texto reescrito que pisa el original sin preguntar se pierde de
 * una manera que no se puede deshacer.
 *
 * Uso:  MejorarInforme.montar({ sb, campo: textarea, tipo: "clase" | "informe_mensual" })
 */
(function () {
  if (typeof window !== "undefined" && window.MejorarInforme) return;

  var disponible = null; // una sola consulta por página

  async function hayIA(sb) {
    if (disponible) return disponible;
    disponible = sb.rpc("ia_disponible").then(function (r) { return !r.error && r.data === true; })
      .catch(function () { return false; });
    return disponible;
  }

  function el(tag, clase, texto) {
    var e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  async function montar(opts) {
    var sb = opts.sb, campo = opts.campo, tipo = opts.tipo === "informe_mensual" ? "informe_mensual" : "clase";
    if (!sb || !campo || campo.dataset.mejorarMontado) return null;
    campo.dataset.mejorarMontado = "1";
    if (!(await hayIA(sb))) return null;

    var id = campo.id || ("campo-" + Math.random().toString(36).slice(2));
    var caja = el("div", "mt-2");
    caja.id = id + "-mejorar";
    var fila = el("div", "flex flex-wrap items-center gap-3");
    var boton = el("button", "bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-800 dark:text-white font-semibold px-3 py-1.5 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
    boton.type = "button";
    boton.innerHTML = '<span aria-hidden="true">✨</span> Mejorar informe';
    var estado = el("span", "text-xs text-brand-450 dark:text-brand-350");
    estado.setAttribute("role", "status");
    fila.append(boton, estado);
    var nota = el("p", "text-xs text-brand-450 dark:text-brand-350 mt-1",
      "Lo ordena en un objetivo general, los objetivos específicos y lo que se trabajó. Se manda solo este texto: no escribas datos personales de tus alumnos.");

    var propuesta = el("div", "mt-3 border border-brand-200 dark:border-brand-700 rounded-lg p-3 bg-brand-50 dark:bg-brand-950");
    propuesta.hidden = true;
    var tituloProp = el("p", "text-sm font-semibold text-brand-900 dark:text-white mb-1", "Así quedaría");
    tituloProp.id = id + "-propuesta-titulo";
    var textoProp = el("p", "text-sm text-brand-800 dark:text-brand-100 whitespace-pre-wrap");
    textoProp.setAttribute("aria-labelledby", tituloProp.id);
    textoProp.tabIndex = -1;
    var acciones = el("div", "flex flex-wrap gap-3 mt-3");
    var usar = el("button", "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-3 py-1.5 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Usar este texto");
    usar.type = "button";
    var descartar = el("button", "text-sm font-semibold text-accent-700 dark:text-accent-400 underline", "Dejar el mío");
    descartar.type = "button";
    acciones.append(usar, descartar);
    propuesta.append(tituloProp, textoProp, acciones);
    caja.append(fila, nota, propuesta);
    campo.insertAdjacentElement("afterend", caja);

    function sincronizar() {
      // Un campo de solo lectura (un informe ya enviado) no se mejora.
      caja.hidden = !!campo.readOnly || !!campo.disabled;
    }
    sincronizar();
    new MutationObserver(sincronizar).observe(campo, { attributes: true, attributeFilter: ["readonly", "disabled"] });

    boton.addEventListener("click", async function () {
      var texto = campo.value.trim();
      if (texto.length < 20) {
        estado.textContent = "Escribe al menos un par de frases para poder mejorarlo.";
        campo.focus();
        return;
      }
      boton.disabled = true;
      estado.textContent = "Mejorando el texto…";
      propuesta.hidden = true;
      try {
        var r = await sb.functions.invoke("mejorar-informe", { body: { tipo: tipo, texto: texto } });
        var data = r.data, error = r.error;
        if (error && error.context && typeof error.context.json === "function") {
          try { data = await error.context.json(); } catch (e) { /* sin cuerpo */ }
        }
        if (data && data.error === "no_disponible") {
          // Se acabó el presupuesto o apagaron la IA mientras tanto.
          caja.remove();
          return;
        }
        if (error || !data || !data.texto) {
          estado.textContent = (data && data.error) || "No se pudo mejorar el texto ahora. Tu texto quedó como estaba.";
          return;
        }
        textoProp.textContent = data.texto;
        propuesta.hidden = false;
        estado.textContent = "Listo: revísalo abajo antes de usarlo.";
        textoProp.focus();
      } catch (e) {
        estado.textContent = "No se pudo mejorar el texto ahora. Tu texto quedó como estaba.";
      } finally {
        boton.disabled = false;
      }
    });

    usar.addEventListener("click", function () {
      campo.value = textoProp.textContent;
      campo.dispatchEvent(new Event("input", { bubbles: true }));
      propuesta.hidden = true;
      estado.textContent = "Listo: el texto mejorado quedó en el campo. Todavía falta guardar.";
      campo.focus();
    });
    descartar.addEventListener("click", function () {
      propuesta.hidden = true;
      estado.textContent = "Tu texto quedó como estaba.";
      boton.focus();
    });
    return caja;
  }

  var api = { montar: montar };
  if (typeof window !== "undefined") window.MejorarInforme = api;
  if (typeof module !== "undefined") module.exports = api;
})();
