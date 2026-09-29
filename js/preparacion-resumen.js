/* Preparación de rivales: qué hacer y qué no hacer contra él.
 *
 * El análisis trae mucho (FODA, plan, Stockfish, teoría, cruce, finales,
 * reloj) y cada cosa en su tarjeta, con sus números. Quien va a jugar necesita
 * la respuesta antes que el detalle: con cada color, qué línea jugar, qué
 * buscar y qué evitar; y en toda la partida, cómo jugarle. Esto junta eso en
 * órdenes cortas, cada una con el dato que la justifica y, si es una
 * posición, la línea para verla en el tablero.
 *
 * No detecta nada nuevo: lee lo que el análisis ya decidió (las líneas
 * fuertes y débiles, los errores de Stockfish, la salida de la teoría, las
 * señales de senalesMasAlla(), el cruce). Así el resumen no puede decir otra
 * cosa que el detalle de abajo.
 *
 *   armar(r) → { lados: [{ clave, titulo, lineas: [...], haz: [...], evita: [...] }],
 *               general: { haz: [...], evita: [...] } }
 *   cada orden: { texto, porque, sec? }  (sec: la línea para el tablero)
 *   comoLeVa(p) → «le va mal», «parejo»… : el porcentaje dicho en palabras
 *
 * Corre en la página y en Node (el verificador).
 */
