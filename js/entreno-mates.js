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


const CATEGORY_ORDER = ['mate1', 'mate2', 'mate3'];
const CATEGORY_LABEL = { mate1: '🎯 Mate en 1', mate2: '⚔️ Mate en 2', mate3: '🏆 Mate en 3', __repaso: '🔁 Repasar fallados' };
const CATEGORY_VAR = { mate1: '--mate1', mate2: '--mate2', mate3: '--mate3', __repaso: '--brass' };
const CATEGORY_PLIES = { mate1: 1, mate2: 3, mate3: 5 }; // jugadas totales (blancas+negras) hasta el mate

let PUZZLES = { mate1: [], mate2: [], mate3: [] };

/* ---------------- Repasar fallados ----------------
   Lo que se resolvió con error o con pista entra a la cola de repaso espaciado
   (js/repaso-fallados.js, la misma de Ejercicios por tema) y vuelve cuando
   toca, en una pestaña más: «🔁 Repasar», que solo aparece si hoy toca alguno.
   Mientras se repasa, currentCategory es REPASO y PUZZLES[REPASO] es la lista
   de hoy, fija: lo que se vuelve a fallar queda para la próxima. */
const REPASO = '__repaso';
const CLAVE_REPASO = window.RepasoFallados ? RepasoFallados.CLAVES.mates : null;
const PUZZLE_POR_ID = {};
function pendientesDeRepaso(){
  if(!window.RepasoFallados) return [];
  return RepasoFallados.pendientes(CLAVE_REPASO, (id) => !!PUZZLE_POR_ID[id]);
}
function abrirRepaso(){
  const ids = pendientesDeRepaso();
  if(!ids.length) return;
  PUZZLES[REPASO] = ids.map((id) => PUZZLE_POR_ID[id]);
  currentCategory = REPASO;
  currentIndex = 0;
  loadPuzzle();
}

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
  comandos.ayuda('Jugada: "Cf3", "Dxh7+", "e1 g1". Pregunta: "caballos", "qué hay en e4". Escribe "ayuda" para todo.');
}

/* Cambiar de categoría escribiendo: «mate en 2», «categorías». Las pestañas
   de arriba quedan lejos del recuadro, y quien hace todo escribiendo tenía que
   salir a buscarlas con Tab (y volver). Va antes que todo lo demás: se puede
   pedir en medio de un ejercicio o con uno terminado. */
const NUMERO_ESCRITO = { '1': 1, uno: 1, '2': 2, dos: 2, '3': 3, tres: 3 };
function categoriaEscrita(texto){
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  if(/^(las )?categorias?$/.test(t)) return 'lista';
  if(/^(repasar|repaso|repasar fallados)$/.test(t)) return REPASO;
  const m = t.match(/^(?:categoria )?mate ?en ?(1|2|3|uno|dos|tres)$/) || t.match(/^mate(1|2|3)$/);
  return m ? 'mate' + NUMERO_ESCRITO[m[1]] : null;
}
function nombreCategoria(cat){ return CATEGORY_LABEL[cat].replace(/^\S+\s/, ''); }
function listaDeCategorias(){
  const partes = CATEGORY_ORDER.map((c) => `${nombreCategoria(c)}: ${solvedCountFor(c)} de ${PUZZLES[c].length} resueltos`);
  const pendientes = pendientesDeRepaso().length;
  if(pendientes) partes.push(`Repasar fallados: ${pendientes} para hoy`);
  return `Categorías (estás en ${nombreCategoria(currentCategory)}). ${partes.join('. ')}. Escribe por ejemplo «mate en 2» para cambiar.`;
}
// Lo que se antepone al próximo aviso: la categoría recién elegida, o «La
// solución era: …», que si no quedaban tapados por el aviso del ejercicio.
let prefijoAviso = '';

