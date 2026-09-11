/* ===== Ajedrez Integral — Notación de columnas para Modo Adaptado =====
 * En modo adaptado (lector de pantalla), decir una casilla como "b4" en voz
 * puede confundirse con "v4" o "p4" — muchas letras suenan parecido leídas
 * en voz alta. Para evitarlo, cada columna (a-h) se reemplaza por una palabra
 * propia que empieza con esa misma letra, igual que un alfabeto fonético:
 *
 *   a → anna     c → cesar    e → eva      g → gustav
 *   b → bella    d → david    f → felix    h → hector
 *
 * La fila (el número 1-8) no cambia. "e4" se dice "eva 4".
 *
 * Esta es la misma notación (y las mismas palabras) que ya usa tablero.html /
 * js/tablero-board.js para el comando "T" (dictado de la posición) — este
 * archivo la comparte con 4x4, Aprender y Coordenadas para que sea idéntica
 * en todas partes de Entrenamiento.
 */
window.BlindNotation = (function () {
  const FILE_NAMES = {
    a: 'anna', b: 'bella', c: 'cesar', d: 'david',
    e: 'eva', f: 'felix', g: 'gustav', h: 'hector',
  };
  const PIECE_LABEL = { k: 'rey', q: 'dama', r: 'torre', b: 'alfil', n: 'caballo', p: 'peón' };
  const PIECE_ORDER = ['k', 'q', 'r', 'b', 'n', 'p'];
  const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  function fileName(file) {
    return FILE_NAMES[String(file).toLowerCase()] || file;
  }

  // "e4" -> "eva 4"
  function squareSpoken(square) {
    if (!square || square.length < 2) return square;
    return fileName(square[0]) + ' ' + square.slice(1);
  }

  // Reemplaza cada casilla suelta (letra a-h seguida de un número 1-8) dentro
  // de un texto más largo por su forma hablada, con un espacio antes por si
  // venía pegada a otra letra (por ejemplo una inicial de pieza en SAN) —
  // útil como conversión genérica de respaldo. Para leer una jugada SAN
  // completa y bien formada, usar sanSpoken() en vez de esta función.
  function textSpoken(text) {
    return String(text).replace(/([a-hA-H])([1-8])/g, function (m, f, r) {
      return ' ' + fileName(f.toLowerCase()) + ' ' + r;
    }).replace(/\s+/g, ' ').trim();
  }

  // Lee en voz una jugada en notación SAN (la que da chess.js: "Nf3", "Qxd8+",
  // "O-O", "e8=Q#", "Rad1"...) usando el nombre de pieza en español y la
  // notación de columnas adaptada para cada casilla, en vez de deletrear la
  // notación algebraica tal cual (que puede sonar ambigua o ilegible).
  function sanSpoken(san) {
    if (!san) return san;
    const checkMate = /#$/.test(san);
    const check = !checkMate && /\+$/.test(san);
    if (/^O-O-O/.test(san)) return 'Enroque largo' + (checkMate ? ', jaque mate' : check ? ', jaque' : '');
    if (/^O-O/.test(san)) return 'Enroque corto' + (checkMate ? ', jaque mate' : check ? ', jaque' : '');

    const m = san.match(/^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([QRBN]))?[+#]?$/);
    if (!m) return textSpoken(san); // formato inesperado: al menos separa letra+número
    const [, piece, disambigFile, disambigRank, capture, dest, promo] = m;
    const parts = [];
    if (piece) parts.push(PIECE_LABEL[piece.toLowerCase()]);
    if (disambigFile) parts.push(fileName(disambigFile));
    if (disambigRank) parts.push(disambigRank);
    if (capture) parts.push('captura');
    parts.push(squareSpoken(dest));
    if (promo) parts.push('corona ' + PIECE_LABEL[promo.toLowerCase()]);
    if (checkMate) parts.push('jaque mate');
    else if (check) parts.push('jaque');
    return parts.join(' ');
  }

  // A partir de un objeto chess.js (con .get(casilla) para a1..h8), arma el
  // HTML de la descripción completa de la posición, agrupada por color y tipo
  // de pieza, con encabezados reales (h2/h3) para poder navegarla con las
  // teclas de encabezado del lector de pantalla — igual que el comando "T" de
  // tablero.html:
  //
  //   <p>Turno de blancas.</p>
  //   <h2>Piezas</h2>
  //   <h3>Blancas</h3>
  //   <p>rey: felix 1</p>
  //   <p>dama: hector 1</p>
  //   ...
  //   <h3>Negras</h3>
  //   ...
  function groupedReadoutHTML(game, opts) {
    opts = opts || {};
    const byColor = { w: {}, b: {} };
    FILES.forEach(function (file) {
      for (let rank = 1; rank <= 8; rank++) {
        const square = file + rank;
        const piece = game.get(square);
        if (!piece) continue;
        if (!byColor[piece.color][piece.type]) byColor[piece.color][piece.type] = [];
        byColor[piece.color][piece.type].push(square);
      }
    });

    let html = '';
    if (opts.includeTurn !== false) {
      const turn = game.turn() === 'w' ? 'blancas' : 'negras';
      const check = typeof game.in_check === 'function' && game.in_check() ? ', en jaque' : '';
      html += '<p>Turno de ' + turn + check + '.</p>';
    }
    html += '<h2>Piezas</h2>';
    const colorLabel = { w: 'Blancas', b: 'Negras' };
    ['w', 'b'].forEach(function (color) {
      html += '<h3>' + colorLabel[color] + '</h3>';
      const lines = [];
      PIECE_ORDER.forEach(function (type) {
        const squares = byColor[color][type];
        if (!squares || !squares.length) return;
        // Mismo orden que tablero-board.js: alfabético simple sobre la
        // casilla real (a1 antes que h1), y recién después se convierte a
        // la palabra de columna.
        const spoken = squares.slice().sort().map(squareSpoken).join(', ');
        lines.push(PIECE_LABEL[type] + ': ' + spoken);
      });
      html += lines.length
        ? lines.map(function (l) { return '<p>' + l + '</p>'; }).join('')
        : '<p>Sin piezas ' + (color === 'w' ? 'blancas' : 'negras') + ' en el tablero.</p>';
    });
    return html;
  }

  return { fileName, squareSpoken, textSpoken, sanSpoken, groupedReadoutHTML, FILE_NAMES, PIECE_LABEL, PIECE_ORDER };
})();
