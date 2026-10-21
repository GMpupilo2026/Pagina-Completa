/* ===== Pareo Integral — el evento de los JDE: acta, informe y clasificados =====
 *
 * Un «evento» es lo que se arma de una sola vez desde la inscripción de los
 * JDE con la configuración de los JDE: todos los torneos de una etapa en un
 * lugar («JDE 2026 · Etapa Regional · DRE Alajuela»). Cada torneo guarda una
 * copia de su evento (`evento`: id, nombre, jde, fecha y las decisiones que
 * tomó el árbitro en la sugerencia), así que los papeles se arman con lo que
 * hay en el navegador, aunque se pidan días después:
 *
 *   - el acta del congresillo técnico (art. 33 y 34 de la normativa: lo que
 *     se acuerda «debe quedar necesariamente por escrito en un Acta
 *     Oficial»), con las decisiones y el orden de tableros de cada equipo;
 *   - el informe oficial de participación y resultados, que la normativa
 *     pide remitir a la Comisión Ejecutiva;
 *   - los clasificados a la etapa siguiente (art. 66.1), y su lista en el
 *     mismo formato de la inscripción, para subirla en la etapa siguiente.
 *
 * Funciones puras, sin DOM: arman el «documento neutral» de js/reporte-pdf.js
 * y las filas del Excel; las usa js/pareo/pagina.js y las prueba
 * herramientas/verificar-pareo-evento.js. Los papeles van en español: son
 * documentos oficiales del MEP.
 */
