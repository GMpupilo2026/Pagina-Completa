/* El código de entreno/practicas.html.

   Vivía escrito dentro de la página, en un <script> de 26 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

const gate = document.getElementById('gate');
const app = document.getElementById('app');
const gateChecking = document.getElementById('gate-checking');
const NEXT_PATH = 'entreno/practicas.html';

async function unlock(){
  gate.classList.add('hidden');
  app.classList.remove('hidden');
  EntrenoProgress.init();
  // El progreso vive en la cuenta: se baja y se funde con el de este aparato
  // ANTES de pintar, para seguir donde se quedó aunque sea otro dispositivo.
  await ProgresoUsuario.init();
  initApp();
}

/* ---------------- CONTENIDO DE LAS PRÁCTICAS ----------------
   Cada FEN y cada jugada solución de esta lista se generó y se verificó
   programáticamente con chess.js (node), incluyendo, según el tipo de
   práctica: que la jugada da jaque mate (mates de escuela y finales con
   torre), que la pieza que se mueve ataca de verdad a las dos piezas
   objetivo (horquillas y ataques dobles), que la pieza capturada está
   realmente clavada — quitarla del tablero expone al rey — (clavadas), o
   que el jaque tras la jugada lo da una pieza DISTINTA a la que se movió
   (ataques descubiertos). Ninguna posición se escribió "a ojo".
*/
const GLYPH = {
  w: { p:'♙', n:'♘', b:'♗', r:'♖', q:'♕', k:'♔' },
  b: { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', k:'♚' },
};

const SETS = [
  { id:'pasillo', cat:'mates', emoji:'🚪', title:'Mate del pasillo', desc:'El rey enemigo está atrapado en la última fila por sus propios peones.',
    rounds:[
      { fen:'6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1', from:'e1', to:'e8' },
      { fen:'2k5/1ppp4/8/8/8/8/8/6RK w - - 0 1', from:'g1', to:'g8' },
      { fen:'5k2/4ppp1/8/8/8/8/8/Q6K w - - 0 1', from:'a1', to:'a8' },
      { fen:'6k1/5ppp/8/8/8/8/7K/R4R2 w - - 0 1', from:'a1', to:'a8' },
      { fen:'1k6/ppp5/8/8/8/8/6K1/7Q w - - 0 1', from:'h1', to:'h8' },
    ] },
  { id:'coz', cat:'mates', emoji:'🐴', title:'Mate de la coz', desc:'El caballo da el jaque mate final cuando el rey está completamente rodeado por sus propias piezas.',
    rounds:[
      { fen:'6rk/6pp/3N4/8/8/8/8/4K3 w - - 0 1', from:'d6', to:'f7' },
      { fen:'6nk/6pp/8/4N3/8/8/8/4K3 w - - 0 1', from:'e5', to:'f7' },
      { fen:'5rkb/5ppp/8/3N4/8/8/8/4K3 w - - 0 1', from:'d5', to:'e7' },
      { fen:'kr6/pp6/4N3/8/8/8/8/4K3 w - - 0 1', from:'e6', to:'c7' },
      { fen:'k7/8/8/8/4n3/8/6PP/6RK b - - 0 1', from:'e4', to:'f2' },
    ] },
  { id:'beso', cat:'mates', emoji:'👑', title:'Mate con dama o torre apoyada', desc:'Tu rey protege a la pieza que da el jaque mate justo al lado del rey rival.',
    rounds:[
      { fen:'7k/8/6K1/8/8/8/8/7Q w - - 0 1', from:'h1', to:'h7' },
      { fen:'k7/8/1K6/8/8/8/8/Q7 w - - 0 1', from:'a1', to:'a7' },
      { fen:'7Q/8/8/8/8/6K1/8/7k w - - 0 1', from:'h8', to:'h2' },
      { fen:'Q7/8/8/8/8/1K6/8/k7 w - - 0 1', from:'a8', to:'a2' },
      { fen:'6k1/8/6K1/8/8/8/8/R7 w - - 0 1', from:'a1', to:'a8' },
    ] },
  { id:'horquilla', cat:'tacticas', emoji:'🍴', title:'Horquillas de caballo', desc:'Un solo salto de caballo ataca dos piezas rivales a la vez.',
    rounds:[
      { fen:'2q3k1/8/6N1/8/8/8/8/4K3 w - - 0 1', from:'g6', to:'e7' },
      { fen:'r3k3/8/4N3/8/8/8/8/7K w - - 0 1', from:'e6', to:'c7' },
      { fen:'3q3k/8/8/r3N3/8/8/8/7K w - - 0 1', from:'e5', to:'c6' },
      { fen:'7k/8/8/4N3/1r1r4/8/8/7K w - - 0 1', from:'e5', to:'c6' },
      { fen:'7k/8/8/6N1/3b1r2/8/8/7K w - - 0 1', from:'g5', to:'e6' },
    ] },
  { id:'clavada', cat:'tacticas', emoji:'📌', title:'Clavadas', desc:'La pieza rival no se puede mover sin dejar a su rey en jaque — captúrala gratis.',
    rounds:[
      { fen:'4k3/8/4n3/8/8/8/4R3/4K3 w - - 0 1', from:'e2', to:'e6' },
      { fen:'7k/8/5n2/8/8/2B5/8/4K3 w - - 0 1', from:'c3', to:'f6' },
      { fen:'8/8/8/8/1Q3r1k/8/8/K7 w - - 0 1', from:'b4', to:'f4' },
      { fen:'8/8/k1b4R/8/8/8/8/K7 w - - 0 1', from:'h6', to:'c6' },
      { fen:'k7/8/2n5/8/8/8/8/K6B w - - 0 1', from:'h1', to:'c6' },
    ] },
  { id:'descubierto', cat:'tacticas', emoji:'🎭', title:'Ataques descubiertos', desc:'Mueve una pieza para que otra, detrás de ella, descubra un jaque.',
    rounds:[
      { fen:'7k/8/8/8/8/2N5/8/B3K3 w - - 0 1', from:'c3', to:'b5' },
      { fen:'4k3/8/8/8/4N3/8/8/K3R3 w - - 0 1', from:'e4', to:'c5' },
      { fen:'k7/8/8/3B4/8/8/8/K6Q w - - 0 1', from:'d5', to:'e6' },
      { fen:'8/8/8/8/R1N4k/8/8/K7 w - - 0 1', from:'c4', to:'b6' },
      { fen:'7k/8/8/8/8/8/1P6/B3K3 w - - 0 1', from:'b2', to:'b3' },
    ] },
  { id:'doble', cat:'tacticas', emoji:'⚔️', title:'Ataques dobles', desc:'Una sola jugada de una pieza de largo alcance amenaza dos piezas rivales a la vez.',
    rounds:[
      { fen:'7k/8/8/r6R/8/8/4r3/7K w - - 0 1', from:'h5', to:'e5' },
      { fen:'k7/8/2r3n1/8/8/8/8/K6B w - - 0 1', from:'h1', to:'e4' },
      { fen:'4r1k1/8/8/8/b6Q/8/8/K7 w - - 0 1', from:'h4', to:'e4' },
      { fen:'7k/8/q7/4K3/8/8/3R3r/8 w - - 0 1', from:'d2', to:'a2' },
      { fen:'k7/6n1/1r6/8/8/8/8/B6K w - - 0 1', from:'a1', to:'d4' },
    ] },
  { id:'torre', cat:'finales', emoji:'🏰', title:'Mate con rey y torre', desc:'El rey corta el paso y la torre da el jaque mate en el borde del tablero.',
    rounds:[
      { fen:'2k5/8/2K5/8/8/8/8/7R w - - 0 1', from:'h1', to:'h8' },
      { fen:'5k2/8/5K2/8/8/8/8/R7 w - - 0 1', from:'a1', to:'a8' },
      { fen:'R7/8/8/8/8/3K4/8/3k4 w - - 0 1', from:'a8', to:'a1' },
      { fen:'3k4/8/3K4/8/8/8/8/R7 w - - 0 1', from:'a1', to:'a8' },
      { fen:'1k6/8/1K6/8/8/8/8/7R w - - 0 1', from:'h1', to:'h8' },
    ] },
  { id:'escalera', cat:'finales', emoji:'🪜', title:'Mate de la escalera', desc:'Dos torres suben la escalera y dan mate solas, sin ayuda del rey.',
    rounds:[
      { fen:'6k1/R7/8/8/8/8/8/1K1R4 w - - 0 1', from:'d1', to:'d8' },
      { fen:'1k6/7R/8/8/8/8/8/4R1K1 w - - 0 1', from:'e1', to:'e8' },
      { fen:'6K1/8/8/k7/8/1R6/8/7R w - - 0 1', from:'h1', to:'a1' },
      { fen:'R7/8/8/8/7k/8/8/1K4R1 w - - 0 1', from:'a8', to:'h8' },
      { fen:'3K3R/8/8/8/8/8/6R1/1k6 w - - 0 1', from:'h8', to:'h1' },
    ] },
];

const CATEGORY_ORDER = ['mates','tacticas','finales'];
const CATEGORY_LABEL = {mates:'🏆 Mates de escuela', tacticas:'🎯 Motivos tácticos', finales:'🏰 Finales con torre'};
const CATEGORY_VAR = {mates:'--mates', tacticas:'--tacticas', finales:'--finales'};

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
   treinta y dos piezas. Un tablero se MIRA —se va a una casilla, se pregunta qué
   hay al lado, se busca dónde está la dama— y eso es justo lo que el tablero
   escondido no deja hacer. Ahora se queda, se recorre con las flechas y se le
   puede preguntar (js/tablero-accesible.js). Quien ve poco además lo necesita a
   la vista: es la razón por la que amplía la pantalla.
   El recuadro no se enseña ni se esconde desde acá: lo destapa el CSS con la
   clase `adaptive-mode`, así que encender el modo surte efecto al instante. */
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
 * "Dxh7+". Ahora lo lee js/chess-move-parser.js, el mismo intérprete de los
 * visores de los cursos y de Juegos, así que entiende las dos formas, en español
 * y en inglés. Y antes de tratarlo como jugada, el recuadro mira si era una
 * PREGUNTA ("caballos", "qué hay en e4"): eso lo resuelve js/cuadro-comandos.js
 * con js/comandos-tablero.js, sin que esta página tenga que saber nada. */
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
  // El intérprete busca la jugada entre las LEGALES y no toca la partida, así que
  // no hace falta ninguna copia.
  const mv = ComandosTablero.jugadaEscrita(game, texto);
  if(!mv){ api.decir(`"${texto}" no es una jugada legal en esta posición. Escribe "ayuda" si no sabes qué se puede escribir.`); return; }
  const moveResult = game.move({ from: mv.from, to: mv.to, promotion: mv.promotion || 'q' });
  if(!moveResult) return;
  api.limpiar().decir('');
  renderPositionReadout();
  handleMoveResult(moveResult);
}
/* Una sola parada de tabulador para todo el tablero y las flechas por dentro,
   más los atajos de una tecla en Modo Adaptado. Antes eran 64 botones seguidos
   en el recorrido del tabulador —y mudos: el lector de pantalla decía "botón"
   sesenta y cuatro veces—. Se monta una vez y se repone solo en cada repintado. */
