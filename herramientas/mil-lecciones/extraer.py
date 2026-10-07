# Extrae del PDF el texto en orden de lectura (columna izquierda, luego derecha)
# con marcas de diagrama, y guarda cada diagrama como imagen.
import pymupdf, json, os, re, sys
pdf, salida = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(salida, 'diag'), exist_ok=True)
doc = pymupdf.open(pdf)
corriente = []   # lista de (pagina, texto)
diags = {}
for pn in range(doc.page_count):
    pg = doc[pn]
    W = pg.rect.width
    d = pg.get_text('dict')
    elems = []
    for b in d['blocks']:
        x0, y0, x1, y1 = b['bbox']
        if b['type'] == 1:
            w, h = b.get('width'), b.get('height')
            if (w, h) == (400, 178): continue          # fondo de la página
            if abs((x1-x0)-(y1-y0)) > 25 or (x1-x0) < 80: continue   # no es un tablero
            col = 0 if (x0+x1)/2 < W/2 else 1
            nombre = 'p%04d-%d' % (pn+1, len(diags))
            ruta = os.path.join(salida, 'diag', nombre + '.' + b.get('ext', 'png'))
            with open(ruta, 'wb') as f: f.write(b['image'])
            diags[nombre] = {'pagina': pn+1, 'archivo': os.path.basename(ruta), 'bbox': [round(v) for v in b['bbox']]}
            elems.append((col, y0, x0, ' ⟦DIAG:%s⟧ ' % nombre))
        else:
            lineas = []
            for l in b['lines']:
                t = ''.join(s['text'] for s in l['spans'])
                lineas.append(t)
            t = '\n'.join(lineas).strip()
            if not t: continue
            if y0 < 60 and 'ebooks EDAMI' in t: continue
            if re.match(r'^Página \d+$', t): continue
            if t.startswith('Colección ebooks de EDAMI'): continue
            col = 0 if x0 < W/2 - 20 else 1
            elems.append((col, y0, x0, t))
    elems.sort(key=lambda e: (e[0], e[1], e[2]))
    for e in elems:
        corriente.append((pn+1, e[3]))
json.dump({'corriente': corriente, 'diagramas': diags}, open(os.path.join(salida, 'extraido.json'), 'w'), ensure_ascii=False)
print(len(corriente), len(diags))
