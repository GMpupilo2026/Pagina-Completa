/* El código de entreno/desafios.html.

   Vivía escrito dentro de la página, en un <script> de 33 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

const gate = document.getElementById('gate');
const app = document.getElementById('app');
const gateChecking = document.getElementById('gate-checking');
const NEXT_PATH = 'entreno/desafios.html';

async function unlock(){
  gate.classList.add('hidden');
  app.classList.remove('hidden');
  EntrenoProgress.init();
  // El progreso vive en la cuenta: se baja y se funde con el de este aparato
  // ANTES de pintar, para seguir donde se quedó aunque sea otro dispositivo.
  await ProgresoUsuario.init();
  loadDataThenStart();
}

/* ---------------- CONTENIDO ----------------
   Los 90 desafíos viven en data/desafios.json (posición, enunciado, pista,
   jugadas aceptadas y explicación). Son ejemplos pedagógicos: muchas
   posiciones no tienen reyes, así que el tablero usa un motor propio
   (MiniChess, abajo) en vez de chess.js, que exige reyes. Para corregir o
   agregar desafíos basta editar el JSON. */
const GLYPH = {
  w: { p:'♙', n:'♘', b:'♗', r:'♖', q:'♕', k:'♔' },
  b: { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', k:'♚' },
};
const CAT_COLOR = { promocion:'#75935a', material:'#3b6ea5', defensa:'#9c4148', mate:'#6b3fa0' };
const SET_SIZE = 5;

let DATA = null;
let SETS = [];
let CATEGORY_ORDER = [];
let CATEGORY_LABEL = {};

async function loadDataThenStart(){
  try {
    const res = await fetch('data/desafios.json');
    if(!res.ok) throw new Error('desafios.json: ' + res.status);
    DATA = await res.json();
  } catch (e) {
    document.getElementById('main-content').innerHTML =
      '<p class="text-center text-brand-450 dark:text-brand-350 py-10">No se pudo cargar la base de desafíos. Intenta recargar la página.</p>';
    console.error(e);
    return;
  }
  CATEGORY_ORDER = DATA.categories.map((c) => c.id);
  DATA.categories.forEach((c) => { CATEGORY_LABEL[c.id] = c.emoji + ' ' + c.title; });
  SETS = [];
  DATA.categories.forEach((c) => {
    const list = DATA.challenges.filter((ch) => ch.cat === c.id);
    for(let i = 0; i < list.length; i += SET_SIZE){
      const rounds = list.slice(i, i + SET_SIZE);
      const k = i / SET_SIZE + 1;
      SETS.push({
        id: c.id + '-' + k, cat: c.id, emoji: c.emoji,
        title: c.title + ' ' + k,
        desc: 'Desafíos ' + rounds.map((r) => '#' + r.n).join(', ') + '. ' + c.desc,
        rounds: rounds.map((r) => ({ n: r.n, fen: r.fen, text: r.text, hint: r.hint, moves: r.solution.moves, san: r.solution.san, explain: r.solution.explain, source: 'Desafío #' + r.n })),
      });
    }
  });
  initApp();
}

/* ---------------- MiniChess: movimientos legales sin exigir reyes ----------------
   Misma interfaz que usan el tablero, el arrastre y el modo adaptado:
   get(sq) -> {type,color} | null, turn(), moves({square, verbose}), move({from,to,promotion}),
   in_check(), fen(). Reglas: movimientos normales de todas las piezas, capturas,
   coronación, enroque (según los derechos del FEN) y captura al paso. Si hay rey,
   no se permite dejarlo en jaque. */
class MiniChess {
  constructor(fen){ this.load(fen); }
  load(fen){
    const parts = fen.split(' ');
    this.board = {};
    let rank = 8, file = 0;
    for(const ch of parts[0]){
      if(ch === '/'){ rank--; file = 0; }
      else if(/\d/.test(ch)){ file += parseInt(ch, 10); }
      else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        this.board['abcdefgh'[file] + rank] = { type: ch.toLowerCase(), color };
        file++;
      }
    }
    this.side = parts[1] || 'w';
    this.castling = parts[2] && parts[2] !== '-' ? parts[2] : '';
    this.ep = parts[3] && parts[3] !== '-' ? parts[3] : null;
    this.history = [];
  }
  fen(){
    let rows = [];
    for(let r = 8; r >= 1; r--){
      let s = '', e = 0;
      for(let f = 0; f < 8; f++){
        const p = this.board['abcdefgh'[f] + r];
        if(p){ if(e){ s += e; e = 0; } s += p.color === 'w' ? p.type.toUpperCase() : p.type; }
        else e++;
      }
      if(e) s += e;
      rows.push(s);
    }
    return rows.join('/') + ' ' + this.side + ' ' + (this.castling || '-') + ' ' + (this.ep || '-') + ' 0 1';
  }
  get(sq){ return this.board[sq] || null; }
  turn(){ return this.side; }
  static sq(f, r){ return (f < 0 || f > 7 || r < 1 || r > 8) ? null : 'abcdefgh'[f] + r; }
  static fr(sq){ return [sq.charCodeAt(0) - 97, parseInt(sq[1], 10)]; }
  attacked(sq, byColor){
    const [tf, tr] = MiniChess.fr(sq);
    for(const from in this.board){
      const p = this.board[from];
      if(p.color !== byColor) continue;
      const [f, r] = MiniChess.fr(from);
      const df = tf - f, dr = tr - r;
      if(p.type === 'p'){
        const dir = p.color === 'w' ? 1 : -1;
        if(dr === dir && Math.abs(df) === 1) return true;
      } else if(p.type === 'n'){
        if((Math.abs(df) === 1 && Math.abs(dr) === 2) || (Math.abs(df) === 2 && Math.abs(dr) === 1)) return true;
      } else if(p.type === 'k'){
        if(Math.abs(df) <= 1 && Math.abs(dr) <= 1 && (df || dr)) return true;
      } else {
        const straight = df === 0 || dr === 0, diag = Math.abs(df) === Math.abs(dr);
        if(!(df || dr)) continue;
        if((p.type === 'r' && !straight) || (p.type === 'b' && !diag) || (p.type === 'q' && !straight && !diag)) continue;
        if(!straight && !diag) continue;
        const sf = Math.sign(df), sr = Math.sign(dr);
        let cf = f + sf, cr = r + sr, clear = true;
        while(cf !== tf || cr !== tr){
          if(this.board[MiniChess.sq(cf, cr)]){ clear = false; break; }
          cf += sf; cr += sr;
        }
        if(clear) return true;
      }
    }
    return false;
  }
  kingSquare(color){
    for(const sq in this.board){ const p = this.board[sq]; if(p.type === 'k' && p.color === color) return sq; }
    return null;
  }
  in_check(){ const k = this.kingSquare(this.side); return !!k && this.attacked(k, this.side === 'w' ? 'b' : 'w'); }
  pseudoMoves(from){
    const p = this.board[from];
    if(!p || p.color !== this.side) return [];
    const [f, r] = MiniChess.fr(from);
    const out = [];
    const add = (to, flags, extra) => { if(to) out.push(Object.assign({ from, to, flags, piece: p.type, color: p.color }, extra || {})); };
    const enemy = p.color === 'w' ? 'b' : 'w';
    if(p.type === 'p'){
      const dir = p.color === 'w' ? 1 : -1, start = p.color === 'w' ? 2 : 7, last = p.color === 'w' ? 8 : 1;
      const one = MiniChess.sq(f, r + dir);
      if(one && !this.board[one]){
        add(one, r + dir === last ? 'np' : 'n');
        const two = MiniChess.sq(f, r + 2 * dir);
        if(r === start && two && !this.board[two]) add(two, 'b');
      }
      for(const df of [-1, 1]){
        const to = MiniChess.sq(f + df, r + dir);
        if(!to) continue;
        if(this.board[to] && this.board[to].color === enemy) add(to, r + dir === last ? 'cp' : 'c', { captured: this.board[to].type });
        else if(to === this.ep) add(to, 'e', { captured: 'p' });
      }
    } else if(p.type === 'n' || p.type === 'k'){
      const deltas = p.type === 'n' ? [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]] : [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      for(const [df, dr] of deltas){
        const to = MiniChess.sq(f + df, r + dr);
        if(!to) continue;
        if(!this.board[to]) add(to, 'n');
        else if(this.board[to].color === enemy) add(to, 'c', { captured: this.board[to].type });
      }
      if(p.type === 'k'){
        const home = p.color === 'w' ? 1 : 8;
        const rights = p.color === 'w' ? this.castling.replace(/[a-z]/g, '') : this.castling.replace(/[A-Z]/g, '');
        if(from === 'e' + home && !this.attacked(from, enemy)){
          if(rights.toLowerCase().includes('k') && !this.board['f' + home] && !this.board['g' + home] && this.board['h' + home] && this.board['h' + home].type === 'r' &&
             !this.attacked('f' + home, enemy) && !this.attacked('g' + home, enemy)) add('g' + home, 'k');
          if(rights.toLowerCase().includes('q') && !this.board['d' + home] && !this.board['c' + home] && !this.board['b' + home] && this.board['a' + home] && this.board['a' + home].type === 'r' &&
             !this.attacked('d' + home, enemy) && !this.attacked('c' + home, enemy)) add('c' + home, 'q');
        }
      }
    } else {
      const dirs = p.type === 'r' ? [[1,0],[-1,0],[0,1],[0,-1]] : p.type === 'b' ? [[1,1],[1,-1],[-1,1],[-1,-1]] : [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      for(const [df, dr] of dirs){
        let cf = f + df, cr = r + dr;
        while(true){
          const to = MiniChess.sq(cf, cr);
          if(!to) break;
          if(!this.board[to]) add(to, 'n');
          else { if(this.board[to].color === enemy) add(to, 'c', { captured: this.board[to].type }); break; }
          cf += df; cr += dr;
        }
      }
    }
    return out;
  }
  apply(m){
    const p = this.board[m.from];
    delete this.board[m.from];
    if(m.flags === 'e'){ const [tf, tr] = MiniChess.fr(m.to); delete this.board[MiniChess.sq(tf, tr - (p.color === 'w' ? 1 : -1))]; }
    this.board[m.to] = m.promotion ? { type: m.promotion, color: p.color } : p;
    if(m.flags === 'k' || m.flags === 'q'){
      const home = m.to[1];
      if(m.flags === 'k'){ this.board['f' + home] = this.board['h' + home]; delete this.board['h' + home]; }
      else { this.board['d' + home] = this.board['a' + home]; delete this.board['a' + home]; }
    }
    if(p.type === 'k') this.castling = p.color === 'w' ? this.castling.replace(/[KQ]/g, '') : this.castling.replace(/[kq]/g, '');
    if(p.type === 'r'){ const map = { h1:'K', a1:'Q', h8:'k', a8:'q' }; if(map[m.from]) this.castling = this.castling.replace(map[m.from], ''); }
    this.ep = (m.flags === 'b') ? MiniChess.sq(MiniChess.fr(m.to)[0], (MiniChess.fr(m.from)[1] + MiniChess.fr(m.to)[1]) / 2) : null;
    this.side = this.side === 'w' ? 'b' : 'w';
  }
  legalMoves(from){
    const out = [];
    for(const m of this.pseudoMoves(from)){
      const promos = m.flags.includes('p') ? ['q','r','b','n'] : [null];
      for(const promotion of promos){
        const mm = Object.assign({}, m, promotion ? { promotion } : {});
        const snap = { board: Object.assign({}, this.board), side: this.side, castling: this.castling, ep: this.ep };
        this.apply(mm);
        const k = this.kingSquare(snap.side);
        const ok = !k || !this.attacked(k, this.side);
        this.board = snap.board; this.side = snap.side; this.castling = snap.castling; this.ep = snap.ep;
        if(ok) out.push(mm);
      }
    }
    return out;
  }
  moves(opts){
    const sqs = opts && opts.square ? [opts.square] : Object.keys(this.board);
    let out = [];
    sqs.forEach((sq) => { out = out.concat(this.legalMoves(sq)); });
    out.forEach((m) => { m.san = this.san(m); });
    return out;
  }
  san(m){
    if(m.flags === 'k') return 'O-O';
    if(m.flags === 'q') return 'O-O-O';
    const cap = m.flags.includes('c') || m.flags === 'e';
    let s = '';
    if(m.piece === 'p'){ s = cap ? m.from[0] + 'x' + m.to : m.to; if(m.promotion) s += '=' + m.promotion.toUpperCase(); }
    else {
      s = m.piece.toUpperCase();
      // desambiguación sencilla
      const others = Object.keys(this.board).filter((sq) => sq !== m.from && this.board[sq].type === m.piece && this.board[sq].color === m.color)
        .filter((sq) => this.legalMoves(sq).some((x) => x.to === m.to));
      if(others.length){
        if(!others.some((sq) => sq[0] === m.from[0])) s += m.from[0];
        else if(!others.some((sq) => sq[1] === m.from[1])) s += m.from[1];
        else s += m.from;
      }
      s += (cap ? 'x' : '') + m.to;
    }
    return s;
  }
  move(arg){
    const cands = this.legalMoves(arg.from).filter((m) => m.to === arg.to && (!m.promotion || m.promotion === (arg.promotion || 'q')));
    if(!cands.length) return null;
    const m = cands[0];
    m.san = this.san(m);
    this.apply(m);
    const opp = this.kingSquare(this.side);
    if(opp && this.attacked(opp, this.side === 'w' ? 'b' : 'w')){
      const any = Object.keys(this.board).some((sq) => this.board[sq].color === this.side && this.legalMoves(sq).length);
      m.san += any ? '+' : '#';
    }
    this.history.push(m);
    return m;
  }
  uci(m){ return m.from + m.to + (m.promotion || ''); }
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
// Disponible en modo normal y en modo adaptado por igual.
const refreshSpeechToggle = window.BlindNotation
  ? window.BlindNotation.setupSpeechToggle('speech-toggle-btn', () => true)
  : null;

function applyBlindModeUI(){
  document.getElementById('mode-normal-btn').classList.toggle('active', !blindMode);
  document.getElementById('mode-normal-btn').setAttribute('aria-pressed', String(!blindMode));
  document.getElementById('mode-blind-btn').classList.toggle('active', blindMode);
  document.getElementById('mode-blind-btn').setAttribute('aria-pressed', String(blindMode));
  // El recuadro lo destapa el CSS con la clase `adaptive-mode`, no esta función:
  // así encender el modo surte efecto al instante, sin repintar el ejercicio.
  if(refreshSpeechToggle) refreshSpeechToggle();
  renderPositionReadout();
}
function setBlindMode(value){
  blindMode = value;
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
 * Antes solo entendía "e2e4" —origen y destino pegados— y eso es justo como NO
 * se escribe una jugada: quien juega al ajedrez escribe "Cf3" o "Dxh7+". Ahora
 * lo lee js/chess-move-parser.js, el mismo intérprete de los visores de los
 * cursos y de Juegos, así que entiende las dos formas, en español y en inglés.
 * Y antes de tratarlo como jugada, el recuadro mira si era una PREGUNTA
 * ("caballos", "qué hay en e4"): eso lo resuelve js/cuadro-comandos.js con
 * js/comandos-tablero.js, sin que esta página tenga que saber nada. */
let comandos = null;
function montarComandos(){
  if(comandos || !window.CuadroComandos) return;
  comandos = CuadroComandos.montar(document.getElementById('q-comandos'), {
    etiqueta: 'Escribe tu jugada, o una pregunta sobre la posición',
    juego: () => game,
    tablero: () => teclado,
    onEnviar: jugarEscribiendo,
  });
  comandos.ayuda('Jugada: "Cf3", "Nf3", "Dxh7+", "e2 e4". Pregunta: "caballos", "qué hay en e4". Escribe "ayuda" para todo.');
}

function jugarEscribiendo(texto, api){
  if(roundLocked){ api.decir('Espera un momento.'); return; }
  // El intérprete busca la jugada entre las LEGALES y no toca la partida, así que
  // no hace falta ninguna copia.
  const mv = ComandosTablero.jugadaEscrita(game, texto);
  if(!mv){ api.decir(`"${texto}" no es una jugada legal en esta posición. Escribe "ayuda" si no sabes qué se puede escribir.`); return; }
  const moveResult = game.move({ from: mv.from, to: mv.to, promotion: mv.promotion || 'q' });
  api.limpiar().decir('');
  drawBoard();
  if(moveResult) handleMoveResult(moveResult);
}

/* Una sola parada de tabulador para todo el tablero y las flechas por dentro,
   más los atajos de una tecla en Modo Adaptado. Antes eran 64 botones seguidos
   en el recorrido del tabulador. Se monta una vez y se repone solo. */
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
  try{ return JSON.parse(localStorage.getItem('entreno_desafios_v2') || '{}'); }catch(e){ return {}; }
}
function saveProgress(p){ localStorage.setItem('entreno_desafios_v2', JSON.stringify(p)); }
function getSetStars(id){ return getProgress()[id] || 0; }
function setSetStars(id, stars){
  const p = getProgress();
  p[id] = Math.max(p[id] || 0, stars);
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

/* ---------------- Estado ---------------- */
let currentCategory = 'promocion';
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
    btn.style.setProperty('--tab-color', CAT_COLOR[cat] || 'var(--brass)');
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
const PIECE_NAME = { p:'peón', n:'caballo', b:'alfil', r:'torre', q:'dama', k:'rey' };
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
      let label = square;
      if(piece){
        const span = document.createElement('span');
        if (window.PiezaPreferida) PiezaPreferida.pintar(span, piece.type, piece.color);
        else {
          span.className = piece.color === 'w' ? 'piece-white' : 'piece-black';
          span.textContent = GLYPH[piece.color][piece.type];
        }
        span.setAttribute('aria-hidden', 'true');
        btn.appendChild(span);
        label += ', ' + PIECE_NAME[piece.type] + (piece.color === 'w' ? ' blanc' : ' negr') + (piece.type === 'q' || piece.type === 'r' ? 'a' : 'o');
      }
      btn.setAttribute('aria-label', label);
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
  if(!btn) return;
  btn.classList.add('wrong-flash');
  setTimeout(() => btn.classList.remove('wrong-flash'), 350);
}
function setStatus(text, cls){
  const el = document.getElementById('round-status');
  el.textContent = text;
  el.className = 'round-status' + (cls ? ' ' + cls : '');
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

function currentRound(){ return currentSet.rounds[currentRoundIndex]; }

function loadRound(){
  const round = currentRound();
  game = new MiniChess(round.fen);
  selectedSquare = null;
  roundLocked = false;
  hintsUsedThisRound = 0;
  roundStartTime = Date.now();
  document.getElementById('hint-btn').disabled = false;
  document.getElementById('hint-btn').textContent = '💡 Pista';
  document.getElementById('round-text').textContent = round.text;
  document.getElementById('round-source').textContent = round.source;
  drawBoard();
  buildRoundDots();
  setStatus(blindMode ? 'Escribe la jugada que quieres hacer (por ejemplo e2e4).' : 'Haz clic en la pieza que quieres mover.');
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
    } else { selectedSquare = null; drawBoard(); flashWrong(btn); }
    return;
  }
  const from = selectedSquare;
  selectedSquare = null;
  if(target.flags.includes('p')){
    askPromotion((choice) => { const r = game.move({ from, to: square, promotion: choice }); drawBoard(); if(r) handleMoveResult(r); });
    return;
  }
  const moveResult = game.move({ from, to: square });
  drawBoard();
  if(!moveResult) return;
  handleMoveResult(moveResult);
}

function askPromotion(callback){
  const modal = document.getElementById('promo-modal');
  const opts = document.getElementById('promo-opts');
  opts.innerHTML = '';
  const turn = game.turn();
  ['q','r','b','n'].forEach((type) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'promo-btn';
    b.setAttribute('aria-label', PIECE_NAME[type]);
    b.innerHTML = window.PiezaPreferida ? PiezaPreferida.html(type, turn, { oculta: true }) : `<span class="${turn === 'w' ? 'piece-white' : 'piece-black'}" aria-hidden="true">${GLYPH[turn][type]}</span>`;
    b.addEventListener('click', () => { modal.style.display = 'none'; callback(type); });
    opts.appendChild(b);
  });
  modal.style.display = 'flex';
}

