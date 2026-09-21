/* ===== El video promocional del sitio =====
 *
 * Arma un video de medio minuto largo con las pantallas de la plataforma, para
 * mandar por enlace (YouTube, WhatsApp, el correo a un colegio). No se edita a
 * mano en ninguna parte: el texto vive en `herramientas/video/guion.json` y
 * esto lo monta, así que corregir una frase es corregir una línea y volver a
 * correrlo. Misma decisión que el catálogo de cursos y la guía del profesor.
 *
 * **Las pantallas salen de `img/guia/`, y eso NO es por comodidad.** Esas
 * capturas las hace `guia-capturas.js` contra un Supabase de mentira, con
 * cuentas inventadas. Grabar la pantalla de verdad —con el celular, con OBS, o
 * abriendo la sesión de quien da clase— metería en un video que va a circular
 * por WhatsApp los nombres, los correos y el progreso de MENORES DE EDAD. No
 * hay ninguna versión de esto que se pueda arreglar después: el video ya salió.
 * Por eso el generador no sabe abrir el sitio; solo sabe leer esa carpeta.
 *
 * **La salida no se commitea** (`promo/`, que está en `.gitignore` y en
 * `.assetsignore`). Un mp4 pesa megabytes, sale distinto byte por byte en cada
 * corrida y el worker sirve TODO el directorio: dejarlo en el repositorio lo
 * publicaría en el sitio sin que nadie lo pidiera. Lo que vive acá es cómo se
 * arma. Es la misma decisión de `herramientas/planes/` y de `respaldos/`.
 *
 * **Y falla si le falta algo, en vez de apañarse.** Sin Inter usaría la fuente
 * que hubiera en la máquina y el video saldría con otra tipografía —se ve
 * perfecto, y se ve de otra empresa—; sin una captura, dejaría una escena en
 * negro que nadie mira hasta que está publicada. Es lo mismo que hace
 * `arbitraje-pdf.js` cuando le falta pypdf: borra el archivo y falla, antes que
 * entregar un PDF sin proteger.
 *
 * Cómo se corre (no necesita ni el sitio servido, ni red, ni navegador):
 *
 *     sudo apt-get install -y ffmpeg
 *     node herramientas/video-promo.js
 *
 * Con SOLO_ESCENA=3 se arma una sola escena, para mirarla sin esperar el
 * montaje entero.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const os = require("os");

const RAIZ = path.join(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "img/guia");
const FUENTES = path.join(__dirname, "video/fuentes");
const GUION = path.join(__dirname, "video/guion.json");
const SALIDA = path.join(RAIZ, "promo");

/* El lienzo. 1080p y 30 fps: es lo que YouTube sirve sin recomprimir de más y
   lo que cualquier teléfono reproduce sin pensarlo. Las capturas son de
   2160x1215, o sea que sobra resolución y nada se ve escalado hacia arriba. */
const ANCHO = 1920, ALTO = 1080, FPS = 30;

/* Los colores son los del sitio (`herramientas/css-construir.js`), no unos
   parecidos: un promocional con otro azul es lo primero que delata que la pieza
   se hizo aparte. */
const COLOR = {
  fondo: "0x102a43",      // brand-800, el azul del encabezado
  fondoHondo: "0x071527", // brand-950, para el degradado
  texto: "0xffffff",
  apagado: "0xbcccdc",    // brand-200 — 11:1 sobre el fondo, de sobra para AA
  acento: "0xf0b429",     // accent-400
  marco: "0x627d98",      // brand-400
};

/* La captura va centrada sobre el fondo de marca y NO a pantalla completa, con
   el texto encima en su propia franja. Escrito al revés —el texto sobre la
   captura— habría que garantizar el contraste contra una imagen que cambia en
   cada escena, y en la mitad de ellas el fondo es claro: se lee en el monitor
   de quien lo montó y no se lee en un teléfono. */
const CAJA = { ancho: 1340, alto: 754, x: 290, y: 286 };

const fuente = (peso) => path.join(FUENTES, `Inter-${peso}.ttf`);

function exigir(condicion, mensaje) {
  if (!condicion) { console.error("✗ " + mensaje); process.exit(1); }
}

