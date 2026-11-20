/* Ajedrez Integral — los ejercicios de «De oído» (entreno/oido.html), sin
   pantalla: la lógica pura, que la página usa y el verificador prueba.

   Tres ejercicios de visualización para hacer sin ver el tablero, que es la
   habilidad que más necesita un ajedrecista ciego (y que le sirve a todos):
   - «¿A dónde llega?»: una pieza sola en el tablero vacío. Decir todas las
     casillas a las que llega (caballo, rey) o si llega a una casilla dada
     (alfil, torre, dama, caballo).
   - «El camino del caballo»: de una casilla a otra, ¿en cuántas jugadas como
     mínimo? (búsqueda a lo ancho: la respuesta es exacta).
   - «La partida dictada»: se dictan las primeras jugadas de una apertura real
     del banco (js/aperturas-lineas.js, ya verificado) y se pregunta dónde
     quedó una pieza. La posición la arma chess.js jugando esas jugadas:
     «ninguna posición se inventa».

   El sorteo recibe el azar (`rand`) desde afuera: así la prueba es repetible.
   Ver «De oído» en docs/decisiones/entrenamiento.md. */
(function () {
  "use strict";

  const COLUMNAS = "abcdefgh";
  const TODAS = [];
  for (const c of COLUMNAS) for (let f = 1; f <= 8; f++) TODAS.push(c + f);
  const NOMBRE = { k: "rey", q: "dama", r: "torre", b: "alfil", n: "caballo", p: "peón" };
  // Las columnas dichas como en el resto del sitio (js/blind-notation.js) y como se pronuncian.
  const COLUMNA_DICHA = { anna: "a", ana: "a", bella: "b", be: "b", cesar: "c", ce: "c", david: "d", de: "d", eva: "e",
    felix: "f", efe: "f", gustav: "g", ge: "g", hector: "h", hache: "h" };
  const NUMERO_DICHO = { uno: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6", siete: "7", ocho: "8" };

  const xy = (sq) => [COLUMNAS.indexOf(sq[0]), Number(sq[1]) - 1];
  const sq = (x, y) => (x >= 0 && x < 8 && y >= 0 && y < 8 ? COLUMNAS[x] + (y + 1) : null);

  /* A qué casillas llega una pieza sola en el tablero vacío. */
  function alcance(tipo, desde) {
    const [x, y] = xy(desde);
    const salida = [];
    const saltos = tipo === "n" ? [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
      : tipo === "k" ? [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] : null;
    if (saltos) {
      for (const [dx, dy] of saltos) { const s = sq(x + dx, y + dy); if (s) salida.push(s); }
    } else {
      const dirs = (tipo === "r" || tipo === "q" ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [])
        .concat(tipo === "b" || tipo === "q" ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : []);
      for (const [dx, dy] of dirs) {
        for (let k = 1; k < 8; k++) { const s = sq(x + dx * k, y + dy * k); if (!s) break; salida.push(s); }
      }
    }
    return salida.sort();
  }

  /* El camino más corto del caballo (búsqueda a lo ancho): cuántas jugadas y una ruta. */
  function caminoCaballo(desde, hasta) {
    const previo = new Map([[desde, null]]);
    const cola = [desde];
    while (cola.length) {
      const a = cola.shift();
      if (a === hasta) break;
      for (const b of alcance("n", a)) if (!previo.has(b)) { previo.set(b, a); cola.push(b); }
    }
    const ruta = [];
    for (let s = hasta; s; s = previo.get(s)) ruta.unshift(s);
    return { jugadas: ruta.length - 1, ruta };
  }

  /* Las casillas que escribió (o dijo) el alumno: «e2, f3 h3», «eva 4»,
     «efe tres». Devuelve un arreglo sin repetidas, en orden. */
  function leerCasillas(texto) {
    let t = String(texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const columnas = Object.keys(COLUMNA_DICHA).sort((a, b) => b.length - a.length).join("|");
    const numeros = Object.keys(NUMERO_DICHO).join("|");
    t = t.replace(new RegExp("\\b(" + columnas + ")\\s*(" + numeros + "|[1-8])\\b", "g"), (m, c, n) => COLUMNA_DICHA[c] + (NUMERO_DICHO[n] || n));
    t = t.replace(new RegExp("\\b([a-h])\\s*(" + numeros + ")\\b", "g"), (m, c, n) => c + NUMERO_DICHO[n]);
    t = t.replace(/\b([a-h])\s+([1-8])\b/g, "$1$2");
    const vistas = [];
    for (const m of t.matchAll(/\b([a-h][1-8])\b/g)) if (vistas.indexOf(m[1]) < 0) vistas.push(m[1]);
    return vistas;
  }
  function leerSiNo(texto) {
    const t = String(texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    if (/^(si|s|claro|llega)\b/.test(t)) return true;
    if (/^(no|n|nunca)\b/.test(t)) return false;
    return null;
  }
  function leerNumero(texto) {
    const t = String(texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    const d = t.match(/\d+/);
    if (d) return Number(d[0]);
    const palabras = { cero: 0, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8 };
    for (const [p, n] of Object.entries(palabras)) if (new RegExp("\\b" + p + "\\b").test(t)) return n;
    return null;
  }

  const elegir = (rand, lista) => lista[Math.floor(rand() * lista.length) % lista.length];

  /* ---------------- los tres ejercicios ---------------- */

  /* «¿A dónde llega?». Fácil: rey y caballo, decir las casillas. Medio: caballo
     en el borde (menos casillas, más fáciles de olvidar) y «¿llega?» con alfil
     o torre. Difícil: «¿llega?» con dama y caballo lejos. */
  function generarAlcance(rand, nivel) {
    const tipoLista = nivel === "facil" ? "lista" : nivel === "medio" ? (rand() < 0.5 ? "lista" : "llega") : (rand() < 0.35 ? "lista" : "llega");
    if (tipoLista === "lista") {
      const pieza = nivel === "facil" ? elegir(rand, ["n", "k"]) : "n";
      const desde = elegir(rand, nivel === "facil" ? TODAS.filter((s) => /[c-f][3-6]/.test(s)) : TODAS);
      return { modo: "alcance", tipo: "lista", pieza, desde, respuesta: alcance(pieza, desde) };
    }
    const pieza = nivel === "medio" ? elegir(rand, ["b", "r", "n"]) : elegir(rand, ["q", "n", "b"]);
    const desde = elegir(rand, TODAS);
    const llega = alcance(pieza, desde);
    // La mitad de las veces sí llega: si no, la respuesta sería casi siempre «no».
    const sí = rand() < 0.5;
    const opciones = sí ? llega : TODAS.filter((s) => s !== desde && llega.indexOf(s) < 0);
    const hasta = elegir(rand, opciones);
    return { modo: "alcance", tipo: "llega", pieza, desde, hasta, respuesta: llega.indexOf(hasta) >= 0 };
  }

  /* «El camino del caballo»: fácil 1-2 jugadas, medio 3-4, difícil 5-6. */
  function generarCamino(rand, nivel) {
    const [min, max] = nivel === "facil" ? [1, 2] : nivel === "medio" ? [3, 4] : [5, 6];
    for (let intento = 0; intento < 500; intento++) {
      const desde = elegir(rand, TODAS);
      const hasta = elegir(rand, TODAS);
      if (desde === hasta) continue;
      const c = caminoCaballo(desde, hasta);
      if (c.jugadas >= min && c.jugadas <= max) return { modo: "camino", desde, hasta, respuesta: c.jugadas, ruta: c.ruta };
    }
    return { modo: "camino", desde: "b1", hasta: "c3", respuesta: 1, ruta: ["b1", "c3"] };
  }

  /* «La partida dictada»: fácil 4 jugadas (2 de cada lado), medio 8, difícil 12.
     Se sigue cada pieza desde su casilla de salida (con capturas, enroques y
     capturas al paso) y se pregunta por una que se movió y sigue en el tablero. */
  function generarDictado(rand, nivel, lineas, Chess) {
    const medias = nivel === "facil" ? 4 : nivel === "medio" ? 8 : 12;
    const candidatas = (lineas || []).filter((l) => l.jugadas && l.jugadas.length >= medias);
    if (!candidatas.length || !Chess) return null;
    const linea = elegir(rand, candidatas);
    const s = seguirPiezas(linea.jugadas.slice(0, medias), Chess);
    if (!s) return null;   // el banco ya está verificado; si algo no cuadra, no se pregunta
    const movidas = [...s.dondeEsta.entries()].filter(([origen, ahora]) => ahora && ahora !== origen);
    if (!movidas.length) return null;
    const [origen, ahora] = elegir(rand, movidas);
    const pieza = s.juego.get(ahora);
    return { modo: "dictado", linea: linea.id, nombreLinea: linea.nombre, jugadas: s.jugadas, origen, pieza: pieza.type, color: pieza.color, respuesta: ahora };
  }

  /* Juega las jugadas con chess.js y sigue cada pieza desde su casilla de
     salida: «casilla de salida → dónde está ahora» (null si la capturaron),
     con capturas, enroques (la torre también se mueve) y capturas al paso.
     null si alguna jugada no es legal. */
  function seguirPiezas(sans, Chess) {
    const juego = new Chess();
    const dondeEsta = new Map();   // casilla de salida → dónde está ahora (o null si la capturaron)
    const quienEsta = new Map();   // casilla actual → casilla de salida
    juego.board().forEach((fila, y) => fila.forEach((p, x) => { if (p) { const s = COLUMNAS[x] + (8 - y); dondeEsta.set(s, s); quienEsta.set(s, s); } }));
    const mover = (de, a) => {
      const origen = quienEsta.get(de);
      quienEsta.delete(de);
      if (quienEsta.has(a)) dondeEsta.set(quienEsta.get(a), null);   // captura
      quienEsta.set(a, origen);
      dondeEsta.set(origen, a);
    };
    const jugadas = [];
    for (const san of sans) {
      const m = juego.move(san);
      if (!m) return null;
      jugadas.push(m.san);
      if (m.flags.indexOf("e") >= 0) {
        const capturado = m.to[0] + m.from[1];
        dondeEsta.set(quienEsta.get(capturado), null);
        quienEsta.delete(capturado);
      }
      mover(m.from, m.to);
      if (m.flags.indexOf("k") >= 0) mover("h" + m.from[1], "f" + m.from[1]);
      if (m.flags.indexOf("q") >= 0) mover("a" + m.from[1], "d" + m.from[1]);
    }
    return { juego, jugadas, dondeEsta };
  }

  /* ---------------- la corrección ---------------- */
  function corregir(ej, texto) {
    if (ej.modo === "alcance" && ej.tipo === "lista") {
      const dichas = leerCasillas(texto);
      const faltan = ej.respuesta.filter((s) => dichas.indexOf(s) < 0);
      const sobran = dichas.filter((s) => ej.respuesta.indexOf(s) < 0);
      return { entendido: dichas.length > 0, bien: dichas.length > 0 && !faltan.length && !sobran.length, faltan, sobran };
    }
    if (ej.modo === "alcance") {
      const v = leerSiNo(texto);
      return { entendido: v !== null, bien: v === ej.respuesta };
    }
    if (ej.modo === "camino") {
      const n = leerNumero(texto);
      return { entendido: n !== null, bien: n === ej.respuesta };
    }
    const dichas = leerCasillas(texto);
    return { entendido: dichas.length > 0, bien: dichas.length === 1 && dichas[0] === ej.respuesta };
  }

  const api = { alcance, caminoCaballo, leerCasillas, leerSiNo, leerNumero, generarAlcance, generarCamino, generarDictado, seguirPiezas, corregir, NOMBRE, TODAS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.OidoEjercicios = api;
})();

/*! rev bfb5bbb0d2d82f9f */
