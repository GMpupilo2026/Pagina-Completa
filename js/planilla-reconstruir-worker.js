/* «Leer la partida» en su propio hilo: reconstruir una partida larga prueba
 * miles de continuaciones y tarda varios segundos; en el hilo de la página la
 * organización se quedaría congelada (sin avisos ni pedidos de ayuda) mientras
 * tanto. Recibe las celdas de cada planilla y devuelve la partida, avisando
 * cuánto lleva. Lo que se calcula es js/planilla-reconstruir.js. Ver «Leer la
 * partida de las planillas» en docs/decisiones/juegos-y-torneos.md. */
/* global importScripts, Chess */
importScripts("vendor/chess.js", "planilla-ocr.js", "planilla-reconstruir.js");

self.onmessage = (e) => {
    const { id, hojas } = e.data;
    try {
        let ultimo = 0;
        const resultado = self.PlanillaReconstruir.reconstruir(Chess, hojas, {
            alProgresar: (p) => {
                if (p - ultimo < 0.05 && p < 1) return;
                ultimo = p;
                self.postMessage({ id, progreso: p });
            },
        });
        self.postMessage({ id, resultado });
    } catch (err) {
        self.postMessage({ id, error: String((err && err.message) || err) });
    }
};
