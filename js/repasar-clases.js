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

/* ---------------- La grabación de la clase ----------------
   Si la llamada de la clase se grabó, sus partes (una cada 5 minutos) en
   orden, cada una con su reproductor. La RLS de clase_grabaciones decide quién
   las ve; las direcciones firmadas valen una hora. */
let grabacionPedida = 0;
async function cargarGrabacion(claseId){
  const caja = document.getElementById('visor-grabacion');
  const lista = document.getElementById('visor-grabacion-partes');
  const pedido = ++grabacionPedida;
  fenSeguida = null;
  caja.hidden = true;
  lista.textContent = '';
  if (!claseId) return;
  // Sin grabación (o si falla) el visor sigue igual: la grabación es un extra.
  let data, firmas;
  try {
    const r = await sb.from('clase_grabaciones').select('id, ruta, parte, segundos, marcas, texto, profesor_id')
      .eq('class_session_id', claseId).order('parte', { ascending: true }).range(0, 199);
    if (pedido !== grabacionPedida || r.error || !r.data || !r.data.length) return;
    data = r.data;
    const f = await sb.storage.from('clase-grabaciones').createSignedUrls(data.map((g) => g.ruta), 3600);
    firmas = f.data;
  } catch (e) { console.warn('La grabación de la clase no se pudo cargar:', e); return; }
  if (pedido !== grabacionPedida) return;
  const url = new Map((firmas || []).filter((f) => f.signedUrl).map((f) => [f.path, f.signedUrl]));
  data.forEach((g, i) => {
    if (!url.has(g.ruta)) return;
    const li = document.createElement('li');
    const id = 'grabacion-parte-' + i;
    const etiqueta = document.createElement('label');
    etiqueta.htmlFor = id;
    etiqueta.className = 'block text-xs font-semibold text-brand-600 dark:text-brand-300';
    const min = Math.max(1, Math.round((g.segundos || 0) / 60));
    etiqueta.textContent = (data.length > 1 ? `Parte ${i + 1} de ${data.length}` : 'La clase entera') + ` · ${min} ${min === 1 ? 'minuto' : 'minutos'}`;
    const audio = document.createElement('audio');
    audio.id = id;
    audio.controls = true;
    audio.preload = 'none';
    audio.className = 'w-full mt-1';
    audio.src = url.get(g.ruta);
    // El tablero sigue a la grabación, si la parte trae las posiciones.
    const marcas = Array.isArray(g.marcas) ? g.marcas.filter((m) => m && typeof m.fen === 'string') : [];
    if (marcas.length) {
      const seguir = () => seguirGrabacion(marcas, audio.currentTime);
      audio.addEventListener('timeupdate', seguir);
      audio.addEventListener('seeked', seguir);
      audio.addEventListener('play', seguir);
    }
    const temas = temasDeLaParte(g.marcas, audio, i);
    // Al terminar una parte sigue la siguiente.
    audio.addEventListener('ended', () => {
      const sig = document.getElementById('grabacion-parte-' + (i + 1));
      if (sig) sig.play().catch(() => {});
    });
    li.append(etiqueta, audio);
    if (temas) li.appendChild(temas);
    li.appendChild(cajaDeTexto(g, url.get(g.ruta), i));
    lista.appendChild(li);
  });
  caja.hidden = !lista.children.length;
  const conMarcas = data.some((g) => Array.isArray(g.marcas) && g.marcas.length);
  document.getElementById('visor-grabacion-sigue').hidden = !conMarcas;
  document.getElementById('visor-grabacion-decir-caja').hidden = !conMarcas;
}

/* Cuánto habló cada alumno en la llamada de la clase (lo midió la página del
   profe: llamada_participacion). Al alumno, solo lo suyo (la RLS no le da lo
   de los demás); al profe y a administración, todos, del que más habló al que
   menos, y quiénes estuvieron en la clase y no hablaron. Sin llamada no se ve. */
