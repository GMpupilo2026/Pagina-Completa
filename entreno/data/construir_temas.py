#!/usr/bin/env python3
"""Arma entreno/data/temas.json (la base de respaldo de "Ejercicios por tema")
a partir de la tabla "Ejercicios Lichess" de Supabase (343 mil ejercicios de la
base abierta de Lichess, licencia CC0, en el formato oficial: FEN antes de la
jugada del rival y Moves en UCI con esa jugada primero y luego la solución).

Por tema se eligen N ejercicios de calidad (popularidad ≥ 80 y ≥ 100 partidas
jugadas; si no alcanza, se relaja el filtro) repartidos uniformemente por
rating, para que cada tema vaya de fácil a difícil. Los temas que ni así
llegan a N se completan con temas_extra.json (ejercicios tomados uno a uno de
lichess.org/training/<tema>, ya convertidos). Cada solución se reproduce con
python-chess; si algo no cuadra, el ejercicio se descarta.

Uso:
    python3 construir_temas.py            # rehace temas.json
    python3 construir_temas.py salida.json

La fuente (temas_fuente.json, ~16 MB, no se versiona) se descarga sola de la
API REST de Supabase con la clave pública del sitio (js/supabase-client.js).
"""
import json, re, sys, urllib.request, urllib.parse
from pathlib import Path
import chess

HERE = Path(__file__).resolve().parent
GROUPS = json.loads((HERE / 'temas_grupos.json').read_text(encoding='utf-8'))
SRC = HERE / 'temas_fuente.json'
EXTRA = HERE / 'temas_extra.json'
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / 'temas.json'
N = 100
SUPABASE = 'https://bgtijpimpcokxatxxbki.supabase.co/rest/v1/Ejercicios%20Lichess'

wanted = []
for g in GROUPS:
    for t in g['themes']:
        if t['key'] not in wanted and t['key'] != 'of-player':
            wanted.append(t['key'])


def descargar_fuente():
    key = re.search(r'eyJ[A-Za-z0-9_.-]+', (HERE.parent.parent / 'js' / 'supabase-client.js').read_text(encoding='utf-8')).group(0)
    cols = 'PuzzleId,FEN,Moves,Rating,Popularity,NbPlays,Themes,GameUrl'
    out = {}
    for k in wanted:
        theme = '' if k == 'mix' else f'&Themes=like.*{k}*'
        rows, seen = [], set()
        for extra in ('&Popularity=gte.80&NbPlays=gte.100', '&Popularity=gte.50', ''):
            if len(rows) >= 150:
                break
            url = f'{SUPABASE}?select={cols}{theme}{extra}&order=NbPlays.desc&limit=1000'
            req = urllib.request.Request(url, headers={'apikey': key, 'Authorization': 'Bearer ' + key})
            for r in json.load(urllib.request.urlopen(req)):
                if r['PuzzleId'] in seen or (k != 'mix' and k not in r['Themes'].split()):
                    continue
                seen.add(r['PuzzleId']); rows.append(r)
        out[k] = rows
        print(f'  {k}: {len(rows)} filas', flush=True)
    SRC.write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')


if not SRC.exists():
    print('descargando la fuente desde Supabase...')
    descargar_fuente()
fuente = json.loads(SRC.read_text(encoding='utf-8'))


def convertir(row):
    """Fila de la base oficial -> registro de la página (o None si no cuadra)."""
    try:
        b = chess.Board(row['FEN'])
        moves = row['Moves'].split()
        b.push(chess.Move.from_uci(moves[0]))          # jugada del rival
        fen = b.fen()
        sol = []
        for uci in moves[1:]:
            mv = chess.Move.from_uci(uci)
            if mv not in b.legal_moves:
                return None
            sol.append(b.san(mv))
            b.push(mv)
        if not sol:
            return None
        return {'fen': fen, 'solution': sol, 'rating': int(row['Rating']), 'themes': row['Themes'].split(),
                'mate': b.is_checkmate(), 'game': row['GameUrl']}
    except Exception:
        return None


def repartir(items, n):
    """items ordenados por rating -> n elementos repartidos uniformemente."""
    if len(items) <= n:
        return items
    step = len(items) / n
    return [items[int(k * step)] for k in range(n)]


puzzles, themes, bad = {}, {}, 0
for k in wanted:
    rows = fuente.get(k, [])
    # calidad primero (los que pasaron el filtro estricto van primero en la fuente)
    cand = []
    for row in rows:
        rec = puzzles.get(row['PuzzleId']) or convertir(row)
        if rec is None:
            bad += 1
            continue
        cand.append((row['PuzzleId'], rec, int(row['Popularity']), int(row['NbPlays'])))
    strict = [c for c in cand if c[2] >= 80 and c[3] >= 100]
    pool = strict if len(strict) >= N else cand
    pool.sort(key=lambda c: (c[1]['rating'], -c[2]))
    chosen = repartir(pool, N)
    for pid, rec, _, _ in chosen:
        puzzles[pid] = rec
    themes[k] = [pid for pid, *_ in chosen]

# completar con los extras (páginas de lichess.org/training/<tema>)
if EXTRA.exists():
    e = json.loads(EXTRA.read_text(encoding='utf-8'))
    for k in wanted:
        if len(themes[k]) >= N:
            continue
        for pid in e['themes'].get(k, []):
            if len(themes[k]) >= N:
                break
            if pid not in themes[k] and pid in e['puzzles']:
                rec = e['puzzles'][pid]
                if k in rec['themes'] or k == 'mix':
                    puzzles.setdefault(pid, {kk: vv for kk, vv in rec.items() if kk != 'players'})
                    themes[k].append(pid)
        themes[k].sort(key=lambda i: puzzles[i]['rating'])

# solo los ejercicios usados
used = {i for ids in themes.values() for i in ids}
puzzles = {i: puzzles[i] for i in sorted(used)}

groups = []
for g in GROUPS:
    ts = [t for t in g['themes'] if themes.get(t['key'])]
    if ts:
        groups.append({'id': g['id'].replace('puzzle:', ''), 'title': g['title'].replace('Más »', '').strip(),
                       'themes': [{'key': t['key'], 'name': t['name'], 'desc': t['desc'], 'lichess': t['count']} for t in ts]})

out = {'source': 'Base abierta de ejercicios de Lichess (CC0), tabla "Ejercicios Lichess" de Supabase',
       'groups': groups, 'themes': themes, 'puzzles': puzzles}
txt = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
OUT.write_text(txt, encoding='utf-8')
print(f'descartados al convertir: {bad}')
print(f'ejercicios únicos: {len(puzzles)}  tamaño: {len(txt.encode())//1024} KB')
for k in wanted:
    flag = '' if len(themes[k]) >= N else '   <-- incompleto'
    print(f'  {k:20s} {len(themes[k]):4d}{flag}')
