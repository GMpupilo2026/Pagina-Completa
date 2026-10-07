/* Arma los planes de clase de arranque, para que `planes.html` no esté vacío el
 * primer día.
 *
 * NINGUNA POSICIÓN SE INVENTA ACÁ. Todas salen de bancos que este repositorio ya
 * verificó con motor o con chess.js:
 *
 *   cursos/protegido/data/el-mapa-de-los-finales.json   240 diagramas, 12 capítulos
 *   js/aperturas-lineas.js                               40 líneas (466 jugadas)
 *   entreno/data/temas.json                           7.008 ejercicios de Lichess
 *   entreno/data/mates.json                              mates en 1, 2 y 3
 *
 * Es la regla escrita de este repositorio: inventar una posición es el error que
 * ya se cometió una vez, con una "Lucena" que no era Lucena. Acá, además, cada
 * FEN vuelve a pasar por la MISMA validación que hace la clase en vivo
 * (js/posicion-valida.js) antes de entrar a un plan: una posición que rompe a
 * Stockfish no da ningún error hasta que el profesor la manda al tablero.
 *
 * Uso:  npm install chess.js@0.10.3
 *       node herramientas/planes-semilla.js            # escribe el JSON y el SQL
 *       node herramientas/planes-semilla.js --sql      # solo imprime el SQL
 *
 * El SQL se aplica con el profesor destino puesto arriba (PROFESOR_ID) y se
 * puede correr las veces que se quiera: borra antes los planes de semilla por su
 * título, así que no duplica.
 */
const fs = require("fs");
const path = require("path");

const banco = require("./lib/planes-banco");
const { RAIZ, Chess, contador, fenUsable, leerJSON, aEspanol, chuletaDeDiagrama,
        recorta, posicion, nota, turnoDe, renglonDeLinea, lineasDeAperturas,
        ejerciciosDeTema, renglonDeEjercicio } = banco;

/* A quién le quedan los planes. Un plan es del profesor que lo escribió (la RLS
   no deja firmar por otro), así que la semilla tiene que decir de quién es. */
const PROFESOR_ID = process.env.PROFESOR_ID || "5fc884eb-5374-4353-9a5d-60454c0be6c9";

// Lo que los distingue de los que arme el profesor a mano: se borran y se
// vuelven a sembrar por este prefijo, sin tocar los suyos.
const MARCA = "· AI";

const planes = [];
function plan(titulo, notas, items) {
    const buenos = items.filter(Boolean);
    // Un plan sin un solo renglón usable no se siembra: sería una tarjeta vacía
    // que el profesor abre en clase para nada.
    if (!buenos.length) return;
    planes.push({
        titulo: recorta(titulo + " " + MARCA, 200),
        notas: recorta(notas, 4000),
        items: buenos.map((it, i) => Object.assign({ orden: i }, it)),
    });
}

// ==================================================================== FINALES

/* 240 diagramas repartidos en 12 capítulos, todos verificados con motor en su
   día (es el curso "Los 100 finales"). Un plan por capítulo, con hasta seis
   posiciones: más de seis no se dan en una clase. */
function planesDeFinales() {
    const mapa = leerJSON("cursos/protegido/data/el-mapa-de-los-finales.json");
    const porCapitulo = new Map();
    mapa.finales.forEach((f) => {
        if (!porCapitulo.has(f.capitulo)) porCapitulo.set(f.capitulo, []);
        (f.diagramas || []).forEach((d) => porCapitulo.get(f.capitulo).push({ final: f, d }));
    });

    for (const [capitulo, lista] of porCapitulo) {
        const items = [];
        const vistos = new Set();
        for (const { final, d } of lista) {
            if (items.length >= 6) break;
            if (vistos.has(d.fen)) continue;
            vistos.add(d.fen);
            const it = posicion(d.titulo || final.titulo, d.fen, chuletaDeDiagrama(d));
            if (it) items.push(it);
        }
        if (items.length) {
            items.unshift(nota("De qué va la clase",
                "Finales: " + capitulo + ". Cada posición se enseña primero, se pregunta después. " +
                "La solución de cada una va escrita en su renglón — solo la ves tú."));
        }
        plan("Finales · " + capitulo,
             "Del curso «Los 100 finales». Las posiciones están verificadas con motor.",
             items);
    }
}

// ================================================================== APERTURAS

/* Las 40 líneas del banco, agrupadas por apertura. De cada línea se guarda la
   posición a la que LLEGA —que es la que se le enseña a la clase, "así queda la
   italiana"— y la línea entera va escrita en la chuleta.
 *
 * La FEN se calcula jugando la línea con chess.js, no se escribe a mano: así no
 * puede quedar una posición que no corresponda a esas jugadas. */
