/* ===== Audiolibro de Peonita: lo que se le da a cada persona que graba =====
 *
 * El guion (herramientas/libro-ninos/guion/<slug>.json, lo escribe
 * libro-ninos-pdf.js) tiene todo el cuento, trozo por trozo, con quién lo dice.
 * Las voces las graban personas, y a cada una le sirve solo lo suyo: este
 * script arma, en herramientas/libro-ninos/guion/grabar/,
 *
 *   - <voz>.docx: un Word por voz con SOLO sus líneas, de los tres cuentos
 *     (una voz por personaje en toda la colección: quien hace a Peonita la
 *     hace en todos). Arriba, cómo es el personaje, cómo grabar, cómo nombrar
 *     el archivo y dónde subirlo; después, pista por pista, cada línea con su
 *     número y lo que se dice justo antes, para entrar a tiempo.
 *   - cesion-de-voz.docx: la autorización de uso de la voz para firmar, con
 *     la parte de quien tiene la tutela si la voz es de una persona menor.
 *
 * El número de cada línea es su lugar en la pista contando TODOS los trozos
 * (los de las otras voces también): así los saltos de un guion a otro calzan
 * y quien arme el audio sabe en qué lugar va cada toma. Quien graba dice el
 * número en voz alta antes de la línea; si se equivoca, lo vuelve a decir y
 * repite: vale la última toma.
 *
 * Un archivo de audio por persona y por pista: <libro>_pista<NN>_<voz>.wav.
 * Se suben a la carpeta de Google Drive «Audiolibro Peonita», una subcarpeta
 * por cuento. No se publica nada de esto (herramientas/ está en .assetsignore).
 *
 *   node herramientas/audiolibro-grabar.js
 *
 * Se vuelve a correr cada vez que cambia el guion (libro-ninos-pdf.js), y
 * verificar-libro-ninos.js avisa si un Word quedó viejo.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const X = require("docx");
const LIBROS = require("./libro-ninos/libros.js");
const VOCES = require("./libro-ninos/voces.js");

const CARPETA_GUION = path.join(__dirname, "libro-ninos", "guion");
const SALIDA = path.join(CARPETA_GUION, "grabar");
const CARPETA_DRIVE = "Audiolibro Peonita";
const CORREO = "privacidad@ajedrez-integral.com";

const nombreVoz = (v) => (v === "narrador" ? "Narración" : v === "coro" ? "Coro" : v);
// «Don Lento» → don-lento; sin tildes, para que el nombre del archivo no se
// rompa en ninguna computadora.
const slugVoz = (v) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const dosCifras = (n) => String(n).padStart(2, "0");
const archivoDe = (libro, pista, voz) => `${libro}_pista${dosCifras(pista)}_${slugVoz(voz)}.wav`;

function velocidadEnPalabras(v) {
  if (v <= 0.85) return "bastante más despacio que una conversación normal";
  if (v < 1) return "un poquito más despacio que una conversación normal";
  if (v === 1) return "a la velocidad de una conversación normal";
  if (v <= 1.05) return "un poquito más rápido que una conversación normal";
  return "más rápido y con energía";
}

// Lo que se dice justo antes: las últimas palabras, para saber cuándo entrar.
function cola(texto, palabras = 14) {
  const p = texto.split(/\s+/);
  return p.length <= palabras ? texto : "…" + p.slice(-palabras).join(" ");
}

function leerGuiones() {
  return LIBROS.map((l) => {
    const f = path.join(CARPETA_GUION, l.SLUG + ".json");
    if (!fs.existsSync(f)) throw new Error(`Falta ${f}: hay que correr herramientas/libro-ninos-pdf.js --solo-accesible`);
    return JSON.parse(fs.readFileSync(f, "utf8"));
  });
}

/* Lo que le toca a una voz: por libro, las pistas donde habla, cada línea con
   su número, lo que se dice antes (si lo dice otra voz) y si después viene la
   pausa para que el niño piense. Lo usa también verificar-libro-ninos.js. */
