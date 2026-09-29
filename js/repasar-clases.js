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

/* ---------------- La lista ---------------- */
function fechaCR(iso){
  try { return new Intl.DateTimeFormat('es-CR', { timeZone: 'America/Costa_Rica', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)); }
  catch (e) { return ''; }
}
async function cargarLista(){
  const lista = document.getElementById('lista-clases');
  const vacio = document.getElementById('lista-vacia');
  const { data, error } = await sb.from('saved_games')
    .select('id, title, created_at, move_count, pgn, datos, class_session_id, class_sessions(title, started_at)')
    .not('class_session_id', 'is', null)
    .order('created_at', { ascending: false })
    .range(0, 199);
  if (error) {
    vacio.textContent = 'No se pudieron cargar tus clases. Intenta recargar la página.';
    vacio.hidden = false;
    return;
  }
  partidas = data || [];
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
      + (p.title && cs.title && p.title !== cs.title ? ` · ${p.title}` : '');
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
  mirar(null);
  document.getElementById('visor-titulo').focus();
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
function pintarTablero(fen, ultima){
  const g = new Chess(fen);
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
  if (window.BlindNotation) BlindNotation.speak(estado.textContent + (c ? '. ' + caja.textContent : ''));
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
// Las flechas recorren la partida, salvo mientras se escribe en algún campo.
document.addEventListener('keydown', (e) => {
  if (!actual || document.getElementById('visor').hidden) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); anterior(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); siguiente(); }
  else if (e.key === 'Home') { e.preventDefault(); alPrincipio(); }
  else if (e.key === 'End') { e.preventDefault(); alFinal(); }
});

/* ---------------- Arranque ---------------- */
async function requireLoginThenGate(){
  let hay = false;
  try { const { data } = await sb.auth.getSession(); hay = !!(data && data.session); } catch (e) { hay = false; }
  if (!hay) {
    gateChecking.textContent = 'Necesitas iniciar sesión para repasar tus clases. Redirigiendo a iniciar sesión…';
    window.location.href = 'login.html?next=' + encodeURIComponent(NEXT_PATH);
    return;
  }
  gate.classList.add('hidden');
  app.classList.remove('hidden');
  cargarLista();
}
requireLoginThenGate();

if (window.Coordenadas) Coordenadas.aplicar(document.getElementById('board'));
