/* La cabecera de los correos que llegan a la casa (informe, cobro, examen).

   La arma supabase/functions/_compartido/marca-correo.ts, UNA vez para los
   tres. Lo que comprueba:

   - sin academia (dos o ninguna), el logo de Ajedrez Integral con la dirección
     completa del sitio, y la etiqueta en ámbar;
   - una academia con logo lleva el suyo, y el de Ajedrez Integral no;
   - una academia SIN logo lleva solo su nombre: el de Ajedrez Integral no se
     le presta;
   - un logo o un color que no sean lo que dicen no entran al HTML;
   - los dos correos de bienvenida (al alumno y a la casa) llevan esa misma
     franja, con el logo de Ajedrez Integral, una sola vez.

       node herramientas/verificar-marca-correo.js                           */
const path = require("path");
const { spawnSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");
const LOGO_AI = "https://ajedrez-integral.com/img/logo-marca.png";

let fallos = 0;
function cierto(nombre, valor, detalle) {
  if (valor) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

const casos = {
  sin: null,
  conLogo: { nombre: "ADAPZ", color: "#1c3870", logoUrl: "https://x.supabase.co/storage/v1/object/public/academia-marca/ac1/l.webp" },
  sinLogo: { nombre: "Academia San José", color: null, logoUrl: null },
  malo: { nombre: "<b>Santa</b>", color: "red;background:url(x)", logoUrl: 'javascript:alert(1)" onerror="x' },
};
const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
  `import { cabeceraCorreo } from ${JSON.stringify(path.join(RAIZ, "supabase/functions/_compartido/marca-correo.ts"))};
   const casos = JSON.parse(process.argv[1]);
   const out = {};
   for (const k in casos) out[k] = cabeceraCorreo(casos[k], "Informe semanal");
   process.stdout.write(JSON.stringify(out));`, JSON.stringify(casos)], { encoding: "utf8" });
if (r.status !== 0) { console.log(r.stderr); process.exit(1); }
const html = JSON.parse(r.stdout);
const imgs = (h) => [...h.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1]);

console.log("\nSin academia");
cierto("lleva el logo de Ajedrez Integral, con la dirección completa", JSON.stringify(imgs(html.sin)) === JSON.stringify([LOGO_AI]), JSON.stringify(imgs(html.sin)));
cierto("y la etiqueta en ámbar", /color:#f0b429[^>]*>.*Ajedrez Integral/.test(html.sin), html.sin.slice(0, 300));

console.log("\nCon academia");
cierto("con logo: el suyo y solo el suyo", JSON.stringify(imgs(html.conLogo)) === JSON.stringify([casos.conLogo.logoUrl]), JSON.stringify(imgs(html.conLogo)));
cierto("sin logo: ningún logo, tampoco el de Ajedrez Integral", imgs(html.sinLogo).length === 0, JSON.stringify(imgs(html.sinLogo)));
cierto("sin logo: su nombre", html.sinLogo.includes("Academia San José"));

console.log("\nLo que no es lo que dice no entra");
cierto("un logo que no es https no entra", imgs(html.malo).length === 0 && !html.malo.includes("javascript:"), JSON.stringify(imgs(html.malo)));
cierto("un color que no es #rrggbb no entra", !html.malo.includes("url(x)"), html.malo.slice(0, 200));
cierto("el nombre va escapado", html.malo.includes("&lt;b&gt;Santa&lt;/b&gt;") && !html.malo.includes("<b>Santa"), html.malo.slice(0, 400));

console.log("\nEl correo de bienvenida");
const b = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
  `import { cuerpoBienvenida, cuerpoBienvenidaCasa } from ${JSON.stringify(path.join(RAIZ, "supabase/functions/_compartido/invitacion-email.ts"))};
   process.stdout.write(JSON.stringify({
     alumno: cuerpoBienvenida("ana@example.com", "https://x/e", "Ana Rojas"),
     casa: cuerpoBienvenidaCasa("ana.rojas@alumno.ajedrez-integral.com", "https://x/e", "Ana Rojas", "Luis"),
   }));`], { encoding: "utf8" });
if (b.status !== 0) { console.log(b.stderr); process.exit(1); }
const bien = JSON.parse(b.stdout);
for (const [quien, h] of Object.entries(bien)) {
  cierto(`${quien === "casa" ? "el de la casa" : "el del alumno"} lleva la franja con el logo, una vez`,
    JSON.stringify(imgs(h)) === JSON.stringify([LOGO_AI]) && h.indexOf(LOGO_AI) < h.indexOf("<h1"), JSON.stringify(imgs(h)));
}

console.log(fallos ? `\n${fallos} fallo(s)` : "\nLa cabecera de los correos lleva el logo que corresponde.");
process.exit(fallos ? 1 : 0);
