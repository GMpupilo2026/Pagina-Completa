/* Comprueba «Audios de las clases» (audios-clases.html) en un navegador, con el
   doble de Supabase de Entrenamiento.

   - La fecha, la hora y el título salen del nombre del archivo de Meet
     («Clase Selección ADAES - 2026_11_10 19_25 CST - Recording.mp3»); sin fecha
     en el nombre, no se sube.
   - Cada clase es un encabezado con el día dicho completo, en hora de Costa
     Rica; el reproductor dice de qué clase es; el título va por textContent.
   - La velocidad se elige en una lista, cambia el audio y se recuerda.
   - El audio sigue donde quedó la vez anterior y lo dice.
   - La transcripción se pide al abrirla, sin los renglones repetidos.
   - El alumno no ve «Subir audios»; quien puede subir, sí.
   - Sin audios, lo dice.
   - La guía: los minutos aproximados se avisan; un tema abre su clase en su
     minuto desde «Conceptos de todas las clases»; el repaso de hoy contesta
     las vueltas con responder_vuelta y dice cuándo vuelven; la transcripción
     de Whisper con sus minutos vuelve a encontrar cada tema por su cita.

   Uso:  npm install; node herramientas/verificar-todo.js audios-clases        */
const { chromium } = require("./lib/playwright-con-sesion");
const { abrir } = require("./lib/doble-entreno");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

/* Tres minutos de silencio en WAV (8 kHz, 8 bits, mono): el navegador lo
   carga y sabe su duración, sin depender de ffmpeg. */
function wav(segundos) {
  const n = 8000 * segundos, b = Buffer.alloc(44 + n, 128);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34);
  b.write("data", 36); b.writeUInt32LE(n, 40);
  return b;
}
const AUDIO = wav(180);
/* Contesta por tramos (Range), como el almacenamiento de verdad: sin eso el
   navegador no puede saltar dentro del audio y «sigue donde quedó» no se
   podría probar. */
const preparar = (ctx) => ctx.route("**/doble-storage/**", (r) => {
  const m = /bytes=(\d+)-(\d*)/.exec(r.request().headers()["range"] || "");
  if (!m) return r.fulfill({ status: 200, contentType: "audio/wav", headers: { "accept-ranges": "bytes" }, body: AUDIO });
  const desde = +m[1], hasta = m[2] ? Math.min(+m[2], AUDIO.length - 1) : AUDIO.length - 1;
  return r.fulfill({ status: 206, contentType: "audio/wav", body: AUDIO.subarray(desde, hasta + 1),
    headers: { "accept-ranges": "bytes", "content-range": "bytes " + desde + "-" + hasta + "/" + AUDIO.length } });
});

