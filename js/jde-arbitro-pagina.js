/* El código de jde-arbitro.html (modo árbitro de Juegos Estudiantiles MEP).

   No arma el torneo: eso lo hace Pareo Integral, que ya está comprobado
   contra los ejercicios de desempate de FIDE. Esta página solo lee el .json
   que Pareo Integral deja bajar («Bajar el torneo»), calcula la clasificación
   final con el MISMO motor (window.PareoDesempates, el mismo que usa
   pareo.html) y publica el resumen —sin cuenta— en jde-publicar.
   Ver «Juegos Estudiantiles MEP, modo árbitro» en
   docs/decisiones/juegos-y-torneos.md. */
(function () {
  "use strict";
  const F = window.JdeFases;
  const T = window.PareoTorneo;
  const D = window.PareoDesempates;

  const $ = (id) => document.getElementById(id);
  let clasificacionLeida = null; // [{puesto, id, nombre, puntos}], de PareoDesempates.clasificacion

  function llenarSelect(select, opciones, valorAtr) {
    select.textContent = "";
    opciones.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.id;
      opt.textContent = o.nombre;
      select.appendChild(opt);
    });
    if (valorAtr !== undefined) select.value = valorAtr;
  }

  function actualizarCampoRegion() {
    const esNacional = $("ja-fase").value === "nacional";
    $("ja-region-campo").classList.toggle("hidden", esNacional);
  }

  function pintarNormativa() {
    const ul = $("ja-normativa");
    ul.textContent = "";
    F.anios().forEach((anio) => {
      const n = F.normativaDe(anio);
      const li = document.createElement("li");
      if (n) {
        const a = document.createElement("a");
        a.href = n.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.className = "font-semibold text-brand-800 dark:text-white underline underline-offset-2 hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        a.textContent = String(anio) + ": " + n.nombre;
        li.appendChild(a);
      } else {
        li.textContent = String(anio) + ": normativa pendiente de publicar.";
        li.className = "text-brand-500 dark:text-brand-300";
      }
      ul.appendChild(li);
    });
  }

  function pintarClasificacion() {
    const caja = $("ja-clasificacion-caja");
    const cuerpo = $("ja-clasificacion-cuerpo");
    cuerpo.textContent = "";
    if (!clasificacionLeida || !clasificacionLeida.length) {
      caja.classList.add("hidden");
      return;
    }
    caja.classList.remove("hidden");
    clasificacionLeida.forEach((fila) => {
      const tr = document.createElement("tr");
      tr.className = "border-t border-brand-100 dark:border-brand-800";

      const tdPuesto = document.createElement("td");
      tdPuesto.className = "py-1 pr-2";
      tdPuesto.textContent = String(fila.puesto);
      tr.appendChild(tdPuesto);

      const tdNombre = document.createElement("td");
      tdNombre.className = "py-1 pr-2";
      tdNombre.textContent = fila.nombre;
      tr.appendChild(tdNombre);

      const tdPuntos = document.createElement("td");
      tdPuntos.className = "py-1 pr-2";
      tdPuntos.textContent = String(fila.puntos);
      tr.appendChild(tdPuntos);

      const tdInst = document.createElement("td");
      tdInst.className = "py-1";
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 120;
      input.dataset.id = fila.id;
      input.placeholder = "Institución";
      input.className = "w-full rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 text-brand-800 dark:text-white px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
      tdInst.appendChild(input);
      tr.appendChild(tdInst);

      cuerpo.appendChild(tr);
    });
  }

  function leerArchivo(archivo) {
    const estado = $("ja-archivo-estado");
    clasificacionLeida = null;
    pintarClasificacion();
    if (!archivo) { estado.textContent = ""; return; }
    estado.textContent = "Leyendo el torneo…";
    const lector = new FileReader();
    lector.onload = () => {
      let t;
      try { t = JSON.parse(String(lector.result)); }
      catch { estado.textContent = "Ese archivo no es un .json válido."; return; }
      if (!t || !Array.isArray(t.jugadores) || !Array.isArray(t.rondas)) {
        estado.textContent = "Ese archivo no es un torneo de Pareo Integral (le falta jugadores o rondas).";
        return;
      }
      if (!t.jugadores.length) {
        estado.textContent = "Ese torneo no tiene jugadores.";
        return;
      }
      let filas;
      try { filas = D.clasificacion(t, t.desempates || []); }
      catch { estado.textContent = "No se pudo calcular la clasificación de ese torneo."; return; }
      const porId = new Map(t.jugadores.map((j) => [j.id, j]));
      clasificacionLeida = filas.map((f) => ({
        puesto: f.puesto, id: f.id, puntos: f.puntos,
        nombre: (porId.get(f.id) || {}).nombre || f.id,
      }));
      estado.textContent = "Se leyeron " + clasificacionLeida.length + " jugadores de «" + (t.nombre || "el torneo") + "».";
      if (!$("ja-nombre").value) $("ja-nombre").value = t.nombre || "";
      pintarClasificacion();
    };
    lector.onerror = () => { estado.textContent = "No se pudo leer ese archivo."; };
    lector.readAsText(archivo);
  }

  function institucionDe(id) {
    const input = $("ja-clasificacion-cuerpo").querySelector('input[data-id="' + CSS.escape(String(id)) + '"]');
    return input ? input.value.trim().slice(0, 120) : "";
  }

  async function publicar(ev) {
    ev.preventDefault();
    const boton = $("ja-publicar");
    const fase = $("ja-fase").value;
    const region = $("ja-region").value.trim();
    const nombre = $("ja-nombre").value.trim();
    const arbitro = $("ja-arbitro").value.trim();

    if (!nombre) { Avisos.avisar("Escribe el nombre del evento.", { tipo: "error" }); return; }
    if (fase !== "nacional" && !region) { Avisos.avisar("Escribe la región o el comité que organiza.", { tipo: "error" }); return; }
    if (!arbitro) { Avisos.avisar("Escribe tu nombre.", { tipo: "error" }); return; }
    if (!clasificacionLeida || !clasificacionLeida.length) {
      Avisos.avisar("Sube primero el .json del torneo ya cerrado.", { tipo: "error" });
      return;
    }

    const clasificacion = clasificacionLeida.map((f) => ({
      puesto: f.puesto, nombre: f.nombre, puntos: f.puntos, institucion: institucionDe(f.id),
    }));

    boton.disabled = true;
    try {
      const { data, error } = await window.sb.functions.invoke("jde-publicar", {
        body: {
          anio: Number($("ja-anio").value),
          fase,
          region,
          categoria: $("ja-categoria").value.trim(),
          rama: $("ja-rama").value,
          nombre,
          sede: $("ja-sede").value.trim(),
          fecha: $("ja-fecha").value,
          arbitro,
          correo: $("ja-correo").value.trim(),
          clasificacion,
        },
      });
      if (error || !data || data.ok === false) {
        Avisos.avisar((data && data.error) || "No se pudo publicar el evento. Intenta de nuevo.", { tipo: "error" });
        return;
      }
      Avisos.avisar("Evento publicado. Ya aparece en la página pública.", { tipo: "ok" });
      $("ja-form").reset();
      clasificacionLeida = null;
      pintarClasificacion();
      $("ja-archivo-estado").textContent = "";
    } catch {
      Avisos.avisar("No se pudo publicar el evento. Intenta de nuevo.", { tipo: "error" });
    } finally {
      boton.disabled = false;
    }
  }

  function iniciar() {
    llenarSelect($("ja-anio"), F.anios().map((a) => ({ id: a, nombre: String(a) })), F.anioMasReciente());
    llenarSelect($("ja-fase"), F.FASES);
    llenarSelect($("ja-rama"), F.RAMAS);
    actualizarCampoRegion();
    pintarNormativa();
    $("ja-fase").addEventListener("change", actualizarCampoRegion);
    $("ja-archivo").addEventListener("change", (e) => leerArchivo(e.target.files && e.target.files[0]));
    $("ja-form").addEventListener("submit", publicar);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
