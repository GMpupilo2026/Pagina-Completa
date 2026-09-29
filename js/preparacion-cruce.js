/* Preparación de rivales: el cruce con las partidas del alumno.
 *
 * El análisis dice qué jugarle al rival; el alumno que lo va a enfrentar tiene
 * su propio repertorio. Esto cruza los dos, color por color:
 *
 *   - EL PLAN, ¿ya lo juega? En cada jugada del plan que le toca al alumno:
 *     si la juega (es su jugada de siempre, o la hace la mitad de las veces o
 *     más), si juega otra cosa, o si nunca llegó a esa posición.
 *   - LO SUYO, ¿le sirve? Las posiciones a las que llegan los dos en sus
 *     propias partidas, y en cada jugada del alumno, cuánto saca el rival
 *     contra ella. Donde saca menos que de costumbre, es mejor que el alumno
 *     juegue lo que ya sabe; donde saca más, conviene evitarla.
 *   - EL PLAN A SU MEDIDA (planAlumno). El plan general elige, donde le toca
 *     al alumno, la jugada con la que el rival saca menos, aunque salga de 9
 *     partidas y el alumno no la haya jugado nunca. Este elige igual, pero
 *     con un premio para lo que el alumno ya juega: entre dos opciones
 *     parecidas gana la que conoce. Una jugada claramente mejor contra el
 *     rival sigue ganando aunque sea nueva para él. Ver «El plan a la medida
 *     del alumno» en docs/decisiones/paneles.md.
 *
 * El árbol del alumno se arma igual que el del rival (armarArbol() del
 * análisis: por posición, con las transposiciones juntas). Al alumno no se le
 * aplican los filtros del rival: sus partidas son todas las que trajo.
 *
 *   cruzar(partidasRival, rival, filtros, partidasAlumno, alumno, planes)
 *     → { alumno, total, minimo, lados: { conBlancas, conNegras } } o null
 *
 * Corre en js/preparacion-trabajador.js (y en Node, en el verificador).
 */
