#!/usr/bin/env node
/* Verifica los rangos que se ganan con un examen.

   Sin navegador:
   - Los umbrales y los rangos de js/rangos.js son los de interno.umbral_rango()
     (dos copias que tienen que coincidir).
   - El banco (herramientas/rangos/banco.sql) es exactamente lo que genera
     herramientas/rangos-examen-banco.js; cada pregunta de táctica rearmada
     desde lo compacto es la misma que arma ExamenBanco; sus jugadas son
     legales; las posiciones de mate son legales, juegan blancas y llevan las
     piezas de su final.
   - _compartido/defensa-mate.js está al día con sus fuentes.
   - La defensa de la dama: partidas completas con las blancas jugando
     perfecto (la tabla exacta) y el rey eligiendo como examen-mate (la
     jugada que deja el mate más lejos): el mate llega en exactamente las
     jugadas que dice la tabla. Si el rey defendiera peor, el mate llegaría
     antes.
   - La base: 90 % y los mates obligatorios, un examen pendiente por alumno,
     responder_examen() no acepta mates, mate_estado()/mate_registrar() solo
     para la clave de servicio, la resta de 500 solo en el avance.
   - examen.js juega el mate contra examen-mate y no lo manda a
     responder_examen; la función está en el armado y en la lista de
     desplegadas con verify_jwt; el certificado dice «aprobó el examen del».

     node herramientas/verificar-rangos-examen.js */

const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8").replace(/\r\n/g, "\n");
const { Chess } = require(path.join(RAIZ, "node_modules/chess.js"));
const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

const migr = (nombre) => {
    const f = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).filter((x) => x.endsWith("_" + nombre + ".sql"));
    return f.length === 1 ? leer("supabase/migraciones/" + f[0]) : (ok(false, `falta la migración *_${nombre}.sql`), "");
};
const base = migr("rangos_con_examen");
const mates = migr("rangos_examen_mates");

// 1) Umbrales: JS == SQL.
const R = require(path.join(RAIZ, "js/rangos.js"));
const m = base.match(/function interno\.umbral_rango[\s\S]*?select case p_rango ([\s\S]*?) end;/);
const sql = {};
if (m) for (const x of m[1].matchAll(/when '([a-z_]+)' then (\d+)/g)) sql[x[1]] = Number(x[2]);
ok(R.RANGOS.length === 6 && R.RANGOS.every((r) => sql[r.id] === r.desde),
    `los umbrales de js/rangos.js tienen que ser los de interno.umbral_rango(): JS ${JSON.stringify(R.RANGOS.map((r) => [r.id, r.desde]))} SQL ${JSON.stringify(sql)}`);
ok(R.RANGOS.some((r) => r.id === "dama_rey") && R.RANGOS[R.RANGOS.length - 1].id === "dragon", "Dama y Rey son un solo rango y el más alto es Dragón");

// 2) El banco.
const B = require("./rangos-examen-banco.js");
const filas = B.principal();
ok(B.mates().length >= 20, "el banco de Caballo tiene que traer las posiciones de mate de dama y de dos torres");
let malRearmado = 0, ilegales = 0;
for (const f of filas) {
    const { item_id, ...resto } = f.item;
    if (JSON.stringify(B.rearmar(B.compacta(f.item, f.ej))) !== JSON.stringify(resto)) malRearmado++;
    const g = new Chess(f.item.visible.fen);
    if (!f.item.clave.jugadas.every((j) => g.moves({ verbose: true }).some((x) => x.from === j.from && x.to === j.to))) ilegales++;
}
ok(!malRearmado, `${malRearmado} preguntas de táctica no vuelven iguales desde lo compacto (la plantilla de pregunta_de_rango se separó de ExamenBanco)`);
ok(!ilegales, `${ilegales} preguntas de táctica con una jugada de la clave que no es legal`);
for (const r of Object.keys(B.FRANJAS)) ok(filas.filter((f) => f.rango === r).length >= 30, `el rango ${r} tiene muy pocas preguntas`);
const piezasDe = (fen) => fen.split(" ")[0].replace(/[^a-zA-Z]/g, "").split("").sort().join("");
for (const x of B.mates()) {
    const g = new Chess(x.compacta.f);
    const piezas = piezasDe(x.compacta.f);
    ok(g.turn() === "w" && !g.in_checkmate() && !g.in_stalemate() && !g.in_check(), `la posición de mate ${x.item_id} tiene que ser legal, sin mate ni ahogado, y con blancas al mover`);
    ok(piezas === (x.compacta.fin === "q" ? "KQk" : "KRRk"), `la posición ${x.item_id} no trae las piezas de su final (${piezas})`);
}
const generado = (() => { const { execFileSync } = require("child_process"); return execFileSync(process.execPath, [path.join(__dirname, "rangos-examen-banco.js")], { encoding: "utf8", maxBuffer: 1 << 24 }); })();
ok(generado === leer("herramientas/rangos/banco.sql"), "herramientas/rangos/banco.sql no es lo que genera rangos-examen-banco.js: vuelve a generarlo");

