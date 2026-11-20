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
  const esPlantilla = (t) => /\{[^{}]+\}/.test(String(t || ""));
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
    const poses = Array.isArray(diseno.dorso.ilustraciones) ? diseno.dorso.ilustraciones.filter(Boolean) : [];
    return filas.map((fila, n) => {
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
        // El QR de esta persona, si la dirección lleva una columna («{QR}»):
        // la Eliminatoria JDN de PZ lleva a cada jugador a su ficha en Pareo.
        // Sin el dato, ese gafete sale sin QR (nunca con el de otro).
        ...(esPlantilla(d.dorso.qr) ? { qr: llenar(d.dorso.qr, fila) || "" } : {}),
        // Con `dorso.ilustraciones` (varias imágenes del diseño), el dorso de
        // cada gafete lleva una, por turno: la profe Karina en distintas poses.
        // ...salvo que la fila traiga la suya (`dorso.poseColumna`: el personal).
        ilustracionDorso: (d.dorso.poseColumna && valor(fila, d.dorso.poseColumna)) || (poses.length ? poses[n % poses.length] : null),
        // El texto de arriba del QR, si es una plantilla, es de cada fila.
        ...(esPlantilla(d.dorso.qrTexto) ? { qrTexto: llenar(d.dorso.qrTexto, fila) || "" } : {}),
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
    // `dorso.subir`: cuánto sube (en la escala de 10 × 14) lo de abajo del
    // dorso —la franja, el QR y la ilustración— para dejar blanco abajo: al
    // imprimir por ambos lados en casa el dorso puede quedar corrido unos
    // milímetros, y al cortar se iba un pedazo de la franja.
    const sube = Number((diseno.dorso || {}).subir) || 0;
    // `franjaAbajo`: la franja del frente justo en el borde de abajo, y con
    // `fotoCentro` la foto lo más grande posible. `dorso.lineaArriba`: un
    // renglón arriba del horario del dorso (el lugar del torneo).
    const abajo = !!diseno.franjaAbajo, linea = !!(diseno.dorso && diseno.dorso.lineaArriba);
    // `dorso.grande`: el dorso aprovecha todo el espacio (lo pidió el dueño
    // con los gafetes cortados en la mano): la tabla del horario más ancha y
    // con letra más grande, el QR y la ilustración más grandes, y el texto de
    // lado de arriba abajo.
    const grande = !!(diseno.dorso && diseno.dorso.grande);
    const ladoQr = (grande ? 30 : 25) * s;
    return {
      W, H, s, sx, sy,
      logoIzq: caja(5, 4, 30, 15), logoDer: caja(65, 4, 30, 15),
      // `tituloEntreLogos`: el título en el hueco entre los dos logos.
      titulo: diseno.tituloEntreLogos ? { y: 10.8 * sy, paso: 5 * sy, tam: 8 * s, max: 52 * sx } : { y: 27.5 * sy, paso: 4.4 * sy, tam: 9.2 * s },
      nombre: { y1: 54 * sy, y2: 63 * sy, solo: 58.5 * sy, tam: 21 * s, max: 90 * sx },
      detalles: { x: 6 * sx, y: 73.5 * sy, paso: 5.2 * sy, tam: 10 * s, max: 46 * sx },
      bandera: caja(6, 88, 16, 12), paisTexto: { x: 25 * sx, y: 96.3 * sy, tam: 10 * s },
      ilustracion: caja(48, 64, 52, 52),
      foto: caja(61, 65, 33, 42.4),      // 3,3 × 4,24: la proporción del pasaporte
      // Con `fotoCentro` (la Eliminatoria JDN de PZ): la foto en el medio, el
      // nombre debajo y los detalles centrados debajo del nombre.
      // (más grande desde el 20/11: aprovecha el espacio entre el título y el nombre)
      fotoCentro: abajo ? caja(19, 22, 62, 72) : caja(30, 38, 40, 48),
      nombreCentro: abajo ? { y1: 101.5 * sy, y2: 109.5 * sy, solo: 105.5 * sy, tam: 18 * s, max: 90 * sx } : { y1: 92 * sy, y2: 100 * sy, solo: 96 * sy, tam: 18 * s, max: 90 * sx },
      detallesCentro: abajo ? { y: 115.5 * sy, paso: 4.4 * sy, tam: 8.5 * s, max: 88 * sx } : { y: 106 * sy, paso: 4.4 * sy, tam: 8.5 * s, max: 88 * sx },
      franja: abajo ? caja(0, 126, 100, 14) : caja(0, 115.5, 100, 14),
      icono: { lado: 10 * s, margen: 3 * sx },
      dorsoLogoIzq: grande ? caja(4, 4.5, 22, 9.5) : caja(4, 3, 22, 10), dorsoLogoDer: grande ? caja(74, 4.5, 22, 9.5) : caja(74, 3, 22, 10),
      vertical: grande ? caja(3, 16, 16, 108) : caja(3, 16, 16, 106),
      tablaEscala: grande ? 1.25 : 1,
      tabla: caja(22, 16, 48, 104),
      // Con `dorso.horarioCentro`: el horario centrado en lo que queda libre
      // entre el texto de lado y el borde derecho (Eliminatoria JDN de PZ).
      tablaCentro: grande ? caja(22, 20.5, 75, 107) : linea ? caja(33, 21, 48, 99) : caja(33, 16, 48, 104),
      patrocinador: caja(72, 48, 24, 22),
      // La ilustración del dorso, abajo y pegada al QR: la profe Karina lo
      // muestra con la mano (Eliminatoria JDN de PZ).
      dorsoIlustracion: grande ? caja(21, 79, 40, 47) : linea ? caja(24, 68, 40, 60 - sube) : caja(24, 64, 40, 64 - sube),   // termina antes del texto del QR y debajo del horario
      // Cuadrado siempre (con el lado chico de la escala): en un gafete que no
      // es de 10 × 14, como el de 5,5 × 8,5, salía más alto que ancho y le
      // sobraba blanco abajo. Pegado a la misma esquina de abajo a la derecha.
      qr: { x: 96 * sx - ladoQr, y: ((grande ? 124 : 127) - sube) * sy - ladoQr, w: ladoQr, h: ladoQr },
      cinta: caja(0, 129.5, 100, 10.5),
      // Con el dorso grande, su franja de abajo mide lo mismo que la del frente
      // (franjaAbajo): a contraluz coinciden, y el corte pasa igual por las dos.
      cintaDorso: grande ? caja(0, 126, 100, 14) : caja(0, 129.5 - sube, 100, 10.5),
      // `franjaArriba`: una franja delgada del color del gafete arriba, en las
      // dos caras, de guía para cortar (lo pidió el dueño).
      franjaArriba: (Number(diseno.franjaArriba) || 0) * sy,
      codigo: { x: 5 * sx, y: 137.2 * sy, tam: 15 * s },
    };
  }

  /* ===================== Imágenes ===================== */

  // Cabe entera en la caja; `alinear` es "izq", "der" o "centro"; abajo si `abajo`.
  // La imagen sin el margen claro o transparente de alrededor (un lienzo del
  // tamaño de lo dibujado). Si no encuentra nada que recortar, la deja igual.
  function sinMargen(img) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) return img;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const tinta = px[i + 3] > 20 && 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2] < 230;
      if (tinta) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1)) return img;
    const r = document.createElement("canvas");
    r.width = x1 - x0 + 1; r.height = y1 - y0 + 1;
    r.getContext("2d").drawImage(c, x0, y0, r.width, r.height, 0, 0, r.width, r.height);
    return r;
  }

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

  // Cubre la caja entera (la foto), recortando lo que sobre por los lados.
  function cubrirCaja(ctx, img, c) {
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) return;
    const k = Math.max(c.w / w0, c.h / h0), w = w0 * k, h = h0 * k;
    ctx.drawImage(img, c.x + (c.w - w) / 2, c.y + (c.h - h) / 2, w, h);
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
    // Con `logosSinMargen`, los dos logos pierden el blanco (o lo
    // transparente) que traen alrededor: así el dibujo de cada uno llena su
    // caja y salen del mismo alto aunque los archivos traigan márgenes
    // distintos (en la PZ, el de la ADAPZ ocupaba el 73 % del alto de su
    // archivo y el del CCDR el 65 %).
    if (diseno.logosSinMargen) for (const id of ["logoIzq", "logoDer"]) if (imagenes[id]) imagenes[id] = sinMargen(imagenes[id]);
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
      // Una dirección con columnas ({QR}) es de cada persona: va en `g.qr`.
      qr: diseno.dorso.qr && !esPlantilla(diseno.dorso.qr) ? matrizQr(diseno.dorso.qr) : null,
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
    // Con foto, el fondo es de esa persona: no se comparte con nadie. El dorso
    // depende de su QR (si trae uno propio, `g.qr`) y de cuántas filas tiene su
    // horario (el marco de la tabla va en el fondo).
    const filasDorso = (diseno.dorso.horario || []).filter((r) => r.some((c) => String(c || "").trim())).length;
    const clave = JSON.stringify([lado, color, lado === "frente" ? [g.iso && bandera ? g.iso : null, g.iconos, g.fotoClave || null] : [g.qr || null, filasDorso, g.ilustracionDorso || null]]);

    if (lado === "frente") {
      const centro = !!(g.foto && diseno.fotoCentro);
      const fondo = (ctx) => {
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, M.W, M.H);
        if (img.fondoFrente) cubrir(ctx, img.fondoFrente, M.W, M.H);
        if (M.franjaArriba) { ctx.fillStyle = color; ctx.fillRect(0, 0, M.W, M.franjaArriba); }
        if (img.logoIzq) contener(ctx, img.logoIzq, M.logoIzq, "izq");
        if (img.logoDer) contener(ctx, img.logoDer, M.logoDer, "der");
        // La foto de la persona (la inscripción del Metropolitano la trae en
        // `g.foto`), en un marco tamaño pasaporte que ocupa el lugar de la
        // ilustración. Sin foto, todo queda como siempre.
        if (g.foto) {
          const fo = centro ? M.fotoCentro : M.foto;
          ctx.save(); rectRedondo(ctx, fo.x, fo.y, fo.w, fo.h, 1.2 * M.s); ctx.clip();
          cubrirCaja(ctx, g.foto, fo); ctx.restore();
          ctx.strokeStyle = color; ctx.lineWidth = 0.8 * M.s;
          rectRedondo(ctx, fo.x, fo.y, fo.w, fo.h, 1.2 * M.s); ctx.stroke();
        } else if (img.ilustracion) contener(ctx, img.ilustracion, M.ilustracion, "der", true);
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
        // Una tira decorativa debajo de la franja (las hojas de las bases
        // del Metropolitano); el del Centroamericano no la lleva.
        if (img.cintaFrente) {
          ctx.save(); ctx.beginPath(); ctx.rect(M.cinta.x, M.cinta.y, M.cinta.w, M.cinta.h); ctx.clip();
          cubrirCaja(ctx, img.cintaFrente, M.cinta); ctx.restore();
        }
        // Uno solo va a la derecha; dos, uno en cada esquina.
        if (iconos.length === 1) ponerIcono(iconos[0], M.W - M.icono.margen - lado2);
        if (iconos.length >= 2) { ponerIcono(iconos[0], M.icono.margen); ponerIcono(iconos[1], M.W - M.icono.margen - lado2); }
      };

      const lineas = String(diseno.titulo.texto || "").split(/\n/).map((l) => l.trim()).filter(Boolean).slice(0, 4);
      lineas.forEach((l, i) => escribir(recursos.texto, l, M.titulo.tam, { x: M.W / 2, y: M.titulo.y + i * M.titulo.paso, alinear: "centro", color: diseno.titulo.color, max: M.titulo.max || M.W - 8 * M.sx }));

      const nombre = g.nombre;
      const MN = centro ? M.nombreCentro : M.nombre;
      if (nombre.length) {
        // Las dos líneas del nombre van del mismo tamaño: el de la que menos cabe.
        let tam = MN.tam;
        for (const l of nombre) { const a = anchoDe(recursos.titulo, l, tam, 0); if (a > MN.max) tam = tam * MN.max / a; }
        // `nombre.color` fija el color del nombre (en la PZ, negro); sin él,
        // el del rol o la edad.
        const colorNombre = /^#[0-9a-f]{6}$/i.test(diseno.nombre.color || "") ? diseno.nombre.color : color;
        if (nombre.length === 1) escribir(recursos.titulo, nombre[0], tam, { x: M.W / 2, y: MN.solo, alinear: "centro", color: colorNombre, max: MN.max });
        else nombre.slice(0, 2).forEach((l, i) => escribir(recursos.titulo, l, tam, { x: M.W / 2, y: i ? MN.y2 : MN.y1, alinear: "centro", color: colorNombre, max: MN.max }));
      }
      const MD = centro ? M.detallesCentro : M.detalles;
      g.detalles.slice(0, 3).forEach((d, i) => escribir(recursos.texto, d, MD.tam, centro
        ? { x: M.W / 2, y: MD.y + i * MD.paso, alinear: "centro", color: i === 0 ? color : NEGRO_TEXTO, max: MD.max }
        : { x: MD.x, y: MD.y + i * MD.paso, color: i === 0 ? color : NEGRO_TEXTO, max: MD.max }));
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
    // El QR: el del diseño, o el propio de este gafete (el Metropolitano lleva
    // a cada jugador a su ronda y su mesa).
    const qr = g.qr ? matrizQr(g.qr) : recursos.qr;
    const ilDorso = (g.ilustracionDorso && img[g.ilustracionDorso]) || img.ilustracionDorso;
    const filas = (diseno.dorso.horario || []).filter((r) => r.some((c) => String(c || "").trim()));
    const T = diseno.dorso.horarioCentro ? M.tablaCentro : M.tabla;
    const enc = diseno.dorso.encabezados;
    const altoEnc = 6 * M.sy * M.tablaEscala;
    const altoFila = filas.length ? Math.min(5.6 * M.sy * M.tablaEscala, (T.h - altoEnc) / filas.length) : 0;
    const altoTabla = filas.length ? altoEnc + altoFila * filas.length : 0;
    const columnas = [0.44, 0.31, 0.25].map((p) => p * T.w);

    const fondo = (ctx) => {
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, M.W, M.H);
      if (img.fondoDorso) cubrir(ctx, img.fondoDorso, M.W, M.H);
      if (M.franjaArriba) { ctx.fillStyle = color; ctx.fillRect(0, 0, M.W, M.franjaArriba); }
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
      if (ilDorso) contener(ctx, ilDorso, M.dorsoIlustracion, "der", true);
      const c = M.cintaDorso;
      ctx.fillStyle = color; ctx.fillRect(c.x, c.y, c.w, c.h);
      if (qr) {     // el QR se apoya sobre la cinta con un borde blanco
        ctx.fillStyle = "#fff";
        rectRedondo(ctx, M.qr.x - 0.8 * M.s, M.qr.y - 0.8 * M.s, M.qr.w + 1.6 * M.s, M.qr.h + 1.6 * M.s, M.qr.w * 0.12); ctx.fill();
        pintarQr(ctx, qr, M.qr, recursos.marca);
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
    // El renglón de arriba del horario (`dorso.lineaArriba`: el lugar).
    if (diseno.dorso.lineaArriba) {
      escribir(recursos.texto, String(diseno.dorso.lineaArriba), 7.6 * M.s, { x: T.x + T.w / 2, y: T.y - 1.8 * M.sy, alinear: "centro", color, max: T.w + 8 * M.sx });
    }
    if (filas.length) {
      const tamEnc = Math.min(8.5 * M.s * M.tablaEscala, altoEnc / PT * 0.62), tamFila = Math.min(7.6 * M.s * M.tablaEscala, altoFila / PT * 0.62);
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
    // Para qué es el QR (opcional, `dorso.qrTexto`, hasta tres renglones
    // separados por «|»), arriba de él y pegado a su derecha: «Escanéalo: tu
    // mesa…» en la PZ. Con la ilustración del dorso al lado, no pasa del
    // ancho del QR (si no, se le montaría encima).
    const textoQr = g.qrTexto != null ? g.qrTexto : diseno.dorso.qrTexto;
    if (qr && textoQr) {
      const lineas = String(textoQr).split(/\n|\|/).map((l) => l.trim()).filter(Boolean).slice(0, 3);
      const der = M.qr.x + M.qr.w, max = ilDorso ? M.qr.w + 6 * M.sx : der - T.x;
      const tam = 7.6 * M.s, paso = tam * PT * 1.4;
      lineas.forEach((l, i) => {
        const ancho = Math.min(anchoDe(recursos.texto, l, tam, 0), max);
        escribir(recursos.texto, l, tam, { x: der - ancho, y: M.qr.y - 2.6 * M.sy - (lineas.length - 1 - i) * paso, color, max });
      });
    }
    if (g.codigo) {
      const c = M.cintaDorso;
      const y = c.y + c.h / 2 + altoMayus(recursos.titulo) * M.codigo.tam * PT / 2;
      escribir(recursos.titulo, g.codigo, M.codigo.tam, { x: M.codigo.x, y, color: "#ffffff", espaciado: 0.28, max: (qr ? M.qr.x - 2 * M.sx : M.W - 2 * M.sx) - M.codigo.x });
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

  /* El fondo de una cara en JPEG, a `dpi` (450 para la imprenta), listo para
     GafetesPdf: lo usan gafetes.html y la inscripción del Metropolitano. */
  async function fondoJpeg(diseno, c, dpi) {
    const M = medidas(diseno);
    const px = (dpi || 450) / 25.4;
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(M.W * px);
    lienzo.height = Math.round(M.H * px);
    const ctx = lienzo.getContext("2d");
    ctx.setTransform(lienzo.width / M.W, 0, 0, lienzo.height / M.H, 0, 0);
    c.fondo(ctx);
    const blob = await new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", 0.92));
    return { jpeg: new Uint8Array(await blob.arrayBuffer()), anchoPx: lienzo.width, altoPx: lienzo.height };
  }

  window.GafetesDibujo = {
    PT, columnasDe, valor, llenar, nombrePropio, gafetes, colorDe, contraste, medidas, preparar, cara, pintar,
    svgConTamano, cargarImagen, fondoJpeg,
  };
})();

/*! rev bfb5bbb0d2d82f9f */