let habladoPedido = 0;
function textoDeSegundos(s){
  const m = Math.floor((s || 0) / 60);
  return m < 1 ? 'menos de un minuto' : m + (m === 1 ? ' minuto' : ' minutos');
}
async function cargarHablado(claseId){
  const caja = document.getElementById('visor-hablado');
  const lista = document.getElementById('visor-hablado-lista');
  const callados = document.getElementById('visor-hablado-callados');
  const pedido = ++habladoPedido;
  caja.hidden = true;
  lista.textContent = '';
  callados.hidden = true;
  if (!claseId) return;
  const [h, a] = await Promise.all([
    sb.from('llamada_participacion').select('persona_id, segundos').eq('class_session_id', claseId).order('segundos', { ascending: false }).range(0, 199),
    sb.from('class_attendance').select('student_id, profiles(full_name)').eq('session_id', claseId).range(0, 199),
  ]);
  if (pedido !== habladoPedido || h.error || !h.data || !h.data.length) return;
  const asistentes = a.error ? [] : (a.data || []);
  const nombre = new Map(asistentes.map((x) => [x.student_id, (x.profiles && x.profiles.full_name) || 'Alguien']));
  const soyAlumno = nombre.has(yoId);
  const filas = soyAlumno ? h.data.filter((f) => f.persona_id === yoId) : h.data;
  if (!filas.length) return;
  for (const f of filas) {
    const li = document.createElement('li');
    li.textContent = soyAlumno ? 'Hablaste ' + textoDeSegundos(f.segundos) + '.'
      : (nombre.get(f.persona_id) || 'Alguien') + ': ' + textoDeSegundos(f.segundos);   // nombres: textContent
    lista.appendChild(li);
  }
  if (!soyAlumno) {
    const hablaron = new Set(h.data.map((f) => f.persona_id));
    const nada = asistentes.filter((x) => !hablaron.has(x.student_id)).map((x) => nombre.get(x.student_id));
    callados.hidden = !nada.length;
    callados.textContent = nada.length ? 'No hablaron: ' + nada.join(', ') + '.' : '';
  }
  caja.hidden = false;
}

/* Los temas de una parte, como capítulos: los anotó sola la página del profe
   al grabar, cada vez que la clase cambió de diapositiva, de práctica, de
   calentamiento, de tiempo para pensar o de posición (marcas con `tema`).
   Cada uno es un botón que lleva el audio a ese minuto y lo hace sonar; el
   que está sonando se marca (aria-current y «▶», no solo el color). Las
   grabaciones de antes no tienen temas y no muestran nada. */
function minutoYSegundo(s){
  const t = Math.max(0, Math.floor(s || 0));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}
function temasDeLaParte(marcas, audio, i){
  const temas = Array.isArray(marcas)
    ? marcas.filter((m) => m && typeof m.tema === 'string' && m.tema.trim() && isFinite(m.s)) : [];
  if (!temas.length) return null;
  const det = document.createElement('details');
  det.className = 'mt-1';
  det.open = temas.length <= 6;
  const sum = document.createElement('summary');
  sum.className = 'cursor-pointer text-xs font-semibold text-brand-700 dark:text-brand-200 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400';
  sum.textContent = `Temas de esta parte (${temas.length})`;
  const ol = document.createElement('ol');
  ol.className = 'mt-1 space-y-1';
  ol.id = 'grabacion-temas-' + i;
  const botones = temas.map((m) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'text-left text-sm text-brand-800 dark:text-brand-100 underline-offset-2 hover:underline rounded px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400';
    const quien = document.createElement('span');
    quien.className = 'grabacion-tema-marca';
    quien.setAttribute('aria-hidden', 'true');
    const texto = document.createElement('span');
    texto.textContent = minutoYSegundo(m.s) + ' · ' + m.tema;   // lo escribió el profe (un título): textContent
    b.append(quien, texto);
    b.addEventListener('click', () => {
      audio.currentTime = Math.max(0, m.s);
      audio.play().catch(() => {});
    });
    li.appendChild(b);
    ol.appendChild(li);
    return { m, b, quien };
  });
  const marcar = () => {
    let actualTema = null;
    for (const x of botones) { if (x.m.s <= audio.currentTime + 0.05) actualTema = x; else break; }
    for (const x of botones) {
      const es = x === actualTema && audio.currentTime > 0;
      x.b.setAttribute('aria-current', es ? 'true' : 'false');
      x.quien.textContent = es ? '▶ ' : '';
      x.b.classList.toggle('font-semibold', es);
    }
  };
  audio.addEventListener('timeupdate', marcar);
  audio.addEventListener('seeked', marcar);
  det.append(sum, ol);
  return det;
}

