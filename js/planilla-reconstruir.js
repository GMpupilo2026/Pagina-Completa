/* La partida entera a partir de la foto de las DOS planillas de una mesa.

   Lo usa «Generar PGN» de «Planillas y Drive» en la organización de la
   Mesa del árbitro (centroamericano-mesas.html), en su propio hilo
   (js/planilla-reconstruir-worker.js). Ver «Leer la partida de las planillas»
   en docs/decisiones/juegos-y-torneos.md.

   - hojasDeLaFoto(palabras): las palabras que devuelve Google Vision (texto y
     caja) → lo escrito en cada celda de cada planilla, en orden de media
     jugada. Se guía por los NÚMEROS IMPRESOS de la planilla (1 a 60, en tres
     bloques): cada columna de números da la altura de cada renglón y dónde
     empiezan Blancas y Negras, también con la foto torcida. Si no encuentra
     números, cae al orden por filas de js/planilla-ocr.js (una sola hoja).
   - reconstruir(Chess, hojas, opciones): la partida LEGAL que mejor explica lo
     escrito en todas las hojas a la vez. No decide jugada por jugada: lleva
     muchas continuaciones en paralelo (búsqueda en haz) y al final se queda
     con la que menos se aparta de lo escrito. Aguanta que una planilla se
     salte o repita un renglón y una celda que no se entiende, si lo que viene
     después confirma el camino. Cuando varias jugadas seguidas no encajan con
     NINGUNA continuación legal, corta: lo de ahí en adelante es «ilegible» y
     no se sigue buscando.
   - aPgn(Chess, resultado, cabecera): el PGN de lo que se pudo salvar; si se
     cortó, la partida termina en «*» y un comentario dice desde dónde.

   Pura (sin navegador): la prueba herramientas/verificar-planilla-reconstruir.js. */
