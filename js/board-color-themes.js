/* ===== Ajedrez Integral — Temas de color del tablero =====
 * Preferencia puramente visual y por navegador (como el tema de piezas de
 * js/board-themes.js, o girar el tablero): se guarda en localStorage, no en
 * el perfil del servidor. Elige de qué color son las casillas claras y
 * oscuras de TODOS los tableros del sitio (Clases, Crazyhouse, Tablero,
 * Entreno) — no cambia la posición ni afecta lo que ven los demás.
 *
 * Hay dos preferencias INDEPENDIENTES, cada una con su propia lista de
 * temas: una para el tablero normal y otra para cuando Modo Adaptado está
 * activo. Modo Adaptado necesita colores de alto contraste (para baja
 * visión) que no tendrían sentido como opción "linda" en modo normal, y al
 * revés: un tema de madera o verde no aporta nada en Modo Adaptado. Cada
 * quien puede tener elegido un tema distinto para cada uno.
 *
 * Los colores se aplican como variables CSS (--sq-light, --sq-dark,
 * --sq-light-adaptive, --sq-dark-adaptive) en <html>, para que cualquier
 * tablero del sitio los use sin importar cómo dibuja sus casillas (clase
 * CSS con el color fijo, o clase de Tailwind con un valor arbitrario como
 * bg-[var(--sq-light)]) — cambiar el tema solo cambia el valor de la
 * variable, no hace falta tocar el HTML/JS de cada tablero.
 *
 * Requiere que este script se cargue antes de dibujar cualquier tablero
 * (junto a js/adaptive-mode.js, cerca del <head>), para que las casillas
 * salgan ya con el color elegido desde el primer dibujo.
 */
