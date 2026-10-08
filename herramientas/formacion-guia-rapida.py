#!/usr/bin/env python3
"""Guía rápida de la persona árbitra de ajedrez en los JDE 2026 (dos páginas, A4).

Fuentes: Leyes del Ajedrez FIDE (Manual del Árbitro 2026) y Normativa del
Programa Juegos Deportivos Estudiantiles 2026 (art. 14, 17, 30 y 66).
   python3 herramientas/formacion-guia-rapida.py [destino.pdf]

La llama herramientas/curso-generar-formacion.py, que la deja en
cursos/recursos/formacion-ajedrez/guia-rapida-arbitro-jde.pdf (un botón de la
Sesión 1). verificar-formacion.js comprueba que esté al día.
"""
import os, sys
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph, Table, TableStyle,
                                Spacer, Flowable, PageBreak, KeepTogether)

AZUL = colors.Color(49/255, 114/255, 172/255)
PIZARRA = colors.Color(78/255, 97/255, 120/255)
OSCURO = colors.Color(16/255, 42/255, 67/255)
CLARO = colors.Color(232/255, 240/255, 248/255)
DORADO = colors.Color(244/255, 196/255, 48/255)
ROJO = colors.Color(185/255, 28/255, 28/255)
VERDE = colors.Color(21/255, 128/255, 61/255)

def E(nombre, **kw):
    base = dict(fontName="Helvetica", fontSize=8.6, leading=10.6, textColor=OSCURO)
    base.update(kw)
    return ParagraphStyle(nombre, **base)
T = E("t", fontName="Helvetica-Bold", fontSize=11, leading=13.5, textColor=AZUL, spaceBefore=5, spaceAfter=3)
N = E("n")
NB = E("nb", fontName="Helvetica-Bold")
CH = E("ch", fontSize=7.8, leading=9.6)
CHB = E("chb", fontName="Helvetica-Bold", fontSize=7.8, leading=9.6, textColor=colors.white)
ART = E("art", fontName="Helvetica-Bold", fontSize=7.8, leading=9.6, textColor=AZUL)
PIE = E("pie", fontSize=6.8, leading=8.4, textColor=PIZARRA)

def P(texto, estilo=N):
    return Paragraph(texto, estilo)

def tabla(filas, anchos, cabecera=True, cebra=True):
    t = Table(filas, colWidths=anchos, repeatRows=1 if cabecera else 0)
    st = [("VALIGN", (0, 0), (-1, -1), "TOP"),
          ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
          ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
          ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.Color(0.8, 0.85, 0.9))]
    if cabecera:
        st += [("BACKGROUND", (0, 0), (-1, 0), AZUL)]
    if cebra:
        for i in range(1 if cabecera else 0, len(filas)):
            if i % 2 == 0:
                st.append(("BACKGROUND", (0, i), (-1, i), CLARO))
    t.setStyle(TableStyle(st))
    return t