const MALICIOSO = '<img src=x onerror="window.__xss=1">';
const ADAES = "c6c1fc10-0f23-4892-a676-98805278e43b";
const AUDIOS = [
  { id: "a2", academia_id: ADAES, fecha: "2026-11-10", hora: "19:25:00", titulo: "Clase Selección ADAES", archivo: ADAES + "/2026-11-10_1925_x.mp3",
    duracion_seg: 4527, bytes: 33554432, con_transcripcion: true,
    transcripcion: "Muy buenas noches a todos.\nno\nno\nno\nCaballo, Félix, tres." },
  { id: "a1", academia_id: ADAES, fecha: "2026-11-03", hora: null, titulo: MALICIOSO, archivo: ADAES + "/2026-11-03_0000_y.mp3",
    duracion_seg: 3600, bytes: null, con_transcripcion: false, transcripcion: null },
];
const texto = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; }, sel);
const visible = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.checkVisibility(); }, sel);

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    console.log("\n=== El nombre del archivo ===");
    {
      const { page, ctx } = await abrir(browser, "/audios-clases.html", { audios_clase: [] }, null, preparar);
      await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
      const r = await page.evaluate(() => [
        AudiosClases.datosDelNombre("Clase Selección ADAES - 2026_11_10 19_25 CST - Recording.mp3"),
        AudiosClases.datosDelNombre("2026-11-03.mp3"),
        AudiosClases.datosDelNombre("grabacion sin fecha.mp3"),
        AudiosClases.datosDelNombre("Clase - 2026_13_45 10_00.mp3"),
        AudiosClases.parrafos("a\n\nno\nno\n no \nb\nno"),
        AudiosClases.duracionDicha(4527), AudiosClases.duracionDicha(3600), AudiosClases.duracionDicha(60),
        AudiosClases.horaLarga("19:25:00"), AudiosClases.horaLarga("09:05:00"),
      ]);
      igual("la grabación de Meet", r[0], { fecha: "2026-11-10", hora: "19:25:00", titulo: "Clase Selección ADAES", base: "Clase Selección ADAES - 2026_11_10 19_25 CST - Recording" });
      igual("solo la fecha: sin hora y con «Clase» de título", r[1], { fecha: "2026-11-03", hora: null, titulo: "Clase", base: "2026-11-03" });
      igual("sin fecha no se sube", r[2], null);
      igual("una fecha que no existe no se sube", r[3], null);
      igual("los renglones repetidos seguidos se juntan", r[4], ["a", "no", "b", "no"]);
      igual("la duración dicha", r.slice(5, 8), ["1 hora y 15 minutos", "1 hora", "1 minuto"]);
      igual("la hora dicha", r.slice(8), ["7:25 p. m.", "9:05 a. m."]);

      console.log("\n=== Sin audios ===");
      igual("lo dice", await texto(page, "#aviso"), "Todavía no hay audios de tus clases. Cuando tu profe suba uno, aparece acá.");
      igual("el alumno no ve «Subir audios»", await visible(page, "#subir"), false);
      await ctx.close();
    }

    console.log("\n=== La lista, como alumno ===");
    {
      const { page, ctx, errores } = await abrir(browser, "/audios-clases.html", { audios_clase: AUDIOS },
        { audios_clase_pos_v1: JSON.stringify({ a2: 125 }) }, preparar);
      await page.waitForSelector("#lista article", { timeout: 20000 });
      igual("una clase por encabezado, con el día dicho completo",
        await page.$$eval("#lista article h3", (hs) => hs.map((h) => h.textContent)),
        ["Martes 10 de noviembre de 2026", "Martes 3 de noviembre de 2026"]);
      igual("el detalle: título, hora y duración", await texto(page, "#lista article:first-child p"), "Clase Selección ADAES · 7:25 p. m. · 1 hora y 15 minutos");
      igual("el título va como texto, no como HTML",
        [await texto(page, "#lista article:nth-child(2) p"), await page.evaluate(() => !!window.__xss || !!document.querySelector("#lista img"))],
        [MALICIOSO + " · 1 hora", false]);
      igual("el reproductor dice de qué clase es", await page.$eval("#lista article audio", (a) => a.getAttribute("aria-label")), "Audio de la clase del Martes 10 de noviembre de 2026");
      igual("el artículo se nombra por su encabezado", await page.$eval("#lista article", (a) => a.getAttribute("aria-labelledby")), "clase-a2");
      igual("descargar dice cuánto pesa", await page.$eval("#lista article a", (a) => [a.textContent, a.getAttribute("href")]),
        ["Descargar el audio (32 MB)", "/doble-storage/audios-clase/" + ADAES + "/2026-11-10_1925_x.mp3?download"]);
      igual("el alumno no ve «Subir audios» ni «Quitar»", [await visible(page, "#subir"), await page.$$eval("#lista button", (b) => b.filter((x) => /Quitar/.test(x.textContent)).length)], [false, 0]);
      igual("cada clase lleva a estudiarla", await page.$$eval("#lista article a[href*=\"clase=\"]", (as) => as.map((a) => [a.getAttribute("href"), a.getAttribute("aria-label")])),
        [["audios-clases.html?clase=a2", "Estudiar la clase del Martes 10 de noviembre de 2026: temas, buscar, partidas, preguntas y marcas"], ["audios-clases.html?clase=a1", "Estudiar la clase del Martes 3 de noviembre de 2026: temas, buscar, partidas, preguntas y marcas"]]);
      igual("y cada audio, sus botones para saltar", await page.$$eval("#lista article:first-child [role=group] button", (b) => b.map((x) => x.textContent)), ["Atrás 1 min", "Atrás 15 s", "Adelante 15 s", "Adelante 1 min", "¿En qué minuto voy?"]);

      console.log("\n=== Sigue donde quedó ===");
      await page.$eval("#lista article audio", (a) => a.load());
      await page.waitForFunction(() => document.querySelector("#lista article audio").currentTime > 100, null, { timeout: 10000 });
      igual("arranca en el segundo 125 y lo dice",
        [Math.round(await page.$eval("#lista article audio", (a) => a.currentTime)), await texto(page, '#lista article [role="status"]')],
        [125, "Sigue donde lo dejaste: minuto 2."]);

      console.log("\n=== La velocidad ===");
      await page.selectOption("#vel-a2", "1.5");
      igual("cambia el audio y se recuerda",
        [await page.$eval("#lista article audio", (a) => a.playbackRate), await page.evaluate(() => localStorage.getItem("audios_clase_vel_v1"))],
        [1.5, "1.5"]);
      igual("la lista se llama «Velocidad»", await page.$eval('label[for="vel-a2"]', (l) => l.textContent), "Velocidad");

      console.log("\n=== La transcripción ===");
      igual("solo la clase que la tiene", await page.$$eval("#lista details", (d) => d.length), 1);
      await page.click("#lista details summary");
      await page.waitForFunction(() => document.querySelectorAll("#lista details p").length > 2, null, { timeout: 5000 });
      igual("sin los renglones repetidos", await page.$$eval("#lista details p", (ps) => ps.slice(1).map((p) => p.textContent)),
        ["Muy buenas noches a todos.", "no", "Caballo, Félix, tres."]);
      igual("sin errores en la página", errores, []);
      await ctx.close();
    }

    console.log("\n=== Quien puede subir ===");
    {
      const { page, ctx, errores } = await abrir(browser, "/audios-clases.html",
        { audios_clase: AUDIOS, "rpc:mis_academias_audios": [{ id: ADAES, nombre: "ADAES" }] }, null, preparar);
      await page.waitForSelector("#lista article", { timeout: 20000 });
      igual("ve «Subir audios», con su academia", [await visible(page, "#subir"), await page.$eval("#subir-academia", (s) => s.options[0].textContent)], [true, "ADAES"]);
      igual("y «Quitar» en cada audio, diciendo cuál", await page.$$eval("#lista button", (b) => b.map((x) => x.getAttribute("aria-label")).filter((x) => /^Quitar/.test(x || ""))),
        ["Quitar el audio de la clase del Martes 10 de noviembre de 2026", "Quitar el audio de la clase del Martes 3 de noviembre de 2026"]);
      await page.click("#subir-boton");
      igual("sin archivos, lo dice", await texto(page, "#subir-estado"), "Elige al menos un archivo MP3 o una guía (.json).");
      igual("sin errores en la página", errores, []);
      await ctx.close();
    }

    console.log("\n=== La guía: las piezas sueltas ===");
    {
      const { page, ctx } = await abrir(browser, "/audios-clases.html", { audios_clase: [] }, null, preparar);
      await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
      const r = await page.evaluate(() => {
        const G = AudiosGuia;
        const fr = G.frases([[0, "Hola"], [3.7, "no"], [5, "no"], [9, "El peón avanza"], [65, "Philidor"], ["x"], [70, "  "]]);
        return [
          fr, G.buscar(fr, "PEON"), G.buscar(fr, "p"), G.porMinuto(fr),
          [G.reloj(75), G.reloj(3925), G.relojDicho(750), G.relojDicho(60), G.relojDicho(3960)],
          G.temaEn([{ seg: 0, titulo: "A" }, { seg: 60, titulo: "B" }], 59).titulo,
          [G.sanEspanol("Nf3"), G.sanEspanol("exd8=Q+"), G.sanEspanol("O-O"), G.sanDicha("e4"), G.sanDicha("Nxf7+")],
          G.jugadasLegales("1. e4 e5 2. Nf3"), G.jugadasLegales("e4 e5 Nf3 Ke7 Ke3 Nc3"),
          G.leerGuia({
            segmentos: [[1, "a"], [1, "a"], [2, "b"]], resumen: "Se vio el mate del pasillo.",
            indice: [{ seg: 90, titulo: "Dos" }, { seg: 10, titulo: "Uno" }, { seg: 5, titulo: " " }],
            preguntas: [{ pregunta: "¿?", opciones: ["x", "y"], correcta: 2, explicacion: "porque sí" },
              { pregunta: "Mala", opciones: ["x", "y"], correcta: 3 }, { pregunta: "Sola", opciones: ["x"], correcta: 1 }],
            partidas: [{ titulo: "Italiana", seg: 30, jugadas: ["e4", "e5", "Nf3", "Nc6", "Bc4"] },
              { titulo: "Inventada", jugadas: "e4 Ke7" }, { titulo: "Cortada", jugadas: "d4 d5 c4 Qh5 e4" }],
          }),
        ];
      });
      igual("las frases, sin las repetidas ni las vacías", r[0], [[0, "Hola"], [3, "no"], [9, "El peón avanza"], [65, "Philidor"]]);
      igual("buscar no mira tildes ni mayúsculas", r[1], [[9, "El peón avanza"]]);
      igual("con una letra no busca", r[2], []);
      igual("las frases por minuto", r[3], [{ min: 0, seg: 0, texto: "Hola no El peón avanza" }, { min: 1, seg: 60, texto: "Philidor" }]);
      igual("el minuto escrito y dicho", r[4], ["1:15", "1:05:25", "minuto 12 con 30 segundos", "minuto 1", "1 hora y 6 minutos"]);
      igual("el tema que va sonando", r[5], "A");
      igual("la jugada en español, escrita y dicha", r[6], ["Cf3", "exd8=D+", "O-O", "peón eva 4", "caballo captura felix 7 jaque"]);
      igual("las jugadas, con sus números", r[7], ["e4", "e5", "Nf3"]);
      igual("en la primera ilegal se corta", r[8], ["e4", "e5", "Nf3", "Ke7"]);
      igual("la guía: lo bueno entra, lo malo no", r[9], {
        segmentos: [[1, "a"], [2, "b"]], resumen: "Se vio el mate del pasillo.",
        indice: [{ seg: 10, titulo: "Uno" }, { seg: 90, titulo: "Dos" }],
        preguntas: [{ n: 1, pregunta: "¿?", opciones: ["x", "y"], correcta: 2, explicacion: "porque sí" }],
        partidas: [{ orden: 1, titulo: "Italiana", seg: 30, jugadas: "e4 e5 Nf3 Nc6 Bc4" }, { orden: 2, titulo: "Cortada", seg: null, jugadas: "d4 d5 c4" }],
      });
      const n = await page.evaluate(() => {
        const G = AudiosGuia;
        const indice = [
          { seg: 300, titulo: "Saludo", concepto: "Torneos", cita: "Muy buenas noches a todos, hoy vemos el contrajuego" },
          { seg: 1500, titulo: "La partida", concepto: "Contrajuego", cita: "aquí las negras buscan el contrajuego en el flanco de rey" },
          { seg: 2000, titulo: "Sin cita" },
          { seg: 2500, titulo: "No está", concepto: "Final", cita: "esta frase no se dijo nunca en ninguna parte" },
        ];
        const nuevos = [[10, "Muy buenas noches a todos,"], [14, "hoy vemos el contrajuego."], [900, "Otra cosa."],
          [1380, "Bueno, aquí las negras"], [1383, "buscan el contrajuego en el flanco de rey."], [2600, "Final."]];
        const r = G.reanclar(indice, nuevos, 3600);
        return [
          G.deWhisper({ segments: [{ start: 1.6, text: " Hola." }, { start: 2, text: " Hola." }, { start: 9.2, text: "Peón." }] }), G.deWhisper({ resumen: "x" }),
          r.indice.map((t) => [t.titulo, t.seg]), r.encontrados, G.moverSeg(1600, r.movidas), G.moverSeg(null, r.movidas),
          G.leerGuia({ indice: [{ seg: 5, titulo: "A", concepto: " Táctica ", cita: "dijo esto" }] }).indice,
          G.conceptos([
            { id: "b", fecha: "2026-11-03", indice: [{ seg: 50, titulo: "Uno", concepto: "Contrajuego" }, { seg: 9, titulo: "Sin" }] },
            { id: "a", fecha: "2026-07-03", indice: [{ seg: 70, titulo: "Dos", concepto: "contrajuego" }, { seg: 10, titulo: "Tres", concepto: "Apertura" }] },
            { id: "c", fecha: "2026-08-01", indice: null }]),
        ];
      });
      igual("la transcripción de Whisper con sus minutos", n[0], [[1, "Hola."], [9, "Peón."]]);
      igual("un .json sin «segments» no es de Whisper", n[1], null);
      igual("cada tema vuelve a encontrar su minuto por su cita; sin cita o sin hallarla, se queda", n[2],
        [["Saludo", 10], ["La partida", 1380], ["Sin cita", 2000], ["No está", 2500]]);
      igual("dice cuántos encontró", n[3], 2);
      igual("la partida se mueve como el tema más cercano", [n[4], n[5]], [1480, null]);
      igual("la guía guarda el concepto y la cita", n[6], [{ seg: 5, titulo: "A", concepto: "Táctica", cita: "dijo esto" }]);
      igual("los conceptos de todas las clases: juntos sin mirar mayúsculas, por orden alfabético y de la clase más vieja a la nueva", n[7], [
        { concepto: "Apertura", temas: [{ audio: "a", fecha: "2026-07-03", seg: 10, titulo: "Tres" }] },
        { concepto: "Contrajuego", temas: [{ audio: "a", fecha: "2026-07-03", seg: 70, titulo: "Dos" }, { audio: "b", fecha: "2026-11-03", seg: 50, titulo: "Uno" }] }]);
      await ctx.close();
    }

    const GUIA = Object.assign({}, AUDIOS[0], {
      resumen: "Se repasó la apertura italiana.\nY el mate del pasillo.",
      indice: [{ seg: 0, titulo: "Saludo" }, { seg: 60, titulo: "La italiana" }, { seg: 120, titulo: "Mate del <b>pasillo</b>" }],
      minutos_aproximados: true,
      segmentos: [[2, "Muy buenas noches."], [61, "El peón va a e4."], [62, "El peón va a e4."], [125, "Mate del pasillo."]],
    });
    const TABLAS_GUIA = {
      audios_clase: [GUIA],
      audios_clase_partidas: [
        { id: "p1", audio_id: "a2", orden: 1, seg: 60, titulo: "La italiana", jugadas: "e4 e5 Nf3 Nc6 Bc4", revisada: true },
        { id: "p2", audio_id: "a2", orden: 2, seg: 90, titulo: "Sin revisar", jugadas: "d4 d5", revisada: false },
      ],
      audios_clase_preguntas: [{ audio_id: "a2", n: 1, pregunta: "¿Qué pieza da el mate del pasillo?", opciones: ["El rey", "La torre"] },
        { audio_id: "a2", n: 2, pregunta: "¿Ya la contesté?", opciones: ["Sí", "No"] }],
      audios_clase_repasos: [{ audio_id: "a2", n: 2, opcion: 1, acerto: true }],
      audios_clase_marcas: [{ id: "m1", audio_id: "a2", seg: 61, nota: "repasar la italiana" }],
      "rpc:responder_repaso": [{ acerto: true, correcta: 2, explicacion: "La torre entra por la fila de atrás.", puntos: 2, primera: true }],
      audios_clase_ejercicios: [
        { id: "e1", audio_id: "a2", n: 1, seg: 125, enunciado: "Juegan blancas y dan mate.", fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", revisado: true },
        { id: "e2", audio_id: "a2", n: 2, seg: null, enunciado: "Roto.", fen: "esto no es un fen", revisado: true }],
      audios_clase_ejercicio_intentos: [],
      "rpc:responder_ejercicio": [{ acerto: true, buena: "Ra8#", explicacion: "Mate del pasillo.", puntos: 2, primera: true }],
      "rpc:ejercicios_para_revisar": [{ id: "e1", buena: "Ra8#", explicacion: "Mate del pasillo." }],
    };

    console.log("\n=== Estudiar una clase, como alumno ===");
    {
      // El doble no filtra las partidas sin revisar (eso lo hace la RLS): el alumno no recibe p2.
      const tablas = Object.assign({}, TABLAS_GUIA, { audios_clase_partidas: [TABLAS_GUIA.audios_clase_partidas[0]] });
      const { page, ctx, errores } = await abrir(browser, "/audios-clases.html?clase=a2", tablas, null, preparar);
      await page.waitForSelector("#marcas-lista li", { timeout: 20000 });
      igual("la clase es el encabezado h2, y vuelve a la lista", [await texto(page, "#lista h2"), await page.$eval('a[href="audios-clases.html"]', (a) => a.textContent)],
        ["Martes 10 de noviembre de 2026", "← Todas las clases"]);
      igual("las secciones, cada una con su h3", await page.$$eval("#lista section h3", (hs) => hs.map((h) => h.textContent)),
        ["De qué se trató", "Temas de la clase", "Buscar en lo que se dijo", "Partidas de la clase", "Ejercicios de la clase", "Preguntas de repaso", "Mis marcas"]);
      igual("el resumen, en párrafos", await page.$$eval('[aria-labelledby="resumen"] p', (ps) => ps.map((p) => p.textContent)), ["Se repasó la apertura italiana.", "Y el mate del pasillo."]);
      igual("el tema va como texto, con su minuto dicho", await page.$$eval('[aria-labelledby="temas"] ol button', (bs) => bs.map((b) => [b.textContent, b.getAttribute("aria-label")])),
        [["0:00 · Saludo", "Escuchar desde el minuto 0: Saludo"], ["1:00 · La italiana", "Escuchar desde el minuto 1: La italiana"], ["2:00 · Mate del <b>pasillo</b>", "Escuchar desde el minuto 2: Mate del <b>pasillo</b>"]]);
      igual("el alumno no ve «Subir audios» ni «Quitar»", [await visible(page, "#subir"), await page.$$eval("#lista button", (b) => b.some((x) => /Quitar/.test(x.textContent)))], [false, false]);
      igual("con minutos aproximados, los temas y la búsqueda lo avisan", await page.$$eval('[aria-labelledby="temas"] > p, [aria-labelledby="buscar"] > p:not([role])', (ps) => ps.map((p) => p.textContent)),
        Array(2).fill("Los minutos son aproximados: pueden caer uno o dos minutos antes o después. Si no oyes el tema, avanza o retrocede un minuto."));

      console.log("\n=== Moverse en el audio ===");
      const t = () => page.$eval("#lista audio", (a) => Math.round(a.currentTime));
      await page.click('[aria-labelledby="temas"] ol li:nth-child(2) button');
      await page.waitForFunction(() => Math.round(document.querySelector("#lista audio").currentTime) >= 60, null, { timeout: 5000 });
      await page.$eval("#lista audio", (a) => a.pause());
      await page.$eval("#lista audio", (a) => { a.currentTime = 60; });
      igual("el tema lleva el audio a su minuto", await t(), 60);
      await page.click('button[aria-label="Adelante 15 segundos"]');
      await page.waitForFunction(() => /Adelante 15 segundos/.test(document.getElementById("anuncio").textContent), null, { timeout: 3000 });
      igual("«Adelante 15 s» salta y lo dice", [await t(), await texto(page, "#anuncio")], [75, "Adelante 15 segundos. Vas en el minuto 1 con 15 segundos."]);
      await page.keyboard.press("Alt+Shift+ArrowLeft");
      igual("Alt+Mayúscula+flecha izquierda, 15 atrás", await t(), 60);
      await page.keyboard.press("Control+Alt+Shift+ArrowRight");
      igual("con Control, un minuto", await t(), 120);
      await page.click("text=¿En qué minuto voy?");
      await page.waitForFunction(() => /Tema/.test(document.getElementById("anuncio").textContent), null, { timeout: 3000 });
      igual("«¿En qué minuto voy?» dice el minuto y el tema", await texto(page, "#anuncio"), "Vas en el minuto 2 de 3:00. Tema: Mate del <b>pasillo</b>.");

      console.log("\n=== Buscar en lo que se dijo ===");
      await page.fill("#buscar-palabra", "PEON");
      await page.click('#buscar button[type="submit"], [aria-labelledby="buscar"] button[type="submit"]');
      igual("encuentra sin tildes y sin la frase repetida", [await texto(page, "#buscar-estado"), await page.$$eval("#buscar-resultados button", (b) => b.map((x) => x.textContent))],
        ["Una frase dice «PEON». Toca una para escucharla.", ["1:01 · El peón va a e4."]]);
      await page.click("#buscar-resultados button");
      await page.$eval("#lista audio", (a) => a.pause());
      igual("y lleva al audio un poco antes", await t(), 58);
      await page.fill("#buscar-palabra", "dragón");
      await page.click('[aria-labelledby="buscar"] button[type="submit"]');
      igual("sin resultados, lo dice", await texto(page, "#buscar-estado"), "Ninguna frase dice «dragón». Prueba con otra palabra: la transcripción puede haberla escrito distinto.");

      console.log("\n=== Las partidas ===");
      igual("solo la revisada, sin el aviso de revisar", [await page.$$eval('[aria-labelledby="partidas"] h4', (h) => h.map((x) => x.textContent)), await page.$$eval('[aria-labelledby="partidas"] p', (p) => p.some((x) => /Sin revisar|revísalas/.test(x.textContent)))],
        [["La italiana"], false]);
      await page.click('button[aria-label="Jugada siguiente"]');
      await page.click('button[aria-label="Jugada siguiente"]');
      igual("la jugada dicha en palabras", await texto(page, '[aria-labelledby="partidas"] [aria-live="polite"]'), "Jugada 1, negras: peón eva 5.");
      igual("las jugadas escritas en español, la actual marcada", [await texto(page, '[aria-labelledby="partidas"] .font-mono'), await texto(page, '[aria-labelledby="partidas"] .font-mono .font-bold')],
        ["1. e4 e5 2. Cf3 Cc6 3. Ac4", "e5"]);
      await page.click("text=Al final");
      igual("al final lo dice", await texto(page, '[aria-labelledby="partidas"] [aria-live="polite"]'), "Jugada 3, blancas: alfil cesar 4. Es la última.");
      await page.click("text=Leer la posición");
      igual("lee la posición", (await texto(page, '[aria-labelledby="partidas"] [aria-live="polite"]')).slice(0, 40), "Blancas: rey en eva 1; dama en david 1; ");

      console.log("\n=== Los ejercicios de la clase ===");
      igual("solo el de posición válida, con su enunciado y la posición en palabras, sin la respuesta",
        [await page.$$eval('[aria-labelledby="ejercicios"] h4', (h) => h.map((x) => x.textContent)),
          (await texto(page, '[aria-labelledby="ejercicios"] [role="group"] p:nth-of-type(2)')).slice(0, 22),
          await page.$$eval('[aria-labelledby="ejercicios"] p', (ps) => ps.some((p) => /Para revisar|Ra8|Ta8/.test(p.textContent)))],
        [["Ejercicio 1"], "Blancas: rey en gustav", false]);
      await page.fill("#jugada-e1", "Tz9");
      await page.click('button[aria-label="Contestar el ejercicio 1"]');
      igual("una jugada que no se entiende no va a la base", [await texto(page, '[aria-labelledby="ejercicios"] [role="status"]'),
        await page.evaluate(() => window.__rpcArgs.filter((x) => x[0] === "responder_ejercicio").length)],
        ["No entendí «Tz9» o no es legal en esta posición. Escríbela como se anota, por ejemplo «Cf3».", 0]);
      await page.fill("#jugada-e1", "Ta8");
      await page.click('button[aria-label="Contestar el ejercicio 1"]');
      await page.waitForFunction(() => /Correcto/.test(document.querySelector('[aria-labelledby="ejercicios"] [role="status"]').textContent), null, { timeout: 3000 });
      igual("«Ta8» (en español) se manda como la jugada de chess.js, y dice los puntos y por qué",
        [await page.evaluate(() => window.__rpcArgs.filter((x) => x[0] === "responder_ejercicio")), await texto(page, '[aria-labelledby="ejercicios"] [role="status"]')],
        [[["responder_ejercicio", { p_id: "e1", p_jugada: "Ra8#" }]], "¡Correcto! Ta8#. Ganaste 2 Puntos Ajedrez. Mate del pasillo."]);

      console.log("\n=== Las preguntas de repaso ===");
      await page.click('[aria-labelledby="preguntas"] button[aria-label="Contestar la pregunta 1"]');
      igual("sin elegir, lo pide", await texto(page, '[aria-labelledby="preguntas"] fieldset:first-of-type [role="status"]'), "Elige una opción.");
      await page.check('input[name="preg-1"][value="2"]');
      await page.click('button[aria-label="Contestar la pregunta 1"]');
      await page.waitForFunction(() => /Correcto/.test(document.querySelector('[aria-labelledby="preguntas"] fieldset [role="status"]').textContent), null, { timeout: 3000 });
      igual("contesta en la base y dice los puntos y por qué",
        [await page.evaluate(() => window.__rpcArgs.filter((x) => x[0] === "responder_repaso")), await texto(page, '[aria-labelledby="preguntas"] fieldset [role="status"]')],
        [[["responder_repaso", { p_audio: "a2", p_n: 1, p_opcion: 2 }]], "¡Correcto! Ganaste 2 Puntos Ajedrez. La torre entra por la fila de atrás. Vuelve dentro de dos días, para que no se te olvide."]);
      igual("la ya contestada lo dice y no deja cambiarla",
        [await page.$$eval('input[name="preg-2"]', (rs) => rs.map((r) => [r.disabled, r.checked])), await texto(page, '[aria-labelledby="preguntas"] fieldset:nth-of-type(2) [role="status"]')],
        [[[true, true], [true, false]], "Ya la contestaste y acertaste."]);

      console.log("\n=== Mis marcas ===");
      igual("la marca guardada lleva a su minuto", await page.$$eval("#marcas-lista button", (b) => b.map((x) => x.getAttribute("aria-label"))),
        ["Escuchar desde el minuto 1 con 1 segundos: repasar la italiana", "Borrar la marca del minuto 1 con 1 segundos"]);
      await page.$eval("#lista audio", (a) => { a.currentTime = 100; });
      await page.click("button:text-is(\"Marcar este momento\")");
      igual("marcar pide la nota con el minuto y la enfoca",
        [await page.$eval('label[for="marca-nota"]', (l) => l.textContent), await page.evaluate(() => document.activeElement.id)], ["Nota para el minuto 1 con 40 segundos (si quieres)", "marca-nota"]);
      await page.fill("#marca-nota", "el mate");
      await page.click("text=Guardar la marca");
      await page.waitForFunction(() => /Marca guardada/.test(document.getElementById("anuncio").textContent), null, { timeout: 3000 });
      igual("la guarda en la base, con su clase, su segundo y su nota",
        await page.evaluate(() => window.__inserts.filter((x) => x.tabla === "audios_clase_marcas").map((x) => x.rows)), [{ audio_id: "a2", seg: 100, nota: "el mate" }]);
      await page.click('button[aria-label="Borrar la marca del minuto 1 con 1 segundos"]');
      await page.waitForFunction(() => /Marca borrada/.test(document.getElementById("anuncio").textContent), null, { timeout: 3000 });
      igual("y la borra, solo esa", await page.evaluate(() => window.__deletes.map((d) => [d.tabla, d.filas])), [["audios_clase_marcas", 1]]);

      console.log("\n=== Todo lo que se dijo ===");
      await page.click("text=Todo lo que se dijo, minuto a minuto");
      // El evento toggle llega después del clic: se espera a que estén dibujados.
      await page.waitForSelector("#lista details p button", { timeout: 3000 }).catch(() => {});
      igual("minuto a minuto, cada uno con su botón", await page.$$eval("#lista details p button", (b) => b.map((x) => x.textContent)), ["0:00", "1:00", "2:00"]);
      igual("sin errores en la página", errores, []);
      await ctx.close();
    }

    console.log("\n=== Estudiar una clase, como profe ===");
    {
      const tablas = Object.assign({}, TABLAS_GUIA, { "rpc:mis_academias_audios": [{ id: ADAES, nombre: "ADAES" }] });
      const { page, ctx, errores } = await abrir(browser, "/audios-clases.html?clase=a2", tablas, null, preparar);
      await page.waitForSelector("#marcas-lista li", { timeout: 20000 });
      igual("ve las dos partidas, la sin revisar avisada", [await page.$$eval('[aria-labelledby="partidas"] h4', (h) => h.map((x) => x.textContent)),
        await page.$$eval('[aria-labelledby="partidas"] p', (p) => p.filter((x) => /Sin revisar: los alumnos/.test(x.textContent)).length)], [["La italiana", "Sin revisar"], 1]);
      igual("y no ve «Subir audios» dentro de la clase", await visible(page, "#subir"), false);
      igual("ve la respuesta del ejercicio para revisarlo, y puede ocultarlo",
        [await page.$$eval('[aria-labelledby="ejercicios"] p', (ps) => ps.filter((p) => /^Para revisar/.test(p.textContent)).map((p) => p.textContent)),
          await page.$$eval('[aria-labelledby="ejercicios"] button', (b) => b.map((x) => x.getAttribute("aria-label")).filter((x) => /alumnos/.test(x || "")))],
        [["Para revisar: la buena es Ta8#. Mate del pasillo."], ["Ocultar a los alumnos el ejercicio 1"]]);
      await page.click('button[aria-label="Publicar para los alumnos la partida Sin revisar"]');
      await page.waitForFunction(() => (window.__updates || []).length > 0, null, { timeout: 3000 });
      igual("publicarla la marca revisada en la base", await page.evaluate(() => window.__updates.map((u) => [u.tabla, u.campos, u.filas])), [["audios_clase_partidas", { revisada: true }, 1]]);
      igual("sin errores en la página", errores.filter((e) => !/reload/.test(e)), []);
      await ctx.close();
    }

    console.log("\n=== Subir la guía de una clase ===");
    {
      const tablas = { audios_clase: [Object.assign({}, AUDIOS[0])], audios_clase_preguntas: [{ audio_id: "a2", n: 1 }], audios_clase_partidas: [{ id: "viejo", audio_id: "a2" }],
        "rpc:mis_academias_audios": [{ id: ADAES, nombre: "ADAES" }] };
      const { page, ctx, errores } = await abrir(browser, "/audios-clases.html", tablas, null, preparar);
      await page.waitForSelector("#lista article", { timeout: 20000 });
      const guia = { segmentos: [[3, "Hola."], [70, "Peón e4."]], resumen: "Repaso.", indice: [{ seg: 70, titulo: "Italiana" }],
        preguntas: [{ pregunta: "¿Cuál?", opciones: ["a", "b"], correcta: 1, explicacion: "Por a." }],
        partidas: [{ titulo: "Italiana", seg: 70, jugadas: "e4 e5 Nf3 Nc6 Bc4" }, { titulo: "Imposible", jugadas: "e4 Ke7" }] };
      await page.setInputFiles("#subir-archivos", [
        { name: "Clase Selección ADAES - 2026_11_10 19_25 CST - Recording (voz).json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(guia)) },
        { name: "Clase Selección ADAES - 2026_06_01 18_00 CST - Recording (voz).json", mimeType: "application/json", buffer: Buffer.from("{}") },
      ]);
      await page.click("#subir-boton");
      await page.waitForFunction(() => /guía lista|primero el MP3/.test(document.getElementById("subir-estado").textContent) && !document.getElementById("subir-boton").disabled, null, { timeout: 5000 });
      igual("dice qué entró y qué clase falta", await texto(page, "#subir-estado"),
        "Clase Selección ADAES - 2026_11_10 19_25 CST - Recording (voz).json: guía lista (1 temas, 1 preguntas, 1 partidas sin publicar). Clase Selección ADAES - 2026_06_01 18_00 CST - Recording (voz).json: todavía no hay audio de esa clase; sube primero el MP3.");
      const r = await page.evaluate(() => [window.__updates.map((u) => [u.tabla, u.campos, u.filas]), window.__deletes.map((d) => [d.tabla, d.filas]),
        window.__inserts.map((i) => [i.tabla, i.rows])]);
      igual("guarda el texto con su minuto en esa clase", r[0], [["audios_clase", { resumen: "Repaso.", indice: [{ seg: 70, titulo: "Italiana" }],
        segmentos: [[3, "Hola."], [70, "Peón e4."]], transcripcion: "Hola.\nPeón e4.", minutos_aproximados: false }, 1]]);
      igual("cambia las preguntas y las partidas viejas", r[1], [["audios_clase_preguntas", 1], ["audios_clase_partidas", 1]]);
      igual("y pone las nuevas: la partida imposible no entra y ninguna llega publicada", r[2], [
        ["audios_clase_preguntas", [{ audio_id: "a2", n: 1, pregunta: "¿Cuál?", opciones: ["a", "b"], correcta: 1, explicacion: "Por a." }]],
        ["audios_clase_partidas", [{ audio_id: "a2", orden: 1, titulo: "Italiana", seg: 70, jugadas: "e4 e5 Nf3 Nc6 Bc4" }]]]);
      igual("sin errores en la página", errores, []);
      await ctx.close();
    }

    console.log("\n=== Con los minutos exactos, sin aviso ===");
    {
      const tablas = Object.assign({}, TABLAS_GUIA, { audios_clase: [Object.assign({}, GUIA, { minutos_aproximados: false })] });
      const { page, ctx } = await abrir(browser, "/audios-clases.html?clase=a2", tablas, null, preparar);
      await page.waitForSelector("#marcas-lista li", { timeout: 20000 });
      igual("no dice que son aproximados", await page.$$eval("#lista p", (ps) => ps.some((p) => /aproximados/.test(p.textContent))), false);
      await ctx.close();
    }

    console.log("\n=== Abrir una clase en un minuto (desde los conceptos) ===");
    {
      const { page, ctx, errores } = await abrir(browser, "/audios-clases.html?clase=a2&t=120", TABLAS_GUIA,
        { audios_clase_pos_v1: JSON.stringify({ a2: 30 }) }, preparar);
      await page.waitForSelector("#marcas-lista li", { timeout: 20000 });
      await page.waitForFunction(() => Math.round(document.querySelector("#lista audio").currentTime) === 120, null, { timeout: 5000 }).catch(() => {});
      igual("queda en ese minuto (no donde quedó la otra vez) y lo dice con el tema",
        [await page.$eval("#lista audio", (a) => Math.round(a.currentTime)), await texto(page, '#lista article [role="status"]')],
        [120, "Listo para escuchar desde el minuto 2: Mate del <b>pasillo</b>. Dale play al audio."]);
      igual("sin errores en la página", errores, []);
      await ctx.close();
    }

    console.log("\n=== Los conceptos de todas las clases ===");
    {
      const clases = [Object.assign({}, AUDIOS[0], { indice: [{ seg: 75, titulo: "El <i>contrajuego</i>", concepto: "Contrajuego" }], minutos_aproximados: true }),
        Object.assign({}, AUDIOS[1], { indice: [{ seg: 600, titulo: "Buscar el contrajuego", concepto: "Contrajuego" }, { seg: 30, titulo: "La italiana", concepto: "Apertura" }] })];
      const { page, ctx, errores } = await abrir(browser, "/audios-clases.html?conceptos", { audios_clase: clases }, null, preparar);
      await page.waitForSelector("#lista section h3", { timeout: 20000 });
      igual("un encabezado por concepto, por orden alfabético, con en cuántas clases", await page.$$eval("#lista section", (ss) => ss.map((x) => [x.querySelector("h3").textContent, x.querySelector("p").textContent])),
        [["Apertura", "En 1 clase."], ["Contrajuego", "En 2 clases."]]);
      igual("cada tema abre su clase en su minuto, de la más vieja a la nueva, como texto",
        await page.$$eval("#lista section:nth-child(2) a", (as) => as.map((a) => [a.textContent, a.getAttribute("href"), a.getAttribute("aria-label")])),
        [["Martes 3 de noviembre de 2026, 10:00: Buscar el contrajuego", "audios-clases.html?clase=a1&t=600", "Martes 3 de noviembre de 2026, minuto 10: Buscar el contrajuego"],
          ["Martes 10 de noviembre de 2026, 1:15: El <i>contrajuego</i>", "audios-clases.html?clase=a2&t=75", "Martes 10 de noviembre de 2026, minuto 1 con 15 segundos: El <i>contrajuego</i>"]]);
      igual("avisa que hay minutos aproximados y vuelve a la lista", [await page.$$eval("#app p", (ps) => ps.some((p) => /Algunos minutos son aproximados/.test(p.textContent))),
        await page.$eval('a[href="audios-clases.html"]', (a) => a.textContent)], [true, "← Todas las clases"]);
      igual("sin errores en la página", errores, []);
      await ctx.close();
    }

    console.log("\n=== El repaso de hoy ===");
    {
      const tablas = { audios_clase: AUDIOS,
        "rpc:repaso_de_hoy": [
          { audio_id: "a1", fecha: "2026-11-03", n: 2, pregunta: "¿Qué es el contrajuego?", opciones: ["Atacar donde ataca el rival", "Atacar en otro lado"], vuelta: 1 },
          { audio_id: "a2", fecha: "2026-11-10", n: 1, pregunta: "¿Qué pieza da el mate del pasillo?", opciones: ["El rey", "La torre"], vuelta: 0 }],
        "rpc:responder_vuelta": [{ acerto: true, correcta: 2, explicacion: "Se ataca en otro lado.", puntos: 1, vuelta: 1, proxima: "2026-11-19" }] };
      const { page, ctx, errores } = await abrir(browser, "/audios-clases.html", tablas, null, preparar);
      await page.waitForSelector("#repaso-hoy", { timeout: 20000 });
      igual("va antes de la lista, con el enlace a los conceptos", [await texto(page, "#repaso-hoy"),
        await page.$eval('#repaso a[href="audios-clases.html?conceptos"]', (a) => a.textContent)], ["Repaso de hoy", "Conceptos de todas las clases"]);
      igual("dice cuántas y cómo funciona", await texto(page, '[aria-labelledby="repaso-hoy"] > p'),
        "Te tocan 2 preguntas de tus clases. Las que ya contestaste vuelven a los 2, 7 y 21 días, para que no se te olviden; cada acierto da 1 Punto Ajedrez. Las nuevas dan 2 Puntos Ajedrez si aciertas a la primera.");
      igual("cada pregunta dice de qué clase es y si es repaso o nueva", await page.$$eval('[aria-labelledby="repaso-hoy"] legend', (ls) => ls.map((l) => l.textContent)),
        ["Clase del Martes 3 de noviembre (repaso 1 de 3): ¿Qué es el contrajuego?", "Clase del Martes 10 de noviembre (nueva): ¿Qué pieza da el mate del pasillo?"]);
      await page.check('input[name="rep-a1-2"][value="2"]');
      await page.click('[aria-labelledby="repaso-hoy"] fieldset:first-of-type button');
      await page.waitForFunction(() => /Correcto/.test(document.querySelector('[aria-labelledby="repaso-hoy"] fieldset [role="status"]').textContent), null, { timeout: 3000 });
      igual("la vuelta se contesta con responder_vuelta y dice cuándo vuelve",
        [await page.evaluate(() => window.__rpcArgs.filter((x) => /responder/.test(x[0]))), await texto(page, '[aria-labelledby="repaso-hoy"] fieldset [role="status"]')],
        [[["responder_vuelta", { p_audio: "a1", p_n: 2, p_opcion: 2 }]], "¡Correcto! Ganaste 1 Punto Ajedrez. Se ataca en otro lado. Vuelve el Jueves 19 de noviembre."]);
      igual("sin errores en la página", errores, []);
      await ctx.close();
    }

    console.log("\n=== Subir la transcripción de Whisper con sus minutos ===");
    {
      const clase = Object.assign({}, AUDIOS[0], { minutos_aproximados: true,
        indice: [{ seg: 100, titulo: "La italiana", concepto: "Apertura", cita: "ahora vamos con la apertura italiana clásica" }] });
      const tablas = { audios_clase: [clase], audios_clase_partidas: [{ id: "p1", audio_id: "a2", orden: 1, seg: 130, titulo: "Italiana", jugadas: "e4 e5", revisada: false }],
        "rpc:mis_academias_audios": [{ id: ADAES, nombre: "ADAES" }] };
      const { page, ctx, errores } = await abrir(browser, "/audios-clases.html", tablas, null, preparar);
      await page.waitForSelector("#lista article", { timeout: 20000 });
      const whisper = { text: "…", language: "es", segments: [{ id: 0, start: 2.4, end: 5, text: " Muy buenas noches." },
        { id: 1, start: 160.2, end: 163, text: " Ahora vamos con la apertura italiana clásica." }] };
      await page.setInputFiles("#subir-archivos", [{ name: "Clase Selección ADAES - 2026_11_10 19_25 CST - Recording.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(whisper)) }]);
      await page.click("#subir-boton");
      await page.waitForFunction(() => /minutos exactos/.test(document.getElementById("subir-estado").textContent) && !document.getElementById("subir-boton").disabled, null, { timeout: 5000 });
      igual("lo dice, con cuántos temas encontró", await texto(page, "#subir-estado"),
        "Clase Selección ADAES - 2026_11_10 19_25 CST - Recording.json: minutos exactos puestos (1 de 1 temas encontrados en su minuto).");
      igual("cambia el texto, mueve el tema y la partida, y ya no son aproximados", await page.evaluate(() => window.__updates.map((u) => [u.tabla, u.campos, u.filas])), [
        ["audios_clase", { segmentos: [[2, "Muy buenas noches."], [160, "Ahora vamos con la apertura italiana clásica."]],
          transcripcion: "Muy buenas noches.\nAhora vamos con la apertura italiana clásica.",
          indice: [{ seg: 160, titulo: "La italiana", concepto: "Apertura", cita: "ahora vamos con la apertura italiana clásica" }], minutos_aproximados: false }, 1],
        ["audios_clase_partidas", { seg: 190 }, 1]]);
      igual("no toca el resumen, las preguntas ni las partidas", await page.evaluate(() => [(window.__deletes || []).length, (window.__inserts || []).length]), [0, 0]);
      igual("sin errores en la página", errores, []);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " falla(s)." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