function jugarEscribiendo(texto, api){
  // «volver»: a donde se vino, diciendo adónde (js/entreno-progress.js). Antes: «No entendí».
  if(/^(volver|atras|salir|volver a entrenar)$/.test(CuadroComandos.normalizar(texto).replace(/[.!¡]/g, ''))){
    api.limpiar();
    EntrenoProgress.volver((t) => api.decir(t));
    return;
  }
  const cat = categoriaEscrita(texto);
  if(cat === 'lista'){ api.limpiar().decir(listaDeCategorias()); return; }
  if(cat){
    if(cat === REPASO && !pendientesDeRepaso().length && currentCategory !== REPASO){
      api.decir('Hoy no te toca repasar ningún mate. ' + listaDeCategorias()); return;
    }
    api.limpiar();
    prefijoAviso = `Categoría elegida: ${nombreCategoria(cat)}.`;
    openCategory(cat);
    if(prefijoAviso){ const p = prefijoAviso; prefijoAviso = ''; api.decir(p); }
    return;
  }
  // Terminado el ejercicio, «siguiente» escrito hace lo mismo que el botón.
  if(finEjercicio && finEjercicio.activo()){
    if(/^\s*sig(uiente)?\s*$/i.test(texto)){ api.limpiar(); finEjercicio.siguiente(); }
    else api.decir('Ejercicio terminado. Escribe "siguiente" para pasar al que sigue.');
    return;
  }
  if(locked){ api.decir('Espera un momento: el ejercicio está respondiendo.'); return; }
  // El intérprete busca la jugada entre las LEGALES y no toca la partida, así que
  // no hace falta ninguna copia.
  const mv = ComandosTablero.jugadaEscrita(game, texto);
  // Tres casos que se decían igual: no se entendió, no es legal, o es legal
  // pero no es la respuesta (ese lo dice playMove). js/comandos-tablero.js.
  if(!mv){ api.decir(ComandosTablero.noSePudoJugar(texto)); return; }
  api.limpiar().decir('');
  playMove(mv.from, mv.to, mv.promotion);
}

async function loadPuzzlesThenStart(){
  try {
    const res = await fetch('data/mates.json');
    if(!res.ok) throw new Error('mates.json: ' + res.status);
    const all = await res.json();
    all.forEach((p) => { if(PUZZLES[p.category]) { PUZZLES[p.category].push(p); PUZZLE_POR_ID[p.id] = p; } });
  } catch (e) {
    document.getElementById('main-content').innerHTML =
      '<p class="text-center text-brand-450 dark:text-brand-350 py-10">No se pudo cargar la base de mates. Intenta recargar la página.</p>';
    console.error(e);
    return;
  }
  await cargarDificultad();
  initApp();
}

/* La dificultad medida con los intentos reales (herramientas/mates-calibrar.js,
   js/mates-dificultad.js): una categoría con el 80 % de sus mates calibrados
   va de fácil a difícil; si no, barajada por bloques de 50 con la semilla del
   alumno (su id), para que los intentos se repartan entre todos los mates y
   la calibración llegue antes. Sin sesión ni archivo, el orden del libro. */
let DIFICULTAD = null;
async function cargarDificultad(){
  try {
    const res = await fetch('data/mates-dificultad.json');
    if(res.ok) DIFICULTAD = await res.json();
  } catch (e) { DIFICULTAD = null; }
  if(!window.MatesDificultad) return;
  let semilla = null;
  try { const { data } = await sb.auth.getSession(); semilla = data && data.session ? data.session.user.id : null; } catch (e) { semilla = null; }
  CATEGORY_ORDER.forEach((cat) => { PUZZLES[cat] = MatesDificultad.orden(PUZZLES[cat], DIFICULTAD, cat, semilla); });
}
function textoDificultad(puzzle){
  if(!DIFICULTAD || !window.MatesDificultad || !MatesDificultad.ordenada(DIFICULTAD, puzzle.category)) return '';
  const e = MatesDificultad.de(DIFICULTAD, puzzle.id);
  return e === null ? '' : ` · dificultad ≈${e}`;
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

// La racha (js/ejercicio-tablero.js): la misma en todas las páginas de ejercicios.
const { getStreak, getBestStreak, setStreak, bumpStreak, resetStreak } = EjercicioTablero.racha('entreno_mates');

/* ---------------- Estado del ejercicio actual ---------------- */
let currentCategory = 'mate1';
let currentIndex = 0;
let game = null;
let orientation = 'w'; // el bando que juega: el tablero se mira desde ahí
let finEjercicio = null;   // «Siguiente» y «Ver la línea» del ejercicio terminado
let lastMove = null;    // la última jugada del rival, marcada en el tablero
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
  if(cat === REPASO){ abrirRepaso(); return; }
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
  // La pestaña del repaso: solo si hoy toca alguno (o si se está repasando).
  const pendientes = pendientesDeRepaso().length;
  if(pendientes || currentCategory === REPASO){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab' + (currentCategory === REPASO ? ' active' : '');
    btn.style.setProperty('--tab-color', `var(${CATEGORY_VAR[REPASO]})`);
    btn.innerHTML = `${CATEGORY_LABEL[REPASO]} <span class="n">${pendientes} para hoy</span>`;
    btn.addEventListener('click', () => openCategory(REPASO));
    tabs.appendChild(btn);
  }
}

