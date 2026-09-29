/**
 * Ajedrez Integral — el diagnóstico de un visitante, en PDF.
 *
 * Quien hace el diagnóstico público sin cuenta deja nombre y correo: es un
 * contacto para invitarlo a la Academia, y lo que más convence es mandarle su
 * resultado bien presentado. Este archivo arma ese PDF con la marca de agua de
 * Oscar Angulo Cubero en todas las páginas y sus datos en la firma y en el pie.
 *
 * NO dibuja nada por su cuenta. El resultado lo cuenta
 * `PlanEntrenamiento.resumir()` —la misma que pinta el «Ver detalle» de
 * Informes—, el plan lo arma `generarPlan()`, y el PDF lo escribe
 * `js/reporte-pdf.js`, el mismo generador de los reportes de actividades, con
 * la marca de `js/marca-agua.js`. Una segunda cuenta acá diría otro nivel que
 * la pantalla del mismo visitante.
 *
 * CON LA MARCA DE UNA ACADEMIA. Si el diagnóstico llegó por el enlace del
 * supervisor de una academia (opciones.academia), el PDF es de esa academia:
 * su franja con logo y nombre arriba, su color en los títulos, su logo como
 * marca de agua y su nombre y su WhatsApp en la firma y el pie. Ver «El PDF
 * del diagnóstico con la marca de la academia» en docs/decisiones/informes.md.
 *
 * El nombre, el correo y lo que la persona contó de sí misma los escribió ella:
 * en un PDF no se ejecuta nada, pero se pasan por String() porque tampoco está
 * garantizado que sean texto.
 */
