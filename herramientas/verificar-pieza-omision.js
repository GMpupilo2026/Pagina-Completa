#!/usr/bin/env node
/* El estilo de pieza por omisión de la cuenta: «Clásico ilustrado» para
 * quien da clase (profesor o administración) y para el alumno cuya cuenta se
 * creó desde el corte; los alumnos de antes siguen con el de siempre, y lo
 * que alguien eligió a mano no se toca.
 *
 * Abre configuracion.html con un doble de Supabase (window.sb puesto antes de
 * cargar) y mira qué quedó guardado, qué tarjeta de «Estilo de pieza» quedó
 * marcada y si la vista previa sale dibujada.
 *
 *   Uso: con el sitio en localhost:8777,  node herramientas/verificar-pieza-omision.js
 */
const { chromium } = require("./lib/playwright-con-sesion");

const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function ok(cond, msg) {
  console.log((cond ? "  ✓ " : "  ✗ ") + msg);
  if (!cond) fallos++;
}

const CASOS = [
  { nombre: "profesor de antes", perfil: { role: "profesor", is_admin: false, created_at: "2024-01-10T15:00:00Z" }, espera: "ilustrado" },
  { nombre: "administración", perfil: { role: "alumno", is_admin: true, created_at: "2023-05-01T15:00:00Z" }, espera: "ilustrado" },
  { nombre: "alumno nuevo", perfil: { role: "alumno", is_admin: false, created_at: "2026-10-04T06:00:00Z" }, espera: "ilustrado" },
  { nombre: "alumno de antes", perfil: { role: "alumno", is_admin: false, created_at: "2026-10-04T05:59:59Z" }, espera: "clasico" },
  { nombre: "profesor que eligió símbolos", perfil: { role: "profesor", is_admin: false, created_at: "2024-01-10T15:00:00Z" }, elegido: "clasico", espera: "clasico" },
  { nombre: "alumno nuevo que eligió el aro", perfil: { role: "alumno", is_admin: false, created_at: "2026-11-01T15:00:00Z" }, elegido: "aro", espera: "aro" },
  { nombre: "profesor en Modo Adaptado", perfil: { role: "profesor", is_admin: false, created_at: "2024-01-10T15:00:00Z" }, adaptado: true, espera: null },
];

(async () => {
  const b = await chromium.launch({ args: ["--no-sandbox"] });
  for (const c of CASOS) {
    const ctx = await b.newContext({ serviceWorkers: "block" });
    await ctx.addInitScript(([caso]) => {
      if (caso.elegido) localStorage.setItem("piece_style_theme_v1", caso.elegido);
      if (caso.adaptado) localStorage.setItem("oscarBlindMode_v1", "1");
      const usuario = { id: "persona-1", email: "persona@ejemplo.com" };
      const perfil = Object.assign({ id: "persona-1", full_name: "Persona" }, caso.perfil);
      window.__lecturasPerfil = 0;
      // Cadena que acepta cualquier filtro y se resuelve al final.
      function consulta(tabla) {
        const q = {};
        const resultado = () => {
          if (tabla === "profiles") { window.__lecturasPerfil++; return { data: q._uno ? perfil : [perfil], error: null }; }
          return { data: q._uno ? null : [], error: null, count: 0 };
        };
        const cadena = new Proxy(q, {
          get(t, k) {
            if (k === "then") return (res, rej) => Promise.resolve(resultado()).then(res, rej);
            if (k === "maybeSingle" || k === "single") return () => { q._uno = true; return cadena; };
            if (k in t) return t[k];
            return () => cadena;
          },
        });
        return cadena;
      }
      window.sb = {
        auth: {
          getSession: async () => ({ data: { session: { user: usuario, access_token: "x" } }, error: null }),
          getUser: async () => ({ data: { user: usuario }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }) },
        },
        from: consulta,
        rpc: () => consulta("rpc"),
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel() {},
        storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
      };
    }, [c]);
    const page = await ctx.newPage();
    await page.goto(BASE + "/configuracion.html", { waitUntil: "load" });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => {
      const marcada = document.querySelector('#piece-style-theme-grid [aria-checked="true"]');
      const previa = document.querySelector("#piece-style-theme-grid [aria-checked=\"true\"] .chess-piece-svg");
      return {
        guardado: localStorage.getItem("piece_style_theme_v1"),
        marcada: marcada ? marcada.textContent.trim() : null,
        dibujada: !!previa,
        datoPieza: document.documentElement.getAttribute("data-pieza"),
        lecturas: window.__lecturasPerfil,
      };
    });
    const nombreTarjeta = { ilustrado: "Clásico ilustrado", clasico: "Clásico (símbolos)", aro: "Dibujado con aro" };
    if (c.espera === null) {
      ok(r.guardado === null && r.datoPieza === "aro", `${c.nombre}: no se guarda nada y queda el aro del modo (${r.guardado} / ${r.datoPieza})`);
    } else if (c.elegido || c.espera === "clasico") {
      ok(r.guardado === (c.elegido || null), `${c.nombre}: no se toca lo guardado (${r.guardado})`);
      ok(r.marcada && r.marcada.includes(nombreTarjeta[c.espera]), `${c.nombre}: tarjeta marcada «${r.marcada}»`);
    } else {
      ok(r.guardado === c.espera, `${c.nombre}: queda guardado «${c.espera}» (${r.guardado})`);
      ok(r.marcada && r.marcada.includes(nombreTarjeta[c.espera]), `${c.nombre}: en Configuración queda marcada «${r.marcada}»`);
      ok(r.dibujada && r.datoPieza === "ilustrado", `${c.nombre}: la vista previa sale dibujada`);
      // Lo que elija después se respeta: la omisión no vuelve a pisarlo.
      await page.evaluate(() => { localStorage.setItem("piece_style_theme_v1", "clasico"); });
      await page.reload({ waitUntil: "load" });
      await page.waitForTimeout(500);
      const despues = await page.evaluate(() => localStorage.getItem("piece_style_theme_v1"));
      ok(despues === "clasico", `${c.nombre}: si después elige símbolos, se respeta (${despues})`);
    }
    await ctx.close();
  }
  await b.close();
  console.log(fallos ? `\n${fallos} comprobaciones fallaron` : "\nTodo en orden");
  process.exit(fallos ? 1 : 0);
})();
