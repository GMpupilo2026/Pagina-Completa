import os
# Comprueba con Stockfish 16 la jugada de cada ejercicio y de cada momento
# clave (las jugadas con «!» de la línea principal).
import sys, json, chess, chess.engine
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from leer import MOV
from multiprocessing import Pool
T = 0.5

def cp(score, color):
    s = score.pov(color)
    if s.is_mate():
        m = s.mate()
        return 10000 - abs(m) if m > 0 else -10000 + abs(m)
    return s.score()

def analizar(tarea):
    clave, fen, uci = tarea
    eng = chess.engine.SimpleEngine.popen_uci('/usr/games/stockfish')
    eng.configure({'Threads': 1, 'Hash': 64})
    try:
        b = chess.Board(fen)
        info = eng.analyse(b, chess.engine.Limit(time=T), multipv=4)
        lista = [(i['pv'][0].uci(), cp(i['score'], b.turn)) for i in info if 'pv' in i]
        jug = chess.Move.from_uci(uci)
        if all(u != uci for u, _ in lista):
            r = eng.analyse(b, chess.engine.Limit(time=T), root_moves=[jug])
            lista.append((uci, cp(r['score'], b.turn)))
        return clave, {'mejor': lista[0][0], 'eval_mejor': lista[0][1], 'jugadas': lista}
    finally:
        eng.quit()

if __name__ == '__main__':
    tareas = []
    for e in json.load(open('ext/ejercicios.json')):
        tareas.append(('ej:%d:%s:%d' % (e['leccion'], e['tipo'], e['num']), e['fen'], e['solucion'][0]['uci']))
    F = json.load(open('ext/fragmentos.json'))
    for n in range(1, 361):
        L = json.load(open('ext/lec/%03d.json' % n))
        partidas = [p for p in L['partidas'] if p['tipo'] == 'completa'] + F[str(n)]
        for p in partidas:
            b = chess.Board(p['fen']) if p.get('fen') else chess.Board()
            for k, m in enumerate(p['movs']):
                t = L['toks'][m['ti']][0].lstrip('[(')
                mm = MOV.match(t.rstrip(')];,'))
                nag = ((mm.group(4) or '') + (mm.group(5) or '')) if mm else ''
                if nag in ('!', '!!') and m['d'] == 0:
                    tareas.append(('cl:%d:%d:%d' % (n, p['i0'], k), b.fen(), m['uci']))
                b.push(chess.Move.from_uci(m['uci']))
    print('tareas', len(tareas), flush=True)
    with Pool(4) as pool:
        res = dict(pool.imap_unordered(analizar, tareas, chunksize=8))
    json.dump(res, open('ext/motor.json', 'w'))
    print('ok', len(res))
