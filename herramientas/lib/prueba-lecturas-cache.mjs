// Lo corre herramientas/verificar-lecturas-cache.js con `node --experimental-strip-types`:
// prueba supabase/functions/_compartido/lecturas-cache.ts con una base de mentira (en memoria) y una
// «chess-results» de mentira que cuenta cuántas veces la visitan.
import { leerConCache, ponerLectura, aLectura } from "../../supabase/functions/_compartido/lecturas-cache.ts";

let fallos = 0;
const igual = (nombre, hallado, esperado) => {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a === b) console.log("  ✓ " + nombre); else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
};

// Una tabla en memoria con lo mínimo de supabase-js que usa el módulo.
function baseDeMentira() {
  const filas = new Map();
  const dar = (f) => (f ? JSON.parse(JSON.stringify(f)) : null);
  const tabla = {
    select() { return consulta([]); },
    upsert(obj, opc = {}) {
      return Promise.resolve().then(() => {
        const previa = filas.get(obj.tnr);
        if (previa && opc.ignoreDuplicates) return { error: null };
        filas.set(obj.tnr, Object.assign({ ronda: 0, torneo: "", mesas: [], leida: "1970-01-01T00:00:00.000Z", leyendo_hasta: null }, previa || {}, obj));
        return { error: null };
      });
    },
    update(cambios) { return consulta([], cambios); },
  };
  function consulta(filtros, cambios) {
    const q = {
      eq(col, val) { filtros.push((f) => f[col] === val); return q; },
      or(texto) {
        // «leyendo_hasta.is.null,leyendo_hasta.lt.<iso>»
        const partes = texto.split(",");
        filtros.push((f) => partes.some((p) => (p.includes(".is.null") ? f.leyendo_hasta == null : f.leyendo_hasta != null && new Date(f.leyendo_hasta) < new Date(p.split(".lt.")[1]))));
        return q;
      },
      select() { q._devolver = true; return q; },
      maybeSingle() { return Promise.resolve({ data: dar([...filas.values()].find((f) => filtros.every((x) => x(f)))), error: null }); },
      then(ok, mal) {
        const aplica = [...filas.values()].filter((f) => filtros.every((x) => x(f)));
        if (cambios) for (const f of aplica) Object.assign(f, cambios);
        return Promise.resolve({ data: q._devolver ? aplica.map(dar) : null, error: null }).then(ok, mal);
      },
    };
    return q;
  }
  return { from: () => tabla, _filas: filas };
}

const MESAS = [{ mesa: 1, blancas: "Ana", negras: "Beto", valor: "0", campo: "x" }, { mesa: 2, blancas: "Cleo", negras: "Dan", valor: "1", campo: "y" }];
function chessResultsDeMentira({ tarda = 0, cae = false } = {}) {
  const c = { visitas: 0, cae, valor: "0" };
  c.leer = async () => {
    c.visitas++;
    if (tarda) await new Promise((r) => setTimeout(r, tarda));
    if (c.cae) return { estado: 502, error: "chess-results no contestó" };
    return { pantalla: { entro: true, tnr: "1", torneo: "Sub-10", ronda: 3, grupo: "", torneos: [], mesas: MESAS.map((m, i) => (i === 0 ? { ...m, valor: c.valor } : m)) } };
  };
  return c;
}
const ACCESO = { acceso: "G", sid: "S" };

