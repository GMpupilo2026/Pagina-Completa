/* El comentario al aceptar o rechazar una inscripción previa de «Torneos en
 * Pareo Integral», y el aviso por correo a quien inscribió (pareo.html, ficha
 * Archivos, «Inscripción antes del torneo»; js/pareo/pagina.js
 * pintarInscripciones; la Edge Function pareo-publicar, acción «marcar»).
 * Lo pidió el dueño para la Eliminatoria Cantonal JDN de Pérez Zeledón.
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - aceptar y rechazar piden el comentario (al rechazar, el motivo) y dicen
 *     antes de confirmar si a quien inscribió le llega un correo o si dejó un
 *     teléfono y no se le avisa;
 *   - cancelar el cuadro no marca nada;
 *   - el comentario viaja con «marcar», queda en la tarjeta marcada y sigue
 *     ahí al volver a leer las inscripciones (lo guarda la base);
 *   - la tarjeta dice si se le avisó por correo, si dejó un teléfono o si el
 *     correo no salió, y el árbitro recibe el aviso de avisarle él;
 *   - el correo (correos.ts) escapa todo lo que escribió cualquiera, el
 *     asunto no lleva saltos de línea y solo se manda si el contacto es un
 *     correo (index.ts, leído como texto: acá no hay Deno ni red).
 *
 * El navegador habla con un doble de la Edge Function que hace lo mismo que
 * ella con la base: guarda el estado y el comentario, y avisa solo a los
 * contactos que son correo (uno «falla» a propósito).
 *
 * Uso:  BASE_URL=http://localhost:8777 node herramientas/verificar-pareo-inscripcion-comentario.js
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const ok = (c, m, detalle) => {
  if (c) console.log("  ✓ " + m);
  else { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; }
};
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};
const dialogo = 'dialog[data-avisos="formulario"][open]';

function pruebaCorreoYFuncion() {
  console.log("\n=== El correo del aviso y la función (sin navegador) ===");
  const MALO = '<img src=x onerror="alert(1)">';
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
    `import * as C from ${JSON.stringify(require("url").pathToFileURL(path.join(RAIZ, "supabase/functions/pareo-publicar/correos.ts")).href)};
     const M = process.argv[1], cab = "<tr><td>CABECERA</td></tr>";
     console.log(JSON.stringify({
       rechazo: C.correoDecision(cab, "Eliminatoria\\nPZ", M, { nombre: M, responsable: M }, "rechazada", M, true),
       acepta: C.correoDecision(cab, "Eliminatoria PZ", "", { nombre: "PRUEBA NIÑO" }, "aceptada", "", false),
       bienvenida: C.correoDecision(cab, "Eliminatoria PZ", "ADAPZ", { nombre: "PRUEBA NIÑA", responsable: "Mamá", institucion: "ADAPZ", categoria: "U16", sexo: "F", nacimiento: "2014-03-09", elo: 1500, fide_id: "123" }, "aceptada", "Traer reloj", true,
         { fecha: "2026-11-21", hora: "08:00", lugar: "Gimnasio <b>", ritmo: "15+10", rondas: 6, contacto: "8888-8888", bases: "Cuota: 2000", url: "https://ajedrez-integral.com/torneos-pareo.html#t=abc" }),
       fecha: [C.fechaLarga("2026-11-21"), C.fechaLarga("2026-02-31"), C.fechaLarga("")],
       sinResponder: C.correoDecision(cab, "Eliminatoria PZ", "ADAPZ", { nombre: "PRUEBA" }, "rechazada", "Falta el ID FIDE", false),
       correos: ["papa@ejemplo.com", " mama@ejemplo.co.cr ", "8888-8888", "+506 8888 8888", "sin arroba.com", ""].map(C.esCorreo),
     }));`, MALO], { encoding: "utf8" });
  if (r.status !== 0) { ok(false, "correos.ts se carga con Node", r.stderr); return; }
  const x = JSON.parse(r.stdout);
  ok(!x.rechazo.html.includes("<img") && x.rechazo.html.includes("&lt;img"), "el nombre, la organización y el motivo llegan escapados");
  ok(!/[\r\n]/.test(x.rechazo.asunto) && /^Inscripción rechazada en «Eliminatoria PZ»/.test(x.rechazo.asunto), "el asunto dice qué pasó y no lleva saltos de línea", x.rechazo.asunto);
  ok(/Motivo:/.test(x.rechazo.html) && /responde a este correo/.test(x.rechazo.html), "el rechazo trae el motivo y, con la organización confirmada, invita a responder");
  ok(/^¡Bienvenida a «Eliminatoria PZ»! Inscripción aceptada/.test(x.acepta.asunto) && /Quien organiza el torneo aceptó/.test(x.acepta.html) && !/Comentario de la organización:/.test(x.acepta.html) && !/El torneo<\/strong>[\s\S]*Fecha/.test(x.acepta.html), "aceptar sin comentario ni datos del torneo no deja recuadros ni filas vacías", x.acepta.asunto);
  const b = x.bienvenida.html;
  ok(/bienvenida/.test(b) && /sábado 21 de noviembre de 2026/.test(b) && /08:00/.test(b) && /15\+10/.test(b) && /Cuota: 2000/.test(b) && /09\/03\/2014/.test(b) && /Femenino/.test(b) && /U16/.test(b) && /Traer reloj/.test(b), "la bienvenida trae los datos de la inscripción y del torneo, con el comentario");
  ok(!b.includes("Gimnasio <b>") && b.includes("Gimnasio &lt;b&gt;") && /torneos-pareo\.html#t=abc/.test(b), "los datos del torneo llegan escapados y el botón lleva al torneo");
  igual("la fecha larga, y nada con una fecha que no existe", x.fecha, ["sábado 21 de noviembre de 2026", "", ""]);
  ok(!/responde a este correo/.test(x.sinResponder.html) && /escríbele a quien organiza/.test(x.sinResponder.html), "sin correo de la organización no promete que responder llegue a alguien");
  igual("solo un correo es correo (un teléfono no)", x.correos, [true, true, false, false, false, false]);

  const fn = fs.readFileSync(path.join(RAIZ, "supabase/functions/pareo-publicar/index.ts"), "utf8");
  const marcar = fn.slice(fn.indexOf('if (accion === "inscripciones" || accion === "marcar")'), fn.indexOf("// ---------- Seguir a un jugador por correo"));
  ok(/update\(\{ estado, comentario \}\)/.test(marcar), "«marcar» guarda el comentario con el estado");
  ok(/if \(x\.aviso_estado === estado\) continue;/.test(marcar), "«marcar» no reenvía el correo de una decisión ya avisada");
  ok(/texto\(body\.comentario, 300\)/.test(marcar), "y lo acota a 300 caracteres, como la base");
  ok(/if \(!esCorreo\(x\.contacto\)\) \{ sinCorreo\.push/.test(marcar), "con un teléfono no se manda nada");
  ok(/correoDecision\(/.test(marcar) && /responderA\)/.test(marcar), "con un correo se manda el aviso, con la respuesta a la organización");
  ok(/anuncio:datos->anuncio/.test(marcar) && /, evento\), responderA\)/.test(marcar), "la bienvenida lleva los datos del torneo publicado");
  ok(/update\(\{ avisado: new Date\(\)\.toISOString\(\), aviso_estado: estado \}\)\.in\("id", avisados\)/.test(marcar), "y anota cuándo salió y qué decisión se avisó");
  ok(/comentario, avisado, creado/.test(marcar), "«inscripciones» devuelve el comentario y si se avisó");
  ok(/reply_to: responderA/.test(fn), "mandar() sabe poner a quién se responde");
  const migraciones = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).filter((f) => /pareo_preinscripciones_comentario/.test(f));
  const sql = migraciones.length ? fs.readFileSync(path.join(RAIZ, "supabase/migraciones", migraciones[0]), "utf8") : "";
  ok(/add column comentario text not null default '' check \(char_length\(comentario\) <= 300\)/.test(sql) && /add column avisado timestamptz/.test(sql), "la migración agrega las dos columnas", migraciones.join(","));
  const migAviso = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).filter((f) => /pareo_preinscripciones_aviso_estado/.test(f));
  const sqlAviso = migAviso.length ? fs.readFileSync(path.join(RAIZ, "supabase/migraciones", migAviso[0]), "utf8") : "";
  ok(/add column if not exists aviso_estado text/.test(sqlAviso), "una migración agrega aviso_estado (para no reenviar la misma decisión)", migAviso.join(","));
}

// El doble de la Edge Function: guarda lo que «marcar» cambia, como la base,
// y «avisa» a los contactos que son correo, salvo al que falla a propósito.
const FALLA = "falla@ejemplo.com";
async function dobleFuncion(page, filas) {
  const pedidos = [];
  const esCorreo = (c) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(c || "").trim());
  await page.route("**/functions/v1/pareo-publicar", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 200, body: "ok" });
    const body = JSON.parse(route.request().postData() || "{}");
    pedidos.push(body);
    let r = { ok: true, id: body.id };
    if (body.accion === "inscripciones") r = { ok: true, inscripciones: JSON.parse(JSON.stringify(filas)) };
    if (body.accion === "marcar") {
      const avisados = [], sinCorreo = [];
      for (const f of filas.filter((x) => body.ids.includes(x.id))) {
        f.estado = body.estado; f.comentario = body.comentario || "";
        if (body.estado === "pendiente") continue;        // pendiente no avisa
        if (f.aviso_estado === body.estado) continue;     // ya se avisó esta decisión: no reenvía
        if (!esCorreo(f.contacto)) sinCorreo.push(f.id);
        else if (f.contacto !== FALLA) { avisados.push(f.id); f.avisado = "2026-11-13T18:00:00Z"; f.aviso_estado = body.estado; }
      }
      r = { ok: true, avisados, sinCorreo };
    }
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(r) });
  });
  return pedidos;
}

