/* El código de arbitraje.html.

   Vivía escrito dentro de la página, en un <script> de 33 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* ===== Examen de arbitraje FIDE — herramienta del equipo docente =====
 *
 * Mide el conocimiento del reglamento de la FIDE de quien arbitra y estima a
 * qué nivel de arbitraje corresponde. El banco de preguntas está en
 * js/arbitraje-items.js y el criterio (áreas, escalones, nivel) en
 * js/arbitraje-nivel.js.
 *
 * Quién entra: solo perfiles con role = 'profesor' o is_admin. El acceso desde
 * el panel de Academia tampoco se muestra a los demás, pero el filtro que vale
 * es el de esta página. Como todo en el sitio, es del lado del navegador: el
 * banco de preguntas es un archivo estático y quien conozca la dirección puede
 * leerlo. Por eso el examen sirve para formarse, no para certificar.
 *
 * El resultado se guarda en la tabla training_state (claves
 * arbitraje_resultado_v1 y arbitraje_historial_v1), que ya tiene RLS: cada
 * quien ve lo suyo y quien administra ve el de todo el equipo. No hace falta
 * ninguna tabla nueva.
 */
const BANCO = window.ARBITRAJE_ITEMS;
const PRUEBA = window.ArbitrajePrueba;
const AN = window.ArbitrajeNivel;

let MINUTOS = 50;
const CLAVE_RESULTADO = 'arbitraje_resultado_v1';
const CLAVE_HISTORIAL = 'arbitraje_historial_v1';
const EN_BLANCO = 'blanco';

let perfil = null;
let sesion = null;             // sesión de quien entra (para el token de las edge functions)
let examen = [];              // las preguntas de este intento
let respuestas = {};          // id → índice elegido, o EN_BLANCO
let idx = 0;
let quedan = MINUTOS * 60;
let cronometro = null;
let nivelExamen = null;       // { clave, techo, etiqueta, minutos } del examen elegido, o null = completo

/* ---------------- Utilidades ---------------- */
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const estrellas = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const reloj = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
const fechaCorta = (iso) => new Date(iso).toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' });

