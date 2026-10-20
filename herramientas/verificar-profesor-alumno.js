/* Comprueba que un profesor pueda ser también alumno de otro profesor (Ronaldo
   y Sebastián estudian con Oscar y siguen dando clase a los suyos).

   Todo lo que se rompe acá se rompe CALLADO: la página se ve perfecta y a
   Oscar le falta un alumno, o a Ronaldo le falta su lado de alumno. Se mira:

   1. Que la migración y la Edge Function digan lo que tienen que decir: las
      catorce funciones de las listas de alumnos suman a los profesores que
      estudian, y `set_teachers` los acepta y no se los borra al subirlos.
   2. Que las pantallas de elegir a quién mandarle algo sumen a los profesores
      que estudian con uno, y que si esa llamada falla la lista quede igual.
   3. Que en Tareas, un profesor que estudia con alguien vea ADEMÁS sus tareas
      de alumno, uno que no estudia con nadie no, y quien administra tampoco.
   4. Que en la clase en vivo, entrar como alumno (`como_alumno=1`) anuncie el
      rol «alumno» en la presencia —si no, no sale en «Alumnos conectados» del
      profesor— y que en el chat lo decida quién escribe en el hilo de quién.

   Lo que NO se comprueba acá: lo que hace la base. Eso se comprobó impersonando
   roles en SQL, dentro de una transacción que se revierte: Oscar pasa de 66 a
   67 alumnos con Ronaldo; Mora, que no es su profesor, no lo ve.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-profesor-alumno.js                        */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), "utf8");

const RONALDO = { id: "u-ronaldo", role: "profesor", is_admin: false, full_name: "Ronaldo Valverde", email: "ronaldo@x.cr" };
const MORA = { id: "u-mora", role: "profesor", is_admin: false, full_name: "Sebastián Mora", email: "mora@x.cr" };
const ANA = { id: "u-ana", role: "alumno", is_admin: false, full_name: "Ana Rojas", email: "ana@x.cr" };
const ADMIN = { id: "u-admin", role: "admin", is_admin: true, full_name: "Administrador", email: "admin@x.cr" };

/* Un cliente de Supabase de mentira: la página de Tareas pide perfiles, las
   tareas del alumno y, ahora, mis_clases() y profesores_que_estudian_conmigo(). */
function clienteFalso(yo, opciones) {
  return `
window.__llamadas = [];
(function () {
  const YO = ${JSON.stringify(yo)};
  const OPC = ${JSON.stringify(opciones)};
  const PERFILES = ${JSON.stringify([RONALDO, MORA, ANA, ADMIN])};
  function tabla(nombre) {
    let filas = (nombre === "profiles" ? PERFILES : []).slice();
    let unica = false;
    const b = {
      select() { return b; },
      eq(col, val) { filas = filas.filter((r) => String(r[col]) === String(val)); return b; },
      order() { return b; },
      range(d, h) { filas = filas.slice(d, h + 1); return b; },
      single() { unica = true; return b; },
      maybeSingle() { unica = true; return b; },
      then(resolve) { resolve({ data: unica ? (filas[0] || null) : filas, error: null }); },
    };
    return b;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: YO.id } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: function () {} } } }),
      signOut: () => Promise.resolve({ error: null }),
    },
    from: function (nombre) { return tabla(nombre); },
    rpc: function (nombre, args) {
      window.__llamadas.push({ rpc: nombre, args: args });
      if (nombre === "mis_clases") {
        return Promise.resolve({ data: OPC.clases || [], error: null });
      }
      if (nombre === "profesores_que_estudian_conmigo") {
        if (OPC.fallaSumar) return Promise.resolve({ data: null, error: { message: "boom" } });
        return Promise.resolve({ data: OPC.estudian || [], error: null });
      }
      if (nombre === "tareas_con_avance") {
        return Promise.resolve({ data: OPC.tareas || [], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
})();
`;
}

async function abrirTareas(navegador, yo, opciones) {
  const ctx = await navegador.newContext({ serviceWorkers: "block" });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.addInitScript(clienteFalso(yo, opciones));
  const pagina = await ctx.newPage();
  await pagina.goto(`${BASE}/tareas.html`, { waitUntil: "networkidle" });
  await pagina.waitForSelector("#app:not(.hidden)", { timeout: 10000 });
  return { ctx, pagina };
}

