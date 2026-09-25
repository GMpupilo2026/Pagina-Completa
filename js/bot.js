/* El código de bot.html.

   Vivía escrito dentro de la página, en un <script> de 42 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* ===== Jugar contra el bot de Oscar =====
 *
 * Una sola página para practicar CUALQUIER modalidad contra el bot. Se apoya en
 * los motores y los tableros que ya usan las páginas de partida
 * (js/crazyhouse-engine.js, js/variantes-engines.js, js/niebla-board.js…), que
 * no saben nada de la base de datos: por eso se pueden montar acá sin tocar
 * game_rooms ni Supabase.
 *
 * La partida vive solo en el navegador y no se guarda. Es a propósito: contra
 * el bot se practica, y una partida de práctica no tiene por qué ocupar una
 * fila ni aparecer en los informes.
 *
 * Cada modalidad aporta un ADAPTADOR con lo que el bot necesita (turno,
 * jugadas, probar, material). El bot está en js/bot-oscar.js y no sabe de
 * ninguna variante en concreto.
 *
 * Dos modalidades no encajan en ese ciclo turno-por-turno y llevan su propio
 * camino, separado del genérico (empezar/alMover/turnoDelBot):
 *   - Ajedrez de Cartas: el turno normal se resuelve con el adaptador de
 *     siempre, pero ANTES de que el bot mueva decide si le conviene jugar una
 *     carta (jugarCartaBot), mutando el motor real — no hace falta que el
 *     bot "busque" con cartas de por medio, alcanza con una heurística.
 *   - Duelo Simultáneo: los dos jugadores comprometen su jugada A LA VEZ, sin
 *     ver la del otro, así que no hay "espera tu turno" que atender: el bot
 *     compromete la suya apenas empieza la ronda (no puede ver la humana de
 *     todos modos) y las dos se revelan solas en cuanto están las dos.
 *
 * OJO al tocar `alMover`: el tablero interactivo de cada modalidad NO
 * comparte siempre el mismo objeto que `ad.motor`. Para "niebla"/"crazyhouse"
 * y "cartas" cada uno lleva su PROPIO motor (así que la jugada humana se
 * sincroniza a `ad` releyendo el estado resultante); para "variante" el
 * tablero recibe el motor real de `ad` (`engine: ad.motor`) y lo muta
 * directamente, así que ahí NO hay que volver a aplicar la jugada, solo
 * anotarla — aplicarla de nuevo fallaría (la pieza ya no está en el origen).
 */
const VALOR = { p: 1, n: 3.05, b: 3.33, r: 5.1, q: 9.5, k: 0 };
const CENTRO = { d4: .12, d5: .12, e4: .12, e5: .12, c4: .05, c5: .05, f4: .05, f5: .05 };

/* ---------------- Tablas de posición (PST) ----------------
   No alcanza con contar material: un caballo en el borde vale menos que uno
   en el centro, y una torre en la séptima fila vale más que en la primera.
   Son las tablas clásicas de Tomasz Michniewski (de dominio público, las usan
   decenas de motores educativos), en centipeones — se dividen entre 100 para
   la escala en peones que ya usa el sitio. Están escritas para blancas mirando
   "hacia adelante" (índice 0 = a8): `indicePst()` hace el espejo para negras. */
const PST = {
    p: [
         0,  0,  0,  0,  0,  0,  0,  0,
        50, 50, 50, 50, 50, 50, 50, 50,
        10, 10, 20, 30, 30, 20, 10, 10,
         5,  5, 10, 25, 25, 10,  5,  5,
         0,  0,  0, 20, 20,  0,  0,  0,
         5, -5,-10,  0,  0,-10, -5,  5,
         5, 10, 10,-20,-20, 10, 10,  5,
         0,  0,  0,  0,  0,  0,  0,  0,
    ],
    n: [
        -50,-40,-30,-30,-30,-30,-40,-50,
        -40,-20,  0,  0,  0,  0,-20,-40,
        -30,  0, 10, 15, 15, 10,  0,-30,
        -30,  5, 15, 20, 20, 15,  5,-30,
        -30,  0, 15, 20, 20, 15,  0,-30,
        -30,  5, 10, 15, 15, 10,  5,-30,
        -40,-20,  0,  5,  5,  0,-20,-40,
        -50,-40,-30,-30,-30,-30,-40,-50,
    ],
    b: [
        -20,-10,-10,-10,-10,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5, 10, 10,  5,  0,-10,
        -10,  5,  5, 10, 10,  5,  5,-10,
        -10,  0, 10, 10, 10, 10,  0,-10,
        -10, 10, 10, 10, 10, 10, 10,-10,
        -10,  5,  0,  0,  0,  0,  5,-10,
        -20,-10,-10,-10,-10,-10,-10,-20,
    ],
    r: [
          0,  0,  0,  0,  0,  0,  0,  0,
          5, 10, 10, 10, 10, 10, 10,  5,
         -5,  0,  0,  0,  0,  0,  0, -5,
         -5,  0,  0,  0,  0,  0,  0, -5,
         -5,  0,  0,  0,  0,  0,  0, -5,
         -5,  0,  0,  0,  0,  0,  0, -5,
         -5,  0,  0,  0,  0,  0,  0, -5,
          0,  0,  0,  5,  5,  0,  0,  0,
    ],
    q: [
        -20,-10,-10, -5, -5,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5,  5,  5,  5,  0,-10,
         -5,  0,  5,  5,  5,  5,  0, -5,
          0,  0,  5,  5,  5,  5,  0, -5,
        -10,  5,  5,  5,  5,  5,  0,-10,
        -10,  0,  5,  0,  0,  0,  0,-10,
        -20,-10,-10, -5, -5,-10,-10,-20,
    ],
};
// El rey quiere estar escondido en la esquina mientras hay damas y torres en
// el tablero, y activo en el centro cuando ya no queda con qué darle mate de
// un zarpazo — por eso son dos tablas, mezcladas según qué tan avanzada está
// la partida (ver `fase` en materialDeTablero).
const PST_REY_MEDIO = [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
];
const PST_REY_FINAL = [
    -50,-40,-30,-20,-20,-30,-40,-50,
    -30,-20,-10,  0,  0,-10,-20,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-30,  0,  0,  0,  0,-30,-30,
    -50,-30,-30,-30,-30,-30,-30,-50,
];
const FILES_PST = "abcdefgh";
function indicePst(casilla, color) {
    const file = FILES_PST.indexOf(casilla[0]);
    const rank = parseInt(casilla[1], 10);
    // Blancas: a8 es el índice 0 (avanzan "hacia abajo" en la tabla). Negras
    // miran la partida al revés, así que se refleja verticalmente.
    return color === "w" ? (8 - rank) * 8 + file : (rank - 1) * 8 + file;
}

