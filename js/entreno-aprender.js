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

// LESSONS, CATEGORY_ORDER y CATEGORY_LABEL viven en js/aprender-lecciones.js (las lee también la clase en vivo).

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
    comandos.ayuda('Jugada: "Cf3", "Dxh7+", "e1 g1". Pregunta: "caballos", "qué hay en e4". Escribe "ayuda" para todo.');
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
  if(currentLesson) document.getElementById('lesson-text').textContent = textoDeLeccion(currentLesson);
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

/* Las dos casillas dichas como se oyen: «eva 1 felix 1» → ["e1", "f1"]. Cada
   pedazo pasa por CuadroComandos.casillaPedida(), que es donde vive la forma
   hablada de las columnas. */
function casillasDichas(raw){
  if(!window.CuadroComandos) return [];
  const t = CuadroComandos.normalizar(raw).replace(/[,.\-]/g, ' ');
  const partes = t.match(/[a-zñ]+\s?[1-8]/g) || [];
  return partes.map((x) => CuadroComandos.casillaPedida(x)).filter(Boolean);
}

/* Lo que se dice con palabras y el intérprete común no toma: «rey f1» (la
   pieza con su nombre), «rey felix 1», «e7 e8 dama» (la coronación dicha). Se
   pasa a la notación inglesa, que no es ambigua: «R» es rey en castellano y
   torre en inglés, y «Rf1» en una posición con torre movía la torre. Devuelve
   { texto, corona } —`corona`, la pieza si se dijo— o null si no había nada
   que traducir. */
const PIEZA_DICHA = { rey: 'K', dama: 'Q', torre: 'R', alfil: 'B', caballo: 'N', peon: '' };
const CORONA_DICHA = { dama: 'q', torre: 'r', alfil: 'b', caballo: 'n', d: 'q', t: 'r', a: 'b', c: 'n', q: 'q', r: 'r', b: 'b', n: 'n' };
function jugadaDicha(raw){
  if(!window.CuadroComandos) return null;
  let t = CuadroComandos.normalizar(raw).replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/\b(anna|bella|cesar|david|eva|felix|gustav|hector)\s?([1-8])\b/g, (m, c, n) => c[0] + n);
  let corona = null;
  const conCorona = t.match(/^(.*[a-h][1-8])\s*(?:=|\s|corona(?:ndo)?(?: a| en)?\s*)\s*(dama|torre|alfil|caballo|[dtacqrbn])$/);
  if(conCorona){ t = conCorona[1]; corona = CORONA_DICHA[conCorona[2]]; }
  const conPieza = t.match(/^(rey|dama|torre|alfil|caballo|peon)\s*(?:de\s+|a\s+)?(.+)$/);
  if(conPieza) t = PIEZA_DICHA[conPieza[1]] + conPieza[2].replace(/\s+(a|hasta)\s+/, ' ');
  if(t === CuadroComandos.normalizar(raw) && !corona) return null;
  return { texto: t + (corona ? '=' + corona.toUpperCase() : ''), corona };
}