// Arrastrar y soltar piezas (además del clic-clic de siempre): ver js/board-drag.js.
if(typeof enableBoardDrag !== 'undefined'){
  enableBoardDrag(document.getElementById('board'), {
    isDraggable: (square) => {
      if(roundLocked || !game) return false;
      const piece = game.get(square);
      return !!(piece && piece.color === game.turn());
    },
    isSelected: (square) => selectedSquare === square,
    onSquareClick: (square) => onSquareClick(square),
  });
}

function handleMoveResult(moveResult){
  const round = currentRound();
  const uci = game.uci(moveResult);
  const correct = round.moves.includes(uci);
  if(correct){
    finishRound(moveResult);
  } else {
    resetStreak();
    setStatus(`${moveResult.san} es legal, pero no es la jugada que buscamos.`, 'bad');
    setTimeout(() => { game = new MiniChess(round.fen); drawBoard(); setStatus('Inténtalo de nuevo.'); }, 900);
  }
}

function finishRound(moveResult){
  roundLocked = true;
  document.getElementById('hint-btn').disabled = true;
  const round = currentRound();
  const seconds = ((Date.now() - roundStartTime) / 1000).toFixed(1);
  const stars = hintsUsedThisRound >= 2 ? 1 : (hintsUsedThisRound === 1 ? 2 : 3);
  setStarsEarned.push(stars);
  if(hintsUsedThisRound < 3) bumpStreak();
  const fast = seconds < 4 && hintsUsedThisRound === 0;
  const san = moveResult ? moveResult.san : round.san[0];
  setStatus(`✅ ¡Correcto! ${san}${round.explain ? ' — ' + round.explain : ''}${fast ? ' ⚡' : ''}`, 'ok');
  if(window.BlindNotation && window.BlindNotation.speak){
    try{ window.BlindNotation.speak('Correcto. ' + (round.explain || '')); }catch(e){}
  }
  setTimeout(() => {
    if(currentRoundIndex < currentSet.rounds.length - 1){
      currentRoundIndex++;
      loadRound();
    } else {
      finishSet();
    }
  }, round.explain ? 3200 : 1200);
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
    `${currentSet.rounds.length} de ${currentSet.rounds.length} desafíos en ${totalSeconds}s` +
    (noHints ? ' — ¡sin usar ninguna pista!' : '');
  document.getElementById('celebration-title').textContent =
    stars === 3 ? '¡Desafíos perfectos! 🏆' : (stars === 2 ? '¡Desafíos completados! 🎉' : 'Completados — ¡a repetirlos para subir de estrellas!');
  EntrenoProgress.log('practicar', { set_id: 'desafio_' + currentSet.id, category: currentSet.cat, title: 'Desafíos: ' + currentSet.title, stars, seconds: Number(totalSeconds) });
}

