/* «Qué hacer en el tiempo libre»: los paseos alrededor de La Sabana para las
 * familias y los jugadores de un torneo en San José, en español, inglés y
 * francés. Salen de la ficha del Centroamericano 2026 (centroamericano-2026.html,
 * con sus traducciones), que se juega en el Gimnasio Nacional, en el mismo
 * parque que el Estadio Nacional del Metropolitano.
 *
 * Sin horarios ni precios: cambian y no hay de dónde confirmarlos; el mapa de
 * cada lugar trae los del día (ver «Qué hacer en el tiempo libre» en
 * docs/decisiones/juegos-y-torneos.md).
 *
 *   PaseosSabana.pintar(caja, idioma)  arma los filtros y la lista en `caja`
 *                                      (marcada data-no-traducir: va en su idioma).
 */
window.PaseosSabana = (function () {
  "use strict";
  const LISTA = [
    {
      "emoji": "🌳",
      "etiquetas": [
        "cerca",
        "ninos"
      ],
      "nombre": {
        "es": "Parque Metropolitano La Sabana",
        "en": "La Sabana Metropolitan Park",
        "fr": "Parc métropolitain La Sabana"
      },
      "lugar": {
        "es": "Cerca de la sala · Para niños",
        "en": "Near the venue · For kids",
        "fr": "Près de la salle · Pour les enfants"
      },
      "texto": {
        "es": "El parque de la sala: el lago, zonas verdes, canchas y juegos para niños. Para despejarse entre rondas.",
        "en": "The venue's park: the lake, green areas, sports fields and a playground. To clear your head between rounds.",
        "fr": "Le parc de la salle : le lac, des espaces verts, des terrains de sport et des jeux pour enfants. Pour se changer les idées entre les rondes."
      },
      "consulta": "Parque Metropolitano La Sabana San José Costa Rica"
    },
    {
      "emoji": "🎨",
      "etiquetas": [
        "cerca",
        "techo"
      ],
      "nombre": {
        "es": "Museo de Arte Costarricense",
        "en": "Costa Rican Art Museum",
        "fr": "Musée d'art costaricien"
      },
      "lugar": {
        "es": "Cerca de la sala · Bajo techo",
        "en": "Near the venue · Indoors",
        "fr": "Près de la salle · À l'intérieur"
      },
      "texto": {
        "es": "En la antigua terminal del aeropuerto, al este de La Sabana: arte costarricense y el Salón Dorado, con su mural de relieves dorados.",
        "en": "In the old airport terminal, on the east side of La Sabana: Costa Rican art and the Golden Hall, with its gilded relief mural.",
        "fr": "Dans l'ancien terminal de l'aéroport, à l'est de La Sabana : l'art costaricien et le Salon doré, avec sa fresque en relief dorée."
      },
      "consulta": "Museo de Arte Costarricense La Sabana San José Costa Rica"
    },
    {
      "emoji": "🦕",
      "etiquetas": [
        "cerca",
        "ninos",
        "techo"
      ],
      "nombre": {
        "es": "Museo de Ciencias Naturales La Salle",
        "en": "La Salle Natural Science Museum",
        "fr": "Musée des sciences naturelles La Salle"
      },
      "lugar": {
        "es": "Cerca de la sala · Para niños · Bajo techo",
        "en": "Near the venue · For kids · Indoors",
        "fr": "Près de la salle · Pour les enfants · À l'intérieur"
      },
      "texto": {
        "es": "En Sabana Sur: animales disecados, fósiles y minerales de todo el mundo. A los niños les encanta.",
        "en": "In Sabana Sur: stuffed animals, fossils and minerals from all over the world. Kids love it.",
        "fr": "À Sabana Sur : animaux naturalisés, fossiles et minéraux du monde entier. Les enfants adorent."
      },
      "consulta": "Museo de Ciencias Naturales La Salle San José Costa Rica"
    },
    {
      "emoji": "🛍️",
      "etiquetas": [
        "cerca",
        "techo"
      ],
      "nombre": {
        "es": "Plaza Mayor (Rohrmoser)",
        "en": "Plaza Mayor (Rohrmoser)",
        "fr": "Plaza Mayor (Rohrmoser)"
      },
      "lugar": {
        "es": "Cerca de la sala · Bajo techo",
        "en": "Near the venue · Indoors",
        "fr": "Près de la salle · À l'intérieur"
      },
      "texto": {
        "es": "Centro comercial al oeste de La Sabana, con restaurantes y cine. Para un día de lluvia.",
        "en": "A shopping mall west of La Sabana, with restaurants and a cinema. For a rainy day.",
        "fr": "Centre commercial à l'ouest de La Sabana, avec restaurants et cinéma. Pour un jour de pluie."
      },
      "consulta": "Centro Comercial Plaza Mayor Rohrmoser San José Costa Rica"
    },
    {
      "emoji": "🧒",
      "etiquetas": [
        "centro",
        "ninos",
        "techo"
      ],
      "nombre": {
        "es": "Museo de los Niños",
        "en": "Children's Museum",
        "fr": "Musée des enfants"
      },
      "lugar": {
        "es": "En taxi, 10–20 min · Para niños · Bajo techo",
        "en": "By taxi, 10–20 min · For kids · Indoors",
        "fr": "En taxi, 10–20 min · Pour les enfants · À l'intérieur"
      },
      "texto": {
        "es": "En el antiguo Centro Penal: salas para tocar, jugar y probar. Ideal para los más pequeños.",
        "en": "In the old prison building: hands-on rooms to touch, play and try things out. Ideal for the little ones.",
        "fr": "Dans l'ancienne prison : des salles pour toucher, jouer et essayer. Idéal pour les plus petits."
      },
      "consulta": "Museo de los Niños San José Costa Rica"
    },
    {
      "emoji": "🏛️",
      "etiquetas": [
        "centro",
        "ninos",
        "techo"
      ],
      "nombre": {
        "es": "Museo Nacional de Costa Rica",
        "en": "National Museum of Costa Rica",
        "fr": "Musée national du Costa Rica"
      },
      "lugar": {
        "es": "En taxi, 10–20 min · Para niños · Bajo techo",
        "en": "By taxi, 10–20 min · For kids · Indoors",
        "fr": "En taxi, 10–20 min · Pour les enfants · À l'intérieur"
      },
      "texto": {
        "es": "En el antiguo Cuartel Bellavista: la historia del país y un mariposario.",
        "en": "In the old Bellavista barracks: the country's history and a butterfly garden.",
        "fr": "Dans l'ancienne caserne Bellavista : l'histoire du pays et un jardin de papillons."
      },
      "consulta": "Museo Nacional de Costa Rica San José"
    },
    {
      "emoji": "🏺",
      "etiquetas": [
        "centro",
        "techo"
      ],
      "nombre": {
        "es": "Museo del Oro Precolombino",
        "en": "Pre-Columbian Gold Museum",
        "fr": "Musée de l'or précolombien"
      },
      "lugar": {
        "es": "En taxi, 10–20 min · Bajo techo",
        "en": "By taxi, 10–20 min · Indoors",
        "fr": "En taxi, 10–20 min · À l'intérieur"
      },
      "texto": {
        "es": "Bajo la Plaza de la Cultura: el oro de los pueblos originarios y la historia de la moneda.",
        "en": "Under the Plaza de la Cultura: the gold of the Indigenous peoples and the history of money.",
        "fr": "Sous la Plaza de la Cultura : l'or des peuples autochtones et l'histoire de la monnaie."
      },
      "consulta": "Museo del Oro Precolombino San José Costa Rica"
    },
    {
      "emoji": "🎭",
      "etiquetas": [
        "centro",
        "techo"
      ],
      "nombre": {
        "es": "Teatro Nacional",
        "en": "National Theater",
        "fr": "Théâtre national"
      },
      "lugar": {
        "es": "En taxi, 10–20 min · Bajo techo",
        "en": "By taxi, 10–20 min · Indoors",
        "fr": "En taxi, 10–20 min · À l'intérieur"
      },
      "texto": {
        "es": "El teatro de 1897, frente a la Plaza de la Cultura. Tiene visitas guiadas y un café.",
        "en": "The 1897 theater, facing the Plaza de la Cultura. It has guided tours and a café.",
        "fr": "Le théâtre de 1897, face à la Plaza de la Cultura. Il propose des visites guidées et un café."
      },
      "consulta": "Teatro Nacional de Costa Rica San José"
    },
    {
      "emoji": "🍲",
      "etiquetas": [
        "centro",
        "techo"
      ],
      "nombre": {
        "es": "Mercado Central",
        "en": "Central Market",
        "fr": "Marché central"
      },
      "lugar": {
        "es": "En taxi, 10–20 min · Bajo techo",
        "en": "By taxi, 10–20 min · Indoors",
        "fr": "En taxi, 10–20 min · À l'intérieur"
      },
      "texto": {
        "es": "Desde 1880: sodas con casado y gallo pinto, y el helado de sorbetera.",
        "en": "Since 1880: small eateries serving casado and gallo pinto, and the famous sorbetera ice cream.",
        "fr": "Depuis 1880 : petits restaurants avec casado et gallo pinto, et la célèbre glace « de sorbetera »."
      },
      "consulta": "Mercado Central San José Costa Rica"
    },
    {
      "emoji": "🎢",
      "etiquetas": [
        "centro",
        "ninos"
      ],
      "nombre": {
        "es": "Parque de Diversiones",
        "en": "Amusement park (Parque de Diversiones)",
        "fr": "Parc d'attractions (Parque de Diversiones)"
      },
      "lugar": {
        "es": "En taxi, 10–20 min · Para niños",
        "en": "By taxi, 10–20 min · For kids",
        "fr": "En taxi, 10–20 min · Pour les enfants"
      },
      "texto": {
        "es": "En La Uruca: juegos mecánicos para todas las edades.",
        "en": "In La Uruca: rides for all ages.",
        "fr": "À La Uruca : manèges pour tous les âges."
      },
      "consulta": "Parque de Diversiones La Uruca San José Costa Rica"
    },
    {
      "emoji": "🛒",
      "etiquetas": [
        "centro",
        "techo"
      ],
      "nombre": {
        "es": "Multiplaza Escazú",
        "en": "Multiplaza Escazú",
        "fr": "Multiplaza Escazú"
      },
      "lugar": {
        "es": "En taxi, 10–20 min · Bajo techo",
        "en": "By taxi, 10–20 min · Indoors",
        "fr": "En taxi, 10–20 min · À l'intérieur"
      },
      "texto": {
        "es": "Centro comercial grande, con restaurantes y cine. Para un día de lluvia.",
        "en": "A large shopping mall, with restaurants and a cinema. For a rainy day.",
        "fr": "Grand centre commercial, avec restaurants et cinéma. Pour un jour de pluie."
      },
      "consulta": "Multiplaza Escazú Costa Rica"
    },
    {
      "emoji": "🌋",
      "etiquetas": [
        "excursion"
      ],
      "nombre": {
        "es": "Volcán Poás",
        "en": "Poás Volcano",
        "fr": "Volcan Poás"
      },
      "lugar": {
        "es": "Excursión de medio día",
        "en": "Half-day trip",
        "fr": "Excursion d'une demi-journée"
      },
      "texto": {
        "es": "El cráter, a una hora y media. La entrada se compra antes en línea, y se ve mejor temprano. Cierra cuando el volcán está activo: revisa antes.",
        "en": "The crater, an hour and a half away. Tickets are bought online in advance, and it's best seen early. It closes when the volcano is active: check first.",
        "fr": "Le cratère, à une heure et demie. L'entrée s'achète à l'avance en ligne, et on le voit mieux tôt le matin. Il ferme quand le volcan est actif : vérifiez avant."
      },
      "consulta": "Parque Nacional Volcán Poás Costa Rica"
    },
    {
      "emoji": "⛰️",
      "etiquetas": [
        "excursion"
      ],
      "nombre": {
        "es": "Volcán Irazú",
        "en": "Irazú Volcano",
        "fr": "Volcan Irazú"
      },
      "lugar": {
        "es": "Excursión de medio día",
        "en": "Half-day trip",
        "fr": "Excursion d'une demi-journée"
      },
      "texto": {
        "es": "El volcán más alto del país, a una hora y media. La entrada se compra antes en línea. Lleva abrigo: arriba hace frío.",
        "en": "The country's highest volcano, an hour and a half away. Tickets are bought online in advance. Bring a jacket: it's cold at the top.",
        "fr": "Le plus haut volcan du pays, à une heure et demie. L'entrée s'achète à l'avance en ligne. Prenez une veste : il fait froid en haut."
      },
      "consulta": "Parque Nacional Volcán Irazú Costa Rica"
    },
    {
      "emoji": "🦋",
      "etiquetas": [
        "excursion",
        "ninos"
      ],
      "nombre": {
        "es": "La Paz Waterfall Gardens",
        "en": "La Paz Waterfall Gardens",
        "fr": "La Paz Waterfall Gardens"
      },
      "lugar": {
        "es": "Excursión de medio día · Para niños",
        "en": "Half-day trip · For kids",
        "fr": "Excursion d'une demi-journée · Pour les enfants"
      },
      "texto": {
        "es": "Cataratas, mariposario, aves y colibríes, a una hora y media.",
        "en": "Waterfalls, a butterfly garden, birds and hummingbirds, an hour and a half away.",
        "fr": "Cascades, jardin de papillons, oiseaux et colibris, à une heure et demie."
      },
      "consulta": "La Paz Waterfall Gardens Costa Rica"
    }
  ];
  const FILTROS = [["todos", {"es": "Todos", "en": "All", "fr": "Tous"}], ["cerca", {"es": "Cerca de la sala", "en": "Near the venue", "fr": "Près de la salle"}], ["centro", {"es": "En el centro de San José", "en": "In downtown San José", "fr": "Dans le centre de San José"}], ["ninos", {"es": "Para niños", "en": "For kids", "fr": "Pour les enfants"}], ["techo", {"es": "Si llueve", "en": "If it rains", "fr": "S'il pleut"}], ["excursion", {"es": "Excursión de medio día", "en": "Half-day trip", "fr": "Excursion d'une demi-journée"}]];
  const TEXTOS = {"mapa": {"es": "Ver en el mapa →", "en": "See on the map →", "fr": "Voir sur la carte →"}, "llegar": {"es": "Cómo llegar →", "en": "Directions →", "fr": "Itinéraire →"}, "mostrar": {"es": "Mostrar", "en": "Show", "fr": "Afficher"}, "otra": {"es": " (se abre en otra pestaña)", "en": " (opens in a new tab)", "fr": " (s’ouvre dans un nouvel onglet)"}};
  const el = (tag, clase, texto) => { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; };
  const mapa = (q, ruta) => "https://www.google.com/maps/" + ruta + encodeURIComponent(q).replace(/%20/g, "+");

  let filtro = "todos";
  function pintar(caja, idioma) {
    const t = (o) => o[idioma] || o.es;
    caja.textContent = "";
    const grupo = el("div", "flex flex-wrap gap-2"); grupo.setAttribute("role", "group"); grupo.setAttribute("aria-label", t(TEXTOS.mostrar));
    const ul = el("ul", "mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-4");
    const aplicar = () => {
      grupo.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.filtro === filtro ? "true" : "false"));
      ul.querySelectorAll("li").forEach((li) => { li.hidden = filtro !== "todos" && li.dataset.etiquetas.split(" ").indexOf(filtro) === -1; });
    };
    FILTROS.forEach(([k, nombre]) => {
      const b = el("button", "paseo-filtro", t(nombre)); b.type = "button"; b.dataset.filtro = k;
      b.addEventListener("click", () => { filtro = k; aplicar(); });
      grupo.append(b);
    });
    LISTA.forEach((p) => {
      const li = el("li", "paseo"); li.dataset.etiquetas = p.etiquetas.join(" ");
      const h = el("h3", "font-bold text-lg"); const e = el("span", "", p.emoji + " "); e.setAttribute("aria-hidden", "true"); h.append(e, t(p.nombre));
      const enlaces = el("p", "mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold");
      [[TEXTOS.mapa, "search/?api=1&query="], [TEXTOS.llegar, "dir/?api=1&destination="]].forEach(([txt, ruta]) => {
        const a = el("a", "underline underline-offset-2 hover:no-underline", t(txt));
        a.href = mapa(p.consulta, ruta); a.target = "_blank"; a.rel = "noopener";
        a.append(el("span", "sr-only", " " + t(p.nombre) + t(TEXTOS.otra)));
        enlaces.append(a);
      });
      li.append(h, el("p", "mt-1 text-xs font-bold paseo-etiquetas", t(p.lugar)), el("p", "mt-2 text-sm", t(p.texto)), enlaces);
      ul.append(li);
    });
    caja.append(grupo, ul);
    aplicar();
  }
  return { pintar, LISTA };
})();

/*! rev bfb5bbb0d2d82f9f */
