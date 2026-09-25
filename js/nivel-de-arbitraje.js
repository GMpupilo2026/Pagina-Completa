/* El código de nivel-de-arbitraje.html.

   Vivía escrito dentro de la página, en un <script> de 17 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* ===== Mide tu nivel de arbitraje — versión pública =====
 *
 * Es el mismo examen que usa el equipo docente en arbitraje.html: mismo banco
 * (js/arbitraje-items.js), mismo criterio (js/arbitraje-nivel.js), mismas 40
 * preguntas en 50 minutos. Lo que cambia es quién lo hace y qué ve al final.
 *
 *   - Entra cualquiera, sin cuenta. Antes de empezar deja nombre y correo.
 *   - El resultado se guarda con la función registrar_arbitraje_publico, que
 *     valida y escribe en la tabla arbitrajes_publicos. Leerla y responderla
 *     es solo de profesores y administración (el patrón de
 *     diagnosticos_publicos, con la escritura por función).
 *   - NO se muestran las respuestas correctas. Acá no es material de estudio:
 *     el banco se sortea y enseñarlas convertiría el examen en memoria. Van en
 *     la retroalimentación que escribe el profesor desde arbitraje.html.
 *
 * El banco es un archivo estático, así que quien sepa mirar el código ve las
 * respuestas igual. Es un examen para ubicarse, no una certificación, y la
 * página lo dice.
 */
const BANCO = window.ARBITRAJE_ITEMS;
const PRUEBA = window.ArbitrajePrueba;
const AN = window.ArbitrajeNivel;

let MINUTOS = 50;
const EN_BLANCO = 'blanco';

let persona = null;           // { nombre, email }
let examen = [];
let respuestas = {};
let idx = 0;
let quedan = MINUTOS * 60;
let cronometro = null;
let nivelExamen = null;       // { clave, techo, etiqueta, minutos } del examen elegido, o null = completo

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const estrellas = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const reloj = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');

function irA(vista) {
  ['intro-view', 'examen-view', 'resultado-view'].forEach((id) => $(id).classList.toggle('hidden', id !== vista));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------- Los datos de quien rinde ---------------- */
$('ir-form-btn').addEventListener('click', () => {
  $('datos-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('f-nombre').focus({ preventScroll: true });
});

$('datos-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const nombre = $('f-nombre').value.trim();
  const email = $('f-email').value.trim();
  const error = $('f-error');
  if (nombre.length < 2) return avisar(error, 'Escribe tu nombre completo, por favor.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return avisar(error, 'Ese correo no se ve bien: revísalo y volvemos.');
  error.classList.add('hidden');
  persona = { nombre, email };
  empezar();
});

function avisar(caja, texto) {
  caja.textContent = texto;
  caja.classList.remove('hidden');
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

  const caja = $('q-options');
  caja.innerHTML = '';
  const orden = item.__orden || (item.__orden = barajar(item.opciones.map((_, i) => i)));
  orden.forEach((original) => caja.appendChild(botonOpcion(item, original, respuestas[item.id] === original)));
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

$('next-btn').addEventListener('click', () => {
  if (idx === examen.length - 1) { terminar(false); return; }
  idx += 1; pintarPregunta();
});
$('prev-btn').addEventListener('click', () => { if (idx > 0) { idx -= 1; pintarPregunta(); } });
$('abandon-btn').addEventListener('click', async () => {
  if (!(await Avisos.confirmar('El examen se pierde y hay que empezar de nuevo.', { titulo: '¿Abandonar el examen?', aceptar: 'Abandonar', cancelar: 'Seguir con el examen', peligro: true }))) return;
  clearInterval(cronometro);
  irA('intro-view');
});
window.addEventListener('beforeunload', (e) => {
  if (!$('examen-view').classList.contains('hidden')) { e.preventDefault(); e.returnValue = ''; }
});

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
  $('r-guardado').textContent = 'Guardando tu examen…';
  const guardado = await subida;
  $('r-guardado').innerHTML = guardado
    ? `Tu examen quedó guardado a nombre de <strong>${esc(persona.nombre)}</strong> (${esc(persona.email)}).`
    : 'No se pudo guardar en línea. Toma una captura de esta pantalla y escríbenos: así no se pierde tu resultado.';
}

/* Se guarda por función y no con un insert directo: quien no tiene sesión no
   necesita ningún permiso de lectura sobre la tabla (y de hecho no lo tiene),
   y la validación de nombre, correo y tamaño queda del lado del servidor. */
async function guardar(detalle, resumen) {
  try {
    const { error } = await sb.rpc('registrar_arbitraje_publico', {
      p_nombre: persona.nombre,
      p_email: persona.email,
      p_porcentaje: resumen.porcentaje,
      p_nivel: resumen.nivel.etiqueta,
      p_detalle: detalle,
    });
    return !error;
  } catch (e) { return false; }
}

/* ---------------- La pantalla del resultado ---------------- */
function mostrarResultado(detalle, resumen, porTiempo) {
  irA('resultado-view');
  $('r-titulo-examen').textContent = nivelExamen ? `Examen de ${nivelExamen.etiqueta} · tu resultado` : 'Tu nivel estimado de arbitraje';
  $('r-nivel').textContent = resumen.nivel.etiqueta;
  $('r-descripcion').textContent = resumen.nivel.descripcion;
  $('r-marcador').textContent =
    `${resumen.aciertos} de ${resumen.total} respuestas correctas · ${resumen.porcentaje}% del examen` +
    (resumen.nosabe ? ` · ${resumen.nosabe} en blanco` : '') +
    ` · equivale a ${resumen.nivel.referencia}` +
    (porTiempo ? ' · se acabó el tiempo antes de terminar' : `, en ${detalle.minutos_usados} minutos`) + '.';

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
      </div>`).join('') + '</div>';

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
}

$('tam-banco').textContent = BANCO.length;
document.querySelectorAll('.total-completo').forEach((el) => { el.textContent = PRUEBA.TOTAL; });
PRUEBA.NIVELES_EXAMEN.forEach((n) => {
  document.querySelectorAll('.total-' + n.clave).forEach((el) => { el.textContent = PRUEBA.totalPara(n.techo); });
});

/* Esta página es la pública —se entra sin cuenta— pero también es a donde el
 * panel de la Academia manda a quien no da clase. A esa persona el sitio ya le
 * sabe el nombre y el correo, así que pedírselos otra vez es hacerle escribir
 * lo que ya escribió. Se rellenan solos y se pueden cambiar; si no hay sesión
 * —que es el caso de siempre acá— no cambia nada.
 *
 * El correo NO se toca si ya venía escrito: quien empezó a llenarlo a mano
 * manda sobre lo que el sitio crea saber.
 */
async function rellenarSiHaySesion() {
  try {
    const { data } = await sb.auth.getSession();
    const sesion = data && data.session;
    if (!sesion) return;
    const nombre = $('f-nombre'), correo = $('f-email');
    if (!correo.value) correo.value = sesion.user.email || '';
    if (!nombre.value) {
      const { data: perfil } = await sb.from('profiles').select('full_name').eq('id', sesion.user.id).maybeSingle();
      if (perfil && perfil.full_name) nombre.value = perfil.full_name;
    }
  } catch (e) { /* sin sesión o sin red se llena a mano, como siempre */ }
}
rellenarSiHaySesion();
    