# -*- coding: utf-8 -*-
import re, sys, json, chess

PIEZA = {'R':'K','D':'Q','T':'R','A':'B','C':'N'}
NAG_RE = r'(?:!!|\?\?|!\?|\?!|!|\?)?'
SAN_ES = r'(?:[RDTAC][a-h]?[1-8]?x?[a-h][1-8]|[a-h](?:x[a-h])?[1-8](?:=?[DTAC])?|0-0-0|0-0|O-O-O|O-O)[+#]?'
EVAL_RE = r'N?(?:\+-|-\+|±|∓|\+=|=\+|=|∞|\+/-|-/\+|\+−|−\+|‚|,)?'
MOV = re.compile(r'^(?:(\d+)\.(\.\.)?)?(' + SAN_ES + r')(' + NAG_RE + r')[+#]?(' + NAG_RE + r')' + EVAL_RE + r'[,;:.)\]]*$')
RES = re.compile(r'^(1-0|0-1|½-½|1/2-1/2)[.,]?$')

def a_ingles(san):
    san = san.rstrip('+#')
    san = san.replace('0-0-0','O-O-O').replace('0-0','O-O')
    if san[0] in PIEZA: san = PIEZA[san[0]] + san[1:]
    san = re.sub(r'=?([DTAC])$', lambda m: '='+PIEZA[m.group(1)], san) if re.match(r'^[a-h]', san) and re.search(r'[18]=?[DTAC]$', san) else san
    return san

def limpiar(txt):
    txt = txt.replace('–','-').replace('—','-').replace('…','...')
    txt = re.sub(r'([01½])-\s*\n\s*([01½])', r'\1-\2', txt)
    txt = re.sub(r'0-\s*\n\s*0', '0-0', txt)
    txt = re.sub(r'([a-h][1-8][+#!?]*)(\d{1,3}\.)', r'\1 \2', txt)
    lineas = []
    for l in txt.split('\n'):
        ls = l.strip()
        if re.match(r'^Página \d+$', ls) or ls.startswith('ebooks EDAMI') or ls.startswith('Colección ebooks de EDAMI'):
            continue
        lineas.append(ls)
    return '\n'.join(lineas)

TIPO = {'K':chess.KING,'Q':chess.QUEEN,'R':chess.ROOK,'B':chess.BISHOP,'N':chess.KNIGHT}
SAN_EN = re.compile(r'^([KQRBN])?([a-h]?[1-8]?)x?([a-h][1-8])(?:=?([QRBN]))?$')

_JC = {}
def jugar(b, san_es):
    k = (b._transposition_key(), san_es)
    if k in _JC: return _JC[k]
    if len(_JC) > 2000000: _JC.clear()
    r = _jugar(b, san_es); _JC[k] = r
    return r

def _jugar(b, san_es):
    en = re.sub(r'[+#!?]', '', a_ingles(san_es))
    if en in ('O-O', 'O-O-O'):
        for mv in b.legal_moves:
            if b.is_castling(mv) and (chess.square_file(mv.to_square) == 6) == (en == 'O-O'):
                return mv
        return None
    m = SAN_EN.match(en)
    if not m: return None
    pieza, pista, dest, promo = m.groups()
    tipo = TIPO[pieza] if pieza else chess.PAWN
    to = chess.parse_square(dest)
    prom = TIPO[promo] if promo else None
    hall = []
    for mv in b.generate_legal_moves(to_mask=chess.BB_SQUARES[to]):
        if b.piece_type_at(mv.from_square) != tipo: continue
        fs = chess.square_name(mv.from_square)
        if pista and any(c not in fs for c in pista): continue
        if tipo == chess.PAWN:
            if not pista and fs[0] != dest[0]: continue
            if mv.promotion and mv.promotion != (prom or chess.QUEEN): continue
        hall.append(mv)
    return hall[0] if len(hall) == 1 else None

class Tok:
    __slots__=('t','d','num','neg','san','nag','pos','sigue')
    def __init__(s,t,d,pos):
        s.t=t; s.d=d; s.pos=pos; s.num=None; s.neg=False; s.san=None; s.nag=''
        tt=t.lstrip('[(').rstrip(')];,')
        if tt:
            m=MOV.match(tt)
            if m:
                s.num=int(m.group(1)) if m.group(1) else None
                s.neg=bool(m.group(2))
                s.san=m.group(3); s.nag=(m.group(4) or '')+(m.group(5) or '')

def tokenizar(texto):
    out=[]; cuad=0; par=0
    for m in re.finditer(r'\S+', texto):
        t=m.group(0)
        for ch in t:
            if ch=='[':
                cuad=1; par=0     # los corchetes no se anidan: uno nuevo cierra el anterior
                break
            if ch=='(': par+=1; break
            if ch in '])': break
        d0=cuad+par
        for ch in t[1:] if t[0] in '[(' else t:
            if ch=='[': cuad=1; par=0
            elif ch=='(': par+=1
        for ch in t:
            if ch==']': cuad=0; par=0
            elif ch==')': par=max(0,par-1)
        out.append(Tok(t, d0, m.start()))
    # para cada posición: ¿hay una jugada en la línea principal antes del próximo resultado?
    sig=None; prox_res=len(out)
    for j in range(len(out)-1,-1,-1):
        x=out[j]
        if x.d==0 and RES.match(x.t.strip('.,;')): prox_res=j; sig=None
        x.sigue=sig is not None
        if x.d==0 and x.san is not None and x.num is not None: sig=j
    return out

