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
// El correo de confirmación: el mismo código de la Edge Function metropolitano-correo
// (correo.ts, con su marca-correo.ts de _compartido, como lo arma funciones-armar.js).
{
  const leer = (...p) => fs.readFileSync(path.join(RAIZ, "supabase", "functions", ...p), "utf8");
  const fuente = leer("_compartido", "marca-correo.ts") + "\n" + leer("metropolitano-correo", "correo.ts").replace(/^import .*$/mg, "");
  const m = { exports: {} };
  new Function("module", "exports", require("esbuild").transformSync(fuente, { loader: "ts", format: "cjs" }).code)(m, m.exports);
  const C = m.exports;
  const base = { grupo: "g1", delegacion: "Club Ajedrez Heredia", pago_estado: "por_revisar", torneos: [], monto_usd: 0, iva_usd: 0 };
  const del = Object.assign({}, base, { id: "a", numero: 13, es_delegado: true, rol: "delegado", sexo: "m", nombre: "Carlos", apellidos: "Rojas Vega", correo: "Carlos@Ejemplo.com" });
  const ana = Object.assign({}, base, { id: "b", numero: 14, rol: "jugador", sexo: "f", nombre: "Ana", apellidos: "Mora Solís", nombre_fide: "Mora Solis, Ana", fide_id: "6400000", titulo: "WCM", correo: "ana@ejemplo.com",
    torneos: ["A", "BLITZ"], monto_usd: 87, hospedaje: true, hospedaje_desde: "2026-12-25", hospedaje_hasta: "2026-12-31", acepta_hospedaje: true, parqueo: true, placa: "BCD123" });
  const pedro = Object.assign({}, base, { id: "c", numero: 15, rol: "entrenador", sexo: "m", nombre: "Pedro", apellidos: "Solano", correo: "carlos@ejemplo.com" });
  const cs = C.correosDeEnvio([ana, pedro, del]);
  igual("correo: la delegación va al delegado (con todos) y a la integrante con su correo; una dirección repetida no recibe dos",
    cs.map((c) => [c.para, c.ids.join(",")]), [["carlos@ejemplo.com", "a,b,c"], ["ana@ejemplo.com", "b"]]);
  cierto("correo: el del delegado trae cada código, los torneos, el total y lo del pago por revisar", /MET-0013 · Carlos Rojas Vega/.test(cs[0].texto) && /MET-0014 · Ana Mora Solís/.test(cs[0].texto)
    && /Metropolitano A y Metropolitano Blitz/.test(cs[0].texto) && /Total: \$87\.00\. La organización revisa el comprobante/.test(cs[0].texto) && /delegación Club Ajedrez Heredia/.test(cs[0].asunto), cs[0].texto);
  cierto("correo: el hospedaje recuerda la puerta a las 10:30 p.m. y la ropa de cama, y el parqueo su placa", /10:30 p\.m\./.test(cs[0].texto) && /Trae tu ropa de cama/.test(cs[0].texto) && /placa BCD123/.test(cs[0].texto));
  cierto("correo: la jugadora trae su enlace a «Mi ronda y mi mesa», el mismo del QR del gafete", cs[1].texto.includes("https://ajedrez-integral.com/metropolitano-2026#mi-ronda=Mora%20Solis%2C%20Ana")
    && /Carlos Rojas Vega, delegado de Club Ajedrez Heredia, te inscribió/.test(cs[1].texto) && !/Total:/.test(cs[1].texto));
  const sola = C.correosDeEnvio([{ id: "d", numero: 16, rol: "jugador", nombre: "Luis", apellidos: "Brenes <b>Arias</b>", titulo: "IM", correo: "luis@ejemplo.com", torneos: ["A"], monto_usd: 0, viaje: { llegada: "2026-12-25", salida: "2026-12-30" } }]);
  cierto("correo: una persona sola recibe el suyo; el IM, sin costo y con su hospedaje de la organización", sola.length === 1 && /Hola, Luis/.test(sola[0].texto) && /Sin costo/.test(sola[0].texto)
    && /Los da la organización, del 25 de diciembre al 30 de diciembre/.test(sola[0].texto) && /La ropa de cama la da la organización/.test(sola[0].texto) && /MET-0016/.test(sola[0].asunto));
  cierto("correo: lo que escribe la persona va escapado en el HTML", sola[0].html.includes("Brenes &lt;b&gt;Arias&lt;/b&gt;") && !sola[0].html.includes("<b>Arias</b>"));
  cierto("correo: lleva la franja de Ajedrez Integral (dentro de su tabla) y a quién escribir para corregir", /logo-marca\.png/.test(sola[0].html) && /metropolitano@fcacostarica\.com/.test(sola[0].html)
    && /<table[^>]*>\s*<tr><td style="background:#102a43/.test(sola[0].html));
  igual("correo: sin un correo válido no se manda nada", C.correosDeEnvio([{ id: "e", numero: 17, rol: "jugador", nombre: "X", apellidos: "Y", correo: "no-es-correo" }]).length, 0);
  igual("correo: lo pendiente se junta por envío", C.porEnvio([del, { id: "z", numero: 30 }, ana]).map((g) => g.map((x) => x.id).join(",")), ["a,b", "z"]);
  // El enlace para corregir: solo en el correo de quien mandó el envío.
  const TOK = "ab".repeat(32);
  const conEnlace = C.correosDeEnvio([ana, pedro, del], TOK);
  cierto("correo: la confirmación del delegado trae el enlace para corregir; la de la integrante, no", conEnlace[0].texto.includes("https://ajedrez-integral.com/metropolitano-mi-inscripcion.html#t=" + TOK)
    && conEnlace[0].html.includes("Corregir mi inscripción") && !conEnlace[1].texto.includes("#t="));
  const ver = C.correoPago([del, Object.assign({}, ana, { pago_estado: "verificado" }), pedro], "verificado", null, TOK);
  cierto("correo del pago verificado: a quien mandó el envío, con el total y los códigos", ver.para === "carlos@ejemplo.com" && /verificó el pago de la delegación Club Ajedrez Heredia \(\$87\.00\)/.test(ver.texto)
    && /MET-0014 · Ana Mora Solís/.test(ver.texto) && /^Pago verificado: delegación/.test(ver.asunto), ver.texto);
  const rech = C.correoPago([Object.assign({}, ana, { grupo: null, delegacion: null, pago_estado: "rechazado" })], "rechazado", "El comprobante <b>no</b> se lee", TOK);
  cierto("correo del pago rechazado: el motivo de la nota y el enlace para subir otro comprobante", /no pudo verificar el comprobante de pago MET-0014/.test(rech.texto) && /El motivo: El comprobante <b>no<\/b> se lee/.test(rech.texto)
    && rech.html.includes("El comprobante &lt;b&gt;no&lt;/b&gt; se lee") && rech.html.includes("Subir otro comprobante") && rech.texto.includes("#t=" + TOK) && rech.para === "ana@ejemplo.com", rech.texto);
  const enl = C.correoEnlace([del, ana], TOK);
  cierto("correo del enlace pedido: a quien mandó el envío, con el enlace y el aviso de guardarlo", enl.para === "carlos@ejemplo.com" && enl.texto.includes("#t=" + TOK) && /Guárdalo: es solo tuyo/.test(enl.texto));
  igual("correo: sin enlace no hay correo del enlace, y sin correo válido tampoco del pago", [C.correoEnlace([del], ""), C.correoPago([Object.assign({}, del, { correo: "x" })], "verificado", null, TOK)], [null, null]);
  const conMenu = C.correosDeEnvio([{ id: "g", numero: 19, rol: "acompanante", nombre: "Rosa", apellidos: "Vega", correo: "rosa@ejemplo.com", torneos: [], monto_usd: 30,
    alimentacion: "si", comidas: ["desayuno", "cena"], comidas_desde: "2026-12-26", comidas_hasta: "2026-12-30",
    menu: [{ comida: "desayuno", nombre: "Gallo <b>pinto</b>", cocina: "Soda Tala", precio_usd: 6, dias: 5, usd: 30 }] }])[0];
  cierto("correo: cada plato elegido, con quién lo prepara, los días y lo que cuesta; lo pedido sin menú, como solicitud",
    /Desayuno: Gallo <b>pinto<\/b>, de Soda Tala, del 26 de diciembre al 30 de diciembre \(\$6\.00 por día: \$30\.00\)/.test(conMenu.texto)
    && /Alimentación: Solicitada: cena, del 26 de diciembre al 30 de diciembre/.test(conMenu.texto) && conMenu.html.includes("Gallo &lt;b&gt;pinto&lt;/b&gt;"), conMenu.texto);
  cierto("correo: «aún no lo sé» lo dice, con a quién escribir si se decide",
    /Alimentación: Aún no lo sabe\. Si decide comer con nosotros, escribe a metropolitano@fcacostarica\.com\./.test(C.correosDeEnvio([{ id: "h", numero: 20, rol: "acompanante", nombre: "Rosa", apellidos: "Vega", correo: "rosa@ejemplo.com", torneos: [], monto_usd: 0, alimentacion: "tal_vez", comidas: [] }])[0].texto));
  cierto("correo: el árbitro se llama árbitro", /Se inscribe como: Árbitra/.test(C.correosDeEnvio([{ id: "f", numero: 18, rol: "arbitro", sexo: "f", nombre: "Rosa", apellidos: "Vega", correo: "rosa@ejemplo.com", torneos: [], monto_usd: 0 }])[0].texto));
}
// Las carpetas del Drive: el mismo código de la Edge Function metropolitano-drive.
{
  let fuente = fs.readFileSync(path.join(RAIZ, "supabase", "functions", "metropolitano-drive", "index.ts"), "utf8")
    .replace(/^import .*$/mg, "").replace(/Deno\.serve\([\s\S]*$/, "").replace(/Deno\.env\.get\([^)]*\)!/g, '""');
  const js = require("esbuild").transformSync(fuente, { loader: "ts", format: "cjs" }).code;
  const m = { exports: {} };
  new Function("module", "exports", js)(m, m.exports);
  const D = m.exports;
  igual("al Drive: un jugador suelto va en su torneo", D.carpetasDe({ numero: 12, apellidos: "Mora Solís", nombre: "Ana", rol: "jugador", clasico: "A" }), ["Torneo A", "MET-0012 - Mora Solís, Ana"]);
  igual("solo el blitz, a Torneo Blitz", D.carpetasDe({ numero: 7, apellidos: "Pérez", nombre: "Luis", rol: "jugador", clasico: null }), ["Torneo Blitz", "MET-0007 - Pérez, Luis"]);
  igual("una delegación, junta en su carpeta, cada uno con lo que es",
    [D.carpetasDe({ numero: 13, apellidos: "Rojas Vega", nombre: "Carlos", rol: "delegado", es_delegado: true, grupo: "g1", delegacion: "Club Ajedrez Heredia" }),
      D.carpetasDe({ numero: 14, apellidos: "Mora", nombre: "Andrea", rol: "jugador", clasico: "B", grupo: "g1", delegacion: "Club Ajedrez Heredia" })],
    [["Delegación - Club Ajedrez Heredia", "MET-0013 - Rojas Vega, Carlos (Delegado)"], ["Delegación - Club Ajedrez Heredia", "MET-0014 - Mora, Andrea (Torneo B)"]]);
  igual("un entrenador suelto, aparte", D.carpetasDe({ numero: 20, apellidos: "Solano", nombre: "Pedro", rol: "entrenador" }), ["Entrenadores, acompañantes y delegados", "MET-0020 - Solano, Pedro (Entrenador)"]);
  igual("un árbitro suelto, en la carpeta de los árbitros", D.carpetasDe({ numero: 21, apellidos: "Vega", nombre: "Rosa", rol: "arbitro" }), ["Árbitros", "MET-0021 - Vega, Rosa"]);
  igual("y en una delegación, dentro de ella", D.carpetasDe({ numero: 22, apellidos: "Vega", nombre: "Rosa", rol: "arbitro", grupo: "g", delegacion: "Club X" }), ["Delegación - Club X", "MET-0022 - Vega, Rosa (Árbitro)"]);
  cierto("la ficha del Drive trae lo esencial", /inscripción MET-0012[\s\S]*Torneos: Torneo A \+ Torneo Blitz[\s\S]*Código de descuento: MET-ABCD-EFGH \(100 %\)/.test(
    D.fichaDe({ numero: 12, nombre: "Ana", apellidos: "Mora", rol: "jugador", clasico: "A", torneos: ["A", "BLITZ"], codigo_descuento: "MET-ABCD-EFGH", descuento_pct: 100, monto_usd: 0, nacionalidad: "Costa Rica", pais_residencia: "Costa Rica", documento_tipo: "cedula", documento: "1" })));
}
igual("GM: gratis", pr({ torneos: ["A", "BLITZ"], metodo: "dolares", titulo: "GM" }).usd, 0);
igual("código del 100 %: sin costo", pr({ torneos: ["A", "BLITZ"], metodo: "dolares", descuento: 100 }).usd, 0);
igual("código del 20 % sobre A + blitz: 87 − 17,40", pr({ torneos: ["A", "BLITZ"], metodo: "dolares", descuento: 20 }).usd, 69.6);
igual("el parqueo se suma después del código y antes del IVA: (87 − 100 %) + 10, con IVA", pr({ torneos: ["A", "BLITZ"], metodo: "dolares", descuento: 100, parqueo: 10, placa: "BCD123", factura: true }).usd, 11.3);
cierto("y sale en su línea con la placa", pr({ rol: "acompanante", metodo: "dolares", parqueo: 10, placa: "BCD123" }).lineas.some((l) => l.torneo === "PARQUEO" && l.usd === 10 && /placa BCD123/.test(l.texto)));
igual("código del 10 % y factura: el IVA va sobre lo que queda", pr({ torneos: ["B"], metodo: "dolares", descuento: 10, factura: true }).usd, 45.77);
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
  { fideId: "6400555", nombre: "Brenes Arias, Luis", titulo: "IM", fed: "CRC", sexo: "m", nacimiento: 1985, estandar: 2400, rapido: 2390, blitz: 2380 },
  { fideId: "3500123", nombre: "Gonzalez Perez, Mario", titulo: "GM", fed: "GUA", sexo: "m", nacimiento: 1990, estandar: 2510, rapido: 2480, blitz: 2470 },
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
    // El parqueo, como lo contesta metropolitano_parqueo_ver (fijo: nunca la base real).
    async function abrir(parqueo, consulta, contexto, hospedaje, menu) {
      const p = await (contexto || ctx).newPage();
      // Los menús de la alimentación (metropolitano_menu_ver): sin platos, salvo que la prueba diga otra cosa.
      await p.route("**/rest/v1/rpc/metropolitano_menu_ver", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(menu || []) }));
      await p.route("**/rest/v1/rpc/metropolitano_parqueo_ver", (r) => r.fulfill({ contentType: "application/json",
        body: JSON.stringify(parqueo || { disponible: false, precio_usd: null, quedan: 0 }) }));
      // Las camas del hospedaje (metropolitano_hospedaje_ver): sin tope, salvo que la prueba diga otra cosa.
      await p.route("**/rest/v1/rpc/metropolitano_hospedaje_ver", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(hospedaje || { limite: false }) }));
      const anotado = { errores: [], buscado: [], subidos: [], enviado: null };
      p.on("pageerror", (e) => anotado.errores.push(e.message));
      await p.route("**/functions/v1/pareo-listas-elo**", (r) => { anotado.buscado.push(JSON.parse(r.request().postData())); anotado.urls = (anotado.urls || []).concat(r.request().url());
        const q = JSON.parse(r.request().postData()).q, filas = /,/.test(q) ? FILAS_FIDE.filter((f) => f.nombre.startsWith(q.split(",")[0].trim() + ", " + q.split(",")[1].trim())) : FILAS_FIDE;
        r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, filas, total: filas.length, hayMas: false }) }); });
      await p.route("**/storage/v1/object/**", (r) => { anotado.subidos.push(decodeURIComponent(new URL(r.request().url()).pathname)); r.fulfill({ contentType: "application/json", body: '{"Key":"x"}' }); });
      await p.route("**/rest/v1/rpc/metropolitano_inscribir", (r) => {
        anotado.enviado = JSON.parse(r.request().postData()).p;
        const personas = anotado.enviado.personas.map((x, i) => ({ codigo: "MET-00" + (12 + i), numero: 12 + i, nombre: x.nombre }));
        r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, personas, codigo: personas[0].codigo, numero: 12, monto_usd: 87, monto_crc: 40020, enlace: "cd".repeat(32) }) });
      });
      await p.goto(BASE + "/inscripcion-metropolitano.html" + (consulta || "?todo=1"));
      return { p, anotado };
    }
    const tarjeta = (p, n) => p.locator("#personas > section").nth(n);
    async function llenar(t, d) {
      for (const [k, x] of Object.entries(d)) {
        const el = t.locator(`[data-c="${k}"]`);
        if (k === "sexo" || k === "documento_tipo") await el.selectOption(x); else await el.fill(x);
        await el.dispatchEvent("change");
      }
      // «¿Va a necesitar alimentación?» se responde siempre: si nadie la
      // respondió todavía, «No» (como quien no la necesita).
      await t.evaluate((sec) => {
        if (sec.querySelector("[data-alim]:checked")) return;
        const r = sec.querySelector('[data-alim][value="no"]');
        if (r) { r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); }
      });
    }

    /* ----- Una persona: una jugadora con ID FIDE ----- */
    const { p, anotado } = await abrir();
    const t1 = tarjeta(p, 0);
    igual("arranca con una tarjeta de jugador", [await p.locator("#personas > section").count(), await t1.locator("[data-rol]").inputValue()], [1, "jugador"]);
    // De otro país: primero el ID FIDE, y el nombre sale de FIDE y no se cambia.
    cierto("de Costa Rica, el buscador de FIDE no se ve: se escribe el nombre", !(await t1.locator("[data-caja-buscar]").isVisible()));
    await t1.locator('input[name="p1-origen"][value="fuera"]').check();
    cierto("de otro país se pide primero el ID FIDE", await t1.locator("[data-caja-buscar]").isVisible() && /ID FIDE \(el número\)/.test(await t1.locator("[data-buscar-etiqueta]").textContent()));
    cierto("y ve el viaje (llegada, salida y vuelo), no la provincia", await t1.locator('[data-c="llegada"]').isVisible() && await t1.locator('[data-c="vuelo"]').isVisible() && !(await t1.locator('[data-c="provincia"]').isVisible()));
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
    igual("con hospedaje no hay habitación individual: se comparte", await t1.locator('[data-c="habitacion"] option').evaluateAll((os) => os.map((o) => o.value)), ["organizacion", "compartida"]);
    cierto("y lo dice", /no son individuales/.test(await t1.locator("[data-caja-hosp]").textContent()));
    await t1.locator('[data-c="acompanantes"]').fill("1");
    await t1.locator('[data-c="acompanantes"]').dispatchEvent("change");
    igual("un acompañante pide sus datos", await t1.locator("[data-acomp] [data-acomp-campo]").evaluateAll((xs) => xs.map((x) => x.dataset.acompCampo)), ["nombre", "documento", "nacimiento", "parentesco"]);
    await t1.locator('[data-acomp-campo="nombre"]').fill("Luis Mora Rojas");
    await t1.locator('[data-acomp-campo="documento"]').fill("PA123456");
    await t1.locator('[data-acomp-campo="nacimiento"]').fill("1975-02-02");
    await t1.locator('[data-acomp-campo="parentesco"]').fill("Padre");
    cierto("la alimentación viene plegada y su título dice la respuesta", !(await t1.locator('[data-comida][value="desayuno"]').isVisible()) && (await t1.locator("[data-resumen-comidas]").textContent()) === "(No)");
    await t1.locator("[data-plegable-comidas] > summary").click();
    cierto("con «No», no se despliega nada", !(await t1.locator('[data-comida][value="desayuno"]').isVisible()));
    await t1.locator('[data-alim][value="si"]').check();
    cierto("con «Sí», se piden las comidas", await t1.locator('[data-comida][value="desayuno"]').isVisible() && /¿Qué comidas necesita\?/.test(await t1.locator("[data-alim-texto-si]").textContent()));
    await t1.locator('[data-comida][value="desayuno"]').check(); await t1.locator('[data-comida][value="cena"]').check();
    igual("y su título dice que sí", await t1.locator("[data-resumen-comidas]").textContent(), "(Sí)");
    cierto("sin menús, la alimentación es una solicitud sin costo (y lo dice)", await t1.locator("[data-alim-nota-solicitud]").isVisible() && !(await t1.locator("[data-alim-nota-menu]").isVisible())
      && (await t1.locator("[data-menus] *").count()) === 0);
    await t1.locator('[data-c="acepta_publicidad"]').check();
    await p.check('input[name="metodo"][value="sinpe"]');
    cierto("el total sale en colones por SINPE", /\$87\.00 = ₡40\s?020/.test(await p.textContent("#total")));
    await p.click("#revisar");
    cierto("sin aceptar que la habitación es compartida no avanza", /habitación es compartida/.test(await p.textContent("#msg")), await p.textContent("#msg"));
    await t1.locator('[data-c="acepta_compartir"]').check();
    cierto("con hospedaje se ven sus condiciones: la puerta a las 10:30 p.m., la cancha y la ropa de cama", await t1.locator("[data-caja-condiciones]").isVisible()
      && /10:30 p\.m\./.test(await t1.locator("[data-condiciones-texto]").textContent()) && /cancha/.test(await t1.locator("[data-condiciones-texto]").textContent())
      && /no hay ropa de cama ni cortinas/.test(await t1.locator("[data-condiciones-texto]").textContent()));
    await p.click("#revisar");
    cierto("sin aceptar las condiciones del hospedaje no avanza", /condiciones del hospedaje/.test(await p.textContent("#msg")), await p.textContent("#msg"));
    await t1.locator('[data-c="acepta_hospedaje"]').check();
    await p.click("#revisar");
    cierto("sin foto no avanza, y lo dice", /foto/.test(await p.textContent("#msg")));
    await t1.locator("[data-foto]").setInputFiles(FOTO);
    await p.setInputFiles("#comprobante", path.join(RAIZ, "img", "fca-logo.png"));
    await p.check("#acepta-reglamento"); await p.check("#acepta-imagen"); await p.check("#acepta-datos");
    await p.waitForFunction(() => document.querySelector("[data-foto-lista] img"));
    await p.click("#revisar");
    cierto("sin aceptar el seguro y la exoneración no avanza", /cuatro casillas/.test(await p.textContent("#msg")), await p.textContent("#msg"));
    cierto("quien viene de otro país declara también su seguro de viaje", /seguro de viaje/.test(await p.textContent("#acepta-seguro-texto")) && /acompañante/.test(await p.textContent("#acepta-seguro-texto")));
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
      && x1.responsable && x1.responsable.nombre === "Luis Mora" && x1.nombre_fide === "Mora Solis, Ana" && e1.acepta_seguro === true
      && x1.origen === "fuera" && x1.acepta_compartir === true && x1.habitacion === "organizacion" && x1.acepta_hospedaje === true
      && JSON.stringify(x1.acompanantes_detalle) === JSON.stringify([{ nombre: "Luis Mora Rojas", documento: "PA123456", nacimiento: "1975-02-02", parentesco: "Padre" }]), e1);
    cierto("dice el código", /MET-0012/.test(await p.textContent("#listo-texto")));
    cierto("y que le llega el correo de confirmación a su correo", /te llega a ana@ejemplo\.com el correo de confirmación con tu código/.test(await p.textContent("#listo-pago")), await p.textContent("#listo-pago"));
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
    // El código de descuento: la base dice si sirve y de cuánto es; el total baja.
    let codigoVisto = null;
    await s2.p.route("**/rest/v1/rpc/metropolitano_codigo_ver", (r) => { codigoVisto = JSON.parse(r.request().postData()).p_codigo;
      r.fulfill({ contentType: "application/json", body: JSON.stringify(codigoVisto === "MET-ABCD-EFGH" ? { ok: true, codigo: "MET-ABCD-EFGH", porcentaje: 100 } : { ok: false, error: "Ese código no existe, ya se usó o fue anulado." }) }); });
    await u.locator('input[name="p1-clasico"][value="B"]').check();
    cierto("el B sin código cuesta $45", /\$45\.00/.test(await s2.p.textContent("#total")));
    await u.locator("[data-codigo-entrada]").fill("met-zzzz-zzzz");
    await u.locator("[data-codigo-aplicar]").click();
    await u.locator("[data-codigo-estado]").filter({ hasText: "no existe" }).waitFor({ timeout: 5000 });
    cierto("un código que no sirve se dice", true);
    await u.locator("[data-codigo-entrada]").fill("met-abcd-efgh");
    await u.locator("[data-codigo-aplicar]").click();
    await u.locator("[data-codigo-estado]").filter({ hasText: "no tiene costo" }).waitFor({ timeout: 5000 });
    cierto("con un código del 100 % la inscripción queda sin costo y no pide pago", codigoVisto === "MET-ABCD-EFGH" && /sin costo/.test(await s2.p.textContent("#total"))
      && !(await s2.p.locator("#con-pago").isVisible()) && /Código de descuento \(−100 %\)/.test(await s2.p.textContent("#total")), await s2.p.textContent("#total"));
    await u.locator("[data-rol]").selectOption("acompanante");
    await u.locator("[data-rol]").dispatchEvent("change");
    cierto("un acompañante no ve ID FIDE ni torneos", !(await u.locator("[data-bloque-fide]").isVisible()) && !(await u.locator("[data-bloque-torneos]").isVisible()));
    cierto("y no paga", /sin costo/.test(await s2.p.textContent("#total")));

    /* ----- Un GM de afuera: sin hospedaje ni alimentación, con su vuelo, tiquete y pasaporte ----- */
    const s3 = await abrir();
    const gm = tarjeta(s3.p, 0);
    await gm.locator('input[name="p1-origen"][value="fuera"]').check();
    await gm.locator("[data-buscar]").fill("3500123");
    await gm.locator("[data-elegido]:not(.hidden)").waitFor({ timeout: 8000 });
    cierto("un GM no ve hospedaje ni alimentación: se los da la organización",
      await gm.locator("[data-caja-titulado]").isVisible() && /hospedaje y la alimentación/.test(await gm.locator("[data-caja-titulado]").textContent())
      && !(await gm.locator('input[name="p1-hosp"][value="si"]').isVisible()) && !(await gm.locator('[data-comida][value="cena"]').isVisible()));
    cierto("y se le piden el vuelo, el tiquete, el pasaporte y el transporte del aeropuerto",
      await gm.locator('[data-c="vuelo"]').isVisible() && await gm.locator("[data-caja-docs]").isVisible() && /aeropuerto al Estadio Nacional/.test(await gm.locator("[data-caja-viaje]").textContent()));
    await llenar(gm, { nacimiento: "1990-04-04", sexo: "m", nacionalidad: "Guatemala", pais_residencia: "Guatemala", documento_tipo: "pasaporte", documento: "G1234567",
      correo: "gm@ejemplo.com", telefono: "+502 5555 1234", emer_nombre: "Ana Pérez", emer_telefono: "+502 5555 0000" });
    await gm.locator('input[name="p1-clasico"][value="A"]').check();
    await gm.locator('[data-c="acepta_hospedaje"]').check();
    await gm.locator("[data-foto]").setInputFiles(FOTO);
    await s3.p.check("#acepta-reglamento"); await s3.p.check("#acepta-imagen"); await s3.p.check("#acepta-seguro"); await s3.p.check("#acepta-datos");
    await s3.p.waitForFunction(() => document.querySelector("[data-foto-lista] img"));
    await s3.p.click("#revisar");
    cierto("sin el vuelo no avanza", /datos del vuelo/.test(await s3.p.textContent("#msg")), await s3.p.textContent("#msg"));
    await llenar(gm, { llegada: "2026-12-24", salida: "2026-12-31", vuelo: "TA 391" });
    await gm.locator('[data-c="traslado"]').check();
    await s3.p.click("#revisar");
    cierto("sin el tiquete no avanza", /tiquete/.test(await s3.p.textContent("#msg")), await s3.p.textContent("#msg"));
    await gm.locator('[data-doc="tiquete"]').setInputFiles(path.join(RAIZ, "img", "fca-logo.png"));
    await gm.locator('[data-doc="pasaporte"]').setInputFiles(path.join(RAIZ, "img", "fca-logo.png"));
    cierto("y no paga", /sin costo|\$0\.00/.test(await s3.p.textContent("#total")), await s3.p.textContent("#total"));
    await s3.p.click("#revisar");
    await s3.p.waitForSelector("#resumen:not(.hidden)", { timeout: 15000 });
    cierto("el resumen dice que la organización le da el hospedaje y la alimentación según su vuelo", /Los da la organización, del .*24 de diciembre.* según su vuelo/.test(await s3.p.textContent("#resumen-personas")));
    await s3.p.check("#confirmo");
    await s3.p.click("#enviar");
    await s3.p.waitForSelector("#listo:not(.hidden)", { timeout: 10000 });
    const xg = s3.anotado.enviado.personas[0];
    cierto("se manda sin hospedaje ni comidas, con su vuelo, el tiquete y el pasaporte",
      xg.hospedaje === false && xg.comidas.length === 0 && xg.viaje && xg.viaje.vuelo === "TA 391" && xg.viaje.traslado === true
      && /^documento\//.test(xg.tiquete) && /^documento\//.test(xg.pasaporte) && xg.titulo === "GM", xg);
    igual("se subieron la foto, el tiquete y el pasaporte", s3.anotado.subidos.map((x) => x.split("/").slice(-3, -2)[0]), ["foto", "documento", "documento"]);

    /* ----- Un IM de Costa Rica: sin vuelo, pero con sus días en el Estadio Nacional ----- */
    const s4 = await abrir();
    const im = tarjeta(s4.p, 0);
    await llenar(im, { nombre: "Luis", apellidos: "Brenes Arias" });
    await im.locator("[data-elegido]:not(.hidden)").waitFor({ timeout: 8000 });
    cierto("un IM de Costa Rica ve los días de llegada y de salida del Estadio Nacional, sin vuelo, traslado ni documentos",
      await im.locator("[data-caja-titulado]").isVisible() && await im.locator('[data-c="llegada"]').isVisible() && await im.locator('[data-c="salida"]').isVisible()
      && /llegada al Estadio Nacional/.test(await im.locator("[data-caja-viaje]").textContent())
      && !(await im.locator('[data-c="vuelo"]').isVisible()) && !(await im.locator('[data-c="traslado"]').isVisible()) && !(await im.locator("[data-caja-docs]").isVisible())
      && !(await im.locator('input[name="p1-hosp"][value="si"]').isVisible()) && await im.locator('[data-c="provincia"]').isVisible());
    cierto("el titulado también ve y acepta las condiciones del hospedaje, con la ropa de cama de la organización", await im.locator("[data-caja-condiciones]").isVisible()
      && /la organización les da la ropa de cama/.test(await im.locator("[data-condiciones-texto]").textContent()) && !/Trae sábanas/.test(await im.locator("[data-condiciones-texto]").textContent()));
    await im.locator('[data-c="acepta_hospedaje"]').check();
    await im.locator('[data-c="provincia"]').selectOption("Cartago");
    await im.locator('[data-c="canton"]').selectOption("Cartago");
    await llenar(im, { nacimiento: "1985-05-05", sexo: "m", documento: "3-0333-0333", correo: "im@ejemplo.com", telefono: "+506 7111 1111", emer_nombre: "Rosa Arias", emer_telefono: "88880000" });
    await im.locator('input[name="p1-clasico"][value="A"]').check();
    await im.locator("[data-foto]").setInputFiles(FOTO);
    await s4.p.check("#acepta-reglamento"); await s4.p.check("#acepta-imagen"); await s4.p.check("#acepta-seguro"); await s4.p.check("#acepta-datos");
    await s4.p.waitForFunction(() => document.querySelector("[data-foto-lista] img"));
    await s4.p.click("#revisar");
    cierto("sin los días en el Estadio Nacional no avanza", /llega al Estadio Nacional/.test(await s4.p.textContent("#msg")), await s4.p.textContent("#msg"));
    await llenar(im, { llegada: "2026-12-25", salida: "2026-12-30" });
    await s4.p.click("#revisar");
    await s4.p.waitForSelector("#resumen:not(.hidden)", { timeout: 15000 });
    cierto("el resumen dice del 25 al 30 de diciembre, sin «según su vuelo»", /Los da la organización, del .*25 de diciembre.* al .*30 de diciembre/.test(await s4.p.textContent("#resumen-personas"))
      && !/según su vuelo/.test(await s4.p.textContent("#resumen-personas")));
    await s4.p.check("#confirmo");
    await s4.p.click("#enviar");
    await s4.p.waitForSelector("#listo:not(.hidden)", { timeout: 10000 });
    const xi = s4.anotado.enviado.personas[0];
    cierto("se manda con sus días, sin vuelo, y con su foto para el gafete", xi.origen === "cr" && xi.viaje && xi.viaje.llegada === "2026-12-25" && xi.viaje.salida === "2026-12-30"
      && xi.viaje.vuelo === "" && xi.viaje.traslado === false && xi.hospedaje === false && !!xi.foto && xi.acepta_hospedaje === true, xi);

    /* ----- El parqueo: se pide con la placa y se paga con la inscripción ----- */
    // (en una página recién abierta, cuando ya contestó la base: lleno, no se ofrece)
    const s0p = await ctx.newPage();
    await s0p.route("**/rest/v1/rpc/metropolitano_menu_ver", (r) => r.fulfill({ contentType: "application/json", body: "[]" }));
    await s0p.route("**/rest/v1/rpc/metropolitano_parqueo_ver", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ disponible: false, precio_usd: null, quedan: 0 }) }));
    const [s0r] = await Promise.all([s0p.waitForResponse("**/rest/v1/rpc/metropolitano_parqueo_ver"), s0p.goto(BASE + "/inscripcion-metropolitano.html?todo=1")]);
    await s0r.finished(); await s0p.waitForTimeout(300);
    cierto("sin espacios de parqueo, la inscripción no lo ofrece", await s0p.locator("#personas > section [data-c='nombre']").first().isVisible()
      && !(await s0p.locator("#personas > section [data-caja-parqueo]").first().evaluate((x) => x.checkVisibility())));
    await s0p.close();
    const s5 = await abrir({ disponible: true, precio_usd: 10, quedan: 3 });
    const pq = tarjeta(s5.p, 0);
    await pq.locator("[data-caja-parqueo]").waitFor({ state: "visible", timeout: 8000 });
    cierto("con espacios, ofrece el parqueo con su precio y cuántos quedan, y la placa aparece al marcarlo",
      /\$10\.00; quedan 3/.test(await pq.locator("[data-caja-parqueo]").textContent()) && !(await pq.locator('[data-c="placa"]').isVisible()));
    await llenar(pq, { nombre: "Luis", apellidos: "Brenes Arias" });
    await pq.locator("[data-elegido]:not(.hidden)").waitFor({ timeout: 8000 });
    await pq.locator('[data-c="provincia"]').selectOption("Cartago");
    await pq.locator('[data-c="canton"]').selectOption("Cartago");
    await llenar(pq, { nacimiento: "1985-05-05", sexo: "m", documento: "3-0333-0333", correo: "im@ejemplo.com", telefono: "+506 7111 1111", emer_nombre: "Rosa Arias", emer_telefono: "88880000", llegada: "2026-12-25", salida: "2026-12-30" });
    await pq.locator('input[name="p1-clasico"][value="A"]').check();
    await pq.locator("[data-foto]").setInputFiles(FOTO);
    await pq.locator('[data-c="parqueo"]').check();
    await pq.locator('[data-c="acepta_hospedaje"]').check();
    cierto("al marcarlo pide la placa y el total suma el parqueo (el IM no paga la inscripción)", await pq.locator('[data-c="placa"]').isVisible()
      && /Parqueo: \$10\.00/.test(await s5.p.textContent("#total")) && /Total: \$10\.00/.test(await s5.p.textContent("#total")), await s5.p.textContent("#total"));
    await s5.p.check('input[name="metodo"][value="dolares"]');
    await s5.p.setInputFiles("#comprobante", path.join(RAIZ, "img", "fca-logo.png"));
    await s5.p.check("#acepta-reglamento"); await s5.p.check("#acepta-imagen"); await s5.p.check("#acepta-seguro"); await s5.p.check("#acepta-datos");
    await s5.p.waitForFunction(() => document.querySelector("[data-foto-lista] img"));
    await s5.p.click("#revisar");
    cierto("sin la placa no avanza", /placa del vehículo/.test(await s5.p.textContent("#msg")), await s5.p.textContent("#msg"));
    await llenar(pq, { placa: "bcd-123" });
    await s5.p.click("#revisar");
    await s5.p.waitForSelector("#resumen:not(.hidden)", { timeout: 15000 });
    cierto("el resumen dice la placa del parqueo", /Para el vehículo de placa BCD123/.test(await s5.p.textContent("#resumen-personas")));
    await s5.p.check("#confirmo");
    await s5.p.click("#enviar");
    await s5.p.waitForSelector("#listo:not(.hidden)", { timeout: 10000 });
    const xp = s5.anotado.enviado.personas[0];
    cierto("se manda con el parqueo y la placa como la guarda la base", xp.parqueo === true && xp.placa === "BCD123" && s5.anotado.enviado.pago_metodo === "dolares", xp);
    igual("sin errores en la inscripción con parqueo", s5.anotado.errores, []);
    await s5.p.close();

    /* ----- Un grupo: el delegado, una jugadora y un entrenador ----- */
    console.log("   La inscripción de grupo");
    const g = await abrir();
    await g.p.check('input[name="modo"][value="grupo"]');
    await g.p.waitForFunction(() => document.querySelector("#personas > section [data-rol]") && document.querySelector("#personas > section [data-rol]").value === "delegado");
    cierto("en grupo, la primera tarjeta es la del delegado y aparece «Agregar»", await g.p.isVisible("#caja-grupo") && await g.p.isVisible("#agregar"));
    await g.p.fill("#delegacion", "Club Ajedrez Heredia");
    const d = tarjeta(g.p, 0);
    cierto("de Costa Rica no se pide el viaje, sino la provincia y el cantón", !(await d.locator('[data-c="llegada"]').isVisible()) && !(await d.locator('[data-c="vuelo"]').isVisible())
      && await d.locator('[data-c="provincia"]').isVisible() && await d.locator('[data-c="canton"]').isVisible());
    await d.locator('[data-c="provincia"]').selectOption("Heredia");
    igual("el cantón se elige de los de su provincia", (await d.locator('[data-c="canton"] option').allTextContents()).slice(0, 3), ["Elige el cantón…", "Heredia", "Barva"]);
    await d.locator('[data-c="canton"]').selectOption("Barva");
    await llenar(d, { nombre: "Carlos", apellidos: "Rojas Vega", nacimiento: "1980-03-03", sexo: "m", documento: "4-0123-0456", correo: "carlos@ejemplo.com", telefono: "+506 7000 0000", emer_nombre: "Ana Vega", emer_telefono: "88887777" });
    await d.locator('input[name="p2-hosp"][value="si"]').check();
    await d.locator("[data-plegable-comidas] > summary").click();
    await d.locator('[data-alim][value="si"]').check();
    await d.locator('[data-comida][value="almuerzo"]').check();
    await d.locator("[data-foto]").setInputFiles(FOTO);
    await g.p.click('[data-agregar="jugador"]');
    await g.p.click('[data-agregar="entrenador"]');
    igual("se agregaron dos personas", await g.p.locator("#personas > section").count(), 3);
    const j = tarjeta(g.p, 1), en = tarjeta(g.p, 2);
    // Al agregar, las demás se pliegan, y cada una dice en su título si le falta algo.
    cierto("al agregar a alguien, las tarjetas de antes se pliegan y se ve la nueva", !(await d.locator('[data-c="nombre"]').isVisible()) && !(await j.locator('[data-c="nombre"]').isVisible())
      && await en.locator('[data-c="nombre"]').isVisible() && (await d.locator("[data-plegar]").getAttribute("aria-expanded")) === "false");
    cierto("cada tarjeta dice en su título cuánto le falta", /^Falta/.test(await j.locator("[data-estado]").textContent()) && /^Falta/.test(await d.locator("[data-estado]").textContent()), [await d.locator("[data-estado]").textContent()]);
    await j.locator("[data-plegar]").click();
    await d.locator("[data-plegar]").click();
    cierto("a cada persona nueva se le copia de dónde viene, el hospedaje y las comidas del delegado",
      (await j.locator('[data-c="provincia"]').inputValue()) === "Heredia" && (await j.locator('[data-c="canton"]').inputValue()) === "Barva" && await j.locator('input[name="p3-hosp"][value="si"]').isChecked()
      && await j.locator('[data-comida][value="almuerzo"]').isChecked() && await j.locator('[data-alim][value="si"]').isChecked());
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
    for (const t of [d, j, en]) if (await t.locator('[data-c="acepta_compartir"]').isVisible()) await t.locator('[data-c="acepta_compartir"]').check();
    for (const t of [d, j, en]) if (await t.locator('[data-c="acepta_hospedaje"]').isVisible()) await t.locator('[data-c="acepta_hospedaje"]').check();
    cierto("si todos son de Costa Rica, no se les pide seguro de viaje: la póliza del evento", !/seguro de viaje/.test(await g.p.textContent("#acepta-seguro-texto")) && /póliza de seguro/.test(await g.p.textContent("#acepta-seguro-texto")));
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
      && ge.personas[0].es_delegado === true && ge.personas[0].rol === "delegado" && ge.personas[0].provincia === "Heredia" && ge.personas[0].canton === "Barva" && ge.personas[0].viaje === null && ge.personas[1].rol === "jugador" && ge.personas[1].fide_id === "6400099"
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


    /* ----- Por pasos y en inglés: los errores en su campo, el borrador y el idioma ----- */
    console.log("   Por pasos, en inglés y en francés");
    // Lo que quedó en español con otro idioma puesto: un texto que el idioma no
    // tocó y no está en su mapa (los datos de prueba, que son nombres, no cuentan).
    const enEspanol = (pg) => pg.evaluate(() => {
      const api = window.IdiomaPagina.actual, hechos = api.traducidos();
      const en = document.documentElement.lang === "en";
      const mapa = Object.assign({}, (en ? window.MetropolitanoEN : window.MetropolitanoFR).textos, (en ? window.InscripcionMetroEN : window.InscripcionMetroFR).textos);
      const datos = /Andrea|Mora|Solis|Pedro|Carlos|Rojas|Vega|Solano|San José|Escazú|Costa Rica|Heredia|Barva|MET-|fca-logo|@ejemplo/;
      const L = (t) => String(t || "").replace(/\s+/g, " ").trim();
      const sin = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) {
        if (!n.parentElement || n.parentElement.closest("script, style, [data-no-traducir]")) continue;
        const t = L(n.nodeValue);
        if (t && /[a-záéíóúñ]/.test(t) && !hechos.has(n) && !Object.prototype.hasOwnProperty.call(mapa, t) && !datos.test(t)) sin.push(t);
      }
      document.querySelectorAll("[aria-label], [placeholder], [title], [alt]").forEach((el) => {
        if (el.closest("[data-no-traducir]")) return;
        ["aria-label", "placeholder", "title", "alt"].forEach((a) => { const v = L(el.getAttribute(a)); if (v && api.traducir(v) !== v) sin.push("@" + a + ": " + v); });
      });
      return [...new Set(sin)];
    });
    const ingles = await abrir(null, "?lang=en");
    const ip = ingles.p, it = tarjeta(ip, 0);
    igual("con ?lang=en la página sale en inglés", await ip.evaluate(() => document.documentElement.lang), "en");
    igual("por pasos: arranca en el primero", await ip.textContent("#paso-titulo"), "Step 1 of 5: Who registers");
    cierto("en el paso 1 se ve quién es, y no los torneos, la estadía ni el pago", await it.locator('[data-c="nombre"]').isVisible() && !(await it.locator("[data-bloque-torneos]").isVisible())
      && !(await it.locator('[data-c="provincia"]').isVisible()) && !(await ip.isVisible("#caja-pago")) && !(await ip.isVisible("#atras")));
    cierto("y abajo, siempre a la vista, el total y «Siguiente»", await ip.isVisible("#barra") && /Total/.test(await ip.textContent("#barra-total")) && await ip.isVisible("#siguiente"));
    await ip.click("#ver-todo");
    cierto("«Ver todo en una página» junta los pasos", await ip.isVisible("#caja-pago") && await it.locator("[data-bloque-torneos]").isVisible() && !(await ip.isVisible("#siguiente")));
    await ip.click("#ver-todo");
    cierto("y «Ver por pasos» los vuelve a separar", !(await ip.isVisible("#caja-pago")) && await ip.isVisible("#siguiente"));
    await ip.click("#siguiente");
    cierto("«Siguiente» con lo del paso a medias no avanza: dice todo lo que falta, junto", (await ip.textContent("#paso-titulo")).startsWith("Step 1") && await ip.isVisible("#errores")
      && (await ip.locator("#errores-lista li").count()) >= 5 && /The full name is missing\./.test(await ip.textContent("#errores-lista")));
    cierto("y cada campo dice lo suyo debajo, marcado para el lector de pantalla", await it.locator('[data-c="sexo"]').getAttribute("aria-invalid") === "true"
      && /The sex is missing\./.test(await ip.textContent("#" + await it.locator('[data-c="sexo"]').getAttribute("aria-describedby").then((x) => x.split(" ").pop()))));
    const cuantosAntes = await ip.locator("#errores-lista li").count();
    await it.locator('[data-c="sexo"]').selectOption("f");
    cierto("al corregirlo, su frase se va, y también de la lista de arriba", (await ip.locator("#errores-lista li").count()) === cuantosAntes - 1 && (await it.locator('[data-c="sexo"]').getAttribute("aria-invalid")) === null);
    await ip.locator("#errores-lista button").first().click();
    cierto("cada cosa de la lista lleva a su campo", await ip.evaluate(() => document.activeElement && document.activeElement.matches("#personas input, #personas select")));
    await it.locator('[data-c="nombre"]').fill("Andrea"); await it.locator('[data-c="apellidos"]').fill("Mora Solis");
    await it.locator("[data-elegido]:not(.hidden)").waitFor({ timeout: 8000 }).catch(() => {});
    await ip.waitForFunction(() => /6400099/.test(document.querySelector("[data-estado-nombre]").textContent), null, { timeout: 8000 });
    await llenar(it, { nacimiento: "1990-07-07", documento: "1-1111-2222", correo: "andrea@ejemplo.com", telefono: "+506 8888 0000", emer_nombre: "Carlos Rojas", emer_telefono: "88887777" });
    await it.locator("[data-foto]").setInputFiles(FOTO);
    await ip.waitForFunction(() => document.querySelectorAll("[data-foto-lista] img").length === 1);
    igual("en inglés, nada del paso 1 queda en español", await enEspanol(ip), []);
    await ip.click("#siguiente");
    igual("con el paso completo, «Siguiente» lleva al de los torneos", await ip.textContent("#paso-titulo"), "Step 2 of 5: Tournaments");
    cierto("donde ya no se ve lo del paso 1, y sí «Atrás»", !(await it.locator('[data-c="nombre"]').isVisible()) && await it.locator("[data-bloque-torneos]").isVisible() && await ip.isVisible("#atras"));
    cierto("sin Elo y nacida en 1990: el B, elegido solo", await it.locator('input[name="p1-clasico"][value="B"]').isChecked());
    igual("en inglés, nada de los torneos queda en español", await enEspanol(ip), []);
    await ip.click("#siguiente");
    await ip.click("#siguiente");
    cierto("en la estadía, sin la provincia no avanza", (await ip.textContent("#paso-titulo")).startsWith("Step 3") && /province or canton/.test(await ip.textContent("#errores-lista")));
    await it.locator('[data-c="provincia"]').selectOption("San José"); await it.locator('[data-c="canton"]').selectOption("Escazú");
    await it.locator('input[name="p1-hosp"][value="si"]').check();
    cierto("las condiciones del hospedaje, en inglés", /The door closes at 10:30 p\.m\./.test(await it.locator("[data-condiciones-texto]").textContent())
      && /I have read and accept the conditions of the lodging/.test(await it.locator("[data-acepto-hospedaje]").textContent()));
    await it.locator('[data-c="acepta_compartir"]').check(); await it.locator('[data-c="acepta_hospedaje"]').check();
    igual("en inglés, nada de la estadía queda en español", await enEspanol(ip), []);
    await ip.click("#siguiente");
    igual("después, el pago", await ip.textContent("#paso-titulo"), "Step 4 of 5: Payment");
    await ip.check('input[name="metodo"][value="sinpe"]');
    await ip.setInputFiles("#comprobante", path.join(RAIZ, "img", "fca-logo.png"));
    await ip.check("#quiere-factura");
    igual("en inglés, nada del pago queda en español", await enEspanol(ip), []);
    await ip.uncheck("#quiere-factura");
    await ip.click("#siguiente");
    cierto("y al final, confirmar: el seguro corto en la casilla, con su texto entero plegado", (await ip.textContent("#paso-titulo")).startsWith("Step 5")
      && await ip.isVisible("#acepta-seguro") && !(await ip.isVisible("#acepta-seguro-texto")) && /valid insurance policy/.test(await ip.textContent("#acepta-seguro-texto")));
    await ip.check("#acepta-reglamento"); await ip.check("#acepta-imagen"); await ip.check("#acepta-seguro"); await ip.check("#acepta-datos");
    await ip.waitForTimeout(600);
    cierto("lo llenado se guarda en el aparato, sin las fotos", await ip.evaluate(() => { const b = JSON.parse(localStorage.getItem("metro_borrador_v1") || "null");
      return !!b && b.personas[0].campos.nombre === "Andrea" && !/blob:|data:image/.test(JSON.stringify(b)) && !("acepta_hospedaje" in b.personas[0].campos); }));
    await ip.click("#revisar");
    await ip.waitForSelector("#resumen:not(.hidden)", { timeout: 8000 }).catch(() => {});
    igual("el resumen, en inglés", await ip.textContent("#resumen-titulo"), "Welcome to the Metropolitano Tournament 2026");
    igual("en inglés, nada del resumen queda en español", await enEspanol(ip), []);
    await ip.check("#confirmo");
    await ip.click("#enviar");
    await ip.waitForSelector("#listo:not(.hidden)", { timeout: 15000 });
    igual("lo que se manda va en español, como lo guarda la base", ingles.anotado.enviado.personas[0].torneos, ["B"]);
    igual("en inglés, nada de la confirmación queda en español", await enEspanol(ip), []);
    cierto("y al mandarla, el borrador se borra", await ip.evaluate(() => localStorage.getItem("metro_borrador_v1") === null));
    igual("sin errores en la página en inglés", ingles.anotado.errores, []);

    // El borrador: al volver, se ofrece seguir donde quedó (en un aparato aparte).
    const ctxB = await nav.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: "block" });
    const b1 = await abrir(null, "?todo=1", ctxB);
    await b1.p.check('input[name="modo"][value="grupo"]');
    await b1.p.fill("#delegacion", "Club Ajedrez Heredia");
    await b1.p.click('[data-agregar="acompanante"]');
    await tarjeta(b1.p, 1).locator('[data-c="nombre"]').fill("Pedro");
    await tarjeta(b1.p, 1).locator('[data-c="apellidos"]').fill("Solano");
    await b1.p.waitForTimeout(700);
    await b1.p.close();
    const b2 = await abrir(null, "?todo=1", ctxB);
    cierto("al volver, ofrece seguir donde quedó", await b2.p.isVisible("#borrador") && /Club Ajedrez Heredia.*2 personas/.test(await b2.p.textContent("#borrador-texto"))
      && /fotos/.test(await b2.p.textContent("#borrador-texto")));
    await b2.p.click("#borrador-seguir");
    cierto("y «Seguir donde quedé» vuelve a poner todo", (await b2.p.inputValue("#delegacion")) === "Club Ajedrez Heredia" && (await b2.p.locator("#personas > section").count()) === 2
      && (await tarjeta(b2.p, 1).locator("[data-rol]").inputValue()) === "acompanante" && (await tarjeta(b2.p, 1).locator('[data-c="apellidos"]').inputValue()) === "Solano"
      && !(await b2.p.isVisible("#borrador")));
    await b2.p.close();
    const b3 = await abrir(null, "?todo=1", ctxB);
    await b3.p.click("#borrador-nuevo");
    cierto("«Empezar de nuevo» lo borra", !(await b3.p.isVisible("#borrador")) && await b3.p.evaluate(() => localStorage.getItem("metro_borrador_v1") === null)
      && (await b3.p.locator("#personas > section").count()) === 1);
    await ctxB.close();

    // En francés, un grupo a medias: la lista de lo que falta y el aviso de quitar a alguien.
    const fr = await abrir(null, "?lang=fr&todo=1");
    await fr.p.check('input[name="modo"][value="grupo"]');
    await fr.p.click('[data-agregar="jugador"]');
    await fr.p.click("#revisar");
    cierto("en francés, lo que falta del grupo, con el número y el nombre de cada uno", /Il manque/.test(await fr.p.textContent("#errores-titulo")) && (await fr.p.locator("#errores-lista li").allTextContents()).some((x) => /^2\. personne sans nom : Il manque/.test(x)), [await fr.p.textContent("#errores-titulo"), await fr.p.locator("#errores-lista li").allTextContents()]);
    igual("en francés, nada del grupo queda en español", await enEspanol(fr.p), []);
    await tarjeta(fr.p, 1).locator("[data-quitar]").click();
    await fr.p.waitForSelector("dialog[open]");
    cierto("el aviso de quitar a alguien, en francés", /Retirer de l’inscription/.test(await fr.p.textContent("dialog[open]")));
    igual("en francés, nada del aviso queda en español", await enEspanol(fr.p), []);
    await fr.p.keyboard.press("Escape");
    await fr.p.click("#metro-idioma");
    await fr.p.click("#metro-idiomas [data-idioma='es']");
    cierto("y de vuelta al español, todo como estaba", /^Faltan \d+ cosas para seguir:$/.test(await fr.p.textContent("#errores-titulo")) && /^Persona sin nombre todavía/.test(await tarjeta(fr.p, 1).locator("[data-titulo]").textContent()) === false
      && /— Jugador/.test(await tarjeta(fr.p, 1).locator("[data-titulo]").textContent()));
    igual("sin errores en la página en francés", fr.anotado.errores, []);


    /* ----- El árbitro, el cupo de camas y el enlace para corregir ----- */
    console.log("   El árbitro y el cupo del hospedaje");
    const ar = await abrir(null, "?todo=1", null, { limite: true, lleno: false, quedan: { "2026-12-25": 0, "2026-12-26": 3, "2026-12-27": 3 } });
    const at = tarjeta(ar.p, 0);
    cierto("se puede inscribir un árbitro", (await at.locator("[data-rol] option").evaluateAll((os) => os.map((o) => o.value))).includes("arbitro"));
    await at.locator("[data-rol]").selectOption("arbitro");
    cierto("el árbitro pone su ID FIDE si tiene, no elige torneo y pide hospedaje como cualquiera", /si tiene/.test(await at.locator("[data-fide-pregunta]").textContent())
      && !(await at.locator("[data-bloque-torneos]").isVisible()) && await at.locator('input[name="p1-hosp"][value="si"]').isVisible());
    await at.locator('input[name="p1-fide"][value="no"]').check();
    await llenar(at, { nombre: "Rosa", apellidos: "Vega Mora", nacimiento: "1980-04-04", sexo: "f", documento: "1-3333-4444", correo: "rosa@ejemplo.com", telefono: "+506 8888 1111", emer_nombre: "Luis Vega", emer_telefono: "88880000" });
    await at.locator('[data-c="provincia"]').selectOption("San José"); await at.locator('[data-c="canton"]').selectOption("Escazú");
    await at.locator('input[name="p1-hosp"][value="si"]').check();
    await at.locator('[data-c="acepta_compartir"]').check(); await at.locator('[data-c="acepta_hospedaje"]').check();
    await at.locator("[data-foto]").setInputFiles(FOTO);
    await ar.p.waitForFunction(() => document.querySelectorAll("[data-foto-lista] img").length === 1);
    await ar.p.check("#acepta-reglamento"); await ar.p.check("#acepta-imagen"); await ar.p.check("#acepta-seguro"); await ar.p.check("#acepta-datos");
    await ar.p.click("#revisar");
    cierto("una noche sin camas no deja seguir, y lo dice", /ya no tiene camas para la noche del 25 de diciembre/.test(await ar.p.textContent("#msg")), await ar.p.textContent("#msg"));
    await llenar(at, { hospedaje_desde: "2026-12-26", hospedaje_hasta: "2026-12-28" });
    await ar.p.click("#revisar");
    await ar.p.waitForSelector("#resumen:not(.hidden)", { timeout: 8000 }).catch(() => {});
    cierto("con otras noches sí pasa a la revisión", await ar.p.isVisible("#resumen"), await ar.p.textContent("#msg"));
    await ar.p.check("#confirmo"); await ar.p.click("#enviar");
    await ar.p.waitForSelector("#listo:not(.hidden)", { timeout: 15000 });
    igual("se manda como árbitro, sin torneos y con su hospedaje", [ar.anotado.enviado.personas[0].rol, ar.anotado.enviado.personas[0].torneos, ar.anotado.enviado.personas[0].hospedaje], ["arbitro", [], true]);
    cierto("al terminar, el enlace para corregir la inscripción (con el secreto detrás del #)", await ar.p.isVisible("#listo-enlace-caja")
      && /\/metropolitano-mi-inscripcion\.html#t=(cd){32}$/.test(await ar.p.getAttribute("#listo-enlace", "href")));
    igual("sin errores en la inscripción del árbitro", ar.anotado.errores, []);
    const lleno = await abrir(null, "?todo=1", null, { limite: true, lleno: true, quedan: {} });
    cierto("con el hospedaje lleno no se ofrece, y lo dice", !(await tarjeta(lleno.p, 0).locator("[data-hosp-pregunta]").isVisible()) && await tarjeta(lleno.p, 0).locator("[data-hosp-lleno]").isVisible());
    await lleno.p.check('input[name="modo"][value="grupo"]');
    cierto("en un grupo se agrega un árbitro", await lleno.p.isVisible('[data-agregar="arbitro"]'));
    await lleno.p.close();

    /* ----- La alimentación: sí, aún no lo sé o no; los menús y quién los prepara ----- */
    console.log("   Los menús de la alimentación");
    const MENU = [
      { id: "a1111111-1111-4111-8111-111111111111", comida: "desayuno", nombre: "Gallo pinto", descripcion: "Con huevo y plátano", cocina: "Soda Tala", cocina_detalle: "Frente al estadio", precio_usd: 6.5, imagen: "menu/gallo.jpg" },
      { id: "a2222222-2222-4222-8222-222222222222", comida: "desayuno", nombre: "Gallo pinto", descripcion: null, cocina: "Doña Rosa", cocina_detalle: null, precio_usd: 6, imagen: null },
      { id: "a3333333-3333-4333-8333-333333333333", comida: "almuerzo", nombre: "Casado", descripcion: "Arroz, frijoles, ensalada y carne", cocina: null, cocina_detalle: null, precio_usd: 9, imagen: null },
    ];
    const mn = await abrir(null, "?todo=1", null, null, MENU);
    await mn.p.route("**/storage/v1/object/public/metropolitano-menu/**", (r) => r.fulfill({ contentType: "image/png", body: fs.readFileSync(FOTO) }));
    const tm = tarjeta(mn.p, 0);
    await tm.locator("[data-rol]").selectOption("arbitro");
    await tm.locator('input[name="p1-fide"][value="no"]').check();
    await tm.locator("[data-plegable-comidas] > summary").click();
    igual("la pregunta tiene tres respuestas: sí, aún no lo sé y no", await tm.locator("[data-alim]").evaluateAll((xs) => xs.map((x) => x.value)), ["si", "tal_vez", "no"]);
    await tm.locator('[data-alim][value="tal_vez"]').check();
    cierto("con «Aún no lo sé» se pregunta si quiere ver las opciones y sus precios, y todavía no se muestran",
      await tm.locator("[data-alim-ver]").isVisible() && /opciones y sus precios/.test(await tm.locator("[data-alim-ver]").textContent()) && (await tm.locator("[data-menus] .metro-plato").count()) === 0);
    await tm.locator('[data-alim-ver-op][value="si"]').check();
    const vistos = await tm.locator("[data-menus]").textContent();
    cierto("con «Sí, quiero verlas» se ven todos los menús, solo para mirar (sin elegir), con quién prepara y el precio por día",
      (await tm.locator("[data-menus] .metro-plato").count()) === 2 && (await tm.locator("[data-menus] input").count()) === 0
      && /Lo prepara: Soda Tala/.test(vistos) && /Lo prepara: Doña Rosa/.test(vistos) && /\$6\.50 por día/.test(vistos) && /Lo prepara: La organización/.test(vistos), vistos);
    cierto("el mismo plato de dos cocinas va en una sola tarjeta, con su foto", (await tm.locator("[data-menus] .metro-plato").first().locator(".metro-plato-nombre").textContent()) === "Gallo pinto"
      // La foto se espera (hasta 5 s): recién pintada puede no haber cargado todavía, y en el CI tardaba más.
      && await tm.locator("[data-menus] .metro-plato-foto").first().evaluate((i) => (i.complete && i.naturalWidth > 0) || new Promise((ok) => {
        i.addEventListener("load", () => ok(i.naturalWidth > 0), { once: true });
        i.addEventListener("error", () => ok(false), { once: true });
        setTimeout(() => ok(i.complete && i.naturalWidth > 0), 5000);
      })));
    cierto("y no se cobra nada: el total sigue sin costo, y lo dice", /sin costo/.test(await mn.p.textContent("#total")) && await tm.locator("[data-alim-nota-tal-vez]").isVisible());
    await tm.locator('[data-alim-ver-op][value="no"]').check();
    cierto("con «Por ahora no» se esconden y se sigue", (await tm.locator("[data-menus] .metro-plato").count()) === 0);
    await tm.locator('[data-alim][value="si"]').check();
    await tm.locator('[data-comida][value="desayuno"]').check(); await tm.locator('[data-comida][value="almuerzo"]').check();
    igual("con «Sí», cada comida marcada trae su menú para elegir el plato y quién lo prepara",
      await tm.locator("[data-menus] [data-menu-plato]").evaluateAll((xs) => xs.map((x) => x.dataset.menuPlato + ":" + x.value.slice(0, 2))), ["desayuno:a1", "desayuno:a2", "almuerzo:a3"]);
    await llenar(tm, { nombre: "Rosa", apellidos: "Vega Mora", nacimiento: "1980-04-04", sexo: "f", documento: "1-3333-4444", correo: "rosa@ejemplo.com", telefono: "+506 8888 1111", emer_nombre: "Luis Vega", emer_telefono: "88880000" });
    await tm.locator('[data-c="provincia"]').selectOption("San José"); await tm.locator('[data-c="canton"]').selectOption("Escazú");
    await tm.locator("[data-foto]").setInputFiles(FOTO);
    await mn.p.waitForFunction(() => document.querySelectorAll("[data-foto-lista] img").length === 1);
    await mn.p.check("#acepta-reglamento"); await mn.p.check("#acepta-imagen"); await mn.p.check("#acepta-seguro"); await mn.p.check("#acepta-datos");
    await mn.p.click("#revisar");
    const faltaPlato = (await mn.p.textContent("#msg")) + " " + (await mn.p.textContent("#errores"));
    cierto("sin elegir el plato no avanza, y dice cuál falta", /Elige el plato del desayuno y quién lo prepara/.test(faltaPlato) && /Elige el plato del almuerzo/.test(faltaPlato), faltaPlato);
    await tm.locator('[data-menu-plato="desayuno"][value^="a2"]').check();
    await tm.locator('[data-menu-plato="almuerzo"]').check();
    const totMenu = await mn.p.textContent("#total");
    cierto("el total suma cada plato por los días (del 26 al 30: 5 días): $30 de desayuno y $45 de almuerzo",
      /Gallo pinto \(Doña Rosa\), \$6\.00 × 5 días: \$30\.00/.test(totMenu) && /Casado \(La organización\), \$9\.00 × 5 días: \$45\.00/.test(totMenu) && /Total: \$75\.00/.test(totMenu), totMenu);
    await llenar(tm, { comidas_hasta: "2026-12-27" });
    cierto("y al cambiar los días, cambia el total (2 días: $30)", /Total: \$30\.00/.test(await mn.p.textContent("#total")), await mn.p.textContent("#total"));
    await mn.p.check('input[name="metodo"][value="sinpe"]');
    await mn.p.setInputFiles("#comprobante", path.join(RAIZ, "img", "fca-logo.png"));
    await mn.p.click("#revisar");
    await mn.p.waitForSelector("#resumen:not(.hidden)", { timeout: 8000 }).catch(() => {});
    const resMenu = await mn.p.textContent("#resumen");
    cierto("el resumen dice cada plato, quién lo prepara y cuánto", /Gallo pinto \(Doña Rosa\), \$6\.00 × 2 días = \$12\.00/.test(resMenu) && /Casado/.test(resMenu), await mn.p.textContent("#msg"));
    await mn.p.check("#confirmo"); await mn.p.click("#enviar");
    await mn.p.waitForSelector("#listo:not(.hidden)", { timeout: 15000 });
    const em = mn.anotado.enviado.personas[0];
    igual("se manda la respuesta, las comidas y el plato elegido de cada una (la base recalcula el monto)",
      [em.alimentacion, em.comidas, em.menu, em.tal_vez], ["si", ["desayuno", "almuerzo"], { desayuno: MENU[1].id, almuerzo: MENU[2].id }, null]);
    igual("sin errores en la inscripción con menú", mn.anotado.errores, []);
    await mn.p.close();
    // «Aún no lo sé» se manda sin costo, con lo que podría necesitar.
    const tv1 = await abrir(null, "?todo=1", null, null, MENU);
    const tvt = tarjeta(tv1.p, 0);
    await tvt.locator("[data-rol]").selectOption("arbitro");
    await tvt.locator('input[name="p1-fide"][value="no"]').check();
    await tvt.locator("[data-plegable-comidas] > summary").click();
    await tvt.locator('[data-alim][value="tal_vez"]').check();
    await llenar(tvt, { nombre: "Rosa", apellidos: "Vega Mora", nacimiento: "1980-04-04", sexo: "f", documento: "1-3333-4444", correo: "rosa@ejemplo.com", telefono: "+506 8888 1111", emer_nombre: "Luis Vega", emer_telefono: "88880000" });
    await tvt.locator('[data-c="provincia"]').selectOption("San José"); await tvt.locator('[data-c="canton"]').selectOption("Escazú");
    await tvt.locator("[data-foto]").setInputFiles(FOTO);
    await tv1.p.waitForFunction(() => document.querySelectorAll("[data-foto-lista] img").length === 1);
    await tv1.p.check("#acepta-reglamento"); await tv1.p.check("#acepta-imagen"); await tv1.p.check("#acepta-seguro"); await tv1.p.check("#acepta-datos");
    await tv1.p.click("#revisar");
    cierto("con «Aún no lo sé» se pide qué comidas podría necesitar", /Marca qué comidas cree que podría necesitar/.test(await tv1.p.textContent("#msg")), await tv1.p.textContent("#msg"));
    await tvt.locator('[data-comida][value="cena"]').check();
    await tv1.p.click("#revisar");
    await tv1.p.waitForSelector("#resumen:not(.hidden)", { timeout: 8000 }).catch(() => {});
    cierto("y pasa sin pagar, con su respuesta en el resumen", /Aún no lo sé/.test(await tv1.p.textContent("#resumen")) && /cena del/.test(await tv1.p.textContent("#resumen")), await tv1.p.textContent("#msg"));
    await tv1.p.check("#confirmo"); await tv1.p.click("#enviar");
    await tv1.p.waitForSelector("#listo:not(.hidden)", { timeout: 15000 });
    const et = tv1.anotado.enviado.personas[0];
    igual("se manda «tal_vez» con las comidas y los días, sin comidas pedidas ni plato",
      [et.alimentacion, et.comidas, et.menu, et.tal_vez], ["tal_vez", [], null, { comidas: ["cena"], desde: "2026-12-26", hasta: "2026-12-30" }]);
    await tv1.p.close();
    // En inglés, el menú sale en inglés (los nombres de los platos, como los escribió administración).
    const mnEn = await abrir(null, "?todo=1", null, null, MENU);
    const te = tarjeta(mnEn.p, 0);
    await te.locator("[data-plegable-comidas] > summary").click();
    await te.locator('[data-alim][value="si"]').check();
    await te.locator('[data-comida][value="desayuno"]').check();
    await mnEn.p.click("#metro-idioma"); await mnEn.p.click("#metro-idiomas [data-idioma='en']");
    await mnEn.p.waitForFunction(() => /Prepared by/.test(document.querySelector("#personas [data-menus]").textContent));
    const enMenu = await te.locator("[data-menus]").textContent();
    cierto("English: el menú dice quién prepara y el precio por día en inglés", /Choose the breakfast/.test(enMenu) && /Prepared by: Soda Tala/.test(enMenu) && /\$6\.50 per day/.test(enMenu), enMenu);
    cierto("English: la pregunta y sus respuestas, en inglés", /Will they need meals during the tournament\?/.test(await te.locator("[data-caja-alim-pregunta]").textContent())
      && /I don’t know yet/.test(await te.locator("[data-caja-alim-pregunta]").textContent()));
    await mnEn.p.click("#metro-idioma"); await mnEn.p.click("#metro-idiomas [data-idioma='es']");
    await mnEn.p.close();

    /* ----- Corregir la inscripción con el enlace ----- */
    console.log("   Corregir la inscripción");
    const TOK = "ef".repeat(32);
    const mia = { ok: true, grupo: false, delegacion: null, puede_corregir: true,
      pago: { estado: "rechazado", metodo: "sinpe", total: 45, nota: "El comprobante no se lee" },
      personas: [{ id: "22222222-2222-2222-2222-222222222222", codigo: "MET-0030", nombre: "Ana", apellidos: "Mora Solis", rol: "jugador", es_delegado: false, sexo: "f", torneos: ["B"], estado: "activa",
        correo: "ana@ejemplo.com", telefono: "+506 8888 1234", emergencia: { nombre: "Luis Mora", telefono: "88880000" }, origen: "fuera", titulado: false, viaje: { llegada: "2026-12-24", salida: "2026-12-31", vuelo: "AV 123", traslado: true },
        hospedaje: true, hospedaje_desde: "2026-12-25", hospedaje_hasta: "2026-12-31", acompanantes: 0, comidas: ["cena"], comidas_desde: "2026-12-26", comidas_hasta: "2026-12-30", dieta: null,
        parqueo: true, placa: "BCD123", monto_usd: 45, pago_estado: "rechazado" }] };
    const mi = await ctx.newPage();
    const miErr = []; mi.on("pageerror", (e) => miErr.push(e.message));
    let leidoMi = null, corregido = null, pedido = null, subidosMi = [];
    await mi.route("**/rest/v1/rpc/metropolitano_mi_inscripcion", (r) => { leidoMi = JSON.parse(r.request().postData()); r.fulfill({ contentType: "application/json", body: JSON.stringify(leidoMi.p_token === TOK ? mia : { ok: false, error: "Este enlace no es válido. Pide uno nuevo con tu código y tu correo." }) }); });
    await mi.route("**/rest/v1/rpc/metropolitano_corregir", (r) => { corregido = JSON.parse(r.request().postData());
      r.fulfill({ contentType: "application/json", body: JSON.stringify(Object.assign({}, mia, { pago: Object.assign({}, mia.pago, { estado: "por_revisar", nota: null }) })) }); });
    await mi.route("**/rest/v1/rpc/metropolitano_pedir_enlace", (r) => { pedido = JSON.parse(r.request().postData()); r.fulfill({ contentType: "application/json", body: '{"ok":true}' }); });
    await mi.route("**/storage/v1/object/**", (r) => { subidosMi.push(decodeURIComponent(new URL(r.request().url()).pathname)); r.fulfill({ contentType: "application/json", body: '{"Key":"x"}' }); });
    await mi.goto(BASE + "/metropolitano-mi-inscripcion.html#t=" + TOK);
    await mi.waitForSelector("#ficha:not(.hidden)", { timeout: 8000 });
    igual("el enlace se lee del # (no viaja en la dirección)", leidoMi, { p_token: TOK });
    cierto("dice que el pago se rechazó, con el motivo, y deja subir otro comprobante", /No se pudo verificar el pago\./.test(await mi.textContent("#pago-estado")) && /El comprobante no se lee/.test(await mi.textContent("#pago-estado")) && await mi.isVisible("#pago-nuevo"), await mi.textContent("#pago-estado"));
    cierto("de quien viene de afuera se corrigen el viaje, el hospedaje, la comida y la placa", await mi.isVisible('[id$="-vuelo"]') && await mi.isVisible('[id$="-hdes"]') && await mi.isVisible('[id$="-placa"]') && await mi.isVisible("[data-comida]"));
    await mi.fill('[id$="-tel"]', "+506 7000 0000");
    await mi.fill('[id$="-vuelo"]', "CM 456");
    await mi.locator('[data-comida="desayuno"]').check();
    await mi.setInputFiles("#comprobante", path.join(RAIZ, "img", "fca-logo.png"));
    await mi.click("#guardar");
    await mi.waitForFunction(() => /Listo: se guardaron los cambios/.test(document.getElementById("msg").textContent), null, { timeout: 10000 });
    const pc = corregido && corregido.p.personas[0];
    cierto("guardar manda lo corregido y el comprobante nuevo, ya subido", corregido && corregido.p_token === TOK && pc.telefono === "+506 7000 0000" && pc.viaje.vuelo === "CM 456" && pc.viaje.traslado === true
      && JSON.stringify(pc.comidas) === '["desayuno","cena"]' && /^comprobante\//.test(corregido.p.comprobante) && subidosMi.some((x) => /\/comprobante\//.test(x)), JSON.stringify(corregido));
    cierto("y dice que el pago volvió a quedar por revisar", /volvió a quedar por revisar/.test(await mi.textContent("#msg")) && /por revisar/.test(await mi.textContent("#pago-estado")));
    igual("sin errores al corregir", miErr, []);
    const sinEnlace = await ctx.newPage();
    await sinEnlace.route("**/rest/v1/rpc/metropolitano_pedir_enlace", (r) => { pedido = JSON.parse(r.request().postData()); r.fulfill({ contentType: "application/json", body: '{"ok":true}' }); });
    await sinEnlace.goto(BASE + "/metropolitano-mi-inscripcion.html");
    cierto("sin el enlace, se pide con el código y el correo", await sinEnlace.isVisible("#pedir") && !(await sinEnlace.isVisible("#ficha")));
    await sinEnlace.fill("#pedir-codigo", "MET-0030"); await sinEnlace.fill("#pedir-correo", "ana@ejemplo.com");
    await sinEnlace.click("#pedir-boton");
    await sinEnlace.waitForFunction(() => /te llega el enlace/.test(document.getElementById("pedir-msg").textContent));
    igual("y la base recibe el código y el correo", pedido, { p_codigo: "MET-0030", p_correo: "ana@ejemplo.com" });
    await sinEnlace.close(); await mi.close();

    /* ----- La acreditación en la entrada ----- */
    console.log("   La acreditación");
    const filaAcr = (o) => Object.assign({ estado: "activa", torneos: [], condicion: [], comidas: [], acompanantes: 0, foto: "foto/x/f.png", pago_estado: "verificado", nacimiento: "1990-01-01", sexo: "f", hospedaje: false, parqueo: false }, o);
    const filasAcr = [filaAcr({ id: "a1", numero: 40, rol: "jugador", nombre: "Ana", apellidos: "Mora Solís", nombre_fide: "Mora Solis, Ana", torneos: ["A"], titulo: "WCM", pago_estado: "por_revisar" }),
      filaAcr({ id: "a2", numero: 41, rol: "arbitro", nombre: "Rosa", apellidos: "Vega", parqueo: true, placa: "BCD123" })];
    const ac = await ctx.newPage();
    const acErr = []; ac.on("pageerror", (e) => acErr.push(e.message));
    let acreditado = null;
    await ac.addInitScript(() => {
      // Un lector de QR de prueba: «lee» el gafete de la jugadora apenas se abre la cámara.
      window.BarcodeDetector = class { async detect() { return [{ rawValue: "https://ajedrez-integral.com/metropolitano-2026#mi-ronda=" + encodeURIComponent("Mora Solis, Ana") }]; } };
      navigator.mediaDevices.getUserMedia = async () => { const c = document.createElement("canvas"); c.width = 64; c.height = 64; c.getContext("2d").fillRect(0, 0, 64, 64); return c.captureStream(5); };
    });
    await ac.route("**/rest/v1/**", (r) => r.fulfill({ contentType: "application/json", body: "[]" }));
    await ac.route("**/rest/v1/profiles**", (r) => r.fulfill({ contentType: "application/json", body: '{"is_admin":true}' }));
    await ac.route("**/rest/v1/metropolitano_inscripciones**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(filasAcr) }));
    await ac.route("**/storage/v1/object/**", (r) => r.fulfill({ contentType: "image/png", body: fs.readFileSync(path.join(RAIZ, "img", "fca-logo.png")) }));
    await ac.route("**/rest/v1/rpc/metropolitano_acreditar", (r) => { acreditado = JSON.parse(r.request().postData());
      const x = filasAcr.find((f) => f.id === acreditado.p_id); x.acreditado_en = acreditado.p_llego ? "2026-12-26T13:30:00Z" : null;
      r.fulfill({ contentType: "application/json", body: JSON.stringify(x) }); });
    await ac.goto(BASE + "/metropolitano-acreditacion.html");
    await ac.waitForFunction(() => /0 de 2/.test(document.getElementById("cifras").textContent), null, { timeout: 15000 });
    await ac.fill("#buscar", "bcd 123");
    await ac.waitForSelector("#resultados li");
    cierto("se busca por la placa, y la tarjeta dice el parqueo", /MET-0041 · Rosa Vega/.test(await ac.textContent("#resultados")) && /Parqueo para la placa BCD123/.test(await ac.textContent("#resultados")));
    await ac.fill("#buscar", "");
    await ac.click("#escanear");
    await ac.waitForFunction(() => /Encontrado con el QR/.test(document.getElementById("estado").textContent), null, { timeout: 8000 });
    cierto("el QR del gafete encuentra a la jugadora, y avisa que su pago está por revisar", /MET-0040 · WCM Ana Mora Solís/.test(await ac.textContent("#resultados")) && /El pago está por revisar/.test(await ac.textContent("#resultados")));
    await ac.click("#resultados button:has-text('Llegó')");
    await ac.waitForFunction(() => /✓ Llegó:/.test(document.getElementById("resultados").textContent));
    igual("«Llegó» lo anota la base", acreditado, { p_id: "a1", p_llego: true });
    cierto("y cuenta quién llegó y quién falta", /1 de 2/.test(await ac.textContent("#cifras")) && /Árbitros: falta 1 de 1/.test(await ac.textContent("#faltan")));
    igual("sin errores en la acreditación", acErr, []);
    await ac.close();

    /* ----- ¿Quién viene? ----- */
    console.log("   ¿Quién viene?");
    const qv = await ctx.newPage();
    const qvErr = []; qv.on("pageerror", (e) => qvErr.push(e.message));
    await qv.route("**/rest/v1/**", (r) => r.fulfill({ contentType: "application/json", body: "[]" }));
    await qv.route("**/rest/v1/rpc/metropolitano_quien_viene", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({
      A: { total: 3, lista: [{ nombre: "Luis Brenes", titulo: "IM", fed: "CRC", elo: 2400, delegacion: "Club Heredia" }, { nombre: "Ana <b>Mora</b>", titulo: "WCM", fed: "PAN", elo: 1950, delegacion: null }] },
      BLITZ: { total: 1, lista: [] } }) }));
    await qv.goto(BASE + "/metropolitano-2026.html");
    await qv.click("#ficha-quien-viene a");
    await qv.waitForFunction(() => { const d = document.getElementById("quien-viene"); return d && d.open && /Luis Brenes/.test(d.textContent); });
    const tq = await qv.textContent("#quien-viene");
    cierto("«¿Quién viene?» lista a los del A por Elo y cuenta a los que no autorizaron su nombre", /1\. IM Luis Brenes/.test(tq) && /2\. WCM Ana <b>Mora<\/b>/.test(tq) && /y 1 más que no autorizó publicar su nombre/.test(tq) && /Metropolitano B \(0\)/.test(tq), tq);
    await qv.click("#quien-viene button:has-text('Metropolitano Blitz')");
    cierto("y en otro torneo dice cuántos van", /1 jugador inscrito/.test(await qv.textContent("#quien-viene")));
    await qv.keyboard.press("Escape");
    await qv.click("#metro-idioma"); await qv.click("#metro-idiomas [data-idioma='en']");
    cierto("en inglés, la ficha y su ventana", /Who is coming\?/.test(await qv.textContent("#ficha-quien-viene")) && /players registered|player registered/.test(await qv.textContent("#quien-viene")));
    // (de vuelta al español: el idioma se recuerda, y las pruebas que siguen son en español)
    await qv.click("#metro-idioma"); await qv.click("#metro-idiomas [data-idioma='es']");
    igual("sin errores en «¿Quién viene?»", qvErr, []);
    await qv.close();

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
    // «Si vienes de otro país»: recomendaciones, con su aviso y solo enlaces oficiales.
    await i1.pg.click("a[href='#ingreso']");
    const ingreso = await i1.pg.evaluate(() => {
      const d = document.getElementById("ingreso");
      return { abierta: d.open, aviso: /solo recomendaciones, no información oficial/.test(d.textContent) && /responsable/.test(d.textContent),
        enlaces: [...d.querySelectorAll("a[href^='http']")].every((a) => /\.go\.cr\/|visitcostarica\.com\//.test(a.href) && a.target === "_blank"),
        correos: [...d.querySelectorAll("a[href^='mailto:']")].map((a) => a.getAttribute("href")) };
    });
    igual("«Si vienes de otro país» dice que son recomendaciones y enlaza solo a fuentes oficiales", ingreso,
      { abierta: true, aviso: true, enlaces: true, correos: ["mailto:metropolitano@fcacostarica.com", "mailto:visascr@migracion.go.cr"] });
    await i1.pg.keyboard.press("Escape");
    await i1.pg.click("#ficha-hospedaje a");
    await i1.pg.waitForFunction(() => { const d = document.getElementById("hospedaje"); return d && d.open; });
    cierto("la ficha «Hospedaje en el Estadio Nacional» abre sus condiciones: la puerta a las 10:30 p.m., la cancha y la ropa de cama",
      /La puerta se cierra a las 10:30 p\.m\./.test(await i1.pg.textContent("#hospedaje")) && /No se entra a la cancha/.test(await i1.pg.textContent("#hospedaje"))
      && /no hay ropa de cama ni cortinas/.test(await i1.pg.textContent("#hospedaje")) && /GM, IM y WGM/.test(await i1.pg.textContent("#hospedaje")));
    await i1.pg.keyboard.press("Escape");
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
      cierto(boton + ": las condiciones del hospedaje, en " + boton, (lang === "en" ? /The door closes at 10:30 p\.m\./ : /La porte ferme à 22 h 30/).test(await i1.pg.textContent("#hospedaje"))
        && (lang === "en" ? /Lodging at the Estadio Nacional/ : /Hébergement au Stade national/).test(await i1.pg.textContent("#ficha-hospedaje")));
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

    /* ----- El QR del gafete: «Mi ronda y mi mesa», al día con chess-results ----- */
    const pr = await ctx.newPage();
    const errsR = []; pr.on("pageerror", (e) => errsR.push(e.message));
    await pr.route("**/rest/v1/**", (r) => r.fulfill({ contentType: "application/json", body: "null" }));
    const torneoA = { tnr: "1", texto: "Torneo A", modalidad: "clasico", url: "https://s1.chess-results.com/tnr1.aspx?lan=2&art=1", jugadores: [
      { puesto: 4, no: 7, titulo: "WCM", nombre: "Mora Solis, Ana", fed: "CRC", elo: 1950, grupo: "", puntos: "2" },
      { puesto: 1, no: 1, titulo: "GM", nombre: "Gonzalez Perez, Mario", fed: "GUA", elo: 2510, grupo: "", puntos: "2" },
      { puesto: 9, no: 15, titulo: "", nombre: "Mora Solis, Andrea", fed: "CRC", elo: 0, grupo: "", puntos: "1" }],
      pareo: { ronda: 3, mesas: [{ mesa: 1, blancas: { no: 1, titulo: "GM", nombre: "Gonzalez Perez, Mario" }, negras: { no: 7, titulo: "WCM", nombre: "Mora Solis, Ana" }, resultado: "" },
        { mesa: 9, blancas: { no: 15, titulo: "", nombre: "Mora Solis, Andrea" }, negras: null, resultado: "bye" }] } };
    const blitz = { tnr: "2", texto: "Blitz", modalidad: "blitz", url: "https://s1.chess-results.com/tnr2.aspx?lan=2&art=1", jugadores: [torneoA.jugadores[0]], pareo: null };
    const pedidosSala = [];
    await pr.route("**/functions/v1/sala-jugadores", (r) => { const b = JSON.parse(r.request().postData()); pedidosSala.push(b);
      r.fulfill({ contentType: "application/json", body: JSON.stringify(b.modalidad === "blitz" ? { torneos: [blitz], modalidad: "blitz", modalidades: ["clasico", "blitz"] }
        : { torneos: [torneoA], modalidad: "clasico", modalidades: ["clasico", "blitz"] }) }); });
    await pr.goto(BASE + "/metropolitano-2026.html#mi-ronda=" + encodeURIComponent("Mora Solis, Ana"));
    await pr.waitForFunction(() => { const d = document.getElementById("mi-ronda"); return d && d.open && /Mesa 1/.test(d.textContent); }, null, { timeout: 15000 });
    const vista = await pr.textContent("#mi-ronda-resultado");
    cierto("el QR del gafete abre su ronda y su mesa: mesa, color, rival con su Elo y la hora de la ronda",
      /Ronda 3 · Mesa 1/.test(vista) && /Juegas con negras/.test(vista) && /Rival: GM Gonzalez Perez, Mario \(2510\)/.test(vista) && /27 de diciembre a las 9:00/.test(vista)
      && /puesto 4 con 2 puntos/.test(vista), vista);
    cierto("y en el blitz, que todavía no está emparejado, lo dice", /Blitz[\s\S]*Todavía no sale el pareo/.test(vista), vista);
    cierto("la función solo recibe la sala del Metropolitano", pedidosSala.length >= 2 && pedidosSala.every((b) => b.clave === "metropolitano-2026" && Object.keys(b).sort().join() === "clave,modalidad"), pedidosSala);
    cierto("y el nombre sale de la dirección", /#mi-ronda$/.test(pr.url()), pr.url());
    await pr.click("#mi-ronda-cerrar");
    cierto("cerrarla no saca a nadie de la página", /metropolitano-2026\.html/.test(pr.url()) && !(await pr.evaluate(() => document.getElementById("mi-ronda").open)), pr.url());
    await pr.click("#ficha-mi-ronda a");
    await pr.waitForFunction(() => document.getElementById("mi-ronda").open);
    await pr.fill("#mi-ronda-nombre", "mora solís");
    await pr.click("#mi-ronda-buscar");
    await pr.waitForFunction(() => /más de un nombre/.test(document.getElementById("mi-ronda-resultado").textContent));
    await pr.locator("#mi-ronda-resultado button", { hasText: "Andrea" }).first().click();
    await pr.waitForFunction(() => /bye/.test(document.getElementById("mi-ronda-resultado").textContent));
    cierto("con dos nombres parecidos se elige y sale el suyo (aquí, con bye)", /Mora Solis, Andrea/.test(await pr.inputValue("#mi-ronda-nombre")));
    await pr.fill("#mi-ronda-nombre", "Pérez Nadie, Juan");
    await pr.click("#mi-ronda-buscar");
    await pr.waitForFunction(() => /No encontramos/.test(document.getElementById("mi-ronda-resultado").textContent));
    cierto("un nombre que no está se dice", true);
    igual("sin errores en «Mi ronda y mi mesa»", errsR, []);
    await pr.close();
    const sinRes = await ctx.newPage();
    await sinRes.route("**/rest/v1/**", (r) => r.fulfill({ contentType: "application/json", body: "null" }));
    await sinRes.route("**/functions/v1/sala-jugadores", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ torneos: [], modalidad: "clasico", modalidades: [] }) }));
    await sinRes.goto(BASE + "/metropolitano-2026.html#mi-ronda=" + encodeURIComponent("Mora Solis, Ana"));
    await sinRes.waitForFunction(() => /en cuanto el árbitro publique la ronda 1/.test((document.getElementById("mi-ronda-resultado") || {}).textContent || ""), null, { timeout: 15000 });
    cierto("antes de que haya torneos en chess-results, dice cuándo salen", true);
    await sinRes.close();
    // La inscripción: la privacidad y las bases encima, sin perder lo escrito.
    const ins = await ctx.newPage();
    await ins.goto(BASE + "/inscripcion-metropolitano.html?todo=1");
    await ins.click("#acepta-datos-texto a[data-visor]");
    await ins.waitForFunction(() => { const f = document.querySelector("dialog.visor-doc[open] iframe"); return f && /privacidad\.html$/.test(f.src); });
    cierto("en la inscripción, la política de privacidad se abre encima del formulario", /inscripcion-metropolitano\.html/.test(ins.url()));
    igual("y las bases, desde el formulario, sin enlace a otra pestaña", await ins.locator('a[href*="bases-metropolitano-2026.pdf"][target]').count(), 0);
    igual("el QR del gafete de un jugador lleva a su ronda y su mesa, con su nombre de FIDE; el de los demás, a la página del torneo",
      await ins.evaluate(() => [window.MetropolitanoGafete.qrDe({ rol: "jugador", nombre_fide: "Mora Solis, Ana", nombre: "Ana", apellidos: "Mora Solís" }),
        window.MetropolitanoGafete.qrDe({ rol: "jugador", nombre: "Ana", apellidos: "Mora Solís" }), window.MetropolitanoGafete.qrDe({ rol: "entrenador", nombre: "Luis", apellidos: "Mora" })]),
      ["https://ajedrez-integral.com/metropolitano-2026#mi-ronda=Mora%20Solis%2C%20Ana", "https://ajedrez-integral.com/metropolitano-2026#mi-ronda=Mora%20Solis%2C%20Ana", ""]);
    // Y se lee de verdad: el dorso dibujado, leído con un lector de QR (jsQR).
    await ins.addScriptTag({ path: path.join(RAIZ, "node_modules", "jsqr", "dist", "jsQR.js") });
    const leido = await ins.evaluate(async () => {
      const f = document.createElement("canvas"), d = document.createElement("canvas");
      const w = document.createElement("div"); w.style.width = "600px"; w.append(f, d); document.body.prepend(w);
      const x = { rol: "jugador", nombre: "José María", apellidos: "Fernández Solís", torneos: ["B"], sin_fide: true, codigo: "MET-0123" };
      await window.MetropolitanoGafete.dibujar(x, null, f, d);
      const c = d.getContext("2d").getImageData(0, 0, d.width, d.height);
      const q = window.jsQR(c.data, c.width, c.height);
      w.remove();
      return [q && q.data, window.MetropolitanoGafete.qrDe(x)];
    });
    cierto("el QR del dorso se lee con un lector y lleva a su ronda", !!leido[0] && leido[0] === leido[1] && /#mi-ronda=Fernandez%20Solis%2C%20Jose%20Maria$/.test(leido[0]), leido);
    await ins.close();

    // La página de administración.
    console.log("   La lista de inscritos");
    const a = await ctx.newPage();
    void s2;
    const fila = Object.assign({}, enviado, { id: "11111111-1111-1111-1111-111111111111", numero: 12, creado: "2026-11-04T15:00:00Z", clasico: "A", monto_usd: 87, monto_crc: 40020,
      comprobante: "comprobante/abcdef12/sinpe.png", foto: "foto/abcdef12/foto.png", pago_estado: "por_revisar", estado: "activa", club: "<b>Club</b>",
      parqueo: true, placa: "BCD123", parqueo_usd: 10 });
    let revisado = null;
    await a.route("**/rest/v1/**", (r) => r.fulfill({ contentType: "application/json", body: "[]" }));
    await a.route("**/rest/v1/profiles**", (r) => r.fulfill({ contentType: "application/json", body: '{"is_admin":true}' }));
    await a.route("**/rest/v1/metropolitano_inscripciones**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify([fila]) }));
    await a.route("**/rest/v1/rpc/metropolitano_revisar", (r) => { revisado = JSON.parse(r.request().postData()); r.fulfill({ contentType: "application/json", body: JSON.stringify(Object.assign({}, fila, { pago_estado: revisado.p_pago_estado })) }); });
    await a.route("**/storage/v1/object/**", (r) => r.fulfill({ contentType: "image/png", body: fs.readFileSync(path.join(RAIZ, "img", "fca-logo.png")) }));
    // (después de la ruta general de rest/v1: en Playwright manda la última que se registró)
    let reenvio = null;
    await a.route("**/functions/v1/metropolitano-correo", (rt) => { reenvio = JSON.parse(rt.request().postData());
      rt.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, para: ["ana@ejemplo.com"] }) }); });
    let parqueoGuardado = null;
    await a.route("**/rest/v1/rpc/metropolitano_parqueo_estado", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ precio_usd: 10, cupos: 1, activo: true, usados: 1 }) }));
    await a.route("**/rest/v1/rpc/metropolitano_parqueo_configurar", (r) => { parqueoGuardado = JSON.parse(r.request().postData());
      r.fulfill({ contentType: "application/json", body: JSON.stringify({ precio_usd: parqueoGuardado.p_precio, cupos: parqueoGuardado.p_cupos, activo: parqueoGuardado.p_activo, usados: 1 }) }); });
    let codigosLista = [{ codigo: "MET-AAAA-BBBB", porcentaje: 100, nota: "Rifa de diciembre", creado: "2026-11-04T15:00:00Z", anulado: false, usado_por: fila.id, usado_en: "2026-11-04T16:00:00Z" }];
    let creados = null;
    await a.route("**/rest/v1/metropolitano_codigos**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(codigosLista) }));
    await a.route("**/rest/v1/rpc/metropolitano_codigos_crear", (r) => { creados = JSON.parse(r.request().postData());
      const nuevos = [{ codigo: "MET-CCCC-DDDD", porcentaje: creados.p_porcentaje, nota: creados.p_nota, creado: "2026-11-04T17:00:00Z", anulado: false, usado_por: null, usado_en: null }];
      codigosLista = nuevos.concat(codigosLista);
      r.fulfill({ contentType: "application/json", body: JSON.stringify(nuevos) }); });
    let driveEnviado = false;
    await a.route("**/functions/v1/metropolitano-drive", (r) => { const b = JSON.parse(r.request().postData());
      if (b.accion === "enviar") driveEnviado = true;
      r.fulfill({ contentType: "application/json", body: JSON.stringify(b.accion === "enviar" ? { ok: true, enviados: 2, errores: 0, quedan: 0 }
        : { conectado: true, carpeta: "Inscripciones Metropolitano 2026", pendientes: driveEnviado ? 0 : 2, con_error: 0 }) }); });
    let camasGuardadas = null;
    await a.route("**/rest/v1/rpc/metropolitano_hospedaje_estado", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ camas: 40, noches: [{ noche: "2026-12-25", ocupadas: 12 }, { noche: "2026-12-26", ocupadas: 40 }] }) }));
    await a.route("**/rest/v1/rpc/metropolitano_hospedaje_configurar", (r) => { camasGuardadas = JSON.parse(r.request().postData());
      r.fulfill({ contentType: "application/json", body: JSON.stringify({ camas: camasGuardadas.p_camas, noches: [{ noche: "2026-12-26", ocupadas: 40 }] }) }); });
    await a.route("**/rest/v1/rpc/metropolitano_logistica", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({
      noches: [{ noche: "2026-12-26", inscritos: 30, acompanantes: 8, titulados: 2 }], comidas: [{ dia: "2026-12-27", desayuno: 25, almuerzo: 31, cena: 28 }],
      dietas: [{ codigo: "MET-0012", quien: "Ana Mora", delegacion: null, dieta: "Sin <b>gluten</b>", comidas: ["cena"], desde: "2026-12-26", hasta: "2026-12-30" }],
      accesibilidad: [], traslados: [{ codigo: "MET-0012", quien: "Ana Mora", llegada: "2026-12-24", salida: "2026-12-31", vuelo: "AV 123", telefono: "+506 8888" }], llegadas: [{ dia: "2026-12-24", personas: 3 }] }) }));
    // Los menús (metropolitano_menu_admin): una cocina, dos platos, lo pagado y lo «tal vez».
    const COC = "c1111111-1111-4111-8111-111111111111", P1 = "b1111111-1111-4111-8111-111111111111";
    let menuAdmin = {
      cocinas: [{ id: COC, nombre: "Soda <i>Tala</i>", detalle: "Frente al estadio", orden: 0, activo: true, platos: 1 }],
      platos: [{ id: P1, comida: "desayuno", nombre: "Gallo pinto", descripcion: "Con huevo", cocina: COC, precio_usd: 6.5, imagen: null, orden: 0, activo: true, personas: 4 },
        { id: "b2222222-2222-4222-8222-222222222222", comida: "cena", nombre: "Sopa negra", descripcion: null, cocina: null, precio_usd: 7, imagen: null, orden: 0, activo: false, personas: 0 }],
      por_dia: [{ dia: "2026-12-27", id: P1, platos: 4 }],
      tal_vez: [{ dia: "2026-12-27", comida: "desayuno", personas: 3 }, { dia: "2026-12-28", comida: "almuerzo", personas: 2 }] };
    const menuGuardado = [];
    await a.route("**/rest/v1/rpc/metropolitano_menu_admin", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(menuAdmin) }));
    await a.route("**/rest/v1/rpc/metropolitano_menu_guardar", (r) => { menuGuardado.push(JSON.parse(r.request().postData()).p); r.fulfill({ contentType: "application/json", body: JSON.stringify(menuAdmin) }); });
    await a.route("**/rest/v1/rpc/metropolitano_cocina_guardar", (r) => { menuGuardado.push(JSON.parse(r.request().postData()).p); r.fulfill({ contentType: "application/json", body: JSON.stringify(menuAdmin) }); });
    await a.goto(BASE + "/metropolitano-inscritos.html");
    await a.waitForSelector("#filas tr", { timeout: 15000 });
    await a.waitForFunction(() => /se ofrece/.test(document.getElementById("menu-estado").textContent));
    const pl = await a.textContent("#platos");
    cierto("los platos salen por comida, con quién los prepara, el precio por día y cuántos lo eligieron (y el quitado lo dice)",
      /Gallo pinto/.test(pl) && /Lo prepara: Soda <i>Tala<\/i>/.test(pl) && /\$6\.50 por día/.test(pl) && /Lo eligieron 4 personas/.test(pl) && /Sopa negra \(ya no se ofrece\)/.test(pl) && /Lo prepara: La organización/.test(pl), pl);
    cierto("el nombre de la cocina se escribe como texto, no como HTML", (await a.locator("#cocinas").innerHTML()).includes("Soda &lt;i&gt;Tala&lt;/i&gt;"));
    igual("se elige quién prepara cada plato (o la organización)", await a.locator("#plato-cocina option").evaluateAll((os) => os.map((o) => o.textContent)), ["La organización", "Soda <i>Tala</i>"]);
    const est = async () => a.locator("#estimacion tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent).slice(1)));
    igual("la estimación: por día y comida, lo pagado de cada cocina, los que «aún no saben» y los platos de más (50 %: 3 → 2)", await est(),
      [["Desayuno", "4", "4 × Soda <i>Tala</i>: Gallo pinto", "3", "2", "6"], ["Almuerzo", "0", "—", "2", "1", "1"]]);
    await a.fill("#estimacion-pct", "100");
    igual("y con otro porcentaje, otros platos de más", (await est()).map((f) => f.slice(4)), [["3", "7"], ["2", "2"]]);
    await a.fill("#plato-nombre", "Casado"); await a.selectOption("#plato-comida", "almuerzo"); await a.selectOption("#plato-cocina", COC);
    await a.fill("#plato-precio", "9"); await a.fill("#plato-desc", "Arroz y frijoles");
    await a.click("#plato-guardar");
    await a.waitForFunction(() => /Listo/.test(document.getElementById("plato-msg").textContent));
    igual("agregar un plato manda la comida, el nombre, quién lo prepara y el precio", menuGuardado.pop(),
      { id: null, comida: "almuerzo", nombre: "Casado", descripcion: "Arroz y frijoles", cocina: COC, precio_usd: 9, orden: 0, activo: true, imagen: null });
    await a.fill("#cocina-nombre", "Doña Rosa"); await a.click("#cocina-guardar");
    await a.waitForFunction(() => /Listo/.test(document.getElementById("cocina-msg").textContent));
    igual("y agregar quién prepara, su nombre", menuGuardado.pop(), { id: null, nombre: "Doña Rosa", detalle: "", orden: 0 });
    await a.waitForFunction(() => /40 camas por noche/.test(document.getElementById("hosp-estado").textContent));
    cierto("el hospedaje dice las camas por noche y que hay noches llenas", /Hay noches llenas/.test(await a.textContent("#hosp-estado")));
    await a.fill("#hosp-camas", ""); await a.click("#hosp-guardar");
    await a.waitForFunction(() => /Sin tope/.test(document.getElementById("hosp-estado").textContent));
    igual("vacío es sin tope de camas", camasGuardadas, { p_camas: null });
    await a.waitForFunction(() => /Quién duerme cada noche/.test(document.getElementById("logistica").textContent));
    const lg = await a.textContent("#logistica");
    cierto("la logística cuenta las noches, las comidas, las dietas y los traslados", /30.*8.*2.*40/.test(lg) && /25.*31.*28/.test(lg) && /Sin <b>gluten<\/b>/.test(lg) && /AV 123/.test(lg), lg.slice(0, 400));
    cierto("y la dieta se escribe como texto, no como HTML", (await a.locator("#logistica").innerHTML()).includes("Sin &lt;b&gt;gluten&lt;/b&gt;"));
    cierto("y se filtra por rol árbitro", (await a.locator("#f-rol option").evaluateAll((os) => os.map((o) => o.value))).includes("arbitro"));
    cierto("el club se escribe como texto, no como HTML", (await a.locator("#filas").innerHTML()).includes("&lt;b&gt;Club&lt;/b&gt;"));
    await a.waitForFunction(() => /Faltan 2 inscripciones/.test(document.getElementById("drive-estado").textContent));
    cierto("el Drive dice si está conectado y cuántas faltan", /Conectado a «Inscripciones Metropolitano 2026»/.test(await a.textContent("#drive-estado")));
    await a.click("#drive-enviar");
    await a.waitForFunction(() => /2 inscripciones mandadas/.test(document.getElementById("drive-msg").textContent));
    // El estado se vuelve a leer después del mensaje: esperarlo, no mirarlo de una.
    await a.waitForFunction(() => /No falta ninguna/.test(document.getElementById("drive-estado").textContent), null, { timeout: 5000 }).catch(() => {});
    cierto("«Mandar al Drive las que faltan» las manda y lo dice", driveEnviado && /No falta ninguna/.test(await a.textContent("#drive-estado")));
    await a.waitForSelector("#codigos-filas tr");
    await a.locator("#filas details summary").first().click();
    cierto("cada inscripción dice cómo va su correo de confirmación", /Correo de confirmación: Por mandar/.test(await a.locator("#filas details").first().textContent()));
    await a.locator("#filas details button", { hasText: "Reenviar el correo de confirmación" }).first().click();
    await a.getByRole("button", { name: "Reenviar el correo", exact: true }).click();
    await a.waitForFunction(() => /se reenvió a ana@ejemplo\.com/.test(document.body.textContent));
    igual("«Reenviar el correo de confirmación» le pide a la función esa inscripción", reenvio, { accion: "reenviar", id: "11111111-1111-1111-1111-111111111111" });
    await a.waitForFunction(() => /Lleno/.test(document.getElementById("parq-estado").textContent));
    cierto("el parqueo dice cuántos espacios se tomaron y que ya está lleno", /Lleno: 1 de 1 espacios tomados/.test(await a.textContent("#parq-estado")), await a.textContent("#parq-estado"));
    await a.fill("#parq-precio", "12.5"); await a.fill("#parq-cupos", "40");
    await a.click("#parq-guardar");
    await a.waitForFunction(() => /quedan 39/.test(document.getElementById("parq-estado").textContent));
    igual("guardar el parqueo manda el precio, los espacios y si se ofrece", parqueoGuardado, { p_precio: 12.5, p_cupos: 40, p_activo: true });
    const [dpl] = await Promise.all([a.waitForEvent("download"), a.click("#parq-placas")]);
    const placasCsv = fs.readFileSync(await dpl.path(), "utf8");
    cierto("la lista de placas para la entrada trae la placa con su inscripción", /^\uFEFF?Placa;Código;Apellidos/.test(placasCsv) && /BCD123;MET-0012;/.test(placasCsv), placasCsv.slice(0, 200));
    cierto("los códigos dicen quién usó cada uno", /Usado por MET-0012 — Ana Mora Solis/.test(await a.textContent("#codigos-filas")), await a.textContent("#codigos-filas"));
    await a.selectOption("#cod-pct", "20");
    await a.fill("#cod-cantidad", "3");
    await a.fill("#cod-nota", "Torneo de navidad");
    await a.click("#cod-generar");
    await a.waitForFunction(() => /MET-CCCC-DDDD/.test(document.getElementById("codigos-filas").textContent));
    igual("generar códigos llama a la base con el porcentaje, cuántos y la nota", creados, { p_porcentaje: 20, p_cantidad: 3, p_nota: "Torneo de navidad" });
    cierto("y el nuevo sale libre, con su botón de anular", /Libre: sin usar/.test(await a.textContent("#codigos-filas")) && (await a.locator("#codigos-filas button:has-text('Anular')").count()) === 1);
    await a.selectOption("#filas select", "verificado");
    await a.click("#filas button:has-text('Guardar')");
    await a.waitForFunction(() => /Verificado/.test(document.querySelector("#filas td:last-child span").textContent));
    igual("guardar el pago llama a metropolitano_revisar", revisado, { p_id: fila.id, p_pago_estado: "verificado", p_estado: "activa", p_nota: "" });
    // Swiss-Manager: un Excel con una hoja por torneo (un .xlsx sin comprimir: sus XML se leen tal cual).
    const [xl] = await Promise.all([a.waitForEvent("download"), a.click("#bajar-chess-results")]);
    const xlsx = fs.readFileSync(await xl.path()).toString("latin1");
    cierto("el Excel para Swiss-Manager trae una hoja por torneo y a la jugadora en el A con su ID FIDE y su Elo", /sheet name="Metropolitano A"/.test(xlsx) && /sheet name="Metropolitano Blitz"/.test(xlsx)
      && /Mora Solis, Ana/.test(xlsx) && /<v>6400000<\/v>/.test(xlsx) && /<v>1950<\/v>/.test(xlsx));
    const [csv] = await Promise.all([a.waitForEvent("download"), a.click("#bajar-gafetes")]);
    const texto = fs.readFileSync(await csv.path(), "utf8");
    cierto("la lista para gafetes trae las columnas de gafetes.html", texto.startsWith("﻿Código;Apellidos;Nombre;FIDE ID;Federación;Elo") && /MET-0012;Mora Solis;Ana;6400000;CRC;1950/.test(texto), texto.slice(0, 200));
  } finally {
    await nav.close();
  }
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron.` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