(function (raiz, fabrica) {
  "use strict";
  const req = (nombre, global) => (raiz && raiz[global]) || (typeof require === "function" ? require(nombre) : null);
  const api = fabrica(req("./preparacion-analisis.js", "PreparacionAnalisis"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else raiz.PreparacionCruce = api;
})(typeof self !== "undefined" ? self : this, function (A) {
  "use strict";

  const I = A.interno;
  const MAX_PROFUNDIDAD = 14;      // medias jugadas del cruce
  const DIFERENCIA = 0.05;         // cinco puntos sobre su promedio, como en el análisis
  // El premio por conocerla, en puntos de lo que saca el rival (suavizado):
  // 5 por jugarla con alguna frecuencia (minA partidas o más) y hasta 10 más
  // según qué parte de sus partidas en esa posición la juega. Con jeigoth5:
  // contra 1.d4, 1…c6 (él saca 65 %, suavizado, en 5 partidas; el alumno
  // nunca la jugó) pierde con 1…d5 (66 % en 23; el alumno la juega en la
  // mitad de sus partidas). 1.g3 (43 % en 9) sigue ganándole a 1.d4 (58 %
  // en 34) aunque el alumno juegue mucho más 1.d4: la diferencia es grande.
  const PREMIO_CONOCE = 0.05;
  const PREMIO_FRECUENCIA = 0.1;

  // Cuántas partidas del alumno hacen falta para decir «esto juega»: el 1 %,
  // entre 2 y 10. Un alumno trae muchas menos partidas que un rival de Lichess.
  function minimoAlumno(total) { return Math.max(2, Math.min(10, Math.round(total * 0.01))); }

  /* En cada jugada del plan que le toca al alumno: qué juega él ahí. `al` es
     el nodo del árbol del alumno en esa posición (o null si nunca llegó). */
  function segunElPlan(plan, AL, minA) {
    const out = [];
    (function bajar(nodos, sec, al) {
      for (const x of nodos || []) {
        if (x.quien === "tu") {
          const total = al ? I.totalAristas(al) : 0;
          const hs = al ? I.hijosOrdenados(al) : [];
          const esa = al && al.hijos.get(x.san);
          const veces = esa ? esa.c.n : 0;
          const suya = hs.length ? { san: hs[0].san, n: hs[0].arista.n } : null;
          let estado = "nunca";
          if (total >= minA) estado = (suya && suya.san === x.san) || veces / total >= 0.5 ? "la-juega" : "otra";
          out.push({ sec: sec.slice(), recomendada: x.san, veces, total, suya, estado });
        }
        const sig = al && al.hijos.get(x.san);
        bajar(x.hijos, sec.concat(x.san), sig ? sig.nodo : null);
      }
    })(plan, [], AL);
    return out;
  }

  /* Las posiciones a las que llegan los dos: se baja por los dos árboles a la
     vez, solo por jugadas que los dos tienen (el alumno con minA partidas, el
     rival con minR). En cada jugada del alumno queda cuánto saca él (el
     alumno) y cuánto saca el rival contra ella. */
  function encuentros(RA, AL, colorRival, minR, minA) {
    const out = [];
    const vistos = new Set();
    (function bajar(ra, al, sec) {
      if (sec.length >= MAX_PROFUNDIDAD) return;
      for (const [san, aA] of al.hijos) {
        const aR = ra.hijos.get(san);
        if (!aR || aA.c.n < minA || aR.c.n < minR) continue;
        if (vistos.has(aR.nodo) && vistos.has(aA.nodo)) continue;
        vistos.add(aR.nodo); vistos.add(aA.nodo);
        if (!I.leTocaAlRival(colorRival, sec.length)) {
          out.push({ sec: sec.slice(), jugada: san, alumno: I.resumen(aA.c), rival: I.resumen(aR.c), c: aR.c });
        }
        bajar(aR.nodo, aA.nodo, sec.concat(san));
      }
    })(RA, AL, []);
    return out;
  }

  // Las más notables, sin repetir la misma línea con una jugada más: queda la
  // más corta si son casi las mismas partidas (el criterio del análisis).
  function elegir(lista, cuantas) {
    const elegidas = [];
    for (const x of lista) {
      const sx = x.sec.concat(x.jugada);
      const repetida = elegidas.some((y) => {
        const sy = y.sec.concat(y.jugada);
        return (I.esPrefijo(sy, sx) || I.esPrefijo(sx, sy)) && Math.max(x.rival.n, y.rival.n) <= 1.25 * Math.min(x.rival.n, y.rival.n);
      });
      if (!repetida) elegidas.push(x);
      if (elegidas.length >= cuantas) break;
    }
    return elegidas;
  }

  /* El plan a la medida del alumno, con la misma forma que el plan del
     análisis (san, quien, n, puntos, reparto, hijos) más, en sus jugadas,
     cuántas partidas tiene él ahí (`alumno`). RA y AL son los nodos del
     rival y del alumno en la misma posición (AL null si nunca llegó). */
  function planAlumno(RA, AL, colorRival, base, minR, minA, prof, ply) {
    if (prof <= 0 || !RA) return [];
    const hs = I.hijosOrdenados(RA).filter((x) => x.nodo.c.n >= minR);
    if (!hs.length) return [];
    if (!I.leTocaAlRival(colorRival, ply)) {
      const totalA = AL ? I.totalAristas(AL) : 0;
      let mejor = null;
      for (const x of hs) {
        const a = AL ? AL.hijos.get(x.san) : null;
        const nA = a ? a.c.n : 0;
        const premio = nA >= minA ? PREMIO_CONOCE + PREMIO_FRECUENCIA * (nA / Math.max(totalA, 1)) : 0;
        const valor = I.suavizada(x.nodo.c, base) - premio;
        if (!mejor || valor < mejor.valor) mejor = { x, a, valor };
      }
      const nodo = { san: mejor.x.san, quien: "tu", ...I.resumen(mejor.x.nodo.c) };
      if (mejor.a) nodo.alumno = I.resumen(mejor.a.c);
      nodo.hijos = planAlumno(mejor.x.nodo, mejor.a ? mejor.a.nodo : null, colorRival, base, minR, minA, prof - 1, ply + 1);
      return [nodo];
    }
    // Donde le toca a él, lo mismo que el plan del análisis: sus respuestas
    // más jugadas; la principal hasta el fondo y las otras un poco.
    const total = Math.max(I.totalAristas(RA), 1);
    const respuestas = hs.filter((x) => x.arista.n >= minR && x.arista.n >= 0.1 * total).slice(0, 3);
    return respuestas.map((x, i) => {
      const reparto = x.arista.n / total;
      const hondo = i === 0 || (reparto >= 0.25 && ply <= 3);
      const a = AL ? AL.hijos.get(x.san) : null;
      return {
        san: x.san, quien: "rival", reparto, ...I.resumen(x.nodo.c),
        hijos: planAlumno(x.nodo, a ? a.nodo : null, colorRival, base, minR, minA, hondo ? prof - 1 : Math.min(prof - 1, 2), ply + 1),
      };
    });
  }

  function lado(listaR, listaA, colorAlumno, planes, nombreLado, minR, minA) {
    const colorRival = colorAlumno === "w" ? "b" : "w";
    const lr = listaR.filter((x) => x.color === colorRival);
    const la = listaA.filter((x) => x.color === colorAlumno);
    const RA = I.armarArbol(lr);
    const AL = I.armarArbol(la);
    const base = I.puntos(RA.c);
    const todos = lr.length && la.length ? encuentros(RA, AL, colorRival, minR, minA) : [];
    todos.forEach((x) => { x.s = I.suavizada(x.c, base ?? 0.5); });
    const aFavor = elegir(todos.filter((x) => x.s <= base - DIFERENCIA).sort((a, b) => a.s - b.s), 5);
    const enContra = elegir(todos.filter((x) => x.s >= base + DIFERENCIA).sort((a, b) => b.s - a.s), 3);
    const limpio = (x) => ({ sec: x.sec, jugada: x.jugada, alumno: x.alumno, rival: x.rival });
    const aMedida = la.length && lr.length ? planAlumno(RA, AL, colorRival, base ?? 0.5, minR, minA, I.PROFUNDIDAD_PLAN, 0) : [];
    // «¿Ya lo juega?» se pregunta sobre el plan que va a jugar: el suyo.
    const plan = la.length ? segunElPlan(aMedida.length ? aMedida : planes && planes[nombreLado], AL, minA) : [];
    const cuenta = (e) => plan.filter((x) => x.estado === e).length;
    return {
      partidas: la.length,
      puntos: I.puntos(AL.c),
      base,
      plan,
      planAlumno: aMedida,
      resumenPlan: { laJuega: cuenta("la-juega"), otra: cuenta("otra"), nunca: cuenta("nunca") },
      comunes: todos.length,
      aFavor: aFavor.map(limpio),
      enContra: enContra.map(limpio),
    };
  }

  function cruzar(partidasRival, rival, filtros, partidasAlumno, alumno, planes) {
    const claveA = A.claveNombre(alumno);
    const listaA = I.partidasDelRival(partidasAlumno, claveA);
    if (!listaA.length) return null;
    const listaR = I.partidasDelRival(partidasRival, A.claveNombre(rival)).filter((x) => I.pasaFiltros(x, filtros || {}));
    const minR = A.minimo(listaR.length);
    const minA = minimoAlumno(listaA.length);
    return {
      version: 2,
      alumno: I.nombreDe(partidasAlumno, claveA, alumno),
      total: listaA.length,
      minimo: minA,
      generado: new Date().toISOString(),
      lados: {
        // Con blancas: el alumno lleva blancas y el rival negras.
        conBlancas: lado(listaR, listaA, "w", planes, "conBlancas", minR, minA),
        conNegras: lado(listaR, listaA, "b", planes, "conNegras", minR, minA),
      },
    };
  }

  return { cruzar, minimoAlumno };
});
