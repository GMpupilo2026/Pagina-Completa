/* ===== Ajedrez Integral — El avatar del profe Oscar =====
 *
 * La caricatura del profe Oscar, en todas sus poses y caras: UNA lista para
 * todo el sitio. Hoy la usan los stickers de la clase en vivo
 * (js/clase-stickers.js) y la invitación a elegir un tema de la vitrina de
 * Herramientas (js/herramientas-arbitraje-pagina.js, «a-repasar») y las
 * aclaraciones del profe en las grabaciones del taller (js/calendario-taller.js,
 * «arbitro» y «atencion»); lo que
 * venga después (el panel, los avisos, los documentos) la toma de acá.
 *
 * - Los originales, en alta resolución y sin fondo, viven en
 *   herramientas/avatar-profe-oscar/originales/<id>.png (no se publican; ver
 *   .assetsignore). Son la copia buena: de ahí sale todo lo demás.
 * - La versión para la página, img/avatar-profe-oscar/<id>.webp (480 px de
 *   alto), la genera herramientas/avatar-profe-oscar.py y no se edita a mano.
 * - frase: lo que dice cuando sale como sticker en la clase; null = no es un
 *   sticker (una pose de presentación, de espalda, una escena).
 *
 * Todos llevan su lunar en la mejilla, la arruga entre las cejas y el logo
 * blanco de Ajedrez Integral en la camisa (salvo de espalda, de lado o con la
 * mochila). Los tableros de «tablero-italiana» y «clase-en-linea» son la
 * Italiana de verdad (comprobada con chess.js); los de «jugando» y
 * «ensenando» son de adorno, en perspectiva, sin una posición que se lea.
 *
 * Ver «El avatar del profe Oscar» en docs/decisiones/clase-en-vivo.md.
 */
