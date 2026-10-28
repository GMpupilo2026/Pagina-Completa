/* Ajedrez Integral — el PDF de los gafetes, escrito a mano (gafetes.html).
 *
 * Es el formato que aprobó la imprenta después de que el primero no le sirvió
 * (ver «Creación de gafetes» en docs/decisiones/paneles.md):
 *
 *   - cada página mide EXACTO lo del gafete, sin marcas de corte;
 *   - el fondo es UNA imagen JPEG a 450 dpi (DCTDecode: los bytes del JPEG
 *     tal cual), puesta con un solo `Do`, sin máscaras, sin grupos ni formas
 *     anidadas: Illustrator la abre como una imagen y nada más;
 *   - las letras van como trazos rellenos (m, l, c, h, f): ninguna fuente
 *     incrustada que la imprenta tenga que tener o que se reemplace sola.
 *
 * Las páginas con el mismo fondo apuntan a la misma imagen: un PDF de 500
 * gafetes de un mismo país y tres roles lleva unas pocas imágenes, no 1000.
 * El contenido de cada página va comprimido (FlateDecode, CompressionStream).
 */
(function () {
  "use strict";

  const MM = 72 / 25.4;   // milímetros → puntos
  const num = (v) => (Math.round(v * 100) / 100).toString();

  async function comprimir(texto) {
    const flujo = new Blob([texto]).stream().pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
  }

  /* Los trazos de una cara (milímetros, y hacia abajo) en el lenguaje del PDF
     (puntos, y hacia arriba). Las curvas cuadráticas de las letras TrueType
     pasan a cúbicas, que es la única que el PDF conoce. */
  function trazos(textos, altoPt) {
    const p = (x, y) => num(x * MM) + " " + num(altoPt - y * MM);
    const partes = [];
    let colorActual = null;
    for (const t of textos) {
      if (t.color !== colorActual) {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(t.color.slice(i, i + 2), 16) / 255);
        partes.push(`${num(r)} ${num(g)} ${num(b)} rg`);
        colorActual = t.color;
      }
      let x0 = 0, y0 = 0;
      const ops = [];
      for (const c of t.comandos) {
        if (c.type === "M") { ops.push(p(c.x, c.y) + " m"); x0 = c.x; y0 = c.y; }
        else if (c.type === "L") { ops.push(p(c.x, c.y) + " l"); x0 = c.x; y0 = c.y; }
        else if (c.type === "C") { ops.push(`${p(c.x1, c.y1)} ${p(c.x2, c.y2)} ${p(c.x, c.y)} c`); x0 = c.x; y0 = c.y; }
        else if (c.type === "Q") {
          const ax = x0 + (2 / 3) * (c.x1 - x0), ay = y0 + (2 / 3) * (c.y1 - y0);
          const bx = c.x + (2 / 3) * (c.x1 - c.x), by = c.y + (2 / 3) * (c.y1 - c.y);
          ops.push(`${p(ax, ay)} ${p(bx, by)} ${p(c.x, c.y)} c`); x0 = c.x; y0 = c.y;
        } else if (c.type === "Z") ops.push("h");
      }
      if (ops.length) partes.push(ops.join("\n") + "\nf");
    }
    return partes.join("\n");
  }

  /* Arma el PDF de a poco. `agregar` recibe una página: el JPEG de su fondo
     (con su clave, para no repetirlo), sus medidas y sus textos. */
  function nuevo(anchoMm, altoMm, titulo) {
    const W = anchoMm * MM, H = altoMm * MM;
    const objetos = [];                     // índice → Uint8Array del objeto
    const imagenes = new Map();             // clave del fondo → número de objeto
    const paginas = [];
    const enc = new TextEncoder();
    const reservar = () => { objetos.push(null); return objetos.length; };
    const poner = (n, cuerpo, flujo) => {
      const cab = enc.encode(`${n} 0 obj\n${cuerpo}\n`);
      if (!flujo) { objetos[n - 1] = concatenar([cab, enc.encode("endobj\n")]); return; }
      objetos[n - 1] = concatenar([cab, enc.encode("stream\n"), flujo, enc.encode("\nendstream\nendobj\n")]);
    };
    const catalogo = reservar(), arbol = reservar(), info = reservar();

    async function agregar(pagina) {
      let im = imagenes.get(pagina.clave);
      if (!im) {
        im = reservar();
        poner(im, `<< /Type /XObject /Subtype /Image /Width ${pagina.anchoPx} /Height ${pagina.altoPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pagina.jpeg.length} >>`, pagina.jpeg);
        imagenes.set(pagina.clave, im);
      }
      const contenido = `q ${num(W)} 0 0 ${num(H)} 0 0 cm /F Do Q\n` + trazos(pagina.textos, H);
      const flujo = await comprimir(contenido);
      const c = reservar();
      poner(c, `<< /Length ${flujo.length} /Filter /FlateDecode >>`, flujo);
      const pg = reservar();
      const caja = `[0 0 ${num(W)} ${num(H)}]`;
      poner(pg, `<< /Type /Page /Parent ${arbol} 0 R /MediaBox ${caja} /TrimBox ${caja} /Resources << /XObject << /F ${im} 0 R >> >> /Contents ${c} 0 R >>`);
      paginas.push(pg);
    }

    function cerrar() {
      poner(catalogo, `<< /Type /Catalog /Pages ${arbol} 0 R >>`);
      poner(arbol, `<< /Type /Pages /Kids [${paginas.map((p) => p + " 0 R").join(" ")}] /Count ${paginas.length} >>`);
      poner(info, `<< /Title ${cadena(titulo || "Gafetes")} /Producer (Ajedrez Integral - Creacion de gafetes) >>`);
      const partes = [enc.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
      let pos = partes[0].length;
      const desde = [];
      for (const o of objetos) { desde.push(pos); partes.push(o); pos += o.length; }
      let xref = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
      for (const d of desde) xref += String(d).padStart(10, "0") + " 00000 n \n";
      xref += `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
      partes.push(enc.encode(xref));
      return concatenar(partes);
    }

    return { agregar, cerrar, cuantasImagenes: () => imagenes.size, cuantasPaginas: () => paginas.length };
  }

  // Un texto del PDF entre paréntesis, en UTF-16 para que no se coma las tildes.
  function cadena(t) {
    let hex = "FEFF";
    for (const ch of String(t)) {
      const c = ch.codePointAt(0);
      if (c > 0xffff) continue;
      hex += c.toString(16).padStart(4, "0").toUpperCase();
    }
    return "<" + hex + ">";
  }

  function concatenar(partes) {
    const total = partes.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(total);
    let i = 0;
    for (const p of partes) { out.set(p, i); i += p.length; }
    return out;
  }

  window.GafetesPdf = { nuevo, _trazos: trazos };
})();
