/* ===== Batalla naval de ajedrez — las reglas, sin pantalla =====
 *
 * La batalla naval de siempre, pero los barcos son piezas de ajedrez. La
 * computadora esconde su flota —una torre, un alfil, un caballo…— en el
 * tablero y tú disparas a una casilla. Si había una pieza, se hunde y se dice
 * cuál era. Si era agua, el disparo trae lo que la hace de ajedrez: CUÁNTAS
 * piezas de la flota apuntan a esa casilla. Con eso se deduce dónde están,
 * como en el buscaminas, y se aprende de paso la geometría de cada pieza: que
 * una casilla con un 0 deja libres su fila, su columna, sus diagonales y sus
 * saltos de caballo no se aprende leyéndolo.
 *
 * Una regla, para que la deducción sea limpia: CADA PIEZA CUENTA COMO SI
 * ESTUVIERA SOLA EN EL TABLERO. Las piezas escondidas no se tapan entre sí, y
 * la cuenta es siempre de la flota ENTERA, también de las piezas ya hundidas
 * (se ven en el tablero, así que se pueden restar). Así un número dicho una vez
 * no cambia nunca, y el historial no miente con el tiempo.
 *
 * Los tres primeros niveles se juegan solos, con estrellas. El cuarto es un
 * duelo: tú también tienes flota, y la computadora te dispara con la misma
 * información que tendrías tú.
 *
 * Este archivo no toca el DOM: lo usan batalla-naval.html y el verificador
 * (herramientas/verificar-batalla-naval.js), que lo corre en Node y compara la
 * geometría de las piezas con chess.js. Lo que se comprueba es la regla que
 * juega el alumno, no una copia.
 */
