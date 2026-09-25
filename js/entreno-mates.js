/* El código de entreno/mates.html.

   Vivía escrito dentro de la página, en un <script> de 23 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

const gate = document.getElementById('gate');
const app = document.getElementById('app');
const gateChecking = document.getElementById('gate-checking');
const NEXT_PATH = 'entreno/mates.html';

async function unlock(){
  gate.classList.add('hidden');
  app.classList.remove('hidden');
  EntrenoProgress.init();
  // El progreso vive en la cuenta: se baja y se funde con el de este aparato
  // ANTES de pintar, para seguir donde se quedó aunque sea otro dispositivo.
  await ProgresoUsuario.init();
  loadPuzzlesThenStart();
}

const GLYPH = {
  w: { p:'♙', n:'♘', b:'♗', r:'♖', q:'♕', k:'♔' },
  b: { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', k:'♚' },
};

const CATEGORY_ORDER = ['mate1', 'mate2', 'mate3'];
const CATEGORY_LABEL = { mate1: '🎯 Mate en 1', mate2: '⚔️ Mate en 2', mate3: '🏆 Mate en 3' };
const CATEGORY_VAR = { mate1: '--mate1', mate2: '--mate2', mate3: '--mate3' };
const CATEGORY_PLIES = { mate1: 1, mate2: 3, mate3: 5 }; // jugadas totales (blancas+negras) hasta el mate

let PUZZLES = { mate1: [], mate2: [], mate3: [] };

/* ---------------- Modo normal / modo adaptado (lector de pantalla) ---------------- */
const BLIND_MODE_KEY = 'oscarBlindMode_v1';
let blindMode = false;
try{ blindMode = localStorage.getItem(BLIND_MODE_KEY) === '1'; }catch(e){}

function renderPositionReadout(){
  const readout = document.getElementById('position-readout');
  if(!blindMode || !game){ readout.style.display = 'none'; return; }
  readout.innerHTML = window.BlindNotation.groupedReadoutHTML(game);
  readout.style.display = 'block';
}
// Botón "🗣️ Voz": el navegador lee en voz alta cada anuncio (además de lo que ya
// lee un lector de pantalla real), para quien no tiene uno activado. Ver
// js/blind-notation.js para el porqué es un complemento aparte, apagado por defecto.
const refreshSpeechToggle = window.BlindNotation
  ? window.BlindNotation.setupSpeechToggle('speech-toggle-btn', () => true)
  : null;

/* EL TABLERO YA NO SE ESCONDE EN MODO ADAPTADO, y es el cambio de fondo de esta
   página. Antes desaparecía y quedaba solo el recuadro: con eso, la única forma
   de saber qué había era oír la posición entera de corrido y acordarse de las
   treinta y dos piezas. Un tablero se MIRA — se va a la casilla, se pregunta qué
   hay al lado, se busca dónde está la dama— y eso es justo lo que el tablero
   escondido no deja hacer. Ahora se queda, se recorre con las flechas y se le
   puede preguntar (js/tablero-accesible.js). Quien ve poco además lo necesita a
   la vista: es la razón por la que amplía la pantalla.
   El recuadro no se enseña ni se esconde desde acá: lo destapa el CSS con la
   clase `adaptive-mode`, así que encender el modo surte efecto al instante sin
   volver a pintar el ejercicio. */
function applyBlindModeUI(){
  if(modeNormalBtn){ modeNormalBtn.setAttribute('aria-pressed', blindMode ? 'false' : 'true'); modeNormalBtn.classList.toggle('active', !blindMode); }
  if(modeBlindBtn){ modeBlindBtn.setAttribute('aria-pressed', blindMode ? 'true' : 'false'); modeBlindBtn.classList.toggle('active', blindMode); }
  if(refreshSpeechToggle) refreshSpeechToggle();
  renderPositionReadout();
}
function setBlindMode(value){
  blindMode = !!value;
  /* La preferencia se guarda por js/adaptive-mode.js y no escribiendo la clave
     a mano: además de guardarla, enciende la clase `adaptive-mode` del <html>
     —de la que cuelgan el recuadro donde se escribe la jugada, los atajos del
     tablero y el contraste alto— y avisa al resto de la página. Escrito a mano,
     el botón se marcaba como activado y la mitad del modo no llegaba hasta
     recargar, sin dar ningún error. */
  if(window.AdaptiveMode) window.AdaptiveMode.set(blindMode);
  else try{ localStorage.setItem(BLIND_MODE_KEY, blindMode ? '1' : '0'); }catch(e){}
  applyBlindModeUI();
}
/* Y al revés: si el modo se enciende desde otra pestaña o desde el botón de la
   cabecera, esta página se entera en el momento. Sin esto quedaba media página
   en un modo y media en el otro hasta recargar. Volver a llamar a
   setBlindMode() es seguro: AdaptiveMode no vuelve a disparar el evento cuando
   el modo ya es el que pide. */
