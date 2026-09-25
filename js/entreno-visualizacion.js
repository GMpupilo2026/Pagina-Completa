/* El código de entreno/visualizacion.html.

   Vivía escrito dentro de la página, en un <script> de 19 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

const gate = document.getElementById('gate');
const app = document.getElementById('app');
const gateChecking = document.getElementById('gate-checking');
const NEXT_PATH = 'entreno/visualizacion.html';

async function unlock(){
  gate.classList.add('hidden');
  app.classList.remove('hidden');
  // El progreso vive en la cuenta: se baja y se funde con el de este aparato
  // ANTES de pintar, para seguir donde se quedó aunque sea otro dispositivo.
  await ProgresoUsuario.init();
  if (window.EntrenoProgress) await EntrenoProgress.init();
  loadDataThenStart();
}

const GLYPH = {
  w: { p:'♙', n:'♘', b:'♗', r:'♖', q:'♕', k:'♔' },
  b: { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', k:'♚' },
};
const PIECE_NAME = { p:'peón', n:'caballo', b:'alfil', r:'torre', q:'dama', k:'rey' };

/* Cinco niveles según cuántas jugadas PROPIAS hay que encontrar sin ver el
   tablero moverse. No se arma un banco nuevo: se reparte el mismo banco de
   7.008 ejercicios ya verificados con chess.js que usa "Ejercicios por tema"
   (entreno/data/temas.json, base abierta de Lichess) según el largo de la
   solución — acá lo único que cambia es CÓMO se juega, no de dónde salen
   las posiciones. "Las posiciones no se inventan nunca". */
const NIVELES = [
  { id:'l1', nombre:'Nivel 1', titulo:'Visualiza 1 jugada por delante', len:3,  propias:2, respuestas:1,
    desc:'Encuentra tu jugada, calcula la respuesta del rival de memoria y encuentra la segunda. Dos jugadas tuyas en total.' },
  { id:'l2', nombre:'Nivel 2', titulo:'Visualiza 2 jugadas por delante', len:5,  propias:3, respuestas:2,
    desc:'Tres jugadas tuyas, con dos respuestas del rival de por medio que solo existen en tu cabeza.' },
  { id:'l3', nombre:'Nivel 3', titulo:'Visualiza 3 jugadas por delante', len:7,  propias:4, respuestas:3,
    desc:'Cuatro jugadas tuyas. El tablero sigue mostrando la posición del principio todo el tiempo.' },
  { id:'l4', nombre:'Nivel 4', titulo:'Visualiza 4 jugadas por delante', len:9,  propias:5, respuestas:4,
    desc:'Cinco jugadas tuyas: hay que sostener la posición completa en la cabeza línea abajo.' },
  { id:'l5', nombre:'Nivel 5', titulo:'Visualiza 5 jugadas o más', lenMin:11, propias:'6 o más', respuestas:'5 o más',
    desc:'Las líneas más largas del banco: seis jugadas tuyas o más, sin apoyarte en el tablero ni una vez.' },
];
function nivelInfo(id){ return NIVELES.find((n) => n.id === id); }

let DATA = null;                 // temas.json: {puzzles: {id: {fen, solution, rating, mate, ...}}}
let POOLS = {};                  // nivel.id -> [ids] (orden estable)

async function loadDataThenStart(){
  try {
    const res = await fetch('data/temas.json');
    if(!res.ok) throw new Error('temas.json: ' + res.status);
    DATA = await res.json();
    buildPools();
  } catch (e) {
    document.getElementById('main-content').innerHTML =
      '<p class="text-center text-brand-450 dark:text-brand-350 py-10">No se pudo cargar la base de ejercicios. Intenta recargar la página.</p>';
    console.error(e);
    return;
  }
  initApp();
}

function buildPools(){
  const ids = Object.keys(DATA.puzzles).sort();
  NIVELES.forEach((n) => { POOLS[n.id] = []; });
  ids.forEach((id) => {
    const n = (DATA.puzzles[id].solution || []).length;
    const nivel = NIVELES.find((x) => x.len ? x.len === n : (x.lenMin && n >= x.lenMin));
    if(nivel) POOLS[nivel.id].push(id);
  });
}
function idsOf(nivelId){ return POOLS[nivelId] || []; }