# ---------- Diagramas ----------
class Diagrama(Flowable):
    """Cajas y flechas dibujadas: cajas = {id: (x, y, ancho, alto, texto, tipo)}, flechas = [(de, a, rótulo, lado)]."""
    def __init__(self, ancho, alto, cajas, flechas):
        super().__init__()
        self.width, self.height, self.cajas, self.flechas = ancho, alto, cajas, flechas

    def caja(self, c, x, y, w, h, texto, tipo):
        fondo = {"pregunta": CLARO, "fin": colors.Color(0.93, 0.97, 0.93), "malo": colors.Color(0.99, 0.93, 0.93)}.get(tipo, colors.white)
        borde = {"pregunta": AZUL, "fin": VERDE, "malo": ROJO}.get(tipo, PIZARRA)
        c.setFillColor(fondo); c.setStrokeColor(borde); c.setLineWidth(1.1)
        c.roundRect(x, y, w, h, 4, stroke=1, fill=1)
        p = Paragraph(texto, E("d", fontSize=7.6, leading=9.2, alignment=1,
                               fontName="Helvetica-Bold" if tipo == "pregunta" else "Helvetica"))
        pw, ph = p.wrap(w - 8, h)
        p.drawOn(c, x + (w - pw) / 2, y + (h - ph) / 2)

    def punto(self, nombre, lado):
        x, y, w, h = self.cajas[nombre][:4]
        return {"abajo": (x + w / 2, y), "arriba": (x + w / 2, y + h), "der": (x + w, y + h / 2), "izq": (x, y + h / 2)}[lado]

    def draw(self):
        c = self.canv
        for x, y, w, h, texto, tipo in self.cajas.values():
            self.caja(c, x, y, w, h, texto, tipo)
        c.setStrokeColor(PIZARRA); c.setFillColor(PIZARRA); c.setLineWidth(1)
        for de, a, rotulo, (sale, entra) in self.flechas:
            x1, y1 = self.punto(de, sale)
            x2, y2 = self.punto(a, entra)
            if x1 != x2 and y1 != y2:  # en L: primero horizontal, después vertical
                c.line(x1, y1, x2, y1); c.line(x2, y1, x2, y2); mx, my = (x1 + x2) / 2, y1 + 2
            else:
                c.line(x1, y1, x2, y2); mx, my = (x1 + x2) / 2 + 3, (y1 + y2) / 2
            # punta de flecha
            dx, dy = (0, -1) if y2 < (y1 if x1 == x2 else y1) else (0, 1)
            if y1 == y2 and x1 != x2:
                dx, dy = (1 if x2 > x1 else -1, 0)
            p = c.beginPath()
            p.moveTo(x2, y2); p.lineTo(x2 - 3.2 * dx - 2.2 * dy, y2 - 3.2 * dy - 2.2 * dx)
            p.lineTo(x2 - 3.2 * dx + 2.2 * dy, y2 - 3.2 * dy + 2.2 * dx); p.close()
            c.drawPath(p, stroke=0, fill=1)
            if rotulo:
                c.setFont("Helvetica-Bold", 7.2); c.setFillColor(AZUL)
                c.drawString(mx, my, rotulo); c.setFillColor(PIZARRA)

def filas_y_columnas(W, H, b, h, gap):
    col = {"L": 0, "C": (W - b) / 2, "R": W - b}
    fila = lambda n: H - h - n * (h + gap)
    return col, fila

def diagrama_ilegal(ancho):
    b, h, gap = 54 * mm, 13 * mm, 8 * mm
    W, H = ancho, 4 * h + 3 * gap + 2
    col, fila = filas_y_columnas(W, H, b, h, gap)
    cajas = {
        "reloj": (col["L"], fila(0), b, h, "¿El jugador ya presionó su reloj?", "pregunta"),
        "rival": (col["C"], fila(0), b, h, "Rápida o blitz: ¿el rival ya hizo su siguiente jugada?", "pregunta"),
        "queda": (col["R"], fila(0), b, h, "Si nadie reclamó, la jugada ilegal queda y se sigue (A.5.2).", "fin"),
        "corrige": (col["L"], fila(1), b, h, "Todavía no es ilegal: puede corregirla, respetando la pieza tocada (4.3, 7.5.1).", "fin"),
        "repone": (col["C"], fila(1), b, h, "Se restablece la posición anterior y juega otra, con la pieza tocada (7.5.1).", "normal"),
        "primera": (col["C"], fila(2), b, h, "¿Es su primera jugada ilegal completada?", "pregunta"),
        "minutos": (col["L"], fila(3), b, h, "+2 minutos al rival en clásica; +1 minuto en rápida y blitz (7.5.5, A.3).", "fin"),
        "pierde": (col["R"], fila(3), b, h, "Pierde la partida, salvo que el rival no pueda dar mate: tablas (7.5.5).", "malo"),
    }
    flechas = [("reloj", "rival", "Sí", ("der", "izq")),
               ("rival", "queda", "Sí", ("der", "izq")),
               ("reloj", "corrige", "No", ("abajo", "arriba")),
               ("rival", "repone", "No", ("abajo", "arriba")),
               ("repone", "primera", None, ("abajo", "arriba")),
               ("primera", "minutos", "Sí", ("izq", "arriba")),
               ("primera", "pierde", "No", ("der", "arriba"))]
    return Diagrama(W, H, cajas, flechas)

