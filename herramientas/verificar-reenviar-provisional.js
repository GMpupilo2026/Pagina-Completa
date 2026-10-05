/* «Reenviar acceso» a una cuenta nueva manda otra contraseña provisional
   — supabase/functions/reenviar-acceso/index.ts

   Toda invitación de alta lleva el usuario y una contraseña provisional (ver
   «La contraseña provisional»). Reenviar el acceso a quien todavía no había
   entrado mandaba en cambio un enlace, con los problemas que llevaron a
   quitarlo de la invitación. Lo que se comprueba:

   - la regla de «cuenta nueva» (`sinContrasenaPropia()`): la marcada como
     provisional y la invitada con enlace que nunca entró, sí; la que ya entró
     con su contraseña y la que le puso quien da clase, no;
   - el correo de un reenvío lleva la hora en el asunto y avisa que la
     contraseña de antes ya no sirve; el de alta no cambia;
   - la función pone la contraseña confirmada y marcada, SOLO después de saber
     que hay con qué mandar el correo, manda la bienvenida y no el enlace, y
     dice cuál de los dos mandó (`modo`);
   - las tres pantallas dicen lo que de verdad salió;
   - la función lleva la bienvenida al desplegarse (funciones-armar.js).

       node herramientas/verificar-reenviar-provisional.js                  */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");
const COMPARTIDO = path.join(RAIZ, "supabase/functions/_compartido");

let fallos = 0;
function cierto(nombre, valor, detalle) {
  if (valor) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle !== undefined ? "\n      " + detalle : "")); fallos += 1; }
}

const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
  `import { sinContrasenaPropia } from ${JSON.stringify(path.join(COMPARTIDO, "usuario-alumno.ts"))};
   import { cuerpoBienvenida, cuerpoBienvenidaCasa, horaDelEnvio } from ${JSON.stringify(path.join(COMPARTIDO, "invitacion-email.ts"))};
   const ayer = "2026-10-04T15:00:00Z";
   console.log(JSON.stringify({
     marcada: sinContrasenaPropia({ user_metadata: { contrasena_provisional: true }, last_sign_in_at: ayer }),
     invitadaSinEntrar: sinContrasenaPropia({ user_metadata: {}, invited_at: ayer, last_sign_in_at: null }),
     invitadaQueEntro: sinContrasenaPropia({ user_metadata: {}, invited_at: ayer, last_sign_in_at: ayer }),
     puestaPorProfe: sinContrasenaPropia({ user_metadata: {}, invited_at: null, last_sign_in_at: null }),
     yaLaCambio: sinContrasenaPropia({ user_metadata: { contrasena_provisional: false }, last_sign_in_at: ayer }),
     sinMetadata: sinContrasenaPropia({ invited_at: ayer }),
     propioAlta: cuerpoBienvenida("ana@ejemplo.cr", "torre-alfil-4821", "Ana Mora"),
     propioReenvio: cuerpoBienvenida("ana@ejemplo.cr", "torre-alfil-4821", "Ana Mora", true),
     casaReenvio: cuerpoBienvenidaCasa("ana.mora@alumno.ajedrez-integral.com", "dama-reloj-0042", "Ana Mora", null, true),
     hora: horaDelEnvio(new Date("2026-10-05T21:05:00Z")),
   }));`], { encoding: "utf8" });
if (r.status !== 0) {
  console.log("  ✗ no se pudieron cargar los módulos\n" + r.stderr);
  process.exit(1);
}
const o = JSON.parse(r.stdout);

console.log("¿A quién se le manda una contraseña provisional nueva?");
cierto("a la que sigue marcada como provisional", o.marcada === true);
cierto("a la invitada con enlace que nunca entró", o.invitadaSinEntrar === true);
cierto("a la invitada sin marca, aunque no traiga user_metadata", o.sinMetadata === true);
cierto("NO a la invitada que ya entró", o.invitadaQueEntro === false);
cierto("NO a la que le puso quien da clase, aunque no haya entrado", o.puestaPorProfe === false);
cierto("NO a la que ya cambió la provisional por la suya", o.yaLaCambio === false);

console.log("\nEl correo");
cierto("el reenvío avisa que la contraseña de antes ya no sirve",
  /Esta contraseña es nueva/.test(o.propioReenvio) && /ya no sirve/.test(o.propioReenvio));
cierto("también el que va a la casa", /Esta contraseña es nueva/.test(o.casaReenvio));
cierto("los dos traen la contraseña", /torre-alfil-4821/.test(o.propioReenvio) && /dama-reloj-0042/.test(o.casaReenvio));
cierto("el de alta no cambia: sin ese aviso", !/Esta contraseña es nueva/.test(o.propioAlta));
cierto("la hora del asunto va en hora de Costa Rica", /enviado a las 3:05/.test(o.hora), o.hora);
const inv = fs.readFileSync(path.join(COMPARTIDO, "invitacion-email.ts"), "utf8");
cierto("con reenvio, el asunto lleva la hora", /subject: reenvio \? `\$\{asunto\} \(\$\{horaDelEnvio\(\)\}\)` : asunto/.test(inv));

console.log("\nLa función");
const fn = fs.readFileSync(path.join(RAIZ, "supabase/functions/reenviar-acceso/index.ts"), "utf8");
const iClave = fn.indexOf("updateUserById(");
const iApiKey = fn.indexOf('if (!apiKey) return json(');
cierto("pregunta la regla compartida", /if \(sinContrasenaPropia\(cuenta\.user\)\) \{/.test(fn));
cierto("cambia la contraseña solo si hay con qué mandar el correo", iApiKey > 0 && iClave > iApiKey);
cierto("la deja confirmada y marcada como provisional",
  /updateUserById\(alumnoId, \{[\s\S]{0,120}password: clave,[\s\S]{0,60}email_confirm: true,[\s\S]{0,60}contrasena_provisional: true/.test(fn));
cierto("manda la bienvenida, marcada como reenvío", /mandarBienvenida\([\s\S]{0,200}\{ reenvio: true \}/.test(fn));
cierto("a una cuenta que ya entró le sigue llegando el enlace", /modo = "enlace";[\s\S]{0,200}generateLink\(\{\s*type: "recovery"/.test(fn));
cierto("dice qué mandó", /return json\(\{ ok: true, correo_destino: destino, usuario: alumno\.email, modo \}\)/.test(fn));
const armar = fs.readFileSync(path.join(RAIZ, "herramientas/funciones-armar.js"), "utf8");
cierto("se despliega con la bienvenida (funciones-armar.js)",
  /"reenviar-acceso": \[[^\]]*"invitacion-email\.ts"[^\]]*"marca-correo\.ts"/.test(armar));

console.log("\nLas pantallas dicen lo que salió");
for (const pagina of ["admin", "coordinacion", "informes"]) {
  const js = fs.readFileSync(path.join(RAIZ, "js", pagina + ".js"), "utf8");
  cierto(pagina + ".js distingue la contraseña provisional del enlace",
    /\.modo === "provisional"/.test(js) && /contraseña provisional nueva/.test(js));
}

console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien: reenviar el acceso a una cuenta nueva manda otra contraseña provisional.");
process.exit(fallos ? 1 : 0);