/* ---------------- Progreso y racha (localStorage) ----------------
   Una sola lista de resueltos para los cinco niveles (igual que "Ejercicios
   por tema"): el id ya dice a qué nivel pertenece porque solo puede estar en
   un POOL. */
function getSolved(){
  try{ return JSON.parse(localStorage.getItem('entreno_visualizacion_solved') || '{}'); }catch(e){ return {}; }
}
function markSolved(id){
  const s = getSolved();
  s[id] = true;
  localStorage.setItem('entreno_visualizacion_solved', JSON.stringify(s));
}
function isSolved(id){ return !!getSolved()[id]; }
function solvedCountFor(nivelId){
  const s = getSolved();
  return idsOf(nivelId).filter((id) => s[id]).length;
}
function firstUnsolvedIndex(nivelId){
  const s = getSolved();
  const idx = idsOf(nivelId).findIndex((id) => !s[id]);
  return idx === -1 ? 0 : idx;
}

function getStreak(){
  try{ return parseInt(localStorage.getItem('entreno_visualizacion_streak') || '0', 10) || 0; }catch(e){ return 0; }
}
function getBestStreak(){
  try{ return parseInt(localStorage.getItem('entreno_visualizacion_best') || '0', 10) || 0; }catch(e){ return 0; }
}
function setStreak(n){
  localStorage.setItem('entreno_visualizacion_streak', String(n));
  const best = Math.max(getBestStreak(), n);
  localStorage.setItem('entreno_visualizacion_best', String(best));
  document.getElementById('streak-count').textContent = n;
  document.getElementById('streak-best').textContent = best;
}
function bumpStreak(){
  setStreak(getStreak() + 1);
  const bar = document.getElementById('streak-bar');
  bar.classList.remove('pulse'); void bar.offsetWidth; bar.classList.add('pulse');
}
function resetStreak(){ setStreak(0); }

