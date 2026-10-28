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
    const x = est("Dario Quesada", "m", "2011-02-02", { modalidad: "equipo", categoria: "E" });
    e.estudiantes.push(x, est("Fer Mata", "m", "2008-02-02", { modalidad: "equipo" }), est("Gil Mata", "m", "2007-02-02", { modalidad: "equipo" }));
    cierto("D a E en equipo, permitido: solo aviso", !hay(e, "error", /categoría E/) && hay(e, "aviso", /sube de la categoría D a la E/));
    igual("las categorías que ofrece: la suya y la de arriba", I.categoriasPosibles(x, e).lista.sort(), ["D", "E"]);
    x.modalidad = "individual";
    igual("en individual solo ofrece la suya", I.categoriasPosibles(Object.assign({}, x, { categoria: "" }), e).lista, ["D"]);
    cierto("en individual, subir es error", hay(e, "error", /en individual no se sube/));
    x.modalidad = "equipo"; x.categoria = "";
    const y = est("Ya Cabe", "m", "2011-02-02", { modalidad: "equipo", categoria: "E" });
    const z = est("Tambien", "m", "2010-02-02", { modalidad: "equipo", categoria: "E" });
    const w = est("Cuarto", "m", "2010-03-02", { modalidad: "equipo", categoria: "E" });
    e.estudiantes.push(y, z, w);
    cierto("el cuarto que sube en el mismo equipo pasa el tope de tres", hay(e, "error", /subidos a la categoría E/) === false);
    x.categoria = "E";
    cierto("con cuatro subidas hay error de tope", hay(e, "error", /subidos a la categoría E en el mismo equipo; el máximo son 3/));
    const s = base();
    s.estudiantes.push(est("Salta", "m", "2016-01-01", { modalidad: "equipo", categoria: "D" }));
    cierto("saltar de B a D no se permite", hay(s, "error", /solo se sube de A a B, de C a D y de D a E/));
    const m = base();
    m.estudiantes.push(est("Mayor", "m", "2005-01-01", { modalidad: "equipo", categoria: "D" }));
    cierto("nacer antes de lo que permite la categoría es error", hay(m, "error", /es para nacidos desde 2009/));
  }

  console.log("\nUnir centros (art. 19):");
  {
    const e = base();
    e.centro.union = { activa: true, centros: "Escuela A, Escuela B", matricula: "350" };
    e.estudiantes.push(est("Sube Uno", "m", "2011-02-02", { modalidad: "equipo", categoria: "E" }));
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
    cierto("un hombre en el torneo de Mujeres es error (se lee como Abierto en la revisión de grupos)", I.torneoEfectivo(Object.assign({}, h, { torneo: "" })) === "m");
    const j = est("Mujer Abierto", "w", "2012-05-04", { torneo: "m" });
    igual("una mujer puede jugar el Abierto", I.torneoEfectivo(j), "m");
    igual("y por omisión juega el de Mujeres", I.torneoEfectivo(est("Mujer Sola", "w", "2012-05-04")), "w");
    const d = base();
    const a = est("Repetida Uno", "w", "2012-05-04", { documento: "9-9999-9999" });
    const b = est("Repetida Uno", "w", "2012-05-04", { documento: "9-9999-9999" });
    d.estudiantes.push(a, b);
    cierto("dos filas de la misma persona y modalidad: error", hay(d, "error", /aparece 2 veces/));
    b.modalidad = "equipo";
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
    for (let i = 0; i < 6; i++) q.estudiantes.push(est("Equipo " + "ABCDEF"[i], "m", "2011-0" + (i + 1) + "-01", { modalidad: "equipo" }));
    cierto("seis en un equipo: error, el máximo son cinco", hay(q, "error", /tiene 6 integrantes y el máximo son 5/));
    const c = base();
    c.estudiantes.push(est("Cu Uno", "m", "2011-01-01", { modalidad: "equipo" }), est("Cu Dos", "m", "2011-02-01", { modalidad: "equipo" }));
    cierto("dos en un equipo: error en la Regional", hay(c, "error", /tiene 2 integrantes y el mínimo son 3/));
    c.etapa = "institucional";
    cierto("y solo aviso en la Institucional", !hay(c, "error", /el mínimo son 3/) && hay(c, "aviso", /el mínimo son 3/));
    const m = base();
    m.estudiantes.push(est("Muj Uno", "w", "2011-01-01", { modalidad: "equipo" }), est("Muj Dos", "w", "2011-02-01", { modalidad: "equipo" }),
      est("Ab Uno", "m", "2011-03-01", { modalidad: "equipo" }), est("Ab Dos", "m", "2011-04-01", { modalidad: "equipo" }), est("Ab Tres", "m", "2011-05-01", { modalidad: "equipo" }));
    cierto("dos mujeres de equipo con equipo abierto en la categoría: pasan al Abierto, solo aviso", !hay(m, "error", /equipo/) && hay(m, "aviso", /las pasa al equipo Abierto/));
    const s = base();
    s.estudiantes.push(est("Sin Ab Uno", "w", "2011-01-01", { modalidad: "equipo" }), est("Sin Ab Dos", "w", "2011-02-01", { modalidad: "equipo" }));
    cierto("dos mujeres sin equipo abierto adonde pasar: error", hay(s, "error", /no hay equipo Abierto de esa categoría/));
    const t = base();
    for (let i = 0; i < 5; i++) t.estudiantes.push(est("Cinco " + i, "m", "2011-0" + (i + 1) + "-01", { modalidad: "equipo", suplente: i === 4 }));
    cierto("cinco con una suplente: sin errores ni avisos de suplente", !hay(t, null, /suplente/));
    t.estudiantes[3].suplente = true;
    cierto("dos suplentes marcadas: error", hay(t, "error", /2 suplentes marcadas/));
    t.estudiantes[3].suplente = false; t.estudiantes[4].suplente = false;
    cierto("cinco y ninguna suplente: aviso", hay(t, "aviso", /marca cuál es la suplente/));
    const dos = base();
    for (let i = 0; i < 3; i++) dos.estudiantes.push(est("Eq1 " + i, "m", "2011-0" + (i + 1) + "-01", { modalidad: "equipo" }), est("Eq2 " + i, "m", "2011-0" + (i + 1) + "-15", { modalidad: "equipo", equipo: 2 }));
    igual("dos equipos del mismo centro, categoría y torneo se arman aparte", I.revisar(dos, "2026-10-28").equipos.map((q) => [q.categoria, q.torneo, q.numero, q.integrantes.length]), [["D", "m", 1, 3], ["D", "m", 2, 3]]);
    cierto("y ninguno falla por la cuenta", !hay(dos, "error", /integrantes/));
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
    e.estudiantes.push(est("Ana Mora", "w", "2012-05-04", { modalidad: "equipo" }), est("Luis Soto", "m", "2011-06-04", { modalidad: "equipo", equipo: 2, suplente: true }), est("Sin Nombre Vacio", "", ""));
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
  }

  console.log("\nPegar una lista:");
  {
    const a = I.leerLista("Nombre\tSexo\tFDN\tDocumento\nAna Pérez\tF\t12/05/2012\t1-111\nLuis Mora\tHombre\t3/4/2013\t2-222\n\n");
    igual("con títulos, tabulados (como llega de Excel)", a.map((x) => [x.nombre, x.sexo, x.nacimiento, x.documento]), [["Ana Pérez", "w", "2012-05-12", "1-111"], ["Luis Mora", "m", "2013-04-03", "2-222"]]);
    const b = I.leerLista("Rojas Soto Ana;Mujer;2010-01-05;3-333");
    igual("sin títulos, en el orden Nombre, Sexo, Fecha y Documento", b.map((x) => [x.nombre, x.sexo, x.nacimiento]), [["Rojas Soto Ana", "w", "2010-01-05"]]);
    const c = I.leerLista([["Nombre de Centro Educativo", "Nombre", "FDN", "Sexo", "Equipo/Ind", "Torneo"], ["Liceo X", "Mora Ana", "7/17/2011", "MUJER", "Equipo", "Abierto"]]);
    igual("las filas de un Excel del MEP, en cualquier orden de columnas", c.map((x) => [x.nombre, x.sexo, x.nacimiento, x.modalidad, x.torneo]), [["Mora Ana", "w", "2011-07-17", "equipo", ""]]);
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
  async function abrir(ancho, esquema) {
    const ctx = await browser.newContext({ viewport: { width: ancho || 1200, height: 900 }, serviceWorkers: "block", acceptDownloads: true, colorScheme: esquema || "light" });
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
    await p.selectOption("#ij-est article >> nth=0 >> select >> nth=2", "equipo");
    cierto("en equipos aparece el número de equipo y la suplente", await p.$eval("#ij-est article >> nth=0 >> .ij-fila-equipo", (e) => !e.hidden && getComputedStyle(e).display !== "none"));
    const opcionesCat = await p.$$eval("#ij-est article >> nth=0 >> select >> nth=1 >> option", (o) => o.map((x) => x.value));
    cierto("y se ofrece subir a la D (art. 18)", opcionesCat.includes("D"), JSON.stringify(opcionesCat));
    await p.selectOption("#ij-est article >> nth=0 >> select >> nth=2", "individual");
    cierto("en individual ya no se ofrece subir", !(await p.$$eval("#ij-est article >> nth=0 >> select >> nth=1 >> option", (o) => o.map((x) => x.value))).includes("D"));
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
    cierto("los equipos individuales no aparecen como equipos", (await p.$$("#ij-equipos .ij-equipo")).length === 0);
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
    cierto("el Excel sale con la nómina, el cuerpo técnico y la delegación", excel && excel.hojas.map((h) => h.nombre).join() === "Inscripción,Cuerpo técnico,Delegación", JSON.stringify(excel && excel.hojas.map((h) => h.nombre)));
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
    const { ctx, p } = await abrir(400);
    await p.click("#ij-est-mas");
    await p.click("#ij-est-mas");
    await p.selectOption("#ij-est article >> nth=0 >> select >> nth=2", "equipo");
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
