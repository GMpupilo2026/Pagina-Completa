// Edge Function: consulta-arbitraje (verify_jwt en false)
//
// «Herramientas de arbitraje» › Espacio de consultas: un árbitro o un padre o
// madre de familia escribe su duda, SIN cuenta, y esta función contesta con lo
// que dice el Reglamento de la FIDE, usando Claude. No hay sesión que
// comprobar —por eso verify_jwt va en false—, así que todo el candado está
// adentro: el freno de los envíos públicos (arbitraje_consulta_frenar, antes
// de gastar nada en la IA) y el presupuesto mensual de
// arbitraje_consulta_config (aparte del de «Mejorar informe», que es solo
// para profesores con sesión).
//
// Cada intento que pasa el freno queda anotado en consultas_arbitraje, llegue
// o no a contestar: así quien administra ve también lo que no se pudo
// responder (sin presupuesto, error de la IA) y no solo lo que salió bien.
//
// Ver «Espacio de consultas» en docs/decisiones/juegos-y-torneos.md.

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

function ipDe(req: Request): string | null {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ??
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0];
  return ip?.trim() || null;
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Mismos precios que mejorar-informe (dólares por millón de tokens, entrada y
// salida), pero solo los dos modelos que ofrece esta herramienta: acá no hay
// cuenta ni sesión detrás, así que el modelo más caro no se habilita.
const PRECIOS: Record<string, [number, number]> = {
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-5": [2, 10],
};
const PRECIO_DESCONOCIDO: [number, number] = [10, 50];
const precioDe = (m: string) => PRECIOS[m] ?? PRECIO_DESCONOCIDO;

const QUIENES = ["arbitro", "padre_familia", "otro"] as const;
type Quien = typeof QUIENES[number];

const ETIQUETA_QUIEN: Record<Quien, string> = {
  arbitro: "un árbitro",
  padre_familia: "una madre o un padre de familia",
  otro: "una persona",
};

const SISTEMA = `Eres un asistente que responde dudas sobre el Reglamento de la FIDE (el Handbook: Leyes del Ajedrez vigentes y sus apéndices) a árbitros, y a madres y padres de familia que no conocen el reglamento a fondo.

Contesta en español latinoamericano, tuteando (nunca voseo), en un máximo de 180 palabras, claro y directo.

Reglas:
- Cita el artículo o la sección del Handbook en que te basas cuando puedas (por ejemplo «art. 7.5.5» o «Handbook B.06»). Si no estás seguro del número exacto, dilo con honestidad en vez de inventarlo.
- Si la pregunta depende del reglamento PARTICULAR de un torneo (no del Handbook: por ejemplo el ritmo de juego o el sistema de desempate de ese torneo específico), dilo así y recomienda consultar las bases de ese torneo o a su árbitro principal.
- Si la pregunta no es sobre ajedrez o sobre su reglamento, dilo y no contestes otra cosa.
- No das una decisión arbitral sobre un caso concreto que esté pasando ahora mismo en una partida: esa decisión es siempre del árbitro presente. Explica qué dice el reglamento, no qué decidir.
- Sin negritas, sin asteriscos, sin listas con viñetas: texto plano, en párrafos cortos.
- Devuelve solo la respuesta, sin saludos ni despedidas.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Cuerpo JSON inválido" }, 400); }

  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const pregunta = typeof body.pregunta === "string" ? body.pregunta.trim() : "";
  const quien: Quien = (QUIENES as readonly string[]).includes(body.quien as string)
    ? (body.quien as Quien) : "otro";

  if (nombre.length < 2 || nombre.length > 120) {
    return json({ ok: false, error: "Escribe tu nombre (de 2 a 120 letras)." }, 400);
  }
  if (email && (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 160)) {
    return json({ ok: false, error: "Ese correo no es válido." }, 400);
  }
  if (pregunta.length < 10 || pregunta.length > 1500) {
    return json({ ok: false, error: "Cuenta tu duda con un poco más de detalle (de 10 a 1500 letras)." }, 400);
  }

  // El freno de los envíos públicos, ANTES de gastar nada en la IA.
  const { data: freno, error: frenoError } = await admin.rpc("arbitraje_consulta_frenar", {
    p_ip: ipDe(req), p_correo: email || null,
  });
  if (frenoError) return json({ ok: false, error: "No se pudo procesar la consulta. Intenta de nuevo." }, 502);
  if (freno) return json({ ok: false, error: freno }, 429);

  const base = { nombre, email: email || null, quien, pregunta };

  // Qué modelo está habilitado y cuánto queda del presupuesto del mes.
  const { data: config } = await admin.from("arbitraje_consulta_config")
    .select("modelo, tope_mensual_usd").eq("id", 1).maybeSingle();
  if (!config || !config.modelo) {
    await admin.from("consultas_arbitraje").insert({ ...base, ok: false, detalle: "sin_modelo_configurado" });
    return json({ ok: false, error: "El espacio de consultas no está disponible en este momento. Escríbenos por WhatsApp o a info@ajedrez-integral.com." }, 503);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    await admin.from("consultas_arbitraje").insert({ ...base, ok: false, modelo: config.modelo, detalle: "sin_api_key" });
    return json({ ok: false, error: "El espacio de consultas no está disponible en este momento. Escríbenos por WhatsApp o a info@ajedrez-integral.com." }, 503);
  }

  const modelo = String(config.modelo);
  const maxTokens = 700;
  const [pin, pout] = precioDe(modelo);
  const { data: inicioMes } = await admin.rpc("ia_inicio_de_mes");
  const { data: filas } = await admin.from("consultas_arbitraje")
    .select("costo_usd").gte("created_at", inicioMes as string);
  const gastado = (filas || []).reduce((s, f) => s + Number(f.costo_usd || 0), 0);

  // Lo peor que puede costar esta llamada. Si no cabe en lo que queda del
  // mes, no se hace: el tope es un tope, no una sugerencia.
  const peor = ((SISTEMA.length + pregunta.length) / 3 * pin + maxTokens * pout) / 1e6;
  if (Number(config.tope_mensual_usd) - gastado < peor) {
    await admin.from("consultas_arbitraje").insert({ ...base, ok: false, modelo, detalle: "tope_mensual_alcanzado" });
    return json({ ok: false, error: "El espacio de consultas llegó a su cupo de este mes. Escríbenos por WhatsApp o a info@ajedrez-integral.com." }, 503);
  }

  const client = new Anthropic({ apiKey });
  let respuesta: Anthropic.Message;
  try {
    respuesta = await client.messages.create({
      model: modelo,
      max_tokens: maxTokens,
      system: SISTEMA,
      messages: [{ role: "user", content: `Quien pregunta es ${ETIQUETA_QUIEN[quien]}. Su pregunta: ${pregunta}` }],
    });
  } catch (err) {
    let detalle = err instanceof Error ? err.message : String(err);
    if (err instanceof Anthropic.RateLimitError) detalle = "429: " + detalle;
    else if (err instanceof Anthropic.APIConnectionError) detalle = "sin conexión: " + detalle;
    else if (err instanceof Anthropic.APIError) detalle = `${err.status}: ${detalle}`;
    await admin.from("consultas_arbitraje").insert({ ...base, ok: false, modelo, detalle: detalle.slice(0, 500) });
    return json({ ok: false, error: "No se pudo generar la respuesta ahora. Intenta de nuevo en un rato." }, 502);
  }

  const servido = respuesta.model || modelo;
  const u = respuesta.usage;
  const entrada = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  const salida = u.output_tokens ?? 0;
  const [ci, co] = precioDe(servido);
  const costo = (entrada * ci + salida * co) / 1e6;

  const texto = respuesta.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("\n")
    .trim();

  const bien = respuesta.stop_reason !== "refusal" && respuesta.stop_reason !== "max_tokens" && !!texto;
  const { data: fila } = await admin.from("consultas_arbitraje").insert({
    ...base, respuesta: bien ? texto : null, modelo: servido,
    tokens_entrada: entrada, tokens_salida: salida, costo_usd: costo,
    ok: bien, detalle: bien ? null : `stop_reason: ${respuesta.stop_reason}`,
  }).select("id").single();

  if (!bien) {
    return json({ ok: false, error: "No se pudo generar la respuesta ahora. Intenta de nuevo en un rato." }, 502);
  }
  return json({ ok: true, id: fila?.id, respuesta: texto });
});
