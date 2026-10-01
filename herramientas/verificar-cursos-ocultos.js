/* Comprueba que los cursos escondidos (js/cursos-ocultos.js) no les aparezcan a
   alumnos ni a profesores, y que quien administra los siga viendo.

   Lo que no deja BAJAR el contenido es worker.js, y eso lo prueba
   verificar-worker.js (incluido que su lista sea la misma de acá). Este mira
   lo que se PINTA, en un navegador de verdad y con un Supabase de mentira:

     1. «Mis cursos» (cursos/academia/index.html): las tarjetas que se ven.
     2. La página de un curso escondido: sin pedir el contenido, lo dice.
     3. «Curso anterior / siguiente» de un curso visible no lleva a uno escondido.
     4. El material para tareas y exámenes (MaterialPlataforma.cursos()).
     5. Cada página que usa la lista la carga ANTES del script que la consulta:
        si no, window.CursosOcultos no existe y no se esconde nada, sin error.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-cursos-ocultos.js                       */
const { chromium } = require("./lib/playwright-con-sesion");
const fs = require("fs");
const path = require("path");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = String(hallado), b = String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

const OCULTOS = ((fs.readFileSync(path.join(RAIZ, "js", "cursos-ocultos.js"), "utf8")
  .match(/var SLUGS = \[([^\]]*)\]/) || [])[1] || "").match(/[a-z0-9-]+/g) || [];

function clienteFalso(perfil) {
  return `
(function () {
  const PERFIL = ${JSON.stringify(perfil)};
  function constructor(filas) {
    let unica = false;
    const b = {
      select() { return b; }, eq() { return b; }, order() { return b; }, in() { return b; },
      limit() { return b; }, range() { return b; }, is() { return b; }, not() { return b; },
      gte() { return b; }, lte() { return b; }, upsert() { return b; }, insert() { return b; },
      update() { return b; }, delete() { return b; },
      maybeSingle() { unica = true; return b; }, single() { unica = true; return b; },
      then(res, rej) {
        let d = filas;
        if (Array.isArray(d) && unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: "u-quien" }, access_token: "t" } } }),
      getUser: () => Promise.resolve({ data: { user: { id: "u-quien" } } }),
      signOut: () => Promise.resolve({}),
    },
    from: (t) => constructor(t === "profiles" ? [PERFIL] : []),
    rpc: () => constructor([]),
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
})();
`;
}

const QUIENES = [
  { nombre: "alumno",         admin: false, perfil: { id: "u-quien", is_admin: false, role: "alumno" } },
  { nombre: "profesor",       admin: false, perfil: { id: "u-quien", is_admin: false, role: "profesor" } },
  { nombre: "administración", admin: true,  perfil: { id: "u-quien", is_admin: true,  role: "profesor" } },
];

async function abrir(browser, ruta, quien) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [], protegidos = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("request", (r) => { if (r.url().includes("/cursos/protegido/")) protegidos.push(r.url().replace(BASE, "")); });
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(quien.perfil) }));
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  return { ctx, page, errores, protegidos };
}

