/* Comprueba js/seleccion-calculo.js, el cálculo de la selección por
   parámetros (seleccion-codicader.html), sin red ni navegador.

   Cada regla del procedimiento del ICODER (CODICADER 2026, ajedrez) y cada
   decisión de la página, con torneos de prueba y nombres inventados:
   - el prorrateo de empates, con el ejemplo del propio procedimiento;
   - el rendimiento Ps = (puntos ÷ partidas) × Elo de los rivales, con su
     ejemplo (6 de 7 contra 1800 = 1542,86), sin byes ni ausencias y con un
     mínimo de 3 partidas;
   - la A promediada entre clásico y blitz, y en equipos el 40 % de las rondas;
   - las mujeres de un absoluto solo en la rama femenina;
   - quien juega otra final (la B en la selección de la C) entra si cumple la
     edad;
   - sin año de nacimiento queda fuera y se avisa, y el ajuste a mano lo arregla;
   - el desempate por C y después por edad;
   - un código FIDE o nacional en «0» no junta a dos personas;
   - en vivo, quién entra y quién sale.

   Lo que se rompe callado acá es una selección equivocada que se ve perfecta.

   Ver «Herramientas de arbitraje» en docs/decisiones/juegos-y-torneos.md.

   Uso:  node herramientas/verificar-seleccion-calculo.js */
"use strict";
const path = require("path");
const C = require(path.join(__dirname, "..", "js", "seleccion-calculo.js"));

let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
    else console.log("  ✓ " + nombre);
}

// Un torneo individual de prueba: [nombre, fide, eloN, eloFide, nacimiento, [[rival, res]…]]
function individual(id, titulo, rama, ritmo, jugadores, extra) {
    return Object.assign({
        id, titulo, rama, ritmo, categoria: "D", equipos: false, rondasJugadas: 5,
        clasificacion: jugadores.map((j, i) => ({ puesto: i + 1, nombre: j[0] })),
        jugadores: jugadores.map((j) => ({ nombre: j[0], fideId: j[1], codigoNacional: "", eloNacional: j[2], eloFide: j[3],
            nacimiento: j[4], club: "Liceo de Prueba", equipo: "", partidas: (j[5] || []).map((p, r) => ({ ronda: r + 1, rival: p[0], res: p[1] })) })),
    }, extra || {});
}

console.log("\n=== El prorrateo (ejemplo del procedimiento) ===");
const pr = C.prorratear([2000, 2000, 2000, 1900, 1900, 1855].map((v, i) => ({ clave: "k" + i, valor: v })));
igual("tres con 2000 → 19; dos con 1900 → 16,5; el de 1855 → 15", [...pr.values()], [19, 19, 19, 16.5, 16.5, 15]);
igual("del lugar 21 en adelante, 0", [...C.prorratear(Array.from({ length: 22 }, (_, i) => ({ clave: i, valor: 100 - i }))).values()].slice(19), [1, 0, 0]);
igual("sin valor, 0", [...C.prorratear([{ clave: "a", valor: null }, { clave: "b", valor: 5 }]).values()], [0, 20]);

console.log("\n=== El rendimiento (B) ===");
const rivales = Array.from({ length: 7 }, (_, i) => ["Rival " + String.fromCharCode(65 + i) + ", Uno", "", 1800, 0, 2005, []]);
const seis = individual("1", "Prueba D Individual Absoluto", "A", "clasico", [
    ["Mora Uno, Ana", "100001", 1700, 1650, 2010, rivales.map((r, i) => [r[0], i === 6 ? "0" : "1"])],
].concat(rivales));
let r = C.calcular([seis], { anioDesde: 2009, anioHasta: 2011 });
const ana = r.ramas.M.find((f) => f.nombre.startsWith("Mora Uno"));
igual("6 de 7 contra 1800 da Ps 1542,86", ana.detalle.clasico.ps, 1542.86);
const conBye = individual("2", "Prueba D Individual Absoluto", "A", "clasico", [
    ["Solano Dos, Beto", "100002", 1600, 0, 2010, [["Rival A, Uno", "1"], ["bye", "- 1"], ["Rival B, Uno", "- 1K"], ["Rival C, Uno", "½"], ["Rival D, Uno", "0"]]],
].concat(rivales));
r = C.calcular([conBye], { anioDesde: 2009, anioHasta: 2011 });
const beto = r.ramas.M[0].detalle.clasico;
igual("el bye y la ganada por ausencia no cuentan: 1½ de 3", [beto.pr, beto.pj, beto.ps], [1.5, 3, 900]);
const dos = individual("3", "Prueba", "A", "clasico", [["Pocas, Cata", "100003", 1500, 0, 2010, [["Rival A, Uno", "1"], ["Rival B, Uno", "1"]]]].concat(rivales));
igual("con menos de 3 partidas no hay Ps", C.calcular([dos], {}).ramas.M.find((f) => f.nombre === "Pocas, Cata").detalle.clasico.ps, null);
const sinElo = individual("4", "Prueba", "A", "clasico", [
    ["Uno, Dino", "100004", 1500, 0, 2010, [["Nadie, Sin", "1"], ["Nadie, Sin", "1"], ["Nadie, Sin", "1"]]],
    ["Nadie, Sin", "", 0, 0, 2010, []]]);
