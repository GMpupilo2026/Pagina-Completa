/* Comprueba en el navegador jdn-proyeccion.html (la proyección JDN por
   comité), con un doble de Supabase y datos inventados de jdn_inscripciones
   y de «Ajedrez estudiantil» (data/ajedrez-estudiantil*.json):

   - quien no administra ve el candado y no pide los inscritos;
   - quien administra ve la tabla general: un comité mío (San José, con ⭐)
     primero, después Alajuela; U-12/U-16/U-20, registrados, en trámite y no
     convocados contados bien, y el cuerpo técnico no cuenta como atleta;
   - «activos 2026» solo cuenta a quien se le encontró un torneo con ese año
     en los datos de Ajedrez estudiantil, y dice «n de m» sobre quienes se
     pudo buscar, no sobre el total;
   - la ficha de un comité lista a sus atletas con su categoría, el estado del
     trámite escrito (no solo el color) y el enlace a su historial si se
     encontró a alguien.

   Ver «Proyección JDN por comité» en docs/decisiones/juegos-y-torneos.md.

   Uso:  node herramientas/verificar-jdn-proyeccion.js   (con el sitio en el 8777) */
"use strict";
const { chromium } = require("./lib/playwright-con-sesion");

const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
    else console.log("  ✓ " + nombre);
}

const FILAS = [];
function fila(comite, tipo, nombre, categoria, estado) { FILAS.push({ comite, tipo, nombre, categoria, estado }); }
fila("San José", "Atleta", "Mora Vargas, Ana", "U-12 INDIVIDUAL", "REGISTRADO");
fila("San José", "Atleta", "Solis Rojas, Juan", "U-16 POR EQUIPOS", "PASE CANTONAL");
fila("San José", "Atleta", "Quesada Mena, Eva", "U-20 INDIVIDUAL", "NO CONVOCATORIA");
fila("San José", "Entrenador", "Perez Soto, Carlos", "CUERPO TÉCNICO", "REGISTRADO");
fila("Alajuela", "Atleta", "Rojas Arias, Luis", "U-12 POR EQUIPOS", "APROBADO ICODER");
fila("Alajuela", "Atleta", "Brenes Soto, Laura", "U-16 INDIVIDUAL", "DEBEN CORREGIR LO SOLICITADO");

const T = (clave, anio) => [clave, anio, "Regional", "C", "JDE de prueba " + anio, anio + "-05-01", "", "", 10, 5, "Individual", "Clásico"];
const TORNEOS = {
    actualizado: "2026-10-08",
    columnas: ["clave", "anio", "etapa", "categoria", "nombre", "inicio", "lugar", "region", "jugadores", "rondas", "modalidad", "ritmo"],
    torneos: [T(201, 2026), T(202, 2024)],
};
const JUGADORES = {
    actualizado: "2026-10-08",
    jugadores: [["Mora Vargas, Ana", "mora vargas ana"], ["Solis Rojas, Juan", "solis rojas juan"], ["Brenes Soto, Laura", "brenes soto laura"]],
    instituciones: [],
    columnas_participaciones: ["clave", "jugador", "institucion", "puesto", "puntos", "elo"],
    // Ana jugó en 2026 (activa); Juan solo en 2024 (se le encuentra, pero no activo); a Eva no se le encuentra.
    participaciones: [[201, 0, null, 1, 4, null], [202, 1, null, 2, 3, null], [201, 2, null, 1, 5, null]],
    columnas_equipos: ["clave", "institucion", "puesto", "puntos"],
    equipos: [],
};

function doble(esAdmin) {
    return `
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const FILAS = ${JSON.stringify(FILAS)};
  const ADMIN = ${esAdmin ? "true" : "false"};
  window.__pedidos = [];
  function respuesta(data, error) { return Promise.resolve({ data, error: error || null }); }
  function consulta(tabla) {
    const q = { _tabla: tabla, _desde: 0, _hasta: 999 };
    ["select", "eq", "order", "in", "update", "insert", "single", "maybeSingle", "limit"].forEach((m) => { q[m] = () => q; });
    q.range = (a, b) => { q._desde = a; q._hasta = b; return q; };
    q.then = (ok, mal) => {
      let data = [];
      if (tabla === "jdn_inscripciones") {
        window.__pedidos.push("jdn_inscripciones " + q._desde);
        data = ADMIN ? FILAS.slice(q._desde, Math.min(q._hasta + 1, q._desde + 1000)) : [];
      }
      return Promise.resolve({ data, error: null }).then(ok, mal);
    };
    return q;
  }
  window.sb = {
    auth: {
      getSession: () => respuesta({ session: { user: { id: "yo" }, access_token: "x" } }),
      getUser: () => respuesta({ user: { id: "yo" } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      mfa: { getAuthenticatorAssuranceLevel: () => respuesta({ currentLevel: "aal1", nextLevel: "aal1" }), listFactors: () => respuesta({ all: [], totp: [] }) },
    },
    rpc: (nombre) => {
      window.__pedidos.push(nombre);
      if (nombre === "soy_admin") return respuesta(ADMIN);
      return respuesta(null);
    },
    from: (t) => consulta(t),
    functions: { invoke: () => respuesta(null) },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
    removeChannel: () => {},
  };
  window.supabase = { createClient: () => window.sb };
})();`;
}

