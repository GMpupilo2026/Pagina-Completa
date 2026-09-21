/**
 * Ajedrez Integral — leer los documentos con el contenido de las clases.
 *
 * Para el informe de clases dadas por fuera de la plataforma, el contenido de
 * lo que se enseñó no está en ninguna base: está en un documento que escribió
 * quien dio la clase. Acá se lee ese documento y se ORDENA por clase.
 *
 * Lee .txt, .md y .docx. El .docx se abre con el mismo lector de ZIP que ya usa
 * js/reporte-excel.js —los dos formatos son un ZIP con XML adentro— para no
 * tener dos copias del mismo lector.
 *
 * LO QUE HACE Y LO QUE NO. Corta el documento en secciones y las empareja con
 * las clases por su fecha: si una línea empieza con "12/09/2026" o con un
 * encabezado que lleva fecha, lo que sigue es el contenido de esa clase. Lo que
 * NO hace es resumir ni interpretar lo que dice el texto: eso pide un modelo de
 * lenguaje, con su credencial y su costo, y acá no hay ninguno. Lo que queda en
 * el informe son las palabras de quien dio la clase, ordenadas y puestas donde
 * corresponde — no una versión inventada de ellas.
 */
window.ReporteTextos = (function () {
  "use strict";

  const desescapar = (s) => String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, "&");

  /* ---------------------------------------------------------- sacar texto */

  async function textoDeDocx(archivo) {
    const zip = await window.ReporteExcel.abrirZip(await archivo.arrayBuffer());
    const xml = await zip.texto("word/document.xml");
    if (!xml) throw new Error("El documento de Word no trae contenido legible.");
    // Cada <w:p> es un párrafo y cada <w:t> un trozo de texto dentro de él.
    // Un párrafo puede venir partido en varios <w:t> si tiene negritas o
    // correcciones, así que se pegan antes de cortar por párrafo.
    return xml.split(/<\/w:p>/)
      .map((p) => (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
        .map((t) => desescapar(t.replace(/<[^>]+>/g, ""))).join(""))
      .filter((p) => p.trim() !== "" || true)          // se conservan los vacíos: separan secciones
      .join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  async function textoDe(archivo) {
    const nombre = (archivo.name || "").toLowerCase();
    if (nombre.endsWith(".docx")) return textoDeDocx(archivo);
    if (nombre.endsWith(".doc")) {
      throw new Error("Los .doc viejos no se pueden leer acá. Guárdalo como .docx o como texto.");
    }
    return (await archivo.text()).replace(/\r\n/g, "\n");
  }

  /* -------------------------------------------------------- cortar por clase */

  /* Una fecha al principio de una línea, escrita como sea. Se busca al empezar
     el renglón y no en medio: "el 12/09 jugamos" no abre una sección nueva. */
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
    "agosto", "septiembre", "setiembre", "octubre", "noviembre", "diciembre"];

  function fechaAlInicio(linea) {
    const l = linea.trim().replace(/^#+\s*/, "").replace(/^[-*•]\s*/, "");
    let m = /^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?\b/.exec(l);
    if (m) {
      const d = Number(m[1]), mes = Number(m[2]);
      if (d <= 31 && mes <= 12) {
        let a = m[3] ? Number(m[3]) : new Date().getFullYear();
        if (a < 100) a += 2000;
        return String(d).padStart(2, "0") + "/" + String(mes).padStart(2, "0") + "/" + a;
      }
    }
    m = /^(\d{4})-(\d{2})-(\d{2})\b/.exec(l);
    if (m) return m[3] + "/" + m[2] + "/" + m[1];
    // "Clase del 12 de septiembre de 2026" y parientes.
    m = /^(?:clase|sesi[oó]n|lecci[oó]n)?\s*(?:del?\s+)?(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+de\s+(\d{4}))?/i.exec(l);
    if (m) {
      const i = MESES.indexOf(m[2].toLowerCase());
      if (i >= 0) {
        const mes = i >= 9 ? i : i + 1;              // "setiembre" y "septiembre" son el mismo
        return String(Number(m[1])).padStart(2, "0") + "/" +
          String(mes === 9 ? 9 : mes).padStart(2, "0") + "/" + (m[3] || new Date().getFullYear());
      }
    }
    return null;
  }

  /* Corta el texto en secciones. Cada vez que una línea empieza con una fecha,
     empieza una sección nueva. Lo que venga antes de la primera fecha queda
     como introducción del documento. */
  function enSecciones(texto, nombre) {
    const lineas = texto.split("\n");
    const secciones = [];
    let actual = { fecha: null, titulo: "", lineas: [] };

    for (const linea of lineas) {
      const fecha = fechaAlInicio(linea);
      if (fecha) {
        if (actual.lineas.length || actual.fecha) secciones.push(actual);
        actual = { fecha: fecha, titulo: linea.trim().replace(/^#+\s*/, ""), lineas: [] };
      } else {
        actual.lineas.push(linea);
      }
    }
    if (actual.lineas.length || actual.fecha) secciones.push(actual);

    return secciones
      .map((s) => ({
        fecha: s.fecha,
        titulo: s.titulo,
        texto: s.lineas.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
      }))
      .filter((s) => s.texto || s.fecha)
      .map((s) => Object.assign({ documento: nombre }, s));
  }

  /**
   * Lee un documento y lo devuelve ya cortado por clase.
   * @returns { nombre, tamano, palabras, secciones: [{fecha, titulo, texto}], conFechas }
   */
  async function leer(archivo) {
    const texto = await textoDe(archivo);
    if (!texto.trim()) throw new Error("«" + archivo.name + "» no trae texto que leer.");
    const secciones = enSecciones(texto, archivo.name);
    return {
      nombre: archivo.name,
      tamano: archivo.size,
      palabras: (texto.match(/\S+/g) || []).length,
      secciones: secciones,
      conFechas: secciones.filter((s) => s.fecha).length,
      texto: texto,
    };
  }

  return {
    leer: leer,
    _enSecciones: enSecciones,
    _fechaAlInicio: fechaAlInicio,
    _textoDeDocx: textoDeDocx,
  };
})();
