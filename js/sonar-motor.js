/* ===== El Sonar — las reglas, sin pantalla =====
 *
 * Un juego escrito para jugarse SIN VER. Hay un tesoro hundido en una casilla
 * del tablero y no lo ve nadie: ni quien usa lector de pantalla ni quien mira
 * el monitor. Tu pieza —un rey o un caballo— lo busca moviéndose como se mueve
 * en ajedrez, y después de cada movimiento el sonar dice A CUÁNTAS JUGADAS DE
 * ESA PIEZA está el tesoro. Con dos o tres lecturas se deduce dónde está.
 *
 * Por eso es accesible de verdad y no "adaptado": no hay nada que ver que haya
 * que traducir. Todo lo que el juego sabe decir es un número y una casilla, y
 * eso se oye igual de bien que se lee. El tablero dibujado es una ayuda para
 * quien mira, no la información.
 *
 * Y de paso enseña algo que cuesta mucho: la GEOMETRÍA de la pieza. Que a un
 * caballo la casilla de al lado le queda a tres saltos, o que la esquina de
 * enfrente le queda a seis, no se aprende leyéndolo: se aprende escuchando el
 * sonar equivocarse con lo que uno esperaba.
 *
 * Este archivo no toca el DOM: lo usan sonar.html y el verificador
 * (herramientas/verificar-sonar.js), que lo corre en Node. Así lo que se
 * comprueba es la misma regla que juega el alumno, no una copia.
 */