function irA(vista) {
  ['intro-view', 'examen-view', 'resultado-view'].forEach((id) => $(id).classList.toggle('hidden', id !== vista));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------- El examen ---------------- */
function empezar() {
  const seleccion = document.querySelector('input[name="nivel-examen"]:checked');
  nivelExamen = (seleccion && seleccion.value) ? PRUEBA.NIVEL_EXAMEN_POR_CLAVE[seleccion.value] : null;
  MINUTOS = nivelExamen ? nivelExamen.minutos : 50;
  examen = PRUEBA.armar(null, undefined, nivelExamen ? nivelExamen.techo : null);
  respuestas = {};
  idx = 0;
  quedan = MINUTOS * 60;
  irA('examen-view');
  pintarPregunta();
  $('q-timer').textContent = reloj(quedan);
  clearInterval(cronometro);
  cronometro = setInterval(tic, 1000);
}

function tic() {
  quedan -= 1;
  $('q-timer').textContent = reloj(Math.max(quedan, 0));
  $('q-timer').className = 'text-sm font-mono font-semibold ' +
    (quedan <= 120 ? 'text-red-600 dark:text-red-400' : 'text-brand-500 dark:text-brand-300');
  if (quedan <= 0) { clearInterval(cronometro); terminar(true); }
}

function pintarPregunta() {
  const item = examen[idx];
  const area = AN.AREA_POR_ID[item.area];
  $('q-counter').textContent = `Pregunta ${idx + 1} de ${examen.length}`;
  $('q-bar').style.width = ((idx / examen.length) * 100) + '%';
  $('q-area').textContent = `${area.emoji} ${area.nombre}`;
  $('q-escalon').textContent = estrellas(item.peso);
  $('q-escalon').title = `Escalón de dificultad ${item.peso} de 5`;
  $('q-text').textContent = item.enunciado;
  $('prev-btn').classList.toggle('invisible', idx === 0);
  $('next-btn').textContent = idx === examen.length - 1 ? 'Terminar y ver el resultado →' : 'Siguiente →';

  // Las opciones se barajan en cada pregunta: escritas siempre en el mismo
  // orden, la correcta quedaría siempre en el mismo lugar.
  const caja = $('q-options');
  caja.innerHTML = '';
  const orden = item.__orden || (item.__orden = barajar(item.opciones.map((_, i) => i)));
  orden.forEach((original) => {
    caja.appendChild(botonOpcion(item, original, respuestas[item.id] === original));
  });
  const blanco = document.createElement('button');
  blanco.type = 'button';
  blanco.className = claseBlanco(respuestas[item.id] === EN_BLANCO);
  blanco.textContent = '○ Dejar en blanco';
  blanco.addEventListener('click', () => { respuestas[item.id] = EN_BLANCO; pintarPregunta(); });
  caja.appendChild(blanco);
  prepararComandos(item);
}

/* ---------------- El cuadro de comandos (Modo Adaptado) ----------------
 * El examen solo se podía contestar apretando el botón de la opción. Con
 * lector de pantalla eso se oye, pero no dice CUÁL es cuál: "la segunda" hay
 * que contarla. Ahora cada opción lleva su letra escrita —"Opción A. …"— y la
 * respuesta también se escribe.
 *
 * El cuadro se monta UNA vez, fuera de #q-options (que se repinta entero en
 * cada clic), y lo que decide si se ve es el CSS. Ver js/cuadro-comandos.js. */
let comandos = null;

function prepararComandos(item) {
  if (!window.CuadroComandos) return;
  if (!comandos) {
    comandos = CuadroComandos.montar($('q-comandos'), { onEnviar: responderEscribiendo });
  }
  comandos.etiqueta('Escribe la letra de la opción');
  // Al responder por el cuadro se pasa solo a la siguiente, así que hay que
  // decir de antemano qué va a hacer ese Enter — y sobre todo cuando es el que
  // termina el examen.
  comandos.ayuda(`Opciones de la A a la ${CuadroComandos.letra(item.opciones.length - 1)}. `
    + 'Puedes escribir solo la letra ("B"), "opción B", o "en blanco".'
    + (idx === examen.length - 1
        ? ' Es la última: al responder se termina el examen y se muestra el resultado.'
        : ' Al responder se pasa sola a la siguiente.'));
}

/* Contestar por el cuadro PASA SOLA a la siguiente pregunta: quien contesta
   escribiendo no tiene por qué ir a buscar el botón "Siguiente", que es
   justamente lo que este cuadro viene a evitar.
 *
 * Y por eso el aviso lleva el enunciado de la pregunta nueva: al no pasar por
 * el botón ya no hay nada que anuncie el cambio, y quien escucha se quedaría
 * contestando a ciegas una pregunta que nunca oyó. El aviso es región viva, así
 * que se lee solo. Los botones de opción NO avanzan: ahí se ve la pantalla, y
 * además este examen deja volver atrás con "Anterior". */
function avanzarEscribiendo(resumen) {
  if (idx === examen.length - 1) { terminar(false); return; }
  idx += 1;
  pintarPregunta();
  comandos.decir(`${resumen} Pregunta ${idx + 1} de ${examen.length}: ${examen[idx].enunciado}`);
  comandos.enfocar();
}

function responderEscribiendo(texto, api) {
  const item = examen[idx];
  if (CuadroComandos.esNoSe(texto)) {
    respuestas[item.id] = EN_BLANCO;
    api.limpiar();
    avanzarEscribiendo('Anotado: en blanco.');
    return;
  }
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
  avanzarEscribiendo(`Anotado: opción ${CuadroComandos.letra(i)}, ${item.opciones[orden[i]]}.`);
}


function botonOpcion(item, original, elegida) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = claseOpcion(elegida);
  // La letra va ESCRITA en el botón, no puesta con CSS: es lo que hay que
  // decir para contestar por el cuadro de comandos, así que quien la oye tiene
  // que oírla de la misma lista que lee.
  b.textContent = `Opción ${CuadroComandos.letra(item.__orden.indexOf(original))}. ${item.opciones[original]}`;
  b.addEventListener('click', () => { respuestas[item.id] = original; pintarPregunta(); });
  return b;
}

const claseOpcion = (sel) => 'w-full text-left px-4 py-3 rounded-xl border-2 transition-colors text-sm ' +
  (sel ? 'border-accent-500 bg-accent-50 dark:bg-brand-800 text-brand-800 dark:text-white font-medium'
       : 'border-brand-100 dark:border-brand-700 hover:border-accent-400 text-brand-600 dark:text-brand-300');
const claseBlanco = (sel) => 'w-full text-left px-4 py-2.5 rounded-xl border-2 border-dashed transition-colors text-sm italic ' +
  (sel ? 'border-brand-400 bg-brand-50 dark:bg-brand-800 text-brand-700 dark:text-brand-200'
       : 'border-brand-200 dark:border-brand-700 hover:border-brand-400 text-brand-450 dark:text-brand-350');

function barajar(lista) {
  const c = lista.slice();
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = c[i]; c[i] = c[j]; c[j] = t; }
  return c;
}

