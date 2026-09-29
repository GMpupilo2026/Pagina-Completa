/* ===== El ajuste de la dificultad de los Mates con los intentos reales =====
 *
 * Lo usan herramientas/mates-calibrar.js (con los datos de verdad) y
 * herramientas/verificar-mates-calibrar.js (con datos inventados de dificultad
 * CONOCIDA, para ver que el ajuste la recupera). Un solo ajuste para los dos:
 * si el verificador probara una copia, no probaría nada.
 *
 * El modelo es el del diagnóstico (PlanEntrenamiento.probabilidad, la curva del
 * Elo, sin azar porque en Mates se mueve una pieza): la probabilidad de que un
 * alumno de fuerza F resuelva LIMPIO (sin error y sin pista) un mate de
 * dificultad D es 1 / (1 + 10^((D − F) / 400)). Se ajusta por turnos, igual
 * que herramientas/diagnostico-calibrar.js:
 *   1. el centro de cada categoría (mate en 1, en 2, en 3), con TODOS sus
 *      intentos juntos: un solo número por categoría, que se mueve con pocos
 *      datos. Parte de CENTRO_INICIAL ± DESVIO_CENTRO.
 *   2. cada mate, partiendo del centro de su categoría con ± DESVIO_MATE: uno
 *      que intentaron dos alumnos casi no se aparta; uno que intentaron
 *      treinta, sí.
 *   3. la fuerza de cada alumno, partiendo de su medida: la fuerza del último
 *      diagnóstico (± su error), si no el Elo de su perfil (± el margen de su
 *      origen: FIDE ± 100, en línea ± 250…), y si no 1200 ± 500. Eso ancla la
 *      escala al Elo de verdad.
 *
 * Entrada: { alumnos: [{ k, medido, error, elo, tipo }], intentos: [{ k, id, limpio }] }
 * (k es un número por alumno, no su identidad). Un alumno cuenta UN intento
 * por mate: Mates registra solo la primera vez que se resuelve, y si hay dos
 * filas (se borró el navegador) vale la primera.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..", "..");
const ventana = {};
new Function("window", fs.readFileSync(path.join(RAIZ, "js/plan-entrenamiento.js"), "utf8"))(ventana);
const PE = ventana.PlanEntrenamiento;

const CENTRO_INICIAL = { mate1: 1000, mate2: 1400, mate3: 1700 };
const DESVIO_CENTRO = 400;
const DESVIO_MATE = 300;
const SIN_MEDIDA = { media: 1200, desvio: 500 };
const VUELTAS = 20;
const DESDE = 100, HASTA = 3200, PASO = 10;

const categoriaDe = (id) => String(id).split("-")[0];

/* El punto de partida de la fuerza de un alumno: lo más preciso que haya. */
function partidaDe(a) {
  const medido = PE.eloValido(a.medido);
  if (medido) return { media: medido, desvio: Math.max(50, Number(a.error) || 150) };
  const elo = PE.eloValido(a.elo);
  const tipo = PE.ELO_TIPO_POR_ID[a.tipo] || PE.ELO_TIPO_POR_ID.estimado;
  if (elo) return { media: elo, desvio: tipo.desvio };
  return SIN_MEDIDA;
}

/* El valor de la rejilla que hace más probable lo observado, con su punto de
   partida como previa normal. `obs` es [[rival, acierto], …], y `signo` dice
   de qué lado está quien se estima: +1 un alumno (fuerza contra dificultades),
   −1 un mate (dificultad contra fuerzas). */
function mejorValor(centro, desvio, obs, signo) {
  let mejor = centro, max = -Infinity;
  for (let x = DESDE; x <= HASTA; x += PASO) {
    let lp = -0.5 * Math.pow((x - centro) / desvio, 2);
    for (let i = 0; i < obs.length; i++) {
      const [otro, ok] = obs[i];
      const p = signo > 0 ? PE.probabilidad(x, otro, 0) : PE.probabilidad(otro, x, 0);
      lp += Math.log(ok ? p : 1 - p);
    }
    if (lp > max) { max = lp; mejor = x; }
  }
  return mejor;
}