// Cuánto material "mayor" (sin peones ni reyes) queda en el tablero, entre 0
// (final, cambiaron todas las piezas de peso) y 1 (recién empezada la
// partida). Lo que trae cada bando al inicio: 2 caballos + 2 alfiles + 2
// torres + 1 dama, con los valores de VALOR (unos 31.66 en esta escala).
const MATERIAL_INICIAL_SIN_PEONES = 2 * VALOR.n + 2 * VALOR.b + 2 * VALOR.r + VALOR.q;

const MODALIDADES = {
    estandar: {
        emoji: "⚔️", titulo: "Ajedrez Estándar",
        resumen: "La partida de siempre, con todas las reglas.",
        crear: () => adaptadorChess(new Chess()),
        tablero: "niebla", spectator: true,
    },
    niebla: {
        emoji: "🌫️", titulo: "Niebla de Guerra",
        resumen: "Solo ves lo que tus piezas alcanzan a ver.",
        crear: () => adaptadorChess(new Chess()),
        tablero: "niebla", spectator: false,
    },
    crazyhouse: {
        emoji: "♞", titulo: "Crazyhouse",
        resumen: "Las piezas que capturas vuelven al tablero de tu lado.",
        crear: () => adaptadorCrazyhouse(new Crazyhouse.Game()),
        tablero: "crazyhouse",
    },
    abrazos: {
        emoji: "🤗", titulo: "Ajedrez de abrazos",
        resumen: "Nadie captura: las piezas se abrazan y se unen.",
        crear: () => adaptadorVariante(Variantes.crear("abrazos")),
        tablero: "variante",
    },
    camaleon: {
        emoji: "🦎", titulo: "Camaleón",
        resumen: "Cada pieza mueve como la que empieza en su columna.",
        crear: () => adaptadorVariante(Variantes.crear("camaleon")),
        tablero: "variante",
    },
    ciegas: {
        emoji: "🙈", titulo: "A ciegas",
        resumen: "Ajedrez normal, pero sin ver las piezas: se escribe la jugada.",
        crear: () => adaptadorCiegas(Variantes.crear("ciegas")),
        tablero: "variante", ciegas: true,
    },
    cartas: {
        emoji: "🃏", titulo: "Ajedrez de Cartas",
        resumen: "Ajedrez de siempre + una mano de cartas de un solo uso.",
        crear: () => adaptadorCartas(CartasChess.Game.iniciar()),
        tablero: "cartas",
    },
    duelo: {
        emoji: "⚡", titulo: "Duelo Simultáneo",
        resumen: "Los dos eligen su jugada a la vez, en secreto, y se revela junta.",
        tablero: "duelo",
    },
};

/* ---------------- Adaptadores ----------------
   Cada uno envuelve su motor y le da al bot las cuatro cosas que pide. `probar`
   devuelve otro adaptador con la jugada hecha, sin tocar el original: por eso
   todos saben clonarse desde su propia posición serializada. */

/* La evaluación de la posición para las blancas, en peones: no solo material,
   también dónde está parada cada pieza (PST) y, en Crazyhouse, lo que hay en
   la reserva de cada quien — una torre en la mano vale lo mismo que una en el
   tablero, y el bot que no la contara jugaría como si no la tuviera. */
/* Una pasada por las 64 casillas y ni un objeto de más.
   Antes se armaba una lista `piezas` con un objeto nuevo por pieza
   (`Object.assign({casilla}, p)`) y se recorría tres veces: una para llenarla,
   otra para la fase de la partida y otra para sumar. Eso son ~32 objetos por
   evaluación, y el bot evalúa cientos de posiciones por jugada — basura que el
   recolector tiene que ir limpiando justo mientras se busca, que es cuando
   menos conviene pararse.
   Lo único que obligaba a las dos pasadas era el rey: su tabla se mezcla según
   la fase, y la fase no se sabe hasta haber visto el tablero entero. Se
   resuelve anotando en qué casilla está cada rey y sumando su parte al final:
   el rey vale 0 de material (VALOR.k), así que lo único que aporta es esa
   tabla. El número que sale es exactamente el mismo. */
