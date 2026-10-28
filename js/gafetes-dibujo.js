/* Ajedrez Integral — cómo se dibuja un gafete (gafetes.html).
 *
 * UNA sola función arma cada cara del gafete, y la usan las dos cosas que lo
 * muestran: la vista previa de la pantalla y el PDF para imprenta. Así lo que
 * se aprueba mirando es lo mismo que se imprime, por construcción.
 *
 * Cada cara sale en dos capas, que es el formato que pidió la imprenta (ver
 * «Creación de gafetes» en docs/decisiones/paneles.md):
 *
 *   - el FONDO: todo lo que no es letra (colores, logos, bandera, ilustración,
 *     QR, la tabla del horario sin sus textos). En el PDF va como UNA imagen a
 *     450 dpi por página, sin máscaras ni grupos: lo que Illustrator abre
 *     limpio. Su `clave` dice de qué depende; dos gafetes con la misma clave
 *     comparten la imagen, y un PDF de 500 gafetes lleva pocas.
 *   - los TEXTOS: cada letra pasada a su contorno (opentype.js), en milímetros.
 *     En el PDF van como trazos vectoriales: ninguna fuente, nada que
 *     reemplazar en otra computadora, nítido a cualquier tamaño.
 *
 * Todo se mide en milímetros sobre un gafete de 10 × 14 cm; otro tamaño
 * estira las posiciones y escala los tamaños por el lado más chico.
 *
 * Las plantillas de texto: «{Columna}» se reemplaza por lo que dice esa
 * columna en la fila; «{A|B}» toma la primera que no esté vacía. Si un dato
 * falta, la línea entera no sale (así «FIDE ID: {FIDE}» no queda colgando sin
 * número).
 */
