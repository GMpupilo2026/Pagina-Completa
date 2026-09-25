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
 *
 * «VER COMO» UNA PERSONA. Quien supervisa (y quien administra) puede mirar el
 * panel de UNO de sus profesores o coordinadores para revisarlo:
 *
 *     ModoVista.persona()               // {id, nombre, es_coordinador, de} | null
 *     ModoVista.fijarPersona(p, miId)   // p de personas_para_ver_como(); null la quita
 *
 * Tampoco entra a su cuenta: la sesión sigue siendo la de quien mira. Lo que
 * cambia es que las pantallas que lo saben (el panel e Informes) piden SUS
 * números a funciones de la base que preguntan antes si quien llama lo
 * supervisa: panel_profesor_de(), funciones_coordinador_de() y
 * alumnos_de_para_ver_como(). La persona se guarda con el id de quien la
 * eligió (`de`), así una computadora compartida no le deja a la siguiente
 * cuenta mirando a alguien.
 */
(function () {
  "use strict";
  if (window.ModoVista) return;

  var CLAVE = "modo_vista_admin_v1";
  var CLAVE_PERSONA = "ver_como_persona_v1";
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
      localStorage.removeItem(CLAVE_PERSONA);
      if (!MODOS[modo] || modo === "admin") localStorage.removeItem(CLAVE);
      else localStorage.setItem(CLAVE, modo);
    } catch (e) {}
  }

  function persona() {
    try {
      var p = JSON.parse(localStorage.getItem(CLAVE_PERSONA) || "null");
      return p && typeof p.id === "string" && typeof p.de === "string" ? p : null;
    } catch (e) { return null; }
  }

  /* Mirar a una persona deja el modo de rol en «admin»: son dos formas de
     mirar y no se suman (¿«como estudiante» el panel de un profesor?). */
  function fijarPersona(p, miId) {
    try {
      if (!p || !miId) { localStorage.removeItem(CLAVE_PERSONA); return; }
      localStorage.removeItem(CLAVE);
      localStorage.setItem(CLAVE_PERSONA, JSON.stringify({
        id: p.id, nombre: p.nombre || "", es_coordinador: !!p.es_coordinador, de: miId,
      }));
    } catch (e) {}
  }

  /* La persona que ESTA cuenta está mirando, o null. Solo cuenta si la eligió
     ella y si administra o supervisa: a cualquier otra cuenta no le cambia
     nada, aunque quedara guardada en el aparato. */
  function personaDe(perfil) {
    var p = persona();
    if (!p || !perfil || p.de !== perfil.id) return null;
    return perfil.is_admin || perfil.es_supervisor ? p : null;
  }

  /* El perfil como lo vería el rol elegido. Se copian todas las columnas y se
     cambian solo las que deciden qué se pinta: role, is_admin, es_coordinador
     y es_supervisor. `_admin_real` queda para quien necesite saber que detrás
     hay una cuenta que administra (la barra, por ejemplo). */
  function perfilVisto(perfil) {
    var p0 = personaDe(perfil);
    if (p0) {
      /* El id sigue siendo el de quien mira, a propósito: lo que la página
         escriba con profile.id se escribe a su nombre (y la base rechaza lo
         que no le toca), nunca al de la persona. Sus datos se piden con
         `_persona.id`, explícito, a las funciones que lo permiten. */
      return Object.assign({}, perfil, {
        _persona: p0, _admin_real: !!perfil.is_admin, _supervisor_real: !!perfil.es_supervisor,
        full_name: p0.nombre, role: "profesor", is_admin: false, es_supervisor: false,
        es_coordinador: !!p0.es_coordinador,
      });
    }
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

  /* El selector de personas: «Mi vista» y, agrupados, los coordinadores y los
     profesores que devuelve personas_para_ver_como(). Sin nadie, no se pinta
     (devuelve null): un selector con una sola opción no ofrece nada. */
  async function selectorPersonas(sb, miId, id) {
    var r = await sb.rpc("personas_para_ver_como");
    var lista = (r && r.data) || [];
    if (r.error || !lista.length) return null;
    var sel = document.createElement("select");
    if (id) sel.id = id;
    sel.className = "px-2 py-1 rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 text-sm text-brand-800 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    var mia = document.createElement("option");
    mia.value = "";
    mia.textContent = "Mi vista";
    sel.appendChild(mia);
    [["Coordinadores", true], ["Profesores", false]].forEach(function (g) {
      var deGrupo = lista.filter(function (x) { return !!x.es_coordinador === g[1]; });
      if (!deGrupo.length) return;
      var og = document.createElement("optgroup");
      og.label = g[0];
      deGrupo.forEach(function (x) {
        var o = document.createElement("option");
        o.value = x.id;
        o.textContent = "👁 " + (x.nombre || "Sin nombre");
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    var actualP = persona();
    sel.value = actualP && actualP.de === miId && lista.some(function (x) { return x.id === actualP.id; }) ? actualP.id : "";
    sel.addEventListener("change", function () {
      fijarPersona(lista.find(function (x) { return x.id === sel.value; }) || null, miId);
      location.reload();
    });
    sel._personas = lista;
    return sel;
  }

  /* La franja de «Ver como» una persona: de quién es el panel y qué no cambia. */
  function montarBarraPersona(p) {
    if (document.getElementById("modo-vista-barra")) return;
    var barra = document.createElement("div");
    barra.id = "modo-vista-barra";
    barra.setAttribute("role", "region");
    barra.setAttribute("aria-label", "Ver como otra persona");
    barra.className = "bg-accent-500 text-brand-900 text-sm px-4 py-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2";
    var texto = document.createElement("p");
    texto.className = "font-semibold";
    texto.textContent = "👁 Estás viendo el panel de " + (p.nombre || "otra persona")
      + (p.es_coordinador ? " (coordinación)" : " (profesor)")
      + ". Sus números y sus alumnos en Informes son los suyos; lo que abras o guardes se hace con tu cuenta.";
    var volver = document.createElement("button");
    volver.type = "button";
    volver.className = "font-semibold underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-900 rounded";
    volver.textContent = "Volver a mi vista";
    volver.addEventListener("click", function () { fijarPersona(null); location.reload(); });
    barra.append(texto, volver);
    var main = document.querySelector("main") || document.body;
    main.parentNode.insertBefore(barra, main);
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
    if (actual() === "admin" && !persona()) return;
    try {
      var sb = window.sb;
      if (!sb) return;
      var s = await sb.auth.getSession();
      var uid = s && s.data && s.data.session ? s.data.session.user.id : null;
      if (!uid) return;
      var r = await sb.from("profiles").select("id, is_admin, es_supervisor").eq("id", uid).maybeSingle();
      var yo = r && r.data;
      if (!yo) return;
      var p = personaDe(yo);
      if (p) montarBarraPersona(p);
      else if (yo.is_admin && actual() !== "admin") montarBarra();
    } catch (e) { /* sin barra: la página sigue igual */ }
  }

  window.ModoVista = {
    MODOS: MODOS,
    actual: actual,
    fijar: fijar,
    perfilVisto: perfilVisto,
    persona: persona,
    personaDe: personaDe,
    fijarPersona: fijarPersona,
    selectorModos: selectorModos,
    selectorPersonas: selectorPersonas,
    montarBarra: montarBarra,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
