/* Catálogo de la tienda de materiales (tienda.html).
 *
 * Es la ÚNICA fuente: la página no tiene ni un producto escrito a mano. Antes
 * de existir este archivo la tentación era pegar la misma tarjeta veinte
 * veces —que es exactamente como terminaron las diez tarjetas de cursos.html
 * antes de herramientas/cursos/catalogo.json—, y ahí cambiar el diseño son
 * veinte ediciones y es cuestión de tiempo que una quede distinta.
 *
 * Tres listas y un precio, y ninguna cuenta se hace dos veces:
 *
 *   PRECIO     lo que vale CADA material. Está escrito UNA vez: la ficha, el
 *              resumen del carrito y el mensaje de WhatsApp lo leen de acá.
 *              Un precio escrito dos veces se separa a la primera corrección
 *              y el fallo lo descubre quien ya pagó otra cosa.
 *   PRODUCTOS  qué se vende. Cada uno apunta a ARCHIVOS QUE EXISTEN y dice
 *              cuántas piezas trae.
 *   MODULOS    cómo se PRESENTA el sistema completo (los seis del anuncio).
 *              Un módulo no es un producto: es un grupo de productos, y por
 *              eso solo guarda sus ids.
 *   BONOS      lo que se suma al sistema completo y no se vende suelto.
 *
 * LO QUE SE ROMPE CALLADO ACÁ, y por lo que existe verificar-tienda.js:
 *
 *  - Un producto que apunta a una carpeta o a un archivo que ya no está. La
 *    ficha se pinta igual de bien, se cobra igual de bien, y el que se entera
 *    es quien pagó y no recibe nada.
 *  - Un número inventado ("27 cuadernillos" donde hay 24). Nadie los cuenta:
 *    se leen, se creen, y al abrir la carpeta falta material que se prometió.
 *    Por eso `piezas` se compara contra el disco, no se escribe a ojo — la
 *    misma regla que el resultado de cada posición de un curso, que se
 *    verifica con motor.
 *  - Un curso que queda fuera de los seis módulos, o metido en dos. Fuera, se
 *    vende dentro del "sistema completo" algo que el sistema no entrega;
 *    metido en dos, se cobra lo mismo dos veces. Las dos cosas se ven
 *    perfectas en pantalla.
 */