(function () {
  "use strict";

  const PT = 25.4 / 72;              // un punto tipográfico, en milímetros
  const BASE_W = 100, BASE_H = 140;  // el diseño se pensó en 10 × 14 cm
  const NEGRO_TEXTO = "#1b2a4a";

  /* ===================== Plantillas y datos ===================== */

  const plano = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

  // Las columnas que nombra una plantilla: «{FIDE ID}» → ["FIDE ID"].
  function columnasDe(plantilla) {
    const salida = [];
    String(plantilla || "").replace(/\{([^{}]+)\}/g, (_, dentro) => {
      dentro.split("|").forEach((c) => { if (c.trim() && c.trim() !== "n") salida.push(c.trim()); });
      return "";
    });
    return salida;
  }

  function valor(fila, columna) {
    if (!fila) return "";
    const buscada = plano(columna);
    for (const k of Object.keys(fila)) if (plano(k) === buscada) return String(fila[k] == null ? "" : fila[k]).trim();
    return "";
  }

  // null si algún dato de la plantilla falta (la línea no sale).
  function llenar(plantilla, fila, extra) {
    let falta = false;
    const t = String(plantilla || "").replace(/\{([^{}]+)\}/g, (_, dentro) => {
      if (extra && dentro.trim() in extra) return extra[dentro.trim()];
      for (const c of dentro.split("|")) {
        const v = valor(fila, c.trim());
        if (v) return v;
      }
      falta = true;
      return "";
    });
    return falta ? null : t.replace(/\s+/g, " ").trim();
  }

  // «VIQUEZ MIRANDA» → «Viquez Miranda»; lo que ya viene con minúsculas, tal cual.
  const MENORES = new Set(["de", "del", "la", "las", "los", "y", "da", "do", "dos", "van", "von"]);
  function nombrePropio(t) {
    if (!t || t !== t.toUpperCase()) return t;
    return t.toLowerCase().split(/(\s+|-)/).map((p, i) =>
      (i > 0 && MENORES.has(p)) ? p : p.charAt(0).toUpperCase() + p.slice(1)).join("");
  }

  const marcado = (v) => { const p = plano(v); return !!p && !["no", "0", "false", "falso", "-", "n"].includes(p); };

  /* Los datos de cada gafete, en el orden del Excel. El número de {n} se
     cuenta aparte por cada código: «{Fed} {n}» da CRC 01, CRC 02… y TTO 01. */
  function gafetes(diseno, filas) {
    const cuenta = new Map();
    return filas.map((fila) => {
      const d = diseno;
      const prop = (t) => (t != null && d.nombre.propio ? nombrePropio(t) : t);
      let codigo = null;
      const sin = d.codigo.sinCodigoSi && marcado(valor(fila, d.codigo.sinCodigoSi));
      if (d.codigo.plantilla && !sin) {
        const grupo = llenar(d.codigo.plantilla, fila, { n: "" });
        if (grupo != null) {
          const usa = /\{n\}/.test(d.codigo.plantilla);
          const n = usa ? (cuenta.get(grupo) || 0) + 1 : 0;
          if (usa) cuenta.set(grupo, n);
          codigo = llenar(d.codigo.plantilla, fila, { n: String(n).padStart(2, "0") });
        }
      }
      const pais = d.bandera.plantilla ? llenar(d.bandera.plantilla, fila) : null;
      const franja = llenar(d.franja.plantilla, fila);
      const vertical = llenar(d.dorso.vertical, fila);
      const claveColor = d.colores.columna ? plano(valor(fila, d.colores.columna)) : "";
      return {
        fila,
        nombre: [prop(llenar(d.nombre.linea1, fila)), prop(llenar(d.nombre.linea2, fila))].filter((x) => x),
        detalles: d.detalles.map((p) => (p ? llenar(p, fila) : null)).filter((x) => x),
        pais,
        iso: pais && window.GafetesBanderas ? window.GafetesBanderas.iso(pais) : null,
        franja: franja ? franja.toUpperCase() : "",
        vertical: (vertical || franja || "").toUpperCase(),
        codigo: codigo ? codigo.toUpperCase() : null,
        claveColor,
        color: colorDe(d, claveColor),
        iconos: d.iconos.map((ic) => !!(ic.columna && marcado(valor(fila, ic.columna)))),
      };
    });
  }

  function colorDe(diseno, claveColor) {
    const c = diseno.colores.valores[claveColor];
    return (c && /^#[0-9a-f]{6}$/i.test(c)) ? c : diseno.colores.omision;
  }

  /* ===================== Color y contraste (WCAG) ===================== */

  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  function luminancia(hex) {
    const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contraste(a, b) {
    const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  }
  // El tono de las filas pares de la tabla: el color del rol, casi blanco.
  function aclarar(hex, cuanto) {
    return "#" + rgb(hex).map((c) => Math.round((c + (1 - c) * cuanto) * 255).toString(16).padStart(2, "0")).join("");
  }

  /* ===================== Las letras, en curvas ===================== */

  // Una línea de texto como contornos: comandos en mm, con el origen en el
  // principio de la línea base. `espaciado` es en «em» (0.3 = 30 % de la letra).
  function contornos(fuente, texto, tamPt, espaciado) {
    const tam = tamPt * PT;
    const escala = tam / fuente.unitsPerEm;
    const glifos = fuente.stringToGlyphs(texto);
    const comandos = [];
    const faltan = [];
    let x = 0;
    glifos.forEach((g, i) => {
      if (g.index === 0 && texto[i] && texto[i].trim()) faltan.push(texto[i]);
      for (const c of g.getPath(x, 0, tam).commands) comandos.push(c);
      x += g.advanceWidth * escala;
      if (i < glifos.length - 1) {
        x += fuente.getKerningValue(g, glifos[i + 1]) * escala;
        x += (espaciado || 0) * tam;
      }
    });
    return { comandos, ancho: x, faltan };
  }

  function anchoDe(fuente, texto, tamPt, espaciado) {
    return contornos(fuente, texto, tamPt, espaciado).ancho;
  }

  const altoMayus = (fuente) => {
    const os2 = fuente.tables.os2;
    return (os2 && os2.sCapHeight ? os2.sCapHeight : fuente.unitsPerEm * 0.7) / fuente.unitsPerEm;
  };

  // Mueve (y gira, si `vertical`) los comandos a su lugar en la página.
  function colocar(comandos, x, y, vertical) {
    const p = vertical ? (u, v) => [x + v, y - u] : (u, v) => [x + u, y + v];
    return comandos.map((c) => {
      const o = { type: c.type };
      if (c.x != null) [o.x, o.y] = p(c.x, c.y);
      if (c.x1 != null) [o.x1, o.y1] = p(c.x1, c.y1);
      if (c.x2 != null) [o.x2, o.y2] = p(c.x2, c.y2);
      return o;
    });
  }

  /* ===================== Las medidas de cada cosa ===================== */

  function medidas(diseno) {
    const W = diseno.tamano.ancho, H = diseno.tamano.alto;
    const sx = W / BASE_W, sy = H / BASE_H, s = Math.min(sx, sy);
    // Una caja pensada en 10 × 14, llevada al tamaño elegido.
    const caja = (x, y, w, h) => ({ x: x * sx, y: y * sy, w: w * sx, h: h * sy });
    return {
      W, H, s, sx, sy,
      logoIzq: caja(5, 4, 30, 15), logoDer: caja(65, 4, 30, 15),
      titulo: { y: 27.5 * sy, paso: 4.4 * sy, tam: 9.2 * s },
      nombre: { y1: 54 * sy, y2: 63 * sy, solo: 58.5 * sy, tam: 21 * s, max: 90 * sx },
      detalles: { x: 6 * sx, y: 73.5 * sy, paso: 5.2 * sy, tam: 10 * s, max: 46 * sx },
      bandera: caja(6, 88, 16, 12), paisTexto: { x: 25 * sx, y: 96.3 * sy, tam: 10 * s },
      ilustracion: caja(48, 64, 52, 52),
      franja: caja(0, 115.5, 100, 14),
      icono: { lado: 10 * s, margen: 3 * sx },
      dorsoLogoIzq: caja(4, 3, 22, 10), dorsoLogoDer: caja(74, 3, 22, 10),
      vertical: caja(3, 16, 16, 106),
      tabla: caja(22, 16, 48, 104),
      patrocinador: caja(72, 48, 24, 22),
      qr: caja(71, 102, 25, 25),
      cinta: caja(0, 129.5, 100, 10.5),
      codigo: { x: 5 * sx, y: 137.2 * sy, tam: 15 * s },
    };
  }

  /* ===================== Imágenes ===================== */

  // Cabe entera en la caja; `alinear` es "izq", "der" o "centro"; abajo si `abajo`.
  function contener(ctx, img, c, alinear, abajo) {
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) return;
    const k = Math.min(c.w / w0, c.h / h0), w = w0 * k, h = h0 * k;
    const x = alinear === "izq" ? c.x : alinear === "der" ? c.x + c.w - w : c.x + (c.w - w) / 2;
    const y = abajo ? c.y + c.h - h : c.y + (c.h - h) / 2;
    ctx.drawImage(img, x, y, w, h);
  }
  // Cubre la página entera, recortando lo que sobre.
  function cubrir(ctx, img, W, H) {
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) return;
    const k = Math.max(W / w0, H / h0), w = w0 * k, h = h0 * k;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  }

  function rectRedondo(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  /* ===================== El código QR ===================== */

  // La matriz del QR (qrcode-generator, js/vendor/qrcode.js), con la mayor
  // corrección de errores: el centro lleva un logo encima.
  function matrizQr(url) {
    const q = window.qrcode(0, "H");
    q.addData(url, "Byte");
    q.make();
    const n = q.getModuleCount();
    const m = [];
    for (let r = 0; r < n; r++) { m.push([]); for (let c = 0; c < n; c++) m[r].push(q.isDark(r, c)); }
    return m;
  }

  /* Módulos redondeados y unidos, marco negro de esquinas redondas, y en el
     centro una placa negra con la marca en blanco (si hay marca). */
  function pintarQr(ctx, matriz, c, marca) {
    const n = matriz.length;
    const grosor = c.w * 0.04;
    ctx.fillStyle = "#000";
    rectRedondo(ctx, c.x, c.y, c.w, c.h, c.w * 0.1); ctx.fill();
    ctx.fillStyle = "#fff";
    rectRedondo(ctx, c.x + grosor, c.y + grosor, c.w - 2 * grosor, c.h - 2 * grosor, c.w * 0.07); ctx.fill();
    const m = (c.w - 2 * grosor) / (n + 4);           // dos módulos de margen por lado
    const x0 = c.x + grosor + 2 * m, y0 = c.y + grosor + 2 * m;
    const finder = (r, k) => (r < 7 && k < 7) || (r < 7 && k >= n - 7) || (r >= n - 7 && k < 7);
    // La placa del centro tapa unos módulos: la corrección H aguanta hasta el 30 %.
    const placa = marca ? Math.round(n * 0.26) | 1 : 0;
    const p0 = Math.floor((n - placa) / 2);
    const tapado = (r, k) => placa && r >= p0 - 1 && r < p0 + placa + 1 && k >= p0 - 1 && k < p0 + placa + 1;
    ctx.fillStyle = "#000";
    for (let r = 0; r < n; r++) {
      for (let k = 0; k < n; k++) {
        if (!matriz[r][k] || finder(r, k) || tapado(r, k)) continue;
        const x = x0 + k * m, y = y0 + r * m;
        ctx.beginPath(); ctx.arc(x + m / 2, y + m / 2, m / 2, 0, 2 * Math.PI); ctx.fill();
        if (k + 1 < n && matriz[r][k + 1] && !finder(r, k + 1) && !tapado(r, k + 1)) ctx.fillRect(x + m / 2, y, m, m);
        if (r + 1 < n && matriz[r + 1][k] && !finder(r + 1, k) && !tapado(r + 1, k)) ctx.fillRect(x, y + m / 2, m, m);
      }
    }
    for (const [r, k] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      const x = x0 + k * m, y = y0 + r * m;
      ctx.fillStyle = "#000"; rectRedondo(ctx, x, y, 7 * m, 7 * m, 2 * m); ctx.fill();
      ctx.fillStyle = "#fff"; rectRedondo(ctx, x + m, y + m, 5 * m, 5 * m, 1.4 * m); ctx.fill();
      ctx.fillStyle = "#000"; rectRedondo(ctx, x + 2 * m, y + 2 * m, 3 * m, 3 * m, m); ctx.fill();
    }
    if (marca) {
      const lado = placa * m, x = x0 + p0 * m, y = y0 + p0 * m;
      ctx.fillStyle = "#000"; rectRedondo(ctx, x, y, lado, lado, lado * 0.2); ctx.fill();
      contener(ctx, marca, { x: x + lado * 0.12, y: y + lado * 0.12, w: lado * 0.76, h: lado * 0.76 }, "centro");
    }
  }

  /* ===================== Recursos: fuentes e imágenes ===================== */

  const FUENTES_DEL_SITIO = {
    "league-spartan": "fonts/gafetes/league-spartan-700.ttf",
    quicksand: "fonts/gafetes/quicksand-700.ttf",
  };

  const deBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;

  async function cargarImagen(src) {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    await img.decode();
    return img;
  }

  // Un SVG sin ancho ni alto no tiene tamaño propio y el canvas lo pinta mal:
  // se le ponen los de su viewBox.
  function svgConTamano(texto) {
    if (/<svg[^>]*\swidth=/.test(texto)) return texto;
    const vb = (texto.match(/viewBox="[\d.\s-]+?\s+[\d.\s-]+?\s+([\d.]+)\s+([\d.]+)"/) || []);
    return vb[1] ? texto.replace("<svg", `<svg width="${vb[1]}" height="${vb[2]}"`) : texto;
  }

  // La marca de Ajedrez Integral sin su nombre (el caballo y el tablero), en blanco.
  async function marcaBlanca() {
    const img = await cargarImagen("img/marca-agua-ajedrez-integral.png");
    const alto = Math.round(img.naturalHeight * 466 / 564);
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = alto;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = "source-in";
    x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  const ICONOS = {
    telefono: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256"><g fill="none" stroke="#111" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><rect x="21" y="7" width="22" height="50" rx="5"/><path d="M28.5 13h7"/><path d="M13 24c-3.5 5-3.5 11 0 16M51 24c3.5 5 3.5 11 0 16M6.5 19c-6 9-6 17 0 26M57.5 19c6 9 6 17 0 26"/></g><circle cx="32" cy="50.5" r="2.4" fill="#111"/></svg>',
    camara: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256"><g fill="none" stroke="#111" stroke-width="4" stroke-linejoin="round"><path d="M7 23a5 5 0 0 1 5-5h8.5l4.5-6.5h14l4.5 6.5H52a5 5 0 0 1 5 5v25a5 5 0 0 1-5 5H12a5 5 0 0 1-5-5z"/><circle cx="32" cy="35" r="10.5"/></g><circle cx="49.5" cy="26" r="2.6" fill="#111"/></svg>',
  };
  const svgComoDato = (svg) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

  /* Todo lo que el diseño necesita, cargado una vez: las dos fuentes, las
     imágenes subidas, los íconos, la matriz del QR y la marca. Las banderas
     se cargan a medida que aparecen (`bandera(iso)`). */
  async function preparar(diseno) {
    if (!window.opentype) throw new Error("No cargó la librería de las letras (opentype.js).");
    const fuente = async (cual) => {
      const f = diseno.fuentes[cual];
      const buf = f.datos ? deBase64(f.datos)
        : await (await fetch(FUENTES_DEL_SITIO[f.id] || FUENTES_DEL_SITIO.quicksand)).arrayBuffer();
      return window.opentype.parse(buf);
    };
    const imagenes = {};
    for (const [id, im] of Object.entries(diseno.imagenes || {})) {
      if (im && im.datos) {
        try { imagenes[id] = await cargarImagen(im.datos); } catch (e) { /* una imagen dañada no frena el resto */ }
      }
    }
    const iconos = [];
    for (const ic of diseno.iconos) {
      const propia = ic.imagen && imagenes[ic.imagen];
      iconos.push(propia || await cargarImagen(svgComoDato(ICONOS[ic.dibujo] || ICONOS.telefono)));
    }
    const banderas = new Map();
    return {
      titulo: await fuente("titulo"),
      texto: await fuente("texto"),
      imagenes,
      iconos,
      qr: diseno.dorso.qr ? matrizQr(diseno.dorso.qr) : null,
      marca: diseno.dorso.qr && diseno.dorso.qrMarca ? await marcaBlanca() : null,
      async bandera(iso) {
        if (!iso) return null;
        if (!banderas.has(iso)) {
          banderas.set(iso, (async () => {
            try {
              const r = await fetch(window.GafetesBanderas.ruta(iso));
              if (!r.ok) return null;
              return await cargarImagen(svgComoDato(svgConTamano(await r.text())));
            } catch (e) { return null; }
          })());
        }
        return banderas.get(iso);
      },
    };
  }

  /* ===================== Una cara del gafete ===================== */

  /* → { clave, fondo(ctx), textos: [{ comandos, color }], avisos: [] }
     `fondo` pinta en un contexto que ya mide en milímetros. Antes de llamarla
     hay que haber esperado `recursos.bandera(gafete.iso)`. */
  async function cara(diseno, recursos, g, lado) {
    const M = medidas(diseno);
    const img = recursos.imagenes;
    const textos = [];
    const avisos = [];
    const color = g.color;

    // Escribe una línea; si no cabe en `max`, la achica (y avisa si queda muy chica).
    function escribir(fuente, texto, tamPt, opc) {
      if (!texto) return;
      const o = opc || {};
      let tam = tamPt, esp = o.espaciado || 0;
      let ancho = anchoDe(fuente, texto, tam, esp);
      if (o.max && ancho > o.max && esp) { esp = Math.max(0.04, esp * o.max / ancho); ancho = anchoDe(fuente, texto, tam, esp); }
      if (o.max && ancho > o.max) { tam = tam * o.max / ancho; }
      if (o.max && tam < tamPt * 0.55) avisos.push(`«${texto}» no cabe bien: queda en letra muy chica.`);
      const r = contornos(fuente, texto, tam, esp);
      if (r.faltan.length) avisos.push(`La fuente no tiene ${[...new Set(r.faltan)].map((c) => "«" + c + "»").join(", ")}: no sale en «${texto}».`);
      // Vertical: se lee de abajo hacia arriba, centrado en `y`.
      if (o.vertical) textos.push({ comandos: colocar(r.comandos, o.x, o.y + r.ancho / 2, true), color: o.color });
      else textos.push({ comandos: colocar(r.comandos, o.alinear === "centro" ? o.x - r.ancho / 2 : o.x, o.y, false), color: o.color });
      return { tam, ancho: r.ancho };
    }

    const iconos = g.iconos.map((si, i) => (si ? recursos.iconos[i] : null)).filter(Boolean);
    const bandera = lado === "frente" ? await recursos.bandera(g.iso) : null;
    const clave = JSON.stringify([lado, color, lado === "frente" ? [g.iso && bandera ? g.iso : null, g.iconos] : null]);

    if (lado === "frente") {
      const fondo = (ctx) => {
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, M.W, M.H);
        if (img.fondoFrente) cubrir(ctx, img.fondoFrente, M.W, M.H);
        if (img.logoIzq) contener(ctx, img.logoIzq, M.logoIzq, "izq");
        if (img.logoDer) contener(ctx, img.logoDer, M.logoDer, "der");
        if (img.ilustracion) contener(ctx, img.ilustracion, M.ilustracion, "der", true);
        if (bandera) {
          const b = M.bandera;
          ctx.save(); rectRedondo(ctx, b.x, b.y, b.w, b.h, 0.8 * M.s); ctx.clip();
          ctx.drawImage(bandera, b.x, b.y, b.w, b.h); ctx.restore();
          ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 0.2 * M.s;
          rectRedondo(ctx, b.x, b.y, b.w, b.h, 0.8 * M.s); ctx.stroke();
        }
        const f = M.franja;
        ctx.fillStyle = color; ctx.fillRect(f.x, f.y, f.w, f.h);
        const lado2 = M.icono.lado, yI = f.y + (f.h - lado2) / 2;
        const ponerIcono = (im, x) => {
          ctx.fillStyle = "#fff"; rectRedondo(ctx, x, yI, lado2, lado2, lado2 * 0.25); ctx.fill();
          ctx.strokeStyle = color; ctx.lineWidth = 0.45 * M.s;
          rectRedondo(ctx, x + 0.9 * M.s, yI + 0.9 * M.s, lado2 - 1.8 * M.s, lado2 - 1.8 * M.s, lado2 * 0.2); ctx.stroke();
          contener(ctx, im, { x: x + 2 * M.s, y: yI + 2 * M.s, w: lado2 - 4 * M.s, h: lado2 - 4 * M.s }, "centro");
        };
        // Uno solo va a la derecha; dos, uno en cada esquina.
        if (iconos.length === 1) ponerIcono(iconos[0], M.W - M.icono.margen - lado2);
        if (iconos.length >= 2) { ponerIcono(iconos[0], M.icono.margen); ponerIcono(iconos[1], M.W - M.icono.margen - lado2); }
      };

      const lineas = String(diseno.titulo.texto || "").split(/\n/).map((l) => l.trim()).filter(Boolean).slice(0, 4);
      lineas.forEach((l, i) => escribir(recursos.texto, l, M.titulo.tam, { x: M.W / 2, y: M.titulo.y + i * M.titulo.paso, alinear: "centro", color: diseno.titulo.color, max: M.W - 8 * M.sx }));

      const nombre = g.nombre;
      if (nombre.length) {
        // Las dos líneas del nombre van del mismo tamaño: el de la que menos cabe.
        let tam = M.nombre.tam;
        for (const l of nombre) { const a = anchoDe(recursos.titulo, l, tam, 0); if (a > M.nombre.max) tam = tam * M.nombre.max / a; }
        if (nombre.length === 1) escribir(recursos.titulo, nombre[0], tam, { x: M.W / 2, y: M.nombre.solo, alinear: "centro", color, max: M.nombre.max });
        else nombre.slice(0, 2).forEach((l, i) => escribir(recursos.titulo, l, tam, { x: M.W / 2, y: i ? M.nombre.y2 : M.nombre.y1, alinear: "centro", color, max: M.nombre.max }));
      }
      g.detalles.slice(0, 3).forEach((d, i) => escribir(recursos.texto, d, M.detalles.tam, {
        x: M.detalles.x, y: M.detalles.y + i * M.detalles.paso, color: i === 0 ? color : NEGRO_TEXTO, max: M.detalles.max,
      }));
      if (g.pais && diseno.bandera.texto) {
        escribir(recursos.texto, g.pais.toUpperCase(), M.paisTexto.tam, { x: bandera ? M.paisTexto.x : M.bandera.x, y: M.paisTexto.y, color: NEGRO_TEXTO, max: 22 * M.sx });
      }
      if (g.pais && !bandera) avisos.push(`No hay bandera para «${g.pais}»: sale solo el texto.`);
      if (g.franja) {
        // Con íconos, el texto se queda centrado y lejos de las dos esquinas.
        const libre = iconos.length ? M.W - 2 * (M.icono.margen + M.icono.lado + 4 * M.sx) : M.W - 8 * M.sx;
        const altoLetra = 20 * M.s;
        const y = M.franja.y + M.franja.h / 2 + altoMayus(recursos.titulo) * altoLetra * PT / 2;
        escribir(recursos.titulo, g.franja, altoLetra, { x: M.W / 2, y, alinear: "centro", color: "#ffffff", max: libre, espaciado: 0.3 });
      }
      return { clave, fondo, textos, avisos };
    }

    /* ---------- el dorso ---------- */
    const filas = (diseno.dorso.horario || []).filter((r) => r.some((c) => String(c || "").trim()));
    const T = M.tabla;
    const enc = diseno.dorso.encabezados;
    const altoEnc = 6 * M.sy;
    const altoFila = filas.length ? Math.min(5.6 * M.sy, (T.h - altoEnc) / filas.length) : 0;
    const altoTabla = filas.length ? altoEnc + altoFila * filas.length : 0;
    const columnas = [0.44, 0.31, 0.25].map((p) => p * T.w);

    const fondo = (ctx) => {
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, M.W, M.H);
      if (img.fondoDorso) cubrir(ctx, img.fondoDorso, M.W, M.H);
      if (diseno.dorso.repetirLogos) {
        if (img.logoIzq) contener(ctx, img.logoIzq, M.dorsoLogoIzq, "izq");
        if (img.logoDer) contener(ctx, img.logoDer, M.dorsoLogoDer, "der");
      }
      if (filas.length) {
        ctx.save();
        rectRedondo(ctx, T.x, T.y, T.w, altoTabla, 2 * M.s); ctx.clip();
        ctx.fillStyle = "#fff"; ctx.fillRect(T.x, T.y, T.w, altoTabla);
        ctx.fillStyle = color; ctx.fillRect(T.x, T.y, T.w, altoEnc);
        ctx.fillStyle = aclarar(color, 0.88);
        filas.forEach((_, k) => { if (k % 2 === 0) ctx.fillRect(T.x, T.y + altoEnc + k * altoFila, T.w, altoFila); });
        ctx.restore();
        ctx.strokeStyle = color; ctx.lineWidth = 0.3 * M.s;
        rectRedondo(ctx, T.x, T.y, T.w, altoTabla, 2 * M.s); ctx.stroke();
      }
      if (img.patrocinador) contener(ctx, img.patrocinador, M.patrocinador, "centro");
      const c = M.cinta;
      ctx.fillStyle = color; ctx.fillRect(c.x, c.y, c.w, c.h);
      if (recursos.qr) {     // el QR se apoya sobre la cinta con un borde blanco
        ctx.fillStyle = "#fff";
        rectRedondo(ctx, M.qr.x - 0.8 * M.s, M.qr.y - 0.8 * M.s, M.qr.w + 1.6 * M.s, M.qr.h + 1.6 * M.s, M.qr.w * 0.12); ctx.fill();
        pintarQr(ctx, recursos.qr, M.qr, recursos.marca);
      }
    };

    if (g.vertical) {
      const V = M.vertical;
      const k = altoMayus(recursos.titulo);
      let tam = (V.w / k) / PT;                       // que la mayúscula llene el ancho
      const ancho = anchoDe(recursos.titulo, g.vertical, tam, 0.02);
      if (ancho > V.h) tam *= V.h / ancho;
      escribir(recursos.titulo, g.vertical, tam, { x: V.x + k * tam * PT, y: V.y + V.h / 2, vertical: true, color, espaciado: 0.02 });
    }
    if (filas.length) {
      const tamEnc = Math.min(8.5 * M.s, altoEnc / PT * 0.62), tamFila = Math.min(7.6 * M.s, altoFila / PT * 0.62);
      const kT = altoMayus(recursos.texto);
      let x = T.x;
      enc.forEach((e, i) => {
        escribir(recursos.texto, e, tamEnc, { x: x + columnas[i] / 2, y: T.y + altoEnc / 2 + kT * tamEnc * PT / 2, alinear: "centro", color: "#ffffff", max: columnas[i] - 1.5 * M.s });
        x += columnas[i];
      });
      filas.forEach((f, k) => {
        let xc = T.x;
        const y = T.y + altoEnc + k * altoFila + altoFila / 2 + kT * tamFila * PT / 2;
        f.slice(0, 3).forEach((celda, i) => {
          const t = String(celda || "").trim();
          if (t) escribir(recursos.texto, t, tamFila, i === 0
            ? { x: xc + 1.5 * M.s, y, color, max: columnas[i] - 2.5 * M.s }
            : { x: xc + columnas[i] / 2, y, alinear: "centro", color: NEGRO_TEXTO, max: columnas[i] - 1.5 * M.s });
          xc += columnas[i];
        });
      });
    }
    if (g.codigo) {
      const c = M.cinta;
      const y = c.y + c.h / 2 + altoMayus(recursos.titulo) * M.codigo.tam * PT / 2;
      escribir(recursos.titulo, g.codigo, M.codigo.tam, { x: M.codigo.x, y, color: "#ffffff", espaciado: 0.28, max: (recursos.qr ? M.qr.x - 2 * M.sx : M.W - 2 * M.sx) - M.codigo.x });
    }
    return { clave, fondo, textos, avisos };
  }

  /* Pinta una cara entera (fondo y letras) en un canvas: la vista previa. */
  function pintar(canvas, diseno, c, pxPorMm) {
    const M = medidas(diseno);
    canvas.width = Math.round(M.W * pxPorMm);
    canvas.height = Math.round(M.H * pxPorMm);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(pxPorMm, 0, 0, pxPorMm, 0, 0);
    c.fondo(ctx);
    for (const t of c.textos) {
      ctx.fillStyle = t.color;
      ctx.fill(trazo(t.comandos));
    }
  }

  function trazo(comandos) {
    const p = new Path2D();
    for (const c of comandos) {
      if (c.type === "M") p.moveTo(c.x, c.y);
      else if (c.type === "L") p.lineTo(c.x, c.y);
      else if (c.type === "Q") p.quadraticCurveTo(c.x1, c.y1, c.x, c.y);
      else if (c.type === "C") p.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
      else if (c.type === "Z") p.closePath();
    }
    return p;
  }

  window.GafetesDibujo = {
    PT, columnasDe, valor, llenar, nombrePropio, gafetes, colorDe, contraste, medidas, preparar, cara, pintar,
    svgConTamano, cargarImagen,
  };
})();
