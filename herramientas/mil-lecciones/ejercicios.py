import os
# Ejercicios de táctica y «Repaso y práctica»: el enunciado está en una lección
# y la solución en la siguiente. La posición sale del diagrama reconocido y la
# solución se acepta solo si sus jugadas son legales desde ahí.
import sys, json, re, chess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from leer import tokenizar, resolver, resultado_tras, Presupuesto, PRESUPUESTO, jugar, MOV
from fragmentos import tablero
REC = json.load(open('ext/reconocidos.json'))

def texto(toks, a, b):
    return ' '.join(t.t for t in toks[a:b] if not t.t.startswith('⟦'))

def diag_en(t):
    m = re.match(r'⟦DIAG:(.+)⟧', t.t)
    return m.group(1) if m else None

def enunciados(toks):
    """[(tipo, num, nivel, diag, juegan_negras, enunciado, i)]"""
    out = []
    for i, t in enumerate(toks):
        tipo = None
        if t.t == 'Ejercicio' and i + 1 < len(toks) and re.match(r'^\d\.$', toks[i+1].t):
            tipo, num = 'tactica', int(toks[i+1].t[0])
        elif t.t == 'REPASO' and i + 2 < len(toks) and toks[i+1].t == 'y' and toks[i+2].t.startswith('PRÁCTICA'):
            if i > 0 and toks[i-1].t.startswith(('“', '"', 'al')): continue
            tipo, num = 'repaso', 0
        if not tipo: continue
        nivel = None
        m = re.search(r'dificultad:\s*(\w+)', texto(toks, i, i + 8))
        if m and tipo == 'tactica': nivel = m.group(1)
        diag = None; j = i + 1
        while j < min(len(toks), i + 25):
            diag = diag_en(toks[j])
            if diag: break
            j += 1
        if not diag: continue
        k = j + 1
        while k < len(toks) and not diag_en(toks[k]) and toks[k].t not in ('Ejercicio', 'SOLUCIONES', 'REPASO', 'SOLUCIÓN') and k < j + 80:
            k += 1
        enun = texto(toks, j + 1, k)
        neg = bool(re.match(r'\s*Juegan\s+las\s+negras', enun))
        if not re.match(r'\s*Juegan\s+las\s+(blancas|negras)', enun): continue
        out.append({'tipo': tipo, 'num': num, 'nivel': nivel, 'diag': diag, 'negras': neg, 'enunciado': enun, 'i': i})
    return out

def soluciones(toks):
    """{('tactica', n) | ('repaso', 0): (i_inicio, i_fin, cabecera)}"""
    out = {}
    for i, t in enumerate(toks):
        if t.t == 'SOLUCIONES':
            j = i + 1; n_esp = 1; ini = None
            while j < min(len(toks), i + 1500):
                x = toks[j].t
                if x in ('REPASO', 'SOLUCIÓN', 'EJERCICIOS', 'Ejercicio', 'Conclusiones:'): break
                if x == '%d.' % n_esp and j + 1 < len(toks) and toks[j+1].t[:1].isupper():
                    if ini is not None: out[('tactica', n_esp - 1)] = ini + (j,)
                    ini = (j + 1,); n_esp += 1
                j += 1
            if ini is not None: out[('tactica', n_esp - 1)] = ini + (j,)
        if t.t == 'SOLUCIÓN' and 'REPASO' in texto(toks, i, i + 5):
            j = i + 1
            while j < min(len(toks), i + 900) and toks[j].t not in ('REPASO', 'EJERCICIOS', 'SOLUCIONES', 'Conclusiones:'):
                j += 1
            out[('repaso', 0)] = (i + 5, j)
    return out

def resolver_desde(toks, a, b_fin, board):
    # primera jugada numerada dentro del tramo
    for i in range(a, b_fin):
        k = toks[i]
        if k.san is None or k.num is None or k.d: continue
        b = board.copy()
        b.turn = not k.neg
        b.fullmove_number = k.num
        try:
            PRESUPUESTO[0] = 200000
            _, path = resolver(toks[:b_fin], i, b.copy(), {})
        except Presupuesto:
            return None
        if path and path[0][0] == i:
            return b, path
        return None
    return None

if __name__ == '__main__':
    lec = {n: json.load(open('ext/lec/%03d.json' % n)) for n in range(1, 361)}
    toks = {n: tokenizar(lec[n]['texto']) for n in lec}
    res = []; cont = {'enunciados': 0, 'con_sol': 0, 'legal': 0}
    for n in range(1, 361):
        for e in enunciados(toks[n]):
            cont['enunciados'] += 1
            if n + 1 > 360: continue
            sol = soluciones(toks[n + 1]).get((e['tipo'], e['num']))
            if not sol or e['diag'] not in REC: continue
            cont['con_sol'] += 1
            a, b_fin = sol
            try:
                board = tablero(REC[e['diag']]['tablero'], e['negras'], 1)
            except Exception:
                continue
            r = resolver_desde(toks[n + 1], a, b_fin, board)
            if not r: continue
            b0, path = r
            if b0.turn != (not e['negras']) or not b0.is_valid(): continue
            bb = b0.copy(); movs = []
            for ti, mv in path:
                movs.append({'san': bb.san(mv), 'uci': mv.uci(), 'ti': ti}); bb.push(mv)
            cont['legal'] += 1
            res.append({'leccion': n, 'tipo': e['tipo'], 'num': e['num'], 'nivel': e['nivel'], 'diag': e['diag'],
                        'fen': b0.fen(), 'enunciado': e['enunciado'], 'cabecera': texto(toks[n + 1], a, path[0][0]),
                        'solucion': movs, 'sol_leccion': n + 1, 'sol_rango': [a, b_fin]})
    json.dump(res, open('ext/ejercicios.json', 'w'), ensure_ascii=False)
    print(cont)
