/* Comprueba la página de Reportes de punta a punta, en un navegador de verdad:
   que solo entre quien corresponde, que la vista previa diga lo que dicen los
   datos, y que los dos archivos que se descargan se puedan abrir.

   POR QUÉ EXISTE. Un informe roto no da error: se descarga igual. Un .docx con
   una etiqueta mal cerrada abre en Word con el aviso de "contenido ilegible";
   un PDF con la tabla de posiciones mal calculada no abre en ningún lado; y una
   marca de agua que no se dibuja se ve perfecta en la vista previa y falta en el
   papel, que es donde importa. Nada de eso se nota mirando la página.

   Lo que NO se prueba acá es la transcripción: necesita bajar el modelo de
   Whisper, que son decenas de megas y no se puede pedir en cada comprobación.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-reportes.js                                */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || undefined;
const BASE = process.env.BASE_URL || "http://127.0.0.1:8777";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function cumple(nombre, condicion, detalle) {
  if (condicion) console.log("  ✓ " + nombre + (detalle ? ": " + detalle : ""));
  else { console.log("  ✗ " + nombre + (detalle ? " — " + detalle : "")); fallos += 1; }
}

/* Los datos que devolvería public.reporte_actividades(): se escriben acá para
   que la comprobación no dependa de lo que haya en la base ese día. */
const DATOS = {
  desde: "2026-09-01", hasta: "2026-09-30", generado: "2026-09-16T20:00:00Z",
  totales: { clases: 4, clases_cerradas: 4, estudiantes: 4, asistencias: 5, minutos: 36,
             preguntas: 29, respuestas: 56, aciertos: 13 },
  clases: [
    { id: "1", title: "Táctica básica", started_at: "2026-09-14T15:31:50Z", ended_at: "2026-09-14T15:38:50Z",
      notes: "Horquillas y clavadas. Cada niño resolvió cinco posiciones.", duracion_min: 7, asistentes: 1,
      profesor: "Oscar Angulo Cubero", estudiantes: ["Jean Quesada Arauz"] },
    { id: "2", title: "Finales de peones", started_at: "2026-09-15T03:41:57Z", ended_at: "2026-09-15T03:54:57Z",
      notes: "La regla del cuadrado y la oposición.", duracion_min: 13, asistentes: 3,
      profesor: "Oscar Angulo Cubero", estudiantes: ["María Herrera", "Sebastián Mora", "Jean Quesada Arauz"] },
  ],
  estudiantes: [
    { id: "a", full_name: "Jean Quesada Arauz", grupo: "SJ", clases: 2, minutos: 19 },
    { id: "b", full_name: "María Herrera", grupo: null, clases: 1, minutos: 12 },
  ],
  preguntas: [{ id: "p1", prompt: "¿Qué jugarías aquí?", created_at: "2026-09-14T15:32:00Z", respuestas: 3, aciertos: 2 }],
};

function clienteFalso(perfil) {
  return `
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
window.__llamadas = [];
(function () {
  const PERFIL = ${JSON.stringify(perfil)};
  const DATOS = ${JSON.stringify(DATOS)};
  function constructor(tabla, filas) {
    const b = {
      select() { return b; }, eq() { return b; }, in() { return b; }, order() { return b; },
      limit() { return b; }, maybeSingle() { b._unica = true; return b; }, single() { b._unica = true; return b; },
      then(res, rej) {
        let d = filas;
        if (Array.isArray(d) && b._unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u-1" }, access_token: "t" } } }) },
    from: (t) => constructor(t, t === "profiles" ? [PERFIL] : []),
    rpc: (nombre, args) => {
      window.__llamadas.push({ rpc: nombre, args: args });
      return Promise.resolve({ data: nombre === "reporte_actividades" ? DATOS : null, error: null });
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  };
})();
`;
}

async function abrir(contexto, perfil) {
  // Los dobles van en el CONTEXTO y no en la página: esta página registra el
  // service worker, y lo que pide el service worker no pasa por las rutas de
  // una página. Con las rutas en la página, al recargar servía la copia
  // cacheada del cliente de verdad y todo se caía con "sb is not defined".
  await contexto.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await contexto.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await contexto.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await contexto.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(perfil) }));
  const p = await contexto.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(String(e).split("\n")[0]));
  await p.goto(BASE + "/reportes.html", { waitUntil: "networkidle" });
  await p.waitForTimeout(700);
  return { p, errores };
}