(function (raiz) {
  "use strict";

  const enNode = typeof module !== "undefined" && module.exports;
  const T = enNode ? require("./torneo.js") : raiz.PareoTorneo;
  const E = enNode ? require("./equipos.js") : raiz.PareoEquipos;
  const G = enNode ? require("./grupos.js") : raiz.PareoGrupos;

  const SIGUIENTE = { institucional: "regional", regional: "interregional", interregional: "nacional" };
  const NOMBRE_ETAPA = { institucional: "Institucional", regional: "Regional", interregional: "Interregional", nacional: "Nacional" };

  // Cuántos clasifican de cada torneo a la etapa siguiente (art. 66.1):
  // de la Institucional, dos (f y g); de la Regional, tres si la
  // interregional cruza dos Direcciones Regionales y dos si cruza tres (i y
  // j); de la Interregional, el primero (k).
  function cupo(jde) {
    if (!jde) return 0;
    if (jde.etapa === "institucional") return 2;
    if (jde.etapa === "interregional") return 1;
    if (jde.etapa === "regional") {
      const inter = G.JDE_INTERREGIONALES.find((x) => x.regiones.includes(jde.lugar));
      return inter && inter.regiones.length >= 3 ? 2 : 3;
    }
    return 0;
  }

  const rondasCompletas = (t) => {
    let k = 0;
    while (k < t.rondas.length && T.rondaCompleta(t.rondas[k])) k++;
    return k;
  };
  const totalRondas = (t) => (t.sistema === "todos" ? T.rondasTodos(t) : Number(t.rondasTotales) || 0);
  const terminado = (t) => t.jugadores.length > 1 && rondasCompletas(t) >= totalRondas(t);
  const clasificacionDe = (t) => E.clasificacion(Object.assign({}, t, { rondas: t.rondas.slice(0, rondasCompletas(t)) }), t.desempates);
  const participante = (t, id) => t.jugadores.find((j) => j.id === id);
  const puntosTexto = (x) => {
    const n = Math.floor(x), m = x - n;
    return (n || !m ? String(n) : "") + (Math.abs(m - 0.5) < 1e-9 ? "½" : "");
  };

  // Los que clasifican de un torneo: los primeros `cupo` de la clasificación
  // (con las rondas completas), y si en el último lugar que clasifica hay un
  // empate que los desempates no resolvieron, se avisa: lo decide el árbitro
  // (un desempate rápido o un sorteo), nunca el orden de la lista.
  function clasificados(t, n) {
    // Sin ninguna ronda completa no hay clasificación: todos estarían
    // «empatados» en cero.
    const filas = rondasCompletas(t) ? clasificacionDe(t) : [];
    const dentro = filas.slice(0, n);
    const ultimo = dentro[dentro.length - 1];
    const empate = !!ultimo && filas.length > n && filas[n].puesto === ultimo.puesto;
    return { filas: dentro, empate, terminado: terminado(t), rondas: rondasCompletas(t), total: totalRondas(t) };
  }

  const fechaTexto = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
    return m ? Number(m[3]) + " de " + meses[Number(m[2]) - 1] + " de " + m[1] : "";
  };
  const sistemaTexto = (t) => (t.sistema === "todos" ? "todos contra todos" : "suizo de " + (Number(t.rondasTotales) || 0) + " rondas");
  // Para las tablas, más corto: en una columna angosta lo largo se corta.
  const sistemaCorto = (t) => (t.sistema === "todos" ? "Todos c. todos" : "Suizo, " + (Number(t.rondasTotales) || 0) + " rondas");
  const nombreTorneo = (t) => t.grupo || t.nombre;
  const linea = (s) => "______________________________   " + s;

  // ---------- El acta del congresillo ----------
  function acta(evento, torneos) {
    const d = (evento && evento.decisiones) || {};
    const primero = torneos[0] || {};
    const b = [];
    b.push({ tipo: "parrafo", texto: [
      "Fecha: " + (fechaTexto(primero.fechaInicio) || fechaTexto(evento.creado)),
      primero.ciudad ? "Sede: " + primero.ciudad : "",
      primero.arbitro ? "Árbitro principal: " + primero.arbitro : "",
      primero.arbitroAdjunto ? "Árbitro adjunto: " + primero.arbitroAdjunto : "",
    ].filter(Boolean).join(" · ") });
    b.push({ tipo: "parrafo", texto: "En el congresillo técnico de Ajedrez se acordó lo siguiente, según la Normativa de los Juegos Deportivos Estudiantiles " + (evento.jde ? evento.jde.anio : "") + "." });

    b.push({ tipo: "titulo", texto: "1. Torneos" });
    // El ritmo suele ser el mismo en todos: va una vez, no en una columna
    // (en la tabla se cortaba).
    const ritmos = [...new Set(torneos.map((t) => t.ritmo || "").filter(Boolean))];
    if (ritmos.length) b.push({ tipo: "parrafo", texto: "Ritmo de juego: " + ritmos.join("; ") + "." });
    b.push({ tipo: "tabla", encabezados: ["Torneo", "Particip.", "Sistema", "Desempates"], anchos: [3.4, 1, 1.6, 2],
      filas: torneos.map((t) => [nombreTorneo(t), String(t.jugadores.length) + (E.esDeEquipos(t) ? " eq." : ""), sistemaCorto(t), (t.desempates || []).join(" ")]) });

    const seccion = (titulo, items, vacio) => {
      b.push({ tipo: "titulo", texto: titulo });
      if (items.length) b.push({ tipo: "lista", items });
      else b.push({ tipo: "nota", texto: vacio });
    };
    let n = 1;
    seccion((++n) + ". Inscripciones repetidas", (d.repetidos || []).map((x) => x.nombre + " (" + x.institucion + "): aparece " + x.veces + " veces en la inscripción; se dejó una sola."), "No hubo.");
    seccion((++n) + ". Inscritos en más de una modalidad (art. 66.1.h)", (d.dosModalidades || []).map((x) => x.nombre + " (" + x.institucion + "): " + x.inscripciones + ". " + (x.queda ? "Queda en " + x.queda + "." : "Sin decidir: queda en las dos.")), "No hubo.");
    seccion((++n) + ". Mujeres de equipos que pasan al abierto (art. 66.1.g)", (d.pase || []).map((x) => x.institucion + ", categoría " + x.categoria + ": " + x.nombres + "."), "No hubo.");
    seccion((++n) + ". Descartados por los topes por centro (art. 66.1.f y g)", (d.descartados || []).map((x) => x.nombre + " (" + x.institucion + ", " + x.grupo + ")."), "No hubo.");
    seccion((++n) + ". Equipos con menos de 3 (art. 66.1.g)", (d.cortos || []).map((x) => x.institucion + ", " + x.grupo + ": " + x.cuantos + " (" + x.nombres + ")."), "No hubo.");
    seccion((++n) + ". Categoría según el año de nacimiento (art. 17 y 18)", (d.categorias || []), "Todos en la categoría de su año de nacimiento.");
    if ((d.hombresEnMujeres || []).length) seccion((++n) + ". Anotados como hombres en un torneo de mujeres", d.hombresEnMujeres, "");

    const deEquipos = torneos.filter((t) => E.esDeEquipos(t));
    if (deEquipos.length) {
      b.push({ tipo: "titulo", texto: (++n) + ". Orden de tableros (art. 66.2.h)" });
      // Un párrafo por equipo, con los nombres enteros: en una tabla de
      // seis columnas se cortaban.
      for (const t of deEquipos) {
        b.push({ tipo: "subtitulo", texto: nombreTorneo(t) });
        b.push({ tipo: "lista", items: T.ordenInicial(t).map((id) => {
          const e = participante(t, id);
          return e.nombre + ": " + e.integrantes.map((j, k) => (k < E.TABLEROS ? "Tablero " + (k + 1) : "Suplente") + ": " + j.nombre).join(" · ");
        }) });
      }
    }

    b.push({ tipo: "titulo", texto: "Firmas" });
    b.push({ tipo: "parrafo", texto: linea("Árbitro principal" + (primero.arbitro ? ": " + primero.arbitro : "")) });
    b.push({ tipo: "parrafo", texto: linea("Representante del Comité Organizador") });
    b.push({ tipo: "parrafo", texto: linea("Representante de las delegaciones") });
    return { titulo: "Acta del congresillo técnico — Ajedrez", subtitulo: evento.nombre, pie: "Pareo Integral · ajedrez-integral.com", bloques: b, fotos: [] };
  }

  // ---------- El informe oficial de participación y resultados ----------
  function informe(evento, torneos) {
    const n = cupo(evento.jde);
    const siguiente = evento.jde ? NOMBRE_ETAPA[SIGUIENTE[evento.jde.etapa]] : "";
    const primero = torneos[0] || {};
    const b = [];
    b.push({ tipo: "parrafo", texto: [
      "Fecha: " + (fechaTexto(primero.fechaInicio) || fechaTexto(evento.creado)),
      primero.ciudad ? "Sede: " + primero.ciudad : "",
      primero.arbitro ? "Árbitro principal: " + primero.arbitro : "",
    ].filter(Boolean).join(" · ") });

    // La participación: cuántos estudiantes de cada centro, en total.
    const porCentro = new Map();
    let estudiantes = 0;
    for (const t of torneos) {
      const personas = E.esDeEquipos(t) ? t.jugadores.flatMap((e) => e.integrantes) : t.jugadores;
      for (const p of personas) {
        estudiantes++;
        const c = String(p.institucion || "—").trim();
        porCentro.set(c, (porCentro.get(c) || 0) + 1);
      }
    }
    b.push({ tipo: "titulo", texto: "Participación" });
    b.push({ tipo: "parrafo", texto: torneos.length + " torneos, " + estudiantes + " participaciones de estudiantes de " + porCentro.size + " centros educativos." });
    b.push({ tipo: "tabla", encabezados: ["Centro educativo", "Estudiantes"], anchos: [4, 1],
      filas: [...porCentro.entries()].sort((a, c) => c[1] - a[1] || a[0].localeCompare(c[0], "es")).map(([c, k]) => [c, String(k)]) });

    b.push({ tipo: "titulo", texto: "Resultados" + (siguiente && n ? " y clasificados a la Etapa " + siguiente : "") });
    for (const t of torneos) {
      const cl = clasificados(t, Math.max(n, 3));
      b.push({ tipo: "subtitulo", texto: nombreTorneo(t) });
      b.push({ tipo: "nota", texto: sistemaTexto(t) + " · " + t.jugadores.length + (E.esDeEquipos(t) ? " equipos" : " jugadores") + " · " +
        (cl.terminado ? "terminado" : "provisional: " + cl.rondas + " de " + cl.total + " rondas") });
      if (!cl.filas.length) { b.push({ tipo: "nota", texto: "Sin rondas jugadas." }); continue; }
      b.push({ tipo: "tabla", encabezados: ["Puesto", "Nombre", "Centro educativo", "Puntos", "Clasifica"], anchos: [0.8, 2.6, 2.4, 0.9, 1],
        filas: cl.filas.map((f, i) => {
          const p = participante(t, f.id);
          return [String(f.puesto), p.nombre, p.institucion || "", puntosTexto(f.puntos), i < n ? "Sí" : ""];
        }) });
      if (cl.empate && n) b.push({ tipo: "nota", texto: "Empate en el último lugar que clasifica: lo resuelve el árbitro principal." });
    }

    b.push({ tipo: "titulo", texto: "Firmas" });
    b.push({ tipo: "parrafo", texto: linea("Árbitro principal" + (primero.arbitro ? ": " + primero.arbitro : "")) });
    b.push({ tipo: "parrafo", texto: linea("Comité Organizador") });
    return { titulo: "Informe oficial de participación y resultados — Ajedrez", subtitulo: evento.nombre, pie: "Pareo Integral · ajedrez-integral.com", bloques: b, fotos: [] };
  }

  // ---------- Los clasificados, en el formato de la inscripción ----------
  // Las mismas columnas que lee «Subir una lista» (js/pareo/pagina.js), más
  // «Torneo» (Mujeres o Abierto), que la inscripción del MEP no trae: así la
  // etapa siguiente sabe dónde juega cada una sin suponerlo.
  const ENCABEZADOS = ["Nombre", "Sexo", "FDN", "Nombre de Centro Educativo", "Dirección Regional", "Categoría", "Equipo/Ind", "Torneo", "Elo", "ID FIDE", "Puesto"];
  function filasClasificados(evento, torneos) {
    const n = cupo(evento.jde);
    const region = evento.jde && evento.jde.etapa === "regional" ? evento.jde.lugar : "";
    const filas = [];
    for (const t of torneos) {
      const torneo = /Mujeres/.test(t.grupo || t.nombre) ? "Mujeres" : "Abierto";
      const categoria = (/Categoría (\S+)/.exec(t.grupo || "") || [])[1] || "";
      for (const f of clasificados(t, n).filas) {
        const p = participante(t, f.id);
        const personas = E.esDeEquipos(t) ? p.integrantes : [p];
        for (const j of personas) {
          filas.push([j.nombre, j.sexo === "w" ? "MUJER" : j.sexo === "m" ? "HOMBRE" : "", j.nacimiento || "", j.institucion || p.institucion || "",
            j.region || region, j.categoria || categoria, E.esDeEquipos(t) ? "Equipo" : "Individual", torneo,
            Number(j.elo) > 0 ? String(j.elo) : "", j.fideId || "", String(f.puesto)]);
        }
      }
    }
    return filas;
  }

  const api = { SIGUIENTE, NOMBRE_ETAPA, ENCABEZADOS, cupo, clasificados, terminado, acta, informe, filasClasificados };
  if (enNode) module.exports = api;
  else raiz.PareoEvento = api;
})(typeof self !== "undefined" ? self : this);
