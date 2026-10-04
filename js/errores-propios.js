/* «Tus propios errores» (tipo 18 de entreno/tipos.html): los errores de las
 * partidas del alumno, convertidos en ejercicios.
 *
 * De dónde salen las partidas (las dos las deja leer la RLS al propio alumno):
 *   - game_rooms: Juegos, retos, parejas de la clase y torneos. Solo las de
 *     ajedrez normal (variant = 'estandar') y terminadas. No guarda la posición
 *     de inicio: se reproduce desde la inicial y, si alguna jugada no es legal
 *     (la partida empezó «desde el tablero»), la partida se deja fuera.
 *   - practice_games: la práctica contra el motor en la clase. La posición de
 *     inicio está en practice_sessions (la leen los alumnos de quien la creó).
 *   - partidas_torneo: las de torneo en tablero que el alumno anota de su
 *     planilla (leerJugadas() las comprueba con chess.js antes de guardarlas).
 *   - Lichess y Chess.com: si el alumno escribe su usuario, sus últimas
 *     partidas públicas (PreparacionDescarga, la misma de la preparación de
 *     rivales; solo sale el nombre de usuario). `deLaWeb()` las convierte.
 *
 * El análisis corre en el navegador del alumno (PreparacionMotor: el mismo
 * Stockfish de la preparación de rivales). Primero una pasada corta por
 * todas las posiciones; en las jugadas donde la evaluación se cayó, una
 * mirada más honda con varias líneas, que decide cuáles jugadas «también
 * servían». Un error que la mirada honda no confirma se descarta.
 *
 * Cada error lleva además su TEMA, con el mismo reconocedor de patrones de la
 * preparación de rivales (PreparacionTactica.temaDeJugada, sin motor): si se
 * le escapó la ventaja, el de la mejor jugada que no vio; si regaló, el de la
 * respuesta con que lo castiga el rival. `temasDe()` cuenta cuál se repite y
 * a qué tema de «Ejercicios por tema» manda a practicar.
 *
 * Lo que queda (los ejercicios y qué partidas ya se miraron) va en dos claves
 * de localStorage que viajan con la cuenta (js/progreso-usuario.js): el
 * alumno las ve en cualquier aparato y su profesor las puede leer
 * (training_state). No se guarda el nombre del rival: solo la posición, la
 * jugada que se hizo y las buenas.
 *
 * `detectar()`, `ejercicio()` y `deFilas()` son puras (sin DOM ni motor): las
 * prueba herramientas/verificar-errores-propios.js en Node.
 *
 * Informes (js/informes.js) lee lo mismo desde training_state para mostrárselo
 * al profesor: `deFilas()` convierte esas filas en la lista, sin creerle nada
 * (lo escribió el navegador del alumno).
 */
