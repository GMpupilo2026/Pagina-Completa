/* ===== Pareo para DGT — leer tableros DGT de verdad, sin LiveChess =====
 *
 * «Transmitir sin LiveChess» (pareo-dgt.html): la página abre el puerto COM de
 * cada cadena de tableros (o de cada tablero USB) con Web Serial, les pide las
 * jugadas y el reloj, arma cada partida con chess.js y la empuja a la ronda de
 * Lichess. Es lo que hace LiveChess, del otro lado de la misma conversación
 * que js/pareo/dgt-tablero.js (el tablero virtual) aprendió a contestar.
 *
 * El protocolo es el de la descripción oficial de DGT (dgtbrd.h, versión de
 * 2015, en test/dgtbrd-ruud.h del repositorio well69/picochess-1):
 *   - Se habla siempre en MODO BUS, como LiveChess: es el modo en que arranca
 *     el tablero y sirve igual para un tablero USB solo que para una cadena
 *     de 50. Cada pedido son 4 bytes: comando (0x81–0x8d), la dirección del
 *     tablero en dos bytes de 7 bits y la suma de los tres (módulo 128). La
 *     dirección es el número de serie (01025 → 08 01).
 *   - Cada respuesta: código, largo TOTAL en dos bytes de 7 bits, dirección,
 *     datos y la suma de todo lo anterior. Con la suma mal, se vuelve a pedir
 *     (los cambios, con 0x84: si no, se pierden).
 *   - Para encontrar los tableros de una cadena: ping a la dirección 0 (todos
 *     contestan, repartidos al azar en 1,1 s para no chocar), a cada uno que
 *     contestó se le manda «ignorar el próximo ping general» (0x8a) y se
 *     repite hasta que nadie nuevo conteste.
 *   - Las jugadas: 0x83 trae lo que pasó desde el último 0x83, en el formato
 *     de la memoria del tablero: 0x40–0x5f + casilla (una pieza que se apoya
 *     o se levanta: pieza 0), 0x60–0x69 / 0x70–0x79 + minutos + segundos (el
 *     reloj que quedó parado al apretar: 0x70 el de la izquierda), y etiquetas
 *     de un byte (0x6a encendido, 0x6f posición inicial…).
 *   - El reloj: 0x81 trae 7 bytes (BWTIME): horas, minutos y segundos (BCD)
 *     del lado derecho y del izquierdo, y el estado (corriendo, de quién es
 *     el turno, sin reloj). Si el 4.º o el 7.º byte terminan en 0x0a es un
 *     acuse del reloj, no tiempos.
 *   - Las casillas: 0 = a8 … 63 = h1, contando desde arriba a la izquierda
 *     con el conector a la izquierda. Si las blancas juegan del otro lado, el
 *     tablero no da vuelta la numeración: lo deduce la partida.
 *
 * La partida se arma con chess.js: después de cada respuesta se compara el
 * tablero de verdad con la posición; si coincide con la de una jugada legal
 * (o dos, en un blitz rápido) se anota; si coincide con una posición de hace
 * poco, alguien corrigió una jugada y se vuelve atrás; si no coincide con
 * nada (una pieza en la mano) se espera.
 *
 *   DgtLector.crearFlujo()                → { empujar(bytes) → [mensajes] }
 *   DgtLector.pedido(cmd, dir)            → los 4 bytes de un pedido en modo bus
 *   DgtLector.leerBus(msg)                → { codigo, dir, datos } | null (suma mal)
 *   DgtLector.leerMemoria(datos)          → [{ tipo: "pieza"|"reloj"|"marca", … }]
 *   DgtLector.leerReloj(datos)            → { derecha, izquierda, corriendo, turno, sinReloj } | null
 *   DgtLector.crearPartida(Chess, opc)    → la partida de un tablero (ver abajo);
 *                                           opc.guardada: lo que dio p.guardar(), para seguirla
 *   DgtLector.textoPgn(jugadas, tiempos, resultado) → «1. e4 { [%clk 0:04:58] } … 1-0»
 *   DgtLector.crearCadena(puerto, opc)    → encontrar y leer los tableros de un puerto
 *
 * Lógica pura (recibe la clase Chess y el puerto), para el navegador y Node:
 * lo prueba verificar-pareo-dgt-lector.js con los tableros virtuales.
 */