document.addEventListener('adaptivemode:change', (e) => {
  const on = !!(e.detail && e.detail.activo);
  if(on !== blindMode) setBlindMode(on);
});
const modeNormalBtn = document.getElementById('mode-normal-btn');
const modeBlindBtn = document.getElementById('mode-blind-btn');
modeNormalBtn.addEventListener('click', () => setBlindMode(false));
modeBlindBtn.addEventListener('click', () => setBlindMode(true));

/* ---------------- El recuadro donde se escribe (Modo Adaptado) ----------------
 * Antes solo entendía "e1 g1" —cuatro caracteres, origen y destino— y eso es
 * justo como NO se escribe una jugada: quien juega al ajedrez escribe "Cf3" o
 * "Dxh7+". Ahora lo lee js/chess-move-parser.js, que es el mismo intérprete de
 * los visores de los cursos y de Juegos, así que entiende las dos formas, en
 * español y en inglés. Y antes de tratarlo como jugada, el recuadro mira si era
 * una PREGUNTA ("caballos", "qué hay en e4"): eso lo resuelve solo
 * js/cuadro-comandos.js con js/comandos-tablero.js, sin que esta página tenga
 * que saber nada. */
let comandos = null;
function montarComandos(){
  if(comandos || !window.CuadroComandos) return;
  comandos = CuadroComandos.montar(document.getElementById('q-comandos'), {
    etiqueta: 'Escribe tu jugada, o una pregunta sobre la posición',
    juego: () => game,
    tablero: () => teclado,
    onEnviar: jugarEscribiendo,
  });
  comandos.ayuda('Jugada: "Cf3", "Nf3", "Dxh7+", "e1 g1". Pregunta: "caballos", "qué hay en e4". Escribe "ayuda" para todo.');
}

function jugarEscribiendo(texto, api){
  if(locked){ api.decir('Espera un momento: el ejercicio está respondiendo.'); return; }
  // El intérprete busca la jugada entre las LEGALES y no toca la partida, así que
  // no hace falta ninguna copia.
  const mv = ComandosTablero.jugadaEscrita(game, texto);
  if(!mv){ api.decir(`"${texto}" no es una jugada legal en esta posición. Escribe "ayuda" si no sabes qué se puede escribir.`); return; }
  api.limpiar().decir('');
  playMove(mv.from, mv.to, mv.promotion);
}

async function loadPuzzlesThenStart(){
  try {
    const res = await fetch('data/mates.json');
    if(!res.ok) throw new Error('mates.json: ' + res.status);
    const all = await res.json();
    all.forEach((p) => { if(PUZZLES[p.category]) PUZZLES[p.category].push(p); });
  } catch (e) {
    document.getElementById('main-content').innerHTML =
      '<p class="text-center text-brand-450 dark:text-brand-350 py-10">No se pudo cargar la base de mates. Intenta recargar la página.</p>';
    console.error(e);
    return;
  }
  initApp();
}

/* ---------------- Progreso y racha (localStorage) ---------------- */
function getSolved(){
  try{ return JSON.parse(localStorage.getItem('entreno_mates_solved') || '{}'); }catch(e){ return {}; }
}
function markSolved(id){
  const s = getSolved();
  s[id] = true;
  localStorage.setItem('entreno_mates_solved', JSON.stringify(s));
}
function isSolved(id){ return !!getSolved()[id]; }
function solvedCountFor(cat){
  const s = getSolved();
  return PUZZLES[cat].filter((p) => s[p.id]).length;
}
function firstUnsolvedIndex(cat){
  const s = getSolved();
  const idx = PUZZLES[cat].findIndex((p) => !s[p.id]);
  return idx === -1 ? 0 : idx;
}