function lineasDe(guiones, voz) {
  return guiones.map((g) => ({
    libro: g.libro,
    titulo: g.titulo,
    pistas: g.pistas.map((p) => ({
      n: p.n,
      titulo: p.titulo,
      archivo: archivoDe(g.libro, p.n, voz),
      lineas: p.segmentos.map((s, i) => ({ s, i })).filter(({ s }) => s.voz === voz).map(({ s, i }) => {
        const antes = p.segmentos[i - 1];
        return {
          n: i + 1,
          texto: s.texto,
          piensa: !!s.piensa,
          antes: antes && antes.voz !== voz ? { voz: antes.voz, texto: cola(antes.texto) } : null,
        };
      }),
    })).filter((p) => p.lineas.length),
  })).filter((l) => l.pistas.length);
}

function vocesUsadas(guiones) {
  const usadas = new Set(guiones.flatMap((g) => g.pistas.flatMap((p) => p.segmentos.map((s) => s.voz))));
  // En el orden de PERSONAJES: primero la narración y después los personajes.
  return Object.keys(VOCES.PERSONAJES).filter((v) => usadas.has(v));
}

/* ------------------------------------------------------------ el Word */
const PT = (n) => n * 2; // docx mide la letra en medios puntos
const LETRA = "Verdana";
const GRIS = "595959"; // 7:1 sobre blanco

const p = (texto, o = {}) => new X.Paragraph({ spacing: { after: o.despues ?? 120 }, keepNext: o.junto, children: [].concat(texto).map((t) => (typeof t === "string" ? new X.TextRun(t) : t)), ...o.extra });
const r = (texto, o = {}) => new X.TextRun({ text: texto, ...o });
const h = (nivel, texto, o = {}) => new X.Paragraph({ heading: nivel, keepNext: true, pageBreakBefore: o.salto, children: [new X.TextRun(texto)] });
const punto = (texto) => new X.Paragraph({ bullet: { level: 0 }, spacing: { after: 80 }, children: [].concat(texto).map((t) => (typeof t === "string" ? new X.TextRun(t) : t)) });
const casilla = (texto) => p([r("☐  "), r(texto)], { despues: 80 });
const raya = (etiqueta, largo = 40, junto) => p([r(etiqueta + " "), r("_".repeat(largo))], { despues: 200, junto });

