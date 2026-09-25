/* El código de entreno/precision-posicional.html.

   Vivía escrito dentro de la página, en un <script> de 14 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* ===== Evaluador de precisión posicional =====
 *
 * El banco de posiciones está en js/precision-posicional-items.js y el
 * criterio (áreas, veredicto) en js/precision-posicional-criterio.js — la
 * misma separación que ya usan el examen de arbitraje y el diagnóstico de
 * nivel. Ver el encabezado de esos dos archivos para el porqué de cada
 * decisión (sin cronómetro, sin atribuir las posiciones a partidas reales,
 * sin ningún "nivel" que suene más preciso de lo que en realidad es).
 *
 * El resultado se guarda en training_state (claves
 * precision_posicional_resultado_v1 / _historial_v1), igual que el examen de
 * arbitraje: no hace falta ninguna tabla nueva, y esa tabla ya tiene su RLS
 * (cada quien ve lo suyo).
 */
const BANCO = window.PRECISION_POSICIONAL_ITEMS;
const PRUEBA = window.PrecisionPosicionalPrueba;
const CRITERIO = window.PrecisionPosicionalCriterio;

const CLAVE_RESULTADO = 'precision_posicional_resultado_v1';
const CLAVE_HISTORIAL = 'precision_posicional_historial_v1';

let perfil = null;
let tanda = [];
let respuestas = {};   // id → índice original elegido
let idx = 0;
let juego = null;      // partida de chess.js de la pregunta actual

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fechaCorta = (iso) => new Date(iso).toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' });

function irA(vista) {
  ['intro-view', 'pregunta-view', 'resultado-view'].forEach((id) => $(id).classList.toggle('hidden', id !== vista));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function barajar(lista) {
  const c = lista.slice();
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = c[i]; c[i] = c[j]; c[j] = t; }
  return c;
}

/* ---------------- La ronda ---------------- */
function empezar() {
  const modo = (document.querySelector('input[name="tanda"]:checked') || {}).value || 'corta';
  tanda = modo === 'completa' ? PRUEBA.armar() : PRUEBA.armar(1);
  respuestas = {};
  idx = 0;
  irA('pregunta-view');
  pintarPregunta();
}

function pintarPregunta() {
  const item = tanda[idx];
  const area = CRITERIO.AREA_POR_ID[item.area];
  juego = new Chess(item.fen);

  $('q-counter').textContent = `Posición ${idx + 1} de ${tanda.length}`;
  $('q-bar').style.width = ((idx / tanda.length) * 100) + '%';
  $('q-area').textContent = `${area ? area.emoji + ' ' + area.nombre : item.area}`;
  $('q-turno').textContent = item.turno === 'blancas' ? 'Juegan las blancas' : 'Juegan las negras';
  $('q-text').textContent = item.enunciado;
  $('prev-btn').classList.toggle('invisible', idx === 0);
  $('next-btn').textContent = idx === tanda.length - 1 ? 'Terminar y ver el resultado →' : 'Siguiente →';

  window.ExampleBoard.render($('q-board'), juego);

  const caja = $('q-options');
  caja.innerHTML = '';
  const orden = item.__orden || (item.__orden = barajar(item.opciones.map((_, i) => i)));
  orden.forEach((original) => {
    caja.appendChild(botonOpcion(item, original, respuestas[item.id] === original));
  });
  prepararComandos(item);
}

function botonOpcion(item, original, elegida) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = claseOpcion(elegida);
  // La letra va ESCRITA en el botón, no puesta con CSS: es lo que hay que
  // decir para contestar por el cuadro de comandos (misma regla que el
  // examen de arbitraje y el diagnóstico de nivel).
  b.textContent = `Opción ${CuadroComandos.letra(item.__orden.indexOf(original))}. ${item.opciones[original]}`;
  b.addEventListener('click', () => { respuestas[item.id] = original; pintarPregunta(); });
  return b;
}

