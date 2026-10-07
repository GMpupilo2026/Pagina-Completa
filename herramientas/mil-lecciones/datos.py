# Pasa lo armado (ext/armado.json) y lo que dijo Stockfish (ext/motor.json) a
# los datos del curso: cursos/protegido/data/una-clase-al-dia.json (índice)
# y cursos/protegido/data/una-clase-al-dia/lNNN.json (las partidas de cada
# clase). Esos archivos son la única copia: el libro sale de ellos.
import sys, json, os, re, chess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from temas import BLOQUES
RAIZ = sys.argv[1]
SLUG = 'una-clase-al-dia'
A = json.load(open('ext/armado.json'))
M = json.load(open('ext/motor.json'))
E_ORIG = json.load(open('ext/ejercicios.json'))
ORDEN = ['apertura', 'rey-centro', 'ataque-enroque', 'opuestos', 'piezas', 'peones', 'estructuras', 'pasados',
         'posicional', 'sacrificios', 'desequilibrios', 'finales']
INFO = {c: (t, d) for c, t, d, _ in BLOQUES}
PIEZA = {'K': 'el rey', 'Q': 'la dama', 'R': 'una torre', 'B': 'un alfil', 'N': 'un caballo'}
ES = {'K': 'R', 'Q': 'D', 'R': 'T', 'B': 'A', 'N': 'C'}

def es_san(s):
    s = re.sub(r'^[KQRBN]', lambda m: ES[m.group(0)], s)
    return re.sub(r'=([QRBN])', lambda m: '=' + ES[m.group(1)], s)

def pista(b, mv):
    p = b.piece_at(mv.from_square)
    if b.is_castling(mv): return 'Piensa en poner el rey a salvo.'
    quien = 'un peón' if p.piece_type == chess.PAWN else PIEZA[p.symbol().upper()]
    extra = []
    if b.is_capture(mv): extra.append('captura algo')
    if b.gives_check(mv): extra.append('da jaque')
    return 'La jugada es de %s%s.' % (quien, (' y ' + ' y '.join(extra)) if extra else '')

def eval_txt(cp):
    if cp >= 9000: return 'mate'
    return '%+.1f' % (cp / 100.0)

def claves_de(n, i0, partida):
    out = []
    b = chess.Board(partida['start_fen'])
    for k, m in enumerate(partida['moves']):
        r = M.get('cl:%d:%d:%d' % (n, i0, k))
        mv = chess.Move.from_uci(m['uci'])
        if r:
            jug = dict((u, v) for u, v in r['jugadas'])
            mejor = r['eval_mejor']; suya = jug.get(m['uci'])
            if suya is not None and suya >= mejor - 30:
                alt = [u for u, v in r['jugadas'] if u != m['uci'] and v >= mejor - 30]
                segunda = max([v for u, v in r['jugadas'] if u != m['uci']] or [-99999])
                out.append({'ply': k + 1, 'nag': m['nag'], 'unica': suya - segunda,
                            'pregunta': '¿Qué jugaron aquí las %s?' % ('blancas' if b.turn else 'negras'),
                            'pista': pista(b, mv),
                            'explicacion': (m['comentario'] or 'Fue la jugada de la partida.') ,
                            'alternativas': alt,
                            'motor': 'Stockfish 16: %s %s%s.' % (es_san(m['san']), eval_txt(suya),
                                     (' (también vale ' + ', '.join(es_san(b.san(chess.Move.from_uci(u))) for u in alt) + ')') if alt else '')})
        b.push(mv)
    out.sort(key=lambda c: (c['nag'] != '!!', -c['unica']))
    out = sorted(out[:5], key=lambda c: c['ply'])
    for c in out: c.pop('unica'); c.pop('nag')
    return out

def ejercicio_de(e, id_):
    r = M.get('ej:%d:%s:%d' % (e['leccion'], e['tipo'], e['num']))
    if not r: return None
    jug = dict((u, v) for u, v in r['jugadas'])
    sol = e['solucion'][0]['uci']; suya = jug.get(sol); mejor = r['eval_mejor']
    if suya is None or suya < mejor - 50: return None
    if e['tipo'] == 'tactica' and suya < 150: return None
    alt = [u for u, v in r['jugadas'] if u != sol and v >= mejor - 30 and (e['tipo'] != 'tactica' or v >= 150)]
    b = chess.Board(e['fen'])
    pasos = []
    for m in e['solucion']:
        mv = chess.Move.from_uci(m['uci'])
        pasos.append({'n': b.fullmove_number, 'color': 'w' if b.turn else 'b', 'san': b.san(mv), 'uci': m['uci']})
        b.push(mv); pasos[-1]['fen'] = b.fen(); pasos[-1]['comentario'] = ''
    enun = e['enunciado']
    titulo = ('Ejercicio %d' % e['num']) if e['tipo'] == 'tactica' else 'Repaso y práctica'
    if e['nivel']: titulo += ' · dificultad ' + e['nivel']
    return {'id': id_, 'n': e['num'], 'titulo': titulo,
            'nivel': e['nivel'] or '', 'fen': e['fen'], 'pregunta': enun, 'pista': pista(chess.Board(e['fen']), chess.Move.from_uci(sol)),
            'explicacion': (e['cabecera'] + '. ' if e['cabecera'] else '') + 'Stockfish 16: la primera jugada vale %s.' % eval_txt(suya),
            'solucion': pasos, 'alternativas': alt, 'tipo': e['tipo']}

