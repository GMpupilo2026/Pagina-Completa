/* El código de entreno/aprender.html.

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

const NEXT_PATH = 'entreno/aprender.html';

async function unlock(){
  gate.classList.add('hidden');
  app.classList.remove('hidden');
  EntrenoProgress.init();
  // El progreso vive en la cuenta: se baja y se funde con el de este aparato
  // ANTES de pintar, para seguir donde se quedó aunque sea otro dispositivo.
  await ProgresoUsuario.init();
  if(window.AccesoAdmin) await window.AccesoAdmin.init();
  initApp();
}

/* ---------------- CONTENIDO DE LAS LECCIONES ----------------
   Cada FEN y cada solución de esta lista se generó y se verificó con chess.js
   (node) antes de escribirla aquí — no son posiciones "a ojo": se comprobó
   con el motor que las casillas objetivo (o la jugada solución) son
   exactamente las que chess.js calcula como legales para esa posición.
*/
const GLYPH = {
  w: { p:'♙', n:'♘', b:'♗', r:'♖', q:'♕', k:'♔' },
  b: { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', k:'♚' },
};

const LESSONS = [
  // ---------- Movimientos: cómo mueve cada pieza ----------
  { id:'mov_rey_1', cat:'movimientos', title:'El Rey', type:'squares',
    text:'El rey se mueve una sola casilla en cualquier dirección: al frente, atrás, a los lados o en diagonal. Haz clic en todas las casillas a las que puede llegar.',
    fen:'7k/8/8/3K4/8/8/8/8 w - - 0 1', square:'d5',
    targets:["c6","d6","e6","e5","e4","d4","c4","c5"] },
  { id:'mov_rey_2', cat:'movimientos', title:'El Rey — cerca de otra pieza', type:'squares',
    text:'El rey nunca puede moverse a una casilla ocupada por una pieza propia. Marca todas las casillas a las que puede llegar.',
    fen:'6k1/8/8/3K4/2p5/8/8/8 w - - 0 1', square:'d5',
    targets:["c6","d6","e6","e5","e4","d4","c4","c5"] },
  { id:'mov_torre_1', cat:'movimientos', title:'La Torre', type:'squares',
    text:'La torre se mueve en línea recta: por toda su fila o toda su columna, tan lejos como quiera. Haz clic en todas las casillas a las que puede llegar.',
    fen:'7k/8/8/3R4/8/8/8/K7 w - - 0 1', square:'d5',
    targets:["d6","d7","d8","e5","f5","g5","h5","d4","d3","d2","d1","c5","b5","a5"] },
  { id:'mov_torre_2', cat:'movimientos', title:'La Torre — con piezas para capturar', type:'squares',
    text:'La torre no puede saltar piezas. Si hay una pieza rival en su camino, puede capturarla — pero ahí se detiene. Marca todas las casillas a las que puede llegar (incluye la captura).',
    fen:'7k/3p4/8/3R1p2/8/8/8/K7 w - - 0 1', square:'d5',
    targets:["d6","d7","e5","f5","d4","d3","d2","d1","c5","b5","a5"] },
  { id:'mov_alfil_1', cat:'movimientos', title:'El Alfil', type:'squares',
    text:'El alfil se mueve en diagonal, tan lejos como quiera, y siempre se queda en casillas del mismo color. Haz clic en todas las casillas a las que puede llegar.',
    fen:'7k/8/8/3B4/8/8/8/K7 w - - 0 1', square:'d5',
    targets:["c6","b7","a8","e6","f7","g8","e4","f3","g2","h1","c4","b3","a2"] },
  { id:'mov_alfil_2', cat:'movimientos', title:'El Alfil — con piezas para capturar', type:'squares',
    text:'Igual que la torre, el alfil se detiene al capturar una pieza rival en su camino. Marca todas las casillas a las que puede llegar.',
    fen:'7k/1p6/8/3B4/5p2/8/8/K7 w - - 0 1', square:'d5',
    targets:["c6","b7","e6","f7","g8","e4","f3","g2","h1","c4","b3","a2"] },
  { id:'mov_dama_1', cat:'movimientos', title:'La Dama', type:'squares',
    text:'La dama es la pieza más poderosa: combina el movimiento de la torre y el alfil. Se mueve en línea recta o en diagonal, tan lejos como quiera. Haz clic en todas las casillas a las que puede llegar.',
    fen:'7k/8/8/3Q4/8/8/8/K7 w - - 0 1', square:'d5',
    targets:["c6","b7","a8","d6","d7","d8","e6","f7","g8","e5","f5","g5","h5","e4","f3","g2","h1","d4","d3","d2","d1","c4","b3","a2","c5","b5","a5"] },
  { id:'mov_dama_2', cat:'movimientos', title:'La Dama — con piezas para capturar', type:'squares',
    text:'Marca todas las casillas a las que la dama puede llegar en esta posición, incluidas las capturas.',
    fen:'7k/3p4/8/1p1Q1p2/8/8/8/K7 w - - 0 1', square:'d5',
    targets:["c6","b7","a8","d6","d7","e6","f7","g8","e5","f5","e4","f3","g2","h1","d4","d3","d2","d1","c4","b3","a2","c5","b5"] },
  { id:'mov_caballo_1', cat:'movimientos', title:'El Caballo', type:'squares',
    text:'El caballo se mueve "en L": dos casillas en una dirección y una hacia el lado. Es la única pieza que puede saltar por encima de otras. Haz clic en todas las casillas a las que puede llegar.',
    fen:'7k/8/8/3N4/8/8/8/K7 w - - 0 1', square:'d5',
    targets:["b6","c7","e7","f6","f4","e3","c3","b4"] },
  { id:'mov_caballo_2', cat:'movimientos', title:'El Caballo — salta por encima', type:'squares',
    text:'Aunque esté rodeado de piezas, el caballo salta por encima de ellas sin problema. Marca todas las casillas a las que puede llegar.',
    fen:'7k/8/2p1p3/3N4/2p1p3/8/8/K7 w - - 0 1', square:'d5',
    targets:["b6","c7","e7","f6","f4","e3","c3","b4"] },
  { id:'mov_peon_1', cat:'movimientos', title:'El Peón', type:'squares',
    text:'El peón avanza una casilla (o dos, si es su primera jugada) en línea recta, y solo puede capturar en diagonal. Haz clic en todas las casillas a las que puede llegar.',
    fen:'7k/8/8/8/8/8/4P3/K7 w - - 0 1', square:'e2',
    targets:["e3","e4"] },
  { id:'mov_peon_2', cat:'movimientos', title:'El Peón — capturas', type:'squares',
    text:'El peón nunca captura hacia adelante, solo en diagonal. Marca todas las casillas a las que puede llegar desde aquí (avance y capturas).',
    fen:'7k/8/8/8/3p1p2/4P3/8/K7 w - - 0 1', square:'e3',
    targets:["e4","d4","f4"] },

  // ---------- Reglas especiales ----------
  { id:'reg_jaque', cat:'reglas', title:'Jaque — sal del jaque', type:'move',
    text:'Tu rey está en jaque: lo ataca la torre negra. Cuando estás en jaque, es obligatorio resolverlo en tu jugada. Encuentra una jugada legal que saque a tu rey del jaque.',
    fen:'4k3/8/8/8/8/8/4r3/4K3 w - - 0 1', anyLegalMove:true },
  { id:'reg_enroque', cat:'reglas', title:'Enroque corto', type:'move',
    text:'Si el rey y la torre de ese lado no se han movido todavía, y no hay piezas entre ellos, puedes enrocar: el rey se mueve dos casillas hacia la torre, y la torre salta al otro lado del rey. Haz clic en el rey y luego dos casillas a la derecha.',
    fen:'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', solution:{from:'e1',to:'g1'} },
  { id:'reg_paso', cat:'reglas', title:'Captura al paso', type:'move',
    text:'Si un peón rival avanza dos casillas de golpe y queda justo al lado de uno de tus peones, puedes capturarlo "al paso" — como si solo hubiera avanzado una. Pero ojo: solo puedes hacerlo en la jugada inmediatamente siguiente. Captura el peón blanco al paso.',
    fen:'4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1', solution:{from:'d4',to:'e3'} },
  { id:'reg_coronacion', cat:'reglas', title:'Coronación', type:'move',
    text:'Cuando un peón llega hasta el final del tablero, se convierte en otra pieza — lo normal es elegir dama, la más fuerte. Lleva el peón hasta la última fila para coronarlo.',
    fen:'8/4P3/8/8/8/8/8/4K2k w - - 0 1', solution:{from:'e7',to:'e8'} },
  { id:'reg_quiz', cat:'reglas', title:'¿Jaque mate o ahogado?', type:'quiz',
    text:'Si el rey en turno está en jaque y no tiene ninguna jugada legal, es JAQUE MATE: la partida termina. Si NO está en jaque pero tampoco tiene ninguna jugada legal, es AHOGADO: la partida es tablas. Mira cada posición y decide cuál es.',
    rounds:[
      { fen:'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', answer:'mate' },
      { fen:'7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', answer:'ahogado' },
    ] },

  // ---------- Tácticas básicas ----------
  { id:'tac_horquilla', cat:'tacticas', title:'Horquilla', type:'move',
    text:'Una horquilla ataca dos piezas rivales a la vez con una sola pieza, obligando al rival a perder una de ellas. Encuentra el salto de caballo que ataca al rey Y a la dama negra al mismo tiempo.',
    fen:'6k1/8/2q5/3N4/8/8/8/K7 w - - 0 1', solution:{from:'d5',to:'e7'} },
  { id:'tac_clavada', cat:'tacticas', title:'Clavada', type:'move',
    text:'Una pieza está "clavada" cuando no puede moverse sin dejar expuesta a una pieza más valiosa detrás de ella — aquí, su propio rey. El caballo negro está clavado por tu torre y no se puede mover: captúralo gratis.',
    fen:'4k3/8/4n3/8/2B1R3/8/8/4K3 w - - 0 1', solution:{from:'c4',to:'e6'} },
  { id:'tac_descubierta', cat:'tacticas', title:'Ataque descubierto', type:'move',
    text:'Un ataque descubierto pasa cuando mueves una pieza y, al apartarse, deja a otra pieza tuya atacando algo que antes tapaba. Mueve el caballo y descubre el jaque de tu alfil.',
    fen:'4k3/8/8/8/B7/2N5/8/6K1 w - - 0 1', solution:{from:'c3',to:'d5'} },
  { id:'tac_doble', cat:'tacticas', title:'Ataque doble', type:'move',
    text:'Un ataque doble amenaza dos piezas rivales a la vez con una sola pieza de largo alcance (a diferencia de la horquilla, que siempre es de un caballo). Mueve la dama a la casilla que ataca la torre Y el caballo negros al mismo tiempo.',
    fen:'r6n/8/4k3/8/3Q4/8/8/7K w - - 0 1', solution:{from:'d4',to:'d8'} },
];

const CATEGORY_ORDER = ['movimientos','reglas','tacticas','asignaciones'];
const CATEGORY_LABEL = {movimientos:'Movimientos', reglas:'Reglas especiales', tacticas:'Tácticas básicas', asignaciones:'Asignaciones'};
const CATEGORY_VAR = {movimientos:'--movimientos', reglas:'--reglas', tacticas:'--tacticas', asignaciones:'--asignaciones'};

/* ---------------- Asignaciones ----------------
   La ficha "Asignaciones" no son lecciones: son trabajos que el alumno hace de
   una sentada en su propia página y que el profesor ve en Informes. Hoy hay uno
   —el diagnóstico de nivel— y de ahí sale su plan de entrenamiento. */
const ASIGNACIONES = [
  {
    id: 'diagnostico',
    titulo: 'Diagnóstico completo de nivel',
    desc: '60 preguntas y posiciones · 9 áreas · 5 escalones de dificultad · al terminar, tu fuerza en puntos Elo, tu nivel y qué estudiar',
    href: 'diagnostico.html',
    estado() {
      try {
        const r = JSON.parse(localStorage.getItem('diagnostico_resultado_v1') || 'null');
        if (r) return { hecho: true, nota: `Hecho · ${r.nivel} · ${r.porcentaje}% de la prueba` };
        const enCurso = JSON.parse(localStorage.getItem('diagnostico_estado_v1') || 'null');
        if (enCurso && enCurso.estado && enCurso.estado.idx > 0) {
          return { hecho: false, nota: `A medias · vas por la pregunta ${enCurso.estado.idx + 1}` };
        }
      } catch (e) {}
      return { hecho: false, nota: 'Sin hacer · toma unos 20 minutos' };
    },
  },
];
function asignacionesHechas(){ return ASIGNACIONES.filter((a) => a.estado().hecho).length; }

/* ---------------- Modo normal / modo adaptado (lector de pantalla) ----------------
   Mismo interruptor y misma clave de localStorage que Tablero, 4x4 y
   Coordenadas (oscarBlindMode_v1). En modo adaptado el tablero se oculta (no
   aporta nada a quien no lo puede ver) y se reemplaza por una descripción de
   la posición en texto — actualizada en vivo — más un campo para escribir la
   casilla o la jugada en vez de hacer clic. */
const BLIND_MODE_KEY = 'oscarBlindMode_v1';
let blindMode = false;
try{ blindMode = localStorage.getItem(BLIND_MODE_KEY) === '1'; }catch(e){}
if(new URLSearchParams(window.location.search).get('modo') === 'ciego'){
  blindMode = true;
  try{ localStorage.setItem(BLIND_MODE_KEY, '1'); }catch(e){}
}

// La descripción de la posición para lectores de pantalla usa la misma
// notación de columnas adaptada que tablero.html (BlindNotation, en
// js/blind-notation.js): cada casilla se dice como "eva 4" en vez de "e4",
// agrupada por color y tipo de pieza — ver js/blind-notation.js para el
// porqué y el formato exacto.
function renderPositionReadout(){
  const readout = document.getElementById('position-readout');
  if(!blindMode || !game){ readout.style.display = 'none'; return; }
  readout.innerHTML = window.BlindNotation.groupedReadoutHTML(game);
  readout.style.display = 'block';
}

/* Aprender pide dos cosas distintas según la lección —marcar casillas o hacer
   una jugada—, así que lo que cambia es la ETIQUETA del recuadro, no qué
   recuadro se enseña: eran dos campos que se escondían el uno al otro, y el
   lector de pantalla anunciaba el que estaba tapado. Uno solo, con su rótulo
   diciendo qué toca ahora, no se puede confundir.
   Y no se le roba el foco: quien acaba de elegir una lección espera seguir
   donde estaba, y el aviso ya le está leyendo el enunciado. */
function updateBlindInputVisibility(){
  montarComandos();
  if(!comandos || !currentLesson) return;
  if(currentLesson.type === 'squares'){
    comandos.etiqueta('Escribe una casilla, o una pregunta sobre la posición');
    comandos.ayuda('Casilla: "e4", "eva 4". Pregunta: "caballos", "qué hay en e4". Escribe "ayuda" para todo.');
  } else {
    comandos.etiqueta('Escribe tu jugada, o una pregunta sobre la posición');
    comandos.ayuda('Jugada: "Cf3", "Nf3", "Dxh7+", "e1 g1". Pregunta: "caballos", "qué hay en e4". Escribe "ayuda" para todo.');
  }
}

// Botón "🗣️ Voz": el navegador lee en voz alta cada anuncio (además de lo que ya
// lee un lector de pantalla real), para quien no tiene uno activado. Ver
// js/blind-notation.js para el porqué es un complemento aparte, apagado por defecto.
const refreshSpeechToggle = window.BlindNotation
  ? window.BlindNotation.setupSpeechToggle('speech-toggle-btn', () => true)
  : null;

/* EL TABLERO YA NO SE ESCONDE EN MODO ADAPTADO. Antes desaparecía y quedaba
   solo el recuadro, así que la única forma de saber qué había era oír la
   posición entera y acordarse. Un tablero se MIRA —se va a una casilla, se
   pregunta qué hay al lado— y eso es lo que el tablero escondido no deja hacer.
   Ahora se queda y se recorre con las flechas (js/tablero-accesible.js). En las
   lecciones de "marcar casillas" eso además es media lección: lo que se aprende
   ahí es DÓNDE está cada casilla. */
function applyBlindModeUI(){
  if(modeNormalBtn){
    modeNormalBtn.setAttribute('aria-pressed', blindMode ? 'false' : 'true');
    modeNormalBtn.classList.toggle('active', !blindMode);
  }
  if(modeBlindBtn){
    modeBlindBtn.setAttribute('aria-pressed', blindMode ? 'true' : 'false');
    modeBlindBtn.classList.toggle('active', blindMode);
  }
  if(refreshSpeechToggle) refreshSpeechToggle();
  renderPositionReadout();
  if(currentLesson) updateBlindInputVisibility();
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
if(modeNormalBtn) modeNormalBtn.addEventListener('click', () => setBlindMode(false));
if(modeBlindBtn) modeBlindBtn.addEventListener('click', () => setBlindMode(true));

// Casillas: se acepta cualquier casilla de a1 a h8 escrita en el campo.
function blindHandleSquareGuess(square){
  if(lessonLocked) return;
  if(foundSet.has(square)){
    setStatus('Ya habías encontrado esa casilla.');
    return;
  }
  if((currentLesson.targets || []).includes(square)){
    foundSet.add(square);
    const remaining = currentLesson.targets.length - foundSet.size;
    setStatus(remaining > 0
      ? `✅ Correcto. Te faltan ${remaining} casilla${remaining === 1 ? '' : 's'}.`
      : '', 'ok');
    if(remaining <= 0) finishLesson();
  } else {
    setStatus('❌ Esa casilla no es correcta. Sigue intentando.', 'bad');
  }
}

// Jugadas: se escribe origen y destino separados por espacio (o pegados,
// ej. "e1g1"); acepta ambas formas.
function blindHandleMoveGuess(raw){
  if(lessonLocked) return;
  const clean = raw.trim().toLowerCase().replace(/[^a-h1-8]/g, '');
  if(clean.length !== 4){
    setStatus('Escribe la casilla de origen y la de destino, por ejemplo "e1 g1".', 'bad');
    return;
  }
  const from = clean.slice(0, 2), to = clean.slice(2, 4);
  const piece = game.get(from);
  if(!piece || piece.color !== game.turn()){
    setStatus(`No hay una pieza tuya en ${window.BlindNotation.squareSpoken(from)}.`, 'bad');
    return;
  }
  const legal = game.moves({ square: from, verbose: true });
  const target = legal.find((m) => m.to === to);
  if(!target){
    setStatus(`${window.BlindNotation.squareSpoken(from)} a ${window.BlindNotation.squareSpoken(to)} no es una jugada legal.`, 'bad');
    return;
  }
  const moveResult = game.move({ from, to, promotion: 'q' });
  if(!moveResult) return;
  renderPositionReadout();
  const correct = currentLesson.anyLegalMove ||
    (currentLesson.solution && moveResult.from === currentLesson.solution.from && moveResult.to === currentLesson.solution.to);
  const sanText = window.BlindNotation.sanSpoken(moveResult.san);
  if(correct){
    setStatus(`✅ ${sanText}. ¡Correcto!`, 'ok');
    finishLesson();
  } else {
    setStatus(`${sanText} es legal, pero no es la jugada buscada. Se reinicia la posición.`, 'bad');
    setTimeout(() => { resetLesson(); }, 1200);
  }
}

/* ---------------- El recuadro donde se escribe (Modo Adaptado) ----------------
 * Eran dos campos que se turnaban y solo entendían "e4" o "e1 g1". Ahora es uno
 * solo (js/cuadro-comandos.js): la jugada la lee js/chess-move-parser.js, que
 * entiende "Cf3" y "Nf3" además del origen y destino, y antes de tratarlo como
 * respuesta el recuadro mira si era una PREGUNTA sobre la posición. */
let comandos = null;
function montarComandos(){
  if(comandos || !window.CuadroComandos) return;
  comandos = CuadroComandos.montar(document.getElementById('q-comandos'), {
    etiqueta: 'Escribe tu respuesta, o una pregunta sobre la posición',
    juego: () => game,
    tablero: () => teclado,
    onEnviar: responderEscribiendo,
  });
}

function responderEscribiendo(texto, api){
  if(!currentLesson) return;
  if(currentLesson.type === 'squares'){
    // "eva 4" tiene que llegar a e4: es como el sitio dicta las casillas, así
    // que escribir lo que uno acaba de oír tiene que funcionar.
    const square = CuadroComandos.casillaPedida(texto);
    if(!square){ api.decir('Esa no es una casilla. Usa una letra de a a h y un número de 1 a 8, por ejemplo "e4".'); return; }
    api.limpiar().decir('');
    blindHandleSquareGuess(square);
    return;
  }
  if(currentLesson.type === 'move'){
    api.limpiar().decir('');
    blindHandleMoveGuess(texto);
  }
}

/* Una sola parada de tabulador para todo el tablero y las flechas por dentro,
   más los atajos de una tecla en Modo Adaptado. Se monta una vez y se repone
   solo en cada repintado. */
let teclado = null;
function montarTeclado(){
  if(teclado || !window.TableroAccesible) return;
  teclado = TableroAccesible.montar(document.getElementById('board'), {
    nombre: 'Tablero de la lección',
    juego: () => game,
  });
}

/* ---------------- Progreso (localStorage, mismo patrón que entreno/index.html) ---------------- */
function getSolvedSet(){
  try{ return JSON.parse(localStorage.getItem('entreno_aprende_solved') || '{}'); }catch(e){ return {}; }
}
function markSolved(id){
  const solved = getSolvedSet();
  solved[id] = true;
  localStorage.setItem('entreno_aprende_solved', JSON.stringify(solved));
}
function isSolved(id){ return !!getSolvedSet()[id]; }

function lessonsFor(cat){ return LESSONS.filter(l => l.cat === cat); }
function isUnlocked(lesson, list){
  // Quien administra tiene todas las lecciones abiertas (js/acceso-admin.js);
  // para el alumno siguen abriéndose una a una.
  if(window.AccesoAdmin && window.AccesoAdmin.esAdmin()) return true;
  const idx = list.findIndex(l => l.id === lesson.id);
  if(idx <= 0) return true;
  return isSolved(list[idx - 1].id);
}
function countSolved(list){ return list.filter(l => isSolved(l.id)).length; }

let currentCategory = 'movimientos';
let currentLesson = null;

function buildTabs(){
  const tabs = document.getElementById('tabs');
  tabs.innerHTML = '';
  CATEGORY_ORDER.forEach((cat) => {
    const list = lessonsFor(cat);
    const hechas = cat === 'asignaciones' ? asignacionesHechas() : countSolved(list);
    const total = cat === 'asignaciones' ? ASIGNACIONES.length : list.length;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab' + (cat === currentCategory ? ' active' : '');
    btn.style.setProperty('--tab-color', `var(${CATEGORY_VAR[cat]})`);
    btn.innerHTML = `${CATEGORY_LABEL[cat]} <span class="n">${hechas}/${total}</span>`;
    btn.addEventListener('click', () => { currentCategory = cat; showList(); });
    tabs.appendChild(btn);
  });
}

function showList(){
  document.getElementById('lesson-view').style.display = 'none';
  document.getElementById('list-view').style.display = 'block';
  buildTabs();
  const box = document.getElementById('lesson-list');
  box.innerHTML = '';
  if(currentCategory === 'asignaciones'){ showAsignaciones(box); return; }
  const list = lessonsFor(currentCategory);
  list.forEach((lesson) => {
    const unlocked = isUnlocked(lesson, list);
    const solved = isSolved(lesson.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lesson-item';
    btn.disabled = !unlocked;
    btn.innerHTML = `
      <span class="mark">${solved ? '✅' : (unlocked ? '♟️' : '🔒')}</span>
      <span class="info">
        <span class="name">${lesson.title}</span>
        <span class="desc">${lesson.type === 'squares' ? 'Encuentra todas las casillas' : (lesson.type === 'quiz' ? 'Identifica la posición' : 'Encuentra la jugada')}</span>
      </span>`;
    if(unlocked) btn.addEventListener('click', () => openLesson(lesson));
    box.appendChild(btn);
  });
}

// Las asignaciones se abren en su propia página, así que la ficha son enlaces
// con su estado al lado, no botones de lección.
function showAsignaciones(box){
  ASIGNACIONES.forEach((asignacion) => {
    const estado = asignacion.estado();
    const enlace = document.createElement('a');
    enlace.href = asignacion.href;
    enlace.className = 'lesson-item';
    enlace.innerHTML = `
      <span class="mark">${estado.hecho ? '✅' : '📋'}</span>
      <span class="info">
        <span class="name">${asignacion.titulo}</span>
        <span class="desc">${asignacion.desc}</span>
        <span class="desc">${estado.nota}</span>
      </span>`;
    box.appendChild(enlace);
  });
}

/* ---------------- Tablero ---------------- */
const FILES = ['a','b','c','d','e','f','g','h'];
function isLightSquare(square){
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10) - 1;
  return (file + rank) % 2 === 1;
}

let game = null;
let selectedSquare = null;
let foundSet = new Set();
let quizRoundIndex = 0;
let lessonLocked = false;

function drawBoard(){
  const board = document.getElementById('board');
  board.innerHTML = '';
  FILES.slice().reverse(); // no-op, mantiene FILES intacto
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
        span.setAttribute('aria-hidden', 'true');
        if (window.PiezaPreferida) PiezaPreferida.pintar(span, piece.type, piece.color);
        else {
          span.className = piece.color === 'w' ? 'piece-white' : 'piece-black';
          span.textContent = GLYPH[piece.color][piece.type];
        }
        btn.appendChild(span);
      }
      // Qué dice cada casilla lo escribe js/tablero-accesible.js: acá solo el
      // estado, que es lo único que esta página sabe y aquel no. En las
      // lecciones de marcar casillas, "ya marcada" es el dato que hace falta
      // para no volver a intentarla.
      if(currentLesson.type === 'squares' && foundSet.has(square)){ btn.classList.add('found'); btn.dataset.estado = 'ya marcada'; }
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
  const el = document.getElementById('lesson-status');
  el.textContent = text;
  el.className = 'lesson-status' + (cls ? ' ' + cls : '');
  if(window.BlindNotation) window.BlindNotation.speak(text);
  /* El mismo aviso, repetido en el recuadro: quien contesta escribiendo tiene el
     foco ahí y el renglón del tablero le queda lejos — y sobre todo, la respuesta
     del rival solo se oye si se dice, porque la lista de jugadas no es región
     viva. Sin esto se oía "espera" y después "te toca", sin enterarse nunca de
     qué se había jugado: o sea, sin poder seguir. */
  if(comandos) comandos.decir(text);
}

function finishLesson(){
  lessonLocked = true;
  markSolved(currentLesson.id);
  EntrenoProgress.log('aprender', { lesson_id: currentLesson.id, category: currentLesson.cat, title: currentLesson.title });
  setStatus('✅ ¡Muy bien! Lección completada.', 'ok');
  const nextBtn = document.getElementById('next-btn');
  nextBtn.style.display = '';
  // En modo adaptado, el foco cae directo en "Siguiente lección" — sin esto, quien usa
  // el campo de texto (o un lector de pantalla) tendría que ir a buscar el botón a mano
  // cada vez que termina una lección, en vez de solo presionar Enter para seguir.
  if(blindMode) nextBtn.focus();
}

function onSquareClick(square, btn){
  if(lessonLocked) return;

  if(currentLesson.type === 'squares'){
    if(foundSet.has(square)) return;
    if((currentLesson.targets || []).includes(square)){
      foundSet.add(square);
      btn.classList.add('found');
      const remaining = currentLesson.targets.length - foundSet.size;
      if(remaining > 0){
        setStatus(`Bien — te faltan ${remaining} casilla${remaining === 1 ? '' : 's'}.`);
      } else {
        finishLesson();
      }
    } else {
      flashWrong(btn);
      setStatus('Esa casilla no es correcta. Sigue intentando.', 'bad');
    }
    return;
  }

  if(currentLesson.type === 'move'){
    const piece = game.get(square);
    if(selectedSquare === null){
      if(piece && piece.color === game.turn()){
        selectedSquare = square;
        drawBoard();
        highlightTargets(square);
      }
      return;
    }
    if(square === selectedSquare){
      selectedSquare = null;
      drawBoard();
      return;
    }
    const legal = game.moves({ square: selectedSquare, verbose: true });
    const target = legal.find(m => m.to === square);
    if(!target){
      if(piece && piece.color === game.turn()){
        selectedSquare = square;
        drawBoard();
        highlightTargets(square);
      } else {
        selectedSquare = null;
        drawBoard();
      }
      return;
    }
    const moveResult = game.move({ from: selectedSquare, to: square, promotion: 'q' });
    selectedSquare = null;
    drawBoard();
    if(!moveResult) return; // no debería pasar: ya se validó con .moves()

    const correct = currentLesson.anyLegalMove ||
      (currentLesson.solution && moveResult.from === currentLesson.solution.from && moveResult.to === currentLesson.solution.to);

    if(correct){
      finishLesson();
    } else {
      setStatus('Esa jugada es legal, pero no es la que buscamos. Intenta de nuevo.', 'bad');
      setTimeout(() => { resetLesson(); }, 900);
    }
  }
}

// Arrastrar y soltar piezas (además del clic-clic de siempre): ver js/board-drag.js.
// Solo se puede arrastrar en las lecciones de tipo "move" (mover una pieza) — las de
// tipo "squares" (tocar la casilla correcta) no tienen nada que levantar, así que ahí
// isDraggable() siempre da false y se deja el toque normal.
if(typeof enableBoardDrag !== 'undefined'){
  enableBoardDrag(document.getElementById('board'), {
    isDraggable: (square) => {
      if(lessonLocked || currentLesson.type !== 'move') return false;
      const piece = game.get(square);
      return !!(piece && piece.color === game.turn());
    },
    isSelected: (square) => selectedSquare === square,
    onSquareClick: (square) => onSquareClick(square),
  });
}

function highlightTargets(square){
  const legal = game.moves({ square, verbose: true });
  const board = document.getElementById('board');
  legal.forEach((m) => {
    const cell = board.querySelector('[data-square="' + m.to + '"]');
    if(cell) cell.classList.add(m.flags.includes('c') || m.flags.includes('e') ? 'target-capture' : 'target');
  });
}

function loadQuizRound(){
  const round = currentLesson.rounds[quizRoundIndex];
  game = new Chess(round.fen);
  drawBoard();
  setStatus(`Posición ${quizRoundIndex + 1} de ${currentLesson.rounds.length}.`);
}

function resetLesson(){
  lessonLocked = false;
  selectedSquare = null;
  foundSet = new Set();
  quizRoundIndex = 0;
  document.getElementById('next-btn').style.display = 'none';

  if(currentLesson.type === 'quiz'){
    loadQuizRound();
    document.getElementById('quiz-controls').style.display = 'flex';
  } else {
    game = new Chess(currentLesson.fen);
    document.getElementById('quiz-controls').style.display = 'none';
    drawBoard();
    if(currentLesson.type === 'squares'){
      setStatus(`Encuentra ${currentLesson.targets.length} casillas.` + (blindMode
        ? ' Escríbelas de a una en el recuadro, por ejemplo "e4" o "eva 4". Escribe "posición" para oír dónde está cada pieza.'
        : ''));
    } else {
      setStatus(blindMode ? 'Escribe la jugada que quieres hacer.' : 'Haz clic en la pieza que quieres mover.');
    }
  }
  updateBlindInputVisibility();
}

function openLesson(lesson){
  currentLesson = lesson;
  document.getElementById('list-view').style.display = 'none';
  document.getElementById('lesson-view').style.display = 'block';
  document.getElementById('lesson-title').textContent = lesson.title;
  document.getElementById('lesson-text').textContent = lesson.text;
  resetLesson();
  /* El botón de la lección desaparece con la lista y el foco se iba al <body>:
     quien usa teclado se quedaba sin saber dónde estaba. El título se lee
     primero —y con él la lección— y en Modo Adaptado el siguiente Tab ya es el
     tablero y después el recuadro donde se contesta. */
  const titulo = document.getElementById('lesson-title');
  titulo.setAttribute('tabindex', '-1');
  titulo.focus();
}

document.getElementById('back-to-list').addEventListener('click', (e) => {
  e.preventDefault();
  showList();
});
document.getElementById('retry-btn').addEventListener('click', resetLesson);
document.getElementById('next-btn').addEventListener('click', () => {
  const list = lessonsFor(currentCategory);
  const idx = list.findIndex(l => l.id === currentLesson.id);
  if(idx >= 0 && idx < list.length - 1){
    openLesson(list[idx + 1]);
  } else {
    showList();
  }
});
document.getElementById('quiz-mate-btn').addEventListener('click', () => answerQuiz('mate'));
document.getElementById('quiz-ahogado-btn').addEventListener('click', () => answerQuiz('ahogado'));

function answerQuiz(answer){
  if(lessonLocked) return;
  const round = currentLesson.rounds[quizRoundIndex];
  if(answer === round.answer){
    quizRoundIndex++;
    if(quizRoundIndex >= currentLesson.rounds.length){
      document.getElementById('quiz-controls').style.display = 'none';
      finishLesson();
    } else {
      setStatus('✅ ¡Correcto! Siguiente posición…', 'ok');
      setTimeout(loadQuizRound, 700);
    }
  } else {
    setStatus('❌ No es esa — fíjate: ¿el rey está en jaque o no?', 'bad');
  }
}

/* ---------------- Arranque ---------------- */
let appInitialized = false;
function initApp(){
  if(appInitialized) return;
  appInitialized = true;
  applyBlindModeUI();
  showList();
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

/* Coordenadas del tablero (js/coordenadas-tablero.js): la letra de columna abajo
   y el número de fila a la izquierda, para que se entienda hacia dónde avanza la
   posición. Se repintan solas cada vez que la página redibuja el tablero. */
if (window.Coordenadas) Coordenadas.aplicar(document.getElementById('board'));
