import os
import sys, json, numpy as np, chess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from etiquetar import rasgos_de, ORDEN, R, D
E2 = json.load(open('ext/etiquetas.json'))

def datos(claves):
    X, y, g = [], [], []
    for k in claves:
        F, o = rasgos_de(k)
        b = chess.Board(E2[k]['fen'])
        for i, sq in enumerate(ORDEN):
            p = b.piece_at(chess.parse_square(sq))
            if p:
                X.append(F[i]); y.append(p.symbol()); g.append(k)
    return np.array(X, dtype=np.float32), np.array(y), np.array(g)

def norm(X):
    return X / (np.linalg.norm(X, axis=1, keepdims=True) + 1e-6)

class Knn:
    def __init__(s, X, y): s.X = norm(X); s.y = y
    def predecir(s, X, k=3):
        S = norm(X) @ s.X.T
        idx = np.argsort(-S, axis=1)[:, :k]
        out = []; conf = []
        for fila, sims in zip(idx, np.take_along_axis(S, idx, axis=1)):
            votos = {}
            for j, sm in zip(fila, sims): votos[s.y[j]] = votos.get(s.y[j], 0) + sm
            mejor = max(votos, key=votos.get); out.append(mejor); conf.append(sims[0])
        return np.array(out), np.array(conf)

if __name__ == '__main__':
    ks = sorted(E2); rng = np.random.default_rng(0); rng.shuffle(ks)
    corte = int(len(ks) * 0.8)
    Xa, ya, _ = datos(ks[:corte]); Xb, yb, gb = datos(ks[corte:])
    m = Knn(Xa, ya); p, c = m.predecir(Xb)
    print('casillas ocupadas: aciertos', (p == yb).mean(), len(yb))
    malos = set(gb[p != yb]); print('diagramas con algún error', len(malos), 'de', len(set(gb)))