function planesDeAperturas() {
    const lineas = lineasDeAperturas();

    const porApertura = new Map();
    lineas.forEach((l) => {
        const clave = l.tipo === "celada" ? "Celadas" : (l.apertura || "Otras");
        if (!porApertura.has(clave)) porApertura.set(clave, []);
        porApertura.get(clave).push(l);
    });

    // Las celadas van en tres clases de a cuatro, no en una de doce.
    const celadas = porApertura.get("Celadas") || [];
    porApertura.delete("Celadas");
    for (let i = 0; i < celadas.length; i += 4) {
        const trozo = celadas.slice(i, i + 4);
        plan("Celadas de apertura " + (Math.floor(i / 4) + 1),
             "Celadas: lo que pasa si el rival se equivoca en las primeras jugadas. " +
             "Enséñale la posición final y que la clase encuentre por qué gana.",
             trozo.map((l) => renglonDeLinea(l)));
    }

    /* Una apertura con una sola línea no es una clase: quedarían quince planes
       de un renglón cada uno. Las que tienen dos o más van solas; las sueltas se
       juntan por lo que de verdad las agrupa — con qué contesta el alumno. */
    const sueltas = [];
    for (const [apertura, lista] of porApertura) {
        if (lista.length < 2) { sueltas.push(...lista); continue; }
        plan("Apertura · " + apertura,
             "Del banco de «Aperturas y celadas». Cada renglón es la posición a la que se llega; " +
             "la línea entera está escrita en su chuleta.",
             lista.slice(0, 6).map((l) => renglonDeLinea(l)));
    }

    /* Se parte de a cinco, pero un resto de una sola línea NO se deja solo: un
       plan de un renglón no es una clase. Se le suma al trozo anterior. */
    const enTrozos = (lista, tam) => {
        const trozos = [];
        for (let i = 0; i < lista.length; i += tam) trozos.push(lista.slice(i, i + tam));
        if (trozos.length > 1 && trozos[trozos.length - 1].length < 2) {
            trozos[trozos.length - 2].push(...trozos.pop());
        }
        return trozos;
    };

    enTrozos(sueltas.filter((l) => l.color === "w"), 5).forEach((t, i) =>
        plan("Apertura · Con blancas " + (i + 1),
             "Aperturas sueltas del banco, para ver varias en una clase.",
             t.map((l) => renglonDeLinea(l))));
    enTrozos(sueltas.filter((l) => l.color === "b"), 5).forEach((t, i) =>
        plan("Apertura · Defensas con negras " + (i + 1),
             "Cómo contesta el alumno a la primera jugada del rival.",
             t.map((l) => renglonDeLinea(l))));
}

// ==================================================================== TÁCTICA

/* QUÉ TEMAS SE SIEMBRAN ES UNA DECISIÓN EDITORIAL, NO UNA DEDUCCIÓN.
 *
 * `temas.json` trae 79 temas, y sembrarlos todos daría 79 planes: una lista que
 * no se puede mirar. Pero elegirlos por "el que tenga más ejercicios" tampoco
 * sirve — casi todos tienen 100, y tener muchos no hace a un tema didáctico.
 *
 * Así que van escritos, como `AREAS_DEL_CURSO` en los exámenes: estos son los
 * motivos que se enseñan de verdad en una academia, en el orden en que se
 * enseñan. Los cuatro primeros son los del grupo de la casa (con su nombre en
 * español propio); el resto son los clásicos.
 */
const TEMAS_QUE_SE_ENSENAN = [
    "ataque-doble", "ultima-linea", "enroque-corto", "columnas-diagonales",
    "pin", "skewer", "discoveredAttack", "capturingDefender",
    "hangingPiece", "trappedPiece", "attackingF2F7", "advancedPawn",
    "deflection", "attraction", "intermezzo", "xRayAttack",
];

/* Los mates con nombre se enseñan por su dibujo, no por su dificultad: son los
 * que el alumno reconoce después en sus partidas. */
const MATES_CON_NOMBRE = [
    "backRankMate", "smotheredMate", "operaMate", "anastasiaMate", "arabianMate",
];

function planDeTema(d, key, prefijo, notas) {
    let info = null, grupo = null;
    d.groups.forEach((g) => g.themes.forEach((t) => {
        if (t.key === key) { info = t; grupo = g; }
    }));
    if (!info) return;
    const elegidos = ejerciciosDeTema(d, key, 6);
    if (elegidos.length < 4) return;   // con menos de cuatro no es una clase
    const items = elegidos.map((p, i) => renglonDeEjercicio(p, "Ejercicio " + (i + 1)));
    items.unshift(nota("El tema de hoy", info.name + (info.desc ? ". " + info.desc : "")));
    plan(prefijo + " · " + info.name, notas || (grupo.title + ". Ejercicios de menor a mayor dificultad."), items);
}

