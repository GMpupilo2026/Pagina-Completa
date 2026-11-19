# Arma el simulador de logística de la Sesión 5 de Formación Ajedrez (Excel
# con fórmulas): con los inscritos de cada torneo calcula mesas dobles,
# tableros, piezas, relojes, sillas, planillas y árbitros. Se ofrece como
# material de la sesión (extras de la lección 5 en cursos/formacion-ajedrez.json).
#
#   python herramientas/formacion-simulador-logistica.py
#
# Escribe cursos/recursos/formacion-ajedrez/simulador-logistica-ajedrez-jde.xlsx.
# Necesita openpyxl y Pillow (pip install openpyxl pillow). La marca de agua sale
# de herramientas/lib/marca-agua.js, la copia única: Excel no tiene marca de agua
# detrás de las celdas, así que va como imagen en Instrucciones y en Resumen, y
# escrita en el pie de cada hoja al imprimir.
import os, re, sys
from openpyxl.drawing.image import Image as Imagen

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule
from openpyxl.utils import get_column_letter

SALIDA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, "cursos", "recursos", "formacion-ajedrez", "simulador-logistica-ajedrez-jde.xlsx")
N_EV = 40          # filas disponibles para eventos
N_INS = 3000       # filas disponibles para la lista de inscritos
N_TURNOS = 6

AZUL = "1F4E79"; AZUL_CL = "DDEBF7"; AMAR = "FFF2CC"; VERDE = "E2EFDA"; GRIS = "F2F2F2"; ROJO = "C00000"
fino = Side(style="thin", color="BFBFBF")
borde = Border(left=fino, right=fino, top=fino, bottom=fino)
H = Font(bold=True, color="FFFFFF"); B = Font(bold=True)
fill = lambda c: PatternFill("solid", fgColor=c)
wrap = Alignment(wrap_text=True, vertical="top")
centro = Alignment(horizontal="center", vertical="center", wrap_text=True)

wb = Workbook()

# ---------------------------------------------------------------- Instrucciones
ws = wb.active; ws.title = "Instrucciones"
ws.column_dimensions["A"].width = 110
lineas = [
    ("Simulador de logística · Torneo de ajedrez JDE", Font(bold=True, size=16, color=AZUL)),
    ("Formación de Personas Árbitras y Asesoras · Sesión 5", Font(italic=True, color="595959")),
    ("", None),
    ("Qué hace", B),
    ("Con los inscritos de cada evento calcula, ronda a ronda, cuántas mesas dobles (2 tableros por mesa), tableros, juegos de piezas, relojes, sillas, planillas y árbitros hacen falta, y cuánto repuesto llevar.", None),
    ("", None),
    ("Cómo se usa (3 pasos)", B),
    ("1. Hoja «Configuración»: elijan la etapa (Regional, Interregional o Nacional) y revisen los supuestos (rondas del suizo, % de repuesto, tableros por árbitro…). Las celdas amarillas se pueden cambiar.", None),
    ("2. Hoja «Eventos»: una fila por torneo. Escriban el nombre, la modalidad (Individual o Equipos), el turno y la cantidad de participantes (personas en individual, EQUIPOS en equipos).", None),
    ("    Opción B: peguen la lista de la Plataforma en la hoja «Inscritos» (Nombre, Centro, Evento, Equipo) y dejen vacía la columna de participantes: el Excel los cuenta solo. El nombre del evento debe ser idéntico en las dos hojas.", None),
    ("3. Hoja «Resumen»: ahí está la lista de materiales para el día. Si todo se juega a la vez, todo va en el turno 1; si escalonan los eventos en turnos, el Excel toma el turno más cargado.", None),
    ("", None),
    ("Cómo calcula", B),
    ("• Sistema según la Normativa PJDE 2026, art. 66.2: Regional → suizo con más de 8 inscritos, todos contra todos con 8 o menos; Interregional → todos contra todos; Nacional → suizo de 5 rondas con más de 7, todos contra todos con 6 o menos (con exactamente 7 la Normativa no dice nada: se define en el congresillo).", None),
    ("• Si el congresillo acordó otro sistema u otras rondas, escríbanlo en las columnas «Sistema acordado» y «Rondas acordadas» de la hoja Eventos: mandan sobre el cálculo automático.", None),
    ("• Individual: partidas por ronda = participantes ÷ 2 (si es impar, uno queda libre: bye). Mesas dobles = partidas ÷ 2, redondeado hacia arriba.", None),
    ("• Equipos: encuentros por ronda = equipos ÷ 2; tableros = encuentros × tableros por equipo (4 titulares, art. 66.1.g). Cada encuentro ocupa sus propias mesas, juntas: 4 tableros = 2 mesas dobles.", None),
    ("• Un tablero en juego = 1 juego de piezas + 1 reloj + 2 sillas. Planillas = 2 por partida y por ronda.", None),
    ("• Todos contra todos: rondas = participantes − 1 (si es par) o participantes (si es impar).", None),
    ("", None),
    ("Ojo", Font(bold=True, color=ROJO)),
    ("Los supuestos de «tableros por árbitro», «m² por mesa» y «% de repuesto» no salen de la Normativa: son valores de referencia para el simulacro. Ajústenlos a su sede.", None),
]
for i, (t, f) in enumerate(lineas, 1):
    c = ws.cell(i, 1, t); c.alignment = wrap
    if f: c.font = f

