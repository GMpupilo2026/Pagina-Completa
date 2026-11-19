"""Las fotos de los jugadores de la Eliminatoria Cantonal JDN de Pérez Zeledón
2026, para la ficha «Inscritos» de jdn-pz-2026.html (js/jdn-pz-inscritos.js).

Las tomó Tecnicolor Fotografía para la ADAPZ y están en la carpeta «ADA PZ»
de Google Drive (la pasó el dueño el 18/11/2026). Cada archivo se llama con un
número y el NOMBRE DE PILA nada más («24 SANTIAGO MEDIOS DIGITALES.jpg»): por
eso el mapa de abajo lo arma una persona, archivo por archivo, contra el
nombre del jugador en Pareo Integral. Un nombre que se repite (dos Aaron, dos
Santiago, varios Samuel, dos Sofía) NO se adivina por la cara: se deja sin
foto hasta que alguien diga cuál es cuál, y la página pone sus iniciales.
Ponerle a un niño la cara de otro en una página pública es peor que no
ponerle ninguna.

Se usa la versión «MEDIOS DIGITALES» (la liviana; la marca del fotógrafo va
abajo a la derecha y queda fuera del recorte). Cada foto se recorta cuadrada
en la cabeza y los hombros (todas están tomadas igual: la persona al centro y
el tablero abajo) y se guarda a 360 × 360 en
img/jdn-pz-2026/jugadores/<nombre-de-pareo-sin-tildes>.jpg, que es lo que
busca la página (con la lista de las que hay en lista.json). Para agregar una foto: sumar su línea al mapa y correr

    py -3 herramientas/jdn-pz-fotos.py

Ver «Los inscritos de la Eliminatoria JDN de PZ, con su foto» en
docs/decisiones/juegos-y-torneos.md.
"""
import io
import json
import os
import re
import sys
import unicodedata
import urllib.request

from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, "img", "jdn-pz-2026", "jugadores")
LADO = 360

# [id del archivo en Drive, nombre del jugador TAL CUAL está en Pareo Integral, archivo de Drive (para quien revisa)]
MAPA = [
    ("1Q-B5wjIVvk6QyUdAXJujnXr-QPLhKzeR", "Arguedas Rodríguez, Amelia", "33 AMELIA"),
    ("1gQjzwBi7j9n_944raShUmjaAM0oe-B3B", "Castro Monge, Abel Francisco", "1 ABEL"),
    ("1YoxgF8waBCBeVfvRAlR7NlEktfpurgKz", "Ceciliano Azofeifa, Amy Samantha", "32 AMY"),
    ("1_UOm47iZfTQr06oFAjLiV6mDIuE5zvOU", "Jiménez Azofeifa, Lía", "27 LIA"),
    ("1b89IzXDNWgcfZJgTB6vTEin04ZQSPb2g", "Mora Bonilla, Carlos Daniel", "39 CARLOS DANIEL"),
    ("1c4s4XsplJx1D8UjRvLWnb9vkwQ_RijxE", "Segura Valverde, Dylan", "41 DYLAN"),
    ("1DLrFj1kaWK1ePHGUtejTXKJSDpIptrk_", "Ulcigrai Ramírez, Giordano", "35 GIORDANO"),
    ("1mm-qTPFtgM7V3jg3YnmPVhFHet0AEl2T", "Ulcigrai Ramírez, Giulio", "36 GIULIO"),
    ("1KH8rRpoDVeKhm7PAUanDQz-mOcNz-T1H", "VALVERDE ALVARADO, LEONARDO", "34 LEONARDO"),
    ("134yiFHXtu0AcwkTQLpkAeGpWhWXuQnKe", "Villalobos Solano, SAMUEL", "38 SAMUEL VILLALOBOS"),
    ("1sM5Wr-hhnCkqcpS28t1KZ0n5qQ8Tn9Ah", "Zuñiga Arias, Yariela Sofia", "40 YARIELA"),
    ("1n2M84wFb9a0Fq-ssYFqtUNOV8gik-0Cz", "Acuña Badilla, Sussy Belén", "21 SUSSY"),
    ("1sew9RsviQqJpmm5n0YbBb1oXRUIiFmQ2", "Alpízar Hernández, Ethan bary", "31 ETHAN"),
    ("1578s8dVTlM70iNcmoZoCnOA4LqflT855", "Arguedas Matamoros, Isaac", "13 ISAAC"),
    ("15pmFBnuq2QCLuHOv7hAsLfdwAlBvHYTT", "Chinchilla Solís, Javier Alonso", "14 JAVIER"),
    ("1pm7Kg00o4FxfDH-35tbT3Ipz8sS9pbzI", "Chryssopulos Fajardo, Alejandro", "4 ALEJANDRO"),
    ("1r4JxTf_eJtEerK1nwduSqxUzW6zE8stW", "Flores Badilla, Joselyn Ariana", "16 JOSSELYN"),
    ("1LCjD-8MHAgQzzjx3hAmedyLk_zw8KWuY", "González Retana, Fabián", "6 FABIAN"),
    ("10inM1BnGCbAsYhfzIl0OKWmEaWRxOZhX", "Martínez Arce, Samuel", "46 SAMUEL M"),
    ("1xqIFA1kLULTwBVW5EYjkzMWAQzMRJ2wH", "Rodriguez Quesada, Keithy", "17 KEITHY"),
    ("1MZrUW-B_iq9hKYVs4pKWKxf04MFvej-z", "Segura Monge, Allan Jafeth", "37 ALLAN"),
    ("17-VTl3ALHGyQMB3XbyVgVmO8X6ikpJ7X", "Segura Valverde, Matthew", "12 MATEW"),
    ("15Lh4SQOfsNVFNDrhWV0P3GDVRDOqQYQ2", "Sequeira Solís, Shane Stevens", "19 SHANE"),
    ("1kIOOPUu7AYv66qkZGlaVcDHBaBQqKML6", "Villegas Badilla, Evanz", "9 EVANZ"),
    ("1Vx_bzlX69PCh2ef6BoYgal9fJ6HeQiyD", "Vindas Méndez, Brianna Isabella", "7 BRIANNA"),
    ("18UjGB6xVG6NzJIf38YOrcd15k7Qenu9E", "Zeledón Rojas, Ismael", "44 ISMAEL"),
]


