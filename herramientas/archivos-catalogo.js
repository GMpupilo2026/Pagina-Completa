#!/usr/bin/env node
/* Arma data/archivos.json: la lista de TODOS los PDF, Word, Excel y
 * presentaciones del sitio, ordenada para la sección «Archivos» de admin.html (la pinta
 * js/admin-archivos.js, una ficha por tipo).
 *
 * La lista no se escribe a mano: se lee del disco. Un archivo nuevo (un curso,
 * un libro de material/, un formulario en documentos/) entra al volver a
 * correr esto, y si alguien se olvida, verificar-archivos-catalogo.js falla en
 * el CI y dice cuál falta. Así ninguno queda fuera sin que se note.
 *
 * Cómo se ordenan los PDF:
 *   - Libros y material (material/<carpeta>/): el título sale de TITULOS; uno
 *     nuevo sin título usa el nombre del archivo.
 *   - Cursos (cursos/recursos/<curso>/): en el orden y con el nombre del
 *     catálogo (herramientas/cursos/catalogo.json). Dentro, por lección: el
 *     nombre de cada lección y qué PDF lleva se leen de su página
 *     (cursos/protegido/<curso>.html, un <details> por lección). Lo que la
 *     página no enlaza va en «Otros archivos del curso».
 *   - Sueltos: los PDF fuera de esas dos carpetas (hoy, la raíz).
 * Las presentaciones (.pptx) se ordenan igual que los PDF. Los Word y los
 * Excel van por carpeta (el nombre, de CARPETAS).
 *
 *   node herramientas/archivos-catalogo.js   escribe data/archivos.json
 */
"use strict";

const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const SALIDA = path.join(RAIZ, "data", "archivos.json");

// Las fichas de la sección: qué extensiones van en cada una.
const TIPOS = {
  pdf: /\.pdf$/i,
  word: /\.(docx?|odt)$/i,
  excel: /\.(xlsx|xlsm|xls|ods)$/i,
  presentaciones: /\.(pptx?|odp)$/i,
};

// Lo que no se publica (.assetsignore) ni es del sitio: ahí no se busca.
const NO_MIRAR = new Set([".git", ".github", "node_modules", "herramientas", "docs", "supabase",
  "respaldos", "promo", ".wrangler"]);

/* El nombre de cada libro de material/ (y de los PDF sueltos), por archivo. Uno nuevo sin entrada
   aparece igual, con el nombre sacado del archivo; conviene sumarlo acá. */
const TITULOS = {
  "material/ponte-a-prueba/ponte-a-prueba.pdf": "Ponte a prueba — examen y guía de entrenamiento",
  "material/mide-tu-fuerza/mide-tu-fuerza.pdf": "Mide tu fuerza — banco de ejercicios tácticos",
  "material/tipos-de-mate/tipos-de-mate.pdf": "Los tipos de mate — cuaderno de ejercicios",
  "material/diagnostico-de-nivel/diagnostico-de-nivel.pdf": "Diagnóstico de nivel — la prueba",
  "material/libro-de-diagnostico/libro-de-diagnostico.pdf": "Libro del diagnóstico de nivel — banco de preguntas",
  "material/examen-de-arbitraje/examen-de-arbitraje.pdf": "Examen de arbitraje — banco de preguntas",
  "material/fichas-de-estudio/fichas-de-estudio-libro.pdf": "Fichas de estudio — libro",
  "material/fichas-de-estudio/fichas-de-estudio-cartas.pdf": "Fichas de estudio — cartas para recortar",
  "material/guia-del-profesor/guia-del-profesor.pdf": "Guía del profesor — manual",
  "material/guia-del-profesor/guia-del-profesor-presentacion.pdf": "Guía del profesor — presentación",
  "cursos/recursos/formacion-ajedrez/08-prueba-final.pdf": "Prueba final teórica",
  "cursos/recursos/formacion-ajedrez/08-torneo-real-evaluacion-formularios.pdf": "Formularios y lista de cotejo del torneo",
  "instrucciones-adaptadas.pdf": "Instrucciones adaptadas (para quien ve poco o no ve)",
  "documentos/jdn/consentimiento-jdn-2027.docx": "Consentimiento informado JDN 2027 — atleta",
  "documentos/jdn/consentimiento-entrenador-jdn-2027.docx": "Consentimiento informado JDN 2027 — entrenador",
};

