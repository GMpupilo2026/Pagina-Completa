/* Le pone el fondo de OBS (img/obs/, lo dibuja herramientas/obs-fondo.js) a una
 * grabación que ya existe: la de una sesión de Formación Ajedrez que se grabó
 * sin él y ya está en YouTube.
 *
 *   node herramientas/video-con-fondo.js <grabación> [salida.mp4]
 *
 * El video se achica al recuadro (1520 × 855 en X = 200, Y = 136) y encima va
 * el marco, que es el fondo entero con el recuadro transparente. Solo pide ffmpeg (y ffprobe, que viene con él).
 *
 * **La duración no cambia, a propósito**: no se corta ni se agrega nada. Los
 * capítulos de cada grabación (herramientas/datos/formacion-grabaciones.json)
 * son segundos del video, y lo que vio cada asesor (`grabaciones_vistas`) son
 * tramos de segundos de esa clase (horario + fecha, no el id del video): con
 * la misma duración, al cambiar el video por el nuevo, los dos siguen valiendo.
 * El script compara las duraciones al terminar y avisa si no calzan.
 *
 * El audio se copia tal cual; el video se vuelve a codificar (H.264, que
 * YouTube acepta sin problema). Una grabación de cuatro horas tarda un buen
 * rato: es una pantalla compartida, con poco movimiento, y va más rápido que
 * un video común.
 */
const path = require("path");
const fs = require("fs");
const { spawnSync, spawn } = require("child_process");

const RAIZ = path.join(__dirname, "..");
const MARCO = path.join(RAIZ, "img", "obs", "formacion-ajedrez-marco.png");
// El mismo recuadro de obs-fondo.js; si se cambia allá, se cambia acá.
const RECUADRO = { x: 200, y: 136, ancho: 1520, alto: 855 };
// El color de adentro del recuadro (brand950): si el video no es 16:9, las
// franjas que sobran quedan de ese azul y no negras.
const RELLENO = "0x071527";

function salir(mensaje) {
    console.error(mensaje);
    process.exit(1);
}

function sondear(archivo) {
    const r = spawnSync("ffprobe", ["-v", "error", "-print_format", "json",
        "-show_format", "-show_streams", archivo], { encoding: "utf8" });
    if (r.status !== 0) salir(`ffprobe no pudo leer ${archivo}:\n${r.stderr}`);
    return JSON.parse(r.stdout);
}

const hms = (s) => {
    s = Math.round(s);
    return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

(async () => {
    const [entrada, salidaPedida] = process.argv.slice(2);
    if (!entrada) salir("Uso: node herramientas/video-con-fondo.js <grabación> [salida.mp4]");
    if (!fs.existsSync(entrada)) salir(`No existe ${entrada}.`);
    if (spawnSync("ffmpeg", ["-version"]).status !== 0) salir("Hace falta ffmpeg (https://ffmpeg.org/download.html).");
    for (const f of [MARCO]) {
        if (!fs.existsSync(f)) salir(`Falta ${path.relative(RAIZ, f)}: corre node herramientas/obs-fondo.js.`);
    }
    const salida = salidaPedida ||
        path.join(path.dirname(entrada), path.basename(entrada, path.extname(entrada)) + "-con-fondo.mp4");

    const info = sondear(entrada);
    const duracion = Number(info.format.duration);
    const tieneAudio = info.streams.some((s) => s.codec_type === "audio");
    const R = RECUADRO;
    console.log(`${path.basename(entrada)}: ${hms(duracion)}.`);

    // El video manda el tiempo: es la entrada principal, y el marco (una sola
    // imagen, que se repite sola hasta el final) va encima. El marco ya trae
    // todo el fondo con el recuadro transparente, así que el fondo no hace
    // falta aparte. Con las imágenes en bucle como entrada principal, ffmpeg
    // no escribía ni un cuadro.
    const filtro = [
        `[0:v]scale=${R.ancho}:${R.alto}:force_original_aspect_ratio=decrease,` +
            `pad=${R.ancho}:${R.alto}:(ow-iw)/2:(oh-ih)/2:color=${RELLENO},` +
            `pad=1920:1080:${R.x}:${R.y}:color=${RELLENO},setsar=1[video]`,
        `[video][1:v]overlay=0:0:format=auto,format=yuv420p[fin]`,
    ].join(";");

    const args = ["-hide_banner", "-y", "-loglevel", "error", "-stats",
        "-i", entrada, "-i", MARCO,
        "-filter_complex", filtro, "-map", "[fin]"];
    if (tieneAudio) args.push("-map", "0:a:0", "-c:a", "copy");
    args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
        "-movflags", "+faststart", salida);

    const proceso = spawn("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"] });
    const codigo = await new Promise((listo) => proceso.on("close", listo));
    if (codigo !== 0) salir(`ffmpeg terminó con error (${codigo}).`);

    const nueva = Number(sondear(salida).format.duration);
    const diferencia = Math.abs(nueva - duracion);
    console.log(`\nListo: ${salida} (${hms(nueva)}).`);
    if (diferencia > 1) {
        salir(`OJO: el original dura ${hms(duracion)} y el nuevo ${hms(nueva)}. ` +
            "Los capítulos y lo que vio cada asesor dejarían de calzar: no lo subas así.");
    }
    console.log("La duración es la misma que la del original: los capítulos siguen valiendo.");
})();

/*! rev bfb5bbb0d2d82f9f */