def nombre_archivo(nombre):
    """El mismo que arma js/jdn-pz-inscritos.js (fotoDe): sin tildes, en
    minúscula y con guiones."""
    s = unicodedata.normalize("NFD", nombre)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") + ".jpg"


def recortar(datos):
    """Cabeza y hombros, al tamaño de cada uno: los chiquitos salen más abajo
    y más pequeños en la foto. Sobre el fondo blanco se busca dónde empieza
    la cabeza (la primera fila que no es blanca) y dónde empieza la mesa
    negra; el cuadrado mide un poco más de la mitad de esa altura."""
    img = Image.open(io.BytesIO(datos)).convert("RGB")
    ancho, alto = img.size
    chica = img.resize((ancho // 8, alto // 8)).convert("L")
    w, h = chica.size
    px = chica.load()
    no_blanca = lambda x, y: px[x, y] < 200
    cabeza = next(y for y in range(h) if sum(no_blanca(x, y) for x in range(w // 5, w * 4 // 5)) > w // 40)
    # La mesa va de borde a borde (una camiseta oscura no llega a los bordes).
    mesa = next((y for y in range(h // 2, h) if px[1, y] < 60 and px[w - 2, y] < 60 and sum(px[x, y] < 60 for x in range(w)) > w * 0.6), h)
    # El centro de la cabeza: el medio de lo que no es blanco unas filas más abajo.
    fila = min(h - 1, cabeza + (mesa - cabeza) // 6)
    xs = [x for x in range(w) if no_blanca(x, fila)]
    centro = (xs[0] + xs[-1]) / 2 if xs else w / 2
    lado = int((mesa - cabeza) * 0.62 * 8)
    y = max(0, int(cabeza * 8 - lado * 0.08))
    x = int(min(max(centro * 8 - lado / 2, 0), ancho - lado))
    return img.crop((x, y, x + lado, y + lado)).resize((LADO, LADO), Image.LANCZOS)


def main():
    os.makedirs(DESTINO, exist_ok=True)
    for ident, nombre, origen in MAPA:
        url = "https://drive.usercontent.google.com/download?id=" + ident + "&export=download"
        with urllib.request.urlopen(url, timeout=60) as r:
            datos = r.read()
        foto = recortar(datos)
        ruta = os.path.join(DESTINO, nombre_archivo(nombre))
        foto.save(ruta, "JPEG", quality=82, optimize=True, progressive=True)
        print("ok", origen, "->", os.path.relpath(ruta, RAIZ))
    # La lista de las que hay: la página pide solo esas (sin un 404 por cada
    # jugador sin foto) y a los demás les pone sus iniciales.
    hechas = sorted(nombre_archivo(n) for _, n, _ in MAPA)
    with open(os.path.join(DESTINO, "lista.json"), "w", encoding="utf-8") as f:
        f.write(json.dumps(hechas, ensure_ascii=False, indent=0) + "\n")
    print(len(MAPA), "fotos")


if __name__ == "__main__":
    sys.exit(main())

# rev bfb5bbb0d2d82f9f
