#!/usr/bin/env python3
"""Suma a ajedrez-estudiantil.html los torneos que se publican en chess-results.

Lo corre el flujo .github/workflows/ajedrez-estudiantil.yml cuando se pide
(desde una sesión de Claude Code no hay salida a chess-results). Hace una sola
búsqueda en el buscador de torneos de chess-results: los 250 de Costa Rica que
se tocaron más recientemente, con sus fechas, lugar, rondas y número de
jugadores. Con eso:

  · un torneo que ya está en la lista se pone al día (los inscritos y las
    rondas cambian mientras se juega);
  · uno nuevo se clasifica con herramientas/ajedrez_estudiantil_reglas.py y,
    si es de los juegos estudiantiles, se suma. El buscador da los nombres
    cortados a 50 letras, así que de un nombre cortado se lee el título
    completo en la página del torneo antes de clasificarlo (la categoría suele
    estar al final);
  · uno nuevo que las reglas no aceptan pero tiene pinta de JDE (una letra de
    categoría, un organizador del MEP…) no se suma: se anota en
    herramientas/datos/ajedrez-estudiantil-revisar.csv y sale en el resumen
    del PR, para que alguien decida. Así se perdieron 36 torneos hasta 2026.

Si cambió algo, reescribe herramientas/datos/ajedrez-estudiantil-torneos.csv,
la fecha de actualización y data/ajedrez-estudiantil.json. Si no, no toca nada.

    python3 herramientas/ajedrez-estudiantil-actualizar.py [--resumen archivo.md]

Ver «Ajedrez estudiantil en Costa Rica: los torneos de chess-results» en
docs/decisiones/juegos-y-torneos.md.
"""
import csv
import datetime
import html
import http.cookiejar
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "herramientas"))
import ajedrez_estudiantil_reglas as reglas  # noqa: E402

FUENTE = os.path.join(RAIZ, "herramientas", "datos", "ajedrez-estudiantil-torneos.csv")
FECHA = os.path.join(RAIZ, "herramientas", "datos", "ajedrez-estudiantil-actualizado.txt")
REVISAR = os.path.join(RAIZ, "herramientas", "datos", "ajedrez-estudiantil-revisar.csv")
COLUMNAS_REVISAR = ["clave", "nombre", "inicio", "organizador", "lugar", "jugadores", "visto", "decision"]
BUSCADOR = "https://chess-results.com/TurnierSuche.aspx?lan=2"
# Un navegador común: el agente por omisión de Python lo tratan distinto.
AGENTE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
# Pistas de que un nombre cortado puede ser de los juegos estudiantiles: solo
# esos se van a leer completos, para no pedir a chess-results cien páginas.
PISTAS = re.compile(r"jde|j\.d\.e|estudiant|codicader|escolar|colegial|regional|circuit|institucional|eliminatoria|"
                    r"etapa|categor|final nacional|primaria|secundaria|jdn", re.I)


# ---------- Leer lo que devuelve chess-results ----------

def texto_celda(c):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", c))).strip()


def campos_ocultos(pagina):
    """Los <input type="hidden"> del formulario ASP.NET (__VIEWSTATE y compañía)."""
    return dict(re.findall(r'<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"', pagina))


def leer_filas(pagina):
    """Las filas de la tabla de resultados del buscador, leídas por el nombre de
    cada columna (nunca por posición: chess-results ya cambió columnas antes)."""
    i = pagina.find('<table class="CRs2"')
    if i < 0:
        return []
    tabla = pagina[i:pagina.find("</table>", i)]
    filas = re.findall(r'<tr class="(CRn?g1b?|CRn?g2)[^"]*">(.*?)(?=<tr |\Z)', tabla, re.S)
    if not filas or not filas[0][0].endswith("b"):
        return []
    celdas = lambda tr: [texto_celda(c) for c in re.split(r"</t[dh]>", tr)[:-1]]
    encabezado = celdas(filas[0][1])
    col = {nombre: encabezado.index(nombre) for nombre in ("Torneo", "Del", "Organizador", "Lugar", "Rd.", "n", "dbkey") if nombre in encabezado}
    if len(col) < 7:
        raise SystemExit("chess-results cambió las columnas del buscador: " + " | ".join(encabezado))
    salida = []
    for _, tr in filas[1:]:
        c = celdas(tr)
        if len(c) <= max(col.values()) or not c[col["dbkey"]].isdigit():
            continue
        salida.append({
            "clave": c[col["dbkey"]],
            "nombre": c[col["Torneo"]],
            "inicio": c[col["Del"]].replace("/", "-"),
            "organizador": c[col["Organizador"]],
            "lugar": c[col["Lugar"]],
            "rondas": c[col["Rd."]] or "0",
            "jugadores": c[col["n"]] or "0",
        })
    return salida


