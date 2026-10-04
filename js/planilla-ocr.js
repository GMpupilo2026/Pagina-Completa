/* La lectura de una planilla escrita a mano, en una sola copia: la usan el
   Lector de planilla (lector-planilla.html) y «Anota tu partida» de «Tus
   propios errores» (entreno/tipos.html).

   - leerFoto(file, token): achica la foto (lado más largo a 1600 px) y la
     manda a la Edge Function ocr-scoresheet, que la pasa por Google Vision
     con la clave guardada en el servidor y gasta un uso del tope diario (ver
     «El lector de planilla tiene tope diario» en
     docs/decisiones/cuentas-y-formularios.md). Devuelve las palabras con su
     posición en la foto.
   - reconstructMoveTokens(words): el orden real de las jugadas (por filas, de
     izquierda a derecha), sin números de jugada ni resultado.
   - tryParseMove / forceMatchLegalMove: cada texto se prueba con las lecturas
     de notación más comunes (español, sin «x», enroque con ceros…) y, si
     ninguna es legal, se fuerza la jugada legal más parecida.
   - leerTokens(Chess, tokens): todo eso de una vez → { jugadas (SAN inglesa),
     adivinadas (las medias jugadas forzadas por parecido) }.

   Pura salvo leerFoto y fileToResizedBase64 (piden navegador): la prueba
   herramientas/verificar-planilla-ocr.js. */
