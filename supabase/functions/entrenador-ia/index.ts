// Edge Function: entrenador-ia
//
// El botón «¿Por qué?» que aparece cuando un alumno falla un ejercicio de
// Entrenamiento. Recibe la posición (FEN), la jugada que hizo el alumno y lo
// que YA calculó Stockfish en su navegador: la mejor línea desde la posición y
// cómo sigue el motor después de la jugada del alumno. Devuelve, en palabras
// para un niño, por qué su jugada no era la mejor y qué logra la otra.
//
// QUIÉN DECIDE QUÉ: el análisis es de Stockfish; la IA solo lo cuenta. Por eso
// (el mismo molde de «Explícame esta posición»):
//  - la jugada del alumno y cada jugada de cada línea se vuelven a jugar acá
//    con chess.js: algo ilegal no viaja al modelo, y se rechaza el pedido;
//  - si para el motor la jugada del alumno vale casi lo mismo que la mejor, no
//    se llama al modelo: se le dice que su jugada también servía. El ejercicio
//    guarda UNA solución, y pedirle a la IA que explique «por qué está mal»
//    una jugada buena es pedirle que invente;
//  - la explicación que menciona una jugada de pieza o una captura que NO está
//    en las líneas se rechaza entera. Ninguna jugada se inventa (CLAUDE.md,
//    «Contenido»), tampoco la que escribe la IA.
//
// QUIÉN LO TIENE: solo a quien se lo encendió quien administra, persona por
// persona (`entrenador_ia_personas`). QUÉ MODELO Y CUÁNTO SE PUEDE GASTAR: lo
// mismo que «Mejorar informe» (`academia_ia`), con un tope por persona y por
// día. Todo eso lo contesta `ia_para_entrenador()`, que es solo de la service
// role. Cada llamada se anota en `ia_uso` con `que = entrenador` y lo que
// costó de verdad; también la que falló o se rechazó.
//
// LO QUE VIAJA AL MODELO es la posición y las jugadas. Nada de la persona: ni
// su nombre, ni su edad, ni su grupo, ni de qué ejercicio viene.
//
// Ver «El entrenador de IA» en docs/decisiones/entrenamiento.md.

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

// Los mismos precios que «Mejorar informe» (verificar-entrenador-ia.js falla
// si se separan). Uno que no esté acá se cobra al precio más alto.
const PRECIOS: Record<string, [number, number]> = {
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-5": [2, 10],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
};
const PRECIO_DESCONOCIDO: [number, number] = [10, 50];
const precioDe = (m: string) => PRECIOS[m] ?? PRECIO_DESCONOCIDO;

const MAX_JUGADAS = 8;
const MAX_CARACTERES = 1000;
// Menos de esto (en centésimas de peón) entre la mejor jugada y la del alumno
// no es un error que valga explicar.
const DIFERENCIA_MINIMA = 60;

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

// El puntaje, siempre desde las blancas.
type Puntaje = { cp?: number; mate?: number };
function puntajeLimpio(crudo: unknown): Puntaje | null {
  const p = (crudo ?? {}) as Puntaje;
  if (typeof p.mate === "number" && Number.isInteger(p.mate) && Math.abs(p.mate) < 100) return { mate: p.mate };
  if (typeof p.cp === "number" && Number.isFinite(p.cp) && Math.abs(p.cp) <= 100000) return { cp: Math.round(p.cp) };
  return null;
}
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
// Cuánto vale un puntaje para quien juega (`lado`), en centésimas: un mate a
// favor vale más que cualquier ventaja, y más cuanto más cerca.
export function valorPara(p: Puntaje, lado: "w" | "b"): number {
  const signo = lado === "w" ? 1 : -1;
  if (typeof p.mate === "number") {
    if (p.mate === 0) return 0;
    return signo * Math.sign(p.mate) * (100000 - Math.abs(p.mate) * 100);
  }
  return signo * (Number(p.cp) || 0);
}

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
// Una línea en UCI, rejugada con chess.js desde `fen`. null si algo no vale.
function rejugar(fen: string, pv: unknown, minimo: number): string[] | null {
  if (!Array.isArray(pv) || pv.length < minimo || pv.length > MAX_JUGADAS) return null;
  const juego = new Chess(fen);
  const san: string[] = [];
  for (const u of pv) {
    if (typeof u !== "string" || !UCI.test(u)) return null;
    const m = juego.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] as "q" | undefined });
    if (!m) return null;
    san.push(sanEspanol(m.san));
  }
  return san;
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