/* Un JPEG y un CSV de mentira, para soltarlos en la zona de archivos. */
const FOTO_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
  "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCABQAFABAREA/8QAHwAAAQUBAQEB" +
  "AQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1Fh" +
  "ByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZ" +
  "WmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG" +
  "x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+iiigAooooAKKKKAC" +
  "iiigAooooAKKKKACiiigAooooAKKKKACiiigD//Z";

/* Un WAV de 2 segundos, estéreo y a 44.100 Hz: ni el muestreo ni la cantidad de
   canales que espera Whisper, que es justo lo que hay que convertir. Se escribe
   acá para no depender de ningún archivo suelto. */
function wavDePrueba(segundos) {
  const tasa = 44100, marcos = tasa * segundos, datos = marcos * 4;   // 2 canales × 16 bits
  const b = Buffer.alloc(44 + datos);
  b.write("RIFF", 0); b.writeUInt32LE(36 + datos, 4); b.write("WAVE", 8);
  b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(2, 22); b.writeUInt32LE(tasa, 24); b.writeUInt32LE(tasa * 4, 28);
  b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(datos, 40);
  for (let i = 0; i < marcos; i++) {
    const v = Math.round(12000 * Math.sin((2 * Math.PI * 440 * i) / tasa));
    b.writeInt16LE(v, 44 + i * 4); b.writeInt16LE(v, 46 + i * 4);
  }
  return b;
}

/* La cuadrícula de asistencia tal como la lleva una persona: nombres a la
   izquierda, fechas arriba, una X donde vino. La casilla vacía es una falta. */
const ASISTENCIA_CSV = [
  "Estudiante;02/09/2026;09/09/2026;16/09/2026;23/09/2026",
  "Ana Rojas;X;X;X;X",
  "Bruno Vega;X;;X;X",
  "Carla Mora;;X;X;",
  "Diego Solís;X;X;;X",
  "Total;3;3;3;3",
].join("\n");

const BITACORA = [
  "Bitácora del grupo de la tarde",
  "",
  "02/09/2026 — Táctica: la horquilla",
  "Empezamos con el caballo. Cada niño resolvió cinco horquillas en el tablero grande.",
  "",
  "09/09/2026 — Finales de peones",
  "La regla del cuadrado y la oposición. Costó más de lo esperado.",
  "",
  "16 de septiembre de 2026 — Aperturas",
  "Centro, desarrollo y enroque. Partida de práctica por parejas.",
].join("\n");

/* El modo de clases externas, sobre la misma página ya abierta: se cambia el
   selector, se sueltan los archivos y se mira el informe que sale. */
async function probarModoExterno(navegador, carpeta) {
  // Página limpia a propósito: el modo externo tiene que armar el informe SOLO
  // con lo que se le da. Reutilizando la página anterior se colaban sus
  // archivos y los números salían de dos sitios a la vez.
  const contexto = await navegador.newContext({ acceptDownloads: true });
  const { p, errores } = await abrir(contexto, {
    id: "u-1", full_name: "Oscar Angulo Cubero", role: "profesor", is_admin: true, es_coordinador: true,
  });
  await p.check('input[name="modo"][value="externo"]');
  await p.waitForTimeout(400);

  igual("desaparece el paso del periodo: las fechas salen de las hojas",
    await p.evaluate(() => document.getElementById("paso-periodo").hidden), "true");
  igual("y aparece el título propio del informe",
    await p.evaluate(() => !document.getElementById("campo-titulo").hidden), "true");

  await p.setInputFiles("#archivos", [
    { name: "asistencia.csv", mimeType: "text/csv", buffer: Buffer.from(ASISTENCIA_CSV, "utf8") },
    { name: "bitacora.txt", mimeType: "text/plain", buffer: Buffer.from(BITACORA, "utf8") },
  ]);
  await p.waitForTimeout(1500);

  const vista = await p.textContent("#vista");
  cumple("cuenta las clases y la asistencia del grupo",
    /Se impartieron 4 clases/.test(vista) && /75 % de asistencia/.test(vista));
  cumple("saca la asistencia por clase", vista.includes("Asistencia por clase"));
  cumple("y dice quién faltó cada día", /No vinieron: Carla Mora/.test(vista));
  cumple("saca la asistencia por estudiante, con su porcentaje",
    vista.includes("Asistencia por estudiante") && /50 %/.test(vista));
  cumple("avisa de quien va por debajo del 70 %", /Por debajo del 70 %/.test(vista));
  cumple("pega el contenido del documento en la clase de su fecha",
    vista.includes("Empezamos con el caballo"));
  /* Que el informe DIGA cómo leyó la hoja no es un adorno: una cuadrícula mal
     entendida da números creíbles y falsos, y esta es la única forma de que el
     error se vea. */
  cumple("y explica de dónde salen los números",
    vista.includes("De dónde salen estos números") && vista.includes("en blanco se contaron como falta"));
  cumple("no mezcla nada de la Academia: este informe no la consultó",
    !/posiciones en la pizarra/.test(vista));

  const [descarga] = await Promise.all([
    p.waitForEvent("download", { timeout: 30000 }), p.click("#bajar-pdf")]);
  const destino = path.join(carpeta, "externo-" + descarga.suggestedFilename());
  await descarga.saveAs(destino);
  cumple("el PDF del informe externo se descarga", fs.statSync(destino).size > 3000,
    (fs.statSync(destino).size / 1024).toFixed(0) + " KB");

  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await contexto.close();
}

