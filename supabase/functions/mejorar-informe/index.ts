// Edge Function: mejorar-informe
//
// El botón «Mejorar informe». Recibe el texto que escribió quien dio la clase
// (lo que se hizo en una clase presencial, o el resumen de su informe mensual)
// y lo devuelve ordenado: un objetivo general, los objetivos específicos y lo
// que se trabajó. NO lo guarda: la pantalla se lo enseña y quien lo escribió
// decide si lo usa.
//
// QUÉ MODELO Y CUÁNTO SE PUEDE GASTAR lo decide quien administra, por academia
// (`academia_ia`), y lo contesta `ia_para_usuario()` — que solo puede llamar la
// service role: un profesor no tiene forma de saber qué modelo usa su academia
// ni cuánto le queda. Si no hay IA o se acabó el presupuesto, esta función dice
// «no disponible» y la pantalla esconde el botón.
//
// CADA LLAMADA SE ANOTA en `ia_uso` con lo que costó DE VERDAD: los tokens salen
// de `usage` de la respuesta y el precio del modelo que la sirvió. Se anota
// también la que falló (con costo cero si no llegó a responder), para que el
// gasto que ve quien administra no esconda nada.
//
// Lo que viaja al modelo es SOLO el texto y el tipo de informe: ni nombres de
// alumnos, ni la lista de asistencia. La pantalla le pide a quien escribe que
// no ponga datos personales.

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://ajedrez-integral.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Dólares por millón de tokens (entrada, salida). El gasto se calcula con el
// modelo que SIRVIÓ la respuesta (`response.model`): con el respaldo de Opus 5
// puede ser otro. Uno que no esté acá se cobra al precio más alto, para que el
// tope nunca se quede corto por un modelo nuevo.
const PRECIOS: Record<string, [number, number]> = {
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-5": [2, 10],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
};
const PRECIO_DESCONOCIDO: [number, number] = [10, 50];
const precioDe = (m: string) => PRECIOS[m] ?? PRECIO_DESCONOCIDO;

type Tipo = "clase" | "informe_mensual";

const INSTRUCCIONES: Record<Tipo, { sistema: string; maxCaracteres: number }> = {
  clase: {
    maxCaracteres: 1500,
    sistema: `Eres asistente de una academia de ajedrez de Costa Rica. Un profesor te pasa las notas que tomó de una clase que ya dio. Reescríbelas en español latinoamericano, tuteando (nunca voseo), con este formato exacto de texto plano:

Objetivo general: una sola oración que diga para qué fue la clase.

Objetivos específicos:
- tres a cinco renglones, cada uno empezando con un verbo en infinitivo (Reconocer, Aplicar, Calcular…)

Lo que se trabajó: un párrafo corto con lo que se hizo en la clase.

Reglas:
- Usa SOLO lo que dicen las notas. No inventes temas, ejercicios, posiciones ni resultados. Si las notas son escuetas, escribe objetivos generales y breves en vez de rellenar.
- No pongas nombres de personas aunque aparezcan en las notas.
- Usa los nombres de ajedrez que se usan en la región (horquilla, clavada, enfilada, mate del pasillo, oposición, regla del cuadrado).
- Sin negritas, sin asteriscos, sin títulos extra. Máximo 1200 caracteres en total.
- Devuelve solo el texto reescrito, sin comentarios antes ni después.`,
  },
  informe_mensual: {
    maxCaracteres: 4000,
    sistema: `Eres asistente de una academia de ajedrez de Costa Rica. Un profesor te pasa el resumen de su trabajo del mes para su supervisión. Reescríbelo en español latinoamericano, tuteando (nunca voseo), claro y profesional, con este formato exacto de texto plano:

Objetivo general del mes: una sola oración.

Objetivos específicos:
- tres a seis renglones, cada uno empezando con un verbo en infinitivo

Lo que se trabajó: uno o dos párrafos con lo que se hizo con los grupos.

Reglas:
- Usa SOLO lo que dice el resumen. No inventes clases, cifras, temas ni resultados.
- No pongas nombres de alumnos aunque aparezcan.
- Usa los nombres de ajedrez que se usan en la región.
- Sin negritas, sin asteriscos, sin títulos extra. Máximo 3000 caracteres en total.
- Devuelve solo el texto reescrito, sin comentarios antes ni después.`,
  },
};

