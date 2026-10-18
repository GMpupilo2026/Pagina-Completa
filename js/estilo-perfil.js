/* ===== Ajedrez Integral — La medición de la prueba de estilo =====
 *
 * Qué tipo de juego prefiere una persona, eje por eje (atacar o maniobrar,
 * abrir o cerrar, cambiar o mantener piezas, quedarse con el material o
 * darlo por la iniciativa), con su margen. Qué ejes mide y cuántas preguntas
 * lleva depende de la VERSIÓN de la prueba (FORMAS en js/estilo-items.js):
 * una prueba vieja se lee con la forma de la suya. Las preguntas
 * están en js/estilo-items.js; las aperturas que le quedan a cada estilo, en
 * js/estilo-aperturas.js.
 *
 * Cada respuesta es una elección entre las dos jugadas de una posición: «1»
 * si eligió el primer polo del eje (atacar, abrir, cambiar, material), «0» si no. Por
 * eje se busca la tendencia θ que mejor explica las elecciones, con el modelo
 * de dos parámetros de siempre:
 *
 *     P(elige el primer polo) = σ(a · (θ − b))
 *
 *   - `b`, el TIRÓN de la posición: hay posiciones donde casi todos eligen lo
 *     mismo aunque las dos jugadas valgan igual. Sin corregirlo, quien contesta
 *     muchas de esas parecería tener un estilo que no tiene.
 *   - `a`, cuánto DISTINGUE la posición: si quienes atacan en el resto de la
 *     prueba también la eligen atacando, distingue; si da igual, casi no dice
 *     nada.
 *   Los dos los calcula herramientas/estilo-calibrar.js con las respuestas
 *   reales (bloque CALIBRADO del banco). Mientras no hay suficientes, a = 1 y
 *   b = 0: todas las posiciones pesan igual y ninguna tira.
 *
 * Cada respuesta pesa además según:
 *   - lo SEGURA que estaba la persona («muy seguro» 1, «más o menos» 0,7, «me
 *     da igual» 0,3): un «me da igual» es casi no contestar;
 *   - el TIEMPO que tardó: elegir en menos de 20 segundos es una preferencia
 *     firme; después baja de a poco hasta 0,7 a los 90 segundos (quien duda
 *     tanto no tiene una preferencia clara, pero tampoco contestó al azar).
 *
 * Las POSICIONES DE CONTROL: dos preguntas ya contestadas vuelven más
 * adelante con los colores invertidos (la misma posición dada vuelta, que no
 * se reconoce a simple vista). Si la persona elige distinto, contesta en
 * parte al azar: el margen de los tres ejes se ensancha un 25 % por cada
 * control que no coincide. El control no suma como respuesta (sería contar
 * dos veces la misma).
 *
 * Las PARTIDAS REALES (js/estilo-partidas.js): cada momento de sus partidas
 * en que tuvo dos jugadas parejas de carácter opuesto es una elección más,
 * con peso 0,5 (la medición es más ruidosa: no se sabe si vio la otra), y
 * nunca más de peso por eje que la mitad de las preguntas de ese eje (5 en
 * la versión 1, 4 en la 2): las partidas corrigen la prueba, no la
 * reemplazan (con el tope igual a las preguntas, 200 momentos que decían lo
 * contrario la dejaban en un empate exacto).
 *
 * La OPINIÓN DE SU PROFE (public.estilo_opiniones): por eje, el primer
 * polo, el segundo o «las dos por igual». Pesa lo que DOS preguntas
 * (PESO_PROFE): lo ve jugar, pero no se sabe cuántas partidas miró; «las dos
 * por igual» son una a cada lado. Una por profe. No cuenta para decidir si
 * la prueba agrega preguntas: eso es lo que contesta el alumno; se suma al
 * resultado.
 *
 * Con todo eso, θ por máximo a posteriori (con una previa normal de desvío
 * 1,5, que con pocas respuestas no deja afirmar de más) y su error estándar.
 * El margen es del 95 %: quien contesta al azar sale «claramente» en
 * alrededor del 3 % de los ejes (9 de 10 para el mismo lado pasa), y las
 * posiciones de control son las que lo frenan.
 * Lo que se muestra es P = σ(θ) y su intervalo del 95 %, y una etiqueta que
 * nunca dice más que el margen:
 *   «claramente X»     el intervalo entero de un lado y P ≥ 75 % (o ≤ 25 %)
 *   «tendencia a X»    el intervalo entero de un lado
 *   «equilibrado»      el intervalo entero entre 30 % y 70 %
 *   «sin definir»      lo demás: ahí la prueba agrega preguntas de ese eje.
 *
 * La VERSIÓN CORTA para quien empieza (`Prueba({ version: 3 })`): las mismas
 * reglas, con las posiciones más simples (FORMAS[3].posiciones), 6 por eje y
 * hasta 2 más.
 *
 * LA PRUEBA ADAPTATIVA (`Prueba`): `porEje` preguntas por eje (8 en la
 * versión 2), alternando ejes, con los dos controles intercalados; después,
 * en cada eje «sin definir», hasta `extraPorEje` más (6), de a una, mientras
 * siga sin definir. Nadie pasa de 58 preguntas (56 y los dos controles), y
 * quien tiene un estilo claro termina en 34.
 */
