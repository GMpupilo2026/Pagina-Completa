/* El código de examen.html.

   Vivía escrito dentro de la página, en un <script> de 16 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* Rendir un examen: el alumno EJECUTA y demuestra, no practica.
 *
 * Lo que esta página NO hace, y es lo que la hace confiable:
 *
 *  - No sabe las respuestas. Recibe su examen de `examen_para_alumno()`,
 *    que devuelve el enunciado y las opciones ya barajadas y nunca la
 *    clave. Calificar es cosa del servidor (`responder_examen`), así que
 *    mirar el código de esta página no adelanta nada.
 *  - No lleva el reloj. `termina_at` lo fijó el servidor al empezar, y
 *    viene junto con la hora del servidor para calcular el desfase: el
 *    reloj de la computadora puede estar en cualquier año. Lo que se
 *    pinta acá es una cuenta atrás informativa; quien corta de verdad es
 *    `responder_examen()`, que rechaza lo que llegue tarde.
 *  - No cuenta las salidas. Las cuenta `registrar_salida_examen()`. Un
 *    contador de esta página se pone en cero desde la consola y no
 *    fallaría nada.
 *
 * Sobre la pantalla completa y el "no puede salirse": ninguna página web
 * puede impedir que alguien cambie de pestaña — eso solo lo puede una app
 * instalada con permisos del sistema. Lo que sí se puede es darse cuenta
 * al instante y avisar, que es lo que se hace: dos avisos perdonan y al
 * tercero el examen se congela. Prometer más que eso sería mentirle al
 * profesor.
 */
const EXAMEN_ID = new URLSearchParams(location.search).get("id");

let sesion = null;
let examen = null;          // lo que devolvió examen_para_alumno()
let pendientes = [];        // las preguntas que faltan, en orden
let indice = 0;
let tablero = null;
let respuestaActual = null;
let tickReloj = null;
let desfase = 0;            // hora del servidor menos la de esta computadora
let terminaEn = null;       // ms, ya en hora local corregida
let vigilando = false;
let fueraDesde = null;
let cerrando = false;
let arrancoPregunta = 0;

