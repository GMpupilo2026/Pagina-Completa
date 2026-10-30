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
   * (`borde`) y deja en `m` solo las demás, sin las motas (menos de un 2 %
   * de la mancha más grande, que puede ser un número entero: uno de los dos
   * puntos de un reloj es cerca de un 4 % de un 8). */
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
      if (x.borde || x.puntos.length < Math.max(3, grande * 0.02)) for (const k of x.puntos) m[k] = 0;
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
  // El recuadro, recortado y girado (0, 90, 180 o 270 grados, en el sentido del reloj).
  function recortar(gris, ancho, alto, r, giro) {
    const x0 = Math.max(0, Math.round(r.x)), y0 = Math.max(0, Math.round(r.y));
    const w = Math.min(ancho, Math.round(r.x + r.w)) - x0, h = Math.min(alto, Math.round(r.y + r.h)) - y0;
    if (w < 6 || h < 6) return null;
    const de = (x, y) => gris[(y0 + y) * ancho + x0 + x];
    const W = giro === 90 || giro === 270 ? h : w, H = giro === 90 || giro === 270 ? w : h, c = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      c[y * W + x] = giro === 90 ? de(y, h - 1 - x) : giro === 180 ? de(w - 1 - x, h - 1 - y) : giro === 270 ? de(w - 1 - y, x) : de(x, y);
    }
    return { c, w: W, h: H };
  }
  function mascara(c, w, h) {
    if (w < 8 || h < 6) return null;
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

  // Un recuadro ya derecho: el tiempo que dice, o null.
  function leerDerecho(rc) {
    const mk = rc && mascara(rc.c, rc.w, rc.h);
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
    /* Y antes del primer separador, uno o dos (las horas o los minutos): tres
     * son de dos tiempos juntos. Sin ningún separador tampoco vale: todo
     * reloj los muestra, y cinco números seguidos sin ellos salieron de un
     * pedazo de cada pantalla («32» y «0:58» sin sus dos puntos, «3:20:58»). */
    if (grupos.length < 2 || grupos[0].length > 2) return null;
    const digitos = grupos.join(""), ms = tiempo(digitos);
    return ms === null ? null : { ms, texto: texto(ms), digitos, inclinacion: mejor.s, puntos: mejor.puntos };
  }

  /* Desde arriba, el reloj de la mesa casi nunca se ve derecho: el celular
   * puede estar girado y el reloj está al costado del tablero. Se prueba
   * derecho y de cabeza (o, si el recuadro es más alto que ancho, girado a
   * un lado y al otro), y vale lo que se lee con más números reconocidos.
   * De cabeza, varios números se leen como otros (el 6 como 9): desempata
   * la inclinación, porque los de un reloj se inclinan hacia adelante y, de
   * cabeza, hacia atrás (que no se prueba). Con `giro`, solo ese. */
  function leer(gris, ancho, alto, recuadro, giro) {
    const giros = giro != null ? [giro] : recuadro.h > recuadro.w * 1.2 ? [90, 270] : [0, 180];
    let mejor = null;
    for (const g of giros) {
      const r = leerDerecho(recortar(gris, ancho, alto, recuadro, g));
      if (!r) continue;
      r.giro = g;
      const puntos = r.puntos + (r.inclinacion > 0 ? 0.5 : 0);
      if (!mejor || puntos > mejor.p) mejor = { r, p: puntos };
    }
    return mejor ? mejor.r : null;
  }

  /* Buscar el reloj en la imagen entera, sin que nadie marque nada: las
   * rayas de los números son manchas angostas y largas, más oscuras (o más
   * claras) que lo que las rodea; las que están cerca unas de otras se
   * juntan, y cada grupo con 5 rayas o más es un tiempo para leer. `fuera`
   * (x, y) → true aparta lo que no puede ser el reloj (los tableros).
   * Devuelve [{ x, y, w, h, ms, texto, giro }], los mejor leídos primero. */
  function buscar(gris, ancho, alto, opciones) {
    const fuera = (opciones && opciones.fuera) || null;
    const R = Math.max(6, Math.round(Math.min(ancho, alto) / 50));
    // Promedio de cada vecindad con una imagen integral.
    const W1 = ancho + 1, I = new Float64Array(W1 * (alto + 1));
    for (let y = 0; y < alto; y++) {
      let fila = 0;
      for (let x = 0; x < ancho; x++) { fila += gris[y * ancho + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + fila; }
    }
    const media = (x, y) => {
      const x0 = Math.max(0, x - R), y0 = Math.max(0, y - R), x1 = Math.min(ancho, x + R + 1), y1 = Math.min(alto, y + R + 1);
      return (I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0]) / ((x1 - x0) * (y1 - y0));
    };
    const rayas = [];
    for (const signo of [-1, 1]) {
      const m = new Uint8Array(ancho * alto);
      for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) {
        if (fuera && fuera(x, y)) continue;
        if (signo * (gris[y * ancho + x] - media(x, y)) > 18) m[y * ancho + x] = 1;
      }
      const marca = new Uint8Array(ancho * alto), pila = [];
      for (let i = 0; i < m.length; i++) {
        if (!m[i] || marca[i]) continue;
        let x0 = ancho, y0 = alto, x1 = -1, y1 = -1, n = 0;
        marca[i] = 1; pila.push(i);
        while (pila.length) {
          const k = pila.pop(), x = k % ancho, y = (k - x) / ancho;
          n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          for (const v of [x > 0 ? k - 1 : -1, x < ancho - 1 ? k + 1 : -1, y > 0 ? k - ancho : -1, y < alto - 1 ? k + ancho : -1]) {
            if (v >= 0 && m[v] && !marca[v]) { marca[v] = 1; pila.push(v); }
          }
        }
        const bw = x1 - x0 + 1, bh = y1 - y0 + 1, largo = Math.max(bw, bh), corto = Math.min(bw, bh), lleno = n / (bw * bh);
        if (n < 6 || largo < 5 || largo > Math.min(ancho, alto) / 4) continue;
        /* Una raya (llena, angosta y larga) o, con la imagen algo borrosa,
         * un número entero: las rayas se tocan y salen juntas, una mancha más
         * alta que ancha (o más ancha que alta, si el reloj está de lado) y
         * con huecos. Un número cuenta como tres rayas. */
        if (largo >= 2.2 * corto && lleno >= 0.45) rayas.push({ x0, y0, x1, y1, largo, signo, vale: 1 });
        else if (largo >= 1.2 * corto && largo <= 3.5 * corto && lleno >= 0.15 && lleno <= 0.85) rayas.push({ x0, y0, x1, y1, largo, signo, vale: 3 });
      }
    }
    // Juntar las rayas cercanas (del mismo signo): unión de conjuntos.
    const padre = rayas.map((_, i) => i);
    const raiz = (i) => { while (padre[i] !== i) i = padre[i] = padre[padre[i]]; return i; };
    for (let i = 0; i < rayas.length; i++) for (let j = i + 1; j < rayas.length; j++) {
      const a = rayas[i], b = rayas[j];
      if (a.signo !== b.signo) continue;
      const dx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)), dy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
      if (Math.hypot(dx, dy) < 0.8 * Math.max(a.largo, b.largo)) padre[raiz(i)] = raiz(j);
    }
    const grupos = new Map();
    rayas.forEach((r, i) => { const k = raiz(i); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(r); });
    const hallados = [];
    /* Un grupo que no se lee puede ser las DOS pantallas del reloj juntas
     * (entre una y otra a veces hay menos que entre dos rayas): se parte a lo
     * largo del grupo por cada uno de sus tres huecos más grandes (el que
     * separa las pantallas no siempre es el mayor: antes de un 1 también hay
     * uno grande) y se prueba cada mitad. De lo que se encima, al final queda
     * lo mejor leído. */
    const probar = (g, hondo) => {
      if (g.reduce((t, r) => t + r.vale, 0) < 5) return;
      const x0 = Math.min(...g.map((r) => r.x0)), y0 = Math.min(...g.map((r) => r.y0)), x1 = Math.max(...g.map((r) => r.x1)), y1 = Math.max(...g.map((r) => r.y1));
      const mx = Math.max(4, Math.round(0.08 * (x1 - x0))), my = Math.max(4, Math.round(0.15 * (y1 - y0)));
      const rec = { x: Math.max(0, x0 - mx), y: Math.max(0, y0 - my), w: Math.min(ancho, x1 + mx + 1) - Math.max(0, x0 - mx), h: Math.min(alto, y1 + my + 1) - Math.max(0, y0 - my) };
      const r = leer(gris, ancho, alto, rec);
      if (r) { hallados.push(Object.assign(rec, { ms: r.ms, texto: r.texto, giro: r.giro, puntos: r.puntos })); return; }
      if (hondo >= 2 || g.length < 4) return;
      const largo = x1 - x0 >= y1 - y0, ini = (r) => (largo ? r.x0 : r.y0), fin = (r) => (largo ? r.x1 : r.y1);
      const orden = g.slice().sort((a, b) => ini(a) - ini(b));
      const huecos = [];
      let hasta = fin(orden[0]);
      for (let k = 1; k < orden.length; k++) {
        if (ini(orden[k]) - hasta > 0) huecos.push({ k, h: ini(orden[k]) - hasta });
        hasta = Math.max(hasta, fin(orden[k]));
      }
      for (const { k } of huecos.sort((a, b) => b.h - a.h).slice(0, 3)) { probar(orden.slice(0, k), hondo + 1); probar(orden.slice(k), hondo + 1); }
    };
    for (const g of grupos.values()) probar(g, 0);
    /* Los huecos claros dentro de los números oscuros salen como otro grupo
     * en el mismo lugar: de lo que se encima, queda uno (el mejor leído). */
    const encima = (a, b) => { const cx = a.x + a.w / 2, cy = a.y + a.h / 2; return cx > b.x && cx < b.x + b.w && cy > b.y && cy < b.y + b.h; };
    const salida = [];
    for (const h of hallados.sort((a, b) => b.puntos - a.puntos || b.w * b.h - a.w * a.h)) if (!salida.some((o) => encima(h, o) || encima(o, h))) salida.push(h);
    return salida;
  }

  const api = { leer, buscar, tiempo, texto };
  if (typeof window !== "undefined") window.LectorReloj = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
