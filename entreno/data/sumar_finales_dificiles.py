#!/usr/bin/env python3
"""Suma finales DIFÍCILES (1800 a 2800 de rating) a los temas de final de temas.json.

Por qué: construir_temas.py elige 100 ejercicios por tema repartidos por rating,
pero entre los que más se juegan en Lichess, y los más jugados son los fáciles.
Así, "Final" se quedaba en 1992 con apenas 3 por encima de 1800, y "Dama y
torre" tenía 16 de 2000 para arriba. Un alumno fuerte se acababa el tema en
una tarde. Esto le suma a cada tema de final hasta POR_TRAMO ejercicios en cada
tramo de 100 puntos entre 1800 y 2800: si el tramo ya los tiene, no suma nada.

De dónde salen: de la tabla "Ejercicios Lichess" de Supabase (la base abierta
de Lichess, CC0), con esta consulta, que dio la lista de CANDIDATOS de abajo:

    with c as (
     select t.k, e."PuzzleId" i, ("Rating"-1800)/100 b,
      row_number() over (partition by t.k, ("Rating"-1800)/100
                         order by e."NbPlays" desc, e."PuzzleId") rn
     from (values ('endgame'),('rookEndgame'),('bishopEndgame'),('pawnEndgame'),
                  ('knightEndgame'),('queenEndgame'),('queenRookEndgame')) t(k)
     join "Ejercicios Lichess" e on (' '||e."Themes"||' ') like '% '||t.k||' %'
     where e."Rating" between 1800 and 2799 and e."Popularity" >= 85 and e."NbPlays" >= 500)
    select k, string_agg(i, ' ' order by b, rn) from c where rn <= 8 group by k

o sea, los 8 más jugados de cada tramo, con buena valoración (popularidad ≥ 85)
y por lo menos 500 partidas: un ejercicio difícil y poco jugado puede tener la
dificultad mal medida o una segunda solución que nadie reportó todavía.

Cada ejercicio se baja de la API de Lichess (lichess.org/api/puzzle/<id>) y se
reproduce con python-chess desde la partida: la posición tiene que coincidir con
la que da Lichess y cada jugada de la solución tiene que ser legal. Si algo no
cuadra, el ejercicio se descarta y se avisa. Lo bajado queda en
finales_dificiles.json (se versiona), así que rehacer temas.json no necesita
internet. construir_temas.py llama a sumar() al final, igual que a la táctica.

SE PUEDE CORRER TODAS LAS VECES QUE SE QUIERA: lo que ya está no se repite.

Uso:
    python3 entreno/data/sumar_finales_dificiles.py           # suma a temas.json
    python3 entreno/data/sumar_finales_dificiles.py --bajar   # baja lo que falte de Lichess y suma
"""
import io
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = HERE / 'finales_dificiles.json'
DESDE, HASTA, TRAMO = 1800, 2800, 100
POR_TRAMO = 8

