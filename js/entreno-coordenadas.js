/* El código de entreno/coordenadas.html.

   Vivía escrito dentro de la página, en un <script> de 18 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

const gate = document.getElementById('gate');
const app = document.getElementById('app');
const gateChecking = document.getElementById('gate-checking');

const NEXT_PATH = 'entreno/coordenadas.html';

async function unlock(){
  gate.classList.add('hidden');
  app.classList.remove('hidden');
  EntrenoProgress.init();
  // El progreso vive en la cuenta: se baja y se funde con el de este aparato
  // ANTES de pintar, para seguir donde se quedó aunque sea otro dispositivo.
  await ProgresoUsuario.init();
  initApp();
}

/* ---------------- Juego de coordenadas ---------------- */
const ROUND_SECONDS = 30;
const FILES = ['a','b','c','d','e','f','g','h'];

/* ---------------- Modo normal / modo adaptado (lector de pantalla) ----------------
   Mismo interruptor y misma clave de localStorage que Tablero y 4x4
   (oscarBlindMode_v1): activarlo una vez vale para todo el sitio. En modo
   adaptado, en vez de hacer clic en la casilla anunciada, se dice de qué
   color es: se escribe "b" (blanca) o "n" (negra) en un campo de texto —
   repetir el nombre de la casilla no entrenaría nada, sería solo un eco. La
   casilla anunciada y el resultado de cada intento se dicen por voz. */
const BLIND_MODE_KEY = 'oscarBlindMode_v1';
let blindMode = false;
try{ blindMode = localStorage.getItem(BLIND_MODE_KEY) === '1'; }catch(e){}
// El hub de Ciegos enlaza aquí con "?modo=ciego": preselecciona el modo
// adaptado sin que haya que tocar el interruptor a mano.
if(new URLSearchParams(window.location.search).get('modo') === 'ciego'){
  blindMode = true;
  try{ localStorage.setItem(BLIND_MODE_KEY, '1'); }catch(e){}
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
const blindPanel = document.getElementById('blind-panel');
const blindInput = document.getElementById('blind-input');
const blindAnnouncer = document.getElementById('blind-announcer');

// Botón "🗣️ Voz": el navegador lee en voz alta cada anuncio (además de lo que ya
// lee un lector de pantalla real), para quien no tiene uno activado. Ver
// js/blind-notation.js para el porqué es un complemento aparte, apagado por defecto.
const refreshSpeechToggle = window.BlindNotation
  ? window.BlindNotation.setupSpeechToggle('speech-toggle-btn', () => true)
  : null;

// Único punto de anuncio (además de "Se anuncia: <casilla>", que va aparte en
// newTarget()): actualiza el texto para el lector de pantalla y, si el modo Speech
// está activo, lo lee en voz alta con el navegador — en modo normal y en modo
// adaptado por igual.
function announceBlind(text){
  blindAnnouncer.textContent = text;
  if(window.BlindNotation) window.BlindNotation.speak(text);
}

function applyBlindModeUI(){
  document.getElementById('board').style.display = blindMode ? 'none' : 'grid';
  blindPanel.style.display = blindMode ? 'block' : 'none';
  document.getElementById('target-label').textContent = blindMode ? 'Se anuncia:' : 'Haz clic en';
  document.getElementById('lead-text').textContent = blindMode
    ? 'Se anuncia el nombre de una casilla (por ejemplo, "e4"). En vez de encontrarla en un tablero, di de qué color es: escribe "b" si es blanca o "n" si es negra, y presiona Enter, antes de que se acabe el tiempo.'
    : 'Se muestra el nombre de una casilla (por ejemplo, "e4"). Haz clic en esa casilla en el tablero antes de que se acabe el tiempo. Cuanto más rápido reconozcas las casillas, mejor puntuación.';
  if(modeNormalBtn){
    modeNormalBtn.setAttribute('aria-pressed', blindMode ? 'false' : 'true');
    modeNormalBtn.classList.toggle('active', !blindMode);
  }
  if(modeBlindBtn){
    modeBlindBtn.setAttribute('aria-pressed', blindMode ? 'true' : 'false');
    modeBlindBtn.classList.toggle('active', blindMode);
  }
  if(refreshSpeechToggle) refreshSpeechToggle();
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
if(modeNormalBtn) modeNormalBtn.addEventListener('click', () => setBlindMode(false));
if(modeBlindBtn) modeBlindBtn.addEventListener('click', () => setBlindMode(true));
applyBlindModeUI();

blindPanel.addEventListener('submit', (e) => {
  e.preventDefault();
  const answer = blindInput.value.trim().toLowerCase();
  blindInput.value = '';
  blindInput.focus();
  if(answer !== 'b' && answer !== 'n'){
    announceBlind('Escribe "b" si la casilla es blanca, o "n" si es negra.');
    return;
  }
  const missedColor = isLightSquare(currentTarget) ? 'blanca' : 'negra'; // antes de newTarget(), que cambia currentTarget
  const correct = handleColorGuess(answer);
  if(correct === null) return; // la ronda no está en curso
  // Primero el aviso de acierto/error y después newTarget() (que anuncia la casilla
  // nueva): speak() cancela cualquier frase anterior, así que lo último en anunciarse
  // debe ser la casilla que hay que resolver ahora, no "Correcto" (mismo criterio que
  // ya usa onSquareTimeout() más abajo).
  announceBlind(correct ? '✅ Correcto.' : `❌ Incorrecto, era ${missedColor}.`);
  if(correct) newTarget();
});

// Modos: además del clásico (sin apuro por casilla, solo el reloj general de
// 30s), dos modos con límite de tiempo POR casilla — si no la encuentras a
// tiempo, cuenta como error y salta sola a la siguiente. La mejor puntuación
// se guarda aparte para cada modo, porque no son comparables entre sí.
const MODES = {
  classic: { label: 'Clásico', perSquareLimit: null, hint: 'Ronda de 30 segundos, sin apuro por casilla — busca todas las que alcances.' },
  mode10: { label: '10s por casilla', perSquareLimit: 10, hint: 'Tienes 10 segundos para encontrar cada casilla. Si se acaban, cuenta como error y aparece otra.' },
  mode3: { label: '3s por casilla', perSquareLimit: 3, hint: 'Solo 3 segundos por casilla — el modo más exigente. Si se acaban, cuenta como error y aparece otra.' },
};

function getBest(mode){
  try{ return parseInt(localStorage.getItem('entreno_coord_best_' + mode) || '0', 10) || 0; }catch(e){ return 0; }
}
function setBest(mode, score){
  try{ localStorage.setItem('entreno_coord_best_' + mode, String(score)); }catch(e){}
}

let orientationSetting = 'white'; // 'white' | 'black' | 'random'
let roundOrientation = 'white';  // la que realmente se usa esta ronda
let modeSetting = 'classic';     // clave de MODES
let perSquareLimit = null;       // segundos, o null en modo clásico
let perSquareTimeoutId = null;
let timeLeft = ROUND_SECONDS;
let timerId = null;
let score = 0, misses = 0, streak = 0, bestStreak = 0;
let reactionTimes = [];
let currentTarget = null;
let lastPromptAt = 0;
let playing = false;

document.querySelectorAll('#orientation-switch .option-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#orientation-switch .option-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    orientationSetting = btn.dataset.value;
  });
});