# ---------------------------------------------------------------- Configuración
cf = wb.create_sheet("Configuración")
cf.column_dimensions["A"].width = 42; cf.column_dimensions["B"].width = 18; cf.column_dimensions["C"].width = 70
cf["A1"] = "Configuración del simulacro"; cf["A1"].font = Font(bold=True, size=14, color=AZUL)
filas_cfg = [
    ("Nombre del torneo", "JDE 2026 · Etapa Regional · simulacro", "Solo para el título del resumen."),
    ("Etapa", "Regional", "Regional, Interregional o Nacional (art. 66.2)."),
    ("Rondas del suizo", 7, "Regional: no menos de 5 (66.2.a). Nacional: 5 (66.2.d)."),
    ("Tableros por equipo (titulares)", 4, "Art. 66.1.g: hasta 4 titulares y 1 suplente."),
    ("Repuesto (% sobre lo que está en juego)", 0.10, "Tableros, piezas y relojes de reserva."),
    ("Repuesto mínimo (unidades)", 2, "Aunque el % dé menos."),
    ("Tableros por árbitro de sala", 20, "Supuesto de referencia: ajústenlo a su equipo."),
    ("Árbitro principal (personas)", 1, "Se suma a los árbitros de sala."),
    ("m² por mesa doble (con sillas y pasillo)", 4, "Supuesto para estimar el tamaño de la sala."),
    ("Mesas extra (control, digitación, registro)", 2, "Mesa de control y de resultados."),
]
for i, (a, b, c) in enumerate(filas_cfg, 3):
    cf.cell(i, 1, a).font = B
    v = cf.cell(i, 2, b); v.fill = fill(AMAR); v.border = borde; v.alignment = Alignment(horizontal="center")
    cf.cell(i, 3, c).alignment = wrap
cf["B7"].number_format = "0%"
dv_et = DataValidation(type="list", formula1='"Regional,Interregional,Nacional"', allow_blank=False)
cf.add_data_validation(dv_et); dv_et.add("B4")
# nombres para leer fácil las fórmulas
from openpyxl.workbook.defined_name import DefinedName
for nombre, ref in [("Torneo", "$B$3"), ("Etapa", "$B$4"), ("RondasSuizo", "$B$5"), ("TabPorEquipo", "$B$6"),
                    ("PctRepuesto", "$B$7"), ("MinRepuesto", "$B$8"), ("TabPorArbitro", "$B$9"),
                    ("ArbPrincipal", "$B$10"), ("M2Mesa", "$B$11"), ("MesasExtra", "$B$12")]:
    wb.defined_names[nombre] = DefinedName(nombre, attr_text=f"'Configuración'!{ref}")

# ---------------------------------------------------------------- Inscritos
ins = wb.create_sheet("Inscritos")
cab_ins = ["Nombre", "Centro educativo", "Evento (igual que en «Eventos»)", "Equipo (solo por equipos)"]
for j, t in enumerate(cab_ins, 1):
    c = ins.cell(1, j, t); c.font = H; c.fill = fill(AZUL); c.alignment = centro
