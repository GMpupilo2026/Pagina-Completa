// Edge Function: ocr-scoresheet
// Proxy hacia Google Cloud Vision (DOCUMENT_TEXT_DETECTION) para el Lector de
// planilla. Existe porque el OCR gratuito en el navegador (Tesseract.js, que
// se probó antes) está entrenado para texto IMPRESO y no puede leer letra
// manuscrita real — se comprobó con una planilla real de un torneo: incluso
// una celda aislada y nítida con "e4" escrito a mano salía como basura total
// ("+6R565"). Vision sí reconoce escritura a mano con buena precisión.
//
// La clave de Vision nunca llega al navegador: el cliente manda la foto acá
// (autenticado con su JWT de Supabase) y esta función hace la llamada a
// Google con la clave guardada como secreto del proyecto.
//
// Requiere el secreto GOOGLE_VISION_API_KEY en este proyecto de Supabase
// (Project Settings → Edge Functions → Secrets, o `supabase secrets set`).
// Sin ese secreto, la función responde con un error claro en vez de fallar
// en silencio.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_VISION_API_KEY = Deno.env.get("GOOGLE_VISION_API_KEY");
const SITE_URL = "https://ajedrez-integral.com";

// Base64 sin decodificar: ~15 MB de foto quedan en banda ancha para lo que
// hace falta (una foto de planilla nítida) sin abrir la puerta a adjuntos
// enormes que solo van a inflar la factura de Vision o el tiempo de subida.
const MAX_BASE64_LENGTH = 20_000_000;

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

type Vertex = { x?: number; y?: number };
type VisionWord = {
  boundingBox?: { vertices?: Vertex[] };
  symbols?: { text: string }[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Método no permitido" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return json({ error: "Falta token de autorización" }, 401);
  }

  // Cualquier persona con sesión (alumno o profesor) puede usar el lector de
  // planilla — no hace falta un rol específico, solo confirmar que el token
  // es válido.
  const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return json({ error: "Token inválido" }, 401);
  }

  if (!GOOGLE_VISION_API_KEY) {
    console.error("GOOGLE_VISION_API_KEY no configurado en los secretos del proyecto.");
    return json({ error: "El lector de planilla no está configurado todavía. Avísale al profesor." }, 500);
  }

  let body: { image_base64?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo JSON inválido" }, 400);
  }

  const imageBase64 = body.image_base64;
  if (!imageBase64 || typeof imageBase64 !== "string") {
    return json({ error: "Falta la imagen (image_base64)" }, 400);
  }
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return json({ error: "La imagen es demasiado grande. Prueba con una foto más liviana." }, 413);
  }

  let visionRes: Response;
  try {
    visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: imageBase64 },
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
              imageContext: { languageHints: ["es"] },
            },
          ],
        }),
      },
    );
  } catch (err) {
    console.error("No se pudo contactar a Google Vision:", err);
    return json({ error: "No se pudo contactar el servicio de lectura. Prueba de nuevo." }, 502);
  }

  if (!visionRes.ok) {
    const text = await visionRes.text().catch(() => "");
    console.error("Google Vision respondió con error:", visionRes.status, text);
    return json({ error: "El servicio de lectura no pudo procesar la imagen." }, 502);
  }

  const payload = await visionRes.json();
  const result = payload?.responses?.[0];

  if (result?.error) {
    console.error("Google Vision devolvió un error:", result.error);
    return json({ error: result.error.message || "El servicio de lectura no pudo procesar la imagen." }, 502);
  }

  const words: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[] = [];
  const pages = result?.fullTextAnnotation?.pages || [];
  for (const page of pages) {
    for (const block of page.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const word of (paragraph.words || []) as VisionWord[]) {
          const text = (word.symbols || []).map((s) => s.text).join("");
          if (!text) continue;
          const vertices = word.boundingBox?.vertices || [];
          const xs = vertices.map((v) => v.x || 0);
          const ys = vertices.map((v) => v.y || 0);
          if (!xs.length || !ys.length) continue;
          words.push({
            text,
            bbox: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) },
          });
        }
      }
    }
  }

  return json({ words });
});
