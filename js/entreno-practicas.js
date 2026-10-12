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

/* Las series (posiciones y jugadas, comprobadas con chess.js) viven en
   js/practicas-series.js: la clase en vivo también las usa. */
const SETS = window.PracticasSeries.SETS;

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
  comandos.ayuda(AYUDA_RECUADRO);
}
const AYUDA_RECUADRO = 'Jugada: «Cf3», «Dxh7+», «e1 g1». Pregunta: «caballos», «qué hay en e4». «pista», «solución» (dice la jugada; no cuenta como resuelta) o «saltar» (pasa a la siguiente). Escribe «ayuda» para todo.';

/* «solución» y «saltar» / «siguiente» escritos: los contesta la página antes
   que la capa de la cuenta ciega (js/vision-cuenta.js), que apretaría el
   botón y diría «Listo: Saltar.» encima de la posición nueva. Antes no había
   ninguna de las dos: una posición atascada no se podía pasar. */
EjercicioTablero.palabrasPrimero(() => comandos && comandos.input, (texto) => {
  if(!currentSet || serieTerminada() || document.getElementById('set-view').style.display === 'none') return false;
  const que = EjercicioTablero.accionEscrita(texto);
  if(!que) return false;
  if(esperandoSiguiente){
    if(que === 'saltar') avanzarRonda();
    else setStatus('Ya tienes la solución de esta posición. Escribe «siguiente» para seguir.');
    return true;
  }
  if(roundLocked){ setStatus('Espera un momento: ya viene la siguiente posición.'); return true; }
  if(que === 'solucion') verSolucion(); else saltarRonda();
  return true;
});

function modoCiego(){ return document.documentElement.classList.contains('modo-ciego'); }
function serieTerminada(){ return document.getElementById('celebration').style.display === 'block'; }

function jugarEscribiendo(texto, api){
  /* Con la serie terminada, el recuadro sigue (en modo ciego se muda a la
     celebración, ver finishSet) y entiende lo mismo que los dos botones. */
  if(serieTerminada()){
    const t = texto.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if(/^sig(uiente)?( serie)?$/.test(t)){ api.limpiar(); document.getElementById('celebration-next-btn').click(); }
    else if(/^(volver|series|todas las series|lista)$/.test(t)){ api.limpiar(); document.getElementById('celebration-back-btn').click(); }
    else api.decir('Serie terminada. Escribe «siguiente» para la próxima serie o «volver» para ver todas.');
    return;
  }
  if(roundLocked){ api.decir('Espera un momento: ya viene la siguiente posición.'); return; }
  // El intérprete busca la jugada entre las LEGALES y no toca la partida, así que
  // no hace falta ninguna copia.
  const mv = ComandosTablero.jugadaEscrita(game, texto);
  // No se entendió, o no es legal: js/comandos-tablero.js dice cuál de las dos.
  if(!mv){ api.decir(ComandosTablero.noSePudoJugar(texto)); return; }
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

// La racha (js/ejercicio-tablero.js): la misma en todas las páginas de ejercicios.
const { getStreak, getBestStreak, setStreak, bumpStreak, resetStreak } = EjercicioTablero.racha('entreno_practicas');

let currentCategory = 'mates';
let currentSet = null;
let currentRoundIndex = 0;
let game = null;
let selectedSquare = null;
let roundLocked = false;
let hintsUsedThisRound = 0;
let errorsThisRound = 0; // jugadas equivocadas en esta posición: también bajan las estrellas
let roundStartTime = 0;
let setStarsEarned = [];
let setStartTime = 0;
let saltadas = 0;             // posiciones de la serie que se pasaron sin resolver
let esperandoSiguiente = false; // en Modo Adaptado, después de «solución»: espera «siguiente»

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
    // El foco al título de la lista: la pestaña apretada se repinta y el foco
    // se iba al <body>.
    btn.addEventListener('click', () => { currentCategory = cat; showList(true); });
    tabs.appendChild(btn);
  });
}

function starString(n){
  const full = '⭐'.repeat(n);
  const empty = '<span class="empty">⭐</span>'.repeat(3 - n);
  return full + empty;
}

/* «Repasar fallados» (js/repaso-fallados.js, lo mismo que Temas, Mates y
   Visualización): cada RONDA que salió con error, pista o «Ver solución»
   entra a una cola de repaso espaciado (id "serie:número") y vuelve cuando
   toca. El repaso es una serie más, armada con las rondas de hoy: cada una
   recuerda su serie (`_serie`), que es la que dice el motivo que vale. */
