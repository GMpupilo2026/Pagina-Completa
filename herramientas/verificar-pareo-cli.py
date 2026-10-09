#!/usr/bin/env python3
"""La línea de comandos de Pareo Integral (descargas/pareo-integral-cli.zip).

Es lo que van a bajar los probadores de FIDE: si el zip queda viejo o no
arranca, no da ningún error en el sitio, solo una mala primera impresión en la
prueba de aval. Ver «Pareo Integral» en docs/decisiones/juegos-y-torneos.md.

  1. El zip trae exactamente los archivos que dice herramientas/pareo-cli-empaquetar.py,
     y cada uno es IGUAL al del repositorio (se compara el contenido, no los
     bytes del zip: la compresión puede cambiar con la versión de zlib).
  2. Descomprimido, corre: empareja las pruebas del propio bbpPairings igual
     que lo esperado, genera un torneo, el comprobador lo da por bueno, la
     clasificación sale con sus desempates y coincide con js/pareo/desempates.js,
     y lo que no se ofrece (Burstein, un desempate que no existe) se rechaza
     con el código 3.

Necesita node.   python3 herramientas/verificar-pareo-cli.py
"""
import csv
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import zipfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIP = os.path.join(RAIZ, "descargas", "pareo-integral-cli.zip")
fallos = 0


def ok(cond, texto, detalle=""):
    global fallos
    if cond:
        print("  ✓ " + texto)
    else:
        fallos += 1
        print("  ✗ " + texto + (" — " + detalle if detalle else ""))


spec = importlib.util.spec_from_file_location("empaquetar", os.path.join(RAIZ, "herramientas", "pareo-cli-empaquetar.py"))
emp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(emp)

print("=== 1. El zip está al día ===")
if not os.path.exists(ZIP):
    ok(False, "descargas/pareo-integral-cli.zip existe", "corre: python3 herramientas/pareo-cli-empaquetar.py")
    sys.exit(1)
with zipfile.ZipFile(ZIP) as z:
    nombres = sorted(z.namelist())
    esperados = sorted([emp.CARPETA + "/pareo.js"] + [emp.CARPETA + "/" + d for d, _ in emp.ARCHIVOS])
    ok(nombres == esperados, f"trae los {len(esperados)} archivos del paquete y ninguno más",
       f"sobran {sorted(set(nombres) - set(esperados))}, faltan {sorted(set(esperados) - set(nombres))}")
    viejos = []
    for dentro, fuera in emp.ARCHIVOS:
        with open(os.path.join(RAIZ, fuera), "rb") as f:
            if emp.CARPETA + "/" + dentro in nombres and z.read(emp.CARPETA + "/" + dentro) != f.read():
                viejos.append(fuera)
    if emp.CARPETA + "/pareo.js" in nombres and z.read(emp.CARPETA + "/pareo.js") != emp.ENTRADA.encode("utf-8"):
        viejos.append("pareo.js")
    ok(not viejos, "cada archivo es igual al del repositorio",
       "desactualizados: " + ", ".join(viejos) + " — corre: python3 herramientas/pareo-cli-empaquetar.py")

print("=== 2. Descomprimido, corre ===")
with tempfile.TemporaryDirectory() as tmp:
    with zipfile.ZipFile(ZIP) as z:
        z.extractall(tmp)
    base = os.path.join(tmp, emp.CARPETA)

    def correr(*args):
        r = subprocess.run(["node", "pareo.js", *args], cwd=base, capture_output=True, text=True, timeout=300)
        return r.returncode, r.stdout, r.stderr

    c, out, _ = correr("--version")
    ok(c == 0 and "bbpPairings" in out and "C.07:2026" in out, "--version dice el motor y los reglamentos", out.strip())
    c, out, _ = correr("--help")
    ok(c == 0 and "--dutch" in out and "Uso" in out and "Usage" in out, "--help, en inglés y en español")

    pruebas = os.path.join(RAIZ, "herramientas", "datos", "pareo-motor")
    for f in sorted(x for x in os.listdir(pruebas) if x.endswith(".trf")):
        nombre = f[:-4]
        salida = os.path.join(tmp, nombre + ".out")
        c, _, err = correr("--dutch", os.path.join(pruebas, f), "-p", salida)
        with open(os.path.join(pruebas, nombre + ".esperado"), "rb") as e:
            esperado = e.read()
        tiene = open(salida, "rb").read() if os.path.exists(salida) else b""
        ok(c == 0 and tiene == esperado, f"-p empareja {nombre} como lo espera bbpPairings", err.strip()[:200])

    azar = os.path.join(tmp, "azar.trf")
    c, _, err = correr("--dutch", "-g", "-o", azar, "-s", "2026")
    ok(c == 0 and os.path.exists(azar), "-g arma un torneo al azar", err.strip()[:200])
    c, out, err = correr("--dutch", azar, "-c")
    sobra = [l for l in out.splitlines() if l.strip() and "Round #" not in l]
    ok(c == 0 and not sobra and "Round #" in out, "-c lo da por bueno, ronda por ronda", (sobra or [err])[:3])

    c, out, err = correr("standings", azar, "--tiebreaks", "BH-C1,SB,TPR", "--csv")
    filas = list(csv.reader(io.StringIO(out)))
    ok(c == 0 and filas and filas[0][-3:] == ["BH-C1", "SB", "TPR"] and len(filas) > 10,
       "standings --csv, con las columnas de los desempates pedidos", err.strip()[:200])
    # Los mismos números que da js/pareo/desempates.js con el mismo TRF.
    js = (
        "const T=require(process.argv[1]+'/js/pareo/torneo.js'),D=require(process.argv[1]+'/js/pareo/desempates.js');"
        "const t=T.deTrf(require('fs').readFileSync(process.argv[2],'utf8'));"
        "console.log(JSON.stringify(D.clasificacion(t,['BH-C1','SB','TPR']).map(f=>[f.puesto,f.puntos,f.valores['BH-C1'],f.valores.SB,f.valores.TPR])))"
    )
    r = subprocess.run(["node", "-e", js, RAIZ, azar], capture_output=True, text=True, timeout=120)
    ref = json.loads(r.stdout or "[]")
    cli = [[int(x[0]), float(x[5]), float(x[6]), float(x[7]), float(x[8])] for x in filas[1:]]
    ok(len(ref) == len(cli) and all(abs(a - b) < 0.006 for fa, fb in zip(ref, cli) for a, b in zip(fa, fb)),
       "y los números son los de js/pareo/desempates.js")
    c, out, _ = correr("standings", azar, "--lang", "es")
    ok(c == 0 and out.startswith("Puesto"), "standings --lang es, en español")

    c, _, err = correr("--burstein", azar, "-p")
    ok(c == 3 and "Holandés" in err, "--burstein se rechaza (FIDE no lo avaló en bbpPairings)")
    c, _, err = correr("standings", azar, "--tiebreaks", "BH,XYZ")
    ok(c == 3 and "XYZ" in err, "un desempate que no existe se rechaza")

print(f"\n{fallos} comprobaciones fallaron" if fallos else "\nTodo bien")
sys.exit(1 if fallos else 0)