let teclado = null;
function montarTeclado(){
  if(teclado || !window.TableroAccesible) return;
  teclado = TableroAccesible.montar(document.getElementById('board'), {
    nombre: 'Tablero del ejercicio',
    juego: () => game,
  });
}


/* ---------------- Progreso, racha y estrellas (localStorage) ---------------- */
function getProgress(){
  try{ return JSON.parse(localStorage.getItem('entreno_practicas_v1') || '{}'); }catch(e){ return {}; }
}
function saveProgress(p){ localStorage.setItem('entreno_practicas_v1', JSON.stringify(p)); }
function getSetStars(id){ return getProgress()[id] || 0; }
function setSetStars(id, stars){
  const p = getProgress();
  if(!p[id] || stars > p[id]) p[id] = stars;
  saveProgress(p);
}

function getStreak(){
  try{ return parseInt(localStorage.getItem('entreno_practicas_streak') || '0', 10) || 0; }catch(e){ return 0; }
}
function getBestStreak(){
  try{ return parseInt(localStorage.getItem('entreno_practicas_best') || '0', 10) || 0; }catch(e){ return 0; }
}
function setStreak(n){
  localStorage.setItem('entreno_practicas_streak', String(n));
  const best = Math.max(getBestStreak(), n);
  localStorage.setItem('entreno_practicas_best', String(best));
  document.getElementById('streak-count').textContent = n;
  document.getElementById('streak-best').textContent = best;
}
function bumpStreak(){
  setStreak(getStreak() + 1);
  const bar = document.getElementById('streak-bar');
  bar.classList.remove('pulse'); void bar.offsetWidth; bar.classList.add('pulse');
}
function resetStreak(){ setStreak(0); }

