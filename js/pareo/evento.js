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
  const clasificacionDe = (t) => aplicarDesempate(t, E.clasificacion(Object.assign({}, t, { rondas: t.rondas.slice(0, rondasCompletas(t)) }), t.desempates));

  // El desempate rápido que jugó el árbitro (un blitz, un Armagedón) para
  // un empate que los desempates no resolvieron: `t.desempateCorte` = {
  // formato, orden: [ids] }. Ordena a esos jugadores, y solo si siguen
  // empatados entre ellos (si una ronda corregida deshizo el empate, el
  // desempate ya no aplica y se ignora).
  function aplicarDesempate(t, filas) {
    const d = t.desempateCorte;
    if (!d || !Array.isArray(d.orden) || d.orden.length < 2) return filas;
    const pos = filas.map((f, i) => (d.orden.includes(f.id) ? i : -1)).filter((i) => i >= 0);
    if (pos.length !== d.orden.length || new Set(pos.map((i) => filas[i].puesto)).size !== 1) return filas;
    const base = filas[pos[0]].puesto;
    const copia = filas.slice();
    d.orden.forEach((id, k) => { copia[pos[k]] = Object.assign({}, filas.find((f) => f.id === id), { puesto: base + k, porDesempate: true }); });
    return copia;
  }

  // Quiénes están empatados en el último lugar que clasifica (para armar el
  // desempate), o [] si no hay empate en el corte.
  function empatadosEnCorte(t, n) {
    if (!rondasCompletas(t) || !n) return [];
    const filas = clasificacionDe(t);
    if (filas.length <= n || filas[n].puesto !== filas[n - 1].puesto) return [];
    return filas.filter((f) => f.puesto === filas[n - 1].puesto).map((f) => f.id);
  }
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
  // Quién firma el acta, en ese orden.
  const CARGOS_FIRMA = { principal: "Árbitro principal", comite: "Representante del Comité Organizador", delegado: "Representante de las delegaciones" };
  const deBase64 = (b64) => (typeof atob === "function"
    ? Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    : Uint8Array.from(Buffer.from(b64, "base64")));

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
    if ((d.variosOrigenes || []).length) seccion((++n) + ". Inscritos en más de una Dirección Regional", d.variosOrigenes.map((x) => x.nombre + " (" + x.institucion + "): viene en " + x.origenes + "."), "");
    if ((d.hombresEnMujeres || []).length) seccion((++n) + ". Anotados como hombres en un torneo de mujeres", d.hombresEnMujeres, "");

    // Lo que se cambió después de crear los torneos (en el congresillo):
    // cada torneo guarda lo suyo.
    const movimientos = torneos.flatMap((t) => (t.movimientos || []).map((x) => x.nombre + " (" + (x.institucion || "—") + "): de " + x.desde + " a " + nombreTorneo(t) + "."));
    if (movimientos.length) seccion((++n) + ". Cambios de torneo", movimientos, "");
    const reemplazos = torneos.flatMap((t) => (t.reemplazos || []).map((x) => x.equipo + ", " + nombreTorneo(t) + ": sale " + x.sale + " y entra " + x.entra + "."));
    if (reemplazos.length) seccion((++n) + ". Reemplazos en los equipos", reemplazos, "");
    const ausentes = torneos.flatMap((t) => (t.noSePresentaron || []).map((x) => x + " (" + nombreTorneo(t) + ")."));
    if (ausentes.length) seccion((++n) + ". No se presentaron a la ronda 1", ausentes, "");
    const comparacion = d.comparacion || { noClasificaron: [], faltan: [] };
    if (comparacion.noClasificaron.length || comparacion.faltan.length) {
      seccion((++n) + ". Inscritos que no venían en los clasificados de la etapa anterior", comparacion.noClasificaron.map((x) => x + "."), "No hubo.");
      seccion((++n) + ". Clasificados de la etapa anterior que no vienen en la inscripción", comparacion.faltan.map((x) => x + "."), "No hubo.");
    }

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

    const tardios = torneos.flatMap((t) => (t.tardios || []).map((x) => x.nombre + " (" + (x.institucion || "—") + "), " + nombreTorneo(t) + ": entró en la ronda " + x.ronda + "." + (x.aviso ? " " + x.aviso : "")));
    if (tardios.length) seccion((++n) + ". Inscripciones el día del torneo", tardios, "");

    // Las firmas: la que se hizo en la pantalla (evento.firmas) va como
    // imagen, con el nombre y la hora; si no, la línea para firmar a mano.
    b.push({ tipo: "titulo", texto: "Firmas" });
    const fotos = [];
    for (const [cargo, etiqueta] of Object.entries(CARGOS_FIRMA)) {
      const suyas = (evento.firmas || []).filter((f) => f.cargo === cargo && f.jpeg);
      if (!suyas.length) {
        b.push({ tipo: "parrafo", texto: linea(etiqueta + (cargo === "principal" && primero.arbitro ? ": " + primero.arbitro : "")) });
        continue;
      }
      for (const f of suyas) {
        const foto = { jpeg: deBase64(f.jpeg), ancho: f.ancho, alto: f.alto };
        fotos.push(foto);
        b.push({ tipo: "foto", foto, anchoMax: 180, pie: etiqueta + ": " + f.nombre + (f.hora ? " · firmó a las " + horaTexto(f.hora) : "") });
      }
    }
    return { titulo: "Acta del congresillo técnico — Ajedrez", subtitulo: evento.nombre, pie: "Pareo Integral · ajedrez-integral.com", bloques: b, fotos };
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
      if (t.desempateCorte && cl.filas.some((f) => f.porDesempate)) b.push({ tipo: "nota", texto: "Desempate del corte (" + (t.desempateCorte.formato || "desempate rápido") + "): " +
        t.desempateCorte.orden.map((id, k) => (k + 1) + ". " + ((participante(t, id) || {}).nombre || "?")).join(", ") + "." });
      const tableros = podio(t).tableros;
      if (tableros.length) b.push({ tipo: "lista", items: tableros.map((x) => "Mejor tablero " + x.tablero + ": " +
        (x.filas.length ? x.filas.map((f) => f.nombre + " (" + f.institucion + ", " + porcentajeTexto(f.porcentaje) + ")").join("; ") : "sin datos") + ".") });
    }

    const med = medallero(torneos);
    if (med.length) {
      b.push({ tipo: "titulo", texto: "Medallero por centro educativo" });
      b.push({ tipo: "tabla", encabezados: ["Centro educativo", "Oro", "Plata", "Bronce", "Total"], anchos: [4, 0.8, 0.8, 0.8, 0.8],
        filas: med.map((x) => [x.centro, String(x.oro), String(x.plata), String(x.bronce), String(x.total)]) });
    }

    const regiones = porDireccion(torneos, n);
    if (regiones.length > 1) {
      b.push({ tipo: "titulo", texto: "Por Dirección Regional" });
      b.push({ tipo: "tabla", encabezados: ["Dirección Regional", "Estudiantes", "Oro", "Plata", "Bronce", "Clasifican"], anchos: [3, 1, 0.7, 0.7, 0.7, 1],
        filas: regiones.map((x) => [x.region, String(x.estudiantes), String(x.oro), String(x.plata), String(x.bronce), String(x.clasifican)]) });
    }

    const inc = torneos.flatMap((t) => incidenciasDe(t).map((x) => nombreTorneo(t) + " · " + x));
    b.push({ tipo: "titulo", texto: "Incidencias" });
    if (inc.length) b.push({ tipo: "lista", items: inc });
    else b.push({ tipo: "nota", texto: "No se anotaron incidencias." });

    b.push({ tipo: "titulo", texto: "Firmas" });
    b.push({ tipo: "parrafo", texto: linea("Árbitro principal" + (primero.arbitro ? ": " + primero.arbitro : "")) });
    b.push({ tipo: "parrafo", texto: linea("Comité Organizador") });
    return { titulo: "Informe oficial de participación y resultados — Ajedrez", subtitulo: evento.nombre, pie: "Pareo Integral · ajedrez-integral.com", bloques: b, fotos: [] };
  }

  // ---------- Los clasificados, en el formato de la inscripción ----------
  // Las mismas columnas que lee «Subir una lista» (js/pareo/pagina.js), más
  // «Torneo» (Mujeres o Abierto), que la inscripción del MEP no trae: así la
  // etapa siguiente sabe dónde juega cada una sin suponerlo.
  // «Etapa» y «Lugar» dicen de dónde salió la lista: al subirla, la página
  // ofrece armar la etapa que sigue (siguienteDe).
  const ENCABEZADOS = ["Nombre", "Sexo", "FDN", "Nombre de Centro Educativo", "Dirección Regional", "Categoría", "Equipo/Ind", "Torneo", "Elo", "ID FIDE", "Puesto", "Etapa", "Lugar"];
  function filasClasificados(evento, torneos) {
    const n = cupo(evento.jde);
    const region = evento.jde && evento.jde.etapa === "regional" ? evento.jde.lugar : "";
    const etapa = evento.jde ? NOMBRE_ETAPA[evento.jde.etapa] || "" : "";
    const lugar = lugarTexto(evento.jde);
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
            Number(j.elo) > 0 ? String(j.elo) : "", j.fideId || "", String(f.puesto), etapa, lugar]);
        }
      }
    }
    return filas;
  }

  // El lugar de una etapa, escrito: la Dirección Regional, la interregional
  // con sus regiones o el centro educativo.
  function lugarTexto(jde) {
    if (!jde) return "";
    if (jde.etapa === "regional") return jde.lugar ? "DRE " + jde.lugar : "";
    if (jde.etapa === "interregional") {
      const x = G.JDE_INTERREGIONALES.find((i) => i.numero === jde.lugar);
      return x ? G.nombreInterregional(x) : "";
    }
    return String(jde.lugar || "").trim();
  }

  // De una lista de clasificados subida de nuevo: si todos vienen de la
  // misma etapa, la que sigue (la Nacional no se arma acá: la organiza el
  // MEP con otra normativa). null si la lista no dice de dónde viene o
  // mezcla etapas.
  function siguienteDe(etapas) {
    const distintas = [...new Set(etapas.filter(Boolean))];
    if (distintas.length !== 1 || etapas.some((e) => !e)) return null;
    const siguiente = SIGUIENTE[distintas[0]];
    return siguiente && G.JDE_ETAPAS[siguiente] ? { desde: distintas[0], etapa: siguiente } : null;
  }

  // ---------- La premiación ----------
  const MEDALLA = { 1: "Oro", 2: "Plata", 3: "Bronce" };
  const LUGAR = { 1: "Primer lugar", 2: "Segundo lugar", 3: "Tercer lugar" };

  // Los tres primeros de un torneo (con los empates que los desempates no
  // resolvieron, todos con su medalla) y, en uno por equipos, el mejor de
  // cada tablero. Con las rondas completas: si no terminó, es provisional.
  function podio(t) {
    const k = rondasCompletas(t);
    const filas = k ? clasificacionDe(t).filter((f) => f.puesto <= 3) : [];
    const tableros = E.esDeEquipos(t) && k ? E.mejoresTableros(t, k).map((x) => ({ tablero: x.tablero, filas: x.filas.filter((f) => f.puesto === 1) })) : [];
    return {
      filas: filas.map((f) => Object.assign({ medalla: MEDALLA[f.puesto] }, f, { participante: participante(t, f.id) })),
      tableros, terminado: terminado(t), rondas: k, total: totalRondas(t),
    };
  }

  const porcentajeTexto = (x) => Math.round(x * 100) + " %";

  function premiacion(evento, torneos) {
    const b = [];
    b.push({ tipo: "parrafo", texto: "Para leer en el acto de premiación, torneo por torneo: del tercer lugar al primero." });
    for (const t of torneos) {
      const p = podio(t);
      b.push({ tipo: "subtitulo", texto: nombreTorneo(t) });
      if (!p.filas.length) { b.push({ tipo: "nota", texto: "Sin rondas jugadas." }); continue; }
      if (!p.terminado) b.push({ tipo: "nota", texto: "Provisional: " + p.rondas + " de " + p.total + " rondas." });
      const items = p.filas.slice().reverse().map((f) => {
        const x = f.participante;
        const quien = E.esDeEquipos(t) ? x.nombre + " (" + x.integrantes.map((j) => j.nombre).join(", ") + ")" : x.nombre + " — " + (x.institucion || "—");
        return f.medalla + ", " + LUGAR[f.puesto].toLowerCase() + ": " + quien + " · " + puntosTexto(f.puntos) + " puntos.";
      });
      b.push({ tipo: "lista", items });
      if (p.filas.filter((f) => f.puesto === 1).length > 1) b.push({ tipo: "nota", texto: "Empate en el primer lugar que los desempates no resolvieron: lo decide el árbitro principal." });
      if (p.tableros.length) {
        b.push({ tipo: "lista", items: p.tableros.map((x) => "Mejor tablero " + x.tablero + ": " + (x.filas.length
          ? x.filas.map((f) => f.nombre + " (" + f.institucion + ", " + puntosTexto(f.puntos) + " de " + f.jugadas + ", " + porcentajeTexto(f.porcentaje) + ")").join("; ")
          : "nadie jugó ahí la mitad de las rondas") + ".") });
      }
    }
    const med = medallero(torneos);
    if (med.length) {
      b.push({ tipo: "titulo", texto: "Medallero por centro educativo" });
      b.push({ tipo: "tabla", encabezados: ["Centro educativo", "Oro", "Plata", "Bronce", "Total"], anchos: [4, 0.8, 0.8, 0.8, 0.8],
        filas: med.map((x) => [x.centro, String(x.oro), String(x.plata), String(x.bronce), String(x.total)]) });
    }
    b.push({ tipo: "nota", texto: "Mejor tablero: el mejor porcentaje entre quienes jugaron en ese tablero al menos la mitad de las rondas, sin contar las partidas no jugadas." });
    return { titulo: "Premiación — Ajedrez", subtitulo: evento.nombre, pie: "Pareo Integral · ajedrez-integral.com", bloques: b, fotos: [] };
  }

  // Un diploma por persona premiada: cada integrante de un equipo lleva el
  // suyo, con el nombre del equipo.
  function diplomas(evento, torneos) {
    const out = [];
    for (const t of torneos) {
      const p = podio(t);
      for (const f of p.filas) {
        const x = f.participante;
        const personas = E.esDeEquipos(t) ? x.integrantes : [x];
        for (const j of personas) out.push({ nombre: j.nombre, institucion: j.institucion || x.institucion || "", lugar: LUGAR[f.puesto], torneo: nombreTorneo(t), evento: evento.nombre, equipo: E.esDeEquipos(t) ? x.nombre : "" });
      }
      for (const x of p.tableros) for (const f of x.filas) out.push({ nombre: f.nombre, institucion: f.institucion, lugar: "Mejor tablero " + x.tablero, torneo: nombreTorneo(t), evento: evento.nombre, equipo: f.institucion });
    }
    return out;
  }

  // Lo que dice cada diploma, en español (es un documento del MEP).
  function textoDiploma(d) {
    return {
      encabezado: d.evento,
      otorga: "Se otorga el presente reconocimiento a",
      nombre: d.nombre,
      centro: d.institucion ? "del centro educativo " + d.institucion : "",
      // «Primer lugar» se obtiene; «Mejor tablero 1» se es.
      motivo: (/^Mejor tablero/.test(d.lugar) ? "por ser el " : "por obtener el ") + d.lugar.charAt(0).toLowerCase() + d.lugar.slice(1) +
        (d.equipo ? " con el equipo de " + d.equipo : "") + " en " + d.torneo + ".",
    };
  }

  // ---------- Antes de la ronda 1 ----------
  // Lo que quedó para revisar de la inscripción (decisiones.revisar, lo arma
  // la página al crear el evento: { tipo, personas, vars }), solo lo de este
  // torneo: lo que nombra a alguien que juega acá (en un equipo corto, a sus
  // integrantes).
  const clave = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  function pendientes(t) {
    const todos = (t.evento && t.evento.decisiones && t.evento.decisiones.revisar) || [];
    const personas = E.esDeEquipos(t) ? t.jugadores.flatMap((e) => e.integrantes) : t.jugadores;
    const nombres = new Set(personas.map((j) => clave(j.nombre)));
    return todos.filter((x) => (x.personas || []).some((n) => nombres.has(clave(n))));
  }

  // ---------- El respaldo de todo el evento ----------
  // Un solo archivo con todos los torneos, para seguir en otra computadora.
  const FORMATO_RESPALDO = "pareo-integral-evento";
  function respaldo(evento, torneos) { return { formato: FORMATO_RESPALDO, version: 1, evento, torneos }; }
  function esRespaldo(d) {
    return !!d && d.formato === FORMATO_RESPALDO && Array.isArray(d.torneos) && d.torneos.length > 0 &&
      d.torneos.every((x) => x && x.formato === 1 && Array.isArray(x.jugadores) && Array.isArray(x.rondas));
  }

  // ---------- Lo que se ve desde el celular: todo el evento ----------
  // En equipos, cada tablero de un encuentro con quién juega con cada color
  // y su resultado: así quien busca a una integrante encuentra su tablero, y
  // quien toca un equipo ve cómo va quedando tablero a tablero. Vacío si no
  // es de equipos o el encuentro todavía no tiene alineación.
  function tablerosVista(t, m) {
    if (!E.esDeEquipos(t) || m.n == null || !m.alineacion) return {};
    const de = (idE, idJ) => { const e = participante(t, idE); const j = e && idJ && e.integrantes.find((y) => y.id === idJ); return j ? j.nombre : null; };
    return { tableros: E.tablerosDe(t, m).map((x) => ({ t: x.k + 1, b: de(x.bBlancas ? m.b : m.n, x.blancas), n: de(x.bBlancas ? m.n : m.b, x.negras), r: x.r || null })) };
  }

  // La última ronda y la clasificación de cada torneo, con los nombres ya
  // puestos (el que mira no tiene el torneo).
  function vistaTorneo(t) {
    const nombre = (id) => (participante(t, id) || {}).nombre || "?";
    const R = t.rondas[t.rondas.length - 1];
    const k = rondasCompletas(t);
    const mesasDe = (RR) => RR.mesas.map((m, i) => ({ m: i + 1, b: nombre(m.b), n: m.n == null ? null : nombre(m.n), r: m.r || null }));
    return {
      nombre: nombreTorneo(t),
      // Las rondas anteriores, sin los tableros: para el historial.
      anteriores: t.rondas.slice(0, -1).map((RR, k) => ({ n: k + 1, mesas: mesasDe(RR) })),
      ronda: R ? { n: t.rondas.length, inicio: R.inicio || null, mesas: R.mesas.map((m, i) => Object.assign({ m: i + 1, b: nombre(m.b), n: m.n == null ? null : nombre(m.n), r: m.r || null },
        tablerosVista(t, m))) } : null,
      clasificacion: k ? clasificacionDe(t).map((f) => ({ p: f.puesto, n: nombre(f.id), pts: f.puntos,
        // El centro educativo, para «Mi centro» en el celular.
        i: String((participante(t, f.id) || {}).institucion || "").trim(),
        // Los primeros desempates, para la ficha del jugador en el celular.
        d: (t.desempates || []).filter((c) => c !== "TB").slice(0, 3).map((c) => ({ c, v: Math.round((f.valores[c] || 0) * 100) / 100 })),
        // En equipos, los puntos de tablero (el primer desempate).
        ...(E.esDeEquipos(t) ? { pt: E.puntosTablero(t, f.id, k) } : {}) })) : [],
      ...mejoresVista(t, k),
    };
  }
  // En equipos, los mejores de cada tablero hasta ahora (los tres primeros),
  // para el celular: { mejores: [{ t, filas: [{ p, n, e, pts, j }] }] }.
  function mejoresVista(t, k) {
    if (!E.esDeEquipos(t) || !k) return {};
    const mejores = E.mejoresTableros(t, k).filter((x) => x.filas.length).map((x) => ({ t: x.tablero,
      filas: x.filas.filter((f) => f.puesto <= 3).slice(0, 5).map((f) => ({ p: f.puesto, n: f.nombre, e: f.institucion, pts: f.puntos, j: f.jugadas })) }));
    return mejores.length ? { mejores } : {};
  }
  // `horario` (opcional, de horario()): las horas de cada ronda, para la
  // cuenta regresiva del enlace del evento y del proyector.
  function vistaEvento(evento, torneos, horario) {
    return { v: 2, nombre: evento.nombre, torneos: torneos.map((t, i) => {
      const x = vistaTorneo(t);
      const h = horario && horario[i];
      if (h && h.rondas.length) x.horas = h.rondas.map((rr) => rr.hora);
      return x;
    }) };
  }

  // ---------- El medallero por centro educativo ----------
  // Las medallas de todos los torneos del evento sumadas por centro: un
  // equipo cuenta una medalla para su centro, no una por integrante. Por oro,
  // después plata y después bronce, como un medallero olímpico.
  function medallero(torneos) {
    const porCentro = new Map();
    for (const t of torneos) {
      for (const f of podio(t).filas) {
        const x = f.participante;
        const centro = String((E.esDeEquipos(t) ? x.institucion || x.nombre : x.institucion) || "—").trim();
        const k = clave(centro);
        if (!porCentro.has(k)) porCentro.set(k, { centro, oro: 0, plata: 0, bronce: 0, total: 0 });
        const c = porCentro.get(k);
        c[{ 1: "oro", 2: "plata", 3: "bronce" }[f.puesto]]++;
        c.total++;
      }
    }
    return [...porCentro.values()].sort((a, b) => b.oro - a.oro || b.plata - a.plata || b.bronce - a.bronce || a.centro.localeCompare(b.centro, "es"));
  }

  // ---------- Las estadísticas para el MEP ----------
  // Cuántas participaciones por torneo, por categoría y por centro, con
  // mujeres y hombres aparte: las hojas del Excel (js/tabla-excel.js).
  function estadisticas(evento, torneos) {
    const sexo = (j) => (j.sexo === "w" ? "w" : j.sexo === "m" ? "m" : "");
    const contar = (lista) => ({ w: lista.filter((j) => sexo(j) === "w").length, m: lista.filter((j) => sexo(j) === "m").length, total: lista.length });
    const personasDe = (t) => (E.esDeEquipos(t) ? t.jugadores.flatMap((e) => e.integrantes.map((j) => Object.assign({ institucion: e.institucion }, j))) : t.jugadores);
    const categoriaDe = (t, j) => String(j.categoria || (/Categoría (\S+)/.exec(t.grupo || "") || [])[1] || "—").trim();
    const porTorneo = [["Torneo", "Modalidad", "Participantes", "Mujeres", "Hombres", "Total de estudiantes"]];
    const cat = new Map(), centro = new Map();
    for (const t of torneos) {
      const personas = personasDe(t);
      const c = contar(personas);
      porTorneo.push([nombreTorneo(t), E.esDeEquipos(t) ? "Equipos" : "Individual", String(t.jugadores.length), String(c.w), String(c.m), String(c.total)]);
      for (const j of personas) {
        const kc = categoriaDe(t, j) + "|" + (E.esDeEquipos(t) ? "Equipos" : "Individual");
        if (!cat.has(kc)) cat.set(kc, []);
        cat.get(kc).push(j);
        const ce = String(j.institucion || "—").trim();
        if (!centro.has(clave(ce))) centro.set(clave(ce), { nombre: ce, personas: [] });
        centro.get(clave(ce)).personas.push(j);
      }
    }
    const porCategoria = [["Categoría", "Modalidad", "Mujeres", "Hombres", "Total"]].concat([...cat.entries()].sort((a, b) => a[0].localeCompare(b[0], "es")).map(([k, l]) => {
      const [c, m] = k.split("|"); const x = contar(l);
      return [c, m, String(x.w), String(x.m), String(x.total)];
    }));
    const porCentro = [["Centro educativo", "Mujeres", "Hombres", "Total"]].concat([...centro.values()].sort((a, b) => b.personas.length - a.personas.length || a.nombre.localeCompare(b.nombre, "es")).map((x) => {
      const c = contar(x.personas);
      return [x.nombre, String(c.w), String(c.m), String(c.total)];
    }));
    return [
      { nombre: "Por torneo", filas: [[evento.nombre]].concat([[]], porTorneo) },
      { nombre: "Por categoría", filas: porCategoria },
      { nombre: "Por centro", filas: porCentro },
    ];
  }

  // ---------- Comparar con la etapa anterior ----------
  // La inscripción de una etapa contra los clasificados de la anterior: quién
  // se inscribió sin haber clasificado y quién clasificó y no viene. Por
  // nombre (sin tildes ni mayúsculas): la fecha de nacimiento a veces viene
  // escrita distinto en cada sistema.
  function compararEtapa(inscripcion, clasificados) {
    const k = (j) => clave(j.nombre);
    const enClasificados = new Set(clasificados.map(k));
    const enInscripcion = new Set(inscripcion.map(k));
    const unicos = (l) => [...new Map(l.map((j) => [k(j), j])).values()];
    return {
      noClasificaron: unicos(inscripcion.filter((j) => !enClasificados.has(k(j)))),
      faltan: unicos(clasificados.filter((j) => !enInscripcion.has(k(j)))),
    };
  }

  // ---------- El retraso ----------
  // En ajedrez, quien no llega pierde cuando su reloj cae a cero (art. 30 de
  // la normativa): el tiempo base del ritmo («10 min + 2 s» → 10).
  function minutosBase(ritmo) {
    // Lo de antes del «+» (el incremento no cuenta): «1 h 30 min», «90'», «10».
    const base = String(ritmo || "").split("+")[0];
    const num = (re) => { const m = re.exec(base); return m ? Number(m[1].replace(",", ".")) : null; };
    const horas = num(/(\d+(?:[.,]\d+)?)\s*(?:h|horas?)\b/i);
    const minutos = num(/(\d+)\s*(?:min|minutos?|')/i);
    if (horas == null && minutos == null) { const x = num(/(\d+(?:[.,]\d+)?)/); return x == null ? 0 : Math.round(x); }
    return Math.round((horas || 0) * 60 + (minutos || 0));
  }

  // Cómo va alguien que no había llegado al empezar la ronda: { minutos,
  // llego, vencido }. `ahora` en milisegundos.
  function estadoRetraso(R, id, ahora, base) {
    const x = (R.tarde || {})[id];
    if (!x || R.inicio == null) return null;
    const fin = x.llego || ahora;
    const minutos = Math.max(0, Math.floor((fin - R.inicio) / 60000));
    return { minutos, llego: !!x.llego, vencido: !x.llego && base > 0 && minutos >= base };
  }

  // ---------- Las incidencias ----------
  // Lo que más se reclama en una sala, con su artículo de las Leyes del
  // Ajedrez de la FIDE (las vigentes desde 2023): el informe lo lleva al lado.
  const ARTICULOS = {
    tocar: ["4.3", "pieza tocada"],
    bandera: ["6.9", "se le acabó el tiempo"],
    tarde: ["6.7", "llegó tarde"],
    ilegal: ["7.5", "jugada ilegal"],
    acuerdo: ["9.1", "tablas por acuerdo"],
    repeticion: ["9.2", "triple repetición"],
    cincuenta: ["9.3", "regla de las 50 jugadas"],
    automaticas: ["9.6", "tablas automáticas: quíntuple repetición o 75 jugadas"],
    celular: ["11.3.2", "aparato electrónico en la sala"],
    molestar: ["11.5", "molestar al rival"],
    sancion: ["12.9", "sanción del árbitro"],
  };
  const articuloTexto = (k) => (ARTICULOS[k] ? "art. " + ARTICULOS[k][0] + ", " + ARTICULOS[k][1] : "");
  const NOMBRE_INCIDENCIA = { reclamo: "Reclamo", sancion: "Sanción", decision: "Decisión del árbitro", apelacion: "Apelación", correccion: "Corrección de un resultado", adjunto: "Nota de un árbitro adjunto", otra: "Otra" };
  const horaTexto = (ms) => {
    try { return new Date(ms).toLocaleTimeString("es-CR", { hour: "numeric", minute: "2-digit", timeZone: "America/Costa_Rica" }); }
    catch (e) { return ""; }
  };
  function incidenciasDe(t) {
    const out = [];
    t.rondas.forEach((R, r) => (R.incidencias || []).forEach((x) => out.push("Ronda " + (r + 1) + (x.mesa ? ", mesa " + x.mesa : "") +
      (x.hora ? ", " + horaTexto(x.hora) : "") + " · " + (NOMBRE_INCIDENCIA[x.tipo] || NOMBRE_INCIDENCIA.otra) +
      (ARTICULOS[x.articulo] ? " (" + articuloTexto(x.articulo) + ")" : "") + (x.autor ? " Lo anota " + x.autor + "." : "") + ": " + x.texto +
      (x.presenta ? " Presenta: " + x.presenta + "." : "") + (x.tipo === "apelacion" ? " Resolución: " + (x.resolucion || "pendiente") + "." : ""))));
    return out;
  }

  // ---------- El horario del día ----------
  // Cuánto dura una ronda con un ritmo: el tiempo base de los dos jugadores
  // más el incremento de 40 jugadas para cada uno, redondeado a 5 minutos.
  function segundosIncremento(ritmo) {
    const m = /\+\s*(\d+)\s*(s|seg|segundos?|''|")?/i.exec(String(ritmo || ""));
    return m ? Number(m[1]) : 0;
  }
  function duracionRonda(ritmo) {
    const base = minutosBase(ritmo);
    if (!base) return 0;
    const min = 2 * base + (2 * 40 * segundosIncremento(ritmo)) / 60;
    return Math.ceil(min / 5) * 5;
  }
  // Las horas de cada ronda de cada torneo: desde `inicio` («08:30»), una
  // ronda detrás de otra con `descanso` minutos entre ellas.
  function horario(torneos, inicio, descanso) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(inicio || "").trim());
    if (!m) return [];
    const desde = Number(m[1]) * 60 + Number(m[2]);
    const hhmm = (x) => String(Math.floor(x / 60) % 24).padStart(2, "0") + ":" + String(x % 60).padStart(2, "0");
    return torneos.map((t) => {
      const dura = duracionRonda(t.ritmo);
      const n = totalRondas(t);
      const rondas = [];
      for (let k = 0; k < n && dura; k++) rondas.push({ n: k + 1, hora: hhmm(desde + k * (dura + (Number(descanso) || 0))) });
      return { torneo: nombreTorneo(t), dura, rondas };
    });
  }

  // ---------- Por Dirección Regional ----------
  // En la Interregional (o cuando la lista trae varias): cuántos estudiantes
  // trajo cada Dirección Regional, sus medallas y cuántos clasifican.
  function porDireccion(torneos, n) {
    const mapa = new Map();
    const de = (r) => {
      const k = String(r || "—").trim() || "—";
      if (!mapa.has(k)) mapa.set(k, { region: k, estudiantes: 0, oro: 0, plata: 0, bronce: 0, clasifican: 0 });
      return mapa.get(k);
    };
    const regionDe = (t, p) => (E.esDeEquipos(t) ? (p.integrantes[0] || {}).region : p.region);
    for (const t of torneos) {
      for (const p of E.esDeEquipos(t) ? t.jugadores.flatMap((e) => e.integrantes) : t.jugadores) de(p.region).estudiantes++;
      for (const f of podio(t).filas) de(regionDe(t, f.participante))[{ 1: "oro", 2: "plata", 3: "bronce" }[f.puesto]]++;
      for (const f of clasificados(t, n).filas) de(regionDe(t, participante(t, f.id))).clasifican++;
    }
    return [...mapa.values()].sort((a, b) => b.oro - a.oro || b.plata - a.plata || b.bronce - a.bronce || a.region.localeCompare(b.region, "es"));
  }

  // ---------- Las constancias de participación ----------
  // Una por estudiante que jugó, haya ganado o no (para su expediente).
  function constancias(evento, torneos) {
    const out = [];
    for (const t of torneos) {
      if (!t.rondas.length) continue;
      const personas = E.esDeEquipos(t) ? t.jugadores.flatMap((e) => e.integrantes.map((j) => Object.assign({ equipo: e.nombre }, j))) : t.jugadores;
      for (const j of personas) out.push({ nombre: j.nombre, institucion: j.institucion || "", torneo: nombreTorneo(t), evento: evento.nombre, equipo: j.equipo || "", fecha: t.fechaInicio || evento.creado || "" });
    }
    return out;
  }
  function textoConstancia(c) {
    return {
      encabezado: c.evento,
      titulo: "Constancia de participación",
      otorga: "Se hace constar que",
      nombre: c.nombre,
      centro: c.institucion ? "del centro educativo " + c.institucion : "",
      motivo: "participó en " + c.torneo + (c.equipo ? ", con el equipo de " + c.equipo : "") + (fechaTexto(c.fecha) ? ", el " + fechaTexto(c.fecha) : "") + ".",
    };
  }

  // ---------- El cierre del evento ----------
  // Lo que falta antes de dar el evento por terminado, torneo por torneo
  // ({ clave, vars } de js/pareo/textos.js): rondas sin jugar o sin
  // resultado, un empate en el corte sin desempate y apelaciones sin
  // resolver. Vacío: se puede cerrar.
  function revisarCierre(evento, torneos) {
    const n = cupo(evento.jde);
    return torneos.map((t) => {
      const problemas = [];
      const k = rondasCompletas(t), total = totalRondas(t);
      if (t.jugadores.length < 2) problemas.push({ clave: "cierreSinJugadores", vars: {} });
      else if (k < total) problemas.push({ clave: "cierreRondas", vars: { r: k, t: total } });
      if (n && clasificados(t, n).empate) problemas.push({ clave: "cierreEmpate", vars: {} });
      const apelaciones = t.rondas.flatMap((R) => R.incidencias || []).filter((x) => x.tipo === "apelacion" && !x.resolucion).length;
      if (apelaciones) problemas.push({ clave: "cierreApelaciones", vars: { n: apelaciones } });
      return { torneo: nombreTorneo(t), problemas };
    });
  }

  // ---------- Comparado con el año anterior ----------
  // Los torneos de la misma etapa y el mismo lugar del año anterior, de
  // data/ajedrez-estudiantil.json (los de chess-results que publica
  // «Ajedrez estudiantil en Costa Rica»), contra los de este evento, por
  // categoría, modalidad y rama. Se cuentan participantes como allá: en
  // individual, jugadores; en equipos, equipos. Solo el ritmo clásico.
  const ETAPA_CR = { regional: "Regional", interregional: "Interregional" };
  function compararAnioAnterior(evento, torneos, datos) {
    const jde = evento.jde || {};
    const anio = Number(jde.anio) - 1;
    const col = (datos.columnas || []).reduce((a, c, i) => Object.assign(a, { [c]: i }), {});
    const inter = jde.etapa === "interregional" && G.JDE_INTERREGIONALES.find((x) => x.numero === jde.lugar);
    const delLugar = (region) => (jde.etapa === "regional" ? clave(region) === clave(jde.lugar) : !!inter && inter.regiones.some((d) => clave(d) === clave(region)));
    const antes = (datos.torneos || []).filter((x) => x[col.anio] === anio && x[col.etapa] === ETAPA_CR[jde.etapa] && x[col.ritmo] === "Clásico" && delLugar(x[col.region]));
    const grupoDe = (categoria, modalidad, rama) => [categoria || "—", modalidad, rama].join(" · ");
    const mapa = new Map();
    const sumar = (k, que, n) => { if (!mapa.has(k)) mapa.set(k, { grupo: k, antes: null, ahora: null }); const f = mapa.get(k); f[que] = (f[que] || 0) + n; };
    for (const x of antes) sumar(grupoDe(x[col.categoria], x[col.modalidad] === "Equipos" ? "Equipos" : "Individual", x[col.rama] === "Femenina" ? "Mujeres" : "Abierto"), "antes", Number(x[col.jugadores]) || 0);
    for (const t of torneos) {
      const categoria = (/Categoría (\S+)/.exec(t.grupo || "") || [])[1] || (t.jugadores[0] && (t.jugadores[0].categoria || (t.jugadores[0].integrantes || [{}])[0].categoria)) || "";
      sumar(grupoDe(String(categoria).trim(), E.esDeEquipos(t) ? "Equipos" : "Individual", /Mujeres/.test(t.grupo || t.nombre) ? "Mujeres" : "Abierto"), "ahora", t.jugadores.length);
    }
    const filas = [...mapa.values()].sort((a, b) => a.grupo.localeCompare(b.grupo, "es"));
    return { anio, torneosAntes: antes.length, filas,
      totalAntes: filas.reduce((a, f) => a + (f.antes || 0), 0), totalAhora: filas.reduce((a, f) => a + (f.ahora || 0), 0) };
  }


  // ---------- Los resultados que conviene confirmar ----------
  // En una ronda: quien tiene 400 puntos de Elo (o más) por debajo le gana
  // a su rival. No se rechaza nada: es una sorpresa posible, pero también
  // el error más común al anotar (el resultado al revés).
  const DIFERENCIA_SORPRESA = 400;
  function sorpresas(t, r) {
    const R = t.rondas[r];
    if (!R || E.esDeEquipos(t)) return [];
    const out = [];
    R.mesas.forEach((m, i) => {
      if (m.n == null || (m.r !== "1-0" && m.r !== "0-1")) return;
      const b = participante(t, m.b), n = participante(t, m.n);
      const eb = Number(b && b.elo) || 0, en = Number(n && n.elo) || 0;
      if (!eb || !en) return;
      const [gana, pierde, eg, ep] = m.r === "1-0" ? [b, n, eb, en] : [n, b, en, eb];
      if (ep - eg >= DIFERENCIA_SORPRESA) out.push({ mesa: i, r: m.r, gana: gana.nombre, pierde: pierde.nombre, dif: ep - eg });
    });
    return out;
  }

  // ---------- La próxima ronda, con el horario del día ----------
  // De las horas de un torneo («08:00», «10:10»…), la primera que todavía no
  // pasó a `ahora` (minutos desde la medianoche, en hora de Costa Rica).
  function proximaRonda(horas, ahora) {
    for (let k = 0; k < (horas || []).length; k++) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(horas[k]);
      if (!m) continue;
      const min = Number(m[1]) * 60 + Number(m[2]);
      if (min >= ahora) return { n: k + 1, hora: horas[k], faltan: min - ahora };
    }
    return null;
  }

  // ---------- El informe para la prensa ----------
  // Un texto corto, para pegar en un comunicado o en redes: los campeones y
  // subcampeones de cada torneo, los mejores tableros y un par de datos
  // (cuántos jugaron, de cuántos centros, el más joven en un podio).
  function edadEn(nacimiento, fecha) {
    const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(nacimiento || "")), b = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha || ""));
    if (!a || !b) return null;
    let e = Number(b[1]) - Number(a[1]);
    if (b[2] + b[3] < a[2] + a[3]) e--;
    return e;
  }
  function informePrensa(evento, torneos, hoy) {
    const lineas = [];
    const personas = torneos.flatMap((t) => (E.esDeEquipos(t) ? t.jugadores.flatMap((e) => e.integrantes) : t.jugadores));
    const centros = new Set(personas.map((p) => clave(p.institucion)).filter(Boolean));
    lineas.push(evento.nombre || "Torneo de ajedrez");
    lineas.push("");
    lineas.push(personas.length + " estudiantes de " + centros.size + " centros educativos jugaron " + torneos.length + " torneos.");
    let joven = null;
    for (const t of torneos) {
      const p = podio(t);
      if (!p.filas.length) continue;
      lineas.push("");
      lineas.push(nombreTorneo(t) + (p.terminado ? "" : " (provisional, " + p.rondas + " de " + p.total + " rondas)"));
      for (const f of p.filas.filter((x) => x.puesto <= 2)) {
        const x = f.participante;
        // En un torneo de mujeres, «Campeona» (un equipo es «el campeón»).
        const a = !E.esDeEquipos(t) && /Mujeres/.test(nombreTorneo(t)) ? "a" : "";
        lineas.push((f.puesto === 1 ? "Campeón" : "Subcampeón").replace(/ón$/, a ? "ona" : "ón") + ": " + x.nombre + (E.esDeEquipos(t) ? "" : " (" + (x.institucion || "—") + ")") + ", " + puntosTexto(f.puntos) + " puntos.");
      }
      for (const x of p.tableros) if (x.filas.length) lineas.push("Mejor tablero " + x.tablero + ": " + x.filas.map((f) => f.nombre + " (" + f.institucion + ")").join(", ") + ".");
      for (const f of p.filas) {
        const gente = E.esDeEquipos(t) ? f.participante.integrantes : [f.participante];
        for (const g of gente) {
          const e = edadEn(g.nacimiento, hoy);
          if (e != null && (!joven || e < joven.edad)) joven = { edad: e, nombre: g.nombre, torneo: nombreTorneo(t) };
        }
      }
    }
    if (joven) { lineas.push(""); lineas.push("La edad más joven en un podio: " + joven.nombre + ", con " + joven.edad + " años (" + joven.torneo + ")."); }
    return lineas.join("\n");
  }

  // ---------- Su historial en los JDE de años anteriores ----------
  // El jugador de data/ajedrez-estudiantil-jugadores.json (JdeDatos) que es
  // esta persona: el mismo nombre sin tildes ni mayúsculas, o, si no, el
  // único cuyos nombres están todos en el de la inscripción (o al revés),
  // con al menos tres. Dos que podrían ser: ninguno (no se adivina).
  function buscarEnHistorial(nombre, jugadores, normalizar) {
    const k = normalizar(nombre);
    const exacto = jugadores.find((j) => j.clave === k);
    if (exacto) return exacto;
    const mios = k.split(" ").filter(Boolean);
    if (mios.length < 3) return null;
    const dentro = (a, b) => a.every((x) => b.includes(x));
    const posibles = jugadores.filter((j) => {
      const suyos = j.clave.split(" ").filter(Boolean);
      return suyos.length >= 3 && (dentro(suyos, mios) || dentro(mios, suyos));
    });
    return posibles.length === 1 ? posibles[0] : null;
  }


  // ---------- Revisar el pareo de una ronda ----------
  // Lo que conviene mirar antes de anunciar una ronda (no lo prohíbe el
  // Sistema Holandés, y nada se cambia solo): dos del mismo centro educativo
  // en una mesa, alguien con el mismo color tres rondas seguidas, y una mesa
  // con más de un punto de diferencia (en un suizo).
  function revisarPareo(t, r) {
    const R = t.rondas[r];
    if (!R || E.esDeEquipos(t)) return [];
    const out = [];
    const color = (id, k) => (T.situacion(t, k, id) || {}).color;
    R.mesas.forEach((m, i) => {
      if (m.n == null) return;
      const b = participante(t, m.b), n = participante(t, m.n);
      const ib = clave(b && b.institucion), inn = clave(n && n.institucion);
      if (ib && ib === inn) out.push({ tipo: "centro", mesa: i, centro: String(b.institucion).trim(), b: b.nombre, n: n.nombre });
      for (const [id, x] of [[m.b, b], [m.n, n]]) {
        if (r < 2) continue;
        const c = [color(id, r - 2), color(id, r - 1), color(id, r)];
        if (c[0] && c.every((y) => y === c[0])) out.push({ tipo: "colores", mesa: i, nombre: x.nombre, color: c[0] });
      }
      if (t.sistema !== "todos" && r > 0) {
        const pb = T.puntosHasta(t, m.b, r), pn = T.puntosHasta(t, m.n, r);
        if (Math.abs(pb - pn) > 1) out.push({ tipo: "puntos", mesa: i, b: b.nombre, n: n.nombre, pb, pn });
      }
    });
    return out;
  }

  // ---------- La mesa fija ----------
  // Quien necesita siempre la misma mesa (una silla de ruedas, una necesidad
  // especial): después de emparejar, su mesa se cambia de lugar con la que
  // está en ese número. No toca quién juega con quién ni los colores.
  function aplicarMesasFijas(t, R) {
    const movidas = [];
    if (!R || E.esDeEquipos(t)) return movidas;
    for (const j of t.jugadores) {
      const k = Number(j.mesaFija) - 1;
      if (!(k >= 0) || k >= R.mesas.length) continue;
      const i = R.mesas.findIndex((m) => m.b === j.id || m.n === j.id);
      if (i < 0 || i === k) continue;
      // Si la mesa de destino ya es fija de otro, no se le quita.
      const otro = R.mesas[k];
      const fija = (id) => { const y = participante(t, id); return y && Number(y.mesaFija) === k + 1; };
      if (fija(otro.b) || (otro.n != null && fija(otro.n))) continue;
      [R.mesas[i], R.mesas[k]] = [R.mesas[k], R.mesas[i]];
      movidas.push({ nombre: j.nombre, mesa: k + 1 });
    }
    return movidas;
  }

  // ---------- Los certificados de los árbitros ----------
  // Uno por persona que arbitró algún torneo del evento, con sus cargos.
  function certificadosArbitro(evento, torneos) {
    const porNombre = new Map();
    const sumar = (nombre, cargo, t) => {
      const n = String(nombre || "").trim();
      if (!n) return;
      const k = clave(n);
      if (!porNombre.has(k)) porNombre.set(k, { nombre: n, evento: evento.nombre, cargos: [], fecha: t.fechaInicio || evento.creado || "", rondas: 0 });
      const x = porNombre.get(k);
      x.cargos.push({ cargo, torneo: nombreTorneo(t), rondas: t.rondas.length });
      x.rondas = Math.max(x.rondas, t.rondas.length);
    };
    for (const t of torneos) {
      sumar(t.arbitro, "Árbitro principal", t);
      for (const a of String(t.arbitroAdjunto || "").split(/[;,]/)) sumar(a, "Árbitro adjunto", t);
    }
    return [...porNombre.values()];
  }
  function textoCertificadoArbitro(c) {
    const porCargo = new Map();
    for (const x of c.cargos) { if (!porCargo.has(x.cargo)) porCargo.set(x.cargo, []); porCargo.get(x.cargo).push(x.torneo + " (" + x.rondas + " rondas)"); }
    return {
      encabezado: c.evento,
      titulo: "Certificado de arbitraje",
      otorga: "Se hace constar que",
      nombre: c.nombre,
      motivo: [...porCargo].map(([cargo, ts]) => "fue " + cargo.toLowerCase() + " de " + ts.join(", ")).join("; y ") + (fechaTexto(c.fecha) ? ", el " + fechaTexto(c.fecha) : "") + ".",
    };
  }

  // ---------- Mi centro, en el enlace del evento ----------
  // Los de un centro educativo en todos los torneos (de la vista del evento:
  // la clasificación ya trae el centro de cada fila).
  function delCentro(vista, centro) {
    const k = clave(centro);
    if (!k) return [];
    return (vista.torneos || []).map((x) => ({ torneo: x.nombre, filas: (x.clasificacion || []).filter((f) => clave(f.i) === k) })).filter((x) => x.filas.length);
  }
  function centrosDeVista(vista) {
    const m = new Map();
    for (const x of vista.torneos || []) for (const f of x.clasificacion || []) if (f.i && !m.has(clave(f.i))) m.set(clave(f.i), f.i);
    return [...m.values()].sort((a, b) => a.localeCompare(b, "es"));
  }

  // ---------- Las marcas de las incidencias en el pareo ----------
  // Lo que se anotó contra un jugador en esta ronda (es decir, en esta
  // partida): «i» por cada jugada ilegal (art. 7.5) y «!» por cada otra
  // irregularidad. La segunda ilegal pierde la partida (art. 7.5.5): por eso
  // se cuentan por ronda, no en todo el torneo. Las correcciones de un
  // resultado y las apelaciones no marcan a nadie.
  const NO_MARCA = new Set(["correccion", "apelacion"]);
  function marcasIncidencias(R) {
    const out = new Map();
    for (const x of (R && R.incidencias) || []) {
      if (!x.jugador || NO_MARCA.has(x.tipo)) continue;
      const m = out.get(x.jugador) || { ilegales: 0, irregularidades: 0, items: [] };
      if (x.articulo === "ilegal") m.ilegales++; else m.irregularidades++;
      m.items.push(x);
      out.set(x.jugador, m);
    }
    return out;
  }
  const textoMarca = (m) => (m ? "i".repeat(m.ilegales) + "!".repeat(m.irregularidades) : "");

  const api = {
    marcasIncidencias, textoMarca,
    ARTICULOS, articuloTexto, revisarPareo, aplicarMesasFijas, certificadosArbitro, textoCertificadoArbitro, delCentro, centrosDeVista, CARGOS_FIRMA,
    sorpresas, proximaRonda, informePrensa, buscarEnHistorial, DIFERENCIA_SORPRESA,
    compararAnioAnterior,
    revisarCierre,
    aplicarDesempate, empatadosEnCorte, segundosIncremento, duracionRonda, horario, porDireccion, constancias, textoConstancia,
    medallero, estadisticas, compararEtapa, minutosBase, estadoRetraso, incidenciasDe, NOMBRE_INCIDENCIA,
    SIGUIENTE, NOMBRE_ETAPA, ENCABEZADOS, FORMATO_RESPALDO, cupo, clasificados, terminado, acta, informe, filasClasificados,
    lugarTexto, siguienteDe, podio, premiacion, diplomas, textoDiploma, pendientes, respaldo, esRespaldo, vistaTorneo, vistaEvento, tablerosVista, mejoresVista, rondasCompletas, totalRondas, nombreTorneo,
  };
  if (enNode) module.exports = api;
  else raiz.PareoEvento = api;
})(typeof self !== "undefined" ? self : this);
