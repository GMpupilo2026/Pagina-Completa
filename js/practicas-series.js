/* Las series de Practicar: las usan entreno/practicas.html
   (js/entreno-practicas.js) y la clase en vivo, que las muestra en
   Entrenamientos (js/clase-entrenamientos.js). Una sola copia. La leen también
   herramientas/metas-indice.py y los verificadores (cuentan cat:'…'): el
   formato de la lista no se cambia sin cambiarlos a ellos. */
(function () {
/* ---------------- CONTENIDO DE LAS PRÁCTICAS ----------------
   Cada FEN y cada jugada solución de esta lista se generó y se verificó
   programáticamente con chess.js (node), incluyendo, según el tipo de
   práctica: que la jugada da jaque mate (mates de escuela y finales con
   torre), que la pieza que se mueve ataca de verdad a las dos piezas
   objetivo (tenedores y ataques dobles), que la pieza capturada está
   realmente clavada — quitarla del tablero expone al rey — (clavadas), o
   que el jaque tras la jugada lo da una pieza DISTINTA a la que se movió
   (ataques descubiertos). Ninguna posición se escribió "a ojo".
*/

const SETS = [
  { id:'pasillo', cat:'mates', emoji:'🚪', title:'Mate del pasillo', desc:'El rey enemigo está atrapado en la última fila por sus propios peones.',
    rounds:[
      { fen:'6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1', from:'e1', to:'e8' },
      { fen:'2k5/1ppp4/8/8/8/8/8/6RK w - - 0 1', from:'g1', to:'g8' },
      { fen:'5k2/4ppp1/8/8/8/8/8/Q6K w - - 0 1', from:'a1', to:'a8' },
      { fen:'6k1/5ppp/8/8/8/8/7K/R4R2 w - - 0 1', from:'a1', to:'a8' },
      { fen:'1k6/ppp5/8/8/8/8/6K1/7Q w - - 0 1', from:'h1', to:'h8' },
    ] },
  { id:'coz', cat:'mates', emoji:'🐴', title:'Mate de la coz', desc:'El caballo da el jaque mate final cuando el rey está completamente rodeado por sus propias piezas.',
    rounds:[
      { fen:'6rk/6pp/3N4/8/8/8/8/4K3 w - - 0 1', from:'d6', to:'f7' },
      { fen:'6nk/6pp/8/4N3/8/8/8/4K3 w - - 0 1', from:'e5', to:'f7' },
      { fen:'5rkb/5ppp/8/3N4/8/8/8/4K3 w - - 0 1', from:'d5', to:'e7' },
      { fen:'kr6/pp6/4N3/8/8/8/8/4K3 w - - 0 1', from:'e6', to:'c7' },
      { fen:'k7/8/8/8/4n3/8/6PP/6RK b - - 0 1', from:'e4', to:'f2' },
    ] },
  { id:'beso', cat:'mates', emoji:'👑', title:'Mate con dama o torre apoyada', desc:'Tu rey protege a la pieza que da el jaque mate justo al lado del rey rival.',
    rounds:[
      { fen:'7k/Q7/6K1/8/8/8/8/8 w - - 0 1', from:'a7', to:'h7' },
      { fen:'k7/7Q/1K6/8/8/8/8/8 w - - 0 1', from:'h7', to:'a7' },
      { fen:'8/8/8/8/8/6K1/Q7/7k w - - 0 1', from:'a2', to:'h2' },
      { fen:'8/8/8/8/8/1K6/7Q/k7 w - - 0 1', from:'h2', to:'a2' },
      { fen:'6k1/8/6K1/8/8/8/8/R7 w - - 0 1', from:'a1', to:'a8' },
    ] },
  { id:'horquilla', cat:'tacticas', emoji:'🍴', title:'Tenedores de caballo', desc:'Un solo salto de caballo ataca dos piezas rivales a la vez.',
    rounds:[
      { fen:'2q3k1/8/6N1/8/8/8/8/4K3 w - - 0 1', from:'g6', to:'e7' },
      { fen:'r3k3/8/4N3/8/8/8/8/7K w - - 0 1', from:'e6', to:'c7' },
      { fen:'3q3k/8/8/r3N3/8/8/8/7K w - - 0 1', from:'e5', to:'c6' },
      { fen:'7k/8/8/4N3/1r1r4/8/8/7K w - - 0 1', from:'e5', to:'c6' },
      { fen:'7k/8/8/6N1/3b1r2/8/8/7K w - - 0 1', from:'g5', to:'e6' },
    ] },
  { id:'clavada', cat:'tacticas', emoji:'📌', title:'Clavadas', desc:'La pieza rival no se puede mover sin dejar a su rey en jaque — captúrala gratis.',
    rounds:[
      { fen:'4k3/8/4n3/8/8/8/4R3/4K3 w - - 0 1', from:'e2', to:'e6' },
      { fen:'7k/8/5n2/8/8/2B5/8/4K3 w - - 0 1', from:'c3', to:'f6' },
      { fen:'8/8/8/8/1Q3r1k/8/8/K7 w - - 0 1', from:'b4', to:'f4' },
      { fen:'8/8/k1b4R/8/8/8/8/K7 w - - 0 1', from:'h6', to:'c6' },
      { fen:'k7/8/2n5/8/8/8/8/K6B w - - 0 1', from:'h1', to:'c6' },
    ] },
  { id:'descubierto', cat:'tacticas', emoji:'🎭', title:'Ataques descubiertos', desc:'Mueve una pieza para que otra, detrás de ella, descubra un jaque.',
    rounds:[
      { fen:'7k/8/8/8/8/2N5/8/B3K3 w - - 0 1', from:'c3', to:'b5' },
      { fen:'4k3/8/8/8/4N3/8/8/K3R3 w - - 0 1', from:'e4', to:'c5' },
      { fen:'k7/8/8/3R4/8/8/8/K6Q w - - 0 1', from:'d5', to:'e5' },
      { fen:'8/8/8/8/R1N4k/8/8/K7 w - - 0 1', from:'c4', to:'b6' },
      { fen:'7k/8/8/8/8/8/1P6/B3K3 w - - 0 1', from:'b2', to:'b3' },
    ] },
  { id:'doble', cat:'tacticas', emoji:'⚔️', title:'Ataques dobles', desc:'Una sola jugada de una pieza de largo alcance amenaza dos piezas rivales a la vez.',
    rounds:[
      { fen:'6k1/8/8/b6R/8/8/4n3/7K w - - 0 1', from:'h5', to:'e5' },
      { fen:'k7/8/2r3n1/8/8/8/8/K6B w - - 0 1', from:'h1', to:'e4' },
      { fen:'6k1/8/2r5/8/b6Q/8/8/K7 w - - 0 1', from:'h4', to:'e4' },
      { fen:'7k/8/b7/4K3/8/8/3R3n/8 w - - 0 1', from:'d2', to:'a2' },
      { fen:'k7/6n1/1r6/8/8/8/8/B6K w - - 0 1', from:'a1', to:'d4' },
    ] },
  { id:'torre', cat:'finales', emoji:'🏰', title:'Mate con rey y torre', desc:'El rey corta el paso y la torre da el jaque mate en el borde del tablero.',
    rounds:[
      { fen:'2k5/8/2K5/8/8/8/8/7R w - - 0 1', from:'h1', to:'h8' },
      { fen:'5k2/8/5K2/8/8/8/8/R7 w - - 0 1', from:'a1', to:'a8' },
      { fen:'R7/8/8/8/8/3K4/8/3k4 w - - 0 1', from:'a8', to:'a1' },
      { fen:'3k4/8/3K4/8/8/8/8/R7 w - - 0 1', from:'a1', to:'a8' },
      { fen:'1k6/8/1K6/8/8/8/8/7R w - - 0 1', from:'h1', to:'h8' },
    ] },
  { id:'escalera', cat:'finales', emoji:'🪜', title:'Mate de la escalera', desc:'Dos torres suben la escalera y dan mate solas, sin ayuda del rey.',
    rounds:[
      { fen:'6k1/R7/8/8/8/8/8/1K1R4 w - - 0 1', from:'d1', to:'d8' },
      { fen:'1k6/7R/8/8/8/8/8/4R1K1 w - - 0 1', from:'e1', to:'e8' },
      { fen:'6K1/8/8/k7/8/1R6/8/7R w - - 0 1', from:'h1', to:'a1' },
      { fen:'R7/8/8/8/7k/8/8/1K4R1 w - - 0 1', from:'a8', to:'h8' },
      { fen:'3K3R/8/8/8/8/8/6R1/1k6 w - - 0 1', from:'h8', to:'h1' },
    ] },
];

window.PracticasSeries = { SETS };
})();