/* Los nombres que siguen un patrón (muchos archivos de una misma serie). */
const PATRONES = [
  [/^material\/ponte-a-prueba\/versiones\/prueba-(\d+)-version-([a-z])\.pdf$/,
    (m) => `Prueba ${m[1]}, versión ${m[2].toUpperCase()} (cuadernillo para imprimir)`],
  [/^material\/ponte-a-prueba\/versiones\/claves-de-correccion\.pdf$/,
    () => "Claves de corrección de las 18 versiones (para el profe)"],
];

/* El nombre de cada libro de material/ (su carpeta): los PDF de «Libros y
   material» se agrupan por libro. Uno nuevo sin entrada usa el de la carpeta. */
const LIBROS = {
  "ponte-a-prueba": "Ponte a prueba",
  "mide-tu-fuerza": "Mide tu fuerza",
  "tipos-de-mate": "Los tipos de mate",
  "diagnostico-de-nivel": "Diagnóstico de nivel",
  "libro-de-diagnostico": "Libro del diagnóstico de nivel",
  "examen-de-arbitraje": "Examen de arbitraje",
  "fichas-de-estudio": "Fichas de estudio",
  "guia-del-profesor": "Guía del profesor",
};

function tituloDe(ruta) {
  if (TITULOS[ruta]) return TITULOS[ruta];
  for (const [re, f] of PATRONES) { const m = ruta.match(re); if (m) return f(m); }
  return nombreDelArchivo(ruta);
}

/* El nombre de cada carpeta, para los Word y los Excel. Una nueva sin entrada
   aparece con el nombre de la carpeta. */
const CARPETAS = {
  "documentos/jdn": "Juegos Deportivos Nacionales 2027",
  ".": "En la raíz del sitio",
};

function buscar(dir, rel, salida, re) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") && e.name !== ".") continue;
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) {
      if (!rel && NO_MIRAR.has(e.name)) continue;
      buscar(path.join(dir, e.name), r, salida, re);
    } else if (re.test(e.name)) {
      salida.push(r);
    }
  }
  return salida;
}

