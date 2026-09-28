/* Las cifras de la portada: cuántos estudiantes, centros educativos,
   provincias y cantones hay inscritos en los torneos en línea.

   Salen de `public.cifras_torneos()`, en la base de Colegios, que es donde
   inscripcion.html guarda las inscripciones. La tabla no la lee nadie desde
   el navegador (son cédulas de menores): la función devuelve cuatro números y
   nada más, y se le dio execute a `anon` a propósito, porque la portada se abre
   sin cuenta. Ver «Las cifras de la portada» en docs/decisiones/paneles.md.

   Se piden en cada visita, así que un inscrito nuevo aparece en la siguiente
   carga sin tocar nada. Si la consulta falla, quedan las escritas en el HTML. */
(function () {
    var URL = "https://prcfbzvshnusisczlpxl.supabase.co/rest/v1/rpc/cifras_torneos";
    // La clave pública de ese proyecto: es la misma que ya está en js/inscripcion-datos.js.
    var CLAVE = "sb_publishable_jZ-HV-E6d8zUfeA5ruTLvg_tHsYYllZ";

    var nodos = document.querySelectorAll("[data-cifra]");
    if (!nodos.length || !window.fetch) return;

    fetch(URL, {
        method: "POST",
        headers: { apikey: CLAVE, "Content-Type": "application/json" },
        body: "{}",
    })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(String(r.status))); })
        .then(function (filas) {
            var cifras = Array.isArray(filas) ? filas[0] : filas;
            if (!cifras) return;
            nodos.forEach(function (nodo) {
                var valor = Number(cifras[nodo.getAttribute("data-cifra")]);
                // Un cero o algo raro no pisa la cifra escrita: sería una
                // consulta que salió mal, no que se fueron todos.
                if (Number.isFinite(valor) && valor > 0) nodo.textContent = valor.toLocaleString("es-CR");
            });
        })
        .catch(function () { /* se quedan las del HTML */ });
})();
