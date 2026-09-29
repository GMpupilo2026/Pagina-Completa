/* El código de sesion.html.

   Que vean la clase sin cuenta: el profe crea un enlace (ver-clase.html#t=…)
   para quien todavía no tiene usuario. Esa persona ve el tablero en pantalla
   completa, siguiendo lo que mira el profe, sin tocar nada. Si se sale de la
   pantalla, al profe le llega el aviso acá (Realtime sobre clase_espectadores)
   y al invitado se le advierte; la segunda vez deja de verlo. Quien decide
   qué ve el invitado es la base (clase_invitado_ver), no esta pantalla.
   Ver «La clase vista por invitados sin cuenta» en docs/decisiones/clase-en-vivo.md.

   Como las demás partes de la clase (ver «sesion.js en partes»), un script
   clásico cargado ANTES que sesion.js: lo monta init() solo para quien da la
   clase, en la ventana de siempre (ni el proyector ni el control remoto). */

window.ClaseInvitados = (function () {
    const COLUMNAS = "id, nombre, entro_at, visto_at, salidas, bloqueado_at";
    // Sin noticias de un invitado en un minuto: cerró la página.
    const SE_FUE_MS = 60 * 1000;

    function enlace(origen, token) {
        return String(origen).replace(/\/+$/, "") + "/ver-clase.html#t=" + encodeURIComponent(token);
    }

    // Lo que se escribe al lado de cada nombre: el dato va escrito, no en un color.
    function estado(inv, ahora) {
        if (inv.bloqueado_at) return inv.salidas >= 2 ? "🚫 se salió dos veces: ya no ve el tablero" : "🚫 lo sacaste: ya no ve el tablero";
        const partes = [ahora - new Date(inv.visto_at).getTime() > SE_FUE_MS ? "se fue" : "mirando"];
        if (inv.salidas === 1) partes.push("⚠️ se salió 1 vez");
        return partes.join(" · ");
    }

    function montar(sb, profesorId) {
        const $ = (id) => document.getElementById(id);
        const seccion = $("invitados");
        if (!seccion) return;
        seccion.hidden = false;
        let token = null;
        const invitados = new Map();

        function msg(t) { $("invitados-msg").textContent = t || ""; }

        function pintarEnlace() {
            $("invitados-crear").hidden = !!token;
            $("invitados-enlace").hidden = !token;
            $("invitados-url").value = token ? enlace(location.origin, token) : "";
        }

        function pintarLista() {
            const ul = $("invitados-lista");
            ul.textContent = "";
            const ahora = Date.now();
            const lista = [...invitados.values()].sort((a, b) => String(b.entro_at).localeCompare(String(a.entro_at)));
            if (!lista.length) {
                const li = document.createElement("li");
                li.className = "text-brand-450 dark:text-brand-350";
                li.textContent = token ? "Todavía no entró nadie con el enlace." : "Nadie: el enlace no está creado.";
                ul.appendChild(li);
                return;
            }
            for (const inv of lista) {
                const li = document.createElement("li");
                li.className = "flex items-center justify-between gap-2";
                const txt = document.createElement("span");
                const nom = document.createElement("strong");
                nom.className = "text-brand-800 dark:text-white";
                nom.textContent = inv.nombre;
                txt.append(nom, " — " + estado(inv, ahora));
                li.appendChild(txt);
                if (!inv.bloqueado_at) {
                    const b = document.createElement("button");
                    b.type = "button";
                    b.className = "shrink-0 text-xs font-semibold px-2 py-1 rounded bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200";
                    b.textContent = "Sacar";
                    b.setAttribute("aria-label", "Sacar a " + inv.nombre + " de la clase");
                    b.addEventListener("click", () => sacar(inv));
                    li.appendChild(b);
                }
                ul.appendChild(li);
            }
        }

        async function cargar() {
            const { data: e } = await sb.from("clase_enlaces").select("token").is("apagado_at", null).maybeSingle();
            token = e ? e.token : null;
            invitados.clear();
            if (token) {
                const { data } = await sb.from("clase_espectadores").select(COLUMNAS)
                    .eq("owner_id", profesorId).order("entro_at", { ascending: false }).range(0, 99);
                for (const inv of data || []) invitados.set(inv.id, inv);
            }
            pintarEnlace();
            pintarLista();
        }

        async function obtener(nuevo) {
            const { data, error } = await sb.rpc("clase_enlace_obtener", { p_nuevo: !!nuevo });
            if (error || !data || !data.token) { msg("No se pudo crear el enlace: " + (error ? error.message : "inténtalo de nuevo.")); return false; }
            token = data.token;
            if (nuevo) invitados.clear();
            pintarEnlace();
            pintarLista();
            return true;
        }

        async function sacar(inv) {
            const ok = await Avisos.confirmar(inv.nombre + " deja de ver el tablero y no puede volver a entrar desde esa conexión.",
                { titulo: "¿Sacar a " + inv.nombre + "?", aceptar: "Sacarlo de la clase", peligro: true });
            if (!ok) return;
            const { error } = await sb.rpc("clase_enlace_sacar", { p_espectador: inv.id });
            if (error) { Avisos.avisar("No se pudo: " + error.message, { tipo: "error" }); return; }
            invitados.set(inv.id, Object.assign({}, inv, { bloqueado_at: new Date().toISOString() }));
            pintarLista();
        }

        /* Lo que cambia de un invitado. El aviso es por la SALIDA, no por cada
           fila que llega: visto_at también cambia cada 20 s mientras mira. */
        function recibir(nuevo, esNuevo) {
            const antes = invitados.get(nuevo.id);
            invitados.set(nuevo.id, Object.assign({}, antes || {}, nuevo));
            if (esNuevo) {
                Avisos.avisar("👀 " + nuevo.nombre + " entró a mirar la clase con el enlace de invitados.", { tipo: "info" });
            } else if (antes && nuevo.salidas > (antes.salidas || 0)) {
                if (nuevo.bloqueado_at) {
                    Avisos.avisar("🚫 " + nuevo.nombre + " (invitado) se salió de la pantalla por segunda vez: ya no puede ver el tablero.", { tipo: "error" });
                } else {
                    Avisos.avisar("⚠️ " + nuevo.nombre + " (invitado) se salió de la pantalla. Se le advirtió: si vuelve a salir, deja de ver el tablero.", { tipo: "info", duracion: 10000 });
                }
            }
            pintarLista();
        }

        // Borrar no se escucha: Realtime no deja filtrar los DELETE, y solo
        // borra el propio profe (al apagar el enlace), que ya lo pinta.
        const escucha = (evento) => (p) => { if (p.eventType === evento && p.new && p.new.id) recibir(p.new, evento === "INSERT"); };
        sb.channel("invitados-clase:" + profesorId)
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "clase_espectadores", filter: "owner_id=eq." + profesorId }, escucha("INSERT"))
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "clase_espectadores", filter: "owner_id=eq." + profesorId }, escucha("UPDATE"))
            .subscribe();

        $("invitados-crear").addEventListener("click", async () => {
            if (await obtener(false)) msg("Listo: copia el enlace y compártelo. Funciona mientras la clase esté abierta.");
        });
        $("invitados-copiar").addEventListener("click", async () => {
            const url = $("invitados-url").value;
            try { await navigator.clipboard.writeText(url); msg("Enlace copiado. Pégalo en WhatsApp o en el correo."); }
            catch (e) { $("invitados-url").select(); msg("Selecciona el enlace y cópialo (Ctrl + C)."); }
        });
        $("invitados-cambiar").addEventListener("click", async () => {
            const ok = await Avisos.confirmar("El enlace de ahora deja de servir y quien esté mirando con él deja de ver el tablero. Vas a tener que compartir el nuevo.",
                { titulo: "¿Cambiar el enlace?", aceptar: "Cambiar el enlace", peligro: true });
            if (ok && await obtener(true)) msg("Enlace nuevo listo. El de antes ya no sirve.");
        });
        $("invitados-apagar").addEventListener("click", async () => {
            const ok = await Avisos.confirmar("Nadie más puede entrar con el enlace y quien esté mirando deja de ver el tablero.",
                { titulo: "¿Apagar el enlace?", aceptar: "Apagar el enlace", peligro: true });
            if (!ok) return;
            const { error } = await sb.rpc("clase_enlace_apagar");
            if (error) { msg("No se pudo apagar: " + error.message); return; }
            token = null;
            invitados.clear();
            pintarEnlace();
            pintarLista();
            msg("Enlace apagado.");
        });
        // «Mirando» pasa a «se fue» sin que llegue nada: se vuelve a pintar solo.
        setInterval(pintarLista, 30 * 1000);
        cargar();
    }

    return { montar, enlace, estado };
})();
