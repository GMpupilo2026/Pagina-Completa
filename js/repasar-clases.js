/* El código de repasar-clases.html: «Repasar mis clases».

   La partida de cada clase —la que el profe guarda con «💾 Guardar PGN», o la
   que se guarda sola al cerrar la clase— recorrida jugada por jugada, con lo
   que el profe comentó de cada una y las variantes que armó.

   Quién ve qué lo decide la base, no esta página: saved_games solo le devuelve
   a un alumno las partidas ligadas a una clase A LA QUE ASISTIÓ
   (saved_games_select_asistentes), y al profe las suyas. Acá solo se pintan.

   La clase se lee de `saved_games.datos` (arranque, jugadas, variantes y
   comentarios: la forma de js/pgn-clase.js) y se recorre con el MISMO árbol
   del que sale el PGN (PgnClase.arbol). Las partidas de antes no tienen
   `datos`: se lee la línea principal del PGN y se dice que no trae
   comentarios. Todo lo que escribió una persona va por textContent. Ver
   «Repasar mis clases» en docs/decisiones/clase-en-vivo.md. */

const gate = document.getElementById('gate');
const app = document.getElementById('app');
const gateChecking = document.getElementById('gate-checking');
const NEXT_PATH = 'repasar-clases.html';

const GLYPH = {
  w: { p:'♙', n:'♘', b:'♗', r:'♖', q:'♕', k:'♔' },
  b: { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', k:'♚' },
};

let partidas = [];
let actual = null;        // { partida, raiz, nodos: [], comentarios, sinDatos }
let nodo = null;          // el que se está mirando (null = la posición de arranque)
let orientacion = 'w';
let yoId = null;
let preguntas = [];       // las de la clase abierta, con su nodo (o null si no están en la partida)

/* ---------------- La lista ---------------- */
function fechaCR(iso){
  try { return new Intl.DateTimeFormat('es-CR', { timeZone: 'America/Costa_Rica', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)); }
  catch (e) { return ''; }
}
async function cargarLista(){
  const lista = document.getElementById('lista-clases');
  const vacio = document.getElementById('lista-vacia');
  const { data, error } = await sb.from('saved_games')
    .select('id, title, created_at, move_count, pgn, datos, class_session_id, created_by, class_sessions(title, started_at, para_ausentes)')
    .not('class_session_id', 'is', null)
    .order('created_at', { ascending: false })
    .range(0, 199);
  if (error) {
    vacio.textContent = 'No se pudieron cargar tus clases. Intenta recargar la página.';
    vacio.hidden = false;
    return;
  }
  partidas = data || [];
  /* Las que el profe compartió con los que faltaron (class_sessions.para_ausentes)
     le llegan también a quien no fue: se dice, para que sepa que es la que se
     perdió. Su propia asistencia la lee de la base. */
  const compartidas = partidas.filter((p) => p.class_sessions && p.class_sessions.para_ausentes && p.created_by !== yoId);
  let fue = new Set();
  if (compartidas.length && yoId) {
    const { data: asist } = await sb.from('class_attendance').select('session_id')
      .eq('student_id', yoId).in('session_id', compartidas.map((p) => p.class_session_id));
    fue = new Set((asist || []).map((a) => a.session_id));
  }
  lista.innerHTML = '';
  vacio.hidden = partidas.length > 0;
  partidas.forEach((p) => {
    const cs = p.class_sessions || {};
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'w-full text-left rounded-xl px-4 py-3 bg-white dark:bg-brand-900 shadow-sm hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 transition-shadow';
    btn.dataset.id = p.id;
    const t = document.createElement('span');
    t.className = 'block font-semibold text-brand-800 dark:text-white';
    t.textContent = cs.title || p.title || 'Clase sin nombre';
    const d = document.createElement('span');
    d.className = 'block text-xs text-brand-500 dark:text-brand-300';
    d.textContent = `${fechaCR(cs.started_at || p.created_at)} · ${p.move_count} ${p.move_count === 1 ? 'jugada' : 'jugadas'}`
      + (p.title && cs.title && p.title !== cs.title ? ` · ${p.title}` : '')
      + (compartidas.includes(p) && !fue.has(p.class_session_id) ? ' · 📤 Te la perdiste: tu profe la compartió' : '');
    btn.append(t, d);
    btn.addEventListener('click', () => abrir(p));
    li.appendChild(btn);
    lista.appendChild(li);
  });
  const pedida = new URLSearchParams(location.search).get('partida');
  const p = partidas.find((x) => x.id === pedida);
  if (p) abrir(p);
}

/* ---------------- La partida ---------------- */
function datosDe(p){
  const d = p.datos;
  if (d && Array.isArray(d.jugadas)) return { datos: d, sinDatos: false };
  // Una partida de antes de `datos`: la línea principal del PGN, sin más.
  const g = new Chess();
  g.load_pgn(p.pgn || '', { sloppy: true });
  const h = typeof g.header === 'function' ? g.header() : {};
  return { datos: { inicio: h.FEN || null, jugadas: g.history(), variantes: [], comentarios: {} }, sinDatos: true };
}

function abrir(p){
  const { datos, sinDatos } = datosDe(p);
  const raiz = PgnClase.arbol(datos.jugadas || [], datos.variantes || []);
  const inicio = datos.inicio || PgnClase.INICIAL;
  // Cada nodo sabe su padre y su posición: así se avanza y se retrocede sin
  // volver a jugar la partida entera en cada clic.
  const nodos = [];
  (function marcar(n, padre, fenPadre, enVariante){
    n.hijos.forEach((h, i) => {
      const g = new Chess(fenPadre);
      const mv = g.move(h.san, { sloppy: true });
      h.padre = padre;
      h.fen = mv ? g.fen() : fenPadre;
      h.ultima = mv ? { from: mv.from, to: mv.to } : null;
      h.jugada = mv || null;    // la jugada entera, para contarla en palabras al mirarla
      h.valida = !!mv;
      // Una alternativa (no el primer hijo) abre una variante, y todo lo que
      // cuelga de ella también es variante.
      h.enVariante = enVariante || i > 0;
      nodos.push(h);
      marcar(h, h, h.fen, h.enVariante);
    });
  })(raiz, null, inicio, false);
  raiz.fen = inicio;
  actual = { partida: p, raiz, nodos, comentarios: datos.comentarios || {}, sinDatos, inicio };
  orientacion = new Chess(inicio).turn();
  nodo = null;
  const cs = p.class_sessions || {};
  document.getElementById('visor-titulo').textContent = cs.title || p.title || 'Clase sin nombre';
  document.getElementById('visor-fecha').textContent = fechaCR(cs.started_at || p.created_at);
  document.getElementById('visor-sin-datos').hidden = !sinDatos;
  document.getElementById('visor').hidden = false;
  document.querySelectorAll('#lista-clases button').forEach((b) => b.setAttribute('aria-current', b.dataset.id === p.id ? 'true' : 'false'));
  pintarJugadas();
  preguntas = [];
  document.getElementById('visor-preguntas').hidden = true;
  mirar(null);
  /* Con la cuenta ciega el foco va al RECUADRO, no al título: del título al
     recuadro había veinte paradas de Tab (los botones de ⏮ ◀ ▶ ⏭, el tablero,
     la lista de jugadas), y quien no ve recorre la clase escribiendo. Lo que
     el título decía al recibir el foco lo dice el recuadro. */
  if (modoCiego() && comandos && comandos.input.checkVisibility()) {
    comandos.enfocar().decir(`${document.getElementById('visor-titulo').textContent}, ${document.getElementById('visor-fecha').textContent}. `
      + 'Estás en la posición de arranque: escribe «siguiente», o «jugada 5» para ir a la jugada 5 de las blancas.');
  } else {
    document.getElementById('visor-titulo').focus();
  }
  cargarPreguntas(p);
}

/* ---------------- Las preguntas de la clase ----------------
   Las que hizo el profe en ESA clase (questions.class_session_id), en el
   lugar de la partida donde se hicieron si esa posición está en ella. La
   respuesta del motor la da la base solo de preguntas ya cerradas
   (question_engine_answers_select_alumno): se muestra cuando el alumno la
   pide, después de pensarla. Lo que contestó él en clase, si estuvo. */
function clavePos(fen){ return String(fen || '').split(' ').slice(0, 4).join(' '); }
async function cargarPreguntas(p){
  const pedida = p.id;
  const { data: qs, error } = await sb.from('questions').select('id, fen, prompt, tipo, opciones, closed_at, created_at')
    .eq('class_session_id', p.class_session_id).order('created_at', { ascending: true });
  if (error || !actual || actual.partida.id !== pedida) return;
  const lista = (qs || []).filter((q) => q.fen);
  if (!lista.length) return;
  const ids = lista.map((q) => q.id);
  const [{ data: motor }, { data: mias }] = await Promise.all([
    sb.from('question_engine_answers').select('question_id, answer').in('question_id', ids),
    yoId ? sb.from('question_answers').select('question_id, moves, opcion, is_correct').eq('student_id', yoId).in('question_id', ids)
         : Promise.resolve({ data: [] }),
  ]);
  if (!actual || actual.partida.id !== pedida) return;
  const porFen = new Map();
  porFen.set(clavePos(actual.raiz.fen), null);
  actual.nodos.forEach((n) => { if (!porFen.has(clavePos(n.fen))) porFen.set(clavePos(n.fen), n); });
  preguntas = lista.map((q) => ({
    q,
    enPartida: porFen.has(clavePos(q.fen)),
    nodo: porFen.get(clavePos(q.fen)) || null,
    motor: ((motor || []).find((m) => m.question_id === q.id) || {}).answer || null,
    mia: (mias || []).find((a) => a.question_id === q.id) || null,
  }));
  pintarPreguntas();
  mirar(nodo);
}

function textoDePregunta(q){ return q.prompt || '¿Qué jugarías?'; }

function pintarPreguntas(){
  const caja = document.getElementById('visor-preguntas');
  const ol = document.getElementById('visor-preguntas-lista');
  ol.innerHTML = '';
  preguntas.forEach((x, i) => {
    const li = document.createElement('li');
    li.className = 'rounded-xl px-4 py-3 bg-white dark:bg-brand-900 shadow-sm';
    li.dataset.pregunta = x.q.id;
    const t = document.createElement('p');
    t.className = 'font-semibold text-brand-800 dark:text-white';
    t.textContent = (i + 1) + '. ' + textoDePregunta(x.q);   // lo escribió una persona
    li.appendChild(t);
    const ir = document.createElement('button');
    ir.type = 'button';
    ir.className = 'bctrl mt-1';
    ir.textContent = x.enPartida ? (x.nodo ? 'Ir a la posición (después de ' + nombreDe(x.nodo) + ')' : 'Ir a la posición (la de arranque)') : 'Ver la posición';
    ir.addEventListener('click', () => {
      if (x.enPartida) mirar(x.nodo);
      else mirarPosicion(x.q.fen, 'Posición de la pregunta ' + (i + 1));
    });
    li.appendChild(ir);
    if (x.mia) {
      const m = document.createElement('p');
      m.className = 'text-xs text-brand-600 dark:text-brand-300 mt-1';
      const dicho = x.q.tipo === 'opciones' && Array.isArray(x.q.opciones)
        ? (x.q.opciones[x.mia.opcion] != null ? String(x.q.opciones[x.mia.opcion]) : '—')
        : ((x.mia.moves || []).join(' ') || '—');
      m.textContent = 'Tu respuesta en clase: ' + dicho
        + (x.mia.is_correct === true ? ' · ✅ correcta' : x.mia.is_correct === false ? ' · ❌ a revisar' : '');
      li.appendChild(m);
    }
    if (x.motor && Array.isArray(x.motor.moves) && x.motor.moves.length) {
      const ver = document.createElement('button');
      ver.type = 'button';
      ver.className = 'bctrl mt-1';
      ver.textContent = 'Ver la respuesta del motor';
      ver.setAttribute('aria-expanded', 'false');
      const r = document.createElement('p');
      r.className = 'text-sm text-brand-800 dark:text-brand-100 mt-1';
      r.hidden = true;
      r.textContent = 'El motor juega: ' + x.motor.moves.join(' ');
      ver.addEventListener('click', () => {
        r.hidden = !r.hidden;
        ver.setAttribute('aria-expanded', r.hidden ? 'false' : 'true');
        ver.textContent = r.hidden ? 'Ver la respuesta del motor' : 'Ocultar la respuesta';
      });
      li.append(ver, r);
    }
    ol.appendChild(li);
  });
  caja.hidden = !preguntas.length;
}

// Una posición que no está en la partida (la pregunta salió de Táctica, por ejemplo).
function mirarPosicion(fen, texto){
  pintarTablero(fen, null);
  document.getElementById('visor-comentario').hidden = true;
  document.getElementById('visor-estado').textContent = texto;
  pintarAvisoDePregunta(fen);
  const aviso = document.getElementById('visor-pregunta');
  anunciar(texto + '.' + (aviso.hidden ? '' : ' ' + aviso.textContent));
}

function pintarAvisoDePregunta(fen){
  const aviso = document.getElementById('visor-pregunta');
  const x = preguntas.find((y) => clavePos(y.q.fen) === clavePos(fen));
  aviso.hidden = !x;
  aviso.textContent = x ? '❓ Acá tu profe preguntó: «' + textoDePregunta(x.q) + '». Piénsalo antes de seguir; la respuesta está abajo, en «Las preguntas de la clase».' : '';
}

/* Número de jugada de un camino, contando desde el arranque («30… h6»). */
function numeroDe(camino){
  const partes = String(actual.inicio).split(' ');
  let turno = partes[1] === 'b' ? 'b' : 'w';
  let numero = parseInt(partes[5], 10) > 0 ? parseInt(partes[5], 10) : 1;
  for (let i = 0; i < camino.length - 1; i++) {
    if (turno === 'b') numero++;
    turno = turno === 'w' ? 'b' : 'w';
  }
  return { numero, turno };
}
function nombreDe(n){
  const { numero, turno } = numeroDe(n.camino);
  const san = window.TiposReglas ? TiposReglas.sanEs(n.san) : n.san;
  return turno === 'w' ? `${numero}. ${san}` : `${numero}… ${san}`;
}

/* La lista de jugadas como se lee un PGN: la línea principal y, debajo de la
   jugada donde nace, cada variante entre paréntesis. Cada jugada es un botón. */
function pintarJugadas(){
  const caja = document.getElementById('visor-jugadas');
  caja.innerHTML = '';
  function boton(n){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'jugada';
    b.dataset.camino = PgnClase.clave(n.camino);
    const c = PgnClase.comentarioDe(actual.comentarios, n.camino);
    b.textContent = nombreDe(n) + (c && c.nag ? PgnClase.signoDe(c.nag) : '') + (c ? ' 💬' : '');
    if (c) b.setAttribute('aria-label', `${nombreDe(n)}, con comentario de tu profe`);
    b.addEventListener('click', () => mirar(n));
    n.boton = b;
    return b;
  }
  function linea(n, contenedor){
    // n y su continuación (primer hijo); las alternativas cuelgan debajo.
    let x = n;
    while (x) {
      contenedor.appendChild(boton(x));
      const padre = x.padre || actual.raiz;
      if (padre.hijos[0] === x && padre.hijos.length > 1) {
        padre.hijos.slice(1).forEach((alt) => {
          const v = document.createElement('span');
          v.className = 'variante';
          v.appendChild(document.createTextNode('('));
          linea(alt, v);
          v.appendChild(document.createTextNode(')'));
          contenedor.appendChild(v);
        });
      }
      x = x.hijos[0] || null;
    }
  }
  if (actual.raiz.hijos[0]) linea(actual.raiz.hijos[0], caja);
  else caja.textContent = 'Esta partida no tiene jugadas.';
}

/* ---------------- El tablero ---------------- */
function isLight(sq){ return ((sq.charCodeAt(0) - 97) + (parseInt(sq[1], 10) - 1)) % 2 === 1; }
/* La posición que se está mirando, como partida de chess.js: de ahí contestan
   el tablero accesible («o», «z», «m») y el recuadro («caballos», «qué hay en
   e4»). Se guarda al pintar, así vale también para una posición que no está en
   la partida (la de una pregunta que salió de Táctica). */
let posicionVista = null;
let teclado = null;       // js/tablero-accesible.js sobre #board
let comandos = null;      // js/cuadro-comandos.js en #visor-cmd
function pintarTablero(fen, ultima){
  const g = new Chess(fen);
  posicionVista = g;
  const board = document.getElementById('board');
  board.innerHTML = '';
  for (const sq of EjercicioTablero.casillas(orientacion)) {
    const el = document.createElement('div');
    el.className = 'sq ' + (isLight(sq) ? 'light' : 'dark');
    el.dataset.square = sq;
    if (ultima && (sq === ultima.from || sq === ultima.to)) el.classList.add('last-move');
    const pieza = g.get(sq);
    if (pieza) {
      const span = document.createElement('span');
      if (window.PiezaPreferida) PiezaPreferida.pintar(span, pieza.type, pieza.color);
      else { span.className = pieza.color === 'w' ? 'piece-white' : 'piece-black'; span.textContent = GLYPH[pieza.color][pieza.type]; }
      span.setAttribute('aria-hidden', 'true');
      el.appendChild(span);
    }
    board.appendChild(el);
  }
  // La lectura de la posición en texto es del Modo Adaptado, como en Mates:
  // para el resto es ruido debajo del tablero.
  const lectura = document.getElementById('position-readout');
  const adaptado = document.documentElement.classList.contains('adaptive-mode');
  lectura.style.display = adaptado && window.BlindNotation ? 'block' : 'none';
  if (adaptado && window.BlindNotation) lectura.innerHTML = BlindNotation.groupedReadoutHTML(g);
  montarAccesible();
}

/* El visor era una imagen (role="img") con 64 <div> sin nombre: para un lector
   de pantalla, la partida de la clase no existía más allá del «Jugada 2. Cf3»
   de abajo. Ahora es como el tablero de Estudio (js/ficha-render.js): cada
   casilla se nombra y el tablero es UNA parada de Tab (js/tablero-accesible.js),
   y al lado hay un recuadro donde se recorre la partida escribiendo y se le
   pregunta a la posición. Se montan una vez: el tablero es siempre el mismo
   nodo y lo que cambia es lo que tiene adentro. */
function montarAccesible(){
  if (!teclado && window.TableroAccesible) {
    teclado = TableroAccesible.montar(document.getElementById('board'), {
      nombre: 'Tablero de la clase', juego: () => posicionVista, cuadro: () => comandos && comandos.input,
    });
  }
  if (!comandos && window.CuadroComandos) {
    comandos = CuadroComandos.montar(document.getElementById('visor-cmd'), {
      etiqueta: 'Recorre la partida o pregunta por la posición',
      juego: () => posicionVista,
      tablero: () => teclado,
      // La posición entera no se dicta en cada paso: se lee la JUGADA
      // (#visor-anuncio) y la posición se pide con «posición».
      posicionViva: false,
      onEnviar: recorrerEscribiendo,
    });
    if (comandos) comandos.ayuda('Recorrer: «siguiente», «anterior», «inicio», «final», «jugada 5» (la de las blancas; «jugada 5 negras», la de las negras), «girar». Preguntar: «posición», «caballos», «qué hay en e4». Escribe «ayuda» para todo.');
  }
}

/* La línea que se está mirando, de punta a punta: el camino desde el arranque
   hasta la jugada actual y, de ahí, su continuación. Dentro de una variante es
   la variante; así «jugada 5» y «final» van a donde se ve en la lista. */
function lineaActual(){
  if (!actual) return [];
  const atras = [];
  for (let x = nodo; x; x = x.padre) atras.unshift(x);
  let x = nodo || actual.raiz;
  while (x.hijos[0]) { x = x.hijos[0]; atras.push(x); }
  return atras;
}

/* Recorrer ESCRIBIENDO, con las mismas palabras que Estudio y la preparación
   de rivales (VisorLinea.pasoPedido): quien está en el recuadro no tiene que
   salir de él y tabular hasta ▶ en cada jugada. Las preguntas («caballos»)
   ya las contestó js/comandos-tablero.js antes de llegar acá. */
function recorrerEscribiendo(texto, api){
  if (!actual) { api.decir('Primero elige una clase de la lista.'); return; }
  if (/^\s*girar( el tablero)?\s*$/i.test(texto)) {
    api.limpiar();
    document.getElementById('btn-girar').click();
    api.decir(orientacion === 'w' ? 'Ahora ves el tablero desde las blancas.' : 'Ahora ves el tablero desde las negras.');
    return;
  }
  const linea = lineaActual();
  const indice = nodo ? linea.indexOf(nodo) + 1 : 0;
  // La partida se anuncia con su número («Jugada 2 de las negras»): «jugada 2»
  // es la de las blancas, contada desde la FEN de arranque de la clase.
  const partes = String(actual.inicio).split(' ');
  const n = window.VisorLinea ? VisorLinea.pasoPedido(texto, indice, linea.length, {
    primera: parseInt(partes[5], 10) || 1, empiezanNegras: partes[1] === 'b',
  }) : null;
  if (n === null) { api.decir('No entendí «' + texto.trim() + '». Escribe «siguiente», «anterior», «jugada 5», o una pregunta como «caballos». Escribe «ayuda» para la lista.'); return; }
  if (n < 0) { api.decir('Ya estás en la posición de arranque.'); return; }
  if (n > linea.length) { api.decir('Ya estás en la última jugada de esta línea.'); return; }
  api.limpiar().decir('');
  mirar(n === 0 ? null : linea[n - 1]);
}

/* Qué se lee solo en cada paso: la jugada CONTADA, el comentario del profe y
   el aviso de pregunta. Vaciar y repoblar con un retraso porque una región
   viva no habla si el texto no cambió (volver a la misma jugada). */
function anunciar(texto){
  const a = document.getElementById('visor-anuncio');
  if (!a) return;
  a.textContent = '';
  window.setTimeout(() => { a.textContent = texto; }, 50);
}

function mirar(n){
  nodo = n;
  const fen = n ? n.fen : actual.raiz.fen;
  pintarTablero(fen, n ? n.ultima : null);
  actual.nodos.forEach((x) => { if (x.boton) x.boton.classList.toggle('actual', x === n); if (x.boton) x.boton.setAttribute('aria-current', x === n ? 'true' : 'false'); });
  if (n && n.boton) n.boton.scrollIntoView({ block: 'nearest' });
  const c = n ? PgnClase.comentarioDe(actual.comentarios, n.camino) : null;
  const caja = document.getElementById('visor-comentario');
  // textContent: el comentario lo escribió una persona.
  caja.textContent = c
    ? `📝 Tu profe comentó ${nombreDe(n)}${c.nag ? PgnClase.signoDe(c.nag) + ' (' + PgnClase.nombreDelSigno(c.nag).toLowerCase() + ')' : ''}${c.texto ? ': ' + c.texto : '.'}`
    : '';
  caja.hidden = !c;
  const estado = document.getElementById('visor-estado');
  estado.textContent = n ? `Jugada ${nombreDe(n)}${n.enVariante ? ' (variante)' : ''}` : 'Posición de arranque';
  pintarAvisoDePregunta(fen);
  /* Dicho, la jugada va CONTADA y sin la notación: «Cf3» el lector lo deletrea
     («C, f, 3»), y quien no ve el tablero necesita saber qué pieza fue de dónde
     a dónde. El «Jugada 2. Cf3» se queda escrito en pantalla. */
  let dicho = estado.textContent + '.';
  if (n && n.jugada && window.VisorLinea) {
    const { numero, turno } = numeroDe(n.camino);
    dicho = 'Jugada ' + numero + (turno === 'b' ? ' de las negras' : '') + (n.enVariante ? ', en una variante' : '') + ': '
      + VisorLinea.jugadaContada(n.jugada).replace(/^./, (x) => x.toLowerCase());
  }
  const aviso = document.getElementById('visor-pregunta');
  dicho += (c ? ' ' + caja.textContent : '') + (aviso.hidden ? '' : ' ' + aviso.textContent);
  anunciar(dicho);
  if (window.BlindNotation) BlindNotation.speak(dicho);
}
function anterior(){ if (nodo) mirar(nodo.padre); }
function siguiente(){ const hijos = (nodo || actual.raiz).hijos; if (hijos[0]) mirar(hijos[0]); }
function alPrincipio(){ mirar(null); }
function alFinal(){ let x = nodo || actual.raiz; while (x.hijos[0]) x = x.hijos[0]; mirar(x === actual.raiz ? null : x); }

document.getElementById('btn-inicio').addEventListener('click', alPrincipio);
document.getElementById('btn-anterior').addEventListener('click', anterior);
document.getElementById('btn-siguiente').addEventListener('click', siguiente);
document.getElementById('btn-final').addEventListener('click', alFinal);
document.getElementById('btn-girar').addEventListener('click', () => {
  orientacion = orientacion === 'w' ? 'b' : 'w';
  mirar(nodo);
});
// Las flechas recorren la partida, salvo mientras se escribe en algún campo
// o se anda por un tablero: ahí las flechas mueven de casilla en casilla
// (js/tablero-accesible.js), y robárselas dejaba el tablero sin poder mirarse
// —cada flecha cambiaba de jugada en vez de pasar a la casilla de al lado—.
document.addEventListener('keydown', (e) => {
  if (!actual || document.getElementById('visor').hidden) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
  if (e.target && e.target.closest && e.target.closest('#board, #repaso-board, .cc-caja, [role="application"]')) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); anterior(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); siguiente(); }
  else if (e.key === 'Home') { e.preventDefault(); alPrincipio(); }
  else if (e.key === 'End') { e.preventDefault(); alFinal(); }
});

