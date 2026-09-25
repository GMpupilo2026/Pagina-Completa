/* El código de entreno/temas.html.

   Vivía escrito dentro de la página, en un <script> de 27 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

const gate = document.getElementById('gate');
const app = document.getElementById('app');
const gateChecking = document.getElementById('gate-checking');
const NEXT_PATH = 'entreno/temas.html';

async function unlock(){
  gate.classList.add('hidden');
  app.classList.remove('hidden');
  EntrenoProgress.init();
  // El progreso vive en la cuenta: se baja y se funde con el de este aparato
  // ANTES de pintar, para seguir donde se quedó aunque sea otro dispositivo.
  await ProgresoUsuario.init();
  heredarTactica();
  loadDataThenStart();
}

const GLYPH = {
  w: { p:'♙', n:'♘', b:'♗', r:'♖', q:'♕', k:'♔' },
  b: { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', k:'♚' },
};
const PIECE_NAME = { p:'peón', n:'caballo', b:'alfil', r:'torre', q:'dama', k:'rey' };
// Un grupo sin icono se pinta con un punto pelado, así que al sumar uno nuevo
// hay que sumarlo acá también: el de táctica es el mismo ⚔️ que tenía su página.
const GROUP_ICON = { tactica:'⚔️', recommended:'🎲', phases:'⏳', motifs:'🎯', advanced:'🧠', mates:'♚', mateThemes:'👑', specialMoves:'✨', goals:'🏁', lengths:'📏', origin:'🏛️' };

let DATA = null;           // {groups, themes:{key:[ids]}, puzzles:{id:{fen,solution,rating,themes,mate}}}
let THEME_INFO = {};       // key -> {name, desc, lichess}

async function loadDataThenStart(){
  try {
    const res = await fetch('data/temas.json');
    if(!res.ok) throw new Error('temas.json: ' + res.status);
    DATA = await res.json();
    DATA.groups.forEach((g) => g.themes.forEach((t) => { THEME_INFO[t.key] = t; }));
    TEMAS_DE_TACTICA = temasDeTactica();
  } catch (e) {
    document.getElementById('main-content').innerHTML =
      '<p class="text-center text-brand-450 dark:text-brand-350 py-10">No se pudo cargar la base de ejercicios por tema. Intenta recargar la página.</p>';
    console.error(e);
    return;
  }
  initApp();
}

// Qué temas llegaron de la página de Táctica. NO va escrito a mano: sale del
// propio grupo de temas.json, que es quien lo decide (lo escribe
// entreno/data/sumar_tactica.py). Con la lista copiada acá, agregarle una
// categoría al grupo la dejaría contando como "temas" sin que nada fallara.
let TEMAS_DE_TACTICA = new Set();
function temasDeTactica(){
  const g = (DATA.groups || []).find((x) => x.id === 'tactica');
  return new Set(g ? g.themes.map((t) => t.key) : []);
}

/* Los 148 ejercicios de táctica vivían en su propia página, con su propia
   lista de resueltos (`entreno_tactica_solved`). Al traerlos acá, quien ya
   llevaba cuarenta hechos empezaría de cero y no entendería por qué — así que
   su lista se funde con la de esta página. Los ids no se pisan (los de táctica
   son texto, `ultima-linea-001`; los de Lichess son números), y como se unen y
   no se reemplazan, correrlo mil veces da lo mismo. Se hace DESPUÉS de
   ProgresoUsuario.init(), o sea sobre la lista ya bajada de la cuenta, y el
   resultado se vuelve a subir por la misma vía. */
function heredarTactica(){
  try {
    const viejos = JSON.parse(localStorage.getItem('entreno_tactica_solved') || '{}');
    const ids = Object.keys(viejos).filter((id) => viejos[id]);
    if(!ids.length) return;
    const ahora = JSON.parse(localStorage.getItem('entreno_temas_solved') || '{}');
    let nuevos = 0;
    ids.forEach((id) => { if(!ahora[id]){ ahora[id] = true; nuevos += 1; } });
    if(nuevos) localStorage.setItem('entreno_temas_solved', JSON.stringify(ahora));
  } catch (e) { /* sin progreso heredado se empieza de cero, no se rompe nada */ }
}