function getStreak(){
  try{ return parseInt(localStorage.getItem('entreno_mates_streak') || '0', 10) || 0; }catch(e){ return 0; }
}
function getBestStreak(){
  try{ return parseInt(localStorage.getItem('entreno_mates_best') || '0', 10) || 0; }catch(e){ return 0; }
}
function setStreak(n){
  localStorage.setItem('entreno_mates_streak', String(n));
  const best = Math.max(getBestStreak(), n);
  localStorage.setItem('entreno_mates_best', String(best));
  document.getElementById('streak-count').textContent = n;
  document.getElementById('streak-best').textContent = best;
}
function bumpStreak(){
  setStreak(getStreak() + 1);
  const bar = document.getElementById('streak-bar');
  bar.classList.remove('pulse'); void bar.offsetWidth; bar.classList.add('pulse');
}
function resetStreak(){ setStreak(0); }

/* ---------------- Estado del ejercicio actual ---------------- */
let currentCategory = 'mate1';
let currentIndex = 0;
let game = null;
let solutionStep = 0;   // cuántas jugadas de puzzle.solution ya se jugaron (propias + del rival)
let selectedSquare = null;
let missedThisPuzzle = false;
let usedHintThisPuzzle = false;
let locked = false;

function currentPuzzle(){ return PUZZLES[currentCategory][currentIndex]; }

// Punto de entrada único para "entrar" a una categoría, ya sea al arrancar la página o
// al cambiar de pestaña: si ya está 100% resuelta muestra la celebración en vez de
// reiniciar silenciosamente desde la posición 0.
function openCategory(cat){
  currentCategory = cat;
  if(solvedCountFor(cat) >= PUZZLES[cat].length){
    currentIndex = 0;
    finishCategory();
  } else {
    currentIndex = firstUnsolvedIndex(cat);
    loadPuzzle();
  }
}

function buildTabs(){
  const tabs = document.getElementById('tabs');
  tabs.innerHTML = '';
  CATEGORY_ORDER.forEach((cat) => {
    const done = solvedCountFor(cat);
    const total = PUZZLES[cat].length;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab' + (cat === currentCategory ? ' active' : '');
    btn.style.setProperty('--tab-color', `var(${CATEGORY_VAR[cat]})`);
    btn.innerHTML = `${CATEGORY_LABEL[cat]} <span class="n">${done}/${total}</span>`;
    btn.addEventListener('click', () => openCategory(cat));
    tabs.appendChild(btn);
  });
}

function updateProgressBar(){
  const total = PUZZLES[currentCategory].length;
  const done = solvedCountFor(currentCategory);
  document.getElementById('progress-fill').style.width = (total ? Math.round(100 * done / total) : 0) + '%';
  document.getElementById('progress-label').textContent = `${done}/${total} resueltos en ${CATEGORY_LABEL[currentCategory].replace(/^\S+\s/, '')} · posición ${currentIndex + 1} de ${total}`;
}

/* ---------------- Tablero ---------------- */
const FILES = ['a','b','c','d','e','f','g','h'];
function isLightSquare(square){
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10) - 1;
  return (file + rank) % 2 === 1;
}

function drawBoard(){
  const board = document.getElementById('board');
  board.innerHTML = '';
  for(let rank = 8; rank >= 1; rank--){
    for(let f = 0; f < 8; f++){
      const square = FILES[f] + rank;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sq ' + (isLightSquare(square) ? 'light' : 'dark');
      btn.dataset.square = square;
      const piece = game.get(square);
      if(piece){
        const span = document.createElement('span');
        if (window.PiezaPreferida) PiezaPreferida.pintar(span, piece.type, piece.color);
        else {
          span.className = piece.color === 'w' ? 'piece-white' : 'piece-black';
          span.textContent = GLYPH[piece.color][piece.type];
        }
        span.setAttribute('aria-hidden', 'true');
        btn.appendChild(span);
      }
      // Qué dice cada casilla lo escribe js/tablero-accesible.js: acá solo se
      // declara el estado, que es lo único que esta página sabe y aquel no.
      // Antes las 64 casillas eran botones MUDOS: un lector de pantalla decía
      // "botón" sesenta y cuatro veces y no había forma de mirar el tablero.
      if(square === selectedSquare){ btn.classList.add('selected'); btn.dataset.estado = 'seleccionada'; }
      btn.addEventListener('click', () => onSquareClick(square, btn));
      board.appendChild(btn);
    }
  }
  montarTeclado();
  renderPositionReadout();
}

