#!/usr/bin/env python3
"""
Reordena los ejercicios de 4x4 (entreno/4x4.html) por dificultad real,
en vez de por el orden manual con el que se cargaron.

Cómo se mide la "dificultad": se simula el motor real de Solo Chess
(toda jugada es una captura; se gana al dejar 1 sola pieza en el
tablero) sobre cada ejercicio, y se combina:
  - cantidad de piezas en el tablero,
  - tamaño del árbol de posibles secuencias de captura,
  - máxima ramificación (opciones) en algún punto de la resolución,
  - proporción de "callejones sin salida" (secuencias que obligan a
    reiniciar porque no queda ninguna captura posible y sobra más de
    una pieza).

  - y, desde sep 2026, la probabilidad de acertar jugando al azar (una
    posición con miles de soluciones es fácil aunque su árbol sea enorme).

Los ejercicios de una categoría se reordenan de menor a mayor puntaje.
Solo se toca el campo "number" de exercises.json y puzzles.json — el
id, las piezas y la imagen de cada ejercicio no cambian, así que el
progreso ya guardado por los alumnos (localStorage, indexado por id,
no por number) se mantiene íntegro. El cálculo es determinista, así
que volver a correr este script sobre una categoría ya reordenada no
produce ningún cambio (es seguro ejecutarlo varias veces).

Se aplica a las cuatro categorías (todas tienen posición de piezas en
puzzles.json desde sep 2026).

Uso:
    python3 reorder_por_dificultad.py                       # revisa y reordena las que ya tengan datos completos
    python3 reorder_por_dificultad.py intermedio avanzado    # solo esas categorías
    python3 reorder_por_dificultad.py --check                # no escribe nada, solo informa qué categorías están listas
"""
import json
import math
import sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent
EX_PATH = DATA_DIR / 'exercises.json'
PZ_PATH = DATA_DIR / 'puzzles.json'

CATEGORY_LABEL = {
    'facil': ('FACIL', 'Fácil'),
    'intermedio': ('INTERMEDIO', 'Intermedio'),
    'avanzado': ('AVANZADO', 'Avanzado'),
    'especialista': ('ESPECIALISTA', 'Especialista'),
}

DIRS_ROOK = [(-1, 0), (1, 0), (0, -1), (0, 1)]
DIRS_BISHOP = [(-1, -1), (-1, 1), (1, -1), (1, 1)]
DIRS_QUEEN = DIRS_ROOK + DIRS_BISHOP
KNIGHT = [(-2, -1), (-2, 1), (-1, -2), (-1, 2), (1, -2), (1, 2), (2, -1), (2, 1)]


def slide_targets(r, c, dirs, board):
    out = []
    for dr, dc in dirs:
        nr, nc = r + dr, c + dc
        while 0 <= nr < 4 and 0 <= nc < 4:
            if (nr, nc) in board:
                out.append((nr, nc))
                break
            nr += dr
            nc += dc
    return out


def capture_targets(piece, r, c, board):
    if piece == 'N':
        return [(r + dr, c + dc) for dr, dc in KNIGHT
                if 0 <= r + dr < 4 and 0 <= c + dc < 4 and (r + dr, c + dc) in board]
    if piece == 'B':
        return slide_targets(r, c, DIRS_BISHOP, board)
    if piece == 'R':
        return slide_targets(r, c, DIRS_ROOK, board)
    if piece == 'Q':
        return slide_targets(r, c, DIRS_QUEEN, board)
    if piece == 'K':
        return [(r + dr, c + dc) for dr, dc in DIRS_QUEEN
                if 0 <= r + dr < 4 and 0 <= c + dc < 4 and (r + dr, c + dc) in board]
    if piece == 'P':
        return [(r + dr, c + dc) for dr, dc in DIRS_BISHOP
                if 0 <= r + dr < 4 and 0 <= c + dc < 4 and (r + dr, c + dc) in board]
    return []


def all_moves(board):
    moves = []
    for (r, c), p in board.items():
        for (tr, tc) in capture_targets(p, r, c, board):
            moves.append(((r, c), (tr, tc)))
    return moves


def solve_stats(pieces):
    """Recorre TODO el árbol de secuencias de captura posibles (no solo una
    solución) para poder medir qué tan fácil o difícil es en la práctica."""
    board = {}
    for p in pieces:
        board[(p['row'], p['col'])] = p['type']
    start = frozenset(board.items())
    dead_ends = 0
    total_states = 0
    solved_states = 0
    max_branch = 0
    stack = [start]
    visited = set()
    while stack:
        state = stack.pop()
        if state in visited:
            continue
        visited.add(state)
        total_states += 1
        board = dict(state)
        moves = all_moves(board)
        max_branch = max(max_branch, len(moves))
        if len(board) <= 1:
            solved_states += 1
            continue
        if not moves:
            dead_ends += 1
            continue
        for (fr, to) in moves:
            nb = dict(board)
            moved = nb.pop(fr)
            nb[to] = moved
            stack.append(frozenset(nb.items()))
    return len(pieces), total_states, dead_ends, max_branch, solved_states