(function (raiz) {
  "use strict";

  const CLAVE_EJERCICIOS = "errores_propios_v1";   // id → ejercicio
  const CLAVE_VISTAS = "errores_analizadas_v1";    // "juego:<id>" / "practica:<id>" / "lichess:<id>" / "chesscom:<id>" → cuándo se miró
  const MAX_PARTIDAS = 10;                         // por cada vez que se busca
  const MAX_EJERCICIOS = 60;                       // los más recientes
  const POR_PARTIDA = 3;                           // los errores más grandes de cada partida
  const PROF_PASADA = 10;
  const PROF_HONDA = 14;
  /* Los cortes, en centipeones desde el lado del alumno. */
  const CORTE = {
    tope: 1000,          // un mate cuenta como ±10: más no cambia nada
    caida: 200,          // perder 2 peones o más en una jugada
    ok: -150,            // «estaba bien»: no peor que −1,5
    malo: -100,          // y quedó mal: −1 o peor
    ganaba: 200,         // «ganaba»: +2 o más
    yaNo: 150,           // y ya no: menos de +1,5
    buena: 50,           // una jugada «también sirve» si queda a menos de 0,5 de la mejor
  };

  const tope = (cp) => Math.max(-CORTE.tope, Math.min(CORTE.tope, Math.round(cp)));

  /* evals[i]: evaluación en centipeones DESDE LAS BLANCAS de la posición antes
     de la media jugada i (hay una más que jugadas: la del final). `turno0` es
     quién mueve en la posición inicial. Devuelve los errores del alumno:
     [{ ply, antes, despues, perdida, nivel }] con antes/despues desde su lado.
       nivel 1 «Lo que regalaste»: estaba bien y quedó mal.
       nivel 2 «Lo que se te escapó»: ganaba y ya no. */
  function detectar(evals, colorAlumno, turno0) {
    const s = colorAlumno === "w" ? 1 : -1;
    const out = [];
    for (let i = 0; i + 1 < evals.length; i++) {
      const mueve = (i % 2 === 0) ? turno0 : (turno0 === "w" ? "b" : "w");
      if (mueve !== colorAlumno) continue;
      if (evals[i] === null || evals[i + 1] === null || evals[i] === undefined || evals[i + 1] === undefined) continue;
      const antes = tope(s * evals[i]), despues = tope(s * evals[i + 1]);
      const perdida = antes - despues;
      if (perdida < CORTE.caida) continue;
      let nivel = null;
      if (antes >= CORTE.ok && antes < CORTE.ganaba && despues <= CORTE.malo) nivel = 1;
      else if (antes >= CORTE.ganaba && despues < CORTE.yaNo) nivel = 2;
      if (nivel) out.push({ ply: i, antes, despues, perdida, nivel });
    }
    return out.sort((a, b) => b.perdida - a.perdida).slice(0, POR_PARTIDA).sort((a, b) => a.ply - b.ply);
  }

  /* Con lo que dijo la mirada honda ([{ san, eval desde las blancas, en
     peones }], de la mejor a la peor), arma el ejercicio o dice que no:
     la jugada que se hizo no puede estar entre las buenas, y la mejor tiene
     que dejar al alumno 2 peones o más por encima de lo que jugó. */
  /* `tema` (opcional): la clave de PreparacionTactica.TEMAS que ya se calculó;
     «otra» no se guarda (no dice nada). */
  function ejercicio(partida, error, fen, jugada, opciones, tema) {
    if (!opciones || !opciones.length) return null;
    const s = partida.color === "w" ? 1 : -1;
    const cp = (o) => tope(s * o.eval * 100);
    const mejor = cp(opciones[0]);
    const limpia = (san) => String(san).replace(/[+#]$/, "");
    const buenas = opciones.filter((o) => cp(o) >= mejor - CORTE.buena).map((o) => limpia(o.san));
    if (buenas.indexOf(limpia(jugada)) >= 0) return null;          // la honda dice que no era error
    if (mejor - error.despues < CORTE.caida) return null;          // ni tan grave
    const numero = Math.floor(error.ply / 2) + 1;
    return {
      id: partida.clave.replace(":", "-") + "-" + error.ply, nivel: error.nivel,
      fen, jugada: limpia(jugada), buenas, mejor: buenas[0],
      antes: mejor, despues: error.despues, fecha: partida.fecha, origen: partida.origen,
      resumen: (ORIGEN[partida.origen] || "Partida") + " del " + fechaCorta(partida.fecha) + " · jugada " + numero,
      tema: tema && tema !== "otra" ? tema : null,
      // El reloj, si la partida lo trae (Lichess y Chess.com): los segundos que
      // le quedaban DESPUÉS de hacer la jugada, y el tiempo con que empezó.
      ...(relojDe(partida, error.ply) || {}),
    };
  }
  function relojDe(partida, ply) {
    const r = partida.relojes && partida.relojes[ply];
    const base = partida.control && partida.control.base;
    return typeof r === "number" && r >= 0 && typeof base === "number" && base > 0 ? { reloj: r, base } : null;
  }
  /* ¿Lo jugó apurado? Con menos de 30 segundos, o con menos del 10 % del
     tiempo con que empezó (en una de 3 minutos, 18 segundos). */
  const APURADO = { segundos: 30, parte: 0.1 };
  function apurado(x) {
    return !!x && typeof x.reloj === "number" && typeof x.base === "number" && x.base > 0 &&
      (x.reloj < APURADO.segundos || x.reloj < x.base * APURADO.parte);
  }

  /* El tema de un error, con el reconocedor de la preparación de rivales
     (T = PreparacionTactica). Nivel 2: la mejor jugada, la que no vio.
     Nivel 1: la respuesta del rival después de su jugada, la que lo castiga
     (`castigo`, en SAN; con chess.js se le devuelve el «#» si da mate). */
  function temaDelError(T, Chess, nivel, fen, mejor, jugada, castigo) {
    if (!T) return null;
    try {
      if (nivel === 2) return T.temaDeJugada(fen, sanCompleta(Chess, fen, mejor));
      const g = new Chess(fen);
      if (!g.move(jugada) || !castigo) return null;
      return T.temaDeJugada(g.fen(), sanCompleta(Chess, g.fen(), castigo));
    } catch (e) { return null; }
  }
  function sanCompleta(Chess, fen, san) {
    const m = new Chess(fen).move(san);
    return m ? m.san : san;
  }

  /* Los temas de una lista de ejercicios, del que más se repite al que menos:
     [{ tema, n, nombre, plural, practica }]. `TEMAS` es PreparacionTactica.TEMAS
     (los nombres y el tema de «Ejercicios por tema» para practicar). */
  function temasDe(ejercicios, TEMAS) {
    const cuenta = {};
    (ejercicios || []).forEach((x) => { if (x && x.tema && TEMAS && TEMAS[x.tema]) cuenta[x.tema] = (cuenta[x.tema] || 0) + 1; });
    return Object.keys(cuenta).map((t) => Object.assign({ tema: t, n: cuenta[t] }, TEMAS[t]))
      .sort((a, b) => b.n - a.n || (a.tema < b.tema ? -1 : 1));
  }
  function fechaCorta(iso) {
    try { return new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" }); } catch (e) { return ""; }
  }

  /* ---------- la apertura ----------
     Un error de las primeras 10 jugadas es de la apertura: ahí lo que ayuda
     no es tanto el tema táctico como saber la línea. Se mira con la POSICIÓN
     (piezas, turno, enroques y al paso), no con las jugadas: así sirve también
     para los ejercicios ya guardados, que no guardan la partida, y encuentra
     la línea aunque se haya llegado por otro orden. */
  const JUGADAS_DE_APERTURA = 10;
  function enLaApertura(fen) {
    const n = Number(String(fen || "").split(" ")[5]);
    return n >= 1 && n <= JUGADAS_DE_APERTURA;
  }
  const claveFen = (fen) => String(fen).split(" ").slice(0, 4).join(" ");
  const limpiaSan = (san) => String(san || "").replace(/[+#!?]+$/, "");
  const posicionesDeLineas = new Map();   // LINEAS → Map(clave de posición → [{ linea, jugada }])
  function indiceDeLineas(Chess, LINEAS) {
    if (posicionesDeLineas.has(LINEAS)) return posicionesDeLineas.get(LINEAS);
    const mapa = new Map();
    (LINEAS || []).forEach((L) => {
      const g = new Chess();
      for (const san of L.jugadas || []) {
        const k = claveFen(g.fen());
        if (!mapa.has(k)) mapa.set(k, []);
        mapa.get(k).push({ linea: L, jugada: limpiaSan(san) });
        if (!g.move(san)) break;
      }
    });
    posicionesDeLineas.set(LINEAS, mapa);
    return mapa;
  }
  /* La línea del banco de Aperturas (js/aperturas-lineas.js, LINEAS) que pasa
     por la posición de un error, o null:
       { caso: "celada", linea }   cayó en una celada del rival: la línea es
                                   del otro color y espera JUSTO la jugada que
                                   hizo el alumno;
       { caso: "teoria", linea, jugada, buena }   la línea es de su color y
                                   ahí sigue con `jugada` (`buena`: está entre
                                   las que el motor dio por buenas).
     Primero la celada (es lo que explica el error), después la teoría con una
     jugada buena, después cualquier teoría. Pura: sin DOM. */
  function lineaDeApertura(Chess, item, LINEAS) {
    if (!item || !item.fen || !LINEAS || !enLaApertura(item.fen)) return null;
    const turno = item.fen.split(" ")[1];
    const aca = indiceDeLineas(Chess, LINEAS).get(claveFen(item.fen)) || [];
    const hizo = limpiaSan(item.jugada);
    const buenas = (item.buenas || []).map(limpiaSan);
    const celada = aca.find((x) => x.linea.color !== turno && x.linea.tipo === "celada" && x.jugada === hizo);
    if (celada) return { caso: "celada", linea: celada.linea };
    const propias = aca.filter((x) => x.linea.color === turno && x.jugada !== hizo);
    const conBuena = propias.find((x) => buenas.indexOf(x.jugada) >= 0);
    const t = conBuena || propias[0];
    return t ? { caso: "teoria", linea: t.linea, jugada: t.jugada, buena: !!conBuena } : null;
  }

  /* La celada del banco de Aperturas en que cayó, guardada en el ejercicio
     (`celada`: el id de la línea, o null si no fue una) para que Informes pueda
     contar en la base las del grupo. Que la clave esté, aunque sea null, dice
     que ya se miró: completarCeladas() mira las que se guardaron antes. */
  function conCelada(x, LINEAS) {
    if (!x || !LINEAS || !raiz.Chess || Object.prototype.hasOwnProperty.call(x, "celada")) return x;
    const r = lineaDeApertura(raiz.Chess, x, LINEAS);
    return Object.assign({}, x, { celada: r && r.caso === "celada" ? r.linea.id : null });
  }
  function completarCeladas(LINEAS) {
    if (!LINEAS) return 0;
    const faltan = ejercicios().filter((x) => !Object.prototype.hasOwnProperty.call(x, "celada"));
    if (faltan.length) guardar(faltan.map((x) => conCelada(x, LINEAS)));
    return faltan.length;
  }

  /* ---------- el final ----------
     Un error con poco material (esFinal de PreparacionPosiciones: cada lado
     con 13 puntos de piezas o menos y dos piezas como mucho) es de un final, y
     el tipo (de torres, de peones…) dice cuál practicar en Finales contra la
     máquina. Los de la apertura no cuentan acá. `Pos` = PreparacionPosiciones. */
  function finalDelError(Pos, fen) {
    if (!Pos || !fen || enLaApertura(fen)) return null;
    try {
      const pz = Pos.piezas(Pos.desdeFen(fen));
      if (!Pos.esFinal(pz)) return null;
      const tipo = Pos.tipoDeFinal(pz);
      return { tipo, grupo: grupoDeFinal(tipo) };
    } catch (e) { return null; }
  }
  // Los alfiles del mismo color, de distinto color o sueltos son «de alfiles»:
  // en el banco hay pocos de cada uno.
  function grupoDeFinal(tipo) { return /^de alfiles/.test(tipo) ? "de alfiles" : tipo; }
  /* El final del banco (entreno/data/finales.json) del mismo grupo, para el
     enlace ?final=<id>: el primero que todavía no logró, o si ya los logró
     todos, el primero. null si en el banco no hay de ese tipo. */
  function finalDelBanco(Pos, FINALES, grupo, logrados) {
    const delGrupo = (FINALES || []).filter((f) => { const r = finalDelErrorSinApertura(Pos, f.fen); return r && r.grupo === grupo; });
    if (!delGrupo.length) return null;
    return (delGrupo.find((f) => !(logrados && logrados[f.id])) || delGrupo[0]).id;
  }
  // Los del banco empiezan en la jugada 1 del FEN: no se les aplica el corte de la apertura.
  function finalDelErrorSinApertura(Pos, fen) {
    try { const pz = Pos.piezas(Pos.desdeFen(fen)); return Pos.esFinal(pz) ? { grupo: grupoDeFinal(Pos.tipoDeFinal(pz)) } : null; } catch (e) { return null; }
  }

  /* ---------- la curva: ¿cometes menos errores? ----------
     Por mes de la partida (la hora de Costa Rica), cuántas partidas se
     revisaron y cuántos errores salieron de cada nivel. Sale de lo que guarda
     marcar() en las revisadas (ver arriba): las viejas, sin cuenta, no entran.
     Devuelve los últimos `meses` que tienen alguna partida, del más viejo al
     más nuevo: [{ mes: "2026-09", partidas, regalados, escapados, porPartida }].
     Pura (la prueba verificar-errores-propios.js). */
  const MES_CR = (iso) => { try { return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" }).slice(0, 7); } catch (e) { return null; } };
  function curva(vistasObj, meses) {
    const por = {};
    Object.values(vistasObj || {}).forEach((v) => {
      if (!v || typeof v !== "object" || typeof v.f !== "string") return;
      const e1 = Number(v.e1), e2 = Number(v.e2);
      if (!Number.isInteger(e1) || !Number.isInteger(e2) || e1 < 0 || e2 < 0 || e1 + e2 > 10) return;
      const mes = MES_CR(v.f);
      if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return;
      const m = por[mes] || (por[mes] = { mes, partidas: 0, regalados: 0, escapados: 0 });
      m.partidas += 1; m.regalados += e1; m.escapados += e2;
    });
    return Object.keys(por).sort().slice(-(meses || 6)).map((k) => Object.assign(por[k], { porPartida: (por[k].regalados + por[k].escapados) / por[k].partidas }));
  }
  /* Qué dice la curva, en una frase, o null si no hay con qué comparar: el
     último mes contra el promedio de los anteriores, con 3 partidas o más en
     cada lado (con menos, un mes malo lo decide todo). */
  function tendencia(c) {
    if (!c || c.length < 2) return null;
    const ultimo = c[c.length - 1];
    const antes = c.slice(0, -1);
    const nAntes = antes.reduce((t, m) => t + m.partidas, 0);
    if (ultimo.partidas < 3 || nAntes < 3) return null;
    const pAntes = antes.reduce((t, m) => t + m.regalados + m.escapados, 0) / nAntes;
    const d = ultimo.porPartida - pAntes;
    return { antes: pAntes, ahora: ultimo.porPartida, sentido: Math.abs(d) < 0.25 ? "igual" : d < 0 ? "mejor" : "peor" };
  }

  /* La curva en pantalla, para la ficha del alumno (habla "tu") y para
     Informes (habla "su"): una fila por mes con la barra (decorativa: el
     número va escrito) y la frase de tendencia(). null con menos de dos meses. */
  function curvaEnPantalla(c, habla) {
    if (typeof document === "undefined" || !c || c.length < 2) return null;
    const su = habla === "su";
    const num = (n) => n.toLocaleString("es-CR", { maximumFractionDigits: 1, minimumFractionDigits: n % 1 ? 1 : 0 });
    const nodo = (tag, cls, texto) => { const e = document.createElement(tag); if (cls) e.className = cls; if (texto != null) e.textContent = texto; return e; };
    const caja = nodo("div", "mb-3");
    caja.setAttribute("data-curva", "");
    caja.appendChild(nodo("p", "text-sm font-semibold text-brand-700 dark:text-brand-200 mb-1", su ? "¿Comete menos errores? Errores por partida revisada, mes a mes:" : "¿Cometes menos errores? Errores por partida revisada, mes a mes:"));
    const max = Math.max.apply(null, c.map((m) => m.porPartida)) || 1;
    const ul = nodo("ul", "space-y-1");
    c.forEach((m) => {
      const li = nodo("li", "flex items-center gap-2 text-sm text-brand-700 dark:text-brand-200");
      const nombre = new Date(m.mes + "-15T12:00:00Z").toLocaleDateString("es-CR", { month: "long", year: "numeric", timeZone: "UTC" });
      li.appendChild(nodo("span", "w-36 shrink-0", nombre));
      const barra = nodo("span", "h-2 rounded bg-accent-500 inline-block");
      barra.style.width = Math.max(2, Math.round((m.porPartida / max) * 100)) + "px";
      barra.setAttribute("aria-hidden", "true");
      li.appendChild(barra);
      li.appendChild(nodo("span", null, num(m.porPartida) + " por partida · " + m.partidas + (m.partidas === 1 ? " partida" : " partidas")));
      ul.appendChild(li);
    });
    caja.appendChild(ul);
    const t = tendencia(c);
    if (t) caja.appendChild(nodo("p", "text-sm text-brand-700 dark:text-brand-200 mt-1",
      t.sentido === "mejor" ? (su ? "Va" : "Vas") + " mejorando: de " + num(t.antes) + " a " + num(t.ahora) + " errores por partida."
        : t.sentido === "peor" ? "Este mes salieron más errores por partida (de " + num(t.antes) + " a " + num(t.ahora) + "). Revisarlos es justo lo que ayuda."
        : "Parejo: alrededor de " + num(t.ahora) + " errores por partida."));
    return caja;
  }

  /* ---------- Lichess y Chess.com, en el navegador ----------
     El usuario que se escribió queda SOLO en ese aparato (no va en
     progreso-usuario.js: no hace falta que viaje con la cuenta ni que lo vea su
     profesor). El descargador y el lector de PGN son los de la preparación de
     rivales; pesan (~100 KB), así que se cargan recién al pedirlos, desde la
     misma carpeta que este archivo. */
  const CLAVE_CUENTA_WEB = "errores_cuenta_web_v1";
  const CLAVE_WEB_MIRADA = "errores_web_mirada_v1";   // lo último que se miró para el aviso del hub
  const SITIO_WEB = { lichess: "Lichess", chesscom: "Chess.com" };
  const MAX_WEB = 30;
  // En orden, con el nombre con que queda cada uno: se carga solo el que falta
  // (Tipos ya trae posiciones y táctica; el hub, no).
  const MODULOS_WEB = [["preparacion-lineas.js", "PreparacionLineas"], ["preparacion-posiciones.js", "PreparacionPosiciones"],
    ["preparacion-libro.js", "PreparacionLibro"], ["preparacion-tactica.js", "PreparacionTactica"], ["preparacion-estructuras.js", "PreparacionEstructuras"],
    ["preparacion-analisis.js", "PreparacionAnalisis"], ["preparacion-descarga.js", "PreparacionDescarga"]];
  const esteArchivo = typeof document !== "undefined" && document.currentScript ? document.currentScript.src : "";
  function cuentaWeb() {
    try { const o = JSON.parse(localStorage.getItem(CLAVE_CUENTA_WEB) || "{}"); return SITIO_WEB[o.sitio] && typeof o.usuario === "string" ? o : { sitio: "lichess", usuario: "" }; } catch (e) { return { sitio: "lichess", usuario: "" }; }
  }
  function guardarCuentaWeb(sitio, usuario) {
    try { localStorage.setItem(CLAVE_CUENTA_WEB, JSON.stringify({ sitio, usuario })); localStorage.removeItem(CLAVE_WEB_MIRADA); } catch (e) {}
  }
  let cargaWeb = null;
  function cargarWeb() {
    if (raiz.PreparacionAnalisis && raiz.PreparacionDescarga) return Promise.resolve();
    if (cargaWeb) return cargaWeb;
    const base = esteArchivo ? esteArchivo.replace(/errores-propios\.js(\?.*)?$/, "") : "../js/";
    cargaWeb = MODULOS_WEB.filter(([, global]) => !raiz[global]).reduce((antes, [nombre]) => antes.then(() => new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = base + nombre;
      s.onload = ok;
      s.onerror = () => mal(new Error("no cargó " + nombre));
      document.head.appendChild(s);
    })), Promise.resolve()).catch((e) => { cargaWeb = null; throw e; });
    return cargaWeb;
  }

  /* ---------- el aviso del hub: partidas sin revisar ----------
     Cuántas partidas terminadas de 10 jugadas o más todavía no se revisaron:
     las de la Academia (Juegos y la práctica de la clase, las mismas de
     traerPartidas) y, si guardó su usuario, las de Lichess o Chess.com.
     A esos sitios se les pregunta como mucho cada `HORAS_WEB` horas: entre
     tanto se usa la lista de lo último que se miró (las claves), así que lo
     que se revisa deja de contar sin volver a preguntar.
     → { juego, web, sitio } (web null si no hay usuario o no contestó). */
  const HORAS_WEB = 6;
  const MAX_AVISO_WEB = 15;
  async function sinRevisar(sb, uid, o) {
    const vistasYa = vistas();
    const cuenta = (lista) => lista.filter((p) => !vistasYa[p.clave] && p.jugadas.length >= 10).length;
    let juego = 0;
    try { juego = cuenta(await traerPartidas(sb, uid)); } catch (e) { juego = 0; }
    const c = cuentaWeb();
    if (!c.usuario) return { juego, web: null, sitio: null };
    let mirada = null;
    try { mirada = JSON.parse(localStorage.getItem(CLAVE_WEB_MIRADA) || "null"); } catch (e) { mirada = null; }
    const ahora = (o && o.ahora) || Date.now();
    const vigente = mirada && mirada.sitio === c.sitio && mirada.usuario === c.usuario && Array.isArray(mirada.claves) &&
      ahora - Date.parse(mirada.cuando) < HORAS_WEB * 3600000;
    if (!vigente) {
      try {
        await cargarWeb();
        const pgn = await raiz.PreparacionDescarga.descargar({ sitio: c.sitio, usuario: c.usuario, maximo: MAX_AVISO_WEB });
        const claves = deLaWeb(raiz.PreparacionAnalisis.leerPgn(pgn), c.sitio, c.usuario).filter((p) => p.jugadas.length >= 10).map((p) => p.clave);
        mirada = { cuando: new Date(ahora).toISOString(), sitio: c.sitio, usuario: c.usuario, claves };
        try { localStorage.setItem(CLAVE_WEB_MIRADA, JSON.stringify(mirada)); } catch (e) {}
      } catch (e) { return { juego, web: null, sitio: c.sitio }; }
    }
    return { juego, web: mirada.claves.filter((k) => !vistasYa[k]).length, sitio: c.sitio };
  }

  /* ---------- lo guardado ---------- */
  function leer(clave) {
    try { const v = JSON.parse(localStorage.getItem(clave) || "{}"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; }
  }
  function escribir(clave, obj) { try { localStorage.setItem(clave, JSON.stringify(obj)); } catch (e) {} }
  /* Los ejercicios, del más reciente al más viejo, a lo sumo MAX_EJERCICIOS. */
  function ejercicios() {
    return Object.values(leer(CLAVE_EJERCICIOS))
      .filter((x) => x && x.id && x.fen && Array.isArray(x.buenas))
      .map((x) => (x.tema && !/^[a-z-]{2,20}$/.test(x.tema) ? Object.assign({}, x, { tema: null }) : x))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : (a.id < b.id ? -1 : 1)))
      .slice(0, MAX_EJERCICIOS);
  }
  function guardar(nuevos) {
    const o = leer(CLAVE_EJERCICIOS);
    nuevos.forEach((x) => { o[x.id] = x; });
    const quedan = Object.values(o).sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, MAX_EJERCICIOS);
    const out = {};
    quedan.forEach((x) => { out[x.id] = x; });
    escribir(CLAVE_EJERCICIOS, out);
  }
  function vistas() { return leer(CLAVE_VISTAS); }

  /* Cómo se nombra cada origen en el resumen de un ejercicio. */
  const ORIGEN = { juego: "Partida", practica: "Práctica en clase", lichess: "Partida de Lichess", chesscom: "Partida de Chess.com", torneo: "Partida de torneo" };

  /* ---------- una partida de torneo anotada a mano ----------
     El alumno copia su planilla: «1. e4 e5 2. Cf3 Cc6…», en español
     (R D T A C) o en inglés (K Q R B N), con o sin números, o pega un PGN
     (las etiquetas, los comentarios, las variantes y el resultado se saltan).
     Cada jugada se comprueba con chess.js desde la posición inicial: nada que
     no sea legal llega a la base.
     → { jugadas: [SAN en inglés], notacion: "es" | "en" }
       o { error: { vacia } | { numero, color, jugada } } con la PRIMERA jugada
       que no se pudo leer (en la notación que más lejos llegó). Pura. */
  const PIEZA_ES = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
  const CORONA_ES = { D: "Q", T: "R", A: "B", C: "N" };
  function fichasDelTexto(texto) {
    let t = String(texto || "").slice(0, 20000)
      .replace(/\[[^\]]*\]/g, " ")          // etiquetas del PGN
      .replace(/\{[^}]*\}/g, " ")           // comentarios
      .replace(/;[^\n]*/g, " ")
      .replace(/\$\d+/g, " ");
    // Las variantes, también una dentro de otra.
    let antes;
    do { antes = t; t = t.replace(/\([^()]*\)/g, " "); } while (t !== antes);
    t = t.replace(/(?:^|\s)(?:1-0|0-1|1\/2-1\/2|½-½|\*)(?=\s|$)/g, " ")
      .replace(/\d+\s*\.(?:\s*\.\.)?/g, " ")  // «12.», «12...», «12. ...»
      .replace(/…/g, " ");
    return t.split(/\s+/).filter((x) => x && !/^(?:\.+|\d+)$/.test(x));   // «1 e4 e5 2 Cf3»: el número suelto
  }
  function normalizar(ficha, es) {
    let f = ficha.replace(/[!?]+$/g, "").replace(/[+#]+$/, "").replace(/e\.?p\.?$/i, "");
    if (/^[0Oo]-[0Oo]-[0Oo]$/.test(f)) return "O-O-O";
    if (/^[0Oo]-[0Oo]$/.test(f)) return "O-O";
    f = f.replace(/^P(?=[a-h])/, "");
    if (es && PIEZA_ES[f[0]]) f = PIEZA_ES[f[0]] + f.slice(1);
    // La coronación: «e8=D», «e8D» o «e8=Q». Al rey no se corona.
    f = f.replace(/=?([QRBNDTAC])$/, (m, p) => "=" + (es ? CORONA_ES[p] || p : p));
    if (/^[a-h][1-8]-?x?[a-h][1-8]/.test(f)) f = f.replace("-", "");
    return f;
  }
  function leerCon(Chess, fichas, es) {
    const g = new Chess();
    const jugadas = [];
    for (let i = 0; i < fichas.length; i++) {
      let m = null;
      try { m = g.move(normalizar(fichas[i], es), { sloppy: true }); } catch (e) { m = null; }
      if (!m) return { jugadas, falla: i };
      jugadas.push(m.san);
    }
    return { jugadas, falla: -1 };
  }
  function leerJugadas(Chess, texto) {
    const fichas = fichasDelTexto(texto);
    if (!fichas.length) return { error: { vacia: true } };
    const en = leerCon(Chess, fichas, false);
    if (en.falla < 0) return { jugadas: en.jugadas, notacion: "en" };
    const es = leerCon(Chess, fichas, true);
    if (es.falla < 0) return { jugadas: es.jugadas, notacion: "es" };
    const i = Math.max(en.falla, es.falla);
    return { error: { numero: Math.floor(i / 2) + 1, color: i % 2 ? "b" : "w", jugada: fichas[i].slice(0, 20) } };
  }

  /* ---------- las partidas de Lichess o Chess.com ----------
     `partidas`: lo que devuelve PreparacionAnalisis.leerPgn() del PGN que bajó
     PreparacionDescarga ([{ etiquetas, jugadas }]). Devuelve las partidas en la
     misma forma que traerPartidas(), solo las de ajedrez normal desde la
     posición inicial en que jugó `usuario` (sin distinguir mayúsculas, como
     esos dos sitios), de la más reciente a la más vieja y sin repetir.
     La clave es el id del sitio («lichess:AbCd1234», «chesscom:123456»): es lo
     que marca la partida como revisada. Pura: la prueba verificar-errores-propios.js. */
  const ENLACE_WEB = {
    lichess: /^https:\/\/lichess\.org\/([A-Za-z0-9]{8})(?:[/?#]|$)/,
    chesscom: /^https:\/\/www\.chess\.com\/game\/(?:live|daily)\/(\d{1,15})(?:[/?#]|$)/,
  };
  function fechaDeEtiquetas(e) {
    const d = String(e.UTCDate || e.Date || "").match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
    if (!d) return null;
    const h = String(e.UTCTime || "").match(/^(\d{2}):(\d{2}):(\d{2})$/);
    return d[1] + "-" + d[2] + "-" + d[3] + "T" + (h ? h[1] + ":" + h[2] + ":" + h[3] : "12:00:00") + "Z";
  }
  function deLaWeb(partidas, sitio, usuario) {
    const re = ENLACE_WEB[sitio];
    const yo = String(usuario || "").trim().replace(/^@/, "").toLowerCase();
    if (!re || !yo) return [];
    const vistas = {};
    const out = [];
    (partidas || []).forEach((p) => {
      const e = (p && p.etiquetas) || {};
      if (!/^(standard|chess)?$/i.test(String(e.Variant || "").trim())) return;     // Chess960, «From Position»…
      if (e.SetUp === "1" || e.FEN) return;                                         // no empezó en la inicial
      const color = String(e.White || "").toLowerCase() === yo ? "w" : String(e.Black || "").toLowerCase() === yo ? "b" : null;
      if (!color) return;
      const m = String(e.Link || e.Site || "").match(re);
      const fecha = fechaDeEtiquetas(e);
      if (!m || !fecha || !Array.isArray(p.jugadas)) return;
      const clave = sitio + ":" + m[1];
      if (vistas[clave]) return;
      vistas[clave] = true;
      const ritmo = String(e.TimeControl || "").trim().match(/^(\d+)(?:\+(\d+))?$/);
      out.push({ clave, origen: sitio, color, turno0: "w", fenInicial: null, jugadas: p.jugadas.slice(), fecha,
        relojes: Array.isArray(p.relojes) ? p.relojes.slice() : null,
        control: ritmo ? { base: Number(ritmo[1]), inc: Number(ritmo[2] || 0) } : null });
    });
    return out.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  }

  /* ---------- las partidas ---------- */
  /* [{ clave, origen, color, turno0, fenInicial, jugadas, fecha }] de las
     terminadas, de la más reciente a la más vieja. */
  /* `solo`: la clave de UNA partida ("juego:<id>"), para «Revisa esta
     partida» al terminarla en Juegos; se pide esa sola, aunque no esté entre
     las 30 más recientes, y con los mismos filtros (suya, estándar, terminada). */
  async function traerPartidas(sb, uid, solo) {
    const out = [];
    const soloJuego = solo && /^juego:[0-9a-zA-Z-]{1,64}$/.test(solo) ? solo.slice(6) : null;
    const soloTorneo = solo && /^torneo:[0-9a-f-]{36}$/.test(solo) ? solo.slice(7) : null;
    let pedidoJuegos = sb.from("game_rooms").select("id, white_id, black_id, moves, updated_at")
      .eq("variant", "estandar").eq("status", "finished")
      .or("white_id.eq." + uid + ",black_id.eq." + uid);
    if (soloJuego) pedidoJuegos = pedidoJuegos.eq("id", soloJuego);
    // Las de torneo, anotadas por el alumno (ver «Mis partidas de torneo»).
    let pedidoTorneo = sb.from("partidas_torneo").select("id, color, jugadas, fecha, created_at").eq("student_id", uid);
    if (soloTorneo) pedidoTorneo = pedidoTorneo.eq("id", soloTorneo);
    const [juegos, practicas, torneos] = await Promise.all([
      pedidoJuegos.order("updated_at", { ascending: false }).range(0, 29),
      sb.from("practice_games").select("id, session_id, moves, student_color, status, updated_at")
        .eq("student_id", uid).neq("status", "playing")
        .order("updated_at", { ascending: false }).range(0, 29),
      pedidoTorneo.order("fecha", { ascending: false }).order("created_at", { ascending: false }).range(0, 29),
    ]);
    if (juegos.error) throw juegos.error;
    if (practicas.error) throw practicas.error;
    // Sin la tabla (una base sin la migración) se sigue con las demás.
    (torneos.error ? [] : torneos.data || []).forEach((r) => {
      if (r.color !== "w" && r.color !== "b") return;
      // La fecha es un día de calendario: mediodía en Costa Rica, para que
      // «del 4 oct» no se corra al día anterior.
      out.push({ clave: "torneo:" + r.id, origen: "torneo", color: r.color, turno0: "w", fenInicial: null,
        jugadas: Array.isArray(r.jugadas) ? r.jugadas.filter((x) => typeof x === "string") : [], fecha: r.fecha + "T18:00:00Z" });
    });
    (juegos.data || []).forEach((r) => {
      out.push({ clave: "juego:" + r.id, origen: "juego", color: r.white_id === uid ? "w" : "b", turno0: "w",
        fenInicial: null, jugadas: Array.isArray(r.moves) ? r.moves : [], fecha: r.updated_at });
    });
    const conSesion = (practicas.data || []).filter((r) => r.session_id);
    if (conSesion.length) {
      const ids = [...new Set(conSesion.map((r) => r.session_id))];
      const { data: sesiones, error } = await sb.from("practice_sessions").select("id, fen").in("id", ids);
      if (error) throw error;
      const fenDe = {};
      (sesiones || []).forEach((s) => { fenDe[s.id] = s.fen; });
      conSesion.forEach((r) => {
        const fen = fenDe[r.session_id];
        if (!fen) return;          // la sesión ya no se puede leer: sin posición de inicio, no se analiza
        out.push({ clave: "practica:" + r.id, origen: "practica", color: r.student_color, turno0: fen.split(" ")[1] || "w",
          fenInicial: fen, jugadas: Array.isArray(r.moves) ? r.moves : [], fecha: r.updated_at });
      });
    }
    return out.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }

  /* Las posiciones de una partida, o null si alguna jugada no es legal. */
  function posiciones(Chess, p) {
    const g = new Chess();
    if (p.fenInicial && !g.load(p.fenInicial)) return null;
    const fens = [g.fen()];
    for (const san of p.jugadas) {
      if (!g.move(san)) return null;
      fens.push(g.fen());
    }
    return fens;
  }

  /* Busca errores en las partidas que todavía no se miraron.
     o: { motor (PreparacionMotor), alAvanzar(texto, hechas, total), parar(),
          solo (la clave de una partida de Juegos), externas (de deLaWeb) }
     → { partidas, nuevos } */
  async function analizar(sb, uid, o) {
    const motor = o.motor;
    const yaVistas = vistas();
    // `o.externas`: las de Lichess o Chess.com, ya convertidas (deLaWeb).
    const todas = o.externas ? o.externas : await traerPartidas(sb, uid, o.solo);
    if (o.solo) {
      // Revisar UNA partida: si no es suya (o no terminó, o no es estándar), no
      // llega; si ya se revisó, se dice cuáles salieron de ella.
      const esa = todas.find((p) => p.clave === o.solo);
      if (!esa) return { partidas: 0, pendientesAntes: 0, nuevos: [], noEncontrada: true };
      if (yaVistas[esa.clave]) return { partidas: 0, pendientesAntes: 0, nuevos: [], yaRevisada: true, deEsa: ejercicios().filter((x) => x.id.indexOf(esa.clave.replace(":", "-") + "-") === 0) };
      if (esa.jugadas.length < 10) return { partidas: 0, pendientesAntes: 0, nuevos: [], muyCorta: true };
    }
    const pendientes = (o.solo ? todas.filter((p) => p.clave === o.solo) : todas).filter((p) => !yaVistas[p.clave]).slice(0, MAX_PARTIDAS);
    const nuevos = [];
    let hechas = 0;
    for (const p of pendientes) {
      if (o.parar && o.parar()) break;
      /* Qué partidas ya se miraron: cuándo (r), de cuándo es la partida (f) y,
         si se pudo revisar, cuántos errores salieron de cada nivel (e1, e2).
         Con eso se arma la curva de curva(), que no puede salir de los
         ejercicios (se guardan solo los últimos 60). Las viejas son un texto
         con la fecha: siguen contando como revisadas, pero no en la curva. */
      const marcar = (cuenta) => { const v = vistas(); v[p.clave] = Object.assign({ r: new Date().toISOString(), f: p.fecha || null }, cuenta || {}); escribir(CLAVE_VISTAS, v); };
      const fens = posiciones(raiz.Chess, p);
      if (!fens || p.jugadas.length < 10) { marcar(); hechas++; continue; }   // no se puede reproducir, o muy corta
      const evals = [];
      for (let i = 0; i < fens.length; i++) {
        if (o.parar && o.parar()) return { partidas: hechas, nuevos };
        if (o.alAvanzar) o.alAvanzar("Partida " + (hechas + 1) + " de " + pendientes.length + ": jugada " + (Math.floor(i / 2) + 1) + " de " + Math.ceil(fens.length / 2) + ".", hechas, pendientes.length);
        const r = await motor.evaluar(fens[i], PROF_PASADA);
        evals.push(r && typeof r.eval === "number" ? r.eval * 100 : null);
      }
      const deEsta = [];
      for (const e of detectar(evals, p.color, p.turno0)) {
        const ops = await motor.opciones(fens[e.ply], 4, PROF_HONDA);
        // Nivel 1: con qué lo castiga el rival (la mejor en la posición de después).
        let castigo = null;
        if (e.nivel === 1 && fens[e.ply + 1]) { const r = await motor.evaluar(fens[e.ply + 1], PROF_HONDA); castigo = r && r.mejor; }
        const tema = ops && ops[0] ? temaDelError(o.tactica || raiz.PreparacionTactica, raiz.Chess, e.nivel, fens[e.ply], ops[0].san, p.jugadas[e.ply], castigo) : null;
        const x = ejercicio(p, e, fens[e.ply], p.jugadas[e.ply], ops, tema);
        if (x) deEsta.push(conCelada(x, o.lineas || (raiz.AperturasLineas && raiz.AperturasLineas.LINEAS)));
      }
      guardar(deEsta);
      nuevos.push(...deEsta);
      marcar({ e1: deEsta.filter((x) => x.nivel === 1).length, e2: deEsta.filter((x) => x.nivel === 2).length });
      hechas++;
    }
    return { partidas: hechas, pendientesAntes: pendientes.length, nuevos };
  }

  /* Para Informes: las filas de training_state del alumno (key, value.raw)
     → { ejercicios, revisadas, resueltos }. Lo que no tenga la forma de un
     ejercicio se ignora: el valor lo escribió el navegador del alumno y se
     puede tocar desde la consola. Los textos se pintan con textContent. */
  const SAN = /^(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?|O-O(?:-O)?)[+#]?$/;
  function deFilas(filas) {
    const raw = {};
    (filas || []).forEach((f) => {
      const v = f && f.value;
      if (v && typeof v.raw === "string") { try { raw[f.key] = JSON.parse(v.raw); } catch (e) { raw[f.key] = null; } }
    });
    const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
    const ejercicios = Object.values(obj(raw[CLAVE_EJERCICIOS])).filter((x) =>
      x && typeof x.id === "string" && typeof x.fen === "string" && x.fen.length < 100 &&
      (x.nivel === 1 || x.nivel === 2) && typeof x.jugada === "string" && SAN.test(x.jugada) &&
      Array.isArray(x.buenas) && x.buenas.length > 0 && x.buenas.length <= 6 && x.buenas.every((s) => typeof s === "string" && SAN.test(s)) &&
      typeof x.antes === "number" && typeof x.despues === "number" && typeof x.fecha === "string")
      .map((x) => (x.tema && !/^[a-z-]{2,20}$/.test(x.tema) ? Object.assign({}, x, { tema: null }) : x))
      .map((x) => (x.celada != null && !/^[a-z0-9-]{2,40}$/.test(x.celada) ? Object.assign({}, x, { celada: null }) : x))
      .map((x) => (x.reloj !== undefined && !(typeof x.reloj === "number" && x.reloj >= 0 && typeof x.base === "number" && x.base > 0) ? Object.assign({}, x, { reloj: undefined, base: undefined }) : x))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : (a.id < b.id ? -1 : 1)))
      .slice(0, MAX_EJERCICIOS);
    const estrellas = obj(raw.tipos_estrellas_v1);
    const resueltos = {};
    ejercicios.forEach((x) => { const n = Number(estrellas["errores:" + x.id]); if (n >= 1) resueltos[x.id] = Math.min(3, n); });
    return { ejercicios, revisadas: Object.keys(obj(raw[CLAVE_VISTAS])).length, resueltos, curva: curva(obj(raw[CLAVE_VISTAS])) };
  }

  /* ¿La jugada del alumno es una de las buenas? */
  function acierta(Chess, item, mov) {
    const g = new Chess(item.fen);
    const m = g.move(mov);
    if (!m) return { legal: false, ok: false };
    const san = m.san.replace(/[+#]$/, "");
    return { legal: true, ok: item.buenas.indexOf(san) >= 0, san: m.san, esLaDeLaPartida: san === item.jugada };
  }

  const ErroresPropios = {
    CLAVE_EJERCICIOS, CLAVE_VISTAS, CORTE, MAX_PARTIDAS, MAX_EJERCICIOS,
    detectar, ejercicio, temaDelError, temasDe, posiciones, acierta, ejercicios, guardar, vistas, traerPartidas, analizar, deFilas,
    deLaWeb, leerJugadas, ORIGEN, enLaApertura, lineaDeApertura, JUGADAS_DE_APERTURA,
    apurado, APURADO, conCelada, completarCeladas, finalDelError, finalDelBanco, curva, tendencia, curvaEnPantalla,
    SITIO_WEB, MAX_WEB, HORAS_WEB, cuentaWeb, guardarCuentaWeb, cargarWeb, sinRevisar,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = ErroresPropios;
  else raiz.ErroresPropios = ErroresPropios;
})(typeof window !== "undefined" ? window : globalThis);
