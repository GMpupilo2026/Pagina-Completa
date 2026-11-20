/* Aula de Arbitraje — desempatar como lo hace el árbitro.

   Los valores de cada desempate salen del motor de Pareo Integral
   (js/pareo/desempates.js, el C.07:2026 comprobado contra los ejercicios de
   FIDE): aquí no hay una segunda copia de ninguna fórmula. Lo que agrega este
   archivo es el PROCEDIMIENTO, que es lo que se practica:

   - desempatar(t, grupo, bases): aplica las bases en orden y cada desempate
     solo al subgrupo que sigue empatado (art. 4.2). Devuelve el orden final
     y los pasos (qué desempate, a quiénes, con qué valores), que es lo que la
     página le pide calcular a quien practica.
   - El encuentro directo (DE, art. 6) se calcula DENTRO del subgrupo que
     sigue empatado, no en todo el grupo de puntos: si separa a unos y deja a
     otros empatados, se vuelve a aplicar entre esos (6.2); en un suizo donde
     no todos jugaron entre sí, va primero el que queda solo arriba pase lo
     que pase en las partidas que faltan, y así con el segundo (6.3). Las
     incomparecencias no cuentan, salvo en todos contra todos (6.1.1 y 15.2);
     si dos se enfrentaron más de una vez, cuenta el promedio (6.1.2).
   - generarSuizo / generarTodos: torneos al azar, creíbles (emparejamiento
     por puntos sin repetir rival, colores parejos, bye al de abajo), para
     los ejercicios que nunca se acaban.

   Ver «Aula de Arbitraje» en docs/decisiones/juegos-y-torneos.md. */