(function () {
  "use strict";

  const SEGURIDAD = { 3: 1, 2: 0.7, 1: 0.3 };
  const PREVIA = 1.5;
  const Z = 1.96;
  const PESO_PARTIDA = 0.5, PESO_PROFE = 2;
  const ENSANCHE_CONTROL = 0.25;

  const banco = () => (typeof window !== "undefined" && window.EstiloItems)
    || (typeof require === "function" ? require("./estilo-items.js") : null);
  const medidas = () => (typeof window !== "undefined" && window.EstiloMedidas)
    || (typeof require === "function" ? require("./estilo-medidas.js") : null);

  const sigma = (x) => 1 / (1 + Math.exp(-x));
  // Todos los ejes que conoce el banco; los de una prueba, los de su forma.
  const EJES = Object.keys(banco().EJES);
  const formaDe = (version) => (banco().FORMAS || {})[version || banco().VERSION] || banco().FORMA;
  // Lo más que pesan sus partidas en un eje: la mitad de las preguntas.
  const topePartidas = (version) => formaDe(version).porEje / 2;

  function pesoTiempo(ms) {
    if (!(ms > 0)) return 1;
    const s = ms / 1000;
    if (s <= 20) return 1;
    if (s >= 90) return 0.7;
    return 1 - 0.3 * (s - 20) / 70;
  }

  const calibracionDe = (id) => {
    const c = (banco().CALIBRADO || {})[id];
    return c && c.a > 0 ? c : { a: 1, b: 0 };
  };

  /* θ por máximo a posteriori (Newton) y su error estándar. */
  function estimar(obs) {
    let t = 0;
    for (let it = 0; it < 50; it++) {
      let g = -t / (PREVIA * PREVIA), h = -1 / (PREVIA * PREVIA);
      for (const o of obs) {
        const p = sigma(o.a * (t - o.b));
        g += o.w * o.a * (o.y - p);
        h -= o.w * o.a * o.a * p * (1 - p);
      }
      const paso = g / h;
      t -= Math.max(-2, Math.min(2, paso));
      if (Math.abs(paso) < 1e-7) break;
    }
    let info = 1 / (PREVIA * PREVIA);
    for (const o of obs) { const p = sigma(o.a * (t - o.b)); info += o.w * o.a * o.a * p * (1 - p); }
    return { theta: t, se: 1 / Math.sqrt(info) };
  }

  const pct = (x) => Math.round(100 * x);
  function etiquetar(eje, x) {
    const [uno, otro] = medidas().POLOS[eje];
    const E = (banco().EJES || {})[eje] || { polos: {} };
    const nombre = (polo) => (E.polos[polo] || polo).toLowerCase();
    if (x.lo > 0.5) return { tipo: x.p >= 0.75 ? "claro" : "tendencia", polo: uno, texto: (x.p >= 0.75 ? "Claramente: " : "Tendencia a: ") + nombre(uno) };
    if (x.hi < 0.5) return { tipo: x.p <= 0.25 ? "claro" : "tendencia", polo: otro, texto: (x.p <= 0.25 ? "Claramente: " : "Tendencia a: ") + nombre(otro) };
    if (x.lo >= 0.3 && x.hi <= 0.7) return { tipo: "equilibrado", polo: null, texto: "Equilibrado: " + nombre(uno) + " o " + nombre(otro) + ", según la posición" };
    return { tipo: "sin definir", polo: null, texto: "Sin definir todavía" };
  }

  /* El polo que eligió en una respuesta: el de la jugada «a» o la «b». */
  const poloElegido = (item, eleccion) => (eleccion === "a" ? item.a.polo : eleccion === "b" ? item.b.polo : null);

  /* respuestas: [{ id, eleccion: "a"|"b", seguridad: 1..3, ms, control?: idOriginal }]
     partidas:   [{ eje, primero: true|false }] (js/estilo-partidas.js)
     version:    la de la prueba (la fila guardada); sin ella, la de hoy.
     opiniones:  [{ eje, opinion: 1|0|-1 }], una por profe (estilo_opiniones).
     Devuelve un eje por cada uno de su forma, y `lista` con sus nombres. */
  function medir(respuestas, partidas, version, opiniones) {
    const B = banco(), Mm = medidas();
    const ejes = formaDe(version).ejes;
    const porId = new Map(B.ITEMS.map((i) => [i.id, i]));
    const obs = {};
    for (const e of ejes) obs[e] = [];
    const dadas = new Map();
    for (const r of respuestas || []) {
      if (r.control) continue;
      const it = porId.get(r.id);
      const polo = it && obs[it.eje] && poloElegido(it, r.eleccion);
      if (!polo) continue;
      dadas.set(r.id, polo);
      const c = calibracionDe(r.id);
      obs[it.eje].push({ y: polo === Mm.POLOS[it.eje][0] ? 1 : 0, w: (SEGURIDAD[r.seguridad] || SEGURIDAD[2]) * pesoTiempo(r.ms), a: c.a, b: c.b, de: "prueba" });
    }
    // Los controles: ¿eligió lo mismo con los colores invertidos?
    const controles = (respuestas || []).filter((r) => r.control).map((r) => {
      const it = porId.get(r.control);
      const antes = dadas.get(r.control);
      const ahora = it && poloElegido(it, r.eleccion);
      return { id: r.control, eje: it && it.eje, coincide: !!(antes && ahora && antes === ahora), contestado: !!(antes && ahora) };
    }).filter((c) => c.contestado);
    const fallados = controles.filter((c) => !c.coincide).length;
    // Las partidas: peso 0,5 cada momento, hasta la mitad de las preguntas.
    const deJuego = {};
    for (const o of partidas || []) if (obs[o.eje]) deJuego[o.eje] = (deJuego[o.eje] || 0) + 1;
    const tope = topePartidas(version);
    for (const o of partidas || []) {
      if (!obs[o.eje]) continue;
      const w = Math.min(PESO_PARTIDA, tope / deJuego[o.eje]);
      obs[o.eje].push({ y: o.primero ? 1 : 0, w, a: 1, b: 0, de: "partidas" });
    }
    // Lo que ve su profe: dos preguntas a su lado, o una a cada lado.
    for (const o of opiniones || []) {
      if (!obs[o.eje] || ![1, 0, -1].includes(o.opinion)) continue;
      if (o.opinion === 0) {
        obs[o.eje].push({ y: 1, w: PESO_PROFE / 2, a: 1, b: 0, de: "profe" }, { y: 0, w: PESO_PROFE / 2, a: 1, b: 0, de: "profe" });
      } else {
        obs[o.eje].push({ y: o.opinion === 1 ? 1 : 0, w: PESO_PROFE, a: 1, b: 0, de: "profe" });
      }
    }
    const out = { controles: { total: controles.length, fallados }, ejes: {}, lista: ejes.slice() };
    for (const e of ejes) {
      const { theta, se } = estimar(obs[e]);
      const seAncho = se * (1 + ENSANCHE_CONTROL * fallados);
      const x = {
        n: obs[e].filter((o) => o.de === "prueba").length,
        nPartidas: obs[e].filter((o) => o.de === "partidas").length,
        nProfe: (opiniones || []).filter((o) => o.eje === e && [1, 0, -1].includes(o.opinion)).length,
        theta, se: seAncho,
        p: sigma(theta), lo: sigma(theta - Z * seAncho), hi: sigma(theta + Z * seAncho),
      };
      x.etiqueta = etiquetar(e, x);
      out.ejes[e] = x;
      out[e] = x;
    }
    return out;
  }

  /* POR QUÉ DICE LO QUE DICE: de cada eje, hasta `cuantos` posiciones de su
     propia prueba que muestran el resultado. Con un lado (claro o tendencia),
     las que eligió de ese lado; equilibrado o sin definir, una de cada lado
     (las dos cosas que hizo), o las de uno si eligió siempre lo mismo. Primero las que eligió más seguro, después las
     que más distinguen (a de la calibración) y las que eligió más rápido; a
     igualdad, por id. Las posiciones de control no (son repetidas).
     → { [eje]: [{ item, eleccion, polo, otroPolo }] } */
  function ejemplos(respuestas, perfil, cuantos) {
    const B = banco(), Mm = medidas();
    const n = cuantos || 2;
    const porId = new Map(B.ITEMS.map((i) => [i.id, i]));
    const out = {};
    for (const e of (perfil && perfil.lista) || []) {
      const x = perfil[e];
      const dadas = [];
      for (const r of respuestas || []) {
        if (r.control) continue;
        const it = porId.get(r.id);
        if (!it || it.eje !== e) continue;
        const polo = poloElegido(it, r.eleccion);
        if (!polo) continue;
        const otro = r.eleccion === "a" ? it.b.polo : it.a.polo;
        dadas.push({ item: it, eleccion: r.eleccion, polo, otroPolo: otro, seg: r.seguridad || 2, ms: r.ms || 0, a: calibracionDe(it.id).a });
      }
      const orden = (p, q) => (q.seg - p.seg) || (q.a - p.a) || (p.ms - q.ms) || (p.item.id < q.item.id ? -1 : 1);
      dadas.sort(orden);
      let elegidas;
      if (x && x.etiqueta && x.etiqueta.polo) {
        elegidas = dadas.filter((d) => d.polo === x.etiqueta.polo).slice(0, n);
      } else {
        // Sin un lado: una de cada lado si eligió de los dos; si eligió de
        // uno solo (pocas respuestas), las de ese.
        const deCada = Mm.POLOS[e].map((polo) => dadas.find((d) => d.polo === polo)).filter(Boolean);
        elegidas = (deCada.length > 1 ? deCada : dadas).slice(0, n);
      }
      out[e] = elegidas.map(({ item, eleccion, polo, otroPolo }) => ({ item, eleccion, polo, otroPolo }));
    }
    return out;
  }

  /* Una frase por eje, con el número y su margen (el nombre del eje y su
     etiqueta van aparte, arriba). `tu`: a la persona misma («elegiste»); si
     no, a su profe («eligió»). */
  function frase(eje, x, tu) {
    const [uno] = medidas().POLOS[eje];
    const E = banco().EJES[eje];
    const momentos = x.nPartidas ? ` y ${x.nPartidas} ${x.nPartidas === 1 ? "momento" : "momentos"} de ${tu ? "tus" : "sus"} partidas` : "";
    const profe = x.nProfe ? `, más lo que ${x.nProfe === 1 ? (tu ? "ve tu profe" : "ve su profe") : (tu ? "ven tus profes" : "ven sus profes")}` : "";
    return `${tu ? "Elegiste" : "Eligió"} «${E.polos[uno].toLowerCase()}» el ${pct(x.p)} % de las veces (entre ${pct(x.lo)} y ${pct(x.hi)} %), `
      + `con ${x.n} ${x.n === 1 ? "pregunta" : "preguntas"}${momentos}${profe}.`;
  }

  /* -------- La posición de control: la misma pregunta con los colores invertidos -------- */
  function espejo(item, Chess) {
    const Mm = medidas();
    const fen = Mm.espejoFen(item.fen);
    const jug = (j) => {
      const uci = Mm.espejoUci(j.uci);
      const c = new Chess(fen);
      const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!m) throw new Error("El espejo de " + item.id + " no es legal");
      return Object.assign({}, j, { uci, san: m.san, linea: j.linea.map(Mm.espejoUci) });
    };
    return Object.assign({}, item, { id: item.id + "~", fen, a: jug(item.a), b: jug(item.b), control: item.id });
  }

  /* -------- La prueba adaptativa -------- */
  function barajar(lista, azar) {
    const c = lista.slice();
    for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
    return c;
  }

  /* `azar` se puede pasar (el verificador usa uno fijo). `Chess`, para armar
     los controles. */
  function Prueba(opciones) {
    const o = opciones || {};
    const azar = o.azar || Math.random;
    const B = banco();
    const version = o.version || B.VERSION;
    const F = formaDe(version);
    const ejes = F.ejes;
    const permitidas = F.posiciones ? new Set(F.posiciones) : null;
    const porEje = {};
    for (const e of ejes) {
      // Las de una partida ya usada en una prueba anterior van al final: al
      // repetir la prueba, primero lo que no vio.
      const vistas = new Set(o.vistas || []);
      const del = barajar(B.ITEMS.filter((i) => i.eje === e && (!permitidas || permitidas.has(i.id))), azar);
      porEje[e] = del.filter((i) => !vistas.has(i.id)).concat(del.filter((i) => vistas.has(i.id)));
    }
    const base = [];
    for (let k = 0; k < F.porEje; k++) for (const e of ejes) base.push(porEje[e][k]);
    const extras = {};
    for (const e of ejes) extras[e] = porEje[e].slice(F.porEje, F.porEje + F.extraPorEje);
    // Los controles: la 2.ª y la 5.ª pregunta, de dos ejes distintos, vuelven
    // dadas vuelta en los lugares 13 y 25.
    const cola = base.slice();
    if (o.Chess && F.controles) {
      const a = base[1], b = base[4];
      cola.splice(12, 0, espejo(a, o.Chess));
      cola.splice(24, 0, espejo(b, o.Chess));
    }
    const respuestas = [];
    let hechas = 0;
    const extrasHechas = {};
    for (const e of ejes) extrasHechas[e] = 0;
    return {
      respuestas,
      /* La pregunta que sigue, o null si terminó. */
      siguiente() {
        if (hechas < cola.length) return cola[hechas];
        const perfil = medir(respuestas, o.partidas, version);
        for (const e of ejes) {
          if (perfil[e].etiqueta.tipo === "sin definir" && extrasHechas[e] < extras[e].length) {
            const it = extras[e][extrasHechas[e]];
            return it;
          }
        }
        return null;
      },
      responder(item, r) {
        respuestas.push(Object.assign({ id: item.control || item.id }, item.control ? { control: item.control } : {}, r));
        if (hechas < cola.length) hechas++;
        else extrasHechas[item.eje]++;
      },
      /* Cuántas van y cuántas faltan como mínimo (para la barra). */
      avance() { return { hechas: respuestas.length, minimo: cola.length }; },
      version,
      perfil() { return medir(respuestas, o.partidas, version, o.opiniones); },
    };
  }

  const api = { SEGURIDAD, EJES, PREVIA, PESO_PARTIDA, PESO_PROFE, ENSANCHE_CONTROL, formaDe, topePartidas, pesoTiempo, estimar, medir, ejemplos, etiquetar, frase, espejo, Prueba, sigma };
  if (typeof window !== "undefined") window.EstiloPerfil = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
