/* Las frases del arbitraje en español, inglés y francés (Centroamericano 2026): lo que el árbitro de mesa que solo habla español le
   muestra a un jugador que no lo habla, sin traductor y sin internet.

   Cada frase es un texto FIJO escrito una vez y revisado (no se traduce al vuelo): así no puede decir algo distinto de la regla. Lleva
   su tema, los tres idiomas y, si la hay, la regla de las Leyes del Ajedrez de FIDE en que se apoya (`art`). El árbitro elige la frase en
   su idioma y la tablet la muestra al jugador en el suyo (js/centroamericano-hablar.js).

   Dos listas:
     FRASES       lo que dice el árbitro al jugador (de `es` a `en`/`fr`)
     DEL_JUGADOR  lo que le toca al jugador mandarle al árbitro con un botón (de `en`/`fr` a `es`): el jugador ve el botón en su idioma
                  y el árbitro lo lee en español

   La terminología en inglés y francés sigue la de las Leyes del Ajedrez de FIDE (touch-move / toucher-jouer, illegal move / coup
   illégal, scoresheet / feuille de partie…). Si una frase se cambia, que la revise alguien que domine el idioma.

   Sin nada de navegador para que herramientas/verificar-centroamericano-idioma.js lo pruebe con node.
   Ver «Hablar con el jugador» en docs/decisiones/juegos-y-torneos.md. */