for col, w in zip("ABCD", [34, 36, 38, 30]): ins.column_dimensions[col].width = w
ins.freeze_panes = "A2"
c = ins.cell(1, 5, "Equipo nuevo\n(automático)"); c.font = H; c.fill = fill(AZUL); c.alignment = centro
ins.column_dimensions["E"].width = 13
for r in range(2, N_INS + 2):
    ins[f"E{r}"] = f'=IF(OR(C{r}="",D{r}=""),0,IF(COUNTIFS(C$2:C{r},C{r},D$2:D{r},D{r})=1,1,0))'
    ins[f"E{r}"].font = Font(color="808080")
ins["F1"] = "Opcional: peguen aquí la lista de la Plataforma. Si en «Eventos» dejan vacía la columna de participantes, se cuentan desde esta hoja."
ins["F1"].alignment = wrap; ins.column_dimensions["F"].width = 50

# ---------------------------------------------------------------- Eventos
ev = wb.create_sheet("Eventos")
cab = [
    ("Evento", 34), ("Modalidad", 12), ("Turno", 8), ("Participantes\n(escribir)", 13),
    ("Contados en\n«Inscritos»", 12), ("Participantes\nusados", 12), ("Sistema\nacordado\n(opcional)", 15),
    ("Rondas\nacordadas\n(opcional)", 11), ("Sistema", 18), ("Rondas", 8), ("Partidas o\nencuentros\npor ronda", 12),
    ("Libres (bye)\npor ronda", 11), ("Tableros en juego\n(= piezas = relojes)", 16), ("Mesas\ndobles", 9),
    ("Sillas", 8), ("Planillas\n(todo el torneo)", 13), ("Hojas de\nresultados /\nactas de encuentro", 15), ("Avisos", 46),
]
for j, (t, w) in enumerate(cab, 1):
    c = ev.cell(1, j, t); c.font = H; c.fill = fill(AZUL); c.alignment = centro; c.border = borde
    ev.column_dimensions[get_column_letter(j)].width = w
ev.row_dimensions[1].height = 58
ev.freeze_panes = "B2"

