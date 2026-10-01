/* El recibo de un pago, tal como lo arma
   supabase/functions/cobros-recordatorios/recibo-html.ts: el mismo HTML que se
   ve en cobros.html, se imprime y le llega a la familia. Lo que comprueba:

   - el número, la fecha, quién pagó, la forma de pago y cada línea;
   - el total es la suma de las líneas, en la moneda del recibo;
   - lo que escribe una persona (el nombre, el concepto, la nota, la
     referencia) va escapado: un nombre con etiquetas se ve literal;
   - un recibo anulado lo dice arriba CON PALABRAS (impreso no hay colores);
   - dice que es un recibo interno y no una factura electrónica;
   - el asunto sale en una sola línea, con el número.

       node herramientas/verificar-recibo.js                                  */
const path = require("path");
const { spawnSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");

let fallos = 0;
function cierto(nombre, valor, detalle) {
  if (valor) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
  `import { reciboHtml, asuntoRecibo } from ${JSON.stringify(path.join(RAIZ, "supabase/functions/cobros-recordatorios/recibo-html.ts"))};
   const base = { numero: "R-ADAPZ-2026-0007", fecha: "2026-10-01", alumno: "Ana Rojas", metodo: "sinpe",
                  referencia: "BN-77", nota: null, moneda: "CRC", firma: "ADAPZ", sitio: "https://ajedrez-integral.com",
                  cabecera: (t) => "<tr><td id='cab'>" + t + "</td></tr>",
                  lineas: [{ concepto: "Mensualidad · octubre 2026", consecutivo: "AI-2026-000010", monto: 22500 },
                           { concepto: "Mensualidad · noviembre 2026", consecutivo: "AI-2026-000011", monto: 22500 }] };
   const out = {
     normal: reciboHtml({ ...base, destinatario: "Rosa Mena" }),
     raro: reciboHtml({ ...base, alumno: "<b>Ana</b>", nota: "<script>x</script>", referencia: "\\"><img>",
                        lineas: [{ concepto: "<i>Torneo</i>", monto: 5000 }] }),
     anulado: reciboHtml({ ...base, anulado: true, anuladoMotivo: "Pago duplicado" }),
     usd: reciboHtml({ ...base, moneda: "USD", lineas: [{ concepto: "Clase privada", monto: 40 }] }),
     asunto: asuntoRecibo("R-ADAPZ-2026-0007", "Ana\\r\\nRojas", "ADAPZ"),
   };
   process.stdout.write(JSON.stringify(out));`], { encoding: "utf8" });
if (r.status !== 0) { console.log(r.stderr); process.exit(1); }
const o = JSON.parse(r.stdout);
const sinSeparadores = (t) => String(t).replace(/(\d)[.    ](?=\d)/g, "$1");
const texto = (h) => sinSeparadores(h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));

console.log("\nLo que dice");
const n = texto(o.normal);
cierto("el número, la fecha y quién pagó", /Recibo N\.º R-ADAPZ-2026-0007/.test(n) && /1 de octubre de 2026/.test(n) && /Recibimos de Ana Rojas/.test(n), n.slice(0, 300));
cierto("la forma de pago con su referencia", /SINPE Móvil · ref\. BN-77/.test(n));
cierto("cada línea con su cobro", /Mensualidad · octubre 2026 Cobro AI-2026-000010/.test(n) && /noviembre 2026/.test(n));
cierto("el total es la suma de las líneas", /Total recibido ₡45000/.test(n), n);
cierto("en dólares, en dólares", /Total recibido (\$|USD )40/.test(texto(o.usd)), texto(o.usd));
cierto("saluda a quien lo recibe", /Hola, Rosa:/.test(n));
cierto("dice que no es una factura electrónica", /Recibo interno de ADAPZ\. No es una factura electrónica\./.test(n));
cierto("la cabecera es la de la academia, con el título", o.normal.includes("<td id='cab'>Recibo de pago</td>"));
cierto("uno sin anular no dice ANULADO", !/ANULADO/.test(n));

console.log("\nTexto ajeno");
cierto("un nombre con etiquetas se ve literal", o.raro.includes("&lt;b&gt;Ana&lt;/b&gt;") && !o.raro.includes("<b>Ana</b>"));
cierto("la nota y el concepto también", o.raro.includes("&lt;script&gt;") && o.raro.includes("&lt;i&gt;Torneo&lt;/i&gt;") && !o.raro.includes("<script>"));
cierto("y la referencia no rompe el atributo ni mete una imagen", !o.raro.includes("<img>") && o.raro.includes("&quot;&gt;&lt;img&gt;"));

console.log("\nAnulado");
cierto("lo dice con palabras, con el motivo", /RECIBO ANULADO: Pago duplicado\. Este recibo no vale como comprobante de pago\./.test(texto(o.anulado)), texto(o.anulado).slice(0, 400));

console.log("\nAsunto");
cierto("una sola línea, con el número y la academia", o.asunto === "Recibo R-ADAPZ-2026-0007 — pago de Ana Rojas — ADAPZ", o.asunto);

console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