const REPASO = '__repaso';
const CLAVE_REPASO = window.RepasoFallados ? RepasoFallados.CLAVES.practicas : null;
function rondaPorId(rid){
  const i = rid.lastIndexOf(':');
  const set = SETS.find((s) => s.id === rid.slice(0, i));
  const r = set && set.rounds[+rid.slice(i + 1)];
  return r ? Object.assign({}, r, { _rid: rid, _serie: set.id }) : null;
}
function pendientesDeRepaso(){
  if(!window.RepasoFallados) return [];
  return RepasoFallados.pendientes(CLAVE_REPASO, (rid) => !!rondaPorId(rid));
}
function pintarRepaso(){
  const caja = document.getElementById('repaso-caja');
  const n = pendientesDeRepaso().length;
  caja.hidden = !n;
  if(!n) return;
  document.getElementById('repaso-texto').textContent = n === 1
    ? 'Hoy toca repasar 1 posición que te costó (la resolviste con un error o con una pista).'
    : `Hoy toca repasar ${n} posiciones que te costaron (las resolviste con un error o con una pista).`;
}
function abrirRepaso(){
  const rondas = pendientesDeRepaso().map(rondaPorId);
  if(!rondas.length) return;
  openSet({ id: REPASO, cat: currentCategory, emoji: '🔁', title: 'Repasar fallados',
    desc: 'Las que te costaron, otra vez. Si sale limpia, vuelve más adelante; si no, vuelve pronto.', rounds: rondas });
}

/* `enfocar`: el foco va al título de la lista. Al volver de una serie el botón
   que lo tenía desaparece y el foco caía al <body>; con la cuenta ciega,
   también al llegar a la página. */
