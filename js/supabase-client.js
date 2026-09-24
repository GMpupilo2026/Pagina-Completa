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
