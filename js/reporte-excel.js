/**
 * Ajedrez Integral — leer una hoja de Excel en el navegador, sin librería.
 *
 * SheetJS pesa unos 900 KB. Para lo que hace falta acá —abrir la hoja que
 * alguien arrastró y sacar sus filas— alcanza con esto, porque un .xlsx es un
 * ZIP con XML adentro y el navegador ya sabe descomprimir: `DecompressionStream`
 * viene de fábrica desde 2023 en todos los navegadores que este sitio soporta.
 *
 * Lee lo que un informe necesita y nada más: la primera hoja, sus celdas y sus
 * textos. NO entiende fórmulas (usa el último valor calculado que guardó Excel,
 * que es justo lo que se quiere ver), ni formatos, ni gráficos.
 *
 * LAS FECHAS DE EXCEL SON UN NÚMERO, y ahí está la trampa: una celda con
 * "14/09/2026" se guarda como 46280. Si se copiara tal cual, el informe para
 * los jefes tendría una columna de números sin sentido. Se detectan por el
 * formato que Excel le puso a la celda y se convierten.
 */
window.ReporteExcel = (function () {
  "use strict";

  /* ------------------------------------------------------ abrir el ZIP */

  function leerNum(vista, pos, octetos) {
    let n = 0;
    for (let i = octetos - 1; i >= 0; i--) n = n * 256 + vista.getUint8(pos + i);
    return n;
  }

  async function descomprimir(bytes, metodo) {
    if (metodo === 0) return bytes;                       // guardado tal cual
    if (metodo !== 8) throw new Error("El archivo usa una compresión que no se reconoce.");
    // "deflate-raw": dentro de un ZIP no hay cabecera zlib, van los bytes pelados.
    const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
  }

  async function abrirZip(buffer) {
    const bytes = new Uint8Array(buffer);
    const vista = new DataView(buffer);

    // El final del ZIP se busca desde atrás: puede llevar comentario.
    let fin = -1;
    for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 65558; i--) {
      if (leerNum(vista, i, 4) === 0x06054b50) { fin = i; break; }
    }
    if (fin < 0) throw new Error("Esto no parece un archivo de Excel.");

    const cuantas = leerNum(vista, fin + 10, 2);
    let pos = leerNum(vista, fin + 16, 4);
    const partes = {};

    for (let i = 0; i < cuantas; i++) {
      if (leerNum(vista, pos, 4) !== 0x02014b50) break;
      const metodo = leerNum(vista, pos + 10, 2);
      const comprimido = leerNum(vista, pos + 20, 4);
      const largoNombre = leerNum(vista, pos + 28, 2);
      const largoExtra = leerNum(vista, pos + 30, 2);
      const largoComentario = leerNum(vista, pos + 32, 2);
      const desplazamiento = leerNum(vista, pos + 42, 4);
      const nombre = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + largoNombre));

      // En la cabecera local los tamaños de nombre y extra pueden ser otros.
      const nombreLocal = leerNum(vista, desplazamiento + 26, 2);
      const extraLocal = leerNum(vista, desplazamiento + 28, 2);
      const datos = desplazamiento + 30 + nombreLocal + extraLocal;
      partes[nombre] = { metodo: metodo, bytes: bytes.subarray(datos, datos + comprimido) };

      pos += 46 + largoNombre + largoExtra + largoComentario;
    }

    return {
      tiene: (n) => !!partes[n],
      texto: async (n) => {
        if (!partes[n]) return null;
        return new TextDecoder().decode(await descomprimir(partes[n].bytes, partes[n].metodo));
      },
      nombres: () => Object.keys(partes),
    };
  }

  /* ------------------------------------------------------------- fechas */

  // Los formatos que Excel numera de fábrica como fecha u hora.
  const FORMATOS_FECHA = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

  function pareceFormatoDeFecha(codigo) {
    if (!codigo) return false;
    // Un formato propio se reconoce por sus letras, pero ojo con "General" y
    // con los que llevan texto entre comillas.
    const limpio = codigo.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
    return /[dmyhs]/i.test(limpio) && !/^general$/i.test(limpio);
  }

  function fechaDeExcel(numero) {
    // Excel cuenta días desde el 30/12/1899 (su famoso 1900 bisiesto que no
    // existió ya está metido en esa cuenta).
    const ms = Math.round((numero - 25569) * 86400000);
    const d = new Date(ms);
    if (isNaN(d.getTime())) return String(numero);
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const texto = dd + "/" + mm + "/" + d.getUTCFullYear();
    // Si trae hora (parte decimal), se agrega.
    const resto = numero - Math.floor(numero);
    if (resto > 0.00001) {
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mi = String(d.getUTCMinutes()).padStart(2, "0");
      return texto + " " + hh + ":" + mi;
    }
    return texto;
  }

  /* ---------------------------------------------------------- el XML */

  const etiquetas = (xml, nombre) => {
    const salida = [];
    const re = new RegExp("<" + nombre + "(\\s[^>]*)?(/>|>([\\s\\S]*?)</" + nombre + ">)", "g");
    let m;
    while ((m = re.exec(xml))) salida.push({ atributos: m[1] || "", dentro: m[3] || "" });
    return salida;
  };
  const atributo = (atributos, nombre) => {
    const m = new RegExp(nombre + '="([^"]*)"').exec(atributos || "");
    return m ? m[1] : null;
  };
  const desescapar = (s) => String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, "&");

  const columnaDe = (ref) => {
    const letras = String(ref || "").replace(/[0-9]/g, "");
    let n = 0;
    for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
    return n - 1;
  };

  /* --------------------------------------------------------------- API */

  /* Devuelve { hoja, filas: [[celda, ...], ...] }. Las filas vienen como texto
     ya listo para poner en una tabla del informe. */
  async function leer(archivo) {
    const nombre = (archivo.name || "").toLowerCase();

    if (nombre.endsWith(".csv")) return leerCsv(await archivo.text(), archivo.name);

    const zip = await abrirZip(await archivo.arrayBuffer());

    // Los textos largos no van en la hoja: van en una tabla aparte.
    const compartidos = [];
    const xmlCompartidos = await zip.texto("xl/sharedStrings.xml");
    if (xmlCompartidos) {
      for (const si of etiquetas(xmlCompartidos, "si")) {
        // Un texto con formato viene partido en varios <t>: se pegan.
        compartidos.push(etiquetas(si.dentro, "t").map((t) => desescapar(t.dentro)).join(""));
      }
    }

    // Qué formato tiene cada estilo, para saber qué celdas son fechas.
    const esFecha = [];
    const xmlEstilos = await zip.texto("xl/styles.xml");
    if (xmlEstilos) {
      const propios = {};
      for (const f of etiquetas(xmlEstilos, "numFmt")) {
        propios[atributo(f.atributos, "numFmtId")] = atributo(f.atributos, "formatCode");
      }
      const cuerpo = /<cellXfs[\s\S]*?<\/cellXfs>/.exec(xmlEstilos);
      if (cuerpo) {
        for (const xf of etiquetas(cuerpo[0], "xf")) {
          const id = atributo(xf.atributos, "numFmtId");
          esFecha.push(FORMATOS_FECHA.has(Number(id)) || pareceFormatoDeFecha(propios[id]));
        }
      }
    }

    // La primera hoja. El orden de xl/worksheets/ no es fiable, así que se
    // toma sheet1.xml y, si no está, la primera que aparezca.
    let ruta = "xl/worksheets/sheet1.xml";
    if (!zip.tiene(ruta)) {
      ruta = zip.nombres().filter((n) => /^xl\/worksheets\/.*\.xml$/.test(n)).sort()[0];
    }
    if (!ruta) throw new Error("El archivo de Excel no trae ninguna hoja.");
    const xmlHoja = await zip.texto(ruta);

    const filas = [];
    for (const fila of etiquetas(xmlHoja, "row")) {
      const celdas = [];
      for (const c of etiquetas(fila.dentro, "c")) {
        const col = columnaDe(atributo(c.atributos, "r"));
        const tipo = atributo(c.atributos, "t");
        const estilo = Number(atributo(c.atributos, "s") || 0);
        let valor = "";
        if (tipo === "inlineStr") {
          valor = etiquetas(c.dentro, "t").map((t) => desescapar(t.dentro)).join("");
        } else {
          const v = etiquetas(c.dentro, "v")[0];
          const bruto = v ? desescapar(v.dentro) : "";
          if (tipo === "s") valor = compartidos[Number(bruto)] || "";
          else if (tipo === "b") valor = bruto === "1" ? "sí" : "no";
          else if (bruto !== "" && esFecha[estilo] && !isNaN(Number(bruto))) valor = fechaDeExcel(Number(bruto));
          else valor = bruto;
        }
        while (celdas.length < col) celdas.push("");
        celdas[col] = valor;
      }
      filas.push(celdas);
    }

    // Se quitan las filas del final que quedaron vacías: Excel guarda muchas.
    while (filas.length && filas[filas.length - 1].every((c) => !String(c).trim())) filas.pop();

    return { hoja: archivo.name, filas: filas };
  }

  /* Un CSV, que es lo que sale de "Guardar como" en media oficina. Se detecta
     el separador solo: Excel en español guarda con punto y coma. */
  function leerCsv(texto, nombre) {
    const limpio = texto.replace(/^﻿/, "");
    const primera = limpio.split(/\r?\n/)[0] || "";
    const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ";" : ",";
    const filas = [];
    let celda = "", fila = [], entreComillas = false;
    for (let i = 0; i < limpio.length; i++) {
      const c = limpio[i];
      if (entreComillas) {
        if (c === '"' && limpio[i + 1] === '"') { celda += '"'; i++; }
        else if (c === '"') entreComillas = false;
        else celda += c;
      } else if (c === '"') entreComillas = true;
      else if (c === sep) { fila.push(celda); celda = ""; }
      else if (c === "\n") { fila.push(celda); filas.push(fila); fila = []; celda = ""; }
      else if (c !== "\r") celda += c;
    }
    if (celda !== "" || fila.length) { fila.push(celda); filas.push(fila); }
    while (filas.length && filas[filas.length - 1].every((c) => !String(c).trim())) filas.pop();
    return { hoja: nombre, filas: filas };
  }

  return { leer: leer, _fechaDeExcel: fechaDeExcel, _leerCsv: leerCsv };
})();
