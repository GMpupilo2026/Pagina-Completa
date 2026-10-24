/* «Busca a tu jugador» y el medallero de centroamericano-2026.html.
 *
 * Los datos salen de chess-results por la Edge Function sala-jugadores (el
 * navegador no le puede pedir nada a chess-results: no manda CORS). La función
 * recibe la clave de la sala de Torneos y lee solo los torneos de chess-results
 * que esa sala tiene entre sus enlaces: la clasificación (con el grupo de cada
 * jugador, que es su categoría) y la ronda emparejada más reciente.
 *
 * - Se piden la primera vez que alguien escribe un nombre o abre el medallero,
 *   y de nuevo cada 2 minutos mientras la página está a la vista: no a cada
 *   visita, que es casi siempre para ver otra cosa.
 * - Lo último que llegó queda en este aparato (localStorage): sin señal en la
 *   sala se muestra eso, con la hora en que se leyó.
 * - Todo lo que se pinta va por textContent: los nombres vienen de afuera.
 * - Se pinta en el idioma de la página (el evento «cac-idioma» de
 *   js/centroamericano.js), con sus propios textos: lo de acá no pasa por el
 *   diccionario de js/centroamericano-en.js.
 *
 * Además:
 * - «Mi delegación»: todos los jugadores de una federación, por categoría. El
 *   país elegido queda en este aparato.
 * - La estrella de cada jugador lo pone en «Mis jugadores», arriba del
 *   buscador: se guarda en este aparato (sin cuenta), hasta 20.
 * - «Avisarme en este celular»: la función sala-jugadores (acciones seguir y
 *   baja) manda cada ronda como notificación. El permiso se pide solo al tocar
 *   el botón; cada vez que cambia la lista o el idioma se le vuelve a mandar.
 *
 * Otra página de torneo usa este mismo módulo poniendo antes
 * window.TorneoPagina = { sala, guardado, soloPodio, grupos } (las de las
 * universidades, en js/cenfotec.js y js/utn.js): su sala de Torneos, el
 * prefijo de lo que guarda en el aparato y, si cada torneo de chess-results
 * es un grupo (Femenino y Masculino en la UTN), el nombre de cada uno por su
 * número de torneo. Sin eso, es la del Centroamericano.
 *
 * Ver «Busca a tu jugador y el medallero», «Mi delegación» y «Seguir a mis
 * jugadores y los avisos en el celular» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";

  const CONFIG = window.TorneoPagina || {};
  const SALA = CONFIG.sala || "centroamericano-2026";
  const PREFIJO = CONFIG.guardado || "cac";
  const CLAVE_GUARDADO = PREFIJO + "_jugadores_v1";
  const CLAVE_SEGUIDOS = PREFIJO + "_seguidos_v1";
  const CLAVE_DELEGACION = PREFIJO + "_delegacion_v1";
  const CLAVE_AVISOS = PREFIJO + "_avisos_v1";
  const CLAVE_AVISO_DELEG = PREFIJO + "_aviso_delegacion_v1";
  const MAX_SEGUIDOS = 20;
  const REFRESCO_MS = 120000;
  const MAX_RESULTADOS = 8;
  const $ = (id) => document.getElementById(id);
  const ZONA = "America/Costa_Rica";

  const TEXTOS = {
    es: {
      cargando: "Buscando en chess-results…",
      error: "No pudimos leer chess-results ahora mismo. Vuelve a intentarlo en un rato.",
      guardado: (h) => "Sin conexión: estos son los datos leídos en chess-results el " + h + ".",
      leido: (h) => "Leído en chess-results: " + h + ".",
      corto: "Escribe al menos 3 letras.",
      nadie: "No encontramos a nadie con ese nombre. Prueba solo con el apellido, sin tildes no importa.",
      cuantos: (n, m) => n > m ? "Hay " + n + " jugadores con ese nombre: te mostramos " + m + ". Escribe un poco más." : (n === 1 ? "1 jugador." : n + " jugadores."),
      categoria: (g) => categoria(g, "es"),
      inicial: (n) => "Número inicial " + n,
      elo: (e) => "Elo " + e,
      puesto: (p, de, g) => "Puesto " + p + " de " + de + (g ? " en " + g : ""),
      puntos: (p) => p + (p === "1" ? " punto" : " puntos"),
      sinPareo: (r) => r ? "No aparece en el pareo de la ronda " + r + "." : "El pareo de la ronda 1 todavía no está publicado.",
      bye: (r) => "Ronda " + r + ": tiene bye (descansa).",
      mesa: (r, m, color, rival) => "Ronda " + r + " · Mesa " + m + " · Juega con " + color + " contra " + rival,
      blancas: "blancas", negras: "negras",
      resultado: (r) => "Resultado: " + r,
      medalleroAntes: "Los podios aparecen cuando termine la ronda 1.",
      provisional: (r, de) => "Provisional: así quedaría después de la ronda " + r + (de ? " de " + de : "") + ".",
      final: "Final: la clasificación después de la última ronda.",
      termino: (r) => "El torneo terminó, a " + r + " rondas. Toca «Sus rondas» para ver cada una.",
      federacion: "Federación", oro: "Oro", plata: "Plata", bronce: "Bronce", total: "Total",
      medallasDe: "Medallas por federación",
      podios: "Los podios de cada categoría",
      seguir: (n) => "Seguir a " + n,
      dejar: (n) => "Dejar de seguir a " + n,
      tope: "Ya sigues a " + MAX_SEGUIDOS + " jugadores: deja de seguir a alguno para agregar otro.",
      cargandoSeguido: "Buscando sus datos en chess-results…",
      noEsta: "Ya no aparece en la lista de chess-results.",
      elegir: "Elige el país…",
      deDelegacion: (n, pais) => (n === 1 ? "1 jugador de " : n + " jugadores de ") + pais + ".",
      enCategoria: (n) => (n === 1 ? "1 jugador" : n + " jugadores"),
      avisarme: "Avisarme en este celular",
      avisosSi: "Avisos en este celular: encendidos",
      pidiendoPermiso: "Pidiendo el permiso del navegador…",
      sinPermiso: "Sin el permiso de notificaciones no se pueden mandar avisos a este celular. Se puede cambiar en la configuración del navegador.",
      sinPreparar: "Este navegador no dejó preparar los avisos. Recarga la página e intenta de nuevo.",
      avisosListos: "✓ Listo: te llegó un aviso de prueba. Te avisaremos aquí cada ronda de tus jugadores.",
      avisosAlDia: "✓ Los avisos ya están al día con tu lista.",
      avisosApagados: "Listo: este celular ya no recibe los avisos.",
      avisosError: "No se pudieron preparar los avisos en este celular. Revisa la conexión e intenta de nuevo.",
      susRondas: "Sus rondas", ocultarRondas: "Ocultar sus rondas",
      compartir: "Compartir",
      sinRondas: "Todavía no ha jugado ninguna ronda.",
      rondaFila: (r, color, que, rival) => "Ronda " + r + (color ? " · " + color : "") + " · " + que + (rival ? " " + rival : ""),
      gano: "ganó a", tablas: "tablas con", perdio: "perdió con", pendiente: "juega contra",
      ganoInc: "ganó por incomparecencia a", perdioInc: "perdió por incomparecencia con",
      byeFila: (pts) => pts > 0 ? "bye (" + fmtPuntos(pts) + (pts === 1 ? " punto)" : " puntos)") : "no jugó",
      rendimiento: (rp, n, ra) => "Rendimiento: " + rp + " en " + n + (n === 1 ? " partida" : " partidas") + " (sus rivales tienen " + ra + " de promedio).",
      resumen: (r, g, e, p, b, a) => "Ronda " + r + ": " + [[g, g === 1 ? " ganada" : " ganadas"], [e, " en tablas"], [p, p === 1 ? " perdida" : " perdidas"], [b, " bye"], [a, " sin jugar"]]
        .filter(([n]) => n).map(([n, s]) => n + s).join(", ") + ".",
      resumenPuntos: (pts, de) => fmtPuntos(pts) + " de " + de + " puntos posibles.",
      copiarWhatsapp: "Copiar para WhatsApp",
      copiado: "✓ Copiado: pégalo en el grupo.",
      noCopiado: "Tu navegador no dejó copiar. Mantén el dedo sobre el resumen para copiarlo.",
      whatsappTitulo: (pais, r) => pais + " — Ronda " + r + ", Centroamericano 2026",
      whatsappLinea: (nombre, cat, que, rival) => nombre + " (" + cat + ") " + que + (rival ? " " + rival : ""),
      copiarEnlace: "Copiar enlace",
      enlaceCopiado: (n) => "✓ Enlace de " + n + " copiado: mándalo por WhatsApp.",
      enlaceNoCopiado: "Tu navegador no dejó copiar el enlace.",
      noEncontrado: "No encontramos a ese jugador en chess-results. Búscalo por su nombre.",
      progreso: (r, h, n) => "Ronda " + r + ": " + h + " de " + n + (n === 1 ? " partida terminada." : " partidas terminadas."),
      rondaTerminada: (r) => "Ronda " + r + ": terminada. El pareo de la siguiente sale en cuanto lo publique el árbitro.",
      delegNo: (p) => "Avisarme del resumen de " + p + " en cada ronda",
      delegSi: (p) => "Resumen de " + p + " en este celular: encendido",
      delegListo: (p) => "✓ Listo: te avisaremos cómo le fue a " + p + " en cuanto terminen sus partidas de cada ronda.",
      delegApagado: (p) => "Listo: ya no te avisamos el resumen de " + p + ".",
      imagenResumen: "Compartir imagen",
      puestosTitulo: "Su puesto en la categoría después de cada ronda:",
      puestoRonda: (r, p) => "R" + r + " " + p,
      puestosNota: "Con los mismos puntos se comparte el puesto (por ejemplo, 3.º–5.º): el desempate lo decide al final del torneo.",
      locale: "es-CR",
    },
    en: {
      cargando: "Searching chess-results…",
      error: "We couldn't read chess-results right now. Please try again in a while.",
      guardado: (h) => "Offline: this is the data read from chess-results on " + h + ".",
      leido: (h) => "Read from chess-results: " + h + ".",
      corto: "Type at least 3 letters.",
      nadie: "We couldn't find anyone with that name. Try just the last name; accents don't matter.",
      cuantos: (n, m) => n > m ? n + " players match: showing " + m + ". Type a little more." : (n === 1 ? "1 player." : n + " players."),
      categoria: (g) => categoria(g, "en"),
      inicial: (n) => "Starting number " + n,
      elo: (e) => "Rating " + e,
      puesto: (p, de, g) => "Place " + p + " of " + de + (g ? " in " + g : ""),
      puntos: (p) => p + (p === "1" ? " point" : " points"),
      sinPareo: (r) => r ? "Not in the pairings of round " + r + "." : "The pairings of round 1 are not published yet.",
      bye: (r) => "Round " + r + ": has a bye (rests).",
      mesa: (r, m, color, rival) => "Round " + r + " · Board " + m + " · Plays " + color + " against " + rival,
      blancas: "white", negras: "black",
      resultado: (r) => "Result: " + r,
      medalleroAntes: "The podiums show up once round 1 is over.",
      provisional: (r, de) => "Provisional: the standings after round " + r + (de ? " of " + de : "") + ".",
      final: "Final: the standings after the last round.",
      termino: (r) => "The tournament is over, after " + r + " rounds. Tap “Their rounds” to see each one.",
      federacion: "Federation", oro: "Gold", plata: "Silver", bronce: "Bronze", total: "Total",
      medallasDe: "Medals by federation",
      podios: "The podium of every section",
      seguir: (n) => "Follow " + n,
      dejar: (n) => "Unfollow " + n,
      tope: "You already follow " + MAX_SEGUIDOS + " players: unfollow one to add another.",
      cargandoSeguido: "Looking up their data on chess-results…",
      noEsta: "No longer on the chess-results list.",
      elegir: "Choose the country…",
      deDelegacion: (n, pais) => (n === 1 ? "1 player from " : n + " players from ") + pais + ".",
      enCategoria: (n) => (n === 1 ? "1 player" : n + " players"),
      avisarme: "Notify me on this phone",
      avisosSi: "Notifications on this phone: on",
      pidiendoPermiso: "Asking the browser for permission…",
      sinPermiso: "Without notification permission we can't notify this phone. You can change it in the browser settings.",
      sinPreparar: "This browser couldn't set up notifications. Reload the page and try again.",
      avisosListos: "✓ Done: you got a test notification. We'll notify you here every round of your players.",
      avisosAlDia: "✓ Notifications are up to date with your list.",
      avisosApagados: "Done: this phone no longer gets the notifications.",
      avisosError: "We couldn't set up notifications on this phone. Check the connection and try again.",
      susRondas: "Their rounds", ocultarRondas: "Hide their rounds",
      compartir: "Share",
      sinRondas: "No round played yet.",
      rondaFila: (r, color, que, rival) => "Round " + r + (color ? " · " + color : "") + " · " + que + (rival ? " " + rival : ""),
      gano: "beat", tablas: "drew with", perdio: "lost to", pendiente: "plays",
      ganoInc: "won by forfeit against", perdioInc: "lost by forfeit to",
      byeFila: (pts) => pts > 0 ? "bye (" + fmtPuntos(pts) + (pts === 1 ? " point)" : " points)") : "did not play",
      rendimiento: (rp, n, ra) => "Performance: " + rp + " in " + n + (n === 1 ? " game" : " games") + " (opponents' average rating " + ra + ").",
      resumen: (r, g, e, p, b, a) => "Round " + r + ": " + [[g, g === 1 ? " win" : " wins"], [e, e === 1 ? " draw" : " draws"], [p, p === 1 ? " loss" : " losses"], [b, b === 1 ? " bye" : " byes"], [a, " not played"]]
        .filter(([n]) => n).map(([n, s]) => n + s).join(", ") + ".",
      resumenPuntos: (pts, de) => fmtPuntos(pts) + " out of " + de + " possible points.",
      copiarWhatsapp: "Copy for WhatsApp",
      copiado: "✓ Copied: paste it in the group.",
      noCopiado: "Your browser didn't allow copying. Press and hold the summary to copy it.",
      whatsappTitulo: (pais, r) => pais + " — Round " + r + ", Centroamericano 2026",
      whatsappLinea: (nombre, cat, que, rival) => nombre + " (" + cat + ") " + que + (rival ? " " + rival : ""),
      copiarEnlace: "Copy link",
      enlaceCopiado: (n) => "✓ Link to " + n + " copied: send it on WhatsApp.",
      enlaceNoCopiado: "Your browser didn't allow copying the link.",
      noEncontrado: "We couldn't find that player on chess-results. Search by name.",
      progreso: (r, h, n) => "Round " + r + ": " + h + " of " + n + (n === 1 ? " game finished." : " games finished."),
      rondaTerminada: (r) => "Round " + r + ": finished. The next pairings come out as soon as the arbiter publishes them.",
      delegNo: (p) => "Notify me of " + p + "'s summary every round",
      delegSi: (p) => p + " summary on this phone: on",
      delegListo: (p) => "✓ Done: we'll let you know how " + p + " did as soon as its games of each round are over.",
      delegApagado: (p) => "Done: we no longer send you " + p + "'s summary.",
      imagenResumen: "Share image",
      puestosTitulo: "Their place in the section after each round:",
      puestoRonda: (r, p) => "R" + r + " " + p,
      puestosNota: "Players on the same points share the place (for example, 3rd–5th): tiebreaks decide it at the end of the tournament.",
      locale: "en-US",
    },
  };

  const idioma = () => (document.documentElement.lang === "en" ? "en" : "es");
  const t = () => TEXTOS[idioma()];

  // «U18F» → «Sub-18 Femenino» / «U18 Girls»; «U08» → «Sub-8 Absoluto» / «U8 Open».
  function categoria(g, lang) {
    // «—» es el grupo de un torneo sin categorías (el de CENFOTEC): todos juntos.
    if (g === "—") return lang === "en" ? "Overall" : "General";
    const m = String(g || "").match(/^U0?(\d+)(F?)$/i);
    if (!m) return g || "";
    return lang === "en" ? "U" + m[1] + (m[2] ? " Girls" : " Open") : "Sub-" + m[1] + (m[2] ? " Femenino" : " Absoluto");
  }
  // Las federaciones de la región (código de FIDE). La que no esté, con su código.
  const PAISES = {
    ARU: ["Aruba", "Aruba"], BAH: ["Bahamas", "Bahamas"], BAR: ["Barbados", "Barbados"], BER: ["Bermudas", "Bermuda"],
    BIZ: ["Belice", "Belize"], CAY: ["Islas Caimán", "Cayman Islands"], COL: ["Colombia", "Colombia"], CRC: ["Costa Rica", "Costa Rica"],
    CUB: ["Cuba", "Cuba"], CUR: ["Curazao", "Curaçao"], DOM: ["República Dominicana", "Dominican Republic"], ESA: ["El Salvador", "El Salvador"],
    GRN: ["Granada", "Grenada"], GUA: ["Guatemala", "Guatemala"], GUY: ["Guyana", "Guyana"], HAI: ["Haití", "Haiti"],
    HON: ["Honduras", "Honduras"], ISV: ["Islas Vírgenes de EE. UU.", "US Virgin Islands"], IVB: ["Islas Vírgenes Británicas", "British Virgin Islands"],
    JAM: ["Jamaica", "Jamaica"], LCA: ["Santa Lucía", "Saint Lucia"], MEX: ["México", "Mexico"], NCA: ["Nicaragua", "Nicaragua"],
    PAN: ["Panamá", "Panama"], PUR: ["Puerto Rico", "Puerto Rico"], SKN: ["San Cristóbal y Nieves", "Saint Kitts and Nevis"],
    SUR: ["Surinam", "Suriname"], TTO: ["Trinidad y Tobago", "Trinidad and Tobago"], VEN: ["Venezuela", "Venezuela"],
    VIN: ["San Vicente y las Granadinas", "Saint Vincent and the Grenadines"],
  };
  const pais = (f, lang) => (PAISES[f] ? PAISES[f][lang === "en" ? 1 : 0] + " (" + f + ")" : f);
  const ordenGrupo = (g) => { const m = String(g).match(/^U0?(\d+)(F?)$/i); return m ? Number(m[1]) * 2 + (m[2] ? 1 : 0) : 999; };

  // Sin tildes, sin mayúsculas y sin comas: «Muñoz, José» → «munoz jose».
  const plano = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

  // 8.5 → «8½», 0.5 → «½», 3 → «3».
  const fmtPuntos = (n) => { const e = Math.floor(n), m = n - e >= 0.5; return e ? e + (m ? "½" : "") : (m ? "½" : "0"); };
  const puntosNum = (s) => { const m = String(s || "").match(/^(\d*)(½?)$/); return m ? (Number(m[1]) || 0) + (m[2] ? 0.5 : 0) : 0; };

  // Una casilla del cuadro cruzado de chess-results: «5w1» (contra el 5, con
  // blancas, ganó), «9b½», «12w+» / «3b-» (por incomparecencia), «-1» (bye de un
  // punto), «-0» (no jugó). Vacía: esa ronda no se jugó todavía.
  function casilla(texto) {
    const m = String(texto || "").match(/^(\d+|-)([wbs]?)(1|0|½|\+|-|=)$/);
    if (!m) return null;
    const puntos = m[3] === "1" || m[3] === "+" ? 1 : m[3] === "½" || m[3] === "=" ? 0.5 : 0;
    const rival = m[1] === "-" ? null : Number(m[1]);
    return { rival, color: m[2] === "w" ? "blancas" : m[2] === "b" ? "negras" : null, puntos, incomparecencia: !!rival && (m[3] === "+" || m[3] === "-") };
  }
  // Lo que hizo un color en una mesa del pareo: «1 - 0» → 1; sin resultado, null.
  function puntosDeMesa(resultado, blancas) {
    const m = String(resultado || "").replace(/\s+/g, "").match(/^(1|0|½|\+|-)-(1|0|½|\+|-)$/);
    if (!m) return null;
    const v = (x) => (x === "1" || x === "+" ? 1 : x === "½" ? 0.5 : 0);
    return blancas ? v(m[1]) : v(m[2]);
  }

  const el = (tag, clase, texto) => { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; };
  const hora = (iso) => new Date(iso).toLocaleTimeString(t().locale, { hour: "numeric", minute: "2-digit", day: "numeric", month: "short", timeZone: ZONA });

  /* ---------------- los datos ---------------- */
  let datos = null;          // { torneos: [...], recibido: ISO }
  let deGuardado = false;
  let pidiendo = null;
  let ultimoPedido = 0;

  function guardados() {
    try { return normalizar(JSON.parse(localStorage.getItem(CLAVE_GUARDADO) || "null")); } catch (e) { return null; }
  }

  // Con el torneo terminado, chess-results titula «Clasificación final», sin
  // número de ronda, y su página de pareo trae la última ronda con otras
  // columnas (el rival sin número). La ronda sale entonces del cuadro cruzado
  // (las casillas jugadas de cada jugador), el torneo queda «terminado» y ese
  // pareo no se usa: lo que pasó en cada ronda ya está en «r».
  function normalizar(d) {
    if (!d || !Array.isArray(d.torneos)) return d;
    d.torneos.forEach((tor) => {
      if (!Array.isArray(tor.jugadores)) return;
      // Un torneo por grupo: el grupo es el del torneo, no la columna «Gr».
      const grupo = CONFIG.grupos && CONFIG.grupos[tor.tnr];
      if (grupo) tor.jugadores.forEach((j) => { if (!j.grupo) j.grupo = grupo; });
      if (tor.ronda) return;
      const jugadas = Math.max(0, ...tor.jugadores.map((j) => (Array.isArray(j.r) ? j.r.filter(Boolean).length : 0)));
      if (!jugadas) return;
      tor.ronda = jugadas;
      tor.rondas = Math.max(tor.rondas || 0, jugadas);
      tor.terminado = true;
      tor.pareo = null;
    });
    return d;
  }

  function pedir() {
    if (pidiendo) return pidiendo;
    if (datos && !deGuardado && Date.now() - ultimoPedido < REFRESCO_MS) return Promise.resolve(datos);
    ultimoPedido = Date.now();
    pidiendo = (async () => {
      try {
        if (!window.sb || !window.sb.functions) throw new Error("sin cliente");
        const { data, error } = await window.sb.functions.invoke("sala-jugadores", { body: { clave: SALA } });
        if (error || !data || !Array.isArray(data.torneos)) throw error || new Error("respuesta rara");
        datos = normalizar({ torneos: data.torneos, recibido: new Date().toISOString() });
        deGuardado = false;
        try { localStorage.setItem(CLAVE_GUARDADO, JSON.stringify(datos)); } catch (e) {}
        // Para lo que arma js/centroamericano-tablas.js con los mismos datos.
        document.dispatchEvent(new Event("cac-datos"));
      } catch (e) {
        const g = guardados();
        if (g && !datos) { datos = g; deGuardado = true; }
        if (!datos) throw e;
      } finally {
        pidiendo = null;
      }
      return datos;
    })();
    return pidiendo;
  }

  // Todos los jugadores de todos los torneos de la sala, cada uno con su ronda.
  function jugadores() {
    const out = [];
    (datos ? datos.torneos : []).forEach((tor) => {
      if (!Array.isArray(tor.jugadores)) return;
      const porNo = new Map(tor.jugadores.map((j) => [j.no, j]));
      const enGrupo = {};
      tor.jugadores.forEach((j) => { (enGrupo[j.grupo] = enGrupo[j.grupo] || []).push(j); });
      Object.values(enGrupo).forEach((lista) => lista.sort((a, b) => a.puesto - b.puesto).forEach((j, i) => { j._puestoGrupo = i + 1; j._deGrupo = lista.length; }));
      const pareo = tor.pareo || { ronda: 0, mesas: [] };
      tor.jugadores.forEach((j) => {
        let partida = null;
        (pareo.mesas || []).some((m) => {
          if (m.blancas && m.blancas.no === j.no) { partida = { mesa: m.mesa, color: "blancas", rival: m.negras, resultado: m.resultado }; return true; }
          if (m.negras && m.negras.no === j.no) { partida = { mesa: m.mesa, color: "negras", rival: m.blancas, resultado: m.resultado }; return true; }
          return false;
        });
        out.push({ j, torneo: tor, ronda: pareo.ronda || 0, partida, rivalDe: (no) => porNo.get(no) });
      });
    });
    return out;
  }

  // Las rondas de un jugador, de la primera a la última jugada: del cuadro
  // cruzado y, si la ronda del pareo todavía no está en él, del pareo (con su
  // resultado si ya lo hay, o «pendiente»).
  function rondasDe(x) {
    const out = [];
    const r = Array.isArray(x.j.r) ? x.j.r : [];
    r.forEach((c, i) => {
      const k = casilla(c);
      if (k) out.push({ ronda: i + 1, rival: k.rival ? x.rivalDe(k.rival) || null : null, color: k.color, puntos: k.puntos, bye: !k.rival, incomparecencia: k.incomparecencia });
    });
    if (x.ronda && x.partida && !out.some((o) => o.ronda === x.ronda)) {
      const p = x.partida;
      if (!p.rival) out.push({ ronda: x.ronda, rival: null, color: null, puntos: null, bye: true });
      else {
        const pts = puntosDeMesa(p.resultado, p.color === "blancas");
        out.push({ ronda: x.ronda, rival: x.rivalDe(p.rival.no) || { nombre: p.rival.nombre, titulo: p.rival.titulo }, color: p.color, puntos: pts, bye: false,
          incomparecencia: /[+-]\s*-\s*[+-]/.test(String(p.resultado || "")) });
      }
    }
    return out.sort((a, b) => a.ronda - b.ronda);
  }

  // El rendimiento de FIDE (Rp = promedio de los rivales + dp(p), tabla 8.1b,
  // la misma copia que usa Pareo Integral en js/pareo/desempates.js): solo las
  // partidas jugadas contra rivales con Elo; ni byes ni incomparecencias.
  function rendimiento(x) {
    const jugadas = rondasDe(x).filter((o) => !o.bye && !o.incomparecencia && o.puntos !== null && o.rival && o.rival.elo > 0);
    if (!jugadas.length || !window.PareoDesempates) return null;
    const ra = jugadas.reduce((a, o) => a + o.rival.elo, 0) / jugadas.length;
    const p = jugadas.reduce((a, o) => a + o.puntos, 0) / jugadas.length;
    return { rp: Math.round(ra + window.PareoDesempates.dpDeP(p)), ra: Math.round(ra), n: jugadas.length };
  }

  // Los puntos de cada jugador de una categoría tras las primeras `hasta`
  // rondas del cuadro cruzado (lo oficial: sin la ronda que solo está en el pareo).
  function puntosTras(lista, hasta) {
    return lista.map((j) => {
      const r = Array.isArray(j.r) ? j.r : [];
      let pts = 0;
      for (let i = 0; i < hasta && i < r.length; i++) { const k = casilla(r[i]); if (k) pts += k.puntos; }
      return pts;
    });
  }
  // El puesto de un jugador en su categoría después de cada ronda, contando
  // solo los puntos: con los mismos puntos se comparte el puesto (3.º–5.º),
  // porque el desempate de cada ronda intermedia no lo publica chess-results.
  function puestosDe(x) {
    const lista = (x.torneo.jugadores || []).filter((j) => j.grupo === x.j.grupo);
    const i = lista.indexOf(x.j);
    const mias = Array.isArray(x.j.r) ? x.j.r : [];
    const out = [];
    if (i < 0) return out;
    for (let k = 1; k <= mias.length; k++) {
      if (!casilla(mias[k - 1])) continue;
      const pts = puntosTras(lista, k);
      const yo = pts[i];
      const mejores = pts.filter((p, n) => n !== i && p > yo).length;
      const iguales = pts.filter((p, n) => n !== i && p === yo).length;
      out.push({ ronda: k, desde: mejores + 1, hasta: mejores + 1 + iguales, de: lista.length, puntos: yo });
    }
    return out;
  }
  // 3 → «3.º» / «3rd»; un puesto compartido, «3.º–5.º».
  function ordinal(n, lang) {
    if (lang !== "en") return n + ".º";
    const d = n % 100;
    return n + (d >= 11 && d <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
  }
  const puestoTexto = (p, lang) => ordinal(p.desde, lang) + (p.hasta > p.desde ? "–" + ordinal(p.hasta, lang) : "");

  // «ganó a FM Guevara Ruiz, Santiago Jose (ESA, 2252)» para una ronda.
  function rivalTexto(j) {
    if (!j) return "";
    return (j.titulo ? j.titulo + " " : "") + j.nombre + (j.fed || j.elo ? " (" + [j.fed, j.elo || ""].filter(Boolean).join(", ") + ")" : "");
  }
  function queHizo(o, tx) {
    if (o.bye) return { que: o.puntos === null ? "bye" : tx.byeFila(o.puntos), rival: "" };
    const que = o.puntos === null ? tx.pendiente
      : o.puntos === 1 ? (o.incomparecencia ? tx.ganoInc : tx.gano)
      : o.puntos === 0.5 ? tx.tablas : (o.incomparecencia ? tx.perdioInc : tx.perdio);
    return { que, rival: rivalTexto(o.rival) };
  }

  // Cuántas partidas de la ronda emparejada ya tienen resultado (sin los byes).
  function progresoRonda() {
    let ronda = 0, total = 0, hechas = 0;
    (datos ? datos.torneos : []).forEach((tor) => {
      const p = tor.pareo;
      if (!p || !p.ronda || !Array.isArray(p.mesas)) return;
      ronda = Math.max(ronda, p.ronda);
      p.mesas.forEach((m) => { if (!m.negras) return; total++; if (puntosDeMesa(m.resultado, true) !== null) hechas++; });
    });
    return ronda && total ? { ronda, total, hechas } : null;
  }
  function pintarProgreso() {
    const caja = $("ronda-progreso");
    if (!caja) return;
    const p = progresoRonda();
    caja.hidden = !p;
    if (!p) return;
    $("ronda-progreso-texto").textContent = p.hechas === p.total ? t().rondaTerminada(p.ronda) : t().progreso(p.ronda, p.hechas, p.total);
    caja.querySelector(".cac-progreso-barra span").style.width = Math.round((100 * p.hechas) / p.total) + "%";
  }

  // Un aviso solo para el lector de pantalla (lo que pasó al tocar un botón).
  function anunciar(texto) {
    let r = $("cac-anuncio");
    if (!r) {
      r = el("p", "sr-only");
      r.id = "cac-anuncio";
      r.setAttribute("role", "status");
      r.setAttribute("data-no-traducir", "");
      document.body.appendChild(r);
    }
    r.textContent = "";
    setTimeout(() => { r.textContent = texto; }, 50);
  }

  // El enlace directo a un jugador: #jugador=<torneo>-<número inicial>-<nombre>.
  // El nombre va para que se lea y para encontrarlo si el árbitro le cambió el
  // número antes de la ronda 1.
  const slugDe = (n) => plano(n).replace(/ /g, "-");
  const enlaceDe = (x) => location.origin + location.pathname + "#jugador=" + x.torneo.tnr + "-" + x.j.no + "-" + slugDe(x.j.nombre);
  function abrirEnlaceJugador() {
    const m = location.hash.match(/^#jugador=(\d{1,9})-(\d{1,5})(?:-([a-z0-9-]{0,120}))?$/);
    if (!m) return;
    const tx = t();
    pedir().then(() => {
      const todos = jugadores().filter((y) => String(y.torneo.tnr) === m[1]);
      const slug = m[3] || "";
      let x = todos.find((y) => y.j.no === Number(m[2]) && (!slug || slugDe(y.j.nombre) === slug));
      if (!x && slug) { const c = todos.filter((y) => slugDe(y.j.nombre) === slug); if (c.length === 1) x = c[0]; }
      if (!x) { $("buscador-estado").textContent = tx.noEncontrado; return; }
      const clave = x.torneo.tnr + "-" + x.j.no;
      $("buscador-nombre").value = x.j.nombre;
      abiertas.add(clave);
      pintarTodo();
      $("buscador").scrollIntoView({ block: "start" });
      const boton = $("buscador-resultados").querySelector('[data-rondas="' + clave + '"]');
      if (boton) boton.focus({ preventScroll: true });
    }, () => { $("buscador-estado").textContent = tx.error; });
  }

  const abiertas = new Set();
  let contadorRondas = 0;

  /* ---------------- el buscador ---------------- */
  function pintarBuscador() {
    const campo = $("buscador-nombre"), estado = $("buscador-estado"), lista = $("buscador-resultados");
    if (!campo) return;
    const tx = t();
    const q = plano(campo.value);
    lista.replaceChildren();
    if (!q) { estado.textContent = ""; return; }
    if (q.replace(/ /g, "").length < 3) { estado.textContent = tx.corto; return; }
    if (!datos) { estado.textContent = tx.cargando; return; }
    const palabras = q.split(" ");
    const hallados = jugadores().filter((x) => { const n = plano(x.j.nombre); return palabras.every((p) => n.includes(p)); });
    const cuando = cuandoSeLeyo(tx);
    if (!hallados.length) { decir(estado, tx.nadie + cuando); return; }
    decir(estado, tx.cuantos(hallados.length, MAX_RESULTADOS) + cuando);
    hallados.slice(0, MAX_RESULTADOS).forEach((x) => lista.appendChild(tarjeta(x, tx)));
  }

  // « Leído en chess-results: …» (o «Sin conexión: …»), para el final de un estado.
  function cuandoSeLeyo(tx) {
    const alguno = datos && datos.torneos.find((tor) => tor.leido_en);
    if (!alguno) return "";
    return " " + (deGuardado ? tx.guardado(hora(alguno.leido_en)) : tx.leido(hora(alguno.leido_en)));
  }
  // «10:05 a. m.» ya trae su punto: no se le pone otro.
  const decir = (nodo, s) => { nodo.textContent = s.replace(/\.\./g, "."); };

  function tarjeta(x, tx) {
    const { j } = x;
    const li = el("li", "cac-jugador");
    li.appendChild(estrella({ tnr: x.torneo.tnr, no: j.no, nombre: j.nombre }, tx));
    const nombre = el("p", "cac-jugador-nombre", (j.titulo ? j.titulo + " " : "") + j.nombre + " ");
    if (j.fed) nombre.appendChild(el("span", "cac-fed", j.fed));
    li.appendChild(nombre);
    const datosJ = [tx.categoria(j.grupo)];
    if (j.elo) datosJ.push(tx.elo(j.elo));
    if (x.torneo.ronda > 0 && j._puestoGrupo) datosJ.push(tx.puesto(j._puestoGrupo, j._deGrupo, tx.categoria(j.grupo)), tx.puntos(j.puntos));
    else datosJ.push(tx.inicial(j.no));
    li.appendChild(el("p", "text-sm", datosJ.filter(Boolean).join(" · ")));
    let linea;
    if (x.torneo.terminado) linea = tx.termino(x.torneo.ronda);
    else if (x.partida && !x.partida.rival) linea = tx.bye(x.ronda);
    else if (x.partida) {
      const r = x.rivalDe(x.partida.rival.no) || {};
      const rival = (x.partida.rival.titulo ? x.partida.rival.titulo + " " : "") + x.partida.rival.nombre
        + (r.fed || r.elo ? " (" + [r.fed, r.elo || ""].filter(Boolean).join(", ") + ")" : "");
      linea = tx.mesa(x.ronda, x.partida.mesa, x.partida.color === "blancas" ? tx.blancas : tx.negras, rival);
    } else linea = tx.sinPareo(x.ronda);
    li.appendChild(el("p", "cac-jugador-ronda", linea));
    const res = x.partida && x.partida.resultado && x.partida.resultado !== "bye" && /\d|½/.test(x.partida.resultado) ? x.partida.resultado : "";
    if (res) li.appendChild(el("p", "text-sm", tx.resultado(res)));

    // «Sus rondas» se abre dentro de la tarjeta, y queda abierta al repintar.
    const clave = x.torneo.tnr + "-" + j.no;
    const abierta = abiertas.has(clave);
    const acciones = el("div", "cac-jugador-acciones");
    const ver = el("button", "cac-jugador-boton", abierta ? tx.ocultarRondas : tx.susRondas);
    ver.type = "button";
    ver.setAttribute("aria-expanded", abierta ? "true" : "false");
    const idLista = "rondas-" + (++contadorRondas);
    ver.setAttribute("aria-controls", idLista);
    ver.dataset.rondas = clave;
    ver.addEventListener("click", () => {
      if (abiertas.has(clave)) abiertas.delete(clave); else abiertas.add(clave);
      const caja = ver.closest("[id]");
      pintarTodo();
      const mismo = caja && document.getElementById(caja.id) && document.getElementById(caja.id).querySelector('[data-rondas="' + clave + '"]');
      if (mismo) mismo.focus();
    });
    acciones.appendChild(ver);
    const enlace = el("button", "cac-jugador-boton", tx.copiarEnlace);
    enlace.type = "button";
    enlace.dataset.accion = "enlace";
    enlace.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(enlaceDe(x)); anunciar(t().enlaceCopiado(j.nombre)); enlace.textContent = "✓ " + t().copiarEnlace; }
      catch (e) { anunciar(t().enlaceNoCopiado); }
    });
    acciones.appendChild(enlace);
    // La imagen la arma js/centroamericano-tablas.js, que carga después.
    const comp = el("button", "cac-jugador-boton", tx.compartir);
    comp.type = "button";
    comp.dataset.accion = "compartir";
    comp.addEventListener("click", () => { if (window.CentroamericanoTablas) window.CentroamericanoTablas.compartirJugador(x, comp); });
    acciones.appendChild(comp);
    li.appendChild(acciones);
    if (abierta) {
      const rondas = rondasDe(x);
      const caja = el("div", "cac-jugador-rondas");
      caja.id = idLista;
      if (!rondas.length) caja.appendChild(el("p", "text-sm", tx.sinRondas));
      else {
        const ol = el("ol", "");
        rondas.forEach((o) => {
          const q = queHizo(o, tx);
          const color = o.color ? (o.color === "blancas" ? tx.blancas : tx.negras) : "";
          ol.appendChild(el("li", "", tx.rondaFila(o.ronda, color, q.que, q.rival)));
        });
        caja.appendChild(ol);
        const rend = rendimiento(x);
        if (rend) caja.appendChild(el("p", "mt-2 text-sm font-semibold", tx.rendimiento(rend.rp, rend.n, rend.ra)));
        const puestos = puestosDe(x);
        if (puestos.length) {
          const linea = el("p", "cac-puestos mt-2 text-sm");
          linea.appendChild(el("span", "font-semibold", tx.puestosTitulo + " "));
          linea.appendChild(document.createTextNode(puestos.map((p) => tx.puestoRonda(p.ronda, puestoTexto(p, idioma()))).join(" · ")));
          caja.appendChild(linea);
          if (puestos.some((p) => p.hasta > p.desde)) caja.appendChild(el("p", "mt-1 text-xs text-brand-600 dark:text-brand-300", tx.puestosNota));
        }
      }
      li.appendChild(caja);
    }
    return li;
  }

  let espera = null;
  function alEscribir() {
    clearTimeout(espera);
    espera = setTimeout(() => {
      pintarBuscador();
      if (plano($("buscador-nombre").value).replace(/ /g, "").length >= 3) {
        pedir().then(pintarTodo, () => { $("buscador-estado").textContent = t().error; });
      }
    }, 200);
  }

  /* ---------------- Mis jugadores (la estrella) ---------------- */
  // Cada seguido es { tnr, no, nombre }: el torneo de chess-results, su número
  // inicial y su nombre, que es lo que dice el aviso.
  const claveDe = (s) => s.tnr + "-" + s.no;
  function seguidos() {
    try {
      const l = JSON.parse(localStorage.getItem(CLAVE_SEGUIDOS) || "[]");
      return Array.isArray(l) ? l.filter((s) => s && /^\d{1,9}$/.test(String(s.tnr)) && Number.isInteger(s.no) && s.no > 0 && typeof s.nombre === "string").slice(0, MAX_SEGUIDOS) : [];
    } catch (e) { return []; }
  }
  function guardarSeguidos(l) {
    try { localStorage.setItem(CLAVE_SEGUIDOS, JSON.stringify(l)); } catch (e) { /* sin lugar: queda para esta visita */ }
    alCambiarSeguidos();
  }
  const sigo = (s) => seguidos().some((x) => claveDe(x) === claveDe(s));

  function estrella(s, tx) {
    const si = sigo(s);
    const b = el("button", "cac-estrella");
    b.type = "button";
    b.dataset.clave = claveDe(s);
    b.setAttribute("aria-pressed", si ? "true" : "false");
    b.setAttribute("aria-label", si ? tx.dejar(s.nombre) : tx.seguir(s.nombre));
    b.title = si ? tx.dejar(s.nombre) : tx.seguir(s.nombre);
    const ico = el("span", "", si ? "★" : "☆");
    ico.setAttribute("aria-hidden", "true");
    b.appendChild(ico);
    b.addEventListener("click", () => {
      const l = seguidos();
      const k = claveDe(s);
      const estado = $("seguidos-estado");
      if (l.some((x) => claveDe(x) === k)) guardarSeguidos(l.filter((x) => claveDe(x) !== k));
      else if (l.length >= MAX_SEGUIDOS) { if (estado) estado.textContent = t().tope; return; }
      else guardarSeguidos(l.concat({ tnr: String(s.tnr), no: s.no, nombre: s.nombre }));
      if (estado) estado.textContent = "";
      // Al volver a pintar, el foco sigue en la misma estrella (o en la del
      // buscador, si era la de «Mis jugadores» y ya no está).
      const lista = b.closest("[id]");
      pintarTodo();
      const mismo = (lista && document.getElementById(lista.id) && document.getElementById(lista.id).querySelector('[data-clave="' + k + '"]'))
        || document.querySelector('.cac-estrella[data-clave="' + k + '"]');
      if (mismo) mismo.focus();
    });
    return b;
  }

  // El seguido entre los jugadores de chess-results. Si su número ya es de
  // otra persona (el árbitro volvió a ordenar la lista antes de la ronda 1),
  // se lo busca por su nombre y se corrige el número guardado.
  function buscarSeguido(s, todos) {
    const delTorneo = todos.filter((x) => String(x.torneo.tnr) === String(s.tnr));
    const mismo = delTorneo.find((x) => x.j.no === s.no && plano(x.j.nombre) === plano(s.nombre));
    if (mismo) return mismo;
    const porNombre = delTorneo.filter((x) => plano(x.j.nombre) === plano(s.nombre));
    return porNombre.length === 1 ? porNombre[0] : null;
  }

  function pintarSeguidos() {
    const caja = $("seguidos"), lista = $("seguidos-lista");
    if (!caja) return;
    const tx = t();
    const l = seguidos();
    caja.hidden = !l.length;
    lista.replaceChildren();
    const todos = datos ? jugadores() : [];
    let corregidos = false;
    l.forEach((s) => {
      const x = datos ? buscarSeguido(s, todos) : null;
      if (x) {
        if (x.j.no !== s.no) { s.no = x.j.no; corregidos = true; }
        lista.appendChild(tarjeta(x, tx));
        return;
      }
      const li = el("li", "cac-jugador");
      li.appendChild(estrella(s, tx));
      li.appendChild(el("p", "cac-jugador-nombre", s.nombre));
      li.appendChild(el("p", "text-sm", datos ? tx.noEsta : tx.cargandoSeguido));
      lista.appendChild(li);
    });
    if (corregidos) guardarSeguidos(l);
    pintarAvisos();
  }

  /* ---------------- Mi delegación ---------------- */
  function delegacionGuardada() {
    try { return (localStorage.getItem(CLAVE_DELEGACION) || "").replace(/[^A-Z]/g, "").slice(0, 3); } catch (e) { return ""; }
  }

  function pintarDelegacion() {
    const sel = $("delegacion"), estado = $("delegacion-estado"), caja = $("delegacion-lista");
    if (!sel) return;
    const tx = t();
    const lang = idioma();
    const elegida = sel.value || delegacionGuardada();
    const todos = datos ? jugadores() : [];
    // Los países que hay en la clasificación, por nombre.
    const feds = [...new Set(todos.map((x) => x.j.fed).filter(Boolean))];
    if (elegida && !feds.includes(elegida)) feds.push(elegida);
    feds.sort((a, b) => pais(a, lang).localeCompare(pais(b, lang), tx.locale));
    // Solo se rearma si cambió: rearmarla con la lista abierta la cierra.
    const firma = lang + ":" + feds.join(",");
    if (sel.dataset.firma !== firma) {
      sel.dataset.firma = firma;
      sel.replaceChildren(el("option", "", tx.elegir));
      sel.firstChild.value = "";
      feds.forEach((f) => { const o = el("option", "", pais(f, lang)); o.value = f; sel.appendChild(o); });
    }
    sel.value = elegida;
    caja.replaceChildren();
    if (!elegida) { estado.textContent = ""; return; }
    if (!datos) { estado.textContent = tx.cargando; return; }
    const suyos = todos.filter((x) => x.j.fed === elegida);
    decir(estado, tx.deDelegacion(suyos.length, pais(elegida, lang)) + cuandoSeLeyo(tx));
    const resumen = resumenDelegacion(suyos, tx, pais(elegida, lang));
    if (resumen) caja.appendChild(resumen);
    const grupos = {};
    suyos.forEach((x) => { (grupos[x.j.grupo || "—"] = grupos[x.j.grupo || "—"] || []).push(x); });
    Object.keys(grupos).sort((a, b) => ordenGrupo(a) - ordenGrupo(b) || a.localeCompare(b)).forEach((g) => {
      const sec = el("section", "cac-delegacion-grupo");
      sec.appendChild(el("h4", "", tx.categoria(g) + " · " + tx.enCategoria(grupos[g].length)));
      const ul = el("ul", "mt-2 grid gap-3");
      ul.id = "delegacion-" + String(g).replace(/[^A-Za-z0-9]/g, "");
      grupos[g].sort((a, b) => a.j.puesto - b.j.puesto).forEach((x) => ul.appendChild(tarjeta(x, tx)));
      sec.appendChild(ul);
      caja.appendChild(sec);
    });
  }

  // La última ronda con algún resultado de la delegación, contada y lista
  // para copiar al grupo de WhatsApp.
  function resumenDelegacion(suyos, tx, nombrePais) {
    let ronda = 0;
    const deCada = suyos.map((x) => ({ x, rondas: rondasDe(x) }));
    deCada.forEach((d) => d.rondas.forEach((o) => { if (o.puntos !== null && o.ronda > ronda) ronda = o.ronda; }));
    if (!ronda) return null;
    let g = 0, e = 0, p = 0, b = 0, a = 0, pts = 0, posibles = 0;
    const lineas = [];
    deCada.forEach(({ x, rondas }) => {
      const o = rondas.find((r) => r.ronda === ronda);
      if (!o || o.puntos === null) return;
      posibles += 1; pts += o.puntos;
      // «-0» en chess-results es que no jugó (no se presentó o no estaba): no es un bye.
      if (o.bye) { if (o.puntos > 0) b++; else a++; } else if (o.puntos === 1) g++; else if (o.puntos === 0.5) e++; else p++;
      const q = queHizo(o, tx);
      const marca = o.bye ? (o.puntos > 0 ? "⏸️" : "➖") : o.puntos === 1 ? "✅" : o.puntos === 0.5 ? "🤝" : "❌";
      lineas.push(marca + " " + tx.whatsappLinea(x.j.nombre, tx.categoria(x.j.grupo), q.que, q.rival));
    });
    const caja = el("div", "cac-resumen");
    caja.appendChild(el("p", "font-bold", tx.resumen(ronda, g, e, p, b, a)));
    caja.appendChild(el("p", "text-sm", tx.resumenPuntos(pts, posibles)));
    const texto = [tx.whatsappTitulo(nombrePais, ronda), tx.resumen(ronda, g, e, p, b, a) + " " + tx.resumenPuntos(pts, posibles), ""]
      .concat(lineas, ["", "https://ajedrez-integral.com/centroamericano-2026.html" + (idioma() === "en" ? "?lang=en" : "")]).join("\n");
    const boton = el("button", "cac-boton mt-3", tx.copiarWhatsapp);
    boton.type = "button";
    const aviso = el("p", "mt-2 text-sm font-semibold");
    aviso.setAttribute("role", "status");
    boton.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(texto); aviso.textContent = t().copiado; }
      catch (err) { aviso.textContent = t().noCopiado; }
    });
    const imagen = el("button", "cac-jugador-boton mt-3 ml-2", tx.imagenResumen);
    imagen.type = "button";
    imagen.addEventListener("click", () => {
      if (window.CentroamericanoTablas) window.CentroamericanoTablas.compartirResumen({ pais: nombrePais, ronda, resumen: tx.resumen(ronda, g, e, p, b, a), puntos: tx.resumenPuntos(pts, posibles), lineas }, imagen);
    });
    caja.append(boton, imagen, aviso);
    caja.dataset.texto = texto;
    return caja;
  }

  function alElegirDelegacion() {
    const sel = $("delegacion");
    try { if (sel.value) localStorage.setItem(CLAVE_DELEGACION, sel.value); else localStorage.removeItem(CLAVE_DELEGACION); } catch (e) {}
    pintarDelegacion();
    pintarAvisoDelegacion();
    $("delegacion-avisos-estado").textContent = "";
    if (sel.value) pedir().then(pintarTodo, () => { $("delegacion-estado").textContent = t().error; });
  }

  function pintarTodo() { pintarProgreso(); pintarSeguidos(); pintarBuscador(); pintarDelegacion(); pintarAvisoDelegacion(); }

  /* ---------------- Avisarme en este celular ---------------- */
  // Qué dice la función, también cuando contesta un error (lo trae el cuerpo).
  async function llamar(body) {
    if (!window.sb || !window.sb.functions) return { ok: false };
    const { data, error } = await window.sb.functions.invoke("sala-jugadores", { body });
    if (!error) return data || { ok: false };
    try { return await error.context.json(); } catch (e) { return { ok: false }; }
  }
  const hayPush = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const avisosEncendidos = () => { try { return localStorage.getItem(CLAVE_AVISOS) === "1" && Notification.permission === "granted"; } catch (e) { return false; } };
  const marcarAvisos = (si) => { try { if (si) localStorage.setItem(CLAVE_AVISOS, "1"); else localStorage.removeItem(CLAVE_AVISOS); } catch (e) {} };
  const llaveBytes = (b64) => {
    const s = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  };
  // El service worker lo registra js/pwa.js; si no llega en 8 s, no hay.
  const registro = () => Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 8000))]);
  const paraMandar = () => seguidos().map((s) => ({ tnr: String(s.tnr), no: s.no, nombre: s.nombre }));

  function pintarAvisos() {
    const caja = $("avisos"), boton = $("avisos-boton");
    if (!caja || !boton) return;
    caja.hidden = !hayPush() || !seguidos().length;
    const si = hayPush() && avisosEncendidos();
    const tx = t();
    boton.setAttribute("aria-pressed", si ? "true" : "false");
    const ico = el("span", "", "🔔 ");
    ico.setAttribute("aria-hidden", "true");
    boton.replaceChildren(ico, document.createTextNode(si ? tx.avisosSi : tx.avisarme));
  }

  // El país del que este aparato pide el resumen de cada ronda, o "".
  const delegAviso = () => { try { return (localStorage.getItem(CLAVE_AVISO_DELEG) || "").replace(/[^A-Z]/g, "").slice(0, 3); } catch (e) { return ""; } };
  const marcarDeleg = (f) => { try { if (f) localStorage.setItem(CLAVE_AVISO_DELEG, f); else localStorage.removeItem(CLAVE_AVISO_DELEG); } catch (e) {} };
  // Todo lo que sigue este aparato, junto: la función deja EXACTAMENTE eso.
  const cuerpoSeguir = (sub) => ({ accion: "seguir", clave: SALA, suscripcion: sub.toJSON(), jugadores: paraMandar(), delegacion: delegAviso() || null, idioma: idioma() });

  let ocupado = false;
  // Pide el permiso (solo cuando se toca un botón), se suscribe y le manda la lista a la función.
  async function encenderAvisos(estado) {
    const tx = t();
    estado.textContent = tx.pidiendoPermiso;
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") { estado.textContent = tx.sinPermiso; return false; }
    const reg = await registro();
    if (!reg) { estado.textContent = tx.sinPreparar; return false; }
    const llave = await llamar({ accion: "push_llave" });
    if (!llave.ok || !llave.llave) { estado.textContent = llave.error || tx.avisosError; return false; }
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: llaveBytes(llave.llave) }));
    const r = await llamar(cuerpoSeguir(sub));
    if (!r.ok) { estado.textContent = r.error || tx.avisosError; return false; }
    marcarAvisos(true);
    estado.textContent = tx.avisosListos;
    return true;
  }

  async function alTocarAvisos() {
    if (ocupado) return;
    const boton = $("avisos-boton"), estado = $("avisos-estado");
    const tx = t();
    ocupado = true;
    boton.disabled = true;
    try {
      if (avisosEncendidos()) {
        // Apagar es para todo el aparato: sus jugadores y su delegación.
        const reg = await registro();
        const sub = reg && (await reg.pushManager.getSubscription());
        if (sub) await llamar({ accion: "baja", clave: SALA, suscripcion: sub.toJSON() });
        marcarAvisos(false);
        marcarDeleg("");
        estado.textContent = tx.avisosApagados;
        return;
      }
      await encenderAvisos(estado);
    } catch (e) {
      estado.textContent = tx.avisosError;
    } finally {
      ocupado = false;
      boton.disabled = false;
      pintarAvisos();
      pintarAvisoDelegacion();
    }
  }

  // «Avisarme del resumen de Costa Rica en cada ronda»: un solo país por aparato.
  function pintarAvisoDelegacion() {
    const caja = $("delegacion-avisos-caja"), boton = $("delegacion-avisos"), sel = $("delegacion");
    if (!caja || !boton || !sel) return;
    caja.hidden = !hayPush() || !sel.value;
    if (caja.hidden) return;
    const si = avisosEncendidos() && delegAviso() === sel.value;
    const nombre = pais(sel.value, idioma());
    boton.setAttribute("aria-pressed", si ? "true" : "false");
    const ico = el("span", "", "🔔 ");
    ico.setAttribute("aria-hidden", "true");
    boton.replaceChildren(ico, document.createTextNode(si ? t().delegSi(nombre) : t().delegNo(nombre)));
  }
  async function alTocarAvisoDelegacion() {
    const sel = $("delegacion"), boton = $("delegacion-avisos"), estado = $("delegacion-avisos-estado");
    const f = sel && sel.value;
    if (!f || ocupado) return;
    const tx = t(), nombre = pais(f, idioma());
    ocupado = true;
    boton.disabled = true;
    try {
      if (avisosEncendidos() && delegAviso() === f) {
        marcarDeleg("");
        ponerAvisosAlDia();
        estado.textContent = tx.delegApagado(nombre);
      } else if (avisosEncendidos()) {
        marcarDeleg(f);
        ponerAvisosAlDia();
        estado.textContent = tx.delegListo(nombre);
      } else {
        const antes = delegAviso();
        marcarDeleg(f);
        if (await encenderAvisos(estado)) estado.textContent = tx.delegListo(nombre);
        else marcarDeleg(antes);
      }
    } catch (e) {
      estado.textContent = tx.avisosError;
    } finally {
      ocupado = false;
      boton.disabled = false;
      pintarAvisos();
      pintarAvisoDelegacion();
    }
  }

  // Con los avisos encendidos, la función tiene que saber la lista nueva (o el
  // idioma o el país nuevo). Se espera un poco, por si se tocan varias estrellas seguidas.
  let alDia = null;
  function ponerAvisosAlDia() {
    if (!hayPush() || !avisosEncendidos()) return;
    clearTimeout(alDia);
    alDia = setTimeout(async () => {
      const estado = $("avisos-estado");
      try {
        const reg = await registro();
        const sub = reg && (await reg.pushManager.getSubscription());
        if (!sub) { marcarAvisos(false); pintarAvisos(); pintarAvisoDelegacion(); return; }
        if (!paraMandar().length && !delegAviso()) {
          await llamar({ accion: "baja", clave: SALA, suscripcion: sub.toJSON() });
          marcarAvisos(false);
          pintarAvisos();
          pintarAvisoDelegacion();
          return;
        }
        const r = await llamar(cuerpoSeguir(sub));
        if (estado) estado.textContent = r.ok ? t().avisosAlDia : (r.error || t().avisosError);
      } catch (e) {
        if (estado) estado.textContent = t().avisosError;
      }
    }, 1500);
  }
  function alCambiarSeguidos() { ponerAvisosAlDia(); }

  /* ---------------- el medallero ---------------- */
  function pintarMedallero() {
    const caja = $("medallero-contenido");
    if (!caja) return;
    const tx = t();
    caja.replaceChildren();
    if (!datos) { caja.appendChild(el("p", "text-brand-600 dark:text-brand-300", tx.cargando)); return; }
    const torneos = datos.torneos.filter((tor) => Array.isArray(tor.jugadores) && tor.jugadores.length);
    const ronda = Math.max(0, ...torneos.map((tor) => tor.ronda || 0));
    const rondas = Math.max(0, ...torneos.map((tor) => tor.rondas || 0));
    if (!ronda) { caja.appendChild(el("p", "font-semibold", tx.medalleroAntes)); return; }
    caja.appendChild(el("p", "font-semibold", rondas && ronda >= rondas ? tx.final : tx.provisional(ronda, rondas)));

    // Los tres primeros de cada grupo, en el orden de la clasificación.
    const grupos = {};
    torneos.forEach((tor) => tor.jugadores.forEach((j) => { (grupos[j.grupo || "—"] = grupos[j.grupo || "—"] || []).push(j); }));
    const nombres = Object.keys(grupos).sort((a, b) => ordenGrupo(a) - ordenGrupo(b) || a.localeCompare(b));
    const medallas = {};
    nombres.forEach((g) => {
      grupos[g].sort((a, b) => a.puesto - b.puesto).slice(0, 3).forEach((j, i) => {
        const f = j.fed || "—";
        medallas[f] = medallas[f] || [0, 0, 0];
        medallas[f][i] += 1;
      });
    });

    // Un torneo de un solo país (el de CENFOTEC) no lleva tabla de medallas.
    if (!CONFIG.soloPodio) {
      caja.appendChild(el("h3", "mt-5 font-bold text-lg", tx.medallasDe));
      const envoltura = el("div", "mt-2 overflow-x-auto rounded-2xl border border-brand-100 dark:border-brand-800 bg-white dark:bg-brand-900");
      const tabla = el("table", "cac-medallas");
      const cab = el("tr", "bg-brand-100 dark:bg-brand-800");
      // El emoji de cada medalla va escondido para el lector: el nombre ya lo dice.
      [["", tx.federacion], ["🥇 ", tx.oro], ["🥈 ", tx.plata], ["🥉 ", tx.bronce], ["", tx.total]].forEach(([e, c]) => {
        const th = el("th"); th.scope = "col";
        if (e) { const s = el("span", "", e); s.setAttribute("aria-hidden", "true"); th.appendChild(s); }
        th.appendChild(document.createTextNode(c));
        cab.appendChild(th);
      });
      const thead = el("thead"); thead.appendChild(cab); tabla.appendChild(thead);
      const tbody = el("tbody", "divide-y divide-brand-100 dark:divide-brand-800");
      Object.entries(medallas).sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1] || b[1][2] - a[1][2] || a[0].localeCompare(b[0])).forEach(([f, m]) => {
        const tr = el("tr");
        const th = el("th", "font-semibold", f); th.scope = "row"; tr.appendChild(th);
        m.concat(m[0] + m[1] + m[2]).forEach((n) => tr.appendChild(el("td", "", String(n))));
        tbody.appendChild(tr);
      });
      tabla.appendChild(tbody);
      envoltura.appendChild(tabla);
      caja.appendChild(envoltura);
    }

    if (!CONFIG.soloPodio) caja.appendChild(el("h3", "mt-6 font-bold text-lg", tx.podios));
    const rejilla = el("div", "cac-podios mt-2");
    nombres.forEach((g) => {
      const c = el("section", "cac-podio");
      c.appendChild(el("h3", "", tx.categoria(g)));
      const ol = el("ol");
      grupos[g].slice(0, 3).forEach((j, i) => {
        const li = el("li");
        const medalla = el("span", "", ["🥇", "🥈", "🥉"][i] + " ");
        medalla.setAttribute("aria-hidden", "true");
        li.append(medalla, document.createTextNode((i + 1) + ". " + (j.titulo ? j.titulo + " " : "") + j.nombre + " "));
        if (j.fed) li.appendChild(el("span", "cac-fed", j.fed));
        li.appendChild(document.createTextNode(" · " + tx.puntos(j.puntos)));
        ol.appendChild(li);
      });
      c.appendChild(ol);
      rejilla.appendChild(c);
    });
    caja.appendChild(rejilla);
  }

  function abrirMedallero() {
    pintarMedallero();
    pedir().then(pintarMedallero, () => {
      const caja = $("medallero-contenido");
      if (caja) caja.replaceChildren(el("p", "font-semibold", t().error));
    });
  }

  /* ---------------- arranque ---------------- */
  const g = guardados();
  if (g && Array.isArray(g.torneos)) { datos = g; deGuardado = true; }

  const campo = $("buscador-nombre");
  if (campo) campo.addEventListener("input", alEscribir);

  const sel = $("delegacion");
  if (sel) {
    sel.addEventListener("change", alElegirDelegacion);
    // Los países salen de los datos: se piden al ir a elegir.
    const cargar = () => { if (!datos || deGuardado) pedir().then(pintarDelegacion, () => {}); };
    sel.addEventListener("focus", cargar);
    sel.addEventListener("pointerdown", cargar);
  }
  const botonAvisos = $("avisos-boton");
  if (botonAvisos) botonAvisos.addEventListener("click", alTocarAvisos);
  const botonDeleg = $("delegacion-avisos");
  if (botonDeleg) botonDeleg.addEventListener("click", alTocarAvisoDelegacion);
  window.addEventListener("hashchange", abrirEnlaceJugador);
  pintarSeguidos();
  pintarDelegacion();
  pintarAvisoDelegacion();
  pintarProgreso();
  abrirEnlaceJugador();
  // Quien ya sigue a alguien o eligió su país viene a ver eso: se pide de una vez.
  if (seguidos().length || delegacionGuardada()) pedir().then(pintarTodo, () => pintarTodo());

  // El medallero se abre como las demás ventanas (js/ventana-enlace.js, con el
  // enlace #medallero o la dirección); cuando se abre, se llena.
  const dialogo = $("medallero");
  if (dialogo) {
    new MutationObserver(() => { if (dialogo.open) abrirMedallero(); }).observe(dialogo, { attributes: true, attributeFilter: ["open"] });
    if (dialogo.open) abrirMedallero();
  }

  // Lo que usa js/centroamericano-tablas.js (la clasificación, la tabla por
  // país, el proyector y la imagen para compartir): una sola copia de los datos.
  window.CentroamericanoVivo = {
    datos: () => datos, deGuardado: () => deGuardado, pedir, jugadores, rondasDe, rendimiento, queHizo, rivalTexto,
    textos: t, idioma, categoria: (g) => t().categoria(g), ordenGrupo, pais: (f) => pais(f, idioma()), fmtPuntos, puntosNum,
    cuandoSeLeyo: () => cuandoSeLeyo(t()), plano, el, ZONA, progresoRonda, anunciar, puntosDeMesa,
    puestosDe, puntosTras, puestoTexto: (p) => puestoTexto(p, idioma()), delegacionGuardada,
  };

  document.addEventListener("cac-idioma", () => { pintarTodo(); ponerAvisosAlDia(); if (dialogo && dialogo.open) pintarMedallero(); });

  // Mientras la página está a la vista y alguien ya buscó (o sigue a alguien,
  // o eligió su país), se pone al día sola.
  setInterval(() => {
    const busco = campo && plano(campo.value).length >= 3;
    if (document.hidden || !(busco || seguidos().length || (sel && sel.value))) return;
    pedir().then(pintarTodo, () => {});
  }, REFRESCO_MS);
})();