const claseOpcion = (sel) => 'w-full text-left px-4 py-3 rounded-xl border-2 transition-colors text-sm ' +
  (sel ? 'border-accent-500 bg-accent-50 dark:bg-brand-800 text-brand-800 dark:text-white font-medium'
       : 'border-brand-100 dark:border-brand-700 hover:border-accent-400 text-brand-600 dark:text-brand-300');

/* ---------------- El cuadro de comandos (Modo Adaptado) ----------------
 * Igual que en el examen de arbitraje: se monta UNA vez, fuera de #q-options
 * (que se repinta entero en cada clic), y lo que decide si se ve es el CSS.
 * `comandos.posicion(juego)` es lo que le da a este cuadro, gratis, la misma
 * lectura de posición que ya usan Mates, 4×4 y el resto — acá no hace falta
 * escribirla de nuevo porque hay una partida de chess.js detrás de cada
 * pregunta, cosa que el examen de arbitraje no tiene. */
let comandos = null;

function prepararComandos(item) {
  if (!window.CuadroComandos) return;
  if (!comandos) {
    comandos = CuadroComandos.montar($('q-comandos'), {
      /* Con `juego`, el mismo recuadro contesta preguntas sobre la posición
         antes de tratar el texto como respuesta: "caballos", "qué hay en e4",
         "jugadas de f3". Acá eso no es un extra — la pregunta es qué PLAN
         conviene, y para contestarla hay que poder mirar la estructura. Las
         letras de las opciones no chocan con nada: preguntar por una pieza pide
         su nombre entero, nunca una inicial (ver js/comandos-tablero.js). */
      juego: () => juego,
      onEnviar: responderEscribiendo,
    });
  }
  comandos.posicion(juego);
  comandos.etiqueta('Escribe la letra del plan que elegiste');
  comandos.ayuda(`Opciones de la A a la ${CuadroComandos.letra(item.opciones.length - 1)}. Puedes escribir solo la letra ("B") o "opción B". También puedes preguntar por la posición: "caballos", "qué hay en e4".`
    + (idx === tanda.length - 1
        ? ' Es la última: al responder se termina la ronda y se muestra el resultado.'
        : ' Al responder se pasa sola a la siguiente.'));
}

function avanzarEscribiendo(resumen) {
  if (idx === tanda.length - 1) { terminar(); return; }
  idx += 1;
  pintarPregunta();
  comandos.decir(`${resumen} Posición ${idx + 1} de ${tanda.length}: ${tanda[idx].enunciado}`);
  comandos.enfocar();
}

function responderEscribiendo(texto, api) {
  const item = tanda[idx];
  const i = CuadroComandos.opcionPedida(texto, item.opciones.length);
  if (i === null) {
    api.decir(`No entendí "${texto}". Escribe la letra de una opción, de la A a la ${CuadroComandos.letra(item.opciones.length - 1)}.`);
    return;
  }
  // `i` es la POSICIÓN en la lista barajada; lo que se guarda es cuál opción
  // del ítem es esa. Guardar la posición dejaría la respuesta atada al barajado.
  const orden = item.__orden;
  respuestas[item.id] = orden[i];
  api.limpiar();
  avanzarEscribiendo(`Anotado: opción ${CuadroComandos.letra(i)}.`);
}

/* ---------------- Corrección ---------------- */
function construirDetalle() {
  const areas = {};
  tanda.forEach((item) => {
    const dada = respuestas[item.id];
    const ok = dada !== undefined && dada === item.correcta;
    const a = areas[item.area] || (areas[item.area] = { aciertos: 0, total: 0 });
    a.total += 1;
    if (ok) a.aciertos += 1;
  });
  return {
    version: 1,
    fecha: new Date().toISOString(),
    modo: tanda.length === PRUEBA.TOTAL ? 'completa' : 'corta',
    cantidad: tanda.length,
    items: tanda.map((i) => i.id),
    respuestas: tanda.reduce((o, i) => { o[i.id] = respuestas[i.id] === undefined ? null : respuestas[i.id]; return o; }, {}),
    areas,
  };
}