document.querySelectorAll('#mode-switch .option-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#mode-switch .option-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    modeSetting = btn.dataset.value;
    document.getElementById('mode-hint').textContent = MODES[modeSetting].hint;
    renderBestLine();
  });
});

function squaresInOrder(boardOrientation){
  const squares = [];
  if(boardOrientation === 'black'){
    for(let rank = 1; rank <= 8; rank++){
      for(let f = 7; f >= 0; f--) squares.push(FILES[f] + rank);
    }
  } else {
    for(let rank = 8; rank >= 1; rank--){
      for(let f = 0; f < 8; f++) squares.push(FILES[f] + rank);
    }
  }
  return squares;
}
function isLightSquare(square){
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10) - 1;
  return (file + rank) % 2 === 1;
}

function drawBoard(){
  const board = document.getElementById('board');
  board.innerHTML = '';
  squaresInOrder(roundOrientation).forEach((square) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sq ' + (isLightSquare(square) ? 'light' : 'dark');
    btn.dataset.square = square;
    /* Las 64 casillas decían "Casilla", todas igual: con lector de pantalla el
       tablero era una pared de sesenta y cuatro botones idénticos y este
       ejercicio —tocar la casilla que te piden— no se podía ni intentar. No daba
       ningún error. Ahora cada una dice cuál es, y lo escribe
       js/tablero-accesible.js, que es donde vive la forma hablada de las
       columnas ("eva 4", que no se confunde con "bella 4" al oírla).
       Quien ve la página no nota nada: el aria-label no se dibuja. Y en Modo
       Adaptado el ejercicio es otro —se pregunta de qué COLOR es la casilla— así
       que tampoco se regala ninguna respuesta. */
    btn.addEventListener('click', () => onSquareClick(square, btn));
    board.appendChild(btn);
  });
  montarTeclado();
}