// «01-apertura-espanola-material.pdf» → «Apertura espanola». Solo para lo que
// no tiene nombre en ningún lado: no sabe de tildes.
function nombreDelArchivo(archivo) {
  const t = path.basename(archivo).replace(/\.[a-z0-9]+$/i, "").replace(/^\d+-/, "")
    .replace(/-(material|ejercicios)$/, "").replace(/-/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function tipoDe(archivo) {
  if (/-material\.pdf$/i.test(archivo)) return "material";
  if (/-ejercicios\.pdf$/i.test(archivo)) return "ejercicios";
  if (TIPOS.presentaciones.test(archivo)) return "presentacion";
  return "otro";
}

const kb = (rel) => Math.max(1, Math.round(fs.statSync(path.join(RAIZ, rel)).size / 1024));

function textoPlano(html) {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

/* Las lecciones de un curso, leídas de su página, con los archivos de un tipo
   que enlaza cada una: [{ numero, titulo, pdfs }]. */
function leccionesDe(slug, tipo) {
  const pagina = path.join(RAIZ, "cursos", "protegido", slug + ".html");
  if (!fs.existsSync(pagina)) return [];
  const html = fs.readFileSync(pagina, "utf8");
  // Cada lección abre con un <summary class="cursor-pointer…">; adentro hay
  // otros <details> (las soluciones) con un <summary> pelado, que no cortan.
  const trozos = html.split(/(?=<summary class="cursor-pointer)/).slice(1);
  const lecciones = [];
  for (const t of trozos) {
    const s = t.match(/^<summary[^>]*>([\s\S]*?)<\/summary>/);
    if (!s) continue;
    const pdfs = [];
    const re = /href="(?:\.\.\/)?(recursos\/[^"]+?)"/gi;
    let m;
    while ((m = re.exec(t))) {
      if (!TIPOS[tipo].test(m[1])) continue;
      const ruta = "cursos/" + m[1];
      if (!pdfs.includes(ruta)) pdfs.push(ruta);
    }
    if (!pdfs.length) continue;
    const resumen = textoPlano(s[1]);
    const n = resumen.match(/^(\d+)\.\s*(.*)$/);
    lecciones.push({ numero: n ? Number(n[1]) : null, titulo: n ? n[2] : resumen, pdfs });
  }
  return lecciones;
}

const enDisco = (tipo) => buscar(RAIZ, "", [], TIPOS[tipo]).sort((a, b) => a.localeCompare(b, "es"));

/* Los PDF y las presentaciones: muchos y de los cursos, así que van ordenados
   (libros y material, cursos por lección, sueltos). */
const NOMBRE_EN_LECCION = { material: "Material de estudio", ejercicios: "Ejercicios", presentacion: "Presentación" };

function armarOrdenado(tipo) {
  const todos = enDisco(tipo);
  const catalogo = JSON.parse(fs.readFileSync(path.join(RAIZ, "herramientas", "cursos", "catalogo.json"), "utf8"));
  const usados = new Set();
  const archivo = (ruta, titulo) => {
    usados.add(ruta);
    return { ruta, titulo: titulo || tituloDe(ruta), tipo: tipoDe(ruta), kb: kb(ruta) };
  };

  // Libros y material, con el libro al que pertenece cada uno.
  const material = todos.filter((r) => r.startsWith("material/")).map((r) => {
    const carpeta = r.split("/")[1];
    return Object.assign(archivo(r), { libro: LIBROS[carpeta] || nombreDelArchivo(carpeta) });
  });

  // Cursos: los del catálogo en su orden; una carpeta que no esté en el
  // catálogo va al final con el nombre de la carpeta.
  const carpetas = [...new Set(todos.filter((r) => r.startsWith("cursos/recursos/"))
    .map((r) => r.split("/")[2]))];
  const orden = catalogo.cursos.map((c) => c.slug);
  carpetas.sort((a, b) => {
    const ia = orden.indexOf(a), ib = orden.indexOf(b);
    return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib) || a.localeCompare(b);
  });
  const cursos = carpetas.map((slug) => {
    const info = catalogo.cursos.find((c) => c.slug === slug) || {};
    const delCurso = new Set(todos.filter((r) => r.startsWith("cursos/recursos/" + slug + "/")));
    const lecciones = leccionesDe(slug, tipo).map((l) => ({
      numero: l.numero,
      titulo: l.titulo,
      // Solo lo que existe: un enlace roto de la página no se ofrece.
      archivos: l.pdfs.filter((r) => delCurso.has(r) && !usados.has(r))
        .map((r) => archivo(r, NOMBRE_EN_LECCION[tipoDe(r)])),
    })).filter((l) => l.archivos.length);
    const otros = [...delCurso].filter((r) => !usados.has(r)).map((r) => archivo(r));
    return { slug, titulo: info.titulo || nombreDelArchivo(slug), nivel: info.nivel || null, lecciones, otros };
  });

  const sueltos = todos.filter((r) => !usados.has(r)).map((r) => archivo(r));

  return {
    niveles: catalogo.niveles.map((n) => ({ id: n.id, nombre: n.nombre })),
    total: todos.length,
    material,
    cursos,
    sueltos,
  };
}

/* Los Word y los Excel: pocos y sueltos, así que van por carpeta. */
function armarPorCarpeta(tipo) {
  const todos = enDisco(tipo);
  const carpetas = [...new Set(todos.map((r) => path.posix.dirname(r)))];
  return {
    total: todos.length,
    grupos: carpetas.map((c) => ({
      carpeta: c,
      titulo: CARPETAS[c] || nombreDelArchivo(c.split("/").pop()),
      archivos: todos.filter((r) => path.posix.dirname(r) === c).map((ruta) => ({
        ruta, titulo: tituloDe(ruta), tipo: "otro", kb: kb(ruta),
      })),
    })),
  };
}

function armar() {
  return {
    _comentario: "Lo genera herramientas/archivos-catalogo.js. No se edita a mano.",
    pdf: armarOrdenado("pdf"),
    word: armarPorCarpeta("word"),
    excel: armarPorCarpeta("excel"),
    presentaciones: armarOrdenado("presentaciones"),
  };
}

function texto() {
  return JSON.stringify(armar(), null, 1) + "\n";
}

if (require.main === module) {
  fs.writeFileSync(SALIDA, texto());
  const d = armar();
  console.log(`data/archivos.json: ${d.pdf.total} PDF (${d.pdf.material.length} de material, `
    + `${d.pdf.cursos.length} cursos, ${d.pdf.sueltos.length} sueltos), ${d.word.total} Word, ${d.excel.total} Excel, `
    + `${d.presentaciones.total} presentaciones.`);
}

module.exports = { armar, texto, enDisco, TIPOS, SALIDA, RAIZ };
