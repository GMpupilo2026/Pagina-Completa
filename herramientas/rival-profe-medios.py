#!/usr/bin/env python3
"""La voz y los cuadros del profe rival (js/rival-profe.js): de los originales
a lo que se publica, y la lista de lo que hay.

1. Las grabaciones del profe: herramientas/rival-profe/grabaciones/<id>.<ext>
   (cualquier formato que lea ffmpeg: .m4a del celular, .mp3, .wav, .ogg,
   .opus…), una por frase, con el `id` de la frase en js/rival-profe.js.
   Salen en audio/rival-profe/<id>.mp3: mono, sin el ruido de fondo del cuarto
   (afftdn: las notas de voz del celular traen un zumbido a -37 dB), sin el
   silencio del principio y
   del final, con el volumen parejo entre una y otra (loudnorm, -16 LUFS) y a
   64 kbps. Necesita ffmpeg en el PATH.
2. Los cuadros para animar la cara: herramientas/avatar-profe-<profe>/cuadros/
   (los de Oscar los dibuja primero herramientas/rival-profe-cuadros.py)
   <cara>-ojos.png (ojos cerrados: parpadea) y <cara>-boca.png (boca abierta:
   habla), dibujados IGUAL al original de esa cara salvo los ojos o la boca y
   del mismo tamaño. Salen en img/avatar-profe-<profe>/cuadros/*.webp a 480 px
   de alto, como los avatares (herramientas/avatar-profe-oscar.py).
3. js/rival-profe-medios.js: qué grabaciones y qué cuadros existen, para que la
   página no pida archivos que no están.

Lo que se publica sin su original se borra. Nada de esto se edita a mano.

    py -3 herramientas/rival-profe-medios.py
    node herramientas/sello-estampar.js

Ver «El profe Oscar como rival» en docs/decisiones/juegos-y-torneos.md.
"""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
GRABACIONES = RAIZ / "herramientas" / "rival-profe" / "grabaciones"
AUDIO = RAIZ / "audio" / "rival-profe"
PROFES = ["oscar", "pame", "karina"]
ALTO = 480
SILENCIO = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05"
FILTRO = f"afftdn=nr=12:nf=-35,{SILENCIO},areverse,{SILENCIO},areverse,loudnorm=I=-16:TP=-1.5:LRA=11"

ids_frases = set(re.findall(r'\{ id: "([a-z0-9-]+)"', (RAIZ / "js" / "rival-profe.js").read_text(encoding="utf-8")))
caras = set(re.findall(r'\{ id: "([a-z0-9-]+)", frase:', (RAIZ / "js" / "avatar-profe-oscar.js").read_text(encoding="utf-8")))

# 1. Las grabaciones
AUDIO.mkdir(parents=True, exist_ok=True)
voces = []
fuentes = sorted(p for p in GRABACIONES.glob("*") if p.is_file() and not p.name.startswith(".")) if GRABACIONES.exists() else []
if fuentes and not shutil.which("ffmpeg"):
    sys.exit("Falta ffmpeg en el PATH para convertir las grabaciones.")
for fuente in fuentes:
    if fuente.stem not in ids_frases:
        print(f"  ! {fuente.name}: no hay ninguna frase con id «{fuente.stem}» en js/rival-profe.js (no se usa)")
        continue
    destino = AUDIO / (fuente.stem + ".mp3")
    if not destino.exists() or destino.stat().st_mtime < fuente.stat().st_mtime:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(fuente), "-af", FILTRO,
                        "-ac", "1", "-ar", "44100", "-codec:a", "libmp3lame", "-b:a", "64k",
                        "-map_metadata", "-1", str(destino)], check=True)
    voces.append(fuente.stem)
for viejo in AUDIO.glob("*.mp3"):
    if viejo.stem not in voces:
        viejo.unlink()
print(f"{len(voces)} de {len(ids_frases)} frases con grabación en {AUDIO.relative_to(RAIZ)}")

# 2. Los cuadros. Los del profe Oscar los dibuja herramientas/rival-profe-cuadros.py
#    sobre sus originales (no se guardan en git: pesan 32 MB y salen iguales).
import importlib.util
_spec = importlib.util.spec_from_file_location("rival_profe_cuadros", RAIZ / "herramientas" / "rival-profe-cuadros.py")
_mod = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_mod); _mod.main()
cuadros = {}
for profe in PROFES:
    origen = RAIZ / "herramientas" / f"avatar-profe-{profe}" / "cuadros"
    salida = RAIZ / "img" / f"avatar-profe-{profe}" / "cuadros"
    hechos = []
    for png in sorted(origen.glob("*.png")) if origen.exists() else []:
        m = re.fullmatch(r"(.+)-(ojos|boca)", png.stem)
        if not m or m.group(1) not in caras:
            print(f"  ! {png.relative_to(RAIZ)}: se llama <cara>-ojos.png o <cara>-boca.png, con una cara de js/avatar-profe-oscar.js")
            continue
        salida.mkdir(parents=True, exist_ok=True)
        im = Image.open(png).convert("RGBA")
        ancho = round(im.width * ALTO / im.height)
        im.resize((ancho, ALTO), Image.LANCZOS).save(salida / (png.stem + ".webp"), "WEBP", quality=82, method=6)
        hechos.append(png.stem)
    if salida.exists():
        for viejo in salida.glob("*.webp"):
            if viejo.stem not in hechos:
                viejo.unlink()
    if hechos:
        cuadros[profe] = hechos
        print(f"{len(hechos)} cuadros en {salida.relative_to(RAIZ)}")

# 3. La lista
(RAIZ / "js" / "rival-profe-medios.js").write_text(
    "/* Qué grabaciones y qué cuadros del profe rival existen (js/rival-profe.js).\n"
    "   Lo arma herramientas/rival-profe-medios.py; no se edita a mano. */\n"
    "window.RivalProfeMedios = " + json.dumps({"voces": sorted(voces), "cuadros": cuadros}, ensure_ascii=False) + ";\n",
    encoding="utf-8", newline="\n")

# rev bfb5bbb0d2d82f9f
