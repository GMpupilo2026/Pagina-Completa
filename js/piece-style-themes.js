/* ===== Ajedrez Integral — Estilo de las piezas =====
 * Preferencia por navegador (localStorage), UNA sola lista — a diferencia de
 * los colores, la forma de la pieza no necesita una versión distinta para
 * Modo Adaptado: se aplica igual en los dos modos.
 *
 * "clasico" son los glifos Unicode de siempre (♔♕♖♗♘♙): cada tablero sigue
 * dibujándolos exactamente como antes si se deja este tema elegido (es el
 * valor por defecto, así que no cambia nada para quien no toque esto).
 * "ilustrado" pide al tablero que dibuje la pieza con el set de arte vectorial
 * que ya usan los Cursos (js/chess-piece-svg.js) en vez del glifo de texto.
 *
 * "aro" es el MISMO dibujo, con un aro del color contrario alrededor de cada
 * pieza (negro alrededor de las blancas, blanco alrededor de las negras). Es
 * para el celular con «Texto de alto contraste» encendido (Android, Samsung):
 * ese ajuste repinta TODO texto en blanco con borde negro, y como el glifo
 * ♚ es texto, las piezas negras salen blancas — el tablero se ve y no se sabe
 * de quién es cada pieza. No da ningún error y el sitio no lo puede detectar
 * (no es `forced-colors`), así que se elige a mano. Un dibujo SVG no es texto
 * y ese ajuste no lo toca; el aro es lo que la separa de su casilla sea cual
 * sea el color de esta.
 *
 * Los tableros preguntan esDibujado(), NUNCA por el id: con el id escrito en
 * cada tablero, un tercer estilo dibujado dejaría a la mitad dibujando el
 * glifo sin que nada fallara.
 *
 * Cada tablero decide por su cuenta si sabe dibujar el estilo ilustrado
 * (revisando window.ChessPieceSVG) — este módulo solo guarda la preferencia.
 *
 * El valor POR OMISIÓN depende de la cuenta: a quien da clase (profesor o
 * administración) y al alumno cuya cuenta se creó desde CORTE_ALUMNOS, si en
 * este navegador nunca eligió un estilo, se le deja puesto «Clásico
 * ilustrado» (ver «El estilo por omisión de la cuenta» en
 * docs/decisiones/tableros-y-apariencia.md). Lo que la persona eligió a mano
 * no se toca nunca, y los alumnos de antes siguen con el de siempre.
 */
(function () {
  "use strict";

  const KEY = "piece_style_theme_v1";
  // Para qué cuenta ya se decidió el estilo por omisión en este navegador:
  // así se pregunta a la base una sola vez, y no en cada página.
  const OMISION = "piece_style_omision_v1";
  const OMISION_CUENTA = "ilustrado";
  // Medianoche del 4/10/2026 en Costa Rica: las cuentas de alumno creadas
  // desde ahí son «nuevas».
  const CORTE_ALUMNOS = "2026-10-04T06:00:00Z";

  const THEMES = {
    clasico: { label: "Clásico (símbolos)" },
    ilustrado: { label: "Clásico ilustrado (dibujado)", dibujado: true },
    aro: { label: "Dibujado con aro (celular en alto contraste)", dibujado: true },
  };

  // En Modo Adaptado, quien NUNCA eligió un estilo recibe el dibujado con
  // aro y no el glifo: ese modo se enciende por baja visión, que es justo
  // quien tiene encendido el «Texto de alto contraste» del celular, y ahí el
  // glifo negro sale blanco (con el contorno blanco del modo encima, además,
  // se ve brillando). Lo que la persona eligió a mano se respeta siempre.
  function modoAdaptado() {
    try {
      if (document.documentElement.classList.contains("adaptive-mode")) return true;
      return localStorage.getItem("oscarBlindMode_v1") === "1";
    } catch (e) {
      return false;
    }
  }

  function getPreference() {
    let id = null;
    try {
      id = localStorage.getItem(KEY);
    } catch (e) {}
    if (id && THEMES[id]) return id;
    return modoAdaptado() ? "aro" : "clasico";
  }

  function esDibujado() {
    return !!THEMES[getPreference()].dibujado;
  }

  // El aro lo decide el CSS (html[data-pieza="aro"]), no cada tablero: así
  // sale igual en los diez sin tocar ninguno.
  function aplicar(id) {
    try { document.documentElement.setAttribute("data-pieza", id); } catch (e) {}
  }

  function setPreference(id) {
    if (!THEMES[id]) id = "clasico";
    try {
      localStorage.setItem(KEY, id);
    } catch (e) {}
    aplicar(id);
    return id;
  }

  function eligioAMano() {
    try { return !!THEMES[localStorage.getItem(KEY)]; } catch (e) { return true; }
  }

  function tocaIlustrado(perfil) {
    if (!perfil) return false;
    if (perfil.is_admin === true || perfil.role === "profesor") return true;
    return perfil.role === "alumno" && !!perfil.created_at &&
      new Date(perfil.created_at).getTime() >= new Date(CORTE_ALUMNOS).getTime();
  }

  // Pregunta a la base por la cuenta. Sin sesión, sin conexión o con una
  // elección ya guardada no toca nada. En Modo Adaptado tampoco: ahí el de
  // omisión es el aro, y se vuelve a preguntar cuando se apague.
  function porOmisionDeLaCuenta() {
    if (eligioAMano() || modoAdaptado()) return Promise.resolve(null);
    const sb = window.sb;
    if (!sb || !sb.auth || !sb.from) return Promise.resolve(null);
    return sb.auth.getSession().then(function (r) {
      const sesion = r && r.data && r.data.session;
      if (!sesion || !sesion.user) return null;
      const persona = sesion.user.id;
      try { if (localStorage.getItem(OMISION) === persona) return null; } catch (e) {}
      // MiPerfil reparte la única lectura de `profiles` de la página.
      const lectura = window.MiPerfil ? window.MiPerfil.obtener(persona)
        : sb.from("profiles").select("role, is_admin, created_at").eq("id", persona).maybeSingle();
      return Promise.resolve(lectura).then(function (res) {
        res = res || {};
        if (res.error || !res.data) return null;
        if (eligioAMano() || modoAdaptado()) return null;
        try { localStorage.setItem(OMISION, persona); } catch (e) {}
        if (!tocaIlustrado(res.data)) return null;
        setPreference(OMISION_CUENTA);
        try { document.dispatchEvent(new CustomEvent("piecestyle:change", { detail: { id: OMISION_CUENTA } })); } catch (e) {}
        return OMISION_CUENTA;
      });
    }).catch(function () { return null; });
  }

  aplicar(getPreference());
  // Supabase se carga al final del <body>: recién en DOMContentLoaded está.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", porOmisionDeLaCuenta);
  else porOmisionDeLaCuenta();
  // Encender o apagar el modo cambia el estilo POR OMISIÓN: sin volver a
  // aplicarlo, el aro se quedaría puesto (o sin poner) hasta recargar.
  document.addEventListener("adaptivemode:change", function () {
    aplicar(getPreference());
    porOmisionDeLaCuenta();
  });
  window.PieceStyleThemes = { THEMES, getPreference, setPreference, esDibujado, porOmisionDeLaCuenta, CORTE_ALUMNOS };
})();
