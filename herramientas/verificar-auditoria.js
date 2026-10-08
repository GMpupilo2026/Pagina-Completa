#!/usr/bin/env node
/*
 * La bitácora de auditoría (public.auditoria), mirando el retrato del esquema
 * (supabase/esquema/inventario-academia.txt). No necesita red ni navegador.
 *
 * Todo lo que importa de una bitácora se puede perder sin ningún error: una
 * tabla que reparte permisos sin su trigger simplemente no anota nada, y una
 * bitácora que alguien puede escribir o borrar no prueba nada. Comprueba:
 *   - cada tabla vigilada tiene su trigger `auditar` (profiles, los dos);
 *   - la bitácora no se cambia ni se borra (sus triggers) y nadie la escribe
 *     desde afuera: authenticated solo lee, anon nada;
 *   - solo la lee quien administra (una sola política, de SELECT);
 *   - la purga por antigüedad está programada.
 *
 * Una tabla NUEVA que reparta permisos, accesos o dinero va en VIGILADAS y
 * lleva su trigger. Ver «La bitácora de auditoría» en
 * docs/decisiones/permisos-y-roles.md.
 *
 *   node herramientas/verificar-auditoria.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const inventario = fs.readFileSync(path.join(__dirname, "..", "supabase", "esquema", "inventario-academia.txt"), "utf8").split("\n");
const hay = (linea) => inventario.includes(linea);

const VIGILADAS = [
  "profile_teachers", "equipos", "equipo_alumnos", "equipo_entrenadores",
  "coordinador_profesores", "coordinador_funciones_quitadas", "supervisor_cuentas",
  "academias", "academia_miembros", "academia_ia", "preparacion_rivales_profesores",
  // A qué profesor se le asigna un grupo de un proyecto (y con eso, sus planes).
  "proyecto_grupos",
  "acceso_config", "paquetes_acceso", "paquete_alumnos", "pruebas_gratis", "cuentas_temporales",
  "planes_cobro", "suscripciones", "cobros", "pagos", "recibos",
  // No reparte permisos: es un dato de salud, y quién lo marcó queda anotado.
  "vision_personas",
  // Un reconocimiento de la academia: quién dio (o anuló) cada certificado.
  "certificados",
  // Con quién se comparte cada material de clase (admin.html#materiales).
  "material_compartido",
  // Puntos Ajedrez: se canjean por acceso (curso_adelanto, material_tienda),
  // así que ganarlos y gastarlos queda anotado igual que un permiso.
  "puntos_ajustes", "premios_canjeados",
];

let fallos = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fallos++; };

console.log("\nLo que se anota");
const sinTrigger = VIGILADAS.filter((t) => !hay(`trigger  ${t}  auditar`));
ok(!sinTrigger.length, sinTrigger.length ? `sin trigger auditar: ${sinTrigger.join(", ")}` : `las ${VIGILADAS.length} tablas que reparten permisos, accesos y dinero lo llevan`);
ok(hay("trigger  profiles  auditar_alta_baja") && hay("trigger  profiles  auditar_cambio"), "profiles lleva los dos (alta y baja; cambio de permisos)");
const auditar = inventario.find((l) => l.startsWith("funcion  interno.auditar()"));
ok(auditar && /anon=false  auth=false/.test(auditar), "interno.auditar() no la puede llamar nadie de afuera");

console.log("\nQue no se pueda tocar");
ok(hay("tabla  auditoria  rls=true"), "la tabla tiene RLS");
ok(hay("trigger  auditoria  auditoria_intocable") && hay("trigger  auditoria  auditoria_sin_truncate"), "no se cambia, no se borra, no se vacía");
const grants = inventario.filter((l) => /^grant  auditoria  /.test(l));
ok(grants.length === 1 && grants[0] === "grant  auditoria  authenticated  SELECT",
  `authenticated solo lee y anon nada (${grants.map((g) => g.split("  ").slice(2).join(" ")).join(", ") || "ningún permiso"})`);
const politicas = inventario.filter((l) => /^politica  auditoria  /.test(l));
ok(politicas.length === 1 && politicas[0] === "politica  auditoria  auditoria_select_admin  SELECT",
  "una sola política, de lectura, para quien administra");

console.log("\nCuánto se guarda");
ok(inventario.some((l) => /^cron  auditoria-purga  /.test(l)), "la purga de lo que pasa de dos años está programada");

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);
