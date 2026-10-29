/* ranking-estudiantil.html: el «Ranking estudiantil por categoría», en el
   navegador, con los datos armados a mano de verificar-ranking-estudiantil.js
   servidos en lugar de data/ajedrez-estudiantil*.json (los de verdad cambian
   cada mes).

   Lo que comprueba:
   - el ranking en la tabla, con lo que llegó escrito y el enlace al
     historial de cada estudiante;
   - los filtros cambian el ranking y quedan en la dirección, y un enlace con
     los filtros abre ese ranking;
   - la búsqueda por nombre o colegio;
   - el Excel trae la misma lista;
   - a 390 px no se desplaza a lo ancho y no hay errores en la página.

   Ver «Ranking estudiantil por categoría» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js ranking-estudiantil-pagina       */
"use strict";
const { chromium } = require("playwright");
const fs = require("fs");
const { archivos } = require("./verificar-ranking-estudiantil.js");

const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a === b) console.log("  ✓ " + nombre);
    else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}

(async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    for (const [ruta, cuerpo] of Object.entries(archivos)) {
        await ctx.route("**/" + ruta + "*", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(cuerpo) }));
    }
    await ctx.route(/sentry|googletagmanager/, (r) => r.abort());
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    const filas = () => p.$$eval("#re-tabla tbody tr", (l) => l.map((tr) => [...tr.children].map((td) => td.textContent.trim())));

    console.log("\n=== El ranking ===");
    await p.goto(BASE + "/ranking-estudiantil.html", { waitUntil: "load" });
    await p.waitForSelector("#re-tabla tbody tr");
    igual("sin filtros en la dirección: el último año, la primera categoría y la rama abierta", [await p.inputValue("#re-anio"), await p.inputValue("#re-categoria"), await p.inputValue("#re-rama")], ["2026", "C", "Abierta"]);
    await p.selectOption("#re-categoria", "D");
    igual("la categoría D abierta de 2026, en orden", (await filas()).map((f) => f.slice(0, 2).concat(f[4])),
        [["1", "Beto", "1.º de 3 en la Nacional"], ["2", "Dora", "2.º de 3 en la Nacional"], ["3", "Ciro", "3.º de 3 en la Nacional"], ["4", "Ana", "1.º de 3 en la Regional"], ["5", "Eva", "2.º de 2 en la Regional"]]);
    igual("cada nombre lleva a su historial", await p.$eval("#re-tabla tbody tr a", (a) => a.getAttribute("href")), "historial-jugador.html?j=beto");
    igual("los puntos del año, de cuántas partidas", (await filas())[0][5], "8 de 10");
    igual("y arriba, dicho en una frase", await p.textContent("#re-tesis"), "5 estudiantes en la categoría D abierta de 2026. En el primer lugar, Beto: 1.º de 3 en la Nacional.");

    console.log("\n=== Filtros y dirección ===");
    await p.selectOption("#re-region", "Cartago");
    igual("la región Cartago", (await filas()).map((f) => f[1]), ["Dora", "Eva"]);
    igual("y queda en la dirección", new URL(p.url()).search, "?anio=2026&categoria=D&rama=Abierta&region=Cartago");
    await p.goto(BASE + "/ranking-estudiantil.html?anio=2026&categoria=D&rama=Femenina", { waitUntil: "load" });
    await p.waitForSelector("#re-tabla tbody tr");
    igual("un enlace con los filtros abre ese ranking", [await p.inputValue("#re-rama"), (await filas()).map((f) => f[1])], ["Femenina", ["Fito"]]);
    await p.selectOption("#re-rama", "Abierta");
    await p.fill("#re-buscar", "ctp b");
    igual("la búsqueda, por colegio y sin mayúsculas", (await filas()).map((f) => f[1]), ["Dora", "Ciro", "Eva"]);
    await p.fill("#re-buscar", "");

    console.log("\n=== Excel ===");
    const [d] = await Promise.all([p.waitForEvent("download"), p.click("#re-excel")]);
    const texto = fs.readFileSync(await d.path()).toString("utf8");
    igual("el Excel, con su nombre y los cinco", [d.suggestedFilename(), ["Beto", "Dora", "Ciro", "Ana", "Eva"].every((n) => texto.includes(">" + n + "<"))], ["ranking-jde-2026-D-abierta.xlsx", true]);

    console.log("\n=== En el celular ===");
    await p.setViewportSize({ width: 390, height: 800 });
    igual("la página no se desplaza a lo ancho", await p.evaluate(() => document.documentElement.scrollWidth), 390);
    igual("sin errores en la página", errores, []);

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