/* ---------------- Corrección ---------------- */
function construirDetalle(porTiempo) {
  const areas = {}, dificultad = {}, dadas = {};
  examen.forEach((item) => {
    const dada = respuestas[item.id];
    const ok = dada !== undefined && dada !== EN_BLANCO && dada === item.correcta;
    const blanco = dada === undefined || dada === EN_BLANCO;
    const a = areas[item.area] || (areas[item.area] = { peso: 0, logrado: 0, aciertos: 0, total: 0, nosabe: 0 });
    const e = dificultad[item.peso] || (dificultad[item.peso] = { aciertos: 0, total: 0, nosabe: 0 });
    a.peso += item.peso; a.total += 1; e.total += 1;
    if (ok) { a.logrado += item.peso; a.aciertos += 1; e.aciertos += 1; }
    if (blanco) { a.nosabe += 1; e.nosabe += 1; }
    dadas[item.id] = blanco ? null : dada;
  });
  return {
    version: 1,
    fecha: new Date().toISOString(),
    items: examen.map((i) => i.id),
    respuestas: dadas,
    areas, dificultad,
    por_tiempo: !!porTiempo,
    minutos_usados: Math.round((MINUTOS * 60 - Math.max(quedan, 0)) / 60),
    examen_elegido: nivelExamen ? nivelExamen.clave : 'completo',
  };
}

async function terminar(porTiempo) {
  clearInterval(cronometro);
  const detalle = construirDetalle(porTiempo);
  const resumen = AN.resumir(detalle);
  detalle.nivel = resumen.nivel.clave;
  detalle.nivel_etiqueta = resumen.nivel.etiqueta;
  detalle.porcentaje = resumen.porcentaje;
  detalle.escalon = resumen.escalonAlcanzado;

  const subida = guardar(detalle, resumen);
  mostrarResultado(detalle, resumen, porTiempo);
  $('r-guardado').textContent = 'Guardando el resultado…';
  $('r-guardado').textContent = (await subida)
    ? 'Resultado guardado en tu cuenta.'
    : 'No se pudo guardar en línea; el resultado quedó solo en esta pantalla.';
}

async function guardar(detalle, resumen) {
  const ficha = {
    fecha: detalle.fecha, nivel: resumen.nivel.etiqueta, nivel_clave: resumen.nivel.clave,
    escalon: resumen.escalonAlcanzado, porcentaje: resumen.porcentaje,
    aciertos: resumen.aciertos, total: resumen.total, en_blanco: resumen.nosabe,
    por_tiempo: detalle.por_tiempo, minutos: detalle.minutos_usados,
    examen_elegido: detalle.examen_elegido,
  };
  try { localStorage.setItem(CLAVE_RESULTADO, JSON.stringify({ ficha, detalle })); } catch (e) {}
  if (!perfil) return false;
  try {
    const previo = await leerEstado(perfil.id, CLAVE_HISTORIAL);
    const historial = Array.isArray(previo) ? previo : [];
    historial.unshift(ficha);
    const ok1 = await escribirEstado(CLAVE_RESULTADO, { ficha, detalle });
    const ok2 = await escribirEstado(CLAVE_HISTORIAL, historial.slice(0, 10));
    return ok1 && ok2;
  } catch (e) { return false; }
}

/* training_state guarda cadenas dentro de {raw}: es la misma forma que usa
   js/progreso-usuario.js, así que las dos cosas conviven sin pisarse. */
async function escribirEstado(clave, valor) {
  const { error } = await sb.from('training_state').upsert(
    { student_id: perfil.id, key: clave, value: { raw: JSON.stringify(valor) }, updated_at: new Date().toISOString() },
    { onConflict: 'student_id,key' });
  return !error;
}
async function leerEstado(id, clave) {
  const { data } = await sb.from('training_state').select('value').eq('student_id', id).eq('key', clave).maybeSingle();
  if (!data || !data.value || typeof data.value.raw !== 'string') return null;
  try { return JSON.parse(data.value.raw); } catch (e) { return null; }
}

