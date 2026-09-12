#!/usr/bin/env python3
"""
Genera los dos niveles por encima de Especialista:

  maestro      (Maestro):      9 piezas, acierto al azar <= 2 %
  granmaestro  (Gran Maestro): 10 piezas, acierto al azar <= 1,5 %

Con más piezas, una posición al azar suele tener MÁS caminos ganadores (hay
más capturas posibles), así que "más piezas" por sí solo no la hace más
difícil. Por eso acá se exige, además del tamaño, que la posición sea
apretada: pocas secuencias ganadoras entre todas las posibles. Así los
niveles nuevos quedan claramente por encima de Especialista tanto en el
puntaje del sitio como para una persona.

Mismas garantías que generar_ejercicios.py: resolubles, construidos hacia
atrás, sin repetidos (ni girados ni en espejo) contra todo lo existente.

Uso:
    python3 generar_niveles_superiores.py maestro --out m.json
    python3 generar_niveles_superiores.py granmaestro --out gm.json
    python3 generar_niveles_superiores.py --merge m.json gm.json
"""
import json, random, sys
from collections import Counter
from pathlib import Path
from generar_ejercicios import canon_sym, random_position
from reorder_por_dificultad import solve_stats, score, random_success

DATA_DIR = Path(__file__).resolve().parent
EX_PATH = DATA_DIR / 'exercises.json'
PZ_PATH = DATA_DIR / 'puzzles.json'
ALL_CATS = ['facil', 'intermedio', 'avanzado', 'especialista', 'maestro', 'granmaestro']
LABEL = {'maestro': 'Maestro', 'granmaestro': 'Gran Maestro'}
SPEC = {'maestro': (9, 0.02), 'granmaestro': (10, 0.015)}
COUNT = 100


def generate(cat, puzzles, taken, rng, count=COUNT, max_tries=200000):
    n, max_azar = SPEC[cat]
    # tipos de pieza: mismo reparto que Especialista
    types = Counter(x['type'] for p in puzzles['especialista'] for x in p['pieces'])
    out, tries = [], 0
    while len(out) < count and tries < max_tries:
        tries += 1
        pieces = random_position(n, types, rng)
        if pieces is None:
            continue
        tc = Counter(x['type'] for x in pieces)
        if tc['K'] > 1 or tc['Q'] > 2:
            continue
        key = canon_sym(pieces)
        if key in taken:
            continue
        pa = random_success(pieces)
        if pa > max_azar or pa <= 0:
            continue
        s = score(pieces)
        taken.add(key)
        out.append({'pieces': sorted(pieces, key=lambda x: (x['row'], x['col'])), 'score': s, 'azar': pa})
        print(f"  {cat}: {len(out)}/{count} (intentos {tries}, azar {pa:.4f}, puntaje {s:.1f})", flush=True)
    return out, tries


def main():
    args = sys.argv[1:]
    exercises = json.loads(EX_PATH.read_text(encoding='utf-8'))
    puzzles = json.loads(PZ_PATH.read_text(encoding='utf-8'))
    taken = set()
    for cat in puzzles:
        for p in puzzles[cat]:
            taken.add(canon_sym(p['pieces']))

    if args and args[0] == '--merge':
        for cat in ('maestro', 'granmaestro'):
            puzzles.setdefault(cat, [])
        for path in args[1:]:
            d = json.loads(Path(path).read_text(encoding='utf-8'))
            cat = d['cat']
            existing = len(puzzles[cat])
            for item in d['new']:
                key = canon_sym(item['pieces'])
                if key in taken:
                    continue
                taken.add(key)
                existing += 1
                pid = f"{cat}-n{existing:03d}"
                puzzles[cat].append({'id': pid, 'number': existing, 'pieces': item['pieces']})
                exercises.append({'id': pid, 'category': cat.upper(), 'categoryLabel': LABEL[cat],
                                  'number': existing, 'image': ''})
            print(f"{LABEL[cat]}: {existing} ejercicios")
        EX_PATH.write_text(json.dumps(exercises, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
        PZ_PATH.write_text(json.dumps(puzzles, ensure_ascii=False), encoding='utf-8')
        print("Listo. Correr ahora reorder_por_dificultad.py maestro granmaestro.")
        return

    cat = args[0]
    out = args[args.index('--out') + 1] if '--out' in args else f'{cat}.json'
    seed = int(args[args.index('--seed') + 1]) if '--seed' in args else 0
    count = int(args[args.index('--count') + 1]) if '--count' in args else COUNT
    rng = random.Random(2026 + ALL_CATS.index(cat) + 1000 * seed)
    new, tries = generate(cat, puzzles, taken, rng, count=count)
    Path(out).write_text(json.dumps({'cat': cat, 'new': new}, ensure_ascii=False), encoding='utf-8')
    print(f"{LABEL[cat]}: generados {len(new)} (intentos {tries}) -> {out}")


if __name__ == '__main__':
    main()