function ffmpeg(args, queEs) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args],
                      { encoding: "utf8", maxBuffer: 1 << 26 });
  exigir(r.status === 0, `ffmpeg falló armando ${queEs}:\n${(r.stderr || "").trim()}`);
}

/* drawtext escapa comas, dos puntos y comillas de una forma que no hay quien
   siga; con el texto en un archivo aparte no hay nada que escapar y una tilde
   mal puesta deja de ser posible. */
let contador = 0;
function texto(tmp, contenido, { peso, tam, color, y }) {
  const archivo = path.join(tmp, `t${contador++}.txt`);
  fs.writeFileSync(archivo, contenido, "utf8");
  return [
    `fontfile=${fuente(peso)}`,
    `textfile=${archivo}`,
    `fontcolor=${color}`,
    `fontsize=${tam}`,
    "x=(w-text_w)/2",
    `y=${y}`,
  ].join(":");
}

/* El fondo de todas las escenas: un degradado vertical muy suave. Un color
   plano a 1080p se banda y se ve barato; el degradado cuesta lo mismo. */
function fondo(segundos) {
  return `gradients=s=${ANCHO}x${ALTO}:c0=${COLOR.fondoHondo}:c1=${COLOR.fondo}` +
         `:x0=0:y0=0:x1=0:y1=${ALTO}:d=${segundos}:r=${FPS},format=yuv420p`;
}

function armarEscena(escena, indice, tmp) {
  const destino = path.join(tmp, `escena-${String(indice).padStart(2, "0")}.mp4`);
  const d = escena.segundos;
  const entradas = ["-f", "lavfi", "-t", String(d), "-i", fondo(d)];
  const filtros = [];
  let actual = "0:v";

  /* La rayita ámbar de arriba es la firma de la casa en las tres clases de
     escena: sin ella, la portada y el cierre son texto blanco sobre azul y
     podrían ser de cualquiera. */
  filtros.push(`[${actual}]drawbox=x=(iw-120)/2:y=64:w=120:h=5:color=${COLOR.acento}:t=fill[acento]`);
  actual = "acento";

  if (escena.tipo === "pantalla") {
    const jpg = path.join(CAPTURAS, `${escena.captura}.jpg`);
    exigir(fs.existsSync(jpg),
      `falta la captura «${escena.captura}» que pide el guion (img/guia/${escena.captura}.jpg).\n` +
      `  Se rehace con:  node herramientas/guia-capturas.js  (SOLO=${escena.captura})`);

    entradas.push("-loop", "1", "-t", String(d), "-i", jpg);
    const { ancho, alto, x, y } = CAJA;
    filtros.push(`[1:v]scale=${ancho}:${alto},setsar=1[cap]`);
    /* El marco no es adorno: sin él, una captura de fondo claro se derrama
       sobre el azul y no se ve dónde empieza la pantalla. */
    filtros.push(`[${actual}]drawbox=x=${x - 3}:y=${y - 3}:w=${ancho + 6}:h=${alto + 6}` +
                 `:color=${COLOR.marco}@0.7:t=3[marco]`);
    /* Entra subiendo tres píxeles en el primer medio segundo. Es lo justo para
       que la escena no se sienta congelada; un zoom continuo sobre una imagen
       fija delata el pixelado y marea. */
    filtros.push(`[marco][cap]overlay=x=${x}:y='${y}+6*exp(-6*t)'[conCap]`);
    actual = "conCap";

    filtros.push(`[${actual}]drawtext=${texto(tmp, escena.titulo, { peso: "Bold", tam: 58, color: COLOR.texto, y: 104 })}[t1]`);
    filtros.push(`[t1]drawtext=${texto(tmp, escena.linea, { peso: "Regular", tam: 32, color: COLOR.apagado, y: 190 })}[vout]`);
  } else {
    /* Portada y cierre: sin captura, el texto manda y va más grande. */
    filtros.push(`[${actual}]drawtext=${texto(tmp, escena.titulo, { peso: "Bold", tam: 82, color: COLOR.texto, y: 400 })}[t1]`);
    filtros.push(`[t1]drawtext=${texto(tmp, escena.linea, { peso: "Regular", tam: 40, color: COLOR.apagado, y: 520 })}[t2]`);
    const pie = escena.pie || "";
    if (pie) {
      filtros.push(`[t2]drawtext=${texto(tmp, pie, { peso: "Bold", tam: 46, color: COLOR.acento, y: 640 })}[vout]`);
    } else {
      filtros.push(`[t2]null[vout]`);
    }
  }

  ffmpeg([
    ...entradas,
    "-filter_complex", filtros.join(";"),
    "-map", "[vout]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-pix_fmt", "yuv420p", "-r", String(FPS), "-t", String(d),
    destino,
  ], `la escena ${indice} (${escena.titulo})`);

  return destino;
}

