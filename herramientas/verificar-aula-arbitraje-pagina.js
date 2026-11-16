/* aula-arbitraje.html: el Aula de Arbitraje en el navegador, sin red.

   Lo que comprueba (con la licencia destapada con CandadoHerramienta.liberar(),
   como cuando la base contesta que sí; el candado lo prueba
   verificar-candado-herramienta.js):
   - Estudiar: el Taller primero, las fichas de la revista N.º 1 con su
     portada, y una ficha con su contenido;
   - la portada de cada número: el PDF bloqueado hasta completar todo lo de
     ese número (fichas, preguntas, casos), y habilitado al completarlo;
   - los casos del taller: el tablero y la serie que termina en mate, la
     repetición con su tabla, un desempate (BH-C1) y una norma (piso de Elo);
   - las calculadoras de desempates, normas y rendimiento, y la práctica
     generada de desempates y normas;
   - la marca de Ajedrez Integral en el reloj;
   - Practicar: una pregunta se contesta y dice si estuvo bien, escrito (✓/✗);
     el ejercicio de relojes acepta la solución que él mismo calcula; el de
     posiciones idénticas dibuja el tablero del sitio (64 casillas), anota en
     español y dice que no hay triple repetición en el ejercicio 3;
   - Casos: el de «volver a antes del control», con el reloj ajustado a la
     solución recomendada, da «Dictamen correcto»; con el reloj sin tocar, no;
   - Reloj: en marcha y a ×60 corre, la palanca suma el incremento y pasa el
     turno, y la calculadora le manda el resultado;
   - el contraste de los colores de estado (bien, aviso, mal), del reloj y de
     la tabla del Koya, en claro y en oscuro (WCAG AA, 4,5:1);
   - a 390 px no hay desplazamiento horizontal, y la página no da errores.
   Ver «Aula de Arbitraje» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js aula-arbitraje-pagina              */
"use strict";
const { chromium } = require("playwright");
// Cuántas revistas hay: una carpeta noNN por número en herramientas/revistas-arbitraje.
const REVISTAS = require("fs").readdirSync(require("path").join(__dirname, "revistas-arbitraje")).filter((d) => /^no\d\d$/.test(d)).length;

const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a === b) console.log("  ✓ " + nombre);
    else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function abrir(ctx, hash, oscuro) {
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    await p.addInitScript((o) => { try { localStorage.setItem("theme", o ? "dark" : "light"); } catch (e) { /* nada */ } }, !!oscuro);
    await p.goto(BASE + "/aula-arbitraje.html" + (hash || ""), { waitUntil: "load" });
    await p.evaluate(() => window.CandadoHerramienta.liberar());
    await p.waitForFunction(() => document.getElementById("aula-vista").checkVisibility());
    return { p, errores };
}

/* Mide el contraste de cada par texto/fondo pintando muestras de las clases
   en la página (los colores salen del CSS real, con el tema real). */
async function contrastes(p) {
    return p.evaluate(() => {
        const muestras = [
            '<span class="aula-chip ok">bien</span>', '<span class="aula-chip aviso">aviso</span>', '<span class="aula-chip mal">mal</span>',
            '<div class="aula-fb ok"><p>bien</p></div>', '<div class="aula-fb aviso"><p>aviso</p></div>', '<div class="aula-fb mal"><p>mal</p></div>',
            '<div class="aula-opciones"><button class="ok">bien</button><button class="mal">mal</button></div>',
            '<div class="aula-norma aula-norma-aviso">aviso</div>', '<div class="aula-norma">norma</div>',
            '<div class="aula-tabla"><table class="aula-cruzada"><tr><td class="top">½</td><td class="dif">x</td></tr></table></div>',
            '<p class="aula-nota">nota</p>', '<p class="aula-intro">intro</p>', '<span class="aula-art">art</span>',
            '<div class="aula-lcd"><div class="aula-lado activo"><span class="aula-dig">1:00:00</span></div><div class="aula-lado"><span class="aula-dig">1:00:00</span></div></div>',
        ];
        const caja = document.createElement("div");
        caja.innerHTML = muestras.join("");
        document.getElementById("aula-vista").appendChild(caja);
        const rgb = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] == null ? 1 : m[3] }; };
        const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
        const fondo = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.a > 0.5) return c; } return { r: 255, g: 255, b: 255 }; };
        const malos = [];
        caja.querySelectorAll("span, p, button, td, .aula-norma").forEach((el) => {
            if (!el.textContent.trim() || el.children.length) return;
            const t = rgb(getComputedStyle(el).color), f = fondo(el);
            const a = lum(t), b = lum(f), r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            if (r < 4.5) malos.push(el.className + " «" + el.textContent + "» " + r.toFixed(2));
        });
        caja.remove();
        return malos;
    });
}

