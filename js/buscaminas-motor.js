/* ===== Buscaminas de ajedrez — las reglas, sin pantalla =====
 *
 * El buscaminas de toda la vida, pero las minas son piezas de ajedrez
 * escondidas. En vez de jugársela a ciegas, cada casilla que revelas y sale
 * vacía dice CUÁNTAS piezas escondidas la atacan (misma idea de Batalla naval,
 * js/batalla-naval-motor.js: la geometría real de cada pieza, no la cuenta de
 * vecinos del buscaminas de computadora). Pisar una pieza termina la partida.
 *
 * Dos reglas que lo hacen jugable pensando, no a ciegas:
 *   - Un 0 destapa en cadena a sus 8 vecinas (como el buscaminas de siempre),
 *     parándose siempre al llegar a una pieza: esa nunca se revela sola, hay
 *     que pisarla a propósito (o, si se sospecha, dejarla con bandera).
 *   - Un 0 además deja SEGURA (sin pieza, aunque no se revele) cualquier
 *     casilla desde la que una pieza del tipo que queda escondido atacaría a
 *     esa casilla: si alguna estuviera ahí, el 0 habría mentido.
 *
 * Este archivo no toca el DOM: lo usan buscaminas.html y el verificador
 * (herramientas/verificar-buscaminas.js), que lo corre en Node.
 */
