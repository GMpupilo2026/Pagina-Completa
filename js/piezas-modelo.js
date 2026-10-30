/* Reconocer QUÉ pieza hay en cada casilla (peón, caballo, alfil, torre, dama
 * o rey), no solo si hay una blanca o una negra: lo que le faltaba a la cámara
 * para arrancar desde cualquier posición sin escribirla.
 *
 * Se entrena EN EL APARATO, con las fotos que junta «Enseñarle a la cámara»
 * (el tablero enderezado de cada jugada, con su FEN): cada casilla ocupada es
 * un ejemplo, y su pieza la dice el FEN. Así aprende NUESTROS tableros, con la
 * luz de nuestro salón y el ángulo de nuestra cámara; nada se manda a ningún
 * lado. El modelo es una red chica (la casilla en 16 × 16 grises → 32 → las 6
 * piezas), que se entrena en segundos y se guarda en el aparato; se puede
 * bajar como archivo y cargar en otro celular. Ver «Reconocer qué pieza es»
 * en docs/decisiones/juegos-y-torneos.md.
 *
 * El color (blanca o negra) y si la casilla está vacía los sigue diciendo
 * js/lector-tablero.js, que ya los lee bien: el modelo solo decide el tipo.
 *
 *   PiezasModelo.rasgos(rgba, lado, columna, fila)  → Float32Array(256)
 *   PiezasModelo.ejemplos(rgba, lado, fen)           → [{ x, y }]  (y: 0-5, p n b r q k)
 *   PiezasModelo.entrenar(porFoto, { epocas, alAvanzar }) → Promise<modelo>  (porFoto: los ejemplos de cada foto)
 *   PiezasModelo.probabilidades(modelo, x)           → [6]
 *   PiezasModelo.posicion(modelo, rgba, lado, lectura) → { colocacion, seguridad, dudosas }
 *     `lectura`: 64 letras como las de js/lector-tablero.js ("." vacía, "B"
 *     blanca, "N" negra), de a1 a h8 por filas.
 */
