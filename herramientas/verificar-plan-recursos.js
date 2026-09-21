/* Comprueba los `recursos` de las nueve áreas de js/plan-entrenamiento.js.
 *
 * Existe porque todo lo que se rompe acá se rompe CALLADO, y lo descubre el
 * alumno, que es el único que no puede arreglarlo:
 *
 *  - un `?tema=` con una clave que ya no está en el banco abre la lista vacía:
 *    ni error, ni aviso, ni ejercicios;
 *  - un archivo renombrado deja un 404 al que el plan sigue mandando;
 *  - y un área sin un solo recurso donde el trabajo CUENTE deja el primer paso
 *    del panel mandando a leer un temario, así que no se apaga nunca y al día
 *    siguiente le dice al alumno exactamente lo mismo.
 *
 * Las claves NO se escriben acá: salen de entreno/data/metas.json, que genera
 * herramientas/metas-indice.py leyendo los bancos de verdad. Comprobar el plan
 * contra una copia de la lista no comprobaría nada.
 *
 *   node herramientas/verificar-plan-recursos.js
 *
 * No necesita navegador, ni red, ni el sitio servido.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");

function cargar(archivo) {
  const g = { window: {} };
  new Function("window", fs.readFileSync(path.join(RAIZ, archivo), "utf8"))(g.window);
  return g.window;
}

const PE = cargar("js/plan-entrenamiento.js").PlanEntrenamiento;
const MP = cargar("js/material-plataforma.js").MaterialPlataforma;
const METAS = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/metas.json"), "utf8"));

/* Con qué parámetro recorta cada página NO se escribe acá: se le pregunta a su
   propio `hrefRecorte`, que es la función que arma el enlace de una tarea. Una
   tabla copiada se separaría de ella a la primera corrección, y el día que el
   parámetro cambiara esta comprobación seguiría dando verde sobre enlaces
   rotos. Solo cuatro herramientas saben recortar; las demás abren su página
   entera y punto. */
function parametroDe(h) {
  if (!h || typeof h.hrefRecorte !== "function") return null;
  const m = /\?([^=]+)=/.exec(h.hrefRecorte("x"));
  return m ? m[1] : null;
}

let fallos = 0;
function mal(t) { console.log("  ✗ " + t); fallos += 1; }
function bien(t) { console.log("  ✓ " + t); }

console.log("=== Cada enlace del plan lleva a algo que existe ===");

let enlaces = 0, conRecorte = 0;
for (const area of PE.AREAS) {
  const vistos = new Set();
  for (const r of area.recursos || []) {
    enlaces += 1;
    if (!r.texto || !r.texto.trim()) mal(`${area.id}: un recurso sin texto (${r.href})`);
    if (vistos.has(r.href)) mal(`${area.id}: «${r.href}» está dos veces`);
    vistos.add(r.href);

    const [pagina, query] = r.href.split("?");
    if (!fs.existsSync(path.join(RAIZ, pagina))) {
      mal(`${area.id}: «${pagina}» no existe (${r.texto})`);
      continue;
    }
    if (!query) continue;
    conRecorte += 1;

    // El recorte tiene que existir en el banco de esa página.
    const h = MP.HERRAMIENTAS.find((t) => t.href === pagina);
    const esperado = parametroDe(h);
    if (!esperado) {
      mal(`${area.id}: «${pagina}» no sabe recortar y el plan le manda «${query}»`);
      continue;
    }
    const [param, clave] = query.split("=");
    if (param !== esperado) {
      mal(`${area.id}: «${pagina}» recorta con ?${esperado}=, no con ?${param}= (${r.texto})`);
      continue;
    }
    const banco = METAS[h.recortes] || [];
    if (!banco.some((x) => x.clave === decodeURIComponent(clave))) {
      mal(`${area.id}: «${clave}» no está entre los ${banco.length} recortes de ${h.label} — el alumno abriría una lista vacía`);
    }
  }
}
if (!fallos) bien(`los ${enlaces} enlaces del plan existen, ${conRecorte} de ellos con su recorte comprobado contra el banco`);

/* La regla que sostiene el primer paso del panel: si el área más floja no tiene
   dónde practicar, el panel se baja a la siguiente — pero si NINGUNA la tuviera,
   caería siempre al genérico y el paso dejaría de ser específico sin que nada
   falle. Se exige área por área. */
console.log("\n=== Cada área ofrece algo que HACER, no solo que leer ===");
for (const area of PE.AREAS) {
  const hace = (area.recursos || []).find((r) => {
    const h = MP.HERRAMIENTAS.find((t) => t.href === r.href.split("?")[0]);
    return h && (h.metas || []).includes("cantidad");
  });
  if (hace) bien(`${area.nombre}: ${hace.texto}`);
  else mal(`${area.nombre} no tiene ni un recurso donde el trabajo cuente: el primer paso del panel mandaría a leer un temario y no se apagaría nunca`);
}

/* Lo que se le ofrece PRIMERO a quien acaba de rendir el diagnóstico es el
   primer recurso que cuenta, así que ese es el que más tiene que valer la pena:
   uno sin recorte manda a la lista entera y le deja al alumno el trabajo de
   buscar, que es justo lo que el paso viene a evitar. Es un aviso y no un
   fallo: solo cuatro páginas saben recortar, y hay áreas cuyo mejor primer paso
   es una que no (4×4, Visualización, Coordenadas, Aprender). */
console.log("\n=== Y el primero que cuenta lleva su recorte, cuando la página los tiene ===");
for (const area of PE.AREAS) {
  const r = (area.recursos || []).find((x) => {
    const h = MP.HERRAMIENTAS.find((t) => t.href === x.href.split("?")[0]);
    return h && (h.metas || []).includes("cantidad");
  });
  if (!r) continue;
  const h = MP.HERRAMIENTAS.find((t) => t.href === r.href.split("?")[0]);
  if (parametroDe(h) && !r.href.includes("?")) {
    console.log(`  · ${area.nombre}: «${r.texto}» abre ${h.label} entero, pudiendo recortar`);
  } else {
    bien(`${area.nombre}: ${r.href}`);
  }
}

console.log(fallos
  ? `\n${fallos} fallo(s)`
  : "\nEl plan manda a material que existe, y cada área tiene dónde practicar.");
process.exit(fallos ? 1 : 0);
