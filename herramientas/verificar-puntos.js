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
   aviso de puntos dobles aparezca solo si está vigente, que lo pendiente
   (tareas, racha, retos) se anuncie una vez y no se repita, los retos de la
   semana con su avance, el marcador del salón (semana y mes), regalar y
   mandar bromas a un compañero con un mensaje de la lista, y los ajustes de
   bromas (no recibir, bloquear). Lo que se VE de una broma lo comprueba
   verificar-bromas.js.

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
  { id: "p-estrella", clave: "tarjeta_estrella", nombre: "Tarjeta de estrella", descripcion: "Para felicitar a un compañero.",
    emoji: "🌟", categoria: "regalo", tipo_efecto: "tarjeta", costo_puntos: 10,
    parametros: {}, limite_por_alumno: null, activo: true, orden: 200 },
  { id: "p-globo", clave: "broma_globo", nombre: "Globo de reto", descripcion: "Un globo con una frase.",
    emoji: "🎈", categoria: "broma", tipo_efecto: "broma", costo_puntos: 20,
    parametros: { tipo: "globo", horas: 168 }, limite_por_alumno: null, activo: true, orden: 300 },
  { id: "p-confeti", clave: "broma_confeti", nombre: "Lluvia de confeti", descripcion: "Confeti con tu nombre.",
    emoji: "🎉", categoria: "broma", tipo_efecto: "broma", costo_puntos: 25,
    parametros: { tipo: "confeti", horas: 168 }, limite_por_alumno: null, activo: true, orden: 310 },
];

// Lo que la RLS de profiles le deja ver a un alumno: él mismo, su profe y sus
// compañeros (mismo profe y misma academia).
const PERFILES = [
  { id: YO, full_name: "Ana Pérez", role: "alumno" },
  { id: "u-beto", full_name: "Beto Rojas", role: "alumno" },
  { id: "u-carla", full_name: "Carla Mora", role: "alumno" },
  { id: "u-profe", full_name: "Profe Luis", role: "profesor" },
];
const FRASES = [
  { clave: "felicidades", texto: "¡Felicidades!", uso: "regalo", orden: 10 },
  { clave: "gracias", texto: "Gracias por ayudarme.", uso: "regalo", orden: 30 },
  { clave: "cuac", texto: "Cuac. Eso es todo.", uso: "broma", orden: 30 },
  { clave: "te_vigilo", texto: "Te estoy vigilando… desde la casilla e4.", uso: "broma", orden: 50 },
];
const RETOS = [
  { id: "r-1", clave: "ejercicios_30", nombre: "Treinta ejercicios", descripcion: "Resuelve 30 ejercicios.", emoji: "🎯",
    metrica: "ejercicios", meta: 30, bono: 40, avance: 12, cobrado: false, desde: "2026-10-05", hasta: "2026-10-11" },
  { id: "r-2", clave: "dias_4", nombre: "Cuatro días de entrenamiento", descripcion: "Entrena 4 días.", emoji: "📅",
    metrica: "dias_activos", meta: 4, bono: 60, avance: 1, cobrado: false, desde: "2026-10-05", hasta: "2026-10-11" },
  { id: "r-3", clave: "tareas_2", nombre: "Tareas al día", descripcion: "Completa 2 tareas.", emoji: "📋",
    metrica: "tareas", meta: 2, bono: 30, avance: 2, cobrado: false, desde: "2026-10-05", hasta: "2026-10-11" },
];