function montar(clips, guion, destino) {
  const T = guion.transicion;
  const entradas = [];
  clips.forEach((c) => entradas.push("-i", c));

  /* El encadenado de xfade: cada transición empieza T segundos antes de que se
     acabe lo que lleva montado, así que el desplazamiento acumula las
     duraciones anteriores menos una transición por cada corte ya hecho. Con la
     cuenta mal, el video no falla: se queda congelado en una escena. */
  const filtros = [];
  let etiqueta = "0:v", acumulado = guion.escenas[0].segundos;
  for (let i = 1; i < clips.length; i++) {
    const salida = i === clips.length - 1 ? "vfinal" : `x${i}`;
    filtros.push(`[${etiqueta}][${i}:v]xfade=transition=fade:duration=${T}` +
                 `:offset=${(acumulado - T).toFixed(3)}[${salida}]`);
    acumulado += guion.escenas[i].segundos - T;
    etiqueta = salida;
  }

  /* Pista de silencio: un mp4 mudo hace que algunos reproductores y más de una
     red social se queden pensando si el archivo está bien. Cuesta nada. */
  const args = [
    ...entradas,
    "-f", "lavfi", "-t", String(acumulado.toFixed(3)),
    "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
  ];
  if (filtros.length) {
    args.push("-filter_complex", filtros.join(";"), "-map", "[vfinal]");
  } else {
    args.push("-map", "0:v");
  }
  args.push(
    "-map", `${clips.length}:a`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "96k",
    "-movflags", "+faststart",   // que empiece a verse antes de bajarse entero
    "-shortest", destino);
  ffmpeg(args, "el montaje final");
  return acumulado;
}

function main() {
  exigir(spawnSync("ffmpeg", ["-version"]).status === 0,
    "no hay ffmpeg. Se instala con:  sudo apt-get install -y ffmpeg");
  for (const peso of ["Bold", "Regular"]) {
    exigir(fs.existsSync(fuente(peso)),
      `falta la tipografía Inter-${peso}.ttf en herramientas/video/fuentes/.\n` +
      "  Sin ella el video saldría con otra letra y se vería de otra empresa.");
  }
  exigir(fs.existsSync(GUION), "falta herramientas/video/guion.json");

  const guion = JSON.parse(fs.readFileSync(GUION, "utf8"));
  const soloEscena = process.env.SOLO_ESCENA ? Number(process.env.SOLO_ESCENA) : null;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "promo-"));
  fs.mkdirSync(SALIDA, { recursive: true });

  const escenas = soloEscena === null ? guion.escenas : [guion.escenas[soloEscena]];
  exigir(escenas[0], `no hay ninguna escena ${soloEscena} en el guion`);

  const clips = [];
  escenas.forEach((escena, i) => {
    const n = soloEscena === null ? i : soloEscena;
    process.stdout.write(`  escena ${n}: ${escena.titulo}\n`);
    clips.push(armarEscena(escena, n, tmp));
  });

  const destino = path.join(SALIDA, soloEscena === null
    ? "ajedrez-integral-promo.mp4"
    : `escena-${soloEscena}.mp4`);

  const duracion = soloEscena === null
    ? montar(clips, guion, destino)
    : (fs.copyFileSync(clips[0], destino), escenas[0].segundos);

  const mb = (fs.statSync(destino).size / 1e6).toFixed(1);
  console.log(`\n✓ ${path.relative(RAIZ, destino)} — ${duracion.toFixed(1)} s, ${mb} MB, ${ANCHO}x${ALTO}`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

main();
