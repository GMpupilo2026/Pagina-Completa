#!/usr/bin/env python3
"""Saca de los informes de la Comisión de Árbitros al Consejo de FIDE
(Reporting/AAAAQnCouncilARBReport.pdf, desde 2020Q2: los de antes eran
informes al Presidential Board, con otro nombre) todas las
solicitudes de título de Árbitro Internacional, de todos los países: nombre,
federación, ID FIDE, los torneos tal como los lista el informe y el veredicto
con su motivo. Escribe herramientas/datos/fide-solicitudes-ia.json.

Para qué: ver si alguien mandó una norma de un torneo jugado entre el
«License level» de su AF y su «Licensed» (como Meza; ver «La fecha oficial
del título: la del perfil de FIDE» en docs/decisiones/juegos-y-torneos.md).
Eso solo se puede mirar en quien sigue siendo AF: al aprobarle el AI, el
perfil de FIDE borra las fechas del AF. Por eso el JSON trae aparte
«siguen_af»: quienes tuvieron una solicitud rechazada y ninguna aprobada.

Los informes se piden desde la base con pg_net, convertidos a texto por
r.jina.ai (`https://r.jina.ai/https://arbiters.fide.com/wp-content/uploads/Reporting/2025Q1CouncilARBReport.pdf`),
y se guarda cada respuesta tal cual en una carpeta, un archivo AAAAQn.txt
por informe:

    python3 herramientas/arbitros-cr/solicitudes-ia.py CARPETA

En cada informe, el apéndice de AI («Summaries of IA Title Applications»;
en 2020, «International Arbiter Title Applications») va antes del de AF; cada solicitud empieza con «Nombre FED ID#número» y el veredicto
(APPROVED o REJECTED: motivo) va DESPUÉS de sus torneos. Las que se
posponen no salen en el informe.
"""
import glob
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SALIDA = os.path.join(RAIZ, "herramientas", "datos", "fide-solicitudes-ia.json")
FUENTE = "https://arbiters.fide.com/wp-content/uploads/Reporting/{}CouncilARBReport.pdf"
TORNEO = re.compile(r"(\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})\s+(.*?)(?=\s+\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}\s|\s*$)")


def solicitudes(informe, texto):
    ia = re.search(r"(?:Summar\w* of )?(?:IA|International Arbiter) Title Applications", texto, re.I)
    if not ia:
        return []
    fa = re.search(r"(?:Summar\w* of )?(?:FA|FIDE Arbiter) Title Applications", texto[ia.end():], re.I)
    seccion = texto[ia.end(): ia.end() + fa.start() if fa else len(texto)]
    partes = re.split(r"\n\s*([^\n]{3,120}?)\s+([A-Z]{3})\s+ID\s*#\s*(\d+)", seccion)
    salida = []
    for i in range(1, len(partes) - 3, 4):
        nombre, fed, fid, cuerpo = partes[i].strip(), partes[i + 1], int(partes[i + 2]), partes[i + 3]
        v = re.search(r"\b(APPROVED|REJECTED)\b[:\s]*([^\n]*)", cuerpo)
        # En 2020Q2 un rechazo vino sin la palabra REJECTED, solo el motivo.
        sin_palabra = None if v else re.search(r"\d{2}\.\d{2}\s+((?:Only|Incomplete|Missing)\b[^\n]*)", cuerpo)
        lista = re.split(r"\b(?:APPROVED|REJECTED)\b", cuerpo)[0].replace("\n", " ")
        salida.append({
            "informe": informe, "fide_id": fid, "nombre": nombre, "fed": fed,
            "veredicto": {"APPROVED": "aprobada", "REJECTED": "rechazada"}[v.group(1)] if v else ("rechazada" if sin_palabra else ""),
            "motivo": v.group(2).strip() if v else (sin_palabra.group(1).strip() if sin_palabra else ""),
            "torneos": [f"{fechas} {resto.strip()}" for fechas, resto in TORNEO.findall(lista)],
        })
    return salida


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    todas, informes = [], []
    for archivo in sorted(glob.glob(os.path.join(sys.argv[1], "*Q*.txt"))):
        informe = os.path.basename(archivo)[:-4]
        with open(archivo, encoding="utf-8") as f:
            s = solicitudes(informe, f.read())
        if not s:
            # 2020Q4 no trae solicitudes de título.
            print(f"{informe}: sin solicitudes de AI")
        informes.append({"informe": informe, "fuente": FUENTE.format(informe), "solicitudes": len(s)})
        todas += s
    sin_veredicto = [x for x in todas if not x["veredicto"]]
    if sin_veredicto:
        raise SystemExit(f"Sin veredicto: {[(x['informe'], x['nombre']) for x in sin_veredicto]}")
    aprobados = {x["fide_id"] for x in todas if x["veredicto"] == "aprobada"}
    siguen = sorted({x["fide_id"] for x in todas if x["veredicto"] == "rechazada"} - aprobados)
    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump({"nota": "Las solicitudes de AI de todos los países en los informes de la Comisión de Árbitros al Consejo de FIDE, tal cual. siguen_af: los que tuvieron una rechazada y ninguna aprobada (su perfil de FIDE todavía muestra las fechas del AF). Lo arma herramientas/arbitros-cr/solicitudes-ia.py.",
                   "informes": informes, "siguen_af": siguen, "solicitudes": todas}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"{len(todas)} solicitudes de AI en {len(informes)} informes; "
          f"{sum(x['veredicto'] == 'rechazada' for x in todas)} rechazadas; siguen siendo AF: {len(siguen)}")


if __name__ == "__main__":
    main()
