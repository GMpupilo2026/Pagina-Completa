/* arbitros.html: la lista pública de árbitros de Costa Rica y «Buscar árbitro
   para un torneo».

   Lo que comprueba, con la llamada a arbitros_cr_publico() contestada por una
   lista falsa y el reloj en el 18/10/2026:
   - la lista: cuántos hay y cuántos arbitraron en dos años, quien arbitró hace
     poco primero y después el título y la categoría más altos;
   - la categoría que pide cada torneo (arts. 11, 13 y 15 del Reglamento para
     Árbitros): de cuarta o tercera división y hasta 30 jugadores, desde la C;
     más de 30 o segunda división, la B; primera, campeonato nacional o más de
     50, la A; Elo FIDE, la A activa en FIDE; sin Elo, cualquiera;
   - la casilla «Solo quienes arbitraron en los últimos dos años» y el buscador;
   - que si la base no contesta la página lo diga;
   - que a 400 px no haya desplazamiento horizontal.

   Ver «La lista pública de árbitros» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-arbitros-publico.js                       */
"use strict";
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:8777";
const PAGINA = BASE + "/arbitros.html";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a === b) console.log("  ✓ " + nombre);
    else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}

const A = (fide_id, nombre, titulo, categoria, activo_fide, ultimo_torneo, curso_al_dia = false) =>
    ({ fide_id, nombre, titulo, categoria, activo_fide, ultimo_torneo, curso_al_dia, lista: "2026-10-16" });
const LISTA = [
    A(1, "Uno, Ana", "IA", null, true, "2026-05-01"),
    A(2, "Dos, Beto", "FA", "A", false, "2026-03-01"),
    A(3, "Tres, Carla", "AN", "A", true, "2025-12-01", true),
    A(4, "Cuatro, Diego", "AN", "B", true, "2026-01-10"),
    A(5, "Cinco, Elena", "AN", "C", true, "2026-02-01"),
    A(6, "Seis, Fabio", "AN", "C", true, "2020-01-01"),
];

async function abrir(browser, contestar) {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    await ctx.clock.setFixedTime(new Date("2026-10-18T12:00:00-06:00"));
    await ctx.route(/sentry|googletagmanager/, (r) => r.abort());
    await ctx.route("**/rest/v1/rpc/arbitros_cr_publico", (r) => contestar(r));
    const p = await ctx.newPage();
    p.on("pageerror", (e) => { console.log("  ✗ error en la página: " + e.message); fallos++; });
    await p.goto(PAGINA, { waitUntil: "load" });
    return { ctx, p };
}
const nombres = (p) => p.$$eval("#ar-tabla tbody th", (ths) => ths.map((t) => t.querySelector("a").textContent));
const texto = (p, id) => p.$eval(id, (e) => e.textContent);

