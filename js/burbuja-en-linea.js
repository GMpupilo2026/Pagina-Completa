/* ===== La burbuja de "quién está conectado" =====
 *
 * Una burbuja flotante, abajo a la derecha, en TODAS las páginas de la
 * Academia. Tiene dos caras y las dos viven acá porque son el mismo hilo
 * visto desde sus dos puntas: escrita dos veces, se separarían a la primera
 * corrección.
 *
 *   - Quien da clase ve CUÁNTOS de sus alumnos están conectados ahora mismo,
 *     quiénes son y en qué página andan, y le puede escribir a cualquiera sin
 *     salir de lo que estaba haciendo.
 *   - El alumno recibe ese mensaje EN LA PÁGINA QUE TENGA ABIERTA y contesta
 *     ahí mismo.
 *
 * Esa segunda mitad no es un adorno: hasta ahora el chat solo existía dentro
 * de `sesion.html`, o sea que un mensaje mandado a un alumno que estaba
 * entrenando no lo leía nadie. Un mensaje que no llega no es un mensaje, y
 * eso no da ningún error: se manda, se guarda, y el profesor se queda
 * esperando una respuesta que nunca iba a venir.
 *
 * ---------------------------------------------------------------------------
 * EL CANAL ES POR PROFESOR, NO UNO GLOBAL
 *
 * Un canal de presencia de Supabase lo escucha cualquiera que sepa su nombre:
 * no pasa por la RLS. Así que un `academia-en-linea` global le repartiría a
 * los mil doscientos alumnos la lista de quién está conectado y en qué página
 * — que es justo la fuga que ya se cerró una vez, cuando el canal de Juegos
 * anunciaba con quién estudiaba cada quien.
 *
 * Por eso el alumno se anuncia en `academia-en-linea:<profesor>`, uno por cada
 * profesor suyo, y el profesor escucha el suyo. Lo peor que puede oír alguien
 * que se cuele en el canal de su propio profesor son sus compañeros, que es
 * exactamente lo que `es_companero()` ya le deja ver en `profiles`.
 *
 * Y LO QUE LLEGA POR EL CANAL NO SE CREE: el nombre lo escribe el cliente, así
 * que cualquiera podría anunciarse en el canal de un profesor ajeno con el
 * nombre que quisiera. La lista se cruza contra `profiles` —donde la RLS solo
 * le devuelve al profesor sus propios alumnos— y **el nombre que se pinta es
 * el de la base, no el del canal**. Un intruso no aparece. Sin ese cruce, la
 * pantalla se vería perfecta y el mensaje lo rechazaría la base sin que nadie
 * entendiera por qué.
 *
 * ---------------------------------------------------------------------------
 * "CONECTADO" QUIERE DECIR LO MISMO QUE EN EL RESTO DEL SITIO
 *
 * Tener la pestaña abierta no es estar. `js/tiempo-plataforma.js` ya decidió
 * hace tiempo qué cuenta como activo —60 segundos sin un clic, una tecla o un
 * scroll, o la pestaña de fondo— y acá se usa EL MISMO número: al pasar de
 * ahí se deja de anunciar, y al volver la actividad se vuelve a anunciar. Si
 * no, la burbuja diría "3 conectados" de gente que dejó la página abierta y se
 * fue, el profesor le escribiría y no contestaría nadie.
 *
 * ---------------------------------------------------------------------------
 * EL MENSAJE NO ESTRENA TABLA: es `class_chat_messages`, la misma del chat de
 * la clase en vivo, con la misma RLS (el profesor escribe en el hilo de
 * cualquier alumno suyo; el alumno solo en el suyo). Un mensaje es un mensaje,
 * no dos bandejas: lo que se escribe desde acá se lee en la clase en vivo y al
 * revés.
 *
 * QUÉ ESTÁ LEÍDO vive en `localStorage`, y es del APARATO a propósito — como
 * el tema o la clase elegida. Es un aviso, no un dato: guardarlo en la base
 * pediría una columna que hay que mantener al día con cada lectura, y lo peor
 * que pasa con esto es que un mensaje ya leído en la compu vuelva a avisar una
 * vez en el celular.
 *
 * Uso — una sola línea, después de `js/supabase-client.js`:
 *   <script src="js/burbuja-en-linea.js" defer></script>
 * La pone `herramientas/academia-cabecera.py` en las páginas de la Academia.
 * Sin sesión no hace absolutamente nada, y nunca rompe la página que la lleva.
 */