(function () {
  "use strict";

  const KEY = "board_color_theme_v1";
  const KEY_ADAPTIVE = "board_color_theme_adaptive_v1";

  // Los dos "Celular" existen para baja visión con el celular al sol o con el
  // brillo al máximo. Los pares de arriba de alto contraste fallan justo ahí
  // por la PIEZA, no por la casilla: con una casilla casi blanca la pieza
  // blanca da 1:1 contra ella, y con una casilla negra la pieza negra también
  // — se ve el tablero y desaparecen las piezas. El brillo del celular aplana
  // además los tonos pastel, y la casilla clara se confunde con la blanca.
  //
  // Por eso las dos casillas van en tono MEDIO (ninguna casi blanca ni casi
  // negra) y de colores opuestos: medido con la fórmula de WCAG, cada pieza
  // queda a 3:1 o más contra las DOS casillas (el mínimo para un objeto
  // gráfico), cuando el blanco y negro de siempre deja una de las dos en 1:1.
  // Ámbar contra azul y turquesa contra vino son pares que se siguen
  // distinguiendo con daltonismo (rojo-verde), porque se separan también en
  // claridad y no solo en tono. El número se calculó, no se eligió a ojo:
  //   ámbar/azul        blanca 3.16 y 5.57 · negra 6.65 y 3.77
  //   turquesa/vino     blanca 3.03 y 6.55 · negra 6.93 y 3.21
  const CELULAR = {
    celularambar: { label: "Celular: ámbar y azul", light: "#c8820c", dark: "#3a66b8" },
    celularturquesa: { label: "Celular: turquesa y vino", light: "#2fa2b2", dark: "#9b3a6a" },
  };

  const THEMES = {
    clasico: { label: "Clásico", light: "#f0f4f8", dark: "#486581" },
    madera: { label: "Madera", light: "#f0d9b5", dark: "#b58863" },
    verde: { label: "Verde", light: "#eeeed2", dark: "#769656" },
    azul: { label: "Azul", light: "#dee3e6", dark: "#4b7399" },
    morado: { label: "Morado", light: "#e8dcf5", dark: "#7c5cbf" },
    negro: { label: "Negro", light: "#e5e5e5", dark: "#2b2b2b" },
    moradooscuro: { label: "Morado oscuro y negro", light: "#9333ea", dark: "#000000" },
    moradoclaro: { label: "Morado claro y negro", light: "#e9d5ff", dark: "#000000" },
    // Estos cuatro entraron con los temas de plataforma (js/temas-plataforma.js):
    // son los que propone cada tema, y siguen estando acá para poder elegirlos
    // a mano con cualquier tema puesto.
    rosado: { label: "Rosado", light: "#ffe4f1", dark: "#d3608f" },
    lila: { label: "Lila", light: "#f0e4ff", dark: "#9a6fc4" },
    turquesa: { label: "Turquesa", light: "#e0f7fa", dark: "#4a9aa8" },
    fuego: { label: "Rojo y arena", light: "#f7e6d8", dark: "#b9563f" },
    ...CELULAR,
  };

  // El de alto contraste (blanco y negro) es justo lo que pidió el profesor
  // para reemplazar el blanco/magenta de antes, que no se leía como "casilla
  // negra" y no daba tanto contraste como podría para baja visión.
  const ADAPTIVE_THEMES = {
    clasico: { label: "Clásico adaptado", light: "#ffffff", dark: "#d946ef" },
    altocontraste: { label: "Alto contraste", light: "#ffffff", dark: "#0a0a0a" },
    amarillo: { label: "Amarillo y negro", light: "#fef9c3", dark: "#000000" },
    moradoclaro: { label: "Morado claro y negro", light: "#e9d5ff", dark: "#000000" },
    morado: { label: "Morado y negro", light: "#c084fc", dark: "#000000" },
    moradooscuro: { label: "Morado oscuro y negro", light: "#9333ea", dark: "#000000" },
    rosadonegro: { label: "Rosado y negro", light: "#ffd6e8", dark: "#000000" },
    ...CELULAR,
  };

  // "auto" es lo que trae cualquiera que nunca haya elegido, y quiere decir
  // "el color que proponga el tema de plataforma" (ver js/temas-plataforma.js):
  // Princesas pone las casillas rosadas, Bosque verdes. NO se resuelve acá
  // preguntándole a esa tabla, que este script no carga en las páginas con
  // tablero: se resuelve por CASCADA. Con "auto" no se escribe ninguna
  // variable en línea, así que manda la que definió el tema en
  // css/tailwind.css (y sin tema, la del :root de css/styles.css, que es el
  // Clásico de siempre). Elegir un color a mano lo escribe en línea sobre
  // <html>, y un estilo en línea gana sobre cualquier hoja: la elección
  // explícita de cada quien nunca la pisa un tema.
  const AUTO = "auto";

  // "personalizado" son los dos colores que la persona eligió con el
  // selector de color de Configuración, casilla por casilla. SOLO en modo
  // normal: Modo Adaptado se queda con su lista de pares ya medidos, porque
  // ahí un par elegido a ojo es justo lo que puede dejar las piezas sin verse.
  // No va dentro de THEMES a propósito: esa tabla la leen css-construir.js y
  // verificar-temas-plataforma.js, y un "tema" cuyos colores cambian según el
  // navegador no es una fila que se pueda compilar ni verificar.
  const PERSONALIZADO = "personalizado";
  const KEY_CUSTOM = "board_color_custom_v1";
  const CUSTOM_DEFAULT = { light: "#f0d9b5", dark: "#b58863" };
  const HEX = /^#[0-9a-f]{6}$/i;

  function getCustom() {
    let c = null;
    try {
      c = JSON.parse(localStorage.getItem(KEY_CUSTOM) || "null");
    } catch (e) {}
    return {
      label: "A tu gusto",
      light: c && HEX.test(c.light) ? c.light : CUSTOM_DEFAULT.light,
      dark: c && HEX.test(c.dark) ? c.dark : CUSTOM_DEFAULT.dark,
    };
  }

  function readKey(key, themes) {
    let id = AUTO;
    try {
      id = localStorage.getItem(key) || AUTO;
    } catch (e) {}
    if (id === PERSONALIZADO && key === KEY) return id;
    return themes[id] || id === AUTO ? id : AUTO;
  }
  function writeKey(key, id, themes) {
    if (!themes[id] && !(id === PERSONALIZADO && key === KEY)) id = AUTO;
    try {
      if (id === AUTO) localStorage.removeItem(key);
      else localStorage.setItem(key, id);
    } catch (e) {}
    return id;
  }

  function getPreference() {
    return readKey(KEY, THEMES);
  }
  function getAdaptivePreference() {
    return readKey(KEY_ADAPTIVE, ADAPTIVE_THEMES);
  }

  // Con "auto" se QUITA la variable en línea en vez de no ponerla: hace falta
  // para el camino de vuelta — quien tenía Madera elegido y pasa a "Como el
  // tema" se quedaría con la madera escrita en línea, pisando al tema para
  // siempre y sin ningún error a la vista.
  function escribir(root, nombres, theme) {
    if (!theme) {
      nombres.forEach((n) => root.removeProperty(n));
      return;
    }
    root.setProperty(nombres[0], theme.light);
    root.setProperty(nombres[1], theme.dark);
  }

  // Lo que el alumno eligió NO lo cambia el Modo Adaptado. Ese modo se enciende
  // solo (con el primer Tab, o por el contraste del sistema), así que con su
  // lista mandando siempre, el tablero que alguien se había armado cambiaba de
  // color de un momento a otro sin que tocara nada. La lista de Modo Adaptado
  // manda solo si se eligió algo EN ELLA; si no, en Modo Adaptado se queda lo
  // de arriba. Y solo si tampoco se eligió nada arriba quedan los colores de
  // siempre del modo.
  function apply() {
    const root = document.documentElement.style;
    const pref = getPreference();
    const normal = pref === PERSONALIZADO ? getCustom() : THEMES[pref];
    const adapt = getAdaptivePreference();
    escribir(root, ["--sq-light", "--sq-dark"], normal);
    escribir(root, ["--sq-light-adaptive", "--sq-dark-adaptive"],
             adapt === AUTO ? normal : ADAPTIVE_THEMES[adapt]);
  }

  function setPreference(id) {
    id = writeKey(KEY, id, THEMES);
    apply();
    return id;
  }
  function setAdaptivePreference(id) {
    id = writeKey(KEY_ADAPTIVE, id, ADAPTIVE_THEMES);
    apply();
    return id;
  }

  // Guarda los dos colores elegidos y los deja puestos: elegir un color en el
  // selector ES elegir "a tu gusto", no un paso más que haya que recordar.
  function setCustom(light, dark) {
    const actual = getCustom();
    const c = {
      light: HEX.test(light || "") ? light.toLowerCase() : actual.light,
      dark: HEX.test(dark || "") ? dark.toLowerCase() : actual.dark,
    };
    try {
      localStorage.setItem(KEY_CUSTOM, JSON.stringify(c));
    } catch (e) {}
    return setPreference(PERSONALIZADO);
  }

  const API = {
    AUTO,
    PERSONALIZADO,
    getCustom,
    setCustom,
    THEMES,
    ADAPTIVE_THEMES,
    getPreference,
    setPreference,
    getAdaptivePreference,
    setAdaptivePreference,
  };

  // Las dos tablas las lee también herramientas/css-construir.js con `require`,
  // para escribir en css/tailwind.css el color de casillas que propone cada
  // tema de plataforma: una lista de colores copiada allá se iría separando de
  // esta a la primera corrección.
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof window !== "undefined") {
    window.BoardColorThemes = API;
    // Aplica de una vez, antes de que cualquier tablero dibuje sus casillas
    // (este script se carga en el <head>, junto a adaptive-mode.js).
    if (typeof document !== "undefined") apply();
  }
})();
