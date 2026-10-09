/* Revisa los desempates: leer un torneo de chess-results y pasarlo al torneo
 * de Pareo Integral (js/pareo/torneo.js), para calcular los desempates con
 * js/pareo/desempates.js. Lo usa js/revisar-desempates.js; el HTML lo trae la Edge
 * Function revisar-desempates. Ver «Revisa los desempates» en
 * docs/decisiones/juegos-y-torneos.md.
 *
 * Las páginas que se leen:
 *  - art=4, el cuadro cruzado por clasificación. En un suizo trae una columna
 *    por ronda con el rival (por su puesto), el color y el resultado: «3w1»,
 *    «10b½», «5w+» (ganó sin jugar), «7b-» (perdió sin jugar), «-1» (bye de
 *    un punto), «-½» (bye de medio), «-0» o vacío (no jugó). En un todos
 *    contra todos es una matriz (una columna por rival, sin colores ni
 *    rondas). En los dos, las columnas «Des 1…» con los desempates
 *    publicados y la «Anotación» que dice qué es cada uno.
 *  - art=2, los emparejamientos de todas las rondas: solo en un todos contra
 *    todos, para saber quién jugó con quién en qué ronda y con qué color.
 * Las columnas se buscan por su encabezado, nunca por su posición.
 */
(function (raiz) {
  "use strict";

  const limpio = (s) => String(s || "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
  const clave = (s) => limpio(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();

  function numero(t) {
    const s = limpio(t).replace("½", ".5").replace(",", ".");
    if (s === "") return null;
    const v = Number(s.startsWith(".") ? "0" + s : s);
    return Number.isFinite(v) ? v : null;
  }

  function documento(html) {
    return new DOMParser().parseFromString(String(html || ""), "text/html");
  }

  // Las tablas de resultados (class CRs1) como { encabezado, filas } de texto.
  function tablas(doc) {
    return [...doc.querySelectorAll("table.CRs1")].map((t) => {
      const filas = [...t.rows].filter((tr) => tr.closest("table") === t).map((tr) => [...tr.cells].map((c) => limpio(c.textContent)));
      return { filas, elementos: [...t.rows].filter((tr) => tr.closest("table") === t) };
    });
  }

  function titulos(doc) {
    const h2 = [...doc.querySelectorAll("h2")].map((h) => limpio(h.textContent));
    const ronda = h2.find((t) => /clasificaci[oó]n|cuadro cruzado|ranking/i.test(t)) || "";
    return { titulo: h2[0] || "", ronda, final: /\bfinal\b/i.test(ronda) || !/despu[eé]s de la ronda/i.test(ronda) };
  }

  // «Desempate 1: Buchholz Tie-Breaks (variabel with parameter)» → {1: texto}.
  function anotacion(doc) {
    const out = {};
    for (const p of doc.querySelectorAll("p")) {
      for (const linea of p.innerHTML.split(/<br\s*\/?>/i)) {
        const m = /Desempate\s*(\d+)\s*:\s*(.+)/i.exec(limpio(linea.replace(/<[^>]+>/g, " ")));
        if (m) out[Number(m[1])] = limpio(m[2]);
      }
    }
    return out;
  }

  // ---------- Qué desempate es cada «Des» ----------

  // Lo que chess-results escribe (Swiss-Manager, en inglés aunque la página
  // esté en español) → los códigos del C.07. Cuando el nombre no dice el corte
  // («Buchholz Tie-Breaks (variabel with parameter)»), se dan las variantes
  // posibles y la página elige la que da los números publicados.
  const FAMILIAS = {
    BH: ["BH", "BH-C1", "BH-C2", "BH-M1", "BH-M2"],
    SB: ["SB", "SB-C1"],
    ARO: ["ARO", "ARO-C1"],
    PS: ["PS", "PS-C1"],
  };
  function codigos(texto) {
    const t = String(texto || "");
    const fide = /\((BH-C\d|BH-M\d|BH|SB-C1|SB|DE|WIN|WON|BPG|BWG|GE|PS-C1|PS|KS|STD|ARO-C1|ARO|TPR|PTP|FB|AOB|APRO|APPO|AFB)\)/i.exec(t);
    if (fide) return { codigos: [fide[1].toUpperCase()], nombre: t };
    const b = clave(t);
    if (/^points|^puntos|game points/.test(b) && !/match/.test(b)) return { puntos: true, nombre: t };
    if (/match ?points|puntos de match/.test(b)) return { codigos: [], nombre: t, sinCalculo: "puntos de match (solo en torneos por equipos)" };
    if (/manual/.test(b)) return { codigos: [], nombre: t, sinCalculo: "lo escribió el árbitro a mano (desempate rápido o sorteo)" };
    if (/fore buchholz/.test(b)) return { codigos: ["FB"], nombre: t };
    if (/average.*buchholz/.test(b)) return { codigos: ["AOB"], nombre: t };
    if (/buchholz/.test(b)) {
      if (/median 2|m2/.test(b)) return { codigos: ["BH-M2"], nombre: t };
      if (/median/.test(b)) return { codigos: ["BH-M1"], nombre: t };
      if (/cut ?2|c2/.test(b)) return { codigos: ["BH-C2"], nombre: t };
      if (/cut ?1|c1/.test(b)) return { codigos: ["BH-C1"], nombre: t };
      if (/variab|parameter/.test(b)) return { codigos: FAMILIAS.BH, nombre: t };
      return { codigos: ["BH"], nombre: t };
    }
    if (/sonneborn|berger/.test(b)) return { codigos: /cut ?1|c1/.test(b) ? ["SB-C1"] : /variab|parameter/.test(b) ? FAMILIAS.SB : ["SB"], nombre: t };
    if (/direct encounter|encuentro directo/.test(b)) return { codigos: ["DE"], nombre: t };
    if (/koya/.test(b)) return { codigos: ["KS"], nombre: t };
    if (/progressive|progresiv|cumulative/.test(b)) return { codigos: /cut ?1|c1/.test(b) ? ["PS-C1"] : FAMILIAS.PS, nombre: t };
    if (/black/.test(b) && /won|win|victor/.test(b)) return { codigos: ["BWG"], nombre: t };
    if (/black/.test(b)) return { codigos: ["BPG"], nombre: t };
    if (/elected|chosen/.test(b)) return { codigos: ["GE"], nombre: t };
    if (/including byes|\bwin\b/.test(b)) return { codigos: ["WIN"], nombre: t };
    if (/greater number of victories|number of wins|victories|games won|\bwon\b/.test(b)) return { codigos: ["WON", "WIN"], nombre: t };
    if (/average rating|elo medio|media de elo|aro/.test(b)) return { codigos: /cut ?1|c1/.test(b) ? ["ARO-C1"] : FAMILIAS.ARO, nombre: t };
    if (/perfect/.test(b)) return { codigos: ["PTP"], nombre: t };
    if (/performance|rendimiento/.test(b)) return { codigos: ["TPR"], nombre: t };
    if (/standard/.test(b)) return { codigos: ["STD"], nombre: t };
    return { codigos: [], nombre: t, sinCalculo: "un desempate que esta herramienta no conoce" };
  }

  // ---------- art=4 ----------

  // Una celda de ronda de un suizo → { rival, color, res } o { bye }.
  function celda(t) {
    const s = limpio(t).replace(/\s+/g, "");
    let m = /^(\d+)([wbs])(1|0|½|\+|-|=)?$/i.exec(s);
    if (m) return { rival: m[1], color: m[2].toLowerCase() === "b" ? "b" : "w", res: m[3] === "=" ? "½" : (m[3] || null) };
    m = /^-?(1|½|0|\+|-)?$/.exec(s);
    if (m) return { bye: m[1] === "1" || m[1] === "+" ? "F" : m[1] === "½" ? "H" : "Z" };
    return { bye: "Z", raro: s };
  }

  function leerCuadro(html) {
    const doc = documento(html);
    const t = tablas(doc).find((x) => x.filas.length && x.filas[0].some((c) => /^Rk\.?$/i.test(c)));
    if (!t) return null;
    const enc = t.filas[0];
    const col = (re) => enc.findIndex((c) => re.test(c));
    const iRk = col(/^Rk\.?$/i), iNombre = col(/^(Nombre|Name)$/i), iElo = col(/^(Elo|Rtg|ELO)$/i);
    const rondas = enc.map((c, i) => [i, /^(\d+)\.\s*(Rd|Ronda|R)\.?$/i.exec(c)]).filter((x) => x[1]).map((x) => x[0]);
    const rivales = enc.map((c, i) => [i, /^\d+$/.test(c)]).filter((x) => x[1] && x[0] > iNombre).map((x) => x[0]);
    const des = enc.map((c, i) => [i, /^(?:Des|TB)\.?\s*(\d+)$/i.exec(c)]).filter((x) => x[1]).map((x) => ({ i: x[0], n: Number(x[1][1]) }));
    const leyenda = anotacion(doc);
    const jugadores = [];
    for (const f of t.filas.slice(1)) {
      if (!/^\d+$/.test(f[iRk] || "") || !f[iNombre]) continue;
      jugadores.push({
        rk: f[iRk], nombre: f[iNombre], elo: iElo >= 0 ? Number(f[iElo]) || 0 : 0,
        celdas: (rondas.length ? rondas : rivales).map((i) => f[i] || ""),
        publicados: Object.fromEntries(des.map((d) => [d.n, numero(f[d.i])])),
      });
    }
    return {
      ...titulos(doc),
      sistema: rondas.length ? "suizo" : "todos",
      jugadores,
      desempates: des.map((d) => ({ n: d.n, texto: leyenda[d.n] || "Desempate " + d.n, ...codigos(leyenda[d.n] || "") })),
      conElo: iElo >= 0,
    };
  }

  // ---------- art=2 (todos contra todos) ----------

  function resultado(t) {
    const s = limpio(t).replace(/\s+/g, "").replace(/1\/2/g, "½");
    return { "1-0": "1-0", "0-1": "0-1", "½-½": "=", "+--": "+-", "--+": "-+", "---": "--", "+-": "+-", "-+": "-+" }[s] || (s ? s : null);
  }

  function leerRondas(html) {
    const doc = documento(html);
    const rondas = [];
    let actual = null, iB = -1, iN = -1, iR = -1;
    for (const t of tablas(doc)) {
      for (const f of t.filas) {
        const r = f.length === 1 && /^(\d+)\.\s*(Ronda|Round|Rd)/i.exec(f[0]);
        if (r) { actual = { numero: Number(r[1]), mesas: [] }; rondas.push(actual); continue; }
        if (f.some((c) => /^(Resultado|Result|Res\.)$/i.test(c))) {
          iR = f.findIndex((c) => /^(Resultado|Result|Res\.)$/i.test(c));
          const nombres = f.map((c, i) => [i, /^(White|Black|Blancas|Negras|Nombre|Name)$/i.test(c)]).filter((x) => x[1]).map((x) => x[0]);
          iB = nombres[0] ?? -1;
          iN = nombres[nombres.length - 1] ?? -1;
          continue;
        }
        if (!actual || iR < 0 || iB < 0) continue;
        actual.mesas.push({ blancas: f[iB] || "", negras: f[iN] || "", res: f[iR] || "" });
      }
    }
    return rondas;
  }

  // ---------- Al torneo de Pareo Integral ----------

  /* `cuadro` de leerCuadro(); `rondas` de leerRondas() (solo en todos contra
   * todos). Devuelve { torneo, avisos }: el torneo con la forma de
   * js/pareo/torneo.js (los id son el puesto en chess-results). */
  function aPareo(cuadro, rondas) {
    const avisos = [];
    const jugadores = cuadro.jugadores.map((j) => ({ id: j.rk, nombre: j.nombre, elo: j.elo }));
    const porRk = new Map(cuadro.jugadores.map((j) => [j.rk, j]));
    const torneo = {
      formato: 1, nombre: cuadro.titulo, sistema: cuadro.sistema, dobleVuelta: false,
      puntos: { victoria: 1, tablas: 0.5, derrota: 0, bye: 1 },
      jugadores, numeracion: jugadores.map((j) => j.id), rondas: [],
    };
    if (cuadro.sistema === "suizo") {
      const n = Math.max(0, ...cuadro.jugadores.map((j) => j.celdas.length));
      for (let r = 0; r < n; r++) {
        const R = { mesas: [], ausencias: {} };
        const vistos = new Set();
        let conResultado = false;
        for (const j of cuadro.jugadores) {
          if (vistos.has(j.rk)) continue;
          const c = celda(j.celdas[r]);
          if (c.raro) avisos.push("Ronda " + (r + 1) + ", " + j.nombre + ": no se entendió «" + c.raro + "»; se tomó como que no jugó.");
          if (c.bye) {
            if (c.bye === "F") { R.mesas.push({ b: j.rk, n: null, r: null }); conResultado = true; }
            else if (c.bye === "H") { R.ausencias[j.rk] = "H"; conResultado = true; }
            vistos.add(j.rk);
            continue;
          }
          const otro = porRk.get(c.rival);
          if (!otro) { avisos.push("Ronda " + (r + 1) + ", " + j.nombre + ": su rival (" + c.rival + ") no está en la tabla."); continue; }
          const d = celda(otro.celdas[r]);
          const [b, n, rb, rn] = c.color === "w" ? [j, otro, c.res, d.res] : [otro, j, d.res, c.res];
          const DE_BLANCAS = { "1": "1-0", "0": "0-1", "½": "=", "+": "+-" };
          const DE_NEGRAS = { "1": "0-1", "0": "1-0", "½": "=", "+": "-+", "-": "+-" };
          let res = null;
          if (rb === "-") res = rn === "+" ? "-+" : "--";
          else if (rb) res = DE_BLANCAS[rb];
          else if (rn) res = DE_NEGRAS[rn];
          if (res) conResultado = true;
          R.mesas.push({ b: b.rk, n: n.rk, r: res });
          vistos.add(j.rk);
          vistos.add(otro.rk);
        }
        if (conResultado) torneo.rondas.push(R);
      }
    } else {
      const porNombre = new Map(cuadro.jugadores.map((j) => [clave(j.nombre), j.rk]));
      for (const ronda of rondas || []) {
        const R = { mesas: [], ausencias: {} };
        for (const m of ronda.mesas) {
          const b = porNombre.get(clave(m.blancas)), n = porNombre.get(clave(m.negras));
          const res = resultado(m.res);
          if (b && n) R.mesas.push({ b, n, r: res });
          else if (b || n) {
            // El «libre» de un todos contra todos impar: punto solo si
            // chess-results se lo dio.
            const quien = b || n;
            const gano = b ? res === "1-0" || res === "+-" : res === "0-1" || res === "-+";
            if (gano) R.mesas.push({ b: quien, n: null, r: null });
          } else if (m.blancas || m.negras) avisos.push("Ronda " + ronda.numero + ": no se encontró a «" + (m.blancas || m.negras) + "» en el cuadro.");
        }
        if (R.mesas.some((x) => x.r || x.n === null)) torneo.rondas.push(R);
      }
      if (!torneo.rondas.length) avisos.push("No se pudieron leer las rondas del todos contra todos.");
    }
    torneo.rondasTotales = torneo.rondas.length;
    return { torneo, avisos };
  }

  raiz.RevisarDesempatesCR = { leerCuadro, leerRondas, aPareo, codigos, celda, FAMILIAS, clave };
})(typeof self !== "undefined" ? self : this);
