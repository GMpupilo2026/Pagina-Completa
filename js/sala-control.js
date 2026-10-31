/* sala-admin.html: lo que se hace MIENTRAS corre una arena y al terminarla.

   Va aparte de sala-admin.js (que arma los equipos y las cuentas) y se carga
   ANTES: son scripts clásicos que comparten el mismo ámbito, así que esto usa
   `el`, `boton`, `hacer`, `llamar`, `$` y los estilos de sala-admin.js, que ya
   estarán definidos cuando se ejecute algo de acá.

   · El PANEL DE CONTROL de una arena: pausarla, sumarle minutos, cerrarla
     antes de tiempo, cancelar una partida que se está jugando y sacar a un
     jugador de ella (o dejarlo volver). Se vuelve a leer solo cada 5 segundos
     mientras está abierto.
   · La pantalla para PROYECTAR: la clasificación grande, que se actualiza sola
     (`sala-admin.html?proyector=<id>`). La lee la Edge Function con la sesión
     de la Academia: quien proyecta no es un jugador de la sala.
   · Los RESULTADOS: el podio, la clasificación en Excel (CSV) y los diplomas
     para imprimir, con la marca de agua de Ajedrez Integral.
   · Las partidas en PGN.

   Todo lo que lleva el nombre de una persona entra por `textContent`. */

const abiertos = { control: new Set(), resultados: new Set() };
const sondeos = new Map();   // id de arena → intervalo del panel de control

/* Cuándo acaba una arena: lo previsto, o antes si se cerró a mano. */
function finDeArena(t) {
    const previsto = Date.parse(t.inicia) + t.minutos * 60000;
    return t.cerrada_en ? Math.min(previsto, Date.parse(t.cerrada_en)) : previsto;
}

/* proxima | en_curso | pausada | terminada */
function estadoTorneo(t, ahora) {
    const ya = ahora == null ? Date.now() : ahora;
    if (ya < Date.parse(t.inicia)) return "proxima";
    if (ya >= finDeArena(t)) return "terminada";
    return t.pausada ? "pausada" : "en_curso";
}

function mmss(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    const dos = (n) => String(n).padStart(2, "0");
    return h ? h + ":" + dos(m) + ":" + dos(r) : m + ":" + dos(r);
}

function detenerControles() {
    sondeos.forEach((id) => clearInterval(id));
    sondeos.clear();
}

/* ------------------------------------------------------- panel de control */

function alternarControl(t, disparador, caja) {
    if (!caja.hidden) { cerrarControl(t, disparador, caja); return; }
    abiertos.control.add(t.id);
    caja.hidden = false;
    disparador.setAttribute("aria-expanded", "true");
    montarControl(t, caja);
}

function cerrarControl(t, disparador, caja) {
    abiertos.control.delete(t.id);
    clearInterval(sondeos.get(t.id));
    sondeos.delete(t.id);
    caja.hidden = true;
    caja.textContent = "";
    disparador.setAttribute("aria-expanded", "false");
}