/* ---------------- El repaso personal (?repaso=<clase>) ----------------
   Las preguntas de jugada de esa clase que a este alumno no le salieron
   (la regla es de js/repaso-clase.js, la misma con la que el profe mandó la
   tarea). Se resuelven en el tablero, tocando o escribiendo; la primera
   jugada se compara con la del motor (o un mate cualquiera). Al resolverlas
   todas, el renglón de la tarea se marca solo (tarea_items.completada_at: lo
   único que el alumno puede escribir de su tarea). */
const repaso = { claseId: null, tareaId: null, lista: [], i: 0, juego: null, sel: null, ultima: null, resueltas: new Set(), comandos: null, teclado: null,
  // «Lo que vuelve» (?vuelven=1): la cola de RepasoFallados, no una clase.
  vuelven: false, vistas: new Set(), conError: new Set() };

/* ---------------- Lo que vuelve ----------------
   Una pregunta resuelta DESPUÉS de ver la respuesta no queda sabida: jugarla
   recién vista no prueba nada. Entra a la cola del repaso espaciado (la
   misma de Entrenamiento, js/repaso-fallados.js, que viaja con la cuenta) y
   vuelve en una semana. Ahí, limpia avanza; con error vuelve hoy; y si otra
   vez mira la respuesta, otra semana. La pregunta va guardada en la ficha
   (posición, jugada, texto): la clase ya pasó. */