(function () {
  "use strict";

  var IDLE_MS = 60000;        // el mismo de js/tiempo-plataforma.js
  var LATIDO_MS = 20000;
  var CANAL = "academia-en-linea:";
  var LEIDOS = "burbuja_leidos_v1";
  var CERRADA = "burbuja_cerrada_v1";
  var MAX_MENSAJES = 40;

  var sb = null;
  var yo = null;              // {id, nombre, role, is_admin}
  var esDocente = false;
  var canales = [];           // los de presencia
  var conectados = new Map(); // id -> {pagina, desde}
  var alumnos = new Map();    // id -> nombre, SEGÚN LA BASE (no según el canal)
  var hilo = null;            // con quién estoy hablando
  var mensajes = [];
  var noLeidos = new Set();
  var abierta = false;
  var ultimaActividad = Date.now();
  var anunciado = false;
  var raiz = null;

  // --------------------------------------------------------------- utilidades
  function guardado(clave, porOmision) {
    try {
      var v = localStorage.getItem(clave);
      return v === null ? porOmision : JSON.parse(v);
    } catch (e) { return porOmision; }
  }
  function guardar(clave, valor) {
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) {}
  }

  /* Hasta dónde se leyó cada hilo. Un objeto {idDelHilo: fechaISO}. */
  function leidoHasta(id) { return (guardado(LEIDOS, {}) || {})[id] || ""; }
  function marcarLeido(id, fecha) {
    var todos = guardado(LEIDOS, {}) || {};
    todos[id] = fecha || new Date().toISOString();
    guardar(LEIDOS, todos);
  }

  var nombreDe = function (p) {
    return (p && (p.full_name || "").trim()) || (p && p.email) || "Alguien";
  };

  /* En qué página estoy, en palabras. Sale del <title>, que ya está escrito
     para leerse; el pathname diría "entreno/4x4.html", que no le dice nada a
     quien lo lee. Se recorta el sufijo del sitio, que se repite en los 76. */
  function dondeEstoy() {
    var t = (document.title || "").split("·")[0].split("|")[0].trim();
    return t.slice(0, 60) || "la Academia";
  }

  function haceCuanto(iso) {
    var ms = Date.now() - new Date(iso).getTime();
    if (!(ms >= 0)) return "";
    var min = Math.floor(ms / 60000);
    if (min < 1) return "recién";
    if (min < 60) return "hace " + min + " min";
    return "hace " + Math.floor(min / 60) + " h";
  }

  // ------------------------------------------------------------------ la caja
  function construir() {
    raiz = document.createElement("div");
    raiz.id = "burbuja-en-linea";
    /* Abajo a la derecha y fija. `z-40` la deja DEBAJO del encabezado
       (`z-50`): si empatara, taparía el interruptor de tema al desplegarse. */
    raiz.className = "fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 print:hidden";
    raiz.innerHTML = [
      '<div id="burbuja-panel" class="hidden w-[min(92vw,22rem)] max-h-[70vh] flex flex-col',
      ' bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700',
      ' rounded-2xl shadow-2xl overflow-hidden">',
      '  <div class="flex items-center justify-between gap-2 px-4 py-3 border-b border-brand-100 dark:border-brand-800">',
      '    <h2 id="burbuja-titulo" class="font-serif text-base font-bold text-brand-700 dark:text-brand-100"></h2>',
      '    <button type="button" id="burbuja-cerrar" class="text-brand-450 dark:text-brand-350 hover:text-brand-700 dark:hover:text-brand-100 text-xl leading-none w-8 h-8 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" aria-label="Cerrar">&times;</button>',
      '  </div>',
      '  <div id="burbuja-cuerpo" class="flex-1 overflow-y-auto px-4 py-3 space-y-2"></div>',
      '  <form id="burbuja-form" class="hidden border-t border-brand-100 dark:border-brand-800 p-3 flex gap-2">',
      '    <label for="burbuja-texto" class="sr-only">Escribe tu mensaje</label>',
      '    <input id="burbuja-texto" type="text" maxlength="2000" autocomplete="off" placeholder="Escribe aquí…"',
      '      class="flex-1 min-w-0 rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 text-brand-700 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">',
      '    <button type="submit" class="bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-3 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">Enviar</button>',
      '  </form>',
      '</div>',
      '<button type="button" id="burbuja-boton" class="hidden items-center gap-2 bg-brand-800 hover:bg-brand-700 text-white',
      ' rounded-full shadow-lg pl-4 pr-5 py-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"',
      ' aria-expanded="false" aria-controls="burbuja-panel">',
      '  <span aria-hidden="true">🟢</span>',
      '  <span id="burbuja-etiqueta" class="text-sm font-semibold" aria-live="polite"></span>',
      '</button>',
    ].join("");
    document.body.appendChild(raiz);

    raiz.querySelector("#burbuja-boton").addEventListener("click", function () {
      abierta ? cerrar() : abrir();
    });
    raiz.querySelector("#burbuja-cerrar").addEventListener("click", cerrar);
    raiz.querySelector("#burbuja-form").addEventListener("submit", enviar);
    /* Escape cierra y devuelve el foco al botón: un panel que se cierra
       dejando el foco en la nada deja perdido a quien usa teclado. */
    raiz.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && abierta) { e.stopPropagation(); cerrar(); }
    });
  }

  function abrir() {
    abierta = true;
    guardar(CERRADA, false);
    raiz.querySelector("#burbuja-panel").classList.remove("hidden");
    raiz.querySelector("#burbuja-boton").setAttribute("aria-expanded", "true");
    if (!esDocente) abrirHilo(yo.id);
    else if (hilo) abrirHilo(hilo);
    else pintarPanel();
  }

  function cerrar() {
    abierta = false;
    hilo = null;
    guardar(CERRADA, true);
    raiz.querySelector("#burbuja-panel").classList.add("hidden");
    var b = raiz.querySelector("#burbuja-boton");
    b.setAttribute("aria-expanded", "false");
    b.focus();
    pintarBoton();
  }

  // ------------------------------------------------------------------ pintado
  function pintarBoton() {
    var b = raiz.querySelector("#burbuja-boton");
    var etiqueta = raiz.querySelector("#burbuja-etiqueta");
    var sinLeer = noLeidos.size;

    if (esDocente) {
      /* Al profesor la burbuja se le queda SIEMPRE: el conteo es el dato, y
         "ahora mismo no hay nadie" también es una respuesta. */
      var n = conectados.size;
      etiqueta.textContent = (n === 1 ? "1 alumno en línea" : n + " alumnos en línea")
        + (sinLeer ? " · " + sinLeer + " sin leer" : "");
      b.classList.remove("hidden");
      b.classList.add("flex");
    } else {
      /* Al alumno solo se le pinta si tiene algo que leer. Un botón permanente
         de "quién está conectado" no le sirve de nada y es justo el estorbo
         que esto no quiere ser. */
      if (!sinLeer && !abierta) {
        b.classList.add("hidden");
        b.classList.remove("flex");
        return;
      }
      etiqueta.textContent = sinLeer
        ? (sinLeer === 1 ? "1 mensaje de tu profe" : sinLeer + " mensajes de tu profe")
        : "Tu profe";
      b.classList.remove("hidden");
      b.classList.add("flex");
    }
    b.classList.toggle("bg-accent-500", sinLeer > 0);
    b.classList.toggle("text-brand-900", sinLeer > 0);
    b.classList.toggle("hover:bg-accent-600", sinLeer > 0);
    b.classList.toggle("bg-brand-800", sinLeer === 0);
    b.classList.toggle("text-white", sinLeer === 0);
    b.classList.toggle("hover:bg-brand-700", sinLeer === 0);
  }

  /* La lista de conectados (solo el profesor la ve). */
  function pintarPanel() {
    hilo = null;
    raiz.querySelector("#burbuja-titulo").textContent = "Conectados ahora";
    raiz.querySelector("#burbuja-form").classList.add("hidden");
    var cuerpo = raiz.querySelector("#burbuja-cuerpo");
    cuerpo.innerHTML = "";

    var filas = [];
    conectados.forEach(function (d, id) {
      if (alumnos.has(id)) filas.push({ id: id, nombre: alumnos.get(id), pagina: d.pagina, desde: d.desde });
    });
    filas.sort(function (a, b) { return a.nombre.localeCompare(b.nombre, "es"); });

    if (!filas.length) {
      var p = document.createElement("p");
      p.className = "text-sm text-brand-450 dark:text-brand-350";
      p.textContent = "Ahora mismo no hay ningún alumno tuyo en la plataforma.";
      cuerpo.appendChild(p);
      /* Los hilos con mensajes sin leer se ofrecen igual: que se haya ido no
         quiere decir que lo que escribió deje de estar ahí. */
    }

    filas.forEach(function (f) { cuerpo.appendChild(filaAlumno(f)); });

    noLeidos.forEach(function (id) {
      if (conectados.has(id) && alumnos.has(id)) return;   // ya está arriba
      cuerpo.appendChild(filaAlumno({
        id: id, nombre: alumnos.get(id) || "Un alumno", pagina: "", desde: null,
      }));
    });
  }

  function filaAlumno(f) {
    var boton = document.createElement("button");
    boton.type = "button";
    boton.dataset.alumno = f.id;
    boton.className = "w-full text-left flex items-center justify-between gap-3 rounded-xl px-3 py-2"
      + " border border-brand-100 dark:border-brand-800 hover:bg-brand-50 dark:hover:bg-brand-800"
      + " focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 transition-colors";

    var izq = document.createElement("span");
    izq.className = "min-w-0";
    var nombre = document.createElement("span");
    nombre.className = "block text-sm font-medium text-brand-700 dark:text-brand-200 truncate";
    // El nombre lo escribe una persona: siempre textContent.
    nombre.textContent = (noLeidos.has(f.id) ? "🔴 " : "") + f.nombre;
    var donde = document.createElement("span");
    donde.className = "block text-xs text-brand-450 dark:text-brand-350 truncate";
    donde.textContent = f.pagina
      ? f.pagina + (f.desde ? " · " + haceCuanto(f.desde) : "")
      : "No está conectado ahora";
    izq.append(nombre, donde);

    var chat = document.createElement("span");
    chat.className = "shrink-0 text-lg";
    chat.setAttribute("aria-hidden", "true");
    chat.textContent = "💬";

    boton.append(izq, chat);
    boton.addEventListener("click", function () { abrirHilo(f.id); });
    return boton;
  }

  async function abrirHilo(id) {
    hilo = id;
    raiz.querySelector("#burbuja-titulo").textContent = esDocente
      ? (alumnos.get(id) || "Un alumno")
      : "Tu profe";
    raiz.querySelector("#burbuja-form").classList.remove("hidden");
    var cuerpo = raiz.querySelector("#burbuja-cuerpo");
    cuerpo.innerHTML = "";
    var cargando = document.createElement("p");
    cargando.className = "text-sm text-brand-450 dark:text-brand-350";
    cargando.textContent = "Cargando la conversación…";
    cuerpo.appendChild(cargando);
    await cargarMensajes();
    var txt = raiz.querySelector("#burbuja-texto");
    if (txt) txt.focus();
  }

  async function cargarMensajes() {
    if (!hilo) return;
    /* "profiles!class_chat_messages_sender_id_fkey": la tabla tiene DOS
       relaciones con profiles (sender_id y student_id), así que hay que
       decirle a PostgREST cuál usar — sin esto la consulta es ambigua y
       falla. Misma línea que el chat de la clase en vivo. */
    var res = await sb.from("class_chat_messages")
      .select("id, body, created_at, sender_id, profiles!class_chat_messages_sender_id_fkey(full_name, email, role, is_admin)")
      .eq("student_id", hilo)
      .order("created_at", { ascending: false })
      .limit(MAX_MENSAJES);
    if (res.error) {
      pintarMensajes(null);
      return;
    }
    mensajes = (res.data || []).slice().reverse();
    pintarMensajes(mensajes);
    if (mensajes.length) marcarLeido(hilo, mensajes[mensajes.length - 1].created_at);
    noLeidos.delete(hilo);
    pintarBoton();
  }

  function pintarMensajes(lista) {
    var cuerpo = raiz.querySelector("#burbuja-cuerpo");
    cuerpo.innerHTML = "";
    if (lista === null) {
      /* Una conversación vacía y una que no se pudo leer se ven igual y son
         cosas muy distintas. */
      var err = document.createElement("p");
      err.className = "text-sm text-red-600 dark:text-red-400";
      err.textContent = "No se pudo cargar la conversación. Vuelve a intentarlo en un momento.";
      cuerpo.appendChild(err);
      return;
    }
    if (!lista.length) {
      var vacio = document.createElement("p");
      vacio.className = "text-sm text-brand-450 dark:text-brand-350";
      vacio.textContent = esDocente
        ? "Todavía no se han escrito nada. Escríbele acá abajo."
        : "Todavía no hay mensajes.";
      cuerpo.appendChild(vacio);
      return;
    }
    lista.forEach(function (m) {
      var mio = m.sender_id === yo.id;
      var p = m.profiles || {};
      var deDocente = p.role === "profesor" || p.is_admin === true;
      var fila = document.createElement("div");
      fila.className = "flex " + (mio ? "justify-end" : "justify-start");
      var burbuja = document.createElement("div");
      burbuja.className = "max-w-[85%] rounded-2xl px-3 py-2 " + (mio
        ? "bg-accent-500 text-brand-900"
        : (deDocente
          ? "bg-brand-100 dark:bg-brand-800 text-brand-700 dark:text-brand-100"
          : "bg-brand-50 dark:bg-brand-800 text-brand-700 dark:text-brand-100"));
      var quien = document.createElement("p");
      quien.className = "text-xs font-semibold mb-0.5 truncate " + (mio ? "text-brand-900" : "text-brand-500 dark:text-brand-300");
      quien.textContent = mio ? "Tú" : nombreDe(p);
      var texto = document.createElement("p");
      texto.className = "text-sm whitespace-pre-wrap break-words";
      // Lo escribe una persona: textContent, nunca innerHTML.
      texto.textContent = m.body;
      burbuja.append(quien, texto);
      fila.appendChild(burbuja);
      cuerpo.appendChild(fila);
    });
    cuerpo.scrollTop = cuerpo.scrollHeight;
  }

  async function enviar(e) {
    e.preventDefault();
    if (!hilo) return;
    var campo = raiz.querySelector("#burbuja-texto");
    var texto = campo.value.trim();
    if (!texto) return;
    campo.value = "";
    var res = await sb.from("class_chat_messages")
      .insert({ sender_id: yo.id, student_id: hilo, body: texto });
    if (res.error) {
      campo.value = texto;   // que no se pierda lo que escribió
      var cuerpo = raiz.querySelector("#burbuja-cuerpo");
      var err = document.createElement("p");
      err.className = "text-sm text-red-600 dark:text-red-400";
      err.textContent = "No se pudo enviar: " + res.error.message;
      cuerpo.appendChild(err);
      cuerpo.scrollTop = cuerpo.scrollHeight;
      return;
    }
    await cargarMensajes();
  }

  // --------------------------------------------------------------- presencia
  function activoAhora() {
    return document.visibilityState === "visible" && (Date.now() - ultimaActividad) < IDLE_MS;
  }

  async function anunciar(canal) {
    /* Lo justo para pintar la fila: el id, el nombre y en qué página anda. NO
       va el correo — el canal lo escucha cualquiera que sepa su nombre, y en
       la Academia son menores de edad. El nombre viaja solo para el caso en
       que la base no lo devuelva; lo que se pinta sale de `profiles`. */
    await canal.track({
      id: yo.id, nombre: yo.nombre, pagina: dondeEstoy(),
      desde: new Date().toISOString(),
    });
  }

  async function latidoPresencia() {
    for (var i = 0; i < canales.length; i++) {
      var c = canales[i];
      try {
        if (activoAhora()) {
          if (!anunciado) await anunciar(c);
        } else if (anunciado) {
          await c.untrack();
        }
      } catch (err) { /* sin red: se reintenta en el latido siguiente */ }
    }
    anunciado = activoAhora();
  }

  function escucharCanal(profesorId) {
    var canal = sb.channel(CANAL + profesorId, { config: { presence: { key: yo.id } } });
    if (esDocente) {
      canal.on("presence", { event: "sync" }, function () {
        var estado = canal.presenceState();
        conectados.clear();
        Object.keys(estado).forEach(function (k) {
          (estado[k] || []).forEach(function (m) {
            if (!m || !m.id || m.id === yo.id) return;
            conectados.set(m.id, { pagina: String(m.pagina || "").slice(0, 60), desde: m.desde });
          });
        });
        resolverNombres();
      });
    }
    canal.subscribe(async function (estado) {
      if (estado !== "SUBSCRIBED") return;
      if (!esDocente && activoAhora()) { await anunciar(canal); anunciado = true; }
    });
    canales.push(canal);
  }

  /* El nombre NO sale del canal: sale de `profiles`, donde la RLS solo le
     devuelve al profesor a sus propios alumnos. Los que no vuelvan no son
     suyos y no se pintan — así un intruso que se anuncie en este canal no
     aparece en la lista, y no se le ofrece un botón que la base iba a
     rechazar. Va acotada con `.in(ids)`: son los conectados de ahora, nunca
     la tabla entera. */
  async function resolverNombres() {
    var faltan = [];
    conectados.forEach(function (_, id) { if (!alumnos.has(id)) faltan.push(id); });
    noLeidos.forEach(function (id) { if (!alumnos.has(id) && faltan.indexOf(id) < 0) faltan.push(id); });
    if (faltan.length) {
      var res = await sb.from("profiles").select("id, full_name, email").in("id", faltan);
      if (!res.error) (res.data || []).forEach(function (p) { alumnos.set(p.id, nombreDe(p)); });
    }
    // Los que el canal trajo y la base no reconoce, fuera de la lista.
    var intrusos = [];
    conectados.forEach(function (_, id) { if (!alumnos.has(id)) intrusos.push(id); });
    intrusos.forEach(function (id) { conectados.delete(id); });

    pintarBoton();
    if (abierta && !hilo) pintarPanel();
  }

  // ------------------------------------------------------------------- el chat
  function escucharMensajes() {
    var canal = sb.channel("burbuja-chat:" + yo.id);
    var opciones = { event: "INSERT", schema: "public", table: "class_chat_messages" };
    // El alumno filtra en el servidor: su hilo es uno solo. El profesor no
    // puede (son N alumnos), así que descarta en el cliente contra la lista
    // que la base le reconoció.
    if (!esDocente) opciones.filter = "student_id=eq." + yo.id;
    canal.on("postgres_changes", opciones, function (payload) {
      var fila = payload["new"];
      if (!fila) return;
      if (fila.sender_id === yo.id) return;              // sale de esta pantalla
      if (esDocente && !alumnos.has(fila.student_id)) {
        /* Un alumno cuyo nombre todavía no se conoce: puede ser uno suyo que
           no estaba conectado, o alguien que no es suyo. La RLS le entrega
           el mensaje solo si es su profesor, así que basta con preguntar el
           nombre: si `profiles` no lo devuelve, no se pinta. */
        noLeidos.add(fila.student_id);
        resolverNombres().then(function () {
          if (!alumnos.has(fila.student_id)) noLeidos.delete(fila.student_id);
          pintarBoton();
          if (abierta && !hilo) pintarPanel();
        });
        return;
      }
      if (hilo === fila.student_id && abierta) { cargarMensajes(); return; }
      noLeidos.add(fila.student_id);
      pintarBoton();
      if (abierta && !hilo) pintarPanel();
    });
    canal.subscribe();
  }

  /* Lo que llegó mientras no estaba: se compara contra la marca de lectura de
     este aparato. Sin esto, la burbuja solo avisaría de lo que pasa con la
     página abierta y el mensaje de ayer no lo vería nadie.

     El alumno filtra por su hilo y por su marca, que es una sola. El profesor
     tiene una marca POR ALUMNO, así que pide las últimas y descarta acá: con
     un `gt` sobre una marca sola se perdería el mensaje viejo de un alumno con
     el que no había hablado nunca. */
  async function revisarPendientes() {
    var q = sb.from("class_chat_messages").select("student_id, created_at, sender_id")
      .order("created_at", { ascending: false }).limit(100);
    if (!esDocente) {
      q = q.eq("student_id", yo.id);
      var desde = leidoHasta(yo.id);
      if (desde) q = q.gt("created_at", desde);
    }
    var res = await q;
    if (res.error) return;
    (res.data || []).forEach(function (m) {
      if (m.sender_id === yo.id) return;
      if (leidoHasta(m.student_id) >= m.created_at) return;
      noLeidos.add(m.student_id);
    });
    if (esDocente && noLeidos.size) await resolverNombres();
    pintarBoton();
  }

  // ---------------------------------------------------------------- arranque
  async function init() {
    sb = window.sb;
    /* Sin `channel` no hay presencia ni avisos, así que no hay burbuja que
       montar: se sale en silencio en vez de reventar más abajo. */
    if (!sb || !sb.from || !sb.channel) return;
    var sesion;
    try {
      var r = await sb.auth.getSession();
      sesion = r && r.data && r.data.session;
    } catch (e) { return; }
    if (!sesion) return;

    var perfil = await sb.from("profiles").select("id, full_name, email, role, is_admin")
      .eq("id", sesion.user.id).single();
    if (perfil.error || !perfil.data) return;
    yo = { id: perfil.data.id, nombre: nombreDe(perfil.data), role: perfil.data.role, is_admin: !!perfil.data.is_admin };
    // La regla permanente de la casa: lo que se hace para los profesores se
    // hace también para quien administra.
    esDocente = yo.role === "profesor" || yo.is_admin;

    construir();

    if (esDocente) {
      escucharCanal(yo.id);
    } else {
      var clases = await sb.rpc("mis_clases");
      if (!clases.error) {
        (clases.data || []).forEach(function (c) { if (c.profesor_id) escucharCanal(c.profesor_id); });
      }
      /* Sin ningún profesor no hay a quién anunciarse ni de quién recibir: la
         burbuja no se pinta y ya. El aviso de "pide que te asignen un
         profesor" ya vive en el panel, que es donde se entra. */
      if (!canales.length) { raiz.remove(); raiz = null; return; }
    }

    escucharMensajes();
    await revisarPendientes();
    pintarBoton();

    ["mousedown", "keydown", "touchstart", "scroll", "click"].forEach(function (evt) {
      document.addEventListener(evt, function () { ultimaActividad = Date.now(); }, { passive: true });
    });
    if (!esDocente) {
      setInterval(latidoPresencia, LATIDO_MS);
      document.addEventListener("visibilitychange", latidoPresencia);
    }
    // Cada minuto se repinta "hace 3 min" si el panel está abierto en la lista.
    setInterval(function () { if (abierta && !hilo && esDocente) pintarPanel(); }, 60000);
  }

  /* La burbuja se agrega a 56 páginas que ya funcionaban, así que su promesa
     es no romper ni ensuciar ninguna: cualquier cosa que falle acá —un `sb`
     recortado, un canal que no se puede abrir, la red— se queda en una línea
     de consola y la burbuja no se monta. Sin esto, un TypeError suyo sale en
     la consola de páginas que no tienen nada que ver, y ahí es donde se
     esconden los errores de verdad. */
  function arrancar() {
    Promise.resolve().then(init).catch(function (e) {
      console.warn("La burbuja de conectados no se pudo montar:", e && e.message);
      if (raiz) { raiz.remove(); raiz = null; }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();

  window.BurbujaEnLinea = {
    /* Para el verificador y para quien quiera abrirla desde otro botón. */
    abrir: function () { if (raiz) abrir(); },
    cerrar: function () { if (raiz) cerrar(); },
  };
})();
