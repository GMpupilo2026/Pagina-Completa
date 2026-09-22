/* ===== Ajedrez Integral — Temas de TODA la plataforma =====
 *
 * Los temas que ya tenía el sitio (js/board-themes.js, js/board-color-themes.js,
 * js/piece-color-themes.js, js/piece-style-themes.js) cambian el TABLERO. Este
 * cambia la plataforma entera: el color del encabezado, de las tarjetas, de los
 * botones, de los textos y de los enlaces en las 100 páginas, más el color de
 * las casillas y la decoración. "Princesas" no es un tablero rosado: es el
 * sitio rosado.
 *
 * Se pudo hacer porque la paleta dejó de estar compilada a mano dentro de cada
 * clase de Tailwind y pasó a ser VARIABLES CSS (ver herramientas/css-construir.js):
 * `bg-brand-800` vale `rgb(var(--c-brand-800))`, así que un tema solo redefine
 * esa variable y cambian de una vez las 2.628 veces que esa clase aparece
 * escrita en el sitio. Sin eso habría que editar las 100 páginas por tema.
 *
 * ESTE ARCHIVO ES LA ÚNICA FUENTE, y corre en los dos lados: lo lee
 * herramientas/css-construir.js con `require` para escribir las variables de
 * cada tema dentro de css/tailwind.css, y lo lee el navegador para pintar la
 * rejilla de Configuración. Escrito dos veces se separarían a la primera
 * corrección, y el síntoma sería de los callados: la vista previa de
 * Configuración enseñando un rosa y la plataforma pintando otro.
 *
 * NINGUNA PALETA SE ELIGIÓ A OJO. Cada tono tiene EXACTAMENTE la misma
 * luminancia WCAG que el tono equivalente del tema Clásico, así que los 49
 * pares de color que el sitio usa de verdad (texto brand-600 sobre blanco,
 * brand-300 sobre brand-900, brand-900 sobre accent-500…) dan el mismo
 * contraste en todos los temas: ninguno puede quedar por debajo de AA "porque
 * quedaba más bonito". Lo comprueba herramientas/verificar-temas-plataforma.js,
 * y es la razón por la que acá van los hex escritos y no una cuenta en tiempo
 * de ejecución: el número que se verificó es el que se pinta.
 *
 * Es una preferencia POR NAVEGADOR (localStorage), como el modo claro/oscuro,
 * el Modo Adaptado y los temas de tablero: es de dónde se está mirando, no de
 * quién mira. No se sincroniza con la cuenta a propósito — la misma decisión
 * que ya toma js/progreso-usuario.js con el tema.
 */
