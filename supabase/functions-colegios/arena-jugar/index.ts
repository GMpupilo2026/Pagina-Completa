/* Las jugadas de la sala de arena (sala.html), validadas por el SERVIDOR.
 *
 * Antes el navegador de quien movía decía «mi jugada es esta, la posición
 * queda así y con ella se acabó la partida», y la base creía el FEN y el final
 * (comprobaba el turno, el reloj y la forma del FEN, pero no si la jugada era
 * legal ni si era mate). Desde la consola se podía declarar una victoria que
 * no existía. Ahora el navegador solo manda DE DÓNDE A DÓNDE (y la pieza en que
 * corona) y esta función:
 *
 *   1. saca quién es del TOKEN (nada que viaje en el cuerpo vale como
 *      identidad);
 *   2. repite la partida entera desde el principio con chess.js, con las
 *      jugadas ya guardadas, y comprueba que quede en la posición guardada;
 *   3. comprueba que sea el turno de esa persona y que la jugada sea legal;
 *   4. calcula ELLA el SAN, el FEN y si con esa jugada hubo mate, ahogado,
 *      material insuficiente, repetición o regla de las 50 jugadas;
 *   5. recién entonces llama a `arena_aplicar_jugada()`, que solo la service
 *      role puede ejecutar (la antigua `arena_mover` se borró, así que nadie
 *      puede saltarse esto llamando a la base).
 *
 * El reloj, la bandera, los puntos y el emparejamiento siguen siendo de la
 * base. `verify_jwt` va en false porque el token se comprueba acá, contra Auth.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import chessjs from "npm:chess.js@0.10.3";

// deno-lint-ignore no-explicit-any
const Chess: any = (chessjs as any).Chess ?? chessjs;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CASILLA = /^[a-h][1-8]$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/* Quién es, según Auth. Nada del cuerpo vale como identidad. */
async function usuarioDe(url: string, key: string, jwt: string): Promise<string | null> {
  try {
    const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${jwt}` } });
    if (!res.ok) return null;
    const u = await res.json();
    return typeof u?.id === "string" ? u.id : null;
  } catch (_e) {
    return null;
  }
}

/* El final de la partida que dejó esta jugada. */
// deno-lint-ignore no-explicit-any
function finDe(g: any): string | null {
  if (g.in_checkmate()) return "mate";
  if (g.in_stalemate()) return "ahogado";
  if (g.insufficient_material()) return "material";
  if (g.in_threefold_repetition()) return "repeticion";
  if (g.in_draw()) return "cincuenta";
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Solo se acepta POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Falta la configuración del proyecto." }, 500);

  const cabecera = req.headers.get("Authorization") || "";
  const jwt = cabecera.startsWith("Bearer ") ? cabecera.slice(7).trim() : "";
  if (!jwt) return json({ error: "Falta la sesión. Vuelve a entrar." }, 401);
  const yo = await usuarioDe(url, key, jwt);
  if (!yo) return json({ error: "Tu sesión venció. Vuelve a entrar." }, 401);

  // deno-lint-ignore no-explicit-any
  let cuerpo: any = {};
  try {
    cuerpo = await req.json();
  } catch (_e) {
    return json({ error: "El pedido no es un JSON válido." }, 400);
  }
  const { partida, desde, hasta } = cuerpo ?? {};
  const promocion = cuerpo?.promocion == null ? undefined : String(cuerpo.promocion).toLowerCase();
  if (!UUID.test(String(partida ?? ""))) return json({ error: "Falta la partida." }, 400);
  if (!CASILLA.test(String(desde ?? "")) || !CASILLA.test(String(hasta ?? ""))) {
    return json({ error: "Esa jugada no es válida." }, 400);
  }
  if (promocion !== undefined && !["q", "r", "b", "n"].includes(promocion)) {
    return json({ error: "Esa pieza no existe." }, 400);
  }

  const encabezados = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const lectura = await fetch(`${url}/rest/v1/arena_partidas?select=*&id=eq.${partida}`, { headers: encabezados });
  if (!lectura.ok) return json({ error: "No se pudo leer la partida." }, 502);
  const filas = await lectura.json();
  const fila = Array.isArray(filas) ? filas[0] : null;
  if (!fila) return json({ error: "Esa partida no existe." }, 404);
  if (yo !== fila.blancas && yo !== fila.negras) return json({ error: "No juegas en esta partida." }, 403);
  // Una partida que ya terminó no se mueve: se devuelve como está.
  if (fila.estado !== "en_juego") return json({ ok: true, partida: fila });

  const color = yo === fila.blancas ? "w" : "b";

  // Se repite la partida desde el principio: así valen también la repetición
  // de posición y las 50 jugadas, que dependen de todo lo anterior.
  const g = new Chess();
  for (const j of Array.isArray(fila.jugadas) ? fila.jugadas : []) {
    if (!g.move(String(j?.s ?? ""))) return json({ error: "La partida guardada no se puede repetir." }, 500);
  }
  if (g.fen() !== fila.fen) return json({ error: "La partida guardada no coincide con sus jugadas." }, 500);
  if (g.turn() !== color) return json({ error: "Todavía no es tu turno." }, 400);

  const pedido: { from: string; to: string; promotion?: string } = { from: desde, to: hasta };
  if (promocion) pedido.promotion = promocion;
  const m = g.move(pedido);
  if (!m) {
    // ¿Era una coronación sin la pieza, o una jugada que no existe?
    const hay = new Chess(fila.fen).moves({ square: desde, verbose: true }).some(
      // deno-lint-ignore no-explicit-any
      (x: any) => x.to === hasta,
    );
    return json({ error: hay ? "Elige la pieza en que coronas." : "Esa jugada no es legal." }, 400);
  }

  const res = await fetch(`${url}/rest/v1/rpc/arena_aplicar_jugada`, {
    method: "POST",
    headers: encabezados,
    body: JSON.stringify({
      p_jugador: yo,
      p_partida: fila.id,
      p_desde: m.from,
      p_hasta: m.to,
      p_san: m.san,
      p_fen: g.fen(),
      p_fin: finDe(g),
    }),
  });
  const texto = await res.text();
  // deno-lint-ignore no-explicit-any
  let datos: any = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch (_e) { /* no era JSON */ }
  if (!res.ok) {
    return json({ error: String(datos?.message || "No se pudo guardar la jugada.") }, res.status >= 500 ? 502 : 400);
  }
  return json({ ok: true, partida: datos });
});
