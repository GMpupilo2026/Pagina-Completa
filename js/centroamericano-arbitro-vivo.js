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
    // Las jugadas se pasan por chess.js hasta la primera que no es posible (`ilegal`): de ahí en adelante no se sigue
    // (la posición, las tablas y el control salen de lo que sí se jugó).
    const C = raiz.Chess || (enNode ? require("chess.js").Chess : null);
    let legales = sans, ilegal = null, ultima = "", fin = null, fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    if (C && sans.length) {
      const c = new C();
      legales = [];
      for (let i = 0; i < sans.length; i++) {
        let h = null;
        try { h = c.move(sans[i], { sloppy: true }); } catch (e) { h = null; }
        if (!h) { ilegal = { ply: i + 1, jugada: Math.floor(i / 2) + 1 + (i % 2 ? "… " : ". ") + esp(sans[i]) }; break; }
        legales.push(sans[i]);
        ultima = h.from + h.to;
      }
      fen = c.fen();
      // Cómo quedó en el tablero (solo si todo lo registrado es legal): mate, ahogado o sin material para dar mate.
      const f = (n) => (typeof c[n] === "function" ? c[n]() : false);
      if (!ilegal) fin = f("in_checkmate") ? "mate" : f("in_stalemate") ? "ahogado" : f("insufficient_material") ? "muerta" : null;
    }
    const t = tablas(legales);
    const ultB = relojes.filter((r) => r.color === "blancas").pop(), ultN = relojes.filter((r) => r.color === "negras").pop();
    const ult = relojes[relojes.length - 1];
    return Object.assign({}, m, {
      fen, ultima, sans, legales, ilegal, fin,
      reloj_b: ultB && ultB.reloj != null ? ultB.reloj * 100 : null, reloj_n: ultN && ultN.reloj != null ? ultN.reloj * 100 : null,
      piensa: m.estado === "*" && ult && ult.ms != null && leida ? Math.max(0, Math.round((leida - ult.ms) / 1000)) : null,
      tablas: t,
    });
  }

  // Las alertas que todavía no se dieron (la clave no se repite: una por mesa, tipo y jugada).
  function alertasNuevas(mesas, ronda, vistas) {
    const out = [];
    for (const m of mesas || []) {
      // Una jugada imposible en la transmisión: una ilegal, o una pieza mal puesta o mal leída. Solo con la partida en juego.
      if (m.ilegal && (!m.estado || m.estado === "*")) {
        const clave = ronda + "|" + m.mesa + "|imposible|" + m.ilegal.ply;
        if (!vistas.has(clave)) {
          vistas.add(clave);
          out.push({ clave, tipo: "ilegal", mesa: m.mesa, jugada: m.ilegal.jugada, color: m.ilegal.ply % 2 === 1 ? "blancas" : "negras", texto: "La transmisión de la mesa " + m.mesa + " trae una jugada imposible (" + m.ilegal.jugada + "): puede ser una jugada ilegal, o una pieza mal puesta o mal leída por el tablero. Mira la mesa: si fue una jugada ilegal, la primera le da 2 minutos al rival y la segunda pierde la partida (art. 7.5.5)." });
        }
      }
      // La partida terminó según la transmisión (mate, ahogado, sin material o el resultado que puso el tablero): el
      // resultado para confirmar. La tablet lo ofrece solo si chess-results todavía no tiene ninguno.
      // (La quíntuple y las 75 tienen su propio aviso, con «Guardar ½-½».)
      const s = sugerencia(m);
      if (s && s.por !== "cinco" && s.por !== "75") {
        const clave = ronda + "|" + m.mesa + "|fin|" + s.valor;
        if (!vistas.has(clave)) {
          vistas.add(clave);
          out.push({ clave, tipo: "fin", mesa: m.mesa, valor: s.valor, resultado: s.resultado, motivo: s.motivo, texto: "Según la transmisión, la partida de la mesa " + m.mesa + " terminó " + s.resultado + " (" + s.motivo + "). Confírmalo en la mesa y en las planillas firmadas; el resultado lo guardas tú." });
        }
      }
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

  // La bandera caída (art. 6.9): a quien le corre el reloj se le acabó el tiempo y la partida sigue sin resultado.
  // Con el reloj en vivo de LiveChess (`reloj`: white/black en segundos, run = true si corre el de las blancas, false
  // si el de las negras, null si está detenido, y time = la hora de esa lectura) se usa ese: es lo que marca el reloj
  // de la mesa, también si el árbitro lo detuvo (detenido no hay bandera que avisar). La misma regla que el encargado de
  // transmisión (js/centroamericano-transmision.js). Sin reloj en vivo, el último reloj registrado de quien tiene el
  // turno menos lo que pasó desde la jugada del rival, solo si el tablero sigue transmitiendo.
  function bandera(m, ahora, leida) {
    if (!m || (m.estado && m.estado !== "*")) return null;
    const p = String(m.fen || "").split(/\s+/), n1 = Number(p[5]);
    const jugadas = Number.isInteger(n1) ? (n1 - 1) * 2 + (p[1] === "b" ? 1 : 0) : 0;
    if (!jugadas) return null;
    const r = m.reloj && typeof m.reloj === "object" ? m.reloj : null;
    let color = null, queda = null;
    if (r && Number(r.time)) {
      color = r.run === true ? "blancas" : r.run === false ? "negras" : null;
      if (!color) return null;
      queda = Number(color === "blancas" ? r.white : r.black) - Math.max(0, (ahora - Number(r.time)) / 1000);
    } else {
      if (m.fuente === "livechess" && !m.en_vivo) return null;
      const rr = relojes(m, ahora, leida);
      if (rr.terminada) return null;
      color = rr.turno;
      queda = color === "blancas" ? rr.blancas : rr.negras;
    }
    if (!Number.isFinite(queda) || queda > 0) return null;
    // ¿El rival tiene con qué dar mate? Con el rey solo, no: serían tablas (art. 6.9).
    const piezas = (p[0] || "").replace(/[^a-zA-Z]/g, "");
    const delRival = color === "blancas" ? piezas.replace(/[^a-z]/g, "") : piezas.replace(/[^A-Z]/g, "");
    return { color, queda: Math.round(queda), jugadas, rivalSoloRey: delRival.length === 1 };
  }
  function alertasBandera(mesas, ronda, ahora, leida, vistas) {
    const out = [];
    for (const m of mesas || []) {
      const b = bandera(m, ahora, leida);
      if (!b) continue;
      const clave = ronda + "|" + m.mesa + "|bandera|" + b.jugadas + "|" + b.color;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      const rival = b.color === "blancas" ? "las negras" : "las blancas";
      out.push({ clave, tipo: "bandera", mesa: m.mesa, color: b.color, texto: "Según la transmisión, a las " + b.color + " de la mesa " + m.mesa + " se les acabó el tiempo y la partida sigue sin resultado. Míralo en el reloj de la mesa: si cayó la bandera, pierden, salvo que el rival no pueda dar mate con ninguna serie de jugadas legales; entonces son tablas (art. 6.9)."
        + (b.rivalSoloRey ? " Ojo: " + rival + " solo tienen el rey, así que serían tablas." : "") });
    }
    return out;
  }

  // Una jugada que el tablero no registró: con el reloj en vivo de LiveChess, el reloj corre para quien, según el tablero,
  // acaba de jugar. Es decir: su rival apretó el reloj, pero el tablero no vio su jugada (una jugada ilegal, o una pieza
  // fuera de su casilla). La misma regla que el encargado de transmisión. Solo cuenta si la lectura del reloj es de
  // después de la última jugada registrada.
  function noRegistrada(m) {
    if (!m || (m.estado && m.estado !== "*") || m.ilegal) return null;
    const r = m.reloj && typeof m.reloj === "object" ? m.reloj : null;
    if (!r || !Number(r.time)) return null;
    const n = (m.legales || m.sans || []).length;
    if (!n) return null;
    const quienJugo = n % 2 === 1 ? "blancas" : "negras";
    const corre = r.run === true ? "blancas" : r.run === false ? "negras" : null;
    const { relojes: rs } = leerJugadas(m.jugadas, m.primera);
    const ultMs = rs.length ? rs[rs.length - 1].ms : null;
    if (corre !== quienJugo || (ultMs != null && Number(r.time) < ultMs - 2000)) return null;
    return { n, corre, sospechoso: quienJugo === "blancas" ? "negras" : "blancas" };
  }
  // El aviso sale si sigue así unos segundos (un reloj apretado justo cuando se lee no es una jugada perdida).
  const ESPERA_NO_REGISTRADA_MS = 8000;
  function alertasNoRegistrada(mesas, ronda, ahora, vistas, pendientes) {
    const out = [];
    for (const m of mesas || []) {
      const x = noRegistrada(m);
      const clave = ronda + "|" + m.mesa + "|noregistrada|" + (x ? x.n : "");
      if (!x) { for (const k of [...pendientes.keys()]) if (k.startsWith(ronda + "|" + m.mesa + "|")) pendientes.delete(k); continue; }
      if (vistas.has(clave)) continue;
      if (!pendientes.has(clave)) { pendientes.set(clave, ahora); continue; }
      if (ahora - pendientes.get(clave) < ESPERA_NO_REGISTRADA_MS) continue;
      vistas.add(clave);
      out.push({ clave, tipo: "ilegal", mesa: m.mesa, color: x.sospechoso, texto: "En la mesa " + m.mesa + " el reloj corre para las " + x.corre + ", que según el tablero ya jugaron: las " + x.sospechoso + " apretaron el reloj, pero el tablero no registró su jugada. Puede ser una jugada ilegal (o una pieza fuera de su casilla). Mira la mesa: si fue ilegal, la primera le da 2 minutos al rival y la segunda pierde la partida (art. 7.5.5)." });
    }
    return out;
  }

  // ---------------------------------------------------------------- el resultado que dice la transmisión
  // Lo que se puede guardar en chess-results ("1" = 1-0, "2" = ½-½, "3" = 0-1, los valores de js/mesa-arbitro.js), con
  // por qué. Nunca se guarda solo: la tablet lo ofrece y el árbitro lo confirma. Con una jugada imposible en la
  // transmisión no se dice nada (lo que sigue no se puede leer). Con `ahora`, también la bandera caída.
  const VALOR = { "1-0": "1", "½-½": "2", "0-1": "3" };
  function sugerencia(m, ahora, leida) {
    if (!m || m.ilegal) return null;
    const dar = (resultado, motivo, por) => ({ valor: VALOR[resultado], resultado, motivo, por });
    if (m.estado === "1-0" || m.estado === "0-1" || m.estado === "½-½") return dar(m.estado, "el resultado que tiene el tablero electrónico", "tablero");
    if (m.estado && m.estado !== "*") return null;
    if (m.fin === "mate") { const p = String(m.fen || "").split(/\s+/); return p[1] === "w" ? dar("0-1", "jaque mate de las negras", "mate") : dar("1-0", "jaque mate de las blancas", "mate"); }
    if (m.fin === "ahogado") return dar("½-½", "ahogado, art. 5.2.1", "ahogado");
    if (m.fin === "muerta") return dar("½-½", "ya nadie puede dar mate: posición muerta, art. 5.2.2", "muerta");
    const t = m.tablas;
    if (t && t.cinco) return dar("½-½", "la misma posición cinco veces, art. 9.6.1", "cinco");
    if (t && t.setentaYCinco) return dar("½-½", "75 jugadas de cada uno sin peón ni captura, art. 9.6.2", "75");
    if (ahora != null) {
      const b = bandera(m, ahora, leida);
      if (b) return b.rivalSoloRey ? dar("½-½", "cayó la bandera de las " + b.color + ", pero al rival solo le queda el rey, art. 6.9", "bandera")
        : dar(b.color === "blancas" ? "0-1" : "1-0", "cayó la bandera de las " + b.color + ", art. 6.9", "bandera");
    }
    return null;
  }

  // ---------------------------------------------------------------- el reclamo de tablas, con las jugadas del tablero
  // ¿Procede un reclamo de triple repetición (art. 9.2) o de 50 jugadas (9.3) AHORA? Quien reclama tiene el turno:
  // o la posición de ahora ya apareció tres veces (9.2.1.2), o va a aparecer con la jugada que anotó y anuncia
  // (`anunciada`, en la notación de la planilla: «Ag7», «Cf3», «O-O»; 9.2.1.1). Lo mismo con las 50 jugadas. Usa
  // js/reclamos-tablas.js (la misma «misma posición» que la página de reclamos).
  const PIEZA_EN = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
  const aIngles = (j) => String(j || "").trim().replace(/^0-0-0/, "O-O-O").replace(/^0-0/, "O-O").replace(/^[RDTAC]/, (x) => PIEZA_EN[x]).replace(/=([DTAC])/, (_, x) => "=" + PIEZA_EN[x]);
  function reclamo(legales, anunciada) {
    const R = RT(), C = raiz.Chess || (enNode ? require("chess.js").Chess : null);
    if (!R || !C) return { error: "Falta la herramienta de reclamos en esta página." };
    const sans = (legales || []).slice();
    let declarada = null;
    if (anunciada && String(anunciada).trim()) {
      const c = new C();
      for (const x of sans) c.move(x, { sloppy: true });
      let h = null;
      try { h = c.move(aIngles(anunciada), { sloppy: true }); } catch (e) { h = null; }
      if (!h) return { error: "«" + String(anunciada).trim() + "» no es una jugada legal en la posición de ahora (según el tablero). Escríbela como en la planilla: Ag7, Cf3, exd5, O-O." };
      declarada = h.san;
    }
    const conTodo = declarada ? sans.concat([declarada]) : sans;
    if (!conTodo.length) return { error: "Todavía no hay jugadas en esta mesa." };
    let a;
    try { a = R.analizar(pgnDe(conTodo)); } catch (e) { a = null; }
    if (!a || a.error || !a.posiciones) return { error: "No se pudieron leer las jugadas de esta mesa." };
    const P = a.posiciones, ahora = P[sans.length], despues = declarada ? P[sans.length + 1] : null;
    const lista = (xs) => xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " y " + xs[xs.length - 1];
    // Dónde apareció: «al empezar y después de 12… Ag7 y 14… Ag7».
    const donde = (ks) => {
      const tras = ks.filter((k) => k > 0).map((k) => a.jugadas[k - 1].rotulo + " " + esp(a.jugadas[k - 1].san));
      const t = tras.length ? "después de " + lista(tras) : "";
      return ks.includes(0) ? "al empezar" + (t ? " y " + t : "") : t;
    };
    const turno = ahora.turno === "w" ? "blancas" : "negras";
    const jugadaTxt = declarada ? a.jugadas[sans.length].rotulo + " " + esp(declarada) : null;
    const veces = (n) => (n === 1 ? "una vez" : n + " veces");
    // Triple repetición
    let triple;
    if (ahora.vez >= 3) triple = { procede: true, texto: "Procede (art. 9.2.1.2): con las " + turno + " al turno, la posición de ahora ya apareció " + veces(ahora.vez) + ": " + donde(ahora.antes) + "." };
    else if (despues && despues.vez >= 3) triple = { procede: true, texto: "Procede si las " + turno + " anotaron " + jugadaTxt + " en la planilla y declararon que la van a hacer, sin hacerla (art. 9.2.1.1): con esa jugada la posición aparece por " + ["", "primera", "segunda", "tercera", "cuarta", "quinta"][Math.min(despues.vez, 5)] + " vez: " + donde(despues.antes) + "." };
    else triple = { procede: false, texto: "No procede: la posición de ahora apareció " + veces(ahora.vez) + (ahora.vez > 1 ? " (" + donde(ahora.antes) + ")" : "") + (despues ? " y la que deja " + jugadaTxt + ", " + veces(despues.vez) : "") + "; hacen falta tres (art. 9.2)." };
    // 50 jugadas
    const cuenta = (p) => Math.floor(p.reloj / 2);
    const desde = (p) => (p.reloj && p.ply - p.reloj + 1 >= 1 ? " (la cuenta empezó con " + a.jugadas[p.ply - p.reloj].rotulo + " " + esp(a.jugadas[p.ply - p.reloj].san) + ")" : "");
    let cincuenta;
    if (ahora.reloj >= 100) cincuenta = { procede: true, texto: "Procede (art. 9.3.2): cada jugador lleva " + cuenta(ahora) + " jugadas sin mover un peón ni capturar" + desde(ahora) + "." };
    else if (despues && despues.reloj >= 100) cincuenta = { procede: true, texto: "Procede si las " + turno + " anotaron " + jugadaTxt + " en la planilla y declararon que la van a hacer (art. 9.3.1): con esa jugada se completan las 50 de cada uno sin peón ni captura" + desde(despues) + "." };
    else cincuenta = { procede: false, texto: "No procede: llevan " + cuenta(despues && despues.reloj > ahora.reloj ? despues : ahora) + " jugadas de cada uno sin mover un peón ni capturar" + desde(despues && despues.reloj > ahora.reloj ? despues : ahora) + "; hacen falta 50 (art. 9.3)." };
    return { turno, declarada: jugadaTxt, fen: (despues || ahora).fen, triple, cincuenta };
  }

  // ---------------------------------------------------------------- el ensayo: partidas que corren solas, para practicar
  // Para que el árbitro vea cada aviso antes del torneo, sin tableros: cinco «mesas de ensayo» que avanzan una jugada
  // cada pocos segundos y terminan en lo que hay que practicar. Las jugadas están comprobadas con chess.js
  // (verificar-centroamericano-mesas-vivo.js): la triple repetición es la de verdad, la imposible lo es de verdad.
  // En el ensayo NADA se anota (ni en chess-results ni en la bitácora): los botones dicen qué harían en una ronda.
  const PASO_MS = 3000;   // en segundos enteros: LiveChess manda lo pensado sin decimales
  const ENSAYO_MS = 4 * 60000;
  const ESCENARIOS = [
    { mesa: 1, que: "triple", base: 5400, inc: 30, desde: 30,
      sans: "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Na5 Bc2 c5 d4 Qc7 Nbd2 Bd7 Nf1 Rfe8 Ng3 g6 Bg5 Bf8 Qd2 Bg7 Bh6 Bh8 Bg5 Bg7 Bh6 Bh8 Bg5 Bg7" },
    { mesa: 2, que: "mate", base: 5400, inc: 30, desde: 2, sans: "e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#" },
    { mesa: 3, que: "bandera", base: 25, inc: 0, desde: 2, sans: "e4 e5 Nf3 Nc6 Bc4 Bc5" },
    { mesa: 4, que: "imposible", base: 5400, inc: 30, desde: 8, sans: "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 Ke3 h6" },
    { mesa: 5, que: "noregistrada", base: 5400, inc: 30, desde: 2, sans: "d4 d5 c4 e6 Nc3 Nf6" },
  ];
  // Las mesas del ensayo a la hora `ahora`, con la forma de lo que contesta la función (LiveChess).
  function datosEnsayo(inicio, ahora) {
    const gasto = PASO_MS / 1000;
    const mesas = ESCENARIOS.map((e) => {
      const todas = e.sans.split(" ");
      const n = Math.min(todas.length, e.desde + Math.max(0, Math.floor((ahora - inicio) / PASO_MS)));
      const primera = inicio - (e.desde - 1) * PASO_MS;
      const rel = { blancas: e.base, negras: e.base };
      const jugadas = todas.slice(0, n).map((s, i) => {
        const color = i % 2 === 0 ? "blancas" : "negras";
        if (i > 1) rel[color] = rel[color] - gasto + e.inc;
        return s + " " + Math.round(rel[color]) + "+" + (i === 0 ? 0 : gasto);
      });
      const ultMs = primera + Math.max(0, n - 1) * PASO_MS;
      const terminada = n === todas.length;
      // El reloj de la mesa: corre para quien tiene el turno; en «noregistrada», al final corre para quien ya jugó
      // (su rival apretó el reloj, pero el tablero no vio la jugada).
      const turnoBlancas = n % 2 === 0;
      const run = e.que === "noregistrada" && terminada ? !turnoBlancas : turnoBlancas;
      return { mesa: e.mesa, fuente: "livechess", ensayo: e.que, jugadas, primera, en_vivo: true, estado: "*",
        reloj: { white: Math.round(rel.blancas), black: Math.round(rel.negras), run, time: e.que === "noregistrada" && terminada ? ultMs + 1000 : ultMs } };
    });
    return { ok: true, conectada: true, fuente: "livechess", ronda: "ensayo", delay: 0, ensayo: true, mesas, no_reconoce: [] };
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
  let ensayo = null;   // { inicio, antes: { datos, leidaMs, conectada } } mientras se ensaya
  const vistas = new Set();
  const pendientesIlegal = new Map();   // las jugadas no registradas que se están esperando (alertasNoRegistrada)

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

  // El ensayo no pide nada: arma sus mesas a esta hora (sin `await`, así que va aparte de `pidiendo`).
  function leerEnsayo() {
    if (Date.now() - ensayo.inicio > ENSAYO_MS) { terminarEnsayo(); return datos; }
    leidaMs = ultimaLectura = preguntado = Date.now();
    datos = Object.assign({}, datosEnsayo(ensayo.inicio, leidaMs));
    datos.mesas = datos.mesas.map((m) => normalizar(m, leidaMs));
    alertasNuevas(datos.mesas, "ensayo", vistas).forEach((a) => o.alAlertar && o.alAlertar(Object.assign(a, { ensayo: true }), {}));
    pintar();
    return datos;
  }

  function leer() {
    if (ensayo) return Promise.resolve(leerEnsayo());
    if (pidiendo) return pidiendo;
    pidiendo = (async () => {
      try {
        const { data, error } = await raiz.sb.functions.invoke("centroamericano-mesas-vivo", { body: { action: "mesas", arbitro_token: o.token() } });
        preguntado = Date.now();
        if (ensayo) return datos;   // empezó un ensayo mientras se leía: lo real se guarda para después
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
        if (o.alActualizar) o.alActualizar();
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
    aviso.push(el("p", { class: "text-sm cv-hora", role: "status", texto: (datos.ensayo ? "Ensayo" : "Sin atraso" + (datos.fuente === "livechess" ? " (LiveChess)" : "")) + " · leído a las " + raiz.HoraCR.hora(new Date(leidaMs).toISOString(), { hour: "numeric", minute: "2-digit", second: "2-digit" }) + " · se actualiza cada " + (datos.ensayo ? PASO_MS / 1000 : 10) + " s." }));
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
        bandera(m, ahora, leidaMs) ? "Bandera caída: a las " + bandera(m, ahora, leidaMs).color + " se les acabó el tiempo." : "",
        m.ilegal ? "Jugada imposible en la transmisión (" + m.ilegal.jugada + "): ¿una jugada ilegal?" : noRegistrada(m) ? "El tablero no registró la última jugada de las " + noRegistrada(m).sospechoso + ": ¿una jugada ilegal?" : "",
      ].filter(Boolean).join(" ");
      const sug = sugerencia(m, ahora, leidaMs);
      return el("article", { class: "cv-mesa", "data-mesa": String(m.mesa), "data-repeticion": rep ? "si" : null },
        el("p", { class: "cv-mesa-titulo" }, el("strong", { texto: (datos.ensayo ? "Mesa de ensayo " : "Mesa ") + m.mesa })),
        tab,
        el("p", { class: "text-sm cv-texto", texto: texto(m, ahora, leidaMs) }),
        rep ? el("p", { class: "text-sm cv-repeticion", texto: "⚖ " + rep }) : null,
        sug ? el("p", { class: "text-sm cv-sugerencia", texto: "🏁 Según la transmisión: " + sug.resultado + " (" + sug.motivo + ")." }) : null,
        (m.legales || []).length ? el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "reclamo", onclick: () => revisarReclamo(m.mesa) }, "⚖ Reclamo de tablas") : null,
        raiz.TableroFen && m.fen ? el("p", { class: "sr-only", texto: raiz.TableroFen.describir(m.fen) }) : null);
    });
    // No repintar bajo el dedo: lo único que cambia cada segundo es el texto de los relojes.
    if (datos.ensayo) aviso.unshift(el("p", { class: "cv-ensayo", role: "status" }, el("strong", { texto: "ENSAYO: " }), "estas mesas no existen; corren solas para que veas cada aviso. No se anota nada. Los avisos reales de tus mesas no llegan mientras ensayas. ",
      el("button", { type: "button", class: "cam-btn cam-btn-chico", "data-accion": "terminar-ensayo", onclick: () => terminarEnsayo() }, "Terminar el ensayo")));
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

  // El reclamo de tablas de una mesa: el árbitro escribe (si la hay) la jugada que el jugador anotó y anuncia.
  async function revisarReclamo(mesa) {
    const A = raiz.Avisos;
    const m = datos && datos.mesas.find((x) => x.mesa === Number(mesa));
    if (!A || !m) return;
    const turno = String(m.fen || "").split(/\s+/)[1] === "b" ? "negras" : "blancas";
    const r1 = await A.formulario({
      titulo: "Reclamo de tablas · " + (datos.ensayo ? "mesa de ensayo " : "mesa ") + mesa,
      texto: "Con las jugadas que registró el tablero (" + (m.legales || []).length + " jugadas a medias). Le toca a las " + turno + ": quien reclama tiene el turno.",
      campos: [{ nombre: "jugada", etiqueta: "Si reclama con una jugada que anotó y todavía no hizo, escríbela (opcional: Ag7, Cf3, O-O)", max: 10 }],
      aceptar: "Revisar el reclamo",
    });
    if (r1 === null) return;
    const r = reclamo(m.legales, r1.jugada);
    if (r.error) { await A.alerta(r.error, { titulo: "No se pudo revisar", aceptar: "Entendido" }); return; }
    await A.alerta("Triple repetición: " + r.triple.texto + "\n\n50 jugadas: " + r.cincuenta.texto + "\n\nEs una ayuda con lo que registró el tablero: compáralo con las planillas antes de decidir. Si un reclamo no procede, al rival se le suman 2 minutos y, si había una jugada anunciada, hay que hacerla (art. 9.5).",
      { titulo: (r.triple.procede && r.cincuenta.procede ? "Procede por las dos" : r.triple.procede ? "Procede por triple repetición" : r.cincuenta.procede ? "Procede por las 50 jugadas" : "No procede") + " · mesa " + mesa, aceptar: "Entendido" });
  }

  // El ensayo: mientras dura, la tablet lee las mesas de ensayo y no la transmisión (lo real vuelve al terminar).
  function iniciarEnsayo() {
    if (ensayo) { abrir(); return; }
    for (const k of [...vistas]) if (k.startsWith("ensayo|")) vistas.delete(k);
    for (const k of [...pendientesIlegal.keys()]) if (k.startsWith("ensayo|")) pendientesIlegal.delete(k);
    ensayo = { inicio: Date.now(), antes: { datos, leidaMs, conectada } };
    conectada = true;
    datos = null;
    pidiendo = null;
    abrir();
  }
  function terminarEnsayo() {
    if (!ensayo) return;
    const a = ensayo.antes;
    ensayo = null;
    datos = a.datos; leidaMs = a.leidaMs; conectada = a.conectada;
    preguntado = 0; ultimaLectura = 0;
    if (o && o.boton) o.boton.hidden = !conectada;
    if (o && o.alTerminarEnsayo) o.alTerminarEnsayo();
    if (dialogo && dialogo.open) dialogo.close();
    setTimeout(leer, 0);
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
      // La bandera se mira cada segundo (el reloj corre entre lecturas), pero solo con datos de hace menos de 30 s:
      // sin señal, una lectura vieja no puede dar una bandera que no cayó.
      if (conectada && datos && o.alAlertar && Date.now() - leidaMs < 30000) {
        const marca = (a) => (datos.ensayo ? Object.assign(a, { ensayo: true }) : a);
        alertasBandera(datos.mesas, datos.ronda, Date.now(), leidaMs, vistas).forEach((a) => o.alAlertar(marca(a), {}));
        alertasNoRegistrada(datos.mesas, datos.ronda, Date.now(), vistas, pendientesIlegal).forEach((a) => o.alAlertar(marca(a), {}));
      }
      // En el modo liviano (tablet vieja o lenta, js/modo-liviano.js), con transmisión cada 20 s en vez de 10.
      const lenta = raiz.ModoLiviano && raiz.ModoLiviano.activo();
      const espera = ensayo ? PASO_MS : conectada ? (lenta ? 2 * CADA_MS : CADA_MS) : SIN_CONEXION_MS;
      if (Date.now() - Math.max(preguntado, ultimaLectura) >= espera) leer();
    }, 1000);
  }

  // La última lectura de una mesa (o null), con la hora en que se leyó: para el control de tiempos y el reloj apagado.
  function deLaMesa(mesa) {
    if (ensayo || !conectada || !datos) return null;
    const m = datos.mesas.find((x) => x.mesa === Number(mesa));
    return m ? { m, leida: leidaMs, delay: datos.delay || 0 } : null;
  }
  function noReconoce(mesa) {
    if (ensayo || !conectada || !datos) return null;
    const x = (datos.no_reconoce || []).find((y) => y.mesa === Number(mesa));
    return x ? x.motivo : null;
  }

  // La sugerencia de resultado de una mesa real (para su tarjeta), con la bandera calculada a esta hora.
  function sugerenciaDe(mesa) {
    const v = deLaMesa(mesa);
    return v && Date.now() - v.leida < 60000 ? sugerencia(v.m, Date.now(), v.leida) : null;
  }

  const api = { relojes, lectura, texto, hms, leerJugadas, control, tablas, normalizar, alertasNuevas, bandera, alertasBandera, noRegistrada, alertasNoRegistrada, pgnDe, esp,
    sugerencia, reclamo, aIngles, datosEnsayo, ESCENARIOS, PASO_MS,
    iniciar, leer, abrir, deLaMesa, noReconoce, sugerenciaDe, revisarReclamo, iniciarEnsayo, terminarEnsayo, enEnsayo: () => !!ensayo, conectada: () => conectada };
  if (enNode) module.exports = api;
  else raiz.CentroamericanoArbitroVivo = api;
})(typeof self !== "undefined" ? self : this);