function mostrarResultado(detalle, resumen, porTiempo) {
  irA('resultado-view');
  $('r-titulo-examen').textContent = nivelExamen ? `Resultado del examen de ${nivelExamen.etiqueta}` : 'Resultado del examen';
  $('r-nivel').textContent = resumen.nivel.etiqueta;
  $('r-descripcion').textContent = resumen.nivel.descripcion;
  $('r-marcador').textContent =
    `${resumen.aciertos} de ${resumen.total} respuestas correctas · ${resumen.porcentaje}% del examen` +
    (resumen.nosabe ? ` · ${resumen.nosabe} en blanco` : '') +
    ` · equivale a ${resumen.nivel.referencia}` +
    (porTiempo ? ' · se acabó el tiempo antes de terminar' : `, en ${detalle.minutos_usados} minutos`) + '.';

  // La escalera: de dónde sale el nivel.
  const alc = resumen.escalonAlcanzado;
  $('r-escalones').innerHTML =
    '<p class="text-sm font-semibold text-brand-700 dark:text-brand-200 mb-1">Hasta dónde llegaste</p>' +
    `<p class="text-xs text-brand-450 dark:text-brand-350 mb-3">El nivel es el escalón más alto superado con ${Math.round(AN.UMBRAL * 100)}% o más de aciertos, no el porcentaje total. Un área floja pone techo: no se dirige a nivel internacional con un capítulo del reglamento en blanco.</p>` +
    '<div class="space-y-1.5">' + resumen.escalones.filter((e) => e.total).map((e) => `
      <div class="flex items-center gap-2 text-sm">
        <span class="w-20 shrink-0 text-brand-500 dark:text-brand-300">${estrellas(e.peso)}</span>
        <div class="flex-1 h-2 bg-brand-100 dark:bg-brand-800 rounded-full overflow-hidden">
          <div class="h-full ${e.peso <= alc ? 'bg-green-500' : 'bg-brand-300 dark:bg-brand-700'}" style="width:${e.porcentaje}%"></div>
        </div>
        <span class="w-24 shrink-0 text-right text-brand-500 dark:text-brand-300">${e.aciertos}/${e.total} · ${e.porcentaje}%</span>
        <span class="w-24 shrink-0 text-xs ${e.peso <= alc ? 'text-green-600 dark:text-green-400' : 'text-brand-450 dark:text-brand-350'}">${e.peso <= alc ? 'superado' : 'todavía no'}</span>
      </div>`).join('') + '</div>' +
    (resumen.topeAreas < 5 && resumen.topeAreas === alc
      ? '<p class="text-xs text-accent-700 dark:text-accent-400 mt-3">El nivel quedó limitado por un área con pocos aciertos, no por los escalones: revisa la tabla de abajo.</p>' : '');

  const areas = $('r-areas');
  areas.innerHTML = '';
  resumen.porArea.forEach((a) => {
    const color = a.porcentaje >= 85 ? 'bg-green-500' : a.porcentaje >= 60 ? 'bg-accent-500' : 'bg-red-500';
    const banda = a.porcentaje >= 85 ? 'firme' : a.porcentaje >= 60 ? 'aceptable' : 'a reforzar';
    const fila = document.createElement('div');
    fila.className = 'bg-white dark:bg-brand-900 rounded-xl shadow-md p-4';
    fila.innerHTML = `
      <div class="flex items-center justify-between gap-3 mb-1">
        <p class="font-semibold text-brand-800 dark:text-white text-sm">${a.emoji} ${esc(a.nombre)}</p>
        <p class="text-sm text-brand-500 dark:text-brand-300">${a.aciertos}/${a.total} · ${a.porcentaje}% · ${banda}${a.nosabe ? ` · ${a.nosabe} en blanco` : ''}</p>
      </div>
      <div class="w-full h-2 bg-brand-100 dark:bg-brand-800 rounded-full overflow-hidden mb-2"><div class="h-full ${color}" style="width:${a.porcentaje}%"></div></div>
      <p class="text-xs text-brand-450 dark:text-brand-350">${esc(a.mide)}</p>`;
    areas.appendChild(fila);
  });

  const plan = $('r-plan');
  plan.innerHTML = '';
  const aReforzar = resumen.aReforzar.length ? resumen.aReforzar : resumen.porArea.slice().sort((x, y) => x.porcentaje - y.porcentaje).slice(0, 1);
  aReforzar.forEach((a) => {
    const caja = document.createElement('div');
    caja.className = 'bg-white dark:bg-brand-900 rounded-xl shadow-md p-4';
    caja.innerHTML = `
      <p class="font-serif font-bold text-brand-800 dark:text-white mb-1">${a.emoji} ${esc(a.nombre)} — ${a.porcentaje}%</p>
      <p class="text-xs text-brand-500 dark:text-brand-300 mb-2">${esc(a.flojo)}</p>
      <p class="text-sm text-brand-600 dark:text-brand-300"><strong>Para estudiar:</strong> ${esc(a.estudiar)}</p>`;
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
  examen.forEach((item, i) => {
    const dada = detalle.respuestas[item.id];
    const ok = dada !== null && dada === item.correcta;
    const blanco = dada === null;
    const det = document.createElement('details');
    det.className = 'bg-white dark:bg-brand-900 rounded-xl shadow-md px-4 py-3';
    det.innerHTML = `
      <summary class="cursor-pointer text-sm font-medium text-brand-700 dark:text-brand-200">${ok ? '✅' : (blanco ? '○' : '❌')} ${i + 1}. ${esc(item.enunciado)}</summary>
      <p class="text-sm text-brand-600 dark:text-brand-300 mt-2"><strong>Correcta:</strong> ${esc(item.opciones[item.correcta])}</p>
      ${!ok && !blanco ? `<p class="text-sm text-brand-500 dark:text-brand-300 mt-1"><strong>Tu respuesta:</strong> ${esc(item.opciones[dada])}</p>` : ''}
      <p class="text-xs text-brand-500 dark:text-brand-300 mt-2">${esc(item.explica)}</p>
      <p class="text-xs text-accent-700 dark:text-accent-400 mt-1"><strong>Fuente:</strong> ${esc(item.fuente)}${/Handbook/.test(item.fuente) ? ' · <a href="https://handbook.fide.com/" target="_blank" rel="noopener" class="underline">handbook.fide.com</a>' : ''}</p>`;
    rev.appendChild(det);
  });
}

/* ---------------- Portada: resultado previo y equipo ---------------- */
async function pintarPrevio() {
  let guardado = null;
  if (perfil) guardado = await leerEstado(perfil.id, CLAVE_RESULTADO);
  if (!guardado) { try { guardado = JSON.parse(localStorage.getItem(CLAVE_RESULTADO) || 'null'); } catch (e) {} }
  if (!guardado || !guardado.ficha) return;
  const f = guardado.ficha;
  const historial = (await leerEstado(perfil.id, CLAVE_HISTORIAL)) || [];
  $('previo').classList.remove('hidden');
  $('previo').innerHTML = `
    <h2 class="font-serif text-lg font-bold text-brand-800 dark:text-white mb-1">Tu último examen</h2>
    <p class="text-sm text-brand-500 dark:text-brand-300">El ${fechaCorta(f.fecha)} quedaste en <strong class="text-brand-800 dark:text-white">${esc(f.nivel)}</strong> con ${f.porcentaje}% (${f.aciertos}/${f.total}${f.en_blanco ? `, ${f.en_blanco} en blanco` : ''}).</p>
    ${historial.length > 1 ? `<p class="text-xs text-brand-450 dark:text-brand-350 mt-2">Antes: ${historial.slice(1, 4).map((h) => `${fechaCorta(h.fecha)} — ${esc(h.nivel)} (${h.porcentaje}%)`).join(' · ')}</p>` : ''}`;
}

/* Quien administra ve cómo va todo el equipo: es la misma regla de siempre
   —lo que existe para profesores existe para administración—, y acá además
   sirve para organizar la formación del equipo arbitral. */
/* ---------------- Exámenes del público ----------------
 *
 * Los que llegan desde nivel-de-arbitraje.html, que es abierto. La tabla
 * arbitrajes_publicos solo la leen profesores y administración (RLS), así que
 * esto no se muestra a nadie más. La retroalimentación se escribe acá, queda
 * guardada con la fecha y quién la escribió, y se manda con el botón de correo:
 * abre el cliente de correo con el mensaje puesto, para que salga de la
 * dirección de quien responde y no de un robot. */
let publicos = [];

async function pintarPublicos() {
  const { data, error } = await sb.from('arbitrajes_publicos')
    .select('id, created_at, nombre, email, porcentaje, nivel, detalle, revisado, retroalimentacion, revisado_at, resultado_enviado_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return;
  publicos = data || [];
  const caja = $('publicos');
  caja.classList.remove('hidden');
  const pendientes = publicos.filter((r) => !r.revisado).length;
  caja.innerHTML = `
    <h2 class="font-serif text-xl font-bold text-brand-800 dark:text-white mb-1">📥 Exámenes del público${pendientes ? ` <span class="text-sm font-sans font-semibold text-accent-700 dark:text-accent-400">· ${pendientes} sin responder</span>` : ''}</h2>
    <p class="text-xs text-brand-450 dark:text-brand-350 mb-3">Quienes hicieron el examen desde <a href="nivel-de-arbitraje.html" class="underline">la página abierta</a>. Escribe la retroalimentación, guárdala y mándala por correo.</p>
    <div id="publicos-lista" class="space-y-3"></div>`;
  const lista = $('publicos-lista');
  if (!publicos.length) {
    lista.innerHTML = '<p class="text-sm text-brand-450 dark:text-brand-350 bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4">Todavía no ha llegado ninguno.</p>';
    return;
  }
  publicos.forEach((r) => lista.appendChild(fichaPublico(r)));
}

function fichaPublico(r) {
  const det = document.createElement('details');
  det.className = 'bg-white dark:bg-brand-900 rounded-2xl shadow-md px-4 py-3';
  if (!r.revisado) det.open = true;
  const areas = (r.detalle && r.detalle.areas) || {};
  const porArea = AN.AREAS.map((a) => {
    const d = areas[a.id];
    if (!d || !d.peso) return null;
    return { ...a, porcentaje: Math.round((d.logrado / d.peso) * 100), aciertos: d.aciertos, total: d.total, nosabe: d.nosabe };
  }).filter(Boolean);
  const flojas = porArea.filter((a) => a.porcentaje < 60).sort((x, y) => x.porcentaje - y.porcentaje);

  det.innerHTML = `
    <summary class="cursor-pointer text-sm font-medium text-brand-700 dark:text-brand-200 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>${r.revisado ? '✅' : '🟡'}</span>
      <strong>${esc(r.nombre)}</strong>
      <span class="text-brand-450 dark:text-brand-350">${esc(r.email)}</span>
      <span class="text-brand-500 dark:text-brand-300">${esc(r.nivel || '—')} · ${r.porcentaje == null ? '—' : r.porcentaje + '%'}</span>
      <span class="text-xs text-brand-450 dark:text-brand-350">${fechaCorta(r.created_at)}</span>
    </summary>
    <div class="mt-3 space-y-3">
      <div class="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
        ${porArea.map((a) => `<div class="flex items-center justify-between gap-2">
          <span class="text-brand-600 dark:text-brand-300">${a.emoji} ${esc(a.nombre)}</span>
          <span class="${a.porcentaje < 60 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-brand-500 dark:text-brand-300'}">${a.aciertos}/${a.total} · ${a.porcentaje}%${a.nosabe ? ` · ${a.nosabe} en blanco` : ''}</span>
        </div>`).join('')}
      </div>
      ${flojas.length ? `<p class="text-xs text-brand-500 dark:text-brand-300"><strong>A reforzar:</strong> ${flojas.map((a) => esc(a.estudiar)).join(' · ')}</p>` : ''}
      <div>
        <label class="block text-xs font-semibold text-brand-600 dark:text-brand-300 mb-1" for="rt-${r.id}">Retroalimentación</label>
        <textarea id="rt-${r.id}" rows="5" class="w-full px-3 py-2 text-sm rounded-xl border-2 border-brand-100 dark:border-brand-700 bg-white dark:bg-brand-800 text-brand-800 dark:text-white focus:border-accent-500 focus:outline-none">${esc(r.retroalimentacion || '')}</textarea>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" data-guardar="${r.id}" class="bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors">Guardar</button>
        <button type="button" data-correo="${r.id}" class="border border-brand-200 dark:border-brand-700 text-brand-600 dark:text-brand-300 font-semibold px-4 py-2 rounded-lg text-sm hover:border-accent-500 transition-colors">✉️ Guardar y abrir el correo</button>
        <button type="button" data-borrador="${r.id}" class="text-xs text-brand-450 dark:text-brand-350 hover:text-accent-600 transition-colors">Armar un borrador</button>
        <span class="text-xs text-brand-450 dark:text-brand-350" data-estado="${r.id}">${r.revisado ? 'Respondido el ' + fechaCorta(r.revisado_at || r.created_at) : 'Sin responder'}</span>
      </div>
      <div class="border-t border-brand-100 dark:border-brand-800 pt-3">
        <p class="text-xs font-semibold text-brand-600 dark:text-brand-300 mb-1">Enviar las respuestas del examen por correo (aparte de la retroalimentación)</p>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" data-enviar-todo="${r.id}" class="border border-brand-200 dark:border-brand-700 text-brand-600 dark:text-brand-300 font-semibold px-4 py-2 rounded-lg text-sm hover:border-accent-500 transition-colors">📧 Enviar todas las respuestas</button>
          <button type="button" data-enviar-errores="${r.id}" class="border border-brand-200 dark:border-brand-700 text-brand-600 dark:text-brand-300 font-semibold px-4 py-2 rounded-lg text-sm hover:border-accent-500 transition-colors">📧 Enviar solo las que tuvo mal</button>
          <span class="text-xs text-brand-450 dark:text-brand-350" data-estado-correo="${r.id}">${r.resultado_enviado_at ? 'Enviado el ' + fechaCorta(r.resultado_enviado_at) : ''}</span>
        </div>
      </div>
    </div>`;

  det.querySelector(`[data-guardar="${r.id}"]`).addEventListener('click', () => guardarRetro(r, false));
  det.querySelector(`[data-correo="${r.id}"]`).addEventListener('click', () => guardarRetro(r, true));
  det.querySelector(`[data-borrador="${r.id}"]`).addEventListener('click', async () => {
    const caja = det.querySelector(`#rt-${r.id}`);
    if (caja.value.trim() && !(await Avisos.confirmar('Lo que ya escribiste se cambia por el borrador.', { titulo: 'Ya hay algo escrito', aceptar: 'Reemplazar' }))) return;
    caja.value = borrador(r, porArea, flojas);
  });
  det.querySelector(`[data-enviar-todo="${r.id}"]`).addEventListener('click', () => enviarResultadoCorreo(r, false));
  det.querySelector(`[data-enviar-errores="${r.id}"]`).addEventListener('click', () => enviarResultadoCorreo(r, true));
  return det;
}

/* Envío real por correo (Resend, vía la edge function) de las respuestas del
 * examen — completas o solo las que tuvo mal — con la explicación y el
 * artículo del Handbook de cada una. Es aparte de la retroalimentación
 * escrita a mano de arriba: esto es la corrección en sí, automática. */
async function enviarResultadoCorreo(r, soloErrores) {
  const estado = document.querySelector(`[data-estado-correo="${r.id}"]`);
  const mensaje = soloErrores
    ? `¿Enviar por correo a ${r.email} solo las preguntas que tuvo mal?`
    : `¿Enviar por correo a ${r.email} el examen completo con todas las respuestas?`;
  if (!(await Avisos.confirmar(mensaje, { aceptar: 'Enviar' }))) return;
  estado.textContent = 'Enviando…';
  try {
    const res = await fetch(`${window.SUPABASE_URL}/functions/v1/enviar-resultado-arbitraje`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sesion.access_token}`,
        'apikey': window.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ id: r.id, soloErrores }),
    });
    const resultado = await res.json().catch(() => ({}));
    if (!res.ok || resultado.error) throw new Error(resultado.error || 'Error desconocido');
    r.resultado_enviado_at = new Date().toISOString();
    estado.textContent = soloErrores
      ? `Enviadas ${resultado.relevantes} de ${resultado.total} preguntas (las que tuvo mal) — ahora mismo`
      : `Enviadas las ${resultado.total} preguntas — ahora mismo`;
  } catch (err) {
    estado.textContent = 'No se pudo enviar: ' + err.message;
  }
}

/* Un punto de partida, no la respuesta: el profesor lo corrige y lo firma. */
function borrador(r, porArea, flojas) {
  const firmes = porArea.filter((a) => a.porcentaje >= 85).map((a) => a.nombre.toLowerCase());
  const nombre = String(r.nombre || '').trim().split(/\s+/)[0];
  return `Hola ${nombre}:\n\n` +
    `Revisé tu examen de arbitraje. Sacaste ${r.porcentaje}% y el nivel estimado es "${r.nivel}".\n\n` +
    (firmes.length ? `Lo que tienes firme: ${firmes.join(', ')}.\n\n` : '') +
    (flojas.length
      ? `Donde conviene volver al reglamento:\n` + flojas.map((a) => `- ${a.nombre} (${a.porcentaje}%): ${a.estudiar}`).join('\n') + '\n\n'
      : 'No quedó ningún área por debajo del 60%: el siguiente paso es afinar los casos raros.\n\n') +
    `Cualquier duda me escribes.\n\nOscar Angulo Cubero\nAjedrez Integral`;
}

async function guardarRetro(r, abrirCorreo) {
  const caja = $(`rt-${r.id}`);
  const estado = document.querySelector(`[data-estado="${r.id}"]`);
  const texto = caja.value.trim();
  if (!texto) { estado.textContent = 'Escribe la retroalimentación primero.'; return; }
  estado.textContent = 'Guardando…';
  const { error } = await sb.from('arbitrajes_publicos').update({
    retroalimentacion: texto,
    revisado: true,
    revisado_at: new Date().toISOString(),
    revisado_por: perfil.id,
  }).eq('id', r.id);
  if (error) { estado.textContent = 'No se pudo guardar: ' + error.message; return; }
  r.retroalimentacion = texto; r.revisado = true; r.revisado_at = new Date().toISOString();
  estado.textContent = 'Guardada.';
  if (abrirCorreo) {
    const asunto = 'Tu examen de arbitraje — Ajedrez Integral';
    window.location.href = `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`;
  }
}

async function pintarEquipo() {
  if (!perfil.is_admin) return;
  const { data: gente } = await sb.from('profiles').select('id, full_name, email, role, is_admin');
  const docentes = (gente || []).filter((p) => p.role === 'profesor' || p.is_admin === true);
  const { data: filas } = await sb.from('training_state').select('student_id, value, updated_at').eq('key', CLAVE_RESULTADO);
  const porPersona = {};
  (filas || []).forEach((f) => {
    try { porPersona[f.student_id] = JSON.parse(f.value.raw).ficha; } catch (e) {}
  });
  const caja = $('equipo');
  caja.classList.remove('hidden');
  caja.innerHTML = `
    <h2 class="font-serif text-xl font-bold text-brand-800 dark:text-white mb-1">El equipo</h2>
    <p class="text-xs text-brand-450 dark:text-brand-350 mb-3">Último examen de cada profesor y de quien administra. Sirve para saber a quién le toca qué formación, no para calificar a nadie.</p>
    <div class="bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4 overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="text-left text-xs uppercase text-brand-450 dark:text-brand-350 border-b border-brand-100 dark:border-brand-800">
          <th class="py-2 pr-4">Persona</th><th class="py-2 pr-4">Fecha</th><th class="py-2 pr-4">Nivel</th><th class="py-2">%</th></tr></thead>
        <tbody>${docentes.map((p) => {
          const f = porPersona[p.id];
          return `<tr class="border-b border-brand-50 dark:border-brand-800/60 last:border-0">
            <td class="py-2 pr-4 font-medium text-brand-700 dark:text-brand-200">${esc(p.full_name || p.email)}</td>
            <td class="py-2 pr-4 text-brand-500 dark:text-brand-300">${f ? fechaCorta(f.fecha) : '—'}</td>
            <td class="py-2 pr-4 text-brand-500 dark:text-brand-300">${f ? esc(f.nivel) : 'sin examen'}</td>
            <td class="py-2 text-brand-500 dark:text-brand-300">${f ? f.porcentaje + '%' : '—'}</td></tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
}

/* ---------------- Arranque ---------------- */
$('start-btn').addEventListener('click', empezar);
$('repeat-btn').addEventListener('click', () => { irA('intro-view'); pintarPrevio(); });
$('prev-btn').addEventListener('click', () => { if (idx > 0) { idx--; pintarPregunta(); } });
$('next-btn').addEventListener('click', () => {
  if (idx === examen.length - 1) { terminar(false); return; }
  idx++; pintarPregunta();
});
$('abandon-btn').addEventListener('click', async () => {
  if (!(await Avisos.confirmar('El examen se pierde y no queda registrado.', { titulo: '¿Salir del examen?', aceptar: 'Salir', cancelar: 'Seguir con el examen', peligro: true }))) return;
  clearInterval(cronometro);
  irA('intro-view');
});
window.addEventListener('beforeunload', (e) => {
  if (!$('examen-view').classList.contains('hidden')) { e.preventDefault(); e.returnValue = ''; }
});

async function init() {
  $('tam-banco').textContent = BANCO.length;
  document.querySelectorAll('.total-completo').forEach((el) => { el.textContent = PRUEBA.TOTAL; });
  PRUEBA.NIVELES_EXAMEN.forEach((n) => {
    document.querySelectorAll('.total-' + n.clave).forEach((el) => { el.textContent = PRUEBA.totalPara(n.techo); });
  });
  document.querySelectorAll('.banco-total').forEach((el) => { el.textContent = BANCO.length; });
  try { const { data } = await sb.auth.getSession(); sesion = data && data.session; } catch (e) { sesion = null; }
  if (!sesion) { window.location.href = 'login.html?next=' + encodeURIComponent('arbitraje.html'); return; }
  const { data } = await sb.from('profiles').select('id, full_name, email, role, is_admin').eq('id', sesion.user.id).maybeSingle();
  perfil = data || null;
  const puede = perfil && (perfil.role === 'profesor' || perfil.is_admin === true);
  $('loading').classList.add('hidden');
  if (!puede) { $('denegado').classList.remove('hidden'); return; }
  $('app').classList.remove('hidden');
  // El cuadernillo trae las respuestas: solo administración.
  if (perfil.is_admin === true) $('banco-pdf').classList.remove('hidden');
  await pintarPrevio();
  await pintarPublicos();
  await pintarEquipo();
}
init();
    