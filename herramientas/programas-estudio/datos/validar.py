"""Valida un grado-N.json. Uso: python3 validar.py grado-1.json"""
import json, re, sys

HAB = {"Pensamiento sistémico", "Pensamiento crítico", "Aprender a aprender", "Resolución de problemas",
       "Creatividad e innovación", "Ciudadanía global y local", "Responsabilidad personal y social",
       "Estilos de vida saludables", "Vida y carrera", "Colaboración", "Comunicación",
       "Apropiación de tecnologías digitales", "Manejo de la información"}
EJES = {"Cultura ambiental para el desarrollo sostenible", "Educación integral de la sexualidad",
        "Educación para la salud", "Vivencia de los derechos humanos para la democracia y la paz"}
VOSEO = r"\b(podés|tenés|mové|jugá|hacé|sabés|querés|vos|decí|mirá|fijate|pensá|elegí|colocá|anotá|contá|buscá|tomá|ponés|sos)\b"
PROHIBIDAS = ["—", "es importante destacar", "cabe mencionar", "en este sentido", "sin duda", "fascinante",
              "emocionante viaje", "mundo del ajedrez", "potenciar", "empoderar", "lúdica y significativa", "¡"]

err = []
g = json.load(open(sys.argv[1], encoding="utf-8"))
texto = json.dumps(g, ensure_ascii=False)
for m in re.finditer(VOSEO, texto, re.I):
    err.append(f"voseo: {texto[max(0, m.start()-40):m.end()+20]}")
for p in PROHIBIDAS:
    n = texto.lower().count(p.lower())
    if n:
        err.append(f"prohibida «{p}» x{n}")
if re.search(r"[\U0001F300-\U0001FAFF☀-➿]", texto):
    err.append("hay emojis")
U = g["unidades"]
if len(U) != 6: err.append("no hay 6 unidades")
rango = {}
fin = 0
for u in U:
    a, b = u["dias"]
    if a != fin + 1: err.append(f"unidad {u['n']} empieza en {a}, esperaba {fin+1}")
    fin = b
    for d in range(a, b + 1): rango[d] = u["n"]
    if u["eje"] not in EJES: err.append(f"eje raro en U{u['n']}: {u['eje']}")
    if not 3 <= len(u["aprendizajes"]) <= 4: err.append(f"U{u['n']} tiene {len(u['aprendizajes'])} aprendizajes")
    for ae in u["aprendizajes"]:
        if ae["habilidad"] not in HAB: err.append(f"habilidad rara: {ae['habilidad']}")
        for k in ("inicial", "intermedio", "avanzado"):
            if not ae["niveles"].get(k): err.append(f"falta nivel {k}")
if fin != 200: err.append(f"las unidades terminan en {fin}")
if U[2]["dias"][1] != 100: err.append("la unidad 3 no termina en el día 100")
D = g["dias"]
if len(D) != 200: err.append(f"{len(D)} días")
palabras = []
flex = tareas = 0
for i, d in enumerate(D, 1):
    if d["d"] != i: err.append(f"día {d['d']} en la posición {i}")
    if rango.get(i) != d["u"]: err.append(f"día {i}: u={d['u']} pero el rango dice {rango.get(i)}")
    un, k = d["ae"].split(".")
    if int(un) != d["u"] or not 1 <= int(k) <= len(U[d["u"] - 1]["aprendizajes"]): err.append(f"día {i}: ae {d['ae']} no existe")
    if d["eval"]["tipo"] not in ("Diagnóstica", "Formativa", "Sumativa"): err.append(f"día {i}: tipo {d['eval']['tipo']}")
    for c in ("tema", "objetivo", "foc", "exp", "con", "apl", "mat"):
        if not d.get(c): err.append(f"día {i}: falta {c}")
    if d.get("flex"):
        flex += 1
        if d["eval"]["tipo"] == "Sumativa": err.append(f"día {i}: flex con sumativa")
    if d.get("tarea"): tareas += 1
    palabras.append(len(" ".join(str(v) for k, v in d.items() if isinstance(v, str)).split()) + len(d["eval"]["como"].split()))
for i in (1, 2, 3):
    if D[i-1]["eval"]["tipo"] != "Diagnóstica": err.append(f"día {i} no es diagnóstico")
temas = [d["tema"] for d in D]
rep = {t for t in temas if temas.count(t) > 1}
if rep: err.append(f"temas repetidos idénticos: {list(rep)[:5]}")
print(f"palabras por día: mín {min(palabras)}, media {sum(palabras)//len(palabras)}, máx {max(palabras)}; flex {flex}; tareas {tareas}")
print("\n".join(err) if err else "OK")
