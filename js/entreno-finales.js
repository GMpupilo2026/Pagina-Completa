/* El código de entreno/finales.html: «Finales contra la máquina».

   Los finales de libro (Lucena, Philidor, Vancura, dama contra peón…) jugados
   contra Stockfish a máxima fuerza, con una meta: GANAR (dar mate) o SALVAR
   (hacer tablas). No hay «la jugada de la solución»: el rival es el motor, que
   se defiende o ataca como puede, y lo que decide es cómo termina la partida.

   - Ganar: el alumno da mate. Tablas por reglamento (ahogado, repetición, 50
     jugadas, material insuficiente) es no haberlo logrado.
   - Salvar: tablas por reglamento, o aguantar `aguantar` jugadas propias sin
     perder. Al llegar a esas jugadas el motor mira la posición: si ya está
     perdida (mate a la vista o dos peones abajo), no cuenta.

   El banco (entreno/data/finales.json) lo arma herramientas/finales-generar.js
   con cada posición comprobada con Stockfish; no se edita a mano.

   Cuenta como resuelto el final que se gana o se salva, UNA vez, y se registra
   en training_progress como actividad 'finales' (lo ve el profesor en
   Informes, suma en las tareas y en el plan del diagnóstico). Ver «Finales
   contra la máquina» en docs/decisiones/entrenamiento.md. */

const gate = document.getElementById('gate');
const app = document.getElementById('app');
const gateChecking = document.getElementById('gate-checking');
const NEXT_PATH = 'entreno/finales.html';

async function unlock(){
  gate.classList.add('hidden');
  app.classList.remove('hidden');
  // El progreso vive en la cuenta: se baja y se funde con el de este aparato
  // ANTES de pintar, para seguir donde se quedó aunque sea otro dispositivo.
  await ProgresoUsuario.init();
  EntrenoProgress.init();
  cargarBancoYEmpezar();
}