function materialDeTablero(leer, casillas, pockets) {
    let total = 0, faseTotal = 0, alfilesW = 0, alfilesB = 0, reyW = null, reyB = null;
    for (let i = 0; i < casillas.length; i++) {
        const s = casillas[i];
        const p = leer(s);
        if (!p) continue;
        const blanca = p.color === "w";
        let v = 0;
        if (p.types) {
            // Pieza fusionada (Abrazos): no tiene una tabla de posición
            // propia (no es "de siempre" un caballo o un alfil), así que se
            // queda con el bono de centro genérico.
            for (let k = 0; k < p.types.length; k++) v += VALOR[p.types[k]] || 0;
            v += (CENTRO[s] || 0);
        } else {
            v = VALOR[p.type] || 0;
            if (p.type === "k") {
                if (blanca) reyW = s; else reyB = s;
            } else {
                if (p.type !== "p") faseTotal += v;
                const tabla = PST[p.type];
                if (tabla) {
                    v += tabla[indicePst(s, p.color)] / 100;
                    if (p.type === "b") { if (blanca) alfilesW++; else alfilesB++; }
                }
            }
        }
        total += blanca ? v : -v;
    }
    // Cuánto material "mayor" (sin peones ni reyes) queda en el tablero, entre
    // 0 (final, cambiaron todas las piezas de peso) y 1 (recién empezada).
    const fase = Math.min(1, faseTotal / (MATERIAL_INICIAL_SIN_PEONES * 2));
    if (reyW !== null) { const i = indicePst(reyW, "w"); total += (fase * PST_REY_MEDIO[i] + (1 - fase) * PST_REY_FINAL[i]) / 100; }
    if (reyB !== null) { const i = indicePst(reyB, "b"); total -= (fase * PST_REY_MEDIO[i] + (1 - fase) * PST_REY_FINAL[i]) / 100; }
    if (alfilesW >= 2) total += 0.3;
    if (alfilesB >= 2) total -= 0.3;
    if (pockets) {
        Crazyhouse.POCKET_TYPES.forEach((t) => {
            total += (pockets.w[t] || 0) * VALOR[t];
            total -= (pockets.b[t] || 0) * VALOR[t];
        });
    }
    return total;
}

const TODAS_LAS_CASILLAS = (function () {
    const out = [];
    for (let r = 1; r <= 8; r++) "abcdefgh".split("").forEach((f) => out.push(f + r));
    return out;
})();

/* ---------------- Qué promete una jugada, SIN jugarla ----------------
   Es lo que el bot (js/bot-oscar.js) usa para ordenar las jugadas de un nodo
   antes de explorarlas. Ahí está casi todo el costo de la búsqueda y no se
   ve: ordenarlas por `material()` obliga a CLONAR la posición de cada una
   —unos 123 µs por clon, cuarenta por nodo— y la poda alfa-beta después
   explora dos o tres. Con esto el orden sale de mirar dos casillas del
   tablero que ya está delante, y solo se clona la rama en la que se entra.

   No pretende acertar el valor de la jugada: solo ponerlas en un orden
   razonable. Un orden malo no da ningún resultado equivocado —alfa-beta
   devuelve lo mismo en cualquier orden—, solo poda menos.

   El criterio es el de siempre en ajedrez: primero las capturas, y entre
   ellas la que se queda con la pieza más gorda usando la más barata (si con
   el peón y con la dama se come la misma torre, se prueba antes la del
   peón: si la torre estaba defendida, la de la dama es un desastre). Va con
   `leer(casilla)` y no con los campos del objeto jugada porque los cinco
   motores devuelven jugadas con forma distinta, pero todos saben leer su
   propio tablero. En Abrazos nadie captura —las piezas se fusionan— y da
   igual: llegar encima de una pieza sigue siendo lo que más cambia la
   posición, que es justo lo que hay que mirar primero. */
function valorDePieza(p) {
    if (!p) return 0;
    if (p.types) { let v = 0; p.types.forEach((t) => { v += VALOR[t] || 0; }); return v; }
    return VALOR[p.type] || 0;
}

/* Lo que vale una pieza por DÓNDE está parada, con la misma tabla que usa
   materialDeTablero(). El rey se queda en cero: su tabla depende de la fase de
   la partida y calcularla acá sería recorrer el tablero entero, que es
   exactamente lo que este atajo viene a evitar. */
function valorPosicional(p, casilla) {
    if (!p || p.types || p.type === "k") return CENTRO[casilla] || 0;
    const tabla = PST[p.type];
    return tabla ? tabla[indicePst(casilla, p.color)] / 100 : (CENTRO[casilla] || 0);
}

function valorDeJugada(leer, j) {
    let v = 0;
    // Una pieza soltada desde la reserva (Crazyhouse) no viene de ninguna
    // casilla: no hay agresor que descontar.
    const agresor = j.drop ? null : (j.from ? leer(j.from) : null);
    // `captured` lo trae chess.js y es más fiel que mirar el destino: la
    // captura al paso se come un peón que NO está en la casilla de llegada,
    // y mirando solo el tablero pasaría por jugada tranquila.
    const victima = j.captured ? { type: j.captured } : (j.to ? leer(j.to) : null);
    if (victima) v += 10 * valorDePieza(victima) - valorDePieza(agresor);
    // Y en una posición SIN capturas —un final de peones, que es donde más
    // falta hace buscar hondo— lo de arriba vale cero para todas y el orden
    // quedaría al azar. Cuánto mejora de casilla la pieza que se mueve sí
    // distingue, y son dos consultas a una tabla: la misma señal que antes se
    // sacaba clonando la posición entera para mirarle el material.
    else v += valorPosicional(agresor, j.to) - valorPosicional(agresor, j.from);
    if (j.promotion) v += VALOR[j.promotion] || VALOR.q;
    else if (j.flags && j.flags.indexOf("p") !== -1) v += VALOR.q;
    if (j.drop) v += (VALOR[j.piece] || 0) / 2;
    return v;
}

function adaptadorChess(juego) {
    return {
        motor: juego,
        turno: () => juego.turn(),
        jugadas: () => juego.moves({ verbose: true }),
        probar(j) {
            const copia = new Chess(juego.fen());
            return copia.move({ from: j.from, to: j.to, promotion: j.promotion || "q" }) ? adaptadorChess(copia) : null;
        },
        material: () => materialDeTablero((s) => juego.get(s), TODAS_LAS_CASILLAS),
        valorJugada: (j) => valorDeJugada((s) => juego.get(s), j),
        // Sin esto el bot no distinguía "no tengo jugadas porque me dieron
        // mate" de "no tengo jugadas porque es ahogado": las dos son "sin
        // jugadas", pero una es pésima y la otra son tablas.
        enJaque: () => juego.in_check(),
        jugar(j) { return juego.move({ from: j.from, to: j.to, promotion: j.promotion || "q" }); },
        terminada: () => juego.game_over(),
        desenlace() {
            if (juego.in_checkmate()) return { fin: true, ganador: juego.turn() === "w" ? "b" : "w", texto: "Jaque mate" };
            if (juego.in_stalemate()) return { fin: true, ganador: null, texto: "Ahogado: tablas" };
            if (juego.game_over()) return { fin: true, ganador: null, texto: "Tablas" };
            return { fin: false };
        },
        posicion: () => juego.fen(),
    };
}

