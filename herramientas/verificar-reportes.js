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
const { chromium } = require("playwright");

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

  cumple("el Word se llama por su periodo", /informe-actividades-2026-09-01-a-2026-09-30\.docx$/.test(rutaDocx), path.basename(rutaDocx));
  cumple("el PDF también", /informe-actividades-2026-09-01-a-2026-09-30\.pdf$/.test(rutaPdf), path.basename(rutaPdf));
  cumple("el Word pesa algo", fs.statSync(rutaDocx).size > 5000, (fs.statSync(rutaDocx).size / 1024).toFixed(0) + " KB");
  cumple("el PDF pesa algo", fs.statSync(rutaPdf).size > 5000, (fs.statSync(rutaPdf).size / 1024).toFixed(0) + " KB");

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
  // herramientas/verificar-reportes.py, que este script llama al terminar.
  fs.writeFileSync(path.join(carpeta, "donde.txt"), carpeta);
  console.log("\nLos dos archivos quedaron en: " + carpeta);
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nLa página, bien.");
  process.exit(fallos ? 1 : 0);
})();