const GLYPH = {
  w: { p:'♙', n:'♘', b:'♗', r:'♖', q:'♕', k:'♔' },
  b: { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', k:'♚' },
};
const META = {
  ganar: { icono: '🏆', etiqueta: 'Ganar', texto: 'dar mate' },
  tablas: { icono: '🛡️', etiqueta: 'Salvar', texto: 'hacer tablas' },
};
const BANDO = { w: 'blancas', b: 'negras' };

let FINALES = [];
let AGUANTAR = 25;

/* ---------------- Modo normal / modo adaptado (lector de pantalla) ----------------
   Igual que en Mates: el tablero no se esconde en Modo Adaptado, se recorre con
   las flechas y se le puede preguntar (js/tablero-accesible.js); el recuadro
   donde se escribe lo destapa el CSS con la clase `adaptive-mode`. */
const BLIND_MODE_KEY = 'oscarBlindMode_v1';
let blindMode = false;
try{ blindMode = localStorage.getItem(BLIND_MODE_KEY) === '1'; }catch(e){}

function renderPositionReadout(){
  const readout = document.getElementById('position-readout');
  if(!blindMode || !game){ readout.style.display = 'none'; return; }
  readout.innerHTML = window.BlindNotation.groupedReadoutHTML(game);
  readout.style.display = 'block';
}
const refreshSpeechToggle = window.BlindNotation
  ? window.BlindNotation.setupSpeechToggle('speech-toggle-btn', () => true)
  : null;
function applyBlindModeUI(){
  if(modeNormalBtn){ modeNormalBtn.setAttribute('aria-pressed', blindMode ? 'false' : 'true'); modeNormalBtn.classList.toggle('active', !blindMode); }
  if(modeBlindBtn){ modeBlindBtn.setAttribute('aria-pressed', blindMode ? 'true' : 'false'); modeBlindBtn.classList.toggle('active', blindMode); }
  if(refreshSpeechToggle) refreshSpeechToggle();
  renderPositionReadout();
}
function setBlindMode(value){
  blindMode = !!value;
  // La preferencia la guarda js/adaptive-mode.js (ver Mates): escrita a mano,
  // la mitad del modo no llegaba hasta recargar.
  if(window.AdaptiveMode) window.AdaptiveMode.set(blindMode);
  else try{ localStorage.setItem(BLIND_MODE_KEY, blindMode ? '1' : '0'); }catch(e){}
  applyBlindModeUI();
}
document.addEventListener('adaptivemode:change', (e) => {
  const on = !!(e.detail && e.detail.activo);
  if(on !== blindMode) setBlindMode(on);
});
const modeNormalBtn = document.getElementById('mode-normal-btn');
const modeBlindBtn = document.getElementById('mode-blind-btn');
modeNormalBtn.addEventListener('click', () => setBlindMode(false));
modeBlindBtn.addEventListener('click', () => setBlindMode(true));

/* ---------------- El recuadro donde se escribe ---------------- */
let comandos = null;
function montarComandos(){
  if(comandos || !window.CuadroComandos) return;
  comandos = CuadroComandos.montar(document.getElementById('q-comandos'), {
    etiqueta: 'Escribe tu jugada, o una pregunta sobre la posición',
    juego: () => game,
    tablero: () => teclado,
    onEnviar: jugarEscribiendo,
  });
  comandos.ayuda('Jugada: "Tc4", "Rd2", "e1 e4". Pregunta: "torres", "qué hay en e4". Escribe "ayuda" para todo.');
}
function jugarEscribiendo(texto, api){
  if(locked){ api.decir('Espera un momento: la máquina está pensando.'); return; }
  if(terminado){ api.decir('Este final ya terminó. Reinícialo o pasa al siguiente.'); return; }
  const mv = ComandosTablero.jugadaEscrita(game, texto);
  if(!mv){ api.decir(`"${texto}" no es una jugada legal en esta posición. Escribe "ayuda" si no sabes qué se puede escribir.`); return; }
  api.limpiar().decir('');
  playMove(mv.from, mv.to, mv.promotion);
}

async function cargarBancoYEmpezar(){
  try {
    const res = await fetch('data/finales.json');
    if(!res.ok) throw new Error('finales.json: ' + res.status);
    const banco = await res.json();
    FINALES = banco.finales || [];
    if(banco.aguantar) AGUANTAR = banco.aguantar;
  } catch (e) {
    document.getElementById('main-content').innerHTML =
      '<p class="text-center text-brand-450 dark:text-brand-350 py-10">No se pudieron cargar los finales. Intenta recargar la página.</p>';
    console.error(e);
    return;
  }
  initApp();
}

/* ---------------- Progreso (viaja con la cuenta: js/progreso-usuario.js) ---------------- */
const CLAVE_RESUELTOS = 'entreno_finales_solved';
function getSolved(){
  try{ return JSON.parse(localStorage.getItem(CLAVE_RESUELTOS) || '{}') || {}; }catch(e){ return {}; }
}
function markSolved(id){
  const s = getSolved();
  s[id] = true;
  try{ localStorage.setItem(CLAVE_RESUELTOS, JSON.stringify(s)); }catch(e){}
}
function isSolved(id){ return !!getSolved()[id]; }

/* «Repasar fallados» (js/repaso-fallados.js, la misma cola de Temas y Mates):
   un final perdido (o unas tablas cuando había que ganar) vuelve hoy mismo; uno
   logrado con pista, pronto; y logrado limpio, cada vez más espaciado, hasta
   salir de la cola con tres seguidos. Uno logrado limpio a la primera no entra. */
const CLAVE_REPASO = window.RepasoFallados ? RepasoFallados.CLAVES.finales : null;
function pendientesDeRepaso(){
  return CLAVE_REPASO ? RepasoFallados.pendientes(CLAVE_REPASO, (id) => FINALES.some((f) => f.id === id)) : [];
}
function anotarRepaso(conError, conPista){
  if(CLAVE_REPASO) RepasoFallados.anotar(CLAVE_REPASO, finalActual().id, conError, conPista);
}

/* ---------------- Estado del final en curso ---------------- */
let actual = 0;
let game = null;
let selectedSquare = null;
let locked = false;
let terminado = false;
let usedHint = false;
let hintStage = 0;
let jugadasPropias = 0;
let turno = 0;          // sube con cada final que se carga: una respuesta del motor que llega tarde no se juega en otro
let ultima = null;      // { from, to } de la última jugada, para marcarla

function finalActual(){ return FINALES[actual]; }

function buildTabs(){
  const tabs = document.getElementById('tabs');
  tabs.innerHTML = '';
  const s = getSolved();
  const repasar = pendientesDeRepaso();
  FINALES.forEach((f, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab' + (i === actual ? ' active' : '');
    btn.setAttribute('aria-current', i === actual ? 'true' : 'false');
    // El estado va escrito, no solo con el color o un icono.
    const toca = repasar.includes(f.id);
    btn.textContent = `${META[f.meta].icono} ${f.titulo}${s[f.id] ? ' ✓' : ''}${toca ? ' 🔁' : ''}`;
    btn.setAttribute('aria-label', `${f.titulo}: ${META[f.meta].etiqueta.toLowerCase()}${s[f.id] ? ', ya lo lograste' : ''}${toca ? ', toca repasarlo hoy' : ''}`);
    btn.addEventListener('click', () => { actual = i; loadFinal(); });
    tabs.appendChild(btn);
  });
  const hechos = FINALES.filter((f) => s[f.id]).length;
  document.getElementById('progress-fill').style.width = (FINALES.length ? Math.round(100 * hechos / FINALES.length) : 0) + '%';
  document.getElementById('progress-label').textContent = `${hechos} de ${FINALES.length} finales logrados` +
    (repasar.length ? ` · ${repasar.length} para repasar hoy (🔁)` : '');
}

/* ---------------- Tablero ---------------- */
function isLightSquare(square){
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10) - 1;
  return (file + rank) % 2 === 1;
}
function drawBoard(){
  const board = document.getElementById('board');
  board.innerHTML = '';
  const f = finalActual();
  for(const square of EjercicioTablero.casillas(f.alumno)){
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
    if(ultima && (square === ultima.from || square === ultima.to)) btn.classList.add('last-move');
    if(square === selectedSquare){ btn.classList.add('selected'); btn.dataset.estado = 'seleccionada'; }
    btn.addEventListener('click', () => onSquareClick(square));
    board.appendChild(btn);
  }
  montarTeclado();
  renderPositionReadout();
}
let teclado = null;
function montarTeclado(){
  if(teclado || !window.TableroAccesible) return;
  teclado = TableroAccesible.montar(document.getElementById('board'), {
    nombre: 'Tablero del final',
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
  if(comandos) comandos.decir(text);
}
function highlightTargets(square){
  const board = document.getElementById('board');
  game.moves({ square, verbose: true }).forEach((m) => {
    const cell = board.querySelector('[data-square="' + m.to + '"]');
    if(cell) cell.classList.add(m.flags.includes('c') || m.flags.includes('e') ? 'target-capture' : 'target');
  });
}
/* La jugada como se escribe en el resto del sitio (Tc2, no Rc2: en inglés la
   R es la torre y acá es el rey), o dicha en voz en Modo Adaptado. La
   traducción es la de js/tipos-reglas.js, una sola copia. */
function nombreJugada(san){
  if(blindMode && window.BlindNotation) return window.BlindNotation.sanSpoken(san);
  return window.TiposReglas ? TiposReglas.sanEs(san) : san;
}

/* ---------------- El final ---------------- */
function loadFinal(){
  const f = finalActual();
  turno++;
  game = new Chess(f.fen);
  selectedSquare = null;
  locked = false;
  terminado = false;
  usedHint = false;
  hintStage = 0;
  jugadasPropias = 0;
  ultima = null;
  document.getElementById('play-area').style.display = 'block';
  document.getElementById('celebration').style.display = 'none';
  document.getElementById('hint-btn').disabled = false;
  document.getElementById('hint-btn').textContent = '💡 Pista';
  document.getElementById('final-titulo').textContent = f.titulo;
  document.getElementById('final-idea').textContent = f.idea;
  const meta = f.meta === 'ganar'
    ? `Meta: <b>ganar</b> — dar mate.`
    : `Meta: <b>salvar</b> — hacer tablas o aguantar ${AGUANTAR} jugadas sin perder.`;
  document.getElementById('turn-banner').innerHTML = `Juegas con <b>${BANDO[f.alumno]}</b>. ${meta}`;
  drawBoard();
  buildTabs();
  try{ localStorage.setItem('entreno_finales_last', f.id); }catch(e){}
  montarComandos();
  if(window.PracticeEngine) PracticeEngine.preload();
  if(game.turn() !== f.alumno){
    setStatus('Empieza la máquina…');
    maquinaJuega();
  } else {
    setStatus(blindMode ? `Juegas con ${BANDO[f.alumno]}. Te toca. Escribe tu jugada.` : 'Te toca. Haz clic en la pieza que quieres mover.');
  }
}

function onSquareClick(square){
  if(locked || terminado) return;
  const f = finalActual();
  if(game.turn() !== f.alumno) return;
  const piece = game.get(square);
  if(selectedSquare === null){
    if(piece && piece.color === game.turn()){
      selectedSquare = square; drawBoard(); highlightTargets(square);
    }
    return;
  }
  if(square === selectedSquare){ selectedSquare = null; drawBoard(); return; }
  const candidates = game.moves({ square: selectedSquare, verbose: true }).filter((m) => m.to === square);
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
  EjercicioTablero.jugarCoronando(game, from, square, (pieza) => playMove(from, square, pieza));
}

if(typeof enableBoardDrag !== 'undefined'){
  enableBoardDrag(document.getElementById('board'), {
    isDraggable: (square) => {
      if(locked || terminado || !game) return false;
      const piece = game.get(square);
      return !!(piece && piece.color === game.turn() && game.turn() === finalActual().alumno);
    },
    isSelected: (square) => selectedSquare === square,
    onSquareClick: (square) => onSquareClick(square),
  });
}

function playMove(from, to, promotion){
  const mv = game.move({ from, to, promotion: promotion || 'q' });
  if(!mv){ drawBoard(); return; }
  ultima = { from: mv.from, to: mv.to };
  hintStage = 0;
  document.getElementById('hint-btn').textContent = '💡 Pista';
  drawBoard();
  jugadasPropias++;
  if(revisarFinal()) return;
  if(finalActual().meta === 'tablas' && jugadasPropias >= AGUANTAR){ comprobarAguante(); return; }
  maquinaJuega();
}

async function maquinaJuega(){
  const miTurno = turno;
  locked = true;
  setStatus('La máquina piensa…');
  let uci = null;
  try { uci = window.PracticeEngine ? await PracticeEngine.getMove(game.fen(), 'max') : null; } catch (e) { uci = null; }
  if(miTurno !== turno) return;   // mientras pensaba se cambió de final
  // Si el motor no contesta, la partida no se queda colgada (ver
  // js/practice-engine.js): una jugada legal cualquiera, y se dice.
  let deRespaldo = false;
  if(!uci && window.PracticeEngine){ uci = PracticeEngine.jugadaDeRespaldo(game.fen()); deRespaldo = true; }
  const mv = uci ? game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined }) : null;
  locked = false;
  if(!mv){ setStatus('La máquina no pudo jugar. Reinicia el final para intentarlo de nuevo.', 'bad'); return; }
  ultima = { from: mv.from, to: mv.to };
  drawBoard();
  if(revisarFinal()) return;
  const aguante = finalActual().meta === 'tablas' ? ` Llevas ${jugadasPropias} de ${AGUANTAR} jugadas.` : '';
  setStatus(`La máquina jugó ${nombreJugada(mv.san)}.${deRespaldo ? ' (El motor no respondió: fue una jugada de respaldo.)' : ''} Te toca.${aguante}`);
}

