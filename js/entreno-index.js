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
    const v = RepasoFallados.pendientes(RepasoFallados.CLAVES.visualizacion).length;
    if (v) cosas.push({ icono: '👁️', href: 'visualizacion.html?repaso=1',
      texto: v === 1 ? 'Repasar 1 ejercicio de Visualización que te costó' : `Repasar ${v} ejercicios de Visualización que te costaron` });
    const p = RepasoFallados.pendientes(RepasoFallados.CLAVES.practicas).length;
    if (p) cosas.push({ icono: '♞', href: 'practicas.html?repaso=1',
      texto: p === 1 ? 'Repasar 1 posición de Practicar que te costó' : `Repasar ${p} posiciones de Practicar que te costaron` });
    const t = RepasoFallados.pendientes(RepasoFallados.CLAVES.tipos).length;
    if (t) cosas.push({ icono: '🧩', href: 'tipos.html#repaso',
      texto: t === 1 ? 'Repasar 1 ejercicio de Tipos que te costó' : `Repasar ${t} ejercicios de Tipos que te costaron` });
    const f = RepasoFallados.pendientes(RepasoFallados.CLAVES.finales).length;
    if (f) cosas.push({ icono: '🏁', href: 'finales.html?repaso=1',
      texto: f === 1 ? 'Volver a jugar 1 final que te costó' : `Volver a jugar ${f} finales que te costaron` });
  }

  // El nivel de Tipos de entrenamiento que quedó a medias (lo anota
  // js/entreno-tipos.js al jugar). Uno completo no se propone: ya está hecho.
  const ultimo = leerJSON('tipos_ultimo_v1');
  if (ultimo && ultimo.tipo && ultimo.nivel && ultimo.total > 0 && ultimo.hechos < ultimo.total) {
    cosas.push({ icono: '🧩', href: 'tipos.html#' + encodeURIComponent(ultimo.tipo) + '/' + encodeURIComponent(ultimo.nivel),
      texto: `Seguir con ${ultimo.nombre}, nivel ${ultimo.nivel} (${ultimo.hechos} de ${ultimo.total})` });
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

  // Y el Tipo de entrenamiento más flojo (js/tipo-flojo.js): el que menos sale
  // con tres estrellas, desde cinco ejercicios. Lleva a la ficha de ese tipo.
  if (window.TipoFlojo && alumnoId) {
    try {
      const f = (await TipoFlojo.cargar(sb))[alumnoId];
      if (f && f.porcentaje < TipoFlojo.FLOJO) cosas.push({ icono: '📉', href: 'tipos.html#' + encodeURIComponent(f.tipo),
        texto: `Tu tipo de entrenamiento más flojo, «${f.nombre}»: tres estrellas en ${f.limpios} de ${f.intentos}` });
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

  // Lo que quedó empezado y no vence: van al final, así que solo se proponen
  // cuando hay lugar (tres como mucho).
  const finales = await finalesPendientes();
  if (finales) cosas.push(finales);
  const precision = await precisionOlvidada(alumnoId);
  if (precision) cosas.push(precision);
  return cosas.slice(0, 3);
}

/* Finales contra la máquina ya empezados y sin terminar: cuántos lleva y cuál
   sigue (la página abre sola el primero sin lograr). A quien nunca jugó uno no
   se le propone: sería empujar una página más, no seguir algo. */
async function finalesPendientes(){
  const hechos = leerJSON('entreno_finales_solved');
  const n = hechos && typeof hechos === 'object' ? Object.keys(hechos).filter((k) => hechos[k]).length : 0;
  if (!n) return null;
  let banco = null;
  try { const r = await fetch('data/finales.json'); if (r.ok) banco = await r.json(); } catch (e) { return null; }
  const lista = (banco && banco.finales) || [];
  const logrados = lista.filter((f) => hechos[f.id]).length;
  const sigue = lista.find((f) => !hechos[f.id]);
  if (!sigue) return null;
  return { icono: '🏁', href: 'finales.html?final=' + encodeURIComponent(sigue.id),
    texto: `Seguir con los finales contra la máquina: «${sigue.titulo}» (${logrados} de ${lista.length} logrados)` };
}

/* Precisión posicional: si ya hizo alguna tanda y la última fue hace una
   semana o más. El historial vive en la cuenta (training_state,
   'precision_posicional_historial_v1', lo más nuevo primero, con su fecha),
   así que cuenta también lo hecho antes de que las tandas se registraran en
   training_progress. */
const DIAS_SIN_PRECISION = 7;
async function precisionOlvidada(alumnoId){
  if (!alumnoId || !window.sb) return null;
  let historial = null;
  try {
    const { data } = await sb.from('training_state').select('value').eq('student_id', alumnoId).eq('key', 'precision_posicional_historial_v1').maybeSingle();
    historial = data && data.value && typeof data.value.raw === 'string' ? JSON.parse(data.value.raw) : null;
  } catch (e) { return null; }
  const ultima = Array.isArray(historial) && historial[0] ? Date.parse(historial[0].fecha || '') : NaN;
  if (!Number.isFinite(ultima)) return null;
  const dias = Math.floor((Date.now() - ultima) / (24 * 3600 * 1000));
  if (dias < DIAS_SIN_PRECISION) return null;
  return { icono: '🧭', href: 'precision-posicional.html',
    texto: `Una tanda de Precisión posicional: la última fue hace ${dias} días` };
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
  ofrecerAvisos(racha);
  if (hoy > 0) await pintarResumenHoy();
  await pintarSemana();
  return true;
}

/* Tu semana: los últimos 7 días contra los 7 anteriores. «Esta semana: 48
   ejercicios (la anterior, 31) · 70 % sin error ni pista (la anterior,
   62 %).» El alumno veía el día y la racha, pero no si estaba mejorando. La
   cuenta la hace la base (entreno_mi_semana, días de Costa Rica). Sin nada en
   las dos semanas, o si la base no responde, no se pinta. */
function textoSemana(s){
  const n = (x) => `${x} ${x === 1 ? 'ejercicio' : 'ejercicios'}`;
  const pct = (l, c) => Math.round(100 * l / c);
  let t = `Esta semana: ${n(s.esta)}` + (s.anterior ? ` (la anterior, ${s.anterior})` : ' (la anterior no entrenaste)');
  if (s.esta_con) {
    t += ` · ${pct(s.esta_limpios, s.esta_con)} % sin error ni pista`;
    if (s.anterior_con) t += ` (la anterior, ${pct(s.anterior_limpios, s.anterior_con)} %)`;
  }
  return t + '.';
}
async function pintarSemana(){
  const caja = document.getElementById('hoy-semana');
  if (!caja) return;
  let s = null;
  try {
    const { data, error } = await sb.rpc('entreno_mi_semana');
    if (!error && data && typeof data === 'object') s = data;
  } catch (e) { s = null; }
  if (!s || (!s.esta && !s.anterior)) return;
  caja.textContent = textoSemana(s);
  caja.hidden = false;
}

/* El resumen del día: antes cada página festejaba lo suyo y nadie juntaba el
   día. «Hoy: 12 ejercicios (Mates 6, Tipos de entrenamiento 4, Memoria 2) ·
   9 de 11 limpios · Para mañana: 3 repasos.» Lo de hoy lo cuenta la base
   (entreno_resumen_hoy, día de Costa Rica); los nombres son los de
   js/tiempo-secciones.js, los mismos de Informes; los repasos de mañana, las
   colas de este aparato (viajan con la cuenta). Si la base no responde, no se
   pinta nada. */
async function pintarResumenHoy(){
  const caja = document.getElementById('hoy-resumen');
  let r = null;
  try {
    const { data, error } = await sb.rpc('entreno_resumen_hoy');
    if (!error && data && typeof data === 'object') r = data;
  } catch (e) { r = null; }
  if (!r || !r.total) return;
  const nombre = (a) => window.TiempoSecciones ? TiempoSecciones.describir(a).nombre : a;
  const partes = Object.keys(r.por_actividad || {})
    .sort((a, b) => r.por_actividad[b] - r.por_actividad[a] || a.localeCompare(b))
    .map((a) => `${nombre(a)} ${r.por_actividad[a]}`);
  /* El total ya lo dice la meta, justo arriba: repetirlo alargaba la tarjeta
     en el celular. Acá va solo cómo se reparte. */
  let texto = `Hoy: ${partes.join(', ')}`;
  if (r.con_como_salio) texto += ` · ${r.limpios} de ${r.con_como_salio} sin error ni pista`;
  const manana = repasosParaManana();
  if (manana) texto += ` · Para mañana: ${manana === 1 ? '1 repaso' : `${manana} repasos`}.`;
  else texto += '.';
  caja.textContent = texto;
  caja.hidden = false;
}

/* Cuántos repasos tocan mañana (lo que vence hasta mañana y no salió de la
   cola), de todas las colas de «Repasar fallados» y de Aperturas. */
function repasosParaManana(){
  const SRS = window.RepasoEspaciado;
  if (!SRS) return 0;
  const manana = SRS.sumarDias(SRS.hoy(), 1);
  let n = 0;
  if (window.RepasoFallados) {
    Object.values(RepasoFallados.CLAVES).forEach((clave) => {
      const e = RepasoFallados.leer(clave);
      Object.keys(e).forEach((id) => { if (e[id] && !e[id].fuera && e[id].vence && e[id].vence <= manana) n++; });
    });
  }
  const srs = leerJSON('aperturas_srs_v1');
  if (srs && typeof srs === 'object') {
    Object.keys(srs).forEach((id) => { if (srs[id] && srs[id].ultimo && srs[id].vence && srs[id].vence <= manana) n++; });
  }
  return n;
}

/* El aviso de racha sale por la tarde (public.avisar_rachas()) solo a los
   aparatos con los avisos encendidos, y casi nadie los tenía. Se ofrece acá,
   junto a la racha, porque es donde se entiende para qué sirve; y se pide el
   permiso solo al apretar el botón: el navegador deja preguntar una sola vez.
   «Ahora no» lo guarda dos semanas en este aparato. */
const CLAVE_AVISOS_NO = 'entreno_avisos_ahora_no';
const DIAS_AVISOS_NO = 14;
async function ofrecerAvisos(racha){
  const caja = document.getElementById('hoy-avisos');
  if (!caja || !window.Notificaciones) return;
  try {
    const no = parseInt(localStorage.getItem(CLAVE_AVISOS_NO) || '0', 10);
    if (no && Date.now() - no < DIAS_AVISOS_NO * 86400000) return;
  } catch (e) {}
  let est;
  try { est = await Notificaciones.estado(); } catch (e) { return; }
  if (est !== 'apagado') return;
  // El 🔔 va aparte, escondido del lector de pantalla: no lo lee en voz alta.
  document.getElementById('hoy-avisos-si-texto').textContent = racha
    ? `Avísame si mi racha de ${racha === 1 ? '1 día' : racha + ' días'} está en juego`
    : 'Avísame por la tarde si me faltan ejercicios';
  caja.hidden = false;
}
document.getElementById('hoy-avisos-si').addEventListener('click', async () => {
  const msg = document.getElementById('hoy-avisos-msg');
  const btn = document.getElementById('hoy-avisos-si');
  btn.disabled = true;
  try {
    const { data } = await sb.auth.getSession();
    if (!data || !data.session) throw new Error('Tu sesión se cerró: vuelve a entrar.');
    await Notificaciones.encender(data.session);
    document.getElementById('hoy-avisos').hidden = true;
    msg.textContent = '✅ Listo: si a las 6 de la tarde tu racha está en juego, te llega un aviso. Se apaga en Configuración.';
  } catch (e) {
    msg.textContent = (e && e.message) || String(e);
    btn.disabled = false;
  }
});
document.getElementById('hoy-avisos-no').addEventListener('click', () => {
  try { localStorage.setItem(CLAVE_AVISOS_NO, String(Date.now())); } catch (e) {}
  document.getElementById('hoy-avisos').hidden = true;
});

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
    