function giveHint(){
  if(roundLocked) return;
  hintsUsedThisRound++;
  const round = currentRound();
  const board = document.getElementById('board');
  const first = round.moves[0];
  const from = first.slice(0, 2), to = first.slice(2, 4);
  if(hintsUsedThisRound === 1){
    if(round.hint){
      setStatus('Pista: ' + round.hint);
    } else {
      board.querySelectorAll('.hint-from').forEach(el => el.classList.remove('hint-from'));
      const cell = board.querySelector('[data-square="' + from + '"]');
      if(cell) cell.classList.add('hint-from');
      setStatus(blindMode ? `Pista: mueve la pieza de ${window.BlindNotation.squareSpoken(from)}.` : 'Pista: fíjate en la pieza resaltada.');
    }
    document.getElementById('hint-btn').textContent = '💡 Otra pista';
  } else if(hintsUsedThisRound === 2){
    board.querySelectorAll('.hint-from').forEach(el => el.classList.remove('hint-from'));
    const cell = board.querySelector('[data-square="' + from + '"]');
    if(cell) cell.classList.add('hint-from');
    setStatus(blindMode ? `Pista: mueve la pieza de ${window.BlindNotation.squareSpoken(from)}.` : 'Pista: fíjate en la pieza resaltada.');
    document.getElementById('hint-btn').textContent = '💡 Ver solución';
  } else {
    resetStreak();
    const moveResult = game.move({ from, to, promotion: first[4] || 'q' });
    drawBoard();
    finishRound(moveResult);
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
    gateChecking.textContent = 'Necesitas iniciar sesión en el sitio para entrar a Desafíos. Redirigiendo a iniciar sesión…';
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
