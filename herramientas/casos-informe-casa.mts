/* Genera el informe de la casa para los casos que verifica
   `verificar-informe-casa.js` y los escribe en stdout como JSON.

   Vive aparte porque `informe-html.ts` es TypeScript —se despliega a Deno— y
   este archivo se corre con `--experimental-strip-types`. El verificador lo
   lanza como subproceso para poder seguir siendo un `.js` de siempre, como el
   resto de `herramientas/`. */
import { informeHtml, PERIODOS } from "../supabase/functions/informes-encargados/informe-html.ts";
import { cabeceraCorreo } from "../supabase/functions/_compartido/marca-correo.ts";

const casos = JSON.parse(process.argv[2]) as Array<{ nombre: string; frecuencia: string; datos: any; marca?: any }>;
const salida: Record<string, string> = {};
for (const c of casos) {
  salida[c.nombre] = informeHtml(c.datos, c.frecuencia as any, "https://ajedrez-integral.com", null,
    (t, color) => cabeceraCorreo(c.marca ?? null, t, color));
}
process.stdout.write(JSON.stringify({ html: salida, periodos: PERIODOS }));