def diagrama_tablas(ancho):
    b, h, gap = 54 * mm, 13 * mm, 8 * mm
    W, H = ancho, 3 * h + 2 * gap + 2
    col, fila = filas_y_columnas(W, H, b, h, gap)
    cajas = {
        "como": (col["L"], fila(0), b, h, "¿La repetición o las 50 jugadas ya se produjeron?", "pregunta"),
        "escribe": (col["L"], fila(1), b, h, "Se va a producir: escribe en la planilla la jugada que hará, sin hacerla, y reclama (9.2.1.1).", "normal"),
        "reclama": (col["C"], fila(1), b, h, "Ya ocurrió: reclama antes de tocar una pieza o hacer su jugada (9.2.1.2, 9.4).", "normal"),
        "pausa": (col["R"], fila(1), b, h, "En los dos casos se pausa el reloj y se revisa el reclamo (9.5.1).", "pregunta"),
        "fin": (col["R"], fila(2), b, h, "Correcto: tablas. Incorrecto: +2 min al rival (1 en rápida y blitz) y se sigue (9.5.2, 9.5.3, A.3).", "fin"),
    }
    flechas = [("como", "escribe", "No", ("abajo", "arriba")),
               ("como", "reclama", "Sí", ("der", "arriba")),
               ("reclama", "pausa", None, ("der", "izq")),
               ("pausa", "fin", None, ("abajo", "arriba"))]
    return Diagrama(W, H, cajas, flechas)

# ---------- Página ----------
def encabezado(c, doc):
    w, h = A4
    c.saveState()
    c.setFillColor(OSCURO); c.rect(0, h - 22 * mm, w, 22 * mm, stroke=0, fill=1)
    c.setFillColor(DORADO); c.rect(0, h - 23.2 * mm, w, 1.2 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 15)
    c.drawString(14 * mm, h - 11.5 * mm, "Guía rápida de la persona árbitra de ajedrez")
    c.setFont("Helvetica", 9)
    c.drawString(14 * mm, h - 17.5 * mm, "Juegos Deportivos Estudiantiles 2026  ·  Leyes del Ajedrez FIDE y Normativa PJDE 2026")
    c.setFillColor(PIZARRA); c.setFont("Helvetica", 7)
    c.drawString(14 * mm, 8 * mm, "Programa de Formación para Personas Árbitras y Asesoras  ·  AjedrezIntegral")
    c.drawRightString(w - 14 * mm, 8 * mm, "Página %d de 2" % doc.page)
    c.restoreState()

