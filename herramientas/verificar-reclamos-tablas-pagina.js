/* reclamos-tablas.html: la página de «Reclamos de tablas desde el PGN», en el
   navegador y sin red (no la necesita: la partida no sale de la computadora).

   Lo que comprueba:
   - con el ejemplo: el resumen dice «Sí» a la triple repetición y «No» a lo
     demás, escrito (no solo con color); la posición repetida sale en un
     diagrama de 64 casillas, con las jugadas en algebraica española;
   - «¿Procedía el reclamo?» viene listo con la primera repetición y dice que
     sí; cambiado a 50 jugadas dice que no, con los dos minutos del 9.5.3;
   - un PGN que no se puede leer da el error y esconde el resultado;
   - un archivo con dos partidas deja elegir cuál;
   - a 390 px no hay desplazamiento horizontal, y la página no da errores.

   Ver «Reclamos de tablas desde el PGN» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js reclamos-tablas-pagina            */
"use strict";
const { chromium } = require("playwright");
const os = require("os"), fs = require("fs"), path = require("path");

const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a === b) console.log("  ✓ " + nombre);
    else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}
const visible = (p, sel) => p.$eval(sel, (e) => e.checkVisibility());

(async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    await ctx.route(/supabase\.co|sentry|googletagmanager/, (r) => r.abort());
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(BASE + "/reclamos-tablas.html", { waitUntil: "load" });

    console.log("\n=== Con el ejemplo ===");
    igual("antes de revisar, no hay resultado", await visible(p, "#rt-resultado"), false);
    await p.click("#rt-ejemplo");
    await p.waitForFunction(() => document.getElementById("rt-resultado").checkVisibility());
    igual("el resumen, escrito: Sí a la triple repetición y No a lo demás",
        await p.$$eval("#rt-resumen > li", (l) => l.map((li) => li.querySelector("p span").textContent)), ["Sí", "No", "No", "No"]);
    igual("dice la jugada en algebraica española",
        (await p.textContent("#rt-resumen > li:first-child")).includes("7… Cc6"), true);
    igual("la posición repetida, en un diagrama de 64 casillas que se ve",
        await p.$eval("#rt-repeticiones li[data-repeticion='1'] .example-board", (b) => [b.querySelectorAll(".example-sq").length, b.checkVisibility(), b.getBoundingClientRect().width > 100]), [64, true, true]);
    igual("y cuándo apareció cada vez",
        (await p.textContent("#rt-repeticiones li[data-repeticion='1']")).includes("después de 3… Ac5; después de 5… Cc6; después de 7… Cc6"), true);

    console.log("\n=== ¿Procedía el reclamo? ===");
    igual("viene listo con la primera repetición: las blancas en la 8",
        [await p.inputValue("#rt-numero"), await p.inputValue("#rt-color"), await p.inputValue("#rt-tipo")], ["8", "w", "repeticion"]);
    await p.click("#rt-form-reclamo button[type=submit]");
    igual("y procedía", await p.$eval("#rt-veredicto > div", (d) => [d.dataset.procede, d.textContent.includes("art. 9.2.1.2")]), ["si", true]);
    await p.selectOption("#rt-tipo", "cincuenta");
    await p.click("#rt-form-reclamo button[type=submit]");
    igual("por 50 jugadas no, con los dos minutos del 9.5.3",
        await p.$eval("#rt-veredicto > div", (d) => [d.dataset.procede, d.textContent.includes("dos minutos"), d.textContent.includes("9.5.3")]), ["no", true, true]);

    console.log("\n=== Lo que llega mal ===");
    await p.fill("#rt-pgn", "1. e4 e5 2. Re3 Cc6");
    await p.click("#rt-revisar");
    igual("una jugada ilegal: el error y sin resultado",
        [await visible(p, "#rt-resultado"), (await p.textContent("#rt-estado")).length > 10], [false, true]);

    console.log("\n=== Un archivo con dos partidas ===");
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rt-")), "dos.pgn");
    fs.writeFileSync(tmp, '[Event "Uno"]\n[White "Ana"]\n[Black "Beto"]\n\n1. e4 e5 *\n\n[Event "Dos"]\n[White "Carla"]\n[Black "Diego"]\n\n1. Cf3 Cf6 2. Cg1 Cg8 3. Cf3 Cf6 4. Cg1 Cg8 *');
    await p.setInputFiles("#rt-archivo", tmp);
    await p.waitForFunction(() => document.getElementById("rt-elegir-caja").checkVisibility());
    igual("se puede elegir cuál, con sus jugadores", await p.$$eval("#rt-elegir option", (o) => o.map((x) => x.textContent)), ["Partida 1: Ana – Beto", "Partida 2: Carla – Diego"]);
    igual("la primera, sin repeticiones", await p.$eval("#rt-resumen > li:first-child p span", (s) => s.textContent), "No");
    await p.selectOption("#rt-elegir", "1");
    igual("la segunda, con la repetición", await p.$eval("#rt-resumen > li:first-child p span", (s) => s.textContent), "Sí");

    console.log("\n=== En el celular ===");
    await p.setViewportSize({ width: 390, height: 800 });
    await p.click("#rt-ejemplo");
    igual("sin desplazamiento horizontal a 390 px", await p.evaluate(() => document.documentElement.scrollWidth), 390);
    igual("sin errores en la página", errores, []);

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
