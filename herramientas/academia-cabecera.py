#!/usr/bin/env python3
"""Cambia el encabezado y el pie de las páginas de la Academia por una
versión mínima, sin nada del sitio público.

Hasta ahora TODAS las páginas —la portada, un artículo, y también el panel
de Clases o un ejercicio de Entrenamiento— compartían el mismo encabezado de
marketing: Inicio, Cursos, Artículos, Jugar contra el profe, el botón
"💬 Inscríbete" y la barra de arriba con "🏆 ¡Te reto!" y "TV en vivo". Un
alumno resolviendo un ejercicio, jugando su partida en vivo o mirando su
registro de clases tenía ahí mismo, arriba de todo, un enlace al catálogo
público de cursos (que no es el suyo, ver cursos/academia/), un botón de
WhatsApp para "inscribirse" a una academia en la que ya está inscrito, y
seis destinos más que no tienen nada que ver con lo que está haciendo. Nada
de eso rompía nada — es exactamente el tipo de falla que este sitio no deja
pasar sin arreglar: no truena, simplemente hace más fácil irse por donde no
corresponde.

Las páginas que exigen sesión (todas caen en alguna de estas dos formas: un
`location.href = "login.html"` sin sesión, o `requireLoginThenGate()`) llevan
en cambio un encabezado de dos elementos —el logo, que vuelve al panel, y el
interruptor de tema— y un pie de una sola línea. Ni una ni otra tienen ya
ningún enlace al sitio público: quien ya inició sesión no tiene por qué ver
la invitación a inscribirse ni el resto del menú de marketing.

Y de paso pone la burbuja de "quién está conectado" (js/burbuja-en-linea.js) y
el aviso de partida asignada (js/juego-aviso.js) — "Cuando el profesor arma un
pareo desde Juegos, que le llegue al alumno esté donde esté y lo lleve directo
al tablero", que antes solo pasaba en juegos.html y clases.html. Los dos son
lo que va en toda página de la Academia y en ninguna del sitio público. Van
acá y no en un script aparte porque la lista PAGINAS es la misma: con dos
listas, la página nueva entra en una y se olvida en la otra —que es
exactamente lo que ya pasó una vez entre verificar-pwa.js y pwa-cabecera.py—.

Se puede correr todas las veces que se quiera: como el nuevo encabezado y el
nuevo pie tienen la misma forma que dejó la corrida anterior (un solo
`<header id="header">…</header>` y un solo `<footer>…</footer>`), reemplazan
lo que haya ahí sin necesitar marcas aparte; la burbuja y el aviso de partida
sí llevan las suyas.

    python3 herramientas/academia-cabecera.py
"""
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Las páginas de la Academia: todas exigen sesión (redirigen a login.html si
# no hay una, o la piden con requireLoginThenGate()). Es una lista a mano y
# no un barrido automático porque "exige sesión" no se puede adivinar de
# forma confiable por convención de nombre — sí se puede, y ya se hizo,
# revisando el patrón de cada archivo antes de escribir esta lista.
PAGINAS = [
    "admin-jugador.html", "admin.html", "arbitraje.html", "asistencia.html",
    "cartas.html",
    "ciegos.html", "clases.html", "cobros.html", "concentracion.html",
    "configuracion.html", "crazyhouse.html", "cuatro-jugadores.html",
    "duelo.html", "estandar.html", "formularios.html", "ilumina-tablero.html",
    "informes.html", "inscripciones.html", "juegos.html",
    "lector-planilla.html", "logros.html", "niebla.html", "partidas.html",
    "examen.html", "examenes.html",
    "planes.html", "racha-tactica.html", "reportes.html", "sesion.html",
    "coordinacion.html", "subgrupos.html", "tareas.html",
    "informe-mensual.html", "supervision.html", "academias.html", "tablero-academias.html",
    "novedades.html",
    "tienda.html", "accesos.html",
    "torneo.html", "torneos.html", "variante.html",
    "entreno/4x4.html", "entreno/aprender.html", "entreno/coordenadas.html",
    "entreno/desafios.html", "entreno/estudio.html", "entreno/index.html",
    "entreno/mates.html", "entreno/practicas.html", "entreno/temas.html",
    "entreno/visualizacion.html", "entreno/aperturas.html",
    "entreno/precision-posicional.html",
    "sonar.html",
    "cursos/academia/aperturas-y-defensas.html",
    "cursos/academia/arbitro-nacional.html",
    "cursos/academia/calculo-y-visualizacion.html",
    "cursos/academia/desequilibrios-de-material.html",
    "cursos/academia/el-mapa-de-los-finales.html",
    "cursos/academia/estrategia-en-el-final.html",
    "cursos/academia/estrategia-y-tactica.html",
    "cursos/academia/finales-practicos.html",
    "cursos/academia/formacion-ajedrez.html",
    "cursos/academia/fundamentos-del-ajedrez.html",
    "cursos/academia/index.html",
    "cursos/academia/partidas-modelo.html",
    "cursos/academia/preparacion-para-torneos.html",
]

HEADER_RE = re.compile(r'<header id="header"[\s\S]*?</header>')
FOOTER_RE = re.compile(r'<footer[\s\S]*?</footer>')

BURBUJA_INICIO = "<!-- burbuja: inicio -->"
BURBUJA_FIN = "<!-- burbuja: fin -->"
JUEGO_AVISO_INICIO = "<!-- juego-aviso: inicio -->"
JUEGO_AVISO_FIN = "<!-- juego-aviso: fin -->"

# Dos páginas de la Academia se quedan SIN burbuja, y por razones distintas:
#
#   - sesion.html ya tiene el chat de la clase y su lista de alumnos
#     conectados, en un panel hecho para eso. La burbuja encima sería el
#     mismo destino dos veces —el error que el panel ya cometió con
#     "Torneos"— y encima de un tablero.
#   - examen.html es un examen con reloj, una sola oportunidad por pregunta
#     y pantalla completa. Un panel que se despliega ahí es justo la
#     distracción que el antitrampa viene a evitar, y el mensaje sigue
#     estando cuando termine.
#   - tienda.html es un catálogo de venta, y la burbuja le tapaba LITERALMENTE
#     el botón de pedido: la barra de la selección va fija abajo y la burbuja
#     flota en esa misma esquina, así que "Pedir por WhatsApp" quedaba debajo
#     de ella y no se podía apretar. No daba ningún error —se veía perfecto— y
#     lo habría descubierto quien quisiera comprar. Encima, "0 alumnos en
#     línea" no tiene nada que decir en una página de venta.
SIN_BURBUJA = {"sesion.html", "examen.html", "tienda.html"}

# El aviso de partida asignada (js/juego-aviso.js) SOLO se quita de examen.html,
# por la misma razón que ahí tampoco va la burbuja: un aviso que aparece solo y
# traslada a otra página es justo la distracción que el antitrampa del examen
# viene a evitar. En sesion.html sí va: ahí también hay alumnos, y "el profesor
# te asignó una partida en Juegos" no tiene nada que ver con la clase en vivo
# que ya ocupa esa pantalla — la única razón por la que sesion.html no lleva
# burbuja es que YA tiene su propio chat, y eso no aplica acá.
SIN_JUEGO_AVISO = {"examen.html"}

# El control del acceso (js/acceso-vigente.js) va en todas menos dos, y las dos
# por lo mismo: son las que alguien con el acceso vencido TIENE que poder abrir.
# cobros.html para ver qué debe y cuándo pagó; configuracion.html para cambiar
# su contraseña o sus avisos. Taparlas sería cerrarle justo la puerta por la
# que se arregla. El panel (clases.html) sí lo lleva, pero ahí no tapa: avisa.
ACCESO_INICIO = "<!-- acceso: inicio -->"
ACCESO_FIN = "<!-- acceso: fin -->"
SIN_ACCESO = {"cobros.html", "configuracion.html"}

# Dos páginas usan ejercicios de la base abierta de Lichess y su licencia
# (CC0) exige decirlo: esa frase no es marketing, es un requisito legal, así
# que el pie mínimo la respeta en vez de aplastarla con el genérico.
ATRIBUCION_EXTRA = {
    "entreno/temas.html": " Ejercicios tomados de la base abierta de Lichess (licencia CC0).",
    "entreno/visualizacion.html": " Ejercicios tomados de la base abierta de Lichess (licencia CC0).",
}


def pie(ruta):
    extra = ATRIBUCION_EXTRA.get(ruta, "")
    return ('<footer class="bg-brand-900 text-brand-300 py-8">'
            '<div class="max-w-7xl mx-auto px-4 text-center text-sm">'
            f'<p>&copy; 2026 Ajedrez Integral. Todos los derechos reservados.{extra}</p>'
            '</div></footer>')


# El «?» del encabezado: el capítulo de la guía del profesor que habla de
# cada página. Va por el `id` del capítulo en herramientas/guia/contenido.json
# y no por su número: reordenar la guía no deja un «?» apuntando al capítulo
# de al lado. El número del ancla (#cap-N) se calcula acá, con el mismo orden
# con que herramientas/guia-profesores.js las escribe.
#
# SOLO van las páginas que la guía de verdad explica. Un «?» que lleva a un
# capítulo que no habla de esa página es peor que no tenerlo: quien lo abre
# lee todo el capítulo buscando algo que no está. Por eso subgrupos,
# asistencia presencial, el informe mensual, supervisión, academias, accesos,
# la tienda y otras no llevan: la guía todavía no las cuenta.
#
# Por ahora el «?» es solo de administración (lo destapa js/ayuda-guia.js),
# igual que la tarjeta «Guía del profesor» del panel.
AYUDA_GUIA = {
    "clases.html": "empezar", "configuracion.html": "empezar",
    "sesion.html": "clase-en-vivo",
    "planes.html": "planes",
    "tareas.html": "tareas",
    "examenes.html": "examenes", "examen.html": "examenes",
    "informes.html": "informes",
    "logros.html": "entrenamiento", "racha-tactica.html": "entrenamiento",
    "concentracion.html": "entrenamiento", "ilumina-tablero.html": "entrenamiento",
    "arbitraje.html": "evaluaciones",
    "juegos.html": "juegos", "torneos.html": "juegos", "torneo.html": "juegos",
    "estandar.html": "juegos", "niebla.html": "juegos", "crazyhouse.html": "juegos",
    "cartas.html": "juegos", "duelo.html": "juegos", "cuatro-jugadores.html": "juegos",
    "variante.html": "juegos",
    "partidas.html": "archivos", "lector-planilla.html": "archivos",
    "ciegos.html": "accesibilidad",
    "coordinacion.html": "coordinacion", "formularios.html": "coordinacion",
    "cobros.html": "coordinacion", "reportes.html": "coordinacion",
    "admin.html": "administracion", "inscripciones.html": "administracion",
}
AYUDA_CARPETAS = {"entreno/": "entrenamiento", "cursos/academia/": "cursos"}
AYUDA_INICIO = "<!-- ayuda: inicio -->"
AYUDA_FIN = "<!-- ayuda: fin -->"


def capitulos_de_la_guia():
    ruta = os.path.join(RAIZ, "herramientas", "guia", "contenido.json")
    caps = json.load(open(ruta, encoding="utf-8"))["capitulos"]
    return {c["id"]: (i + 1, c["titulo"]) for i, c in enumerate(caps)}


CAPITULOS = None


def capitulo_de_ayuda(ruta):
    """(número, título) del capítulo de la guía para esta página, o None."""
    global CAPITULOS
    if CAPITULOS is None:
        CAPITULOS = capitulos_de_la_guia()
    cap = AYUDA_GUIA.get(ruta)
    if cap is None:
        cap = next((c for pre, c in AYUDA_CARPETAS.items() if ruta.startswith(pre)), None)
    if cap is None:
        return None
    if cap not in CAPITULOS:
        raise SystemExit(f"❌ {ruta}: el capítulo «{cap}» no está en herramientas/guia/contenido.json.")
    return CAPITULOS[cap]


def enlace_de_ayuda(ruta):
    cap = capitulo_de_ayuda(ruta)
    if not cap:
        return ""
    numero, titulo = cap
    arriba = "../" * ruta.count("/")
    t = titulo.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")
    # Llega escondido (clase `hidden`): js/ayuda-guia.js lo destapa solo para
    # quien administra. Se abre en otra pestaña para no perder lo que se
    # estaba haciendo, y lo dice.
    return (f'<a id="ayuda-guia" href="{arriba}guia-del-profesor-accesible.html#cap-{numero}" target="_blank" rel="noopener" '
            'class="hidden text-white font-bold text-lg w-9 h-9 items-center justify-center rounded-lg border border-white/40 hover:bg-brand-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-800" '
            f'aria-label="Ayuda: capítulo «{t}» de la guía del profesor (se abre en otra pestaña)" title="Guía del profesor: {t}">'
            '<span aria-hidden="true">?</span></a>')


def poner_ayuda(ruta, s):
    i = s.find(AYUDA_INICIO)
    if i >= 0:
        j = s.find(AYUDA_FIN, i)
        s = s[:i] + s[j + len(AYUDA_FIN):]
    if not capitulo_de_ayuda(ruta):
        return s
    cierre = s.rfind("</body>")
    if cierre < 0:
        print(f"⚠️  {ruta}: no tiene </body>, se queda sin el «?».")
        return s
    arriba = "../" * ruta.count("/")
    return (s[:cierre] + AYUDA_INICIO
            + f'<script src="{arriba}js/ayuda-guia.js" defer></script>'
            + AYUDA_FIN + s[cierre:])


def cabecera(ruta):
    # Rutas absolutas dentro del dominio, como ya hace pwa-cabecera.py, para
    # no tener que contar "../" según la carpeta.
    arriba = "../" * ruta.count("/")
    return (
        '<header id="header" class="sticky top-0 z-50 bg-brand-800 shadow-lg transition-all duration-300">'
        '<nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" aria-label="Academia">'
        '<div class="flex items-center justify-between min-h-[4rem] md:min-h-[5rem] py-2">'
        f'<a id="marca-enlace" href="{arriba}clases.html" class="flex items-center gap-2 text-white min-w-0">'
        '<span class="text-3xl" aria-hidden="true">♟️</span>'
        '<span class="font-serif text-xl md:text-2xl font-bold tracking-tight">Ajedrez <span class="text-accent-400">Integral</span></span>'
        '<span class="sr-only"> — panel de la Academia</span>'
        '</a>'
        '<div class="flex items-center gap-2">'
        + enlace_de_ayuda(ruta) +
        '<button id="theme-toggle" class="text-white text-lg w-9 h-9 flex items-center justify-center rounded-lg hover:bg-brand-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-800" aria-label="Cambiar a modo oscuro" title="Cambiar entre modo claro y oscuro">'
        '<span id="theme-icon" aria-hidden="true">☀️</span>'
        '</button>'
        '</div>'
        '</div></nav></header>'
    )


def burbuja(ruta):
    """La burbuja va con `defer` y DESPUÉS del cliente de Supabase, que es de
    quien depende (`window.sb`). Como el cliente de cada página va en el
    cuerpo o en el head con defer, alcanza con ponerla al final del <body>:
    para entonces `sb` ya existe."""
    arriba = "../" * ruta.count("/")
    return (BURBUJA_INICIO
            + f'<script src="{arriba}js/burbuja-en-linea.js" defer></script>'
            + BURBUJA_FIN)


def poner_burbuja(ruta, s):
    # Fuera lo de la corrida anterior, esté donde esté.
    i = s.find(BURBUJA_INICIO)
    if i >= 0:
        j = s.find(BURBUJA_FIN, i)
        s = s[:i] + s[j + len(BURBUJA_FIN):]
    if ruta in SIN_BURBUJA:
        return s
    cierre = s.rfind("</body>")
    if cierre < 0:
        print(f"⚠️  {ruta}: no tiene </body>, se queda sin burbuja.")
        return s
    return s[:cierre] + burbuja(ruta) + s[cierre:]


def juego_aviso(ruta):
    """Mismo criterio que la burbuja: `defer` y al final del <body>, para que
    `window.sb` ya exista. js/juego-aviso.js se autoarranca solo — busca su
    propia sesión y su propio rol — así que no hace falta ninguna llamada
    aparte en el script de la página."""
    arriba = "../" * ruta.count("/")
    return (JUEGO_AVISO_INICIO
            + f'<script src="{arriba}js/juego-aviso.js" defer></script>'
            + JUEGO_AVISO_FIN)


def poner_juego_aviso(ruta, s):
    i = s.find(JUEGO_AVISO_INICIO)
    if i >= 0:
        j = s.find(JUEGO_AVISO_FIN, i)
        s = s[:i] + s[j + len(JUEGO_AVISO_FIN):]
    if ruta in SIN_JUEGO_AVISO:
        return s
    cierre = s.rfind("</body>")
    if cierre < 0:
        print(f"⚠️  {ruta}: no tiene </body>, se queda sin aviso de partida.")
        return s
    return s[:cierre] + juego_aviso(ruta) + s[cierre:]


def poner_acceso(ruta, s):
    i = s.find(ACCESO_INICIO)
    if i >= 0:
        j = s.find(ACCESO_FIN, i)
        s = s[:i] + s[j + len(ACCESO_FIN):]
    if ruta in SIN_ACCESO:
        return s
    cierre = s.rfind("</body>")
    if cierre < 0:
        print(f"⚠️  {ruta}: no tiene </body>, se queda sin control de acceso.")
        return s
    arriba = "../" * ruta.count("/")
    return (s[:cierre] + ACCESO_INICIO
            + f'<script src="{arriba}js/acceso-vigente.js" defer></script>'
            + ACCESO_FIN + s[cierre:])


# El tiempo en la plataforma (js/tiempo-plataforma.js) de las páginas que no
# lo ponían a mano. Las de Entrenamiento lo llevan escrito en su HTML con su
# propia actividad; estas no, y por eso el alumno que estudiaba un curso o
# jugaba una partida no sumaba ni un minuto: el informe decía "0 min" de algo
# que sí hizo, sin que nada fallara. La actividad dice en qué sección cuenta
# (ver public.tiempo_por_seccion()); "curso" se completa sola con el nombre
# del archivo, así un curso nuevo cuenta aparte sin tocar esta lista.
TIEMPO_INICIO = "<!-- tiempo: inicio -->"
TIEMPO_FIN = "<!-- tiempo: fin -->"
TIEMPO_ACTIVIDAD = {
    "estandar.html": "partidas", "niebla.html": "partidas",
    "crazyhouse.html": "partidas", "cartas.html": "partidas",
    "duelo.html": "partidas", "variante.html": "partidas",
    "cuatro-jugadores.html": "partidas",
    "torneo.html": "torneos",
    "examen.html": "examen",
}


def actividad_de_tiempo(ruta):
    if ruta.startswith("cursos/academia/") and not ruta.endswith("/index.html"):
        return "curso"
    return TIEMPO_ACTIVIDAD.get(ruta)


def poner_tiempo(ruta, s):
    i = s.find(TIEMPO_INICIO)
    if i >= 0:
        j = s.find(TIEMPO_FIN, i)
        s = s[:i] + s[j + len(TIEMPO_FIN):]
    actividad = actividad_de_tiempo(ruta)
    # Una página que ya lo trae escrito a mano no lo lleva dos veces: serían
    # dos filas abiertas a la vez y el tiempo de esa sección contado doble.
    if not actividad or "tiempo-plataforma.js" in s:
        return s
    cierre = s.rfind("</body>")
    if cierre < 0:
        print(f"⚠️  {ruta}: no tiene </body>, se queda sin contar el tiempo.")
        return s
    arriba = "../" * ruta.count("/")
    return (s[:cierre] + TIEMPO_INICIO
            + f'<script src="{arriba}js/tiempo-plataforma.js" data-activity="{actividad}" defer></script>'
            + TIEMPO_FIN + s[cierre:])


# El modo de vista de quien administra (js/modo-vista.js): la franja que dice
# "estás viendo como estudiante" tiene que estar en TODA página de la Academia,
# o al pasar de una a otra quien administra se queda creyendo que volvió a su
# vista. Una página que ya lo carga a mano (clases.html e informes.html, que lo
# necesitan antes de pintar) no lo lleva dos veces.
MODO_INICIO = "<!-- modo-vista: inicio -->"
MODO_FIN = "<!-- modo-vista: fin -->"


def poner_modo_vista(ruta, s):
    i = s.find(MODO_INICIO)
    if i >= 0:
        j = s.find(MODO_FIN, i)
        s = s[:i] + s[j + len(MODO_FIN):]
    if "modo-vista.js" in s:
        return s
    cierre = s.rfind("</body>")
    if cierre < 0:
        print(f"⚠️  {ruta}: no tiene </body>, se queda sin la franja del modo de vista.")
        return s
    arriba = "../" * ruta.count("/")
    return (s[:cierre] + MODO_INICIO
            + f'<script src="{arriba}js/modo-vista.js" defer></script>'
            + MODO_FIN + s[cierre:])


# La marca de la academia (js/marca-academia.js): el logo y el color de la
# academia de quien mira, en el encabezado. Va en TODAS las páginas de la
# Academia, en la misma lista: con dos listas, la página nueva entra en una y
# se olvida en la otra. Busca el enlace #marca-enlace que pone cabecera().
MARCA_INICIO = "<!-- marca: inicio -->"
MARCA_FIN = "<!-- marca: fin -->"


def poner_marca(ruta, s):
    i = s.find(MARCA_INICIO)
    if i >= 0:
        j = s.find(MARCA_FIN, i)
        s = s[:i] + s[j + len(MARCA_FIN):]
    cierre = s.rfind("</body>")
    if cierre < 0:
        print(f"⚠️  {ruta}: no tiene </body>, se queda sin la marca de la academia.")
        return s
    arriba = "../" * ruta.count("/")
    # academias.html ya lo carga en el <head>, porque lo usa su propio script:
    # sumarlo de nuevo era un pedido de más (el script no corre dos veces, pero
    # se baja y se lee igual). verificar-carga-paginas.js lo vigila.
    if f'src="{arriba}js/marca-academia.js"' in s:
        return s
    return (s[:cierre] + MARCA_INICIO
            + f'<script src="{arriba}js/marca-academia.js" defer></script>'
            + MARCA_FIN + s[cierre:])


# Las migas de pan ("Academia › Juegos › Niebla de Guerra"): el camino de
# vuelta, igual en todas las páginas de la Academia. Antes cada página se
# escribía el suyo a mano, y había de todo: "← 🏛️ Academia", "Volver al
# panel", "← Panel", "← Volver al panel de Clases", un botón en sesion.html,
# un enlace suelto dentro de la barra de Entrenamiento… y en varias no había
# ninguno: el único camino de salida era saber que el logo lleva al panel.
#
# Van en una franja justo DEBAJO del encabezado y fuera de él: el encabezado
# es `sticky` y cada renglón que se le suma se come pantalla en todas las
# páginas con tablero; la franja se va con el scroll como cualquier otro
# contenido. Van alineadas con el logo (el mismo max-w-7xl del encabezado),
# no con el contenido de cada página, que tiene anchos distintos.
#
# PADRE dice de qué página cuelga cada una: el camino se arma subiendo hasta
# clases.html. Es el lugar desde donde se llega de verdad (el panel, Juegos,
# Administración), no la carpeta. clases.html no lleva migas: es la raíz.
# Una página nueva de la lista PAGINAS que no esté acá hace fallar el script,
# para que nadie la agregue sin decir de dónde cuelga.
MIGAS_INICIO = "<!-- migas: inicio -->"
MIGAS_FIN = "<!-- migas: fin -->"

NOMBRE_Y_PADRE = {
    "clases.html": ("Academia", None),
    "admin.html": ("Administración", "clases.html"),
    "admin-jugador.html": ("Base de datos de jugadores", "admin.html"),
    "inscripciones.html": ("Inscripciones a torneos", "admin.html"),
    "novedades.html": ("Actualizaciones", "admin.html"),
    "arbitraje.html": ("Examen de arbitraje", "clases.html"),
    "asistencia.html": ("Asistencia presencial", "clases.html"),
    "ciegos.html": ("Ciegos", "clases.html"),
    "cobros.html": ("Cobros", "clases.html"),
    "configuracion.html": ("Configuración", "clases.html"),
    "formularios.html": ("Formularios de inscripción", "clases.html"),
    "informes.html": ("Informes", "clases.html"),
    "juegos.html": ("Juegos", "clases.html"),
    "lector-planilla.html": ("Lector de planilla", "clases.html"),
    "logros.html": ("Logros", "clases.html"),
    "partidas.html": ("Archivos", "clases.html"),
    "examenes.html": ("Exámenes", "clases.html"),
    "examen.html": ("Examen", "examenes.html"),
    "planes.html": ("Planes de clase", "clases.html"),
    "racha-tactica.html": ("Racha táctica", "clases.html"),
    "reportes.html": ("Reportes de actividades", "clases.html"),
    "sesion.html": ("Sesión en vivo", "clases.html"),
    "coordinacion.html": ("Coordinación", "clases.html"),
    "subgrupos.html": ("Subgrupos", "clases.html"),
    "tareas.html": ("Tareas", "clases.html"),
    "informe-mensual.html": ("Informe mensual", "clases.html"),
    "supervision.html": ("Supervisión", "clases.html"),
    "academias.html": ("Academias", "clases.html"),
    "tablero-academias.html": ("Tablero por academia", "clases.html"),
    "tienda.html": ("Tienda", "clases.html"),
    "accesos.html": ("Accesos y cupos", "clases.html"),
    "torneos.html": ("Torneos", "clases.html"),
    "torneo.html": ("Torneo", "torneos.html"),
    "cartas.html": ("Ajedrez de Cartas", "juegos.html"),
    "concentracion.html": ("Concentración", "juegos.html"),
    "crazyhouse.html": ("Crazyhouse", "juegos.html"),
    "cuatro-jugadores.html": ("Ajedrez para 4", "juegos.html"),
    "duelo.html": ("Duelo Simultáneo", "juegos.html"),
    "estandar.html": ("Ajedrez Estándar", "juegos.html"),
    "ilumina-tablero.html": ("Ilumina el Tablero", "juegos.html"),
    "niebla.html": ("Niebla de Guerra", "juegos.html"),
    "variante.html": ("Partida", "juegos.html"),
    "sonar.html": ("El Sonar", "juegos.html"),
    "entreno/index.html": ("Entrenamiento", "clases.html"),
    "entreno/estudio.html": ("Estudio", "clases.html"),
    "entreno/4x4.html": ("4×4", "entreno/index.html"),
    "entreno/aprender.html": ("Aprende", "entreno/index.html"),
    "entreno/coordenadas.html": ("Coordenadas", "entreno/index.html"),
    "entreno/desafios.html": ("Desafíos", "entreno/index.html"),
    "entreno/mates.html": ("Mates", "entreno/index.html"),
    "entreno/practicas.html": ("Practicar", "entreno/index.html"),
    "entreno/temas.html": ("Ejercicios por tema", "entreno/index.html"),
    "entreno/visualizacion.html": ("Visualización", "entreno/index.html"),
    "entreno/aperturas.html": ("Aperturas y celadas", "entreno/index.html"),
    "entreno/precision-posicional.html": ("Precisión posicional", "entreno/index.html"),
    "cursos/academia/index.html": ("Mis cursos", "clases.html"),
}

TITULO_CURSO_RE = re.compile(r"<title>Academia · ([^<]+?) — Ajedrez Integral</title>")


def nombre_y_padre(ruta):
    if ruta in NOMBRE_Y_PADRE:
        return NOMBRE_Y_PADRE[ruta]
    # Un curso nuevo no hace falta anotarlo: su nombre sale de su <title>
    # (lo escribe herramientas/cursos, con la forma "Academia · X — …").
    if ruta.startswith("cursos/academia/"):
        s = open(os.path.join(RAIZ, ruta), encoding="utf-8").read()
        m = TITULO_CURSO_RE.search(s)
        if m:
            return (m.group(1).strip(), "cursos/academia/index.html")
    raise SystemExit(f"❌ {ruta}: no está en NOMBRE_Y_PADRE de academia-cabecera.py — "
                     "agrégala diciendo de qué página cuelga.")


def camino(ruta):
    """De la raíz a la página: [(ruta, nombre), …]."""
    pasos = []
    actual = ruta
    while actual:
        nombre, padre = nombre_y_padre(actual)
        pasos.append((actual, nombre))
        if len(pasos) > 8:
            raise SystemExit(f"❌ {ruta}: NOMBRE_Y_PADRE da vueltas en círculo.")
        actual = padre
    return list(reversed(pasos))


def escapar(t):
    return (t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;"))


def migas(ruta):
    pasos = camino(ruta)
    desde = os.path.dirname(ruta)
    partes = []
    for i, (destino, nombre) in enumerate(pasos):
        sep = '' if i == 0 else '<span aria-hidden="true" class="text-brand-400">›</span>'
        icono = '<span aria-hidden="true">🏛️ </span>' if destino == "clases.html" else ''
        if destino == ruta:
            partes.append(f'<li class="flex items-center gap-2">{sep}'
                          f'<span aria-current="page" class="font-semibold text-white">{icono}{escapar(nombre)}</span></li>')
        else:
            href = os.path.relpath(destino, desde or ".")
            partes.append(f'<li class="flex items-center gap-2">{sep}'
                          f'<a href="{href}" class="text-brand-200 underline underline-offset-2 hover:text-accent-400 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">{icono}{escapar(nombre)}</a></li>')
    return (MIGAS_INICIO
            + '<div class="bg-brand-900">'
            + '<nav id="migas" aria-label="Estás en" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 text-sm">'
            + '<ol class="flex flex-wrap items-center gap-x-2 gap-y-1">'
            + "".join(partes)
            + '</ol></nav></div>'
            + MIGAS_FIN)


def poner_migas(ruta, s):
    i = s.find(MIGAS_INICIO)
    if i >= 0:
        j = s.find(MIGAS_FIN, i)
        s = s[:i] + s[j + len(MIGAS_FIN):]
    if ruta == "clases.html":
        return s
    fin_header = s.find("</header>", s.find('<header id="header"'))
    if fin_header < 0:
        print(f"⚠️  {ruta}: no encontré el encabezado, se queda sin migas.")
        return s
    corte = fin_header + len("</header>")
    return s[:corte] + migas(ruta) + s[corte:]


def procesar(ruta):
    ruta_abs = os.path.join(RAIZ, ruta)
    s = open(ruta_abs, encoding="utf-8").read()
    original = s

    s, n_header = HEADER_RE.subn(cabecera(ruta), s, count=1)
    if n_header != 1:
        print(f"⚠️  {ruta}: no encontré un <header id=\"header\">…</header> único, no se tocó.")
        return False

    s, n_footer = FOOTER_RE.subn(pie(ruta), s, count=1)
    if n_footer != 1:
        print(f"⚠️  {ruta}: no encontré un <footer>…</footer> único, no se tocó.")
        return False

    s = poner_migas(ruta, s)
    s = poner_burbuja(ruta, s)
    s = poner_juego_aviso(ruta, s)
    s = poner_acceso(ruta, s)
    s = poner_tiempo(ruta, s)
    s = poner_modo_vista(ruta, s)
    s = poner_marca(ruta, s)
    s = poner_ayuda(ruta, s)

    if s != original:
        open(ruta_abs, "w", encoding="utf-8").write(s)
        return True
    return False


def main():
    os.chdir(RAIZ)
    tocadas = 0
    for ruta in PAGINAS:
        if not os.path.isfile(ruta):
            print(f"⚠️  {ruta}: no existe, revisa la lista.")
            continue
        if procesar(ruta):
            tocadas += 1
    ya_minimas = len(PAGINAS) - tocadas
    print(f"{len(PAGINAS)} páginas de la Academia revisadas · {tocadas} actualizadas"
          + (f" · {ya_minimas} ya estaban con el encabezado mínimo" if ya_minimas else ""))


if __name__ == "__main__":
    sys.exit(main())
