/* ===== Ajedrez Integral — Temas de piezas para los tableros de Clases =====
 * Preferencia puramente visual y por navegador (como girar el tablero o
 * mostrar coordenadas): se guarda en localStorage, no en el perfil del
 * servidor, así que cada quien la elige para SU pantalla sin afectar lo que
 * ven los demás ni la posición real de la partida.
 *
 * "clasico" son los glifos Unicode de siempre (♔♕♖♗♘♙): ClasesBoard los seguirá
 * dibujando exactamente como antes. Cualquier otro tema sustituye la pieza por
 * un emoji dentro de una ficha de color (blanca o negra) para poder distinguir
 * el bando sin depender de un glifo distinto por color.
 *
 * Requiere que este script se cargue antes que js/clases-board.js.
 */
(function () {
  "use strict";

  const KEY = "board_theme_v1";

  const THEMES = {
    clasico: {
      label: "Clásico",
      icon: "♟️",
      pieces: null, // null = usar los glifos de ajedrez de siempre
    },
    pokemon: {
      label: "Pokémon",
      icon: "⚡",
      // Cada tipo de pieza como una "criatura" reconocible por su rol en el tablero
      // en vez de íconos genéricos de fantasía: rey = dragón (el más fuerte), dama =
      // eléctrico (el más veloz y peligroso), torre = tortuga (fortaleza con caparazón),
      // alfil = zorro (astuto, se mueve en diagonal), caballo = rana (avanza a saltos,
      // como el salto en L del caballo), peón = huevo (la forma básica, antes de
      // "evolucionar" al coronar).
      pieces: { k: "🐉", q: "⚡", r: "🐢", b: "🦊", n: "🐸", p: "🥚" },
    },
    minerales: {
      label: "Minerales",
      icon: "💎",
      pieces: { k: "💎", q: "🔮", r: "⛰️", b: "🧊", n: "⚱️", p: "🪨" },
    },
    lego: {
      label: "Lego",
      icon: "🧱",
      pieces: { k: "👑", q: "🧩", r: "🧱", b: "🔺", n: "🤖", p: "🟦" },
    },
    harrypotter: {
      label: "Magos",
      icon: "🪄",
      pieces: { k: "🧙", q: "🪄", r: "🏰", b: "🦉", n: "🧹", p: "📖" },
    },
  };

  function getPreference() {
    let id = "clasico";
    try { id = localStorage.getItem(KEY) || "clasico"; } catch (e) {}
    return THEMES[id] ? id : "clasico";
  }

  function setPreference(id) {
    if (!THEMES[id]) id = "clasico";
    try { localStorage.setItem(KEY, id); } catch (e) {}
    return id;
  }

  // Devuelve el emoji para ese tipo de pieza en el tema activo, o null si el
  // tema activo es "clasico" (o el tema no define ese tipo) — quien llama debe
  // entonces dibujar el glifo de ajedrez normal.
  function getEmoji(type) {
    const theme = THEMES[getPreference()];
    if (!theme || !theme.pieces) return null;
    return theme.pieces[type] || null;
  }

  window.BoardThemes = { THEMES, getPreference, setPreference, getEmoji };
})();