/* ¿Terminó la partida? Mate, ahogado, repetición, 50 jugadas o material
   insuficiente: lo decide chess.js, no la página. */
function revisarFinal(){
  const f = finalActual();
  if(game.in_checkmate()){
    const ganoAlumno = game.turn() !== f.alumno;
    if(ganoAlumno) logrado('¡Jaque mate! Ganaste el final.');
    else fallado('Te dieron mate. Mira la idea y vuelve a intentarlo.');
    return true;
  }
  if(game.in_draw() || game.in_stalemate() || game.in_threefold_repetition()){
    const por = game.in_stalemate() ? 'ahogado'
      : game.in_threefold_repetition() ? 'triple repetición'
      : game.insufficient_material() ? 'material insuficiente' : 'la regla de las 50 jugadas';
    if(f.meta === 'tablas') logrado(`¡Tablas por ${por}! Salvaste el final.`);
    else fallado(`Tablas por ${por}: se te escapó la victoria. Vuelve a intentarlo.`);
    return true;
  }
  return false;
}

/* Salvar sin tablas por reglamento: aguantó las jugadas pedidas. El motor mira
   la posición a máxima fuerza; si ya está perdida no cuenta. Si el motor no
   contesta, no se da por logrado: no se puede saber. */
async function comprobarAguante(){
  const miTurno = turno;
  locked = true;
  setStatus(`Aguantaste ${AGUANTAR} jugadas. La máquina revisa la posición…`);
  let score = null;
  try { score = window.PracticeEngine ? await PracticeEngine.evaluate(game.fen()) : null; } catch (e) { score = null; }
  if(miTurno !== turno) return;
  locked = false;
  if(!score){
    setStatus('No se pudo comprobar la posición con el motor. Sigue jugando o reinicia el final.', 'bad');
    maquinaJuega();
    return;
  }
  // La evaluación es desde el lado que mueve, que ahora es la máquina.
  const perdida = score.type === 'mate' ? score.value > 0 : score.value >= 200;
  if(perdida) fallado(`Llegaste a ${AGUANTAR} jugadas, pero la posición ya está perdida. Mira la idea y vuelve a intentarlo.`);
  else logrado(`¡Aguantaste ${AGUANTAR} jugadas y la posición sigue en tablas! Salvaste el final.`);
}

