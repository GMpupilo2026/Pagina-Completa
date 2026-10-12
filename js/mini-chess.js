/* Ajedrez Integral — MiniChess: movimientos legales sin exigir reyes.

   chess.js exige los dos reyes, y los ejemplos para aprender a menudo no los
   tienen (una torre sola juntando estrellas, un peón que corona). Vivía dentro
   de js/entreno-desafios.js; se mudó acá tal cual cuando lo necesitó también
   Aprende a jugar (js/aprende-a-jugar.js): una sola copia de cada cosa.
   Es un script clásico: `MiniChess` queda global, como cuando vivía en
   Desafíos. En node se exporta para los verificadores.

   Misma interfaz que usan el tablero, el arrastre y el modo adaptado:
   get(sq) -> {type,color} | null, turn(), moves({square, verbose}), move({from,to,promotion}),
   in_check(), fen(). Reglas: movimientos normales de todas las piezas, capturas,
   coronación, enroque (según los derechos del FEN) y captura al paso. Si hay rey,
   no se permite dejarlo en jaque. */
class MiniChess {
  constructor(fen){ this.load(fen); }
  load(fen){
    const parts = fen.split(' ');
    this.board = {};
    let rank = 8, file = 0;
    for(const ch of parts[0]){
      if(ch === '/'){ rank--; file = 0; }
      else if(/\d/.test(ch)){ file += parseInt(ch, 10); }
      else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        this.board['abcdefgh'[file] + rank] = { type: ch.toLowerCase(), color };
        file++;
      }
    }
    this.side = parts[1] || 'w';
    this.castling = parts[2] && parts[2] !== '-' ? parts[2] : '';
    this.ep = parts[3] && parts[3] !== '-' ? parts[3] : null;
    this.history = [];
  }
  fen(){
    let rows = [];
    for(let r = 8; r >= 1; r--){
      let s = '', e = 0;
      for(let f = 0; f < 8; f++){
        const p = this.board['abcdefgh'[f] + r];
        if(p){ if(e){ s += e; e = 0; } s += p.color === 'w' ? p.type.toUpperCase() : p.type; }
        else e++;
      }
      if(e) s += e;
      rows.push(s);
    }
    return rows.join('/') + ' ' + this.side + ' ' + (this.castling || '-') + ' ' + (this.ep || '-') + ' 0 1';
  }
  get(sq){ return this.board[sq] || null; }
  turn(){ return this.side; }
  static sq(f, r){ return (f < 0 || f > 7 || r < 1 || r > 8) ? null : 'abcdefgh'[f] + r; }
  static fr(sq){ return [sq.charCodeAt(0) - 97, parseInt(sq[1], 10)]; }
  attacked(sq, byColor){
    const [tf, tr] = MiniChess.fr(sq);
    for(const from in this.board){
      const p = this.board[from];
      if(p.color !== byColor) continue;
      const [f, r] = MiniChess.fr(from);
      const df = tf - f, dr = tr - r;
      if(p.type === 'p'){
        const dir = p.color === 'w' ? 1 : -1;
        if(dr === dir && Math.abs(df) === 1) return true;
      } else if(p.type === 'n'){
        if((Math.abs(df) === 1 && Math.abs(dr) === 2) || (Math.abs(df) === 2 && Math.abs(dr) === 1)) return true;
      } else if(p.type === 'k'){
        if(Math.abs(df) <= 1 && Math.abs(dr) <= 1 && (df || dr)) return true;
      } else {
        const straight = df === 0 || dr === 0, diag = Math.abs(df) === Math.abs(dr);
        if(!(df || dr)) continue;
        if((p.type === 'r' && !straight) || (p.type === 'b' && !diag) || (p.type === 'q' && !straight && !diag)) continue;
        if(!straight && !diag) continue;
        const sf = Math.sign(df), sr = Math.sign(dr);
        let cf = f + sf, cr = r + sr, clear = true;
        while(cf !== tf || cr !== tr){
          if(this.board[MiniChess.sq(cf, cr)]){ clear = false; break; }
          cf += sf; cr += sr;
        }
        if(clear) return true;
      }
    }
    return false;
  }
  kingSquare(color){
    for(const sq in this.board){ const p = this.board[sq]; if(p.type === 'k' && p.color === color) return sq; }
    return null;
  }
  in_check(){ const k = this.kingSquare(this.side); return !!k && this.attacked(k, this.side === 'w' ? 'b' : 'w'); }
  pseudoMoves(from){
    const p = this.board[from];
    if(!p || p.color !== this.side) return [];
    const [f, r] = MiniChess.fr(from);
    const out = [];
    const add = (to, flags, extra) => { if(to) out.push(Object.assign({ from, to, flags, piece: p.type, color: p.color }, extra || {})); };
    const enemy = p.color === 'w' ? 'b' : 'w';
    if(p.type === 'p'){
      const dir = p.color === 'w' ? 1 : -1, start = p.color === 'w' ? 2 : 7, last = p.color === 'w' ? 8 : 1;
      const one = MiniChess.sq(f, r + dir);
      if(one && !this.board[one]){
        add(one, r + dir === last ? 'np' : 'n');
        const two = MiniChess.sq(f, r + 2 * dir);
        if(r === start && two && !this.board[two]) add(two, 'b');
      }
      for(const df of [-1, 1]){
        const to = MiniChess.sq(f + df, r + dir);
        if(!to) continue;
        if(this.board[to] && this.board[to].color === enemy) add(to, r + dir === last ? 'cp' : 'c', { captured: this.board[to].type });
        else if(to === this.ep) add(to, 'e', { captured: 'p' });
      }
    } else if(p.type === 'n' || p.type === 'k'){
      const deltas = p.type === 'n' ? [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]] : [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      for(const [df, dr] of deltas){
        const to = MiniChess.sq(f + df, r + dr);
        if(!to) continue;
        if(!this.board[to]) add(to, 'n');
        else if(this.board[to].color === enemy) add(to, 'c', { captured: this.board[to].type });
      }
      if(p.type === 'k'){
        const home = p.color === 'w' ? 1 : 8;
        const rights = p.color === 'w' ? this.castling.replace(/[a-z]/g, '') : this.castling.replace(/[A-Z]/g, '');
        if(from === 'e' + home && !this.attacked(from, enemy)){
          if(rights.toLowerCase().includes('k') && !this.board['f' + home] && !this.board['g' + home] && this.board['h' + home] && this.board['h' + home].type === 'r' &&
             !this.attacked('f' + home, enemy) && !this.attacked('g' + home, enemy)) add('g' + home, 'k');
          if(rights.toLowerCase().includes('q') && !this.board['d' + home] && !this.board['c' + home] && !this.board['b' + home] && this.board['a' + home] && this.board['a' + home].type === 'r' &&
             !this.attacked('d' + home, enemy) && !this.attacked('c' + home, enemy)) add('c' + home, 'q');
        }
      }
    } else {
      const dirs = p.type === 'r' ? [[1,0],[-1,0],[0,1],[0,-1]] : p.type === 'b' ? [[1,1],[1,-1],[-1,1],[-1,-1]] : [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      for(const [df, dr] of dirs){
        let cf = f + df, cr = r + dr;
        while(true){
          const to = MiniChess.sq(cf, cr);
          if(!to) break;
          if(!this.board[to]) add(to, 'n');
          else { if(this.board[to].color === enemy) add(to, 'c', { captured: this.board[to].type }); break; }
          cf += df; cr += dr;
        }
      }
    }
    return out;
  }
  apply(m){
    const p = this.board[m.from];
    delete this.board[m.from];
    if(m.flags === 'e'){ const [tf, tr] = MiniChess.fr(m.to); delete this.board[MiniChess.sq(tf, tr - (p.color === 'w' ? 1 : -1))]; }
    this.board[m.to] = m.promotion ? { type: m.promotion, color: p.color } : p;
    if(m.flags === 'k' || m.flags === 'q'){
      const home = m.to[1];
      if(m.flags === 'k'){ this.board['f' + home] = this.board['h' + home]; delete this.board['h' + home]; }
      else { this.board['d' + home] = this.board['a' + home]; delete this.board['a' + home]; }
    }
    if(p.type === 'k') this.castling = p.color === 'w' ? this.castling.replace(/[KQ]/g, '') : this.castling.replace(/[kq]/g, '');
    if(p.type === 'r'){ const map = { h1:'K', a1:'Q', h8:'k', a8:'q' }; if(map[m.from]) this.castling = this.castling.replace(map[m.from], ''); }
    this.ep = (m.flags === 'b') ? MiniChess.sq(MiniChess.fr(m.to)[0], (MiniChess.fr(m.from)[1] + MiniChess.fr(m.to)[1]) / 2) : null;
    this.side = this.side === 'w' ? 'b' : 'w';
  }
  legalMoves(from){
    const out = [];
    for(const m of this.pseudoMoves(from)){
      const promos = m.flags.includes('p') ? ['q','r','b','n'] : [null];
      for(const promotion of promos){
        const mm = Object.assign({}, m, promotion ? { promotion } : {});
        const snap = { board: Object.assign({}, this.board), side: this.side, castling: this.castling, ep: this.ep };
        this.apply(mm);
        const k = this.kingSquare(snap.side);
        const ok = !k || !this.attacked(k, this.side);
        this.board = snap.board; this.side = snap.side; this.castling = snap.castling; this.ep = snap.ep;
        if(ok) out.push(mm);
      }
    }
    return out;
  }
  moves(opts){
    const sqs = opts && opts.square ? [opts.square] : Object.keys(this.board);
    let out = [];
    sqs.forEach((sq) => { out = out.concat(this.legalMoves(sq)); });
    out.forEach((m) => { m.san = this.san(m); });
    return out;
  }
  san(m){
    if(m.flags === 'k') return 'O-O';
    if(m.flags === 'q') return 'O-O-O';
    const cap = m.flags.includes('c') || m.flags === 'e';
    let s = '';
    if(m.piece === 'p'){ s = cap ? m.from[0] + 'x' + m.to : m.to; if(m.promotion) s += '=' + m.promotion.toUpperCase(); }
    else {
      s = m.piece.toUpperCase();
      // desambiguación sencilla
      const others = Object.keys(this.board).filter((sq) => sq !== m.from && this.board[sq].type === m.piece && this.board[sq].color === m.color)
        .filter((sq) => this.legalMoves(sq).some((x) => x.to === m.to));
      if(others.length){
        if(!others.some((sq) => sq[0] === m.from[0])) s += m.from[0];
        else if(!others.some((sq) => sq[1] === m.from[1])) s += m.from[1];
        else s += m.from;
      }
      s += (cap ? 'x' : '') + m.to;
    }
    return s;
  }
  move(arg){
    const cands = this.legalMoves(arg.from).filter((m) => m.to === arg.to && (!m.promotion || m.promotion === (arg.promotion || 'q')));
    if(!cands.length) return null;
    const m = cands[0];
    m.san = this.san(m);
    this.apply(m);
    const opp = this.kingSquare(this.side);
    if(opp && this.attacked(opp, this.side === 'w' ? 'b' : 'w')){
      const any = Object.keys(this.board).some((sq) => this.board[sq].color === this.side && this.legalMoves(sq).length);
      m.san += any ? '+' : '#';
    }
    this.history.push(m);
    return m;
  }
  uci(m){ return m.from + m.to + (m.promotion || ''); }
}

// Una clase no queda en `window` sola: la clase en vivo la busca ahí al cargarla.
if (typeof window !== "undefined") window.MiniChess = MiniChess;
if (typeof module !== "undefined" && module.exports) module.exports = MiniChess;