function documento(titulo, hijos) {
  return new X.Document({
    creator: "Ajedrez Integral",
    title: titulo,
    language: "es-CR",
    styles: {
      default: { document: { run: { font: LETRA, size: PT(12), language: { value: "es-CR" } }, paragraph: { spacing: { line: 300 } } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", run: { size: PT(20), bold: true, color: "1F3864" }, paragraph: { spacing: { before: 0, after: 200 } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", run: { size: PT(15), bold: true, color: "1F3864" }, paragraph: { spacing: { before: 320, after: 140 } } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", run: { size: PT(13), bold: true }, paragraph: { spacing: { before: 280, after: 100 } } },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1247, right: 1247 } } },
      footers: { default: new X.Footer({ children: [new X.Paragraph({ alignment: X.AlignmentType.CENTER, children: [new X.TextRun({ text: titulo + " · página ", size: PT(9), color: GRIS }), new X.TextRun({ children: [X.PageNumber.CURRENT], size: PT(9), color: GRIS })] })] }) },
      children: hijos,
    }],
  });
}

function guionDeVoz(guiones, voz) {
  const d = VOCES.PERSONAJES[voz];
  const libros = lineasDe(guiones, voz);
  const nombre = nombreVoz(voz);
  const total = libros.reduce((s, l) => s + l.pistas.reduce((t, x) => t + x.lineas.length, 0), 0);
  const palabras = libros.reduce((s, l) => s + l.pistas.reduce((t, x) => t + x.lineas.reduce((u, y) => u + y.texto.split(/\s+/).length, 0), 0), 0);
  const minutos = Math.max(1, Math.round(palabras / 140));
  const archivos = libros.reduce((s, l) => s + l.pistas.length, 0);
  const hijos = [
    h(X.HeadingLevel.HEADING_1, `Audiolibro de Peonita: el guion de ${voz === "narrador" ? "la narración" : nombre}`),
    p([r(`${total} líneas en ${archivos} archivos, unos ${minutos} minutos de lectura (grabando se tarda más o menos el triple). `), r("Gracias por prestarle tu voz a Peonita.", { bold: true })]),

    h(X.HeadingLevel.HEADING_2, voz === "narrador" ? "Tu voz" : "Tu personaje"),
    p([r(`${nombre}: `, { bold: true }), r(`${d.como}.`)]),
    punto([r("Voz: ", { bold: true }), r(d.voz + ".")]),
    punto([r("Velocidad: ", { bold: true }), r(velocidadEnPalabras(d.velocidad) + ".")]),
    punto("Es un cuento para niñas y niños de 4 a 8 años: se lee con calma, con cariño y bien clarito."),
    ...(voz === "narrador" ? [punto("Cuando habla un personaje, lo dice otra persona: tú lees solo lo que está en este guion. Al final de cada pregunta de «¡A jugar!» el niño tiene 8 segundos para pensar; tú no esperas: ese silencio se pone después.")] : []),

    h(X.HeadingLevel.HEADING_2, "Cómo grabar"),
    punto("En un cuarto chico, con cortinas o ropa alrededor (un clóset sirve muy bien). Sin ventilador, sin aire acondicionado y con el celular en modo avión."),
    punto("Con la grabadora de voz del celular en la mejor calidad, o con un micrófono USB. A unos 15 o 20 cm de la boca y un poco de lado, para que no se oigan las «p»."),
    punto("Si se puede elegir, en WAV o M4A y en mono. Mejor que no sea MP3."),
    punto("Al empezar cada archivo, 2 segundos de silencio."),
    punto([r("Antes de cada línea, di su número en voz alta ", { bold: true }), r("(«diecisiete») y deja un segundo de silencio entre una línea y la otra.")]),
    punto("Si te equivocas, no pares: di otra vez el número y repite la línea completa. Vale la última vez que la dijiste."),
    punto("Los números saltan (la 3, la 8, la 12…) porque entre una línea tuya y la otra hablan los demás. En gris está lo que se dice justo antes, para que sepas cómo entrar."),

    h(X.HeadingLevel.HEADING_2, "Cómo nombrar y subir los archivos"),
    p("Un archivo por pista, con el nombre que dice arriba de cada pista. Por ejemplo:"),
    p(r(libros[0].pistas[0].archivo, { font: "Consolas", bold: true })),
    p(`Súbelos a la carpeta de Google Drive «${CARPETA_DRIVE}», en la subcarpeta del cuento. Si tu celular le pone otra terminación (.m4a, .mp3), está bien: cambia solo el nombre, no la terminación.`),
    p([r("Antes de grabar, firma la autorización de uso de tu voz ", { bold: true }), r("(cesion-de-voz.docx). Si la voz es de una persona menor de edad, la firma su madre, su padre o quien tenga la tutela.")]),

    h(X.HeadingLevel.HEADING_2, "Tus archivos"),
    ...libros.flatMap((l) => [
      p(r(l.titulo, { bold: true }), { despues: 60, junto: true }),
      ...l.pistas.map((x) => punto([r(x.archivo, { font: "Consolas" }), r(` · ${x.titulo} · ${x.lineas.length} ${x.lineas.length === 1 ? "línea" : "líneas"}`)])),
    ]),
  ];

  libros.forEach((l) => {
    hijos.push(h(X.HeadingLevel.HEADING_2, l.titulo, { salto: true }));
    l.pistas.forEach((x) => {
      hijos.push(h(X.HeadingLevel.HEADING_3, `Pista ${dosCifras(x.n)}. ${x.titulo}`));
      hijos.push(p([r("Archivo: "), r(x.archivo, { font: "Consolas", bold: true })], { despues: 200 }));
      x.lineas.forEach((y) => {
        if (y.antes) hijos.push(p(r(`Antes, ${nombreVoz(y.antes.voz)}: «${y.antes.texto}»`, { italics: true, color: GRIS, size: PT(10) }), { despues: 60, junto: true }));
        hijos.push(p([r(`${y.n}. `, { bold: true }), r(y.texto, { size: PT(14) })], { despues: y.piensa ? 40 : 200, junto: y.piensa }));
        if (y.piensa) hijos.push(p(r("(Aquí el niño piensa y contesta. Tú sigue: el silencio se pone después.)", { italics: true, color: GRIS, size: PT(10) }), { despues: 200 }));
      });
    });
  });
  return documento(`Audiolibro de Peonita · ${nombre}`, hijos);
}

/* ------------------------------------------------- la cesión de la voz */
function cesion(guiones) {
  const titulos = guiones.map((g) => `«${g.titulo}»`);
  const lista = titulos.slice(0, -1).join(", ") + " y " + titulos[titulos.length - 1];
  const hijos = [
    h(X.HeadingLevel.HEADING_1, "Autorización de uso de la voz"),
    p(r("Audiolibros de los cuentos de Peonita · Ajedrez Integral", { bold: true })),

    h(X.HeadingLevel.HEADING_2, "1. Quién autoriza"),
    raya("Nombre completo:", 46),
    raya("Cédula o identificación:", 20),
    raya("Teléfono:", 18),
    raya("Correo:", 40),
    raya("Personaje o personajes que graba:", 30),

    h(X.HeadingLevel.HEADING_3, "Solo si la voz es de una persona menor de edad"),
    raya("Nombre de la persona menor:", 36),
    raya("Fecha de nacimiento:", 20),
    p("Quien firma este documento lo hace como (marcar):"),
    casilla("Madre"), casilla("Padre"), casilla("Representante legal o persona con la tutela"),
    p("y declara que tiene la representación legal de la persona menor para firmarlo."),
    casilla("A la persona menor se le explicó qué se va a grabar y para qué, y está de acuerdo."),

    h(X.HeadingLevel.HEADING_2, "2. Qué se autoriza"),
    p(`Autorizo a Ajedrez Integral, nombre comercial de Oscar Angulo Cubero, cédula 1-1399-0053 (en adelante, «la Academia»), a grabar mi voz —o la de la persona menor que represento— leyendo el guion de los audiolibros de los cuentos ${lista}, de Oscar Angulo Cubero, y a usar esas grabaciones como dice este documento.`),
    p("Para esos usos, cedo a la Academia los derechos patrimoniales sobre la interpretación grabada (Ley 6683 de Derechos de Autor y Derechos Conexos). Conservo mis derechos morales, entre ellos que se respete la interpretación."),

    h(X.HeadingLevel.HEADING_2, "3. Para qué se usan las grabaciones"),
    punto("Para armar los audiolibros de esos cuentos (en audio y en libro electrónico con audio) y sus nuevas ediciones."),
    punto("Para publicarlos en ajedrez-integral.com, en la plataforma de la Academia y en sus clases, para escucharlos o descargarlos, con o sin costo."),
    punto("Para dar a conocer los audiolibros con fragmentos cortos."),
    p("No se usan para nada más sin pedir de nuevo el permiso por escrito."),

    h(X.HeadingLevel.HEADING_2, "4. Lo que se puede y lo que no se puede hacer con la voz"),
    punto("Se puede editar: cortar, quitar ruidos y repeticiones, igualar el volumen, poner pausas, efectos de sonido y música."),
    punto("No se puede cambiarle el sentido a lo que se dijo, ni usar la voz en otros textos."),
    punto("No se puede crear con la voz una voz artificial (por ejemplo, con inteligencia artificial o clonación de voz), ni usarla para entrenar sistemas de ese tipo."),

    h(X.HeadingLevel.HEADING_2, "5. El crédito en el audiolibro (marcar uno)"),
    casilla("Nombre completo"),
    casilla("Solo el nombre, sin apellidos (lo recomendado para una persona menor)"),
    p([r("☐  Un seudónimo: "), r("_".repeat(28))], { despues: 80 }),
    casilla("Sin crédito"),

    h(X.HeadingLevel.HEADING_2, "6. El pago (marcar uno)"),
    casilla("Colaboro sin cobrar nada."),
    p([r("☐  Recibo ₡"), r("_".repeat(14)), r(" por "), r("_".repeat(26)), r(".")], { despues: 80 }),

    h(X.HeadingLevel.HEADING_2, "7. Cuánto dura y cómo se retira"),
    p("Esta autorización vale sin plazo y en cualquier país, porque los audiolibros se publican en internet."),
    p(`Se puede retirar en cualquier momento, sin costo, escribiendo a ${CORREO}. En un máximo de 30 días naturales la Academia deja de publicar los audios con esa voz y la reemplaza. Lo que otras personas ya descargaron antes no se puede recuperar.`),

    h(X.HeadingLevel.HEADING_2, "8. Los datos personales (Ley 8968)"),
    p("El responsable de los datos es Oscar Angulo Cubero (Ajedrez Integral). Se guardan este documento, los datos de contacto y las grabaciones, solo para lo que dice este documento:"),
    punto(`Las grabaciones se suben a una carpeta privada de Google Drive de la Academia («${CARPETA_DRIVE}») mientras se arma el audiolibro. Las tomas que no se usen se borran al terminarlo.`),
    punto("Este documento se guarda mientras se publiquen los audios y hasta un año después de dejar de publicarlos, para demostrar que hubo permiso."),
    punto(`Se puede pedir ver, corregir o borrar los datos escribiendo a ${CORREO}. Más detalles en ajedrez-integral.com/privacidad.html.`),

    // Las firmas van juntas en la misma página: una firma sola arriba de una
    // hoja nueva no dice qué se firmó.
    h(X.HeadingLevel.HEADING_2, "Firmas"),
    raya("Lugar y fecha:", 40, true),
    p(" ", { despues: 400, junto: true }),
    raya("Firma de quien autoriza:", 32, true),
    raya("Nombre:", 44, true),
    p(" ", { despues: 400, junto: true }),
    raya("Firma de la persona menor (si quiere):", 22, true),
    p(" ", { despues: 400, junto: true }),
    raya("Por Ajedrez Integral, Oscar Angulo Cubero:", 20),
  ];
  return documento("Autorización de uso de la voz · Audiolibros de Peonita", hijos);
}

module.exports = { lineasDe, vocesUsadas, leerGuiones, archivoDe, slugVoz, SALIDA };

if (require.main === module) {
  (async () => {
    const guiones = leerGuiones();
    fs.mkdirSync(SALIDA, { recursive: true });
    for (const voz of vocesUsadas(guiones)) {
      const f = path.join(SALIDA, slugVoz(voz) + ".docx");
      fs.writeFileSync(f, await X.Packer.toBuffer(guionDeVoz(guiones, voz)));
      const n = lineasDe(guiones, voz).reduce((s, l) => s + l.pistas.reduce((t, x) => t + x.lineas.length, 0), 0);
      console.log(`${nombreVoz(voz)}: ${n} líneas → ${path.relative(process.cwd(), f)}`);
    }
    const c = path.join(SALIDA, "cesion-de-voz.docx");
    fs.writeFileSync(c, await X.Packer.toBuffer(cesion(guiones)));
    console.log(`La autorización: ${path.relative(process.cwd(), c)}`);
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
