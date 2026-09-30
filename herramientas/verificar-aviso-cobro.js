/* El correo de cobro que llega a la casa, con los textos que pone quien coordina.

   Lo arma supabase/functions/cobros-recordatorios/aviso-html.ts. Quien coordina
   puede cambiar el asunto y el mensaje de cada aviso y el «Cómo pagar» desde
   la ficha «Morosidad» de cobros.html. Lo que comprueba:

   - sin textos guardados, sale el de fábrica, con el nombre en negrita;
   - un texto guardado reemplaza al de fábrica, con {alumno} y {academia}
     puestos, y los saltos de línea como <br>;
   - lo que escribe una persona es texto: el HTML va escapado, y un nombre
     con «$&» no se toma como patrón de reemplazo;
   - un texto vacío o en blanco es «el de fábrica», no un párrafo vacío;
   - el asunto sale en UNA línea;
   - lo que no se deja editar sigue ahí: el total y a dónde mandar el
     comprobante.

       node herramientas/verificar-aviso-cobro.js                            */
const path = require("path");
const { spawnSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");

let fallos = 0;
function cierto(nombre, valor, detalle) {
  if (valor) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
  `import { avisoHtml, asuntoDe } from ${JSON.stringify(path.join(RAIZ, "supabase/functions/cobros-recordatorios/aviso-html.ts"))};
   const cobros = [{ consecutivo: "AI-1", concepto: "Mensualidad", monto: 22500, pagado: 0, saldo: 22500,
                     moneda: "CRC", vence: "2026-10-05", situacion: "pendiente", dias_atraso: 0 }];
   const contacto = { texto: "+506 8309-2291", enlace: "https://wa.me/50683092291" };
   const base = { alumno: "Ana Rojas", destinatario: "Rosa Mena", cobros, sitio: "https://ajedrez-integral.com",
                  contacto, cabecera: (t) => "<tr><td>" + t + "</td></tr>" };
   const out = {
     fabrica: avisoHtml({ ...base, tipo: "proximo" }),
     propio: avisoHtml({ ...base, tipo: "moroso", firma: "ADAPZ",
       textos: { mensaje: { moroso: "Hola <b>familia</b>\\n{alumno} debe en {academia}." }, comoPagar: "SINPE Móvil al 8888-8888" } }),
     blanco: avisoHtml({ ...base, tipo: "vencido", textos: { mensaje: { vencido: "   " }, comoPagar: "" } }),
     raro: avisoHtml({ ...base, alumno: "Ana $& Rojas", tipo: "moroso", textos: { mensaje: { moroso: "Pago de {alumno}" } } }),
     asuntoFabrica: asuntoDe("vencido", "Ana Rojas", "ADAPZ"),
     asuntoPropio: asuntoDe("vencido", "Ana $& Rojas", "ADAPZ", { asunto: { vencido: "Pago de {alumno}\\r\\n({academia})" } }),
     asuntoBlanco: asuntoDe("moroso", "Ana Rojas", "ADAPZ", { asunto: { moroso: " " } }),
   };
   process.stdout.write(JSON.stringify(out));`], { encoding: "utf8" });
if (r.status !== 0) { console.log(r.stderr); process.exit(1); }
const o = JSON.parse(r.stdout);
const entrada = (h) => (h.match(/line-height:1\.6">([\s\S]*?)<\/p>/) || [])[1] || "";
const comoPagar = (h) => (h.match(/<strong>Cómo pagar<\/strong><br>([\s\S]*?)<\/p>/) || [])[1] || "";

console.log("\nSin textos guardados");
cierto("sale el mensaje de fábrica, con el nombre en negrita",
  entrada(o.fabrica).startsWith("Te escribimos para recordarte el pago de <strong>Ana Rojas</strong>"), entrada(o.fabrica));
cierto("y el «Cómo pagar» de fábrica", /Por SINPE Móvil o transferencia bancaria\. Cuando lo hagas/.test(comoPagar(o.fabrica)), comoPagar(o.fabrica));
cierto("el asunto de fábrica lleva el alumno y la academia", o.asuntoFabrica === "Quedó pendiente el pago de Ana Rojas — ADAPZ", o.asuntoFabrica);

console.log("\nCon textos propios");
cierto("el mensaje propio reemplaza al de fábrica, con {alumno}, {academia} y el salto de línea",
  entrada(o.propio) === "Hola &lt;b&gt;familia&lt;/b&gt;<br><strong>Ana Rojas</strong> debe en ADAPZ.", entrada(o.propio));
cierto("el HTML que escribe una persona no entra como HTML", !o.propio.includes("<b>familia"));
cierto("el «Cómo pagar» propio, y después, siempre, a dónde mandar el comprobante",
  /SINPE Móvil al 8888-8888 Cuando lo hagas,[\s\S]*wa\.me\/50683092291/.test(comoPagar(o.propio)), comoPagar(o.propio));
cierto("el total sigue ahí", /Total pendiente/.test(o.propio) && /22/.test(o.propio));
cierto("un nombre con «$&» no se toma como patrón", entrada(o.raro) === "Pago de <strong>Ana $&amp; Rojas</strong>", entrada(o.raro));
cierto("el asunto propio, en una sola línea", o.asuntoPropio === "Pago de Ana $& Rojas (ADAPZ)", JSON.stringify(o.asuntoPropio));

console.log("\nEn blanco es «el de fábrica»");
cierto("un mensaje en blanco sale con el de fábrica", entrada(o.blanco).startsWith("El pago de <strong>Ana Rojas</strong> pasó su fecha"), entrada(o.blanco));
cierto("un «Cómo pagar» vacío también", /Por SINPE Móvil o transferencia bancaria\./.test(comoPagar(o.blanco)), comoPagar(o.blanco));
cierto("un asunto en blanco también", o.asuntoBlanco === "Sobre el pago pendiente de Ana Rojas — ADAPZ", o.asuntoBlanco);

console.log(fallos ? `\n${fallos} comprobación(es) fallaron.` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
