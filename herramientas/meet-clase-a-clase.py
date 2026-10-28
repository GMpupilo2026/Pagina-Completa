#!/usr/bin/env python3
"""Las grabaciones de Meet, clase a clase, hasta el informe del CCDR.

Corre en la computadora del entrenador, no en el sitio ni en una sesión de
Claude. El recorrido entero:

  1. Meet guarda la grabación en Drive (carpeta «Meet Recordings» de quien
     grabó). Eso lo hace Meet solo.
  2. Google Drive para computadora la baja a una carpeta de la computadora.
     Eso lo hace Drive solo (con la carpeta en «Duplicar archivos» queda
     siempre en el disco; en «Transmitir», se baja cuando este script la lee).
  3. Este script vigila esa carpeta y, por cada grabación nueva:
     - la transcribe AHÍ MISMO con Whisper (faster-whisper): el audio no se
       manda a ningún servicio;
     - deja la transcripción en <trabajo>/AAAA-MM/transcripciones/;
     - suma la sesión a <trabajo>/AAAA-MM/datos-AAAA-MM.json (el JSON de
       herramientas/informe-ccdr.js) y vuelve a armar el borrador del Word;
     - pone al día <trabajo>/AAAA-MM/clase-a-clase.md, el resumen del mes.

Así el informe se va llenando sesión a sesión y el último día del mes solo
falta lo que no sale de una grabación (asistencia, torneos, fotos, lesiones),
que se completa con la skill informe-ccdr.

Instalar una vez (Python 3.9 o más nuevo, y Node con `npm install` en el
repositorio para el Word):

    pip install faster-whisper "av<16"

(«av» es lo que lee el audio del .mp4; con la 19, faster-whisper 1.2 falla
con «unexpected keyword argument 'metadata_errors'».)

Usar:

    python herramientas/meet-clase-a-clase.py \\
        --grabaciones "G:/Mi unidad/Meet Recordings" \\
        --trabajo "G:/Mi unidad/Informe CCDR" --vigilar

  --grabaciones  la carpeta donde Drive deja las grabaciones de Meet.
  --trabajo      donde van las transcripciones y el informe en curso. Si está
                 dentro de Drive, Claude la lee al cerrar el mes.
  --vigilar      se queda corriendo y mira cada --cada minutos (5). Sin esto,
                 procesa lo que haya y termina (para el Programador de tareas).
  --modelo       el modelo de Whisper: tiny, base, small (por omisión),
                 medium. Más grande, más exacto y más lento.
  --copiar-a     además, copia cada grabación a esta carpeta (una copia fuera
                 de Drive, por si allá se borra).
  --estudiantes  estudiantes.csv (Estudiante;…) para la lista de atletas; por
                 omisión, <trabajo>/estudiantes.csv si existe.

Lo que este script escribe en datos-AAAA-MM.json es solo una fila nueva de
«sesiones» por grabación: nunca cambia una fila que ya estaba ni el resto del
archivo, así que lo que se corrija a mano ahí se queda. Lo que no sale de un
dato (la asistencia, los temas que se adivinan por las palabras) va como
{"pend": …}, en amarillo en el Word.

El porqué, en «Las grabaciones de Meet, clase a clase» (docs/decisiones/
informes.md). Los datos de cada mes NUNCA van al repositorio: son voces y
nombres de menores de edad.
"""
import argparse
import calendar
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import time

AQUI = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(AQUI)

# Costa Rica no cambia la hora en el año: un desfase fijo sirve y no depende
# de que la computadora tenga la base de zonas horarias (Windows no la trae).
HORA_CR = dt.timezone(dt.timedelta(hours=-6), "America/Costa_Rica")

EXTENSIONES = (".mp4", ".webm", ".mkv", ".m4a", ".mp3", ".wav", ".ogg")
# Una grabación que cambió hace menos de esto puede estar bajándose todavía.
QUIETA_SEGUNDOS = 120

MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]
DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]