/* Lo que se dijo en una parte, en texto. Si ya está guardado, se muestra
   plegado. Si no, «Pasar a texto» lo saca Whisper EN ESTA computadora
   (js/reporte-transcribir.js, el mismo de Reportes: el audio no sale de acá).
   Lo guarda solo el profe de la clase (guardar_texto_grabacion); al alumno le
   queda en su pantalla. */
function textoPlegado(texto, i){
  const det = document.createElement('details');
  det.className = 'mt-1';
  const sum = document.createElement('summary');
  sum.className = 'cursor-pointer text-xs font-semibold text-brand-700 dark:text-brand-200 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400';
  sum.textContent = 'Lo que se dijo en esta parte, en texto';
  const p = document.createElement('p');
  p.id = 'grabacion-texto-' + i;
  p.className = 'mt-1 text-sm text-brand-800 dark:text-brand-100 whitespace-pre-wrap max-h-64 overflow-y-auto';
  p.tabIndex = 0;
  p.textContent = texto;   // lo sacó un modelo de una voz: va por textContent
  det.append(sum, p);
  return det;
}
function cajaDeTexto(g, urlAudio, i){
  const caja = document.createElement('div');
  if (g.texto) { caja.appendChild(textoPlegado(g.texto, i)); return caja; }
  if (!window.ReporteTranscribir || !ReporteTranscribir.hayCómo()) return caja;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bctrl mt-1';
  btn.textContent = '📝 Pasar a texto';
  const estado = document.createElement('p');
  estado.className = 'text-xs text-brand-600 dark:text-brand-300 mt-1';
  estado.setAttribute('role', 'status');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const resp = await fetch(urlAudio);
      if (!resp.ok) throw new Error('No se pudo bajar la grabación.');
      const texto = (await ReporteTranscribir.transcribir(await resp.blob(), (a) => { estado.textContent = a.detalle || ''; }) || '').trim();
      if (!texto) { estado.textContent = 'No se entendió nada en esta parte.'; btn.disabled = false; return; }
      btn.remove();
      caja.insertBefore(textoPlegado(texto, i), estado);
      if (g.profesor_id === yoId) {
        const { error } = await sb.rpc('guardar_texto_grabacion', { p_id: g.id, p_texto: texto });
        estado.textContent = error ? 'Se pasó a texto, pero no se pudo guardar: ' + error.message
          : 'Listo: el texto quedó guardado y tus alumnos ya lo pueden leer.';
      } else {
        estado.textContent = 'Listo: el texto queda solo en tu pantalla.';
      }
    } catch (e) {
      estado.textContent = 'No se pudo pasar a texto: ' + (e.message || e);
      btn.disabled = false;
    }
  });
  caja.append(btn, estado);
  return caja;
}

/* La posición de ese momento de la grabación: la última marca que ya pasó.
   Si es una posición de la partida de la clase, se mira ESE nodo (y se marca
   en la lista de jugadas); si no (el profe armó otra cosa), se pinta igual.
   Se dice solo si se marcó «Decir las jugadas mientras escucho»: con lector de
   pantalla se oiría encima de la voz del profe. */
let fenSeguida = null;
function seguirGrabacion(marcas, t){
  if (!actual) return;
  let m = null;
  for (const x of marcas) { if ((x.s || 0) <= t + 0.05) m = x; else break; }
  if (!m || m.fen === fenSeguida) return;
  fenSeguida = m.fen;
  const n = actual.nodos.find((x) => x.valida && clavePos(x.fen) === clavePos(m.fen))
    || (clavePos(actual.raiz.fen) === clavePos(m.fen) ? null : undefined);
  const decir = document.getElementById('visor-grabacion-decir').checked;
  if (n !== undefined) {
    if (decir) { mirar(n); return; }
    // Callado: lo mismo que mirar(), sin anunciar.
    nodo = n;
    pintarTablero(n ? n.fen : actual.raiz.fen, n ? n.ultima : null);
    actual.nodos.forEach((x) => { if (x.boton) { x.boton.classList.toggle('actual', x === n); x.boton.setAttribute('aria-current', x === n ? 'true' : 'false'); } });
    document.getElementById('visor-estado').textContent = n ? `Jugada ${nombreDe(n)}${n.enVariante ? ' (variante)' : ''}` : 'Posición de arranque';
    pintarAvisoDePregunta(n ? n.fen : actual.raiz.fen);
    return;
  }
  const texto = 'Posición de ese momento de la clase';
  if (decir) { mirarPosicion(m.fen, texto); return; }
  pintarTablero(m.fen, null);
  document.getElementById('visor-estado').textContent = texto;
}

