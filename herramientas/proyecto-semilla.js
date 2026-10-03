/* Siembra un proyecto (admin.html#proyectos): sus grupos, el calendario de
 * sesiones —cada una con su plan de clase para la clase en vivo— y las tareas
 * semanales listas para mandar.
 *
 * El contenido vive en herramientas/proyectos/<slug>.json (la guía de cada
 * grupo, lo que se hace en cada clase, qué lecciones y qué posiciones lleva su
 * plan, y las tareas de cada semana). Este script lo convierte en SQL.
 *
 * NINGUNA POSICIÓN SE INVENTA. El JSON no trae ni una FEN: dice DE DÓNDE sale
 * cada posición (un final de «El mapa de los finales», un tema de Ejercicios por
 * tema, un mate del banco, una línea de Aperturas) y acá se busca en ese banco,
 * con las mismas funciones que los planes de arranque (lib/planes-banco.js), y
 * pasa por la regla de la clase en vivo.
 *
 * Las LECCIONES se buscan por su título en el HTML del curso, no por número: el
 * número que abre la clase en vivo es la posición del <details> en la página,
 * y en un curso con «Solución» entre lección y lección no coincide con el que
 * dice el título. Un número escrito a mano abriría la lección de al lado.
 *
 * Las TAREAS se arman con el mismo catálogo que tareas.html
 * (js/material-plataforma.js, cargado tal cual): con qué nombre apunta cada
 * herramienta en training_progress, qué meta admite y a dónde lleva el enlace.
 * Un renglón con la actividad equivocada se queda en cero para siempre sin dar
 * ningún error.
 *
 * Uso:  npm install
 *       node herramientas/proyecto-semilla.js [campeones-colegiales-2026]
 * Escribe herramientas/planes/proyecto-<slug>.json (lo que revisa
 * verificar-planes-semilla.js) y .sql (lo que se aplica). El SQL se puede correr
 * las veces que haga falta: vuelve a sembrar el contenido sin tocar a qué
 * profesor se asignó cada grupo, y le vuelve a compartir sus planes.
 */
const fs = require("fs");
const path = require("path");

const banco = require("./lib/planes-banco");
const { RAIZ, contador, leerJSON, chuletaDeDiagrama, recorta, posicion, nota,
        renglonDeLinea, lineasDeAperturas, ejerciciosDeTema, renglonDeEjercicio } = banco;
const { lecciones: leccionesDeCurso } = require("./lib/leer-curso");

/* Los planes son de quien administra, como los de arranque: un plan es del
   profesor que lo escribió (la RLS no deja firmar por otro). Al profesor del
   grupo se le COMPARTEN; no se le copian. */
const PROFESOR_ID = process.env.PROFESOR_ID || "5fc884eb-5374-4353-9a5d-60454c0be6c9";

const SLUG = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : "campeones-colegiales-2026";
const proyecto = leerJSON(path.join("herramientas", "proyectos", SLUG + ".json"));

// --------------------------------------------------------------- el catálogo
global.window = global.window || {};
require(path.join(RAIZ, "js", "material-plataforma.js"));
const Material = global.window.MaterialPlataforma;
const metas = leerJSON("entreno/data/metas.json");
const catalogo = leerJSON("herramientas/cursos/catalogo.json").cursos;
const { LISTOS } = require("./cuestionarios-listos.js");

const errores = [];
const falla = (m) => errores.push(m);

// ------------------------------------------------------------------ bancos
const mapa = leerJSON("cursos/protegido/data/el-mapa-de-los-finales.json");
const estrategia = leerJSON("cursos/protegido/data/estrategia-en-el-final.json");
const temas = leerJSON("entreno/data/temas.json");
const mates = leerJSON("entreno/data/mates.json");
const lineas = lineasDeAperturas();

const sinTildes = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/* Cada posición sale con lo que hace falta para DARLA, no solo con la
   respuesta: qué preguntarle a la clase, cuánto tiempo darle, la respuesta y
   el porqué. Va en `_paso` y con eso se arma el paso a paso del renglón (ver
   «El guion de 2 horas», más abajo). El porqué sale del banco (el comentario o
   la clave del diagrama, la clave de la línea) o, en los ejercicios de Lichess,
   de lo que significa su tema. */
const QUE_ES_EL_TEMA = {
    pawnEndgame: "En los finales de peones cuenta cada tiempo: deciden el rey activo y la oposición.",
    rookEndgame: "En los finales de torres manda la torre activa: detrás del peón pasado y cortando al rey.",
    endgame: "En el final el rey es una pieza de ataque: va al centro y empuja el peón pasado.",
    advancedPawn: "Un peón cerca de coronar vale casi una pieza: se apoya o se frena antes que nada.",
    zugzwang: "Zugzwang: al rival le toca mover y cualquier jugada empeora su posición.",
    intermezzo: "Jugada intermedia: antes de recapturar, una jugada más fuerte (un jaque o una amenaza).",
    deflection: "Desviación: se obliga a una pieza a dejar la casilla o la línea que defendía.",
    quietMove: "Jugada tranquila: sin jaque ni captura, prepara una amenaza que no se puede parar.",
    kingsideAttack: "Ataque en el flanco de rey: se abren líneas hacia el rey enrocado.",
    sacrifice: "Sacrificio: se entrega material para abrir al rey o ganar algo mayor.",
    exposedKing: "Rey expuesto: sin peones que lo cubran, los jaques de las piezas pesadas lo cazan.",
    defensiveMove: "Movimiento defensivo: la mejor jugada es la que para la amenaza del rival.",
    attraction: "Atracción: se obliga al rey o a una pieza a ir a una casilla donde recibe el golpe.",
    hangingPiece: "Pieza colgada: una pieza sin defensa que se puede capturar gratis.",
    fork: "Ataque doble: una pieza ataca dos cosas a la vez y el rival solo puede salvar una.",
    pin: "Clavada: la pieza no se puede mover sin dejar expuesta otra más valiosa detrás.",
    discoveredAttack: "Ataque a la descubierta: al moverse una pieza se destapa el ataque de otra.",
    backRankMate: "Mate del pasillo: el rey queda encerrado en la primera fila por sus propios peones.",
    clearance: "Despeje: se quita una pieza del camino para abrir una casilla o una línea.",
    promotion: "Coronación: el peón llega a la última fila y se convierte en dama u otra pieza.",
    mateIn1: "Mate en 1: revisa todos los jaques; uno de ellos no tiene defensa.",
    mateIn2: "Mate en 2: el primer jaque (o la primera amenaza) deja al rey sin casillas.",
    mateIn3: "Mate en 3: jugadas forzadas, una detrás de otra; cada jaque quita una salida.",
};
const TODOS_LOS_JAQUES = "Busca primero jaques, capturas y amenazas, en ese orden.";
const quienJuega = (fen) => (String(fen).split(" ")[1] === "b" ? "Juegan negras" : "Juegan blancas");
const conPaso = (r, paso) => (r ? Object.assign(r, { _paso: paso }) : r);

