/* Preparación de rivales: su tipo de posición.
 *
 * La táctica dice con qué golpes gana y pierde; esto dice en qué POSICIONES le
 * va peor o mejor, para buscarle una partida y no solo una apertura. Se mira
 * cada partida en la jugada 12 (MOMENTO: 24 medias jugadas), cuando la
 * apertura ya terminó y la estructura de peones quedó armada, y se anota qué
 * rasgos tiene:
 *
 *   aislado-suyo / aislado-rival   peón aislado de dama (en d, sin peones en c ni en e)
 *   colgantes-suyo / colgantes-rival  peones colgantes (c y d, sin peones en b ni en e)
 *   centro-cerrado                 un peón central que cruzó y quedó trabado (e5/e6, d5/d6)
 *   centro-abierto                 ningún peón en las columnas d y e
 *   enroques-opuestos              los reyes en alas distintas
 *   sin-damas                      las damas ya se cambiaron
 *
 * Cada rasgo se juzga contra lo esperable para ESAS partidas: el promedio del
 * rival con el color que llevaba en cada una (con negras saca menos, y eso no
 * vuelve débil a toda estructura típica de las negras). Como las líneas del
 * análisis, cuenta cuando se aparta más de lo que explica el azar (z de ±1,28)
 * y en 5 puntos o más, con MIN_PARTIDAS o el mínimo del análisis.
 *
 *   rasgos(estado, colorDelRival) → ["aislado-suyo", "centro-cerrado", …]
 *   analizar(lista, base, minN)   → { momento, total, rasgos: [{ clave, nombre, n, parte, puntos, esperado, veredicto }] }
 *
 * Todo con js/preparacion-posiciones.js: sin chess.js, rápido. Ver «Su tipo
 * de posición» en docs/decisiones/paneles.md.
 */