// Jugadas: la notación de siempre en español o en inglés («Rf1», «Cf3»,
// «O-O», «enroque corto»), el origen y el destino («e1 g1», «e1g1») y las
// casillas dichas («eva 1 felix 1»), y dichas con palabras («rey f1»,
// «enroque» a secas, «e7 e8 dama»).
function blindHandleMoveGuess(raw){
  if(lessonLocked) return;
  /* «enroque» a secas: si hay uno solo posible, es ese; si hay dos, se
     pregunta cuál (antes: «no entendí»). */
  if(/^\s*(el\s+)?enroque\s*$/i.test(raw)){
    const enroques = game.moves({ verbose: true }).filter((m) => m.flags.includes('k') || m.flags.includes('q'));
    if(enroques.length === 1){ moverPreguntandoCoronacion(enroques[0].from, enroques[0].to, blindResolverJugada); return; }
    setStatus(enroques.length ? 'Hay dos enroques posibles: escribe «enroque corto» o «enroque largo».' : 'Ahora no se puede enrocar.', 'bad');
    return;
  }
  const dicha = jugadaDicha(raw);
  const mvDicha = dicha && window.ComandosTablero ? ComandosTablero.jugadaEscrita(game, dicha.texto) : null;
  if(mvDicha){
    // Con la pieza dicha («e7 e8 dama») se corona sin preguntar: ya la eligió.
    moverPreguntandoCoronacion(mvDicha.from, mvDicha.to, blindResolverJugada, dicha.corona || undefined);
    return;
  }
  /* Antes se borraba todo lo que no fuera a-h o 1-8 y se exigían cuatro
     caracteres: «Rf1» quedaba en «f1» y la respuesta era «escribe el origen y
     el destino», aunque fuera la jugada correcta dicha como se dice. La jugada
     la resuelve ComandosTablero.jugadaEscrita(), la misma de todo el sitio, que
     la busca entre las legales sin tocar la partida. */
  let mv = window.ComandosTablero ? ComandosTablero.jugadaEscrita(game, raw) : null;
  if(!mv){
    const dichas = casillasDichas(raw);
    if(dichas.length === 2 && window.ComandosTablero) mv = ComandosTablero.jugadaEscrita(game, dichas[0] + dichas[1]);
  }
  if(mv){
    // «e7e8=D» también trae la pieza: si se escribió, no se pregunta.
    const escrita = /[1-8]\s*=?\s*[qrbndtac]\s*[+#]?\s*$/i.test(raw.trim()) ? mv.promotion : undefined;
    moverPreguntandoCoronacion(mv.from, mv.to, blindResolverJugada, escrita);
    return;
  }
  // No se entendió como jugada legal: se dice por qué, con las casillas si las hay.
  const dichas = casillasDichas(raw);
  const clean = dichas.length === 2 ? dichas.join('') : raw.trim().toLowerCase().replace(/[^a-h1-8]/g, '');
  if(clean.length !== 4){
    /* Tres casos distintos (js/comandos-tablero.js): una jugada que no se puede
       hacer, un botón que acá no hay («solución»), o algo que no se entendió. */
    const dicho = window.ComandosTablero ? ComandosTablero.noSePudoJugar(raw) : 'No entendí.';
    setStatus(/^No entendí/.test(dicho)
      ? `No entendí «${raw.trim()}». Escribe la jugada como «Rf1», «rey f1», «Cf3», «enroque corto» o con el origen y el destino, por ejemplo «e1 g1».`
      : dicho, 'bad');
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
  moverPreguntandoCoronacion(from, to, blindResolverJugada);
}

/* En las tácticas, cualquier jugada que cumpla el motivo de la lección
   (js/motivos-tacticos.js): en el ataque descubierto, todo salto del caballo
   descubre el jaque, y la lección solo aceptaba uno. */
function cumpleElMotivo(moveResult){
  return !!(currentLesson.motivo && window.MotivosTacticos && MotivosTacticos.cumple(currentLesson.motivo, currentLesson.fen, moveResult));
}

function blindResolverJugada(moveResult){
  if(!moveResult) return;
  renderPositionReadout();
  const correct = currentLesson.anyLegalMove ||
    (currentLesson.solution && moveResult.from === currentLesson.solution.from && moveResult.to === currentLesson.solution.to) ||
    cumpleElMotivo(moveResult);
  const sanText = window.BlindNotation.sanSpoken(moveResult.san);
  if(correct){
    setStatus(`✅ ${sanText}. ¡Correcto!`, 'ok');
    finishLesson();
  } else {
    // «Respuesta incorrecta» y no «no es legal»: la jugada se pudo hacer.
    setStatus(ComandosTablero.incorrecta(sanText, 'Se reinicia la posición.'), 'bad');
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

function modoCiego(){ return document.documentElement.classList.contains('modo-ciego'); }

/* La respuesta del «¿Jaque mate o ahogado?» escrita: la palabra, «tablas»
   (el ahogado lo es), o la letra o el número del botón (A/1 mate, B/2
   ahogado). Antes el recuadro no contestaba nada en esta lección. */
function respuestaDelQuiz(texto){
  const t = CuadroComandos.normalizar(texto).replace(/[.!¡?¿]/g, '').replace(/^(es|es un|es una)\s+/, '').trim();
  if(/^(jaque ?mate|mate|a|1|opcion a)$/.test(t)) return 'mate';
  if(/^(ahogado|rey ahogado|tablas|tablas por ahogado|b|2|opcion b)$/.test(t)) return 'ahogado';
  return null;
}

function ayudaPedida(texto){
  const t = CuadroComandos.normalizar(texto).replace(/[.!¡?¿«»"]/g, '').trim();
  if(/^(pista|una pista|dame una pista|otra pista|ayudame)$/.test(t)) return 'pista';
  if(/^((ver|dame|dime) )?(la )?(solucion|respuesta)$|^me rindo$/.test(t)) return 'solucion';
  return null;
}
const dichaCasilla = (sq) => (window.BlindNotation && BlindNotation.squareSpoken ? BlindNotation.squareSpoken(sq) : sq);
function listaDicha(xs){ return xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1]; }
/* La jugada de la solución en palabras («rey a gustav 1»), sobre una copia. */
function solucionDicha(){
  const s = currentLesson.solution;
  if(!s) return null;
  try{
    const m = new Chess(currentLesson.fen).move({ from: s.from, to: s.to, promotion: s.promotion || 'q' });
    if(m) return window.BlindNotation && BlindNotation.sanSpoken ? BlindNotation.sanSpoken(m.san) : ComandosTablero.sanEspanol(m.san);
  }catch(e){}
  return 'de ' + dichaCasilla(s.from) + ' a ' + dichaCasilla(s.to);
}
function pistaDeLeccion(){
  const l = currentLesson;
  if(l.type === 'squares'){
    const faltan = (l.targets || []).filter((sq) => !foundSet.has(sq));
    if(!faltan.length) return 'Ya encontraste todas las casillas.';
    const col = faltan[0][0];
    const colDicha = window.BlindNotation && BlindNotation.fileName ? BlindNotation.fileName(col) : col;
    return `Pista: te ${faltan.length === 1 ? 'falta 1 casilla' : `faltan ${faltan.length} casillas`}; una está en la columna ${colDicha}.`;
  }
  if(l.type === 'quiz') return 'Pista: fíjate si el rey que no se puede mover está en jaque. Si lo está, es jaque mate; si no, es ahogado. Escribe «jaques» o «posición» para revisarlo.';
  if(l.anyLegalMove || !l.solution) return 'En esta lección no hay pista: vale cualquier jugada legal. Escribe «mis jugadas» para oír las que puedes hacer.';
  return `Pista: mueve la pieza de ${dichaCasilla(l.solution.from)}.`;
}
function solucionDeLeccion(){
  const l = currentLesson;
  if(l.type === 'squares'){
    const faltan = (l.targets || []).filter((sq) => !foundSet.has(sq));
    if(!faltan.length) return 'Ya encontraste todas las casillas.';
    return `La solución: ${faltan.length === 1 ? 'la casilla que falta es' : 'las casillas que faltan son'} ${listaDicha(faltan.map(dichaCasilla))}. Escríbelas para terminar la lección.`;
  }
  if(l.type === 'quiz') return 'En esta lección no hay solución: la respuesta la das tú. Escribe «pista» para una ayuda, o «mate» o «ahogado».';
  if(l.anyLegalMove || !l.solution) return 'En esta lección no hay solución: vale cualquier jugada legal. Escribe «mis jugadas» para oír las que puedes hacer.';
  return `La solución es: ${solucionDicha()}. Escríbela para terminar la lección.`;
}

function responderEscribiendo(texto, api){
  if(!currentLesson) return;
  // Terminada la lección, lo mismo que los botones: «siguiente», «otra vez».
  const nextBtn = document.getElementById('next-btn');
  if(lessonLocked && nextBtn.style.display !== 'none'){
    const t = CuadroComandos.normalizar(texto);
    if(/^sig(uiente)?( leccion)?$/.test(t)){ api.limpiar(); nextBtn.click(); return; }
    if(/^(otra vez|de nuevo|repetir|reiniciar)$/.test(t)){ api.limpiar(); document.getElementById('retry-btn').click(); return; }
    api.decir('Lección terminada. Escribe «siguiente» para la próxima lección, u «otra vez» para repetirla.');
    return;
  }
  /* «pista» y «solución»: antes, en las lecciones de casillas contestaba «Esa
     no es una casilla», y en las de jugada «No entendí». */
  const pide = ayudaPedida(texto);
  if(pide){
    api.limpiar();
    if(lessonLocked){ api.decir('Espera: ya viene la siguiente posición.'); return; }
    setStatus(pide === 'pista' ? pistaDeLeccion() : solucionDeLeccion());
    return;
  }
  if(currentLesson.type === 'quiz'){
    const r = respuestaDelQuiz(texto);
    if(!r){ api.decir('Escribe «mate» (o A) si es jaque mate, o «ahogado» (o B) si es ahogado.'); return; }
    if(lessonLocked){ api.decir('Espera: ya viene la siguiente posición.'); return; }
    api.limpiar().decir('');
    answerQuiz(r);
    return;
  }
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
    btn.setAttribute('aria-pressed', cat === currentCategory ? 'true' : 'false');
    btn.style.setProperty('--tab-color', `var(${CATEGORY_VAR[cat]})`);
    btn.innerHTML = `${CATEGORY_LABEL[cat]} <span class="n">${hechas}/${total}</span>`;
    btn.addEventListener('click', () => { currentCategory = cat; showList(true); });
    tabs.appendChild(btn);
  });
}

/* `enfocar`: al elegir una categoría (o volver de una lección) las pestañas y
   la lección se repintan y el foco caía al <body>: quien no ve se quedaba sin
   saber dónde estaba. Va al título de la lista, que dice qué se abrió. */
function showList(enfocar){
  document.getElementById('lesson-view').style.display = 'none';
  document.getElementById('list-view').style.display = 'block';
  buildTabs();
  const titulo = document.getElementById('list-title');
  if(titulo){
    const lista = currentCategory === 'asignaciones' ? ASIGNACIONES : lessonsFor(currentCategory);
    const hechas = currentCategory === 'asignaciones' ? asignacionesHechas() : countSolved(lista);
    titulo.textContent = `${CATEGORY_LABEL[currentCategory]}: ${hechas} de ${lista.length} hechas`;
    if(enfocar) titulo.focus();
  }
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
    /* Bloqueada con aria-disabled y no con `disabled`: un <button disabled>
       no se alcanza con Tab, y quien no ve ni se enteraba de que la lección
       existía. Al activarla dice por qué está cerrada. */
    if(!unlocked) btn.setAttribute('aria-disabled', 'true');
    btn.innerHTML = `
      <span class="mark">${solved ? '✅' : (unlocked ? '♟️' : '🔒')}</span>
      <span class="info">
        <span class="name">${lesson.title}</span>
        <span class="desc">${lesson.type === 'squares' ? 'Encuentra todas las casillas' : (lesson.type === 'quiz' ? 'Identifica la posición' : 'Encuentra la jugada')}</span>
      </span>`;
    if(unlocked) btn.addEventListener('click', () => openLesson(lesson));
    else btn.addEventListener('click', () => avisarBloqueada(lesson, list));
    box.appendChild(btn);
  });
}

function avisarBloqueada(lesson, list){
  const idx = list.findIndex((l) => l.id === lesson.id);
  const antes = idx > 0 ? list[idx - 1] : null;
  const nota = document.getElementById('list-status');
  if(!nota) return;
  nota.textContent = '';
  setTimeout(() => {
    nota.textContent = `«${lesson.title}» está bloqueada: se abre cuando termines ${antes ? `«${antes.title}»` : 'la lección anterior'}.`;
  }, 60);
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
let quizFallos = 0; // posiciones del quiz contestadas mal: con alguna, la lección no queda completada
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
  const nextBtn = document.getElementById('next-btn');
  nextBtn.style.display = '';
  /* Con la cuenta ciega el foco NO sale del recuadro: se hace todo desde ahí,
     y se dice cómo seguir escribiendo. */
  if(modoCiego() && comandos){
    setStatus('✅ ¡Muy bien! Lección completada. Escribe «siguiente» para seguir con la próxima lección.', 'ok');
    comandos.enfocar();
    return;
  }
  setStatus('✅ ¡Muy bien! Lección completada.', 'ok');
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
    const from = selectedSquare;
    selectedSquare = null;
    drawBoard();
    moverPreguntandoCoronacion(from, square, (moveResult) => { drawBoard(); if(moveResult) resolverJugada(moveResult); });
  }
}

