/* El entrenador de IA: el botón «¿Por qué?» al fallar un ejercicio.
 *
 * Solo lo ve quien lo tiene encendido, y eso lo decide quien administra,
 * persona por persona (admin.html, la ficha de cada persona;
 * public.tengo_entrenador_ia()). Para los demás, este archivo no pinta nada.
 *
 * Quién decide qué: Stockfish, en este navegador (js/shared-engine.js),
 * calcula la mejor línea desde la posición y cómo sigue después de la jugada
 * que hizo el alumno. La IA no analiza nada: la Edge Function `entrenador-ia`
 * vuelve a jugar esas líneas con chess.js y solo le pide al modelo que las
 * cuente en palabras. Si la explicación nombra una jugada que no está en las
 * líneas, la función la descarta y acá se dice que no salió.
 *
 * Lo que viaja: la posición y las jugadas. Nada de la persona.
 *
 * Uso, desde la página del ejercicio:
 *   EntrenadorIA.fallo({ fen, uci })   al fallar (fen: la posición ANTES de la
 *                                      jugada; uci: la jugada que hizo)
 *   EntrenadorIA.limpiar()             al acertar o al pasar a otro ejercicio
 *
 * Ver «El entrenador de IA» en docs/decisiones/entrenamiento.md.
 */
