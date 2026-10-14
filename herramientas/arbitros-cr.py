#!/usr/bin/env python3
"""Arma la carga de la herramienta «Árbitros de Costa Rica en FIDE»
(arbitros-cr.html): las tablas arbitros_cr, arbitros_cr_torneos y
arbitros_cr_cargos (migración 20261014162543_arbitros_cr.sql), que solo lee
quien tiene la licencia.

La fuente es herramientas/datos/arbitros-cr-fide.json: lo leído de
ratings.fide.com, ya resumido por herramientas/arbitros-cr/exportar.sql
(cada torneo de Costa Rica con su ficha, sus jugadores con Elo y sus
árbitros; y el perfil de cada árbitro de Costa Rica, con su título y los
torneos que arbitró afuera). Los títulos de los jugadores salen de
herramientas/datos/arbitros-cr-titulos.json (la lista de FIDE; ver
herramientas/oscar-angulo-fide-titulos.py). Las normas se evalúan con
herramientas/normas_arbitro.py, la misma copia que usa la página de Oscar
Angulo.

    python3 herramientas/arbitros-cr.py               escribe herramientas/arbitros-cr/carga-*.sql
    python3 herramientas/arbitros-cr.py --resumen     solo cuenta
    python3 herramientas/arbitros-cr.py --huella      la huella que debe dar la base y la consulta que la saca

Las cargas se corren en la base en orden (borran y vuelven a llenar las tres
tablas). Ver «Árbitros de Costa Rica en FIDE» en
docs/decisiones/juegos-y-torneos.md.
"""
import base64
import hashlib
import html
import json
import os
import re
import unicodedata
import sys
from collections import Counter

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "herramientas"))
from normas_arbitro import PAISES, TITULADOS, evaluar, valorado  # noqa: E402

FUENTE = os.path.join(RAIZ, "herramientas", "datos", "arbitros-cr-fide.json")
TITULOS = os.path.join(RAIZ, "herramientas", "datos", "arbitros-cr-titulos.json")
# El título de árbitro de cada uno, del perfil de FIDE (la lista de jugadores
# no lo trae): lo arma herramientas/arbitros-cr/perfiles.sql.
PERFILES = os.path.join(RAIZ, "herramientas", "datos", "arbitros-cr-perfiles.json")
# Los torneos de la federación de Costa Rica en chess-results (el buscador,
# año por año) con sus columnas de quién hizo qué, y los perfiles de FIDE de
# los ID que aparecen ahí y no están entre los árbitros de FIDE (para saber
# su nombre y si son de Costa Rica). Ver «Árbitros de Costa Rica en
# chess-results» en docs/decisiones/juegos-y-torneos.md.
CHESS_RESULTS = os.path.join(RAIZ, "herramientas", "datos", "arbitros-cr-chess-results.json")
PERFILES_CR = os.path.join(RAIZ, "herramientas", "datos", "arbitros-cr-perfiles-chess-results.json")
# Las columnas del buscador y su código en arbitros_cr_cr_cargos.
ROLES_CR = {"principal": "ap", "adjunto": "adj", "arbitros": "arb", "director": "dir", "organizador": "org"}
# Las respuestas del buscador en net._http_response de la descarga que armó
# arbitros-cr-chess-results.json (pg_net las borra a las seis horas): los
# torneos de chess-results se insertan desde ahí, en la base, sin pasar su
# texto por la conversación. Otra descarga cambia estos números.
RESPUESTAS_CR = (17486, 17514)
CARPETA = os.path.join(RAIZ, "herramientas", "arbitros-cr")
# Los cargos de la ficha de FIDE. Para una norma valen el principal, el
# adjunto y el árbitro; el asistente no (B.06.1, 2.4.4) y el de pareos queda
# para revisar (el reglamento no lo nombra). «Deputy Arbiter» y «Sector
# Arbiter», que FIDE también usa, son árbitros del torneo: van como «Arbiter»
# (cuentan igual) y no se les supone un cargo más alto.
CARGOS = {"Chief Arbiter": "Chief", "Deputy Chief Arbiter": "Dep. Chief", "Arbiter": "Arbiter",
          "Deputy Arbiter": "Arbiter", "Sector Arbiter": "Arbiter",
          "Pairings Arbiter": "Pairings", "Assistant Arbiter": "Assistant"}
