// Edge Function: enviar-resultado-arbitraje
//
// El examen de arbitraje (nivel-de-arbitraje.html) NUNCA mandó nada por
// correo automáticamente a propósito ("Oscar lo revisa a mano"). Esta
// función agrega, aparte de eso, un envío explícito que dispara quien
// administra desde arbitraje.html: las respuestas del examen, completas o
// solo las que la persona tuvo mal, con la explicación y el artículo del
// Handbook de cada una — no reemplaza la retroalimentación escrita a mano
// (columna "retroalimentacion"/"revisado"), es un envío aparte.
//
// El banco de preguntas (enunciado, opciones, correcta, explicación, fuente)
// vive en js/arbitraje-items.js, cargado por el navegador — acá se trae ese
// mismo archivo del sitio en vivo y se evalúa en un scope aislado (mismo
// patrón que instrucciones-email.ts trae el PDF del sitio en vez de
// duplicarlo): así una sola fuente de verdad sigue sirviendo para las dos
// cosas, sin mantener una copia del banco de preguntas acá.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://ajedrez-integral.com";
const ITEMS_URL = `${SITE_URL}/js/arbitraje-items.js`;

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

interface Item {
  id: string;
  area: string;
  enunciado: string;
  opciones: string[];
  correcta: number;
  explica: string;
  fuente: string;
}

const AREA_INFO: Record<string, { nombre: string; emoji: string }> = {
  leyes: { nombre: "Leyes del Ajedrez", emoji: "📖" },
  reloj: { nombre: "El reloj y el tiempo", emoji: "⏱️" },
  irregularidades: { nombre: "Jugadas ilegales", emoji: "⚠️" },
  tablas: { nombre: "Planilla y tablas", emoji: "🤝" },
  conducta: { nombre: "Conducta y sanciones", emoji: "🚦" },
  ritmos: { nombre: "Rápidas y relámpago", emoji: "⚡" },
  competicion: { nombre: "Emparejamientos y desempates", emoji: "🗂️" },
  titulos: { nombre: "Oficio del árbitro", emoji: "⚖️" },
};

async function cargarBancoDePreguntas(): Promise<Item[]> {
  const res = await fetch(ITEMS_URL);
  if (!res.ok) throw new Error(`No se pudo descargar el banco de preguntas (${res.status})`);
  const codigo = await res.text();
  const sandbox: { ARBITRAJE_ITEMS?: Item[] } = {};
  // deno-lint-ignore no-explicit-any
  new Function("window", codigo)(sandbox as any);
  if (!Array.isArray(sandbox.ARBITRAJE_ITEMS) || !sandbox.ARBITRAJE_ITEMS.length) {
    throw new Error("El banco de preguntas vino vacío o con un formato inesperado");
  }
  return sandbox.ARBITRAJE_ITEMS;
}

function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

interface Fila { item: Item; dada: number | null | undefined; blanco: boolean; correcto: boolean; }

function filasDelExamen(detalle: { items?: string[]; respuestas?: Record<string, number | null> }, itemsPorId: Record<string, Item>): Fila[] {
  const respuestas = detalle.respuestas || {};
  return (detalle.items || [])
    .map((id) => itemsPorId[id])
    .filter((item): item is Item => !!item)
    .map((item) => {
      const dada = respuestas[item.id];
      const blanco = dada === null || dada === undefined;
      const correcto = !blanco && dada === item.correcta;
      return { item, dada, blanco, correcto };
    });
}

