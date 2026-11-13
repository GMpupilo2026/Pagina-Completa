/* La Mesa del árbitro con torneos de Pareo Integral (ver «La Mesa del árbitro con torneos de Pareo
   Integral» en docs/decisiones/juegos-y-torneos.md). Sin navegador:
   1. fuente-pareo.ts con node (lib/prueba-fuente-pareo.mjs): la lectura desde lo publicado, la mesa
      física frente al índice de Pareo, el bye, la ronda 0, las tablas iguales a las del navegador y
      la fila de la cola.
   2. Las promesas leídas del código: la migración (on delete set null, el permiso por columna, la
      auditoría, la RPC con revoke y digest), la función de la tablet (con Pareo nunca
      guardarYComprobar ni la clave de chess-results; la cola con asignacion_id), el Pareo del
      principal (el adjunto «virtual» SOLO desde la cola) y la página que vincula (lee el
      localStorage de Pareo con sus mismas claves y nunca escribe ahí). */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8");

let fallos = 0;
const ok = (cond, texto) => { if (cond) console.log("  ✓ " + texto); else { console.log("  ✗ " + texto); fallos++; } };

const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", path.join(__dirname, "lib", "prueba-fuente-pareo.mjs")], { stdio: "inherit", cwd: RAIZ });
if (r.status !== 0) fallos++;

console.log("La migración:");
const mig = fs.readdirSync(path.join(RAIZ, "supabase", "migraciones")).find((f) => /_mesa_arbitro_fuente_pareo\.sql$/.test(f));
ok(!!mig, "existe la migración de la fuente");
const sql = mig ? leer("supabase/migraciones/" + mig) : "";
ok(/pareo_id uuid references public\.pareo_publicados\(id\) on delete set null/.test(sql), "pareo_id con on delete set null (dejar de publicar no se rompe)");
ok(/grant select \(fuente, pareo_id\) on public\.centroamericano_torneos to authenticated/.test(sql), "permiso de SELECT por columna para fuente y pareo_id");
ok(/grant select \(marca\) on public\.centroamericano_eventos to authenticated/.test(sql), "permiso de SELECT por columna para marca");
ok(/interno\.auditar\([^)]*'fuente'[^)]*'pareo_id'/.test(sql), "la auditoría de los torneos anota fuente y pareo_id");
ok(/revoke execute on function public\.centroamericano_pareo_vincular[^;]*from public, anon/.test(sql), "vincular: revoke de public y anon");
ok(/extensions\.digest\(p_clave, 'sha256'\)/.test(sql) && /clave_hash/.test(sql), "vincular prueba la clave contra clave_hash");
ok(/security definer/.test(sql) && /set search_path to ''/.test(sql), "vincular: security definer con search_path vacío");
ok(/pareo_cola_una_via/.test(sql), "la cola: una sola vía (código o enlace de la Mesa)");

console.log("La función de la tablet:");
const fn = leer("supabase/functions/centroamericano-mesa/index.ts");
const ramaGuardar = (fn.match(/async function guardarPareo[\s\S]*?\n  }\n/) || [""])[0];
ok(ramaGuardar.length > 200, "existe guardarPareo");
ok(!/guardarYComprobar/.test(ramaGuardar), "guardarPareo nunca llama a guardarYComprobar");
ok(/if \(esPareo\) return await guardarPareo\(ronda, cambios\);\s*\n\s*const res = await guardarYComprobar/.test(fn), "«guardar» con Pareo sale antes de guardarYComprobar");
ok(/valor === "D"/.test(ramaGuardar), "con Pareo no se borra un resultado (lo borra el principal)");
ok(/DE_AVISOS\.includes\(String\(cuerpo\.action\)\) \|\| esPareo \? Promise\.resolve/.test(fn), "con Pareo no se pide la clave de chess-results");
const fp = leer("supabase/functions/_compartido/fuente-pareo.ts");
ok(/asignacion_id: a\.id/.test(fp) && /codigo: null/.test(fp), "la fila de la cola va por asignacion_id, sin código");
ok(/indiceDe\(d, a\.mesa_desde\)/.test(fp), "el rango de la cola se pasa a índices de Pareo");
const lc = leer("supabase/functions/_compartido/lecturas-cache.ts");
ok(/if \(!\/\^\[0-9\]\{1,7\}\$\/\.test\(tnr\)\) return \{ ok: false/.test(lc), "leerConCache nunca le pregunta a chess-results por un torneo de Pareo");
const armar = leer("herramientas/funciones-armar.js");
ok(/"centroamericano-mesa": \[[^\]]*"fuente-pareo\.ts"[^\]]*"pareo-adjuntos\.ts"/.test(armar), "centroamericano-mesa lleva fuente-pareo.ts y pareo-adjuntos.ts");
ok(/"pareo-publicar": \[[^\]]*"pareo-adjuntos\.ts"/.test(armar), "pareo-publicar lleva pareo-adjuntos.ts (una sola copia de limpiarEnvio)");
ok(!fs.existsSync(path.join(RAIZ, "supabase/functions/pareo-publicar/adjuntos.ts")), "no quedó la copia vieja de adjuntos.ts");

console.log("El Pareo del principal:");
const pagina = leer("js/pareo/pagina.js");
ok(/recibirDeAdjunto\(quien, d, virtual\)/.test(pagina) && /recibirNotaDeAdjunto\(quien, d, virtual\)/.test(pagina), "leerCola pasa el adjunto virtual de las filas de la Mesa");
const canal = (pagina.match(/canal\.on\("broadcast", \{ event: "resultado" \}[^\n]*\n[^\n]*\n/) || [""])[0];
ok(canal.length > 0 && !/virtual|adjuntoDeMesa/.test(canal) && /recibirDeAdjunto\(a\.codigo, msg\.payload \|\| \{\}\)\)/.test(canal), "el canal en vivo nunca trae un adjunto virtual");
ok(/const a = v && \(virtual \|\| adjuntoActivo\(v, codigo\)\);[\s\S]*const a = v && \(virtual \|\| adjuntoActivo\(v, codigo\)\);/.test(pagina), "resultado y nota aceptan el virtual");
ok(/if \(estado\.t\.publicado\) setTimeout\(\(\) => \{ if \(estado\.id === id\) conectarAdjuntos\(\); \}, 0\);/.test(pagina), "un torneo publicado lee la cola aunque no tenga adjuntos propios");

console.log("La página que vincula:");
const vinc = leer("js/mesa-pareo-vincular.js");
const lista = (pagina.match(/const CLAVE_LISTA = "([^"]+)"/) || [])[1], prefijo = (pagina.match(/const PREFIJO = "([^"]+)"/) || [])[1];
ok(!!lista && vinc.includes('const CLAVE_LISTA = "' + lista + '"'), "la misma lista de torneos que Pareo (" + lista + ")");
ok(!!prefijo && vinc.includes('const PREFIJO = "' + prefijo + '"'), "la misma clave de cada torneo que Pareo (" + prefijo + ")");
ok(!/localStorage\.(setItem|removeItem|clear)/.test(vinc), "nunca escribe en el localStorage de Pareo");
ok(!/console\.(log|info|warn|error)\([^)]*clave/i.test(vinc), "no imprime la clave");
ok(/centroamericano_pareo_vincular/.test(vinc), "vincula con la RPC (la base prueba la clave)");

if (fallos) { console.log("\n✗ " + fallos + " fallo(s)"); process.exit(1); }
console.log("\n✓ La Mesa del árbitro con Pareo Integral: todo en orden");

/*! rev bfb5bbb0d2d82f9f */