(function (G) {
  "use strict";
  const TIPOS = ["p", "n", "b", "r", "q", "k"];
  const N = 16, ENTRADAS = N * N, OCULTAS = 32;

  /* La casilla (columna 0-7 desde la a, fila 0-7 desde la 1) de la foto
   * enderezada (arriba la fila 8, a la izquierda la columna a), con un poco
   * de margen (la pieza se sale de su casilla vista de costado), en 16 × 16
   * grises, centrados y escalados: lo que importa es la forma, no la luz. */
  function rasgos(rgba, lado, col, fila) {
    const c = lado / 8, m = c * 0.15, x0 = col * c - m, y0 = (7 - fila) * c - m, t = c + 2 * m;
    const x = new Float32Array(ENTRADAS);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const px = Math.min(lado - 1, Math.max(0, Math.floor(x0 + (i + 0.5) * t / N))), py = Math.min(lado - 1, Math.max(0, Math.floor(y0 + (j + 0.5) * t / N)));
      const k = (py * lado + px) * 4;
      x[j * N + i] = (rgba[k] * 299 + rgba[k + 1] * 587 + rgba[k + 2] * 114) / 1000;
    }
    let s = 0, s2 = 0;
    for (const v of x) { s += v; s2 += v * v; }
    const media = s / ENTRADAS, desv = Math.sqrt(Math.max(1e-6, s2 / ENTRADAS - media * media));
    for (let i = 0; i < ENTRADAS; i++) x[i] = (x[i] - media) / desv;
    return x;
  }
  const espejo = (x) => { const y = new Float32Array(ENTRADAS); for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) y[j * N + i] = x[j * N + (N - 1 - i)]; return y; };

  // Las casillas ocupadas de una foto, con su pieza según el FEN.
  function ejemplos(rgba, lado, fen) {
    const salida = [], filas = String(fen).split(" ")[0].split("/");
    if (filas.length !== 8) return salida;
    filas.forEach((f, i) => {
      let col = 0;
      for (const ch of f) {
        if (/\d/.test(ch)) { col += Number(ch); continue; }
        const y = TIPOS.indexOf(ch.toLowerCase());
        if (y >= 0 && col < 8) salida.push({ x: rasgos(rgba, lado, col, 7 - i), y });
        col++;
      }
    });
    return salida;
  }

  function nuevoModelo(semilla) {
    let s = semilla || 12345;
    const azar = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff - 0.5; };
    const W1 = new Float32Array(OCULTAS * ENTRADAS).map(() => azar() * 2 * Math.sqrt(2 / ENTRADAS));
    const W2 = new Float32Array(TIPOS.length * OCULTAS).map(() => azar() * 2 * Math.sqrt(2 / OCULTAS));
    return { v: 1, n: N, W1, b1: new Float32Array(OCULTAS), W2, b2: new Float32Array(TIPOS.length) };
  }
  function adelante(m, x) {
    const h = new Float32Array(OCULTAS);
    for (let o = 0; o < OCULTAS; o++) {
      let s = m.b1[o];
      const fila = o * ENTRADAS;
      for (let i = 0; i < ENTRADAS; i++) s += m.W1[fila + i] * x[i];
      h[o] = s > 0 ? s : 0;
    }
    const z = new Float32Array(TIPOS.length);
    let max = -Infinity;
    for (let k = 0; k < TIPOS.length; k++) {
      let s = m.b2[k];
      for (let o = 0; o < OCULTAS; o++) s += m.W2[k * OCULTAS + o] * h[o];
      z[k] = s; if (s > max) max = s;
    }
    let suma = 0;
    for (let k = 0; k < z.length; k++) { z[k] = Math.exp(z[k] - max); suma += z[k]; }
    for (let k = 0; k < z.length; k++) z[k] /= suma;
    return { h, p: z };
  }
  const probabilidades = (m, x) => Array.from(adelante(m, x).p);

  /* Entrenar: descenso por gradiente de a uno, con los ejemplos y su espejo
   * (una pieza vista desde arriba es casi igual de un lado y del otro). Un
   * 20 % de las FOTOS (no de las casillas) se aparta para medir cuánto
   * acierta en lo que no vio: eso es lo que se le dice a la persona. Cada
   * vuelta cede el paso a la página (y avisa cómo va). */
  async function entrenar(porFoto, opciones) {
    const o = Object.assign({ epocas: 25, paso: 0.02 }, opciones || {});
    const prueba = [], todo = [];
    porFoto.forEach((lista, i) => { (porFoto.length >= 5 && i % 5 === 4 ? prueba : todo).push(...lista); });
    const datos = todo.concat(todo.map((e) => ({ x: espejo(e.x), y: e.y })));
    const m = nuevoModelo();
    let s = 99;
    const azar = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let ep = 0; ep < o.epocas; ep++) {
      for (let i = datos.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [datos[i], datos[j]] = [datos[j], datos[i]]; }
      const paso = o.paso / (1 + ep * 0.1);
      for (const { x, y } of datos) {
        const { h, p } = adelante(m, x);
        const dz = Array.from(p); dz[y] -= 1;
        const dh = new Float32Array(OCULTAS);
        for (let k = 0; k < dz.length; k++) {
          for (let q = 0; q < OCULTAS; q++) { dh[q] += m.W2[k * OCULTAS + q] * dz[k]; m.W2[k * OCULTAS + q] -= paso * dz[k] * h[q]; }
          m.b2[k] -= paso * dz[k];
        }
        for (let q = 0; q < OCULTAS; q++) {
          if (h[q] <= 0) continue;
          const g = dh[q], fila = q * ENTRADAS;
          for (let i = 0; i < ENTRADAS; i++) m.W1[fila + i] -= paso * g * x[i];
          m.b1[q] -= paso * g;
        }
      }
      if (o.alAvanzar) o.alAvanzar((ep + 1) / o.epocas);
      await new Promise((listo) => setTimeout(listo, 0));
    }
    const medir = (lista) => (lista.length ? lista.filter((e) => { const p = adelante(m, e.x).p; return p.indexOf(Math.max(...p)) === e.y; }).length / lista.length : null);
    m.acierto = medir(prueba);
    m.aciertoEntrenando = medir(todo);
    m.ejemplos = todo.length;
    m.prueba = prueba.length;
    return m;
  }

  /* La posición entera: el color de cada casilla lo da la lectura, el tipo
   * el modelo. Lo que no puede ser se arregla con lo más probable que sí:
   * un rey de cada color (la casilla de ese color con más probabilidad de
   * rey) y ningún peón en la fila 1 ni en la 8. Las casillas de las que el
   * modelo no está seguro (menos de 60 %) se devuelven aparte: la posición
   * la confirma una persona antes de usarla. */
  function posicion(m, rgba, lado, lectura) {
    const casillas = [];
    for (let k = 0; k < 64; k++) {
      const c = lectura[k];
      if (c !== "B" && c !== "N") continue;
      const col = k & 7, fila = k >> 3;
      casillas.push({ k, col, fila, blanca: c === "B", p: probabilidades(m, rasgos(rgba, lado, col, fila)) });
    }
    for (const blanca of [true, false]) {
      const suyas = casillas.filter((x) => x.blanca === blanca);
      if (!suyas.length) continue;
      const rey = suyas.reduce((a, b) => (b.p[5] > a.p[5] ? b : a));
      for (const x of suyas) {
        if (x === rey) { x.tipo = 5; continue; }
        const p = x.p.slice(); p[5] = -1;
        if (x.fila === 0 || x.fila === 7) p[0] = -1;
        x.tipo = p.indexOf(Math.max(...p));
      }
    }
    const tablero = Array.from({ length: 8 }, () => new Array(8).fill(""));
    for (const x of casillas) tablero[x.fila][x.col] = x.blanca ? TIPOS[x.tipo].toUpperCase() : TIPOS[x.tipo];
    const colocacion = tablero.slice().reverse().map((f) => {
      let s = "", vacias = 0;
      for (const ch of f) { if (!ch) { vacias++; continue; } if (vacias) { s += vacias; vacias = 0; } s += ch; }
      return s + (vacias ? vacias : "");
    }).join("/");
    const seguras = casillas.map((x) => x.p[x.tipo]);
    const nombre = (x) => "abcdefgh"[x.col] + (x.fila + 1);
    return { colocacion, seguridad: seguras.length ? Math.min(...seguras) : 1, dudosas: casillas.filter((x) => x.p[x.tipo] < 0.6).map(nombre) };
  }

  // Para guardar y cargar el modelo (en el aparato o en un archivo).
  const aJSON = (m) => JSON.stringify({ v: m.v, n: m.n, acierto: m.acierto, ejemplos: m.ejemplos, W1: Array.from(m.W1, (v) => Math.round(v * 1e4) / 1e4), b1: Array.from(m.b1), W2: Array.from(m.W2), b2: Array.from(m.b2) });
  function deJSON(texto) {
    const o = JSON.parse(texto);
    if (!o || o.v !== 1 || o.n !== N || !Array.isArray(o.W1) || o.W1.length !== OCULTAS * ENTRADAS || o.W2.length !== TIPOS.length * OCULTAS) return null;
    return { v: 1, n: N, acierto: o.acierto, ejemplos: o.ejemplos, W1: Float32Array.from(o.W1), b1: Float32Array.from(o.b1), W2: Float32Array.from(o.W2), b2: Float32Array.from(o.b2) };
  }

  const api = { TIPOS, rasgos, ejemplos, entrenar, probabilidades, posicion, aJSON, deJSON };
  if (typeof window !== "undefined") window.PiezasModelo = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