/* Una sola parada de tabulador para todo el tablero y las flechas por dentro.
   Antes eran 64 botones seguidos en el recorrido del tabulador: llegar al que
   venía después costaba sesenta y cinco Tab. */
let teclado = null;
function montarTeclado(){
  if(teclado || !window.TableroAccesible) return;
  teclado = TableroAccesible.montar(document.getElementById('board'), {
    nombre: 'Tablero de coordenadas',
  });
}

function randomSquare(){
  return FILES[Math.floor(Math.random() * 8)] + (1 + Math.floor(Math.random() * 8));
}

function armPerSquareTimer(){
  clearTimeout(perSquareTimeoutId);
  const barWrap = document.getElementById('per-square-bar-wrap');
  const bar = document.getElementById('per-square-bar');
  if(!perSquareLimit){
    barWrap.style.display = 'none';
    return;
  }
  barWrap.style.display = 'block';
  bar.style.transition = 'none';
  bar.style.width = '100%';
  void bar.offsetWidth; // fuerza el reflow para que la siguiente transición sí anime desde 100%
  bar.style.transition = `width ${perSquareLimit}s linear`;
  bar.style.width = '0%';
  perSquareTimeoutId = setTimeout(onSquareTimeout, perSquareLimit * 1000);
}

function onSquareTimeout(){
  if(!playing) return;
  const missedSquareColor = isLightSquare(currentTarget) ? 'blanca' : 'negra';
  misses++;
  streak = 0;
  updateHud();
  // Primero el aviso del fallo y después newTarget() (que anuncia la casilla nueva):
  // speak() cancela cualquier frase anterior, así que lo último en anunciarse debe
  // ser la casilla que el alumno tiene que resolver ahora, no el aviso del error.
  announceBlind(`⏱️ Se acabó el tiempo, era ${missedSquareColor}.`);
  newTarget();
}

function newTarget(){
  let next = currentTarget;
  while(next === currentTarget) next = randomSquare(); // nunca repite la misma casilla dos veces seguidas
  currentTarget = next;
  // En modo normal se ve el nombre real de la casilla ("e4"). En modo
  // adaptado, lo que se anuncia (y lee el lector de pantalla vía aria-live)
  // usa la notación de columnas — "Eva 4" — para no confundir letras al oído.
  // Se anuncia solo el nombre, sin envolverlo en una pregunta completa: el
  // contexto ya está dado (el label "Se anuncia:" y las instrucciones), y
  // en una ronda de 30 segundos cada palabra de más cuesta tiempo real.
  const spokenSquare = blindMode ? window.BlindNotation.squareSpoken(currentTarget) : currentTarget;
  document.getElementById('target-square').textContent = spokenSquare;
  if(window.BlindNotation) window.BlindNotation.speak(spokenSquare);
  lastPromptAt = performance.now();
  armPerSquareTimer();
}

function flash(btn, cls){
  btn.classList.add(cls);
  setTimeout(() => btn.classList.remove(cls), 200);
}

function updateHud(){
  document.getElementById('hud-score').textContent = String(score);
  const streakLine = document.getElementById('streak-line');
  streakLine.textContent = streak >= 3 ? `🔥 Racha de ${streak}` : '';
}

// Lógica compartida entre el clic en el tablero (modo normal) y el campo de
// texto (modo adaptado): decide si la casilla adivinada es la correcta y
// actualiza puntuación/racha. Devuelve true si acertó, para que cada modo
// dé su propio tipo de aviso (visual o por voz).
function handleGuess(square){
  if(!playing) return null;
  const correct = square === currentTarget;
  if(correct){
    score++;
    streak++;
    bestStreak = Math.max(bestStreak, streak);
    reactionTimes.push(performance.now() - lastPromptAt);
    newTarget();
  } else {
    misses++;
    streak = 0;
  }
  updateHud();
  return correct;
}

// Versión del modo adaptado: en vez de repetir el nombre de la casilla
// anunciada (que no entrena nada — solo sería un eco), la respuesta es de
// qué color es esa casilla ("b" blanca / "n" negra). Misma puntuación y
// misma racha que el modo normal, solo cambia qué cuenta como acierto.
function handleColorGuess(answer){
  if(!playing) return null;
  const correctAnswer = isLightSquare(currentTarget) ? 'b' : 'n';
  const correct = answer === correctAnswer;
  if(correct){
    score++;
    streak++;
    bestStreak = Math.max(bestStreak, streak);
    reactionTimes.push(performance.now() - lastPromptAt);
    // newTarget() ya NO se llama acá: lo llama quien invoca handleColorGuess(),
    // después de anunciar si acertó o no (ver blindPanel "submit" más arriba) —
    // así el nombre de la casilla nueva es siempre lo último que se anuncia.
  } else {
    misses++;
    streak = 0;
  }
  updateHud();
  return correct;
}

