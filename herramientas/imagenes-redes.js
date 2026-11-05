/* Genera las imágenes de las redes sociales de Ajedrez Integral:
 *
 *   img/redes/portada-facebook.png   1640×624   foto de portada de Facebook
 *   img/redes/instagram.png          1080×1350  publicación de Instagram (4:5)
 *   img/redes/whatsapp/*.png         1080×1920  estados de WhatsApp (9:16): el sitio
 *   img/redes/whatsapp-academia/     1080×1920  la Academia por dentro
 *   img/redes/whatsapp-mesa-arbitro/ 1080×1920  la herramienta de mesas del árbitro (la del
 *                                    Centroamericano), con capturas de verdad: las saca
 *                                    capturas-centroamericano.js, que se corre antes
 *
 * Mismo criterio que og-imagen.js: se dibujan acá y no a mano para que salgan
 * siempre igual y con los colores de la paleta; si cambian, se vuelve a correr.
 *
 *   node herramientas/imagenes-redes.js        (necesita playwright)
 *
 * Cada red recorta lo que se le sube, y cada imagen dice qué franja queda
 * siempre a la vista (`seguro`). El script falla si algo del contenido se sale
 * de esa franja: fuera de ella solo hay fondo.
 *  - Facebook muestra la portada a 820×312 en la computadora (esto es el doble,
 *    para pantallas de alta densidad) y en el celular la recorta a 16:9 por el
 *    centro: se pierden unos 270 px de cada costado.
 *    Además, la foto de perfil de la página va ENCIMA de la portada (en el
 *    celular, un círculo centrado sobre la mitad de abajo): esas zonas van en
 *    `tapado`, y el script también falla si un texto cae debajo.
 *  - Instagram muestra la publicación 4:5 entera en el inicio, pero en la
 *    cuadrícula del perfil la recorta a 3:4 por el centro: unos 34 px de cada
 *    costado.
 *  - Los estados de WhatsApp se ven a pantalla completa, pero arriba van la
 *    barra de avance, el nombre y la hora, y abajo «Responder»: el contenido
 *    queda entre los 220 px de arriba y los 280 de abajo, con 60 a los
 *    costados. Llevan la marca de Ajedrez Integral (el caballo sin el nombre
 *    de Oscar, como todo lo que sale del sitio) y solo dicen lo que ya dice la
 *    portada: nada de cifras ni promesas que el sitio no haga.
 *
 * PNG y no JPEG: las dos redes recomprimen lo que se les sube, y un JPEG
 * recomprimido ensucia los bordes de las letras.
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CARPETA = path.join(RAIZ, "img", "redes");
const logo = fs.readFileSync(path.join(RAIZ, "img", "logo-oscar-angulo.png")).toString("base64");
const b64 = (...r) => fs.readFileSync(path.join(RAIZ, ...r)).toString("base64");
const { MARCA_AGUA } = require("./lib/marca-agua");
const marca = b64(MARCA_AGUA);

// Los mismos tokens que usa el sitio.
const C = {
    brand700: "#243b53", brand800: "#102a43", brand900: "#0a1f33",
    brand100: "#d9e2ec", brand300: "#9fb3c8", accent400: "#f0b429",
};

// Lo que comparten todas: fondo, tablero insinuado, brillo, textos y barra.
const BASE = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { overflow: hidden; font-family: Georgia, 'Times New Roman', serif; }
  .lienzo { position: relative; width: 100vw; height: 100vh;
            background: linear-gradient(135deg, ${C.brand800} 0%, ${C.brand700} 45%, ${C.brand900} 100%); }
  /* El tablero de fondo, apenas insinuado — el mismo guiño que la portada del sitio. */
  .tablero { position: absolute; inset: 0; opacity: 0.07;
             background-image:
               linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%),
               linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%);
             background-size: var(--casilla2) var(--casilla2);
             background-position: 0 0, var(--casilla) var(--casilla); }
  .brillo { position: absolute; width: 900px; height: 900px; left: 50%; top: 50%;
            transform: translate(-50%, -50%); border-radius: 50%;
            background: radial-gradient(circle, rgba(240,180,41,0.16), transparent 65%); }
  .contenido { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
  .logo { flex: none; filter: drop-shadow(0 6px 18px rgba(0,0,0,0.35)); }
  .nombre { line-height: 1; font-weight: 700; color: #fff; letter-spacing: -1.5px; }
  em { font-style: normal; color: ${C.accent400}; }
  .lema { line-height: 1.2; color: ${C.brand100}; }
  .sitio { display: inline-block; border-radius: 999px; background: ${C.accent400};
           color: ${C.brand900}; font-weight: 700; letter-spacing: 0.2px;
           font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .nota { color: ${C.brand300}; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .barra { position: absolute; left: 0; right: 0; bottom: 0; height: 14px;
           background: linear-gradient(90deg, ${C.brand700}, ${C.accent400} 30%, #de911d 70%, ${C.brand700}); }
`;

const LOGO = `<img class="logo" src="data:image/png;base64,${logo}" alt="">`;
const NOMBRE = `<div class="nombre">Ajedrez <em>Integral</em></div>`;
const LEMA = `<div class="lema">Clases de ajedrez <em>en vivo</em>,<br>no solo videos</div>`;
const SITIO = `<div class="sitio">ajedrez-integral.com</div>`;
const NOTA = `<div class="nota">Escuelas, colegios y familias &middot; Costa Rica</div>`;

const IMAGENES = [
    {
        archivo: "portada-facebook.png", ancho: 1640, alto: 624,
        seguro: { ancho: Math.round(624 * 16 / 9), alto: 624 },   // 1109×624
        // Lo que Facebook pone ENCIMA de la portada. En el celular, la foto de
        // perfil de la página es un círculo centrado que tapa la mitad de abajo
        // (medido en una captura real: centro a 86 % de la altura, radio del
        // 39 %, con 24 px de margen). En la computadora va abajo a la izquierda.
        tapado: [
            { circulo: { x: 820, y: 536, r: 270 } },
            { rect: { x: 0, y: 440, ancho: 560, alto: 184 } },
        ],
        css: `
          .lienzo { --casilla: 52px; --casilla2: 104px; }
          .contenido { width: 1109px; height: 624px; }
          .arriba { position: absolute; top: 26px; left: 0; right: 0; text-align: center; }
          .nombre { font-size: 84px; }
          .lema { margin-top: 12px; font-size: 38px; }
          .sitio { margin-top: 18px; padding: 8px 26px; font-size: 32px; }
          .lado { position: absolute; top: 300px; width: 250px; font-size: 27px; line-height: 1.35; }
          .lado b { display: block; color: #fff; font-size: 30px; }
          .izq { left: 20px; text-align: right; }
          .der { right: 20px; text-align: left; }`,
        cuerpo: `<div class="arriba">${NOMBRE}
                   <div class="lema">Clases de ajedrez <em>en vivo</em>, no solo videos</div>${SITIO}</div>
                 <div class="nota lado izq"><b>Oscar Angulo</b>Entrenador FIDE</div>
                 <div class="nota lado der"><b>Costa Rica</b>Escuelas, colegios y familias</div>`,
    },
    {
        archivo: "instagram.png", ancho: 1080, alto: 1350,
        seguro: { ancho: Math.round(1350 * 3 / 4), alto: 1350 },  // 1013×1350
        css: `
          .lienzo { --casilla: 67.5px; --casilla2: 135px; }
          .contenido { width: 1013px; padding: 0 60px; text-align: center; margin-top: -10px; }
          .logo { width: 560px; }
          .nombre { margin-top: 56px; font-size: 104px; }
          .lema { margin-top: 30px; font-size: 52px; }
          .sitio { margin-top: 52px; padding: 18px 40px; font-size: 48px; }
          .nota { margin-top: 30px; font-size: 32px; }
          .barra { height: 18px; }`,
        cuerpo: `${LOGO}${NOMBRE}${LEMA}${SITIO}${NOTA}`,
    },
];


// --- Estados de WhatsApp (1080×1920) ---------------------------------------
// Las fuentes del sitio, para que no dependan de lo que tenga instalado la
// máquina que corre el script.
const FUENTES = `
  @font-face { font-family: 'Merriweather'; font-weight: 700;
               src: url(data:font/woff2;base64,${b64("fonts", "merriweather-700-latin.woff2")}) format('woff2'); }
  @font-face { font-family: 'Inter'; font-weight: 100 900;
               src: url(data:font/woff2;base64,${b64("fonts", "inter-variable-latin.woff2")}) format('woff2'); }`;
const CREMA = "#f7e7c4";
const ESTADO_CSS = `${FUENTES}
  body { font-family: 'Inter', system-ui, sans-serif; }
  .lienzo { --casilla: 67.5px; --casilla2: 135px; }
  .brillo { width: 1300px; height: 1300px; }
  .contenido { top: 220px; left: 60px; transform: none; width: 960px; height: 1420px;
               display: flex; flex-direction: column; align-items: center; text-align: center; }
  /* La marca de Ajedrez Integral, pintada en crema con su propio dibujo de máscara. */
  .marca { flex: none; width: 300px; height: 223px; background: ${CREMA};
           -webkit-mask: url(data:image/png;base64,${marca}) center / contain no-repeat;
                   mask: url(data:image/png;base64,${marca}) center / contain no-repeat;
           filter: drop-shadow(0 6px 18px rgba(0,0,0,0.35)); }
  .marca.grande { width: 620px; height: 460px; }
  .medio { flex: 1; padding: 36px 0; display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; }
  .etiqueta { display: inline-block; border: 3px solid ${C.accent400}; color: ${C.accent400}; border-radius: 999px;
              padding: 10px 30px; font-size: 34px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  .titulo { font-family: 'Merriweather', Georgia, serif; color: #fff; font-size: 84px; line-height: 1.12;
            letter-spacing: -1px; margin-top: 34px; }
  .texto { color: ${C.brand100}; font-size: 42px; line-height: 1.35; margin-top: 34px; }
  .lista { list-style: none; margin-top: 44px; width: 100%; text-align: left; }
  .lista li { display: flex; align-items: center; gap: 30px; padding: 22px 34px; margin-top: 18px;
              border-radius: 26px; background: rgba(10,31,51,0.55); border: 2px solid rgba(240,180,41,0.25); }
  .lista .num { flex: none; width: 74px; height: 74px; border-radius: 50%; background: ${C.accent400};
                color: ${C.brand900}; font-size: 40px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
  .lista.compacta { margin-top: 26px; }
  .lista.compacta li { padding: 16px 30px; margin-top: 14px; }
  .lista .punto { flex: none; width: 34px; height: 34px; margin: 0 20px; border-radius: 8px; background: ${C.accent400};
                  transform: rotate(45deg); }
  .lista b { display: block; color: #fff; font-size: 40px; line-height: 1.2; }
  .lista span.d { display: block; color: ${C.brand100}; font-size: 31px; line-height: 1.3; margin-top: 4px; }
  .datos { display: flex; justify-content: center; gap: 22px; margin-top: 46px; }
  .datos div { background: rgba(10,31,51,0.55); border: 2px solid rgba(240,180,41,0.25); border-radius: 26px;
               padding: 24px 26px; min-width: 250px; }
  .datos b { display: block; color: ${C.accent400}; font-family: 'Merriweather', Georgia, serif; font-size: 66px; line-height: 1.1; }
  .datos span { display: block; color: ${C.brand100}; font-size: 30px; margin-top: 6px; }
  .pie { display: flex; flex-direction: column; align-items: center; }
  .sitio { white-space: nowrap; padding: 20px 46px; font-size: 50px; font-family: 'Inter', system-ui, sans-serif; font-weight: 800; }
  .sitio.larga { font-size: 40px; padding: 20px 36px; }
  .sitio.muy-larga { font-size: 34px; padding: 20px 30px; }
  .ruta { color: ${C.brand100}; font-size: 34px; margin-top: 22px; }
  .ruta b { color: #fff; }
  .nombre { font-family: 'Merriweather', Georgia, serif; }
  .barra { height: 22px; }
  /* Cuatro tarjetas de dos en dos. */
  .tarjetas { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; width: 100%; margin-top: 44px; text-align: left; }
  .tarjetas div { background: rgba(10,31,51,0.55); border: 2px solid rgba(240,180,41,0.25); border-radius: 26px; padding: 28px 30px; }
  .tarjetas b { display: block; color: ${C.accent400}; font-size: 40px; line-height: 1.15; }
  .tarjetas span { display: block; color: ${C.brand100}; font-size: 30px; line-height: 1.3; margin-top: 10px; }
  /* Los tres resultados de una mesa, como botones. */
  .resultados { display: flex; gap: 22px; margin-top: 46px; }
  .resultados span { min-width: 220px; padding: 26px 0; border-radius: 26px; font-size: 64px; font-weight: 800;
                     background: rgba(10,31,51,0.55); border: 3px solid ${C.accent400}; color: #fff; }
  .resultados span.marcado { background: ${C.accent400}; color: ${C.brand900}; }
  .lista .d b { display: inline; font-size: inherit; color: #fff; }
  /* Una captura de la herramienta, en el marco de una tableta. */
  .pantalla { margin-top: 36px; width: 100%; padding: 16px; border-radius: 34px; background: #0a1420;
              box-shadow: 0 20px 50px rgba(0,0,0,0.5), 0 0 0 2px rgba(240,180,41,0.35); }
  .pantalla img { display: block; width: 100%; border-radius: 20px; background: #fff; }
  .pantalla img + img { margin-top: 14px; }
  .pantalla.angosta { width: 78%; margin-top: 24px; }
  .pantalla.estrecha { width: 68%; margin-top: 24px; }
  .ejemplo { color: ${C.brand300}; font-size: 26px; margin-top: 16px; }
  .marca.chica { width: 220px; height: 163px; }`;

const PIE = (ruta, frase) => `<div class="pie"><div class="sitio${(ruta || "").length > 20 ? " muy-larga" : (ruta || "").length > 10 ? " larga" : ""}">ajedrez-integral.com${ruta || ""}</div>
  <div class="ruta">${frase || "WhatsApp"} <b>+506 8309-2291</b></div></div>`;
const CABEZA = `<div class="marca"></div>`;

const ESTADOS = [
    {
        archivo: "01-clases-en-vivo.png",
        cuerpo: `<div class="medio"><div class="marca grande"></div>
            <div class="nombre" style="font-size:112px;margin-top:40px">Ajedrez <em>Integral</em></div>
            <div class="titulo" style="font-size:66px;color:${C.brand100}">Clases de ajedrez <em>en vivo</em>,<br>no solo videos</div>
            <div class="texto">Para escuelas, colegios y familias<br>desde Costa Rica</div></div>${PIE()}`,
    },
    {
        archivo: "02-que-recibe.png",
        cuerpo: `${CABEZA}<div class="medio"><div class="titulo" style="margin-top:0;font-size:72px">Qué recibe<br>cada <em>estudiante</em></div>
            <ul class="lista compacta">
              <li><span class="punto" aria-hidden="true"></span><div><b>Clases en vivo</b><span class="d">Preguntas y el profe te responde al momento</span></div></li>
              <li><span class="punto" aria-hidden="true"></span><div><b>Informes para la familia</b><span class="d">El avance con datos, sin adivinar</span></div></li>
              <li><span class="punto" aria-hidden="true"></span><div><b>Práctica entre clases</b><span class="d">Coordenadas, cálculo a ciegas y táctica</span></div></li>
              <li><span class="punto" aria-hidden="true"></span><div><b>Una ruta por niveles</b><span class="d">De los fundamentos a los torneos</span></div></li>
              <li><span class="punto" aria-hidden="true"></span><div><b>Partidas contra el motor</b><span class="d">Tres niveles, sin límite de partidas</span></div></li>
            </ul></div>${PIE()}`,
    },
    {
        archivo: "03-diagnostico.png",
        cuerpo: `${CABEZA}<div class="medio"><div class="etiqueta">Gratis y sin cuenta</div>
            <div class="titulo">¿En qué nivel<br>estás <em>de verdad</em>?</div>
            <div class="texto">Al terminar sabes tu fuerza estimada<br>en puntos Elo, qué área mejorar<br>y por dónde empezar.</div>
            <div class="datos"><div><b>60</b><span>preguntas</span></div><div><b>9</b><span>áreas del juego</span></div><div><b>20</b><span>minutos, más o menos</span></div></div>
            </div>${PIE("/entreno/diagnostico")}`,
    },
    {
        archivo: "04-accesible.png",
        cuerpo: `${CABEZA}<div class="medio"><div class="etiqueta">Ajedrez para todos</div>
            <div class="titulo">Accesible para<br>estudiantes <em>ciegos</em><br>y con baja visión</div>
            <div class="texto">El tablero y el entrenamiento funcionan<br>con lector de pantalla y notación hablada.</div>
            <div class="texto" style="color:#fff">Las mismas clases, el mismo<br>entrenamiento, para todo el grupo.</div>
            </div>${PIE()}`,
    },
    {
        archivo: "05-tres-pasos.png",
        cuerpo: `${CABEZA}<div class="medio"><div class="titulo" style="margin-top:0">Tres pasos<br>para <em>empezar</em></div>
            <ul class="lista">
              <li><span class="num">1</span><div><b>Escríbenos por WhatsApp</b><span class="d">La edad y el nivel del estudiante, o si es para un grupo escolar</span></div></li>
              <li><span class="num">2</span><div><b>Te damos tu acceso</b><span class="d">Clases en vivo, cursos, entrenamiento e informes en un mismo lugar</span></div></li>
              <li><span class="num">3</span><div><b>Asiste, practica y mejora</b><span class="d">Y revisas tu avance real en Informes</span></div></li>
            </ul></div>${PIE()}`,
    },
    {
        archivo: "06-contra-el-profe.png",
        cuerpo: `${CABEZA}<div class="medio"><div class="etiqueta">Cuando no hay clase</div>
            <div class="titulo">Juega contra<br><em>Oscar</em>, nuestro motor</div>
            <div class="datos"><div><b>3</b><span>niveles de dificultad</span></div><div><b>∞</b><span>partidas, sin límite</span></div></div>
            <div class="texto">Para seguir practicando<br>entre una clase y otra.</div>
            </div>${PIE("/bot")}`,
    },
    {
        archivo: "07-pareo-integral.png",
        cuerpo: `${CABEZA}<div class="medio"><div class="etiqueta">Para quien arbitra</div>
            <div class="titulo">¿Organizas<br>un <em>torneo</em>?</div>
            <div class="texto">Emparéjalo gratis con el<br><b style="color:#fff">Sistema Holandés de FIDE</b><br>en Pareo Integral.</div>
            <div class="texto">Sin cuenta y en el navegador.</div>
            </div>${PIE("/pareo")}`,
    },
];

// La Academia por dentro: lo que dice la documentación de cada pieza
// (docs/decisiones/), sin cifras que el sitio no tenga.
const PRUEBA = "3 días gratis por WhatsApp";
const ACADEMIA = [
    {
        archivo: "01-la-academia.png",
        cuerpo: `${CABEZA}<div class="medio"><div class="etiqueta">La Academia por dentro</div>
            <div class="titulo">Todo tu ajedrez<br>en <em>un solo lugar</em></div>
            <div class="tarjetas">
              <div><b>Clases en vivo</b><span>El tablero de la clase, la videollamada y el chat</span></div>
              <div><b>Entrenamiento</b><span>Ejercicios, finales, aperturas y juegos</span></div>
              <div><b>Informes</b><span>El avance de cada estudiante, con datos</span></div>
              <div><b>Puntos y premios</b><span>Se ganan en clase y entrenando</span></div>
            </div></div>${PIE("", PRUEBA)}`,
    },
    {
        archivo: "02-clase-en-vivo.png",
        cuerpo: `${CABEZA}<div class="medio"><div class="etiqueta">Clase en vivo</div>
            <div class="titulo" style="font-size:72px;margin-top:26px">El profe mueve,<br><em>toda la clase</em> lo ve</div>
            <ul class="lista compacta">
              <li><span class="punto" aria-hidden="true"></span><div><b>Un tablero para todos</b><span class="d">Cada alumno sigue lo que mira el profe</span></div></li>
              <li><span class="punto" aria-hidden="true"></span><div><b>Preguntas con tiempo</b><span class="d">Cada uno contesta moviendo en su tablero</span></div></li>
              <li><span class="punto" aria-hidden="true"></span><div><b>La presentación y la pizarra</b><span class="d">El profe raya la diapositiva y todos la ven</span></div></li>
              <li><span class="punto" aria-hidden="true"></span><div><b>Videollamada y chat</b><span class="d">Sin salir de la página de la clase</span></div></li>
            </ul></div>${PIE("", PRUEBA)}`,
    },
    {
        archivo: "03-cuestionarios.png",
        cuerpo: `${CABEZA}<div class="medio"><div class="etiqueta">En plena clase</div>
            <div class="titulo">Cuestionarios<br>con <em>podio</em></div>
            <div class="texto">Toda la clase contesta a la vez.<br>Más puntos a quien acierta más rápido,<br>y el podio después de cada pregunta.</div>
            <div class="datos"><div><b>30</b><span>cuestionarios listos<br>por nivel</span></div><div><b>1.º</b><span>quien acierta<br>primero</span></div></div>
            </div>${PIE("", PRUEBA)}`,
    },
    {
        archivo: "04-entrenamiento.png",
        cuerpo: `${CABEZA}<div class="medio"><div class="etiqueta">Entre una clase y otra</div>
            <div class="titulo" style="font-size:72px;margin-top:26px">Entrena<br><em>a tu ritmo</em></div>
            <ul class="lista compacta">
              <li><span class="punto" aria-hidden="true"></span><div><b>El repaso del día</b><span class="d">Lo que te toca repasar, en un recorrido</span></div></li>
              <li><span class="punto" aria-hidden="true"></span><div><b>Finales contra la máquina</b><span class="d">Juega el final y aprende a ganarlo</span></div></li>
              <li><span class="punto" aria-hidden="true"></span><div><b>Mi repertorio</b><span class="d">Tus aperturas, en un árbol de jugadas</span></div></li>
              <li><span class="punto" aria-hidden="true"></span><div><b>Juegos de ajedrez</b><span class="d">Batalla naval, buscaminas y memoria</span></div></li>
            </ul></div>${PIE("", PRUEBA)}`,
    },
    {
        archivo: "05-puntos.png",
        cuerpo: `${CABEZA}<div class="medio"><div class="etiqueta">Puntos Ajedrez</div>
            <div class="titulo">Cada esfuerzo<br><em>suma</em></div>
            <div class="texto">Se ganan en la clase, entrenando,<br>con las tareas, los exámenes<br>y la racha de días.</div>
            <div class="tarjetas">
              <div><b>Títulos y marcos</b><span>Para tu perfil</span></div>
              <div><b>Accesorios</b><span>Gorros, lentes, una corona… para tu avatar</span></div>
            </div></div>${PIE("", PRUEBA)}`,
    },
    {
        archivo: "06-informes.png",
        cuerpo: `${CABEZA}<div class="medio"><div class="etiqueta">Para la familia</div>
            <div class="titulo" style="font-size:72px;margin-top:26px">El avance,<br><em>con datos</em></div>
            <ul class="lista compacta">
              <li><span class="punto" aria-hidden="true"></span><div><b>Asistencia</b><span class="d">Y el tiempo conectado a cada clase</span></div></li>
              <li><span class="punto" aria-hidden="true"></span><div><b>Antes y ahora</b><span class="d">La fuerza en cada diagnóstico</span></div></li>
              <li><span class="punto" aria-hidden="true"></span><div><b>El Elo oficial</b><span class="d">FIDE y Nacional, mes a mes</span></div></li>
              <li><span class="punto" aria-hidden="true"></span><div><b>Unas palabras del profe</b><span class="d">En el informe que llega a la casa</span></div></li>
            </ul></div>${PIE("", PRUEBA)}`,
    },
];

// La herramienta de mesas del árbitro, la del Centroamericano (centroamericano-arbitro.html en la
// tableta de cada árbitro y centroamericano-mesas.html en la organización), con pantallas de verdad.
// Va con la licencia de la Mesa del árbitro, que se pide por WhatsApp.
const LICENCIA = "Pide tu licencia por WhatsApp";
const CAPTURAS = path.join(RAIZ, "img", "redes", "capturas", "centroamericano");
const captura = (nombre) => {
    const archivo = path.join(CAPTURAS, nombre);
    if (!fs.existsSync(archivo)) {
        console.error(`Falta ${path.relative(RAIZ, archivo)}: corre antes node herramientas/capturas-centroamericano.js`);
        process.exit(1);
    }
    return `<img src="data:image/png;base64,${fs.readFileSync(archivo).toString("base64")}" alt="">`;
};
const EJEMPLO = `<div class="ejemplo">Pantallas reales de la herramienta, con un torneo de ejemplo</div>`;
const CHICA = `<div class="marca chica"></div>`;
const ESTADO_MESA = (etiqueta, titulo, texto, pantallas) => `${CHICA}<div class="medio"><div class="etiqueta">${etiqueta}</div>
    <div class="titulo" style="font-size:64px;margin-top:22px">${titulo}</div>
    ${texto ? `<div class="texto" style="font-size:34px;margin-top:16px">${texto}</div>` : ""}
    ${pantallas}${EJEMPLO}</div>${PIE("/herramientas-arbitraje", LICENCIA)}`;
const MESA = [
    {
        archivo: "01-la-tablet.png",
        cuerpo: ESTADO_MESA("En la tablet del árbitro", "Cada árbitro,<br><em>sus mesas</em>",
            "Entra con su QR, sin cuenta.",
            `<div class="pantalla estrecha">${captura("arbitro-pantalla.png")}</div>`),
    },
    {
        archivo: "02-el-resultado.png",
        cuerpo: ESTADO_MESA("Mesa por mesa", "El resultado,<br>directo a <em>chess-results</em>",
            "Cada mesa con su «Guardar» al lado.<br>Solo dice «guardado» si ya está allá.",
            `<div class="pantalla estrecha">${captura("arbitro-mesas.png")}</div>`),
    },
    {
        archivo: "03-antes-de-la-ronda.png",
        cuerpo: ESTADO_MESA("Antes de la ronda", "Relojes y tableros,<br><em>revisados</em>",
            "Hasta aprobar los dos pasos<br>no se guarda ningún resultado.",
            `<div class="pantalla">${captura("arbitro-lista-previa.png")}</div>`),
    },
    {
        archivo: "04-la-organizacion.png",
        cuerpo: ESTADO_MESA("Para la organización", "Toda la ronda,<br><em>en una pantalla</em>",
            "Cuánto le queda a cada árbitro, si está<br>conectado y el reporte de la ronda en PDF.",
            `<div class="pantalla">${captura("organizacion-ronda.png")}</div>`),
    },
    {
        archivo: "05-pedidos-de-ayuda.png",
        cuerpo: ESTADO_MESA("Sin correr por la sala", "Piden ayuda<br>y te <em>llega sola</em>",
            "Con la mesa y el motivo. Sin sonido:<br>en un torneo no hay ruido.",
            `<div class="pantalla">${captura("organizacion-pedidos.png")}</div>`),
    },
    {
        archivo: "06-arbitros-y-mesas.png",
        cuerpo: ESTADO_MESA("Árbitros y mesas", "Cada árbitro con<br><em>su enlace y su QR</em>",
            "Las mesas de cada uno, si ya se conectó<br>y los avisos que tiene abiertos.",
            `<div class="pantalla">${captura("organizacion-arbitros.png")}</div>`),
    },
];
for (const e of ACADEMIA) e.carpeta = "whatsapp-academia";
for (const e of MESA) e.carpeta = "whatsapp-mesa-arbitro";
ESTADOS.push(...ACADEMIA, ...MESA);
for (const e of ESTADOS) {
    IMAGENES.push({
        archivo: (e.carpeta || "whatsapp") + "/" + e.archivo, ancho: 1080, alto: 1920,
        seguro: { ancho: 960, alto: 1420, arriba: 220 },
        css: ESTADO_CSS, cuerpo: e.cuerpo,
    });
}

// Ningún color a ojo: cada par de texto y fondo de los estados, medido contra
// el tono MÁS CLARO del degradado (brand700), que es el peor caso.
{
    const lum = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    for (const [texto, fondo, que] of [
        ["#ffffff", C.brand700, "títulos"], [C.accent400, C.brand700, "lo resaltado"],
        [C.brand100, C.brand700, "textos"], [C.brand900, C.accent400, "la dirección y los números"],
    ]) {
        const r = contraste(texto, fondo);
        if (r < 4.5) { console.error(`Contraste insuficiente en ${que}: ${r.toFixed(2)}`); process.exit(1); }
    }
}

(async () => {
    for (const img of IMAGENES) fs.mkdirSync(path.dirname(path.join(CARPETA, img.archivo)), { recursive: true });
    const navegador = await chromium.launch({
        executablePath: process.env.CHROME_PATH || undefined,
    });
    let error = false;
    for (const img of IMAGENES) {
        const pagina = await navegador.newPage({ viewport: { width: img.ancho, height: img.alto } });
        await pagina.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${BASE}${img.css}</style></head>
          <body><div class="lienzo"><div class="tablero"></div><div class="brillo"></div>
          <div class="contenido">${img.cuerpo}</div><div class="barra"></div></div></body></html>`,
            { waitUntil: "load" });
        await pagina.evaluate(() => document.fonts.ready);
        await pagina.waitForTimeout(400);
        // Nada que se lea puede quedar fuera de la franja que siempre se ve.
        const fuera = await pagina.evaluate((s) => {
            const izq = (innerWidth - s.ancho) / 2, arr = s.arriba ?? (innerHeight - s.alto) / 2;
            return [...document.querySelectorAll(".contenido *")]
                .map((el) => [el.className || el.tagName, el.getBoundingClientRect()])
                .filter(([, r]) => r.left < izq || r.right > izq + s.ancho
                                || r.top < arr || r.bottom > arr + s.alto)
                .map(([n]) => n);
        }, img.seguro);
        // …ni debajo de lo que la red le pone encima (la foto de perfil).
        const tapados = await pagina.evaluate((zonas) => {
            const choca = (r, z) => {
                if (z.rect) return r.left < z.rect.x + z.rect.ancho && r.right > z.rect.x
                                && r.top < z.rect.y + z.rect.alto && r.bottom > z.rect.y;
                const { x, y, r: radio } = z.circulo;   // el punto del rectángulo más cercano al centro
                const cx = Math.max(r.left, Math.min(x, r.right)), cy = Math.max(r.top, Math.min(y, r.bottom));
                return (cx - x) ** 2 + (cy - y) ** 2 < radio ** 2;
            };
            // Solo lo que lleva texto o imagen: una caja vacía puede pasar por detrás.
            return [...document.querySelectorAll(".contenido *")]
                .filter((el) => el.tagName === "IMG" || [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
                .flatMap((el) => [...el.getClientRects()].map((r) => [el.className || el.tagName, r]))
                .filter(([, r]) => zonas.some((z) => choca(r, z)))
                .map(([n]) => n);
        }, img.tapado || []);
        fuera.push(...tapados.map((n) => `${n} (queda bajo la foto de perfil)`));
        if (fuera.length) {
            console.error(`${img.archivo}: se sale de la franja que siempre se ve:`, fuera.join(", "));
            error = true;
        } else {
            const salida = path.join(CARPETA, img.archivo);
            await pagina.screenshot({ path: salida, type: "png" });
            const kb = Math.round(fs.statSync(salida).size / 1024);
            console.log(`img/redes/${img.archivo} lista — ${img.ancho}×${img.alto}, ${kb} KB`);
        }
        await pagina.close();
    }
    await navegador.close();
    if (error) process.exit(1);
})();

/*! rev bfb5bbb0d2d82f9f */
