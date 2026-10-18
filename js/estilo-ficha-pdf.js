/**
 * Ajedrez Integral — la ficha de la prueba de estilo, en PDF.
 *
 * Una hoja para imprimir o mandar a la casa: el estilo (los ejes de su prueba,
 * con su etiqueta y su margen ESCRITOS: el PDF se imprime en blanco y negro),
 * las tres aperturas que se le recomendaron con sus primeras jugadas en
 * notación española y el porqué, y cómo seguir. La marca de agua de Oscar
 * Angulo Cubero en todas las páginas, como el diagnóstico de un visitante.
 *
 * NO cuenta nada por su cuenta: el perfil lo da EstiloPerfil.medir() con la
 * versión de la prueba (lo mismo que la pantalla), y la recomendación es la
 * guardada ese día (el acta). El PDF lo escribe js/reporte-pdf.js.
 *
 *   EstiloFichaPDF.documento(prueba, perfil, { nombre, tu, lineaEs }) → el
 *     documento neutral que lee ReportePDF.generar() (se exporta aparte para
 *     comprobar QUÉ dice sin leer el PDF: herramientas/verificar-estilo-ficha.js)
 *   EstiloFichaPDF.descargar(prueba, perfil, { nombre, tu, raiz }) → baja el PDF
 *   EstiloFichaPDF.nombreArchivo(nombre, fecha)
 *
 * El nombre lo escribió una persona: se pasa por String() y en un PDF no se
 * ejecuta nada. Ver «La ficha en PDF» en docs/decisiones/entrenamiento.md.
 */
