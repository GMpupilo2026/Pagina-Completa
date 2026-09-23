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
      blackOutline: "transparent",
    },
    azulrojo: {
      label: "Azul y rojo",
      white: "#2563eb",
      black: "#dc2626",
      whiteOutline: "rgba(255, 255, 255, 0.6)",
      blackOutline: "transparent",
    },
    verdemorado: {
      label: "Verde y morado",
      white: "#16a34a",
      black: "#7c3aed",
      whiteOutline: "rgba(255, 255, 255, 0.6)",
      blackOutline: "transparent",
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
      blackOutline: "transparent",
    },
    amarillonegro: {
      label: "Amarillo y negro",
      white: "#fde047",
      black: "#000000",
      whiteOutline: "#000000",
      blackOutline: "transparent",
    },
    blancomorado: {
      label: "Blanco y morado",
      white: "#ffffff",
      black: "#7c3aed",
      whiteOutline: "#000000",
      blackOutline: "transparent",
    },
  };

  // "personalizado": el color de cada bando elegido con el selector de
  // Configuración. Solo en modo normal, como las casillas (ver
  // js/board-color-themes.js). El CONTORNO no se elige: se calcula del
  // relleno con la misma regla de toda la tabla de arriba — pieza clara,
  // contorno oscuro; pieza oscura, contorno claro —, que es lo que la separa
  // de cualquier casilla. Dejarlo fijo haría que una pieza blanca pintada de
  // azul marino perdiera su borde contra la casilla oscura, sin ningún error.
  const PERSONALIZADO = "personalizado";
  const KEY_CUSTOM = "piece_color_custom_v1";
  const CUSTOM_DEFAULT = { white: "#ffffff", black: "#17202a" };
  const HEX = /^#[0-9a-f]{6}$/i;

  function luminancia(hex) {
    const c = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  // Contra negro (#000) o blanco: gana el que más contraste le dé al relleno.
  function contornoPara(hex) {
    const l = luminancia(hex);
    return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#1e293b" : "rgba(255, 255, 255, 0.7)";
  }

  // Las piezas negras van SIN borde: el contorno claro que traían se veía
  // como un halo blanco alrededor de cada pieza negra, y es lo que se pidió
  // quitar. Solo lo conserva una "negra" pintada de color CLARO (los temas
  // invertidos, o un color a tu gusto claro): ahí el borde oscuro es lo único
  // que la separa de la casilla clara, y no es el halo del que se habla.
  const SIN_BORDE = "transparent";
  function contornoNegras(hex) {
    const c = contornoPara(hex);
    return c === "#1e293b" ? c : SIN_BORDE;
  }

  function getCustom() {
    let c = null;
    try {
      c = JSON.parse(localStorage.getItem(KEY_CUSTOM) || "null");
    } catch (e) {}
    const white = c && HEX.test(c.white) ? c.white : CUSTOM_DEFAULT.white;
    const black = c && HEX.test(c.black) ? c.black : CUSTOM_DEFAULT.black;
    return {
      label: "A tu gusto",
      white,
      black,
      whiteOutline: contornoPara(white),
      blackOutline: contornoNegras(black),
    };
  }

  function readKey(key, themes) {
    let id = "clasico";
    try {
      id = localStorage.getItem(key) || "clasico";
    } catch (e) {}
    if (id === PERSONALIZADO && key === KEY) return id;
    return themes[id] ? id : "clasico";
  }
  function writeKey(key, id, themes) {
    if (!themes[id] && !(id === PERSONALIZADO && key === KEY)) id = "clasico";
    try {
      localStorage.setItem(key, id);
    } catch (e) {}
    return id;
  }

  function getPreference() {
    return readKey(KEY, THEMES);
  }
  // "auto" en Modo Adaptado = no se eligió nada en esa lista. Ver apply().
  const AUTO = "auto";
  function explicito(key) {
    try {
      return localStorage.getItem(key) != null;
    } catch (e) {
      return false;
    }
  }
  function getAdaptivePreference() {
    return explicito(KEY_ADAPTIVE) ? readKey(KEY_ADAPTIVE, ADAPTIVE_THEMES) : AUTO;
  }

  // Lo que el alumno eligió NO lo cambia el Modo Adaptado, que se enciende
  // solo (con el primer Tab): la lista de ese modo manda solo si se eligió algo
  // EN ELLA. Si no, se queda el color elegido arriba; y si arriba tampoco se
  // eligió nada, el blanco y negro de alto contraste de siempre del modo.
  function apply() {
    const pref = getPreference();
    const theme = pref === PERSONALIZADO ? getCustom() : THEMES[pref];
    const adapt = getAdaptivePreference();
    const adaptiveTheme = adapt !== AUTO
      ? ADAPTIVE_THEMES[adapt]
      : explicito(KEY) ? theme : ADAPTIVE_THEMES.clasico;
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
    if (id === AUTO) {
      try {
        localStorage.removeItem(KEY_ADAPTIVE);
      } catch (e) {}
    } else {
      id = writeKey(KEY_ADAPTIVE, id, ADAPTIVE_THEMES);
    }
    apply();
    return id;
  }

  function setCustom(white, black) {
    const actual = getCustom();
    const c = {
      white: HEX.test(white || "") ? white.toLowerCase() : actual.white,
      black: HEX.test(black || "") ? black.toLowerCase() : actual.black,
    };
    try {
      localStorage.setItem(KEY_CUSTOM, JSON.stringify(c));
    } catch (e) {}
    return setPreference(PERSONALIZADO);
  }

  // Aplica de una vez, antes de que cualquier tablero dibuje sus piezas
  // (este script se carga en el <head>, junto a board-color-themes.js).
  apply();

  window.PieceColorThemes = {
    AUTO,
    THEMES,
    ADAPTIVE_THEMES,
    PERSONALIZADO,
    getCustom,
    setCustom,
    getPreference,
    setPreference,
    getAdaptivePreference,
    setAdaptivePreference,
  };
})();
