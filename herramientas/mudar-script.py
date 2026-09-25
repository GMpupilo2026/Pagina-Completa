#!/usr/bin/env python3
"""Muda el <script> escrito dentro de una página a un archivo de js/, tal cual.

Es el procedimiento de «El código de las páginas sale del HTML»
(docs/decisiones/sitio-e-infraestructura.md), escrito una vez para que sea
el mismo en las 34 páginas y no dependa de hacerlo con cuidado a mano:

  1. Toma el bloque <script> sin src más grande de la página (el de su código;
     los chicos del <head> los ponen los generadores y se quedan).
  2. Se niega si hay algo que cambie de comportamiento al pasar a un archivo:
     document.currentScript, type="module", un «</script» escrito adentro.
  3. Escribe js/<destino>.js = cabecera + el bloque BYTE POR BYTE (sin
     reindentar: un template literal de varias líneas cambiaría de contenido).
  4. En la página deja <script src="…"> EN LA MISMA POSICIÓN: un script clásico
     externo corre en el mismo orden y sus let/const de arriba siguen siendo
     globales, como el escrito en la página.
  5. Comprueba que el archivo termine exactamente con el bloque original.

Después hay que:
  · sacar la página de PENDIENTES en verificar-carga-paginas.js;
  · correr `npm run css` (el CSS tiene que quedar idéntico);
  · buscar los verificadores que LEEN el .html buscando código
    (grep 'readFileSync(.*"<pagina>"' herramientas/) y pasarlos a
    lib/codigo-de-pagina.js: leyendo solo el .html dejan de encontrarlo;
  · correr TODOS los verificadores (npm run verificar), no solo los de la
    página: el que leía el código de informes.html era verificar-admin.js.

    python3 herramientas/mudar-script.py informes.html js/informes.js
"""
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLOQUE = re.compile(r'<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>', re.S)


def main(pagina, destino):
    ruta = os.path.join(RAIZ, pagina)
    s = open(ruta, encoding="utf-8").read()
    bloques = [m for m in BLOQUE.finditer(s) if "json" not in m.group(1)]
    if not bloques:
        sys.exit(f"{pagina}: no tiene ningún <script> escrito adentro.")
    m = max(bloques, key=lambda b: len(b.group(2)))
    attrs, cuerpo = m.group(1), m.group(2)

    problemas = []
    if "module" in attrs:
        problemas.append('es type="module": un archivo externo necesita el mismo atributo')
    if attrs.strip():
        problemas.append(f"trae atributos ({attrs.strip()}): revisarlos a mano")
    if "currentScript" in cuerpo:
        problemas.append("usa document.currentScript, que en un archivo apunta a otro lado")
    if re.search(r"</script", cuerpo, re.I):
        problemas.append("tiene un «</script» escrito adentro")
    if problemas:
        sys.exit(f"{pagina}: no se muda solo —\n  · " + "\n  · ".join(problemas))

    ruta_js = os.path.join(RAIZ, destino)
    if os.path.exists(ruta_js):
        sys.exit(f"{destino} ya existe: elegir otro nombre.")
    kb = len(cuerpo.encode("utf-8")) // 1024
    cabecera = (
        f"/* El código de {pagina}.\n\n"
        f"   Vivía escrito dentro de la página, en un <script> de {kb} KB. Se mudó acá\n"
        "   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el\n"
        "   navegador lo guarda en caché aparte, y es un paso hacia sacar\n"
        "   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar\n"
        "   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba\n"
        "   siguen siendo globales. Ver «El código de las páginas sale del HTML» en\n"
        "   docs/decisiones/sitio-e-infraestructura.md. */\n"
    )
    open(ruta_js, "w", encoding="utf-8").write(cabecera + cuerpo)

    src = os.path.relpath(ruta_js, os.path.dirname(ruta)).replace(os.sep, "/")
    s = s[:m.start()] + f'<script src="{src}"></script>' + s[m.end():]
    open(ruta, "w", encoding="utf-8").write(s)

    if not open(ruta_js, encoding="utf-8").read().endswith(cuerpo):
        sys.exit(f"{destino}: el archivo no termina con el bloque original. Revisar.")
    print(f"{pagina}: {kb} KB → {destino} (idéntico), la página carga {src}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