function pasoDeDiagrama(d, f) {
    const q = /\?\s*$/.test(d.titulo || "") ? d.titulo
        : quienJuega(d.fen) + ": ¿ganan, empatan o pierden? ¿Con qué plan?";
    const linea = d.jugadas && d.jugadas.length ? banco.lineaDesdeJugadas(d.fen, d.jugadas) : (d.linea_es || "");
    return { q, min: 3, respuesta: [d.resultado_texto, linea && "Línea: " + linea].filter(Boolean).join(" · "),
             porque: d.comentario || d.clave || (f && f.resumen) || "" };
}

function posicionesDe(spec, contexto) {
    if (spec.fuente === "mapa") {
        const f = mapa.finales.find((x) => x.capitulo === spec.capitulo && x.titulo === spec.titulo);
        if (!f) { falla(contexto + ": no hay final «" + spec.titulo + "» en «" + spec.capitulo + "»"); return []; }
        const ds = (f.diagramas || []).slice(spec.desde || 0, (spec.desde || 0) + spec.n);
        if (ds.length < spec.n) falla(contexto + ": «" + spec.titulo + "» no tiene " + spec.n + " diagramas desde el " + (spec.desde || 0));
        return ds.map((d) => conPaso(posicion(d.titulo || f.titulo, d.fen, chuletaDeDiagrama(d)), pasoDeDiagrama(d, f)));
    }
    if (spec.fuente === "estrategia") {
        const f = estrategia.finales.find((x) => x.titulo === spec.titulo);
        if (!f) { falla(contexto + ": no hay «" + spec.titulo + "» en Estrategia en el final"); return []; }
        return (f.diagramas || []).slice(0, spec.n).map((d) => conPaso(posicion(d.titulo || f.titulo, d.fen, chuletaDeDiagrama(d)), pasoDeDiagrama(d, f)));
    }
    if (spec.fuente === "tema") {
        const elegidos = ejerciciosDeTema(temas, spec.tema, spec.n, spec.desde || 0);
        if (elegidos.length < spec.n) falla(contexto + ": el tema «" + spec.tema + "» no tiene " + spec.n + " ejercicios");
        const nombre = (metas.temas.find((t) => t.clave === spec.tema) || {}).label || spec.tema;
        return elegidos.map((p, i) => conPaso(renglonDeEjercicio(p, nombre + " " + ((spec.desde || 0) + i + 1)), {
            q: quienJuega(p.fen) + ": ¿cuál es la mejor jugada? Escribe la variante completa.", min: 3,
            respuesta: "Solución: " + (p.solution || []).map(banco.aEspanol).join(" "),
            porque: QUE_ES_EL_TEMA[spec.tema] || TODOS_LOS_JAQUES }));
    }
    if (spec.fuente === "mate") {
        const lista = mates.filter((p) => p && p.category === spec.cat && p.fen && banco.fenUsable(p.fen))
            .slice(spec.desde || 0, (spec.desde || 0) + spec.n);
        if (lista.length < spec.n) falla(contexto + ": no hay " + spec.n + " de «" + spec.cat + "»");
        const NOMBRE = { mate1: "Mate en 1", mate2: "Mate en 2", mate3: "Mate en 3" };
        const n = Number(spec.cat.slice(-1));
        return lista.map((p, i) => conPaso(posicion(NOMBRE[spec.cat] + " · " + ((spec.desde || 0) + i + 1), p.fen,
            banco.turnoDe(p.fen) + " · Solución: " + (p.solution || []).map(banco.aEspanol).join(" ")), {
            q: quienJuega(p.fen) + " y dan mate en " + n + ". ¿Cómo?", min: n + 1,
            respuesta: "Solución: " + (p.solution || []).map(banco.aEspanol).join(" "),
            porque: QUE_ES_EL_TEMA["mateIn" + n] }));
    }
    if (spec.fuente === "linea") {
        const l = lineas.find((x) => x.id === spec.id);
        if (!l) { falla(contexto + ": no hay línea «" + spec.id + "»"); return []; }
        const r = renglonDeLinea(l);
        const remata = r && /¿Cómo remata\?/.test(r.pregunta || "");
        const lleva = l.color === "w" ? "blancas" : "negras";
        return [conPaso(r, {
            q: remata ? "Llevas " + lleva + ": ¿cómo remata la celada?" : "Llevas " + lleva + ": ¿por qué se juega así y cuál es el plan?",
            min: 3, respuesta: (r && r.pregunta || "").replace(/ · Clave: .*$/, ""), porque: l.clave || "" })];
    }
    falla(contexto + ": fuente desconocida «" + spec.fuente + "»");
    return [];
}

/* La lección por su título. Devuelve el renglón con `leccion` contada desde 0
   entre los <details> de primer nivel: es la que abre la clase en vivo. */
const leccionesCache = {};
function renglonDeLeccion(spec, contexto) {
    const lista = leccionesCache[spec.curso] || (leccionesCache[spec.curso] = leccionesDeCurso(spec.curso));
    const buscado = sinTildes(spec.titulo);
    const l = lista.find((x) => sinTildes(x.titulo).startsWith(buscado));
    if (!l) { falla(contexto + ": no hay lección «" + spec.titulo + "» en " + spec.curso); return null; }
    const curso = catalogo.find((c) => c.slug === spec.curso);
    return { tipo: "leccion", titulo: recorta((curso ? curso.titulo : spec.curso) + " · " + l.n + ". " + l.titulo, 200),
             curso: spec.curso, leccion: l.idxDetalle,
             // Lo que dice la lección, para que el profesor la explique leyéndola (va en la nota de Contenido).
             _texto: l.texto, _nombre: l.n + ". " + l.titulo, _curso: curso ? curso.titulo : spec.curso };
}