const VUELVE_EN_DIAS = 7;
const COLA_CLASE = window.RepasoFallados ? RepasoFallados.CLAVES.clase : null;

function pendientesQueVuelven(){
  if (!COLA_CLASE) return [];
  const estado = RepasoFallados.leer(COLA_CLASE);
  return RepasoFallados.pendientes(COLA_CLASE, (id) => estado[id] && estado[id].fen && estado[id].jugada)
    .map((id) => ({ pregunta: { id, fen: estado[id].fen, prompt: estado[id].prompt || null }, jugada: estado[id].jugada, clase: estado[id].clase || null }));
}

function pintarAvisoDeLoQueVuelve(){
  const n = pendientesQueVuelven().length;
  const aviso = document.getElementById('vuelven-aviso');
  aviso.hidden = !n || repaso.vuelven;
  document.getElementById('vuelven-enlace').textContent = n === 1
    ? '🔁 Te vuelve 1 pregunta de tus clases'
    : '🔁 Te vuelven ' + n + ' preguntas de tus clases';
}

function anotarQueVuelve(x){
  if (!COLA_CLASE) return;
  RepasoFallados.volverEn(COLA_CLASE, x.pregunta.id, VUELVE_EN_DIAS, {
    fen: x.pregunta.fen, jugada: x.jugada, prompt: x.pregunta.prompt || null, clase: x.clase || repaso.tituloClase || null,
  });
}