igual("el rival sin Elo nacional cuenta 1400", C.calcular([sinElo], {}).ramas.M.find((f) => f.nombre === "Uno, Dino").detalle.clasico.ra, 1400);

console.log("\n=== La posición (A) ===");
const cl = individual("10", "Prueba D Individual Absoluto", "A", "clasico", [["X1, A", "201", 1, 0, 2010], ["X2, A", "202", 1, 0, 2010], ["X3, A", "203", 1, 0, 2010], ["Eva, Prueba", "204", 1, 0, 2010]]);
const bz = individual("11", "Prueba D Individual Absoluto Blitz", "A", "blitz", [["X1, A", "201", 1, 0, 2010], ["Eva, Prueba", "204", 1, 0, 2010]]);
r = C.calcular([cl, bz], {});
igual("4.º en clásico (14) y 2.º en blitz (18): A = 16", r.ramas.M.find((f) => f.nombre === "Eva, Prueba").A, 16);
igual("12.º recibe 1 y el 13.º nada", [C.ESCALA_A[11], C.ESCALA_A[12] || 0], [1, 0]);

const equipo = {
    id: "20", titulo: "Prueba D Equipos Absoluto", rama: "A", ritmo: "clasico", categoria: "D", equipos: true, rondasJugadas: 5,
    clasificacion: [{ puesto: 1, nombre: "Liceo Campeón" }],
    jugadores: [
        { nombre: "Tablero, Uno", fideId: "301", eloNacional: 1500, eloFide: 0, nacimiento: 2010, equipo: "Liceo Campeón", partidas: [{ ronda: 1, rival: "Otro, A", res: "1" }, { ronda: 2, rival: "Otro, B", res: "0" }] },
        { nombre: "Tablero, Dos", fideId: "302", eloNacional: 1500, eloFide: 0, nacimiento: 2010, equipo: "Liceo Campeón", partidas: [{ ronda: 1, rival: "Otro, A", res: "1" }, { ronda: 2, rival: "Otro, B", res: "- 1K" }] },
        { nombre: "Otro, A", fideId: "", eloNacional: 1400, eloFide: 0, nacimiento: 2010, equipo: "Otro", partidas: [] },
        { nombre: "Otro, B", fideId: "", eloNacional: 1400, eloFide: 0, nacimiento: 2010, equipo: "Otro", partidas: [] },
    ],
};
r = C.calcular([equipo], {});
igual("en equipos: con 2 de 5 rondas recibe el lugar del equipo (20)", r.ramas.M.find((f) => f.nombre === "Tablero, Uno").A, 20);
igual("con 1 de 5 sobre el tablero (la otra por ausencia) no lo recibe", r.ramas.M.find((f) => f.nombre === "Tablero, Dos").A, 0);

console.log("\n=== Las mujeres del absoluto ===");
const fem = individual("30", "Prueba D Individual Femenino", "F", "clasico", [["Rojas, Lía", "401", 1500, 0, 2010]]);
const abs = individual("31", "Prueba D Individual Absoluto Blitz", "A", "blitz", [["Rojas, Lía", "401", 1500, 0, 2010], ["Vargas, Sara", "402", 1500, 0, 2010], ["Pérez, Juan", "403", 1500, 0, 2010]]);
r = C.calcular([fem, abs], {});
igual("quien jugó un femenino se calcula en femenino aunque juegue un absoluto", r.ramas.F.map((f) => f.nombre), ["Rojas, Lía"]);
igual("un nombre de mujer en el absoluto sale en los avisos", r.avisos.filter((a) => a.motivo === "sexo").map((a) => a.nombre), ["Vargas, Sara"]);
const sara = r.ramas.M.find((f) => f.nombre === "Vargas, Sara");
r = C.calcular([fem, abs], { ajustes: { [sara.clave]: { sexo: "F" } } });
igual("marcada como mujer, sale de la rama masculina y entra a la femenina",
    [r.ramas.M.some((f) => f.nombre === "Vargas, Sara"), r.ramas.F.some((f) => f.nombre === "Vargas, Sara")], [false, true]);

