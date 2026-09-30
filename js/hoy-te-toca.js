/* «Hoy te toca»: la meta del día y hasta tres cosas concretas para hacer hoy,
   sacadas del progreso que ya está en la cuenta.

   Una sola copia para las dos pantallas que lo muestran: el hub de
   Entrenamiento (entreno/index.html) y el panel del alumno (clases.html).
   Vivía solo en el hub, y cuando el panel del alumno empezó a abrir el
   entrenamiento tarjeta por tarjeta, el alumno dejó de pasar por el hub y
   esto se quedó sin nadie que lo viera. Ver «Hoy te toca, también en el
   panel» en docs/decisiones/paneles.md.

   Cómo se usa:
       HoyTeToca.pintar(document.getElementById("hoy"), {
         alumnoId,          // el id de la cuenta
         arriba: "../",     // de la página a la raíz del sitio
         entreno: "",       // de la página a entreno/
         enPanel: false,    // en el panel no repite lo que ya dice su franja
         logros: promesa,   // opcional: Logros.cargar() ya pedido
       });

   La caja se arma entera acá (el marcado también es una sola copia) y se
   muestra solo si hay algo: la meta del día o alguna cosa pendiente. Los
   datos de este aparato los baja ProgresoUsuario.init(), que la página tiene
   que haber esperado antes. Depende de: sb, RepasoEspaciado, RepasoFallados,
   PlanEntrenamiento, TemaFlojo, TipoFlojo (con TiposCatalogo), ErroresPropios,
   MaterialPlataforma, Logros, TiempoSecciones y Notificaciones; el que falte, simplemente no aporta. */
