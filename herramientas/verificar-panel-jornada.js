/* Comprueba el panel jornada (js/panel-jornada.js): el panel del alumno
   repartido en cinco pestañas, solo para las cuentas de vistas_en_prueba.

   Lo que se rompería callado:
   - que a una cuenta que NO está anotada se le cambie el panel (o a una
     profesora que sí lo está: el panel docente tiene otros grupos);
   - que una sección quede en la pestaña equivocada o escondida en todas;
   - que buscar no destape lo de las otras pestañas (el resultado no se vería);
   - que los puntos no lleguen a Perfil;
   - que la barra no quede abajo en el celular ni a la izquierda en la
     computadora.
   Lo visible se mide con checkVisibility()/getComputedStyle, no por la clase.

   Ver «El panel jornada: el del alumno, con pestañas» en
   docs/decisiones/paneles.md.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-panel-jornada.js                        */
const { chromium } = require("./lib/playwright-con-sesion");
const { clasesDeMentira, clienteFalso } = require("./lib/doble-panel");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const ALUMNO = { id: "u-oscarov", role: "alumno", is_admin: false, es_coordinador: false, full_name: "Oscarov", email: "o@x.cr", grupo: "SJ" };
const PROFE = { id: "u-profe", role: "profesor", is_admin: false, es_coordinador: false, full_name: "Karina Rojas", email: "karina@x.cr", grupo: null,
                invitaciones_max: 10, invitaciones_usadas: 3 };
const ANOTADO = (id) => ({ vistas_en_prueba: [{ profile_id: id, vista: "panel_jornada" }] });

let fallos = 0;
const bien = (t) => console.log("  ✓ " + t);
const mal = (t) => { console.log("  ✗ " + t); fallos += 1; };
const cierto = (t, v) => (v ? bien(t) : mal(t));
function igual(t, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a === b) bien(t + ": " + a); else mal(t + "\n      esperaba: " + b + "\n      salió:    " + a);
}

async function abrir(browser, perfil, datos, opciones, hash, local) {
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: "block" }, opciones || {}));
  // Lo que ya estaba guardado en este navegador (el tema de antes, por ejemplo).
  if (local) await ctx.addInitScript((l) => { Object.entries(l).forEach(([k, v]) => localStorage.setItem(k, v)); }, local);
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso([perfil], perfil.id, clasesDeMentira(), datos) }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + "/clases.html" + (hash || ""), { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  // El módulo espera su consulta: se le da un respiro para que arme (o no) las pestañas.
  await page.waitForTimeout(600);
  return { ctx, page, errores };
}

// Qué se ve: las secciones por id y los grupos por título.
const QUE_SE_VE = () => {
  const ve = (el) => !!el && el.checkVisibility();
  const ids = ["session-status-card", "progreso-alumno", "tus-clases", "jornada-perfil", "buscar-panel"];
  const r = { ids: {}, grupos: {} };
  ids.forEach((id) => { const el = document.getElementById(id); r.ids[id] = el ? (el.dataset.jornada || "-") + (ve(el) ? ":ve" : ":no") : "falta"; });
  document.querySelectorAll("#tile-grid > section").forEach((s) => {
    const h = s.querySelector("h2");
    const t = ((h && (h.dataset.titulo || h.textContent)) || "").trim();
    r.grupos[t] = (s.dataset.jornada || "-") + (ve(s) ? ":ve" : ":no");
  });
  return r;
};

async function pruebaSinAnotar(browser) {
  console.log("\nSin la fila en vistas_en_prueba, el panel no cambia");
  const { ctx, page, errores } = await abrir(browser, ALUMNO, {});
  igual("sin barra de pestañas", await page.$$eval(".jornada-nav", (n) => n.length), 0);
  igual("body sin la clase jornada", await page.evaluate(() => document.body.classList.contains("jornada")), false);
  igual("nada marcado con data-jornada", await page.$$eval("[data-jornada]", (n) => n.length), 0);
  igual("sin errores", errores, []);
  await ctx.close();
}