/* La transcripción.
 *
 * Lo que SÍ se prueba de verdad: que el audio se decodifique bien —cualquier
 * muestreo y cualquier número de canales a 16 kHz en mono, que es lo único que
 * entiende Whisper—, y que el texto que sale llegue hasta el informe.
 *
 * Lo que NO se prueba: el modelo. Son 80 MB que habría que bajar en cada
 * corrida, así que se reemplaza el motor por la costura que existe justo para
 * esto (`_usarMotor`). O sea: acá se comprueba todo menos si Whisper entiende
 * bien el español, que es lo único que hay que mirar a mano con una grabación
 * de verdad. */
async function probarTranscripcion(navegador) {
  console.log("\n=== La transcripción ===");
  const contexto = await navegador.newContext();
  const { p, errores } = await abrir(contexto, {
    id: "u-1", full_name: "Oscar Angulo Cubero", role: "profesor", is_admin: true, es_coordinador: true,
  });

  igual("este navegador puede transcribir",
    await p.evaluate(() => window.ReporteTranscribir.hayCómo()), "true");

  // --- decodificar: esto es de verdad, con un WAV de verdad
  const wav = wavDePrueba(2).toString("base64");
  const audio = await p.evaluate(async (wav) => {
    const bin = atob(wav); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const muestras = await window.ReporteTranscribir.decodificar(
      new File([u], "clase.wav", { type: "audio/wav" }));
    let pico = 0;
    for (let i = 0; i < muestras.length; i++) pico = Math.max(pico, Math.abs(muestras[i]));
    return { n: muestras.length, float32: muestras instanceof Float32Array, pico: pico };
  }, wav);
  igual("2 segundos de audio dan 32.000 muestras a 16 kHz", audio.n, 32000);
  igual("y vienen como Float32Array, que es lo que pide el modelo", audio.float32, "true");
  cumple("no es silencio: el audio se decodificó de verdad", audio.pico > 0.1, audio.pico.toFixed(3));

  /* Que el WORKER arranque de verdad. No se puede bajar el modelo acá, pero sí
     comprobar que el archivo existe, que el navegador lo acepta como worker de
     módulo y que su camino de error devuelve un mensaje en vez de quedarse
     mudo — que es como se vería un worker roto desde la página. */
  const delWorker = await p.evaluate(() => new Promise((listo) => {
    let w;
    try { w = new Worker("js/reporte-transcribir-worker.js", { type: "module" }); }
    catch (e) { return listo({ arranco: false, porque: String(e) }); }
    const reloj = setTimeout(() => listo({ arranco: true, respondio: false }), 8000);
    w.onerror = (e) => { clearTimeout(reloj); listo({ arranco: false, porque: e.message || "error del worker" }); };
    w.onmessage = (e) => {
      clearTimeout(reloj);
      listo({ arranco: true, respondio: true, tipo: e.data && e.data.tipo, hayMensaje: !!(e.data && e.data.error) });
      w.terminate();
    };
    // Un CDN que no existe: tiene que contestar con un error, no callarse.
    w.postMessage({ cdn: "https://127.0.0.1:1/no-existe.js", modelo: "x", muestreo: 16000,
                    muestras: new Float32Array(16) });
  }));
  igual("el worker de transcripción arranca", delWorker.arranco, "true");
  igual("y cuando algo le falla, lo dice en vez de quedarse mudo",
    delWorker.respondio && delWorker.tipo === "error" && delWorker.hayMensaje, "true");

  // --- el motor de mentira, para probar el camino completo sin bajar 80 MB
  await p.evaluate(() => {
    window.__avances = [];
    window.ReporteTranscribir._usarMotor(async (muestras, alAvanzar) => {
      window.__muestrasRecibidas = muestras.length;
      alAvanzar({ etapa: "modelo", porcentaje: 50 });
      alAvanzar({ etapa: "transcribiendo" });
      return "Hoy repasamos la horquilla de caballo y cada niño resolvió cinco posiciones.";
    });
  });

  await p.setInputFiles("#archivos", [
    { name: "clase-del-14.wav", mimeType: "audio/wav", buffer: wavDePrueba(2) },
  ]);
  await p.waitForTimeout(1200);

  igual("la grabación queda en la lista con su duración",
    await p.evaluate(() => {
      const t = document.querySelector("#lista-archivos").textContent;
      return /clase-del-14\.wav/.test(t) && /0 min 0?2 s/.test(t);
    }), "true");
  igual("y dice que el audio no se sube a ningún lado",
    await p.evaluate(() => /no se sube a ning[úu]n lado/.test(document.querySelector("#lista-archivos").textContent)), "true");

  await p.click('#lista-archivos button:has-text("Transcribir")');
  await p.waitForTimeout(1500);

  igual("al motor le llegan las muestras, no el archivo",
    await p.evaluate(() => window.__muestrasRecibidas), 32000);
  igual("cuando termina, dice cuántas palabras salieron",
    await p.evaluate(() => /Listo: 1[0-9] palabras/.test(document.querySelector("#lista-archivos").textContent)), "true");

  const vista = await p.textContent("#vista");
  cumple("y la transcripción entra al informe",
    vista.includes("Lo que se trabajó, según las grabaciones") &&
    vista.includes("Hoy repasamos la horquilla de caballo"));
  cumple("con el aviso de que es automática y se hizo en esta computadora",
    /se transcribieron en esta misma computadora/.test(vista) && /puede traer errores/.test(vista));

  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await contexto.close();
}