ENTRENADOR = "Óscar Angulo Cubero"
ASISTENTE = "Sebastián Mora Chavarría"

# Los temas se adivinan por las palabras de la clase: por eso salen en
# amarillo, como sugerencia. Un tema cuenta si se nombra al menos 3 veces.
TEMAS = [
    ("Aperturas", r"apertura|siciliana|francesa|caro.?kann|gambito|italiana|española|defensa india|desarroll"),
    ("Finales", r"\bfinal(es)?\b|oposici[oó]n|regla del cuadrado|lucena|philidor|rey activo|coronar"),
    ("Táctica: clavada", r"clavad[ao]|clavar"),
    ("Táctica: tenedor", r"tenedor|ataque doble"),
    ("Táctica: descubierta", r"descubiert[ao]"),
    ("Táctica: rayos X y desviación", r"rayos? x|desviaci[oó]n|atracci[oó]n|interferencia|sobrecarga"),
    ("Mates", r"\bmate\b|mate en (uno|dos|tres|\d)|jaque mate"),
    ("Estrategia y planes", r"estrategia|\bplan\b|casilla d[eé]bil|peón aislado|peones doblados|columna abierta|puesto avanzado"),
    ("Cálculo", r"calcul|variante|candidat"),
    ("Partidas comentadas", r"partida (de|del|entre)|analiz|comentad"),
    ("Arbitraje y reglamento", r"reglamento|árbitro|arbitro|pieza tocada|reloj"),
]
MINIMO_MENCIONES = 3

# Lo que Google le pone al nombre: «Clase (2026-10-28 18:02 GMT-6)» o
# «Clase - 2026/10/28 18:02 CST - Recording», según el idioma y la época
# (en el disco, Drive cambia las «/» por «_»).
FECHA_EN_NOMBRE = re.compile(r"(\d{4})[-/._](\d{1,2})[-/._](\d{1,2})\D{1,6}?(\d{1,2})[:.h](\d{2})")


# ------------------------------------------------------------ transcribir

class MotorWhisper:
    """faster-whisper en la CPU de la computadora. El modelo se baja una vez
    (de Hugging Face) y después funciona sin internet; el audio no sale."""

    def __init__(self, modelo):
        try:
            from faster_whisper import WhisperModel
        except ImportError:
            sys.exit("Falta faster-whisper. Instálalo con:  pip install faster-whisper")
        self.modelo = WhisperModel(modelo, device="auto", compute_type="int8")

    def transcribir(self, ruta):
        # vad_filter: sin él, en un silencio largo Whisper repite la última
        # frase hasta llenar el trozo, y una clase tiene silencios de sobra.
        try:
            segs, info = self.modelo.transcribe(ruta, language="es", vad_filter=True,
                                                condition_on_previous_text=False)
        except TypeError as e:
            if "metadata_errors" in str(e):
                raise RuntimeError('la versión de «av» no le sirve a faster-whisper; corre  pip install "av<16"') from e
            raise
        return [(s.start, s.text.strip()) for s in segs if s.text.strip()], info.duration


class MotorFalso:
    """Para el verificador: el «audio» es un archivo de texto, una línea por
    trozo, 60 segundos cada una. Se elige con MEET_MOTOR=falso."""

    def transcribir(self, ruta):
        with open(ruta, encoding="utf-8") as f:
            lineas = [l.strip() for l in f if l.strip()]
        return [(60.0 * i, t) for i, t in enumerate(lineas)], 60.0 * len(lineas)


def motor(modelo):
    return MotorFalso() if os.environ.get("MEET_MOTOR") == "falso" else MotorWhisper(modelo)


# ------------------------------------------------------------ piezas

def leer_json(ruta, omision):
    if not os.path.exists(ruta):
        return omision
    with open(ruta, encoding="utf-8") as f:
        return json.load(f)


def escribir_json(ruta, datos):
    # Primero a un archivo de al lado y después se cambia de nombre: si la
    # computadora se apaga a la mitad, el JSON del mes no queda partido.
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ruta)