async function terminar() {
  const detalle = construirDetalle();
  const resumen = CRITERIO.resumir(detalle);
  const subida = guardar(detalle, resumen);
  mostrarResultado(detalle, resumen);
  $('r-guardado').textContent = 'Guardando el resultado…';
  $('r-guardado').textContent = (await subida)
    ? 'Resultado guardado en tu cuenta.'
    : 'No se pudo guardar en línea; el resultado quedó solo en esta pantalla.';
}

async function guardar(detalle, resumen) {
  const ficha = {
    fecha: detalle.fecha, modo: detalle.modo, cantidad: detalle.cantidad,
    aciertos: resumen.aciertos, total: resumen.total, porcentaje: resumen.porcentaje,
    veredicto: resumen.veredicto.etiqueta,
  };
  try { localStorage.setItem(CLAVE_RESULTADO, JSON.stringify({ ficha, detalle })); } catch (e) {}
  if (!perfil) return false;
  try {
    const previo = await leerEstado(CLAVE_HISTORIAL);
    const historial = Array.isArray(previo) ? previo : [];
    historial.unshift(ficha);
    const ok1 = await escribirEstado(CLAVE_RESULTADO, { ficha, detalle });
    const ok2 = await escribirEstado(CLAVE_HISTORIAL, historial.slice(0, 10));
    return ok1 && ok2;
  } catch (e) { return false; }
}

/* training_state guarda cadenas dentro de {raw}, igual que js/progreso-usuario.js
   y el examen de arbitraje: así las tres cosas conviven sin pisarse. */
async function escribirEstado(clave, valor) {
  const { error } = await sb.from('training_state').upsert(
    { student_id: perfil.id, key: clave, value: { raw: JSON.stringify(valor) }, updated_at: new Date().toISOString() },
    { onConflict: 'student_id,key' });
  return !error;
}
async function leerEstado(clave) {
  const { data } = await sb.from('training_state').select('value').eq('student_id', perfil.id).eq('key', clave).maybeSingle();
  if (!data || !data.value || typeof data.value.raw !== 'string') return null;
  try { return JSON.parse(data.value.raw); } catch (e) { return null; }
}