(function (raiz, fabrica) {
  "use strict";
  const req = (nombre, global) => (raiz && raiz[global]) || (typeof require === "function" ? require(nombre) : null);
  const api = fabrica(req("./preparacion-analisis.js", "PreparacionAnalisis"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else raiz.PreparacionResumen = api;
})(typeof self !== "undefined" ? self : this, function (A) {
  "use strict";

  const MAX_HAZ = 4, MAX_EVITA = 3, MAX_LINEAS = 3;
  const pctEntero = (x) => Math.round(100 * x) + " %";
  const partidas = (n) => n + (n === 1 ? " partida" : " partidas");
  const colorEs = (c) => (c === "w" ? "blancas" : "negras");

  // El porcentaje es lo que saca ÉL. Dicho en palabras, desde su lado.
  function comoLeVa(p) {
    if (p == null) return "";
    if (p < 0.35) return "le va mal";
    if (p < 0.45) return "le cuesta";
    if (p <= 0.55) return "parejo";
    if (p < 0.65) return "le va bien";
    return "le va muy bien";
  }
  const saca = (p) => "él saca " + A.pct(p) + " (" + comoLeVa(p) + ")";

  // Una jugada con su número: «4.Dh4», «2…Cf6».
  function jugadaNumerada(sec, san) {
    const num = Math.floor(sec.length / 2) + 1;
    return (sec.length % 2 === 0 ? num + "." : num + "…") + A.sanEs(san);
  }
  const despuesDe = (sec) => (sec.length ? "después de " + A.lineaEs(sec) : "de entrada");

  // La línea principal de una rama del plan: donde le toca a él, su
  // respuesta más jugada (los hijos vienen de la más jugada a la menos).
  function principal(nodo) {
    const sec = [nodo.san];
    let x = nodo, ultimoTuyo = nodo.quien === "tu" ? nodo : null;
    while (x.hijos && x.hijos.length) {
      x = x.hijos[0];
      sec.push(x.san);
      if (x.quien === "tu" && !ultimoTuyo) ultimoTuyo = x;
    }
    return { sec, desde: ultimoTuyo || nodo };
  }

  function lineasDelLado(plan, clave) {
    return (plan || []).slice(0, MAX_LINEAS).map((raizPlan) => {
      const p = principal(raizPlan);
      // Las cifras son las de la primera jugada tuya: todo lo que sigue
      // cuelga de esa decisión.
      const d = p.desde;
      const titulo = clave === "conBlancas" ? "Tu línea"
        : "Si abre " + jugadaNumerada([], raizPlan.san) + (raizPlan.reparto != null ? " (" + pctEntero(raizPlan.reparto) + " de las veces)" : "");
      // Lo mejor que hay en sus partidas puede seguir siendo bueno para él:
      // se dice, para que nadie crea que es una línea ganadora.
      const aviso = d.puntos > 0.55 ? "Es lo que mejor funciona en sus partidas, pero igual le va bien ahí: prepárala a fondo." : "";
      return { titulo, sec: p.sec, n: d.n, puntos: d.puntos, texto: saca(d.puntos) + " en " + partidas(d.n) + ".", aviso };
    });
  }

  // Agrega sin repetir la misma posición dos veces.
  function agregar(lista, orden, max) {
    if (lista.length >= max) return;
    const clave = orden.sec ? orden.sec.join(" ") : orden.texto;
    if (lista.some((x) => (x.sec ? x.sec.join(" ") : x.texto) === clave)) return;
    lista.push(orden);
  }

  function lado(r, clave) {
    const colorRival = clave === "conBlancas" ? "b" : "w";
    const haz = [], evita = [];
    const motor = r.motor || { errores: [], cuidado: [] };

    // HAZ, de lo más concreto a lo más general.
    motor.errores.filter((x) => x.lado === clave).forEach((x) => agregar(haz, {
      texto: "Prepara cómo castigar " + jugadaNumerada(x.sec, x.jugada) + ": es un error suyo que repite.",
      porque: "La jugó en " + partidas(x.n) + ", " + despuesDe(x.sec) + ". Stockfish: " + A.textoEval(x.antes) + " → " + A.textoEval(x.despues) + "; lo correcto era " + (x.mejor ? A.sanEs(x.mejor) : "otra jugada") + ".",
      sec: x.sec.concat(x.jugada),
    }, MAX_HAZ));

    const teoria = (r.teoria && r.teoria.lineas) || [];
    teoria.filter((l) => l.color === colorRival && l.salida && l.salida.quien === "el" && (l.salida.veces || l.n) >= r.minimo)
      .sort((a, b) => (b.salida.veces || b.n) - (a.salida.veces || a.n))
      .forEach((l) => {
        const antes = l.sec.slice(0, l.salida.ply);
        const alt = l.salida.alternativas.slice(0, 2).map((y) => A.sanEs(y.san));
        agregar(haz, {
          texto: "Estudia " + A.lineaEs(antes.concat(l.salida.jugada)) + ": ahí él deja la teoría.",
          porque: "Juega " + jugadaNumerada(antes, l.salida.jugada) + " en " + partidas(l.salida.veces || l.n) + "; los maestros, " + l.salida.maestros + " de " + l.salida.total.toLocaleString("es-CR") + (alt.length ? " (lo habitual es " + alt.join(" o ") + ")" : "") + ".",
          sec: antes.concat(l.salida.jugada),
        }, MAX_HAZ);
      });

    // Una línea débil que ya es el comienzo de la línea recomendada no se
    // repite: sus números ya están ahí.
    const lineas = lineasDelLado(r[clave] && r[clave].plan, clave);
    const yaEsta = (sec) => lineas.some((l) => sec.length <= l.sec.length && sec.every((x, i) => x === l.sec[i]));
    (r.debiles || []).filter((l) => l.color === colorRival && !yaEsta(l.sec)).forEach((l) => agregar(haz, {
      texto: "Busca " + A.lineaEs(l.sec) + ".",
      porque: "Ahí " + saca(l.puntos) + " en " + partidas(l.n) + "; con " + colorEs(colorRival) + " suele sacar " + A.pct(l.base) + ".",
      sec: l.sec,
    }, MAX_HAZ));

    (r.improvisa || []).filter((x) => x.color === colorRival).forEach((x) => agregar(haz, {
      texto: "Después de " + A.lineaEs(x.sec) + " no tiene una jugada fija: ahí improvisa.",
      porque: "Su jugada más usada ahí, " + A.sanEs(x.opciones[0].san) + ", sale solo en el " + pctEntero(x.reparto) + " de las veces.",
      sec: x.sec,
    }, MAX_HAZ));

    const cruce = r.cruce && r.cruce.lados && r.cruce.lados[clave];
    if (cruce) {
      cruce.aFavor.forEach((x) => agregar(haz, {
        texto: r.cruce.alumno + " puede jugar lo suyo: " + A.lineaEs(x.sec.concat(x.jugada)) + ".",
        porque: "Ahí " + saca(x.rival.puntos) + ", y " + r.cruce.alumno + " ya la conoce (" + partidas(x.alumno.n) + ").",
        sec: x.sec.concat(x.jugada),
      }, MAX_HAZ));
    }

    // EVITA.
    motor.cuidado.filter((x) => x.lado === clave).forEach((x) => agregar(evita, {
      texto: "No juegues " + jugadaNumerada(x.sec, x.jugada) + " " + despuesDe(x.sec) + ", aunque a él le haya ido mal ahí.",
      porque: "Stockfish la da como error (" + A.textoEval(x.antes) + " → " + A.textoEval(x.despues) + "). Mejor " + (x.mejor ? A.sanEs(x.mejor) : "otra jugada") + ".",
      sec: x.sec.concat(x.jugada),
    }, MAX_EVITA));

    (r.fuertes || []).filter((l) => l.color === colorRival).forEach((l) => agregar(evita, {
      texto: "No vayas a " + A.lineaEs(l.sec) + ".",
      porque: "Ahí " + saca(l.puntos) + " en " + partidas(l.n) + "; con " + colorEs(colorRival) + " suele sacar " + A.pct(l.base) + ".",
      sec: l.sec,
    }, MAX_EVITA));

    if (cruce) {
      cruce.enContra.forEach((x) => agregar(evita, {
        texto: r.cruce.alumno + " suele jugar " + A.lineaEs(x.sec.concat(x.jugada)) + ": mejor que no.",
        porque: "Ahí " + saca(x.rival.puntos) + " en " + partidas(x.rival.n) + ".",
        sec: x.sec.concat(x.jugada),
      }, MAX_EVITA));
    }

    return {
      clave,
      titulo: clave === "conBlancas" ? "Cuando tú llevas blancas" : "Cuando tú llevas negras",
      lineas,
      haz,
      evita,
    };
  }

  // En toda la partida: el reloj, cómo pierde, los finales.
  function general(r) {
    const haz = [], evita = [];
    const senales = A.senalesMasAlla ? A.senalesMasAlla(r) : [];
    for (const x of senales) {
      if (x.tipo === "pierde-en-la-apertura") haz.push({ texto: "Llega con la apertura bien estudiada.", porque: "El " + pctEntero(x.parte) + " de sus derrotas se decide antes de la jugada 20." });
      else if (x.tipo === "pierde-por-tiempo") haz.push({ texto: "Complícale la posición y aprieta el reloj.", porque: "El " + pctEntero(x.parte) + " de sus derrotas son por tiempo (" + x.n + " de " + x.de + ")." });
      else if (x.tipo === "apuros-de-tiempo") haz.push({ texto: "Cuida tu reloj y lleva la partida a lo largo: él se apura al final.", porque: "Se queda con menos del 10 % de su tiempo en el " + pctEntero(x.parte) + " de sus partidas." });
      else if (x.tipo === "piensa-la-apertura") haz.push({ texto: "Sácalo de lo que conoce: en la apertura piensa mucho.", porque: "Gasta el " + pctEntero(x.el) + " de su reloj en las primeras 15 jugadas; sus rivales, el " + pctEntero(x.rivales) + "." });
      else if (x.tipo === "pierde-con-mate") haz.push({ texto: "Ataca a su rey.", porque: "El " + pctEntero(x.parte) + " de sus derrotas terminan en mate." });
      else if (x.tipo === "final-debil") haz.push({ texto: "Cambia piezas hacia un final " + x.final + ".", porque: "En esos finales " + saca(x.puntos) + " en " + partidas(x.n) + "; su promedio es " + A.pct(x.base) + "." });
      else if (x.tipo === "no-convierte") haz.push({ texto: "Si quedas abajo en material en el final, sigue peleando.", porque: "Con ventaja en el final ganó solo " + x.ganadas + " de " + x.n + "." });
      else if (x.tipo === "final-fuerte") evita.push({ texto: "No cambies hacia un final " + x.final + ".", porque: "En esos finales " + saca(x.puntos) + " en " + partidas(x.n) + "." });
      else if (x.tipo === "se-defiende") evita.push({ texto: "No te relajes si ganas material en el final.", porque: "Con desventaja en el final salvó " + x.salvadas + " de " + x.n + "." });
    }
    return { haz, evita };
  }

  function armar(r) {
    return { lados: [lado(r, "conBlancas"), lado(r, "conNegras")], general: general(r) };
  }

  return { armar, comoLeVa, jugadaNumerada };
});
