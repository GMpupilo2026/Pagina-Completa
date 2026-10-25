#!/usr/bin/env node
/* La plantilla de las páginas de los torneos universitarios
 * (cenfotec-2026.html, utn-2026.html, …): cada una sale de su configuración
 * en herramientas/torneos-universitarios/<página>.js, y este script escribe
 * la página y su js/<config>.js (window.TorneoPagina, con las ediciones
 * anteriores).
 *
 *     node herramientas/torneo-universitario.js             # las escribe todas
 *     node herramientas/torneo-universitario.js utn-2026    # solo esa
 *     node herramientas/torneo-universitario.js --comprobar # falla si alguna está vieja
 *
 * Para el próximo torneo: copiar la configuración de uno parecido, cambiarle
 * los datos (los de su ficha de chess-results, nunca inventados), poner su
 * logo en img/<universidad>/ y sus colores medidos en css/universidades.css,
 * correr este script y agregar su portada en PORTADAS de js/salas-torneo.js.
 * Después, los generadores de siempre (sitemap, archivos-catalogo).
 *
 * Las páginas NO se editan a mano: herramientas/verificar-plantilla-universitaria.js
 * falla si una no es lo que sale de su configuración. Los bloques que ponen
 * otros generadores (`<!-- app: inicio -->…<!-- app: fin -->`, el tema, las
 * fuentes, el modo oscuro, el pie legal) se toman de la página que ya está,
 * así este script y aquellos no se pisan.
 *
 * Ver «La plantilla de las páginas universitarias» en
 * docs/decisiones/juegos-y-torneos.md.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const CARPETA = path.join(__dirname, "torneos-universitarios");

// Lo que se escribe en el HTML desde la configuración va escapado; los campos
// que terminan en «Html» (un párrafo con <strong>, el cuerpo de un diálogo
// propio) van tal cual: los escribe quien arma la configuración, no la gente.
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Los bloques de los otros generadores, como los dejan ellos. Si la página ya
// existe, se conservan los suyos (ver la cabecera).
const BLOQUES = {
  oscuro: "<script>(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark');}catch(e){}})();</script>",
  app: '<meta name="theme-color" content="#102a43"><link rel="manifest" href="/manifest.json"><link rel="apple-touch-icon" href="/img/app/apple-touch-icon.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Ajedrez"><script src="js/errores.js"></script><script src="js/pwa.js" defer></script><script src="js/navegacion.js" defer></script>',
  fuentes: '<link rel="stylesheet" href="css/fuentes.css">',
  tema: "<script>(function(){try{var l=localStorage.getItem('plataforma_letra_v1');if(l&&/^[a-z]{2,24}$/.test(l)&&l!=='tema')document.documentElement.setAttribute('data-letra',l);var t=localStorage.getItem('plataforma_tema_v1');if(!t||!/^[a-z]{2,24}$/.test(t)||t==='clasico')return;document.documentElement.setAttribute('data-tema',t);var b=getComputedStyle(document.documentElement).getPropertyValue('--c-brand-800').trim();var m=document.querySelector('meta[name=\"theme-color\"]');if(b&&m)m.setAttribute('content','rgb('+b.replace(/\\s+/g,',')+')');}catch(e){}})();</script>",
  legal: '<p class="mt-2"><a href="privacidad.html" class="underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">Política de privacidad</a> <span aria-hidden="true">·</span> <a href="terminos.html" class="underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">Términos y condiciones</a></p>',
};
const bloque = (nombre) => "<!-- " + nombre + ": inicio -->" + BLOQUES[nombre] + "<!-- " + nombre + ": fin -->";

function conservarBloques(nuevo, viejo) {
  if (!viejo) return nuevo;
  // Los que van juntos al final del <head>, en el orden en que los dejaron
  // (cada generador pone el suyo donde le toca).
  const FINAL_HEAD = /(?:<!-- ([a-z-]+): inicio -->[\s\S]*?<!-- \1: fin -->)+<\/head>/;
  const m = viejo.match(FINAL_HEAD);
  if (m) nuevo = nuevo.replace(FINAL_HEAD, () => m[0]);
  return nuevo.replace(/<!-- ([a-z-]+): inicio -->[\s\S]*?<!-- \1: fin -->/g, (todo, nombre) => {
    const m = viejo.match(new RegExp("<!-- " + nombre + ": inicio -->[\\s\\S]*?<!-- " + nombre + ": fin -->"));
    return m ? m[0] : todo;
  });
}

// Un comentario de HTML con sus líneas sangradas como las demás.
const comentario = (texto, sangria) => {
  if (!texto) return "";
  const lineas = String(texto).trim().split("\n");
  return sangria + "<!-- " + lineas.map((l, i) => (i ? sangria + "     " : "") + l).join("\n") + " -->\n";
};

const anillo = (c, n) => "focus:outline-none focus-visible:ring-" + n + " focus-visible:ring-[" + c.foco + "]";
const accion = (c, href, texto, emoji) => '<a href="' + esc(href) + '" class="cac-accion underline underline-offset-2 hover:no-underline rounded ' + anillo(c, 2) + '">'
  + (emoji ? '<span aria-hidden="true">' + emoji + " </span>" : "") + esc(texto) + " →</a>";

// Un enlace que se abre encima (js/ventana-enlace.js): `ventana` es el título
// del recuadro; `externo` lo deja, además, en otra pestaña sin JavaScript.
function atributosEnlace(f) {
  let a = 'href="' + esc(f.href) + '"';
  if (f.id) a += ' id="' + esc(f.id) + '"';
  if (f.externo) a += ' target="_blank" rel="noopener"';
  if (f.ventana) a += ' data-ventana="' + esc(f.ventana) + '"';
  return a;
}

// En el celular van de a dos: con un número impar, la última ocupa la fila.
function ficha(c, f, ultimaSola) {
  return '                <li' + (ultimaSola ? ' class="col-span-2 lg:col-span-1"' : "") + ">\n"
    + "                    <a " + atributosEnlace(f) + ' data-color="' + esc(f.color) + '" class="cac-ficha h-full flex flex-col rounded-3xl bg-white dark:bg-brand-900 shadow-md p-4 sm:p-6 ' + anillo(c, 4) + '">\n'
    + '                        <span class="cac-icono" aria-hidden="true">' + f.icono + "</span>\n"
    + '                        <span class="mt-3 font-extrabold text-base sm:text-lg leading-snug text-brand-800 dark:text-white">' + esc(f.titulo) + "</span>\n"
    + '                        <span class="hidden sm:block mt-1 text-sm text-brand-600 dark:text-brand-300 flex-1">' + esc(f.texto) + "</span>\n"
    + '                        <span class="mt-auto pt-3 sm:pt-4 text-xs sm:text-sm font-bold cac-accion">' + esc(f.accion) + " →</span>\n"
    + "                    </a>\n"
    + "                </li>\n";
}

// El marco de todos los recuadros de la página: título con su emoji, «Cerrar»
// y el cuerpo.
function dialogo(d) {
  const ancho = d.ancho || "max-w-3xl";
  return comentario(d.comentario, "    ")
    + '    <dialog id="' + d.id + '" class="ficha-dialogo w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] ' + ancho + ' max-h-[90vh] rounded-2xl shadow-2xl p-0 bg-brand-50 dark:bg-brand-950 text-brand-800 dark:text-brand-100 backdrop:bg-black/60" aria-labelledby="' + d.id + '-titulo">\n'
    + '        <div class="sticky top-0 z-10 flex items-center gap-3 px-4 sm:px-6 py-3 bg-white dark:bg-brand-900 border-b border-brand-100 dark:border-brand-800">\n'
    + '            <h2 id="' + d.id + '-titulo" class="font-serif text-xl md:text-2xl font-bold text-brand-800 dark:text-white flex-1 min-w-0"><span aria-hidden="true">' + d.icono + " </span>" + esc(d.titulo) + "</h2>\n"
    + '            <button type="button" data-cerrar class="shrink-0 bg-brand-800 hover:bg-brand-700 text-white font-semibold text-sm px-4 py-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2">Cerrar</button>\n'
    + "        </div>\n"
    + '        <div class="px-4 sm:px-6 pt-2 pb-6">\n'
    + d.cuerpo.replace(/\n$/, "").split("\n").map((l) => "            " + l).join("\n") + "\n"
    + "        </div>\n"
    + "    </dialog>\n";
}

const cargando = '<p class="text-brand-600 dark:text-brand-300">Cargando…</p>';

function dialogos(c) {
  const d = c.dialogos;
  const out = (d.propios || []).map(dialogo);
  out.push(dialogo({
    id: "medallero", icono: "🥇", titulo: "El podio",
    comentario: "El podio: los tres primeros, según la clasificación de chess-results.\nLo arma js/centroamericano-vivo.js (soloPodio: sin tabla de medallas).",
    cuerpo: '<p class="text-brand-600 dark:text-brand-300 mt-2">' + esc(d.podio) + "</p>\n"
      + '<div id="medallero-contenido" class="mt-4">\n    ' + cargando + "\n</div>\n",
  }));
  out.push(dialogo({
    id: "clasificacion", icono: "📊", titulo: "Clasificación final", ancho: "max-w-5xl",
    comentario: "La clasificación completa, con el rendimiento de cada jugador. La arma\njs/centroamericano-tablas.js; con un solo grupo, el selector se esconde solo.",
    cuerpo: '<p class="text-brand-600 dark:text-brand-300 mt-2">' + esc(d.clasificacion) + "</p>\n"
      + '<div class="mt-4 grid gap-3 sm:grid-cols-2">\n'
      + '    <label class="block text-sm font-bold">' + esc(c.grupoNombre || "Categoría") + "\n"
      + '        <select id="clasificacion-categoria" class="cac-buscador-campo !mt-1"></select>\n'
      + "    </label>\n"
      + '    <label class="block text-sm font-bold">Buscar en la tabla\n'
      + '        <input id="clasificacion-buscar" type="search" autocomplete="off" spellcheck="false" class="cac-buscador-campo !mt-1">\n'
      + "    </label>\n"
      + "</div>\n"
      + '<div id="clasificacion-contenido" class="mt-4">\n    ' + cargando + "\n</div>\n",
  }));
  if (c.ediciones && c.ediciones.length) {
    out.push(dialogo({
      id: "ediciones", icono: "📅", titulo: "Ediciones anteriores", ancho: "max-w-5xl",
      comentario: "Las ediciones anteriores: los campeones de cada año y quién repitió, con su\npuesto en cada una. La arma js/torneo-ediciones.js con la clasificación de\neste año (de chess-results, en vivo) y la de las anteriores (guardada en\n" + c.config + ", desde la configuración de la página).",
      cuerpo: '<p class="text-brand-600 dark:text-brand-300 mt-2">' + esc(d.ediciones) + "</p>\n"
        + '<div id="ediciones-contenido" class="mt-4">\n    ' + cargando + "\n</div>\n",
    }));
  }
  return out.join("");
}

const PROYECTOR = `    <!-- Para una pantalla: con el torneo terminado, los podios y la
         clasificación final en letra grande, que pasan solos, y el QR de la
         página. El de js/centroamericano-tablas.js, igual que en el
         Centroamericano. Se abre con #proyector en la dirección. -->
    <dialog id="proyector" class="ficha-dialogo cac-proyector p-0 backdrop:bg-black" aria-labelledby="proyector-titulo">
        <div class="cac-proyector-barra">
            <h2 id="proyector-titulo" class="cac-proyector-titulo"></h2>
            <p id="proyector-reloj" class="cac-proyector-reloj"></p>
            <div class="cac-proyector-botones">
                <button type="button" id="proyector-anterior" class="cac-proyector-boton"><span aria-hidden="true">◀ </span>Anterior</button>
                <button type="button" id="proyector-pausa" class="cac-proyector-boton" aria-pressed="false"></button>
                <button type="button" id="proyector-siguiente" class="cac-proyector-boton">Siguiente<span aria-hidden="true"> ▶</span></button>
                <label class="cac-proyector-modo"><span class="sr-only">Qué mostrar</span>
                    <select id="proyector-modo" class="cac-proyector-boton"></select>
                </label>
                <button type="button" id="proyector-completa" class="cac-proyector-boton">Pantalla completa</button>
                <button type="button" data-cerrar class="cac-proyector-boton">Cerrar</button>
            </div>
        </div>
        <p id="proyector-progreso" class="cac-proyector-progreso" hidden></p>
        <div id="proyector-contenido" class="cac-proyector-contenido" aria-live="off"></div>
        <div class="cac-proyector-qr" aria-hidden="true"><div id="proyector-qr"></div><p>Ábrela en tu celular</p></div>
    </dialog>
`;

function cabecera() {
  const item = (href, texto, movil) => movil
    ? '                <li><a href="' + href + '" class="block py-2 hover:text-accent-400">' + texto + "</a></li>\n"
    : '                    <li><a href="' + href + '" class="hover:text-accent-400 transition-colors">' + texto + "</a></li>\n";
  const menu = [["index.html", "Inicio"], ["#fichas", "Fichas"], ["#clasificacion", "Clasificación"], ["torneos-en-vivo.html", "Torneos"]];
  return `    <a href="#main-content" class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-accent-500 focus:text-brand-900 focus:font-semibold focus:px-4 focus:py-2 focus:rounded-lg">Saltar al contenido principal</a>
    <header id="header" class="sticky top-0 z-50 bg-brand-800 shadow-lg transition-all duration-300">
        <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" aria-label="Navegación principal">
            <div class="flex items-center justify-between min-h-[4rem] md:min-h-[5rem] py-2">
                <a href="index.html" class="flex items-center gap-2 text-white"><img src="/img/logo-marca.png" alt="" width="78" height="48" class="h-10 md:h-12 w-auto shrink-0"><span class="font-serif text-xl md:text-2xl font-bold tracking-tight">Ajedrez <span class="text-accent-400">Integral</span></span></a>
                <ul class="hidden lg:flex items-center gap-8 text-brand-100 font-medium">
${menu.map(([h, t]) => item(h, t, false)).join("")}                </ul>
                <div class="flex items-center gap-2 sm:gap-3">
                    <button id="theme-toggle" class="text-white text-lg w-9 h-9 flex items-center justify-center rounded-lg hover:bg-brand-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-800" aria-label="Cambiar a modo oscuro" title="Cambiar entre modo claro y oscuro">
                        <span id="theme-icon" aria-hidden="true">☀️</span>
                    </button>
                    <button id="menu-toggle" class="lg:hidden text-white text-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-800" aria-label="Abrir menú" aria-expanded="false" aria-controls="mobile-menu">
                        <svg id="icon-open" xmlns="http://www.w3.org/2000/svg" class="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
                        <svg id="icon-close" xmlns="http://www.w3.org/2000/svg" class="w-7 h-7 hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>
            </div>
        </nav>
        <div id="mobile-menu" class="lg:hidden hidden bg-brand-800 border-t border-brand-700">
            <ul class="px-4 py-4 space-y-3 text-brand-100 font-medium">
${menu.map(([h, t]) => item(h, t, true)).join("")}            </ul>
        </div>
    </header>
`;
}

function pagina(c) {
  const url = "https://ajedrez-integral.com/" + c.pagina;
  const p = c.portada;
  const pie = c.pie.map((e) => "<li><a " + atributosEnlace(e) + ' class="hover:text-accent-400 transition-colors">' + esc(e.texto) + "</a></li>").join("");
  const fichas = c.fichas.slice();
  if (c.ediciones && c.ediciones.length) {
    // «Ediciones anteriores» va detrás de las fichas del torneo, antes de las
    // que llevan a otra cosa (contacto, más torneos).
    const i = fichas.findIndex((f) => f.despues);
    fichas.splice(i < 0 ? fichas.length : i, 0, {
      href: "#ediciones", color: c.colorEdiciones || "verde", icono: "📅", titulo: "Ediciones anteriores",
      texto: c.textoEdiciones, accion: "Comparar las ediciones",
    });
  }
  const scripts = ["js/main.js", "js/ventana-enlace.js", "js/vendor/supabase.js", "js/supabase-client.js", c.config,
    "js/pareo/torneo.js", "js/pareo/desempates.js", "js/tabla-imagen.js", "js/vendor/qrcode.js", "js/qr-svg.js",
    "js/centroamericano-vivo.js", "js/centroamericano-tablas.js", "js/torneo-podio.js"];
  if (c.ediciones && c.ediciones.length) scripts.push("js/torneo-ediciones.js");

  return `<!DOCTYPE html>
<html lang="es">
<!-- Generada por herramientas/torneo-universitario.js desde
     herramientas/torneos-universitarios/${c.pagina.replace(/\.html$/, "")}.js: no se edita a mano. -->
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" href="img/favicon.svg">
    <title>${esc(c.titulo)} | Ajedrez Integral</title>
    <meta name="description" content="${esc(c.descripcion)}">
    <link rel="canonical" href="${url}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Ajedrez Integral">
    <meta property="og:locale" content="es_CR">
    <meta property="og:title" content="${esc(c.titulo)}">
    <meta property="og:description" content="${esc(c.descripcion)}">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="https://ajedrez-integral.com/img/og-ajedrez-integral.jpg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="Ajedrez Integral — clases de ajedrez en vivo, no solo videos. ajedrez-integral.com">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="stylesheet" href="css/tailwind.css">
    <link rel="stylesheet" href="css/styles.css">
    <link rel="stylesheet" href="css/centroamericano.css">
    <link rel="stylesheet" href="css/universidades.css">
    ${bloque("oscuro")}
    <script src="js/adaptive-mode.js"></script>
${bloque("app")}${bloque("tema")}${bloque("fuentes")}</head>
<body class="cac cac-u ${c.clase} font-sans text-brand-800 dark:text-brand-100 transition-colors duration-300">
${cabecera()}    <main id="main-content">
${comentario(c.comentario, "    ")}    <section class="cac-portada">
        <div class="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-10 md:pt-14 md:pb-14">
            <div class="grid md:grid-cols-[1.15fr_0.85fr] items-center gap-6 md:gap-10">
                <div class="text-center md:text-left">
                    <p><span class="cac-pildora text-base md:text-lg">${esc(p.pildora)}</span></p>
                    <h1 class="cac-titulo text-3xl sm:text-4xl md:text-5xl mt-4">${esc(p.titulo)}<span class="block text-2xl sm:text-3xl md:text-4xl mt-2">${esc(p.subtitulo)}</span></h1>
                    <p class="mt-5"><span class="cac-caja text-sm md:text-base">${p.caja.map(esc).join("<br>")}</span></p>
                </div>
                <div class="relative mx-auto w-full max-w-[300px] md:max-w-[340px]">
                    <img src="${esc(c.logo.src)}" width="${c.logo.ancho}" height="${c.logo.alto}" alt="${esc(c.logo.alt)}" class="u-logo">
                </div>
            </div>
            <dl class="mt-8 grid sm:grid-cols-3 gap-3 sm:gap-4 text-left">
${p.datos.map(([emoji, dt, dd]) => '                <div class="cac-dato"><dt><span aria-hidden="true">' + emoji + " </span>" + esc(dt) + '</dt><dd class="font-bold text-lg">' + esc(dd) + "</dd></div>\n").join("")}            </dl>
        </div>
    </section>

    <!-- Quién organiza y quién arbitró, como lo dice la ficha de chess-results. -->
    <section class="cac-organiza" aria-label="Quién organiza">
        <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm">
            <p><strong class="font-extrabold uppercase tracking-wide">Organiza</strong> ${esc(c.organiza)}</p>
${c.equipo.map(([cargo, nombre]) => '            <p><strong class="font-extrabold">' + esc(cargo) + ":</strong> " + esc(nombre) + "</p>\n").join("")}        </div>
    </section>

    <!-- «El podio»: lo llena js/torneo-podio.js con la clasificación final de
         chess-results. Sin JavaScript queda el enlace, que es cierto siempre. -->
    <section id="podio" class="pt-8" aria-labelledby="podio-titulo">
        <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="cac-hoy">
                <h2 id="podio-titulo" class="cac-hoy-etiqueta">El podio</h2>
                <div id="podio-lista">
                    <p class="u-podio-vacio">Buscando la clasificación final en chess-results…</p>
                </div>
                <p id="podio-estado" class="mt-3 text-sm text-brand-600 dark:text-brand-300" role="status" aria-live="polite"></p>
                <p class="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold">
                    ${accion(c, "#clasificacion", "Ver la clasificación completa")}${c.ediciones && c.ediciones.length ? "\n                    " + accion(c, "#ediciones", "Comparar con las ediciones anteriores") : ""}
                </p>
            </div>
        </div>
    </section>

    <section id="fichas" class="relative overflow-hidden pt-10 pb-14 scroll-mt-24">
        <div class="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 class="cac-seccion text-2xl md:text-3xl">Todo el torneo a un clic<span class="cac-seccion-raya" aria-hidden="true"></span></h2>
            <p class="text-brand-600 dark:text-brand-300 mt-2 max-w-2xl">Toca la ficha de lo que buscas y se abre encima, sin salir de la página.</p>
            <!-- «Busca a tu jugador» (js/centroamericano-vivo.js): los jugadores y
                 sus rondas, de chess-results, por la Edge Function sala-jugadores. -->
            <div id="buscador" class="cac-buscador mt-6 sm:mt-8">
                <!-- «Mis jugadores»: los que se marcan con la estrella, guardados
                     en este aparato (sin cuenta). Se esconde mientras no haya
                     ninguno. Sin avisos al celular: el torneo ya terminó. -->
                <div id="seguidos" class="cac-seguidos mb-6" role="region" aria-labelledby="seguidos-titulo" hidden>
                    <h3 id="seguidos-titulo" class="cac-buscador-titulo"><span aria-hidden="true">⭐ </span>Mis jugadores</h3>
                    <ul id="seguidos-lista" class="mt-3 grid gap-3"></ul>
                    <p id="seguidos-estado" class="mt-2 text-sm font-semibold" role="status" aria-live="polite"></p>
                </div>
                <label for="buscador-nombre" class="cac-buscador-titulo"><span aria-hidden="true">🔎 </span>Busca a tu jugador</label>
                <p class="mt-1 text-sm sm:text-base text-brand-600 dark:text-brand-300">${esc(c.buscador.texto)}</p>
                <input id="buscador-nombre" type="search" autocomplete="off" spellcheck="false" placeholder="Por ejemplo: ${esc(c.buscador.ejemplo)}" class="cac-buscador-campo">
                <p id="buscador-estado" class="mt-2 text-sm text-brand-600 dark:text-brand-300" role="status" aria-live="polite"></p>
                <ul id="buscador-resultados" class="mt-3 grid gap-3"></ul>
                <p class="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold">
                    ${accion(c, "#medallero", "Ver el podio", "🥇")}
                    ${accion(c, "#clasificacion", "Clasificación completa", "📊")}
                    ${accion(c, "#proyector", "Clasificación para proyectar", "📺")}
                </p>
            </div>
            <ul class="mt-6 sm:mt-8 grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
${fichas.map((f, i) => ficha(c, f, fichas.length % 2 === 1 && i === fichas.length - 1)).join("")}            </ul>
            <a ${atributosEnlace(c.despedida)} class="cac-despedida mt-10 sm:mt-12 flex items-center gap-4 sm:gap-6 max-w-2xl mx-auto rounded-3xl ${anillo(c, 4)}">
                <span class="u-despedida-logo" aria-hidden="true"><img src="${esc(c.logo.src)}" width="${c.logo.ancho}" height="${c.logo.alto}" alt=""></span>
                <span class="cac-globo">
                    <span class="block font-extrabold text-lg sm:text-xl">¡Gracias por jugar!</span>
                    <span class="block mt-1 text-sm sm:text-base">${esc(c.despedida.texto)}</span>
                    <span class="block mt-2 text-sm font-bold cac-accion">${esc(c.despedida.accion)} →</span>
                </span>
            </a>
        </div>
    </section>

${dialogos(c)}${PROYECTOR}    </main>

    <footer class="bg-brand-900 text-brand-300 pt-16 pb-8">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="grid md:grid-cols-2 gap-8 mb-12">
                <div><a href="index.html" class="flex items-center gap-2 text-white mb-4"><img src="/img/logo-marca.png" alt="" width="78" height="48" class="h-9 w-auto shrink-0"><span class="font-serif text-lg font-bold">Ajedrez Integral</span></a><p class="text-sm text-brand-300">Plataforma educativa de ajedrez para escuelas, colegios y familias. Aprende, practica y compite.</p></div>
                <div><h3 class="text-white font-semibold mb-4">${esc(c.nombrePie)}</h3><ul class="space-y-2 text-sm">${pie}</ul></div>
            </div>
            <div class="border-t border-brand-700 pt-6 text-center text-sm text-brand-300"><p>&copy; 2026 Ajedrez Integral. Todos los derechos reservados.</p>${bloque("legal")}</div>
        </div>
    </footer>
${scripts.map((s) => '    <script src="' + s + '"></script>\n').join("")}</body>
</html>
`;
}

// js/<config>.js: lo que leen js/centroamericano-vivo.js, -tablas.js y
// js/torneo-ediciones.js. Las ediciones van compactas: [puesto, nombre, puntos].
// Una lista en una línea, con un espacio después de cada coma (nunca dentro
// de un texto: un nombre lleva su propia coma).
const lista1 = (xs) => "[" + xs.map((x) => JSON.stringify(x)).join(", ") + "]";

function configJs(c) {
  const t = c.torneoPagina;
  const lineas = [];
  lineas.push("/* " + c.cabeceraJs.trim().split("\n").map((l, i) => (i ? (l ? " * " + l : " *") : l)).join("\n"));
  lineas.push(" *");
  lineas.push(" * Generado por herramientas/torneo-universitario.js desde");
  lineas.push(" * herramientas/torneos-universitarios/" + c.pagina.replace(/\.html$/, "") + ".js: no se edita a mano.");
  lineas.push(" * Tiene que cargar ANTES que esos módulos. Ver «Las páginas de los torneos");
  lineas.push(" * universitarios» en docs/decisiones/juegos-y-torneos.md.");
  lineas.push(" */");
  lineas.push("(function () {");
  lineas.push('  "use strict";');
  lineas.push("");
  lineas.push("  // Colores medidos sobre su fondo real (ver la cabecera de css/universidades.css):");
  lineas.push("  // " + c.contraste);
  lineas.push("  window.TorneoPagina = {");
  lineas.push("    sala: " + JSON.stringify(t.sala) + ",");
  lineas.push("    guardado: " + JSON.stringify(t.guardado) + ",");
  lineas.push("    soloPodio: true,");
  if (t.grupos) lineas.push("    grupos: { " + Object.entries(t.grupos).map(([k, v]) => k + ": " + JSON.stringify(v)).join(", ") + " },");
  lineas.push('    url: "ajedrez-integral.com/' + c.pagina + '",');
  lineas.push("    nombreCorto: " + JSON.stringify(t.nombreCorto) + ",");
  lineas.push("    imgSub: " + JSON.stringify(t.imgSub) + ",");
  lineas.push('    compartirTexto: (n) => n + " ' + t.compartir.replace(/["\\]/g, "\\$&") + '",');
  const im = t.imagen;
  lineas.push("    imagen: {");
  lineas.push("      banda: " + JSON.stringify(im.banda) + ", tinta: " + JSON.stringify(im.tinta) + ", acento: " + JSON.stringify(im.acento) + ", suave: " + JSON.stringify(im.suave) + ",");
  lineas.push("      dibujo: " + JSON.stringify(c.logo.src) + ", redondo: false, archivo: " + JSON.stringify(im.archivo) + ",");
  lineas.push("      franjas: [" + im.franjas.map(lista1).join(", ") + "],");
  lineas.push("    },");
  if (c.ediciones && c.ediciones.length) {
    lineas.push("    // Esta edición, como se llama en «Ediciones anteriores».");
    lineas.push("    edicion: " + JSON.stringify(c.edicion) + ",");
    if (c.mismaPersona && Object.keys(c.mismaPersona).length) {
      lineas.push("    // El mismo jugador escrito distinto en chess-results de un año a otro,");
      lineas.push("    // revisado a mano: el nombre viejo → el de esta edición.");
      lineas.push("    mismaPersona: { " + Object.entries(c.mismaPersona).map(([k, v]) => JSON.stringify(k) + ": " + JSON.stringify(v)).join(", ") + " },");
    }
    lineas.push("    // Las ediciones anteriores, de la más vieja a la más nueva, con la");
    lineas.push("    // clasificación final de chess-results de cada grupo: [puesto, nombre, puntos].");
    lineas.push("    ediciones: [");
    c.ediciones.forEach((e) => {
      lineas.push("      {");
      lineas.push("        nombre: " + JSON.stringify(e.nombre) + ", fecha: " + JSON.stringify(e.fecha) + ",");
      if (e.nota) lineas.push("        nota: " + JSON.stringify(e.nota) + ",");
      lineas.push("        grupos: {");
      Object.entries(e.grupos).forEach(([g, lista]) => {
        lineas.push("          " + JSON.stringify(g) + ": {");
        lineas.push("            tnr: " + lista.tnr + ",");
        lineas.push("            jugadores: [");
        lista.jugadores.forEach((j) => lineas.push("              " + lista1(j) + ","));
        lineas.push("            ],");
        lineas.push("          },");
      });
      lineas.push("        },");
      lineas.push("      },");
    });
    lineas.push("    ],");
  }
  lineas.push("  };");
  lineas.push("})();");
  return lineas.join("\n") + "\n";
}

function configuraciones() {
  return fs.readdirSync(CARPETA).filter((f) => f.endsWith(".js")).sort()
    .map((f) => ({ id: f.replace(/\.js$/, ""), c: require(path.join(CARPETA, f)) }));
}

// Lo que tiene que escribir cada configuración: [ruta, contenido].
function armar(id, c) {
  if (c.pagina !== id + ".html") throw new Error(id + ": la página tiene que llamarse " + id + ".html");
  const ruta = path.join(RAIZ, c.pagina);
  const viejo = fs.existsSync(ruta) ? fs.readFileSync(ruta, "utf8") : "";
  return [[ruta, conservarBloques(pagina(c), viejo)], [path.join(RAIZ, c.config), configJs(c)]];
}

module.exports = { armar, configuraciones };

if (require.main === module) {
  const comprobar = process.argv.includes("--comprobar");
  const pedidas = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  let viejas = 0;
  configuraciones().filter((x) => !pedidas.length || pedidas.includes(x.id)).forEach(({ id, c }) => {
    armar(id, c).forEach(([ruta, contenido]) => {
      const rel = path.relative(RAIZ, ruta);
      const actual = fs.existsSync(ruta) ? fs.readFileSync(ruta, "utf8") : "";
      if (comprobar) {
        if (actual !== contenido) { viejas++; console.error("✗ " + rel + " no es lo que sale de su configuración: corre node herramientas/torneo-universitario.js " + id); }
        else console.log("✓ " + rel + " al día");
      } else if (actual !== contenido) {
        fs.writeFileSync(ruta, contenido);
        console.log("✓ " + rel);
      } else console.log("· " + rel + " (sin cambios)");
    });
  });
  if (viejas) process.exit(1);
}