function abrir(p){
  // Otra clase: la práctica contra el motor era de la posición de la anterior.
  terminarPractica(false);
  cargarGrabacion(p.class_session_id).catch(() => {});
  cargarHablado(p.class_session_id).catch(() => {});
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
      + 'Estás en la posición de arranque: escribe «siguiente», o «jugada 5» para ir a la jugada 5 de las blancas. Para elegir otra clase, escribe «clases».');
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
      // Con el recuadro vacío, Enter o → avanzan sin escribir nada (js/cuadro-comandos.js).
      recorrer: {
        siguiente: (api) => { if ((nodo || actual.raiz).hijos[0]) { api.decir(''); siguiente(); } else api.decir('Ya estás en la última jugada de esta línea.'); },
        anterior: (api) => { if (nodo) { api.decir(''); anterior(); } else api.decir('Ya estás en la posición de arranque.'); },
        inicio: (api) => { api.decir(''); alPrincipio(); },
        final: (api) => { api.decir(''); alFinal(); },
      },
    });
    if (comandos) comandos.ayuda('Con el recuadro vacío: Enter o flecha derecha, la jugada siguiente; flecha izquierda, la anterior; Inicio y Fin, las puntas. Escribiendo: «jugada 5» (la de las blancas; «jugada 5 negras», la de las negras), «girar», «clases» (volver a la lista para elegir otra clase), «jugar» (jugar desde aquí contra el motor). Preguntar: «posición», «caballos», «qué hay en e4». Escribe «ayuda» para todo.');
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
/* Volver a la lista de clases desde el recuadro. Con la cuenta ciega el foco
   queda en el recuadro al abrir una clase, y la lista está ANTES en la página:
   quien no ve no tenía cómo saber que estaba ahí ni cómo llegar sin tabular
   hacia atrás por los botones y el tablero. «clases» lleva el foco a la clase
   abierta en la lista y dice cuántas hay y cómo moverse. */
const PIDE_LISTA = /^\s*(clases|mis clases|lista|la lista|lista de clases|otra clase|elegir( otra)? clase|cambiar( de)? clase|volver a (la lista|las clases))\s*$/i;
function irALaLista(){
  const botones = [...document.querySelectorAll('#lista-clases button')];
  if (!botones.length) return 'Todavía no hay clases en la lista.';
  const abierta = botones.find((b) => b.getAttribute('aria-current') === 'true') || botones[0];
  abierta.focus();
  return 'Tus clases: ' + botones.length + (botones.length === 1 ? ' clase' : ' clases')
    + '. Flecha arriba y flecha abajo pasan de una a otra; Enter abre la que elijas.';
}
/* Dentro de la lista, flecha arriba y abajo pasan de clase en clase (y Inicio
   y Fin, a las puntas): con doscientas clases, Tab de una en una no alcanza. */
document.getElementById('lista-clases').addEventListener('keydown', (e) => {
  const b = e.target && e.target.closest && e.target.closest('#lista-clases button');
  if (!b) return;
  const botones = [...document.querySelectorAll('#lista-clases button')];
  const i = botones.indexOf(b);
  const destino = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: botones.length - 1 }[e.key];
  if (destino === undefined) return;
  e.preventDefault();
  e.stopPropagation();   // que no lo tome el recorrido de la partida
  if (botones[destino]) botones[destino].focus();
});

function recorrerEscribiendo(texto, api){
  if (PIDE_LISTA.test(texto)) { api.limpiar(); api.decir(irALaLista()); return; }
  if (!actual) { api.decir('Primero elige una clase de la lista: escribe «clases».'); return; }
  if (/^\s*(jugar|practicar|jugar contra el motor|jugar desde aqu[ií]( contra el motor)?)\s*$/i.test(texto)) {
    api.limpiar().decir('');
    empezarPractica();
    return;
  }
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
  // Jugando contra el motor la partida de la clase está escondida: moverla a
  // ciegas cambiaría desde dónde se vuelve sin que nadie lo vea.
  if (!actual || document.getElementById('visor').hidden || practica.activa) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
  if (e.target && e.target.closest && e.target.closest('#board, #repaso-board, #practica-board, .cc-caja, [role="application"]')) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); anterior(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); siguiente(); }
  else if (e.key === 'Home') { e.preventDefault(); alPrincipio(); }
  else if (e.key === 'End') { e.preventDefault(); alFinal(); }
});

