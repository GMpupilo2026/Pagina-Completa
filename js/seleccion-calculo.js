/* El cálculo de la selección CODICADER (y de cualquier selección por
   parámetros) a partir de los torneos de chess-results.

   Lo usa seleccion-codicader.html y lo prueba, sin navegador,
   herramientas/verificar-seleccion-calculo.js. No toca la página ni la red:
   recibe los torneos ya leídos (los lee la Edge Function
   seleccion-chess-results) y devuelve las tablas y los avisos.

   EL MÉTODO ES EL DEL ICODER («Procedimientos para la designación y
   conformación de la delegación CODICADER 2026», ajedrez). Cuatro parámetros
   por estudiante, cada uno de 20 a 1 puntos, y la suma decide:
   - A, posición en la Etapa Nacional: 1.º 20, 2.º 18, 3.º 16 … 10.º 2, 11.º y
     12.º 1. En equipos, cada integrante recibe el lugar de su equipo si jugó
     al menos el 40 % de las rondas disputadas (las ganadas por ausencia no
     cuentan). Se promedian los ritmos (clásico y blitz).
   - B, rendimiento: Ps = (puntos ÷ partidas jugadas) × Elo nacional promedio
     de los rivales, solo partidas jugadas sobre el tablero y con al menos 3.
     Se ordena y se reparten 20 … 1 con prorrateo; promedio de los ritmos.
   - C, ranking nacional (Elo FCA; sin Elo cuenta 1400), 20 … 1 con prorrateo.
   - D, ranking FIDE de cada ritmo (sin Elo, 1400), 20 … 1 con prorrateo y
     promedio de los ritmos.
   Empate en la suma: gana el mejor C; si sigue, quien tenga menos edad.

   LO QUE EL PROCEDIMIENTO NO DICE Y ACÁ SE DECIDIÓ (cada cosa se puede
   cambiar en `opciones`):
   - Las escalas de B, C y D se reparten dentro de cada rama y solo entre
     quienes pueden ir (año de nacimiento en el rango). Con la selección
     colegial 2026 da los mismos cinco y cinco que repartirlas entre todos.
   - El rival sin Elo nacional cuenta 1400 en el promedio de B, igual que en C.
   - Las mujeres que juegan en un torneo absoluto se calculan SOLO en la rama
     femenina (lo pidió el dueño del sitio). chess-results no dice el sexo:
     es mujer quien jugó algún torneo femenino de la selección o a quien el
     árbitro marcó a mano; los nombres que parecen de mujer en un absoluto
     salen en los avisos para que lo revise.
   - Quien juega una final de otra categoría (la final B en la selección de la
     C) entra si cumple la edad: se cargan sus torneos en la misma selección y
     su A es su lugar en esa final.

   Ver «Herramientas de arbitraje» en docs/decisiones/juegos-y-torneos.md. */
