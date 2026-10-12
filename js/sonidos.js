/* Ajedrez Integral — Sonidos cortos de las lecciones, sin archivos.

   Los mismos momentos que suenan en las lecciones de lichess.org/learn
   (ui/learn/src/sound.ts): mover, tomar una estrella o una pieza, empezar y
   terminar un nivel, empezar y terminar una etapa, y equivocarse. Lichess
   usa archivos de audio de licencias mezcladas; acá se arman con WebAudio,
   como el Sonar (js/sonar.js) y el aviso de turno (js/turn-alert.js): nada
   que bajar ni que licenciar.

     Sonidos.tocar(nombre)   "mover" | "tomar" | "inicio-nivel" | "fin-nivel"
                             | "inicio-etapa" | "fin-etapa" | "fallo"
     Sonidos.encendido()     true salvo que la persona los apague
     Sonidos.poner(bool)     los enciende o apaga (se recuerda en el aparato:
                             es una preferencia de dónde se mira, no de la
                             cuenta, como el modo oscuro)
     Sonidos.boton(el)       hace de `el` el interruptor «Sonido», con su
                             aria-pressed
     Sonidos.historial       los que sonaron, para los verificadores

   El navegador no deja sonar nada antes del primer gesto de la persona: el
   contexto de audio se crea (o se despierta) al primer sonido que se pide,
   y si todavía no se puede, ese sonido simplemente no suena. */
(function () {
  "use strict";
  const CLAVE = "sonidos_apagados_v1";
  let audio = null;
  const historial = [];

  function encendido() { try { return localStorage.getItem(CLAVE) !== "1"; } catch (e) { return true; } }
  function poner(si) { try { localStorage.setItem(CLAVE, si ? "0" : "1"); } catch (e) {} }

  function ctx() {
    try {
      if (!audio) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; audio = new A(); }
      if (audio.state === "suspended") audio.resume();
      return audio;
    } catch (e) { return null; }
  }

  /* Una nota: tipo de onda, frecuencia, cuándo empieza, cuánto dura y qué tan fuerte. */
  function nota(a, tipo, freq, inicio, dur, vol, hasta) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = tipo;
    const t = a.currentTime + inicio;
    o.frequency.setValueAtTime(freq, t);
    if (hasta) o.frequency.exponentialRampToValueAtTime(hasta, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.03);
  }

  const SONIDOS = {
    // El golpe seco de una pieza en la madera.
    mover: (a) => { nota(a, "triangle", 320, 0, 0.07, 0.22, 140); },
    // La estrella: un tintineo brillante que sube.
    tomar: (a) => { nota(a, "triangle", 1046.5, 0, 0.12, 0.16); nota(a, "triangle", 1568, 0.07, 0.22, 0.14); },
    // Un ping corto para avisar que empieza el nivel.
    "inicio-nivel": (a) => { nota(a, "sine", 1318.5, 0, 0.3, 0.12); },
    // Nivel ganado: un arpegio que sube.
    "fin-nivel": (a) => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => nota(a, "triangle", f, i * 0.07, 0.25, 0.14)); },
    // Etapa nueva: un acorde rasgueado, como una guitarra.
    "inicio-etapa": (a) => { [196, 293.66, 392, 493.88].forEach((f, i) => nota(a, "triangle", f, i * 0.035, 0.9, 0.1)); },
    // Etapa terminada: una fanfarria que se queda en la última nota.
    "fin-etapa": (a) => {
      [[523.25, 0], [659.25, 0.13], [783.99, 0.26], [1046.5, 0.42]].forEach(([f, t], i) => nota(a, "square", f, t, i === 3 ? 0.7 : 0.15, 0.07));
      nota(a, "triangle", 523.25, 0.42, 0.7, 0.1);
    },
    // El error: dos notas graves que bajan.
    fallo: (a) => { nota(a, "sawtooth", 233, 0, 0.16, 0.07); nota(a, "sawtooth", 175, 0.15, 0.28, 0.07, 150); },
  };

  function tocar(nombre) {
    if (!SONIDOS[nombre] || !encendido()) return;
    historial.push(nombre);
    const a = ctx();
    if (!a) return;
    try { SONIDOS[nombre](a); } catch (e) { /* sin audio: la página sigue igual */ }
  }

  function boton(el) {
    if (!el) return;
    const pintar = () => {
      const on = encendido();
      el.setAttribute("aria-pressed", String(on));
      // El nombre no cambia («Sonido»): lo que cambia lo dice aria-pressed.
      el.textContent = "";
      const ic = document.createElement("span");
      ic.setAttribute("aria-hidden", "true");
      ic.textContent = on ? "🔊 " : "🔇 ";
      el.append(ic, "Sonido");
      el.title = on ? "Apagar los sonidos" : "Encender los sonidos";
    };
    el.addEventListener("click", () => { poner(!encendido()); pintar(); if (encendido()) tocar("tomar"); });
    pintar();
  }

  window.Sonidos = { tocar, encendido, poner, boton, historial };
})();