function mostrarResultado(detalle, resumen) {
  irA('resultado-view');
  $('r-veredicto').textContent = resumen.veredicto.etiqueta;
  $('r-texto').textContent = resumen.veredicto.texto;
  $('r-marcador').textContent = `${resumen.aciertos} de ${resumen.total} planes correctos · ${resumen.porcentaje}%.`;

  const areas = $('r-areas');
  areas.innerHTML = '';
  resumen.porArea.filter((a) => a.total > 0).forEach((a) => {
    const color = a.porcentaje >= 85 ? 'bg-green-500' : a.porcentaje >= 60 ? 'bg-accent-500' : 'bg-red-500';
    const banda = a.porcentaje >= 85 ? 'firme' : a.porcentaje >= 60 ? 'aceptable' : 'a reforzar';
    const fila = document.createElement('div');
    fila.className = 'bg-white dark:bg-brand-900 rounded-xl shadow-md p-4';
    fila.innerHTML = `
      <div class="flex items-center justify-between gap-3 mb-1">
        <p class="font-semibold text-brand-800 dark:text-white text-sm">${a.emoji} ${esc(a.nombre)}</p>
        <p class="text-sm text-brand-500 dark:text-brand-300">${a.aciertos}/${a.total} · ${a.porcentaje}% · ${banda}</p>
      </div>
      <div class="w-full h-2 bg-brand-100 dark:bg-brand-800 rounded-full overflow-hidden mb-2"><div class="h-full ${color}" style="width:${a.porcentaje}%"></div></div>
      <p class="text-xs text-brand-450 dark:text-brand-350">${esc(a.mide)}</p>`;
    areas.appendChild(fila);
  });

  $('r-plan-wrap').classList.toggle('hidden', resumen.aReforzar.length === 0);
  const plan = $('r-plan');
  plan.innerHTML = '';
  resumen.aReforzar.forEach((a) => {
    const caja = document.createElement('div');
    caja.className = 'bg-white dark:bg-brand-900 rounded-xl shadow-md p-4';
    caja.innerHTML = `
      <p class="font-serif font-bold text-brand-800 dark:text-white mb-1">${a.emoji} ${esc(a.nombre)} — ${a.porcentaje}%</p>
      <p class="text-sm text-brand-600 dark:text-brand-300">${esc(a.estudiar)}</p>`;
    plan.appendChild(caja);
  });
  if (resumen.firmes.length) {
    const p = document.createElement('p');
    p.className = 'text-sm text-brand-500 dark:text-brand-300';
    p.textContent = 'Lo que tienes firme: ' + resumen.firmes.map((f) => f.nombre.toLowerCase()).join(', ') + '.';
    plan.appendChild(p);
  }

  const rev = $('r-revision');
  rev.innerHTML = '';
  tanda.forEach((item, i) => {
    const dada = detalle.respuestas[item.id];
    const ok = dada !== null && dada === item.correcta;
    const det = document.createElement('details');
    det.className = 'bg-white dark:bg-brand-900 rounded-xl shadow-md px-4 py-3';
    det.innerHTML = `
      <summary class="cursor-pointer text-sm font-medium text-brand-700 dark:text-brand-200">${ok ? '✅' : (dada === null ? '○' : '❌')} ${i + 1}. ${esc(item.enunciado)}</summary>
      <p class="text-sm text-brand-600 dark:text-brand-300 mt-2"><strong>Plan correcto:</strong> ${esc(item.opciones[item.correcta])}</p>
      ${!ok && dada !== null ? `<p class="text-sm text-brand-500 dark:text-brand-300 mt-1"><strong>Tu respuesta:</strong> ${esc(item.opciones[dada])}</p>` : ''}
      <p class="text-xs text-brand-500 dark:text-brand-300 mt-2">${esc(item.explica)}</p>
      <p class="text-xs text-accent-700 dark:text-accent-400 mt-1">${esc(item.fuente)}</p>`;
    rev.appendChild(det);
  });
}

/* ---------------- Portada: resultado previo ---------------- */
async function pintarPrevio() {
  let guardado = null;
  if (perfil) guardado = await leerEstado(CLAVE_RESULTADO);
  if (!guardado) { try { guardado = JSON.parse(localStorage.getItem(CLAVE_RESULTADO) || 'null'); } catch (e) {} }
  if (!guardado || !guardado.ficha) return;
  const f = guardado.ficha;
  $('previo').classList.remove('hidden');
  $('previo').innerHTML = `
    <h2 class="font-serif text-lg font-bold text-brand-800 dark:text-white mb-1">Tu última ronda</h2>
    <p class="text-sm text-brand-500 dark:text-brand-300">El ${fechaCorta(f.fecha)} sacaste ${f.porcentaje}% (${f.aciertos}/${f.total}) — <strong class="text-brand-800 dark:text-white">${esc(f.veredicto)}</strong>.</p>`;
}

/* ---------------- Arranque ---------------- */
$('start-btn').addEventListener('click', empezar);
$('repeat-btn').addEventListener('click', () => { irA('intro-view'); pintarPrevio(); });
$('prev-btn').addEventListener('click', () => { if (idx > 0) { idx--; pintarPregunta(); } });
$('next-btn').addEventListener('click', () => {
  if (idx === tanda.length - 1) { terminar(); return; }
  idx++; pintarPregunta();
});

async function init() {
  $('tam-banco').textContent = PRUEBA.TOTAL;
  let sesion = null;
  try { const { data } = await sb.auth.getSession(); sesion = data && data.session; } catch (e) { sesion = null; }
  if (!sesion) { window.location.href = '../login.html?next=' + encodeURIComponent('entreno/precision-posicional.html'); return; }
  const { data } = await sb.from('profiles').select('id, full_name, email').eq('id', sesion.user.id).maybeSingle();
  perfil = data || null;
  $('gate').classList.add('hidden');
  $('app').classList.remove('hidden');
  await pintarPrevio();
}
init();
    