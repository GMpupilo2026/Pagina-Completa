# El temario: 72 lecciones (3 niveles x 24) y, para cada una, qué ejercicios
# de Lichess la muestran. sql = condición sobre la tabla; js = filtro que el
# generador comprueba en la posición.
import json, sys

def T(*temas):
    return "(" + " or ".join(f"th ~ '\\m{t}\\M'" for t in temas) + ")"

MAT = "translate(split_part(fen,' ',1),'12345678/','')"
def material(blanco, negro):
    # solo esas piezas (y reyes, y peones) en cada bando, en cualquiera de los dos colores
    a = f"({MAT} ~ '^[Kk{blanco}{negro.lower()}Pp]+$' and {MAT} ~ '[{blanco}]' and {MAT} ~ '[{negro.lower()}]')" if negro else f"({MAT} ~ '^[Kk{blanco}Pp]+$' and {MAT} ~ '[{blanco}]')"
    b = f"({MAT} ~ '^[Kk{blanco.lower()}{negro}Pp]+$' and {MAT} ~ '[{blanco.lower()}]' and {MAT} ~ '[{negro}]')" if negro else f"({MAT} ~ '^[Kk{blanco.lower()}Pp]+$' and {MAT} ~ '[{blanco.lower()}]')"
    return f"({a} or {b})"

L = []
def lec(nivel, area, titulo, clave, sql, js=None, lim=12):
    L.append(dict(nivel=nivel, area=area, titulo=titulo, clave=clave, sql=sql, js=js, lim=lim))

# ---------- Nivel 1 ----------
lec(1, "Táctica", "Los mates de siempre", "mate1", f"{T('backRankMate','arabianMate','hookMate','dovetailMate')} and {T('mateIn1','mateIn2')}")
lec(1, "Táctica", "Más dibujos de mate", "mate2", f"{T('smotheredMate','anastasiaMate','bodenMate','doubleBishopMate','killBoxMate','vukovicMate')} and {T('mateIn1','mateIn2','mateIn3')}")
lec(1, "Aperturas", "Las reglas de la apertura", "apertura", f"{T('opening')} and {T('hangingPiece','fork','pin','trappedPiece')}")
lec(1, "Finales", "Finales de peones: lo básico", "peones1", f"{T('pawnEndgame')}")
lec(1, "Táctica", "El jaque doble", "jaquedoble", f"{T('doubleCheck')}")
lec(1, "Juego posicional", "Cuánto vale cada pieza", "valor", f"{T('hangingPiece','trappedPiece')} and not {T('mate')}")
lec(1, "Táctica", "El ataque a la descubierta", "descubierta", f"{T('discoveredAttack')} and not {T('doubleCheck')}")
lec(1, "Estrategia", "Las piezas al centro", "centro", f"{T('middlegame')} and {T('advantage','crushing')} and not {T('mate')}", js="centro", lim=30)
lec(1, "Cálculo", "Mate en dos", "mate-dos", f"{T('mateIn2')}")
lec(1, "Finales", "La oposición", "oposicion", f"{T('pawnEndgame')} and length(regexp_replace(split_part(fen,' ',1),'[^pP]','','g')) <= 3")
lec(1, "Táctica", "La clavada", "clavada", f"{T('pin')}")
lec(1, "Táctica", "El ataque doble", "doble", f"{T('fork')}")
lec(1, "Juego posicional", "Cómo se gana con material de más", "convertir", f"{T('endgame')} and {T('crushing')} and not {T('mate','pawnEndgame')}")
lec(1, "Estrategia", "Columnas abiertas y casillas fuertes", "columnas", f"{T('middlegame','endgame')} and {T('advantage','crushing')} and not {T('mate')}", js="pieza:R", lim=30)
lec(1, "Táctica", "La combinación", "combinacion", f"{T('sacrifice')} and {T('crushing','mate')}", js="sacrificio", lim=20)
lec(1, "Finales", "Dama contra peón", "dama-peon", material("Q", "P").replace("[Kk", "[Kk").replace("Pp]+$'", "]+$'") if False else f"(({MAT} ~ '^[KkQp]+$' and {MAT} ~ 'Q' and {MAT} ~ 'p') or ({MAT} ~ '^[KkqP]+$' and {MAT} ~ 'q' and {MAT} ~ 'P'))")
lec(1, "Táctica", "El ahogado que salva", "ahogado", "false", js="ahogado", lim=60)
lec(1, "Cálculo", "Las variantes forzadas", "forzadas", f"{T('long','veryLong')} and {T('crushing','mate')}")
lec(1, "Táctica", "El peón que corona", "promocion", f"{T('promotion','advancedPawn')}")
lec(1, "Juego posicional", "Los puntos débiles", "debiles", f"{T('attackingF2F7')}")
lec(1, "Táctica", "Combinaciones con peones", "peon-comb", f"{T('advancedPawn','promotion')}", js="pieza:P", lim=25)
lec(1, "Finales", "El alfil que no sirve", "alfil-malo", f"{T('bishopEndgame')}")
lec(1, "Táctica", "El mate de la coz", "coz", f"{T('smotheredMate')}")
lec(1, "Aperturas", "Los gambitos", "gambito", f"oa ~ 'Gambit'", lim=14)

