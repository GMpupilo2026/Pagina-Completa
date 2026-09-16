#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Busca voseo en el sitio y, si se le pide, lo pasa a tuteo.

El español del sitio es de tuteo (ver CLAUDE.md). Con el contenido importado de
septiembre entraron unas 1.900 formas de voseo —"podés", "jugá", "fijate"— y se
colaron hasta dentro de los datos estructurados que lee Google.

    python3 herramientas/verificar-voseo.py             # avisa y falla si hay
    python3 herramientas/verificar-voseo.py --arreglar  # lo convierte

**No es quitar la tilde.** El imperativo de tuteo cambia la raíz en muchos
verbos: "pensá" es "piensa", "jugá" es "juega", "hacé" es "haz", "volvé" es
"vuelve", "elegí" es "elige". Y al pegarle el pronombre pasa al revés: el voseo
no lleva tilde ("dejalo") y el tuteo sí ("déjalo"). Por eso la conversión es una
tabla escrita a mano, verbo por verbo, y no una regla.

Lo que NO es voseo y por eso está en la lista blanca: los futuros ("quedará",
"tendrás", "podrá"), los pretéritos de primera persona ("empecé", "aprendí",
"entendí", "tomé"), los nombres propios ("Elistá", "Andrés", "Valdés") y las
palabras que solo terminan parecido ("además", "inglés", "país").
"""
import glob, html, os, re, sys, unicodedata

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(RAIZ)

# ---------------------------------------------------------------- la tabla ---
IMPERATIVOS = {
    # -ar: el tuteo es la tercera persona del presente, con cambio de raíz
    # donde el verbo lo pide (contá→cuenta, jugá→juega, pensá→piensa).
    "acercá": "acerca", "activá": "activa", "actuá": "actúa", "agotá": "agota",
    "aguantá": "aguanta", "alcanzá": "alcanza", "amenazá": "amenaza",
    "analizá": "analiza", "anotá": "anota", "aplicá": "aplica",
    "aprovechá": "aprovecha", "armá": "arma", "atacá": "ataca", "avanzá": "avanza",
    "bloqueá": "bloquea", "buscá": "busca", "calculá": "calcula", "cambiá": "cambia",
    "centralizá": "centraliza", "cerrá": "cierra", "clavá": "clava",
    "colocá": "coloca", "comprobá": "comprueba", "confiá": "confía",
    "conservá": "conserva", "continuá": "continúa", "controlá": "controla",
    "contá": "cuenta", "creá": "crea", "dejá": "deja", "desconfiá": "desconfía",
    "empezá": "empieza", "empujá": "empuja", "encontrá": "encuentra",
    "entregá": "entrega", "entrená": "entrena", "escaneá": "escanea",
    "estudiá": "estudia", "evaluá": "evalúa", "evitá": "evita", "fijá": "fija",
    "fotografiá": "fotografía", "ganá": "gana", "identificá": "identifica",
    "iniciá": "inicia", "intentá": "intenta", "jugá": "juega", "llevá": "lleva",
    "maniobrá": "maniobra", "marcá": "marca", "mejorá": "mejora",
    "memorizá": "memoriza", "mirá": "mira", "observá": "observa", "ocupá": "ocupa",
    "pensá": "piensa", "practicá": "practica", "priorizá": "prioriza",
    "probá": "prueba", "pulsá": "pulsa", "ralentizá": "ralentiza",
    "recargá": "recarga", "rechazá": "rechaza", "recordá": "recuerda",
    "repasá": "repasa", "revisá": "revisa", "tapá": "tapa", "tomá": "toma",
    "trazá": "traza", "usá": "usa", "valorá": "valora", "verificá": "verifica",
    # -er
    "defendé": "defiende", "distraé": "distrae", "escondé": "esconde",
    "hacé": "haz", "leé": "lee", "mantené": "mantén", "proponé": "propón",
    "reconocé": "reconoce", "resolvé": "resuelve", "respondé": "responde",
    "tené": "ten", "volvé": "vuelve",
    # -ir
    "abrí": "abre", "construí": "construye", "convertí": "convierte",
    "cubrí": "cubre", "decidí": "decide", "elegí": "elige", "escribí": "escribe",
    "exprimí": "exprime", "medí": "mide", "preferí": "prefiere", "reducí": "reduce",
    "recorré": "recorre", "repetí": "repite", "reproducí": "reproduce", "seguí": "sigue",
}

PRESENTE = {
    "aceptás": "aceptas", "adivinás": "adivinas", "autoimponés": "autoimpones",
    "comprendés": "comprendes", "creás": "creas", "defendés": "defiendes",
    "dejás": "dejas", "dudás": "dudas", "ganás": "ganas", "jugás": "juegas",
    "llegás": "llegas", "navegás": "navegas", "pensás": "piensas",
    "podés": "puedes", "ponés": "pones", "practicás": "practicas",
    "querés": "quieres", "recorrés": "recorres", "resolvés": "resuelves",
    "revisás": "revisas", "sabés": "sabes", "sacrificás": "sacrificas",
    "tenés": "tienes", "abrís": "abres", "corregís": "corriges",
    "partís": "partes", "preferís": "prefieres", "recibís": "recibes",
    "restringís": "restringes",
    # subjuntivo
    "abandonés": "abandones",
}

# Imperativo con el pronombre pegado: el voseo no lleva tilde, el tuteo sí.
ENCLITICOS = {
    "actualizalo": "actualízalo", "bloquealo": "bloquéalo", "comprobalo": "compruébalo",
    "convertila": "conviértela", "dejalo": "déjalo", "dejanos": "déjanos",
    "encontrala": "encuéntrala", "fijate": "fíjate", "hacelo": "hazlo",
    "jugala": "juégala", "jugalos": "juégalos", "marcala": "márcala",
    "reducile": "redúcele", "usalo": "úsalo",
}

OTROS = {"sos": "eres"}           # "vos" se trata aparte: puede ser "tú" o "ti"

TABLA = {**IMPERATIVOS, **PRESENTE, **ENCLITICOS, **OTROS}

# --------------------------------------------------------------- detección ---
PAL = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+")
FIN = re.compile(r"(ás|és|ís|[áéí])$")
PREPOSICION = re.compile(r"\b(para|a|con|de|en|por|sin|sobre|hacia|entre|contra)\s+$", re.I)

def es_futuro(b):
    """quedará, tendrás, aparecerán: la palabra menos la vocal final es el infinitivo."""
    if b.endswith("á"): r = b[:-1]
    elif b.endswith(("ás", "án")): r = b[:-2]
    else: return False
    return r.endswith(("ar", "er", "ir")) and len(r) > 3

BLANCA = set("""
más además después jamás quizás atrás detrás través compás interés inglés francés país
así aquí allí ahí allá acá está están estás esté estés japonés portugués marqués revés
demás porqué comité josé café también según razón bebé qué holandés
aperturasmás
elistá andrés valdés josué prevé
empecé aprendí entendí tomé
dará hará podrá dispondrá será tendrá tendrás vendrá verá verás sabrás habrá saldrá
pondrá querrá irá
""".split())

def texto_visible(ruta):
    s = open(ruta, encoding="utf-8").read()
    if ruta.endswith(".html"):
        s = re.sub(r"<(script|style)\b[^>]*>.*?</\1>", " ", s, flags=re.S | re.I)
        s = re.sub(r"<[^>]+>", " ", s)
        s = html.unescape(s)
    return s

def archivos():
    vistos = sorted(set(glob.glob("**/*.html", recursive=True) +
                        glob.glob("js/*.js") + glob.glob("**/*.json", recursive=True)))
    # Los .min.js son librerías de fuera, minificadas: no tienen prosa que
    # revisar y sí nombres propios que el detector marca sin razón (pdf.js trae
    # una tabla de fuentes con "Trinité"). Revisarlos es ruido garantizado.
    return [f for f in vistos
            if os.path.getsize(f) < 2_000_000
            and not f.startswith("herramientas/verificar")
            and not f.endswith(".min.js")]

def hallazgos(ruta):
    """Devuelve [(palabra, contexto)] del voseo que quede en el archivo."""
    t = texto_visible(ruta)
    fuera = []
    for m in PAL.finditer(t):
        b = m.group(0).lower()
        if b in TABLA or b == "vos":
            fuera.append((m.group(0), re.sub(r"\s+", " ", t[max(0, m.start() - 45):m.end() + 45])))
            continue
        if len(b) < 3 or not FIN.search(b) or b in BLANCA or es_futuro(b):
            continue
        fuera.append((m.group(0), re.sub(r"\s+", " ", t[max(0, m.start() - 45):m.end() + 45])))
    return fuera

# ------------------------------------------------------------- conversión ---
def igual_caja(original, nuevo):
    if original[:1].isupper():
        return nuevo[:1].upper() + nuevo[1:]
    return nuevo

def arreglar(s):
    cambios = 0
    def cambia(m):
        nonlocal cambios
        b = m.group(0).lower()
        if b not in TABLA:
            return m.group(0)
        cambios += 1
        return igual_caja(m.group(0), TABLA[b])
    # Una sola pasada, palabra por palabra.
    patron = re.compile(r"\b(" + "|".join(sorted(TABLA, key=len, reverse=True)) + r")\b", re.I)
    s = patron.sub(cambia, s)
    # "vos": con preposición delante es "ti" ("un lugar para vos"), si no es "tú".
    def cambia_vos(m):
        nonlocal cambios
        cambios += 1
        antes = s[:m.start()]
        return igual_caja(m.group(0), "ti" if PREPOSICION.search(antes[-14:]) else "tú")
    s = re.sub(r"\bvos\b", cambia_vos, s, flags=re.I)
    return s, cambios

def main():
    modo_arreglo = "--arreglar" in sys.argv
    total = 0
    if modo_arreglo:
        tocados = 0
        for f in archivos():
            s = open(f, encoding="utf-8").read()
            t, n = arreglar(s)
            if n:
                open(f, "w", encoding="utf-8").write(t)
                print(f"{n:5d}  {f}")
                total += n; tocados += 1
        print(f"\n{total} formas convertidas en {tocados} archivos")
        print("Volvé a correr sin --arreglar para comprobar." if False else
              "Corre el script sin --arreglar para comprobar que no quedó ninguna.")
        return 0
    restos = []
    for f in archivos():
        for pal, ctx in hallazgos(f):
            restos.append((f, pal, ctx))
    if not restos:
        print(f"Todo el sitio tutea ({len(archivos())} archivos revisados).")
        return 0
    por_palabra = {}
    for f, pal, ctx in restos:
        por_palabra.setdefault(pal.lower(), []).append((f, ctx))
    print(f"Queda voseo: {len(restos)} ocurrencias, {len(por_palabra)} formas.\n")
    for pal in sorted(por_palabra):
        f, ctx = por_palabra[pal][0]
        print(f"{len(por_palabra[pal]):5d}  {pal:16s} {f}: …{ctx[:80]}…")
    print("\nSi alguna no es voseo (un nombre propio, un futuro), agregala a BLANCA.")
    return 1

sys.exit(main())
