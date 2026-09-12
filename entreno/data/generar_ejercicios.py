#!/usr/bin/env python3
"""
Genera ejercicios nuevos de 4x4 (Solo Chess) para completar cada categoría
hasta un objetivo (por defecto 200), con estas garantías:

  - resolubles (pasan el mismo motor de capturas que usa la página);
  - distintos de todos los existentes y entre sí, incluso girados o en
    espejo (en Solo Chess una posición reflejada se juega igual);
  - con la misma cantidad de piezas y el mismo "reparto" de tipos de pieza
    que ya tiene la categoría (se muestrean de sus ejercicios reales);
  - con dificultad medida dentro del rango típico de la categoría (entre el
    percentil 10 y el 90 tanto del puntaje de reorder_por_dificultad.py como
    de la probabilidad de acertar al azar), así que no aparecen ni regalados
    ni imposibles para el nivel, y son "apretados" como los originales.

Los ejercicios generados llevan id `<categoria>-nNNN` y no tienen imagen
(la página ya no usa la miniatura cuando el ejercicio es jugable).

Uso:
    python3 generar_ejercicios.py            # completa las 4 categorías a 200
    python3 generar_ejercicios.py 180        # otro objetivo
    python3 generar_ejercicios.py --dry-run  # solo informa, no escribe
    python3 generar_ejercicios.py --solo especialista --out esp.json
        # genera solo esa categoría y guarda la lista en un archivo aparte
        # (para correr las 4 en paralelo y luego --merge a.json b.json ...)
    python3 generar_ejercicios.py --merge facil.json intermedio.json ...

Después conviene correr reorder_por_dificultad.py para que los nuevos
queden intercalados por dificultad.
"""
import json
import random
import sys
from collections import Counter
from pathlib import Path

from reorder_por_dificultad import score, solve_stats, random_success

DATA_DIR = Path(__file__).resolve().parent
EX_PATH = DATA_DIR / 'exercises.json'
PZ_PATH = DATA_DIR / 'puzzles.json'
CATS = ['facil', 'intermedio', 'avanzado', 'especialista']
LABEL = {'facil': 'Fácil', 'intermedio': 'Intermedio', 'avanzado': 'Avanzado', 'especialista': 'Especialista'}


def canon_sym(pieces):
    """Representante canónico bajo las 8 simetrías del tablero."""
    pts = [(p['row'], p['col'], p['type']) for p in pieces]
    def rot(q): return [(c, 3 - r, t) for r, c, t in q]
    def flip(q): return [(r, 3 - c, t) for r, c, t in q]
    best = None
    for _ in range(4):
        for cand in (tuple(sorted(pts)), tuple(sorted(flip(pts)))):
            if best is None or cand < best:
                best = cand
        pts = rot(pts)
    return best


def percentile(vals, f):
    vals = sorted(vals)
    k = (len(vals) - 1) * f
    lo = int(k); hi = min(lo + 1, len(vals) - 1)
    return vals[lo] + (vals[hi] - vals[lo]) * (k - lo)


def category_profile(cat_puzzles):
    counts = Counter(len(p['pieces']) for p in cat_puzzles)
    types = Counter(x['type'] for p in cat_puzzles for x in p['pieces'])
    scores = [score(p['pieces']) for p in cat_puzzles]
    azar = [random_success(p['pieces']) for p in cat_puzzles]
    return (counts, types, percentile(scores, 0.10), percentile(scores, 0.90),
            percentile(azar, 0.10), percentile(azar, 0.90))


KNIGHT = [(-2, -1), (-2, 1), (-1, -2), (-1, 2), (1, -2), (1, 2), (2, -1), (2, 1)]
DIRS_ROOK = [(-1, 0), (1, 0), (0, -1), (0, 1)]
DIRS_BISHOP = [(-1, -1), (-1, 1), (1, -1), (1, 1)]
DIRS_QUEEN = DIRS_ROOK + DIRS_BISHOP


