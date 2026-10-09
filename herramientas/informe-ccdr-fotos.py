#!/usr/bin/env python3
"""Las fotos del informe del CCDR, bajadas con el conector de Google Drive.

El conector (download_file_content) devuelve cada archivo en base64 dentro de
un JSON {content, id, mimeType, title}. Una foto no cabe en la conversación,
así que Claude Code guarda esa respuesta en un archivo .txt y avisa dónde
quedó. Este script lee esos archivos, decodifica las imágenes, las endereza
según su EXIF y las achica a 1400 px por lado (una foto de celular de 6 MB
queda en ~200 KB, y el Word final no pasa de un par de MB). Al final arma una
hoja de miniaturas para escoger cuáles van al informe.

    python3 -I herramientas/informe-ccdr-fotos.py <carpeta-con-los-txt> <carpeta-de-salida> [hoja.jpg]

Los .txt que no son imágenes (las planillas de asistencia, por ejemplo) se
saltan. Necesita Pillow (pip install pillow).
"""
import base64, glob, io, json, os, sys

from PIL import Image, ImageDraw, ImageOps

LADO = 1400


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    origen, destino = sys.argv[1], sys.argv[2]
    hoja = sys.argv[3] if len(sys.argv) > 3 else None
    os.makedirs(destino, exist_ok=True)
    hechas = []
    for f in sorted(glob.glob(os.path.join(origen, "*.txt"))):
        try:
            d = json.load(open(f, encoding="utf-8"))
        except (ValueError, UnicodeDecodeError):
            continue
        if not isinstance(d, dict) or not str(d.get("mimeType", "")).startswith("image/"):
            continue
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(base64.b64decode(d["content"])))).convert("RGB")
        im.thumbnail((LADO, LADO))
        salida = os.path.join(destino, os.path.splitext(os.path.basename(d["title"]))[0] + ".jpg")
        im.save(salida, quality=80)
        hechas.append(salida)
        print(f"{os.path.basename(salida)}  {im.size[0]}×{im.size[1]}  {os.path.getsize(salida) // 1024} KB")
    if hoja and hechas:
        cols, an, al = 4, 300, 330
        filas = (len(hechas) + cols - 1) // cols
        lienzo = Image.new("RGB", (cols * an, filas * al), "white")
        for i, ruta in enumerate(hechas):
            m = Image.open(ruta)
            m.thumbnail((an, an))
            x, y = (i % cols) * an, (i // cols) * al
            lienzo.paste(m, (x + (an - m.width) // 2, y))
            ImageDraw.Draw(lienzo).text((x + 5, y + 312), os.path.basename(ruta)[:40], fill="black")
        lienzo.save(hoja, quality=70)
        print(f"Hoja de miniaturas: {hoja}")
    if not hechas:
        print("No había ninguna imagen en esos archivos.")


if __name__ == "__main__":
    main()
