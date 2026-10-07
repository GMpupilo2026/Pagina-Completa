import os
# Reconoce la posición de todos los diagramas con el modelo aprendido.
import sys, json, numpy as np, chess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from piezas import datos, Knn, E2
from etiquetar import rasgos_de, ORDEN, R, D
X, y, _ = datos(sorted(E2))
m = Knn(X, y)
out = {}
for k in sorted(D):
    if not R.get(k): continue
    F, o = rasgos_de(k)
    idx = [i for i in range(64) if o[i]]
    if not idx: continue
    p, c = m.predecir(F[idx], 1)
    filas = [['.'] * 8 for _ in range(8)]
    for i, s in zip(idx, p):
        filas[i // 8][i % 8] = s
    fen = '/'.join(''.join(f) for f in filas)
    fen = __import__('re').sub(r'\.+', lambda mm: str(len(mm.group(0))), fen)
    out[k] = {'tablero': fen, 'conf_min': float(c.min())}
json.dump(out, open('ext/reconocidos.json', 'w'))
print(len(out))
