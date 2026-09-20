/*
 * El usuario de un alumno que no tiene correo propio — la parte del navegador.
 *
 * Un niño pequeño no tiene correo, y una familia con dos hijos tiene UNO solo
 * para los dos. No se puede repetir: el correo es la llave con la que se inicia
 * sesión y Supabase Auth lo exige único. Así que esos alumnos entran con un
 * USUARIO del dominio de la academia, que no recibe correo; todo lo que el
 * sitio le escribe a esa familia va al correo de la persona encargada.
 *
 * LO QUE ESTE ARCHIVO RESUELVE ES QUE EL NIÑO NO TENGA QUE ESCRIBIR EL DOMINIO.
 * Su usuario es `sofia.munoz@alumno.ajedrez-integral.com`, pero lo que escribe
 * para entrar es `sofia.munoz`: `completar()` le pega el resto. Pedirle a un
 * niño de siete años que escriba un correo largo cada vez que entra es pedirle
 * justo lo que esto vino a evitar — y dictárselo por teléfono a la mamá, peor.
 * Lo que sí tiene que seguir funcionando es escribirlo entero, porque es lo que
 * dice el correo que recibió la casa.
 *
 * EL DOMINIO ESTÁ ESCRITO EN TRES LUGARES, A LA FUERZA
 * Acá, en `supabase/functions/_compartido/usuario-alumno.ts` y en
 * `public.es_correo_interno()` de la base. Son tres tiempos de ejecución
 * distintos —navegador, Deno, Postgres— y ninguno puede leer al otro al vuelo.
 * `herramientas/verificar-alumno-sin-correo.js` falla si los tres no dicen lo
 * mismo: separados, alguien entraría por una puerta que la base no reconoce
 * como interna y el sitio volvería a mandarle correo a un buzón que no existe,
 * sin dar ningún error.
 */
(function (global) {
    "use strict";

    var DOMINIO = "alumno.ajedrez-integral.com";

    /** Si eso es un usuario de la academia y no una dirección que reciba correo. */
    function esInterno(valor) {
        return !!valor && String(valor).toLowerCase().endsWith("@" + DOMINIO);
    }

    /**
     * Lo que se manda a Supabase a partir de lo que se escribió. Un correo de
     * verdad se deja tal cual; un usuario pelado ("sofia.munoz") sale con el
     * dominio pegado.
     *
     * Se decide por el arroba y no por "¿tiene punto?": "sofia.munoz" tiene
     * punto y no es un correo, y "ana@gmail.com" tiene arroba y sí lo es.
     */
    function completar(valor) {
        var limpio = String(valor == null ? "" : valor).trim();
        if (!limpio) return "";
        // Se escribió el usuario entero, o un correo de verdad: no se toca más
        // que las mayúsculas, que en un correo no significan nada.
        if (limpio.indexOf("@") !== -1) return limpio.toLowerCase();
        return limpio.toLowerCase() + "@" + DOMINIO;
    }

    /** Cómo se le enseña a la gente: sin el dominio, que es ruido. */
    function soloUsuario(valor) {
        var limpio = String(valor == null ? "" : valor).trim();
        return esInterno(limpio) ? limpio.slice(0, limpio.lastIndexOf("@")) : limpio;
    }

    global.UsuarioAlumno = {
        DOMINIO: DOMINIO,
        esInterno: esInterno,
        completar: completar,
        soloUsuario: soloUsuario,
    };
})(window);
