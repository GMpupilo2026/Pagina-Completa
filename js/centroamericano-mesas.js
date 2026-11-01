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
    return "Hola " + a.arbitro + ": tus mesas del Centroamericano (" + torneo + ", mesas " + a.mesa_desde + " a " + a.mesa_hasta + "). " +
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

  const api = { ARTICULO_ILEGAL, FIN_DEL_TORNEO, marcasTexto, avisoIlegal, estadoMesa, estadoAsignacion, vencimiento, enlaceArbitro, textoWhatsapp, leerClaves, jugadoresMarcados };
  if (enNode) module.exports = api;
  else raiz.CentroamericanoMesas = api;
})(typeof self !== "undefined" ? self : this);
