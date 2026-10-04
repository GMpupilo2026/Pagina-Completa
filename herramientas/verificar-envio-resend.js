/* ¿El correo salió de verdad? — supabase/functions/_compartido/envio-resend.ts

   Resend acepta un envío aunque la dirección esté bloqueada por un rebote
   viejo, y lo descarta después («suppressed»). La pantalla decía «enviado» y
   nadie se enteraba: le pasó al enlace para la contraseña nueva el 3 de
   octubre. Lo que se comprueba:

   - un envío descartado o rebotado se reconoce, y uno entregado no;
   - si la consulta falla o no hay id, no se inventa un problema;
   - el aviso dice la dirección y qué hacer;
   - reenviar-acceso se lo dice a quien lo mandó, recuperar-acceso lo deja en
     los registros (sin cambiar su respuesta), y las dos lo despliegan.

       node herramientas/verificar-envio-resend.js                         */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");
const MODULO = path.join(RAIZ, "supabase/functions/_compartido/envio-resend.ts");

let fallos = 0;
function cierto(nombre, valor, detalle) {
  if (valor) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle !== undefined ? "\n      " + detalle : "")); fallos += 1; }
}

/* Cada caso: lo que contesta Resend en cada consulta. "error" = no ok,
   "tira" = fetch lanza. Se cuenta cuántas consultas hizo. */
const casos = {
  bloqueado: ["queued", "suppressed"],
  rebotado: ["sent", "sent", "bounced"],
  entregado: ["delivered", "suppressed"],
  enCamino: ["sent", "sent", "sent"],
  noOk: ["error"],
  tira: ["tira"],
};
const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
  `import { envioFallido, motivoNoLlego } from ${JSON.stringify(MODULO)};
   const casos = JSON.parse(process.argv[1]);
   const out = {};
   const dormir = () => Promise.resolve();
   for (const k in casos) {
     let n = 0; const urls = [];
     const fetchFn = async (url, op) => {
       urls.push([url, op && op.headers && op.headers.Authorization]);
       const r = casos[k][Math.min(n++, casos[k].length - 1)];
       if (r === "tira") throw new Error("red");
       if (r === "error") return new Response("{}", { status: 500 });
       return new Response(JSON.stringify({ last_event: r }), { status: 200 });
     };
     out[k] = { r: await envioFallido("clave", "id/1", { fetchFn, dormir }), n, urls };
   }
   let llamadas = 0;
   const cuenta = async () => { llamadas++; return new Response("{}"); };
   out.sinId = { r: await envioFallido("clave", null, { fetchFn: cuenta, dormir }), n: llamadas };
   out.motivos = {
     suppressed: motivoNoLlego("suppressed", "casa@ejemplo.cr"),
     bounced: motivoNoLlego("bounced", "casa@ejemplo.cr"),
   };
   process.stdout.write(JSON.stringify(out));`, JSON.stringify(casos)], { encoding: "utf8" });
if (r.status !== 0) { console.log(r.stderr); process.exit(1); }
const o = JSON.parse(r.stdout);

console.log("\nEn qué terminó el envío");
cierto("descartado por la lista de bloqueo: lo reconoce", o.bloqueado.r === "suppressed", JSON.stringify(o.bloqueado));
cierto("rebotado: lo reconoce aunque tarde en marcarse", o.rebotado.r === "bounced", JSON.stringify(o.rebotado));
cierto("entregado: no es un problema, y deja de preguntar", o.entregado.r === null && o.entregado.n === 1, JSON.stringify(o.entregado));
cierto("si sigue en camino, se da por bueno sin preguntar sin fin", o.enCamino.r === null && o.enCamino.n === 3, JSON.stringify(o.enCamino));
cierto("si la consulta falla, no se inventa un problema", o.noOk.r === null && o.tira.r === null);
cierto("sin id no pregunta nada", o.sinId.r === null && o.sinId.n === 0, JSON.stringify(o.sinId));
cierto("pregunta por ESE envío, con la clave", o.bloqueado.urls[0][0] === "https://api.resend.com/emails/id%2F1" && o.bloqueado.urls[0][1] === "Bearer clave",
  JSON.stringify(o.bloqueado.urls[0]));

console.log("\nLo que se le dice a quien lo mandó");
cierto("bloqueada: dice la dirección, que rebotó antes y qué hacer",
  /casa@ejemplo\.cr/.test(o.motivos.suppressed) && /rebotó antes/.test(o.motivos.suppressed) && /bien escrita/.test(o.motivos.suppressed),
  o.motivos.suppressed);
cierto("rebotada: dice la dirección y que se revise", /casa@ejemplo\.cr/.test(o.motivos.bounced) && /bien escrita/.test(o.motivos.bounced), o.motivos.bounced);

console.log("\nLas funciones lo usan");
const leer = (f) => fs.readFileSync(path.join(RAIZ, "supabase/functions", f, "index.ts"), "utf8");
const reenviar = leer("reenviar-acceso");
cierto("reenviar-acceso pregunta en qué terminó el envío",
  /import \{[^}]*envioFallido[^}]*\} from "\.\/envio-resend\.ts"/.test(reenviar) && /await envioFallido\(/.test(reenviar));
cierto("y si no llegó, contesta con el error (no con ok)",
  /if \(fallo\) \{[\s\S]{0,300}return json\(\{ error: motivoNoLlego\(fallo, destino\)/.test(reenviar));
const recuperar = leer("recuperar-acceso");
cierto("recuperar-acceso también pregunta, y lo deja en los registros",
  /envioFallido\(/.test(recuperar) && /console\.error\([^)]*terminó en/.test(recuperar));
cierto("sin cambiar su respuesta: sigue siendo siempre la misma",
  !/no_llego|motivoNoLlego/.test(recuperar));
const armar = fs.readFileSync(path.join(RAIZ, "herramientas/funciones-armar.js"), "utf8");
cierto("las dos lo despliegan (funciones-armar.js)",
  /"recuperar-acceso": \[[^\]]*"envio-resend\.ts"/.test(armar) && /"reenviar-acceso": \[[^\]]*"envio-resend\.ts"/.test(armar));

console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien: un correo que no llegó ya no pasa por enviado.");
process.exit(fallos ? 1 : 0);
