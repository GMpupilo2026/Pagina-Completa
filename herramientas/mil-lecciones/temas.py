import re, unicodedata
def _n(t):
    t = unicodedata.normalize('NFD', t.lower())
    return ''.join(c for c in t if unicodedata.category(c) != 'Mn')

# (clave, título, descripción, reglas) — se evalúan en orden y gana la primera.
BLOQUES = [
 ('finales', 'Los finales', 'Finales de torres, de alfiles, de alfil contra caballo y de piezas contra piezas: lo que hay que saber cuando quedan pocas piezas.',
   [r'^finales', r'^los finales', r'en el final', r'en los finales', r'torre contra pieza menor', r'peones aislados en los finales']),
 ('desequilibrios', 'Desequilibrios de material', 'Torre contra dos piezas menores, dama contra torre y pieza, torre contra alfil y caballo: cómo se juegan las posiciones con material distinto.',
   [r'torre contra', r'dama contra', r'compensacion posicional']),
 ('sacrificios', 'Los sacrificios posicionales', 'Entregar calidad, un peón o una pieza a cambio de algo que no se cuenta en el material: iniciativa, un punto fuerte, peones pasados, el desarrollo.',
   [r'sacrificio posicional', r'sacrificio de calidad', r'sacrificio de peon', r'sacrificio de desarrollo', r'sacrificio de pieza para mantener', r'sacrificio posicional de la dama', r'calidad para crear']),
 ('apertura', 'De la apertura al medio juego', 'Desarrollo, iniciativa, la decisión de enrocar y cómo elegir el plan cuando termina la apertura.',
   [r'desarrollo', r'iniciativa', r'decision de enrocar', r'eleccion del plan', r'preparacion de las aperturas', r'impedir el enroque', r'^test']),
 ('rey-centro', 'El ataque al rey en el centro', 'Cuando el rey no ha enrocado: abrir el centro, la columna e, la extracción del rey y los sacrificios que lo mantienen ahí.',
   [r'sin enrocar', r'rey en el centro', r'al rey en el centro', r'extraccion del rey', r'rey no enrocado', r'sacrificio de caballo en d5', r'pieza en .?e6', r'pieza menor en la casilla e6']),
 ('opuestos', 'Enroques en flancos opuestos', 'La carrera de ataques: rupturas de peones, columnas que se abren y quién llega primero.',
   [r'flancos opuestos', r'enroques opuestos', r'distinto flanco']),
 ('ataque-enroque', 'El ataque al enroque', 'Los sacrificios clásicos en h7, h6, g6 y f7, la torre por la tercera fila, las columnas y diagonales contra el rey enrocado.',
   [r'enroque', r'ataque al rey', r'tecnica del ataque', r'ataque por diagonales', r'tercera fila', r'sacrificio de caballo en f5', r'sacrificio de pieza en h6', r'sacrificio de alfil en h7', r'alfil en h7', r'superioridad de fuerzas', r'concentracion de piezas', r'lineas de invasion', r'cuna de un peon', r'gran diagonal']),
 ('peones', 'Las debilidades de peones', 'El peón aislado, los colgantes, los doblados, el retrasado y las islas: cómo se juega con ellos y contra ellos.',
   [r'aislad', r'colgantes', r'doblados', r'retrasado', r'islas de peones', r'peon debil', r'estructura de peones debilitada']),
 ('estructuras', 'Estructuras centrales y cadenas de peones', 'El centro fijo, el pequeño centro, la cadena de peones, el erizo y la Maroczy, y las rupturas que les dan vida.',
   [r'centro', r'cadena de peones', r'estructura', r'erizo', r'maroczy', r'bloquead', r'ruptura', r'ataque indio de rey', r'juego con los peones', r'colocacion de los peones']),
 ('pasados', 'Peones pasados y mayorías', 'Crear, empujar y bloquear un peón pasado; las mayorías de peones y el ataque de las minorías.',
   [r'peon pasado', r'peones pasados', r'mayori', r'minorias', r'bloqueo']),
 ('piezas', 'Las piezas y su valor', 'El alfil malo, la pareja de alfiles, alfil contra caballo, los alfiles de diferente color y las piezas mal colocadas.',
   [r'alfil', r'caballo', r'piezas menores', r'mal colocad', r'dama alejada', r'valor dinamico', r'cooperacion', r'coordinacion', r'actividad de las piezas', r'rey activo', r'piezas mayores', r'mejorar la colocacion', r'torre sin columnas', r'torre por las filas']),
 ('posicional', 'El juego posicional', 'Columnas abiertas, la séptima fila, casillas débiles y fuertes, el espacio, la profilaxis, los cambios y la simplificación.',
   [r'.']),
]

def bloque_de(titulo):
    t = _n(titulo)
    for clave, _, _, reglas in BLOQUES:
        if any(re.search(r, t) for r in reglas):
            return clave
    return 'posicional'