/* ---------------- Jugar contra el motor desde la clase ----------------
   Desde la posición que se está mirando, el alumno juega con el bando al que
   le toca y el motor contesta por el otro: es el mismo Stockfish por Elo de la
   práctica de la clase en vivo (js/practice-engine.js), con plazo y con
   jugada de respaldo, así el tablero nunca se queda «pensando». Se juega
   tocando el tablero o escribiendo en su propio recuadro, y cada jugada (la
   suya y la del motor) se dice CONTADA. No se guarda en la base: es práctica
   del alumno, no una entrega. Al terminar se vuelve a la partida de la clase
   en la misma jugada. */
const practica = { activa: false, juego: null, desde: null, humano: 'w', sel: null, ultima: null,
  pensando: false, terminada: false, turnoDeJuego: 0, comandos: null, teclado: null };

const RESULTADO = { '1-0': 'ganan las blancas', '0-1': 'ganan las negras', '½-½': 'tablas' };
function colorDe(c){ return c === 'w' ? 'blancas' : 'negras'; }

function empezarPractica(){
  if (!actual) return;
  if (typeof Chess !== 'function' || !window.PracticeEngine) {
    avisarDelVisor('El motor no está disponible en este navegador.');
    return;
  }
  /* Desde lo que se VE: puede ser la posición aparte de una pregunta del profe
     («Ver la posición»), que se pinta sin moverse de la jugada de la partida. */
  const enPartida = nodo ? nodo.fen : actual.raiz.fen;
  const vista = posicionVista ? posicionVista.fen() : enPartida;
  const aparte = clavePos(vista) !== clavePos(enPartida);
  practica.desde = vista;
  practica.aparte = aparte ? document.getElementById('visor-estado').textContent : null;
  practica.desdeNombre = aparte ? 'la ' + practica.aparte.replace(/^./, (x) => x.toLowerCase())
    : nodo ? 'la jugada ' + nombreDe(nodo) : 'la posición de arranque';
  practica.activa = true;
  document.getElementById('visor-mirar').hidden = true;
  document.getElementById('practica').hidden = false;
  montarPracticaAccesible();
  PracticeEngine.preload();
  reiniciarPractica();
  if (modoCiego() && practica.comandos && practica.comandos.input.checkVisibility()) practica.comandos.enfocar();
  else document.getElementById('practica-titulo').focus();
}

function reiniciarPractica(){
  practica.juego = new Chess(practica.desde);
  practica.humano = practica.juego.turn();
  practica.sel = null; practica.ultima = null; practica.pensando = false; practica.terminada = false;
  practica.turnoDeJuego += 1;   // una respuesta del motor que llegue tarde ya no es de esta partida
  const intro = 'Juegas con ' + colorDe(practica.humano) + ' desde ' + practica.desdeNombre
    + '; el motor responde con ' + colorDe(practica.humano === 'w' ? 'b' : 'w') + '. Te toca.';
  document.getElementById('practica-intro').textContent = intro;
  decirEnPractica(intro);
  pintarPractica();
}

function montarPracticaAccesible(){
  if (!practica.teclado && window.TableroAccesible) {
    practica.teclado = TableroAccesible.montar(document.getElementById('practica-board'), {
      nombre: 'Tablero contra el motor', juego: () => practica.juego, cuadro: () => practica.comandos && practica.comandos.input,
    });
  }
  if (!practica.comandos && window.CuadroComandos) {
    practica.comandos = CuadroComandos.montar(document.getElementById('practica-cmd'), {
      etiqueta: 'Escribe tu jugada contra el motor, o una pregunta sobre la posición',
      juego: () => practica.juego,
      tablero: () => practica.teclado,
      // La posición no se dicta en cada jugada: se dice la jugada y la posición se pide.
      posicionViva: false,
      onEnviar: (texto, api) => {
        const t = texto.trim().toLowerCase();
        if (/^(terminar|salir|volver|volver a la partida|dejar de jugar)$/.test(t)) { api.limpiar(); terminarPractica(true); return; }
        if (/^(otra vez|de nuevo|empezar otra vez|reiniciar|revancha)$/.test(t)) { api.limpiar(); reiniciarPractica(); return; }
        if (practica.terminada) { api.decir('La partida terminó. Escribe «otra vez» para jugarla de nuevo, o «terminar» para volver a la partida de la clase.'); return; }
        if (practica.pensando) { api.decir('El motor está pensando su jugada. Espera un momento.'); return; }
        const mv = window.ComandosTablero ? ComandosTablero.jugadaEscrita(practica.juego, texto) : null;
        if (!mv) { api.decir(window.ComandosTablero ? ComandosTablero.noSePudoJugar(texto.trim()) : '«' + texto.trim() + '» no es una jugada legal en esta posición.'); try { api.input.select(); } catch (e) {} return; }
        api.limpiar();
        jugarEnPractica(mv.from, mv.to, mv.promotion);
      },
    });
    if (practica.comandos) practica.comandos.ayuda('Escribe tu jugada («Cf3», «e4», «caballo a f3»). «otra vez», empezar de nuevo desde la misma posición; «terminar», volver a la partida de la clase. Preguntar: «posición», «caballos», «qué hay en e4».');
  }
}

