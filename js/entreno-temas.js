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
  await leerNivelDeLaCuenta();
  loadDataThenStart();
}

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
function idsOf(theme){ return theme === REPASO ? repasoIds : theme === RETO ? reto.ids : (DATA.themes[theme] || []); }

/* ---------------- Repasar fallados ----------------
   Lo que se resolvió con error o con pista entra a una cola de repaso
   espaciado (js/repaso-fallados.js) y vuelve cuando toca. Mientras se repasa,
   `currentTheme` es REPASO y la lista es la de hoy, fija: lo que se vuelve a
   fallar queda para la próxima, no se repite en la misma sesión. */
const REPASO = '__repaso';
const CLAVE_REPASO = window.RepasoFallados ? RepasoFallados.CLAVES.temas : null;
let repasoIds = [];
function enRepaso(){ return currentTheme === REPASO; }
function pendientesDeRepaso(){
  if(!window.RepasoFallados || !DATA) return [];
  return RepasoFallados.pendientes(CLAVE_REPASO, (id) => !!DATA.puzzles[id]);
}
function pintarRepaso(){
  const caja = document.getElementById('repaso-caja');
  const n = pendientesDeRepaso().length;
  caja.style.display = n ? '' : 'none';
  if(!n) return;
  document.getElementById('repaso-texto').textContent = n === 1
    ? 'Hoy toca repasar 1 ejercicio que te costó (lo resolviste con un error o con una pista).'
    : `Hoy toca repasar ${n} ejercicios que te costaron (los resolviste con un error o con una pista).`;
}
function abrirRepaso(){
  repasoIds = pendientesDeRepaso();
  if(!repasoIds.length) return;
  currentTheme = REPASO;
  document.getElementById('play-title').textContent = 'Repasar fallados';
  document.getElementById('play-desc').textContent = 'Los que te costaron, otra vez. Si sale limpio, vuelve más adelante; si no, vuelve pronto.';
  document.getElementById('themes-view').style.display = 'none';
  document.getElementById('play-view').style.display = 'block';
  pintarSelectorDesde();
  currentIndex = 0;
  loadPuzzle();
  window.scrollTo({ top: 0 });
  const t = document.getElementById('play-title'); t.setAttribute('tabindex', '-1'); t.focus();
}
function terminarRepaso(){
  document.getElementById('play-area').style.display = 'none';
  document.getElementById('celebration').style.display = 'block';
  document.getElementById('celebration-title').textContent = '¡Repaso terminado!';
  document.getElementById('celebration-replay-btn').style.display = 'none';
  document.getElementById('celebration-stats').textContent =
    `Repasaste ${repasoIds.length} ${repasoIds.length === 1 ? 'ejercicio' : 'ejercicios'}. Los que salieron limpios vuelven más adelante.`;
  updateProgressBar();
}
/* ---------------- El reto de un compañero ----------------
   temas.html?reto=<id>: los 5 ejercicios de un reto (js/reto-ejercicios.js),
   con un intento cada uno, sin pistas y con el tiempo contando. Lo que se
   contesta va a la base (una respuesta por ejercicio: la base no deja
   repetir). Ver «Retos de ejercicios entre compañeros» en
   docs/decisiones/juegos-y-torneos.md. */
