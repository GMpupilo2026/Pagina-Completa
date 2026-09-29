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
}

/* «Hoy te toca»: hasta tres cosas concretas para hacer hoy, sacadas del
   progreso que ya está en la cuenta (ProgresoUsuario lo acaba de bajar). Antes
   el hub solo ofrecía la lista de accesos y el alumno tenía que acordarse de
   qué tenía pendiente; los repasos vencidos, sobre todo, no los veía nadie.
   Cada cosa dice cuántas son y a dónde lleva. Arriba va la meta del día
   (pintarMeta); sin nada pendiente, queda solo esa. */
function leerJSON(clave){
  try { return JSON.parse(localStorage.getItem(clave) || 'null'); } catch (e) { return null; }
}
/* La semana del plan del diagnóstico: a dónde ir y cuánto se hizo ahí.
   Antes el plan vivía solo en la página del diagnóstico, y en los datos se
   veía: de los alumnos que lo hicieron, un tercio no volvió a entrenar y otro
   tercio lo dejó a los uno o dos días. El plan decía qué hacer cada semana;
   nadie se lo recordaba. La cuenta la hace PlanEntrenamiento.hoyDelPlan(), la
   misma que usa la franja del panel. */
async function cosaDelPlan(alumnoId, diag){
  const PE = window.PlanEntrenamiento;
  if (!PE || !alumnoId || !diag || !diag.detalle) return null;
  let hoy = null;
  try { hoy = await PE.hoyDelPlan(sb, alumnoId, diag.detalle); } catch (e) { return null; }
  if (!hoy) return null;
  const avance = hoy.hechos === null ? '' : hoy.hechos ? ` (✓ ${hoy.hechos} ${hoy.hechos === 1 ? 'hecho' : 'hechos'})` : ' (todavía nada)';
  return { icono: '📅', href: PE.enlace(hoy.recurso.href, '../'),
    texto: `Tu plan, semana ${hoy.numero} de ${hoy.total} · ${hoy.foco}: ${hoy.recurso.texto}${avance}` };
}
async function cosasDeHoy(alumnoId){
  const cosas = [];
  const SRS = window.RepasoEspaciado;

  // Primero el plan: es lo que dice qué entrenar; lo demás es repasar.
  const diag = leerJSON('diagnostico_resultado_v1');
  const delPlan = await cosaDelPlan(alumnoId, diag);
  if (delPlan) cosas.push(delPlan);

  // Ejercicios por tema que se resolvieron con error o con pista y vuelven hoy.
  if (window.RepasoFallados) {
    const n = RepasoFallados.pendientes(RepasoFallados.CLAVES.temas).length;
    if (n) cosas.push({ icono: '🔁', href: 'temas.html?repaso=1',
      texto: n === 1 ? 'Repasar 1 ejercicio que te costó' : `Repasar ${n} ejercicios que te costaron` });
    const m = RepasoFallados.pendientes(RepasoFallados.CLAVES.mates).length;
    if (m) cosas.push({ icono: '♚', href: 'mates.html?repaso=1',
      texto: m === 1 ? 'Repasar 1 mate que te costó' : `Repasar ${m} mates que te costaron` });
  }

  // El tema más flojo (js/tema-flojo.js): el motivo que menos sale limpio,
  // si ya hay con qué medirlo y está por debajo de lo aceptable. Lo cuenta la
  // base; si no responde, simplemente no se propone.
  if (window.TemaFlojo && alumnoId) {
    try {
      const f = (await TemaFlojo.cargar(sb, '../'))[alumnoId];
      if (f && f.porcentaje < TemaFlojo.FLOJO) cosas.push({ icono: '🎯', href: 'temas.html?tema=' + encodeURIComponent(f.tema),
        texto: `Tu tema más flojo, «${f.nombre}»: limpio en ${f.limpios} de ${f.intentos}` });
    } catch (e) { /* sin dato, sin propuesta */ }
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
  const fecha = diag && Date.parse(diag.fecha || '');
  if (!diag || !fecha) {
    cosas.push({ icono: '🧭', href: 'diagnostico.html', texto: 'Hacer el diagnóstico para saber por dónde empezar' });
  } else if (Date.now() - fecha > 28 * 24 * 3600 * 1000) {
    cosas.push({ icono: '🧭', href: 'diagnostico.html', texto: 'Repetir el diagnóstico: ya pasaron cuatro semanas' });
  }
  return cosas.slice(0, 3);
}
/* La meta del día: cuántos ejercicios lleva hoy de los que hacen falta para
   que el día cuente en la racha, y la racha. La cuenta es la de Logros
   (js/logros.js → progreso_dias_y_racha), no otra: dos pantallas que cuentan
   lo mismo por su lado terminan diciendo cosas distintas. Antes esto solo se
   veía entrando a Logros; acá es lo primero que ve quien viene a entrenar. */
async function pintarMeta(){
  if (!window.Logros) return false;
  let r;
  try { r = await Logros.cargar(); } catch (e) { return false; }
  if (!r || !r.sesion || r.error) return false;
  const meta = Logros.META_DIARIA;
  const hoy = r.stats.hoy_ejercicios || 0;
  const racha = r.stats.racha_actual || 0;
  const dias = (n) => n === 1 ? '1 día' : `${n} días`;
  const texto = hoy >= meta
    ? `✅ Hoy ya cuenta para tu racha: ${hoy} ejercicios. Llevas ${dias(racha)} seguidos 🔥`
    : `Hoy llevas ${hoy} de ${meta} ejercicios para que el día cuente.`
      + (racha ? ` Tu racha: ${dias(racha)} 🔥 — no la cortes.` : ' Con eso empiezas una racha.');
  document.getElementById('hoy-meta-texto').textContent = texto;
  const barra = document.getElementById('hoy-meta-barra');
  barra.setAttribute('aria-valuemax', String(meta));
  barra.setAttribute('aria-valuenow', String(Math.min(hoy, meta)));
  document.getElementById('hoy-meta-relleno').style.width = Math.round(100 * Math.min(hoy, meta) / meta) + '%';
  document.getElementById('hoy-meta').hidden = false;
  return true;
}

async function pintarHoy(alumnoId){
  const [cosas, conMeta] = await Promise.all([cosasDeHoy(alumnoId), pintarMeta()]);
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
  lista.hidden = !cosas.length;
  caja.classList.toggle('hidden', !cosas.length && !conMeta);
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
    