/* ---------------- Progreso y racha (localStorage) ---------------- */
function getSolved(){
  try{ return JSON.parse(localStorage.getItem('entreno_temas_solved') || '{}'); }catch(e){ return {}; }
}
function markSolved(id){
  const s = getSolved();
  s[id] = true;
  localStorage.setItem('entreno_temas_solved', JSON.stringify(s));
}
function isSolved(id){ return !!getSolved()[id]; }
function idsOf(theme){ return DATA.themes[theme] || []; }
function solvedCountFor(theme){
  const s = getSolved();
  return idsOf(theme).filter((id) => s[id]).length;
}
function firstUnsolvedIndex(theme){
  const s = getSolved();
  const idx = idsOf(theme).findIndex((id) => !s[id]);
  return idx === -1 ? 0 : idx;
}

function getStreak(){
  try{ return parseInt(localStorage.getItem('entreno_temas_streak') || '0', 10) || 0; }catch(e){ return 0; }
}
function getBestStreak(){
  try{ return parseInt(localStorage.getItem('entreno_temas_best') || '0', 10) || 0; }catch(e){ return 0; }
}
function setStreak(n){
  localStorage.setItem('entreno_temas_streak', String(n));
  const best = Math.max(getBestStreak(), n);
  localStorage.setItem('entreno_temas_best', String(best));
  document.getElementById('streak-count').textContent = n;
  document.getElementById('streak-best').textContent = best;
}
function bumpStreak(){
  setStreak(getStreak() + 1);
  const bar = document.getElementById('streak-bar');
  bar.classList.remove('pulse'); void bar.offsetWidth; bar.classList.add('pulse');
}
function resetStreak(){ setStreak(0); }