# Los candidatos de cada tema, en el orden de la consulta: tramo por tramo, del
# más jugado al menos jugado.
CANDIDATOS = {
    'endgame': '1gp2Z 0XqV2 1seQh 2uDMx 1CTnE 2500Y 0NlWG 114dQ 0BlI4 3JZ6I 0cvM3 25Aom 2BPpw 3OIkf 0pI7l 1TmTO 2CdiJ 1I1Hj 2p7N4 1Roux 1J6fo 3La0T 17zHs 2Kpgr 062e9 3L96G 2EesF 14LOM 0xYHW 1VQlE 008Sk 23rnF 00dt1 32kI1 22bIB 2IkwF 03uRJ 1f713 1uqWM 3QB5I 0f3zy 0K4vt 0Ngid 2hYQ8 026QC 3JV0W 38GaG 0jbFz 3OwAN 2U8Qu 10ZGs 2RyZW 2uwFG 0qzI4 1iaoa 0cKaD 179g1 1S5uZ 2cnM8 35P3M 2gNwv 0DoNL 09NOE 2vvLq 1jUnZ 1IKZh 2MSmg 0fTsF 0bXr4 0uNsl 15dg6 14QJA 1rQBp 0GvdU 1GqkO 0XYhM 03kqY 2nOSp 107ve 2tkue',
    'rookEndgame': '1CTnE 1AOP4 1Botb 0blcF 1oRdf 0G6WJ 1skwo 1AJg1 3JZ6I 2BPpw 3OIkf 1O74P 0nBoQ 2DnE9 0LEGe 0CMKk 2DVZ9 2nNA4 1pfE6 1CXJI 0J6Gj 35XM6 0C79A 26mIQ 14LOM 0xYHW 2Dvbe 1qncV 1D10g 29fPt 2tV7c 18Tu5 32kI1 03uRJ 3My0b 0BY7H 1lP46 0qTNV 3KdeG 1b9oF 0HsUY 0bZ72 1mLmi 313eT 0nHtB 34F5y 2IZKR 0Pjkr 2RyZW 2nf9w 1O0Fw 04yi1 0V8ro 0VrLq 1QMv8 2Sv56 0DoNL 19vpE 1zgid 2Wuer 2cPJE 3A08m 2JdPK 19JFW 3Brhz 2lWdS 2E7Vp 0eQwB 1roCg 0up8u 2gKFs 2v98a 0xCrA 0yAXY 05CjS 0Ffy8 0Kk24 0btvw 2IIep 21aUK',
    'bishopEndgame': '1A4AJ 3EaPM 1Bj0D 10veM 2HuhK 1duo2 1GUxH 15gb9 1ZXqW 38pL1 3C67O 3HfhA 0qsTh 0xe7y 2drbE 19ayW 1R2aH 17Ogg 1TlwM 0UVTT 1v9nP 0fwK1 19N3m 0Wjip 23rnF 1nLrq 1udhU 09Npd 01oWi 1qtQY 1glRg 23KLt 1uqWM 2IEvM 2DBnU 2FS2k 2qfRD 0Z0A3 1q7ZS 0bXN5 0D5Ot 00DZe 2zdw5 3QEpK 3PjbQ 1JVW7 0FMIf 2dHeL 3SfTw 2lNOQ 3MXK4 0Y6Td 2UKsJ 2WG8Q 1vI7e 37kWq 1oO84 30Omj 3JjbI 1EMFb 34WrN 2HXV7 2gwVK 1Co49 2oKcB 1SXHs 0GjEN 1OJX1 2ng0K 29iKl 2Wldq 2xGik 0GvdU 3FHAo 1DI0S 0kXxf 00WzB 3ECss 2PWJM 22MkQ',
    'pawnEndgame': '0mf5n 0FHs1 3I1BE 0oZWc 2R8d7 0Gal8 28wp1 1uAx4 0pI7l 3COuM 2ehPR 3OoQb 2TCzI 1pu5E 0zmII 1usec 1J6fo 3La0T 1FtOk 093wA 29JiL 20WMy 1ocL1 03zgW 12IfZ 24gc6 1LvSg 2v2Ft 3GJLJ 18Q85 22Dih 0ucAN 0u4wI 2zQJr 2w8RD 1pAjF 0OgkX 0by1k 0EccL 38vB7 0vpeP 2ai0j 0lLtd 1OroC 2d2HK 221CS 1RjCs 0gfBl 05VnQ 30PcM 1vlXr 1LK6V 2zZnJ 2xBt5 0NEhU 0L9pX 179g1 09NOE 2vvLq 12cAu 2njWa 1sc1S 34n6U 0Dr4R 15dg6 0BIxi 2CkMd 2Um7n 2nj2d 1H46B 32E9g 0Qfps 1GqkO 107ve 1EcG3 2wjDa 1O1NM 3JW6C 2sAze 35DCm',
    'knightEndgame': '35ji1 0L5uX 1fYj0 2DAL5 2lISE 1xGUn 1bT01 2XWcK 0eI76 1Zuao 1DjQh 3CxGe 3PUYi 167jX 1Z4Rf 2vISV 23GIL 1EdPp 2OYdV 0euUa 1SwUd 38zGl 2kypX 2puA7 0ydHc 3UAyu 1CQkm 3EOoj 081MG 1avRB 2Prnw 1BNdW 2FnU8 2u2T6 0ddkd 3NBfT 0fZpR 3U5Hb 2pZCx 1r6Xb 1CcmY 1ayWk 2OOdc 1ODv9 3FZA3 2zz9G 3O4ki 005ws 2uwFG 0qzI4 2bB8T 2hLFI 1UKoI 0Wkjq 0Z6T4 2hW3A 0Jol7 2HN6t 20ilk 2J3mk 1IGVk 2s51I 2M9rg 1VOlx 14QJA 2iH8Q 1XWGS 152DD 1xiGl 0y9MU 38Q3b 308KK 1rQBp 0EytC 1uVhy 34u0F 2Z8iE 2nDia 0aCWJ 2kV8V',
    'queenEndgame': '2x04E 24wwc 2Wcjx 0ihz8 1ezBM 0ZBYK 1rknq 1DtMe 1ml9H 2ittm 0VNg4 1IQv3 16dK0 0DOIB 0IoSr 1Bl1P 1Nycr 2CrvR 1oXd7 2xklB 3C5eE 3GCjN 1pz9T 2f5cR 17ajk 11et6 33h0j 0qQKo 2NV3W 18JxO 0ZaZc 26O7g 1FWXX 16jgc 1kL6m 28Cp8 2jNHs 0XHd1 39a2V 2WvLt 2hYQ8 1V3G4 1cN3U 31YU6 32pDC 0FTWk 2ngdK 0bD74 1xJoi 1a1jk 0YEZV 06i6v 3DFCF 1H6M0 1exqW 0TuD0 1lSoB 2qzI6 0WTB1 1Fcq6 3JvWS 34kTV 1AsDn 2ADkh 1IKZh 0fTsF 0zMKx 17kB3 2euRn 0qNwx 2jxHg 0UQuU 2tkue 0gyJ9 23mQX 1tFac 18GW0 0kfTy 1mP97 2XlLf',
    'queenRookEndgame': '2F6UO 1wy3o 2imEe 1m1CJ 3F7Hg 1k6id 01kNt 0kTXQ 1236I 2Te15 1G7Fx 2tEJZ 1E8lq 28Tn1 3S8a4 0nT1f 2uUL7 1oOKJ 1BdxB 2uaJE 0Fv1u 3QQsK 0GeiA 3BLqr 1qC2p 0QwI5 1dHM7 342eE 0cb4d 2FTZY 0vPqI 1IT3E 1nCie 2pI72 3OKQ7 2a7fG 1ZEUc 2HAHl 0MoRj 0hGUB 1ErU4 0eN0K 2zndX 2ivhd 22tGy 0uIKT 0Xr1O 2N00n 2eyb1 2QA1K 1JKlZ 3305O 39Od5 2LYLR 2lFTC 1MNIe 01zXk 1Y123 1i5Sj 3NgPs 1ehSV 2Wb8s 1BKA5 26qQX 0hdV3 2lVXV 1h8Tp 1BmgN 22lGp 0QUg8 2VSEV 0VwPV',
}