function montarControl(t, caja) {
    caja.textContent = "";
    const resumen = el("p", "text-sm font-semibold mt-3");
    resumen.setAttribute("role", "status");
    const acciones = el("div", "flex flex-wrap gap-2 mt-2");
    const enJuego = el("div");
    const jugadores = el("div");
    const recientes = el("div");
    caja.appendChild(resumen);
    caja.appendChild(acciones);
    caja.appendChild(enJuego);
    caja.appendChild(jugadores);
    caja.appendChild(recientes);

    /* Pausar / reanudar, sumar minutos y cerrar: los botones dependen del
       estado, así que se rehacen en cada lectura. */
    const pintarAcciones = (torneo) => {
        acciones.textContent = "";
        const estado = estadoTorneo(torneo);
        if (estado === "terminada") {
            acciones.appendChild(boton("Sumar 10 minutos y reabrirla", BOTON_SECUNDARIO, async () => {
                if (await hacer("extender_arena", { id: t.id, minutos: 10 }, "Arena alargada 10 minutos.")) await recargar();
            }, "Sumar 10 minutos a la arena " + t.nombre));
            return;
        }
        if (estado === "proxima") return;
        acciones.appendChild(boton(torneo.pausada ? "Reanudar la arena" : "Pausar la arena", BOTON_SECUNDARIO, async () => {
            const pausar = !torneo.pausada;
            if (await hacer("pausar_arena", { id: t.id, pausada: pausar }, pausar ? "Arena en pausa." : "Arena reanudada.")) await recargar();
        }, (torneo.pausada ? "Reanudar" : "Pausar") + " la arena " + t.nombre));
        acciones.appendChild(boton("Sumar 10 minutos", BOTON_SECUNDARIO, async () => {
            if (await hacer("extender_arena", { id: t.id, minutos: 10 }, "Arena alargada 10 minutos.")) await recargar();
        }, "Sumar 10 minutos a la arena " + t.nombre));
        acciones.appendChild(boton("Terminarla ahora", BOTON_PELIGRO, async () => {
            const si = await Avisos.confirmar("Nadie se vuelve a emparejar. Las partidas que ya empezaron terminan.",
                { titulo: "¿Terminar «" + t.nombre + "» ahora?", aceptar: "Terminar la arena", peligro: true });
            if (si && await hacer("terminar_arena", { id: t.id }, "Arena terminada.")) await recargar();
        }, "Terminar ahora la arena " + t.nombre));
    };

    /* Sacar a un jugador: la lista de todos y, aparte, quienes ya están fuera. */
    const selector = el("select", CAMPO + " text-xs");
    selector.setAttribute("aria-label", "Jugador para sacar de la arena " + t.nombre);
    const sacar = boton("Sacar de esta arena", BOTON_PELIGRO, async () => {
        const j = sala.jugadores.find((x) => x.id === selector.value);
        if (!j) { Avisos.avisar("Elige a quién sacar.", { tipo: "error" }); return; }
        const si = await Avisos.confirmar("No podrá volver a entrar a esta arena y, si está jugando, su partida se cancela. Lo puedes dejar volver cuando quieras.",
            { titulo: "¿Sacar a " + j.nombre + "?", aceptar: "Sacarlo de la arena", peligro: true });
        if (si && await hacer("expulsar", { torneo_id: t.id, jugador_id: j.id }, j.nombre + " ya no está en la arena.")) await leer();
    }, "Sacar de la arena " + t.nombre + " al jugador elegido");
    const titulo = el("h4", "font-semibold text-sm mt-4 mb-1", "Jugadores");
    const filaSacar = el("div", "flex flex-wrap items-center gap-2");
    filaSacar.appendChild(selector);
    filaSacar.appendChild(sacar);
    const fuera = el("ul", "mt-2 flex flex-wrap gap-2");
    jugadores.appendChild(titulo);
    jugadores.appendChild(filaSacar);
    jugadores.appendChild(fuera);
    const opciones = sala.jugadores.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const vacia = el("option", null, "Elige un jugador…");
    vacia.value = "";
    selector.appendChild(vacia);
    opciones.forEach((j) => {
        const o = el("option", null, j.nombre + (j.equipo_id ? " · " + nombreDeEquipo(j.equipo_id) : ""));
        o.value = j.id;
        selector.appendChild(o);
    });

    const pintarPartidas = (cont, lista, titulo2, vacio, conCancelar) => {
        cont.textContent = "";
        cont.appendChild(el("h4", "font-semibold text-sm mt-4 mb-1", titulo2 + " (" + lista.length + ")"));
        if (!lista.length) { cont.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350", vacio)); return; }
        lista.forEach((p) => {
            const f = el("div", "flex flex-wrap items-center justify-between gap-2 py-1.5 border-b border-brand-50 dark:border-brand-800/60 text-sm");
            const detalle = conCancelar
                ? p.jugadas + " jugadas"
                : (p.anulada ? "anulada" : (p.resultado || "sin resultado")) + (p.motivo ? " (" + p.motivo + ")" : "");
            f.appendChild(el("span", null, p.nombre_blancas + " – " + p.nombre_negras + " · " + detalle));
            if (conCancelar) {
                f.appendChild(boton("Cancelar partida", BOTON_PELIGRO, async () => {
                    const si = await Avisos.confirmar("La partida se cancela sin resultado: no cuenta para nadie y ninguno de los dos recibe puntos.",
                        { titulo: "¿Cancelar «" + p.nombre_blancas + " – " + p.nombre_negras + "»?", aceptar: "Cancelar la partida", peligro: true });
                    if (si && await hacer("abortar_partida", { id: p.id }, "Partida cancelada.")) await leer();
                }, "Cancelar la partida de " + p.nombre_blancas + " contra " + p.nombre_negras));
            }
            cont.appendChild(f);
        });
    };

    const leer = async () => {
        let r;
        try {
            r = await llamar("control", { torneo_id: t.id });
        } catch (err) {
            resumen.textContent = err.message;
            return;
        }
        if (caja.hidden) return;
        const torneo = r.torneo;
        const idx = sala.torneos.findIndex((x) => x.id === t.id);
        if (idx >= 0) sala.torneos[idx] = torneo;
        const ahora = Date.parse(r.ahora) || Date.now();
        const estado = estadoTorneo(torneo, ahora);
        resumen.textContent = ETIQUETA_ESTADO[estado]
            + (estado === "en_curso" || estado === "pausada" ? " · quedan " + mmss(finDeArena(torneo) - ahora) : "")
            + " · " + r.en_juego.length + (r.en_juego.length === 1 ? " partida en juego" : " partidas en juego")
            + " · " + r.esperando + (r.esperando === 1 ? " esperando rival" : " esperando rival");
        pintarAcciones(torneo);
        pintarPartidas(enJuego, r.en_juego, "Partidas en juego", "Ahora no se está jugando ninguna.", true);
        pintarPartidas(recientes, r.recientes, "Últimas partidas terminadas", "Todavía no terminó ninguna.", false);
        fuera.textContent = "";
        r.fuera.forEach((id) => {
            const j = sala.jugadores.find((x) => x.id === id);
            const li = el("li", "flex items-center gap-2 rounded-full bg-red-50 dark:bg-red-950 px-3 py-1 text-xs");
            li.appendChild(el("span", null, "Fuera: " + (j ? j.nombre : "jugador")));
            li.appendChild(boton("Dejarlo volver", BOTON_SECUNDARIO, async () => {
                if (await hacer("expulsar", { torneo_id: t.id, jugador_id: id, fuera: false }, (j ? j.nombre : "El jugador") + " puede volver a entrar.")) await leer();
            }, "Dejar volver a la arena a " + (j ? j.nombre : "este jugador")));
            fuera.appendChild(li);
        });
    };

    clearInterval(sondeos.get(t.id));
    leer();
    sondeos.set(t.id, setInterval(leer, 5000));
}

const ETIQUETA_ESTADO = { proxima: "Próxima", en_curso: "En curso", pausada: "En pausa", terminada: "Terminada" };

/* ---------------------------------------------------------- proyectar */

function abrirProyector(t) {
    const url = location.pathname + "?proyector=" + encodeURIComponent(t.id);
    window.open(url, "_blank", "noopener");
}

/* La pantalla grande: se pinta con lo que devuelve «control» y se actualiza sola. */
async function iniciarProyector(id) {
    document.body.classList.add("proyectando");
    $("proyector").hidden = false;
    $("proy-titulo").focus();
    let desfase = 0;            // hora del servidor - hora de este equipo
    let torneo = null;
    let ultimo = null;

    const pintarReloj = () => {
        if (!torneo) return;
        const ahora = Date.now() + desfase;
        const estado = estadoTorneo(torneo, ahora);
        $("proy-reloj").textContent = estado === "proxima" ? "Empieza en " + mmss(Date.parse(torneo.inicia) - ahora)
            : estado === "terminada" ? "Terminó" : "Quedan " + mmss(finDeArena(torneo) - ahora);
    };

    const pintar = (r) => {
        torneo = r.torneo;
        desfase = (Date.parse(r.ahora) || Date.now()) - Date.now();
        $("proy-titulo").textContent = torneo.nombre;
        document.title = torneo.nombre + " — Sala de arena";
        const estado = estadoTorneo(torneo, Date.now() + desfase);
        $("proy-detalle").textContent = torneo.minutos + " minutos · partidas de " + (torneo.inicial_seg / 60) + "+" + torneo.incremento_seg
            + (torneo.por_equipos ? " · por equipos: cuentan los " + torneo.mejores + " mejores de cada uno" : " · individual");
        const aviso = $("proy-aviso");
        aviso.hidden = estado !== "pausada" && estado !== "terminada";
        aviso.textContent = estado === "pausada" ? "⏸️ La arena está en pausa" : estado === "terminada" ? "🏆 ¡Terminó la arena!" : "";
        const cl = r.clasificacion || { equipos: [], jugadores: [] };
        const racha = new Set(r.racha || []);
        $("proy-card-equipos").hidden = !torneo.por_equipos;

        const equipos = (cl.equipos || []).slice(0, 8);
        const mayor = Math.max(1, ...equipos.map((e) => e.puntos));
        const ulE = $("proy-equipos");
        ulE.textContent = "";
        equipos.forEach((e, i) => {
            const li = el("li", "proy-fila");
            li.appendChild(el("span", "proy-puesto", i < 3 ? MEDALLAS[i] : String(i + 1)));
            if (i < 3) li.lastChild.appendChild(el("span", "sr-only", " " + (i + 1) + "." + "º lugar"));
            const medio = el("span", "proy-medio");
            medio.appendChild(el("span", "proy-nombre", e.nombre));
            const barra = el("span", "proy-barra");
            const relleno = el("span", "proy-relleno");
            relleno.style.width = Math.max(2, Math.round((e.puntos / mayor) * 100)) + "%";
            barra.appendChild(relleno);
            medio.appendChild(barra);
            li.appendChild(medio);
            li.appendChild(el("span", "proy-puntos", String(e.puntos)));
            ulE.appendChild(li);
        });
        if (!equipos.length) ulE.appendChild(el("li", "proy-vacio", "Todavía no hay puntos."));

        const ulJ = $("proy-jugadores");
        ulJ.textContent = "";
        (cl.jugadores || []).slice(0, 10).forEach((j, i) => {
            const li = el("li", "proy-fila");
            li.appendChild(el("span", "proy-puesto", i < 3 ? MEDALLAS[i] : String(i + 1)));
            if (i < 3) li.lastChild.appendChild(el("span", "sr-only", " " + (i + 1) + "." + "º lugar"));
            const medio = el("span", "proy-medio");
            const nom = el("span", "proy-nombre", j.nombre);
            if (racha.has(j.id)) { nom.appendChild(el("span", null, " 🔥")); nom.appendChild(el("span", "sr-only", " en racha")); }
            medio.appendChild(nom);
            if (j.equipo) medio.appendChild(el("span", "proy-equipo", j.equipo));
            li.appendChild(medio);
            li.appendChild(el("span", "proy-puntos", String(j.puntos)));
            ulJ.appendChild(li);
        });
        if (!(cl.jugadores || []).length) ulJ.appendChild(el("li", "proy-vacio", "Nadie ha jugado todavía."));

        $("proy-pie").textContent = r.en_juego.length + (r.en_juego.length === 1 ? " partida en juego" : " partidas en juego")
            + " · " + r.esperando + " esperando rival";
        pintarReloj();
    };

    const leer = async () => {
        try {
            const r = await llamar("control", { torneo_id: id });
            ultimo = r;
            pintar(r);
            $("proy-error").hidden = true;
        } catch (err) {
            $("proy-error").hidden = false;
            $("proy-error").textContent = ultimo ? "No se pudo actualizar (" + err.message + "). Se muestra lo último que llegó." : err.message;
        }
    };

    $("proy-pantalla").addEventListener("click", () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    });
    await leer();
    setInterval(leer, 4000);
    setInterval(pintarReloj, 1000);
}

