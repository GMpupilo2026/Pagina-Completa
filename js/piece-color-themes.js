/* ===== Ajedrez Integral — Temas de color de las piezas =====
 * Mismo patrón que js/board-color-themes.js, pero para las PIEZAS en vez de
 * las casillas: preferencia por navegador (localStorage, no en el perfil),
 * con dos listas INDEPENDIENTES — una para el tablero normal y otra para
 * cuando Modo Adaptado está activo — porque el par que más ayuda en alto
 * contraste (amarillo y negro) no es el que alguien elegiría por estética en
 * modo normal, y al revés.
 *
 * Cada tema trae, además del color de relleno, el color del CONTORNO
 * (text-shadow) de esa pieza: hoy ese contorno está fijo en css/styles.css
 * (oscuro detrás de las piezas "blancas", claro detrás de las "negras") para
 * que se lea sobre cualquier casilla — al volverse elegible el color de
 * relleno, el contorno tiene que poder cambiar junto con él o un par como
 * "Verde y morado" perdería el contraste que hoy da por sentado.
 *
 * Los colores se aplican como variables CSS (--piece-white, --piece-black,
 * --piece-white-outline, --piece-black-outline, y las mismas 4 con sufijo
 * -adaptive) en <html>, que css/styles.css ya lee con un valor por defecto
 * de respaldo — así una página que no cargue este script se ve exactamente
 * igual que antes.
 *
 * No toca los tableros que no son "blanco contra negro": el de 4 jugadores
 * (rojo/azul/amarillo/verde, js/fourplayer-board.js) y el entrenador de
 * entreno/4x4.html (una sola pieza dorada en pantalla, sin bando).
 *
 * THEMES incluye además tres temas "invertidos" (inv*): la pieza "blanca" usa
 * un color oscuro y la "negra" uno claro, al revés de la convención de
 * siempre — es solo estética, `white`/`black` siguen siendo las claves de
 * SIEMPRE (el bando real de la pieza), lo único que cambia es qué color le
 * toca a cada una.
 *
 * Requiere cargarse antes de cualquier tablero (junto a
 * js/board-color-themes.js, cerca del <head>).
 */
(function () {
  "use strict";

  const KEY = "piece_color_theme_v1";
  const KEY_ADAPTIVE = "piece_color_theme_adaptive_v1";

  const THEMES = {
    clasico: {
      label: "Blanco y negro",
      white: "#ffffff",
      black: "#17202a",
      whiteOutline: "#1e293b",
      blackOutline: "rgba(255, 255, 255, 0.55)",
    },
    azulrojo: {
      label: "Azul y rojo",
      white: "#2563eb",
      black: "#dc2626",
      whiteOutline: "rgba(255, 255, 255, 0.6)",
      blackOutline: "rgba(255, 255, 255, 0.6)",
    },
    verdemorado: {
      label: "Verde y morado",
      white: "#16a34a",
      black: "#7c3aed",
      whiteOutline: "rgba(255, 255, 255, 0.6)",
      blackOutline: "rgba(255, 255, 255, 0.6)",
    },
    // Modo inverso: al revés de la convención de siempre, las piezas "blancas"
    // usan un color OSCURO y las "negras" uno CLARO. El contorno de cada una
    // sigue la misma regla del resto del archivo (pieza clara → contorno
    // oscuro, pieza oscura → contorno claro), solo que ahora le toca a la
    // pieza contraria.
    invclasico: {
      label: "Invertido: blancas oscuras",
      white: "#1e293b",
      black: "#f8f5ef",
      whiteOutline: "rgba(255, 255, 255, 0.6)",
      blackOutline: "#1e293b",
    },
    invazulambar: {
      label: "Invertido: azul y ámbar",
      white: "#1e3a5f",
      black: "#fde68a",
      whiteOutline: "rgba(255, 255, 255, 0.6)",
      blackOutline: "#1f2937",
    },
    invvinomenta: {
      label: "Invertido: vino y menta",
      white: "#5b1a35",
      black: "#bbf7d0",
      whiteOutline: "rgba(255, 255, 255, 0.6)",
      blackOutline: "#1f2937",
    },
  };

  // Los tres de acá van pensados para Modo Adaptado: el contorno siempre es
  // sólido (no semitransparente) porque ahí el objetivo es el máximo
  // contraste posible, no verse "bonito".
  const ADAPTIVE_THEMES = {
    clasico: {
      label: "Blanco y negro (alto contraste)",
      white: "#ffffff",
      black: "#000000",
      whiteOutline: "#000000",
      blackOutline: "#ffffff",
    },
    amarillonegro: {
      label: "Amarillo y negro",
      white: "#fde047",
      black: "#000000",
      whiteOutline: "#000000",
      blackOutline: "#fde047",
    },
    blancomorado: {
      label: "Blanco y morado",
      white: "#ffffff",
      black: "#7c3aed",
      whiteOutline: "#000000",
      blackOutline: "#ffffff",
    },
  };

  function readKey(key, themes) {
    let id = "clasico";
    try {
      id = localStorage.getItem(key) || "clasico";
    } catch (e) {}
    return themes[id] ? id : "clasico";
  }
  function writeKey(key, id, themes) {
    if (!themes[id]) id = "clasico";
    try {
      localStorage.setItem(key, id);
    } catch (e) {}
    return id;
  }

  function getPreference() {
    return readKey(KEY, THEMES);
  }
  function getAdaptivePreference() {
    return readKey(KEY_ADAPTIVE, ADAPTIVE_THEMES);
  }

  function apply() {
    const theme = THEMES[getPreference()];
    const adaptiveTheme = ADAPTIVE_THEMES[getAdaptivePreference()];
    const root = document.documentElement.style;
    root.setProperty("--piece-white", theme.white);
    root.setProperty("--piece-black", theme.black);
    root.setProperty("--piece-white-outline", theme.whiteOutline);
    root.setProperty("--piece-black-outline", theme.blackOutline);
    root.setProperty("--piece-white-adaptive", adaptiveTheme.white);
    root.setProperty("--piece-black-adaptive", adaptiveTheme.black);
    root.setProperty("--piece-white-outline-adaptive", adaptiveTheme.whiteOutline);
    root.setProperty("--piece-black-outline-adaptive", adaptiveTheme.blackOutline);
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

  // Aplica de una vez, antes de que cualquier tablero dibuje sus piezas
  // (este script se carga en el <head>, junto a board-color-themes.js).
  apply();

  window.PieceColorThemes = {
    THEMES,
    ADAPTIVE_THEMES,
    getPreference,
    setPreference,
    getAdaptivePreference,
    setAdaptivePreference,
  };
})();
