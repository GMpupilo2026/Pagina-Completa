/* Puntos Ajedrez: la tienda de puntos (puntos-tienda.html) y la tarjeta del
   panel (js/puntos.js).

   La cuenta de verdad —que cerrar una clase paga una sola vez, que un
   ejercicio de entrenamiento no se puede repetir para hacer trampa, que
   canjear sin saldo no pasa— la hace la base (ver supabase/migraciones/
   20261008054002_puntos_acumulados.sql: interno.otorgar_puntos() con su
   "referencia" única, canjear_premio() con pg_advisory_xact_lock). Acá se
   comprueba la PÁGINA: que el saldo se pinte, que un premio que no alcanza
   se vea deshabilitado y diga cuánto falta, que canjear descuente y quede en
   "Mis premios", que equipar/quitar un cosmético se pueda deshacer, que el
   aviso de puntos dobles aparezca solo si está vigente, y que un bono de
   racha nuevo se anuncie (y uno ya reclamado no se repita ni se note).

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-puntos.js                              */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");

const YO = "u-ana";

const CATALOGO = [
  { id: "p-titulo", clave: "titulo_tactico", nombre: "Título: Táctico", descripcion: "Un título junto a tu nombre.",
    emoji: "⚔️", categoria: "cosmetico", tipo_efecto: "titulo", costo_puntos: 150,
    parametros: { texto: "⚔️ Táctico" }, limite_por_alumno: 1, activo: true, orden: 10 },
  { id: "p-doble", clave: "doble_puntos_dia", nombre: "Día de puntos dobles", descripcion: "24 horas al doble.",
    emoji: "✨", categoria: "entrenamiento", tipo_efecto: "doble_puntos", costo_puntos: 200,
    parametros: { horas: 24 }, limite_por_alumno: null, activo: true, orden: 70 },
  { id: "p-avance", clave: "avance_cimientos", nombre: "Adelanta una lección", descripcion: "Abre la siguiente lección.",
    emoji: "📘", categoria: "contenido", tipo_efecto: "curso_adelanto", costo_puntos: 900,
    parametros: { curso: "los-cimientos-del-ajedrez", lecciones: 1 }, limite_por_alumno: null, activo: true, orden: 90 },
  { id: "p-gorro", clave: "accesorio_gorro", nombre: "Gorro de copa", descripcion: "Un adorno que ven tu profe y tus compañeros.",
    emoji: "🎩", categoria: "cosmetico", tipo_efecto: "accesorio_avatar", costo_puntos: 50,
    parametros: {}, limite_por_alumno: 1, activo: true, orden: 15 },
];

