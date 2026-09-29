/* Bajar una tabla para abrirla en Excel: un CSV con punto y coma y BOM.
 *
 * Punto y coma y BOM porque es lo que Excel en español abre de un doble clic:
 * con coma, Excel mete la fila entera en la columna A, y sin BOM las tildes
 * salen rotas (la misma decisión de Formularios y Cobros).
 *
 * Lo que escribe una persona puede empezar con «=», «+», «-» o «@», y Excel lo
 * EJECUTA como fórmula al abrir el archivo: un alumno que escribe
 * «=HIPERVINCULO(…)» en su justificación le deja un enlace armado a quien la
 * baje. Por eso a esas celdas se les antepone un apóstrofo, que Excel toma
 * como «esto es texto» y no enseña. Los números que arma la página (un 3, una
 * fecha) no llevan: van como número.
 *
 *   CsvExcel.texto(cabeceras, filas)        → el contenido, para probarlo
 *   CsvExcel.bajar(nombre, cabeceras, filas) → lo descarga
 */
(function () {
    "use strict";

    const PELIGROSO = /^[=+\-@\t\r]/;

    function celda(v) {
        if (v == null) return '""';
        let t = String(v);
        if (typeof v !== "number" && PELIGROSO.test(t)) t = "'" + t;
        return '"' + t.replace(/"/g, '""') + '"';
    }

    function texto(cabeceras, filas) {
        return "﻿" + [cabeceras].concat(filas).map((f) => f.map(celda).join(";")).join("\r\n");
    }

    function bajar(nombre, cabeceras, filas) {
        const url = URL.createObjectURL(new Blob([texto(cabeceras, filas)], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = nombre;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    const api = { texto, bajar, celda };
    if (typeof window !== "undefined") window.CsvExcel = api;
    if (typeof module !== "undefined") module.exports = api;
})();
