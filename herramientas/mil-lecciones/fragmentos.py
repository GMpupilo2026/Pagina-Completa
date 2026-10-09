import os
# Lee las partidas que empiezan desde un diagrama: la posición sale del
# reconocedor y se acepta solo si las jugadas del texto son legales desde ahí.
import sys, json, re, chess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import leer
from leer import tokenizar, resolver, resultado_tras, Presupuesto, PRESUPUESTO, jugar
from multiprocessing import Pool
REC = json.load(open('ext/reconocidos.json'))
ETQ = json.load(open('ext/etiquetas.json'))

def tablero(fen_tab, negras, num):
    b = chess.Board(None)
    b.set_board_fen(fen_tab)
    b.turn = not negras
    b.fullmove_number = num
    cr = ''
    if b.piece_at(chess.E1) == chess.Piece(chess.KING, chess.WHITE):
        if b.piece_at(chess.H1) == chess.Piece(chess.ROOK, chess.WHITE): cr += 'K'
        if b.piece_at(chess.A1) == chess.Piece(chess.ROOK, chess.WHITE): cr += 'Q'
    if b.piece_at(chess.E8) == chess.Piece(chess.KING, chess.BLACK):
        if b.piece_at(chess.H8) == chess.Piece(chess.ROOK, chess.BLACK): cr += 'k'
        if b.piece_at(chess.A8) == chess.Piece(chess.ROOK, chess.BLACK): cr += 'q'
    b.set_castling_fen(cr or '-')
    return b

def una(n):
    L = json.load(open('ext/lec/%03d.json' % n))
    toks = tokenizar(L['texto'])
    ocupado = []
    for p in L['partidas']:
        if p['tipo'] == 'completa':
            ocupado.append((p['i0'], (p['ri'] or p['movs'][-1]['ti']) + 1))
    def dentro(i): return any(a <= i < b for a, b in ocupado)
    frags = []
    usados = set()
    for p in L['partidas']:
        if p['tipo'] != 'fragmento': continue
        i0 = p['i0']
        if dentro(i0) or any(a <= i0 < b for a, b, *_ in frags): continue
        # diagrama más cercano antes del inicio
        diag = None
        for k in range(i0 - 1, max(0, i0 - 90), -1):
            m = re.match(r'⟦DIAG:(.+)⟧', toks[k].t)
            if m:
                diag = m.group(1); break
            if toks[k].san is not None and toks[k].num is not None and toks[k].d == 0: break
        if not diag or diag in usados or diag in ETQ or diag not in REC: continue
        try:
            b = tablero(REC[diag]['tablero'], p['neg'], p['num'])
        except Exception:
            continue
        if not b.is_valid(): continue
        try:
            PRESUPUESTO[0] = 400000
            _, path = resolver(toks, i0, b.copy(), {})
        except Presupuesto:
            continue
        if not path or path[0][0] != i0: continue
        bb = b.copy(); movs = []
        for ti, mv in path:
            movs.append({'ti': ti, 'san': bb.san(mv), 'uci': mv.uci(), 'd': toks[ti].d}); bb.push(mv)
        r, ri = resultado_tras(toks, path[-1][0], bb)
        if len(movs) < 2: continue
        usados.add(diag)
        frags.append((i0, (ri or path[-1][0]) + 1, {'tipo': 'fragmento', 'i0': i0, 'diag': diag, 'fen': b.fen(), 'movs': movs, 'res': r, 'ri': ri, 'cab': p['cab']}))
    return n, [f[2] for f in frags]

if __name__ == '__main__':
    with Pool(4) as pool:
        res = dict(pool.map(una, range(1, 361)))
    json.dump(res, open('ext/fragmentos.json', 'w'), ensure_ascii=False)
    tot = sum(len(v) for v in res.values())
    con = sum(1 for v in res.values() for f in v if f['res'])
    print('fragmentos', tot, 'con resultado', con, 'jugadas', sum(len(f['movs']) for v in res.values() for f in v))
