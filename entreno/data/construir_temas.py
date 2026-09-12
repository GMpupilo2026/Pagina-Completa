#!/usr/bin/env python3
"""Arma entreno/data/temas.json a partir de la base abierta de ejercicios de
Lichess (formato oficial: FEN antes de la jugada del rival, Moves en UCI con la
jugada del rival primero y luego la solución).

Fuente: combined_puzzle_db_first_50k.ndjson (repositorio público
mcognetta/lichess-combined-puzzle-game-db, subconjunto de la base CC0 de
Lichess) más temas_extra.json: 13 temas de mate nuevos que no existen en ese
subconjunto de 2022 (balestraMate, vukovicMate, collinearMove...), tomados
uno a uno de las páginas lichess.org/training/<tema> y ya convertidos a
fen/solution. Verificar la base: python3 construir_temas.py (reescribe
temas.json; necesita python-chess).

Por tema se eligen hasta N ejercicios de calidad (popularidad y partidas
jugadas), repartidos uniformemente por rating para que el tema vaya de fácil a
difícil. Cada solución se reproduce con python-chess: si algo no cuadra, el
ejercicio se descarta."""
import json, sys
from pathlib import Path
import chess

HERE = Path(__file__).resolve().parent
SRC = HERE / 'combined_puzzle_db_first_50k.ndjson'
SRC_URL = 'https://raw.githubusercontent.com/mcognetta/lichess-combined-puzzle-game-db/main/combined_puzzle_db_first_50k.ndjson.bz2'
GROUPS = json.loads((HERE / 'temas_grupos.json').read_text(encoding='utf-8'))
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / 'temas.json'

if not SRC.exists():
    # ~80 MB comprimido, ~500 MB descomprimido; no se versiona.
    import bz2, urllib.request
    print('descargando', SRC_URL, '...')
    with urllib.request.urlopen(SRC_URL) as r, open(SRC, 'wb') as f:
        f.write(bz2.decompress(r.read()))
N = 60
N_MIX = 120

wanted = []
for g in GROUPS:
    for t in g['themes']:
        if t['key'] not in wanted and t['key'] != 'of-player':
            wanted.append(t['key'])

# ---- leer y convertir ---------------------------------------------------
cands = {}   # id -> registro
by_theme = {k: [] for k in wanted}
bad = 0
with open(SRC, encoding='utf-8') as f:
    for line in f:
        d = json.loads(line)
        p = d['puzzle']
        themes = p['Themes'].split()
        try:
            b = chess.Board(p['FEN'])
            moves = p['Moves'].split()
            b.push(chess.Move.from_uci(moves[0]))          # jugada del rival
            fen = b.fen()
            sol = []
            for uci in moves[1:]:
                mv = chess.Move.from_uci(uci)
                if mv not in b.legal_moves:
                    raise ValueError('ilegal')
                sol.append(b.san(mv))
                b.push(mv)
            if not sol:
                raise ValueError('sin solución')
        except Exception:
            bad += 1
            continue
        g = d.get('game') or {}
        players = g.get('players') or {}
        rec = {
            'fen': fen, 'solution': sol, 'rating': int(p['Rating']), 'themes': themes,
            'mate': b.is_checkmate(),
            'game': p['GameUrl'],
        }
        w = (players.get('white') or {}).get('user', {}).get('name')
        bl = (players.get('black') or {}).get('user', {}).get('name')
        if w and bl:
            rec['players'] = f'{w} – {bl}'
        pop, plays = int(p['Popularity']), int(p['NbPlays'])
        cands[p['PuzzleId']] = (rec, pop, plays)
        for t in themes:
            if t in by_theme:
                by_theme[t].append(p['PuzzleId'])
        by_theme.setdefault('mix', []).append(p['PuzzleId'])

# ---- selección por tema ---------------------------------------------------
def pick(ids, n):
    good = [i for i in ids if cands[i][1] >= 80 and cands[i][2] >= 100]
    if len(good) < n:
        good = [i for i in ids if cands[i][1] >= 50]
    if len(good) < n:
        good = list(ids)
    good.sort(key=lambda i: (cands[i][0]['rating'], -cands[i][1]))
    if len(good) <= n:
        return good
    step = len(good) / n
    return [good[int(k * step)] for k in range(n)]

themes = {}
for k in wanted:
    ids = by_theme.get(k, [])
    themes[k] = pick(ids, N_MIX if k == 'mix' else N)

# ---- extra descargado de la API (temas raros) -----------------------------
extra = HERE / 'temas_extra.json'
if extra.exists():
    e = json.loads(extra.read_text(encoding='utf-8'))
    for pid, rec in e['puzzles'].items():
        if pid not in cands:
            cands[pid] = (rec, 100, 1000)
    for k, ids in e['themes'].items():
        if k not in themes:
            continue
        cur = themes[k]
        for i in ids:
            if i in cands and i not in cur and len(cur) < N:
                cur.append(i)
        cur.sort(key=lambda i: cands[i][0]['rating'])

used = sorted({i for ids in themes.values() for i in ids})
puzzles = {i: cands[i][0] for i in used}
groups = []
for g in GROUPS:
    ts = [t for t in g['themes'] if t['key'] in themes]
    if ts:
        groups.append({'id': g['id'].replace('puzzle:', ''), 'title': g['title'].replace('Más »', '').strip(),
                       'themes': [{'key': t['key'], 'name': t['name'], 'desc': t['desc'], 'lichess': t['count']} for t in ts]})

out = {'source': 'Base abierta de ejercicios de Lichess (CC0), lichess.org/training/themes',
       'groups': groups, 'themes': themes, 'puzzles': puzzles}
txt = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
OUT.write_text(txt, encoding='utf-8')
print(f'descartados al convertir: {bad}')
print(f'ejercicios únicos: {len(puzzles)}  tamaño: {len(txt.encode())//1024} KB')
for k in wanted:
    print(f'  {k:20s} {len(themes[k]):4d}  (disponibles {len(by_theme.get(k, []))})')