async function abrirLoQueVuelve(){
  repaso.vuelven = true;
  const caja = document.getElementById('repaso');
  caja.hidden = false;
  const titulo = document.getElementById('repaso-titulo');
  titulo.firstChild.textContent = '🔁 ';
  titulo.lastChild.textContent = 'Lo que vuelve de tus clases';
  repaso.lista = pendientesQueVuelven();
  const intro = document.getElementById('repaso-intro');
  if (!repaso.lista.length) { intro.textContent = 'Hoy no te vuelve ninguna pregunta de tus clases. 🎉'; return; }
  intro.textContent = (repaso.lista.length === 1 ? 'Una pregunta de tus clases vuelve' : repaso.lista.length + ' preguntas de tus clases vuelven')
    + ': en tu repaso viste la respuesta. Resuélvelas sin mirarla.';
  montarTableroDelRepaso();
}

async function abrirRepaso(claseId){
  repaso.claseId = claseId;
  repaso.tareaId = new URLSearchParams(location.search).get('tarea');
  const caja = document.getElementById('repaso');
  const intro = document.getElementById('repaso-intro');
  caja.hidden = false;
  intro.textContent = 'Buscando las preguntas de la clase…';
  const { data: qs, error } = await sb.from('questions').select('id, fen, prompt, tipo, para_alumno, closed_at, created_at').eq('class_session_id', claseId);
  if (error) { intro.textContent = 'No se pudo cargar tu repaso. Intenta recargar la página.'; return; }
  const ids = (qs || []).map((q) => q.id);
  const [{ data: mias }, { data: motor }, { data: clase }] = await Promise.all([
    ids.length ? sb.from('question_answers').select('question_id, student_id, moves, is_correct').eq('student_id', yoId).in('question_id', ids) : Promise.resolve({ data: [] }),
    ids.length ? sb.from('question_engine_answers').select('question_id, answer').in('question_id', ids) : Promise.resolve({ data: [] }),
    sb.from('class_sessions').select('title, started_at').eq('id', claseId).maybeSingle(),
  ]);
  repaso.lista = RepasoClase.pendientes(qs, mias, motor, yoId);
  const cuando = clase && clase.started_at ? ' del ' + fechaCR(clase.started_at) : '';
  document.getElementById('repaso-titulo').lastChild.textContent = 'Tu repaso de la clase' + cuando;
  if (!repaso.lista.length) {
    intro.textContent = 'No te quedó ninguna pregunta pendiente de esta clase. 🎉';
    await marcarTareaHecha();
    return;
  }
  intro.textContent = repaso.lista.length === 1
    ? 'Una pregunta de la clase no te salió: resuélvela otra vez en el tablero.'
    : repaso.lista.length + ' preguntas de la clase no te salieron: resuélvelas otra vez en el tablero.';
  repaso.tituloClase = ((clase && clase.title) || 'La clase') + cuando;
  montarTableroDelRepaso();
}

