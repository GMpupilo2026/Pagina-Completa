import re, json
def lecciones(ruta='ext/extraido.json'):
    d=json.load(open(ruta,encoding='utf-8'))
    lec=[]; cur=None
    for pg,t in d['corriente']:
        for l in t.split('\n'):
            m=re.match(r'^Clase:\s*(\d+)\b',l.strip())
            if m and (cur is None or int(m.group(1))==cur['n']+1): cur={'n':int(m.group(1)),'lineas':[]};lec.append(cur)
            if cur is not None: cur['lineas'].append((pg,l))
    return lec