/* juego.moves() de Crazyhouse.Game delega sin más en chess.js: por su cuenta
   NUNCA ofrece soltar una pieza de la reserva. Sin esto el bot "no sabía" que
   podía hacer drops — la mitad de lo que hace especial a esta modalidad — y
   jugaba como si tuviera menos piezas de las que en realidad tiene en mano. */
function jugadasCrazyhouse(juego) {
    const normales = juego.moves({ verbose: true });
    const color = juego.turn();
    const drops = [];
    Crazyhouse.POCKET_TYPES.forEach((tipo) => {
        if (!juego.pocket(color)[tipo]) return;
        juego.dropSquares(tipo, color).forEach((sq) => drops.push({ drop: true, piece: tipo, to: sq }));
    });
    return normales.concat(drops);
}

function adaptadorCrazyhouse(juego) {
    return {
        motor: juego,
        turno: () => juego.turn(),
        jugadas: () => jugadasCrazyhouse(juego),
        probar(j) {
            const copia = new Crazyhouse.Game(juego.fen());
            const hecho = j.drop ? copia.drop(j.piece, j.to) : copia.move({ from: j.from, to: j.to, promotion: j.promotion || "q" });
            return hecho ? adaptadorCrazyhouse(copia) : null;
        },
        material: () => materialDeTablero((s) => juego.get(s), TODAS_LAS_CASILLAS, juego.pockets),
        valorJugada: (j) => valorDeJugada((s) => juego.get(s), j),
        enJaque: () => juego.in_check(),
        jugar(j) { return j.drop ? juego.drop(j.piece, j.to) : juego.move({ from: j.from, to: j.to, promotion: j.promotion || "q" }); },
        terminada: () => juego.in_checkmate() || juego.in_stalemate() || juego.in_draw(),
        desenlace() {
            if (juego.in_checkmate()) return { fin: true, ganador: juego.turn() === "w" ? "b" : "w", texto: "Jaque mate" };
            if (juego.in_stalemate()) return { fin: true, ganador: null, texto: "Ahogado: tablas" };
            if (juego.in_draw()) return { fin: true, ganador: null, texto: "Tablas" };
            return { fin: false };
        },
        posicion: () => juego.fen(),
    };
}

function adaptadorVariante(motor) {
    const id = motor instanceof Variantes.Abrazos ? "abrazos" : (motor instanceof Variantes.Camaleon ? "camaleon" : "ciegas");
    return {
        motor,
        id,
        turno: () => motor.turn(),
        jugadas: () => motor.allMoves(),
        probar(j) {
            const copia = Variantes.crear(id);
            copia.load(motor.serialize());
            return copia.move({ from: j.from, to: j.to, promotion: j.promotion || "q" }) ? adaptadorVariante(copia) : null;
        },
        material: () => materialDeTablero((s) => motor.get(s), TODAS_LAS_CASILLAS),
        valorJugada: (j) => valorDeJugada((s) => motor.get(s), j),
        enJaque: () => typeof motor.inCheck === "function" && motor.inCheck(),
        jugar(j) { return motor.move({ from: j.from, to: j.to, promotion: j.promotion || "q" }); },
        terminada() { return !motor.allMoves().length || !!motor.terminado; },
        desenlace() {
            if (motor.allMoves().length && !motor.terminado) return { fin: false };
            const enJaque = typeof motor.inCheck === "function" && motor.inCheck();
            return { fin: true, ganador: enJaque ? (motor.turn() === "w" ? "b" : "w") : null, texto: enJaque ? "Jaque mate" : "Sin jugadas: tablas" };
        },
        posicion: () => motor.serialize(),
    };
}

/* A ciegas es ajedrez normal con el tablero tapado: su motor delega en chess.js
   y no tiene allMoves() como los otros dos. Se le pregunta a chess.js las
   jugadas, pero se conserva el motor de la variante porque es el que el tablero
   sabe dibujar. */
function adaptadorCiegas(motor) {
    return {
        motor,
        turno: () => motor.turn(),
        jugadas: () => motor.game.moves({ verbose: true }),
        probar(j) {
            const copia = Variantes.crear("ciegas");
            copia.load(motor.serialize());
            return copia.move({ from: j.from, to: j.to, promotion: j.promotion || "q" }) ? adaptadorCiegas(copia) : null;
        },
        material: () => materialDeTablero((s) => motor.get(s), TODAS_LAS_CASILLAS),
        valorJugada: (j) => valorDeJugada((s) => motor.get(s), j),
        enJaque: () => motor.game.in_check(),
        jugar(j) { return motor.move({ from: j.from, to: j.to, promotion: j.promotion || "q" }); },
        terminada: () => motor.game.game_over(),
        desenlace() {
            const g = motor.game;
            if (g.in_checkmate()) return { fin: true, ganador: g.turn() === "w" ? "b" : "w", texto: "Jaque mate" };
            if (g.in_stalemate()) return { fin: true, ganador: null, texto: "Ahogado: tablas" };
            if (g.game_over()) return { fin: true, ganador: null, texto: "Tablas" };
            return { fin: false };
        },
        posicion: () => motor.serialize(),
    };
}

