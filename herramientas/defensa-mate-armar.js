#!/usr/bin/env node
/* Arma supabase/functions/_compartido/defensa-mate.js para la Edge Function
   examen-mate (los mates básicos del examen de rango Caballo).

   El rey que se defiende en el examen es el mismo de Entrenamiento: la
   heurística de «Con lo justo» (TiposReglas.defensaRey, js/tipos-reglas.js)
   y, para la dama, la distancia exacta al mate (FinalesDTM,
   herramientas/lib/finales-dtm.js), que se calcula en 0,3 s. Las dos fuentes
   son UNA: este script las pega tal cual en un módulo para Deno y le agrega
   los export. No se edita a mano; verificar-rangos-examen.js lo vuelve a
   armar y falla si no coincide.

   Por qué un archivo armado y no leerlos del sitio: el despliegue de las
   funciones solo corre cuando cambia algo en supabase/functions/ (ver
   .github/workflows/funciones.yml). Si la función los tomara del sitio, un
   cambio en js/tipos-reglas.js no la volvería a desplegar y el examen
   seguiría con el rey de antes, sin ningún error.

     node herramientas/defensa-mate-armar.js            # escribe el archivo
     node herramientas/defensa-mate-armar.js --comprobar  # sale con 1 si está viejo */

const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const DESTINO = path.join(RAIZ, "supabase/functions/_compartido/defensa-mate.js");
const FUENTES = ["js/tipos-reglas.js", "herramientas/lib/finales-dtm.js"];

// El sello de cada fuente es de esa fuente: no se repite adentro del armado.
const sinSello = (t) => t.replace(/\r\n/g, "\n").replace(/\n?\/\*! rev [0-9a-f]+ \*\/\s*$/, "\n");

function armar() {
    const partes = FUENTES.map((f) => `// ===== ${f} =====\n` + sinSello(fs.readFileSync(path.join(RAIZ, f), "utf8")));
    return "// Generado por herramientas/defensa-mate-armar.js a partir de " + FUENTES.join(" y ") + ".\n" +
        "// No se edita a mano. Ver la cabecera del script.\n" +
        partes.join("\n") +
        "\n// ===== los export para Deno =====\n" +
        "// js/tipos-reglas.js se cuelga de globalThis cuando no hay `module`.\n" +
        "export const TiposReglas = globalThis.TiposReglas;\n" +
        "export { FinalesDTM };\n";
}

if (require.main === module) {
    const texto = armar();
    if (process.argv.includes("--comprobar")) {
        const actual = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, "utf8").replace(/\r\n/g, "\n") : "";
        if (actual !== texto) { console.error("✗ " + path.relative(RAIZ, DESTINO) + " está viejo: corre node herramientas/defensa-mate-armar.js"); process.exit(1); }
        console.log("✓ defensa-mate.js al día");
    } else {
        fs.writeFileSync(DESTINO, texto);
        console.log("escrito " + path.relative(RAIZ, DESTINO));
    }
} else {
    module.exports = { armar, DESTINO, FUENTES };
}
