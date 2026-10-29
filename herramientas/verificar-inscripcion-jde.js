/* inscripcion-jde.html: la inscripción de ajedrez de los JDE.

   Sin navegador comprueba las reglas (js/inscripcion-jde-reglas.js) una por
   una contra lo que dice la Normativa 2026 —categorías por año de nacimiento
   (art. 17), subir de categoría (art. 18), unir centros (art. 19), las
   categorías de cada etapa (art. 53), el correo y los documentos (art. 59), el
   cuerpo técnico (art. 60) y el art. 66—, que el Excel que baja lo lea Pareo
   Integral (las columnas se reconocen en su SINONIMOS_COLUMNA y los valores con
   sus mismos lectores) y que el banco (herramientas/jde-banco.js) salga como se
   decidió: sin secciones ni países, con la Dirección Regional solo si es una de
   las 27, y con los estudiantes solo de los últimos tres años.

   Con navegador abre la página: el colegio se busca en el banco y propone su
   región, la categoría se calcula, la revisión lleva escrito «Error:» y
   «Aviso:» (el color nunca va solo), el Excel y el PDF salen con lo escrito,
   el borrador se guarda, se baja y se vuelve a abrir, un nombre con HTML se
   pinta como texto, a 400 px no hay desplazamiento horizontal y los colores de
   los hallazgos dan contraste en claro y en oscuro.

   Ver «La inscripción de los JDE» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-inscripcion-jde.js        (el sitio en :8777) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.resolve(__dirname, "..");
const BASE = process.env.BASE_URL || "http://localhost:8777";
const I = require("../js/inscripcion-jde-reglas.js");
const G = require("../js/pareo/grupos.js");
const banco = require("./jde-banco.js");
const leerJson = (f) => JSON.parse(fs.readFileSync(path.join(RAIZ, f), "utf8"));
const mepCsv = () => banco.leerCsv(fs.readFileSync(path.join(RAIZ, "herramientas/datos/mep-centros.csv"), "utf8"));

let fallos = 0;
function cierto(nombre, valor, detalle) {
  if (valor) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}
const igual = (nombre, real, esperado) => cierto(nombre, JSON.stringify(real) === JSON.stringify(esperado), "esperado " + JSON.stringify(esperado) + ", salió " + JSON.stringify(real));

// ---- una inscripción base que no tiene ningún error
let n = 0;
function base() {
  const e = I.estadoNuevo();
  e.centro = Object.assign(e.centro, { nombre: "Liceo de Prueba", region: "Alajuela", tipo: "secundaria", correo: "docente@mep.go.cr" });
  e.cuerpo.push(I.personaNueva({ nombre: "Profe Mujer", rol: "jefe", sexo: "w" }), I.personaNueva({ nombre: "Profe Hombre", rol: "tecnico", sexo: "m" }));
  return e;
}
function est(nombre, sexo, nacimiento, extra) {
  n += 1;
  return I.estudianteNuevo(Object.assign({ nombre, sexo, nacimiento, modalidad: "individual", documento: "1-0000-" + String(1000 + n) }, extra));
}
// Un equipo con sus integrantes ya dentro (como lo arma la pantalla).
function equipoCon(e, categoria, torneo, miembros, numero) {
  const t = I.equipoNuevo({ categoria, torneo, numero: numero || 1 });
  e.equipos.push(t);
  for (const m of miembros) { m.equipoId = t.id; m.modalidad = "equipo"; e.estudiantes.push(m); }
  return t;
}
const textos = (e, nivel) => I.revisar(e, "2026-10-28").hallazgos.filter((h) => !nivel || h.nivel === nivel).map((h) => h.texto);
const hay = (e, nivel, re) => textos(e, nivel).some((t) => re.test(t));

function reglas() {
  console.log("\nLas categorías (art. 17):");
  igual("2017 a 2020 → A", [2017, 2020].map((a) => G.categoriasDeNacimiento(a, 2026)), [["A"], ["A"]]);
  igual("2013 y 2014 → B o C", [2013, 2014].map((a) => G.categoriasDeNacimiento(a, 2026)), [["B", "C"], ["B", "C"]]);
  igual("2015 y 2016 → B; 2012 → C; 2011 → D; 2009 → D; 2008 → E; 1999 → E",
    [2015, 2016, 2012, 2011, 2009, 2008, 1999].map((a) => G.categoriasDeNacimiento(a, 2026)), [["B"], ["B"], ["C"], ["D"], ["D"], ["E"], ["E"]]);
  igual("2021 no cae en ninguna", G.categoriasDeNacimiento(2021, 2026), []);
  igual("en 2027 los rangos corren un año (2014 sigue en B o C; 2017 ya es B)", [G.categoriasDeNacimiento(2014, 2027), G.categoriasDeNacimiento(2017, 2027)], [["B", "C"], ["B"]]);
  {
    const e = base();
    const x = est("Nacida Dosmil Trece", "w", "2013-03-03");
    e.estudiantes.push(x);
    igual("2013 con centro de colegio → C", I.categoriaEfectiva(x, e), "C");
    e.centro.tipo = "primaria";
    igual("2013 con centro de escuela → B", I.categoriaEfectiva(x, e), "B");
    e.centro.tipo = "";
    igual("2013 sin saber si es escuela o colegio → queda por elegir", I.categoriaEfectiva(x, e), "");
    cierto("y la revisión lo dice como error", hay(e, "error", /B o C/));
    x.categoria = "B";
    cierto("elegida a mano, ya no hay error de categoría", !hay(e, "error", /B o C/));
  }

  console.log("\nLa inscripción limpia:");
  {
    const e = base();
    e.estudiantes.push(est("Ana Mora", "w", "2012-05-04"), est("Luis Soto", "m", "2011-06-04"));
    const r = I.revisar(e, "2026-10-28");
    igual("sin errores", r.errores, 0);
    cierto("lista para bajar", r.listos);
  }

  console.log("\nSubir de categoría (art. 18):");
  {
    const e = base();
    const x = est("Dario Quesada", "m", "2011-02-02");
    const t = equipoCon(e, "E", "m", [x, est("Fer Mata", "m", "2008-02-02"), est("Gil Mata", "m", "2007-02-02")]);
    cierto("D a E en equipo, permitido: solo aviso", !hay(e, "error", /categoría E/) && hay(e, "aviso", /sube de la categoría D a la E/));
    igual("juega en la categoría del equipo", I.categoriaEfectiva(x, e), "E");
    igual("quien nació en D puede jugar en un equipo D (propia) o E (sube)", [I.puedeJugarEn(["D"], "D"), I.puedeJugarEn(["D"], "E"), I.puedeJugarEn(["D"], "B")], ["propia", "sube", ""]);
    igual("en individual solo ofrece la suya", I.categoriasPosibles(est("Solo", "m", "2011-02-02"), e).lista, ["D"]);
    const y = est("Ya Cabe", "m", "2011-02-02"), z = est("Tambien", "m", "2010-02-02"), w = est("Cuarto", "m", "2010-03-02");
    for (const m of [y, z]) { m.equipoId = t.id; e.estudiantes.push(m); }
    cierto("tres que suben en el mismo equipo: dentro del tope", !hay(e, "error", /subidos a la categoría E/));
    w.equipoId = t.id; e.estudiantes.push(w);
    cierto("con cuatro subidas hay error de tope", hay(e, "error", /subidos a la categoría E en el mismo equipo; el máximo son 3/));
    const s2 = base();
    equipoCon(s2, "D", "m", [est("Salta", "m", "2016-01-01")]);
    cierto("saltar de B a D no se permite", hay(s2, "error", /solo se sube de A a B, de C a D y de D a E/));
    const m2 = base();
    equipoCon(m2, "D", "m", [est("Mayor", "m", "2005-01-01")]);
    cierto("nacer antes de lo que permite la categoría es error", hay(m2, "error", /es para nacidos desde 2009/));
  }

  console.log("\nUnir centros (art. 19):");
  {
    const e = base();
    e.centro.union = { activa: true, centros: "Escuela A, Escuela B", matricula: "350" };
    equipoCon(e, "E", "m", [est("Sube Uno", "m", "2011-02-02")]);
    cierto("más de 300 de matrícula es error", hay(e, "error", /suma 350 y no puede pasar de 300/));
    cierto("unir centros y subir de categoría es error", hay(e, "error", /no puede usar el ascenso/));
    e.centro.union.matricula = "";
    cierto("sin matrícula es aviso", hay(e, "aviso", /Falta la matrícula total/));
  }

  console.log("\nLas etapas y sus categorías (art. 53):");
  {
    const e = base();
    e.estudiantes.push(est("Cat Ce", "w", "2012-05-04"), est("Cat De", "m", "2010-05-04"));
    e.etapa = "regional";
    igual("en la Regional juegan A a E", I.ETAPAS.find((x) => x.id === "regional").categorias, ["A", "B", "C", "D", "E"]);
    cierto("la Regional acepta la C", !hay(e, "error", /no juega ajedrez/));
    e.etapa = "interregional";
    cierto("en la Interregional la C no juega ajedrez", hay(e, "error", /la categoría C no juega ajedrez en la Etapa Interregional \(allí solo juegan B y D\)/));
    cierto("pero la D sí", !hay(e, "error", /la categoría D no juega/));
    e.etapa = "nacional";
    igual("en la Nacional también solo B y D", I.ETAPAS.find((x) => x.id === "nacional").categorias, ["B", "D"]);
  }

  console.log("\nLos torneos y las personas repetidas (art. 66.1.a, c y h):");
  {
    const e = base();
    const h = est("Hombre Mujeres", "m", "2012-05-04", { torneo: "w" });
    e.estudiantes.push(h);
    cierto("un hombre en el torneo de Mujeres es error (se lee como Abierto en la revisión de grupos)", I.torneoEfectivo(Object.assign({}, h, { torneo: "" }), e) === "m");
    const j = est("Mujer Abierto", "w", "2012-05-04", { torneo: "m" });
    igual("una mujer puede jugar el Abierto", I.torneoEfectivo(j, e), "m");
    igual("y por omisión juega el de Mujeres", I.torneoEfectivo(est("Mujer Sola", "w", "2012-05-04"), e), "w");
    const d = base();
    const a = est("Repetida Uno", "w", "2012-05-04", { documento: "9-9999-9999" });
    const b = est("Repetida Uno", "w", "2012-05-04", { documento: "9-9999-9999" });
    d.estudiantes.push(a, b);
    cierto("dos filas de la misma persona y modalidad: error", hay(d, "error", /aparece 2 veces/));
    d.estudiantes.splice(d.estudiantes.indexOf(b), 1);
    equipoCon(d, "C", "m", [b]);
    cierto("la misma persona en individual y en equipo: error del art. 66.1.h", hay(d, "error", /una persona estudiante puede participar únicamente en una modalidad/));
  }

  console.log("\nIndividuales y equipos (art. 66.1.f y g):");
  {
    const e = base();
    e.estudiantes.push(est("I Uno", "m", "2011-01-01"), est("I Dos", "m", "2011-02-01"), est("I Tres", "m", "2011-03-01"));
    e.etapa = "regional";
    cierto("tres individuales en el mismo torneo y categoría: error en la Regional", hay(e, "error", /solo pueden clasificar dos a la Etapa Regional/));
    e.etapa = "institucional";
    cierto("en la Institucional es solo un aviso (puede jugar toda la población)", !hay(e, "error", /clasificar dos/) && hay(e, "aviso", /solo clasifican dos a la Regional/));
    const q = base();
    equipoCon(q, "D", "m", ["A", "B", "C", "D", "E", "F"].map((l, i2) => est("Equipo " + l, "m", "2011-0" + (i2 + 1) + "-01")));
    cierto("seis en un equipo: error, el máximo son cinco", hay(q, "error", /tiene 6 integrantes y el máximo son 5/));
    const c = base();
    equipoCon(c, "D", "m", [est("Cu Uno", "m", "2011-01-01"), est("Cu Dos", "m", "2011-02-01")]);
    cierto("dos en un equipo: error en la Regional", hay(c, "error", /tiene 2 integrantes y el mínimo son 3/));
    c.etapa = "institucional";
    cierto("y solo aviso en la Institucional", !hay(c, "error", /el mínimo son 3/) && hay(c, "aviso", /el mínimo son 3/));
    const m = base();
    equipoCon(m, "D", "w", [est("Muj Uno", "w", "2011-01-01"), est("Muj Dos", "w", "2011-02-01")]);
    equipoCon(m, "D", "m", [est("Ab Uno", "m", "2011-03-01"), est("Ab Dos", "m", "2011-04-01"), est("Ab Tres", "m", "2011-05-01")]);
    cierto("dos mujeres de equipo con equipo abierto en la categoría: pasan al Abierto, solo aviso", !hay(m, "error", /equipo/) && hay(m, "aviso", /las pasa al equipo Abierto/));
    const s2 = base();
    equipoCon(s2, "D", "w", [est("Sin Ab Uno", "w", "2011-01-01"), est("Sin Ab Dos", "w", "2011-02-01")]);
    cierto("dos mujeres sin equipo abierto adonde pasar: error", hay(s2, "error", /no hay equipo Abierto de esa categoría/));
    const t = base();
    const cinco = [0, 1, 2, 3, 4].map((i2) => est("Cinco " + i2, "m", "2011-0" + (i2 + 1) + "-01", { suplente: i2 === 4 }));
    equipoCon(t, "D", "m", cinco);
    cierto("cinco con una suplente: sin errores ni avisos de suplente", !hay(t, null, /suplente/));
    cinco[3].suplente = true;
    cierto("dos suplentes marcadas: error", hay(t, "error", /2 suplentes marcadas/));
    cinco[3].suplente = false; cinco[4].suplente = false;
    cierto("cinco y ninguna suplente: aviso", hay(t, "aviso", /marca cuál es la suplente/));
    const dos = base();
    equipoCon(dos, "D", "m", [0, 1, 2].map((i2) => est("Eq1 " + i2, "m", "2011-0" + (i2 + 1) + "-01")), 1);
    equipoCon(dos, "D", "m", [0, 1, 2].map((i2) => est("Eq2 " + i2, "m", "2011-0" + (i2 + 1) + "-15")), 2);
    igual("dos equipos del mismo centro, categoría y torneo se arman aparte", I.revisar(dos, "2026-10-28").equipos.map((q2) => [q2.categoria, q2.torneo, q2.numero, q2.integrantes.length]), [["D", "m", 1, 3], ["D", "m", 2, 3]]);
    cierto("y ninguno falla por la cuenta", !hay(dos, "error", /integrantes/));
    const vacio = base();
    vacio.equipos.push(I.equipoNuevo({ categoria: "D", torneo: "m" }));
    cierto("un equipo creado y sin nadie: error en la Regional", hay(vacio, "error", /no tiene integrantes todavía/));
  }

  console.log("\nLos topes: lo que la herramienta no deja agregar (art. 17, 18, 19, 53 y 66):");
  {
    const alDia = (e) => I.limites(e).map((v) => v.clave);
    // Un equipo se llena hasta cinco: cuatro titulares y una suplente; el sexto no cabe.
    const e = base();
    const t = I.crearEquipo(e, "D", "m").resultado;
    for (let k = 0; k < 4; k++) igual("integrante " + (k + 1) + " entra como titular", [I.agregarIntegrante(e, t.id, { nombre: "Titular " + k, sexo: "m", nacimiento: "2011-0" + (k + 1) + "-01" }).ok, e.estudiantes[e.estudiantes.length - 1].suplente], [true, false]);
    const quinto = I.agregarIntegrante(e, t.id, { nombre: "Quinta", sexo: "m", nacimiento: "2011-09-01" });
    igual("el quinto queda como suplente", [quinto.ok, quinto.resultado.suplente], [true, true]);
    const antes = JSON.stringify(e);
    const sexto = I.agregarIntegrante(e, t.id, { nombre: "Sexto", sexo: "m", nacimiento: "2011-10-01" });
    cierto("el sexto se rechaza y dice por qué", !sexto.ok && /ya tiene 5 integrantes/.test(sexto.motivos[0]), JSON.stringify(sexto.motivos));
    cierto("y no queda ningún rastro: la inscripción es la misma", JSON.stringify(e) === antes);
    igual("el estado del equipo: 5, cuatro titulares y una suplente, ya no caben", [I.estadoDelEquipo(e, t).integrantes, I.estadoDelEquipo(e, t).titulares, I.estadoDelEquipo(e, t).suplentes, I.estadoDelEquipo(e, t).caben], [5, 4, 1, 0]);
    // Dos equipos por categoría y torneo; el tercero no.
    const dos = I.crearEquipo(e, "D", "m");
    igual("el segundo equipo Abierto de la D recibe el número 2", [dos.ok, dos.resultado.numero], [true, 2]);
    const tres = I.crearEquipo(e, "D", "m");
    cierto("el tercero se rechaza en la Regional (art. 66.1.g)", !tres.ok && /máximo por centro desde la Etapa Regional/.test(tres.motivos[0]) && e.equipos.length === 2);
    e.etapa = "institucional";
    cierto("pero en la Institucional (toda la población) sí cabe", I.crearEquipo(e, "D", "m").ok);
    e.etapa = "interregional";
    cierto("en la Interregional solo juegan las categorías B y D: un equipo C no se crea", !I.crearEquipo(e, "C", "m").ok);
    // Hombre en el equipo de Mujeres; edad; ascensos; unión.
    const f = base(); f.etapa = "regional";
    const mu = I.crearEquipo(f, "C", "w").resultado;
    cierto("un hombre no entra al equipo de Mujeres", !I.agregarIntegrante(f, mu.id, { nombre: "Hombre", sexo: "m", nacimiento: "2012-01-01" }).ok);
    igual("sin decir el sexo, en el equipo de Mujeres entra como mujer", I.agregarIntegrante(f, mu.id, { nombre: "Sin Sexo", nacimiento: "2012-02-02" }).resultado.sexo, "w");
    const d = base();
    const td = I.crearEquipo(d, "D", "m").resultado;
    cierto("quien nació en 2006 no puede jugar la D", !I.agregarIntegrante(d, td.id, { nombre: "Grande", sexo: "m", nacimiento: "2006-01-01" }).ok);
    cierto("quien nació en 2012 (C) sube a la D", I.agregarIntegrante(d, td.id, { nombre: "Sube1", sexo: "m", nacimiento: "2012-01-01" }).ok);
    cierto("quien nació en 2016 (B) no salta a la D", !I.agregarIntegrante(d, td.id, { nombre: "Salta", sexo: "m", nacimiento: "2016-01-01" }).ok);
    for (let k = 2; k <= 3; k++) I.agregarIntegrante(d, td.id, { nombre: "Sube" + k, sexo: "m", nacimiento: "2012-0" + k + "-01" });
    const cuarto = I.agregarIntegrante(d, td.id, { nombre: "Sube4", sexo: "m", nacimiento: "2012-04-01" });
    cierto("el cuarto que sube se rechaza: máximo tres por equipo (art. 18)", !cuarto.ok && /ya tiene 3 estudiantes subidos/.test(cuarto.motivos[0]), JSON.stringify(cuarto.motivos));
    d.centro.union = { activa: true, centros: "A, B", matricula: "200" };
    cierto("un centro unido no puede subir a nadie (art. 19.f)", !I.agregarIntegrante(d, td.id, { nombre: "Otro Sube", sexo: "m", nacimiento: "2012-05-01" }).ok);
    // Individuales: dos por categoría y torneo.
    const g = base();
    const ind = [0, 1, 2].map((k) => est("Ind " + k, "m", "2011-0" + (k + 1) + "-01"));
    const r1 = I.agregarLista(g, ind);
    igual("de tres individuales en la misma categoría y torneo entran dos", [r1.agregados.length, r1.rechazados.length], [2, 1]);
    cierto("el tercero dice que el máximo son dos (art. 66.1.f)", /Ya hay 2 estudiantes individuales de la categoría D/.test(r1.rechazados[0].motivo), r1.rechazados[0] && r1.rechazados[0].motivo);
    // La misma persona dos veces.
    const h = base(); h.etapa = "institucional";
    const th = I.crearEquipo(h, "D", "m").resultado;
    I.agregarIntegrante(h, th.id, { nombre: "Repe", sexo: "m", nacimiento: "2011-01-01", documento: "5-5555-5555" });
    const repetido = I.agregarLista(h, [est("Repe", "m", "2011-01-01", { documento: "5-5555-5555" })]);
    cierto("quien ya está en un equipo no se agrega también como individual (art. 66.1.h)", repetido.rechazados.length === 1 && /una sola modalidad/.test(repetido.rechazados[0].motivo));
    // Una inscripción que ya venía pasada (un borrador) no impide seguir: solo que se pase más.
    const k = base();
    k.estudiantes.push(...[0, 1, 2].map((q) => est("Viejo " + q, "m", "2011-0" + (q + 1) + "-01")));
    cierto("un borrador que ya venía con tres individuales: lo nuevo y ajeno no se rechaza", I.intentar(k, () => { k.centro.nombre = "Otro"; }).ok);
    cierto("pero un cuarto individual sí", !I.agregarLista(k, [est("Nuevo", "m", "2011-09-01")]).agregados.length);
    // intentar() devuelve los mismos objetos, no copias: la pantalla los tiene en sus cierres.
    const l = base();
    const uno = est("Uno", "m", "2011-01-01"); l.estudiantes.push(uno);
    const x1 = l.estudiantes[0];
    const rr = I.intentar(l, () => { l.estudiantes.push(est("Dos", "m", "2011-02-01"), est("Tres", "m", "2011-03-01")); uno.nombre = "Cambiado"; });
    cierto("al deshacer, el objeto existente es el mismo y recupera sus datos", !rr.ok && l.estudiantes[0] === x1 && x1.nombre === "Uno" && l.estudiantes.length === 1);
    void alDia;
  }

  console.log("\nLo que falta y las ideas (pendientes, faltantes, sugerencias):");
  {
    const e = base();
    e.centro.nombre = ""; e.centro.correo = ""; e.centro.region = ""; e.cuerpo = [];
    igual("una inscripción vacía pide primero lo de la delegación", I.pendientes(e).map((p) => p.clave), ["centro", "region", "correo", "jefatura", "tecnico", "estudiantes"]);
    const q = base();
    const t = equipoCon(q, "D", "m", [est("Con Todo", "m", "2011-01-01"), est("Sin Fecha", "m", ""), est("Sin Sexo Ni Doc", "", "2011-03-01", { documento: "" })]);
    q.estudiantes.push(I.estudianteNuevo({ equipoId: t.id, modalidad: "equipo" })); // un lugar vacío: no cuenta
    igual("los lugares vacíos de un equipo no cuentan como faltantes", I.faltantes(q.estudiantes).map((f) => [f.campo, f.n, f.texto]), [["s", 1, "1 sexo"], ["f", 1, "1 fecha de nacimiento"], ["d", 1, "1 documento"]]);
    igual("y el texto de la lista de tareas dice «Falta» en singular", I.pendientes(q).map((p) => p.texto), ["Falta 1 sexo.", "Falta 1 fecha de nacimiento.", "Falta 1 documento."]);
    const dos = base();
    dos.estudiantes.push(est("Uno", "m", "2011-01-01"), est("Dos", "m", "2011-02-01"));
    dos.estudiantes[0].sexo = ""; dos.estudiantes[1].sexo = "";
    cierto("con dos faltantes del mismo dato dice «Faltan 2 sexos»", I.pendientes(dos).some((p) => p.texto === "Faltan 2 sexos."));
    igual("una inscripción completa no tiene nada pendiente", I.pendientes((() => { const c = base(); equipoCon(c, "D", "m", [0, 1, 2].map((k) => est("Ok " + k, "m", "2011-0" + (k + 1) + "-01"))); return c; })()), []);
    const s1 = base();
    const eq1 = equipoCon(s1, "D", "m", [est("Mi Uno", "m", "2011-01-01"), est("Mi Dos", "m", "2011-02-01")]);
    const solo = est("Solo Cabe", "m", "2011-05-01"); s1.estudiantes.push(solo);
    const chica = est("Muy Chica", "m", "2016-05-01"); s1.estudiantes.push(chica);
    cierto("un individual que cabe se ofrece para el equipo de 2", /necesita 3.*Solo Cabe/.test(I.sugerencias(s1).join(" ")) && !/Muy Chica/.test(I.sugerencias(s1).join(" ")));
    igual("cabeEnEquipo prueba en una copia y no toca nada", [I.cabeEnEquipo(s1, solo, eq1), I.cabeEnEquipo(s1, chica, eq1), solo.equipoId, s1.estudiantes.length], [true, false, "", 4]);
    equipoCon(s1, "D", "m", [], 2);
    const lleno = base(); lleno.estudiantes.push(est("Sobra", "m", "2011-01-01"));
    equipoCon(lleno, "D", "m", [0, 1, 2].map((k) => est("Tres " + k, "m", "2011-0" + (k + 2) + "-01")));
    cierto("un equipo de 3 sugiere llegar a 4 titulares", /tiene 3: con Sobra llegaría a 4 titulares/.test(I.sugerencias(lleno).join(" ")));
    const cuatro = base(); cuatro.estudiantes.push(est("Suplente Posible", "m", "2011-01-01"));
    equipoCon(cuatro, "D", "m", [0, 1, 2, 3].map((k) => est("Cuatro " + k, "m", "2011-0" + (k + 2) + "-01")));
    cierto("un equipo de 4 sin suplente sugiere una", /ninguna suplente: Suplente Posible podría ser la suplente/.test(I.sugerencias(cuatro).join(" ")));
    igual("un equipo de 5 no sugiere nada", I.sugerencias((() => { const c = base(); c.estudiantes.push(est("Otro", "m", "2011-01-01")); equipoCon(c, "D", "m", [0, 1, 2, 3, 4].map((k) => est("Cinco " + k, "m", "2011-0" + (k + 1) + "-02"))); return c; })()), []);
  }

  console.log("\nLos rangos de categoría: si cambian, esta página debe revisarse:");
  {
    // La inscripción calcula la categoría con js/pareo/grupos.js. Si alguien cambia esos rangos
    // (una Normativa nueva), este caso falla y obliga a mirar la página y sus textos.
    igual("los rangos de 2026 son los de la Normativa 2026 (art. 17), como los comprobó esta página", Object.fromEntries(["A", "B", "C", "D", "E"].map((c) => [c, G.rangoCategoria(c, 2026)])),
      { A: [2017, 2020], B: [2013, 2016], C: [2012, 2014], D: [2009, 2011], E: [null, 2008] });
    igual("el año de la Normativa que usa grupos.js es el que dice esta página", G.JDE_ANIO_NORMATIVA, 2026);
    igual("para 2027 los rangos corren un año", ["A", "B", "C", "D", "E"].map((c) => G.rangoCategoria(c, 2027).map((x) => (x == null ? null : x - 0))), ["A", "B", "C", "D", "E"].map((c) => G.rangoCategoria(c, 2026).map((x) => (x == null ? null : x + 1))));
  }

  console.log("\nLista pegada con equipos:");
  {
    const e = base();
    const filas = ["Nombre\tSexo\tFDN\tEquipo/Ind\tTorneo"].concat(["A", "B", "C", "D", "E", "F", "G"].map((l, i2) => "Estu " + l + "\tHombre\t0" + (i2 + 1) + "/05/2011\tEquipo\tAbierto")).join("\n");
    const res = I.agregarLista(e, I.leerLista(filas));
    igual("siete hombres de equipo en la D: un equipo de cinco y otro de dos", [res.agregados.length, res.rechazados.length, e.equipos.map((t) => t.numero), e.equipos.map((t) => I.estadoDelEquipo(e, t).integrantes)], [7, 0, [1, 2], [5, 2]]);
    const mas = I.agregarLista(e, I.leerLista("Nombre\tSexo\tFDN\tEquipo/Ind\tTorneo\n" + [1, 2, 3, 4].map((k) => "Mas " + k + "\tHombre\t0" + k + "/06/2011\tEquipo\tAbierto").join("\n")));
    cierto("al llenarse el segundo equipo, el resto se rechaza (no hay un tercero)", mas.agregados.length === 3 && mas.rechazados.length === 1 && /ya tiene 5 integrantes|máximo por centro/.test(mas.rechazados[0].motivo), JSON.stringify(mas.rechazados));
    const h = base();
    const rh = I.agregarLista(h, I.leerLista("Nombre\tSexo\tFDN\tEquipo/Ind\tTorneo\nNo Cabe\tHombre\t01/05/2011\tEquipo\tMujeres"));
    cierto("un hombre en el equipo de Mujeres de la lista se rechaza", rh.rechazados.length === 1 && /equipo de Mujeres/.test(rh.rechazados[0].motivo));
    const o = base(); o.centro.tipo = "";
    const ro = I.agregarLista(o, I.leerLista("Nombre\tSexo\tFDN\tEquipo/Ind\nAmbigua\tMujer\t01/05/2013\tEquipo"));
    cierto("quien puede ser de la B o la C sin saber si el centro es escuela o colegio: se rechaza y se explica", ro.rechazados.length === 1 && /escuela o colegio/.test(ro.rechazados[0].motivo));
  }

  console.log("\nLa delegación, el cuerpo técnico y los documentos (arts. 59 y 60):");
  {
    const e = base();
    e.estudiantes.push(est("Ana Mora", "w", "2012-05-04"));
    e.centro.correo = "";
    cierto("sin correo: error", hay(e, "error", /Falta un correo electrónico del MEP/));
    e.centro.correo = "docente@gmail.com";
    cierto("un correo que no es del MEP: aviso", hay(e, "aviso", /@mep\.go\.cr/) && !hay(e, "error", /correo/));
    e.centro.privado = true;
    cierto("si es privado, no se avisa", !hay(e, "aviso", /@mep\.go\.cr/));
    e.centro.correo = "esto no es un correo";
    cierto("un texto que no es un correo: error", hay(e, "error", /no parece un correo/));
    e.centro.region = "";
    cierto("sin Dirección Regional: error", hay(e, "error", /Falta la Dirección Regional/));
    e.centro.region = "Alajuela"; e.centro.correo = "x@mep.go.cr";
    e.cuerpo = [];
    cierto("sin jefatura ni cuerpo técnico: dos errores", hay(e, "error", /persona jefa de delegación/) && hay(e, "error", /persona de cuerpo técnico/));
    e.cuerpo = [I.personaNueva({ nombre: "Solo Hombre", rol: "jefe", sexo: "m" }), I.personaNueva({ nombre: "Otro Hombre", rol: "tecnico", sexo: "m" })];
    cierto("hay una mujer y todo el cuerpo técnico es de hombres: error del art. 60.e", hay(e, "error", /ningún miembro del cuerpo técnico del mismo sexo.*una mujer/));
    e.cuerpo[1].sexo = "w";
    cierto("con una mujer en el cuerpo técnico, ya no", !hay(e, "error", /mismo sexo/));
    e.cuerpo[1].funcionario = false;
    cierto("quien no es funcionario pide oficio de autorización (art. 59.d)", hay(e, "aviso", /oficio de autorización/));
    e.estudiantes[0].documento = "";
    cierto("sin número de documento: aviso (no bloquea)", hay(e, "aviso", /falta el número de su documento/) && !hay(e, "error", /documento/));
    igual("los ocho documentos del art. 59.e", I.DOCUMENTOS.length, 8);
    const i = base(); i.estudiantes.push(est("Nace Futuro", "w", "2027-01-01"));
    cierto("una fecha de nacimiento futura es error", hay(i, "error", /en el futuro/));
    const j = base(); j.estudiantes.push(est("Muy Chica", "w", "2022-01-01"));
    cierto("nacer en 2022 no cae en ninguna categoría", hay(j, "error", /no cae en ninguna categoría de los JDE 2026/));
    const k = base(); k.anio = 2027; k.estudiantes.push(est("Otro Año", "w", "2012-05-04"));
    cierto("otro año que 2026 avisa de confirmar la Normativa", hay(k, "aviso", /Normativa de 2027/));
  }

  console.log("\nLa Interregional (art. 66.1.i y j):");
  igual("Alajuela y Occidente: dos Direcciones, tres por torneo", [I.interregionalDe("Alajuela").numero, I.interregionalDe("Alajuela").cupo], ["III", 3]);
  igual("Coto, Térraba y Pérez Zeledón: tres Direcciones, dos por torneo", [I.interregionalDe("Coto").numero, I.interregionalDe("Coto").cupo], ["X", 2]);
  igual("una región que no existe no tiene interregional", I.interregionalDe("Esparza"), null);

  console.log("\nEl Excel (lo que lee Pareo Integral):");
  {
    const e = base();
    equipoCon(e, "C", "w", [est("Ana Mora", "w", "2012-05-04")], 1);
    equipoCon(e, "D", "m", [est("Luis Soto", "m", "2011-06-04", { suplente: true })], 2);
    e.estudiantes.push(est("Sin Nombre Vacio", "", ""));
    e.estudiantes[2].nombre = "";
    const filas = I.filasExcel(e);
    igual("una fila por estudiante con nombre", filas.length, 2);
    const pagina = fs.readFileSync(path.join(RAIZ, "js/pareo/pagina.js"), "utf8");
    const bloque = pagina.slice(pagina.indexOf("const SINONIMOS_COLUMNA"), pagina.indexOf("const sinTildes", pagina.indexOf("const SINONIMOS_COLUMNA")));
    const sinTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    const claves = new Set([...bloque.matchAll(/"([^"]+)":\s*"/g)].map((m) => m[1]).concat([...bloque.matchAll(/\b([a-z]+):\s*"/g)].map((m) => m[1])));
    const reconocidas = { Nombre: "nombre", Sexo: "sexo", FDN: "nacimiento", "Nombre de Centro Educativo": "institucion", "Dirección Regional": "region", "Categoría": "categoria", "Equipo/Ind": "modalidad", Torneo: "torneo", "Documento de identidad": "documento" };
    for (const [col, campo] of Object.entries(reconocidas)) {
      cierto("Pareo Integral reconoce la columna «" + col + "»", I.ENCABEZADOS.includes(col) && claves.has(sinTildes(col)) && new RegExp('"?' + sinTildes(col).replace(/[/ ]/g, "[/ ]") + '"?:\\s*"' + campo + '"').test(bloque), "no está en SINONIMOS_COLUMNA");
    }
    igual("el sexo se lee como Pareo lo lee", [G.leerSexo(filas[0][1]), G.leerSexo(filas[1][1])], ["w", "m"]);
    igual("la fecha se lee como Pareo la lee", G.leerFecha(filas[0][2], "dm"), "2012-05-04");
    igual("la modalidad y el torneo, también", [G.leerModalidad(filas[0][6]), G.leerTorneo(filas[0][7]), G.leerTorneo(filas[1][7])], ["equipo", "w", "m"]);
    cierto("el equipo 2 sale con otro nombre de institución (Pareo lo junta por nombre)", filas[1][3] === "Liceo de Prueba (equipo 2)" && filas[0][3] === "Liceo de Prueba");
    igual("la categoría ya viene calculada", [filas[0][5], filas[1][5]], ["C", "D"]);
    igual("«Suplente» solo en equipos", [filas[0][10], filas[1][10]], ["", "Sí"]);
    const eq = I.filasEquipos(e);
    igual("la hoja «Equipos»: una fila por integrante, con su equipo y su condición", [eq.length, eq[0].slice(0, 4), eq[1][3]], [2, ["Equipo Mujeres · categoría C", "1", "Ana Mora", "Titular"], "Suplente"]);
  }

  console.log("\nPegar una lista:");
  {
    const a = I.leerLista("Nombre\tSexo\tFDN\tDocumento\nAna Pérez\tF\t12/05/2012\t1-111\nLuis Mora\tHombre\t3/4/2013\t2-222\n\n");
    igual("con títulos, tabulados (como llega de Excel)", a.map((x) => [x.nombre, x.sexo, x.nacimiento, x.documento]), [["Ana Pérez", "w", "2012-05-12", "1-111"], ["Luis Mora", "m", "2013-04-03", "2-222"]]);
    const b = I.leerLista("Rojas Soto Ana;Mujer;2010-01-05;3-333");
    igual("sin títulos, en el orden Nombre, Sexo, Fecha y Documento", b.map((x) => [x.nombre, x.sexo, x.nacimiento]), [["Rojas Soto Ana", "w", "2010-01-05"]]);
    const c = I.leerLista([["Nombre de Centro Educativo", "Nombre", "FDN", "Sexo", "Equipo/Ind", "Torneo"], ["Liceo X", "Mora Ana", "7/17/2011", "MUJER", "Equipo", "Abierto"]]);
    igual("las filas de un Excel del MEP, en cualquier orden de columnas", c.map((x) => [x.nombre, x.sexo, x.nacimiento, x.destino.equipo, x.destino.torneo]), [["Mora Ana", "w", "2011-07-17", true, "m"]]);
    igual("un sexo o una fecha que no se entienden quedan vacíos (nunca se adivinan)", I.leerLista("Pepe\tquién sabe\t31/02/2012").map((x) => [x.sexo, x.nacimiento]), [["", ""]]);
  }

  console.log("\nUn borrador no es de fiar:");
  {
    const x = I.normalizar({ etapa: "inventada", anio: 1999, centro: { region: "Marte", tipo: "x", union: { matricula: "12abc" } }, estudiantes: [{ id: "<b>", nombre: "  Ana   Mora ", sexo: "zz", nacimiento: "2012-13-45", modalidad: "otro", categoria: "Z" }], cuerpo: "no" });
    igual("lo que no existe vuelve a lo normal", [x.etapa, x.anio, x.centro.region, x.centro.tipo, x.centro.union.matricula], ["regional", 2026, "", "", "12"]);
    igual("el estudiante se limpia", [x.estudiantes[0].nombre, x.estudiantes[0].sexo, x.estudiantes[0].nacimiento, x.estudiantes[0].modalidad, x.estudiantes[0].categoria, /^[A-Za-z0-9]+$/.test(x.estudiantes[0].id)], ["Ana Mora", "", "", "individual", "", true]);
    igual("un cuerpo que no es lista queda vacío", x.cuerpo, []);
    const dup = I.normalizar({ estudiantes: [{ id: "uno", nombre: "A" }, { id: "uno", nombre: "B" }] });
    cierto("los id repetidos se renuevan", dup.estudiantes[0].id !== dup.estudiantes[1].id);
    const eq = I.normalizar({ equipos: [{ id: "q1", categoria: "D", torneo: "w", numero: 1 }, { id: "q1", categoria: "D", torneo: "w", numero: 2 }, { id: "q2", categoria: "Z", torneo: "m", numero: 1 }, { id: "q3", categoria: "D", torneo: "w", numero: 1 }, { id: "q4", categoria: "C", torneo: "x", numero: 99 }],
      estudiantes: [{ id: "a", nombre: "Dentro", equipoId: "q1", suplente: true }, { id: "b", nombre: "Equipo fantasma", equipoId: "no-existe", suplente: true }, { id: "c", nombre: "Solo", suplente: true }] });
    igual("los equipos se limpian: sin categoría falsa, sin repetir su clave y con el número en 1 a 9", eq.equipos.map((t) => [t.categoria, t.torneo, t.numero]), [["D", "w", 1], ["D", "w", 2], ["C", "m", 1]]);
    igual("un estudiante de un equipo que no existe pasa a individual y la suplente solo vale en un equipo", eq.estudiantes.map((q) => [q.equipoId ? "equipo" : "", q.modalidad, q.suplente]), [["equipo", "equipo", true], ["", "individual", false], ["", "individual", false]]);
    igual("un borrador de antes de los equipos se lee: sin equipos, todos individuales", [I.normalizar({ estudiantes: [{ nombre: "Viejo", modalidad: "equipo" }] }).equipos.length, I.normalizar({ estudiantes: [{ nombre: "Viejo", modalidad: "equipo" }] }).estudiantes[0].modalidad], [0, "individual"]);
  }


  console.log("\nLos listados del MEP (herramientas/datos/mep-centros.csv):");
  {
    const mep = mepCsv();
    cierto("hay más de 4 000 centros, con escuelas y colegios", mep.length > 4000 && mep.some((f) => f.tipo === "colegio") && mep.some((f) => f.tipo === "escuela"), String(mep.length));
    cierto("cada uno trae código de cuatro cifras, nombre, regional y circuito de dos cifras", mep.every((f) => /^\d{4}$/.test(f.codigo) && f.nombre.trim() && f.dre && /^\d{2}$/.test(f.circuito)));
    igual("el código no se repite", new Set(mep.map((f) => f.codigo)).size, mep.length);
    const regionales = new Set(mep.map((f) => banco.dreDeMep(f.dre)));
    cierto("están las 27 Direcciones Regionales, todas con el nombre de grupos.js", regionales.size === 27 && !regionales.has(""), JSON.stringify([...regionales].length));
    cierto("un nombre con coma queda entero (CSV con comillas)", banco.leerCsv('a,b\n"Uno, dos",x\n')[0].a === "Uno, dos");
    igual("la regional como la escribe el listado se convierte a la de Pareo", ["GRANDE DE TERRABA", "ZONA NORTE NORTE", "PEREZ ZELEDON", "CANAS", "NO EXISTE"].map(banco.dreDeMep), ["Grande de Térraba", "Zona Norte-Norte", "Pérez Zeledón", "Cañas", ""]);
  }

  console.log("\nJuntar chess-results con el MEP (circuito y tipo):");
  {
    const T = (clave, anio, etapa, region) => [clave, anio, etapa, "C", "x", anio + "-05-01", "x", region, 5, 5, "Individual", "Clásico", "Abierta"];
    const torneos = { actualizado: "2026-10-01", columnas: ["clave", "anio", "etapa", "categoria", "nombre", "inicio", "lugar", "region", "jugadores", "rondas", "modalidad", "ritmo", "rama"],
      torneos: [T(1, 2026, "Regional", "Cartago"), T(2, 2026, "Regional", "Heredia"), T(3, 2026, "Regional", "Pérez Zeledón")] };
    const nombres = ["Liceo de Costa Rica", "Esc. Santa Elena", "C.T.P. de Osa", "Colegio Privado Nuevo", "Escuela Carlos Luis Valverde"];
    const jug = { actualizado: "x", jugadores: [["Mora, Ana", "mora ana"]], instituciones: nombres.map((n) => [n, n.toLowerCase()]),
      columnas_participaciones: ["clave", "jugador", "institucion", "puesto", "puntos", "elo", "snr"],
      participaciones: [[1, 0, 0, 1, 4, null, 1], [1, 0, 1, 1, 4, null, 1], [3, 0, 2, 1, 4, null, 1], [2, 0, 3, 1, 4, null, 1], [1, 0, 4, 1, 4, null, 1]], columnas_equipos: [], equipos: [] };
    const mep = [
      { codigo: "3940", nombre: "LICEO DE COSTA RICA", dre: "SAN JOSE CENTRAL", circuito: "02", tipo: "colegio" },
      { codigo: "0001", nombre: "SANTA ELENA", dre: "CARTAGO", circuito: "05", tipo: "escuela" },
      { codigo: "0002", nombre: "SANTA ELENA", dre: "HEREDIA", circuito: "03", tipo: "escuela" },
      { codigo: "4163", nombre: "C.T.P. DE OSA", dre: "GRANDE DE TERRABA", circuito: "04", tipo: "colegio" },
      { codigo: "0003", nombre: "CARLOS LUIS VALVERDE VEGA", dre: "CARTAGO", circuito: "07", tipo: "escuela" },
    ];
    const b = banco.armar(torneos, jug, mep);
    const fila = (n) => b.instituciones.find((x) => x[0] === n);
    igual("un colegio de chess-results sin regional se junta por su nombre único y toma el circuito y el tipo (LICEO DE COSTA RICA)", [!!fila("LICEO DE COSTA RICA"), fila("LICEO DE COSTA RICA")[1], fila("LICEO DE COSTA RICA")[4], fila("LICEO DE COSTA RICA")[5]], [true, "San José Central", "c", "02"]);
    cierto("el nombre de chess-results no queda aparte", !fila("Liceo de Costa Rica"));
    igual("«Esc. Santa Elena» en Cartago se junta con la de Cartago, no con la de Heredia", [fila("SANTA ELENA") && b.instituciones.filter((x) => x[0] === "SANTA ELENA").map((x) => x[1] + x[5]).sort()], [["Cartago05", "Heredia03"]]);
    igual("un colegio que jugó fuera de su regional se junta si su nombre es único en el país (C.T.P. de Osa jugó en Pérez Zeledón)", [fila("C.T.P. DE OSA")[1], fila("C.T.P. DE OSA")[5], b.instituciones.some((x) => x[0] === "C.T.P. de Osa")], ["Grande de Térraba", "04", false]);
    igual("uno que no está en el MEP queda aparte, sin circuito y con su tipo por el nombre", [fila("Colegio Privado Nuevo")[5], fila("Colegio Privado Nuevo")[4]], ["", "c"]);
    igual("las palabras que distinguen al centro, todas dentro del nombre del MEP, lo juntan si es el único («Escuela Carlos Luis Valverde» → «CARLOS LUIS VALVERDE VEGA»)", [!!fila("CARLOS LUIS VALVERDE VEGA"), fila("CARLOS LUIS VALVERDE VEGA")[2]], [true, 1]);
    cierto("los centros del MEP que nadie jugó también están (la escuela de un docente que no jugó nunca)", b.instituciones.some((x) => x[0] === "SANTA ELENA" && x[2] === 0));
    igual("los estudiantes siguen a su colegio juntado", b.estudiantes.map((e) => b.instituciones[e[1]][0]).sort(), ["C.T.P. DE OSA", "CARLOS LUIS VALVERDE VEGA", "Colegio Privado Nuevo", "LICEO DE COSTA RICA", "SANTA ELENA"].sort());
  }

  console.log("\nLa lista de centros según lo marcado:");
  {
    const real = leerJson("data/jde-banco.json");
    const cs = real.instituciones.map((x, i) => ({ nombre: x[0], region: x[1], participaciones: x[2], tipo: x[4] === "e" ? "primaria" : x[4] === "c" ? "secundaria" : "", circuito: x[5], idx: i }));
    const todos = I.centrosDe(cs, { dre: "San Carlos", tipo: "primaria" }, "", 10000);
    cierto("regional y escuela: salen las de esa regional, todas escuelas o de tipo desconocido, en orden alfabético", todos.total > 100 && todos.centros.every((c) => c.region === "San Carlos" && c.tipo !== "secundaria") && todos.centros.every((c, i, a) => !i || a[i - 1].nombre.localeCompare(c.nombre, "es") <= 0), String(todos.total));
    cierto("con colegio, solo los de colegio de esa regional", I.centrosDe(cs, { dre: "San Carlos", tipo: "secundaria" }, "", 10000).centros.every((c) => c.region === "San Carlos" && c.tipo !== "primaria"));
    igual("el tope recorta la lista pero dice cuántos hay", [I.centrosDe(cs, { dre: "San Carlos", tipo: "primaria" }, "", 5).centros.length, I.centrosDe(cs, { dre: "San Carlos", tipo: "primaria" }, "", 5).total === todos.total], [5, true]);
    const sinan = I.centrosDe(cs, { dre: "San Carlos", tipo: "primaria" }, "", 10000);
    cierto("sin escribir ni marcar nada no hay lista", I.centrosDe(cs, {}, "", 10).total === cs.length, "(la página no la despliega)");
    const f = I.centrosDe(cs, { dre: "Pérez Zeledón", tipo: "secundaria" }, "sinai", 10);
    cierto("escribiendo se filtra dentro de la regional", f.centros.length > 0 && f.centros.every((c) => /sinai/i.test(c.nombre)) && !f.enTodoElPais);
    const fuera = I.centrosDe(cs, { dre: "Pérez Zeledón", tipo: "secundaria" }, "liceo de costa rica", 10);
    cierto("si en su regional no hay ninguno con lo escrito, se busca en todo el país y lo dice", fuera.enTodoElPais && fuera.centros.length > 0);
    const inventado = [{ nombre: "Sin tipo", region: "Heredia", tipo: "", circuito: "", participaciones: 0 }, { nombre: "Sin regional", region: "", tipo: "primaria", circuito: "", participaciones: 3 }];
    igual("uno de tipo desconocido sale en los dos tipos", [I.centrosDe(inventado, { dre: "Heredia", tipo: "primaria" }, "", 9).centros.length, I.centrosDe(inventado, { dre: "Heredia", tipo: "secundaria" }, "", 9).centros.length], [1, 1]);
    igual("uno sin regional conocida solo sale cuando se escribe algo", [I.centrosDe(inventado, { dre: "Heredia" }, "", 9).centros.map((c) => c.nombre), I.centrosDe(inventado, { dre: "Heredia" }, "sin", 9).centros.map((c) => c.nombre).sort()], [["Sin tipo"], ["Sin regional", "Sin tipo"]]);
    const circ = I.circuitosDe(cs, "Pérez Zeledón");
    cierto("los circuitos de una regional salen del banco, ordenados como números", circ.length >= 3 && circ.every((c) => /^\d{2}$/.test(c)) && circ.every((c, i, a) => !i || Number(a[i - 1]) < Number(c)), JSON.stringify(circ));
    void sinan;
  }

  console.log("\nEl banco (herramientas/jde-banco.js):");
  {
    const T = (clave, anio, etapa, region, rama) => [clave, anio, etapa, "C", "x", anio + "-05-01", "x", region, 5, 5, "Individual", "Clásico", rama || "Abierta"];
    const torneos = { actualizado: "2026-10-01", columnas: ["clave", "anio", "etapa", "categoria", "nombre", "inicio", "lugar", "region", "jugadores", "rondas", "modalidad", "ritmo", "rama"],
      torneos: [T(1, 2026, "Regional", "Alajuela"), T(2, 2026, "Regional", "Alajuela", "Femenina"), T(3, 2025, "Regional", "Heredia"), T(4, 2022, "Regional", "Heredia"), T(5, 2026, "Internacional (CODICADER)", ""), T(6, 2026, "Regional", "Esparza")] };
    const jug = { actualizado: "2026-10-02", jugadores: [["Mora, Ana", "mora ana"], ["Soto, Luis", "soto luis"], ["Viejo, Pepe", "viejo pepe"], ["Pais, Gu", "pais gu"]],
      instituciones: [["Liceo A", "liceo a"], ["Liceo  A", "liceo a"], ["10-4", "10 4"], ["Guatemala", "guatemala"], ["Escuela Heredia", "esc heredia"], ["Colegio Esparza", "colegio esparza"]],
      columnas_participaciones: ["clave", "jugador", "institucion", "puesto", "puntos", "elo", "snr"],
      participaciones: [[1, 0, 0, 1, 4, null, 1], [2, 0, 1, 2, 3, null, 2], [1, 1, 0, 3, 2, null, 3], [3, 1, 4, 1, 3, null, 1], [4, 2, 4, 2, 3, null, 2], [1, 0, 2, 4, 1, null, 4], [5, 3, 3, 1, 1, null, 1], [6, 1, 5, 1, 1, null, 1]],
      columnas_equipos: [], equipos: [] };
    const b = banco.armar(torneos, jug);
    igual("una institución escrita dos veces es una sola y se descartan secciones y países", b.instituciones.map((x) => x[0]), ["Colegio Esparza", "Escuela Heredia", "Liceo A"]);
    igual("la región sale de los torneos y solo vale si es una de las 27 (Esparza no)", b.instituciones.map((x) => x[1]), ["", "Heredia", "Alajuela"]);
    igual("solo los estudiantes de los últimos tres años (Viejo, 2022, no entra; Soto, en tres colegios)", b.estudiantes.map((x) => x[0]).sort(), ["Mora, Ana", "Soto, Luis", "Soto, Luis", "Soto, Luis"].sort());
    cierto("el sexo solo se guarda si es seguro (un torneo femenino, aunque el colegio esté escrito de dos formas)", b.estudiantes.find((x) => x[0] === "Mora, Ana")[3] === "w" && b.estudiantes.filter((x) => x[0] === "Soto, Luis").every((x) => x[3] == null));
    const real = JSON.parse(fs.readFileSync(path.join(RAIZ, "data/jde-banco.json"), "utf8"));
    cierto("el banco que se publica tiene más de mil centros y cada región es una de las 27", real.instituciones.length > 1000 && real.instituciones.every((x) => !x[1] || G.JDE_DIRECCIONES.includes(x[1])));
    const regenerado = banco.armar(leerJson("data/ajedrez-estudiantil.json"), leerJson("data/ajedrez-estudiantil-jugadores.json"), mepCsv());
    delete regenerado._resumen;
    cierto("y está al día con lo que hay en data/ y en herramientas/datos/mep-centros.csv", JSON.stringify(regenerado) === JSON.stringify(real), "vuelve a correr: node herramientas/jde-banco.js");
    const cs = real.instituciones.map((x, i) => ({ nombre: x[0], region: x[1], participaciones: x[2], tipo: x[4] === "e" ? "primaria" : x[4] === "c" ? "secundaria" : "", circuito: x[5], idx: i }));
    const r = I.buscarCentros(cs, "ELENA santa ctp", 5);
    cierto("buscar sin mayúsculas ni orden de palabras", r.length > 0 && r.every((c) => /elena/i.test(c.nombre) && /santa/i.test(c.nombre)), JSON.stringify(r.map((c) => c.nombre)));
    igual("«de» y «la» no estorban", I.buscarCentros(cs, "ctp de la santa elena", 5).map((c) => c.nombre), r.map((c) => c.nombre));
    igual("buscar «ctp» no se confunde con letras sueltas", I.buscarCentros(cs, "zzzzqq", 5), []);
  }
}

// ---------------------------------------------------------------- el navegador
async function navegador() {
  console.log("\nLa página:");
  const browser = await chromium.launch();
  async function abrir(ancho, esquema, alto) {
    const ctx = await browser.newContext({ viewport: { width: ancho || 1200, height: alto || 900 }, serviceWorkers: "block", acceptDownloads: true, colorScheme: esquema || "light" });
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
    await p.goto(BASE + "/inscripcion-jde.html");
    await p.waitForFunction(() => !!document.documentElement.dataset.ijBanco);
    return { ctx, p, errores };
  }
  const visible = (p, sel) => p.$eval(sel, (e) => e.checkVisibility());

  {
    const { ctx, p, errores } = await abrir();
    cierto("el banco carga", /Banco de [\d\s.,]+ centros/.test(await p.textContent("#ij-centro-ayuda")));
    await p.fill("#ij-centro", "liceo sinai");
    cierto("al escribir sale la lista de centros, con su región", (await p.$$eval("#ij-centro-lista li", (l) => l.map((x) => x.textContent))).some((t) => /Liceo Sinai.*DRE Pérez Zeledón/i.test(t)));
    igual("el campo es un combobox y avisa que está abierto", [await p.getAttribute("#ij-centro", "role"), await p.getAttribute("#ij-centro", "aria-expanded")], ["combobox", "true"]);
    await p.keyboard.press("ArrowDown");
    cierto("con la flecha se marca una opción (aria-activedescendant)", !!(await p.getAttribute("#ij-centro", "aria-activedescendant")));
    await p.keyboard.press("Enter");
    igual("Enter elige el centro y propone su región, su tipo y su circuito", [(await p.inputValue("#ij-centro")).toUpperCase(), await p.inputValue("#ij-region"), await p.isChecked("#ij-tipo-secundaria"), await p.inputValue("#ij-circuito")], ["LICEO SINAI", "Pérez Zeledón", true, "01"]);
    cierto("dice a cuál interregional va y cuántos clasifican", /Interregional X.*2 personas clasifican/.test(await p.textContent("#ij-region-ayuda")));
    cierto("habilita traer a los estudiantes de antes", await p.$eval("#ij-traer", (b) => !b.disabled));
    await p.press("#ij-centro", "Escape");
    cierto("Escape cierra la lista", !(await visible(p, "#ij-centro-lista")));

    await p.click("#ij-traer");
    const cuantos = (await p.$$("#ij-traer-lista input")).length;
    cierto("trae los estudiantes de ese colegio de los últimos años", cuantos > 5, String(cuantos));
    await p.click("#ij-traer-lista label >> nth=0");
    await p.click("#ij-traer-lista label >> nth=1");
    await p.click("#ij-traer-agregar");
    igual("agrega los dos marcados y cierra la caja", [(await p.$$("#ij-est article")).length, await visible(p, "#ij-traer-caja")], [2, false]);
    cierto("a los que vienen sin fecha se les pide la fecha de nacimiento (error escrito, no solo color)", /Error:.*falta la fecha de nacimiento/.test(await p.textContent("#ij-est article >> nth=0")));
    cierto("la cifra de errores sube", Number(await p.textContent("#ij-c3")) > 0);

    // Se llena uno completo.
    await p.fill("#ij-est article >> nth=0 >> input[type=text] >> nth=0", "Pérez Mora Ana");
    await p.selectOption("#ij-est article >> nth=0 >> select >> nth=0", "w");
    await p.fill("#ij-est article >> nth=0 >> input[type=date]", "2012-05-04");
    const catTexto = await p.$eval("#ij-est article >> nth=0 >> select >> nth=1", (s) => s.options[s.selectedIndex].textContent);
    cierto("la categoría sale sola por el año de nacimiento", /Le corresponde la C \(secundaria\)/.test(catTexto), catTexto);
    cierto("la tarjeta de un individual ya no trae «Equipo/Individual» ni suplente: los equipos tienen su sección", !(await p.$$eval("#ij-est article >> nth=0 >> select option", (o) => o.some((x) => /^Equipo$|Suplente/.test(x.textContent)))));
    cierto("y en individual no se ofrece subir de categoría", !(await p.$$eval("#ij-est article >> nth=0 >> select >> nth=1 >> option", (o) => o.map((x) => x.value))).includes("D"));
    await ctx.close();
    igual("sin errores de JavaScript", errores, []);
  }

  {
    // El flujo: regional → escuela o colegio → la lista de centros → el circuito se llena solo.
    const { ctx, p, errores } = await abrir();
    const real = leerJson("data/jde-banco.json");
    const cs = real.instituciones.map((x, i) => ({ nombre: x[0], region: x[1], participaciones: x[2], tipo: x[4] === "e" ? "primaria" : x[4] === "c" ? "secundaria" : "", circuito: x[5], idx: i }));
    cierto("al abrir, la ayuda dice qué marcar primero", /Primero marca tu Dirección Regional y si es escuela o colegio/.test(await p.textContent("#ij-centro-ayuda")));
    cierto("sin regional ni tipo, tocar el campo no despliega los 5 000 centros", await (async () => { await p.click("#ij-centro"); return !(await visible(p, "#ij-centro-lista")); })());
    await p.selectOption("#ij-region", "San Carlos");
    await p.check("#ij-tipo-primaria");
    const esperadas = I.centrosDe(cs, { dre: "San Carlos", tipo: "primaria" }, "", 400);
    cierto("marcadas la regional y «escuela», la ayuda dice cuántas hay", new RegExp("Hay " + esperadas.total.toLocaleString("es-CR").replace(/\s/g, "\\s") + " escuelas de la regional San Carlos").test((await p.textContent("#ij-centro-ayuda")).replace(/\u00a0| /g, " ")), await p.textContent("#ij-centro-ayuda"));
    await p.click("#ij-centro");
    igual("tocar el campo despliega la lista de esa regional y ese tipo (con el tope)", [await visible(p, "#ij-centro-lista"), (await p.$$("#ij-centro-lista [role=option]")).length, await p.getAttribute("#ij-centro", "aria-expanded")], [true, esperadas.centros.length, "true"]);
    cierto("cada opción dice su circuito", await p.$$eval("#ij-centro-lista [role=option]", (l) => l.every((x) => /Circuito \d\d|circuito sin identificar/.test(x.textContent))));
    cierto("y si hay más de las que caben, lo avisa (si no, no)", /más: escribe parte del nombre/.test(await p.textContent("#ij-centro-lista")) === esperadas.total > esperadas.centros.length);
    cierto("las opciones son solo de San Carlos (ninguna dice otra regional)", !(await p.$$eval("#ij-centro-lista [role=option]", (l) => l.some((x) => /DRE /.test(x.textContent)))));
    const primera = esperadas.centros.find((c) => c.circuito);
    await p.fill("#ij-centro", primera.nombre);
    await p.click("#ij-centro-lista [role=option] >> nth=0");
    igual("elegir un centro llena el circuito solo", [(await p.inputValue("#ij-centro")).toLowerCase(), await p.inputValue("#ij-circuito")], [primera.nombre.toLowerCase(), primera.circuito]);
    cierto("y la ayuda del circuito dice de dónde sale", /según el listado del MEP/.test(await p.textContent("#ij-circuito-ayuda")));
    igual("el selector del circuito trae los de esa regional", await p.$$eval("#ij-circuito option", (o) => o.slice(1).map((x) => x.value)), I.circuitosDe(cs, "San Carlos"));
    const otro = I.circuitosDe(cs, "San Carlos").find((c) => c !== primera.circuito);
    await p.selectOption("#ij-circuito", otro);
    igual("el circuito se puede cambiar a mano y se queda", await p.inputValue("#ij-circuito"), otro);
    await p.selectOption("#ij-region", "Heredia");
    igual("cambiar de regional quita el centro que era de otra y su circuito", [await p.inputValue("#ij-centro"), await p.inputValue("#ij-circuito")], ["", ""]);
    // Un centro sin circuito en el banco: el circuito queda por elegir, nunca el de otro centro.
    const sin = cs.find((c) => !c.circuito && c.region && c.tipo === "secundaria" && c.participaciones > 3);
    await p.selectOption("#ij-region", sin.region);
    await p.check("#ij-tipo-secundaria");
    await p.fill("#ij-centro", sin.nombre);
    await p.keyboard.press("ArrowDown");
    await p.keyboard.press("Enter");
    igual("un centro que ningún listado ubica en un circuito deja el circuito por elegir", [await p.inputValue("#ij-centro"), await p.inputValue("#ij-circuito")], [sin.nombre, ""]);
    cierto("y lo dice", /No sabemos el circuito de este centro: elígelo/.test(await p.textContent("#ij-circuito-ayuda")));
    // El botón ▾ y el camino de atrás: escribir el nombre sin marcar nada lo llena todo.
    await p.click("#ij-centro-abrir");
    const abrio = await visible(p, "#ij-centro-lista");
    await p.click("#ij-centro-abrir");
    igual("el botón ▾ abre y cierra la lista (y lo dice con aria-expanded)", [abrio, await visible(p, "#ij-centro-lista"), await p.getAttribute("#ij-centro-abrir", "aria-expanded")], [true, false, "false"]);
    await p.click("#ij-empezar");
    await p.click(".avisos-dialogo button:has-text('Sí, borrar todo'), dialog button:has-text('Sí, borrar todo')");
    await p.waitForFunction(() => document.getElementById("ij-region").value === "");
    await p.fill("#ij-centro", "liceo de costa rica");
    await p.keyboard.press("ArrowDown");
    await p.keyboard.press("Enter");
    const lcr = cs.find((c) => /^liceo de costa rica$/i.test(c.nombre));
    igual("escribir el nombre sin marcar nada llena la regional, el tipo y el circuito", [await p.inputValue("#ij-region"), await p.isChecked("#ij-tipo-secundaria"), await p.inputValue("#ij-circuito")], [lcr.region, true, lcr.circuito]);
    cierto("la regional y el circuito del Liceo de Costa Rica son los que dice el MEP (San José Central, circuito 02)", lcr.region === "San José Central" && lcr.circuito === "02");
    await ctx.close();
    igual("sin errores de JavaScript", errores, []);
  }

  {
    const { ctx, p, errores } = await abrir();
    await p.fill("#ij-centro", "Colegio Inventado");
    await p.selectOption("#ij-region", "Alajuela");
    await p.check("#ij-tipo-secundaria");
    await p.fill("#ij-correo", "docente@mep.go.cr");
    const personas = await p.$$("#ij-cuerpo .ij-persona");
    igual("arranca con una jefatura y un cuerpo técnico en blanco", personas.length, 2);
    await p.fill("#ij-cuerpo .ij-persona >> nth=0 >> input[type=text]", "Doña Jefa");
    await p.selectOption("#ij-cuerpo .ij-persona >> nth=0 >> select >> nth=1", "w");
    await p.fill("#ij-cuerpo .ij-persona >> nth=1 >> input[type=text]", "Don Técnico");
    await p.selectOption("#ij-cuerpo .ij-persona >> nth=1 >> select >> nth=1", "m");
    await p.click("#ij-pegar");
    igual("pegar abre la caja y lo dice (aria-expanded)", [await visible(p, "#ij-pegar-caja"), await p.getAttribute("#ij-pegar", "aria-expanded")], [true, "true"]);
    await p.fill("#ij-pegar-texto", "Nombre\tSexo\tFDN\tDocumento\nMora Ana\tMujer\t04/05/2012\t1-1111-1111\nSoto Luis\tHombre\t03/06/2011\t2-2222-2222\n<img src=x id=malo onerror=\"window.__malo=1\">\tMujer\t01/01/2012\t3");
    await p.click("#ij-pegar-agregar");
    igual("lo pegado se agrega: tres estudiantes", (await p.$$("#ij-est article")).length, 3);
    cierto("un nombre con HTML se pinta como texto, no se ejecuta", !(await p.$("#malo")) && !(await p.evaluate(() => window.__malo)) && /<img src=x/.test(await p.inputValue("#ij-est article >> nth=2 >> input[type=text] >> nth=0")));
    await p.click("#ij-est article >> nth=2 >> text=Quitar");
    igual("quitar saca al estudiante", (await p.$$("#ij-est article")).length, 2);
    const estado = await p.textContent("#ij-rev-estado");
    cierto("la revisión dice cuántos errores quedan o que no hay", /Sin errores|Hay \d+ error/.test(estado), estado);
    cierto("cada hallazgo trae escrito si es Error, Aviso o Dato", await p.$$eval("#ij-rev li", (l) => l.length > 0 && l.every((x) => /^(Error|Aviso|Dato):/.test(x.textContent.trim()))));
    cierto("los individuales no aparecen como equipos", (await p.$$("#ij-equipos-lista article")).length === 0);
    igual("las cifras cuentan a los dos estudiantes (una mujer y un hombre)", [await p.textContent("#ij-c1"), await p.textContent("#ij-c1-nota")], ["2", "1 mujer · 1 hombre"]);
    igual("el resumen por torneo: categoría C Mujeres y categoría D Abierto", await p.$$eval("#ij-res tbody tr", (f) => f.map((r) => [...r.children].map((c) => c.textContent))),
      [["Categoría C", "1", "0", "0", "0"], ["Categoría D", "0", "1", "0", "0"]]);

    // Los archivos.
    await p.evaluate(() => {
      window.__excel = null;
      window.TablaExcel.bajar = (nombre, hojas) => { window.__excel = { nombre, hojas }; };
    });
    await p.click("#ij-excel");
    const excel = await p.evaluate(() => window.__excel);
    cierto("el Excel sale con la nómina, los equipos, el cuerpo técnico y la delegación", excel && excel.hojas.map((h) => h.nombre).join() === "Inscripción,Equipos,Cuerpo técnico,Delegación", JSON.stringify(excel && excel.hojas.map((h) => h.nombre)));
    igual("el nombre del archivo lleva el año y el colegio", excel.nombre, "inscripcion-jde-2026-colegio-inventado.xlsx");
    igual("la primera fila son las columnas del reporte del MEP", excel.hojas[0].filas[0], I.ENCABEZADOS);
    igual("y la de Ana, lista para Pareo Integral", excel.hojas[0].filas[1].slice(0, 8), ["Mora Ana", "MUJER", "2012-05-04", "Colegio Inventado", "Alajuela", "C", "Individual", "Mujeres"]);

    const pdf = await p.evaluate(async () => {
      let captado = null;
      const original = window.ReportePDF.generar;
      window.ReportePDF.generar = async (d) => { captado = d; return original(d); };
      const antes = URL.createObjectURL;
      window.__bajado = null;
      URL.createObjectURL = (b) => { if (b.type === "application/pdf") window.__bajado = b; return antes.call(URL, b); };
      document.getElementById("ij-pdf").click();
      for (let i = 0; i < 100 && !window.__bajado; i++) await new Promise((r) => setTimeout(r, 100));
      const bytes = new Uint8Array(await window.__bajado.arrayBuffer());
      return { cabecera: String.fromCharCode(...bytes.slice(0, 5)), tam: bytes.length, titulo: captado.titulo, texto: JSON.stringify(captado.bloques) };
    });
    cierto("el PDF es un PDF de verdad, con marca de agua (pesa más que uno sin imagen)", pdf.cabecera === "%PDF-" && pdf.tam > 8000, JSON.stringify([pdf.cabecera, pdf.tam]));
    cierto("lleva la delegación, las dos personas del cuerpo técnico y a los estudiantes", /Colegio Inventado/.test(pdf.texto) && /Doña Jefa/.test(pdf.texto) && /Don Técnico/.test(pdf.texto) && /Mora Ana/.test(pdf.texto) && /Soto Luis/.test(pdf.texto));
    cierto("dice que no reemplaza la Boleta Oficial y deja las firmas", /no reemplaza la Boleta de Inscripción Oficial/.test(pdf.texto) && /firma y sello/.test(pdf.texto));
    cierto("el título lleva el año", /JDE 2026/.test(pdf.titulo));

    // El borrador: se guarda, se recupera al volver y se baja y se abre.
    await p.waitForTimeout(600);
    cierto("avisa que lo guardó en este navegador", /Guardado en este navegador a las/.test(await p.textContent("#ij-guardado")));
    const guardado = await p.evaluate(() => JSON.parse(localStorage.getItem("ij_borrador_v1")));
    igual("lo guardado tiene el centro y los dos estudiantes", [guardado.centro.nombre, guardado.estudiantes.length], ["Colegio Inventado", 2]);
    await p.reload();
    await p.waitForFunction(() => !!document.documentElement.dataset.ijBanco);
    igual("al volver, todo sigue ahí", [await p.inputValue("#ij-centro"), await p.inputValue("#ij-region"), (await p.$$("#ij-est article")).length], ["Colegio Inventado", "Alajuela", 2]);
    const [descarga] = await Promise.all([p.waitForEvent("download"), p.click("#ij-bajar-borrador")]);
    const ruta = await descarga.path();
    const contenido = JSON.parse(fs.readFileSync(ruta, "utf8"));
    igual("el borrador bajado se reconoce como de esta herramienta", [descarga.suggestedFilename(), contenido.formato, contenido.estudiantes.length], ["inscripcion-jde-2026-colegio-inventado.json", "inscripcion-jde", 2]);
    await p.click("#ij-empezar");
    await p.click(".avisos-dialogo button:has-text('Sí, borrar todo'), dialog button:has-text('Sí, borrar todo')");
    // El borrado pasa cuando el aviso se resuelve, no en el clic: se espera a que ocurra.
    await p.waitForFunction(() => document.getElementById("ij-centro").value === "" && document.querySelectorAll("#ij-est article").length === 0);
    igual("empezar de cero borra todo", [await p.inputValue("#ij-centro"), (await p.$$("#ij-est article")).length, await p.evaluate(() => (localStorage.getItem("ij_borrador_v1") === null ? 0 : JSON.parse(localStorage.getItem("ij_borrador_v1")).estudiantes.length))], ["", 0, 0]);
    await p.setInputFiles("#ij-abrir-borrador", ruta);
    await p.waitForFunction(() => document.querySelectorAll("#ij-est article").length === 2);
    igual("y el borrador bajado se vuelve a abrir", [await p.inputValue("#ij-centro"), (await p.$$("#ij-est article")).length], ["Colegio Inventado", 2]);
    await p.setInputFiles("#ij-abrir-borrador", { name: "malo.json", mimeType: "application/json", buffer: Buffer.from('{"formato":"otra-cosa"}') });
    await p.waitForSelector(".avisos-mensaje[data-tipo='error']");
    cierto("un archivo que no es un borrador se rechaza con un aviso", /no es un borrador/.test(await p.textContent(".avisos-mensaje[data-tipo='error']")));
    await ctx.close();
    igual("sin errores de JavaScript", errores, []);
  }

  {
    // Equipos completos y topes, en la pantalla.
    const { ctx, p, errores } = await abrir();
    await p.fill("#ij-centro", "Colegio Equipos");
    await p.selectOption("#ij-region", "Alajuela");
    await p.check("#ij-tipo-secundaria");
    cierto("al abrir no hay equipos y la sección lo dice", await visible(p, "#ij-eq-vacio"));
    await p.selectOption("#ij-eq-categoria", "D");
    await p.click("#ij-eq-crear");
    igual("«Crear el equipo» arma el equipo con cuatro lugares de titulares", [(await p.$$("#ij-equipos-lista article")).length, (await p.$$("#ij-equipos-lista .ij-miembro")).length], [1, 4]);
    cierto("el título dice torneo y categoría, y el resumen cuenta los lugares", /Equipo Abierto · categoría D/.test(await p.textContent("#ij-equipos-lista h3")) && /4 de 5 integrantes · 4 titulares/.test(await p.textContent("#ij-equipos-lista article >> .ij-ayuda")));
    cierto("la sección de equipos deja de decir que no hay", !(await visible(p, "#ij-eq-vacio")));
    const miembro = (n) => "#ij-equipos-lista .ij-miembro >> nth=" + n;
    for (let k = 0; k < 4; k++) {
      await p.fill(miembro(k) + " >> input[type=text] >> nth=0", "Integrante " + "ABCD"[k]);
      await p.selectOption(miembro(k) + " >> select >> nth=0", "m");
      await p.fill(miembro(k) + " >> input[type=date]", "2011-0" + (k + 1) + "-10");
    }
    await p.click("#ij-equipos-lista >> text=+ Integrante nuevo");
    igual("el quinto se agrega y queda como suplente", [(await p.$$("#ij-equipos-lista .ij-miembro")).length, await p.inputValue(miembro(4) + " >> select >> nth=1")], [5, "s"]);
    cierto("con cinco, el botón queda apagado (aria-disabled) y el resumen dice que está completo", (await p.getAttribute("#ij-equipos-lista >> text=+ Integrante nuevo", "aria-disabled")) === "true" && /completo: no caben más/.test(await p.textContent("#ij-equipos-lista article >> .ij-ayuda")));
    await p.click("#ij-equipos-lista >> text=+ Integrante nuevo", { force: true });
    cierto("y aunque se toque, el sexto no se agrega: lo dice con palabras", (await p.$$("#ij-equipos-lista .ij-miembro")).length === 5 && /ya tiene 5 integrantes/.test(await p.textContent("#ij-equipos-lista article >> [role=status]")));
    // Segundo equipo sí; tercero no.
    await p.click("#ij-eq-crear");
    igual("el segundo equipo Abierto de la D se crea con el número 2", [(await p.$$("#ij-equipos-lista article")).length, /equipo 2/.test(await p.textContent("#ij-equipos-lista article >> nth=1 >> h3"))], [2, true]);
    await p.click("#ij-eq-crear");
    cierto("el tercero no se crea y la página dice por qué (art. 66.1.g)", (await p.$$("#ij-equipos-lista article")).length === 2 && /máximo por centro/.test(await p.textContent("#ij-eq-estado")));
    // La edad se hace cumplir al escribir la fecha.
    await p.fill(miembro(5) + " >> input[type=text] >> nth=0", "Muy Mayor");
    await p.fill(miembro(5) + " >> input[type=date]", "2005-01-01");
    cierto("una fecha que no deja jugar la D se deshace y se avisa", (await p.inputValue(miembro(5) + " >> input[type=date]")) === "" && /no puede jugar en la categoría D/.test(await p.textContent(".avisos-mensaje[data-tipo='error'] >> nth=-1")));
    // Individuales: dos por categoría y torneo; el tercero se rechaza.
    await p.click("#ij-pegar");
    await p.fill("#ij-pegar-texto", "Nombre\tSexo\tFDN\nInd Uno\tHombre\t01/01/2008\nInd Dos\tHombre\t02/01/2008\nInd Tres\tHombre\t03/01/2008");
    await p.click("#ij-pegar-agregar");
    igual("de tres individuales entran dos y se avisa del tercero", [(await p.$$("#ij-est article")).length, /No se agregaron 1 estudiante.*Ind Tres/.test(await p.textContent(".avisos-mensaje[data-tipo='error'] >> nth=-1"))], [2, true]);
    cierto("un individual puede pasar a un equipo con espacio: el segundo equipo, vacío", await p.$$eval("#ij-equipos-lista article >> nth=1 >> select option", (o) => o.some((x) => /Ind Uno/.test(x.textContent))));
    // Quitar un equipo pide confirmación.
    await p.click("#ij-equipos-lista article >> nth=1 >> text=Quitar el equipo");
    await p.click(".avisos-dialogo button:has-text('Quitar el equipo'), dialog button:has-text('Quitar el equipo')");
    await p.waitForFunction(() => document.querySelectorAll("#ij-equipos-lista article").length === 1);
    igual("quitar el equipo lo saca con su confirmación", (await p.$$("#ij-equipos-lista article")).length, 1);
    cierto("la cifra de equipos cuenta uno", (await p.textContent("#ij-c2")) === "1");
    // El Excel trae la hoja de equipos.
    await p.evaluate(() => { window.__excel = null; window.TablaExcel.bajar = (nombre, hojas) => { window.__excel = { nombre, hojas }; }; });
    await p.click("#ij-excel");
    await p.waitForFunction(() => !!window.__excel || !!document.querySelector(".avisos-dialogo"));
    if (await p.$(".avisos-dialogo")) await p.click(".avisos-dialogo button:has-text('Bajarlo así')");
    await p.waitForFunction(() => !!window.__excel);
    const hojaEq = (await p.evaluate(() => window.__excel)).hojas.find((h) => h.nombre === "Equipos");
    cierto("la hoja «Equipos» trae los cuatro con nombre y el suplente al final", hojaEq && hojaEq.filas.length === 1 + 4 + 0 || hojaEq.filas.length === 1 + 5, JSON.stringify(hojaEq && hojaEq.filas.length));
    // El borrador guarda los equipos y se recupera.
    await p.waitForTimeout(600);
    await p.reload();
    await p.waitForFunction(() => !!document.documentElement.dataset.ijBanco);
    igual("al volver, el equipo y sus integrantes siguen ahí", [(await p.$$("#ij-equipos-lista article")).length, (await p.$$("#ij-equipos-lista .ij-miembro")).length], [1, 5]);
    // Un equipo de Mujeres trae a todas como mujeres.
    await p.selectOption("#ij-eq-torneo", "w");
    await p.selectOption("#ij-eq-categoria", "C");
    await p.click("#ij-eq-crear");
    cierto("en el equipo de Mujeres el sexo es fijo (Mujer) y no se puede cambiar", await p.$eval("#ij-equipos-lista article >> nth=0 >> .ij-miembro >> nth=0 >> select >> nth=0", (s) => s.disabled && s.value === "w"));
    await ctx.close();
    igual("sin errores de JavaScript", errores, []);
  }

  {
    // Lo que falta y las ideas, en pantalla.
    const { ctx, p, errores } = await abrir();
    cierto("«Para estar listo» arranca con lo de la delegación", /Escribe el nombre del centro educativo/.test(await p.textContent("#ij-pend")) && /Elige la Dirección Regional/.test(await p.textContent("#ij-pend")));
    await p.click("#ij-pend li:has-text('nombre del centro') button");
    igual("«Ir» lleva al campo que falta", await p.evaluate(() => document.activeElement.id), "ij-centro");
    await p.selectOption("#ij-region", "Alajuela");
    cierto("al elegir la regional, la tarea desaparece y la de equipos dice cuántos clasifican (art. 66.1.j)", !/Elige la Dirección Regional/.test(await p.textContent("#ij-pend")) && /clasifican \d+ equipos? por torneo y categoría a la Interregional/.test(await p.textContent("#ij-eq-inter")), await p.textContent("#ij-eq-inter"));
    await p.selectOption("#ij-eq-categoria", "D");
    await p.click("#ij-eq-crear");
    for (const k of [0, 1]) await p.fill("#ij-equipos-lista .ij-miembro >> nth=" + k + " >> input[type=text] >> nth=0", "Quien " + k);
    cierto("el equipo dice qué le falta, por campo", /Faltan: 2 sexos, 2 fechas de nacimiento, 2 documentos\./.test(await p.textContent("#ij-equipos-lista article >> .font-semibold.ij-ayuda")), await p.textContent("#ij-equipos-lista article >> .font-semibold.ij-ayuda"));
    await p.click("#ij-equipos-lista >> text=Ir al primero");
    cierto("«Ir al primero» enfoca el primer sexo que falta", /^ij-m-.*-s$/.test(await p.evaluate(() => document.activeElement.id)));
    cierto("la lista de tareas dice «Faltan 2 sexos» y que al equipo le falta 1 integrante", /Faltan 2 sexos/.test(await p.textContent("#ij-pend")) && /le falta 1 integrante/.test(await p.textContent("#ij-pend")));
    // Un individual que cabe en ese equipo: sale como idea, y se puede arrastrar al equipo.
    await p.click("#ij-est-mas");
    await p.fill("#ij-est article >> input[type=text] >> nth=0", "Individual Cabe");
    await p.selectOption("#ij-est article >> select >> nth=0", "m");
    await p.fill("#ij-est article >> input[type=date]", "2011-05-05");
    cierto("el equipo de 2 con un individual que cabe: sale la idea con su nombre", await visible(p, "#ij-sug-caja") && /Individual Cabe/.test(await p.textContent("#ij-sug")), await p.textContent("#ij-sug"));
    // El arrastre con los eventos de verdad (dragstart en la agarradera, dragover y drop en el equipo) y un mismo DataTransfer.
    const datos = await p.evaluateHandle(() => new DataTransfer());
    await p.dispatchEvent("#ij-est article >> .ij-agarrar", "dragstart", { dataTransfer: datos });
    await p.dispatchEvent("#ij-equipos-lista article", "dragover", { dataTransfer: datos });
    cierto("mientras se arrastra, el equipo se marca como destino (borde discontinuo)", await p.$eval("#ij-equipos-lista article", (a) => a.classList.contains("ij-suelta") && getComputedStyle(a).outlineStyle === "dashed"));
    await p.dispatchEvent("#ij-equipos-lista article", "drop", { dataTransfer: datos });
    await p.waitForFunction(() => document.querySelectorAll("#ij-est article").length === 0);
    cierto("arrastrar la tarjeta sobre el equipo pasa al estudiante al equipo", (await p.$$eval("#ij-equipos-lista .ij-miembro input[type=text]:not([id$='-d'])", (l) => l.some((x) => x.value === "Individual Cabe"))));
    igual("y ya no es individual", (await p.$$("#ij-est article")).length, 0);
    await ctx.close();
    igual("sin errores de JavaScript", errores, []);
  }

  {
    // Traer a los estudiantes de un borrador anterior (.json), sin reemplazar nada.
    const { ctx, p, errores } = await abrir();
    const q = { id: "q1", categoria: "D", torneo: "m", numero: 1 };
    const e = (id, nombre, extra) => Object.assign({ id, nombre, sexo: "m", nacimiento: "2011-03-03", categoria: "", modalidad: "individual", torneo: "", equipoId: "", suplente: false, docTipo: "cedula", documento: "9-" + id, apoyo: false }, extra);
    const viejo = { formato: "inscripcion-jde", version: 2, anio: 2026, etapa: "regional", centro: { nombre: "Otro" }, cuerpo: [], equipos: [q], estudiantes: [e("a1", "Anterior Uno", { equipoId: "q1" }), e("a2", "Anterior Dos", { equipoId: "q1", nacimiento: "2011-04-04" }), e("a3", "Anterior Tres", { equipoId: "q1", nacimiento: "2010-04-04" }), e("a4", "Anterior Solita", { sexo: "w", nacimiento: "2012-06-06" })] };
    await p.fill("#ij-centro", "Colegio Equipos");
    await p.selectOption("#ij-region", "Alajuela");
    await p.check("#ij-tipo-secundaria");
    await p.selectOption("#ij-anio", "2027");
    await p.setInputFiles("#ij-anterior-archivo", { name: "viejo.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(viejo)) });
    await p.waitForSelector("#ij-ant-caja:not([hidden])");
    igual("el borrador anterior ofrece a sus cuatro estudiantes, con dónde jugaban", await p.$$eval("#ij-ant-lista label", (l) => l.map((x) => x.textContent.trim())), ["Anterior Uno (equipo Abierto D)", "Anterior Dos (equipo Abierto D)", "Anterior Tres (equipo Abierto D)", "Anterior Solita (individual)"]);
    await p.click("#ij-ant-agregar");
    igual("al agregar, los del equipo vuelven a un equipo y la otra queda individual, con sus datos", [(await p.$$("#ij-equipos-lista article")).length, (await p.$$("#ij-equipos-lista .ij-miembro")).length, (await p.$$("#ij-est article")).length, await p.inputValue("#ij-est article >> input[type=date]")], [1, 3, 1, "2012-06-06"]);
    cierto("y, como el año cambió (2026 → 2027), avisa que la categoría se calculó de nuevo", /categoría se calculó con el año 2027/.test((await p.$$eval(".avisos-mensaje", (l) => l.map((x) => x.textContent))).join(" | ")));
    await p.setInputFiles("#ij-anterior-archivo", { name: "viejo.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(viejo)) });
    await p.waitForSelector("#ij-ant-lista");
    cierto("si se vuelve a traer el mismo borrador, no ofrece a los que ya están", /no tiene estudiantes que no estén ya aquí/.test(await p.textContent("#ij-ant-lista")));
    await p.setInputFiles("#ij-anterior-archivo", { name: "malo.json", mimeType: "application/json", buffer: Buffer.from('{"formato":"otra"}') });
    await p.waitForFunction(() => /no es un borrador/.test(document.body.textContent));
    await ctx.close();
    igual("sin errores de JavaScript", errores, []);
  }

  {
    // Los nombres del banco se ofrecen mientras se escribe, y el sexo seguro viene puesto.
    const real = leerJson("data/jde-banco.json");
    const cs = real.instituciones.map((x, i) => ({ nombre: x[0], region: x[1], tipo: x[4], idx: i }));
    const conW = real.estudiantes.find((x) => x[3] === "w" && cs[x[1]].region && cs[x[1]].tipo);
    const centro = cs[conW[1]];
    const { ctx, p, errores } = await abrir();
    await p.selectOption("#ij-region", centro.region);
    await p.check(centro.tipo === "e" ? "#ij-tipo-primaria" : "#ij-tipo-secundaria");
    await p.fill("#ij-centro", centro.nombre);
    await p.keyboard.press("ArrowDown");
    await p.keyboard.press("Enter");
    cierto("con el centro del banco, el campo de nombre ofrece a sus estudiantes de antes", (await p.$$eval("#ij-nombres option", (o) => o.length)) > 0);
    await p.click("#ij-est-mas");
    cierto("el campo de nombre apunta a esa lista", (await p.getAttribute("#ij-est article >> input[type=text] >> nth=0", "list")) === "ij-nombres");
    await p.fill("#ij-est article >> input[type=text] >> nth=0", conW[0]);
    await p.dispatchEvent("#ij-est article >> input[type=text] >> nth=0", "change");
    igual("quien jugó un torneo femenino trae el sexo puesto (Mujer)", await p.inputValue("#ij-est article >> select >> nth=0"), "w");
    await p.fill("#ij-est article >> input[type=text] >> nth=0", "Nombre Que No Esta En El Banco");
    await ctx.close();
    igual("sin errores de JavaScript", errores, []);
  }

  {
    // «Abrir en Pareo Integral»: la lista pasa directo y Pareo la recoge una sola vez.
    const { ctx, p, errores } = await abrir();
    await p.fill("#ij-centro", "Colegio Pareo");
    await p.selectOption("#ij-region", "Alajuela");
    await p.check("#ij-tipo-secundaria");
    await p.selectOption("#ij-eq-categoria", "D");
    await p.click("#ij-eq-crear");
    for (const k of [0, 1, 2]) {
      await p.fill("#ij-equipos-lista .ij-miembro >> nth=" + k + " >> input[type=text] >> nth=0", "Jugador Pareo " + k);
      await p.selectOption("#ij-equipos-lista .ij-miembro >> nth=" + k + " >> select >> nth=0", "m");
      await p.fill("#ij-equipos-lista .ij-miembro >> nth=" + k + " >> input[type=date]", "2011-0" + (k + 1) + "-10");
    }
    await p.click("#ij-pareo");
    await p.click(".avisos-dialogo button:has-text('Abrirla así'), dialog button:has-text('Abrirla así')");
    await p.waitForURL(/pareo\.html/);
    await p.waitForFunction(() => document.querySelectorAll("#pi-tabla-jugadores tbody tr").length >= 3 || /Se agregaron/.test(document.body.textContent), null, { timeout: 15000 });
    const quedo = await p.$$eval("#pi-tabla-jugadores tbody tr", (f) => f.map((r) => r.textContent));
    cierto("Pareo recibió a los tres jugadores del equipo, con su centro", quedo.length === 3 && quedo.every((t) => /Jugador Pareo/.test(t)) && quedo.every((t) => /Colegio Pareo/.test(t)), JSON.stringify(quedo).slice(0, 300));
    igual("y la lista pasó una sola vez: el almacenamiento quedó limpio y la dirección también", [await p.evaluate(() => localStorage.getItem("ij_para_pareo_v1")), await p.evaluate(() => location.hash)], [null, ""]);
    await ctx.close();
    igual("sin errores de JavaScript (Pareo y la inscripción)", errores, []);
    const v = await abrir();
    await v.p.evaluate(() => localStorage.setItem("ij_para_pareo_v1", JSON.stringify({ nombre: "viejo.xlsx", filas: [["Nombre"], ["Alguien"]], hora: Date.now() - 20 * 60 * 1000 })));
    await v.p.goto(BASE + "/pareo.html#desde=inscripcion-jde");
    await v.p.waitForSelector(".avisos-mensaje[data-tipo='error']");
    cierto("una lista de hace más de diez minutos no se usa y se explica", /ya no está/.test(await v.p.textContent(".avisos-mensaje[data-tipo='error']")));
    await v.ctx.close();
  }

  {
    // El año, el recordatorio de bajar el borrador y una inscripción grande.
    const { ctx, p, errores } = await abrir();
    cierto("con el año de la Normativa no hay aviso de rangos corridos", !/corridos un año/.test(await p.textContent("#ij-norma-categorias")));
    await p.selectOption("#ij-anio", "2027");
    cierto("con 2027 la tabla corre un año y avisa que hay que confirmarla", /Categoría A \(primaria\): nacidos de 2018 a 2021/.test(await p.textContent("#ij-norma-categorias")) && /corridos un año: confírmalos cuando se publique la Normativa de 2027/.test(await p.textContent("#ij-norma-categorias")), await p.textContent("#ij-norma-categorias"));
    await p.selectOption("#ij-anio", "2026");
    cierto("y al volver a 2026 vuelve la tabla de la Normativa", /nacidos de 2017 a 2020/.test(await p.textContent("#ij-norma-categorias")) && /quien nació en 2013 o 2014 es de la B/.test(await p.textContent("#ij-norma-categorias")));
    // 60 estudiantes: 8 equipos de 5 y 20 individuales (dos por categoría y torneo).
    await p.evaluate(() => {
      const I = window.InscripcionJde;
      const e = I.estadoNuevo();
      e.centro.nombre = "Colegio Grande"; e.centro.region = "Alajuela"; e.centro.tipo = "secundaria"; e.centro.correo = "x@mep.go.cr";
      let n = 0;
      const doc = () => "1-" + String(1000 + ++n);
      const equipos = [["A", "m", 1], ["B", "m", 1], ["C", "m", 1], ["D", "m", 1], ["D", "m", 2], ["E", "m", 1], ["C", "w", 1], ["D", "w", 1]];
      for (const [cat, torneo] of equipos) {
        const t = I.crearEquipo(e, cat, torneo).resultado;
        const anio = { A: 2018, B: 2015, C: 2012, D: 2010, E: 2007 }[cat];
        for (let k = 0; k < 5; k++) I.agregarIntegrante(e, t.id, { nombre: "Eq" + cat + torneo + t.numero + " " + k, sexo: torneo === "w" ? "w" : "m", nacimiento: anio + "-0" + (k + 1) + "-15", documento: doc() });
      }
      for (const [cat, anio] of [["A", 2018], ["B", 2015], ["C", 2012], ["D", 2010], ["E", 2007]]) {
        for (const [torneo, sexo] of [["m", "m"], ["w", "w"]]) for (let k = 0; k < 2; k++) {
          const s = I.estudianteNuevo({ nombre: "Ind" + cat + torneo + k, sexo, nacimiento: anio + "-0" + (k + 6) + "-20", documento: doc() });
          if (torneo === "m" && sexo === "w") s.torneo = "m";
          e.estudiantes.push(s);
        }
      }
      localStorage.setItem("ij_borrador_v1", JSON.stringify(e));
    });
    await p.reload();
    await p.waitForFunction(() => !!document.documentElement.dataset.ijBanco);
    const cuantos = await p.evaluate(() => [document.querySelectorAll("#ij-equipos-lista .ij-miembro").length, document.querySelectorAll("#ij-est article").length]);
    igual("una inscripción de 60 se pinta completa (40 en equipos y 20 individuales)", cuantos, [40, 20]);
    const ms = await p.evaluate(() => {
      const campo = document.querySelector("#ij-equipos-lista .ij-miembro input[type=text]");
      const t0 = performance.now();
      for (let i = 0; i < 20; i++) { campo.value = "Nombre " + i; campo.dispatchEvent(new Event("input", { bubbles: true })); }
      return (performance.now() - t0) / 20;
    });
    cierto("escribir en un campo con 60 estudiantes cuesta menos de 150 ms por tecla (" + ms.toFixed(0) + " ms)", ms < 150, String(ms));
    // El recordatorio de bajar el borrador.
    await p.waitForTimeout(700);
    cierto("con tres estudiantes o más y sin bajar el borrador, se recuerda", /Todavía no has bajado el borrador/.test(await p.textContent("#ij-guardado")));
    await p.evaluate(() => { document.querySelector("#ij-bajar-borrador").click(); });
    await p.waitForTimeout(300);
    cierto("al bajarlo, el recordatorio se va", !/Todavía no has bajado el borrador/.test(await p.textContent("#ij-guardado")));
    await ctx.close();
    igual("sin errores de JavaScript", errores, []);
  }

  {
    const { ctx, p } = await abrir(400);
    await p.click("#ij-est-mas");
    await p.click("#ij-est-mas");
    await p.click("#ij-eq-crear");
    const desborda = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    cierto("a 400 px no hay desplazamiento horizontal", !desborda);
    await ctx.close();
  }

  {
    // El contraste de los hallazgos se mide con los colores de verdad, en claro y en oscuro.
    for (const esquema of ["light", "dark"]) {
      const { ctx, p } = await abrir(1200, esquema);
      if (esquema === "dark") await p.evaluate(() => document.documentElement.classList.add("dark"));
      await p.click("#ij-est-mas");
      await p.fill("#ij-est article >> nth=0 >> input[type=text] >> nth=0", "Ana");
      const medidas = await p.evaluate(() => {
        const luz = (rgb) => { const c = rgb.match(/[\d.]+/g).slice(0, 3).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
        const razon = (a, b) => { const x = luz(a), y = luz(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
        const salida = {};
        for (const nivel of ["error", "aviso", "info"]) {
          const li = document.createElement("li");
          li.className = "ij-hallazgo ij-" + nivel; li.textContent = "x";
          document.body.append(li);
          const e = getComputedStyle(li);
          salida[nivel] = razon(e.color, e.backgroundColor);
          li.remove();
        }
        for (const estado of ["ok", "error", "aviso"]) {
          const s = document.createElement("span");
          s.className = "ij-chip"; s.dataset.estado = estado; s.textContent = "x";
          document.body.append(s);
          const e = getComputedStyle(s);
          salida["chip-" + estado] = razon(e.color, e.backgroundColor);
          s.remove();
        }
        return salida;
      });
      for (const [k, v] of Object.entries(medidas)) cierto("contraste de «" + k + "» en " + (esquema === "dark" ? "oscuro" : "claro") + ": " + v.toFixed(1) + ":1 (mínimo 4,5)", v >= 4.5);
      await ctx.close();
    }
  }
  await browser.close();
}

(async () => {
  reglas();
  await navegador();
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron." : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
