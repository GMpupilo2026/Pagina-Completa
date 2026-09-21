#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Escribe el catálogo de cursos.html desde herramientas/cursos/catalogo.json.

Reemplaza lo que hay entre las marcas <!-- catálogo: inicio --> y
<!-- catálogo: fin -->. Las tarjetas quedan en el HTML, no se arman con
JavaScript: es la página que más tiene que encontrar Google, y si el catálogo
solo existiera al ejecutar un script, sin JavaScript la página se vería vacía.
El filtro por nivel sí es JavaScript, y por eso su barra arranca oculta: sin
JavaScript no aparece un control que no funciona, y se ven los diez cursos.

    python3 herramientas/cursos-catalogo.py
"""
import html, json, os, re, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(RAIZ)
DATOS = "herramientas/cursos/catalogo.json"
PAGINA = "cursos.html"
INICIO, FIN = "<!-- catálogo: inicio -->", "<!-- catálogo: fin -->"

d = json.load(open(DATOS, encoding="utf-8"))
niveles, cursos = d["niveles"], d["cursos"]
por_id = {n["id"]: n for n in niveles}

for c in cursos:
    if c["nivel"] not in por_id:
        sys.exit(f"El curso {c['slug']} dice nivel '{c['nivel']}', que no está en la lista de niveles.")
    if not os.path.exists(f"cursos/{c['slug']}.html"):
        sys.exit(f"No existe cursos/{c['slug']}.html")
    if not os.path.exists(f"img/cursos/{c['slug']}.svg"):
        sys.exit(f"Falta el diagrama img/cursos/{c['slug']}.svg — corré herramientas/cursos-diagramas.js")

e = lambda s: html.escape(s, quote=True)

# ---- Barra de filtros ----
cuenta = {n["id"]: sum(1 for c in cursos if c["nivel"] == n["id"]) for n in niveles}
chips = ['<button type="button" data-nivel="todos" aria-pressed="true" '
         'class="filtro-nivel px-4 py-2 rounded-full text-sm font-semibold border transition-colors '
         'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">'
         f'Todos <span class="opacity-70">({len(cursos)})</span></button>']
for n in niveles:
    if not cuenta[n["id"]]:
        continue
    chips.append(
        f'<button type="button" data-nivel="{n["id"]}" aria-pressed="false" title="{e(n["descripcion"])}" '
        'class="filtro-nivel px-4 py-2 rounded-full text-sm font-semibold border transition-colors '
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">'
        f'{e(n["nombre"])} <span class="opacity-70">({cuenta[n["id"]]})</span></button>')

filtros = (
    '            <div id="filtro-cursos" class="hidden mb-8">\n'
    '                <h2 id="filtro-titulo" class="text-sm font-semibold text-brand-600 dark:text-brand-300 mb-3 text-center">Filtrar por nivel</h2>\n'
    '                <div class="flex flex-wrap justify-center gap-2" role="group" aria-labelledby="filtro-titulo">\n'
    + "".join("                    " + ch + "\n" for ch in chips) +
    '                </div>\n'
    '                <p id="filtro-resultado" class="sr-only" role="status" aria-live="polite"></p>\n'
    '            </div>\n')

# ---- Tarjetas ----
def tarjeta(c):
    nivel = por_id[c["nivel"]]
    url = f"cursos/{c['slug']}.html"
    extras = [x for x in (c.get("duracion"), c.get("modalidad"), c.get("precio")) if x]
    extra = ('<p class="text-xs text-brand-450 dark:text-brand-350 mb-3">' + e(" · ".join(extras)) + "</p>\n                            ") if extras else ""
    lecciones = f'{c["lecciones"]} {c.get("unidad", "lecciones")}'
    return f"""                <li class="relative group" data-nivel="{c['nivel']}">
                    <article class="h-full flex flex-col bg-white dark:bg-brand-900 rounded-2xl shadow-md overflow-hidden transition-shadow group-hover:shadow-xl group-focus-within:shadow-xl">
                        <div class="h-44 bg-gradient-to-br {nivel['gradiente']} flex items-center justify-center">
                            <img src="img/cursos/{c['slug']}.svg" width="108" height="108" loading="lazy" decoding="async"
                                 alt="{e(c['alt'])}"
                                 class="w-36 h-36 rounded-lg shadow-lg ring-1 ring-black/20 transition-transform group-hover:scale-105">
                        </div>
                        <div class="p-6 flex flex-col flex-1">
                            <span class="text-xs font-semibold text-accent-700 dark:text-accent-400 uppercase tracking-wide">{e(nivel['nombre'])}</span>
                            <h3 class="font-serif text-xl font-bold mt-2 mb-2 text-brand-800 dark:text-white"><a href="{url}" class="rounded after:absolute after:inset-0 after:rounded-2xl hover:text-accent-700 dark:hover:text-accent-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">{e(c['titulo'])}</a></h3>
                            <p class="text-brand-500 dark:text-brand-300 text-sm mb-4">{e(c['resumen'])}</p>
                            {extra}<div class="mt-auto flex items-center justify-between">
                                <span class="text-xs text-brand-450 dark:text-brand-350">{lecciones}</span>
                                <span aria-hidden="true" class="text-brand-600 dark:text-brand-300 font-semibold group-hover:text-accent-700 dark:group-hover:text-accent-400 transition-colors">Ver temario &rarr;</span>
                            </div>
                        </div>
                    </article>
                </li>
"""

grid = ('            <h2 class="sr-only">Lista de cursos</h2>\n'
        '            <ul id="lista-cursos" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 list-none p-0">\n'
        + "".join(tarjeta(c) for c in cursos) +
        '            </ul>\n'
        '            <p id="sin-resultados" class="hidden text-center text-brand-500 dark:text-brand-300 py-12">'
        'No hay cursos de ese nivel todavía.</p>\n')

pagina = open(PAGINA, encoding="utf-8").read()
if INICIO not in pagina or FIN not in pagina:
    sys.exit(f"Faltan las marcas {INICIO} / {FIN} en {PAGINA}")
nuevo = re.sub(re.escape(INICIO) + r".*?" + re.escape(FIN),
               INICIO + "\n" + filtros + "\n" + grid + "            " + FIN,
               pagina, flags=re.S)
open(PAGINA, "w", encoding="utf-8").write(nuevo)
print(f"cursos.html: {len(cursos)} tarjetas, {len(chips)} filtros "
      f"({', '.join(n['nombre'] + ' ' + str(cuenta[n['id']]) for n in niveles)})")