# ---------- Nivel 2 ----------
lec(2, "Táctica", "El molino", "molino", f"{T('discoveredCheck')}", js="molino", lim=40)
lec(2, "Estrategia", "Los peones débiles", "peon-debil", f"{T('endgame')} and {T('advantage','crushing')} and not {T('mate')}", js="come-peon", lim=40)
lec(2, "Táctica", "La última fila", "ultima-fila", f"{T('backRankMate')} and not {T('mateIn1')}")
lec(2, "Juego posicional", "Aprovechar las debilidades", "rey-expuesto", f"{T('exposedKing')}")
lec(2, "Táctica", "La séptima fila", "septima", f"{T('middlegame','endgame')} and {T('advantage','crushing','mate')}", js="septima", lim=60)
lec(2, "Finales", "Las fortalezas", "fortaleza", f"{T('defensiveMove')} and {T('endgame')}")
lec(2, "Táctica", "La cuña de peón", "cuna", f"{T('kingsideAttack')} and {T('advancedPawn')}")
lec(2, "Aperturas", "Las trampas de apertura", "trampa", f"{T('opening')} and {T('mate','crushing')} and {T('short','oneMove')}")
lec(2, "Aperturas", "Cómo usar una trampa", "atrapada", f"{T('trappedPiece')}")
lec(2, "Táctica", "Combinaciones de ahogado", "ahogado2", "false", js="ahogado", lim=60)
lec(2, "Estrategia", "La columna semiabierta", "semiabierta", f"{T('middlegame')} and {T('advantage','crushing')} and not {T('mate')}", js="pieza:R", lim=30)
lec(2, "Finales", "Mate con alfil y caballo", "alfil-caballo", f"{T('endgame')} and {T('mate')} and {MAT} ~ '[Bb]' and {MAT} ~ '[Nn]'")
lec(2, "Táctica", "Combinaciones en las columnas", "enfilada", f"{T('skewer')}")
lec(2, "Juego posicional", "Los puestos avanzados", "puesto", f"{T('middlegame')} and {T('advantage','crushing')} and not {T('mate')}", js="pieza:N", lim=30)
lec(2, "Táctica", "Combinaciones en las diagonales", "diagonal", f"{T('middlegame')} and {T('crushing','mate')}", js="pieza:B", lim=30)
lec(2, "Finales", "Finales elementales de torre", "torre", f"{T('rookEndgame')}")
lec(2, "Táctica", "Combinaciones con caballos", "caballo", f"{T('fork')}", js="pieza:N", lim=25)
lec(2, "Aperturas", "Desarrollar las piezas", "desarrollo", f"{T('opening')} and {T('advantage','crushing')} and not {T('mate')}")
lec(2, "Táctica", "El jaque perpetuo", "perpetuo", "false", js="perpetuo", lim=60)
lec(2, "Cálculo", "Mate en dos: los candidatos", "mate-dos2", f"{T('mateIn2')}")
lec(2, "Táctica", "Combinaciones con piezas mayores", "mayores", f"{T('crushing','mate')} and {T('sacrifice')}", js="pieza:QR", lim=30)
lec(2, "Juego posicional", "Las piezas trabajan juntas", "coordinar", f"{T('attraction','clearance')}")
lec(2, "Táctica", "El caballo que se entrega", "caballo2", f"{T('sacrifice')}", js="sac:N", lim=40)
lec(2, "Finales", "El zugzwang", "zugzwang", f"{T('zugzwang')}")

