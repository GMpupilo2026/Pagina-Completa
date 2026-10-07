import os
import sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tablero import cargar, detectar
from multiprocessing import Pool
d=json.load(open('ext/extraido.json'))['diagramas']
def f(k):
    try:
        p,x0,y0,s=detectar(cargar('ext/diag/'+d[k]['archivo']))
        return k,[float(p),x0,y0,s]
    except Exception as e:
        return k,None
if __name__=='__main__':
    with Pool(3) as pool:
        r=dict(pool.map(f, sorted(d), chunksize=20))
    json.dump(r,open('ext/rejillas.json','w'))
    print(len(r), sum(1 for v in r.values() if v is None))
