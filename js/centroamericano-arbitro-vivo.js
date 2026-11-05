/* «Mis mesas en vivo»: las partidas de las mesas del árbitro SIN el atraso de la transmisión pública (Centroamericano 2026).

   La transmisión pública de Lichess va con 15 min de atraso (juego limpio). Para el árbitro, la Edge Function
   centroamericano-mesas-vivo le da SOLO sus mesas (acción `mesas`, con el token del enlace) desde LiveChess Cloud, sin
   atraso (o, si la categoría no tiene su enlace de LiveChess, desde la transmisión privada de Lichess). Con eso:

   - «Mis mesas en vivo»: cada mesa con su tablero y sus relojes corriendo;
   - el control de tiempos sale solo de los relojes de la transmisión (`control`), con la hora real de la última jugada,
     y el árbitro lo guarda para que quede en la bitácora; si la transmisión no reconoce una mesa, queda el formulario
     de siempre, a mano;
   - las tablas que el árbitro tiene que saber apenas pasan (`tablas`): la triple repetición (art. 9.2) y las 50 jugadas
     sin peón ni captura (9.3), que las reclama un jugador, y la quíntuple (9.6.1) y las 75 jugadas (9.6.2), que son
     tablas sin reclamo. Se calculan con
     js/reclamos-tablas.js (chess.js, la misma regla de «la misma posición» que la página de reclamos), en la tablet.

   Mientras haya transmisión, se vuelve a leer cada 10 s (la pantalla a la vista): una repetición le llega al árbitro
   a lo sumo 10 s después de la jugada.

     CentroamericanoArbitroVivo.iniciar({ token, boton, alAlertar })
         token: () => el token del enlace; boton: «Mis mesas en vivo»; alAlertar(alerta): una tabla nueva que avisar
     CentroamericanoArbitroVivo.deLaMesa(mesa)  → { m, leida, delay } (la última lectura de esa mesa) o null
     CentroamericanoArbitroVivo.noReconoce(mesa)→ el motivo si la transmisión no reconoce esa mesa, o null
     CentroamericanoArbitroVivo.control(m, leida) → { t_blancas, t_negras, j_blancas, j_negras, turno, ocurrio, jugada }
     CentroamericanoArbitroVivo.leer()          → Promise: vuelve a pedir ahora
     Puras (Node): relojes, texto, hms, lectura, normalizar, control, tablas, alertasNuevas

   Ver «La transmisión sin atraso para los árbitros» y «Los tableros por LiveChess, sin atraso» en
   docs/decisiones/juegos-y-torneos.md. */