function clienteFalso(saldoInicial, misPremiosIniciales, pendientesYaCobrados, extra) {
  extra = extra || {};
  return `
window.__llamadas = [];
(function () {
  const YO = ${JSON.stringify(YO)};
  const CATALOGO = ${JSON.stringify(CATALOGO)};
  const PERFILES = ${JSON.stringify(PERFILES)};
  const FRASES = ${JSON.stringify(FRASES)};
  const RETOS = ${JSON.stringify(RETOS)};
  let SALDO = ${JSON.stringify(saldoInicial)};
  let MIS_PREMIOS = ${JSON.stringify(misPremiosIniciales)};
  let COBRADO = ${JSON.stringify(!!pendientesYaCobrados)};
  const TABLAS = {
    premios_catalogo: CATALOGO, profiles: PERFILES, frases_regalo: FRASES,
    bromas_preferencias: ${JSON.stringify(extra.preferencias || [])},
    bromas_bloqueos: ${JSON.stringify(extra.bloqueos || [])},
    bromas: ${JSON.stringify(extra.bromas || [])},
  };
  let siguienteCanje = 1;
  // Para probar la tarjeta del panel en una página donde la tienda ya cobró.
  window.__reiniciarPendientes = () => { COBRADO = false; RETOS[2].cobrado = false; };

  // Los filtros se aplican al RESOLVER, como en el resto de los dobles.
  function tabla(nombre) {
    const filtros = [];
    let orden = null, tope = null, una = false;
    const b = {
      select() { return b; },
      eq(col, val) { filtros.push((r) => r[col] === val); return b; },
      neq(col, val) { filtros.push((r) => r[col] !== val); return b; },
      in(col, vals) { filtros.push((r) => vals.includes(r[col])); return b; },
      order(col, op) { orden = { col: col, desc: op && op.ascending === false }; return b; },
      limit(n) { tope = n; return b; },
      maybeSingle() { una = true; return b; },
      then(resolve) {
        let filas = (TABLAS[nombre] || []).filter((r) => filtros.every((f) => f(r)));
        if (orden) filas = filas.slice().sort((x, y) => (x[orden.col] > y[orden.col] ? 1 : x[orden.col] < y[orden.col] ? -1 : 0) * (orden.desc ? -1 : 1));
        if (tope != null) filas = filas.slice(0, tope);
        resolve({ data: una ? (filas[0] || null) : filas, error: null });
      },
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
      // Como la base: devuelve solo lo NUEVO; la segunda vez, nada.
      if (nombre === "reclamar_puntos_pendientes") {
        if (COBRADO) return Promise.resolve({ data: [], error: null });
        COBRADO = true;
        SALDO += 25 + 30;
        RETOS[2].cobrado = true;
        return Promise.resolve({ data: [
          { que: "racha", detalle: "Racha de 7 días", ganados: 25 },
          { que: "reto_semanal", detalle: "Reto de la semana: Tareas al día", ganados: 30 },
        ], error: null });
      }
      if (nombre === "retos_de_la_semana") return Promise.resolve({ data: RETOS, error: null });
      if (nombre === "marcador_del_salon") {
        const mes = args && args.p_periodo === "mes";
        return Promise.resolve({ data: [
          { alumno_id: "u-carla", nombre: "Carla Mora", puntos: mes ? 400 : 120, puesto: 1, soy_yo: false },
          { alumno_id: YO, nombre: "Ana Pérez", puntos: mes ? 310 : 80, puesto: 2, soy_yo: true },
          { alumno_id: "u-beto", nombre: "Beto Rojas", puntos: mes ? 90 : 15, puesto: 3, soy_yo: false },
        ], error: null });
      }
      if (nombre === "regalar_premio" || nombre === "mandar_broma") {
        const premio = CATALOGO.find((p) => p.id === args.p_premio_id);
        if (!premio) return Promise.resolve({ data: null, error: { message: "Ese premio ya no está disponible." } });
        if (!PERFILES.some((p) => p.id === args.p_para && p.role === "alumno" && p.id !== YO)) {
          return Promise.resolve({ data: null, error: { message: "Solo se le puede regalar a un compañero de clase." } });
        }
        if (nombre === "mandar_broma" && premio.parametros.tipo === "globo" && !FRASES.some((f) => f.clave === args.p_frase && f.uso === "broma")) {
          return Promise.resolve({ data: null, error: { message: "Elige una frase de la lista." } });
        }
        if (SALDO < premio.costo_puntos) return Promise.resolve({ data: null, error: { message: "Te faltan " + (premio.costo_puntos - SALDO) + " puntos para este regalo." } });
        SALDO -= premio.costo_puntos;
        return Promise.resolve({ data: [{ canje_id: "g-1", broma_id: "b-1", saldo_restante: SALDO }], error: null });
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

async function abrir(navegador, saldoInicial, misPremiosIniciales, pendientesYaCobrados, extra) {
  // Casi todas las pruebas abren con lo pendiente ya cobrado: así el saldo
  // que se pinta es el que se pasó. La 5 y la 6 prueban el cobro.
  const ctx = await contexto(navegador, clienteFalso(saldoInicial, misPremiosIniciales, pendientesYaCobrados !== false, extra));
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
const canjear = (page, nombre) => tarjeta(page, nombre).locator('button[aria-label^="Canjear"]');

async function main() {
  const fallos = [];
  const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

  // ---------- 0) nada de alert/confirm/prompt, ni código escrito en la página ----------
  // Lo pide CLAUDE.md para todo el sitio: "Nunca alert(), confirm() ni
  // prompt()" y "el código de una página va en un archivo de js/, no en un
  // <script> escrito dentro". Un olvido acá no da ningún error: se ve y
  // funciona, hasta que a alguien se le abre un confirm() nativo feo.
  {
    const archivos = ["js/puntos.js", "js/puntos-tienda-pagina.js", "js/puntos-regalos.js", "js/bromas.js"];
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

    const btnTitulo = canjear(page, "Título: Táctico");
    ok(!(await btnTitulo.isDisabled()), "con 180 puntos debería poder canjear el título de 150");

    const btnDoble = canjear(page, "Día de puntos dobles");
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
    await canjear(page, "Título: Táctico").click();
    await page.waitForFunction(() => document.querySelector("#tienda-puntos [data-puntos-total]").textContent === "💎 30 puntos", null, { timeout: 5000 });
    ok(await page.evaluate(() => window.__llamadas.some((l) => l.rpc === "canjear_premio" && l.args.p_premio_id === "p-titulo")),
      "canjear no mandó canjear_premio con el id del premio");

    const fila = page.locator("#tienda-puntos ul li", { hasText: "Título: Táctico" });
    await fila.waitFor({ timeout: 5000 });
    ok(await fila.locator('button[aria-label="Quitar Título: Táctico"]').isVisible(),
      "el premio canjeado no aparece en «Mis premios» con su botón de Quitar");

    // El límite es 1: ya no se puede canjear otra vez.
    const btnTitulo = canjear(page, "Título: Táctico");
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
    await canjear(page, "Gorro de copa").click();
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

  // ---------- 5) lo pendiente se cobra al abrir la tienda, una sola vez ----------
  {
    const { page, ctx, errores } = await abrir(navegador, 100, [], false);
    await page.waitForFunction(() => document.querySelector("#tienda-puntos [data-puntos-total]").textContent === "💎 155 puntos", null, { timeout: 5000 })
      .catch(() => {});
    ok((await page.textContent("#tienda-puntos [data-puntos-total]")) === "💎 155 puntos",
      "al abrir la tienda debería cobrar lo pendiente (100 + 25 de racha + 30 del reto)");
    const nuevos = await page.textContent("[data-puntos-nuevos]");
    ok(nuevos.includes("Racha de 7 días: +25") && nuevos.includes("Reto de la semana: Tareas al día: +30"),
      `no anuncia lo recién cobrado: ${JSON.stringify(nuevos)}`);
    ok((await page.textContent('[data-reto="tareas_2"] [data-reto-estado]')).includes("✓ Cumplido"),
      "el reto recién cobrado debería salir como cumplido");
    ok(errores.join(" | ") === "", "hubo errores en consola: " + errores.join(" | "));
    await ctx.close();
  }

  // ---------- 5 bis) la tarjeta del panel (Puntos.montarTarjetaPanel) ----------
  {
    const { page, ctx } = await abrir(navegador, 100, []);
    await page.evaluate(() => window.__reiniciarPendientes());
    const montar = () => page.evaluate(async () => {
      const div = document.createElement("div");
      document.body.appendChild(div);
      await window.Puntos.montarTarjetaPanel(div, { sb: window.sb, alumnoId: "u-ana" });
      return { total: div.querySelector("[data-puntos-total]").textContent, aviso: div.querySelectorAll("p")[1].textContent };
    });
    const texto = await montar();
    ok(texto.total === "💎 155 puntos", `la tarjeta debería mostrar 100 + 55 de lo pendiente, salió: ${texto.total}`);
    ok(texto.aviso.includes("🔥 Racha de 7 días: +25") && texto.aviso.includes("🎯 Reto de la semana: Tareas al día: +30"),
      `no avisa lo pendiente recién cobrado: ${JSON.stringify(texto.aviso)}`);

    // Otra visita al panel: ya está cobrado, no repite el aviso ni suma.
    const segunda = await montar();
    ok(segunda.total === "💎 155 puntos", `la segunda vez no debería sumar de nuevo, salió: ${segunda.total}`);
    ok(segunda.aviso === "", `la segunda vez no debería repetir el aviso: ${JSON.stringify(segunda.aviso)}`);
    await ctx.close();
  }

  // ---------- 5 ter) sin ningún punto todavía (y nada pendiente), la tarjeta no se pinta ----------
  // Ver «sin profe no hay botón, y sin nada más "Tus clases" no se pinta» en
  // herramientas/verificar-panel.js: un alumno recién creado no debe ver una
  // tarjeta invitando a una tienda vacía.
  {
    const { page, ctx } = await abrir(navegador, 0, []);
    const hidden = await page.evaluate(async () => {
      const div = document.createElement("div");
      document.body.appendChild(div);
      await window.Puntos.montarTarjetaPanel(div, { sb: window.sb, alumnoId: "u-ana" });
      return div.hidden;
    });
    ok(hidden === true, "con saldo 0 y nada pendiente, la tarjeta debería quedar oculta (hidden)");
    await ctx.close();
  }

  // ---------- 6) los retos de la semana, con su avance escrito ----------
  {
    const { page, ctx } = await abrir(navegador, 100, []);
    await page.waitForSelector('[data-reto="ejercicios_30"]', { timeout: 5000 });
    ok((await page.textContent('[data-reto="ejercicios_30"] [data-reto-estado]')) === "12 de 30",
      "el avance del reto debería ir escrito («12 de 30»), no solo en la barra");
    const barra = await page.evaluate(() => { const b = document.querySelector('[data-reto="ejercicios_30"] progress'); return b && [b.value, b.max, b.getAttribute("aria-label")]; });
    ok(barra && barra[0] === 12 && barra[1] === 30 && barra[2] === "Treinta ejercicios", "la barra del reto no tiene su valor o su nombre: " + JSON.stringify(barra));
    ok((await page.textContent('[data-reto="ejercicios_30"] h4')).includes("+40 puntos"), "el reto no dice su bono");
    await ctx.close();
  }

  // ---------- 7) el marcador del salón: semana y mes, y uno mismo marcado ----------
  {
    const { page, ctx } = await abrir(navegador, 100, []);
    await page.waitForSelector("#puntos-marcador [data-marcador-fila]", { timeout: 5000 });
    const filas = await page.$$eval("#puntos-marcador [data-marcador-fila]", (l) => l.map((x) => x.textContent));
    ok(filas.length === 3 && filas[0].includes("Carla Mora") && filas[0].includes("120 puntos"), "el marcador de la semana no sale bien: " + JSON.stringify(filas));
    ok(await page.isVisible('#puntos-marcador [aria-current="true"]:has-text("Ana Pérez (tú)")'), "uno mismo no sale marcado en el marcador");
    ok((await page.getAttribute('[data-periodo="semana"]', "aria-pressed")) === "true", "«Esta semana» debería arrancar apretado");
    await page.click('[data-periodo="mes"]');
    await page.waitForFunction(() => document.querySelector("#puntos-marcador").textContent.includes("400 puntos"), null, { timeout: 5000 });
    ok(await page.evaluate(() => window.__llamadas.some((l) => l.rpc === "marcador_del_salon" && l.args.p_periodo === "mes")),
      "«Este mes» no pidió el marcador del mes");
    ok((await page.getAttribute('[data-periodo="mes"]', "aria-pressed")) === "true"
      && (await page.getAttribute('[data-periodo="semana"]', "aria-pressed")) === "false", "los botones del periodo no dicen cuál está apretado");
    await ctx.close();
  }

  // ---------- 8) regalar una tarjeta: compañero y mensaje de la lista ----------
  {
    const { page, ctx, errores } = await abrir(navegador, 100, []);
    const btn = tarjeta(page, "Tarjeta de estrella").locator("[data-regalar]");
    ok(await canjear(page, "Tarjeta de estrella").count() === 0, "una tarjeta de regalo no debería tener botón de Canjear para uno mismo");
    await btn.click();
    const dialogo = page.locator("dialog[open]");
    await dialogo.waitFor({ timeout: 5000 });
    const opciones = await dialogo.locator("select").first().locator("option").allTextContents();
    ok(opciones.join("|") === "Beto Rojas|Carla Mora", "la lista de compañeros debería traer solo a los otros alumnos: " + JSON.stringify(opciones));
    const mensajes = await dialogo.locator("select").nth(1).locator("option").allTextContents();
    ok(mensajes.join("|") === "Sin mensaje|¡Felicidades!|Gracias por ayudarme.", "los mensajes de regalo no son los de la lista: " + JSON.stringify(mensajes));
    await dialogo.locator("select").first().selectOption("u-carla");
    await dialogo.locator("select").nth(1).selectOption("felicidades");
    await dialogo.locator('button:has-text("Regalar (10 puntos)")').click();
    await page.waitForFunction(() => document.querySelector("#tienda-puntos [data-puntos-total]").textContent === "💎 90 puntos", null, { timeout: 5000 }).catch(() => {});
    const llamada = await page.evaluate(() => window.__llamadas.find((l) => l.rpc === "regalar_premio"));
    ok(llamada && llamada.args.p_para === "u-carla" && llamada.args.p_mensaje === "felicidades" && llamada.args.p_premio_id === "p-estrella",
      "regalar no mandó regalar_premio con el compañero y el mensaje: " + JSON.stringify(llamada));
    ok((await tarjeta(page, "Tarjeta de estrella").textContent()).includes("Le regalaste Tarjeta de estrella a Carla Mora"), "no confirma a quién se regaló");
    ok(errores.join(" | ") === "", "hubo errores en consola: " + errores.join(" | "));
    await ctx.close();
  }

  // ---------- 8 bis) un cosmético también se puede regalar ----------
  {
    const { page, ctx } = await abrir(navegador, 100, []);
    ok(await tarjeta(page, "Gorro de copa").locator("[data-regalar]").isVisible(), "un cosmético debería tener «Regalar…» además de Canjear");
    ok(await tarjeta(page, "Adelanta una lección").locator("[data-regalar]").count() === 0, "el contenido (cursos, materiales) no se regala");
    await ctx.close();
  }

  // ---------- 9) una broma: el globo exige una frase de la lista ----------
  {
    const { page, ctx } = await abrir(navegador, 100, []);
    await tarjeta(page, "Globo de reto").locator("[data-regalar]").click();
    const dialogo = page.locator("dialog[open]");
    await dialogo.waitFor({ timeout: 5000 });
    const frases = await dialogo.locator("select").nth(1).locator("option").allTextContents();
    ok(frases.join("|") === "Cuac. Eso es todo.|Te estoy vigilando… desde la casilla e4.", "las frases del globo no son las de broma: " + JSON.stringify(frases));
    await dialogo.locator("select").first().selectOption("u-beto");
    await dialogo.locator("select").nth(1).selectOption("cuac");
    await dialogo.locator('button:has-text("Mandar la broma (20 puntos)")').click();
    await page.waitForFunction(() => window.__llamadas.some((l) => l.rpc === "mandar_broma"), null, { timeout: 5000 }).catch(() => {});
    const llamada = await page.evaluate(() => window.__llamadas.find((l) => l.rpc === "mandar_broma"));
    ok(llamada && llamada.args.p_para === "u-beto" && llamada.args.p_frase === "cuac", "mandar la broma no llevó compañero y frase: " + JSON.stringify(llamada));
    await page.waitForFunction(() => document.querySelector("#tienda-puntos").textContent.includes("Le mandaste la broma a Beto Rojas"), null, { timeout: 5000 }).catch(() => {});
    ok((await page.textContent("#tienda-puntos")).includes("Le mandaste la broma a Beto Rojas"), "no confirma a quién se le mandó la broma");

    // El confeti no lleva frase: el formulario solo pregunta a quién.
    await tarjeta(page, "Lluvia de confeti").locator("[data-regalar]").click();
    await page.locator("dialog[open]").waitFor({ timeout: 5000 });
    ok(await page.locator("dialog[open] select").count() === 1, "el confeti no debería pedir frase");
    await ctx.close();
  }

  // ---------- 10) un regalo recibido dice de quién y su mensaje ----------
  {
    const regalo = { id: "c-r", premio_id: "p-estrella", clave: "tarjeta_estrella", nombre: "Tarjeta de estrella", emoji: "🌟",
      categoria: "regalo", tipo_efecto: "tarjeta", parametros: {}, activo: true, vigente_hasta: null, created_at: new Date().toISOString(),
      regalo_de: "u-carla", regalo_de_nombre: "Carla Mora", mensaje: "¡Felicidades!" };
    const { page, ctx } = await abrir(navegador, 10, [regalo]);
    await page.waitForSelector("[data-regalo-de]", { timeout: 5000 });
    ok((await page.textContent("[data-regalo-de]")) === "🎁 Regalo de Carla Mora: «¡Felicidades!»", "un regalo recibido no dice de quién ni su mensaje");
    await ctx.close();
  }

  // ---------- 11) las bromas: no recibirlas y bloquear a alguien ----------
  {
    const bromas = [{ id: "b-9", de_id: "u-beto", para_id: YO, tipo: "patito", created_at: new Date().toISOString() }];
    const { page, ctx } = await abrir(navegador, 10, [], true, { bromas });
    await page.waitForSelector('[data-broma-recibida="b-9"]', { timeout: 5000 });
    ok((await page.textContent('[data-broma-recibida="b-9"]')).includes("Beto Rojas te mandó un patito"), "la broma recibida no dice quién la mandó");
    ok(await page.isChecked("#bromas-recibir"), "por omisión se reciben bromas");
    await page.uncheck("#bromas-recibir");
    await page.waitForFunction(() => window.__llamadas.some((l) => l.rpc === "bromas_configurar"), null, { timeout: 5000 }).catch(() => {});
    ok(await page.evaluate(() => window.__llamadas.some((l) => l.rpc === "bromas_configurar" && l.args.p_no_recibir === true)),
      "desmarcar no guardó «no recibir bromas»");
    await page.click('[data-broma-recibida="b-9"] button');
    await page.waitForFunction(() => window.__llamadas.some((l) => l.rpc === "bromas_bloquear"), null, { timeout: 5000 }).catch(() => {});
    ok(await page.evaluate(() => window.__llamadas.some((l) => l.rpc === "bromas_bloquear" && l.args.p_persona === "u-beto" && l.args.p_bloquear === true)),
      "«No más bromas de…» no bloqueó a quien la mandó");
    await ctx.close();
  }

  await navegador.close();
  console.log(fallos.length ? fallos.map((f) => "✗ " + f).join("\n") : "✓ Todo bien: la tienda de puntos y la tarjeta del panel funcionan.");
  process.exit(fallos.length ? 1 : 0);
}

main();
