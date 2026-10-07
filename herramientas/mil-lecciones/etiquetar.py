import os
# Empareja cada diagrama que cae dentro de una partida leída con la posición
# que muestra, y aprende de ahí las piezas.
import sys, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, chess
from tablero import cargar
from casillas import rasgos, ORDEN

L = json.load(open('ext/lecciones.json'))
R = json.load(open('ext/rejillas.json'))
D = json.load(open('ext/extraido.json'))['diagramas']
UMBRAL = 0.12

def ocup_de(b):
    return np.array([1 if b.piece_at(chess.parse_square(sq)) else 0 for sq in ORDEN])

cache = {}
def rasgos_de(k):
    if k not in cache:
        p, x0, y0, s = R[k]
        F, o = rasgos(cargar('ext/diag/' + D[k]['archivo']), x0, y0, s)
        cache[k] = (F, (o > UMBRAL).astype(int))
    return cache[k]

def candidatos_partida(toks, movs):
    """Para cada diagrama dentro del tramo de la partida: posiciones cercanas."""
    b = chess.Board(); pos = [b.copy()]
    for m in movs:
        b.push(chess.Move.from_uci(m['uci'])); pos.append(b.copy())
    tis = [m['ti'] for m in movs]
    out = []
    ini, fin = tis[0], tis[-1] + 40
    for i in range(ini, min(fin, len(toks))):
        mm = re.match(r'⟦DIAG:(.+)⟧', toks[i][0])
        if not mm: continue
        k = mm.group(1)
        # cuántas jugadas van antes de este diagrama
        n = sum(1 for t in tis if t < i)
        out.append((k, [(n + d, pos[n + d]) for d in (0, -1, 1, -2, 2) if 0 <= n + d < len(pos)]))
    return out

if __name__ == '__main__':
    etiquetas = {}
    for lec in L:
        toks = lec['toks']
        for p in lec['partidas']:
            if p['tipo'] != 'completa': continue
            for k, cands in candidatos_partida(toks, p['movs']):
                if k not in R or R[k] is None: continue
                F, o = rasgos_de(k)
                mejor = None
                for ply, b in cands:
                    ac = int((ocup_de(b) == o).sum())
                    if mejor is None or ac > mejor[0]: mejor = (ac, ply, b)
                if mejor and mejor[0] >= 63:
                    etiquetas[k] = {'fen': mejor[2].fen(), 'ply': mejor[1], 'leccion': lec['n'], 'ocup': mejor[0]}
    json.dump(etiquetas, open('ext/etiquetas.json', 'w'))
    print('etiquetados', len(etiquetas), 'de', len(D))