(function (raiz) {
  "use strict";

  // Leer una casilla escrita («e4», «eva 4», «félix ocho») es lo mismo que en
  // El Sonar: una sola copia, la de js/sonar-motor.js.
  var Sonar = (typeof module !== "undefined" && module.exports) ? require("./sonar-motor.js") : raiz.SonarMotor;

  var COLUMNAS = ["a", "b", "c", "d", "e", "f", "g", "h"];
  var TODAS = [];
  for (var f = 1; f <= 8; f++) for (var c = 0; c < 8; c++) TODAS.push(COLUMNAS[c] + f);

  function col(sq) { return COLUMNAS.indexOf(sq[0]); }
  function fila(sq) { return Number(sq[1]); }
  function esCasilla(sq) { return typeof sq === "string" && /^[a-h][1-8]$/.test(sq); }

  /* Las piezas de la flota. Sin rey ni peones: el rey no es un barco que se
     hunda, y el peón ataca distinto según el color, que acá no hay. */
  var PIEZAS = {
    q: { tipo: "q", nombre: "dama", articulo: "la", glifo: "♛" },
    r: { tipo: "r", nombre: "torre", articulo: "la", glifo: "♜" },
    b: { tipo: "b", nombre: "alfil", articulo: "el", glifo: "♝" },
    n: { tipo: "n", nombre: "caballo", articulo: "el", glifo: "♞" },
  };

  /* ¿Una pieza de este tipo en `desde` llega a `hasta`, con el tablero vacío?
     Es simétrico para las cuatro piezas, y el verificador lo compara con
     chess.js casilla por casilla. */
  function ataca(tipo, desde, hasta) {
    if (desde === hasta) return false;
    var dc = Math.abs(col(desde) - col(hasta)), df = Math.abs(fila(desde) - fila(hasta));
    var recta = dc === 0 || df === 0, diagonal = dc === df;
    if (tipo === "r") return recta;
    if (tipo === "b") return diagonal;
    if (tipo === "q") return recta || diagonal;
    if (tipo === "n") return (dc === 1 && df === 2) || (dc === 2 && df === 1);
    return false;
  }

  /* Los niveles. `estrellas3` y `estrellas2` son los disparos con los que se
     sacan tres o dos estrellas; salen de hacer jugar a un jugador que solo
     deduce (el verificador lo corre y avisa si dejan de alcanzarse). */
  var NIVELES = [
    { id: 1, flota: ["r", "b", "n"], estrellas3: 20, estrellas2: 30,
      titulo: "Tres barcos",
      resumen: "La computadora escondió una torre, un alfil y un caballo. Cuando cae en el agua, tu disparo dice cuántas de esas piezas apuntan a la casilla." },
    { id: 2, flota: ["q", "r", "b", "n"], estrellas3: 22, estrellas2: 32,
      titulo: "Zarpa la dama",
      resumen: "Se suma la dama, que apunta en las ocho direcciones. Un 0 ahora despeja muchísimo." },
    { id: 3, flota: ["q", "r", "r", "b", "b", "n", "n"], estrellas3: 30, estrellas2: 42,
      titulo: "Flota completa",
      resumen: "Dama, dos torres, dos alfiles y dos caballos. Los números son grandes: réstale las piezas que ya hundiste." },
    { id: 4, flota: ["q", "r", "b", "n"], duelo: true,
      titulo: "Duelo contra la computadora",
      resumen: "Ahora tú también tienes flota, y la computadora te dispara con la misma información que tienes tú. Gana quien hunda primero la flota del otro." },
  ];
  function nivel(id) {
    for (var i = 0; i < NIVELES.length; i++) if (NIVELES[i].id === Number(id)) return NIVELES[i];
    return null;
  }

  /* El azar se puede fijar, para que el verificador juegue siempre las mismas
     partidas. En el navegador se usa Math.random. */
  function azarCon(semilla) {
    if (semilla === undefined || semilla === null) return Math.random;
    var s = (Number(semilla) >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  function barajar(lista, azar) {
    var a = lista.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(azar() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* Un mar: una flota escondida y los disparos que recibió. */
  function nuevoMar(tipos, azar) {
    var casillas = barajar(TODAS, azar).slice(0, tipos.length);
    return {
      flota: tipos.map(function (t, i) { return { tipo: t, casilla: casillas[i], hundida: false }; }),
      disparos: [],
    };
  }

  function piezaEn(mar, sq) {
    for (var i = 0; i < mar.flota.length; i++) if (mar.flota[i].casilla === sq) return mar.flota[i];
    return null;
  }
  function disparoEn(mar, sq) {
    for (var i = 0; i < mar.disparos.length; i++) if (mar.disparos[i].casilla === sq) return mar.disparos[i];
    return null;
  }
  function aFlote(mar) { return mar.flota.filter(function (p) { return !p.hundida; }); }

  /* Cuántas piezas de la flota ENTERA apuntan a la casilla. */
  function cuenta(mar, sq) {
    var n = 0;
    mar.flota.forEach(function (p) { if (ataca(p.tipo, p.casilla, sq)) n++; });
    return n;
  }

  /* Disparar. Nunca lanza: una casilla mal escrita o repetida es lo normal
     cuando se juega escribiendo, no un error. */
  function dispararEn(mar, sq) {
    if (!esCasilla(sq)) return { ok: false, motivo: "casilla" };
    var antes = disparoEn(mar, sq);
    if (antes) return { ok: false, motivo: "repetido", disparo: antes };
    var p = piezaEn(mar, sq);
    var d;
    if (p) {
      p.hundida = true;
      d = { casilla: sq, resultado: "hundido", tipo: p.tipo };
    } else {
      d = { casilla: sq, resultado: "agua", cuenta: cuenta(mar, sq) };
    }
    mar.disparos.push(d);
    return { ok: true, disparo: d, flotaHundida: aFlote(mar).length === 0 };
  }

  /* Lo que se SABE de un mar desde afuera: solo los disparos, nunca la flota
     escondida. Es la pista, es lo que usa la computadora para dispararte, y es
     lo que el verificador usa para comprobar que el juego se puede resolver
     pensando: si la pieza escondida quedara fuera de sus casillas posibles, el
     disparo habría mentido.
     Dos reglas, las dos seguras:
       - si a una casilla con agua ya no le falta nadie (su número menos las
         piezas hundidas que apuntan ahí da 0), ninguna pieza a flote puede
         estar en un lugar desde donde apunte ahí;
       - si le faltan TODAS las que quedan a flote, cada una tiene que estar en
         un lugar desde donde apunte ahí. */
  function conocimiento(mar) {
    var restantes = aFlote(mar).map(function (p) { return p.tipo; });
    var hundidas = mar.flota.filter(function (p) { return p.hundida; });
    var tiros = {};
    mar.disparos.forEach(function (d) { tiros[d.casilla] = true; });
    var reglas = mar.disparos.filter(function (d) { return d.resultado === "agua"; }).map(function (d) {
      var ya = 0;
      hundidas.forEach(function (p) { if (ataca(p.tipo, p.casilla, d.casilla)) ya++; });
      return { casilla: d.casilla, falta: d.cuenta - ya };
    });
    var tipos = {};
    restantes.forEach(function (t) { tipos[t] = true; });
    var posibles = {};
    Object.keys(tipos).forEach(function (t) {
      posibles[t] = TODAS.filter(function (s) {
        if (tiros[s]) return false;
        for (var i = 0; i < reglas.length; i++) {
          var r = reglas[i], llega = ataca(t, s, r.casilla);
          if (r.falta <= 0 && llega) return false;
          if (r.falta >= restantes.length && !llega) return false;
        }
        return true;
      });
    });
    var algunaPieza = {};
    Object.keys(posibles).forEach(function (t) { posibles[t].forEach(function (s) { algunaPieza[s] = true; }); });
    var seguras = TODAS.filter(function (s) { return !tiros[s] && !algunaPieza[s]; });
    return { restantes: restantes, posibles: posibles, seguras: seguras };
  }

  /* El disparo de quien solo deduce: la casilla con más chance de tener una
     pieza según `conocimiento()` (cada pieza a flote reparte su chance entre
     sus casillas posibles). Nunca mira la flota. Con `holgura` elige al azar
     entre las casillas casi tan buenas como la mejor: es lo que hace a la
     computadora del duelo ganable sin que juegue tonto. */
  function mejorDisparo(mar, azar, holgura) {
    azar = azar || Math.random;
    var k = conocimiento(mar);
    var peso = {};
    k.restantes.forEach(function (t) {
      var ps = k.posibles[t];
      ps.forEach(function (s) { peso[s] = (peso[s] || 0) + 1 / ps.length; });
    });
    var casillas = Object.keys(peso);
    if (!casillas.length) {
      // No debería pasar (sería que los disparos mintieron); se dispara a
      // cualquier casilla libre para no trabarse.
      casillas = TODAS.filter(function (s) { return !disparoEn(mar, s); });
      return casillas[Math.floor(azar() * casillas.length)] || null;
    }
    var max = 0;
    casillas.forEach(function (s) { if (peso[s] > max) max = peso[s]; });
    var corte = max * (1 - (holgura || 0)) - 1e-9;
    var buenas = casillas.filter(function (s) { return peso[s] >= corte; });
    return buenas[Math.floor(azar() * buenas.length)];
  }

  function nuevaPartida(idNivel, semilla) {
    var n = nivel(idNivel) || NIVELES[0];
    var azar = azarCon(semilla);
    return {
      nivel: n.id,
      duelo: !!n.duelo,
      mar: nuevoMar(n.flota, azar),                 // la flota de la computadora: tú disparas acá
      miMar: n.duelo ? nuevoMar(n.flota, azar) : null, // la tuya, solo en el duelo
      ayudas: 0,
      terminada: false,
      ganador: null,          // "yo" | "compu", solo en el duelo
    };
  }

  /* Volver a acomodar tu flota al azar. Solo antes del primer disparo: después
     sería mover los barcos en mitad de la batalla. */
  function acomodar(partida, semilla) {
    if (!partida.duelo || partida.mar.disparos.length || partida.miMar.disparos.length) return false;
    partida.miMar = nuevoMar(nivel(partida.nivel).flota, azarCon(semilla));
    return true;
  }

  function disparar(partida, sq) {
    if (partida.terminada) return { ok: false, motivo: "terminada" };
    var r = dispararEn(partida.mar, sq);
    if (r.ok && r.flotaHundida) { partida.terminada = true; partida.ganador = "yo"; }
    return r;
  }

  /* El turno de la computadora en el duelo: dispara donde más chance ve, con
     un poco de holgura para no ser implacable. */
  var HOLGURA_COMPU = 0.6;
  function turnoComputadora(partida, azar) {
    if (!partida.duelo || partida.terminada) return null;
    var sq = mejorDisparo(partida.miMar, azar, HOLGURA_COMPU);
    var r = dispararEn(partida.miMar, sq);
    if (r.ok && r.flotaHundida) { partida.terminada = true; partida.ganador = "compu"; }
    return r;
  }

  /* Estrellas, en los niveles de práctica: pocas balas y sin pista. La pista
     no quita la partida, pero una ronda con ayuda no puede valer lo mismo que
     una sin ella, o nadie pensaría. */
  function estrellas(partida) {
    if (!partida.terminada || partida.duelo) return 0;
    var n = nivel(partida.nivel), tiros = partida.mar.disparos.length;
    if (tiros <= n.estrellas3 && !partida.ayudas) return 3;
    if (tiros <= n.estrellas2) return 2;
    return 1;
  }

  /* ---------------------------------------------------------- escribir
     Los comandos van en palabras enteras y NUNCA en una letra suelta que pueda
     ser una columna: «a», «b», «c»… son el principio de una casilla. */
  var COMANDOS = {
    flota: ["flota", "quedan", "que queda", "qué queda", "piezas", "barcos"],
    mia: ["mi flota", "mis barcos", "mis piezas", "mia", "mía"],
    historial: ["historial", "memoria", "disparos", "tiros"],
    pista: ["pista"],
    acomodar: ["acomodar", "otra flota", "mover flota", "reacomodar"],
    ayuda: ["ayuda", "comandos", "instrucciones", "?"],
    nuevo: ["nuevo", "nueva", "otra", "reiniciar", "de nuevo", "otra partida"],
  };
  function leerComando(texto) {
    var t = String(texto || "").toLowerCase().trim().replace(/[.!¡¿]/g, "").replace(/\s+/g, " ").trim();
    if (!t) return null;
    var niv = t.match(/^nivel\s*([1-9])$/);
    if (niv) return { cmd: "nivel", nivel: Number(niv[1]) };
    for (var k in COMANDOS) if (COMANDOS[k].indexOf(t) !== -1) return { cmd: k };
    var sq = Sonar.leerCasilla(t.replace(/^(disparo|disparar|dispara|fuego)\s+(a|en)?\s*/, ""));
    if (sq) return { cmd: "disparar", casilla: sq };
    return null;
  }

  var api = {
    COLUMNAS: COLUMNAS, TODAS: TODAS, PIEZAS: PIEZAS, NIVELES: NIVELES,
    nivel: nivel, ataca: ataca, cuenta: cuenta, nuevaPartida: nuevaPartida, acomodar: acomodar,
    disparar: disparar, turnoComputadora: turnoComputadora, conocimiento: conocimiento,
    mejorDisparo: mejorDisparo, dispararEn: dispararEn, disparoEn: disparoEn, piezaEn: piezaEn,
    aFlote: aFlote, estrellas: estrellas, leerComando: leerComando, esCasilla: esCasilla,
    azarCon: azarCon,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.BatallaNavalMotor = api;
})(typeof window !== "undefined" ? window : this);
