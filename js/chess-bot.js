/* ===== Ajedrez Integral — Chess Bot (juego contra la IA) =====
 * Motor de ajedrez completo en JavaScript:
 * - Generación de movimientos legales (incluye enroque, captura al paso y promoción)
 * - Detección de jaque, mate y ahogado
 * - IA con minimax + poda alfa-beta (3 niveles de dificultad)
 */
(function () {
    'use strict';
    const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    function initialBoard() {
        return [
            ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
            ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
            ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
        ];
    }
    function cloneBoard(b) { return b.map(row => row.slice()); }
    function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
    function isWhite(p) { return p && p === p.toUpperCase(); }
    function colorOf(p) { return isWhite(p) ? 'w' : 'b'; }
    function createGame() {
        return { board: initialBoard(), turn: 'w', castling: { wK: true, wQ: true, bK: true, bQ: true }, enPassant: null, history: [], capturedByWhite: [], capturedByBlack: [] };
    }
    const KNIGHT_DIRS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    const KING_DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    const BISHOP_DIRS = [[-1,-1],[-1,1],[1,-1],[1,1]];
    const ROOK_DIRS = [[-1,0],[1,0],[0,-1],[0,1]];
    function generatePseudoMoves(board, turn, castling, enPassant) {
        const moves = [];
        const enemy = turn === 'w' ? 'b' : 'w';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = board[r][c];
                if (!p || colorOf(p) !== turn) continue;
                const type = p.toLowerCase();
                if (type === 'p') {
                    const dir = turn === 'w' ? -1 : 1;
                    const startRow = turn === 'w' ? 6 : 1;
                    const promoRow = turn === 'w' ? 0 : 7;
                    if (inBounds(r + dir, c) && !board[r + dir][c]) {
                        if (r + dir === promoRow) { ['q','r','b','n'].forEach(pr => moves.push({ from: [r,c], to: [r+dir,c], promo: pr })); }
                        else { moves.push({ from: [r,c], to: [r+dir,c] }); }
                        if (r === startRow && !board[r+2*dir][c]) { moves.push({ from: [r,c], to: [r+2*dir,c] }); }
                    }
                    for (const dc of [-1, 1]) {
                        const nc = c + dc;
                        if (!inBounds(r + dir, nc)) continue;
                        const target = board[r + dir][nc];
                        if (target && colorOf(target) === enemy) {
                            if (r + dir === promoRow) { ['q','r','b','n'].forEach(pr => moves.push({ from: [r,c], to: [r+dir,nc], promo: pr })); }
                            else { moves.push({ from: [r,c], to: [r+dir,nc] }); }
                        }
                        if (enPassant && enPassant.r === r + dir && enPassant.c === nc) { moves.push({ from: [r,c], to: [r+dir,nc], enPassant: true }); }
                    }
                } else if (type === 'n') {
                    for (const [dr, dc] of KNIGHT_DIRS) {
                        const nr = r + dr, nc = c + dc;
                        if (!inBounds(nr, nc)) continue;
                        const target = board[nr][nc];
                        if (!target || colorOf(target) === enemy) { moves.push({ from: [r,c], to: [nr,nc] }); }
                    }
                } else if (type === 'b' || type === 'r' || type === 'q') {
                    const dirs = type === 'b' ? BISHOP_DIRS : type === 'r' ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS];
                    for (const [dr, dc] of dirs) {
                        let nr = r + dr, nc = c + dc;
                        while (inBounds(nr, nc)) {
                            const target = board[nr][nc];
                            if (!target) { moves.push({ from: [r,c], to: [nr,nc] }); }
                            else { if (colorOf(target) === enemy) moves.push({ from: [r,c], to: [nr,nc] }); break; }
                            nr += dr; nc += dc;
                        }
                    }
                } else if (type === 'k') {
                    for (const [dr, dc] of KING_DIRS) {
                        const nr = r + dr, nc = c + dc;
                        if (!inBounds(nr, nc)) continue;
                        const target = board[nr][nc];
                        if (!target || colorOf(target) === enemy) { moves.push({ from: [r,c], to: [nr,nc] }); }
                    }
                    const row = turn === 'w' ? 7 : 0;
                    if (r === row && c === 4) {
                        if (castling[turn+'K'] && !board[row][5] && !board[row][6] && board[row][7] === (turn==='w'?'R':'r')) { moves.push({ from:[r,c], to:[row,6], castle:'K' }); }
                        if (castling[turn+'Q'] && !board[row][3] && !board[row][2] && !board[row][1] && board[row][0] === (turn==='w'?'R':'r')) { moves.push({ from:[r,c], to:[row,2], castle:'Q' }); }
                    }
                }
            }
        }
        return moves;
    }
    function applyMove(game, move) {
        const { board, turn, castling, enPassant } = game;
        const [fr, fc] = move.from; const [tr, tc] = move.to;
        const piece = board[fr][fc]; const captured = board[tr][tc];
        const undo = { piece, captured, fr, fc, tr, tc, castling: { ...castling }, enPassant };
        if (move.enPassant) {
            const capRow = turn === 'w' ? tr + 1 : tr - 1;
            undo.captured = board[capRow][tc];
            undo.enPassantCapturedRow = capRow;
            board[capRow][tc] = null;
        }
        board[tr][tc] = move.promo || piece;
        board[fr][fc] = null;
        if (move.castle === 'K') { board[tr][tc-1] = board[tr][tc+1]; board[tr][tc+1] = null; }
        else if (move.castle === 'Q') { board[tr][tc+1] = board[tr][tc-1]; board[tr][tc-1] = null; }
        if (piece === 'K') { game.castling.wK = false; game.castling.wQ = false; }
        if (piece === 'k') { game.castling.bK = false; game.castling.bQ = false; }
        if (piece === 'R' && fr === 7 && fc === 0) game.castling.wQ = false;
        if (piece === 'R' && fr === 7 && fc === 7) game.castling.wK = false;
        if (piece === 'r' && fr === 0 && fc === 0) game.castling.bQ = false;
        if (piece === 'r' && fr === 0 && fc === 7) game.castling.bK = false;
        if (captured === 'R' && tr === 7 && tc === 0) game.castling.wQ = false;
        if (captured === 'R' && tr === 7 && tc === 7) game.castling.wK = false;
        if (captured === 'r' && tr === 0 && tc === 0) game.castling.bQ = false;
        if (captured === 'r' && tr === 0 && tc === 7) game.castling.bK = false;
        game.enPassant = null;
        if (piece.toLowerCase() === 'p' && Math.abs(tr - fr) === 2) { game.enPassant = { r: (fr+tr)/2, c: fc }; }
        if (captured) { if (turn === 'w') game.capturedByWhite.push(captured); else game.capturedByBlack.push(captured); }
        game.turn = turn === 'w' ? 'b' : 'w';
        game.history.push(undo);
        return undo;
    }
    function undoMove(game) {
        const undo = game.history.pop();
        if (!undo) return;
        const { piece, captured, fr, fc, tr, tc, castling, enPassant, enPassantCapturedRow } = undo;
        game.board[fr][fc] = piece;
        game.board[tr][tc] = captured || null;
        if (enPassantCapturedRow !== undefined) { game.board[enPassantCapturedRow][tc] = captured; game.board[tr][tc] = null; }
        if (undo.castle === 'K') { game.board[tr][tc+1] = game.board[tr][tc-1]; game.board[tr][tc-1] = null; }
        else if (undo.castle === 'Q') { game.board[tr][tc-1] = game.board[tr][tc+1]; game.board[tr][tc+1] = null; }
        game.castling = { ...castling };
        game.enPassant = enPassant;
        game.turn = game.turn === 'w' ? 'b' : 'w';
        if (captured) { if (game.turn === 'w') game.capturedByBlack.pop(); else game.capturedByWhite.pop(); }
    }
    function findKing(board, color) {
        const king = color === 'w' ? 'K' : 'k';
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c] === king) return [r, c];
        return null;
    }
    function isSquareAttacked(board, r, c, byColor) {
        const pawnDir = byColor === 'w' ? -1 : 1;
        for (const dc of [-1, 1]) { const pr = r + pawnDir, pc = c + dc; if (inBounds(pr, pc) && board[pr][pc] === (byColor === 'w' ? 'P' : 'p')) return true; }
        for (const [dr, dc] of KNIGHT_DIRS) { const nr = r + dr, nc = c + dc; if (inBounds(nr, nc) && board[nr][nc] === (byColor === 'w' ? 'N' : 'n')) return true; }
        for (const [dr, dc] of KING_DIRS) { const nr = r + dr, nc = c + dc; if (inBounds(nr, nc) && board[nr][nc] === (byColor === 'w' ? 'K' : 'k')) return true; }
        for (const [dr, dc] of BISHOP_DIRS) { let nr = r + dr, nc = c + dc; while (inBounds(nr, nc)) { const p = board[nr][nc]; if (p) { if (byColor === 'w' ? (p === 'B' || p === 'Q') : (p === 'b' || p === 'q')) return true; break; } nr += dr; nc += dc; } }
        for (const [dr, dc] of ROOK_DIRS) { let nr = r + dr, nc = c + dc; while (inBounds(nr, nc)) { const p = board[nr][nc]; if (p) { if (byColor === 'w' ? (p === 'R' || p === 'Q') : (p === 'r' || p === 'q')) return true; break; } nr += dr; nc += dc; } }
        return false;
    }
    function inCheck(board, color) { const king = findKing(board, color); if (!king) return false; return isSquareAttacked(board, king[0], king[1], color === 'w' ? 'b' : 'w'); }
    function generateLegalMoves(game) {
        const pseudo = generatePseudoMoves(game.board, game.turn, game.castling, game.enPassant);
        const legal = [];
        for (const move of pseudo) {
            if (move.castle) {
                const row = game.turn === 'w' ? 7 : 0;
                const enemy = game.turn === 'w' ? 'b' : 'w';
                const kingCol = move.castle === 'K' ? 6 : 2;
                const passCol = move.castle === 'K' ? 5 : 3;
                if (isSquareAttacked(game.board, row, 4, enemy)) continue;
                if (isSquareAttacked(game.board, row, passCol, enemy)) continue;
                if (isSquareAttacked(game.board, row, kingCol, enemy)) continue;
                legal.push(move); continue;
            }
            applyMove(game, move);
            if (!inCheck(game.board, game.turn)) legal.push(move);
            undoMove(game);
        }
        return legal;
    }
    const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
    const PST_PAWN = [[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]];
    const PST_KNIGHT = [[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]];
    const PST_BISHOP = [[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,10,10,5,0,-10],[-10,5,5,10,10,5,5,-10],[-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],[-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20]];
    const PST_ROOK = [[0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]];
    const PST_QUEEN = [[-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],[0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],[-10,0,5,0,0,0,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]];
    const PST_KING_M = [[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],[20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]];
    const PST_KING_E = [[-50,-40,-30,-20,-20,-30,-40,-50],[-30,-20,-10,0,0,-10,-20,-30],[-30,-10,20,30,30,20,-10,-30],[-30,-10,30,40,40,30,-10,-30],[-30,-10,30,40,40,30,-10,-30],[-30,-10,20,30,30,20,-10,-30],[-30,-30,0,0,0,0,-30,-30],[-50,-30,-30,-30,-30,-30,-30,-50]];
    function evaluateBoard(game) {
        const board = game.board; let score = 0; let material = 0;
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            const p = board[r][c]; if (!p) continue;
            const type = p.toLowerCase(); const white = isWhite(p); const sign = white ? 1 : -1;
            const value = PIECE_VALUES[type]; material += value;
            let pst;
            if (type === 'p') pst = PST_PAWN; else if (type === 'n') pst = PST_KNIGHT; else if (type === 'b') pst = PST_BISHOP; else if (type === 'r') pst = PST_ROOK; else if (type === 'q') pst = PST_QUEEN; else pst = material < 2600 ? PST_KING_E : PST_KING_M;
            const pstRow = white ? r : 7 - r;
            score += sign * (value + pst[pstRow][c]);
        }
        score += (game.turn === 'w' ? 10 : -10);
        return score;
    }
    function search(game, depth, alpha, beta, maximizing) {
        const moves = generateLegalMoves(game);
        if (moves.length === 0) { if (inCheck(game.board, game.turn)) return maximizing ? -99999 - depth : 99999 + depth; return 0; }
        if (depth === 0) return evaluateBoard(game);
        moves.sort((a, b) => { const av = a.captured ? PIECE_VALUES[a.captured.toLowerCase()] : 0; const bv = b.captured ? PIECE_VALUES[b.captured.toLowerCase()] : 0; return bv - av; });
        if (maximizing) { let best = -Infinity; for (const move of moves) { applyMove(game, move); best = Math.max(best, search(game, depth - 1, alpha, beta, false)); undoMove(game); alpha = Math.max(alpha, best); if (beta <= alpha) break; } return best; }
        else { let best = Infinity; for (const move of moves) { applyMove(game, move); best = Math.min(best, search(game, depth - 1, alpha, beta, true)); undoMove(game); beta = Math.min(beta, best); if (beta <= alpha) break; } return best; }
    }
    function bestMove(game, difficulty) {
        const moves = generateLegalMoves(game); if (moves.length === 0) return null;
        const depth = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3;
        const maximizing = game.turn === 'w';
        if (difficulty === 'easy') {
            const scored = [];
            for (const move of moves) { applyMove(game, move); const v = search(game, 1, -Infinity, Infinity, !maximizing); undoMove(game); scored.push({ move, v }); }
            scored.sort((a, b) => maximizing ? b.v - a.v : a.v - b.v);
            const pool = scored.slice(0, Math.min(5, scored.length));
            return pool[Math.floor(Math.random() * pool.length)].move;
        }
        let best = null; let bestVal = maximizing ? -Infinity : Infinity;
        for (const move of moves) { applyMove(game, move); const v = search(game, depth - 1, -Infinity, Infinity, !maximizing); undoMove(game); if (maximizing) { if (v > bestVal) { bestVal = v; best = move; } } else { if (v < bestVal) { bestVal = v; best = move; } } }
        return best;
    }
    function moveToAlgebraic(game, move) {
        const board = game.board; const [fr, fc] = move.from; const [tr, tc] = move.to;
        const piece = board[tr][tc] || board[fr][fc];
        const type = (move.promo || piece || 'p').toLowerCase();
        const isCapture = !!move.captured || move.enPassant;
        let san = '';
        if (move.castle === 'K') san = 'O-O'; else if (move.castle === 'Q') san = 'O-O-O';
        else {
            if (type === 'p') { if (isCapture) san = FILES[fc] + 'x' + FILES[tc] + (tr + 1); else san = FILES[tc] + (tr + 1); if (move.promo) san += '=' + move.promo.toUpperCase(); }
            else { san = type.toUpperCase(); const others = generatePseudoMoves(board, game.turn, game.castling, game.enPassant).filter(m => m.to[0] === tr && m.to[1] === tc && m.from[0] !== fr && m.from[1] !== fc && (board[m.from[0]][m.from[1]] || '').toLowerCase() === type); if (others.some(m => m.from[1] === fc)) san += FILES[fc]; else if (others.some(m => m.from[0] === fr)) san += (fr + 1); else if (others.length > 0) san += FILES[fc] + (fr + 1); if (isCapture) san += 'x'; san += FILES[tc] + (tr + 1); }
        }
        return san;
    }
    const boardEl = document.getElementById('chessboard');
    const turnIndicator = document.getElementById('turn-indicator');
    const statusMsg = document.getElementById('status-msg');
    const difficultySel = document.getElementById('difficulty');
    const resetBtn = document.getElementById('reset-btn');
    const capturedByWhite = document.getElementById('captured-by-white');
    const capturedByBlack = document.getElementById('captured-by-black');
    const moveHistory = document.getElementById('move-history');
    if (!boardEl) return;
    let game = createGame(); let selected = null; let legalMoves = []; let gameOver = false; let lastMove = null; let botThinking = false; let moveNumber = 1;
    const PIECE_GLYPH = { w: { K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙' }, b: { K:'♚',Q:'♛',R:'♜',B:'♝',N:'♞',P:'♟' } };
    function render() {
        boardEl.innerHTML = '';
        const board = game.board;
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            const sq = document.createElement('div');
            const isLight = (r + c) % 2 === 0;
            sq.className = 'square relative ' + (isLight ? 'light' : 'dark');
            sq.dataset.r = r; sq.dataset.c = c;
            const piece = board[r][c];
            if (piece) { const glyph = isWhite(piece) ? PIECE_GLYPH.w[piece] : PIECE_GLYPH.b[piece]; sq.textContent = glyph; sq.classList.add(isWhite(piece) ? 'piece-white' : 'piece-black'); }
            if (selected && selected[0] === r && selected[1] === c) sq.classList.add('selected');
            if (lastMove && ((lastMove.from[0] === r && lastMove.from[1] === c) || (lastMove.to[0] === r && lastMove.to[1] === c))) sq.classList.add('last-move');
            if (legalMoves.some(m => m.to[0] === r && m.to[1] === c)) { if (board[r][c]) sq.classList.add('legal-capture'); else sq.classList.add('legal-move'); }
            sq.addEventListener('click', () => onSquareClick(r, c));
            boardEl.appendChild(sq);
        }
        updateStatus(); renderCaptured();
    }
    function onSquareClick(r, c) {
        if (gameOver || botThinking || game.turn !== 'w') return;
        const piece = game.board[r][c];
        if (selected) { const move = legalMoves.find(m => m.to[0] === r && m.to[1] === c); if (move) { doMove(move); return; } }
        if (piece && isWhite(piece)) { selected = [r, c]; legalMoves = generateLegalMoves(game).filter(m => m.from[0] === r && m.from[1] === c); }
        else { selected = null; legalMoves = []; }
        render();
    }
    function doMove(move) {
        const san = moveToAlgebraic(game, move);
        applyMove(game, move); lastMove = move; selected = null; legalMoves = [];
        const prefix = game.turn === 'w' ? (moveNumber + '. ') : (moveNumber + '. … ');
        const entry = document.createElement('p'); entry.textContent = prefix + san;
        moveHistory.appendChild(entry);
        if (game.turn === 'w') moveNumber++;
        moveHistory.scrollTop = moveHistory.scrollHeight;
        render(); checkGameOver();
        if (!gameOver && game.turn === 'b') setTimeout(botTurn, 400);
    }
    function botTurn() {
        botThinking = true;
        statusMsg.textContent = '🤖 El bot está pensando…';
        statusMsg.classList.remove('bg-accent-500'); statusMsg.classList.add('bg-brand-600');
        setTimeout(() => {
            const move = bestMove(game, difficultySel.value);
            if (!move) { botThinking = false; checkGameOver(); return; }
            applyMove(game, move); lastMove = move; botThinking = false;
            render(); checkGameOver();
        }, 350);
    }
    function updateStatus() {
        const board = game.board; const inCheckNow = inCheck(board, game.turn);
        if (gameOver) return;
        if (game.turn === 'w') { turnIndicator.textContent = 'Turno: Blancas (tú)'; turnIndicator.classList.remove('bg-brand-600'); turnIndicator.classList.add('bg-brand-700'); statusMsg.textContent = inCheckNow ? '⚠️ ¡Jaque a tu rey!' : '¡Tu turno!'; }
        else { turnIndicator.textContent = 'Turno: Negras (bot)'; turnIndicator.classList.remove('bg-brand-700'); turnIndicator.classList.add('bg-brand-600'); statusMsg.textContent = botThinking ? '🤖 El bot está pensando…' : 'El bot juega…'; }
        if (inCheckNow) { const king = findKing(board, game.turn); if (king) { const idx = king[0] * 8 + king[1]; const sq = boardEl.children[idx]; if (sq) sq.classList.add('in-check'); } }
    }
    function checkGameOver() {
        const moves = generateLegalMoves(game);
        if (moves.length === 0) {
            gameOver = true; const check = inCheck(game.board, game.turn);
            if (check) { const winner = game.turn === 'w' ? '¡El bot te ha dado JAQUE MATE! 🤖♟️' : '¡Felicidades, has dado JAQUE MATE! 🏆'; statusMsg.textContent = winner; statusMsg.classList.remove('bg-accent-500', 'bg-brand-600'); statusMsg.classList.add('bg-green-600', 'text-white'); }
            else { statusMsg.textContent = 'Tablas por ahogado 🤝'; statusMsg.classList.remove('bg-accent-500', 'bg-brand-600'); statusMsg.classList.add('bg-brand-400', 'text-white'); }
            turnIndicator.textContent = 'Partida terminada';
        }
    }
    function renderCaptured() {
        const order = ['q', 'r', 'b', 'n', 'p'];
        const glyphs = { q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
        const byWhite = [...game.capturedByWhite].sort((a, b) => order.indexOf(a.toLowerCase()) - order.indexOf(b.toLowerCase()));
        const byBlack = [...game.capturedByBlack].sort((a, b) => order.indexOf(a.toLowerCase()) - order.indexOf(b.toLowerCase()));
        capturedByWhite.textContent = byWhite.map(p => glyphs[p.toLowerCase()]).join(' ');
        capturedByBlack.textContent = byBlack.map(p => glyphs[p.toLowerCase()]).join(' ');
    }
    function resetGame() {
        game = createGame(); selected = null; legalMoves = []; gameOver = false; lastMove = null; moveNumber = 1;
        moveHistory.innerHTML = '<p class="text-brand-300">Sin jugadas todavía…</p>';
        statusMsg.textContent = '¡Tu turno!'; statusMsg.className = 'bg-accent-500 text-brand-900 px-4 py-2 rounded-lg font-semibold text-sm';
        turnIndicator.className = 'bg-brand-700 text-white px-4 py-2 rounded-lg font-semibold text-sm'; turnIndicator.textContent = 'Turno: Blancas';
        render();
    }
    resetBtn.addEventListener('click', resetGame);
    render();
})();