/* Ajedrez de Cartas: el ciclo de turno de siempre (mover) más, aparte, la
   posibilidad de jugar una carta ANTES de mover — eso lo decide
   jugarCartaBot() con una heurística, mutando el motor real directamente
   (no hace falta que la búsqueda del bot conozca las cartas). `jugar()`
   devuelve null en vez de {ok:false} para encajar con el resto de los
   adaptadores, que usan null como señal de "jugada inválida". */
function adaptadorCartas(juego) {
    return {
        motor: juego,
        turno: () => juego.turn(),
        jugadas: () => juego.legalMoves(),
        probar(j) {
            const copia = CartasChess.Game.fromJSON(juego.toJSON());
            const r = copia.move({ from: j.from, to: j.to, promotion: j.promotion || "q" });
            return r.ok ? adaptadorCartas(copia) : null;
        },
        material: () => materialDeTablero((s) => juego.get(s), TODAS_LAS_CASILLAS),
        valorJugada: (j) => valorDeJugada((s) => juego.get(s), j),
        enJaque: () => juego.inCheck(),
        jugar(j) {
            const r = juego.move({ from: j.from, to: j.to, promotion: j.promotion || "q" });
            return r.ok ? r : null;
        },
        terminada: () => juego.isGameOver(),
        desenlace() {
            if (juego.inCheckmate()) return { fin: true, ganador: juego.turn() === "w" ? "b" : "w", texto: "Jaque mate" };
            if (juego.inStalemate()) return { fin: true, ganador: null, texto: "Ahogado: tablas" };
            if (juego.inDraw()) return { fin: true, ganador: null, texto: "Tablas" };
            return { fin: false };
        },
        posicion: () => juego.toJSON(),
    };
}

// La pieza rival (o propia) más valiosa del tablero, sin contar el rey — la
// que más conviene congelar o proteger con una carta.
function piezaMasValiosaDe(motor, color) {
    let mejor = null, mejorValor = -1;
    TODAS_LAS_CASILLAS.forEach((sq) => {
        const p = motor.get(sq);
        if (!p || p.color !== color || p.type === "k") return;
        const v = VALOR[p.type] || 0;
        if (v > mejorValor) { mejorValor = v; mejor = sq; }
    });
    return mejor;
}

// Heurística de cartas del bot: se llama ANTES de calcular su jugada de
// tablero, sobre el motor REAL (lo muta directamente con playCard). No
// busca la mejor combinación posible — cada carta tiene una condición
// simple y razonable, en el orden en que más suelen convenir.
function jugarCartaBot(motor, color) {
    const mano = motor.hands[color] || [];
    if (!mano.length) return;
    const rival = color === "w" ? "b" : "w";

    if (mano.indexOf("ascenso") !== -1) {
        const objetivo = TODAS_LAS_CASILLAS.find((sq) => {
            const p = motor.get(sq);
            if (!p || p.type !== "p" || p.color !== color) return false;
            const rank = parseInt(sq[1], 10);
            return color === "w" ? rank >= 6 : rank <= 3;
        });
        if (objetivo && motor.playCard(color, "ascenso", { square: objetivo, promotion: "q" }).ok) return;
    }

    if (mano.indexOf("refuerzo") !== -1) {
        const candidatas = TODAS_LAS_CASILLAS.filter((sq) => {
            if (motor.get(sq)) return false;
            const rank = parseInt(sq[1], 10);
            return color === "w" ? (rank >= 2 && rank <= 4) : (rank >= 5 && rank <= 7);
        }).sort((a, b) => (CENTRO[b] || 0) - (CENTRO[a] || 0));
        if (candidatas.length && motor.playCard(color, "refuerzo", { square: candidatas[0] }).ok) return;
    }

    if (mano.indexOf("congelar") !== -1) {
        const objetivo = piezaMasValiosaDe(motor, rival);
        if (objetivo && motor.playCard(color, "congelar", { square: objetivo }).ok) return;
    }

    if (mano.indexOf("escudo") !== -1) {
        const objetivo = piezaMasValiosaDe(motor, color);
        if (objetivo && motor.playCard(color, "escudo", { square: objetivo }).ok) return;
    }

    if (mano.indexOf("robo") !== -1 && (motor.hands[rival] || []).length > mano.length) {
        if (motor.playCard(color, "robo", {}).ok) return;
    }

    if (mano.indexOf("salto") !== -1 && motor.inCheck()) {
        if (motor.playCard(color, "salto", {}).ok) return;
    }

    // Doble turno vale la pena cuando hay algo grueso que capturar YA: la
    // jugada obligada de esta ronda se come una pieza de peso y la siguiente
    // (gracias a la carta) puede rematar o defender lo que quedó flojo. Se
    // mira `motor.legalMoves()` en vez de tirar una moneda: es información
    // que el motor ya tiene calculada, no hace falta simular nada.
    if (mano.indexOf("doble") !== -1) {
        const hayCapturaValiosa = motor.legalMoves().some((m) => m.captured && (VALOR[m.captured] || 0) >= 3);
        if (hayCapturaValiosa && motor.playCard(color, "doble", {}).ok) return;
    }
    // Visión no toca el tablero, así que no hay ningún motivo para guardarla
    // "por si acaso" — es la única carta que nunca puede salir mal jugarla ya.
    if (mano.indexOf("vision") !== -1) {
        motor.playCard(color, "vision", {});
    }
}

/* Duelo Simultáneo: no hay "adaptador persistente" — el bot elige, de una
   sola vez, la jugada que compromete al arrancar la ronda, sin saber qué va
   a elegir el humano (es el sentido del commit/reveal). Por eso `jugadas()`
   siempre mira al mismo color fijo (el del bot) y `probar()` no encadena una
   segunda búsqueda: no hay "la respuesta del rival" que mirar todavía. Con
   BotOscar esto colapsa a "elegir la jugada que más material deja después de
   la propia", que es justo lo único que se puede calcular sin ver al rival. */
