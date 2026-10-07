import sys, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from leer import *
from lecciones import lecciones
from multiprocessing import Pool

def una(L):
    t = limpiar('\n'.join(l for _, l in L['lineas']))
    js, toks = partidas_de(t)
    out = []
    for j in js:
        if j['tipo'] == 'completa':
            b = chess.Board()
            for _, mv in j['path']: b.push(mv)
            r, _ = resultado_tras(toks, j['path'][-1][0], b)
            if not r:
                b0 = chess.Board(); jugar(b0, toks[j['i0']].san)
                SOLO_PRINCIPAL[0] = True
                try:
                    PRESUPUESTO[0] = 400000
                    _, p2 = resolver(toks, j['i0'], chess.Board(), {})
                except Presupuesto:
                    p2 = []
                SOLO_PRINCIPAL[0] = False
                if p2:
                    b2 = chess.Board()
                    for _, mv in p2: b2.push(mv)
                    r2, _ = resultado_tras(toks, p2[-1][0], b2)
                    if r2: j['path'] = p2
            b = chess.Board(); movs = []
            for ti, mv in j['path']:
                movs.append({'ti': ti, 'san': b.san(mv), 'uci': mv.uci(), 'd': toks[ti].d})
                b.push(mv)
            r, ri = resultado_tras(toks, j['path'][-1][0], b)
            out.append({'tipo': 'completa', 'i0': j['i0'], 'movs': movs, 'res': r, 'ri': ri, 'cab': j['cab']})
        else:
            out.append({'tipo': 'fragmento', 'i0': j['i0'], 'num': j['num'], 'neg': j['neg'], 'san': j['san'], 'cab': j['cab']})
    return {'n': L['n'], 'texto': t, 'toks': [[x.t, x.d] for x in toks], 'partidas': out}

import os, time
def guardar(L):
    ruta = 'ext/lec/%03d.json' % L['n']
    if os.path.exists(ruta): return L['n'], 0
    t = time.time(); r = una(L)
    json.dump(r, open(ruta, 'w'), ensure_ascii=False)
    return L['n'], time.time() - t

if __name__ == '__main__':
    os.makedirs('ext/lec', exist_ok=True)
    L = lecciones()
    with Pool(4) as p:
        for n, dt in p.imap_unordered(guardar, L):
            print(n, round(dt, 1), flush=True)
    res = [json.load(open('ext/lec/%03d.json' % l['n'])) for l in L]
    json.dump(res, open('ext/lecciones.json', 'w'), ensure_ascii=False)
    print('ok', len(res), flush=True)