/* Una sola parada de tabulador para todo el tablero y las flechas por dentro,
   más los atajos de una tecla en Modo Adaptado. Se monta una vez: a partir de
   ahí se repone solo en cada repintado. */
let teclado = null;
function montarTeclado(){
  if(teclado || !window.TableroAccesible) return;
  teclado = TableroAccesible.montar(document.getElementById('board'), {
    nombre: 'Tablero del ejercicio',
    juego: () => game,
  });
}

function flashWrong(btn){
  if(!btn) return;
  btn.classList.add('wrong-flash');
  setTimeout(() => btn.classList.remove('wrong-flash'), 350);
}
function setStatus(text, cls){
  const el = document.getElementById('round-status');
  el.textContent = text;
  el.className = 'round-status' + (cls ? ' ' + cls : '');
  if(window.BlindNotation) window.BlindNotation.speak(text);
  /* El mismo aviso, repetido en el recuadro: quien contesta escribiendo tiene el
     foco ahí y el renglón del tablero le queda lejos — y sobre todo, la respuesta
     del rival solo se oye si se dice, porque la lista de jugadas no es región
     viva. Sin esto se oía "espera" y después "te toca", sin enterarse nunca de
     qué se había jugado: o sea, sin poder seguir. */
  if(comandos) comandos.decir(text);
}
function highlightTargets(square){
  const legal = game.moves({ square, verbose: true });
  const board = document.getElementById('board');
  legal.forEach((m) => {
    const cell = board.querySelector('[data-square="' + m.to + '"]');
    if(cell) cell.classList.add(m.flags.includes('c') || m.flags.includes('e') ? 'target-capture' : 'target');
  });
}

function loadPuzzle(){
  const puzzle = currentPuzzle();
  document.getElementById('play-area').style.display = 'block';
  document.getElementById('celebration').style.display = 'none';
  if(!puzzle){
    finishCategory();
    return;
  }
  game = new Chess(puzzle.fen);
  solutionStep = 0;
  selectedSquare = null;
  missedThisPuzzle = false;
  usedHintThisPuzzle = false;
  hintStage = 0;
  locked = false;
  document.getElementById('hint-btn').disabled = false;
  document.getElementById('hint-btn').textContent = '💡 Pista';
  drawBoard();
  buildTabs();
  updateProgressBar();
  const turnColor = game.turn() === 'w' ? 'blancas' : 'negras';
  const n = CATEGORY_PLIES[currentCategory] === 1 ? 1 : (CATEGORY_PLIES[currentCategory] === 3 ? 2 : 3);
  const plies = n > 1 ? ' jugadas' : ' jugada';
  document.getElementById('turn-banner').innerHTML = `Juegan <b>${turnColor}</b> — mate en <b>${n}</b>${plies}`;
  const instruction = blindMode ? 'Escribe la jugada que quieres hacer.' : 'Encuentra la jugada. Haz clic en la pieza que quieres mover.';
  setStatus(blindMode ? `Juegan ${turnColor}, mate en ${n}${plies}. ${instruction}` : instruction);
  /* Se monta el recuadro pero NO se le roba el foco: quien acaba de apretar
     "Saltar" o "Reiniciar" espera seguir donde estaba, y quien usa lector de
     pantalla ya tiene el aviso de arriba leyéndole el ejercicio nuevo. El foco
     se mueve solo cuando la persona lo pide (Tab, o el atajo "i"). */
  montarComandos();
}

