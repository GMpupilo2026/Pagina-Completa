/* La inscripción de la Eliminatoria Cantonal JDN de Pérez Zeledón 2026
 * (jdn-pz-2026.html, la ventana #inscribirme; js/jdn-pz-inscripcion.js).
 *
 * Con un doble de la base (pareo_organizadores y pareo_publicados, que
 * filtran de verdad) y de la función pareo-publicar (la ruta de su URL).
 * Lo que comprueba:
 *   - sin la organización ADAPZ verificada, dice que todavía no está abierta
 *     y el botón no se toca; una organización que se llama igual pero SIN el
 *     sello no cuenta (nadie la suplanta);
 *   - con la verificada, encuentra el torneo U12 y el U20 por el nombre (el
 *     más nuevo) y las fichas «Resultados U12/U20» llevan a cada uno;
 *   - la categoría por el año de nacimiento: U12 (2015-2020), U16 (2011-2014,
 *     juega en el torneo U20), U20 (2007-2010) y fuera de rango;
 *   - lo que falta se dice y no se manda nada (sin la casilla de afiliado, sin
 *     la de privacidad);
 *   - lo que se manda: «inscribir», al torneo de su categoría, con
 *     «Apellidos, Nombre», el sexo, la fecha de nacimiento, la categoría con
 *     la rama y el consentimiento; y que se borran los datos de quien juega;
 *   - un torneo con la inscripción cerrada en Pareo no recibe;
 *   - después de las 10:00 p.m. del viernes 20 de noviembre, cerrada;
 *   - nada de lo escrito queda en el navegador, y en el celular no hay
 *     scroll de costado.
 *
 * Ver «La inscripción de la Eliminatoria Cantonal JDN de Pérez Zeledón» en
 * docs/decisiones/juegos-y-torneos.md.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-jdn-pz-inscripcion.js
 */
const fs = require("fs");
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const U12 = "11111111-1111-4111-8111-111111111111";
const U20 = "22222222-2222-4222-8222-222222222222";
const VIEJO = "33333333-3333-4333-8333-333333333333";
const FALSO = "44444444-4444-4444-8444-444444444444";

let fallos = 0;
function ok(nombre, cond, detalle) {
  console.log((cond ? "  ✓ " : "  ✗ ") + nombre + (cond || !detalle ? "" : " — " + detalle));
  if (!cond) fallos++;
}

// La base de mentira: filas de verdad, y la consulta filtra como PostgREST.
function doble(datos) {
  return `(function(){
  const D = ${JSON.stringify(datos)};
  window.sb = { from(tabla) {
    const filas = (D[tabla] || []).slice();
    const f = [];
    let orden = null;
    const q = {
      select() { return q; },
      eq(c, v) { f.push((r) => r[c] === v); return q; },
      in(c, vs) { f.push((r) => vs.includes(r[c])); return q; },
      order(c, o) { orden = [c, o && o.ascending === false ? -1 : 1]; return q; },
      range() { return q; },
      then(okf, ko) {
        let out = filas.filter((r) => f.every((g) => g(r)));
        if (orden) out.sort((a, b) => (a[orden[0]] < b[orden[0]] ? -1 : 1) * orden[1]);
        return Promise.resolve({ data: out, error: null }).then(okf, ko);
      },
    };
    return q;
  } };
})();`;
}

const ORGS = [{ id: "org-adapz", nombre: "ADAPZ · Asociación Deportiva de Ajedrez de Pérez Zeledón", verificado: true },
  { id: "org-falsa", nombre: "ADAPZ", verificado: false }];
const abierta = { abierta: true, hasta: "2026-11-20" };
const TORNEOS = [
  { id: U12, nombre: "Eliminatoria JDN PZ U12 Absoluto", creado: "2026-11-15T10:00:00Z", organizador_id: "org-adapz", inscripcion: abierta },
  { id: U20, nombre: "Eliminatoria JDN PZ U20 (U16 y U20)", creado: "2026-11-15T10:05:00Z", organizador_id: "org-adapz", inscripcion: abierta },
  { id: VIEJO, nombre: "Torneo U12 de 2025", creado: "2025-11-01T10:00:00Z", organizador_id: "org-adapz", inscripcion: null },
  { id: FALSO, nombre: "Eliminatoria U12 (falsa)", creado: "2026-11-16T10:00:00Z", organizador_id: "org-falsa", inscripcion: abierta },
];