function ajustar(datos) {
  const alumnos = {};
  (datos.alumnos || []).forEach((a) => { alumnos[a.k] = { partida: partidaDe(a), fuerza: partidaDe(a).media, intentos: [] }; });
  const mates = {};
  const vistos = new Set();
  (datos.intentos || []).forEach((t) => {
    const cat = categoriaDe(t.id);
    if (!CENTRO_INICIAL[cat] || typeof t.limpio !== "boolean") return;
    if (!alumnos[t.k]) alumnos[t.k] = { partida: SIN_MEDIDA, fuerza: SIN_MEDIDA.media, intentos: [] };
    const clave = t.k + "|" + t.id;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    const m = mates[t.id] || (mates[t.id] = { cat, elo: CENTRO_INICIAL[cat], intentos: [] });
    m.intentos.push([t.k, t.limpio]);
    alumnos[t.k].intentos.push([t.id, t.limpio]);
  });
  const centros = Object.assign({}, CENTRO_INICIAL);
  const idsPorCat = {};
  Object.keys(mates).forEach((id) => { (idsPorCat[mates[id].cat] = idsPorCat[mates[id].cat] || []).push(id); });

  for (let v = 0; v < VUELTAS; v++) {
    // 1. El centro de cada categoría: se corre la categoría entera, cada mate
    //    con lo que ya se aparta de su centro.
    Object.keys(idsPorCat).forEach((cat) => {
      const ids = idsPorCat[cat];
      let mejor = centros[cat], max = -Infinity;
      for (let c = DESDE; c <= HASTA; c += PASO) {
        let lp = -0.5 * Math.pow((c - CENTRO_INICIAL[cat]) / DESVIO_CENTRO, 2);
        ids.forEach((id) => {
          const m = mates[id], d = m.elo - centros[cat] + c;
          m.intentos.forEach(([k, ok]) => {
            const p = PE.probabilidad(alumnos[k].fuerza, d, 0);
            lp += Math.log(ok ? p : 1 - p);
          });
        });
        if (lp > max) { max = lp; mejor = c; }
      }
      ids.forEach((id) => { mates[id].elo += mejor - centros[cat]; });
      centros[cat] = mejor;
    });
    // 2. Cada mate, desde el centro de su categoría.
    Object.keys(mates).forEach((id) => {
      const m = mates[id];
      m.elo = mejorValor(centros[m.cat], DESVIO_MATE, m.intentos.map(([k, ok]) => [alumnos[k].fuerza, ok]), -1);
    });
    // 3. Cada alumno, desde su medida.
    Object.keys(alumnos).forEach((k) => {
      const a = alumnos[k];
      a.fuerza = mejorValor(a.partida.media, a.partida.desvio, a.intentos.map(([id, ok]) => [mates[id].elo, ok]), 1);
    });
  }
  return { mates, centros, alumnos };
}

/* Lo que se publica: SOLO números agregados por mate y por categoría, nunca
   nada de un alumno. Un mate entra con `minimo` intentos o más; con menos, su
   dificultad es casi la previa y ordenar por ella sería ordenar por ruido. */
function publicar(ajuste, total, minimo, fecha) {
  const elo = {};
  const categorias = {};
  Object.keys(CENTRO_INICIAL).forEach((cat) => {
    categorias[cat] = { centro: Math.round(ajuste.centros[cat]), calibrados: 0, total: total[cat] || 0 };
  });
  Object.keys(ajuste.mates).sort().forEach((id) => {
    const m = ajuste.mates[id];
    if (m.intentos.length < minimo) return;
    elo[id] = Math.round(m.elo);
    categorias[m.cat].calibrados += 1;
  });
  const alumnos = Object.values(ajuste.alumnos).filter((a) => a.intentos.length).length;
  const intentos = Object.values(ajuste.mates).reduce((s, m) => s + m.intentos.length, 0);
  return { generado: fecha, intentos, alumnos, minimo, categorias, elo };
}

module.exports = { ajustar, publicar, categoriaDe, CENTRO_INICIAL, PE };
