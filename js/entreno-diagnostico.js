/* El código de entreno/diagnostico.html.

   Vivía escrito dentro de la página, en un <script> de 46 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* ===== Diagnóstico de nivel =====
 * Una pregunta por pantalla, sin decir si se acertó: la corrección entera se
 * muestra al final, para que la medición no se contamine con lo aprendido
 * durante la propia prueba. La prueba se puede dejar a medias: el estado vive
 * en localStorage y al volver retoma donde iba.
 *
 * Al terminar, el resultado se guarda en training_progress con la actividad
 * "diagnostico" (EntrenoProgress), que es lo que lee Informes para armar el
 * informe del alumno y su plan de entrenamiento.
 */
/* El banco tiene más ítems de los que se preguntan: cada prueba sortea los
   suyos (DiagnosticoPrueba, en js/diagnostico-items.js). ITEMS son los de ESTA
   prueba —siempre 63, siempre 180 puntos, siempre 7 por área—, y sus ids
   quedan guardados en el estado para poder retomarla igual y para volver a
   mostrar el resultado con las preguntas que de verdad se hicieron. */
const PRUEBA = window.DiagnosticoPrueba;
const PE = window.PlanEntrenamiento;
let ITEMS = [];
const ESTADO_KEY = 'diagnostico_estado_v1';
const RESULTADO_KEY = 'diagnostico_resultado_v1';
/* Resultado terminado que todavía no llegó a la base (red caída, sesión
   vencida, la base que lo rechazó). Se guarda aparte y se reintenta al abrir
   la página, porque el diagnóstico no sirve de nada si el profesor no lo ve. */
const PENDIENTE_KEY = 'diagnostico_pendiente_v1';
/* Versión de la prueba en curso:
     1 — se preguntaba el banco entero.
     2 — la prueba se sortea y el estado guarda qué ítems tocaron.
     3 — la prueba tiene escalones de dificultad 4 y 5 (preguntas duras).
     4 — se suma la novena área (Maestría): 63 ítems en vez de 56, y otro
         puntaje. Un resultado nuevo ya no se compara con uno de antes.
     5 — 60 ítems, la mitad de escalones 4 y 5, muchos de resolver en el
         tablero; el nivel sale de la fuerza medida en puntos Elo
         (PlanEntrenamiento.medir), no de los escalones.
     6 — reglas deja el escalón 5 por un segundo de escalón 4 (ninguna pregunta
         de reglas llegó a 2000 con los datos), y las de Lichess se recalibraron:
         eran unos 380 puntos más fáciles de lo que se había supuesto.
   Una prueba empezada con una versión anterior no se puede continuar: los
   ejercicios ya no son los mismos y el resultado mezclaría dos mediciones
   distintas. Se descarta y se avisa en la portada. */
const VERSION = 6;

/* "No lo sé todavía" es una respuesta más, no un botón de saltar: vale cero
   puntos igual que fallar, pero se guarda aparte. Para el profesor no es lo
   mismo un error (hay algo mal aprendido que corregir) que un "no sé" (hay un
   hueco que enseñar), y para la medición es oro: quien adivina a ciegas infla
   su porcentaje y sale con un plan que no le sirve. */
const NO_SE = 'nose';

const PERFIL_PREGUNTAS = [
  { id: 'tiempo', texto: '¿Hace cuánto juegas ajedrez?', opciones: ['Menos de 6 meses', 'Entre 6 meses y 2 años', 'Más de 2 años'] },
  { id: 'torneos', texto: '¿Juegas torneos?', opciones: ['Todavía no', 'Alguno suelto', 'Sí, varios al año'] },
  { id: 'practica', texto: '¿Cuánto practicas por semana, fuera de clase?', opciones: ['Casi nada', 'Un par de ratos', 'Casi todos los días'] },
];

const GLYPH = {
  w: { p:'♙', n:'♘', b:'♗', r:'♖', q:'♕', k:'♔' },
  b: { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', k:'♚' },
};
const FILES = ['a','b','c','d','e','f','g','h'];

let estado = { perfil: {}, idx: 0, respuestas: {}, items: [] };
let perfilCuenta = null;   // profiles: { elo, elo_tipo } del alumno (Configuración › Perfil)
let sesionActual = null;   // sesión de Supabase (la fija init); null = visitante sin cuenta
/* El enlace propio de un supervisor (entreno/diagnostico.html?s=<código>): el
   diagnóstico del visitante le llega a él y no a administración. La página
   solo manda el código; a quién le llega lo decide el trigger de la base
   (diagnosticos_publicos_supervisor). `destino` es el nombre que se le enseña
   al visitante, sacado de enlace_diagnostico_publico(). */
let enlaceSupervisor = null; // { codigo, destino } | null
const FORMA_ENLACE = /^[0-9a-f]{10}$/;
let itemActual = null;
let ordenOpciones = null;   // en qué orden se muestran las opciones de este ítem
let seleccion = null;      // respuesta en curso (índice de opción, casilla o jugada)
let origenElegido = null;  // casilla de origen en los ítems de jugada

/* ---------------- Estado guardado ---------------- */
let pruebaVieja = false;   // había una a medias, de una versión anterior

function cargarEstado() {
  let crudo = null;
  try { crudo = JSON.parse(localStorage.getItem(ESTADO_KEY) || 'null'); } catch (e) {}
  if (!crudo || !crudo.estado) return;
  if (crudo.version !== VERSION) {
    // De otra versión de la prueba: se descarta (ver el comentario de VERSION).
    pruebaVieja = (crudo.estado.idx || 0) > 0;
    borrarEstado();
    return;
  }
  estado = crudo.estado;
  ITEMS = PRUEBA.porIds(estado.items);
  // Si el banco cambió y algún ítem ya no existe, se completa la prueba con
  // otros del área que falte, en vez de dejarla corta.
  if (ITEMS.length !== PRUEBA.TOTAL) ITEMS = PRUEBA.armar(ITEMS.map((i) => i.id));
  estado.items = ITEMS.map((i) => i.id);
}
function guardarEstado() {
  // «guardado» es lo que permite saber, en otro aparato, que esta prueba a
  // medias quedó vieja: si hay un resultado posterior, ya se terminó (ver
  // js/progreso-usuario.js).
  try { localStorage.setItem(ESTADO_KEY, JSON.stringify({ version: VERSION, estado, guardado: new Date().toISOString() })); } catch (e) {}
}
function borrarEstado() {
  try { localStorage.removeItem(ESTADO_KEY); } catch (e) {}
  estado = { perfil: {}, idx: 0, respuestas: {}, items: [] };
  ITEMS = [];
}
function resultadoGuardado() {
  try { return JSON.parse(localStorage.getItem(RESULTADO_KEY) || 'null'); } catch (e) { return null; }
}
function pendienteGuardado() {
  try { return JSON.parse(localStorage.getItem(PENDIENTE_KEY) || 'null'); } catch (e) { return null; }
}

/* Sube el resultado a training_progress, que es de donde lo lee Informes.
   Si no se puede, queda apuntado como pendiente y se reintenta al volver a
   abrir la página: así un corte de red no borra la prueba de la vista del
   profesor. Devuelve true solo si la base de verdad lo aceptó. */
async function subirResultado(detalle) {
  let r = null;
  try { r = await EntrenoProgress.log('diagnostico', detalle); } catch (e) { r = null; }
  if (r && r.ok) {
    try { localStorage.removeItem(PENDIENTE_KEY); } catch (e) {}
    return true;
  }
  try { localStorage.setItem(PENDIENTE_KEY, JSON.stringify(detalle)); } catch (e) {}
  return false;
}

function avisoGuardado(ok) {
  return ok
    ? 'Resultado guardado: tu profesor ya puede verlo en Informes.'
    : 'Tu resultado quedó en este dispositivo, pero todavía no se pudo subir a tu cuenta. '
      + 'Se reintenta solo la próxima vez que abras esta página con internet.';
}

/* ---------------- Portada ---------------- */
function pintarPerfil() {
  const box = document.getElementById('perfil-form');
  box.innerHTML = '';
  PERFIL_PREGUNTAS.forEach((p) => {
    /* Cada pregunta es un grupo con nombre: sin eso, quien usa lector oía
       «Menos de un año, botón» sin saber a qué pregunta contestaba. Y cada
       respuesta dice si está elegida (aria-pressed): el color solo no lo dice. */
    const grupo = document.createElement('div');
    const idTexto = 'perfil-q-' + p.id;
    grupo.setAttribute('role', 'group');
    grupo.setAttribute('aria-labelledby', idTexto);
    grupo.innerHTML = `<p id="${idTexto}" class="text-sm font-medium text-brand-700 dark:text-brand-200 mb-2">${p.texto}</p>`;
    const fila = document.createElement('div');
    fila.className = 'flex flex-wrap gap-2';
    p.opciones.forEach((op) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = op;
      btn.dataset.valor = op;
      btn.className = claseOpcionPerfil(estado.perfil[p.id] === op);
      btn.setAttribute('aria-pressed', estado.perfil[p.id] === op ? 'true' : 'false');
      btn.addEventListener('click', () => {
        estado.perfil[p.id] = op;
        guardarEstado();
        pintarPerfil();
        /* pintarPerfil() repinta todo y el botón que tenía el foco desaparece:
           el foco caía al <body>. Vuelve al mismo, ya marcado. */
        const igual = Array.from(box.querySelectorAll('[role=group][aria-labelledby="' + idTexto + '"] button'))
          .find((b) => b.dataset.valor === op);
        if (igual) igual.focus();
      });
      fila.appendChild(btn);
    });
    grupo.appendChild(fila);
    box.appendChild(grupo);
  });
  // Elo: viene de Configuración › Perfil; acá se puede escribir o corregir y queda
  // guardado en el perfil al terminar. Con él, el nivel estimado y el plan se afinan.
  const g = document.createElement('div');
  const eloActual = estado.perfil.elo != null ? estado.perfil.elo : (perfilCuenta && perfilCuenta.elo) || '';
  const tipoActual = estado.perfil.elo_tipo || (perfilCuenta && perfilCuenta.elo_tipo) || 'fide';
  g.innerHTML = `<label for="perfil-elo" class="block text-sm font-medium text-brand-700 dark:text-brand-200 mb-2">¿Cuál es tu Elo (rating)? Si no tienes, déjalo vacío.</label>
    <div class="flex flex-wrap gap-2">
      <input id="perfil-elo" type="number" inputmode="numeric" min="100" max="3500" step="1" placeholder="Ej. 1350" value="${eloActual}" class="w-32 px-3 py-2 rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500">
      <select id="perfil-elo-tipo" aria-label="Origen del Elo" class="flex-1 min-w-[12rem] px-3 py-2 rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500">
        ${PE.ELO_TIPOS.map((t) => `<option value="${t.id}"${t.id === tipoActual ? ' selected' : ''}>${t.etiqueta}</option>`).join('')}
      </select>
    </div>
    <p class="text-xs text-brand-450 dark:text-brand-350 mt-1">${perfilCuenta && perfilCuenta.elo ? `Registrado en tu perfil: ${perfilCuenta.elo}. Si cambió, corrígelo aquí y queda actualizado.` : sesionActual ? 'Con tu Elo, el diagnóstico compara lo que sabes con lo que rindes en partida y ajusta el nivel y el plan. Queda guardado en tu perfil (Configuración).' : 'Con tu Elo, el diagnóstico compara lo que sabes con lo que rindes en partida y ajusta el nivel estimado.'}</p>`;
  box.appendChild(g);
  const inp = g.querySelector('#perfil-elo'), sel = g.querySelector('#perfil-elo-tipo');
  const guardarElo = () => {
    const v = PE.eloValido(inp.value);
    estado.perfil.elo = v; estado.perfil.elo_tipo = v ? sel.value : null;
    guardarEstado();
  };
  inp.addEventListener('change', guardarElo); sel.addEventListener('change', guardarElo);
}
function claseOpcionPerfil(activa) {
  return 'text-sm px-3 py-2 rounded-lg border transition-colors ' + (activa
    ? 'bg-accent-500 border-accent-500 text-brand-900 font-semibold'
    : 'bg-white dark:bg-brand-800 border-brand-200 dark:border-brand-700 text-brand-600 dark:text-brand-300 hover:border-accent-500');
}

