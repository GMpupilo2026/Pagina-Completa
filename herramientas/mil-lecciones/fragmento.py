# Escribe cursos/protegido/una-clase-al-dia.html (las lecciones completas)
# desde los datos del curso.
import sys, json, os, html, re
RAIZ = sys.argv[1]
SLUG = 'una-clase-al-dia'
BASE = os.path.join(RAIZ, 'cursos/protegido/data')
IDX = json.load(open(os.path.join(BASE, SLUG + '.json')))
ES = {'K': 'R', 'Q': 'D', 'R': 'T', 'B': 'A', 'N': 'C'}
P = 'text-sm text-brand-600 dark:text-brand-300 leading-relaxed'
H5 = 'font-serif text-base font-bold text-brand-800 dark:text-white mt-5 mb-1'
BTN = 'inline-flex items-center gap-1.5 bg-brand-100 dark:bg-brand-700 text-brand-700 dark:text-brand-100 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-brand-200 dark:hover:bg-brand-600 transition-colors'
e = lambda t: html.escape(t, quote=True)

def tomo(b):
    return '../recursos/%s/tomo-%02d' % (SLUG, b)

def leccion(L, d):
    partidas, ejs = d['partidas'], d['ejercicios']
    np_ = sum(1 for it in L['items'] if it['tipo'] == 'partida')
    ne = sum(1 for it in L['items'] if it['tipo'] == 'ejercicio')
    nc = sum(len(partidas[it['id']]['claves']) for it in L['items'] if it['tipo'] == 'partida')
    datos = ['Clase %d del libro' % L['clase']]
    if np_: datos.append('%d %s' % (np_, 'partida' if np_ == 1 else 'partidas'))
    if nc: datos.append('%d %s para adivinar' % (nc, 'momento clave' if nc == 1 else 'momentos clave'))
    if ne: datos.append('%d %s' % (ne, 'ejercicio' if ne == 1 else 'ejercicios'))
    h = ['<details class="bg-brand-50 dark:bg-brand-800 rounded-lg px-4 py-3" id="lec-%s">' % L['slug'],
         '<summary class="cursor-pointer font-semibold text-brand-800 dark:text-white marker:text-accent-600">%d. %s</summary>' % (L['n'], e(L['titulo'])),
         '<div class="mt-3 space-y-2"><p class="text-xs text-brand-450 dark:text-brand-350">%s</p>' % e(' · '.join(datos))]
    if L['que_veras']:
        h.append('<p class="%s mt-2"><strong>Qué verás en esta lección</strong></p><ul class="cp-reglas">%s</ul>' % (P, ''.join('<li>%s</li>' % e(t) for t in L['que_veras'])))
    for it in L['items']:
        if it['tipo'] == 'texto':
            h.append('<p class="%s">%s</p>' % (P, e(it['texto'])))
        elif it['tipo'] == 'subtitulo':
            h.append('<h5 class="%s">%s</h5>' % (H5, e(it['texto'])))
        elif it['tipo'] == 'partida':
            g = partidas[it['id']]
            ev = ' · '.join(x for x in (g['evento'], g['resultado']) if x)
            h.append('<h5 class="%s">%s – %s<span class="cp-ev"> %s</span></h5>' % (H5, e(g['blancas']), e(g['negras']), e(ev)))
            if g['apertura']:
                h.append('<p class="text-xs text-brand-450 dark:text-brand-350">%s%s</p>' % (e(g['apertura']), (' [%s]' % e(g['eco'])) if g['eco'] else ''))
            h.append('<div class="cp-partida" data-id="%s"><p class="text-xs text-brand-400">Activa JavaScript para recorrer la partida, adivinar las jugadas clave y practicar contra el motor.</p></div>' % it['id'])
        elif it['tipo'] == 'ejercicio':
            x = ejs[it['id']]
            h.append('<div class="cp-ejercicio" data-id="%s"><p class="text-xs text-brand-400">Activa JavaScript para resolver el ejercicio.</p></div>' % it['id'])
    if L['conclusiones']:
        h.append('<p class="%s mt-2"><strong>Conclusiones</strong></p><ul class="cp-reglas">%s</ul>' % (P, ''.join('<li>%s</li>' % e(t) for t in L['conclusiones'])))
    t = tomo(L['bloque'])
    h.append('<div class="mt-3 flex flex-wrap gap-2"><a href="%s.pdf" class="%s">📚 El tomo %d del libro (PDF)</a><a href="%s-accesible.html#leccion-%d" class="%s">🔊 Esta lección en formato accesible</a></div>' % (t, BTN, L['bloque'], t, L['n'], BTN))
    h.append('</div></details>')
    return ''.join(h)

if __name__ == '__main__':
    out = ['<div class="bg-brand-50 dark:bg-brand-800 rounded-xl p-5"><p class="%s"><strong>Cómo usar este curso.</strong> Son 360 clases, una para cada día, ordenadas por tema en doce bloques: con una al día, en un año recorres todo el ajedrez, del ataque al rey a los finales. Lo que mejora no es lo que se estudia un fin de semana, sino lo que se repasa todos los días. Cada lección explica una idea con partidas de maestros: recórrelas leyendo el comentario de cada jugada (flechas o ← → en el teclado), pulsa <em>Adivinar las jugadas clave</em> para ponerte a prueba y, si quieres, sigue cualquier posición contra el motor. Muchas lecciones traen además ejercicios de táctica y un «Repaso y práctica» para resolver en el tablero.</p><p class="%s mt-2 text-xs">Las jugadas de cada partida se leyeron del libro y se comprobaron una por una con python-chess; los momentos clave y los ejercicios, con Stockfish 16. Las jugadas subrayadas tienen comentario; las jugadas en naranja son momentos clave.</p></div>' % (P, P)]
    for b in IDX['curso']['bloques']:
        out.append('<div><h4 class="font-serif text-base font-bold text-brand-800 dark:text-white mb-2 mt-6">Bloque %d · %s</h4><p class="text-xs text-brand-450 dark:text-brand-350 mb-2">%s</p><div class="space-y-2">' % (b['n'], e(b['titulo']), e(b['desc'])))
        for l in b['lecciones']:
            d = json.load(open(os.path.join(BASE, SLUG, l['archivo'] + '.json')))
            out.append(leccion(d['leccion'], d))
        out.append('</div></div>')
    m = IDX['meta']
    out.append('<p class="text-xs text-brand-450 dark:text-brand-350 mt-6">Base de datos del curso: %d partidas, %d semijugadas, %d momentos clave y %d ejercicios. Texto y partidas: MI Ángel Martín, «Las Mil y una Lecciones de Ajedrez» (EDAMI, 2011), publicado en Ajedrez Integral con permiso.</p>' % (m['partidas'], m['semijugadas'], m['claves'], m['ejercicios']))
    s = '\n'.join(out) + '\n'
    open(os.path.join(RAIZ, 'cursos/protegido', SLUG + '.html'), 'w').write(s)
    print(len(s))
