/* Las pre-jugadas de las salas de partida en línea: en el turno del rival se
   deja preparada la jugada propia, y se juega sola apenas llega la del rival
   (si para entonces es legal; si no, se descarta y se dice). Ver «La jugada
   viaja por Broadcast, y las pre-jugadas» en docs/decisiones/juegos-y-torneos.md.

   Una sola copia para todos los tableros (NieblaBoard —Estándar y Niebla—,
   CrazyhouseBoard, CartasBoard y VarianteBoard). Cada tablero lo engancha en
   cinco lugares:
     · al crearse:      this.pre = Premovidas.crear(this, { … })
     · al tocar una casilla fuera de su turno:  if (this.pre) this.pre.clic(casilla)
     · al arrastrar (si arrastra):              this.pre.arrastrable(casilla)
     · al dibujar cada casilla:                 this.pre.pintar(boton, casilla)
     · y jugarPremovida(), que la página llama al aplicar cada posición nueva.

   Como en lichess, los destinos son los de la pieza en un tablero vacío: la
   jugada se decide sobre una posición que todavía no existe (recapturar en
   una casilla donde hoy hay una pieza propia, por ejemplo). Una sola a la
   vez; tocar el tablero la quita. Las piezas fundidas de Abrazos suman los
   destinos de cada una. */
