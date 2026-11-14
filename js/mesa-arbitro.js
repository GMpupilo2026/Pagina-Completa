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
  // `minutos`: los que se le dan al rival por la primera (2; 1 en rápidas y blitz, Leyes del Ajedrez, apéndice A.3).
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

  // La primera ilegal: 2 minutos para el rival (art. 7.5.5); en rápidas, 1 (apéndice A.3: «las penalizaciones de
  // los artículos 7 y 9 serán de un minuto en vez de dos»), y en el blitz también, porque el B.3 lo manda al A.3.
  // Hasta el 14/11/2026 decía 1 solo en el blitz y 2 en rápidas: el A.3 está en el apéndice de las rápidas, no en
  // el del blitz (Leyes del Ajedrez 2023, leídas en handbook.fide.com). Acepta «rapido», «blitz» o «clasico».
  const minutosIlegal = (ritmo) => (ritmo === "blitz" || ritmo === "rapido" ? 1 : 2);

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
    { id: "tablas", texto: "Ofreció tablas de forma incorrecta", articulo: "9.1.2.1" },
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

  // ---- Lo que vino de js/centroamericano-mesas.js (una sola copia: el Centroamericano lo toma de acá).

  // La sanción de tiempo de una irregularidad (art. 12.9: quitarle tiempo a quien la cometió o dárselo a su rival).
  // Va escrita al final del texto de la irregularidad, siempre con esta forma, y se vuelve a leer de ahí para el reloj
  // que se apaga: una sola copia del formato (sancionTexto escribe, leerSancion lee).
  const SANCIONES_TIEMPO = [
    { id: "", texto: "Sin sanción de tiempo" },
    { id: "rival+60", texto: "+1 minuto a su rival", segundos: 60, a: "rival" },
    { id: "rival+120", texto: "+2 minutos a su rival", segundos: 120, a: "rival" },
    { id: "suyo-60", texto: "−1 minuto a quien la cometió", segundos: -60, a: "suyo" },
    { id: "suyo-120", texto: "−2 minutos a quien la cometió", segundos: -120, a: "suyo" },
  ];
  const ARTICULO_SANCION = "12.9";
  function sancionTexto(id) {
    const x = SANCIONES_TIEMPO.find((y) => y.id === id && y.segundos);
    if (!x) return "";
    return " · Sanción de tiempo: " + (x.segundos > 0 ? "+" : "−") + formatoTiempo(Math.abs(x.segundos)) + (x.a === "rival" ? " a su rival" : " a quien la cometió") + " (art. " + ARTICULO_SANCION + ")";
  }
  function leerSancion(texto) {
    const m = /Sanción de tiempo: ([+−-])(\d+):(\d\d) a (su rival|quien la cometió)/.exec(String(texto || ""));
    if (!m) return null;
    const seg = Number(m[2]) * 60 + Number(m[3]);
    return { segundos: m[1] === "+" ? seg : -seg, a: m[4] === "su rival" ? "rival" : "suyo" };
  }

  // ---- El control de tiempos: lo que marca cada reloj, en segundos.
  // «1:23:45» (h:mm:ss), «45:10» (mm:ss) o «85» (segundos) -> segundos; null si no se entiende.
  function leerTiempo(texto) {
    const t = String(texto == null ? "" : texto).trim();
    if (!/^\d{1,3}(:[0-5]?\d){0,2}$/.test(t)) return null;
    const p = t.split(":").map(Number);
    if (p.length === 3 && p[1] > 59) return null;
    const seg = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0];
    return seg >= 0 && seg <= 36000 ? seg : null;
  }
  // Los dos puntos se ponen solos: se escriben solo números (el teclado numérico de una tablet no trae «:») y se leen de
  // derecha a izquierda, como un reloj: «45» -> «45», «4510» -> «45:10», «12345» -> «1:23:45». Hasta 6 cifras (10:00:00).
  function ponerDosPuntos(texto) {
    const d = String(texto == null ? "" : texto).replace(/\D/g, "").slice(0, 6);
    if (d.length <= 2) return d;
    if (d.length <= 4) return d.slice(0, -2) + ":" + d.slice(-2);
    return d.slice(0, -4) + ":" + d.slice(-4, -2) + ":" + d.slice(-2);
  }
  // «1 h 23 min 45 s»: lo que se entendió, para que quien lo escribió lo confirme de un vistazo.
  function tiempoEnPalabras(seg) {
    seg = Math.max(0, Math.round(Number(seg) || 0));
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
    return [h ? h + " h" : "", m ? m + " min" : "", s || (!h && !m) ? s + " s" : ""].filter(Boolean).join(" ");
  }
  // segundos -> «1:23:45» o «45:10»
  function formatoTiempo(seg) {
    seg = Math.max(0, Math.round(Number(seg) || 0));
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
    const dos = (n) => (n < 10 ? "0" : "") + n;
    return h ? h + ":" + dos(m) + ":" + dos(s) : m + ":" + dos(s);
  }

  // ---- El reloj que se apagó (art. 6.10 de las Leyes: el árbitro pone los tiempos «según su mejor criterio»).
  // Esto le da un número defendible, con las cuentas a la vista. Parte del control de tiempos MÁS RECIENTE de esa
  // partida (los controles caen en cualquier jugada: no hace falta que sea la 20) y de lo que se sabe del ritmo.
  //   · Lo exacto: mientras la partida corre siempre anda un reloj, así que entre el control y «ahora» los dos juntos
  //     gastaron justo el tiempo real que pasó, y cada jugada hecha les sumó su incremento.
  //   · Lo que se propone: cómo se reparte eso. «ritmo»: como cada uno venía gastando hasta el control (lo gastado lo
  //     dice el mismo control: inicial + incrementos − lo que le quedaba). «iguales»: mitad y mitad.
  //   · La comprobación con la hora de inicio: lo que debían sumar los relojes en el control según el inicio. Si no
  //     cuadra, la partida empezó tarde, hubo una pausa o el control se anotó mal: se avisa, no se corrige solo.
  // Sin ningún control, el total sale del inicio y se reparte por partes iguales (no hay de dónde sacar el ritmo).
  //   · Las ilegales: la primera de cada jugador le da 2 minutos a su rival (art. 7.5.5). `bonos` son esos minutos,
  //     cada uno con el color que los RECIBIÓ y su hora. Los de antes del control ya están en lo que marcaban los
  //     relojes: no se suman otra vez, pero sí se descuentan de lo «gastado» (si no, quien los recibió parecería
  //     haber pensado 2 minutos menos) y entran en la comprobación con el inicio. Los de después se le suman.
  //   · Las llegadas tarde (`llegadas`, de llegadasTarde): mientras el jugador no estaba, SU reloj corría (art. 6.7: la partida
  //     empieza al hacer andar el reloj de las blancas; si llegan tarde las negras, corre el suyo apenas mueven las blancas).
  //     Ese tiempo no se reparte como el resto: se le cobra entero a quien llegó tarde, y lo demás sí se reparte. Lo que cae
  //     ANTES del control ya está en lo que marcaban los relojes; solo cuenta lo que cae después del control (o, sin
  //     control, desde el inicio de la ronda). Con las dos tarde, primero corre el reloj de las blancas hasta que llegan, y
  //     después el de las negras hasta que llegan ellas.
  // Todo en segundos y en milisegundos de reloj (Date.getTime()). Devuelve { error } si algo no cuadra.
  // Lo que corrió en el reloj de cada uno por haber llegado tarde, dentro de los `pasaron` segundos que se están repartiendo (los que van
  // desde `desdeMs`, el control o el inicio, hasta ahora). Cada llegada es { color, ms, segundos }: la hora en que llegó y cuánto
  // se había tardado; la espera cubre desde ms − segundos hasta ms, y solo cuenta la parte que cae después de `desdeMs`.
  function cargaPorTarde(llegadas, desdeMs, pasaron) {
    const t = { blancas: 0, negras: 0 };
    for (const l of llegadas || []) {
      if (l.color !== "blancas" && l.color !== "negras") continue;
      const seg = Math.max(0, (l.ms - Math.max(l.ms - l.segundos * 1000, desdeMs)) / 1000);
      t[l.color] = Math.max(t[l.color], seg);
    }
    const b = Math.min(pasaron, Math.round(t.blancas));
    const n = Math.min(pasaron - b, Math.max(0, Math.round(t.negras - t.blancas)));
    return { blancas: b, negras: n };
  }
  const RITMO = { inicial: 90 * 60, incremento: 30 };
  const BONO_ILEGAL = 120;
  const RITMO_CONFIABLE = 10;   // medias jugadas antes del control desde las que el ritmo cuenta entero
  // `visto`: lo que marca AHORA un reloj que todavía se lee ({ blancas, negras }, en segundos; uno solo o los dos). Manda sobre el
  // reparto: el tiempo total entre los dos es exacto, así que el del otro color es lo que sobra.
  // `reparto`: «ritmo» (como venían gastando), «iguales» (mitad y mitad) o «turno» (todo lo que pasó lo gastó quien tenía el turno,
  // solo si nadie ha movido desde el control). «ritmo» pasa solo a «turno» cuando nadie ha movido: es lo que de verdad pasó.
  function relojApagado({ control, inicio, ahora, jBlancas, jNegras, reparto = "ritmo", ritmo = RITMO, bonos = [], llegadas = [], visto = null }) {
    const R = ritmo, ent = (n) => Number.isInteger(n) && n >= 0 && n <= 400;
    if (!ent(jBlancas) || !ent(jNegras)) return { error: "Escribe las jugadas que lleva cada color (de 0 a 400)." };
    if (jBlancas !== jNegras && jBlancas !== jNegras + 1) return { error: "Las blancas llevan las mismas jugadas que las negras o una más: revisa las jugadas." };
    const turno = jBlancas === jNegras ? "blancas" : "negras";
    const quedaba = (t, j) => R.inicial + R.incremento * j - t;   // lo gastado hasta ese momento (sin los bonos)
    const desdeCtl = control ? new Date(control.ocurrio).getTime() : -Infinity;
    const suma = (lista, color) => lista.filter((b) => b.color === color).reduce((a, b) => a + (b.segundos == null ? BONO_ILEGAL : b.segundos), 0);
    const antes = bonos.filter((b) => b.ms <= desdeCtl), despues = bonos.filter((b) => b.ms > desdeCtl);
    const bonosAntes = { blancas: suma(antes, "blancas"), negras: suma(antes, "negras") };
    const bonosDespues = { blancas: suma(despues, "blancas"), negras: suma(despues, "negras") };
    let base, total, pasaron, jugadas;
    if (control) {
      const cj = (x) => (x == null ? null : Number(x));
      const cB = cj(control.j_blancas), cN = cj(control.j_negras);
      if (cB == null || cN == null) return { error: "El último control de esta mesa no tiene las jugadas de cada color." };
      if (jBlancas < cB || jNegras < cN) return { error: "En el último control ya iban " + cB + " jugadas de las blancas y " + cN + " de las negras: ahora no pueden ser menos." };
      const desde = new Date(control.ocurrio).getTime();
      pasaron = Math.round((ahora - desde) / 1000);
      if (pasaron < 0) return { error: "La hora de ahora es anterior a la del último control." };
      jugadas = (jBlancas - cB) + (jNegras - cN);
      total = control.t_blancas + control.t_negras - pasaron + R.incremento * jugadas + bonosDespues.blancas + bonosDespues.negras;
      base = { blancas: control.t_blancas, negras: control.t_negras };
      // Lo que cada uno gastó hasta el control: la proporción para repartir.
      const gB = Math.max(0, quedaba(control.t_blancas, cB) + bonosAntes.blancas), gN = Math.max(0, quedaba(control.t_negras, cN) + bonosAntes.negras);
      // Con un control de muy temprano, «cómo venía gastando» todavía no dice nada (dos o tres jugadas al azar): el
      // ritmo pesa de a poco y entero desde las 10 medias jugadas (5 de cada uno); antes, se acerca a mitad y mitad.
      // Probado con partidas simuladas: así erra menos que el ritmo solo y que mitad y mitad, con jugadores parejos
      // y disparejos (ver «El reloj que se apaga» en docs/decisiones/juegos-y-torneos.md).
      let pB = 0.5, peso = 0;
      if (reparto === "ritmo" && gB + gN > 0) { peso = Math.min(1, (cB + cN) / RITMO_CONFIABLE); pB = 0.5 + (gB / (gB + gN) - 0.5) * peso; }
      const tarde = cargaPorTarde(llegadas, desde, pasaron);
      const resto = pasaron - tarde.blancas - tarde.negras;
      // Nadie ha movido desde el control: todo lo que pasó lo gastó quien tenía el turno (menos la espera de quien llegó tarde).
      const sinMoverse = jBlancas === cB && jNegras === cN, turnoCtl = cB === cN ? "blancas" : "negras";
      if (reparto === "turno" && !sinMoverse) return { error: "Desde el control ya se jugaron jugadas: no se sabe cuánto gastó cada uno. Elige otro reparto o escribe lo que marca un reloj." };
      const porTurno = sinMoverse && reparto !== "iguales";
      if (porTurno) { pB = turnoCtl === "blancas" ? 1 : 0; peso = 1; }
      const usadoB = porTurno ? (turnoCtl === "blancas" ? tarde.blancas + resto : tarde.blancas) : tarde.blancas + Math.round(resto * pB);
      const usadoN = pasaron - usadoB;
      const res = {
        turno, pasaron, jugadas, total, reparto: porTurno ? "turno" : reparto === "ritmo" && gB + gN > 0 ? "ritmo" : "iguales", proporcion: { blancas: pB, negras: 1 - pB }, pesoRitmo: peso,
        tarde, gastado: { blancas: usadoB, negras: usadoN }, bonos: bonosDespues, bonosAntes, ajustes: despues,
        blancas: base.blancas - usadoB + R.incremento * (jBlancas - cB) + bonosDespues.blancas,
        negras: base.negras - usadoN + R.incremento * (jNegras - cN) + bonosDespues.negras,
      };
      // La comprobación con el inicio: en el control, los relojes debían sumar esto.
      if (inicio != null) {
        const esperado = 2 * R.inicial - Math.round((desde - inicio) / 1000) + R.incremento * (cB + cN) + bonosAntes.blancas + bonosAntes.negras;
        res.comprobacion = { esperado, anotado: control.t_blancas + control.t_negras, diferencia: control.t_blancas + control.t_negras - esperado };
      }
      return conVisto(res, visto, { blancas: base.blancas + R.incremento * (jBlancas - cB) + bonosDespues.blancas, negras: base.negras + R.incremento * (jNegras - cN) + bonosDespues.negras });
    }
    if (inicio == null) return { error: "Esta mesa no tiene ningún control de tiempos y no se sabe a qué hora empezó la ronda: no hay de dónde calcular." };
    pasaron = Math.round((ahora - inicio) / 1000);
    if (pasaron < 0) return { error: "La hora de ahora es anterior al inicio de la ronda." };
    jugadas = jBlancas + jNegras;
    total = 2 * R.inicial - pasaron + R.incremento * jugadas + bonosDespues.blancas + bonosDespues.negras;
    const tardeS = cargaPorTarde(llegadas, inicio, pasaron);
    const usadoB = tardeS.blancas + Math.round((pasaron - tardeS.blancas - tardeS.negras) / 2), usadoN = pasaron - usadoB;
    return conVisto({ turno, pasaron, jugadas, total, reparto: "iguales", proporcion: { blancas: 0.5, negras: 0.5 }, sinControl: true,
      tarde: tardeS, gastado: { blancas: usadoB, negras: usadoN }, bonos: bonosDespues, bonosAntes, ajustes: despues,
      blancas: R.inicial - usadoB + R.incremento * jBlancas + bonosDespues.blancas, negras: R.inicial - usadoN + R.incremento * jNegras + bonosDespues.negras },
      visto, { blancas: R.inicial + R.incremento * jBlancas + bonosDespues.blancas, negras: R.inicial + R.incremento * jNegras + bonosDespues.negras });
  }
  // Lo que el árbitro lee en un reloj que todavía marca manda sobre el reparto: el total entre los dos es exacto, así que si lee uno,
  // el del otro es lo que sobra; si lee los dos, valen los dos (y se dice cuánto se aleja la suma del total). `tope` es lo que
  // tendría cada uno sin haber gastado nada desde el control (para sacar cuánto gastó).
  function conVisto(res, visto, tope) {
    const ok = (x) => Number.isFinite(x) && x >= 0 ? Math.round(x) : null;
    const vb = visto ? ok(visto.blancas) : null, vn = visto ? ok(visto.negras) : null;
    if (vb == null && vn == null) return res;
    const b = vb != null ? vb : res.total - vn, n = vn != null ? vn : res.total - vb;
    if (b < 0 || n < 0) return { error: "Lo que marca ese reloj es más de lo que queda entre los dos (" + Math.max(0, res.total) + " s): revisa la lectura o la hora." };
    const gB = tope.blancas - b, gN = tope.negras - n;
    return Object.assign(res, { reparto: "lectura", blancas: b, negras: n, gastado: { blancas: gB, negras: gN },
      visto: { blancas: vb, negras: vn, diferencia: vb != null && vn != null ? vb + vn - res.total : 0 },
      proporcion: gB + gN > 0 ? { blancas: Math.min(1, Math.max(0, gB / (gB + gN))), negras: Math.min(1, Math.max(0, gN / (gB + gN))) } : res.proporcion });
  }


  // ==== El reloj y lo que dice el reglamento (Mesa del árbitro general) ====
  // Ver «Mesa del árbitro: el reloj y lo que dice el reglamento» en docs/decisiones/juegos-y-torneos.md. Todo
  // artículo citado acá se leyó en las Leyes del Ajedrez de la FIDE vigentes (2023, handbook.fide.com/chapter/E012023).

  // ---- El ritmo del torneo: { inicial, incremento, control } en segundos. `control` es el segundo período
  // ({ jugada: 40, agrega: 1800 }: en la jugada 40 se suman 30 minutos) o null.
  const RITMO_POR_DEFECTO = { inicial: 90 * 60, incremento: 30, control: null };
  function ritmoValido(r) {
    if (!r || typeof r !== "object") return null;
    const ent = (x, a, b) => Number.isInteger(x) && x >= a && x <= b;
    if (!ent(r.inicial, 60, 6 * 3600) || !ent(r.incremento, 0, 600)) return null;
    let control = null;
    if (r.control) {
      if (!ent(r.control.jugada, 1, 200) || !ent(r.control.agrega, 60, 4 * 3600)) return null;
      control = { jugada: r.control.jugada, agrega: r.control.agrega };
    }
    return { inicial: r.inicial, incremento: r.incremento, control };
  }
  // Clásico, rápidas o blitz, como lo definen las Leyes: el tiempo asignado más 60 veces el incremento; 10 minutos o
  // menos es blitz (B.1), más de 10 y menos de 60 es rápidas (A.1), y 60 o más, clásico.
  function modalidad(r) {
    const total = r.inicial + 60 * r.incremento;
    return total <= 600 ? "blitz" : total < 3600 ? "rapido" : "clasico";
  }
  const NOMBRE_MODALIDAD = { clasico: "Clásico", rapido: "Rápidas", blitz: "Blitz" };
  function textoRitmo(r) {
    const min = (s) => (s % 60 ? formatoTiempo(s) : s / 60 + " min");
    let t = min(r.inicial) + (r.incremento ? " + " + r.incremento + " s por jugada" : " sin incremento");
    if (r.control) t += "; al completar la jugada " + r.control.jugada + " se suman " + min(r.control.agrega);
    return t + " · " + NOMBRE_MODALIDAD[modalidad(r)];
  }

  // ---- Corregir el reloj de una mesa. Las Leyes no dan una fórmula: el árbitro pone los tiempos «según su mejor
  // criterio» (6.10.1 con un reloj que falla, 6.10.2 con uno mal programado). Esto le da un número defendible con
  // las cuentas a la vista, y el árbitro lo puede cambiar. Los cuatro casos:
  //   · «control»: el reloj no sumó el tiempo del segundo período. A cada color que ya completó esa jugada se le suma.
  //   · «incremento»: el incremento no estaba puesto. A cada color, el incremento por cada jugada que completó.
  //   · «programado»: se programó otro ritmo. A cada color, la diferencia del tiempo inicial y la del incremento por
  //     sus jugadas. Si con el ritmo correcto el tiempo le quedaría en negativo, se dice: lo decide el árbitro.
  //   · «apagado»: el reloj se apagó o se cayó y no se puede leer. Lo hace `relojApagado` desde la hora de inicio de la
  //     ronda; las ilegales y sanciones de tiempo anotadas (`bonos`) y el segundo período entran como tiempo sumado.
  // `jBlancas` y `jNegras` son las jugadas COMPLETADAS (con el reloj pulsado) de cada color; `tBlancas` y `tNegras`,
  // lo que marca el reloj ahora (en segundos). Devuelve { blancas, negras, pasos, avisos, articulo, resumen } o { error }.
  const CASOS_RELOJ = [
    { id: "control", texto: "No sumó el tiempo del segundo período (por ejemplo, en la jugada 40)" },
    { id: "incremento", texto: "El incremento por jugada no estaba puesto" },
    { id: "programado", texto: "Se programó otro ritmo (otro tiempo inicial u otro incremento)" },
    { id: "apagado", texto: "Se apagó, se cayó o no se puede leer" },
  ];
  function jugadasValidas(jB, jN) {
    const ent = (n) => Number.isInteger(n) && n >= 0 && n <= 400;
    if (!ent(jB) || !ent(jN)) return "Escribe las jugadas que completó cada color (de 0 a 400).";
    if (jB !== jN && jB !== jN + 1) return "Las blancas completaron las mismas jugadas que las negras o una más: revisa las jugadas.";
    return null;
  }
  const signo = (s) => (s < 0 ? "−" : "+") + formatoTiempo(Math.abs(s));
  function corregirReloj(caso, d) {
    const r = ritmoValido(d && d.ritmo);
    if (!r) return { error: "Primero escribe el ritmo del torneo." };
    const jB = d.jBlancas, jN = d.jNegras;
    const malJ = jugadasValidas(jB, jN);
    if (malJ) return { error: malJ };
    const COLORES = [["blancas", "Las blancas", jB], ["negras", "Las negras", jN]];
    const pasos = [], avisos = [];
    if (caso === "apagado") {
      if (!Number.isFinite(d.inicioMs) || !Number.isFinite(d.ahoraMs)) return { error: "Escribe a qué hora empezó la ronda." };
      const bonos = (d.bonos || []).slice();
      if (r.control) for (const [c, , j] of COLORES) if (j >= r.control.jugada) bonos.push({ color: c, ms: d.ahoraMs, segundos: r.control.agrega, motivo: "segundo período" });
      const x = relojApagado({ control: null, inicio: d.inicioMs, ahora: d.ahoraMs, jBlancas: jB, jNegras: jN, ritmo: r, bonos, visto: d.visto || null });
      if (x.error) return { error: x.error };
      if (x.total < 0) return { error: "Con esa hora de inicio, a los dos ya se les habría acabado el tiempo: revisa la hora o las jugadas." };
      pasos.push("Desde que empezó la ronda pasaron " + tiempoEnPalabras(x.pasaron) + ": mientras se juega siempre anda un reloj, así que entre los dos gastaron justo eso.");
      if (r.incremento) pasos.push("Cada jugada completada sumó " + r.incremento + " s: " + x.jugadas + " jugadas entre los dos.");
      for (const b of bonos) pasos.push((b.color === "blancas" ? "Las blancas" : "Las negras") + " suman " + signo(b.segundos) + " (" + (b.motivo || "anotado en la bitácora") + ").");
      pasos.push("Quedan " + formatoTiempo(Math.max(0, x.total)) + " entre los dos.");
      if (x.reparto === "lectura") pasos.push("Se respeta lo que todavía se lee en el reloj, y el otro se lleva lo que sobra.");
      else { pasos.push("Sin un reloj que se pueda leer, el tiempo se reparte mitad y mitad: si sabes cómo venía gastando cada uno, ajústalo."); avisos.push("Mitad y mitad es solo un punto de partida: ajústalo a lo que viste en la partida (art. 6.10.1)."); }
      if (x.blancas < 0 || x.negras < 0) avisos.push("A " + (x.blancas < 0 ? "las blancas" : "las negras") + " no les alcanza el tiempo con este reparto: decide según tu criterio.");
      const res = { blancas: Math.max(0, x.blancas), negras: Math.max(0, x.negras), pasos, avisos, articulo: "6.10.1" };
      res.resumen = "Reloj reemplazado (se apagó o no se podía leer): blancas " + formatoTiempo(res.blancas) + ", negras " + formatoTiempo(res.negras) + ", con " + jB + " y " + jN + " jugadas completadas.";
      return res;
    }
    const t = { blancas: d.tBlancas, negras: d.tNegras };
    if (![t.blancas, t.negras].every((s) => Number.isInteger(s) && s >= 0 && s <= 36000)) return { error: "Escribe lo que marca ahora el reloj de cada uno (por ejemplo 12:40 o 1:05:30)." };
    const aj = { blancas: 0, negras: 0 };
    let motivo = "";
    if (caso === "control") {
      if (!r.control) return { error: "El ritmo de este torneo no tiene un segundo período. Si lo tiene, agrégalo en «Ritmo del torneo»." };
      motivo = "no sumó el tiempo de la jugada " + r.control.jugada;
      for (const [c, nombre, j] of COLORES) {
        if (j >= r.control.jugada) { aj[c] = r.control.agrega; pasos.push(nombre + " completaron " + j + " jugadas (ya pasaron la " + r.control.jugada + "): se les suman " + tiempoEnPalabras(r.control.agrega) + "."); }
        else pasos.push(nombre + " completaron " + j + ": todavía no llegan a la " + r.control.jugada + ", no se les suma nada.");
      }
      if (!aj.blancas && !aj.negras) return { error: "Ninguno de los dos completó todavía la jugada " + r.control.jugada + ": el reloj no tenía que sumar nada." };
      avisos.push("Corrige también el contador de jugadas del reloj, si lo lleva (art. 6.10.2).");
    } else if (caso === "incremento") {
      if (!r.incremento) return { error: "El ritmo de este torneo no tiene incremento. Si lo tiene, corrígelo en «Ritmo del torneo»." };
      motivo = "el incremento de " + r.incremento + " s no estaba puesto";
      for (const [c, nombre, j] of COLORES) { aj[c] = r.incremento * j; pasos.push(nombre + ": " + j + " jugadas × " + r.incremento + " s = " + tiempoEnPalabras(aj[c]) + "."); }
      avisos.push("Programa el incremento antes de volver a poner el reloj en marcha (art. 6.10.2).");
    } else if (caso === "programado") {
      const p = d.programado || {};
      if (!Number.isInteger(p.inicial) || p.inicial < 0 || !Number.isInteger(p.incremento) || p.incremento < 0) return { error: "Escribe el ritmo que se programó por error." };
      const dBase = r.inicial - p.inicial, dInc = r.incremento - p.incremento;
      if (!dBase && !dInc) return { error: "Lo que se programó es el mismo ritmo del torneo: no hay nada que corregir por esto." };
      motivo = "estaba programado " + formatoTiempo(p.inicial) + " + " + p.incremento + " s";
      if (dBase) pasos.push("Tiempo inicial: debía ser " + tiempoEnPalabras(r.inicial) + " y se programó " + tiempoEnPalabras(p.inicial) + ": " + signo(dBase) + " a cada uno.");
      for (const [c, nombre, j] of COLORES) {
        aj[c] = dBase + dInc * j;
        if (dInc) pasos.push(nombre + ": " + j + " jugadas × " + (dInc > 0 ? "+" : "−") + Math.abs(dInc) + " s de incremento = " + signo(dInc * j) + ".");
      }
      avisos.push("Programa el ritmo correcto antes de volver a poner el reloj en marcha (art. 6.10.2).");
    } else return { error: "Elige qué pasó con el reloj." };
    const res = { pasos, avisos, articulo: "6.10.2" };
    for (const [c, nombre] of COLORES) {
      const v = t[c] + aj[c];
      pasos.push(nombre + ": " + formatoTiempo(t[c]) + " " + signo(aj[c]) + " = " + formatoTiempo(Math.max(0, v)) + ".");
      if (v < 0) avisos.push("Con el ritmo correcto, a " + nombre.toLowerCase() + " ya se les habría acabado el tiempo. Las Leyes lo dejan a tu criterio (art. 6.10.2).");
      res[c] = Math.max(0, v);
    }
    res.resumen = "Reloj corregido (" + motivo + "): blancas " + formatoTiempo(res.blancas) + ", negras " + formatoTiempo(res.negras) + ", con " + jB + " y " + jN + " jugadas completadas.";
    return res;
  }

  // El tiempo que ya se sumó o restó en una mesa según la bitácora, para el reloj que se apaga: la PRIMERA ilegal (sin
  // anular) de cada jugador le da `minutos` a su rival (la segunda hace perder: no da tiempo), y una irregularidad con
  // sanción de tiempo (leerSancion) se la da o se la quita a quien dice. Cada uno con la hora en que se anotó.
  function bonosDeMesa(lineas, ronda, mesa, minutos) {
    const fuera = new Set((lineas || []).filter((l) => l.tipo === "anulacion" && l.anula).map((l) => l.anula));
    const rival = (c) => (c === "blancas" ? "negras" : "blancas");
    const vistos = new Set(), out = [];
    const orden = (lineas || []).filter((l) => l.ronda === ronda && l.mesa === mesa && !fuera.has(l.id) && (l.color === "blancas" || l.color === "negras"))
      .slice().sort((a, b) => String(a.ocurrio).localeCompare(String(b.ocurrio)));
    for (const l of orden) {
      const ms = new Date(l.ocurrio).getTime();
      if (l.tipo === "ilegal" && !vistos.has(l.color)) {
        vistos.add(l.color);
        out.push({ color: rival(l.color), ms, segundos: (minutos || 2) * 60, motivo: "primera ilegal de " + (l.color === "blancas" ? "las blancas" : "las negras") });
      } else if (l.tipo === "irregularidad") {
        const s = leerSancion(l.texto);
        if (s) out.push({ color: s.a === "rival" ? rival(l.color) : l.color, ms, segundos: s.segundos, motivo: "sanción de tiempo" });
      }
    }
    return out;
  }

  // ---- Lo que dice el reglamento de cada irregularidad (los ids de TIPOS_IRREGULARIDAD). `regla` es lo que se le
  // muestra al árbitro antes de anotar; `sugerida`, la sanción que viene elegida (la que dicen las Leyes, o la más
  // suave cuando las Leyes la dejan al árbitro); `pierde`, el artículo si las Leyes dicen que pierde la partida.
  const REGLAS_IRREGULARIDAD = {
    otra: { articulo: "12.9", sugerida: "ninguna",
      regla: "Las sanciones del art. 12.9 van de la más suave a la más dura: advertencia, más tiempo para el rival, menos tiempo para quien la cometió, más puntos para el rival o menos para quien la cometió, perder la partida, una multa anunciada antes, quedar fuera de una o más rondas y la expulsión. Elige la proporcionada." },
    toque: { articulo: "4.3", sugerida: "ninguna",
      regla: "Si quien tiene el turno toca a propósito una pieza suya, debe mover la primera que tocó y que se pueda mover; si toca una del rival, debe capturar la primera que se pueda capturar (4.3). Si ninguna se puede mover ni capturar, juega cualquier jugada legal (4.5). El rival ya no puede reclamar si tocó una pieza para jugar (4.8). Lo que corresponde es hacer cumplir la regla; una sanción del 12.9 es aparte." },
    componer: { articulo: "4.2", sugerida: "ninguna",
      regla: "Solo quien tiene el turno puede componer las piezas, y diciendo antes «compongo» (4.2.1). Si no lo dice, el contacto cuenta como intención de jugar (4.2.2) y se aplica la pieza tocada (4.3). En el turno del rival no se compone (6.2.5)." },
    planilla: { articulo: "8.1", sugerida: "advertencia",
      regla: "Cada jugador anota sus jugadas y las del rival, jugada por jugada (8.1.1). No está obligado si le quedan menos de 5 minutos en el período y no tiene un incremento de 30 segundos o más (8.4)." },
    tablas: { articulo: "9.1.2.1", sugerida: "advertencia",
      regla: "Las tablas se ofrecen después de mover y antes de pulsar el reloj (9.1.2.1). Una oferta hecha en otro momento sigue valiendo, pero se mira si molesta al rival: ofrecer tablas sin motivo también es molestar (11.5)." },
    celular: { articulo: "11.3.2.2", sugerida: "pierde", pierde: "11.3.2.2",
      regla: "Si es evidente que tiene encima un aparato electrónico en el recinto de juego, pierde la partida y su rival gana (11.3.2.2). Las bases del torneo pueden poner una sanción menor, y pueden permitir guardarlo completamente apagado en el bolso (11.3.2.1)." },
    ruido: { articulo: "11.5", sugerida: "advertencia",
      regla: "Está prohibido distraer o molestar al rival de cualquier manera, también con reclamos u ofertas de tablas sin motivo o haciendo ruido en el área de juego (11.5). Se sanciona con el 12.9 (11.6)." },
    salio: { articulo: "11.2.3", sugerida: "advertencia",
      regla: "Solo con permiso del árbitro puede un jugador salir del recinto de juego, y quien tiene el turno, salir del área de juego (11.2.3). Se sanciona con el 12.9 (11.6)." },
    ayuda: { articulo: "11.3.1", sugerida: "ninguna",
      regla: "Durante la partida está prohibido usar notas, fuentes de información o consejos, o analizar en otro tablero (11.3.1). Se sanciona con el 12.9 (11.6), que llega hasta perder la partida. Elige la sanción según lo que pasó." },
    reloj: { articulo: "6.2.4", sugerida: "advertencia",
      regla: "Se pulsa el reloj con la misma mano con que se movió (6.2.3), y está prohibido pulsarlo con fuerza, levantarlo, pulsarlo antes de mover o volcarlo (6.2.4). Se sanciona con el 12.9." },
  };
  // Las sanciones que se eligen en la mesa, de la más suave a la más dura (art. 12.9). Las de tiempo son las del
  // Centroamericano (SANCIONES_TIEMPO), escritas con sancionTexto: así el reloj que se apaga las vuelve a leer.
  const SANCIONES = [
    { id: "ninguna", texto: "Sin sanción: solo queda anotado" },
    { id: "advertencia", texto: "Advertencia (12.9.1)", articulo: "12.9.1" },
    ...SANCIONES_TIEMPO.filter((s) => s.id).map((s) => ({ id: s.id, texto: s.texto + " (" + (s.a === "rival" ? "12.9.2" : "12.9.3") + ")", tiempo: true })),
    { id: "pierde", texto: "Pierde la partida y su rival gana" },
    { id: "otra", texto: "Otra (escribir cuál; por ejemplo, la que digan las bases)" },
  ];
  // Lo que se le muestra al árbitro: la regla, lo propio del ritmo y la cuenta de irregularidades de ese jugador.
  function reglaIrregularidad(id, { modalidad: mod, previas } = {}) {
    const r = REGLAS_IRREGULARIDAD[id] || REGLAS_IRREGULARIDAD.otra;
    const partes = ["Lo que dicen las Leyes:\n" + r.regla];
    let sugerida = r.sugerida;
    if (id === "planilla" && (mod === "rapido" || mod === "blitz")) {
      partes.push("En rápidas y blitz no hace falta anotar (A.2): esto no es una irregularidad.");
      sugerida = "ninguna";
    }
    if (previas >= 1) partes.push("Ya lleva " + (previas === 1 ? "una irregularidad" : previas + " irregularidades") + " en esta partida. Si se niega una y otra vez a cumplir las Leyes, pierde la partida (11.7).");
    else if (previas === 0) partes.push("Es su primera irregularidad en esta partida.");
    return { articulo: r.articulo, texto: partes.join("\n\n"), sugerida };
  }
  // El texto que se agrega a la línea de la bitácora: « · Sanción: …». Devuelve null si «Otra» viene sin escribir.
  function textoSancion(id, sancion, otra) {
    const r = REGLAS_IRREGULARIDAD[id] || REGLAS_IRREGULARIDAD.otra;
    if (sancion === "ninguna" || !sancion) return { texto: "", pierde: false };
    if (sancion === "advertencia") return { texto: " · Sanción: advertencia (art. 12.9.1)", pierde: false };
    if (sancion === "pierde") return { texto: " · Sanción: pierde la partida (art. " + (r.pierde || "12.9.6") + ")", pierde: true };
    if (sancion === "otra") {
      const o = String(otra || "").trim();
      return o ? { texto: " · Sanción: " + o.slice(0, 300), pierde: false } : null;
    }
    const t = sancionTexto(sancion);
    return t ? { texto: t, pierde: false, tiempo: leerSancion(t) } : null;
  }

  const api = { RESULTADOS, TIPOS, textoResultado, nombreBitacora, cambios, lineasDeCambios, listaParaTeclear, detalle, documento,
    ARTICULO_ILEGAL, BUCKET_PLANILLAS, LADO_PLANILLA, rutaPlanilla, planillasDeMesa, pieDePlanilla, marcasTexto, avisoIlegal, minutosIlegal, TIPOS_ILEGAL, TIPOS_IRREGULARIDAD, textoTipo, claveMarca, marcas,
    DE_PAREO, valorDePareo, fuente,
    SANCIONES_TIEMPO, ARTICULO_SANCION, sancionTexto, leerSancion, leerTiempo, ponerDosPuntos, tiempoEnPalabras, formatoTiempo, RITMO, BONO_ILEGAL, relojApagado,
    RITMO_POR_DEFECTO, ritmoValido, modalidad, NOMBRE_MODALIDAD, textoRitmo, CASOS_RELOJ, corregirReloj, bonosDeMesa,
    REGLAS_IRREGULARIDAD, SANCIONES, reglaIrregularidad, textoSancion };
  if (enNode) module.exports = api;
  else raiz.MesaArbitro = api;
})(typeof self !== "undefined" ? self : this);

/*! rev bfb5bbb0d2d82f9f */