function logrado(texto){
  terminado = true;
  const f = finalActual();
  const yaEstaba = isSolved(f.id);
  anotarRepaso(false, usedHint);
  if(!yaEstaba){
    markSolved(f.id);
    EntrenoProgress.log('finales', Object.assign({ final_id: f.id, meta: f.meta, jugadas: jugadasPropias },
      EntrenoProgress.comoSalio(false, usedHint)));
  }
  mostrarResultado('🎉', texto, usedHint ? 'Lo lograste con pista: la próxima vez, intenta sin ella.' : '', true);
}
function fallado(texto){
  terminado = true;
  anotarRepaso(true, usedHint);
  mostrarResultado('♟️', texto, finalActual().pista ? `Pista: ${finalActual().pista}` : '');
}
function mostrarResultado(emoji, titulo, detalle, ganado){
  buildTabs();
  document.getElementById('celebration-emoji').textContent = emoji;
  document.getElementById('celebration-title').textContent = titulo;
  document.getElementById('celebration-stats').textContent = detalle;
  document.getElementById('celebration').style.display = 'block';
  document.getElementById('hint-btn').disabled = true;
  setStatus(titulo);
  const hayOtro = actual < FINALES.length - 1;
  document.getElementById('celebration-next-btn').style.display = hayOtro ? '' : 'none';
  /* Al ganarlo, lo que sigue es el siguiente final, no repetir el mismo: el
     foco iba a «Intentar de nuevo» y un Intro de más volvía a empezar el que
     ya estaba resuelto. Al perderlo, sí: intentar de nuevo. */
  if(blindMode) document.getElementById(ganado && hayOtro ? 'celebration-next-btn' : 'celebration-retry-btn').focus();
}