def armar(destino):
    doc = BaseDocTemplate(destino, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=27 * mm, bottomMargin=14 * mm,
                          title="Guía rápida de la persona árbitra de ajedrez · JDE 2026", author="AjedrezIntegral",
                          subject="Leyes del Ajedrez FIDE y Normativa PJDE 2026")
    marco = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="m", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="p", frames=[marco], onPage=encabezado)])
    W = doc.width
    s = []

    s.append(P("1. Antes de la primera ronda: cómo se juega en cada etapa", T))
    filas = [[P("Etapa", CHB), P("Sistema de juego (art. 66.2)", CHB), P("Ritmo", CHB), P("Para la FIDE", CHB), P("Jugada ilegal o reclamo incorrecto", CHB)],
             [P("<b>Regional</b>", CH), P("Suizo de 5 rondas o más si hay más de 8 por modalidad; todos contra todos si hay 8 o menos.", CH),
              P("Mínimo 10 min + 2 s por jugada", CH), P("<b>Rápida</b> (A.1)", CH), P("1 minuto al rival (A.3)", CH)],
             [P("<b>Interregional</b>", CH), P("Todos contra todos.", CH), P("Mínimo 10 min + 2 s por jugada", CH), P("<b>Rápida</b> (A.1)", CH), P("1 minuto al rival (A.3)", CH)],
             [P("<b>Nacional</b>", CH), P("Suizo de 5 rondas si hay más de 7; todos contra todos si hay 6 o menos.*", CH),
              P("Clásico, y blitz de 3 min + 2 s", CH), P("Clásica; <b>blitz</b> (B.1)", CH), P("Clásica: 2 minutos (7.5.5). Blitz: 1 minuto (B.3, A.3)", CH)]]
    s.append(tabla(filas, [22 * mm, 64 * mm, 32 * mm, 26 * mm, W - 144 * mm]))
    s.append(P("* La Normativa no dice qué sistema usar en la Etapa Nacional con exactamente 7 inscritos: conviene dejarlo escrito en el acta del congresillo.", PIE))
    s.append(Spacer(1, 3))
    reglas = [
        ("Llegada tarde", "En ajedrez, la persona estudiante puede presentarse hasta que su reloj caiga a cero (art. 30). Sin norma del torneo, la FIDE da 0 minutos (6.7.1): la de la JDE manda."),
        ("Equipos", "De 3 a 5 estudiantes: 4 titulares y 1 suplente (66.1.g). Al empezar cada ronda, al menos 2 frente al tablero (66.2.f). El orden de tableros se fija en el congresillo y vale para toda la etapa; la suplencia es por sistema olímpico (66.2.h)."),
        ("Una modalidad", "Cada estudiante juega individual o equipos, no las dos (66.1.h)."),
        ("Anotación", "Algebraica en todas las categorías. Quien no anote será amonestado por la persona árbitra principal si el rival lo solicita, excepto en la categoría A (66.2.g). En rápida y blitz no es obligatorio anotar (A.2)."),
        ("Puntos y desempates", "Ganada 1, tablas ½, perdida 0. Al menos tres desempates, que define la persona árbitra principal en el congresillo, de preferencia según FECOAJE y FIDE (66.3 y 66.4)."),
        ("Inclusión", "Con estudiantes con discapacidad, la organización contempla los apoyos necesarios (66.2.i); la persona árbitra toma medidas especiales para ellos (12.2.6)."),
        ("Quién arbitra", "En las etapas Circuital, Regional e Interregional, personas mayores de edad, de preferencia tituladas (art. 14)."),
        ("Lo no previsto", "Primero las reglas de la Federación Costarricense de Ajedrez; después, las de la FIDE (art. 66)."),
    ]
    s.append(tabla([[P("<b>%s</b>" % a, CH), P(b, CH)] for a, b in reglas], [30 * mm, W - 30 * mm], cabecera=False))

    s.append(P("2. Las 10 decisiones más frecuentes en un torneo estudiantil", T))
    dec = [
        ("Jugada ilegal completada (presionó el reloj)", "Restablece la posición anterior. Primera: +1 min al rival en rápida y blitz, +2 en clásica. Segunda del mismo jugador: pierde, salvo que el rival no pueda dar mate (tablas). En rápida y blitz, solo si el rival aún no jugó.", "7.5.1, 7.5.5, A.3, A.5.2"),
        ("Peón en la última fila sin cambiar, y presionó el reloj", "Es jugada ilegal: el peón se cambia por una dama del mismo color y se aplica la sanción de jugada ilegal.", "7.5.2, 7.5.5"),
        ("Usó las dos manos para una jugada, o presionó el reloj sin jugar", "Se trata y sanciona como jugada ilegal.", "7.5.3, 7.5.4"),
        ("Pieza tocada", "Pieza propia: debe moverla. Del rival: debe capturarla, si es legal. Rey y torre: enroca por ese lado si es legal. Tocó la torre primero: mueve la torre y pierde ese enroque. La persona árbitra interviene sin esperar reclamo.", "4.3, 4.4, 4.8"),
        ("«Compongo»", "Solo quien tiene el turno, avisando antes de tocar la pieza.", "4.2.1"),
        ("Celular encima durante la partida", "Pierde la partida y gana el rival, salvo que el reglamento del torneo fije una sanción menor.", "11.3.2.2"),
        ("Ahogado o posición muerta (rey contra rey, rey y alfil o caballo contra rey)", "La partida terminó en tablas en ese momento. No hace falta reclamo.", "5.2.1, 5.2.2"),
        ("Triple repetición o 50 jugadas", "Reclama quien tiene el turno (diagrama de la página 2). Correcto: tablas. Incorrecto: +2 min al rival (1 en rápida y blitz). Cinco repeticiones o 75 jugadas: tablas sin reclamo.", "9.2, 9.3, 9.5, 9.6, A.3"),
        ("Cayó la bandera en rápida o blitz", "El jugador reclama pausando el reloj. Si quien reclama no puede dar mate con ninguna serie de jugadas legales, son tablas.", "A.5.3"),
        ("Oferta de tablas", "Se ofrece después de jugar y antes de presionar el reloj; no se retira y se anota (=) en la planilla.", "9.1.2.1, 9.1.2.2"),
    ]
    filas = [[P("Situación", CHB), P("Qué hace la persona árbitra", CHB), P("Artículo", CHB)]]
    filas += [[P("<b>%d.</b> %s" % (i + 1, a), CH), P(b, CH), P(c, ART)] for i, (a, b, c) in enumerate(dec)]
    s.append(tabla(filas, [52 * mm, W - 80 * mm, 28 * mm]))

    s.append(PageBreak())
    s.append(P("3. Jugada ilegal: paso a paso", T))
    s.append(diagrama_ilegal(W))
    s.append(Spacer(1, 3))
    s.append(P("En clásica, la jugada ilegal se corrige aunque el rival ya haya jugado: se vuelve a la posición de antes de la irregularidad (7.5.1). Lo de «el rival ya jugó» es de la rápida y el blitz (A.5.2).", PIE))
    s.append(Spacer(1, 2))
    s.append(P("4. Reclamo de tablas por triple repetición o 50 jugadas", T))
    s.append(diagrama_tablas(W))
    s.append(Spacer(1, 4))
    no = ["Señalar jaque, mate o ahogado.",
          "Decir cuántas jugadas se han hecho (salvo que ya cayó una bandera, 8.5).",
          "Avisar que el rival ya jugó o que no presionó su reloj.",
          "Sugerir jugadas, ofrecer tablas o comentar la posición.",
          "Decir «sí» o «no» sobre la posición actual: sí puede explicar una regla si se la piden (11.9)."]
    si = ["Hacer cumplir las Leyes y el reglamento del torneo (12.1).",
          "Asegurar buenas condiciones de juego y velar por el juego limpio (12.2).",
          "Observar las partidas, sobre todo en apuro de tiempo (12.3).",
          "Intervenir de inmediato ante una jugada ilegal o pieza tocada.",
          "Pausar los relojes para resolver un reclamo y pedir silencio."]
    caja = Table([[P("<b>Lo que SÍ hace</b> (art. 12)", E("s", fontName="Helvetica-Bold", textColor=VERDE)),
                   P("<b>Lo que NO hace</b> (12.6)", E("no", fontName="Helvetica-Bold", textColor=ROJO))],
                  [P("<br/>".join("• " + x for x in si), CH), P("<br/>".join("• " + x for x in no), CH)]],
                 colWidths=[W / 2, W / 2])
    caja.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOX", (0, 0), (0, -1), 0.8, VERDE), ("BOX", (1, 0), (1, -1), 0.8, ROJO),
                              ("LEFTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    s.append(KeepTogether([P("5. El rol de la persona árbitra", T), caja]))
    s.append(Spacer(1, 4))
    sanciones = "1. Advertencia  ·  2. Más tiempo al rival  ·  3. Menos tiempo al infractor  ·  4. Más puntos al rival  ·  5. Menos puntos al infractor  ·  6. Partida perdida  ·  7. Multa anunciada antes  ·  8. Exclusión de una o más rondas  ·  9. Expulsión de la competencia"
    s.append(KeepTogether([P("6. Sanciones que puede aplicar, de menor a mayor (12.9)", T), P(sanciones, N)]))
    s.append(Spacer(1, 6))
    s.append(P("Fuentes: FIDE, <i>Arbiters' Manual 2026</i> (Leyes del Ajedrez y Apéndices A y B); Ministerio de Educación Pública, <i>Normativa del Programa Juegos Deportivos Estudiantiles 2026</i>, artículos 14, 30 y 66. Esta guía resume: ante una duda, manda el texto oficial.", PIE))
    doc.build(s)

if __name__ == "__main__":
    armar(sys.argv[1] if len(sys.argv) > 1 else "guia-rapida-arbitro-jde.pdf")
