#!/usr/bin/env node
/*
 * Comprueba que ninguna escucha de Realtime (`postgres_changes`) quede sin
 * filtro, salvo las que están anotadas abajo con su porqué.
 *
 * POR QUÉ EXISTE
 * Una escucha sin filtro funciona perfecto con diez personas: la página
 * descarta lo que no es suyo y nadie nota nada. Pero Realtime revisa la RLS de
 * CADA cambio contra CADA persona que escucha, en un solo hilo, así que el
 * costo crece al cuadrado con la gente conectada. El chat de la clase escuchaba
 * todos los mensajes de todas las clases, y las listas de Competir se volvían a
 * pedir enteras con cada jugada de cualquier partida (ver «Realtime escucha
 * solo lo que la pantalla muestra» en docs/decisiones/sitio-e-infraestructura.md).
 *
 * Los DELETE no cuentan: Realtime no los deja filtrar.
 *
 *   node herramientas/verificar-realtime-filtros.js
 */

const fs = require("fs");
const path = require("path");

const JS = path.join(__dirname, "..", "js");

/* archivo · tabla · evento → por qué va sin filtro. Agregar una línea acá es
   decidir que esa escucha puede recibir los cambios de toda la plataforma. */
const SIN_FILTRO = {
  "competir.js · game_rooms · INSERT": "la lista de partidas es de todos; nacer una es raro",
  "competir.js · fourplayer_games · INSERT": "ídem, cuatro jugadores",
  "juego-aviso.js · fourplayer_games · INSERT": "los asientos son un jsonb: no hay columna que filtrar; solo la arma quien da clase",
  "sesion.js · question_answers · *": "solo del lado de quien da clase; una respuesta por alumno y pregunta",
  "tv.js · game_rooms · *": "pantalla de TV: una o dos abiertas, no una por alumno",
  "tv.js · fourplayer_games · *": "ídem",
  "tv.js · tv_settings · UPDATE": "tabla de una fila",
  "partidas.js · archivos_pgn · *": "panel de quien da clase; cambios raros",
  "partidas.js · saved_games · *": "ídem",
};

let fallos = 0;
const vistos = new Set();

for (const nombre of fs.readdirSync(JS).filter((f) => f.endsWith(".js")).sort()) {
  const texto = fs.readFileSync(path.join(JS, nombre), "utf8");
  const re = /["']postgres_changes["']\s*,\s*\{/g;
  let m;
  while ((m = re.exec(texto))) {
    // El objeto de opciones: desde la llave hasta la que la cierra.
    let i = re.lastIndex, prof = 1;
    while (prof && i < texto.length) { if (texto[i] === "{") prof++; else if (texto[i] === "}") prof--; i++; }
    const opciones = texto.slice(re.lastIndex, i - 1);
    const evento = (opciones.match(/event\s*:\s*["']([^"']+)["']/) || [])[1] || "?";
    const tablaLit = (opciones.match(/table\s*:\s*["']([^"']+)["']/) || [])[1];
    const linea = texto.slice(0, m.index).split("\n").length;
    if (evento === "DELETE" || /\bfilter\b/.test(opciones)) continue;

    // `{ table }` abreviado (un for sobre varias tablas): se nombran todas.
    const tablas = tablaLit ? [tablaLit]
      : (texto.slice(Math.max(0, m.index - 300), m.index).match(/\[([^\]]*)\]\s*\)\s*\{[^]*$/) || [, ""])[1]
          .match(/["'][a-z_]+["']/g)?.map((t) => t.slice(1, -1)) || ["?"];
    for (const tabla of tablas) {
      const clave = `${nombre} · ${tabla} · ${evento}`;
      vistos.add(clave);
      if (!SIN_FILTRO[clave]) {
        console.log(`  ✗ ${nombre}:${linea} escucha ${evento} de ${tabla} SIN filtro`);
        fallos++;
      }
    }
  }
}

// Una excepción que ya no existe es una puerta abierta para la próxima.
for (const clave of Object.keys(SIN_FILTRO)) {
  if (!vistos.has(clave)) { console.log(`  ✗ la excepción «${clave}» ya no se usa: quitarla`); fallos++; }
}

if (fallos) { console.log(`\n${fallos} problema(s).`); process.exit(1); }
console.log(`  ✓ toda escucha de postgres_changes va filtrada (${Object.keys(SIN_FILTRO).length} excepciones anotadas)`);
