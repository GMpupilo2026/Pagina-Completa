/**
 * Ajedrez Integral — visor de cursos basados en partidas modelo
 * (cursos/protegido/data/<slug>.json). Se usa en "Desequilibrios de material" y
 * "Partidas modelo: comprender el ajedrez jugada a jugada".
 *
 * Tres componentes, que se activan sobre el fragmento del curso:
 *   <div class="cp-partida" data-id="imb-16">   partida comentada: tablero, jugadas, comentarios,
 *                                                 modo "adivinar la jugada" en los momentos clave y
 *                                                 práctica contra el motor desde cualquier posición.
 *   <div class="cp-ejercicio" data-id="ej-3">     posición para resolver: hay que encontrar la jugada.
 *   <div class="cp-quiz" data-id="lec-04">        cuestionario de opción múltiple de la lección.
 *
 * API: window.CursoPartidas.init(root)  — la llama js/curso-acceso.js.
 * Progreso: localStorage "cp:<slug>" y, con sesión, EntrenoProgress.log(slug).
 */
(function () {
  "use strict";

  const PIECE_DEFS = "<defs><g id=\"wK\" class=\"white king\" fill=\"none\" fill-rule=\"evenodd\" stroke=\"#000\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M22.5 11.63V6M20 8h5\" stroke-linejoin=\"miter\"/><path d=\"M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5\" fill=\"#fff\" stroke-linecap=\"butt\" stroke-linejoin=\"miter\"/><path d=\"M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z\" fill=\"#fff\"/><path d=\"M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0\"/></g><g id=\"wQ\" class=\"white queen\" fill=\"#fff\" fill-rule=\"evenodd\" stroke=\"#000\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM24.5 7.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM16 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM33 9a2 2 0 1 1-4 0 2 2 0 1 1 4 0z\"/><path d=\"M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12zM9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z\" stroke-linecap=\"butt\"/><path d=\"M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0\" fill=\"none\"/></g><g id=\"wR\" class=\"white rook\" fill=\"#fff\" fill-rule=\"evenodd\" stroke=\"#000\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5\" stroke-linecap=\"butt\"/><path d=\"M34 14l-3 3H14l-3-3\"/><path d=\"M31 17v12.5H14V17\" stroke-linecap=\"butt\" stroke-linejoin=\"miter\"/><path d=\"M31 29.5l1.5 2.5h-20l1.5-2.5\"/><path d=\"M11 14h23\" fill=\"none\" stroke-linejoin=\"miter\"/></g><g id=\"wB\" class=\"white bishop\" fill=\"none\" fill-rule=\"evenodd\" stroke=\"#000\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><g fill=\"#fff\" stroke-linecap=\"butt\"><path d=\"M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2zM15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2zM25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z\"/></g><path d=\"M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5\" stroke-linejoin=\"miter\"/></g><g id=\"wN\" class=\"white knight\" fill=\"none\" fill-rule=\"evenodd\" stroke=\"#000\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18\" style=\"fill:#ffffff; stroke:#000000;\"/><path d=\"M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10\" style=\"fill:#ffffff; stroke:#000000;\"/><path d=\"M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z\" style=\"fill:#000000; stroke:#000000;\"/><path d=\"M 15 15.5 A 0.5 1.5 0 1 1 14,15.5 A 0.5 1.5 0 1 1 15 15.5 z\" transform=\"matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)\" style=\"fill:#000000; stroke:#000000;\"/></g><g id=\"wP\" class=\"white pawn\"><path d=\"M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z\" fill=\"#fff\" stroke=\"#000\" stroke-width=\"1.5\" stroke-linecap=\"round\"/></g><g id=\"bK\" class=\"black king\" fill=\"none\" fill-rule=\"evenodd\" stroke=\"#000\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M22.5 11.63V6\" stroke-linejoin=\"miter\"/><path d=\"M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5\" fill=\"#000\" stroke-linecap=\"butt\" stroke-linejoin=\"miter\"/><path d=\"M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z\" fill=\"#000\"/><path d=\"M20 8h5\" stroke-linejoin=\"miter\"/><path d=\"M32 29.5s8.5-4 6.03-9.65C34.15 14 25 18 22.5 24.5l.01 2.1-.01-2.1C20 18 9.906 14 6.997 19.85c-2.497 5.65 4.853 9 4.853 9M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0\" stroke=\"#fff\"/></g><g id=\"bQ\" class=\"black queen\" fill=\"#000\" fill-rule=\"evenodd\" stroke=\"#000\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><g fill=\"#000\" stroke=\"none\"><circle cx=\"6\" cy=\"12\" r=\"2.75\"/><circle cx=\"14\" cy=\"9\" r=\"2.75\"/><circle cx=\"22.5\" cy=\"8\" r=\"2.75\"/><circle cx=\"31\" cy=\"9\" r=\"2.75\"/><circle cx=\"39\" cy=\"12\" r=\"2.75\"/></g><path d=\"M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26zM9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z\" stroke-linecap=\"butt\"/><path d=\"M11 38.5a35 35 1 0 0 23 0\" fill=\"none\" stroke-linecap=\"butt\"/><path d=\"M11 29a35 35 1 0 1 23 0M12.5 31.5h20M11.5 34.5a35 35 1 0 0 22 0M10.5 37.5a35 35 1 0 0 24 0\" fill=\"none\" stroke=\"#fff\"/></g><g id=\"bR\" class=\"black rook\" fill=\"#000\" fill-rule=\"evenodd\" stroke=\"#000\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 39h27v-3H9v3zM12.5 32l1.5-2.5h17l1.5 2.5h-20zM12 36v-4h21v4H12z\" stroke-linecap=\"butt\"/><path d=\"M14 29.5v-13h17v13H14z\" stroke-linecap=\"butt\" stroke-linejoin=\"miter\"/><path d=\"M14 16.5L11 14h23l-3 2.5H14zM11 14V9h4v2h5V9h5v2h5V9h4v5H11z\" stroke-linecap=\"butt\"/><path d=\"M12 35.5h21M13 31.5h19M14 29.5h17M14 16.5h17M11 14h23\" fill=\"none\" stroke=\"#fff\" stroke-width=\"1\" stroke-linejoin=\"miter\"/></g><g id=\"bB\" class=\"black bishop\" fill=\"none\" fill-rule=\"evenodd\" stroke=\"#000\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2zm6-4c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2zM25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z\" fill=\"#000\" stroke-linecap=\"butt\"/><path d=\"M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5\" stroke=\"#fff\" stroke-linejoin=\"miter\"/></g><g id=\"bN\" class=\"black knight\" fill=\"none\" fill-rule=\"evenodd\" stroke=\"#000\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18\" style=\"fill:#000000; stroke:#000000;\"/><path d=\"M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10\" style=\"fill:#000000; stroke:#000000;\"/><path d=\"M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z\" style=\"fill:#ececec; stroke:#ececec;\"/><path d=\"M 15 15.5 A 0.5 1.5 0 1 1 14,15.5 A 0.5 1.5 0 1 1 15 15.5 z\" transform=\"matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)\" style=\"fill:#ececec; stroke:#ececec;\"/><path d=\"M 24.55,10.4 L 24.1,11.85 L 24.6,12 C 27.75,13 30.25,14.49 32.5,18.75 C 34.75,23.01 35.75,29.06 35.25,39 L 35.2,39.5 L 37.45,39.5 L 37.5,39 C 38,28.94 36.62,22.15 34.25,17.66 C 31.88,13.17 28.46,11.02 25.06,10.5 L 24.55,10.4 z \" style=\"fill:#ececec; stroke:none;\"/></g><g id=\"bP\" class=\"black pawn\"><path d=\"M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z\" fill=\"#000\" stroke=\"#000\" stroke-width=\"1.5\" stroke-linecap=\"round\"/></g></defs>";
  const LIGHT = "#f0dcc0", DARK = "#a5744a", BORDER = "#2b1d12", MARK = "#c8961e", SEL = "#3b82f6", OK = "#2f855a", BAD = "#c53030";
  const ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
  const RES_TXT = { "1-0": "Ganan blancas", "0-1": "Ganan negras", "½-½": "Tablas", "": "" };

  let data = null, dataPromise = null, defsInjected = false, slug = null, cmdSeq = 0;

  // Carpeta de datos relativa a ESTE archivo (no a la página): así el visor funciona
  // igual desde cursos/<curso>.html y desde cursos/academia/<curso>.html.
  const DATA_BASE = (function () {
    try {
      const me = document.currentScript && document.currentScript.src;
      if (me) return new URL("../cursos/protegido/data/", me).href;
    } catch (e) {}
    return "protegido/data/";
  })();
  function loadData(root) {
    if (data) return Promise.resolve(data);
    if (dataPromise) return dataPromise;
    const holder = (root && root.closest && root.closest("[data-course]")) || document.querySelector("[data-course]");
    slug = holder ? holder.dataset.course : "curso";
    dataPromise = fetch(DATA_BASE + slug + ".json", { credentials: "same-origin" })
      .then((r) => { if (!r.ok) throw new Error("datos " + r.status); return r.json(); })
      .then((d) => { data = d; return d; });
    return dataPromise;
  }

  function injectDefs() {
    if (defsInjected) return;
    const holder = document.createElement("div");
    holder.setAttribute("aria-hidden", "true");
    holder.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    holder.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="0" height="0">' + PIECE_DEFS + "</svg>";
    document.body.appendChild(holder);
    defsInjected = true;
  }

  // ---------- utilidades ----------
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function esSan(san) { return String(san).replace(/^([KQRBN])/, (m, p) => ES[p]).replace(/=([QRBN])/, (m, p) => "=" + ES[p]); }
  function parseFen(fen) {
    const parts = fen.split(" "), rows = parts[0].split("/"), board = {};
    for (let r = 0; r < 8; r++) { let f = 0; for (const ch of rows[r]) { if (/\d/.test(ch)) f += parseInt(ch, 10); else { board["abcdefgh"[f] + (8 - r)] = ch; f++; } } }
    return { board, turn: parts[1] || "w", full: parseInt(parts[5] || "1", 10) };
  }
  function describe(fen) {
    const { board, turn } = parseFen(fen);
    const names = { K: "rey", Q: "dama", R: "torre", B: "alfil", N: "caballo", P: "peón" };
    const out = [];
    [["w", "Blancas"], ["b", "Negras"]].forEach(([col, nom]) => {
      const parts = [];
      "KQRBNP".split("").forEach((t) => {
        const sqs = Object.keys(board).filter((sq) => board[sq] === (col === "w" ? t : t.toLowerCase())).sort();
        if (sqs.length) parts.push(names[t] + (sqs.length > 1 ? "s" : "") + " en " + sqs.join(", "));
      });
      out.push(nom + ": " + (parts.join("; ") || "sin piezas") + ".");
    });
    return out.join(" ") + (turn === "w" ? " Juegan blancas." : " Juegan negras.");
  }
  function moveLabel(m) { return (m.color === "w" ? m.n + "." : m.n + "…") + esSan(m.san) + (m.nag || ""); }

  // ---------- tablero SVG ----------
  function boardSvg(fen, opts) {
    opts = opts || {};
    const { board, turn } = parseFen(fen);
    const size = 100, cell = size / 8, pad = 5.5, total = size + 2 * pad, flip = !!opts.flip;
    const s = ['<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' + total + " " + total + '" class="cp-svg" role="img" aria-label="' + esc(opts.label || "Tablero") + '">'];
    s.push('<rect x="0" y="0" width="' + total + '" height="' + total + '" fill="#fff"/>');
    s.push('<rect x="' + (pad - 1) + '" y="' + (pad - 1) + '" width="' + (size + 2) + '" height="' + (size + 2) + '" fill="' + BORDER + '"/>');
    const xy = (sq) => { let f = "abcdefgh".indexOf(sq[0]), r = 8 - parseInt(sq[1], 10); if (flip) { f = 7 - f; r = 7 - r; } return [pad + f * cell, pad + r * cell]; };
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const sq = "abcdefgh"[flip ? 7 - c : c] + (flip ? r + 1 : 8 - r);
      s.push('<rect data-sq="' + sq + '" x="' + (pad + c * cell) + '" y="' + (pad + r * cell) + '" width="' + cell + '" height="' + cell + '" fill="' + ((r + c) % 2 === 0 ? LIGHT : DARK) + '"/>');
    }
    const shade = (sqs, color, op) => (sqs || []).forEach((sq) => { const [x, y] = xy(sq); s.push('<rect x="' + x + '" y="' + y + '" width="' + cell + '" height="' + cell + '" fill="' + color + '" fill-opacity="' + op + '" pointer-events="none"/>'); });
    shade(opts.last, MARK, 0.45); shade(opts.sel ? [opts.sel] : [], SEL, 0.45); shade(opts.good, OK, 0.5); shade(opts.bad, BAD, 0.5);
    for (let c = 0; c < 8; c++) s.push('<text x="' + (pad + c * cell + cell / 2) + '" y="' + (total - 1.2) + '" font-size="3.6" fill="#6b5442" text-anchor="middle" font-family="sans-serif">' + "abcdefgh"[flip ? 7 - c : c] + "</text>");
    for (let r = 0; r < 8; r++) s.push('<text x="' + (pad * 0.45) + '" y="' + (pad + r * cell + cell / 2 + 1.3) + '" font-size="3.6" fill="#6b5442" text-anchor="middle" font-family="sans-serif">' + (flip ? r + 1 : 8 - r) + "</text>");
    (opts.dots || []).forEach((sq) => { const [x, y] = xy(sq); s.push('<circle cx="' + (x + cell / 2) + '" cy="' + (y + cell / 2) + '" r="' + (cell * 0.14) + '" fill="' + SEL + '" fill-opacity="0.55" pointer-events="none"/>'); });
    const scale = (cell / 45) * 0.9, off = (cell - 45 * scale) / 2;
    Object.keys(board).forEach((sq) => {
      const p = board[sq]; const [x, y] = xy(sq);
      s.push('<use xlink:href="#' + (p === p.toUpperCase() ? "w" : "b") + p.toUpperCase() + '" transform="translate(' + (x + off).toFixed(2) + "," + (y + off).toFixed(2) + ") scale(" + scale.toFixed(4) + ')" pointer-events="none"/>');
    });
    let cy = turn === "w" ? pad + size - cell * 0.35 : pad + cell * 0.35;
    if (flip) cy = turn === "w" ? pad + cell * 0.35 : pad + size - cell * 0.35;
    s.push('<circle cx="' + (total - pad * 0.5) + '" cy="' + cy + '" r="1.6" fill="' + (turn === "w" ? "#fff" : "#1f1710") + '" stroke="#1f1710" stroke-width="0.4"/>');
    s.push("</svg>");
    return s.join("");
  }

  // ---------- progreso ----------
  function progreso() { try { return JSON.parse(localStorage.getItem("cp:" + slug) || "{}"); } catch (e) { return {}; } }
  function guardar(id, rec) {
    try { const p = progreso(); p[id] = Object.assign({ fecha: new Date().toISOString().slice(0, 10) }, rec); localStorage.setItem("cp:" + slug, JSON.stringify(p)); } catch (e) {}
    if (window.EntrenoProgress) { try { window.EntrenoProgress.log(slug, Object.assign({ item: id }, rec)); } catch (e) {} }
    document.dispatchEvent(new CustomEvent("cp:progreso", { detail: { id, rec } }));
  }

  // ---------- entrada de jugadas sobre el tablero (compartido) ----------
  // Permite al usuario jugar una jugada con clics; llama onMove(uciConPromocion) cuando es legal.
  function boardInput(boardEl, promoEl, getGame, onMove, render) {
    let sel = null, pendingPromo = null, enabled = false;
    boardEl.addEventListener("click", (ev) => {
      if (!enabled || pendingPromo) return;
      const r = ev.target.closest("[data-sq]"); if (!r) return;
      const game = getGame(); if (!game) return;
      const sq = r.dataset.sq;
      if (sel) {
        const mv = game.moves({ square: sel, verbose: true }).find((m) => m.to === sq);
        if (mv) {
          if (mv.flags.indexOf("p") !== -1) { pendingPromo = { from: sel, to: sq }; promoEl.hidden = false; render(sel); return; }
          const from = sel; sel = null; onMove(from + sq); return;
        }
      }
      const p = game.get(sq);
      sel = p && p.color === game.turn() ? sq : null;
      render(sel);
    });
    promoEl.addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-p]"); if (!b || !pendingPromo) return;
      const mv = pendingPromo.from + pendingPromo.to + b.dataset.p; pendingPromo = null; sel = null; promoEl.hidden = true; onMove(mv);
    });
    return { enable(v) { enabled = v; sel = null; pendingPromo = null; promoEl.hidden = true; }, get sel() { return sel; } };
  }

  // ---------- 1. partida comentada ----------
  function makeGame(el, g) {
    const moves = g.moves, claves = g.claves || [];
    const claveAt = {}; claves.forEach((c) => { claveAt[c.ply] = c; });
    const state = { ply: 0, flip: g.orientacion === "b", mode: "ver", guess: null, intentos: 0, aciertos: 0, fallos: 0, pendientes: null };
    const startTurn = parseFen(g.start_fen).turn;
    const cmdId = "cp-cmd-" + (++cmdSeq);
    el.classList.add("cp-viewer");
    el.innerHTML =
      '<div class="cp-head"><span class="cp-players">' + esc(g.blancas) + " – " + esc(g.negras) + '</span><span class="cp-event">' + esc(g.evento || "") + '</span><span class="cp-res" data-res="' + esc(g.resultado) + '">' + esc(g.resultado || "") + "</span></div>" +
      '<div class="cp-board" tabindex="0" aria-label="Tablero de la partida"></div>' +
      '<div class="cp-side">' +
      '<div class="cp-controls" role="group" aria-label="Recorrer la partida">' +
      '<button type="button" data-act="first" aria-label="Posición inicial">⏮</button><button type="button" data-act="prev" aria-label="Jugada anterior">◀</button>' +
      '<span class="cp-ply" aria-live="polite"></span>' +
      '<button type="button" data-act="next" aria-label="Jugada siguiente">▶</button><button type="button" data-act="last" aria-label="Última jugada">⏭</button>' +
      '<button type="button" data-act="flip" aria-label="Girar el tablero" title="Girar el tablero">⇅</button></div>' +
      '<div class="cp-comment" aria-live="polite"></div>' +
      '<div class="cp-actions"><button type="button" data-act="guess" class="cp-btn">🎯 Adivinar las jugadas clave</button>' +
      '<button type="button" data-act="practice" class="cp-btn cp-btn2">♟ Jugar desde aquí contra el motor</button>' +
      '<label class="cp-level">Nivel <select data-act="level"><option value="1500">1500</option><option value="1800" selected>1800</option><option value="max">Máximo</option></select></label></div>' +
      '<form class="cp-cmd" hidden><label for="' + cmdId + '">Escribe tu jugada</label> ' +
      '<input type="text" id="' + cmdId + '" class="cp-cmd-input" autocomplete="off" placeholder="ej. Cf3, e4, Dxh7+, e8=D"> ' +
      '<button type="submit" class="cp-mini">Jugar</button></form>' +
      '<div class="cp-promo" hidden><span>Coronar:</span><button type="button" data-p="q">♕ Dama</button><button type="button" data-p="r">♖ Torre</button><button type="button" data-p="b">♗ Alfil</button><button type="button" data-p="n">♘ Caballo</button></div>' +
      '<div class="cp-msg" aria-live="polite"></div></div>' +
      '<div class="cp-moves" aria-label="Jugadas de la partida"></div>' +
      '<p class="cp-desc sr-only" aria-live="polite" aria-atomic="true"></p>';
    const boardEl = el.querySelector(".cp-board"), movesEl = el.querySelector(".cp-moves"), plyEl = el.querySelector(".cp-ply");
    const comEl = el.querySelector(".cp-comment"), msgEl = el.querySelector(".cp-msg"), descEl = el.querySelector(".cp-desc"), promoEl = el.querySelector(".cp-promo");
    const guessBtn = el.querySelector('[data-act="guess"]'), practBtn = el.querySelector('[data-act="practice"]');
    const cmdForm = el.querySelector(".cp-cmd"), cmdInput = cmdForm.querySelector("input");

    function fenAt(ply) { return ply === 0 ? g.start_fen : moves[ply - 1].fen; }
    function lastSquares(ply) { if (ply === 0) return []; const u = moves[ply - 1].uci; return [u.slice(0, 2), u.slice(2, 4)]; }
    function commentHtml(ply) {
      if (ply === 0) return '<p class="cp-c">' + esc(g.resumen || "") + "</p>";
      const m = moves[ply - 1];
      let h = '<p class="cp-c"><strong>' + esc(moveLabel(m)) + "</strong>" + (m.comentario ? " " + esc(m.comentario) : "") + "</p>";
      if (m.gap && ply > 1) h = '<p class="cp-c cp-gap">La partida continúa desde esta posición (el libro omite las jugadas anteriores).</p>' + h;
      return h;
    }
    function renderView(extra) {
      const fen = fenAt(state.ply);
      boardEl.innerHTML = boardSvg(fen, Object.assign({ flip: state.flip, last: lastSquares(state.ply), label: describe(fen) }, extra || {}));
      descEl.textContent = describe(fen);
      plyEl.textContent = state.ply + "/" + moves.length;
      movesEl.querySelectorAll("button").forEach((b, i) => b.classList.toggle("on", i + 1 === state.ply));
      const on = movesEl.querySelector("button.on"); if (on && on.scrollIntoView) { try { on.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) {} }
      el.querySelectorAll('[data-act="first"],[data-act="prev"]').forEach((b) => (b.disabled = state.ply === 0));
      el.querySelectorAll('[data-act="next"],[data-act="last"]').forEach((b) => (b.disabled = state.ply >= moves.length));
      if (state.mode === "ver") comEl.innerHTML = commentHtml(state.ply);
    }
    function renderMoves(hideFrom) {
      let html = "";
      moves.forEach((m, i) => {
        const ply = i + 1;
        if (hideFrom != null && ply >= hideFrom) return;
        const pre = m.color === "w" ? m.n + "." : (i === 0 || m.gap ? m.n + "…" : "");
        html += '<button type="button" data-ply="' + ply + '"' + (m.comentario ? ' class="hasc"' : "") + (claveAt[ply] ? ' data-key="1" title="Momento clave"' : "") + ">" + esc(pre + esSan(m.san) + (m.nag || "")) + "</button>";
      });
      if (hideFrom == null && g.resultado) html += '<span class="cp-h"> ' + esc(g.resultado) + "</span>";
      movesEl.innerHTML = html;
    }
    renderMoves(); renderView();

    // ----- modo "adivinar la jugada" -----
    let game = null;
    const input = boardInput(boardEl, promoEl, () => game, onHumanMove, (sel) => {
      const fen = game.fen(), dots = sel ? game.moves({ square: sel, verbose: true }).map((m) => m.to) : [];
      const h = game.history({ verbose: true }), lm = h.length ? h[h.length - 1] : null;
      boardEl.innerHTML = boardSvg(fen, { flip: state.flip, sel, dots, last: lm ? [lm.from, lm.to] : [], label: describe(fen) });
      descEl.textContent = describe(fen);
    });
    const cmdBtn = cmdForm.querySelector('button[type="submit"]');
    function setMoveInputEnabled(v) { input.enable(v); cmdInput.disabled = !v; cmdBtn.disabled = !v; }
    // Alternativa a clicar en el tablero: escribir la jugada (ej. "Cf3", "e4", "Dxh7+", "e8=D")
    // y que ChessMoveParser la interprete — así se puede adivinar/practicar sin arrastrar ni
    // hacer clic en el SVG, que no es operable por teclado ni por lector de pantalla.
    cmdForm.addEventListener("submit", (ev) => {
      ev.preventDefault();
      if (cmdInput.disabled) return;
      const raw = cmdInput.value;
      if (!raw.trim()) return;
      if (!game) return;
      if (typeof ChessMoveParser === "undefined") { msgEl.textContent = "Falta cargar el intérprete de jugadas."; return; }
      const probe = new Chess(game.fen());
      const mv = ChessMoveParser.tryParseMove(probe, raw);
      if (!mv) { msgEl.textContent = 'Jugada no válida: "' + raw + '". Revísala e intenta de nuevo.'; return; }
      cmdInput.value = "";
      onHumanMove(mv.from + mv.to + (mv.promotion || ""));
    });

    function startGuess() {
      if (typeof Chess !== "function") { msgEl.textContent = "Falta la biblioteca de ajedrez (chess.js)."; return; }
      if (!claves.length) { msgEl.textContent = "Esta partida no tiene momentos clave marcados."; return; }
      state.mode = "adivinar"; state.aciertos = 0; state.fallos = 0;
      state.pendientes = claves.map((c) => c.ply).filter((p) => p >= 1 && p <= moves.length).sort((a, b) => a - b);
      guessBtn.textContent = "✕ Salir del modo adivinar"; practBtn.disabled = true;
      nextGuess();
    }
    function nextGuess() {
      if (!state.pendientes.length) { finishGuess(); return; }
      const ply = state.pendientes.shift();
      state.guess = claveAt[ply]; state.intentos = 0; state.ply = ply - 1;
      game = new Chess(); game.load(fenAt(ply - 1));
      renderMoves(ply); renderView();
      const m = moves[ply - 1];
      comEl.innerHTML = '<p class="cp-c cp-ask"><strong>Momento clave ' + (claves.length - state.pendientes.length) + "/" + claves.length + " · juegan " + (m.color === "w" ? "blancas" : "negras") + ".</strong> " + esc(state.guess.pregunta || "¿Qué jugarías aquí?") + " Haz la jugada en el tablero.</p>";
      msgEl.innerHTML = '<button type="button" data-act="hint" class="cp-mini">Pista</button> <button type="button" data-act="skip" class="cp-mini">Ver la jugada</button>';
      cmdForm.hidden = false; setMoveInputEnabled(true);
    }
    function onHumanMove(uci) {
      if (state.mode === "adivinar") {
        const ply = state.ply + 1, m = moves[ply - 1];
        const exp = m.uci.length > 4 ? m.uci : m.uci; const ok = uci === exp || (uci.slice(0, 4) === exp.slice(0, 4) && exp.length === 4);
        const alt = (state.guess.alternativas || []).indexOf(uci) !== -1 || (state.guess.alternativas || []).indexOf(uci.slice(0, 4)) !== -1;
        if (ok || alt) {
          state.aciertos++; setMoveInputEnabled(false); state.ply = ply;
          renderMoves(); renderView({ good: [uci.slice(0, 2), uci.slice(2, 4)] });
          comEl.innerHTML = '<p class="cp-c cp-good"><strong>' + (ok ? "¡Correcto! " : "¡Muy bien! Esa jugada también es buena; en la partida se jugó " + esc(moveLabel(m)) + ". ") + "</strong> " + esc(state.guess.explicacion || m.comentario || "") + "</p>";
          msgEl.innerHTML = '<button type="button" data-act="continue" class="cp-btn">Seguir ▶</button>';
        } else {
          state.intentos++;
          renderView({ bad: [uci.slice(0, 2), uci.slice(2, 4)] });
          if (state.intentos >= 2) { revealGuess(true); return; }
          comEl.innerHTML = '<p class="cp-c cp-bad"><strong>No es esa.</strong> ' + esc(state.guess.pista || "Prueba otra vez: piensa en el plan de la lección.") + "</p>";
        }
        return;
      }
      if (state.mode === "practicar") { game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined }); afterHumanPractice(); }
    }
    function revealGuess(failed) {
      const ply = state.ply + 1, m = moves[ply - 1];
      if (failed) state.fallos++;
      setMoveInputEnabled(false); state.ply = ply; renderMoves(); renderView();
      comEl.innerHTML = '<p class="cp-c ' + (failed ? "cp-bad" : "") + '"><strong>La jugada de la partida fue ' + esc(moveLabel(m)) + ".</strong> " + esc(state.guess.explicacion || m.comentario || "") + "</p>";
      msgEl.innerHTML = '<button type="button" data-act="continue" class="cp-btn">Seguir ▶</button>';
    }
    function finishGuess() {
      const total = claves.length, pct = total ? Math.round((100 * state.aciertos) / total) : 0;
      state.mode = "ver"; setMoveInputEnabled(false); cmdForm.hidden = true; guessBtn.textContent = "🎯 Adivinar las jugadas clave"; practBtn.disabled = false;
      renderMoves(); renderView();
      msgEl.innerHTML = "";
      comEl.innerHTML = '<p class="cp-c cp-good"><strong>Resultado: ' + state.aciertos + " de " + total + " momentos clave (" + pct + "%).</strong> " + (pct >= 80 ? "Excelente: entendiste el hilo de la partida." : pct >= 50 ? "Bien. Repasa los comentarios de los momentos que fallaste y vuelve a intentarlo." : "Vuelve a recorrer la partida leyendo los comentarios y repite el ejercicio.") + "</p>";
      guardar(g.id, { tipo: "adivinar", aciertos: state.aciertos, total: total, pct: pct });
    }
    function stopGuess() { state.mode = "ver"; setMoveInputEnabled(false); cmdForm.hidden = true; guessBtn.textContent = "🎯 Adivinar las jugadas clave"; practBtn.disabled = false; msgEl.innerHTML = ""; renderMoves(); renderView(); }

    // ----- práctica contra el motor desde la posición actual -----
    let human = "w", thinking = false;
    function levelKey() { return el.querySelector('[data-act="level"]').value; }
    function startPractice() {
      if (typeof Chess !== "function" || !window.PracticeEngine) { msgEl.textContent = "El motor no está disponible en este navegador."; return; }
      game = new Chess(); if (!game.load(fenAt(state.ply))) { msgEl.textContent = "No se pudo cargar la posición."; return; }
      human = game.turn(); state.mode = "practicar";
      practBtn.textContent = "✕ Terminar la práctica"; guessBtn.disabled = true;
      comEl.innerHTML = '<p class="cp-c">Juegas con ' + (human === "w" ? "blancas" : "negras") + " desde la posición de la jugada " + state.ply + ". Intenta seguir el plan de la partida; el motor responde por el otro bando.</p>";
      msgEl.textContent = "";
      cmdForm.hidden = false;
      PracticeEngine.preload(); setMoveInputEnabled(true); renderPractice();
    }
    function renderPractice(txt) {
      const fen = game.fen(), h = game.history({ verbose: true }), lm = h.length ? h[h.length - 1] : null;
      boardEl.innerHTML = boardSvg(fen, { flip: state.flip, last: lm ? [lm.from, lm.to] : [], label: describe(fen) });
      descEl.textContent = describe(fen);
      movesEl.innerHTML = h.map((m, i) => '<span class="cp-h">' + esSan(m.san) + "</span>").join(" ");
      plyEl.textContent = "práctica";
      if (txt) msgEl.textContent = txt;
    }
    function resultOf() {
      if (game.in_checkmate()) return game.turn() === "w" ? "0-1" : "1-0";
      if (game.in_stalemate() || game.insufficient_material() || game.in_threefold_repetition() || game.in_draw()) return "½-½";
      return null;
    }
    async function afterHumanPractice() {
      renderPractice();
      const r = resultOf(); if (r) { endPractice(r); return; }
      thinking = true; setMoveInputEnabled(false); msgEl.textContent = "El motor piensa…";
      let uci = null;
      try { uci = await PracticeEngine.getMove(game.fen(), levelKey()); } catch (e) { uci = null; }
      thinking = false;
      if (state.mode !== "practicar") return;
      if (!uci) { renderPractice("El motor no respondió. Prueba de nuevo o recarga la página."); setMoveInputEnabled(true); return; }
      const rival = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
      msgEl.textContent = "El motor jugó " + esSan(rival.san) + ". Te toca."; setMoveInputEnabled(true); renderPractice();
      const r2 = resultOf(); if (r2) endPractice(r2);
    }
    function endPractice(res) {
      const humanWon = (res === "1-0" && human === "w") || (res === "0-1" && human === "b");
      const txt = "Fin de la partida: " + RES_TXT[res] + (humanWon ? ". ¡Bien jugado!" : res === "½-½" ? "." : ". Revisa la partida modelo y vuelve a intentarlo.");
      guardar(g.id, { tipo: "practica", resultado: res, jugaste: human, desde: state.ply, nivel: levelKey(), jugadas: game.history().length });
      stopPractice(); msgEl.textContent = txt;
    }
    function stopPractice() { state.mode = "ver"; setMoveInputEnabled(false); cmdForm.hidden = true; practBtn.textContent = "♟ Jugar desde aquí contra el motor"; guessBtn.disabled = false; msgEl.textContent = ""; renderMoves(); renderView(); }

    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      const act = b.dataset.act;
      if (b.dataset.ply) { if (state.mode !== "ver") return; state.ply = parseInt(b.dataset.ply, 10); renderView(); return; }
      if (state.mode === "ver" && ["first", "prev", "next", "last"].includes(act)) {
        if (act === "first") state.ply = 0; else if (act === "prev") state.ply = Math.max(0, state.ply - 1);
        else if (act === "next") state.ply = Math.min(moves.length, state.ply + 1); else state.ply = moves.length;
        renderView(); return;
      }
      if (act === "flip") { state.flip = !state.flip; if (state.mode === "practicar") renderPractice(); else renderView(); return; }
      if (act === "guess") { state.mode === "adivinar" ? stopGuess() : startGuess(); return; }
      if (act === "practice") { state.mode === "practicar" ? stopPractice() : startPractice(); return; }
      if (act === "hint" && state.guess) { comEl.innerHTML = '<p class="cp-c cp-ask"><strong>Pista:</strong> ' + esc(state.guess.pista || "Busca la jugada que cumple el plan de la lección.") + "</p>"; return; }
      if (act === "skip") { revealGuess(true); return; }
      if (act === "continue") { nextGuess(); return; }
    });
    boardEl.addEventListener("keydown", (ev) => {
      if (state.mode !== "ver") return;
      if (ev.key === "ArrowRight") { state.ply = Math.min(moves.length, state.ply + 1); renderView(); ev.preventDefault(); }
      if (ev.key === "ArrowLeft") { state.ply = Math.max(0, state.ply - 1); renderView(); ev.preventDefault(); }
    });
  }

  // ---------- 2. ejercicio: encontrar la jugada ----------
  function makeExercise(el, x) {
    const sol = x.solucion || [];
    const state = { ply: 0, flip: parseFen(x.fen).turn === "b", solved: false, tries: 0 };
    const cmdId = "cp-cmd-" + (++cmdSeq);
    el.classList.add("cp-viewer", "cp-ej");
    el.innerHTML =
      '<div class="cp-head"><span class="cp-players">' + esc(x.titulo || ("Ejercicio " + x.n)) + '</span><span class="cp-res">' + (parseFen(x.fen).turn === "w" ? "Juegan blancas" : "Juegan negras") + "</span></div>" +
      '<div class="cp-board" tabindex="0" aria-label="Tablero del ejercicio"></div>' +
      '<div class="cp-side"><div class="cp-comment"><p class="cp-c">' + esc(x.pregunta || "Encuentra la mejor jugada.") + " Juégala en el tablero.</p></div>" +
      '<div class="cp-controls" role="group" aria-label="Recorrer la solución" hidden><button type="button" data-act="first">⏮</button><button type="button" data-act="prev">◀</button><span class="cp-ply"></span><button type="button" data-act="next">▶</button><button type="button" data-act="last">⏭</button></div>' +
      '<div class="cp-actions"><button type="button" data-act="hint" class="cp-mini">Pista</button><button type="button" data-act="show" class="cp-mini">Ver la solución</button></div>' +
      '<form class="cp-cmd"><label for="' + cmdId + '">Escribe tu jugada</label> ' +
      '<input type="text" id="' + cmdId + '" class="cp-cmd-input" autocomplete="off" placeholder="ej. Cf3, e4, Dxh7+, e8=D"> ' +
      '<button type="submit" class="cp-mini">Jugar</button></form>' +
      '<div class="cp-promo" hidden><span>Coronar:</span><button type="button" data-p="q">♕ Dama</button><button type="button" data-p="r">♖ Torre</button><button type="button" data-p="b">♗ Alfil</button><button type="button" data-p="n">♘ Caballo</button></div>' +
      '<div class="cp-msg" aria-live="polite"></div></div><div class="cp-moves"></div><p class="cp-desc sr-only" aria-live="polite" aria-atomic="true"></p>';
    const boardEl = el.querySelector(".cp-board"), comEl = el.querySelector(".cp-comment"), movesEl = el.querySelector(".cp-moves"), ctr = el.querySelector(".cp-controls"), plyEl = el.querySelector(".cp-ply"), promoEl = el.querySelector(".cp-promo"), descEl = el.querySelector(".cp-desc");
    const cmdForm = el.querySelector(".cp-cmd"), cmdInput = cmdForm.querySelector("input"), msgEl = el.querySelector(".cp-msg");
    let game = null;
    function fenAt(p) { return p === 0 ? x.fen : sol[p - 1].fen; }
    function render(extra) {
      const fen = state.solved ? fenAt(state.ply) : (game ? game.fen() : x.fen);
      const last = state.solved && state.ply ? [sol[state.ply - 1].uci.slice(0, 2), sol[state.ply - 1].uci.slice(2, 4)] : [];
      boardEl.innerHTML = boardSvg(fen, Object.assign({ flip: state.flip, last, label: describe(fen) }, extra || {}));
      descEl.textContent = describe(fen);
      if (state.solved) {
        plyEl.textContent = state.ply + "/" + sol.length;
        movesEl.querySelectorAll("button").forEach((b, i) => b.classList.toggle("on", i + 1 === state.ply));
        const m = state.ply ? sol[state.ply - 1] : null;
        comEl.innerHTML = '<p class="cp-c">' + (m ? "<strong>" + esc(moveLabel(m)) + "</strong> " + esc(m.comentario || "") : esc(x.explicacion || "")) + "</p>";
      }
    }
    function onExerciseMove(uci) {
      state.tries++;
      const exp = sol.length ? sol[0].uci : null;
      const ok = exp && (uci === exp || uci.slice(0, 4) === exp.slice(0, 4) && exp.length === 4) || (x.alternativas || []).indexOf(uci) !== -1;
      if (ok) { solve(true); }
      else {
        render({ bad: [uci.slice(0, 2), uci.slice(2, 4)] });
        if (state.tries >= 3) { comEl.innerHTML = '<p class="cp-c cp-bad"><strong>No es esa.</strong> Mira la solución y estudia la idea.</p>'; }
        else comEl.innerHTML = '<p class="cp-c cp-bad"><strong>No es esa.</strong> ' + esc(x.pista || "Busca la idea principal de la lección.") + " Intento " + state.tries + " de 3.</p>";
      }
    }
    const input = boardInput(boardEl, promoEl, () => game, onExerciseMove, (sel) => {
      const dots = sel ? game.moves({ square: sel, verbose: true }).map((m) => m.to) : [];
      boardEl.innerHTML = boardSvg(game.fen(), { flip: state.flip, sel, dots, label: describe(game.fen()) });
    });
    const cmdBtn = cmdForm.querySelector('button[type="submit"]');
    // Misma idea que en la partida comentada: escribir la jugada en vez de hacer clic en el
    // SVG del tablero, que no es operable por teclado ni por lector de pantalla.
    cmdForm.addEventListener("submit", (ev) => {
      ev.preventDefault();
      if (state.solved || !game) return;
      const raw = cmdInput.value;
      if (!raw.trim()) return;
      if (typeof ChessMoveParser === "undefined") { msgEl.textContent = "Falta cargar el intérprete de jugadas."; return; }
      const probe = new Chess(game.fen());
      const mv = ChessMoveParser.tryParseMove(probe, raw);
      if (!mv) { msgEl.textContent = 'Jugada no válida: "' + raw + '". Revísala e intenta de nuevo.'; return; }
      cmdInput.value = "";
      onExerciseMove(mv.from + mv.to + (mv.promotion || ""));
    });
    function solve(byUser) {
      state.solved = true; input.enable(false); cmdForm.hidden = true; cmdInput.disabled = true; cmdBtn.disabled = true;
      ctr.hidden = false; el.querySelector('[data-act="show"]').hidden = true; el.querySelector('[data-act="hint"]').hidden = true;
      movesEl.innerHTML = sol.map((m, i) => '<button type="button" data-ply="' + (i + 1) + '">' + esc(moveLabel(m)) + "</button>").join("") + (x.resultado ? '<span class="cp-h"> ' + esc(x.resultado) + "</span>" : "");
      state.ply = 1; render(byUser ? { good: [sol[0].uci.slice(0, 2), sol[0].uci.slice(2, 4)] } : {});
      comEl.innerHTML = '<p class="cp-c ' + (byUser ? "cp-good" : "") + '"><strong>' + (byUser ? "¡Correcto! " : "Solución: ") + esc(moveLabel(sol[0])) + ".</strong> " + esc(x.explicacion || sol[0].comentario || "") + " Recorre la línea completa con las flechas.</p>";
      guardar(x.id, { tipo: "ejercicio", ok: !!byUser, intentos: state.tries });
    }
    if (typeof Chess === "function") { game = new Chess(); game.load(x.fen); input.enable(true); }
    render();
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      const act = b.dataset.act;
      if (b.dataset.ply) { state.ply = parseInt(b.dataset.ply, 10); render(); return; }
      if (act === "hint") { comEl.innerHTML = '<p class="cp-c cp-ask"><strong>Pista:</strong> ' + esc(x.pista || "Piensa en el desequilibrio de material y en qué pieza está mal colocada.") + "</p>"; return; }
      if (act === "show") { solve(false); return; }
      if (!state.solved) return;
      if (act === "first") state.ply = 0; else if (act === "prev") state.ply = Math.max(0, state.ply - 1);
      else if (act === "next") state.ply = Math.min(sol.length, state.ply + 1); else if (act === "last") state.ply = sol.length;
      render();
    });
  }

  // ---------- 3. cuestionario ----------
  function makeQuiz(el, q) {
    const items = q.preguntas || [];
    el.classList.add("cp-quiz-box");
    el.innerHTML = '<form class="cp-quiz-form">' + items.map((it, i) =>
      '<fieldset class="cp-q"><legend><strong>' + (i + 1) + ".</strong> " + esc(it.pregunta) + "</legend>" +
      it.opciones.map((o, j) => '<label class="cp-opt"><input type="radio" name="' + esc(q.id) + "-" + i + '" value="' + j + '"> <span>' + esc(o) + "</span></label>").join("") +
      '<p class="cp-qexp" hidden></p></fieldset>').join("") +
      '<div class="cp-actions"><button type="submit" class="cp-btn">Comprobar respuestas</button><span class="cp-qscore" aria-live="polite"></span></div></form>';
    const form = el.querySelector("form");
    const prev = progreso()[q.id];
    if (prev) el.querySelector(".cp-qscore").textContent = "Último resultado: " + prev.aciertos + "/" + prev.total + " (" + prev.fecha + ")";
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      let ok = 0, answered = 0;
      items.forEach((it, i) => {
        const fs = form.querySelectorAll(".cp-q")[i], sel = form.querySelector('input[name="' + q.id + "-" + i + '"]:checked');
        const exp = fs.querySelector(".cp-qexp");
        fs.querySelectorAll(".cp-opt").forEach((lab, j) => { lab.classList.remove("ok", "bad"); if (j === it.correcta) lab.classList.add("ok"); });
        if (sel) {
          answered++;
          const v = parseInt(sel.value, 10);
          if (v === it.correcta) ok++; else fs.querySelectorAll(".cp-opt")[v].classList.add("bad");
        }
        exp.hidden = false; exp.textContent = (sel && parseInt(sel.value, 10) === it.correcta ? "✔ " : "✘ ") + (it.explicacion || "");
      });
      const pct = items.length ? Math.round((100 * ok) / items.length) : 0;
      el.querySelector(".cp-qscore").textContent = "Resultado: " + ok + " de " + items.length + " (" + pct + "%)" + (answered < items.length ? " · dejaste " + (items.length - answered) + " sin responder" : "") + (pct >= 80 ? " · ¡muy bien!" : pct >= 60 ? " · aprobado; repasa lo que fallaste" : " · repasa la lección y vuelve a intentarlo");
      guardar(q.id, { tipo: "quiz", aciertos: ok, total: items.length, pct: pct });
    });
  }

  // ---------- inicialización perezosa (los <details> cerrados esperan) ----------
  function pendientes(root) {
    return Array.from(root.querySelectorAll(".cp-partida[data-id]:not(.cp-viewer),.cp-ejercicio[data-id]:not(.cp-viewer),.cp-quiz[data-id]:not(.cp-quiz-box)")).filter((el) => {
      let p = el.parentElement;
      while (p && p !== root) { if (p.tagName === "DETAILS" && !p.open) return false; p = p.parentElement; }
      return true;
    });
  }
  function init(root) {
    root = root || document;
    if (!root.__cp) { root.__cp = true; root.querySelectorAll("details").forEach((dt) => dt.addEventListener("toggle", () => { if (dt.open) init(root); })); }
    const nodes = pendientes(root);
    if (!nodes.length) return Promise.resolve();
    injectDefs();
    return loadData(root).then(() => {
      nodes.forEach((el) => {
        const id = el.dataset.id;
        if (el.classList.contains("cp-partida")) { const g = data.partidas[id]; if (g) makeGame(el, g); else fallo(el, id); }
        else if (el.classList.contains("cp-ejercicio")) { const x = (data.ejercicios || {})[id]; if (x) makeExercise(el, x); else fallo(el, id); }
        else if (el.classList.contains("cp-quiz")) { const q = (data.quizzes || {})[id]; if (q) makeQuiz(el, q); else fallo(el, id); }
      });
      marcarProgreso(root);
    }).catch((e) => { nodes.forEach((el) => { el.innerHTML = '<p class="text-xs text-red-500">No se pudo cargar el contenido del curso (' + esc(e.message) + ").</p>"; }); });
  }
  function fallo(el, id) { el.innerHTML = '<p class="text-xs text-red-500">Elemento no encontrado (' + esc(id) + ").</p>"; el.classList.add("cp-viewer"); }
  function marcarProgreso(root) {
    const p = progreso();
    (root || document).querySelectorAll(".cp-partida[data-id],.cp-ejercicio[data-id]").forEach((el) => {
      const rec = p[el.dataset.id], head = el.querySelector(".cp-head");
      if (rec && head && !head.querySelector(".cp-done")) {
        const s = document.createElement("span"); s.className = "cp-done";
        s.textContent = rec.tipo === "adivinar" ? "✔ " + rec.aciertos + "/" + rec.total : rec.tipo === "ejercicio" ? (rec.ok ? "✔ resuelto" : "• visto") : "• practicado";
        head.appendChild(s);
      }
    });
  }
  document.addEventListener("cp:progreso", () => marcarProgreso(document));

  window.CursoPartidas = { init, loadData, boardSvg, progreso };
})();