function construirCorreoHtml(opts: {
  nombre: string; nivel: string; porcentaje: number;
  detalle: { items?: string[]; respuestas?: Record<string, number | null> };
  soloErrores: boolean; itemsPorId: Record<string, Item>;
}): { asunto: string; html: string; relevantes: number; total: number } {
  const { nombre, nivel, porcentaje, detalle, soloErrores, itemsPorId } = opts;
  const filas = filasDelExamen(detalle, itemsPorId);
  const relevantes = soloErrores ? filas.filter((f) => !f.correcto) : filas;

  const porArea: Record<string, Fila[]> = {};
  relevantes.forEach((f) => { (porArea[f.item.area] || (porArea[f.item.area] = [])).push(f); });

  const primerNombre = String(nombre || "").trim().split(/\s+/)[0] || "";
  const asunto = soloErrores
    ? "Las preguntas a repasar de tu examen de arbitraje — Ajedrez Integral"
    : "Tu examen de arbitraje completo — Ajedrez Integral";

  let html = `<p>Hola ${escHtml(primerNombre)},</p>`;
  html += `<p>${soloErrores ? "Acá están las preguntas que te conviene repasar de" : "Acá está el detalle completo de"} tu examen de arbitraje.</p>`;
  html += `<p><strong>Resultado:</strong> ${porcentaje}% — ${escHtml(nivel)}</p>`;

  if (soloErrores && !relevantes.length) {
    html += `<p>🎉 No hay ninguna pregunta para reforzar: las tuviste todas bien.</p>`;
  } else {
    Object.keys(porArea).forEach((areaId) => {
      const info = AREA_INFO[areaId] || { nombre: areaId, emoji: "" };
      html += `<h3>${info.emoji} ${escHtml(info.nombre)}</h3>`;
      porArea[areaId].forEach((f) => {
        const tuRespuesta = f.blanco ? "(no la respondiste)" : escHtml(f.item.opciones[f.dada as number]);
        html += `<div style="margin-bottom:14px">`;
        html += `<p><strong>${escHtml(f.item.enunciado)}</strong></p>`;
        html += `<p>Tu respuesta: ${tuRespuesta} ${f.correcto ? "✅" : "❌"}</p>`;
        if (!f.correcto) html += `<p>Respuesta correcta: ${escHtml(f.item.opciones[f.item.correcta])}</p>`;
        html += `<p><em>${escHtml(f.item.explica)}</em></p>`;
        html += `<p style="font-size:12px;color:#666">Fuente: ${escHtml(f.item.fuente)}</p>`;
        html += `</div>`;
      });
    });
  }

  html += `<p>Cualquier duda, escríbenos por WhatsApp: <a href="https://wa.me/50683092291">+506 8309-2291</a>.</p>`;
  html += `<p>Ajedrez Integral</p>`;

  return { asunto, html, relevantes: relevantes.length, total: filas.length };
}

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

  const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return json({ error: "Token inválido" }, 401);
  }

  const { data: callerProfile, error: callerProfileError } = await callerClient
    .from("profiles")
    .select("role, is_admin")
    .eq("id", userData.user.id)
    .single();

  if (callerProfileError || !callerProfile || !(callerProfile.role === "profesor" || callerProfile.is_admin)) {
    return json({ error: "Solo profesores o administración pueden hacer esto" }, 403);
  }

  let body: { id?: string; soloErrores?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo JSON inválido" }, 400);
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return json({ error: "Falta el id del examen" }, 400);
  const soloErrores = body.soloErrores === true;

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return json({ error: "No se puede enviar: falta configurar RESEND_API_KEY en el proyecto." }, 500);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: fila, error: filaError } = await adminClient
    .from("arbitrajes_publicos")
    .select("id, nombre, email, porcentaje, nivel, detalle")
    .eq("id", id)
    .maybeSingle();

  if (filaError || !fila) {
    return json({ error: "No se encontró ese examen" }, 404);
  }
  if (!fila.email) {
    return json({ error: "Ese registro no tiene correo guardado" }, 400);
  }

  let itemsPorId: Record<string, Item>;
  try {
    const items = await cargarBancoDePreguntas();
    itemsPorId = {};
    items.forEach((i) => { itemsPorId[i.id] = i; });
  } catch (err) {
    return json({ error: "No se pudo cargar el banco de preguntas: " + (err instanceof Error ? err.message : String(err)) }, 500);
  }

  const detalle = fila.detalle || {};
  const { asunto, html, relevantes, total } = construirCorreoHtml({
    nombre: fila.nombre || "",
    nivel: fila.nivel || "",
    porcentaje: typeof fila.porcentaje === "number" ? fila.porcentaje : 0,
    detalle,
    soloErrores,
    itemsPorId,
  });

  const from = Deno.env.get("RESEND_FROM") || "Ajedrez Integral <onboarding@resend.dev>";
  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [fila.email], subject: asunto, html }),
  });

  if (!resendRes.ok) {
    const detalleError = await resendRes.text();
    return json({ error: "Resend no pudo enviar el correo: " + detalleError }, 502);
  }

  await adminClient
    .from("arbitrajes_publicos")
    .update({ resultado_enviado_at: new Date().toISOString() })
    .eq("id", id);

  return json({ ok: true, email: fila.email, relevantes, total, soloErrores });
});
