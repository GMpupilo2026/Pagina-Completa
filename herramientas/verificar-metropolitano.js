/* La inscripción del Metropolitano 2026 (inscripcion-metropolitano.html,
 * metropolitano-inscritos.html, js/metropolitano-reglas.js,
 * js/metropolitano-gafete.js y public.metropolitano_inscribir()).
 *
 *   1. Las reglas, sin navegador: en qué torneo puede jugar cada quien y
 *      cuánto paga (recargo, senior, titulados, PayPal, colones).
 *   2. Las DOS copias de las reglas dicen lo mismo: las cifras de la página y
 *      las de la última migración que define metropolitano_inscribir()
 *      (precios, fechas de cierre, 1900, 2012, 65 años, 30 %, 10 %, ₡460).
 *      Si alguien cambia una sola, la página promete un monto y la base cobra
 *      otro, sin ningún error.
 *   3. En un navegador, con un doble de Supabase: la búsqueda en FIDE llena
 *      el ID y el Elo, los torneos se habilitan solos, el resumen enseña el
 *      gafete pintado de verdad (se mide el píxel de la franja), no se manda
 *      sin confirmar, y lo que se manda es lo que se llenó. Y la página de
 *      administración: lee, guarda el pago y arma el gafete.
 *
 * Ver «La inscripción del Metropolitano 2026» en
 * docs/decisiones/cuentas-y-formularios.md.
 *
 *   node herramientas/verificar-metropolitano.js   (con el sitio en localhost:8777)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");

globalThis.window = globalThis;
const R = require("../js/metropolitano-reglas.js");

const RAIZ = path.join(__dirname, "..");
const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function cierto(nombre, v, detalle) {
  if (v) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle !== undefined ? "\n      " + String(typeof detalle === "object" ? JSON.stringify(detalle) : detalle).slice(0, 500) : "")); fallos += 1; }
}
const igual = (n, a, b) => cierto(n, JSON.stringify(a) === JSON.stringify(b), "esperaba " + JSON.stringify(b) + ", salió " + JSON.stringify(a));

/* ============================ 1. Las reglas ============================ */
console.log("1. Las reglas");
igual("1950 nacido en 2013: A, U14 y blitz (no B)", R.elegibles(1950, "2013-05-02").si, ["A", "U14", "BLITZ"]);
igual("1700 adulto: B y blitz", R.elegibles(1700, "1990-01-01").si, ["B", "BLITZ"]);
igual("sin Elo, nacido el 1/1/2012: B, U14 y blitz", R.elegibles(null, "2012-01-01").si, ["B", "U14", "BLITZ"]);
igual("nacido el 31/12/2011 no es U14", R.elegibles(null, "2011-12-31").si, ["B", "BLITZ"]);
igual("1900 justo es A, no B", R.elegibles(1900, 1985).si, ["A", "BLITZ"]);
igual("edad al 26/12: cumple el 26", R.edad("1961-12-26", R.INICIO), 65);
igual("edad al 26/12: cumple el 27", R.edad("1961-12-27", R.INICIO), 64);
const pr = (o) => R.precio(Object.assign({ hoy: "2026-11-04", nacimiento: "1990-01-01", titulo: "" }, o));
igual("A + blitz por transferencia", pr({ torneos: ["A", "BLITZ"], metodo: "dolares" }).usd, 87);
igual("A + blitz en colones", pr({ torneos: ["A", "BLITZ"], metodo: "sinpe" }).crc, 40020);
igual("B por PayPal", pr({ torneos: ["B"], metodo: "paypal" }).usd, 47.93);
igual("recargo del 30 % el 17/12 solo en el clásico", pr({ torneos: ["B", "BLITZ"], metodo: "dolares", hoy: "2026-12-17" }).usd, 70.5);
igual("sin recargo el 16/12", pr({ torneos: ["B"], metodo: "dolares", hoy: "2026-12-16" }).usd, 45);
igual("senior: 10 % en el clásico, no en el blitz (PayPal)", pr({ torneos: ["B", "BLITZ"], metodo: "paypal", nacimiento: "1958-01-01" }).usd, 55.92);
igual("GM: gratis", pr({ torneos: ["A", "BLITZ"], metodo: "dolares", titulo: "GM" }).usd, 0);
igual("FM paga", pr({ torneos: ["A"], metodo: "dolares", titulo: "FM" }).usd, 75);
igual("plazos el 21/12: clásicos cerrados, blitz abierto", R.abierto("2026-12-21"), { clasicos: false, blitz: true, recargo: false });
igual("plazos el 27/12: todo cerrado", R.abierto("2026-12-27").blitz, false);

