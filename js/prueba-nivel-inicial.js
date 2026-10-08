/* ===== «¿Sabe jugar ajedrez?»: la prueba de nivel inicial de un formulario =====
 *
 * Un tipo de pregunta de los formularios de inscripción (formularios.html la
 * agrega, formulario.html la contesta). Sirve para una sola decisión: si el
 * curso arranca desde cero con esta persona o no.
 *
 * Primero se le pregunta qué sabe. Si dice que no sabe mover las piezas, no
 * hay prueba: va a lo básico. Si dice que sí, se le hacen siete preguntas
 * cortas de reglas (cómo se mueve cada pieza, qué es jaque, el enroque, el
 * mate), cada una con su tablero, para ver si es así. Lo que se guarda en la
 * respuesta es UNA línea de texto que lee quien coordina:
 *
 *   «Puede empezar con base · Dice: Sé mover las piezas · Prueba: 7 de 7»
 *
 * La calificación se hace en el navegador, y es a propósito: es una prueba
 * para acomodar a la persona en el curso, no un examen. Quien la falsea solo
 * se manda a un grupo que no es el suyo. Ver «La prueba de nivel inicial de
 * un formulario» en docs/decisiones/cuentas-y-formularios.md.
 *
 * Ninguna posición se inventó a ojo: herramientas/verificar-prueba-nivel-inicial.js
 * comprueba con chess.js que la opción buena es la única buena de cada pregunta.
 * Cada pregunta dice en `comprobar` qué hay que comprobar.
 */
