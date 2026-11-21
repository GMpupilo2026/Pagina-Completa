#!/usr/bin/env python3
"""Los cuadros para animar la cara del profe rival: ojos cerrados (parpadeo) y
boca abierta (habla), sacados de los dibujos originales de cada cara.

Lee herramientas/avatar-profe-oscar/originales/<cara>.png y escribe
herramientas/avatar-profe-oscar/cuadros/<cara>-ojos.png y <cara>-boca.png, del
mismo tamaño que el original y cambiando SOLO los ojos o la boca (si algo se
corre, la cara salta al alternar). Esos PNG no van a git (pesan 32 MB y salen
iguales cada vez): los corre herramientas/rival-profe-medios.py antes de
convertirlos a webp, así que basta con

    py -3 herramientas/rival-profe-medios.py
    node herramientas/sello-estampar.js

Cada cara tiene el centro aproximado de cada ojo y de la boca, medido a mano
sobre el original (en píxeles del original); el programa ajusta el ojo a lo
que encuentra alrededor (blanco del ojo, iris y pestañas). Las caras que ya
tienen los ojos cerrados (risa) o la boca abierta (wow, risa, qué jugadón…) no
llevan ese cuadro. Si un dibujo nuevo reemplaza un original, hay que volver a
medir su cara.

Ver «El profe Oscar como rival» en docs/decisiones/juegos-y-torneos.md.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "herramientas" / "avatar-profe-oscar" / "originales"
DESTINO = RAIZ / "herramientas" / "avatar-profe-oscar" / "cuadros"

# ojos: [(x, y) de cada ojo que se puede cerrar]; boca: (x, y, tipo, ancho)
# tipo "labios" = boca cerrada (se abre un óvalo entre los labios);
# tipo "dientes" = sonrisa con dientes (baja la mandíbula debajo de los dientes).
CARAS = {
    "mmm":             dict(ojos=[(207, 447), (436, 417)], boca=(340, 610, "labios", 170)),
    "pobrecillo":      dict(ojos=[(196, 451), (407, 418)], boca=(319, 610, "labios", 165)),
    "esa-vara":        dict(ojos=[(408, 462), (616, 413)], boca=(586, 598, "dientes", 110)),
    "burlon":          dict(ojos=[(191, 481), (401, 427)], boca=(331, 611, "labios", 165)),
    "brazos-cruzados": dict(ojos=[(221, 407), (427, 407)], boca=(326, 578, "dientes", 124)),
    "wow":             dict(ojos=[(268, 447), (495, 453)]),
    "atencion":        dict(ojos=[(381, 414), (588, 414)]),
    "vagabundo":       dict(ojos=[(232, 403), (440, 372)], boca=(346, 560, "labios", 168)),
    "idea":            dict(ojos=[(202, 452), (412, 421)], boca=(337, 600, "labios", 148)),
    "esa-no-es":       dict(ojos=[(334, 467), (574, 441)], boca=(480, 634, "dientes", 160)),
    "casi":            dict(ojos=[(297, 454), (505, 422)], boca=(441, 624, "labios", 115)),
    "bien-hecho":      dict(ojos=[(195, 232), (309, 232)], boca=(253, 332, "dientes", 70)),
    "tu-puedes":       dict(ojos=[(400, 411), (606, 411)], boca=(500, 582, "dientes", 136)),
    "tiempo":          dict(ojos=[(273, 474), (486, 462)]),
    "te-toca":         dict(ojos=[(300, 434), (501, 422)], boca=(410, 600, "dientes", 140)),
    "que-jugadon":     dict(ojos=[(559, 427), (768, 427)]),
    "muy-bien":        dict(ojos=[(549, 447)], separacion=205, boca=(440, 630, "dientes", 205)),
    "hola":            dict(ojos=[(553, 409), (761, 409)], boca=(652, 584, "dientes", 136)),
    "felicidades":     dict(ojos=[(315, 405), (521, 405)], boca=(418, 574, "dientes", 124)),
    "excelente":       dict(ojos=[(525, 457), (757, 457)], boca=(638, 627, "dientes", 164)),
    "dormidos":        dict(ojos=[(448, 441), (668, 441)]),
    "campeones":       dict(ojos=[(340, 245), (468, 245)], boca=(394, 344, "dientes", 90)),
}

PESTANA = (45, 28, 22, 255)
INTERIOR = (78, 22, 24, 255)
LENGUA = (196, 92, 96, 255)
DIENTE = (250, 248, 244, 255)


def es_piel(p):
    r, g, b, a = p
    return a > 200 and r > 170 and r - b > 60 and 110 < g < 225 and r >= g


def mediana_piel(a, x0, y0, x1, y1):
    zona = a[max(0, y0):y1, max(0, x0):x1].reshape(-1, 4)
    piel = [p for p in zona if es_piel(p)]
    if not piel:
        return (225, 160, 110, 255)
    return tuple(int(v) for v in np.median(np.array(piel), axis=0))


def caja_del_ojo(a, cx, cy, d):
    """El rectángulo del ojo abierto: lo que no es piel alrededor del centro."""
    rx, ry = int(d * 0.36), int(d * 0.17)
    y0, y1, x0, x1 = cy - ry, cy + ry, cx - rx, cx + rx
    zona = a[y0:y1, x0:x1].astype(int)
    r, g, b, al = zona[..., 0], zona[..., 1], zona[..., 2], zona[..., 3]
    blanco = (np.minimum(np.minimum(r, g), b) > 170) & ((np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)) < 50)
    oscuro = (r + g + b) < 330
    ojo = (blanco | oscuro) & (al > 200)
    # solo la mancha que toca el centro: así la ceja o la barba que asoman en
    # la ventana no agrandan el ojo
    h, w = ojo.shape
    semillas = [(y, x) for y in range(ry - 6, ry + 7) for x in range(rx - 6, rx + 7) if ojo[y, x]]
    if not semillas:
        return cx - rx * 0.7, cy - ry * 0.6, cx + rx * 0.7, cy + ry * 0.6
    visto = np.zeros_like(ojo); pila = list(semillas)
    for y, x in semillas:
        visto[y, x] = True
    while pila:
        y, x = pila.pop()
        for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= yy < h and 0 <= xx < w and ojo[yy, xx] and not visto[yy, xx]:
                visto[yy, xx] = True; pila.append((yy, xx))
    ys, xs = np.nonzero(visto)
    return x0 + xs.min(), y0 + ys.min(), x0 + xs.max(), y0 + ys.max()


def mascara_suave(tam, dibujar, radio):
    m = Image.new("L", tam, 0)
    dibujar(ImageDraw.Draw(m))
    return m.filter(ImageFilter.GaussianBlur(radio))


def cerrar_ojos(im, ojos, d):
    out = im.copy()
    a = np.asarray(im)
    for cx, cy in ojos:
        x0, y0, x1, y1 = caja_del_ojo(a, cx, cy, d)
        w, h = x1 - x0, y1 - y0
        px = w * 0.16
        # más arriba que abajo: el párpado de arriba lleva la raya gruesa
        ex0, ey0, ex1, ey1 = x0 - px, y0 - h * 0.30, x1 + px, y1 + h * 0.18
        # el párpado: piel de debajo del ojo (la de arriba tiene la ceja)
        piel = mediana_piel(a, int(x0), int(y1 + h * 0.3), int(x1), int(y1 + h * 0.9))
        capa = Image.new("RGBA", im.size, piel)
        m = mascara_suave(im.size, lambda dr: dr.ellipse([ex0, ey0, ex1, ey1], fill=255), max(1.5, d * 0.012))
        out.paste(capa, (0, 0), m)
        # la ceja, si quedaba cerca, vuelve tal cual: lo muy oscuro por encima del ojo
        # (solo lo que viene desde arriba del parche: la raya del pliegue del
        # párpado, que queda adentro, no vuelve)
        wy0, wy1 = max(0, int(ey0 - h)), int(y0 - h * 0.08)
        wx0, wx1 = max(0, int(ex0) - 2), int(ex1) + 3
        osc = a[wy0:wy1, wx0:wx1, :3].astype(int).sum(axis=2) < 200
        visto = np.zeros_like(osc)
        borde = max(0, int(ey0) - 2 - wy0)
        pila = [(y, x) for y in range(min(borde, osc.shape[0])) for x in range(osc.shape[1]) if osc[y, x]]
        for y, x in pila:
            visto[y, x] = True
        while pila:
            y, x = pila.pop()
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < osc.shape[0] and 0 <= xx < osc.shape[1] and osc[yy, xx] and not visto[yy, xx]:
                    visto[yy, xx] = True; pila.append((yy, xx))
        oscuro = np.zeros(a.shape[:2], bool)
        oscuro[wy0:wy1, wx0:wx1] = visto
        ceja = Image.fromarray((oscuro * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1))
        out.paste(im, (0, 0), ceja)
        # la línea de las pestañas: un arco hacia abajo, del borde de afuera al de adentro
        dr = ImageDraw.Draw(out)
        grosor = max(3, int(d * 0.035))
        ym = y0 + h * 0.55
        caida = h * 0.35
        dr.arc([x0 - px * 0.3, ym - caida, x1 + px * 0.3, ym + caida], start=15, end=165, fill=PESTANA, width=grosor)
    return out


def abrir_boca(im, cx, cy, tipo, ancho):
    out = im.copy()
    a = np.asarray(im).astype(int)
    if tipo == "labios":
        w, h = ancho * 0.55, ancho * 0.32
        caja = [cx - w / 2, cy - h * 0.40, cx + w / 2, cy + h * 0.60]
        m = mascara_suave(im.size, lambda dr: dr.ellipse(caja, fill=255), max(1.5, ancho * 0.02))
        out.paste(Image.new("RGBA", im.size, INTERIOR), (0, 0), m)
        dr = ImageDraw.Draw(out)
        # dientes de arriba y lengua
        dr.chord([caja[0] + w * 0.12, caja[1] - h * 0.05, caja[2] - w * 0.12, caja[1] + h * 0.45], 180, 360, fill=DIENTE)
        dr.chord([caja[0] + w * 0.18, cy + h * 0.15, caja[2] - w * 0.18, caja[3] + h * 0.25], 180, 360, fill=LENGUA)
        m2 = mascara_suave(im.size, lambda dr: dr.ellipse(caja, fill=255), 1)
        fondo = im.copy(); fondo.paste(out, (0, 0), m2)
        return fondo
    # dientes: se busca el blanco de los dientes cerca del centro
    rx, ry = int(ancho * 0.7), int(ancho * 0.35)
    zona = a[cy - ry:cy + ry, cx - rx:cx + rx]
    r, g, b = zona[..., 0], zona[..., 1], zona[..., 2]
    blanco = (np.minimum(np.minimum(r, g), b) > 175) & ((np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)) < 50)
    ys, xs = np.nonzero(blanco)
    if len(xs) < 20:
        sys.exit(f"no encontré los dientes cerca de ({cx}, {cy})")
    tx0, tx1 = np.percentile(xs, [2, 98]) + cx - rx
    ty0, ty1 = np.percentile(ys, [2, 98]) + cy - ry
    tw, th = tx1 - tx0, max(ty1 - ty0, ancho * 0.08)
    # la mandíbula baja: un óvalo oscuro que arranca a media altura de los dientes
    caja = [tx0 + tw * 0.06, ty0 + th * 0.5, tx1 - tw * 0.06, ty1 + th * 1.5]
    m = mascara_suave(im.size, lambda dr: dr.ellipse(caja, fill=255), max(1.5, ancho * 0.02))
    out.paste(Image.new("RGBA", im.size, INTERIOR), (0, 0), m)
    dr = ImageDraw.Draw(out)
    dr.chord([caja[0] + tw * 0.15, ty1 + th * 0.4, caja[2] - tw * 0.15, caja[3] + th * 0.6], 180, 360, fill=LENGUA)
    # los dientes de arriba vuelven encima, tal cual estaban
    dientes = Image.new("L", im.size, 0)
    dm = np.zeros((im.size[1], im.size[0]), np.uint8)
    dm[cy - ry:cy + ry, cx - rx:cx + rx][blanco] = 255
    dientes = Image.fromarray(dm).filter(ImageFilter.MaxFilter(3))
    out.paste(im, (0, 0), dientes)
    return out


def main():
    DESTINO.mkdir(parents=True, exist_ok=True)
    hechos = 0
    for cara, datos in CARAS.items():
        im = Image.open(ORIGEN / f"{cara}.png").convert("RGBA")
        ojos = datos.get("ojos", [])
        d = abs(ojos[1][0] - ojos[0][0]) if len(ojos) == 2 else datos.get("separacion", 210)
        if ojos:
            cerrar_ojos(im, ojos, d).save(DESTINO / f"{cara}-ojos.png", optimize=True)
            hechos += 1
        if "boca" in datos:
            abrir_boca(im, *datos["boca"]).save(DESTINO / f"{cara}-boca.png", optimize=True)
            hechos += 1
    print(f"{hechos} cuadros en {DESTINO.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()

# rev bfb5bbb0d2d82f9f
