/* «Mesa del árbitro» (mesa-arbitro.html): lo que no depende de la pantalla.

   Los resultados que entiende la pantalla de ingreso de chess-results (el
   desplegable de cada mesa, con su valor), qué mesas cambió el árbitro, y el
   documento de la bitácora para bajarlo en PDF o en Word (con la marca de agua
   de Ajedrez Integral: la pone ReportePDF o, en Word, la página).

   Los valores son los del desplegable de chess-results, comprobados con un
   torneo de prueba: 0 sin resultado, 1 «1 - 0», 2 «Draw», 3 «0 - 1»,
   4 «1f-0f», 5 «0f-1f», 6 «0f-0f» y D «Delete». La bitácora guarda cada uno
   con su nombre propio (columna `resultado` de arbitro_bitacora).

   Ver «Mesa del árbitro: resultados y bitácora» en
   docs/decisiones/juegos-y-torneos.md. Lo prueba verificar-mesa-arbitro.js. */
(function (raiz) {
  "use strict";
  const enNode = typeof module !== "undefined" && module.exports;

  // valor de chess-results → cómo se llama en la bitácora y cómo se lee.
  const RESULTADOS = [
    { valor: "0", bitacora: "sin resultado", texto: "Sin resultado" },
    { valor: "1", bitacora: "1-0", texto: "1-0 (ganan blancas)" },
    { valor: "2", bitacora: "1/2", texto: "½-½ (tablas)" },
    { valor: "3", bitacora: "0-1", texto: "0-1 (ganan negras)" },
    { valor: "4", bitacora: "1f-0f", texto: "1-0 por incomparecencia" },
    { valor: "5", bitacora: "0f-1f", texto: "0-1 por incomparecencia" },
    { valor: "6", bitacora: "0f-0f", texto: "0-0 (ninguno se presentó)" },
    { valor: "D", bitacora: "borrado", texto: "Borrar el resultado" },
  ];
  const POR_VALOR = new Map(RESULTADOS.map((r) => [r.valor, r]));
  const TIPOS = { resultado: "Resultado", correccion: "Corrección", incidencia: "Incidencia", nota: "Nota" };

  const textoResultado = (valor) => (POR_VALOR.get(String(valor)) || { texto: "—" }).texto;
  const nombreBitacora = (valor) => (POR_VALOR.get(String(valor)) || {}).bitacora || null;

  // Las mesas donde el árbitro eligió algo distinto de lo que ya hay en
  // chess-results. `elegido` es { [mesa]: valor }; una mesa sin elegir queda
  // como está. Elegir «Borrar» en una mesa sin resultado no es un cambio.
  function cambios(mesas, elegido) {
    const fuera = [];
    for (const m of mesas) {
      const v = elegido[m.mesa];
      if (v == null || v === "") continue;
      if (v === m.valor) continue;
      if (v === "D" && m.valor === "0") continue;
      if (v === "0" && m.valor !== "0") continue; // «Sin resultado» no se manda: para quitar uno se elige «Borrar»
      fuera.push({ mesa: m.mesa, blancas: m.blancas, negras: m.negras, valor: v, antes: m.valor });
    }
    return fuera;
  }

  // Una línea de bitácora por cada cambio mandado: «resultado» si la mesa no
  // tenía nada, «correccion» si ya tenía otro (y se anota cuál).
  function lineasDeCambios(cambiosHechos, torneo, enviado) {
    return cambiosHechos.map((c) => {
      const habia = c.antes && c.antes !== "0";
      return {
        tnr: String(torneo.tnr),
        torneo: torneo.torneo || "",
        ronda: torneo.ronda,
        mesa: c.mesa,
        tipo: habia ? "correccion" : "resultado",
        resultado: nombreBitacora(c.valor),
        anterior: habia ? nombreBitacora(c.antes) : null,
        articulo: "",
        texto: c.blancas + " – " + c.negras,
        enviado: !!enviado,
      };
    });
  }

  // La lista ordenada para teclear en la página de ingreso de chess-results:
  // «Mesa 3: 1-0».
  function listaParaTeclear(cambiosHechos) {
    return cambiosHechos.slice().sort((a, b) => a.mesa - b.mesa).map((c) => "Mesa " + c.mesa + ": " + textoResultado(c.valor)).join("\n");
  }

  function detalle(l) {
    if (l.tipo === "resultado") return textoResultado(valorDeBitacora(l.resultado)) + (l.texto ? " — " + l.texto : "") + (l.enviado ? " · enviado a chess-results" : " · solo anotado");
    if (l.tipo === "correccion") return "De «" + textoResultado(valorDeBitacora(l.anterior)) + "» a «" + textoResultado(valorDeBitacora(l.resultado)) + "»" + (l.texto ? " — " + l.texto : "") + (l.enviado ? " · enviado a chess-results" : " · solo anotado");
    return l.texto || "";
  }
  function valorDeBitacora(nombre) {
    const r = RESULTADOS.find((x) => x.bitacora === nombre);
    return r ? r.valor : "";
  }

  // El documento neutro que consumen ReportePDF y ReporteDOCX (como el del
  // acta de los JDE). `hora` formatea un momento en hora de Costa Rica
  // (HoraCR.fechaHora): se recibe para que este módulo corra también en Node.
  function documento(torneo, lineas, arbitro, hora) {
    const formato = hora || ((x) => String(x));
    const orden = lineas.slice().sort((a, b) => String(a.ocurrio).localeCompare(String(b.ocurrio)));
    const cuenta = (t) => orden.filter((l) => l.tipo === t).length;
    const enviados = orden.filter((l) => (l.tipo === "resultado" || l.tipo === "correccion") && l.enviado).length;
    const b = [];
    b.push({ tipo: "titulo", texto: "Resumen" });
    b.push({
      tipo: "lista",
      items: [
        "Resultados anotados: " + cuenta("resultado") + " (" + enviados + " enviados a chess-results, contando las correcciones).",
        "Correcciones de un resultado: " + cuenta("correccion") + ".",
        "Incidencias: " + cuenta("incidencia") + ". Notas: " + cuenta("nota") + ".",
      ],
    });
    b.push({ tipo: "titulo", texto: "Bitácora" });
    if (!orden.length) b.push({ tipo: "parrafo", texto: "No se anotó nada en este torneo." });
    else {
      b.push({
        tipo: "tabla",
        encabezados: ["Hora (Costa Rica)", "Ronda", "Mesa", "Tipo", "Detalle", "Art."],
        anchos: [2, 0.7, 0.7, 1.2, 4.2, 0.9],
        filas: orden.map((l) => [formato(l.ocurrio), l.ronda == null ? "" : String(l.ronda), l.mesa == null ? "" : String(l.mesa), TIPOS[l.tipo] || l.tipo, detalle(l), l.articulo || ""]),
      });
    }
    b.push({ tipo: "titulo", texto: "Firma" });
    b.push({ tipo: "parrafo", texto: "______________________________   Árbitro: " + (arbitro || "") });
    return {
      titulo: "Bitácora del árbitro",
      subtitulo: (torneo.torneo || "Torneo") + " · chess-results " + torneo.tnr,
      pie: "Mesa del árbitro · ajedrez-integral.com",
      bloques: b,
      fotos: [],
    };
  }

  const api = { RESULTADOS, TIPOS, textoResultado, nombreBitacora, cambios, lineasDeCambios, listaParaTeclear, detalle, documento };
  if (enNode) module.exports = api;
  else raiz.MesaArbitro = api;
})(typeof self !== "undefined" ? self : this);