console.log("\n=== La lectura compartida de chess-results ===");
{
  const db = baseDeMentira(), cr = chessResultsDeMentira();
  const a = await leerConCache(db, ACCESO, "1", { maxEdadMs: 40_000, leer: cr.leer });
  igual("la primera lectura va a chess-results y trae las mesas con sus jugadores y resultados (sin los campos internos)", [cr.visitas, a.ok, a.viejo, a.lectura.ronda, a.lectura.torneo, a.lectura.mesas.map((m) => [m.mesa, m.blancas, m.valor, "campo" in m])], [1, true, false, 3, "Sub-10", [[1, "Ana", "0", false], [2, "Cleo", "1", false]]]);
  const b = await leerConCache(db, ACCESO, "1", { maxEdadMs: 40_000, leer: cr.leer });
  igual("la segunda, dentro del tiempo, usa la copia: cero visitas más", [cr.visitas, b.ok, b.viejo], [1, true, false]);
  const f = await leerConCache(db, ACCESO, "1", { maxEdadMs: 0, fresca: true, leer: cr.leer });
  igual("«fresca» (finalizar, el botón de la organización) siempre va a chess-results", [cr.visitas, f.ok], [2, true]);
  db._filas.get("1").leida = new Date(Date.now() - 120_000).toISOString();
  await leerConCache(db, ACCESO, "1", { maxEdadMs: 40_000, leer: cr.leer });
  igual("una copia más vieja que lo permitido se vuelve a leer", cr.visitas, 3);
}
{
  const db = baseDeMentira(), cr = chessResultsDeMentira({ tarda: 400 });
  const rs = await Promise.all(Array.from({ length: 15 }, () => leerConCache(db, ACCESO, "1", { maxEdadMs: 40_000, leer: cr.leer })));
  igual("15 árbitros pidiendo a la vez con la copia vacía: UNA sola visita a chess-results, y los 15 reciben las mesas", [cr.visitas, rs.every((r) => r.ok && r.lectura.mesas.length === 2 && !r.viejo)], [1, true]);
}
{
  const db = baseDeMentira(), cr = chessResultsDeMentira();
  await leerConCache(db, ACCESO, "1", { maxEdadMs: 40_000, leer: cr.leer });
  db._filas.get("1").leida = new Date(Date.now() - 5 * 60_000).toISOString();
  cr.cae = true;
  const v = await leerConCache(db, ACCESO, "1", { maxEdadMs: 40_000, leer: cr.leer });
  igual("si chess-results no contesta, se sirve la última copia y se dice que es vieja y por qué", [v.ok, v.viejo, v.motivo, v.lectura.mesas.length], [true, true, "chess-results no contestó", 2]);
  igual("y el «turno» de leer queda libre para el siguiente intento", db._filas.get("1").leyendo_hasta, null);
  db._filas.get("1").leida = new Date(Date.now() - 45 * 60_000).toISOString();
  const x = await leerConCache(db, ACCESO, "1", { maxEdadMs: 40_000, leer: cr.leer });
  igual("una copia de hace 45 minutos ya no sirve de respaldo: se dice el error", [x.ok, x.estado, x.error], [false, 502, "chess-results no contestó"]);
}
{
  const db = baseDeMentira(), cr = chessResultsDeMentira({ tarda: 100 });
  cr.cae = true;
  const sin = await leerConCache(db, ACCESO, "1", { maxEdadMs: 40_000, leer: cr.leer });
  igual("sin ninguna copia y con chess-results caído, el error sale tal cual (no se inventa nada)", [sin.ok, sin.error], [false, "chess-results no contestó"]);
}
{
  const db = baseDeMentira(), cr = chessResultsDeMentira();
  // Alguien tomó el turno y se cayó: el turno ya venció y otro lo toma.
  await db.from().upsert({ tnr: "1", leyendo_hasta: new Date(Date.now() - 1000).toISOString() }, {});
  const r = await leerConCache(db, ACCESO, "1", { maxEdadMs: 40_000, leer: cr.leer });
  igual("si quien tenía el turno se cayó (venció), otro lo toma y lee", [r.ok, cr.visitas], [true, 1]);
}
{
  const db = baseDeMentira(), cr = chessResultsDeMentira();
  await leerConCache(db, ACCESO, "1", { maxEdadMs: 40_000, leer: cr.leer });
  const despues = { ...aLectura({ ronda: 3, torneo: "Sub-10", mesas: MESAS.map((m, i) => (i === 0 ? { ...m, valor: "2" } : m)) }) };
  await ponerLectura(db, "1", despues);
  const r = await leerConCache(db, ACCESO, "1", { maxEdadMs: 40_000, leer: cr.leer });
  igual("al guardar un resultado la copia se pone al día: la tablet no ve «sin resultado» un rato", [cr.visitas, r.lectura.mesas[0].valor], [1, "2"]);
}

console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron." : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);