(function (raiz) {
  "use strict";

  var COLUMNAS = ["a", "b", "c", "d", "e", "f", "g", "h"];
  var SALTOS_CABALLO = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  var PASOS_REY = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

  var TODAS = [];
  for (var f = 1; f <= 8; f++) for (var c = 0; c < 8; c++) TODAS.push(COLUMNAS[c] + f);

  function col(sq) { return COLUMNAS.indexOf(sq[0]); }
  function fila(sq) { return Number(sq[1]); }
  function casilla(c, f) { return (c >= 0 && c < 8 && f >= 1 && f <= 8) ? COLUMNAS[c] + f : null; }
  function esCasilla(sq) { return typeof sq === "string" && /^[a-h][1-8]$/.test(sq); }

  function vecinas(sq, dirs) {
    var out = [];
    dirs.forEach(function (d) {
      var s = casilla(col(sq) + d[0], fila(sq) + d[1]);
      if (s) out.push(s);
    });
    return out;
  }

  /* Las dos piezas. `distancia` es cuántas jugadas de ESA pieza separan dos
     casillas — lo único que dice el sonar. Para el rey es una cuenta; para el
     caballo se calcula una vez con una búsqueda en anchura y se guarda: son
     64×64 números y el sonar los pide en cada salto. */
  var distCaballo = null;
  function tablaCaballo() {
    if (distCaballo) return distCaballo;
    distCaballo = {};
    TODAS.forEach(function (origen) {
      var d = {}; d[origen] = 0;
      var cola = [origen];
      while (cola.length) {
        var x = cola.shift();
        vecinas(x, SALTOS_CABALLO).forEach(function (y) {
          if (d[y] === undefined) { d[y] = d[x] + 1; cola.push(y); }
        });
      }
      distCaballo[origen] = d;
    });
    return distCaballo;
  }

  var PIEZAS = {
    k: {
      tipo: "k", nombre: "rey", articulo: "el", verbo: "paso", verbos: "pasos",
      jugadas: function (sq) { return vecinas(sq, PASOS_REY); },
      distancia: function (a, b) { return Math.max(Math.abs(col(a) - col(b)), Math.abs(fila(a) - fila(b))); },
    },
    n: {
      tipo: "n", nombre: "caballo", articulo: "el", verbo: "salto", verbos: "saltos",
      jugadas: function (sq) { return vecinas(sq, SALTOS_CABALLO); },
      distancia: function (a, b) { return tablaCaballo()[a][b]; },
    },
  };

  /* Los niveles. Van de lo que se deduce contando con los dedos (el rey) a lo
     que obliga a pensar de verdad cómo salta un caballo. `holgura` son las
     jugadas de más que se perdonan sobre el camino más corto para seguir
     sacando tres estrellas: buscar algo escondido cuesta jugadas, y exigir el
     camino exacto sería pedir adivinar. */
  var NIVELES = [
    { id: 1, pieza: "k", tesoros: 1, turbio: false, distanciaMin: 4, holgura: 2,
      titulo: "El rey buzo",
      resumen: "Un rey busca un tesoro. El sonar dice a cuántos pasos de rey está." },
    { id: 2, pieza: "n", tesoros: 1, turbio: false, distanciaMin: 3, holgura: 4,
      titulo: "El caballo buzo",
      resumen: "Ahora busca un caballo. El sonar cuenta en saltos de caballo, que no se parecen en nada a los pasos." },
    { id: 3, pieza: "n", tesoros: 2, turbio: false, distanciaMin: 3, holgura: 5,
      titulo: "Dos tesoros",
      resumen: "Hay dos tesoros y el sonar solo oye el más cercano. Hay que recoger los dos." },
    { id: 4, pieza: "n", tesoros: 1, turbio: true, distanciaMin: 3, holgura: 6,
      titulo: "Aguas turbias",
      resumen: "El agua está turbia: el sonar ya no da números. Solo dice si quedaste más cerca, más lejos o igual que antes." },
  ];
  function nivel(id) {
    for (var i = 0; i < NIVELES.length; i++) if (NIVELES[i].id === Number(id)) return NIVELES[i];
    return null;
  }

  /* El azar se puede fijar, para que el verificador juegue siempre la misma
     partida. En el navegador se usa Math.random. */
  function azarCon(semilla) {
    if (semilla === undefined || semilla === null) return Math.random;
    var s = (Number(semilla) >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  function elegir(lista, azar) { return lista[Math.floor(azar() * lista.length)]; }

  function distanciaAlMasCercano(p, sq, tesoros) {
    var m = Infinity;
    tesoros.forEach(function (t) { m = Math.min(m, p.distancia(sq, t)); });
    return m;
  }

  /* El camino más corto sabiendo dónde está todo: para un tesoro es la
     distancia; para dos, el mejor de los dos órdenes. Es la vara de las
     estrellas. */
  function caminoMinimo(p, inicio, tesoros) {
    if (tesoros.length === 1) return p.distancia(inicio, tesoros[0]);
    var a = tesoros[0], b = tesoros[1];
    return Math.min(p.distancia(inicio, a), p.distancia(inicio, b)) + p.distancia(a, b);
  }

  function nuevaPartida(idNivel, semilla) {
    var n = nivel(idNivel) || NIVELES[0];
    var p = PIEZAS[n.pieza];
    var azar = azarCon(semilla);
    var inicio = elegir(TODAS, azar);
    var lejos = TODAS.filter(function (s) { return p.distancia(inicio, s) >= n.distanciaMin; });
    var tesoros = [elegir(lejos, azar)];
    if (n.tesoros === 2) {
      // El segundo, lejos de los dos: si cayera al lado del primero, encontrar
      // uno sería encontrar los dos y el nivel no pediría nada nuevo.
      var otros = lejos.filter(function (s) { return s !== tesoros[0] && p.distancia(tesoros[0], s) >= 3; });
      tesoros.push(elegir(otros.length ? otros : lejos.filter(function (s) { return s !== tesoros[0]; }), azar));
    }
    var partida = {
      nivel: n.id,
      pieza: n.pieza,
      inicio: inicio,
      pos: inicio,
      tesoros: tesoros.slice(),        // los que quedan por recoger
      recogidos: [],
      jugadas: 0,
      ayudas: 0,
      terminada: false,
      minimo: caminoMinimo(p, inicio, tesoros),
      // Cada lectura queda anotada con su casilla: es la memoria del juego, y
      // quien no ve el tablero la necesita escrita —"historial"— porque no
      // tiene los números pintados delante.
      lecturas: [],
      desdeLectura: 0,      // desde qué lectura cuentan para la pista
      ultimaDistancia: null,
    };
    partida.lecturas.push(leer(partida));
    return partida;
  }

  /* Lo que dice el sonar en la casilla donde está la pieza. */
  function leer(partida) {
    var n = nivel(partida.nivel), p = PIEZAS[partida.pieza];
    var d = partida.tesoros.length ? distanciaAlMasCercano(p, partida.pos, partida.tesoros) : 0;
    var lectura = { casilla: partida.pos, distancia: d, quedan: partida.tesoros.length };
    if (n.turbio) {
      var antes = partida.ultimaDistancia;
      lectura.tendencia = antes === null ? "inicio" : d < antes ? "cerca" : d > antes ? "lejos" : "igual";
    }
    partida.ultimaDistancia = d;
    return lectura;
  }

  function jugadasLegales(partida) {
    return PIEZAS[partida.pieza].jugadas(partida.pos);
  }

  /* Mover. Devuelve qué pasó, para que la página lo cuente: nunca lanza, porque
     una casilla mal escrita o un salto imposible son lo normal cuando se juega
     escribiendo, no un error. */
  function mover(partida, destino) {
    if (partida.terminada) return { ok: false, motivo: "terminada" };
    if (!esCasilla(destino)) return { ok: false, motivo: "casilla" };
    if (destino === partida.pos) return { ok: false, motivo: "misma" };
    if (jugadasLegales(partida).indexOf(destino) === -1) return { ok: false, motivo: "ilegal" };
    partida.pos = destino;
    partida.jugadas++;
    var encontrado = partida.tesoros.indexOf(destino) !== -1;
    if (encontrado) {
      partida.tesoros.splice(partida.tesoros.indexOf(destino), 1);
      partida.recogidos.push(destino);
      // Al recoger uno, la tendencia vuelve a empezar: comparar contra la
      // distancia a un tesoro que ya no está sería comparar peras con manzanas.
      partida.ultimaDistancia = null;
      partida.desdeLectura = partida.lecturas.length;   // la que se va a anotar abajo
    }
    if (!partida.tesoros.length) partida.terminada = true;
    var lectura = leer(partida);
    partida.lecturas.push(lectura);
    return { ok: true, encontrado: encontrado, terminada: partida.terminada, lectura: lectura };
  }

  /* Dónde PUEDE estar el tesoro según lo que el sonar ya dijo. Es la pista, y
     es también lo que el verificador usa para comprobar que el juego se puede
     resolver pensando: si ninguna casilla cuadrara con las lecturas, el sonar
     estaría mintiendo.
     Con dos tesoros solo tiene sentido cuando queda uno (cada lectura mide el
     más cercano de dos, y eso no acota una casilla sola): se cuenta desde el
     momento en que se recogió el primero. */
  function candidatas(partida) {
    var n = nivel(partida.nivel), p = PIEZAS[partida.pieza];
    // Desde la lectura hecha al recoger el primero, que queda anotada en ese
    // momento. Buscarla por su casilla sería un error callado: volver a pisar
    // esa casilla más tarde movería el corte y la pista olvidaría todo lo que
    // el sonar dijo entre medio.
    var utiles = partida.lecturas.slice(partida.desdeLectura || 0);
    if (n.tesoros === 2 && partida.tesoros.length === 2) return null;
    var pisadas = {};
    partida.lecturas.forEach(function (l) { pisadas[l.casilla] = true; });
    return TODAS.filter(function (s) {
      if (pisadas[s]) return false;   // donde ya se estuvo, no está
      for (var j = 0; j < utiles.length; j++) {
        var l = utiles[j];
        if (n.turbio) {
          if (j === 0) continue;
          var a = p.distancia(utiles[j - 1].casilla, s), b = p.distancia(l.casilla, s);
          var t = b < a ? "cerca" : b > a ? "lejos" : "igual";
          if (t !== l.tendencia) return false;
        } else if (p.distancia(l.casilla, s) !== l.distancia) return false;
      }
      return true;
    });
  }

  /* Estrellas: tres si se llegó con pocas jugadas de más y sin pistas. La
     pista no quita la partida —se termina igual— pero una ronda con ayuda no
     puede valer lo mismo que una sin ella, o nadie pensaría. */
  function estrellas(partida) {
    if (!partida.terminada) return 0;
    var n = nivel(partida.nivel);
    var sobra = partida.jugadas - partida.minimo;
    if (sobra <= n.holgura && !partida.ayudas) return 3;
    if (sobra <= n.holgura + 4) return 2;
    return 1;
  }

  /* ---------------------------------------------------------- escribir
     Lo que la persona escribe. Una casilla se escribe como se lee ("e4") o
     como se DICE en el sitio ("eva 4", "eva cuatro"): escribir lo que uno
     acaba de oír tiene que funcionar. */
  var NOMBRES_COLUMNA = {
    anna: "a", ana: "a", bella: "b", cesar: "c", "césar": "c", david: "d",
    eva: "e", felix: "f", "félix": "f", gustav: "g", gustavo: "g", hector: "h", "héctor": "h",
  };
  var NUMEROS = { uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8 };

  function leerCasilla(texto) {
    var t = String(texto || "").toLowerCase().trim().replace(/[.,;:!¡¿?]/g, " ").replace(/\s+/g, " ").trim();
    if (!t) return null;
    var m = t.match(/^([a-h])\s*([1-8])$/);
    if (m) return m[1] + m[2];
    var partes = t.split(" ");
    if (partes.length === 2) {
      var c = NOMBRES_COLUMNA[partes[0]] || (/^[a-h]$/.test(partes[0]) ? partes[0] : null);
      var f = NUMEROS[partes[1]] || (/^[1-8]$/.test(partes[1]) ? Number(partes[1]) : null);
      if (c && f) return c + f;
    }
    return null;
  }

  /* Los comandos. Van en palabras enteras y NUNCA en una letra suelta que
     pueda ser una columna: "a", "b", "c" … son el principio de una casilla y
     no pueden significar otra cosa. */
  var COMANDOS = {
    sonar: ["sonar", "otra vez", "repetir", "repite", "lectura"],
    donde: ["donde", "dónde", "donde estoy", "dónde estoy", "posicion", "posición"],
    jugadas: ["jugadas", "saltos", "pasos", "movimientos", "a donde", "a dónde"],
    historial: ["historial", "memoria", "lecturas", "recuerdo"],
    pista: ["pista", "ayuda con el tesoro", "candidatas"],
    ayuda: ["ayuda", "comandos", "instrucciones", "?"],
    nuevo: ["nuevo", "nueva", "otra", "reiniciar", "de nuevo", "otra partida"],
  };
  function leerComando(texto) {
    var t = String(texto || "").toLowerCase().trim().replace(/[.!¡¿]/g, "").replace(/\s+/g, " ").trim();
    if (!t) return null;
    var niv = t.match(/^nivel\s*([1-9])$/);
    if (niv) return { cmd: "nivel", nivel: Number(niv[1]) };
    for (var k in COMANDOS) if (COMANDOS[k].indexOf(t) !== -1) return { cmd: k };
    var sq = leerCasilla(t);
    if (sq) return { cmd: "mover", casilla: sq };
    return null;
  }

  var api = {
    COLUMNAS: COLUMNAS, TODAS: TODAS, PIEZAS: PIEZAS, NIVELES: NIVELES,
    nivel: nivel, nuevaPartida: nuevaPartida, mover: mover, jugadasLegales: jugadasLegales,
    candidatas: candidatas, estrellas: estrellas, caminoMinimo: caminoMinimo,
    leerCasilla: leerCasilla, leerComando: leerComando, esCasilla: esCasilla,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.SonarMotor = api;
})(typeof window !== "undefined" ? window : this);
