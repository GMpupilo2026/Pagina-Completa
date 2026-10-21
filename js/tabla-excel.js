/**
 * Ajedrez Integral — escribir una hoja de Excel (.xlsx) en el navegador, sin
 * librería.
 *
 * El hermano de js/reporte-excel.js, que las LEE. SheetJS pesa unos 900 KB y
 * para bajar una tabla alcanza con esto: un .xlsx es un ZIP con unos pocos XML
 * adentro, y el ZIP puede ir sin comprimir («stored»), así que no hace falta
 * ningún compresor: solo el CRC32 de cada parte, que es una tabla de 256
 * números.
 *
 * Lo que escribe: una o varias hojas, la primera fila en negrita (el
 * encabezado) y cada celda como texto o como número. Un texto que es un
 * número a la tica («15,0», «+5,4», «−0,7», «1 234») se guarda como número,
 * para que la hoja pueda sumar; lo demás («1 de 3», «1½», «5·0·0») queda
 * como texto. Los textos van como «inlineStr»: sin tabla de textos
 * compartidos, que no hace falta para unas cientos de filas.
 *
 *   TablaExcel.armar(hojas) → Uint8Array con el .xlsx
 *       hojas = [{ nombre, filas: [[celda, …], …] }]  (la fila 0 es el encabezado)
 *   TablaExcel.bajar(nombreArchivo, hojas) → lo arma y lo baja
 *   TablaExcel.numero(texto) → el número, o null si el texto no es un número
 */
(function (raiz) {
  "use strict";

  /* ------------------------------------------------------------ el CRC32 */
  const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /* ------------------------------------------------- el ZIP, sin comprimir */
  const utf8 = (s) => new TextEncoder().encode(s);
  function zip(partes) {
    const trozos = [], centrales = [];
    let pos = 0;
    const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
    const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
    for (const p of partes) {
      // `bytes` (un PDF, por ejemplo) o `texto`: el paquete final de un evento de
      // Pareo Integral mete los dos en el mismo .zip.
      const nombre = utf8(p.nombre), datos = p.bytes || utf8(p.texto), crc = crc32(datos);
      // Bit 11: el nombre va en UTF-8. Método 0: guardado tal cual.
      const comun = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(datos.length), ...u32(datos.length), ...u16(nombre.length), ...u16(0)];
      const local = Uint8Array.from([...u32(0x04034b50), ...comun]);
      trozos.push(local, nombre, datos);
      centrales.push(Uint8Array.from([...u32(0x02014b50), ...u16(20), ...comun, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(pos)]), nombre);
      pos += local.length + nombre.length + datos.length;
    }
    const inicioCentral = pos;
    let largoCentral = 0;
    for (const c of centrales) { trozos.push(c); largoCentral += c.length; }
    trozos.push(Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(partes.length), ...u16(partes.length), ...u32(largoCentral), ...u32(inicioCentral), ...u16(0)]));
    const total = trozos.reduce((a, t) => a + t.length, 0);
    const salida = new Uint8Array(total);
    let i = 0;
    for (const t of trozos) { salida.set(t, i); i += t.length; }
    return salida;
  }

  /* ------------------------------------------------------- las celdas */
  const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    // Los caracteres de control no caben en un XML (salvo tab y salto).
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

  /* «15,0» → 15; «+5,4» → 5.4; «−0,7» → −0.7; «1 234» → 1234. El separador de
     miles es el espacio (también el fino) y el decimal la coma, como en es-CR. */
  function numero(texto) {
    if (typeof texto === "number") return isFinite(texto) ? texto : null;
    const s = String(texto == null ? "" : texto).trim().replace(/[   ](?=\d{3}(\D|$))/g, "").replace(/^−/, "-");
    if (!/^[+-]?\d+(,\d+)?$/.test(s)) return null;
    const n = Number(s.replace(",", "."));
    return isFinite(n) ? n : null;
  }

  function columna(i) {
    let s = "";
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  }

  function hoja(filas) {
    const ancho = filas.reduce((a, f) => Math.max(a, f.length), 0);
    const largos = Array.from({ length: ancho }, (_, c) => Math.min(60, Math.max(6, ...filas.map((f) => String(f[c] == null ? "" : f[c]).length + 2))));
    let s = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      + "<cols>" + largos.map((l, c) => '<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + l + '" customWidth="1"/>').join("") + "</cols><sheetData>";
    filas.forEach((f, r) => {
      s += '<row r="' + (r + 1) + '">';
      f.forEach((v, c) => {
        if (v == null || v === "") return;
        const ref = columna(c) + (r + 1), estilo = r === 0 ? ' s="1"' : "";
        const n = r === 0 ? null : numero(v);
        s += n !== null ? '<c r="' + ref + '"' + estilo + "><v>" + n + "</v></c>"
          : '<c r="' + ref + '"' + estilo + ' t="inlineStr"><is><t xml:space="preserve">' + xml(v) + "</t></is></c>";
      });
      s += "</row>";
    });
    return s + "</sheetData></worksheet>";
  }

  function nombreHoja(n, i, usados) {
    let s = String(n || "Hoja " + (i + 1)).replace(/[\[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Hoja " + (i + 1);
    for (let k = 2; usados.has(s.toLowerCase()); k++) s = s.slice(0, 27) + " (" + k + ")";
    usados.add(s.toLowerCase());
    return s;
  }

  function armar(hojas) {
    const usados = new Set();
    const nombres = hojas.map((h, i) => nombreHoja(h.nombre, i, usados));
    const partes = [
      { nombre: "[Content_Types].xml", texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + hojas.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("")
        + "</Types>" },
      { nombre: "_rels/.rels", texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { nombre: "xl/workbook.xml", texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
        + nombres.map((n, i) => '<sheet name="' + xml(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join("") + "</sheets></workbook>" },
      { nombre: "xl/_rels/workbook.xml.rels", texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + hojas.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join("")
        + '<Relationship Id="rId' + (hojas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { nombre: "xl/styles.xml", texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
        + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
        + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
        + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        + "</styleSheet>" },
      ...hojas.map((h, i) => ({ nombre: "xl/worksheets/sheet" + (i + 1) + ".xml", texto: hoja(h.filas || []) })),
    ];
    return zip(partes);
  }

  function bajar(nombreArchivo, hojas) {
    const blob = new Blob([armar(hojas)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = /\.xlsx$/i.test(nombreArchivo) ? nombreArchivo : nombreArchivo + ".xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return blob;
  }

  const api = { armar, bajar, numero, zip, _crc32: crc32 };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.TablaExcel = api;
})(typeof self !== "undefined" ? self : this);