def inicio_de(nombre, ruta):
    """La hora de inicio y el título de la reunión, sacados del nombre del
    archivo; si el nombre no trae fecha, la de la última modificación."""
    base = os.path.splitext(nombre)[0]
    m = FECHA_EN_NOMBRE.search(base)
    if m:
        a, me, d, h, mi = (int(x) for x in m.groups())
        titulo = base[:m.start()].strip(" -–(_")
        return dt.datetime(a, me, d, h, mi, tzinfo=HORA_CR), titulo or "Sesión de Meet"
    cuando = dt.datetime.fromtimestamp(os.path.getmtime(ruta), HORA_CR)
    return cuando.replace(second=0, microsecond=0), re.sub(r"\s*-\s*(Recording|Grabación)$", "", base).strip() or "Sesión de Meet"


def hora(t):
    h12 = t.hour % 12 or 12
    return f"{h12}:{t.minute:02d} {'a. m.' if t.hour < 12 else 'p. m.'}"


def marca(seg):
    seg = int(seg)
    return f"{seg // 3600:02d}:{seg % 3600 // 60:02d}:{seg % 60:02d}"


def temas_de(texto):
    texto = texto.lower()
    cuenta = [(n, len(re.findall(rx, texto))) for n, rx in TEMAS]
    return [n for n, k in sorted(cuenta, key=lambda x: -x[1]) if k >= MINIMO_MENCIONES][:3]


def orden_de_fila(fila):
    """«Mar 28/10» y «6:02 p. m. – 7:05 p. m.» → (10, 28, 18, 2). Una fila
    escrita a mano con otra forma va al final, en vez de romper el orden."""
    f = re.search(r"(\d{1,2})/(\d{1,2})", str(fila[0]))
    h = re.match(r"(\d{1,2}):(\d{2}) ([ap])", str(fila[2]))
    if not f:
        return (99, 99, 99, 99)
    h24 = (int(h.group(1)) % 12 + (12 if h.group(3) == "p" else 0), int(h.group(2))) if h else (99, 99)
    return (int(f.group(2)), int(f.group(1))) + h24


def atletas_de(ruta):
    if not ruta or not os.path.exists(ruta):
        return []
    with open(ruta, encoding="utf-8-sig") as f:
        filas = [l.rstrip("\r\n").split(";") for l in f if l.strip()]
    if filas and filas[0][0].strip().lower() in ("estudiante", "nombre", "atleta"):
        filas = filas[1:]
    return [f[0].strip() for f in filas if f[0].strip()]


def esqueleto(anio, mes, atletas):
    ultimo = calendar.monthrange(anio, mes)[1]
    pend = lambda t: [{"pend": t}]
    return {
        "periodo": f"1 al {ultimo} de {MESES[mes - 1]} de {anio}", "anio": anio,
        "mes": MESES[mes - 1].capitalize(), "entrenador": ENTRENADOR, "asistente": ASISTENTE,
        "atletas": atletas,
        "lugar": {"bloques": [{"vi": [{"b": "Sesiones virtuales: "}, "Google Meet, grabadas y transcritas clase a clase."]}],
                  "sesiones": [],
                  "nota": "La columna «Sesión» trae el nombre de la reunión; los temas en amarillo se sugieren por las palabras de la transcripción automática."},
        "macrociclo": [{"p": pend("[Se completa al cierre del mes; ver clase-a-clase.md]")}],
        "pruebas": {"bloques": [{"p": pend("[completar]")}], "resultados": []},
        "lesiones": [{"p": pend("No se reportaron lesiones ni problemas médicos durante el período.")}],
        "forma": [{"p": pend("[completar]")}],
        "requerimientos": [{"p": pend("[completar]")}],
        "otros": [{"p": pend("[completar]")}],
    }


# ------------------------------------------------------------ una grabación

