/* ===== Normas de título (GM, IM, WGM, WIM): el cálculo, sin pantalla =====
 *
 * Con el Reglamento de Títulos de FIDE vigente desde el 1/1/2024 (B.01),
 * artículo por artículo:
 *   1.4.1a  al menos 9 partidas; 1.4.1c: en un torneo de 9 rondas, 8
 *           partidas con una incomparecencia a favor o un bye del pareo
 *           cuentan como 9 (una sola vez por solicitud: se avisa);
 *   1.4.1e  en un suizo, se pueden dejar afuera las rondas después de lograr
 *           la norma; 1.4.1f: y las partidas contra rivales a los que se les
 *           ganó (en los dos casos, mientras quede el mínimo de partidas y la
 *           mezcla de rivales);
 *   1.4.1d  cada punto entero de más cuenta como una partida más;
 *   1.4.2c  las partidas ganadas o perdidas por incomparecencia no cuentan;
 *   1.4.3   al menos dos federaciones distintas de la del jugador (salvo los
 *           torneos exentos, que se marcan a mano: campeonato nacional,
 *           zonal…); FID no cuenta como extranjera;
 *   1.4.4   como máximo 3/5 de los rivales de su federación y 2/3 de una
 *           sola (redondeando hacia abajo);
 *   1.4.5   al menos la mitad con título (GM, IM, WGM, WIM, FM o WFM: no
 *           CM ni WCM), y al menos 1/3, con un mínimo de 3, con el título
 *           que pide la norma o uno mayor (redondeando hacia arriba);
 *   1.4.6   el Elo de la lista vigente; sin Elo, 1400; el rival de menos
 *           Elo, si está por debajo del piso (2200 / 2050 / 2000 / 1850),
 *           sube al piso, y solo ese;
 *   1.4.7   el promedio, redondeado (0,5 hacia arriba);
 *   1.4.8   promedio mínimo (2380 / 2230 / 2180 / 2030), 35 % como mínimo y
 *           el rendimiento Rp = promedio + dp (tabla 1.4.9, con el
 *           porcentaje redondeado al entero) de 2600 / 2450 / 2400 / 2250.
 *
 * Lo que no se puede saber desde los resultados (el ritmo, el árbitro
 * principal IA o FA, los 90 días, que esté en la lista de FIDE) se dice como
 * «revísalo tú», nunca se da por hecho. Ver «Normas de título» en
 * docs/decisiones/juegos-y-torneos.md.
 *
 *   NormasTitulo.evaluar(jugador, opciones) → { titulos: [{ titulo, norma,
 *     mejor: { partidas, ignoradas, chequeos: [...] } }] }
 */