function adaptadorDuelo(dueloGame, colorFijo) {
    return {
        turno: () => colorFijo,
        jugadas: () => dueloGame.legalMovesFor(colorFijo),
        probar(j) {
            const clon = new Chess(dueloGame.fen());
            const partes = clon.fen().split(" ");
            partes[1] = colorFijo;
            clon.load(partes.join(" "));
            const hecho = clon.move({ from: j.from, to: j.to, promotion: j.promotion || "q" });
            if (!hecho) return null;
            return {
                turno: () => (colorFijo === "w" ? "b" : "w"),
                jugadas: () => [],
                probar: () => null,
                material: () => materialDeTablero((s) => clon.get(s), TODAS_LAS_CASILLAS),
            };
        },
        material: () => materialDeTablero((s) => dueloGame.get(s), TODAS_LAS_CASILLAS),
        valorJugada: (j) => valorDeJugada((s) => dueloGame.get(s), j),
    };
}

/* ---------------- Estado de la pantalla ---------------- */
const $ = (id) => document.getElementById(id);
let modalidad = "estandar", nivel = 2, miColor = "w";
let ad = null, board = null, historial = [], terminada = false, pensando = false;

function pintarOpciones() {
    const caja = $("modalidades");
    caja.innerHTML = "";
    Object.keys(MODALIDADES).forEach((id) => {
        const m = MODALIDADES[id];
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.modalidad = id;
        b.className = claseOpcion(id === modalidad);
        b.innerHTML = `<span class="font-semibold">${m.emoji} ${m.titulo}</span><br><span class="text-xs opacity-80">${m.resumen}</span>`;
        b.addEventListener("click", () => { modalidad = id; pintarOpciones(); });
        caja.appendChild(b);
    });

    const niv = $("niveles");
    niv.innerHTML = "";
    Object.keys(BotOscar.NIVELES).forEach((n) => {
        const d = BotOscar.NIVELES[n];
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.nivel = n;
        b.className = claseOpcion(Number(n) === nivel);
        b.innerHTML = `<span class="font-semibold">${"★".repeat(Number(n))} ${d.nombre}</span><br><span class="text-xs opacity-80">${d.descripcion}</span>`;
        b.addEventListener("click", () => { nivel = Number(n); pintarOpciones(); });
        niv.appendChild(b);
    });

    document.querySelectorAll(".color-opt").forEach((b) => {
        b.className = "color-opt " + claseOpcion(b.dataset.color === miColor);
        b.onclick = () => { miColor = b.dataset.color; pintarOpciones(); };
    });
}

const claseOpcion = (sel) => "w-full text-left px-4 py-3 rounded-xl border-2 text-sm transition-colors " +
    (sel ? "border-accent-500 bg-accent-50 dark:bg-brand-800 text-brand-800 dark:text-white"
         : "border-brand-100 dark:border-brand-700 hover:border-accent-400 text-brand-600 dark:text-brand-300");

/* ---------------- Jugar ---------------- */
function prepararVistaJuego(m) {
    $("setup-view").classList.add("hidden");
    $("game-view").classList.remove("hidden");
    $("g-titulo").textContent = `${m.emoji} ${m.titulo}`;
    $("g-nivel").textContent = `Bot ${BotOscar.NIVELES[nivel].nombre} · tú con ${miColor === "w" ? "blancas" : "negras"}`;
    $("panel-ciegas").classList.toggle("hidden", !m.ciegas);
    $("top-pocket").classList.toggle("hidden", m.tablero !== "crazyhouse");
    $("bottom-pocket").classList.toggle("hidden", m.tablero !== "crazyhouse");
    $("cartas-rivales").classList.toggle("hidden", m.tablero !== "cartas");
    $("cartas-propias").classList.toggle("hidden", m.tablero !== "cartas");
    $("duelo-controles").classList.add("hidden"); // se destapa sola cuando haya una jugada lista para comprometer
}

function empezar() {
    const m = MODALIDADES[modalidad];
    prepararVistaJuego(m);
    historial = [];
    terminada = false;
    pensando = false;

    if (m.tablero === "duelo") { empezarDuelo(); return; }

    ad = m.crear();
    montarTablero(m);
    pintarHistorial();
    actualizar();
    if (ad.turno() !== miColor) setTimeout(turnoDelBot, 500);
}

function montarTablero(m) {
    const el = $("board");
    el.innerHTML = "";
    const comun = {
        interactive: true,
        myColor: miColor,
        onMove: alMover,
        // El tablero llama a esto como (from, to, cb), no (info, cb) — pasarle
        // menos parámetros de los que espera deja `cb` apuntando a la casilla
        // de destino en vez de al callback, y `cb("q")` truena.
        onPromotionNeeded: (from, to, cb) => cb("q"),
    };
    if (m.tablero === "niebla") {
        board = new NieblaBoard(el, Object.assign({ spectator: !!m.spectator }, comun));
        board.loadFen(ad.posicion());
    } else if (m.tablero === "crazyhouse") {
        board = new CrazyhouseBoard(el, $("top-pocket"), $("bottom-pocket"), comun);
        board.loadFen(ad.posicion());
    } else if (m.tablero === "cartas") {
        board = new CartasBoard(el, $("cartas-propias"), $("cartas-rivales"), Object.assign({
            onAscensoPieceNeeded: mostrarAscensoPicker,
        }, comun));
        board.loadState(ad.posicion());
    } else {
        board = new VarianteBoard(el, Object.assign({
            engine: ad.motor,
            hidePieces: !!m.ciegas,
            ariaLabel: "Tablero de " + m.titulo,
        }, comun));
        board.load(ad.posicion());
        if (m.ciegas) board.setHidePieces(true);
    }
}

