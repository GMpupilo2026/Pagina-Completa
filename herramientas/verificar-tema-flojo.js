/* Comprueba, sin navegador, lo que alimenta el «tema más flojo»
 * (js/tema-flojo.js, en Informes y en el hub de Entrenamiento):
 *
 *   - entreno/data/temas-motivos.json está al día con temas.json: si alguien
 *     suma un tema y no vuelve a correr herramientas/temas-motivos.js, la base
 *     nunca lo contaría y no daría ningún error;
 *   - trae solo MOTIVOS: ni «Mezcla equilibrada», ni las fases, ni las
 *     duraciones, que no dicen qué practicar;
 *   - cada motivo tiene ejercicios en temas.json (un tema vacío no se puede
 *     proponer: el enlace llevaría a una lista sin nada);
 *   - la función de la base se guardó como SECURITY INVOKER y sin execute para
 *     anon: el permiso lo pone la RLS de training_progress.
 *
 * Uso:  node herramientas/verificar-tema-flojo.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const G = require("./temas-motivos.js");

const RAIZ = path.join(__dirname, "..");
let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) { console.log("  ✓ " + nombre); return; }
  fallos += 1;
  console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : ""));
}

const guardado = fs.readFileSync(G.DESTINO, "utf8");
ok("temas-motivos.json está al día con temas.json", guardado === G.armar(),
  "vuelve a correr: node herramientas/temas-motivos.js");

const motivos = JSON.parse(guardado);
const temas = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/temas.json"), "utf8"));
const NO_SON = ["mix", "opening", "middlegame", "endgame", "short", "long", "oneMove", "master", "equality", "crushing", "mateIn1"];
ok("no trae temas que no son motivos", NO_SON.every((k) => !(k in motivos)), NO_SON.filter((k) => k in motivos).join(", "));
ok("trae los motivos de siempre (clavada, horquilla, mate del pasillo, la táctica de la casa)",
  ["pin", "fork", "backRankMate", "ultima-linea"].every((k) => k in motivos));
const vacios = Object.keys(motivos).filter((k) => !(temas.themes[k] || []).length);
ok("cada motivo tiene ejercicios en temas.json", !vacios.length, vacios.join(", "));
ok("cada motivo tiene nombre", Object.values(motivos).every((n) => typeof n === "string" && n.trim()));

const migracion = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).filter((f) => /informes_tema_mas_flojo/.test(f)).sort().pop();
const sql = migracion ? fs.readFileSync(path.join(RAIZ, "supabase/migraciones", migracion), "utf8") : "";
ok("la función está guardada en supabase/migraciones", !!migracion);
ok("es SECURITY INVOKER (la RLS decide qué se ve)", /security invoker/i.test(sql) && !/security definer/i.test(sql));
ok("y sin execute para public ni anon", /revoke execute on function public\.informes_tema_mas_flojo\(text\[\]\) from public, anon/i.test(sql));

console.log(fallos ? `\n✗ ${fallos} problema(s).` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);
