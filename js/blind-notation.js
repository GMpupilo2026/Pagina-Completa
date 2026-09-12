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

  // ===== Modo Speech: leer los anuncios en voz alta con el propio navegador =====
  // Todo lo de arriba ya queda escrito en regiones aria-live — un lector de pantalla
  // real (NVDA, JAWS, VoiceOver, TalkBack) lo lee solo. Pero no todo el mundo tiene
  // uno activado (un alumno en una compu compartida, un celular sin TalkBack
  // encendido, o Oscar mismo probando sin lector de pantalla) — para esos casos, el
  // navegador puede hablar directamente con la Web Speech API, sin depender de nada
  // instalado aparte. Es un complemento, no un reemplazo: se activa aparte (apagado
  // por defecto) para no duplicar la voz de quien ya tiene su propio lector de
  // pantalla activo, que hablaría al mismo tiempo que esto.
  const SPEECH_KEY = 'oscarSpeechMode_v1';
  const hasSpeechApi = typeof window !== 'undefined' && 'speechSynthesis' in window;

  function isSpeechEnabled() {
    if (!hasSpeechApi) return false;
    try { return localStorage.getItem(SPEECH_KEY) === '1'; } catch (e) { return false; }
  }

  function setSpeechEnabled(on) {
    try { localStorage.setItem(SPEECH_KEY, on ? '1' : '0'); } catch (e) {}
    if (!on && hasSpeechApi) window.speechSynthesis.cancel();
  }

  // Habla el texto si el modo Speech está activo. Cancela cualquier frase anterior
  // todavía en curso — si no, jugadas seguidas (la propia y la respuesta del motor)
  // se irían acumulando en cola y se escucharían con retraso.
  function speak(text) {
    if (!hasSpeechApi || !isSpeechEnabled() || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(String(text));
      utterance.lang = 'es-ES';
      window.speechSynthesis.speak(utterance);
    } catch (e) {}
  }

  // Botón "🗣️ Voz" reutilizable: se coloca junto al interruptor normal/adaptado de
  // cada página y solo aparece cuando el modo adaptado está activo (sin lector de
  // pantalla real ni modo adaptado, no tiene nada que leer). `getVisible()` decide
  // si el botón debe mostrarse en este momento (normalmente, si blindMode es true).
  function setupSpeechToggle(buttonId, getVisible) {
    const btn = document.getElementById(buttonId);
    if (!btn || !hasSpeechApi) return null;
    function render() {
      const visible = getVisible();
      // style.display en vez de una clase "hidden": las páginas que usan este botón no
      // comparten todas la misma hoja de estilos (unas usan Tailwind, otras CSS propio),
      // así que esto funciona igual sin depender de que exista esa clase en cada una.
      btn.style.display = visible ? '' : 'none';
      if (!visible) return;
      const on = isSpeechEnabled();
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.textContent = on ? '🗣️ Voz activada' : '🔇 Activar voz';
      btn.title = on
        ? 'El navegador lee en voz alta cada anuncio — clic para apagarlo'
        : 'Además del lector de pantalla, el navegador puede leer en voz alta cada anuncio — clic para activarlo';
    }
    btn.addEventListener('click', function () {
      setSpeechEnabled(!isSpeechEnabled());
      render();
    });
    render();
    return render; // por si la página necesita refrescarlo al cambiar de modo
  }

  return {
    fileName, squareSpoken, textSpoken, sanSpoken, groupedReadoutHTML, FILE_NAMES, PIECE_LABEL, PIECE_ORDER,
    isSpeechEnabled, setSpeechEnabled, speak, setupSpeechToggle,
  };
})();
