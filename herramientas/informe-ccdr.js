#!/usr/bin/env node
// El informe técnico mensual para el Comité Cantonal de Deportes y Recreación
// de San José (CCDR), en Word, con la estructura de la guía que pide el
// comité: datos del mes, nueve preguntas (cada una en su cuadro) y la firma,
// más dos anexos: la asistencia a las sesiones virtuales y las fotos.
//
//   node herramientas/informe-ccdr.js <datos-del-mes.json> <salida.docx>
//
// Lo de cada mes va en el JSON, NUNCA en este archivo ni en el repositorio:
// trae nombres de menores de edad. Va en una carpeta de trabajo fuera de git
// (`informes-ccdr/` está en .gitignore por si alguien lo guarda acá). El
// formato del JSON y cómo se juntan los datos cada mes están en
// .claude/skills/informe-ccdr/SKILL.md; el porqué, en «El informe mensual
// para el CCDR San José» (docs/decisiones/informes.md).
//
// Un texto se escribe como una lista de trozos: "texto normal",
// {"b": "negrita"}, {"i": "cursiva"} o {"pend": "por confirmar"}. Lo que va
// en "pend" sale resaltado en amarillo: es lo que quien firma tiene que
// confirmar o completar antes de mandar el informe (lo que no salió de un
// dato, sino de un supuesto).

const fs = require("fs");
const path = require("path");
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType,
  ShadingType, BorderStyle, HeadingLevel, LevelFormat, VerticalAlign, PageBreak, ImageRun } = require("docx");

const ANCHO = 9360;       // carta con márgenes de 1": 6,5" en DXA
const INTERIOR = 9120;    // lo que cabe dentro de un cuadro (descontando el relleno de la celda)
const FUENTE = "Arial";
const GRIS = "D9E2F3";
const borde = { style: BorderStyle.SINGLE, size: 4, color: "808080" };
const bordes = { top: borde, bottom: borde, left: borde, right: borde };

// ------------------------------------------------------------ piezas

function trozos(segs, base = {}) {
  const lista = Array.isArray(segs) ? segs : [segs];
  return lista.map(s => {
    if (typeof s === "string") return run(s, base);
    if (s.b != null) return run(s.b, { ...base, bold: true });
    if (s.i != null) return run(s.i, { ...base, italics: true });
    if (s.pend != null) return run(s.pend, { ...base, pendiente: true });
    throw new Error("Trozo de texto desconocido: " + JSON.stringify(s));
  });
}
function run(text, o = {}) {
  return new TextRun({ text, font: FUENTE, size: o.size || 21, bold: o.bold, italics: o.italics,
    highlight: o.pendiente ? "yellow" : undefined });
}
function par(segs, o = {}) {
  return new Paragraph({ children: trozos(segs, o), alignment: o.align,
    spacing: { after: o.after ?? 100, before: o.before ?? 0 },
    numbering: o.vineta ? { reference: "vinetas", level: 0 } : undefined });
}
// Un bloque del JSON: {"p": trozos} es un párrafo, {"vi": trozos} una viñeta.
function bloque(b) {
  if (b.p) return par(b.p);
  if (b.vi) return par(b.vi, { vineta: true, after: 60 });
  throw new Error("Bloque desconocido: " + JSON.stringify(b));
}