def origins(piece, r, c, board):
    """Casillas vacías desde donde `piece` podría haber capturado en (r,c)
    (camino libre para las piezas que se deslizan)."""
    out = []
    if piece == 'N':
        cand = [(r + dr, c + dc) for dr, dc in KNIGHT]
        return [(a, b) for a, b in cand if 0 <= a < 4 and 0 <= b < 4 and (a, b) not in board]
    if piece in ('K', 'P'):
        dirs = DIRS_QUEEN if piece == 'K' else DIRS_BISHOP
        cand = [(r + dr, c + dc) for dr, dc in dirs]
        return [(a, b) for a, b in cand if 0 <= a < 4 and 0 <= b < 4 and (a, b) not in board]
    dirs = {'R': DIRS_ROOK, 'B': DIRS_BISHOP, 'Q': DIRS_QUEEN}[piece]
    for dr, dc in dirs:
        a, b = r + dr, c + dc
        while 0 <= a < 4 and 0 <= b < 4 and (a, b) not in board:
            out.append((a, b))
            a += dr; b += dc
    return out


def random_position(n, types_counter, rng):
    """Construye la posición "hacia atrás", como se diseñan estos puzzles:
    se parte de una pieza sola y se deshacen capturas una por una (la pieza
    vuelve a la casilla desde la que capturó y en su lugar aparece la pieza
    capturada). Así siempre existe al menos una solución y las posiciones
    salen "apretadas", con pocas soluciones, como las originales."""
    pop = list(types_counter.elements())
    for _ in range(50):
        r, c = rng.randrange(4), rng.randrange(4)
        board = {(r, c): rng.choice(pop)}
        ok = True
        while len(board) < n:
            movers = [(sq, t) for sq, t in board.items() if origins(t, sq[0], sq[1], board)]
            if not movers:
                ok = False; break
            (r, c), t = rng.choice(movers)
            a, b = rng.choice(origins(t, r, c, board))
            del board[(r, c)]
            board[(a, b)] = t
            board[(r, c)] = rng.choice(pop)
        if ok:
            return [{'row': r, 'col': c, 'type': t} for (r, c), t in board.items()]
    return None


def generate(cat, cat_puzzles, needed, taken, rng, max_tries=400000):
    counts, types, lo, hi, azar_lo, azar_hi = category_profile(cat_puzzles)
    # Cada ejercicio nuevo imita a un original elegido al azar ("modelo"):
    # misma cantidad de piezas y dificultad parecida. Así los nuevos quedan
    # repartidos igual que los originales en vez de amontonarse en la parte
    # fácil del rango (las posiciones al azar tienden a ser más flojas).
    modelos = [(len(p['pieces']), score(p['pieces']), random_success(p['pieces'])) for p in cat_puzzles]
    out = []
    tries = 0
    modelo = None
    tries_modelo = 0
    while len(out) < needed and tries < max_tries:
        tries += 1
        # se mantiene el mismo modelo hasta lograr un ejercicio parecido (si
        # no, los modelos difíciles nunca se alcanzan y los nuevos salen flojos)
        if modelo is None or tries_modelo > 800:
            modelo = rng.choice(modelos)
            tries_modelo = 0
        tries_modelo += 1
        n, m_score, m_azar = modelo
        pieces = random_position(n, types, rng)
        if pieces is None:
            continue
        # más de un Rey o más de una Dama no aparece en el set original salvo
        # casos aislados; se respeta el reparto real pero se evita el exceso
        tc = Counter(x['type'] for x in pieces)
        if tc['K'] > 1 or tc['Q'] > 2:
            continue
        key = canon_sym(pieces)
        if key in taken:
            continue
        _, _, _, _, solved = solve_stats(pieces)
        if not solved:
            continue
        s = score(pieces)
        if s < lo or s > hi or abs(s - m_score) > 3.0:
            continue
        # que sea "apretado" como su modelo: las posiciones al azar suelen
        # tener muchas soluciones y resultan regaladas para el nivel
        pa = random_success(pieces)
        if pa < azar_lo or pa > azar_hi:
            continue
        if not (m_azar / 4 <= pa <= m_azar * 4 + 1e-9):
            continue
        taken.add(key)
        modelo = None
        out.append({'pieces': sorted(pieces, key=lambda x: (x['row'], x['col'])), 'score': s})
    return out, tries


