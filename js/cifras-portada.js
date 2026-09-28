/* Las cifras de la portada: estudiantes, centros educativos, provincias y
   cantones.

   Salen de dos bases, cada una por una función que devuelve totales y nada más
   (ver «Las cifras de la portada» en docs/decisiones/paneles.md):

   - `cifras_torneos()`, en la base de Colegios, que es donde inscripcion.html
     guarda las inscripciones a los torneos en línea: estudiantes (por cédula),
     centros, provincias y cantones.
   - `cifras_academia()`, en la base de la Academia: las cuentas de alumno, sin
     las de prueba.

   Estudiantes es la SUMA de las dos. Se piden en cada visita, así que un
   inscrito o una cuenta nueva aparece en la siguiente carga sin tocar nada.
   Si una consulta falla, quedan las cifras escritas en el HTML. */
(function () {
    var FUENTES = {
        // La clave pública de la base de Colegios, la misma de js/inscripcion-datos.js.
        torneos: {
            url: "https://prcfbzvshnusisczlpxl.supabase.co/rest/v1/rpc/cifras_torneos",
            clave: "sb_publishable_jZ-HV-E6d8zUfeA5ruTLvg_tHsYYllZ",
        },
        // La de la Academia, la misma de js/supabase-client.js: cargar ese
        // cliente (y la librería entera) en la portada solo para esto pesaría
        // bastante más que la portada misma.
        academia: {
            url: "https://bgtijpimpcokxatxxbki.supabase.co/rest/v1/rpc/cifras_academia",
            clave: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJndGlqcGltcGNva3hhdHh4YmtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5ODczMjksImV4cCI6MjEwNDU2MzMyOX0.h-AcAEQNaYMVo5UVtdWqUCTYgiSLFKDgXsn3lnbAhmQ",
        },
    };

    var nodos = document.querySelectorAll("[data-cifra]");
    if (!nodos.length || !window.fetch || !window.Promise) return;

    function pedir(fuente) {
        return fetch(fuente.url, {
            method: "POST",
            headers: { apikey: fuente.clave, "Content-Type": "application/json" },
            body: "{}",
        })
            .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(String(r.status))); })
            .then(function (filas) { return (Array.isArray(filas) ? filas[0] : filas) || null; })
            .catch(function () { return null; });
    }

    // Un cero o algo raro no cuenta: sería una consulta que salió mal, no que se
    // fueron todos.
    function numero(v) {
        var n = Number(v);
        return v !== null && v !== "" && Number.isFinite(n) && n > 0 ? n : null;
    }

    Promise.all([pedir(FUENTES.torneos), pedir(FUENTES.academia)]).then(function (r) {
        var torneos = r[0] || {}, academia = r[1] || {};
        var inscritos = numero(torneos.estudiantes), alumnos = numero(academia.alumnos);
        var cifras = {
            // La suma solo si contestaron las dos: con una sola saldría por
            // debajo de la real, y mejor queda la escrita.
            estudiantes: inscritos != null && alumnos != null ? inscritos + alumnos : null,
            centros: numero(torneos.centros),
            provincias: numero(torneos.provincias),
            cantones: numero(torneos.cantones),
        };
        nodos.forEach(function (nodo) {
            var valor = cifras[nodo.getAttribute("data-cifra")];
            if (valor != null) nodo.textContent = valor.toLocaleString("es-CR");
        });
    });
})();
