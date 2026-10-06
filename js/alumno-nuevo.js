/* alumno-nuevo.html: el profesor crea la cuenta de un alumno nuevo.

   Se llega desde la ficha «Crear cuenta de alumno» del panel (grupo «Tus
   alumnos»). La caja es la misma de formularios.html (js/alta-alumno.js) y
   manda a create-student, que gasta una invitación del cupo con
   consumir_invitacion(). Esta página solo ENSEÑA cuántas le quedan y, sin
   ninguna, la bloquea con el aviso de que hace falta un plan mayor. Si la
   pantalla se quedó vieja —otra pestaña gastó la última—, la base contesta
   `sin_cupo` y la caja lo dice igual; acá se vuelve a pintar bloqueada.
   Ver «La ficha Crear cuenta de alumno» en docs/decisiones/paneles.md. */
let perfil = null;

function pintarCupo() {
    const c = CupoInvitaciones.de(perfil);
    const sinCupo = !c.ilimitado && c.restantes === 0;
    document.getElementById("cupo").hidden = sinCupo;
    document.getElementById("sin-cupo").hidden = !sinCupo;
    document.getElementById("cupo-texto").textContent = CupoInvitaciones.textoQuedan(c);
    document.getElementById("sin-cupo-texto").textContent = CupoInvitaciones.textoSinCupo(c.max);
}

/* Lo que quedó de verdad lo dice la base: se vuelve a leer la fila después
   de cada alta, en vez de restar uno en pantalla. */
async function releerCupo() {
    const { data } = await sb.from("profiles")
        .select("invitaciones_max, invitaciones_usadas, is_admin")
        .eq("id", perfil.id).maybeSingle();
    if (data) Object.assign(perfil, data);
    if (window.MiPerfil) MiPerfil.olvidar();
    pintarCupo();
}

async function init() {
    const { data } = await sb.auth.getSession();
    const session = data.session;
    if (!session) { location.href = "login.html?next=alumno-nuevo.html"; return; }

    const { data: p } = window.MiPerfil ? await MiPerfil.obtener(session.user.id)
        : await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    perfil = p;
    document.getElementById("loading").classList.add("hidden");
    // La base es la que de verdad lo impide (consumir_invitacion pide
    // role = 'profesor' o is_admin); esto es para no enseñar lo que no toca.
    if (!perfil || !(perfil.role === "profesor" || perfil.is_admin)) {
        document.getElementById("denegado").classList.remove("hidden");
        return;
    }
    AltaAlumno.montar(perfil);
    const boton = document.getElementById("crear-btn");
    boton.addEventListener("click", () => AltaAlumno.abrir({
        volverEl: boton,
        alCrear: releerCupo,
        alSinCupo: releerCupo,
    }));
    pintarCupo();
    document.getElementById("app").classList.remove("hidden");
}
init();
