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
    "informe-mensual.html", "supervision.html", "academias.html",
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
        '<button id="theme-toggle" class="text-white text-lg w-9 h-9 flex items-center justify-center rounded-lg hover:bg-brand-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-800" aria-label="Cambiar a modo oscuro" title="Cambiar entre modo claro y oscuro">'
        '<span id="theme-icon" aria-hidden="true">☀️</span>'
        '</button>'
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
    return (s[:cierre] + MARCA_INICIO
            + f'<script src="{arriba}js/marca-academia.js" defer></script>'
            + MARCA_FIN + s[cierre:])


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

    s = poner_burbuja(ruta, s)
    s = poner_juego_aviso(ruta, s)
    s = poner_acceso(ruta, s)
    s = poner_tiempo(ruta, s)
    s = poner_modo_vista(ruta, s)
    s = poner_marca(ruta, s)

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
