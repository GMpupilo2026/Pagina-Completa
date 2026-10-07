import os
# Arma cada clase: introducción, «qué verás», partidas con sus comentarios,
# explicaciones entre partidas, ejercicios y conclusiones.
import sys, json, re, chess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from leer import tokenizar, MOV, RES
from temas import bloque_de
TIT = json.load(open('ext/titulos.json'))
F = json.load(open('ext/fragmentos.json'))
EJ = json.load(open('ext/ejercicios.json'))

VINETA = re.compile(r'[-•●▪■◦]')

def parrafos(raw):
    """Une las líneas del PDF en párrafos."""
    raw = VINETA.sub('\n¶\n', raw)
    raw = re.sub(r'(Conclusiones:|¿Qué verás en esta clase\?|Recordar bien:|Cuidado con)', r'\n¶\n\1', raw)
    lineas = [l.strip() for l in raw.split('\n')]
    out, cur = [], []
    for i, l in enumerate(lineas):
        if not l or l == '¶' or l.startswith('⟦'):
            if cur: out.append(' '.join(cur)); cur = []
            continue
        cur.append(l)
        sig = next((x for x in lineas[i+1:] if x), '')
        if re.search(r'[.:?!»”"]$', l) and len(l) < 38 and (sig[:1].isupper() or sig[:1] in '¿¡"“«' or sig[:1].isdigit()):
            out.append(' '.join(cur)); cur = []
    if cur: out.append(' '.join(cur))
    return [limpiar_frase(p) for p in out if limpiar_frase(p)]

def limpiar_frase(p):
    p = re.sub(r'\s+', ' ', p).strip()
    p = re.sub(r'(?<![\w-])0-0-0(?![\w-])', 'O-O-O', p)
    p = re.sub(r'(?<![\w-])0-0(?![\w-])', 'O-O', p)
    p = p.replace(' ,', ',').replace(' .', '.').replace('( ', '(').replace(' )', ')')
    p = re.sub(r'\bordenadores\b', 'computadoras', p); p = re.sub(r'\bordenador\b', 'computadora', p)
    p = re.sub(r'\bOrdenador\b', 'Computadora', p)
    p = re.sub(r'\bdel computadora\b', 'de la computadora', p); p = re.sub(r'\bel computadora\b', 'la computadora', p)
    p = re.sub(r'\bun computadora\b', 'una computadora', p); p = re.sub(r'\bEl computadora\b', 'La computadora', p)
    p = re.sub(r'\bal computadora\b', 'a la computadora', p); p = re.sub(r'\blos computadoras\b', 'las computadoras', p)
    return p

def es_cabecera(l):
    l = l.strip()
    if not l or len(l) > 70: return False
    if re.search(r'\[[A-E]\d\d\]', l) or 'Comentarios' in l: return True
    if re.search(r'\s-\s', l) and not re.search(r'\d+\.', l): return True
    if re.search(r'(19|20)\d\d\s*$', l) and not l.endswith('.'): return True
    if re.match(r"^[A-ZÁÉÍÓÚÑ][\w'.,ÁÉÍÓÚÑáéíóúñü\- ]+\(\d{4}\)\s*(\[[A-E]\d\d\])?$", l): return True
    return False

APERT = re.compile(r'^(Defensa|Apertura|Gambito|Ataque|Sistema|Variante|Partida|Contragambito|Sicilian|Siciliana|India|Nimzo|Ruy|Española|Francesa|Escocesa|Italiana|Inglesa|Holandesa|Eslava|Benoni|Caro|Grünfeld|Grunfeld|Catalana|Pirc|Alekhine|Escandinava|Moderna|Petrov|Vienesa|Reti|Réti)', re.I)

def cabecera_de(lineas):
    """lineas: líneas de la cabecera, en orden."""
    lin = [l.strip().replace('Àpertura', 'Apertura') for l in lineas if l.strip() and 'Comentarios' not in l]
    eco = None
    for l in lin:
        m = re.search(r'\[([A-E]\d\d)\]', l)
        if m: eco = m.group(1)
    lin = [re.sub(r'\s*\[[A-E]\d\d\]', '', l).strip() for l in lin]
    lin = [l for l in lin if l]
    blancas = negras = evento = apertura = ''
    k = next((i for i, l in enumerate(lin) if re.search(r'\s-\s', l) or l.endswith(' -') or l.endswith('-')), None)
    if k is not None:
        jug = lin[k]; resto = lin[k + 1:]
        # el nombre de las negras puede seguir en la línea de abajo
        if resto and (jug.rstrip().endswith('-') or re.match(r"^[A-ZÁÉÍÓÚÑ][\w'.ÁÉÍÓÚÑáéíóúñü\- ]*\(\d{4}\)$", resto[0]) or (not re.search(r'\d', resto[0]) and not APERT.match(resto[0]) and len(resto[0]) < 25 and re.search(r'\(\d{4}\)', jug) and not re.search(r'\(\d{4}\)\s*$', jug.split(' - ')[-1]))):
            jug = jug + ' ' + resto[0]; resto = resto[1:]
        m = re.match(r'^(.*?)\s*-\s+(.*)$', jug) or re.match(r'^(.*?)\s+-\s*(.*)$', jug)
        if m: blancas, negras = m.group(1), m.group(2)
        for l in resto:
            if APERT.match(l) and not apertura: apertura = l
            elif not evento: evento = l
            else: evento += ' ' + l
    else:
        evento = ' '.join(lin)
    return {'blancas': limpiar_nombre(blancas), 'negras': limpiar_nombre(negras), 'evento': evento.strip(' ,.'),
            'apertura': apertura.strip(' .'), 'eco': eco or ''}