window.TiendaCatalogo = (function () {
  "use strict";

  /* Lo que vale cada material. Decisión del dueño del sitio, no una cuenta:
     por eso es un número escrito y no algo que salga de la cantidad de
     páginas o de lecciones. */
  const PRECIO = 5000;
  const MONEDA = "₡";

  /* El sistema completo NO es la suma de sus partes, y tampoco un número
     suelto: es la suma con un descuento, y las dos cifras se calculan abajo a
     partir de PRODUCTOS. Escribir "₡60.000 en vez de ₡90.000" a mano deja las
     dos mintiendo en cuanto se suma un material más. */
  const DESCUENTO_PACK = 0.4;

  /* ======================= Los productos =======================
     `carpeta` / `archivos` son rutas de verdad dentro del repositorio, y el
     verificador las abre una por una. `piezas` es lo que la ficha promete, y
     también se comprueba contra el disco.

     `gancho` es la frase de venta —lo que el material le resuelve a quien lo
     compra— y `resumen` lo que es. Los dos hacen falta: un catálogo que solo
     dice qué es no vende nada, y uno que solo promete no se puede sostener. */
  const PRODUCTOS = [
    /* ---- Los doce cursos, cada uno con su material de clase ---- */
    {
      id: "fundamentos-del-ajedrez",
      categoria: "curso",
      emoji: "♟️",
      titulo: "Fundamentos del Ajedrez",
      nivel: "Principiante",
      gancho: "Tu primer trimestre, resuelto: doce clases listas para dar mañana.",
      resumen: "El tablero, la notación, el movimiento de cada pieza, el valor del material y los primeros mates. Es por donde entra todo alumno nuevo.",
      carpeta: "cursos/recursos/fundamentos-del-ajedrez",
      piezas: { cuadernillos: 12, ejercicios: 12, presentaciones: 12, accesibles: 12 },
    },
    {
      id: "aperturas-y-defensas",
      categoria: "curso",
      emoji: "🚪",
      titulo: "Aperturas y Defensas",
      nivel: "Intermedio",
      gancho: "Se acabó el «juega lo que sepas» en las primeras diez jugadas.",
      resumen: "Española, Italiana, Siciliana, Gambito de Dama y Defensa Francesa, cada una con su idea, su plan y sus partidas modelo.",
      carpeta: "cursos/recursos/aperturas-y-defensas",
      piezas: { cuadernillos: 16, ejercicios: 16, presentaciones: 16, accesibles: 16 },
    },
    {
      id: "calculo-y-visualizacion",
      categoria: "curso",
      emoji: "🧠",
      titulo: "Cálculo y Visualización",
      nivel: "Intermedio",
      gancho: "Para el alumno que ve la jugada y no ve la respuesta.",
      resumen: "Ver dos y tres jugadas adelante sin mover las piezas: candidatas, orden de cálculo y el hábito de mirar la respuesta del rival antes de decidir.",
      carpeta: "cursos/recursos/calculo-y-visualizacion",
      piezas: { cuadernillos: 10, ejercicios: 10, presentaciones: 10, accesibles: 10 },
    },
    {
      id: "finales-practicos",
      categoria: "curso",
      emoji: "🏁",
      titulo: "Finales Prácticos",
      nivel: "Intermedio",
      gancho: "Los finales que de verdad aparecen en el torneo del sábado.",
      resumen: "Rey y peón, torre contra peón, la oposición y la regla del cuadrado. Lo que decide media tabla de resultados y casi nadie estudia.",
      carpeta: "cursos/recursos/finales-practicos",
      piezas: { cuadernillos: 14, ejercicios: 14, presentaciones: 14, accesibles: 14 },
    },
    {
      id: "partidas-modelo",
      categoria: "curso",
      emoji: "📖",
      titulo: "Partidas modelo del ajedrez moderno",
      nivel: "Intermedio",
      gancho: "Treinta y tres clases donde la partida explica sola lo que quieres enseñar.",
      resumen: "Partidas comentadas jugada por jugada, de las que se abren en el tablero y se entienden sin que el profesor tenga que rellenar los huecos.",
      carpeta: "cursos/recursos/partidas-modelo",
      piezas: { cuadernillos: 33, ejercicios: 33, presentaciones: 30, accesibles: 33 },
    },
    {
      id: "estrategia-y-tactica",
      categoria: "curso",
      emoji: "🎯",
      titulo: "Estrategia y Táctica",
      nivel: "Avanzado",
      gancho: "Del golpe suelto al plan que lo prepara.",
      resumen: "Clavada, horquilla, enfilada y desviación por un lado; columnas, casillas débiles y estructura de peones por el otro — y cómo se sostienen entre sí.",
      carpeta: "cursos/recursos/estrategia-y-tactica",
      piezas: { cuadernillos: 20, ejercicios: 20, presentaciones: 20, accesibles: 20 },
    },
    {
      id: "el-mapa-de-los-finales",
      categoria: "curso",
      emoji: "🗺️",
      titulo: "El mapa de los finales",
      nivel: "Avanzado",
      gancho: "El curso más grande del catálogo, y el que más partidas salva.",
      resumen: "Los finales teóricos ordenados de menos a más, cada posición verificada con motor: Lucena, Philidor, el puente, la oposición lejana y el resto del mapa.",
      carpeta: "cursos/recursos/el-mapa-de-los-finales",
      piezas: { cuadernillos: 27, ejercicios: 26, presentaciones: 24, accesibles: 27 },
    },
    {
      id: "estrategia-en-el-final",
      categoria: "curso",
      emoji: "👑",
      titulo: "Estrategia en el final",
      nivel: "Avanzado",
      gancho: "Cuando quedan pocas piezas y hay que saber qué hacer, no qué mover.",
      resumen: "El rey activo, el peón pasado lejano, la torre detrás del peón y el zugzwang: las ideas que convierten una posición igual en un punto.",
      carpeta: "cursos/recursos/estrategia-en-el-final",
      piezas: { cuadernillos: 16, ejercicios: 16, presentaciones: 16, accesibles: 16 },
    },
    {
      id: "desequilibrios-de-material",
      categoria: "curso",
      emoji: "⚖️",
      titulo: "Desequilibrios de material",
      nivel: "Avanzado",
      gancho: "Torre por alfil y peón: ¿quién está mejor? Acá está la respuesta y el porqué.",
      resumen: "Calidad, pareja de alfiles, dama contra dos torres y las compensaciones que no se cuentan en puntos. Con la teoría y las posiciones para practicarla.",
      carpeta: "cursos/recursos/desequilibrios-de-material",
      piezas: { cuadernillos: 20, ejercicios: 20, presentaciones: 19, accesibles: 20 },
    },
    {
      id: "preparacion-para-torneos",
      categoria: "curso",
      emoji: "🏆",
      titulo: "Preparación para Torneos",
      nivel: "Competición",
      gancho: "Lo que hay que trabajar las tres semanas antes del torneo.",
      resumen: "Repertorio, control del reloj, qué comer, cómo se prepara al rival y qué hacer después de perder en la segunda ronda. La parte que no se enseña en el tablero.",
      carpeta: "cursos/recursos/preparacion-para-torneos",
      piezas: { cuadernillos: 18, ejercicios: 18, presentaciones: 18, accesibles: 18 },
    },
    {
      id: "formacion-ajedrez",
      categoria: "curso",
      emoji: "🎓",
      titulo: "Formación Ajedrez",
      nivel: "Formación docente",
      gancho: "Para quien quiere formar a quien va a dar la clase.",
      resumen: "Encuadre, reglas de competición, normativa, emparejamientos y un torneo real como evaluación. El curso con el que se arma un equipo docente.",
      carpeta: "cursos/recursos/formacion-ajedrez",
      piezas: { cuadernillos: 7, ejercicios: 7, presentaciones: 7, accesibles: 0 },
    },
    {
      id: "arbitro-nacional",
      categoria: "curso",
      emoji: "⚖️",
      titulo: "Árbitro Nacional",
      nivel: "Formación docente",
      gancho: "Diecisiete sesiones de reglamento con casos de verdad, no con teoría.",
      resumen: "Cuándo queda completada una jugada, qué obliga la pieza tocada, el reloj, los reclamos y las tablas — con los talleres para discutirlo en grupo.",
      carpeta: "cursos/recursos/arbitro-nacional",
      piezas: { cuadernillos: 0, ejercicios: 17, presentaciones: 17, accesibles: 0 },
    },

    /* ---- Los libros y las guías ---- */
    {
      id: "libro-de-diagnostico",
      categoria: "libro",
      emoji: "📕",
      titulo: "El libro del diagnóstico",
      nivel: "Todo el equipo docente",
      gancho: "301 preguntas con la respuesta marcada, el porqué y cómo se comprobó cada posición.",
      resumen: "El banco entero del diagnóstico de nivel, ordenado por sus nueve áreas y por escalón de dificultad, con índice, escala de niveles y hoja de respuestas. 82 páginas. Va con su versión accesible en HTML, que cuenta cada posición pieza por pieza.",
      archivos: ["libro-de-diagnostico.pdf", "libro-de-diagnostico-accesible.html"],
      piezas: { preguntas: 301, areas: 9, paginas: 82 },
    },
    {
      id: "diagnostico-de-nivel",
      categoria: "libro",
      emoji: "🧭",
      titulo: "Diagnóstico de nivel, en papel",
      nivel: "Todo el equipo docente",
      gancho: "Siéntalos a los veinte a la vez y sal de ahí sabiendo el nivel de cada uno.",
      resumen: "El cuadernillo para aplicar en el aula, con sus diagramas y su hoja de corrección: 63 preguntas por las nueve áreas, siete de cada una, con el mismo reparto de dificultad siempre — así dos diagnósticos del mismo alumno se comparan aunque las preguntas hayan sido otras. 27 páginas.",
      archivos: ["diagnostico-de-nivel.pdf"],
      piezas: { preguntas: 63, areas: 9, paginas: 27 },
    },
    {
      id: "examen-de-arbitraje",
      categoria: "libro",
      emoji: "📘",
      titulo: "El libro del examen de arbitraje",
      nivel: "Formación docente",
      gancho: "200 preguntas de reglamento, y cada respuesta cita su artículo del Handbook.",
      resumen: "Las ocho áreas del arbitraje —leyes, reloj, irregularidades, tablas, conducta, ritmos, competición y títulos—, veinticinco preguntas cada una y cinco en cada escalón de dificultad. Citado artículo por artículo: un árbitro no discute de memoria. 136 páginas.",
      archivos: ["examen-de-arbitraje.pdf"],
      piezas: { preguntas: 200, areas: 8, paginas: 136 },
    },
    {
      id: "guia-del-profesor",
      categoria: "libro",
      emoji: "📙",
      titulo: "Guía del profesor",
      nivel: "Todo el equipo docente",
      gancho: "El manual que deja a un entrenador nuevo dando clase la primera semana.",
      resumen: "Quince capítulos y 78 apartados, con capturas de cada pantalla: la clase en vivo, los planes, las tareas, los exámenes, los informes y lo que conviene no olvidar. Sale en tres formas del mismo contenido — manual A4 de 48 páginas, presentación de 120 láminas para capacitar, y página accesible que se lee sin ver la pantalla.",
      archivos: ["guia-del-profesor.pdf", "guia-del-profesor-presentacion.pdf", "guia-del-profesor-accesible.html"],
      piezas: { capitulos: 15, apartados: 78, laminas: 120 },
    },
    {
      id: "instrucciones-adaptadas",
      categoria: "libro",
      emoji: "👐",
      titulo: "Instrucciones adaptadas",
      nivel: "Todo el equipo docente",
      gancho: "Para el alumno que ve poco o no ve, y al que nadie le preparó nada.",
      resumen: "Cómo se recorre la plataforma con lector de pantalla, cómo se canta una posición en palabras y cómo se contesta una jugada escribiéndola en vez de arrastrarla. 11 páginas que se mandan por correo a la casa.",
      archivos: ["instrucciones-adaptadas.pdf"],
      piezas: { paginas: 11 },
    },
  ];

  /* ======================= Los seis módulos =======================
     Es la presentación del sistema completo, no otra lista de material: cada
     módulo solo guarda los ids de los productos que ya están arriba. Así el
     anuncio no puede prometer un curso que el catálogo no tiene.

     Todo producto va en UNO y solo uno. Dejar uno fuera vende un sistema que
     no entrega lo que enseña; ponerlo en dos lo cobra dos veces. Las dos
     cosas se ven perfectas, así que las comprueba el verificador. */
  const MODULOS = [
    {
      numero: 1,
      titulo: "Biblioteca completa de lecciones",
      promesa: "Planes listos para todos los niveles",
      detalle: "Por donde entra cada alumno nuevo, con la clase escrita, sus ejercicios y su presentación.",
      productos: ["fundamentos-del-ajedrez"],
    },
    {
      numero: 2,
      titulo: "Entrenamiento de táctica y cálculo",
      promesa: "Táctica paso a paso, para mejorar de verdad",
      detalle: "El golpe, el plan que lo prepara y el hábito de calcular antes de mover.",
      productos: ["estrategia-y-tactica", "calculo-y-visualizacion"],
    },
    {
      numero: 3,
      titulo: "Aperturas y técnica de finales",
      promesa: "Guías claras y prácticas para cada etapa",
      detalle: "Las primeras diez jugadas y las últimas diez, que son las dos que deciden la partida.",
      productos: ["aperturas-y-defensas", "finales-practicos", "el-mapa-de-los-finales", "estrategia-en-el-final"],
    },
    {
      numero: 4,
      titulo: "Comprensión, criterio y partidas modelo",
      promesa: "Construye hábitos de pensamiento en tus jugadores",
      detalle: "Cómo se juzga una posición cuando el material no está igual, y partidas donde eso se ve pasar.",
      productos: ["partidas-modelo", "desequilibrios-de-material"],
    },
    {
      numero: 5,
      titulo: "Estrategia de torneo y competición",
      promesa: "Prepara a tus jugadores para el torneo de verdad",
      detalle: "Las tres semanas antes, el reloj, el reglamento y qué se hace después de una derrota.",
      productos: ["preparacion-para-torneos", "arbitro-nacional"],
    },
    {
      numero: 6,
      titulo: "Planificación de temporada y gestión de alumnos",
      promesa: "Planifica, enseña, mide y crece, todo en un solo lugar",
      detalle: "Con qué se forma a quien va a dar la clase, y con qué se mide y se reporta lo que aprendieron.",
      productos: ["formacion-ajedrez", "guia-del-profesor", "libro-de-diagnostico", "diagnostico-de-nivel", "examen-de-arbitraje", "instrucciones-adaptadas"],
    },
  ];

  /* ======================= Los cinco bonos =======================
     Lo que se SUMA al sistema completo y no se vende suelto. No repiten
     ningún producto: son las formas del material que se entregan con el
     paquete, no otra cosa que haya que comprar. */
  const BONOS = [
    {
      emoji: "🗂️",
      titulo: "53 planes de clase listos para dar",
      detalle: "Doce de finales, cinco de estrategia, diez de apertura, tres de celadas, dieciséis de táctica y ocho de mates. Con 303 renglones y 262 posiciones, y ninguna inventada: todas salen de bancos ya verificados con motor.",
    },
    {
      emoji: "👐",
      titulo: "Todo el material en versión accesible",
      detalle: "186 cuadernillos en HTML sin una sola imagen, con cada posición contada pieza por pieza. Para el alumno que ve poco o no ve — y ningún otro material del mercado se lo da.",
    },
    {
      emoji: "🖥️",
      titulo: "Las presentaciones para proyectar",
      detalle: "Una por lección, en .pptx: se abren, se editan y se proyectan. No hay que armar ninguna.",
    },
    {
      emoji: "✍️",
      titulo: "Las hojas de ejercicios, aparte",
      detalle: "Una por lección, en PDF listo para imprimir y repartir. Se dejan de tarea sin tocar el cuadernillo.",
    },
    {
      emoji: "🎬",
      titulo: "La capacitación en diapositivas",
      detalle: "120 láminas 16:9 para sentar al equipo docente y explicarles el sistema completo en una tarde.",
    },
  ];

  /* ======================= Cuentas =======================
     Se calculan, nunca se escriben. Es la misma decisión de cobros.estado y
     de tareas: lo que se deriva de una lista no se guarda aparte, o el día
     que la lista cambie las dos cifras van a decir cosas distintas sin que
     nada falle. */
  function producto(id) {
    return PRODUCTOS.find((p) => p.id === id) || null;
  }
  function porCategoria(cat) {
    return PRODUCTOS.filter((p) => p.categoria === cat);
  }
  function precioSuelto() {
    return PRODUCTOS.length * PRECIO;
  }
  function precioPack() {
    /* Redondeado al millar para que sea un precio que se pueda decir en voz
       alta y pagar por SINPE sin monedas. */
    return Math.round((precioSuelto() * (1 - DESCUENTO_PACK)) / 1000) * 1000;
  }
  function ahorroPack() {
    return precioSuelto() - precioPack();
  }
  function moneda(n) {
    return MONEDA + Number(n).toLocaleString("es-CR");
  }
  /* Cuántas piezas trae un producto en total. La ficha lo dice ("64
     archivos") y el verificador lo cuenta contra el disco. */
  function piezasDe(p) {
    return Object.values(p.piezas || {}).reduce((a, b) => a + b, 0);
  }
  function totalArchivos() {
    return PRODUCTOS.filter((p) => p.categoria === "curso").reduce((a, p) => a + piezasDe(p), 0);
  }

  /* A dónde lleva el "ver el material" de cada ficha. Se CALCULA y no se
     escribe producto por producto: un curso siempre tiene su portada pública
     con el temario, y un libro es su primer archivo. Escrito diecisiete
     veces, el día que se sume uno se va a olvidar y la ficha va a quedar con
     un botón que no lleva a ninguna parte — o peor, a un 404 que solo
     descubre quien lo aprieta. El verificador abre las diecisiete. */
  function vistaDe(p) {
    if (p.categoria === "curso") return "cursos/" + p.id + ".html";
    return (p.archivos && p.archivos[0]) || null;
  }

  return {
    PRECIO, MONEDA, DESCUENTO_PACK,
    PRODUCTOS, MODULOS, BONOS,
    producto, porCategoria,
    precioSuelto, precioPack, ahorroPack, moneda, piezasDe, totalArchivos, vistaDe,
  };
})();