/* Lo que se dice: escrito en el renglón de estado (una región viva) y, con la
   voz del sitio encendida, en voz alta. Vaciar y repoblar: una región viva no
   vuelve a hablar si el texto es el mismo (dos «Te toca» seguidos). */
function decirEnPractica(texto){
  const e = document.getElementById('practica-estado');
  e.textContent = '';
  window.setTimeout(() => { e.textContent = texto; }, 50);
  if (window.BlindNotation) BlindNotation.speak(texto);
}

function avisarDelVisor(texto){
  if (comandos) comandos.decir(texto);
  anunciar(texto);
}

function pintarPractica(){
  const t = document.getElementById('practica-board');
  const puede = !practica.terminada && !practica.pensando && practica.juego.turn() === practica.humano;
  EjercicioTablero.dibujar(t, {
    juego: practica.juego, orientacion: practica.humano,
    seleccionada: puede && practica.sel ? practica.sel : null,
    ultima: practica.ultima,
    alTocar: (sq) => tocarPractica(sq),
  });
  if (puede && practica.sel) EjercicioTablero.marcarDestinos(t, practica.juego, practica.sel);
  if (window.Coordenadas) Coordenadas.aplicar(t);
  document.getElementById('practica-jugadas').textContent = practica.juego.history().join(' ') || 'ninguna todavía';
}

function tocarPractica(sq){
  if (practica.terminada || practica.pensando || practica.juego.turn() !== practica.humano) return;
  const p = practica.juego.get(sq);
  if (practica.sel && practica.sel !== sq) {
    const legal = practica.juego.moves({ square: practica.sel, verbose: true }).some((m) => m.to === sq);
    if (legal) { const de = practica.sel; EjercicioTablero.jugarCoronando(practica.juego, de, sq, (pieza) => jugarEnPractica(de, sq, pieza)); return; }
  }
  practica.sel = p && p.color === practica.humano ? sq : null;
  pintarPractica();
}

function resultadoDePractica(){
  const g = practica.juego;
  if (g.in_checkmate()) return g.turn() === 'w' ? '0-1' : '1-0';
  if (g.in_stalemate() || g.insufficient_material() || g.in_threefold_repetition() || g.in_draw()) return '½-½';
  return null;
}

function contada(mv){
  // Sin el punto final: la frase sigue («Jugaste: … . El motor piensa»).
  return window.VisorLinea ? VisorLinea.jugadaContada(mv).replace(/^./, (x) => x.toLowerCase()).replace(/\.$/, '') : mv.san;
}

async function jugarEnPractica(desde, hasta, pieza){
  const mv = practica.juego.move({ from: desde, to: hasta, promotion: pieza || 'q' });
  if (!mv) return;
  practica.sel = null;
  practica.ultima = { from: mv.from, to: mv.to };
  const tuya = 'Jugaste: ' + contada(mv) + '.';
  if (terminarSiAcabo(tuya)) return;
  practica.pensando = true;
  pintarPractica();
  decirEnPractica(tuya + ' El motor piensa…');
  const turno = practica.turnoDeJuego;
  let uci = null;
  try { uci = (await PracticeEngine.responder(practica.juego.fen(), document.getElementById('practica-nivel').value)).uci; }
  catch (e) { uci = null; }
  if (!uci) uci = PracticeEngine.jugadaDeRespaldo(practica.juego.fen());
  // Mientras pensaba, el alumno terminó o empezó otra vez: esa respuesta ya no va.
  if (!practica.activa || turno !== practica.turnoDeJuego) return;
  practica.pensando = false;
  if (!uci) { pintarPractica(); decirEnPractica('El motor no respondió. Escribe «otra vez» para empezar de nuevo.'); return; }
  const rival = practica.juego.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
  if (!rival) { pintarPractica(); decirEnPractica('El motor no respondió. Escribe «otra vez» para empezar de nuevo.'); return; }
  practica.ultima = { from: rival.from, to: rival.to };
  // Las dos jugadas juntas: quien llega al renglón después oye la jugada entera.
  const suya = tuya + ' El motor jugó: ' + contada(rival) + '.';
  if (terminarSiAcabo(suya)) return;
  pintarPractica();
  decirEnPractica(suya + (practica.juego.in_check() ? ' Estás en jaque.' : '') + ' Te toca.');
}

