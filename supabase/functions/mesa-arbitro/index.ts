// Edge Function: mesa-arbitro
//
// «Mesa del árbitro» (mesa-arbitro.html, con licencia `mesa-arbitro`): lee de
// chess-results.com las mesas de la ronda abierta de un torneo suizo
// individual y, si el árbitro lo pide, le manda los resultados que anotó. Se
// usa la MISMA puerta que chess-results da a los árbitros adjuntos, la de
// «Enter Results Online» (https://chess-results.com/Results.aspx): el código
// de la base de datos del torneo (`tnr`) y el SID (la clave) que quien
// organiza ve en Swiss-Manager, «Internet / Customize lists on chess-results.com».
// Ver «Mesa del árbitro: resultados y bitácora» en
// docs/decisiones/juegos-y-torneos.md.
//
// LA CLAVE (SID) NO SE GUARDA NI SE ESCRIBE EN NINGÚN LADO: llega en el
// pedido, se usa para entrar y se olvida. No va a la base, ni a la caché, ni
// al registro (nunca se imprime con console), ni a la respuesta.
//
// POR QUÉ UNA FUNCIÓN: chess-results no tiene API ni manda CORS, así que el
// navegador no le puede pedir nada. Y es un formulario ASP.NET WebForms: cada
// envío lleva el __VIEWSTATE y el __EVENTVALIDATION de la página anterior, y
// la sesión (una cookie) tiene que ser la misma. Por eso entrar, leer y
// guardar pasan juntos en UN pedido de esta función.
//
// LA PANTALLA (comprobada con un torneo de prueba, tnr 1532448):
//   - Solo trabaja con la ronda que Swiss-Manager tiene abierta: «Ronda» es
//     un campo de solo lectura. No se puede elegir otra desde ahí.
//   - Cada mesa es una fila: número, blancas, negras y un desplegable
//     `GridErg$ctlNN$combo_erg` con 0 (sin resultado), 1 (1-0), 2 (tablas),
//     3 (0-1), 4 (1f-0f), 5 (0f-1f), 6 (0f-0f) y D (borrar).
//   - El desplegable se llama por la POSICIÓN de la fila, no por la mesa:
//     por eso al guardar se vuelve a leer la pantalla y se mandan los valores
//     de TODAS las filas (las que no cambian, con el valor que ya tenían).
//
// LO QUE SE COMPRUEBA ANTES DE GUARDAR (si no, no se manda nada):
//   - que la ronda abierta sea la que la página mostró al árbitro;
//   - que cada mesa a cambiar tenga los mismos jugadores de blancas y negras
//     que la página mostró (si la lista se corrió, no se escribe en otra mesa);
//   - que el valor sea uno de los ocho (0 a 6, y D);
// Y DESPUÉS DE GUARDAR se entra de nuevo (otra sesión) y se LEE: la respuesta
// dice qué quedó de verdad en chess-results, mesa por mesa, y avisa si algo
// que no se pidió cambió. Nunca dice «guardado» por haber mandado el envío.
//
// NO ES UN PROXY ABIERTO: solo habla con chess-results.com (o sus servidores
// s1…s99), solo con Results.aspx, y solo con licencia: se pregunta a la base
// `tengo_herramienta('mesa-arbitro')` CON EL TOKEN DE QUIEN LLAMA (clave
// anónima + su Authorization), no con la de servicio, así que pasa por
// antes_de_cada_pedido() y la verificación en dos pasos la exige la base.
//
// Dos acciones (body.action):
//   "leer"    { tnr, sid, destino? }               -> { tnr, torneo, ronda, mesas, torneos[] }  (torneos = los ligados del grupo;
//                                                        `destino` es el que se eligió entre ellos)
//   "guardar" { tnr, sid, destino?, ronda, cambios:[{ mesa, blancas, negras, valor }] }
//                                                  -> { ok, ronda, resultados, diferencias }
//
// LO QUE HABLA CON CHESS-RESULTS (leer la pantalla, entrar, armar el «Save» y guardar
// comprobando) vive en `_compartido/chess-results-ingreso.ts`, una sola copia que
// comparten esta función y las del Centroamericano (ver «Mesas de los árbitros del
// Centroamericano» en docs/decisiones/juegos-y-torneos.md); se copia aquí al armar.
//
// verify_jwt en true.