# Ejemplo: Etapa Regional DRE Alajuela 2026 (inscritos del acta del congresillo)
ejemplo = [
    ("Individual · Categoría A · Abierto", "Individual", 1, 15), ("Individual · Categoría A · Mujeres", "Individual", 1, 6),
    ("Individual · Categoría B · Abierto", "Individual", 1, 26), ("Individual · Categoría B · Mujeres", "Individual", 1, 15),
    ("Individual · Categoría C · Abierto", "Individual", 1, 30), ("Individual · Categoría C · Mujeres", "Individual", 1, 18),
    ("Individual · Categoría D · Abierto", "Individual", 1, 33), ("Individual · Categoría D · Mujeres", "Individual", 1, 12),
    ("Individual · Categoría E · Abierto", "Individual", 1, 4),
    ("Equipos · Categoría A · Abierto", "Equipos", 1, 3), ("Equipos · Categoría A · Mujeres", "Equipos", 1, 1),
    ("Equipos · Categoría B · Abierto", "Equipos", 1, 10), ("Equipos · Categoría B · Mujeres", "Equipos", 1, 2),
    ("Equipos · Categoría C · Abierto", "Equipos", 1, 8), ("Equipos · Categoría C · Mujeres", "Equipos", 1, 3),
    ("Equipos · Categoría D · Abierto", "Equipos", 1, 8),
]
INS_EV = f"Inscritos!$C$2:$C${N_INS+1}"; INS_EQ = f"Inscritos!$D$2:$D${N_INS+1}"
for r in range(2, N_EV + 2):
    if r - 2 < len(ejemplo):
        n, m, t, p = ejemplo[r - 2]
        ev.cell(r, 1, n); ev.cell(r, 2, m); ev.cell(r, 3, t); ev.cell(r, 4, p)
    for j in (1, 2, 3, 4, 7, 8):
        ev.cell(r, j).fill = fill(AMAR)
    # E: contados en Inscritos (personas en individual, equipos distintos en equipos)
    ev[f"E{r}"] = (f'=IF(A{r}="","",IF(B{r}="Equipos",'
                   f'SUMIFS(Inscritos!$E$2:$E${N_INS+1},{INS_EV},A{r}),'
                   f'COUNTIF({INS_EV},A{r})))')
    # F: participantes usados
    ev[f"F{r}"] = f'=IF(A{r}="","",IF(D{r}<>"",D{r},E{r}))'
    # I: sistema
    auto = (f'IF(Etapa="Interregional","Todos contra todos",'
            f'IF(Etapa="Nacional",IF(F{r}>7,"Suizo",IF(F{r}=7,"Definir en congresillo","Todos contra todos")),'
            f'IF(F{r}>8,"Suizo","Todos contra todos")))')
    ev[f"I{r}"] = f'=IF(OR(A{r}="",F{r}="",F{r}<2),"",IF(G{r}<>"",G{r},{auto}))'
    # K: partidas (individual) o encuentros (equipos) por ronda
    ev[f"K{r}"] = f'=IF(I{r}="","",INT(F{r}/2))'
    ev[f"L{r}"] = f'=IF(I{r}="","",MOD(F{r},2))'
    # M: tableros en juego
    ev[f"M{r}"] = f'=IF(I{r}="","",IF(B{r}="Equipos",K{r}*TabPorEquipo,K{r}))'
    # N: mesas dobles (en equipos cada encuentro ocupa sus propias mesas)
    ev[f"N{r}"] = f'=IF(I{r}="","",IF(B{r}="Equipos",K{r}*CEILING(TabPorEquipo/2,1),CEILING(K{r}/2,1)))'
    ev[f"O{r}"] = f'=IF(I{r}="","",M{r}*2)'
    ev[f"P{r}"] = f'=IF(I{r}="","",M{r}*2*J{r})'
    ev[f"Q{r}"] = f'=IF(I{r}="","",IF(B{r}="Equipos",K{r}*J{r},J{r}))'
    ev[f"R{r}"] = (f'=IF(A{r}="","",IF(F{r}="","Falta la cantidad de participantes",'
                   f'IF(F{r}<2,"Con menos de 2 no hay torneo: revisar en el congresillo",'
                   f'IF(I{r}="Definir en congresillo","Nacional con 7: la Normativa no lo prevé; se calcula como todos contra todos",'
                   f'IF(AND(I{r}="Suizo",Etapa="Regional",J{r}<5),"Regional: el suizo es de no menos de 5 rondas (66.2.a)",'
                   f'IF(AND(B{r}<>"Individual",B{r}<>"Equipos"),"Modalidad: escriban Individual o Equipos",""))))))')
    for j in range(1, 19):
        c = ev.cell(r, j); c.border = borde
        if j >= 5 and j not in (7, 8): c.fill = fill(GRIS)
        if j not in (1, 18): c.alignment = Alignment(horizontal="center")
    ev[f"R{r}"].font = Font(color=ROJO)
# "Definir en congresillo" se calcula como todos contra todos en J
for r in range(2, N_EV + 2):
    ev[f"J{r}"] = (f'=IF(I{r}="","",IF(H{r}<>"",H{r},IF(I{r}="Suizo",IF(Etapa="Nacional",5,RondasSuizo),'
                   f'IF(MOD(F{r},2)=0,F{r}-1,F{r}))))')
dv_mod = DataValidation(type="list", formula1='"Individual,Equipos"', allow_blank=True)
dv_sis = DataValidation(type="list", formula1='"Suizo,Todos contra todos"', allow_blank=True)
dv_tur = DataValidation(type="whole", operator="between", formula1="1", formula2=str(N_TURNOS), allow_blank=True)
dv_tur.error = f"El turno va de 1 a {N_TURNOS}."
for d in (dv_mod, dv_sis, dv_tur): ev.add_data_validation(d)
dv_mod.add(f"B2:B{N_EV+1}"); dv_sis.add(f"G2:G{N_EV+1}"); dv_tur.add(f"C2:C{N_EV+1}")
# totales
tr = N_EV + 2
ev.cell(tr, 1, "TOTAL si todo se juega a la vez").font = B
for col in "FKMNOPQ":
    ev[f"{col}{tr}"] = f"=SUM({col}2:{col}{N_EV+1})"
    ev[f"{col}{tr}"].font = B; ev[f"{col}{tr}"].fill = fill(VERDE); ev[f"{col}{tr}"].alignment = Alignment(horizontal="center")
