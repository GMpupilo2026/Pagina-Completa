#!/usr/bin/env node
/*
 * La verificación en dos pasos, del lado de la base, mirando el retrato del
 * esquema (supabase/esquema/inventario-academia.txt) y las migraciones.
 * No necesita red ni navegador.
 *
 * Quien exige el segundo paso es la base, en dos lugares, y los dos se pueden
 * perder sin ningún error:
 *   - PostgREST corre public.antes_de_cada_pedido() antes de cada pedido
 *     (pgrst.db_pre_request). Si anon o authenticated pierden el permiso de
 *     ejecutarla, se cae la API entera; si alguien la borra, la contraseña
 *     sola vuelve a alcanzar.
 *   - Realtime y Storage no pasan por PostgREST: leen con la RLS. Cada tabla
 *     de Realtime lleva la política restrictiva verificacion_en_dos_pasos.
 *     Una tabla que se suma a Realtime sin ella deja escuchar los cambios con
 *     la contraseña sola.
 *
 * Ver «La verificación en dos pasos» en docs/decisiones/permisos-y-roles.md.
 *
 *   node herramientas/verificar-dos-pasos-base.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const inventario = fs.readFileSync(path.join(RAIZ, "supabase", "esquema", "inventario-academia.txt"), "utf8").split("\n");

let fallos = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fallos++; };

console.log("\nEl candado de la API");
const fn = (nombre) => inventario.find((l) => l.startsWith(`funcion  ${nombre}(`));
const antes = fn("antes_de_cada_pedido");
ok(antes && /anon=true  auth=true/.test(antes), "antes_de_cada_pedido() existe y la pueden correr anon y authenticated");
const al_dia = fn("interno.verificacion_al_dia");
ok(al_dia && /anon=false  auth=true/.test(al_dia), "interno.verificacion_al_dia() existe, sin anon");
const quitar = fn("quitar_verificacion_en_dos_pasos");
ok(quitar && /anon=false/.test(quitar), "quitar_verificacion_en_dos_pasos() no la puede llamar anon");

const migraciones = fs.readdirSync(path.join(RAIZ, "supabase", "migraciones")).sort();
const ultimaPre = migraciones.filter((f) => /pgrst\.db_pre_request/.test(fs.readFileSync(path.join(RAIZ, "supabase", "migraciones", f), "utf8"))).pop();
const textoPre = ultimaPre ? fs.readFileSync(path.join(RAIZ, "supabase", "migraciones", ultimaPre), "utf8") : "";
ok(/set pgrst\.db_pre_request = 'public\.antes_de_cada_pedido'/.test(textoPre),
  `la última migración que toca pgrst.db_pre_request lo deja en antes_de_cada_pedido${ultimaPre ? ` (${ultimaPre})` : ""}`);

console.log("\nRealtime");
const enRealtime = inventario.filter((l) => l.startsWith("realtime  ")).map((l) => l.split("  ")[1]);
const conPolitica = new Set(inventario
  .filter((l) => /^politica  \S+  verificacion_en_dos_pasos  ALL  restrictiva$/.test(l))
  .map((l) => l.split("  ")[1]));
ok(enRealtime.length > 0, `${enRealtime.length} tablas en Realtime`);
const sinPolitica = enRealtime.filter((t) => !conPolitica.has(t));
ok(!sinPolitica.length, sinPolitica.length
  ? `sin la política verificacion_en_dos_pasos: ${sinPolitica.join(", ")}`
  : "todas llevan la política restrictiva verificacion_en_dos_pasos");

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);