(function (raiz) {
  "use strict";

  const NORMAS = {
    GM: { nombre: "Gran Maestro (GM)", piso: 2200, promedio: 2380, rp: 2600, valen: ["GM"] },
    IM: { nombre: "Maestro Internacional (IM)", piso: 2050, promedio: 2230, rp: 2450, valen: ["GM", "IM"] },
    WGM: { nombre: "Gran Maestra Femenina (WGM)", piso: 2000, promedio: 2180, rp: 2400, valen: ["GM", "IM", "WGM"] },
    WIM: { nombre: "Maestra Internacional Femenina (WIM)", piso: 1850, promedio: 2030, rp: 2250, valen: ["GM", "IM", "WGM", "WIM"] },
  };
  const CON_TITULO = ["GM", "IM", "WGM", "WIM", "FM", "WFM"]; // 0.3, sin CM ni WCM
  const SIN_ELO = 1400;
  const MINIMO_PARTIDAS = 9;
  const MINIMO_PORCENTAJE = 35;

  // La tabla 1.4.9: el porcentaje (0 a 100) → dp. Escrita tal cual.
  const DP = [-800, -677, -589, -538, -501, -470, -444, -422, -401, -383, -366, -351, -336, -322, -309, -296, -284, -273, -262, -251,
    -240, -230, -220, -211, -202, -193, -184, -175, -166, -158, -149, -141, -133, -125, -117, -110, -102, -95, -87, -80, -72, -65, -57,
    -50, -43, -36, -29, -21, -14, -7, 0, 7, 14, 21, 29, 36, 43, 50, 57, 65, 72, 80, 87, 95, 102, 110, 117, 125, 133, 141, 149, 158, 166,
    175, 184, 193, 202, 211, 220, 230, 240, 251, 262, 273, 284, 296, 309, 322, 336, 351, 366, 383, 401, 422, 444, 470, 501, 538, 589, 677, 800];
  const redondear = (x) => Math.floor(x + 0.5); // 0,5 hacia arriba (1.4.7b y la nota de la tabla)
  const porcentaje = (puntos, n) => redondear((puntos / n) * 100 + 1e-9);

  /* Una mezcla de partidas (todas jugadas sobre el tablero) contra la norma
     de un título. Devuelve los chequeos, uno por artículo. */
  function chequear(cual, jugador, partidas, opciones) {
    const N = NORMAS[cual];
    const n = partidas.length;
    const ch = [];
    const agregar = (art, ok, texto, extra) => ch.push(Object.assign({ art, ok, texto }, extra || {}));

    const cuentaComo9 = !!opciones.ochoComoNueve && n === 8;
    agregar("1.4.1", n >= MINIMO_PARTIDAS || cuentaComo9,
      n >= MINIMO_PARTIDAS ? n + " partidas jugadas (hacen falta 9)."
        : cuentaComo9 ? "8 partidas en un torneo de 9 rondas, con una incomparecencia a favor o un bye del pareo: cuentan como 9 (1.4.1c; una sola vez por solicitud)."
          : "Solo " + n + " partidas jugadas: hacen falta 9 (las ganadas o perdidas por incomparecencia no cuentan, 1.4.2c).");

    const propia = String(jugador.fed || "").toUpperCase();
    const feds = {};
    partidas.forEach((p) => { const f = String(p.rival.fed || "?").toUpperCase(); feds[f] = (feds[f] || 0) + 1; });
    const otras = Object.keys(feds).filter((f) => f !== propia && f !== "FID" && f !== "?");
    if (opciones.exentoFederaciones) agregar("1.4.3", true, "Torneo exento del requisito de federaciones (lo marcaste: campeonato nacional, zonal…).");
    else agregar("1.4.3", otras.length >= 2, otras.length >= 2 ? "Rivales de " + otras.length + " federaciones distintas de la suya (" + otras.sort().join(", ") + ")." : "Rivales de " + otras.length + (otras.length === 1 ? " federación distinta" : " federaciones distintas") + " de la suya: hacen falta 2.");
    if (!opciones.exentoFederaciones) {
      const maxPropia = Math.floor((3 * n) / 5), maxUna = Math.floor((2 * n) / 3);
      const dePropia = feds[propia] || 0;
      const [masFed, masCuantos] = Object.entries(feds).sort((a, b) => b[1] - a[1])[0] || ["", 0];
      agregar("1.4.4", dePropia <= maxPropia && masCuantos <= maxUna,
        dePropia + " de su federación (máximo " + maxPropia + ") y como mucho " + masCuantos + " de una sola, " + masFed + " (máximo " + maxUna + ").");
    }

    const conTitulo = partidas.filter((p) => CON_TITULO.includes(p.rival.titulo)).length;
    const minTitulo = Math.ceil(n / 2);
    agregar("1.4.5a", conTitulo >= minTitulo, conTitulo + " rivales con título (hacen falta " + minTitulo + "; CM y WCM no cuentan).");
    const deNorma = partidas.filter((p) => N.valen.includes(p.rival.titulo)).length;
    const minNorma = Math.max(3, Math.ceil(n / 3));
    agregar("1.4.5", deNorma >= minNorma, deNorma + " rivales " + N.valen.join(", ") + " (hacen falta " + minNorma + ").");

    // 1.4.6: sin Elo, 1400; solo el de menos Elo sube al piso.
    const elos = partidas.map((p) => (p.rival.elo > 0 ? p.rival.elo : SIN_ELO));
    let subido = null;
    const iMin = elos.reduce((m, e, i) => (e < elos[m] ? i : m), 0);
    if (n && elos[iMin] < N.piso) { subido = { rival: partidas[iMin].rival.nombre, de: elos[iMin], a: N.piso }; elos[iMin] = N.piso; }
    const ra = n ? redondear(elos.reduce((a, b) => a + b, 0) / n) : 0;
    agregar("1.4.7", ra >= N.promedio, "Promedio de los rivales: " + ra + (subido ? " (" + subido.rival + " sube de " + subido.de + " al piso de " + N.piso + ", 1.4.6c)" : "") + "; hace falta " + N.promedio + ".", { ra, subido });

    const puntos = partidas.reduce((a, p) => a + p.puntos, 0);
    const pct = n ? porcentaje(puntos, n) : 0;
    agregar("1.4.8b", pct >= MINIMO_PORCENTAJE, puntos + " de " + n + " (" + pct + " %); hace falta el " + MINIMO_PORCENTAJE + " %.");
    const rp = ra + DP[pct];
    // Cuántos puntos hacían falta con estos rivales, para «le faltó…» y para 1.4.1d.
    let necesarios = null;
    for (let x = 0; x <= n * 2; x++) { const pp = porcentaje(x / 2, n); if (pp >= MINIMO_PORCENTAJE && ra + DP[pp] >= N.rp) { necesarios = x / 2; break; } }
    agregar("1.4.8", rp >= N.rp, "Rendimiento: " + ra + " " + (DP[pct] >= 0 ? "+ " : "− ") + Math.abs(DP[pct]) + " = " + rp + "; hace falta " + N.rp + "."
      + (rp < N.rp && necesarios != null ? " Con estos rivales hacían falta " + fmt(necesarios) + " puntos." : ""), { rp, necesarios });

    const norma = ch.every((c) => c.ok);
    // 1.4.1d: cada punto entero de más cuenta como una partida; 1.7: más de 13 rondas cuentan 13.
    let valeComo = null;
    if (norma) {
      const base = cuentaComo9 ? 9 : n;
      const extra = necesarios != null ? Math.floor(puntos - necesarios) : 0;
      valeComo = Math.min(13, base + Math.max(0, extra));
    }
    return { norma, chequeos: ch, puntos, n, ra, rp, pct, valeComo, faltan: necesarios != null ? Math.max(0, necesarios - puntos) : null };
  }

  function fmt(x) { return String(x).replace(".5", "½").replace(/^0½$/, "½"); }

  /* jugador: { fed, sexo, partidas: [{ ronda, puntos, jugada (sobre el
       tablero), rival: { nombre, fed, titulo, elo } }] }
     opciones: { sistema: "suizo"|"todos", rondas, exentoFederaciones }
     Prueba la mezcla entera y, en un suizo, las que permite 1.4.1e y f:
     cortar después de una ronda, y dejar afuera partidas ganadas. Se queda
     con la primera que da la norma (la de más partidas), o con la más cerca. */
  function evaluar(jugador, opciones) {
    const op = Object.assign({ sistema: "suizo", rondas: 0, exentoFederaciones: false }, opciones || {});
    const todas = (jugador.partidas || []).slice().sort((a, b) => a.ronda - b.ronda);
    const jugadas = todas.filter((p) => p.jugada && p.rival);
    const sinJugar = todas.filter((p) => !p.jugada);
    // 1.4.1c: torneo de 9 rondas, 8 jugadas y la otra fue incomparecencia a favor o bye del pareo.
    const ochoComoNueve = op.rondas === 9 && jugadas.length === 8 && sinJugar.some((p) => p.puntos === 1);
    const titulos = Object.keys(NORMAS).filter((t) => !(t === "WGM" || t === "WIM") || jugador.sexo !== "m");
    return {
      titulos: titulos.map((t) => {
        const candidatos = [];
        const ultimas = op.sistema === "suizo" ? jugadas.map((p) => p.ronda) : [Infinity];
        const cortes = [...new Set(ultimas)].sort((a, b) => b - a);
        for (const corte of cortes) {
          const hasta = jugadas.filter((p) => p.ronda <= corte);
          const ganadas = hasta.map((p, i) => (p.puntos === 1 ? i : -1)).filter((i) => i >= 0);
          const combinaciones = Math.min(1 << ganadas.length, 1 << 10);
          for (let m = 0; m < combinaciones; m++) {
            const fuera = new Set(ganadas.filter((_, b) => m & (1 << b)));
            const mezcla = hasta.filter((_, i) => !fuera.has(i));
            if (mezcla.length < 8) continue;
            const r = chequear(t, jugador, mezcla, { exentoFederaciones: op.exentoFederaciones, ochoComoNueve: ochoComoNueve && mezcla.length === jugadas.length });
            candidatos.push(Object.assign(r, {
              ignoradas: jugadas.filter((p) => p.ronda > corte).map((p) => ({ ronda: p.ronda, por: "después de la norma (1.4.1e)" }))
                .concat(hasta.filter((_, i) => fuera.has(i)).map((p) => ({ ronda: p.ronda, por: "rival al que le ganó (1.4.1f)" }))),
            }));
            if (r.norma) break;
          }
        }
        const conNorma = candidatos.filter((c) => c.norma).sort((a, b) => b.valeComo - a.valeComo || a.ignoradas.length - b.ignoradas.length);
        const completa = candidatos.find((c) => !c.ignoradas.length) || candidatos[0] || null;
        return { titulo: t, nombre: NORMAS[t].nombre, norma: conNorma.length > 0, mejor: conNorma[0] || completa };
      }),
      revisar: [
        "Que el torneo esté en la lista de FIDE y valga para Elo FIDE.",
        "El ritmo mínimo para normas, y no más de dos partidas por día (1.1.3).",
        "Que el árbitro principal sea Árbitro Internacional o Árbitro FIDE (1.1.5).",
        "Que el torneo no dure más de 90 días (1.1.4).",
        "Los Elo: aquí van los que trae chess-results; vale la lista vigente al empezar el torneo (1.4.6a).",
      ],
    };
  }

  const api = { evaluar, chequear, NORMAS, DP, porcentaje };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.NormasTitulo = api;
})(typeof self !== "undefined" ? self : this);