// --------------------------------------------------------------- las tareas
function renglonDeTarea(spec, contexto) {
    if (spec.curso) {
        const c = catalogo.find((x) => x.slug === spec.curso);
        if (!c) { falla(contexto + ": no hay curso " + spec.curso); return null; }
        if (!(spec.leccion >= 1 && spec.leccion <= c.lecciones)) falla(contexto + ": " + spec.curso + " no tiene lección " + spec.leccion);
        return { material_tipo: "curso", material_slug: c.slug, material_label: c.titulo,
                 material_href: "cursos/academia/" + c.slug + ".html", filtro_clave: "", filtro_label: "",
                 leccion: String(spec.leccion), actividades: [], meta_tipo: "completar", meta_cantidad: null };
    }
    const h = Material.herramienta(spec.herramienta);
    if (!h || h.noSeElige) { falla(contexto + ": no se puede mandar «" + spec.herramienta + "»"); return null; }
    if (spec.cuestionario) {
        if (!LISTOS.some((q) => q.titulo === spec.cuestionario)) falla(contexto + ": no hay cuestionario listo «" + spec.cuestionario + "»");
        // El id lo pone la base al sembrar: el cuestionario listo vive allá.
        const marca = "@@cuestionario:" + spec.cuestionario + "@@";
        // La marca va SIN codificar también en el enlace: hrefRecorte(marca)
        // la escribe como %40%40…, el replace() del SQL no la encuentra y la
        // tarea abre un cuestionario que no existe. Un uuid no necesita
        // codificarse, así que el enlace queda igual a hrefRecorte(id).
        return { material_tipo: "herramienta", material_slug: h.slug, material_label: h.label,
                 material_href: h.hrefRecorte("") + marca, filtro_clave: marca, filtro_label: spec.cuestionario, leccion: "",
                 actividades: Material.actividadesDe(h, null), meta_tipo: "cantidad", meta_cantidad: 1 };
    }
    let recorte = null;
    if (spec.recorte) {
        recorte = ((metas[h.recortes] || [])).find((r) => r.clave === spec.recorte);
        if (!recorte) { falla(contexto + ": «" + h.slug + "» no tiene el recorte «" + spec.recorte + "»"); return null; }
        if (recorte.total && spec.cantidad > recorte.total) falla(contexto + ": se piden " + spec.cantidad + " de «" + recorte.label + "», que tiene " + recorte.total);
    }
    const meta = spec.meta || (h.metas.includes("cantidad") ? "cantidad" : h.metas[0]);
    if (!h.metas.includes(meta)) falla(contexto + ": «" + h.slug + "» no admite la meta «" + meta + "»");
    const actividades = meta === "completar" ? [] : Material.actividadesDe(h, recorte);
    if (meta !== "completar" && !actividades.length) falla(contexto + ": «" + h.slug + "» sin actividad que contar");
    return { material_tipo: "herramienta", material_slug: h.slug, material_label: h.label,
             material_href: recorte && h.hrefRecorte ? h.hrefRecorte(recorte.clave) : h.href,
             filtro_clave: recorte ? recorte.clave : "", filtro_label: recorte ? recorte.label : "", leccion: "",
             actividades, meta_tipo: meta, meta_cantidad: meta === "completar" ? null : spec.cantidad };
}

const tareas = [];
for (const g of proyecto.grupos) {
    for (const t of g.tareas) {
        const contexto = g.nombre + " semana " + t.semana;
        const items = t.items.map((x) => renglonDeTarea(x, contexto)).filter(Boolean);
        if (!items.length || items.length > 20) falla(contexto + ": " + items.length + " renglones");
        tareas.push({ grupo: g.slug, semana: t.semana, desde: t.desde, vence: t.vence, titulo: t.titulo,
                      instrucciones: t.instrucciones, items });
    }
}

// ------------------------------------------------- el guion de 2 horas
/* Cada clase dura 2 horas y va en cinco partes, en este orden: Calentamiento,
   Contenido, Actividad recreativa, Cierre y Tarea. El plan las trae tal cual,
   con sus minutos y su paso a paso, y los ejercicios van en el orden en que se
   dan: el profesor lo lee de arriba abajo en la clase en vivo y lo aplica.

   Cada parte es una nota «N. Parte · M min» con sus pasos numerados; debajo
   van sus ejercicios, y cada ejercicio trae en su propio renglón qué
   preguntar, cuánto tiempo dar, la respuesta y el porqué. Una nota no pasa
   de 2000 caracteres (lo exige la base): si no cabe, sigue en otra. */
const PARTES = [
    { clave: "calentamiento", emoji: "🔥", nombre: "Calentamiento" },
    { clave: "contenido", emoji: "📘", nombre: "Contenido" },
    { clave: "recreativa", emoji: "🎉", nombre: "Actividad recreativa" },
    { clave: "cierre", emoji: "✅", nombre: "Cierre" },
    { clave: "tarea", emoji: "📨", nombre: "Tarea" },
];
// Una clase normal y una de evaluación (o especial) reparten distinto las 2 horas.
const MINUTOS = {
    clase: { calentamiento: 15, contenido: 55, recreativa: 30, cierre: 12, tarea: 8 },
    otra: { calentamiento: 10, contenido: 70, recreativa: 25, cierre: 10, tarea: 5 },
};

/* El calentamiento: dos ejercicios del banco que todavía no se usaron en el
   proyecto, de un tema que cambia de clase en clase, según el nivel. */
const CALENTAMIENTO = {
    avanzado: ["pawnEndgame", "rookEndgame", "endgame", "advancedPawn", "zugzwang", "intermezzo", "deflection", "quietMove", "mateIn3"],
    intermedio: ["kingsideAttack", "sacrifice", "exposedKing", "defensiveMove", "attraction", "deflection", "mateIn2", "rookEndgame", "quietMove"],
    inicial: ["mateIn1", "hangingPiece", "fork", "pin", "mateIn2", "backRankMate", "pawnEndgame", "discoveredAttack", "clearance"],
};
const DESDE = { avanzado: 40, intermedio: 30, inicial: 12 };
const fenesUsadas = new Set();

