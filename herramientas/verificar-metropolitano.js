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
igual("senior por año: nacido el 31/12/1961 ya cuenta", pr({ torneos: ["B"], metodo: "dolares", nacimiento: "1961-12-31" }).usd, 40.5);
igual("nacido el 1/1/1962 no", pr({ torneos: ["B"], metodo: "dolares", nacimiento: "1962-01-01" }).usd, 45);
igual("GM: gratis", pr({ torneos: ["A", "BLITZ"], metodo: "dolares", titulo: "GM" }).usd, 0);
igual("con factura, el 13 % de IVA lo paga quien se inscribe", [pr({ torneos: ["A", "BLITZ"], metodo: "dolares", factura: true }).iva, pr({ torneos: ["A", "BLITZ"], metodo: "dolares", factura: true }).usd], [11.31, 98.31]);
igual("sin costo, la factura no suma IVA", pr({ torneos: ["A"], metodo: "dolares", titulo: "GM", factura: true }).usd, 0);
cierto("la cédula física son 9 dígitos y la jurídica 10", R.FACTURA_TIPOS.fisica.patron.test("105430678") && !R.FACTURA_TIPOS.fisica.patron.test("1-0543-0678") && R.FACTURA_TIPOS.juridica.patron.test("3002291916"));
igual("FM paga", pr({ torneos: ["A"], metodo: "dolares", titulo: "FM" }).usd, 75);
igual("plazos el 21/12: clásicos cerrados, blitz abierto", R.abierto("2026-12-21"), { clasicos: false, blitz: true, recargo: false });
igual("plazos el 27/12: todo cerrado", R.abierto("2026-12-27").blitz, false);

/* ===================== 2. La página y la base, iguales ===================== */
console.log("2. Las cifras de la página y las de la base");
const MIG = path.join(RAIZ, "supabase", "migraciones");
const definida = (re) => fs.readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort().reverse()
  .find((f) => re.test(fs.readFileSync(path.join(MIG, f), "utf8")));