// 3) La defensa armada al día, y la dama defendiendo bien.
const D = require("./defensa-mate-armar.js");
ok(D.armar() === leer("supabase/functions/_compartido/defensa-mate.js"), "_compartido/defensa-mate.js está viejo: corre node herramientas/defensa-mate-armar.js");
const F = require(path.join(RAIZ, "herramientas/lib/finales-dtm.js"));
const q = F.resolver("q");
// La regla de examen-mate: el rey elige la jugada que deja el mate más lejos (tablas = lo mejor).
function reyDeExamen(fen) {
    const g = new Chess(fen); let mejor = null, mejorV = -Infinity;
    for (const mv of g.moves({ verbose: true })) {
        g.move(mv);
        const d = g.insufficient_material() || g.in_stalemate() ? 0 : q.dtm(g.fen());
        const v = d === 0 ? 1e6 : (d || 0);
        g.undo();
        if (v > mejorV) { mejorV = v; mejor = mv; }
    }
    return mejor;
}
const funcion = leer("supabase/functions/examen-mate/index.ts");
ok(/const d = g\.insufficient_material\(\) \|\| g\.in_stalemate\(\) \? 0 : tablaDama\.dtm\(g\.fen\(\)\);/.test(funcion) && /const v = d === 0 \? 1e6 : \(d \?\? 0\);/.test(funcion),
    "la defensa de la dama de examen-mate se separó de la que prueba este verificador");
ok(/TiposReglas\.defensaRey\(Chess, fen\)/.test(funcion), "las dos torres defienden con TiposReglas.defensaRey");
for (const x of B.mates().filter((y) => y.compacta.fin === "q")) {
    const g = new Chess(x.compacta.f);
    const esperado = q.dtm(x.compacta.f);
    let jugadas = 0;
    while (!g.game_over() && jugadas < 30) {
        // Blancas perfectas: la que deja el menor dtm (o da mate).
        let mejor = null, mejorD = Infinity;
        for (const mv of g.moves({ verbose: true })) {
            g.move(mv);
            const d = g.in_checkmate() ? -1 : (g.in_stalemate() || g.insufficient_material() ? 1e9 : (() => { const r = reyDeExamen(g.fen()); g.move(r); const dd = q.dtm(g.fen()); g.undo(); return (dd === 0 || dd == null) ? 1e9 : dd; })());   // 0 o null (se comió la dama) = ya no se gana
            g.undo();
            if (d < mejorD) { mejorD = d; mejor = mv; }
        }
        g.move(mejor); jugadas++;
        if (g.in_checkmate()) break;
        g.move(reyDeExamen(g.fen()));
    }
    ok(g.in_checkmate() && jugadas === esperado, `${x.item_id}: con blancas perfectas el mate tiene que llegar en ${esperado} y llegó en ${jugadas} (${g.in_checkmate() ? "mate" : "sin mate"})`);
}

// 4) La base.
ok(/coalesce\(e\.porcentaje, 0\) >= 90/.test(mates), "un examen de rango se aprueba con el 90 %");
ok(/it\.tipo = 'mate'\s+and not exists \(select 1 from public\.examen_respuestas er where er\.item_id = it\.id and er\.correcta\)/.test(mates), "los mates son obligatorios: sin todos dados no se aprueba");
ok(/create unique index rango_examenes_uno_pendiente on public\.rango_examenes \(alumno_id\) where resultado = 'pendiente'/.test(base), "un examen de rango pendiente por alumno, con un índice único");
ok(/if it\.tipo = 'mate' then\s+return jsonb_build_object\('guardada', false, 'motivo', 'se_juega'\);/.test(mates), "responder_examen() no puede aceptar una pregunta de mate");
ok(/revoke execute on function public\.mate_estado\(uuid, uuid\) from public, anon, authenticated;\s*grant execute on function public\.mate_estado\(uuid, uuid\) to service_role;/.test(mates)
   && /revoke execute on function public\.mate_registrar\([^)]*\) from public, anon, authenticated;\s*grant execute on function public\.mate_registrar\([^)]*\) to service_role;/.test(mates),
    "mate_estado() y mate_registrar() solo para la clave de servicio");
ok(/if p\.fen <> p_fen_antes then/.test(mates), "una jugada de mate se encadena con la posición anterior");
ok(/- 500 \* \(select count\(\*\) from public\.rango_examenes r where r\.alumno_id = p_alumno and r\.resultado = 'reprobado'\)/.test(base)
   && !/'rango_fallido'/.test(base + mates), "la resta de 500 es del avance (puntos_para_rango), no del ledger ni del saldo");

// 5) Las pantallas y la función.
const examen = leer("js/examen.js");
ok(/it\.tipo === "mate"\) \{\s*prepararMate\(it\);/.test(examen) && /sb\.functions\.invoke\("examen-mate"/.test(examen), "examen.js tiene que jugar el mate contra examen-mate");
ok(/pendientes\[indice\]\.tipo === "mate"\) \{\s*clearInterval\(relojMate\);/.test(examen), "un mate no se manda a responder_examen: ya lo guardó el servidor");
ok(/desbloquear, escribir,/.test(leer("js/tablero-pregunta.js")), "TableroPregunta tiene que poder desbloquearse (el mate se juega en varias jugadas)");
ok(/"examen-mate": \["defensa-mate\.js"\]/.test(leer("herramientas/funciones-armar.js")), "examen-mate tiene que estar en el armado con defensa-mate.js");
ok(/^examen-mate\s+true\s/m.test(leer("supabase/esquema/funciones-desplegadas.txt")), "examen-mate tiene que estar en las desplegadas con verify_jwt true");
ok(/sesionAMedias\(usuario\.user\.factors, jwt\)/.test(funcion), "examen-mate exige el segundo paso");
ok(/String\(c\.curso \|\| ""\)\.startsWith\("rango:"\)/.test(leer("js/certificado.js")), "el certificado de un rango dice «aprobó el examen del»");
ok(/sb\.rpc\("mi_rango"/.test(leer("js/puntos-tienda-pagina.js")), "la tienda pinta el rango con mi_rango()");

if (fallos.length) {
    console.error("✗ rangos con examen:\n  - " + fallos.join("\n  - "));
    process.exit(1);
}
console.log("✓ rangos con examen: umbrales, banco, defensa, base, examen y diploma en orden.");

/*! rev bfb5bbb0d2d82f9f */
