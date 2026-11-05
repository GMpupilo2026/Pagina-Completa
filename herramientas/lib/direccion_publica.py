# -*- coding: utf-8 -*-
"""La dirección con la que Cloudflare sirve de verdad una página.

Workers Assets (`html_handling` por omisión) contesta `/cursos.html` con un 307
a `/cursos`, y `/algo/index.html` a `/algo/`. El canonical, el og:url, el
sitemap y los datos estructurados tienen que nombrar la dirección FINAL: si
nombran la que redirige, Google recibe «la oficial es X» y, al pedir X, «X está
temporalmente en otro lado». Ver «El canonical va sin .html» en
docs/decisiones/sitio-e-infraestructura.md.

Una sola copia: la usan sitemap.py, datos-estructurados.py,
verificar-metadatos.py y los generadores de cursos.
"""

SITIO = "https://ajedrez-integral.com"


def direccion(ruta):
    """`index.html` → `/`, `x/index.html` → `/x/`, `a/b.html` → `/a/b` (con el dominio)."""
    ruta = ruta.replace("\\", "/").lstrip("/")
    if ruta == "index.html":
        return SITIO + "/"
    if ruta.endswith("/index.html"):
        return SITIO + "/" + ruta[: -len("index.html")]
    if ruta.endswith(".html"):
        return SITIO + "/" + ruta[: -len(".html")]
    return SITIO + "/" + ruta

# rev bfb5bbb0d2d82f9f
