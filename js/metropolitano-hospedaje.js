/* Ajedrez Integral — las condiciones del hospedaje del Metropolitano 2026.
 *
 * Quien se queda en el hospedaje del Estadio Nacional usa instalaciones
 * públicas, con condiciones estrictas: la puerta se cierra a las 10:30 p.m.
 * y nadie entra ni sale después, silencio, nada de caminar alrededor del
 * estadio ni entrar a la cancha, y se da solo el espacio y la cama (sin ropa
 * de cama ni cortinas). A los invitados especiales (GM, IM y WGM) la
 * organización les da la ropa de cama; todo lo demás les aplica igual.
 *
 * Una sola copia del texto, en español, inglés y francés: la usan la
 * inscripción (donde se aceptan, y la base lo exige y guarda VERSION) y la
 * página del torneo (la ficha «Hospedaje en el Estadio Nacional», para
 * leerlas antes de decidir). Cambiar una condición sube VERSION.
 *
 * Ver «Las condiciones del hospedaje» en docs/decisiones/cuentas-y-formularios.md.
 */
window.MetropolitanoHospedaje = (function () {
  "use strict";
  const VERSION = "metropolitano-2026-hospedaje-v1";

  const TX = {
    es: {
      titulo: "Hospedaje en el Estadio Nacional",
      ficha: "Las condiciones para quedarse en el hospedaje del Estadio: la puerta se cierra a las 10:30 p.m., silencio y qué hay que traer.",
      fichaAccion: "Leer las condiciones →",
      cerrar: "Cerrar",
      intro: "El hospedaje está dentro del Estadio Nacional, que es una instalación pública: hay que cuidarla. Es un servicio con condiciones, y son estrictas. Léelas antes de pedirlo.",
      reglas: [
        ["La puerta se cierra a las 10:30 p.m.", "Después de esa hora nadie entra ni sale de las instalaciones, sin excepciones. Quien llegue tarde no podrá entrar a dormir esa noche."],
        ["Silencio y respeto.", "Se cuida el ruido en todo momento, y más de noche: hay jugadores descansando para su ronda."],
        ["No se camina alrededor del estadio.", "Solo se usan el hospedaje y la sala de juego; las zonas de acceso restringido se respetan."],
        ["No se entra a la cancha", "ni a las graderías."],
        ["No se fuma ni se vapea", "en ninguna parte del estadio, ni se toma alcohol ni se usan drogas."],
        ["No se cocina en los dormitorios", "ni se usan aparatos de calor (cocinas, planchas, calentadores), ni se pega o cuelga nada en las paredes."],
        ["Limpieza y cuidado.", "La basura va a los basureros, y lo que se dañe lo paga quien lo dañó."],
        ["Solo duermen las personas inscritas con hospedaje.", "No se reciben visitas en los dormitorios ni se admiten mascotas."],
        ["Los menores de edad", "están siempre con su responsable o con el delegado de su delegación, que responde por ellos."],
        ["Las pertenencias son de cada quien.", "La organización no responde por objetos perdidos o robados."],
        ["Se siguen las indicaciones", "de la organización y del personal de seguridad del estadio."],
        ["Quien no cumpla puede perder el hospedaje,", "sin devolución de lo pagado, y la organización puede informarlo a su delegación."],
      ],
      ropaTitulo: "Qué hay que traer",
      ropa: "Se da únicamente el espacio para dormir y la cama: no hay ropa de cama ni cortinas. Trae sábanas, almohada, cobija o saco de dormir, toalla y tus artículos de aseo (un antifaz ayuda a dormir).",
      ropaTitulado: "A los invitados especiales (GM, IM y WGM) la organización les da la ropa de cama. Todas las demás condiciones les aplican igual.",
      cierre: "Al pedir el hospedaje se aceptan estas condiciones: después no se podrá decir que no se sabían.",
      acepto: "Leí y acepto las condiciones del hospedaje en el Estadio Nacional: la puerta se cierra a las 10:30 p.m. y después no se entra ni se sale, y se da solo el espacio y la cama.",
      aceptoTitulado: "Leí y acepto las condiciones del hospedaje en el Estadio Nacional: la puerta se cierra a las 10:30 p.m. y después no se entra ni se sale. La ropa de cama la da la organización.",
    },
    en: {
      titulo: "Lodging at the Estadio Nacional",
      ficha: "The conditions for staying at the Stadium lodging: the door closes at 10:30 p.m., quiet, and what to bring.",
      fichaAccion: "Read the conditions →",
      cerrar: "Close",
      intro: "The lodging is inside the Estadio Nacional, a public facility that we must take care of. It is a service with conditions, and they are strict. Read them before you ask for it.",
      reglas: [
        ["The door closes at 10:30 p.m.", "After that time nobody enters or leaves the facilities, with no exceptions. Anyone who arrives late will not be able to come in to sleep that night."],
        ["Quiet and respect.", "Keep the noise down at all times, especially at night: there are players resting for their round."],
        ["No walking around the stadium.", "Only the lodging and the playing hall are used; restricted areas must be respected."],
        ["No entering the pitch", "or the stands."],
        ["No smoking or vaping", "anywhere in the stadium, and no alcohol or drugs."],
        ["No cooking in the bedrooms", "and no heating appliances (stoves, irons, heaters); nothing is stuck or hung on the walls."],
        ["Cleanliness and care.", "Rubbish goes in the bins, and whoever damages something pays for it."],
        ["Only people registered with lodging sleep there.", "No visitors in the bedrooms and no pets."],
        ["Minors", "are always with their guardian or with their delegation's delegate, who is responsible for them."],
        ["Belongings are each person's responsibility.", "The organisers are not liable for lost or stolen items."],
        ["Follow the instructions", "of the organisers and of the stadium security staff."],
        ["Anyone who does not comply may lose their lodging,", "with no refund, and the organisers may report it to their delegation."],
      ],
      ropaTitulo: "What to bring",
      ropa: "Only the space to sleep and the bed are provided: there is no bedding and there are no curtains. Bring sheets, a pillow, a blanket or sleeping bag, a towel and your toiletries (an eye mask helps you sleep).",
      ropaTitulado: "Special guests (GM, IM and WGM) receive bedding from the organisers. All the other conditions apply to them as well.",
      cierre: "Asking for lodging means accepting these conditions: nobody can say afterwards that they did not know them.",
      acepto: "I have read and accept the conditions of the lodging at the Estadio Nacional: the door closes at 10:30 p.m. and nobody enters or leaves after that, and only the space and the bed are provided.",
      aceptoTitulado: "I have read and accept the conditions of the lodging at the Estadio Nacional: the door closes at 10:30 p.m. and nobody enters or leaves after that. The bedding is provided by the organisers.",
    },
    fr: {
      titulo: "Hébergement au Stade national",
      ficha: "Les conditions pour loger au Stade : la porte ferme à 22 h 30, le silence et ce qu’il faut apporter.",
      fichaAccion: "Lire les conditions →",
      cerrar: "Fermer",
      intro: "L’hébergement se trouve à l’intérieur du Stade national, une installation publique dont il faut prendre soin. C’est un service avec des conditions, et elles sont strictes. Lisez-les avant de le demander.",
      reglas: [
        ["La porte ferme à 22 h 30.", "Après cette heure, personne n’entre ni ne sort, sans exception. Qui arrive en retard ne pourra pas entrer pour dormir cette nuit-là."],
        ["Silence et respect.", "On fait attention au bruit à tout moment, et surtout la nuit : des joueurs se reposent pour leur ronde."],
        ["On ne se promène pas autour du stade.", "On utilise seulement l’hébergement et la salle de jeu ; les zones à accès restreint sont respectées."],
        ["On n’entre pas sur la pelouse", "ni dans les tribunes."],
        ["On ne fume pas et on ne vapote pas", "dans tout le stade, et ni alcool ni drogues."],
        ["On ne cuisine pas dans les dortoirs", "et on n’utilise pas d’appareils chauffants (réchauds, fers à repasser, radiateurs) ; on ne colle ni n’accroche rien aux murs."],
        ["Propreté et soin.", "Les déchets vont à la poubelle, et ce qui est abîmé est payé par la personne responsable."],
        ["Seules les personnes inscrites avec hébergement y dorment.", "Pas de visites dans les dortoirs ni d’animaux."],
        ["Les mineurs", "sont toujours avec leur responsable ou avec le délégué de leur délégation, qui répond d’eux."],
        ["Chacun est responsable de ses affaires.", "L’organisation ne répond pas des objets perdus ou volés."],
        ["On suit les indications", "de l’organisation et du personnel de sécurité du stade."],
        ["Qui ne respecte pas ces règles peut perdre son hébergement,", "sans remboursement, et l’organisation peut en informer sa délégation."],
      ],
      ropaTitulo: "Ce qu’il faut apporter",
      ropa: "On fournit uniquement l’espace pour dormir et le lit : il n’y a ni linge de lit ni rideaux. Apportez draps, oreiller, couverture ou sac de couchage, serviette et affaires de toilette (un masque de nuit aide à dormir).",
      ropaTitulado: "Les invités spéciaux (GM, IM et WGM) reçoivent le linge de lit de l’organisation. Toutes les autres conditions s’appliquent à eux aussi.",
      cierre: "Demander l’hébergement, c’est accepter ces conditions : personne ne pourra dire ensuite qu’il ne les connaissait pas.",
      acepto: "J’ai lu et j’accepte les conditions de l’hébergement au Stade national : la porte ferme à 22 h 30 et personne n’entre ni ne sort ensuite, et seuls l’espace et le lit sont fournis.",
      aceptoTitulado: "J’ai lu et j’accepte les conditions de l’hébergement au Stade national : la porte ferme à 22 h 30 et personne n’entre ni ne sort ensuite. Le linge de lit est fourni par l’organisation.",
    },
  };

  function el(tag, clase, texto) { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; }

  // Las condiciones en `caja`: la intro, la lista, qué traer y el cierre.
  // `titulado`: solo cambia lo de la ropa de cama (la da la organización).
  function pintar(caja, idioma, opciones) {
    const T = TX[idioma] || TX.es;
    const titulado = !!(opciones && opciones.titulado);
    caja.textContent = "";
    caja.append(el("p", "", T.intro));
    const ol = el("ol", "list-decimal pl-5 space-y-1.5 mt-3");
    for (const [fuerte, resto] of T.reglas) {
      const li = el("li"); li.append(el("strong", "", fuerte), " " + resto); ol.append(li);
    }
    caja.append(ol);
    caja.append(el("p", "font-semibold mt-3", T.ropaTitulo));
    caja.append(el("p", "", titulado ? T.ropaTitulado : T.ropa));
    if (!titulado && !(opciones && opciones.soloUno)) caja.append(el("p", "text-sm mt-1", T.ropaTitulado));
    caja.append(el("p", "font-semibold mt-3", T.cierre));
  }

  // La ficha de «Todo el torneo» y su ventanita, en la página del torneo.
  function pintarPagina(idioma, cajaFicha) {
    const T = TX[idioma] || TX.es;
    let d = document.getElementById("hospedaje");
    if (!d) {
      d = el("dialog", "metro-ventana"); d.id = "hospedaje"; d.setAttribute("aria-labelledby", "hospedaje-titulo"); d.setAttribute("data-no-traducir", "");
      const cab = el("div", "metro-ventana-cabeza"); const h2 = el("h2"); h2.id = "hospedaje-titulo";
      const b = el("button", "metro-boton"); b.type = "button"; b.dataset.cerrar = ""; b.id = "hospedaje-cerrar";
      cab.append(h2, b);
      const cu = el("div", "metro-ventana-cuerpo"); cu.id = "hospedaje-condiciones";
      d.append(cab, cu);
      document.querySelector("main").append(d);
    }
    document.getElementById("hospedaje-titulo").textContent = "🛏️ " + T.titulo;
    document.getElementById("hospedaje-cerrar").textContent = T.cerrar;
    pintar(document.getElementById("hospedaje-condiciones"), idioma);
    if (cajaFicha) {
      cajaFicha.textContent = "";
      const a = el("a", "metro-ficha"); a.href = "#hospedaje"; a.dataset.tono = "2";
      const e = el("span", "metro-ficha-emoji", "🛏️"); e.setAttribute("aria-hidden", "true");
      a.append(e, el("span", "metro-ficha-titulo", T.titulo), el("span", "metro-ficha-texto", T.ficha), el("span", "metro-ficha-accion", T.fichaAccion));
      cajaFicha.append(a);
    }
  }

  return { VERSION, TX, pintar, pintarPagina };
})();
