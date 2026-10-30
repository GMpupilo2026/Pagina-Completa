/* La planilla de anotación de una partida que anotó la cámara, en PDF:
 * una hoja por jugador (la de las blancas y la de las negras), como la
 * planilla oficial —número, jugada de las blancas y de las negras, en dos
 * mitades de 30 renglones—, con la jugada en algebraica española (la de
 * js/comandos-tablero.js; en inglés, el SAN), el resultado y los renglones para firmar. Lleva la
 * marca de agua de Ajedrez Integral, como todo PDF del sitio (la pone
 * js/reporte-pdf.js, que es quien dibuja).
 *
 * La usan la cámara (camara-tablero.html, «Planillas en PDF» al terminar) y
 * Pareo Integral (las planillas de toda la ronda, de lo que mandaron las
 * cámaras): una sola copia de cómo se arma. Es una AYUDA para el árbitro: la
 * planilla que vale es la que escribe el jugador (art. 8.1), y por eso dice
 * que se revisa antes de firmar.
 *
 *   PlanillaPDF.documento(partidas, { en })  → el documento neutral de ReportePDF
 *   PlanillaPDF.descargar(partidas, nombre, { en })
 * Cada partida: { jugadas: ["e4", …] (SAN), blancas, negras, resultado ("1-0",
 * "=", "0-1" o null), evento, ronda, mesa, fecha ("AAAA-MM-DD") }. */
(function (G) {
  "use strict";
  const TX = {
    es: { titulo: "Planilla de anotación", deB: "Planilla de las blancas", deN: "Planilla de las negras", blancas: "Blancas", negras: "Negras", ronda: "Ronda", mesa: "Mesa",
      fecha: "Fecha", resultado: "Resultado", sinResultado: "Sin terminar", firmaB: "Firma de las blancas", firmaN: "Firma de las negras",
      firmaA: "Firma del árbitro", nota: "La armó Notara, la cámara que lee el tablero, con las jugadas que anotó. Revísala contra lo jugado antes de firmar: la que vale es la que escribe cada jugador.",
      r: { "1-0": "1-0 (ganan las blancas)", "=": "½-½ (tablas)", "0-1": "0-1 (ganan las negras)" } },
    en: { titulo: "Scoresheet", deB: "White's scoresheet", deN: "Black's scoresheet", blancas: "White", negras: "Black", ronda: "Round", mesa: "Table",
      fecha: "Date", resultado: "Result", sinResultado: "Not finished", firmaB: "White's signature", firmaN: "Black's signature",
      firmaA: "Arbiter's signature", nota: "Made by the camera that reads the board from the moves it recorded. Check it against the game before signing: the one that counts is the one each player writes.",
      r: { "1-0": "1-0 (White wins)", "=": "½-½ (draw)", "0-1": "0-1 (Black wins)" } },
  };
  // En la planilla, siempre la algebraica escrita: en español «Cf3» (la de
  // js/comandos-tablero.js, también con el Modo Adaptado, que la dice en voz
  // en pantalla); en inglés, el SAN tal cual.
  const escribir = (san, en) => (en || !G.ComandosTablero ? san : G.ComandosTablero.sanEspanol(san));

  // Las filas: «1 | e4 | e5 | 31 | … | …»: 30 renglones por mitad, y otra
  // hoja de 60 jugadas más si la partida es larga.
  function filas(jugadas, en) {
    const celda = (k) => (jugadas[k] ? escribir(jugadas[k], en) : "");
    const hojas = Math.max(1, Math.ceil(Math.ceil(jugadas.length / 2) / 60));
    const salida = [];
    for (let h = 0; h < hojas; h++) {
      for (let i = 0; i < 30; i++) {
        const a = h * 60 + i, b = a + 30;
        salida.push([String(a + 1), celda(2 * a), celda(2 * a + 1), String(b + 1), celda(2 * b), celda(2 * b + 1)]);
      }
    }
    return salida;
  }

  function documento(partidas, opciones) {
    const t = TX[(opciones && opciones.en) ? "en" : "es"];
    const bloques = [];
    partidas.forEach((p) => {
      const lugar = [p.evento, p.ronda ? t.ronda + " " + p.ronda : "", p.mesa ? t.mesa + " " + p.mesa : "", p.fecha ? t.fecha + ": " + p.fecha : ""].filter(Boolean).join(" · ");
      for (const color of ["w", "b"]) {
        if (bloques.length) bloques.push({ tipo: "salto" });
        const nombre = (color === "w" ? p.blancas : p.negras) || "";
        bloques.push({ tipo: "titulo", texto: (color === "w" ? t.deB : t.deN) + (nombre ? " — " + nombre : "") });
        if (lugar) bloques.push({ tipo: "nota", texto: lugar });
        bloques.push({ tipo: "parrafo", texto: t.blancas + ": " + (p.blancas || "—") + "     " + t.negras + ": " + (p.negras || "—") });
        bloques.push({ tipo: "tabla", encabezados: ["#", t.blancas, t.negras, "#", t.blancas, t.negras], filas: filas(p.jugadas || [], opciones && opciones.en), anchos: [1, 3, 3, 1, 3, 3] });
        bloques.push({ tipo: "parrafo", texto: t.resultado + ": " + (t.r[p.resultado] || t.sinResultado) });
        bloques.push({ tipo: "parrafo", texto: t.firmaB + ": ____________________     " + t.firmaN + ": ____________________" });
        bloques.push({ tipo: "parrafo", texto: t.firmaA + ": ____________________" });
        bloques.push({ tipo: "nota", texto: t.nota });
      }
    });
    return { titulo: t.titulo, bloques };
  }

  async function descargar(partidas, nombre, opciones) {
    const blob = await G.ReportePDF.generar(documento(partidas, opciones));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre || "planillas.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return blob;
  }

  const api = { documento, descargar, filas };
  if (typeof window !== "undefined") window.PlanillaPDF = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
