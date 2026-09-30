// Configuración del cliente de Supabase para Ajedrez Integral · Clases.
// La "anon key" es pública por diseño: el acceso real se controla con
// Row Level Security (RLS) en las tablas `profiles` y `game_state`.
//
// La librería se sirve desde `js/vendor/`, no desde un CDN. Estaba pedida como
// `@supabase/supabase-js@2` —un RANGO, sin `integrity`— en las 77 páginas que
// la cargan, o sea que el navegador se bajaba lo que hubiera publicado ahí en
// ese momento y lo ejecutaba con la sesión de quien entrara, administración
// incluida. Un paquete malo río arriba, o el CDN comprometido un rato, se
// llevaba el sitio entero y no habría dado ningún error: las páginas seguirían
// viéndose igual. Con el archivo en el repositorio, lo que corre es lo que está
// commiteado, y actualizarlo es un commit que se lee en el diff.
// Se actualiza con `node herramientas/vendor.js`, que lo copia de
// node_modules y deja escrita la versión; `verificar-vendor.js` comprueba que
// nadie haya vuelto a meter el CDN.
window.SUPABASE_URL = "https://bgtijpimpcokxatxxbki.supabase.co";
window.SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJndGlqcGltcGNva3hhdHh4YmtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5ODczMjksImV4cCI6MjEwNDU2MzMyOX0.h-AcAEQNaYMVo5UVtdWqUCTYgiSLFKDgXsn3lnbAhmQ";

// Un solo cliente por página. Dos son dos suscripciones de auth y dos juegos de
// canales de Realtime sobre la misma sesión, que no falla: simplemente llegan
// las cosas dos veces. Y de paso los verificadores pueden poner el suyo antes
// de que la página cargue, sin depender —como hasta ahora— de que esta línea
// reventara por no encontrar la librería.
if (!window.sb) {
  window.sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
}

// La llave de los cursos. El contenido completo (cursos/protegido/) y el
// material (cursos/recursos/) los cuida worker.js, que para dejarlos pasar
// necesita ver la sesión — y la sesión vive en localStorage, adonde el servidor
// no llega. Por eso se copia el token de acceso a una cookie que el navegador
// manda SOLO a /cursos/: el worker le pregunta a Supabase si vale y si el
// acceso a la Academia está vigente (acceso_vigente()). Es el mismo token que
// ya está en localStorage, así que no se expone nada que no estuviera.
//
// Se escribe en tres momentos, porque cualquiera que falte deja a una cuenta
// válida sin su material y sin ningún error a la vista:
//   · al cargar, con lo que haya guardado (si no venció);
//   · en cada cambio de sesión (entrar, renovar el token, salir);
//   · justo antes de pedir un fragmento (SesionCursos.guardar(session)), para
//     no depender del orden en que Supabase avisa de la renovación.
window.SesionCursos = (function () {
  var NOMBRE = "ai_sesion_cursos";
  var seguro = location.protocol === "https:" ? "; Secure" : "";
  function borrar() {
    try { document.cookie = NOMBRE + "=; Path=/cursos/; Max-Age=0; SameSite=Lax" + seguro; } catch (e) { }
  }
  function guardar(session) {
    try {
      if (!session || !session.access_token) return borrar();
      var quedan = Math.floor((session.expires_at || 0) - Date.now() / 1000);
      if (quedan <= 0) return borrar();
      document.cookie = NOMBRE + "=" + session.access_token +
        "; Path=/cursos/; Max-Age=" + quedan + "; SameSite=Lax" + seguro;
    } catch (e) { }
  }
  return { guardar: guardar, borrar: borrar };
})();

// El perfil propio, UNA lectura por página. En la hora pico del 29 de
// setiembre, cada carga pedía la misma fila de `profiles` cuatro veces —la
// página con select("*"), y juego-aviso.js, burbuja-en-linea.js y
// ayuda-guia.js cada uno con sus columnas—: ~1500 de los 13 600 pedidos de esa
// hora. Todos preguntan por la fila de quien entró, así que se pide entera una
// vez y se reparte. A cada uno le toca su propia copia: si una página le
// cambia algo a su perfil en memoria, no se lo cambia a las demás. Si la
// lectura falla, no se guarda, y el siguiente vuelve a intentar.
// Se olvida al entrar, al salir o al cambiar la cuenta.
window.MiPerfil = (function () {
  var guardado = {};
  function copia(r) {
    return { data: r.data ? Object.assign({}, r.data) : r.data, error: r.error };
  }
  function obtener(uid) {
    if (!uid || !window.sb) return Promise.resolve({ data: null, error: null });
    if (!guardado[uid]) {
      guardado[uid] = Promise.resolve(window.sb.from("profiles").select("*").eq("id", uid).maybeSingle())
        .then(function (r) {
          r = r || { data: null, error: null };
          if (r.error || !r.data) delete guardado[uid];
          return r;
        }, function (e) { delete guardado[uid]; throw e; });
    }
    return guardado[uid].then(copia);
  }
  function olvidar() { guardado = {}; }
  return { obtener: obtener, olvidar: olvidar };
})();

(function () {
  try {
    // La clave con que supabase-js guarda la sesión: sb-<proyecto>-auth-token.
    var proyecto = window.SUPABASE_URL.replace(/^https:\/\/([^.]+)\..*$/, "$1");
    var guardada = JSON.parse(localStorage.getItem("sb-" + proyecto + "-auth-token") || "null");
    if (guardada && guardada.access_token) window.SesionCursos.guardar(guardada);
  } catch (e) { }
  // El doble de un verificador puede no traer onAuthStateChange, y una página
  // no puede caerse por esto.
  try {
    if (window.sb && window.sb.auth && typeof window.sb.auth.onAuthStateChange === "function") {
      window.sb.auth.onAuthStateChange(function (evento, session) {
        window.SesionCursos.guardar(session);
        if (evento === "SIGNED_OUT" || evento === "SIGNED_IN" || evento === "USER_UPDATED") window.MiPerfil.olvidar();
      });
    }
  } catch (e) { }
})();