window.EntrenadorIA = (function () {
  "use strict";
  const PROFUNDIDAD = 14;
  const ESPERA_MOTOR = 15000;   // ms: en un celular lento se corta y se usa lo que haya
  const MAX_JUGADAS = 6;

  let encendido = null;         // la promesa de tengo_entrenador_ia(), una vez por página
  let caja = null, actual = null, vuelta = 0;

  function tengo() {
    if (encendido) return encendido;
    const sb = window.sb;
    if (!sb || typeof sb.rpc !== "function") return (encendido = Promise.resolve(false));
    encendido = Promise.resolve(sb.rpc("tengo_entrenador_ia"))
      .then((r) => !!(r && !r.error && r.data === true))
      .catch(() => false);
    return encendido;
  }

  // La mejor línea del motor para una posición: { pv: [uci…], puntaje } con el
  // puntaje desde las blancas ({ cp } o { mate }). null si el motor no anda.
  function analizar(fen) {
    const SE = window.SharedEngine;
    if (!SE) return Promise.resolve(null);
    return SE.runTask(async () => {
      const motor = await SE.ensureEngine();
      if (!motor) return null;
      const signo = fen.split(" ")[1] === "b" ? -1 : 1;
      return new Promise((resolver) => {
        let ultima = null;
        const terminar = () => { clearTimeout(reloj); SE.setMessageHandler(null); resolver(ultima); };
        const reloj = setTimeout(() => { try { motor.postMessage("stop"); } catch (e) {} terminar(); }, ESPERA_MOTOR);
        SE.setMessageHandler((ev) => {
          const linea = typeof ev.data === "string" ? ev.data : "";
          if (linea.startsWith("info") && / score /.test(linea) && / pv /.test(linea) && !/bound/.test(linea)) {
            const m = linea.match(/ score (cp|mate) (-?\d+)/);
            const pv = linea.split(" pv ")[1].trim().split(/\s+/).slice(0, MAX_JUGADAS);
            if (m && pv.length) ultima = { pv, puntaje: m[1] === "mate" ? { mate: signo * Number(m[2]) } : { cp: signo * Number(m[2]) } };
          } else if (linea.startsWith("bestmove")) terminar();
        });
        motor.postMessage("setoption name MultiPV value 1");
        motor.postMessage("position fen " + fen);
        motor.postMessage("go depth " + PROFUNDIDAD);
      });
    });
  }

  function el(tag, texto) { const n = document.createElement(tag); if (texto != null) n.textContent = texto; return n; }

  function armarCaja() {
    if (caja && caja.isConnected) return caja;
    const ancla = document.getElementById("round-status");
    if (!ancla) return null;
    caja = el("div");
    caja.id = "entrenador-ia";
    caja.style.marginTop = "8px";
    caja.style.textAlign = "center";
    ancla.after(caja);
    return caja;
  }

  function limpiar() {
    vuelta += 1;
    actual = null;
    if (caja) caja.replaceChildren();
  }

  // Lo que dijo la función cuando no contestó con un 200.
  async function mensajeDe(error) {
    try {
      const cuerpo = error && error.context && typeof error.context.json === "function" ? await error.context.json() : null;
      if (cuerpo && cuerpo.error === "tope_dia") return cuerpo.mensaje || "Ya usaste las explicaciones de hoy. Mañana tienes más.";
      if (cuerpo && cuerpo.error === "no_disponible") return "El entrenador no está disponible en este momento.";
      if (cuerpo && typeof cuerpo.error === "string") return cuerpo.error;
    } catch (e) {}
    return "No se pudo explicar la jugada ahora. Prueba otra vez en un rato.";
  }

  async function explicar(boton, salida) {
    const esta = vuelta, dato = actual;
    if (!dato) return;
    boton.disabled = true;
    boton.textContent = "Pensando…";
    salida.textContent = "";
    const decir = (texto) => { if (esta === vuelta) { salida.textContent = texto; boton.disabled = false; boton.textContent = "¿Por qué?"; } };
    let tras = null;
    try {
      const juego = new window.Chess(dato.fen);
      if (juego.move({ from: dato.uci.slice(0, 2), to: dato.uci.slice(2, 4), promotion: dato.uci[4] || undefined })) tras = juego.fen();
    } catch (e) {}
    if (!tras) { decir("No se pudo revisar esa jugada."); return; }
    const mejor = await analizar(dato.fen);
    const despues = mejor ? await analizar(tras) : null;
    if (esta !== vuelta) return;
    if (!mejor || !despues) { decir("El motor no pudo analizar la posición en este aparato. Prueba otra vez."); return; }
    let r;
    try { r = await window.sb.functions.invoke("entrenador-ia", { body: { fen: dato.fen, jugada: dato.uci, mejor, despues } }); }
    catch (e) { r = { error: e }; }
    if (esta !== vuelta) return;
    if (r.error || !r.data || !r.data.ok) { decir(r.error ? await mensajeDe(r.error) : "No se pudo explicar la jugada ahora."); return; }
    // En Modo Adaptado, las jugadas se dicen en palabras, como todo lo que se oye.
    const CT = window.ComandosTablero;
    salida.textContent = CT && typeof CT.textoParaMostrar === "function" ? CT.textoParaMostrar(r.data.texto) : r.data.texto;
    boton.hidden = true;
    if (typeof r.data.quedan === "number" && !r.data.sinGasto) {
      const nota = el("p", r.data.quedan === 0 ? "Era tu última explicación de hoy." : r.data.quedan === 1 ? "Te queda 1 explicación hoy." : "Te quedan " + r.data.quedan + " explicaciones hoy.");
      nota.style.fontSize = "0.8rem";
      nota.style.marginTop = "4px";
      salida.after(nota);
    }
  }

  async function fallo(dato) {
    if (!dato || typeof dato.fen !== "string" || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(String(dato.uci || ""))) return;
    const esta = ++vuelta;
    actual = { fen: dato.fen, uci: dato.uci };
    if (caja) caja.replaceChildren();
    if (!(await tengo()) || esta !== vuelta) return;
    const c = armarCaja();
    if (!c) return;
    const boton = el("button", "¿Por qué?");
    boton.type = "button";
    boton.id = "entrenador-ia-boton";
    // Los colores son los del texto de la página (hereda): no se elige ninguno.
    boton.style.font = "inherit";
    boton.style.fontWeight = "600";
    boton.style.color = "inherit";
    boton.style.background = "transparent";
    boton.style.border = "2px solid currentColor";
    boton.style.borderRadius = "8px";
    boton.style.padding = "6px 14px";
    boton.style.cursor = "pointer";
    boton.setAttribute("aria-describedby", "entrenador-ia-nota");
    const nota = el("p", "Te lo explica una inteligencia artificial con lo que calculó el motor. Puede equivocarse: si algo no te cuadra, pregúntale a tu profe.");
    nota.id = "entrenador-ia-nota";
    nota.style.fontSize = "0.8rem";
    nota.style.margin = "6px auto 0";
    nota.style.maxWidth = "34rem";
    const salida = el("p");
    salida.id = "entrenador-ia-texto";
    salida.setAttribute("role", "status");
    salida.setAttribute("aria-live", "polite");
    salida.style.margin = "8px auto 0";
    salida.style.maxWidth = "34rem";
    salida.style.textAlign = "left";
    salida.style.whiteSpace = "pre-line";
    boton.addEventListener("click", () => explicar(boton, salida));
    c.replaceChildren(boton, nota, salida);
  }

  // `analizar` va afuera para su verificador, que lo corre con el motor de verdad.
  return { fallo, limpiar, tengo, analizar };
})();

/*! rev bfb5bbb0d2d82f9f */
