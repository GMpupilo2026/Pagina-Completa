// Edge Function: explicar-posicion
//
// El botón «Explícame esta posición» de Mis estudios. Recibe la posición (FEN)
// y las líneas que YA calculó Stockfish en el navegador de quien pregunta, y
// devuelve en palabras qué pasa: qué busca la mejor jugada, qué amenaza, por
// qué las otras líneas valen lo que valen.
//
// QUIÉN DECIDE QUÉ: el análisis es de Stockfish; la IA solo lo cuenta. Por eso:
//  - cada jugada de cada línea se vuelve a jugar acá con chess.js: una línea
//    ilegal no viaja al modelo (y se rechaza el pedido);
//  - la explicación que menciona una jugada de pieza o una captura que NO está
//    en las líneas se rechaza entera. Ninguna jugada se inventa (CLAUDE.md,
//    «Contenido»), tampoco la que escribe la IA. Las casillas sueltas («el
//    caballo va a f5») no se pueden distinguir de una jugada de peón, así que
//    esas no se revisan.
//
// QUÉ MODELO Y CUÁNTO SE PUEDE GASTAR: lo mismo que «Mejorar informe»
// (`academia_ia`, por academia, de quien administra), con la casilla
// `alumnos` y un tope por persona y por día (`ia_para_explicar()`, solo de la
// service role). Cada llamada se anota en `ia_uso` con `que = explicar_posicion`
// y lo que costó de verdad; también la que falló o se rechazó.
//
// LO QUE VIAJA AL MODELO es la posición y las líneas. Nada de la persona: ni su
// nombre, ni el estudio, ni sus comentarios.

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import { Chess } from "npm:chess.js@0.10.3";

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

// Los mismos precios que «Mejorar informe» (verificar-explicar-posicion.js
// falla si se separan). Uno que no esté acá se cobra al precio más alto.
const PRECIOS: Record<string, [number, number]> = {
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-5": [2, 10],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
};
const PRECIO_DESCONOCIDO: [number, number] = [10, 50];
const precioDe = (m: string) => PRECIOS[m] ?? PRECIO_DESCONOCIDO;

const MAX_LINEAS = 3;
const MAX_JUGADAS = 10;
const MAX_CARACTERES = 1400;

// Tiene la verificación en dos pasos y el token todavía no la pasó (aal1). Esta
// función mira el permiso con la clave de servicio, así que PostgREST no la
// cubre (ver «La verificación en dos pasos»). El token ya lo validó getUser().
function sesionAMedias(factores: { status: string }[] | undefined, jwt: string): boolean {
  if (!(factores ?? []).some((f) => f.status === "verified")) return false;
  try {
    const b = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b + "=".repeat((4 - (b.length % 4)) % 4))).aal !== "aal2";
  } catch {
    return true;
  }
}

