#!/usr/bin/env python3
"""TEMPORAL: busca en chess-results los torneos JDN que faltan en
herramientas/jdn-comites/torneos.txt (la final 2018, la eliminatoria 2019, la
final 2021…), por si se subieron con otro nombre. Lo corre un flujo temporal
en la rama del PR; se borra antes de mergear. Usa el mismo buscador que
ajedrez-estudiantil-actualizar.py: una búsqueda por cada nombre, Costa Rica.
"""
import importlib.util, os, re, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("act", os.path.join(RAIZ, "herramientas", "ajedrez-estudiantil-actualizar.py"))
act = importlib.util.module_from_spec(spec); spec.loader.exec_module(act)

conocidos = set(re.findall(r"\d{5,}", open(os.path.join(RAIZ, "herramientas", "jdn-comites", "torneos.txt")).read().split("\n\n", 1)[1]))
cr = act.ChessResults()
url, pagina = cr.pedir(act.BUSCADOR)
vistos = {}
for texto in ["JDN", "Juegos Nacionales", "Juegos Deportivos Nacionales", "Juegos Deportivos", "Eliminatoria", "Final Nacional", "ICODER", "Nacionales"]:
    url, pagina = cr.pedir(act.BUSCADOR)
    datos = act.campos_ocultos(pagina)
    datos.update({
        "ctl00$P1$txt_leiter": "", "ctl00$P1$combo_art": "5", "ctl00$P1$combo_sort": "1",
        "ctl00$P1$combo_land": "CRC", "ctl00$P1$combo_bedenkzeit": "0", "ctl00$P1$combo_anzahl_zeilen": "1",
        "ctl00$P1$txt_tnr": "", "ctl00$P1$txt_bez": texto, "ctl00$P1$txt_veranstalter": "",
        "ctl00$P1$txt_Hauptschiedsrichter": "", "ctl00$P1$txt_Schiedsrichter": "", "ctl00$P1$txt_ort": "",
        "ctl00$P1$txt_von_tag": "", "ctl00$P1$txt_bis_tag": "", "ctl00$P1$txt_eventid": "",
        "ctl00$P1$cb_suchen": "Buscar",
    })
    _, resultado = cr.pedir(url, datos)
    filas = act.leer_filas(resultado)
    print(f"== «{texto}»: {len(filas)} torneos")
    for f in filas:
        vistos.setdefault(f["clave"], f)

print(f"\n== {len(vistos)} distintos; los que NO están en torneos.txt:")
for f in sorted(vistos.values(), key=lambda f: (f["inicio"], int(f["clave"]))):
    if f["clave"] not in conocidos:
        print(f'NUEVO|{f["clave"]}|{f["inicio"]}|{f["nombre"]}|{f["organizador"]}|{f["lugar"]}|{f["rondas"]}|{f["jugadores"]}')