(function (raiz) {
  "use strict";

  /* ============================================================
     Tolerancia de notación: misma lógica que usa js/tablero-board.js
     para el cuadro de comandos del modo adaptado (letras de pieza en
     español, "x" de captura omitida, enroque con ceros, sufijo de
     promoción faltante) — acá hace falta lo mismo porque el texto que
     sale del lector automático (OCR) rara vez es notación SAN perfecta.
     ============================================================ */
  const ES_TO_EN_PIECE = { T: "R", C: "N", A: "B", D: "Q", R: "K" };
  const SAN_PIECE_LETTERS = "NBRQKTCAD";

  function mapSpanishPieceLetter(letter) {
      return ES_TO_EN_PIECE[letter.toUpperCase()] || letter.toUpperCase();
  }

  function generateMoveCandidates(raw) {
      let s = String(raw || "").trim();
      s = s.replace(/^\d+\.(\.\.)?\s*/, ""); // por si el OCR incluyó el número de jugada ("14.Cf3")
      s = s.replace(/\s+/g, "");
      if (!s) return [];

      const candidates = new Set();
      // En el sitio R es SIEMPRE el rey (algebraica española); la torre es T.
      // Leída en inglés, «Rf1» movía la torre.
      if (/^R/i.test(s)) s = "K" + s.slice(1);
      s = s.replace(/=R([+#]?)$/i, "=K$1");   // no se corona a rey (y «=R» no es la torre)
      candidates.add(s);

      if (/^0-0-0[+#]?$/.test(s) || /^0-0[+#]?$/.test(s)) candidates.add(s.replace(/0/g, "O"));
      // El OCR confunde fácilmente O (letra) con 0 (cero) en el enroque, y también con
      // D (que en notación española es la Dama) — probar las 3 lecturas más comunes.
      if (/^[0OD]-[0OD]([+#]?|-[0OD][+#]?)$/.test(s.toUpperCase())) candidates.add(s.toUpperCase().replace(/[0D]/g, "O"));

      const first = s[0];
      if (first && SAN_PIECE_LETTERS.indexOf(first.toUpperCase()) !== -1 && s.length >= 3) {
          candidates.add(mapSpanishPieceLetter(first) + s.slice(1));
          candidates.add(first.toUpperCase() + s.slice(1));
      }

      const promoMatch = s.match(/=([a-zA-Z])([+#]?)$/);
      if (promoMatch) {
          candidates.add(s.replace(/=([a-zA-Z])([+#]?)$/, "=" + mapSpanishPieceLetter(promoMatch[1]) + promoMatch[2]));
      }

      const expanded = new Set(candidates);
      for (const c of candidates) {
          const pawnCaptureNoX = c.match(/^([a-h])([a-h])([1-8])([+#]?)$/);
          if (pawnCaptureNoX) expanded.add(`${pawnCaptureNoX[1]}x${pawnCaptureNoX[2]}${pawnCaptureNoX[3]}${pawnCaptureNoX[4]}`);

          const pieceNoX = c.match(/^([NBRQK])([a-h])([1-8])([+#]?)$/);
          if (pieceNoX) expanded.add(`${pieceNoX[1]}x${pieceNoX[2]}${pieceNoX[3]}${pieceNoX[4]}`);

          const pieceDisambigNoX = c.match(/^([NBRQK])([a-h1-8])([a-h])([1-8])([+#]?)$/);
          if (pieceDisambigNoX) {
              expanded.add(`${pieceDisambigNoX[1]}${pieceDisambigNoX[2]}x${pieceDisambigNoX[3]}${pieceDisambigNoX[4]}${pieceDisambigNoX[5]}`);
          }

          const pawnPromoNoSuffix = c.match(/^([a-h](x[a-h])?[18])([+#]?)$/);
          if (pawnPromoNoSuffix && !/=/.test(c)) expanded.add(`${pawnPromoNoSuffix[1]}=Q${pawnPromoNoSuffix[3]}`);
      }

      return Array.from(expanded);
  }

  function tryParseMove(game, raw) {
      const candidates = generateMoveCandidates(raw);
      for (const candidate of candidates) {
          let result = null;
          try { result = game.move(candidate, { sloppy: true }); } catch (e) {}
          if (result) return result;
      }
      return null;
  }

  /* ============================================================
     Segundo intento cuando tryParseMove() no entendió el texto tal
     cual: se compara el texto crudo del OCR contra las jugadas LEGALES
     de la posición (game.moves()) por distancia de edición, y se queda
     SIEMPRE con la más parecida. Solo no fuerza nada si ya no queda
     ninguna jugada legal o no hay texto que comparar. */
  function levenshtein(a, b) {
      const m = a.length, n = b.length;
      const dp = new Array(n + 1);
      for (let j = 0; j <= n; j++) dp[j] = j;
      for (let i = 1; i <= m; i++) {
          let prev = dp[0];
          dp[0] = i;
          for (let j = 1; j <= n; j++) {
              const tmp = dp[j];
              dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
              prev = tmp;
          }
      }
      return dp[n];
  }

  const EN_TO_ES_PIECE = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
  function sanEnEspanol(san) {
      return String(san).replace(/^[KQRBN]/, (p) => EN_TO_ES_PIECE[p]).replace(/=([QRBN])/, (m, p) => "=" + EN_TO_ES_PIECE[p]);
  }

  function forceMatchLegalMove(game, raw) {
      const cleaned = String(raw || "").replace(/^\d+\.(\.\.)?\s*/, "").replace(/\s+/g, "").toLowerCase();
      if (!cleaned) return null; // no había ningún texto que comparar
      const legal = game.moves();
      if (!legal.length) return null; // no quedan jugadas legales: la partida ya terminó

      // Se compara con la jugada escrita en inglés Y en español: en una planilla
      // de acá, «Ae7» está a un paso de «Be7» (alfil), no de «Qe7».
      let best = null, bestDist = Infinity;
      legal.forEach((san) => {
          const d = Math.min(levenshtein(cleaned, san.toLowerCase()), levenshtein(cleaned, sanEnEspanol(san).toLowerCase()));
          if (d < bestDist) { bestDist = d; best = san; }
      });
      return best;
  }

  /* ============================================================
     Reconstrucción del orden real de las jugadas a partir de las
     palabras que devuelve el OCR (cada una con su posición en la
     imagen): agrupar por fila y ordenar cada fila de izquierda a
     derecha, sin depender del orden en que las leyó el OCR.
     ============================================================ */
  function reconstructMoveTokens(words) {
      const valid = (words || []).filter((w) => w.text && w.text.trim());
      if (!valid.length) return [];

      const avgHeight = valid.reduce((s, w) => s + Math.max(1, w.bbox.y1 - w.bbox.y0), 0) / valid.length;
      const rowTolerance = avgHeight * 0.6;

      const rows = [];
      valid.forEach((w) => {
          const yCenter = (w.bbox.y0 + w.bbox.y1) / 2;
          let row = rows.find((r) => Math.abs(r.yCenter - yCenter) < rowTolerance);
          if (!row) { row = { yCenter, words: [] }; rows.push(row); }
          row.words.push(w);
          row.yCenter = (row.yCenter * (row.words.length - 1) + yCenter) / row.words.length;
      });
      rows.sort((a, b) => a.yCenter - b.yCenter);
      rows.forEach((r) => r.words.sort((a, b) => a.bbox.x0 - b.bbox.x0));

      const tokens = [];
      rows.forEach((row) => {
          row.words.forEach((w) => {
              const t = w.text.trim();
              if (/^\d+[.):-]{0,2}$/.test(t)) return; // número de jugada suelto ("12.", "12)")
              if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)) return; // marcador de resultado
              tokens.push(t);
          });
      });
      return tokens;
  }

  /* Las jugadas de una planilla ya en orden: cada texto se lee tal cual o, si
     no, se fuerza la legal más parecida (se anota en `adivinadas`, por su
     número de media jugada). Lo que no tiene forma de jugada se salta. */
  function leerTokens(Chess, lista) {
    const game = new Chess();
    const adivinadas = [];
    (lista || []).forEach((raw) => {
      if (tryParseMove(game, raw)) return;
      const guess = forceMatchLegalMove(game, raw);
      if (!guess) return;
      adivinadas.push(game.history().length);
      game.move(guess);
    });
    return { jugadas: game.history(), adivinadas };
  }

  function fileToResizedBase64(file) {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
          reader.onload = () => {
              const img = new Image();
              img.onerror = () => reject(new Error("No se pudo leer la imagen."));
              img.onload = () => {
                  const MAX_SIDE = 1600;
                  let { width, height } = img;
                  if (width > MAX_SIDE || height > MAX_SIDE) {
                      const scale = MAX_SIDE / Math.max(width, height);
                      width = Math.round(width * scale);
                      height = Math.round(height * scale);
                  }
                  const canvas = document.createElement("canvas");
                  canvas.width = width;
                  canvas.height = height;
                  canvas.getContext("2d").drawImage(img, 0, 0, width, height);
                  resolve(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
              };
              img.src = reader.result;
          };
          reader.readAsDataURL(file);
      });
  }

  async function leerFoto(file, token) {
    const image_base64 = await fileToResizedBase64(file);
    const res = await fetch(`${raiz.SUPABASE_URL}/functions/v1/ocr-scoresheet`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "apikey": raiz.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ image_base64 }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || "No se pudo leer la imagen.");
    return { words: result.words || [] };
  }

  const PlanillaOcr = { generateMoveCandidates, sanEnEspanol, tryParseMove, levenshtein, forceMatchLegalMove, reconstructMoveTokens, leerTokens, fileToResizedBase64, leerFoto };
  if (typeof module !== "undefined" && module.exports) module.exports = PlanillaOcr;
  else raiz.PlanillaOcr = PlanillaOcr;
})(typeof window !== "undefined" ? window : globalThis);