console.log("\n=== Otra final que cumple la edad (la B en la C) ===");
const finalC = individual("40", "Final C Individual Absoluto", "A", "clasico", [["Ce, Uno", "501", 1500, 0, 2013], ["Ce, Mayor", "502", 1500, 0, 2011]], { categoria: "C" });
const finalB = individual("41", "Final B Individual Absoluto", "A", "clasico", [["Be, Joven", "503", 1500, 0, 2013], ["Be, Niño", "504", 1500, 0, 2016]], { categoria: "B" });
r = C.calcular([finalC, finalB], { anioDesde: 2012, anioHasta: 2014 });
igual("entran los de la C y de la B nacidos en el rango; fuera los demás",
    [r.ramas.M.map((f) => f.nombre).sort(), r.noElegibles.map((f) => f.nombre).sort()], [["Be, Joven", "Ce, Uno"], ["Be, Niño", "Ce, Mayor"]]);

console.log("\n=== Sin año de nacimiento ===");
const sinAnio = individual("50", "Prueba", "A", "clasico", [["Sin, Año", "601", 1500, 0, null]]);
r = C.calcular([sinAnio], {});
igual("queda fuera y lo avisa como error", [r.ramas.M.length, r.avisos.filter((a) => a.tipo === "error" && a.motivo === "nacimiento").length], [0, 1]);
r = C.calcular([sinAnio], { ajustes: { "f:601": { nacimiento: 2010 } } });
igual("con el año escrito a mano, entra", r.ramas.M.map((f) => [f.nombre, f.nacimiento, f.nacimientoManual]), [["Sin, Año", 2010, true]]);

console.log("\n=== Desempate en la suma ===");
const empate = individual("60", "Prueba", "A", "clasico", [["Uno, Mayor", "701", 1600, 0, 2009], ["Uno, Menor", "702", 1600, 0, 2011], ["Dos, Fuerte", "703", 1700, 0, 2010]],
    { clasificacion: [{ puesto: 1, nombre: "Uno, Mayor" }, { puesto: 1, nombre: "Uno, Menor" }, { puesto: 3, nombre: "Dos, Fuerte" }] });
r = C.calcular([empate], { cupos: { M: 1, F: 1 } });
igual("con la misma suma y el mismo C, va primero quien tiene menos edad", r.ramas.M.slice(0, 2).map((f) => f.nombre), ["Uno, Menor", "Uno, Mayor"]);

console.log("\n=== Códigos en cero ===");
const ceros = individual("70", "Prueba", "A", "clasico", [["Ana, Una", "0", 1500, 0, 2010], ["Beto, Otro", "0", 1500, 0, 2010]]);
ceros.jugadores.forEach((j) => { j.codigoNacional = "0"; });
igual("dos personas con código «0» siguen siendo dos", C.calcular([ceros], {}).ramas.M.length, 2);

console.log("\n=== En vivo: quién entra y quién sale ===");
const ronda3 = individual("80", "Prueba", "A", "clasico", [["Primero, Al", "801", 1500, 0, 2010], ["Segundo, Al", "802", 1500, 0, 2010]]);
const ronda4 = individual("80", "Prueba", "A", "clasico", [["Segundo, Al", "802", 1500, 0, 2010], ["Primero, Al", "801", 1500, 0, 2010]]);
const antes = C.calcular([ronda3], { cupos: { M: 1, F: 0 } });
const despues = C.calcular([ronda4], { cupos: { M: 1, F: 0 } });
const cb = C.cambios(antes, despues);
igual("el que pasa al primer lugar entra; el otro sale", [cb["f:802"].entra, cb["f:801"].sale, cb["f:802"].puestos], [true, true, 1]);

console.log("\n=== Lo que se adivina del título ===");
igual("Etapa Nacional … D Individual Femenino Blitz", C.adivinarTorneo("Etapa Nacional Juegos Estudiantiles D Individual Femenino Blitz"), { rama: "F", ritmo: "blitz", categoria: "D" });
igual("… D Equipos Absoluto", C.adivinarTorneo("Etapa Nacional Juegos Estudiantiles D Equipos Absoluto"), { rama: "A", ritmo: "clasico", categoria: "D" });

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);