def limpiar_nombre(n):
    n = re.sub(r'\s*\(\d{4}\)', '', n).strip(' ,-')
    m = re.match(r'^([^,]+),\s*([\w.]+)$', n)
    if m: n = '%s %s' % (m.group(2) if m.group(2).endswith('.') else m.group(2) + '.', m.group(1).strip())
    return n

def nag_de(tok):
    m = MOV.match(tok.lstrip('[(').rstrip(')];,'))
    return ((m.group(4) or '') + (m.group(5) or '')) if m else ''

def comentario(toks, a, b, diags, ply):
    trozos = []
    for i in range(a, b):
        t = toks[i].t
        m = re.match(r'⟦DIAG:(.+)⟧', t)
        if m: diags.append((m.group(1), ply)); continue
        trozos.append(t)
    s = ' '.join(trozos)
    s = s.replace('[', '(').replace(']', ')')
    s = re.sub(r'^\(\s*', '(', s)
    return limpiar_frase(VINETA.sub(' ', s))

def linea_de(texto, pos):
    return texto.count('\n', 0, pos)

def armar(n):
    L = json.load(open('ext/lec/%03d.json' % n))
    texto = L['texto']; toks = tokenizar(texto)
    lineas = texto.split('\n')
    inicio_linea = [0]
    for l in lineas[:-1]: inicio_linea.append(inicio_linea[-1] + len(l) + 1)
    def tok_desde_linea(li):
        p = inicio_linea[li]
        for i, t in enumerate(toks):
            if t.pos >= p: return i
        return len(toks)

    partidas = [p for p in L['partidas'] if p['tipo'] == 'completa'] + F[str(n)]
    partidas.sort(key=lambda p: p['i0'])
    tramos = []   # (a, b, tipo, objeto)
    for gi, p in enumerate(partidas):
        li = linea_de(texto, toks[p['i0']].pos)
        cab = []
        j = li - 1
        while j >= 0 and (es_cabecera(lineas[j]) or (lineas[j].strip().startswith('⟦') and cab)) and len(cab) < 6:
            if not lineas[j].strip().startswith('⟦'): cab.insert(0, lineas[j])
            j -= 1
        a = tok_desde_linea(j + 1) if cab else p['i0']
        fin = (p['ri'] if p.get('ri') is not None else p['movs'][-1]['ti']) + 1
        # la cabecera no puede comerse la partida anterior
        if tramos and a < tramos[-1][1]: a = max(a, tramos[-1][1])
        diags = []
        b = chess.Board(p['fen']) if p.get('fen') else chess.Board()
        intro = comentario(toks, a, p['i0'], [], 0)
        # quitar de la intro el texto de la cabecera
        intro = ''
        movs = []
        for k, m in enumerate(p['movs']):
            sig = p['movs'][k + 1]['ti'] if k + 1 < len(p['movs']) else fin
            if p.get('ri') is not None and k + 1 == len(p['movs']): sig = p['ri']
            com = comentario(toks, m['ti'] + 1, sig, diags, k + 1)
            mv = chess.Move.from_uci(m['uci'])
            movs.append({'n': b.fullmove_number, 'color': 'w' if b.turn else 'b', 'san': b.san(mv), 'uci': m['uci'],
                         'nag': nag_de(toks[m['ti']].t), 'comentario': com})
            b.push(mv); movs[-1]['fen'] = b.fen()
        # diagramas entre la cabecera y la primera jugada: posición inicial
        for i in range(a, p['i0']):
            mm = re.match(r'⟦DIAG:(.+)⟧', toks[i].t)
            if mm: diags.append((mm.group(1), 0))
        hdr = cabecera_de(cab)
        obj = dict(hdr, id='ml%03d-%d' % (n, gi + 1), start_fen=p.get('fen') or chess.STARTING_FEN, moves=movs,
                   resultado=(p.get('res') or '').replace('1/2-1/2', '½-½'), diagramas=sorted({d[1] for d in diags}),
                   fragmento=bool(p.get('fen')), i0=p['i0'], cabecera_cruda=' / '.join(l.strip() for l in cab))
        tramos.append((a, fin, 'partida', obj))
    # ejercicios: enunciado aquí, solución en la clase siguiente
    from ejercicios import enunciados, soluciones
    ejs = {(e['tipo'], e['num']): e for e in EJ if e['leccion'] == n}
    for e in enunciados(toks):
        k = e['i']; j = k + 1; visto = False
        while j < len(toks) and j < k + 120:
            if toks[j].t.startswith('⟦'):
                if visto: break
                visto = True
            elif visto and toks[j].t in ('Ejercicio', 'SOLUCIONES', 'REPASO', 'SOLUCIÓN', 'EJERCICIOS'): break
            j += 1
        tramos.append((k, j, 'ejercicio', ejs.get((e['tipo'], e['num']))))
    for (tipo, num), (a, b) in soluciones(toks).items():
        tramos.append((max(0, a - 6), b, 'quitar', None))
    for i, t in enumerate(toks):
        if t.t == 'EJERCICIOS' and i + 2 < len(toks) and toks[i + 2].t.startswith('TÁCTICA'):
            j = i + 3
            while j < len(toks) and toks[j].t != 'Ejercicio' and j < i + 40: j += 1
            tramos.append((i, j, 'quitar', None))
    tramos.sort(key=lambda x: x[0])
    # prosa entre tramos
    items = []; cursor = 0
    def prosa(a, b):
        if b <= a: return
        pa = toks[a].pos; pb = toks[b].pos if b < len(toks) else len(texto)
        for par in parrafos(texto[pa:pb]):
            items.append({'tipo': 'texto', 'texto': par})
    for a, b, tipo, obj in tramos:
        if a < cursor: a = cursor
        prosa(cursor, a)
        if tipo == 'partida': items.append({'tipo': 'partida', 'partida': obj})
        elif tipo == 'ejercicio' and obj: items.append({'tipo': 'ejercicio', 'ejercicio': obj})
        cursor = max(cursor, b)
    prosa(cursor, len(toks))
    tit = limpiar_frase(TIT[str(n)].strip())
    if tit.endswith('?') and '¿' not in tit: tit = '¿' + tit
    return {'n': n, 'titulo': tit, 'bloque': bloque_de(TIT[str(n)]), 'items': items}

