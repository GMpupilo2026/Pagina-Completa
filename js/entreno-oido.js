/* El código de entreno/oido.html: «De oído», visualización sin ver el tablero.

   Tres ejercicios (la lógica, en js/oido-ejercicios.js): «¿A dónde llega?»,
   «El camino del caballo» y «La partida dictada». Todo se contesta
   escribiendo (casillas como «e4» o «eva 4», «sí» o «no», un número), y la
   pregunta se dice: con la voz del sitio si está encendida («Activar voz») y,
   siempre, en una región viva que lee el lector de pantalla. No hay tablero a
   la vista: es lo que se entrena.

   Cada respuesta cuenta en Entrenamiento (training_progress, actividad
   'oido'): la meta del día, la racha y las tareas. La racha de aciertos
   seguidos de esta sesión se muestra escrita. Ver «De oído» en
   docs/decisiones/entrenamiento.md. */
(function () {
  "use strict";

  const NEXT_PATH = "entreno/oido.html";
  const $ = (id) => document.getElementById(id);
  const O = window.OidoEjercicios;
  const MODOS = {
    alcance: { titulo: "¿A dónde llega?", explica: "Una pieza sola en el tablero vacío: di a qué casillas llega, o si llega a una casilla." },
    camino: { titulo: "El camino del caballo", explica: "Di en cuántas jugadas, como mínimo, el caballo va de una casilla a otra." },
    dictado: { titulo: "La partida dictada", explica: "Escucha las jugadas de una apertura real y di dónde quedó una pieza." },
  };

  let modo = "alcance";
  let nivel = "facil";
  let ej = null;
  let intentos = 0, aciertos = 0, seguidos = 0;
  let respondido = false;

  const casilla = (s) => (window.BlindNotation ? BlindNotation.squareSpoken(s) : s);
  const pieza = (t) => O.NOMBRE[t] || t;
  const color = (c) => (c === "w" ? "blanco" : "negro");

  function decir(texto, region) {
    const r = $(region || "oido-voz");
    r.textContent = "";
    setTimeout(() => { r.textContent = texto; }, 60);
    // Con la voz del sitio encendida, también se dice en voz alta.
    if (window.BlindNotation && BlindNotation.isSpeechEnabled && BlindNotation.isSpeechEnabled()) BlindNotation.speak(texto);
  }

  /* El dictado de las jugadas: «1. peón eva 4, peón eva 5. 2. caballo felix 3…».
     El peón se nombra: sanSpoken lo dice solo con la casilla («eva 4»), y para
     seguir la partida de oído hace falta saber qué pieza se movió. */
  const jugadaDicha = (san) => (/^[a-h]/.test(san) ? "peón " : "") + BlindNotation.sanSpoken(san);
  function dictado(jugadas) {
    const partes = [];
    for (let i = 0; i < jugadas.length; i += 2) {
      const b = jugadaDicha(jugadas[i]);
      const n = jugadas[i + 1] ? jugadaDicha(jugadas[i + 1]) : "";
      partes.push((i / 2 + 1) + ". " + b + (n ? ", " + n : ""));
    }
    return partes.join(". ") + ".";
  }

  function enunciado(e) {
    if (e.modo === "alcance" && e.tipo === "lista") return "Un " + pieza(e.pieza) + " en " + casilla(e.desde) + ", en el tablero vacío. ¿A qué casillas llega? Escríbelas todas.";
    if (e.modo === "alcance") return "Un " + pieza(e.pieza) + " en " + casilla(e.desde) + ", en el tablero vacío. ¿Llega a " + casilla(e.hasta) + " en una jugada? Contesta sí o no.";
    if (e.modo === "camino") return "Un caballo en " + casilla(e.desde) + ". ¿En cuántas jugadas, como mínimo, llega a " + casilla(e.hasta) + "?";
    return "Desde la posición inicial: " + dictado(e.jugadas) + " ¿En qué casilla está ahora el " + pieza(e.pieza) + " " + color(e.color) + " que empezó en " + casilla(e.origen) + "?";
  }

  function nueva() {
    let e = null;
    if (modo === "alcance") e = O.generarAlcance(Math.random, nivel);
    else if (modo === "camino") e = O.generarCamino(Math.random, nivel);
    else e = O.generarDictado(Math.random, nivel, window.AperturasLineas ? AperturasLineas.LINEAS : [], window.Chess);
    if (!e) { decir("No se pudo armar la pregunta. Prueba otra vez."); return; }
    ej = e;
    respondido = false;
    $("oido-pregunta").textContent = enunciado(e);
    $("oido-respuesta").value = "";
    $("oido-explicacion").textContent = "";
    $("oido-explicacion").hidden = true;
    $("oido-responder").disabled = false;
    decir(enunciado(e));
    $("oido-respuesta").focus();
  }

  function explicacion(e) {
    if (e.modo === "alcance" && e.tipo === "lista") return "Llega a: " + e.respuesta.map(casilla).join(", ") + ".";
    if (e.modo === "alcance") return e.respuesta ? "Sí llega." : "No llega: desde " + casilla(e.desde) + " el " + pieza(e.pieza) + " llega a " + O.alcance(e.pieza, e.desde).length + " casillas, y " + casilla(e.hasta) + " no es una.";
    if (e.modo === "camino") return e.respuesta + (e.respuesta === 1 ? " jugada" : " jugadas") + ". Un camino: " + e.ruta.map(casilla).join(", ") + ".";
    return "Está en " + casilla(e.respuesta) + ". Las jugadas fueron: " + dictado(e.jugadas) + " (" + e.nombreLinea + ").";
  }

  function responder(ev) {
    if (ev) ev.preventDefault();
    if (!ej || respondido) return;
    const texto = $("oido-respuesta").value;
    const r = O.corregir(ej, texto);
    if (!r.entendido) {
      decir(ej.modo === "camino" ? "Escribe un número, por ejemplo 3." : ej.modo === "alcance" && ej.tipo === "llega" ? "Contesta sí o no." : "Escribe casillas, como e4 o eva 4.");
      return;
    }
    respondido = true;
    intentos++;
    if (r.bien) { aciertos++; seguidos++; } else seguidos = 0;
    let texto2 = r.bien ? "¡Bien! " : "No. ";
    if (!r.bien && r.faltan && r.faltan.length) texto2 += "Te faltó " + r.faltan.map(casilla).join(", ") + ". ";
    if (!r.bien && r.sobran && r.sobran.length) texto2 += "No llega a " + r.sobran.map(casilla).join(", ") + ". ";
    texto2 += explicacion(ej);
    $("oido-explicacion").textContent = texto2;
    $("oido-explicacion").hidden = false;
    $("oido-responder").disabled = true;
    pintarCuenta();
    decir(texto2 + " Para otra, Nueva pregunta.");
    $("oido-nueva").focus();
    if (window.EntrenoProgress) EntrenoProgress.log("oido", { modo, nivel, bien: r.bien, limpio: r.bien });
  }

  function pintarCuenta() {
    $("oido-cuenta").textContent = intentos
      ? aciertos + " de " + intentos + " bien" + (seguidos > 1 ? " · " + seguidos + " seguidas" : "")
      : "Todavía no contestaste ninguna.";
  }

  function elegirModo(m) {
    modo = m;
    document.querySelectorAll("[data-oido-modo]").forEach((b) => {
      const es = b.dataset.oidoModo === m;
      b.setAttribute("aria-pressed", String(es));
      b.querySelector(".oido-marca").textContent = es ? "✓ " : "";
    });
    $("oido-explica").textContent = MODOS[m].explica;
    nueva();
  }

  function montar() {
    document.querySelectorAll("[data-oido-modo]").forEach((b) => b.addEventListener("click", () => elegirModo(b.dataset.oidoModo)));
    $("oido-nivel").addEventListener("change", () => { nivel = $("oido-nivel").value; nueva(); });
    $("oido-form").addEventListener("submit", responder);
    $("oido-nueva").addEventListener("click", nueva);
    $("oido-repetir").addEventListener("click", () => { if (ej) decir(enunciado(ej)); });
    const q = new URLSearchParams(location.search);
    if (MODOS[q.get("modo")]) modo = q.get("modo");
    if (["facil", "medio", "dificil"].indexOf(q.get("nivel")) >= 0) { nivel = q.get("nivel"); $("oido-nivel").value = nivel; }
    pintarCuenta();
    elegirModo(modo);
  }

  async function unlock() {
    $("gate").classList.add("hidden");
    $("app").classList.remove("hidden");
    montar();
  }
  async function requireLoginThenGate() {
    let hay = false;
    try { const { data } = await sb.auth.getSession(); hay = !!(data && data.session); } catch (e) { hay = false; }
    if (!hay) {
      $("gate-checking").textContent = "Necesitas iniciar sesión para entrar a De oído. Redirigiendo…";
      window.location.href = "../login.html?next=" + encodeURIComponent(NEXT_PATH);
      return;
    }
    unlock();
  }
  // Para los verificadores: la pregunta que se está haciendo.
  window.OidoEntreno = { ej: () => ej, nueva, cuenta: () => ({ intentos, aciertos, seguidos }) };
  requireLoginThenGate();
})();

/*! rev bfb5bbb0d2d82f9f */
