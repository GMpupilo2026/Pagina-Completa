/* Leer los números de un reloj de ajedrez de la imagen de la cámara: los de
 * siete segmentos (las rayitas de un DGT o de cualquier reloj digital).
 *
 * Quien maneja la cámara marca el recuadro del tiempo de las blancas y el de
 * las negras; de cada recuadro se lee el tiempo así:
 *  1. Lo claro y lo oscuro se separan con el umbral de Otsu, y los números
 *     son lo que hay MENOS (en un reloj de pantalla gris, los oscuros; en uno
 *     de luces, los claros).
 *  2. Lo que toca el borde del recuadro (el marco del reloj) no es un número.
 *  3. Los números de los relojes van un poco inclinados: se prueba enderezar
 *     de 0 a 0,3 y vale la inclinación con la que se reconocen más números.
 *  4. Cada número es una columna de rayas, y los dos puntos y el punto (más
 *     bajitos) separan horas, minutos y segundos. De cada número se miran las
 *     siete rayas en su lugar: cuáles están encendidas dice qué número es.
 *
 * Es una AYUDA: si una lectura no tiene sentido (más de 59 segundos, un número
 * que no se reconoce), no se usa. Ver «El reloj leído de la imagen» en
 * docs/decisiones/juegos-y-torneos.md.
 *
 *   LectorReloj.leer(gris, ancho, alto, { x, y, w, h })
 *     → { ms, texto, digitos, inclinacion } o null
 *   LectorReloj.tiempo("10532") → 3932000 (1:05:32), o null
 */
