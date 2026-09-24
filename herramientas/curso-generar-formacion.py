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
                <div class="hidden items-center gap-2" id="course-access-cta" hidden>
                    <a href="../login.html?next=cursos/{slug}.html" class="bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-6 py-2.5 rounded-lg transition-colors whitespace-nowrap">Iniciar sesión →</a>
                </div>
            </div>

            <h2 class="font-serif text-2xl font-bold text-brand-800 dark:text-white mb-6">Temario del curso</h2>
            <div class="space-y-8">
{bloques}
            </div>

            <h2 class="font-serif text-2xl font-bold text-brand-800 dark:text-white mb-1 mt-12">Contenido completo del curso</h2>
            <p class="text-brand-500 dark:text-brand-400 text-sm mb-6">Cada sesión desarrollada por completo: el contenido para ver en clase, la práctica, el quiz con su respuesta y la tarea, con su presentación y su cuadernillo de repaso. La Sesión 8 es presencial y cierra el curso con un torneo real, la evaluación final y la entrega de certificados.</p>

            <div id="course-content-body" data-course="{slug}" class="space-y-8">
                <p class="text-sm text-brand-400 dark:text-brand-500">Cargando lecciones…</p>
            </div>

            <div class="mt-10 bg-brand-800 dark:bg-brand-900 rounded-2xl p-6 text-center hidden" id="course-login-cta" hidden>
                <p class="text-white font-serif text-lg font-bold mb-2">Contenido para alumnos de Ajedrez Integral</p>
                <p class="text-brand-200 text-sm mb-4">Inicia sesión con tu cuenta de Ajedrez Integral para ver las {total} sesiones completas de este curso, con sus recursos descargables.</p>
                <a href="../login.html?next=cursos/{slug}.html" class="inline-block bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-6 py-2.5 rounded-lg transition-colors">Iniciar sesión →</a>
            </div>

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
                botones = (boton.format(slug=slug, arch=l["archivo_formularios"] + ".pdf",
                                        texto="📚 Formularios y lista de cotejo (PDF)") +
                           boton.format(slug=slug, arch=l["archivo_prueba"] + ".pdf",
                                        texto="📄 Prueba final teórica (PDF)"))
            else:
                cuerpo.append('<h5 class="font-serif text-base font-bold text-brand-800 dark:text-white mt-4 mb-1">Práctica — %s</h5>'
                              % escapar(l["practica_titulo"]))
                cuerpo.append('<p>%s</p>' % escapar(l["practica"]))
                cuerpo.append('<h5 class="font-serif text-base font-bold text-brand-800 dark:text-white mt-4 mb-1">Quiz de la sesión</h5>')
                cuerpo.append(quiz_html(l))
                cuerpo.append('<h5 class="font-serif text-base font-bold text-brand-800 dark:text-white mt-4 mb-1">Tarea</h5>')
                cuerpo.append('<p>%s</p>' % escapar(l["tarea"]))
                botones = (boton.format(slug=slug, arch=l["archivo"] + "-material.pdf", texto="📚 Material de estudio (PDF)") +
                           boton.format(slug=slug, arch=l["archivo"] + ".pptx", texto="📊 Descargar presentación") +
                           boton.format(slug=slug, arch=l["archivo"] + "-ejercicios.pdf", texto="📄 Descargar ejercicios (PDF)"))

            titulo_lec = escapar(l["titulo"])
            if l.get("presencial"):
                titulo_lec += (' <span class="text-xs font-normal text-accent-700 dark:text-accent-400 uppercase '
                               'tracking-wide">· Sesión presencial, 8 horas</span>')

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
                <p class="text-brand-500 dark:text-brand-300 text-sm mb-5">Cada sesión incluye su contenido para ver en clase, una práctica, un quiz de evaluación y una tarea, además del material de apoyo y la presentación descargables. Las sesiones se abren en orden: al terminar una, márcala como estudiada y se desbloquea la siguiente. La Sesión 8 es presencial y cierra el curso con un torneo real, la evaluación final y la entrega de certificados.</p>
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
def presentacion(curso, leccion, destino):
    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.enum.text import PP_ALIGN

    def rgb(h):
        return RGBColor.from_string(h)

    def caja(diapo, x, y, an, al, texto, tam, color, negrita=False, fuente="Calibri", alineado=None):
        tb = diapo.shapes.add_textbox(Inches(x), Inches(y), Inches(an), Inches(al))
        tf = tb.text_frame
        tf.word_wrap = True
        for i, linea in enumerate(texto.split("\n")):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            r = p.add_run()
            r.text = linea
            r.font.size = Pt(tam)
            r.font.bold = negrita
            r.font.name = fuente
            r.font.color.rgb = rgb(color)
            if alineado is not None:
                p.alignment = alineado
        return tb

    def figura(diapo, forma, x, y, an, al, color):
        f = diapo.shapes.add_shape(forma, Inches(x), Inches(y), Inches(an), Inches(al))
        f.fill.solid()
        f.fill.fore_color.rgb = rgb(color)
        f.line.fill.background()
        f.shadow.inherit = False
        return f

    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
    vacio = prs.slide_layouts[6]

    # 1 · portada de la sesión
    d = prs.slides.add_slide(vacio)
    figura(d, MSO_SHAPE.RECTANGLE, 0, 0, 13.333, 7.5, AZUL_950)
    figura(d, MSO_SHAPE.OVAL, 10.6, -1.6, 5, 5, AZUL_900)
    figura(d, MSO_SHAPE.OVAL, -1.8, 5.4, 4.2, 4.2, AZUL_900)
    figura(d, MSO_SHAPE.OVAL, 0.7, 0.65, 1.1, 1.1, AMBAR_500)
    caja(d, 0.7, 0.65, 1.1, 1.1, str(leccion["n"]), 32, AZUL_950, True, alineado=PP_ALIGN.CENTER)
    caja(d, 2.1, 0.75, 10.4, 0.5, "AJEDREZ INTEGRAL  ·  %s" % curso["titulo"].upper(), 13, AMBAR_400, True)
    caja(d, 2.1, 1.2, 10.4, 0.4, "Bloque %d · %s" % (leccion["bloque"]["n"], leccion["bloque"]["titulo"]), 13, AZUL_300)
    caja(d, 0.7, 2.9, 11.9, 2.2, leccion["titulo"], 34, "FFFFFF", True, "Cambria")
    caja(d, 0.7, 5.05, 10.5, 1.0, leccion["resumen"], 18, CLARO)
    caja(d, 0.7, 6.9, 6.0, 0.4, "ajedrez-integral.com", 11, AZUL_400)

    # 2 · el contenido (una diapositiva por punto, para que respire)
    for punto in leccion["contenido"]:
        d = prs.slides.add_slide(vacio)
        figura(d, MSO_SHAPE.OVAL, 0.6, 0.55, 0.55, 0.55, AMBAR_500)
        caja(d, 0.6, 0.55, 0.55, 0.55, "⚖", 20, AZUL_950, alineado=PP_ALIGN.CENTER)
        caja(d, 1.35, 0.58, 8.0, 0.5, "CONTENIDO DE LA SESIÓN", 14, AMBAR_500, True)
        caja(d, 0.6, 1.15, 12.1, 0.9, leccion["titulo"], 24, AZUL_950, True, "Cambria")
        figura(d, MSO_SHAPE.RECTANGLE, 0.6, 2.15, 12.1, 4.7, GRIS_50)
        caja(d, 1.1, 2.55, 11.2, 3.9, punto, 16, AZUL_600)

    # 3 · la práctica
    d = prs.slides.add_slide(vacio)
    figura(d, MSO_SHAPE.RECTANGLE, 0, 0, 13.333, 7.5, AZUL_900)
    figura(d, MSO_SHAPE.OVAL, -1.4, -1.6, 4.5, 4.5, AZUL_950)
    figura(d, MSO_SHAPE.OVAL, 5.66, 0.9, 2.0, 2.0, AMBAR_500)
    caja(d, 5.66, 0.9, 2.0, 2.0, "✔", 44, AZUL_950, True, alineado=PP_ALIGN.CENTER)
    caja(d, 0.6, 3.15, 12.1, 0.5, "PRÁCTICA — " + leccion["practica_titulo"].upper(), 14, AMBAR_400, True, alineado=PP_ALIGN.CENTER)
    caja(d, 1.4, 3.7, 10.5, 2.6, leccion["practica"], 20, "FFFFFF", False, "Cambria", PP_ALIGN.CENTER)
    caja(d, 0.6, 6.85, 12.1, 0.4, "%s · Sesión %d" % (curso["titulo"], leccion["n"]), 12, AZUL_300,
         alineado=PP_ALIGN.CENTER)
    prs.save(destino)