function showList(enfocar){
  document.getElementById('set-view').style.display = 'none';
  document.getElementById('list-view').style.display = 'block';
  buildTabs();
  pintarRepaso();
  const list = setsFor(currentCategory);
  const hechas = list.filter(s => getSetStars(s.id) > 0).length;
  const titulo = document.getElementById('lista-titulo');
  titulo.textContent = `${CATEGORY_LABEL[currentCategory].replace(/^\S+\s/, '')}: ${hechas} de ${list.length} series hechas`;
  if(enfocar) titulo.focus();
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

function drawBoard(){
  // El tablero lo pinta el módulo común (js/ejercicio-tablero.js): desde el
  // bando que juega —hay series con negras— y con las marcas de la pista.
  EjercicioTablero.dibujar(document.getElementById('board'), {
    juego: game, orientacion: game.turn(), seleccionada: selectedSquare,
    marcas: pistas.marcas(), alTocar: onSquareClick,
  });
  montarTeclado();
  renderPositionReadout();
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
function highlightTargets(square){ EjercicioTablero.marcarDestinos(document.getElementById('board'), game, square); }

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
  // El recuadro vuelve a su lugar si se había mudado a la celebración.
  const lugar = document.getElementById('q-comandos');
  const tenia = comandos && document.activeElement === comandos.input;
  if(comandos && comandos.el.parentNode !== lugar){ lugar.appendChild(comandos.el); if(tenia) comandos.enfocar(); }
  game = new Chess(round.fen);
  selectedSquare = null;
  roundLocked = false;
  esperandoSiguiente = false;
  hintsUsedThisRound = 0;
  errorsThisRound = 0;
  roundStartTime = Date.now();
  document.getElementById('hint-btn').disabled = false;
  pistas.reiniciar();
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
  const from = selectedSquare;
  selectedSquare = null;
  if(window.Coronacion && Coronacion.hayQueElegir(game, from, square)){
    // El peón corona: la pieza la elige el alumno (js/coronacion.js).
    drawBoard();
    Coronacion.pedir(game.turn(), (elegida) => {
      if(!elegida) return;
      const r = game.move({ from, to: square, promotion: elegida });
      drawBoard();
      if(r) handleMoveResult(r);
    });
    return;
  }
  const moveResult = game.move({ from, to: square });
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
  // Cualquier jugada que dé mate también es correcta: la serie guarda UNA
  // jugada, y en las de mate a veces hay dos. Y en las tácticas, cualquiera
  // que cumpla el motivo (js/motivos-tacticos.js): en un descubierto, todo
  // salto del caballo descubre el jaque.
  const correct = (moveResult.from === round.from && moveResult.to === round.to) || game.in_checkmate() ||
    (window.MotivosTacticos && MotivosTacticos.MOTIVOS.includes(round._serie || currentSet.id) && MotivosTacticos.cumple(round._serie || currentSet.id, round.fen, moveResult));
  if(correct){
    finishRound();
  } else {
    errorsThisRound++;
    resetStreak();
    // «Respuesta incorrecta» y no «no es legal»: la jugada se pudo hacer. Y en
    // palabras en Modo Adaptado (antes decía «Nf3», en inglés).
    const dicha = blindMode && window.BlindNotation ? window.BlindNotation.sanSpoken(moveResult.san) : EjercicioTablero.jugadaEs(moveResult.san);
    setStatus(ComandosTablero.incorrecta(dicha), 'bad');
    setTimeout(() => { game = new Chess(round.fen); drawBoard(); setStatus('Inténtalo de nuevo.'); }, 900);
  }
}

/* conSolucion: la jugada la hizo el botón "Ver solución", no el alumno. Eso no
   suma a la racha (antes la dejaba en 1) ni se festeja como "¡Correcto!". */
function finishRound(conSolucion){
  roundLocked = true;
  document.getElementById('hint-btn').disabled = true;
  const seconds = ((Date.now() - roundStartTime) / 1000).toFixed(1);
  const stars = EntrenoProgress.estrellasDeLaRonda(hintsUsedThisRound, errorsThisRound);
  setStarsEarned.push(stars);
  // La cola de repaso: lo que costó entra; lo que se repasa se reprograma.
  const ronda = currentSet.rounds[currentRoundIndex];
  if(window.RepasoFallados) RepasoFallados.anotar(CLAVE_REPASO, ronda._rid || (currentSet.id + ':' + currentRoundIndex),
    errorsThisRound > 0, hintsUsedThisRound > 0 || !!conSolucion);
  if(!conSolucion) bumpStreak();
  const fast = !conSolucion && seconds < 4 && hintsUsedThisRound === 0 && errorsThisRound === 0;
  if(!conSolucion) setStatus(`✅ ¡Correcto!${fast ? ' ⚡ ¡Relámpago!' : ''} (${seconds}s)`, 'ok');
  /* Con la solución y en Modo Adaptado no se pasa sola: al segundo la
     posición nueva pisaba «La solución era: …» a medio leer. */
  if(conSolucion && blindMode){
    esperandoSiguiente = true;
    const dicha = document.getElementById('round-status').textContent;
    setStatus(`${dicha} No cuenta como resuelta. Escribe «siguiente» para seguir.`);
    return;
  }
  setTimeout(avanzarRonda, fast ? 900 : 1100);
}
function avanzarRonda(){
  esperandoSiguiente = false;
  if(currentRoundIndex < currentSet.rounds.length - 1){
    currentRoundIndex++;
    loadRound();
  } else {
    finishSet();
  }
}

/* «Saltar →» (o «saltar», «siguiente» escritos antes de resolverla): pasa a
   la siguiente sin resolverla. Cuenta como no resuelta: cero estrellas en la
   serie, corta la racha y entra a «Repasar fallados». */
function saltarRonda(){
  if(!currentSet) return;
  if(esperandoSiguiente){ avanzarRonda(); return; }
  if(roundLocked) return;
  roundLocked = true;
  resetStreak();
  saltadas++;
  setStarsEarned.push(0);
  const ronda = currentSet.rounds[currentRoundIndex];
  if(window.RepasoFallados) RepasoFallados.anotar(CLAVE_REPASO, ronda._rid || (currentSet.id + ':' + currentRoundIndex), true, true);
  const n = currentSet.rounds.length;
  if(currentRoundIndex >= n - 1){ finishSet(); return; }
  currentRoundIndex++;
  loadRound();
  const juegan = game.turn() === 'w' ? 'blancas' : 'negras';
  setStatus(`Saltaste la posición: no cuenta como resuelta. Posición ${currentRoundIndex + 1} de ${n}, juegan ${juegan}. ` +
    (blindMode ? 'Escribe la jugada que quieres hacer.' : 'Encuentra la jugada.'));
}
function verSolucion(){
  if(roundLocked || !currentSet) return;
  pistas.solucion();
}

/* El resultado se DICE en su región viva: la celebración aparece de golpe, el
   foco se iba con la zona de juego y el lector no leía nada (ni el título ni
   las estrellas). Sin los emojis, que el lector lee por su nombre. */
function anunciarResultado(texto){
  const r = document.getElementById('celebration-anuncio');
  if(!r) return;
  r.textContent = '';
  setTimeout(() => { r.textContent = texto.replace(/[^\p{L}\p{N}¡!¿?,.:;() —-]/gu, '').replace(/\s+/g, ' ').trim(); }, 60);
}

function finishSet(){
  document.getElementById('play-area').style.display = 'none';
  document.getElementById('celebration').style.display = 'block';
  const enRepaso = currentSet.id === REPASO;
  document.getElementById('celebration-next-btn').style.display = enRepaso ? 'none' : '';
  if(enRepaso){
    // El repaso no es una serie: no tiene estrellas propias ni se registra como serie terminada.
    const n = currentSet.rounds.length;
    document.getElementById('celebration-stars').innerHTML = '';
    document.getElementById('celebration-title').textContent = '¡Repaso terminado!';
    document.getElementById('celebration-stats').textContent =
      `Repasaste ${n} ${n === 1 ? 'posición' : 'posiciones'}. Las que salieron limpias vuelven más adelante.`;
    if(window.BlindNotation) window.BlindNotation.speak('¡Repaso terminado!');
    anunciarResultado('¡Repaso terminado! ' + document.getElementById('celebration-stats').textContent);
    document.getElementById('celebration-back-btn').focus();
    return;
  }
  const avg = setStarsEarned.reduce((a,b) => a+b, 0) / setStarsEarned.length;
  const stars = avg >= 2.6 ? 3 : (avg >= 1.6 ? 2 : 1);
  if(!currentSet.unico) setSetStars(currentSet.id, stars);
  document.getElementById('celebration-stars').innerHTML = starString(stars);
  const totalSeconds = ((Date.now() - setStartTime) / 1000).toFixed(0);
  const limpia = setStarsEarned.every(s => s === 3);
  const total = currentSet.rounds.length;
  document.getElementById('celebration-stats').textContent =
    `${total - saltadas} de ${total} posiciones en ${totalSeconds}s` +
    (saltadas ? ` (saltaste ${saltadas})` : '') +
    (limpia ? ' — ¡sin pistas ni errores!' : '');
  const titleText = stars === 3 ? '¡Serie perfecta! 🏆' : (stars === 2 ? '¡Serie completada! 🎉' : 'Serie completada — ¡a repetirla para subir de estrellas!');
  document.getElementById('celebration-title').textContent = titleText;
  // Cómo salió: cuántas posiciones de la serie salieron limpias (tres
  // estrellas: sin error, sin pista y sin «Ver solución»), y si fue toda.
  EntrenoProgress.log('practicar', { set_id: currentSet.id, category: currentSet.cat, title: currentSet.title, stars, seconds: Number(totalSeconds),
    rondas: setStarsEarned.length, rondas_limpias: setStarsEarned.filter(s => s === 3).length, limpio: limpia });
  if(window.BlindNotation) window.BlindNotation.speak(titleText);
  anunciarResultado(`${titleText} ${stars} estrella${stars === 1 ? '' : 's'} de 3. ${document.getElementById('celebration-stats').textContent.replace(/([^.!?])$/, '$1.')}`);
  if(modoCiego() && comandos){
    /* Con la cuenta ciega, el foco NO sale del recuadro: se hace todo desde
       ahí. El recuadro vivía en la zona de juego, que se esconde; se muda a la
       celebración y vuelve a su lugar al abrir la serie siguiente. */
    document.getElementById('celebration').appendChild(comandos.el);
    comandos.enfocar();
    comandos.decir('Escribe «siguiente» para seguir con la próxima serie, o «volver» para ver todas.');
  } else if(blindMode){
    // El foco cae directo en "Siguiente serie" — así, en modo adaptado, basta con
    // presionar Enter para seguir en vez de tener que ir a buscar el botón a mano.
    document.getElementById('celebration-next-btn').focus();
  } else {
    // Sin el modo, al título: el botón que tenía el foco desapareció con la zona de juego.
    document.getElementById('celebration-title').focus();
  }
}

/* Las pistas, por etapas (js/ejercicio-tablero.js): la pieza, después la
   casilla adonde va, después la solución. Cada una cuenta para las estrellas
   (EntrenoProgress.estrellasDeLaRonda). */
const pistas = EjercicioTablero.pistas({
  boton: '#hint-btn',
  etapas: () => ['origen', 'destino', 'solucion'],
  jugada: () => { const r = currentSet && currentSet.rounds[currentRoundIndex]; return r ? { from: r.from, to: r.to, promotion: r.promotion } : null; },
  juego: () => game,
  repintar: () => { drawBoard(); },
  decir: setStatus,
  enPalabras: () => blindMode,
  alDar: (n) => { hintsUsedThisRound = n; },
  alResolver: (j, frase) => {
    resetStreak();
    const moveResult = game.move({ from: j.from, to: j.to, promotion: j.promotion || 'q' });
    drawBoard();
    renderPositionReadout();
    // La frase la arma js/ejercicio-tablero.js: en palabras en Modo Adaptado
    // (antes decía «Solución: Nf3.», en inglés).
    setStatus(frase || `Solución: ${moveResult ? EjercicioTablero.jugadaEs(moveResult.san) : j.from + '-' + j.to}.`);
    finishRound(true);
  },
});
function giveHint(){
  if(roundLocked) return;
  pistas.dar();
}
document.getElementById('hint-btn').addEventListener('click', giveHint);
document.getElementById('retry-round-btn').addEventListener('click', loadRound);
document.getElementById('solution-btn').addEventListener('click', verSolucion);
document.getElementById('skip-round-btn').addEventListener('click', saltarRonda);

function openSet(set){
  currentSet = set;
  currentRoundIndex = 0;
  saltadas = 0;
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
  // Con la cuenta ciega y escribiendo en el recuadro («siguiente»), el foco se
  // queda ahí: se hace todo desde el recuadro.
  if(modoCiego() && comandos && document.activeElement === comandos.input) return;
  titulo.setAttribute('tabindex', '-1');
  titulo.focus();
}

document.getElementById('back-to-list').addEventListener('click', (e) => { e.preventDefault(); showList(true); });
document.getElementById('repaso-btn').addEventListener('click', abrirRepaso);
document.getElementById('celebration-back-btn').addEventListener('click', () => showList(true));
document.getElementById('celebration-next-btn').addEventListener('click', () => {
  const list = setsFor(currentCategory);
  const idx = list.findIndex(s => s.id === currentSet.id);
  if(idx >= 0 && idx < list.length - 1) openSet(list[idx + 1]);
  else showList(true);
});

/* ---------------- Arranque ---------------- */
let appInitialized = false;
function initApp(){
  if(appInitialized) return;
  appInitialized = true;
  setStreak(getStreak());
  applyBlindModeUI();
  showList(modoCiego());
  // ?repaso=1 es el enlace de «Hoy te toca» del hub: abre la cola directo.
  if(new URLSearchParams(location.search).has('repaso') && pendientesDeRepaso().length) abrirRepaso();
  else abrirElPedido();
}

/* «?abrir=…»: lo piden las tareas (un tema: «tacticas») y la clase en vivo (una
   serie, «pasillo», o una posición sola, «pasillo:2»). Antes se abría siempre la
   lista y había que buscarlo. Una posición sola va como una serie de una, sin
   anotarle estrellas a ninguna serie de la lista (lo que se falle sí entra al
   repaso, como siempre). */
function abrirElPedido(){
  let pedido = null;
  try{ pedido = new URLSearchParams(location.search).get('abrir'); }catch(e){ pedido = null; }
  if(!pedido) return;
  if(CATEGORY_ORDER.includes(pedido)){ currentCategory = pedido; showList(true); return; }
  const set = SETS.find((x) => x.id === pedido);
  if(set){ currentCategory = set.cat; openSet(set); return; }
  const r = /:\d+$/.test(pedido) ? rondaPorId(pedido) : null;
  if(!r) return;
  const serie = SETS.find((x) => x.id === r._serie);
  currentCategory = serie.cat;
  openSet({ id: 'ronda-' + pedido, cat: serie.cat, emoji: serie.emoji, unico: true,
    title: serie.title, desc: 'Te lo abrió tu profe. ' + serie.desc, rounds: [r] });
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
