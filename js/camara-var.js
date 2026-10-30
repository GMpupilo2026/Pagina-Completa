/* El VAR de la cámara que lee el tablero: lo que pasó en la mesa, en video,
 * para revisarlo cuando hay un reclamo («tocó una pieza y la tiene que
 * mover», art. 4.3; «la soltó en otra casilla», art. 4.6).
 *
 * Tres decisiones que no conviene deshacer (ver «El VAR de la mesa» en
 * docs/decisiones/juegos-y-torneos.md):
 *
 * 1. EL VIDEO NO SALE DEL APARATO. Se graba en la memoria del celular que
 *    está en la mesa y se borra al cerrar la página: no se sube a ningún lado
 *    ni viaja por el canal de la transmisión. Son menores de edad jugando; el
 *    árbitro revisa EN la mesa. Lo único que puede salir es el pedazo que el
 *    árbitro baja a propósito para el acta («Guardar este pedazo»).
 *
 * 2. SOLO LOS ÚLTIMOS MINUTOS, EN PEDAZOS QUE SE VEN SOLOS. Un reclamo de
 *    pieza tocada se hace en el momento (antes de tocar una pieza propia,
 *    art. 4.8), así que alcanza con los últimos 10 minutos. El grabador del
 *    navegador (MediaRecorder) arma un archivo que solo se puede ver desde su
 *    comienzo: tirar el principio de una grabación larga la deja inservible.
 *    Por eso se graba en pedazos de un minuto, cada uno un archivo completo,
 *    y se guardan los últimos diez. El pedazo siguiente empieza ANTES de
 *    cerrar el anterior, para que entre los dos no se pierda nada.
 *
 * 3. SE SALTA A LO QUE IMPORTA. Cada jugada anotada y cada vez que algo tapó
 *    o movió piezas del tablero (una mano) es una marca con su hora; el
 *    árbitro toca la marca y el video queda unos segundos antes, en pausa,
 *    para verlo a la velocidad que quiera o cuadro a cuadro.
 *
 * 4. LO MARCADO NO SE BORRA. Si el árbitro marca un momento («Marcar este
 *    momento»), el minuto donde cae (y el anterior, si el momento quedó en
 *    sus primeros segundos) se guarda aparte de los diez últimos, hasta diez
 *    minutos marcados más: el reclamo puede llegar después.
 *
 *   CamaraVar.grabador({ minutos, trozoMs, bps, fijosMax })  → { empezar(flujo), cortar(), parar(), fijar(hora), trozos(), grabando(), megas() }
 *   CamaraVar.tipo()                               → el formato de video que graba este navegador, o ""
 *   CamaraVar.donde(trozos, hora)                  → { trozo, segundo } del momento, o null
 *   CamaraVar.duracion(video)                      → la duración de un video del grabador (que no la trae)
 */