function mostrarAscensoPicker(square, callback) {
    const modal = $("ascenso-modal");
    const optionsEl = $("ascenso-options");
    optionsEl.innerHTML = "";
    let resuelto = false;
    const glyphs = miColor === "b" ? { q: "♛", r: "♜", b: "♝", n: "♞" } : { q: "♕", r: "♖", b: "♗", n: "♘" };
    [["q", glyphs.q], ["r", glyphs.r], ["b", glyphs.b], ["n", glyphs.n]].forEach(([tipo, glyph]) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "w-12 h-12 text-3xl rounded-lg border-2 border-brand-200 dark:border-brand-700 hover:border-accent-500 bg-white dark:bg-brand-800 transition-colors";
        btn.textContent = glyph;
        btn.addEventListener("click", () => { if (resuelto) return; resuelto = true; modal.classList.add("hidden"); callback(tipo); });
        optionsEl.appendChild(btn);
    });
    modal.classList.remove("hidden");
}

function alMover(info) {
    if (terminada || pensando) { refrescar(); return; }
    const m = MODALIDADES[modalidad];
    if (m.tablero === "variante") {
        // El tablero comparte el mismo motor que `ad` (engine: ad.motor): la
        // jugada humana YA se aplicó ahí mismo. Repetirla fallaría (la pieza
        // ya no está en la casilla de origen) y desharía el movimiento.
        anotar(info, info);
        refrescar();
        if (revisarFinal()) return;
        setTimeout(turnoDelBot, BotOscar.demora(nivel));
        return;
    }
    if (ad.turno() !== miColor) { refrescar(); return; }
    // niebla/crazyhouse/cartas: el tablero lleva su PROPIO motor, separado del
    // adaptador del bot — se sincroniza `ad` desde el estado que el tablero
    // ya produjo.
    if (m.tablero === "cartas") ad = adaptadorCartas(CartasChess.Game.fromJSON(board.state()));
    else ad.motor.load(info.fen);
    anotar(info, info);
    refrescar();
    if (revisarFinal()) return;
    setTimeout(turnoDelBot, BotOscar.demora(nivel));
}

function turnoDelBot() {
    if (terminada || ad.turno() === miColor) return;
    pensando = true;
    actualizar();
    if (MODALIDADES[modalidad].tablero === "cartas") jugarCartaBot(ad.motor, ad.turno());
    const jugada = BotOscar.jugar(ad, nivel);
    pensando = false;
    if (!jugada) { revisarFinal(); return; }
    const hecho = ad.jugar(jugada);
    anotar(hecho, jugada);
    refrescar();
    if (revisarFinal()) return;
    // "Doble turno" (Ajedrez de Cartas) le devuelve el turno a quien acaba de
    // mover: si sigue siendo el del bot, que juegue otra vez.
    if (ad.turno() !== miColor) setTimeout(turnoDelBot, BotOscar.demora(nivel));
}

function anotar(hecho, jugada) {
    const texto = (hecho && (hecho.san || hecho.sanEs)) || `${jugada.from}${jugada.to}`;
    historial.push(texto);
    pintarHistorial();
}

function refrescar() {
    const m = MODALIDADES[modalidad];
    if (m.tablero === "variante") board.load(ad.posicion());
    else if (m.tablero === "cartas") board.loadState(ad.posicion());
    else board.loadFen(ad.posicion());
    actualizar();
}

function pintarHistorial() {
    const ol = $("historial");
    ol.innerHTML = "";
    if (MODALIDADES[modalidad].tablero === "duelo") {
        historial.forEach((linea) => {
            const li = document.createElement("li");
            li.className = "col-span-2 sm:col-span-3";
            li.textContent = linea;
            ol.appendChild(li);
        });
        return;
    }
    for (let i = 0; i < historial.length; i += 2) {
        const li = document.createElement("li");
        li.textContent = `${i / 2 + 1}. ${historial[i]}${historial[i + 1] ? " " + historial[i + 1] : ""}`;
        ol.appendChild(li);
    }
}

function actualizar() {
    if (terminada) return;
    const miTurno = ad.turno() === miColor;
    avisar(pensando ? "El bot está pensando…" : (miTurno ? "Es tu turno." : "Juega el bot…"), "normal");
    if (MODALIDADES[modalidad].ciegas) $("ciegas-input").disabled = !miTurno;
}

function revisarFinal() {
    const d = ad.desenlace();
    if (!d.fin) return false;
    terminada = true;
    const gane = d.ganador === miColor;
    avisar(d.ganador === null
        ? `${d.texto}. La partida terminó en tablas.`
        : `${d.texto}. ${gane ? "🎉 ¡Ganaste!" : "Ganó el bot — a la próxima."}`, gane ? "logro" : "fin");
    if (MODALIDADES[modalidad].ciegas && board.setHidePieces) { board.setHidePieces(false); refrescarSinAviso(); }
    return true;
}

function refrescarSinAviso() {
    const m = MODALIDADES[modalidad];
    if (m.tablero === "variante") board.load(ad.posicion()); else board.loadFen(ad.posicion());
}

function avisar(texto, tipo) {
    const estilos = {
        normal: "bg-brand-100 dark:bg-brand-900 text-brand-600 dark:text-brand-300",
        fin: "bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-200 font-medium",
        logro: "bg-green-50 dark:bg-green-900/40 text-green-800 dark:text-green-300 font-medium",
        error: "bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300",
    };
    $("status").className = "mb-3 rounded-xl px-4 py-3 text-sm " + (estilos[tipo] || estilos.normal);
    $("status").textContent = texto;
}

/* ---------------- A ciegas: la jugada se escribe ----------------
   Se pasa por moveText() del motor, que es el que entiende la notación en
   español y en inglés y también las coordenadas (Cf3, Nf3, g1f3, 0-0). Es el
   mismo camino que usa la página de partida. */
