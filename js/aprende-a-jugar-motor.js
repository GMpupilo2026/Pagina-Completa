/* Ajedrez Integral — Aprende a jugar: las reglas de un nivel, sin pantalla.

   Las lecciones de entreno/aprende-a-jugar.html son las mismas de
   lichess.org/learn (mismas etapas, mismas posiciones, mismas estrellas y la
   misma cuenta de puntos), escritas de nuevo para el sitio. Lo que decide si
   una jugada vale, si el nivel se pierde o se gana y cuántos puntos da vive
   acá, separado de lo que se pinta, por dos razones:

   - el verificador (herramientas/verificar-aprende-a-jugar.js) juega cada
     nivel con ESTE mismo código y comprueba que se puede ganar con las
     jugadas que pide para tres estrellas; si las reglas vivieran en la
     página, el verificador comprobaría una copia;
   - la página solo pregunta y pinta.

   Cómo funciona un nivel (igual que en Lichess):

   - Las estrellas son, por dentro, peones del rival en esas casillas: así una
     pieza no las atraviesa (la torre se detiene en la primera) y un peón solo
     las alcanza comiendo en diagonal. En las del rey no (`estrellasVacias`):
     un peón rival al lado le daría jaque.
   - El rival NO juega: después de cada jugada vuelve a ser el turno del
     alumno. Solo mueve cuando el nivel trae un guion (`guion`), o para
     mostrar qué pasa después de un error.
   - Sin estrellas en el tablero, dejar una pieza que el rival puede comer sin
     que se la puedan devolver es perder el nivel (`detectarCaptura:
     "sinProteger"`), y la página muestra la captura.
   - Sin rey propio, las piezas mueven como si no hubiera jaques; con rey,
     solo jugadas legales (salvo `ofrecerIlegales`, donde el error es
     justamente meter el rey en jaque).
   - Puntos: 50 por estrella, 50 por pieza comida (o su valor, en «Valor de
     las piezas»), 50 por jugada del guion, y al terminar 500, 300 o 100
     según cuántas jugadas de más se usaron. Tres estrellas con el máximo,
     dos si faltan hasta 200, una si no.

   Es un script clásico: deja `AprendeMotor` global. En node se exporta. */