const RETO = '__reto';
const reto = { id: null, ids: [], contestadas: new Map(), rival: '', inicio: 0 };
function enReto(){ return currentTheme === RETO; }
function siguienteDelReto(desde){
  for(let i = desde; i < reto.ids.length; i++){ if(!reto.contestadas.has(i)) return i; }
  return reto.ids.length;
}
async function abrirReto(id){
  const R = window.RetoEjercicios;
  const datos = R ? await R.cargar(sb, id).catch(() => null) : null;
  if(!datos){
    if(window.Avisos) Avisos.avisar('No se encontró ese reto. Puede que no sea tuyo o que ya no exista.', { tipo: 'error' });
    showThemes(false);
    return;
  }
  reto.id = id; reto.ids = datos.reto.ejercicios.slice(); reto.contestadas = datos.contestadas; reto.rival = datos.rival;
  reto.vencido = new Date(datos.reto.vence_at) <= new Date();
  currentTheme = RETO;
  document.getElementById('play-title').textContent = reto.rival ? `Reto con ${reto.rival}` : 'Reto de ejercicios';
  document.getElementById('play-desc').textContent = 'Los mismos 5 ejercicios para los dos. Un intento por ejercicio, sin pistas, y cuenta el tiempo. Si sales a mitad de un ejercicio, ese cuenta como no resuelto.';
  ['hint-btn', 'retry-btn', 'skip-btn'].forEach((b) => { document.getElementById(b).style.display = 'none'; });
  // Del reto se vuelve a los retos, no a la lista de temas.
  const volver = document.getElementById('back-themes');
  volver.textContent = '← Mis retos';
  volver.setAttribute('href', '../reto-ejercicios.html');
  document.getElementById('nivel-desde-caja').style.display = 'none';
  document.getElementById('themes-view').style.display = 'none';
  document.getElementById('play-view').style.display = 'block';
  // Si se fue a mitad de uno (en este aparato), ese ya se jugó.
  const dejado = R.abandonado(id, reto.contestadas);
  if(dejado && !reto.vencido){
    await R.responder(sb, id, dejado.idx, false, dejado.ms).catch(() => {});
    reto.contestadas.set(dejado.idx, { acierto: false, ms: dejado.ms });
  }
  currentIndex = siguienteDelReto(0);
  if(reto.vencido || currentIndex >= reto.ids.length){ terminarReto(); return; }
  loadPuzzle();
  window.scrollTo({ top: 0 });
  if(document.documentElement.classList.contains('adaptive-mode') && comandos) comandos.enfocar();
  else { const t = document.getElementById('play-title'); t.setAttribute('tabindex', '-1'); t.focus(); }
}
async function contestarReto(acierto){
  const ms = Date.now() - reto.inicio;
  reto.contestadas.set(currentIndex, { acierto, ms });
  try { await RetoEjercicios.responder(sb, reto.id, currentIndex, acierto, ms); }
  catch(e){ if(window.Avisos) Avisos.avisar('No se pudo guardar tu respuesta. Revisa tu conexión: si recargas, este ejercicio cuenta como no resuelto.', { tipo: 'error' }); }
}
function terminarReto(){
  document.getElementById('play-area').style.display = 'none';
  document.getElementById('celebration').style.display = 'block';
  document.getElementById('celebration-title').textContent = reto.vencido ? 'Este reto ya venció' : '¡Reto terminado!';
  document.getElementById('celebration-replay-btn').style.display = 'none';
  document.getElementById('celebration-back-btn').textContent = 'Ver mis retos';
  const hechas = [...reto.contestadas.values()];
  const bien = hechas.filter((x) => x.acierto).length;
  const ms = hechas.reduce((t, x) => t + (x.ms || 0), 0);
  document.getElementById('celebration-stats').textContent =
    `Resolviste ${bien} de ${reto.ids.length} en ${RetoEjercicios.mmss(ms)}. ` +
    (reto.rival ? `Cuando ${reto.rival} termine, en «Retos de ejercicios» ves quién ganó.` : 'En «Retos de ejercicios» ves quién ganó.');
  updateProgressBar();
}
function solvedCountFor(theme){
  const s = getSolved();
  return idsOf(theme).filter((id) => s[id]).length;
}
function firstUnsolvedIndex(theme){
  return siguienteIndice(theme, 0);
}

/* ---------------- Desde qué dificultad ----------------
   Cada tema de Lichess viene ordenado por rating de menor a mayor (ataque
   doble va de 1047 a 1978), y la página arrancaba siempre en el primero sin
   resolver: un alumno de 1800 que el plan del diagnóstico mandaba a "ataque
   doble" tenía que pasar unos sesenta ejercicios triviales antes de llegar a
   algo que le sirviera. Ahora el tema arranca en el primero sin resolver cuyo
   rating llegue a `nivelDesde`.

   De dónde sale `nivelDesde`, en este orden:
   1. `?desde=<rating>` en el enlace (lo que manda una tarea o el plan).
   2. Lo que el alumno eligió en el selector (entreno_temas_desde).
   3. Su nivel: el Elo del último diagnóstico o el que declaró en su perfil,
      MENOS 300 — para calentar un poco por debajo y no arrancar en su techo.
      El rating de un ejercicio de Lichess no es un Elo FIDE (a igual fuerza,
      el de Lichess suele ser más alto), así que quedarse corto es lo seguro.
   4. Nada: desde el más fácil, como siempre.
   Los ejercicios SIN rating (los de táctica de la casa) no se filtran nunca. */