function $(id) { return document.getElementById(id); }
function escapeHtml(t) { const d = document.createElement("div"); d.textContent = t == null ? "" : String(t); return d.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
function ahora() { return Date.now() + desfase; }

/* ---------------- Entrada ---------------- */
async function init() {
  const { data } = await sb.auth.getSession();
  sesion = data.session;
  if (!sesion) { location.href = "login.html?next=" + encodeURIComponent("examen.html?id=" + (EXAMEN_ID || "")); return; }
  if (!EXAMEN_ID) { location.href = "examenes.html"; return; }

  const { data: ex, error } = await sb.rpc("examen_para_alumno", { p_examen: EXAMEN_ID });
  if (error || !ex) {
    $("loading").textContent = "No se pudo abrir el examen: " + (error ? error.message : "no existe");
    return;
  }
  examen = ex;
  desfase = new Date(ex.ahora).getTime() - Date.now();

  $("loading").classList.add("hidden");
  if (ex.estado === "entregado" || ex.estado === "congelado") { await mostrarResultado(ex.estado); return; }
  if (ex.estado === "en_curso") { prepararPreguntas(); arrancarPrueba(); return; }
  mostrarAntesala();
}

function mostrarAntesala() {
  $("ex-titulo").textContent = examen.titulo;
  $("ex-instrucciones").textContent = examen.instrucciones || "";
  const n = (examen.items || []).length;
  $("ex-resumen").textContent = `${n} ${n === 1 ? "pregunta" : "preguntas"} y ${examen.minutos} minutos en total.`;

  // Cuántas salidas perdona ESTE examen. Decir "a la tercera" cuando el
  // profesor puso otra cosa es peor que no decir nada: el alumno se confía
  // con un margen que no tiene, o se cuida de más.
  // Si el campo no viene (una versión vieja de examen_para_alumno), se asume
  // el tope de siempre en vez de "no congela". Equivocarse hacia el aviso de
  // más no le cuesta nada al alumno; equivocarse hacia el de menos le dice
  // que puede salir tranquilo y le cuesta el examen.
  const perdona = examen.salidas_permitidas === undefined ? 2 : examen.salidas_permitidas;
  $("ante-salidas").textContent = perdona == null
    ? "Cada vez que salgas queda anotado y tu profe lo va a ver."
    : perdona === 0
      ? "A la primera vez el examen se congela y solo tu profe puede volver a abrirlo."
      : `A la vez número ${perdona + 1} el examen se congela y solo tu profe puede volver a abrirlo.`;

  if (new Date(examen.vence_at).getTime() < ahora()) {
    const aviso = $("ex-aviso-vencido");
    aviso.textContent = "Se pasó la fecha para hacer este examen. Habla con tu profe.";
    aviso.classList.remove("hidden");
    $("empezar-btn").disabled = true;
    $("empezar-btn").className += " opacity-40 cursor-not-allowed";
  }
  $("empezar-btn").addEventListener("click", empezar);
  $("antesala").classList.remove("hidden");
}

async function empezar() {
  const btn = $("empezar-btn");
  btn.disabled = true;
  $("antesala-status").textContent = "Abriendo…";
  // La pantalla completa se pide ANTES del reloj: es el único momento en
  // que hay un gesto de la persona, que es lo que el navegador exige.
  // Si la rechaza, el examen se hace igual — negarle rendir por eso
  // sería castigarlo por la configuración de su navegador.
  try { await document.documentElement.requestFullscreen({ navigationUI: "hide" }); } catch (e) {}

  const { data, error } = await sb.rpc("iniciar_examen", { p_examen: EXAMEN_ID });
  if (error) {
    btn.disabled = false;
    $("antesala-status").textContent = "No se pudo empezar: " + error.message;
    return;
  }
  examen.termina_at = data.termina_at;
  desfase = new Date(data.ahora).getTime() - Date.now();
  prepararPreguntas();
  arrancarPrueba();
}

/* Las que ya contestó no se vuelven a mostrar: una sola oportunidad,
   también si recarga la página a mitad de camino. */
function prepararPreguntas() {
  const hechas = new Set((examen.respondidas || []).map((r) => r.item_id));
  pendientes = (examen.items || []).filter((i) => !hechas.has(i.id));
  indice = 0;
}

function arrancarPrueba() {
  $("antesala").classList.add("hidden");
  $("prueba").classList.remove("hidden");
  terminaEn = new Date(examen.termina_at).getTime();
  arrancarReloj();
  vigilar();
  if (!pendientes.length) { cerrar("entregado"); return; }
  pintarPregunta();
}

/* ---------------- El reloj ---------------- */
function arrancarReloj() {
  pintarReloj();
  clearInterval(tickReloj);
  tickReloj = setInterval(pintarReloj, 1000);
}

function pintarReloj() {
  const restan = Math.max(0, terminaEn - ahora());
  const seg = Math.floor(restan / 1000);
  const mm = String(Math.floor(seg / 60)).padStart(2, "0");
  const ss = String(seg % 60).padStart(2, "0");
  const el = $("reloj");
  el.textContent = `${mm}:${ss}`;
  // Los últimos dos minutos se ven: el color no va solo, el número ya
  // está ahí, pero conviene que se note sin mirar fijo.
  el.classList.toggle("text-red-600", seg <= 120);
  el.classList.toggle("dark:text-red-400", seg <= 120);
  if (restan <= 0) { clearInterval(tickReloj); cerrar("tiempo"); }
}

/* ---------------- Antitrampa ---------------- */
function vigilar() {
  if (vigilando) return;
  vigilando = true;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) salio(); else volvio();
  });
  window.addEventListener("blur", salio);
  window.addEventListener("focus", volvio);
  // Salirse de pantalla completa cuenta como salida: es la forma más
  // cómoda de poner otra ventana al lado.
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) salio();
  });
}

function salio() {
  if (cerrando || fueraDesde) return;
  fueraDesde = Date.now();
}

async function volvio() {
  if (cerrando || !fueraDesde) return;
  const segundos = Math.round((Date.now() - fueraDesde) / 1000);
  fueraDesde = null;
  // Quien cuenta es el servidor. Acá solo se le dice que pasó y cuánto.
  const { data, error } = await sb.rpc("registrar_salida_examen", {
    p_examen: EXAMEN_ID, p_segundos: segundos,
  });
  if (error || !data) return;
  if (data.congelado) { await cerrar("congelado"); return; }
  const veces = `${data.salidas} ${data.salidas === 1 ? "vez" : "veces"}`;
  // `avisos_restantes` viene en null cuando este examen no congela. Ahí el
  // aviso dice la verdad —queda anotado— en vez de amenazar con algo que no
  // va a pasar: una advertencia que nunca se cumple deja de leerse.
  const quedan = data.avisos_restantes;
  if (quedan == null) {
    $("q-avisos").textContent = `⚠️ Saliste ${veces} · queda anotado`;
    $("q-avisos").className = "text-xs font-semibold text-red-600 dark:text-red-400";
    await Avisos.alerta("Esto queda anotado y tu profe lo va a ver en el informe.", { titulo: "Saliste del examen" });
    return;
  }
  $("q-avisos").textContent = `⚠️ Saliste ${veces} · ${quedan} más y se congela`;
  $("q-avisos").className = "text-xs font-semibold text-red-600 dark:text-red-400";
  await Avisos.alerta(`Esto queda anotado.\n\nSi sales ${quedan} ${quedan === 1 ? "vez" : "veces"} más, el examen se congela y solo tu profe podrá volver a abrirlo.`, { titulo: "Saliste del examen" });
}

