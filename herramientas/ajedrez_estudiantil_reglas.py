"""Las reglas con que se clasifica un torneo de chess-results para
ajedrez-estudiantil.html: si entra, en qué etapa, de qué categoría y región.

Una sola copia: las usa herramientas/ajedrez-estudiantil-actualizar.py (que
suma los torneos nuevos) y las prueba verificar-ajedrez-estudiantil-reglas.py
contra todos los torneos ya clasificados. El porqué de cada regla, en
docs/decisiones/juegos-y-torneos.md («Ajedrez estudiantil en Costa Rica: los
torneos de chess-results»).
"""
import html
import re
import unicodedata


def sin_tildes(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()


# Lo que NO es de los juegos estudiantiles aunque el nombre se parezca: los
# Juegos Deportivos Nacionales del ICODER, los comunales y los privados de colegios.
EXCLUIR = (r"\bjdn\b|juegos (deportivos )?nacionales|comunal|distrital|paranacional|laboral|seguridad social|"
           r"chess ?talent|saint jude|st\. jude|provincial|no videntes|discapacid|grados|impares|"
           r"centroamericano de ajedrez|centroamericano y del caribe sub|crchesstour|festival deportivo colegio|"
           r"monterrey|humboldt|lincoln|castillo|talamanca|paraiso|belen|iribo|juegos regionales (limon|guarco)|tercera division|"
           # Los amistosos, fogueos y recreativos no son eliminatoria; el cuadrangular final repite a
           # los jugadores de sus grupos; el de profesores no es de estudiantes.
           r"amistoso|fogueo|recreativo|cuadrangular|profesores|curso de entrenadores")
INTERNACIONAL = r"codicader|estudiantiles? (femeninos |masculinos )?cen|centroamericanos? estudiantil|estudiantiles centroamericanos"
FEDERATIVO_INTERNACIONAL = r"panamericano escolar|festival centroamericano y del caribe escolar"
OTRO_ESTUDIANTIL = r"campeonato estudiantil|rapid estudiantil|campeonato nacional estudiantil"
JDE = (r"\bjde|j\.d\.e|juegos deportivos estudianti|juegos estudianti|estudianti|final nacional (escolar|colegial)|"
       r"final nacional de ajedrez escolar|etapa regional (escolar|colegial)|regional coto|fase regional|"
       r"eliminatoria interregional|elimintaria interregional|eliminatoria de ajedrez ,regional|interregional|"
       r"eliminatoria estudiantil institucional|eliminatoria +institucional|liceo .*eliminatoria cat|"
       r"circuito \d+ cartago|intercircuital|inter-regional|eliminatoria regional|"
       # «Regional Alajuela A Abierto», «➡️ Regional Turrialba - …»: la etapa
       # regional sin «JDE» en el nombre, a veces sin organizador.
       r"^\W*regional\b")
# Un organizador del MEP (una dirección regional, un circuito) con un nombre de
# categoría o de etapa también es de los JDE, aunque el nombre no lo diga.
ORGANIZADOR_MEP = r"\bmep\b|ministerio de educ|direccion regional|regional|dre\b|supervision|circuito|edufi|educacion fisica"
NOMBRE_DE_CATEGORIA = r"categor|regional|cat\.? ?[a-e]\b|torneo [a-e]\b|^[a-e] |primaria|secundaria|escolar|colegial"
# chess-results acepta la federación que le ponga quien sube el torneo: el
# «Campeonato Nacional Estudiantil 2008» dice Costa Rica y se jugó en Ecuador.
OTRO_PAIS = (r"federacion (deportiva |central )?(nacional )?(de ajedrez )?(del |de )?"
             r"(ecuador|guatemala|honduras|nicaragua|panama|el salvador|mexico|colombia|venezuela|peru)")

ETAPAS_JDE = ("Institucional o circuital", "Regional", "Interregional", "Nacional")

REGIONES = [  # (nombre, patrón sobre nombre + organizador + lugar sin tildes); la primera que calza
    ("Alajuela", r"alajuela"), ("Occidente", r"occidente|san ramon|araja|cbsr"), ("Cartago", r"cartago"),
    ("Turrialba", r"turrialba"), ("Los Santos", r"los santos"), ("Heredia", r"heredia"), ("Sarapiquí", r"sarapiqui"),
    # Desamparados va antes que San José: «Regional Desamparados C» lo subió la
    # regional de San José Central y es de Desamparados.
    ("Desamparados", r"desamparados"), ("San José Norte", r"(sj|san jose) norte"), ("San José Central", r"(sj|san jose) central"),
    ("San José Oeste", r"(sj|san jose) oeste"), ("Puriscal", r"puriscal"),
    ("Pérez Zeledón", r"perez zeledon|\bpz\b"), ("Grande de Térraba", r"terraba|\bsula\b"),
    ("Coto", r"coto|golfito|san vito"), ("Aguirre", r"aguirre|quepos"), ("Peninsular", r"peninsular|lepanto"),
    ("Esparza", r"esparza"), ("Cañas", r"canas"), ("Liberia", r"liberia"), ("Nicoya", r"nicoya"),
    ("Santa Cruz", r"santa cruz"), ("San Carlos", r"san carlos"), ("Guápiles", r"guapiles|pococi"),
    ("Limón", r"limon"), ("Puntarenas", r"puntarenas"), ("Bagaces", r"bagaces"),
]

# La letra de la categoría: la primera forma que calce. La letra va siempre en
# mayúscula y suelta (no pegada a otra letra), así «DRE» no es la categoría D.
CATEGORIA = [
    r"(?i:categor[ií]a|cat\.?)\s*[\"“]?\s*([A-E])(?![A-Za-z])",
    r"\b20\d\d ([A-E])[IE][OF]\b",                     # «2025 AIO»: A, individual, abierto
    r"[\"“]([A-E])\b", r"\b([A-E])[\"”]",
    r"(?i:jde|estudiantiles|estudiantil)\s*[-_ ]?\s*([A-E])(?![A-Za-z])",
    r"(?i:individual|indv|indiv|ind|equipos?|eq|absolut[oa]|abiert[oa]|femenin[oa]|masculin[oa]|fem|abs|mixto)\s*[_ ]?\s*([A-E])(?![A-Za-z])",
    r"_([A-E])(?![A-Za-z])",
    r"\b([A-E])\s*[_ ]?\s*(?i:abierto|abierta|absoluto|absoluta|abs|femenino|femenina|fem|masculino|individual|indvidual|equipos?|por equipos)\b",
    r"(?i:etapa (?:nacional|final|regional)|interregional|regional|nacional|final|colegial|escolar|juegos estudiantiles|torneo|desempate|heredia|zeledon|turrialba|alajuela|cartago|sula|aguirre|santos|occidente)\s*[-,|:]?\s*([A-E])(?![A-Za-z])",
    r"[-,|]\s*([A-E])(?![A-Za-z])",
    r"(?i:absolut[oa]|abiert[oa]|femenin[oa]|masculin[oa])\s+([a-e])$",   # «… Absoluto e» al final
    r"\s-\s[IE][FM]([A-E])\b",                     # 2011: «IFD» = individual, femenino, D
    r"[a-z]([A-E])\s+(?i:abiert|femenin|individual|equipo)",   # «Regional San José CentralA Abierto»
]


def etapa_jde(t):
    if re.search(r"institucional|^liceo .*eliminatoria|circuito \d|intercircuital|circuital", t):
        return "Institucional o circuital"
    if re.search(r"final nacional|etapa nacional|etapa final|^final |final jde|final juegos|final colegial|"
                 r"final nacional estudiantiles|final nacional de ajedrez|campeonato nacional estudiantil", t):
        return "Nacional"
    if re.search(r"inter ?-?regional|interegional|interrregional|elimitatoria inter", t):
        return "Interregional"
    return "Regional"


def categoria(nombre):
    n = "".join(c for c in unicodedata.normalize("NFD", html.unescape(nombre)) if unicodedata.category(c) != "Mn")
    for p in CATEGORIA:
        m = re.search(p, n)
        if m:
            return m.group(1).upper()
    return ""


def region(nombre, organizador, lugar):
    t = sin_tildes(" ".join([nombre, organizador, lugar]))
    for nombre_region, patron in REGIONES:
        if re.search(patron, t):
            return nombre_region
    return ""


def anio(nombre, inicio):
    """El año del torneo: el de la fecha, salvo que no tenga sentido (hay torneos de 2013 fechados en 1913)."""
    y = int(inicio[:4]) if inicio[:4].isdigit() else None
    if y and 2005 <= y <= 2030:
        return y
    m = re.search(r"\b(20[0-3]\d)\b", nombre)
    return int(m.group(1)) if m else y


def etapa(nombre, organizador="", lugar=""):
    """La etapa del torneo, o None si no es de los juegos estudiantiles."""
    t = sin_tildes(html.unescape(nombre))
    o = sin_tildes(html.unescape(organizador))
    if re.search(OTRO_PAIS, o) or re.search(OTRO_PAIS, sin_tildes(lugar)):
        return None
    if re.search(r"\bjdn\b", t) and re.search(r"\bdre\b", o):
        return "Regional"   # la DRE de Coto llama «JDN» a su eliminatoria de los JDE
    if re.search(EXCLUIR, t) and not re.search(r"\bjde\b|estudiantil", t):
        return None
    if re.search(INTERNACIONAL, t):
        return "Internacional (CODICADER)"
    if re.search(FEDERATIVO_INTERNACIONAL, t):
        return "Internacional federativo"
    if re.search(OTRO_ESTUDIANTIL, t):
        return "Otro estudiantil"
    if re.search(JDE, t) or (re.search(ORGANIZADOR_MEP, o) and re.search(NOMBRE_DE_CATEGORIA, t)):
        return etapa_jde(t)
    if re.search(r"final nacional colegial", t):
        return "Nacional"
    return None


def clasificar(nombre, organizador, lugar, inicio):
    """Lo que la página necesita de un torneo, o None si no entra."""
    e = etapa(nombre, organizador, lugar)
    if e is None:
        return None
    t = sin_tildes(html.unescape(nombre))
    jde = e in ETAPAS_JDE
    return {
        "anio": anio(nombre, inicio),
        "etapa": e,
        "categoria": (categoria(nombre) or "Sin dato") if jde else "",
        "region": region(nombre, organizador, lugar) if jde and e != "Nacional" else "",
        "modalidad": "Equipos" if re.search(r"equipo|por eq|team|\beq\b", t) else "Individual",
        "ritmo": "Blitz o rápido" if re.search(r"blitz|rapid|rapido", t) else "Clásico",
    }