function montarTableroDelRepaso(){
  document.getElementById('repaso-ejercicio').hidden = false;
  if (!repaso.comandos && window.CuadroComandos) {
    repaso.comandos = CuadroComandos.montar(document.getElementById('repaso-cmd'), {
      etiqueta: 'Escribe tu jugada, o una pregunta sobre la posición',
      juego: () => repaso.juego,
      tablero: () => repaso.teclado,
      onEnviar: (texto, api) => {
        if (!repaso.juego || repaso.sel === 'hecha') { api.decir('Toca «Intentarlo otra vez» o pasa a la siguiente.'); return; }
        const mv = window.ComandosTablero ? ComandosTablero.jugadaEscrita(repaso.juego, texto) : null;
        if (!mv) { api.decir('"' + texto.trim() + '" no es una jugada legal en esta posición.'); return; }
        api.limpiar();
        jugarRepaso(mv.from, mv.to, mv.promotion);
      },
    });
  }
  if (!repaso.teclado && window.TableroAccesible) {
    repaso.teclado = TableroAccesible.montar(document.getElementById('repaso-board'), { nombre: 'Tablero del repaso', juego: () => repaso.juego });
  }
  mostrarPreguntaDelRepaso(0);
  // Igual que al abrir una clase: con la cuenta ciega, al recuadro.
  if (modoCiego() && repaso.comandos && repaso.comandos.input.checkVisibility()) repaso.comandos.enfocar();
  else document.getElementById('repaso-titulo').focus();
}