function celda(children, ancho, o = {}) {
  return new TableCell({ children, borders: bordes, width: { size: ancho, type: WidthType.DXA },
    shading: o.fondo ? { fill: o.fondo, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 }, verticalAlign: o.v || VerticalAlign.TOP });
}
// Cada pregunta de la guía: un cuadro con la pregunta arriba (sombreada) y la respuesta abajo.
function pregunta(titulo, contenido) {
  return [new Table({ width: { size: ANCHO, type: WidthType.DXA }, columnWidths: [ANCHO], rows: [
    new TableRow({ children: [celda([par([{ b: titulo }], { align: AlignmentType.CENTER, after: 0 })], ANCHO, { fondo: GRIS })] }),
    new TableRow({ children: [celda(contenido.length ? contenido : [par("")], ANCHO)] }),
  ] }), par("", { after: 160 })];
}
// Anchos relativos (pesos) → DXA que suman exactamente `total`.
function anchos(pesos, total) {
  const suma = pesos.reduce((a, b) => a + b, 0);
  const out = pesos.map(p => Math.floor(p * total / suma));
  out[out.length - 1] += total - out.reduce((a, b) => a + b, 0);
  return out;
}
function tabla(cols, encabezado, filas, o = {}) {
  const fila = (cs, enc) => new TableRow({ tableHeader: enc, children: cs.map((c, i) => celda(
    [par([String(c ?? "")], { size: o.size || 19, bold: enc, after: 0, align: enc ? AlignmentType.CENTER : undefined })],
    cols[i], { fondo: enc ? GRIS : undefined, v: VerticalAlign.CENTER })) });
  return new Table({ width: { size: cols.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: cols,
    rows: [...(encabezado ? [fila(encabezado, true)] : []), ...filas.map(f => fila(f, false))] });
}
// Una lista larga de nombres en tres columnas, numerada de arriba abajo.
function enColumnas(items, total, o = {}) {
  const alto = Math.ceil(items.length / 3);
  const filas = [];
  for (let i = 0; i < alto; i++) filas.push([0, 1, 2].map(k => items[i + k * alto] ?? ""));
  return tabla(anchos([1, 1, 1], total), null, filas, o);
}

// El tamaño de la foto en el Word: cabe en la mitad del ancho y no pasa de 8 cm de alto.
function medidaJpeg(buf) {
  for (let i = 2; i < buf.length;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1], largo = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
      return { alto: buf.readUInt16BE(i + 5), ancho: buf.readUInt16BE(i + 7) };
    i += 2 + largo;
  }
  throw new Error("No se pudo leer el tamaño de la foto (¿es JPEG?)");
}
function foto(archivo, base) {
  const ruta = path.resolve(base, archivo);
  const buf = fs.readFileSync(ruta);
  const ext = path.extname(ruta).toLowerCase();
  let ancho, alto, type;
  if (ext === ".png") { type = "png"; ancho = buf.readUInt32BE(16); alto = buf.readUInt32BE(20); }
  else { type = "jpg"; ({ ancho, alto } = medidaJpeg(buf)); }
  const MAX_AN = 290, MAX_AL = 300; // píxeles a 96 ppp (~7,7 × 8 cm)
  const k = Math.min(MAX_AN / ancho, MAX_AL / alto);
  return new ImageRun({ type, data: buf, transformation: { width: Math.round(ancho * k), height: Math.round(alto * k) } });
}

// ------------------------------------------------------------ documento

