/* ===== Pareo Integral — la partida de una mesa, de la foto de las planillas =====
 *
 * En cada mesa de una ronda, «📷 Planilla» toma una foto (o dos: una por
 * planilla, o las dos hojas en una sola foto) y la pasa a PGN, para que la
 * partida se publique con el torneo y salga en torneos-pareo.html con «Ver
 * partida». No es un lector nuevo: es el mismo del Centroamericano (ver «Leer
 * la partida de las planillas» en docs/decisiones/juegos-y-torneos.md):
 *
 *   - la foto va a Google Vision por la Edge Function ocr-scoresheet
 *     (js/planilla-ocr.js), que gasta un uso del tope diario del lector;
 *   - PlanillaReconstruir.hojasDeLaFoto() saca lo escrito en cada celda, guiado
 *     por los números impresos de la planilla;
 *   - PlanillaReconstruir.reconstruir() arma la partida LEGAL que mejor explica
 *     lo escrito en las dos planillas a la vez, en su propio hilo
 *     (js/planilla-reconstruir-worker.js). Lo que ya no tiene salida queda
 *     «ilegible desde la jugada N»: no se le inventa ninguna jugada.
 *
 * Nada se guarda solo: el PGN que sale se abre en el cuadro «Partida (PGN)»
 * de la mesa, con lo que conviene revisar (las jugadas dudosas y desde dónde
 * no se pudo leer), y quien organiza lo corrige y lo guarda.
 *
 *   PareoPlanilla.leer(fotos, { token, decir }) → { resultado, hojas, metodo }
 *   PareoPlanilla.pgn(Chess, resultado, cabecera) → texto PGN (sin marcas)
 *   PareoPlanilla.resumen(resultado, tx) → { texto, ayuda } para el cuadro
 *
 * pgn() y resumen() son puros: los prueba herramientas/verificar-pareo-planilla.js.
 */