function calentamientoDe(g, i, contexto) {
    const lista = CALENTAMIENTO[g.nivel];
    const tema = lista[i % lista.length];
    const salida = [];
    for (let desde = DESDE[g.nivel] + 2 * Math.floor(i / lista.length); salida.length < 2 && desde < 100; desde++) {
        const [r] = posicionesDe({ fuente: "tema", tema, n: 1, desde }, contexto);
        if (r && !fenesUsadas.has(r.fen)) { fenesUsadas.add(r.fen); salida.push(r); }
    }
    if (salida.length < 2) falla(contexto + ": no alcanzan los ejercicios de calentamiento de «" + tema + "»");
    return salida;
}

// El paso a paso de un ejercicio, en su renglón (la base deja 500 caracteres:
// lo que se recorta es el porqué, nunca la respuesta).
function pasoDelEjercicio(r, n, total, parte) {
    const p = r._paso || {};
    const titulo = recorta(parte + " · Ejercicio " + n + " de " + total + " · " + r.titulo, 200);
    const base = "① 📥 Al tablero. ② Pregunta: «" + p.q + "» ③ ⏳ " + p.min + " min; que contesten con ❓ ¿Qué jugarías? (o en el chat privado). " +
                 "④ Respuesta: " + p.respuesta + ".";
    const porque = p.porque ? " ⑤ Explica por qué: " + p.porque : "";
    const pregunta = (base + porque).length <= 500 ? base + porque : (base.length <= 497 ? recorta(base + porque, 500) : recorta(base, 500));
    return { tipo: "posicion", titulo, fen: r.fen, pregunta };
}

// Una nota de parte, partida si no cabe en 2000 caracteres.
function notasDeParte(titulo, pasos) {
    const salida = [];
    let actual = [];
    const largo = (xs) => xs.join("\n").length;
    for (const paso of pasos) {
        if (actual.length && largo(actual.concat(paso)) > 1990) { salida.push(actual); actual = []; }
        actual.push(paso.length > 1990 ? recorta(paso, 1990) : paso);
    }
    if (actual.length) salida.push(actual);
    return salida.map((xs, i) => ({ tipo: "nota", titulo: recorta(titulo + (i ? " (sigue)" : ""), 200), nota: xs.join("\n") }));
}

const oraciones = (t) => String(t || "").split(/(?<=[.?!])\s+(?=[A-ZÁÉÍÓÚÑ¿«])/).map((x) => x.trim()).filter(Boolean);
const numerar = (xs, desde) => xs.map((x, i) => (desde + i) + ". " + x);
const bloque = (d, re) => { const b = (d.bloques || []).find(([k]) => re.test(k)); return b ? b[1] : ""; };

/* La actividad recreativa, explicada paso a paso según lo que sea. Se
   reconoce por lo que dice la guía de la clase; lo que no se reconoce cae en
   una explicación general, y verificar-proyectos.js pide que ninguna caiga ahí. */