function modoCiego(){ return document.documentElement.classList.contains('modo-ciego'); }

function mostrarPreguntaDelRepaso(i){
  repaso.i = i;
  const x = repaso.lista[i];
  repaso.juego = new Chess(x.pregunta.fen);
  repaso.sel = null;
  repaso.ultima = null;
  document.getElementById('repaso-progreso').textContent = 'Pregunta ' + (i + 1) + ' de ' + repaso.lista.length;
  document.getElementById('repaso-pregunta').textContent = textoDePregunta(x.pregunta)   // la escribió una persona
    + (repaso.vuelven && x.clase ? ' (' + x.clase + ')' : '');
  document.getElementById('repaso-turno').textContent = repaso.juego.turn() === 'w' ? 'Juegan ⚪ blancas.' : 'Juegan ⚫ negras.';
  document.getElementById('repaso-msg').textContent = '';
  document.getElementById('repaso-otra-btn').hidden = true;
  document.getElementById('repaso-siguiente-btn').hidden = true;
  document.getElementById('repaso-ver-btn').hidden = false;
  pintarRepaso();
}

function pintarRepaso(marcas){
  const t = document.getElementById('repaso-board');
  EjercicioTablero.dibujar(t, {
    juego: repaso.juego, orientacion: new Chess(repaso.lista[repaso.i].pregunta.fen).turn(),
    seleccionada: typeof repaso.sel === 'string' && repaso.sel !== 'hecha' ? repaso.sel : null,
    ultima: repaso.ultima, marcas: marcas || null,
    alTocar: (sq) => tocarRepaso(sq),
  });
  if (typeof repaso.sel === 'string' && repaso.sel !== 'hecha') EjercicioTablero.marcarDestinos(t, repaso.juego, repaso.sel);
  if (repaso.comandos) repaso.comandos.posicion(repaso.juego);
}

