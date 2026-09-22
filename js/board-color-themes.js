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

  function readKey(key, themes) {
    let id = AUTO;
    try {
      id = localStorage.getItem(key) || AUTO;
    } catch (e) {}
    return themes[id] || id === AUTO ? id : AUTO;
  }
  function writeKey(key, id, themes) {
    if (!themes[id]) id = AUTO;
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

  function apply() {
    const root = document.documentElement.style;
    escribir(root, ["--sq-light", "--sq-dark"], THEMES[getPreference()]);
    escribir(root, ["--sq-light-adaptive", "--sq-dark-adaptive"],
             ADAPTIVE_THEMES[getAdaptivePreference()]);
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

  const API = {
    AUTO,
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