# --------------------------------------------- material de estudio (PDF)
def material_pdf(curso, leccion, destino):
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import SimpleDocTemplate, Paragraph, HRFlowable

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
    f.append(Paragraph("CONTENIDO", s_sec))
    for c in leccion["contenido"]:
        f.append(Paragraph(escapar(c), s_item, bulletText="–"))
    f.append(Paragraph("PRÁCTICA — " + escapar(leccion["practica_titulo"]), s_sec))
    f.append(Paragraph(escapar(leccion["practica"]), s_txt))
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
    f.append(Paragraph("1. " + escapar(leccion["practica_titulo"]), s_ej))
    f.append(Paragraph(escapar(leccion["practica"]), s_txt))
    for i in range(6):
        f.append(Paragraph("_" * 88, s_raya))
    f.append(PageBreak())
    f.append(Paragraph("AJEDREZ INTEGRAL &nbsp;·&nbsp; %s" % escapar(curso["titulo"]).upper(), s_marca))
    f.append(Paragraph("Ejercicios de práctica — Sesión %d (continuación)" % leccion["n"], s_sub))
    f.append(HRFlowable(width="100%", thickness=1.2, color=ambar, spaceAfter=10))
    f.append(Paragraph("2. Explícalo con tus palabras", s_ej))
    f.append(Paragraph("Escribe en tres o cuatro líneas de qué se trata “%s” y por qué le importa a quien arbitra, "
                       "como si se lo explicaras a una persona que recién empieza." % escapar(leccion["titulo"]), s_txt))
    for i in range(3):
        f.append(Paragraph("_" * 88, s_raya))
    f.append(Paragraph("3. Tarea", s_ej))
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
                presentacion(curso, leccion, os.path.join(carpeta, leccion["archivo"] + ".pptx"))
                material_pdf(curso, leccion, os.path.join(carpeta, leccion["archivo"] + "-material.pdf"))
                ejercicios_pdf(curso, leccion, os.path.join(carpeta, leccion["archivo"] + "-ejercicios.pdf"))

    print("Curso '%s': %d sesiones" % (curso["titulo"], total))
    print("  cursos/%s.html" % slug)
    print("  cursos/protegido/%s.html" % slug)
    print("  cursos/academia/%s.html" % slug)
    print("  cursos/recursos/%s/" % slug)


if __name__ == "__main__":
    main()
