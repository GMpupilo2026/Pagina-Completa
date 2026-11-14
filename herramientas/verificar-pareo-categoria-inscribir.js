/* Pareo Integral: la categoría al inscribir a un jugador a mano se elige de una
 * lista (js/pareo/pagina.js, categoriasParaInscribir y pintarCategorias):
 *
 *   - en un torneo de los JDE, sin fecha de nacimiento salen las cinco (A–E) y
 *     la nota pide elegirla; con la fecha, solo las que le permite su año
 *     (Normativa, art. 17): una sola se pone sola, nacido en 2013 salen B y C
 *     (la del torneo primero), una que no le toca se dice, y quien no entra en
 *     ninguna también;
 *   - en otro torneo, las categorías que ya tienen sus jugadores, sin nota.
 *
 * Se mide lo que se ve (checkVisibility) y las opciones del <datalist>.
 *
 *     node herramientas/verificar-todo.js pareo-categoria-inscribir
 */
"use strict";
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const ok = JSON.stringify(hallado) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log((ok ? "  ✓ " : "  ✗ ") + nombre + (ok ? "" : "\n      esperado: " + JSON.stringify(esperado) + "\n      hallado:  " + JSON.stringify(hallado)));
}

function torneo(nombre, extra, jugadores) {
  const t = T.nuevo(Object.assign({ nombre, fechaInicio: "2026-11-22", rondasTotales: 5, jugadores }, extra));
  return t;
}

async function abrir(browser, t) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
  await ctx.route(/supabase\.co|sentry|googletagmanager|cloudflareinsights/, (r) => r.abort());
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));
  await p.addInitScript((x) => {
    localStorage.setItem("pareo_lista_v1", JSON.stringify([{ id: "tc", nombre: x.nombre, actualizado: 1 }]));
    localStorage.setItem("pareo_torneo_v1_tc", JSON.stringify(x));
    localStorage.setItem("pareo_abierto_v1", "tc");
  }, t);
  await p.goto(BASE + "/pareo.html");
  await p.click("#pi-f-jugadores");
  await p.waitForSelector("#pi-form-jugador input[name=categoria]", { state: "visible" });
  return { ctx, p, errores };
}

const leer = (p) => p.evaluate(() => {
  const nota = document.getElementById("pi-categoria-nota");
  const campo = document.querySelector("#pi-form-jugador input[name=categoria]");
  return {
    opciones: [...document.querySelectorAll("#pi-categorias option")].map((o) => o.value),
    valor: campo.value,
    lista: campo.getAttribute("list"),
    nota: nota.checkVisibility() ? nota.textContent : null,
  };
});
async function nacio(p, fecha) {
  await p.fill("#pi-form-jugador input[name=nacimiento]", fecha);
  await p.dispatchEvent("#pi-form-jugador input[name=nacimiento]", "change");
}

(async () => {
  const browser = await chromium.launch();
  try {
    console.log("Un torneo de los JDE (Categoría B):");
    {
      const t = torneo("JDE Individual Categoría B Abierto", { evento: { id: "ev1", nombre: "Regional", jde: { anio: 2026, etapa: "regional", lugar: "San José Central" } } }, []);
      const { ctx, p, errores } = await abrir(browser, t);
      let v = await leer(p);
      igual("el campo despliega la lista; sin fecha, las cinco categorías (la del torneo primero) y la nota pide elegir", [v.lista, v.opciones, !!v.nota && v.nota.includes("Elige la categoría")], ["pi-categorias", ["B", "A", "C", "D", "E"], true]);
      await nacio(p, "2015-03-01");
      v = await leer(p);
      igual("nacido en 2015: solo la B, puesta sola, y la nota lo dice", [v.opciones, v.valor, v.nota], [["B"], "B", "Nació en 2015: puede jugar en la categoría B (Normativa de los JDE, art. 17)."]);
      await p.fill("#pi-form-jugador input[name=categoria]", "");
      await nacio(p, "2013-05-01");
      v = await leer(p);
      igual("nacido en 2013: B o C (la del torneo primero), sin ponerla sola", [v.opciones, v.valor, v.nota], [["B", "C"], "", "Nació en 2013: puede jugar en la categoría B o C (Normativa de los JDE, art. 17)."]);
      await p.fill("#pi-form-jugador input[name=categoria]", "D");
      v = await leer(p);
      igual("si escribe una que no le toca, se dice", v.nota, "Nació en 2013: le corresponde la categoría B o C, no la D (art. 17 y 18; en individual no se sube de categoría).");
      await nacio(p, "2022-01-10");
      v = await leer(p);
      igual("quien no entra en ninguna: lista vacía y se dice", [v.opciones, v.nota], [[], "Nació en 2022: no entra en ninguna categoría de los JDE de 2026. Revisa la fecha."]);
      igual("sin errores de la página", errores, []);
      await ctx.close();
    }
    console.log("\nOtro torneo:");
    {
      const t = torneo("Tacho Chess de prueba", {}, [
        { id: "a", nombre: "PRUEBA A", categoria: "2do Ciclo", retiradoDespuesDe: null },
        { id: "b", nombre: "PRUEBA B", categoria: "1er Ciclo", retiradoDespuesDe: null },
        { id: "c", nombre: "PRUEBA C", categoria: "1er Ciclo", retiradoDespuesDe: null },
      ]);
      const { ctx, p, errores } = await abrir(browser, t);
      await nacio(p, "2015-03-01");
      const v = await leer(p);
      igual("salen las categorías que ya tienen sus jugadores, sin nota de los JDE", [v.opciones, v.valor, v.nota], [["1er Ciclo", "2do Ciclo"], "", null]);
      igual("sin errores de la página", errores, []);
      await ctx.close();
    }
  } finally { await browser.close(); }
  console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