VENTANA=600
SOLO_PRINCIPAL=[False]
sys.setrecursionlimit(100000)

def candidatos(toks, i, b):
    n=b.fullmove_number; blancas=b.turn
    prin=[]; anid=[]; bare=[]; corte_bare=False
    for j in range(i, min(len(toks), i+VENTANA)):
        k=toks[j]
        if k.san is None:
            if k.d==0 and RES.match(k.t.strip('.,;')): break
            continue
        if k.d>0 and (SOLO_PRINCIPAL[0] or not k.sigue): continue
        if k.num is not None and k.num>n+8 and k.d==0: break
        lista = prin if k.d==0 else anid
        if k.num==n and k.neg!=blancas:
            if (k.d==0 and len(prin)<6) or (k.d>0 and len(anid)<5):
                mv=jugar(b,k.san)
                if mv: lista.append((j,mv))
        elif not blancas and k.num is None and not corte_bare and len(bare)<3:
            mv=jugar(b,k.san)
            if mv: bare.append((j,mv))
        elif k.num is not None and k.num>=n+1 and k.d==0:
            corte_bare=True
        if len(prin)>=6: break
    return sorted(prin+anid+bare)

def cierre(toks, i):
    """1000 si justo después viene el resultado de la partida."""
    for k in range(i, min(len(toks), i+60)):
        x=toks[k]
        if RES.match(x.t.strip('.,;[]()')): return 1000
        if x.d==0 and x.san is not None and x.num is not None: return 0
    return 0

class Presupuesto(Exception): pass
PRESUPUESTO=[0]

def resolver(toks, i, b, memo, prof=0):
    PRESUPUESTO[0]-=1
    if PRESUPUESTO[0]<0: raise Presupuesto()
    clave=(i, b._transposition_key(), b.fullmove_number)
    if clave in memo: return memo[clave]
    mejor=(cierre(toks, i), [])
    for j,mv in candidatos(toks, i, b):
        b.push(mv)
        sub=resolver(toks, j+1, b, memo, prof+1)
        b.pop()
        pen=1 if toks[j].d>0 else 0
        cand=(sub[0]+(1 if pen else 10), [(j,mv)]+sub[1])
        if cand[0]>mejor[0]: mejor=cand
    memo[clave]=mejor
    return mejor

HDR_NOMBRE = re.compile(r"[A-ZÁÉÍÓÚÑ][\w'.,ÁÉÍÓÚÑáéíóúñü\- ]*\s-\s[A-ZÁÉÍÓÚÑ]|[A-ZÁÉÍÓÚÑ][\w'ÁÉÍÓÚÑáéíóúñü]+,\s?[A-Z]")

def lineas_previas(texto, pos, n=8):
    ini = texto.rfind('\n', 0, pos)
    prev = texto[:ini].split('\n')[-n:]
    return prev

def es_cabecera(prev):
    for l in prev[-7:]:
        if HDR_NOMBRE.search(l) and not re.search(r'\d+\.', l): return True
        if re.search(r'\[[A-E]\d\d\]', l) or 'Comentarios' in l: return True
    return False

def partidas_de(texto):
    toks = tokenizar(texto)
    juegos = []
    i = 0
    while i < len(toks):
        k = toks[i]
        if k.san is not None and k.num is not None and k.d == 0:
            prev = lineas_previas(texto, k.pos)
            cab = es_cabecera(prev)
            if k.num == 1 and not k.neg:
                b = chess.Board()
                if jugar(b, k.san):
                    try:
                        PRESUPUESTO[0]=400000
                        n, path = resolver(toks, i, b, {})
                    except Presupuesto:
                        VENTANA_ANT=globals()['VENTANA']; globals()['VENTANA']=150
                        try:
                            PRESUPUESTO[0]=400000; n, path = resolver(toks, i, b, {})
                        except Presupuesto:
                            n, path = 0, []
                        globals()['VENTANA']=VENTANA_ANT
                    n = len(path)
                    if path and (n >= 10 or (cab and n >= 4)):
                        juegos.append({'tipo': 'completa', 'i0': i, 'path': path, 'cab': prev, 'toks': toks})
                        i = path[-1][0] + 1
                        continue
            if cab and not (k.num == 1 and not k.neg and jugar(chess.Board(), k.san)):
                juegos.append({'tipo': 'fragmento', 'i0': i, 'num': k.num, 'neg': k.neg, 'san': k.san, 'cab': prev, 'toks': toks})
        i += 1
    return juegos, toks

def resultado_tras(toks, j, b):
    """Busca el resultado poco después de la última jugada."""
    for k in range(j+1, min(len(toks), j+60)):
        x=toks[k]
        if RES.match(x.t.strip('.,;[]()')):
            r=x.t.strip('.,;[]()').replace('1/2-1/2','½-½')
            return r, k
        if x.san is not None and x.num is not None and x.d==0: break
    if b.is_checkmate(): return ('1-0' if not b.turn else '0-1'), None
    return None, None
