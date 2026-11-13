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
  const TIPOS = { resultado: "Resultado", correccion: "Corrección", ilegal: "Ilegal", irregularidad: "Irregularidad", incidencia: "Incidencia", nota: "Nota", anulacion: "Anulación" };

  const textoResultado = (valor) => (POR_VALOR.get(String(valor)) || { texto: "—" }).texto;

  // Los resultados de Pareo Integral (los del canal del árbitro adjunto, js/pareo/ver.js) → el valor de
  // chess-results de esta lista, para escribirlos y leerlos con lo mismo. Ver «La mesa del árbitro con
  // los torneos de Pareo Integral».
  const DE_PAREO = { "1-0": "1", "=": "2", "0-1": "3", "+-": "4", "-+": "5", "--": "6" };
  const valorDePareo = (r) => DE_PAREO[r] || "0";
  // De dónde es una línea: «Pareo Integral» o «chess-results».
  const fuente = (l) => (l && l.pareo ? "Pareo Integral" : "chess-results");
  const nombreBitacora = (valor) => (POR_VALOR.get(String(valor)) || {}).bitacora || null;

  // ---- Las jugadas ilegales y las irregularidades. Las comparten esta Mesa y la del Centroamericano
  // (js/centroamericano-mesas.js las toma de acá): una sola copia de la regla.
  // LAS REGLAS DE LAS ILEGALES son las de Pareo Integral (js/pareo/textos.js, marcasIncidencias en
  // js/pareo/evento.js): se cuentan por partida, es decir por ronda + mesa + color; la primera le da dos
  // minutos más al rival y la segunda hace perder la partida (art. 7.5.5), salvo que el rival no pueda dar
  // mate con ninguna serie de jugadas legales (tablas). Solo se escribe lo que se le avisa al árbitro: el
  // resultado lo decide y lo guarda él.
  const ARTICULO_ILEGAL = "7.5.5";

  // «i» por cada ilegal y «!» por cada irregularidad: el mismo código de Pareo.
  const marcasTexto = (m) => (m ? "i".repeat(m.ilegales || 0) + "!".repeat(m.irregularidades || 0) : "");

  // Lo que se le dice al árbitro al anotar una ilegal. `n` es la cuenta de ESA
  // partida y ESE jugador, ya con la que acaba de anotar.
  // `minutos`: los que se le dan al rival por la primera (2; 1 en el blitz, Leyes del Ajedrez, apéndice B.3).
  function avisoIlegal(n, nombre, color, minutos) {
    const min = minutos === 1 ? "1 minuto" : "2 minutos";
    const quien = nombre || (color === "negras" ? "Las negras" : "Las blancas");
    if (n >= 2) {
      return {
        nivel: "pierde",
        titulo: "Segunda jugada ilegal: pierde la partida",
        texto: quien + " ya hizo " + n + " jugadas ilegales en esta partida: pierde la partida (art. " + ARTICULO_ILEGAL + "). " +
          "Excepción: si su rival no puede dar mate con ninguna serie de jugadas legales, la partida es tablas. " +
          "Tú decides el resultado: no se guarda solo.",
        // Pierde quien la hizo: si son las blancas, gana el negro (0-1), y al revés.
        resultado: color === "blancas" ? "3" : "1",
      };
    }
    return {
      nivel: "primera",
      titulo: "Primera jugada ilegal",
      texto: quien + " hizo una jugada ilegal: dale " + min + " más a su rival (art. " + ARTICULO_ILEGAL + "). Con otra, pierde la partida.",
      resultado: null,
    };
  }

  // La primera ilegal: 2 minutos para el rival; en el blitz, 1 (apéndice B.3).
  const minutosIlegal = (ritmo) => (ritmo === "blitz" ? 1 : 2);

  // ---- Los tipos de jugada ilegal y de irregularidad, para elegirlos de una lista y que
  // queden en la bitácora sin escribir. Son los casos de siempre de un torneo; el artículo
  // solo va donde el reglamento de FIDE lo dice sin duda (si falta uno, el árbitro puede
  // elegir «Otra» y escribirlo). La ilegal es siempre el 7.5.5 (dos minutos al rival la
  // primera; la segunda pierde la partida). «Otra» va PRIMERO y es la que viene elegida: si el
  // árbitro escribe lo que pasó y no toca la lista, queda anotado tal cual en «Otra», y no
  // con una frase de la lista que no eligió (pasó en el Centroamericano 2026).
  const TIPOS_ILEGAL = [
    { id: "otra", texto: "Otra (escribir qué pasó)" },
    { id: "pieza", texto: "Movió una pieza como esa pieza no puede moverse" },
    { id: "rey-jaque", texto: "Dejó o puso su propio rey en jaque" },
    { id: "no-salio-jaque", texto: "No salió de un jaque" },
    { id: "enroque", texto: "Enroque ilegal" },
    { id: "captura", texto: "Captura ilegal (de su propia pieza o de una casilla que no corresponde)" },
    { id: "promocion", texto: "Peón en la última fila sin promover a una pieza válida" },
    { id: "turno", texto: "Jugó fuera de turno o dos jugadas seguidas" },
  ];
  const TIPOS_IRREGULARIDAD = [
    { id: "otra", texto: "Otra (escribir qué pasó)" },
    { id: "toque", texto: "Tocó una pieza y no la movió (pieza tocada)", articulo: "4.3" },
    { id: "componer", texto: "Arregló piezas sin decir «compongo»", articulo: "4.2" },
    { id: "planilla", texto: "No anota la partida en la planilla", articulo: "8.1" },
    { id: "tablas", texto: "Ofreció tablas de forma incorrecta", articulo: "9.2" },
    { id: "celular", texto: "Celular o aparato electrónico sonó o lo tenía encendido", articulo: "11.3.2" },
    { id: "ruido", texto: "Molestó al rival o hizo ruido" },
    { id: "salio", texto: "Salió del área de juego sin permiso" },
    { id: "ayuda", texto: "Recibió ayuda o habló con otras personas durante la partida" },
    { id: "reloj", texto: "Usó mal el reloj (con la otra mano, golpeándolo, sin soltar la pieza)" },
  ];

  // Lo que se anota en el registro de una ilegal o irregularidad elegida de la lista.
  function textoTipo(lista, id, nota) {
    const t = lista.find((x) => x.id === id);
    if (!t) return null;
    const n = String(nota || "").trim();
    if (id === "otra" && !n) return null;
    return { texto: (id === "otra" ? "Otra: " + n : t.texto + (n ? ". " + n : "")), articulo: t.articulo || "" };
  }

  // Las marcas de cada partida a partir de las líneas de la bitácora: { "ronda|mesa|color": { ilegales,
  // irregularidades, ultima_ilegal, ultima_irregularidad } }, sin lo anulado (una anulación es otra línea que
  // apunta a la anulada con `anula`). Las líneas vienen en orden de hora: la «última» es la más reciente.
  const claveMarca = (ronda, mesa, color) => [ronda, mesa, color].join("|");
  function marcas(lineas) {
    const anuladas = new Set((lineas || []).filter((l) => l.tipo === "anulacion" && l.anula).map((l) => l.anula));
    const out = {};
    for (const l of lineas || []) {
      if ((l.tipo !== "ilegal" && l.tipo !== "irregularidad") || anuladas.has(l.id) || !l.color) continue;
      const k = claveMarca(l.ronda, l.mesa, l.color);
      const x = out[k] || (out[k] = { ilegales: 0, irregularidades: 0, ultima_ilegal: null, ultima_irregularidad: null });
      if (l.tipo === "ilegal") { x.ilegales++; x.ultima_ilegal = l.id; } else { x.irregularidades++; x.ultima_irregularidad = l.id; }
    }
    return out;
  }

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
    const enviado = l.pareo ? " · aceptado por el árbitro principal en Pareo Integral" : " · enviado a chess-results";
    if (l.tipo === "resultado") return textoResultado(valorDeBitacora(l.resultado)) + (l.texto ? " — " + l.texto : "") + (l.enviado ? enviado : " · solo anotado");
    if (l.tipo === "correccion") return "De «" + textoResultado(valorDeBitacora(l.anterior)) + "» a «" + textoResultado(valorDeBitacora(l.resultado)) + "»" + (l.texto ? " — " + l.texto : "") + (l.enviado ? enviado : " · solo anotado");
    if (l.tipo === "ilegal" || l.tipo === "irregularidad") return (l.jugador || "Jugador") + " (" + (l.color === "negras" ? "negras" : "blancas") + ")" + (l.texto ? ": " + l.texto : "");
    if (l.tipo === "anulacion") return "Anula una anotación anterior de " + (l.jugador || (l.color === "negras" ? "las negras" : "las blancas")) + (l.texto ? ": " + l.texto : "") + ".";
    return l.texto || "";
  }
  function valorDeBitacora(nombre) {
    const r = RESULTADOS.find((x) => x.bitacora === nombre);
    return r ? r.valor : "";
  }

  // El documento neutro que consumen ReportePDF y ReporteDOCX (como el del
  // acta de los JDE). `hora` formatea un momento en hora de Costa Rica
  // (HoraCR.fechaHora): se recibe para que este módulo corra también en Node.
  /* La foto de las dos planillas (ver «Mesa del árbitro: la foto de las planillas» en docs/decisiones/juegos-y-torneos.md).
     El bucket es privado y la imagen se guarda en la carpeta de quien la sube: <autor>/<tnr>/<id de la foto>.jpg. */
  const BUCKET_PLANILLAS = "mesa-arbitro-planillas";
  const LADO_PLANILLA = 2600; // el lado largo de la foto, en píxeles: dos planillas en una foto, y aun así sube rápido con mala señal
  const rutaPlanilla = (autor, tnr, id) => autor + "/" + tnr + "/" + id + ".jpg";
  // Las fotos de una mesa de una ronda, la más nueva primero (una foto mejor es otra foto: no se borra la anterior).
  function planillasDeMesa(planillas, ronda, mesa) {
    return (planillas || []).filter((p) => p.ronda === ronda && p.mesa === mesa).sort((x, y) => String(y.subida).localeCompare(String(x.subida)));
  }
  const pieDePlanilla = (p, formato) => "Ronda " + p.ronda + " · mesa " + p.mesa + (p.blancas || p.negras ? " · " + (p.blancas || "Blancas") + " – " + (p.negras || "Negras") : "") + " · foto del " + formato(p.subida);

  // `planillas`: las fotos que van en el documento, [{ ronda, mesa, subida, blancas, negras, foto: { jpeg, ancho, alto } }]
  // (la página las baja y las achica). Sin ellas el documento sale como siempre.
  function documento(torneo, lineas, arbitro, hora, planillas) {
    const formato = hora || ((x) => String(x));
    const orden = lineas.slice().sort((a, b) => String(a.ocurrio).localeCompare(String(b.ocurrio)));
    // Lo anulado sigue en la tabla (la bitácora no se borra), pero no se cuenta en el resumen.
    const anuladas = new Set(orden.filter((l) => l.tipo === "anulacion" && l.anula).map((l) => l.anula));
    const cuenta = (t) => orden.filter((l) => l.tipo === t && !anuladas.has(l.id)).length;
    const enviados = orden.filter((l) => (l.tipo === "resultado" || l.tipo === "correccion") && l.enviado).length;
    const fotos = (planillas || []).slice().sort((x, y) => (x.ronda - y.ronda) || (x.mesa - y.mesa) || String(x.subida).localeCompare(String(y.subida)));
    const b = [];
    b.push({ tipo: "titulo", texto: "Resumen" });
    b.push({
      tipo: "lista",
      items: [
        "Resultados anotados: " + cuenta("resultado") + " (" + enviados + (torneo.pareo ? " aceptados por el árbitro principal en Pareo Integral" : " enviados a chess-results") + ", contando las correcciones).",
        "Correcciones de un resultado: " + cuenta("correccion") + ".",
        "Incidencias: " + cuenta("incidencia") + ". Notas: " + cuenta("nota") + ".",
        "Jugadas ilegales: " + cuenta("ilegal") + ". Irregularidades: " + cuenta("irregularidad") + "." + (anuladas.size ? " Anuladas por error: " + anuladas.size + "." : ""),
      ].concat(fotos.length ? ["Fotos de las planillas: " + fotos.length + " (al final del documento)."] : []),
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
    if (fotos.length) {
      b.push({ tipo: "titulo", texto: "Planillas fotografiadas" });
      for (const f of fotos) b.push({ tipo: "foto", foto: f.foto, anchoMax: 420, pie: pieDePlanilla(f, formato) });
    }
    b.push({ tipo: "titulo", texto: "Firma" });
    b.push({ tipo: "parrafo", texto: "______________________________   Árbitro: " + (arbitro || "") });
    return {
      titulo: "Bitácora del árbitro",
      subtitulo: (torneo.torneo || "Torneo") + (torneo.pareo ? " · Pareo Integral, enlace de árbitro " + torneo.pareo : " · chess-results " + torneo.tnr),
      pie: "Mesa del árbitro · ajedrez-integral.com",
      bloques: b,
      fotos: fotos.map((f) => f.foto),
    };
  }

  const api = { RESULTADOS, TIPOS, textoResultado, nombreBitacora, cambios, lineasDeCambios, listaParaTeclear, detalle, documento,
    ARTICULO_ILEGAL, BUCKET_PLANILLAS, LADO_PLANILLA, rutaPlanilla, planillasDeMesa, pieDePlanilla, marcasTexto, avisoIlegal, minutosIlegal, TIPOS_ILEGAL, TIPOS_IRREGULARIDAD, textoTipo, claveMarca, marcas,
    DE_PAREO, valorDePareo, fuente };
  if (enNode) module.exports = api;
  else raiz.MesaArbitro = api;
})(typeof self !== "undefined" ? self : this);

/*! rev bfb5bbb0d2d82f9f */