function resolverJugada(moveResult){
  const correct = currentLesson.anyLegalMove ||
    (currentLesson.solution && moveResult.from === currentLesson.solution.from && moveResult.to === currentLesson.solution.to) ||
    cumpleElMotivo(moveResult);

  if(correct){
    finishLesson();
  } else {
    setStatus(ComandosTablero.incorrecta(blindMode && window.BlindNotation ? BlindNotation.sanSpoken(moveResult.san)
      : moveResult.san.replace(/[NBRQK]/g, (l) => ({ N: 'C', B: 'A', R: 'T', Q: 'D', K: 'R' })[l]), 'Intenta de nuevo.'), 'bad');
    setTimeout(() => { resetLesson(); }, 900);
  }
}

/* Hace la jugada; si el peón corona, primero pregunta en qué pieza
   (js/coronacion.js). alHacer(jugada) no se llama si se cancela. */
function moverPreguntandoCoronacion(from, to, alHacer, pieza){
  // La pieza ya dicha («e7 e8 dama»): se corona sin abrir el diálogo.
  if(pieza){ alHacer(game.move({ from, to, promotion: pieza })); return; }
  if(window.Coronacion && Coronacion.hayQueElegir(game, from, to)){
    Coronacion.pedir(game.turn(), (elegida) => {
      if(elegida && !lessonLocked) alHacer(game.move({ from, to, promotion: elegida }));
    });
    return;
  }
  alHacer(game.move({ from, to }));
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
  setStatus(`Posición ${quizRoundIndex + 1} de ${currentLesson.rounds.length}.` +
    (blindMode ? ' ¿Es jaque mate o ahogado? Escribe «mate» o «ahogado».' : ''));
}