const CLAVE_DESDE = 'entreno_temas_desde';
const DESDE_OPCIONES = [0, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200];
let nivelDesde = 0;
let nivelDeLaCuenta = null; // Elo del alumno, si se conoce

async function leerNivelDeLaCuenta(){
  try{
    const r = JSON.parse(localStorage.getItem('diagnostico_resultado_v1') || 'null');
    if(r && typeof r.elo === 'number') { nivelDeLaCuenta = r.elo; return; }
  }catch(e){}
  try{
    const { data: ses } = await sb.auth.getSession();
    const uid = ses && ses.session && ses.session.user && ses.session.user.id;
    if(!uid) return;
    const { data } = await sb.from('profiles').select('elo').eq('id', uid).maybeSingle();
    if(data && typeof data.elo === 'number' && data.elo > 0) nivelDeLaCuenta = data.elo;
  }catch(e){}
}

/* El escalón del selector que queda justo por debajo de un rating. */
function escalonDe(rating){
  let r = 0;
  DESDE_OPCIONES.forEach((o) => { if(o <= rating) r = o; });
  return r;
}

function elegirNivelDesde(){
  const pedido = parseInt(new URLSearchParams(location.search).get('desde') || '', 10);
  if(pedido > 0) return escalonDe(pedido);
  let guardado = null;
  try{ guardado = localStorage.getItem(CLAVE_DESDE); }catch(e){}
  if(guardado !== null && !isNaN(parseInt(guardado, 10))) return escalonDe(parseInt(guardado, 10));
  if(nivelDeLaCuenta) return escalonDe(nivelDeLaCuenta - 300);
  return 0;
}

function temaConRating(theme){
  return idsOf(theme).some((id) => DATA.puzzles[id] && typeof DATA.puzzles[id].rating === 'number');
}

/* El próximo ejercicio para hacer, empezando a buscar en `desde` (índice):
   primero uno sin resolver y a la altura de nivelDesde; si ya no queda
   ninguno de esos más adelante, se vuelve a buscar desde el principio; y si
   todos los que llegan al nivel están resueltos, cualquiera sin resolver.
   Antes, "Siguiente" y "Saltar" avanzaban uno y caían en ejercicios ya
   resueltos, que no suman nada. */
function siguienteIndice(theme, desde){
  const ids = idsOf(theme);
  const s = getSolved();
  const sirve = (id) => {
    if(s[id]) return false;
    const r = DATA.puzzles[id] && DATA.puzzles[id].rating;
    return typeof r !== 'number' || r >= nivelDesde;
  };
  const buscar = (cond) => {
    for(let i = desde; i < ids.length; i++) if(cond(ids[i])) return i;
    for(let i = 0; i < Math.min(desde, ids.length); i++) if(cond(ids[i])) return i;
    return -1;
  };
  let i = buscar(sirve);
  if(i === -1) i = buscar((id) => !s[id]);
  return i === -1 ? 0 : i;
}

function pintarSelectorDesde(){
  const caja = document.getElementById('nivel-desde-caja');
  const sel = document.getElementById('nivel-desde');
  if(!sel.options.length){
    DESDE_OPCIONES.forEach((o) => {
      const op = document.createElement('option');
      op.value = String(o);
      op.textContent = o === 0 ? 'Desde el más fácil' : `Desde ${o}`;
      sel.appendChild(op);
    });
  }
  sel.value = String(nivelDesde);
  // Un tema sin rating (los de táctica de la casa) no tiene nada que elegir.
  caja.style.display = currentTheme && !enRepaso() && temaConRating(currentTheme) ? '' : 'none';
  const pista = document.getElementById('nivel-desde-pista');
  pista.textContent = nivelDeLaCuenta
    ? `Con tu nivel (≈${nivelDeLaCuenta}), te conviene empezar desde ${escalonDe(nivelDeLaCuenta - 300) || 'el más fácil'}.`
    : '';
}

/* La dificultad que se ajusta sola (js/dificultad-adaptable.js): con varios
   limpios seguidos sube un escalón, y si se traba baja uno. No toca el
   repaso, un tema sin rating ni la dificultad que fijó una tarea o el plan
   con ?desde= (la decidió el profesor). El escalón nuevo queda guardado como
   si lo hubiera elegido en el selector, y se dice en pantalla. */
