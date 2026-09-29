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
 *   derrotasEn(r, sec, color) → { n, lista }: las partidas que perdió por esa
 *               línea (las 3 más recientes en `lista`), de r.derrotas
 *   cada orden y cada línea traen `derrotas` con eso
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

  // Con pocas partidas, un porcentaje es una pista y no una regla: se dice.
  // Pocas es menos del doble de las que el análisis pide para contar una
  // línea (con un rival de 500 partidas, «1.g3» salía de 9).
  function pocasPartidas(n, r) {
    return n < 2 * r.minimo ? "Son solo " + partidas(n) + ": tómalo como pista, no como regla." : "";
  }

  // Lo que dice el cruce de la línea: ¿el alumno ya la juega?
  function notaDelAlumno(sec, r, clave) {
    const c = r.cruce && r.cruce.lados && r.cruce.lados[clave];
    if (!c || !c.plan) return "";
    const suyas = c.plan.filter((x) => esPrefijo(x.sec.concat(x.recomendada), sec));
    const otra = suyas.find((x) => x.estado === "otra" && x.suya);
    if (otra) {
      return r.cruce.alumno + " suele jugar " + jugadaNumerada(otra.sec, otra.suya.san) + " y no " + jugadaNumerada(otra.sec, otra.recomendada) +
        " (" + otra.suya.n + " contra " + otra.veces + " de " + otra.total + " partidas): que practique la línea antes.";
    }
    if (suyas.length && suyas.every((x) => x.estado === "la-juega")) return r.cruce.alumno + " ya juega esta línea.";
    return "";
  }

  function lineasDelLado(plan, clave, r, general) {
    const aMedida = !!general;
    const alumno = aMedida && r.cruce ? r.cruce.alumno : "";
    return (plan || []).slice(0, MAX_LINEAS).map((raizPlan) => {
      const p = principal(raizPlan);
      // Las cifras son las de la primera jugada tuya: todo lo que sigue
      // cuelga de esa decisión.
      const d = p.desde;
      const titulo = (clave === "conBlancas" ? "Tu línea"
        : "Si abre " + jugadaNumerada([], raizPlan.san) + (raizPlan.reparto != null ? " (" + pctEntero(raizPlan.reparto) + " de las veces)" : "")) +
        (aMedida ? ", a la medida de " + alumno : "");
      // Lo mejor que hay en sus partidas puede seguir siendo bueno para él:
      // se dice, para que nadie crea que es una línea ganadora.
      const avisos = [];
      if (d.puntos > 0.55) avisos.push("Es lo que mejor funciona en sus partidas, pero igual le va bien ahí: prepárala a fondo.");
      const pocas = pocasPartidas(d.n, r);
      if (pocas) avisos.push(pocas);
      const notaAlumno = notaDelAlumno(p.sec, r, clave);
      // Si el plan general elegía otra cosa en la misma apertura, se dice:
      // quien prepara decide con las dos a la vista.
      let otra = "";
      if (aMedida) {
        const g = general.find((x) => clave === "conBlancas" || x.san === raizPlan.san);
        if (g) {
          const pg = principal(g);
          if (pg.sec.join(" ") !== p.sec.join(" ")) {
            otra = "Sin mirar a " + alumno + ", lo que más le cuesta a él es " + A.lineaEs(pg.sec) + ": " + saca(pg.desde.puntos) + " en " + partidas(pg.desde.n) + ".";
          }
        }
      }
      return { titulo, sec: p.sec, n: d.n, puntos: d.puntos, texto: saca(d.puntos) + " en " + partidas(d.n) + ".", aviso: avisos.join(" "), alumno: notaAlumno, general: otra };
    });
  }

  const esPrefijo = (corta, larga) => corta.length <= larga.length && corta.every((x, i) => x === larga[i]);
  const parientes = (a, b) => esPrefijo(a, b) || esPrefijo(b, a);

  // Agrega sin repetir: ni la misma posición, ni —dentro del mismo tipo de
  // consejo— una línea que es el comienzo (o la continuación) de otra ya
  // dicha. «1.e4 e6», «1.e4 e6 2.d4» y «1.e4 e6 2.d4 d5 3.Cd2…» son un solo
  // consejo, no tres; pero «ahí deja la teoría» y «ahí repite un error» en
  // la misma línea son dos cosas distintas.
  function agregar(lista, orden, max) {
    if (lista.length >= max) return;
    if (orden.sec && lista.some((x) => x.sec && (x.sec.join(" ") === orden.sec.join(" ") || (x.tipo === orden.tipo && parientes(x.sec, orden.sec))))) return;
    if (!orden.sec && lista.some((x) => x.texto === orden.texto)) return;
    lista.push(orden);
  }

  // ¿La última jugada de la línea es de él o tuya? Cambia qué se puede
  // pedir: «juega 2.d4» se puede; «busca 1.e4 g6», no: 1…g6 lo elige él.
  const ultimaEsSuya = (sec, colorRival) => ((sec.length - 1) % 2 === 0) === (colorRival === "w");

  // Una línea donde rinde menos (o más) que de costumbre, dicha según de
  // quién es la última jugada.
  function lineaNotable(l, colorRival, buena) {
    const antes = l.sec.slice(0, -1), ult = l.sec[l.sec.length - 1];
    const jug = jugadaNumerada(antes, ult);
    const porque = "Ahí " + saca(l.puntos) + " en " + partidas(l.n) + "; con " + colorEs(colorRival) + " suele sacar " + A.pct(l.base) + ".";
    if (!ultimaEsSuya(l.sec, colorRival)) {
      return {
        texto: buena ? "Juega " + jug + (antes.length ? " después de " + A.lineaEs(antes) : "") + ": ahí rinde menos que de costumbre."
          : "No juegues " + jug + (antes.length ? " después de " + A.lineaEs(antes) : "") + ".",
        porque,
      };
    }
    // La elige él: no se puede pedir, solo prepararla (o evitar llegar).
    if (buena) {
      const como = comoLeVa(l.puntos);
      const dicho = como === "le va mal" || como === "le cuesta" ? "a él " + como : "él rinde menos que de costumbre";
      return { texto: "Si llegan a " + A.lineaEs(l.sec) + ", " + dicho + ": estudia esa posición.", porque };
    }
    return {
      texto: "Cuidado si llegan a " + A.lineaEs(l.sec) + ": ahí a él " + comoLeVa(l.puntos) + ".",
      porque: porque + (antes.length ? " Si no la conoces, evita " + A.lineaEs(antes) + "." : ""),
    };
  }

  // Las líneas notables, de la más clara a la menos: cuánto se aparta de su
  // promedio, pesado por cuántas partidas la respaldan (la de 23 partidas
  // antes que la de 7, aunque la de 7 se aparte un poco más).
  const peso = (l) => Math.abs(l.puntos - l.base) * Math.sqrt(l.n);

  function lado(r, clave) {
    const colorRival = clave === "conBlancas" ? "b" : "w";
    const haz = [], evita = [];
    const motor = r.motor || { errores: [], cuidado: [] };
    const general = (r[clave] && r[clave].plan) || [];
    const lineas = A.esAMedida && A.esAMedida(r, clave) ? lineasDelLado(A.planDe(r, clave), clave, r, general) : lineasDelLado(general, clave, r);
    // Lo que ya es parte de la línea recomendada no se repite abajo: sus
    // números ya están arriba.
    const yaEsta = (sec) => lineas.some((l) => esPrefijo(sec, l.sec));
    const cruce = r.cruce && r.cruce.lados && r.cruce.lados[clave];

    // HAZ, de lo más concreto a lo más general.
    motor.errores.filter((x) => x.lado === clave).forEach((x) => agregar(haz, {
      tipo: "error",
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
          tipo: "teoria",
          texto: "Estudia " + A.lineaEs(antes.concat(l.salida.jugada)) + ": ahí él deja la teoría.",
          porque: "Juega " + jugadaNumerada(antes, l.salida.jugada) + " en " + partidas(l.salida.veces || l.n) + "; los maestros, " + l.salida.maestros + " de " + l.salida.total.toLocaleString("es-CR") + (alt.length ? " (lo habitual es " + alt.join(" o ") + ")" : "") + ".",
          sec: antes.concat(l.salida.jugada),
        }, MAX_HAZ);
      });

    // Lo del alumno va antes que lo general: es quien va a jugar. Solo lo
    // que de verdad le cuesta al rival (menos de 50 %); «le va bien, pero
    // menos que de costumbre» no es un consejo para jugar.
    if (cruce) {
      cruce.aFavor.filter((x) => x.rival.puntos < 0.5 && !yaEsta(x.sec.concat(x.jugada))).forEach((x) => agregar(haz, {
        tipo: "alumno",
        texto: r.cruce.alumno + " puede jugar lo suyo: " + jugadaNumerada(x.sec, x.jugada) + (x.sec.length ? " después de " + A.lineaEs(x.sec) : "") + ".",
        porque: "Ahí " + saca(x.rival.puntos) + ", y " + r.cruce.alumno + " ya la conoce (" + partidas(x.alumno.n) + ").",
        sec: x.sec.concat(x.jugada),
      }, MAX_HAZ));
    }

    (r.debiles || []).filter((l) => l.color === colorRival && !yaEsta(l.sec)).sort((a, b) => peso(b) - peso(a))
      .forEach((l) => agregar(haz, Object.assign(lineaNotable(l, colorRival, true), { tipo: "linea", sec: l.sec }), MAX_HAZ));

    (r.improvisa || []).filter((x) => x.color === colorRival).forEach((x) => agregar(haz, {
      tipo: "improvisa",
      texto: "Después de " + A.lineaEs(x.sec) + " no tiene una jugada fija: ahí improvisa.",
      porque: "Su jugada más usada ahí, " + A.sanEs(x.opciones[0].san) + ", sale solo en el " + pctEntero(x.reparto) + " de las veces.",
      sec: x.sec,
    }, MAX_HAZ));

    // EVITA.
    motor.cuidado.filter((x) => x.lado === clave).forEach((x) => agregar(evita, {
      tipo: "error",
      texto: "No juegues " + jugadaNumerada(x.sec, x.jugada) + " " + despuesDe(x.sec) + ", aunque a él le haya ido mal ahí.",
      porque: "Stockfish la da como error (" + A.textoEval(x.antes) + " → " + A.textoEval(x.despues) + "). Mejor " + (x.mejor ? A.sanEs(x.mejor) : "otra jugada") + ".",
      sec: x.sec.concat(x.jugada),
    }, MAX_EVITA));

    if (cruce) {
      cruce.enContra.forEach((x) => agregar(evita, {
        tipo: "alumno",
        texto: r.cruce.alumno + " suele jugar " + jugadaNumerada(x.sec, x.jugada) + (x.sec.length ? " después de " + A.lineaEs(x.sec) : "") + ": contra él, mejor que no.",
        porque: "Ahí " + saca(x.rival.puntos) + " en " + partidas(x.rival.n) + ".",
        sec: x.sec.concat(x.jugada),
      }, MAX_EVITA));
    }

    (r.fuertes || []).filter((l) => l.color === colorRival).sort((a, b) => peso(b) - peso(a))
      .forEach((l) => agregar(evita, Object.assign(lineaNotable(l, colorRival, false), { tipo: "linea", sec: l.sec }), MAX_EVITA));

    const marcar = conDerrotas(r, colorRival);
    // Si cambió de repertorio hace poco, se avisa arriba: el plan puede estar
    // armado con lo que ya no juega.
    const avisos = ((r.reciente && r.reciente.cambios) || []).filter((c) => c.color === colorRival).map((c) => {
      const donde = c.sec.length ? "contra " + A.lineaEs(c.sec) : "de entrada";
      const nueva = c.antesParte < 0.1;
      return {
        texto: "Ojo: últimamente " + donde + " juega " + jugadaNumerada(c.sec, c.ahora.san) + (nueva ? ", que casi no jugaba" : " y ya no tanto " + jugadaNumerada(c.sec, c.antes.san)) + ".",
        porque: "En sus últimas " + c.ahora.n + " partidas ahí la juega el " + pctEntero(c.ahora.parte) + "; antes jugaba " + jugadaNumerada(c.sec, c.antes.san) + " el " + pctEntero(c.antes.parte) + " de las veces. Prepara las dos.",
        sec: c.sec.concat(c.ahora.san),
      };
    });
    return {
      avisos,
      clave,
      titulo: clave === "conBlancas" ? "Cuando tú llevas blancas" : "Cuando tú llevas negras",
      lineas: lineas.map(marcar),
      haz: haz.map(marcar),
      evita: evita.map(marcar),
    };
  }

  /* Lo táctico (js/preparacion-tactica.js): con qué pierde va a «Haz esto»
     (búscalo) y con qué gana, a «No hagas esto» (cuídate). Solo los temas
     que pesan: 3 partidas o más y al menos el 15 % de las que se decidieron
     por material. Cada uno trae el tema de entreno/temas.html para
     practicarlo. */
  const TACTICA = () => (typeof self !== "undefined" && self.PreparacionTactica) || (typeof require === "function" ? require("./preparacion-tactica.js") : null);
  function tactica(r, haz, evita) {
    const t = r.tactica, T = TACTICA();
    if (!t || !T) return;
    const decididas = (lado) => Math.max(1, lado === "sufre" ? t.revisadas.perdidas - t.sinMaterial.perdidas : t.revisadas.ganadas - t.sinMaterial.ganadas);
    const pesan = (lista, lado) => lista.filter((x) => x.tema !== "otra" && x.n >= 3 && x.n / decididas(lado) >= 0.15).slice(0, 2);
    for (const x of pesan(t.sufre, "sufre")) {
      const tm = T.TEMAS[x.tema];
      haz.push({
        texto: x.tema === "colgada" ? "Presiona sus piezas: suele dejarlas sin defender." : "Busca " + tm.plural + ": es con lo que más pierde.",
        porque: x.n + " de sus " + decididas("sufre") + " derrotas por material empezaron así (" + pctEntero(x.n / decididas("sufre")) + ").",
        practica: tm.practica, tema: x.tema,
      });
    }
    for (const x of pesan(t.realiza, "realiza")) {
      const tm = T.TEMAS[x.tema];
      evita.push({
        texto: x.tema === "colgada" ? "No dejes piezas sin defender: las cobra." : "Cuidado con sus " + tm.plural + ": es su táctica más frecuente.",
        porque: x.n + " de sus " + decididas("realiza") + " victorias por material empezaron así (" + pctEntero(x.n / decididas("realiza")) + ").",
        practica: tm.practica, tema: x.tema,
      });
    }
  }

  // En toda la partida: el reloj, cómo pierde, los finales, la táctica.
  function general(r) {
    const haz = [], evita = [];
    tactica(r, haz, evita);
    const senales = A.senalesMasAlla ? A.senalesMasAlla(r) : [];
    for (const x of senales) {
      if (x.tipo === "pierde-en-la-apertura") haz.push({ texto: "Llega con la apertura bien estudiada.", porque: "El " + pctEntero(x.parte) + " de sus derrotas se decide antes de la jugada 20." });
      else if (x.tipo === "pierde-por-tiempo") haz.push({ texto: "Complícale la posición y aprieta el reloj.", porque: "El " + pctEntero(x.parte) + " de sus derrotas son por tiempo (" + x.n + " de " + x.de + ")." });
      else if (x.tipo === "apuros-de-tiempo") haz.push({ texto: "Cuida tu reloj y lleva la partida a lo largo: él se apura al final.", porque: "Se queda con menos del 10 % de su tiempo en el " + pctEntero(x.parte) + " de sus partidas." });
      else if (x.tipo === "piensa-la-apertura") haz.push({ texto: "Sácalo de lo que conoce: en la apertura piensa mucho.", porque: "Gasta el " + pctEntero(x.el) + " de su reloj en las primeras 15 jugadas; sus rivales, el " + pctEntero(x.rivales) + "." });
      else if (x.tipo === "pierde-con-mate") {
        // Si lo táctico ya dice que pierde por mate, no se repite.
        if (!haz.some((h) => h.tema === "mate" || h.tema === "mate-pasillo")) haz.push({ texto: "Ataca a su rey.", porque: "El " + pctEntero(x.parte) + " de sus derrotas terminan en mate." });
      }
      else if (x.tipo === "final-debil") haz.push({ texto: "Cambia piezas hacia un final " + x.final + ".", porque: ("En esos finales " + saca(x.puntos) + " en " + partidas(x.n) + "; su promedio es " + A.pct(x.base) + ". " + pocasPartidas(x.n, r)).trim() });
      else if (x.tipo === "no-convierte") haz.push({ texto: "Si quedas abajo en material en el final, sigue peleando.", porque: "Con ventaja en el final ganó solo " + x.ganadas + " de " + x.n + "." });
      else if (x.tipo === "final-fuerte") evita.push({ texto: "No cambies hacia un final " + x.final + ".", porque: ("En esos finales " + saca(x.puntos) + " en " + partidas(x.n) + ". " + pocasPartidas(x.n, r)).trim() });
      else if (x.tipo === "se-defiende") evita.push({ texto: "No te relajes si ganas material en el final.", porque: "Con desventaja en el final salvó " + x.salvadas + " de " + x.n + "." });
    }
    return { haz, evita };
  }

  /* Las partidas que perdió por esa línea: las que empiezan con esas jugadas,
     con él del color que corresponde. Es la secuencia exacta (no las
     transposiciones), así que pueden ser menos que las partidas del árbol.
     Se guardan 20 medias jugadas por partida: una línea más larga se compara
     hasta ahí. */
  function derrotasEn(r, sec, color) {
    const d = r.derrotas || [];
    if (!sec || !sec.length || !d.length) return { n: 0, lista: [] };
    const hasta = sec.slice(0, 20);
    const suyas = d.filter((x) => x.color === color && hasta.every((m, i) => x.sec[i] === m));
    return { n: suyas.length, lista: suyas.slice(0, 3) };
  }

  function conDerrotas(r, colorRival) {
    return (x) => { if (x.sec) x.derrotas = derrotasEn(r, x.sec, colorRival); return x; };
  }

  /* El ritmo de la partida que viene (r.filtros.partida). Si el análisis ya
     está filtrado a ese ritmo, se dice; si no (tiene muy pocas partidas a
     ese ritmo), se avisa con cuántas cuenta y cuánto saca ahí. */
  function ritmoDeLaPartida(r) {
    const f = r.filtros || {};
    if (!f.partida) return null;
    const en = (r.porRitmo || []).filter((x) => mismoRitmo(x.ritmo, f.partida));
    const n = en.reduce((a, x) => a + x.n, 0);
    if (f.ritmos && f.ritmos.length && f.ritmos.every((x) => mismoRitmo(x, f.partida))) {
      return { aviso: false, texto: "Preparado para una partida a " + f.partida + ": se usan solo sus partidas a ese ritmo (" + partidas(r.total) + ")." };
    }
    const pts = n ? en.reduce((a, x) => a + x.puntos * x.n, 0) / n : null;
    return {
      aviso: true,
      texto: "Tu partida es a " + f.partida + ", y a ese ritmo " + (n ? "tiene " + partidas(n) + " (saca " + A.pct(pts) + ")" : "no tiene ninguna partida") +
        ": son muy pocas para filtrar, así que el análisis usa todos sus ritmos. Tómalo con cuidado: a otro ritmo se juega distinto.",
    };
  }
  // Los ritmos que se juntan: a ritmo lento, rápida y clásica; a ritmo muy
  // rápido, bullet e hiperbullet.
  const GRUPO_RITMO = { "hiperbullet": "bullet", "bullet": "bullet", "blitz": "blitz", "rápida": "lenta", "clásica": "lenta" };
  const mismoRitmo = (a, b) => GRUPO_RITMO[a] && GRUPO_RITMO[a] === GRUPO_RITMO[b];

  // La racha: si en sus partidas recientes saca 10 puntos más (o menos) que antes.
  function racha(r) {
    const c = r.reciente;
    if (!c || c.n < 20 || c.puntos == null || c.antes.puntos == null) return null;
    const dif = c.puntos - c.antes.puntos;
    if (Math.abs(dif) < 0.1) return null;
    return {
      texto: dif > 0 ? "Viene en racha: juega mejor que de costumbre." : "Viene a la baja: juega peor que de costumbre.",
      porque: "En sus últimas " + c.n + " partidas saca " + A.pct(c.puntos) + "; antes, " + A.pct(c.antes.puntos) + ".",
    };
  }

  function armar(r) {
    const g = general(r);
    const ra = racha(r);
    g.avisos = ra ? [ra] : [];
    return { lados: [lado(r, "conBlancas"), lado(r, "conNegras")], general: g, ritmo: ritmoDeLaPartida(r) };
  }

  return { armar, comoLeVa, jugadaNumerada, derrotasEn, mismoRitmo };
});