def leer_titulo(pagina):
    m = re.search(r"<h2>(.*?)</h2>", pagina, re.S)
    return texto_celda(m.group(1)) if m else ""


# ---------- Pedirle a chess-results ----------

class ChessResults:
    def __init__(self):
        self.abridor = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.abridor.addheaders = [("User-Agent", AGENTE)]

    def pedir(self, url, datos=None):
        for intento in range(3):
            try:
                cuerpo = urllib.parse.urlencode(datos).encode() if datos is not None else None
                with self.abridor.open(url, cuerpo, timeout=90) as r:
                    return r.geturl(), r.read().decode("utf-8", "replace")
            except Exception as e:  # la red falla de vez en cuando: tres intentos y se rinde
                if intento == 2:
                    raise
                print(f"  reintento tras error: {e}")
                time.sleep(5 * (intento + 1))

    def recientes(self):
        """Los 250 torneos de Costa Rica tocados más recientemente."""
        # chess-results manda a uno de sus servidores (s1, s2, s3…): el
        # formulario se manda al MISMO servidor que lo dio, porque una
        # redirección convertiría el POST en GET y no buscaría nada.
        url, pagina = self.pedir(BUSCADOR)
        datos = campos_ocultos(pagina)
        if "__VIEWSTATE" not in datos:
            raise SystemExit("El buscador de chess-results no trajo su formulario.")
        datos.update({
            "ctl00$P1$txt_leiter": "", "ctl00$P1$combo_art": "5", "ctl00$P1$combo_sort": "1",
            "ctl00$P1$combo_land": "CRC", "ctl00$P1$combo_bedenkzeit": "0", "ctl00$P1$combo_anzahl_zeilen": "1",
            "ctl00$P1$txt_tnr": "", "ctl00$P1$txt_bez": "", "ctl00$P1$txt_veranstalter": "",
            "ctl00$P1$txt_Hauptschiedsrichter": "", "ctl00$P1$txt_Schiedsrichter": "", "ctl00$P1$txt_ort": "",
            "ctl00$P1$txt_von_tag": "", "ctl00$P1$txt_bis_tag": "", "ctl00$P1$txt_eventid": "",
            "ctl00$P1$cb_suchen": "Buscar",
        })
        _, resultado = self.pedir(url, datos)
        filas = leer_filas(resultado)
        if not filas:
            raise SystemExit("El buscador de chess-results no devolvió ningún torneo: ¿cambió la página?")
        self.servidor = re.match(r"https?://[^/]+", url).group(0)
        return filas

    def titulo(self, clave):
        _, pagina = self.pedir(f"{self.servidor}/tnr{clave}.aspx?lan=2")
        return leer_titulo(pagina)


# ---------- Juntar lo nuevo con lo que ya está ----------

def actualizar(guardados, recientes, titulo, ya_anotados=()):
    """Devuelve (filas, nuevos, cambiados, por_revisar). `titulo(clave)` lee el
    título completo; `ya_anotados` son las claves que ya están para revisar."""
    por_clave = {r["clave"]: r for r in guardados}
    nuevos, cambiados, por_revisar = [], [], []
    for t in recientes:
        viejo = por_clave.get(t["clave"])
        if viejo:
            cambio = {k: t[k] for k in ("inicio", "jugadores", "rondas") if t[k] and t[k] != viejo[k]}
            if cambio:
                viejo.update(cambio)
                cambiados.append((viejo, cambio))
            continue
        if t["clave"] in ya_anotados:
            continue
        nombre = t["nombre"]
        # Cortado y con pistas de ser estudiantil (o dudoso): antes, el título
        # completo. Sin pistas, ninguna regla lo acepta: se mira cortado.
        if len(nombre) >= 45 and (PISTAS.search(reglas.sin_tildes(nombre + " " + t["organizador"]))
                                  or reglas.dudoso(nombre, t["organizador"], t["lugar"])):
            nombre = titulo(t["clave"]) or nombre
        c = reglas.clasificar(nombre, t["organizador"], t["lugar"], t["inicio"], t["clave"])
        if c is None:
            if reglas.dudoso(nombre, t["organizador"], t["lugar"]):
                por_revisar.append({**{k: t[k] for k in ("clave", "inicio", "organizador", "lugar", "jugadores")}, "nombre": nombre})
            continue
        fila = {
            "clave": t["clave"], "anio": str(c["anio"]), "etapa": c["etapa"], "categoria": c["categoria"],
            "nombre": nombre, "inicio": t["inicio"], "organizador": t["organizador"], "lugar": t["lugar"],
            "region": c["region"], "jugadores": t["jugadores"], "rondas": t["rondas"],
            "modalidad": c["modalidad"], "ritmo": c["ritmo"],
            "enlace": f"https://chess-results.com/tnr{t['clave']}.aspx?lan=2",
        }
        por_clave[t["clave"]] = fila
        nuevos.append(fila)
    filas = sorted(por_clave.values(), key=lambda r: (int(r["anio"]), r["inicio"], int(r["clave"])))
    return filas, nuevos, cambiados, por_revisar