(function (raiz) {
  "use strict";

  const CMD = { RELOJ: 0x81, TABLERO: 0x82, CAMBIOS: 0x83, REPETIR: 0x84, PING: 0x87, IGNORAR_PING: 0x8a, VERSION: 0x8b };
  const MSG = { TABLERO: 0x83, RELOJ: 0x84, CAMBIOS: 0x85, PING: 0x87, VERSION: 0x89 };
  const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
  const LETRA = ".PRNBKQprnbkq";

  const suma = (bytes) => bytes.reduce((a, b) => a + b, 0) & 0x7f;
  const direccion = (n) => [(n >> 7) & 0x7f, n & 0x7f];
  const pedido = (cmd, dir) => { const d = direccion(dir); return [cmd, d[0], d[1], suma([cmd, d[0], d[1]])]; };

  // ------------------------------------------------------------ los mensajes

  // Junta los bytes que llegan (en pedazos, como los da el puerto) en
  // mensajes enteros. Un mensaje empieza con un byte con el bit 0x80 y trae su
  // largo total; lo que no empieza así (ruido, un choque en el bus) se tira
  // byte a byte hasta encontrar un comienzo creíble.
  function crearFlujo() {
    let buf = [];
    return {
      empujar(bytes) {
        for (const b of bytes) buf.push(b);
        const out = [];
        for (;;) {
          while (buf.length && !(buf[0] & 0x80)) buf.shift();
          if (buf.length < 3) break;
          const largo = (buf[1] << 7) | buf[2];
          if ((buf[1] & 0x80) || (buf[2] & 0x80) || largo < 3 || largo > 0x2000) { buf.shift(); continue; }
          if (buf.length < largo) break;
          out.push(buf.slice(0, largo));
          buf = buf.slice(largo);
        }
        return out;
      },
      pendiente: () => buf.length,
      vaciar() { buf = []; },
    };
  }

  // Una respuesta en modo bus, con su suma comprobada.
  function leerBus(m) {
    if (!m || m.length < 6) return null;
    const largo = (m[1] << 7) | m[2];
    if (largo !== m.length || suma(m.slice(0, -1)) !== m[m.length - 1]) return null;
    return { codigo: m[0], dir: (m[3] << 7) | m[4], datos: m.slice(5, -1) };
  }

  const bcd = (b) => ((b >> 4) & 0x0f) * 10 + (b & 0x0f);

  // Los 7 bytes del reloj (BWTIME), o null si es un acuse del reloj.
  function leerReloj(d) {
    if (!d || d.length < 7) return null;
    if ((d[0] & 0x0f) === 0x0a || (d[3] & 0x0f) === 0x0a) return null;
    const lado = (h, m, s) => ({ segundos: (h & 0x0f) * 3600 + bcd(m) * 60 + bcd(s), bandera: !!(h & 0x10) || !!(h & 0x40) });
    const st = d[6];
    return {
      derecha: lado(d[0], d[1], d[2]),
      izquierda: lado(d[3], d[4], d[5]),
      corriendo: !!(st & 0x01),
      turno: st & 0x08 ? "derecha" : st & 0x10 ? "izquierda" : null,
      bateriaBaja: !!(st & 0x04),
      sinReloj: !!(st & 0x20),
    };
  }

  // La memoria del tablero (lo que trae 0x83 o 0x86), evento por evento.
  function leerMemoria(d) {
    const out = [];
    for (let i = 0; i < d.length; i++) {
      const b = d[i];
      if (b >= 0x40 && b <= 0x5f) {
        if (i + 1 >= d.length) break;
        out.push({ tipo: "pieza", casilla: d[i + 1] & 0x3f, pieza: b & 0x0f });
        i += 1;
      } else if ((b >= 0x60 && b <= 0x69) || (b >= 0x70 && b <= 0x79)) {
        if (i + 2 >= d.length) break;
        out.push({ tipo: "reloj", lado: b & 0x10 ? "izquierda" : "derecha", segundos: (b & 0x0f) * 3600 + bcd(d[i + 1]) * 60 + bcd(d[i + 2]) });
        i += 2;
      } else {
        const marcas = { 0x6a: "encendido", 0x6c: "cuatro-filas", 0x6d: "vacio", 0x6f: "inicio", 0x7a: "inicio-rotado", 0x7b: "comienzo", 0x7c: "reinicio" };
        if (marcas[b]) out.push({ tipo: "marca", marca: marcas[b] });
      }
    }
    return out;
  }

  // ------------------------------------------------------------ la partida

  // Las 64 casillas (orden DGT) como la parte de piezas de un FEN.
  function colocacion(casillas) {
    let s = "";
    for (let f = 0; f < 8; f++) {
      let vacias = 0;
      for (let c = 0; c < 8; c++) {
        const p = casillas[f * 8 + c] || 0;
        const l = p > 0 && p < 13 ? LETRA[p] : null;
        if (!l) { vacias += 1; continue; }
        if (vacias) { s += vacias; vacias = 0; }
        s += l;
      }
      if (vacias) s += vacias;
      if (f < 7) s += "/";
    }
    return s;
  }
  const girar = (casillas) => casillas.slice().reverse();
  const nombre = (i) => String.fromCharCode(97 + (i % 8)) + (8 - Math.floor(i / 8));
  // La parte de piezas de un FEN, casilla por casilla (de a8 a h1).
  function expandir(piezas) {
    const out = [];
    for (const ch of piezas) {
      if (ch === "/") continue;
      if (ch >= "1" && ch <= "8") for (let i = 0; i < Number(ch); i++) out.push(".");
      else out.push(ch);
    }
    return out;
  }
  const piezasDe = (fen) => String(fen).split(" ")[0];

  const reloj = (seg) => {
    const s = Math.max(0, Math.round(seg));
    return Math.floor(s / 3600) + ":" + String(Math.floor(s / 60) % 60).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  };

  // La partida de un tablero. Se le pasa lo que llega del tablero y devuelve
  // las jugadas nuevas.
  //   opciones.atras: hasta cuántas jugadas puede corregir (volver atrás); 4.
  //   opciones.blancasA: "izquierda" | "derecha" | null (lo deduce del reloj).
  function crearPartida(Chess, opciones) {
    const o = opciones || {};
    const chess = new Chess();
    const casillas = new Array(64).fill(0);
    let rotado = null;              // ¿las blancas juegan del lado contrario al conector?
    let blancasA = o.blancasA || null;
    const relojes = [];             // segundos que le quedaban a quien hizo cada jugada
    const sans = [];                // las jugadas en SAN: chess.history() las vuelve a armar todas cada vez (caro)
    let ultimoReloj = null;
    let resultado = "*";
    const p = { cambios: 0 };

    const fisico = () => (rotado ? girar(casillas) : casillas);
    const ladoDe = (color) => (!blancasA ? null : color === "w" ? blancasA : blancasA === "izquierda" ? "derecha" : "izquierda");

    function ponerResultado() {
      if (chess.in_checkmate()) resultado = chess.turn() === "w" ? "0-1" : "1-0";
      // La triple repetición no: sobre el tablero hay que reclamarla, y la anota el árbitro.
      else if (chess.in_stalemate() || chess.insufficient_material()) resultado = "1/2-1/2";
    }

    // Busca la jugada (o las dos) que llevan de la posición de la partida a
    // la del tablero.
    function buscar(objetivo) {
      // Solo se prueban las jugadas que salen de una casilla que cambió: una
      // jugada deja vacía la casilla de donde sale, y la del rival no la puede
      // volver a llenar con lo mismo. Así, con 50 tableros y alguien con una
      // pieza en la mano, no se prueban las 1200 parejas de jugadas cada vez.
      const antes = expandir(piezasDe(chess.fen())), despues = expandir(objetivo);
      const cambio = new Set();
      for (let i = 0; i < 64; i++) if (antes[i] !== despues[i]) cambio.add(nombre(i));
      if (!cambio.size || cambio.size > 10) return null;
      // chess.js arma el SAN de cada jugada que genera (caro): se le piden solo
      // las de las casillas que cambiaron.
      const desde = () => [].concat(...[...cambio].map((sq) => chess.moves({ square: sq, verbose: true })));
      const primeras = desde();
      for (const m of primeras) {
        chess.move(m);
        const una = piezasDe(chess.fen()) === objetivo;
        chess.undo();
        if (una) return [m];
      }
      for (const m of primeras) {
        chess.move(m);
        for (const m2 of desde()) {
          chess.move(m2);
          const dos = piezasDe(chess.fen()) === objetivo;
          chess.undo();
          if (dos) { chess.undo(); return [m, m2]; }
        }
        chess.undo();
      }
      return null;
    }

    p.revisar = function () {
      if (resultado !== "*") return { nuevas: [], atras: 0 };
      if (rotado === null) {
        if (colocacion(casillas) === INICIAL) rotado = false;
        else if (colocacion(girar(casillas)) === INICIAL) rotado = true;
        else return { nuevas: [], atras: 0 };   // todavía no está armado: se espera la posición inicial
      }
      const ahora = colocacion(fisico());
      if (ahora === piezasDe(chess.fen())) return { nuevas: [], atras: 0 };
      const encontradas = buscar(ahora);
      if (encontradas) {
        const nuevas = encontradas.map((m) => chess.move(m).san);
        sans.push(...nuevas);
        for (let i = 0; i < nuevas.length; i++) relojes.push(null);
        ponerResultado();
        p.cambios += 1;
        return { nuevas, atras: 0 };
      }
      // Las piezas otra vez en la posición inicial no son una corrección: se
      // terminó la partida y se arma la siguiente (y si se tomara por «deshacer
      // todo», una partida corta se borraría entera).
      if (ahora === INICIAL) return { nuevas: [], atras: 0 };
      // Una corrección: el tablero volvió a una posición de hace poco, o se
      // leyó mal una jugada a medio hacer (en un enroque que empieza por la
      // torre, Tf1 parece una jugada entera hasta que llega el rey: se vuelve
      // atrás la Tf1 y aparece O-O).
      const hechas = chess.history({ verbose: true });
      for (let k = 1; k <= Math.min(o.atras || 4, hechas.length); k++) {
        for (let i = 0; i < k; i++) chess.undo();
        const otra = piezasDe(chess.fen()) === ahora ? [] : buscar(ahora);
        if (otra) {
          relojes.splice(relojes.length - k, k);
          sans.splice(sans.length - k, k);
          const nuevas = otra.map((m) => chess.move(m).san);
          sans.push(...nuevas);
          for (let i = 0; i < nuevas.length; i++) relojes.push(null);
          ponerResultado();
          p.cambios += 1;
          return { nuevas, atras: k };
        }
        for (let i = hechas.length - k; i < hechas.length; i++) chess.move(hechas[i]);
      }
      return { nuevas: [], atras: 0 };       // una pieza en la mano: se espera
    };

    // Lo que trae el tablero.
    p.tablero = function (todas) { for (let i = 0; i < 64; i++) casillas[i] = todas[i] || 0; return p.revisar(); };
    p.memoria = function (eventos) {
      let nuevas = [], atras = 0;
      const juntar = (r) => { if (r.atras) { nuevas = nuevas.slice(0, Math.max(0, nuevas.length - r.atras)); atras += r.atras; } nuevas = nuevas.concat(r.nuevas); };
      // Se revisa al apretar el reloj y al final de la tanda, no después de
      // cada pieza: a mitad de una jugada el tablero puede parecer otra.
      for (const e of eventos) {
        // Mientras espera la posición inicial se mira pieza por pieza: si en
        // la misma tanda se arman las piezas y se hace la primera jugada, la
        // posición inicial no se vería nunca.
        if (e.tipo === "pieza") { casillas[e.casilla] = e.pieza; if (rotado === null) juntar(p.revisar()); }
        else if (e.tipo === "reloj") { juntar(p.revisar()); p.relojParado(e.lado, e.segundos); }
      }
      juntar(p.revisar());
      return { nuevas, atras };
    };

    // El reloj que quedó parado al apretar es el de quien acaba de jugar.
    p.relojParado = function (lado, segundos) {
      const n = sans.length;
      if (!n) return;
      const quien = n % 2 ? "w" : "b";
      if (!blancasA) blancasA = quien === "w" ? lado : lado === "izquierda" ? "derecha" : "izquierda";
      if (ladoDe(quien) === lado && relojes[n - 1] == null) { relojes[n - 1] = segundos; p.cambios += 1; }
    };

    // Una lectura entera del reloj (0x81).
    p.reloj = function (r) {
      if (!r || r.sinReloj) return;
      ultimoReloj = r;
      const n = sans.length;
      // Después de la primera jugada de las blancas, corre el reloj de las negras.
      if (!blancasA && n === 1 && r.turno) blancasA = r.turno === "izquierda" ? "derecha" : "izquierda";
      if (!n || !blancasA) return;
      const quien = n % 2 ? "w" : "b";
      const contrario = quien === "w" ? "b" : "w";
      if (r.turno === ladoDe(contrario) && relojes[n - 1] == null) { relojes[n - 1] = r[ladoDe(quien)].segundos; p.cambios += 1; }
      if (r[ladoDe("w")].bandera || r[ladoDe("b")].bandera) p.cambios += 1;
    };

    p.ponerResultado = function (r) { resultado = r; p.cambios += 1; };
    p.resultado = () => resultado;
    p.jugadas = () => sans.slice();
    p.fen = () => chess.fen();
    p.casillas = () => casillas.slice();     // el tablero de verdad, como está ahora
    p.rotado = () => rotado;
    p.blancasA = () => blancasA;
    p.ultimoReloj = () => ultimoReloj;
    p.tiempos = () => relojes.slice();

    // Las jugadas en PGN, con el reloj de cada una ({[%clk 0:04:58]}).
    p.texto = () => textoPgn(sans, relojes, resultado);

    // Lo que se guarda para no perder la partida si se recarga la página
    // (y se le vuelve a pasar a crearPartida en opciones.guardada).
    p.guardar = () => ({ jugadas: sans.slice(), tiempos: relojes.slice(), resultado, rotado, blancasA });

    if (o.guardada) {
      const g = o.guardada;
      for (const san of g.jugadas || []) {
        const mv = chess.move(san);
        if (!mv) break;
        sans.push(mv.san);
        relojes.push(null);
      }
      (g.tiempos || []).slice(0, sans.length).forEach((t, i) => { relojes[i] = t == null ? null : t; });
      if (g.resultado) resultado = g.resultado;
      if (typeof g.rotado === "boolean") rotado = g.rotado;
      if (g.blancasA) blancasA = g.blancasA;
      // El tablero es el de la partida hasta que llegue el de verdad.
      const lugar = expandir(piezasDe(chess.fen())).map((c) => Math.max(0, LETRA.indexOf(c)));
      const fis = rotado ? girar(lugar) : lugar;
      for (let i = 0; i < 64; i++) casillas[i] = fis[i];
    }
    return p;
  }

  // Las jugadas en PGN, con el reloj de cada una ({ [%clk 0:04:58] }).
  function textoPgn(jugadas, tiempos, resultado) {
    const partes = [];
    for (let i = 0; i < jugadas.length; i++) {
      if (i % 2 === 0) partes.push(i / 2 + 1 + ".");
      partes.push(jugadas[i]);
      if (tiempos && tiempos[i] != null) partes.push("{ [%clk " + reloj(tiempos[i]) + "] }");
    }
    partes.push(resultado || "*");
    return partes.join(" ");
  }

  // ------------------------------------------------------------ la cadena

  // Los tableros de un puerto (una cadena en bus o un tablero USB solo).
  //   puerto: { escribir(bytes) → Promise, esperar(ms) → Promise<mensaje|null> }
  //     esperar() devuelve el próximo mensaje entero (ver crearFlujo) o null si
  //     pasaron ms sin nada.
  //   opciones.espera: cuánto esperar una respuesta (ms); 150.
  //   opciones.dormir(ms): para esperar entre pings (en las pruebas, al instante).
  function crearCadena(puerto, opciones) {
    const o = opciones || {};
    const espera = o.espera || 150;
    const dormir = o.dormir || ((ms) => new Promise((r) => setTimeout(r, ms)));

    // Manda un pedido y espera la respuesta de ese tablero con ese código.
    async function preguntar(cmd, dir, codigo) {
      await puerto.escribir(pedido(cmd, dir));
      const hasta = Date.now() + espera;
      for (;;) {
        const falta = hasta - Date.now();
        const m = await puerto.esperar(Math.max(1, falta));
        if (!m) return { error: "sin respuesta" };
        const r = leerBus(m);
        if (!r) return { error: "suma" };
        if (r.dir === dir && r.codigo === codigo) return r;
        if (Date.now() >= hasta) return { error: "sin respuesta" };
      }
    }

    // Todos los tableros de la cadena: ping general, «ignora el próximo» a los
    // que contestaron, y otra vez, hasta que nadie nuevo conteste tres veces
    // seguidas (una respuesta que choca o llega rota cuenta como nadie).
    async function encontrar(conocidos) {
      await puerto.escribir([0x4a]);             // a modo bus, por si alguno quedó en el otro
      const hallados = new Set();
      for (const d of conocidos || []) {
        const r = await preguntar(CMD.PING, d, MSG.PING);
        if (!r.error) hallados.add(d);
      }
      let vaciasSeguidas = 0;
      for (let vuelta = 0; vuelta < 300 && vaciasSeguidas < 3; vuelta++) {
        for (const d of hallados) await preguntar(CMD.IGNORAR_PING, d, MSG.PING);
        await puerto.escribir(pedido(CMD.PING, 0));
        let nuevos = 0;
        const hasta = Date.now() + (o.ventanaPing || 1200);
        for (;;) {
          const m = await puerto.esperar(Math.max(1, hasta - Date.now()));
          if (!m) break;
          const r = leerBus(m);
          if (r && r.codigo === MSG.PING && r.dir && !hallados.has(r.dir)) { hallados.add(r.dir); nuevos += 1; }
          if (Date.now() >= hasta) break;
        }
        vaciasSeguidas = nuevos ? 0 : vaciasSeguidas + 1;
        if (o.dormir) await dormir(0);
      }
      return [...hallados].sort((a, b) => a - b);
    }

    // Lo que pasó en un tablero desde la última vez (con la suma mal, se pide
    // repetir: si no, esas jugadas se pierden).
    async function cambios(dir) {
      let r = await preguntar(CMD.CAMBIOS, dir, MSG.CAMBIOS);
      for (let i = 0; i < 3 && r.error; i++) r = await preguntar(CMD.REPETIR, dir, MSG.CAMBIOS);
      return r.error ? r : { eventos: leerMemoria(r.datos) };
    }
    // Lo demás, con la suma mal, se vuelve a pedir igual (hasta 3 veces).
    async function otraVez(cmd, dir, codigo) {
      let r = await preguntar(cmd, dir, codigo);
      for (let i = 0; i < 3 && r.error; i++) r = await preguntar(cmd, dir, codigo);
      return r;
    }
    async function tablero(dir) {
      const r = await otraVez(CMD.TABLERO, dir, MSG.TABLERO);
      return r.error ? r : { casillas: r.datos.slice(0, 64) };
    }
    async function relojDe(dir) {
      const r = await otraVez(CMD.RELOJ, dir, MSG.RELOJ);
      return r.error ? r : { reloj: leerReloj(r.datos) };
    }
    return { encontrar, cambios, tablero, reloj: relojDe, preguntar };
  }

  const api = { CMD, MSG, INICIAL, suma, direccion, pedido, crearFlujo, leerBus, leerReloj, leerMemoria, colocacion, crearPartida, textoPgn, crearCadena };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.DgtLector = api;
})(typeof self !== "undefined" ? self : this);