/* ---------------- Las preguntas ---------------- */
function pintarPregunta() {
  const it = pendientes[indice];
  respuestaActual = null;
  arrancoPregunta = Date.now();
  $("q-status").textContent = "";
  $("q-pista").textContent = "";
  $("responder-btn").disabled = true;

  const total = (examen.items || []).length;
  const numero = total - pendientes.length + indice + 1;
  $("q-num").textContent = `Pregunta ${numero} de ${total}`;
  $("q-barra").style.width = Math.round((100 * (numero - 1)) / total) + "%";
  $("q-enunciado").textContent = it.visible.enunciado || "";

  const wrap = $("q-board-wrap");
  const ops = $("q-opciones");
  ops.innerHTML = "";
  wrap.classList.add("hidden");
  wrap.classList.remove("flex");

  if (it.tipo === "opcion" || it.tipo === "opcion_tablero") {
    if (it.visible.fen) montarTablero(it.visible.fen, "mirar");
    pintarOpciones(it);
  } else if (it.tipo === "jugada") {
    montarTablero(it.visible.fen, "jugada");
    $("q-pista").textContent = "Haz clic en la pieza y después en su casilla de destino. Se responde con una sola jugada.";
  } else if (it.tipo === "casilla") {
    montarTablero(it.visible.fen, "casilla");
    $("q-pista").textContent = "Haz clic en la casilla que contestas.";
  } else if (it.tipo === "linea") {
    prepararLinea(it);
  }
}

function montarTablero(fen, tipo, alSeleccionar) {
  const wrap = $("q-board-wrap");
  wrap.classList.remove("hidden");
  wrap.classList.add("flex");
  tablero = TableroPregunta.montar($("q-board"), {
    fen: fen, tipo: tipo,
    alSeleccionar: alSeleccionar || function (r, texto) {
      respuestaActual = r;
      $("q-pista").textContent = texto + " Puedes cambiarla, o responder para seguir.";
      $("responder-btn").disabled = false;
    },
  });
}

function pintarOpciones(it) {
  const ops = $("q-opciones");
  (it.visible.opciones || []).forEach((texto, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = claseOpcion(false);
    // La letra va ESCRITA dentro del botón, no puesta con CSS: con un
    // ::before se vería igual y el lector de pantalla no la diría.
    btn.innerHTML = `<span class="font-semibold">Opción ${String.fromCharCode(65 + i)}.</span> ${escapeHtml(texto)}`;
    btn.addEventListener("click", () => {
      respuestaActual = { opcion: String(i) };
      [...ops.children].forEach((b, j) => { b.className = claseOpcion(j === i); });
      $("responder-btn").disabled = false;
    });
    ops.appendChild(btn);
  });
}

function claseOpcion(activa) {
  return "w-full text-left text-sm px-4 py-3 rounded-xl border transition-colors " + (activa
    ? "bg-accent-500 border-accent-500 text-brand-900 font-semibold"
    : "bg-white dark:bg-brand-900 border-brand-200 dark:border-brand-700 text-brand-700 dark:text-brand-200 hover:border-accent-500");
}

/* Ejecutar una apertura: se le pide la línea entera, de una vez. El
   rival contesta solo; el alumno no tiene pista ni puede deshacer — que
   es justamente la diferencia con entreno/aperturas.html, donde esto
   mismo se practica con ayuda y con repaso espaciado. */
function prepararLinea(it) {
  const jugadas = it.visible.jugadas_rival || [];
  const miColor = it.visible.color || "w";
  const g = new Chess();
  const dadas = [];

  // Las jugadas del rival se ponen solas, tanto al empezar (si abre él)
  // como después de cada jugada del alumno.
  function avanzarRival() {
    while (dadas.length < jugadas.length && g.turn() !== miColor) {
      const mov = g.move(jugadas[dadas.length]);
      if (!mov) break;
      dadas.push(mov.san);
    }
  }
  avanzarRival();

  montarTablero(g.fen(), "jugada", function (r) {
    const mov = g.move({ from: r.from, to: r.to, promotion: r.promotion || "q" });
    if (!mov) return;
    dadas.push(mov.san);
    avanzarRival();
    tablero.cargar(g.fen());

    // Entregar una línea a medias es una respuesta —vale cero— pero
    // quedarse trabado sin poder pasar a la pregunta siguiente sería
    // peor: el reloj corre igual.
    respuestaActual = { jugadas: dadas.slice() };
    $("responder-btn").disabled = false;
    if (dadas.length >= jugadas.length) {
      $("q-pista").textContent = "Terminaste la línea. Responde para entregarla.";
      tablero.bloquear();
    } else {
      $("q-pista").textContent = `Van ${dadas.length} de ${jugadas.length} jugadas.`;
    }
  });

  $("q-pista").textContent =
    `La línea tiene ${jugadas.length} jugadas en total. Da las tuyas: no hay pistas y no se puede deshacer.`;
}

