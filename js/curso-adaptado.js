/**
 * Ajedrez Integral — los cursos de Academia, navegables con lector de pantalla.
 *
 * El contenido de cada curso llega como un fragmento (cursos/protegido/<curso>.html)
 * que inyectan js/curso-academia.js y js/curso-acceso.js. Este módulo lo retoca
 * después, enganchado al evento "curso:contenido".
 *
 * Hace TRES cosas, y una de ellas no depende del Modo Adaptado a propósito:
 *
 * 1. LOS ENCABEZADOS, SIEMPRE. Quien usa lector de pantalla se mueve saltando de
 *    encabezado en encabezado, y así el curso no se podía recorrer: el título de
 *    cada lección era un <summary> —que se anuncia como botón, no como
 *    encabezado— y los títulos de bloque eran <h4> colgando de un <h2>, o sea
 *    saltándose el h3. Para llegar a la lección 14 había que tabular por las
 *    trece anteriores con sus enlaces de material.
 *
 *    El remapeo es de una sola pieza y encaja con lo que ya había:
 *        h2 "Tus lecciones"  →  h3 Bloque  →  h4 Lección  →  h5 secciones
 *    Los h5 de dentro de las lecciones ya estaban escritos así, así que solo hay
 *    que bajar el bloque y subir la lección.
 *
 *    Va SIEMPRE y no solo en Modo Adaptado, y eso es deliberado: el Modo
 *    Adaptado se enciende a mano o a ojo (se adivina por el contraste del
 *    sistema o por el primer Tab), así que perfectamente puede estar apagado
 *    para alguien que usa lector de pantalla. La accesibilidad de verdad es de
 *    la semántica, no de un modo visual — está escrito en la cabecera de
 *    js/adaptive-mode.js. Y unos encabezados de más no le cambian nada a quien
 *    ve la página: se quedan con el mismo estilo del summary.
 *
 * 2. SOLO EL MATERIAL ADAPTADO, en Modo Adaptado. Cada lección ofrece el
 *    cuadernillo en PDF, el mismo material en HTML accesible, la presentación y
 *    la hoja de ejercicios. El PDF y la presentación son diagramas y marca de
 *    agua: para un lector de pantalla son lo peor que se le puede dar (por eso
 *    existe la versión accesible). Se esconden. (Las lecciones traían además un
 *    enlace a un video, que se dejaba porque un video es audio; ya no hay
 *    ninguno en los cursos, así que no hay nada que decidir sobre ellos.)
 *
 * 3. LA POSICIÓN, ESCRITA Y JUNTO AL CUADRO DE COMANDOS. Los tres visores
 *    (js/finales-100.js y js/curso-partidas.js) ya cuentan la posición en
 *    palabras y ya dejan escribir la jugada en vez de arrastrarla — pero lo
 *    contado vivía en un párrafo sr-only pegado al final del visor, lejísimos
 *    del cuadro donde se escribe. Acá se mueve ese párrafo justo encima del
 *    cuadro y, en Modo Adaptado, se hace visible: la posición y el lugar donde
 *    se contesta, juntos.
 *
 *    Ese párrafo ya NO es región viva: dictar las treinta y dos piezas en cada
 *    jugada tapaba lo único que cambió, que es la jugada. Los visores anuncian
 *    la jugada en palabras («El motor jugó caballo a felix 3») y la posición se
 *    lee cuando se quiere o se pide escribiendo «posición».
 *
 * Y trae las PIEZAS del recuadro (CursoAdaptado.piezas): el cuadro de comandos
 * de Entrenamiento (js/cuadro-comandos.js), lo que se le puede preguntar a la
 * posición (js/comandos-tablero.js) y cómo se cuenta una jugada
 * (js/visor-linea.js). Las páginas de los cursos no los cargaban, y el recuadro
 * de los visores solo entendía jugadas — ni «caballos» ni «qué hay en e4». Se
 * cargan desde acá y no con una línea en cada página: son once cursos escritos
 * a mano, y la línea que falte en uno deja ese curso con el recuadro de antes
 * sin que nada avise.
 *
 * Lo que decide qué se ve es el CSS (`html.adaptive-mode` en css/styles.css), no
 * este archivo: así encender y apagar el modo surte efecto al instante, sin
 * volver a pasar por el contenido.
 */