/* ===================== 2. La página y la base, iguales ===================== */
console.log("2. Las cifras de la página y las de la base");
const MIG = path.join(RAIZ, "supabase", "migraciones");
const ultima = fs.readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort().reverse()
  .find((f) => /create or replace function public\.metropolitano_inscribir/.test(fs.readFileSync(path.join(MIG, f), "utf8")));
cierto("hay una migración que define metropolitano_inscribir()", !!ultima);
if (ultima) {
  const sql = fs.readFileSync(path.join(MIG, ultima), "utf8");
  const cuerpo = sql.slice(sql.indexOf("create or replace function public.metropolitano_inscribir"));
  const tiene = (n, re) => cierto(n, re.test(cuerpo), ultima);
  for (const [k, T] of Object.entries(R.TORNEOS)) {
    tiene(`${T.nombre}: ${T.paypal} por PayPal y ${T.usd} por lo demás`,
      new RegExp(`when '${k}' then case when v_metodo = 'paypal' then ${T.paypal.toFixed(2).replace(/\.?0+$/, "")} else ${T.usd} end`));
  }
  tiene("el recargo va del día después del cierre regular al cierre de los clásicos",
    new RegExp(`hoy > date '${R.CIERRE_REGULAR}' and hoy <= date '${R.CIERRE_CLASICOS}'`));
  tiene(`el recargo es del ${R.RECARGO * 100} %`, new RegExp(`v_monto \\* ${(1 + R.RECARGO).toFixed(2)}`));
  tiene(`el descuento senior es del ${R.DESCUENTO_SENIOR * 100} %`, new RegExp(`v_monto \\* ${(1 - R.DESCUENTO_SENIOR).toFixed(2)}`));
  tiene(`senior desde los ${R.EDAD_SENIOR}, contados al ${R.INICIO}`, new RegExp(`age\\(date '${R.INICIO}', v_nac\\)\\) >= ${R.EDAD_SENIOR}`));
  tiene(`el A pide ${R.ELO_A}`, new RegExp(`v_clasico = 'A' and \\(v_elo is null or v_elo < ${R.ELO_A}\\)`));
  tiene(`el U14 es desde ${R.NACIDOS_U14_DESDE}`, new RegExp(`v_clasico = 'U14' and extract\\(year from v_nac\\) < ${R.NACIDOS_U14_DESDE}`));
  tiene("los clásicos cierran el mismo día", new RegExp(`v_clasico is not null and hoy > date '${R.CIERRE_CLASICOS}'`));
  tiene("el blitz cierra el mismo día", new RegExp(`hoy > date '${R.CIERRE_BLITZ}'`));
  tiene("gratis los mismos títulos", new RegExp(`v_titulo in \\(${R.TITULOS_GRATIS.map((t) => `'${t}'`).join(", ")}\\)`));
  tiene(`el tipo de cambio es ₡${R.TIPO_CAMBIO}`, new RegExp(`round\\(v_total \\* ${R.TIPO_CAMBIO}\\)`));
  cierto("llama al freno antes del insert",
    /frenar_envio_publico\('formulario', 'metropolitano-2026'/.test(cuerpo) && cuerpo.indexOf("frenar_envio_publico") < cuerpo.indexOf("insert into public.metropolitano_inscripciones"));
}

/* ============================ 3. En el navegador ============================ */
const FILAS_FIDE = [
  { fideId: "6400000", nombre: "Mora Solis, Ana", titulo: "WCM", fed: "CRC", sexo: "w", nacimiento: 2013, estandar: 1950, rapido: 1900, blitz: 1880 },
  { fideId: "6400099", nombre: "Mora Solis, Andrea", titulo: "", fed: "CRC", sexo: "w", nacimiento: 1990, estandar: null, rapido: null, blitz: null },
];

(async () => {
  console.log("3. En el navegador");
  const nav = await chromium.launch();
  try {
    const ctx = await nav.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: "block" });
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    const buscado = [], subidos = [];
    let enviado = null;
    await p.route("**/functions/v1/pareo-listas-elo", (r) => { buscado.push(JSON.parse(r.request().postData())); r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, filas: FILAS_FIDE, total: 2, hayMas: false }) }); });
    await p.route("**/storage/v1/object/**", (r) => { subidos.push(decodeURIComponent(new URL(r.request().url()).pathname)); r.fulfill({ contentType: "application/json", body: '{"Key":"x"}' }); });
    await p.route("**/rest/v1/rpc/metropolitano_inscribir", (r) => { enviado = JSON.parse(r.request().postData()).p; r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, codigo: "MET-0012", numero: 12, monto_usd: 87, monto_crc: 40020 }) }); });
    await p.goto(BASE + "/inscripcion-metropolitano.html");

    await p.fill("#buscar-fide", "Mora Sol");
    await p.waitForSelector("#resultados-fide button", { timeout: 8000 });
    igual("se busca en la lista de FIDE con lo escrito", buscado[0], { lista: "fide", q: "Mora Sol" });
    igual("aparecen los dos", await p.locator("#resultados-fide button").count(), 2);
    await p.click("#resultados-fide button >> nth=0");
    igual("elegirse llena nombre y apellidos", [await p.inputValue("#nombre"), await p.inputValue("#apellidos")], ["Ana", "Mora Solis"]);
    cierto("la tarjeta dice a quién eligió", /Elegiste a WCM Mora Solis, Ana/.test(await p.textContent("#elegido-fide")));

    await p.fill("#nacimiento", "2010-05-02"); await p.dispatchEvent("#nacimiento", "change");
    cierto("avisa si la fecha no cuadra con el año de FIDE", /2013/.test(await p.textContent("#nacimiento-aviso")));
    await p.fill("#nacimiento", "2013-05-02"); await p.dispatchEvent("#nacimiento", "change");
    const habilitados = await p.$$eval('input[name="clasico"]', (xs) => xs.filter((x) => !x.disabled).map((x) => x.value));
    igual("con 1950 y nacida en 2013: A, U14 o ninguno", habilitados, ["A", "U14", ""]);
    cierto("el B dice por qué no", /menos de 1900.*1950/.test(await p.textContent("#opciones-clasico")));
    cierto("el responsable aparece por ser menor", await p.isVisible("#caja-responsable"));

    await p.check('input[name="clasico"][value="A"]');
    await p.check("#blitz");
    await p.selectOption("#sexo", "f");
    await p.fill("#documento", "1-2345-0678"); await p.fill("#correo", "ana@ejemplo.com"); await p.fill("#telefono", "+506 8888 1234");
    await p.fill("#resp_nombre", "Luis Mora"); await p.fill("#resp_telefono", "88880000");
    await p.fill("#emer_nombre", "Luis Mora"); await p.fill("#emer_telefono", "88880000");
    await p.check('input[name="hospedaje"][value="si"]');
    await p.check('input[name="comida"][value="desayuno"]'); await p.check('input[name="comida"][value="cena"]');
    await p.check('input[name="metodo"][value="sinpe"]');
    cierto("el total sale en colones por SINPE", /\$87\.00 = ₡40\s?020/.test(await p.textContent("#total")));
    await p.click("#revisar");
    cierto("sin foto no avanza, y lo dice", /foto/.test(await p.textContent("#msg")));
    await p.setInputFiles("#foto", path.join(RAIZ, "img", "fca-logo.png"));
    await p.setInputFiles("#comprobante", path.join(RAIZ, "img", "fca-logo.png"));
    await p.check("#acepta-reglamento"); await p.check("#acepta-imagen"); await p.check("#acepta-datos");
    await p.click("#revisar");
    await p.waitForFunction(() => { const c = document.getElementById("gafete-frente"); return c.width > 100 && c.getContext("2d").getImageData(Math.round(c.width * 0.03), Math.round(c.height * 0.87), 1, 1).data[3] > 0; }, null, { timeout: 15000 });
    igual("el resumen da la bienvenida", await p.textContent("#resumen-titulo"), "Bienvenida al Torneo Metropolitano 2026");
    cierto("el formulario se esconde", !(await p.isVisible("#formulario")));
    // La franja del gafete, del color del Metropolitano A (se mide el píxel, no la clase).
    const pixel = await p.evaluate(() => { const c = document.getElementById("gafete-frente"); const d = c.getContext("2d").getImageData(Math.round(c.width * 0.03), Math.round(c.height * 0.87), 1, 1).data; return [d[0], d[1], d[2]]; });
    igual("la franja del gafete es del color del A", pixel, [0x1d, 0x4e, 0xd8]);
    cierto("el resumen dice los torneos", /Metropolitano A .* y Metropolitano Blitz/.test(await p.textContent("#resumen-datos")));

    await p.click("#enviar");
    cierto("sin confirmar no se manda", enviado === null && /Marca que revisaste/.test(await p.textContent("#msg-enviar")));
    await p.check("#confirmo");
    await p.click("#enviar");
    await p.waitForSelector("#listo:not(.hidden)", { timeout: 10000 });
    igual("se subieron la foto y el comprobante, cada uno a su carpeta", subidos.map((s) => s.split("/").slice(-3, -2)[0]), ["foto", "comprobante"]);
    cierto("lo que se manda es lo que se llenó", enviado && enviado.fide_id === "6400000" && enviado.elo_estandar === 1950 && enviado.titulo === "WCM"
      && JSON.stringify(enviado.torneos) === '["A","BLITZ"]' && JSON.stringify(enviado.comidas) === '["desayuno","cena"]' && enviado.hospedaje === true
      && enviado.pago_metodo === "sinpe" && enviado.validado === true && /^foto\/[a-z0-9-]+\/.+\.jpg$/.test(enviado.foto)
      && enviado.responsable && enviado.responsable.nombre === "Luis Mora", enviado);
    cierto("dice el código", /MET-0012/.test(await p.textContent("#listo-texto")));
    const [descarga] = await Promise.all([p.waitForEvent("download"), p.click("#bajar-gafete")]);
    const pdf = fs.readFileSync(await descarga.path());
    cierto("el gafete se descarga en PDF de 10 × 14 cm, con dos páginas y sin fuentes",
      pdf.slice(0, 5).toString() === "%PDF-" && /\/MediaBox \[0 0 283\.46 396\.85\]/.test(pdf.toString("latin1"))
      && (pdf.toString("latin1").match(/\/Type \/Page\b/g) || []).length === 2 && !/\/Font/.test(pdf.toString("latin1")));
    igual("sin errores en la página", errores, []);

    // Sin ID FIDE: el A no se puede elegir.
    const q = await ctx.newPage();
    await q.goto(BASE + "/inscripcion-metropolitano.html");
    await q.check('input[name="tiene_fide"][value="no"]');
    await q.fill("#nacimiento", "1990-01-01"); await q.dispatchEvent("#nacimiento", "change");
    igual("sin ID FIDE, adulto: B o ninguno", await q.$$eval('input[name="clasico"]', (xs) => xs.filter((x) => !x.disabled).map((x) => x.value)), ["B", ""]);
    cierto("y le explica que la FCA tramita el ID", await q.isVisible("#caja-sin-fide"));

    // La página de administración.
    console.log("   La lista de inscritos");
    const a = await ctx.newPage();
    const fila = Object.assign({}, enviado, { id: "11111111-1111-1111-1111-111111111111", numero: 12, creado: "2026-11-04T15:00:00Z", clasico: "A", monto_usd: 87, monto_crc: 40020,
      comprobante: "comprobante/abcdef12/sinpe.png", foto: "foto/abcdef12/foto.png", pago_estado: "por_revisar", estado: "activa", club: "<b>Club</b>" });
    let revisado = null;
    await a.route("**/rest/v1/**", (r) => r.fulfill({ contentType: "application/json", body: "[]" }));
    await a.route("**/rest/v1/profiles**", (r) => r.fulfill({ contentType: "application/json", body: '{"is_admin":true}' }));
    await a.route("**/rest/v1/metropolitano_inscripciones**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify([fila]) }));
    await a.route("**/rest/v1/rpc/metropolitano_revisar", (r) => { revisado = JSON.parse(r.request().postData()); r.fulfill({ contentType: "application/json", body: JSON.stringify(Object.assign({}, fila, { pago_estado: revisado.p_pago_estado })) }); });
    await a.route("**/storage/v1/object/**", (r) => r.fulfill({ contentType: "image/png", body: fs.readFileSync(path.join(RAIZ, "img", "fca-logo.png")) }));
    await a.goto(BASE + "/metropolitano-inscritos.html");
    await a.waitForSelector("#filas tr", { timeout: 15000 });
    cierto("el club se escribe como texto, no como HTML", (await a.locator("#filas").innerHTML()).includes("&lt;b&gt;Club&lt;/b&gt;"));
    await a.selectOption("#filas select", "verificado");
    await a.click("#filas button:has-text('Guardar')");
    await a.waitForFunction(() => /Verificado/.test(document.querySelector("#filas td:last-child span").textContent));
    igual("guardar el pago llama a metropolitano_revisar", revisado, { p_id: fila.id, p_pago_estado: "verificado", p_estado: "activa", p_nota: "" });
    const [csv] = await Promise.all([a.waitForEvent("download"), a.click("#bajar-gafetes")]);
    const texto = fs.readFileSync(await csv.path(), "utf8");
    cierto("la lista para gafetes trae las columnas de gafetes.html", texto.startsWith("﻿Código;Apellidos;Nombre;FIDE ID;Federación;Elo") && /MET-0012;Mora Solis;Ana;6400000;CRC;1950/.test(texto), texto.slice(0, 200));
  } finally {
    await nav.close();
  }
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron.` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
