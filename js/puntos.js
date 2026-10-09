/* ===== Ajedrez Integral — Puntos Ajedrez =====
 *
 * Un total único de puntos que junta lo que el alumno gana en la clase en
 * vivo (preguntas, calentamiento y competencia) con lo que hace en el resto
 * de la plataforma (entrenamiento, tareas, exámenes, racha de días). Se
 * gastan en la tienda de puntos (puntos-tienda.html) por premios: títulos y
 * marcos para el perfil, accesorios de avatar que ven el profesor y los
 * compañeros en la clase en vivo (gorros, lentes, una corona…), puntos
 * dobles por un tiempo, y adelantar una lección de un curso o un material de
 * la tienda sin pagar por él. También los retos de la semana (con su bono),
 * el marcador del salón (solo compañeros: mismo profe y misma academia) y
 * los regalos y bromas para un compañero (js/puntos-regalos.js).
 *
 * Todo lo gana la BASE, nunca el navegador: cada evento (cerrar una clase,
 * registrar un ejercicio, entregar un examen) lo paga un trigger, y lo que se
 * calcula en vez de ocurrir (una tarea completada, un hito de racha, un reto
 * cumplido) lo paga reclamar_puntos_pendientes() al abrir el panel o la
 * tienda. Siempre una sola vez por evento (interno.otorgar_puntos, con su
 * "referencia"). Ver «Puntos Ajedrez: se acumulan y se canjean» y «Retos,
 * marcador, regalos y bromas» en docs/decisiones/puntos-y-premios.md.
 *
 * Uso:
 *   const n = await Puntos.saldo(sb, alumnoId);            // integer o null
 *   const filas = await Puntos.historial(sb, alumnoId, 20);
 *   const cat = await Puntos.catalogo(sb);
 *   const mios = await Puntos.misPremios(sb, alumnoId);
 *   const r = await Puntos.canjear(sb, premioId);           // { saldo } o { error }
 *   Puntos.montarTarjetaPanel(caja, { sb, alumnoId, enlaceTienda });
 *   Puntos.montarTienda(caja, { sb, alumnoId });
 */