async function pruebaProfesoraAnotada(browser) {
  console.log("\nUna profesora anotada sigue con su panel (las pestañas son del alumno)");
  const { ctx, page } = await abrir(browser, PROFE, ANOTADO(PROFE.id));
  igual("sin barra de pestañas", await page.$$eval(".jornada-nav", (n) => n.length), 0);
  await ctx.close();
}

async function pruebaPestanas(browser) {
  console.log("\nCon la fila: cinco pestañas y cada cosa en la suya");
  const { ctx, page, errores } = await abrir(browser, ALUMNO, ANOTADO(ALUMNO.id), { viewport: { width: 1280, height: 900 } });
  igual("las pestañas", await page.$$eval(".jornada-nav button[data-pestana]", (b) => b.map((x) => x.textContent.trim())),
    ["Inicio", "Clases", "Entrenar", "Jugar", "Perfil"]);
  igual("abre en Inicio", await page.$eval(".jornada-nav button[aria-current='page']", (b) => b.textContent.trim()), "Inicio");

  let v = await page.evaluate(QUE_SE_VE);
  igual("«Hoy te toca» es de Entrenar (en Inicio lo resume su sala)", v.ids["progreso-alumno"].split(":")[0], "entrenar");
  igual("«Tus clases» es de Clases y no se ve en Inicio", v.ids["tus-clases"].startsWith("clases:") && v.ids["tus-clases"].endsWith(":no"), true);
  igual("«Jugar y competir» no se ve en Inicio", v.grupos["Jugar y competir"], "jugar:no");
  igual("el buscador (sin pestaña) se ve", v.ids["buscar-panel"], "-:ve");
  const sinPestana = Object.entries(v.grupos).filter(([, x]) => x.startsWith("-")).map(([t]) => t);
  igual("todo grupo del alumno tiene su pestaña", sinPestana, []);

  await page.click(".jornada-nav button[data-pestana='jugar']");
  v = await page.evaluate(QUE_SE_VE);
  igual("en Jugar se ve «Jugar y competir»", v.grupos["Jugar y competir"], "jugar:ve");
  igual("en Jugar no se ve «Hoy te toca»", v.ids["progreso-alumno"].endsWith(":no"), true);
  igual("aria-current pasó a Jugar", await page.$eval(".jornada-nav button[aria-current='page']", (b) => b.dataset.pestana), "jugar");
  igual("el foco va al título de la pestaña", await page.evaluate(() => document.activeElement && document.activeElement.id + "=" + document.activeElement.textContent), "jornada-titulo=Jugar");

  await page.click(".jornada-nav button[data-pestana='perfil']");
  igual("los Puntos Ajedrez se mudaron a Perfil", await page.evaluate(() => !!document.querySelector("#jornada-perfil #puntos-ajedrez")), true);
  v = await page.evaluate(QUE_SE_VE);
  igual("en Perfil se ve «Tu cuenta»", v.grupos["Tu cuenta"], "perfil:ve");

  console.log("\nBuscar destapa todas las pestañas");
  await page.fill("#buscar-panel-campo", "a");
  await page.waitForTimeout(200);
  igual("ninguna sección queda fuera mientras se busca", await page.$$eval(".jornada-fuera", (n) => n.length), 0);
  await page.fill("#buscar-panel-campo", "");
  await page.dispatchEvent("#buscar-panel-campo", "input");
  await page.waitForTimeout(200);
  cierto("al borrar la búsqueda vuelven las pestañas", (await page.$$eval(".jornada-fuera", (n) => n.length)) > 0);

  console.log("\nEn la computadora, el menú a la izquierda");
  const caja = await page.evaluate(() => {
    const nav = document.querySelector(".jornada-nav").getBoundingClientRect();
    const cont = document.querySelector(".jornada-marco > .max-w-6xl").getBoundingClientRect();
    return { pos: getComputedStyle(document.querySelector(".jornada-nav")).position, izquierda: nav.right <= cont.left + 1 };
  });
  igual("el menú es sticky y queda a la izquierda", caja, { pos: "sticky", izquierda: true });
  igual("sin errores", errores, []);
  await ctx.close();
}