(function (raiz) {
  "use strict";

  const MiniChessRef = (typeof MiniChess !== "undefined") ? MiniChess
    : (typeof require === "function" ? require("./mini-chess.js") : null);

  const PUNTOS = { estrella: 50, captura: 50, guion: 50 };
  const BONO = { 1: 500, 2: 300, 3: 100 };
  const VALOR = { q: 90, r: 50, b: 30, n: 30, p: 10 };

  /* Todas las jugadas legales del bando que mueve, sin escribirlas en
     notación (MiniChess.moves() las escribe, y eso multiplica el trabajo). */
  const todas = (g) => Object.keys(g.board).reduce((a, sq) => (g.board[sq].color === g.side ? a.concat(g.legalMoves(sq)) : a), []);
  const leerCasillas = (c) => (Array.isArray(c) ? c.slice() : String(c || "").split(" ").filter(Boolean));
  const otro = (c) => (c === "w" ? "b" : "w");

  function bonoDelNivel(nivel, jugadas) {
    const tarde = jugadas - nivel.jugadas;
    return tarde <= 0 ? BONO[1] : tarde <= Math.max(1, nivel.jugadas / 8) ? BONO[2] : BONO[3];
  }
  function maximoDelNivel(nivel) {
    return leerCasillas(nivel.estrellas).length * PUNTOS.estrella
      + (nivel.puntosPorCaptura ? (nivel.capturas || 0) * PUNTOS.captura : 0) + BONO[1];
  }
  /* 3, 2 o 1 estrellas (0 si nunca se completó). */
  function estrellasDelNivel(nivel, puntos) {
    if (!puntos) return 0;
    const max = maximoDelNivel(nivel);
    return puntos >= max ? 3 : puntos >= max - 200 ? 2 : 1;
  }
  function estrellasDeLaEtapa(etapa, puntosPorNivel) {
    const total = puntosPorNivel.reduce((a, b) => a + (b || 0), 0);
    const max = etapa.niveles.reduce((a, n) => a + maximoDelNivel(n), 0);
    if (!puntosPorNivel.every(Boolean)) return 0;
    return total >= max ? 3 : total >= max - Math.max(200, etapa.niveles.length * 150) ? 2 : 1;
  }

  /* ---------- Condiciones de éxito y de fallo ----------
     Cada una recibe `d` = { juego, nivel } y contesta sí o no. */
  const pieza = (fenPieza) => ({ type: fenPieza.toLowerCase(), color: fenPieza === fenPieza.toLowerCase() ? "b" : "w" });
  const es = (p, q) => !!p && p.type === q.type && p.color === q.color;
  const C = {
    piezaEn: (fp, sq) => (d) => es(d.juego.get(sq), pieza(fp)),
    piezaNoEn: (fp, sq) => (d) => !es(d.juego.get(sq), pieza(fp)),
    // Hay alguna pieza (o estrella) fuera de esas casillas.
    algoFueraDe: (casillas) => { const l = leerCasillas(casillas); return (d) => Object.keys(d.juego.board).some((sq) => !l.includes(sq)); },
    peonBlancoEnAlguna: (casillas) => { const l = leerCasillas(casillas); return (d) => l.some((sq) => es(d.juego.get(sq), pieza("P"))); },
    sinPiezas: (color) => (d) => !Object.values(d.juego.board).some((p) => p.color === color),
    jaque: (d) => d.juego.in_check(),
    mate: (d) => d.juego.in_check() && !todas(d.juego).length,
    ultimaJugada: (san) => (d) => { const h = d.juego.history; const u = h.length ? h[h.length - 1].san : ""; return u.replace(/[+#]$/, "") === san; },
    jaqueEn: (n) => (d) => d.nivel.jugadas <= n && d.juego.in_check(),
    sinJaqueEn: (n) => (d) => d.nivel.jugadas >= n && !d.juego.in_check(),
    no: (f) => (d) => !f(d),
    y: (...fs) => (d) => fs.every((f) => f(d)),
    o: (...fs) => (d) => fs.some((f) => f(d)),
    guionCompleto: (d) => d.nivel.guionCompleto(),
    guionFallado: (d) => d.nivel.guionFallado(),
  };

  /* Completa un nivel con lo que Lichess pone por defecto. */
  function prepararNivel(n, i) {
    const fen = n.fen.split(" ").length === 4 ? n.fen + " 0 1" : n.fen;
    const estrellas = leerCasillas(n.estrellas);
    return Object.assign({
      id: i + 1,
      color: fen.split(" ")[1],
      detectarCaptura: estrellas.length ? false : "sinProteger",
      guion: [],
      flechas: [],
    }, n, { fen, estrellas });
  }

  const desarmarUci = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4, 5) || undefined });

  class Nivel {
    constructor(plano) {
      this.plano = plano;
      this.juego = new MiniChessRef(plano.fen);
      this.estrellas = new Set(plano.estrellas);
      if (!plano.estrellasVacias) {
        const rival = otro(this.juego.turn());
        this.estrellas.forEach((sq) => { this.juego.board[sq] = { type: "p", color: rival }; });
      }
      this.pasos = (plano.guion || []).map((p) => (typeof p === "string" ? { jugada: p, flechas: [] } : p));
      this.paso = 0;
      this.guionRoto = false;
      this.puntos = 0;
      this.jugadas = 0;
      this.fallado = false;
      this.completo = false;
    }

    clonar() {
      const c = Object.create(Nivel.prototype);
      Object.assign(c, this);
      c.juego = new MiniChessRef(this.juego.fen());
      c.juego.history = this.juego.history.slice();
      c.estrellas = new Set(this.estrellas);
      return c;
    }

    guionCompleto() { return this.paso === this.pasos.length; }
    guionFallado() { return this.guionRoto; }
    esEstrella(sq) { return this.estrellas.has(sq); }
    /* Lo que hay en la casilla tal como se ve: una estrella no es un peón. */
    piezaVisible(sq) { return this.esEstrella(sq) && !this.plano.estrellasVacias ? null : this.juego.get(sq); }

    /* Adónde puede ir la pieza de `desde` (con las jugadas que meten al rey
       en jaque si el nivel las ofrece). */
    destinos(desde) {
      const p = this.juego.get(desde);
      if (this.fallado || this.completo || !p || p.color !== this.plano.color || this.juego.turn() !== this.plano.color) return [];
      const lista = this.plano.ofrecerIlegales || !this.juego.kingSquare(this.juego.turn())
        ? this.juego.pseudoMoves(desde) : this.juego.legalMoves(desde);
      const vistos = new Set();
      return lista.filter((m) => (vistos.has(m.to) ? false : (vistos.add(m.to), true)));
    }

    /* El rival empieza (Captura al paso: las negras acaban de mover). */
    empiezaElRival() { return this.juego.turn() !== this.plano.color && this.pasos.length > 0; }

    /* La jugada del rival que trae el guion; null si no le toca. */
    rivalJuega() {
      const paso = this.pasos[this.paso];
      if (!paso || this.juego.turn() === this.plano.color) return null;
      const m = desarmarUci(paso.jugada);
      const hecha = this.juego.move(m);
      if (!hecha) { this.guionRoto = true; return null; }
      this.paso++;
      return { jugada: hecha, flechas: paso.flechas || [] };
    }

    /* Jaques que recibe el bando que mueve: de dónde viene cada uno. */
    atacantesDelRey(color) {
      const rey = this.juego.kingSquare(color);
      if (!rey || !this.juego.attacked(rey, otro(color))) return [];
      const salida = [];
      Object.keys(this.juego.board).forEach((sq) => {
        const p = this.juego.board[sq];
        if (p.color === color) return;
        const g = new MiniChessRef(this.juego.fen());
        g.side = p.color;
        if (g.pseudoMoves(sq).some((m) => m.to === rey)) salida.push({ from: sq, to: rey });
      });
      return salida;
    }

    capturasDelRival() {
      return todas(this.juego).filter((m) => m.flags.includes("c") || m.flags === "e");
    }

    /* La captura con la que el rival castiga la jugada, o null. */
    capturaQueCastiga() {
      const modo = this.plano.detectarCaptura;
      if (!modo) return null;
      const capturas = this.capturasDelRival();
      if (modo !== "sinProteger") return capturas[0] || null;
      return capturas.find((c) => {
        const g = new MiniChessRef(this.juego.fen());
        g.apply(c);
        return !todas(g).some((m) => m.to === c.to);
      }) || null;
    }

    /* Juega la jugada del alumno. Devuelve qué pasó:
       { estado: "sigue" | "fallo" | "completo", jugada, motivo, castigo,
         atacantes, comio, guion: { jugada, flechas } | null } */
    jugar(arg) {
      const color = this.plano.color;
      if (this.fallado || this.completo || this.juego.turn() !== color) return { estado: "nada" };
      const cand = (this.plano.ofrecerIlegales || !this.juego.kingSquare(color)
        ? this.juego.pseudoMoves(arg.from).flatMap((m) => (m.flags.includes("p") ? ["q", "r", "b", "n"].map((pr) => Object.assign({}, m, { promotion: pr })) : [m]))
        : this.juego.legalMoves(arg.from))
        .filter((m) => m.to === arg.to && (!m.promotion || m.promotion === (arg.promotion || "q")));
      if (!cand.length) return { estado: "nada" };
      const m = cand[0];
      this.jugadas++;
      const comida = m.flags === "e" ? "p" : (this.juego.get(m.to) || {}).type;
      m.san = this.juego.san(m);
      this.juego.apply(m);
      this.juego.history.push(m);
      const d = { juego: this.juego, nivel: this };

      // El propio rey quedó en jaque: solo pasa con `ofrecerIlegales`.
      const rey = this.juego.kingSquare(color);
      if (rey && this.juego.attacked(rey, otro(color))) {
        this.fallado = true;
        return { estado: "fallo", motivo: "jaque-propio", jugada: m, atacantes: this.atacantesDelRey(color) };
      }

      let comio = null;
      if (this.estrellas.has(m.to)) {
        this.puntos += PUNTOS.estrella;
        this.estrellas.delete(m.to);
        comio = "estrella";
      } else if (comida && this.plano.puntosPorCaptura && comida !== "k") {
        this.puntos += this.plano.mostrarValores ? VALOR[comida] : PUNTOS.captura;
        comio = comida;
      }

      let enGuion = false, castigo = null, guion = null;
      const paso = this.pasos[this.paso];
      if (paso) {
        const uci = m.from + m.to + (m.promotion && m.flags.includes("p") ? m.promotion : "");
        if (paso.jugada === uci) { this.paso++; this.puntos += PUNTOS.guion; enGuion = true; guion = paso; }
        else this.guionRoto = true;
      }
      if (!enGuion) {
        castigo = this.capturaQueCastiga();
        this.fallado = !!castigo || !!(this.plano.fallo && this.plano.fallo(d));
      }
      const exito = this.plano.exito ? this.plano.exito(d) : this.estrellas.size === 0;
      if (!this.fallado && exito) {
        this.completo = true;
        this.puntos += bonoDelNivel(this.plano, this.jugadas);
      }
      if (!this.fallado && !this.completo && !enGuion) {
        // El rival no juega: vuelve a ser el turno del alumno.
        if (this.juego.side !== color) this.juego.ep = null;
        this.juego.side = color;
      }
      const res = { estado: this.fallado ? "fallo" : this.completo ? "completo" : "sigue", jugada: m, comio, guion };
      if (castigo) { res.motivo = "colgada"; res.castigo = castigo; }
      else if (this.fallado) res.motivo = this.guionRoto ? "guion" : "condicion";
      if (!this.fallado) res.jaques = this.atacantesDelRey(this.juego.turn() === color ? otro(color) : this.juego.turn());
      return res;
    }

    /* Después de un error, el rival muestra qué pasa (`seguirTrasFallo`). */
    rivalAlAzar(azar) {
      const t = todas(this.juego);
      if (!t.length) return null;
      const m = t[Math.floor((azar || Math.random)() * t.length)];
      this.juego.apply(m);
      return m;
    }
  }

  const API = { Nivel, C, prepararNivel, estrellasDelNivel, estrellasDeLaEtapa, maximoDelNivel, bonoDelNivel, PUNTOS, VALOR, leerCasillas };
  raiz.AprendeMotor = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