function updateProgressBar(){
  if(currentCategory === REPASO){
    const total = PUZZLES[REPASO].length;
    document.getElementById('progress-fill').style.width = (total ? Math.round(100 * currentIndex / total) : 0) + '%';
    document.getElementById('progress-label').textContent = `Repaso · posición ${Math.min(currentIndex + 1, total)} de ${total}`;
    return;
  }
  const total = PUZZLES[currentCategory].length;
  const done = solvedCountFor(currentCategory);
  document.getElementById('progress-fill').style.width = (total ? Math.round(100 * done / total) : 0) + '%';
  document.getElementById('progress-label').textContent = `${done}/${total} resueltos en ${CATEGORY_LABEL[currentCategory].replace(/^\S+\s/, '')} · posición ${currentIndex + 1} de ${total}${textoDificultad(currentPuzzle())}`;
}

/* ---------------- Tablero ---------------- */

function drawBoard(){
  // El tablero, desde el bando que juega (en los mates en 2 y en 3 hay casi 400
  // posiciones con negras), con la última jugada del rival y las marcas de la
  // pista: todo lo pinta el módulo común (js/ejercicio-tablero.js).
  EjercicioTablero.dibujar(document.getElementById('board'), {
    juego: game, orientacion: orientation, seleccionada: selectedSquare,
    ultima: lastMove, marcas: pistas.marcas(), alTocar: onSquareClick,
  });
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

function setStatus(text, cls){
  if(prefijoAviso){ text = prefijoAviso + ' ' + text; prefijoAviso = ''; }
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

function loadPuzzle(){
  const puzzle = currentPuzzle();
  if(finEjercicio){ finEjercicio.cerrar(); finEjercicio = null; }
  document.getElementById('play-area').style.display = 'block';
  document.getElementById('celebration').style.display = 'none';
  if(!puzzle){
    finishCategory();
    return;
  }
  game = new Chess(puzzle.fen);
  orientation = game.turn();
  solutionStep = 0;
  selectedSquare = null;
  lastMove = null;
  missedThisPuzzle = false;
  usedHintThisPuzzle = false;
  locked = false;
  document.getElementById('hint-btn').disabled = false;
  pistas.reiniciar();
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
      EjercicioTablero.destello(document.querySelector('[data-square="' + square + '"]'));
    }
    return;
  }
  const from = selectedSquare;
  selectedSquare = null;
  // En qué pieza corona: el diálogo de todo el sitio (js/coronacion.js). Algunas
  // de estas posiciones necesitan justo una subpromoción para dar mate.
  EjercicioTablero.jugarCoronando(game, from, square, (pieza) => playMove(from, square, pieza));
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

function playMove(from, to, promotion){
  const puzzle = currentPuzzle();
  const moveResult = game.move({ from, to, promotion: promotion || 'q' });
  drawBoard();
  if(!moveResult) return;

  const expected = puzzle.solution[solutionStep];
  // Cualquier jugada que dé mate también es correcta (como en Temas y en la
  // Racha): el banco guarda UNA solución, y a veces hay más de un mate.
  if(!EjercicioTablero.esAcierto(game, moveResult, expected)){
    // Qué contesta el rival, si chess.js lo puede afirmar (js/ejercicio-tablero.js).
    const refuta = EjercicioTablero.refutacion(game);
    game.undo();
    drawBoard();
    missedThisPuzzle = true;
    resetStreak();
    EjercicioTablero.destello(document.querySelector('[data-square="' + to + '"]'));
    // «Respuesta incorrecta» y no «no es legal»: la jugada se pudo hacer. En
    // Modo Adaptado, en palabras («caballo felix 3»), como todo lo que se oye.
    const dicha = blindMode && window.BlindNotation ? window.BlindNotation.sanSpoken(moveResult.san) : EjercicioTablero.jugadaEs(moveResult.san);
    setStatus(ComandosTablero.incorrecta(dicha, 'No lleva al mate en la cantidad de jugadas pedida.' + (refuta ? ' ' + refuta : '')), 'bad');
    return;
  }

  solutionStep++;
  pistas.reiniciar();   // la marca de la pista ya no apunta a nada
  if(solutionStep >= puzzle.solution.length || game.in_checkmate()){
    finishPuzzle();
    return;
  }

  // Jugada del rival: se reproduce automáticamente la línea de la solución.
  locked = true;
  setStatus('✓ Correcto — el rival responde…', 'ok');
  setTimeout(() => {
    const replySan = puzzle.solution[solutionStep];
    const reply = game.move(replySan);
    if(reply) lastMove = { from: reply.from, to: reply.to };
    solutionStep++;
    drawBoard();
    locked = false;
    if(solutionStep >= puzzle.solution.length){
      finishPuzzle();
    } else {
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
  // La cola de repaso: lo que costó entra, lo que se repasa se reprograma. Lo
  // limpio a la primera no entra nunca. Repasar no vuelve a registrar nada:
  // lo que está en la cola ya se resolvió (y contó) una vez.
  if(window.RepasoFallados) RepasoFallados.anotar(CLAVE_REPASO, puzzle.id, missedThisPuzzle, usedHintThisPuzzle, { category: puzzle.category });
  if(!alreadySolved){
    markSolved(puzzle.id);
    EntrenoProgress.log('mates', { puzzle_id: puzzle.id, category: puzzle.category,
      ...EntrenoProgress.comoSalio(missedThisPuzzle, usedHintThisPuzzle) });
  }
  updateProgressBar();
  buildTabs();
  // Antes saltaba al siguiente al segundo: el alumno decide cuándo, y puede
  // recorrer la línea del mate (js/ejercicio-tablero.js).
  finEjercicio = EjercicioTablero.fin({
    caja: '#fin-ejercicio', desde: puzzle.fen, jugadas: game.history(), orientacion: orientation,
    siguiente: pasarAlSiguiente,
  });
}
function pasarAlSiguiente(){
  finEjercicio = null;
  if(currentIndex < PUZZLES[currentCategory].length - 1){
    currentIndex++;
    loadPuzzle();
  } else {
    finishCategory();
  }
}

function finishCategory(){
  document.getElementById('play-area').style.display = 'none';
  document.getElementById('celebration').style.display = 'block';
  buildTabs();
  const total = PUZZLES[currentCategory].length;
  const enRepaso = currentCategory === REPASO;
  document.getElementById('celebration-title').textContent = enRepaso ? '¡Repaso terminado!' : '¡Categoría completa!';
  document.getElementById('celebration-replay-btn').style.display = enRepaso ? 'none' : '';
  const statsText = enRepaso
    ? `Repasaste ${total} ${total === 1 ? 'posición' : 'posiciones'}. Las que salieron limpias vuelven más adelante.`
    : `Resolviste las ${total} posiciones de ${CATEGORY_LABEL[currentCategory].replace(/^\S+\s/, '')}.`;
  document.getElementById('celebration-stats').textContent = statsText;
  if(window.BlindNotation) window.BlindNotation.speak(document.getElementById('celebration-title').textContent + ' ' + statsText);
  if(blindMode){
    // El foco cae directo en el botón de reinicio — así, en modo adaptado, basta con
    // presionar Enter para seguir en vez de tener que ir a buscar el botón a mano.
    document.getElementById('celebration-replay-btn').focus();
  }
}

/* Las pistas, por etapas (js/ejercicio-tablero.js): la pieza que se mueve y
   después la solución. En Modo Adaptado la casilla se dice en palabras. */
function jugadaEsperada(){
  const puzzle = currentPuzzle();
  if(!puzzle || !game) return null;
  const esperada = puzzle.solution[solutionStep];
  return game.moves({ verbose: true }).find((m) => m.san === esperada) || null;
}
const pistas = EjercicioTablero.pistas({
  boton: '#hint-btn',
  etapas: () => ['origen', 'solucion'],
  jugada: jugadaEsperada,
  repintar: drawBoard,
  decir: setStatus,
  enPalabras: () => blindMode,
  alDar: () => { usedHintThisPuzzle = true; },
  alResolver: (j, frase) => { selectedSquare = null; prefijoAviso = frase || ''; playMove(j.from, j.to, j.promotion || undefined); },
});
function giveHint(){
  if(locked) return;
  pistas.dar();
}
document.getElementById('hint-btn').addEventListener('click', giveHint);
document.getElementById('retry-btn').addEventListener('click', loadPuzzle);
document.getElementById('skip-btn').addEventListener('click', () => {
  resetStreak();
  // Saltar en el repaso no lo reprograma: sigue pendiente para la próxima.
  if(currentCategory === REPASO){
    if(currentIndex < PUZZLES[REPASO].length - 1){ currentIndex++; loadPuzzle(); }
    else { currentIndex = PUZZLES[REPASO].length; finishCategory(); }
    return;
  }
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
  // ?repaso=1 es el enlace de «Hoy te toca» del hub: abre la cola directo.
  if(new URLSearchParams(location.search).has('repaso') && pendientesDeRepaso().length){ abrirRepaso(); return; }
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