def tramo(rating):
    return (rating - DESDE) // TRAMO


def bajar(ids, cache):
    """Baja de Lichess los ejercicios que falten en el cache y los comprueba."""
    import chess
    import chess.pgn
    faltan = [i for i in ids if i not in cache]
    print(f'bajando {len(faltan)} ejercicios de lichess.org...', flush=True)
    malos = []
    for n, pid in enumerate(faltan, 1):
        while True:
            try:
                req = urllib.request.Request(f'https://lichess.org/api/puzzle/{pid}',
                                             headers={'Accept': 'application/json'})
                d = json.load(urllib.request.urlopen(req, timeout=30))
                break
            except urllib.error.HTTPError as e:
                if e.code == 429:            # Lichess pide esperar un minuto
                    time.sleep(61)
                    continue
                d = None
                break
        time.sleep(0.6)
        rec = convertir(d, chess, chess.pgn) if d else None
        if rec is None:
            malos.append(pid)
            continue
        cache[pid] = rec
        if n % 50 == 0:
            print(f'  {n}/{len(faltan)}', flush=True)
            guardar_cache(cache)
    guardar_cache(cache)
    if malos:
        print(f'  descartados (no cuadran o no se bajaron): {" ".join(malos)}')


def convertir(d, chess, pgn):
    """Respuesta de la API -> registro de temas.json, o None si algo no cuadra."""
    try:
        pz, game = d['puzzle'], d['game']
        partida = pgn.read_game(io.StringIO(game['pgn']))
        b = partida.board()
        jugadas = list(partida.mainline_moves())
        for mv in jugadas[:pz['initialPly'] + 1]:
            b.push(mv)
        # La posición reproducida tiene que ser la misma que dice Lichess.
        if b.fen().split()[:4] != pz['fen'].split()[:4]:
            return None
        quien_movio = 'white' if b.turn == chess.BLACK else 'black'
        url = f"https://lichess.org/{game['id']}{'' if quien_movio == 'white' else '/black'}#{pz['initialPly'] + 1}"
        fen = b.fen()
        sol = []
        for uci in pz['solution']:
            mv = chess.Move.from_uci(uci)
            if mv not in b.legal_moves:
                return None
            sol.append(b.san(mv))
            b.push(mv)
        if not sol:
            return None
        return {'fen': fen, 'solution': sol, 'rating': int(pz['rating']),
                'themes': sorted(pz['themes']), 'mate': b.is_checkmate(), 'game': url}
    except Exception:
        return None