(async () => {
  const navegador = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "reportes-"));

  // ------------------------------------------------- quién puede entrar
  console.log("=== Quién puede entrar ===");
  {
    const contexto = await navegador.newContext();
    const { p } = await abrir(contexto, { id: "u-1", full_name: "Ana Rojas", role: "profesor", is_admin: false, es_coordinador: false });
    igual("un profesor sin coordinación NO entra",
      await p.evaluate(() => !document.getElementById("denegado").classList.contains("hidden")), "true");
    igual("y no se le pinta la herramienta",
      await p.evaluate(() => document.getElementById("app").classList.contains("hidden")), "true");
    await contexto.close();
  }

  // ------------------------------------------------------- el informe
  console.log("\n=== El informe ===");
  const contexto = await navegador.newContext({ acceptDownloads: true });
  const { p, errores } = await abrir(contexto, {
    id: "u-1", full_name: "Oscar Angulo Cubero", role: "profesor", is_admin: true, es_coordinador: true,
  });
  igual("quien administra sí entra",
    await p.evaluate(() => !document.getElementById("app").classList.contains("hidden")), "true");

  await p.fill("#desde", "2026-09-01");
  await p.fill("#hasta", "2026-09-30");
  await p.click("#traer");
  await p.waitForTimeout(600);

  // La ÚLTIMA llamada, no la primera: al abrirse, la página ya trae sola el mes
  // en curso, así que la primera lleva las fechas de hoy y no las del clic.
  igual("le pide los datos a la base con el periodo elegido",
    await p.evaluate(() => {
      const suyas = window.__llamadas.filter((l) => l.rpc === "reporte_actividades");
      return suyas.length ? suyas[suyas.length - 1].args : null;
    }),
    { p_desde: "2026-09-01", p_hasta: "2026-09-30" });

  igual("y al abrirse ya trae sola el mes en curso, sin que nadie apriete nada",
    await p.evaluate(() => window.__llamadas.filter((l) => l.rpc === "reporte_actividades").length >= 2), "true");

  const vista = await p.textContent("#vista");
  cumple("la vista previa cuenta las clases en palabras", /Se impartieron 4 clases/.test(vista));
  cumple("dice las asistencias y los estudiantes", /5 asistencias de 4 estudiantes/.test(vista));
  cumple("trae el detalle de cada clase", vista.includes("Táctica básica") && vista.includes("Finales de peones"));
  cumple("trae lo que se trabajó", vista.includes("Horquillas y clavadas"));
  cumple("trae la asistencia por estudiante", vista.includes("Jean Quesada Arauz") && vista.includes("María Herrera"));

  // --------------------------------------------- se sueltan archivos
  console.log("\n=== Los archivos que se adjuntan ===");
  const csv = "Fecha;Estudiante;Nota\n14/09/2026;\"Quesada, Jean\";9,5\n15/09/2026;María Herrera;8";
  await p.setInputFiles("#archivos", [
    { name: "clase-del-14.jpg", mimeType: "image/jpeg", buffer: Buffer.from(FOTO_JPEG_B64, "base64") },
    { name: "notas.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") },
  ]);
  await p.waitForTimeout(1200);

  igual("quedan los dos en la lista",
    await p.evaluate(() => document.querySelectorAll("#lista-archivos li").length), 2);

  // La descripción de la foto es lo ÚNICO que va a oír quien use lector de
  // pantalla: la versión adaptada no lleva imágenes.
  igual("la foto pide que se describa",
    await p.evaluate(() => !!document.getElementById("pie-foto-0")), "true");
  await p.fill("#pie-foto-0", "Los niños del grupo de 7° B resolviendo una posición en el tablero grande");
  await p.waitForTimeout(400);
  const vista2 = await p.textContent("#vista");
  cumple("la hoja entra al informe como tabla", vista2.includes("Hoja adjunta: notas.csv") && vista2.includes("Quesada, Jean"));
  cumple("la foto entra al informe", vista2.includes("clase-del-14.jpg"));
  cumple("y quedan listados como material de respaldo", vista2.includes("Material de respaldo"));

  // ------------------------------------------------------ descargas
  console.log("\n=== Los dos archivos ===");
  const bajar = async (selector) => {
    const [descarga] = await Promise.all([p.waitForEvent("download", { timeout: 30000 }), p.click(selector)]);
    const destino = path.join(carpeta, descarga.suggestedFilename());
    await descarga.saveAs(destino);
    return destino;
  };
  const rutaDocx = await bajar("#bajar-docx");
  const rutaPdf = await bajar("#bajar-pdf");
  const rutaHtml = await bajar("#bajar-accesible");

  cumple("el Word se llama por su periodo", /informe-actividades-2026-09-01-a-2026-09-30\.docx$/.test(rutaDocx), path.basename(rutaDocx));
  cumple("el PDF también", /informe-actividades-2026-09-01-a-2026-09-30\.pdf$/.test(rutaPdf), path.basename(rutaPdf));
  cumple("el Word pesa algo", fs.statSync(rutaDocx).size > 5000, (fs.statSync(rutaDocx).size / 1024).toFixed(0) + " KB");
  cumple("el PDF pesa algo", fs.statSync(rutaPdf).size > 5000, (fs.statSync(rutaPdf).size / 1024).toFixed(0) + " KB");
  cumple("y el formato adaptado también", /informe-actividades-.*-adaptado\.html$/.test(rutaHtml), path.basename(rutaHtml));

  // ------------------------------------------------- el formato adaptado
  /* Las reglas son las mismas que ya tiene el material de estudio de los cursos
     (ver herramientas/verificar-material.py): sin imágenes, encabezados en
     orden y todo lo que en el PDF está dibujado, dicho en palabras. */
  console.log("\n=== El formato adaptado ===");
  const html = fs.readFileSync(rutaHtml, "utf8");
  igual("no depende de NINGUNA imagen",
    /<img|background-image/.test(html), "false");
  igual("declara el idioma", /lang="es"/.test(html), "true");
  cumple("lleva al autor", html.includes("Oscar Angulo Cubero"));
  cumple("lleva el aviso de uso", html.includes("No se autoriza"));

  const niveles = (html.match(/<h([1-6])\b/g) || []).map((h) => Number(h.slice(2)));
  igual("tiene exactamente un h1", niveles.filter((n) => n === 1).length, 1);
  igual("y el h1 va primero", niveles[0], 1);
  const salto = niveles.slice(1).some((n, i) => n > niveles[i] + 1);
  igual("no salta niveles de encabezado (h2 a h4 y esas cosas)", salto, "false");

  cumple("las tablas son tablas de verdad, con encabezados marcados",
    /<th scope="col">/.test(html) && /<th scope="row">/.test(html));
  // El <caption> va siempre, aunque quede escondido a la vista cuando repite el
  // encabezado de arriba: es lo que identifica a la tabla para quien salta de
  // tabla en tabla con el lector de pantalla.
  cumple("y cada una dice de qué es", /<caption[ >]/.test(html));
  cumple("y cuando el título repite el encabezado, se esconde solo a la vista",
    /<caption class="solo-lectores">/.test(html) && /\.solo-lectores\s*\{/.test(html));
  cumple("escondido de la vista, pero NO del lector de pantalla",
    !/\.solo-lectores\s*\{[^}]*(display:\s*none|visibility:\s*hidden)/.test(html));
  cumple("dice lo mismo que el informe: los números",
    html.includes("Se impartieron 4 clases") && html.includes("Jean Quesada Arauz"));
  cumple("y lo que se trabajó", html.includes("Horquillas y clavadas"));
  cumple("la foto está CONTADA en palabras, ya que no se puede ver",
    html.includes("Los niños del grupo de 7") && html.includes("Fotografía:"));

  /* ======================================================================
     EL SEGUNDO MODO: clases dadas por fuera de la plataforma.
     Acá no se consulta nada: todo tiene que salir de los archivos.

     La hoja de prueba va como CSV y no como .xlsx a propósito: se escribe acá
     mismo, así la comprobación no depende de ningún archivo suelto que haya
     que mantener al día. Lo que se prueba —entender una cuadrícula de
     asistencia— es igual en los dos formatos.
     ====================================================================== */
  console.log("\n=== Clases dadas por fuera ===");
  await probarModoExterno(navegador, carpeta);

  await probarTranscripcion(navegador);

  // ------------------------------------------- que la página SE VEA
  /* Esta página se clonó de formularios.html, y clonar una cabecera ya salió
     mal una vez: se coló el </style> de la original y el navegador imprimió el
     resto del CSS como texto. No dio ningún error — la página "funcionaba",
     solo que se veía rota. Y verificar-css.js tampoco lo vería, porque todo
     esto solo existe después de iniciar sesión. */
  console.log("\n=== Que la página se vea ===");
  igual("no hay CSS impreso como texto",
    await p.evaluate(() => /[{;]\s*(max-width|font-family|border-radius)\s*:/.test(document.body.innerText)), "false");
  igual("no se coló ningún bloque de estilos suelto",
    await p.evaluate(() => document.querySelectorAll("style").length), 0);
  igual("la tarjeta tiene su fondo y su borde redondeado, o sea que el CSS llegó",
    await p.evaluate(() => {
      const c = getComputedStyle(document.querySelector("#app section"));
      return c.borderRadius !== "0px" && c.backgroundColor !== "rgba(0, 0, 0, 0)";
    }), "true");
  /* El otro accidente al clonar una cabecera fue quedarse SIN el script del
     <head> que aplica el tema: la página salía siempre clara aunque el resto
     del sitio estuviera en oscuro, y tampoco daba error. Se comprueba como se
     nota de verdad: con el tema guardado en oscuro, al cargar la página el
     <html> tiene que venir ya con la clase puesta. */
  await p.evaluate(() => localStorage.setItem("theme", "dark"));
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  igual("con el tema en oscuro, la página arranca en oscuro",
    await p.evaluate(() => document.documentElement.classList.contains("dark")), "true");
  await p.evaluate(() => localStorage.removeItem("theme"));

  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await contexto.close();
  await navegador.close();

  // Los archivos se revisan por fuera, con pypdf y zipfile: ver
  // herramientas/verificar-reportes.py. Este script NO lo llama: lo encadena
  // verificar-todo.js leyendo la carpeta de la línea de abajo.
  fs.writeFileSync(path.join(carpeta, "donde.txt"), carpeta);
  console.log("\nLos dos archivos quedaron en: " + carpeta);
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nLa página, bien.");
  process.exit(fallos ? 1 : 0);
})();