def random_success(pieces):
    """Probabilidad de resolver el ejercicio eligiendo cada captura al azar
    (sin deshacer). Complementa a solve_stats: un árbol grande con muchas
    soluciones es fácil para una persona aunque tenga muchas ramas."""
    from functools import lru_cache
    start = frozenset(((p['row'], p['col']), p['type']) for p in pieces)

    @lru_cache(maxsize=None)
    def rec(state):
        board = dict(state)
        if len(board) <= 1:
            return 1.0
        moves = all_moves(board)
        if not moves:
            return 0.0
        total = 0.0
        for fr, to in moves:
            nb = dict(board)
            nb[to] = nb.pop(fr)
            total += rec(frozenset(nb.items()))
        return total / len(moves)
    return rec(start)


def score(pieces):
    """Dificultad = tamaño/ramificación del árbol (medida original) + qué tan
    improbable es acertar al azar (4 puntos por cada orden de magnitud)."""
    n, total_states, dead_ends, max_branch, _ = solve_stats(pieces)
    base = n + math.log2(total_states + 1) + 0.5 * max_branch + 3 * (dead_ends / total_states)
    p = max(random_success(pieces), 1e-6)
    return base + 4 * (-math.log10(p))


def category_ready(cat_key, exercises, puzzles):
    """Una categoría está lista para reordenar cuando puzzles.json trae una
    posición de piezas para cada uno de sus ejercicios (hoy solo pasa con
    'facil'; las demás siguen siendo solo imágenes)."""
    cat_upper, _ = CATEGORY_LABEL[cat_key]
    n_exercises = sum(1 for e in exercises if e['category'] == cat_upper)
    n_puzzles = len(puzzles.get(cat_key, []))
    return n_exercises > 0 and n_puzzles == n_exercises, n_exercises, n_puzzles


def reorder_category(cat_key, exercises, puzzles):
    cat_upper, _ = CATEGORY_LABEL[cat_key]
    cat_puzzles = puzzles[cat_key]

    unsolvable = []
    scored = []
    for p in cat_puzzles:
        n, total_states, dead_ends, max_branch, solved_states = solve_stats(p['pieces'])
        if solved_states == 0:
            unsolvable.append(p['id'])
        s = score(p['pieces'])
        scored.append((s, p['number'], p))

    if unsolvable:
        print(f"  ATENCIÓN: {len(unsolvable)} ejercicio(s) de {cat_key} no tienen ninguna "
              f"secuencia que los resuelva, revisar antes de reordenar: {unsolvable}")
        return False

    scored.sort(key=lambda t: (t[0], t[1]))

    old_to_new = {}
    new_cat_puzzles = []
    for new_number, (s, old_number, p) in enumerate(scored, start=1):
        old_to_new[p['id']] = new_number
        new_p = dict(p)
        new_p['number'] = new_number
        new_cat_puzzles.append(new_p)

    changed = any(p['number'] != old_to_new[p['id']] for p in cat_puzzles)

    puzzles[cat_key] = new_cat_puzzles

    for i, ex in enumerate(exercises):
        if ex['category'] == cat_upper and ex['id'] in old_to_new:
            exercises[i] = {**ex, 'number': old_to_new[ex['id']]}

    # Reordena también las entradas de exercises.json de esta categoría para
    # que el archivo quede legible en el nuevo orden (no afecta el
    # comportamiento: 4x4.html siempre reordena por "number" al leerlo).
    cat_sorted = sorted((e for e in exercises if e['category'] == cat_upper), key=lambda e: e['number'])
    it = iter(cat_sorted)
    for i, ex in enumerate(exercises):
        if ex['category'] == cat_upper:
            exercises[i] = next(it)

    n = len(new_cat_puzzles)
    assert sorted(p['number'] for p in new_cat_puzzles) == list(range(1, n + 1))
    assert len({p['id'] for p in new_cat_puzzles}) == n

    if changed:
        print(f"  {cat_key}: reordenados {n} ejercicios por dificultad "
              f"(más fácil = #1, más difícil = #{n}).")
    else:
        print(f"  {cat_key}: ya estaba en el orden correcto, sin cambios.")
    return changed


def main():
    args = sys.argv[1:]
    check_only = '--check' in args
    args = [a for a in args if a != '--check']
    wanted = args or ['facil', 'intermedio', 'avanzado', 'especialista']

    exercises = json.loads(EX_PATH.read_text(encoding='utf-8'))
    puzzles = json.loads(PZ_PATH.read_text(encoding='utf-8'))

    any_changed = False
    for cat_key in wanted:
        if cat_key not in CATEGORY_LABEL:
            print(f"Categoría desconocida: {cat_key}")
            continue
        ready, n_exercises, n_puzzles = category_ready(cat_key, exercises, puzzles)
        if not ready:
            print(f"{cat_key}: todavía no está digitalizada del todo "
                  f"({n_puzzles}/{n_exercises} ejercicios con posición de piezas) — se omite.")
            continue
        print(f"{cat_key}: {n_puzzles} ejercicios con datos completos, calculando dificultad...")
        if check_only:
            continue
        if reorder_category(cat_key, exercises, puzzles):
            any_changed = True

    if check_only:
        return

    if any_changed:
        EX_PATH.write_text(json.dumps(exercises, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
        PZ_PATH.write_text(json.dumps(puzzles, ensure_ascii=False), encoding='utf-8')
        print("Listo: exercises.json y puzzles.json actualizados.")
    else:
        print("Nada que escribir (ninguna categoría lista tenía cambios pendientes).")


if __name__ == '__main__':
    main()