ev.auto_filter.ref = f"A1:R{N_EV+1}"

# ---------------------------------------------------------------- Resumen
rs = wb.create_sheet("Resumen", 1)
rs.column_dimensions["A"].width = 40
for col in "BCDEFGH": rs.column_dimensions[col].width = 12
rs.column_dimensions["I"].width = 14
rs["A1"] = "=\"Lista de materiales · \"&Torneo"; rs["A1"].font = Font(bold=True, size=14, color=AZUL)
rs["A2"] = "=\"Etapa \"&Etapa&\" · se calcula para el turno más cargado (los materiales pasan de un turno a otro)\""
rs["A2"].font = Font(italic=True, color="595959")

# Tabla por turno
rs["A4"] = "Carga por turno"; rs["A4"].font = Font(bold=True, size=12)
rs.cell(5, 1, "Concepto").font = H; rs.cell(5, 1).fill = fill(AZUL)
for t in range(1, N_TURNOS + 1):
    c = rs.cell(5, 1 + t, f"Turno {t}"); c.font = H; c.fill = fill(AZUL); c.alignment = centro
c = rs.cell(5, 2 + N_TURNOS, "Máximo"); c.font = H; c.fill = fill(AZUL); c.alignment = centro
conceptos = [("Eventos que juegan", None), ("Tableros en juego", "M"), ("Mesas dobles", "N"), ("Sillas", "O"),
             ("Participantes (personas o equipos)", "F")]
EVR = lambda col: f"Eventos!${col}$2:${col}${N_EV+1}"
for i, (nom, col) in enumerate(conceptos, 6):
    rs.cell(i, 1, nom)
    for t in range(1, N_TURNOS + 1):
        L = get_column_letter(1 + t)
        if col is None:
            f = f'=COUNTIFS({EVR("C")},{t},{EVR("I")},"?*")'
        else:
            f = f'=SUMIF({EVR("C")},{t},{EVR(col)})'
        rs[f"{L}{i}"] = f
        rs[f"{L}{i}"].alignment = Alignment(horizontal="center"); rs[f"{L}{i}"].border = borde
    M = get_column_letter(2 + N_TURNOS)
    rs[f"{M}{i}"] = f"=MAX(B{i}:{get_column_letter(1+N_TURNOS)}{i})"
    rs[f"{M}{i}"].font = B; rs[f"{M}{i}"].fill = fill(VERDE); rs[f"{M}{i}"].alignment = Alignment(horizontal="center")
    rs.cell(i, 1).border = borde
# fila 11: eventos sin turno
rs["A11"] = "Eventos sin turno (no se cuentan)"
rs["B11"] = f'=COUNTIFS({EVR("A")},"?*",{EVR("C")},"")'
rs["A11"].font = Font(italic=True, color=ROJO); rs["B11"].font = Font(color=ROJO)

MX = get_column_letter(2 + N_TURNOS)  # columna del máximo
TAB = f"{MX}7"; MES = f"{MX}8"; SIL = f"{MX}9"
rs["A13"] = "Lista de materiales para el día"; rs["A13"].font = Font(bold=True, size=12)
for j, t in enumerate(["Material", "En juego", "Repuesto", "Llevar", "Listo ✔"], 1):
    c = rs.cell(14, j, t); c.font = H; c.fill = fill(AZUL); c.alignment = centro