(function (G) {
  "use strict";

  // Las rayas: a arriba, b arriba a la derecha, c abajo a la derecha, d abajo,
  // e abajo a la izquierda, f arriba a la izquierda, g al medio.
  const RAYAS = {
    a: [0.5, 0.07, 0.22, 0.05], b: [0.86, 0.29, 0.08, 0.12], c: [0.86, 0.71, 0.08, 0.12],
    d: [0.5, 0.93, 0.22, 0.05], e: [0.14, 0.71, 0.08, 0.12], f: [0.14, 0.29, 0.08, 0.12], g: [0.5, 0.5, 0.22, 0.05],
  };
  const NUMERO = {
    abcdef: 0, bc: 1, abdeg: 2, abcdg: 3, bcfg: 4, acdfg: 5, acdefg: 6, cdefg: 6,
    abc: 7, abcf: 7, abcdefg: 8, abcdfg: 9, abcfg: 9,
  };

  function otsu(c) {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < c.length; i++) hist[c[i]]++;
    const total = c.length;
    let suma = 0;
    for (let i = 0; i < 256; i++) suma += i * hist[i];
    let sB = 0, wB = 0, mejor = 0, umbral = 128;
    for (let i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sB += i * hist[i];
      const mB = sB / wB, mF = (suma - sB) / wF, entre = wB * wF * (mB - mF) * (mB - mF);
      if (entre > mejor) { mejor = entre; umbral = i; }
    }
    return umbral;
  }

  /* Las manchas (4 vecinos) de una máscara: devuelve las que tocan el borde
   * (`borde`) y deja en `m` solo las demás, sin las motas (menos de un 8 %
   * de la mancha más grande: una raya del número es siempre mucho más). */
  function limpiar(m, w, h, orilla) {
    const marca = new Int32Array(w * h), pila = [], manchas = [];
    let n = 0;
    for (let i = 0; i < m.length; i++) {
      if (!m[i] || marca[i]) continue;
      n++;
      const puntos = [];
      let borde = false;
      marca[i] = n; pila.push(i);
      while (pila.length) {
        const k = pila.pop(), x = k % w, y = (k - x) / w;
        puntos.push(k);
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || (orilla && orilla[k])) borde = true;
        for (const v of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1]) {
          if (v >= 0 && m[v] && !marca[v]) { marca[v] = n; pila.push(v); }
        }
      }
      manchas.push({ puntos, borde });
    }
    const fuera = new Uint8Array(w * h);
    const grande = Math.max(0, ...manchas.filter((x) => !x.borde).map((x) => x.puntos.length));
    for (const x of manchas) {
      if (x.borde) for (const k of x.puntos) fuera[k] = 1;
      if (x.borde || x.puntos.length < Math.max(3, grande * 0.08)) for (const k of x.puntos) m[k] = 0;
    }
    return fuera;
  }
  /* Lo encendido del recuadro. Dos pasadas: en la primera, lo que toca el
   * borde (el marco del reloj, la mesa) se aparta, y el umbral se vuelve a
   * sacar solo con la pantalla: con un marco negro adentro, el primer umbral
   * separaba el marco de todo lo demás y no los números de su pantalla. */
  function separar(c, w, h, cuenta) {
    const valores = cuenta ? c.filter((_, i) => cuenta[i]) : c;
    if (valores.length < 20) return null;
    const u = otsu(valores);
    let oscuros = 0;
    for (const v of valores) if (v <= u) oscuros++;
    const encendidoOscuro = oscuros <= valores.length / 2;
    const m = new Uint8Array(w * h);
    for (let i = 0; i < c.length; i++) m[i] = (!cuenta || cuenta[i]) && (encendidoOscuro ? c[i] <= u : c[i] > u) ? 1 : 0;
    return m;
  }
  function mascara(gris, ancho, alto, r) {
    const x0 = Math.max(0, Math.round(r.x)), y0 = Math.max(0, Math.round(r.y));
    const w = Math.min(ancho, Math.round(r.x + r.w)) - x0, h = Math.min(alto, Math.round(r.y + r.h)) - y0;
    if (w < 8 || h < 6) return null;
    const c = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) c[y * w + x] = gris[(y0 + y) * ancho + x0 + x];
    const m1 = separar(c, w, h, null);
    const fuera = limpiar(m1, w, h);
    // La pantalla: lo que no es el marco (ni lo que el marco encierra por fuera).
    const adentro = new Uint8Array(w * h);
    let hay = 0;
    for (let i = 0; i < c.length; i++) if (!fuera[i]) { adentro[i] = 1; hay++; }
    const m = hay < c.length ? separar(c, w, h, adentro) : m1;
    if (!m) return null;
    /* La orilla de la pantalla (donde el marco se funde con ella, a medio
     * tono) sale como una raya fina alrededor de todo: lo que la toca,
     * hasta 2 píxeles hacia adentro, tampoco es un número. */
    let orilla = fuera;
    for (let paso = 0; paso < 2; paso++) {
      const mas = orilla.slice();
      for (let k = 0; k < c.length; k++) {
        if (orilla[k]) continue;
        const x = k % w;
        if ((x > 0 && orilla[k - 1]) || (x < w - 1 && orilla[k + 1]) || (k >= w && orilla[k - w]) || (k + w < c.length && orilla[k + w])) mas[k] = 1;
      }
      orilla = mas;
    }
    limpiar(m, w, h, hay < c.length ? orilla : null);
    return { m, w, h };
  }

  // Enderezar la inclinación: cada fila se corre a la izquierda lo que sube.
  function enderezar(mk, s) {
    if (!s) return mk;
    const { m, w, h } = mk, extra = Math.ceil(s * h), W = w + extra, out = new Uint8Array(W * h);
    for (let y = 0; y < h; y++) {
      const corre = Math.round(s * (h - 1 - y));
      for (let x = 0; x < w; x++) if (m[y * w + x]) out[y * W + x - corre + extra] = 1;
    }
    return { m: out, w: W, h };
  }

  function numeros(mk) {
    const { m, w, h } = mk;
    const col = new Array(w).fill(0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) col[x] += m[y * w + x];
    // Columnas seguidas con algo encendido: cada una, un número o un separador.
    const tramos = [];
    for (let x = 0; x < w; x++) {
      if (!col[x]) continue;
      const ult = tramos[tramos.length - 1];
      if (ult && x - ult.x1 <= 1) ult.x1 = x; else tramos.push({ x0: x, x1: x });
    }
    for (const t of tramos) {
      let y0 = h, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = t.x0; x <= t.x1; x++) if (m[y * w + x]) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
      t.y0 = y0; t.y1 = y1; t.alto = y1 - y0 + 1; t.ancho = t.x1 - t.x0 + 1;
    }
    const alto = Math.max(0, ...tramos.map((t) => t.alto));
    if (alto < 5) return null;
    const lleno = (x0, y0, x1, y1) => {
      let s = 0, n = 0;
      for (let y = Math.max(0, Math.round(y0)); y <= Math.min(h - 1, Math.round(y1)); y++)
        for (let x = Math.max(0, Math.round(x0)); x <= Math.min(w - 1, Math.round(x1)); x++) { s += m[y * w + x]; n++; }
      return n ? s / n : 0;
    };
    const salida = [], usados = [];
    for (const t of tramos) {
      if (t.alto >= alto * 0.6 || t.ancho >= alto * 0.3) usados.push(t);
      /* Bajito y angosto: los dos puntos o el punto, que separan. Bajito
       * pero ancho es un número tapado a medias (una mano, un reflejo): no
       * se salta, porque sin él la lectura daría otro tiempo. */
      if (t.alto < alto * 0.6) { salida.push(t.ancho < alto * 0.3 ? ":" : null); continue; }
      // Un 1 es una raya angosta: se mide contra el alto, no contra su ancho.
      if (t.ancho < t.alto * 0.3) { salida.push(1); continue; }
      let rayas = "";
      for (const [k, [cx, cy, rx, ry]] of Object.entries(RAYAS)) {
        if (lleno(t.x0 + (cx - rx) * t.ancho, t.y0 + (cy - ry) * t.alto, t.x0 + (cx + rx) * t.ancho, t.y0 + (cy + ry) * t.alto) > 0.45) rayas += k;
      }
      salida.push(rayas in NUMERO ? NUMERO[rayas] : null);
    }
    /* Un hueco del ancho de un número entre dos números es un número que no
     * se ve (tapado entero): la lectura no vale. Entre números seguidos el
     * hueco es de un quinto de su alto, y antes de un 1 (que es solo su raya
     * derecha) algo más de un número; sin uno de ellos, casi dos. */
    const anchos = usados.filter((t) => t.ancho >= t.alto * 0.3).map((t) => t.ancho).sort((a, b) => a - b);
    const ancho = anchos.length ? anchos[anchos.length >> 1] : alto * 0.55;
    const todos = tramos.filter((t) => t.alto >= 2);
    for (let i = 1; i < todos.length; i++) if (todos[i].x0 - todos[i - 1].x1 > ancho * 1.45) return salida.concat([null]);
    return salida;
  }

  // Los números leídos, en tiempo: 5 → h mm ss, 4 → mm ss, 3 → m ss.
  function tiempo(digitos) {
    const d = String(digitos || "");
    if (!/^\d{3,5}$/.test(d)) return null;
    const ss = Number(d.slice(-2)), mm = Number(d.slice(-4, -2) || 0), hh = d.length === 5 ? Number(d[0]) : 0;
    if (ss > 59 || (d.length >= 4 && mm > 59)) return null;
    return ((hh * 60 + mm) * 60 + ss) * 1000;
  }
  function texto(ms) {
    const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(ss).padStart(2, "0");
  }

  function leer(gris, ancho, alto, recuadro) {
    const mk = mascara(gris, ancho, alto, recuadro);
    if (!mk) return null;
    let mejor = null;
    for (const s of [0, 0.06, 0.12, 0.18, 0.24, 0.3]) {
      const ns = numeros(enderezar(mk, s));
      if (!ns || !ns.length) continue;
      const nums = ns.filter((x) => x !== ":"), bien = nums.filter((x) => x !== null).length, puntos = bien - (nums.length - bien) * 2;
      if (!mejor || puntos > mejor.puntos) mejor = { ns, puntos, s };
    }
    if (!mejor || mejor.ns.some((x) => x === null)) return null;
    /* Entre separadores, los minutos y los segundos son de a dos números: si
     * no, se perdió o se coló uno. */
    const grupos = mejor.ns.join("").split(":").filter(Boolean);
    if (grupos.length > 1 && grupos.slice(1).some((g) => g.length !== 2)) return null;
    const digitos = grupos.join(""), ms = tiempo(digitos);
    return ms === null ? null : { ms, texto: texto(ms), digitos, inclinacion: mejor.s };
  }

  const api = { leer, tiempo, texto };
  if (typeof window !== "undefined") window.LectorReloj = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
