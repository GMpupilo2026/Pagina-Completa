/* Ajedrez Integral — el hilo aparte que corre Whisper.
 *
 * Va en un Web Worker porque transcribir una clase de 40 minutos tarda
 * minutos: en el hilo de la página dejaría el navegador congelado todo ese
 * rato, sin poder ni desplazarse. Acá la página sigue respondiendo y solo va
 * recibiendo el avance.
 *
 * El modelo se baja del CDN la primera vez y queda en la caché del navegador.
 * A partir de ahí, esto funciona sin internet.
 *
 * El audio NO sale de la computadora: lo que llega acá son las muestras que ya
 * decodificó la página, y lo que sale es el texto. No hay ninguna petición que
 * lleve el audio a ninguna parte.
 */
/* global self */

let transcriptor = null;

self.onmessage = async (e) => {
  const { cdn, modelo, muestreo, muestras } = e.data || {};
  try {
    if (!transcriptor) {
      const { pipeline } = await import(cdn);

      /* WebGPU cuando el navegador lo tiene: es la diferencia entre esperar
         unos minutos y esperar un rato largo. Cuando no está, se usa WASM,
         que anda en todos lados. */
      const conWebGPU = typeof navigator !== "undefined" && !!navigator.gpu;

      transcriptor = await pipeline("automatic-speech-recognition", modelo, {
        device: conWebGPU ? "webgpu" : "wasm",
        // q8 pesa bastante menos que fp32 y para voz se nota poco; en WebGPU
        // se usa fp16, que ahí sí rinde.
        dtype: conWebGPU ? "fp16" : "q8",
        progress_callback: (p) => {
          if (p && p.status === "progress" && p.total) {
            self.postMessage({ tipo: "avance", etapa: "modelo",
              porcentaje: Math.round((p.loaded / p.total) * 100) });
          }
        },
      });
    }

    self.postMessage({ tipo: "avance", etapa: "transcribiendo", porcentaje: 0 });

    /* chunk_length_s + stride_length_s es lo que permite pasarle una clase
       entera: Whisper solo mira 30 segundos por vez, así que se trocea con un
       solapamiento que evita perder las palabras de la costura. */
    const salida = await transcriptor(muestras, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: "spanish",
      task: "transcribe",
      return_timestamps: false,
      // Sin esto, ante un silencio largo Whisper se pone a repetir la última
      // frase hasta llenar el trozo. En una clase hay silencios de sobra.
      no_repeat_ngram_size: 4,
      callback_function: (x) => {
        // No hay forma exacta de saber cuánto falta, así que se manda el
        // pulso: sirve para que la barra se mueva y se note que está viva.
        if (x) self.postMessage({ tipo: "avance", etapa: "transcribiendo" });
      },
    });

    const texto = (salida && (salida.text || (Array.isArray(salida) ? salida.map((s) => s.text).join(" ") : ""))) || "";
    self.postMessage({ tipo: "listo", texto: texto.trim() });
  } catch (err) {
    self.postMessage({
      tipo: "error",
      error: (err && err.message) ? err.message : String(err),
    });
  }
};