(function (raiz) {
  "use strict";

  const IDIOMAS = [
    { id: "es", nombre: "Español", enEs: "español", voz: "es-CR" },
    { id: "en", nombre: "English", enEs: "inglés", voz: "en-US" },
    { id: "fr", nombre: "Français", enEs: "francés", voz: "fr-FR" },
  ];

  // Los temas, en el orden en que salen.
  const TEMAS = [
    { id: "inicio", nombre: "Al empezar" },
    { id: "reloj", nombre: "El reloj" },
    { id: "piezas", nombre: "Las piezas" },
    { id: "planilla", nombre: "La planilla" },
    { id: "ilegal", nombre: "Jugada ilegal" },
    { id: "tablas", nombre: "Tablas y reclamos" },
    { id: "conducta", nombre: "Conducta" },
    { id: "tiempo", nombre: "Tiempo y llegada" },
    { id: "fin", nombre: "Al terminar" },
    { id: "rapidas", nombre: "Respuestas rápidas" },
  ];

  const f = (id, tema, es, en, fr, art) => ({ id, tema, es, en, fr, art: art || "" });

  const FRASES = [
    f("bienvenida", "inicio", "Bienvenido. Siéntate en tu mesa y espera la señal de inicio.",
      "Welcome. Please sit at your board and wait for the start signal.",
      "Bienvenue. Veuillez vous asseoir à votre table et attendre le signal de départ."),
    f("celular", "inicio", "Apaga el celular y guárdalo en tu mochila.",
      "Switch off your mobile phone and put it in your bag.",
      "Éteignez votre téléphone portable et rangez-le dans votre sac.", "11.3"),
    f("rival-no-llega", "inicio", "Tu rival todavía no ha llegado. El tiempo de espera es de 30 minutos.",
      "Your opponent has not arrived yet. The waiting time is 30 minutes.",
      "Votre adversaire n'est pas encore arrivé. Le temps d'attente est de 30 minutes.", "6.7"),
    f("rival-llego", "inicio", "Tu rival ya llegó. Pueden empezar.",
      "Your opponent has arrived. You may start.",
      "Votre adversaire est arrivé. Vous pouvez commencer."),

    f("reloj-mano", "reloj", "Presiona el reloj con la misma mano con la que moviste.",
      "Press the clock with the same hand you used to make your move.",
      "Appuyez sur la pendule avec la même main que celle qui a joué le coup."),
    f("reloj-olvido", "reloj", "No olvides presionar el reloj después de cada jugada.",
      "Do not forget to press the clock after each move.",
      "N'oubliez pas d'appuyer sur la pendule après chaque coup."),
    f("reloj-turno", "reloj", "Es tu turno de jugar.",
      "It is your turn to move.",
      "C'est à vous de jouer."),
    f("reloj-detenido", "reloj", "El reloj se detuvo un momento. Espera mientras lo reviso.",
      "The clock has been stopped for a moment. Please wait while I check it.",
      "La pendule a été arrêtée un instant. Veuillez patienter pendant que je la vérifie."),
    f("reloj-no-tocar", "reloj", "No toques el reloj: voy a anotar los tiempos.",
      "Do not touch the clock: I am going to note the times.",
      "Ne touchez pas la pendule : je vais noter les temps."),

    f("tocar-mover", "piezas", "Si tocas una pieza, debes moverla.",
      "If you touch a piece, you must move it.",
      "Si vous touchez une pièce, vous devez la jouer.", "4.3"),
    f("ajusto", "piezas", "Para acomodar una pieza, di primero «ajusto» y luego tócala.",
      "To adjust a piece, say \"I adjust\" first, and then touch it.",
      "Pour ajuster une pièce, dites d'abord « J'adoube », puis touchez-la.", "4.2"),
    f("una-mano", "piezas", "Mueve las piezas con una sola mano.",
      "Move the pieces with one hand only.",
      "Jouez les pièces d'une seule main.", "4.1"),
    f("coronar", "piezas", "Para coronar, retira el peón y pon la nueva pieza en la casilla.",
      "To promote, remove the pawn and place the new piece on the square.",
      "Pour promouvoir, retirez le pion et placez la nouvelle pièce sur la case."),

    f("anota", "planilla", "Anota cada jugada en tu planilla, después de hacerla.",
      "Record each move on your scoresheet after you have played it.",
      "Notez chaque coup sur votre feuille de partie après l'avoir joué.", "8.1"),
    f("firma", "planilla", "Firma la planilla cuando termine la partida.",
      "Sign the scoresheet when the game ends.",
      "Signez la feuille de partie à la fin de la partie."),
    f("entrega", "planilla", "Entrega tu planilla al árbitro.",
      "Hand your scoresheet to the arbiter.",
      "Remettez votre feuille de partie à l'arbitre."),

    f("ilegal-corregir", "ilegal", "Tu última jugada fue ilegal. Debes corregirla.",
      "Your last move was illegal. It must be corrected.",
      "Votre dernier coup était illégal. Il doit être corrigé.", "7.5.1"),
    f("ilegal-dos-min", "ilegal", "Por la jugada ilegal, tu rival recibe dos minutos más.",
      "Because of the illegal move, your opponent receives two extra minutes.",
      "À cause du coup illégal, votre adversaire reçoit deux minutes supplémentaires.", "7.5.5"),
    f("ilegal-segunda", "ilegal", "Es la segunda jugada ilegal en esta partida. Según el reglamento, se pierde la partida.",
      "This is the second illegal move in this game. According to the rules, the game is lost.",
      "C'est le deuxième coup illégal de cette partie. Selon le règlement, la partie est perdue.", "7.5.5"),

    f("tablas-oferta", "tablas", "Para ofrecer tablas, hazlo después de mover y antes de presionar el reloj.",
      "To offer a draw, do it after making your move and before pressing the clock.",
      "Pour proposer la nulle, faites-le après avoir joué votre coup et avant d'appuyer sur la pendule.", "9.1"),
    f("reclamo", "tablas", "Si quieres hacer un reclamo, detén el reloj y llámame. No muevas más piezas.",
      "If you wish to make a claim, stop the clock and call me. Do not move any more pieces.",
      "Si vous souhaitez faire une réclamation, arrêtez la pendule et appelez-moi. Ne jouez plus de pièces.", "9.2"),
    f("reclamo-espera", "tablas", "Voy a revisar tu reclamo. Espera un momento, por favor.",
      "I am going to check your claim. Please wait a moment.",
      "Je vais vérifier votre réclamation. Veuillez patienter un instant."),
    f("repeticion", "tablas", "La posición se repitió tres veces: puedes reclamar tablas.",
      "The position has occurred three times: you may claim a draw.",
      "La position s'est répétée trois fois : vous pouvez réclamer la nulle.", "9.2"),
    f("cincuenta", "tablas", "Se hicieron 50 jugadas sin mover un peón ni capturar: puedes reclamar tablas.",
      "50 moves have been made without a pawn move or a capture: you may claim a draw.",
      "50 coups ont été joués sans coup de pion ni prise : vous pouvez réclamer la nulle.", "9.3"),

    f("silencio", "conducta", "Guarda silencio, por favor. Otros jugadores están concentrados.",
      "Please be quiet. Other players are concentrating.",
      "Silence, s'il vous plaît. Les autres joueurs sont concentrés."),
    f("no-hablar", "conducta", "No hables con tu rival durante la partida, salvo para ofrecer tablas.",
      "Do not talk to your opponent during the game, except to offer a draw.",
      "Ne parlez pas à votre adversaire pendant la partie, sauf pour proposer la nulle."),
    f("sin-ayuda", "conducta", "No puedes pedir ayuda a nadie durante la partida.",
      "You may not ask anyone for help during the game.",
      "Vous ne pouvez demander l'aide de personne pendant la partie.", "11.3"),
    f("bano", "conducta", "Si necesitas ir al baño, pídeme permiso.",
      "If you need to go to the toilet, ask me for permission.",
      "Si vous devez aller aux toilettes, demandez-moi la permission."),
    f("no-salir", "conducta", "No salgas de la sala sin mi permiso.",
      "Do not leave the playing hall without my permission.",
      "Ne quittez pas la salle de jeu sans ma permission."),

    f("bandera", "tiempo", "Se te cayó la bandera: tu tiempo se acabó.",
      "Your flag has fallen: your time is up.",
      "Votre drapeau est tombé : votre temps est écoulé.", "6.9"),
    f("incomparecencia", "tiempo", "Tu rival no llegó en el tiempo de espera: la partida se gana por incomparecencia.",
      "Your opponent did not arrive within the waiting time: the game is won by forfeit.",
      "Votre adversaire n'est pas arrivé dans le temps d'attente : la partie est gagnée par forfait.", "6.7"),

    f("res-blancas", "fin", "La partida terminó: ganan las blancas (1-0).",
      "The game is over: White wins (1-0).",
      "La partie est terminée : les Blancs gagnent (1-0)."),
    f("res-negras", "fin", "La partida terminó: ganan las negras (0-1).",
      "The game is over: Black wins (0-1).",
      "La partie est terminée : les Noirs gagnent (0-1)."),
    f("res-tablas", "fin", "La partida terminó en tablas (½-½).",
      "The game is over: it is a draw (½-½).",
      "La partie est terminée : c'est nulle (½-½)."),
    f("espera-resultado", "fin", "Quédate sentado hasta que yo confirme el resultado. No muevas las piezas.",
      "Please stay seated until I confirm the result. Do not touch the pieces.",
      "Restez assis jusqu'à ce que je confirme le résultat. Ne touchez pas aux pièces."),
    f("gracias", "fin", "Gracias, buena partida.",
      "Thank you, good game.",
      "Merci, bonne partie."),

    f("si", "rapidas", "Sí.", "Yes.", "Oui."),
    f("no", "rapidas", "No.", "No.", "Non."),
    f("momento", "rapidas", "Un momento, por favor.", "One moment, please.", "Un instant, s'il vous plaît."),
    f("entiende", "rapidas", "¿Entiendes?", "Do you understand?", "Comprenez-vous ?"),
    f("ayuda-mano", "rapidas", "¿Necesitas ayuda? Levanta la mano.",
      "Do you need help? Raise your hand.",
      "Avez-vous besoin d'aide ? Levez la main."),
    f("otro-arbitro", "rapidas", "No hablo tu idioma. Un momento: voy por alguien que te ayude.",
      "I do not speak your language. One moment: I will bring someone who can help you.",
      "Je ne parle pas votre langue. Un instant : je vais chercher quelqu'un qui peut vous aider."),
  ];

  // Lo que el jugador le dice al árbitro con un botón. `es` es lo que lee el árbitro.
  const DEL_JUGADOR = [
    { id: "j-duda", es: "Tengo una duda sobre las reglas.", en: "I have a question about the rules.", fr: "J'ai une question sur les règles." },
    { id: "j-tablas", es: "Quiero reclamar tablas.", en: "I want to claim a draw.", fr: "Je veux réclamer la nulle." },
    { id: "j-ilegal", es: "Mi rival hizo una jugada ilegal.", en: "My opponent made an illegal move.", fr: "Mon adversaire a joué un coup illégal." },
    { id: "j-reloj", es: "Mi reloj no funciona bien.", en: "My clock is not working properly.", fr: "Ma pendule ne fonctionne pas bien." },
    { id: "j-bano", es: "Necesito ir al baño.", en: "I need to go to the toilet.", fr: "J'ai besoin d'aller aux toilettes." },
    { id: "j-agua", es: "Necesito agua.", en: "I need some water.", fr: "J'ai besoin d'eau." },
    { id: "j-rival", es: "Mi rival me está molestando.", en: "My opponent is bothering me.", fr: "Mon adversaire me dérange." },
    { id: "j-no-entiendo", es: "No entiendo. Por favor, repítelo.", en: "I do not understand. Please repeat it.", fr: "Je ne comprends pas. Répétez, s'il vous plaît." },
    { id: "j-gracias", es: "Gracias.", en: "Thank you.", fr: "Merci." },
  ];

  // El idioma que se le sugiere a un jugador por la federación de FIDE de su país (el árbitro lo cambia con un toque). Los países
  // que no están en las listas quedan en español: la región es de habla hispana y el árbitro cambia a inglés o francés si hace falta.
  const FRANCES = new Set(["FRA", "HAI", "CAN", "BEL", "SUI", "LUX", "MNC", "MAD", "SEN", "CIV", "CMR", "COD", "GAB", "TOG", "BEN", "BUR", "MLI", "NIG", "CHA", "CAF", "DJI", "MTN", "TUN", "ALG", "MAR", "LBN", "COM", "MRI", "SEY", "VAN"]);
  const INGLES = new Set(["USA", "ENG", "SCO", "WLS", "IRL", "AUS", "NZL", "RSA", "IND", "PAK", "SGP", "TTO", "JAM", "BAR", "BAH", "BER", "CAY", "GUY", "BIZ", "GRN", "LCA", "VIN", "SKN", "ANT", "DMA", "ISV", "IVB", "NGR", "GHA", "KEN", "UGA", "ZIM", "ZAM", "MAS", "PHI", "HKG", "FIJ"]);
  // Surinam, Aruba y Curazao no están en ninguna lista: no se sugiere idioma (quedan en español) y el árbitro elige inglés con un toque.
  function idiomaDeFed(fed) {
    const c = String(fed || "").trim().toUpperCase();
    if (FRANCES.has(c)) return "fr";
    if (INGLES.has(c)) return "en";
    return "es";
  }

  const porId = (lista) => new Map(lista.map((x) => [x.id, x]));
  const FRASE = porId(FRASES), DEL_JUG = porId(DEL_JUGADOR);

  // Lo que queda en la bitácora cuando el árbitro marca «Anotar»: quién, en qué idioma y qué se le dijo (con el original en español).
  function textoComunicado({ jugador, color, idioma, es, traducido }) {
    const lado = color === "blancas" ? "blancas" : color === "negras" ? "negras" : "";
    const lang = (IDIOMAS.find((i) => i.id === idioma) || IDIOMAS[0]).enEs;
    return ("Se le comunicó a " + (jugador || "el jugador") + (lado ? " (" + lado + ")" : "") + " en " + lang + ": «" + String(traducido || "").trim() + "»"
      + (idioma !== "es" && es ? " (en español: «" + String(es).trim() + "»)" : "")).slice(0, 2000);
  }

  const api = { IDIOMAS, TEMAS, FRASES, DEL_JUGADOR, FRASE, DEL_JUG, idiomaDeFed, textoComunicado };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.CentroamericanoFrases = api;
})(typeof self !== "undefined" ? self : this);