(async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    await ctx.route(/supabase\.co|sentry|googletagmanager/, (r) => r.abort());
    const todos = [];

    console.log("\n=== Estudiar ===");
    let { p, errores } = await abrir(ctx, "");
    todos.push(errores);
    igual("primero el Taller del árbitro, con sus cuatro fichas",
        await p.$$eval("#aula-vista .aula-coleccion:first-of-type .aula-tarjeta h4", (l) => l.length), 4);
    igual("después la revista N.º 1: su portada y sus tres fichas",
        await p.$$eval("#aula-vista .aula-coleccion:nth-of-type(2) .aula-tarjeta h4", (l) => l.map((h) => h.textContent)), ["La revista N.º 1 en PDF", "Ajuste de relojes después de una irregularidad", "Sistema de desempate Koya", "Posiciones idénticas"]);
    igual("y debajo, los números 2 al " + REVISTAS, await p.$$eval("#aula-vista .aula-coleccion h3", (l, n) => [l.length, l[2].textContent.includes("N.º 2"), l[n].textContent.includes("N.º " + n)], REVISTAS), [REVISTAS + 1, true, true]);

    console.log("\n=== La portada de cada revista y su PDF ===");
    igual("sin completar nada, el PDF del N.º 1 está bloqueado: sin enlace, pero se alcanza con Tab",
        await p.$eval(".aula-portada[data-revista='1']", (t) => [!!t.querySelector("a[href$='.pdf']"), t.querySelector("[aria-disabled='true']").tabIndex, t.querySelector("img").naturalWidth > 0]), [false, 0, true]);
    // Completar todo lo del N.º 1 (fichas vistas, preguntas acertadas, casos resueltos) lo habilita.
    await p.evaluate(() => {
        const D = window.AULA_CONTENIDO, ids = D.fichas.filter((f) => f.coleccion === "revista-1").map((f) => f.id);
        const av = { pregV2: true, vistas: {}, preg: {}, casos: {} };
        const n = {};
        D.preguntas.forEach((q) => { n[q.ficha] = (n[q.ficha] || 0) + 1; if (ids.includes(q.ficha)) av.preg[q.ficha + "#" + n[q.ficha]] = true; });
        ids.forEach((id) => { av.vistas[id] = true; });
        D.casos.filter((c) => ids.includes(c.ficha)).forEach((c) => { av.casos[c.id] = "optima"; });
        localStorage.setItem("aula_arbitraje_avance_v1", JSON.stringify(av));
        location.hash = "practicar";
    });
    await p.waitForSelector("#aula-preg");
    await p.evaluate(() => { location.hash = "estudiar"; });
    await p.waitForSelector(".aula-portada[data-revista='1'] a[href$='.pdf']");
    igual("con todo completo, el botón baja el PDF del N.º 1; el N.º 2 sigue bloqueado",
        await p.evaluate(() => [document.querySelector(".aula-portada[data-revista='1'] a").getAttribute("href"), !!document.querySelector(".aula-portada[data-revista='2'] a[href$='.pdf']")]), ["descargas/aula-arbitraje/revista-01.pdf", false]);
    await p.evaluate(() => localStorage.removeItem("aula_arbitraje_avance_v1"));
    await p.click("a[href='#ficha-relojes']");
    await p.waitForSelector(".aula-hoja");
    igual("la ficha de relojes trae la norma (art. 7.1) y sus ideas clave",
        await p.$eval("#aula-vista", (v) => [v.querySelector(".aula-hoja").textContent.includes("Art. 7.1"), v.querySelectorAll(".aula-claves li").length]), [true, 6]);
    igual("y la pestaña Estudiar queda marcada", await p.$eval("[data-aula-tab='estudiar']", (a) => a.getAttribute("aria-current")), "page");

    console.log("\n=== Practicar ===");
    await p.evaluate(() => { location.hash = "practicar-preguntas"; });
    await p.waitForSelector("#aula-preg .aula-opciones button");
    await p.click("#aula-preg .aula-opciones button");
    igual("al contestar, la buena queda marcada con ✓ (no solo con color) y sale la explicación",
        await p.$eval("#aula-preg", (c) => [!!c.querySelector(".aula-opciones button.ok"), c.querySelector(".aula-opciones button.ok").textContent.startsWith("✓"), !!c.querySelector(".aula-fb")]), [true, true, true]);

    await p.evaluate(() => { location.hash = "practicar-relojes"; });
    await p.waitForSelector("#aula-comp");
    // La solución que pinta la página al equivocarse es la que debe aceptar.
    await p.fill("#aula-iw", "0:00:01"); await p.fill("#aula-ib", "0:00:01");
    await p.click("#aula-comp");
    const sol = await p.$eval("#aula-fb", (f) => { const b = f.querySelectorAll("p b"); const t = f.textContent.match(/jugadas completadas (\d+) \/ (\d+)/); return [b[1].textContent, b[2].textContent, t[1], t[2]]; });
    await p.fill("#aula-iw", sol[0]); await p.fill("#aula-ib", sol[1]); await p.fill("#aula-ijw", sol[2]); await p.fill("#aula-ijb", sol[3]);
    await p.click("#aula-comp");
    igual("el ejercicio de relojes acepta su propia solución", await p.$eval("#aula-fb .aula-fb", (f) => [f.classList.contains("ok"), f.textContent.startsWith("Correcto.")]), [true, true]);

    await p.evaluate(() => { location.hash = "practicar-posiciones"; });
    await p.waitForSelector("#aula-ejsel");
    await p.selectOption("#aula-ejsel", "2");
    await p.waitForSelector(".aula-tablero .example-sq");
    igual("el tablero del sitio, con 64 casillas que se ven",
        await p.$eval(".aula-tablero", (b) => [b.querySelectorAll(".example-sq").length, b.checkVisibility()]), [64, true]);
    igual("las jugadas en algebraica española", await p.$eval(".aula-lista-jug", (l) => l.textContent.includes("2. Cc4") && l.textContent.includes("3… Ad7")), true);
    await p.click("[data-r='no']");
    igual("ejercicio 3: no hay triple repetición, porque al principio se podía capturar al paso",
        await p.$eval(".aula-fb-zona", (z) => [z.querySelector(".aula-fb").textContent.startsWith("Correcto."), z.textContent.includes("Al paso: sí (e6)"), z.querySelectorAll("td.dif").length > 0]), [true, true, true]);

    console.log("\n=== Casos ===");
    await p.evaluate(() => { location.hash = "caso-antes-del-control"; });
    await p.waitForSelector("#aula-dict");
    await p.click("#aula-dict");
    igual("con el reloj sin tocar, no es el dictamen correcto", await p.$eval("#aula-fbr .aula-fb", (f) => f.classList.contains("ok")), false);
    await p.fill("[data-campo='tw']", "0:24:25"); await p.fill("[data-campo='tb']", "0:43:14");
    await p.fill("[data-campo='jw']", "37"); await p.fill("[data-campo='jb']", "37");
    await p.selectOption("[data-campo='turno']", "w");
    await p.click("[data-accion='aplicar']");
    await p.click("#aula-dict");
    igual("con la solución recomendada: «Dictamen correcto»", await p.$eval("#aula-fbr .aula-fb", (f) => [f.classList.contains("ok"), f.textContent.startsWith("Dictamen correcto")]), [true, true]);

    console.log("\n=== Casos del taller ===");
    await p.evaluate(() => { location.hash = "caso-bandera-dos-peones"; });
    await p.waitForSelector(".aula-diagrama .example-sq");
    igual("el caso de bandera trae el tablero (64 casillas) y la posición escrita", await p.$eval(".aula-diagrama", (f) => [f.querySelectorAll(".example-sq").length, f.querySelector("figcaption").textContent.includes("Negras")]), [64, true]);
    await p.click(".aula-opciones button[data-i='1']");
    await p.waitForSelector(".aula-serie .example-sq");
    igual("al decidir bien, muestra la serie legal que termina en mate", await p.$eval(".aula-serie", (s) => s.textContent.includes(": mate.")), true);
    await p.evaluate(() => { location.hash = "caso-rep-enroque"; });
    await p.waitForSelector("[data-secuencia] .example-sq");
    await p.click(".aula-opciones button[data-i='1']");
    igual("el caso de repetición corrige y muestra la tabla de posiciones idénticas", await p.$eval("#aula-vista", (v) => [v.querySelector("#aula-fbd .aula-fb").classList.contains("ok"), v.querySelectorAll("[data-secuencia] td.dif").length > 0]), [true, true]);
    await p.evaluate(() => { location.hash = "caso-des-bh-c1"; });
    await p.waitForSelector(".aula-paso-calc input");
    await p.$$eval(".aula-paso-calc input", (i) => { i[0].value = "10½"; i[1].value = "11"; });
    await p.selectOption("#aula-o0", "j6"); await p.selectOption("#aula-o1", "j1");
    await p.click("[data-comprobar]");
    igual("el caso de BH-C1 acepta 10½ y 11 y el orden Fallas › Alvarado", await p.$eval(".aula-fb-zona .aula-fb", (f) => [f.classList.contains("ok"), f.textContent.includes("Fallas › Alvarado")]), [true, true]);
    await p.evaluate(() => { location.hash = "caso-nor-piso"; });
    await p.waitForSelector("#aula-nra");
    await p.fill("#aula-nn", "9"); await p.fill("#aula-np", "7"); await p.fill("#aula-nra", "2452"); await p.fill("#aula-nrp", "2672");
    await p.check("input[type=checkbox][value=GM]");
    await p.click("[data-comprobar]");
    igual("el caso del piso de Elo: Ra 2452, Rp 2672, norma de GM", await p.$eval(".aula-fb-zona .aula-fb", (f) => [f.classList.contains("ok"), f.textContent.includes("Solís sube de 2080 al piso de 2200")]), [true, true]);

    console.log("\n=== Calculadoras ===");
    await p.evaluate(() => { location.hash = "calculadoras-desempates"; });
    await p.waitForSelector("#aula-cdc");
    await p.click("#aula-cdc");
    igual("desempates: con el ejemplo, Fallas primero por BH-C1", await p.$eval("#aula-cdr", (r) => r.querySelector("table:not(.aula-torneo) tbody tr td:nth-child(2)").textContent), "Fallas");
    await p.click("#aula-cdr .aula-celda");
    igual("y al tocar un valor explica de dónde sale", await p.$eval("#aula-cdx", (x) => x.textContent.includes("Total")), true);
    await p.evaluate(() => { location.hash = "calculadoras-normas"; });
    await p.waitForSelector("#aula-cnc");
    await p.click("#aula-cnc");
    igual("normas: con el ejemplo, hay norma de GM", await p.$eval("#aula-cnr", (r) => r.textContent.includes("Gran Maestro (GM): hay norma")), true);
    await p.evaluate(() => { location.hash = "calculadoras-rendimiento"; });
    await p.waitForSelector("#aula-crc");
    await p.click("#aula-crc");
    igual("rendimiento: 2379 + 125 = 2504", await p.$eval("#aula-crr", (r) => r.textContent.includes("= 2504")), true);
    await p.evaluate(() => { location.hash = "practicar-desempates"; });
    await p.waitForSelector(".aula-paso-calc input");
    await p.click("[data-comprobar]");
    igual("la práctica de desempates genera un torneo y corrige", await p.$eval(".aula-fb-zona .aula-fb", (f) => f.textContent.includes("Orden final")), true);
    await p.evaluate(() => { location.hash = "practicar-normas"; });
    await p.waitForSelector("#aula-nra");
    await p.click("[data-comprobar]");
    igual("la práctica de normas genera rivales y corrige", await p.$eval(".aula-fb-zona .aula-fb", (f) => f.textContent.includes("Rp =")), true);

    console.log("\n=== Reloj ===");
    await p.evaluate(() => { location.hash = "reloj"; });
    await p.waitForSelector(".aula-reloj");
    await p.selectOption("[data-accion='velocidad']", "60");
    await p.click("[data-accion='iniciar']");
    await esperar(1200);
    await p.click(".aula-palanca[data-lado='w']");
    await esperar(150);
    const tras = await p.evaluate(() => [...document.querySelectorAll(".aula-lado")].map((l) => [l.querySelector(".aula-dig").textContent, l.querySelector(".aula-mov").textContent, l.classList.contains("corre")]));
    const seg = (t) => { const x = t.split(":").map(Number); return x[0] * 3600 + x[1] * 60 + x[2]; };
    igual("a ×60 corre, la palanca suma los 30 s y le pasa el turno a las negras",
        [seg(tras[0][0]) < 5400 + 30 && seg(tras[0][0]) > 5400 - 120, tras[0][1], tras[0][2], tras[1][2]], [true, "Jug. 1", false, true]);
    await p.click("[data-accion='pausa']");
    await p.click("#aula-calc");
    await p.click("#aula-env");
    await esperar(150);
    igual("todo reloj lleva la marca de Ajedrez Integral: la marca de agua en la pantalla y la placa del logo",
        await p.evaluate(() => [document.querySelector(".aula-lcd-marca").checkVisibility(), document.querySelector(".aula-lcd-marca").naturalWidth > 0, document.querySelector(".aula-reloj-marca").checkVisibility(), document.querySelector(".aula-reloj-marca").textContent]), [true, true, true, "Ajedrez Integral"]);
    igual("la calculadora le manda el caso B de la revista al reloj",
        await p.evaluate(() => [...document.querySelectorAll(".aula-lado")].map((l) => l.querySelector(".aula-dig").textContent + " " + l.querySelector(".aula-mov").textContent)), ["0:52:32 Jug. 43", "1:11:00 Jug. 42"]);

    console.log("\n=== Contraste (WCAG AA) ===");
    igual("en claro, todos los pares de texto y fondo llegan a 4,5:1", await contrastes(p), []);
    await p.close();
    ({ p, errores } = await abrir(ctx, "#estudiar", true));
    todos.push(errores);
    igual("en oscuro también", await contrastes(p), []);
    await p.close();

    console.log("\n=== En el celular ===");
    const cel = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
    await cel.route(/supabase\.co|sentry|googletagmanager/, (r) => r.abort());
    for (const h of ["#estudiar", "#practicar-koya", "#practicar-posiciones", "#practicar-desempates", "#caso-ilegal-con-incremento", "#caso-des-bh-c1", "#caso-nor-piso", "#caso-bandera-un-alfil", "#calculadoras-desempates", "#reloj"]) {
        ({ p, errores } = await abrir(cel, h));
        todos.push(errores);
        igual("a 390 px, " + h + " no se desplaza de lado", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        await p.close();
    }

    igual("la página no dio errores", todos.flat(), []);
    await browser.close();
    console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron." : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