async function pruebaCelular(browser) {
  console.log("\nEn el celular, la barra fija abajo");
  const { ctx, page, errores } = await abrir(browser, ALUMNO, ANOTADO(ALUMNO.id), { viewport: { width: 390, height: 844 } });
  const barra = await page.evaluate(() => {
    const n = document.querySelector(".jornada-nav");
    const r = n.getBoundingClientRect();
    return { pos: getComputedStyle(n).position, abajo: Math.abs(r.bottom - innerHeight) <= 1, ancho: Math.round(r.width) };
  });
  igual("fija, pegada abajo y de lado a lado", barra, { pos: "fixed", abajo: true, ancho: 390 });
  igual("la página no se ensancha", await page.evaluate(() => document.documentElement.scrollWidth <= 390), true);
  igual("sin errores", errores, []);
  await ctx.close();
}

// Los grupos de Entrenar que se ven ahora mismo.
const GRUPOS_VISIBLES_DE = (pestana) => Array.from(document.querySelectorAll("#tile-grid > section"))
  .filter((s) => (s.dataset.jornada || "").split(" ").includes(pestana) && s.checkVisibility())
  .map((s) => s.dataset.grupo);

async function pruebaSecciones(browser) {
  console.log("\nEn la computadora, lo de Entrenar por separado en el menú");
  const { ctx, page, errores } = await abrir(browser, ALUMNO, ANOTADO(ALUMNO.id), { viewport: { width: 1280, height: 900 } });
  igual("debajo de Entrenar, sus secciones", await page.$$eval(".jornada-nav li:has(> button[data-pestana='entrenar']) .jornada-sub > li > *", (b) => b.map((x) => x.textContent.trim())),
    ["Estudiar", "Aprender", "Entrenamiento básico", "Entrenamiento intermedio", "Entrenamiento avanzado", "Habilidades"]);
  igual("debajo de Jugar, preparar a un rival (enlace a «Prepárate tú»)", await page.$$eval(".jornada-nav li:has(> button[data-pestana='jugar']) .jornada-sub a", (a) => a.map((x) => [x.textContent.trim(), x.getAttribute("href")])),
    [["Preparar a un rival", "plan-rival.html"]]);
  cierto("las secciones se ven en el menú", await page.$eval(".jornada-nav .jornada-sub button[data-seccion='Aprender']", (b) => b.checkVisibility()));
  igual("la fila del celular no se ve en la computadora", await page.$$eval(".jornada-fila", (f) => f.filter((x) => x.checkVisibility()).length), 0);

  await page.click(".jornada-nav .jornada-sub button[data-seccion='Aprender']");
  igual("al elegir Aprender, de Entrenar solo se ve Aprender", await page.evaluate(GRUPOS_VISIBLES_DE, "entrenar"), ["Aprender"]);
  igual("Aprender es la página; Entrenar queda marcada como parte", await page.evaluate(() => [
    document.querySelector(".jornada-nav .jornada-sub button[data-seccion='Aprender']").getAttribute("aria-current"),
    document.querySelector(".jornada-nav button[data-pestana='entrenar']").getAttribute("aria-current")]), ["page", "true"]);
  igual("el título dice la sección", await page.$eval("#jornada-titulo", (t) => t.textContent), "Entrenar · Aprender");
  await page.click(".jornada-nav button[data-pestana='entrenar']");
  const todos = await page.evaluate(GRUPOS_VISIBLES_DE, "entrenar");
  igual("la pestaña Entrenar vuelve a mostrar todo, Estudiar incluido", todos.includes("Estudiar") && todos.includes("Aprender") && todos.length >= 5, true);

  console.log("\nLa sesión también en Clases");
  await page.click(".jornada-nav button[data-pestana='clases']");
  igual("«Clase en vivo» está en Inicio y en Clases", await page.evaluate(() => {
    const s = Array.from(document.querySelectorAll("#tile-grid > section")).find((x) => x.dataset.grupo === "Clase en vivo");
    return s ? [s.dataset.jornada, s.checkVisibility()] : "falta";
  }), ["inicio clases", true]);
  igual("el estado de la clase en vivo también es de Clases", await page.$eval("#session-status-card", (s) => s.dataset.jornada), "inicio clases");
  igual("sin errores", errores, []);
  await ctx.close();

  console.log("\nEn el celular, las secciones en una fila arriba de la pestaña");
  const c = await abrir(browser, ALUMNO, ANOTADO(ALUMNO.id), { viewport: { width: 390, height: 844 } });
  await c.page.click(".jornada-nav button[data-pestana='entrenar']");
  igual("la fila de Entrenar se ve y trae todo", await c.page.$$eval(".jornada-fila[data-jornada='entrenar']", (f) => f.filter((x) => x.checkVisibility()).map((x) => Array.from(x.children).map((b) => b.textContent.trim()))),
    [["Todo", "Estudiar", "Aprender", "Entrenamiento básico", "Entrenamiento intermedio", "Entrenamiento avanzado", "Habilidades"]]);
  igual("el menú de la computadora no se ve en el celular", await c.page.$$eval(".jornada-sub", (s) => s.filter((x) => x.checkVisibility()).length), 0);
  await c.page.click(".jornada-fila[data-jornada='entrenar'] button[data-seccion='Mejorar por habilidades']");
  igual("Habilidades queda sola", await c.page.evaluate(GRUPOS_VISIBLES_DE, "entrenar"), ["Mejorar por habilidades"]);
  igual("y abierta (en el celular los grupos arrancan plegados)", await c.page.evaluate(() => {
    const s = Array.from(document.querySelectorAll("#tile-grid > section")).find((x) => x.dataset.grupo === "Mejorar por habilidades");
    const b = s.querySelector("h2 button[aria-expanded]");
    return b ? b.getAttribute("aria-expanded") : "sin botón";
  }), "true");
  await c.page.click(".jornada-nav button[data-pestana='jugar']");
  igual("en Jugar, la fila trae preparar a un rival", await c.page.$$eval(".jornada-fila[data-jornada='jugar'] a", (a) => a.filter((x) => x.checkVisibility()).map((x) => x.getAttribute("href"))), ["plan-rival.html"]);
  igual("la página no se ensancha con la fila", await c.page.evaluate(() => document.documentElement.scrollWidth <= 390), true);
  igual("sin errores", c.errores, []);
  await c.ctx.close();
}