const DESDE_FIJADO = parseInt(new URLSearchParams(location.search).get('desde') || '', 10) > 0;
const ajusteDificultad = window.DificultadAdaptable ? DificultadAdaptable.crear() : null;
let buscarDesdeElPrincipio = false;
function ajustarDificultad(limpio){
  if(!ajusteDificultad || DESDE_FIJADO || enRepaso() || !temaConRating(currentTheme)) return;
  const cambio = ajusteDificultad.registrar(limpio);
  if(!cambio) return;
  const nuevo = DificultadAdaptable.escalon(DESDE_OPCIONES, nivelDesde, cambio);
  if(nuevo === nivelDesde) return;
  nivelDesde = nuevo;
  try{ localStorage.setItem(CLAVE_DESDE, String(nivelDesde)); }catch(e){}
  // El tema va de menor a mayor: para bajar hay que volver a buscar desde
  // el principio (más adelante solo quedan los más difíciles).
  buscarDesdeElPrincipio = true;
  pintarSelectorDesde();
  const aviso = document.getElementById('nivel-ajuste');
  aviso.textContent = cambio === 'subir'
    ? `⬆️ Te está saliendo fácil: ${DificultadAdaptable.SUBIR_CON} limpios seguidos. Los próximos arrancan desde ${nivelDesde}.`
    : `⬇️ Bajamos un escalón: los próximos ${nivelDesde ? 'arrancan desde ' + nivelDesde : 'son los más fáciles'}. Primero afianzar, después se vuelve a subir.`;
  aviso.hidden = false;
}

// La racha (js/ejercicio-tablero.js): la misma en todas las páginas de ejercicios.
const { getStreak, getBestStreak, setStreak, bumpStreak, resetStreak } = EjercicioTablero.racha('entreno_temas');

