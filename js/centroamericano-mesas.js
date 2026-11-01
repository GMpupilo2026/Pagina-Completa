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
  function avisoIlegal(n, nombre, color) {
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
      texto: quien + " hizo una jugada ilegal: dale 2 minutos más a su rival (art. " + ARTICULO_ILEGAL + "). Con otra, pierde la partida.",
      resultado: null,
    };
  }

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
      if ((f.tipo !== "ilegal" && f.tipo !== "irregularidad") || anuladas.has(f.id)) continue;
      const k = [f.tnr, f.ronda, f.mesa, f.color].join("|");
      const x = por.get(k) || { tnr: f.tnr, ronda: f.ronda, mesa: f.mesa, color: f.color, jugador: f.jugador, ilegales: 0, irregularidades: 0 };
      if (f.tipo === "ilegal") x.ilegales++; else x.irregularidades++;
      por.set(k, x);
    }
    return [...por.values()].sort((a, b) => b.ilegales - a.ilegales || b.irregularidades - a.irregularidades || a.mesa - b.mesa);
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
  function resumenRonda(asignaciones, progreso, finales, ahora, listas) {
    const activas = asignaciones.filter((a) => estadoAsignacion(a, ahora) === "activo");
    const ronda = Math.max(0, ...progreso.map((p) => p.ronda));
    return activas.map((a) => {
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

  const api = { ARTICULO_ILEGAL, FIN_DEL_TORNEO, marcasTexto, avisoIlegal, estadoMesa, estadoAsignacion, vencimiento, enlaceArbitro, textoWhatsapp, leerClaves, jugadoresMarcados, repartirMesas, leerRango, nombrePorDefinir, enLinea, hace, enviosAgrupados, TIPOS_ILEGAL, TIPOS_IRREGULARIDAD, textoTipo, listaMesas, resumenRonda, sugerirAyuda, textoSugerencia };
  if (enNode) module.exports = api;
  else raiz.CentroamericanoMesas = api;
})(typeof self !== "undefined" ? self : this);
