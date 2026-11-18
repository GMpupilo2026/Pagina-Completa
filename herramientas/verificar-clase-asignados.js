/* A la clase en vivo entran solo los asignados.
 *
 * Con la clase abierta entraba CUALQUIER alumno del profe: el de otra sede se
 * metía a la clase que no era y quedaba con asistencia ahí, y en el informe
 * todos tenían faltas en las clases de los otros grupos. Ahora cada clase
 * tiene su lista (`clase_asignados`), la base deja entrar solo a esos, y la
 * pantalla la pide al abrir. Ver «A la clase entran solo los asignados» en
 * docs/decisiones/clase-en-vivo.md.
 *
 * Comprueba, con el Supabase de mentira de verificar-clase-registrada.js:
 *  - al abrir, la lista viene marcada con la clase del horario de AHORA (su
 *    grupo) y, sin horario, con la de la última clase — y lo dice escrito;
 *  - con la clase en curso, «👥 Quién entra» abre la lista con los de la clase,
 *    y guardar manda la lista entera (cambiar_asignados_de_la_clase);
 *  - la alumna con la clase de su profe abierta pero SIN estar en la lista no
 *    monta la sesión, no pide el tablero, y se le dice que no está en la lista
 *    (no «todavía no ha abierto»), y queda escuchando por si la agregan;
 *  - ninguna página abre una clase en vivo con un INSERT suelto.
 *
 * Uso: con el sitio en localhost:8777 (o BASE_URL) y playwright.
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { abrir, igual, CHROME, fallos } = require("./verificar-clase-registrada.js");

const RAIZ = path.join(__dirname, "..");
const ALUMNOS = [
    { id: "u-ana", full_name: "Ana Rojas", email: "ana@x.cr", grupo: "SJ" },
    { id: "u-beto", full_name: "Beto Mena", email: "beto@x.cr", grupo: "CENFO" },
    { id: "u-caro", full_name: "Caro Solís", email: "caro@x.cr", grupo: "SJ" },
];
const marcados = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll("#clase-asignar input[data-alumno]")).filter((c) => c.checked).map((c) => c.value).sort());

// Hoy y ahora en Costa Rica (UTC−6, sin horario de verano).
function ahoraCR() {
    const cr = new Date(Date.now() - 6 * 3600000);
    return { dow: cr.getUTCDay(), hora: String(cr.getUTCHours()).padStart(2, "0") + ":" + String(cr.getUTCMinutes()).padStart(2, "0") };
}

async function pruebaPropuestaDelHorario(browser) {
    console.log("\n=== Al abrir, vienen marcados los del grupo de su horario de ahora ===");
    const { dow, hora } = ahoraCR();
    const { page, ctx, errores } = await abrir(browser, "u-profe", null, {
        alumnos_del_profesor: ALUMNOS,
        horario_clases: [{ profesor_id: "u-profe", dia_semana: dow, hora: hora + ":00", duracion_min: 90,
            grupo: "SJ", subgrupo_id: null, titulo: null, modalidad: "en_linea", desde: null, hasta: null }],
    });
    await page.waitForSelector("#clase-estado:not(.hidden)", { timeout: 10000 });
    await page.click("#clase-abrir-btn");
    await page.waitForSelector("#clase-asignar input[data-alumno]", { timeout: 8000 });
    igual("marcados los del grupo SJ, no el de CENFO", await marcados(page), ["u-ana", "u-caro"]);
    igual("y dice de dónde salió la lista",
        (await page.textContent("#clase-asignar")).includes("tu horario de ahora") ? "lo dice" : await page.textContent("#clase-asignar"), "lo dice");
    igual("hay un botón por grupo", await page.evaluate(() =>
        Array.from(document.querySelectorAll("#clase-asignar button")).map((b) => b.textContent).filter((t) => t.startsWith("Grupo "))),
        ["Grupo CENFO (1)", "Grupo SJ (2)"]);
    await page.click("#clase-asignar button:has-text('Grupo CENFO')");
    igual("el botón del grupo marca a esos y desmarca al resto", await marcados(page), ["u-beto"]);
    igual("el selector es un grupo de casillas con su leyenda", await page.evaluate(() =>
        (document.querySelector("#clase-asignar fieldset legend") || {}).textContent), "¿Quién entra a esta clase?");
    igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
    await ctx.close();
}

async function pruebaPropuestaDeLaUltimaClase(browser) {
    console.log("\n=== Sin horario, vienen marcados los de su última clase ===");
    const cerrada = { id: "s-ayer", created_by: "u-profe", solo_asignados: true, ended_at: "2026-11-16T23:00:00Z",
        started_at: "2026-11-16T21:00:00Z", title: null, notes: null };
    const { page, ctx, errores } = await abrir(browser, "u-profe", null, {
        alumnos_del_profesor: ALUMNOS,
        class_sessions: [cerrada],
        clase_asignados: [{ class_session_id: "s-ayer", student_id: "u-beto" }],
    });
    await page.waitForSelector("#clase-estado:not(.hidden)", { timeout: 10000 });
    await page.click("#clase-abrir-btn");
    await page.waitForSelector("#clase-asignar input[data-alumno]", { timeout: 8000 });
    igual("marcado el de la última clase", await marcados(page), ["u-beto"]);
    igual("y lo dice", (await page.textContent("#clase-asignar")).includes("tu última clase") ? "lo dice" : "no", "lo dice");
    await page.click("#clase-asignar [data-confirmar]");
    await page.waitForFunction(() => (window.__rpcs || []).some((r) => r.n === "abrir_clase_en_vivo"), null, { timeout: 8000 });
    igual("abre con esa lista", await page.evaluate(() =>
        window.__rpcs.find((r) => r.n === "abrir_clase_en_vivo").args.p_alumnos), ["u-beto"]);
    await page.waitForFunction(() => /Pueden entrar 1 alumno/.test(document.getElementById("clase-estado-texto").textContent), null, { timeout: 8000 }).catch(() => {});
    igual("la franja dice cuántos pueden entrar", (await page.textContent("#clase-estado-texto")).includes("Pueden entrar 1 alumno de tu lista") ? "lo dice" : await page.textContent("#clase-estado-texto"), "lo dice");
    igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
    await ctx.close();
}

async function pruebaCambiarLaLista(browser) {
    console.log("\n=== Con la clase en curso, «Quién entra» cambia la lista ===");
    const abierta = { id: "s-1", created_by: "u-profe", solo_asignados: true, ended_at: null,
        started_at: new Date().toISOString(), title: null, notes: null };
    const { page, ctx, errores } = await abrir(browser, "u-profe", abierta, {
        alumnos_del_profesor: ALUMNOS,
        clase_asignados: [{ class_session_id: "s-1", student_id: "u-ana" }],
    });
    await page.waitForFunction(() => /Pueden entrar 1 alumno/.test(document.getElementById("clase-estado-texto").textContent), null, { timeout: 10000 }).catch(() => {});
    igual("la franja dice cuántos pueden entrar", (await page.textContent("#clase-estado-texto")).includes("Pueden entrar 1 alumno") ? "lo dice" : await page.textContent("#clase-estado-texto"), "lo dice");
    const boton = await page.$("#clase-asignados-btn");
    igual("el botón «Quién entra» se ve", await boton.evaluate((b) => b.checkVisibility() ? "sí" : "no"), "sí");
    igual("y dice que está cerrado", await boton.getAttribute("aria-expanded"), "false");
    await boton.click();
    await page.waitForSelector("#clase-asignar input[data-alumno]", { timeout: 8000 });
    igual("al abrirlo lo dice", await boton.getAttribute("aria-expanded"), "true");
    igual("trae marcados los de la clase", await marcados(page), ["u-ana"]);
    await page.check("#clase-asignar input[value='u-caro']");
    igual("el botón dice lo que hace", await page.textContent("#clase-asignar [data-confirmar]"), "Guardar: entran 2 alumnos");
    await page.click("#clase-asignar [data-confirmar]");
    await page.waitForFunction(() => (window.__rpcs || []).some((r) => r.n === "cambiar_asignados_de_la_clase"), null, { timeout: 8000 });
    const pedido = await page.evaluate(() => window.__rpcs.find((r) => r.n === "cambiar_asignados_de_la_clase").args);
    igual("manda la lista ENTERA de esa clase", { clase: pedido.p_clase, alumnos: pedido.p_alumnos.slice().sort() },
        { clase: "s-1", alumnos: ["u-ana", "u-caro"] });
    igual("la franja se pone al día", (await page.textContent("#clase-estado-texto")).includes("Pueden entrar 2 alumnos") ? "lo dice" : await page.textContent("#clase-estado-texto"), "lo dice");
    igual("y el botón vuelve a cerrado", await boton.getAttribute("aria-expanded"), "false");
    igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
    await ctx.close();
}

async function pruebaAlumnaFueraDeLaLista(browser) {
    console.log("\n=== La alumna que no está en la lista no entra ===");
    const abierta = { id: "s-1", created_by: "u-profe", solo_asignados: true, ended_at: null,
        started_at: new Date().toISOString(), title: null, notes: null };
    const { page, ctx, errores } = await abrir(browser, "u-ana", abierta, {
        clase_asignados: [{ class_session_id: "s-1", student_id: "u-beto" }],
    });
    await page.waitForTimeout(800);
    igual("no se le monta la sesión", await page.evaluate(() => document.getElementById("app").checkVisibility() ? "sí" : "no"), "no");
    igual("se le dice que no está en la lista, y se VE",
        await page.evaluate(() => document.getElementById("sin-clase").checkVisibility()
            && /no estás en la lista/.test(document.getElementById("sin-clase-texto").textContent) ? "lo dice" : document.getElementById("sin-clase-texto").textContent), "lo dice");
    igual("no marca asistencia en una clase que no es suya", await page.evaluate(() =>
        window.__inserts.some((i) => i.tabla === "class_attendance") ? "la marcó" : "no"), "no");
    igual("queda escuchando por si la agregan (solo a ella)", await page.evaluate(() =>
        (window.__escuchas || []).some((e) => e.tabla === "clase_asignados" && e.filtro === "student_id=eq.u-ana") ? "sí" : "no"), "sí");
    igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
    await ctx.close();

    console.log("\n=== …y la que sí está, entra ===");
    const r = await abrir(browser, "u-ana", abierta, { clase_asignados: [{ class_session_id: "s-1", student_id: "u-ana" }] });
    await r.page.waitForTimeout(1000);
    igual("se le monta la sesión", await r.page.evaluate(() => document.getElementById("app").checkVisibility() ? "sí" : "no"), "sí");
    igual("y su asistencia se marca", await r.page.evaluate(() =>
        window.__inserts.some((i) => i.tabla === "class_attendance") ? "sí" : "no"), "sí");
    igual("sin errores en consola", r.errores.join(" | ") || "ninguno", "ninguno");
    await r.ctx.close();
}

/* La base ya no deja abrir una clase en vivo con un INSERT suelto (la
   política solo deja la ficha presencial): una página que lo intentara
   fallaría en producción y en el doble pasaría. Se revisa el código. */
function pruebaNingunInsertSuelto() {
    console.log("\n=== Ninguna página abre una clase en vivo con un INSERT ===");
    const js = path.join(RAIZ, "js");
    const culpables = fs.readdirSync(js).filter((f) => f.endsWith(".js"))
        .filter((f) => /from\(\s*["']class_sessions["']\s*\)\s*\.insert/.test(fs.readFileSync(path.join(js, f), "utf8")));
    igual("ningún from(\"class_sessions\").insert en js/", culpables, []);
}

(async () => {
    pruebaNingunInsertSuelto();
    const browser = await chromium.launch({ executablePath: CHROME });
    try {
        await pruebaPropuestaDelHorario(browser);
        await pruebaPropuestaDeLaUltimaClase(browser);
        await pruebaCambiarLaLista(browser);
        await pruebaAlumnaFueraDeLaLista(browser);
    } finally {
        await browser.close();
    }
    const n = fallos();
    console.log(n ? "\n" + n + " fallo(s)." : "\nTodo bien: a cada clase entran solo los que el profe asignó.");
    process.exit(n ? 1 : 0);
})();