(function () {
  "use strict";

  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const RECTAS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const DIAGONALES = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const SALTOS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

  /* Adónde podría ir una pieza de esos tipos ("p", "n"… o varios, si están
     fundidos) desde `casilla`, en un tablero vacío. */
  function destinos(tipos, color, casilla) {
    const f = FILES.indexOf(casilla[0]), r = parseInt(casilla[1], 10);
    const out = [];
    const add = (df, dr) => {
      const nf = f + df, nr = r + dr;
      const sq = nf >= 0 && nf < 8 && nr >= 1 && nr <= 8 ? FILES[nf] + nr : null;
      if (sq && out.indexOf(sq) === -1) out.push(sq);
    };
    const rayos = (dirs) => dirs.forEach(([df, dr]) => { for (let k = 1; k < 8; k++) add(df * k, dr * k); });
    [].concat(tipos).forEach((t) => {
      if (t === "p") {
        const dir = color === "w" ? 1 : -1;
        add(0, dir);
        if (r === (color === "w" ? 2 : 7)) add(0, 2 * dir);
        add(-1, dir); add(1, dir);
      } else if (t === "n") SALTOS.forEach(([a, b]) => add(a, b));
      else if (t === "k") {
        RECTAS.concat(DIAGONALES).forEach(([a, b]) => add(a, b));
        if (casilla === (color === "w" ? "e1" : "e8")) { add(2, 0); add(-2, 0); } // enroques
      } else if (t === "r") rayos(RECTAS);
      else if (t === "b") rayos(DIAGONALES);
      else if (t === "q") rayos(RECTAS.concat(DIAGONALES));
    });
    return out;
  }

  function lineaPremovida(pm) {
    return pm ? pm.from + " a " + pm.to : "";
  }

  /* Lo que dice el estado de la página mientras se espera al rival. */
  function texto(pm, aviso) {
    if (pm) return " Pre-jugada lista: " + lineaPremovida(pm) + " (se juega sola; toca el tablero para quitarla).";
    return aviso ? " " + aviso : "";
  }

  /* opciones:
       pieza(casilla)    → { tipos: ["n"], color: "w" } o null
       turnoPropio()     → si ya es el turno propio (entonces no se premueve)
       jugar(pm)         → hace la jugada { from, to, promotion } como si se
                           hubiera tocado; devuelve { ok: true, san } o null si
                           no es legal
       alCambiar(pm)     → (opcional) la pre-jugada cambió (o se quitó) */
  function crear(tablero, opciones) {
    const ctl = {
      pm: null,    // { from, to, promotion }
      sel: null,   // la pieza elegida para preparar una pre-jugada
      aviso: "",   // la última que no se pudo hacer
    };

    function avisar() { if (opciones.alCambiar) opciones.alCambiar(ctl.pm); }

    ctl.puede = () => !!tablero.interactive && !opciones.turnoPropio();

    function poner(pm) {
      ctl.pm = pm;
      ctl.sel = null;
      if (pm) ctl.aviso = "";
      tablero.render();
      avisar();
    }

    function mia(casilla) {
      const p = opciones.pieza(casilla);
      return p && p.color === tablero.myColor ? p : null;
    }

    /* Un toque fuera del turno propio. Devuelve si lo atendió. */
    ctl.clic = (casilla) => {
      if (!ctl.puede()) return false;
      // Con una pre-jugada puesta, tocar el tablero la quita (y si se tocó una
      // pieza propia, queda elegida para preparar otra).
      if (ctl.pm) poner(null);
      if (ctl.sel === casilla) { ctl.sel = null; tablero.render(); return true; }
      if (ctl.sel) {
        const p = mia(ctl.sel);
        if (p && destinos(p.tipos, p.color, ctl.sel).indexOf(casilla) !== -1) {
          const from = ctl.sel;
          const corona = p.tipos.length === 1 && p.tipos[0] === "p" && (casilla[1] === "8" || casilla[1] === "1");
          if (corona && tablero.onPromotionNeeded) {
            tablero.onPromotionNeeded(from, casilla, (elegida) => {
              if (elegida) poner({ from: from, to: casilla, promotion: elegida });
              else { ctl.sel = null; tablero.render(); }
            });
            return true;
          }
          poner({ from: from, to: casilla, promotion: corona ? "q" : undefined });
          return true;
        }
      }
      ctl.sel = mia(casilla) ? casilla : null;
      tablero.render();
      return true;
    };

    ctl.arrastrable = (casilla) => ctl.puede() && !!mia(casilla);
    ctl.elegida = (casilla) => ctl.sel === casilla;

    /* Cada casilla al dibujarse: la pieza elegida, sus destinos y la pre-jugada
       puesta. La marca es un borde punteado blanco con una línea casi negra por
       dentro: cada tema de tablero tiene sus colores, y contra cualquiera uno
       de los dos pasa de 3:1 (medido en los 14 temas, el peor da 4,7:1). Y se
       dice: en el nombre de la casilla (`data-estado`, que suma
       js/tablero-accesible.js; si el tablero se nombra solo, se agrega ahí) y
       en el estado de la página. */
    ctl.pintar = (btn, casilla) => {
      const puede = ctl.puede();
      if (puede) { btn.classList.remove("cursor-default"); btn.classList.add("cursor-pointer"); }
      if (puede && ctl.sel === casilla) btn.classList.add("outline", "outline-4", "-outline-offset-4", "outline-accent-500");
      if (puede && ctl.sel) {
        const p = mia(ctl.sel);
        if (p && destinos(p.tipos, p.color, ctl.sel).indexOf(casilla) !== -1) {
          const dot = document.createElement("span");
          dot.setAttribute("aria-hidden", "true");
          dot.className = "absolute w-1/4 h-1/4 rounded-full bg-accent-500/70 pointer-events-none z-10";
          btn.appendChild(dot);
        }
      }
      const pm = ctl.pm;
      if (!pm || (pm.from !== casilla && pm.to !== casilla)) return;
      const mark = document.createElement("span");
      mark.setAttribute("aria-hidden", "true");
      mark.className = "absolute inset-0 border-4 border-dashed border-white ring-2 ring-inset ring-black pointer-events-none";
      mark.dataset.premovida = "";
      btn.appendChild(mark);
      const estado = pm.from === casilla ? "sale la pre-jugada" : "llega la pre-jugada";
      btn.dataset.estado = btn.dataset.estado ? btn.dataset.estado + ", " + estado : estado;
      const nombre = btn.getAttribute("aria-label");
      if (nombre) btn.setAttribute("aria-label", nombre + ", " + estado);
    };

    /* Al aplicar una posición nueva: si ya es el turno propio, sale. Devuelve
       null si no había nada que jugar, { ok: true, san } si se jugó y
       { ok: false, premove } si ya no era legal (se descarta y se dice). */
    ctl.jugar = () => {
      const pm = ctl.pm;
      if (!pm || !tablero.interactive || !opciones.turnoPropio()) return null;
      ctl.pm = null;
      ctl.sel = null;
      const hecha = opciones.jugar(pm);
      if (!hecha || !hecha.ok) {
        ctl.aviso = "La pre-jugada " + lineaPremovida(pm) + " no se pudo hacer: ya no era legal.";
        tablero.render();
        avisar();
        return { ok: false, premove: pm };
      }
      avisar();
      return hecha;
    };

    ctl.quitar = () => { if (ctl.pm || ctl.sel) { ctl.pm = null; ctl.sel = null; avisar(); } };
    ctl.texto = () => texto(ctl.pm, ctl.aviso);
    return ctl;
  }

  window.Premovidas = { crear, destinos, texto };
})();