function onSquareClick(square, btn){
  if(locked) return;
  const piece = game.get(square);
  if(selectedSquare === null){
    if(piece && piece.color === game.turn()){
      selectedSquare = square;
      drawBoard();
      highlightTargets(square);
    }
    return;
  }
  if(square === selectedSquare){ selectedSquare = null; drawBoard(); return; }
  const legalFromSelected = game.moves({ square: selectedSquare, verbose: true });
  const candidates = legalFromSelected.filter((m) => m.to === square);
  if(!candidates.length){
    if(piece && piece.color === game.turn()){
      selectedSquare = square; drawBoard(); highlightTargets(square);
    } else {
      selectedSquare = null; drawBoard();
      flashWrong(document.querySelector('[data-square="' + square + '"]'));
    }
    return;
  }
  const from = selectedSquare;
  selectedSquare = null;
  if(candidates.length > 1 && candidates[0].flags.includes('p')){
    // Varias jugadas comparten origen/destino solo porque el peón puede coronar en
    // distintas piezas: se le pregunta al alumno en vez de asumir dama siempre — algunas
    // de estas posiciones necesitan justo una subpromoción para dar mate.
    askPromotion((choice) => playMove(from, square, choice));
  } else {
    playMove(from, square, candidates[0].promotion || undefined);
  }
}

// Arrastrar y soltar piezas (además del clic-clic de siempre): ver js/board-drag.js.
// isDraggable() repite las mismas condiciones que ya usa onSquareClick() para decidir
// si esta casilla se puede levantar, así el arrastre nunca permite algo que el clic no.
if(typeof enableBoardDrag !== 'undefined'){
  enableBoardDrag(document.getElementById('board'), {
    isDraggable: (square) => {
      if(locked) return false;
      const piece = game.get(square);
      return !!(piece && piece.color === game.turn());
    },
    isSelected: (square) => selectedSquare === square,
    onSquareClick: (square) => onSquareClick(square),
  });
}

function askPromotion(callback){
  const modal = document.getElementById('promo-modal');
  const opts = document.getElementById('promo-opts');
  opts.innerHTML = '';
  const turn = game.turn();
  ['q','r','b','n'].forEach((type) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'promo-btn';
    btn.innerHTML = window.PiezaPreferida ? PiezaPreferida.html(type, turn, { oculta: true }) : `<span class="${turn === 'w' ? 'piece-white' : 'piece-black'}">${GLYPH[turn][type]}</span>`;
    btn.addEventListener('click', () => { modal.style.display = 'none'; callback(type); });
    opts.appendChild(btn);
  });
  modal.style.display = 'flex';
}

function playMove(from, to, promotion){
  const puzzle = currentPuzzle();
  const moveResult = game.move({ from, to, promotion: promotion || 'q' });
  drawBoard();
  if(!moveResult) return;

  const expected = puzzle.solution[solutionStep];
  if(moveResult.san !== expected){
    game.undo();
    drawBoard();
    missedThisPuzzle = true;
    resetStreak();
    flashWrong(document.querySelector('[data-square="' + to + '"]'));
    setStatus(`${moveResult.san} es legal, pero no lleva al mate en la cantidad de jugadas pedida.`, 'bad');
    return;
  }

  solutionStep++;
  if(solutionStep >= puzzle.solution.length){
    finishPuzzle();
    return;
  }

  // Jugada del rival: se reproduce automáticamente la línea de la solución.
  locked = true;
  setStatus('✓ Correcto — el rival responde…', 'ok');
  setTimeout(() => {
    const replySan = puzzle.solution[solutionStep];
    game.move(replySan);
    solutionStep++;
    drawBoard();
    locked = false;
    if(solutionStep >= puzzle.solution.length){
      finishPuzzle();
    } else {
      hintStage = 0;
      document.getElementById('hint-btn').textContent = '💡 Pista';
      const replySpoken = blindMode && window.BlindNotation ? window.BlindNotation.sanSpoken(replySan) : replySan;
      setStatus(blindMode ? `El rival juega ${replySpoken}. Sigue buscando el mate.` : 'Sigue buscando el mate.');
    }
  }, 650);
}

function finishPuzzle(){
  locked = true;
  document.getElementById('hint-btn').disabled = true;
  const puzzle = currentPuzzle();
  const alreadySolved = isSolved(puzzle.id);
  if(!missedThisPuzzle && !usedHintThisPuzzle) bumpStreak(); else resetStreak();
  setStatus('✅ ¡Jaque mate!', 'ok');
  if(!alreadySolved){
    markSolved(puzzle.id);
    EntrenoProgress.log('mates', { puzzle_id: puzzle.id, category: puzzle.category });
  }
  updateProgressBar();
  buildTabs();
  setTimeout(() => {
    if(currentIndex < PUZZLES[currentCategory].length - 1){
      currentIndex++;
      loadPuzzle();
    } else {
      finishCategory();
    }
  }, 1000);
}