function resetLesson(){
  lessonLocked = false;
  selectedSquare = null;
  foundSet = new Set();
  quizRoundIndex = 0;
  quizFallos = 0;
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

/* En Modo Adaptado no se hace clic: se escribe. El enunciado decía «Haz clic
   en todas las casillas…» a quien contesta en el recuadro. */
function textoDeLeccion(lesson){
  if(!blindMode) return lesson.text;
  return lesson.text
    .replace('Haz clic en todas las casillas a las que puede llegar.', 'Escribe en el recuadro, de a una, todas las casillas a las que puede llegar.')
    .replace('Haz clic en el rey y luego dos casillas a la derecha.', 'Escribe la jugada del rey dos casillas a la derecha: «enroque corto», «O-O» o «e1 g1».')
    .replace(/Haz clic en /g, 'Escribe ');
}

function openLesson(lesson){
  currentLesson = lesson;
  document.getElementById('list-view').style.display = 'none';
  document.getElementById('lesson-view').style.display = 'block';
  document.getElementById('lesson-title').textContent = lesson.title;
  document.getElementById('lesson-text').textContent = textoDeLeccion(lesson);
  resetLesson();
  /* El botón de la lección desaparece con la lista y el foco se iba al <body>:
     quien usa teclado se quedaba sin saber dónde estaba. El título se lee
     primero —y con él la lección— y en Modo Adaptado el siguiente Tab ya es el
     tablero y después el recuadro donde se contesta. */
  const titulo = document.getElementById('lesson-title');
  titulo.setAttribute('tabindex', '-1');
  // Con la cuenta ciega, si se pasó escribiendo «siguiente», el foco se queda
  // en el recuadro: se hace todo desde ahí.
  if(modoCiego() && comandos && document.activeElement === comandos.input) return;
  titulo.focus();
}

document.getElementById('back-to-list').addEventListener('click', (e) => {
  e.preventDefault();
  showList(true);
});
document.getElementById('retry-btn').addEventListener('click', resetLesson);
document.getElementById('next-btn').addEventListener('click', () => {
  const list = lessonsFor(currentCategory);
  const idx = list.findIndex(l => l.id === currentLesson.id);
  if(idx >= 0 && idx < list.length - 1){
    openLesson(list[idx + 1]);
  } else {
    showList(true);
  }
});
document.getElementById('quiz-mate-btn').addEventListener('click', () => answerQuiz('mate'));
document.getElementById('quiz-ahogado-btn').addEventListener('click', () => answerQuiz('ahogado'));

/* Con dos botones, dejar reintentar la misma posición era regalar la respuesta:
   bastaba con apretar el otro. Ahora una respuesta mal explica por qué, cuenta y
   pasa a la siguiente; la lección solo se completa sin fallar ninguna. */
function answerQuiz(answer){
  if(lessonLocked) return;
  const round = currentLesson.rounds[quizRoundIndex];
  const total = currentLesson.rounds.length;
  quizRoundIndex++;
  const ultima = quizRoundIndex >= total;
  if(answer !== round.answer){
    quizFallos++;
    const porque = game.in_check()
      ? 'el rey está en jaque y no tiene cómo salir: es jaque mate.'
      : 'el rey NO está en jaque, pero su bando no tiene ninguna jugada legal: es ahogado.';
    setStatus('❌ No: ' + porque + (ultima ? '' : ' Siguiente posición…'), 'bad');
  } else if(!ultima){
    setStatus('✅ ¡Correcto! Siguiente posición…', 'ok');
  }
  if(!ultima){
    lessonLocked = true;
    setTimeout(() => { lessonLocked = false; loadQuizRound(); }, answer === round.answer ? 700 : 2600);
    return;
  }
  document.getElementById('quiz-controls').style.display = 'none';
  if(quizFallos === 0){
    finishLesson();
    return;
  }
  lessonLocked = true;
  const aciertos = total - quizFallos;
  setTimeout(() => {
    setStatus(`Acertaste ${aciertos} de ${total}. Para completar la lección hay que acertarlas todas: presiona «Reiniciar» y vuelve a intentarlo.`, 'bad');
  }, answer === round.answer ? 0 : 2600);
}

/* ---------------- Arranque ---------------- */
let appInitialized = false;
function initApp(){
  if(appInitialized) return;
  appInitialized = true;
  applyBlindModeUI();
  // Con la cuenta ciega, el foco empieza en el título de la lista (no en el <body>).
  showList(modoCiego());
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