function armar(d, base) {
  const centro = (text, o = {}) => par([{ b: text }], { align: AlignmentType.CENTER, after: o.after ?? 40, size: o.size || 22 });
  const lista = (bs) => (bs || []).map(bloque);
  const nota = (texto, size = 18) => par([{ i: texto }], { size, before: 80 });

  const atletas = d.atletas.map((n, i) => `${i + 1}. ${n}`);
  const cuerpo = [
    centro(`Formulario de evaluación del período: ${d.periodo}`, { size: 20, after: 200 }),
    centro("COMITÉ CANTONAL DE DEPORTE Y RECREACIÓN DE SAN JOSÉ", { size: 24 }),
    centro("COORDINACIÓN TÉCNICA METODOLÓGICA"),
    centro("DIRECCIÓN DEPORTIVA"),
    centro(`INFORME TÉCNICO MENSUAL ${d.anio}`, { after: 240 }),
    tabla(anchos([3000, 6360], ANCHO), null, [
      ["Mes:", d.mes], ["Deporte:", d.deporte || "Ajedrez"],
      ["Nombre del entrenador:", d.entrenador], ["Nombre del asistente:", d.asistente],
    ], { size: 21 }),
    par("", { after: 200 }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 200 },
      children: [new TextRun({ text: "INFORME TÉCNICO", font: FUENTE, size: 28, bold: true, color: "000000" })] }),

    ...pregunta("Indique los nombres de los atletas que está entrenando", [
      par(`${d.grupo || "Grupo de ajedrez del CCDR San José"}: ${d.atletas.length} atletas inscritos.`),
      enColumnas(atletas, INTERIOR, { size: 18 }),
    ]),

    ...pregunta("Lugar y horarios de entrenamientos realizados", [
      ...lista(d.lugar.bloques),
      ...(d.lugar.sesiones?.length ? [tabla(anchos([1100, 1950, 1450, 3720, 900], INTERIOR),
        ["Fecha", "Lugar", "Horario", "Sesión", "Asist."], d.lugar.sesiones)] : []),
      ...(d.lugar.nota ? [nota(d.lugar.nota)] : []),
    ]),

    ...pregunta("Durante el último mes, ¿en qué etapa del macrociclo se encuentra? Indique qué aspectos de la preparación (física, técnica, táctica, psicológica y otras) se han trabajado durante el período.",
      lista(d.macrociclo)),

    ...pregunta("Indique las pruebas, test pedagógicos, chequeos o controles técnicos realizados, y haga un breve análisis.", [
      ...lista(d.pruebas.bloques),
      ...(d.pruebas.resultados?.length ? [par("", { after: 60 }),
        tabla(anchos([2000, 1200, 2500, 1760, 1660], INTERIOR),
          ["Evento", "Sede", "Atleta o equipo", "Prueba / División", "Resultado (lugar – marca)"], d.pruebas.resultados, { size: 17 })] : []),
      ...(d.pruebas.nota ? [nota(d.pruebas.nota, 17)] : []),
    ]),

    ...pregunta("Indique si alguno de sus dirigidos ha sufrido lesiones o presentado problemas médicos durante el último mes. De ser así, ¿cuál fue el diagnóstico, tratamiento y proceso de rehabilitación?",
      lista(d.lesiones)),
    ...pregunta("¿Cuál es el análisis de la forma deportiva actual de los atletas en comparación con los objetivos generales y específicos propuestos para la etapa de preparación correspondiente y para el plan general de entrenamiento?",
      lista(d.forma)),
    ...pregunta("Requerimientos y necesidades para el próximo mes.", lista(d.requerimientos)),
    ...pregunta("Otros aspectos que considere de interés", lista(d.otros)),

    par("", { before: 600, after: 0 }),
    par("________________________________", { align: AlignmentType.CENTER, after: 0 }),
    par([{ b: "Firma del entrenador" }], { align: AlignmentType.CENTER, after: 0 }),
    par(d.entrenador, { align: AlignmentType.CENTER }),
  ];

  const a = d.anexoAsistencia;
  if (a) {
    cuerpo.push(new Paragraph({ children: [new PageBreak()] }),
      centro("ANEXO 1: ASISTENCIA A LAS SESIONES VIRTUALES", { size: 24, after: 160 }));
    if (a.meet?.length) {
      cuerpo.push(par([{ i: "Sesiones por Google Meet. Los nombres son los de la cuenta con que cada persona se conectó; en «Otras cuentas» van las de familiares o las que no se pudieron identificar con un atleta. No se cuenta al cuerpo técnico." }], { size: 19 }),
        tabla(anchos([1150, 6360, 1000, 850], ANCHO), ["Fecha", "Atletas conectados", "Otras cuentas", "Total"],
          a.meet.map(([f, at, otras = []]) => [f,
            at.join(", ") + (otras.length ? ". Otras cuentas: " + otras.join(", ") : "") + ".",
            String(otras.length), String(at.length + otras.length)]), { size: 17 }),
        par("", { after: 120 }));
    }
    if (a.plataforma?.length) {
      cuerpo.push(par([{ i: a.plataformaTexto || "Clases en vivo en la plataforma Ajedrez Integral: atletas y número de clases a las que asistieron en el mes." }], { size: 19 }),
        enColumnas(a.plataforma.map(([n, k]) => `${n} (${k})`), ANCHO, { size: 17 }));
    }
  }

  if (d.fotos?.length) {
    cuerpo.push(new Paragraph({ children: [new PageBreak()] }),
      centro(`ANEXO ${a ? 2 : 1}: REGISTRO FOTOGRÁFICO`, { size: 24, after: 160 }));
    const filas = [];
    for (let i = 0; i < d.fotos.length; i += 2) {
      const par2 = [d.fotos[i], d.fotos[i + 1]];
      filas.push(new TableRow({ cantSplit: true, children: par2.map(f => celda(f ? [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [foto(f.archivo, base)] }),
        par([{ b: f.pie }], { align: AlignmentType.CENTER, size: 18, after: 0 }),
      ] : [par("")], ANCHO / 2, { v: VerticalAlign.CENTER })) }));
    }
    cuerpo.push(new Table({ width: { size: ANCHO, type: WidthType.DXA }, columnWidths: [ANCHO / 2, ANCHO / 2], rows: filas }));
  }

  return new Document({
    styles: { default: { document: { run: { font: FUENTE, size: 21 } } } },
    numbering: { config: [{ reference: "vinetas", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•",
      alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }] }] },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 },
      margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children: cuerpo }],
  });
}

module.exports = { armar };

if (require.main === module) {
  const [entrada, salida] = process.argv.slice(2);
  if (!entrada || !salida) {
    console.error("Uso: node herramientas/informe-ccdr.js <datos-del-mes.json> <salida.docx>");
    process.exit(1);
  }
  const datos = JSON.parse(fs.readFileSync(entrada, "utf8"));
  Packer.toBuffer(armar(datos, path.dirname(path.resolve(entrada)))).then(b => {
    fs.writeFileSync(salida, b);
    console.log(`Listo: ${salida}`);
  });
}
