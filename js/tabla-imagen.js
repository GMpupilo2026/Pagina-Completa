/**
 * Ajedrez Integral — una tabla como imagen PNG, para compartir: horizontal
 * (como se ve en la computadora) o vertical para el celular, donde cada fila
 * es una tarjeta con «Encabezado: valor» y no hay que hacer zoom.
 *
 * Se dibuja en un <canvas> con la letra de la página, sin librería. Los
 * colores están medidos (WCAG AA sobre su fondo real, todos por encima de 7:1):
 *   título #102a43 y texto #1f2937 sobre blanco (14,6), secundario #4b5563
 *   sobre blanco (7,6) y sobre la fila par #f6f8fb (7,1), encabezado #334155
 *   sobre #e8eef6 (8,9), y la banda de arriba, blanco sobre #1c3870 (11,4).
 * El color nunca dice nada solo: el dato va escrito.
 *
 *   TablaImagen.armar({ titulo, subtitulo, pie, encabezados, derecha, filas, celular })
 *       → Promise<Blob> (image/png). `derecha` dice qué columnas van alineadas
 *       a la derecha (las de números). Las filas de más se cortan y se avisa.
 *   TablaImagen.bajar(datos, nombreArchivo) → la arma y la baja.
 */
(function (raiz) {
  "use strict";

  const COLOR = { fondo: "#ffffff", banda: "#1c3870", sobreBanda: "#ffffff", titulo: "#102a43", texto: "#1f2937",
    secundario: "#4b5563", cabeza: "#e8eef6", sobreCabeza: "#334155", par: "#f6f8fb", linea: "#d9e2ec" };
  const MAX_FILAS = { horizontal: 200, celular: 60 };

  function letra() {
    try { return getComputedStyle(document.body).fontFamily || "system-ui, sans-serif"; } catch (e) { return "system-ui, sans-serif"; }
  }

  /* Corta un texto con «…» para que quepa en el ancho. */
  function cortar(ctx, texto, ancho) {
    let t = String(texto);
    if (ctx.measureText(t).width <= ancho) return t;
    while (t.length > 1 && ctx.measureText(t + "…").width > ancho) t = t.slice(0, -1);
    return t + "…";
  }
  /* Parte un texto en renglones que quepan. */
  function renglones(ctx, texto, ancho) {
    const salida = [];
    let linea = "";
    for (const p of String(texto).split(/\s+/).filter(Boolean)) {
      const prueba = linea ? linea + " " + p : p;
      if (ctx.measureText(prueba).width <= ancho || !linea) linea = prueba;
      else { salida.push(linea); linea = p; }
    }
    if (linea) salida.push(linea);
    return salida.length ? salida : [""];
  }

  function lienzo(ancho, alto) {
    // A dos por uno si cabe: la imagen se ve nítida en una pantalla buena.
    const escala = alto * 2 <= 16000 && ancho * 2 <= 8000 ? 2 : 1;
    const c = document.createElement("canvas");
    c.width = Math.ceil(ancho * escala); c.height = Math.ceil(alto * escala);
    const ctx = c.getContext("2d");
    ctx.scale(escala, escala);
    ctx.textBaseline = "middle";
    return { c, ctx };
  }

  function cabecera(ctx, d, ancho, fuente, tam) {
    let y = 0;
    ctx.fillStyle = COLOR.banda; ctx.fillRect(0, 0, ancho, 10);
    y = 10 + tam.margen;
    ctx.fillStyle = COLOR.titulo; ctx.font = "700 " + tam.titulo + "px " + fuente;
    for (const r of renglones(ctx, d.titulo || "", ancho - 2 * tam.margen)) { ctx.fillText(r, tam.margen, y + tam.titulo / 2); y += tam.titulo * 1.3; }
    if (d.subtitulo) {
      ctx.fillStyle = COLOR.secundario; ctx.font = tam.sub + "px " + fuente;
      for (const r of renglones(ctx, d.subtitulo, ancho - 2 * tam.margen)) { ctx.fillText(r, tam.margen, y + tam.sub / 2); y += tam.sub * 1.4; }
    }
    return y + tam.margen / 2;
  }
  function altoCabecera(ctx, d, ancho, fuente, tam) {
    ctx.font = "700 " + tam.titulo + "px " + fuente;
    let y = 10 + tam.margen + renglones(ctx, d.titulo || "", ancho - 2 * tam.margen).length * tam.titulo * 1.3;
    if (d.subtitulo) { ctx.font = tam.sub + "px " + fuente; y += renglones(ctx, d.subtitulo, ancho - 2 * tam.margen).length * tam.sub * 1.4; }
    return y + tam.margen / 2;
  }
  function pie(ctx, texto, y, ancho, fuente, tam) {
    ctx.fillStyle = COLOR.secundario; ctx.font = tam.pie + "px " + fuente;
    for (const r of renglones(ctx, texto, ancho - 2 * tam.margen)) { ctx.fillText(r, tam.margen, y + tam.pie / 2); y += tam.pie * 1.4; }
    return y;
  }

  function horizontal(d) {
    const fuente = letra(), tam = { margen: 28, titulo: 26, sub: 15, celda: 15, pie: 13, fila: 34 };
    const filas = d.filas.slice(0, MAX_FILAS.horizontal);
    const medir = document.createElement("canvas").getContext("2d");
    const pad = 14;
    const anchos = d.encabezados.map((h, i) => {
      medir.font = "700 " + (tam.celda - 2) + "px " + fuente;
      let a = medir.measureText(String(h).toUpperCase()).width;
      medir.font = tam.celda + "px " + fuente;
      for (const f of filas) a = Math.max(a, medir.measureText(String(f[i] == null ? "" : f[i])).width);
      return Math.min(340, Math.ceil(a) + 2 * pad);
    });
    const ancho = Math.max(760, anchos.reduce((a, b) => a + b, 0) + 2 * tam.margen);
    const textoPie = (d.filas.length > filas.length ? `Se muestran ${filas.length} de ${d.filas.length} filas. ` : "") + (d.pie || "");
    medir.font = tam.pie + "px " + fuente;
    const altoPie = textoPie ? renglones(medir, textoPie, ancho - 2 * tam.margen).length * tam.pie * 1.4 + tam.margen : tam.margen;
    const arriba = altoCabecera(medir, d, ancho, fuente, tam);
    const alto = arriba + tam.fila * (filas.length + 1) + tam.margen / 2 + altoPie;
    const { c, ctx } = lienzo(ancho, alto);
    ctx.fillStyle = COLOR.fondo; ctx.fillRect(0, 0, ancho, alto);
    let y = cabecera(ctx, d, ancho, fuente, tam);
    // El encabezado.
    ctx.fillStyle = COLOR.cabeza; ctx.fillRect(tam.margen, y, ancho - 2 * tam.margen, tam.fila);
    ctx.font = "700 " + (tam.celda - 2) + "px " + fuente; ctx.fillStyle = COLOR.sobreCabeza;
    let x = tam.margen;
    d.encabezados.forEach((h, i) => {
      const t = cortar(ctx, String(h).toUpperCase(), anchos[i] - 2 * pad);
      if ((d.derecha || [])[i]) { ctx.textAlign = "right"; ctx.fillText(t, x + anchos[i] - pad, y + tam.fila / 2); ctx.textAlign = "left"; }
      else ctx.fillText(t, x + pad, y + tam.fila / 2);
      x += anchos[i];
    });
    y += tam.fila;
    // Las filas, con la par sombreada.
    ctx.font = tam.celda + "px " + fuente;
    filas.forEach((f, r) => {
      if (r % 2) { ctx.fillStyle = COLOR.par; ctx.fillRect(tam.margen, y, ancho - 2 * tam.margen, tam.fila); }
      ctx.fillStyle = COLOR.linea; ctx.fillRect(tam.margen, y + tam.fila - 1, ancho - 2 * tam.margen, 1);
      ctx.fillStyle = COLOR.texto;
      let x2 = tam.margen;
      d.encabezados.forEach((_, i) => {
        const t = cortar(ctx, String(f[i] == null ? "" : f[i]), anchos[i] - 2 * pad);
        if ((d.derecha || [])[i]) { ctx.textAlign = "right"; ctx.fillText(t, x2 + anchos[i] - pad, y + tam.fila / 2); ctx.textAlign = "left"; }
        else ctx.fillText(t, x2 + pad, y + tam.fila / 2);
        x2 += anchos[i];
      });
      y += tam.fila;
    });
    if (textoPie) pie(ctx, textoPie, y + tam.margen / 2, ancho, fuente, tam);
    return c;
  }

  /* Para el celular: 1080 de ancho y cada fila una tarjeta. */
  function celular(d) {
    const fuente = letra(), ancho = 1080, tam = { margen: 48, titulo: 46, sub: 26, celda: 30, pie: 24, fila: 44 };
    const filas = d.filas.slice(0, MAX_FILAS.celular);
    const medir = document.createElement("canvas").getContext("2d");
    const interior = ancho - 2 * tam.margen - 48;
    // Cada tarjeta: la primera celda de título y el resto «Encabezado: valor».
    const tarjetas = filas.map((f) => {
      medir.font = "700 " + (tam.celda + 4) + "px " + fuente;
      const titulo = renglones(medir, f[0] == null ? "" : f[0], interior);
      medir.font = tam.celda + "px " + fuente;
      const lineas = [];
      d.encabezados.forEach((h, i) => {
        if (!i) return;
        const v = String(f[i] == null ? "" : f[i]).trim();
        if (!v || v === "—") return;
        for (const r of renglones(medir, h + ": " + v, interior)) lineas.push(r);
      });
      return { titulo, lineas, alto: 32 + titulo.length * (tam.celda + 14) + lineas.length * tam.fila + 16 };
    });
    const textoPie = (d.filas.length > filas.length ? `Se muestran ${filas.length} de ${d.filas.length}. ` : "") + (d.pie || "");
    medir.font = tam.pie + "px " + fuente;
    const altoPie = textoPie ? renglones(medir, textoPie, ancho - 2 * tam.margen).length * tam.pie * 1.4 + tam.margen : tam.margen;
    const arriba = altoCabecera(medir, d, ancho, fuente, tam);
    const alto = arriba + tarjetas.reduce((a, t) => a + t.alto + 20, 0) + altoPie;
    const { c, ctx } = lienzo(ancho, alto);
    ctx.fillStyle = COLOR.fondo; ctx.fillRect(0, 0, ancho, alto);
    let y = cabecera(ctx, d, ancho, fuente, tam);
    for (const t of tarjetas) {
      ctx.fillStyle = COLOR.par; ctx.fillRect(tam.margen, y, ancho - 2 * tam.margen, t.alto);
      ctx.fillStyle = COLOR.banda; ctx.fillRect(tam.margen, y, 8, t.alto);
      let yy = y + 32;
      ctx.fillStyle = COLOR.titulo; ctx.font = "700 " + (tam.celda + 4) + "px " + fuente;
      for (const r of t.titulo) { ctx.fillText(r, tam.margen + 32, yy); yy += tam.celda + 14; }
      ctx.fillStyle = COLOR.texto; ctx.font = tam.celda + "px " + fuente;
      for (const r of t.lineas) { ctx.fillText(r, tam.margen + 32, yy + 4); yy += tam.fila; }
      y += t.alto + 20;
    }
    if (textoPie) pie(ctx, textoPie, y + tam.margen / 4, ancho, fuente, tam);
    return c;
  }

  function armar(d) {
    const c = d.celular ? celular(d) : horizontal(d);
    return new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo armar la imagen."))), "image/png"));
  }

  async function bajar(d, nombreArchivo) {
    const blob = await armar(d);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = /\.png$/i.test(nombreArchivo) ? nombreArchivo : nombreArchivo + ".png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return blob;
  }

  raiz.TablaImagen = { armar, bajar, COLOR };
})(typeof self !== "undefined" ? self : this);