(function (raiz) {
    "use strict";

    const ESCALA_A = [20, 18, 16, 14, 12, 10, 8, 6, 4, 2, 1, 1];
    const OPCIONES = {
        anioDesde: 2009,
        anioHasta: 2011,
        cupos: { M: 5, F: 5 },
        suplentes: 3,
        sinElo: 1400,
        minPartidasB: 3,
        porcentajeEquipo: 40,
        escalaA: ESCALA_A,
        ajustes: {},          // { clave: { sexo: "F"|"M", nacimiento: 2010 } }
    };

    const RITMOS = { clasico: "Clásico", rapido: "Rápido", blitz: "Blitz" };

    function redondear2(x) { return Math.round((x + 1e-9) * 100) / 100; }

    // «García Morales, Brainer» y «Garcia  Morales Brainer» son la misma persona.
    function normalizar(nombre) {
        return String(nombre || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
            .toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").trim();
    }

    // Lo que dice chess-results en «Res.»: 1, 0 y ½ son partidas jugadas; «- 1K»,
    // «+», «-» son por ausencia y «- 1» / «- ½» un bye. Sin resultado, la
    // ronda todavía no terminó.
    function puntosDe(res) {
        const r = String(res || "").replace(/\s+/g, "");
        if (r === "1") return 1;
        if (r === "0") return 0;
        if (r === "½" || r === "0,5" || r === "0.5" || r === "1/2" || r === "=") return 0.5;
        return null;
    }
    function esAusencia(res) { return /K|^\+$|^-$/.test(String(res || "").replace(/\s+/g, "")); }

    // Quién es mujer por el nombre de pila: solo para AVISAR, nunca para decidir.
    const NOMBRES_MUJER = new Set(["isabel", "raquel", "ruth", "abigail", "mariel", "nicole", "michelle", "joselyn",
        "yoselin", "jocelyn", "lissy", "lexy", "nayareth", "ester", "esther", "ingrid", "karen", "carmen", "rocio",
        "beatriz", "mercedes", "belen", "dayan", "kimberly", "ashley", "allison", "evelyn", "jazmin", "monserrat",
        "naomi", "abril", "noemi", "maribel", "sharon", "keilyn", "keylin", "britany", "brittany", "yuliana", "dulce",
        "luz", "sol", "flor", "pilar", "nahomy", "dariana", "francini", "valery", "sofi", "nathaly", "nataly"]);
    const NOMBRES_HOMBRE_EN_A = new Set(["luca", "nicola", "joshua", "elia", "jeshua", "garcia", "bautista", "josue"]);
    function pareceMujer(nombre) {
        const partes = String(nombre || "").split(",");
        const pila = normalizar(partes.length > 1 ? partes[1] : partes[0]).split(" ")[0] || "";
        if (!pila) return false;
        if (NOMBRES_MUJER.has(pila)) return true;
        if (NOMBRES_HOMBRE_EN_A.has(pila)) return false;
        return /a$|lyn$|elin$|eth$|ith$/.test(pila);
    }

    // Lo que el título de chess-results deja adivinar de un torneo. El árbitro lo
    // revisa y lo cambia en la página.
    function adivinarTorneo(titulo) {
        const t = normalizar(titulo);
        const categoria = (t.match(/(?:^| )(?:categoria )?([a-e])(?: |$)(?=.*(?:individual|equipos|femenino|absoluto|blitz|clasico|rapido))/) || [])[1];
        return {
            rama: /femenin|mujeres|damas/.test(t) ? "F" : "A",
            ritmo: /blitz|relampago/.test(t) ? "blitz" : /rapid/.test(t) ? "rapido" : "clasico",
            categoria: categoria ? categoria.toUpperCase() : "",
        };
    }

    // Reparte 20, 19 … 1 de mayor a menor. Empatados: el promedio de los puntos
    // de los lugares que ocupan, con dos decimales (el ejemplo del ICODER: tres
    // con 2000 reciben 19 cada uno; dos con 1900, 16,5; el de 1855, 15).
    function prorratear(valores) {
        const fuera = new Map();
        const conValor = valores.filter((v) => v.valor != null && isFinite(v.valor));
        valores.forEach((v) => fuera.set(v.clave, 0));
        conValor.sort((a, b) => b.valor - a.valor);
        let i = 0;
        while (i < conValor.length) {
            let j = i;
            while (j < conValor.length && conValor[j].valor === conValor[i].valor) j++;
            let suma = 0;
            for (let k = i; k < j; k++) suma += Math.max(20 - k, 0);
            const pts = redondear2(suma / (j - i));
            for (let k = i; k < j; k++) fuera.set(conValor[k].clave, pts);
            i = j;
        }
        return fuera;
    }

    // Un código de verdad: chess-results pone «0» (o nada) cuando no hay.
    function codigo(x) { const t = String(x == null ? "" : x).trim(); return /^[1-9]\d*$/.test(t) ? t : ""; }

    // Une a la misma persona entre torneos: por código FIDE, por código nacional
    // o por el nombre. Un código en un torneo y otro no, igual se une por nombre.
    function agrupar(entradas) {
        const padre = entradas.map((_, i) => i);
        const raizDe = (i) => (padre[i] === i ? i : (padre[i] = raizDe(padre[i])));
        const unir = (a, b) => { a = raizDe(a); b = raizDe(b); if (a !== b) padre[b] = a; };
        const visto = {};
        entradas.forEach((e, i) => {
            const claves = [];
            if (codigo(e.jugador.fideId)) claves.push("f:" + codigo(e.jugador.fideId));
            if (codigo(e.jugador.codigoNacional)) claves.push("n:" + codigo(e.jugador.codigoNacional));
            claves.push("o:" + normalizar(e.jugador.nombre));
            claves.forEach((c) => { if (visto[c] == null) visto[c] = i; else unir(visto[c], i); });
        });
        const grupos = new Map();
        entradas.forEach((e, i) => {
            const r = raizDe(i);
            if (!grupos.has(r)) grupos.set(r, []);
            grupos.get(r).push(e);
        });
        return [...grupos.values()];
    }

    function claveDe(grupo) {
        const conFide = grupo.find((e) => codigo(e.jugador.fideId));
        if (conFide) return "f:" + codigo(conFide.jugador.fideId);
        const conNac = grupo.find((e) => codigo(e.jugador.codigoNacional));
        if (conNac) return "n:" + codigo(conNac.jugador.codigoNacional);
        return "o:" + normalizar(grupo[0].jugador.nombre);
    }

    // Lo de un jugador en un torneo: puntos, partidas, rendimiento y su A.
    function medirEntrada(torneo, jugador, eloDe, op, avisos) {
        const jugadas = [];
        let ausenciasGanadas = 0;
        let rivalesSinEncontrar = 0;
        (jugador.partidas || []).forEach((p) => {
            const pts = puntosDe(p.res);
            if (pts == null) { if (esAusencia(p.res) && /1/.test(p.res)) ausenciasGanadas++; return; }
            const clave = normalizar(p.rival);
            let elo = eloDe.get(clave);
            if (elo === undefined) { rivalesSinEncontrar++; elo = 0; }
            jugadas.push({ pts, elo: elo > 0 ? elo : op.sinElo });
        });
        if (rivalesSinEncontrar) {
            avisos.push({ tipo: "revisar", motivo: "rival", clave: null, nombre: jugador.nombre,
                texto: `${rivalesSinEncontrar} rival(es) de ${jugador.nombre} en «${torneo.titulo}» no están en la lista de jugadores del torneo: se tomaron como sin Elo (${op.sinElo}).` });
        }
        const pj = jugadas.length;
        const pr = jugadas.reduce((s, j) => s + j.pts, 0);
        const ra = pj ? redondear2(jugadas.reduce((s, j) => s + j.elo, 0) / pj) : 0;
        const ps = pj >= op.minPartidasB ? redondear2((pr / pj) * ra) : null;

        let puesto = null;
        let a = 0;
        let sinMinimo = false;
        const lugar = (nombre) => {
            const fila = (torneo.clasificacion || []).find((f) => normalizar(f.nombre) === normalizar(nombre));
            return fila ? Number(fila.puesto) || null : null;
        };
        if (torneo.equipos) {
            puesto = jugador.equipo ? lugar(jugador.equipo) : null;
            const rondas = Number(torneo.rondasJugadas) || Math.max(0, ...(jugador.partidas || []).map((p) => Number(p.ronda) || 0));
            const minimo = (op.porcentajeEquipo / 100) * rondas;
            sinMinimo = pj < minimo;
            a = puesto && !sinMinimo ? (op.escalaA[puesto - 1] || 0) : 0;
        } else {
            puesto = lugar(jugador.nombre);
            a = puesto ? (op.escalaA[puesto - 1] || 0) : 0;
        }
        return { torneo: torneo.titulo, torneoId: torneo.id, equipos: !!torneo.equipos, equipo: jugador.equipo || "",
            puesto, a, sinMinimo, pr, pj, ra, ps, ausenciasGanadas,
            eloNacional: Number(jugador.eloNacional) || 0, eloFide: Number(jugador.eloFide) || 0 };
    }

    /* torneos: [{ id, titulo, rama: "F"|"A", ritmo, categoria, equipos, rondasJugadas,
                   clasificacion: [{ puesto, nombre }], jugadores: [{ nombre, fideId,
                   codigoNacional, eloNacional, eloFide, nacimiento, club, equipo,
                   partidas: [{ ronda, rival, res }] }] }]
       → { ritmos, ramas: { M: [...], F: [...] }, noElegibles, avisos } */
    function calcular(torneos, opciones) {
        const op = Object.assign({}, OPCIONES, opciones || {});
        op.cupos = Object.assign({}, OPCIONES.cupos, (opciones || {}).cupos);
        const ajustes = op.ajustes || {};
        const avisos = [];
        const ritmos = [...new Set(torneos.map((t) => t.ritmo))].sort((a, b) =>
            Object.keys(RITMOS).indexOf(a) - Object.keys(RITMOS).indexOf(b));

        const entradas = [];
        torneos.forEach((t) => {
            const eloDe = new Map();
            (t.jugadores || []).forEach((j) => eloDe.set(normalizar(j.nombre), Number(j.eloNacional) || 0));
            (t.jugadores || []).forEach((j) => {
                entradas.push({ torneo: t, jugador: j, medida: medirEntrada(t, j, eloDe, op, avisos) });
            });
        });

        const personas = agrupar(entradas).map((grupo) => {
            const clave = claveDe(grupo);
            const ajuste = ajustes[clave] || {};
            const nombre = grupo[0].jugador.nombre;
            const enFemenino = grupo.some((e) => e.torneo.rama === "F");
            const sexo = ajuste.sexo || (enFemenino ? "F" : "M");
            const nacCR = grupo.map((e) => Number(e.jugador.nacimiento) || null).find((n) => n);
            const nacimiento = Number(ajuste.nacimiento) || nacCR || null;
            const porRitmo = {};
            grupo.forEach((e) => {
                const r = e.torneo.ritmo;
                if (porRitmo[r]) {
                    avisos.push({ tipo: "revisar", motivo: "dos-torneos", clave, nombre,
                        texto: `${nombre} aparece en dos torneos de ritmo ${RITMOS[r] || r} («${porRitmo[r].torneo}» y «${e.torneo.titulo}»): se tomó el primero. Una persona juega una sola modalidad.` });
                    return;
                }
                porRitmo[r] = e.medida;
            });
            const modalidades = [...new Set(grupo.map((e) => (e.torneo.equipos ? "Equipos" : "Individual")))];
            const categorias = [...new Set(grupo.map((e) => e.torneo.categoria).filter(Boolean))];
            const eloNacional = grupo.map((e) => Number(e.jugador.eloNacional) || 0).find((x) => x > 0) || 0;
            const p = { clave, nombre, sexo, sexoManual: !!ajuste.sexo, nacimiento, nacimientoManual: !!ajuste.nacimiento,
                nacimientoChessResults: nacCR, porRitmo, modalidades, categorias, eloNacional,
                fideId: grupo.map((e) => codigo(e.jugador.fideId)).find(Boolean) || "",
                club: (grupo.find((e) => e.jugador.club) || { jugador: {} }).jugador.club || "",
                equipo: (grupo.find((e) => e.jugador.equipo) || { jugador: {} }).jugador.equipo || "",
                soloAbsoluto: !enFemenino };

            // Los avisos de cada persona.
            if (!nacimiento) avisos.push({ tipo: "error", motivo: "nacimiento", clave, nombre,
                texto: `${nombre} no tiene año de nacimiento en chess-results: no se puede saber si cumple la edad y quedó fuera del cálculo. Ponlo en el torneo (Swiss-Manager) y vuelve a cargar, o escríbelo abajo.` });
            if (p.soloAbsoluto && !ajuste.sexo && pareceMujer(nombre)) avisos.push({ tipo: "revisar", motivo: "sexo", clave, nombre,
                texto: `¿${nombre} es mujer? Juega en un torneo absoluto y chess-results no dice el sexo. Si es mujer, márcala: se calcula solo en la rama femenina.` });
            if (modalidades.length > 1) avisos.push({ tipo: "revisar", motivo: "modalidades", clave, nombre,
                texto: `${nombre} juega individual y por equipos. La normativa permite una sola modalidad: revisa la inscripción.` });
            ritmos.forEach((r) => {
                if (!porRitmo[r]) avisos.push({ tipo: "revisar", motivo: "sin-ritmo", clave, nombre,
                    texto: `${nombre} no aparece en ningún torneo de ${RITMOS[r] || r}. Si sí lo jugó, el nombre o el código FIDE no coinciden entre torneos: corrígelo en chess-results y vuelve a cargar.` });
                else if (porRitmo[r].pj < op.minPartidasB) avisos.push({ tipo: "info", motivo: "pocas-partidas", clave, nombre,
                    texto: `${nombre} jugó ${porRitmo[r].pj} partida(s) sobre el tablero en ${RITMOS[r] || r}: sin puntos de rendimiento (B) en ese ritmo (pide ${op.minPartidasB}).` });
                if (porRitmo[r] && porRitmo[r].sinMinimo && porRitmo[r].puesto) avisos.push({ tipo: "info", motivo: "sin-minimo", clave, nombre,
                    texto: `${nombre} jugó ${porRitmo[r].pj} partida(s) con su equipo en ${RITMOS[r] || r}: no llega al ${op.porcentajeEquipo} % de las rondas y no recibe el lugar del equipo (A).` });
            });
            if (!eloNacional) avisos.push({ tipo: "info", motivo: "sin-elo", clave, nombre,
                texto: `${nombre} no tiene Elo nacional: cuenta ${op.sinElo} en el ranking nacional (C).` });
            return p;
        });

        const elegible = (p) => p.nacimiento && p.nacimiento >= op.anioDesde && p.nacimiento <= op.anioHasta;
        const noElegibles = personas.filter((p) => !elegible(p));
        const ramas = {};
        ["M", "F"].forEach((sexo) => {
            const pool = personas.filter((p) => p.sexo === sexo && elegible(p));
            const B = {}, D = {};
            ritmos.forEach((r) => {
                B[r] = prorratear(pool.map((p) => ({ clave: p.clave, valor: p.porRitmo[r] ? p.porRitmo[r].ps : null })));
                D[r] = prorratear(pool.map((p) => ({ clave: p.clave, valor: (p.porRitmo[r] && p.porRitmo[r].eloFide) || op.sinElo })));
            });
            const C = prorratear(pool.map((p) => ({ clave: p.clave, valor: p.eloNacional || op.sinElo })));
            const n = ritmos.length || 1;
            const filas = pool.map((p) => {
                const det = {};
                let sa = 0, sb = 0, sd = 0;
                ritmos.forEach((r) => {
                    const m = p.porRitmo[r];
                    const a = m ? m.a : 0;
                    det[r] = Object.assign({}, m || {}, { A: a, B: B[r].get(p.clave), D: D[r].get(p.clave) });
                    sa += a; sb += B[r].get(p.clave); sd += D[r].get(p.clave);
                });
                const A = redondear2(sa / n), Bp = redondear2(sb / n), Cp = C.get(p.clave), Dp = redondear2(sd / n);
                return Object.assign({}, p, { detalle: det, A, B: Bp, C: Cp, D: Dp, total: redondear2(A + Bp + Cp + Dp) });
            });
            filas.sort((x, y) => (y.total - x.total) || (y.C - x.C) || ((y.nacimiento || 0) - (x.nacimiento || 0)) ||
                x.nombre.localeCompare(y.nombre, "es"));
            const cupos = op.cupos[sexo] || 0;
            const corte = filas[cupos - 1] ? filas[cupos - 1].total : null;
            filas.forEach((f, i) => {
                f.puesto = i + 1;
                f.estado = i < cupos ? "seleccion" : i < cupos + op.suplentes ? "suplente" : "";
                // Cuánto le falta para alcanzar el último lugar de la selección.
                f.faltan = i >= cupos && corte != null ? redondear2(corte - f.total) : 0;
                // Empate en la suma: decidió el C o la edad.
                const otro = filas[i + (i < filas.length - 1 ? 1 : -1)];
                f.desempate = otro && otro.total === f.total ? (otro.C !== f.C ? "C" : "edad") : "";
            });
            ramas[sexo] = filas;
        });

        return { ritmos, ramas, noElegibles, avisos, opciones: op };
    }

    // Lo que cambió entre dos cálculos (para el modo en vivo): quién subió,
    // bajó, entró o salió de la selección.
    function cambios(anterior, actual) {
        const fuera = {};
        ["M", "F"].forEach((s) => {
            const antes = new Map(((anterior && anterior.ramas[s]) || []).map((f) => [f.clave, f]));
            (actual.ramas[s] || []).forEach((f) => {
                const a = antes.get(f.clave);
                if (!a) { fuera[f.clave] = { nuevo: true }; return; }
                fuera[f.clave] = {
                    puestos: a.puesto - f.puesto,
                    total: redondear2(f.total - a.total),
                    entra: f.estado === "seleccion" && a.estado !== "seleccion",
                    sale: f.estado !== "seleccion" && a.estado === "seleccion",
                };
            });
        });
        return fuera;
    }

    const api = { calcular, cambios, prorratear, puntosDe, normalizar, pareceMujer, adivinarTorneo, OPCIONES, ESCALA_A, RITMOS };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else raiz.SeleccionCalculo = api;
})(typeof window !== "undefined" ? window : globalThis);
