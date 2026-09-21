/**
 * Ajedrez Integral — transcribir una grabación de clase SIN que salga de la
 * computadora.
 *
 * POR QUÉ ASÍ. Un servicio de transcripción sería más rápido y más exacto, pero
 * estas grabaciones son clases con voces de menores: mandarlas a un servidor de
 * otra empresa es sacar esos datos del control de quien dio la clase, y eso pide
 * el consentimiento de las familias (en Costa Rica, Ley 8968). Corriendo el
 * modelo en la propia máquina, ese problema no existe: el audio no se sube a
 * ninguna parte, no hace falta ninguna credencial y no cuesta nada.
 *
 * El modelo (Whisper) se baja UNA vez de un CDN y queda en la caché del
 * navegador. Son unos 80 MB; a partir de ahí funciona hasta sin internet.
 *
 * CÓMO ESTÁ ARMADO, y por qué importa para probarlo:
 *
 *   1. Acá, en la página, se DECODIFICA el audio: cualquier formato que el
 *      navegador sepa abrir se convierte en muestras a 16 kHz en un solo canal,
 *      que es lo único que entiende Whisper. Esto se puede probar entero, con
 *      un archivo de audio de verdad y sin bajar ningún modelo.
 *   2. Un Web Worker (js/reporte-transcribir-worker.js) corre el modelo. Va en
 *      un worker porque transcribir una clase de 40 minutos tarda minutos: en
 *      el hilo de la página dejaría el navegador congelado todo ese rato.
 *
 * El motor se puede reemplazar (`_usarMotor`). No es un adorno de pruebas: es
 * la costura por la que entraría un servicio con credencial el día que se
 * decida que la velocidad importa más que la privacidad. Y es lo que permite
 * comprobar toda la página sin bajar 80 MB en cada corrida.
 */
window.ReporteTranscribir = (function () {
  "use strict";

  const MUESTREO = 16000;               // lo que espera Whisper, sin discusión

  /* ------------------------------------------------------ decodificar */

  /**
   * De un archivo de audio o video a muestras a 16 kHz en un canal.
   *
   * Sirve igual para un .mp4 de clase: el navegador decodifica la pista de
   * audio y el video se ignora. Si el formato no lo puede abrir, se dice cuál
   * era y qué hacer, en vez de fallar con un error de consola.
   */
  async function decodificar(archivo) {
    const datos = await archivo.arrayBuffer();
    const Contexto = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Contexto) throw new Error("Este navegador no puede leer audio.");

    // Se decodifica con un contexto a 16 kHz: así el propio navegador hace el
    // remuestreo, que es mucho mejor que hacerlo a mano.
    const ctx = new Contexto(1, 1, MUESTREO);
    let audio;
    try {
      audio = await ctx.decodeAudioData(datos);
    } catch (e) {
      throw new Error("No se pudo leer el audio de «" + archivo.name + "». " +
        "Si es un video, prueba a guardarlo como .mp3 o .m4a y volver a subirlo.");
    }

    // Varios canales se mezclan en uno: Whisper trabaja en mono y una clase
    // grabada en estéreo tiene lo mismo en los dos lados.
    if (audio.numberOfChannels === 1) return audio.getChannelData(0);
    const izq = audio.getChannelData(0);
    const der = audio.getChannelData(1);
    const mezcla = new Float32Array(izq.length);
    for (let i = 0; i < izq.length; i++) mezcla[i] = (izq[i] + der[i]) / 2;
    return mezcla;
  }

  /* ------------------------------------------------------- el motor */

  const CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3";
  const MODELO = "onnx-community/whisper-base";

  let motorPropio = null;               // se puede cambiar con _usarMotor()
  let trabajador = null;

  function arrancarTrabajador() {
    if (trabajador) return trabajador;
    // Worker de MÓDULO: el worker hace `import()` para traer la librería, y en
    // un worker clásico ese import no está en todos los navegadores.
    trabajador = new Worker("js/reporte-transcribir-worker.js", { type: "module" });
    return trabajador;
  }

  /* El motor de verdad: manda las muestras al worker y espera el texto. */
  function motorLocal(muestras, alAvanzar) {
    return new Promise((resolver, rechazar) => {
      const w = arrancarTrabajador();
      const atender = (e) => {
        const m = e.data || {};
        if (m.tipo === "avance") { if (alAvanzar) alAvanzar(m); return; }
        w.removeEventListener("message", atender);
        if (m.tipo === "listo") resolver(m.texto || "");
        else rechazar(new Error(m.error || "La transcripción falló sin decir por qué."));
      };
      w.addEventListener("message", atender);
      w.postMessage({ cdn: CDN, modelo: MODELO, muestreo: MUESTREO, muestras: muestras },
        [muestras.buffer]);   // se pasa el buffer, no se copia: son megas
    });
  }

  /* ---------------------------------------------------------- API */

  /**
   * @param archivo    el video o el audio que se subió
   * @param alAvanzar  función que recibe {etapa, porcentaje, detalle}
   * @returns el texto transcrito
   */
  async function transcribir(archivo, alAvanzar) {
    const avisar = (etapa, porcentaje, detalle) => {
      if (alAvanzar) alAvanzar({ etapa: etapa, porcentaje: porcentaje, detalle: detalle || "" });
    };

    avisar("leyendo", 0, "Leyendo el audio…");
    const muestras = await decodificar(archivo);
    const minutos = muestras.length / MUESTREO / 60;
    avisar("leyendo", 100, "Son " + minutos.toFixed(1) + " minutos de audio.");

    const motor = motorPropio || motorLocal;
    return await motor(muestras, (m) => {
      if (m.etapa === "modelo") {
        avisar("modelo", m.porcentaje || 0,
          "Bajando el modelo por primera vez (" + Math.round(m.porcentaje || 0) + " %). " +
          "Queda guardado: la próxima vez empieza de una.");
      } else {
        avisar("transcribiendo", m.porcentaje || 0, "Transcribiendo…");
      }
    });
  }

  /* Cambia el motor. Lo usa la comprobación para no bajar 80 MB en cada
     corrida, y es por donde entraría un servicio con credencial si algún día
     se prefiere la velocidad a que el audio no salga de la máquina. */
  function _usarMotor(fn) { motorPropio = fn; }

  function hayCómo() {
    return typeof Worker !== "undefined" &&
      !!(window.OfflineAudioContext || window.webkitOfflineAudioContext);
  }

  return {
    transcribir: transcribir,
    decodificar: decodificar,
    hayCómo: hayCómo,
    _usarMotor: _usarMotor,
    _MUESTREO: MUESTREO,
    _MODELO: MODELO,
  };
})();