let currentCategory = 'mates';
let currentSet = null;
let currentRoundIndex = 0;
let game = null;
let selectedSquare = null;
let roundLocked = false;
let hintsUsedThisRound = 0;
let roundStartTime = 0;
let setStarsEarned = [];
let setStartTime = 0;

function setsFor(cat){ return SETS.filter(s => s.cat === cat); }

function buildTabs(){
  const tabs = document.getElementById('tabs');
  tabs.innerHTML = '';
  CATEGORY_ORDER.forEach((cat) => {
    const list = setsFor(cat);
    const done = list.filter(s => getSetStars(s.id) > 0).length;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab' + (cat === currentCategory ? ' active' : '');
    btn.style.setProperty('--tab-color', `var(${CATEGORY_VAR[cat]})`);
    btn.innerHTML = `${CATEGORY_LABEL[cat]} <span class="n">${done}/${list.length}</span>`;
    btn.addEventListener('click', () => { currentCategory = cat; showList(); });
    tabs.appendChild(btn);
  });
}

function starString(n){
  const full = '⭐'.repeat(n);
  const empty = '<span class="empty">⭐</span>'.repeat(3 - n);
  return full + empty;
}

function showList(){
  document.getElementById('set-view').style.display = 'none';
  document.getElementById('list-view').style.display = 'block';
  buildTabs();
  const list = setsFor(currentCategory);
  const box = document.getElementById('set-list');
  box.innerHTML = '';
  list.forEach((set) => {
    const stars = getSetStars(set.id);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'set-card';
    card.innerHTML = `
      <div class="top"><span class="name">${set.emoji} ${set.title}</span></div>
      <span class="desc">${set.desc}</span>
      <span class="stars">${starString(stars)}</span>
      <div class="progress-track"><div class="progress-fill" style="width:${stars > 0 ? 100 : 0}%"></div></div>`;
    card.addEventListener('click', () => openSet(set));
    box.appendChild(card);
  });
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
      if(square === selectedSquare){ btn.classList.add('selected'); btn.dataset.estado = 'seleccionada'; }
      btn.addEventListener('click', () => onSquareClick(square, btn));
      board.appendChild(btn);
    }
  }
  montarTeclado();
  renderPositionReadout();
}

