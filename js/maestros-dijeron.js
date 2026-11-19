/* El código de maestros-dijeron.html: «100 maestros dijeron», un juego por
   equipos para proyectar en la clase.

   Se muestra una posición de una apertura conocida y los equipos tratan de
   adivinar qué jugaron ahí los maestros. Cada jugada vale lo que pesa: si 52
   de cada 100 maestros jugaron Ab5, adivinarla da 52 puntos. Tres fallos y el
   turno pasa al otro equipo. Es el formato de los concursos de encuestas de
   la tele, con nombre y datos nuestros; la idea de tenerlo en la clase salió
   de Chessgora (ver «100 maestros dijeron» en docs/decisiones/clase-en-vivo.md).

   Decisiones que no se ven desde acá:
   - LOS DATOS SON DE VERDAD: salen de las partidas de maestros del explorador
     de Lichess (la Edge Function explorador-maestros, la misma del explorador
     de la clase). Un «100 ajedrecistas dijeron» con respuestas puestas a mano
     sería una encuesta inventada presentada como real.
   - NINGUNA POSICIÓN SE INVENTA: cada una sale de jugar con chess.js una línea
     de apertura de la lista; una línea que no se puede jugar se descarta.
   - No escribe nada en la base: los equipos no son cuentas y los puntos son
     del juego, no Puntos Ajedrez.
   - Lo que escribe una persona (nombres de equipos, lo que adivinan) va por
     textContent. La jugada se puede escribir en español (Cf3, Ab5, O-O) o en
     inglés (Nf3, Bb5); una R mayúscula es el Rey, como se escribe acá. */

