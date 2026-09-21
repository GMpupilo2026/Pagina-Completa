#!/usr/bin/env python3
"""Mete los 148 ejercicios de tactica.json DENTRO de temas.json, como un grupo más.

Por qué: "Táctica" era una página aparte (entreno/tactica.html) con su propio
tablero, su propia racha y su propio progreso, resolviendo exactamente lo mismo
que "Ejercicios por tema" — dos sitios para lo mismo, cada uno contando por su
lado. Ahora sus cinco categorías son un grupo más del selector de temas, así que
el alumno resuelve táctica donde resuelve todo lo demás y el progreso es uno
solo.

Es un paso aparte de construir_temas.py porque estos ejercicios NO salen de
Lichess: son de la casa, ya están escritos y verificados en tactica.json, y no
hay nada que descargar. construir_temas.py lo llama al final, así que rehacer
temas.json no se los come — que es justamente lo que pasaría si esto se hubiera
hecho editando el archivo generado a mano.

SE PUEDE CORRER TODAS LAS VECES QUE SE QUIERA: si el grupo ya está, lo
reemplaza en vez de duplicarlo.

Uso:
    python3 entreno/data/sumar_tactica.py [temas.json]
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
GRUPO = 'tactica'

# El nombre y la descripción de cada categoría. La descripción es la que el
# alumno lee antes de entrar, así que dice QUÉ se entrena, no cuántos hay.
CATEGORIAS = [
    ('ultima-linea', 'Ataque a la última línea',
     'El rey enrocado se ahoga detrás de sus propios peones. Aprende a abrir la última fila y a rematar con torre o dama.'),
    ('enroque-corto', 'Ataque al enroque corto',
     'Sacrificios y maniobras contra el rey que enrocó corto: la casilla h7, el alfil que se entrega y la dama que llega.'),
    ('enroque-largo', 'Ataque al enroque largo',
     'El rey que enrocó largo queda más expuesto por el flanco de dama. Cómo abrir columnas y llegar primero.'),
    ('columnas-diagonales', 'Ataque por columnas y diagonales',
     'Torres que dominan una columna abierta y alfiles que cruzan el tablero: la pieza que llega lejos decide la partida.'),
    ('ataque-doble', 'Ataque doble',
     'Una jugada, dos amenazas. Horquillas de caballo, jaques dobles y la pieza que ataca dos cosas a la vez.'),
]


def sumar(temas: dict, tactica: list) -> dict:
    """Devuelve temas con el grupo de táctica puesto (o repuesto)."""
    por_categoria = {clave: [] for clave, _, _ in CATEGORIAS}
    for p in tactica:
        if p['category'] in por_categoria:
            por_categoria[p['category']].append(p)

    sueltas = {p['category'] for p in tactica} - set(por_categoria)
    if sueltas:
        # No se traga en silencio una categoría que nadie declaró: se vería como
        # un grupo con menos ejercicios de los que hay y no daría ningún error.
        raise SystemExit('tactica.json trae categorías que no están en CATEGORIAS: ' + ', '.join(sorted(sueltas)))

    # Los ejercicios. Cuidado con el `rating`: estos no lo tienen (no vienen de
    # Lichess) y la página tiene que aguantar que falte, no inventar un número.
    for p in tactica:
        temas['puzzles'][p['id']] = {
            'fen': p['fen'],
            'solution': p['solution'],
            'themes': [p['category']],
            'mate': bool(p.get('mate')),
        }
    for clave, _, _ in CATEGORIAS:
        temas['themes'][clave] = [p['id'] for p in por_categoria[clave]]

    grupo = {
        'id': GRUPO,
        'title': 'Táctica de ataque',
        'themes': [{'key': clave, 'name': nombre, 'desc': desc}
                   for clave, nombre, desc in CATEGORIAS if por_categoria[clave]],
    }
    temas['groups'] = [g for g in temas['groups'] if g.get('id') != GRUPO]
    # Va de primero: son ejercicios escritos para estos alumnos, no una muestra
    # de una base de 6 millones.
    temas['groups'].insert(0, grupo)
    return temas


def main():
    destino = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / 'temas.json'
    temas = json.loads(destino.read_text(encoding='utf-8'))
    tactica = json.loads((HERE / 'tactica.json').read_text(encoding='utf-8'))
    temas = sumar(temas, tactica)
    txt = json.dumps(temas, ensure_ascii=False, separators=(',', ':'))
    destino.write_text(txt, encoding='utf-8')
    total = sum(len(temas['themes'][c]) for c, _, _ in CATEGORIAS)
    print(f'{destino.name}: grupo "Táctica de ataque" con {total} ejercicios en {len(CATEGORIAS)} categorías')
    print(f'  ejercicios únicos en total: {len(temas["puzzles"])}  ·  {len(txt.encode())//1024} KB')


if __name__ == '__main__':
    main()