function flashWrong(btn){
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

function buildRoundDots(){
  const wrap = document.getElementById('round-progress');
  wrap.innerHTML = '';
  currentSet.rounds.forEach((r, i) => {
    const dot = document.createElement('span');
    dot.className = 'round-dot';
    if(i < currentRoundIndex) dot.classList.add('done');
    if(i === currentRoundIndex) dot.classList.add('current');
    wrap.appendChild(dot);
  });
}

function loadRound(){
  const round = currentSet.rounds[currentRoundIndex];
  game = new Chess(round.fen);
  selectedSquare = null;
  roundLocked = false;
  hintsUsedThisRound = 0;
  roundStartTime = Date.now();
  document.getElementById('hint-btn').disabled = false;
  document.getElementById('hint-btn').textContent = '💡 Pista';
  drawBoard();
  buildRoundDots();
  setStatus(blindMode ? 'Escribe la jugada que quieres hacer.' : 'Encuentra la jugada. Haz clic en la pieza que quieres mover.');
  /* Se monta el recuadro pero NO se le roba el foco: quien acaba de apretar un
     botón espera seguir donde estaba, y quien usa lector de pantalla ya tiene el
     aviso leyéndole el ejercicio nuevo. El foco se mueve cuando la persona lo
     pide (Tab, o el atajo "i" con el tablero enfocado). */
  montarComandos();
}

function onSquareClick(square, btn){
  if(roundLocked) return;
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
  const legal = game.moves({ square: selectedSquare, verbose: true });
  const target = legal.find(m => m.to === square);
  if(!target){
    if(piece && piece.color === game.turn()){
      selectedSquare = square; drawBoard(); highlightTargets(square);
    } else { selectedSquare = null; drawBoard(); }
    return;
  }
  const moveResult = game.move({ from: selectedSquare, to: square, promotion: 'q' });
  selectedSquare = null;
  drawBoard();
  if(!moveResult) return;
  handleMoveResult(moveResult);
}

// Arrastrar y soltar piezas (además del clic-clic de siempre): ver js/board-drag.js.
// isDraggable() repite las mismas condiciones que ya usa onSquareClick() para decidir
// si esta casilla se puede levantar, así el arrastre nunca permite algo que el clic no.
if(typeof enableBoardDrag !== 'undefined'){
  enableBoardDrag(document.getElementById('board'), {
    isDraggable: (square) => {
      if(roundLocked) return false;
      const piece = game.get(square);
      return !!(piece && piece.color === game.turn());
    },
    isSelected: (square) => selectedSquare === square,
    onSquareClick: (square) => onSquareClick(square),
  });
}

function handleMoveResult(moveResult){
  const round = currentSet.rounds[currentRoundIndex];
  const correct = moveResult.from === round.from && moveResult.to === round.to;
  if(correct){
    finishRound();
  } else {
    resetStreak();
    setStatus(`${moveResult.san} es legal, pero no es la jugada que buscamos.`, 'bad');
    setTimeout(() => { game = new Chess(round.fen); drawBoard(); setStatus('Inténtalo de nuevo.'); }, 900);
  }
}

function finishRound(){
  roundLocked = true;
  document.getElementById('hint-btn').disabled = true;
  const seconds = ((Date.now() - roundStartTime) / 1000).toFixed(1);
  const stars = hintsUsedThisRound >= 2 ? 1 : (hintsUsedThisRound === 1 ? 2 : 3);
  setStarsEarned.push(stars);
  bumpStreak();
  const fast = seconds < 4 && hintsUsedThisRound === 0;
  setStatus(`✅ ¡Correcto!${fast ? ' ⚡ ¡Relámpago!' : ''} (${seconds}s)`, 'ok');
  setTimeout(() => {
    if(currentRoundIndex < currentSet.rounds.length - 1){
      currentRoundIndex++;
      loadRound();
    } else {
      finishSet();
    }
  }, fast ? 900 : 1100);
}

function finishSet(){
  document.getElementById('play-area').style.display = 'none';
  document.getElementById('celebration').style.display = 'block';
  const avg = setStarsEarned.reduce((a,b) => a+b, 0) / setStarsEarned.length;
  const stars = avg >= 2.6 ? 3 : (avg >= 1.6 ? 2 : 1);
  setSetStars(currentSet.id, stars);
  document.getElementById('celebration-stars').innerHTML = starString(stars);
  const totalSeconds = ((Date.now() - setStartTime) / 1000).toFixed(0);
  const noHints = setStarsEarned.every(s => s === 3);
  document.getElementById('celebration-stats').textContent =
    `${currentSet.rounds.length} de ${currentSet.rounds.length} posiciones en ${totalSeconds}s` +
    (noHints ? ' — ¡sin usar ninguna pista!' : '');
  const titleText = stars === 3 ? '¡Serie perfecta! 🏆' : (stars === 2 ? '¡Serie completada! 🎉' : 'Serie completada — ¡a repetirla para subir de estrellas!');
  document.getElementById('celebration-title').textContent = titleText;
  EntrenoProgress.log('practicar', { set_id: currentSet.id, category: currentSet.cat, title: currentSet.title, stars, seconds: Number(totalSeconds) });
  if(window.BlindNotation) window.BlindNotation.speak(titleText);
  if(blindMode){
    // El foco cae directo en "Siguiente serie" — así, en modo adaptado, basta con
    // presionar Enter para seguir en vez de tener que ir a buscar el botón a mano.
    document.getElementById('celebration-next-btn').focus();
  }
}

function giveHint(){
  if(roundLocked) return;
  hintsUsedThisRound++;
  const round = currentSet.rounds[currentRoundIndex];
  const board = document.getElementById('board');
  if(hintsUsedThisRound === 1){
    board.querySelectorAll('.hint-from').forEach(el => el.classList.remove('hint-from'));
    const cell = board.querySelector('[data-square="' + round.from + '"]');
    if(cell) cell.classList.add('hint-from');
    setStatus(blindMode ? `Pista: mueve la pieza en ${window.BlindNotation.squareSpoken(round.from)}.` : 'Pista: fíjate en la pieza resaltada.');
    document.getElementById('hint-btn').textContent = '💡 Otra pista';
  } else if(hintsUsedThisRound === 2){
    const cell = board.querySelector('[data-square="' + round.to + '"]');
    if(cell) cell.classList.add('hint-to');
    setStatus(blindMode ? `Pista: la casilla de destino es ${window.BlindNotation.squareSpoken(round.to)}.` : 'Pista: la casilla marcada con el círculo es el destino.');
    document.getElementById('hint-btn').textContent = '💡 Ver solución';
  } else {
    resetStreak();
    const moveResult = game.move({ from: round.from, to: round.to, promotion: 'q' });
    drawBoard();
    renderPositionReadout();
    setStatus(`Solución: ${moveResult ? moveResult.san : round.from + '-' + round.to}.`);
    finishRound();
  }
}
document.getElementById('hint-btn').addEventListener('click', giveHint);
document.getElementById('retry-round-btn').addEventListener('click', loadRound);

function openSet(set){
  currentSet = set;
  currentRoundIndex = 0;
  setStarsEarned = [];
  setStartTime = Date.now();
  document.getElementById('list-view').style.display = 'none';
  document.getElementById('set-view').style.display = 'block';
  document.getElementById('play-area').style.display = 'block';
  document.getElementById('celebration').style.display = 'none';
  // El emoji es adorno: va escondido del lector de pantalla, que si no lo lee
  // por su nombre ("persona corriendo") antes del título de la serie.
  const titulo = document.getElementById('set-title');
  titulo.textContent = '';
  const emoji = document.createElement('span');
  emoji.setAttribute('aria-hidden', 'true');
  emoji.textContent = set.emoji + ' ';
  titulo.append(emoji, set.title);
  document.getElementById('set-text').textContent = set.desc;
  loadRound();
  // El botón de la serie desaparece con la lista y el foco se iba al <body>:
  // se lleva al título, que se lee primero, y el siguiente Tab ya es el ejercicio.
  titulo.setAttribute('tabindex', '-1');
  titulo.focus();
}

document.getElementById('back-to-list').addEventListener('click', (e) => { e.preventDefault(); showList(); });
document.getElementById('celebration-back-btn').addEventListener('click', showList);
document.getElementById('celebration-next-btn').addEventListener('click', () => {
  const list = setsFor(currentCategory);
  const idx = list.findIndex(s => s.id === currentSet.id);
  if(idx >= 0 && idx < list.length - 1) openSet(list[idx + 1]);
  else showList();
});

/* ---------------- Arranque ---------------- */
let appInitialized = false;
function initApp(){
  if(appInitialized) return;
  appInitialized = true;
  setStreak(getStreak());
  applyBlindModeUI();
  showList();
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
    gateChecking.textContent = 'Necesitas iniciar sesión en el sitio para entrar a Practicar. Redirigiendo a iniciar sesión…';
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