const RECREATIVAS = [
    [/Carrera Lucena/i, (t) => [
        "Manda al tablero la posición Lucena (está en el Contenido de hoy) y arma los equipos de colores.",
        "Explica la regla: un voluntario por equipo juega Lucena contra el motor (práctica contra el motor de la clase en vivo); su equipo le ayuda por el chat del equipo.",
        "Gana el equipo que corone en menos jugadas; si alguien se equivoca y el motor hace tablas, ese equipo queda último.",
        "Mientras juega cada voluntario, el resto de la clase sigue la partida y tú preguntas «¿y ahora qué jugarías?».",
        "Al final, repite en el tablero el puente bien construido y anuncia el podio."]],
    [/La clase juega|votando contra el profe|vota contra el profe|defiende .* votando|clase vota cada jugada/i, (t) => [
        "Prepara la posición: mándala al tablero desde el plan (o la que dice la actividad).",
        "Abre «🗳️ La clase juega» en las herramientas de la clase en vivo y elige contra quién: el motor o tú.",
        "Explica la regla: cada jugada se vota; gana la que más votos tenga en 30 segundos.",
        "Antes de cada votación, pide a un voluntario distinto que diga en voz alta qué candidata le gusta y por qué.",
        "Juega hasta el resultado (o 20 minutos). Si la clase logra el objetivo (coronar, hacer tablas, cazar al rey), celébralo con los puntos del mes.",
        "Últimos 5 minutos: comenta la jugada que decidió la partida."]],
    [/Kahoot|Cuestionario al estilo/i, (t) => [
        "Abre Cuestionarios en el panel y busca el cuestionario que dice la actividad (" + ((t.match(/«([^»]+)»(?!.*«)/) || [])[1] || "el de la unidad") + "). Si no lo encuentras, usa uno de los 30 listos del nivel del grupo.",
        "Dale «▶️ Jugarlo con la clase»: a los alumnos les aparece en su tablero de la clase en vivo.",
        "Explica la regla: puntos por acertar y por rapidez; después de cada pregunta sale el podio.",
        "Después de cada pregunta, 30 segundos para explicar la respuesta correcta (la trae el cuestionario).",
        "Al final, muestra el podio y súmalo a los puntos del mes."]],
    [/Ronda rápida/i, (t) => [
        "Abre «⚡ Ronda rápida» en las herramientas de la clase en vivo y elige el tema de la clase.",
        "Pon pocos segundos por posición (30 a 45) y 5 a 8 posiciones.",
        "Explica la regla: gana quien acierte más; la rapidez desempata.",
        "Corre la ronda; entre posición y posición, comenta en una frase la idea de la anterior.",
        "Muestra el podio al final y súmalo a los puntos del mes."]],
    [/Calentamiento.*competencia|Reto relámpago/i, (t) => [
        "Abre «🔥 Calentamiento» en la clase en vivo y elige el modo competencia (los mismos ejercicios para todos).",
        "Pon 5 minutos y el nivel del grupo.",
        "Explica la regla: gana quien resuelva más ejercicios bien en el tiempo.",
        "Al terminar, muestra el podio y repasa juntos el ejercicio que más se falló.",
        "Súmalo a los puntos del mes."]],
    [/Niebla de Guerra|Crazyhouse|Ajedrez de Cartas|Duelo Simultáneo|Ajedrez para 4/i, (t) => [
        "Pide a todos que abran Juegos en ajedrez-integral.com (juegos.html) y busquen la variante: " + (t.match(/(Niebla de Guerra|Crazyhouse|Ajedrez de Cartas|Duelo Simultáneo|Ajedrez para 4)/i) || [""])[0] + ".",
        "Explica la regla de la variante en 2 minutos con un ejemplo en el tablero de la clase.",
        "Arma las parejas (o los grupos de cuatro) y que se reten desde «Retar».",
        "Juegan rondas cortas; quien gana sube de mesa y quien pierde baja.",
        "Últimos 3 minutos: pregunta qué fue lo más divertido y qué idea de la clase usaron."]],
    [/Batalla naval|Sonar/i, (t) => [
        "Abre " + (/Sonar/i.test(t) ? "El Sonar (sonar.html)" : "Batalla naval (batalla-naval.html)") + " y comparte tu pantalla.",
        "Explica la regla del juego en 2 minutos.",
        "La clase vota cada jugada en el chat o con una pregunta de opciones; tú la haces.",
        "Cada tanto, pregunta por qué votaron esa jugada.",
        "Al terminar, invítalos a jugarlo en casa: va en la tarea de la semana."]],
    [/a ciegas|a la ciega/i, (t) => [
        "Abre la práctica «a ciegas» de la clase en vivo (el tablero no muestra las piezas).",
        "Arma parejas y explica: las jugadas se dicen o se escriben; no se ve el tablero.",
        "Empiecen desde una posición sencilla del calentamiento.",
        "Después de 10 jugadas, se muestra el tablero y cada pareja revisa si lo tenía bien en la cabeza.",
        "Repite con otra posición si sobra tiempo."]],
    [/Simultánea|contra el profe/i, (t) => [
        "Anuncia la simultánea: tú juegas contra todos a la vez.",
        "Que cada alumno te rete desde Juegos con un ritmo largo.",
        "Juega rotando de partida en partida; comenta en voz alta una idea de cada una.",
        "Quien te gane o haga tablas suma puntos del mes.",
        "Cierra mostrando la partida más bonita en el tablero de la clase."]],
    [/Habilidad «|maestro/i, (t) => [
        "Abre la pestaña Entrenamientos de la clase en vivo y busca la Habilidad que dice la actividad.",
        "Comparte la pantalla y arma los equipos.",
        "Cada equipo contesta por turnos; el vocero dice la respuesta y por qué.",
        "Lleva el puntaje y comenta las que se fallen.",
        "Muestra el podio de equipos al final."]],
    [/[Tt]orneo/i, (t) => [
        "Abre Torneos de la Academia (o el torneo del grupo en Lichess) y comparte el enlace en el chat.",
        "Explica el sistema y el ritmo: " + t,
        "Que se inscriban todos antes de empezar; quien organiza (rol rotativo) lo dirige.",
        "Durante el torneo, pasa por las partidas y anota un buen momento de cada mesa.",
        "Al final, anuncia el podio y comenta una partida."]],
    [/vota la minilección|podio de los puntos/i, (t) => [
        "Arma una pregunta de opciones en la clase en vivo con los nombres de quienes dieron su minilección hoy.",
        "Que voten la que más les sirvió (no la mejor: la que más les sirvió).",
        "Muestra el resultado y pide al ganador que diga qué le funcionó.",
        "Cierra con el podio de los puntos del mes."]],
    [/[Pp]artidas temáticas|[Pp]artidas rápidas/i, (t) => [
        "Manda al tablero la posición de partida (la última del Contenido) y que todos la vean.",
        "Arma parejas parejas en nivel y que se reten desde la práctica entre alumnos de la clase en vivo, empezando desde esa posición, con reloj (10 minutos cada uno).",
        "Al terminar la primera, cambian de color y juegan otra vez.",
        "Tú pasas de partida en partida (el profe puede mirar cada práctica) y anotas un buen momento de cada una.",
        "Muestra el podio y comenta en el tablero la jugada más instructiva que viste."]],
    [/desarrollo primero|la carrera|guerra de peones|rey que no deja pasar/i, (t) => [
        "Explica el juego en 2 minutos con un ejemplo en el tablero de la clase: " + t,
        "Arma parejas y que se reten desde Juegos (o en la práctica entre alumnos de la clase en vivo).",
        "Juegan rondas de 5 minutos; quien gana sube de mesa.",
        "Entre ronda y ronda, pregunta qué truco descubrieron.",
        "Muestra el podio al final: es un juego que pueden llevar tal cual a su taller."]],
    [/equipos de colores|Duelo de equipos|Equipos:|por equipos/i, (t) => [
        "Arma los equipos de colores en la clase en vivo (o usa los que ya tienen), parejos en nivel.",
        "Explica la regla: " + t,
        "Cada ronda la contesta el vocero del equipo (rol rotativo); los demás le ayudan por el chat de su equipo.",
        "Lleva el puntaje en voz alta después de cada ronda.",
        "Al final, el equipo ganador elige la posición del calentamiento de la próxima clase."]],
];

function pasosRecreativa(t) {
    const r = RECREATIVAS.find(([re]) => re.test(t));
    if (!r) return null;
    return ["Qué es: " + t].concat(numerar(r[1](t), 1));
}

const fechaLarga = (iso) => {
    const d = new Date(iso + "T12:00:00-06:00");
    return d.toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Costa_Rica" });
};

function pasosTarea(g, s, sig) {
    const t = tareas.find((x) => x.grupo === g.slug && x.desde <= s.fecha && s.fecha < x.vence);
    if (!t) { falla(g.nombre + " " + s.numero + ": no hay tarea para la semana de " + s.fecha); return []; }
    const pasos = [
        "Esta semana: «" + t.titulo + "» (del " + fechaLarga(t.desde) + " al " + fechaLarga(t.vence) + ").",
        "1. Preséntala: " + t.instrucciones,
        "2. Explica qué tiene que hacer cada uno:\n" + t.items.map((r) => "   • " + Material.frase(r)).join("\n"),
        "3. Muéstrales dónde la encuentran: en su panel, Tareas. Cada renglón se marca solo cuando entrenan en la plataforma.",
        "4. ¿Ya la mandaste? Si no: página del proyecto → Tareas semanales → «📨 Mandar a mis alumnos». Vence el " + fechaLarga(t.vence) + " a las 8:00 p. m.",
    ];
    if (sig) pasos.push("5. Anuncia la próxima clase: " + fechaLarga(sig.fecha) + ", «" + sig.titulo + "».");
    return pasos;
}