function clienteFalso(saldoInicial, misPremiosIniciales, rachaYaReclamada) {
  return `
window.__llamadas = [];
(function () {
  const YO = ${JSON.stringify(YO)};
  const CATALOGO = ${JSON.stringify(CATALOGO)};
  let SALDO = ${JSON.stringify(saldoInicial)};
  let MIS_PREMIOS = ${JSON.stringify(misPremiosIniciales)};
  let RACHA_RECLAMADA = ${JSON.stringify(!!rachaYaReclamada)};
  let siguienteCanje = 1;

  function tabla(nombre) {
    let filas = (nombre === "premios_catalogo" ? CATALOGO : []).slice();
    const b = {
      select() { return b; },
      eq(col, val) { filas = filas.filter((r) => r[col] === val); return b; },
      order(col) { filas = filas.slice().sort((a, b2) => a[col] - b2[col]); return b; },
      then(resolve) { resolve({ data: filas, error: null }); },
    };
    return b;
  }

  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: YO } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: function () {} } } }),
      signOut: () => Promise.resolve({ error: null }),
    },
    from: function (nombre) { return tabla(nombre); },
    rpc: function (nombre, args) {
      window.__llamadas.push({ rpc: nombre, args: args });
      if (nombre === "saldo_de_puntos") return Promise.resolve({ data: SALDO, error: null });
      if (nombre === "historial_de_puntos") return Promise.resolve({ data: [], error: null });
      if (nombre === "mis_premios") return Promise.resolve({ data: MIS_PREMIOS, error: null });
      if (nombre === "accesorios_de") {
        const ids = (args && args.p_ids) || [];
        const salida = [];
        ids.forEach((id) => {
          if (id !== YO) return; // el doble solo conoce lo de YO, como la RLS de verdad.
          const propios = MIS_PREMIOS.filter((p) => p.tipo_efecto === "accesorio_avatar" && p.activo);
          if (propios.length) { const u = propios[propios.length - 1]; salida.push({ student_id: id, emoji: u.emoji, nombre: u.nombre }); }
        });
        return Promise.resolve({ data: salida, error: null });
      }
      if (nombre === "reclamar_bono_racha") {
        if (RACHA_RECLAMADA) return Promise.resolve({ data: [{ nuevo_hito: 7, puntos_otorgados: 25, racha_actual: 7 }], error: null });
        RACHA_RECLAMADA = true;
        SALDO += 25;
        return Promise.resolve({ data: [{ nuevo_hito: 7, puntos_otorgados: 25, racha_actual: 7 }], error: null });
      }
      if (nombre === "canjear_premio") {
        const premio = CATALOGO.find((p) => p.id === args.p_premio_id);
        if (!premio) return Promise.resolve({ data: null, error: { message: "Ese premio ya no está disponible." } });
        const veces = MIS_PREMIOS.filter((p) => p.premio_id === premio.id).length;
        if (premio.limite_por_alumno != null && veces >= premio.limite_por_alumno) {
          return Promise.resolve({ data: null, error: { message: "Ya canjeaste este premio el máximo de veces permitido." } });
        }
        if (SALDO < premio.costo_puntos) {
          return Promise.resolve({ data: null, error: { message: "Te faltan " + (premio.costo_puntos - SALDO) + " puntos para este premio." } });
        }
        SALDO -= premio.costo_puntos;
        const id = "c-" + (siguienteCanje++);
        MIS_PREMIOS.push({
          id: id, premio_id: premio.id, clave: premio.clave, nombre: premio.nombre, emoji: premio.emoji,
          categoria: premio.categoria, tipo_efecto: premio.tipo_efecto, parametros: premio.parametros,
          activo: true, vigente_hasta: null, created_at: new Date().toISOString(),
        });
        return Promise.resolve({ data: [{ canje_id: id, saldo_restante: SALDO }], error: null });
      }
      if (nombre === "equipar_premio") {
        const fila = MIS_PREMIOS.find((p) => p.id === args.p_canje_id);
        if (!fila) return Promise.resolve({ data: null, error: { message: "Ese premio no es tuyo o no existe." } });
        fila.activo = args.p_activo;
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
})();
`;
}

async function contexto(navegador, initScript) {
  const ctx = await navegador.newContext({ serviceWorkers: "block" });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.addInitScript(initScript);
  return ctx;
}

async function abrir(navegador, saldoInicial, misPremiosIniciales, rachaYaReclamada) {
  const ctx = await contexto(navegador, clienteFalso(saldoInicial, misPremiosIniciales, rachaYaReclamada));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  await page.goto(`${BASE}/puntos-tienda.html`, { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 10000 });
  await page.waitForSelector("#tienda-puntos [data-puntos-total]", { timeout: 10000 });
  return { page, ctx, errores };
}

const tarjeta = (page, nombre) => page.locator(`#tienda-puntos article:has(h4:has-text("${nombre}"))`);