def resumen_de(l):
    if l['que_veras']: return l['que_veras'][0]
    for it in l['items']:
        if it['tipo'] == 'texto' and len(it['texto']) > 60: return it['texto']
    return ''

if __name__ == '__main__':
    por_bloque = {c: [] for c in ORDEN}
    for l in A: por_bloque[l['bloque']].append(l)
    bloques = []; n = 0; trozos = {}; ejercicios = {}; stats = {'partidas': 0, 'semijugadas': 0, 'claves': 0, 'ejercicios': 0}
    os.makedirs(os.path.join(RAIZ, 'cursos/protegido/data', SLUG), exist_ok=True)
    for bi, c in enumerate(ORDEN):
        tit, desc = INFO[c]
        lecs = []
        for l in sorted(por_bloque[c], key=lambda x: x['n']):
            n += 1
            archivo = 'l%03d' % l['n']
            partidas = {}; items = []; ejs = {}
            for it in l['items']:
                if it['tipo'] == 'partida':
                    p = it['partida']
                    g = {'id': p['id'], 'blancas': p['blancas'] or 'Blancas', 'negras': p['negras'] or 'Negras',
                         'evento': p['evento'], 'apertura': p['apertura'], 'eco': p['eco'], 'resultado': p['resultado'],
                         'start_fen': p['start_fen'], 'orientacion': 'w', 'moves': p['moves'], 'diagramas': p['diagramas'],
                         'resumen': 'Partida que empieza en la posición del diagrama.' if p['fragmento'] else '',
                         'fragmento': p['fragmento']}
                    g['claves'] = claves_de(l['n'], p['i0'], p)
                    for m in g['moves']:
                        m['gap'] = False
                    partidas[p['id']] = g; trozos[p['id']] = archivo
                    stats['partidas'] += 1; stats['semijugadas'] += len(p['moves']); stats['claves'] += len(g['claves'])
                    items.append({'tipo': 'partida', 'id': p['id']})
                elif it['tipo'] == 'ejercicio':
                    e = it['ejercicio']
                    x = ejercicio_de(e, 'ej%03d-%s%d' % (l['n'], 'r' if e['tipo'] == 'repaso' else 't', e['num']))
                    if x:
                        ejs[x['id']] = x; trozos[x['id']] = archivo; items.append({'tipo': 'ejercicio', 'id': x['id']}); stats['ejercicios'] += 1
                else:
                    items.append(it)
            leccion = {'n': n, 'clase': l['n'], 'bloque': bi + 1, 'slug': 'leccion-%03d' % n, 'titulo': l['titulo'].rstrip('.'),
                       'fecha': l['fecha'], 'resumen': resumen_de(l), 'que_veras': l['que_veras'],
                       'conclusiones': l['conclusiones'], 'items': items}
            json.dump({'leccion': leccion, 'partidas': partidas, 'ejercicios': ejs},
                      open(os.path.join(RAIZ, 'cursos/protegido/data', SLUG, archivo + '.json'), 'w'),
                      ensure_ascii=False, separators=(',', ':'))
            lecs.append({'n': n, 'clase': l['n'], 'archivo': archivo, 'titulo': leccion['titulo']})
        bloques.append({'n': bi + 1, 'clave': c, 'titulo': tit, 'desc': desc, 'lecciones': lecs})
    indice = {'curso': {'slug': SLUG, 'titulo': 'Una clase al día', 'nivel': 'Avanzado',
                        'autor_original': 'MI Ángel Martín', 'fuente': 'Las Mil y una Lecciones de Ajedrez (EDAMI, 2011)',
                        'bloques': bloques},
              'trozos': trozos, 'partidas': {}, 'ejercicios': {}, 'quizzes': {},
              'meta': dict(stats, version=1, nota='Partidas leídas del libro y comprobadas jugada a jugada con python-chess; momentos clave y ejercicios contrastados con Stockfish 16.')}
    json.dump(indice, open(os.path.join(RAIZ, 'cursos/protegido/data', SLUG + '.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print(stats, n)