def main():
    args = [a for a in sys.argv[1:]]
    dry = '--dry-run' in args
    args = [a for a in args if a != '--dry-run']
    solo = out = None
    if '--solo' in args:
        i = args.index('--solo'); solo = args[i + 1]; del args[i:i + 2]
    if '--out' in args:
        i = args.index('--out'); out = args[i + 1]; del args[i:i + 2]
    merge = None
    if '--merge' in args:
        i = args.index('--merge'); merge = args[i + 1:]; args = args[:i]
    target = int(args[0]) if args else 200
    rng = random.Random(20260911 + (CATS.index(solo) if solo else 0))

    exercises = json.loads(EX_PATH.read_text(encoding='utf-8'))
    puzzles = json.loads(PZ_PATH.read_text(encoding='utf-8'))

    generated = {}
    if merge:
        for path in merge:
            d = json.loads(Path(path).read_text(encoding='utf-8'))
            generated[d['cat']] = d['new']
    else:
        taken = set()
        for cat in CATS:
            for p in puzzles[cat]:
                taken.add(canon_sym(p['pieces']))
        for cat in ([solo] if solo else CATS):
            have = len(puzzles[cat])
            needed = max(0, target - have)
            if needed == 0:
                print(f"{LABEL[cat]}: ya tiene {have} ejercicios, no hace falta generar.")
                continue
            new, tries = generate(cat, puzzles[cat], needed, taken, rng)
            counts, types, lo, hi, azar_lo, azar_hi = category_profile(puzzles[cat])
            print(f"{LABEL[cat]}: {have} existentes, generados {len(new)} de {needed} "
                  f"(intentos {tries}; puntaje {lo:.1f}–{hi:.1f}; acierto al azar {azar_lo:.3f}–{azar_hi:.3f})")
            if len(new) < needed:
                print(f"  ATENCIÓN: no se alcanzó el objetivo en {LABEL[cat]}.")
            generated[cat] = new
        if out:
            Path(out).write_text(json.dumps({'cat': solo, 'new': generated.get(solo, [])}, ensure_ascii=False), encoding='utf-8')
            print(f"guardado {out}")
            return

    if dry:
        print("(dry-run: no se escribió nada)")
        return

    # al mezclar, volver a comprobar unicidad entre categorías
    taken = set()
    for cat in CATS:
        for p in puzzles[cat]:
            taken.add(canon_sym(p['pieces']))
    total_new = 0
    for cat in CATS:
        new = generated.get(cat, [])
        existing_gen = sum(1 for p in puzzles[cat] if '-n' in p['id'])
        next_number = max((p['number'] for p in puzzles[cat]), default=0)
        i = existing_gen
        for item in new:
            key = canon_sym(item['pieces'])
            if key in taken:
                continue
            taken.add(key)
            i += 1
            next_number += 1
            pid = f"{cat}-n{i:03d}"
            puzzles[cat].append({'id': pid, 'number': next_number, 'pieces': item['pieces']})
            exercises.append({'id': pid, 'category': cat.upper(), 'categoryLabel': LABEL[cat],
                              'number': next_number, 'image': ''})
            total_new += 1
    if total_new == 0:
        print("Nada que escribir.")
        return
    EX_PATH.write_text(json.dumps(exercises, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    PZ_PATH.write_text(json.dumps(puzzles, ensure_ascii=False), encoding='utf-8')
    print(f"Listo: {total_new} ejercicios nuevos escritos en exercises.json y puzzles.json. "
          f"Correr ahora reorder_por_dificultad.py.")


if __name__ == '__main__':
    main()