# ---------- Nivel 3 ----------
lec(3, "Táctica", "Combinaciones con alfiles", "alfil-comb", f"{T('sacrifice','crushing')}", js="pieza:B", lim=30)
lec(3, "Estrategia", "Las diagonales", "diag-est", f"{T('quietMove','advantage')} and not {T('mate')}", js="pieza:B", lim=30)
lec(3, "Táctica", "El sacrificio de dama", "sac-dama", f"{T('sacrifice')} and {T('mate','crushing')}", js="sac:Q", lim=40)
lec(3, "Finales", "Cambiar hacia un final de peones", "a-peones", f"{T('pawnEndgame')}", js="cambia-a-peones", lim=40)
lec(3, "Juego posicional", "Convertir la ventaja", "convertir2", f"{T('endgame')} and {T('crushing')} and not {T('mate','pawnEndgame')}")
lec(3, "Táctica", "Dama y caballo al ataque", "dama-caballo", f"{T('kingsideAttack','mate')}", js="piezas:QN", lim=40)
lec(3, "Aperturas", "Las partidas abiertas", "abiertas", f"oa ~ '(Italian|Ruy_Lopez|Scotch|Kings_Gambit|Philidor|Petrov|Four_Knights|Vienna|Two_Knights|Evans|Kings_Pawn|Three_Knights|Ponziani|Bishops_Opening)' and {T('opening','middlegame')}")
lec(3, "Táctica", "Dama y torre al ataque", "dama-torre-at", f"{T('kingsideAttack','mate')}", js="piezas:QR", lim=40)
lec(3, "Cálculo", "Variantes forzadas más largas", "forzadas2", f"{T('veryLong')} and {T('crushing','mate')}")
lec(3, "Táctica", "Dama y alfil al ataque", "dama-alfil", f"{T('kingsideAttack','mate')}", js="piezas:QB", lim=40)
lec(3, "Juego posicional", "Las ventajas que no se ven", "ventajas", f"{T('quietMove')} and {T('advantage','crushing')} and not {T('mate')}")
lec(3, "Finales", "Alfil contra peones", "alfil-peones", f"{T('bishopEndgame')}")
lec(3, "Táctica", "Dama y peón juntos", "dama-peon-at", f"{T('mate','crushing')}", js="piezas:QP", lim=40)
lec(3, "Estrategia", "Al ataque", "ataque", f"{T('kingsideAttack')} and {T('crushing','mate')}")
lec(3, "Táctica", "Torre y alfil", "torre-alfil", f"{T('crushing','mate')}", js="piezas:RB", lim=40)
lec(3, "Finales", "Caballo contra peón", "caballo-peon", f"{T('knightEndgame')}")
lec(3, "Táctica", "Torre y caballo", "torre-caballo", f"{T('crushing','mate')}", js="piezas:RN", lim=40)
lec(3, "Aperturas", "Las partidas semiabiertas", "semiabiertas", f"oa ~ '(Sicilian|French|Caro_Kann|Alekhine|Pirc|Scandinavian|Modern_Defense)' and {T('opening','middlegame')}")
lec(3, "Táctica", "Combinaciones de coronación", "coronar", f"{T('promotion','underPromotion')} and {T('crushing','mate')}")
lec(3, "Cálculo", "Mate en tres", "mate-tres", f"{T('mateIn3')}")
lec(3, "Táctica", "Redes de mate en el final", "red-final", f"{T('endgame')} and {T('mate')} and not {T('mateIn1')}")
lec(3, "Juego posicional", "El peón pasado", "pasado", f"{T('advancedPawn')} and {T('endgame')}")
lec(3, "Táctica", "Columnas: interferencia y rayos X", "interferencia", f"{T('interference','xRayAttack')}")
lec(3, "Finales", "Dama contra torre", "dama-torre", f"{T('queenRookEndgame','queenEndgame')}")

assert len(L) == 72, len(L)
for i, l in enumerate(L):
    l["n"] = i + 1
claves = [l["clave"] for l in L]
assert len(set(claves)) == 72

def sql(nivel_filtro):
    partes = []
    for l in L:
        if nivel_filtro and l["nivel"] != nivel_filtro:
            continue
        partes.append(f"""select '{l['clave']}' clave, id, fen, mv, r, th, banda,
  row_number() over (partition by banda order by md5(id || 'cimientos')) k, {l['n']} n
  from c where {l['sql']}""")
    union = "\nunion all\n".join(f"select * from ({p}) x{i} where k <= " + str(L[[x['clave'] for x in L].index(p.split("'")[1])]['n_lim']) for i, p in enumerate(partes)) if False else None
    sel = []
    for l in L:
        if nivel_filtro and l["nivel"] != nivel_filtro:
            continue
        sel.append(f"(select '{l['clave']}|'||z from (select z,row_number() over (partition by banda order by md5(id||'{l['clave']}')) k from c where {l['sql']}) q where k<={l['lim']})")
    return ("with c as (select e.\"PuzzleId\" id,e.\"FEN\" fen,e.\"Themes\" th,coalesce(e.\"OpeningTags\",'') oa,"
      "width_bucket(e.\"Rating\",array[800,1300,1700,2200]) banda,"
      "width_bucket(e.\"Rating\",array[800,1300,1700,2200])||'|'||e.\"PuzzleId\"||'|'||e.\"FEN\"||'|'||e.\"Moves\"||'|'||e.\"Rating\"||'|'||e.\"Themes\" z "
      "from \"Ejercicios Lichess\" e where e.\"Popularity\">=85 and e.\"NbPlays\">=1000 and e.\"RatingDeviation\"<=80 and e.\"Rating\" between 800 and 2199) "
      "select string_agg(l,E'\\n') from (" + " union all ".join(sel) + ") t(l)")

if __name__ == "__main__":
    if sys.argv[1] == "json":
        print(json.dumps(L, ensure_ascii=False, indent=1))
    else:
        print(sql(int(sys.argv[1])))