def separar(lec):
    """Saca de la prosa el encabezado, «qué verás» y las conclusiones."""
    items = lec['items']; fecha = ''; veras = []; concl = []; out = []
    modo = None; npros = 0
    norm = lambda w: re.sub(r'\W', '', w.lower())
    tw = [norm(w) for w in lec['titulo'].split() if norm(w)]
    def sin_cola_titulo(t):
        ws = t.split(); nw = [norm(w) for w in ws]
        for k in range(min(len(tw), len(ws)), 0, -1):
            if nw[:k] == tw[-k:]: return ' '.join(ws[k:])
        return t
    tit = set(re.findall(r'\w+', lec['titulo'].lower()))
    for it in items:
        if it['tipo'] != 'texto':
            if modo == 'veras': modo = None
            out.append(it); continue
        t = it['texto']
        m = re.match(r'^Clase:\s*\d+\s*(Fecha:\s*([\d/]+))?\s*(.*)$', t)
        if m:
            fecha = m.group(2) or fecha; t = m.group(3)
            if not t: continue
        m = re.match(r'^Fecha:\s*([\d/]+)\s*(.*)$', t)
        if m: fecha = m.group(1); t = m.group(2)
        if 'Título:' in t:
            resto = t.split('Título:', 1)[1].split()
            antes = t.split('Título:', 1)[0].split()
            pal = [w for w in antes + resto]
            k = 0
            while k < len(pal) and re.sub(r'\W', '', pal[k].lower()) in {re.sub(r'\W', '', x) for x in tit} | {''}: k += 1
            t = ' '.join(pal[k:])
            if not t: continue
        npros += 1
        if npros <= 3 and not out: t = sin_cola_titulo(t)
        if not t: continue
        if t.startswith('¿Qué verás en esta clase?'):
            modo = 'veras'; t = t[len('¿Qué verás en esta clase?'):].strip()
            if not t: continue
        if t.startswith('Conclusiones'):
            modo = 'concl'; t = re.sub(r'^Conclusiones:?\s*', '', t)
            if not t: continue
        if modo == 'veras': veras.append(t); continue
        if modo == 'concl': concl.append(t); continue
        if re.match(r'^(SOLUCIONES|SOLUCIÓN al)', t): continue
        if len(t) < 40 and t.upper() == t and re.search(r'[A-ZÁÉÍÓÚ]{4}', t):
            out.append({'tipo': 'subtitulo', 'texto': t.capitalize()}); continue
        out.append({'tipo': 'texto', 'texto': t})
    lec.update(items=out, fecha=fecha, que_veras=veras, conclusiones=concl)
    return lec

if __name__ == '__main__':
    res = [separar(armar(n)) for n in range(1, 361)]
    json.dump(res, open('ext/armado.json', 'w'), ensure_ascii=False)
    import collections
    c = collections.Counter(it['tipo'] for l in res for it in l['items'])
    print(c, sum(1 for l in res if l['que_veras']), sum(1 for l in res if l['conclusiones']))
