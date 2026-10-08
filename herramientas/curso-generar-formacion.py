#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera el curso 'Formación Ajedrez' (formación docente: reglamento FIDE,
normativa JDE y arbitraje práctico, con torneo real de cierre).

No usa herramientas/curso-generar.py: este curso no es "clásico" — sus
sesiones llevan un quiz con respuesta y por sesión hay tres materiales
(cuadernillo de repaso, presentación y ejercicios), y la última sesión es
presencial, con agenda y evaluación final en vez de quiz y presentación.

Arma:
  cursos/formacion-ajedrez.html            portada y temario — público
  cursos/protegido/formacion-ajedrez.html  fragmento con las 8 sesiones completas
  cursos/academia/formacion-ajedrez.html   página de Academia (clonada de
                                            cursos/academia/fundamentos-del-ajedrez.html)
  cursos/recursos/formacion-ajedrez/       por sesión 1-7: cuadernillo de repaso
                                            (PDF), presentación (.pptx) y
                                            ejercicios (PDF); la sesión 8 trae en
                                            cambio los formularios/lista de
                                            cotejo y la prueba final teórica (20
                                            preguntas reales, tomadas del banco
                                            de js/arbitraje-items.js, cada una
                                            con su artículo del Handbook)

    pip install python-pptx reportlab
    npm install chess.js@0.10.3     (ya lo usa cursos-diagramas.js)
    python3 herramientas/curso-generar-formacion.py

Cada sesión virtual está calculada para 5 horas: su `cronograma` (minutos,
bloque, detalle) tiene que sumar 300, y la agenda presencial va de 8:00 a. m. a
1:00 p. m. Trae además `objetivos`, `temas` (con su fuente), `casos` (situación
y decisión) y `ejercicios` con respuesta; la respuesta de los ejercicios con
posición la calculó chess.js. `node herramientas/verificar-formacion.js`
comprueba todo eso y que lo generado esté al día.

Las presentaciones (.pptx) siguen el estilo de la presentación de la Clase 1
que armó el profe —franja azul, letra grande, una idea por diapositiva— y,
además del .pptx, cada sesión 2 a 7 sale como presentación de la clase en vivo
(cursos/recursos/formacion-ajedrez/presentaciones/clase-NN/: una imagen por
diapositiva y diapositivas.json, ver js/clase-presentacion.js). Para eso hace
falta LibreOffice (pptx a PDF) y PyMuPDF; los tableros salen de
herramientas/lib/tablero-png.js (playwright). La Clase 1 se da con la
presentación propia del profe ("presentacion_clase": "propia"). La guía rápida
de la persona árbitra la arma herramientas/formacion-guia-rapida.py.

    pip install pymupdf pillow      (y LibreOffice instalado)

Las portadas se clonan de un molde, así que salen con las migas y los datos
estructurados del molde: después de generar hay que correr
`python3 herramientas/academia-cabecera.py` y
`python3 herramientas/datos-estructurados.py`, que los vuelven a poner bien.