const ultimaPersona = definida(/create or replace function interno\.metropolitano_persona/);
const ultimaInscribir = definida(/create or replace function public\.metropolitano_inscribir/);
cierto("hay una migración que define interno.metropolitano_persona() y otra (o la misma) metropolitano_inscribir()", !!ultimaPersona && !!ultimaInscribir);
if (ultimaPersona && ultimaInscribir) {
  const sqlP = fs.readFileSync(path.join(MIG, ultimaPersona), "utf8");
  const cuerpo = sqlP.slice(sqlP.indexOf("create or replace function interno.metropolitano_persona"), sqlP.indexOf("create or replace function public.metropolitano_inscribir") > 0 ? sqlP.indexOf("create or replace function public.metropolitano_inscribir") : undefined);
  const sqlI = fs.readFileSync(path.join(MIG, ultimaInscribir), "utf8");
  const inscribir = sqlI.slice(sqlI.indexOf("create or replace function public.metropolitano_inscribir"));
  const tiene = (n, re, texto) => cierto(n, re.test(texto || cuerpo), ultimaPersona);
  for (const [k, T] of Object.entries(R.TORNEOS)) {
    tiene(`${T.nombre}: ${T.paypal} por PayPal y ${T.usd} por lo demás`,
      new RegExp(`when '${k}' then case when v_metodo = 'paypal' then ${T.paypal.toFixed(2).replace(/\.?0+$/, "")} else ${T.usd} end`));
  }
  tiene("el recargo va del día después del cierre regular al cierre de los clásicos",
    new RegExp(`hoy > date '${R.CIERRE_REGULAR}' and hoy <= date '${R.CIERRE_CLASICOS}'`));
  tiene(`el recargo es del ${R.RECARGO * 100} %`, new RegExp(`v_monto \\* ${(1 + R.RECARGO).toFixed(2)}`));
  tiene(`el descuento senior es del ${R.DESCUENTO_SENIOR * 100} %`, new RegExp(`v_monto \\* ${(1 - R.DESCUENTO_SENIOR).toFixed(2)}`));
  tiene(`senior desde los ${R.EDAD_SENIOR}, contados por año (${R.ANIO_TORNEO})`, new RegExp(`v_senior := ${R.ANIO_TORNEO} - extract\\(year from v_nac\\) >= ${R.EDAD_SENIOR}`));
  tiene(`el A pide ${R.ELO_A}`, new RegExp(`v_clasico = 'A' and \\(v_elo is null or v_elo < ${R.ELO_A}\\)`));
  tiene(`el U14 es desde ${R.NACIDOS_U14_DESDE}`, new RegExp(`v_clasico = 'U14' and extract\\(year from v_nac\\) < ${R.NACIDOS_U14_DESDE}`));
  tiene("los clásicos cierran el mismo día", new RegExp(`v_clasico is not null and hoy > date '${R.CIERRE_CLASICOS}'`));
  tiene("el blitz cierra el mismo día", new RegExp(`hoy > date '${R.CIERRE_BLITZ}'`), inscribir);
  tiene("gratis los mismos títulos", new RegExp(`v_titulo in \\(${R.TITULOS_GRATIS.map((t) => `'${t}'`).join(", ")}\\)`));
  tiene(`el tipo de cambio es ₡${R.TIPO_CAMBIO}`, new RegExp(`round\\(v_total \\* ${R.TIPO_CAMBIO}\\)`), inscribir);
  tiene("los mismos roles", new RegExp(`v_rol not in \\(${Object.keys(R.ROLES).map((t) => `'${t}'`).join(", ")}\\)`));
  tiene("solo el jugador juega (y paga)", /if v_rol = 'jugador' then[\s\S]*?else\s+v_torneos := '\{\}';/);
  tiene(`un grupo lleva hasta ${R.MAX_GRUPO}`, new RegExp(`n > ${R.MAX_GRUPO}`), inscribir);
  tiene(`el IVA de la factura es del ${R.IVA * 100} %, persona por persona`, new RegExp(`round\\(v_base \\* ${R.IVA}, 2\\)`), inscribir);
  const ultimaFactura = definida(/create or replace function interno\.metropolitano_factura/);
  const sqlF = ultimaFactura ? fs.readFileSync(path.join(MIG, ultimaFactura), "utf8") : "";
  cierto("la base conoce los mismos tipos de identificación de la factura", Object.keys(R.FACTURA_TIPOS).every((t) => sqlF.includes(`v_tipo = '${t}'`)), ultimaFactura);
  cierto("llama al freno antes del insert",
    /frenar_envio_publico\('formulario', 'metropolitano-2026'/.test(inscribir) && inscribir.indexOf("frenar_envio_publico") < inscribir.indexOf("insert into public.metropolitano_inscripciones"));
}

/* ============================ 3. En el navegador ============================ */
// Un PNG de un solo color, armado a mano (sin librerías).
function pngLiso(w, h, [r, g, b]) {
  const zlib = require("zlib");
  const crc = (buf) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const v of buf) x = t[(x ^ v) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const trozo = (tipo, datos) => { const l = Buffer.alloc(4); l.writeUInt32BE(datos.length); const td = Buffer.concat([Buffer.from(tipo), datos]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const fila = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo("IHDR", ihdr), trozo("IDAT", zlib.deflateSync(Buffer.concat(Array(h).fill(fila)))), trozo("IEND", Buffer.alloc(0))]);
}

const FILAS_FIDE = [
  { fideId: "6400000", nombre: "Mora Solis, Ana", titulo: "WCM", fed: "CRC", sexo: "w", nacimiento: 2013, estandar: 1950, rapido: 1900, blitz: 1880 },
  { fideId: "6400099", nombre: "Mora Solis, Andrea", titulo: "", fed: "CRC", sexo: "w", nacimiento: 1990, estandar: null, rapido: null, blitz: null },
];

(async () => {
  console.log("3. En el navegador");
  const nav = await chromium.launch();
  try {
    const ctx = await nav.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: "block" });
    // Una «foto» de prueba: un PNG liso de un color que no está en el gafete.
    const FOTO = path.join(require("os").tmpdir(), "metropolitano-foto-prueba.png");
    fs.writeFileSync(FOTO, pngLiso(60, 80, [200, 120, 40]));
    // Una página con el doble de Supabase: lo que busca, sube y manda queda anotado.
    async function abrir() {
      const p = await ctx.newPage();
      const anotado = { errores: [], buscado: [], subidos: [], enviado: null };
      p.on("pageerror", (e) => anotado.errores.push(e.message));
      await p.route("**/functions/v1/pareo-listas-elo**", (r) => { anotado.buscado.push(JSON.parse(r.request().postData())); anotado.urls = (anotado.urls || []).concat(r.request().url());
        const q = JSON.parse(r.request().postData()).q, filas = /,/.test(q) ? FILAS_FIDE.filter((f) => f.nombre.startsWith(q.split(",")[0].trim() + ", " + q.split(",")[1].trim())) : FILAS_FIDE;
        r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, filas, total: filas.length, hayMas: false }) }); });
      await p.route("**/storage/v1/object/**", (r) => { anotado.subidos.push(decodeURIComponent(new URL(r.request().url()).pathname)); r.fulfill({ contentType: "application/json", body: '{"Key":"x"}' }); });
      await p.route("**/rest/v1/rpc/metropolitano_inscribir", (r) => {
        anotado.enviado = JSON.parse(r.request().postData()).p;
        const personas = anotado.enviado.personas.map((x, i) => ({ codigo: "MET-00" + (12 + i), numero: 12 + i, nombre: x.nombre }));
        r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, personas, codigo: personas[0].codigo, numero: 12, monto_usd: 87, monto_crc: 40020 }) });
      });
      await p.goto(BASE + "/inscripcion-metropolitano.html");
      return { p, anotado };
    }
    const tarjeta = (p, n) => p.locator("#personas > section").nth(n);
    async function llenar(t, d) {
      for (const [k, x] of Object.entries(d)) {
        const el = t.locator(`[data-c="${k}"]`);
        if (k === "sexo" || k === "documento_tipo") await el.selectOption(x); else await el.fill(x);
        await el.dispatchEvent("change");
      }
    }

    /* ----- Una persona: una jugadora con ID FIDE ----- */
    const { p, anotado } = await abrir();
    const t1 = tarjeta(p, 0);
    igual("arranca con una tarjeta de jugador", [await p.locator("#personas > section").count(), await t1.locator("[data-rol]").inputValue()], [1, "jugador"]);
    // De otro país: primero el ID FIDE, y el nombre sale de FIDE y no se cambia.
    cierto("de Costa Rica, el buscador de FIDE no se ve: se escribe el nombre", !(await t1.locator("[data-caja-buscar]").isVisible()));
    await t1.locator('input[name="p1-origen"][value="fuera"]').check();
    cierto("de otro país se pide primero el ID FIDE", await t1.locator("[data-caja-buscar]").isVisible() && /ID FIDE \(el número\)/.test(await t1.locator("[data-buscar-etiqueta]").textContent()));
    await t1.locator("[data-buscar]").fill("64ab00000");
    igual("y solo acepta el número", await t1.locator("[data-buscar]").inputValue(), "6400000");
    await t1.locator("[data-elegido]:not(.hidden)").waitFor({ timeout: 8000 });
    igual("se busca en la lista de FIDE con el número", anotado.buscado[0], { lista: "fide", q: "6400000" });
    cierto("y en la región donde FIDE contesta (us-west-1)", anotado.urls.every((u) => /[?&]forceFunctionRegion=us-west-1(&|$)/.test(u)), anotado.urls);
    igual("el nombre y los apellidos se llenan con los de FIDE", [await t1.locator('[data-c="nombre"]').inputValue(), await t1.locator('[data-c="apellidos"]').inputValue()], ["Ana", "Mora Solis"]);
    await t1.locator('[data-c="nombre"]').pressSequentially("X");
    cierto("y no se pueden cambiar", (await t1.locator('[data-c="nombre"]').inputValue()) === "Ana" && await t1.locator('[data-c="apellidos"]').evaluate((x) => x.readOnly)
      && await t1.locator("[data-nombre-bloqueado]").isVisible());
    cierto("la tarjeta dice a quién eligió", /Elegido: WCM Mora Solis, Ana/.test(await t1.locator("[data-elegido]").textContent()));
    await llenar(t1, { nacimiento: "2010-05-02" });
    cierto("avisa si la fecha no cuadra con el año de FIDE", /2013/.test(await t1.locator("[data-aviso-nac]").textContent()));
    await llenar(t1, { nacimiento: "2013-05-02" });
    const habilitados = await t1.locator('input[name="p1-clasico"]').evaluateAll((xs) => xs.filter((x) => !x.disabled).map((x) => x.value));
    igual("con 1950 y nacida en 2013: A, U14 o ninguno", habilitados, ["A", "U14", ""]);
    cierto("el B dice por qué no", /menos de 1900.*1950/.test(await t1.locator("[data-clasicos]").textContent()));
    cierto("el responsable aparece por ser menor", await t1.locator("[data-caja-responsable]").isVisible());
    await t1.locator('input[name="p1-clasico"][value="A"]').check();
    await t1.locator("[data-blitz]").check();
    await llenar(t1, { nacionalidad: "Panamá", pais_residencia: "Panamá", documento_tipo: "pasaporte", sexo: "f", documento: "1-2345-0678", correo: "ana@ejemplo.com", telefono: "+506 8888 1234", resp_nombre: "Luis Mora", resp_telefono: "88880000", emer_nombre: "Luis Mora", emer_telefono: "88880000" });
    await t1.locator('input[name="p1-hosp"][value="si"]').check();
    await t1.locator('[data-comida][value="desayuno"]').check(); await t1.locator('[data-comida][value="cena"]').check();
    await t1.locator('[data-c="acepta_publicidad"]').check();
    await p.check('input[name="metodo"][value="sinpe"]');
    cierto("el total sale en colones por SINPE", /\$87\.00 = ₡40\s?020/.test(await p.textContent("#total")));
    await p.click("#revisar");
    cierto("sin foto no avanza, y lo dice", /foto/.test(await p.textContent("#msg")));
    await t1.locator("[data-foto]").setInputFiles(FOTO);
    await p.setInputFiles("#comprobante", path.join(RAIZ, "img", "fca-logo.png"));
    await p.check("#acepta-reglamento"); await p.check("#acepta-imagen"); await p.check("#acepta-datos");
    await p.waitForFunction(() => document.querySelector("[data-foto-lista] img"));
    await p.click("#revisar");
    cierto("sin aceptar el seguro y la exoneración no avanza", /cuatro casillas/.test(await p.textContent("#msg")), await p.textContent("#msg"));
    await p.check("#acepta-seguro");
    await p.click("#revisar");
    const pintado = () => p.waitForFunction(() => { const c = document.querySelector("#resumen-personas canvas"); return c && c.width > 100 && c.getContext("2d").getImageData(Math.round(c.width * 0.03), Math.round(c.height * 0.87), 1, 1).data[3] > 0; }, null, { timeout: 15000 });
    await pintado();
    igual("el resumen da la bienvenida", await p.textContent("#resumen-titulo"), "Bienvenida al Torneo Metropolitano 2026");
    cierto("el formulario se esconde", !(await p.isVisible("#formulario")));
    // La franja del gafete, del color del Metropolitano A (se mide el píxel, no la clase).
    const pixel = (sel, fx, fy) => p.evaluate(([s, x, y]) => { const c = document.querySelectorAll("#resumen-personas canvas")[s]; const d = c.getContext("2d").getImageData(Math.round(c.width * x), Math.round(c.height * y), 1, 1).data; return [d[0], d[1], d[2]]; }, [sel, fx, fy]);
    igual("la franja del gafete es del color del A", await pixel(0, 0.03, 0.87), [0x04, 0x35, 0x76]);
    // La foto va en su marco: el píxel del centro del marco no es blanco.
    const centro = await pixel(0, 0.775, 0.62);
    cierto("la foto va en el gafete, en su marco", Math.abs(centro[0] - 200) < 12 && Math.abs(centro[1] - 120) < 12 && Math.abs(centro[2] - 40) < 12, centro);
    cierto("el resumen dice los torneos y la publicidad", /Metropolitano A .* y Metropolitano Blitz/.test(await p.textContent("#resumen-personas")) && /Autoriza el uso de su nombre y su foto/.test(await p.textContent("#resumen-personas")));

    await p.click("#enviar");
    cierto("sin confirmar no se manda", anotado.enviado === null && /Marca que revisaste/.test(await p.textContent("#msg-enviar")));
    await p.check("#confirmo");
    await p.click("#enviar");
    await p.waitForSelector("#listo:not(.hidden)", { timeout: 10000 });
    igual("se subieron la foto y el comprobante, cada uno a su carpeta", anotado.subidos.map((x) => x.split("/").slice(-3, -2)[0]), ["foto", "comprobante"]);
    const e1 = anotado.enviado, x1 = e1 && e1.personas[0];
    cierto("lo que se manda es lo que se llenó", e1 && e1.modo === "individual" && e1.personas.length === 1 && x1.rol === "jugador" && x1.fide_id === "6400000" && x1.elo_estandar === 1950 && x1.titulo === "WCM"
      && JSON.stringify(x1.torneos) === '["A","BLITZ"]' && JSON.stringify(x1.comidas) === '["desayuno","cena"]' && x1.hospedaje === true && x1.acepta_publicidad === true
      && e1.pago_metodo === "sinpe" && e1.validado === true && /^foto\/[a-z0-9-]+\/.+\.jpg$/.test(x1.foto)
      && x1.responsable && x1.responsable.nombre === "Luis Mora" && x1.nombre_fide === "Mora Solis, Ana" && e1.acepta_seguro === true, e1);
    cierto("dice el código", /MET-0012/.test(await p.textContent("#listo-texto")));
    const [descarga] = await Promise.all([p.waitForEvent("download"), p.click("#bajar-gafete")]);
    const pdf = fs.readFileSync(await descarga.path());
    cierto("el gafete se descarga en PDF de 10 × 14 cm, con dos páginas y sin fuentes",
      pdf.slice(0, 5).toString() === "%PDF-" && /\/MediaBox \[0 0 283\.46 396\.85\]/.test(pdf.toString("latin1"))
      && (pdf.toString("latin1").match(/\/Type \/Page\b/g) || []).length === 2 && !/\/Font/.test(pdf.toString("latin1")));
    igual("sin errores en la página", anotado.errores, []);
    const enviado = x1;

    /* ----- Sin ID FIDE: el A no se puede elegir ----- */
    const s2 = await abrir();
    const u = tarjeta(s2.p, 0);
    await u.locator('[data-c="nombre"]').fill("Zeta");
    await u.locator('[data-c="apellidos"]').fill("Nadie");
    await u.locator("[data-caja-buscar]").waitFor({ state: "visible", timeout: 8000 });
    cierto("de Costa Rica, si por el nombre no aparece, sale el buscador de respaldo", /No aparece/.test(await u.locator("[data-buscar-etiqueta]").textContent()));
    await u.locator('[data-c="nombre"]').fill("Ana");
    await u.locator('[data-c="apellidos"]').fill("Mora Solís");
    await u.locator("[data-elegido]:not(.hidden)").waitFor({ timeout: 8000 });
    igual("al escribir nombre y apellidos se busca en FIDE como «Apellidos, Nombre», sin tildes", s2.anotado.buscado.slice(-1)[0], { lista: "fide", q: "Mora Solis, Ana" });
    cierto("y con una sola persona se carga sola su ID FIDE", /ID FIDE 6400000 cargado/.test(await u.locator("[data-estado-nombre]").textContent()) && /Elegido: WCM Mora Solis, Ana/.test(await u.locator("[data-elegido]").textContent()));
    igual("su nombre se queda como lo escribió (con tilde)", await u.locator('[data-c="apellidos"]').inputValue(), "Mora Solís");
    await u.locator('input[name="p1-fide"][value="no"]').check();
    await llenar(u, { nacimiento: "1990-01-01" });
    igual("sin ID FIDE, adulto: B o ninguno", await u.locator('input[name="p1-clasico"]').evaluateAll((xs) => xs.filter((x) => !x.disabled).map((x) => x.value)), ["B", ""]);
    cierto("y le explica que la FCA tramita el ID", await u.locator("[data-sin-fide]").isVisible() && await u.locator("[data-fed-cr]").isVisible());
    await u.locator("[data-federacion]").selectOption("PAN");
    await u.locator("[data-federacion]").dispatchEvent("change");
    cierto("si es de otro país, le dice que lo tramita su federación", await u.locator("[data-fed-fuera]").isVisible() && !(await u.locator("[data-fed-cr]").isVisible()));
    await u.locator("[data-rol]").selectOption("acompanante");
    await u.locator("[data-rol]").dispatchEvent("change");
    cierto("un acompañante no ve ID FIDE ni torneos", !(await u.locator("[data-bloque-fide]").isVisible()) && !(await u.locator("[data-bloque-torneos]").isVisible()));
    cierto("y no paga", /sin costo/.test(await s2.p.textContent("#total")));

    /* ----- Un grupo: el delegado, una jugadora y un entrenador ----- */
    console.log("   La inscripción de grupo");
    const g = await abrir();
    await g.p.check('input[name="modo"][value="grupo"]');
    await g.p.waitForFunction(() => document.querySelector("#personas > section [data-rol]") && document.querySelector("#personas > section [data-rol]").value === "delegado");
    cierto("en grupo, la primera tarjeta es la del delegado y aparece «Agregar»", await g.p.isVisible("#caja-grupo") && await g.p.isVisible("#agregar"));
    await g.p.fill("#delegacion", "Club Ajedrez Heredia");
    const d = tarjeta(g.p, 0);
    await llenar(d, { nombre: "Carlos", apellidos: "Rojas Vega", nacimiento: "1980-03-03", sexo: "m", documento: "4-0123-0456", correo: "carlos@ejemplo.com", telefono: "+506 7000 0000", emer_nombre: "Ana Vega", emer_telefono: "88887777", llegada: "2026-12-25", salida: "2026-12-31" });
    await d.locator('input[name="p2-hosp"][value="si"]').check();
    await d.locator('[data-comida][value="almuerzo"]').check();
    await d.locator("[data-foto]").setInputFiles(FOTO);
    await g.p.click('[data-agregar="jugador"]');
    await g.p.click('[data-agregar="entrenador"]');
    igual("se agregaron dos personas", await g.p.locator("#personas > section").count(), 3);
    const j = tarjeta(g.p, 1), en = tarjeta(g.p, 2);
    cierto("a cada persona nueva se le copia el viaje, el hospedaje y las comidas del delegado",
      (await j.locator('[data-c="llegada"]').inputValue()) === "2026-12-25" && await j.locator('input[name="p3-hosp"][value="si"]').isChecked()
      && await j.locator('[data-comida][value="almuerzo"]').isChecked());
    igual("y la emergencia la atiende el delegado", await j.locator('[data-c="emer_nombre"]').inputValue(), "Carlos Rojas Vega");
    cierto("el correo de un integrante es opcional", await j.locator("[data-nota-contacto]").isVisible());
    await j.locator('[data-c="nombre"]').fill("Andrea");
    await j.locator('[data-c="apellidos"]').fill("Mora Solis");
    await j.locator("[data-elegido]:not(.hidden)").waitFor({ timeout: 8000 });   // Andrea, sin Elo: B
    await llenar(j, { nacimiento: "1990-07-07", sexo: "f", documento: "1-1111-2222" });
    await j.locator('input[name="p3-clasico"][value="B"]').check();
    await j.locator("[data-foto]").setInputFiles(FOTO);
    await en.locator('input[name="p4-fide"][value="no"]').check();
    await llenar(en, { nombre: "Pedro", apellidos: "Solano", nacimiento: "1975-01-01", sexo: "m", documento: "2-3333-4444" });
    await en.locator("[data-foto]").setInputFiles(FOTO);
    cierto("el total del grupo suma solo a la jugadora", /\$45\.00/.test(await g.p.textContent("#total")) && /entrenador: sin costo/.test(await g.p.textContent("#total")));
    await g.p.check('input[name="metodo"][value="dolares"]');
    await g.p.check("#quiere-factura");
    cierto("con factura se suma el IVA del 13 %", /IVA del 13 %.*\$5\.85/.test(await g.p.textContent("#total")) && /Total: \$50\.85/.test(await g.p.textContent("#total")), await g.p.textContent("#total"));
    await g.p.selectOption("#fac_tipo", "juridica");
    await g.p.fill("#fac_id", "3-002-291916"); await g.p.fill("#fac_nombre", "Club Ajedrez Heredia"); await g.p.fill("#fac_correo", "facturas@club.cr");
    await g.p.selectOption("#fac_provincia", "Heredia"); await g.p.selectOption("#fac_canton", "Heredia"); await g.p.selectOption("#fac_distrito", "Heredia");
    await g.p.setInputFiles("#comprobante", path.join(RAIZ, "img", "fca-logo.png"));
    await g.p.check("#acepta-reglamento"); await g.p.check("#acepta-imagen"); await g.p.check("#acepta-seguro"); await g.p.check("#acepta-datos");
    await g.p.waitForFunction(() => document.querySelectorAll("[data-foto-lista] img").length === 3);
    await g.p.click("#revisar");
    cierto("sin las otras señas, la factura no deja seguir y lo dice", /Factura: falta la dirección/.test(await g.p.textContent("#msg")), await g.p.textContent("#msg"));
    await g.p.fill("#fac_senas", "100 m norte del parque");
    await g.p.click("#revisar");
    await g.p.waitForSelector("#resumen:not(.hidden)", { timeout: 8000 }).catch(() => {});
    if (!(await g.p.isVisible("#resumen"))) cierto("el grupo pasa a la revisión", false, await g.p.textContent("#msg"));
    igual("el resumen del grupo da la bienvenida a todos", await g.p.textContent("#resumen-titulo"), "Bienvenidos al Torneo Metropolitano 2026");
    igual("hay un gafete por persona", await g.p.locator("#resumen-personas article").count(), 3);
    await g.p.check("#confirmo");
    await g.p.click("#enviar");
    await g.p.waitForSelector("#listo:not(.hidden)", { timeout: 15000 });
    const ge = g.anotado.enviado;
    cierto("se manda el grupo entero en un envío, con su delegado primero", ge && ge.modo === "grupo" && ge.delegacion === "Club Ajedrez Heredia" && ge.personas.length === 3
      && ge.personas[0].es_delegado === true && ge.personas[0].rol === "delegado" && ge.personas[1].rol === "jugador" && ge.personas[1].fide_id === "6400099"
      && JSON.stringify(ge.personas[1].torneos) === '["B"]' && ge.personas[2].rol === "entrenador" && ge.personas[2].sin_fide === true && ge.personas[2].federacion === null
      && ge.personas.every((x) => /^foto\//.test(x.foto)) && ge.pago_metodo === "dolares", ge);
    cierto("y la factura va con los datos de Hacienda, la cédula sin guiones", ge && ge.factura && ge.factura.tipo === "juridica" && ge.factura.identificacion === "3002291916"
      && ge.factura.provincia === "Heredia" && ge.factura.distrito === "Heredia" && ge.factura.senas === "100 m norte del parque", ge && ge.factura);
    igual("se subieron tres fotos y un comprobante", g.anotado.subidos.map((x) => x.split("/").slice(-3, -2)[0]), ["foto", "foto", "foto", "comprobante"]);
    cierto("dice el código de cada uno", /MET-0012 — Carlos Rojas Vega/.test(await g.p.textContent("#listo-codigos")) && /MET-0014 — Pedro Solano/.test(await g.p.textContent("#listo-codigos")));
    const [dg] = await Promise.all([g.p.waitForEvent("download"), g.p.click("#bajar-gafete")]);
    const pdfg = fs.readFileSync(await dg.path()).toString("latin1");
    igual("los gafetes del grupo salen en un solo PDF (frente y dorso de cada uno)", (pdfg.match(/\/Type \/Page\b/g) || []).length, 6);
    igual("sin errores en la página del grupo", g.anotado.errores, []);

    // La página de información del torneo (metropolitano-2026.html).
    console.log("   La página de información");
    async function info(sala) {
      const pg = await ctx.newPage();
      const errs = []; pg.on("pageerror", (e) => errs.push(e.message));
      await pg.route("**/rest/v1/salas_torneo**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(sala) }));
      await pg.goto(BASE + "/metropolitano-2026.html#premios");
      await pg.waitForFunction(() => document.querySelector("#ficha-resultados .metro-ficha"));
      return { pg, errs };
    }
    const i1 = await info(null);
    cierto("sin la tarjeta de «Torneos», resultados dice «Pronto»",
      (await i1.pg.getAttribute("#ficha-resultados .metro-ficha", "aria-disabled")) === "true" && /Pronto/.test(await i1.pg.textContent("#ficha-resultados")));
    // Lo que va a existir pero todavía no: abajo de todo, con su candado.
    const pendientes = await i1.pg.evaluate(() => {
      const fichas = [...document.querySelectorAll("#fichas .metro-ficha")];
      const ultimas = fichas.slice(-2);
      return { titulos: ultimas.map((f) => f.querySelector(".metro-ficha-titulo").textContent),
        bloqueadas: ultimas.every((f) => f.getAttribute("aria-disabled") === "true" && !f.hasAttribute("href") && f.tabIndex === 0 && /Pendiente/.test(f.textContent)) };
    });
    igual("partidas en vivo y ejercicios de la ronda van al final, bloqueadas como «Pendiente»", pendientes, { titulos: ["Partidas en vivo", "Ejercicios de la ronda"], bloqueadas: true });
    cierto("la dirección #premios abre su ventana", await i1.pg.evaluate(() => document.getElementById("premios").open));
    igual("los premios, de las bases: 4 tablas y el 1.er lugar del A en $700", [await i1.pg.locator("#premios-tablas table").count(), (await i1.pg.locator("#premios-tablas tr").first().textContent()).replace(/\s+/g, " ").trim()], [4, "1.er lugar$700.00"]);
    igual("el calendario: 9 rondas de A, B y U14 y el blitz", await i1.pg.locator("#calendario-tablas tbody tr").count(), 28);
    cierto("los costos con los cuatro torneos y los métodos de pago", (await i1.pg.locator("#costos-tabla tbody tr").count()) === 4 && (await i1.pg.locator("#costos-metodos .metro-caja").count()) === 4);
    cierto("la cuenta regresiva dice qué sigue", /Lo próximo|terminó/.test(await i1.pg.textContent("#hoy-principal")));
    await i1.pg.keyboard.press("Escape");
    const [ics] = await Promise.all([i1.pg.waitForEvent("download"), i1.pg.click("#hoy-ics")]);
    const textoIcs = fs.readFileSync(await ics.path(), "utf8");
    igual("«Agregar a mi calendario» baja las 28 rondas, en hora de Costa Rica", [(textoIcs.match(/BEGIN:VEVENT/g) || []).length, /DTSTART;TZID=America\/Costa_Rica:20261226T090000/.test(textoIcs)], [28, true]);
    // Las bases se abren en la ventanita de encima (js/visor-documento.js), no
    // en otra pestaña: nadie se va de la página. Y «Atrás» la cierra.
    const pestanas = [];
    ctx.on("page", (p) => pestanas.push(p));
    const antes = i1.pg.url();
    await i1.pg.click("a.metro-ficha[data-visor]");
    await i1.pg.waitForFunction(() => document.querySelector("dialog.visor-doc[open] .visor-doc-pagina[data-pagina='2'] canvas"), null, { timeout: 30000 });
    const visto = await i1.pg.evaluate(() => {
      const d = document.querySelector("dialog.visor-doc");
      const c = d.querySelector("canvas");
      return { titulo: d.querySelector("h2").textContent, paginas: d.querySelectorAll(".visor-doc-pagina").length,
        ancho: c.getBoundingClientRect().width > 200, bajar: d.querySelector("a.visor-doc-boton").getAttribute("href").replace(location.origin + "/", ""),
        visible: d.checkVisibility(), texto: /Invitación/.test((d.querySelector(".visor-doc-pagina[data-pagina='2'] .sr-only") || {}).textContent || "") };
    });
    igual("las bases se abren encima de la página, con sus 14 páginas pintadas y escritas", visto,
      { titulo: "Bases del Metropolitano 2026", paginas: 14, ancho: true, bajar: "documentos/metropolitano-2026/bases-metropolitano-2026.pdf", visible: true, texto: true });
    igual("y no se abre ninguna otra pestaña", pestanas.length, 0);
    await i1.pg.click("dialog.visor-doc [aria-label='Más grande']");
    await i1.pg.waitForFunction(() => { const c = document.querySelector(".visor-doc-pagina canvas"), f = document.querySelector(".visor-doc-cuerpo"); return c && c.getBoundingClientRect().width > f.clientWidth * 1.3; });
    cierto("«Más grande» agranda la página", true);
    await i1.pg.goBack();
    await i1.pg.waitForFunction(() => !document.querySelector("dialog.visor-doc").open);
    igual("«Atrás» cierra la ventanita y deja a la persona en la página", i1.pg.url(), antes);
    // Una ventana del torneo, también: «Atrás» la cierra sin salir.
    await i1.pg.click("a[href='#costos']");
    await i1.pg.goBack();
    await i1.pg.waitForFunction(() => !document.getElementById("costos").open);
    cierto("«Atrás» con la ventana de costos abierta la cierra, sin salir", /metropolitano-2026\.html/.test(i1.pg.url()));
    // Qué hacer en el tiempo libre y Mientras esperas, los del Centroamericano.
    await i1.pg.click("a[href='#paseos']");
    igual("«Qué hacer en el tiempo libre» trae los 14 paseos", await i1.pg.locator("#paseos-lista li.paseo").count(), 14);
    await i1.pg.click("#paseos-lista button[data-filtro='ninos']");
    const ninos = await i1.pg.evaluate(() => [...document.querySelectorAll("#paseos-lista li.paseo")].filter((l) => l.checkVisibility()).length);
    cierto("y el filtro «Para niños» deja solo los suyos", ninos > 0 && ninos < 14, ninos);
    await i1.pg.keyboard.press("Escape");
    const juegos = await i1.pg.evaluate(() => [...document.querySelectorAll("#esperas a.espera")].map((a) => a.getAttribute("href")));
    igual("«Mientras esperas» trae los juegos, los de la Academia como invitado del Metropolitano", juegos,
      ["entreno/aprende-a-jugar.html?invitado=metropolitano", "confites.html", "batalla-naval.html?invitado=metropolitano", "buscaminas.html", "estilo-muestra.html"]);
    cierto("y cada juego se abre encima, sin otra pestaña", await i1.pg.evaluate(() => [...document.querySelectorAll("#esperas a.espera")].every((a) => a.dataset.visor && !a.target)));
    // Los idiomas: cada texto de la página tiene su inglés y su francés, y lo
    // que se arma con datos se vuelve a pintar en el idioma.
    for (const [lang, boton, ronda, mes] of [["en", "English", "Round 1", /December/], ["fr", "Français", "Ronde 1", /décembre/]]) {
      await i1.pg.click("#metro-idioma");
      await i1.pg.click("#metro-idiomas [data-idioma='" + lang + "']");
      const r = await i1.pg.evaluate(() => {
        const limpio = (t) => String(t || "").replace(/\s+/g, " ").trim();
        const fuera = (el) => !el || !!el.closest("script, style, [data-no-traducir]");
        const mapa = (document.documentElement.lang === "en" ? window.MetropolitanoEN : window.MetropolitanoFR).textos;
        const espanol = new Set(Object.keys(mapa));
        const sin = [];
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
        while ((n = w.nextNode())) {
          if (fuera(n.parentElement)) continue;
          const t = limpio(n.nodeValue);
          // Un texto que quedó en español: es una clave del mapa (o no está en él) y no es su traducción.
          if (t && /[A-Za-zÁÉÍÓÚáéíóúñ]/.test(t) && !Object.values(mapa).includes(t) && (espanol.has(t) || !(t in mapa))) sin.push(t);
        }
        return { lang: document.documentElement.lang, sin: [...new Set(sin)], calendario: document.querySelector("#calendario-tablas tbody th").textContent,
          fecha: document.querySelector("#calendario-tablas tbody td").textContent, titulo: document.title };
      });
      igual(boton + ": ningún texto de la página queda en español", r.sin, []);
      cierto(boton + ": el calendario y sus fechas, en " + boton, r.lang === lang && r.calendario === ronda && mes.test(r.fecha), r);
    }
    await i1.pg.click("#metro-idioma");
    await i1.pg.click("#metro-idiomas [data-idioma='es']");
    cierto("y de vuelta al español, todo como estaba", await i1.pg.evaluate(() => document.documentElement.lang === "es" && /Ronda 1/.test(document.querySelector("#calendario-tablas tbody th").textContent) && document.querySelector("#fichas-titulo").textContent === "Todo el torneo"));
    igual("sin errores en la página de información", i1.errs, []);
    const i2 = await info({ clave: "metropolitano-2026", enlaces: [
      { url: "https://ajedrez-integral.com/metropolitano-2026.html", texto: "Toda la información" },
      { url: "https://s1.chess-results.com/tnr1.aspx", texto: "Metropolitano A" }, { url: "https://s1.chess-results.com/tnr2.aspx", texto: "Metropolitano B" },
      { url: "https://lichess.org/broadcast/metropolitano-2026/AbCdEf12", texto: "En vivo" }] });
    await i2.pg.waitForFunction(() => document.querySelector("#ficha-partidas a"));
    igual("con los enlaces en «Torneos», las partidas llevan a Lichess", await i2.pg.getAttribute("#ficha-partidas a", "href"), "https://lichess.org/broadcast/metropolitano-2026/AbCdEf12");
    await i2.pg.keyboard.press("Escape");
    await i2.pg.click("#ficha-resultados a");
    cierto("y con dos torneos en chess-results, se elige la categoría", await i2.pg.evaluate(() => document.getElementById("resultados").open) && (await i2.pg.locator("#resultados-lista a").count()) === 2);
    await i2.pg.route("https://s1.chess-results.com/**", (r) => r.fulfill({ contentType: "text/html", body: "<p>Clasificación</p>" }));
    await i2.pg.click("#resultados-lista a >> nth=1");
    await i2.pg.waitForFunction(() => { const f = document.querySelector("dialog.visor-doc[open] iframe"); return f && /tnr2/.test(f.src); });
    cierto("una categoría de chess-results se abre encima, en un marco", true);
    igual("con «Abrir aparte» para quien la quiera en otra pestaña", await i2.pg.getAttribute("dialog.visor-doc a.visor-doc-boton", "target"), "_blank");
    await i2.pg.click("dialog.visor-doc .visor-doc-cerrar");
    await i2.pg.waitForFunction(() => !document.querySelector("dialog.visor-doc").open && document.getElementById("resultados").open);
    cierto("«Cerrar» vuelve a la lista de categorías", true);
    cierto("las partidas de Lichess también se abren encima", await i2.pg.getAttribute("#ficha-partidas a", "data-visor") === "Partidas en vivo");
    // La tarjeta de «Torneos», con el diseño de las bases, y lo que abre.
    const tv = await ctx.newPage();
    const salaMetro = { clave: "metropolitano-2026", nombre: "XLVII Torneo Internacional Metropolitano 2026", tipo: "enlaces", visible: true, orden: 1, descripcion: "Del 26 al 30 de diciembre.",
      enlaces: [{ url: "https://ajedrez-integral.com/metropolitano-2026.html", texto: "Toda la información" }, { url: "https://ajedrez-integral.com/inscripcion-metropolitano.html", texto: "Inscripción" },
        { url: "https://fcacostarica.com/wp-content/uploads/2026/08/Bases-Metropolitano-2026-2.pdf", texto: "Bases del torneo" }] };
    await tv.route("**/rest/v1/**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify([salaMetro]) }));
    await tv.goto(BASE + "/torneos-en-vivo.html");
    await tv.waitForSelector('li[data-sala="metropolitano-2026"]');
    const fichaSala = await tv.evaluate(() => {
      const li = document.querySelector('li[data-sala="metropolitano-2026"]');
      const img = li.querySelector(".metro-sala-imagen");
      return { tema: li.classList.contains("metro-sala"), hojas: getComputedStyle(li, "::before").backgroundImage.includes("hojas-arriba"),
        logo: !!img && img.complete && img.naturalWidth > 0 && img.checkVisibility(), enlaces: [...li.querySelectorAll("a")].map((a) => a.getAttribute("href")),
        afuera: li.querySelectorAll("a[target]").length };
    });
    igual("la tarjeta de «Torneos» lleva el diseño del Metropolitano y no saca a nadie del sitio", fichaSala,
      { tema: true, hojas: true, logo: true, enlaces: ["/metropolitano-2026.html", "/inscripcion-metropolitano.html", "/metropolitano-2026.html#bases"], afuera: 0 });
    await tv.close();
    const pb = await ctx.newPage();
    await pb.route("**/rest/v1/**", (r) => r.fulfill({ contentType: "application/json", body: "null" }));
    await pb.goto(BASE + "/metropolitano-2026.html#bases");
    await pb.waitForFunction(() => { const d = document.querySelector("dialog.visor-doc"); return d && d.open && /Bases/.test(d.querySelector("h2").textContent); }, null, { timeout: 15000 });
    cierto("y su «Bases del torneo» abre las bases encima de la página del torneo", true);
    await pb.close();
    // La inscripción: la privacidad y las bases encima, sin perder lo escrito.
    const ins = await ctx.newPage();
    await ins.goto(BASE + "/inscripcion-metropolitano.html");
    await ins.click("#acepta-datos-texto a[data-visor]");
    await ins.waitForFunction(() => { const f = document.querySelector("dialog.visor-doc[open] iframe"); return f && /privacidad\.html$/.test(f.src); });
    cierto("en la inscripción, la política de privacidad se abre encima del formulario", /inscripcion-metropolitano\.html/.test(ins.url()));
    igual("y las bases, desde el formulario, sin enlace a otra pestaña", await ins.locator('a[href*="bases-metropolitano-2026.pdf"][target]').count(), 0);
    await ins.close();

    // La página de administración.
    console.log("   La lista de inscritos");
    const a = await ctx.newPage();
    void s2;
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