# Del más alto al más bajo: vale el primero que tenga.
TITULO_ARBITRO = {"International Arbiter": "IA", "FIDE Arbiter": "FA", "National Arbiter": "AN"}
TITULO_ES = {"International Arbiter": "Árbitro Internacional", "FIDE Arbiter": "Árbitro FIDE",
             "National Arbiter": "Árbitro Nacional"}
# Archivos chicos (unos 20 KB): cada uno se corre pegado entero en
# execute_sql, y uno de 130 KB no pasaba por la conversación.
FILAS_POR_CARGA = 60
CARGOS_POR_CARGA = 450


def sql(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def texto_cifrado(v):
    """El nombre de un torneo va en base64: muchos son títulos de libros
    («Cien años de soledad», «Crónica de una muerte anunciada»…) y, escritos
    tal cual, la carga se cortaba al pasarla por la conversación."""
    return "convert_from(decode('" + base64.b64encode(v.encode()).decode() + "', 'base64'), 'UTF8')"


def torneo(e, titulos):
    """Lo que pide evaluar() de un torneo, como en oscar-angulo-fide.py."""
    rep = e.get("conElo") or []
    tit = [titulos.get(j["fid"], ["", ""]) for j in rep]
    ritmo = e["ritmo"] or (e["control"] or "").split(":")[0].strip()
    return {
        "id": e["id"], "nombre": e["nombre"], "ciudad": e["ciudad"] or "", "pais": PAISES.get(e["pais"], e["pais"] or ""),
        "inicio": e["inicio"], "fin": e["fin"],
        "sistema": e["sistema"] if e["sistema"] in ("s", "r", "d", "t", "k") else "",
        "ritmo": ritmo if ritmo in ("Standard", "Rapid", "Blitz") else "",
        "hibrido": e["hibrido"], "jugadores": max(e["jugadores"] or 0, len(rep)), "conElo": len(rep),
        "contados": sum(1 for j in rep if j["ausencias"] <= 1),
        "rondas": e["rondas"] or 0, "federaciones": sorted({j["fed"] for j in rep if j["fed"]}),
        "titulados": sum(1 for a, b in tit if a in TITULADOS or b in TITULADOS),
        "maestros": sum(1 for a, b in tit if a in ("GM", "IM")),
        "maestrasYMaestros": sum(1 for a, b in tit if a in ("GM", "IM") or b in ("WGM", "WIM")),
        # En la herramienta todos figuran como árbitros: el cargo de cada uno
        # se mira aparte (arbitros_cr_cargos).
        "cargos": ["Chief"], "valorado": valorado(e["valorado"]), "conReporte": e["tieneReporte"],
    }


def sin_rondas(t):
    """Sin el reporte ronda a ronda (FIDE no lo publica de muchos torneos
    viejos, y no se pidió de los que no podían valer) no se sabe cuántas
    rondas tuvo: no son «0 rondas». Si con 9 valdría, queda para revisar;
    si no, el «no» es por otra cosa y se dice sin nombrar las rondas."""
    con_cero, con_nueve = evaluar(t), evaluar(dict(t, rondas=9))
    salida = []
    for cero, nueve in zip(con_cero, con_nueve):
        if nueve["estado"] != "no":
            salida.append({"estado": "revisar", "detalle": "FIDE no publica cuántas rondas tuvo; si fueron las que pide: " + nueve["detalle"]})
            continue
        d = re.sub(r"0 rondas \(pide [^)]*\)(; )?", "", cero["detalle"])
        d = d.replace("internacional de 0 rondas:", "internacional (FIDE no publica cuántas rondas tuvo):")
        d = re.sub(r"\(tiene (\d+) y 0\)", r"(tiene \1; las rondas, FIDE no las publica)", d).strip("; ")
        salida.append({"estado": "no", "detalle": d or "FIDE no publica cuántas rondas tuvo"})
    return tuple(salida)


def sin_tildes(s):
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


# Lo que no es parte de un nombre en una celda de chess-results: títulos
# («IA.», «FA», «AN», «NA», «AI», «AF», «Lic.»…).
NO_ES_NOMBRE = {"ia", "fa", "an", "na", "ai", "af", "io", "ao", "oi", "lic", "licda", "dr", "msc", "prof", "wfm", "fm", "cm", "im", "gm"}


def palabras(s):
    return [w for w in re.findall(r"[a-z]+", sin_tildes(html.unescape(s))) if w not in NO_ES_NOMBRE]


def formas_del_nombre(nombre):
    """Las formas en que se escribe a alguien en una celda, como expresiones
    sobre las palabras sin tildes: «Apellido1 Apellido2, Nombre», «Nombre
    [segundo] Apellido1» y, si no tiene segundo apellido, «Apellido, Nombre»."""
    ap, _, no = nombre.partition(",")
    a, n = palabras(ap), palabras(no)
    if not a or not n:
        return []
    formas = [r"\b" + " ".join(a) + r" " + n[0] + r"\b", r"\b" + n[0] + r"(?: [a-z]+)? " + a[0] + r"\b"]
    if len(a) > 1:
        formas.append(r"\b" + a[0] + " " + a[1] + r" " + n[0] + r"\b")
    formas.append(r"\b" + a[0] + " " + n[0] + r"\b")  # «Angulo Oscar»
    return [re.compile(f) for f in formas]


def armar_chess_results(arbitros):
    """Los torneos de chess-results y quién fue qué en cada uno. Se reconoce a
    una persona en una celda por su ID FIDE (solo si al lado está su primer
    apellido: hay ID mal escritos, como 6500189 por 6508189) o por su nombre
    (formas_del_nombre). Suma a `arbitros` las personas de Costa Rica que
    figuran con su ID y no estaban (su perfil de FIDE dice nombre y país)."""
    if not os.path.exists(CHESS_RESULTS):
        return {}, set()
    with open(CHESS_RESULTS, encoding="utf-8") as f:
        fuente = json.load(f)
    perfiles = {}
    if os.path.exists(PERFILES_CR):
        with open(PERFILES_CR, encoding="utf-8") as f:
            perfiles = {p["fid"]: p for p in json.load(f)["perfiles"]}
    texto = lambda celda: " ".join(palabras(celda))
    # Primero, los de Costa Rica que figuran con su ID y no estaban.
    for t in fuente["torneos"]:
        for col in ROLES_CR:
            for fid in re.findall(r"\b(\d{5,8})\b", t[col]):
                p = perfiles.get(fid)
                if fid in arbitros or not p or p.get("pais") != "cr" or not p.get("nombre"):
                    continue
                ap = palabras(p["nombre"].partition(",")[0])
                if ap and ap[0] in texto(t[col]).split():
                    arbitros[fid] = {"nombre": p["nombre"], "titulo": TITULO_ARBITRO.get(p.get("titulo") or "", ""),
                                     "detalle": p.get("detalle") or "", "solo_cr": True}
    formas = {fid: formas_del_nombre(a["nombre"]) for fid, a in arbitros.items()}
    primer_apellido = {fid: (palabras(a["nombre"].partition(",")[0]) or [""])[0] for fid, a in arbitros.items()}
    torneos, cargos = {}, set()
    for t in fuente["torneos"]:
        clave = int(t["clave"])
        for col, rol in ROLES_CR.items():
            celda = t[col]
            if not celda:
                continue
            plano = texto(celda)
            quienes = {fid for fid in re.findall(r"\b(\d{5,8})\b", celda) if fid in arbitros and primer_apellido[fid] in plano.split()}
            quienes |= {fid for fid, fs in formas.items() if any(f.search(plano) for f in fs)}
            for fid in quienes:
                cargos.add((clave, fid, rol))
        torneos[clave] = {
            "clave": clave, "nombre": html.unescape(t["nombre"]).strip() or "(sin nombre)",
            "inicio": t["inicio"].replace("/", "-"), "fin": (t["fin"] or "").replace("/", "-") or None,
            "lugar": html.unescape(t["lugar"]).strip()[:200], "control": html.unescape(t["control"]).strip()[:200],
            "rondas": int(t["rondas"]) if t["rondas"].isdigit() else 0,
            "jugadores": int(t["jugadores"]) if t["jugadores"].isdigit() else 0,
        }
    usados = {c for c, _, _ in cargos}
    return {k: v for k, v in torneos.items() if k in usados}, cargos


def armar():
    with open(FUENTE, encoding="utf-8") as f:
        fuente = json.load(f)
    with open(TITULOS, encoding="utf-8") as f:
        titulos = json.load(f)
    torneos, cargos, arbitros = {}, set(), {}
    for e in fuente["torneos"]:
        if not e.get("inicio") or not e.get("nombre"):
            continue
        t = torneo(e, titulos)
        t["af"], t["ai"] = evaluar(t)
        if not t["rondas"]:
            t["af"], t["ai"] = sin_rondas(t)
        torneos[t["id"]] = t
        for a in e.get("arbitros") or []:
            if a["fed"] != "CRC" or a["cargo"] not in CARGOS:
                continue
            arbitros.setdefault(a["fid"], {"nombre": a["nombre"], "titulo": "", "detalle": ""})
            cargos.add((t["id"], a["fid"], CARGOS[a["cargo"]]))
    perfiles = []
    if os.path.exists(PERFILES):
        with open(PERFILES, encoding="utf-8") as f:
            perfiles = json.load(f)["perfiles"]
    for p in perfiles:
        a = arbitros.get(p["fid"])
        if not a:
            continue
        tit = {t: anio for t, anio in p.get("titulos") or []}
        a["titulo"] = next((TITULO_ARBITRO[t] for t in TITULO_ARBITRO if t in tit), "")
        partes = [f"{TITULO_ES[t]} ({tit[t]})" for t in reversed(list(TITULO_ARBITRO)) if t in tit]
        if p.get("categoria"):
            partes.append(f"categoría {p['categoria']}")
        a["detalle"] = ", ".join(partes)
    return fuente, torneos, cargos, arbitros


def cargas(torneos, cargos, arbitros, cr_torneos=(), cr_cargos=()):
    lineas = ["begin;",
              "delete from public.arbitros_cr_cr_cargos;",
              "delete from public.arbitros_cr_cr;",
              "delete from public.arbitros_cr_cargos;",
              "delete from public.arbitros_cr_torneos;",
              "delete from public.arbitros_cr;"]
    filas = [f"({sql(int(fid))}, {sql(a['nombre'])}, 'CRC', {sql(a['titulo'])}, {sql(a['detalle'])}, {sql(bool(a.get('solo_cr')))})"
             for fid, a in sorted(arbitros.items(), key=lambda x: int(x[0]))]
    bloques = [lineas + [f"insert into public.arbitros_cr (fide_id, nombre, federacion, titulo, titulo_detalle, solo_chess_results) values\n  "
                         + ",\n  ".join(filas)
                         + "\non conflict (fide_id) do update set nombre = excluded.nombre, titulo = excluded.titulo, titulo_detalle = excluded.titulo_detalle,"
                         + " solo_chess_results = excluded.solo_chess_results;"]]
    filas = []
    for t in sorted(torneos.values(), key=lambda t: t["id"]):
        filas.append("(" + sql(t["id"]) + ", " + texto_cifrado(t["nombre"]) + ", " + ", ".join(sql(v) for v in (
            t["ciudad"], t["pais"], t["inicio"], t["fin"], t["sistema"], t["ritmo"],
            t["jugadores"], t["conElo"], t["contados"], t["rondas"], len(t["federaciones"]), t["valorado"],
            t["af"]["estado"], t["af"]["detalle"][:400], t["ai"]["estado"], t["ai"]["detalle"][:400])) + ")")
    columnas = ("id, nombre, ciudad, pais, inicio, fin, sistema, ritmo, jugadores, con_elo, contados, rondas, "
                "federaciones, valorado, af_estado, af_detalle, ai_estado, ai_detalle")
    for i in range(0, len(filas), FILAS_POR_CARGA):
        # Si el torneo ya está, se reescribe: así la carga sirve también para
        # corregir lo ya cargado sin borrar nada.
        bloques.append([f"insert into public.arbitros_cr_torneos ({columnas}) values\n  " + ",\n  ".join(filas[i:i + FILAS_POR_CARGA])
                        + "\non conflict (id) do update set " + ", ".join(f"{c} = excluded.{c}" for c in columnas.split(", ")[1:]) + ";"])
    filas = [f"({t}, {int(f)}, {sql(c)})" for t, f, c in sorted(cargos, key=lambda x: (x[0], int(x[1]), x[2]))]
    for i in range(0, len(filas), CARGOS_POR_CARGA):
        bloques.append([f"insert into public.arbitros_cr_cargos (torneo_id, fide_id, cargo) values\n  " + ",\n  ".join(filas[i:i + CARGOS_POR_CARGA])
                        + "\non conflict do nothing;"])
    if cr_torneos:
        bloques.append(["-- Lee las respuestas del buscador de chess-results que siguen en net._http_response (RESPUESTAS_CR).",
                        cr_torneos_sql(cr_torneos)])
    filas = [f"({c}, {int(f)}, {sql(r)})" for c, f, r in sorted(cr_cargos, key=lambda x: (x[0], int(x[1]), x[2]))]
    for i in range(0, len(filas), CARGOS_POR_CARGA):
        bloques.append([f"insert into public.arbitros_cr_cr_cargos (clave, fide_id, rol) values\n  " + ",\n  ".join(filas[i:i + CARGOS_POR_CARGA])
                        + "\non conflict do nothing;"])
    bloques[-1].append("commit;")
    return bloques


def limpiar_sql(x):
    """Una celda de chess-results limpia, en SQL: sin etiquetas, con las
    entidades de letras y puntuación traducidas (las de emojis y símbolos de
    piezas, fuera) y los espacios juntos."""
    num = (f"coalesce((select string_agg(case when m[1] is not null then case when m[1]::int between 32 and 8999 then chr(m[1]::int) else '' end "
           f"when m[2] is not null then '' else m[3] end, '' order by o) from regexp_matches(regexp_replace({x}, '<[^>]+>', '', 'g'), "
           f"'&#(\\d+);|&#x([0-9A-Fa-f]+);|([^&]+|&)', 'g') with ordinality r(m, o)), '')")
    for ent, letra in (("&quot;", '"'), ("&#39;", "''"), ("&uuml;", "ü"), ("&Ouml;", "Ö"), ("&copy;", "©"), ("&lt;", "<"), ("&gt;", ">"), ("&nbsp;", " "), ("&amp;", "&")):
        num = f"replace({num}, '{ent}', '{letra}')"
    return f"btrim(regexp_replace(replace({num}, chr(160), ' '), '\\s+', ' ', 'g'))"


def cr_torneos_sql(claves):
    """Inserta los torneos de chess-results que tienen algún árbitro de Costa
    Rica, leyéndolos de las respuestas del buscador que siguen en la base."""
    return f"""with r as (select id, substr(content, strpos(content, '<table class="CRs2"')) t from net._http_response
  where id between {RESPUESTAS_CR[0]} and {RESPUESTAS_CR[1]} and strpos(content, '<table class="CRs2"') > 0),
filas as (select f from r, regexp_split_to_table(substr(t, 1, strpos(t, '</table>')), '<tr class="CR') f where f ~ '^n?g[12]">'),
celdas as (select regexp_split_to_array(f, '</t[dh]>') c from filas),
t as (select distinct on (btrim(regexp_replace(c[19], '<[^>]+>', '', 'g'))::int) btrim(regexp_replace(c[19], '<[^>]+>', '', 'g'))::int clave, c from celdas
  where btrim(regexp_replace(c[19], '<[^>]+>', '', 'g')) ~ '^\\d+$')
insert into public.arbitros_cr_cr (clave, nombre, inicio, fin, lugar, control, rondas, jugadores)
select clave, coalesce(nullif({limpiar_sql("c[2]")}, ''), '(sin nombre)'),
  replace(btrim(regexp_replace(c[6], '<[^>]+>', '', 'g')), '/', '-')::date,
  nullif(replace(btrim(regexp_replace(c[7], '<[^>]+>', '', 'g')), '/', '-'), '')::date,
  left({limpiar_sql("c[13]")}, 200), left({limpiar_sql("c[14]")}, 200),
  coalesce(nullif(btrim(regexp_replace(c[17], '<[^>]+>', '', 'g')), '')::smallint, 0),
  coalesce(nullif(btrim(regexp_replace(c[18], '<[^>]+>', '', 'g')), '')::int, 0)
from t where clave = any('{{{",".join(str(c) for c in sorted(claves))}}}'::int[])
on conflict (clave) do update set nombre = excluded.nombre, inicio = excluded.inicio, fin = excluded.fin, lugar = excluded.lugar,
  control = excluded.control, rondas = excluded.rondas, jugadores = excluded.jugadores;"""


HUELLA_SQL = """select (select md5(string_agg(concat_ws('|', id, nombre, ciudad, pais, inicio, fin, sistema, ritmo, jugadores, con_elo,
  contados, rondas, federaciones, valorado, af_estado, af_detalle, ai_estado, ai_detalle), E'\\n' order by id)) from public.arbitros_cr_torneos) torneos,
  (select md5(string_agg(concat_ws('|', torneo_id, fide_id, cargo), E'\\n' order by torneo_id, fide_id, cargo)) from public.arbitros_cr_cargos) cargos,
  (select md5(string_agg(concat_ws('|', fide_id, nombre, titulo, titulo_detalle, solo_chess_results), E'\\n' order by fide_id)) from public.arbitros_cr) arbitros,
  (select md5(string_agg(concat_ws('|', clave, inicio, fin, rondas, jugadores), E'\\n' order by clave)) from public.arbitros_cr_cr) cr_torneos,
  (select md5(string_agg(concat_ws('|', clave, fide_id, rol), E'\\n' order by clave, fide_id, rol)) from public.arbitros_cr_cr_cargos) cr_cargos;"""


def huellas(torneos, cargos, arbitros, cr_torneos=None, cr_cargos=()):
    """Lo mismo que HUELLA_SQL, para comprobar que la base quedó igual a las
    cargas (concat_ws se salta los nulos, como acá)."""
    md5 = lambda filas: hashlib.md5("\n".join(filas).encode()).hexdigest()
    col = lambda *v: "|".join(str(x) for x in v if x is not None)
    t = [col(t["id"], t["nombre"], t["ciudad"], t["pais"], t["inicio"], t["fin"], t["sistema"], t["ritmo"], t["jugadores"],
             t["conElo"], t["contados"], t["rondas"], len(t["federaciones"]), t["valorado"], t["af"]["estado"],
             t["af"]["detalle"][:400], t["ai"]["estado"], t["ai"]["detalle"][:400]) for t in sorted(torneos.values(), key=lambda t: t["id"])]
    c = [col(a, int(b), c) for a, b, c in sorted(cargos, key=lambda x: (x[0], int(x[1]), x[2]))]
    a = [col(int(f), x["nombre"], x["titulo"], x["detalle"], "true" if x.get("solo_cr") else "false")
         for f, x in sorted(arbitros.items(), key=lambda x: int(x[0]))]
    # De los torneos de chess-results, solo números y fechas: el texto lo
    # escribe la base misma desde las respuestas del buscador.
    ct = [col(k, v["inicio"], v["fin"], v["rondas"], v["jugadores"]) for k, v in sorted((cr_torneos or {}).items())]
    cc = [col(a, int(b), c) for a, b, c in sorted(cr_cargos, key=lambda x: (x[0], int(x[1]), x[2]))]
    return {"torneos": md5(t), "cargos": md5(c), "arbitros": md5(a), "cr_torneos": md5(ct), "cr_cargos": md5(cc)}


def main():
    fuente, torneos, cargos, arbitros = armar()
    cr_torneos, cr_cargos = armar_chess_results(arbitros)
    con_cargo = {t for t, _, _ in cargos}
    print(f"{len(arbitros)} árbitros de Costa Rica, {len(torneos)} torneos ({len(con_cargo)} con algún árbitro de Costa Rica), {len(cargos)} cargos.")
    print("AF:", dict(Counter(t["af"]["estado"] for t in torneos.values())), " AI:", dict(Counter(t["ai"]["estado"] for t in torneos.values())))
    print(f"chess-results: {len(cr_torneos)} torneos con algún árbitro de Costa Rica, {len(cr_cargos)} cargos, "
          f"{len({f for _, f, _ in cr_cargos})} árbitros ({sum(1 for a in arbitros.values() if a.get('solo_cr'))} que solo están ahí).")
    if "--resumen" in sys.argv:
        return
    if "--huella" in sys.argv:
        print("Lo que debe dar en la base:", huellas(torneos, cargos, arbitros, cr_torneos, cr_cargos))
        print(HUELLA_SQL)
        return
    os.makedirs(CARPETA, exist_ok=True)
    for viejo in os.listdir(CARPETA):
        if viejo.startswith("carga-") and viejo.endswith(".sql"):
            os.remove(os.path.join(CARPETA, viejo))
    bloques = cargas(torneos, cargos, arbitros, cr_torneos, cr_cargos)
    # Todo en una transacción: las cargas se corren seguidas en la misma
    # conexión no se puede desde execute_sql, así que cada archivo es una
    # unidad y el primero borra. Se corren en orden; si una falla, se vuelve
    # a correr desde la primera.
    bloques[0] = [l for l in bloques[0] if l != "begin;"]
    bloques[-1] = [l for l in bloques[-1] if l != "commit;"]
    for i, b in enumerate(bloques, start=1):
        with open(os.path.join(CARPETA, f"carga-{i:02d}.sql"), "w", encoding="utf-8") as f:
            f.write(f"-- Carga {i} de {len(bloques)} de la herramienta arbitros-cr. La arma herramientas/arbitros-cr.py: no se edita a mano.\n")
            f.write("\n".join(b) + "\n")
    print(f"{len(bloques)} archivos en {os.path.relpath(CARPETA, RAIZ)}/")


if __name__ == "__main__":
    main()