function planesDeTactica() {
    const d = leerJSON("entreno/data/temas.json");
    TEMAS_QUE_SE_ENSENAN.forEach((k) => planDeTema(d, k, "Táctica"));
    MATES_CON_NOMBRE.forEach((k) => planDeTema(
        d, k, "Mates con nombre",
        "Un mate que se reconoce por su dibujo. Enséñale el patrón y después que lo busquen."));
}

// ====================================================================== MATES

/* El banco de la casa (`entreno/data/mates.json`) es una lista plana: cada
   ejercicio trae su `category` (mate1/mate2/mate3) y su solución. */
function planesDeMates() {
    let lista;
    try { lista = leerJSON("entreno/data/mates.json"); } catch (e) { return; }
    if (!Array.isArray(lista)) return;
    const NOMBRE = { mate1: "Mate en 1", mate2: "Mate en 2", mate3: "Mate en 3" };
    Object.keys(NOMBRE).forEach((cat) => {
        const elegidos = lista.filter((p) => p && p.category === cat && p.fen && fenUsable(p.fen)).slice(0, 6);
        if (elegidos.length < 4) return;
        const items = elegidos.map((p, i) => posicion(
            "Mate " + (i + 1), p.fen,
            turnoDe(p.fen) + " · Solución: " + (p.solution || []).map(aEspanol).join(" ")));
        items.unshift(nota("De qué va la clase",
            NOMBRE[cat] + ". Se dan uno por uno: la clase busca y después se enseña en el tablero."));
        plan("Mates · " + NOMBRE[cat], "Del banco de Mates de Entrenamiento.", items);
    });
}

// ======================================================================== SQL

function aSQL(planes) {
    const esc = (v) => (v === null || v === undefined ? "NULL" : "'" + String(v).replace(/'/g, "''") + "'");
    const out = [];
    out.push("-- Planes de clase de arranque. Generado por herramientas/planes-semilla.js.");
    out.push("-- Se puede correr las veces que haga falta: borra primero los suyos por la marca.");
    out.push("begin;");
    out.push("delete from public.planes_clase where profesor_id = " + esc(PROFESOR_ID) +
             " and titulo like " + esc("% " + MARCA) + ";");
    planes.forEach((p, i) => {
        const v = "p" + i;
        out.push("with " + v + " as (insert into public.planes_clase (profesor_id, titulo, notas) values (" +
                 esc(PROFESOR_ID) + ", " + esc(p.titulo) + ", " + esc(p.notas) + ") returning id)");
        out.push("insert into public.plan_items (plan_id, orden, tipo, titulo, fen, pregunta, nota) select " + v + ".id, x.orden, x.tipo, x.titulo, x.fen, x.pregunta, x.nota from " + v + ", (values");
        out.push(p.items.map((it) => "  (" + it.orden + ", " + esc(it.tipo) + ", " + esc(it.titulo) + ", " +
                 esc(it.fen || null) + ", " + esc(it.pregunta || null) + ", " + esc(it.nota || null) + ")").join(",\n"));
        out.push(") as x(orden, tipo, titulo, fen, pregunta, nota);");
    });
    out.push("commit;");
    return out.join("\n");
}

// ======================================================================= main

planesDeFinales();
planesDeAperturas();
planesDeTactica();
planesDeMates();

const salidaJSON = path.join(__dirname, "planes", "semilla.json");
const salidaSQL = path.join(__dirname, "planes", "semilla.sql");
fs.mkdirSync(path.dirname(salidaJSON), { recursive: true });
fs.writeFileSync(salidaJSON, JSON.stringify({ profesor_id: PROFESOR_ID, marca: MARCA, planes }, null, 2));
fs.writeFileSync(salidaSQL, aSQL(planes));

if (process.argv.includes("--sql")) { console.log(aSQL(planes)); process.exit(0); }

const renglones = planes.reduce((n, p) => n + p.items.length, 0);
const posiciones = planes.reduce((n, p) => n + p.items.filter((i) => i.tipo === "posicion").length, 0);
console.log(planes.length + " planes · " + renglones + " renglones (" + posiciones + " posiciones)");
console.log(contador.descartadas + " posiciones descartadas por no pasar la validación de la clase en vivo");
console.log("\nPor bloque:");
const porBloque = {};
planes.forEach((p) => {
    const b = p.titulo.split(" · ")[0].replace(/ \d+ .*/, "");
    porBloque[b] = (porBloque[b] || 0) + 1;
});
Object.entries(porBloque).sort((a, b) => b[1] - a[1]).forEach(([b, n]) => console.log("  " + n + "\t" + b));
console.log("\nEscritos:\n  " + path.relative(RAIZ, salidaJSON) + "\n  " + path.relative(RAIZ, salidaSQL));