(function (G) {
  "use strict";

  const TIPOS = ["video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/webm", "video/mp4"];
  function tipo() {
    if (typeof G.MediaRecorder === "undefined") return "";
    return TIPOS.find((t) => { try { return G.MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || "";
  }

  function grabador(opciones) {
    const o = Object.assign({ minutos: 10, trozoMs: 60000, bps: 700000, fijosMax: 10 }, opciones || {});
    const cuantos = Math.ceil(o.minutos * 60000 / o.trozoMs);
    let flujo = null, actual = null, rotar = null;
    const listos = []; // { inicio, fin, blob, fijo }
    const fijadas = []; // las horas marcadas: el pedazo que las tenga no se borra
    const tieneFijada = (x) => fijadas.some((h) => h >= x.inicio && h <= x.fin + 10000);
    // Se borra el más viejo que no esté marcado; de los marcados, se guardan los últimos fijosMax.
    function podar() {
      for (const x of listos) x.fijo = tieneFijada(x);
      while (listos.filter((x) => !x.fijo).length > cuantos) listos.splice(listos.findIndex((x) => !x.fijo), 1);
      while (listos.filter((x) => x.fijo).length > o.fijosMax) listos.splice(listos.findIndex((x) => x.fijo), 1);
    }

    function nuevo() {
      if (!flujo) return null;
      let r;
      try { r = new G.MediaRecorder(flujo, { mimeType: tipo(), videoBitsPerSecond: o.bps }); } catch (e) { return null; }
      const yo = { r, inicio: Date.now(), partes: [] };
      yo.listo = new Promise((resolver) => {
        r.ondataavailable = (e) => { if (e.data && e.data.size) yo.partes.push(e.data); };
        r.onstop = () => {
          if (yo.partes.length) {
            listos.push({ inicio: yo.inicio, fin: Date.now(), blob: new Blob(yo.partes, { type: yo.partes[0].type || tipo() }) });
            podar();
          }
          resolver();
        };
      });
      try { r.start(); } catch (e) { return null; }
      return yo;
    }
    // El pedazo siguiente arranca antes de cerrar el anterior: entre los dos no se pierde nada.
    function siguiente() {
      const viejo = actual;
      actual = nuevo();
      if (viejo && viejo.r.state !== "inactive") { try { viejo.r.stop(); } catch (e) { /* ya estaba parado */ } }
      return viejo ? viejo.listo : Promise.resolve();
    }
    function programar() {
      clearInterval(rotar);
      rotar = setInterval(siguiente, o.trozoMs);
    }

    return {
      /* Con la cámara abierta (o con la que se volvió a abrir: los pedazos
       * de antes se conservan). */
      empezar(f) {
        if (!f || !tipo()) return false;
        const cambio = flujo !== f;
        flujo = f;
        if (!actual || cambio) { siguiente(); programar(); }
        return !!actual;
      },
      // Cierra el pedazo en curso para poder verlo (y sigue grabando en otro).
      async cortar() {
        if (!actual) return;
        await siguiente();
        programar();
      },
      parar() {
        clearInterval(rotar); rotar = null;
        const viejo = actual;
        actual = null; flujo = null;
        if (viejo && viejo.r.state !== "inactive") { try { viejo.r.stop(); } catch (e) { /* ya estaba parado */ } }
        return viejo ? viejo.listo : Promise.resolve();
      },
      /* Marcar una hora: su minuto (y el anterior, si cae en los primeros
       * 10 segundos de este: la marca deja el video 3 s antes) no se borra. */
      fijar(hora) { fijadas.push(hora); while (fijadas.length > o.fijosMax * 2) fijadas.shift(); podar(); },
      borrar() { listos.length = 0; fijadas.length = 0; },
      trozos: () => listos.slice(),
      grabando: () => !!actual,
      desde: () => (listos.length ? listos[0].inicio : actual ? actual.inicio : null),
      megas: () => Math.round(listos.reduce((s, x) => s + x.blob.size, 0) / 1e5) / 10,
    };
  }

  // El pedazo donde cae una hora y en qué segundo de él.
  function donde(trozos, hora) {
    for (const x of trozos) if (hora >= x.inicio && hora <= x.fin) return { trozo: x, segundo: (hora - x.inicio) / 1000 };
    // En un hueco (entre lo marcado y lo último) o antes del primero: el comienzo del que sigue; después del último, su final.
    const sigue = trozos.find((x) => x.inicio > hora);
    if (sigue) return { trozo: sigue, segundo: 0 };
    const ult = trozos[trozos.length - 1];
    return ult ? { trozo: ult, segundo: (ult.fin - ult.inicio) / 1000 } : null;
  }

  /* El grabador no escribe la duración en el archivo: el <video> dice
   * «Infinity» y no deja saltar bien. Mandarlo al final la obliga a calcularla. */
  function duracion(v) {
    return new Promise((resolver) => {
      const listo = () => resolver(Number.isFinite(v.duration) ? v.duration : 0);
      if (Number.isFinite(v.duration) && v.duration > 0) { listo(); return; }
      const alCambiar = () => {
        if (!Number.isFinite(v.duration)) return;
        v.removeEventListener("durationchange", alCambiar);
        v.currentTime = 0;
        listo();
      };
      v.addEventListener("durationchange", alCambiar);
      try { v.currentTime = 1e7; } catch (e) { listo(); }
      setTimeout(() => { v.removeEventListener("durationchange", alCambiar); listo(); }, 3000);
    });
  }

  const api = { grabador, tipo, donde, duracion };
  if (typeof window !== "undefined") window.CamaraVar = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
