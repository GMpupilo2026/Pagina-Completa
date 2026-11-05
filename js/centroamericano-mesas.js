/* Las mesas de los árbitros del Centroamericano 2026: lo que no depende de la
   pantalla. Lo usan centroamericano-arbitro.html (la del árbitro) y
   centroamericano-mesas.html (la de la organización), y lo prueba
   herramientas/verificar-centroamericano-mesas.js.

   LAS REGLAS DE LAS ILEGALES son las de Pareo Integral (js/pareo/textos.js,
   marcasIncidencias en js/pareo/evento.js): se cuentan por partida, es decir por
   ronda + mesa + color, la primera le da dos minutos más al rival y la segunda
   hace perder la partida (art. 7.5.5), salvo que el rival no pueda dar mate con
   ninguna serie de jugadas legales (tablas). Acá solo se escribe lo que se le
   avisa al árbitro: el resultado lo decide y lo guarda él.

   Ver «Mesas de los árbitros del Centroamericano» en docs/decisiones/juegos-y-torneos.md. */
(function (raiz) {
  "use strict";
  const enNode = typeof module !== "undefined" && module.exports;

  const ARTICULO_ILEGAL = "7.5.5";
  const FIN_DEL_TORNEO = "2026-11-09T23:59:59-06:00"; // última jornada, hora de Costa Rica

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

  // El Rápido y el Blitz se juegan con la misma página, pero en «modo rápido» (ver «El Rápido y el Blitz: la
  // mesa en un toque» en docs/decisiones/juegos-y-torneos.md). El ritmo lo dice la base si lo trae (`ritmo`) y,
  // si no, el nombre del torneo, como en la sala: «Rápido Sub-10 Absoluto», «Rapid…», «Blitz…». Sin ninguna de
  // esas palabras, clásico (null): la página de siempre, sin cambiar nada.
  function ritmoRapido(nombre, ritmo) {
    const r = String(ritmo || "").toLowerCase();
    if (r === "blitz") return "blitz";
    if (r === "rapido" || r === "rápido" || r === "rapid") return "rapido";
    const n = String(nombre || "");
    if (/\bblitz\b/i.test(n)) return "blitz";
    if (/\br[aá]pid[oa]s?\b|\brapid\b/i.test(n)) return "rapido";
    return null;
  }
  // Los tres modos de torneo y lo que cambia en la tablet del árbitro en cada uno (la organización los ve separados en «Árbitros y mesas»).
  // El modo sale de `ritmoRapido` (la base o el nombre); sin ninguna pista, clásico.
  const RITMOS = [
    { id: "clasico", nombre: "Clásico", config: "Mesa completa: «Llegó» y tiempo de espera, ilegal con su tipo (2 min), irregularidades, control de tiempos y fotos de las planillas." },
    { id: "rapido", nombre: "Rápido", config: "Mesa en un toque: el resultado guarda de una; sin «Llegó», control de tiempos ni fotos. Ilegal sin tipo (2 min)." },
    { id: "blitz", nombre: "Blitz", config: "Solo resultado e ilegal (1 min; el aviso se va solo con «Deshacer»). Sin «Llegó», irregularidades, control de tiempos ni fotos." },
  ];
  const ritmoDe = (t) => ritmoRapido(t && t.nombre, t && t.ritmo) || "clasico";
  const configDeRitmo = (id) => (RITMOS.find((r) => r.id === id) || RITMOS[0]).config;
  // La primera ilegal: 2 minutos para el rival; en el blitz, 1 (apéndice B.3).
  const minutosIlegal = (ritmo) => (ritmo === "blitz" ? 1 : 2);

  // Cómo se pinta una mesa: pierde (segunda ilegal sin resultado todavía), con
  // resultado en chess-results, con algo sin guardar o sin nada.
  function estadoMesa(mesa, marcas, elegido) {
    const b = (marcas || {})[mesa.mesa + "|blancas"], n = (marcas || {})[mesa.mesa + "|negras"];
    const dosIlegales = (b && b.ilegales >= 2) || (n && n.ilegales >= 2);
    if (elegido != null && elegido !== "" && elegido !== mesa.valor) return "sin-guardar";
    if (mesa.valor !== "0") return "con-resultado";
    return dosIlegales ? "pierde" : "libre";
  }

  // De qué lado está cada enlace: activo, vencido o apagado.
  function estadoAsignacion(a, ahora) {
    if (a.revocada) return "apagado";
    return new Date(a.vence).getTime() <= (ahora instanceof Date ? ahora : new Date(ahora)).getTime() ? "vencido" : "activo";
  }

  // Cuándo vence un enlace nuevo. `hoy` es «AAAA-MM-DD» en hora de Costa Rica (HoraCR.hoy()).
  function vencimiento(opcion, ahora, hoy) {
    if (opcion === "torneo") return new Date(FIN_DEL_TORNEO);
    if (opcion === "hoy") return new Date(hoy + "T23:59:59-06:00");
    if (opcion === "12h") return new Date(ahora.getTime() + 12 * 3600 * 1000);
    throw new Error("Opción de vencimiento desconocida: " + opcion);
  }

  const enlaceArbitro = (origen, token) => String(origen).replace(/\/+$/, "") + "/centroamericano-arbitro.html#" + token;

  // El mensaje que se manda por WhatsApp junto con el enlace.
  function textoWhatsapp(a, torneo, enlace) {
    return (a.nombrado === false ? "Hola: " : "Hola " + a.arbitro + ": ") + "tus mesas del Centroamericano (" + torneo + ", mesas " + a.mesa_desde + " a " + a.mesa_hasta + "). " +
      "Abre este enlace para anotar los resultados: " + enlace;
  }

  // Las claves pegadas de una vez: una línea por clave, «código clave» separados por
  // espacio, tabulador, coma o punto y coma. El código es el del torneo o el de su GRUPO
  // (torneos ligados en chess-results: una clave abre todos), así que no tiene por qué ser
  // uno de los 12: `tnrsValidos` solo se pasa si se quiere restringir. Devuelve lo bueno y
  // lo que hay que revisar.
  function leerClaves(texto, tnrsValidos) {
    const buenas = [], malas = [], vistos = new Set();
    String(texto || "").split(/\r?\n/).forEach((linea, i) => {
      const t = linea.trim();
      if (!t) return;
      const partes = t.split(/[\s,;:]+/).filter(Boolean);
      const [tnr, sid] = partes;
      if (partes.length !== 2) return malas.push({ linea: i + 1, texto: t, motivo: "Cada línea lleva el código del torneo y la clave." });
      if (!/^\d{1,7}$/.test(tnr)) return malas.push({ linea: i + 1, texto: t, motivo: "El código del torneo son hasta 7 números." });
      if (tnrsValidos && !tnrsValidos.includes(tnr)) return malas.push({ linea: i + 1, texto: t, motivo: "Ese código no es de un torneo del Centroamericano." });
      if (!/^[A-Za-z0-9]{8,32}$/.test(sid)) return malas.push({ linea: i + 1, texto: t, motivo: "La clave son entre 8 y 32 letras y números." });
      if (vistos.has(tnr)) return malas.push({ linea: i + 1, texto: t, motivo: "Ese código ya viene en otra línea." });
      vistos.add(tnr);
      buenas.push({ tnr, sid });
    });
    return { buenas, malas };
  }

  // Un resumen de lo anotado, por jugador y partida, para la página de la organización:
  // quién lleva ilegales o irregularidades en la ronda (sin lo anulado).
  function jugadoresMarcados(filas) {
    const anuladas = new Set(filas.filter((f) => f.tipo === "anulacion" && f.anula).map((f) => f.anula));
    const por = new Map();
    for (const f of filas) {
      const levanto = f.tipo === "nota" && f.articulo === "Levantó";
      if ((f.tipo !== "ilegal" && f.tipo !== "irregularidad" && !levanto) || anuladas.has(f.id)) continue;
      const k = [f.tnr, f.ronda, f.mesa, f.color].join("|");
      const x = por.get(k) || { tnr: f.tnr, ronda: f.ronda, mesa: f.mesa, color: f.color, jugador: f.jugador, ilegales: 0, irregularidades: 0, levantadas: 0 };
      if (f.tipo === "ilegal") x.ilegales++; else if (levanto) x.levantadas++; else x.irregularidades++;
      por.set(k, x);
    }
    return [...por.values()].sort((a, b) => b.ilegales - a.ilegales || b.irregularidades - a.irregularidades || b.levantadas - a.levantadas || a.mesa - b.mesa);
  }

  // Repartir `total` mesas entre `n` árbitros por definir: rangos seguidos y parejos; si
  // sobran, las primeras reciben una más. Con más árbitros que mesas, los que sobran no
  // reciben nada (no se les crea enlace). Devuelve [{desde, hasta}].
  function repartirMesas(total, n, desde1 = 1) {
    total = Math.floor(total); n = Math.floor(n);
    if (!(total >= 1) || !(n >= 1)) return [];
    const quienes = Math.min(n, total), base = Math.floor(total / quienes), extra = total % quienes;
    const rangos = [];
    let sigue = desde1;
    for (let i = 0; i < quienes; i++) {
      const largo = base + (i < extra ? 1 : 0);
      rangos.push({ desde: sigue, hasta: sigue + largo - 1 });
      sigue += largo;
    }
    return rangos;
  }

  // «1-15», «1 a 15», «7» -> {desde, hasta}; null si no se entiende o va al revés.
  function leerRango(texto) {
    const m = String(texto || "").trim().match(/^(\d{1,4})\s*(?:-|–|a|al|hasta)?\s*(\d{1,4})?$/i);
    if (!m) return null;
    const desde = parseInt(m[1], 10), hasta = m[2] ? parseInt(m[2], 10) : desde;
    if (desde < 1 || hasta < desde || hasta > 9999) return null;
    return { desde, hasta };
  }

  // «Árbitro 3»: el nombre de un enlace creado sin saber quién lo va a usar. El número sigue
  // al más alto que ya haya en el torneo (los enlaces apagados también cuentan, para no repetir).
  function nombrePorDefinir(existentes) {
    let mayor = 0;
    for (const a of existentes || []) {
      const m = /^Árbitro (\d+)$/.exec(String(a.arbitro || ""));
      if (m) mayor = Math.max(mayor, parseInt(m[1], 10));
    }
    return "Árbitro " + (mayor + 1);
  }

  // Si un enlace se abrió hace poco: «en línea» (el árbitro tiene la página abierta; la función
  // anota el uso cada 20 s como mucho).
  const enLinea = (a, ahora) => !!a.ultimo_uso && (ahora.getTime() - new Date(a.ultimo_uso).getTime()) < 2 * 60 * 1000;

  // «hace 3 min», para los pedidos de ayuda.
  function hace(desde, ahora) {
    const s = Math.max(0, Math.round((ahora.getTime() - new Date(desde).getTime()) / 1000));
    if (s < 45) return "hace un momento";
    const min = Math.round(s / 60);
    if (min < 60) return "hace " + min + " min";
    const h = Math.floor(min / 60);
    return "hace " + h + " h" + (min % 60 ? " " + (min % 60) + " min" : "");
  }

  // Los avisos de la organización son una fila por enlace con el mismo texto y la misma hora:
  // para la lista se juntan en un solo envío, con quién ya lo leyó y quién no.
  function enviosAgrupados(filas, nombreDe) {
    const por = new Map();
    for (const f of filas) {
      if (f.de !== "organizacion") continue;
      const k = f.creado + "|" + f.texto;
      const e = por.get(k) || { creado: f.creado, texto: f.texto, total: 0, leidos: 0, sinLeer: [] };
      e.total++;
      if (f.leido_en) e.leidos++; else e.sinLeer.push(nombreDe(f.asignacion_id));
      por.set(k, e);
    }
    return [...por.values()].sort((a, b) => String(b.creado).localeCompare(String(a.creado)));
  }

  // ---- Los tipos de jugada ilegal y de irregularidad, para elegirlos de una lista y que
  // queden en la bitácora sin escribir. Son los casos de siempre de un torneo; el artículo
  // solo va donde el reglamento de FIDE lo dice sin duda (si falta uno, el árbitro puede
  // elegir «Otra» y escribirlo). La ilegal es siempre el 7.5.5 (dos minutos al rival la
  // primera; la segunda pierde la partida).
  const TIPOS_ILEGAL = [
    { id: "pieza", texto: "Movió una pieza como esa pieza no puede moverse" },
    { id: "rey-jaque", texto: "Dejó o puso su propio rey en jaque" },
    { id: "no-salio-jaque", texto: "No salió de un jaque" },
    { id: "enroque", texto: "Enroque ilegal" },
    { id: "captura", texto: "Captura ilegal (de su propia pieza o de una casilla que no corresponde)" },
    { id: "promocion", texto: "Peón en la última fila sin promover a una pieza válida" },
    { id: "turno", texto: "Jugó fuera de turno o dos jugadas seguidas" },
    { id: "otra", texto: "Otra (escribir qué pasó)" },
  ];
  const TIPOS_IRREGULARIDAD = [
    { id: "toque", texto: "Tocó una pieza y no la movió (pieza tocada)", articulo: "4.3" },
    { id: "componer", texto: "Arregló piezas sin decir «compongo»", articulo: "4.2" },
    { id: "planilla", texto: "No anota la partida en la planilla", articulo: "8.1" },
    { id: "tablas", texto: "Ofreció tablas de forma incorrecta", articulo: "9.2" },
    { id: "celular", texto: "Celular o aparato electrónico sonó o lo tenía encendido", articulo: "11.3.2" },
    { id: "ruido", texto: "Molestó al rival o hizo ruido" },
    { id: "salio", texto: "Salió del área de juego sin permiso" },
    { id: "ayuda", texto: "Recibió ayuda o habló con otras personas durante la partida" },
    { id: "reloj", texto: "Usó mal el reloj (con la otra mano, golpeándolo, sin soltar la pieza)" },
    { id: "otra", texto: "Otra (escribir qué pasó)" },
  ];
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

  // Lo que se anota en el registro de una ilegal o irregularidad elegida de la lista.
  function textoTipo(lista, id, nota) {
    const t = lista.find((x) => x.id === id);
    if (!t) return null;
    const n = String(nota || "").trim();
    if (id === "otra" && !n) return null;
    return { texto: (id === "otra" ? "Otra: " + n : t.texto + (n ? ". " + n : "")), articulo: t.articulo || "" };
  }

  // «22, 24 a 26, 30»: las mesas juntas en rangos para leerlas de un vistazo.
  function listaMesas(mesas) {
    const m = [...new Set(mesas)].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < m.length;) {
      let j = i;
      while (j + 1 < m.length && m[j + 1] === m[j] + 1) j++;
      out.push(j - i >= 2 ? m[i] + " a " + m[j] : m.slice(i, j + 1).join(", "));
      i = j + 1;
    }
    return out.join(", ");
  }

  // El resumen de la ronda: una fila por enlace activo con lo que le queda. `progreso` son
  // las filas de centroamericano_progreso; `finales`, las de centroamericano_finales (sin
  // reabrir). Solo cuenta la ronda más alta con datos (la que está en juego).
  // La ronda abierta de CADA torneo: la más alta de su avance. Cada categoría va en su ronda: el 4/11, con el Rápido y el
  // Blitz ya en la ronda 9 y la mañana en la 4, una sola ronda para todos («la más alta») dejaba a los doce torneos de la
  // mañana en «Sin datos» aunque chess-results se leía bien.
  function rondasPorTorneo(asignaciones, progreso) {
    const tnrDe = new Map(asignaciones.map((a) => [a.id, a.tnr]));
    const r = {};
    for (const p of progreso) { const t = tnrDe.get(p.asignacion_id); if (t != null && (!(t in r) || p.ronda > r[t])) r[t] = p.ronda; }
    return r;
  }

  function resumenRonda(asignaciones, progreso, finales, ahora, listas) {
    const activas = asignaciones.filter((a) => estadoAsignacion(a, ahora) === "activo");
    const rondas = rondasPorTorneo(asignaciones, progreso);
    return activas.map((a) => {
      const ronda = rondas[a.tnr] || 0;
      const p = progreso.find((x) => x.asignacion_id === a.id && x.ronda === ronda) || null;
      const f = finales.find((x) => x.asignacion_id === a.id && x.ronda === ronda && !x.reabierta) || null;
      const lista = (listas || []).filter((x) => x.asignacion_id === a.id && x.ronda === ronda).length;
      const total = p ? p.total : (a.mesa_hasta - a.mesa_desde + 1);
      const quedan = p ? p.total - p.con_resultado : null;
      return {
        id: a.id, arbitro: a.arbitro, tnr: a.tnr, mesa_desde: a.mesa_desde, mesa_hasta: a.mesa_hasta, ronda: p ? p.ronda : ronda,
        total, quedan, con_resultado: p ? p.con_resultado : null, pendientes: p ? p.pendientes : [], actualizado: p ? p.actualizado : null,
        finalizada: f ? f.finalizada_en : null, sinDatos: !p, lista,
        estado: f ? "finalizada" : !p ? "sin-datos" : quedan === 0 ? "termino" : "en-curso",
      };
    });
  }

  // «ronda 4» o «rondas 4 y 9»: lo que va al lado del título cuando cada torneo va en su ronda.
  function textoRondas(rondas) {
    const l = [...new Set(Object.values(rondas || {}).filter((r) => r > 0))].sort((a, b) => a - b);
    if (!l.length) return "";
    return l.length === 1 ? "ronda " + l[0] : "rondas " + l.slice(0, -1).join(", ") + " y " + l[l.length - 1];
  }

  // A dónde puede ir a ayudar quien terminó: los que más mesas les quedan, primero los de su
  // mismo torneo (suelen compartir sala). Le toca la mitad de lo que le queda al otro, desde
  // el final de su lista (así no se pisan: él sigue desde el principio).
  function sugerirAyuda(quien, filas) {
    return filas
      .filter((f) => f.id !== quien.id && f.estado === "en-curso" && f.quedan > 0)
      .map((f) => {
        const mitad = Math.ceil(f.pendientes.length / 2);
        return { id: f.id, arbitro: f.arbitro, tnr: f.tnr, quedan: f.quedan, mesas: f.pendientes.slice(f.pendientes.length - mitad), mismoTorneo: f.tnr === quien.tnr };
      })
      .sort((a, b) => (b.mismoTorneo - a.mismoTorneo) || (b.quedan - a.quedan) || (a.id < b.id ? -1 : 1))
      .slice(0, 3);
  }

  // El aviso que se le manda a quien terminó, con la sugerencia elegida.
  function textoSugerencia(s, nombreTorneo) {
    return "Terminaste tus mesas, gracias. Ve a ayudar a " + s.arbitro + " (" + nombreTorneo + "): le quedan " + s.quedan +
      (s.quedan === 1 ? " mesa" : " mesas") + ". Toma la" + (s.mesas.length === 1 ? " mesa " : "s mesas ") + listaMesas(s.mesas) + ".";
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
  // Lo último que se leyó de cada partida (torneo, ronda, mesa): la lectura más reciente.
  function ultimasLecturas(filas) {
    const por = new Map();
    for (const f of filas) {
      const k = [f.tnr, f.ronda, f.mesa].join("|");
      const x = por.get(k);
      if (!x || String(f.ocurrio) > String(x.ocurrio)) por.set(k, f);
    }
    return [...por.values()].sort((a, b) => a.tnr.localeCompare(b.tnr) || a.ronda - b.ronda || a.mesa - b.mesa);
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
  // Los 2 minutos de cada ilegal de una mesa, sacados de la bitácora: solo la PRIMERA (sin anular) de cada jugador
  // da tiempo; con la segunda pierde la partida. Cada bono es del RIVAL de quien la hizo, con la hora en que se anotó.
  // Y las sanciones de tiempo de las irregularidades (leerSancion), cada una con el color al que se le da o se le
  // quita y su signo: «ajustes» del reloj, todos con la misma forma { color, de, ms, segundos, motivo }.
  function bonosIlegales(anotaciones, mesa, anuladas) {
    const fuera = anuladas instanceof Set ? anuladas : new Set(anuladas || []);
    const out = [];
    for (const f of anotaciones || []) {
      if (f.tipo !== "irregularidad" || f.mesa !== mesa || fuera.has(f.id) || (f.color !== "blancas" && f.color !== "negras")) continue;
      const s = leerSancion(f.texto);
      if (!s) continue;
      const rival = f.color === "blancas" ? "negras" : "blancas";
      out.push({ color: s.a === "rival" ? rival : f.color, de: f.color, ms: new Date(f.ocurrio).getTime(), segundos: s.segundos, motivo: "irregularidad" });
    }
    for (const color of ["blancas", "negras"]) {
      const primera = (anotaciones || []).filter((f) => f.tipo === "ilegal" && f.mesa === mesa && f.color === color && !fuera.has(f.id))
        .sort((a, b) => String(a.ocurrio).localeCompare(String(b.ocurrio)))[0];
      if (primera) out.push({ color: color === "blancas" ? "negras" : "blancas", de: color, ms: new Date(primera.ocurrio).getTime(), segundos: BONO_ILEGAL, motivo: "ilegal" });
    }
    return out.sort((a, b) => a.ms - b.ms);
  }
  // Las llegadas tarde de una mesa, sacadas de la bitácora: la nota «Llegó tarde» que anota la función cuando el árbitro marca
  // que un jugador llegó después de empezar la ronda. La hora de la nota es la de la llegada y el texto dice cuánto se tardó
  // («llegó tarde: 22 min 8 s …»): de ahí salen { color, ms, segundos }. Lo anulado no cuenta.
  const ARTICULO_TARDE = "Llegó tarde";
  const leerTarde = (texto) => { const m = String(texto || "").match(/llegó tarde: (\d+) min (\d+) s/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  function llegadasTarde(anotaciones, mesa, anuladas) {
    const fuera = anuladas instanceof Set ? anuladas : new Set(anuladas || []);
    const out = [];
    for (const f of anotaciones || []) {
      if (f.tipo !== "nota" || f.articulo !== ARTICULO_TARDE || f.mesa !== mesa || fuera.has(f.id) || (f.color !== "blancas" && f.color !== "negras")) continue;
      const segundos = leerTarde(f.texto), ms = new Date(f.ocurrio).getTime();
      if (segundos > 0 && Number.isFinite(ms)) out.push({ color: f.color, ms, segundos });
    }
    return out.sort((a, b) => a.ms - b.ms);
  }
  // El control más reciente de una mesa que tenga las jugadas de cada color (los viejos traían una sola «jugada»).
  const ultimoControl = (lecturas) => lecturas.filter((x) => x.j_blancas != null && x.j_negras != null)
    .sort((a, b) => String(b.ocurrio).localeCompare(String(a.ocurrio)))[0] || null;

  // ---- La presencia: quiénes no han llegado. `mesas` son las de la ronda (de cada árbitro) y
  // `presencia` las filas de centroamericano_presencia. Un jugador «falta» si el árbitro lo marcó
  // ausente; «sin revisar» si todavía no lo marcó.
  // ronda: un número, o la ronda de cada torneo ({ tnr: ronda }, de rondasPorTorneo).
  function jugadoresQueFaltan(presencia, ronda) {
    const de = (tnr) => (typeof ronda === "object" && ronda ? ronda[tnr] : ronda);
    return presencia.filter((p) => p.ronda === de(p.tnr) && !p.presente)
      .sort((a, b) => a.tnr.localeCompare(b.tnr) || a.mesa - b.mesa || a.color.localeCompare(b.color));
  }
  function presenciaDeLaMesa(presencia, tnr, ronda, mesa) {
    const f = (c) => presencia.find((p) => p.tnr === tnr && p.ronda === ronda && p.mesa === mesa && p.color === c);
    return { blancas: f("blancas") ? f("blancas").presente : null, negras: f("negras") ? f("negras").presente : null };
  }

  // Fair Play en la tablet del árbitro: qué dice la banda dorada de una mesa elegida (fp: lo que manda centroamericano-mesa
  // en «fair_play»; m: la mesa, con sus nombres y el valor de chess-results; elegido: el resultado que el árbitro está por
  // guardar, si hay). Mientras no hay resultado: retener al ganador. Con resultado (el elegido o el de chess-results): a
  // quién retener o que esa persona no aplica y la mesa queda sin efecto. Lo mismo que decide la base al guardar
  // (interno.fp_tras_resultado): esto solo lo adelanta en la pantalla.
  const GANA = { "1": "blancas", "4": "blancas", "3": "negras", "5": "negras" };
  // «Seis, Fio no aplica: se revisó en la ronda 2; …» → «se revisó en la ronda 2» (el de esa persona).
  const motivoNoAplica = (texto, nombre) => {
    const parte = String(texto || "").split("; ").find((x) => x.startsWith(nombre + " no aplica: "));
    return parte ? parte.slice(nombre.length + " no aplica: ".length) : "ya se revisó";
  };
  function fairPlayDeMesa(fp, m, elegido) {
    if (!fp) return null;
    if (fp.estado === "revisada") return { tipo: "revisada", texto: "🛡 Fair Play: la revisión de esta mesa ya se hizo." };
    const pendiente = elegido != null && elegido !== "" && elegido !== "0" && elegido !== "D" && elegido !== m.valor;
    const valor = pendiente ? elegido : m.valor;
    const antes = pendiente ? "con este resultado, " : "";
    if (valor && valor !== "0" && valor !== "D") {
      if (valor === "6") return { tipo: "no-aplica", texto: "🛡 Fair Play: " + antes + "no se jugó; la mesa queda sin efecto, no hay que retener a nadie." };
      const color = valor === "2" ? fp.color_si_tablas : GANA[valor];
      const nombre = (color === "blancas" ? m.blancas : m.negras) || (color === "blancas" ? "quien jugó con blancas" : "quien jugó con negras");
      const aplica = color === "blancas" ? fp.aplica_blancas !== false : fp.aplica_negras !== false;
      return aplica
        ? { tipo: "retener", texto: "🛡 FAIR PLAY: " + antes + "retén a " + nombre + " (" + color + ") y no lo dejes salir del local: el árbitro de Fair Play pasa a revisarlo." }
        : { tipo: "no-aplica", texto: "🛡 Fair Play: " + antes + nombre + " NO APLICA (" + motivoNoAplica(fp.no_aplica, nombre) + "). La mesa queda sin efecto: no hace falta retenerlo." };
    }
    return { tipo: "esperando", texto: "🛡 FAIR PLAY: cuando termine la partida, retén al GANADOR (si es tablas, a quien juega con " + fp.color_si_tablas + ") y no lo dejes salir del local. No se lo digas a nadie antes." + (fp.no_aplica ? " Ojo: " + fp.no_aplica + "; si gana esa persona, la mesa queda sin efecto." : "") };
  }

  // Dónde va el borde dorado que se mueve en la tablet: en la mesa entera si se puede revisar a los dos, o solo en el
  // jugador que se puede revisar (el otro no aplica). Con el resultado ya guardado, en el ganador que se revisa. Solo
  // mientras está aprobada: revisada o sin efecto, el borde queda quieto en la mesa (o no hay a quién mover).
  function fairPlayAlcance(fp) {
    if (!fp || fp.estado !== "aprobada") return null;
    if (fp.revisar_color === "blancas" || fp.revisar_color === "negras") return fp.revisar_color;
    const b = fp.aplica_blancas !== false, n = fp.aplica_negras !== false;
    return b && !n ? "blancas" : n && !b ? "negras" : "mesa";
  }

  const api = { fairPlayDeMesa, fairPlayAlcance, ARTICULO_ILEGAL, ritmoRapido, RITMOS, ritmoDe, configDeRitmo, minutosIlegal, FIN_DEL_TORNEO, marcasTexto, avisoIlegal, estadoMesa, estadoAsignacion, vencimiento, enlaceArbitro, textoWhatsapp, leerClaves, jugadoresMarcados, repartirMesas, leerRango, nombrePorDefinir, enLinea, hace, enviosAgrupados, TIPOS_ILEGAL, TIPOS_IRREGULARIDAD, SANCIONES_TIEMPO, ARTICULO_SANCION, sancionTexto, leerSancion, textoTipo, listaMesas, rondasPorTorneo, textoRondas, resumenRonda, sugerirAyuda, textoSugerencia, leerTiempo, ponerDosPuntos, tiempoEnPalabras, formatoTiempo, ultimasLecturas, RITMO, BONO_ILEGAL, relojApagado, bonosIlegales, ARTICULO_TARDE, leerTarde, llegadasTarde, ultimoControl, jugadoresQueFaltan, presenciaDeLaMesa };
  if (enNode) module.exports = api;
  else raiz.CentroamericanoMesas = api;
})(typeof self !== "undefined" ? self : this);