function tocarRepaso(sq){
  if (repaso.sel === 'hecha') return;
  const p = repaso.juego.get(sq);
  if (repaso.sel && repaso.sel !== sq) {
    const esLegal = repaso.juego.moves({ square: repaso.sel, verbose: true }).some((m) => m.to === sq);
    if (esLegal) { EjercicioTablero.jugarCoronando(repaso.juego, repaso.sel, sq, (pieza) => jugarRepaso(repaso.sel, sq, pieza)); return; }
  }
  repaso.sel = p && p.color === repaso.juego.turn() ? sq : null;
  pintarRepaso();
}

function jugarRepaso(desde, hasta, pieza){
  const x = repaso.lista[repaso.i];
  const mv = repaso.juego.move({ from: desde, to: hasta, promotion: pieza || 'q' });
  if (!mv) return;
  repaso.sel = 'hecha';
  repaso.ultima = { from: mv.from, to: mv.to };
  const bien = EjercicioTablero.esAcierto(repaso.juego, mv, x.jugada) || RepasoClase.igualJugada(x.pregunta.fen, mv.san, x.jugada);
  const msg = document.getElementById('repaso-msg');
  if (bien) {
    repaso.resueltas.add(x.pregunta.id);
    // Lo que vuelve: limpia avanza en la cola; con error, vuelve hoy. Si antes
    // vio la respuesta, ya quedó para dentro de una semana.
    if (repaso.vuelven && COLA_CLASE && !repaso.vistas.has(x.pregunta.id)) {
      RepasoFallados.anotar(COLA_CLASE, x.pregunta.id, repaso.conError.has(x.pregunta.id), false);
    }
    msg.textContent = '✅ ¡Bien! ' + EjercicioTablero.jugadaEs(mv.san) + ' es la jugada.';
    document.getElementById('repaso-ver-btn').hidden = true;
    terminarPreguntaDelRepaso();
  } else {
    repaso.conError.add(x.pregunta.id);
    msg.textContent = '❌ ' + EjercicioTablero.jugadaEs(mv.san) + ' no es la mejor. Inténtalo otra vez.';
    document.getElementById('repaso-otra-btn').hidden = false;
  }
  pintarRepaso();
}

