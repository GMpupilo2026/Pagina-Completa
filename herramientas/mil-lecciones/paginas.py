# Escribe la portada pública (cursos/una-clase-al-dia.html, con el temario)
# y la página del curso en la Academia (cursos/academia/una-clase-al-dia.html),
# clonando las de «Partidas modelo» para que sean el mismo sitio.
import sys, json, os, html, re
RAIZ = sys.argv[1]
SLUG = 'una-clase-al-dia'
TITULO = 'Una clase al día'
NIVEL = 'Avanzado'
EMOJI = '📖'
DESC = ('360 clases para mejorar un poco cada día, por tema: el ataque al rey, las estructuras de peones, las piezas, '
        'el juego posicional, los sacrificios y los finales. Casi dos mil partidas comentadas jugada a jugada, con '
        'ejercicios y práctica contra el motor.')
IDX = json.load(open(os.path.join(RAIZ, 'cursos/protegido/data', SLUG + '.json')))
m = IDX['meta']
e = lambda t: html.escape(t, quote=True)
STATS = ('%d partidas comentadas jugada a jugada, %d momentos para adivinar la jugada, %d ejercicios de táctica y '
         'repaso, práctica contra el motor y el libro en doce tomos (PDF y versión accesible).' % (m['partidas'], m['claves'], m['ejercicios']))
AC_DESC = ('Cada lección completa: la explicación del tema, las partidas con tablero interactivo y el comentario de cada '
           'jugada, momentos para adivinar la jugada, ejercicios para resolver en el tablero, práctica contra el motor '
           '(Stockfish, en tu propio navegador) y la lección en el libro, en PDF y en formato accesible.')
VIEJO_T = 'Partidas modelo del ajedrez moderno'
VIEJO_D = ('Treinta partidas de grandes maestros explicadas jugada a jugada, ordenadas por temas: apertura, ataque, '
           'defensa, juego posicional y final. En cada lección recorres la partida con comentarios, adivinas las jugadas '
           'clave, resuelves un cuestionario y practicas contra el motor. Tres exámenes por bloque.')

def lecciones_de(b):
    out = []
    for l in b['lecciones']:
        d = json.load(open(os.path.join(RAIZ, 'cursos/protegido/data', SLUG, l['archivo'] + '.json')))['leccion']
        out.append((l, d))
    return out

def temario():
    h = ['<div class="space-y-8">']
    for b in IDX['curso']['bloques']:
        ls = lecciones_de(b)
        h.append('<div><h3 class="font-serif text-lg font-bold text-brand-800 dark:text-white mb-3">Bloque %d · %s</h3><p class="text-sm text-brand-500 dark:text-brand-300 mb-2">%s</p><ol start="%d" class="space-y-2 list-decimal pl-5 marker:text-accent-600 marker:font-semibold">' % (b['n'], e(b['titulo']), e(b['desc']), ls[0][0]['n']))
        for l, d in ls:
            r = d['resumen']
            if len(r) > 160: r = r[:157].rsplit(' ', 1)[0] + '…'
            h.append('<li class="text-brand-600 dark:text-brand-300">%s%s</li>' % (e(l['titulo']), ('<span class="block text-xs text-brand-450 dark:text-brand-350 mt-0.5">%s</span>' % e(r)) if r else ''))
        h.append('</ol></div>')
    h.append('</div>')
    return ''.join(h)

def navegar(s, ant, sig):
    s, k1 = re.subn(r'<a href="[^"]+" ([^>]*)aria-label="Curso anterior: [^"]*"><span aria-hidden="true">←</span> [^<]*</a>',
                    r'<a href="%s.html" \1aria-label="Curso anterior: %s"><span aria-hidden="true">←</span> %s</a>' % (ant[0], ant[1], ant[1]), s)
    s, k2 = re.subn(r'<a href="[^"]+" ([^>]*)aria-label="Siguiente curso: [^"]*">[^<]* <span aria-hidden="true">→</span></a>',
                    r'<a href="%s.html" \1aria-label="Siguiente curso: %s">%s <span aria-hidden="true">→</span></a>' % (sig[0], sig[1], sig[1]), s)
    assert k1 == 1 and k2 == 1
    return s

