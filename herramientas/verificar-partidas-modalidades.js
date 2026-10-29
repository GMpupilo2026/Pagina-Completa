#!/usr/bin/env node
/* Las rondas 6 y 7 de verificar-partidas-simultaneas.js: el canal rápido y las
   pre-jugadas en las demás modalidades con turno (Niebla, Crazyhouse, Cartas,
   Abrazos, Camaleón, Vampiro, Volcanes y Misiones), dos partidas de cada una,
   con red sana y con red mala. Ver «La jugada viaja por Broadcast, y las
   pre-jugadas» en docs/decisiones/juegos-y-torneos.md.

   Es el mismo código, no una copia: corre aquel verificador con RONDAS=6,7.
   Va aparte porque todas las rondas juntas pasan de los 10 minutos que
   verificar-todo.js le da a cada verificador, y así las dos mitades pueden
   caer en tandas distintas del CI.

   Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
         node herramientas/verificar-partidas-modalidades.js
         SOLO_MODALIDADES=cartas,niebla node herramientas/verificar-partidas-modalidades.js */
"use strict";

// Abre un navegador (el de verificar-partidas-simultaneas.js): verificar-todo lo
// lee de este require para correrlo en una tanda con navegador.
require("playwright");
const path = require("path");
const { spawnSync } = require("child_process");

const r = spawnSync(process.execPath, [path.join(__dirname, "verificar-partidas-simultaneas.js")], {
  stdio: "inherit",
  env: Object.assign({}, process.env, { RONDAS: process.env.RONDAS || "6,7" }),
});
process.exit(r.status === null ? 1 : r.status);
