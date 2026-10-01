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

async function unlock(alumnoId){
  gate.classList.add('hidden');
  app.classList.remove('hidden');
  // Los contadores salen del progreso de la cuenta, no solo de este aparato.
  await ProgresoUsuario.init();
  showTemasProgress();
  pintarHoy(alumnoId);
  enfocarTitulo();
}

/* Con la cuenta ciega, el foco al título al llegar: el hub no tiene recuadro
   donde escribir, y el foco se quedaba en el <body> (el lector no decía
   dónde se había llegado). Sin la marca, como siempre: no se mueve. */
function enfocarTitulo(){
  if(!document.documentElement.classList.contains('modo-ciego')) return;
  const a = document.activeElement;
  if(a && a !== document.body && a !== document.documentElement) return;
  const h = document.getElementById('hub-titulo');
  if(h) h.focus();
}
// La marca puede llegar de la base un momento después (js/vision-cuenta.js).
document.addEventListener('vision:cambio', () => { if(!app.classList.contains('hidden')) enfocarTitulo(); });

/* «Hoy te toca» vive en js/hoy-te-toca.js: es el mismo que se pinta en el
   panel del alumno. Acá, las direcciones van relativas a entreno/. */
function pintarHoy(alumnoId){
  return HoyTeToca.pintar(document.getElementById('hoy'), { alumnoId, arriba: '../', entreno: '' });
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
  let hasSession = false, alumnoId = null;
  try {
    const { data } = await sb.auth.getSession();
    hasSession = !!(data && data.session);
    alumnoId = hasSession ? data.session.user.id : null;
  } catch (e) {
    hasSession = false;
  }
  if(!hasSession){
    gateChecking.textContent = 'Necesitas iniciar sesión en el sitio para entrar a Entrenamiento. Redirigiendo a iniciar sesión…';
    window.location.href = '../login.html?next=' + encodeURIComponent(NEXT_PATH);
    return;
  }
  unlock(alumnoId);
}

requireLoginThenGate();
    