/* Dos pistas: la idea del final, y después la jugada que haría el motor en tu
   lugar (la pieza resaltada). Cualquiera de las dos cuenta como pista. */
async function giveHint(){
  if(locked || terminado) return;
  const f = finalActual();
  usedHint = true;
  if(hintStage === 0){
    hintStage = 1;
    setStatus(`Pista: ${f.pista}`);
    document.getElementById('hint-btn').textContent = '💡 ¿Qué jugaría la máquina?';
    return;
  }
  const miTurno = turno;
  locked = true;
  setStatus('La máquina busca la mejor jugada para ti…');
  let uci = null;
  try { uci = window.PracticeEngine ? await PracticeEngine.getMove(game.fen(), 'max') : null; } catch (e) { uci = null; }
  if(miTurno !== turno) return;
  locked = false;
  if(!uci){ setStatus('El motor no respondió. Prueba con la idea de la pista.'); return; }
  const prueba = new Chess(game.fen());
  const mv = prueba.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
  if(!mv) return;
  const cell = document.querySelector('#board [data-square="' + mv.from + '"]');
  if(cell) cell.classList.add('hint-from');
  setStatus(`La máquina jugaría ${nombreJugada(mv.san)}.`);
}

document.getElementById('hint-btn').addEventListener('click', giveHint);
document.getElementById('retry-btn').addEventListener('click', loadFinal);
document.getElementById('skip-btn').addEventListener('click', () => { actual = (actual + 1) % FINALES.length; loadFinal(); });
document.getElementById('celebration-retry-btn').addEventListener('click', loadFinal);
document.getElementById('celebration-next-btn').addEventListener('click', () => { actual = Math.min(actual + 1, FINALES.length - 1); loadFinal(); });

/* ---------------- Arranque ---------------- */
let appInitialized = false;
function initApp(){
  if(appInitialized) return;
  appInitialized = true;
  applyBlindModeUI();
  // ?final=<id> es el enlace de una tarea o del plan; si no, el primero sin
  // lograr (o el último que se abrió, si todos están logrados).
  // ?repaso=1 (del «Hoy te toca» del hub): el primero que toca repasar.
  const params = new URLSearchParams(location.search);
  const pedido = params.get('final') || (params.get('repaso') ? pendientesDeRepaso()[0] : null);
  const s = getSolved();
  let i = FINALES.findIndex((f) => f.id === pedido);
  if(i < 0) i = FINALES.findIndex((f) => !s[f.id]);
  if(i < 0){
    let last = null;
    try{ last = localStorage.getItem('entreno_finales_last'); }catch(e){}
    i = Math.max(0, FINALES.findIndex((f) => f.id === last));
  }
  actual = i;
  loadFinal();
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
    gateChecking.textContent = 'Necesitas iniciar sesión en el sitio para entrar a Finales. Redirigiendo a iniciar sesión…';
    window.location.href = '../login.html?next=' + encodeURIComponent(NEXT_PATH);
    return;
  }
  unlock();
}

requireLoginThenGate();

// Coordenadas del tablero (js/coordenadas-tablero.js), como en Mates.
if (window.Coordenadas) Coordenadas.aplicar(document.getElementById('board'));
