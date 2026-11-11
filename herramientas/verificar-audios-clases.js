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
      igual("el alumno no ve «Subir audios» ni «Quitar»", [await visible(page, "#subir"), await page.$$eval("#lista button", (b) => b.length)], [false, 0]);

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
      igual("y «Quitar» en cada audio, diciendo cuál", await page.$$eval("#lista button", (b) => b.map((x) => x.getAttribute("aria-label"))),
        ["Quitar el audio de la clase del Martes 10 de noviembre de 2026", "Quitar el audio de la clase del Martes 3 de noviembre de 2026"]);
      await page.click("#subir-boton");
      igual("sin archivos, lo dice", await texto(page, "#subir-estado"), "Elige al menos un archivo MP3.");
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