async function abrir(browser, ruta, esAdmin) {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble(esAdmin) }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route("**/data/ajedrez-estudiantil.json*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TORNEOS) }));
    await ctx.route("**/data/ajedrez-estudiantil-jugadores.json*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(JUGADORES) }));
    await ctx.route(/supabase\.co|sentry|googletagmanager/, (r) => r.abort());
    const p = await ctx.newPage();
    p.on("pageerror", (e) => { console.log("  ✗ error en la página: " + e.message); fallos++; });
    await p.goto(BASE + "/" + ruta, { waitUntil: "load" });
    return { ctx, p };
}
const visible = (p, sel) => p.$eval(sel, (e) => e.checkVisibility());
const filasTabla = (p) => p.$$eval("#tabla-comites tbody tr", (trs) => trs.map((t) => [...t.cells].map((c) => c.textContent.trim())));

(async () => {
    const browser = await chromium.launch();

    console.log("\n=== Quien no administra ===");
    let { ctx, p } = await abrir(browser, "jdn-proyeccion.html", false);
    await p.waitForFunction(() => !document.getElementById("loading").checkVisibility());
    igual("se ve el candado y no la página", [await visible(p, "#denegado"), await visible(p, "#app")], [true, false]);
    igual("no pide los inscritos", await p.evaluate(() => window.__pedidos.filter((x) => x.startsWith("jdn_inscripciones")).length), 0);
    await ctx.close();

    console.log("\n=== Quien administra: la tabla general ===");
    ({ ctx, p } = await abrir(browser, "jdn-proyeccion.html", true));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    const m = await filasTabla(p);
    igual("San José (el mío) va primero, con ⭐, después Alajuela",
        m.map((f) => f[0]), ["⭐ San José", "Alajuela"]);
    igual("San José: U-12 1, U-16 1, U-20 1, total 3, registrados 1, en trámite 1, no convocados 1",
        m[0].slice(1, 8), ["1", "1", "1", "3", "1", "1", "1"]);
    igual("el cuerpo técnico (Carlos) no suma como atleta de San José", m[0][4], "3");
    igual("Alajuela: U-12 1, U-16 1, U-20 0, total 2, registrados 0, en trámite 2, no convocados 0",
        m[1].slice(1, 8), ["1", "1", "0", "2", "0", "2", "0"]);
    igual("San José: activos 2026 es «1 de 2» (Ana activa, Juan encontrado pero no activo, Eva sin dato no cuenta)",
        m[0][8], "1 de 2");
    igual("Alajuela: activos 2026 es «1 de 1» (Laura activa, Luis sin dato no cuenta)", m[1][8], "1 de 1");

    console.log("\n=== La ficha de un comité ===");
    await p.click("#tabla-comites button:text-is('⭐ San José')");
    await p.waitForFunction(() => document.getElementById("ficha").checkVisibility());
    igual("abre la ficha de San José y esconde la tabla general", [await visible(p, "#ficha"), await visible(p, "#general")], [true, false]);
    igual("el enlace lleva el comité", await p.evaluate(() => location.hash), "#san-jose");
    const filaAna = await p.$eval("#ficha tbody tr:has-text('Mora Vargas')", (t) => [...t.cells].map((c) => c.textContent.trim()));
    igual("a Ana se le ve el estado escrito (no solo el color) y el enlace de activa en 2026",
        [filaAna[2], /Sí, ver historial/.test(filaAna[3])], ["✅ Registrado", true]);
    const filaEva = await p.$eval("#ficha tbody tr:has-text('Quesada Mena')", (t) => [...t.cells].map((c) => c.textContent.trim()));
    igual("a Eva (sin dato en Ajedrez estudiantil) le dice «Sin dato», no que no esté activa",
        [filaEva[2], filaEva[3]], ["⬛ No convocado", "Sin dato"]);
    await ctx.close();

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
