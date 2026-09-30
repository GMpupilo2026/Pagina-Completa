#!/usr/bin/env node
/* El perfil propio se pide UNA vez por página (window.MiPerfil, en
 * js/supabase-client.js).
 *
 * No necesita red, ni navegador, ni el sitio servido: corre supabase-client.js
 * con un doble de `sb` que cuenta los pedidos a `profiles`.
 *
 * Por qué existe: en la hora pico del 29 de setiembre cada carga pedía la
 * misma fila cuatro veces (la página, juego-aviso.js, burbuja-en-linea.js y
 * ayuda-guia.js, cada uno con sus columnas). Se pierde callado: un módulo
 * nuevo que vuelva a escribir su propio from("profiles") funciona perfecto y
 * solo suma pedidos. Ver «El perfil propio, una lectura por página» en
 * docs/decisiones/sitio-e-infraestructura.md.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");
let fallos = 0;
function ok(cond, msg) {
  if (cond) console.log("  ✓ " + msg);
  else { fallos += 1; console.log("  ✗ " + msg); }
}

function armar(respuesta) {
  const pedidos = [];
  const sb = {
    from(tabla) {
      const q = { tabla, cols: null, id: null };
      const cadena = {
        select(c) { q.cols = c; return cadena; },
        eq(k, v) { q.id = v; return cadena; },
        maybeSingle() { pedidos.push(q); return Promise.resolve(respuesta(q)); },
        single() { pedidos.push(q); return Promise.resolve(respuesta(q)); },
      };
      return cadena;
    },
    auth: { onAuthStateChange(fn) { sb._cambio = fn; } },
  };
  const window = { sb, supabase: { createClient() { throw new Error("no debería crear otro cliente"); } } };
  const ctx = { window, localStorage: { getItem() { return null; } }, location: { protocol: "https:" }, document: { cookie: "" }, Promise, Object, JSON, Math, Date };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, "js/supabase-client.js"), "utf8"), ctx);
  return { window, sb, pedidos };
}

(async () => {
  console.log("=== MiPerfil: una lectura por página ===");
  {
    const { window, pedidos } = armar(() => ({ data: { id: "yo", role: "profesor", is_admin: false }, error: null }));
    const r = await Promise.all([1, 2, 3, 4].map(() => window.MiPerfil.obtener("yo")));
    ok(pedidos.length === 1, `cuatro pedidos a la vez salen como uno solo a la base (salieron ${pedidos.length})`);
    ok(pedidos[0] && pedidos[0].tabla === "profiles" && pedidos[0].cols === "*" && pedidos[0].id === "yo",
      "pide la fila entera de quien entró");
    ok(r.every((x) => x.data && x.data.role === "profesor" && !x.error), "los cuatro reciben el perfil");
    r[0].data.role = "cambiado";
    ok(r[1].data.role === "profesor", "a cada uno le toca su copia: cambiar una no cambia las otras");
    const otra = await window.MiPerfil.obtener("yo");
    ok(pedidos.length === 1 && otra.data.role === "profesor", "el que llega después usa lo guardado, sin tocarlo");
  }
  {
    let n = 0;
    const { window, pedidos } = armar(() => (++n === 1 ? { data: null, error: { message: "sin red" } } : { data: { id: "yo" }, error: null }));
    const a = await window.MiPerfil.obtener("yo");
    ok(a.error && !a.data, "si la lectura falla, se devuelve el error");
    const b = await window.MiPerfil.obtener("yo");
    ok(pedidos.length === 2 && b.data && b.data.id === "yo", "y no se guarda: el siguiente vuelve a intentar");
  }
  {
    const { window, sb, pedidos } = armar(() => ({ data: { id: "yo" }, error: null }));
    await window.MiPerfil.obtener("yo");
    sb._cambio("SIGNED_OUT", null);
    await window.MiPerfil.obtener("yo");
    ok(pedidos.length === 2, "al salir de la cuenta se olvida");
    const vacio = await window.MiPerfil.obtener(null);
    ok(pedidos.length === 2 && vacio.data === null, "sin sesión no se pide nada");
  }

  console.log("\n=== Los que piden el perfil propio lo piden por MiPerfil ===");
  for (const f of ["js/juego-aviso.js", "js/burbuja-en-linea.js", "js/ayuda-guia.js", "js/modo-vista.js", "js/clases.js", "js/sesion.js"]) {
    const src = fs.readFileSync(path.join(RAIZ, f), "utf8");
    ok(/window\.MiPerfil\.obtener\(/.test(src), `${f} usa MiPerfil.obtener`);
  }

  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