window.DiagnosticoVisitantePDF = (function () {
  "use strict";

  const AUTOR = "Oscar Angulo Cubero";
  const CARGO = "Maestro Nacional, Entrenador FIDE y Árbitro Internacional";
  const ACADEMIA = "Ajedrez Integral";
  const WEB = "ajedrez-integral.com";

  // Un emoji no tiene dibujo en Helvetica: el generador lo tiraría y dejaría
  // un espacio suelto delante del título. Se quita acá, con su espacio.
  const sinEmoji = (s) => String(s == null ? "" : s)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s{2,}/g, " ").trim();
  const texto = (s) => sinEmoji(s);

  function fechaLarga(iso) {
    const d = iso ? new Date(iso) : null;
    if (!d || isNaN(d)) return "";
    return d.toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Costa_Rica" });
  }

  /* Un número de Costa Rica se lee «+506 8455 4870», no «50684554870». Lo que
     no tenga esa forma va tal cual lo escribieron. */
  function telefonoLegible(n) {
    const d = String(n || "").replace(/\D/g, "");
    if (d.length === 11 && d.startsWith("506")) return "+506 " + d.slice(3, 7) + " " + d.slice(7);
    if (d.length === 8) return d.slice(0, 4) + " " + d.slice(4);
    return texto(n);
  }

  // La banda va ESCRITA: el PDF se imprime en blanco y negro, y un color solo
  // no dice nada ahí. Los mismos umbrales que las barras de Informes.
  const banda = (p) => (p >= 80 ? "Firme" : p >= 60 ? "En camino" : "A trabajar");

  /* Arma el documento neutral que lee `ReportePDF.generar()`. Se exporta
     aparte para poder comprobar QUÉ dice el PDF sin tener que leer el PDF. */
  function documento(v, opciones) {
    const PE = window.PlanEntrenamiento;
    const o = opciones || {};
    const resumen = PE.resumir(v.detalle || {});
    const nombre = texto(v.nombre) || "Visitante";
    const fecha = fechaLarga(v.created_at);
    const perfil = resumen.perfil || {};
    const bloques = [];

    // --- de quién es
    const datos = [["Nombre", nombre]];
    if (v.email) datos.push(["Correo", texto(v.email)]);
    if (v.telefono) datos.push(["Teléfono", texto(v.telefono)]);
    if (fecha) datos.push(["Fecha del diagnóstico", fecha]);
    const contado = [
      perfil.tiempo && "Tiempo jugando: " + texto(perfil.tiempo),
      perfil.torneos && "Torneos: " + texto(perfil.torneos),
      perfil.practica && "Práctica: " + texto(perfil.practica),
    ].filter(Boolean);
    if (contado.length) datos.push(["Lo que contó", contado.join(" · ")]);
    bloques.push({ tipo: "titulo", texto: "Datos" });
    bloques.push({ tipo: "tabla", encabezados: ["Dato", "Valor"], filas: datos, anchos: [1, 2.6] });

    // --- el resultado
    bloques.push({ tipo: "titulo", texto: "Resultado" });
    bloques.push({ tipo: "subtitulo", texto: resumen.nivel.etiqueta + " · " + resumen.porcentaje + "%" });
    bloques.push({ tipo: "parrafo", texto: resumen.nivel.descripcion });
    bloques.push({
      tipo: "parrafo",
      texto: resumen.aciertos + " de " + resumen.total + " respuestas correctas" +
        (resumen.nosabe ? ", y " + resumen.nosabe + " marcadas como «no lo sé»" : "") +
        ". Fuerza estimada: " + resumen.nivel.rango + ".",
    });
    const e = resumen.elo || {};
    const margen = (err) => (err ? " (más o menos " + err + ")" : "");
    bloques.push({
      tipo: "parrafo",
      texto: e.declarado
        ? "Elo declarado: " + e.declarado + " (" + e.tipoEtiqueta + "). La prueba sugiere cerca de " + e.estimado + margen(e.error) +
          ", y el nivel se calculó con los dos (cerca de " + e.combinado + margen(e.errorCombinado) + "). " + sinEmoji(e.lectura && e.lectura.texto)
        : "Sin Elo declarado: el nivel sale solo de la prueba (cerca de " + e.estimado + margen(e.error) + ").",
    });
    if (resumen.modelo === "elo") {
      bloques.push({
        tipo: "parrafo",
        texto: "Cada pregunta tiene su dificultad medida en puntos Elo, y la fuerza estimada es la que mejor explica " +
          "cuáles resolvió y cuáles no: resolver una difícil de tablero pesa mucho más que acertar una fácil de opción.",
      });
    } else if (resumen.escalonAlcanzado !== null && resumen.escalonAlcanzado !== undefined) {
      bloques.push({
        tipo: "parrafo",
        texto: "Escalones de dificultad superados: " + resumen.escalonAlcanzado + " de 5. El nivel es el escalón " +
          "más alto con 60% de aciertos o más, no la suma de respuestas correctas.",
      });
    }
    if (resumen.nosabe) {
      bloques.push({
        tipo: "nota",
        texto: "Las marcadas como «no lo sé» son huecos que enseñar, no errores que corregir.",
      });
    }

    // --- por área
    bloques.push({ tipo: "titulo", texto: "Área por área" });
    bloques.push({
      tipo: "tabla",
      encabezados: ["Área", "Aciertos", "%", "Estado", "No lo sé"],
      filas: resumen.porArea.map((a) => [
        texto(a.nombre), a.aciertos + " de " + a.total, a.total ? a.porcentaje + "%" : "—",
        // Un diagnóstico de antes no traía todas las áreas: 0 de 0 no es «a trabajar».
        a.total ? banda(a.porcentaje) : "No se midió", String(a.nosabe || 0),
      ]),
      anchos: [2.4, 1, 0.7, 1.1, 0.9],
    });

    if (resumen.debilidades.length) {
      bloques.push({ tipo: "subtitulo", texto: "Dónde conviene empezar" });
      bloques.push({
        tipo: "lista",
        items: resumen.debilidades.map((a) => {
          const area = PE.AREA_POR_ID[a.id] || {};
          return texto(a.nombre) + " (" + a.porcentaje + "%): " + texto(area.flojo || "");
        }),
      });
    }
    if (resumen.fortalezas.length) {
      bloques.push({ tipo: "subtitulo", texto: "Lo que ya tiene firme" });
      bloques.push({
        tipo: "lista",
        items: resumen.fortalezas.map((a) => {
          const area = PE.AREA_POR_ID[a.id] || {};
          return texto(a.nombre) + " (" + a.porcentaje + "%): " + texto(area.solido || "");
        }),
      });
    }

    // --- el plan de cuatro semanas: el mismo que recibe un alumno
    const plan = PE.generarPlan(resumen);
    bloques.push({ tipo: "titulo", texto: "Plan sugerido de cuatro semanas" });
    bloques.push({ tipo: "parrafo", texto: "Práctica recomendada: " + texto(plan.rutina) + "." });
    for (const s of plan.semanas) {
      bloques.push({ tipo: "subtitulo", texto: texto(s.titulo) });
      bloques.push({ tipo: "parrafo", texto: texto(s.porque) });
      if (s.objetivo) bloques.push({ tipo: "parrafo", texto: "Objetivo: " + texto(s.objetivo) });
      if (s.tareas && s.tareas.length) bloques.push({ tipo: "lista", items: s.tareas.map(texto) });
    }
    bloques.push({ tipo: "nota", texto: texto(plan.medicion) });

    // --- quién lo firma: la academia del enlace, o Oscar
    const ac = o.academia && o.academia.nombre ? o.academia : null;
    if (ac) {
      const suNombre = texto(ac.nombre);
      bloques.push({ tipo: "separador" });
      bloques.push({ tipo: "titulo", texto: "Preparado por " + suNombre });
      bloques.push({
        tipo: "parrafo",
        texto: suNombre + ": clases de ajedrez con seguimiento del progreso, en la plataforma de " + ACADEMIA + ".",
      });
      const suContacto = [];
      if (ac.whatsapp) suContacto.push("WhatsApp: " + telefonoLegible(ac.whatsapp));
      suContacto.push("Diagnóstico de nivel hecho en " + WEB);
      bloques.push({ tipo: "lista", items: suContacto });
      bloques.push({
        tipo: "nota",
        texto: "El nivel y la fuerza estimada orientan el estudio: no son un rating oficial. " +
          "Diagnóstico de nivel de " + ACADEMIA + ".",
      });
      return {
        titulo: "Diagnóstico de nivel de ajedrez",
        subtitulo: nombre + (fecha ? " · " + fecha : "") + " · " + suNombre,
        autor: suNombre,
        pie: suNombre + " · diagnóstico de " + WEB,
        color: ac.color || null,
        cabecera: { nombre: suNombre, color: ac.color || null, logo: o.logo || null },
        bloques: bloques,
      };
    }
    bloques.push({ tipo: "separador" });
    bloques.push({ tipo: "titulo", texto: "Preparado por " + AUTOR });
    bloques.push({
      tipo: "parrafo",
      texto: AUTOR + " — " + CARGO + ". " + ACADEMIA + ": clases de ajedrez en vivo, entrenamiento " +
        "interactivo y seguimiento del progreso, para escuelas, colegios y familias.",
    });
    const contacto = ["Sitio: " + WEB];
    if (o.whatsapp) contacto.push("WhatsApp: " + o.whatsapp);
    bloques.push({ tipo: "lista", items: contacto });
    bloques.push({
      tipo: "nota",
      texto: "El nivel y la fuerza estimada orientan el estudio: no son un rating oficial. " +
        "© " + new Date().getFullYear() + " " + AUTOR + " · " + ACADEMIA + ".",
    });

    return {
      titulo: "Diagnóstico de nivel de ajedrez",
      subtitulo: nombre + (fecha ? " · " + fecha : "") + " · " + ACADEMIA,
      autor: AUTOR,
      pie: AUTOR + " · " + ACADEMIA + " · " + WEB,
      bloques: bloques,
    };
  }

  function nombreArchivo(v) {
    const base = sinEmoji(v.nombre || "visitante").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "visitante";
    const dia = (v.created_at || "").slice(0, 10);
    return "diagnostico-" + base + (dia ? "-" + dia : "") + ".pdf";
  }

  /* La marca se pide antes; si no se puede bajar, el PDF NO sale sin ella: lo
     que se pidió es justo que vaya marcado, y uno sin marca que circula no se
     distingue de una copia. */
  async function descargar(v, opciones) {
    const o = Object.assign({}, opciones || {});
    const ac = o.academia && o.academia.nombre ? o.academia : null;
    let marca;
    if (ac) {
      /* El logo de la academia va de cabecera y de marca de agua. Si no tiene
         logo, o no se pudo bajar, el PDF sale con su franja y su nombre pero
         sin marca de agua: la de Oscar no se le pone a otra marca. */
      marca = null;
      if (ac.logoUrl) {
        try { marca = await window.MarcaAgua.prepararDesde(ac.logoUrl); } catch (e) { marca = null; }
      }
      o.logo = marca;
    } else {
      marca = await window.MarcaAgua.preparar();
    }
    const doc = documento(v, o);
    doc.marca = marca;
    const blob = await window.ReportePDF.generar(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo(v);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return { blob: blob, nombre: a.download };
  }

  return { documento: documento, descargar: descargar, nombreArchivo: nombreArchivo };
})();
