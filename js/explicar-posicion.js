/* El botón «Explícame esta posición»: la IA cuenta en palabras lo que ya
 * calculó Stockfish. Escrito una vez para cualquier pantalla con motor; hoy lo
 * usa Mis estudios (js/mis-estudios.js).
 *
 * - El botón SOLO aparece si public.ia_explicar_quedan() devuelve un número:
 *   cuántas explicaciones le quedan hoy a esta persona. NULL es «sin IA» (su
 *   academia no la tiene, no deja a los alumnos o se acabó el presupuesto) y
 *   el botón no va. Ni el modelo ni el presupuesto llegan a esta pantalla.
 * - El botón se enciende solo cuando el motor TERMINÓ de analizar la posición
 *   que se ve (la página llama a listo({ fen, lineas })), y la explicación de
 *   otra posición se borra al moverse: nunca queda a la vista una explicación
 *   que no es del tablero.
 * - Viaja la posición y las líneas del motor, nada más. La Edge Function
 *   explicar-posicion las vuelve a jugar con chess.js y rechaza la explicación
 *   que hable de una jugada que no está en las líneas.
 * - El texto va por textContent.
 *
 * Uso:  ExplicarPosicion.montar({ sb, contenedor })
 *       ExplicarPosicion.listo({ fen, lineas: [{ pv: ["e2e4", …], puntaje: { cp } | { mate } }] })
 *       ExplicarPosicion.listo(null)    // la posición cambió o el motor se apagó
 *
 * Ver «Explícame esta posición» en docs/decisiones/entrenamiento.md.
 */
(function () {
  "use strict";
  if (typeof window !== "undefined" && window.ExplicarPosicion) return;

  var MAX_LINEAS = 3, MAX_JUGADAS = 10;
  var sb = null, caja = null, boton = null, estado = null, salida = null;
  var datos = null, quedan = null, pidiendo = 0;

  function el(tag, clase, texto) {
    var e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function quedanTexto(n) {
    return n === 1 ? "Te queda 1 explicación hoy." : "Te quedan " + n + " explicaciones hoy.";
  }

  function pintar() {
    if (!boton) return;
    var sinHoy = quedan === 0;
    boton.disabled = !datos || sinHoy || pidiendo > 0;
    if (pidiendo > 0) return;
    if (sinHoy) estado.textContent = "Ya usaste las explicaciones de hoy. Mañana tienes más.";
    else if (!datos) estado.textContent = "Analiza la posición con el motor y espera a que termine para pedir la explicación.";
    else estado.textContent = quedanTexto(quedan);
  }

  async function montar(opts) {
    if (caja || !opts || !opts.sb || !opts.contenedor) return null;
    sb = opts.sb;
    var r;
    try { r = await sb.rpc("ia_explicar_quedan"); } catch (e) { return null; }
    // Solo un número dice «hay IA»: null (sin IA) o cualquier otra cosa, no.
    if (!r || r.error || typeof r.data !== "number") return null;
    quedan = Number(r.data);

    caja = el("div", "explicar");
    caja.id = "explicar-posicion";
    caja.style.marginTop = ".6rem";
    boton = el("button", "bctrl");
    boton.type = "button";
    boton.id = "explicar-boton";
    boton.innerHTML = '<span aria-hidden="true">💬</span> Explícame esta posición';
    estado = el("p", "sub");
    estado.id = "explicar-estado";
    estado.setAttribute("role", "status");
    estado.style.margin = ".3rem 0 0";
    salida = el("div");
    salida.id = "explicar-salida";
    salida.hidden = true;
    salida.style.marginTop = ".5rem";
    var titulo = el("p", "eval", "Lo que dicen las líneas del motor");
    titulo.id = "explicar-titulo";
    var texto = el("p");
    texto.id = "explicar-texto";
    texto.style.whiteSpace = "pre-wrap";
    texto.style.margin = ".2rem 0";
    texto.tabIndex = -1;
    texto.setAttribute("aria-labelledby", titulo.id);
    var nota = el("p", "sub", "La explica una inteligencia artificial a partir del análisis de Stockfish: puede equivocarse al contarlo. Si algo no te cuadra, confía en las líneas.");
    nota.style.margin = ".2rem 0 0";
    salida.append(titulo, texto, nota);
    caja.append(boton, estado, salida);
    opts.contenedor.appendChild(caja);

    boton.addEventListener("click", pedir);
    pintar();
    return caja;
  }

  function listo(d) {
    var nuevo = d && d.fen && Array.isArray(d.lineas) && d.lineas.length
      ? {
          fen: String(d.fen),
          lineas: d.lineas.slice(0, MAX_LINEAS).map(function (L) {
            return { pv: (L.pv || []).slice(0, MAX_JUGADAS), puntaje: L.puntaje };
          }).filter(function (L) { return L.pv.length && L.puntaje; }),
        }
      : null;
    if (nuevo && !nuevo.lineas.length) nuevo = null;
    // Otra posición: lo que estaba a la vista ya no es de este tablero.
    if (!nuevo || !datos || nuevo.fen !== datos.fen) {
      if (salida) { salida.hidden = true; document.getElementById("explicar-texto").textContent = ""; }
      pidiendo = 0;
    }
    datos = nuevo;
    pintar();
  }

  async function pedir() {
    if (!datos || pidiendo > 0 || quedan === 0) return;
    var pedido = { fen: datos.fen, lineas: datos.lineas };
    var mio = ++pidiendo;
    boton.disabled = true;
    estado.textContent = "Preparando la explicación…";
    salida.hidden = true;
    var data = null, error = null;
    try {
      var r = await sb.functions.invoke("explicar-posicion", { body: pedido });
      data = r.data; error = r.error;
      if (error && error.context && typeof error.context.json === "function") {
        try { data = await error.context.json(); } catch (e) { /* sin cuerpo */ }
      }
    } catch (e) {
      error = e;
    }
    // Mientras tanto se movió a otra posición: esta respuesta ya no sirve.
    if (pidiendo !== mio || !datos || datos.fen !== pedido.fen) return;
    pidiendo = 0;
    if (data && data.error === "no_disponible") {
      // Se acabó el presupuesto o apagaron la IA mientras tanto.
      caja.remove();
      caja = boton = estado = salida = null;
      return;
    }
    if (data && data.error === "tope_dia") {
      quedan = 0;
      pintar();
      return;
    }
    if (error || !data || !data.texto) {
      pintar();
      estado.textContent = (data && data.error) || "No se pudo explicar la posición ahora. Prueba otra vez en un rato.";
      return;
    }
    if (typeof data.quedan === "number") quedan = data.quedan;
    var t = document.getElementById("explicar-texto");
    // Ya viene en la notación de acá (R es el rey): no pasa por
    // ComandosTablero.textoParaMostrar, que lee la R como torre inglesa.
    t.textContent = data.texto;
    salida.hidden = false;
    pintar();
    t.focus();
  }

  var api = { montar: montar, listo: listo };
  if (typeof window !== "undefined") window.ExplicarPosicion = api;
  if (typeof module !== "undefined") module.exports = api;
})();

/*! rev bfb5bbb0d2d82f9f */