window.HoyTeToca = (function () {
  "use strict";

  const MARCADO = `
    <h2 id="hoy-titulo" class="font-serif text-lg font-bold text-brand-800 dark:text-white mb-3">Hoy te toca</h2>
    <!-- La meta del día (js/logros.js): la misma cuenta que Logros y el panel. -->
    <div id="hoy-meta" class="mb-3" hidden>
      <p id="hoy-meta-texto" class="text-sm text-brand-600 dark:text-brand-200 mb-1"></p>
      <div id="hoy-meta-barra" class="h-2 w-full rounded bg-brand-100 dark:bg-brand-800 overflow-hidden" role="progressbar" aria-labelledby="hoy-meta-texto" aria-valuemin="0"><div id="hoy-meta-relleno" class="h-full bg-accent-500 rounded" style="width:0%"></div></div>
      <!-- El resumen del día (public.entreno_resumen_hoy): qué hizo hoy, cuántos
           salieron limpios y cuántos repasos tocan mañana. Solo con algo hecho. -->
      <p id="hoy-resumen" class="text-sm text-brand-600 dark:text-brand-200 mt-2" hidden></p>
      <!-- Tu semana (public.entreno_mi_semana): los últimos 7 días contra los
           7 anteriores. Solo si entrenó en alguna de las dos. -->
      <p id="hoy-semana" class="text-sm text-brand-600 dark:text-brand-200 mt-1" hidden></p>
      <!-- Y día por día (la clave «dias» de la misma función): siete barras con
           el número escrito debajo. Las barras son adorno; el dato es el número. -->
      <ol id="hoy-semana-dias" class="mt-2 grid grid-cols-7 gap-1 max-w-xs list-none p-0" aria-label="Ejercicios por día, los últimos 7 días" style="display:none"></ol>
      <!-- La próxima medalla (js/logros-catalogo.js): la más cerca de las que ya
           empezó, y cuánto le falta. Una meta a la vista engancha más que la
           lista entera en Logros. -->
      <a id="hoy-medalla" class="block text-sm text-brand-600 dark:text-brand-200 mt-1 underline underline-offset-2 hover:text-accent-700 dark:hover:text-accent-400 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500" hidden></a>
    </div>
    <ul id="hoy-lista" class="list-none p-0 m-0 space-y-2"></ul>
    <!-- «Entrenar 10 minutos» (js/tanda-diez.js): arma una tanda con lo de
         arriba y cuenta 10 minutos. -->
    <div id="hoy-tanda" class="mt-3" hidden>
      <button type="button" id="hoy-tanda-boton" class="bg-brand-800 hover:bg-brand-900 dark:bg-brand-700 dark:hover:bg-brand-600 text-white font-semibold px-3 py-1.5 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"><span aria-hidden="true">⏱️ </span>Entrenar 10 minutos</button>
      <p id="hoy-tanda-que" class="text-xs text-brand-600 dark:text-brand-300 mt-1"></p>
    </div>
    <!-- El aviso de racha (public.avisar_rachas(), 6:05 p. m.): solo le llega a
         quien tiene los avisos encendidos en el aparato, y casi nadie los tenía.
         Se ofrece acá, junto a la racha, y no al cargar: el navegador deja pedir
         el permiso una sola vez. Va DESPUÉS de la lista: arriba, en el celular,
         empujaba lo que toca hacer hoy fuera de la pantalla. -->
    <div id="hoy-avisos" class="mt-4 flex flex-wrap items-center gap-2" hidden>
      <button type="button" id="hoy-avisos-si" class="bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-3 py-1.5 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"><span aria-hidden="true">🔔 </span><span id="hoy-avisos-si-texto">Avísame si mi racha está en juego</span></button>
      <button type="button" id="hoy-avisos-no" class="text-sm text-brand-500 dark:text-brand-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded px-1">Ahora no</button>
    </div>
    <p id="hoy-avisos-msg" class="text-xs mt-2 text-brand-500 dark:text-brand-300" role="status" aria-live="polite"></p>`;

  function leerJSON(clave){
    try { return JSON.parse(localStorage.getItem(clave) || 'null'); } catch (e) { return null; }
  }

  /* La semana del plan del diagnóstico: a dónde ir y cuánto se hizo ahí.
     Antes el plan vivía solo en la página del diagnóstico, y en los datos se
     veía: de los alumnos que lo hicieron, un tercio no volvió a entrenar y
     otro tercio lo dejó a los uno o dos días. El plan decía qué hacer cada
     semana; nadie se lo recordaba. La cuenta la hace
     PlanEntrenamiento.hoyDelPlan(), la misma que usa la franja del panel. */
  async function cosaDelPlan(alumnoId, diag, op){
    const PE = window.PlanEntrenamiento;
    if (!PE || !alumnoId || !diag || !diag.detalle) return null;
    let hoy = null;
    try { hoy = await PE.hoyDelPlan(sb, alumnoId, diag.detalle); } catch (e) { return null; }
    if (!hoy) return null;
    const avance = hoy.hechos === null ? '' : hoy.hechos ? ` (✓ ${hoy.hechos} ${hoy.hechos === 1 ? 'hecho' : 'hechos'})` : ' (todavía nada)';
    return { icono: '📅', href: PE.enlace(hoy.recurso.href, op.arriba),
      texto: `Tu plan, semana ${hoy.numero} de ${hoy.total} · ${hoy.foco}: ${hoy.recurso.texto}${avance}` };
  }

  async function cosasDeHoy(op){
    const cosas = [];
    const SRS = window.RepasoEspaciado;
    const E = op.entreno, alumnoId = op.alumnoId;
    const diag = leerJSON('diagnostico_resultado_v1');

    /* Primero el plan: es lo que dice qué entrenar; lo demás es repasar. En el
       panel no va: la semana del plan ya es lo que dice su franja de arriba, y
       dos veces lo mismo en la misma pantalla hace pensar que son dos cosas. */
    if (!op.enPanel) {
      const delPlan = await cosaDelPlan(alumnoId, diag, op);
      if (delPlan) cosas.push(delPlan);
    }

    // Ejercicios por tema que se resolvieron con error o con pista y vuelven hoy.
    if (window.RepasoFallados) {
      const n = RepasoFallados.pendientes(RepasoFallados.CLAVES.temas).length;
      if (n) cosas.push({ icono: '🔁', href: E + 'temas.html?repaso=1',
        texto: n === 1 ? 'Repasar 1 ejercicio que te costó' : `Repasar ${n} ejercicios que te costaron` });
      const m = RepasoFallados.pendientes(RepasoFallados.CLAVES.mates).length;
      if (m) cosas.push({ icono: '♚', href: E + 'mates.html?repaso=1',
        texto: m === 1 ? 'Repasar 1 mate que te costó' : `Repasar ${m} mates que te costaron` });
      const v = RepasoFallados.pendientes(RepasoFallados.CLAVES.visualizacion).length;
      if (v) cosas.push({ icono: '👁️', href: E + 'visualizacion.html?repaso=1',
        texto: v === 1 ? 'Repasar 1 ejercicio de Visualización que te costó' : `Repasar ${v} ejercicios de Visualización que te costaron` });
      const p = RepasoFallados.pendientes(RepasoFallados.CLAVES.practicas).length;
      if (p) cosas.push({ icono: '♞', href: E + 'practicas.html?repaso=1',
        texto: p === 1 ? 'Repasar 1 posición de Practicar que te costó' : `Repasar ${p} posiciones de Practicar que te costaron` });
      const t = RepasoFallados.pendientes(RepasoFallados.CLAVES.tipos).length;
      if (t) cosas.push({ icono: '🧩', href: E + 'tipos.html#repaso',
        texto: t === 1 ? 'Repasar 1 ejercicio de Habilidades que te costó' : `Repasar ${t} ejercicios de Habilidades que te costaron` });
      const f = RepasoFallados.pendientes(RepasoFallados.CLAVES.finales).length;
      if (f) cosas.push({ icono: '🏁', href: E + 'finales.html?repaso=1',
        texto: f === 1 ? 'Volver a jugar 1 final que te costó' : `Volver a jugar ${f} finales que te costaron` });
      // Las preguntas de clase en las que viste la respuesta en tu repaso: vuelven a la semana.
      const c = RepasoFallados.pendientes(RepasoFallados.CLAVES.clase).length;
      if (c) cosas.push({ icono: '📌', href: op.arriba + 'repasar-clases.html?vuelven=1',
        texto: c === 1 ? 'Te vuelve 1 pregunta de tus clases' : `Te vuelven ${c} preguntas de tus clases` });
    }

    // El nivel de Tipos de entrenamiento que quedó a medias (lo
    // anota js/entreno-tipos.js al jugar). Uno completo no se propone: ya está hecho.
    const ultimo = leerJSON('tipos_ultimo_v1');
    if (ultimo && ultimo.tipo && ultimo.nivel && ultimo.total > 0 && ultimo.hechos < ultimo.total) {
      cosas.push({ icono: '🧩', href: E + 'tipos.html#' + encodeURIComponent(ultimo.tipo) + '/' + encodeURIComponent(ultimo.nivel),
        texto: `Seguir con ${ultimo.nombre}, nivel ${ultimo.nivel} (${ultimo.hechos} de ${ultimo.total})` });
    }

    // El tema más flojo (js/tema-flojo.js): el motivo que menos sale limpio,
    // si ya hay con qué medirlo y está por debajo de lo aceptable. Lo cuenta la
    // base; si no responde, simplemente no se propone.
    if (window.TemaFlojo && alumnoId) {
      try {
        const f = (await TemaFlojo.cargar(sb, op.arriba))[alumnoId];
        if (f && f.porcentaje < TemaFlojo.FLOJO) cosas.push({ icono: '🎯', href: E + 'temas.html?tema=' + encodeURIComponent(f.tema),
          texto: `Tu tema más flojo, «${f.nombre}»: limpio en ${f.limpios} de ${f.intentos}` });
      } catch (e) { /* sin dato, sin propuesta */ }
    }

    // Y el Tipo de entrenamiento más flojo (js/tipo-flojo.js): el que menos sale
    // con tres estrellas, desde cinco ejercicios. Lleva a la ficha de ese tipo.
    if (window.TipoFlojo && alumnoId) {
      try {
        const f = (await TipoFlojo.cargar(sb))[alumnoId];
        if (f && f.porcentaje < TipoFlojo.FLOJO) cosas.push({ icono: '📉', href: E + 'tipos.html#' + encodeURIComponent(f.tipo),
          texto: `Tu habilidad más floja, «${f.nombre}»: tres estrellas en ${f.limpios} de ${f.intentos}` });
      } catch (e) { /* sin dato, sin propuesta */ }
    }

    // Líneas de Aperturas ya empezadas cuyo repaso venció (las nuevas no cuentan:
    // eso es estudiar algo nuevo, no un repaso pendiente).
    const srs = leerJSON('aperturas_srs_v1');
    if (SRS && srs && typeof srs === 'object') {
      const n = Object.keys(srs).filter((id) => srs[id] && srs[id].ultimo && SRS.toca(srs[id])).length;
      if (n) cosas.push({ icono: '📖', href: E + 'aperturas.html',
        texto: n === 1 ? '1 línea de aperturas para repasar' : `${n} líneas de aperturas para repasar` });
    }

    /* El diagnóstico: hacerlo si no hay, repetirlo a las cuatro semanas (es lo
       que pide la última semana del plan). Hacerlo por primera vez no se
       propone en el panel: ahí ya lo ofrecen su franja («Por dónde empezar») y
       su tarjeta en «Lo que te pone tu profesor». */
    const fecha = diag && Date.parse(diag.fecha || '');
    if (!diag || !fecha) {
      if (!op.enPanel) cosas.push({ icono: '🧭', href: E + 'diagnostico.html', texto: 'Hacer el diagnóstico para saber por dónde empezar' });
    } else if (Date.now() - fecha > 28 * 24 * 3600 * 1000) {
      cosas.push({ icono: '🧭', href: E + 'diagnostico.html', texto: 'Repetir el diagnóstico: ya pasaron cuatro semanas' });
    }

    // Partidas terminadas que todavía no revisó en «Tus propios errores»: las de
    // la Academia y, si dejó su usuario, las de Lichess o Chess.com (a esos
    // sitios se les pregunta como mucho cada 6 horas: ErroresPropios.sinRevisar).
    const sin = await partidasSinRevisar(op);
    if (sin) cosas.push(sin);

    // Lo que quedó empezado y no vence: van al final, así que solo se proponen
    // cuando hay lugar (tres como mucho).
    const finales = await finalesPendientes(op);
    if (finales) cosas.push(finales);
    const precision = await precisionOlvidada(op);
    if (precision) cosas.push(precision);
    /* Sin nada pendiente, en el panel, una sugerencia: una sola cosa concreta
       en vez de la tarjeta vacía. Va escrita como sugerencia —no es algo que
       venció ni que pidió nadie— y cambia cada día (de Costa Rica). En el hub
       no: ahí las páginas de entrenamiento están justo debajo, y sin nada
       pendiente el bloque trae solo la meta del día. */
    if (!cosas.length && op.enPanel) {
      const sug = await sugerenciaDeHoy(op, diag);
      if (sug) cosas.push(sug);
    }
    return cosas.slice(0, 3);
  }

  async function partidasSinRevisar(op){
    const E = window.ErroresPropios;
    if (!E || !op.alumnoId || !window.sb) return null;
    let r = null;
    try { r = await E.sinRevisar(sb, op.alumnoId); } catch (e) { return null; }
    const web = r.web || 0, total = r.juego + web;
    if (!total) return null;
    const partes = [];
    if (web) partes.push(`${web} de ${E.SITIO_WEB[r.sitio]}`);
    if (r.juego) partes.push(`${r.juego} de la Academia`);
    return { icono: '🪞', href: op.entreno + (web ? 'tipos.html?traer=web#errores' : 'tipos.html#errores'),
      texto: `${total === 1 ? '1 partida' : `${total} partidas`} sin revisar en «Tus propios errores»` + (web && r.juego ? ` (${partes.join(', ')})` : web ? ` (de ${E.SITIO_WEB[r.sitio]})` : '') };
  }

  /* De dónde sale la sugerencia, en este orden:
     1. Del DIAGNÓSTICO: lo flojo, con dónde practicarlo, según
        PlanEntrenamiento.paraPracticar() —la misma cuenta de la franja «Por
        dónde empezar»—, una área por día si hay varias.
     2. Sin diagnóstico (o sin nada flojo), las páginas de Entrenamiento cuyo
        trabajo CUENTA (las que en js/material-plataforma.js ofrecen la meta
        «cantidad»), en su orden, una por día.
     A quien todavía no hizo ni un ejercicio no se le sugiere nada: la franja
     de arriba ya le dice por dónde empezar, y el mismo destino dos veces en el
     panel hace pensar que son dos cosas. */
  async function sugerenciaDeHoy(op, diag){
    const MP = window.MaterialPlataforma, PE = window.PlanEntrenamiento;
    if (!MP || !Array.isArray(MP.HERRAMIENTAS)) return null;
    if (window.Logros) {
      let r = null;
      try { r = await (op.logros || Logros.cargar()); } catch (e) { r = null; }
      /* El diagnóstico también es una fila de training_progress: no cuenta como
         ejercicio. La misma regla de la franja (mostrarPrimerPaso). */
      const pa = (r && r.stats && r.stats.por_actividad) || {};
      const ejercicios = Object.keys(pa).filter((a) => a !== 'diagnostico').reduce((n, a) => n + (Number(pa[a]) || 0), 0);
      if (r && r.stats && !(ejercicios > 0)) return null;
    }
    const dia = Math.floor((Date.now() - 6 * 3600 * 1000) / 86400000);
    const flojas = PE && PE.paraPracticar && diag && diag.detalle ? PE.paraPracticar(diag.detalle, MP.HERRAMIENTAS) : [];
    if (flojas.length) {
      const p = flojas[dia % flojas.length];
      return { icono: '💡', href: op.arriba + p.href,
        texto: `Sugerencia de hoy, por tu diagnóstico en ${String(p.area.nombre || '').toLowerCase()}: ${p.label}` };
    }
    const opciones = MP.HERRAMIENTAS.filter((h) => h && /^entreno\//.test(h.href || '')
      && h.slug !== 'diagnostico' && Array.isArray(h.metas) && h.metas.includes('cantidad'));
    if (!opciones.length) return null;
    const h = opciones[dia % opciones.length];
    return { icono: '💡', href: op.entreno + h.href.replace(/^entreno\//, ''), texto: `Sugerencia de hoy: ${h.label}` };
  }

  /* Finales contra la máquina ya empezados y sin terminar: cuántos lleva y cuál
     sigue (la página abre sola el primero sin lograr). A quien nunca jugó uno no
     se le propone: sería empujar una página más, no seguir algo. */
  async function finalesPendientes(op){
    const hechos = leerJSON('entreno_finales_solved');
    const n = hechos && typeof hechos === 'object' ? Object.keys(hechos).filter((k) => hechos[k]).length : 0;
    if (!n) return null;
    let banco = null;
    try { const r = await fetch(op.entreno + 'data/finales.json'); if (r.ok) banco = await r.json(); } catch (e) { return null; }
    const lista = (banco && banco.finales) || [];
    const logrados = lista.filter((f) => hechos[f.id]).length;
    const sigue = lista.find((f) => !hechos[f.id]);
    if (!sigue) return null;
    return { icono: '🏁', href: op.entreno + 'finales.html?final=' + encodeURIComponent(sigue.id),
      texto: `Seguir con los finales contra la máquina: «${sigue.titulo}» (${logrados} de ${lista.length} logrados)` };
  }

  /* Precisión posicional: si ya hizo alguna tanda y la última fue hace una
     semana o más. El historial vive en la cuenta (training_state,
     'precision_posicional_historial_v1', lo más nuevo primero, con su fecha),
     así que cuenta también lo hecho antes de que las tandas se registraran en
     training_progress. */
  const DIAS_SIN_PRECISION = 7;
  async function precisionOlvidada(op){
    if (!op.alumnoId || !window.sb) return null;
    let historial = null;
    try {
      const { data } = await sb.from('training_state').select('value').eq('student_id', op.alumnoId).eq('key', 'precision_posicional_historial_v1').maybeSingle();
      historial = data && data.value && typeof data.value.raw === 'string' ? JSON.parse(data.value.raw) : null;
    } catch (e) { return null; }
    const ultima = Array.isArray(historial) && historial[0] ? Date.parse(historial[0].fecha || '') : NaN;
    if (!Number.isFinite(ultima)) return null;
    const dias = Math.floor((Date.now() - ultima) / (24 * 3600 * 1000));
    if (dias < DIAS_SIN_PRECISION) return null;
    return { icono: '🧭', href: op.entreno + 'precision-posicional.html',
      texto: `Una tanda de Precisión posicional: la última fue hace ${dias} días` };
  }

  /* La meta del día: cuántos ejercicios lleva hoy de los que hacen falta para
     que el día cuente en la racha, y la racha. La cuenta es la de Logros
     (js/logros.js → progreso_dias_y_racha), no otra: dos pantallas que cuentan
     lo mismo por su lado terminan diciendo cosas distintas. */
  async function pintarMeta(op){
    if (!window.Logros) return false;
    let r;
    try { r = await (op.logros || Logros.cargar()); } catch (e) { return false; }
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
    pintarMedalla(r, op);
    return true;
  }

  /* La próxima medalla: de las que ya empezó (algo hecho) y no tiene, la que
     está más cerca en proporción; a igual avance, la que pide menos. Se dice
     cuánto le falta y qué pide la medalla, con el enlace a Logros. Sin
     ninguna empezada no se dice nada: «te faltan 50» no engancha a nadie. */
  function proximaMedalla(logros){
    return (logros || []).filter((l) => l && !l.conseguido && l.valor > 0 && l.meta > l.valor)
      .sort((a, b) => b.progreso - a.progreso || (a.meta - a.valor) - (b.meta - b.valor))[0] || null;
  }
  function pintarMedalla(r, op){
    const el = document.getElementById('hoy-medalla');
    const l = proximaMedalla(r && r.logros);
    if (!el || !l) return;
    const falta = l.meta - l.valor;
    el.href = op.arriba + 'logros.html';
    el.textContent = `${l.emoji || '🏅'} Te ${falta === 1 ? 'falta 1' : 'faltan ' + falta} para la medalla «${l.nombre}»: ${String(l.descripcion || '').replace(/\.$/, '')}.`;
    el.hidden = false;
  }

  /* Tu semana: los últimos 7 días contra los 7 anteriores. «Esta semana: 48
     ejercicios (la anterior, 31) · 70 % sin error ni pista (la anterior,
     62 %).» La cuenta la hace la base (entreno_mi_semana, días de Costa
     Rica). Sin nada en las dos semanas, o si la base no responde, no se pinta. */
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
    pintarDias(s.dias);
  }

  /* Las siete barras. La más alta llena la caja; hoy va en negrita y dice
     «hoy». La altura es adorno (aria-hidden): el número va escrito debajo y el
     lector de pantalla dice el día completo. */
  const DIA_CORTO = new Intl.DateTimeFormat('es-CR', { weekday: 'short', timeZone: 'UTC' });
  const DIA_LARGO = new Intl.DateTimeFormat('es-CR', { weekday: 'long', timeZone: 'UTC' });
  function pintarDias(dias){
    const lista = document.getElementById('hoy-semana-dias');
    if (!lista || !Array.isArray(dias) || dias.length !== 7) return;
    const max = Math.max(1, ...dias.map((d) => Number(d.n) || 0));
    lista.replaceChildren();
    dias.forEach((d, i) => {
      const n = Number(d.n) || 0;
      const fecha = new Date(String(d.dia) + 'T12:00:00Z');
      const esHoy = i === dias.length - 1;
      const li = document.createElement('li');
      li.className = 'flex flex-col items-center gap-0.5';
      const caja = document.createElement('span');
      caja.className = 'flex items-end h-10 w-full rounded bg-brand-50 dark:bg-brand-800';
      caja.setAttribute('aria-hidden', 'true');
      const barra = document.createElement('span');
      barra.className = 'block w-full rounded ' + (esHoy ? 'bg-accent-600' : 'bg-brand-600 dark:bg-brand-300');
      barra.style.height = (n ? Math.max(8, Math.round(100 * n / max)) : 0) + '%';
      caja.appendChild(barra);
      const sr = document.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = (esHoy ? 'hoy, ' : '') + DIA_LARGO.format(fecha) + ': ';
      const num = document.createElement('span');
      num.className = 'text-xs font-semibold text-brand-800 dark:text-white';
      num.textContent = String(n);
      const dia = document.createElement('span');
      dia.className = 'text-[10px] ' + (esHoy ? 'font-bold text-brand-800 dark:text-white' : 'text-brand-600 dark:text-brand-300');
      dia.setAttribute('aria-hidden', 'true');
      dia.textContent = esHoy ? 'hoy' : DIA_CORTO.format(fecha).replace('.', '');
      li.append(caja, sr, num, dia);
      lista.appendChild(li);
    });
    // style.display y no `hidden`: la clase `grid` de Tailwind le gana a ese atributo.
    lista.style.display = '';
  }

  /* El resumen del día: «Hoy: Mates 6, Habilidades 4, Memoria 2 ·
     9 de 11 limpios · Para mañana: 3 repasos.» Lo de hoy lo cuenta la base
     (entreno_resumen_hoy, día de Costa Rica); los nombres son los de
     js/tiempo-secciones.js, los mismos de Informes; los repasos de mañana, las
     colas de este aparato (viajan con la cuenta). Si la base no responde, no
     se pinta nada. */
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
    // El total ya lo dice la meta, justo arriba: acá va solo cómo se reparte.
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
  function atarAvisos(){
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
  }

  async function pintar(caja, opciones){
    if (!caja) return;
    const op = Object.assign({ arriba: '', entreno: '', enPanel: false }, opciones || {});
    caja.innerHTML = MARCADO;
    atarAvisos();
    const [cosas, conMeta] = await Promise.all([cosasDeHoy(op), pintarMeta(op)]);
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
    pintarTanda(cosas, op);
    caja.classList.toggle('hidden', !cosas.length && !conMeta);
  }

  /* «Entrenar 10 minutos»: las tres primeras cosas de hoy, o Mates si hoy
     no toca nada en particular (siempre hay algo que hacer en 10 minutos). */
  function pintarTanda(cosas, op){
    const caja = document.getElementById('hoy-tanda');
    if (!caja || !window.TandaDiez) return;
    const pasos = cosas.slice(0, 3).map((c) => ({ href: c.href, texto: c.texto, icono: c.icono }));
    if (pasos.length < 2) pasos.push({ href: op.entreno + 'mates.html', texto: 'Mates', icono: '♚' });
    document.getElementById('hoy-tanda-que').textContent =
      'Con ' + pasos.map((p) => p.texto).join(', ').replace(/, ([^,]*)$/, ' y $1') + '. La barra de abajo te lleva al siguiente.';
    document.getElementById('hoy-tanda-boton').addEventListener('click', () => TandaDiez.empezar(pasos));
    caja.hidden = false;
  }

  return { pintar, textoSemana, proximaMedalla };
})();
