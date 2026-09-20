/* Catálogo de material asignable desde el área de Tareas (tareas.html): de
 * qué puede elegir un profesor para mandarle a un alumno.
 *
 * Los CURSOS se leen de herramientas/cursos/catalogo.json en tiempo real —la
 * misma fuente que arma las tarjetas de cursos.html— en vez de copiarlos acá:
 * una segunda lista se iría separando de la primera a la primera corrección
 * (agregar un curso, cambiarle el título). El enlace apunta a
 * cursos/academia/<slug>.html, que es el espejo del curso dentro de la
 * Academia.
 *
 * Las HERRAMIENTAS de entrenamiento sí están escritas a mano: son las mismas
 * ocho fichas de entreno/index.html más los dos diagnósticos de
 * clases.html — cambian poco y no tienen un JSON propio del que leerlas.
 */
window.MaterialPlataforma = (function () {
  const HERRAMIENTAS = [
    { slug: "mates", label: "Mates", href: "entreno/mates.html" },
    { slug: "aprender", label: "Aprender", href: "entreno/aprender.html" },
    { slug: "coordenadas", label: "Coordenadas", href: "entreno/coordenadas.html" },
    { slug: "desafios", label: "Desafíos", href: "entreno/desafios.html" },
    { slug: "temas", label: "Ejercicios por tema", href: "entreno/temas.html" },
    { slug: "practicas", label: "Practicar", href: "entreno/practicas.html" },
    { slug: "aperturas", label: "Aperturas y celadas", href: "entreno/aperturas.html" },
    { slug: "estudio", label: "Estudio", href: "entreno/estudio.html" },
    { slug: "fichas", label: "Fichas", href: "entreno/fichas.html" },
    { slug: "4x4", label: "4×4", href: "entreno/4x4.html" },
    { slug: "diagnostico", label: "Diagnóstico de nivel", href: "entreno/diagnostico.html" },
    { slug: "arbitraje", label: "Diagnóstico de arbitraje", href: "nivel-de-arbitraje.html" },
  ];

  let cursosCache = null;

  async function cursos() {
    if (cursosCache) return cursosCache;
    try {
      const r = await fetch("herramientas/cursos/catalogo.json");
      const d = await r.json();
      cursosCache = (d.cursos || []).map((c) => ({
        slug: c.slug,
        label: c.titulo,
        href: `cursos/academia/${c.slug}.html`,
        lecciones: c.lecciones,
      }));
    } catch (e) {
      cursosCache = [];
    }
    return cursosCache;
  }

  return { HERRAMIENTAS, cursos };
})();
