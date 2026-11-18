#!/usr/bin/env node
/* Verifica el tablero de preguntas (tablero-preguntas.html, js/tablero-preguntas.js).

   Sin navegador: prueba la parte pura con datos armados acá.
   - Las preguntas con posición, sin correcta o con menos de dos opciones se
     quedan afuera (el tablero se proyecta sin tablero de ajedrez).
   - armar() pide de 2 a 6 categorías y avisa cuál cuestionario no alcanza.
   - Cada columna sale con sus valores 100, 200… y preguntas distintas, sin
     repetir ni inventar: cada casilla es una pregunta del cuestionario, con
     su misma correcta.
   - El podio respeta los empates (1, 1, 3).
   Y en los archivos: la página está en la cabecera de la Academia con sus
   migas, Cuestionarios la enlaza, y el código no pinta con innerHTML nada que
   haya escrito una persona.

     node herramientas/verificar-tablero-preguntas.js */

const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const TP = require(path.join(RAIZ, "js/tablero-preguntas.js"));

const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

function pregunta(n, extra) {
    return Object.assign({ texto: "Pregunta " + n, opciones: ["a" + n, "b" + n, "c" + n, "d" + n], correcta: n % 4, tiempo: 20 }, extra || {});
}
function cuestionario(titulo, n, extras) {
    const preguntas = [];
    for (let i = 0; i < n; i++) preguntas.push(pregunta(i));
    return { id: titulo, titulo, preguntas: preguntas.concat(extras || []) };
}

// 1) Qué preguntas se pueden jugar.
{
    const c = cuestionario("Mezcla", 3, [
        pregunta(90, { fen: "8/8/8/8/8/8/8/K6k w - - 0 1" }),
        pregunta(91, { correcta: null }),
        pregunta(92, { opciones: ["sola", "", "", ""], correcta: 0 }),
        pregunta(93, { correcta: 2, opciones: ["x", "y", "", ""] }),
        pregunta(94, { texto: "   " }),
    ]);
    const jugables = TP.preguntasJugables(c).map((p) => p.texto);
    ok(jugables.length === 3 && !jugables.includes("Pregunta 90"),
        `las preguntas con posición, sin correcta, con una sola opción, con la correcta vacía o sin texto se quedan afuera; quedaron ${JSON.stringify(jugables)}`);
}

// 2) armar(): límites y avisos.
{
    ok(/al menos 2/.test(TP.armar([cuestionario("A", 5)], 5).error || ""), "con una sola categoría tiene que pedir al menos 2");
    const siete = "ABCDEFG".split("").map((t) => cuestionario(t, 5));
    ok(/6 categorías/.test(TP.armar(siete, 5).error || ""), "con siete categorías tiene que decir que son 6 como máximo");
    const corto = TP.armar([cuestionario("Largo", 8), cuestionario("Corto", 3)], 5);
    ok(/«Corto» tiene 3/.test(corto.error || ""), `tiene que nombrar al cuestionario que no alcanza: ${JSON.stringify(corto.error)}`);
}

