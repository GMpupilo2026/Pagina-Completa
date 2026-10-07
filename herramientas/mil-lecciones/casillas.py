import numpy as np
from PIL import Image
N = 20
def rasgos(img, x0, y0, s):
    """Devuelve (64, F) rasgos y (64,) ocupación, casillas en orden a8..h1 (fila por fila)."""
    c = s / 8.0
    feats = []; occ = []
    for r in range(8):
        for f in range(8):
            xa, ya = x0 + f*c, y0 + r*c
            m = c*0.10
            sq = img[int(ya+m):int(ya+c-m), int(xa+m):int(xa+c-m)]
            h, w = sq.shape[:2]
            k = max(2, int(min(h, w)*0.12))
            esq = np.concatenate([sq[:k,:k].reshape(-1,3), sq[:k,-k:].reshape(-1,3), sq[-k:,:k].reshape(-1,3), sq[-k:,-k:].reshape(-1,3)])
            bg = np.median(esq, axis=0)
            diff = np.abs(sq - bg).max(axis=2)
            mask = (diff > 45).astype(np.float32)
            g = sq.mean(axis=2) / 255.0
            mi = np.asarray(Image.fromarray((mask*255).astype(np.uint8)).resize((N, N), Image.BILINEAR)).astype(np.float32)/255
            gi = np.asarray(Image.fromarray((g*255).astype(np.uint8)).resize((N, N), Image.BILINEAR)).astype(np.float32)/255
            feats.append(np.concatenate([mi.ravel(), (gi*mi).ravel()]))
            occ.append(mask.mean())
    return np.array(feats), np.array(occ)

ORDEN = [f+r for r in '87654321' for f in 'abcdefgh']
