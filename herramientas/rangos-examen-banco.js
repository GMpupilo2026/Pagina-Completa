#!/usr/bin/env node
/* Genera el banco de preguntas de los exámenes de rango.

   Cada rango (de Caballo a Dragón) tiene su examen, que la BASE arma sola
   cuando el alumno junta los puntos (interno.revisar_examen_rango). La base
   no puede leer entreno/data/temas.json ni mover piezas, así que las
   preguntas se preparan acá, una vez, con LA MISMA función que usa Exámenes
   para la táctica de Entrenamiento (ExamenBanco: deTactica, vía armar()), y
   se guardan en interno.rango_examen_banco. Ninguna posición se inventa:
   son los ejercicios de Lichess ya verificados del banco de Entrenamiento.

   Cada rango toma ejercicios de una franja de rating (FRANJAS), repartidos
   entre los temas (de a uno por tema, en vueltas) para que un examen no sea
   «diez clavadas». La elección es determinista (sin azar): correrlo dos
   veces da el mismo SQL.

     node herramientas/rangos-examen-banco.js > herramientas/rangos/banco.sql

   Ver «Los rangos se ganan con un examen» en docs/decisiones/puntos-y-premios.md. */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const RAIZ = path.join(__dirname, "..");

// La franja de rating de cada rango y cuántas preguntas guarda el banco.
const FRANJAS = {
    caballo: [900, 1199],
    alfil: [1200, 1499],
    torre: [1500, 1799],
    dama_rey: [1800, 2099],
    dragon: [2100, 2700],
};
// 40 por rango alcanzan para cuatro exámenes distintos de 10; más hace pesado el SQL.
const POR_RANGO = 40;

/* La pregunta, compacta: lo que la base necesita para rearmarla tal cual
   (interno.pregunta_de_rango, que arma el enunciado y la explicación con la
   misma plantilla de ExamenBanco.deTactica). a = área, p = peso, m = mate,
   f = fen, s = la solución en español, r = rating, j = [[desde, hasta], …].
   rearmar() es esa plantilla, para que verificar-rangos-examen.js compruebe
   que lo compacto vuelve a dar la pregunta exacta. */
function compacta(item, ej) {
    const m = /el mate/.test(item.visible.enunciado) ? 1 : 0;
    const s = item.visible.explica.replace(/^.*La solución: /, "").replace(/ — Ejercicio de Lichess de dificultad \d+\.$/, "");
    return { a: item.area, p: item.peso, m, f: item.visible.fen, s, r: ej.rating, j: item.clave.jugadas.map((x) => [x.from, x.to]) };
}
function rearmar(c) {
    const color = c.f.split(" ")[1] === "w" ? "blancas" : "negras";
    return {
        tipo: "jugada", banco: "tactica", area: c.a, peso: c.p,
        visible: {
            enunciado: `Juegan las ${color}: ${c.m ? "encuentra el mate" : "encuentra la mejor jugada"}.`,
            fen: c.f,
            explica: `${c.a}. La solución: ${c.s} — Ejercicio de Lichess de dificultad ${c.r}.`,
        },
        clave: { jugadas: c.j.map(([from, to]) => ({ from, to })) },
    };
}

function cargarExamenBanco() {
    const Chess = require(path.join(RAIZ, "node_modules/chess.js")).Chess;
    const ctx = { console, Math, JSON, Promise, Set, Map, Object, Array, String, Number };
    ctx.window = ctx;
    ctx.Chess = Chess;
    ctx.document = { createElement: () => ({}), head: { appendChild() {} } };
    vm.createContext(ctx);
    try { vm.runInContext(fs.readFileSync(path.join(RAIZ, "js/comandos-tablero.js"), "utf8"), ctx); } catch (e) { /* sin traducción al español: la explicación sale en SAN */ }
    vm.runInContext(fs.readFileSync(path.join(RAIZ, "js/examen-banco.js"), "utf8"), ctx);
    return ctx;
}

