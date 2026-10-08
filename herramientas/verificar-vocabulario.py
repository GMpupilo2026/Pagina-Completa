#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Las palabras que el dueño decidió cambiar en todo el sitio, y para siempre.

    python3 herramientas/verificar-vocabulario.py

**«Tenedor», nunca «horquilla»** (pedido del dueño, octubre de 2026): el ataque
de una pieza a dos a la vez se llama tenedor en los libros, los cursos, los
ejercicios, los artículos y todo lo que se escriba después. Se cambiaron unas
1.850 apariciones de una vez, con el género ajustado («la horquilla» → «el
tenedor», «una horquilla preparada» → «un tenedor preparado»), y este
verificador existe para que la palabra no vuelva a entrar con un texto nuevo,
un generador o contenido importado: un cambio así no da ningún error si se
deshace.

Mira el mismo texto que verificar-voseo.py (las páginas, js/, los .json, las
Edge Functions y las presentaciones y documentos de Word) y deja pasar los
identificadores, que no se ven y que la base guarda: «tac_horquilla»,
«horquillas-de-caballo.html», un "horquilla" solo entre comillas
(tema: "horquilla"), ?ficha=horquilla, #ficha-horquilla.
"""
import os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
voseo = __import__("verificar-voseo")

# palabra prohibida → la que va
PALABRAS = {
    "horquilla": "tenedor",
    "horquillas": "tenedores",
    "horquillar": "hacer un tenedor",
}
PALABRA = re.compile(r"\b(" + "|".join(sorted(PALABRAS, key=len, reverse=True)) + r")\w*\b", re.I)
# Un identificador: pegado a _ - / # = o solo entre comillas, en minúscula.
IDENT = re.compile(r"""[\w/#=-]$""")
IDENT_DESPUES = re.compile(r"""^[\w-]""")

def restos(ruta):
    t = voseo.texto_visible(ruta)
    fuera = []
    for m in PALABRA.finditer(t):
        antes, despues = t[max(0, m.start() - 1):m.start()], t[m.end():m.end() + 1]
        if IDENT.search(antes) or IDENT_DESPUES.search(despues):
            continue
        if antes in "\"'`" and despues and despues in "\"'`" and m.group(0).islower():
            continue
        # La regla escrita para otro, como en las instrucciones de la IA de
        # «Mejorar informe»: «Di siempre «tenedor», nunca «horquilla»».
        if re.search(r"nunca\s*[«\"'“]$", t[max(0, m.start() - 8):m.start()]):
            continue
        # Una clave de objeto en JavaScript ({ horquilla: … }): un identificador.
        if ruta.endswith(".js") and m.group(0).islower() and despues == ":" and re.search(r"(^|[{,])\s*$", t[:m.start()].rsplit("\n", 1)[-1]):
            continue
        fuera.append((m.group(0), re.sub(r"\s+", " ", t[max(0, m.start() - 45):m.end() + 45])))
    return fuera

def archivos():
    # Solo lo que está en el repositorio: lo que .gitignore deja afuera (como
    # herramientas/planes/, que se arma en la máquina) no se publica.
    dentro = set(subprocess.run(["git", "ls-files"], capture_output=True, text=True, cwd=voseo.RAIZ).stdout.split("\n"))
    return [f for f in voseo.archivos() if f in dentro]

def main():
    hallados = [(f, p, c) for f in archivos() for p, c in restos(f)]
    if not hallados:
        print(f"El vocabulario del sitio está al día: ninguna «horquilla» ({len(archivos())} archivos revisados).")
        return 0
    print(f"Quedan {len(hallados)} palabras que el sitio ya no usa:\n")
    for f, p, c in hallados[:60]:
        print(f"  {p} → {PALABRAS.get(p.lower(), 'tenedor')}  {f}: …{c[:90]}…")
    print("\nCámbialas en el texto o en el generador que lo escribe, con el género ajustado"
          " («la horquilla» → «el tenedor»).")
    return 1

if __name__ == "__main__":
    sys.exit(main())
