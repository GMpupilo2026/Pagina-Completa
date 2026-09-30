/* El registro de cambios en admin.html#auditoria: la bitácora de auditoría.
 *
 * La escribe la base (public.auditoria, con triggers en las tablas que reparten
 * permisos, accesos y dinero) y nadie la puede cambiar ni borrar; solo quien
 * administra la lee (RLS con soy_admin()). Acá solo se pinta: de 50 en 50 con
 * range(), porque PostgREST corta en silencio a partir de cierta cantidad de
 * filas. Todo lo que sale de la tabla va por textContent: adentro hay nombres
 * y textos que escribió la gente.
 * Ver «La bitácora de auditoría» en docs/decisiones/permisos-y-roles.md.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const PAGINA = 50;

  const GRUPOS = {
    permisos: ["profiles", "profile_teachers", "equipos", "equipo_alumnos", "equipo_entrenadores",
      "coordinador_profesores", "coordinador_funciones_quitadas", "supervisor_cuentas", "verificacion_en_dos_pasos"],
    acceso: ["academias", "academia_miembros", "academia_ia", "preparacion_rivales_profesores",
      "acceso_config", "paquetes_acceso", "paquete_alumnos", "pruebas_gratis"],
    cobros: ["planes_cobro", "suscripciones", "cobros", "pagos"],
  };

  // Qué pasó, dicho como se dice. [alta, cambio, baja]
  const QUE = {
    profiles: ["Cuenta creada", "Cambio en los permisos de una cuenta", "Cuenta eliminada"],
    profile_teachers: ["Profesor asignado a un alumno", "Asignación de profesor cambiada", "Profesor quitado a un alumno"],
    equipos: ["Equipo creado", "Equipo cambiado", "Equipo borrado"],
    equipo_alumnos: ["Alumno sumado a un equipo", "Alumno de un equipo cambiado", "Alumno sacado de un equipo"],
    equipo_entrenadores: ["Entrenador sumado a un equipo", "Entrenador de un equipo cambiado", "Entrenador sacado de un equipo"],
    coordinador_profesores: ["Profesor puesto bajo una coordinación", "Coordinación cambiada", "Profesor sacado de una coordinación"],
    coordinador_funciones_quitadas: ["Función de coordinación quitada", "Funciones de coordinación cambiadas", "Función de coordinación devuelta"],
    supervisor_cuentas: ["Cuenta puesta bajo un supervisor", "Supervisión cambiada", "Cuenta sacada de un supervisor"],
    academias: ["Academia creada", "Academia cambiada", "Academia borrada"],
    academia_miembros: ["Persona sumada a una academia", "Miembro de academia cambiado", "Persona sacada de una academia"],
    academia_ia: ["IA activada para una academia", "IA de una academia cambiada", "IA quitada a una academia"],
    preparacion_rivales_profesores: ["Preparación de rivales activada", "Preparación de rivales cambiada", "Preparación de rivales desactivada"],
    acceso_config: ["Control de acceso creado", "Control de acceso cambiado", "Control de acceso borrado"],
    paquetes_acceso: ["Paquete de acceso creado", "Paquete de acceso cambiado", "Paquete de acceso borrado"],
    paquete_alumnos: ["Alumno sumado a un paquete", "Alumno de un paquete cambiado", "Alumno sacado de un paquete"],
    pruebas_gratis: ["Prueba gratis creada", "Prueba gratis cambiada", "Prueba gratis borrada"],
    planes_cobro: ["Plan de cobro creado", "Plan de cobro cambiado", "Plan de cobro borrado"],
    suscripciones: ["Alumno suscrito a un plan", "Suscripción cambiada", "Suscripción quitada"],
    cobros: ["Cobro emitido", "Cobro cambiado", "Cobro borrado"],
    pagos: ["Pago registrado", "Pago cambiado", "Pago borrado"],
    verificacion_en_dos_pasos: ["Verificación en dos pasos activada", "Verificación en dos pasos cambiada", "Verificación en dos pasos quitada"],
  };
  const INDICE = { alta: 0, cambio: 1, baja: 2 };

  let cuentas = () => [];
  let desde = 0;
  let pidiendo = false;
  let abierto = false;

  function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function nombreDe(id) {
    if (!id) return null;
    const u = cuentas().find((c) => c.id === id);
    return u ? (u.full_name || u.email || "una cuenta") : "una cuenta que ya no está";
  }

  const fecha = new Intl.DateTimeFormat("es-CR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Costa_Rica" });

  // Un valor guardado, legible: un id de persona se cambia por su nombre.
  function valor(v) {
    if (v == null) return "vacío";
    if (typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(v)) {
      const u = cuentas().find((c) => c.id === v);
      if (u) return u.full_name || u.email;
    }
    const t = typeof v === "string" ? v : JSON.stringify(v);
    return t.length > 60 ? t.slice(0, 57) + "…" : t;
  }

  function fila(r) {
    const li = el("li", "py-3");
    const arriba = el("div", "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1");
    const que = QUE[r.tabla] ? QUE[r.tabla][INDICE[r.operacion]] : r.tabla + " · " + r.operacion;
    arriba.appendChild(el("p", "text-sm font-semibold text-brand-800 dark:text-white", que));
    const cuando = el("time", "text-xs text-brand-500 dark:text-brand-300 whitespace-nowrap", fecha.format(new Date(r.cuando)));
    cuando.dateTime = r.cuando;
    arriba.appendChild(cuando);
    li.appendChild(arriba);

    const quien = r.quien ? nombreDe(r.quien) : "El sistema (una tarea automática o una función del servidor)";
    const linea = el("p", "text-xs text-brand-600 dark:text-brand-300 mt-0.5");
    linea.textContent = "Lo hizo: " + quien + (r.sobre ? " · Sobre: " + nombreDe(r.sobre) : "");
    li.appendChild(linea);

    if (r.operacion === "cambio" && r.despues) {
      const ul = el("ul", "mt-1 text-xs text-brand-700 dark:text-brand-200 space-y-0.5");
      Object.keys(r.despues).forEach((k) => {
        ul.appendChild(el("li", "", k + ": " + valor(r.antes && r.antes[k]) + " → " + valor(r.despues[k])));
      });
      li.appendChild(ul);
    }

    // Todo lo guardado, para quien necesite el detalle (una auditoría).
    const det = el("details", "mt-1");
    const sum = el("summary", "text-xs text-accent-700 dark:text-accent-400 cursor-pointer rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Ver los datos guardados");
    det.appendChild(sum);
    det.appendChild(el("pre", "mt-1 text-xs whitespace-pre-wrap break-all bg-brand-50 dark:bg-brand-950 rounded p-2 text-brand-700 dark:text-brand-200",
      JSON.stringify({ antes: r.antes, despues: r.despues, via: r.via, id: r.id }, null, 2)));
    li.appendChild(det);
    return li;
  }

  async function cargar(desdeCero) {
    if (pidiendo) return;
    pidiendo = true;
    if (desdeCero) { desde = 0; $("aud-lista").replaceChildren(); }
    $("aud-estado").textContent = "Cargando…";
    $("aud-mas").hidden = true;
    let q = sb.from("auditoria").select("*")
      .order("cuando", { ascending: false }).order("id", { ascending: false });
    const grupo = GRUPOS[$("aud-filtro").value];
    if (grupo) q = q.in("tabla", grupo);
    const { data, error } = await q.range(desde, desde + PAGINA - 1);
    pidiendo = false;
    if (error) { $("aud-estado").textContent = "No se pudo cargar el registro: " + error.message; return; }
    const filas = data || [];
    filas.forEach((r) => $("aud-lista").appendChild(fila(r)));
    desde += filas.length;
    $("aud-mas").hidden = filas.length < PAGINA;
    $("aud-estado").textContent = desde === 0
      ? "Todavía no hay cambios anotados" + (grupo ? " de este tipo." : ".")
      : (desde === 1 ? "1 cambio" : desde + " cambios") + (filas.length < PAGINA ? ", los más nuevos primero." : " (los más nuevos primero; hay más).");
  }

  function iniciar(obtenerCuentas) {
    cuentas = obtenerCuentas;
    $("aud-filtro").addEventListener("change", () => cargar(true));
    $("aud-actualizar").addEventListener("click", () => cargar(true));
    $("aud-mas").addEventListener("click", () => cargar(false));
  }

  function abrir() {
    if (abierto) return;
    abierto = true;
    cargar(true);
  }

  window.AdminAuditoria = { iniciar, abrir };
})();