async function main() {
  const fallos = [];
  const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

  // ---------- 1) la base y la Edge Function ----------
  {
    const dir = path.join(RAIZ, "supabase/migraciones");
    const mig = fs.readdirSync(dir).find((f) => /profesores_tambien_alumnos\.sql$/.test(f));
    ok(!!mig, "falta la migración profesores_tambien_alumnos");
    if (mig) {
      const sql = fs.readFileSync(path.join(dir, mig), "utf8");
      ok(/function interno\.profesor_alumno_mio\(p_id uuid\)/.test(sql), "la migración no define interno.profesor_alumno_mio");
      ok(/revoke execute on function interno\.profesor_alumno_mio\(uuid\) from public, anon/.test(sql),
        "interno.profesor_alumno_mio no le quita el execute a public y anon");
      const listadas = ["alumnos_del_profesor", "actividad_profesor", "detalle_mensual_crudo", "entreno_hoy_de_mis_alumnos",
        "enviar_aviso", "grupos_de_mis_alumnos", "informe_de_alumno", "informes_cursos_alumnos", "informes_diagnosticos_alumnos",
        "informes_entreno_modulos", "informes_inactivos", "informes_resumen_alumnos", "panel_profesor", "se_caen_del_plan"];
      listadas.forEach((f) => ok(sql.includes("'" + f + "'"), `la migración no reescribe public.${f}`));
      ok(/raise exception 'public\.% ya no tiene/.test(sql),
        "la migración no falla cuando una función ya no trae la línea: se quedaría sin cambiar y sin avisar");
      // Mora no ve a Ronaldo: la función acota a los alumnos de quien mira.
      ok(/p_id in \(select interno\.alumnos_de\(auth\.uid\(\)\)\)/.test(sql),
        "profesor_alumno_mio no acota a los alumnos de quien mira: cualquier profesor vería a todos los que estudian");
    }
    const rpc = fs.readdirSync(dir).find((f) => /profesores_que_estudian_conmigo\.sql$/.test(f));
    ok(!!rpc, "falta la migración profesores_que_estudian_conmigo");
    if (rpc) {
      const sql = fs.readFileSync(path.join(dir, rpc), "utf8");
      ok(!/security definer/i.test(sql), "profesores_que_estudian_conmigo debe ser SECURITY INVOKER (pasa por la RLS)");
      ok(/revoke execute on function public\.profesores_que_estudian_conmigo\(\) from public, anon/.test(sql),
        "profesores_que_estudian_conmigo no le quita el execute a public y anon");
    }

    const fn = leer("supabase/functions/admin-manage-users/index.ts");
    const bloque = (fn.split('action === "set_teachers"')[1] || "").split('action === "assign_bulk"')[0];
    ok(/alumno\.role !== "alumno" && alumno\.role !== "profesor"/.test(bloque),
      "set_teachers no acepta a un profesor como alumno");
    ok(!/updates\.role === "profesor"[\s\S]{0,200}profile_teachers[\s\S]{0,80}delete/.test(fn),
      "al subir a profesor se le siguen borrando sus profesores");
    ok(/role !== "alumno"/.test(fn.split('action === "assign_bulk"')[1] || "") || /\.role === "alumno"/.test(fn.split('action === "assign_bulk"')[1] || ""),
      "assign_bulk dejó de filtrar a los alumnos (el lote es solo de alumnos)");
  }

  // ---------- 2) sumar a los profesores que estudian ----------
  {
    const src = leer("js/alumnos-mios.js");
    const win = {};
    // El código es el del propio repositorio (js/alumnos-mios.js), no texto ajeno;
    // es el mismo modo de leer un módulo de navegador que usa verificar-tareas.js.
    new Function("window", src)(win);
    const M = win.AlumnosMios;
    ok(M && typeof M.sumarProfesores === "function" && typeof M.estudioConAlguien === "function", "js/alumnos-mios.js no expone sumarProfesores y estudioConAlguien");
    if (M) {
      const llamar = (data, error) => ({ rpc: async () => ({ data, error }) });
      let r = await M.sumarProfesores(llamar([{ id: "p1", full_name: "Zeta", email: "z@x" }, { id: "a1", full_name: "Ana", email: "a@x" }]),
        [{ id: "a1", full_name: "Ana", email: "a@x" }, { id: "a2", full_name: "Beto", email: "b@x" }]);
      ok(r.map((x) => x.id).join() === "a1,a2,p1", `debería sumar al profesor sin repetir ni desordenar, salió ${r.map((x) => x.id)}`);
      r = await M.sumarProfesores(llamar(null, { message: "boom" }), [{ id: "a1" }]);
      ok(r.length === 1 && r[0].id === "a1", "si la llamada falla, la lista de alumnos debería quedar como estaba");
      r = await M.sumarProfesores({ rpc: async () => { throw new Error("red"); } }, [{ id: "a1" }]);
      ok(r.length === 1, "si la llamada lanza, la lista de alumnos debería quedar como estaba");
      ok(await M.estudioConAlguien(llamar([{ profesor_id: "x" }])) === true, "estudioConAlguien debería ser verdadero con un profesor");
      ok(await M.estudioConAlguien(llamar([])) === false, "estudioConAlguien debería ser falso sin profesores");
      ok(await M.estudioConAlguien(llamar(null, { message: "boom" })) === false, "estudioConAlguien debería ser falso si falla");
    }
    ["tareas", "examenes", "proyecto", "preparacion-rivales", "juegos"].forEach((n) => {
      ok(leer(n + ".html").includes('src="js/alumnos-mios.js"'), `${n}.html no carga js/alumnos-mios.js`);
      ok(leer("js/" + n + ".js").includes("AlumnosMios.sumarProfesores"), `js/${n}.js no suma a los profesores que estudian`);
    });
  }

  // ---------- 3) Tareas, en un navegador ----------
  const navegador = await chromium.launch({ executablePath: CHROME });
  {
    // Ronaldo estudia con Oscar y Mora estudia con Ronaldo.
    const { ctx, pagina } = await abrirTareas(navegador, RONALDO, {
      clases: [{ profesor_id: "u-oscar", profesor: "Oscar", es_principal: true, clase_abierta: false }],
      estudian: [{ id: MORA.id, full_name: MORA.full_name, email: MORA.email, grupo: null }],
      tareas: [],
    });
    ok(await pagina.isVisible("#vista-profesor"), "Ronaldo (profesor) perdió su vista de profesor");
    const marcables = await pagina.$$eval(".alumno-check", (els) => els.map((e) => e.value));
    ok(marcables.includes("u-ana") && marcables.includes("u-mora"),
      `la lista de «Para quién» debería traer a Ana y a Mora (profesor que estudia con él), trajo ${marcables}`);
    ok(await pagina.isVisible("#vista-alumno"), "Ronaldo estudia con Oscar y no ve su lado de alumno en Tareas");
    ok(await pagina.isVisible("#alumno-tambien"), "falta el título «Tus tareas como alumno»");
    const llamadas = await pagina.evaluate(() => window.__llamadas);
    ok(llamadas.some((l) => l.rpc === "tareas_con_avance" && l.args && l.args.p_alumno === "u-ronaldo"),
      "no pidió SUS tareas de alumno con su propio id");
    await ctx.close();
  }
  {
    // Un profesor que no estudia con nadie: sin lado de alumno.
    const { ctx, pagina } = await abrirTareas(navegador, MORA, { clases: [], estudian: [], tareas: [] });
    ok(await pagina.isVisible("#vista-profesor"), "el profesor sin profesor perdió su vista");
    ok(!(await pagina.isVisible("#vista-alumno")), "un profesor que no estudia con nadie no debería ver un lado de alumno");
    await ctx.close();
  }
  {
    // La llamada que suma a los profesores falla: la lista queda como estaba.
    const { ctx, pagina } = await abrirTareas(navegador, MORA, { clases: [], fallaSumar: true });
    const marcables = await pagina.$$eval(".alumno-check", (els) => els.map((e) => e.value));
    ok(marcables.includes("u-ana"), "si falla profesores_que_estudian_conmigo, la lista de alumnos debería quedar igual");
    await ctx.close();
  }
  {
    // Quien administra no es alumno de nadie: ni siquiera pregunta.
    const { ctx, pagina } = await abrirTareas(navegador, ADMIN, { clases: [{ profesor_id: "x", profesor: "X" }] });
    ok(!(await pagina.isVisible("#vista-alumno")), "quien administra no debería ver un lado de alumno");
    await ctx.close();
  }
  await navegador.close();

  // ---------- 4) la clase en vivo y el panel ----------
  {
    const s = leer("js/sesion.js");
    ok(/comoAlumnoDeOtro \? "alumno" : profile\.role/.test(s),
      "entrando como alumno de otro, la presencia sigue diciendo «profesor»: no saldría en «Alumnos conectados» de su profesor");
    ok(/get\("como_alumno"\) === "1"/.test(s) && /!profile\.is_admin/.test(s.split('get("como_alumno")')[0].slice(-200)),
      "sesion.js no entra como alumno con como_alumno=1, o deja entrar a quien administra");
    ok(/m\.sender_id !== m\.student_id/.test(s),
      "en el chat, lo que escribe un profesor en SU hilo de alumno se pinta como del profe");
    const c = leer("js/clases.js");
    ok(/sesion\.html\?como_alumno=1&profe=/.test(c), "el panel no lleva a la clase del profesor con como_alumno=1&profe=");
    ok(/!profile\.is_admin && !profile\._persona\) cargarLadoAlumno/.test(c),
      "la tarjeta «También eres alumno» sale para quien administra o para quien se está mirando con «Ver como»");
    ok(leer("clases.html").includes('id="lado-alumno-card"'), "clases.html no trae la tarjeta «También eres alumno»");
    const a = leer("js/admin.js");
    ok(/campoFicha\("Estudia con"/.test(a), "la ficha de un profesor no deja ponerle con quién estudia");
  }

  if (fallos.length) {
    console.error(`❌ ${fallos.length} fallo(s):\n` + fallos.map((f) => "  - " + f).join("\n"));
    process.exit(1);
  }
  console.log("✅ Profesor que también es alumno: todo bien.");
}

main().catch((e) => { console.error(e); process.exit(1); });