// 3) Las columnas: valores, sin repetir, preguntas del cuestionario con su correcta.
{
    let semilla = 7;
    const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
    const fuente = [cuestionario("Aperturas", 12), cuestionario("Finales", 9), cuestionario("Historia", 5)];
    const r = TP.armar(fuente, 5, azar);
    ok(!r.error && r.categorias.length === 3, `armar() con tres cuestionarios de 5 o más debería salir bien: ${r.error}`);
    (r.categorias || []).forEach((c, i) => {
        ok(c.titulo === fuente[i].titulo, `la columna ${i + 1} debería llamarse «${fuente[i].titulo}»`);
        ok(JSON.stringify(c.casillas.map((x) => x.valor)) === "[100,200,300,400,500]", `«${c.titulo}»: los valores deberían ser 100 a 500, son ${c.casillas.map((x) => x.valor)}`);
        const textos = c.casillas.map((x) => x.texto);
        ok(new Set(textos).size === textos.length, `«${c.titulo}» repite una pregunta`);
        c.casillas.forEach((x) => {
            const original = fuente[i].preguntas.find((p) => p.texto === x.texto);
            ok(original && original.correcta === x.correcta && original.opciones[x.correcta] === x.opciones[x.correcta],
                `«${c.titulo}»: «${x.texto}» no es una pregunta del cuestionario o cambió su correcta`);
            ok(x.usada === false, "una casilla nueva no puede nacer usada");
        });
    });
    ok(TP.quedan(r) === 15, `quedan() debería contar 15 casillas sin jugar, contó ${TP.quedan(r)}`);
    const tres = TP.armar(fuente, 3, azar);
    ok(tres.categorias && tres.categorias.every((c) => c.casillas.length === 3 && c.casillas[2].valor === 300), "con 3 filas, cada columna va de 100 a 300");
}

// 4) El podio, con empates.
{
    const p = TP.podio([{ nombre: "Rojo", puntos: 300 }, { nombre: "Azul", puntos: 500 }, { nombre: "Verde", puntos: 500 }, { nombre: "Gris", puntos: -100 }]);
    ok(JSON.stringify(p.map((e) => [e.puesto, e.nombre])) === JSON.stringify([[1, "Azul"], [1, "Verde"], [3, "Rojo"], [4, "Gris"]]),
        `el podio debería ser Azul 1, Verde 1, Rojo 3, Gris 4: ${JSON.stringify(p)}`);
}

// 5) Los archivos.
{
    const cab = fs.readFileSync(path.join(RAIZ, "herramientas/academia-cabecera.py"), "utf8");
    ok(/"tablero-preguntas\.html",/.test(cab), "tablero-preguntas.html tiene que estar en PAGINAS de academia-cabecera.py");
    ok(/"tablero-preguntas\.html": \("Tablero de preguntas", "cuestionarios\.html"\)/.test(cab), "las migas: tablero-preguntas.html cuelga de Cuestionarios");
    const html = fs.readFileSync(path.join(RAIZ, "tablero-preguntas.html"), "utf8");
    ok(/<!-- migas: inicio -->[\s\S]*href="cuestionarios\.html"[\s\S]*Tablero de preguntas[\s\S]*<!-- migas: fin -->/.test(html), "la página no tiene sus migas (correr academia-cabecera.py)");
    ok(/<!-- guardia: inicio -->/.test(html), "la página exige sesión: le falta la guardia");
    ok(/href="tablero-preguntas\.html"/.test(fs.readFileSync(path.join(RAIZ, "cuestionarios.html"), "utf8")), "Cuestionarios tiene que enlazar el tablero de preguntas");
    const js = fs.readFileSync(path.join(RAIZ, "js/tablero-preguntas.js"), "utf8");
    // innerHTML solo para vaciar o con texto fijo: lo que escribió una persona va por textContent.
    const malos = (js.match(/innerHTML\s*=\s*[^;]+;/g) || []).filter((s) => !/innerHTML\s*=\s*"";/.test(s) && !/innerHTML\s*=\s*'<span aria-hidden="true">' \+ \(MEDALLA/.test(s));
    ok(!malos.length, `js/tablero-preguntas.js pinta con innerHTML algo que no es fijo: ${malos.join(" | ")}`);
    ok(!/\b(alert|confirm|prompt)\(/.test(js.replace(/Avisos\.confirmar\(/g, "")), "nada de alert/confirm/prompt: se usa js/avisos.js");
}

if (fallos.length) {
    console.error("✗ tablero de preguntas:\n  - " + fallos.join("\n  - "));
    process.exit(1);
}
console.log("✓ tablero de preguntas: preguntas jugables, columnas, podio y archivos en orden.");

/*! rev bfb5bbb0d2d82f9f */