window.Puntos = (function () {
  "use strict";

  function fmt(n) { return new Intl.NumberFormat("es-CR").format(n); }
  function texto(n) { return fmt(n) + (n === 1 ? " punto" : " puntos"); }
  // El emoji delante, fuera del lector (aria-hidden); el texto, para todos.
  function conAdorno(el, emoji, txt) {
    const adorno = document.createElement("span");
    adorno.setAttribute("aria-hidden", "true");
    adorno.textContent = emoji + " ";
    el.replaceChildren(adorno, document.createTextNode(txt));
  }
  function fechaCorta(iso) {
    try {
      return new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" });
    } catch (e) { return ""; }
  }
  function fechaHora(iso) {
    try {
      return new Date(iso).toLocaleString("es-CR", {
        day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Costa_Rica",
      });
    } catch (e) { return ""; }
  }

  const ORIGEN_TEXTO = {
    clase: "Clase en vivo", entrenamiento: "Entrenamiento", tarea: "Tarea completada",
    examen: "Examen entregado", racha: "Racha de días", reto_semanal: "Reto de la semana", canje: "Canjeado",
    regalo: "Regalo para un compañero", broma: "Broma para un compañero", ajuste_manual: "Ajuste",
  };

  async function saldo(sb, alumnoId) {
    try {
      const { data, error } = await sb.rpc("saldo_de_puntos", alumnoId ? { p_alumno: alumnoId } : {});
      if (error) throw error;
      return Number.isFinite(data) ? data : 0;
    } catch (e) {
      console.warn("No se pudo cargar el saldo de puntos:", e && e.message ? e.message : e);
      return null;
    }
  }

  async function historial(sb, alumnoId, limite) {
    try {
      const args = { p_limite: limite || 30 };
      if (alumnoId) args.p_alumno = alumnoId;
      const { data, error } = await sb.rpc("historial_de_puntos", args);
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn("No se pudo cargar el historial de puntos:", e && e.message ? e.message : e);
      return [];
    }
  }

  async function catalogo(sb) {
    try {
      const { data, error } = await sb.from("premios_catalogo")
        .select("id, clave, nombre, descripcion, emoji, categoria, tipo_efecto, costo_puntos, parametros, limite_por_alumno")
        .eq("activo", true)
        .order("orden");
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn("No se pudo cargar el catálogo de premios:", e && e.message ? e.message : e);
      return null;
    }
  }

  async function misPremios(sb, alumnoId) {
    try {
      const { data, error } = await sb.rpc("mis_premios", alumnoId ? { p_alumno: alumnoId } : {});
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn("No se pudieron cargar tus premios:", e && e.message ? e.message : e);
      return null;
    }
  }

  async function canjear(sb, premioId) {
    const { data, error } = await sb.rpc("canjear_premio", { p_premio_id: premioId });
    if (error) return { error: error.message || "No se pudo canjear el premio." };
    const fila = Array.isArray(data) ? data[0] : data;
    return { saldo: fila ? fila.saldo_restante : null };
  }

  async function equipar(sb, canjeId, activo) {
    const { error } = await sb.rpc("equipar_premio", { p_canje_id: canjeId, p_activo: activo });
    return error ? { error: error.message || "No se pudo guardar." } : { ok: true };
  }

  /* El accesorio de avatar que cada uno de varios alumnos tiene puesto ahora
     (gorro, lentes, corona…), para pintarlo junto a su foto en un listado —
     un profesor viendo a sus alumnos conectados, por ejemplo. Un solo pedido
     para todos los ids, con memoria por página (no cambia seguido). */
  const DURA_ACCESORIOS = 60000; // un alumno puede quitárselo a mitad de clase.
  const memoriaAccesorios = new Map(); // id -> { valor: {emoji,nombre}|null, vence }
  async function accesoriosDe(sb, ids) {
    const ahora = Date.now();
    const faltan = (ids || []).filter((id) => id && !(memoriaAccesorios.has(id) && memoriaAccesorios.get(id).vence > ahora));
    if (faltan.length) {
      try {
        const { data, error } = await sb.rpc("accesorios_de", { p_ids: faltan });
        if (error) throw error;
        const vence = ahora + DURA_ACCESORIOS;
        faltan.forEach((id) => memoriaAccesorios.set(id, { valor: null, vence: vence }));
        (data || []).forEach((f) => memoriaAccesorios.set(f.student_id, { valor: { emoji: f.emoji, nombre: f.nombre }, vence: vence }));
      } catch (e) {
        console.warn("No se pudieron cargar los accesorios de avatar:", e && e.message ? e.message : e);
        faltan.forEach((id) => memoriaAccesorios.set(id, { valor: null, vence: ahora + DURA_ACCESORIOS }));
      }
    }
    const out = new Map();
    (ids || []).forEach((id) => { const a = memoriaAccesorios.get(id); if (a && a.valor) out.set(id, a.valor); });
    return out;
  }

  /* Pone el accesorio como una insignia chica en la esquina de una caja de
     avatar (la que arma FotoPerfil.avatar/poner): la caja necesita quedar
     "relative" para que la insignia se pueda ubicar encima. Sin accesorio,
     no agrega nada (y quita el que hubiera quedado de otra persona). */
  function decorarAvatar(caja, accesorio) {
    if (!caja) return;
    const vieja = caja.querySelector(":scope > [data-accesorio-avatar]");
    if (vieja) vieja.remove();
    if (!accesorio) return;
    caja.classList.add("relative");
    const ins = document.createElement("span");
    ins.setAttribute("data-accesorio-avatar", "");
    ins.setAttribute("aria-hidden", "true");
    ins.title = accesorio.nombre || "";
    ins.className = "absolute -top-1 -right-1 text-[10px] leading-none drop-shadow";
    ins.textContent = accesorio.emoji;
    caja.appendChild(ins);
  }

  /* Cobra lo que ya se ganó y no tiene un momento propio: las tareas
     completadas, el hito de racha y los retos de la semana cumplidos. Devuelve
     solo lo NUEVO ([{ que, detalle, ganados }]): llamarla dos veces no paga
     dos veces. */
  async function reclamarPendientes(sb) {
    try {
      const { data, error } = await sb.rpc("reclamar_puntos_pendientes");
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn("No se pudo revisar lo pendiente de puntos:", e && e.message ? e.message : e);
      return [];
    }
  }

  async function retosDeLaSemana(sb) {
    try {
      const { data, error } = await sb.rpc("retos_de_la_semana");
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn("No se pudieron cargar los retos de la semana:", e && e.message ? e.message : e);
      return null;
    }
  }

  async function marcadorDelSalon(sb, periodo) {
    try {
      const { data, error } = await sb.rpc("marcador_del_salon", { p_periodo: periodo === "mes" ? "mes" : "semana" });
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn("No se pudo cargar el marcador del salón:", e && e.message ? e.message : e);
      return null;
    }
  }

  const ICONO_PENDIENTE = { tarea: "📋", racha: "🔥", reto_semanal: "🎯" };
  function textoPendientes(filas) {
    return (filas || []).map((f) => (ICONO_PENDIENTE[f.que] || "💎") + " " + f.detalle + ": +" + fmt(f.ganados)).join(" · ");
  }

  // El título y el marco que el alumno tiene puestos ahora (el más reciente
  // de cada tipo que siga "activo"), para mostrarlos junto a su nombre.
  function tituloEquipado(premios) {
    const propios = (premios || []).filter((p) => p.tipo_efecto === "titulo" && p.activo);
    if (!propios.length) return null;
    propios.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return (propios[0].parametros && propios[0].parametros.texto) || propios[0].nombre;
  }
  function marcoEquipado(premios) {
    const propios = (premios || []).filter((p) => p.tipo_efecto === "marco_perfil" && p.activo);
    if (!propios.length) return null;
    propios.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return (propios[0].parametros && propios[0].parametros.clase) || null;
  }
  function dobleVigente(premios) {
    const ahora = Date.now();
    return (premios || []).some((p) => p.tipo_efecto === "doble_puntos" && p.vigente_hasta && new Date(p.vigente_hasta).getTime() > ahora);
  }
  function accesorioEquipado(premios) {
    const propios = (premios || []).filter((p) => p.tipo_efecto === "accesorio_avatar" && p.activo);
    if (!propios.length) return null;
    propios.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return { emoji: propios[0].emoji, nombre: propios[0].nombre };
  }

  function pintarHistorial(ul, filas) {
    ul.replaceChildren();
    filas.forEach((f) => {
      const li = document.createElement("li");
      li.className = "flex items-baseline gap-2";
      const cant = document.createElement("span");
      cant.className = "font-mono font-semibold shrink-0 " + (f.cantidad > 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400");
      cant.textContent = (f.cantidad > 0 ? "+" : "−") + fmt(Math.abs(f.cantidad));
      const mot = document.createElement("span");
      mot.className = "flex-1 min-w-0 break-words";
      mot.textContent = f.motivo || ORIGEN_TEXTO[f.origen] || f.origen;
      const fecha = document.createElement("span");
      fecha.className = "shrink-0 text-brand-450 dark:text-brand-350";
      fecha.textContent = fechaCorta(f.created_at);
      li.append(cant, mot, fecha);
      ul.appendChild(li);
    });
  }

  /* La tarjeta chiquita del panel: el saldo y un enlace a la tienda. Si
     todavía no tiene ningún punto, no se pinta (como «Tus puntos del mes»
     cuando no hubo clases): no tiene sentido invitar a una tienda vacía. De
     paso cobra lo pendiente (tareas, racha, retos) y dice lo nuevo; si no hay
     nada nuevo, no se avisa nada. */
  async function montarTarjetaPanel(contenedor, opciones) {
    const { sb, alumnoId, enlaceTienda } = opciones;
    contenedor.replaceChildren();

    const h2 = document.createElement("h2");
    h2.id = "puntos-ajedrez-titulo";
    h2.className = "font-serif text-lg font-bold text-brand-800 dark:text-white mb-1";
    conAdorno(h2, "💎", "Puntos Ajedrez");
    const total = document.createElement("p");
    total.className = "text-2xl font-bold text-brand-800 dark:text-white";
    total.setAttribute("data-puntos-total", "");
    const aviso = document.createElement("p");
    aviso.className = "text-xs text-brand-500 dark:text-brand-300 mt-0.5 min-h-[1rem]";
    aviso.setAttribute("aria-live", "polite");
    const enlace = document.createElement("a");
    enlace.href = enlaceTienda || "puntos-tienda.html";
    enlace.className = "inline-block mt-2 text-xs font-semibold text-accent-700 dark:text-accent-300 hover:underline";
    enlace.textContent = "Ver la tienda de puntos →";
    contenedor.append(h2, total, aviso, enlace);

    const nuevos = await reclamarPendientes(sb);
    const n = await saldo(sb, alumnoId);

    if (n == null) {
      contenedor.hidden = false;
      total.textContent = "—";
      aviso.textContent = "No se pudo cargar tu saldo de puntos.";
      return;
    }
    if (!n) {
      contenedor.hidden = true;
      return;
    }
    contenedor.hidden = false;
    conAdorno(total, "💎", texto(n));
    aviso.textContent = textoPendientes(nuevos);
  }

  function boton(textoBoton, etiqueta, clases) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = textoBoton;
    if (etiqueta) b.setAttribute("aria-label", etiqueta);
    b.className = "text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 " +
      (clases || "bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200");
    return b;
  }

  const CATEGORIAS = [
    { clave: "cosmetico", titulo: "🎨 Cosméticos", ayuda: "Para destacar en tu panel. Los accesorios de avatar también los ve tu profesor en la clase en vivo." },
    { clave: "entrenamiento", titulo: "⚡ Ventajas de entrenamiento", ayuda: "Para avanzar más rápido." },
    { clave: "contenido", titulo: "📚 Contenido", ayuda: "Material de verdad, sin esperar ni pagar por él." },
    { clave: "regalo", titulo: "🎁 Regalos para un compañero", ayuda: "Le llegan a su campana con tu nombre y un mensaje de la lista. Los cosméticos y las ventajas de arriba también se pueden regalar." },
    { clave: "broma", titulo: "🃏 Bromas para un compañero", ayuda: "Inofensivas y con tu nombre. Nunca en un examen, en la clase en vivo ni en un torneo. Hasta 5 al día, y una por compañero." },
  ];
  // Lo que se le puede comprar a otro además de a uno mismo.
  const SE_REGALA = { cosmetico: true, entrenamiento: true };

  function seccion(titulo, ayuda) {
    const sec = document.createElement("section");
    const h = document.createElement("h3");
    h.className = "text-lg font-bold text-brand-800 dark:text-white";
    h.textContent = titulo;
    sec.appendChild(h);
    if (ayuda) {
      const p = document.createElement("p");
      p.className = "text-xs text-brand-500 dark:text-brand-300 mt-0.5";
      p.textContent = ayuda;
      sec.appendChild(p);
    }
    return sec;
  }

  /* Los retos de esta semana con su avance. El bono se cobra solo (lo cobra
     reclamar_puntos_pendientes al abrir el panel o la tienda). */
  function pintarRetos(ul, retos) {
    ul.replaceChildren();
    if (!retos) {
      const li = document.createElement("li");
      li.className = "text-sm text-brand-500 dark:text-brand-300";
      li.textContent = "No se pudieron cargar los retos de esta semana.";
      ul.appendChild(li);
      return;
    }
    retos.forEach((r) => {
      const li = document.createElement("li");
      li.className = "rounded-xl border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 p-4";
      li.setAttribute("data-reto", r.clave);
      const h = document.createElement("h4");
      h.className = "font-semibold text-brand-800 dark:text-white";
      conAdorno(h, r.emoji, r.nombre + " · +" + texto(r.bono));
      const d = document.createElement("p");
      d.className = "text-xs text-brand-500 dark:text-brand-300 mt-0.5";
      d.textContent = r.descripcion;
      const avance = Math.min(r.avance, r.meta);
      const barra = document.createElement("progress");
      barra.className = "mt-2 w-full h-2 accent-accent-500";
      barra.max = r.meta;
      barra.value = avance;
      barra.setAttribute("aria-label", r.nombre);
      const est = document.createElement("p");
      est.className = "text-xs font-semibold mt-1 " + (r.cobrado ? "text-green-700 dark:text-green-400" : "text-brand-700 dark:text-brand-200");
      est.setAttribute("data-reto-estado", "");
      est.textContent = r.cobrado ? "✓ Cumplido: ganaste " + texto(r.bono) + "." : fmt(avance) + " de " + fmt(r.meta);
      li.append(h, d, barra, est);
      ul.appendChild(li);
    });
  }

  /* El marcador del salón: lo GANADO en la semana o el mes (lo gastado no
     resta). Solo sale gente que el alumno ya conoce: sus compañeros (mismo
     profe y misma academia); el profe ve a sus alumnos. Lo decide la base. */
  function pintarMarcador(ol, filas, periodo) {
    ol.replaceChildren();
    if (!filas) {
      const li = document.createElement("li");
      li.className = "text-sm text-brand-500 dark:text-brand-300";
      li.textContent = "No se pudo cargar el marcador.";
      ol.appendChild(li);
      return;
    }
    if (!filas.some((f) => f.puntos > 0)) {
      const li = document.createElement("li");
      li.className = "text-sm text-brand-500 dark:text-brand-300";
      li.textContent = periodo === "mes" ? "Nadie de tu salón ha sumado puntos este mes. ¡Sé el primero!" : "Nadie de tu salón ha sumado puntos esta semana. ¡Sé el primero!";
      ol.appendChild(li);
      return;
    }
    const MEDALLA = { 1: "🥇", 2: "🥈", 3: "🥉" };
    filas.forEach((f) => {
      const li = document.createElement("li");
      li.className = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm " +
        (f.soy_yo ? "bg-accent-100 dark:bg-accent-900/40 font-semibold" : "bg-brand-50 dark:bg-brand-800");
      li.setAttribute("data-marcador-fila", "");
      if (f.soy_yo) li.setAttribute("aria-current", "true");
      const puesto = document.createElement("span");
      puesto.className = "w-16 shrink-0 whitespace-nowrap font-mono text-brand-700 dark:text-brand-200";
      puesto.textContent = (MEDALLA[f.puesto] ? MEDALLA[f.puesto] + " " : "") + f.puesto + ".º";
      const nombre = document.createElement("span");
      nombre.className = "flex-1 min-w-0 truncate text-brand-800 dark:text-white";
      nombre.textContent = (f.nombre || "Sin nombre") + (f.soy_yo ? " (tú)" : "");
      const pts = document.createElement("span");
      pts.className = "shrink-0 font-mono text-brand-700 dark:text-brand-200";
      pts.textContent = texto(f.puntos);
      li.append(puesto, nombre, pts);
      ol.appendChild(li);
    });
  }

  /* La tienda completa: el saldo, los retos de la semana, el marcador del
     salón, el catálogo por categoría con su botón de canjear (o de regalar),
     "Mis premios" (con equipar/desequipar los cosméticos) y las bromas. */
  function montarTienda(contenedor, opciones) {
    const { sb, alumnoId } = opciones;
    contenedor.replaceChildren();

    const cabecera = document.createElement("div");
    cabecera.className = "flex flex-wrap items-baseline justify-between gap-2 mb-2";
    const saldoP = document.createElement("p");
    saldoP.className = "text-3xl font-bold text-brand-800 dark:text-white";
    saldoP.setAttribute("data-puntos-total", "");
    saldoP.textContent = "…";
    const dobleAviso = document.createElement("p");
    dobleAviso.className = "text-sm font-semibold text-accent-700 dark:text-accent-300 hidden";
    dobleAviso.textContent = "✨ Puntos dobles activos";
    cabecera.append(saldoP, dobleAviso);
    const nuevosAviso = document.createElement("p");
    nuevosAviso.className = "text-sm text-green-700 dark:text-green-400 mb-6 min-h-[1.25rem]";
    nuevosAviso.setAttribute("aria-live", "polite");
    nuevosAviso.setAttribute("data-puntos-nuevos", "");

    const retosSec = seccion("🎯 Retos de esta semana", "De lunes a domingo. El bono se suma solo cuando cumples el reto.");
    retosSec.className = "mb-8";
    const retosLista = document.createElement("ul");
    retosLista.className = "grid gap-3 sm:grid-cols-3 mt-3";
    retosLista.id = "puntos-retos";
    retosSec.appendChild(retosLista);

    const marcSec = seccion("🏆 Marcador del salón", "Los puntos que ganó cada quien de tu salón (lo que gastan en la tienda no resta).");
    marcSec.className = "mb-8";
    const tabs = document.createElement("div");
    tabs.className = "mt-3 flex gap-2";
    tabs.setAttribute("role", "group");
    tabs.setAttribute("aria-label", "Periodo del marcador");
    const marcLista = document.createElement("ol");
    marcLista.className = "mt-3 space-y-1.5";
    marcLista.id = "puntos-marcador";
    let periodo = "semana";
    const botonesPeriodo = [["semana", "Esta semana"], ["mes", "Este mes"]].map(([clave, txt]) => {
      const b = boton(txt, null, "bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 " +
        "aria-pressed:bg-accent-500 aria-pressed:text-brand-900 dark:aria-pressed:bg-accent-500 dark:aria-pressed:text-brand-900");
      b.setAttribute("data-periodo", clave);
      b.setAttribute("aria-pressed", String(clave === periodo));
      b.addEventListener("click", async () => {
        if (periodo === clave) return;
        periodo = clave;
        botonesPeriodo.forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.periodo === periodo)));
        pintarMarcador(marcLista, await marcadorDelSalon(sb, periodo), periodo);
      });
      return b;
    });
    tabs.append(...botonesPeriodo);
    marcSec.append(tabs, marcLista);

    const secciones = document.createElement("div");
    secciones.className = "space-y-8";

    const misP = document.createElement("section");
    misP.className = "mt-10 pt-6 border-t border-brand-100 dark:border-brand-800";
    const misTit = document.createElement("h3");
    misTit.className = "text-lg font-bold text-brand-800 dark:text-white";
    misTit.textContent = "Mis premios";
    const avatarAviso = document.createElement("p");
    avatarAviso.className = "text-xs text-brand-500 dark:text-brand-300 mt-0.5";
    const misLista = document.createElement("ul");
    misLista.className = "mt-3 space-y-2";
    misP.append(misTit, avatarAviso, misLista);

    const bromasSec = document.createElement("section");
    bromasSec.className = "mt-10 pt-6 border-t border-brand-100 dark:border-brand-800";
    bromasSec.id = "puntos-bromas";

    contenedor.append(cabecera, nuevosAviso, retosSec, marcSec, secciones, misP, bromasSec);
    if (window.PuntosRegalos) window.PuntosRegalos.montarAjustesBromas(bromasSec, { sb, alumnoId });
    else bromasSec.hidden = true;

    let saldoActual = null;
    let catalogoActual = null;
    let misPremiosActual = null;
    // El «¡Listo!» de un canje o un regalo, para que sobreviva al repintado
    // del catálogo (recargar() vuelve a armar todas las tarjetas).
    let ultimoAviso = null;

    function puedeCanjear(premio) {
      if (saldoActual == null) return false;
      if (saldoActual < premio.costo_puntos) return false;
      if (premio.limite_por_alumno == null) return true;
      const veces = (misPremiosActual || []).filter((p) => p.premio_id === premio.id).length;
      return veces < premio.limite_por_alumno;
    }

    function pintarCatalogo() {
      secciones.replaceChildren();
      if (!catalogoActual) {
        const p = document.createElement("p");
        p.className = "text-sm text-brand-500 dark:text-brand-300";
        p.textContent = "No se pudo cargar la tienda de puntos en este momento.";
        secciones.appendChild(p);
        return;
      }
      CATEGORIAS.forEach((cat) => {
        const items = catalogoActual.filter((p) => p.categoria === cat.clave);
        if (!items.length) return;
        const sec = document.createElement("section");
        const h = document.createElement("h3");
        h.className = "text-lg font-bold text-brand-800 dark:text-white";
        h.textContent = cat.titulo;
        const ayuda = document.createElement("p");
        ayuda.className = "text-xs text-brand-500 dark:text-brand-300 mt-0.5";
        ayuda.textContent = cat.ayuda;
        const grid = document.createElement("div");
        grid.className = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-3";
        items.forEach((premio) => grid.appendChild(tarjetaPremio(premio)));
        sec.append(h, ayuda, grid);
        secciones.appendChild(sec);
      });
    }

    function tarjetaPremio(premio) {
      const art = document.createElement("article");
      art.className = "rounded-xl border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 p-4 flex flex-col";
      const h = document.createElement("h4");
      h.className = "font-semibold text-brand-800 dark:text-white";
      conAdorno(h, premio.emoji, premio.nombre);
      const desc = document.createElement("p");
      desc.className = "text-xs text-brand-500 dark:text-brand-300 mt-1 flex-1";
      desc.textContent = premio.descripcion;
      const costo = document.createElement("p");
      costo.className = "text-sm font-bold text-brand-700 dark:text-brand-200 mt-2";
      costo.textContent = "💎 " + texto(premio.costo_puntos);
      const aviso = document.createElement("p");
      aviso.className = "text-xs mt-1 min-h-[1rem] text-brand-500 dark:text-brand-300";
      aviso.setAttribute("aria-live", "polite");
      const paraOtro = premio.categoria === "regalo" || premio.categoria === "broma";
      const listo = ultimoAviso && ultimoAviso.clave === premio.clave ? ultimoAviso.texto : "";
      const regalable = paraOtro || SE_REGALA[premio.categoria];
      const btnRegalar = regalable && window.PuntosRegalos
        ? boton(premio.categoria === "broma" ? "Mandar…" : "Regalar…",
                (premio.categoria === "broma" ? "Mandar " : "Regalar ") + premio.nombre + " a un compañero",
                paraOtro ? "mt-3 w-full bg-accent-500 hover:bg-accent-600 text-brand-900 disabled:opacity-50 disabled:cursor-not-allowed" : "mt-2 w-full bg-brand-100 hover:bg-brand-200 dark:bg-brand-700 dark:hover:bg-brand-600 text-brand-700 dark:text-brand-100 disabled:opacity-50 disabled:cursor-not-allowed")
        : null;
      if (btnRegalar) {
        btnRegalar.setAttribute("data-regalar", premio.clave);
        btnRegalar.disabled = saldoActual == null || saldoActual < premio.costo_puntos;
        if (btnRegalar.disabled && paraOtro && saldoActual != null) aviso.textContent = "Te faltan " + fmt(premio.costo_puntos - saldoActual) + " puntos.";
        btnRegalar.addEventListener("click", async () => {
          btnRegalar.disabled = true;
          const r = await window.PuntosRegalos.regalar({ sb, alumnoId, premio });
          btnRegalar.disabled = false;
          if (!r) return;
          if (r.error) { aviso.textContent = r.error; return; }
          ultimoAviso = { clave: premio.clave, texto: premio.categoria === "broma" ? "¡Listo! Le mandaste la broma a " + r.para + "." : "¡Listo! Le regalaste " + premio.nombre + " a " + r.para + "." };
          aviso.textContent = ultimoAviso.texto;
          await recargar();
        });
      }
      if (listo) aviso.textContent = listo;
      if (paraOtro) {
        art.append(h, desc, costo, aviso);
        if (btnRegalar) art.appendChild(btnRegalar);
        return art;
      }
      const btn = boton("Canjear", "Canjear " + premio.nombre, "mt-3 w-full bg-accent-500 hover:bg-accent-600 text-brand-900 disabled:opacity-50 disabled:cursor-not-allowed");
      btn.disabled = !puedeCanjear(premio);
      if (btn.disabled && saldoActual != null) {
        const veces = (misPremiosActual || []).filter((p) => p.premio_id === premio.id).length;
        if (premio.limite_por_alumno != null && veces >= premio.limite_por_alumno) aviso.textContent = "Ya lo tienes.";
        else if (saldoActual < premio.costo_puntos) aviso.textContent = "Te faltan " + fmt(premio.costo_puntos - saldoActual) + " puntos.";
      }
      let ocupado = false;
      btn.addEventListener("click", async () => {
        if (ocupado) return;
        ocupado = true;
        btn.disabled = true;
        aviso.textContent = "Canjeando…";
        const r = await canjear(sb, premio.id);
        ocupado = false;
        if (r.error) {
          aviso.textContent = r.error;
          btn.disabled = !puedeCanjear(premio);
          return;
        }
        ultimoAviso = { clave: premio.clave, texto: "¡Listo! Lo canjeaste." };
        aviso.textContent = ultimoAviso.texto;
        await recargar();
      });
      art.append(h, desc, costo, aviso, btn);
      if (btnRegalar) art.appendChild(btnRegalar);
      return art;
    }

    function filaPremioPropio(p) {
      const li = document.createElement("li");
      li.className = "flex items-center gap-3 rounded-lg border border-brand-100 dark:border-brand-700 px-3 py-2";
      const ic = document.createElement("span");
      ic.setAttribute("aria-hidden", "true");
      ic.textContent = p.emoji;
      const info = document.createElement("div");
      info.className = "flex-1 min-w-0";
      const nombre = document.createElement("p");
      nombre.className = "text-sm font-semibold text-brand-800 dark:text-white truncate";
      nombre.textContent = p.nombre;
      const fecha = document.createElement("p");
      fecha.className = "text-xs text-brand-450 dark:text-brand-350";
      fecha.textContent = p.tipo_efecto === "doble_puntos" && p.vigente_hasta
        ? (new Date(p.vigente_hasta).getTime() > Date.now() ? "Vigente hasta " + fechaHora(p.vigente_hasta) : "Venció " + fechaHora(p.vigente_hasta))
        : (p.regalo_de ? "Te llegó el " : "Canjeado el ") + fechaCorta(p.created_at);
      info.append(nombre, fecha);
      if (p.regalo_de) {
        const de = document.createElement("p");
        de.className = "text-xs text-accent-700 dark:text-accent-300";
        de.setAttribute("data-regalo-de", "");
        de.textContent = "🎁 Regalo de " + (p.regalo_de_nombre || "un compañero") + (p.mensaje ? ": «" + p.mensaje + "»" : "");
        info.appendChild(de);
      }
      li.append(ic, info);
      if (p.tipo_efecto === "titulo" || p.tipo_efecto === "marco_perfil" || p.tipo_efecto === "accesorio_avatar") {
        const btn = boton(p.activo ? "Quitar" : "Mostrar", (p.activo ? "Quitar" : "Mostrar") + " " + p.nombre);
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          const r = await equipar(sb, p.id, !p.activo);
          if (r.error) { btn.disabled = false; return; }
          await recargar();
        });
        li.appendChild(btn);
      }
      return li;
    }

    function pintarMisPremios() {
      misLista.replaceChildren();
      if (!misPremiosActual || !misPremiosActual.length) {
        const li = document.createElement("li");
        li.className = "text-sm text-brand-500 dark:text-brand-300";
        li.textContent = "Todavía no has canjeado ningún premio.";
        misLista.appendChild(li);
        return;
      }
      misPremiosActual.forEach((p) => misLista.appendChild(filaPremioPropio(p)));
    }

    async function recargar() {
      const [s, cat, mios, retos, marc] = await Promise.all([
        saldo(sb, alumnoId),
        catalogoActual || catalogo(sb),
        misPremios(sb, alumnoId),
        retosDeLaSemana(sb),
        marcadorDelSalon(sb, periodo),
      ]);
      pintarRetos(retosLista, retos);
      pintarMarcador(marcLista, marc, periodo);
      saldoActual = s;
      if (cat) catalogoActual = cat;
      misPremiosActual = mios;
      if (s == null) { saldoP.textContent = "—"; } else { conAdorno(saldoP, "💎", texto(s)); }
      dobleAviso.classList.toggle("hidden", !dobleVigente(mios));
      const accesorio = accesorioEquipado(mios);
      avatarAviso.textContent = accesorio
        ? "Así te ven en la clase en vivo: " + accesorio.emoji + " " + accesorio.nombre
        : "Todavía no tienes puesto ningún accesorio de avatar.";
      pintarCatalogo();
      pintarMisPremios();
    }

    // Primero se cobra lo pendiente: así los retos ya salen cumplidos y el
    // saldo incluye lo recién ganado.
    reclamarPendientes(sb).then((nuevos) => {
      nuevosAviso.textContent = nuevos.length ? "Recién sumados: " + textoPendientes(nuevos) : "";
      return recargar();
    });
    return { recargar };
  }

  return {
    saldo, historial, catalogo, misPremios, canjear, equipar, reclamarPendientes, retosDeLaSemana, marcadorDelSalon,
    tituloEquipado, marcoEquipado, dobleVigente, accesorioEquipado, accesoriosDe, decorarAvatar, texto, pintarHistorial,
    montarTarjetaPanel, montarTienda,
  };
})();