/* ---------------- Vista de niveles ---------------- */
function buildLevels(){
  const wrap = document.getElementById('levels');
  wrap.innerHTML = '';
  const solved = getSolved();
  const grid = document.createElement('ul');
  grid.className = 'levels list-none p-0 m-0';
  NIVELES.forEach((n) => {
    const ids = idsOf(n.id);
    if(!ids.length) return;
    const done = ids.filter((id) => solved[id]).length;
    const card = document.createElement('li');
    card.className = 'level' + (done >= ids.length ? ' done' : '');
    card.innerHTML = `
      <h3><span>${n.nombre} — ${n.titulo}</span><span class="n">${done}/${ids.length}</span></h3>
      <p>${n.desc}</p>
      <div class="bar" role="progressbar" aria-label="Progreso en ${n.nombre}" aria-valuemin="0" aria-valuemax="${ids.length}" aria-valuenow="${done}"><i style="width:${Math.round(100 * done / ids.length)}%"></i></div>
      <div class="acts">
        <button type="button" class="tbtn" data-nivel="${n.id}">${done === 0 ? 'Empezar' : (done >= ids.length ? 'Repasar' : 'Continuar')}</button>
        <span class="left">${done >= ids.length ? 'completo ✓' : `faltan ${ids.length - done}`}</span>
      </div>`;
    card.querySelector('button').addEventListener('click', () => openLevel(n.id));
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
  updateOverall();
}

function updateOverall(){
  const solved = getSolved();
  const allIds = [];
  NIVELES.forEach((n) => { idsOf(n.id).forEach((id) => allIds.push(id)); });
  const total = allIds.length;
  const done = allIds.filter((id) => solved[id]).length;
  const pct = total ? Math.round(100 * done / total) : 0;
  document.getElementById('total-solved').textContent = done;
  document.getElementById('total-left').textContent = total - done;
  document.getElementById('total-count').textContent = total;
  document.getElementById('overall-pct').textContent = pct + ' %';
  document.getElementById('overall-fill').style.width = pct + '%';
  const bar = document.getElementById('overall-bar');
  bar.setAttribute('aria-valuemax', total);
  bar.setAttribute('aria-valuenow', done);
  bar.setAttribute('aria-valuetext', `${done} de ${total} ejercicios resueltos, faltan ${total - done}`);
}

function showLevels(){
  document.getElementById('play-view').style.display = 'none';
  document.getElementById('levels-view').style.display = 'block';
  buildLevels();
  try{ localStorage.removeItem('entreno_visualizacion_last'); }catch(e){}
  window.scrollTo({ top: 0 });
}

/* ---------------- Estado del ejercicio actual ---------------- */
let currentLevel = null;
let currentIndex = 0;
let game = null;              // avanza de verdad con cada jugada, aunque el tablero no se repinte
let posicionDeSalida = null;  // la que el tablero enseña: contra ella se contestan las preguntas
let solutionStep = 0;
let missedThisPuzzle = false;
let usedHintThisPuzzle = false;
let locked = false;
let logLineas = [];           // texto ya revelado de la bitácora

function currentId(){ return idsOf(currentLevel)[currentIndex]; }
function currentPuzzle(){ return DATA.puzzles[currentId()]; }

function openLevel(id){
  currentLevel = id;
  const info = nivelInfo(id);
  document.getElementById('play-title').textContent = `${info.nombre} — ${info.titulo}`;
  document.getElementById('play-desc').textContent = info.desc;
  document.getElementById('levels-view').style.display = 'none';
  document.getElementById('play-view').style.display = 'block';
  try{ localStorage.setItem('entreno_visualizacion_last', id); }catch(e){}
  if(solvedCountFor(id) >= idsOf(id).length){
    currentIndex = 0;
    finishLevel();
  } else {
    currentIndex = firstUnsolvedIndex(id);
    loadPuzzle();
  }
  window.scrollTo({ top: 0 });
}

function updateProgressBar(){
  const total = idsOf(currentLevel).length;
  const done = solvedCountFor(currentLevel);
  document.getElementById('progress-fill').style.width = (total ? Math.round(100 * done / total) : 0) + '%';
  document.getElementById('progress-label').textContent = `${done}/${total} resueltos · ejercicio ${currentIndex + 1} de ${total}`;
}

/* ---------------- Tablero (se dibuja UNA vez por ejercicio) ----------------
 * A propósito no vuelve a llamarse mientras se juega: el punto entero del
 * ejercicio es que la imagen se quede fija en la posición inicial y toda la
 * partida que sigue exista solo en la cabeza de quien la resuelve. El objeto
 * `game` de chess.js sí avanza de verdad con cada jugada (así se puede
 * validar lo que se escribe), pero nunca se vuelve a pintar sobre el
 * tablero. */
const FILES = ['a','b','c','d','e','f','g','h'];
function isLightSquare(square){
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10) - 1;
  return (file + rank) % 2 === 1;
}

function drawStaticBoard(fen, orientation){
  const board = document.getElementById('board');
  board.innerHTML = '';
  const snapshot = new Chess(fen);
  const ranks = orientation === 'w' ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];
  const files = orientation === 'w' ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
  ranks.forEach((rank) => {
    files.forEach((f) => {
      const square = FILES[f] + rank;
      const cell = document.createElement('div');
      cell.className = 'sq ' + (isLightSquare(square) ? 'light' : 'dark');
      cell.dataset.square = square;
      const piece = snapshot.get(square);
      let label = square;
      if(piece){
        const span = document.createElement('span');
        if (window.PiezaPreferida) PiezaPreferida.pintar(span, piece.type, piece.color);
        else {
          span.className = piece.color === 'w' ? 'piece-white' : 'piece-black';
          span.textContent = GLYPH[piece.color][piece.type];
        }
        span.setAttribute('aria-hidden', 'true');
        cell.appendChild(span);
        label += ', ' + PIECE_NAME[piece.type] + (piece.color === 'w' ? ' blanco' : ' negro');
        if(piece.type === 'q' || piece.type === 'r') label = label.replace('blanco', 'blanca').replace('negro', 'negra');
      }
      cell.setAttribute('role', 'img');
      cell.setAttribute('aria-label', label);
      board.appendChild(cell);
    });
  });
  if (window.Coordenadas) Coordenadas.aplicar(board);
  const readout = document.getElementById('position-readout');
  readout.textContent = window.BlindNotation ? BlindNotation.positionSentence(snapshot) : '';
}

function setStatus(text, cls){
  const el = document.getElementById('round-status');
  el.textContent = text;
  el.className = 'round-status' + (cls ? ' ' + cls : '');
}