import { createClient } from "npm:@supabase/supabase-js@2";
import { entrar, guardarYComprobar, leerRonda, MAX_CAMBIOS, resumir } from "./chess-results-ingreso.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const HERRAMIENTA = "mesa-arbitro";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Solo POST." }, 405);

  const autorizacion = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(autorizacion)) return json({ error: "Inicia sesión para usar la herramienta." }, 401);

  const comoQuienLlama = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: autorizacion } },
  });
  const { data: puede, error: errPermiso } = await comoQuienLlama.rpc("tengo_herramienta", { p_herramienta: HERRAMIENTA });
  if (errPermiso) return json({ error: "No se pudo comprobar tu licencia: " + errPermiso.message }, 403);
  if (puede !== true) return json({ error: "Tu cuenta no tiene una licencia vigente de esta herramienta." }, 403);

  let cuerpo: { action?: unknown; tnr?: unknown; sid?: unknown; destino?: unknown; ronda?: unknown; cambios?: unknown } = {};
  try { cuerpo = await req.json(); } catch { cuerpo = {}; }
  const tnr = String(cuerpo.tnr ?? "").trim();
  const sid = String(cuerpo.sid ?? "").trim();
  if (!/^\d{1,7}$/.test(tnr)) return json({ error: "El código de la base de datos del torneo son hasta 7 números." }, 400);
  if (!/^[A-Za-z0-9]{8,32}$/.test(sid)) return json({ error: "La clave (SID) son hasta 32 letras y números." }, 400);
  // Si los torneos están LIGADOS en un grupo de chess-results, con el mismo código y clave se entra al grupo y
  // `destino` es el torneo ligado que se quiere leer o guardar (el que se eligió en el desplegable). Sin
  // `destino`, se lee el torneo con el que abre la clave.
  const destino = /^\d{1,7}$/.test(String(cuerpo.destino ?? "")) ? String(cuerpo.destino) : "";

  try {
    if (cuerpo.action === "leer") {
      let pantalla;
      if (destino) {
        const leida = await leerRonda(tnr, sid, destino);
        if ("error" in leida) return json({ error: leida.error }, leida.estado);
        pantalla = leida.pantalla;
      } else {
        pantalla = (await entrar(tnr, sid)).pantalla;
        if (!pantalla.entro) return json({ error: "chess-results no aceptó el código o la clave. Revísalos en Swiss-Manager." }, 401);
      }
      // `torneos`: los torneos ligados del grupo (si hay más de uno), para que la página deje elegir.
      return json({ ...resumir(pantalla), torneos: pantalla.torneos.map(({ tnr: t, nombre, elegido }) => ({ tnr: t, nombre, elegido })), leido_en: new Date().toISOString() });
    }

    if (cuerpo.action === "guardar") {
      const ronda = Number(cuerpo.ronda);
      const lista = Array.isArray(cuerpo.cambios) ? cuerpo.cambios : [];
      if (!Number.isInteger(ronda) || ronda < 1) return json({ error: "Falta la ronda." }, 400);
      if (lista.length === 0 || lista.length > MAX_CAMBIOS) return json({ error: "Los cambios son de 1 a " + MAX_CAMBIOS + " mesas." }, 400);
      const cambios = lista.map((c: Record<string, unknown>) => ({
        mesa: Number(c?.mesa), blancas: String(c?.blancas ?? ""), negras: String(c?.negras ?? ""), valor: String(c?.valor ?? ""),
      }));
      const res = await guardarYComprobar(tnr, sid, destino || tnr, ronda, cambios);
      if (res.estado !== 200 || !("cuerpo" in res)) return json({ error: (res as { error: string }).error }, res.estado);
      return json(res.cuerpo);
    }

    return json({ error: "Acción desconocida." }, 400);
  } catch (e) {
    // Nunca se imprime el pedido: lleva la clave.
    console.error("mesa-arbitro:", tnr, e instanceof Error ? e.message : String(e));
    return json({ error: "No se pudo hablar con chess-results: " + (e instanceof Error ? e.message : String(e)) }, 502);
  }
});