const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const LISTA_FIDE = [
  { fideId: "6512345", nombre: "Mora Solis, Ana Lucia", titulo: "", fed: "CRC", sexo: "", nacimiento: 2012, club: "", nacional: null, estandar: 1450, rapido: 1500, blitz: null },
  { fideId: "6599999", nombre: "Mora Solis, Ana", titulo: "", fed: "CRC", sexo: "", nacimiento: 2008, club: "", nacional: null, estandar: null, rapido: 1300, blitz: null },
  { fideId: "2400001", nombre: "Mora Solis, Ana Lucia", titulo: "", fed: "ESP", sexo: "", nacimiento: 1990, club: "", nacional: null, estandar: 2000, rapido: null, blitz: null },
  { fideId: "6500001", nombre: "Rojas Vega, Pedro", titulo: "", fed: "CRC", sexo: "", nacimiento: 2016, club: "", nacional: null, estandar: 1210, rapido: null, blitz: null },
];

async function abrir(nav, datos, cuando, ancho) {
  const ctx = await nav.newContext({ viewport: { width: ancho || 1280, height: 900 }, serviceWorkers: "block" });
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble(datos) }));
  await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
  const pedidos = [];
  const fide = [];
  // La lista de FIDE de mentira: lo que devolvería ratings.fide.com por la función pareo-listas-elo.
  await ctx.route("**/functions/v1/pareo-listas-elo*", async (r) => {
    const b = JSON.parse(r.request().postData() || "{}");
    fide.push(b);
    const apellidos = sinTildes(b.q).split(",")[0].trim();
    const filas = LISTA_FIDE.filter((f) => sinTildes(f.nombre).startsWith(apellidos));
    await r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, lista: "fide", filas, total: filas.length, hayMas: false, periodo: null }) });
  });
  await ctx.route("**/functions/v1/pareo-publicar", async (r) => {
    pedidos.push(JSON.parse(r.request().postData() || "{}"));
    await r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(String(e)));
  await p.clock.setFixedTime(new Date(cuando || "2026-11-16T12:00:00-06:00"));
  await p.goto(BASE + "/jdn-pz-2026.html#inscribirme", { waitUntil: "load" });
  await p.waitForFunction(() => !/Buscando/.test(document.getElementById("insc-estado-torneos").textContent), null, { timeout: 5000 }).catch(() => {});
  return { ctx, p, pedidos, fide, errores };
}
const leer = (p) => p.evaluate(() => ({ torneos: document.getElementById("insc-estado-torneos").textContent, categoria: document.getElementById("insc-categoria").textContent,
  boton: document.getElementById("insc-enviar").disabled, estado: document.getElementById("insc-estado").textContent }));