def procesar(ruta, nombre, trabajo, args, maquina):
    inicio, titulo = inicio_de(nombre, ruta)
    clave_mes = f"{inicio.year}-{inicio.month:02d}"
    carpeta = os.path.join(trabajo, clave_mes)
    os.makedirs(os.path.join(carpeta, "transcripciones"), exist_ok=True)

    if args.copiar_a:
        destino = os.path.join(args.copiar_a, clave_mes)
        os.makedirs(destino, exist_ok=True)
        shutil.copy2(ruta, os.path.join(destino, nombre))

    print(f"  Transcribiendo «{nombre}»…", flush=True)
    segmentos, duracion = maquina.transcribir(ruta)
    texto = " ".join(t for _, t in segmentos)
    fin = inicio + dt.timedelta(seconds=round(duracion))
    temas = temas_de(texto)

    archivo_txt = f"{inicio:%Y-%m-%d %H.%M} {re.sub(r'[\\/:*?\"<>|]', '_', titulo)}.txt"
    with open(os.path.join(carpeta, "transcripciones", archivo_txt), "w", encoding="utf-8") as f:
        f.write(f"{titulo}\n{DIAS[inicio.weekday()]} {inicio:%d/%m/%Y}, {hora(inicio)} – {hora(fin)}"
                f" ({round(duracion / 60)} min)\nGrabación: {nombre}\n\n"
                "Transcripción automática hecha en esta computadora (Whisper): puede traer\n"
                "errores en nombres y en términos de ajedrez.\n\n")
        for s, t in segmentos:
            f.write(f"[{marca(s)}] {t}\n")

    clase = {"grabacion": nombre, "inicio": inicio.isoformat(), "minutos": round(duracion / 60),
             "titulo": titulo, "temas": temas, "transcripcion": f"transcripciones/{archivo_txt}",
             "palabras": len(texto.split())}
    ruta_clases = os.path.join(carpeta, "clases.json")
    clases = [c for c in leer_json(ruta_clases, []) if c["grabacion"] != nombre] + [clase]
    clases.sort(key=lambda c: c["inicio"])
    escribir_json(ruta_clases, clases)

    ruta_datos = os.path.join(carpeta, f"datos-{clave_mes}.json")
    datos = leer_json(ruta_datos, None) or esqueleto(inicio.year, inicio.month, atletas_de(args.estudiantes))
    fila = [f"{DIAS[inicio.weekday()]} {inicio:%d/%m}", "Virtual (Google Meet)",
            f"{hora(inicio)} – {hora(fin)}",
            [titulo] + ([{"pend": " — temas: " + ", ".join(temas)}] if temas else []),
            {"pend": "[completar]"}]
    sesiones = datos.setdefault("lugar", {}).setdefault("sesiones", [])
    # La fila se identifica por fecha y horario: si ya estaba (el script se
    # cortó después de escribirla), no se repite ni se pisa lo corregido.
    if not any(s[0] == fila[0] and s[2] == fila[2] for s in sesiones):
        sesiones.append(fila)
        sesiones.sort(key=orden_de_fila)
    escribir_json(ruta_datos, datos)

    escribir_resumen(carpeta, clave_mes, clases)
    armar_word(carpeta, clave_mes)
    print(f"  Listo: {clase['minutos']} min" + (f", temas: {', '.join(temas)}" if temas else ""), flush=True)


