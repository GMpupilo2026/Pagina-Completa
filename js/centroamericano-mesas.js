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

  // Las reglas de las ilegales y los tipos de ilegal e irregularidad son UNA sola copia, en js/mesa-arbitro.js
  // (la Mesa del árbitro general las usa igual): acá se toman de ahí y se siguen exportando con el mismo nombre.
  const MA = enNode ? require("./mesa-arbitro.js") : raiz.MesaArbitro;
  const { ARTICULO_ILEGAL, marcasTexto, avisoIlegal, minutosIlegal, TIPOS_ILEGAL, TIPOS_IRREGULARIDAD, textoTipo,
    SANCIONES_TIEMPO, ARTICULO_SANCION, sancionTexto, leerSancion, leerTiempo, ponerDosPuntos, tiempoEnPalabras, formatoTiempo,
    RITMO, BONO_ILEGAL, relojApagado } = MA;
  // El control de tiempos, el reloj que se apaga y la sanción de tiempo viven en js/mesa-arbitro.js desde que la Mesa
  // del árbitro general corrige el reloj (ver «Mesa del árbitro: el reloj y lo que dice el reglamento»).
  const FIN_DEL_TORNEO = "2026-11-09T23:59:59-06:00"; // última jornada, hora de Costa Rica


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
    { id: "rapido", nombre: "Rápido", config: "Mesa en un toque: el resultado guarda de una; sin «Llegó», control de tiempos ni fotos. Ilegal sin tipo (1 min, apéndice A.3)." },
    { id: "blitz", nombre: "Blitz", config: "Solo resultado e ilegal (1 min; el aviso se va solo con «Deshacer»). Sin «Llegó», irregularidades, control de tiempos ni fotos." },
  ];
  const ritmoDe = (t) => ritmoRapido(t && t.nombre, t && t.ritmo) || "clasico";
  const configDeRitmo = (id) => (RITMOS.find((r) => r.id === id) || RITMOS[0]).config;

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

  // Cuándo vence un enlace nuevo. `hoy` es «AAAA-MM-DD» en hora de Costa Rica (HoraCR.hoy()). «fecha»: hasta las 11:59 p. m. de
  // `dia` («AAAA-MM-DD», hora de Costa Rica), el que elige la organización (el último día de SU torneo); un día que ya pasó no sirve.
  function vencimiento(opcion, ahora, hoy, dia) {
    if (opcion === "fecha") {
      if (!/^d{4}-d{2}-d{2}$/.test(String(dia || ""))) throw new Error("Elige el día en que vence el enlace.");
      const d = new Date(dia + "T23:59:59-06:00");
      if (isNaN(d.getTime()) || d.getTime() <= ahora.getTime()) throw new Error("El día en que vence el enlace ya pasó: elige otro.");
      return d;
    }
    if (opcion === "torneo") return new Date(FIN_DEL_TORNEO);
    if (opcion === "hoy") return new Date(hoy + "T23:59:59-06:00");
    if (opcion === "12h") return new Date(ahora.getTime() + 12 * 3600 * 1000);
    throw new Error("Opción de vencimiento desconocida: " + opcion);
  }

  const enlaceArbitro = (origen, token) => String(origen).replace(/\/+$/, "") + "/centroamericano-arbitro.html#" + token;

  // El CÓDIGO CORTO del enlace (8 símbolos, sin 0/1/O/I/L): se escribe en ajedrez-integral.com/m cuando la tablet no tiene cámara ni WhatsApp.
  // Se muestra «K7M2-9QXA» (la base lo guarda sin guion) y se acepta con espacios, guion o minúsculas. Ver «El código corto del árbitro».
  const CODIGO_CORTO = /^[A-HJKMNP-Z2-9]{8}$/;
  const PUERTA_CORTA = "ajedrez-integral.com/m";
  const limpiarCodigo = (t) => String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const codigoLindo = (c) => { const x = limpiarCodigo(c); return CODIGO_CORTO.test(x) ? x.slice(0, 4) + "-" + x.slice(4) : ""; };

  // El mensaje que se manda por WhatsApp junto con el enlace (y, si la tablet no abre enlaces, el código corto).
  // `evento`: el nombre del evento (sin él, el del Centroamericano, como siempre).
  function textoWhatsapp(a, torneo, enlace, evento) {
    const lindo = codigoLindo(a.codigo);
    return (a.nombrado === false ? "Hola: " : "Hola " + a.arbitro + ": ") + (evento ? "tus mesas de " + evento : "tus mesas del Centroamericano") + " (" + torneo + ", mesas " + a.mesa_desde + " a " + a.mesa_hasta + "). " +
      "Abre este enlace para anotar los resultados: " + enlace +
      (lindo ? ". Si tu tablet no abre el enlace, entra a " + PUERTA_CORTA + " y escribe tu código: " + lindo : "");
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
    if (fp.revisar_fijo === "blancas" || fp.revisar_fijo === "negras") {
      // Elegida a mano con un jugador fijo: se revisa a esa persona gane, pierda o empate; solo si no se presentó, nada.
      const fijo = fp.revisar_fijo, nombre = (fijo === "blancas" ? m.blancas : m.negras) || (fijo === "blancas" ? "quien juega con blancas" : "quien juega con negras");
      const noVino = valor === "6" || (fijo === "blancas" && valor === "5") || (fijo === "negras" && valor === "4");
      if (valor && valor !== "0" && valor !== "D") {
        return noVino
          ? { tipo: "no-aplica", texto: "🛡 Fair Play: " + antes + nombre + " no se presentó; la mesa queda sin efecto, no hay que retener a nadie." }
          : { tipo: "retener", texto: "🛡 FAIR PLAY: " + antes + "retén a " + nombre + " (" + fijo + ") y no lo dejes salir del local: el árbitro de Fair Play pasa a revisarlo." };
      }
      return { tipo: "esperando", texto: "🛡 FAIR PLAY: cuando termine la partida (gane, pierda o empate), retén a " + nombre + " (" + fijo + ") y no lo dejes salir del local. No se lo digas a nadie antes." };
    }
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

  const api = { fairPlayDeMesa, fairPlayAlcance, ARTICULO_ILEGAL, ritmoRapido, RITMOS, ritmoDe, configDeRitmo, minutosIlegal, FIN_DEL_TORNEO, marcasTexto, avisoIlegal, estadoMesa, estadoAsignacion, vencimiento, enlaceArbitro, CODIGO_CORTO, PUERTA_CORTA, limpiarCodigo, codigoLindo, textoWhatsapp, leerClaves, jugadoresMarcados, repartirMesas, leerRango, nombrePorDefinir, enLinea, hace, enviosAgrupados, TIPOS_ILEGAL, TIPOS_IRREGULARIDAD, SANCIONES_TIEMPO, ARTICULO_SANCION, sancionTexto, leerSancion, textoTipo, listaMesas, rondasPorTorneo, textoRondas, resumenRonda, sugerirAyuda, textoSugerencia, leerTiempo, ponerDosPuntos, tiempoEnPalabras, formatoTiempo, ultimasLecturas, RITMO, BONO_ILEGAL, relojApagado, bonosIlegales, ARTICULO_TARDE, leerTarde, llegadasTarde, ultimoControl, jugadoresQueFaltan, presenciaDeLaMesa };
  if (enNode) module.exports = api;
  else raiz.CentroamericanoMesas = api;
})(typeof self !== "undefined" ? self : this);

/*! rev bfb5bbb0d2d82f9f */
