/* La cámara con guía para la foto de las dos planillas (Mesa del árbitro del Centroamericano).

   El árbitro toca la camarita de una mesa y, en vez de la cámara del aparato (que no deja dibujar
   nada encima), se abre la cámara DENTRO de la página con dos marcos: la planilla de las blancas a
   la izquierda y la de las negras a la derecha. El árbitro acomoda las hojas dentro de los marcos,
   toca el botón, REVISA la foto y la usa o la repite. Ver «La cámara con guía para las planillas» en
   docs/decisiones/juegos-y-torneos.md.

   LO QUE NUNCA HACE: bloquear. El botón de tomar la foto siempre funciona; la guía solo ayuda. Si
   el aparato no da la cámara (no hay, no hay permiso, el navegador no la ofrece), `abrir()` lo
   dice y quien llama sigue con la cámara de siempre. Detectar las hojas es una ayuda (los marcos se
   ponen verdes), no un candado: una mesa clara, un reflejo o una hoja de color pueden engañarla, y
   por eso la decisión final es de la persona, que ve la foto antes de mandarla.

   LA DETECCIÓN (`analizar`): se baja el cuadro a 160 píxeles de ancho, se separa «papel» de
   «mesa» con el método de Otsu (el umbral de brillo que mejor parte el cuadro en claro y oscuro) y se
   mide cuánto papel hay DENTRO de cada marco (tiene que llenarlo) y cuánto en una banda justo
   AFUERA (no tiene que haber: si hay, la hoja se sale o está chueca). Con poco contraste entre hoja y
   mesa no se afirma nada. Para que no parpadee, se necesitan 3 lecturas buenas seguidas para pasar
   a verde y 2 malas seguidas para salir.

       window.GuiaPlanillas.disponible()                  -> ¿este aparato puede abrir la cámara aquí?
       window.GuiaPlanillas.abrir({ titulo, rotulos })    -> Promise<{ imagen } | { cancelado } | { sin_camara, motivo }>
       (puras, para probarlas sin navegador) marcosGuia, otsu, analizar, textoGuia */
