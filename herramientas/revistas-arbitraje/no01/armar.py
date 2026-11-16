import json, sys, os
OUT = sys.argv[1]
N = 10
M = json.load(open(os.path.join(os.path.dirname(__file__), 'M.json')))
pts = [sum(x for x in r if x is not None) for r in M]
names = ["Herrera, Daniel", "Kovács, Péter", "Salinas, Lucía", "Mendoza, Rafael", "Okafor, Chidi",
         "Varga, Ana", "Lindqvist, Erik", "Torres, Mariana", "Ibáñez, Jorge", "Novak, Ivo"]

def ks(i, lim): return sum(M[i][j] for j in range(N) if j != i and pts[j] >= lim)
def f(x):
    if x is None: return ""
    w = int(x); h = (x - w) == 0.5
    if w == 0 and h: return "½"
    return f"{w}{'½' if h else ''}"

# ---------- chess boards ----------
G = {'K':'♔','Q':'♕','R':'♖','B':'♗','N':'♘','P':'♙','k':'♚','q':'♛','r':'♜','b':'♝','n':'♞','p':'♟'}
def board(fen, caption):
    rows = fen.split()[0].split('/')
    h = ['<figure class="board"><div class="grid">']
    for r, row in enumerate(rows):
        sq = []
        for ch in row:
            if ch.isdigit(): sq += [''] * int(ch)
            else: sq.append(ch)
        for c, p in enumerate(sq):
            dark = (r + c) % 2 == 1
            cls = 'd' if dark else 'l'
            # blancas = símbolo hueco, negras = lleno, ambos en negro; U+FE0E evita la fuente de emojis
            glyph = (G[p] + '︎') if p else ''
            h.append(f'<span class="{cls}{" pz" if p else ""}">{glyph}</span>')
    h.append('</div><div class="files">' + ''.join(f'<i>{x}</i>' for x in 'abcdefgh') + '</div>')
    h.append(f'<figcaption>{caption}</figcaption></figure>')
    return ''.join(h)

B1 = board("rnbqk1nr/pppp1ppp/8/2b1p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq -", "Ejercicio 1 · Posición a vigilar (juegan blancas)")
B2 = board("rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -", "Ejercicio 2 · Posición a vigilar (juegan blancas)")
B3 = board("8/2kb4/3p4/2nPp3/4P3/4K3/3N1N2/8 w - e6", "Ejercicio 3 · Acaba de jugarse 1…e5 (juegan blancas)")
B4 = board("4k3/8/5b2/2BKp3/3pP3/3P4/8/8 w - -", "Ejercicio 4 · Posición inicial (juegan blancas)")
B5 = board("8/3pn3/2p1pk2/5r2/3P3R/2PKP3/4N3/8 w - -", "Ejercicio 5 · Posición inicial (juegan blancas)")

# ---------- crosstable ----------
def crosstable(order, extra_cols):
    fin = order != list(range(N))
    h = ['<table class="xt"><thead><tr>' + ('<th>Lugar</th><th>Nº</th>' if fin else '<th>Nº</th>') + '<th class="nm">Jugador</th>']
    h += [f'<th>{j+1}</th>' for j in range(N)] + ['<th>Pts</th>'] + [f'<th>{c[0]}</th>' for c in extra_cols] + ['</tr></thead><tbody>']
    for pos, i in enumerate(order):
        h.append((f'<tr><td class="b">{pos+1}</td><td>{i+1}</td>' if fin else f'<tr><td>{i+1}</td>') + f'<td class="nm">{names[i]}</td>')
        for j in range(N):
            if i == j: h.append('<td class="x"></td>')
            else:
                cls = ' class="top"' if pts[j] >= 4.5 else ''
                h.append(f'<td{cls}>{f(M[i][j])}</td>')
        h.append(f'<td class="b">{f(pts[i])}</td>')
        for c in extra_cols: h.append(f'<td class="b">{c[1](i)}</td>')
        h.append('</tr>')
    h.append('</tbody></table>')
    return ''.join(h)

XT1 = crosstable(list(range(N)), [("KS", lambda i: f(ks(i, 4.5)))])
final_order = [0, 1, 2, 3, 4, 6, 5, 7, 8, 9]
def ksl(i):
    return f"{f(ks(i,4.5))} / {f(ks(i,4.0))} / {f(ks(i,3.5))}"
XT2 = crosstable(final_order, [("KS (4½ / 4 / 3½)", ksl)])

def against(i, lim):
    parts = []
    for j in range(N):
        if j != i and pts[j] >= lim:
            parts.append(f"{f(M[i][j])} vs {names[j].split(',')[0]}")
    return " + ".join(parts) + f" = <b>{f(ks(i, lim))}</b>"

html = open(os.path.join(os.path.dirname(__file__), 'template.html'), encoding='utf-8').read()
for k, v in {"{{B1}}": B1, "{{B2}}": B2, "{{B3}}": B3, "{{B4}}": B4, "{{B5}}": B5, "{{XT1}}": XT1, "{{XT2}}": XT2}.items():
    html = html.replace(k, v)
for i in range(N):
    for lim, tag in [(4.5, "45"), (4.0, "40"), (3.5, "35")]:
        html = html.replace("{{A%d_%s}}" % (i + 1, tag), against(i, lim))
open(OUT, 'w', encoding='utf-8').write(html)
print("ok", pts, [ks(i, 4.5) for i in range(N)], [ks(i, 4.0) for i in range(N)], [ks(i, 3.5) for i in range(N)])

# rev bfb5bbb0d2d82f9f