(function (raiz) {
    "use strict";
    const nodo = typeof module !== "undefined" && module.exports;
    const T = nodo ? require("../pareo/torneo.js") : raiz.PareoTorneo;
    const D = nodo ? require("../pareo/desempates.js") : raiz.PareoDesempates;

    const NOMBRES = ["Alvarado", "Brenes", "Castro", "Durán", "Esquivel", "Fallas", "Gamboa", "Hidalgo", "Jiménez", "Leiva", "Madrigal", "Núñez", "Ortiz", "Porras"];

    const cache = new WeakMap();
    function valores(t, codigo) {
        let m = cache.get(t);
        if (!m) { m = {}; cache.set(t, m); }
        if (!m[codigo]) m[codigo] = D.calcular(t, codigo);
        return m[codigo];
    }
    const menor = (codigo) => (D.CATALOGO.find((c) => c.codigo === codigo) || {}).menor;
    const nombreDe = (codigo) => { const c = D.CATALOGO.find((x) => x.codigo === codigo); return c ? c.es : codigo; };

    /* Las partidas entre dos jugadores: [{ ronda, puntos, cuenta }]. */
    function encuentros(t, a, b) {
        const out = [];
        t.rondas.forEach((R, r) => {
            const s = T.situacion(t, r, a);
            if (s.rival !== b) return;
            const cuenta = s.tipo === "partida" || (t.sistema === "todos" && s.tipo === "incomparecencia");
            out.push({ ronda: r + 1, puntos: s.tipo === "partida" ? (s.codigo === "1" ? 1 : s.codigo === "0" ? 0 : 0.5) : (s.codigo === "+" ? 1 : 0), cuenta });
        });
        return out.filter((x) => x.cuenta);
    }

    /* Suma de DE de cada uno dentro de `grupo`, y cuántos rivales del grupo
       le faltan por enfrentar. */
    function sumasDE(t, grupo) {
        const s = {}, faltan = {};
        grupo.forEach((a) => {
            s[a] = 0; faltan[a] = 0;
            grupo.forEach((b) => {
                if (a === b) return;
                const e = encuentros(t, a, b);
                if (!e.length) { faltan[a]++; return; }
                s[a] += e.reduce((x, y) => x + y.puntos, 0) / e.length;
            });
        });
        return { s, faltan };
    }

    function porValor(ids, val, alReves) {
        const grupos = new Map();
        ids.forEach((id) => { const k = val[id]; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(id); });
        return [...grupos.entries()].sort((a, b) => (alReves ? a[0] - b[0] : b[0] - a[0])).map((x) => x[1]);
    }

    /* El art. 6 completo dentro de un grupo. Devuelve los subgrupos en orden. */
    function encuentroDirecto(t, grupo, prof) {
        prof = prof || 0;
        if (grupo.length < 2 || prof > 8) return [grupo];
        const { s, faltan } = sumasDE(t, grupo);
        const todosJugaron = grupo.every((x) => faltan[x] === 0);
        if (todosJugaron) {
            const partes = porValor(grupo, s);
            if (partes.length === 1) return [grupo];
            // 6.2: a cada subgrupo que siga empatado se le vuelve a aplicar.
            return partes.flatMap((p) => (p.length > 1 ? encuentroDirecto(t, p, prof + 1) : [p]));
        }
        // 6.3: el que queda solo arriba pase lo que pase.
        const resto = grupo.slice(), primeros = [];
        for (;;) {
            const { s: s2, faltan: f2 } = sumasDE(t, resto);
            const solo = resto.find((x) => resto.every((y) => y === x || s2[x] > s2[y] + f2[y]));
            if (!solo || resto.length < 2) break;
            primeros.push([solo]);
            resto.splice(resto.indexOf(solo), 1);
        }
        if (!primeros.length) return [grupo];
        // El art. 6 se vuelve a aplicar a los que quedaron sin puesto.
        return primeros.concat(resto.length > 1 ? encuentroDirecto(t, resto, prof + 1) : resto.length ? [resto] : []);
    }

    /* El procedimiento del art. 4.2. */
    function desempatar(t, grupo, bases) {
        const pasos = [];
        function resolver(g, i) {
            if (g.length < 2 || i >= bases.length) return [g];
            const codigo = bases[i];
            let partes, val;
            if (codigo === "DE") {
                val = sumasDE(t, g).s;
                partes = encuentroDirecto(t, g);
            } else {
                const todo = valores(t, codigo);
                val = {};
                g.forEach((id) => { val[id] = todo[id]; });
                partes = porValor(g, val, menor(codigo));
            }
            pasos.push({ codigo, nombre: nombreDe(codigo), grupo: g.slice(), valores: val, partes });
            return partes.flatMap((p) => (p.length > 1 ? resolver(p, i + 1) : [p]));
        }
        return { orden: resolver(grupo.slice(), 0), pasos };
    }

    /* El primer grupo de jugadores empatados en puntos (de arriba abajo). */
    function grupoEmpatado(t) {
        const pts = new Map(t.jugadores.map((j) => [j.id, T.puntos(t, j.id)]));
        const valoresPts = [...new Set(pts.values())].sort((a, b) => b - a);
        for (const v of valoresPts) {
            const g = t.numeracion.filter((id) => pts.get(id) === v);
            if (g.length > 1) return { puntos: v, ids: g };
        }
        return null;
    }

    /* ---------- torneos al azar ---------- */
    function crear(n, sistema, azar, opciones) {
        const rnd = azar || Math.random;
        const nombres = NOMBRES.slice(0, n);
        let elo = 2150 + Math.floor(rnd() * 250);
        const jugadores = nombres.map((nombre, i) => {
            const j = { id: "j" + (i + 1), nombre, elo, titulo: "", fed: "", sexo: "", retiradoDespuesDe: null };
            elo -= 15 + Math.floor(rnd() * 45);
            return j;
        });
        return T.nuevo(Object.assign({ sistema, jugadores, numeracion: jugadores.map((j) => j.id), rondas: [] }, opciones || {}));
    }
    function resultado(rnd, eb, en) {
        const p = 1 / (1 + Math.pow(10, (en - eb) / 400)), x = rnd();
        return x < p * 0.75 ? "1-0" : x < p * 0.75 + 0.3 ? "=" : "0-1";
    }
    function generarSuizo(op) {
        op = op || {};
        const rnd = op.azar || Math.random;
        const n = op.jugadores || 8, R = op.rondas || 5;
        const t = crear(n, "suizo", rnd, { rondasTotales: R });
        const eloDe = new Map(t.jugadores.map((j) => [j.id, j.elo]));
        const jugaron = new Set(), byes = new Set(), blancas = {};
        for (let r = 0; r < R; r++) {
            const pts = new Map(t.jugadores.map((j) => [j.id, T.puntosHasta(t, j.id, r)]));
            let lista = t.numeracion.slice();
            const ausencias = {};
            // A veces alguien pide un bye de medio punto (antes de emparejar).
            if (op.byesPedidos && rnd() < 0.18) { const id = lista[Math.floor(rnd() * lista.length)]; ausencias[id] = rnd() < 0.7 ? "H" : "Z"; lista = lista.filter((x) => x !== id); }
            lista.sort((a, b) => pts.get(b) - pts.get(a) || Number(a.slice(1)) - Number(b.slice(1)));
            const mesas = [];
            if (lista.length % 2) {
                const cand = lista.slice().reverse().find((id) => !byes.has(id)) || lista[lista.length - 1];
                byes.add(cand); lista = lista.filter((x) => x !== cand);
                mesas.push({ b: cand, n: null, r: null });
            }
            const emparejar = (l) => {
                if (!l.length) return [];
                for (let k = 1; k < l.length; k++) {
                    if (jugaron.has(l[0] + "|" + l[k])) continue;
                    const sigue = emparejar(l.filter((_, i) => i !== 0 && i !== k));
                    if (sigue) return [[l[0], l[k]]].concat(sigue);
                }
                return null;
            };
            const pares = emparejar(lista) || [];
            for (let [a, b] of pares) {
                jugaron.add(a + "|" + b); jugaron.add(b + "|" + a);
                if ((blancas[a] || 0) > (blancas[b] || 0) || ((blancas[a] || 0) === (blancas[b] || 0) && rnd() < 0.5)) [a, b] = [b, a];
                blancas[a] = (blancas[a] || 0) + 1;
                let res = resultado(rnd, eloDe.get(a), eloDe.get(b));
                if (op.incomparecencias && rnd() < 0.05) res = rnd() < 0.5 ? "+-" : "-+";
                mesas.push({ b: a, n: b, r: res });
            }
            t.rondas.push({ mesas, ausencias });
        }
        return t;
    }
    function generarTodos(op) {
        op = op || {};
        const rnd = op.azar || Math.random;
        const n = op.jugadores || 6;
        const t = crear(n, "todos", rnd, { rondasTotales: n - 1 });
        const eloDe = new Map(t.jugadores.map((j) => [j.id, j.elo]));
        const ids = t.numeracion.slice(), blancas = {};
        for (let r = 0; r < n - 1; r++) {
            const mesas = [];
            for (let k = 0; k < n / 2; k++) {
                let a = ids[k], b = ids[n - 1 - k];
                if ((blancas[a] || 0) > (blancas[b] || 0) || ((blancas[a] || 0) === (blancas[b] || 0) && (r + k) % 2)) [a, b] = [b, a];
                blancas[a] = (blancas[a] || 0) + 1;
                mesas.push({ b: a, n: b, r: resultado(rnd, eloDe.get(a), eloDe.get(b)) });
            }
            t.rondas.push({ mesas, ausencias: {} });
            ids.splice(1, 0, ids.pop());
        }
        return t;
    }

    const api = { desempatar, encuentroDirecto, sumasDE, grupoEmpatado, valores, nombreDe, menor, generarSuizo, generarTodos, NOMBRES };
    if (nodo) module.exports = api;
    else raiz.AulaDesempates = api;
})(typeof self !== "undefined" ? self : this);

/*! rev bfb5bbb0d2d82f9f */
