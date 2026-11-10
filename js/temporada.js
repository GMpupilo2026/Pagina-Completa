/* El plan de temporada: etapas hasta una competencia, cada una con su énfasis.
 *
 * Es la planificación por etapas de la escuela cubana (macrociclo,
 * mesociclos): de hoy a la competencia, el trabajo pasa por etapas, y cada una
 * reparte el tiempo entre las direcciones del entrenamiento de otra manera.
 * Ver «El plan de temporada» en docs/decisiones/seguimiento-del-alumno.md.
 *
 * Este archivo es puro: no toca la página ni la base, así que se prueba sin
 * navegador (herramientas/verificar-temporada.js). La página
 * (js/temporada-pagina.js) pide los datos y pinta.
 *
 * Una etapa es { nombre, desde, hasta, enfasis: { <dirección>: <porcentaje> }, nota }.
 * Las fechas son días de calendario de Costa Rica, «2026-11-10», y se cuentan
 * en UTC por sus partes: un día no se lee con new Date("AAAA-MM-DD").
 */
window.Temporada = (function () {
    const MAX_ETAPAS = 12;
    const SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;

    function numeroDeDia(d) {
        if (!SOLO_DIA.test(String(d || ""))) return NaN;
        const [y, m, dd] = String(d).split("-").map(Number);
        const t = Date.UTC(y, m - 1, dd);
        // «2026-02-31» no es un día: Date.UTC lo corre al 3 de marzo.
        return new Date(t).toISOString().slice(0, 10) === d ? t / 864e5 : NaN;   // calendario en UTC
    }
    function diaDeNumero(n) {
        return new Date(n * 864e5).toISOString().slice(0, 10);   // calendario en UTC
    }
    /* Días de `a` a `b`, contando los dos: del 1 al 7 son 7. */
    function diasEntre(a, b) {
        return numeroDeDia(b) - numeroDeDia(a) + 1;
    }

    /* Las cuatro etapas de la planificación cubana, con un énfasis para
       empezar. Los porcentajes NO salen de una fuente: son una propuesta que
       el profesor cambia, y la página lo dice. Lo que sí sale de la fuente es
       la forma: de lo general a lo específico, y cerca de la competencia más
       partidas, más aperturas propias y más análisis. */
    const PLANTILLA = [
        { nombre: "Preparación general", parte: 0.45,
          enfasis: { "ejercicios": 30, "medio-juego": 20, "finales": 20, "aperturas": 10, "analisis": 10, "partidas": 10 },
          nota: "Bases: táctica, finales y medio juego. Pocas aperturas." },
        { nombre: "Preparación específica", parte: 0.35,
          enfasis: { "aperturas": 25, "ejercicios": 25, "finales": 15, "medio-juego": 15, "analisis": 10, "partidas": 10 },
          nota: "El repertorio que se va a jugar y los finales que salen de él." },
        { nombre: "Precompetitiva", parte: null,
          enfasis: { "aperturas": 30, "ejercicios": 25, "partidas": 25, "analisis": 20 },
          nota: "Partidas con reloj y análisis de cada una." },
        { nombre: "Competitiva", parte: null, dias: 7,
          enfasis: { "aperturas": 30, "ejercicios": 30, "partidas": 20, "analisis": 20 },
          nota: "La semana de la competencia: repasar, no aprender cosas nuevas." },
    ];
    const MIN_DIAS = 14;

    /* Las etapas propuestas de `inicio` a `competencia` (incluida). La
       competitiva es la última semana; las demás se reparten lo anterior. Con
       menos de cuatro semanas no hay lugar para la preparación general: quedan
       la específica y la competitiva. Devuelve [] si no alcanzan los días. */
    function proponer(inicio, competencia) {
        const total = diasEntre(inicio, competencia);
        if (!(total >= MIN_DIAS)) return [];
        const a = numeroDeDia(inicio), fin = numeroDeDia(competencia);
        const copia = (p, desde, hasta) => ({ nombre: p.nombre, desde: diaDeNumero(desde), hasta: diaDeNumero(hasta),
                                             enfasis: Object.assign({}, p.enfasis), nota: p.nota });
        const competitiva = PLANTILLA[3];
        const iniComp = fin - competitiva.dias + 1;
        if (total < 28) {
            return [copia(PLANTILLA[1], a, iniComp - 1), copia(competitiva, iniComp, fin)];
        }
        const antes = iniComp - a;                       // días antes de la competitiva
        const general = Math.round(antes * PLANTILLA[0].parte / (PLANTILLA[0].parte + PLANTILLA[1].parte + 0.2));
        const especifica = Math.round(antes * PLANTILLA[1].parte / (PLANTILLA[0].parte + PLANTILLA[1].parte + 0.2));
        return [
            copia(PLANTILLA[0], a, a + general - 1),
            copia(PLANTILLA[1], a + general, a + general + especifica - 1),
            copia(PLANTILLA[2], a + general + especifica, iniComp - 1),
            copia(competitiva, iniComp, fin),
        ];
    }

    /* Lo que está mal en las etapas, en palabras, para decirlo antes de
       guardar. [] si están bien. `direcciones` son las claves válidas (las de
       DireccionesEntrenamiento.DIRECCIONES). */
    function problemas(etapas, competencia, direcciones) {
        const p = [];
        const validas = new Set(direcciones || []);
        if (!Array.isArray(etapas) || !etapas.length) return ["La temporada necesita al menos una etapa."];
        if (etapas.length > MAX_ETAPAS) p.push(`Son ${etapas.length} etapas; el máximo es ${MAX_ETAPAS}.`);
        etapas.forEach((e, i) => {
            const n = `La etapa ${i + 1}${e && e.nombre ? " («" + e.nombre + "»)" : ""}`;
            if (!e || !String(e.nombre || "").trim()) p.push(`La etapa ${i + 1} no tiene nombre.`);
            if (isNaN(numeroDeDia(e.desde)) || isNaN(numeroDeDia(e.hasta))) { p.push(`${n} no tiene sus dos fechas.`); return; }
            if (numeroDeDia(e.hasta) < numeroDeDia(e.desde)) p.push(`${n} termina antes de empezar.`);
            if (i > 0 && etapas[i - 1] && numeroDeDia(e.desde) <= numeroDeDia(etapas[i - 1].hasta)) {
                p.push(`${n} empieza antes de que termine la anterior.`);
            }
            const enf = (e && e.enfasis) || {};
            const malas = Object.keys(enf).filter((k) => !validas.has(k));
            if (malas.length) p.push(`${n} tiene una dirección que no existe: ${malas.join(", ")}.`);
            const valores = Object.values(enf).map(Number);
            if (valores.some((v) => !Number.isInteger(v) || v < 0 || v > 100)) p.push(`${n}: cada porcentaje va de 0 a 100, sin decimales.`);
            const suma = valores.reduce((s, v) => s + (Number(v) || 0), 0);
            if (suma !== 100) p.push(`${n}: los porcentajes suman ${suma} y tienen que sumar 100.`);
        });
        const ultima = etapas[etapas.length - 1];
        if (competencia && ultima && numeroDeDia(ultima.hasta) > numeroDeDia(competencia)) {
            p.push("La última etapa termina después de la competencia.");
        }
        return p;
    }

    /* La etapa en la que cae `hoy` y cuántos días le quedan; o, si todavía no
       empezó o ya terminó, cuál viene o que terminó. */
    function situacion(etapas, competencia, hoy) {
        const h = numeroDeDia(hoy);
        const lista = Array.isArray(etapas) ? etapas : [];
        const faltan = numeroDeDia(competencia) - h;
        const i = lista.findIndex((e) => numeroDeDia(e.desde) <= h && h <= numeroDeDia(e.hasta));
        if (i >= 0) {
            return { estado: "en-curso", indice: i, etapa: lista[i], quedanEnEtapa: numeroDeDia(lista[i].hasta) - h, faltanCompetencia: faltan };
        }
        const proxima = lista.findIndex((e) => numeroDeDia(e.desde) > h);
        if (proxima >= 0) return { estado: proxima === 0 ? "por-empezar" : "entre-etapas", indice: proxima, etapa: lista[proxima], faltanCompetencia: faltan };
        return { estado: faltan >= 0 ? "entre-etapas" : "terminada", indice: -1, etapa: null, faltanCompetencia: faltan };
    }

    /* Objetivo contra lo hecho, dirección por dirección. `reparto` es el de
       DireccionesEntrenamiento.reparto() sobre el tiempo de la etapa. El
       veredicto va en palabras («por debajo»), no solo en un color. Con menos
       de una hora repartida no se juzga: tres ejercicios no son un reparto. */
    const TOLERANCIA = 10;           // puntos de porcentaje
    const MINUTOS_PARA_JUZGAR = 60;
    function comparar(enfasis, reparto, nombres) {
        const real = {};
        ((reparto && reparto.direcciones) || []).forEach((d) => { real[d.clave] = d.pct; });
        const juzgar = ((reparto && reparto.repartido) || 0) >= MINUTOS_PARA_JUZGAR;
        const claves = Object.keys(enfasis || {}).filter((k) => Number(enfasis[k]) > 0);
        // Lo que hizo sin estar en el plan también se dice: si no, no se ve.
        Object.keys(real).forEach((k) => { if (!claves.includes(k) && real[k] > 0) claves.push(k); });
        const orden = Object.keys(nombres || {});
        claves.sort((a, b) => (orden.indexOf(a) - orden.indexOf(b)));
        return {
            juzgar,
            filas: claves.map((k) => {
                const objetivo = Number(enfasis[k]) || 0;
                const hecho = real[k] || 0;
                const dif = hecho - objetivo;
                const veredicto = !juzgar ? "" : dif < -TOLERANCIA ? "por debajo" : dif > TOLERANCIA ? "por encima" : "en línea";
                return { clave: k, nombre: (nombres || {})[k] || k, objetivo, hecho, veredicto };
            }),
        };
    }

    return { MAX_ETAPAS, MIN_DIAS, PLANTILLA, TOLERANCIA, MINUTOS_PARA_JUZGAR,
             numeroDeDia, diaDeNumero, diasEntre, proponer, problemas, situacion, comparar };
})();

/*! rev bfb5bbb0d2d82f9f */
