// Edge Function: clase-grabaciones-limpiar
//
// Borra las grabaciones de la llamada de la clase que tienen más de 90 días:
// el archivo del almacenamiento y su fila de clase_grabaciones. Es lo que
// promete la Política de privacidad («se borra sola a los 90 días»). Ver «La
// grabación de la llamada» en docs/decisiones/clase-en-vivo.md.
//
// POR QUÉ UNA FUNCIÓN: la base no puede borrar archivos del almacenamiento
// desde SQL; borrar solo la fila dejaría el audio guardado y huérfano, que es
// justo lo que no se puede.
//
// verify_jwt en FALSE porque la llama la base (pg_cron limpiar-grabaciones,
// public.limpiar_grabaciones_viejas()), que no trae sesión de persona; a cambio
// exige el secreto `grabaciones_limpiar_secreto` de la bóveda, que vuelve a
// leer con la service role (como alerta-base).
//
// Primero borra el archivo y solo después la fila: si el almacenamiento falla,
// la fila queda y la noche siguiente se vuelve a intentar.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const DIAS = 90;
const POR_TANDA = 500;

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const secreto = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: esperado } = await admin.rpc("secreto_grabaciones_limpiar");
  if (!esperado || !secreto || secreto !== esperado) {
    return json({ error: "Este borrado solo lo dispara la base" }, 401);
  }

  const limite = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000).toISOString();
  let borradas = 0;
  // De a tandas: PostgREST corta a ~1000 filas sin avisar.
  for (let vuelta = 0; vuelta < 20; vuelta++) {
    const { data, error } = await admin.from("clase_grabaciones")
      .select("ruta").lt("creado_en", limite).order("creado_en").range(0, POR_TANDA - 1);
    if (error) return json({ error: error.message, borradas }, 500);
    const rutas = (data ?? []).map((f: { ruta: string }) => f.ruta);
    if (!rutas.length) break;
    const { error: errArchivos } = await admin.storage.from("clase-grabaciones").remove(rutas);
    if (errArchivos) return json({ error: "No se pudieron borrar los archivos: " + errArchivos.message, borradas }, 500);
    const { error: errFilas } = await admin.from("clase_grabaciones").delete().in("ruta", rutas);
    if (errFilas) return json({ error: errFilas.message, borradas }, 500);
    borradas += rutas.length;
    if (rutas.length < POR_TANDA) break;
  }
  return json({ ok: true, borradas });
});