/* ---------------- Responder ---------------- */
async function responder() {
  if (!respuestaActual) return;
  const btn = $("responder-btn");
  btn.disabled = true;
  $("q-status").textContent = "Guardando…";
  const it = pendientes[indice];
  const segundos = Math.round((Date.now() - arrancoPregunta) / 1000);

  const { data, error } = await sb.rpc("responder_examen", {
    p_item: it.id, p_respuesta: respuestaActual, p_segundos: segundos,
  });
  if (error) { btn.disabled = false; $("q-status").textContent = "No se pudo guardar: " + error.message; return; }

  // El servidor puede decir que se acabó el tiempo o que el examen se
  // cerró: eso manda sobre lo que crea esta página.
  if (data && data.guardada === false) {
    if (data.motivo === "tiempo") { await cerrar("tiempo"); return; }
    if (data.motivo === "cerrado") { await cerrar(data.estado === "congelado" ? "congelado" : "entregado"); return; }
    // 'ya_respondida': se sigue, no se pierde nada.
  }

  indice += 1;
  if (indice >= pendientes.length) { await cerrar("entregado"); return; }
  pintarPregunta();
}

/* ---------------- Cerrar ---------------- */
async function cerrar(motivo) {
  if (cerrando) return;
  cerrando = true;
  clearInterval(tickReloj);
  try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (e) {}
  await sb.rpc("cerrar_examen", { p_examen: EXAMEN_ID, p_motivo: motivo });
  await mostrarResultado(motivo);
}

const MOTIVO_TEXTO = {
  entregado: "Lo entregaste completo.",
  tiempo: "Se acabó el tiempo. Se entregó con lo que llevabas hecho.",
  congelado: "El examen se congeló porque saliste de la ventana tres veces. Habla con tu profe.",
};

async function mostrarResultado(motivo) {
  $("prueba").classList.add("hidden");
  $("antesala").classList.add("hidden");
  $("loading").classList.add("hidden");
  $("resultado").classList.remove("hidden");

  const { data: inf, error } = await sb.rpc("examen_informe", { p_examen: EXAMEN_ID });
  if (error || !inf) { $("r-detalle").textContent = "No se pudo cargar tu resultado."; return; }

  const congelado = inf.motivo_cierre === "congelado" || inf.estado === "congelado";
  $("r-emoji").textContent = congelado ? "🔒" : (inf.motivo_cierre === "tiempo" ? "⏰" : "✅");
  $("r-titulo").textContent = congelado ? "Examen congelado" : "Examen entregado";
  $("r-motivo").textContent = MOTIVO_TEXTO[inf.motivo_cierre] || MOTIVO_TEXTO[motivo] || "";
  $("r-nota").textContent = inf.nota != null ? Number(inf.nota).toFixed(2) : "—";
  $("r-detalle").textContent =
    `${inf.puntos} de ${inf.puntos_posibles} puntos · respondiste ${inf.respondidas} de ${inf.total_items} preguntas.`;

  // Por área sí, pregunta por pregunta NO: las respuestas correctas son
  // el material del banco y enseñarlas convertiría el examen siguiente
  // en un juego de memoria. Es la misma decisión de nivel-de-arbitraje.html.
  const cont = $("r-areas");
  cont.innerHTML = "";
  (inf.areas || []).forEach((a) => {
    const pct = Number(a.porcentaje);
    const fila = document.createElement("div");
    fila.className = "flex items-center gap-3";
    fila.innerHTML = `
      <span class="text-sm text-brand-700 dark:text-brand-200 w-28 shrink-0">${escapeHtml(a.area)}</span>
      <span class="flex-1 h-2 bg-brand-200 dark:bg-brand-700 rounded-full overflow-hidden">
        <i class="block h-full ${pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-accent-500" : "bg-red-500"}" style="width:${pct}%"></i>
      </span>
      <span class="text-xs text-brand-500 dark:text-brand-300 tabular-nums w-20 text-right">${pct}% · ${a.aciertos}/${a.preguntas}</span>`;
    cont.appendChild(fila);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const b = $("responder-btn");
  if (b) b.addEventListener("click", responder);
});
init();

    