(function (raiz) {
  "use strict";

  var BN = (typeof module !== "undefined" && module.exports) ? require("./batalla-naval-motor.js") : raiz.BatallaNavalMotor;
  var Sonar = (typeof module !== "undefined" && module.exports) ? require("./sonar-motor.js") : raiz.SonarMotor;

  var COLUMNAS = BN.COLUMNAS, TODAS = BN.TODAS, PIEZAS = BN.PIEZAS, ataca = BN.ataca, azarCon = BN.azarCon, esCasilla = BN.esCasilla;

  function col(sq) { return COLUMNAS.indexOf(sq[0]); }
  function fila(sq) { return Number(sq[1]); }

  /* Las 8 vecinas de una casilla (como las cuenta el buscaminas de siempre),
     para el revelado en cadena de los ceros. */
  function vecinas(sq) {
    var c = col(sq), f = fila(sq), out = [];
    for (var dc = -1; dc <= 1; dc++) {
      for (var df = -1; df <= 1; df++) {
        if (!dc && !df) continue;
        var nc = c + dc, nf = f + df;
        if (nc < 0 || nc > 7 || nf < 1 || nf > 8) continue;
        out.push(COLUMNAS[nc] + nf);
      }
    }
    return out;
  }

  /* Los niveles. Las mismas cuatro piezas que Batalla naval (sin rey ni
     peones: uno no es un enemigo que se pise, y el otro ataca distinto según
     el color, que acá no hay). `segundos3`/`segundos2` son con los que se
     saca tres o dos estrellas al ganar; salen de jugar de verdad, no a ojo
     (el verificador los revisa). */
  var NIVELES = [
    { id: 1, trampas: ["n", "n", "n"], segundos3: 90, segundos2: 150,
      titulo: "Tres caballos",
      resumen: "Tres caballos escondidos en el tablero. Revela una casilla: si no hay nadie, dice cuántos caballos la atacan con su salto en L." },
    { id: 2, trampas: ["r", "r", "b", "b"], segundos3: 150, segundos2: 240,
      titulo: "Torres y alfiles",
      resumen: "Dos torres y dos alfiles. La torre ataca por su fila y su columna; el alfil, por sus diagonales." },
    { id: 3, trampas: ["q", "r", "r", "b", "b", "n", "n"], segundos3: 240, segundos2: 360,
      titulo: "Campo completo",
      resumen: "Dama, dos torres, dos alfiles y dos caballos: siete piezas escondidas entre las 64 casillas." },
  ];
  function nivel(id) {
    for (var i = 0; i < NIVELES.length; i++) if (NIVELES[i].id === Number(id)) return NIVELES[i];
    return null;
  }
  function tiposDe(n) {
    var vistos = {}, out = [];
    n.trampas.forEach(function (t) { if (!vistos[t]) { vistos[t] = true; out.push(t); } });
    return out;
  }

  function azar2(semilla) { return azarCon(semilla); }
  function barajar(lista, azar) {
    var a = lista.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(azar() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function trampaEn(campo, sq) {
    for (var i = 0; i < campo.trampas.length; i++) if (campo.trampas[i].casilla === sq) return campo.trampas[i];
    return null;
  }

  /* Cuántas trampas atacan la casilla, contando cada una como si estuviera
     sola en el tablero (igual que Batalla naval). */
  function cuenta(campo, sq) {
    var n = 0;
    campo.trampas.forEach(function (p) { if (ataca(p.tipo, p.casilla, sq)) n++; });
    return n;
  }

  function nuevaPartida(idNivel, semilla) {
    var n = nivel(idNivel) || NIVELES[0];
    var azar = azar2(semilla);
    var casillas = barajar(TODAS, azar).slice(0, n.trampas.length);
    return {
      nivel: n.id,
      trampas: n.trampas.map(function (t, i) { return { tipo: t, casilla: casillas[i] }; }),
      reveladas: {},     // casilla -> cuenta
      banderas: {},      // casilla -> true
      terminada: false,
      gano: null,
      explotadaEn: null,
    };
  }

  /* Revela una casilla; si es cero, destapa en cadena a sus vecinas vacías
     (parándose en trampas, en banderas y en lo ya revelado). Devuelve la
     cadena completa, en el orden en que se destapó, para poder contarla en
     voz. Nunca revela una casilla con bandera: hay que quitarla primero. */
  function revelar(campo, sq) {
    if (campo.terminada) return { ok: false, motivo: "terminada" };
    if (!esCasilla(sq)) return { ok: false, motivo: "casilla" };
    if (campo.reveladas.hasOwnProperty(sq)) return { ok: false, motivo: "repetido" };
    if (campo.banderas[sq]) return { ok: false, motivo: "bandera" };

    var trampa = trampaEn(campo, sq);
    if (trampa) {
      campo.terminada = true;
      campo.gano = false;
      campo.explotadaEn = sq;
      return { ok: true, resultado: "trampa", tipo: trampa.tipo, cadena: [sq] };
    }

    var cadena = [];
    var pendientes = [sq];
    var vistas = {};
    while (pendientes.length) {
      var s = pendientes.shift();
      if (vistas[s] || campo.reveladas.hasOwnProperty(s) || campo.banderas[s] || trampaEn(campo, s)) continue;
      vistas[s] = true;
      var n = cuenta(campo, s);
      campo.reveladas[s] = n;
      cadena.push(s);
      if (n === 0) vecinas(s).forEach(function (v) { pendientes.push(v); });
    }

    var total = TODAS.length - campo.trampas.length;
    if (Object.keys(campo.reveladas).length >= total) { campo.terminada = true; campo.gano = true; }
    return { ok: true, resultado: "revelada", cuenta: campo.reveladas[sq], cadena: cadena, gano: campo.gano === true };
  }

  /* Poner o quitar la bandera de una casilla sin revelar. No hace falta para
     ganar (alcanza con revelar las seguras); es solo memoria. */
  function marcar(campo, sq) {
    if (campo.terminada) return { ok: false, motivo: "terminada" };
    if (!esCasilla(sq)) return { ok: false, motivo: "casilla" };
    if (campo.reveladas.hasOwnProperty(sq)) return { ok: false, motivo: "revelada" };
    campo.banderas[sq] = !campo.banderas[sq];
    return { ok: true, puesta: !!campo.banderas[sq] };
  }

  function banderas(campo) { return Object.keys(campo.banderas).filter(function (s) { return campo.banderas[s]; }); }

  /* Las casillas que SEGURO no tienen pieza, por la regla del 0: si un
     revelado dice 0, ninguna pieza ataca esa casilla. Eso descarta, PARA CADA
     TIPO por separado, las casillas desde las que ese tipo atacaría algún 0 —
     una torre nunca en la fila o columna de un 0, un alfil nunca en su
     diagonal, un caballo nunca en su salto, la dama nunca en ninguna de las
     dos. Una casilla queda SEGURA solo cuando TODOS los tipos que siguen
     escondidos quedan descartados ahí: con dos tipos distintos (torres y
     alfiles, por ejemplo) no basta con que un 0 descarte a la torre, porque
     ahí mismo podría esconderse el alfil. Mezclar los tipos en vez de
     exigirlos todos marcaría como segura una casilla que en realidad puede
     tener pieza. */
  function seguras(campo) {
    var tipos = tiposDe(nivel(campo.nivel));
    var ceros = Object.keys(campo.reveladas).filter(function (s) { return campo.reveladas[s] === 0; });
    if (!ceros.length) return [];
    return TODAS.filter(function (s2) {
      if (campo.reveladas.hasOwnProperty(s2)) return false;
      return tipos.every(function (t) {
        return ceros.some(function (sq) { return ataca(t, s2, sq); });
      });
    });
  }

  /* El jugador que solo deduce: revela siempre una casilla segura si hay
     alguna; si no, elige al azar entre las que no tienen bandera. Lo usa el
     verificador para comprobar que el campo se puede ganar sin adivinar. */
  function mejorJugada(campo, azar) {
    azar = azar || Math.random;
    var seg = seguras(campo).filter(function (s) { return !campo.reveladas.hasOwnProperty(s); });
    if (seg.length) return seg[Math.floor(azar() * seg.length)];
    var libres = TODAS.filter(function (s) { return !campo.reveladas.hasOwnProperty(s) && !campo.banderas[s]; });
    return libres[Math.floor(azar() * libres.length)];
  }

  /* ---------------------------------------------------------- escribir */
  var COMANDOS = {
    trampas: ["trampas", "piezas", "cuantas quedan", "cuántas quedan"],
    historial: ["historial", "memoria", "revisadas"],
    pista: ["pista"],
    banderas: ["banderas", "marcadas"],
    ayuda: ["ayuda", "comandos", "instrucciones", "?"],
    nuevo: ["nuevo", "nueva", "otra", "reiniciar", "de nuevo", "otra partida"],
  };
  function leerComando(texto) {
    var t = String(texto || "").toLowerCase().trim().replace(/[.!¡¿]/g, "").replace(/\s+/g, " ").trim();
    if (!t) return null;
    var niv = t.match(/^nivel\s*([1-9])$/);
    if (niv) return { cmd: "nivel", nivel: Number(niv[1]) };
    for (var k in COMANDOS) if (COMANDOS[k].indexOf(t) !== -1) return { cmd: k };
    var marca = t.match(/^(marcar|bandera|desmarcar)\s+(.+)$/);
    if (marca) {
      var sqm = Sonar.leerCasilla(marca[2]);
      if (sqm) return { cmd: "marcar", casilla: sqm };
    }
    var sq = Sonar.leerCasilla(t.replace(/^(revelar|revela|destapar|destapa|abrir|abre)\s+(a|en)?\s*/, ""));
    if (sq) return { cmd: "revelar", casilla: sq };
    return null;
  }

  var api = {
    COLUMNAS: COLUMNAS, TODAS: TODAS, PIEZAS: PIEZAS, NIVELES: NIVELES,
    nivel: nivel, tiposDe: tiposDe, ataca: ataca, cuenta: cuenta, vecinas: vecinas,
    nuevaPartida: nuevaPartida, revelar: revelar, marcar: marcar, banderas: banderas,
    trampaEn: trampaEn, seguras: seguras, mejorJugada: mejorJugada,
    leerComando: leerComando, esCasilla: esCasilla, azarCon: azarCon,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.BuscaminasMotor = api;
})(typeof window !== "undefined" ? window : this);
