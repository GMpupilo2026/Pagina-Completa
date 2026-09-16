/**
 * Ajedrez Integral — el informe de actividades en PDF, escrito a mano.
 *
 * NO usa ninguna librería, y es a propósito. Las que hacen PDF en el navegador
 * pesan entre 300 KB y 1 MB, y esta página la abre una persona cada tanto para
 * armar un informe: bajarle un mega para eso sería justo lo contrario de lo
 * que se acaba de arreglar en el resto del sitio. Un PDF es un formato de
 * texto con una tabla de posiciones al final; lo que hace falta acá —texto,
 * tablas, fotos y una marca de agua— cabe en este archivo.
 *
 * DOS COSAS QUE PARECEN MAGIA Y NO LO SON:
 *
 * 1. Las fotos van con DCTDecode, que quiere decir "adentro va un JPEG tal
 *    cual". No hay que codificar nada: se pegan los bytes del JPEG. Por eso la
 *    página pasa todas las imágenes por un canvas y las saca en JPEG antes de
 *    llegar acá — así este archivo no tiene que saber decodificar PNG, WebP ni
 *    lo que traiga el teléfono de quien sube las fotos.
 *
 * 2. Las tildes y la ñ salen bien porque el texto va en WinAnsiEncoding:
 *    Helvetica ya trae esos dibujos y no hay que incrustar ninguna fuente.
 *    WinAnsi se parece a Latin-1 pero NO es Latin-1 —el guion largo y las
 *    comillas tipográficas viven en los bytes 0x80-0x9F, que en Latin-1 no
 *    son nada—, y confundirlos se come justo esos signos sin avisar. Lo que
 *    no tiene dibujo (un emoji) se reemplaza en vez de desaparecer.
 *
 * La marca de agua se dibuja en TODAS las páginas, con el logo en escala de
 * grises y su canal alfa aparte (/SMask). Sin el alfa, la imagen taparía el
 * texto con un rectángulo blanco.
 */