/* ---------------- Vista de temas ---------------- */
function normalize(s){ return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

function buildThemes(){
  const q = normalize(document.getElementById('search').value.trim());
  const wrap = document.getElementById('groups');
  wrap.innerHTML = '';
  const solved = getSolved();
  let totalThemes = 0;
  const seen = new Set();
  const allIds = new Set();
  DATA.groups.forEach((g) => {
    const themes = g.themes.filter((t) => idsOf(t.key).length && (!q || normalize(t.name + ' ' + t.desc + ' ' + t.key).includes(q)));
    if(!themes.length) return;
    const sec = document.createElement('section');
    sec.className = 'group';
    const h2 = document.createElement('h2');
    h2.innerHTML = `<span aria-hidden="true">${GROUP_ICON[g.id] || '•'}</span> ${g.title} <small>${themes.length} ${themes.length === 1 ? 'tema' : 'temas'}</small>`;
    sec.appendChild(h2);
    const grid = document.createElement('div');
    grid.className = 'themes';
    themes.forEach((t) => {
      const ids = idsOf(t.key);
      const done = ids.filter((id) => solved[id]).length;
      if(!seen.has(t.key)){ seen.add(t.key); totalThemes++; ids.forEach((id) => allIds.add(id)); }
      if(!ids.length) return;
      const card = document.createElement('article');
      card.className = 'theme' + (done >= ids.length ? ' done' : '');
      card.innerHTML = `
        <h3><span>${t.name}</span><span class="n">${done}/${ids.length}</span></h3>
        <p>${t.desc}</p>
        <div class="bar" role="progressbar" aria-label="Progreso en ${t.name}" aria-valuemin="0" aria-valuemax="${ids.length}" aria-valuenow="${done}"><i style="width:${Math.round(100 * done / ids.length)}%"></i></div>
        <div class="acts">
          <button type="button" class="tbtn" data-theme="${t.key}">${done === 0 ? 'Resolver' : (done >= ids.length ? 'Repasar' : 'Continuar')}<span class="sr-only"> ${t.name} (${g.title})</span></button>
          <span class="left">${done >= ids.length ? 'completo ✓' : `faltan ${ids.length - done}`}</span>
        </div>`;
      card.querySelector('button').addEventListener('click', () => openTheme(t.key));
      grid.appendChild(card);
    });
    sec.appendChild(grid);
    wrap.appendChild(sec);
  });
  if(!wrap.children.length){
    wrap.innerHTML = '<p class="text-center text-brand-450 dark:text-brand-350 py-10">Ningún tema coincide con la búsqueda.</p>';
  }
  updateOverall();
}
// Con un respiro: buildThemes() recorre todos los temas y, de paso,
// updateOverall() escribe dos veces en localStorage — repetir eso en cada
// tecla mientras se escribe la búsqueda es trabajo (y escritura en disco)
// de sobra que no cambia nada hasta que la persona deja de teclear.
let buscarTemaTimer = null;
document.getElementById('search').addEventListener('input', () => {
  clearTimeout(buscarTemaTimer);
  buscarTemaTimer = setTimeout(buildThemes, 200);
});

function updateOverall(){
  const solved = getSolved();
  const allIds = new Set();
  let nThemes = 0;
  Object.keys(DATA.themes).forEach((k) => { if(DATA.themes[k].length){ nThemes++; DATA.themes[k].forEach((id) => allIds.add(id)); } });
  const total = allIds.size;
  const done = [...allIds].filter((id) => solved[id]).length;
  const pct = total ? Math.round(100 * done / total) : 0;
  document.getElementById('total-solved').textContent = done;
  document.getElementById('total-left').textContent = total - done;
  document.getElementById('total-count').textContent = total;
  document.getElementById('total-themes').textContent = nThemes;
  document.getElementById('overall-pct').textContent = pct + ' %';
  document.getElementById('overall-fill').style.width = pct + '%';
  const bar = document.getElementById('overall-bar');
  bar.setAttribute('aria-valuemax', total);
  bar.setAttribute('aria-valuenow', done);
  bar.setAttribute('aria-valuetext', `${done} de ${total} ejercicios resueltos, faltan ${total - done}`);
  // la ficha del hub de Entrenamiento lee estos dos valores para mostrar la misma línea de progreso
  try{ localStorage.setItem('entreno_temas_total', String(total)); localStorage.setItem('entreno_temas_done', String(done)); }catch(e){}
}

function showThemes(){
  document.getElementById('play-view').style.display = 'none';
  document.getElementById('themes-view').style.display = 'block';
  buildThemes();
  try{ localStorage.removeItem('entreno_temas_last'); }catch(e){}
  window.scrollTo({ top: 0 });
}

/* ---------------- Estado del ejercicio actual ---------------- */
let currentTheme = null;
let currentIndex = 0;
let game = null;
let orientation = 'w';
let solutionStep = 0;
let selectedSquare = null;
let missedThisPuzzle = false;
let usedHintThisPuzzle = false;
let locked = false;
let lastMove = null;

function currentId(){ return idsOf(currentTheme)[currentIndex]; }
function currentPuzzle(){ return DATA.puzzles[currentId()]; }

function openTheme(key){
  currentTheme = key;
  const info = THEME_INFO[key] || { name: key, desc: '' };
  document.getElementById('play-title').textContent = info.name;
  document.getElementById('play-desc').textContent = info.desc;
  document.getElementById('themes-view').style.display = 'none';
  document.getElementById('play-view').style.display = 'block';
  try{ localStorage.setItem('entreno_temas_last', key); }catch(e){}
  if(solvedCountFor(key) >= idsOf(key).length){
    currentIndex = 0;
    finishTheme();
  } else {
    currentIndex = firstUnsolvedIndex(key);
    loadPuzzle();
  }
  window.scrollTo({ top: 0 });
  /* El botón que se apretó desaparece con la lista, y el foco se iba al <body>:
     quien usa teclado tenía que buscar el ejercicio desde arriba. En Modo
     Adaptado va directo al recuadro donde se contesta; si no, al título. */
  if(document.documentElement.classList.contains('adaptive-mode') && comandos && solvedCountFor(key) < idsOf(key).length) comandos.enfocar();
  else { const t = document.getElementById('play-title'); t.setAttribute('tabindex', '-1'); t.focus(); }
}

function updateProgressBar(){
  const total = idsOf(currentTheme).length;
  const done = solvedCountFor(currentTheme);
  document.getElementById('progress-fill').style.width = (total ? Math.round(100 * done / total) : 0) + '%';
  document.getElementById('progress-label').textContent = `${done}/${total} resueltos · ejercicio ${currentIndex + 1} de ${total}`;
}

/* ---------------- Tablero ---------------- */
const FILES = ['a','b','c','d','e','f','g','h'];
function isLightSquare(square){
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10) - 1;
  return (file + rank) % 2 === 1;
}

