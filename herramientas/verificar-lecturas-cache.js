/* La lectura de chess-results COMPARTIDA entre los árbitros del Centroamericano
   (supabase/functions/_compartido/lecturas-cache.ts). Ver «La lectura de chess-results
   se comparte» en docs/decisiones/juegos-y-torneos.md.

   Corre la prueba de herramientas/lib/prueba-lecturas-cache.mjs con Node leyendo TypeScript
   directo (--experimental-strip-types, Node 22): una base y una «chess-results» de mentira que
   cuenta las visitas. Comprueba que 15 árbitros a la vez hagan UNA sola visita, que se sirva la
   última copia si chess-results no contesta, que el turno de leer se recupere si quien lo tenía
   se cae, y que guardar un resultado deje la copia al día.

       node herramientas/verificar-todo.js lecturas-cache */
"use strict";
const { spawnSync } = require("child_process");
const path = require("path");
const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", path.join(__dirname, "lib", "prueba-lecturas-cache.mjs")], { stdio: "inherit", cwd: path.join(__dirname, "..") });
process.exit(r.status === null ? 1 : r.status);
