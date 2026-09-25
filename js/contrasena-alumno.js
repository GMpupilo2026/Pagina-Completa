/*
 * «Su contraseña»: ponerle la contraseña a un alumno que entra con usuario de
 * la Academia.
 *
 * Un niño pequeño no abre el correo de la casa para crear su contraseña: se la
 * pone quien le da clase o quien coordina, y se la da junto con su usuario. Lo
 * usan dos pantallas —la ficha de `coordinacion.html` y la tarjeta «Acceso a
 * la cuenta» de `informes.html`, que es por donde el profesor mira a cada
 * alumno—, así que vive acá y no copiado en las dos.
 *
 * QUIÉN PUEDE LO DECIDE EL SERVIDOR. La acción `contrasena` de `correos-alumno`
 * acepta a quien tiene la función de «cuentas» (y a quien administra) o a un
 * profesor de ese alumno (`soy_profesor_de()`), y solo si el alumno entra con
 * usuario: la contraseña de quien tiene correo propio es de esa persona. Esta
 * pantalla solo esconde el control cuando no toca.
 *
 *   const c = ContrasenaAlumno.montar(contenedor, {
 *       alumnoId, nombre, usuario: () => email_actual,
 *   });
 *   c.pintar();   // vuelve a decidir si se ve (p. ej. al darle un usuario)
 *
 * Necesita js/usuario-alumno.js, js/avisos.js y window.sb.
 */
(function (global) {
    "use strict";

    var MINIMO = 8;   // lo mismo que pide bienvenida.html

    /* Una que un niño pueda escribir y recordar: una palabra del ajedrez y tres
       números («caballo482»). Los números salen de crypto, no de Math.random.
       Se propone, no se impone: se puede cambiar antes de ponerla. */
    var PALABRAS = ["torre", "alfil", "caballo", "dama", "jaque", "enroque", "tablero", "peon", "reina", "casilla"];
    function claveFacil() {
        var n = new Uint32Array(2);
        crypto.getRandomValues(n);
        var palabra = PALABRAS[n[0] % PALABRAS.length];
        return palabra + String(n[1] % 1000).padStart(3, "0") + (palabra.length < 5 ? String(n[1] % 10) : "");
    }

    function el(tag, clase, texto) {
        var e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }

    var BOTON = "px-4 py-2 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";

    function montar(contenedor, opciones) {
        var caja = el("div", "mt-4 pt-4 border-t border-brand-100 dark:border-brand-800");
        caja.appendChild(el("h3", "font-semibold text-sm text-brand-700 dark:text-brand-200 mb-2", "Su contraseña"));

        /* Es de texto, no de contraseña, a propósito: es para dictársela al
           alumno. Y sin autocompletar: el navegador ofrecería la de quien
           está usando la computadora. */
        var etiqueta = el("label", "block");
        etiqueta.appendChild(el("span", "block text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mb-1", "Contraseña nueva"));
        var input = document.createElement("input");
        input.type = "text";
        input.className = "w-full px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        ["autocomplete", "off", "autocapitalize", "none", "autocorrect", "off", "spellcheck", "false"].forEach(function (v, i, a) {
            if (i % 2 === 0) input.setAttribute(v, a[i + 1]);
        });
        etiqueta.appendChild(input);
        caja.appendChild(etiqueta);
        caja.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 mt-2",
            "Al menos " + MINIMO + " caracteres. Se ve mientras la escribes porque es para dársela al alumno "
            + "junto con su usuario; la que tenía deja de servir."));

        var botones = el("div", "flex flex-wrap gap-2 mt-3");
        var proponer = el("button", BOTON + " border border-brand-200 dark:border-brand-700 hover:border-accent-400", "Proponer una fácil");
        proponer.type = "button";
        proponer.addEventListener("click", function () { input.value = claveFacil(); input.focus(); });
        var poner = el("button", BOTON + " bg-accent-500 hover:bg-accent-600 text-brand-900", "Poner esta contraseña");
        poner.type = "button";
        poner.addEventListener("click", function () { ponerla(opciones, input, poner); });
        botones.append(proponer, poner);
        caja.appendChild(botones);
        contenedor.appendChild(caja);

        function pintar() { caja.hidden = !global.UsuarioAlumno.esInterno(opciones.usuario()); }
        pintar();
        return { pintar: pintar, caja: caja };
    }

    async function ponerla(opciones, input, boton) {
        var valor = input.value;
        if (valor.length < MINIMO) {
            Avisos.avisar("La contraseña tiene que tener al menos " + MINIMO + " caracteres.", { tipo: "error" });
            input.focus();
            return;
        }
        boton.disabled = true;
        boton.textContent = "Poniéndola…";
        try {
            // El token se pide fresco: el de la sesión guardada al cargar la
            // página es una foto de un momento y el access_token vence.
            var fresca = (await global.sb.auth.getSession()).data.session;
            if (!fresca) throw new Error("Tu sesión venció: vuelve a entrar.");
            var res = await fetch(global.SUPABASE_URL + "/functions/v1/correos-alumno", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + fresca.access_token,
                    "apikey": global.SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({ action: "contrasena", alumno_id: opciones.alumnoId, contrasena: valor }),
            });
            var datos = await res.json().catch(function () { return {}; });
            if (!res.ok || datos.error) throw new Error(datos.error || "El servidor respondió " + res.status);
            Avisos.avisar("Listo. " + opciones.nombre + " entra con el usuario «"
                + global.UsuarioAlumno.soloUsuario(datos.usuario || opciones.usuario())
                + "» y la contraseña «" + valor + "».", { tipo: "ok" });
            input.value = "";
        } catch (err) {
            Avisos.avisar("No se pudo poner: " + err.message, { tipo: "error" });
        }
        boton.disabled = false;
        boton.textContent = "Poner esta contraseña";
    }

    global.ContrasenaAlumno = { montar: montar, claveFacil: claveFacil, MINIMO: MINIMO };
})(window);