/* ---------------- Vista de temas ---------------- */
function normalize(s){ return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

let temasALaVista = 0;   // cuántos temas distintos dejó la búsqueda
function buildThemes(){
  const q = normalize(document.getElementById('search').value.trim());
  const vistos = new Set();
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
      vistos.add(t.key);
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
  temasALaVista = vistos.size;
  updateOverall();
}
// Con un respiro: buildThemes() recorre todos los temas y, de paso,
// updateOverall() escribe dos veces en localStorage — repetir eso en cada
// tecla mientras se escribe la búsqueda es trabajo (y escritura en disco)
// de sobra que no cambia nada hasta que la persona deja de teclear.
let buscarTemaTimer = null;
/* Y se DICE cuántos quedaron: la lista cambia en silencio, y quien no la ve
   escribía «mate» sin saber si había algo que recorrer con Tab. */
function anunciarBusqueda(){
  const q = document.getElementById('search').value.trim();
  const n = temasALaVista;
  document.getElementById('search-anuncio').textContent = !q
    ? `Se muestran todos los temas: ${n}.`
    : (n ? `${n} ${n === 1 ? 'tema coincide' : 'temas coinciden'} con «${q}». Tab para recorrerlos.` : `Ningún tema coincide con «${q}».`);
}
document.getElementById('search').addEventListener('input', () => {
  clearTimeout(buscarTemaTimer);
  buscarTemaTimer = setTimeout(() => { buildThemes(); anunciarBusqueda(); }, 200);
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

/* `enfocar`: el foco va al buscador. Al volver de un tema el botón que lo
   tenía desaparece con el reproductor y el foco caía al <body>; con la cuenta
   ciega, además, al llegar a la página (ahí se empieza buscando). */
function showThemes(enfocar){
  document.getElementById('play-view').style.display = 'none';
  document.getElementById('themes-view').style.display = 'block';
  buildThemes();
  pintarRepaso();
  try{ localStorage.removeItem('entreno_temas_last'); }catch(e){}
  window.scrollTo({ top: 0 });
  if(enfocar) document.getElementById('search').focus();
}

/* ---------------- Estado del ejercicio actual ---------------- */
let currentTheme = null;
let currentIndex = 0;
let game = null;
let finEjercicio = null;   // «Siguiente» y «Ver la línea» del ejercicio terminado
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
  pintarSelectorDesde();
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
  if(enReto()){
    const total = reto.ids.length;
    document.getElementById('progress-fill').style.width = (total ? Math.round(100 * reto.contestadas.size / total) : 0) + '%';
    document.getElementById('progress-label').textContent = `Reto · ejercicio ${Math.min(currentIndex + 1, total)} de ${total}`;
    return;
  }
  if(enRepaso()){
    const total = repasoIds.length;
    document.getElementById('progress-fill').style.width = (total ? Math.round(100 * currentIndex / total) : 0) + '%';
    document.getElementById('progress-label').textContent = `Repaso · ejercicio ${Math.min(currentIndex + 1, total)} de ${total}`;
    return;
  }
  const total = idsOf(currentTheme).length;
  const done = solvedCountFor(currentTheme);
  document.getElementById('progress-fill').style.width = (total ? Math.round(100 * done / total) : 0) + '%';
  document.getElementById('progress-label').textContent = `${done}/${total} resueltos · ejercicio ${currentIndex + 1} de ${total}`;
}

/* ---------------- Tablero ---------------- */

function drawBoard(){
  refrescarComandos();
  // El tablero, la pieza elegida y las marcas de la pista los pinta el módulo
  // común (js/ejercicio-tablero.js): desde el bando que juega, igual que Mates.
  EjercicioTablero.dibujar(document.getElementById('board'), {
    juego: game, orientacion: orientation, seleccionada: selectedSquare,
    ultima: lastMove, marcas: pistas.marcas(), alTocar: onSquareClick,
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
      /* Muda: la posición se dice UNA vez, al empezar el ejercicio (en el
         aviso de loadPuzzle). Viva, se releían las treinta y dos piezas
         después de cada jugada y de cada pista, y tapaban lo único que había
         cambiado —la jugada del rival, la pista—. Se pide con «posición». */
      posicionViva: false,
    });
    comandos.ayuda('Jugada: "Cf3", "e4", "Dxh7+", "e8=D". Pregunta: "caballos", "qué hay en e4". Escribe "ayuda" para todo.');
  }
  comandos.posicion(game);
}

function jugarEscribiendo(texto, api){
  // Terminado el ejercicio, «siguiente» escrito hace lo mismo que el botón.
  if(finEjercicio && finEjercicio.activo()){
    if(/^\s*sig(uiente)?\s*$/i.test(texto)){ api.limpiar(); finEjercicio.siguiente(); }
    else api.decir('Ejercicio terminado. Escribe "siguiente" para pasar al que sigue.');
    return;
  }
  if(locked){ api.decir('Espera: el rival está respondiendo.'); return; }
  // El intérprete busca la jugada entre las LEGALES y no toca la partida, así
  // que no hace falta ninguna copia: quien decide si entra es playMove(), la
  // misma puerta por la que pasa el clic y la que corrige contra la solución.
  const mv = ComandosTablero.jugadaEscrita(game, texto);
  // No se entendió, o no es legal: js/comandos-tablero.js dice cuál de las dos.
  if(!mv){ api.decir(ComandosTablero.noSePudoJugar(texto)); return; }
  api.limpiar().decir('');
  playMove(mv.from, mv.to, mv.promotion);
}

// Lo que se antepone al próximo aviso («La solución era: …»), que si no
// quedaba tapado por el «¡Correcto!» que viene enseguida.
let prefijoAviso = '';
function setStatus(text, cls){
  if(prefijoAviso){ text = prefijoAviso + ' ' + text; prefijoAviso = ''; }
  const el = document.getElementById('round-status');
  el.textContent = text;
  el.className = 'round-status' + (cls ? ' ' + cls : '');
  // El mismo aviso, repetido en el cuadro de comandos: quien contesta
  // escribiendo tiene el foco ahí y el renglón del tablero le queda lejos.
  if(comandos) comandos.decir(text);
}
// Una jugada como se oye: en palabras en Modo Adaptado («caballo felix 3»),
// en castellano si no («Cf3»).
function jugadaDicha(san){
  return ComandosTablero.jugadaParaMostrar(san);
}
function highlightTargets(square){ EjercicioTablero.marcarDestinos(document.getElementById('board'), game, square); }

function loadPuzzle(){
  const puzzle = currentPuzzle();
  if(finEjercicio){ finEjercicio.cerrar(); finEjercicio = null; }
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
  locked = false;
  document.getElementById('hint-btn').disabled = false;
  pistas.reiniciar();
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
  // En Modo Adaptado la posición va en este aviso y solo en este: el recuadro
  // ya no la relee sola en cada jugada (posicionViva: false).
  const posicion = window.CuadroComandos ? CuadroComandos.posicionEnPalabras(game) : '';
  setStatus(document.documentElement.classList.contains('adaptive-mode')
    ? `${objetivo} ${posicion ? posicion + ' ' : ''}Escribe tu jugada en el recuadro, o "posición" para volver a oír el tablero.`
    : `${objetivo} Haz clic en la pieza que quieres mover.`);
  // En un reto, el reloj de este ejercicio arranca acá (y se anota en el aparato).
  if(enReto()){ reto.inicio = Date.now(); RetoEjercicios.empezar(reto.id, currentIndex); }
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
  // En qué pieza corona: el diálogo de todo el sitio (js/coronacion.js).
  EjercicioTablero.jugarCoronando(game, from, square, (pieza) => playMove(from, square, pieza));
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

function playMove(from, to, promotion){
  const puzzle = currentPuzzle();
  const moveResult = game.move({ from, to, promotion: promotion || 'q' });
  if(!moveResult){ drawBoard(); return; }

  const expected = puzzle.solution[solutionStep];
  // La de la solución o cualquier jugada que dé mate (js/ejercicio-tablero.js).
  if(!EjercicioTablero.esAcierto(game, moveResult, expected)){
    // Qué contesta el rival, si chess.js lo puede afirmar (mate en una o una
    // pieza que se pierde): el error se entiende mejor que con un «no».
    const refuta = EjercicioTablero.refutacion(game);
    game.undo();
    drawBoard();
    missedThisPuzzle = true;
    if(enReto()){ falloDelReto(moveResult.san); return; }
    resetStreak();
    EjercicioTablero.destello(document.querySelector('[data-square="' + to + '"]'));
    // «Respuesta incorrecta» y no «no es legal»: la jugada se pudo hacer.
    setStatus(ComandosTablero.incorrecta(jugadaDicha(moveResult.san), refuta || ''), 'bad');
    return;
  }
  lastMove = { from, to };
  pistas.reiniciar();   // la marca de la pista ya no apunta a nada
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
      pistas.reiniciar();
      /* La jugada del rival se DICE (como en Mates): el tablero no es región
         viva, y sin esto se oía «el rival responde…» y después «sigue
         buscando», sin saber qué se había jugado. */
      setStatus(`El rival juega ${jugadaDicha(replySan)}. Sigue buscando la continuación.`);
    }
  }, 650);
}