function pintarPrevio() {
  const previo = resultadoGuardado();
  const box = document.getElementById('previo');
  if (!previo) return;
  const fecha = new Date(previo.fecha).toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' });
  box.innerHTML = `
    <h2 class="font-serif text-lg font-bold text-brand-800 dark:text-white mb-1">Ya hiciste el diagnóstico</h2>
    <p class="text-sm text-brand-500 dark:text-brand-300 mb-3">El ${fecha} quedaste en <strong class="text-brand-800 dark:text-white">${previo.nivel}</strong> con ${previo.porcentaje}% de la prueba. Repetirlo cada cuatro semanas es la forma de ver si el plan está funcionando.</p>
    <button type="button" id="ver-previo-btn" class="text-sm text-accent-700 dark:text-accent-400 hover:underline">Ver ese resultado otra vez</button>
    ${pendienteGuardado() ? '<p class="text-xs text-red-600 dark:text-red-400 mt-2">Ese resultado todavía no llegó a tu cuenta, así que tu profesor aún no lo ve. Se está reintentando solo: deja esta página abierta un momento con internet.</p>' : ''}`;
  box.classList.remove('hidden');
  document.getElementById('ver-previo-btn').addEventListener('click', () => mostrarResultado(previo.detalle, false));
}

/* ---------------- Prueba ---------------- */
function irA(vista) {
  ['intro-view', 'test-view', 'result-view'].forEach((id) => {
    document.getElementById(id).classList.toggle('hidden', id !== vista);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function empezar() {
  if (!sesionActual) {
    const nombre = document.getElementById('visitante-nombre').value.trim();
    const email = document.getElementById('visitante-email').value.trim();
    const telefono = document.getElementById('visitante-telefono').value.trim();
    const msg = document.getElementById('visitante-msg');
    if (!nombre) { msg.textContent = 'Escribe tu nombre para empezar.'; document.getElementById('visitante-nombre').focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = 'Escribe un correo válido para poder enviarte el resultado.'; document.getElementById('visitante-email').focus(); return; }
    msg.textContent = '';
    estado.visitante = { nombre, email, telefono,
      enlace: enlaceSupervisor ? enlaceSupervisor.codigo : null,
      destino: enlaceSupervisor ? enlaceSupervisor.destino : null };
    guardarEstado();
  }
  if (!ITEMS.length || estado.idx >= ITEMS.length) {
    ITEMS = PRUEBA.armar();
    estado.items = ITEMS.map((i) => i.id);
    estado.idx = 0;
    estado.respuestas = {};
  }
  guardarEstado();
  irA('test-view');
  pintarItem();
}

function pintarItem() {
  itemActual = ITEMS[estado.idx];
  seleccion = null;
  origenElegido = null;
  const area = PE.AREA_POR_ID[itemActual.area];
  document.getElementById('q-counter').textContent = `Pregunta ${estado.idx + 1} de ${ITEMS.length}`;
  document.getElementById('q-area').textContent = `${area.emoji} ${area.nombre}`;
  document.getElementById('q-bar').style.width = ((estado.idx / ITEMS.length) * 100) + '%';
  document.getElementById('q-text').textContent = itemActual.enunciado;
  document.getElementById('next-btn').disabled = true;
  document.getElementById('next-btn').textContent = estado.idx === ITEMS.length - 1 ? 'Terminar y ver resultado →' : 'Siguiente →';

  const opciones = document.getElementById('q-options');
  const hint = document.getElementById('q-hint');
  opciones.innerHTML = '';
  hint.textContent = '';

  const conTablero = !!itemActual.fen;
  const wrap = document.getElementById('q-board-wrap');
  wrap.classList.toggle('hidden', !conTablero);
  wrap.classList.toggle('flex', conTablero);
  if (conTablero) pintarTablero(new Chess(itemActual.fen));
  /* Sin tablero, las preguntas «caballos» o «posición» no tienen nada que
     contestar: antes contestaban sobre el tablero de la pregunta ANTERIOR, que
     ya no se ve. */
  else juegoDelItem = null;

  const esOpcion = itemActual.tipo === 'opcion' || itemActual.tipo === 'opcion_tablero';
  if (esOpcion) {
    // Las opciones se barajan en cada intento: escritas siempre en el mismo orden,
    // la correcta quedaría siempre en el mismo lugar y bastaría con marcar la
    // primera para aprobar media prueba sin saber ajedrez.
    ordenOpciones = barajar(itemActual.opciones.map((_, i) => i));
    ordenOpciones.forEach((original, posicion) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.original = String(original);
      btn.className = claseOpcion(false);
      // La letra va ESCRITA dentro del botón, no puesta con CSS ni con un
      // ::before: es lo que se dice para contestar por el cuadro de comandos,
      // así que quien la oye tiene que oírla de la misma lista que lee.
      btn.textContent = `Opción ${CuadroComandos.letra(posicion)}. ${itemActual.opciones[original]}`;
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', () => elegirOpcion(posicion));
      opciones.appendChild(btn);
    });
  } else if (itemActual.tipo === 'casilla') {
    hint.textContent = 'Haz clic en la casilla que responde la pregunta.';
  } else if (itemActual.tipo === 'jugada') {
    // Siempre se responde con UNA jugada, también en los mates en dos o en
    // tres: se pide la jugada clave, no la secuencia entera. Sin decirlo, el
    // alumno juega la primera, no pasa nada y se queda sin saber si tiene que
    // seguir.
    hint.textContent = pistaDeJugada();
  }
  opciones.appendChild(botonNoSe());
  prepararComandos(esOpcion);
}

/* Elegir la opción que está en la POSICIÓN `posicion` de la lista barajada.
   Lo llaman el clic en el botón y el cuadro de comandos: una sola forma de
   quedar elegida, para que escribir "B" y tocar la segunda opción no puedan
   terminar marcando cosas distintas. */
function elegirOpcion(posicion) {
  const opciones = document.getElementById('q-options');
  seleccion = ordenOpciones[posicion];
  [...opciones.children].forEach((b, j) => {
    if (b.id === 'no-se-btn') b.className = claseNoSe(false);
    else {
      b.className = claseOpcion(j === posicion);
      // La elegida se DICE, no solo se pinta de otro color.
      b.setAttribute('aria-pressed', j === posicion ? 'true' : 'false');
    }
  });
  document.getElementById('next-btn').disabled = false;
}

/* ---------------- El cuadro de comandos (Modo Adaptado) ----------------
 * Un ítem de tablero solo se podía contestar arrastrando o haciendo clic en
 * las casillas, y uno de opción solo apretando su botón: con lector de
 * pantalla, media prueba era incontestable — y no daba ningún error, la página
 * se veía perfecta. Acá la respuesta también se escribe: la letra de la
 * opción, la casilla, la jugada o "no lo sé".
 *
 * El cuadro se monta UNA vez y se reconfigura en cada pregunta; lo que decide
 * si se ve es el CSS (html.adaptive-mode), no este código. Ver
 * js/cuadro-comandos.js. */
let comandos = null;

function prepararComandos(esOpcion) {
  if (!window.CuadroComandos) return;
  if (!comandos) {
    comandos = CuadroComandos.montar(document.getElementById('q-comandos'), {
      // Con estos dos, el mismo recuadro contesta preguntas sobre la posición
      // antes de tratar el texto como respuesta: "caballos", "qué hay en e4".
      // En una pregunta de tablero eso es lo único que reemplaza a mirarlo.
      juego: () => juegoDelItem,
      tablero: () => teclado,
      onEnviar: responderEscribiendo,
    });
  }
  comandos.limpiar().decir('');
  // Al responder por el cuadro se pasa solo a la siguiente, así que hay que
  // decir de antemano qué va a hacer ese Enter — y sobre todo cuando es el que
  // termina la prueba.
  const queHace = esUltima()
    ? ' Es la última: al responder se termina la prueba y se muestra el resultado.'
    : ' Al responder se pasa sola a la siguiente.';
  if (esOpcion) {
    const cuantas = itemActual.opciones.length;
    comandos.etiqueta('Escribe la letra de la opción');
    comandos.ayuda(`Opciones de la A a la ${CuadroComandos.letra(cuantas - 1)}. `
      + 'Puedes escribir solo la letra ("B"), "opción B", o "no lo sé".'
      + (itemActual.fen ? ' También puedes preguntar por la posición: "caballos", "qué hay en e4".' : '')
      + queHace);
    // En los ítems de opción CON tablero la posición también hace falta: la
    // pregunta habla de una posición que no se puede ver.
    comandos.posicion(itemActual.fen ? new Chess(itemActual.fen) : '');
  } else if (itemActual.tipo === 'casilla') {
    comandos.etiqueta('Escribe la casilla');
    comandos.ayuda('Por ejemplo «e4» o «eva 4», como se leen las columnas. También vale «no lo sé».' + queHace);
    comandos.posicion(new Chess(itemActual.fen));
  } else {
    comandos.etiqueta('Escribe tu jugada');
    comandos.ayuda('Una sola jugada, en español o en inglés: «Cf3», «Nf3», «e4», «Dxh7+», «e8=D». También vale «no lo sé».' + queHace);
    comandos.posicion(new Chess(itemActual.fen));
  }
  // Con el recuadro a la vista, la pregunta (y sus opciones) se dice ahí, también al llegar con «Siguiente».
  if (CuadroComandos.activo()) comandos.decir(preguntaDicha());
}

function esUltima() { return estado.idx === ITEMS.length - 1; }

/* Las jugadas escritas en el enunciado o en las opciones («Ag3», «O-O», «Rd2»)
   dichas en palabras para el aviso del recuadro: leídas tal cual, un lector
   dice «a g tres» o «o guion o». El banco no se toca: esto solo cambia lo que
   se DICE. Van en español (R rey, D dama, T torre, A alfil, C caballo). */
const ES_A_EN = { R: 'K', D: 'Q', T: 'R', A: 'B', C: 'N' };
function enPalabras(texto) {
  if (!window.BlindNotation || !BlindNotation.sanSpoken) return texto;
  return String(texto).replace(/(^|[\s(«"¿¡,;:.…])(O-O-O|O-O|[RDTAC]?[a-h]?[1-8]?x?[a-h][1-8](?:=[DTAC])?[+#]?)(?=$|[\s).,;:!?»"])/g,
    (todo, antes, san) => {
      const en = san.replace(/^[RDTAC]/, (l) => ES_A_EN[l]).replace(/=([DTAC])/, (_, l) => '=' + ES_A_EN[l]);
      return antes + BlindNotation.sanSpoken(en).replace(/^\S/, (c) => c.toLowerCase());
    });
}
function opcionesDichas() {
  if (!ordenOpciones || !(itemActual.tipo === 'opcion' || itemActual.tipo === 'opcion_tablero')) return '';
  return ' ' + ordenOpciones.map((original, i) => `Opción ${CuadroComandos.letra(i)}: ${enPalabras(String(itemActual.opciones[original]).replace(/[.\s]+$/, ''))}.`).join(' ');
}
/* La pregunta entera, como se oye: el enunciado y, si es de opción, las
   opciones con su letra. Antes el aviso decía solo el enunciado, y quien no ve
   contestaba «B» a una opción que nadie le había leído. */
function preguntaDicha() {
  return `Pregunta ${estado.idx + 1} de ${ITEMS.length}: ${enPalabras(itemActual.enunciado)}${opcionesDichas()}`;
}

/* Contestar por el cuadro PASA SOLA a la siguiente pregunta: quien contesta
   escribiendo no tiene por qué ir a buscar el botón "Siguiente", que es
   justamente lo que este cuadro viene a evitar.
 *
 * Y por eso el aviso lleva el enunciado de la pregunta nueva: al no pasar por
 * el botón ya no hay nada que anuncie el cambio, y quien escucha se quedaría
 * contestando a ciegas una pregunta que nunca oyó. El aviso es región viva, así
 * que se lee solo. Los botones de opción NO avanzan: ahí se ve la pantalla y
 * poder cambiar de idea antes de seguir es lo normal. */
function avanzarEscribiendo(resumen) {
  const ultima = esUltima();
  siguiente();
  if (ultima) return;   // la prueba terminó: ya no hay cuadro que llenar
  comandos.decir(`${resumen} ${preguntaDicha()}`);
  comandos.enfocar();
}

function responderEscribiendo(texto, api) {
  const t = CuadroComandos.normalizar(texto);
  if (/^(opciones|las opciones)$/.test(t) && opcionesDichas()) { api.limpiar(); api.decir(opcionesDichas().trim()); return; }
  if (/^(repetir|repite|pregunta|la pregunta)$/.test(t)) { api.limpiar(); api.decir(preguntaDicha()); return; }
  if (CuadroComandos.esNoSe(texto)) {
    const noSe = document.getElementById('no-se-btn');
    if (noSe) noSe.click();
    api.limpiar();
    avanzarEscribiendo('Anotado: no lo sabías.');
    return;
  }
  if (itemActual.tipo === 'opcion' || itemActual.tipo === 'opcion_tablero') {
    const i = CuadroComandos.opcionPedida(texto, itemActual.opciones.length);
    if (i === null) {
      api.decir(`No entendí «${String(texto).trim()}». Escribe la letra de una opción, de la A a la ${CuadroComandos.letra(itemActual.opciones.length - 1)}.`);
      return;
    }
    const dicho = `Anotado: opción ${CuadroComandos.letra(i)}, ${enPalabras(itemActual.opciones[ordenOpciones[i]])}.`;
    elegirOpcion(i);
    api.limpiar();
    avanzarEscribiendo(dicho);
    return;
  }
  if (itemActual.tipo === 'casilla') {
    const sq = CuadroComandos.casillaPedida(texto);
    if (!sq) { api.decir(`No entendí «${String(texto).trim()}». Escribe una casilla, por ejemplo «e4».`); return; }
    seleccion = sq;
    pintarTablero(new Chess(itemActual.fen), [sq]);
    const noSe = document.getElementById('no-se-btn');
    if (noSe) noSe.className = claseNoSe(false);
    document.getElementById('q-hint').textContent = `Elegiste ${casillaDicha(sq)}.`;
    document.getElementById('next-btn').disabled = false;
    api.limpiar();
    avanzarEscribiendo(`Anotado: ${casillaDicha(sq)}.`);
    return;
  }
  if (itemActual.tipo === 'jugada') {
    // El intérprete HACE la jugada sobre la partida que se le pasa, así que se
    // le pasa una copia de usar y tirar: la respuesta es la jugada, no una
    // posición nueva.
    const juego = new Chess(itemActual.fen);
    const mv = CuadroComandos.jugadaPedida(juego, texto);
    /* «no es una jugada legal» solo si parece una jugada; si no, «No entendí»
       (ComandosTablero.noSePudoJugar, la misma frase en todo el sitio). */
    if (!mv) { api.decir(window.ComandosTablero && ComandosTablero.noSePudoJugar ? ComandosTablero.noSePudoJugar(texto) : `«${String(texto).trim()}» no es una jugada legal en esta posición.`); return; }
    seleccion = { from: mv.from, to: mv.to, promotion: mv.promotion, san: mv.san };
    origenElegido = null;
    pintarTablero(juego, [mv.from, mv.to]);
    const noSe = document.getElementById('no-se-btn');
    if (noSe) noSe.className = claseNoSe(false);
    document.getElementById('q-hint').textContent = `Jugaste ${jugadaDicha(mv.san)}: esa es tu respuesta y no hace falta jugar más.`;
    document.getElementById('next-btn').disabled = false;
    api.limpiar();
    avanzarEscribiendo(`Anotado: ${jugadaDicha(mv.san)}.`);
  }
}

// Siempre al final y con otra pinta: no compite con las opciones de contenido,
// se ofrece como salida honesta cuando de verdad no se sabe.
/* Cómo se contesta una pregunta de jugada. "Haz clic en la pieza" no le sirve a
   quien no ve el tablero: en Modo Adaptado se contesta escribiendo, y la pista
   tiene que decir eso. */
function pistaDeJugada(){
  return document.documentElement.classList.contains('adaptive-mode')
    ? 'Se responde con una sola jugada: escríbela en el recuadro, por ejemplo «Cf3» o «e4».'
    : 'Se responde con una sola jugada: haz clic en la pieza y después en su casilla de destino.';
}

function botonNoSe() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'no-se-btn';
  btn.className = claseNoSe(false);
  btn.textContent = '🤔 No lo sé todavía';
  btn.addEventListener('click', () => {
    seleccion = NO_SE;
    origenElegido = null;
    const caja = document.getElementById('q-options');
    [...caja.children].forEach((b) => { if (b !== btn) { b.className = claseOpcion(false); b.setAttribute('aria-pressed', 'false'); } });
    btn.className = claseNoSe(true);
    if (itemActual.fen) pintarTablero(new Chess(itemActual.fen));
    document.getElementById('q-hint').textContent = 'Anotado: no lo sabías. Al final te explicamos esta.';
    document.getElementById('next-btn').disabled = false;
  });
  return btn;
}

function claseNoSe(activa) {
  return 'w-full text-left text-sm px-4 py-3 rounded-xl border border-dashed transition-colors mt-1 ' + (activa
    ? 'bg-brand-100 dark:bg-brand-800 border-brand-400 text-brand-800 dark:text-white font-semibold'
    : 'bg-transparent border-brand-300 dark:border-brand-700 text-brand-500 dark:text-brand-300 hover:border-accent-500');
}

function barajar(lista) {
  const copia = lista.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function claseOpcion(activa) {
  return 'w-full text-left text-sm px-4 py-3 rounded-xl border transition-colors ' + (activa
    ? 'bg-accent-500 border-accent-500 text-brand-900 font-semibold'
    : 'bg-white dark:bg-brand-900 border-brand-200 dark:border-brand-700 text-brand-700 dark:text-brand-200 hover:border-accent-500');
}

function esCasillaClara(square) {
  return ((square.charCodeAt(0) - 97) + (parseInt(square[1], 10) - 1)) % 2 === 1;
}

function pintarTablero(juego, destacadas) {
  const board = document.getElementById('q-board');
  board.innerHTML = '';
  const interactivo = itemActual.tipo === 'jugada' || itemActual.tipo === 'casilla';
  for (let rank = 8; rank >= 1; rank--) {
    for (const f of FILES) {
      const square = f + rank;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.square = square;
      /* Sin `disabled`: un botón deshabilitado no recibe el foco, y el tablero
         de una pregunta de opción no se podía recorrer con el teclado, justo el
         que hay que mirar para elegir. Se dice con aria-disabled. */
      if (!interactivo) btn.setAttribute('aria-disabled', 'true');
      let cls = 'flex items-center justify-center select-none w-full h-full text-2xl sm:text-3xl md:text-4xl ' +
        (esCasillaClara(square) ? 'bg-brand-100 ' : 'bg-brand-500 ') + (interactivo ? 'cursor-pointer ' : 'cursor-default ');
      if (destacadas && destacadas.includes(square)) cls += 'outline outline-4 -outline-offset-4 outline-accent-500 ';
      btn.className = cls;
      const pieza = juego.get(square);
      if (pieza) {
        const span = document.createElement('span');
        if (window.PiezaPreferida) PiezaPreferida.pintar(span, pieza.type, pieza.color);
        else {
          span.className = pieza.color === 'w' ? 'piece-white' : 'piece-black';
          span.textContent = GLYPH[pieza.color][pieza.type];
        }
        span.setAttribute('aria-hidden', 'true');
        btn.appendChild(span);
      }
      // Qué dice cada casilla lo escribe js/tablero-accesible.js: eran 64
      // botones mudos, o sea un tablero que con lector de pantalla no se podía
      // ni mirar, en una prueba donde media docena de preguntas son de tablero.
      if (destacadas && destacadas.includes(square)) btn.dataset.estado = 'elegida';
      if (interactivo) btn.addEventListener('click', () => clicEnCasilla(square));
      board.appendChild(btn);
    }
  }
  montarTeclado(juego);
}

/* Una sola parada de tabulador para el tablero y las flechas por dentro, más los
   atajos de una tecla en Modo Adaptado. Antes eran 64 paradas de tabulador entre
   el enunciado y el botón de "Siguiente". */
let teclado = null;
let juegoDelItem = null;
function montarTeclado(juego){
  juegoDelItem = juego;
  if (teclado || !window.TableroAccesible) return;
  teclado = TableroAccesible.montar(document.getElementById('q-board'), {
    nombre: 'Tablero de la pregunta',
    juego: () => juegoDelItem,
  });
}

function clicEnCasilla(square) {
  const juego = new Chess(itemActual.fen);
  // Tocar el tablero cancela un "no lo sé" marcado antes.
  const noSe = document.getElementById('no-se-btn');
  if (noSe) noSe.className = claseNoSe(false);
  if (itemActual.tipo === 'casilla') {
    seleccion = square;
    pintarTablero(juego, [square]);
    document.getElementById('q-hint').textContent = `Elegiste ${casillaDicha(square)}. Puedes cambiarla o seguir.`;
    document.getElementById('next-btn').disabled = false;
    return;
  }
  // Ítems de jugada: primero la pieza, después el destino.
  const pieza = juego.get(square);
  if (!origenElegido) {
    if (!pieza || pieza.color !== juego.turn()) return;
    origenElegido = square;
    const destinos = juego.moves({ square, verbose: true }).map((m) => m.to);
    pintarTablero(juego, [square].concat(destinos));
    document.getElementById('q-hint').textContent = 'Ahora haz clic en la casilla de destino.';
    return;
  }
  if (square === origenElegido) {
    origenElegido = null;
    pintarTablero(juego);
    document.getElementById('q-hint').textContent = pistaDeJugada();
    return;
  }
  if (window.Coronacion && Coronacion.hayQueElegir(juego, origenElegido, square)) {
    // El peón corona: la pieza la elige el alumno (a veces la respuesta es una subpromoción).
    const desde = origenElegido;
    origenElegido = null;
    Coronacion.pedir(juego.turn(), (elegida) => {
      if (elegida) responderJugada(juego, juego.move({ from: desde, to: square, promotion: elegida }));
      else { pintarTablero(juego); document.getElementById('q-hint').textContent = pistaDeJugada(); }
    });
    return;
  }
  const intento = juego.move({ from: origenElegido, to: square });
  if (!intento) {
    // Si hay otra pieza propia, se cambia de pieza en vez de no hacer nada.
    if (pieza && pieza.color === juego.turn()) { origenElegido = null; clicEnCasilla(square); }
    return;
  }
  responderJugada(juego, intento);
}

/* La pista se lee en voz alta (lector de pantalla o «Activar voz»): la jugada y
   la casilla van en palabras, como en todo el sitio («Jugaste caballo felix 3»,
   «Elegiste eva 4»), no en la notación inglesa, que se deletrea letra por letra. */
function casillaDicha(sq) {
  return window.BlindNotation && BlindNotation.squareSpoken ? BlindNotation.squareSpoken(sq) : sq;
}
function jugadaDicha(san) {
  return window.BlindNotation && BlindNotation.sanSpoken ? BlindNotation.sanSpoken(san).replace(/^\S/, (c) => c.toLowerCase()) : san;
}

function responderJugada(juego, intento) {
  if (!intento) return;
  seleccion = { from: intento.from, to: intento.to, promotion: intento.promotion, san: intento.san };
  pintarTablero(juego, [intento.from, intento.to]);
  document.getElementById('q-hint').textContent =
    `Jugaste ${jugadaDicha(intento.san)}: esa es tu respuesta y no hace falta jugar más. Puedes cambiarla tocando otra pieza, o seguir.`;
  origenElegido = null;
  document.getElementById('next-btn').disabled = false;
}

function coincideJugada(respuesta, jugada) {
  return !!respuesta.from && respuesta.from === jugada.from && respuesta.to === jugada.to &&
    (!jugada.promotion || respuesta.promotion === jugada.promotion);
}

function esCorrecta(item, respuesta) {
  if (respuesta === null || respuesta === undefined || respuesta === NO_SE) return false;
  if (item.tipo === 'opcion' || item.tipo === 'opcion_tablero') return respuesta === item.correcta;
  if (item.tipo === 'casilla') return respuesta === item.solucion;
  if (item.tipo === 'jugada') {
    // Algunos ítems tienen más de una jugada válida para el mismo enunciado
    // (ver el comentario sobre `alternas` al inicio de js/diagnostico-items.js).
    if (coincideJugada(respuesta, item.solucion)) return true;
    return !!(item.alternas && item.alternas.some((alt) => coincideJugada(respuesta, alt)));
  }
  return false;
}

function siguiente() {
  estado.respuestas[itemActual.id] = { dada: seleccion, ok: esCorrecta(itemActual, seleccion) };
  estado.idx++;
  guardarEstado();
  if (estado.idx >= ITEMS.length) { terminar(); return; }
  pintarItem();
}

/* ---------------- Resultado ---------------- */
function construirDetalle() {
  const areas = {};
  const nosabe = {};
  /* Resultados por escalón de dificultad (el peso del ítem, de 1 a 5). De aquí
     sale el nivel estimado: lo que importa es hasta dónde llega, no cuántas
     preguntas fáciles acertó. */
  const dificultad = {};
  ITEMS.forEach((item) => {
    const r = estado.respuestas[item.id] || { ok: false };
    const a = areas[item.area] || (areas[item.area] = { peso: 0, logrado: 0, aciertos: 0, total: 0, nosabe: 0 });
    const e = dificultad[item.peso] || (dificultad[item.peso] = { aciertos: 0, total: 0, nosabe: 0 });
    a.peso += item.peso;
    a.total += 1;
    e.total += 1;
    if (r.ok) { a.logrado += item.peso; a.aciertos += 1; e.aciertos += 1; }
    if (r.dada === NO_SE) { a.nosabe += 1; e.nosabe += 1; nosabe[item.id] = true; }
  });
  const respuestas = {};
  Object.keys(estado.respuestas).forEach((id) => { respuestas[id] = !!estado.respuestas[id].ok; });
  /* La fuerza medida SOLO por la prueba, con su margen. Se guarda hecha
     porque Informes no carga el banco; el Elo declarado se le suma después, en
     PlanEntrenamiento.resumir(), así que si el profesor corrige el Elo del
     alumno el nivel se recalcula sin rehacer la prueba. */
  const medicion = PE.medir(ITEMS, respuestas);
  return {
    version: VERSION,
    fecha: new Date().toISOString(),
    perfil: estado.perfil,
    items: ITEMS.map((i) => i.id),   // qué preguntas tocaron en esta prueba
    areas,
    dificultad,
    respuestas,
    nosabe,
    medicion,
  };
}

async function terminar() {
  const inp = document.getElementById('perfil-elo'), sel = document.getElementById('perfil-elo-tipo');
  if (inp) { const v = PE.eloValido(inp.value); estado.perfil.elo = v; estado.perfil.elo_tipo = v ? sel.value : null; }
  if (estado.perfil.elo == null && perfilCuenta && perfilCuenta.elo) { estado.perfil.elo = perfilCuenta.elo; estado.perfil.elo_tipo = perfilCuenta.elo_tipo; }
  const detalle = construirDetalle();
  const resumen = PE.resumir(detalle);
  detalle.porcentaje = resumen.porcentaje;
  detalle.nivel = resumen.nivel.clave;
  detalle.nivel_etiqueta = resumen.nivel.etiqueta;

  try {
    localStorage.setItem(RESULTADO_KEY, JSON.stringify({
      fecha: detalle.fecha, porcentaje: resumen.porcentaje, nivel: resumen.nivel.etiqueta, detalle,
      // La fuerza en puntos, lista para leer sin cargar el banco de preguntas:
      // Ejercicios por tema arranca cada tema cerca de este número.
      elo: resumen.elo && typeof resumen.elo.combinado === 'number' ? resumen.elo.combinado : null,
    }));
  } catch (e) {}

  /* La subida arranca ANTES de pintar y no se espera para pintar: si algo
     falla dibujando el resultado, la fila ya va en camino a la base. Antes se
     pintaba primero y se subía después, así que cualquier tropiezo al dibujar
     dejaba el diagnóstico solo en el aparato del alumno. */
  if (!sesionActual) {
    // Visitante: el resultado va aparte de los alumnos (tabla diagnosticos_publicos).
    const v = estado.visitante || {};
    borrarEstado();
    document.getElementById('result-saved').textContent = 'Enviando tu resultado…';
    try { mostrarResultado(detalle, true); } catch (e) { console.error('No se pudo dibujar el resultado del diagnóstico:', e); }
    let ok = false;
    try {
      const { error } = await sb.from('diagnosticos_publicos').insert([{
        nombre: v.nombre, email: v.email || null, telefono: v.telefono || null,
        elo: detalle.perfil.elo || null, elo_tipo: detalle.perfil.elo ? detalle.perfil.elo_tipo : null,
        porcentaje: resumen.porcentaje, nivel: resumen.nivel.etiqueta, detalle,
        enlace: v.enlace || null,
      }]);
      ok = !error;
    } catch (e) { ok = false; }
    document.getElementById('result-saved').textContent = ok
      ? `Resultado enviado a ${v.destino || 'Ajedrez Integral'} a nombre de ${v.nombre}. También quedó guardado en este dispositivo.`
      : 'No se pudo enviar el resultado (sin conexión). Quedó guardado en este dispositivo.';
    return;
  }
  // El Elo escrito acá se guarda en el perfil (si cambió), para Configuración e Informes.
  if (detalle.perfil.elo !== ((perfilCuenta && perfilCuenta.elo) || null) || detalle.perfil.elo_tipo !== ((perfilCuenta && perfilCuenta.elo_tipo) || null)) {
    try {
      await sb.from('profiles').update({ elo: detalle.perfil.elo, elo_tipo: detalle.perfil.elo_tipo, elo_actualizado: new Date().toISOString() }).eq('id', sesionActual.user.id);
      perfilCuenta = { elo: detalle.perfil.elo, elo_tipo: detalle.perfil.elo_tipo };
    } catch (e) {}
  }
  const subida = subirResultado(detalle);
  borrarEstado();
  document.getElementById('result-saved').textContent = 'Guardando tu resultado…';
  try {
    mostrarResultado(detalle, true);
  } catch (e) {
    console.error('No se pudo dibujar el resultado del diagnóstico:', e);
  }
  document.getElementById('result-saved').textContent = avisoGuardado(await subida);
}

/* La corrección tiene que repasar las preguntas de ESA prueba, no las del
   banco entero ni las de la prueba que se esté haciendo ahora: los resultados
   guardados traen la lista de ítems (`items`), y los de antes del sorteo se
   reconstruyen con las respuestas que quedaron anotadas. */
function itemsDelResultado(detalle) {
  if (Array.isArray(detalle.items) && detalle.items.length) return PRUEBA.porIds(detalle.items);
  const ids = Object.keys(detalle.respuestas || {});
  return ids.length ? PRUEBA.porIds(ids) : ITEMS;
}

/* La escalera de dificultad: de dónde sale el nivel. Se muestra entera para
   que el alumno (y el profesor) vean que la nota no es "cuántas acertó" sino
   hasta qué escalón llegó, y cuál es el siguiente que tiene que romper. */
function pintarEscalones(resumen) {
  const caja = document.getElementById('result-escalones');
  if (!caja) return;
  const escalones = (resumen.escalones || []).filter((e) => e.total > 0);
  if (!escalones.length || resumen.escalonAlcanzado === null) { caja.classList.add('hidden'); return; }
  caja.classList.remove('hidden');
  const alcanzado = resumen.escalonAlcanzado;
  caja.innerHTML = `
    <p class="text-sm font-semibold text-brand-700 dark:text-brand-200 mb-1">Hasta dónde llegaste</p>
    <p class="text-xs text-brand-450 dark:text-brand-350 mb-3">${resumen.modelo === 'elo'
      ? `Cada pregunta tiene su dificultad en puntos Elo, y tu fuerza es la que mejor explica cuáles resolviste y cuáles no: ≈${resumen.elo.estimado} ± ${resumen.elo.error} según la prueba. Resolver una difícil de mover en el tablero pesa mucho más que acertar una fácil de opción, donde también se acierta al azar.`
      : 'La prueba tiene cinco escalones de dificultad. Tu nivel es el más alto que superaste (60% de aciertos o más), no la suma de respuestas buenas: así no cuenta lo mismo acertar lo fácil que resolver lo difícil.'}</p>
    <div class="space-y-1.5">
      ${escalones.map((e) => `
        <div class="flex items-center gap-2 text-sm">
          <span class="w-20 shrink-0 text-brand-500 dark:text-brand-300">${'★'.repeat(e.peso)}</span>
          <div class="flex-1 h-2 bg-brand-100 dark:bg-brand-800 rounded-full overflow-hidden">
            <div class="h-full ${e.peso <= alcanzado ? 'bg-green-500' : 'bg-brand-300 dark:bg-brand-700'}" style="width:${e.porcentaje}%"></div>
          </div>
          <span class="w-28 shrink-0 text-right text-brand-500 dark:text-brand-300">${e.aciertos}/${e.total} · ${e.porcentaje}%</span>
          <span class="w-24 shrink-0 text-xs ${e.peso <= alcanzado ? 'text-green-600 dark:text-green-400' : 'text-brand-450 dark:text-brand-350'}">${e.peso <= alcanzado ? (resumen.modelo === 'elo' ? 'a tu alcance' : 'superado') : 'todavía no'}</span>
        </div>`).join('')}
    </div>
    <p class="text-xs text-brand-450 dark:text-brand-350 mt-3">${alcanzado >= 5
      ? 'Superaste los cinco escalones: la prueba ya no te mide, el siguiente paso es la competencia y el análisis de tus propias partidas.'
      : `El próximo escalón es el de ${'★'.repeat(alcanzado + 1)}: ahí está lo que te falta para subir de nivel, y de ahí sale tu plan.`}</p>`;
}

/* El plan de cuatro semanas. Antes se pintaban solo las tres primeras y sin la
   meta de cada una: con tres áreas flojas se caía la cuarta, «Juntar todo y
   volver a medir», que es la que manda a repetir el diagnóstico.
   `nota` llega cuando el plan es el que compartió el profesor: sus textos los
   pudo reescribir a mano, así que todo va por textContent, nunca por innerHTML. */
function pintarPlan(plan, resumen, nota) {
  const planBox = document.getElementById('result-plan');
  planBox.innerHTML = '';
  const el = (tag, cls, texto) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (texto != null) n.textContent = texto;
    return n;
  };
  if (nota !== undefined) {
    const aviso = el('div', 'bg-accent-500/10 border border-accent-500/40 rounded-xl p-4');
    aviso.appendChild(el('p', 'text-sm font-semibold text-brand-800 dark:text-white', 'Este es el plan que te compartió tu profesor.'));
    if (nota) aviso.appendChild(el('p', 'text-sm text-brand-600 dark:text-brand-300 mt-1', `“${nota}”`));
    planBox.appendChild(aviso);
  }
  planBox.appendChild(el('p', 'text-sm text-brand-500 dark:text-brand-300',
    `Con ${plan.rutina} alcanza. Empieza por lo más flojo: ${(plan.prioridad || []).join(', ')}.` + (plan.metaElo ? ` Meta: ${plan.metaElo.texto}` : '')));
  (plan.semanas || []).forEach((semana) => {
    const caja = el('div', 'bg-white dark:bg-brand-900 rounded-xl shadow-md p-4');
    caja.appendChild(el('p', 'font-serif font-bold text-brand-800 dark:text-white mb-1', semana.titulo));
    caja.appendChild(el('p', 'text-xs text-brand-450 dark:text-brand-350 mb-1', semana.porque));
    if (semana.objetivo) {
      const meta = el('p', 'text-xs text-brand-500 dark:text-brand-300 mb-2');
      meta.appendChild(el('strong', null, 'Meta: '));
      meta.appendChild(document.createTextNode(semana.objetivo));
      caja.appendChild(meta);
    }
    const ul = el('ul', 'list-disc pl-5 space-y-1 text-sm text-brand-600 dark:text-brand-300');
    (semana.tareas || []).forEach((t) => ul.appendChild(el('li', null, t)));
    caja.appendChild(ul);
    const enlaces = el('p', 'text-xs mt-2');
    (semana.recursos || []).forEach((r) => {
      // Los recursos son rutas del propio sitio ("entreno/temas.html?tema=fork");
      // algo con esquema (javascript:, https:) no sale de este repositorio.
      if (!PE.recursoSeguro(r)) return;
      if (enlaces.childNodes.length) enlaces.appendChild(document.createTextNode(' · '));
      const a = el('a', 'text-accent-700 dark:text-accent-400 hover:underline', r.texto);
      a.href = PE.enlace(r.href, '../');
      const clave = PE.claveDeAvance(r.href);
      if (clave) a.dataset.clave = clave;
      enlaces.appendChild(a);
    });
    caja.appendChild(enlaces);
    planBox.appendChild(caja);
  });
  if (plan.medicion) planBox.appendChild(el('p', 'text-xs text-brand-450 dark:text-brand-350', plan.medicion));
  if (resumen.fortalezas.length) {
    planBox.appendChild(el('p', 'text-sm text-brand-500 dark:text-brand-300',
      `Lo que ya tienes firme: ${resumen.fortalezas.map((f) => f.nombre.toLowerCase()).join(', ')}. Mantenlo con un repaso corto por semana.`));
  }
}

/* El plan que el profesor armó en Informes y le compartió al alumno
   (training_plans; la política solo lo devuelve si está compartido). Vale para
   el diagnóstico del que salió o uno anterior; si el alumno hizo uno NUEVO
   después, ese plan quedó viejo y se muestra el recalculado. */
let turnoDelPlan = 0;

/* Cuánto hizo el alumno, desde el diagnóstico, en cada lugar al que manda el
   plan (avance_del_plan() cuenta en la base). Antes el plan era texto quieto y
   nadie sabía si se estaba siguiendo. Se guarda la última respuesta para
   volver a marcar si el plan se repinta (el del profesor llega después). */
let avanceDelPlan = null, avanceDesde = null;
async function pintarAvance(desde) {
  if (!sesionActual) return;
  const box = document.getElementById('result-plan');
  if (avanceDelPlan && avanceDesde === desde) PE.marcarAvance(box, avanceDelPlan);
  try {
    const { data, error } = await sb.rpc('avance_del_plan', { p_alumno: sesionActual.user.id, p_desde: desde || null });
    if (error) return;
    avanceDelPlan = PE.avancePorClave(data);
    avanceDesde = desde;
    PE.marcarAvance(document.getElementById('result-plan'), avanceDelPlan);
  } catch (e) {}
}
// La regla de cuándo vale el plan del profesor vive en PlanEntrenamiento: la
// usan también «Hoy te toca» y el panel, y las tres tienen que coincidir.
function planDelProfesor(detalle) {
  return PE.planCompartido(sb, sesionActual.user.id, detalle);
}

/* El primer paso: lo que toca HOY del plan, arriba de todo y con un botón.
   El resultado terminaba en un plan de cuatro semanas para leer, y en los
   datos se ve lo que pasaba: de 52 alumnos que hicieron el diagnóstico, 17 no
   volvieron a entrenar y 19 lo dejaron al primer o segundo día. Lo que toca
   lo dice PE.hoyDelPlan(), el mismo de «Hoy te toca» y del panel, y la meta
   del día es la de Logros (js/logros.js): las tres pantallas dicen lo mismo. */
let turnoPrimerPaso = 0;
async function pintarPrimerPaso(detalle) {
  const caja = document.getElementById('result-primer-paso');
  caja.hidden = true;
  if (!sesionActual) return;
  const turno = ++turnoPrimerPaso;
  let hoy = null, logros = null;
  try {
    [hoy, logros] = await Promise.all([
      PE.hoyDelPlan(sb, sesionActual.user.id, detalle),
      window.Logros ? Logros.cargar().catch(() => null) : null,
    ]);
  } catch (e) { return; }
  if (!hoy || turno !== turnoPrimerPaso) return;
  const meta = window.Logros ? Logros.META_DIARIA : 5;
  const empezando = hoy.numero === 1 && !hoy.hechos;
  document.getElementById('primer-paso-titulo').textContent = empezando
    ? 'Tu primer paso: hoy mismo'
    : `Esta semana te toca: ${hoy.foco}`;
  document.getElementById('primer-paso-texto').textContent = empezando
    ? `La semana 1 de tu plan es ${hoy.foco}. Empieza ya con «${hoy.recurso.texto}»: ${meta} ejercicios hoy y el día cuenta para tu racha.`
    : `Semana ${hoy.numero} de ${hoy.total} del plan${hoy.delProfesor ? ' que te compartió tu profesor' : ''}: «${hoy.recurso.texto}»`
      + (hoy.hechos === null ? '.' : hoy.hechos ? ` (llevas ${hoy.hechos} desde el diagnóstico).` : ' (todavía nada).');
  const metaEl = document.getElementById('primer-paso-meta');
  const st = logros && logros.sesion && !logros.error ? logros.stats : null;
  metaEl.hidden = !st;
  if (st) {
    const n = st.hoy_ejercicios || 0;
    metaEl.textContent = n >= meta ? `✅ Hoy ya llevas ${n}: el día cuenta para tu racha.` : `Hoy llevas ${n} de ${meta}.`;
  }
  const ir = document.getElementById('primer-paso-ir');
  ir.href = PE.enlace(hoy.recurso.href, '../');
  ir.textContent = empezando ? 'Empezar ahora →' : 'Seguir →';
  caja.hidden = false;
}

/* El resultado se dice y el foco va a su título. Al contestar la pregunta 60
   (escribiendo o con el botón) la prueba se escondía, el foco caía al <body>
   y nada se anunciaba: quien no ve no sabía que había terminado ni su nivel.
   El título lleva tabindex="-1" (entreno/diagnostico.html) y el aviso es una
   región viva aparte, que se vacía y se llena para que se lea aunque se
   repita. Va también al ver un resultado viejo: la vista cambia igual. */
function anunciarResultado(resumen, reciente) {
  const titulo = document.getElementById('result-titulo');
  if (titulo) titulo.focus({ preventScroll: true });
  const aviso = document.getElementById('result-aviso');
  if (!aviso) return;
  const texto = `${reciente ? 'Terminaste el diagnóstico. ' : ''}Tu nivel estimado: ${resumen.nivel.etiqueta}. ` +
    `${resumen.aciertos} de ${resumen.total} respuestas correctas. Debajo están tus resultados por área y tu plan.`;
  aviso.textContent = '';
  setTimeout(() => { aviso.textContent = texto; }, 60);
}

function mostrarResultado(detalle, reciente) {
  const resumen = PE.resumir(detalle);
  const plan = PE.generarPlan(resumen);
  irA('result-view');
  if (!reciente) {
    const fecha = new Date(detalle.fecha).toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('result-saved').textContent = `Diagnóstico del ${fecha}.`;
  }

  document.getElementById('result-cta-visitante').classList.toggle('hidden', !!sesionActual);
  // Un visitante no tiene Informes ni profesor todavía: lo de la cuenta no va.
  document.getElementById('result-nota-alumno').classList.toggle('hidden', !sesionActual);
  document.getElementById('result-informes').classList.toggle('hidden', !sesionActual);
  document.getElementById('result-level').textContent = resumen.nivel.etiqueta;
  document.getElementById('result-level-desc').textContent = resumen.nivel.descripcion;
  const sinSaber = Object.keys(detalle.nosabe || {}).length;
  document.getElementById('result-score').textContent =
    `${resumen.aciertos} de ${resumen.total} respuestas correctas · ${resumen.porcentaje}% de la prueba` +
    (sinSaber ? ` · ${sinSaber} que dijiste no saber (bien hecho: eso se estudia, no se adivina)` : '') +
    ` · fuerza estimada ${resumen.nivel.rango} (estimación para orientar el estudio, no un rating oficial).`;
  let eloEl = document.getElementById('result-elo');
  if (!eloEl) { eloEl = document.createElement('p'); eloEl.id = 'result-elo'; eloEl.className = 'text-xs mt-2 opacity-90'; document.getElementById('result-score').insertAdjacentElement('afterend', eloEl); }
  const margen = (v, e) => e ? `≈${v} ± ${e}` : `≈${v}`;
  eloEl.textContent = resumen.elo && resumen.elo.declarado
    ? `Elo: ${resumen.elo.lectura.texto} Nivel calculado combinando tu Elo con la prueba (${margen(resumen.elo.combinado, resumen.elo.errorCombinado)}).`
    : `Sin Elo registrado: el nivel sale solo de la prueba (${margen(resumen.elo.estimado, resumen.elo.error)}).${sesionActual ? ' Si tienes rating, agrégalo en Configuración › Perfil y el próximo diagnóstico lo tendrá en cuenta.' : ''}`;
  const nota = PE.notaRecalibrado(resumen);
  if (nota) eloEl.textContent += ' ' + nota;
  pintarEscalones(resumen);

  const areasBox = document.getElementById('result-areas');
  areasBox.innerHTML = '';
  resumen.porArea.forEach((a) => {
    // La banda sale de la nota del área (PlanEntrenamiento.notaDeArea): en esta
    // prueba, lo que cuenta es cómo rinde el área respecto de tu fuerza.
    const nota = typeof a.nota === 'number' ? a.nota : a.porcentaje;
    const color = nota >= 80 ? 'bg-green-500' : nota >= 60 ? 'bg-accent-500' : 'bg-red-500';
    const fila = document.createElement('div');
    fila.className = 'bg-white dark:bg-brand-900 rounded-xl shadow-md p-4';
    fila.innerHTML = `
      <div class="flex items-center justify-between gap-3 mb-1">
        <p class="font-semibold text-brand-800 dark:text-white text-sm">${a.emoji} ${a.nombre}</p>
        <p class="text-sm text-brand-500 dark:text-brand-300">${a.aciertos}/${a.total} · ${a.porcentaje}% · ${PE.bandaDeNota(nota).etiqueta}${a.nosabe ? ` · 🤔 ${a.nosabe}` : ''}</p>
      </div>
      <div class="w-full h-2 bg-brand-100 dark:bg-brand-800 rounded-full overflow-hidden mb-2">
        <div class="h-full ${color}" style="width:${a.porcentaje}%"></div>
      </div>
      <p class="text-xs text-brand-450 dark:text-brand-350">${typeof a.esperado === 'number' ? `Con tu fuerza, lo esperable era un ${a.esperado}%. ` : ''}${a.mide}</p>`;
    areasBox.appendChild(fila);
  });

  pintarPlan(plan, resumen);
  pintarAvance(detalle.fecha);
  anunciarResultado(resumen, reciente);
  pintarPrimerPaso(detalle);
  // Si el profesor ya revisó ESTE diagnóstico y le compartió su plan (el que
  // edita en Informes), el alumno ve ese y no uno recalculado aparte. La
  // respuesta llega después: si mientras tanto se abrió otro resultado, no se
  // le pinta encima.
  const turno = ++turnoDelPlan;
  if (sesionActual) planDelProfesor(detalle).then((compartido) => {
    if (compartido && turno === turnoDelPlan) { pintarPlan(compartido.plan, resumen, compartido.nota); pintarAvance(detalle.fecha); }
  });

  const review = document.getElementById('result-review');
  review.innerHTML = '';
  itemsDelResultado(detalle).forEach((item, i) => {
    const ok = detalle.respuestas[item.id];
    const dijoNoSaber = !!(detalle.nosabe && detalle.nosabe[item.id]);
    const det = document.createElement('details');
    det.className = 'bg-white dark:bg-brand-900 rounded-xl shadow-md px-4 py-3';
    const correcta = item.tipo === 'jugada'
      ? [item.solucion].concat(item.alternas || []).map((j) => `${j.from}–${j.to}`).join(' o ')
      : item.tipo === 'casilla' ? item.solucion : item.opciones[item.correcta];
    det.innerHTML = `
      <summary class="cursor-pointer text-sm font-medium text-brand-700 dark:text-brand-200">${ok ? '✅' : (dijoNoSaber ? '🤔' : '❌')} ${i + 1}. ${item.enunciado}</summary>
      <p class="text-sm text-brand-600 dark:text-brand-300 mt-2"><strong>Respuesta correcta:</strong> ${correcta}</p>
      <p class="text-xs text-brand-450 dark:text-brand-350 mt-1">${item.explica}</p>
      ${dijoNoSaber ? '<p class="text-xs text-brand-500 dark:text-brand-300 mt-1">Dijiste que no la sabías: por eso está en tu plan, no en tu lista de errores.</p>' : ''}`;
    review.appendChild(det);
  });
}

/* ---------------- Arranque ---------------- */
document.getElementById('start-btn').addEventListener('click', empezar);
document.getElementById('next-btn').addEventListener('click', siguiente);
document.getElementById('abandon-btn').addEventListener('click', () => { guardarEstado(); irA('intro-view'); });
document.getElementById('repeat-btn').addEventListener('click', () => { borrarEstado(); pintarPerfil(); irA('intro-view'); });

/* SOLO administración, no todo el equipo docente.
 *
 * Estos dos PDF traen las respuestas y la hoja de corrección: el cuadernillo es
 * la prueba que el alumno va a contestar y el libro es el banco entero, las 696
 * preguntas con su respuesta marcada. Cuanta más gente los tenga bajados, más
 * fácil es que terminen circulando y que el diagnóstico deje de medir nada.
 * Quien dé clase y los necesite se los pide a quien administra.
 *
 * Como todo filtro del sitio, esto decide qué se PINTA: los archivos siguen en
 * la raíz y quien conozca la dirección los baja igual — para eso llevan marca
 * de agua en todas las páginas y van sin permiso de copiar ni imprimir.
 */
async function mostrarPdfSiEsAdmin(userId) {
  try {
    const { data } = await sb.from('profiles').select('is_admin').eq('id', userId).maybeSingle();
    if (!data || data.is_admin !== true) return;
    document.getElementById('pdf-docente').classList.remove('hidden');
    document.getElementById('libro-docente').classList.remove('hidden');
    document.getElementById('pdf-docente-nota').classList.remove('hidden');
  } catch (e) { /* si no se puede saber, no se muestra */ }
}

/* El código viene en la dirección; si no (recargó sin él, o volvió otro día a
   seguir la prueba), el que quedó guardado con sus datos. Un código que la
   base no reconoce se dice: el resultado igual se guarda, pero le llega a
   administración, y quien le mandó el enlace lo estaría esperando. */
/* El tema de la academia: si el supervisor del enlace es de UNA academia, la
   página se viste con su marca —el logo y el nombre arriba, su color en el
   encabezado, las tarjetas y los botones, y al final su WhatsApp en vez del de
   Ajedrez Integral—. La marca la da enlace_diagnostico_marca(), la misma regla
   que los formularios y los correos. Los colores los pone css/styles.css
   (html[data-marca-academia]); acá solo se decide si se puede.

   El color se vuelve a medir contra el blanco antes de usarlo: si no da 4,5,
   la página muestra el logo y el nombre pero conserva sus colores. Todo lo que
   viene de la base (nombre, logo, número) se pone con textContent o se
   comprueba antes. Si algo falla, la página queda como siempre. Ver «El tema
   de la academia en el diagnóstico» en docs/decisiones/informes.md. */
let marcaAcademia = null; // { nombre, color, logo_path, whatsapp } | null

async function vestirConLaAcademia(codigo) {
  let m = null;
  try {
    const { data, error } = await sb.rpc('enlace_diagnostico_marca', { p_codigo: codigo });
    const fila = Array.isArray(data) ? data[0] : data;
    if (!error && fila && typeof fila.nombre === 'string' && fila.nombre.trim()) m = fila;
  } catch (e) { m = null; }
  if (!m) return;
  marcaAcademia = { nombre: m.nombre.trim(), color: m.color || null, logo_path: m.logo_path || null, whatsapp: m.whatsapp || null };

  const MA = window.MarcaAcademia;
  const contraste = MA && marcaAcademia.color ? MA.contrasteConBlanco(marcaAcademia.color) : null;
  if (contraste != null && contraste >= 4.5) {
    const raiz = document.documentElement;
    raiz.style.setProperty('--marca-academia', marcaAcademia.color);
    raiz.setAttribute('data-marca-academia', '');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', marcaAcademia.color);
  }
  const logo = MA ? MA.urlDelLogo(marcaAcademia.logo_path) : '';

  // La franja de arriba.
  document.getElementById('marca-diagnostico-nombre').textContent = marcaAcademia.nombre;
  const img = document.getElementById('marca-diagnostico-logo');
  if (logo) {
    img.addEventListener('error', () => img.classList.add('hidden'));
    img.src = logo;
    img.classList.remove('hidden');
  }
  const franja = document.getElementById('marca-diagnostico');
  franja.classList.remove('hidden');
  franja.classList.add('flex');

  // El encabezado: su logo y su nombre en lugar de los de Ajedrez Integral.
  const enlaceMarca = document.querySelector('#header nav a');
  if (enlaceMarca) {
    enlaceMarca.textContent = '';
    enlaceMarca.href = location.pathname + '?s=' + encodeURIComponent(codigo);
    if (logo) {
      const chico = document.createElement('img');
      chico.src = logo;
      chico.alt = '';
      chico.className = 'h-10 w-10 md:h-12 md:w-12 object-contain rounded-lg bg-white p-1 shrink-0';
      chico.addEventListener('error', () => chico.remove());
      enlaceMarca.appendChild(chico);
    }
    const nombre = document.createElement('span');
    nombre.className = 'font-serif text-xl md:text-2xl font-bold tracking-tight';
    nombre.textContent = marcaAcademia.nombre;
    enlaceMarca.appendChild(nombre);
  }
  document.title = 'Diagnóstico de nivel — ' + marcaAcademia.nombre;
  const login = document.getElementById('visitante-login');
  if (login) login.textContent = '¿Ya tienes cuenta? Inicia sesión';

  // Al final: escribirle a la academia, no a Ajedrez Integral.
  document.getElementById('cta-titulo').textContent = `¿Quieres entrenar con ${marcaAcademia.nombre}?`;
  document.getElementById('cta-texto').textContent =
    `${marcaAcademia.nombre} ya recibió tu resultado: revisa tus áreas, te arma un plan de cuatro semanas y te escribe para contarte cómo seguir.`;
  document.getElementById('cta-cursos').classList.add('hidden');
  // «← Cursos» llevaría a los cursos de Ajedrez Integral.
  const volver = document.querySelector('#intro-view > a');
  if (volver) volver.classList.add('hidden');
  const wa = document.getElementById('cta-whatsapp');
  const numero = String(marcaAcademia.whatsapp || '').replace(/\D/g, '');
  if (numero.length >= 8) {
    const completo = numero.length === 8 ? '506' + numero : numero;
    wa.href = 'https://wa.me/' + completo + '?text=' +
      encodeURIComponent(`Hola, hice el diagnóstico de nivel con el enlace de ${marcaAcademia.nombre} y quiero información.`);
    wa.textContent = `💬 Escribirle a ${marcaAcademia.nombre}`;
    wa.classList.add('marca-invertido');
  } else {
    wa.classList.add('hidden');
  }
}

async function leerEnlaceSupervisor(v) {
  const aviso = document.getElementById('visitante-destino');
  let codigo = null;
  try { codigo = new URLSearchParams(location.search).get('s'); } catch (e) { codigo = null; }
  if (!codigo) codigo = v.enlace || null;
  if (!codigo) return;
  codigo = String(codigo).trim().toLowerCase();
  let destino = null;
  if (FORMA_ENLACE.test(codigo)) {
    try {
      const { data, error } = await sb.rpc('enlace_diagnostico_publico', { p_codigo: codigo });
      if (!error && typeof data === 'string' && data.trim()) destino = data.trim();
    } catch (e) { destino = null; }
  }
  if (destino) {
    enlaceSupervisor = { codigo, destino };
    aviso.textContent = `Tu resultado le llega a ${destino}, que te compartió este enlace.`;
    await vestirConLaAcademia(codigo);
  } else {
    aviso.textContent = 'Este enlace ya no está activo: tu resultado le llega a Ajedrez Integral. Si esperabas mandárselo a otra persona, pídele su enlace otra vez.';
  }
  aviso.classList.remove('hidden');
}

async function init() {
  let sesion = null;
  try {
    const { data } = await sb.auth.getSession();
    sesion = data && data.session;
  } catch (e) { sesion = null; }
  sesionActual = sesion || null;
  if (sesion) {
    // El cuadernillo y el libro llevan las respuestas: solo administración.
    mostrarPdfSiEsAdmin(sesion.user.id);
    try {
      const { data: pf } = await sb.from('profiles').select('elo, elo_tipo').eq('id', sesion.user.id).maybeSingle();
      perfilCuenta = pf || null;
    } catch (e) { perfilCuenta = null; }
  }

  await EntrenoProgress.init();
  // Baja el progreso de la cuenta antes de leer el estado guardado: si la prueba
  // se empezó en otro aparato, se retoma donde iba.
  await ProgresoUsuario.init();
  cargarEstado();
  // Si quedó un resultado terminado sin subir (se cerró la prueba sin internet
  // o la base lo rechazó), se reintenta ahora, en silencio y sin trabar la
  // página. Mientras no suba, el aviso del recuadro de arriba lo dice.
  const pendiente = pendienteGuardado();
  if (pendiente) {
    subirResultado(pendiente).then((ok) => { if (ok) pintarPrevio(); });
  }
  if (!sesion) {
    // Prueba pública: sin cuenta se pide nombre y correo; el resultado va a diagnosticos_publicos.
    document.getElementById('visitante-box').classList.remove('hidden');
    const v = estado.visitante || {};
    document.getElementById('visitante-nombre').value = v.nombre || '';
    document.getElementById('visitante-email').value = v.email || '';
    document.getElementById('visitante-telefono').value = v.telefono || '';
    await leerEnlaceSupervisor(v);
    const volver = document.querySelector('#intro-view a[href="aprender.html"]');
    if (volver) { volver.href = '../cursos.html'; volver.innerHTML = '<span aria-hidden="true">←</span> Cursos'; }
  }
  pintarPerfil();
  pintarPrevio();
  if (pruebaVieja) {
    document.getElementById('aviso-version').classList.remove('hidden');
  }
  if (ITEMS.length && estado.idx > 0 && estado.idx < ITEMS.length) {
    document.getElementById('start-btn').textContent = `Seguir donde ibas (pregunta ${estado.idx + 1}) →`;
  }
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}
init();
    
/* Coordenadas del tablero (js/coordenadas-tablero.js): la letra de columna abajo
   y el número de fila a la izquierda, para que se entienda hacia dónde avanza la
   posición. Se repintan solas cada vez que la página redibuja el tablero. */
if (window.Coordenadas) Coordenadas.aplicar(document.getElementById('q-board'));