function drawBoard(){
  refrescarComandos();
  const board = document.getElementById('board');
  board.innerHTML = '';
  const ranks = orientation === 'w' ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];
  const files = orientation === 'w' ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
  ranks.forEach((rank) => {
    files.forEach((f) => {
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
      /* Qué dice cada casilla lo escribe js/tablero-accesible.js, no esta
         página: ahí las columnas van habladas ("eva 4", que no se confunde con
         "bella 4" al oírlas) y los nombres de las piezas salen de la misma
         tabla que el resto del sitio. Acá solo se declara el ESTADO, que es lo
         único que esta página sabe y aquel no. */
      if(square === selectedSquare){ btn.classList.add('selected'); btn.dataset.estado = 'seleccionada'; }
      if(lastMove && (square === lastMove.from || square === lastMove.to)){
        btn.classList.add('last');
        btn.dataset.estado = (btn.dataset.estado ? btn.dataset.estado + ', ' : '') + 'de la última jugada';
      }
      btn.addEventListener('click', () => onSquareClick(square, btn));
      board.appendChild(btn);
    });
  });
  montarTeclado();
}

/* El teclado del tablero: una sola parada de tabulador y dentro las flechas,
   más los atajos de una tecla en Modo Adaptado. Antes eran 64 botones seguidos
   en el recorrido del tabulador, así que llegar al botón de "Pista" costaba
   sesenta y cinco Tab — y no fallaba nada, simplemente nadie lo hacía. Se monta
   una sola vez: a partir de ahí se repone solo en cada repintado. */
let teclado = null;
function montarTeclado(){
  if(teclado || !window.TableroAccesible) return;
  teclado = TableroAccesible.montar(document.getElementById('board'), {
    nombre: 'Tablero del ejercicio',
    juego: () => game,
  });
}

/* ---------------- El cuadro de comandos (Modo Adaptado) ----------------
 * Este ejercicio solo se podía contestar tocando el tablero: con lector de
 * pantalla era incontestable, y no daba ningún error — la página se veía
 * perfecta y quien no podía verla simplemente no avanzaba. Acá la jugada
 * también se escribe, y la posición va contada en palabras justo encima del
 * cuadro donde se contesta. Ver js/cuadro-comandos.js.
 *
 * El tablero NO se esconde (Mates y sus hermanas sí lo hacen): quien ve poco
 * usa las dos cosas, y quien acompaña necesita ver lo que el alumno contesta. */
let comandos = null;

function refrescarComandos(){
  if(!window.CuadroComandos || !game) return;
  if(!comandos){
    comandos = CuadroComandos.montar(document.getElementById('q-comandos'), {
      etiqueta: 'Escribe tu jugada, o una pregunta sobre la posición',
      // Con estos dos, el mismo recuadro contesta preguntas antes de tratar el
      // texto como jugada: "caballos", "qué hay en e4", "jugadas de f3".
      juego: () => game,
      tablero: () => teclado,
      onEnviar: jugarEscribiendo,
    });
    comandos.ayuda('Jugada: "Cf3", "Nf3", "e4", "Dxh7+", "e8=D". Pregunta: "caballos", "qué hay en e4". Escribe "ayuda" para todo.');
  }
  comandos.posicion(game);
}