async function pruebaAspecto(browser) {
  console.log("\nEl aspecto del panel jornada: el tema «jornada» para la cuenta anotada");
  const { ctx, page, errores } = await abrir(browser, ALUMNO, ANOTADO(ALUMNO.id), { viewport: { width: 1280, height: 900 } }, "", { plataforma_tema_v1: "bosque" });
  await page.waitForTimeout(300);
  const a = await page.evaluate(() => {
    const css = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : "falta"; };
    return {
      tema: document.documentElement.getAttribute("data-tema"),
      guardado: localStorage.getItem("plataforma_tema_v1"),
      previo: localStorage.getItem("panel_jornada_tema_previo_v1"),
      encabezado: css("#header", "backgroundColor"),
      fondo: getComputedStyle(document.body).backgroundColor,
      tarjeta: css("#progreso-alumno", "boxShadow"),
      titulo: css(".font-serif", "fontFamily"),
      logo: css("#header img[src$='logo-marca.png']", "objectPosition"),
    };
  });
  igual("queda puesto el tema jornada", [a.tema, a.guardado], ["jornada", "jornada"]);
  igual("y se guarda el que había, para devolverlo", a.previo, "bosque");
  igual("el encabezado es blanco", a.encabezado, "rgb(255, 255, 255)");
  igual("el fondo es gris azulado (brand-50 del tema)", a.fondo, "rgb(239, 244, 246)");
  cierto("las tarjetas llevan borde fino en vez de sombra", /0px 0px 0px 1px/.test(a.tarjeta), a.tarjeta);
  cierto("los títulos van en Inter", /^"?Inter/.test(a.titulo), a.titulo);
  cierto("el logo crema se pinta con su máscara (la imagen sale de la vista)", /-9999px/.test(a.logo), a.logo);
  igual("sin errores", errores, []);
  await ctx.close();

  console.log("\nUna cuenta que no está en la prueba recupera su tema");
  const b = await abrir(browser, ALUMNO, {}, { viewport: { width: 1280, height: 900 } }, "",
    { plataforma_tema_v1: "jornada", panel_jornada_tema_previo_v1: "bosque" });
  await b.page.waitForTimeout(300);
  igual("vuelve el tema de antes", await b.page.evaluate(() => [document.documentElement.getAttribute("data-tema"), localStorage.getItem("plataforma_tema_v1"), localStorage.getItem("panel_jornada_tema_previo_v1")]),
    ["bosque", "bosque", null]);
  await b.ctx.close();

  const c = await abrir(browser, ALUMNO, {}, {}, "", { plataforma_tema_v1: "jornada" });
  await c.page.waitForTimeout(300);
  igual("sin tema guardado de antes, vuelve el Clásico", await c.page.evaluate(() => [document.documentElement.getAttribute("data-tema"), localStorage.getItem("plataforma_tema_v1")]), [null, null]);
  await c.ctx.close();

  const d = await abrir(browser, ALUMNO, {}, {}, "", { plataforma_tema_v1: "princesas" });
  await d.page.waitForTimeout(300);
  igual("y a quien tenía otro tema no se lo toca", await d.page.evaluate(() => document.documentElement.getAttribute("data-tema")), "princesas");
  await d.ctx.close();
}