(function (raiz) {
  "use strict";

  const PO = raiz.PlanillaOcr || (typeof require === "function" ? require("./planilla-ocr.js") : null);

  // --------------------------------------------------------------- distancia
  // Las confusiones de la letra a mano (y del lector) cuestan menos que un
  // cambio cualquiera: un «5» por una «s» es casi la misma jugada.
  const PARECIDAS = ["0O", "0o", "oO", "0D", "1l", "1I", "lI", "1i", "5s", "5S", "2z", "2Z", "6b", "8B", "9g", "gq", "4A", "ce", "ft", "hb", "nh", "7f", "38", "aA", "cC", "tT", "dD", "rR", "bB", "4a", "eC", "5f"];
  const CASI = new Set();
  PARECIDAS.forEach((p) => { CASI.add(p[0] + p[1]); CASI.add(p[1] + p[0]); });
  // La misma letra en mayúscula o minúscula casi no cuesta: hay planillas enteras con las piezas en minúscula
  // («bxe5» por el alfil, «rf1» por la torre; Centroamericano 2026). Si las dos lecturas son legales, gana la exacta.
  const sustitucion = (a, b) => (a === b ? 0 : a.toLowerCase() === b.toLowerCase() ? 0.15 : CASI.has(a + b) ? 0.4 : 1);

  function distancia(a, b) {
    const m = a.length, n = b.length;
    let fila = new Array(n + 1);
    for (let j = 0; j <= n; j++) fila[j] = j;
    for (let i = 1; i <= m; i++) {
      const nueva = new Array(n + 1);
      nueva[0] = i;
      for (let j = 1; j <= n; j++) {
        nueva[j] = Math.min(fila[j] + 1, nueva[j - 1] + 1, fila[j - 1] + sustitucion(a[i - 1], b[j - 1]));
      }
      fila = nueva;
    }
    return fila[n];
  }

  /* Lo escrito, sin lo que no distingue una jugada de otra: el número de
     jugada, la «x», el jaque, los signos, los espacios. El enroque con ceros o
     letras queda «OO»/«OOO»; la «P» de peón del Caribe («Pe4») se va. */
  function normalizar(s) {
    let t = String(s || "").trim();
    t = t.replace(/^\d{1,2}\s*[.)]+\s*(\.\.)?/, "");
    t = t.replace(/e\.?p\.?$/i, "");
    t = t.replace(/[\s+#!?:=xX×*·.,'"\-–—]/g, "");
    if (/^[0oOD]{2,3}$/.test(t)) return t.length === 3 ? "OOO" : "OO";
    t = t.replace(/^P(?=[a-h])/, "");
    return t;
  }

  /* Cómo se puede haber escrito una jugada legal: en inglés y en español, con
     o sin la letra o el número que la desambigua (muchos escriben «Cd2»
     aunque sean dos los caballos que pueden ir). */
  const LETRA_EN = { n: "N", b: "B", r: "R", q: "Q", k: "K", p: "P" };
  const LETRA_ES = { n: "C", b: "A", r: "T", q: "D", k: "R", p: "P" };

  // mov (opcional): la jugada de chess.js con { piece, captured, from } para las capturas anotadas con la PIEZA
  // capturada en vez de la casilla («AxA», «CxC+», «DxA», «cxA», «PxP»), como anotan muchos niños.
  function formasDe(san, mov) {
    const formas = new Set();
    if (mov && mov.captured) {
      [LETRA_EN, LETRA_ES].forEach((L) => {
        const quien = mov.piece === "p" ? mov.from[0] : L[mov.piece];
        formas.add(normalizar(quien + "x" + L[mov.captured]));
        if (mov.piece === "p") formas.add(normalizar("Px" + L[mov.captured]));
      });
    }
    const en = normalizar(san), es = normalizar(PO.sanEnEspanol(san));
    [en, es].forEach((f) => {
      formas.add(f);
      formas.add(f.replace(/^([KQRBNTCAD])[a-h1-8]([a-h][1-8])/, "$1$2"));
      // la captura de peón escrita solo con la casilla de llegada («d5» por «exd5»)
      const peon = f.match(/^[a-h]([a-h][1-8].*)$/);
      if (peon) formas.add(peon[1]);
    });
    return [...formas].filter(Boolean);
  }

  // --------------------------------------------------------------- reconstruir
  const TOPE = 3;            // lo más que cuesta una celda: más lejos ya es «no se parece»
  const SALTO = 1.5;         // la planilla tiene una celda de más (repitió o escribió otra cosa)
  const FALTA = 1.5;         // la planilla no anotó esta jugada
  const VENTANA = 6;         // medias jugadas que se miran para decidir si ya no se puede seguir
  const UMBRAL = 1.5;        // costo medio por media jugada a partir del cual es ilegible
  const ESTADO_LEIDA = 0.2, ESTADO_CORREGIDA = 1.0;

  function reconstruir(Chess, hojasCrudas, opciones) {
    const opt = Object.assign({ haz: 150, alProgresar: null }, opciones || {});
    // las celdas vacías del final no cuentan
    const hojas = (hojasCrudas || []).map((h) => {
      const celdas = (h || []).map((x) => String(x || "").trim());
      while (celdas.length && !celdas[celdas.length - 1]) celdas.pop();
      return celdas;
    }).filter((h) => h.length);
    const lecturas = hojas.map((h) => h.map(normalizar));
    const largo = Math.max(0, ...hojas.map((h) => h.length));
    if (!hojas.length) return { jugadas: [], ilegibleDesde: 0, resto: [], hojas: 0, motivo: "No se encontró nada escrito en la planilla." };

    const cacheMov = new Map();
    const cacheDist = new Map();
    function movimientos(fen) {
      let m = cacheMov.get(fen);
      if (!m) {
        const g = new Chess(fen);
        m = g.moves({ verbose: true }).map((v) => { const formas = formasDe(v.san, v); return { san: v.san, formas, clave: formas.join(",") }; });
        cacheMov.set(fen, m);
        if (cacheMov.size > 20000) cacheMov.clear();
      }
      return m;
    }
    // Una celda vacía o sin ninguna letra ni número de ajedrez (un borrón, «~») no dice nada:
    // no castiga ninguna jugada (si no, saltarse jugadas para esquivarla saldría más barato),
    // pero tampoco respalda ninguna (ver «qd» abajo).
    const sinDato = (leido) => !leido || !/[a-hA-H1-8KQRBNTCADO]/.test(leido);
    function costoCelda(leido, mov) {
      if (sinDato(leido)) return 1;
      // la clave lleva las formas, no solo la jugada: «Txf6» captura una torre en una posición y un caballo en otra
      // («TxT» o «TxC»), y con solo la jugada se reusaba la distancia de la otra
      const clave = leido + "|" + mov.clave;
      let d = cacheDist.get(clave);
      if (d === undefined) {
        d = TOPE;
        for (const f of mov.formas) { d = Math.min(d, distancia(leido, f)); if (!d) break; }
        cacheDist.set(clave, d);
        if (cacheDist.size > 400000) cacheDist.clear();
      }
      return d;
    }

    // Un estado: la posición, por dónde va cada hoja y cómo viene la partida.
    // Las jugadas se guardan encadenadas (prev) para no copiar listas.
    const inicial = new Chess();
    let haz = [{ fen: inicial.fen(), ptr: hojas.map(() => 0), total: 0, prev: null, san: null, q: 0, ventana: [], fin: false, ply: 0 }];
    const terminado = (e) => e.ptr.every((p, k) => p >= hojas[k].length);
    let atascado = null;
    const limitePly = largo + 12;

    for (let ply = 0; ply < limitePly; ply++) {
      if (haz.every((e) => e.fin)) break;
      const hijos = [];
      for (const e of haz) {
        if (e.fin) { hijos.push(e); continue; }
        // lo que puede hacer cada hoja con esta media jugada
        const opcionesHoja = hojas.map((h, k) => {
          const p = e.ptr[k];
          const o = [];
          if (p < h.length) o.push({ leer: p, ptr: p + 1, extra: 0 });
          if (p + 1 < h.length) o.push({ leer: p + 1, ptr: p + 2, extra: SALTO });
          if (p + 2 < h.length) o.push({ leer: p + 2, ptr: p + 3, extra: SALTO * 1.4 });
          o.push({ leer: -1, ptr: p, extra: p < h.length ? FALTA : 0 });
          return o;
        });
        for (const mov of movimientos(e.fen)) {
          // cada hoja por separado: la mejor de sus opciones y las que quedan cerca
          const porHoja = opcionesHoja.map((ops, k) => ops.map((o) => {
            const d = o.leer >= 0 ? Math.min(TOPE, costoCelda(lecturas[k][o.leer], mov)) : null;
            // qd: cuánto respalda esta celda la jugada (una sin dato, nada)
            const qd = d === null ? null : sinDato(lecturas[k][o.leer]) ? TOPE : d;
            return { ptr: o.ptr, d: qd, leida: d !== null && qd < TOPE ? d : null, costo: (d === null ? 0 : d) + o.extra, extra: o.extra };
          }).sort((a, b) => a.costo - b.costo));
          let combos = [{ ptr: [], costo: 0, ds: [], extra: 0, dmax: 0 }];
          porHoja.forEach((ops) => {
            const mejor = ops[0].costo;
            const sirven = ops.filter((o) => o.costo <= mejor + SALTO + 0.01);
            const nuevos = [];
            combos.forEach((c) => sirven.forEach((o) => nuevos.push({ ptr: c.ptr.concat(o.ptr), costo: c.costo + o.costo, ds: o.d === null ? c.ds : c.ds.concat(o.d), extra: c.extra + o.extra, dmax: Math.max(c.dmax, o.leida || 0) })));
            combos = nuevos;
          });
          for (const c of combos) {
            if (!c.ds.length) continue; // ninguna hoja dice nada de esta jugada
            // qué tan bien se lee esta jugada: la hoja que mejor la respalda, más lo que costó acomodar
            const q = Math.min(...c.ds) + c.extra / 3;
            hijos.push({ padre: e, mov, ptr: c.ptr, total: e.total + c.costo, q, dmax: c.dmax });
          }
        }
      }
      if (!hijos.length) { atascado = { ply, haz }; break; }
      hijos.sort((a, b) => a.total - b.total);
      const vistos = new Set();
      const siguiente = [];
      for (const h of hijos) {
        if (siguiente.length >= opt.haz) break;
        if (h.fin) { const k = "fin|" + h.fen + "|" + h.ptr.join(","); if (vistos.has(k)) continue; vistos.add(k); siguiente.push(h); continue; }
        const g = new Chess(h.padre.fen);
        g.move(h.mov.san);
        const fen = g.fen();
        const clave = fen.split(" ").slice(0, 4).join(" ") + "|" + h.ptr.join(",");
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        const ventana = h.padre.ventana.concat(h.q).slice(-VENTANA);
        const e = { fen, ptr: h.ptr, total: h.total, prev: h.padre, san: h.mov.san, q: h.q, dmax: h.dmax, ventana, ply: h.padre.ply + 1, fin: false };
        e.fin = terminado(e);
        siguiente.push(e);
      }
      haz = siguiente;
      if (opt.alProgresar) opt.alProgresar(Math.min(1, (ply + 1) / Math.max(1, largo)));
      // ¿Ya no hay salida? Si TODAS las continuaciones vienen mal en las últimas jugadas, se corta.
      const vivos = haz.filter((e) => !e.fin);
      if (vivos.length && vivos.every((e) => e.ventana.length >= VENTANA && e.ventana.reduce((a, b) => a + b, 0) / VENTANA > UMBRAL)) {
        atascado = { ply: ply + 1, haz };
        break;
      }
    }

    // La mejor: entre las terminadas, la de menor costo; si se cortó, la mejor de las que había.
    const candidatas = atascado ? atascado.haz.filter((e) => e.prev || e.ply === 0) : haz;
    const orden = candidatas.slice().sort((a, b) => (b.fin - a.fin) || (a.total - b.total));
    const mejor = orden[0];
    const cadena = (e) => { const out = []; for (let x = e; x && x.san; x = x.prev) out.push(x); return out.reverse(); };
    let pasos = cadena(mejor);

    let ilegibleDesde = null;
    if (atascado || !mejor.fin) {
      // se vuelve atrás hasta la última jugada que sí se leía bien
      while (pasos.length && pasos[pasos.length - 1].q > 0.75) pasos.pop();
      ilegibleDesde = pasos.length;
    }

    // Las jugadas en las que otra partida casi igual de buena dice otra cosa: dudosas.
    const alternativas = new Map();
    if (!ilegibleDesde && ilegibleDesde !== 0) {
      orden.slice(1).filter((e) => e.fin && e.total <= mejor.total + 1).slice(0, 5).forEach((otra) => {
        const p = cadena(otra);
        p.forEach((x, i) => { if (pasos[i] && x.san !== pasos[i].san && !alternativas.has(i)) alternativas.set(i, x.san); });
      });
    }

    const jugadas = pasos.map((x, i) => {
      // corregida también si una de las planillas decía otra cosa (aunque la otra la respalde)
      const estado = alternativas.has(i) || x.q > ESTADO_CORREGIDA ? "dudosa" : x.q > ESTADO_LEIDA || x.dmax > ESTADO_LEIDA ? "corregida" : "leida";
      return { san: x.san, q: Math.round(x.q * 100) / 100, estado, alternativa: alternativas.get(i) || null };
    });
    // lo escrito en cada celda que corresponde a cada jugada (para mostrarlo al lado)
    const escritoPorPly = [];
    {
      // se rehace el recorrido de punteros con la cadena elegida
      const ptrs = cadena(mejor).map((x) => x.ptr);
      let antes = hojas.map(() => 0);
      ptrs.slice(0, jugadas.length).forEach((p, i) => {
        escritoPorPly[i] = hojas.map((h, k) => (p[k] > antes[k] ? h[p[k] - 1] : "")).filter(Boolean);
        antes = p;
      });
      jugadas.forEach((j, i) => { j.escrito = escritoPorPly[i] || []; });
      var resto = ilegibleDesde === null ? [] : hojas.map((h, k) => h.slice(antes[k]).filter(Boolean));
    }
    return {
      jugadas,
      ilegibleDesde,
      resto,
      hojas: hojas.length,
      costo: Math.round(mejor.total * 100) / 100,
      motivo: ilegibleDesde === null ? null : "Desde aquí ninguna continuación legal se parece a lo escrito.",
    };
  }

  // --------------------------------------------------------------- PGN
  function aPgn(Chess, r, cabecera) {
    const g = new Chess();
    r.jugadas.forEach((j) => g.move(j.san));
    const cab = Object.assign({ Event: "?", Site: "?", Date: "????.??.??", Round: "?", White: "?", Black: "?", Result: "*" }, cabecera || {});
    if (r.ilegibleDesde !== null) cab.Result = "*";
    const pares = Object.keys(cab).map((k) => `[${k} "${String(cab[k]).replace(/[\\"]/g, "")}"]`);
    let cuerpo = "";
    r.jugadas.forEach((j, i) => {
      if (i % 2 === 0) cuerpo += (i / 2 + 1) + ". ";
      cuerpo += j.san + (j.estado === "dudosa" ? " {dudosa}" : "") + " ";
    });
    if (r.ilegibleDesde !== null) {
      const n = Math.floor(r.ilegibleDesde / 2) + 1;
      cuerpo += `{Desde aquí la planilla es ilegible (jugada ${n}${r.ilegibleDesde % 2 ? " de las negras" : ""}).} `;
    }
    return pares.join("\n") + "\n\n" + (cuerpo + cab.Result).replace(/(.{1,79})(\s|$)/g, "$1\n").trim() + "\n";
  }

  // --------------------------------------------------------------- la foto
  /* De las palabras de Vision a las celdas de cada planilla. */
  function hojasDeLaFoto(palabras) {
    const ws = (palabras || []).filter((w) => w && w.text && w.bbox).map((w) => ({
      t: String(w.text).trim(), cx: (w.bbox.x0 + w.bbox.x1) / 2, cy: (w.bbox.y0 + w.bbox.y1) / 2,
      x0: w.bbox.x0, x1: w.bbox.x1, alto: Math.max(1, w.bbox.y1 - w.bbox.y0),
    })).filter((w) => w.t);
    const numeros = ws.filter((w) => /^\d{1,2}$/.test(w.t) && +w.t >= 1 && +w.t <= 60);
    const columnas = columnasDeNumeros(numeros);
    if (!columnas.length) {
      const fichas = PO.reconstructMoveTokens(palabras || []);
      return { metodo: "filas", hojas: fichas.length ? [fichas] : [] };
    }
    // Las hojas: columnas ordenadas de izquierda a derecha; cuando el bloque no avanza (1-20 después de 41-60), empieza otra hoja.
    columnas.sort((a, b) => a.xMedio - b.xMedio);
    const grupos = [];
    columnas.forEach((c) => {
      const ultimo = grupos[grupos.length - 1];
      if (!ultimo || c.bloque <= ultimo[ultimo.length - 1].bloque) grupos.push([c]); else ultimo.push(c);
    });
    // Ancho de un bloque (número + Blancas + Negras): la distancia a la columna siguiente de la misma hoja,
    // o, si no la hay, la mediana de las demás; sin ninguna, unas 7 veces el alto de un renglón.
    const anchos = [];
    grupos.forEach((g) => g.forEach((c, i) => { if (g[i + 1] && g[i + 1].bloque === c.bloque + 1) anchos.push(g[i + 1].xMedio - c.xMedio); }));
    const mediana = (l) => { const s = l.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
    const anchoTipico = mediana(anchos);
    const usadas = new Set(columnas.flatMap((c) => c.fichas));
    const hojas = grupos.map((g) => {
      g.forEach((c, i) => {
        c.ancho = g[i + 1] && g[i + 1].bloque === c.bloque + 1 ? g[i + 1].xMedio - c.xMedio : anchoTipico || c.paso * 7.2;
      });
      return { columnas: g, celdas: [] };
    });
    ws.forEach((w) => {
      if (usadas.has(w)) return;
      let mejor = null;
      hojas.forEach((h, hi) => h.columnas.forEach((c) => {
        // La foto torcida: la columna de números se corre en x al bajar (xPaso), y al ir a la
        // derecha la altura cambia en la misma proporción. Se endereza antes de ver el renglón.
        const inclinacion = c.xPaso / c.paso;
        let n = (w.cy - c.a) / c.paso, xNum = c.xA + c.xPaso * n;
        for (let vuelta = 0; vuelta < 2; vuelta++) {
          n = (w.cy + (w.cx - xNum) * inclinacion - c.a) / c.paso;   // renglón (con decimales)
          xNum = c.xA + c.xPaso * n;                                  // dónde está el número en ese renglón
        }
        const rel = (w.cx - xNum) / c.ancho;                  // 0: el número, 1: la columna siguiente
        const desde = c.bloque * 20 + 1, hasta = desde + 19;
        if (n < desde - 0.6 || n > hasta + 0.6 || rel < 0.08 || rel > 0.99) return;
        const fila = Math.round(n);
        const dist = Math.abs(n - fila);
        if (dist > 0.45) return;
        if (!mejor || dist < mejor.dist) mejor = { hi, fila, negras: rel >= 0.565, dist };
      }));
      if (!mejor) return;
      const i = (mejor.fila - 1) * 2 + (mejor.negras ? 1 : 0);
      (hojas[mejor.hi].celdas[i] = hojas[mejor.hi].celdas[i] || []).push(w);
    });
    return {
      metodo: "numeros",
      hojas: hojas.map((h) => {
        const out = [];
        const largo = h.celdas.length;
        for (let i = 0; i < largo; i++) out.push((h.celdas[i] || []).sort((a, b) => a.cx - b.cx).map((w) => w.t).join(""));
        return out;
      }).filter((h) => h.some(Boolean)),
    };
  }

  /* Las columnas de números impresos: números alineados en vertical, del mismo
     bloque (1-20, 21-40 o 41-60), con la altura de cada renglón ajustada por
     mínimos cuadrados (así un número que el lector no vio no estorba). */
  function columnasDeNumeros(numeros) {
    if (numeros.length < 4) return [];
    const altoMedio = numeros.reduce((s, w) => s + w.alto, 0) / numeros.length;
    // Cada número se encadena con los que siguen justo debajo (el 7 con el 8, el 9…), aunque
    // la foto torcida los corra a un lado: así una columna inclinada no se parte en dos.
    const padre = numeros.map((_, i) => i);
    const raizDe = (i) => (padre[i] === i ? i : (padre[i] = raizDe(padre[i])));
    for (let i = 0; i < numeros.length; i++) {
      for (let j = 0; j < numeros.length; j++) {
        const a = numeros[i], b = numeros[j], dn = +b.t - +a.t;
        if (dn < 1 || dn > 3 || Math.floor((+a.t - 1) / 20) !== Math.floor((+b.t - 1) / 20)) continue;
        const dy = (b.cy - a.cy) / dn, dx = Math.abs(b.cx - a.cx);
        if (dy < altoMedio * 0.8 || dy > altoMedio * 4 || dx > Math.abs(b.cy - a.cy) * 0.2 + altoMedio * 0.6) continue;
        padre[raizDe(j)] = raizDe(i);
      }
    }
    const porRaiz = new Map();
    numeros.forEach((w, i) => { const r = raizDe(i); if (!porRaiz.has(r)) porRaiz.set(r, { fichas: [] }); porRaiz.get(r).fichas.push(w); });
    const grupos = [...porRaiz.values()];
    const ajuste = (fichas, f) => {
      const n = fichas.length, xs = fichas.map((w) => +w.t), ys = fichas.map(f);
      const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
      let sxy = 0, sxx = 0;
      for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
      const b = sxx ? sxy / sxx : 0;
      return { a: my - b * mx, b };
    };
    const columnas = [];
    grupos.forEach((g) => {
      const cuenta = [0, 0, 0];
      g.fichas.forEach((w) => cuenta[Math.floor((+w.t - 1) / 20)]++);
      const bloque = cuenta.indexOf(Math.max(...cuenta));
      let fichas = g.fichas.filter((w) => Math.floor((+w.t - 1) / 20) === bloque);
      // un número escrito a mano que cayó en la columna no debe torcer el ajuste
      for (let vuelta = 0; vuelta < 3 && fichas.length >= 4; vuelta++) {
        const y = ajuste(fichas, (w) => w.cy);
        if (y.b <= 0) { fichas = []; break; }
        const quedan = fichas.filter((w) => Math.abs(w.cy - (y.a + y.b * +w.t)) < y.b * 0.4);
        if (quedan.length === fichas.length) break;
        fichas = quedan;
      }
      if (fichas.length < 4) return;
      const y = ajuste(fichas, (w) => w.cy), x = ajuste(fichas, (w) => w.cx);
      if (y.b <= 0) return;
      columnas.push({ bloque, fichas, a: y.a, paso: y.b, xA: x.a, xPaso: x.b, xMedio: x.a + x.b * (bloque * 20 + 10) });
    });
    return columnas;
  }

  const PlanillaReconstruir = { normalizar, distancia, formasDe, reconstruir, aPgn, hojasDeLaFoto };
  if (typeof module !== "undefined" && module.exports) module.exports = PlanillaReconstruir;
  else raiz.PlanillaReconstruir = PlanillaReconstruir;
})(typeof window !== "undefined" ? window : globalThis);