const SISTEMA = `Eres profesor de ajedrez en una academia de Costa Rica y le hablas a un niño o a un joven que está aprendiendo. Acaba de fallar un ejercicio y te pregunta «¿por qué?». El motor Stockfish ya analizó la posición: tienes la jugada que él hizo con lo que le contesta el motor, y la mejor jugada con su línea. Tu trabajo es explicarle con palabras, con cariño y sin regañarlo, por qué su jugada no era la mejor y qué logra la otra.

Reglas, sin excepción:
- Las líneas del motor son correctas: no las contradigas ni cambies sus evaluaciones.
- Menciona SOLO jugadas que aparezcan en lo que te paso, escritas igual que ahí. No propongas otras jugadas, otras variantes ni otras respuestas del rival. Si quieres hablar de una idea que no está en las líneas, descríbela con palabras («llevar el caballo hacia el rey»), sin escribir la jugada.
- Usa la notación de acá: R rey, D dama, T torre, A alfil, C caballo; los peones sin letra.
- Solo hay en el tablero las piezas de la lista. No hables de piezas que no están.
- Empieza por lo que su jugada sí intentaba, si se ve, y después di qué le falla. Nada de «error grave» ni «mala jugada»: di qué pasa en el tablero.
- Español latinoamericano, tuteando (nunca voseo), con palabras sencillas y frases cortas. Usa los nombres de la región: tenedor (nunca «horquilla»), clavada, enfilada, ataque doble, rayos X, mate del pasillo.
- Texto plano: sin negritas, sin asteriscos, sin títulos ni listas. Dos párrafos cortos, máximo 600 caracteres en total.
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

  // La posición, la jugada del alumno y las dos líneas del motor: todo se
  // vuelve a jugar acá. Lo que no cuadra no llega al modelo.
  const fen = typeof body.fen === "string" ? body.fen.trim() : "";
  const jugada = typeof body.jugada === "string" ? body.jugada.trim() : "";
  const mejor = (body.mejor ?? {}) as { pv?: unknown; puntaje?: unknown };
  const despues = (body.despues ?? {}) as { pv?: unknown; puntaje?: unknown };
  const noCuadra = () => json({ error: "No se pudo revisar esa jugada. Vuelve a intentarlo en el ejercicio." }, 400);
  if (!fen || fen.length > 100 || !UCI.test(jugada)) return noCuadra();
  if (!new Chess().validate_fen(fen).valid) return noCuadra();
  const lado = fen.split(" ")[1] === "b" ? "b" : "w";
  const tras = new Chess(fen);
  const hecha = tras.move({ from: jugada.slice(0, 2), to: jugada.slice(2, 4), promotion: jugada[4] as "q" | undefined });
  if (!hecha || tras.game_over()) return noCuadra();
  const sanAlumno = sanEspanol(hecha.san);
  const sanMejor = rejugar(fen, mejor.pv, 1);
  const sanDespues = rejugar(tras.fen(), despues.pv, 1);
  const pMejor = puntajeLimpio(mejor.puntaje), pDespues = puntajeLimpio(despues.puntaje);
  if (!sanMejor || !sanDespues || !pMejor || !pDespues) return noCuadra();

  const { data: conf, error: confError } = await admin.rpc("ia_para_entrenador", { p_usuario: usuario });
  const c = Array.isArray(conf) ? conf[0] : conf;
  if (confError || !c || !c.modelo) return json({ error: "no_disponible" }, 403);
  if (Number(c.usadas_hoy) >= Number(c.tope_dia)) {
    return json({ error: "tope_dia", mensaje: "Ya usaste las explicaciones de hoy. Mañana tienes más." }, 429);
  }

  // ¿De verdad su jugada es peor? Si era la misma, o vale casi lo mismo, no
  // hay nada que explicar y no se gasta nada: se le dice la verdad.
  const primeraMejor = (mejor.pv as string[])[0];
  if (primeraMejor === jugada || valorPara(pMejor, lado) - valorPara(pDespues, lado) < DIFERENCIA_MINIMA) {
    return json({
      ok: true, sinGasto: true,
      texto: "Para el motor, tu jugada " + sanAlumno + " también sirve: vale casi lo mismo que la mejor. El ejercicio buscaba otra idea, así que mira la solución y compara las dos.",
      quedan: Math.max(Number(c.tope_dia) - Number(c.usadas_hoy), 0),
    });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "El entrenador de IA todavía no está configurado." }, 503);

  const juegan = lado === "b" ? "las negras" : "las blancas";
  const pedidoTexto = [
    "Posición (FEN): " + fen,
    "Juegan " + juegan + " (es el alumno).",
    piezasEscritas(fen),
    "",
    "Las evaluaciones van desde las blancas.",
    "El alumno jugó " + sanAlumno + ". Después de esa jugada, el motor sigue así: " + lineaConNumeros(tras.fen(), sanDespues) + ". Evaluación: " + puntajeTexto(pDespues) + ".",
    "La mejor jugada era " + sanMejor[0] + ". Su línea: " + lineaConNumeros(fen, sanMejor) + ". Evaluación: " + puntajeTexto(pMejor) + ".",
  ].join("\n");

  const modelo = String(c.modelo);
  const conThinking = modelo !== "claude-haiku-4-5";
  const maxTokens = conThinking ? 4000 : 1000;
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

  const base = { academia_id: c.academia_id ?? null, usuario_id: usuario, que: "entrenador" };
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
    return json({ error: "No se pudo explicar la jugada ahora. Prueba otra vez en un rato." }, 502);
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
    const permitidas = new Set([sanAlumno, ...sanMejor, ...sanDespues].map(sinSignos));
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