(function (raiz, fabrica) {
  "use strict";
  const req = (nombre, global) => (raiz && raiz[global]) || (typeof require === "function" ? require(nombre) : null);
  const api = fabrica(req("./preparacion-posiciones.js", "PreparacionPosiciones"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else raiz.PreparacionEstructuras = api;
})(typeof self !== "undefined" ? self : this, function (Pos) {
  "use strict";

  const MOMENTO = 24;         // medias jugadas: la posición después de la jugada 12
  const MIN_PARTIDAS = 8;

  const NOMBRES = {
    "aislado-suyo": "Él con el peón aislado",
    "aislado-rival": "Su rival con el peón aislado",
    "colgantes-suyo": "Él con peones colgantes",
    "colgantes-rival": "Su rival con peones colgantes",
    "centro-cerrado": "Centro cerrado",
    "centro-abierto": "Centro abierto",
    "enroques-opuestos": "Enroques opuestos",
    "sin-damas": "Sin damas",
  };
  // Cómo se busca o se evita cada una, para el resumen.
  const COMO = {
    "aislado-suyo": "posiciones donde él quede con el peón aislado",
    "aislado-rival": "quedarte con el peón aislado",
    "colgantes-suyo": "posiciones donde él quede con peones colgantes",
    "colgantes-rival": "quedarte con peones colgantes",
    "centro-cerrado": "cerrar el centro",
    "centro-abierto": "abrir el centro",
    "enroques-opuestos": "enroques opuestos",
    "sin-damas": "cambiar las damas temprano",
  };

  // Columna 0 = a; fila 0 = la 1 (como js/preparacion-posiciones.js).
  function peonesPorColumna(t, peon) {
    const cols = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let c = 0; c < 64; c++) if (t[c] === peon) cols[c & 7] += 1;
    return cols;
  }
  function columnaDe(t, pieza) { const c = t.indexOf(pieza); return c < 0 ? -1 : c & 7; }

  function rasgos(e, colorRival) {
    const t = e.t;
    const out = [];
    const pb = peonesPorColumna(t, "P"), pn = peonesPorColumna(t, "p");
    const de = (color) => (color === "w" ? pb : pn);
    const otro = colorRival === "w" ? "b" : "w";
    const aislado = (p) => p[3] > 0 && !p[2] && !p[4];
    const colgantes = (p) => p[2] > 0 && p[3] > 0 && !p[1] && !p[4];
    if (aislado(de(colorRival))) out.push("aislado-suyo");
    if (aislado(de(otro))) out.push("aislado-rival");
    if (colgantes(de(colorRival))) out.push("colgantes-suyo");
    if (colgantes(de(otro))) out.push("colgantes-rival");
    // Cerrado: en d o en e, un peón que ya cruzó a la mitad del otro y quedó
    // trabado: blanco en la 5.ª con uno negro delante (e5/e6, d5/d6), o negro
    // en la 4.ª con uno blanco delante (…e4/e3). d4 contra d5 no cierra nada.
    let bloqueado = false;
    for (const col of [3, 4]) {
      if (t[4 * 8 + col] === "P" && t[5 * 8 + col] === "p") bloqueado = true;
      if (t[3 * 8 + col] === "p" && t[2 * 8 + col] === "P") bloqueado = true;
    }
    if (bloqueado) out.push("centro-cerrado");
    if (!pb[3] && !pb[4] && !pn[3] && !pn[4]) out.push("centro-abierto");
    const rb = columnaDe(t, "K"), rn = columnaDe(t, "k");
    if ((rb <= 2 && rn >= 5) || (rb >= 5 && rn <= 2)) out.push("enroques-opuestos");
    if (t.indexOf("Q") < 0 && t.indexOf("q") < 0) out.push("sin-damas");
    return out;
  }

  // La posición en MOMENTO, o null si la partida terminó antes o no se pudo seguir.
  function enElMomento(jugadas) {
    if (jugadas.length < MOMENTO) return null;
    let e = Pos.inicial();
    for (let i = 0; i < MOMENTO && e; i++) e = Pos.aplicar(e, jugadas[i]);
    return e;
  }

  const valor = (res) => (res === "G" ? 1 : res === "T" ? 0.5 : 0);

  function analizar(lista, base, minN) {
    const minimo = Math.max(MIN_PARTIDAS, minN || 0);
    const cuentas = {};
    let total = 0;
    for (const x of lista) {
      const e = enElMomento(x.jugadas || []);
      if (!e) continue;
      total += 1;
      const esperado = base[x.color] ?? 0.5;
      for (const k of rasgos(e, x.color)) {
        const c = cuentas[k] || (cuentas[k] = { n: 0, pts: 0, esp: 0 });
        c.n += 1; c.pts += valor(x.res); c.esp += esperado;
      }
    }
    if (!total) return null;
    const out = Object.keys(NOMBRES).filter((k) => cuentas[k]).map((k) => {
      const c = cuentas[k];
      const puntos = c.pts / c.n, esperado = c.esp / c.n;
      const v = Math.max(esperado * (1 - esperado), 0.1) / c.n;
      const z = (puntos - esperado) / Math.sqrt(v);
      const dif = puntos - esperado;
      const veredicto = c.n < minimo ? 0 : z <= -1.28 && dif <= -0.05 ? -1 : z >= 1.28 && dif >= 0.05 ? 1 : 0;
      return { clave: k, nombre: NOMBRES[k], como: COMO[k], n: c.n, parte: c.n / total, puntos, esperado, veredicto };
    });
    // Primero lo que se aparta (lo débil, después lo fuerte), y dentro, lo que más pesa.
    const peso = (x) => Math.abs(x.puntos - x.esperado) * Math.sqrt(x.n);
    out.sort((a, b) => (a.veredicto === b.veredicto ? peso(b) - peso(a) : a.veredicto === -1 ? -1 : b.veredicto === -1 ? 1 : a.veredicto === 1 ? -1 : 1));
    return { momento: MOMENTO / 2, total, minimo, rasgos: out };
  }

  return { analizar, rasgos, MOMENTO, NOMBRES };
});