function armarPlanes() {
    for (const g of proyecto.grupos) {
        g.sesiones.forEach((s, i) => {
            const contexto = g.nombre + " " + s.numero;
            const d = s.detalle;
            const tipo = s.tipo === "clase" ? "clase" : "otra";
            const min = MINUTOS[tipo];
            const titulo = (k) => { const p = PARTES.find((x) => x.clave === k); return p.emoji + " " + (PARTES.indexOf(p) + 1) + ". " + p.nombre + " · " + min[k] + " min"; };
            const items = [];
            const lecciones = s.plan.lecciones.map((l) => renglonDeLeccion(l, contexto)).filter(Boolean);
            const ejercicios = [];
            for (const p of s.plan.posiciones) ejercicios.push(...posicionesDe(p, contexto).filter(Boolean));
            ejercicios.forEach((r) => fenesUsadas.add(r.fen));

            // 1. Calentamiento
            const calor = calentamientoDe(g, i, contexto);
            const indicacion = bloque(d, /^Calentamiento/);
            items.push(...notasDeParte(titulo("calentamiento"), [
                "Para qué: activar el cálculo antes del tema del día.",
                "1. Saluda y entra a la clase en vivo: la asistencia se registra sola.",
                "2. " + (indicacion || "Dos posiciones para calcular con la variante escrita completa antes de discutir."),
                "3. Da los " + calor.length + " ejercicios de abajo, en orden. En cada uno: 📥 Al tablero → lee la pregunta → ⏳ el tiempo → que contesten → revela la respuesta y explica el porqué (todo viene en el renglón).",
                "4. Si sobra tiempo: «🔥 Calentamiento» de la clase en vivo, 5 minutos, con el nivel del grupo."]));
            calor.forEach((r, k) => items.push(pasoDelEjercicio(r, k + 1, calor.length, "Calentamiento")));

            // 2. Contenido
            const pasosContenido = [];
            if (d.objetivo) pasosContenido.push("Objetivo de la clase: " + d.objetivo);
            let n = 1;
            if (d.objetivo) pasosContenido.push(n++ + ". Di el objetivo en voz alta y escríbelo en el chat.");
            if (tipo === "clase") {
                for (const l of lecciones) {
                    const texto = recorta((l._texto || []).filter((x) => !/·\s*\d+\s+posiciones/.test(x)).join(" "), 600);
                    pasosContenido.push(n++ + ". Explicación (" + (lecciones.length > 1 ? Math.round(15 / lecciones.length) + " min por lección" : "15 min") + "): explica con la lección «" + l._nombre + "» de " + l._curso + " (botón «📖 Abrir lección», abajo)." + (texto ? " Léela o cuéntala así: «" + texto + "»" : ""));
                }
                const ideas = oraciones(bloque(d, /^Contenido/));
                if (ideas.length) pasosContenido.push(n++ + ". Ideas que tienen que quedar:\n" + ideas.map((x) => "   • " + x).join("\n"));
                if (ejercicios.length) pasosContenido.push(n++ + ". Ejercicios guiados (15 min): los " + ejercicios.length + " de abajo, en orden, con la misma rutina del calentamiento. Después de cada respuesta, pregunta a alguien distinto por qué funciona.");
            } else {
                /* Los bloques venían con los minutos de la clase de 90 («10–55'»):
                   se reparten en proporción entre los minutos del Contenido. */
                const rango = (k) => { const m = k.match(/^(\d+)\s*[–-]\s*(\d+)'$/); return m ? Number(m[2]) - Number(m[1]) : 0; };
                const total = (d.bloques || []).reduce((t, [k]) => t + rango(k), 0);
                for (const [k, v] of d.bloques || []) {
                    const r = rango(k);
                    const etiqueta = r && total ? "Unos " + Math.max(5, Math.round(r * min.contenido / total / 5) * 5) + " min" : k.replace(/:$/, "");
                    pasosContenido.push(n++ + ". " + etiqueta + ": " + v);
                }
                for (const l of lecciones) pasosContenido.push(n++ + ". Apoyo: lección «" + l._nombre + "» de " + l._curso + " (botón «📖 Abrir lección», abajo).");
                if (ejercicios.length) pasosContenido.push(n++ + ". Las posiciones de abajo, en orden, con la misma rutina del calentamiento.");
            }
            items.push(...notasDeParte(titulo("contenido"), pasosContenido));
            items.push(...lecciones.map((l) => ({ tipo: "leccion", titulo: l.titulo, curso: l.curso, leccion: l.leccion })));
            ejercicios.forEach((r, k) => items.push(pasoDelEjercicio(r, k + 1, ejercicios.length, "Contenido")));
            if (tipo === "clase") {
                const practica = bloque(d, /^Práctica/), micro = bloque(d, /^Microenseñanza/);
                const sigue = [];
                if (practica) sigue.push(n++ + ". Práctica (15 min): " + practica);
                if (micro) sigue.push(n++ + ". Microenseñanza (10 min): " + micro + " Retroalimentación en dos pasos: primero un compañero dice qué funcionó y una sugerencia; después tú, con la rúbrica del anexo B.");
                if (sigue.length) items.push(...notasDeParte("📘 2. Contenido · práctica y microenseñanza", sigue));
            }

            // 3. Actividad recreativa
            const recreativa = pasosRecreativa(d.divertido);
            if (!recreativa) falla(contexto + ": la actividad recreativa no tiene su paso a paso («" + d.divertido + "»)");
            items.push(...notasDeParte(titulo("recreativa"), recreativa || ["Qué es: " + d.divertido]));

            // 4. Cierre
            const salida = (bloque(d, /pregunta de salida/i) || "").trim().replace(/[.\s]+$/, "");
            const cierre = [];
            let c = 1;
            cierre.push(c++ + ". Pregunta de salida: «" + (salida || "¿Qué fue lo más importante que aprendiste hoy?") + "». Ponla con «❓ Pregunta de salida» de la clase en vivo y que la contesten todos.");
            if (d.objetivo) cierre.push(c++ + ". Resume en voz alta lo que se trabajó: " + d.objetivo);
            if (d.taller) cierre.push(c++ + ". Para su taller: " + d.taller);
            cierre.push(c++ + ". Muestra el podio de la clase y felicita a quien más avanzó, sin comparar a nadie.");
            cierre.push(c++ + ". Termina la clase con «Terminar clase»: queda registrada con su asistencia.");
            items.push(...notasDeParte(titulo("cierre"), cierre));

            // 5. Tarea
            items.push(...notasDeParte(titulo("tarea"), pasosTarea(g, s, g.sesiones[i + 1])));

            if (d.sitio) items.push(nota("En ajedrez-integral.com", d.sitio));

            const numero = String(s.numero).padStart(2, "0");
            planes.push({
                grupo: g.slug, numero: s.numero,
                titulo: recorta(proyecto.nombre + " · " + g.nombre + " " + numero + " · " + s.titulo, 200),
                notas: recorta("Proyecto " + proyecto.nombre + ", grupo «" + g.nombre + "», clase " + s.numero + " (" + s.dia + "). " +
                               "Dura 2 horas: calentamiento, contenido, actividad recreativa, cierre y tarea, con su paso a paso en este plan.", 4000),
                minutos: min,
                items: items.map((it, k) => {
                    const limpio = Object.assign({ orden: k }, it);
                    delete limpio._paso; delete limpio._texto; delete limpio._nombre; delete limpio._curso;
                    return limpio;
                }),
            });
        });
    }
}
const planes = [];

armarPlanes();

if (errores.length) {
    console.error("No se sembró nada:\n  " + errores.join("\n  "));
    process.exit(1);
}

// ---------------------------------------------------------------------- SQL
/* Un texto largo va partido en trozos unidos con ||: el SQL dice lo mismo,
   pero ningún renglón pasa de unos cientos de caracteres. Así se puede leer,
   revisar y pegar por partes en el editor de Supabase sin que se corte. */
const TROZO = 700;
function esc(v) {
    if (v === null || v === undefined) return "NULL";
    // Por puntos de código y no por unidades de UTF-16: cortar un emoji por la
    // mitad dejaría dos mitades que al escribir el archivo se vuelven «�».
    const t = Array.from(String(v));
    if (t.length <= TROZO) return "'" + t.join("").replace(/'/g, "''") + "'";
    const partes = [];
    for (let i = 0; i < t.length; i += TROZO) partes.push("'" + t.slice(i, i + TROZO).join("").replace(/'/g, "''") + "'");
    return "(" + partes.join(" ||\n  ") + ")";
}
const jsonb = (o) => esc(JSON.stringify(o)) + "::jsonb";

/* Los renglones de cuestionario llevan la marca @@cuestionario:Título@@ donde
   va el id: se reemplaza con el del cuestionario listo de la base. Si no
   existe, replace() da NULL y la fila no entra (items es NOT NULL): el SQL
   entero se cae en vez de dejar una tarea que no abre nada. */
function itemsSQL(items) {
    let expr = esc(JSON.stringify(items));
    const titulos = [...new Set(JSON.stringify(items).match(/@@cuestionario:[^@]+@@/g) || [])];
    for (const m of titulos) {
        const titulo = m.slice("@@cuestionario:".length, -2);
        expr = "replace(" + expr + ", " + esc(m) + ", (select q.id::text from public.cuestionarios q where q.listo and q.titulo = " + esc(titulo) + " limit 1))";
    }
    return "(" + expr + ")::jsonb";
}

/* Lo que la página del proyecto lee de la sesión. Los bloques de la guía
   (los de 90 minutos) no van: el paso a paso de las 2 horas vive en el plan
   de la sesión, que es lo que lee la página y lo que se da en la clase en
   vivo. Una sola copia. */
function detalleDeSesion(s, pl) {
    const d = s.detalle;
    const salida = { dia: s.dia, minutos: pl.minutos, objetivo: d.objetivo || "", divertido: d.divertido, sitio: d.sitio };
    if (d.taller) salida.taller = d.taller;
    return salida;
}

function aSQL() {
    const out = [];
    const P = esc(proyecto.slug);
    const grupoDe = (slug) => "(select g.id from public.proyecto_grupos g join public.proyectos p on p.id = g.proyecto_id where p.slug = " + P + " and g.slug = " + esc(slug) + ")";
    const grupos = "(select g.id from public.proyecto_grupos g join public.proyectos p on p.id = g.proyecto_id where p.slug = " + P + ")";
    out.push("-- Proyecto «" + proyecto.nombre + "». Generado por herramientas/proyecto-semilla.js; no se edita a mano.");
    out.push("-- Se puede correr las veces que haga falta: vuelve a sembrar el contenido y respeta las asignaciones.");
    out.push("begin;");
    out.push("insert into public.proyectos (slug, nombre, descripcion, periodo) values (" + [P, esc(proyecto.nombre), esc(proyecto.descripcion), esc(proyecto.periodo)].join(", ") + ")");
    out.push("  on conflict (slug) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, periodo = excluded.periodo;");
    for (const g of proyecto.grupos) {
        out.push("insert into public.proyecto_grupos (proyecto_id, slug, nombre, nivel, horario, orden, guia) select p.id, " +
                 [esc(g.slug), esc(g.nombre), esc(g.nivel), esc(g.horario), g.orden, jsonb(g.guia)].join(", ") +
                 " from public.proyectos p where p.slug = " + P);
        out.push("  on conflict (proyecto_id, slug) do update set nombre = excluded.nombre, nivel = excluded.nivel, horario = excluded.horario, orden = excluded.orden, guia = excluded.guia;");
    }
    // Lo sembrado antes se borra entero: los planes (con sus renglones y lo
    // compartido, en cascada), las sesiones y las tareas.
    out.push("delete from public.planes_clase where id in (select s.plan_id from public.proyecto_sesiones s where s.grupo_id in " + grupos + " and s.plan_id is not null);");
    out.push("delete from public.proyecto_sesiones where grupo_id in " + grupos + ";");
    out.push("delete from public.proyecto_tareas where grupo_id in " + grupos + ";");

    planes.forEach((pl, i) => {
        const g = proyecto.grupos.find((x) => x.slug === pl.grupo);
        const s = g.sesiones.find((x) => x.numero === pl.numero);
        const v = "pl" + i;
        out.push("with " + v + " as (insert into public.planes_clase (profesor_id, titulo, notas) values (" +
                 esc(PROFESOR_ID) + ", " + esc(pl.titulo) + ", " + esc(pl.notas) + ") returning id),");
        out.push("  it" + i + " as (insert into public.plan_items (plan_id, orden, tipo, titulo, fen, pregunta, curso, leccion, nota)");
        out.push("    select " + v + ".id, x.orden, x.tipo, x.titulo, x.fen, x.pregunta, x.curso, x.leccion::integer, x.nota from " + v + ", (values");
        out.push(pl.items.map((it) => "      (" + it.orden + ", " + esc(it.tipo) + ", " + esc(it.titulo) + ", " + esc(it.fen || null) + ", " +
                 esc(it.pregunta || null) + ", " + esc(it.curso || null) + ", " + (it.leccion === undefined || it.leccion === null ? "NULL" : String(it.leccion)) + ", " + esc(it.nota || null) + ")").join(",\n"));
        out.push("    ) as x(orden, tipo, titulo, fen, pregunta, curso, leccion, nota) returning 1)");
        out.push("insert into public.proyecto_sesiones (grupo_id, numero, fecha, titulo, tipo, detalle, plan_id) select " +
                 grupoDe(g.slug) + ", " + s.numero + ", " + esc(s.fecha) + ", " + esc(s.titulo) + ", " + esc(s.tipo) + ", " +
                 jsonb(detalleDeSesion(s, pl)) + ", " + v + ".id from " + v + ";");
    });

    tareas.forEach((t) => {
        out.push("insert into public.proyecto_tareas (grupo_id, semana, desde, vence, titulo, instrucciones, items) values (" +
                 [grupoDe(t.grupo), t.semana, esc(t.desde), esc(t.vence), esc(t.titulo), esc(t.instrucciones), itemsSQL(t.items)].join(", ") + ");");
    });

    // A quien ya tenía el grupo asignado se le vuelven a compartir los planes
    // nuevos (los viejos se fueron con su compartido en cascada).
    out.push("insert into public.plan_compartidos (plan_id, profesor_id)");
    out.push("  select s.plan_id, g.profesor_id from public.proyecto_sesiones s join public.proyecto_grupos g on g.id = s.grupo_id");
    out.push("   where g.id in " + grupos + " and g.profesor_id is not null and s.plan_id is not null");
    out.push("  on conflict do nothing;");
    out.push("commit;");
    return out.join("\n");
}

/* Cuando el proyecto ya está sembrado, esto lo actualiza SIN cambiar de id
   los planes ni las sesiones: cambia la guía de cada grupo, el detalle de cada
   sesión y los renglones de su plan. Así sigue valiendo todo lo que apunta a
   ellos (lo compartido con el profesor, un enlace a planes.html?plan=…). */
function aSQLActualizar() {
    const out = [];
    const P = esc(proyecto.slug);
    const grupoDe = (slug) => "(select g.id from public.proyecto_grupos g join public.proyectos p on p.id = g.proyecto_id where p.slug = " + P + " and g.slug = " + esc(slug) + ")";
    out.push("-- Proyecto «" + proyecto.nombre + "»: actualiza guías, sesiones y planes sin cambiarles el id. Generado por herramientas/proyecto-semilla.js.");
    out.push("begin;");
    for (const g of proyecto.grupos) {
        out.push("update public.proyecto_grupos set guia = " + jsonb(g.guia) + " where id = " + grupoDe(g.slug) + ";");
    }
    planes.forEach((pl) => {
        const g = proyecto.grupos.find((x) => x.slug === pl.grupo);
        const s = g.sesiones.find((x) => x.numero === pl.numero);
        const ses = "(select s.plan_id from public.proyecto_sesiones s where s.grupo_id = " + grupoDe(g.slug) + " and s.numero = " + s.numero + ")";
        out.push("update public.proyecto_sesiones set detalle = " + jsonb(detalleDeSesion(s, pl)) + " where grupo_id = " + grupoDe(g.slug) + " and numero = " + s.numero + ";");
        out.push("update public.planes_clase set notas = " + esc(pl.notas) + " where id = " + ses + ";");
        out.push("delete from public.plan_items where plan_id = " + ses + ";");
        out.push("insert into public.plan_items (plan_id, orden, tipo, titulo, fen, pregunta, curso, leccion, nota)");
        out.push("  select " + ses + ", x.orden, x.tipo, x.titulo, x.fen, x.pregunta, x.curso, x.leccion::integer, x.nota from (values");
        out.push(pl.items.map((it) => "      (" + it.orden + ", " + esc(it.tipo) + ", " + esc(it.titulo) + ", " + esc(it.fen || null) + ", " +
                 esc(it.pregunta || null) + ", " + esc(it.curso || null) + ", " + (it.leccion === undefined || it.leccion === null ? "NULL" : String(it.leccion)) + ", " + esc(it.nota || null) + ")").join(",\n"));
        out.push("    ) as x(orden, tipo, titulo, fen, pregunta, curso, leccion, nota);");
    });
    out.push("commit;");
    return out.join("\n");
}

const salida = path.join(__dirname, "planes");
fs.mkdirSync(salida, { recursive: true });
fs.writeFileSync(path.join(salida, "proyecto-" + SLUG + ".json"),
    JSON.stringify({ profesor_id: PROFESOR_ID, proyecto: SLUG, planes, tareas }, null, 2));
fs.writeFileSync(path.join(salida, "proyecto-" + SLUG + ".sql"), aSQL());
fs.writeFileSync(path.join(salida, "proyecto-" + SLUG + "-actualizar.sql"), aSQLActualizar());

if (process.argv.includes("--sql")) { console.log(aSQL()); process.exit(0); }
const posiciones = planes.reduce((n, p) => n + p.items.filter((i) => i.tipo === "posicion").length, 0);
const lecc = planes.reduce((n, p) => n + p.items.filter((i) => i.tipo === "leccion").length, 0);
console.log(proyecto.nombre + ": " + proyecto.grupos.length + " grupos · " + planes.length + " planes · " +
            posiciones + " posiciones · " + lecc + " lecciones · " + tareas.length + " tareas semanales");
console.log(contador.descartadas + " posiciones descartadas por la regla de la clase en vivo");
console.log("Escritos: herramientas/planes/proyecto-" + SLUG + ".json, .sql (sembrar de cero) y -actualizar.sql (sin cambiar ids)");