function jugarEscrita() {
    if (!ad || terminada || pensando || ad.turno() !== miColor) return;
    const texto = $("ciegas-input").value.trim();
    if (!texto) return;
    const hecho = ad.motor.moveText(texto);
    if (!hecho) { avisar("Esa jugada no es legal. Prueba otra vez.", "error"); return; }
    $("ciegas-input").value = "";
    anotar(hecho, {});
    refrescar();
    if (revisarFinal()) return;
    setTimeout(turnoDelBot, BotOscar.demora(nivel));
}

/* ---------------- Duelo Simultáneo ----------------
 * No usa el ciclo turno-por-turno de arriba: acá no hay "espera tu turno",
 * los dos jugadores comprometen su jugada de la ronda sin ver la del otro
 * (commit/reveal con hash+sal, ver js/duelo-engine.js) y las dos se aplican
 * juntas en cuanto están las dos reveladas.
 *
 * El bot no tiene por qué esperar al humano para decidir la suya — no puede
 * verla de todos modos —, así que la compromete apenas arranca la ronda; el
 * humano puede tardar lo que quiera en elegir la suya mientras tanto. */
let dueloBotSecreto = null, dueloMiSecreto = null;

function botColorDuelo() { return miColor === "w" ? "b" : "w"; }

function empezarDuelo() {
    ad = null;
    dueloBotSecreto = null;
    dueloMiSecreto = null;
    const el = $("board");
    el.innerHTML = "";
    board = new DueloBoard(el, {
        interactive: true,
        myColor: miColor,
        onPromotionNeeded: (from, to, cb) => cb("q"),
        onStagedChange: actualizarDuelo,
    });
    pintarHistorial();
    nuevaRondaDuelo();
}

function nuevaRondaDuelo() {
    dueloBotSecreto = null;
    board.setInteractive(true);
    actualizarDuelo();
    const jugada = BotOscar.jugar(adaptadorDuelo(board.game, botColorDuelo()), nivel);
    if (!jugada) return; // sin jugadas legales para el bot: la ronda ya está en jaque mate/ahogado, avanzarDuelo() no llegará a resolverse y el humano queda con el control
    setTimeout(async () => {
        const r = await board.game.commitMove(botColorDuelo(), { from: jugada.from, to: jugada.to, promotion: jugada.promotion });
        if (r.ok) dueloBotSecreto = { move: r.move, salt: r.salt };
        actualizarDuelo();
        await avanzarDuelo();
    }, BotOscar.demora(nivel));
}

// Revela lo que haga falta y resuelve la ronda en cuanto las dos jugadas
// estén comprometidas — se llama después de cada compromiso (del bot y del
// humano), y es segura de llamar de más: cada paso comprueba su propia
// condición antes de actuar.
async function avanzarDuelo() {
    const g = board.game;
    if (g.gameOver) return;
    if (g.commit[botColorDuelo()] && !g.reveal[botColorDuelo()] && dueloBotSecreto && g.bothCommitted()) {
        await g.revealMove(botColorDuelo(), dueloBotSecreto.move, dueloBotSecreto.salt);
    }
    if (g.commit[miColor] && !g.reveal[miColor] && dueloMiSecreto && g.bothCommitted()) {
        await g.revealMove(miColor, dueloMiSecreto.move, dueloMiSecreto.salt);
    }
    if (g.bothRevealed()) {
        const res = g.resolveRound();
        dueloBotSecreto = null;
        dueloMiSecreto = null;
        historial.push(`Ronda ${res.lastRound.round}: blancas ${res.lastRound.w} · negras ${res.lastRound.b}${res.lastRound.choque ? " (choque)" : ""}`);
        pintarHistorial();
        board.selected = null;
        board.staged = null;
        board.locked = false;
        board.render();
        if (res.gameOver) {
            terminada = true;
            const gane = res.result === miColor;
            avisar(res.result === "draw" ? "Tablas." : (gane ? "🎉 ¡Ganaste!" : "Ganó el bot — a la próxima."), gane ? "logro" : "fin");
            $("duelo-controles").classList.add("hidden");
            return;
        }
        nuevaRondaDuelo();
    }
}

function actualizarDuelo() {
    if (terminada) return;
    const g = board.game;
    $("duelo-controles").classList.toggle("hidden", !board.staged);
    if (g.commit[miColor]) avisar("Ya comprometiste tu jugada — esperando a que se revele la ronda…", "normal");
    else avisar("Elige tu jugada en secreto: el bot no la ve hasta que las dos estén comprometidas.", "normal");
}

$("duelo-confirmar").addEventListener("click", async () => {
    if (!board.staged || board.game.commit[miColor]) return;
    const r = await board.game.commitMove(miColor, board.staged);
    if (!r.ok) { avisar(r.error, "error"); return; }
    dueloMiSecreto = { move: r.move, salt: r.salt };
    board.markLocked();
    actualizarDuelo();
    await avanzarDuelo();
});
$("duelo-cambiar").addEventListener("click", () => { board.clearStaged(); actualizarDuelo(); });

/* ---------------- Arranque ---------------- */
$("empezar-btn").addEventListener("click", empezar);
$("otra-btn").addEventListener("click", () => {
    $("game-view").classList.add("hidden");
    $("setup-view").classList.remove("hidden");
});
$("rendirse-btn").addEventListener("click", async () => {
    if (terminada) return;
    if (!(await Avisos.confirmar("La partida se termina y gana el bot.", { titulo: "¿Rendirte?", aceptar: "Rendirme", peligro: true }))) return;
    // Mientras el diálogo estaba abierto la partida pudo terminar sola.
    if (terminada) return;
    terminada = true;
    avisar("Te rendiste. Ganó el bot.", "fin");
});
$("ciegas-btn").addEventListener("click", jugarEscrita);
$("ciegas-input").addEventListener("keydown", (e) => { if (e.key === "Enter") jugarEscrita(); });

(function init() {
    const pedida = new URLSearchParams(location.search).get("modalidad");
    if (pedida && MODALIDADES[pedida]) modalidad = pedida;
    pintarOpciones();
})();
    