const ID = (n) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n.repeat(12)}`;
const fila = (n, nombre, responsable, contacto) => ({ id: ID(n), nombre, institucion: "ADAPZ", categoria: "U16 Absoluto", elo: null, fide_id: "", sexo: "M", nacimiento: "2012-09-25",
  responsable, contacto, nota: "Declara estar afiliado a la ADAPZ.", estado: "pendiente", comentario: "", avisado: null, creado: "2026-11-12T10:00:00Z" });

// Las pestañas no siempre se dejan clickear con Playwright en esta máquina:
// se activan con el click del propio elemento.
const tocar = (page, sel) => page.$eval(sel, (n) => n.click());
const textoDe = (page, sel) => page.$eval(sel, (n) => n.textContent).catch(() => "");

async function pruebaNavegador(browser) {
  console.log("\n=== Aceptar y rechazar con comentario, desde Pareo ===");
  const filas = [
    fila("1", "PRUEBA TELÉFONO", "PRUEBA PAPÁ", "8888-8888"),
    fila("2", "PRUEBA CORREO", "PRUEBA MAMÁ", "mama@ejemplo.com"),
    fila("3", "PRUEBA OTRO", "PRUEBA TÍA", "tia@ejemplo.com"),
    fila("4", "PRUEBA FALLA", "PRUEBA TÍO", FALLA),
  ];
  const t = T.nuevo({ nombre: "PRUEBA ELIMINATORIA", fechaInicio: "2026-11-21" });
  t.publicado = { id: "00000000-0000-4000-8000-000000000001", clave: "clave-1", hora: 1 };
  t.inscripcion = { abierta: true, hasta: "2026-11-20" };
  let pedidos;
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", async (p) => {
    pedidos = await dobleFuncion(p, filas);
    await p.addInitScript((x) => {
      if (localStorage.getItem("pareo_lista_v1")) return;
      localStorage.setItem("pareo_lista_v1", JSON.stringify([{ id: "tp", nombre: x.nombre, actualizado: 1, evento: null }]));
      localStorage.setItem("pareo_torneo_v1_tp", JSON.stringify(x));
      localStorage.setItem("pareo_abierto_v1", "tp");
    }, t);
  });
  const marcados = () => pedidos.filter((x) => x.accion === "marcar");
  await tocar(page, '[data-ficha="archivos"]');
  await page.waitForSelector("#pi-insc-ver", { state: "attached" });
  await tocar(page, "#pi-insc-ver");
  await page.waitForSelector("#pi-insc-resumen", { state: "attached" });

  // Rechazar a quien dejó un teléfono: el cuadro lo dice.
  await tocar(page, `[data-rechazar="${ID("1")}"]`);
  await page.waitForSelector(dialogo);
  const d1 = await textoDe(page, dialogo);
  ok(/Motivo del rechazo/.test(d1), "rechazar pide el motivo");
  ok(/teléfono \(8888-8888\): no se le manda correo/.test(d1), "y avisa que con un teléfono no se le manda correo", d1);
  await page.fill(dialogo + " textarea", "No aparece como afiliado a la ADAPZ");
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForSelector(`[data-insc-aviso="${ID("1")}"]`, { state: "attached" });
  const m1 = marcados().pop();
  igual("«marcar» lleva el estado, la clave y el motivo", [m1.estado, m1.ids, m1.clave, m1.comentario], ["rechazada", [ID("1")], "clave-1", "No aparece como afiliado a la ADAPZ"]);
  igual("la tarjeta muestra el motivo", await textoDe(page, `[data-insc-comentario="${ID("1")}"]`), "Motivo: No aparece como afiliado a la ADAPZ");
  igual("y que no se le avisó", await textoDe(page, `[data-insc-aviso="${ID("1")}"]`), "No se le avisó: dejó un teléfono.");
  await page.waitForFunction(() => /PRUEBA TELÉFONO dejó un teléfono: avísale tú/.test(document.body.textContent));
  ok(true, "el árbitro recibe el aviso de avisarle él");

  // Cancelar no marca nada.
  const antes = marcados().length;
  await tocar(page, `[data-rechazar="${ID("2")}"]`);
  await page.waitForSelector(dialogo);
  ok(/A mama@ejemplo\.com le llega un correo diciendo que se rechazó/.test(await textoDe(page, dialogo)), "con un correo, dice que le llega el aviso");
  ok(/Rechazar y avisar/.test(await textoDe(page, dialogo + " [data-avisos-aceptar]")), "y el botón dice que avisa");
  await page.click(dialogo + " [data-avisos-cancelar]");
  await page.waitForSelector(dialogo, { state: "detached" }).catch(() => page.waitForFunction((s) => !document.querySelector(s), dialogo));
  igual("cancelar no marca nada", [marcados().length, filas[1].estado], [antes, "pendiente"]);
  ok(await page.$(`[data-rechazar="${ID("2")}"]`), "y la inscripción sigue por revisar");

  // Rechazar con correo: se le avisa.
  await tocar(page, `[data-rechazar="${ID("2")}"]`);
  await page.waitForSelector(dialogo);
  await page.fill(dialogo + " textarea", "Falta el ID FIDE");
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForSelector(`[data-insc-aviso="${ID("2")}"]`, { state: "attached" });
  igual("con correo, la tarjeta dice que se le avisó", await textoDe(page, `[data-insc-aviso="${ID("2")}"]`), "Se le avisó por correo.");

  // Aceptar las que quedan, juntas, con un comentario: una «falla».
  await tocar(page, "#pi-insc-todas");
  await page.waitForSelector(dialogo);
  const d3 = await textoDe(page, dialogo);
  ok(/Aceptar las 2 por revisar/.test(d3) && /Comentario \(opcional\)/.test(d3), "aceptar todas pide un comentario opcional", d3);
  await page.fill(dialogo + " textarea", "Nos vemos el sábado a las 8:00");
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForSelector(`[data-insc-aviso="${ID("4")}"]`, { state: "attached" });
  const m3 = marcados().pop();
  igual("las dos van juntas con el comentario", [m3.estado, m3.ids, m3.comentario], ["aceptada", [ID("3"), ID("4")], "Nos vemos el sábado a las 8:00"]);
  igual("la aceptada muestra el comentario", await textoDe(page, `[data-insc-comentario="${ID("3")}"]`), "Tu comentario: Nos vemos el sábado a las 8:00");
  igual("si el correo no salió, la tarjeta lo dice", await textoDe(page, `[data-insc-aviso="${ID("4")}"]`), "No se le avisó por correo.");
  await page.waitForFunction(() => /No salió el correo de aviso a PRUEBA FALLA/.test(document.body.textContent));
  ok(true, "y el árbitro recibe el aviso de error");
  igual("aceptarlas las agrega a la lista", (await P.leerTodos(page))[0].jugadores.map((j) => j.nombre).sort(), ["PRUEBA FALLA", "PRUEBA OTRO"]);

  // Volver a leerlas: el comentario y el aviso quedaron guardados.
  await tocar(page, "#pi-insc-ver");
  await tocar(page, "#pi-insc-ver");
  await page.waitForFunction(() => !document.getElementById("pi-insc-lista").hidden);
  igual("al volver a leerlas, el motivo sigue ahí", await textoDe(page, `[data-insc-comentario="${ID("2")}"]`), "Motivo: Falta el ID FIDE");
  igual("y si se le avisó", await textoDe(page, `[data-insc-aviso="${ID("2")}"]`), "Se le avisó por correo.");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  pruebaCorreoYFuncion();
  const browser = await chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});
  try {
    await pruebaNavegador(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