async function anotar(fila: Record<string, unknown>) {
  const { error } = await admin.from("ia_uso").insert(fila);
  if (error) console.error("No se pudo anotar el uso de la IA:", error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Cuerpo JSON inválido" }, 400); }

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Falta token de autorización" }, 401);
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData?.user) return json({ error: "Tu sesión venció: vuelve a entrar." }, 401);
  const usuario = userData.user.id;

  const tipo = (body.tipo === "informe_mensual" ? "informe_mensual" : "clase") as Tipo;
  const texto = typeof body.texto === "string" ? body.texto.trim() : "";
  if (texto.length < 20) return json({ error: "Escribe al menos un par de frases para poder mejorarlo." }, 400);
  if (texto.length > 4000) return json({ error: "El texto es demasiado largo: acórtalo a 4000 caracteres." }, 400);

  // Qué modelo y cuánto le queda. Sin fila: no hay IA para esta persona.
  const { data: conf, error: confError } = await admin.rpc("ia_para_usuario", { p_usuario: usuario });
  const c = Array.isArray(conf) ? conf[0] : conf;
  if (confError || !c || !c.modelo) return json({ error: "no_disponible" }, 403);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "Mejorar informe todavía no está configurado." }, 503);

  const ins = INSTRUCCIONES[tipo];
  const modelo = String(c.modelo);
  const conThinking = modelo !== "claude-haiku-4-5";
  const maxTokens = conThinking ? 4000 : 1500;

  // Lo peor que puede costar esta llamada. Si no cabe en lo que queda del mes,
  // no se hace: el tope es un tope, no una sugerencia.
  const [pin, pout] = precioDe(modelo);
  const peor = ((ins.sistema.length + texto.length) / 3 * pin + maxTokens * pout) / 1e6;
  if (Number(c.restante_usd) < peor) return json({ error: "no_disponible" }, 403);

  const client = new Anthropic({ apiKey });
  const pedido = {
    model: modelo,
    max_tokens: maxTokens,
    system: ins.sistema,
    messages: [{ role: "user" as const, content: texto }],
    ...(conThinking ? { output_config: { effort: "low" as const } } : {}),
  };

  const base = { academia_id: c.academia_id ?? null, usuario_id: usuario, que: tipo };
  let respuesta: Anthropic.Message;
  try {
    respuesta = modelo === "claude-opus-5"
      // Opus 5 puede declinar por sus clasificadores: con el respaldo por
      // defecto, el pedido se vuelve a correr en otro modelo sin fallarle al
      // profesor. Se cobra con el modelo que de verdad respondió.
      ? await client.beta.messages.create({
          ...pedido,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        } as never) as unknown as Anthropic.Message
      : await client.messages.create(pedido as never) as Anthropic.Message;
  } catch (err) {
    let detalle = err instanceof Error ? err.message : String(err);
    if (err instanceof Anthropic.RateLimitError) detalle = "429: " + detalle;
    else if (err instanceof Anthropic.APIConnectionError) detalle = "sin conexión: " + detalle;
    else if (err instanceof Anthropic.APIError) detalle = `${err.status}: ${detalle}`;
    await anotar({ ...base, modelo, ok: false, detalle: detalle.slice(0, 500) });
    return json({ error: "No se pudo mejorar el texto ahora. Tu texto quedó como estaba." }, 502);
  }

  const servido = respuesta.model || modelo;
  const u = respuesta.usage;
  const entrada = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  const salida = u.output_tokens ?? 0;
  const [ci, co] = precioDe(servido);
  const costo = (entrada * ci + salida * co) / 1e6;

  const salidaTexto = respuesta.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("\n")
    .replace(/\*\*/g, "")
    .trim();

  const bien = respuesta.stop_reason !== "refusal" && respuesta.stop_reason !== "max_tokens" && !!salidaTexto;
  await anotar({
    ...base, modelo: servido, tokens_entrada: entrada, tokens_salida: salida,
    costo_usd: costo, ok: bien, detalle: bien ? null : `stop_reason: ${respuesta.stop_reason}`,
  });

  if (!bien) return json({ error: "No se pudo mejorar este texto. Tu texto quedó como estaba." }, 422);
  if (salidaTexto.length > ins.maxCaracteres) {
    return json({ error: "El texto mejorado salió demasiado largo. Prueba con notas más cortas." }, 422);
  }
  return json({ ok: true, texto: salidaTexto });
});