function finishCategory(){
  document.getElementById('play-area').style.display = 'none';
  document.getElementById('celebration').style.display = 'block';
  buildTabs();
  const total = PUZZLES[currentCategory].length;
  const statsText = `Resolviste las ${total} posiciones de ${CATEGORY_LABEL[currentCategory].replace(/^\S+\s/, '')}.`;
  document.getElementById('celebration-stats').textContent = statsText;
  if(window.BlindNotation) window.BlindNotation.speak('¡Categoría completa! ' + statsText);
  if(blindMode){
    // El foco cae directo en el botón de reinicio — así, en modo adaptado, basta con
    // presionar Enter para seguir en vez de tener que ir a buscar el botón a mano.
    document.getElementById('celebration-replay-btn').focus();
  }
}

let hintStage = 0; // 0 = sin pista todavía, 1 = pieza resaltada, 2 = ya se jugó sola
function giveHint(){
  if(locked) return;
  usedHintThisPuzzle = true;
  const puzzle = currentPuzzle();
  const expected = puzzle.solution[solutionStep];
  const legal = game.moves({ verbose: true });
  const target = legal.find((m) => m.san === expected);
  const board = document.getElementById('board');

  if(hintStage === 0){
    hintStage = 1;
    board.querySelectorAll('.hint-from').forEach((el) => el.classList.remove('hint-from'));
    if(target){
      const cell = board.querySelector('[data-square="' + target.from + '"]');
      if(cell) cell.classList.add('hint-from');
    }
    setStatus(blindMode && target ? `Pista: mueve la pieza en ${window.BlindNotation.squareSpoken(target.from)}.` : 'Pista: fíjate en la pieza resaltada.');
    document.getElementById('hint-btn').textContent = '💡 Ver solución';
  } else {
    hintStage = 0;
    document.getElementById('hint-btn').textContent = '💡 Pista';
    if(!target) return;
    selectedSquare = null;
    playMove(target.from, target.to, target.promotion || undefined);
  }
}
document.getElementById('hint-btn').addEventListener('click', giveHint);
document.getElementById('retry-btn').addEventListener('click', loadPuzzle);
document.getElementById('skip-btn').addEventListener('click', () => {
  resetStreak();
  if(currentIndex < PUZZLES[currentCategory].length - 1){
    currentIndex++;
  } else {
    currentIndex = 0;
  }
  loadPuzzle();
});
document.getElementById('celebration-replay-btn').addEventListener('click', () => {
  currentIndex = 0;
  loadPuzzle();
});

/* ---------------- Arranque ---------------- */
let appInitialized = false;
function initApp(){
  if(appInitialized) return;
  appInitialized = true;
  setStreak(getStreak());
  applyBlindModeUI();
  // ?cat=<categoria> es el enlace que manda una tarea ("25 mates en 1"): cae
  // en esa categoría y no en la que tocaba por progreso. openCategory() ya
  // arranca en el primero sin resolver, así que los 25 son 25 nuevos.
  const pedida = new URLSearchParams(location.search).get('cat');
  const startCategory = (pedida && PUZZLES[pedida] && PUZZLES[pedida].length) ? pedida
    : (CATEGORY_ORDER.find((c) => solvedCountFor(c) < PUZZLES[c].length) || 'mate1');
  openCategory(startCategory);
}

async function requireLoginThenGate(){
  let hasSession = false;
  try {
    const { data } = await sb.auth.getSession();
    hasSession = !!(data && data.session);
  } catch (e) {
    hasSession = false;
  }
  if(!hasSession){
    gateChecking.textContent = 'Necesitas iniciar sesión en el sitio para entrar a Mates. Redirigiendo a iniciar sesión…';
    window.location.href = '../login.html?next=' + encodeURIComponent(NEXT_PATH);
    return;
  }
  unlock();
}

requireLoginThenGate();

/* Coordenadas del tablero (js/coordenadas-tablero.js): la letra de columna abajo
   y el número de fila a la izquierda, para que se entienda hacia dónde avanza la
   posición. Se repintan solas cada vez que la página redibuja el tablero. */
if (window.Coordenadas) Coordenadas.aplicar(document.getElementById('board'));