REP = f"MAX(MinRepuesto,CEILING({TAB}*PctRepuesto,1))"
mat = [
    ("Mesas dobles (2 tableros por mesa)", f"={MES}", "=MesasExtra", "Las extra: control y resultados"),
    ("Sillas", f"={SIL}", f"=MesasExtra*2", ""),
    ("Tableros", f"={TAB}", f"={REP}", ""),
    ("Juegos de piezas (completos)", f"={TAB}", f"={REP}", "Contar las 32 piezas de cada juego"),
    ("Relojes digitales (configurados)", f"={TAB}", f"={REP}", "Con el ritmo del acta, p. ej. 10 min + 2 s"),
    ("Baterías de repuesto para relojes", "", f"=CEILING({TAB}*0.25,1)", "Supuesto: 1 por cada 4 relojes"),
    ("Planillas de anotación (todo el torneo)", f"=SUM({EVR('P')})", f"=CEILING(SUM({EVR('P')})*0.1,1)", "Art. 66.2.g: anotación algebraica"),
    ("Hojas de resultados / actas de encuentro", f"=SUM({EVR('Q')})", f"=CEILING(SUM({EVR('Q')})*0.1,1)", "Por ronda (individual) o por encuentro (equipos)"),
    ("Números de mesa", f"={MES}", "", "Mesas numeradas antes de la ronda 1"),
]
for i, (nom, a, b, nota) in enumerate(mat, 15):
    rs.cell(i, 1, nom).border = borde
    rs.cell(i, 2, a); rs.cell(i, 3, b)
    rs[f"D{i}"] = f'=IF(AND(B{i}="",C{i}=""),"",N(B{i})+N(C{i}))'
    rs[f"D{i}"].font = B; rs[f"D{i}"].fill = fill(VERDE)
    for j in range(2, 6):
        rs.cell(i, j).alignment = Alignment(horizontal="center"); rs.cell(i, j).border = borde
    rs.cell(i, 6, nota).font = Font(italic=True, color="595959")
fin = 15 + len(mat)
rs.cell(fin + 1, 1, "Personal y espacio").font = Font(bold=True, size=12)
pers = [
    ("Árbitros de sala", f"=IF({TAB}=0,0,CEILING({TAB}/TabPorArbitro,1))", "Supuesto: tableros por árbitro (Configuración)"),
    ("Árbitro principal", "=ArbPrincipal", "Mayor de edad, preferiblemente titulado (art. 14)"),
    ("Total de personas árbitras", f"=B{fin+2}+B{fin+3}", ""),
    ("Sala de juego aproximada (m²)", f"=({MES}+MesasExtra)*M2Mesa", "Supuesto: m² por mesa doble (Configuración)"),
]
for i, (nom, f, nota) in enumerate(pers, fin + 2):
    rs.cell(i, 1, nom).border = borde
    rs.cell(i, 2, f).alignment = Alignment(horizontal="center"); rs.cell(i, 2).border = borde; rs.cell(i, 2).font = B
    rs.cell(i, 3, nota).font = Font(italic=True, color="595959")
r0 = fin + 7
rs.cell(r0, 1, "Además (no dependen de los inscritos)").font = Font(bold=True, size=12)
extras = ["Acta del congresillo impresa y firmada (art. 34)", "Lista inicial y pareo de la ronda 1 impresos",
          "Computadora con el programa de pareo + impresora", "Hojas del informe de incidencias",
          "Cinta o cordón para separar al público (sala aparte)", "Leyes FIDE y Normativa PJDE 2026 a mano",
          "Lapiceros", "Cronograma de rondas visible"]
for i, t in enumerate(extras, r0 + 1):
    rs.cell(i, 1, "☐ " + t)
rs.freeze_panes = "A4"

# formato condicional: resaltar avisos
ev.conditional_formatting.add(f"R2:R{N_EV+1}", FormulaRule(formula=[f'LEN(R2)>0'], fill=fill("FCE4D6")))

# ---------------------------------------------------------------- Marca de agua
MARCA = os.path.join(RAIZ, re.search(r'MARCA_AGUA:\s*"([^"]+)"', open(os.path.join(RAIZ, "herramientas", "lib", "marca-agua.js"), encoding="utf-8").read()).group(1))
for hoja, celda in ((ws, "B1"), (rs, "J1")):   # a la derecha de lo que se usa
    img = Imagen(MARCA); img.width, img.height = 190, round(190 * img.height / img.width)
    hoja.add_image(img, celda)
for hoja in wb.worksheets:
    hoja.oddFooter.center.text = "Ajedrez Integral · Formación de Personas Árbitras y Asesoras"
    hoja.oddFooter.center.size = 9
wb.properties.creator = "Ajedrez Integral"
wb.properties.title = "Simulador de logística · Torneo de ajedrez JDE"

wb.save(SALIDA)
print("ok", SALIDA)

# rev bfb5bbb0d2d82f9f