// SAN en inglés → la notación de acá (R rey, D dama, T torre, A alfil, C caballo).
const PIEZA_ES: Record<string, string> = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
function sanEspanol(san: string): string {
  return san.replace(/^[KQRBN]/, (p) => PIEZA_ES[p]).replace(/=([QRBN])/, (_m, p) => "=" + PIEZA_ES[p]);
}
const sinSignos = (s: string) => s.replace(/[+#!?]+$/, "");

const NOMBRE_PIEZA: Record<string, string> = { k: "rey", q: "dama", r: "torre", b: "alfil", n: "caballo", p: "peón" };
// Las piezas de cada bando, escritas: al modelo le cuesta leer un FEN, y una
// lista evita que «vea» una pieza que no está.
function piezasEscritas(fen: string): string {
  const filas = fen.split(" ")[0].split("/");
  const de: Record<"w" | "b", string[]> = { w: [], b: [] };
  filas.forEach((fila, i) => {
    let col = 0;
    for (const ch of fila) {
      if (/\d/.test(ch)) { col += Number(ch); continue; }
      const casilla = "abcdefgh"[col] + String(8 - i);
      const lado = ch === ch.toUpperCase() ? "w" : "b";
      de[lado].push(NOMBRE_PIEZA[ch.toLowerCase()] + " en " + casilla);
      col += 1;
    }
  });
  return "Blancas: " + de.w.join(", ") + ".\nNegras: " + de.b.join(", ") + ".";
}

type Puntaje = { cp?: number; mate?: number };
function puntajeTexto(p: Puntaje): string {
  if (typeof p.mate === "number") {
    if (p.mate === 0) return "mate";
    return (p.mate > 0 ? "las blancas dan mate en " : "las negras dan mate en ") + Math.abs(p.mate);
  }
  const v = (Number(p.cp) || 0) / 100;
  const n = (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1).replace(".", ",");
  const a = Math.abs(v);
  const quien = v > 0 ? "las blancas" : "las negras";
  return n + " (" + (a < 0.3 ? "igualado" : a < 1 ? quien + " están algo mejor" : a < 2.5 ? quien + " están mejor" : quien + " están ganando") + ")";
}

// Las líneas, rejugadas con chess.js. null si el FEN o alguna jugada no vale.
function rejugar(fen: string, lineas: unknown[]): { san: string[]; puntaje: Puntaje }[] | null {
  const prueba = new Chess();
  if (!prueba.validate_fen(fen).valid) return null;
  const salida: { san: string[]; puntaje: Puntaje }[] = [];
  for (const L of lineas) {
    const l = L as { pv?: unknown; puntaje?: unknown };
    if (!Array.isArray(l.pv) || !l.pv.length || l.pv.length > MAX_JUGADAS) return null;
    const p = (l.puntaje ?? {}) as Puntaje;
    const puntaje: Puntaje = typeof p.mate === "number" && Number.isInteger(p.mate) && Math.abs(p.mate) < 100
      ? { mate: p.mate }
      : typeof p.cp === "number" && Number.isFinite(p.cp) && Math.abs(p.cp) <= 100000 ? { cp: Math.round(p.cp) } : {};
    if (puntaje.mate == null && puntaje.cp == null) return null;
    const juego = new Chess(fen);
    const san: string[] = [];
    for (const u of l.pv) {
      if (typeof u !== "string" || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u)) return null;
      const m = juego.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] as "q" | undefined });
      if (!m) return null;
      san.push(sanEspanol(m.san));
    }
    salida.push({ san, puntaje });
  }
  return salida;
}

function lineaConNumeros(fen: string, san: string[]): string {
  const partes = fen.split(" ");
  const juegan = partes[1] === "b" ? 1 : 0;
  const n0 = Number(partes[5]) || 1;
  return san.map((s, i) => {
    const ply = juegan + i;
    const num = n0 + Math.floor(ply / 2);
    return ply % 2 === 0 ? num + ". " + s : i === 0 ? num + "… " + s : s;
  }).join(" ");
}