(function (raiz) {
  "use strict";

  const ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
  const enEspanol = (san) => String(san).replace(/^[KQRBN]/, (p) => ES[p]).replace(/=([QRBN])/, (m, p) => "=" + ES[p]);
  const MAX_FOTOS = 2;
  const MAX_DUDOSAS = 12;
  const FOTO_MINIMA = 1600; // px del lado largo: por debajo, se avisa que la foto es chica

  // El resultado del PGN sale del que anotó el árbitro en la mesa, nunca de
  // la planilla: lo que no es una partida jugada (+/−, −/−) queda «*».
  const RESULTADO = { "1-0": "1-0", "0-1": "0-1", "=": "1/2-1/2" };

  function numeroDe(i) { return Math.floor(i / 2) + 1 + (i % 2 ? "…" : "."); }

  /* El PGN de lo que se pudo salvar. Las jugadas van en inglés (lo que lee
     cualquier programa); las marcas de «corregida» o «dudosa» no van en el
     PGN, que se publica: se dicen en el cuadro, para revisarlas antes. */
  function pgn(Chess, r, cabecera) {
    const cab = Object.assign({ Event: "?", Site: "?", Date: "????.??.??", Round: "?", White: "?", Black: "?", Result: "*" }, cabecera || {});
    cab.Result = RESULTADO[cab.Result] || (Object.values(RESULTADO).includes(cab.Result) ? cab.Result : "*");
    const g = new Chess();
    const jugadas = [];
    for (const j of r.jugadas || []) { const m = g.move(j.san); if (!m) break; jugadas.push(m.san); }
    const pares = Object.keys(cab).map((k) => `[${k} "${String(cab[k]).replace(/[\\"\r\n]/g, "")}"]`);
    let cuerpo = "";
    jugadas.forEach((san, i) => { if (i % 2 === 0) cuerpo += (i / 2 + 1) + ". "; cuerpo += san + " "; });
    if (r.ilegibleDesde !== null && r.ilegibleDesde !== undefined) {
      const n = Math.floor(r.ilegibleDesde / 2) + 1;
      cuerpo += `{Desde aquí la planilla es ilegible (jugada ${n}${r.ilegibleDesde % 2 ? " de las negras" : ""}).} `;
    }
    return pares.join("\n") + "\n\n" + (cuerpo + cab.Result).replace(/(.{1,79})(\s|$)/g, "$1\n").trim() + "\n";
  }

  /* Lo que se dice en el cuadro: cuánto se leyó y qué revisar con la planilla
     en la mano. `tx(clave, datos)` son los textos de Pareo (en dos idiomas). */
  function resumen(r, tx) {
    const js = r.jugadas || [];
    const cuenta = (e) => js.filter((j) => j.estado === e).length;
    // «1 dudosa», «2 dudosas»: cada número con su palabra (planillaN_<clave>_1 o _n)
    const con = (clave, n) => tx("planillaN_" + clave + (n === 1 ? "_1" : "_n"), { n });
    const partes = [tx("planillaLeida", { n: con("medias", js.length), l: con("leidas", cuenta("leida")), c: con("corregidas", cuenta("corregida")), d: con("dudosas", cuenta("dudosa")) })];
    if (r.ilegibleDesde !== null && r.ilegibleDesde !== undefined) {
      partes.push(tx(r.ilegibleDesde % 2 ? "planillaIlegibleNegras" : "planillaIlegible", { j: Math.floor(r.ilegibleDesde / 2) + 1 }));
    }
    partes.push(tx("planillaRevisa"));
    const dudosas = js.map((j, i) => ({ j, i })).filter((x) => x.j.estado === "dudosa");
    let ayuda = "";
    if (dudosas.length) {
      const lista = dudosas.slice(0, MAX_DUDOSAS).map(({ j, i }) => numeroDe(i) + " " + enEspanol(j.san)
        + (j.escrito && j.escrito.length ? " («" + j.escrito.join("» / «") + "»)" : ""));
      ayuda = tx("planillaDudosas") + " " + lista.join(" · ") + (dudosas.length > MAX_DUDOSAS ? " · …" : "");
    }
    return { texto: partes.join(" "), ayuda };
  }

  // ------------------------------------------------------------ en el navegador

  const cargas = {};
  function cargar(src) {
    if (!cargas[src]) cargas[src] = new Promise((listo, fallo) => {
      const sc = document.createElement("script");
      sc.src = src;
      sc.addEventListener("load", listo);
      sc.addEventListener("error", () => { delete cargas[src]; fallo(new Error("No cargó " + src)); });
      document.head.appendChild(sc);
    });
    return cargas[src];
  }


  /* fotos: los archivos que eligió quien organiza (una o dos). decir(clave,
     datos): para contar en qué va. Las dos planillas en una foto o en dos
     fotos dan lo mismo: cada foto aporta las hojas que se le encuentren.
     Devuelve también `lectura` (lectura() abajo), y si no sale ninguna jugada
     el error la lleva en `e.lectura`: la que sale mal es la que hay que ver. */
  async function leer(fotos, o) {
    const decir = o.decir || (() => {});
    if (!raiz.PlanillaOcr) await cargar("js/planilla-ocr.js");
    if (!raiz.PlanillaReconstruir) await cargar("js/planilla-reconstruir.js");
    const lista = [...fotos].slice(0, MAX_FOTOS);
    let hojas = [], metodo = "numeros";
    const leidas = [];
    // La foto chica se lee mal: la primera de verdad (17/11) llegó de unos 400 × 620 px, con la letra de 15 px.
    // Se mide antes de mandarla, para decirlo.
    let chica = null;
    for (let k = 0; k < lista.length; k++) {
      try {
        const bm = await createImageBitmap(lista[k]);
        if (Math.max(bm.width, bm.height) < FOTO_MINIMA && (!chica || bm.width * bm.height < chica.ancho * chica.alto)) chica = { ancho: bm.width, alto: bm.height };
        if (bm.close) bm.close();
      } catch (e) { /* no se pudo medir: se lee igual */ }
    }
    for (let k = 0; k < lista.length; k++) {
      decir("planillaLeyendo", { k: k + 1, n: lista.length });
      const { words } = await raiz.PlanillaOcr.leerFoto(lista[k], o.token, { maxLado: 2600 });
      const h = raiz.PlanillaReconstruir.hojasDeLaFoto(words);
      if (h.metodo === "filas") metodo = "filas";
      leidas.push({ palabras: words || [], metodo: h.metodo, hojas: h.hojas });
      hojas = hojas.concat(h.hojas);
    }
    hojas = hojas.filter((h) => h && h.length).slice(0, 2);
    const vacia = () => { const e = new Error("vacia"); e.lectura = lectura(leidas, null, o.datos); e.chica = chica; return e; };
    if (!hojas.length) throw vacia();
    decir("planillaArmando", { p: 0 });
    // el hilo es el de PlanillaReconstruir.enHilo(): una sola copia para todas las páginas que leen planillas
    const resultado = await raiz.PlanillaReconstruir.enHilo(hojas, (x) => decir("planillaArmando", { p: Math.round(x * 100) }));
    if (!resultado.jugadas || !resultado.jugadas.length) throw vacia();
    return { resultado, hojas: hojas.length, metodo, chica, lectura: lectura(leidas, resultado, o.datos) };
  }

  /* «⬇ Lectura»: lo que devolvió Google Vision de cada foto (cada palabra con
     su caja, tal cual: se puede pasar otra vez a hojasDeLaFoto()), las celdas
     que salieron de cada planilla y la partida que se armó. Es para revisar
     con datos de verdad por qué una planilla se leyó mal y afinar
     js/planilla-reconstruir.js. Trae lo escrito en la planilla, también los
     nombres del encabezado: es para quien organiza, nunca para el repositorio.
     El mismo formato del «Descargar la lectura» del Centroamericano, con una
     entrada por foto. `datos`: el torneo, la ronda y la mesa. */
  function lectura(leidas, r, datos) {
    return Object.assign({ que: "Lectura de la foto de las planillas («📷 Planilla», Pareo Integral)", version: 1 }, datos || {}, {
      fotos: leidas.map((f) => ({ metodo: f.metodo, hojas: f.hojas, palabras: f.palabras.map((w) => ({ text: w.text, bbox: w.bbox })) })),
      partida: r ? {
        jugadas: r.jugadas.map((j) => ({ san: j.san, estado: j.estado, escrito: j.escrito || [], alternativa: j.alternativa || null })),
        ilegibleDesde: r.ilegibleDesde, resto: r.resto || [], costo: r.costo,
      } : null,
    });
  }

  const api = { leer, pgn, resumen, lectura, MAX_FOTOS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.PareoPlanilla = api;
})(typeof self !== "undefined" ? self : this);

/*! rev bfb5bbb0d2d82f9f */
