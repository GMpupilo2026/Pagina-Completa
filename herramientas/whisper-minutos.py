"""Saca la transcripción de cada clase CON SUS MINUTOS, para «Audios de las clases».

Se corre en la computadora donde están las grabaciones (no en el sitio). Por
cada MP3 de la carpeta deja, en la subcarpeta «minutos», un .json con el mismo
nombre: la transcripción de Whisper con el segundo de cada frase. Después esos
.json se suben en audios-clases.html → «Subir audios» (solos, sin los MP3), y
la página cambia los minutos aproximados de cada clase por los exactos: vuelve
a encontrar cada tema de la guía por lo que se dijo ahí.

Antes de transcribir de nuevo, mira si ya existe: si las transcripciones .txt
se hicieron con Whisper sin elegir formato, Whisper dejó también un .json con
el mismo nombre al lado. Este script lo busca primero (junto al MP3 o en la
carpeta que le digas con --transcripciones) y, si tiene los minutos, lo copia
sin volver a transcribir.

Hace falta Python 3 y, solo para transcribir de nuevo:
    pip install -U openai-whisper      (y ffmpeg instalado)

Uso:
    python whisper-minutos.py "C:/ruta/a/las/grabaciones"
    python whisper-minutos.py "C:/ruta" --transcripciones "C:/ruta/a/los/txt" --modelo medium

Ver «Las guías armadas sin los minutos de Whisper» en docs/decisiones/accesibilidad.md.
"""
import argparse, json, os, shutil, subprocess, sys

# Vocabulario de ajedrez para que Whisper escriba bien las piezas y aperturas
# (sin esto escribe «al fin» por «alfil»).
VOCABULARIO = ("Clase de ajedrez. Rey, dama, torre, alfil, caballo, peón, enroque, jaque, jaque mate, "
               "tablas, ahogado, oposición, tenedor, clavada, descubierta, gambito, Siciliana, Caro-Kann, "
               "Francesa, Italiana, Escandinava. Casillas: Ana, Beto, César, David, Eva, Félix, Gustavo, Héctor.")


def tiene_minutos(ruta):
    try:
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
        s = d.get("segments")
        return isinstance(s, list) and len(s) > 0 and "start" in s[0]
    except Exception:
        return False


def main():
    ap = argparse.ArgumentParser(description="Transcripción con minutos de cada MP3, para «Audios de las clases».")
    ap.add_argument("carpeta", help="carpeta con los MP3 de las clases")
    ap.add_argument("--transcripciones", help="carpeta donde quedaron los .txt/.json de Whisper, si no están junto a los MP3")
    ap.add_argument("--modelo", default="medium", help="modelo de Whisper (small, medium, large-v3); por omisión medium")
    a = ap.parse_args()

    salida = os.path.join(a.carpeta, "minutos")
    os.makedirs(salida, exist_ok=True)
    mp3 = sorted(f for f in os.listdir(a.carpeta) if f.lower().endswith(".mp3"))
    if not mp3:
        print("No hay archivos .mp3 en " + a.carpeta)
        return 1
    copiados = transcritos = ya = fallas = 0
    for f in mp3:
        base = os.path.splitext(f)[0]
        destino = os.path.join(salida, base + ".json")
        if tiene_minutos(destino):
            ya += 1
            continue
        viejos = [os.path.join(c, base + ".json") for c in (a.carpeta, a.transcripciones) if c]
        viejo = next((v for v in viejos if tiene_minutos(v)), None)
        if viejo:
            shutil.copyfile(viejo, destino)
            copiados += 1
            print("✓ " + base + ": ya tenía sus minutos, copiado.")
            continue
        print("… " + base + ": transcribiendo (puede tardar tanto como el audio)…")
        r = subprocess.run(["whisper", os.path.join(a.carpeta, f), "--model", a.modelo, "--language", "es",
                            "--output_format", "json", "--output_dir", salida,
                            "--condition_on_previous_text", "False", "--initial_prompt", VOCABULARIO])
        if r.returncode == 0 and tiene_minutos(destino):
            transcritos += 1
            print("✓ " + base + ": listo.")
        else:
            fallas += 1
            print("✗ " + base + ": Whisper no terminó. ¿Está instalado (pip install -U openai-whisper) y ffmpeg también?")
    print("\nCopiados: %d · transcritos: %d · ya estaban: %d · con problemas: %d" % (copiados, transcritos, ya, fallas))
    print("Ahora sube los .json de " + salida + " en «Audios de las clases» → «Subir audios» (sin los MP3).")
    return 1 if fallas else 0


if __name__ == "__main__":
    sys.exit(main())

# rev bfb5bbb0d2d82f9f