def hoy_en_costa_rica():
    return (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=6)).date().isoformat()


def resumen(nuevos, cambiados, pendientes=()):
    lineas = [f"Revisión automática de chess-results del {hoy_en_costa_rica()}.", ""]
    if pendientes:
        lineas += [f"**{len(pendientes)} torneo(s) por revisar:** las reglas no los aceptan, pero tienen pinta de los JDE. "
                   "Si alguno es de los JDE, va en `A_MANO` de `herramientas/ajedrez_estudiantil_reglas.py`; si no, "
                   "«no» en la columna `decision` de `herramientas/datos/ajedrez-estudiantil-revisar.csv`.", ""]
        lineas += [f"- {r['inicio'][:4]} · [{r['nombre']}](https://chess-results.com/tnr{r['clave']}.aspx?lan=2)"
                   + (f" · {r['organizador']}" if r["organizador"] else "") + (f" · {r['lugar']}" if r["lugar"] else "")
                   + f" · {r['jugadores']} jugadores" for r in pendientes]
        lineas.append("")
    if nuevos:
        lineas += [f"**{len(nuevos)} torneo(s) nuevo(s):**", ""]
        lineas += [f"- {r['anio']} · {r['etapa']}" + (f" · {r['categoria']}" if r["categoria"] else "")
                   + (f" · {r['region']}" if r["region"] else "") + f" · [{r['nombre']}]({r['enlace']}) · {r['jugadores']} jugadores"
                   for r in nuevos]
        lineas.append("")
    if cambiados:
        lineas += [f"**{len(cambiados)} torneo(s) puesto(s) al día:**", ""]
        lineas += [f"- [{r['nombre']}]({r['enlace']}): " + ", ".join(f"{k} {v}" for k, v in c.items()) for r, c in cambiados]
    return "\n".join(lineas) + "\n"


def leer_revisar():
    if not os.path.exists(REVISAR):
        return []
    with open(REVISAR, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def main():
    with open(FUENTE, encoding="utf-8", newline="") as f:
        guardados = list(csv.DictReader(f))
    campos = list(guardados[0].keys())
    cr = ChessResults()
    recientes = cr.recientes()
    print(f"chess-results: {len(recientes)} torneos recientes de Costa Rica")
    anotados = leer_revisar()
    filas, nuevos, cambiados, por_revisar = actualizar(guardados, recientes, cr.titulo, {r["clave"] for r in anotados})
    print(f"nuevos: {len(nuevos)} · puestos al día: {len(cambiados)} · por revisar: {len(por_revisar)}")
    if por_revisar:
        anotados += [{**r, "visto": hoy_en_costa_rica(), "decision": ""} for r in por_revisar]
        with open(REVISAR, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=COLUMNAS_REVISAR)
            w.writeheader()
            w.writerows(sorted(anotados, key=lambda r: int(r["clave"])))
    if "--resumen" in sys.argv:
        with open(sys.argv[sys.argv.index("--resumen") + 1], "w", encoding="utf-8") as f:
            f.write(resumen(nuevos, cambiados, [r for r in anotados if not r["decision"]]))
    if not nuevos and not cambiados:
        return
    with open(FUENTE, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=campos)
        w.writeheader()
        w.writerows(filas)
    with open(FECHA, "w", encoding="utf-8") as f:
        f.write(hoy_en_costa_rica() + "\n")
    subprocess.run([sys.executable, os.path.join(RAIZ, "herramientas", "ajedrez-estudiantil.py")], check=True)


if __name__ == "__main__":
    main()