(function () {
  "use strict";

  const LISTA = [
    // Las caras: para decir algo.
    { id: "muy-bien", frase: "¡Muy bien!", alt: "El profe Oscar guiñando un ojo, con los dos pulgares arriba" },
    { id: "bien-hecho", frase: "¡Bien hecho!", alt: "El profe Oscar con el pulgar arriba" },
    { id: "excelente", frase: "¡Excelente!", alt: "El profe Oscar saltando de alegría" },
    { id: "lo-lograron", frase: "¡Todo el grupo lo logró!", alt: "El profe Oscar aplaudiendo entre confeti" },
    { id: "felicidades", frase: "¡Felicidades!", alt: "El profe Oscar con una medalla y un diploma" },
    { id: "campeones", frase: "¡Campeones!", alt: "El profe Oscar levantando un trofeo" },
    { id: "que-jugadon", frase: "¡Qué jugadón!", alt: "El profe Oscar maravillado, con los brazos arriba entre destellos" },
    { id: "wow", frase: "¡Wow!", alt: "El profe Oscar sorprendido, con las manos en la cara" },
    { id: "tu-puedes", frase: "¡Tú puedes!", alt: "El profe Oscar con el puño adelante, dando ánimo" },
    { id: "esfuerzate", frase: "¡Esfuérzate más!", alt: "El profe Oscar serio, con las manos en la cintura" },
    { id: "vagabundo", frase: "Tan vagabundo", alt: "El profe Oscar de brazos cruzados, mirando hacia arriba con media sonrisa" },
    { id: "burlon", frase: "¿Vas a jugar esa?", alt: "El profe Oscar con cara burlona, la mano en la barbilla y señalando al frente" },
    { id: "pobrecillo", frase: "Pobrecillo", alt: "El profe Oscar con cara triste, la mano en el pecho" },
    { id: "casi", frase: "¡Casi! Faltó poquito", alt: "El profe Oscar haciendo «un poquito» con los dedos" },
    { id: "esa-no-es", frase: "Esa no es…", alt: "El profe Oscar diciendo que no con el dedo" },
    { id: "esa-vara", frase: "¿Y esa vara?", alt: "El profe Oscar extrañado, rascándose la cabeza" },
    { id: "no-puede-ser", frase: "¡No puede ser!", alt: "El profe Oscar con la mano en la frente" },
    { id: "mmm", frase: "Mmmm…", alt: "El profe Oscar pensativo, tocándose la barba" },
    { id: "idea", frase: "¡Tengo una idea!", alt: "El profe Oscar pensando, con un bombillo encendido" },
    { id: "atencion", frase: "¡Atención!", alt: "El profe Oscar con el dedo índice arriba" },
    { id: "silencio", frase: "Silencio, a concentrarse", alt: "El profe Oscar pidiendo silencio con el dedo en la boca" },
    { id: "tiempo", frase: "¡Se acaba el tiempo!", alt: "El profe Oscar mirando su reloj, apurado" },
    { id: "te-toca", frase: "¡Te toca a ti!", alt: "El profe Oscar señalando al frente" },
    { id: "dormidos", frase: "¿Se durmieron?", alt: "El profe Oscar bostezando" },
    { id: "risa", frase: "¡Jajaja!", alt: "El profe Oscar riéndose a carcajadas" },
    { id: "a-repasar", frase: "A repasar la teoría", alt: "El profe Oscar leyendo un libro de ajedrez" },
    { id: "brazos-cruzados", frase: "Estoy esperando…", alt: "El profe Oscar de brazos cruzados, sonriendo" },
    { id: "caballo", frase: "¡Ojo con el caballo!", alt: "El profe Oscar mostrando un caballo de ajedrez" },
    { id: "reloj-de-ajedrez", frase: "¡Aprieta el reloj!", alt: "El profe Oscar mostrando un reloj de ajedrez digital" },
    { id: "arbitro", frase: "Revisemos las reglas", alt: "El profe Oscar de árbitro, con su gafete" },
    { id: "presentando", frase: "Les presento…", alt: "El profe Oscar presentando con la mano abierta" },
    { id: "hola", frase: "¡Hola, grupo!", alt: "El profe Oscar saludando con la mano" },
    { id: "bienvenidos", frase: "¡Bienvenidos a la clase!", alt: "El profe Oscar con los brazos abiertos" },
    { id: "gracias", frase: "¡Gracias por la clase!", alt: "El profe Oscar haciendo un corazón con las manos" },
    { id: "nos-vemos", frase: "¡Nos vemos la próxima clase!", alt: "El profe Oscar despidiéndose con la mochila al hombro" },
    // Las poses y escenas: para ilustrar.
    { id: "frente", frase: null, alt: "El profe Oscar de frente, con las manos en los bolsillos" },
    { id: "tres-cuartos", frase: null, alt: "El profe Oscar de tres cuartos" },
    { id: "espalda", frase: null, alt: "El profe Oscar de espalda" },
    { id: "cara", frase: null, alt: "La cara del profe Oscar sonriendo" },
    { id: "tablero-italiana", frase: null, alt: "El profe Oscar señalando la Apertura Italiana en un tablero mural" },
    { id: "laptop", frase: null, alt: "El profe Oscar pensando frente a su computadora" },
    { id: "clase-en-linea", frase: null, alt: "El profe Oscar dando clase en línea, con audífonos y la Apertura Italiana en la pantalla" },
    { id: "jugando", frase: null, alt: "El profe Oscar jugando una partida, con el reloj al lado" },
    { id: "ensenando", frase: null, alt: "El profe Oscar enseñándole ajedrez a un niño" },
  ];
  const ALTO = 480;   // alto de la versión para la página, en píxeles

  /* ── Qué profe se ve ─────────────────────────────────────────────────────
     Los mismos 44 dibujos (los mismos id y las mismas frases) existen para
     cada profe, cada uno en su carpeta. Quien es de una academia con su
     propio profe lo ve a él en vez del profe Oscar: hoy, CCDR POCOCI ve a la
     profe Pame. Se decide por el id de la academia (el nombre puede cambiar).

     La academia sale de la marca que js/marca-academia.js guarda en el
     navegador (academia_marca_v1, con el id de la cuenta que la recibió):
     se lee de forma síncrona, porque los dibujos se pintan apenas carga la
     página. La marca solo existe para quien es de UNA academia; quien es de
     varias, quien no tiene sesión o quien abre la primera página antes de que
     llegue la marca ve al profe Oscar, que es lo de siempre. */
  const PROFES = {
    oscar: { carpeta: "img/avatar-profe-oscar", nombre: "El profe Oscar" },
    pame: { carpeta: "img/avatar-profe-pame", nombre: "La profe Pame" },
  };
  const PROFE_DE_ACADEMIA = {
    "9b224c6b-c9aa-403c-bb20-2aeb897cc8d4": "pame",   // CCDR POCOCI
  };
  // El texto alternativo de la profe Pame: el del profe Oscar con su nombre,
  // salvo donde el dibujo es distinto (ella no tiene barba, es árbitra…).
  const ALT_PAME = {
    mmm: "La profe Pame pensativa, con la mano en la barbilla",
    arbitro: "La profe Pame de árbitra, con su gafete y una tabla de planillas",
    ensenando: "La profe Pame enseñándole ajedrez a una niña",
    "lo-lograron": "La profe Pame aplaudiendo entre confeti",
  };

  function uidDeLaSesion(ls) {
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (!/^sb-.*-auth-token$/.test(k || "")) continue;
      const s = JSON.parse(ls.getItem(k) || "null");
      return (s && s.user && s.user.id) || null;
    }
    return null;
  }

  /* El profe que le toca a quien mira ("oscar" o "pame"). */
  function profeQueSeVe() {
    try {
      const ls = window.localStorage;
      const g = JSON.parse(ls.getItem("academia_marca_v1") || "null");
      const academia = g && g.marca && g.marca.academia_id;
      // La marca guardada es de la cuenta que la recibió: otra cuenta en la
      // misma computadora no hereda el profe de la anterior.
      if (!academia || g.uid !== uidDeLaSesion(ls)) return "oscar";
      return PROFE_DE_ACADEMIA[academia] || "oscar";
    } catch (e) { return "oscar"; }
  }

  const PROFE = profeQueSeVe();
  const altDe = (a, profe) => profe === "pame"
    ? ALT_PAME[a.id] || a.alt.replace("El profe Oscar", "La profe Pame").replace("del profe Oscar", "de la profe Pame")
    : a.alt;
  const conSuAlt = (a) => (a ? Object.assign({}, a, { alt: altDe(a, PROFE) }) : null);

  const ruta = (id) => PROFES[PROFE].carpeta + "/" + id + ".webp";
  const porId = (id) => conSuAlt(LISTA.find((a) => a.id === id));
  const conFrase = () => LISTA.filter((a) => a.frase).map(conSuAlt);

  window.AvatarProfeOscar = { LISTA, ALTO, PROFES, PROFE_DE_ACADEMIA, PROFE, altDe, ruta, porId, conFrase };

  /* Lo que una página escrita a mano dice del profe Oscar, a quien ve a la
     profe Pame: un elemento con data-profe-pame="…" cambia su texto por ese
     (también el <title>), y una imagen con data-profe-pame-src="cara" pasa a
     ese dibujo de ella. Así la página sigue siendo HTML de siempre y el cambio
     vive en un solo lugar. Ver «La profe Pame en el resto de la plataforma»
     en docs/decisiones/clase-en-vivo.md. */
  function vestirPagina() {
    if (PROFE !== "pame") return;
    document.querySelectorAll("[data-profe-pame]").forEach((e) => { e.textContent = e.dataset.profePame; });
    document.querySelectorAll("img[data-profe-pame-src]").forEach((i) => {
      i.removeAttribute("srcset");
      i.src = ruta(i.dataset.profePameSrc);
      i.classList.remove("object-cover");
      i.classList.add("object-contain", "bg-white");
    });
  }
  if (typeof document !== "undefined" && document.querySelectorAll) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", vestirPagina);
    else vestirPagina();
  }
})();

/*! rev bfb5bbb0d2d82f9f */