ANT = ('ideas-que-ganan-partidas', 'Ideas que ganan partidas')
SIG = ('formacion-ajedrez', 'Formación Ajedrez')

def comun(s):
    s = s.replace(VIEJO_T, TITULO).replace(VIEJO_D, DESC).replace('partidas-modelo', SLUG)
    s = s.replace('<div aria-hidden="true" class="h-48 bg-gradient-to-br from-brand-700 to-brand-900 rounded-2xl flex items-center justify-center text-7xl mb-6">🧭</div>',
                  '<div aria-hidden="true" class="h-48 bg-gradient-to-br from-brand-700 to-brand-900 rounded-2xl flex items-center justify-center text-7xl mb-6">%s</div>' % EMOJI)
    s = re.sub(r'(<span class="text-xs text-accent-700 dark:text-accent-400 font-semibold uppercase tracking-wide">)Intermedio(</span>)', r'\g<1>' + NIVEL + r'\g<2>', s)
    s = re.sub(r'<p class="text-sm text-brand-500 dark:text-brand-300"><strong class="text-brand-800 dark:text-white">30 lecciones</strong>[^<]*</p>',
               '<p class="text-sm text-brand-500 dark:text-brand-300"><strong class="text-brand-800 dark:text-white">360 lecciones</strong> · %s · 12 bloques</p>' % NIVEL, s)
    s = re.sub(r'(<p class="text-xs text-brand-450 dark:text-brand-350 mt-0.5">)30 partidas y ejemplos[^<]*(</p>)', r'\g<1>' + STATS.replace('\\', '') + r'\g<2>', s)
    return navegar(s, ANT, SIG)

# ---- portada pública
s = open(os.path.join(RAIZ, 'cursos/partidas-modelo.html'), encoding='utf-8').read()
s = comun(s)
i = s.index('<h2 class="font-serif text-2xl font-bold text-brand-800 dark:text-white mb-6">Temario del curso</h2>')
j = s.index('<!-- ac-desc:', i)
s = s[:i] + '<h2 class="font-serif text-2xl font-bold text-brand-800 dark:text-white mb-6">Temario del curso</h2>\n            ' + temario() + '\n            <p class="text-xs text-brand-450 dark:text-brand-350 mt-6">Texto y partidas: MI Ángel Martín, «Las Mil y una Lecciones de Ajedrez» (EDAMI, 2011), publicado en Ajedrez Integral con permiso.</p>\n' + s[j:]
s = re.sub(r'<!-- ac-desc: .*? -->', '<!-- ac-desc: %s -->' % AC_DESC, s)
s = s.replace('Las 30 lecciones completas', 'Las 360 lecciones completas')
s = re.sub(r'(<p class="text-brand-200 text-sm max-w-2xl mx-auto mb-2">)[^<]*(</p>)', r'\g<1>' + AC_DESC + r'\g<2>', s, count=1)
open(os.path.join(RAIZ, 'cursos', SLUG + '.html'), 'w', encoding='utf-8').write(s)

# ---- página en la Academia
a = open(os.path.join(RAIZ, 'cursos/academia/partidas-modelo.html'), encoding='utf-8').read()
a = comun(a)
a = re.sub(r'(<p class="text-brand-500 dark:text-brand-300 text-sm mb-5">)Cada lección desarrollada por completo[^<]*',
           r'\g<1>' + AC_DESC + ' Las lecciones se abren en orden: al terminar una, márcala como estudiada y se desbloquea la siguiente. Tu avance queda guardado y tu profesor puede verlo en Informes.', a)
open(os.path.join(RAIZ, 'cursos/academia', SLUG + '.html'), 'w', encoding='utf-8').write(a)
print('ok')