function flashWrongInput(){
  const input = document.getElementById('answer-input');
  input.classList.add('wrong-flash');
  setTimeout(() => input.classList.remove('wrong-flash'), 350);
}

/* ---------------- Bitácora de jugadas ---------------- */
function renderLog(){
  document.getElementById('movelog').innerHTML = logLineas.join(' ') ||
    '<span class="pending">Todavía no escribiste ninguna jugada.</span>';
}
function logJugadaPropia(san){
  logLineas.push(`<b>${san}</b>`);
  renderLog();
}
function logRespuestaRival(san){
  logLineas.push(`<span class="reply">${san}</span>`);
  renderLog();
}

function loadPuzzle(){
  const puzzle = currentPuzzle();
  document.getElementById('play-area').style.display = 'block';
  document.getElementById('celebration').style.display = 'none';
  if(!puzzle){
    finishLevel();
    return;
  }
  game = new Chess(puzzle.fen);
  /* La posición DE PARTIDA, guardada aparte. Es contra ella que se contestan las
     preguntas del recuadro, no contra la posición mental: preguntar "dónde están
     mis caballos" después de tres jugadas imaginadas sería hacer trampa, y
     preguntarlo sobre lo que el tablero está enseñando es exactamente lo que
     hace quien lo mira. */
  posicionDeSalida = new Chess(puzzle.fen);
  const orientation = game.turn();
  solutionStep = 0;
  missedThisPuzzle = false;
  usedHintThisPuzzle = false;
  locked = false;
  logLineas = [];
  renderLog();
  document.getElementById('hint-btn').disabled = false;
  document.getElementById('hint-btn').textContent = '💡 Pista';
  document.getElementById('answer-input').value = '';
  document.getElementById('answer-input').disabled = false;
  drawStaticBoard(puzzle.fen, orientation);
  updateProgressBar();
  const info = nivelInfo(currentLevel);
  const turnColor = orientation === 'w' ? 'blancas' : 'negras';
  document.getElementById('turn-banner').innerHTML =
    `Juegan <b>${turnColor}</b> — encuentra ${typeof info.propias === 'number' ? (info.propias + (info.propias === 1 ? ' jugada tuya' : ' jugadas tuyas')) : info.propias + ' jugadas tuyas'} sin mirar el tablero moverse.`;
  const meta = puzzle.rating ? `Dificultad ${puzzle.rating}` : '';
  document.getElementById('puzzle-meta').textContent = meta;
  setStatus('Escribe tu primera jugada. El tablero de arriba no se va a mover.');
  document.getElementById('answer-input').focus();
}

function jugarEscribiendo(texto){
  if(locked) return;
  if(!texto.trim()){ return; }
  const puzzle = currentPuzzle();
  const mv = ChessMoveParser.tryParseMove(game, texto);
  if(!mv){
    setStatus(`"${texto}" no es una jugada legal en la posición que llevas calculada. Revísala e inténtalo de nuevo.`, 'bad');
    flashWrongInput();
    return;
  }
  const expected = puzzle.solution[solutionStep];
  if(mv.san !== expected){
    // Cualquier jugada que dé mate también cuenta como correcta.
    if(!game.in_checkmate()){
      game.undo();
      missedThisPuzzle = true;
      resetStreak();
      flashWrongInput();
      setStatus(`${mv.san} es legal, pero no es la jugada de la línea. Vuelve a calcular desde donde ibas.`, 'bad');
      return;
    }
  }
  document.getElementById('answer-input').value = '';
  logJugadaPropia(mv.san);
  solutionStep++;

  if(solutionStep >= puzzle.solution.length || game.in_checkmate()){
    finishPuzzle();
    return;
  }

  locked = true;
  document.getElementById('answer-input').disabled = true;
  setStatus('✓ Correcto — el rival responde…', 'ok');
  setTimeout(() => {
    const replySan = puzzle.solution[solutionStep];
    game.move(replySan);
    logRespuestaRival(replySan);
    solutionStep++;
    locked = false;
    document.getElementById('answer-input').disabled = false;
    document.getElementById('answer-input').focus();
    if(solutionStep >= puzzle.solution.length){
      finishPuzzle();
    } else {
      setStatus('Sigue calculando la continuación.');
    }
  }, 750);
}

