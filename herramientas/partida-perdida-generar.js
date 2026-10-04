#!/usr/bin/env node
/* Genera js/partida-perdida-banco.js, el banco de «La partida perdida».

   Cada reto es una posición a la que se llegó desde la de salida en un número
   EXACTO de jugadas (medias jugadas: una de blancas o una de negras), y hay que
   reconstruir cómo. Ninguna posición se escribe a mano («ninguna posición de
   ajedrez se inventa»): acá van solo las partidas, y la posición la calcula
   chess.js jugándolas. Si una jugada no es legal, el script se corta.

   Cuenta como resuelto cualquier camino que deje las piezas exactamente así en
   ese número de jugadas, no solo el de acá: la solución guardada es una de las
   posibles y sirve para «Ver una solución».

   No se edita js/partida-perdida-banco.js a mano: se cambia la lista de abajo y
   se corre
       node herramientas/partida-perdida-generar.js
   verificar-partida-perdida.js comprueba que el banco esté al día con esta
   lista y que cada solución llegue de verdad. */
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

// Las jugadas van en la notación de chess.js (en inglés); el banco las guarda
// en español para mostrarlas.
const RETOS = [
  { titulo: "Caballos al frente", jugadas: ["Nc3", "d5"],
    pista: "Una jugada de cada uno." },
  { titulo: "La dama madrugadora", jugadas: ["e3", "e6", "Qh5"],
    pista: "Las blancas jugaron dos veces y las negras una." },
  { titulo: "Ida y vuelta", jugadas: ["Nf3", "e5", "Ng1"],
    pista: "Las blancas no pueden quedarse quietas: tienen que mover algo… y volver." },
  { titulo: "Como si nada", jugadas: ["Nc3", "Nf6", "Nb1", "Ng8"],
    pista: "Después de cuatro jugadas, todo está como al principio. Los caballos son los únicos que pueden salir y volver tan rápido." },
  { titulo: "Los reyes de paseo", jugadas: ["e4", "e5", "Ke2", "Ke7"],
    pista: "Los dos reyes salieron por la puerta que les abrió su peón." },
  { titulo: "Cambio en el centro", jugadas: ["e4", "d5", "exd5", "Qxd5"],
    pista: "Faltan dos peones: uno capturó al otro, y alguien recapturó." },
  { titulo: "El mate del loco", jugadas: ["f3", "e5", "g4", "Qh4#"],
    pista: "Es el jaque mate más rápido que existe." },
  { titulo: "Mate en el centro", jugadas: ["e4", "e5", "Qh5", "Ke7", "Qxe5#"],
    pista: "El rey negro salió a pasear y la dama blanca no lo perdonó." },
  { titulo: "El peón que se cuela", jugadas: ["d4", "e5", "dxe5", "d6", "exd6"],
    pista: "El peón blanco de d6 no llegó caminando derecho: capturó dos veces." },
  { titulo: "Torres cruzadas", jugadas: ["a4", "h5", "Ra3", "Rh6", "Rh3", "Ra6"],
    pista: "Cada torre terminó del lado contrario al que salió." },
  { titulo: "No es el que parece", jugadas: ["e4", "d5", "exd5", "e6", "dxe6", "fxe6"],
    pista: "El peón negro de e6 no es el que empezó en e7." },
  { titulo: "¿Y el caballo?", jugadas: ["Nf3", "d5", "Ne5", "Nd7", "Nxd7", "Bxd7"],
    pista: "Un caballo de cada bando desapareció, y los dos se perdieron en la misma casilla." },
  { titulo: "La dama que vuelve", jugadas: ["d3", "e6", "Qd2", "Qh4", "Qd1", "Qd8"],
    pista: "Parece que solo se movieron dos peones, pero fueron seis jugadas: las damas salieron y regresaron." },
  { titulo: "Cambio de damas", jugadas: ["g4", "e5", "g5", "Qxg5", "d4", "Qxc1+", "Qxc1"],
    pista: "La dama negra hizo un viaje largo y se cobró un alfil antes de caer." },
  { titulo: "Los dos enrocados", jugadas: ["Nf3", "Nf6", "e3", "e6", "Be2", "Be7", "O-O", "O-O"],
    pista: "Para enrocar corto hay que sacar antes el caballo y el alfil." },
  { titulo: "Coronación relámpago", jugadas: ["e4", "f5", "exf5", "g6", "fxg6", "Nf6", "gxh7", "Ng8", "hxg8=Q"],
    pista: "Un peón blanco capturó cuatro veces seguidas, la última coronando." },
  { titulo: "Peones que cambian de columna", jugadas: ["b4", "g5", "b5", "g4", "b6", "g3", "bxc7", "gxf2+", "Kxf2"],
    pista: "Los dos peones corrieron y capturaron a la vez; el rey blanco tuvo que defenderse." },
  { titulo: "Corona, pero no en dama", jugadas: ["h4", "g5", "hxg5", "Nf6", "gxf6", "Rg8", "fxe7", "Rg6", "exd8=N"],
    pista: "El peón blanco coronó en d8 capturando la dama… y eligió un caballo." },
  { titulo: "El banquete de los caballos", jugadas: ["Nf3", "Nf6", "Ng5", "Ng4", "Nxh7", "Nxh2", "Nxf8", "Nxf1", "Nxd7", "Nxd2", "Nxb8", "Nxb1"],
    pista: "Un caballo de cada bando se comió todo lo que encontró en su camino." },
];

const LETRA = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
const enEspanol = (san) => san.replace(/^[KQRBN]/, (c) => LETRA[c]).replace(/=([QRBN])/, (_, c) => "=" + LETRA[c]);

function armar() {
  return RETOS.map((r, i) => {
    const g = new Chess();
    for (const j of r.jugadas) {
      if (!g.move(j)) throw new Error(`Reto ${i + 1} («${r.titulo}»): «${j}» no es legal en ${g.fen()}`);
    }
    return {
      id: i + 1,
      titulo: r.titulo,
      jugadas: r.jugadas.length,
      posicion: g.fen().split(" ")[0],
      solucion: g.history().map(enEspanol),
      pista: r.pista,
    };
  });
}

function texto(banco) {
  return "/* «La partida perdida»: el banco de retos (partida-perdida.html).\n" +
    "   LO GENERA herramientas/partida-perdida-generar.js: no se edita a mano.\n" +
    "   Cada `posicion` la calculó chess.js jugando `solucion` desde la salida. */\n" +
    "window.PARTIDA_PERDIDA = " + JSON.stringify(banco, null, 1) + ";\n";
}

if (require.main === module) {
  const destino = path.join(__dirname, "..", "js", "partida-perdida-banco.js");
  fs.writeFileSync(destino, texto(armar()));
  console.log(`Escrito ${path.relative(process.cwd(), destino)} con ${RETOS.length} retos.`);
}
module.exports = { armar, texto, RETOS };