// Las jugadas que aparecen en un texto: de pieza (en la notación de acá o en
// inglés, que también se rechaza), capturas de peón y enroques.
const JUGADA_PIEZA = /(?<![\wáéíóúñ])[RDTACKQBN][a-h]?[1-8]?x?[a-h][1-8](?:=[DTACQRBN])?[+#]?(?![\wáéíóúñ])/g;
const CAPTURA_PEON = /(?<![\wáéíóúñ])[a-h]x[a-h][1-8](?:=[DTACQRBN])?[+#]?(?![\wáéíóúñ])/g;
const ENROQUE = /(?<![\w-])O-O(?:-O)?[+#]?(?![\w-])/g;
export function jugadasAjenas(texto: string, permitidas: Set<string>): string[] {
  const halladas = [
    ...(texto.match(JUGADA_PIEZA) ?? []),
    ...(texto.match(CAPTURA_PEON) ?? []),
    ...(texto.match(ENROQUE) ?? []),
  ];
  return halladas.filter((j) => !permitidas.has(sinSignos(j)));
}

const SISTEMA = `Eres profesor de ajedrez en una academia de Costa Rica. Un alumno está estudiando una posición y el motor Stockfish ya la analizó. Tu trabajo es explicarle con palabras lo que dicen esas líneas: qué busca la mejor jugada, qué amenaza o qué evita, y por qué las otras líneas valen lo que valen.

Reglas, sin excepción:
- Las líneas del motor son correctas: no las contradigas ni cambies sus evaluaciones.
- Menciona SOLO jugadas que aparezcan en las líneas que te paso, escritas igual que ahí. No propongas otras jugadas, otras variantes ni otras respuestas del rival. Si quieres hablar de una idea que no está en las líneas, descríbela con palabras («llevar el caballo hacia el flanco de rey»), sin escribir la jugada.
- Usa la notación de acá: R rey, D dama, T torre, A alfil, C caballo; los peones sin letra.
- Solo hay en el tablero las piezas de la lista. No hables de piezas que no están.
- Español latinoamericano, tuteando (nunca voseo), con palabras sencillas para un alumno de club. Usa los nombres de la región: tenedor (nunca «horquilla»), clavada, enfilada, ataque doble, rayos X, mate del pasillo.
- Texto plano: sin negritas, sin asteriscos, sin títulos ni listas. Dos o tres párrafos cortos, máximo 900 caracteres en total.
- Devuelve solo la explicación, sin saludo ni comentarios antes o después.`;

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
  if (sesionAMedias(userData.user.factors as { status: string }[] | undefined, jwt)) {
    return json({ error: "Falta el segundo paso de la verificación: vuelve a entrar." }, 401);
  }
  const usuario = userData.user.id;

  const fen = typeof body.fen === "string" ? body.fen.trim() : "";
  const lineasCrudas = Array.isArray(body.lineas) ? body.lineas : [];
  if (!fen || fen.length > 100 || !lineasCrudas.length || lineasCrudas.length > MAX_LINEAS) {
    return json({ error: "Primero deja que el motor termine de analizar la posición." }, 400);
  }
  const lineas = rejugar(fen, lineasCrudas);
  if (!lineas) return json({ error: "Las líneas del motor no corresponden a esta posición. Vuelve a analizarla." }, 400);

  const { data: conf, error: confError } = await admin.rpc("ia_para_explicar", { p_usuario: usuario });
  const c = Array.isArray(conf) ? conf[0] : conf;
  if (confError || !c || !c.modelo) return json({ error: "no_disponible" }, 403);
  if (Number(c.usadas_hoy) >= Number(c.tope_dia)) {
    return json({ error: "tope_dia", mensaje: "Ya usaste las explicaciones de hoy. Mañana tienes más." }, 429);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "Explícame esta posición todavía no está configurado." }, 503);

  const juegan = fen.split(" ")[1] === "b" ? "las negras" : "las blancas";
  const pedidoTexto = [
    "Posición (FEN): " + fen,
    "Juegan " + juegan + ".",
    piezasEscritas(fen),
    "",
    "Líneas de Stockfish (la evaluación va desde las blancas; la primera es la mejor):",
    ...lineas.map((L, i) => (i + 1) + ") " + puntajeTexto(L.puntaje) + ": " + lineaConNumeros(fen, L.san)),
  ].join("\n");

  const modelo = String(c.modelo);
  const conThinking = modelo !== "claude-haiku-4-5";
  const maxTokens = conThinking ? 4000 : 1200;
  const [pin, pout] = precioDe(modelo);
  const peor = ((SISTEMA.length + pedidoTexto.length) / 3 * pin + maxTokens * pout) / 1e6;
  if (Number(c.restante_usd) < peor) return json({ error: "no_disponible" }, 403);

  const client = new Anthropic({ apiKey });
  const pedido = {
    model: modelo,
    max_tokens: maxTokens,
    system: SISTEMA,
    messages: [{ role: "user" as const, content: pedidoTexto }],
    ...(conThinking ? { output_config: { effort: "low" as const } } : {}),
  };

  const base = { academia_id: c.academia_id ?? null, usuario_id: usuario, que: "explicar_posicion" };
  let respuesta: Anthropic.Message;
  try {
    respuesta = modelo === "claude-opus-5"
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
    return json({ error: "No se pudo explicar la posición ahora. Prueba otra vez en un rato." }, 502);
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
    .replace(/\*\*/g, "")
    .trim();

  let detalle: string | null = null;
  if (respuesta.stop_reason === "refusal" || respuesta.stop_reason === "max_tokens" || !texto) {
    detalle = `stop_reason: ${respuesta.stop_reason}`;
  } else if (texto.length > MAX_CARACTERES) {
    detalle = "demasiado largo: " + texto.length;
  } else {
    const permitidas = new Set(lineas.flatMap((L) => L.san.map(sinSignos)));
    const ajenas = jugadasAjenas(texto, permitidas);
    if (ajenas.length) detalle = "jugadas que no están en las líneas: " + ajenas.slice(0, 5).join(" ");
  }
  await anotar({
    ...base, modelo: servido, tokens_entrada: entrada, tokens_salida: salida,
    costo_usd: costo, ok: !detalle, detalle,
  });

  if (detalle) {
    return json({ error: "La explicación no salió bien, así que no te la mostramos. Prueba otra vez." }, 422);
  }
  return json({ ok: true, texto, quedan: Math.max(Number(c.tope_dia) - Number(c.usadas_hoy) - 1, 0) });
});
