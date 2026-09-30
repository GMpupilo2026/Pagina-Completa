/* ===== La burbuja de "quién está conectado" =====
 *
 * Una burbuja flotante, abajo a la derecha, en las páginas de la Academia.
 * SOLO dice quién está conectado: quien da clase ve CUÁNTOS de sus alumnos
 * están en la plataforma ahora mismo, quiénes son y en qué página andan. No
 * lleva chat: se quitó a pedido del dueño del sitio (el chat sigue en la
 * clase en vivo, `sesion.html`).
 *
 * El alumno no ve nada: solo se anuncia, sin ningún botón en su pantalla.
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
 * el de la base, no el del canal**. Un intruso no aparece.
 *
 * ---------------------------------------------------------------------------
 * "CONECTADO" QUIERE DECIR LO MISMO QUE EN EL RESTO DEL SITIO
 *
 * Tener la pestaña abierta no es estar. `js/tiempo-plataforma.js` ya decidió
 * hace tiempo qué cuenta como activo —60 segundos sin un clic, una tecla o un
 * scroll, o la pestaña de fondo— y acá se usa EL MISMO número: al pasar de
 * ahí se deja de anunciar, y al volver la actividad se vuelve a anunciar. Si
 * no, la burbuja diría "3 conectados" de gente que dejó la página abierta y se
 * fue.
 *
 * ---------------------------------------------------------------------------
 * QUIEN ADMINISTRA ESCUCHA EL CANAL DE CADA PROFESOR
 *
 * Nadie se anuncia en el canal de quien administra (no es profesor de nadie),
 * así que escuchando solo el suyo la burbuja le decía "0 alumnos en línea"
 * con la Academia llena. Escucha el de cada profesor —son canales que ya
 * existen; no se abre ninguno global— y junta a todos en una sola lista. Lo
 * que ve lo ve igual en `profiles`, así que no se le reparte nada nuevo.
 *
 * ---------------------------------------------------------------------------
 * EN LA CLASE EN VIVO EL ALUMNO SE ANUNCIA, AUNQUE NO SE PINTE NADA
 *
 * `sesion.html` no lleva la burbuja visible (tiene su propia lista), pero el
 * alumno que está en la clase SÍ está conectado: sin anunciarse ahí, la
 * burbuja decía "0" justo cuando más gente había. Allá va con
 * `data-solo-anunciar`: no se pinta nada para nadie, el alumno se anuncia
 * como "Clase en vivo" y cuenta como conectado aunque no toque nada — mirar
 * y escuchar la clase es estar, la misma regla de `class_presence_log`.
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
  var TOPE_CANALES = 90;      // el Realtime de Supabase deja 100 por cliente

  var script = document.currentScript;
  var soloAnunciar = !!(script && script.hasAttribute("data-solo-anunciar"));

  var sb = null;
  var yo = null;              // {id, nombre, role, is_admin}
  var esDocente = false;
  var canales = [];           // los de presencia
  var conectados = new Map(); // id -> {pagina, desde}
  var alumnos = new Map();    // id -> nombre, SEGÚN LA BASE (no según el canal)
  var abierta = false;
  var ultimaActividad = Date.now();
  var anunciado = false;
  var raiz = null;

  // --------------------------------------------------------------- utilidades
  var nombreDe = function (p) {
    return (p && (p.full_name || "").trim()) || (p && p.email) || "Alguien";
  };

  /* En qué página estoy, en palabras. Sale del <title>, que ya está escrito
     para leerse; el pathname diría "entreno/4x4.html", que no le dice nada a
     quien lo lee. Se recorta el sufijo del sitio, que se repite en los 76. */
  function dondeEstoy() {
    if (soloAnunciar) return "Clase en vivo";
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
      '    <h2 id="burbuja-titulo" class="font-serif text-base font-bold text-brand-700 dark:text-brand-100">Conectados ahora</h2>',
      '    <button type="button" id="burbuja-cerrar" class="text-brand-450 dark:text-brand-350 hover:text-brand-700 dark:hover:text-brand-100 text-xl leading-none w-8 h-8 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400" aria-label="Cerrar">&times;</button>',
      '  </div>',
      '  <ul id="burbuja-cuerpo" class="flex-1 overflow-y-auto px-4 py-3 space-y-2"></ul>',
      '</div>',
      '<button type="button" id="burbuja-boton" class="flex items-center gap-2 bg-brand-800 hover:bg-brand-700 text-white',
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
    /* Escape cierra y devuelve el foco al botón: un panel que se cierra
       dejando el foco en la nada deja perdido a quien usa teclado. */
    raiz.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && abierta) { e.stopPropagation(); cerrar(); }
    });
  }

  function abrir() {
    abierta = true;
    raiz.querySelector("#burbuja-panel").classList.remove("hidden");
    raiz.querySelector("#burbuja-boton").setAttribute("aria-expanded", "true");
    pintarPanel();
  }

  function cerrar() {
    abierta = false;
    raiz.querySelector("#burbuja-panel").classList.add("hidden");
    var b = raiz.querySelector("#burbuja-boton");
    b.setAttribute("aria-expanded", "false");
    b.focus();
  }

  // ------------------------------------------------------------------ pintado
  /* La burbuja se le queda SIEMPRE a quien da clase: el conteo es el dato, y
     "ahora mismo no hay nadie" también es una respuesta. */
  function pintarBoton() {
    var n = conectados.size;
    raiz.querySelector("#burbuja-etiqueta").textContent =
      n === 1 ? "1 alumno en línea" : n + " alumnos en línea";
  }

  function pintarPanel() {
    var cuerpo = raiz.querySelector("#burbuja-cuerpo");
    cuerpo.innerHTML = "";

    var filas = [];
    conectados.forEach(function (d, id) {
      if (alumnos.has(id)) filas.push({ id: id, nombre: alumnos.get(id), pagina: d.pagina, desde: d.desde });
    });
    filas.sort(function (a, b) { return a.nombre.localeCompare(b.nombre, "es"); });

    if (!filas.length) {
      var p = document.createElement("li");
      p.className = "text-sm text-brand-450 dark:text-brand-350";
      p.textContent = "Ahora mismo no hay ningún alumno tuyo en la plataforma.";
      cuerpo.appendChild(p);
      return;
    }
    filas.forEach(function (f) { cuerpo.appendChild(filaAlumno(f)); });
  }

  function filaAlumno(f) {
    var fila = document.createElement("li");
    fila.dataset.alumno = f.id;
    fila.className = "rounded-xl px-3 py-2 border border-brand-100 dark:border-brand-800";
    var nombre = document.createElement("span");
    nombre.className = "block text-sm font-medium text-brand-700 dark:text-brand-200 truncate";
    // El nombre lo escribe una persona: siempre textContent.
    nombre.textContent = f.nombre;
    var donde = document.createElement("span");
    donde.className = "block text-xs text-brand-450 dark:text-brand-350 truncate";
    donde.textContent = (f.pagina || "La Academia") + (f.desde ? " · " + haceCuanto(f.desde) : "");
    fila.append(nombre, donde);
    return fila;
  }

  // --------------------------------------------------------------- presencia
  function activoAhora() {
    if (soloAnunciar) return true;   // en la clase, estar es estar
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
        juntarConectados();
        resolverNombres();
      });
    }
    canal.subscribe(async function (estado) {
      if (estado !== "SUBSCRIBED") return;
      if (!esDocente && activoAhora()) { await anunciar(canal); anunciado = true; }
    });
    canales.push(canal);
  }

  /* La lista se arma con TODOS los canales que se escuchan, no con el que
     acaba de sincronizar: quien administra escucha varios, y vaciarla en cada
     sync dejaría solo a los alumnos del último profesor que habló. Un alumno
     con dos profesores sale una vez, con su anuncio más reciente. */
  function juntarConectados() {
    conectados.clear();
    canales.forEach(function (c) {
      var estado = c.presenceState() || {};
      Object.keys(estado).forEach(function (k) {
        (estado[k] || []).forEach(function (m) {
          if (!m || !m.id || m.id === yo.id) return;
          var ya = conectados.get(m.id);
          if (ya && String(ya.desde || "") >= String(m.desde || "")) return;
          conectados.set(m.id, { pagina: String(m.pagina || "").slice(0, 60), desde: m.desde });
        });
      });
    });
  }

  /* El nombre NO sale del canal: sale de `profiles`, donde la RLS solo le
     devuelve al profesor a sus propios alumnos. Los que no vuelvan no son
     suyos y no se pintan — así un intruso que se anuncie en este canal no
     aparece en la lista. Va acotada con `.in(ids)`: son los conectados de
     ahora, nunca la tabla entera. */
  async function resolverNombres() {
    var faltan = [];
    conectados.forEach(function (_, id) { if (!alumnos.has(id)) faltan.push(id); });
    if (faltan.length) {
      var res = await sb.from("profiles").select("id, full_name, email").in("id", faltan);
      if (!res.error) (res.data || []).forEach(function (p) { alumnos.set(p.id, nombreDe(p)); });
    }
    // Los que el canal trajo y la base no reconoce, fuera de la lista.
    var intrusos = [];
    conectados.forEach(function (_, id) { if (!alumnos.has(id)) intrusos.push(id); });
    intrusos.forEach(function (id) { conectados.delete(id); });

    pintarBoton();
    if (abierta) pintarPanel();
  }

  // ---------------------------------------------------------------- arranque
  async function init() {
    sb = window.sb;
    /* Sin `channel` no hay presencia, así que no hay burbuja que montar: se
       sale en silencio en vez de reventar más abajo. */
    if (!sb || !sb.from || !sb.channel) return;
    var sesion;
    try {
      var r = await sb.auth.getSession();
      sesion = r && r.data && r.data.session;
    } catch (e) { return; }
    if (!sesion) return;

    var perfil = window.MiPerfil ? await window.MiPerfil.obtener(sesion.user.id)
      : await sb.from("profiles").select("id, full_name, email, role, is_admin").eq("id", sesion.user.id).single();
    if (perfil.error || !perfil.data) return;
    yo = { id: perfil.data.id, nombre: nombreDe(perfil.data), role: perfil.data.role, is_admin: !!perfil.data.is_admin };
    // La regla permanente de la casa: lo que se hace para los profesores se
    // hace también para quien administra.
    esDocente = yo.role === "profesor" || yo.is_admin;
    // En la clase en vivo, quien da clase ya tiene su lista: nada que hacer.
    if (soloAnunciar && esDocente) return;

    ["mousedown", "keydown", "touchstart", "scroll", "click"].forEach(function (evt) {
      document.addEventListener(evt, function () { ultimaActividad = Date.now(); }, { passive: true });
    });

    if (esDocente) {
      construir();
      pintarBoton();
      escucharCanal(yo.id);
      /* Quien administra escucha además el canal de cada profesor: a él no
         se le anuncia nadie. La RLS le deja ver a todos en `profiles`. */
      if (yo.is_admin) {
        var profes = await sb.from("profiles").select("id").eq("role", "profesor");
        if (!profes.error) {
          (profes.data || []).forEach(function (p) {
            if (p.id !== yo.id && canales.length < TOPE_CANALES) escucharCanal(p.id);
          });
        }
      }
      // Cada minuto se repinta "hace 3 min" si el panel está abierto.
      setInterval(function () { if (abierta) pintarPanel(); }, 60000);
      return;
    }

    /* El alumno no ve nada: solo se anuncia a cada profesor suyo. Sin ningún
       profesor no hay a quién anunciarse y no se hace nada. */
    var clases = await sb.rpc("mis_clases");
    if (!clases.error) {
      (clases.data || []).forEach(function (c) { if (c.profesor_id) escucharCanal(c.profesor_id); });
    }
    if (!canales.length) return;
    setInterval(latidoPresencia, LATIDO_MS);
    document.addEventListener("visibilitychange", latidoPresencia);
  }

  /* La burbuja va en decenas de páginas que ya funcionaban, así que su
     promesa es no romper ni ensuciar ninguna: cualquier cosa que falle acá
     —un `sb` recortado, un canal que no se puede abrir, la red— se queda en
     una línea de consola y la burbuja no se monta. Sin esto, un TypeError
     suyo sale en la consola de páginas que no tienen nada que ver, y ahí es
     donde se esconden los errores de verdad. */
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
