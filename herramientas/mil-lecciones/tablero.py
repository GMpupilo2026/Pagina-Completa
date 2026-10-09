import numpy as np
from PIL import Image

def cargar(ruta):
    im = Image.open(ruta).convert('RGB')
    return np.asarray(im).astype(np.float32)

def _puntaje(g, x0, y0, s):
    # muestras en las 4 esquinas de cada casilla (donde casi nunca hay pieza)
    c = s / 8.0
    vals = []
    for f in (0.12, 0.88):
        for h in (0.12, 0.88):
            xs = (x0 + (np.arange(8) + f) * c).astype(int)
            ys = (y0 + (np.arange(8) + h) * c).astype(int)
            vals.append(g[np.ix_(ys, xs)])
    v = np.median(np.stack(vals), axis=0)          # 8x8
    chk = (np.add.outer(np.arange(8), np.arange(8)) % 2 == 0)  # a8 claro
    a, b = v[chk], v[~chk]
    return (np.median(a) - np.median(b)) - 0.5*(a.std() + b.std())

def detectar(img):
    g = img.mean(axis=2)
    H, W = g.shape
    mejor = None
    lado = min(H, W)
    for s in range(int(lado*0.78), lado+1, 4):
        for y0 in range(0, H - s + 1, 4):
            for x0 in range(0, W - s + 1, 4):
                p = _puntaje(g, x0, y0, s)
                if mejor is None or p > mejor[0]: mejor = (p, x0, y0, s)
    p, x0, y0, s = mejor
    # refinar a 1 px
    for s2 in range(s-4, s+5):
        for y2 in range(max(0,y0-4), y0+5):
            for x2 in range(max(0,x0-4), x0+5):
                if y2+s2 <= H and x2+s2 <= W:
                    q = _puntaje(g, x2, y2, s2)
                    if q > mejor[0]: mejor = (q, x2, y2, s2)
    return mejor