(async () => {
  igual("la lista de cursos escondidos se lee", OCULTOS.length > 0, true);

  console.log("\n=== 5. Cada página carga la lista antes de consultarla ===");
  {
    const USAN = ["sesion.js", "clases.js", "informes.js", "curso-academia.js", "material-plataforma.js"];
    const paginas = [];
    const recorrer = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      if (["node_modules", ".git", "herramientas", "docs", "supabase"].includes(e.name)) return;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(p); else if (e.name.endsWith(".html")) paginas.push(p);
    });
    recorrer(RAIZ);
    const mal = [];
    for (const p of paginas) {
      const html = fs.readFileSync(p, "utf8");
      const usa = USAN.map((n) => html.search(new RegExp("<script[^>]+js/" + n.replace(".", "\\."))))
        .filter((i) => i >= 0);
      if (!usa.length) continue;
      // material-plataforma.js solo pide la lista en cursos(), que llaman tareas y exámenes.
      const soloMaterial = !USAN.slice(0, 4).some((n) => html.includes("js/" + n)) &&
        !/js\/(tareas|examenes)\.js/.test(html);
      if (soloMaterial) continue;
      const lista = html.search(/<script[^>]+js\/cursos-ocultos\.js/);
      if (lista < 0 || lista > Math.min(...usa)) mal.push(path.relative(RAIZ, p));
    }
    igual("páginas que la consultan sin haberla cargado antes", mal.join(", ") || "ninguna", "ninguna");
  }

  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    console.log("\n=== 1. «Mis cursos» ===");
    for (const quien of QUIENES) {
      const { ctx, page, errores } = await abrir(browser, "/cursos/academia/index.html", quien);
      await page.waitForFunction(() => document.querySelector("[data-academia-catalogo].ac-listo"), null, { timeout: 20000 });
      const r = await page.evaluate(() => [...document.querySelectorAll("[data-curso]")].map((c) => ({
        slug: c.dataset.curso, ve: c.checkVisibility(), marca: !!c.querySelector(".ac-oculto") && c.querySelector(".ac-oculto").checkVisibility(),
      })));
      const vistos = r.filter((c) => c.ve).map((c) => c.slug);
      const ocultosVistos = vistos.filter((s) => OCULTOS.includes(s));
      if (quien.admin) {
        igual(quien.nombre + ": ve los escondidos", ocultosVistos.length, OCULTOS.length);
        igual(quien.nombre + ": y cada uno dice que está escondido", r.filter((c) => OCULTOS.includes(c.slug) && c.marca).length, OCULTOS.length);
      } else {
        igual(quien.nombre + ": no ve ninguno escondido", ocultosVistos.join(", ") || "ninguno", "ninguno");
        igual(quien.nombre + ": y los demás sí", vistos.length > 0 && vistos.every((s) => !OCULTOS.includes(s)), true);
      }
      igual(quien.nombre + ": sin errores en la página", errores.join(" | ") || "ninguno", "ninguno");
      await ctx.close();
    }

    console.log("\n=== 2. La página de un curso escondido ===");
    const escondido = OCULTOS[0];
    for (const quien of QUIENES) {
      const { ctx, page, errores, protegidos } = await abrir(browser, "/cursos/academia/" + escondido + ".html", quien);
      if (quien.admin) {
        await page.waitForSelector("#course-content-body details", { timeout: 20000 });
        igual(quien.nombre + ": carga las lecciones", await page.locator("#course-content-body details").count() > 0, true);
      } else {
        await page.waitForFunction(() => /no está disponible/.test(document.getElementById("course-content-body").textContent), null, { timeout: 20000 });
        igual(quien.nombre + ": dice que no está disponible", true, true);
        igual(quien.nombre + ": y ni pide el contenido", protegidos.join(", ") || "nada", "nada");
        igual(quien.nombre + ": la línea de progreso no se ve", await page.locator("#ac-progreso").isVisible(), false);
      }
      igual(quien.nombre + ": sin errores en la página", errores.join(" | ") || "ninguno", "ninguno");
      await ctx.close();
    }

    console.log("\n=== 3. «Curso anterior / siguiente» ===");
    {
      // El mapa de los finales trae «Curso anterior: Finales Prácticos».
      const html = fs.readFileSync(path.join(RAIZ, "cursos/academia/el-mapa-de-los-finales.html"), "utf8");
      igual("la página de prueba enlaza a uno escondido", OCULTOS.some((s) => html.includes('href="' + s + '.html"')), true);
      for (const quien of [QUIENES[0], QUIENES[2]]) {
        const { ctx, page } = await abrir(browser, "/cursos/academia/el-mapa-de-los-finales.html", quien);
        await page.waitForSelector("#course-content-body details", { timeout: 20000 });
        const enlaces = await page.evaluate((oc) => [...document.querySelectorAll("main a[href]")]
          .filter((a) => oc.includes((a.getAttribute("href").match(/^([a-z0-9-]+)\.html$/) || [])[1])).length, OCULTOS);
        igual(quien.nombre + ": enlaces a cursos escondidos", enlaces > 0, quien.admin);
        await ctx.close();
      }
    }

    console.log("\n=== 4. El material para tareas y exámenes ===");
    {
      const { ctx, page } = await abrir(browser, "/tareas.html", QUIENES[1]);
      const slugs = await page.evaluate(async () => (await window.MaterialPlataforma.cursos()).map((c) => c.slug));
      igual("ofrece cursos", slugs.length > 0, true);
      igual("ninguno escondido", slugs.filter((s) => OCULTOS.includes(s)).join(", ") || "ninguno", "ninguno");
      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