(function (raiz) {
  "use strict";
  const enNode = typeof module !== "undefined" && module.exports;
  const RT = () => raiz.ReclamosTablas || (enNode ? require("./reclamos-tablas.js") : null);
  const CADA_MS = 10000;               // con transmisión: cada 10 s
  const SIN_CONEXION_MS = 5 * 60000;   // si no está conectada, se vuelve a preguntar cada 5 min

  // ---------------------------------------------------------------- LiveChess: las jugadas con su reloj
  // Cada jugada viene como «Nf3 5482+5»: la jugada, lo que marca el reloj de quien la hizo justo después (en segundos) y
  // los segundos que pensó. `primera` es la hora (ms) de la primera jugada; la de las demás sale de sumar lo que pensó
  // cada uno desde ahí.
  function leerJugadas(jugadas, primera) {
    const sans = [], relojes = [];
    let ms = typeof primera === "number" ? primera : null;
    (jugadas || []).forEach((t, i) => {
      // También llega solo el reloj («Ba6 2912») o solo lo pensado («e4 +152»), según lo que alcanzó a leer el tablero.
      const m = String(t).trim().match(/^(\S+)(?:\s+(\d+)?(?:\+(\d+))?)?/);
      if (!m) return;
      const gasto = m[3] != null ? Number(m[3]) : null;
      if (i > 0 && ms != null && gasto != null) ms += gasto * 1000;
      sans.push(m[1]);
      relojes.push({ color: i % 2 === 0 ? "blancas" : "negras", reloj: m[2] != null ? Number(m[2]) : null, gasto, ms: i === 0 ? primera : ms });
    });
    return { sans, relojes };
  }

  // El control de tiempos que sale de la transmisión: lo que marcaban los dos relojes justo después de la última jugada,
  // con su hora real. Sin ninguna jugada (o sin relojes) no hay control.
  function control(m, leida) {
    if (!m) return null;
    if (m.fuente === "livechess") {
      const { relojes } = leerJugadas(m.jugadas, m.primera);
      const ultB = relojes.filter((r) => r.color === "blancas").pop(), ultN = relojes.filter((r) => r.color === "negras").pop();
      const ult = relojes[relojes.length - 1];
      if (!ultB || !ultN || ultB.reloj == null || ultN.reloj == null || !ult || ult.ms == null) return null;
      const jB = relojes.filter((r) => r.color === "blancas").length, jN = relojes.length - jB;
      return { t_blancas: ultB.reloj, t_negras: ultN.reloj, j_blancas: jB, j_negras: jN, turno: jB === jN ? "blancas" : "negras",
        ocurrio: new Date(ult.ms).toISOString(), jugada: Math.max(jB, jN), fuente: "livechess" };
    }
    // Lichess (privada, sin atraso): los relojes en centésimas, la hora es la de la lectura menos lo que llevaba pensando.
    const p = String(m.fen || "").split(/\s+/), n = Number(p[5]);
    if (!(p[1] === "w" || p[1] === "b") || !n || typeof m.reloj_b !== "number" || typeof m.reloj_n !== "number") return null;
    const jB = p[1] === "w" ? n - 1 : n, jN = n - 1;
    if (jB + jN === 0) return null;
    return { t_blancas: Math.round(m.reloj_b / 100), t_negras: Math.round(m.reloj_n / 100), j_blancas: jB, j_negras: jN, turno: jB === jN ? "blancas" : "negras",
      ocurrio: new Date((leida || Date.now()) - (typeof m.piensa === "number" ? m.piensa * 1000 : 0)).toISOString(), jugada: Math.max(jB, jN), fuente: "lichess" };
  }

  // La jugada como en la planilla de Costa Rica: R, D, T, A y C (las columnas van en minúscula, así que no se tocan).
  const PIEZA_ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
  const esp = (texto) => String(texto || "").replace(/[KQRBN]/g, (x) => PIEZA_ES[x]);

  // Las tablas que el árbitro tiene que saber: con las jugadas en SAN, js/reclamos-tablas.js (chess.js).
  function pgnDe(sans) {
    const partes = [];
    sans.forEach((s, i) => { if (i % 2 === 0) partes.push((i / 2 + 1) + "."); partes.push(s); });
    return partes.join(" ");
  }
  function tablas(sans) {
    const R = RT();
    if (!R || !sans || !sans.length) return null;
    let a;
    try { a = R.analizar(pgnDe(sans)); } catch (e) { return null; }
    if (!a || a.error || !a.posiciones) return null;
    const fin = a.posiciones[a.posiciones.length - 1];
    const ultimaVez = fin ? fin.vez : 0;
    return {
      fen: fin ? fin.fen : null,
      repeticiones: (a.repeticiones || []).map((r) => ({ ply: r.ply, jugada: r.jugada.rotulo + " " + esp(r.jugada.san) })),
      cinco: a.cincoVeces ? { ply: a.cincoVeces.ply, jugada: a.cincoVeces.jugada.rotulo + " " + esp(a.cincoVeces.jugada.san) } : null,
      // 50 jugadas de cada uno sin peón ni captura (art. 9.3): se pueden reclamar, como la triple. `desde`: dónde empezó la cuenta.
      cincuenta: a.cincuenta ? { ply: a.cincuenta.ply, jugada: a.cincuenta.jugada.rotulo + " " + esp(a.cincuenta.jugada.san), desde: a.cincuenta.desde ? a.cincuenta.desde.rotulo + " " + esp(a.cincuenta.desde.san) : null } : null,
      setentaYCinco: a.setentaYCinco ? { ply: a.setentaYCinco.ply, jugada: a.setentaYCinco.jugada.rotulo + " " + esp(a.setentaYCinco.jugada.san) } : null,
      // ¿La posición de ahora es la que se repite? (si la tercera fue hace rato y ya se movió, el aviso sigue, pero dice que ya pasó)
      ahora: ultimaVez,
    };
  }

  // Lo que llega de LiveChess, con la misma forma que lo de Lichess (la posición, la última jugada, los relojes en
  // centésimas y lo que lleva pensando), más el control y las tablas.
  function normalizar(m, leida) {
    if (!m || m.fuente !== "livechess") return m;
    const { sans, relojes } = leerJugadas(m.jugadas, m.primera);
    const t = tablas(sans);
    const ultB = relojes.filter((r) => r.color === "blancas").pop(), ultN = relojes.filter((r) => r.color === "negras").pop();
    const ult = relojes[relojes.length - 1];
    let fen = t && t.fen, ultima = "";
    if (!fen && !sans.length) fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    if (sans.length && raiz.Chess) {
      try { const c = new raiz.Chess(); sans.forEach((s) => c.move(s, { sloppy: true })); const h = c.history({ verbose: true }).pop(); if (h) ultima = h.from + h.to; if (!fen) fen = c.fen(); } catch (e) { /* sin la última jugada marcada */ }
    }
    return Object.assign({}, m, {
      fen: fen || "", ultima, sans,
      reloj_b: ultB && ultB.reloj != null ? ultB.reloj * 100 : null, reloj_n: ultN && ultN.reloj != null ? ultN.reloj * 100 : null,
      piensa: m.estado === "*" && ult && ult.ms != null && leida ? Math.max(0, Math.round((leida - ult.ms) / 1000)) : null,
      tablas: t,
    });
  }

  // Las alertas que todavía no se dieron (la clave no se repite: una por mesa, tipo y jugada).
  function alertasNuevas(mesas, ronda, vistas) {
    const out = [];
    for (const m of mesas || []) {
      const t = m.tablas;
      if (!t) continue;
      const agregar = (tipo, x, texto) => {
        const clave = ronda + "|" + m.mesa + "|" + tipo + "|" + x.ply;
        if (vistas.has(clave)) return;
        vistas.add(clave);
        out.push({ clave, tipo, mesa: m.mesa, jugada: x.jugada, texto });
      };
      if (t.cinco) agregar("cinco", t.cinco, "Quíntuple repetición en la mesa " + m.mesa + " (con " + t.cinco.jugada + "): son tablas sin que nadie reclame (art. 9.6.1). Detén los relojes y anota el resultado.");
      else for (const r of t.repeticiones) agregar("triple", r, "Triple repetición en la mesa " + m.mesa + " (con " + r.jugada + "): cualquiera de los dos puede reclamar tablas (art. 9.2). Si nadie reclama, la partida sigue.");
      if (t.cincuenta && !t.setentaYCinco) agregar("50", t.cincuenta, "50 jugadas de cada uno sin mover un peón ni capturar en la mesa " + m.mesa + " (se cumplieron con " + t.cincuenta.jugada + (t.cincuenta.desde ? "; la cuenta empezó con " + t.cincuenta.desde : "") + "): cualquiera de los dos puede reclamar tablas (art. 9.3). Si nadie reclama, la partida sigue.");
      if (t.setentaYCinco) agregar("75", t.setentaYCinco, "75 jugadas de cada uno sin mover un peón ni capturar en la mesa " + m.mesa + " (con " + t.setentaYCinco.jugada + "): son tablas sin reclamo (art. 9.6.2).");
    }
    return out;
  }

  // Los relojes de ahora: el de quien tiene el turno sigue corriendo desde la lectura (lo que llevaba pensando + lo
  // que pasó desde que se leyó). Los relojes vienen en centésimas.
  function relojes(m, ahora, leida) {
    const p = String(m.fen || "").split(/\s+/);
    const turno = p[1] === "b" ? "negras" : "blancas";
    const s = (x) => (typeof x === "number" ? Math.round(x / 100) : null);
    let b = s(m.reloj_b), n = s(m.reloj_n);
    const terminada = m.estado && m.estado !== "*";
    const n1 = Number(p[5]);
    const empezada = Number.isInteger(n1) && (n1 > 1 || p[1] === "b");
    if (!terminada && empezada && typeof m.piensa === "number" && leida != null) {
      const corre = m.piensa + Math.max(0, Math.round((ahora - leida) / 1000));
      if (turno === "blancas" && b != null) b = b - corre;
      if (turno === "negras" && n != null) n = n - corre;
    }
    return { blancas: b, negras: n, turno, terminada };
  }

  // La forma de una partida del JSON de Lichess (la que lee CentroamericanoTransmisionReloj.controlDe).
  function lectura(m, leida) {
    return { fen: m.fen, status: m.estado || "*", thinkTime: m.piensa, players: [{ clock: m.reloj_b }, { clock: m.reloj_n }], leida };
  }

  const dos = (x) => String(x).padStart(2, "0");
  function hms(seg) {
    if (seg == null) return "—";
    const neg = seg < 0, t = Math.abs(seg);
    return (neg ? "−" : "") + (t >= 3600 ? Math.floor(t / 3600) + ":" + dos(Math.floor((t % 3600) / 60)) : Math.floor(t / 60)) + ":" + dos(t % 60);
  }
  // Lo que se lee de una mesa, en palabras (para la tarjeta y para el lector de pantalla).
  function texto(m, ahora, leida) {
    const r = relojes(m, ahora, leida);
    const p = String(m.fen || "").split(/\s+/), n = Number(p[5]) || 1;
    const jugada = p[1] === "b" ? n : n - 1;
    if (r.terminada) return "Terminó en la transmisión: " + m.estado + ".";
    if (!jugada) return "Todavía no se ha hecho ninguna jugada.";
    return "Van " + jugada + (jugada === 1 ? " jugada" : " jugadas") + " · le toca a las " + r.turno + " · Blancas " + hms(r.blancas) + " · Negras " + hms(r.negras);
  }

  // ---------------------------------------------------------------- en el navegador
  let o = null, datos = null, leidaMs = null, conectada = null, preguntado = 0, dialogo = null, cada = null, pidiendo = null, ultimaLectura = 0;
  const vistas = new Set();

  function el(tag, at, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(at || {})) {
      if (v == null || v === false) continue;
      if (k === "texto") n.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const h of hijos) if (h != null) n.append(h);
    return n;
  }

  function leer() {
    if (pidiendo) return pidiendo;
    pidiendo = (async () => {
      try {
        const { data, error } = await raiz.sb.functions.invoke("centroamericano-mesas-vivo", { body: { action: "mesas", arbitro_token: o.token() } });
        preguntado = Date.now();
        if (error || !data || !data.ok) { if (data && data.conectada === false) conectada = false; return datos; }
        conectada = !!data.conectada;
        if (conectada) {
          leidaMs = Date.now();
          const primera = !datos;
          datos = Object.assign({}, data, { mesas: (data.mesas || []).map((m) => normalizar(m, leidaMs)) });
          ultimaLectura = leidaMs;
          // La primera lectura también avisa: si el árbitro abre la tablet con una repetición ya hecha, tiene que saberlo.
          const nuevas = alertasNuevas(datos.mesas, data.ronda, vistas);
          if (nuevas.length && o.alAlertar) nuevas.forEach((a) => o.alAlertar(a, { primera }));
        }
        if (o.boton) o.boton.hidden = !conectada;
        pintar();
        return datos;
      } catch (e) {
        return datos;   // sin red: se queda con lo último y lo dice la hora
      } finally {
        pidiendo = null;
      }
    })();
    return pidiendo;
  }

  function pintar() {
    if (!dialogo || !dialogo.open) return;
    const cuerpo = dialogo.querySelector(".cv-cuerpo");
    const ahora = Date.now();
    if (!datos) { cuerpo.replaceChildren(el("p", { texto: "Leyendo tus mesas…" })); return; }
    const aviso = [];
    aviso.push(el("p", { class: "text-sm cv-hora", role: "status", texto: "Sin atraso" + (datos.fuente === "livechess" ? " (LiveChess)" : "") + " · leído a las " + raiz.HoraCR.hora(new Date(leidaMs).toISOString(), { hour: "numeric", minute: "2-digit", second: "2-digit" }) + " · se actualiza cada 10 s." }));
    if (datos.delay > 0) aviso.push(el("p", { class: "text-sm cam-apagado-ojo", texto: "⚠ La transmisión privada tiene un atraso de " + Math.round(datos.delay / 60) + " min: avísale a la organización (debe ir en 0)." }));
    if (!datos.mesas.length) aviso.push(el("p", { texto: "Ninguna de tus mesas está en la transmisión (solo se transmiten las que tienen tablero electrónico)." }));
    for (const x of datos.no_reconoce || []) aviso.push(el("p", { class: "text-sm", texto: "Mesa " + x.mesa + ": " + x.motivo + " Anota a mano como siempre." }));
    const tarjetas = datos.mesas.map((m) => {
      const tab = el("div", { class: "cine-tablero cv-tablero", "aria-hidden": "true" });
      if (raiz.TableroFen && m.fen) raiz.TableroFen.dibujar(tab, m.fen, m.ultima, { miniatura: true });
      const t = m.tablas;
      const rep = t && [
        t.cinco ? "Quíntuple repetición (con " + t.cinco.jugada + "): tablas sin reclamo." : t.repeticiones.length ? "Triple repetición (con " + t.repeticiones[t.repeticiones.length - 1].jugada + "): se pueden reclamar tablas." : "",
        t.setentaYCinco ? "75 jugadas sin peón ni captura (con " + t.setentaYCinco.jugada + "): tablas sin reclamo." : t.cincuenta ? "50 jugadas sin peón ni captura (con " + t.cincuenta.jugada + "): se pueden reclamar tablas." : "",
      ].filter(Boolean).join(" ");
      return el("article", { class: "cv-mesa", "data-mesa": String(m.mesa), "data-repeticion": rep ? "si" : null },
        el("p", { class: "cv-mesa-titulo" }, el("strong", { texto: "Mesa " + m.mesa })),
        tab,
        el("p", { class: "text-sm cv-texto", texto: texto(m, ahora, leidaMs) }),
        rep ? el("p", { class: "text-sm cv-repeticion", texto: "⚖ " + rep }) : null,
        raiz.TableroFen && m.fen ? el("p", { class: "sr-only", texto: raiz.TableroFen.describir(m.fen) }) : null);
    });
    // No repintar bajo el dedo: lo único que cambia cada segundo es el texto de los relojes.
    cuerpo.replaceChildren(...aviso, el("div", { class: "cv-mesas" }, ...tarjetas));
  }

  function latir() {
    if (!dialogo || !dialogo.open || !datos) return;
    const ahora = Date.now();
    for (const m of datos.mesas) {
      const p = dialogo.querySelector('.cv-mesa[data-mesa="' + m.mesa + '"] .cv-texto');
      if (p) p.textContent = texto(m, ahora, leidaMs);
    }
  }

  function abrir(mesa) {
    if (!dialogo) {
      dialogo = el("dialog", { id: "mesas-en-vivo", class: "cam-dialogo cv-dialogo", "aria-labelledby": "cv-titulo" },
        el("div", { class: "cam-dialogo-titulo" }, el("span", { id: "cv-titulo", texto: "Mis mesas en vivo (sin atraso)" }),
          el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", onclick: () => dialogo.close() }, "Cerrar")),
        el("div", { class: "cam-dialogo-cuerpo cv-cuerpo" }),
        el("p", { class: "text-sm cv-pie", texto: "Solo para ti: no lo muestres a jugadores ni a entrenadores. La transmisión pública va con 15 min de atraso por juego limpio." }));
      dialogo.addEventListener("close", () => { if (o.boton) o.boton.focus(); });
      document.body.append(dialogo);
    }
    try { dialogo.showModal(); } catch (e) { dialogo.setAttribute("open", ""); }
    pintar();
    leer();
    if (mesa) { const t = dialogo.querySelector('.cv-mesa[data-mesa="' + mesa + '"]'); if (t) t.scrollIntoView({ block: "center" }); }
  }

  function iniciar(op) {
    o = op;
    if (o.boton) { o.boton.hidden = true; o.boton.addEventListener("click", () => abrir()); }
    // La primera pregunta va unos segundos después: al abrir, lo primero son las mesas del árbitro, no esto.
    setTimeout(leer, 3000);
    // Con transmisión, cada 10 s (para que una repetición llegue enseguida); sin ella, cada 5 min por si la conectan.
    setInterval(() => {
      if (document.hidden) return;
      latir();
      // En el modo liviano (tablet vieja o lenta, js/modo-liviano.js), con transmisión cada 20 s en vez de 10.
      const lenta = raiz.ModoLiviano && raiz.ModoLiviano.activo();
      const espera = conectada ? (lenta ? 2 * CADA_MS : CADA_MS) : SIN_CONEXION_MS;
      if (Date.now() - Math.max(preguntado, ultimaLectura) >= espera) leer();
    }, 1000);
  }

  // La última lectura de una mesa (o null), con la hora en que se leyó: para el control de tiempos y el reloj apagado.
  function deLaMesa(mesa) {
    if (!conectada || !datos) return null;
    const m = datos.mesas.find((x) => x.mesa === Number(mesa));
    return m ? { m, leida: leidaMs, delay: datos.delay || 0 } : null;
  }
  function noReconoce(mesa) {
    if (!conectada || !datos) return null;
    const x = (datos.no_reconoce || []).find((y) => y.mesa === Number(mesa));
    return x ? x.motivo : null;
  }

  const api = { relojes, lectura, texto, hms, leerJugadas, control, tablas, normalizar, alertasNuevas, pgnDe, esp,
    iniciar, leer, abrir, deLaMesa, noReconoce, conectada: () => conectada };
  if (enNode) module.exports = api;
  else raiz.CentroamericanoArbitroVivo = api;
})(typeof self !== "undefined" ? self : this);