async function main() {
  const fallos = [];
  const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

  // ---------- 0) nada de alert/confirm/prompt, ni código escrito en la página ----------
  // Lo pide CLAUDE.md para todo el sitio: "Nunca alert(), confirm() ni
  // prompt()" y "el código de una página va en un archivo de js/, no en un
  // <script> escrito dentro". Un olvido acá no da ningún error: se ve y
  // funciona, hasta que a alguien se le abre un confirm() nativo feo.
  {
    const archivos = ["js/puntos.js", "js/puntos-tienda-pagina.js"];
    archivos.forEach((f) => {
      const src = fs.readFileSync(path.join(RAIZ, f), "utf8");
      ok(!/\b(alert|confirm|prompt)\s*\(/.test(src), `${f}: usa alert/confirm/prompt del navegador`);
    });
    const html = fs.readFileSync(path.join(RAIZ, "puntos-tienda.html"), "utf8");
    ok(!/\son\w+=/.test(html), "puntos-tienda.html: tiene un atributo on… (código inline)");
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    const propios = scripts.filter((m) => !/src=/.test(m[1]) && m[2].trim());
    const permitidos = ["guardia", "oscuro", "tema"]; // los tres bloques generados, iguales en todas las páginas.
    ok(propios.length <= permitidos.length, `puntos-tienda.html: ${propios.length} <script> con código adentro (solo deberían estar los generados: guardia/oscuro/tema)`);
  }

  const navegador = await chromium.launch({ executablePath: CHROME });

  // ---------- 1) el saldo, el catálogo por categoría y quién puede canjear ----------
  {
    const { page, ctx, errores } = await abrir(navegador, 180, []);
    ok((await page.textContent("#tienda-puntos [data-puntos-total]")) === "💎 180 puntos",
      "el saldo no se pinta bien al abrir");

    ok(await page.isVisible('h3:has-text("🎨 Cosméticos")'), "no aparece la sección de cosméticos");
    ok(await page.isVisible('h3:has-text("⚡ Ventajas de entrenamiento")'), "no aparece la de entrenamiento");
    ok(await page.isVisible('h3:has-text("📚 Contenido")'), "no aparece la de contenido");

    const btnTitulo = tarjeta(page, "Título: Táctico").locator("button");
    ok(!(await btnTitulo.isDisabled()), "con 180 puntos debería poder canjear el título de 150");

    const btnDoble = tarjeta(page, "Día de puntos dobles").locator("button");
    ok(await btnDoble.isDisabled(), "con 180 puntos NO debería poder canjear el de 200");
    ok((await tarjeta(page, "Día de puntos dobles").locator("p[aria-live]").textContent()).includes("Te faltan 20 puntos"),
      "no dice cuánto falta para el premio de 200");

    ok((await page.textContent("#tienda-puntos")).includes("Todavía no has canjeado ningún premio"),
      "«Mis premios» debería salir vacío al principio");

    ok(errores.join(" | ") === "", "hubo errores en consola: " + errores.join(" | "));
    await ctx.close();
  }

  // ---------- 2) canjear descuenta, queda en «Mis premios», y no se puede dos veces ----------
  {
    const { page, ctx, errores } = await abrir(navegador, 180, []);
    await tarjeta(page, "Título: Táctico").locator("button").click();
    await page.waitForFunction(() => document.querySelector("#tienda-puntos [data-puntos-total]").textContent === "💎 30 puntos", null, { timeout: 5000 });
    ok(await page.evaluate(() => window.__llamadas.some((l) => l.rpc === "canjear_premio" && l.args.p_premio_id === "p-titulo")),
      "canjear no mandó canjear_premio con el id del premio");

    const fila = page.locator("#tienda-puntos ul li", { hasText: "Título: Táctico" });
    await fila.waitFor({ timeout: 5000 });
    ok(await fila.locator('button[aria-label="Quitar Título: Táctico"]').isVisible(),
      "el premio canjeado no aparece en «Mis premios» con su botón de Quitar");

    // El límite es 1: ya no se puede canjear otra vez.
    const btnTitulo = tarjeta(page, "Título: Táctico").locator("button");
    ok(await btnTitulo.isDisabled(), "ya con el título, el botón debería quedar deshabilitado");
    ok((await tarjeta(page, "Título: Táctico").locator("p[aria-live]").textContent()) === "Ya lo tienes.",
      "no dice «Ya lo tienes.» cuando el límite ya se alcanzó");

    // Quitar / volver a mostrar el cosmético (equipar_premio, sin cambiar el saldo).
    await fila.locator('button[aria-label="Quitar Título: Táctico"]').click();
    await page.waitForFunction(() => !!document.querySelector('[aria-label="Mostrar Título: Táctico"]'), null, { timeout: 5000 });
    ok(await page.evaluate(() => window.__llamadas.some((l) => l.rpc === "equipar_premio" && l.args.p_activo === false)),
      "Quitar no mandó equipar_premio con p_activo false");
    ok((await page.textContent("#tienda-puntos [data-puntos-total]")) === "💎 30 puntos",
      "equipar/quitar un cosmético no debería tocar el saldo");

    ok(errores.join(" | ") === "", "hubo errores en consola: " + errores.join(" | "));
    await ctx.close();
  }

  // ---------- 2 bis) un accesorio de avatar: se ve en «Mis premios» y en Puntos.accesoriosDe/decorarAvatar ----------
  {
    const { page, ctx } = await abrir(navegador, 50, []);
    await tarjeta(page, "Gorro de copa").locator("button").click();
    await page.waitForFunction(() => document.querySelector("#tienda-puntos [data-puntos-total]").textContent === "💎 0 puntos", null, { timeout: 5000 });
    ok((await page.textContent("#tienda-puntos")).includes("Así te ven en la clase en vivo: 🎩 Gorro de copa"),
      "después de canjear el gorro debería decir que así te ven en la clase en vivo");

    // El mismo accesorio que acaba de equipar lo tendría que devolver
    // accesorios_de(), y Puntos.decorarAvatar debería pintarlo como una
    // insignia chica encima de la caja del avatar (lo que usa js/sesion.js
    // en «Alumnos conectados»).
    const insignia = await page.evaluate(async () => {
      const caja = document.createElement("span");
      document.body.appendChild(caja);
      const mapa = await window.Puntos.accesoriosDe(window.sb, ["u-ana"]);
      window.Puntos.decorarAvatar(caja, mapa.get("u-ana"));
      const ins = caja.querySelector("[data-accesorio-avatar]");
      return ins ? ins.textContent : null;
    });
    ok(insignia === "🎩", `Puntos.decorarAvatar no puso la insignia del accesorio equipado (salió ${JSON.stringify(insignia)})`);

    // Quitárselo (equipar_premio con p_activo:false) lo saca de «Mis premios»
    // Y de lo que ve el profesor: accesorios_de() ya no lo debería devolver.
    await page.locator('button[aria-label="Quitar Gorro de copa"]').click();
    await page.waitForFunction(() => !!document.querySelector('[aria-label="Mostrar Gorro de copa"]'), null, { timeout: 5000 });
    const sinInsignia = await page.evaluate(async () => (await window.sb.rpc("accesorios_de", { p_ids: ["u-ana"] })).data);
    ok(Array.isArray(sinInsignia) && sinInsignia.length === 0, "al quitarse el accesorio, accesorios_de() ya no debería devolverlo");
    await ctx.close();
  }

  // ---------- 3) canjear() a secas dice el error cuando el premio no existe ----------
  {
    const { page, ctx } = await abrir(navegador, 1000, []);
    const r = await page.evaluate(() => window.Puntos.canjear(window.sb, "no-existe"));
    ok(r && typeof r.error === "string" && r.error.length > 0,
      "Puntos.canjear no devuelve error cuando el premio no existe: " + JSON.stringify(r));
    await ctx.close();
  }

  // ---------- 4) el aviso de «puntos dobles» solo si está vigente ----------
  {
    const vigente = { id: "c-x", premio_id: "p-doble", clave: "doble_puntos_dia", nombre: "Día de puntos dobles",
      emoji: "✨", categoria: "entrenamiento", tipo_efecto: "doble_puntos", parametros: { horas: 24 },
      activo: true, vigente_hasta: new Date(Date.now() + 3600000).toISOString(), created_at: new Date().toISOString() };
    const { page, ctx } = await abrir(navegador, 50, [vigente]);
    await page.waitForTimeout(300);
    ok(await page.isVisible('text=✨ Puntos dobles activos'), "con un doble_puntos vigente debería verse el aviso");
    await ctx.close();
  }
  {
    const vencido = { id: "c-y", premio_id: "p-doble", clave: "doble_puntos_dia", nombre: "Día de puntos dobles",
      emoji: "✨", categoria: "entrenamiento", tipo_efecto: "doble_puntos", parametros: { horas: 24 },
      activo: true, vigente_hasta: new Date(Date.now() - 3600000).toISOString(), created_at: new Date().toISOString() };
    const { page, ctx } = await abrir(navegador, 50, [vencido]);
    await page.waitForTimeout(300);
    ok(!(await page.isVisible('text=✨ Puntos dobles activos')), "con un doble_puntos VENCIDO no debería verse el aviso");
    await ctx.close();
  }

  // ---------- 5) la tarjeta del panel (Puntos.montarTarjetaPanel): el bono de racha ----------
  {
    const { page, ctx } = await abrir(navegador, 100, []);
    const texto = await page.evaluate(async () => {
      const div = document.createElement("div");
      document.body.appendChild(div);
      await window.Puntos.montarTarjetaPanel(div, { sb: window.sb, alumnoId: "u-ana" });
      return { total: div.querySelector("[data-puntos-total]").textContent, aviso: div.querySelectorAll("p")[1].textContent };
    });
    ok(texto.total === "💎 125 puntos", `la tarjeta debería mostrar 100 + 25 del bono de racha, salió: ${texto.total}`);
    ok(texto.aviso.includes("Racha de 7 días: +25 puntos"), `no avisa el bono de racha nuevo: ${JSON.stringify(texto.aviso)}`);

    // Si se vuelve a montar (otra visita al panel), la racha ya está
    // reclamada: no debe repetir el aviso ni volver a sumar.
    const segunda = await page.evaluate(async () => {
      const div = document.createElement("div");
      document.body.appendChild(div);
      await window.Puntos.montarTarjetaPanel(div, { sb: window.sb, alumnoId: "u-ana" });
      return { total: div.querySelector("[data-puntos-total]").textContent, aviso: div.querySelectorAll("p")[1].textContent };
    });
    ok(segunda.total === "💎 125 puntos", `la segunda vez no debería sumar de nuevo, salió: ${segunda.total}`);
    ok(segunda.aviso === "", `la segunda vez no debería repetir el aviso de racha: ${JSON.stringify(segunda.aviso)}`);
    await ctx.close();
  }

  // ---------- 5 bis) sin ningún punto todavía (y sin racha nueva), la tarjeta no se pinta ----------
  // Ver «sin profe no hay botón, y sin nada más "Tus clases" no se pinta» en
  // herramientas/verificar-panel.js: un alumno recién creado no debe ver una
  // tarjeta invitando a una tienda vacía.
  {
    const { page, ctx } = await abrir(navegador, 0, [], true);
    const hidden = await page.evaluate(async () => {
      const div = document.createElement("div");
      document.body.appendChild(div);
      await window.Puntos.montarTarjetaPanel(div, { sb: window.sb, alumnoId: "u-ana" });
      return div.hidden;
    });
    ok(hidden === true, "con saldo 0 y sin racha nueva, la tarjeta debería quedar oculta (hidden)");
    await ctx.close();
  }

  await navegador.close();
  console.log(fallos.length ? fallos.map((f) => "✗ " + f).join("\n") : "✓ Todo bien: la tienda de puntos y la tarjeta del panel funcionan.");
  process.exit(fallos.length ? 1 : 0);
}

main();