(function (raiz) {
  "use strict";
  const enNode = typeof module !== "undefined" && module.exports;

  // ------------------------------------------------------------- lo que se calcula (sin navegador)

  const HOJA = 210 / 297;   // una planilla es una hoja vertical (A4: ancho / alto)
  const HUECO = 0.04;       // el espacio entre los dos marcos, como fracción del ancho del cuadro
  const LADO_FOTO = 2600;   // la foto se guarda con el lado largo en 2600 px como máximo
  const BUENAS = 3, MALAS = 2;   // lecturas seguidas para pasar a verde / para salir de él

  // Los dos marcos, como fracciones del cuadro de la cámara (0 a 1). `aspecto` es ancho / alto del video.
  // Dos hojas verticales una al lado de la otra: lo que limita es el ancho, así que si el cuadro es
  // angosto los marcos se achican para que quepan los dos con un margen.
  function marcosGuia(aspecto) {
    const a = aspecto > 0.2 ? aspecto : 16 / 9;
    let h = 0.84, hueco = HUECO;
    let w = (h * HOJA) / a;
    const total = 2 * w + hueco;
    if (total > 0.92) { const k = 0.92 / total; h *= k; w *= k; hueco *= k; }
    const x0 = (1 - (2 * w + hueco)) / 2;
    const y = (1 - h) / 2;
    return [{ x: x0, y, w, h }, { x: x0 + w + hueco, y, w, h }];
  }

  // El umbral de brillo (0 a 255) que mejor separa lo oscuro de lo claro (método de Otsu).
  // Devuelve también el brillo medio de cada lado: su diferencia dice si hay contraste.
  function otsu(lum) {
    const hist = new Float64Array(256);
    for (let i = 0; i < lum.length; i++) hist[lum[i]]++;
    const total = lum.length;
    let suma = 0;
    for (let t = 0; t < 256; t++) suma += t * hist[t];
    let sumaB = 0, pesoB = 0, mejor = -1, umbral = 127, muB = 0, muF = 0;
    for (let t = 0; t < 256; t++) {
      pesoB += hist[t];
      if (!pesoB) continue;
      const pesoF = total - pesoB;
      if (!pesoF) break;
      sumaB += t * hist[t];
      const mB = sumaB / pesoB, mF = (suma - sumaB) / pesoF;
      const entre = pesoB * pesoF * (mB - mF) * (mB - mF);
      if (entre > mejor) { mejor = entre; umbral = t; muB = mB; muF = mF; }
    }
    return { umbral, oscuro: muB, claro: muF, contraste: muF - muB };
  }

  // Mide la hoja que hay dentro de una zona (el marco con un poco de margen): cuánto papel hay, qué
  // tan grande se ve, dónde está su centro y cuántos grados está inclinada respecto de la vertical.
  // El tamaño sale de las filas y columnas donde hay papel de verdad (así no lo engaña una esquina
  // suelta ni las líneas de la planilla); la inclinación, de la dirección en que se estira el papel
  // (momentos de segundo orden, como una elipse que se ajusta a la hoja).
  function medirHoja(lum, ancho, umbral, zona) {
    const { x0, y0, x1, y1 } = zona;
    const w = x1 - x0, h = y1 - y0;
    const col = new Float64Array(w), fila = new Float64Array(h);
    let n = 0, sx = 0, sy = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (lum[(y0 + y) * ancho + (x0 + x)] > umbral) { n++; col[x]++; fila[y]++; sx += x; sy += y; }
    }
    if (n < 6) return { n, frac: 0, ancho: 0, alto: 0, cx: 0, cy: 0, inclinacion: 90 };
    const tramo = (v) => {
      const tope = Math.max(...v) * 0.5;
      let a = 0, b = v.length - 1;
      while (a < v.length && v[a] < tope) a++;
      while (b > a && v[b] < tope) b--;
      return [a, b];
    };
    const [ca, cb] = tramo(col), [fa, fb] = tramo(fila);
    const cx = sx / n, cy = sy / n;
    let m20 = 0, m02 = 0, m11 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (lum[(y0 + y) * ancho + (x0 + x)] > umbral) { const dx = x - cx, dy = y - cy; m20 += dx * dx; m02 += dy * dy; m11 += dx * dy; }
    }
    const theta = 0.5 * Math.atan2(2 * m11, m20 - m02) * 180 / Math.PI;   // dirección del eje largo, desde el horizontal
    const inclinacion = Math.abs(90 - Math.abs(theta));                    // 0 = hoja derecha
    return { n, frac: n / (w * h), ancho: cb - ca + 1, alto: fb - fa + 1, cx: x0 + cx, cy: y0 + cy, inclinacion };
  }

  // Lo que se le exige a cada hoja respecto de su marco.
  // (El margen de medición es corto a propósito para no tocar la otra hoja: una hoja pasada de grande llena la zona y se
  // ve como ~1,10; por eso el tope es 1,07.)
  const TOLERA = { inclinacion: 4.5, anchoMin: 0.80, anchoMax: 1.07, altoMin: 0.82, altoMax: 1.07, descentradoX: 0.12, descentradoY: 0.09, minPapel: 0.30 };

  // `rgba`: píxeles del cuadro ya reducido (Uint8ClampedArray de ancho × alto × 4).
  // Devuelve { ok, motivo, hojas:[{…}, {…}], contraste, umbral }; `motivo` dice qué corregir primero.
  function analizar(rgba, ancho, alto, marcos) {
    const lum = new Uint8Array(ancho * alto);
    for (let i = 0, j = 0; i < lum.length; i++, j += 4) lum[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
    const { umbral, contraste } = otsu(lum);
    const hueco = marcos.length > 1 ? marcos[1].x - (marcos[0].x + marcos[0].w) : HUECO;
    // La zona de cada hoja: su marco con un margen (sin llegar a la otra hoja).
    const margenX = hueco * 0.45, margenY = Math.min(0.05, marcos[0].y * 0.9);
    const hojas = marcos.map((m) => {
      const zona = {
        x0: Math.max(0, Math.round((m.x - margenX) * ancho)), y0: Math.max(0, Math.round((m.y - margenY) * alto)),
        x1: Math.min(ancho, Math.round((m.x + m.w + margenX) * ancho)), y1: Math.min(alto, Math.round((m.y + m.h + margenY) * alto)),
      };
      const medida = medirHoja(lum, ancho, umbral, zona);
      const mw = m.w * ancho, mh = m.h * alto, mcx = (m.x + m.w / 2) * ancho, mcy = (m.y + m.h / 2) * alto;
      const anchoRel = medida.ancho / mw, altoRel = medida.alto / mh;
      return Object.assign(medida, {
        anchoRel, altoRel,
        corrimientoX: (medida.cx - mcx) / mw, corrimientoY: (medida.cy - mcy) / mh,
        hay: medida.frac >= TOLERA.minPapel,
      });
    });
    const hayContraste = contraste >= 35 && umbral >= 40 && umbral <= 235;
    const lados = ["blancas", "negras"];
    let motivo = "ok";
    if (!hayContraste) motivo = "contraste";
    else if (!hojas[0].hay || !hojas[1].hay) motivo = "falta_" + lados[!hojas[0].hay ? 0 : 1];
    else if (hojas.every((o) => o.anchoRel < TOLERA.anchoMin || o.altoRel < TOLERA.altoMin)) motivo = "lejos";
    else if (hojas.every((o) => o.anchoRel > TOLERA.anchoMax || o.altoRel > TOLERA.altoMax)) motivo = "cerca";
    else {
      for (let i = 0; i < 2 && motivo === "ok"; i++) {
        const o = hojas[i];
        // Primero si está chueca, luego si está corrida (una hoja corrida se ve «grande» porque la zona la recorta) y al final el tamaño.
        if (o.inclinacion > TOLERA.inclinacion) motivo = "chueca_" + lados[i];
        else if (Math.abs(o.corrimientoX) > TOLERA.descentradoX || Math.abs(o.corrimientoY) > TOLERA.descentradoY) motivo = "centrar_" + lados[i];
        else if (o.anchoRel < TOLERA.anchoMin || o.altoRel < TOLERA.altoMin) motivo = "chica_" + lados[i];
        else if (o.anchoRel > TOLERA.anchoMax || o.altoRel > TOLERA.altoMax) motivo = "grande_" + lados[i];
      }
    }
    return { ok: motivo === "ok", motivo, hojas, dentro: hojas.map((o) => o.frac), contraste, umbral };
  }

  // Lo que se le dice a la persona según lo que se vio (siempre con palabras: el color no va solo).
  function textoGuia(motivo) {
    const m = String(motivo || "").split("_");
    const de = m[1] ? " de las " + m[1] : "";
    switch (m[0]) {
      case "ok": return "✓ Se ven las dos planillas. ¡Toma la foto!";
      case "falta": return "Falta la planilla" + de + ": ponla dentro de su marco";
      case "chueca": return "Endereza la planilla" + de + ": está chueca";
      case "chica": return "Acerca la planilla" + de + " a su marco: se ve chica";
      case "grande": return "La planilla" + de + " se sale de su marco: acomódala o aleja un poco el aparato";
      case "centrar": return "Centra la planilla" + de + " en su marco";
      case "lejos": return "Acerca el aparato: las planillas se ven chicas";
      case "cerca": return "Aleja un poco el aparato: las hojas se salen de los marcos";
      default: return "Acomoda las dos planillas dentro de los marcos";
    }
  }

  // El estado que se muestra, con el «aguante» para que no parpadee. `previo`: { verde, buenas, malas }.
  function siguiente(previo, lectura) {
    let { verde, buenas, malas } = previo;
    if (lectura.ok) { buenas++; malas = 0; } else { malas++; buenas = 0; }
    if (!verde && buenas >= BUENAS) verde = true;
    else if (verde && malas >= MALAS) verde = false;
    return { verde, buenas, malas };
  }

  const puras = { marcosGuia, otsu, medirHoja, analizar, textoGuia, siguiente, HOJA, LADO_FOTO, TOLERA };
  if (enNode) { module.exports = puras; return; }

  // ------------------------------------------------------------- la ventana de la cámara (navegador)

  const NS = "http://www.w3.org/2000/svg";
  const disponible = () => !!(raiz.isSecureContext !== false && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  function h(etiqueta, atributos, ...hijos) {
    const e = document.createElement(etiqueta);
    for (const [k, v] of Object.entries(atributos || {})) {
      if (v == null || v === false) continue;
      if (k === "texto") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const x of hijos) if (x != null) e.append(x);
    return e;
  }

  function iconoSvg(trazos) {
    const s = document.createElementNS(NS, "svg");
    for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" })) s.setAttribute(k, v);
    for (const d of trazos) { const p = document.createElementNS(NS, "path"); p.setAttribute("d", d); s.append(p); }
    return s;
  }

  // El mensaje de error que se le muestra a quien llama (sin tecnicismos).
  function motivoDe(e) {
    const n = e && e.name;
    if (n === "NotAllowedError" || n === "SecurityError") return "No diste permiso para usar la cámara en esta página.";
    if (n === "NotFoundError" || n === "OverconstrainedError") return "Este aparato no tiene una cámara que se pueda abrir aquí.";
    if (n === "NotReadableError") return "La cámara está ocupada por otra aplicación.";
    return "No se pudo abrir la cámara dentro de la página.";
  }

  function abrir(opciones) {
    const op = opciones || {};
    const rotulos = op.rotulos || ["Planilla de las blancas", "Planilla de las negras"];
    return new Promise((resolver) => {
      if (!disponible()) { resolver({ sin_camara: true, motivo: "Este navegador no deja usar la cámara dentro de la página." }); return; }

      const previoFoco = document.activeElement;
      let stream = null, termino = false, intervalo = null, estado = { verde: false, buenas: 0, malas: 0 }, ultimoTexto = "", antorcha = false, revisando = false, foto = null;
      const lienzo = document.createElement("canvas");
      const ctx = lienzo.getContext("2d", { willReadFrequently: true });

      // --- la pantalla
      const video = h("video", { class: "cam-guia-video", playsinline: true, muted: true, autoplay: true, "aria-hidden": "true" });
      video.muted = true;
      const marcoEls = [0, 1].map((i) => h("div", { class: "cam-guia-marco", "data-lado": i === 0 ? "blancas" : "negras" },
        h("span", { class: "cam-guia-esq e1" }), h("span", { class: "cam-guia-esq e2" }), h("span", { class: "cam-guia-esq e3" }), h("span", { class: "cam-guia-esq e4" }),
        h("span", { class: "cam-guia-rotulo", texto: rotulos[i] })));
      const sombra = document.createElementNS(NS, "svg");
      sombra.setAttribute("class", "cam-guia-sombra");
      sombra.setAttribute("aria-hidden", "true");
      const estadoEl = h("p", { class: "cam-guia-estado", role: "status", "aria-live": "polite", texto: "Abriendo la cámara…" });
      const botonCerrar = h("button", { type: "button", class: "cam-guia-cerrar", "aria-label": "Cerrar la cámara sin tomar la foto", title: "Cerrar", onclick: () => cerrar({ cancelado: true }) }, "✕");
      const disparador = h("button", { type: "button", class: "cam-guia-disparador", "aria-label": "Tomar la foto de las dos planillas", title: "Tomar la foto", disabled: true, onclick: tomar }, h("span", { class: "cam-guia-disparador-aro", "aria-hidden": "true" }));
      const botonLinterna = h("button", { type: "button", class: "cam-guia-aux", hidden: true, "aria-pressed": "false", "aria-label": "Prender la linterna", title: "Linterna", onclick: alternarLinterna }, iconoSvg(["M9 2h6l1 5H8z", "M8 7l-1 4a5 5 0 0 0 10 0l-1-4", "M12 13v4"]));
      const usarNormal = h("button", { type: "button", class: "cam-guia-enlace", onclick: () => cerrar({ sin_camara: true, elegida: true, motivo: "Elegiste la cámara del aparato." }) }, "Usar la cámara del aparato");
      const girar = h("div", { class: "cam-guia-girar", hidden: true },
        h("div", { class: "cam-guia-giro", "aria-hidden": "true" }, h("span", {})),
        h("p", { class: "cam-guia-girar-titulo", texto: "Gira el aparato a lo ancho" }),
        h("p", { texto: "Así caben las dos planillas en la foto y se leen bien. Esta guía se quita sola cuando lo giras." }));
      // El mensaje de estado va en la barra de arriba (no encima de la cámara, donde taparía las hojas) y esa
      // barra se pone verde cuando todo está en su lugar.
      const arriba = h("div", { class: "cam-guia-arriba" },
        h("div", {}, h("strong", { id: "cam-guia-titulo", texto: op.titulo || "Foto de las planillas" }), estadoEl),
        botonCerrar);
      const abajo = h("div", { class: "cam-guia-abajo" }, botonLinterna, disparador, usarNormal);
      const vivo = h("div", { class: "cam-guia-vivo" }, video, sombra, ...marcoEls, girar);

      // --- la revisión de la foto
      const imagenEl = h("img", { class: "cam-guia-foto", alt: "La foto que tomaste de las dos planillas" });
      const revisionEl = h("div", { class: "cam-guia-revision", hidden: true },
        h("div", { class: "cam-guia-arriba" }, h("div", {}, h("strong", { texto: "¿Se ven bien las dos planillas?" }), h("span", { class: "cam-guia-sub", texto: "Que se lean las jugadas y los nombres, sin sombras ni reflejos." }))),
        imagenEl,
        h("div", { class: "cam-guia-abajo" },
          h("button", { type: "button", class: "cam-guia-boton cam-guia-boton-claro", "data-accion": "repetir", onclick: repetir }, "Repetir la foto"),
          h("button", { type: "button", class: "cam-guia-boton cam-guia-boton-verde", "data-accion": "usar", onclick: () => cerrar({ imagen: foto }) }, "Usar esta foto")));

      const raizEl = h("div", { class: "cam-guia", role: "dialog", "aria-modal": "true", "aria-labelledby": "cam-guia-titulo", "data-listo": "no", "data-verde": "no" }, arriba, vivo, abajo, revisionEl);
      document.body.append(raizEl);
      document.body.classList.add("cam-guia-abierta");
      raizEl.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { ev.preventDefault(); cerrar({ cancelado: true }); } });
      botonCerrar.focus();

      // --- dónde caen los marcos: encima de la parte de la pantalla donde de verdad se ve el video
      function acomodar() {
        const apaisado = raiz.innerWidth >= raiz.innerHeight;
        girar.hidden = apaisado;
        vivo.dataset.apaisado = apaisado ? "si" : "no";
        if (!apaisado) { if (ultimoTexto !== "girar") { ultimoTexto = "girar"; estadoEl.textContent = "Gira el aparato a lo ancho"; } }
        else if (ultimoTexto === "girar") { ultimoTexto = ""; estadoEl.textContent = textoGuia("contraste"); }
        const caja = vivo.getBoundingClientRect();
        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw || !vh || !caja.width) return;
        const esc = Math.min(caja.width / vw, caja.height / vh), ancho = vw * esc, alto = vh * esc;
        const ox = (caja.width - ancho) / 2, oy = (caja.height - alto) / 2;
        const marcos = marcosGuia(vw / vh);
        marcos.forEach((m, i) => {
          const s = marcoEls[i].style;
          s.left = ox + m.x * ancho + "px"; s.top = oy + m.y * alto + "px"; s.width = m.w * ancho + "px"; s.height = m.h * alto + "px";
        });
        // La sombra: todo oscuro menos los marcos.
        sombra.setAttribute("width", caja.width); sombra.setAttribute("height", caja.height);
        sombra.replaceChildren();
        const defs = document.createElementNS(NS, "defs"), mask = document.createElementNS(NS, "mask");
        mask.setAttribute("id", "cam-guia-mascara");
        const fondo = document.createElementNS(NS, "rect");
        for (const [k, v] of Object.entries({ x: ox, y: oy, width: ancho, height: alto, fill: "white" })) fondo.setAttribute(k, v);
        mask.append(fondo);
        marcos.forEach((m) => {
          const r = document.createElementNS(NS, "rect");
          for (const [k, v] of Object.entries({ x: ox + m.x * ancho, y: oy + m.y * alto, width: m.w * ancho, height: m.h * alto, rx: 12, fill: "black" })) r.setAttribute(k, v);
          mask.append(r);
        });
        defs.append(mask);
        const velo = document.createElementNS(NS, "rect");
        for (const [k, v] of Object.entries({ x: ox, y: oy, width: ancho, height: alto, fill: "rgba(8,16,30,.55)", mask: "url(#cam-guia-mascara)" })) velo.setAttribute(k, v);
        sombra.append(defs, velo);
      }

      // --- mirar lo que ve la cámara y decir si las hojas están en su lugar
      function mirar() {
        if (termino || revisando || vivo.dataset.apaisado !== "si") return;
        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw || !vh || video.readyState < 2) return;
        const ancho = 160, alto = Math.max(1, Math.round(ancho * vh / vw));
        lienzo.width = ancho; lienzo.height = alto;
        ctx.drawImage(video, 0, 0, ancho, alto);
        let lectura;
        try { lectura = analizar(ctx.getImageData(0, 0, ancho, alto).data, ancho, alto, marcosGuia(vw / vh)); } catch (e) { return; }
        estado = siguiente(estado, lectura);
        const texto = estado.verde ? textoGuia("ok") : textoGuia(lectura.motivo === "ok" ? "contraste" : lectura.motivo);
        raizEl.dataset.verde = estado.verde ? "si" : "no";
        if (texto !== ultimoTexto) { ultimoTexto = texto; estadoEl.textContent = texto; }
      }

      function tomar() {
        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw || !vh || termino) return;
        const esc = Math.min(1, LADO_FOTO / Math.max(vw, vh));
        const c = document.createElement("canvas");
        c.width = Math.round(vw * esc); c.height = Math.round(vh * esc);
        c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
        foto = c.toDataURL("image/jpeg", 0.85);
        imagenEl.src = foto;
        revisando = true;
        revisionEl.hidden = false;
        vivo.hidden = true; abajo.hidden = true; arriba.hidden = true;
        raizEl.dataset.revisando = "si";
        const usar = revisionEl.querySelector('[data-accion="usar"]');
        if (usar) usar.focus();
      }

      function repetir() {
        revisando = false; foto = null; imagenEl.removeAttribute("src");
        revisionEl.hidden = true; vivo.hidden = false; abajo.hidden = false; arriba.hidden = false;
        raizEl.dataset.revisando = "no";
        estado = { verde: false, buenas: 0, malas: 0 };
        acomodar();
        disparador.focus();
      }

      async function alternarLinterna() {
        const pista = stream && stream.getVideoTracks()[0];
        if (!pista) return;
        try {
          await pista.applyConstraints({ advanced: [{ torch: !antorcha }] });
          antorcha = !antorcha;
          botonLinterna.setAttribute("aria-pressed", antorcha ? "true" : "false");
          botonLinterna.setAttribute("aria-label", antorcha ? "Apagar la linterna" : "Prender la linterna");
        } catch (e) { botonLinterna.hidden = true; }
      }

      function cerrar(resultado) {
        if (termino) return;
        termino = true;
        clearInterval(intervalo);
        raiz.removeEventListener("resize", acomodar);
        raiz.removeEventListener("orientationchange", acomodar);
        document.removeEventListener("visibilitychange", alOcultar);
        if (stream) for (const p of stream.getTracks()) p.stop();   // la cámara se apaga: no gasta batería
        video.srcObject = null;
        raizEl.remove();
        document.body.classList.remove("cam-guia-abierta");
        if (previoFoco && previoFoco.focus && document.contains(previoFoco)) previoFoco.focus();
        resolver(resultado);
      }
      function alOcultar() { if (document.hidden && !revisando) estadoEl.textContent = "Cámara en pausa"; }

      raiz.addEventListener("resize", acomodar);
      raiz.addEventListener("orientationchange", acomodar);
      document.addEventListener("visibilitychange", alOcultar);

      // --- abrir la cámara de atrás, con la mejor resolución que dé el aparato
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false }).then(async (s) => {
        if (termino) { for (const p of s.getTracks()) p.stop(); return; }
        stream = s;
        video.srcObject = s;
        try { await video.play(); } catch (e) { /* el navegador a veces ya la arrancó */ }
        const pista = s.getVideoTracks()[0];
        const caps = pista && pista.getCapabilities ? pista.getCapabilities() : {};
        if (caps && caps.torch) botonLinterna.hidden = false;
        const listo = () => { acomodar(); disparador.disabled = false; raizEl.dataset.listo = "si"; estadoEl.textContent = textoGuia("contraste"); ultimoTexto = estadoEl.textContent; };
        if (video.videoWidth) listo(); else video.addEventListener("loadedmetadata", listo, { once: true });
        video.addEventListener("resize", acomodar);
        intervalo = setInterval(mirar, 300);
      }).catch((e) => cerrar({ sin_camara: true, motivo: motivoDe(e) }));
    });
  }

  raiz.GuiaPlanillas = Object.assign({ disponible, abrir }, puras);
})(typeof self !== "undefined" ? self : this);
