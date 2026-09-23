/**
 * Ajedrez Integral — el "modo de vista" de quien administra.
 *
 * Quien administra necesita ver la plataforma como la ve cada rol —para
 * revisar, corregir o preparar una actualización— sin tener que entrar a la
 * cuenta de otra persona. Este módulo guarda en el APARATO (localStorage) cómo
 * quiere mirar: como administración (lo de siempre), como estudiante, como
 * profesor o como supervisor.
 *
 *     ModoVista.actual()                // "admin" | "alumno" | "profesor" | "supervisor"
 *     ModoVista.perfilVisto(perfil)     // el perfil con el rol del modo puesto
 *
 * LO QUE CAMBIA ES LA PANTALLA, NO LOS PERMISOS. El perfil que devuelve
 * perfilVisto() decide qué menús, tarjetas y paneles se PINTAN; la base sigue
 * viendo a quien administra, así que los datos que aparecen son los de su
 * propia cuenta (o los de toda la plataforma, si la pantalla los pide). La
 * barra de arriba lo dice con esas palabras: prometer que "ves lo que ve
 * Sofía" sería mentir — para eso habría que ser Sofía.
 *
 * Solo tiene efecto sobre una cuenta con is_admin: a cualquier otra
 * perfilVisto() le devuelve su perfil tal cual, aunque en el aparato quedara
 * guardado un modo (una computadora compartida del colegio, por ejemplo).
 *
 * La barra se monta sola en toda página que cargue este archivo (la pone
 * herramientas/academia-cabecera.py) y solo si quien mira administra y está
 * en un modo que no es el suyo.
 */
(function () {
  "use strict";
  if (window.ModoVista) return;

  var CLAVE = "modo_vista_admin_v1";
  var MODOS = {
    admin: "Administración",
    alumno: "Estudiante",
    profesor: "Profesor",
    supervisor: "Supervisor",
  };

  function actual() {
    try {
      var v = localStorage.getItem(CLAVE);
      return MODOS[v] ? v : "admin";
    } catch (e) { return "admin"; }
  }

  function fijar(modo) {
    try {
      if (!MODOS[modo] || modo === "admin") localStorage.removeItem(CLAVE);
      else localStorage.setItem(CLAVE, modo);
    } catch (e) {}
  }

  /* El perfil como lo vería el rol elegido. Se copian todas las columnas y se
     cambian solo las que deciden qué se pinta: role, is_admin, es_coordinador
     y es_supervisor. `_admin_real` queda para quien necesite saber que detrás
     hay una cuenta que administra (la barra, por ejemplo). */
  function perfilVisto(perfil) {
    if (!perfil || !perfil.is_admin) return perfil;
    var modo = actual();
    if (modo === "admin") return perfil;
    var p = Object.assign({}, perfil, { _admin_real: true, _modo_vista: modo,
                                        is_admin: false, es_coordinador: false, es_supervisor: false });
    if (modo === "alumno") p.role = "alumno";
    else if (modo === "profesor") p.role = "profesor";
    else if (modo === "supervisor") { p.role = "profesor"; p.es_supervisor = true; }
    return p;
  }

  function selectorModos(id) {
    var sel = document.createElement("select");
    if (id) sel.id = id;
    sel.className = "px-2 py-1 rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 text-sm text-brand-800 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    Object.keys(MODOS).forEach(function (k) {
      var o = document.createElement("option");
      o.value = k;
      o.textContent = k === "admin" ? "👑 Administración (mi vista)" : "👁 Como " + MODOS[k].toLowerCase();
      sel.appendChild(o);
    });
    sel.value = actual();
    sel.addEventListener("change", function () { fijar(sel.value); location.reload(); });
    return sel;
  }

  /* La franja que dice en qué modo se está mirando. Va arriba del contenido
     y no flotando: es lo primero que tiene que leer quien entra, o se queda
     creyendo que la plataforma "perdió" su panel de administración. */
  function montarBarra() {
    if (document.getElementById("modo-vista-barra")) return;
    var modo = actual();
    if (modo === "admin") return;
    var barra = document.createElement("div");
    barra.id = "modo-vista-barra";
    barra.setAttribute("role", "region");
    barra.setAttribute("aria-label", "Modo de vista de administración");
    barra.className = "bg-accent-500 text-brand-900 text-sm px-4 py-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2";
    var texto = document.createElement("p");
    texto.className = "font-semibold";
    texto.textContent = "👁 Estás viendo la plataforma como " + MODOS[modo].toLowerCase()
      + ". Cambian los menús y las pantallas; los datos siguen siendo los de tu cuenta.";
    var etiqueta = document.createElement("label");
    etiqueta.className = "sr-only";
    etiqueta.setAttribute("for", "modo-vista-sel");
    etiqueta.textContent = "Cambiar el modo de vista";
    var volver = document.createElement("button");
    volver.type = "button";
    volver.className = "font-semibold underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-900 rounded";
    volver.textContent = "Volver a mi vista de administración";
    volver.addEventListener("click", function () { fijar("admin"); location.reload(); });
    barra.append(texto, etiqueta, selectorModos("modo-vista-sel"), volver);
    var main = document.querySelector("main") || document.body;
    main.parentNode.insertBefore(barra, main);
  }

  async function arrancar() {
    if (actual() === "admin") return;
    try {
      var sb = window.sb;
      if (!sb) return;
      var s = await sb.auth.getSession();
      var uid = s && s.data && s.data.session ? s.data.session.user.id : null;
      if (!uid) return;
      var r = await sb.from("profiles").select("is_admin").eq("id", uid).maybeSingle();
      if (r && r.data && r.data.is_admin) montarBarra();
    } catch (e) { /* sin barra: la página sigue igual */ }
  }

  window.ModoVista = {
    MODOS: MODOS,
    actual: actual,
    fijar: fijar,
    perfilVisto: perfilVisto,
    selectorModos: selectorModos,
    montarBarra: montarBarra,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