async function pruebaInicio(browser) {
  console.log("\nEl Inicio nuevo: la clase, las salas y lo que viene, con lo que dice la base");
  const dia = 86400000, ahora = Date.now();
  const manana = new Date(ahora + dia), pasado = new Date(ahora + 2 * dia);
  const datos = Object.assign(ANOTADO(ALUMNO.id), { rpc: {
    mi_proxima_clase: [{ inicio: manana.toISOString(), fin: new Date(manana.getTime() + 3600000).toISOString(), titulo: "Clavadas y enfiladas", modalidad: "en_linea", profesor: "Óscar Angulo" }],
    mis_clases_proximas: [
      { inicio: manana.toISOString(), fin: new Date(manana.getTime() + 3600000).toISOString(), titulo: "Clavadas y enfiladas", modalidad: "en_linea", profesor: "Óscar Angulo" },
      { inicio: new Date(ahora + 4 * dia).toISOString(), fin: new Date(ahora + 4 * dia + 3600000).toISOString(), titulo: "Mates del pasillo", modalidad: "en_linea", profesor: "Óscar Angulo" },
    ],
    tareas_con_avance: [
      { id: "t1", titulo: "Mates en una jugada", vence_at: pasado.toISOString(), renglones: 10, cumplidos: 9 },
      { id: "t2", titulo: "Finales de peones", vence_at: new Date(ahora + 5 * dia).toISOString(), renglones: 5, cumplidos: 0 },
      { id: "t3", titulo: "Una que ya venció", vence_at: new Date(ahora - dia).toISOString(), renglones: 3, cumplidos: 0 },
      { id: "t4", titulo: "Una ya hecha", vence_at: new Date(ahora - 3 * dia).toISOString(), renglones: 4, cumplidos: 4, situacion: "completada" },
      { id: "t5", titulo: "Una que todavía no se abre", vence_at: new Date(ahora + 9 * dia).toISOString(), renglones: 4, cumplidos: 0, situacion: "programada" },
    ],
    entreno_mi_mes: { ejercicios: 40 },
    entreno_mi_semana: { dias: [{ dia: "a", n: 4 }, { dia: "b", n: 0 }, { dia: "c", n: 6 }, { dia: "d", n: 2 }, { dia: "e", n: 5 }, { dia: "f", n: 1 }, { dia: "hoy", n: 3 }] },
    mi_rango: [{ rango: "alfil", nombre: "Alfil", puntos: 3200, siguiente: "torre", siguiente_nombre: "Torre", umbral_siguiente: 7000 }],
    informes_diagnosticos_alumnos: [{ student_id: ALUMNO.id, fecha: "2026-10-26T16:00:00Z", detalle: { nivel: "intermedio", nivel_etiqueta: "intermedio" } }],
    saldo_de_puntos: 1250,
  } });
  const { ctx, page, errores } = await abrir(browser, ALUMNO, datos, { viewport: { width: 1366, height: 900 } });
  await page.waitForFunction(() => {
    const s = document.querySelector('.jornada-sala[data-sala="tareas"] .jornada-sala-grande');
    return s && s.textContent !== "—";
  }, null, { timeout: 15000 }).catch(() => {});
  const salas = await page.$$eval(".jornada-sala", (as) => as.map((a) => [a.dataset.sala, a.querySelector(".jornada-sala-grande").textContent, a.querySelector(".jornada-sala-det").textContent]));
  const de = (id) => (salas.find((s) => s[0] === id) || [id, "falta", "falta"]);
  igual("las seis salas, en orden", salas.map((s) => s[0]), ["hoy", "tareas", "puntos", "rango", "diagnostico", "clases"]);
  igual("hoy entrenaste: el último día de la semana", de("hoy").slice(1), ["3 ejercicios", "Esta semana: 21"]);
  igual("tareas por hacer: las que no vencieron, la más cercana primero", de("tareas").slice(1), ["2", "«Mates en una jugada», vence pasado ".replace("pasado ", "") + "el " + new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", weekday: "long" }).format(pasado)]);
  igual("los Puntos Ajedrez", de("puntos").slice(1), ["1250".replace(/\B(?=(\d{3})+(?!\d))/g, " "), "Canjéalos en la tienda"].map((x, i) => i === 0 ? new Intl.NumberFormat("es-CR").format(1250) : x));
  igual("el rango y cuánto falta para el siguiente", de("rango").slice(1), ["Alfil", "Para Torre: " + new Intl.NumberFormat("es-CR").format(3800) + " puntos"]);
  igual("el nivel del último diagnóstico", de("diagnostico")[1], "Intermedio");
  igual("clases en los próximos 7 días", de("clases")[1], "2");
  const clase = await page.evaluate(() => {
    const c = document.getElementById("jornada-clase");
    return c && c.checkVisibility() ? [c.querySelector(".jornada-clase-chip").textContent, c.querySelector(".jornada-clase-titulo").textContent, c.querySelector(".jornada-clase-boton").textContent] : "no se ve";
  });
  igual("la tarjeta de la clase dice cuándo es la próxima", clase[0].startsWith("Tu próxima clase: mañana a las"), true);
  igual("y su título y su botón", clase.slice(1), ["Clavadas y enfiladas", "Ver tus clases"]);
  const viene = await page.$$eval(".jornada-viene-item b", (b) => b.map((x) => x.textContent));
  igual("lo que viene, por fecha", viene, ["Clavadas y enfiladas", "Vence «Mates en una jugada»", "Mates del pasillo", "Vence «Finales de peones»"]);
  const lado = await page.evaluate(() => {
    const p = document.querySelector(".jornada-inicio-principal").getBoundingClientRect();
    const l = document.querySelector(".jornada-inicio-lado").getBoundingClientRect();
    return l.left >= p.right - 1;
  });
  igual("en la computadora, lo que viene va a la derecha", lado, true);

  console.log("\nEl banner y los cuatro gráficos");
  const banner = await page.evaluate(() => {
    const c = document.getElementById("jornada-clase");
    return {
      saludo: c.querySelector(".jornada-clase-saludo").textContent,
      atajos: Array.from(c.querySelectorAll(".jornada-clase-atajos li > *")).map((x) => x.textContent),
      dibujo: c.querySelector(".jornada-clase-dibujo").checkVisibility(),
      dibujoOculto: c.querySelector(".jornada-clase-dibujo svg").getAttribute("aria-hidden"),
    };
  });
  cierto("el banner saluda con la hora y la fecha de Costa Rica", /^Buen(os días|as tardes|as noches), Oscarov\. /.test(banner.saludo), banner.saludo);
  igual("trae sus atajos", banner.atajos, ["Tareas", "Entrenar", "Jugar", "Repasar mis clases", "Mi cuaderno"]);
  igual("y su ilustración, que es adorno", [banner.dibujo, banner.dibujoOculto], [true, "true"]);
  const datosDe = (id) => page.$$eval('.jornada-grafico[data-grafico="' + id + '"] .jornada-grafico-datos li', (lis) => lis.map((li) => li.textContent.trim()));
  igual("los cuatro gráficos", await page.$$eval(".jornada-grafico", (g) => g.map((x) => x.dataset.grafico)), ["semana", "rango", "tareas", "meses"]);
  igual("la semana, con sus números escritos", await datosDe("semana"), ["Esta semana21 ejercicios", "Hoy3", "Tu mejor día6"]);
  igual("el camino al rango: de Alfil (3000) a Torre (7000) con 3200", await datosDe("rango"), ["Rango actualAlfil", "Hacia Torre5 %", "Te faltan" + new Intl.NumberFormat("es-CR").format(3800) + " puntos"]);
  igual("las tareas por cómo van (la programada no cuenta)", await datosDe("tareas"), ["Completadas1", "Por hacer2", "Vencidas1"]);
  igual("el entrenamiento por mes", await datosDe("meses"), ["Este mes40", "El mes pasado40", "En seis meses240"]);
  igual("cada gráfico dibuja su SVG, que es adorno", await page.$$eval(".jornada-grafico-dibujo svg", (s) => s.map((x) => x.getAttribute("aria-hidden"))), ["true", "true", "true", "true"]);
  igual("las barras: una por día, y la de hoy distinta", await page.$$eval('.jornada-grafico[data-grafico="semana"] svg rect', (r) => r.length), 7);

  igual("«Hoy te toca» completo pasó a Entrenar", await page.$eval("#progreso-alumno", (s) => s.dataset.jornada), "entrenar");
  await page.click('.jornada-sala[data-sala="hoy"]');
  igual("la sala de hoy lleva a Entrenar", await page.$eval(".jornada-nav button[aria-current='page']", (b) => b.dataset.pestana), "entrenar");
  igual("sin errores", errores, []);
  await ctx.close();

  console.log("\nSi una consulta falla, la sala lo dice y no inventa un número");
  const datos2 = Object.assign(ANOTADO(ALUMNO.id), { lanzar: ["tareas_con_avance", "mi_rango"] });
  const c = await abrir(browser, ALUMNO, datos2, { viewport: { width: 1366, height: 900 } });
  await c.page.waitForTimeout(800);
  const malas = await c.page.$$eval(".jornada-sala", (as) => as.filter((a) => ["tareas", "rango"].includes(a.dataset.sala)).map((a) => [a.querySelector(".jornada-sala-grande").textContent, a.querySelector(".jornada-sala-det").textContent]));
  igual("tareas y rango quedan en «—» y lo dicen", malas, [["—", "No se pudo cargar"], ["—", "No se pudo cargar"]]);
  await c.ctx.close();
}

/* Las animaciones: se anota todo lo que pasa desde antes de cargar (un
   MutationObserver), porque el conteo dura menos de un segundo y abrir()
   ya espera más que eso. */
const ESPIA_ANIMACION = () => {
  window.__anim = { entra: 0, contando: [], textoAlContar: [] };
  new MutationObserver((ms) => ms.forEach((m) => {
    const t = m.target;
    if (m.attributeName === "class" && t.classList && t.classList.contains("jornada-entra")) window.__anim.entra += 1;
    if (m.attributeName === "data-contando" && t.dataset && t.dataset.contando) {
      window.__anim.contando.push(t.dataset.contando);
      window.__anim.textoAlContar.push(t.textContent);
    }
  })).observe(document, { subtree: true, attributes: true, attributeFilter: ["class", "data-contando"] });
};

async function pruebaAnimaciones(browser) {
  console.log("\nLas animaciones: solo si el sistema no pide menos movimiento, y sin esconder datos");
  const datos = Object.assign(ANOTADO(ALUMNO.id), { rpc: { saldo_de_puntos: 1250 } });
  const vista = { viewport: { width: 1366, height: 900 } };

  const a = await abrir(browser, ALUMNO, datos, Object.assign({ reducedMotion: "no-preference" }, vista), "", { __espia: "1" });
  await a.ctx.addInitScript(ESPIA_ANIMACION);
  await a.page.reload({ waitUntil: "networkidle" });
  await a.page.waitForSelector("#app:not(.hidden)");
  await a.page.waitForTimeout(1500);
  const r = await a.page.evaluate(() => window.__anim);
  cierto("al entrar, las secciones y tarjetas entran animadas (" + r.entra + ")", r.entra > 3);
  const cuenta = r.contando.filter((x) => /^[\d\s ]+$/.test(x)).map((x) => Number(x.replace(/\D/g, "")));
  cierto("los Puntos Ajedrez cuentan hacia arriba hasta 1 250 (" + cuenta.length + " pasos)", cuenta.length > 3 && cuenta[0] < cuenta[cuenta.length - 1]);
  const mil = new Intl.NumberFormat("es-CR").format(1250);
  cierto("mientras cuenta, el texto ya es el número de verdad", r.textoAlContar.includes(mil));
  igual("al terminar, no queda nada contando", await a.page.$$eval("[data-contando]", (n) => n.length), 0);
  igual("ni ninguna pieza con la animación puesta", await a.page.$$eval(".jornada-entra", (n) => n.length), 0);
  igual("el número que queda", await a.page.$eval('.jornada-sala[data-sala="puntos"] .jornada-sala-grande', (s) => s.textContent), mil);
  const antes = await a.page.evaluate(() => window.__anim.entra);
  await a.page.click('.jornada-nav button[data-pestana="jugar"]');
  await a.page.waitForTimeout(100);
  cierto("al cambiar de pestaña, lo de la pestaña entra animado", (await a.page.evaluate(() => window.__anim.entra)) > antes);
  const fuera = await a.page.$$eval(".jornada-entra", (n) => n.filter((x) => !x.checkVisibility()).length);
  igual("y solo lo que se ve", fuera, 0);
  igual("la animación existe en la hoja (no solo la clase)", await a.page.evaluate(() => {
    const p = document.querySelector(".jornada-entra");
    return p ? getComputedStyle(p).animationName : "ninguna pieza";
  }), "jornada-entrar");
  await a.page.hover('.jornada-nav button[data-pestana="inicio"]');
  await a.page.click('.jornada-nav button[data-pestana="inicio"]');
  await a.page.waitForTimeout(900);
  await a.page.hover('.jornada-sala[data-sala="puntos"]');
  await a.page.waitForTimeout(400);
  cierto("una sala sube un poco con el ratón", await a.page.$eval('.jornada-sala[data-sala="puntos"]', (s) => getComputedStyle(s).transform !== "none"));
  igual("sin errores", a.errores, []);
  await a.ctx.close();

  const b = await abrir(browser, ALUMNO, datos, Object.assign({ reducedMotion: "reduce" }, vista));
  await b.ctx.addInitScript(ESPIA_ANIMACION);
  await b.page.reload({ waitUntil: "networkidle" });
  await b.page.waitForSelector("#app:not(.hidden)");
  await b.page.waitForTimeout(1200);
  await b.page.click('.jornada-nav button[data-pestana="jugar"]');
  await b.page.waitForTimeout(100);
  const rb = await b.page.evaluate(() => window.__anim);
  igual("con «reducir movimiento»: nada entra animado ni cuenta", [rb.entra, rb.contando.length], [0, 0]);
  await b.page.click('.jornada-nav button[data-pestana="inicio"]');
  await b.page.hover('.jornada-sala[data-sala="puntos"]');
  await b.page.waitForTimeout(300);
  igual("ni sube con el ratón", await b.page.$eval('.jornada-sala[data-sala="puntos"]', (s) => getComputedStyle(s).transform), "none");
  igual("y los Puntos están igual", await b.page.$eval('.jornada-sala[data-sala="puntos"] .jornada-sala-grande', (s) => s.textContent), mil);
  await b.ctx.close();
}

async function pruebaHash(browser) {
  console.log("\nclases.html#tus-clases abre la pestaña donde vive");
  const { ctx, page } = await abrir(browser, ALUMNO, ANOTADO(ALUMNO.id), { viewport: { width: 1280, height: 900 } }, "#tus-clases");
  igual("abre en Clases", await page.$eval(".jornada-nav button[aria-current='page']", (b) => b.dataset.pestana), "clases");
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    for (const p of [pruebaSinAnotar, pruebaProfesoraAnotada, pruebaPestanas, pruebaCelular, pruebaSecciones, pruebaAspecto, pruebaInicio, pruebaAnimaciones, pruebaHash]) await p(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nEl panel jornada está como se pidió.");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