(function (raiz) {
  "use strict";

  const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  /* Lo que la persona dice que sabe. `prueba` dice si con eso se le hace la
     prueba: a quien no sabe mover no tiene sentido hacerle preguntas de reglas. */
  const DICHOS = [
    { id: "nunca", texto: "No, nunca he jugado", prueba: false },
    { id: "piezas", texto: "Conozco las piezas, pero no sé bien cómo se mueven", prueba: false },
    { id: "mover", texto: "Sé mover las piezas", prueba: true },
    { id: "juego", texto: "Sé mover y juego partidas completas", prueba: true },
  ];

  /* Las siete preguntas. `buena` es el índice de la opción correcta; `tema` es
     lo que se anota si la falla («falló: el enroque»). */
  const PREGUNTAS = [
    {
      id: "dama",
      tema: "la posición inicial",
      enunciado: "Al empezar la partida, ¿en qué casilla está la dama blanca?",
      fen: INICIAL,
      opciones: ["En e1", "En d1", "En c1", "En d8"],
      buena: 1,
      comprobar: { tipo: "pieza_en", pieza: "wq", casillas: ["e1", "d1", "c1", "d8"] },
    },
    {
      id: "caballo",
      tema: "el caballo",
      enunciado: "¿A cuál de estas casillas puede saltar el caballo blanco?",
      fen: "4k3/8/8/8/3N4/8/8/4K3 w - - 0 1",
      opciones: ["A d6", "A e5", "A f5", "A b2"],
      buena: 2,
      comprobar: { tipo: "destino", desde: "d4", casillas: ["d6", "e5", "f5", "b2"] },
    },
    {
      id: "peon",
      tema: "el peón",
      enunciado: "El peón blanco de e2 todavía no se ha movido. ¿A dónde puede avanzar?",
      fen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1",
      opciones: ["Solo a e3", "A e3 o a e4", "A e3, a e4 o a d3", "Solo a e4"],
      buena: 1,
      comprobar: { tipo: "destinos", desde: "e2", conjuntos: [["e3"], ["e3", "e4"], ["e3", "e4", "d3"], ["e4"]] },
    },
    {
      id: "captura",
      tema: "cómo captura cada pieza",
      enunciado: "Juegan las blancas. ¿Qué pieza blanca puede capturar la torre negra de e5?",
      fen: "7k/8/8/4r3/2N5/3B4/8/3R2K1 w - - 0 1",
      opciones: ["El alfil", "La torre", "El caballo", "Ninguna"],
      buena: 2,
      comprobar: { tipo: "quien_captura", casilla: "e5", piezas: ["b", "r", "n", null] },
    },
    {
      id: "jaque",
      tema: "el jaque",
      enunciado: "Juegan las blancas. ¿Cuál de estas jugadas le da jaque al rey negro?",
      fen: "4k3/8/8/8/8/8/8/R1B1K1N1 w - - 0 1",
      opciones: ["El caballo a f3", "La torre a a7", "El alfil a g5", "La torre a a8"],
      buena: 3,
      comprobar: { tipo: "jaque", jugadas: ["Nf3", "Ra7", "Bg5", "Ra8"] },
    },
    {
      id: "enroque",
      tema: "el enroque",
      enunciado: "El rey y la torre blancos todavía no se han movido. ¿Pueden las blancas enrocarse corto (el rey a g1)?",
      fen: "4k3/8/8/8/2b5/8/8/4K2R w K - 0 1",
      opciones: [
        "Sí, pueden",
        "No: el rey está en jaque",
        "No: el rey pasaría por una casilla atacada",
        "No: hay una pieza en medio",
      ],
      buena: 2,
      // Se comprueba que el enroque no es legal, que no es por jaque ni por
      // piezas en medio, y que sin el alfil negro de c4 sí lo sería.
      comprobar: { tipo: "enroque_atacado", atacante: "c4" },
    },
    {
      id: "mate",
      tema: "el jaque mate",
      enunciado: "Juegan las blancas. ¿Cuál de estas jugadas es jaque mate?",
      fen: "6k1/5ppp/8/8/8/8/1B6/4R1K1 w - - 0 1",
      opciones: ["La torre a e7", "El alfil a g7, capturando el peón", "La torre a e8", "El rey a f2"],
      buena: 2,
      comprobar: { tipo: "mate", jugadas: ["Re7", "Bxg7", "Re8", "Kf2"] },
    },
  ];

  const RECOMENDACION = {
    basico: "Empezar desde lo básico",
    repaso: "Sabe mover, pero conviene repasar las reglas",
    base: "Puede empezar con base",
  };

  /* dicho: el id de DICHOS; elegidas: { idPregunta: índice de la opción }.
     Devuelve qué se recomienda y la línea que se guarda en la respuesta. */
  function calificar(dicho, elegidas) {
    const d = DICHOS.find((x) => x.id === dicho);
    if (!d) return null;
    if (!d.prueba) {
      const nivel = "basico";
      return { nivel, aciertos: null, total: 0, fallados: [], texto: RECOMENDACION[nivel] + " · Dice: " + d.texto };
    }
    const fallados = PREGUNTAS.filter((p) => (elegidas || {})[p.id] !== p.buena);
    const aciertos = PREGUNTAS.length - fallados.length;
    // Una o ninguna mal: sabe las reglas. Más de la mitad mal: lo que dijo no
    // se sostiene, y conviene arrancar desde el principio.
    const nivel = aciertos >= PREGUNTAS.length - 1 ? "base" : aciertos >= 4 ? "repaso" : "basico";
    let texto = RECOMENDACION[nivel] + " · Dice: " + d.texto + " · Prueba: " + aciertos + " de " + PREGUNTAS.length;
    if (fallados.length) texto += " (falló: " + fallados.map((p) => p.tema).join(", ") + ")";
    return { nivel, aciertos, total: PREGUNTAS.length, fallados: fallados.map((p) => p.id), texto };
  }

  /* Lo que se le dice a la persona al terminar, sin las respuestas buenas: el
     formulario se puede volver a abrir, y la prueba tiene que seguir sirviendo. */
  function mensajeParaQuienContesta(r) {
    if (!r) return "";
    if (r.nivel === "base") return "Según tu prueba, ya sabes las reglas del ajedrez: puedes empezar con base.";
    if (r.nivel === "repaso") return "Según tu prueba, ya sabes mover las piezas; en el curso repasaremos algunas reglas.";
    return "Empezaremos desde lo básico: no hace falta saber nada de ajedrez para el curso.";
  }

  /* ------------------------------------------------------------- en la página
     montar(nodo, { idBase, etiqueta, requerido, ayuda }) pinta la pregunta y
     devuelve { leer, falta }:
       leer()  → la línea que se guarda, o "" si no contestó nada
       falta() → qué le falta para poder mandar (o "" si está completa) */
  const escapar = (t) => String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const CLASE_TABLERO = "grid grid-cols-8 grid-rows-[repeat(8,minmax(0,1fr))] w-full max-w-[300px] aspect-square rounded-xl overflow-hidden shadow-md border-4 border-brand-700 select-none";

  function grupoDeOpciones(nombre, opciones, leyenda, ayuda) {
    return `<fieldset class="space-y-1.5">
      <legend class="block text-sm font-semibold text-brand-700 dark:text-brand-200 mb-1">${leyenda}</legend>
      ${ayuda ? `<p class="text-xs text-brand-450 dark:text-brand-350 mb-1.5">${escapar(ayuda)}</p>` : ""}
      ${opciones.map((o, j) => `
        <label class="flex items-start gap-2 text-sm text-brand-700 dark:text-brand-200">
          <input type="radio" name="${nombre}" value="${escapar(o.valor)}" class="mt-0.5 border-brand-300 text-accent-500 focus:ring-accent-400">
          <span>${escapar(o.texto)}</span>
        </label>`).join("")}
    </fieldset>`;
  }

  function montar(nodo, op) {
    const idBase = op.idBase;
    const marca = op.requerido ? ' <span class="text-red-600 dark:text-red-400" aria-hidden="true">*</span>' : "";
    nodo.innerHTML = grupoDeOpciones(idBase + "-dicho",
      DICHOS.map((d) => ({ valor: d.id, texto: d.texto })),
      escapar(op.etiqueta) + marca, op.ayuda) +
      `<div id="${idBase}-prueba" hidden class="mt-4 border-l-4 border-accent-500 pl-4 space-y-6">
        <p class="text-sm text-brand-600 dark:text-brand-300">Como sabes mover, te dejamos ${PREGUNTAS.length} preguntas cortas para ver por dónde empezar. Si no sabes una, elige la que te parezca: no pasa nada.</p>
        ${PREGUNTAS.map((p, i) => `
          <div>
            <div class="flex justify-center mb-2"><div id="${idBase}-tablero-${i}" class="${CLASE_TABLERO}"></div></div>
            ${grupoDeOpciones(idBase + "-p-" + p.id,
              p.opciones.map((o, j) => ({ valor: String(j), texto: o })),
              (i + 1) + ". " + escapar(p.enunciado))}
          </div>`).join("")}
      </div>`;

    const prueba = nodo.querySelector("#" + idBase + "-prueba");
    let tablerosPuestos = false;
    const dicho = () => {
      const x = nodo.querySelector(`input[name="${idBase}-dicho"]:checked`);
      return x ? x.value : "";
    };
    const conPrueba = () => {
      const d = DICHOS.find((x) => x.id === dicho());
      return !!(d && d.prueba);
    };
    const elegidas = () => {
      const r = {};
      PREGUNTAS.forEach((p) => {
        const x = nodo.querySelector(`input[name="${idBase}-p-${p.id}"]:checked`);
        if (x) r[p.id] = Number(x.value);
      });
      return r;
    };

    nodo.addEventListener("change", (e) => {
      if (e.target.name !== idBase + "-dicho") return;
      prueba.hidden = !conPrueba();
      // Los tableros se pintan la primera vez que se ven: a quien no sabe
      // mover no se le cargan siete tableros que no va a mirar.
      if (!prueba.hidden && !tablerosPuestos && raiz.TableroPregunta) {
        tablerosPuestos = true;
        PREGUNTAS.forEach((p, i) => {
          raiz.TableroPregunta.montar(nodo.querySelector("#" + idBase + "-tablero-" + i), { fen: p.fen, tipo: "mirar" });
        });
      }
    });

    return {
      falta() {
        if (!dicho()) return "Falta contestar: " + op.etiqueta;
        if (!conPrueba()) return "";
        const r = elegidas();
        const i = PREGUNTAS.findIndex((p) => !(p.id in r));
        return i < 0 ? "" : "Falta contestar la pregunta " + (i + 1) + " de la prueba de ajedrez.";
      },
      enfocar() {
        const sinContestar = !dicho()
          ? nodo.querySelector(`input[name="${idBase}-dicho"]`)
          : PREGUNTAS.map((p) => nodo.querySelector(`input[name="${idBase}-p-${p.id}"]`))
            .find((x) => !nodo.querySelector(`input[name="${x.name}"]:checked`));
        if (sinContestar) sinContestar.focus();
      },
      resultado() { return dicho() ? calificar(dicho(), elegidas()) : null; },
      leer() { const r = this.resultado(); return r ? r.texto : ""; },
    };
  }

  const api = { PREGUNTAS, DICHOS, RECOMENDACION, calificar, mensajeParaQuienContesta, montar };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.PruebaNivelInicial = api;
})(typeof window !== "undefined" ? window : globalThis);