window.ReportePDF = (function () {
  "use strict";

  const A4 = { ancho: 595.28, alto: 841.89 };
  const MARGEN = 56;

  /* ---------------------------------------------------------------- texto */

  /* Anchos de Helvetica, en milésimas de punto. Son los del AFM de Adobe.
     Las vocales con tilde miden lo mismo que sin ella —el acento no corre la
     letra—, así que se resuelven quitándole la tilde y midiendo la base. */
  const ANCHOS = {
    normal: { " ":278,"!":278,'"':355,"#":556,"$":556,"%":889,"&":667,"'":191,"(":333,")":333,"*":389,"+":584,",":278,"-":333,".":278,"/":278,"0":556,"1":556,"2":556,"3":556,"4":556,"5":556,"6":556,"7":556,"8":556,"9":556,":":278,";":278,"<":584,"=":584,">":584,"?":556,"@":1015,"A":667,"B":667,"C":722,"D":722,"E":667,"F":611,"G":778,"H":722,"I":278,"J":500,"K":667,"L":556,"M":833,"N":722,"O":778,"P":667,"Q":778,"R":722,"S":667,"T":611,"U":722,"V":667,"W":944,"X":667,"Y":667,"Z":611,"[":278,"\\":278,"]":278,"^":469,"_":556,"`":333,"a":556,"b":556,"c":500,"d":556,"e":556,"f":278,"g":556,"h":556,"i":222,"j":222,"k":500,"l":222,"m":833,"n":556,"o":556,"p":556,"q":556,"r":333,"s":500,"t":278,"u":556,"v":500,"w":722,"x":500,"y":500,"z":500,"{":334,"|":260,"}":334,"~":584,"¿":611,"¡":333,"·":278,"—":1000,"–":556,"°":400,"«":556,"»":556,"€":556 },
    negrita: { " ":278,"!":333,'"':474,"#":556,"$":556,"%":889,"&":722,"'":238,"(":333,")":333,"*":389,"+":584,",":278,"-":333,".":278,"/":278,"0":556,"1":556,"2":556,"3":556,"4":556,"5":556,"6":556,"7":556,"8":556,"9":556,":":333,";":333,"<":584,"=":584,">":584,"?":611,"@":975,"A":722,"B":722,"C":722,"D":722,"E":667,"F":611,"G":778,"H":722,"I":278,"J":556,"K":722,"L":611,"M":833,"N":722,"O":778,"P":667,"Q":778,"R":722,"S":667,"T":611,"U":722,"V":667,"W":944,"X":667,"Y":667,"Z":611,"[":333,"\\":278,"]":333,"^":584,"_":556,"`":333,"a":556,"b":611,"c":556,"d":611,"e":556,"f":333,"g":611,"h":611,"i":278,"j":278,"k":556,"l":278,"m":889,"n":611,"o":611,"p":611,"q":611,"r":389,"s":556,"t":333,"u":611,"v":556,"w":778,"x":556,"y":556,"z":500,"{":389,"|":280,"}":389,"~":584,"¿":611,"¡":333,"·":278,"—":1000,"–":556,"°":400,"«":556,"»":556,"€":556 },
  };

  // Para medir: "á" mide lo que "a". Se le quita el acento y se mide la base.
  const sinAcento = (c) => c.normalize("NFD").replace(/[̀-ͯ]/g, "") || c;

  function anchoDe(texto, tam, negrita) {
    const tabla = ANCHOS[negrita ? "negrita" : "normal"];
    let total = 0;
    for (const c of texto) {
      const a = tabla[c] !== undefined ? tabla[c] : tabla[sinAcento(c)];
      total += a !== undefined ? a : 556;
    }
    return (total * tam) / 1000;
  }

  /* OJO: WinAnsi NO es Latin-1. Los bytes 0x80-0x9F, que en Latin-1 no son
     nada, en WinAnsi son justo la tipografía que este sitio usa: el guion
     largo, las comillas tipográficas, los puntos suspensivos. Tratarlo como
     Latin-1 a secas se comía el guion largo de "Jean Quesada - 1 clase" y
     dejaba un hueco en el papel, sin dar ningún error. */
  const WINANSI = {
    "\u20ac": 0x80, "\u201a": 0x82, "\u0192": 0x83, "\u201e": 0x84, "\u2026": 0x85,
    "\u2020": 0x86, "\u2021": 0x87, "\u02c6": 0x88, "\u2030": 0x89, "\u0160": 0x8a,
    "\u2039": 0x8b, "\u0152": 0x8c, "\u017d": 0x8e, "\u2018": 0x91, "\u2019": 0x92,
    "\u201c": 0x93, "\u201d": 0x94, "\u2022": 0x95, "\u2013": 0x96, "\u2014": 0x97,
    "\u02dc": 0x98, "\u2122": 0x99, "\u0161": 0x9a, "\u203a": 0x9b, "\u0153": 0x9c,
    "\u017e": 0x9e, "\u0178": 0x9f,
  };
  /* Lo que no tiene dibujo en la fuente se cambia por algo que sí, en vez de
     desaparecer: un emoji perdido en un informe no es grave, un hueco mudo sí. */
  const REEMPLAZOS = { "\u00a0": " ", "\u2192": "->", "\u2713": "-", "\u2717": "x", "\u2248": "~" };

  function aLatin1(texto) {
    let salida = "";
    for (const c of String(texto)) {
      if (WINANSI[c] !== undefined) { salida += String.fromCharCode(WINANSI[c]); continue; }
      const r = REEMPLAZOS[c] !== undefined ? REEMPLAZOS[c] : c;
      for (const d of r) {
        const cp = d.codePointAt(0);
        if (cp <= 0xff) salida += d;
        else {
          const base = sinAcento(d);           // "ñ" ya entra; un emoji no
          salida += base.codePointAt(0) <= 0xff ? base : "";
        }
      }
    }
    return salida;
  }

  const escapar = (s) => aLatin1(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  /* Parte un párrafo en renglones que quepan en el ancho dado. */
  function renglones(texto, ancho, tam, negrita) {
    const salida = [];
    for (const parrafo of String(texto).split("\n")) {
      const palabras = parrafo.split(/\s+/).filter(Boolean);
      if (!palabras.length) { salida.push(""); continue; }
      let linea = "";
      for (const palabra of palabras) {
        const prueba = linea ? linea + " " + palabra : palabra;
        if (anchoDe(prueba, tam, negrita) <= ancho || !linea) linea = prueba;
        else { salida.push(linea); linea = palabra; }
      }
      if (linea) salida.push(linea);
    }
    return salida;
  }

  /* --------------------------------------------------------------- bytes */

  function bytesDeTexto(s) {
    // Latin-1: un carácter, un byte. No sirve TextEncoder, que da UTF-8.
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
  }

  async function desinflar(bytes) {
    const cs = new CompressionStream("deflate");   // zlib, que es lo que pide /FlateDecode
    const flujo = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(flujo).arrayBuffer());
  }

  /* -------------------------------------------------------- el documento */

  function Constructor() {
    this.objetos = [null];          // el 0 no se usa: en PDF es el objeto libre
    this.paginas = [];
  }

  Constructor.prototype.nuevo = function (contenido) {
    this.objetos.push(contenido);
    return this.objetos.length - 1;
  };

  /* ------------------------------------------------------------ dibujar */

  function Lienzo(doc, recursos) {
    this.doc = doc;
    this.recursos = recursos;
    this.ops = [];
    this.y = A4.alto - MARGEN;
    this.paginas = [];
  }

  Lienzo.prototype.anchoUtil = function () { return A4.ancho - MARGEN * 2; };

  Lienzo.prototype.cerrarPagina = function () {
    this.paginas.push(this.ops.join("\n"));
    this.ops = [];
    this.y = A4.alto - MARGEN;
  };

  Lienzo.prototype.espacio = function (alto) {
    if (this.y - alto < MARGEN + 30) this.cerrarPagina();   // 30 = sitio para el pie
  };

  Lienzo.prototype.texto = function (linea, tam, negrita, sangria, gris) {
    this.espacio(tam * 1.35);
    this.y -= tam * 1.15;
    this.ops.push("BT /" + (negrita ? "FB" : "FN") + " " + tam + " Tf" +
      (gris ? " " + gris + " " + gris + " " + gris + " rg" : " 0.10 0.16 0.24 rg") +
      " 1 0 0 1 " + (MARGEN + (sangria || 0)).toFixed(2) + " " + this.y.toFixed(2) + " Tm (" +
      escapar(linea) + ") Tj ET");
    this.y -= tam * 0.2;
  };

  Lienzo.prototype.parrafo = function (texto, tam, negrita, sangria, gris) {
    const ancho = this.anchoUtil() - (sangria || 0);
    for (const linea of renglones(texto, ancho, tam, negrita)) {
      if (linea === "") this.y -= tam * 0.5;
      else this.texto(linea, tam, negrita, sangria, gris);
    }
    this.y -= tam * 0.45;      // aire entre párrafos
  };

  Lienzo.prototype.linea = function () {
    this.espacio(10);
    this.y -= 6;
    this.ops.push("0.80 0.84 0.88 RG 0.8 w " + MARGEN + " " + this.y.toFixed(2) + " m " +
      (A4.ancho - MARGEN).toFixed(2) + " " + this.y.toFixed(2) + " l S");
    this.y -= 6;
  };

  /* Una tabla sencilla: encabezado en negrita, filas con líneas finas. Las
     celdas no parten en varios renglones a propósito — se recortan. Una tabla
     de informe con celdas de tres líneas se vuelve ilegible, y lo largo va en
     los párrafos. */
  Lienzo.prototype.tabla = function (encabezados, filas, anchos) {
    const tam = 9;
    const alto = 16;
    const total = anchos.reduce((a, b) => a + b, 0);
    const escala = this.anchoUtil() / total;
    const cols = anchos.map((a) => a * escala);

    const pintarEncabezado = () => {
      this.espacio(alto * 2);
      this.y -= alto;
      this.ops.push("0.93 0.95 0.97 rg " + MARGEN + " " + (this.y - 4).toFixed(2) + " " +
        this.anchoUtil().toFixed(2) + " " + alto + " re f");
      let x = MARGEN + 4;
      encabezados.forEach((h, i) => {
        this.ops.push("BT /FB " + tam + " Tf 0.10 0.16 0.24 rg 1 0 0 1 " + x.toFixed(2) + " " +
          this.y.toFixed(2) + " Tm (" + escapar(recortar(h, cols[i] - 8, tam, true)) + ") Tj ET");
        x += cols[i];
      });
      this.y -= 6;
    };

    pintarEncabezado();
    for (const fila of filas) {
      if (this.y - alto < MARGEN + 30) { this.cerrarPagina(); pintarEncabezado(); }
      this.y -= alto;
      let x = MARGEN + 4;
      fila.forEach((celda, i) => {
        this.ops.push("BT /FN " + tam + " Tf 0.20 0.25 0.32 rg 1 0 0 1 " + x.toFixed(2) + " " +
          this.y.toFixed(2) + " Tm (" + escapar(recortar(celda, cols[i] - 8, tam, false)) + ") Tj ET");
        x += cols[i];
      });
      this.ops.push("0.90 0.92 0.95 RG 0.5 w " + MARGEN + " " + (this.y - 5).toFixed(2) + " m " +
        (A4.ancho - MARGEN).toFixed(2) + " " + (this.y - 5).toFixed(2) + " l S");
    }
    this.y -= 8;
  };

  function recortar(texto, ancho, tam, negrita) {
    let s = String(texto == null ? "" : texto);
    if (anchoDe(s, tam, negrita) <= ancho) return s;
    while (s.length > 1 && anchoDe(s + "...", tam, negrita) > ancho) s = s.slice(0, -1);
    return s + "...";
  }

  Lienzo.prototype.imagen = function (nombre, anchoPx, altoPx, anchoMax) {
    const ancho = Math.min(anchoMax || this.anchoUtil(), this.anchoUtil());
    const alto = (altoPx / anchoPx) * ancho;
    this.espacio(alto + 10);
    this.y -= alto + 6;
    this.ops.push("q " + ancho.toFixed(2) + " 0 0 " + alto.toFixed(2) + " " + MARGEN + " " +
      this.y.toFixed(2) + " cm /" + nombre + " Do Q");
    this.y -= 4;
  };

  /* ------------------------------------------------------------ armado */

  async function generar(documento) {
    const doc = new Constructor();
    const recursos = { imagenes: {} };
    const lienzo = new Lienzo(doc, recursos);

    // --- las fotos, como XObjects
    let n = 0;
    const idPorFoto = new Map();
    for (const foto of documento.fotos || []) {
      const nombre = "Im" + (++n);
      const id = doc.nuevo({
        diccionario: "<< /Type /XObject /Subtype /Image /Width " + foto.ancho + " /Height " + foto.alto +
          " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + foto.jpeg.length + " >>",
        flujo: foto.jpeg,
      });
      recursos.imagenes[nombre] = id;
      idPorFoto.set(foto, nombre);
    }

    // --- la marca de agua: gris + su canal alfa aparte
    let marcaNombre = null;
    if (documento.marca && documento.marca.jpeg) {
      const alfaId = documento.marca.alfa
        ? doc.nuevo({
            diccionario: "<< /Type /XObject /Subtype /Image /Width " + documento.marca.ancho +
              " /Height " + documento.marca.alto + " /ColorSpace /DeviceGray /BitsPerComponent 8" +
              " /Filter /FlateDecode /Length @@ >>",
            flujo: await desinflar(documento.marca.alfa),
          })
        : null;
      marcaNombre = "Marca";
      recursos.imagenes[marcaNombre] = doc.nuevo({
        diccionario: "<< /Type /XObject /Subtype /Image /Width " + documento.marca.ancho +
          " /Height " + documento.marca.alto + " /ColorSpace /DeviceRGB /BitsPerComponent 8" +
          " /Filter /DCTDecode" + (alfaId ? " /SMask " + alfaId + " 0 R" : "") + " /Length @@ >>",
        flujo: documento.marca.jpeg,
      });
    }

    // --- el contenido
    pintar(lienzo, documento, idPorFoto);
    lienzo.cerrarPagina();

    // --- las páginas
    const fuenteN = doc.nuevo({ diccionario: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>" });
    const fuenteB = doc.nuevo({ diccionario: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>" });
    const transparencia = doc.nuevo({ diccionario: "<< /Type /ExtGState /ca 0.10 /CA 0.10 >>" });

    const paginasId = doc.nuevo(null);     // se rellena al final
    const idsPagina = [];
    const total = lienzo.paginas.length;

    lienzo.paginas.forEach((ops, i) => {
      let contenido = "";
      // La marca de agua va PRIMERO para quedar debajo del texto.
      if (marcaNombre) {
        const ancho = 300, alto = ancho * (documento.marca.alto / documento.marca.ancho);
        contenido += "q /Transparencia gs " + ancho + " 0 0 " + alto.toFixed(2) + " " +
          ((A4.ancho - ancho) / 2).toFixed(2) + " " + ((A4.alto - alto) / 2).toFixed(2) +
          " cm /" + marcaNombre + " Do Q\n";
      }
      contenido += ops + "\n";
      // El pie, en todas: quién lo hizo y en qué página va.
      contenido += "BT /FN 8 Tf 0.45 0.50 0.56 rg 1 0 0 1 " + MARGEN + " " + (MARGEN - 18) + " Tm (" +
        escapar(documento.pie || "") + ") Tj ET\n";
      const num = "Página " + (i + 1) + " de " + total;
      contenido += "BT /FN 8 Tf 0.45 0.50 0.56 rg 1 0 0 1 " +
        (A4.ancho - MARGEN - anchoDe(num, 8, false)).toFixed(2) + " " + (MARGEN - 18) + " Tm (" +
        escapar(num) + ") Tj ET\n";

      const contenidoId = doc.nuevo({ diccionario: "<< /Length @@ >>", flujo: bytesDeTexto(contenido) });
      const imagenes = Object.keys(recursos.imagenes)
        .map((k) => "/" + k + " " + recursos.imagenes[k] + " 0 R").join(" ");
      idsPagina.push(doc.nuevo({
        diccionario: "<< /Type /Page /Parent " + paginasId + " 0 R /MediaBox [0 0 " + A4.ancho + " " + A4.alto + "]" +
          " /Resources << /Font << /FN " + fuenteN + " 0 R /FB " + fuenteB + " 0 R >>" +
          " /ExtGState << /Transparencia " + transparencia + " 0 R >>" +
          (imagenes ? " /XObject << " + imagenes + " >>" : "") + " >>" +
          " /Contents " + contenidoId + " 0 R >>",
      }));
    });

    doc.objetos[paginasId] = {
      diccionario: "<< /Type /Pages /Count " + idsPagina.length + " /Kids [" +
        idsPagina.map((i) => i + " 0 R").join(" ") + "] >>",
    };
    const catalogo = doc.nuevo({ diccionario: "<< /Type /Catalog /Pages " + paginasId + " 0 R >>" });
    const info = doc.nuevo({
      diccionario: "<< /Title (" + escapar(documento.titulo || "Informe") + ") /Author (" +
        escapar(documento.autor || "") + ") /Creator (Ajedrez Integral) >>",
    });

    return ensamblar(doc, catalogo, info);
  }

  function ensamblar(doc, catalogo, info) {
    const trozos = [];
    let largo = 0;
    const empujar = (bytes) => { trozos.push(bytes); largo += bytes.length; };

    empujar(bytesDeTexto("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"));
    const posiciones = [0];
    for (let i = 1; i < doc.objetos.length; i++) {
      posiciones[i] = largo;
      const o = doc.objetos[i];
      const dic = o.flujo ? o.diccionario.replace("@@", String(o.flujo.length)) : o.diccionario;
      empujar(bytesDeTexto(i + " 0 obj\n" + dic + "\n"));
      if (o.flujo) {
        empujar(bytesDeTexto("stream\n"));
        empujar(o.flujo);
        empujar(bytesDeTexto("\nendstream\n"));
      }
      empujar(bytesDeTexto("endobj\n"));
    }

    const xref = largo;
    let tabla = "xref\n0 " + doc.objetos.length + "\n0000000000 65535 f \n";
    for (let i = 1; i < doc.objetos.length; i++) {
      tabla += String(posiciones[i]).padStart(10, "0") + " 00000 n \n";
    }
    tabla += "trailer\n<< /Size " + doc.objetos.length + " /Root " + catalogo + " 0 R /Info " + info +
      " 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
    empujar(bytesDeTexto(tabla));

    const salida = new Uint8Array(largo);
    let i = 0;
    for (const t of trozos) { salida.set(t, i); i += t.length; }
    return new Blob([salida], { type: "application/pdf" });
  }

  /* Recorre el documento neutral —el mismo que lee el generador de .docx— y lo
     dibuja. Que los dos lean la misma estructura es lo que evita que el PDF y
     el Word se vayan separando con el tiempo. */
  function pintar(lienzo, documento, idPorFoto) {
    lienzo.texto(documento.titulo || "Informe", 20, true);
    if (documento.subtitulo) lienzo.parrafo(documento.subtitulo, 11, false, 0, 0.45);
    lienzo.linea();

    for (const bloque of documento.bloques || []) {
      if (bloque.tipo === "titulo") { lienzo.y -= 8; lienzo.texto(bloque.texto, 14, true); lienzo.y -= 2; }
      else if (bloque.tipo === "subtitulo") { lienzo.y -= 4; lienzo.texto(bloque.texto, 11, true); }
      else if (bloque.tipo === "parrafo") lienzo.parrafo(bloque.texto, 10, false);
      else if (bloque.tipo === "nota") lienzo.parrafo(bloque.texto, 9, false, 0, 0.45);
      else if (bloque.tipo === "lista") {
        for (const item of bloque.items) lienzo.parrafo("- " + item, 10, false, 12);
      } else if (bloque.tipo === "tabla") {
        lienzo.tabla(bloque.encabezados, bloque.filas, bloque.anchos ||
          bloque.encabezados.map(() => 1));
      } else if (bloque.tipo === "foto") {
        const nombre = idPorFoto.get(bloque.foto);
        if (nombre) {
          lienzo.imagen(nombre, bloque.foto.ancho, bloque.foto.alto, bloque.anchoMax || 320);
          if (bloque.pie) lienzo.parrafo(bloque.pie, 9, false, 0, 0.45);
        }
      } else if (bloque.tipo === "separador") lienzo.linea();
    }
  }

  return { generar: generar, _renglones: renglones, _aLatin1: aLatin1, _anchoDe: anchoDe };
})();