function principal() {
    const ctx = cargarExamenBanco();
    const EB = ctx.ExamenBanco;
    const datos = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/temas.json"), "utf8"));
    EB.cargarTactica(datos);
    // Sin «Mezcla equilibrada»: el informe del examen dice cómo le fue tema por
    // tema, y «mezcla» no dice nada.
    const temas = EB.temasDeTactica().filter((t) => t.valor !== "mix");   // [{valor, texto, grupo}]
    if (!temas.length) throw new Error("ExamenBanco no devolvió temas de táctica");

    const filas = [];
    for (const [rango, [min, max]] of Object.entries(FRANJAS)) {
        const vistos = new Set();
        // Por tema, los ejercicios en la franja, con la pregunta ya armada por ExamenBanco.
        const porTema = temas.map((t) => {
            const lista = [];
            ((datos.themes || {})[t.valor] || []).slice().sort().forEach((id) => {
                const p = datos.puzzles[id];
                if (!p || typeof p.rating !== "number" || p.rating < min || p.rating > max) return;
                lista.push(id);
            });
            return { tema: t.valor, ids: lista };
        }).filter((x) => x.ids.length);

        // De a uno por tema, en vueltas, hasta llenar: un examen no es diez de lo mismo.
        const elegidos = [];
        for (let vuelta = 0; elegidos.length < POR_RANGO; vuelta++) {
            let alguno = false;
            for (const t of porTema) {
                const id = t.ids[vuelta];
                if (id === undefined) continue;
                alguno = true;
                if (vistos.has(id)) continue;
                vistos.add(id);
                elegidos.push({ id, tema: t.tema });
                if (elegidos.length >= POR_RANGO) break;
            }
            if (!alguno) break;
        }

        // Cada uno pasado a pregunta por la misma función de Exámenes.
        for (const e of elegidos) {
            const item = EB.preguntaDeTactica(e.id, e.tema);
            if (!item) continue;
            filas.push({ rango, item_id: e.id, item, ej: datos.puzzles[e.id] });
        }
        if (filas.filter((f) => f.rango === rango).length < 40) throw new Error(`El rango ${rango} se quedó con muy pocas preguntas`);
    }
    return filas;
}

/* Los mates básicos del examen de Caballo (decisión del dueño, 18/11/2026):
   dama y rey contra rey, y dos torres contra rey, en menos de 2 minutos cada
   uno. Las posiciones son las de «Con lo justo» (entreno/data/tipos.json,
   niveles 1 y 2), ya verificadas por herramientas/tipos-generar.js. La base
   elige una de cada final al armar el examen. */
const MATES = { caballo: [{ nivel: 1, fin: "rr" }, { nivel: 2, fin: "q" }] };
function mates() {
    const tipos = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/tipos.json"), "utf8"))["con-lo-justo"] || [];
    const filas = [];
    for (const [rango, lista] of Object.entries(MATES)) {
        for (const m of lista) {
            const pos = tipos.filter((t) => t.nivel === m.nivel && t.piezas === m.fin);
            if (pos.length < 5) throw new Error(`«Con lo justo» nivel ${m.nivel} trae muy pocas posiciones`);
            pos.forEach((t) => filas.push({ rango, item_id: "mate-" + t.id, compacta: { t: "mate", fin: m.fin, f: t.fen } }));
        }
    }
    return filas;
}

if (require.main === module) {
    const filas = principal();
    const esc = (s) => String(s).replace(/'/g, "''");
    const lineas = filas.map((f) => `  ('${f.rango}', '${esc(f.item_id)}', '${esc(JSON.stringify(compacta(f.item, f.ej)))}'::jsonb)`)
        .concat(mates().map((f) => `  ('${f.rango}', '${esc(f.item_id)}', '${esc(JSON.stringify(f.compacta))}'::jsonb)`));
    process.stdout.write(
        "-- Generado por herramientas/rangos-examen-banco.js: no se edita a mano.\n" +
        "delete from interno.rango_examen_banco;\n" +
        "insert into interno.rango_examen_banco (rango, item_id, item) values\n" + lineas.join(",\n") + ";\n");
} else {
    module.exports = { principal, compacta, rearmar, mates, MATES, FRANJAS, POR_RANGO };
}

/*! rev bfb5bbb0d2d82f9f */
