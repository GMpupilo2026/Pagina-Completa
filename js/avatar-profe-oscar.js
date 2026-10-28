/* ===== Ajedrez Integral — El avatar del profe Oscar =====
 *
 * La caricatura del profe Oscar, en todas sus poses y caras: UNA lista para
 * todo el sitio. Hoy la usan los stickers de la clase en vivo
 * (js/clase-stickers.js); lo que venga después (el panel, los avisos, los
 * documentos) la toma de acá.
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
    { id: "wow", frase: "¡Wow!", alt: "El profe Oscar sorprendido, con las manos en la cara" },
    { id: "tu-puedes", frase: "¡Tú puedes!", alt: "El profe Oscar con el puño adelante, dando ánimo" },
    { id: "esfuerzate", frase: "¡Esfuérzate más!", alt: "El profe Oscar serio, con las manos en la cintura" },
    { id: "vagabundo", frase: "Tan vagabundo", alt: "El profe Oscar de brazos cruzados, mirando hacia arriba con media sonrisa" },
    { id: "burlon", frase: "¿Vas a jugar esa?", alt: "El profe Oscar con cara burlona, la mano en la barbilla y señalando al frente" },
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

  const ruta = (id) => "img/avatar-profe-oscar/" + id + ".webp";
  const porId = (id) => LISTA.find((a) => a.id === id) || null;
  const conFrase = () => LISTA.filter((a) => a.frase);

  window.AvatarProfeOscar = { LISTA, ALTO, ruta, porId, conFrase };
})();