(function () {
  "use strict";

  /* ---------- 0. Las piezas del recuadro ---------- */

  // Van en este orden: comandos-tablero.js lee TableroAccesible al cargarse, y
  // cuadro-comandos.js usa ComandosTablero al montar.
  var PIEZAS = [
    ["BlindNotation", "blind-notation.js"],
    ["ChessMoveParser", "chess-move-parser.js"],
    ["TableroAccesible", "tablero-accesible.js"],
    ["ComandosTablero", "comandos-tablero.js"],
    ["CuadroComandos", "cuadro-comandos.js"],
    ["VisorLinea", "visor-linea.js"],
  ];
  // Relativo a ESTE archivo y no a la página: el curso está en cursos/academia/.
  var AQUI = document.currentScript && document.currentScript.src;
  var listas = false, esperando = [];
  function cargarPiezas() {
    var i = 0;
    (function siguiente() {
      while (i < PIEZAS.length && window[PIEZAS[i][0]]) i += 1;
      if (i >= PIEZAS.length) {
        listas = true;
        var xs = esperando; esperando = [];
        xs.forEach(function (f) { try { f(); } catch (e) { setTimeout(function () { throw e; }); } });
        return;
      }
      var s = document.createElement("script");
      s.src = AQUI ? new URL(PIEZAS[i][1], AQUI).href : "/js/" + PIEZAS[i][1];
      // Si una no carga, se sigue con las demás: el visor tiene su recuadro
      // sencillo de respaldo, y mejor ese que ninguno.
      s.onload = s.onerror = function () { i += 1; siguiente(); };
      document.head.appendChild(s);
    })();
  }
  cargarPiezas();
  function piezas(listo) {
    if (listas) listo(); else esperando.push(listo);
  }
  window.CursoAdaptado = { piezas: piezas };

  /* ---------- 1. Encabezados ---------- */

  // Cambia la etiqueta de un encabezado conservando clases, id y contenido.
  function aNivel(elemento, nivel) {
    if (elemento.tagName.toLowerCase() === nivel) return elemento;
    var nuevo = document.createElement(nivel);
    for (var i = 0; i < elemento.attributes.length; i += 1) {
      nuevo.setAttribute(elemento.attributes[i].name, elemento.attributes[i].value);
    }
    nuevo.innerHTML = elemento.innerHTML;
    elemento.parentNode.replaceChild(nuevo, elemento);
    return nuevo;
  }

  function ponerEncabezados(body) {
    // Los títulos de bloque: h4 → h3. Son los que NO están dentro de una lección.
    body.querySelectorAll("h4").forEach(function (h) {
      if (h.closest("details") || h.dataset.cursoEnc === "1") return;
      aNivel(h, "h3").dataset.cursoEnc = "1";
    });

    // El título de cada lección pasa a ser un encabezado de verdad, DENTRO del
    // summary (el HTML lo permite y es la forma de que se anuncie como las dos
    // cosas: encabezado para saltar y botón para abrir).
    body.querySelectorAll("details > summary").forEach(function (sum) {
      if (sum.dataset.cursoEnc === "1") return;
      sum.dataset.cursoEnc = "1";
      // Una lección suelta es h4; una dentro de otra lección, h5 — así los h5
      // que el curso ya traía escritos siguen cayendo donde caían.
      var dentro = sum.parentElement.parentElement && sum.parentElement.parentElement.closest("details");
      var nivel = dentro && body.contains(dentro) ? "h5" : "h4";
      var h = document.createElement(nivel);
      // `inline` para que la marca de ✔/🔒 que pone curso-academia.js quede en la
      // misma línea: un encabezado de bloque la partiría en dos.
      h.className = "inline";
      while (sum.firstChild) h.appendChild(sum.firstChild);
      sum.appendChild(h);
    });
  }

  /* ---------- 2. El material ---------- */

  // Lo que solo sirve mirándolo. El CSS lo esconde en Modo Adaptado.
  function marcarMaterial(body) {
    body.querySelectorAll("a[href]").forEach(function (a) {
      if (a.dataset.cursoMat === "1") return;
      var href = a.getAttribute("href") || "";
      if (/\.(pdf|pptx)(\?|#|$)/i.test(href)) {
        a.dataset.cursoMat = "1";
        a.classList.add("curso-solo-visual");
      }
    });
  }

  // Un aviso, una sola vez y arriba de todo, para que en Modo Adaptado no
  // parezca que faltan cosas: faltan a propósito y se dice cuáles.
  function avisoDeMaterial(body) {
    if (body.querySelector(".curso-aviso-adaptado")) return;
    var p = document.createElement("p");
    p.className = "curso-aviso-adaptado";
    p.textContent = "Modo adaptado: de cada lección se ofrece el material en formato accesible "
      + "(el mismo contenido en HTML, con las posiciones contadas en palabras). El cuadernillo en PDF "
      + "y la presentación quedan fuera porque son diagramas. En los tableros, la posición va escrita "
      + "encima del cuadro donde se escribe la jugada.";
    body.insertBefore(p, body.firstChild);
  }

  /* ---------- 3. La posición escrita, junto al cuadro de comandos ---------- */

  function adaptarVisores(body) {
    [[".f100-viewer", ".f100-desc", ".f100-cmd"],
     [".cp-viewer", ".cp-desc", ".cp-cmd"]].forEach(function (par) {
      body.querySelectorAll(par[0]).forEach(function (visor) {
        if (visor.dataset.cursoPos === "1") return;
        var desc = visor.querySelector(par[1]);
        if (!desc) return;
        visor.dataset.cursoPos = "1";
        // Deja de ser solo para el lector: pasa a una clase propia que el CSS
        // destapa en Modo Adaptado (ver css/styles.css).
        desc.classList.remove("sr-only");
        desc.classList.add("curso-posicion");
        var cmd = visor.querySelector(par[2]);
        // Justo ENCIMA del cuadro donde se escribe la jugada: leer la posición y
        // contestarla son el mismo gesto. Sin cuadro (un diagrama de solo
        // mirar), se queda donde estaba.
        if (cmd && cmd.parentNode) cmd.parentNode.insertBefore(desc, cmd);
      });
    });
  }

  /* ---------- enganche ---------- */

  function pasar(body) {
    ponerEncabezados(body);
    marcarMaterial(body);
    avisoDeMaterial(body);
    adaptarVisores(body);
  }

  document.addEventListener("curso:contenido", function (ev) {
    var body = ev.detail && ev.detail.body;
    if (!body) return;
    pasar(body);
    /* Los visores se arman cuando se ABRE su lección, no al cargar la página
       (inicialización perezosa de finales-100.js y curso-partidas.js), así que
       una sola pasada dejaría sin adaptar todo lo que no estuviera abierto. Se
       vuelve a pasar cuando el contenido cambia, agrupado en un cuadro de
       animación para no encadenar una pasada por cada nodo que se agrega — y
       cada pieza lleva su marca, así que volver a pasar no la toca dos veces. */
    var pendiente = false;
    new MutationObserver(function () {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(function () { pendiente = false; pasar(body); });
    }).observe(body, { childList: true, subtree: true });
  });
})();