document.getElementById('answer-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('answer-input');
  /* Antes de tratarlo como jugada se mira si era una PREGUNTA sobre la posición
     del tablero ("caballos", "qué hay en e4", "posición"). Acá eso no es un
     extra: el ejercicio entero consiste en calcular sobre una posición que no se
     puede volver a mirar pieza por pieza, y quien no ve el tablero no tenía
     forma de repasarla salvo oír las treinta y dos de corrido otra vez.
     Se contesta contra la posición DE SALIDA, que es la que el tablero enseña. */
  if(window.ComandosTablero && posicionDeSalida){
    const r = ComandosTablero.interpretar(input.value, { juego: () => posicionDeSalida });
    if(r.manejado){
      input.value = '';
      setStatus(r.tipo === 'ayuda' ? 'Jugada: "Cf3", "Nf3", "Dxh7+". Pregunta sobre la posición del tablero: "caballos", "qué hay en e4", "posición".' : r.respuesta);
      return;
    }
  }
  jugarEscribiendo(input.value);
});

function finishPuzzle(){
  locked = true;
  document.getElementById('answer-input').disabled = true;
  document.getElementById('hint-btn').disabled = true;
  const id = currentId();
  const alreadySolved = isSolved(id);
  if(!missedThisPuzzle && !usedHintThisPuzzle) bumpStreak(); else resetStreak();
  setStatus(game.in_checkmate() ? '✅ ¡Jaque mate! Visualizaste la línea entera.' : '✅ ¡Correcto! Calculaste toda la línea sin ver el tablero moverse.', 'ok');
  drawStaticBoard(game.fen(), game.turn() === 'w' ? 'b' : 'w');
  if(!alreadySolved){
    markSolved(id);
    if (window.EntrenoProgress) EntrenoProgress.log("visualizacion", { puzzle_id: id });
  }
  updateProgressBar();
  updateOverall();
  setTimeout(() => {
    if(currentIndex < idsOf(currentLevel).length - 1){
      currentIndex++;
      loadPuzzle();
    } else {
      finishLevel();
    }
  }, 1400);
}

function finishLevel(){
  document.getElementById('play-area').style.display = 'none';
  document.getElementById('celebration').style.display = 'block';
  const total = idsOf(currentLevel).length;
  const info = nivelInfo(currentLevel);
  document.getElementById('celebration-stats').textContent =
    `Resolviste los ${total} ejercicios de ${info.nombre} — ${info.titulo}.`;
  updateProgressBar();
}

function giveHint(){
  if(locked) return;
  usedHintThisPuzzle = true;
  const puzzle = currentPuzzle();
  const expected = puzzle.solution[solutionStep];
  setStatus(`Pista: la jugada que buscas es ${expected}.`);
}
document.getElementById('hint-btn').addEventListener('click', giveHint);
document.getElementById('retry-btn').addEventListener('click', loadPuzzle);
document.getElementById('skip-btn').addEventListener('click', () => {
  resetStreak();
  if(currentIndex < idsOf(currentLevel).length - 1){
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
document.getElementById('celebration-back-btn').addEventListener('click', showLevels);
document.getElementById('back-levels').addEventListener('click', (e) => { e.preventDefault(); showLevels(); });

/* ---------------- Arranque ---------------- */
let appInitialized = false;
function initApp(){
  if(appInitialized) return;
  appInitialized = true;
  setStreak(getStreak());
  let last = null;
  try{ last = localStorage.getItem('entreno_visualizacion_last'); }catch(e){}
  const fromHash = (location.hash || '').replace('#', '');
  const wanted = fromHash && idsOf(fromHash).length ? fromHash : (last && idsOf(last).length ? last : null);
  if(wanted) openLevel(wanted); else showLevels();
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
    gateChecking.textContent = 'Necesitas iniciar sesión en el sitio para entrar a Visualización. Redirigiendo a iniciar sesión…';
    window.location.href = '../login.html?next=' + encodeURIComponent(NEXT_PATH);
    return;
  }
  unlock();
}

requireLoginThenGate();

/* Coordenadas del tablero (js/coordenadas-tablero.js): la letra de columna abajo
   y el número de fila a la izquierda. Acá no hace falta el observador que
   repinta solo: el tablero no vuelve a redibujarse durante el ejercicio, así
   que drawStaticBoard() la llama a mano cada vez que dibuja. */