function jugarEscribiendo(texto, api){
  if(locked){ api.decir('Espera: el rival está respondiendo.'); return; }
  // El intérprete busca la jugada entre las LEGALES y no toca la partida, así
  // que no hace falta ninguna copia: quien decide si entra es playMove(), la
  // misma puerta por la que pasa el clic y la que corrige contra la solución.
  const mv = ComandosTablero.jugadaEscrita(game, texto);
  if(!mv){ api.decir(`"${texto}" no es una jugada legal en esta posición. Escribe "ayuda" si no sabes qué se puede escribir.`); return; }
  api.limpiar().decir('');
  playMove(mv.from, mv.to, mv.promotion);
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
  // El mismo aviso, repetido en el cuadro de comandos: quien contesta
  // escribiendo tiene el foco ahí y el renglón del tablero le queda lejos.
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
    finishTheme();
    return;
  }
  game = new Chess(puzzle.fen);
  orientation = game.turn();
  solutionStep = 0;
  selectedSquare = null;
  lastMove = null;
  missedThisPuzzle = false;
  usedHintThisPuzzle = false;
  hintStage = 0;
  locked = false;
  document.getElementById('hint-btn').disabled = false;
  document.getElementById('hint-btn').textContent = '💡 Pista';
  drawBoard();
  updateProgressBar();
  const turnColor = game.turn() === 'w' ? 'blancas' : 'negras';
  document.getElementById('turn-banner').innerHTML = `Juegan <b>${turnColor}</b> — ${puzzle.mate ? 'encuentra el mate' : 'encuentra la mejor jugada'}`;
  // Los ejercicios de táctica son de la casa y NO traen `rating`: sin esta
  // comprobación el tablero decía "Dificultad undefined" debajo de cada uno.
  const meta = [puzzle.rating ? `Dificultad ${puzzle.rating}` : '',
                puzzle.players ? `de la partida ${puzzle.players}` : ''].filter(Boolean).join(' · ');
  document.getElementById('puzzle-meta').textContent = meta;
  /* Quién juega y qué hay que buscar van en el aviso que se LEE (región viva),
     no solo en la franja de arriba: esa franja no se anuncia, así que quien usa
     lector de pantalla empezaba el ejercicio sin saber de qué color jugaba ni si
     había mate. Y la instrucción depende del modo: "haz clic" no le sirve a
     quien contesta escribiendo. */
  const objetivo = `Juegan ${turnColor}: ${puzzle.mate ? 'encuentra el mate' : 'encuentra la mejor jugada'}.`;
  setStatus(document.documentElement.classList.contains('adaptive-mode')
    ? `${objetivo} Escribe tu jugada en el recuadro, o "posición" para oír el tablero.`
    : `${objetivo} Haz clic en la pieza que quieres mover.`);
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
    askPromotion((choice) => playMove(from, square, choice));
  } else {
    playMove(from, square, candidates[0].promotion || undefined);
  }
}

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
    btn.setAttribute('aria-label', PIECE_NAME[type]);
    btn.innerHTML = window.PiezaPreferida ? PiezaPreferida.html(type, turn, { oculta: true }) : `<span class="${turn === 'w' ? 'piece-white' : 'piece-black'}" aria-hidden="true">${GLYPH[turn][type]}</span>`;
    btn.addEventListener('click', () => { modal.style.display = 'none'; callback(type); });
    opts.appendChild(btn);
  });
  modal.style.display = 'flex';
}

function playMove(from, to, promotion){
  const puzzle = currentPuzzle();
  const moveResult = game.move({ from, to, promotion: promotion || 'q' });
  if(!moveResult){ drawBoard(); return; }

  const expected = puzzle.solution[solutionStep];
  if(moveResult.san !== expected){
    // Cualquier jugada que dé mate también cuenta como correcta.
    if(!game.in_checkmate()){
      game.undo();
      drawBoard();
      missedThisPuzzle = true;
      resetStreak();
      flashWrong(document.querySelector('[data-square="' + to + '"]'));
      setStatus(`${moveResult.san} es legal, pero no es la jugada de la solución.`, 'bad');
      return;
    }
  }
  lastMove = { from, to };
  drawBoard();

  solutionStep++;
  if(solutionStep >= puzzle.solution.length || game.in_checkmate()){
    finishPuzzle();
    return;
  }

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
      hintStage = 0;
      document.getElementById('hint-btn').textContent = '💡 Pista';
      setStatus('Sigue buscando la continuación.');
    }
  }, 650);
}