(async () => {
  const nav = await chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});
  try {
    console.log("Sin la organización verificada");
    let x = await abrir(nav, { pareo_organizadores: ORGS.filter((o) => !o.verificado), pareo_publicados: TORNEOS });
    let e = await leer(x.p);
    ok("dice que todavía no está abierta y el botón no se toca (la que no tiene sello no cuenta)", /todavía no está abierta/.test(e.torneos) && e.boton, JSON.stringify(e));
    ok("las fichas de resultados se quedan «Pronto», sin enlace (nunca la lista de Pareo con los torneos de otros)",
      JSON.stringify(await x.p.evaluate(() => ["u12", "u20"].map((k) => { const f = document.getElementById("ficha-resultados-" + k); return [f.tagName, f.getAttribute("href"), f.getAttribute("aria-disabled")]; })))
        === JSON.stringify([["DIV", null, "true"], ["DIV", null, "true"]]));
    await x.ctx.close();

    console.log("\nCon la ADAPZ verificada");
    x = await abrir(nav, { pareo_organizadores: ORGS, pareo_publicados: TORNEOS });
    e = await leer(x.p);
    ok("la inscripción está abierta hasta las 10:00 p.m. del viernes 20", /abierta hasta las 10:00 p\.m\. del viernes 20 de noviembre/.test(e.torneos), e.torneos);
    ok("cada ficha pasa a ser el enlace a SU torneo de Pareo, que se abre encima (el más nuevo, nunca el de la organización falsa)",
      JSON.stringify(await x.p.evaluate(() => ["u12", "u20"].map((k) => { const a = document.getElementById("ficha-resultados-" + k); return [a.tagName, a.getAttribute("href"), a.dataset.ventana]; })))
        === JSON.stringify([["A", "torneos-pareo.html#t=" + U12, "Resultados U12"], ["A", "torneos-pareo.html#t=" + U20, "Resultados U20"]]));
    ok("el club viene «ADAPZ»", await x.p.$eval("#insc-institucion", (i) => i.value) === "ADAPZ");

    // El ID FIDE y el Elo, solos, con el nombre.
    const vaciarFide = () => x.p.evaluate(() => ["insc-fide", "insc-elo"].forEach((id) => { const i = document.getElementById(id); i.value = ""; delete i.dataset.manual; }));
    const buscarFide = async (apellidos, nombre, fecha) => {
      await vaciarFide();
      await x.p.fill("#insc-nacimiento", fecha || "");
      // Vacíos primero: si no, escribir lo mismo que ya estaba no es un cambio y no se busca.
      await x.p.evaluate(() => { document.getElementById("insc-apellidos").value = ""; document.getElementById("insc-nombre").value = ""; });
      await x.p.fill("#insc-apellidos", apellidos);
      await x.p.fill("#insc-nombre", nombre);
      await x.p.press("#insc-nombre", "Tab");
      await x.p.waitForFunction(() => { const t = document.getElementById("insc-fide-estado").textContent; return t && !/Buscando/.test(t); }, null, { timeout: 5000 }).catch(() => {});
      return x.p.evaluate(() => ({ fide: document.getElementById("insc-fide").value, elo: document.getElementById("insc-elo").value, estado: document.getElementById("insc-fide-estado").textContent,
        opciones: [...document.querySelectorAll("#insc-fide-opciones button")].map((b) => b.dataset.fide) }));
    };
    let f = await buscarFide("Rojas Vega", "Pedro");
    ok("uno solo de Costa Rica: pone su ID FIDE y su Elo estándar", f.fide === "6500001" && f.elo === "1210" && /Lo encontramos en FIDE/.test(f.estado), JSON.stringify(f));
    ok("busca con «Apellidos, Nombre», y nada más", JSON.stringify(x.fide[x.fide.length - 1]) === JSON.stringify({ lista: "fide", q: "Rojas Vega, Pedro" }), JSON.stringify(x.fide));
    f = await buscarFide("Mora Solís", "Ana");
    ok("varios de Costa Rica con ese nombre (el de España no cuenta): se elige de la lista, sin poner nada todavía", JSON.stringify(f.opciones) === JSON.stringify(["6512345", "6599999"]) && !f.fide, JSON.stringify(f));
    await x.p.click('#insc-fide-opciones button[data-fide="6599999"]');
    ok("al elegir uno se ponen sus datos; sin Elo estándar el Elo queda vacío (no se pone el rápido)",
      JSON.stringify(await x.p.evaluate(() => [document.getElementById("insc-fide").value, document.getElementById("insc-elo").value])) === JSON.stringify(["6599999", ""]));
    await buscarFide("Mora Solís", "Ana");
    await x.p.fill("#insc-nacimiento", "2012-03-03");
    await x.p.press("#insc-nacimiento", "Tab");
    await x.p.waitForFunction(() => document.getElementById("insc-fide").value, null, { timeout: 5000 }).catch(() => {});
    ok("la fecha de nacimiento puesta después desempata por el año", JSON.stringify(await x.p.evaluate(() => [document.getElementById("insc-fide").value, document.getElementById("insc-elo").value])) === JSON.stringify(["6512345", "1450"]));
    f = await buscarFide("Mora Solís", "Ana Lucía");
    ok("con todos los nombres escritos cuenta solo quien los tiene todos («Ana Lucía», no «Ana»)", f.fide === "6512345" && !f.opciones.length, JSON.stringify(f));
    f = await buscarFide("Zuniga Nadie", "Luis");
    ok("si no aparece, lo dice y deja los campos vacíos", !f.fide && !f.elo && /No aparece en la lista de FIDE/.test(f.estado), JSON.stringify(f));
    await x.p.fill("#insc-fide", "1234567");
    await x.p.fill("#insc-elo", "1600");
    await x.p.fill("#insc-apellidos", "Rojas Vega");
    await x.p.fill("#insc-nombre", "Pedro");
    await x.p.press("#insc-nombre", "Tab");
    await x.p.waitForTimeout(500);
    ok("lo escrito a mano en el ID o el Elo no se pisa", JSON.stringify(await x.p.evaluate(() => [document.getElementById("insc-fide").value, document.getElementById("insc-elo").value])) === JSON.stringify(["1234567", "1600"]));
    await vaciarFide();
    const categoria = async (fecha) => { await x.p.fill("#insc-nacimiento", fecha); return leer(x.p); };
    e = await categoria("2016-05-04");
    ok("2016 → U12, y se puede mandar", e.categoria === "Categoría U12." && !e.boton, JSON.stringify(e));
    e = await categoria("2013-01-10");
    ok("2013 → U16, que juega en el torneo U20", e.categoria === "Categoría U16: juega en el torneo U20." && !e.boton, e.categoria);
    e = await categoria("2008-12-31");
    ok("2008 → U20", e.categoria === "Categoría U20." && !e.boton, e.categoria);
    e = await categoria("2005-03-03");
    ok("2005 → fuera de las categorías, y no se puede mandar", /no entra en ninguna categoría/.test(e.categoria) && e.boton, JSON.stringify(e));

    await x.p.fill("#insc-apellidos", "Mora  Solís");
    await x.p.fill("#insc-nombre", "Ana Lucía");
    await x.p.fill("#insc-nacimiento", "2012-07-08");
    await x.p.check('input[name="sexo"][value="F"]');
    await x.p.fill("#insc-institucion", "Liceo de San Isidro");
    // El ID y el Elo, buscados solos con el nombre y la fecha (desempata el año).
    await x.p.focus("#insc-nombre");
    await x.p.press("#insc-nombre", "Tab");
    await x.p.waitForFunction(() => document.getElementById("insc-fide").value === "6512345", null, { timeout: 5000 }).catch(() => {});
    await x.p.fill("#insc-responsable", "María Solís");
    await x.p.fill("#insc-contacto", "8888-1234");
    await x.p.check("#insc-consentimiento");
    await x.p.click("#insc-enviar");
    e = await leer(x.p);
    ok("sin la casilla de afiliado, lo dice y no manda nada", /afiliado a la ADAPZ/.test(e.estado) && !x.pedidos.length, e.estado);
    await x.p.check("#insc-afiliado");
    await x.p.uncheck("#insc-consentimiento");
    await x.p.click("#insc-enviar");
    ok("sin la de privacidad, tampoco", /política de privacidad/.test((await leer(x.p)).estado) && !x.pedidos.length);
    await x.p.check("#insc-consentimiento");
    await x.p.click("#insc-enviar");
    await x.p.waitForFunction(() => /Listo/.test(document.getElementById("insc-estado").textContent), null, { timeout: 5000 }).catch(() => {});
    const env = x.pedidos[0] || {};
    ok("manda «inscribir» al torneo U20 (la U16 juega ahí), con el consentimiento", env.accion === "inscribir" && env.id === U20 && env.consentimiento === true, JSON.stringify(env));
    const i = env.inscripcion || {};
    ok("con «Apellidos, Nombre», el sexo, la fecha, la categoría con la rama, y el ID FIDE y el Elo que se buscaron solos",
      i.nombre === "Mora Solís, Ana Lucía" && i.sexo === "F" && i.nacimiento === "2012-07-08" && i.categoria === "U16 Femenino" && i.fideId === "6512345" && i.elo === 1450 && i.institucion === "Liceo de San Isidro" && i.responsable === "María Solís" && i.contacto === "8888-1234", JSON.stringify(i));
    e = await leer(x.p);
    ok("dice que llegó y que queda pendiente hasta que el árbitro la apruebe", /llegó al torneo U20/.test(e.estado) && /pendiente hasta que el árbitro la apruebe/.test(e.estado), e.estado);
    ok("se borran los datos de quien juega, el club vuelve a «ADAPZ» y se queda quien inscribe",
      JSON.stringify(await x.p.evaluate(() => ["insc-apellidos", "insc-nacimiento", "insc-fide", "insc-elo", "insc-institucion", "insc-responsable"].map((id) => document.getElementById(id).value)))
        === JSON.stringify(["", "", "", "", "ADAPZ", "María Solís"]));
    ok("nada de lo escrito queda en el navegador", !(await x.p.evaluate(() => JSON.stringify(Object.assign({}, localStorage, sessionStorage)))).includes("Mora"));
    ok("sin errores de JavaScript", !x.errores.length, x.errores.join(" | "));
    await x.ctx.close();

    console.log("\nCerrada");
    x = await abrir(nav, { pareo_organizadores: ORGS, pareo_publicados: TORNEOS.map((t) => (t.id === U20 ? Object.assign({}, t, { inscripcion: { abierta: false } }) : t)) });
    e = await (async () => { await x.p.fill("#insc-nacimiento", "2009-02-02"); return leer(x.p); })();
    ok("un torneo con la inscripción cerrada en Pareo no recibe", /no está recibiendo inscripciones/.test(e.categoria) && e.boton, JSON.stringify(e));
    await x.ctx.close();
    x = await abrir(nav, { pareo_organizadores: ORGS, pareo_publicados: TORNEOS }, "2026-11-20T22:05:00-06:00");
    e = await (async () => { await x.p.fill("#insc-nacimiento", "2016-02-02"); return leer(x.p); })();
    ok("después de las 10:00 p.m. del viernes 20 de noviembre, cerrada", /cerraron/.test(e.torneos) && e.boton, JSON.stringify(e));
    await x.ctx.close();

    console.log("\nEl celular");
    x = await abrir(nav, { pareo_organizadores: ORGS, pareo_publicados: TORNEOS }, null, 375);
    ok("a 375 px la ventana de inscripción no se desplaza de costado", await x.p.evaluate(() => {
      const d = document.getElementById("inscribirme");
      return document.documentElement.scrollWidth <= window.innerWidth && (!d.open || d.scrollWidth <= d.clientWidth + 1);
    }));
    await x.ctx.close();
  } finally {
    await nav.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
