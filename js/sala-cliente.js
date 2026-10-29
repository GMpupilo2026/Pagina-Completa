/* El cliente de la sala de arena (sala.html).

   La sala es APARTE de la Academia: sus jugadores viven en el proyecto «Base de
   Colegios», no en el de la Academia, así que acá NO se carga
   js/supabase-client.js (que arma `window.sb` contra la Academia) sino este
   archivo, que arma `window.sbSala` contra el otro proyecto.

   La clave de abajo es la «publishable» de ese proyecto: es pública por diseño
   (ya está escrita en inscripcion.html). Lo que decide quién ve y escribe qué
   son la RLS y las funciones `arena_*` de la base, no esta clave.

   La sesión se guarda con su propio nombre (`sb-sala-auth`): con el de siempre,
   entrar a la sala cerraría la sesión de la Academia en el mismo navegador, y
   al revés.

   El usuario se vuelve un correo que nunca recibe nada (el dominio no tiene MX
   a propósito); es el mismo que arma la Edge Function `arena-admin` al crear
   la cuenta. verificar-sala.js comprueba que los dos digan lo mismo. */
window.SALA = {
  URL: "https://prcfbzvshnusisczlpxl.supabase.co",
  KEY: "sb_publishable_jZ-HV-E6d8zUfeA5ruTLvg_tHsYYllZ",
  DOMINIO: "sala.ajedrez-integral.com",
  correoDe: function (usuario) {
    return String(usuario || "").trim().toLowerCase() + "@" + window.SALA.DOMINIO;
  },
};

// Un solo cliente por página. Los verificadores ponen el suyo antes de cargar.
if (!window.sbSala) {
  window.sbSala = window.supabase.createClient(window.SALA.URL, window.SALA.KEY, {
    auth: { storageKey: "sb-sala-auth", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
}