const MEDALLAS = ["🥇", "🥈", "🥉"];

/* --------------------------------------------------- resultados y diplomas */

function alternarResultados(t, disparador, caja) {
    if (!caja.hidden) {
        abiertos.resultados.delete(t.id);
        caja.hidden = true;
        caja.textContent = "";
        disparador.setAttribute("aria-expanded", "false");
        return;
    }
    abiertos.resultados.add(t.id);
    caja.hidden = false;
    disparador.setAttribute("aria-expanded", "true");
    montarResultados(t, caja);
}

async function montarResultados(t, caja) {
    caja.textContent = "";
    const estado = el("p", "text-sm mt-3", "Cargando los resultados…");
    estado.setAttribute("role", "status");
    caja.appendChild(estado);
    let r;
    try {
        r = await llamar("control", { torneo_id: t.id });
    } catch (err) {
        estado.textContent = err.message;
        return;
    }
    if (caja.hidden) return;
    caja.textContent = "";
    const cl = r.clasificacion || { equipos: [], jugadores: [] };
    const equipos = cl.equipos.filter((e) => e.puntos > 0);
    const jugadores = cl.jugadores.filter((j) => j.puntos > 0);

    caja.appendChild(el("h3", "font-semibold text-sm mt-3", "Resultados"));
    if (estadoTorneo(r.torneo) !== "terminada") {
        caja.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 mb-1", "La arena todavía no termina: estos son los resultados de ahora."));
    }
    if (!equipos.length && !jugadores.length) {
        caja.appendChild(el("p", "text-sm", "Todavía no hay partidas que sumen puntos."));
        return;
    }
    if (r.torneo.por_equipos && equipos.length) {
        caja.appendChild(el("p", "text-base font-bold", "🏆 Equipo ganador: " + equipos[0].nombre + " (" + equipos[0].puntos + " puntos)"));
    }
    const ol = el("ol", "mt-1 text-sm space-y-0.5");
    jugadores.slice(0, 3).forEach((j, i) => {
        ol.appendChild(el("li", null, MEDALLAS[i] + " " + j.nombre + (j.equipo ? " (" + j.equipo + ")" : "") + " · " + j.puntos + " puntos"));
    });
    caja.appendChild(ol);

    const fila = el("div", "flex flex-wrap gap-2 mt-3");
    fila.appendChild(boton("Equipos en Excel (CSV)", BOTON_SECUNDARIO, () => bajarCsvClasificacion(t, cl, "equipos"), "Bajar la clasificación de los equipos en Excel"));
    fila.appendChild(boton("Jugadores en Excel (CSV)", BOTON_SECUNDARIO, () => bajarCsvClasificacion(t, cl, "jugadores"), "Bajar la clasificación de los jugadores en Excel"));
    caja.appendChild(fila);

    // Diplomas
    const grupo = el("fieldset", "mt-4 rounded-lg border border-brand-100 dark:border-brand-800 p-3");
    grupo.appendChild(el("legend", "text-sm font-semibold px-1", "Diplomas para imprimir"));
    const opciones = [
        ["equipo", "Equipo ganador (sus jugadores que sumaron puntos)", r.torneo.por_equipos && equipos.length > 0, r.torneo.por_equipos && equipos.length > 0],
        ["mejores", "Los tres mejores jugadores", jugadores.length > 0, jugadores.length > 0],
        ["todos", "Participación (todos los que jugaron)", false, jugadores.length > 0 || cl.jugadores.length > 0],
    ];
    const marcas = {};
    opciones.forEach(([clave, texto, marcado, disponible]) => {
        if (!disponible) return;
        const etiqueta = el("label", "flex items-center gap-2 text-sm py-0.5");
        const cb = el("input", "h-4 w-4 accent-accent-500");
        cb.type = "checkbox";
        cb.checked = marcado;
        marcas[clave] = cb;
        etiqueta.appendChild(cb);
        etiqueta.appendChild(el("span", null, texto));
        grupo.appendChild(etiqueta);
    });
    grupo.appendChild(boton("Imprimir diplomas", BOTON_SECUNDARIO, () => {
        const queDar = Object.keys(marcas).filter((k) => marcas[k].checked);
        if (!queDar.length) { Avisos.avisar("Marca qué diplomas imprimir.", { tipo: "error" }); return; }
        imprimirDiplomas(r.torneo, cl, queDar);
    }, "Imprimir los diplomas de la arena " + t.nombre));
    grupo.lastChild.classList.add("mt-2");
    caja.appendChild(grupo);
}