function terminarSiAcabo(previo){
  const r = resultadoDePractica();
  if (!r) return false;
  practica.terminada = true;
  practica.pensando = false;
  const gano = (r === '1-0' && practica.humano === 'w') || (r === '0-1' && practica.humano === 'b');
  const mate = practica.juego.in_checkmate() ? 'Jaque mate: ' : '';
  pintarPractica();
  decirEnPractica(previo + ' Fin de la partida. ' + mate + RESULTADO[r] + '.'
    + (gano ? ' ¡Bien jugado!' : r === '½-½' ? '' : ' Escribe «otra vez» para intentarlo de nuevo.'));
  return true;
}

function terminarPractica(enfocar){
  if (!practica.activa) return;
  practica.activa = false;
  practica.pensando = false;
  practica.turnoDeJuego += 1;
  document.getElementById('practica').hidden = true;
  document.getElementById('visor-mirar').hidden = false;
  if (!actual) return;
  if (practica.aparte) mirarPosicion(practica.desde, practica.aparte);
  else mirar(nodo);
  if (!enfocar) return;
  if (modoCiego() && comandos && comandos.input.checkVisibility()) {
    comandos.enfocar();
    avisarDelVisor('De vuelta en la partida de la clase, en ' + practica.desdeNombre + '.');
  } else {
    document.getElementById('btn-practicar').focus();
  }
}

document.getElementById('btn-practicar').addEventListener('click', empezarPractica);
document.getElementById('practica-otra-btn').addEventListener('click', reiniciarPractica);
document.getElementById('practica-terminar-btn').addEventListener('click', () => terminarPractica(true));

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
        // «no es legal» solo si ES una jugada; si no («hola»), que no se entendió.
        if (!mv) { api.decir(window.ComandosTablero ? ComandosTablero.noSePudoJugar(texto.trim()) : '"' + texto.trim() + '" no es una jugada legal en esta posición.'); try { api.input.select(); } catch (e) {} return; }
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
    /* Se pudo jugar pero no era: empieza por «Respuesta incorrecta», como en
       todo el sitio (js/comandos-tablero.js); «no es legal» es la que no se puede hacer. */
    msg.textContent = window.ComandosTablero
      ? ComandosTablero.incorrecta(EjercicioTablero.jugadaEs(mv.san), 'Inténtalo otra vez.')
      : 'Respuesta incorrecta: ' + EjercicioTablero.jugadaEs(mv.san) + ' no es la jugada que buscamos. Inténtalo otra vez.';
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

/* Con la cuenta ciega, al abrir la página el foco quedaba en el <body>: el
   lector no decía nada y quien no ve no sabía dónde estaba. Se lleva al
   título (con tabindex=-1, que no suma una parada de Tab), salvo que algo ya
   lo tenga (abrir una clase o el repaso lo llevan a su propio título). La
   marca de la cuenta llega de la base después de cargar: si todavía no está,
   se espera a `vision:cambio` (js/vision-cuenta.js). */
function tituloAlAbrir(){
  const h1 = app.querySelector('h1');
  const intentar = () => {
    if (!modoCiego() || !h1) return false;
    const a = document.activeElement;
    if (a && a !== document.body && a.id !== 'main-content') return true;
    h1.setAttribute('tabindex', '-1');
    h1.focus();
    return true;
  };
  if (!intentar()) document.addEventListener('vision:cambio', intentar, { once: true });
}

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
  tituloAlAbrir();
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

/*! rev bfb5bbb0d2d82f9f */
