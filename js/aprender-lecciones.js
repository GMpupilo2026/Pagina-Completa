/* Las lecciones de Aprender (entreno/aprender.html), en su propio archivo
   para que las lea también la clase en vivo (sesion.html, pestaña
   Entrenamientos) sin copiarlas: una sola copia de cada cosa. Es un script
   clásico: `LESSONS`, `CATEGORY_ORDER` y `CATEGORY_LABEL` quedan como
   globales, igual que cuando vivían en js/entreno-aprender.js.

   Cada posición se generó/verificó con chess.js antes de escribirla aquí: las
   casillas objetivo (o la jugada solución) son exactamente las que chess.js
   calcula como legales para esa posición (lo revisa
   herramientas/verificar-practicar-aprender.js). */
const LESSONS = [
  // ---------- Movimientos: cómo mueve cada pieza ----------
  { id:'mov_rey_1', cat:'movimientos', title:'El Rey', type:'squares',
    text:'El rey se mueve una sola casilla en cualquier dirección: al frente, atrás, a los lados o en diagonal. Haz clic en todas las casillas a las que puede llegar.',
    fen:'7k/8/8/3K4/8/8/8/8 w - - 0 1', square:'d5',
    targets:["c6","d6","e6","e5","e4","d4","c4","c5"] },
  { id:'mov_rey_2', cat:'movimientos', title:'El Rey — cerca de otra pieza', type:'squares',
    text:'El rey nunca puede moverse a una casilla ocupada por una pieza propia. Marca todas las casillas a las que puede llegar.',
    fen:'6k1/8/8/3K4/2p5/8/8/8 w - - 0 1', square:'d5',
    targets:["c6","d6","e6","e5","e4","d4","c4","c5"] },
  { id:'mov_torre_1', cat:'movimientos', title:'La Torre', type:'squares',
    text:'La torre se mueve en línea recta: por toda su fila o toda su columna, tan lejos como quiera. Haz clic en todas las casillas a las que puede llegar.',
    fen:'7k/8/8/3R4/8/8/8/K7 w - - 0 1', square:'d5',
    targets:["d6","d7","d8","e5","f5","g5","h5","d4","d3","d2","d1","c5","b5","a5"] },
  { id:'mov_torre_2', cat:'movimientos', title:'La Torre — con piezas para capturar', type:'squares',
    text:'La torre no puede saltar piezas. Si hay una pieza rival en su camino, puede capturarla — pero ahí se detiene. Marca todas las casillas a las que puede llegar (incluye la captura).',
    fen:'7k/3p4/8/3R1p2/8/8/8/K7 w - - 0 1', square:'d5',
    targets:["d6","d7","e5","f5","d4","d3","d2","d1","c5","b5","a5"] },
  { id:'mov_alfil_1', cat:'movimientos', title:'El Alfil', type:'squares',
    text:'El alfil se mueve en diagonal, tan lejos como quiera, y siempre se queda en casillas del mismo color. Haz clic en todas las casillas a las que puede llegar.',
    fen:'7k/8/8/3B4/8/8/8/K7 w - - 0 1', square:'d5',
    targets:["c6","b7","a8","e6","f7","g8","e4","f3","g2","h1","c4","b3","a2"] },
  { id:'mov_alfil_2', cat:'movimientos', title:'El Alfil — con piezas para capturar', type:'squares',
    text:'Igual que la torre, el alfil se detiene al capturar una pieza rival en su camino. Marca todas las casillas a las que puede llegar.',
    fen:'7k/1p6/8/3B4/5p2/8/8/K7 w - - 0 1', square:'d5',
    targets:["c6","b7","e6","f7","g8","e4","f3","g2","h1","c4","b3","a2"] },
  { id:'mov_dama_1', cat:'movimientos', title:'La Dama', type:'squares',
    text:'La dama es la pieza más poderosa: combina el movimiento de la torre y el alfil. Se mueve en línea recta o en diagonal, tan lejos como quiera. Haz clic en todas las casillas a las que puede llegar.',
    fen:'7k/8/8/3Q4/8/8/8/K7 w - - 0 1', square:'d5',
    targets:["c6","b7","a8","d6","d7","d8","e6","f7","g8","e5","f5","g5","h5","e4","f3","g2","h1","d4","d3","d2","d1","c4","b3","a2","c5","b5","a5"] },
  { id:'mov_dama_2', cat:'movimientos', title:'La Dama — con piezas para capturar', type:'squares',
    text:'Marca todas las casillas a las que la dama puede llegar en esta posición, incluidas las capturas.',
    fen:'7k/3p4/8/1p1Q1p2/8/8/8/K7 w - - 0 1', square:'d5',
    targets:["c6","b7","a8","d6","d7","e6","f7","g8","e5","f5","e4","f3","g2","h1","d4","d3","d2","d1","c4","b3","a2","c5","b5"] },
  { id:'mov_caballo_1', cat:'movimientos', title:'El Caballo', type:'squares',
    text:'El caballo se mueve "en L": dos casillas en una dirección y una hacia el lado. Es la única pieza que puede saltar por encima de otras. Haz clic en todas las casillas a las que puede llegar.',
    fen:'7k/8/8/3N4/8/8/8/K7 w - - 0 1', square:'d5',
    targets:["b6","c7","e7","f6","f4","e3","c3","b4"] },
  { id:'mov_caballo_2', cat:'movimientos', title:'El Caballo — salta por encima', type:'squares',
    text:'Aunque esté rodeado de piezas, el caballo salta por encima de ellas sin problema. Marca todas las casillas a las que puede llegar.',
    fen:'7k/8/2p1p3/3N4/2p1p3/8/8/K7 w - - 0 1', square:'d5',
    targets:["b6","c7","e7","f6","f4","e3","c3","b4"] },
  { id:'mov_peon_1', cat:'movimientos', title:'El Peón', type:'squares',
    text:'El peón avanza una casilla (o dos, si es su primera jugada) en línea recta, y solo puede capturar en diagonal. Haz clic en todas las casillas a las que puede llegar.',
    fen:'7k/8/8/8/8/8/4P3/K7 w - - 0 1', square:'e2',
    targets:["e3","e4"] },
  { id:'mov_peon_2', cat:'movimientos', title:'El Peón — capturas', type:'squares',
    text:'El peón nunca captura hacia adelante, solo en diagonal. Marca todas las casillas a las que puede llegar desde aquí (avance y capturas).',
    fen:'7k/8/8/8/3p1p2/4P3/8/K7 w - - 0 1', square:'e3',
    targets:["e4","d4","f4"] },

  // ---------- Reglas especiales ----------
  { id:'reg_jaque', cat:'reglas', title:'Jaque — sal del jaque', type:'move',
    text:'Tu rey está en jaque: lo ataca la torre negra. Cuando estás en jaque, es obligatorio resolverlo en tu jugada. Encuentra una jugada legal que saque a tu rey del jaque.',
    fen:'4k3/8/8/8/8/8/4r3/4K3 w - - 0 1', anyLegalMove:true },
  { id:'reg_enroque', cat:'reglas', title:'Enroque corto', type:'move',
    text:'Si el rey y la torre de ese lado no se han movido todavía, y no hay piezas entre ellos, puedes enrocar: el rey se mueve dos casillas hacia la torre, y la torre salta al otro lado del rey. Haz clic en el rey y luego dos casillas a la derecha.',
    fen:'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', solution:{from:'e1',to:'g1'} },
  { id:'reg_paso', cat:'reglas', title:'Captura al paso', type:'move',
    text:'Si un peón rival avanza dos casillas de golpe y queda justo al lado de uno de tus peones, puedes capturarlo "al paso" — como si solo hubiera avanzado una. Pero ojo: solo puedes hacerlo en la jugada inmediatamente siguiente. Captura el peón blanco al paso.',
    fen:'4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1', solution:{from:'d4',to:'e3'} },
  { id:'reg_coronacion', cat:'reglas', title:'Coronación', type:'move',
    text:'Cuando un peón llega hasta el final del tablero, se convierte en otra pieza — lo normal es elegir dama, la más fuerte. Lleva el peón hasta la última fila para coronarlo.',
    fen:'8/4P3/8/8/8/8/8/4K2k w - - 0 1', solution:{from:'e7',to:'e8'} },
  { id:'reg_quiz', cat:'reglas', title:'¿Jaque mate o ahogado?', type:'quiz',
    text:'Si el rey en turno está en jaque y no tiene ninguna jugada legal, es JAQUE MATE: la partida termina. Si NO está en jaque pero tampoco tiene ninguna jugada legal, es AHOGADO: la partida es tablas. Mira cada posición y decide cuál es.',
    rounds:[
      { fen:'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', answer:'mate' },
      { fen:'7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', answer:'ahogado' },
    ] },

  // ---------- Tácticas básicas ----------
  { id:'tac_horquilla', cat:'tacticas', title:'Horquilla', type:'move',
    text:'Una horquilla ataca dos piezas rivales a la vez con una sola pieza, obligando al rival a perder una de ellas. Encuentra el salto de caballo que ataca al rey Y a la dama negra al mismo tiempo.',
    fen:'6k1/8/2q5/3N4/8/8/8/K7 w - - 0 1', solution:{from:'d5',to:'e7'}, motivo:'horquilla' },
  { id:'tac_clavada', cat:'tacticas', title:'Clavada', type:'move',
    text:'Una pieza está "clavada" cuando no puede moverse sin dejar expuesta a una pieza más valiosa detrás de ella — aquí, su propio rey. El caballo negro está clavado por tu torre y no se puede mover: captúralo gratis.',
    fen:'4k3/8/4n3/8/2B1R3/8/8/4K3 w - - 0 1', solution:{from:'c4',to:'e6'}, motivo:'clavada' },
  { id:'tac_descubierta', cat:'tacticas', title:'Ataque descubierto', type:'move',
    text:'Un ataque descubierto pasa cuando mueves una pieza y, al apartarse, deja a otra pieza tuya atacando algo que antes tapaba. Mueve el caballo y descubre el jaque de tu alfil.',
    fen:'4k3/8/2N5/8/B7/8/8/6K1 w - - 0 1', solution:{from:'c6',to:'d4'}, motivo:'descubierto' },
  { id:'tac_doble', cat:'tacticas', title:'Ataque doble', type:'move',
    text:'Un ataque doble amenaza dos piezas rivales a la vez con una sola pieza de largo alcance (a diferencia de la horquilla, que siempre es de un caballo). Mueve la dama a la casilla que ataca la torre Y el caballo negros al mismo tiempo.',
    fen:'7n/2r5/4k3/8/3Q4/8/8/7K w - - 0 1', solution:{from:'d4',to:'d8'}, motivo:'doble' },
];

const CATEGORY_ORDER = ['movimientos','reglas','tacticas','asignaciones'];
const CATEGORY_LABEL = {movimientos:'Movimientos', reglas:'Reglas especiales', tacticas:'Tácticas básicas', asignaciones:'Asignaciones'};

if (typeof window !== "undefined") window.AprenderLecciones = { LESSONS, CATEGORY_ORDER, CATEGORY_LABEL };