(async () => {
    const browser = await chromium.launch();
    let { ctx, p } = await abrir(browser, (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(LISTA) }));
    await p.waitForFunction(() => document.querySelectorAll("#ar-tabla tbody tr[data-fide]").length > 0);

    console.log("\n=== La lista ===");
    igual("todos, quien arbitró hace poco primero y después el título y la categoría más altos", await nombres(p),
        ["Uno, Ana", "Dos, Beto", "Tres, Carla", "Cuatro, Diego", "Cinco, Elena", "Seis, Fabio"]);
    igual("la cuenta y la fecha de la lista", [await texto(p, "#ar-cuenta"), await texto(p, "#ar-leida")],
        ["6 árbitros en la lista de la Federación; 5 arbitraron en Costa Rica en los últimos dos años.", "16/10/2026"]);
    igual("cada fila: título, categoría, si está activo en FIDE, último torneo y curso", await p.$$eval("#ar-tabla tbody tr", (trs) => [...trs].slice(1, 3).map((t) => [...t.cells].slice(1).map((c) => c.textContent))),
        [["Árbitro FIDE", "A", "Inactivo", "01/03/2026", "No consta"], ["Árbitro Nacional", "A", "Activo", "01/12/2025", "Al día"]]);
    igual("el nombre enlaza a su perfil de FIDE", await p.$eval("#ar-tabla tbody th a", (a) => a.href), "https://ratings.fide.com/profile/1");
    igual("sin elegir torneo, la división y los jugadores no se usan", await p.$eval("#ar-division", (e) => e.disabled), true);

    console.log("\n=== Buscar árbitro para un torneo ===");
    await p.selectOption("#ar-elo", "nacional");
    await p.fill("#ar-jugadores", "20");
    igual("Elo nacional, cuarta o tercera, 20 jugadores: desde la C (art. 11), sin quien no arbitró en dos años",
        [await nombres(p), /desde la C \(art\. 11\)/.test(await texto(p, "#ar-pide")), await texto(p, "#ar-cuenta")],
        [["Uno, Ana", "Dos, Beto", "Tres, Carla", "Cuatro, Diego", "Cinco, Elena"], true, "5 árbitros pueden ser principal o adjunto en ese torneo."]);
    await p.fill("#ar-jugadores", "40");
    igual("con 40 jugadores, la B o más (la C llega hasta 30)", [await nombres(p), /la C llega hasta 30 \(art\. 11\)/.test(await texto(p, "#ar-pide"))],
        [["Uno, Ana", "Dos, Beto", "Tres, Carla", "Cuatro, Diego"], true]);
    await p.fill("#ar-jugadores", "20");
    await p.selectOption("#ar-division", "2");
    igual("de segunda división, la B o más", await nombres(p), ["Uno, Ana", "Dos, Beto", "Tres, Carla", "Cuatro, Diego"]);
    await p.selectOption("#ar-division", "nacional");
    igual("un campeonato nacional, la A, el AF o el AI (art. 15)", await nombres(p), ["Uno, Ana", "Dos, Beto", "Tres, Carla"]);
    await p.selectOption("#ar-division", "4");
    await p.fill("#ar-jugadores", "60");
    igual("con 60 jugadores, la A (la B llega hasta 50)", await nombres(p), ["Uno, Ana", "Dos, Beto", "Tres, Carla"]);
    await p.selectOption("#ar-elo", "fide");
    igual("Elo FIDE: la A activa en FIDE (el AF inactivo no sale), y la división y los jugadores no cuentan",
        [await nombres(p), await p.$eval("#ar-jugadores", (e) => e.disabled)], [["Uno, Ana", "Tres, Carla"], true]);
    await p.selectOption("#ar-elo", "sin");
    igual("sin Elo: cualquiera de la lista", await nombres(p), ["Uno, Ana", "Dos, Beto", "Tres, Carla", "Cuatro, Diego", "Cinco, Elena"]);
    await p.uncheck("#ar-recientes");
    igual("sin la casilla, también quien no arbitró en dos años, al final", (await nombres(p)).slice(-1), ["Seis, Fabio"]);
    await p.selectOption("#ar-elo", "");
    await p.fill("#ar-texto", "elena");
    igual("el buscador, sin distinguir mayúsculas", await nombres(p), ["Cinco, Elena"]);
    await p.fill("#ar-texto", "nadie");
    igual("y si no hay nadie, lo dice", await p.$eval("#ar-tabla tbody", (b) => b.textContent), "Nadie con ese nombre en la lista.");

    await p.setViewportSize({ width: 400, height: 800 });
    await p.fill("#ar-texto", "");
    igual("a 400 px, sin desplazamiento horizontal", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await ctx.close();

    console.log("\n=== Si la base no contesta ===");
    ({ ctx, p } = await abrir(browser, (r) => r.fulfill({ status: 500, body: "{}" })));
    await p.waitForFunction(() => /No se pudo leer/.test(document.getElementById("ar-estado").textContent));
    igual("lo dice", await texto(p, "#ar-estado"), "No se pudo leer la lista. Vuelve a cargar la página en un rato.");
    await ctx.close();

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
