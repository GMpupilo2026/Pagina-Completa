/* bases-torneo.html: el «Generador de bases del torneo», en el navegador.
   Gratis y sin cuenta: no hay doble de Supabase porque la página no toca la
   base; se bloquea toda red que no sea el sitio para comprobarlo.

   Lo que comprueba:
   - sin nada llenado, «Antes de bajar» dice lo que falta y «Bajar en PDF»
     no baja nada (avisa);
   - con lo mínimo, la vista previa trae el título, la fecha y el calendario;
   - cambiar a todos contra todos propone los desempates de ese sistema y
     esconde los byes; los desempates se suben, se bajan y se quitan;
   - el PDF y el Word se bajan con la marca de agua de Ajedrez Integral (en
     el PDF, la imagen de 1:1 con su alfa; en el Word, en el encabezado);
   - lo llenado sigue ahí al volver a abrir la página;
   - a 390 px no se desplaza a lo ancho y no hay errores en la página.

   Ver «Generador de bases del torneo» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js bases-torneo-pagina              */
"use strict";
const { chromium } = require("playwright");
const fs = require("fs");

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
    const red = [];
    await ctx.route("**/*", (r) => {
        const u = r.request().url();
        if (u.startsWith(BASE)) return r.continue();
        red.push(u);
        return r.abort();
    });
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(BASE + "/bases-torneo.html", { waitUntil: "load" });
    await p.evaluate(() => { try { localStorage.clear(); } catch (e) { /* nada */ } });
    await p.reload({ waitUntil: "load" });

    console.log("\n=== Sin llenar ===");
    igual("«Antes de bajar» dice lo que falta: nombre, fecha y lugar",
        await p.$$eval('#revision li[data-tipo="error"]', (l) => l.map((li) => li.textContent)),
        ["Falta el nombre del torneo.", "Falta la fecha de inicio.", "Falta el lugar."]);
    await p.click("#b-pdf");
    await p.waitForTimeout(300);
    igual("y «Bajar en PDF» no baja: avisa qué completar", await p.evaluate(() => document.body.textContent.includes("Antes de bajar, completa: el nombre del torneo, la fecha de inicio, el lugar.")), true);

    console.log("\n=== Lleno ===");
    await p.fill("#b-nombre", "Abierto de Prueba");
    await p.fill("#b-inicio", "2026-03-07");
    await p.fill("#b-lugar", "San José");
    igual("sin errores en «Antes de bajar»", await p.$$eval('#revision li[data-tipo="error"]', (l) => l.length), 0);
    igual("la vista previa: título, fecha y la ronda 1 del calendario",
        await p.evaluate(() => { const v = document.getElementById("vista"); return [v.querySelector("h3").textContent, v.querySelector("p").textContent, [...v.querySelectorAll("tbody tr:first-child td")].map((td) => td.textContent)]; }),
        ["Bases del Abierto de Prueba", "7 de marzo de 2026 · San José", ["1", "sábado, 7 de marzo de 2026", "9:00 a. m."]]);
    igual("la modalidad, escrita", await p.textContent("#b-modalidad"), "90 minutos por jugador para 60 jugadas: ajedrez clásico.");

    console.log("\n=== Desempates ===");
    const codigos = () => p.$$eval("#b-desempates li", (l) => l.map((li) => li.dataset.codigo));
    igual("los del suizo, de Pareo Integral", await codigos(), ["BH-C1", "BH", "SB", "DE", "WIN"]);
    await p.selectOption("#b-sistema", "todos");
    igual("todos contra todos: los suyos", await codigos(), ["DE", "SB", "WIN", "KS"]);
    igual("y sin byes de medio punto", await p.$eval("#zona-byes", (z) => z.checkVisibility()), false);
    await p.click('#b-desempates li[data-codigo="SB"] button[aria-label^="Subir"]');
    igual("«Subir» lo sube", await codigos(), ["SB", "DE", "WIN", "KS"]);
    await p.click('#b-desempates li[data-codigo="KS"] button[aria-label^="Quitar"]');
    igual("«Quitar» lo quita", await codigos(), ["SB", "DE", "WIN"]);
    igual("y la vista previa los trae en ese orden", await p.$$eval("#vista li", (l) => l.map((li) => li.textContent).filter((t) => /^\d\. /.test(t))),
        ["1. Sonneborn-Berger (SB)", "2. Encuentro directo (DE)", "3. Rondas ganadas (WIN)"]);

    console.log("\n=== Bajar ===");
    const bajar = async (boton) => {
        const [d] = await Promise.all([p.waitForEvent("download"), p.click(boton)]);
        return { nombre: d.suggestedFilename(), bytes: fs.readFileSync(await d.path()) };
    };
    const pdf = await bajar("#b-pdf");
    igual("el PDF, con su nombre", pdf.nombre, "bases-abierto-de-prueba.pdf");
    const txt = pdf.bytes.toString("latin1");
    igual("es un PDF, con la marca de agua (una imagen con su canal alfa)", [txt.startsWith("%PDF"), /\/SMask \d+ 0 R/.test(txt)], [true, true]);
    const docx = await bajar("#b-docx");
    const zip = docx.bytes.toString("latin1");
    igual("el Word, con su nombre, la marca en el encabezado y el texto", [docx.nombre, zip.includes("word/media/marca.png"), zip.includes("Bases del Abierto de Prueba")],
        ["bases-abierto-de-prueba.docx", true, true]);

    console.log("\n=== Al volver ===");
    await p.reload({ waitUntil: "load" });
    igual("lo llenado sigue ahí, también los desempates", [await p.inputValue("#b-nombre"), await p.inputValue("#b-sistema"), await codigos()], ["Abierto de Prueba", "todos", ["SB", "DE", "WIN"]]);

    console.log("\n=== En el celular ===");
    await p.setViewportSize({ width: 390, height: 800 });
    igual("la página no se desplaza a lo ancho", await p.evaluate(() => document.documentElement.scrollWidth), 390);
    igual("nada salió del sitio (todo en el navegador)", red.filter((u) => !/fonts|sentry|googletagmanager/.test(u)), []);
    igual("sin errores en la página", errores, []);

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