Después hay que agregar a mano la tarjeta en cursos/academia/index.html — es
lo único que no arma este generador, porque esa página no tiene marcas para
reemplazar un bloque como sí las tiene cursos.html.
"""
import json
import os
import re
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOLDE_PORTADA = os.path.join(RAIZ, "cursos", "finales-practicos.html")
MOLDE_ACADEMIA = os.path.join(RAIZ, "cursos", "academia", "fundamentos-del-ajedrez.html")
DATOS = os.path.join(RAIZ, "herramientas", "cursos", "formacion-ajedrez.json")
PRUEBA_FINAL = os.path.join(RAIZ, "herramientas", "cursos", "formacion-ajedrez-prueba-final.json")

# Paleta del sitio (la misma que usa curso-generar.py)
AZUL_950, AZUL_900, AZUL_800 = "0A1F33", "102A43", "243B53"
AZUL_600, AZUL_400, AZUL_300 = "334E68", "627D98", "9FB3C8"
GRIS_50 = "F0F4F8"
AMBAR_500, AMBAR_400 = "DE911D", "F0B429"
CLARO = "CADCFC"


def numerar(bloques):
    n = 0
    for bloque in bloques:
        bloque["n"] = bloques.index(bloque) + 1
        for leccion in bloque["lecciones"]:
            n += 1
            leccion["n"] = n
            leccion["bloque"] = bloque
    return n


def escapar(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ------------------------------------------------------------------ portada
def portada(curso):
    base = open(MOLDE_PORTADA, encoding="utf-8").read()
    total = sum(len(b["lecciones"]) for b in curso["bloques"])
    slug, titulo, unidad = curso["slug"], curso["titulo"], curso["unidad"]

    bloques_html = []
    for bloque in curso["bloques"]:
        inicio = bloque["lecciones"][0]["n"]
        items = "".join(
            '\n                        <li class="text-brand-600 dark:text-brand-300">%s'
            '<span class="block text-xs text-brand-400 dark:text-brand-500 mt-0.5">%s</span></li>'
            % (escapar(l["titulo"]), escapar(l["resumen"]))
            for l in bloque["lecciones"])
        bloques_html.append(
            '                <div>\n'
            '                    <h3 class="font-serif text-lg font-bold text-brand-800 dark:text-white mb-3">Bloque %d · %s</h3>\n'
            '                    <ol start="%d" class="space-y-2 list-decimal pl-5 marker:text-accent-600 marker:font-semibold">%s\n'
            '                    </ol>\n'
            '                </div>' % (bloque["n"], escapar(bloque["titulo"]), inicio, items))

    articulo = '''    <article class="pt-8 pb-16">
        <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <a href="../cursos.html" class="inline-flex items-center gap-1 text-sm text-brand-500 dark:text-brand-400 hover:text-accent-500 transition-colors mb-4"><span aria-hidden="true">←</span> Volver a Cursos</a>
            <span class="text-xs text-accent-600 font-semibold uppercase tracking-wide">{nivel}</span>
            <h1 class="font-serif text-3xl md:text-4xl font-bold text-brand-800 dark:text-white mt-2 mb-3">{titulo}</h1>
            <p class="text-brand-500 dark:text-brand-400 mb-6">{resumen}</p>
            <div aria-hidden="true" class="h-48 bg-gradient-to-br {gradiente} rounded-2xl flex items-center justify-center text-7xl mb-6">{emoji}</div>

            <p class="text-brand-600 dark:text-brand-300 mb-8">{descripcion_larga}</p>

            <div class="flex flex-wrap items-center gap-4 mb-10 bg-white dark:bg-brand-900 rounded-xl shadow-md p-5">
                <div class="flex-1 min-w-[180px]">
                    <p class="text-sm text-brand-500 dark:text-brand-400"><strong class="text-brand-800 dark:text-white">{total} {unidad}</strong> · {nivel}</p>
                    <p class="text-xs text-brand-400 dark:text-brand-500 mt-0.5">{duracion_texto}</p>
                </div>
            </div>

            <h2 class="font-serif text-2xl font-bold text-brand-800 dark:text-white mb-6">Temario del curso</h2>
            <div class="space-y-8">
{bloques}
            </div>

            <section aria-labelledby="academia-invite" class="mt-12 rounded-2xl bg-brand-800 dark:bg-brand-900 p-6 md:p-8 text-center shadow-lg">
                <p class="text-accent-400 text-xs font-semibold uppercase tracking-wide">Contenido completo</p>
                <h2 id="academia-invite" class="font-serif text-2xl font-bold text-white mt-2 mb-3">Este curso se estudia en Ajedrez Integral</h2>
                <p class="text-brand-200 text-sm max-w-2xl mx-auto mb-2">Cada sesión, de 5 horas, desarrollada por completo: el cronograma, el contenido para ver en clase con ejemplos y casos, la práctica con ejercicios resueltos, el quiz con su respuesta y la tarea, con su presentación y su cuadernillo de repaso. La Sesión 8 es presencial y cierra el curso con un torneo real, la evaluación final y la entrega de certificados.</p>
                <p class="text-brand-200 text-sm max-w-2xl mx-auto mb-6">Las {total} sesiones completas están dentro del panel de Ajedrez Integral, en orden y con tu línea de progreso: cada sesión se abre al terminar la anterior, y tu profesor ve hasta dónde llegaste.</p>
                <div class="flex flex-wrap justify-center gap-3">
                    <a href="../precios.html" class="inline-block bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-6 py-2.5 rounded-lg transition-colors">💬 Inscribirme en Ajedrez Integral</a>
                    <a href="../login.html?next=cursos/academia/{slug}.html" class="inline-block border border-brand-400 hover:border-accent-400 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors">Ya soy alumno: iniciar sesión →</a>
                </div>
                <p class="text-brand-200 text-sm mt-5">¿No sabes qué nivel tienes? <a href="../entreno/diagnostico.html" class="text-accent-400 hover:text-accent-300 font-semibold underline">Haz el diagnóstico de nivel gratis</a> (20 minutos, sin cuenta) y el profesor ve tu resultado.</p>
            </section>

            <nav aria-label="Navegación entre cursos" class="mt-10 flex items-center justify-between border-t border-brand-100 dark:border-brand-800 pt-6">
                <a href="{anterior_href}" class="text-sm text-brand-500 dark:text-brand-400 hover:text-accent-500 transition-colors" aria-label="Curso anterior: {anterior_titulo}"><span aria-hidden="true">←</span> {anterior_titulo}</a>
                <a href="{siguiente_href}" class="text-sm text-brand-500 dark:text-brand-400 hover:text-accent-500 transition-colors text-right" aria-label="Siguiente curso: {siguiente_titulo}">{siguiente_titulo} <span aria-hidden="true">→</span></a>
            </nav>
        </div>
    </article>'''.format(
        nivel=escapar(curso["nivel"]), titulo=escapar(titulo), resumen=escapar(curso["resumen"]),
        gradiente=curso["gradiente"], emoji=curso["emoji"],
        descripcion_larga=escapar(curso["descripcion_larga"]),
        total=total, unidad=unidad, slug=slug, bloques="\n".join(bloques_html),
        duracion_texto=escapar(curso["duracion_texto"]),
        anterior_href=curso["anterior"]["href"], anterior_titulo=escapar(curso["anterior"]["titulo"]),
        siguiente_href=curso["siguiente"]["href"], siguiente_titulo=escapar(curso["siguiente"]["titulo"]))

    salida, n = re.subn(r'<article class="pt-8 pb-16">.*?</article>', lambda m: articulo, base, flags=re.S)
    assert n == 1, "no encontré el <article> del molde de portada — revisar MOLDE_PORTADA"
    salida, n = re.subn(re.escape("<title>Finales Prácticos — Ajedrez Integral</title>"),
                        lambda m: "<title>%s — Ajedrez Integral</title>" % escapar(titulo), salida)
    assert n == 1, "no encontré el <title> del molde de portada"
    descripcion_meta = "Temario completo del curso %s: %s" % (titulo, curso["resumen"])
    salida = re.sub(r'<meta name="description" content="[^"]*">',
                    '<meta name="description" content="%s">' % escapar(descripcion_meta), salida, count=1)
    salida = re.sub(r'<link rel="canonical" href="[^"]*">',
                    '<link rel="canonical" href="https://ajedrez-integral.com/cursos/%s.html">' % slug, salida)
    salida = re.sub(r'<meta property="og:title" content="[^"]*">',
                    '<meta property="og:title" content="%s — Ajedrez Integral">' % escapar(titulo), salida)
    salida = re.sub(r'<meta property="og:description" content="[^"]*">',
                    '<meta property="og:description" content="%s">' % escapar(descripcion_meta), salida)
    salida = re.sub(r'<meta property="og:url" content="[^"]*">',
                    '<meta property="og:url" content="https://ajedrez-integral.com/cursos/%s.html">' % slug, salida)
    return salida


# ---------------------------------------------------- fragmento con lecciones
def quiz_html(leccion):
    # Sin h5 ni data-curso-enc: eso lo pone js/curso-adaptado.js en el
    # navegador (ponerEncabezados()), igual que con el resto del curso. Si se
    # deja ya puesto acá pero con la etiqueta sin convertir, ese script lo da
    # por hecho y lo salta — y el <summary> se queda sin encabezado para
    # siempre.
    partes = []
    for i, q in enumerate(leccion.get("quiz", []), 1):
        partes.append(
            '<details class="f100-sol"><summary>Pregunta %d — ver respuesta</summary>'
            '<p>%s</p><p><strong>Respuesta:</strong> %s</p></details>'
            % (i, escapar(q["pregunta"]), escapar(q["respuesta"])))
    return "".join(partes)


def agenda_html(leccion):
    filas = "".join(
        '<tr><td class="pr-4 py-1 font-semibold text-brand-700 dark:text-brand-200 whitespace-nowrap align-top">%s</td>'
        '<td class="py-1">%s</td></tr>' % (escapar(h), escapar(t))
        for h, t in leccion["agenda"])
    return '<table class="text-sm w-full"><tbody>%s</tbody></table>' % filas


def cronograma_filas(leccion):
    """(inicio, fin, minutos, bloque, detalle) de cada bloque, con la hora contada
    desde el comienzo de la sesión: las sesiones virtuales no tienen una hora de
    reloj fija, pero sí una duración (5 horas) que el cronograma tiene que llenar."""
    filas, t = [], 0
    for minutos, bloque, detalle in leccion["cronograma"]:
        filas.append(("%d:%02d" % divmod(t, 60), "%d:%02d" % divmod(t + minutos, 60), minutos, bloque, detalle))
        t += minutos
    return filas


def duracion_texto(minutos):
    h, m = divmod(minutos, 60)
    return ("%d horas" % h if h != 1 else "1 hora") + (" %d minutos" % m if m else "")


def cronograma_html(leccion):
    filas = "".join(
        '<tr class="border-t border-brand-100 dark:border-brand-700">'
        '<td class="pr-3 py-1.5 font-semibold text-brand-700 dark:text-brand-200 whitespace-nowrap align-top">%s–%s</td>'
        '<td class="pr-3 py-1.5 whitespace-nowrap align-top">%d min</td>'
        '<td class="py-1.5"><strong>%s</strong>%s</td></tr>'
        % (ini, fin, m, escapar(b), (" " + escapar(d)) if d else "")
        for ini, fin, m, b, d in cronograma_filas(leccion))
    total = sum(f[2] for f in cronograma_filas(leccion))
    return ('<table class="text-sm w-full"><caption class="sr-only">Cronograma de la sesión, %s en total</caption>'
            '<thead><tr class="text-left text-xs uppercase tracking-wide text-brand-450 dark:text-brand-350">'
            '<th scope="col" class="pr-3 pb-1">Tiempo</th><th scope="col" class="pr-3 pb-1">Duración</th>'
            '<th scope="col" class="pb-1">Actividad</th></tr></thead><tbody>%s</tbody></table>'
            % (duracion_texto(total), filas))


def temas_html(leccion):
    partes = []
    for t in leccion["temas"]:
        partes.append('<h6 class="font-semibold text-brand-800 dark:text-white mt-3 mb-1">%s</h6>' % escapar(t["titulo"]))
        partes.append("<p>%s</p>" % escapar(t["texto"]))
        if t.get("puntos"):
            partes.append('<ul class="list-disc list-inside space-y-1">%s</ul>'
                          % "".join("<li>%s</li>" % escapar(x) for x in t["puntos"]))
        partes.append('<p class="text-xs text-brand-450 dark:text-brand-350">Fuente: %s</p>' % escapar(t["fuente"]))
    return "".join(partes)


def casos_html(leccion):
    # Mismo patrón que el quiz: la situación se lee primero y la decisión queda
    # plegada, para discutirla en clase antes de mirarla.
    return "".join(
        '<details class="f100-sol"><summary>Caso %d — %s</summary>'
        '<p>%s</p><p><strong>Decisión:</strong> %s</p><p class="text-xs">Fuente: %s</p></details>'
        % (i, escapar(c["titulo"]), escapar(c["situacion"]), escapar(c["decision"]), escapar(c["fuente"]))
        for i, c in enumerate(leccion["casos"], 1))


def ejercicios_html(leccion):
    partes = []
    for i, e in enumerate(leccion["ejercicios"], 1):
        posicion = ""
        if e.get("fen"):
            posicion = ('<p>%s</p><p class="text-xs break-all">FEN: <code>%s</code></p>'
                        % (escapar(e["posicion"]), escapar(e["fen"])))
        partes.append('<details class="f100-sol"><summary>Ejercicio %d — ver respuesta</summary>'
                      '<p>%s</p>%s<p><strong>Respuesta:</strong> %s</p></details>'
                      % (i, escapar(e["enunciado"]), posicion, escapar(e["respuesta"])))
    return "".join(partes)


def archivos_de(leccion):
    """Los archivos de una sesión, (nombre, texto del botón), en el orden en que
    se muestran: los usan la página del curso y sesiones.json (la ficha
    Asesores de administración), así que se escriben una sola vez."""
    l = leccion
    if l.get("presencial"):
        return [(l["archivo_formularios"] + ".pdf", "📚 Formularios y lista de cotejo (PDF)"),
                (l["archivo_prueba"] + ".pdf", "📄 Prueba final teórica (PDF)")]
    return ([(l["archivo"] + "-material.pdf", "📚 Material de estudio (PDF)"),
             (l["archivo"] + ".pptx", "📊 Descargar presentación"),
             (l["archivo"] + "-ejercicios.pdf", "📄 Descargar ejercicios (PDF)")]
            + [(x["archivo"], x.get("emoji", "") + " " + x["texto"]) for x in l.get("extras", [])])


def sesiones_datos(curso, carpeta):
    """Lo que va en cursos/recursos/<slug>/sesiones.json: las sesiones en orden,
    con sus archivos y su presentación para la clase (si la tiene). Lo lee la
    ficha Asesores (js/admin-asesores.js) para preparar el curso sesión por
    sesión; verificar-formacion.js comprueba que esté al día."""
    sesiones = []
    for bloque in curso["bloques"]:
        for l in bloque["lecciones"]:
            deck = "%s/clase-%02d" % (curso["slug"], l["n"])
            hay = os.path.isfile(os.path.join(carpeta, "presentaciones", "clase-%02d" % l["n"], "diapositivas.json"))
            sesiones.append({
                "n": l["n"],
                "titulo": l["titulo"],
                "resumen": l["resumen"],
                "presencial": bool(l.get("presencial")),
                "archivos": [{"archivo": a, "texto": t} for a, t in archivos_de(l)],
                "presentacion": deck if hay else None,
            })
    return {"_comentario": "Generado por herramientas/curso-generar-formacion.py: no se edita a mano.",
            "curso": curso["slug"], "titulo": curso["titulo"], "sesiones": sesiones}


def sesiones_json(curso, carpeta):
    with open(os.path.join(carpeta, "sesiones.json"), "w", encoding="utf-8") as fh:
        json.dump(sesiones_datos(curso, carpeta), fh, ensure_ascii=False, indent=1)
        fh.write("\n")


def protegido(curso):
    slug = curso["slug"]
    # Sin data-curso-mat: js/curso-adaptado.js (marcarMaterial) lo marca solo
    # al vuelo, mirando la extensión del enlace (.pdf/.pptx).
    boton = ('<a href="../recursos/{slug}/{arch}" class="inline-flex items-center gap-1.5 '
             'bg-brand-100 dark:bg-brand-700 text-brand-700 dark:text-brand-100 text-xs font-medium '
             'px-3 py-1.5 rounded-lg hover:bg-brand-200 dark:hover:bg-brand-600 transition-colors">{texto}</a>')
    partes = []
    for bloque in curso["bloques"]:
        detalles = []
        for l in bloque["lecciones"]:
            cuerpo = ['<h5 class="font-serif text-base font-bold text-brand-800 dark:text-white mt-1 mb-1">%s</h5>'
                      % ("Contenido de la sesión" if l.get("presencial") else "Contenido para ver en clase"),
                      '<ul class="list-disc list-inside space-y-1">%s</ul>'
                      % "".join("<li>%s</li>" % escapar(c) for c in l["contenido"])]

            if l.get("presencial"):
                cuerpo.append('<h5 class="font-serif text-base font-bold text-brand-800 dark:text-white mt-4 mb-1">Agenda del día</h5>')
                cuerpo.append(agenda_html(l))
                cuerpo.append('<h5 class="font-serif text-base font-bold text-brand-800 dark:text-white mt-4 mb-1">Evaluación final y certificación</h5>')
                cuerpo.append('<p>%s</p>' % escapar(l["evaluacion"]))
            else:
                cuerpo.insert(0, '<h5 class="font-serif text-base font-bold text-brand-800 dark:text-white mt-1 mb-1">Objetivos de la sesión</h5>'
                                 '<ul class="list-disc list-inside space-y-1">%s</ul>'
                                 '<h5 class="font-serif text-base font-bold text-brand-800 dark:text-white mt-4 mb-1">Cronograma de la sesión (5 horas)</h5>%s'
                              % ("".join("<li>%s</li>" % escapar(o) for o in l["objetivos"]), cronograma_html(l)))
                cuerpo[1] = cuerpo[1].replace("mt-1 mb-1", "mt-4 mb-1")
                cuerpo.append(temas_html(l))
                cuerpo.append('<h5 class="font-serif text-base font-bold text-brand-800 dark:text-white mt-4 mb-1">Ejemplos y casos para comentar</h5>')
                cuerpo.append('<p>Lee cada situación y decide qué harías antes de abrir la decisión.</p>')
                cuerpo.append(casos_html(l))
                cuerpo.append('<h5 class="font-serif text-base font-bold text-brand-800 dark:text-white mt-4 mb-1">Práctica — %s</h5>'
                              % escapar(l["practica_titulo"]))
                cuerpo.append('<p>%s</p>' % escapar(l["practica"]))
                cuerpo.append(ejercicios_html(l))
                cuerpo.append('<h5 class="font-serif text-base font-bold text-brand-800 dark:text-white mt-4 mb-1">Quiz de la sesión</h5>')
                cuerpo.append(quiz_html(l))
                cuerpo.append('<h5 class="font-serif text-base font-bold text-brand-800 dark:text-white mt-4 mb-1">Tarea</h5>')
                cuerpo.append('<p>%s</p>' % escapar(l["tarea"]))

            botones = "".join(boton.format(slug=slug, arch=a, texto=escapar(t)) for a, t in archivos_de(l))
            titulo_lec = escapar(l["titulo"])
            if l.get("presencial"):
                titulo_lec += (' <span class="text-xs font-normal text-accent-700 dark:text-accent-400 uppercase '
                               'tracking-wide">· Sesión presencial, 5 horas</span>')

            # Sin data-curso-enc, sin ac-marca y sin envolver el título en un
            # h4: eso lo hace js/curso-adaptado.js (ponerEncabezados) y
            # js/curso-academia.js (la marca ✔/🔒) al inyectar el fragmento,
            # igual que en el resto de los cursos. Si el summary ya trajera el
            # h4 puesto pero SIN el data-curso-enc, curso-adaptado.js lo
            # volvería a envolver y quedarían dos; si trajera el atributo pero
            # el bloque siguiente se quedara como h4 sin convertir (como pasó
            # acá antes de esta nota), el script lo da por hecho y lo salta
            # para siempre — mejor dejar que arranque siempre desde cero.
            detalles.append(
                '<details class="bg-brand-50 dark:bg-brand-800 rounded-lg px-4 py-3">'
                '<summary class="cursor-pointer font-semibold text-brand-800 dark:text-white marker:text-accent-600">%d. %s</summary>'
                '<div class="mt-3 text-sm text-brand-600 dark:text-brand-300 space-y-2 leading-relaxed">%s</div>'
                '<div class="mt-3 flex flex-wrap gap-2">%s</div>'
                '<div class="ac-foot"><button class="ac-btn" type="button">✅ Marcar lección como estudiada</button>'
                '<span class="ac-estado" aria-live="polite"></span></div></details>'
                % (l["n"], titulo_lec, "".join(cuerpo), botones))
        partes.append(
            '                    <div>\n'
            '                        <h4 class="font-serif text-base font-bold text-brand-800 dark:text-white mb-2">Bloque %d · %s</h4>\n'
            '                        <div class="space-y-2">\n                            %s\n'
            '                        </div>\n'
            '                    </div>' % (bloque["n"], escapar(bloque["titulo"]),
                                            "\n                            ".join(detalles)))
    return "\n".join(partes) + "\n"


# ----------------------------------------------------------------- academia
def academia(curso):
    base = open(MOLDE_ACADEMIA, encoding="utf-8").read()
    total = sum(len(b["lecciones"]) for b in curso["bloques"])
    slug, titulo, unidad = curso["slug"], curso["titulo"], curso["unidad"]

    articulo = '''    <article class="pt-8 pb-16">
        <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <span class="text-xs text-accent-700 dark:text-accent-400 font-semibold uppercase tracking-wide">{nivel}</span>
            <h1 class="font-serif text-3xl md:text-4xl font-bold text-brand-800 dark:text-white mt-2 mb-3">{titulo}</h1>
            <p class="text-brand-500 dark:text-brand-300 mb-6">{descripcion_larga}</p>
            <div aria-hidden="true" class="h-48 bg-gradient-to-br {gradiente} rounded-2xl flex items-center justify-center text-7xl mb-6">{emoji}</div>

            <div class="flex flex-wrap items-center gap-4 mb-10 bg-white dark:bg-brand-900 rounded-xl shadow-md p-5">
                <div class="flex-1 min-w-[180px]">
                    <p class="text-sm text-brand-500 dark:text-brand-300"><strong class="text-brand-800 dark:text-white">{total} {unidad}</strong> · {nivel} · 1 evaluación final</p>
                    <p class="text-xs text-brand-450 dark:text-brand-350 mt-0.5">{duracion_texto}</p>
                </div>
            </div>

            <section aria-labelledby="ac-contenido">
                <h2 id="ac-contenido" class="font-serif text-2xl font-bold text-brand-800 dark:text-white mb-1">Tus lecciones</h2>
                <p class="text-brand-500 dark:text-brand-300 text-sm mb-5">Cada sesión dura 5 horas e incluye su cronograma, el contenido para ver en clase con ejemplos y casos, una práctica con ejercicios resueltos, un quiz de evaluación y una tarea, además del material de apoyo y la presentación descargables. Las sesiones se abren en orden: al terminar una, márcala como estudiada y se desbloquea la siguiente. La Sesión 8 es presencial y cierra el curso con un torneo real, la evaluación final y la entrega de certificados.</p>
                <div id="ac-progreso" class="ac-prog" aria-label="Tu progreso en el curso"></div>
                <div id="ac-avisos" class="ac-avisos" aria-live="polite" role="status"></div>
                <div id="course-content-body" data-course="{slug}" data-titulo="{titulo}" class="space-y-8">
                    <p class="text-sm text-brand-450 dark:text-brand-350">Cargando lecciones…</p>
                </div>
            </section>


            <nav aria-label="Navegación entre cursos" class="mt-10 flex items-center justify-between border-t border-brand-100 dark:border-brand-800 pt-6">
                <a href="{anterior_href}" class="text-sm text-brand-500 dark:text-brand-300 hover:text-accent-500 transition-colors" aria-label="Curso anterior: {anterior_titulo}"><span aria-hidden="true">←</span> {anterior_titulo}</a>
                <a href="{siguiente_href}" class="text-sm text-brand-500 dark:text-brand-300 hover:text-accent-500 transition-colors text-right" aria-label="Siguiente curso: {siguiente_titulo}">{siguiente_titulo} <span aria-hidden="true">→</span></a>
            </nav>
        </div>
    </article>'''.format(
        nivel=escapar(curso["nivel"]), titulo=escapar(titulo),
        descripcion_larga=escapar(curso["descripcion_larga"]),
        gradiente=curso["gradiente"], emoji=curso["emoji"],
        total=total, unidad=unidad, slug=slug,
        duracion_texto=escapar(curso["duracion_texto"]),
        anterior_href=curso["anterior"]["href"], anterior_titulo=escapar(curso["anterior"]["titulo"]),
        siguiente_href=curso["siguiente"]["href"], siguiente_titulo=escapar(curso["siguiente"]["titulo"]))

    salida, n = re.subn(r'<article class="pt-8 pb-16">.*?</article>', lambda m: articulo, base, flags=re.S)
    assert n == 1, "no encontré el <article> del molde de academia — revisar MOLDE_ACADEMIA"
    salida, n = re.subn(re.escape("<title>Academia · Fundamentos del Ajedrez — Ajedrez Integral</title>"),
                        lambda m: "<title>Academia · %s — Ajedrez Integral</title>" % escapar(titulo), salida)
    assert n == 1, "no encontré el <title> del molde de academia"
    salida = re.sub(r'<meta name="description" content="[^"]*">',
                    '<meta name="description" content="%s">' % escapar(curso["descripcion_larga"]), salida, count=1)
    return salida


# ------------------------------------------------------------- presentaciones
# ------------------------------------------------------- presentación (.pptx)
# Con el estilo de la presentación de la Clase 1 que armó el profe: fondo
# blanco, franja azul con el título, letra grande (las listas, de 22 pt para arriba) y
# una idea por diapositiva. Lo que no cabe a buen tamaño se parte en otra
# diapositiva «(continuación)», nunca se achica hasta no leerse. La misma lista
# de diapositivas (título, texto completo, notas y posiciones) se guarda para
# la presentación de la clase en vivo (ver presentaciones_de_clase).
AZUL_T, PIZARRA_T, VERDE_T, OSCURO_T = "3172AC", "4E6178", "15803D", "102A43"
FUENTE_TTF = "/usr/share/fonts/truetype/crosextra/Carlito-Regular.ttf"   # métrica de Calibri


def _medidor():
    try:
        from PIL import ImageFont
        cache = {}

        def ancho(texto, pt):
            if pt not in cache:
                cache[pt] = ImageFont.truetype(FUENTE_TTF, pt * 10)
            return cache[pt].getlength(texto) / 10.0
        return ancho
    except Exception:  # sin la fuente, una estimación prudente
        return lambda texto, pt: len(texto) * pt * 0.52


def lineas_que_ocupa(texto, pt, ancho_in, ancho):
    max_pt = ancho_in * 72
    total = 0
    for parrafo in texto.split("\n"):
        palabras, linea, n = parrafo.split(" "), "", 1
        for p in palabras:
            prueba = (linea + " " + p).strip()
            if ancho(prueba, pt) > max_pt and linea:
                n, linea = n + 1, p
            else:
                linea = prueba
        total += n
    return total


def cabe(parrafos, pt, ancho_in, alto_in, ancho, interlineado=1.2, entre=0.45):
    alto = 0.0
    for t in parrafos:
        alto += lineas_que_ocupa(t, pt, ancho_in, ancho) * pt * interlineado / 72.0 + entre * pt / 72.0
    return alto <= alto_in


def tamano_que_cabe(parrafos, ancho_in, alto_in, ancho, maximo=28, minimo=18):
    for pt in range(maximo, minimo - 1, -1):
        if cabe(parrafos, pt, ancho_in, alto_in, ancho):
            return pt
    return None


def presentacion(curso, leccion, destino):
    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
    import tempfile

    ancho = _medidor()
    W, H = 13.333, 7.5
    diapos = []        # lo mismo, para la clase en vivo

    def rgb(h):
        return RGBColor.from_string(h)

    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(W), Inches(H)
    vacio = prs.slide_layouts[6]

    def figura(d, x, y, an, al, color, forma=MSO_SHAPE.RECTANGLE, borde=None):
        f = d.shapes.add_shape(forma, Inches(x), Inches(y), Inches(an), Inches(al))
        f.fill.solid()
        f.fill.fore_color.rgb = rgb(color)
        if borde:
            f.line.color.rgb = rgb(borde)
            f.line.width = Pt(1.5)
        else:
            f.line.fill.background()
        f.shadow.inherit = False
        return f

    def caja(d, x, y, an, al, parrafos, pt, color, negrita=False, centrado=False, vertical=None, vinetas=False):
        tb = d.shapes.add_textbox(Inches(x), Inches(y), Inches(an), Inches(al))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = Inches(0.05)
        if vertical:
            tf.vertical_anchor = vertical
        if isinstance(parrafos, str):
            parrafos = [parrafos]
        for i, texto in enumerate(parrafos):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            p.space_after = Pt(pt * 0.45)
            if centrado:
                p.alignment = PP_ALIGN.CENTER
            r = p.add_run()
            r.text = ("•  " if vinetas else "") + texto
            r.font.size, r.font.bold, r.font.name = Pt(pt), negrita, "Calibri"
            r.font.color.rgb = rgb(color)
        return tb

    def nueva(titulo, subtitulo=None, notas=None, texto_clase=None, posiciones=None, fuente=None, oscura=False):
        d = prs.slides.add_slide(vacio)
        if oscura:
            figura(d, 0, 0, W, H, OSCURO_T)
        else:
            figura(d, 0, 0, W, 1.05, AZUL_T)
            caja(d, 0.5, 0.12, W - 1.0, 0.85, titulo, tamano_que_cabe([titulo], W - 1.0, 0.8, ancho, 34, 24) or 24,
                 "FFFFFF", True, True, MSO_ANCHOR.MIDDLE)
            if subtitulo:
                figura(d, 0, 1.05, W, 0.6, PIZARRA_T)
                caja(d, 0.5, 1.08, W - 1.0, 0.55, subtitulo, tamano_que_cabe([subtitulo], W - 1.0, 0.5, ancho, 22, 16) or 16,
                     "FFFFFF", False, True, MSO_ANCHOR.MIDDLE)
        if fuente:
            caja(d, 0.5, H - 0.48, W - 2.2, 0.4, "Fuente: " + fuente, 12, "9FB3C8" if oscura else "627D98")
        caja(d, W - 1.6, H - 0.48, 1.2, 0.4, "%d" % (len(diapos) + 1), 12, "9FB3C8" if oscura else "627D98", centrado=True)
        if notas:
            d.notes_slide.notes_text_frame.text = notas
        diapos.append({"titulo": titulo, "texto": texto_clase or titulo, "notas": notas, "posiciones": posiciones})
        return d

    def cuerpo_y_lista(titulo, subtitulo, intro, puntos, fuente, notas=None):
        """Texto e ítems en la caja gris; si no caben a 20 pt o más, se parte."""
        y0 = 1.95 if subtitulo else 1.4
        alto = H - y0 - 0.75
        resto, primera = list(puntos), True
        while primera or resto:
            parrafos = ([intro] if (primera and intro) else [])
            tomados = []
            while resto:
                prueba = parrafos + ["•  " + p for p in tomados + [resto[0]]]
                if tamano_que_cabe(prueba, W - 1.8, alto - 0.3, ancho, 30, 22) is None and (tomados or parrafos):
                    break
                tomados.append(resto.pop(0))
            todo = parrafos + ["•  " + p for p in tomados]
            pt = tamano_que_cabe(todo, W - 1.8, alto - 0.3, ancho, 30, 20) or 20
            tit = titulo if primera else titulo + " (continuación)"
            d = nueva(tit, subtitulo, notas, " ".join(([intro] if primera and intro else []) + tomados), None, fuente)
            figura(d, 0.5, y0, W - 1.0, alto, "F0F4F8")
            tb = caja(d, 0.85, y0 + 0.15, W - 1.7, alto - 0.3, todo, pt, OSCURO_T)
            if primera and intro and tomados:     # el texto de entrada, en negrita suave
                tb.text_frame.paragraphs[0].runs[0].font.color.rgb = rgb(AZUL_T)
            primera = False

    # 1 · portada
    d = nueva(leccion["titulo"], oscura=True,
              texto_clase="Portada. Sesión %d: %s. %s %s" % (leccion["n"], leccion["titulo"], leccion["resumen"], curso["titulo"]))
    figura(d, 0.8, 2.2, 0.12, 2.6, "F4C430")
    caja(d, 1.15, 1.2, 11, 0.6, "SESIÓN %d  ·  %s" % (leccion["n"], curso["titulo"].upper()), 20, "F4C430", True)
    caja(d, 1.15, 2.1, 11.3, 2.0, leccion["titulo"], tamano_que_cabe([leccion["titulo"]], 11.3, 2.0, ancho, 44, 30) or 30, "FFFFFF", True)
    caja(d, 1.15, 4.25, 11.3, 1.4, leccion["resumen"], 22, "CADCFC")
    caja(d, 1.15, 6.3, 11.3, 0.5, "Programa de Formación para Personas Árbitras y Asesoras  ·  Juegos Deportivos Estudiantiles", 16, "9FB3C8")

    # 2 · objetivos
    cuerpo_y_lista("Objetivos de la sesión", "Al terminar esta sesión, cada participante podrá:", None, leccion["objetivos"], None)

    # 3 · cronograma
    filas = cronograma_filas(leccion)
    d = nueva("Cronograma de la sesión", "Sesión %d · 5 horas (300 minutos)" % leccion["n"], None,
              " ".join("De %s a %s, %s." % (a, b, bloque.lower() if bloque == "Receso" else bloque) for a, b, m, bloque, _ in filas))
    alto_fila = min(0.48, 5.0 / (len(filas) + 1))
    tabla = d.shapes.add_table(len(filas) + 1, 3, Inches(0.8), Inches(1.95), Inches(W - 1.6), Inches(alto_fila * (len(filas) + 1))).table
    tabla.columns[0].width, tabla.columns[1].width, tabla.columns[2].width = Inches(2.3), Inches(1.6), Inches(W - 1.6 - 3.9)
    for j, t in enumerate(["Horario", "Duración", "Bloque"]):
        cel = tabla.cell(0, j)
        cel.text = t
        cel.fill.solid(); cel.fill.fore_color.rgb = rgb(AZUL_T)
        r = cel.text_frame.paragraphs[0].runs[0]
        r.font.size, r.font.bold, r.font.color.rgb, r.font.name = Pt(18), True, rgb("FFFFFF"), "Calibri"
    for i, (a, b, m, bloque, _) in enumerate(filas, 1):
        for j, t in enumerate(["%s – %s" % (a, b), "%d min" % m, bloque]):
            cel = tabla.cell(i, j)
            cel.text = t
            cel.fill.solid(); cel.fill.fore_color.rgb = rgb("FDF3D7" if bloque == "Receso" else ("F0F4F8" if i % 2 else "FFFFFF"))
            r = cel.text_frame.paragraphs[0].runs[0]
            r.font.size, r.font.name = Pt(16), "Calibri"
            r.font.color.rgb, r.font.bold = rgb(OSCURO_T), bloque == "Receso"

    recesos = sum(1 for f in filas if f[3] == "Receso")

    def receso():
        d = nueva("Receso", oscura=True, texto_clase="Receso de 15 minutos. Pausa los relojes: seguimos en breve.")
        caja(d, 0.5, 2.3, W - 1.0, 1.4, "Receso", 72, "FFFFFF", True, True)
        caja(d, 0.5, 3.9, W - 1.0, 1.2, ["15 minutos", "Pausa los relojes: seguimos en breve."], 28, "CADCFC", centrado=True)

    # 4 · temas (y el primer receso a la mitad)
    mitad = (len(leccion["temas"]) + 1) // 2
    for k, t in enumerate(leccion["temas"]):
        cuerpo_y_lista(t["titulo"], None, t["texto"], t.get("puntos") or [], t["fuente"])
        if k + 1 == mitad and recesos >= 1:
            receso()

    # 5 · laboratorio de casos: primero la situación, después la decisión
    for i, c in enumerate(leccion["casos"], 1):
        d = nueva("Caso %d · ¿Qué decide la persona árbitra?" % i, c["titulo"], "Dejar que el grupo decida antes de pasar a la siguiente diapositiva.",
                  "Caso %d: %s. %s" % (i, c["titulo"], c["situacion"]))
        figura(d, 0.5, 1.95, W - 1.0, H - 2.7, "F0F4F8")
        caja(d, 0.9, 2.2, W - 1.8, H - 3.2, c["situacion"], tamano_que_cabe([c["situacion"]], W - 1.8, H - 3.3, ancho, 34, 22) or 22,
             OSCURO_T, vertical=MSO_ANCHOR.MIDDLE)
        d = nueva("Caso %d · Decisión" % i, c["titulo"], None, "Caso %d, decisión: %s" % (i, c["decision"]), None, c["fuente"])
        figura(d, 0.5, 1.95, W - 1.0, H - 2.7, "EEF7EE", borde=VERDE_T)
        caja(d, 0.9, 2.2, W - 1.8, H - 3.2, c["decision"], tamano_que_cabe([c["decision"]], W - 1.8, H - 3.3, ancho, 30, 20) or 20,
             OSCURO_T, vertical=MSO_ANCHOR.MIDDLE)

    if recesos >= 2:
        receso()

    # 6 · práctica
    d = nueva("Práctica · " + leccion["practica_titulo"], None, None, "Práctica: %s. %s" % (leccion["practica_titulo"], leccion["practica"]))
    figura(d, 0.5, 1.4, W - 1.0, H - 2.15, "F0F4F8")
    caja(d, 0.9, 1.6, W - 1.8, H - 2.6, leccion["practica"], tamano_que_cabe([leccion["practica"]], W - 1.8, H - 2.7, ancho, 32, 20) or 20,
         OSCURO_T, vertical=MSO_ANCHOR.MIDDLE)

    # 7 · ejercicios (con tablero si traen posición) y después sus respuestas
    ejercicios = leccion["ejercicios"]
    pngs = []
    tmp = tempfile.mkdtemp()
    for i, e in enumerate(ejercicios, 1):
        if e.get("fen"):
            pngs.append({"fen": e["fen"], "archivo": os.path.join(tmp, "e%d.png" % i), "titulo": "Ejercicio %d" % i})
    if pngs:
        lista = os.path.join(tmp, "lista.json")
        json.dump(pngs, open(lista, "w"))
        subprocess.run(["node", os.path.join(RAIZ, "herramientas", "lib", "tablero-png.js"), lista], check=True)
    for i, e in enumerate(ejercicios, 1):
        titulo = "Ejercicio %d de %d" % (i, len(ejercicios))
        if e.get("fen"):
            turno = "Juegan las blancas." if e["fen"].split(" ")[1] == "w" else "Juegan las negras."
            d = nueva(titulo, None, None, "Ejercicio %d: %s %s %s" % (i, e["enunciado"], turno, e.get("posicion", "")),
                      [{"nombre": "Ejercicio %d" % i, "fen": e["fen"]}])
            d.shapes.add_picture(os.path.join(tmp, "e%d.png" % i), Inches(0.7), Inches(1.35), Inches(5.6), Inches(5.6))
            texto = [e["enunciado"], turno]
            caja(d, 6.7, 1.5, W - 7.2, 5.3, texto, tamano_que_cabe(texto, W - 7.2, 5.2, ancho, 30, 20) or 20, OSCURO_T,
                 vertical=MSO_ANCHOR.MIDDLE)
        else:
            d = nueva(titulo, None, None, "Ejercicio %d: %s" % (i, e["enunciado"]))
            figura(d, 0.5, 1.4, W - 1.0, H - 2.15, "F0F4F8")
            caja(d, 0.9, 1.6, W - 1.8, H - 2.6, e["enunciado"], tamano_que_cabe([e["enunciado"]], W - 1.8, H - 2.7, ancho, 32, 20) or 20,
                 OSCURO_T, vertical=MSO_ANCHOR.MIDDLE)
    cuerpo_y_lista("Ejercicios: respuestas", None, None,
                   ["%d. %s" % (i, e["respuesta"]) for i, e in enumerate(ejercicios, 1)], None,
                   "Repasar en plenaria; cada respuesta con su artículo.")

    # 8 · quiz y sus respuestas
    cuerpo_y_lista("Quiz de la sesión", "Responde de forma individual", None,
                   ["%d. %s" % (i, q["pregunta"]) for i, q in enumerate(leccion["quiz"], 1)], None,
                   "Un minuto por pregunta, y después las respuestas.")
    cuerpo_y_lista("Quiz: respuestas", None, None,
                   ["%d. %s" % (i, q["respuesta"]) for i, q in enumerate(leccion["quiz"], 1)], None)

    # 9 · tarea y cierre
    d = nueva("Tarea y cierre", oscura=True,
              texto_clase="Tarea para la próxima sesión: %s ¿Dudas? Este es el momento. Gracias por tu participación." % leccion["tarea"])
    caja(d, 0.8, 0.7, W - 1.6, 0.6, "TAREA PARA LA PRÓXIMA SESIÓN", 20, "F4C430", True)
    caja(d, 0.8, 1.5, W - 1.6, 3.4, leccion["tarea"], tamano_que_cabe([leccion["tarea"]], W - 1.6, 3.3, ancho, 32, 22) or 22, "FFFFFF")
    caja(d, 0.8, 5.3, W - 1.6, 0.8, "¿Dudas? Este es el momento. Gracias por tu participación.", 24, "CADCFC")
    prs.save(destino)
    return diapos


def presentacion_de_clase(curso, leccion, pptx, diapos):
    """La presentación de la sesión, para mostrarla dentro de la clase en vivo
    (js/clase-presentacion.js): una imagen por diapositiva, sacada del mismo
    .pptx (LibreOffice a PDF y PyMuPDF a WebP de 1600 px), y diapositivas.json
    con el título, el texto completo de cada una (para el lector de pantalla),
    sus notas y las posiciones de los ejercicios, para mandarlas al tablero.
    La Clase 1 no: esa es la presentación propia del profe ("presentacion_clase":
    "propia" en el JSON del curso). Sin LibreOffice o PyMuPDF no se arma y se
    avisa: el resto del curso se genera igual."""
    import shutil
    import tempfile
    if leccion.get("presentacion_clase") == "propia":
        return
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    try:
        import pymupdf
        from PIL import Image
    except ImportError:
        pymupdf = None
    if not soffice or not pymupdf:
        print("  (sin LibreOffice o PyMuPDF: no se armó la presentación de clase de la sesión %d)" % leccion["n"])
        return
    tmp = tempfile.mkdtemp()
    subprocess.run([soffice, "--headless", "--convert-to", "pdf", "--outdir", tmp, pptx],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    pdf = pymupdf.open(os.path.join(tmp, os.path.splitext(os.path.basename(pptx))[0] + ".pdf"))
    if pdf.page_count != len(diapos):
        raise SystemExit("La presentación de la sesión %d salió con %d páginas y %d diapositivas" % (leccion["n"], pdf.page_count, len(diapos)))
    carpeta = os.path.join(RAIZ, "cursos", "recursos", curso["slug"], "presentaciones", "clase-%02d" % leccion["n"])
    if os.path.isdir(carpeta):
        shutil.rmtree(carpeta)
    os.makedirs(carpeta)
    salida = []
    for i, (pagina, d) in enumerate(zip(pdf, diapos), 1):
        import io
        pix = pagina.get_pixmap(matrix=pymupdf.Matrix(1600 / pagina.rect.width, 1600 / pagina.rect.width))
        Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB").save(os.path.join(carpeta, "%02d.webp" % i), "WEBP", quality=80, method=6)
        fila = {"titulo": d["titulo"], "texto": d["texto"], "imagen": "%02d.webp" % i}
        if d.get("notas"):
            fila["notas"] = d["notas"]
        if d.get("posiciones"):
            fila["posiciones"] = d["posiciones"]
        salida.append(fila)
    datos = {"titulo": "%s · Sesión %d: %s" % (curso["titulo"], leccion["n"], leccion["titulo"]),
             "curso": curso["slug"], "diapositivas": salida}
    with open(os.path.join(carpeta, "diapositivas.json"), "w", encoding="utf-8") as fh:
        json.dump(datos, fh, ensure_ascii=False, indent=1)


# --------------------------------------------- material de estudio (PDF)
def material_pdf(curso, leccion, destino):
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import SimpleDocTemplate, Paragraph, HRFlowable, Table, TableStyle

    azul, gris, ambar = HexColor("#" + AZUL_950), HexColor("#" + AZUL_400), HexColor("#" + AMBAR_500)
    est = lambda **kw: ParagraphStyle(**kw)
    s_marca = est(name="marca", fontName="Helvetica-Bold", fontSize=9, textColor=ambar, spaceAfter=2, leading=12)
    s_sub = est(name="sub", fontName="Helvetica-Oblique", fontSize=9.5, textColor=gris, spaceAfter=10, leading=12)
    s_tit = est(name="tit", fontName="Times-Bold", fontSize=18, textColor=azul, spaceAfter=8, leading=22)
    s_sec = est(name="sec", fontName="Helvetica-Bold", fontSize=10, textColor=ambar, spaceBefore=12, spaceAfter=5, leading=13)
    s_txt = est(name="txt", fontName="Helvetica", fontSize=10.5, textColor=HexColor("#" + AZUL_600), leading=15, spaceAfter=7)
    s_item = est(name="item", fontName="Helvetica", fontSize=10.5, textColor=HexColor("#" + AZUL_600),
                 leading=15, spaceAfter=6, leftIndent=14, bulletIndent=2)
    s_preg = est(name="preg", fontName="Helvetica-Bold", fontSize=10.5, textColor=azul, spaceBefore=8, spaceAfter=2, leading=14)
    s_resp = est(name="resp", fontName="Helvetica-Oblique", fontSize=10.5, textColor=HexColor("#" + AZUL_600), spaceAfter=6, leading=14)
    s_fuente = est(name="fuente", fontName="Helvetica-Oblique", fontSize=9, textColor=gris, spaceAfter=6, leading=11)

    def pie(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(gris)
        canvas.drawString(2 * cm, 1.4 * cm, "Ajedrez Integral · ajedrez-integral.com")
        canvas.drawRightString(letter[0] - 2 * cm, 1.4 * cm, curso["titulo"])
        canvas.restoreState()

    doc = SimpleDocTemplate(destino, pagesize=letter, title="%s — Material de estudio, sesión %d" % (curso["titulo"], leccion["n"]),
                            author="Ajedrez Integral", leftMargin=2 * cm, rightMargin=2 * cm,
                            topMargin=2 * cm, bottomMargin=2.2 * cm)
    f = []
    f.append(Paragraph("AJEDREZ INTEGRAL &nbsp;·&nbsp; %s" % escapar(curso["titulo"]).upper(), s_marca))
    f.append(Paragraph("Material de estudio — Sesión %d" % leccion["n"], s_sub))
    f.append(Paragraph(escapar(leccion["titulo"]), s_tit))
    f.append(HRFlowable(width="100%", thickness=1.2, color=ambar, spaceAfter=10))
    f.append(Paragraph("OBJETIVO DE LA SESIÓN", s_sec))
    f.append(Paragraph(escapar(leccion["resumen"]), s_txt))
    for o in leccion["objetivos"]:
        f.append(Paragraph(escapar(o), s_item, bulletText="–"))
    f.append(Paragraph("CRONOGRAMA DE LA SESIÓN (5 HORAS)", s_sec))
    s_celda = est(name="celda", fontName="Helvetica", fontSize=9, textColor=HexColor("#" + AZUL_600), leading=11.5)
    filas = [["Tiempo", "Min", "Actividad"]]
    for a, b, m, bloque, detalle in cronograma_filas(leccion):
        filas.append([a + " - " + b, str(m),
                      Paragraph("<b>%s</b>%s" % (escapar(bloque), (". " + escapar(detalle)) if detalle else ""), s_celda)])
    t = Table(filas, colWidths=[2.4 * cm, 1.2 * cm, 13.9 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (-1, 0), ambar),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, gris),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    f.append(t)
    f.append(Paragraph("CONTENIDO", s_sec))
    for c in leccion["contenido"]:
        f.append(Paragraph(escapar(c), s_item, bulletText="–"))
    for tema in leccion["temas"]:
        f.append(Paragraph(escapar(tema["titulo"]), s_preg))
        f.append(Paragraph(escapar(tema["texto"]), s_txt))
        for x in tema.get("puntos", []):
            f.append(Paragraph(escapar(x), s_item, bulletText="–"))
        f.append(Paragraph("Fuente: " + escapar(tema["fuente"]), s_fuente))
    f.append(Paragraph("EJEMPLOS Y CASOS", s_sec))
    for i, c in enumerate(leccion["casos"], 1):
        f.append(Paragraph("Caso %d. %s" % (i, escapar(c["titulo"])), s_preg))
        f.append(Paragraph(escapar(c["situacion"]), s_txt))
        f.append(Paragraph("Decisión: " + escapar(c["decision"]), s_resp))
        f.append(Paragraph("Fuente: " + escapar(c["fuente"]), s_fuente))
    f.append(Paragraph("PRÁCTICA — " + escapar(leccion["practica_titulo"]), s_sec))
    f.append(Paragraph(escapar(leccion["practica"]), s_txt))
    f.append(Paragraph("EJERCICIOS RESUELTOS", s_sec))
    for i, e in enumerate(leccion["ejercicios"], 1):
        f.append(Paragraph("%d. %s" % (i, escapar(e["enunciado"])), s_preg))
        if e.get("fen"):
            f.append(Paragraph(escapar(e["posicion"]), s_txt))
            f.append(Paragraph("FEN: " + escapar(e["fen"]), s_fuente))
        f.append(Paragraph("Respuesta: " + escapar(e["respuesta"]), s_resp))
    f.append(Paragraph("QUIZ DE REPASO", s_sec))
    for i, q in enumerate(leccion["quiz"], 1):
        f.append(Paragraph("%d. %s" % (i, escapar(q["pregunta"])), s_preg))
        f.append(Paragraph("Respuesta: %s" % escapar(q["respuesta"]), s_resp))
    f.append(Paragraph("TAREA", s_sec))
    f.append(Paragraph(escapar(leccion["tarea"]), s_txt))
    doc.build(f, onFirstPage=pie, onLaterPages=pie)


# --------------------------------------------------------- PDF de ejercicios
def ejercicios_pdf(curso, leccion, destino):
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import SimpleDocTemplate, Paragraph, HRFlowable, PageBreak

    azul, gris, ambar = HexColor("#" + AZUL_950), HexColor("#" + AZUL_400), HexColor("#" + AMBAR_500)
    est = lambda **kw: ParagraphStyle(**kw)
    s_marca = est(name="marca", fontName="Helvetica-Bold", fontSize=9, textColor=ambar, spaceAfter=2, leading=12)
    s_sub = est(name="sub", fontName="Helvetica-Oblique", fontSize=9.5, textColor=gris, spaceAfter=10, leading=12)
    s_tit = est(name="tit", fontName="Times-Bold", fontSize=18, textColor=azul, spaceAfter=8, leading=22)
    s_sec = est(name="sec", fontName="Helvetica-Bold", fontSize=10, textColor=ambar, spaceBefore=12, spaceAfter=5, leading=13)
    s_txt = est(name="txt", fontName="Helvetica", fontSize=10.5, textColor=HexColor("#" + AZUL_600), leading=15, spaceAfter=7)
    s_ej = est(name="ej", fontName="Helvetica-Bold", fontSize=11, textColor=azul, spaceBefore=10, spaceAfter=3, leading=14)
    s_raya = est(name="raya", fontName="Helvetica", fontSize=10.5, textColor=gris, leading=26, spaceAfter=4)

    def pie(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(gris)
        canvas.drawString(2 * cm, 1.4 * cm, "Ajedrez Integral · ajedrez-integral.com")
        canvas.drawRightString(letter[0] - 2 * cm, 1.4 * cm, curso["titulo"])
        canvas.restoreState()

    doc = SimpleDocTemplate(destino, pagesize=letter, title="%s — Ejercicios, sesión %d" % (curso["titulo"], leccion["n"]),
                            author="Ajedrez Integral", leftMargin=2 * cm, rightMargin=2 * cm,
                            topMargin=2 * cm, bottomMargin=2.2 * cm)
    f = []
    f.append(Paragraph("AJEDREZ INTEGRAL &nbsp;·&nbsp; %s" % escapar(curso["titulo"]).upper(), s_marca))
    f.append(Paragraph("Ejercicios de práctica — Sesión %d" % leccion["n"], s_sub))
    f.append(Paragraph(escapar(leccion["titulo"]), s_tit))
    f.append(HRFlowable(width="100%", thickness=1.2, color=ambar, spaceAfter=10))
    f.append(Paragraph(escapar(leccion["practica_titulo"]), s_ej))
    f.append(Paragraph(escapar(leccion["practica"]), s_txt))
    for i, e in enumerate(leccion["ejercicios"], 1):
        f.append(Paragraph("Ejercicio %d. %s" % (i, escapar(e["enunciado"])), s_ej))
        if e.get("fen"):
            f.append(Paragraph(escapar(e["posicion"]), s_txt))
            f.append(Paragraph("FEN: " + escapar(e["fen"]), s_txt))
        for _ in range(2 if e.get("fen") else 4):
            f.append(Paragraph("_" * 88, s_raya))
    f.append(PageBreak())
    f.append(Paragraph("AJEDREZ INTEGRAL &nbsp;·&nbsp; %s" % escapar(curso["titulo"]).upper(), s_marca))
    f.append(Paragraph("Ejercicios de práctica — Sesión %d (continuación)" % leccion["n"], s_sub))
    f.append(HRFlowable(width="100%", thickness=1.2, color=ambar, spaceAfter=10))
    f.append(Paragraph("Explícalo con tus palabras", s_ej))
    f.append(Paragraph("Escribe en tres o cuatro líneas de qué se trata “%s” y por qué le importa a quien arbitra, "
                       "como si se lo explicaras a una persona que recién empieza." % escapar(leccion["titulo"]), s_txt))
    for i in range(3):
        f.append(Paragraph("_" * 88, s_raya))
    f.append(Paragraph("Tarea", s_ej))
    f.append(Paragraph(escapar(leccion["tarea"]), s_txt))
    for i in range(5):
        f.append(Paragraph("_" * 88, s_raya))
    doc.build(f, onFirstPage=pie, onLaterPages=pie)


# ---------------------------------------- sesión 8: formularios + prueba final
def formularios_pdf(curso, leccion, destino):
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import SimpleDocTemplate, Paragraph, HRFlowable, PageBreak, Table, TableStyle

    azul, gris, ambar = HexColor("#" + AZUL_950), HexColor("#" + AZUL_400), HexColor("#" + AMBAR_500)
    est = lambda **kw: ParagraphStyle(**kw)
    s_marca = est(name="marca", fontName="Helvetica-Bold", fontSize=9, textColor=ambar, spaceAfter=2, leading=12)
    s_sub = est(name="sub", fontName="Helvetica-Oblique", fontSize=9.5, textColor=gris, spaceAfter=10, leading=12)
    s_tit = est(name="tit", fontName="Times-Bold", fontSize=18, textColor=azul, spaceAfter=8, leading=22)
    s_sec = est(name="sec", fontName="Helvetica-Bold", fontSize=10, textColor=ambar, spaceBefore=12, spaceAfter=5, leading=13)
    s_txt = est(name="txt", fontName="Helvetica", fontSize=10.5, textColor=HexColor("#" + AZUL_600), leading=15, spaceAfter=7)
    s_campo = est(name="campo", fontName="Helvetica", fontSize=10.5, textColor=HexColor("#" + AZUL_600), leading=26)
    s_check = est(name="check", fontName="Helvetica", fontSize=10, textColor=HexColor("#" + AZUL_600), leading=16, spaceAfter=4)

    def pie(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(gris)
        canvas.drawString(2 * cm, 1.4 * cm, "Ajedrez Integral · ajedrez-integral.com")
        canvas.drawRightString(letter[0] - 2 * cm, 1.4 * cm, curso["titulo"])
        canvas.restoreState()

    doc = SimpleDocTemplate(destino, pagesize=letter, title="%s — Formularios y lista de cotejo" % curso["titulo"],
                            author="Ajedrez Integral", leftMargin=2 * cm, rightMargin=2 * cm,
                            topMargin=2 * cm, bottomMargin=2.2 * cm)
    f = []
    f.append(Paragraph("AJEDREZ INTEGRAL &nbsp;·&nbsp; %s" % escapar(curso["titulo"]).upper(), s_marca))
    f.append(Paragraph("Sesión presencial — Torneo real", s_sub))
    f.append(Paragraph("Formulario de inscripción", s_tit))
    f.append(HRFlowable(width="100%", thickness=1.2, color=ambar, spaceAfter=10))
    f.append(Paragraph("Un formulario por jugador, para la mesa de inscripción del torneo real.", s_txt))
    for campo in ["Nombre completo", "Institución educativa", "Categoría", "Federado (Sí/No) y número FIDE, si tiene",
                  "Persona encargada y teléfono de contacto"]:
        f.append(Paragraph(campo + ":  " + "_" * 55, s_campo))
    f.append(PageBreak())

    f.append(Paragraph("AJEDREZ INTEGRAL &nbsp;·&nbsp; %s" % escapar(curso["titulo"]).upper(), s_marca))
    f.append(Paragraph("Sesión presencial — Torneo real", s_sub))
    f.append(Paragraph("Lista de cotejo de desempeño arbitral", s_tit))
    f.append(HRFlowable(width="100%", thickness=1.2, color=ambar, spaceAfter=10))
    f.append(Paragraph("Persona observada: " + "_" * 40 + "    Rol: " + "_" * 20, s_campo))
    f.append(Paragraph("Ronda: " + "_" * 10 + "    Mesa: " + "_" * 10, s_campo))
    f.append(Paragraph("", s_txt))
    items = [
        "Verifica la acreditación y el emparejamiento antes de iniciar la ronda.",
        "Aplica correctamente las reglas básicas (jaque, jaque mate, ahogado, tablas).",
        "Resuelve los reclamos siguiendo el procedimiento del reglamento de competición.",
        "Gestiona con criterio las incidencias con el reloj y los controles de tiempo.",
        "Aplica las sanciones correspondientes ante faltas o dispositivos no autorizados.",
        "Calcula correctamente los desempates al cierre del torneo.",
        "Mantiene un trato respetuoso e imparcial con las personas jugadoras.",
        "Documenta cada incidencia en la planilla o en el acta correspondiente.",
    ]
    # "☐" no existe en WinAnsi/Helvetica: reportlab lo cambia por otra letra
    # sin avisar. "[   ]" se ve en cualquier fuente base.
    filas = [["Ítem observado", "Sí", "No", "Observaciones"]]
    for it in items:
        filas.append([Paragraph(it, s_check), "[   ]", "[   ]", ""])
    t = Table(filas, colWidths=[8.2 * cm, 1.2 * cm, 1.2 * cm, 4.5 * cm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (-1, 0), ambar),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("GRID", (0, 0), (-1, -1), 0.6, gris),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    f.append(t)
    doc.build(f, onFirstPage=pie, onLaterPages=pie)


def prueba_final_pdf(curso, leccion, destino):
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import SimpleDocTemplate, Paragraph, HRFlowable, PageBreak

    azul, gris, ambar = HexColor("#" + AZUL_950), HexColor("#" + AZUL_400), HexColor("#" + AMBAR_500)
    est = lambda **kw: ParagraphStyle(**kw)
    s_marca = est(name="marca", fontName="Helvetica-Bold", fontSize=9, textColor=ambar, spaceAfter=2, leading=12)
    s_sub = est(name="sub", fontName="Helvetica-Oblique", fontSize=9.5, textColor=gris, spaceAfter=10, leading=12)
    s_tit = est(name="tit", fontName="Times-Bold", fontSize=18, textColor=azul, spaceAfter=8, leading=22)
    s_sec = est(name="sec", fontName="Helvetica-Bold", fontSize=10, textColor=ambar, spaceBefore=12, spaceAfter=5, leading=13)
    s_txt = est(name="txt", fontName="Helvetica", fontSize=10.5, textColor=HexColor("#" + AZUL_600), leading=15, spaceAfter=7)
    s_preg = est(name="preg", fontName="Helvetica-Bold", fontSize=10.5, textColor=azul, spaceBefore=9, spaceAfter=3, leading=14)
    s_opt = est(name="opt", fontName="Helvetica", fontSize=10, textColor=HexColor("#" + AZUL_600), leading=14, spaceAfter=2, leftIndent=12)
    s_fuente = est(name="fuente", fontName="Helvetica-Oblique", fontSize=9, textColor=gris, spaceAfter=2, leftIndent=12)

    def pie(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(gris)
        canvas.drawString(2 * cm, 1.4 * cm, "Ajedrez Integral · ajedrez-integral.com")
        canvas.drawRightString(letter[0] - 2 * cm, 1.4 * cm, curso["titulo"])
        canvas.restoreState()

    preguntas = json.load(open(PRUEBA_FINAL, encoding="utf-8"))
    letras = "ABCD"

    doc = SimpleDocTemplate(destino, pagesize=letter, title="%s — Prueba final teórica" % curso["titulo"],
                            author="Ajedrez Integral", leftMargin=2 * cm, rightMargin=2 * cm,
                            topMargin=2 * cm, bottomMargin=2.2 * cm)
    f = []
    f.append(Paragraph("AJEDREZ INTEGRAL &nbsp;·&nbsp; %s" % escapar(curso["titulo"]).upper(), s_marca))
    f.append(Paragraph("Sesión presencial — Evaluación final integradora", s_sub))
    f.append(Paragraph("Prueba final teórica (%d preguntas)" % len(preguntas), s_tit))
    f.append(HRFlowable(width="100%", thickness=1.2, color=ambar, spaceAfter=10))
    f.append(Paragraph("Nombre: " + "_" * 45 + "    Fecha: " + "_" * 15, s_txt))
    f.append(Paragraph("Marca con un círculo la opción correcta. Cada pregunta cita el artículo del Handbook de "
                       "la FIDE del que sale la respuesta — parte de aprobar este examen es poder citarlo.", s_txt))
    for i, p in enumerate(preguntas, 1):
        f.append(Paragraph("%d. %s" % (i, escapar(p["enunciado"])), s_preg))
        for j, op in enumerate(p["opciones"]):
            f.append(Paragraph("%s) %s" % (letras[j], escapar(op)), s_opt))
    f.append(PageBreak())

    f.append(Paragraph("AJEDREZ INTEGRAL &nbsp;·&nbsp; %s" % escapar(curso["titulo"]).upper(), s_marca))
    f.append(Paragraph("Hoja de corrección — solo para quien administra", s_sub))
    f.append(Paragraph("Respuestas y fuente", s_tit))
    f.append(HRFlowable(width="100%", thickness=1.2, color=ambar, spaceAfter=10))
    for i, p in enumerate(preguntas, 1):
        f.append(Paragraph("%d. %s) %s" % (i, letras[p["correcta"]], escapar(p["opciones"][p["correcta"]])), s_preg))
        f.append(Paragraph(escapar(p["explica"]), s_txt))
        f.append(Paragraph("Fuente: " + escapar(p["fuente"]), s_fuente))
    doc.build(f, onFirstPage=pie, onLaterPages=pie)


# ---------------------------------------------------------------------- main
def main():
    curso = json.load(open(DATOS, encoding="utf-8"))
    total = numerar(curso["bloques"])
    slug = curso["slug"]

    with open(os.path.join(RAIZ, "cursos", slug + ".html"), "w", encoding="utf-8") as fh:
        fh.write(portada(curso))
    with open(os.path.join(RAIZ, "cursos", "protegido", slug + ".html"), "w", encoding="utf-8") as fh:
        fh.write(protegido(curso))
    with open(os.path.join(RAIZ, "cursos", "academia", slug + ".html"), "w", encoding="utf-8") as fh:
        fh.write(academia(curso))

    carpeta = os.path.join(RAIZ, "cursos", "recursos", slug)
    os.makedirs(carpeta, exist_ok=True)
    for bloque in curso["bloques"]:
        for leccion in bloque["lecciones"]:
            if leccion.get("presencial"):
                formularios_pdf(curso, leccion, os.path.join(carpeta, leccion["archivo_formularios"] + ".pdf"))
                prueba_final_pdf(curso, leccion, os.path.join(carpeta, leccion["archivo_prueba"] + ".pdf"))
            else:
                pptx = os.path.join(carpeta, leccion["archivo"] + ".pptx")
                presentacion_de_clase(curso, leccion, pptx, presentacion(curso, leccion, pptx))
                material_pdf(curso, leccion, os.path.join(carpeta, leccion["archivo"] + "-material.pdf"))
                ejercicios_pdf(curso, leccion, os.path.join(carpeta, leccion["archivo"] + "-ejercicios.pdf"))

    sesiones_json(curso, carpeta)

    # La guía rápida de la persona árbitra (JDE), que va con la Sesión 1.
    subprocess.run(["python3", os.path.join(RAIZ, "herramientas", "formacion-guia-rapida.py"),
                    os.path.join(carpeta, "guia-rapida-arbitro-jde.pdf")], check=True)

    print("Curso '%s': %d sesiones" % (curso["titulo"], total))
    print("  cursos/%s.html" % slug)
    print("  cursos/protegido/%s.html" % slug)
    print("  cursos/academia/%s.html" % slug)
    print("  cursos/recursos/%s/" % slug)


if __name__ == "__main__":
    main()