function celdaCsv(t) { return '"' + String(t).replace(/"/g, '""') + '"'; }

function bajarArchivo(nombre, texto, tipo) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([texto], { type: tipo }));
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function nombreDeArchivo(t) {
    return String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "arena";
}

/* Excel lee el CSV con tildes por el BOM del principio. */
function bajarCsvClasificacion(t, cl, que) {
    const filas = que === "equipos"
        ? [["Puesto", "Equipo", "Puntos", "Jugadores que cuentan"]].concat(cl.equipos.map((e, i) => [i + 1, e.nombre, e.puntos, e.jugadores]))
        : [["Puesto", "Jugador", "Equipo", "Puntos", "Partidas", "Victorias"]].concat(cl.jugadores.map((j, i) => [i + 1, j.nombre, j.equipo || "", j.puntos, j.partidas, j.victorias]));
    bajarArchivo("arena-" + nombreDeArchivo(t.nombre) + "-" + que + ".csv",
        "﻿" + filas.map((f) => f.map(celdaCsv).join(",")).join("\r\n"), "text/csv;charset=utf-8");
}

/* Los diplomas: una hoja A4 apaisada por persona, con la marca de agua de
   Ajedrez Integral. Se arman en una capa que solo existe al imprimir. */
function imprimirDiplomas(t, cl, queDar) {
    const diplomas = [];
    const fecha = HoraCR.fecha(t.inicia, { day: "numeric", month: "long", year: "numeric" });
    const equipos = cl.equipos.filter((e) => e.puntos > 0);
    const jugadores = cl.jugadores.filter((j) => j.puntos > 0);
    if (queDar.includes("equipo") && equipos.length) {
        const ganador = equipos[0];
        cl.jugadores.filter((j) => j.equipo_id === ganador.id && j.puntos > 0).forEach((j) => {
            diplomas.push({ nombre: j.nombre, titulo: "Equipo campeón", texto: "por integrar el equipo «" + ganador.nombre + "», campeón de la arena «" + t.nombre + "»" });
        });
    }
    if (queDar.includes("mejores")) {
        const puestos = ["primer", "segundo", "tercer"];
        jugadores.slice(0, 3).forEach((j, i) => {
            diplomas.push({ nombre: j.nombre, titulo: "Diploma de honor", texto: "por el " + puestos[i] + " lugar entre los jugadores de la arena «" + t.nombre + "», con " + j.puntos + " puntos" });
        });
    }
    if (queDar.includes("todos")) {
        cl.jugadores.filter((j) => j.partidas > 0).forEach((j) => {
            diplomas.push({ nombre: j.nombre, titulo: "Diploma de participación", texto: "por su participación en la arena «" + t.nombre + "»" });
        });
    }
    if (!diplomas.length) { Avisos.avisar("No hay a quién darle diploma con esas opciones.", { tipo: "error" }); return; }

    const hoja = el("div");
    hoja.id = "hoja-diplomas";
    diplomas.forEach((d) => {
        const p = el("section", "diploma");
        const marca = document.createElement("img");
        marca.src = "img/marca-agua-ajedrez-integral.png";
        marca.alt = "";
        marca.className = "diploma-marca";
        p.appendChild(marca);
        const marco = el("div", "diploma-marco");
        marco.appendChild(el("p", "diploma-sello", "Ajedrez Integral"));
        marco.appendChild(el("h2", "diploma-titulo", d.titulo));
        marco.appendChild(el("p", "diploma-leyenda", "Se otorga a"));
        marco.appendChild(el("p", "diploma-nombre", d.nombre));
        marco.appendChild(el("p", "diploma-texto", d.texto));
        marco.appendChild(el("p", "diploma-fecha", fecha));
        p.appendChild(marco);
        hoja.appendChild(p);
    });
    document.body.appendChild(hoja);
    document.body.classList.add("imprimiendo-diplomas");
    const limpiar = () => {
        document.body.classList.remove("imprimiendo-diplomas");
        hoja.remove();
        window.removeEventListener("afterprint", limpiar);
    };
    window.addEventListener("afterprint", limpiar);
    // Las imágenes tienen que estar listas antes de abrir la impresión.
    Promise.all(Array.from(hoja.querySelectorAll("img")).map((i) => (i.decode ? i.decode().catch(() => {}) : Promise.resolve())))
        .then(() => window.print());
}

/* ------------------------------------------------------------------ PGN */

const TERMINACION_PGN = {
    mate: "Jaque mate", ahogado: "Rey ahogado", material: "Material insuficiente",
    repeticion: "Repetición de posición", cincuenta: "Regla de las 50 jugadas",
    tiempo: "Tiempo", abandono: "Abandono", acuerdo: "Acuerdo",
};

/* Todas las partidas de la arena en un solo archivo PGN (sin las anuladas ni
   las canceladas). */
async function bajarPgnArena(t) {
    const r = await hacer("partidas_arena", { torneo_id: t.id });
    if (!r) return;
    const torneo = r.torneo;
    if (!r.partidas.length) { Avisos.avisar("Esa arena todavía no tiene partidas terminadas.", { tipo: "error" }); return; }
    const textos = r.partidas.map((p) => {
        const g = new Chess();
        for (const j of p.jugadas || []) if (!g.move(j.s)) break;
        g.header("Event", torneo.nombre, "Site", "ajedrez-integral.com/sala", "Date", HoraCR.dia(p.creada_en).replace(/-/g, "."), "Round", "-",
            "White", p.blancas, "Black", p.negras, "Result", p.resultado,
            "TimeControl", torneo.inicial_seg + (torneo.incremento_seg ? "+" + torneo.incremento_seg : ""));
        if (TERMINACION_PGN[p.motivo]) g.header("Termination", TERMINACION_PGN[p.motivo]);
        return g.pgn({ max_width: 80, newline_char: "\n" });
    });
    bajarArchivo("arena-" + nombreDeArchivo(torneo.nombre) + ".pgn", textos.join("\n\n") + "\n", "application/x-chess-pgn;charset=utf-8");
    Avisos.avisar(r.partidas.length + (r.partidas.length === 1 ? " partida bajada." : " partidas bajadas."));
}