/* En el reto hay un solo intento: la jugada equivocada termina el ejercicio,
   y se dice cuál era la buena. */
function falloDelReto(jugada){
  locked = true;
  const puzzle = currentPuzzle();
  const buena = puzzle.solution[solutionStep];
  setStatus(`No era ${jugadaDicha(jugada)}: la jugada era ${jugadaDicha(buena)}. En el reto hay un solo intento.`, 'bad');
  contestarReto(false);
  finEjercicio = EjercicioTablero.fin({
    caja: '#fin-ejercicio', desde: puzzle.fen, jugadas: puzzle.solution, orientacion: orientation,
    siguiente: pasarAlSiguiente,
    origen: 'Ejercicios por tema · ' + document.getElementById('play-title').textContent,
  });
}
function finishPuzzle(){
  locked = true;
  document.getElementById('hint-btn').disabled = true;
  const puzzle = currentPuzzle();
  const id = currentId();
  if(enReto()){
    setStatus(game.in_checkmate() ? '✅ ¡Jaque mate!' : '✅ ¡Correcto!', 'ok');
    contestarReto(true);
    // Cuenta para la racha y los informes, como cualquier ejercicio resuelto.
    EntrenoProgress.log('temas', { puzzle_id: id, theme: 'reto', rating: puzzle.rating ?? null, ...EntrenoProgress.comoSalio(false, false) });
    finEjercicio = EjercicioTablero.fin({
      caja: '#fin-ejercicio', desde: puzzle.fen, jugadas: game.history(), orientacion: orientation,
      siguiente: pasarAlSiguiente,
      origen: 'Ejercicios por tema · ' + document.getElementById('play-title').textContent,
    });
    return;
  }
  const alreadySolved = isSolved(id);
  if(!missedThisPuzzle && !usedHintThisPuzzle) bumpStreak(); else resetStreak();
  ajustarDificultad(!missedThisPuzzle && !usedHintThisPuzzle);
  setStatus(game.in_checkmate() ? '✅ ¡Jaque mate!' : '✅ ¡Correcto! Con esto se obtiene una ventaja decisiva.', 'ok');
  // La cola de repaso: lo que costó entra, lo que se repasa se vuelve a
  // programar. Lo resuelto limpio a la primera no entra nunca.
  if(window.RepasoFallados) RepasoFallados.anotar(CLAVE_REPASO, id, missedThisPuzzle, usedHintThisPuzzle,
    { tema: enRepaso() ? (RepasoFallados.leer(CLAVE_REPASO)[id] || {}).tema : currentTheme });
  if(!alreadySolved && !enRepaso()){
    markSolved(id);
    /* Informes tiene una columna de Táctica aparte de la de Ejercicios por tema.
       Al traerse los 148 ejercicios acá, si todo se apuntara como 'temas' esa
       columna se quedaría congelada en el número del día de la mudanza — y eso
       no da ningún error: el profesor ve un número que ya no sube y no sabe por
       qué. Así que cada ejercicio se apunta bajo la actividad que le
       corresponde, que es lo mismo que se apuntaba antes de mudarlos. */
    const actividad = TEMAS_DE_TACTICA.has(currentTheme) ? 'tactica' : 'temas';
    // `limpio` (sin error ni pista) va en el detalle: sin eso, lo único que
    // quedaba era "resuelto", y uno sacado con "Ver solución" contaba igual
    // que uno limpio. Con esto se puede medir la precisión por tema.
    EntrenoProgress.log(actividad, { puzzle_id: id, theme: currentTheme, rating: puzzle.rating ?? null,
      ...EntrenoProgress.comoSalio(missedThisPuzzle, usedHintThisPuzzle) });
  }
  updateProgressBar();
  updateOverall();
  // Antes saltaba al siguiente al segundo: no daba tiempo de ver la línea.
  // Ahora el alumno decide cuándo, y puede recorrer lo que se jugó.
  finEjercicio = EjercicioTablero.fin({
    caja: '#fin-ejercicio', desde: puzzle.fen, jugadas: game.history(), orientacion: orientation,
    siguiente: pasarAlSiguiente,
    // Para «Guardar en mi cuaderno»: de dónde salió (el título del tema, o «Repaso»).
    origen: 'Ejercicios por tema · ' + document.getElementById('play-title').textContent,
  });
}
function pasarAlSiguiente(){
  finEjercicio = null;
  if(enReto()){
    currentIndex = siguienteDelReto(currentIndex + 1);
    if(currentIndex >= reto.ids.length) currentIndex = siguienteDelReto(0);
    if(currentIndex >= reto.ids.length) terminarReto(); else loadPuzzle();
    return;
  }
  if(enRepaso()){
    if(currentIndex < repasoIds.length - 1){ currentIndex++; loadPuzzle(); }
    else { currentIndex = repasoIds.length; terminarRepaso(); }
    return;
  }
  if(solvedCountFor(currentTheme) < idsOf(currentTheme).length){
    currentIndex = siguienteIndice(currentTheme, buscarDesdeElPrincipio ? 0 : currentIndex + 1);
    buscarDesdeElPrincipio = false;
    loadPuzzle();
  } else {
    finishTheme();
  }
}