function terminarPreguntaDelRepaso(){
  const quedan = repaso.lista.some((x) => !repaso.resueltas.has(x.pregunta.id));
  document.getElementById('repaso-otra-btn').hidden = true;
  document.getElementById('repaso-siguiente-btn').hidden = !quedan;
  if (!quedan) {
    const fin = document.getElementById('repaso-fin');
    fin.hidden = false;
    fin.textContent = repaso.vuelven
      ? (repaso.conError.size
        ? '🎉 Resolviste todas. Las que tuvieron un error te vuelven a salir hoy mismo, para que queden.'
        : '🎉 Listo por hoy: resolviste todas las preguntas que te volvían.')
      : '🎉 Terminaste tu repaso: resolviste todas las preguntas que te habían quedado.';
    if (!repaso.vuelven) marcarTareaHecha();
  }
}

// El renglón de la tarea que trajo hasta acá (o, sin ?tarea=, el de este repaso).
async function marcarTareaHecha(){
  let q = sb.from('tarea_items').update({ completada_at: new Date().toISOString() })
    .eq('material_href', RepasoClase.href(repaso.claseId)).is('completada_at', null);
  if (repaso.tareaId) q = q.eq('tarea_id', repaso.tareaId);
  const { error } = await q;
  if (error) console.error(error);
}

document.getElementById('repaso-otra-btn').addEventListener('click', () => {
  const x = repaso.lista[repaso.i];
  repaso.juego = new Chess(x.pregunta.fen);
  repaso.sel = null; repaso.ultima = null;
  document.getElementById('repaso-msg').textContent = '';
  document.getElementById('repaso-otra-btn').hidden = true;
  pintarRepaso();
});
document.getElementById('repaso-ver-btn').addEventListener('click', () => {
  const x = repaso.lista[repaso.i];
  const mv = RepasoClase.jugadaDe(x.pregunta.fen, x.jugada);
  // Se ve jugada en el tablero; no cuenta como resuelta.
  repaso.juego = new Chess(x.pregunta.fen);
  if (mv) repaso.juego.move(mv.san);
  repaso.sel = 'hecha';
  repaso.ultima = mv ? { from: mv.from, to: mv.to } : null;
  repaso.vistas.add(x.pregunta.id);
  anotarQueVuelve(x);
  document.getElementById('repaso-msg').textContent = 'La respuesta: ' + EjercicioTablero.jugadaEs(mv ? mv.san : x.jugada)
    + '. Esta no cuenta como resuelta: vuelve a ella después. Y como la viste, en una semana te vuelve a salir.';
  document.getElementById('repaso-ver-btn').hidden = true;
  document.getElementById('repaso-otra-btn').hidden = false;
  document.getElementById('repaso-siguiente-btn').hidden = repaso.lista.length < 2;
  pintarRepaso();
});
document.getElementById('repaso-siguiente-btn').addEventListener('click', () => {
  // La siguiente sin resolver, dando la vuelta.
  for (let k = 1; k <= repaso.lista.length; k++) {
    const j = (repaso.i + k) % repaso.lista.length;
    if (!repaso.resueltas.has(repaso.lista[j].pregunta.id)) { mostrarPreguntaDelRepaso(j); return; }
  }
});

/* ---------------- Arranque ---------------- */
async function requireLoginThenGate(){
  let hay = false;
  try { const { data } = await sb.auth.getSession(); hay = !!(data && data.session); yoId = hay ? data.session.user.id : null; } catch (e) { hay = false; }
  if (!hay) {
    gateChecking.textContent = 'Necesitas iniciar sesión para repasar tus clases. Redirigiendo a iniciar sesión…';
    window.location.href = 'login.html?next=' + encodeURIComponent(NEXT_PATH);
    return;
  }
  gate.classList.add('hidden');
  app.classList.remove('hidden');
  cargarLista();
  // La cola de lo que vuelve viaja con la cuenta: se trae antes de contarla.
  if (window.ProgresoUsuario) { try { await ProgresoUsuario.init(); } catch (e) {} }
  const params = new URLSearchParams(location.search);
  const claseDelRepaso = params.get('repaso');
  if (claseDelRepaso) abrirRepaso(claseDelRepaso);
  else if (params.get('vuelven') === '1') abrirLoQueVuelve();
  pintarAvisoDeLoQueVuelve();
}
requireLoginThenGate();

if (window.Coordenadas) Coordenadas.aplicar(document.getElementById('board'));
