/* preparacion-rivales.html: cargar las partidas, elegir al rival, filtrar,
 * pintar el análisis, revisarlo con Stockfish y guardarlo.
 *
 * Quién puede: puedo_preparar_rivales() (quien administra, o un profesor al
 * que administración se la activó en admin.html#preparacion). Esta página
 * solo decide qué se pinta; guardar lo vuelve a exigir la RLS.
 *
 * Las piezas:
 *   js/preparacion-trabajador.js  lee y analiza en segundo plano, y se queda
 *                                 con las partidas (los filtros no releen nada)
 *   js/preparacion-pintar.js      dibuja el análisis
 *   js/preparacion-motor.js       la revisión con Stockfish
 *   js/preparacion-lineas.js      notación, posiciones y el plan en PGN
 *   js/preparacion-descarga.js    bajar las partidas de Lichess o Chess.com
 *
 * El PGN no sale de la computadora; lo que se guarda es el resultado
 * (preparaciones_rival.analisis). Ver «La preparación de rivales» en
 * docs/decisiones/paneles.md.
 */
(function () {
  "use strict";

  const L = window.PreparacionLineas;
  const P = window.PreparacionPintar;
  const M = window.PreparacionMotor;
  const $ = (id) => document.getElementById(id);
  const el = P.el;
  const TOPE_BYTES = 1400000;      // la base acepta hasta 1,5 MB por análisis

  let yo = null;
  let actual = null;                // el análisis que se ve
  let guardadoId = null;            // si el que se ve ya está guardado
  let rivalCargado = null;          // el rival cuyas partidas tiene el trabajador
  let jugadoresLeidos = [];
  let revision = null;              // { parar, promesa } de la revisión en curso

  // ------------------------------------------------------------ el trabajador

  // Las cuentas corren en un Web Worker. Si el navegador no lo deja, las
  // mismas funciones corren acá (más lento, pero anda).
  const trabajo = (function () {
    let w = null, siguiente = 1;
    const pendientes = new Map();
    try {
      w = new Worker("js/preparacion-trabajador.js");
      w.onmessage = (ev) => {
        const r = ev.data || {};
        const p = pendientes.get(r.id);
        if (!p) return;
        pendientes.delete(r.id);
        if (r.error) p.rej(new Error(r.error)); else p.res(r);
      };
      w.onerror = (e) => {
        console.error("El trabajador de la preparación falló", e);
        for (const p of pendientes.values()) p.rej(new Error("El análisis en segundo plano se detuvo."));
        pendientes.clear();
      };
    } catch (e) {
      w = null;
    }
    let local = [];
    function pedir(msg) {
      if (!w) {
        const A = window.PreparacionAnalisis;
        if (msg.tipo === "leer") { local = A.leerPgn(msg.texto); return Promise.resolve({ total: local.length, jugadores: A.jugadores(local).slice(0, 200) }); }
        return Promise.resolve({ resultado: A.analizar(local, msg.rival, msg.filtros || {}) });
      }
      const id = siguiente++;
      return new Promise((res, rej) => { pendientes.set(id, { res, rej }); w.postMessage(Object.assign({ id }, msg)); });
    }
    return {
      leer: (texto) => pedir({ tipo: "leer", texto }),
      analizar: (rival, filtros) => pedir({ tipo: "analizar", rival, filtros }).then((r) => r.resultado),
    };
  })();

  // ------------------------------------------------------------ 1. leer

  function leerArchivo(f) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result || ""));
      fr.onerror = () => rej(fr.error || new Error("No se pudo leer " + f.name));
      fr.readAsText(f);
    });
  }

  // Le pasa las partidas al trabajador y deja lista la lista de jugadores.
  // `rival` (un usuario recién bajado) se elige solo, si está.
  async function cargarTexto(texto, estado, rival) {
    estado.textContent = "Leyendo las partidas…";
    let r;
    try {
      r = await trabajo.leer(texto);
    } catch (e) {
      estado.textContent = "No se pudieron leer las partidas: " + (e.message || e);
      return false;
    }
    rivalCargado = null;
    jugadoresLeidos = r.jugadores;
    if (!r.total) {
      estado.textContent = "No se encontró ninguna partida. Revisa que sea un PGN.";
      $("paso-rival").hidden = true;
      return false;
    }
    estado.textContent = "Se leyeron " + r.total.toLocaleString("es-CR") + (r.total === 1 ? " partida" : " partidas") +
      " de " + r.jugadores.length.toLocaleString("es-CR") + (r.jugadores.length === 1 ? " jugador." : " jugadores.");
    const sel = $("rival");
    sel.textContent = "";
    r.jugadores.forEach((j) => {
      const o = el("option", "", j.nombre + " — " + j.partidas.toLocaleString("es-CR") + (j.partidas === 1 ? " partida" : " partidas"));
      o.value = j.nombre;
      sel.appendChild(o);
    });
    if (rival) {
      const suyo = r.jugadores.find((j) => j.clave === claveDe(rival));
      if (suyo) sel.value = suyo.nombre;
    }
    $("paso-rival").hidden = false;
    return true;
  }

  function claveDe(nombre) { return window.PreparacionAnalisis.claveNombre(nombre); }

  async function leer() {
    const boton = $("leer");
    const archivos = [...($("pgn-archivo").files || [])];
    const pegado = $("pgn-texto").value;
    if (!archivos.length && !pegado.trim()) {
      $("leido").textContent = "Elige un archivo PGN o pega las partidas.";
      return;
    }
    boton.disabled = true;
    $("leido").textContent = "Leyendo…";
    let textos;
    try {
      textos = await Promise.all(archivos.map(leerArchivo));
      if (pegado.trim()) textos.push(pegado);
    } catch (e) {
      console.error(e);
      $("leido").textContent = "No se pudo leer el archivo: " + (e.message || e);
      boton.disabled = false;
      return;
    }
    const ok = await cargarTexto(textos.join("\n\n"), $("leido"));
    boton.disabled = false;
    if (ok) $("rival").focus();
  }

  // ------------------------------------------------------------ 1b. bajar de Lichess o Chess.com

  let bajando = null;   // el AbortController de la descarga en curso

  async function bajar(ev) {
    ev.preventDefault();
    if (bajando) return;
    const sitio = document.querySelector('input[name="bajar-sitio"]:checked').value;
    const usuario = $("bajar-usuario").value.trim().replace(/^@/, "");
    const maximo = parseInt($("bajar-maximo").value, 10) || 0;
    const estado = $("bajar-estado");
    const nombreSitio = sitio === "lichess" ? "Lichess" : "Chess.com";
    if (!window.PreparacionDescarga.USUARIO_VALIDO.test(usuario)) {
      estado.textContent = "Escribe el nombre de usuario tal como sale en su perfil: letras, números, guion o guion bajo.";
      $("bajar-usuario").focus();
      return;
    }
    bajando = new AbortController();
    $("bajar").disabled = true;
    $("bajar-parar").hidden = false;
    estado.textContent = "Pidiéndole las partidas a " + nombreSitio + "…";
    let texto = "";
    let parado = false;
    let ultimoAviso = 0;
    try {
      texto = await window.PreparacionDescarga.descargar({
        sitio, usuario, maximo, senal: bajando.signal,
        alAvanzar: (n, mes, meses) => {
          // El lector de pantalla no necesita cada partida: una vez por segundo.
          const ahora = Date.now();
          if (ahora - ultimoAviso < 1000) return;
          ultimoAviso = ahora;
          estado.textContent = "Bajando de " + nombreSitio + ": " + n.toLocaleString("es-CR") + (n === 1 ? " partida" : " partidas") +
            (meses ? " (mes " + mes + " de " + meses + ")" : "") + "…";
        },
      });
    } catch (e) {
      if (e && e.name === "AbortError") {
        parado = true;
      } else {
        if (!(e && e.paraMostrar)) console.error(e);
        estado.textContent = e && e.paraMostrar ? e.message : "No se pudieron bajar las partidas de " + nombreSitio + ". Revisa tu conexión y vuelve a intentarlo.";
        terminarBajada();
        return;
      }
    }
    // Parado a la mitad: se analiza lo que ya llegó (en Lichess va quedando en
    // el texto; en Chess.com, los meses completos).
    if (parado) texto = window.PreparacionDescarga.ultimoTexto || texto;
    terminarBajada();
    if (!texto || !(await cargarTexto(texto, estado, usuario))) {
      if (parado) estado.textContent = "Se paró antes de que llegara alguna partida.";
      return;
    }
    if (!jugadoresLeidos.some((j) => j.clave === claveDe(usuario))) {
      estado.textContent += " Ninguna es de «" + usuario + "»: elige al rival en la lista.";
      $("rival").focus();
      return;
    }
    analizar();
  }

  function terminarBajada() {
    bajando = null;
    $("bajar").disabled = false;
    $("bajar-parar").hidden = true;
  }

  // ------------------------------------------------------------ 2. analizar y filtrar

  async function analizar() {
    const nombre = $("rival").value;
    if (!nombre) return;
    await calcular(nombre, {});
  }

  // Analiza (o vuelve a analizar con otros filtros) y lo muestra. La revisión
  // del análisis anterior se para antes: sus jugadas ya no son las de este.
  async function calcular(nombre, filtros) {
    await detenerRevision();
    $("analizar").disabled = true;
    let r;
    try {
      r = await trabajo.analizar(nombre, filtros);
    } catch (e) {
      Avisos.avisar("No se pudo analizar: " + (e.message || e), { tipo: "error" });
      $("analizar").disabled = false;
      return;
    }
    $("analizar").disabled = false;
    if (!r) {
      Avisos.avisar("Ese jugador no tiene partidas con resultado en el archivo.", { tipo: "error" });
      return;
    }
    rivalCargado = nombre;
    mostrar(r, null);
    if (!r.vacio) iniciarRevision();
  }

  // Desde cuándo: las opciones son relativas a hoy.
  function haceAnios(n) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - n);
    return d.toISOString().slice(0, 10);
  }
  const DESDE = [
    { etiqueta: "Todas", valor: "" },
    { etiqueta: "El último año", anios: 1 },
    { etiqueta: "Los últimos 2 años", anios: 2 },
    { etiqueta: "Los últimos 5 años", anios: 5 },
  ];

  // Los filtros, con lo que el rival tiene en el archivo. Se pueden cambiar
  // solo si el trabajador tiene sus partidas (no en un análisis guardado).
  function pintarFiltros(r) {
    const caja = $("filtros");
    caja.textContent = "";
    if (!r.disponibles) { caja.hidden = true; return; }
    caja.hidden = false;
    const editable = rivalCargado && claveDe(rivalCargado) === claveDe(r.rival) && !guardadoId;
    const ritmos = el("fieldset", "min-w-0");
    ritmos.appendChild(el("legend", "text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mb-1", "Ritmos"));
    const lista = el("div", "flex flex-wrap gap-x-4 gap-y-1 text-sm");
    const elegidos = r.filtros && r.filtros.ritmos && r.filtros.ritmos.length ? r.filtros.ritmos : null;
    r.disponibles.ritmos.forEach((x) => {
      const lab = el("label", "inline-flex items-center gap-2");
      const c = el("input", "accent-accent-500");
      c.type = "checkbox";
      c.name = "filtro-ritmo";
      c.value = x.ritmo;
      c.checked = !elegidos || elegidos.includes(x.ritmo);
      c.disabled = !editable;
      lab.appendChild(c);
      lab.appendChild(document.createTextNode(x.ritmo + " (" + x.n.toLocaleString("es-CR") + ")"));
      lista.appendChild(lab);
    });
    ritmos.appendChild(lista);
    caja.appendChild(ritmos);

    const d = el("div");
    const lab = el("label", "block text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mb-1", "Desde");
    lab.htmlFor = "filtro-desde";
    const sel = el("select", "px-3 py-1.5 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
    sel.id = "filtro-desde";
    sel.disabled = !editable;
    DESDE.forEach((o) => {
      const op = el("option", "", o.etiqueta);
      op.value = o.anios ? String(o.anios) : "";
      sel.appendChild(op);
    });
    const desdeActual = r.filtros && r.filtros.desde;
    if (desdeActual) {
      const a = DESDE.find((o) => o.anios && Math.abs(new Date(haceAnios(o.anios)) - new Date(desdeActual)) < 3 * 86400000);
      sel.value = a ? String(a.anios) : "";
    }
    d.appendChild(lab);
    d.appendChild(sel);
    caja.appendChild(d);

    if (!editable) {
      caja.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 basis-full",
        "Para cambiar los filtros de un análisis guardado, vuelve a cargar sus partidas."));
      return;
    }
    const alCambiar = () => {
      const marcados = [...caja.querySelectorAll('input[name="filtro-ritmo"]:checked')].map((c) => c.value);
      if (!marcados.length) { $("filtros-aviso").textContent = "Marca al menos un ritmo."; return; }
      const todos = marcados.length === r.disponibles.ritmos.length;
      const anios = parseInt(sel.value, 10);
      calcular(rivalCargado, { ritmos: todos ? [] : marcados, desde: anios ? haceAnios(anios) : null });
    };
    caja.querySelectorAll('input[name="filtro-ritmo"]').forEach((c) => c.addEventListener("change", alCambiar));
    sel.addEventListener("change", alCambiar);
  }

  // ------------------------------------------------------------ pintar

  function mostrar(r, id) {
    actual = r;
    guardadoId = id;
    // Otro análisis: el tablero mostraba una línea del anterior.
    $("visor-caja").hidden = true;
    $("mandar-caja").hidden = true;
    $("resultado").hidden = false;
    $("titulo-resultado").textContent = r.rival;
    pintarFiltros(r);
    const aviso = $("filtros-aviso");
    if (r.vacio) {
      $("resultado-sub").textContent = "Ninguna de sus " + r.totalRival.toLocaleString("es-CR") + " partidas pasa estos filtros.";
      aviso.textContent = "Amplía los filtros para ver el análisis.";
      $("resultado-cuerpo").textContent = "";
      $("guardar").disabled = true;
      $("motor-revisar").disabled = true;
      $("motor-estado").textContent = "";
      $("titulo-resultado").focus();
      return;
    }
    $("motor-revisar").disabled = false;
    const partes = [r.total.toLocaleString("es-CR") + (r.total === 1 ? " partida" : " partidas") +
      (r.totalRival && r.totalRival !== r.total ? " de " + r.totalRival.toLocaleString("es-CR") : "")];
    if (r.fechas.desde) partes.push("del " + P.fecha(r.fechas.desde) + " al " + P.fecha(r.fechas.hasta));
    if (r.elo.reciente) partes.push("Elo reciente ≈ " + r.elo.reciente);
    partes.push("una línea cuenta desde " + r.minimo + " partidas");
    $("resultado-sub").textContent = partes.join(" · ");
    aviso.textContent = r.pocas ? "Con " + r.total + (r.total === 1 ? " partida" : " partidas") + " el análisis dice poco: amplía los filtros si puedes." : "";
    $("guardar").disabled = !!id;
    $("guardar").textContent = id ? "Guardado" : "Guardar el análisis";
    $("motor-estado").textContent = r.motor ? "Revisado con Stockfish (" + r.motor.detalle + ")." : "";
    pintar(r);
    $("titulo-resultado").focus();
  }

  function pintar(r) {
    P.cuerpo(r, $("resultado-cuerpo"), {
      alBajarPgn: (lado) => bajarPgn(r, lado),
      alMandar: (lado, origen) => abrirMandar(r, lado, origen),
      alArchivar: (lado, origen) => archivar(r, lado, origen),
      // Una jugada del plan: la línea hasta ahí y su continuación principal.
      alVerLinea: (camino, origen) => {
        const l = L.lineaDelPlan(r, camino);
        abrirVisor(l.sec, { en: l.en, notas: l.notas, titulo: "El plan: " + L.lineaEs(l.sec.slice(0, l.en)) }, origen);
      },
      // Una línea suelta (un error de Stockfish): se abre en su última jugada.
      alVerSecuencia: (sec, nota, origen) => {
        const notas = sec.map((x, i) => (i === sec.length - 1 ? nota : ""));
        abrirVisor(sec, { en: sec.length, notas, titulo: L.lineaEs(sec) }, origen);
      },
    });
  }

  // ------------------------------------------------------------ el tablero

  let visor = null;
  let volverA = null;   // el botón que abrió el tablero: ahí vuelve el foco al cerrarlo

  function abrirVisor(sec, opciones, origen) {
    if (!visor) {
      visor = window.VisorLinea.montar($("visor"), {
        nombre: "Tablero de la preparación",
        // Stockfish en cada posición (el mismo 19 lite de la revisión). Si la
        // revisión está corriendo, espera su turno en la misma cola.
        evaluar: M.disponible() ? (fen) => M.evaluar(fen) : null,
      });
    }
    volverA = origen || null;
    $("visor-caja").hidden = false;
    visor.cargar(sec, opciones);
    $("visor-caja").scrollIntoView({ block: "start" });
    visor.enfocar();
  }

  function cerrarVisor() {
    $("visor-caja").hidden = true;
    if (volverA && document.body.contains(volverA)) volverA.focus();
    volverA = null;
  }

  function bajarPgn(r, lado) {
    const texto = L.planAPgn(r, lado);
    if (!texto) return;
    const nombre = "preparacion-" + String(r.rival).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) + "-" + (lado === "conBlancas" ? "blancas" : "negras") + ".pgn";
    const url = URL.createObjectURL(new Blob([texto], { type: "application/x-chess-pgn" }));
    const a = el("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    Avisos.avisar("Plan bajado: " + nombre);
  }

  // ------------------------------------------------------------ mandar al alumno

  /* El plan de un lado a uno o varios alumnos, con su tarea: UNA llamada,
     mandar_plan_rival(), que valida en la base que sean alumnos de quien manda
     (la lista de acá es solo la que la RLS le deja ver). Lo que viaja es
     planDelAlumno(): el plan y lo que dijo Stockfish de SUS jugadas, no el
     análisis. Ver «Mandar el plan al alumno y a la clase: etapa 4». */
  let mandando = null;            // { r, lado, origen }
  let alumnosCargados = false;

  function nombreDelLado(lado) { return lado === "conBlancas" ? "con blancas" : "con negras"; }

  // Dentro de una semana, a las 8 de la noche: la fecha de siempre de una tarea.
  function venceSugerido() {
    const d = new Date(Date.now() + 7 * 86400000);
    d.setHours(20, 0, 0, 0);
    const dos = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + dos(d.getMonth() + 1) + "-" + dos(d.getDate()) + "T20:00";
  }

  async function cargarAlumnos() {
    if (alumnosCargados) return;
    const lista = $("mandar-alumnos");
    const todos = [];
    // PostgREST corta a mil filas sin avisar: de mil en mil.
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await sb.from("profiles").select("id, full_name, email")
        .eq("role", "alumno").order("full_name").order("id").range(desde, desde + 999);
      if (error) { $("mandar-cargando").textContent = "No se pudo traer la lista de alumnos."; return; }
      todos.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    alumnosCargados = true;
    $("mandar-cargando").hidden = true;
    $("mandar-sin-alumnos").hidden = todos.length > 0;
    lista.textContent = "";
    for (const a of todos) {
      const label = el("label", "flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-brand-50 dark:hover:bg-brand-800 cursor-pointer");
      const c = el("input", "rounded border-brand-300 text-accent-500 focus:ring-accent-400 mandar-check");
      c.type = "checkbox";
      c.value = a.id;
      label.appendChild(c);
      label.appendChild(el("span", "", a.full_name || a.email || "Sin nombre"));
      lista.appendChild(label);
    }
    // Elegir «los del martes» se hace igual que en Tareas y Exámenes.
    if (window.SubgruposMarcar && todos.length) SubgruposMarcar.montar({ sb, antesDe: lista, casillas: ".mandar-check" });
  }

  function abrirMandar(r, lado, origen) {
    mandando = { r, lado, origen };
    $("mandar-titulo").textContent = "Mandar el plan " + nombreDelLado(lado) + " contra " + r.rival;
    $("mandar-sin-motor").hidden = !!r.motor;
    $("mandar-estado").textContent = "";
    if (!$("mandar-vence").value) $("mandar-vence").value = venceSugerido();
    $("mandar-caja").hidden = false;
    $("mandar-caja").scrollIntoView({ block: "start" });
    $("mandar-titulo").focus();
    cargarAlumnos();
  }

  function cerrarMandar() {
    $("mandar-caja").hidden = true;
    const o = mandando && mandando.origen;
    if (o && document.body.contains(o)) o.focus();
    mandando = null;
  }

  async function mandar(ev) {
    ev.preventDefault();
    if (!mandando) return;
    const estado = $("mandar-estado");
    const alumnos = [...document.querySelectorAll(".mandar-check:checked")].map((c) => c.value);
    if (!alumnos.length) { estado.textContent = "Marca al menos un alumno."; return; }
    const vence = $("mandar-vence").value;
    if (!vence) { estado.textContent = "Ponle una fecha límite."; return; }
    if (new Date(vence) <= new Date()) { estado.textContent = "La fecha límite ya pasó."; return; }
    const { r, lado } = mandando;
    const b = $("mandar-enviar");
    b.disabled = true;
    estado.textContent = "Mandando…";
    const { data, error } = await sb.rpc("mandar_plan_rival", {
      p_alumnos: alumnos,
      p_rival: String(r.rival).slice(0, 120),
      p_lado: lado,
      p_plan: L.planDelAlumno(r, lado),
      p_nota: $("mandar-nota").value.trim(),
      p_vence: new Date(vence).toISOString(),
    });
    b.disabled = false;
    if (error) { estado.textContent = "No se pudo mandar: " + (error.message || error); return; }
    const n = typeof data === "number" ? data : alumnos.length;
    estado.textContent = "Plan mandado a " + n + (n === 1 ? " alumno" : " alumnos") + ", con su tarea.";
    document.querySelectorAll(".mandar-check").forEach((c) => { c.checked = false; });
    $("mandar-nota").value = "";
  }

  // ------------------------------------------------------------ a Archivos

  /* Cada línea del plan como un PGN de Archivos (archivos_pgn, los mismos de
     partidas.html), en una carpeta con el nombre del rival: así aparece en el
     panel 📁 Archivos de la clase en vivo, lista para cargar. Una fila por
     línea y no el plan entero, porque la clase carga una partida a la vez y el
     título de cada fila dice la línea. Guardarlo otra vez reemplaza lo de
     antes: se inserta lo nuevo y DESPUÉS se borra lo viejo, así un error a
     medio camino no deja la carpeta vacía. */
  async function archivar(r, lado, origen) {
    const lineas = L.lineasDelPlan(r[lado] && r[lado].plan);
    if (!lineas.length) return;
    const carpeta = ("Preparación: " + r.rival).slice(0, 120);
    const archivo = "preparacion-" + (lado === "conBlancas" ? "blancas" : "negras") + ".pgn";
    const filas = [];
    for (const camino of lineas) {
      const sec = camino.map((x) => x.san);
      const fen = L.fenDe(sec);
      if (!fen) continue;           // una línea que no se puede jugar no se guarda
      filas.push({
        profesor_id: yo,
        nombre_archivo: archivo,
        titulo: (lado === "conBlancas" ? "Con blancas" : "Con negras") + " · " + L.lineaEs(sec),
        pgn: L.lineaAPgn(r, lado, camino),
        move_count: sec.length,
        fen_final: fen,
        carpeta,
      });
    }
    const { data: viejas } = await sb.from("archivos_pgn").select("id")
      .eq("profesor_id", yo).eq("carpeta", carpeta).eq("nombre_archivo", archivo);
    const antes = (viejas || []).map((x) => x.id);
    const pregunta = (antes.length
      ? "En la carpeta «" + carpeta + "» ya hay " + antes.length + (antes.length === 1 ? " línea" : " líneas") + " de este plan. Se reemplazan por las " + filas.length + " de ahora."
      : "Se guardan " + filas.length + (filas.length === 1 ? " línea" : " líneas") + " en la carpeta «" + carpeta + "».") +
      " En la clase en vivo aparecen en 📁 Archivos.";
    const ok = await Avisos.confirmar(pregunta, { titulo: "Guardar el plan " + nombreDelLado(lado) + " en Archivos", aceptar: antes.length ? "Reemplazar" : "Guardar" });
    if (!ok) { if (origen) origen.focus(); return; }
    const { error } = await sb.from("archivos_pgn").insert(filas);
    if (error) {
      Avisos.avisar("No se pudo guardar en Archivos: " + (error.message || error), { tipo: "error" });
      return;
    }
    if (antes.length) await sb.from("archivos_pgn").delete().in("id", antes);
    Avisos.avisar("Listo: " + filas.length + (filas.length === 1 ? " línea" : " líneas") + " en Archivos, carpeta «" + carpeta + "».");
    if (origen) origen.focus();
  }

  // ------------------------------------------------------------ Stockfish

  function iniciarRevision() {
    if (!actual || actual.vacio || revision) return;
    if (!M.disponible()) {
      $("motor-estado").textContent = "Stockfish no está disponible en este navegador.";
      return;
    }
    const r = actual;
    const esta = { parar: false };
    revision = esta;
    $("motor-revisar").disabled = true;
    $("motor-parar").hidden = false;
    esta.promesa = M.revisar(r, {
      parar: () => esta.parar || actual !== r,
      alAvanzar: (hechas, total) => { $("motor-estado").textContent = "Revisando con Stockfish: " + (hechas + 1) + " de " + total + " jugadas…"; },
    }).then((res) => {
      if (revision === esta) revision = null;
      $("motor-revisar").disabled = false;
      $("motor-parar").hidden = true;
      if (actual !== r || !res.hechas) return;
      window.PreparacionAnalisis.aplicarMotor(r, res.tareas, res.evals, res.detalle);
      $("motor-estado").textContent = res.error
        ? "Stockfish se detuvo: " + (res.error.message || res.error) + ". Lo revisado hasta ahí se muestra igual."
        : (esta.parar ? "Revisión parada: " : "Listo: ") + res.detalle + ".";
      pintar(r);
      // Si ya estaba guardado, lo revisado no está en la base: se puede guardar de nuevo.
      if (guardadoId) { guardadoId = null; $("guardar").disabled = false; $("guardar").textContent = "Guardar con la revisión"; }
    });
  }

  async function detenerRevision() {
    const r = revision;
    if (!r) return;
    r.parar = true;
    await r.promesa;
  }

  // ------------------------------------------------------------ guardar

  async function guardar() {
    if (!actual || actual.vacio) return;
    const json = JSON.stringify(actual);
    if (json.length > TOPE_BYTES) {
      Avisos.avisar("El análisis es demasiado grande para guardarlo.", { tipo: "error" });
      return;
    }
    const b = $("guardar");
    b.disabled = true;
    const { data, error } = await sb.from("preparaciones_rival")
      .insert({ rival: String(actual.rival).slice(0, 120), partidas: actual.total, analisis: actual })
      .select("id").single();
    if (error) {
      console.error(error);
      b.disabled = false;
      Avisos.avisar("No se pudo guardar: " + (error.message || error), { tipo: "error" });
      return;
    }
    guardadoId = data.id;
    b.textContent = "Guardado";
    Avisos.avisar("Análisis de " + actual.rival + " guardado.");
    cargarGuardados();
  }

  async function cargarGuardados() {
    const { data, error } = await sb.from("preparaciones_rival")
      .select("id, rival, partidas, created_at").eq("profesor_id", yo)
      .order("created_at", { ascending: false }).range(0, 49);
    const ul = $("guardados");
    ul.textContent = "";
    if (error) {
      console.error(error);
      ul.appendChild(el("li", "py-2 text-sm text-brand-500 dark:text-brand-300", "No se pudieron cargar tus análisis guardados."));
      return;
    }
    $("guardados-vacio").hidden = (data || []).length > 0;
    for (const g of data || []) {
      const li = el("li", "flex flex-wrap items-center justify-between gap-3 py-3");
      const quien = el("div", "min-w-0");
      quien.appendChild(el("p", "font-semibold text-brand-800 dark:text-white truncate", g.rival));
      quien.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350", g.partidas.toLocaleString("es-CR") + (g.partidas === 1 ? " partida" : " partidas") + " · " + P.fecha(g.created_at)));
      li.appendChild(quien);
      const acciones = el("div", "flex gap-2");
      const abrir = el("button", "px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Abrir");
      abrir.type = "button";
      abrir.setAttribute("aria-label", "Abrir el análisis de " + g.rival);
      abrir.addEventListener("click", () => abrirGuardado(g.id));
      const borrar = el("button", "px-3 py-1.5 rounded-lg text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Eliminar");
      borrar.type = "button";
      borrar.setAttribute("aria-label", "Eliminar el análisis de " + g.rival);
      borrar.addEventListener("click", () => borrarGuardado(g));
      acciones.appendChild(abrir);
      acciones.appendChild(borrar);
      li.appendChild(acciones);
      ul.appendChild(li);
    }
  }

  async function abrirGuardado(id) {
    const { data, error } = await sb.from("preparaciones_rival").select("id, analisis").eq("id", id).single();
    if (error || !data) {
      Avisos.avisar("No se pudo abrir el análisis.", { tipo: "error" });
      return;
    }
    await detenerRevision();
    mostrar(data.analisis, data.id);
  }

  async function borrarGuardado(g) {
    const ok = await Avisos.confirmar("Se borra el análisis de " + g.rival + ". Las partidas no se guardaban, así que para verlo otra vez tendrías que cargar el PGN.", { titulo: "¿Eliminar este análisis?", aceptar: "Eliminar", peligro: true });
    if (!ok) return;
    const { error } = await sb.from("preparaciones_rival").delete().eq("id", g.id);
    if (error) {
      Avisos.avisar("No se pudo eliminar: " + (error.message || error), { tipo: "error" });
      return;
    }
    if (guardadoId === g.id) { guardadoId = null; $("guardar").disabled = false; $("guardar").textContent = "Guardar el análisis"; }
    Avisos.avisar("Análisis eliminado.");
    cargarGuardados();
  }

  // ------------------------------------------------------------ inicio

  async function init() {
    const { data } = await sb.auth.getSession();
    const sesion = data && data.session;
    if (!sesion) { location.href = "login.html"; return; }
    yo = sesion.user.id;
    const { data: puede, error } = await sb.rpc("puedo_preparar_rivales");
    $("loading").classList.add("hidden");
    if (error || puede !== true) {
      $("denegado").classList.remove("hidden");
      return;
    }
    $("app").classList.remove("hidden");
    $("leer").addEventListener("click", leer);
    $("bajar-form").addEventListener("submit", bajar);
    $("bajar-parar").addEventListener("click", () => { if (bajando) bajando.abort(); });
    $("analizar").addEventListener("click", analizar);
    $("guardar").addEventListener("click", guardar);
    $("motor-revisar").addEventListener("click", iniciarRevision);
    $("motor-parar").addEventListener("click", () => { if (revision) revision.parar = true; });
    $("visor-cerrar").addEventListener("click", cerrarVisor);
    $("mandar-cerrar").addEventListener("click", cerrarMandar);
    $("mandar-form").addEventListener("submit", mandar);
    cargarGuardados();
  }

  init();
})();