def escribir_resumen(carpeta, clave_mes, clases):
    anio, mes = (int(x) for x in clave_mes.split("-"))
    minutos = sum(c["minutos"] for c in clases)
    cuenta = {}
    for c in clases:
        for t in c["temas"]:
            cuenta[t] = cuenta.get(t, 0) + 1
    l = [f"# Clase a clase: {MESES[mes - 1]} de {anio}", "",
         f"{len(clases)} sesiones grabadas en Meet, {minutos // 60} h {minutos % 60:02d} min en total.", ""]
    if cuenta:
        l += ["Temas que más se nombraron (sugerencia, por las palabras):", ""]
        l += [f"- {t}: {k} {'sesión' if k == 1 else 'sesiones'}" for t, k in sorted(cuenta.items(), key=lambda x: -x[1])]
        l.append("")
    for c in clases:
        i = dt.datetime.fromisoformat(c["inicio"])
        l += [f"## {DIAS[i.weekday()]} {i:%d/%m}, {hora(i)}: {c['titulo']}", "",
              f"- Duración: {c['minutos']} min ({c['palabras']} palabras transcritas)",
              f"- Temas sugeridos: {', '.join(c['temas']) or 'ninguno claro'}",
              f"- Transcripción: [{c['transcripcion']}](<{c['transcripcion']}>)", ""]
    with open(os.path.join(carpeta, "clase-a-clase.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(l))


def armar_word(carpeta, clave_mes):
    anio, mes = (int(x) for x in clave_mes.split("-"))
    salida = os.path.join(carpeta, f"Informe-en-curso-CCDR-{MESES[mes - 1]}-{anio}.docx")
    try:
        r = subprocess.run(["node", os.path.join(AQUI, "informe-ccdr.js"),
                            os.path.join(carpeta, f"datos-{clave_mes}.json"), salida],
                           cwd=REPO, capture_output=True, text=True)
    except FileNotFoundError:
        print("  (Sin Node: el Word no se armó, pero el JSON del mes sí quedó al día.)")
        return
    if r.returncode != 0:
        print("  (El Word no se armó: " + (r.stderr.strip().splitlines() or ["?"])[-1] +
              ". ¿Falta `npm install` en el repositorio? El JSON del mes sí quedó al día.)")


# ------------------------------------------------------------ la vuelta

def una_vuelta(args, maquina_perezosa):
    hechas = leer_json(os.path.join(args.trabajo, "procesadas.json"), {})
    ahora = time.time()
    for nombre in sorted(os.listdir(args.grabaciones)):
        ruta = os.path.join(args.grabaciones, nombre)
        if (not nombre.lower().endswith(EXTENSIONES) or nombre.startswith((".", "~"))
                or not os.path.isfile(ruta)):
            continue
        firma = f"{os.path.getsize(ruta)}"
        if hechas.get(nombre) == firma:
            continue
        if ahora - os.path.getmtime(ruta) < QUIETA_SEGUNDOS:
            print(f"  «{nombre}» todavía está cambiando; queda para la próxima vuelta.")
            continue
        try:
            procesar(ruta, nombre, args.trabajo, args, maquina_perezosa())
        except Exception as e:  # una grabación mala no frena a las demás
            print(f"  No se pudo con «{nombre}»: {e}. Se vuelve a intentar en la próxima vuelta.")
            continue
        hechas[nombre] = firma
        escribir_json(os.path.join(args.trabajo, "procesadas.json"), hechas)


def main():
    p = argparse.ArgumentParser(description="Transcribe las grabaciones de Meet y arma el informe del CCDR clase a clase.")
    p.add_argument("--grabaciones", required=True)
    p.add_argument("--trabajo", required=True)
    p.add_argument("--vigilar", action="store_true")
    p.add_argument("--cada", type=float, default=5, help="minutos entre vueltas con --vigilar")
    p.add_argument("--modelo", default="small")
    p.add_argument("--copiar-a")
    p.add_argument("--estudiantes")
    args = p.parse_args()
    if not os.path.isdir(args.grabaciones):
        sys.exit(f"No existe la carpeta de grabaciones: {args.grabaciones}")
    os.makedirs(args.trabajo, exist_ok=True)
    if not args.estudiantes:
        args.estudiantes = os.path.join(args.trabajo, "estudiantes.csv")

    # El modelo se carga solo si hay algo que transcribir: cargarlo cuesta
    # segundos y memoria, y casi todas las vueltas no encuentran nada.
    cargado = []
    def maquina():
        if not cargado:
            cargado.append(motor(args.modelo))
        return cargado[0]

    while True:
        una_vuelta(args, maquina)
        if not args.vigilar:
            break
        time.sleep(args.cada * 60)


if __name__ == "__main__":
    main()