def guardar_cache(cache):
    CACHE.write_text(json.dumps(dict(sorted(cache.items())), ensure_ascii=False, indent=0), encoding='utf-8')


def sumar(temas: dict, cache: dict) -> dict:
    """Completa cada tema de final hasta POR_TRAMO ejercicios por tramo de 1800 a 2800."""
    resumen = {}
    for tema, lista in CANDIDATOS.items():
        ids = temas['themes'].get(tema)
        if ids is None:
            continue
        ya = set(ids)
        cuenta = {}
        for i in ids:
            r = temas['puzzles'][i].get('rating')
            if isinstance(r, int) and DESDE <= r < HASTA:
                cuenta[tramo(r)] = cuenta.get(tramo(r), 0) + 1
        nuevos = []
        for pid in lista.split():
            if pid not in cache or pid in ya:
                continue
            # Si ya está en otro tema, vale ESE registro (con su rating de
            # entonces): contar con el del cache haría que la segunda corrida
            # lo viera en otro tramo y sumara de más.
            rec = temas['puzzles'].get(pid) or cache[pid]
            if tema not in rec['themes'] or not isinstance(rec.get('rating'), int):
                continue
            if not (DESDE <= rec['rating'] < HASTA):
                continue
            t = tramo(rec['rating'])
            if cuenta.get(t, 0) >= POR_TRAMO:
                continue
            cuenta[t] = cuenta.get(t, 0) + 1
            temas['puzzles'].setdefault(pid, rec)
            ids.append(pid)
            ya.add(pid)
            nuevos.append(pid)
        ids.sort(key=lambda i: (temas['puzzles'][i].get('rating', 0), i))
        resumen[tema] = len(nuevos)
    for tema, n in resumen.items():
        print(f'  {tema:18s} +{n:3d}  (ahora {len(temas["themes"][tema])})')
    return temas


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    destino = Path(args[0]) if args else HERE / 'temas.json'
    cache = json.loads(CACHE.read_text(encoding='utf-8')) if CACHE.exists() else {}
    if '--bajar' in sys.argv:
        todos = list(dict.fromkeys(i for l in CANDIDATOS.values() for i in l.split()))
        bajar(todos, cache)
    temas = json.loads(destino.read_text(encoding='utf-8'))
    temas = sumar(temas, cache)
    txt = json.dumps(temas, ensure_ascii=False, separators=(',', ':'))
    destino.write_text(txt, encoding='utf-8')
    print(f'{destino.name}: {len(temas["puzzles"])} ejercicios únicos  ·  {len(txt.encode())//1024} KB')


if __name__ == '__main__':
    main()
