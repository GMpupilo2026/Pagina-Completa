/* Arma la bienvenida a la casa para `verificar-bienvenida-casa.js` y la
   escribe en stdout como JSON. Vive aparte por lo mismo que
   casos-informe-casa.mts: la plantilla es TypeScript (se despliega a Deno) y
   esto se corre con `--experimental-strip-types`. */
import { bienvenidaHtml, cuandoLlega } from "../supabase/functions/informes-encargados/informe-html.ts";
import { cabeceraCorreo } from "../supabase/functions/_compartido/marca-correo.ts";

const marca = { nombre: "CCDR POCOCI", color: "#1479b8", logoUrl: null };
const cuando = {
  lunes13: cuandoLlega("semanal", 1, 13),
  sabado1: cuandoLlega("semanal", 6, 1),
  sinDia: cuandoLlega("semanal", null, 7),
  diario7: cuandoLlega("diario", null, 7),
  mediodia: cuandoLlega("semanal", 3, 12),
  mensual: cuandoLlega("mensual", 1, 13),
};
const html = {
  pococi: bienvenidaHtml("Estefany Pamela Méndez", "semanal", cuando.lunes13, "https://ajedrez-integral.com", null,
    (t, c) => cabeceraCorreo(marca, t, c)),
  raro: bienvenidaHtml("<b>Ana</b> Pérez", "mensual", cuando.mensual, "https://ajedrez-integral.com",
    { enlace: "https://wa.me/50600000000", texto: "6000-0000" } as any, (t, c) => cabeceraCorreo(null, t, c)),
};
process.stdout.write(JSON.stringify({ cuando, html }));

/*! rev bfb5bbb0d2d82f9f */
