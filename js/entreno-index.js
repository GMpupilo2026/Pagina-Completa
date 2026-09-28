/* El código de entreno/index.html.

   Vivía escrito dentro de la página, en un <script> de 1 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

const gate = document.getElementById('gate');
const app = document.getElementById('app');
const gateChecking = document.getElementById('gate-checking');

const NEXT_PATH = 'entreno/index.html';

async function unlock(){
  gate.classList.add('hidden');
  app.classList.remove('hidden');
  // Los contadores salen del progreso de la cuenta, no solo de este aparato.
  await ProgresoUsuario.init();
  showTemasProgress();
  pintarHoy();
}

/* «Hoy te toca»: hasta tres cosas concretas para hacer hoy, sacadas del
   progreso que ya está en la cuenta (ProgresoUsuario lo acaba de bajar). Antes
   el hub solo ofrecía la lista de accesos y el alumno tenía que acordarse de
   qué tenía pendiente; los repasos vencidos, sobre todo, no los veía nadie.
   Cada cosa dice cuántas son y a dónde lleva. Sin nada pendiente, no sale. */
function leerJSON(clave){
  try { return JSON.parse(localStorage.getItem(clave) || 'null'); } catch (e) { return null; }
}
function cosasDeHoy(){
  const cosas = [];
  const SRS = window.RepasoEspaciado;

  // Ejercicios por tema que se resolvieron con error o con pista y vuelven hoy.
  if (window.RepasoFallados) {
    const n = RepasoFallados.pendientes(RepasoFallados.CLAVES.temas).length;
    if (n) cosas.push({ icono: '🔁', href: 'temas.html?repaso=1',
      texto: n === 1 ? 'Repasar 1 ejercicio que te costó' : `Repasar ${n} ejercicios que te costaron` });
    const m = RepasoFallados.pendientes(RepasoFallados.CLAVES.mates).length;
    if (m) cosas.push({ icono: '♚', href: 'mates.html?repaso=1',
      texto: m === 1 ? 'Repasar 1 mate que te costó' : `Repasar ${m} mates que te costaron` });
  }

  // Líneas de Aperturas ya empezadas cuyo repaso venció (las nuevas no cuentan:
  // eso es estudiar algo nuevo, no un repaso pendiente).
  const srs = leerJSON('aperturas_srs_v1');
  if (SRS && srs && typeof srs === 'object') {
    const n = Object.keys(srs).filter((id) => srs[id] && srs[id].ultimo && SRS.toca(srs[id])).length;
    if (n) cosas.push({ icono: '📖', href: 'aperturas.html',
      texto: n === 1 ? '1 línea de aperturas para repasar' : `${n} líneas de aperturas para repasar` });
  }

  // El diagnóstico: hacerlo si no hay, repetirlo a las cuatro semanas (es lo
  // que pide la última semana del plan).
  const diag = leerJSON('diagnostico_resultado_v1');
  const fecha = diag && Date.parse(diag.fecha || '');
  if (!diag || !fecha) {
    cosas.push({ icono: '🧭', href: 'diagnostico.html', texto: 'Hacer el diagnóstico para saber por dónde empezar' });
  } else if (Date.now() - fecha > 28 * 24 * 3600 * 1000) {
    cosas.push({ icono: '🧭', href: 'diagnostico.html', texto: 'Repetir el diagnóstico: ya pasaron cuatro semanas' });
  }
  return cosas.slice(0, 3);
}
function pintarHoy(){
  const cosas = cosasDeHoy();
  const caja = document.getElementById('hoy');
  const lista = document.getElementById('hoy-lista');
  lista.innerHTML = '';
  cosas.forEach((c) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = c.href;
    a.className = 'flex items-center gap-3 rounded-xl px-3 py-2 bg-brand-50 dark:bg-brand-800 text-brand-800 dark:text-white font-semibold text-sm hover:text-accent-700 dark:hover:text-accent-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500';
    const ic = document.createElement('span');
    ic.setAttribute('aria-hidden', 'true');
    ic.textContent = c.icono;
    a.appendChild(ic);
    a.appendChild(document.createTextNode(c.texto));
    const flecha = document.createElement('span');
    flecha.setAttribute('aria-hidden', 'true');
    flecha.className = 'ml-auto';
    flecha.textContent = '→';
    a.appendChild(flecha);
    li.appendChild(a);
    lista.appendChild(li);
  });
  caja.classList.toggle('hidden', !cosas.length);
}

// Línea de progreso de "Ejercicios por tema": temas.html guarda el total y los
// resueltos en localStorage cada vez que se abre o se resuelve algo.
function showTemasProgress(){
  try {
    const total = parseInt(localStorage.getItem('entreno_temas_total') || '0', 10);
    const done = parseInt(localStorage.getItem('entreno_temas_done') || '0', 10);
    if(!total) return;
    const pct = Math.round(100 * done / total);
    document.getElementById('temas-progress-fill').style.width = pct + '%';
    document.getElementById('temas-progress-text').textContent = `${done} resueltos · faltan ${total - done} (${pct} %)`;
    document.getElementById('temas-progress').classList.remove('hidden');
  } catch (e) {}
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
  unlock();
}

requireLoginThenGate();
    