function finishTheme(){
  document.getElementById('play-area').style.display = 'none';
  document.getElementById('celebration').style.display = 'block';
  document.getElementById('celebration-title').textContent = '¡Tema completo!';
  document.getElementById('celebration-replay-btn').style.display = '';
  const total = idsOf(currentTheme).length;
  const info = THEME_INFO[currentTheme] || { name: currentTheme };
  document.getElementById('celebration-stats').textContent =
    `Resolviste los ${total} ejercicios de ${info.name}.`;
  updateProgressBar();
}

/* Las pistas, por etapas (js/ejercicio-tablero.js). En un grupo que mezcla
   motivos ("recomendados", "fases", "largo"…) la primera dice cuál es el
   motivo: está en el propio ejercicio y es justo lo que el alumno no sabe.
   Dentro de un tema, el motivo ya lo dice el título, así que empieza por la
   pieza. Después, la solución. */
const GRUPOS_DE_MOTIVO = ['motifs', 'advanced', 'mateThemes', 'specialMoves'];
let motivosConocidos = null;
function motivoDelEjercicio(){
  const puzzle = currentPuzzle();
  if(!puzzle || !Array.isArray(puzzle.themes)) return null;
  if(!motivosConocidos){
    motivosConocidos = new Set();
    (DATA.groups || []).filter((g) => GRUPOS_DE_MOTIVO.includes(g.id))
      .forEach((g) => g.themes.forEach((t) => motivosConocidos.add(t.key)));
  }
  return puzzle.themes.find((k) => k !== currentTheme && motivosConocidos.has(k) && THEME_INFO[k]) || null;
}
function jugadaEsperada(){
  const puzzle = currentPuzzle();
  if(!puzzle || !game) return null;
  const esperada = puzzle.solution[solutionStep];
  return game.moves({ verbose: true }).find((m) => m.san === esperada) || null;
}
const pistas = EjercicioTablero.pistas({
  boton: '#hint-btn',
  etapas: () => motivoDelEjercicio() ? ['texto', 'origen', 'solucion'] : ['origen', 'solucion'],
  texto: () => { const i = THEME_INFO[motivoDelEjercicio()]; return `el motivo es «${i.name}»${i.desc ? ': ' + i.desc : ''}`; },
  jugada: jugadaEsperada,
  repintar: drawBoard,
  decir: setStatus,
  enPalabras: () => document.documentElement.classList.contains('adaptive-mode'),
  alDar: () => { usedHintThisPuzzle = true; },
  alResolver: (j, frase) => { selectedSquare = null; prefijoAviso = frase || ''; playMove(j.from, j.to, j.promotion || undefined); },
});
function giveHint(){
  if(locked || enReto()) return;   // el reto es sin pistas
  pistas.dar();
}
document.getElementById('hint-btn').addEventListener('click', giveHint);
document.getElementById('retry-btn').addEventListener('click', loadPuzzle);
document.getElementById('skip-btn').addEventListener('click', () => {
  resetStreak();
  // El siguiente sin resolver (a la altura elegida), no el de al lado: ese
  // podía estar ya hecho. Si el único que queda es este, vuelve a salir este.
  if(enRepaso()){
    // Saltar en el repaso no lo reprograma: sigue pendiente para la próxima.
    if(currentIndex < repasoIds.length - 1){ currentIndex++; loadPuzzle(); }
    else { currentIndex = repasoIds.length; terminarRepaso(); }
    return;
  }
  currentIndex = siguienteIndice(currentTheme, currentIndex + 1);
  loadPuzzle();
});
document.getElementById('repaso-btn').addEventListener('click', abrirRepaso);
document.getElementById('nivel-desde').addEventListener('change', (e) => {
  nivelDesde = parseInt(e.target.value, 10) || 0;
  // Lo eligió a mano: la cuenta del ajuste empieza de nuevo en ese escalón.
  if(ajusteDificultad) ajusteDificultad.reiniciar();
  document.getElementById('nivel-ajuste').hidden = true;
  try{ localStorage.setItem(CLAVE_DESDE, String(nivelDesde)); }catch(err){}
  if(solvedCountFor(currentTheme) >= idsOf(currentTheme).length) return;
  currentIndex = siguienteIndice(currentTheme, 0);
  loadPuzzle();
});
document.getElementById('celebration-replay-btn').addEventListener('click', () => {
  currentIndex = 0;
  loadPuzzle();
});
document.getElementById('celebration-back-btn').addEventListener('click', () => {
  // Del reto se vuelve a la lista de retos, que es donde se ve quién ganó.
  if(enReto()){ location.href = '../reto-ejercicios.html'; return; }
  showThemes(true);
});
document.getElementById('back-themes').addEventListener('click', (e) => {
  if(enReto()) return;   // en el reto es un enlace de verdad, a la lista de retos
  e.preventDefault(); showThemes(true);
});

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
  nivelDesde = elegirNivelDesde();
  const pedido = new URLSearchParams(location.search).get('tema');
  const fromHash = (location.hash || '').replace('#', '');
  const wanted = (pedido && DATA.themes[pedido] ? pedido : null)
    || (fromHash && DATA.themes[fromHash] ? fromHash : null)
    || (last && DATA.themes[last] ? last : null);
  // openTheme() arranca en el primer ejercicio SIN resolver (firstUnsolvedIndex),
  // así que los diez que pide la tarea son diez nuevos: lo que ya hizo no se
  // le vuelve a poner delante.
  // ?repaso=1 es el enlace de «Hoy te toca» del hub: abre la cola directo.
  if(new URLSearchParams(location.search).has('repaso') && pendientesDeRepaso().length){ abrirRepaso(); return; }
  // ?reto=<id>: el reto de un compañero (la lista de retos lleva acá).
  const retoPedido = new URLSearchParams(location.search).get('reto');
  if(retoPedido && /^[0-9a-f-]{36}$/i.test(retoPedido)){ abrirReto(retoPedido); return; }
  if(wanted) openTheme(wanted); else showThemes(document.documentElement.classList.contains('modo-ciego'));
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