(function (raiz, fabrica) {
    "use strict";
    const api = fabrica();
    if (typeof module === "object" && module.exports) module.exports = api;
    else raiz.MaestrosDijeron = api;
})(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const MAX_RESPUESTAS = 6;
    const FALLOS = 3;

    // Las aperturas: nombre y la línea en notación inglesa (la de chess.js).
    const APERTURAS = [
        { nombre: "La posición inicial", jugadas: [] },
        { nombre: "Apertura italiana", jugadas: ["e4", "e5", "Nf3", "Nc6", "Bc4"] },
        { nombre: "Apertura española", jugadas: ["e4", "e5", "Nf3", "Nc6", "Bb5"] },
        { nombre: "Defensa Petrov", jugadas: ["e4", "e5", "Nf3", "Nf6"] },
        { nombre: "Gambito de rey", jugadas: ["e4", "e5", "f4"] },
        { nombre: "Defensa siciliana", jugadas: ["e4", "c5"] },
        { nombre: "Siciliana abierta", jugadas: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3"] },
        { nombre: "Defensa francesa", jugadas: ["e4", "e6", "d4", "d5"] },
        { nombre: "Defensa Caro-Kann", jugadas: ["e4", "c6", "d4", "d5"] },
        { nombre: "Defensa escandinava", jugadas: ["e4", "d5", "exd5"] },
        { nombre: "Gambito de dama", jugadas: ["d4", "d5", "c4"] },
        { nombre: "Defensa eslava", jugadas: ["d4", "d5", "c4", "c6"] },
        { nombre: "Defensa nimzoindia", jugadas: ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4"] },
        { nombre: "Defensa india de rey", jugadas: ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7", "e4", "d6"] },
        { nombre: "Apertura inglesa", jugadas: ["c4"] },
    ];

    /* La posición de una línea, jugada con chess.js (se pasa el constructor
       para poder probarlo en Node). Si alguna jugada no se puede hacer, null:
       esa apertura no se juega. Devuelve el FEN y la línea en español. */
    function posicion(Chess, jugadas) {
        const g = new Chess();
        for (const j of jugadas) { if (!g.move(j)) return null; }
        return { fen: g.fen(), turno: g.turn(), linea: lineaEs(jugadas) };
    }

    // Notación en español: C caballo, A alfil, T torre, D dama, R rey.
    const A_ES = { N: "C", B: "A", R: "T", Q: "D", K: "R" };
    function sanEs(san) {
        return String(san || "").replace(/[NBRQK]/g, (l) => A_ES[l]);
    }
    function lineaEs(jugadas) {
        return jugadas.map((j, i) => (i % 2 === 0 ? (i / 2 + 1) + "." : "") + sanEs(j)).join(" ");
    }

    /* Lo que dice el equipo, llevado a la forma de chess.js para comparar:
       sin jaques, capturas ni signos; las letras de pieza en español pasan a
       inglés (la R es el Rey, como se escribe acá); 0-0 es O-O. */
    const A_EN = { C: "N", A: "B", T: "R", D: "Q", R: "K" };
    // Sin espacios, jaques, signos ni la x de captura; los enroques como OO / OOO.
    function limpiar(texto) {
        let s = String(texto || "").trim().replace(/\s+/g, "").replace(/[+#!?]/g, "").replace(/x/gi, "");
        if (/^[0Oo]-?[0Oo](-?[0Oo])?$/.test(s)) return { enroque: s.replace(/-/g, "").length === 3 ? "OOO" : "OO" };
        return { s };
    }
    // Lo que dice el equipo: la primera letra mayúscula es la pieza en español
    // (C, A, T, D, R) y se pasa a la de chess.js; N, B y Q inglesas se dejan.
    function normalizar(texto) {
        const l = limpiar(texto);
        if (l.enroque) return l.enroque;
        return l.s.replace(/^([CATDR])/, (x) => A_EN[x]);
    }
    // La jugada de chess.js ya viene en inglés: solo se limpia, NO se traduce
    // (si no, la torre «Rd1» pasaría a rey).
    function normalizarSan(san) {
        const l = limpiar(san);
        return l.enroque || l.s;
    }
    function coincide(texto, san) {
        const a = normalizar(texto), b = normalizarSan(san);
        return !!a && a === b;
    }

    /* Las respuestas de una posición: las jugadas de los maestros con su peso,
       de la más jugada a la menos, las que pesan al menos 1 de cada 100, hasta
       seis. `datos` es lo que contesta explorador-maestros por posición:
       { w, d, b, jugadas: [{ san, w, d, b }] }. */
    function respuestas(datos, max) {
        const suma = (x) => (x ? (x.w || 0) + (x.d || 0) + (x.b || 0) : 0);
        const total = suma(datos);
        if (!total) return [];
        return ((datos && datos.jugadas) || [])
            // Al menos 1 de cada 100 de verdad, sin redondear: 9 de 1000 no entra.
            .filter((j) => 100 * suma(j) >= total)
            .map((j) => ({ san: j.san, partidas: suma(j), pct: Math.round((100 * suma(j)) / total) }))
            .sort((a, b) => b.partidas - a.partidas)
            .slice(0, max || MAX_RESPUESTAS);
    }

    /* ---------- El juego: un estado y lo que le pasa ---------- */
    function nuevoJuego(nombres) {
        return { equipos: nombres.map((n) => ({ nombre: n, puntos: 0 })), turno: 0, ronda: null, jugadas: 0 };
    }
    function nuevaRonda(juego, apertura, pos, resp) {
        juego.ronda = { apertura, fen: pos.fen, turnoBlancas: pos.turno === "w", linea: pos.linea, respuestas: resp, reveladas: [], fallos: 0 };
        return juego;
    }

    /* Un intento del equipo de turno. Devuelve qué pasó:
       { tipo: "acierto", indice, puntos } · { tipo: "repetida", indice } ·
       { tipo: "fallo", fallos } · { tipo: "pasa", a } (tercer fallo: el turno
       pasa al equipo siguiente y los fallos vuelven a cero). */
    function adivinar(juego, texto) {
        const r = juego.ronda;
        if (!r) return { tipo: "sin-ronda" };
        const i = r.respuestas.findIndex((x) => coincide(texto, x.san));
        if (i >= 0 && r.reveladas.includes(i)) return { tipo: "repetida", indice: i };
        if (i >= 0) {
            r.reveladas.push(i);
            const puntos = r.respuestas[i].pct;
            juego.equipos[juego.turno].puntos += puntos;
            return { tipo: "acierto", indice: i, puntos };
        }
        r.fallos += 1;
        if (r.fallos >= FALLOS) {
            r.fallos = 0;
            juego.turno = (juego.turno + 1) % juego.equipos.length;
            return { tipo: "pasa", a: juego.turno };
        }
        return { tipo: "fallo", fallos: r.fallos };
    }
    // Se acabó la ronda: se muestran todas y la siguiente la empieza el equipo que sigue.
    function cerrarRonda(juego) {
        if (juego.ronda) juego.ronda.reveladas = juego.ronda.respuestas.map((_, i) => i);
        juego.turno = (juego.turno + 1) % juego.equipos.length;
        juego.jugadas += 1;
        return juego;
    }
    function podio(equipos) {
        const orden = equipos.slice().sort((a, b) => b.puntos - a.puntos);
        let puesto = 0, ant = null;
        return orden.map((e, i) => { if (e.puntos !== ant) { puesto = i + 1; ant = e.puntos; } return Object.assign({ puesto }, e); });
    }

    return { APERTURAS, FALLOS, MAX_RESPUESTAS, posicion, sanEs, lineaEs, normalizar, normalizarSan, coincide, respuestas,
             nuevoJuego, nuevaRonda, adivinar, cerrarRonda, podio };
});

/*! rev bfb5bbb0d2d82f9f */