function finishPuzzle(){
  locked = true;
  document.getElementById('hint-btn').disabled = true;
  const puzzle = currentPuzzle();
  const id = currentId();
  const alreadySolved = isSolved(id);
  if(!missedThisPuzzle && !usedHintThisPuzzle) bumpStreak(); else resetStreak();
  setStatus(game.in_checkmate() ? '✅ ¡Jaque mate!' : '✅ ¡Correcto! Con esto se obtiene una ventaja decisiva.', 'ok');
  if(!alreadySolved){
    markSolved(id);
    /* Informes tiene una columna de Táctica aparte de la de Ejercicios por tema.
       Al traerse los 148 ejercicios acá, si todo se apuntara como 'temas' esa
       columna se quedaría congelada en el número del día de la mudanza — y eso
       no da ningún error: el profesor ve un número que ya no sube y no sabe por
       qué. Así que cada ejercicio se apunta bajo la actividad que le
       corresponde, que es lo mismo que se apuntaba antes de mudarlos. */
    const actividad = TEMAS_DE_TACTICA.has(currentTheme) ? 'tactica' : 'temas';
    EntrenoProgress.log(actividad, { puzzle_id: id, theme: currentTheme, rating: puzzle.rating ?? null });
  }
  updateProgressBar();
  updateOverall();
  setTimeout(() => {
    if(currentIndex < idsOf(currentTheme).length - 1){
      currentIndex++;
      loadPuzzle();
    } else {
      finishTheme();
    }
  }, 1000);
}

function finishTheme(){
  document.getElementById('play-area').style.display = 'none';
  document.getElementById('celebration').style.display = 'block';
  const total = idsOf(currentTheme).length;
  const info = THEME_INFO[currentTheme] || { name: currentTheme };
  document.getElementById('celebration-stats').textContent =
    `Resolviste los ${total} ejercicios de ${info.name}.`;
  updateProgressBar();
}

let hintStage = 0;
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
    setStatus('Pista: fíjate en la pieza resaltada.');
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
  if(currentIndex < idsOf(currentTheme).length - 1){
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
document.getElementById('celebration-back-btn').addEventListener('click', showThemes);
document.getElementById('back-themes').addEventListener('click', (e) => { e.preventDefault(); showThemes(); });

/* ---------------- Arranque ---------------- */
let appInitialized = false;
function initApp(){
  if(appInitialized) return;
  appInitialized = true;
  setStreak(getStreak());
  let last = null;
  try{ last = localStorage.getItem('entreno_temas_last'); }catch(e){}
  // ?tema=<key> es el enlace que manda una tarea ("resuelve 10 de ataque
  // doble"): tiene que caer DENTRO del tema, no en la lista de ochenta, que
  // es justo lo que esa tarea viene a evitar. Manda sobre el hash y sobre lo
  // último que se estuvo haciendo — lo pidió el profe hoy.
  const pedido = new URLSearchParams(location.search).get('tema');
  const fromHash = (location.hash || '').replace('#', '');
  const wanted = (pedido && DATA.themes[pedido] ? pedido : null)
    || (fromHash && DATA.themes[fromHash] ? fromHash : null)
    || (last && DATA.themes[last] ? last : null);
  // openTheme() arranca en el primer ejercicio SIN resolver (firstUnsolvedIndex),
  // así que los diez que pide la tarea son diez nuevos: lo que ya hizo no se
  // le vuelve a poner delante.
  if(wanted) openTheme(wanted); else showThemes();
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
    gateChecking.textContent = 'Necesitas iniciar sesión en el sitio para entrar a Ejercicios por tema. Redirigiendo a iniciar sesión…';
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
