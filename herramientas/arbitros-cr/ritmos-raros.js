#!/usr/bin/env node
/* Los torneos con solo Elo nacional cuyo ritmo hay que mirar a mano, para el
   filtro «Solo con Elo nacional» de arbitros-cr.html.

   El ritmo sale de la ficha de chess-results y, si la ficha no lo dice, del
   texto de su control de tiempo (js/ritmo-control.js). Lo que no se puede
   decidir solo:
   - la ficha dice blitz o rápido y el control da 60 minutos o más, o la ficha
     dice clásico y el control da 20 o menos: uno de los dos está mal;
   - la ficha no lo dice y el control da de 40 a 59 minutos («15 + 30»,
     «40 min finish»): para FIDE es rápido, pero chess-results marca clásico a
     la mayoría de los torneos con Elo nacional así (36 de 52);
   - la ficha no lo dice y no hay un tiempo que leer, ni en el control ni en el
     nombre.
   Lo que el dueño confirma va a herramientas/datos/arbitros-cr-ritmo-corregir.json
   (`clave`, `ritmo` y `motivo`) y herramientas/arbitros-cr/calculo-elo.py lo
   carga encima de lo que dice la ficha. Ver «Los torneos con Elo nacional» en
   docs/decisiones/juegos-y-torneos.md.

   Uso:  node herramientas/arbitros-cr/ritmos-raros.js
*/
"use strict";
const path = require("path");
const RitmoControl = require("../../js/ritmo-control.js");

const DATOS = path.join(__dirname, "..", "datos");

/* elo: [[clave, calculo, ritmo]]; torneos: Map clave → { nombre, control,
   rondas, inicio }; corregidas: claves ya revisadas. Devuelve [{ clave,
   nombre, inicio, control, ficha, porque }], las más nuevas primero. */
function ritmosRaros(elo, torneos, corregidas = []) {
    const hechas = new Set(corregidas.map(Number));
    const raros = [];
    for (const [clave, calculo, ficha] of elo) {
        const t = torneos.get(Number(clave));
        if (calculo !== "nacional" || !t || hechas.has(Number(clave)) || !Number(t.rondas)) continue;
        const min = RitmoControl.minutos(t.control);
        let porque = "";
        if (ficha && min != null && ficha !== "clasico" && min >= 60) porque = `la ficha dice ${ficha} y el control da ${min} minutos (clásico)`;
        else if (ficha === "clasico" && min != null && min <= 20) porque = `la ficha dice clásico y el control da ${min} minutos`;
        else if (!ficha && min != null && min >= 40 && min < 60) porque = `la ficha no dice el ritmo y el control da ${min} minutos: rápido para FIDE, clásico para la mayoría de las fichas con Elo nacional`;
        else if (!ficha && !RitmoControl.deducir(t.control, t.nombre)) porque = "la ficha no dice el ritmo y no hay un tiempo que leer";
        if (porque) raros.push({ clave: Number(clave), nombre: t.nombre, inicio: t.inicio, control: t.control, ficha: ficha || "", porque });
    }
    return raros.sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)) || a.clave - b.clave);
}

function leer() {
    const elo = require(path.join(DATOS, "arbitros-cr-calculo-elo.json")).torneos;
    const torneos = new Map(require(path.join(DATOS, "arbitros-cr-chess-results.json")).torneos.map((t) => [Number(t.clave), t]));
    const corregir = require(path.join(DATOS, "arbitros-cr-ritmo-corregir.json")).corregir;
    return { elo, torneos, corregir };
}

if (require.main === module) {
    const { elo, torneos, corregir } = leer();
    const raros = ritmosRaros(elo, torneos, corregir.map((c) => c.clave));
    if (!raros.length) { console.log("Ritmos por revisar: ninguno."); process.exit(0); }
    console.log(`Ritmos por revisar (${raros.length}): mirar la página de cada uno y anotar el bueno en herramientas/datos/arbitros-cr-ritmo-corregir.json.`);
    for (const r of raros) console.log(`  https://chess-results.com/tnr${r.clave}.aspx?lan=2&turdet=YES  ${r.nombre} (${r.inicio}) · «${r.control}»: ${r.porque}`);
}

module.exports = { ritmosRaros, leer };