(function () {
  "use strict";

  const G = typeof window !== "undefined" ? window : globalThis;
  const AUTOR = "Oscar Angulo Cubero";
  const PIE = AUTOR + " · Ajedrez Integral · ajedrez-integral.com";
  const MARCA = "img/logo-oscar-angulo-marca.png";

  const pct = (x) => Math.round(100 * x);
  const texto = (s) => String(s == null ? "" : s).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "").replace(/\s{2,}/g, " ").trim();
  function fechaLarga(iso) {
    const d = iso ? new Date(iso) : null;
    if (!d || isNaN(d)) return "";
    return d.toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Costa_Rica" });
  }
  // Por si no está el módulo de la preparación: N→C, B→A, R→T, Q→D, K→R.
  const PIEZA_ES = { N: "C", B: "A", R: "T", Q: "D", K: "R" };
  function lineaEsSimple(jugadas) {
    return jugadas.map((s, i) => (i % 2 === 0 ? (i / 2 + 1) + "." : "") + s.replace(/^[NBRQK]/, (p) => PIEZA_ES[p]).replace(/=([NBRQ])/, (_, p) => "=" + PIEZA_ES[p])).join(" ");
  }

  function documento(prueba, perfil, opciones) {
    const o = opciones || {};
    const B = G.EstiloItems;
    const tu = !!o.tu;
    const nombre = texto(o.nombre);
    const lineaEs = typeof o.lineaEs === "function" ? o.lineaEs : lineaEsSimple;
    const fecha = fechaLarga(prueba.created_at);
    const bloques = [];

    bloques.push({ tipo: "titulo", texto: tu ? "Qué tipo de partida te gusta" : "Qué tipo de partida le gusta" });
    // Un eje por renglón y no una tabla: la tabla corta lo que no cabe, y
    // «Equilibrado: atacar al rey o maniobrar, según la posición» no cabía.
    for (const e of perfil.lista || []) {
      const x = perfil[e];
      const [uno] = G.EstiloMedidas.POLOS[e];
      bloques.push({ tipo: "subtitulo", texto: B.EJES[e].nombre + ": " + texto(x.etiqueta.texto), eje: e });
      bloques.push({ tipo: "nota", texto: (tu ? "Elegiste" : "Eligió") + " «" + B.EJES[e].polos[uno].toLowerCase() + "» el " + pct(x.p)
        + " % de las veces (entre " + pct(x.lo) + " y " + pct(x.hi) + " %).", eje: e });
    }
    bloques.push({ tipo: "nota", texto: "No hay respuestas correctas: en cada posición había dos jugadas que el motor valora casi igual. El rango dice cuán seguro es el resultado: mientras más angosto, más seguro." });

    bloques.push({ tipo: "titulo", texto: tu ? "Las aperturas que te quedan" : "Las aperturas que le quedan" });
    const rec = prueba.recomendacion || {};
    let alguna = false;
    for (const g of ["blancas", "e4", "d4"]) {
      const r = rec[g];
      if (!r || !r.principal) continue;
      alguna = true;
      bloques.push({ tipo: "subtitulo", texto: texto(r.titulo) });
      const p = r.principal;
      bloques.push({ tipo: "parrafo", texto: (r.mantener ? (tu ? "Sigue con la tuya: " : "Que siga con la suya: ") : (tu ? "Te recomendamos: " : "Le recomendamos: ")) + texto(p.nombre) });
      bloques.push({ tipo: "parrafo", texto: lineaEs(p.jugadas || []) });
      bloques.push({ tipo: "lista", items: (p.porque || []).map(texto) });
      if (r.alternativa) bloques.push({ tipo: "nota", texto: "Otra opción: " + texto(r.alternativa.nombre) + " (" + lineaEs((r.alternativa.jugadas || []).slice(0, 6)) + "…)" });
    }
    if (!alguna) bloques.push({ tipo: "parrafo", texto: "Esta prueba no tiene aperturas recomendadas guardadas." });

    bloques.push({ tipo: "titulo", texto: "Cómo seguir" });
    bloques.push({ tipo: "lista", items: tu ? [
      "Practica cada línea en «Aperturas y celadas», en Entrenamiento, hasta que te salga entera sin ayuda.",
      "Agrégala a «Mi repertorio» para repasarla con las demás.",
      "Juega unas 5 partidas con cada una antes de decidir si te queda: la página de la prueba dice cómo te fue.",
      "Repite la prueba en unos meses: el estilo también cambia.",
    ] : [
      "Que practique cada línea en «Aperturas y celadas», en Entrenamiento, hasta que le salga entera sin ayuda.",
      "Que la agregue a «Mi repertorio» para repasarla con las demás.",
      "Que juegue unas 5 partidas con cada una antes de decidir si le queda: Informes dice cómo le fue.",
      "Que repita la prueba en unos meses: el estilo también cambia.",
    ] });

    return {
      titulo: tu ? "Tu estilo de juego" : "Estilo de juego" + (nombre ? " de " + nombre : ""),
      subtitulo: [nombre && tu ? nombre : "", fecha ? "Prueba del " + fecha : ""].filter(Boolean).join(" · "),
      autor: AUTOR,
      pie: PIE,
      bloques,
    };
  }

  function nombreArchivo(nombre, fecha) {
    const base = texto(nombre || "estilo").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "estilo";
    return "estilo-de-juego-" + base + (fecha ? "-" + String(fecha).slice(0, 10) : "") + ".pdf";
  }

  /* Como la del diagnóstico de un visitante: sin la marca no sale (uno sin
     marca que circula no se distingue de una copia). `raiz`: la dirección del
     sitio, para encontrar el logo también desde entreno/. */
  async function descargar(prueba, perfil, opciones) {
    const o = opciones || {};
    const marca = await G.MarcaAgua.prepararDesde(new URL(MARCA, o.raiz || document.baseURI).href);
    const doc = documento(prueba, perfil, o);
    doc.marca = marca;
    const blob = await G.ReportePDF.generar(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo(o.nombre, prueba.created_at);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return { blob, nombre: a.download };
  }

  const api = { documento, descargar, nombreArchivo, lineaEsSimple };
  if (typeof window !== "undefined") window.EstiloFichaPDF = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