(function () {
  "use strict";

  const KEY = "plataforma_tema_v1";
  // La fuente decorativa se guarda APARTE, y no es una segunda fuente de
  // verdad: es una copia que deja este archivo para que el script del <head>
  // (ver herramientas/tema-cabecera.py) pueda pedir la fuente sin bajarse esta
  // tabla entera en las 100 páginas. Quien la escribe es siempre `aplicar()`.
  const KEY_FUENTE = "plataforma_tema_fuente_v1";
  const POR_OMISION = "clasico";

  const TEMAS = {
    clasico: {
      label: "Clásico",
      icono: "♟️",
      descripcion: "El azul y el ámbar de siempre.",
      brand: { 50: "#f0f4f8", 100: "#d9e2ec", 200: "#bcccdc", 300: "#9fb3c8", 350: "#8aa1b8", 400: "#627d98", 450: "#55708a", 500: "#486581", 600: "#334e68", 700: "#243b53", 800: "#102a43", 900: "#0a1f33", 950: "#071527" },
      accent: { 50: "#fffbea", 100: "#fdf3c7", 300: "#f7c948", 400: "#f0b429", 500: "#de911d", 600: "#cb6e17", 700: "#a85a0d", 900: "#7a3f06" },
      casillas: "clasico",
    },
    princesas: {
      label: "Princesas",
      icono: "👑",
      descripcion: "Rosados y dorados, con corazones de fondo y letra redondeada.",
      brand: { 50: "#fbf0f5", 100: "#f6dae6", 200: "#efbcd3", 300: "#e69abb", 350: "#de82a9", 400: "#c84f83", 450: "#bd3c74", 500: "#aa3668", 600: "#832c51", 700: "#63213e", 800: "#47172c", 900: "#371021", 950: "#280b17" },
      accent: { 50: "#fefaf2", 100: "#fcf1d9", 300: "#f8c959", 400: "#f5b317", 500: "#d19811", 600: "#ac7e13", 700: "#8e6811", 900: "#654a0b" },
      casillas: "rosado",
      casillasAdaptado: "rosadonegro",
      fuente: "Quicksand",
      decorado: "corazones",
    },
    unicornio: {
      label: "Unicornios",
      icono: "🦄",
      descripcion: "Lilas y turquesa, con estrellitas y letra redondeada.",
      brand: { 50: "#f7f1fb", 100: "#ebdbf6", 200: "#ddc0f0", 300: "#cba0e7", 350: "#bd89e0", 400: "#9f5dcc", 450: "#954ac6", 500: "#8a3cbd", 600: "#6a3090", 700: "#50256e", 800: "#3a194f", 900: "#2b123d", 950: "#1f0c2b" },
      accent: { 50: "#eefefd", 100: "#cffbf8", 300: "#0ae6d8", 400: "#09d5c7", 500: "#0fb5a9", 600: "#11968e", 700: "#0f7c74", 900: "#0a5953" },
      casillas: "lila",
      casillasAdaptado: "moradoclaro",
      fuente: "Quicksand",
      decorado: "estrellas",
    },
    sirenas: {
      label: "Sirenas",
      icono: "🧜‍♀️",
      descripcion: "Turquesas y coral, con burbujas y letra redondeada.",
      brand: { 50: "#e8f6f8", 100: "#c0e8ef", 200: "#8cd6e4", 300: "#53bfd4", 350: "#34adc5", 400: "#2f8596", 450: "#2a7686", 500: "#266a78", 600: "#1f535d", 700: "#173f46", 800: "#102d32", 900: "#0b2125", 950: "#07171a" },
      accent: { 50: "#fef9f8", 100: "#fdefeb", 300: "#fcc2b0", 400: "#faab92", 500: "#f28361", 600: "#e7562a", 700: "#c54018", 900: "#8f2d10" },
      casillas: "turquesa",
      fuente: "Quicksand",
      decorado: "burbujas",
    },
    galaxia: {
      label: "Galaxia",
      icono: "🌌",
      descripcion: "Violetas de noche con estrellas doradas.",
      brand: { 50: "#f5f2fb", 100: "#e5ddf7", 200: "#d1c3f1", 300: "#baa7e9", 350: "#aa92e2", 400: "#8767cf", 450: "#7a57ca", 500: "#6f49c6", 600: "#5636a1", 700: "#41297a", 800: "#2f1c5a", 900: "#231445", 950: "#190d33" },
      accent: { 50: "#fefaee", 100: "#fbf3d0", 300: "#f6cb1e", 400: "#e5b90a", 500: "#c19e10", 600: "#a08412", 700: "#836c10", 900: "#5e4d0a" },
      casillas: "morado",
      decorado: "estrellas",
    },
    bosque: {
      label: "Bosque",
      icono: "🌳",
      descripcion: "Verdes y ámbar, con hojas de fondo.",
      brand: { 50: "#e5f8ee", 100: "#b7edd0", 200: "#74dea6", 300: "#32c878", 350: "#30b36d", 400: "#2c8b58", 450: "#277b4e", 500: "#237047", 600: "#1d5637", 700: "#16412a", 800: "#0f2f1e", 900: "#0a2315", 950: "#07180f" },
      accent: { 50: "#fefaf5", 100: "#fcf1e0", 300: "#f9c67a", 400: "#f7b046", 500: "#e28f12", 600: "#ba7815", 700: "#996313", 900: "#6d470c" },
      casillas: "verde",
      decorado: "hojas",
    },
    dragones: {
      label: "Dragones",
      icono: "🐉",
      descripcion: "Rojos y naranjas de fuego.",
      brand: { 50: "#fbf1f0", 100: "#f5dbd9", 200: "#efbeb9", 300: "#e59f98", 350: "#dd887e", 400: "#c7584c", 450: "#ba483b", 500: "#a84035", 600: "#80332b", 700: "#622721", 800: "#461b16", 900: "#361310", 950: "#270d0a" },
      accent: { 50: "#fefbf7", 100: "#fdf1e4", 300: "#fac58f", 400: "#f9ae64", 500: "#ed8924", 600: "#c96f16", 700: "#a45c14", 900: "#76410d" },
      casillas: "fuego",
      decorado: "escamas",
    },
  };

  function getPreference() {
    let id = POR_OMISION;
    try {
      id = localStorage.getItem(KEY) || POR_OMISION;
    } catch (e) {}
    return TEMAS[id] ? id : POR_OMISION;
  }

  /* Pone el atributo en <html>, que es lo único que decide qué paleta pinta:
   * las variables de cada tema viven en css/tailwind.css bajo
   * :root[data-tema="<id>"]. Un id que no exista no pinta nada y la plataforma
   * se ve como siempre, así que un valor raro en localStorage no rompe nada. */
  function aplicar() {
    const id = getPreference();
    const tema = TEMAS[id];
    const html = document.documentElement;
    if (id === POR_OMISION) html.removeAttribute("data-tema");
    else html.setAttribute("data-tema", id);

    try {
      if (tema.fuente) localStorage.setItem(KEY_FUENTE, tema.fuente);
      else localStorage.removeItem(KEY_FUENTE);
    } catch (e) {}
    pedirFuente(tema.fuente);
    pintarBarra(tema);
    return id;
  }

  /* La fuente decorativa se baja SOLO si el tema elegido la pide. Declararla
   * en el <head> de las 100 páginas la bajaría siempre, también a quien no
   * eligió ningún tema — y este sitio ya recortó las fuentes a los pesos que
   * de verdad usa (ver «Metadatos» en CLAUDE.md). */
  function pedirFuente(familia) {
    if (!familia || typeof document === "undefined") return;
    const id = "tema-fuente-" + familia.replace(/[^A-Za-z]/g, "");
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=" +
      encodeURIComponent(familia).replace(/%20/g, "+") +
      ":wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }

  /* El color de la barra del sistema en el celular (la app instalada) lo pone
   * herramientas/pwa-cabecera.py con el azul de siempre escrito a mano: con un
   * tema puesto quedaría una barra azul encima de un encabezado rosado. */
  function pintarBarra(tema) {
    if (typeof document === "undefined") return;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", tema.brand[800]);
  }

  function setPreference(id) {
    if (!TEMAS[id]) id = POR_OMISION;
    try {
      localStorage.setItem(KEY, id);
    } catch (e) {}
    aplicar();
    return id;
  }

  const API = { TEMAS, POR_OMISION, KEY, KEY_FUENTE, getPreference, setPreference, aplicar };

  // Corre en el navegador Y en Node (herramientas/css-construir.js y su
  // verificador lo cargan con require para no volver a escribir las paletas).
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof window !== "undefined") {
    window.TemasPlataforma = API;
    if (typeof document !== "undefined") aplicar();
  }
})();