function onSquareClick(square, btn){
  const correct = handleGuess(square);
  if(correct === null) return;
  flash(btn, correct ? 'flash-ok' : 'flash-bad');
}

function tick(){
  timeLeft--;
  const timerEl = document.getElementById('hud-timer');
  timerEl.textContent = String(timeLeft);
  timerEl.classList.toggle('urgent', timeLeft <= 10);
  if(timeLeft <= 0){
    endRound();
  }
}

function startRound(){
  score = 0; misses = 0; streak = 0; bestStreak = 0;
  reactionTimes = [];
  timeLeft = ROUND_SECONDS;
  currentTarget = null;
  playing = true;
  perSquareLimit = MODES[modeSetting].perSquareLimit;
  roundOrientation = orientationSetting === 'random'
    ? (Math.random() < 0.5 ? 'white' : 'black')
    : orientationSetting;

  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('end-screen').style.display = 'none';
  document.getElementById('play-screen').style.display = 'block';
  document.getElementById('hud-timer').classList.remove('urgent');
  document.getElementById('hud-timer').textContent = String(timeLeft);

  drawBoard();
  // El foco entra al campo ANTES de anunciar la primera pregunta (no después):
  // si el foco se moviera después, un lector de pantalla real podría anunciar
  // el label del campo justo cuando está por leer la pregunta y perderla —
  // con el foco ya puesto, la pregunta que sigue se escucha sin ese cruce.
  if(blindMode) blindInput.focus();
  newTarget();
  updateHud();
  timerId = setInterval(tick, 1000);
}

function endRound(){
  clearInterval(timerId);
  clearTimeout(perSquareTimeoutId);
  playing = false;

  const best = getBest(modeSetting);
  const isNewBest = score > best;
  if(isNewBest) setBest(modeSetting, score);

  document.getElementById('play-screen').style.display = 'none';
  document.getElementById('end-screen').style.display = 'block';
  document.getElementById('new-best-msg').style.display = isNewBest ? 'block' : 'none';
  document.getElementById('final-score').textContent = String(score);
  document.getElementById('stat-hits').textContent = String(score);
  document.getElementById('stat-misses').textContent = String(misses);
  document.getElementById('stat-streak').textContent = String(bestStreak);
  const avgReaction = reactionTimes.length
    ? Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length)
    : null;
  document.getElementById('stat-avg').textContent = avgReaction !== null ? avgReaction + ' ms' : '—';

  EntrenoProgress.log('coordenadas', {
    mode: modeSetting,
    orientation: roundOrientation,
    score,
    misses,
    best_streak: bestStreak,
    avg_reaction_ms: avgReaction,
  });

  renderBestLine();

  const againBtn = document.getElementById('again-btn');
  againBtn.focus();
  announceBlind(`Tiempo terminado. Puntuación: ${score}. ${misses} error${misses === 1 ? '' : 'es'}.${isNewBest ? ' Nueva mejor puntuación.' : ''}`);
}

function renderBestLine(){
  const best = getBest(modeSetting);
  document.getElementById('best-line').innerHTML = best > 0
    ? `Tu mejor puntuación en "${MODES[modeSetting].label}": <strong>${best}</strong>`
    : `Todavía no tienes una puntuación registrada en "${MODES[modeSetting].label}" — ¡esta puede ser la primera!`;
}

document.getElementById('start-btn').addEventListener('click', startRound);
document.getElementById('again-btn').addEventListener('click', startRound);

function initApp(){
  document.getElementById('start-screen').style.display = 'block';
  renderBestLine();
}

// Entrenamiento exige sesión iniciada en el sitio (Academia) — así el
// progreso de cada quien queda guardado y visible para el profesor en
// Informes.
async function requireLoginThenGate(){
  let hasSession = false;
  try {
    const { data } = await sb.auth.getSession();
    hasSession = !!(data && data.session);
  } catch (e) {
    hasSession = false;
  }
  if(!hasSession){
    gateChecking.textContent = 'Necesitas iniciar sesión en el sitio para entrar a Entrenamiento. Redirigiendo a iniciar sesión…';
    window.location.href = '../login.html?next=' + encodeURIComponent(NEXT_PATH);
    return;
  }
  gateChecking.classList.add('hidden');
  unlock();
}

requireLoginThenGate();
