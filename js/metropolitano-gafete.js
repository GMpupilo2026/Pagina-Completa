/* Ajedrez Integral — el gafete del Metropolitano 2026.
 *
 * Es el mismo gafete de gafetes.html (el del Centroamericano 2026): lo dibuja
 * js/gafetes-dibujo.js —la misma función para la pantalla y para el PDF de la
 * imprenta— y lo arma js/gafetes-pdf.js. Acá solo vive el DISEÑO del
 * Metropolitano (título, colores por torneo, horario del dorso) y cómo se
 * pasa una inscripción a la «fila» que el dibujo entiende. Lo usan la
 * inscripción (la persona lo ve y lo valida antes de mandar, y lo descarga
 * después) y la lista de inscritos de administración.
 *
 * Diferencia con gafetes.html: este lleva la FOTO tamaño pasaporte de la
 * persona (`g.foto`, en el marco que en el del Centroamericano ocupaba la
 * mascota).
 */
window.MetropolitanoGafete = (function () {
  "use strict";
  const R = () => window.MetropolitanoReglas;
  const D = () => window.GafetesDibujo;
  const BASES = "https://fcacostarica.com/wp-content/uploads/2026/08/Bases-Metropolitano-2026-2.pdf";

  let diseno = null, recursos = null;

  async function aDatos(ruta) {
    const blob = await (await fetch(ruta)).blob();
    return new Promise((ok, mal) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => mal(fr.error); fr.readAsDataURL(blob); });
  }

  function horarioDe(torneos) {
    const filas = [];
    const clasico = torneos.find((t) => t !== "BLITZ");
    if (clasico) filas.push(...R().HORARIOS[clasico]);
    if (torneos.includes("BLITZ")) filas.push(...R().HORARIOS.BLITZ);
    if (!filas.length) return [];
    return [["Reunión técnica", "25/12", "19:00"], ...filas, ["Premiación", "30/12", ""]].slice(0, 16);
  }

  // El diseño: el del Centroamericano con los datos del Metropolitano.
  async function disenoDe(torneos) {
    if (!diseno) {
      const colores = {}, etiquetas = {};
      for (const [k, t] of Object.entries(R().TORNEOS)) { colores[k.toLowerCase()] = t.color; etiquetas[k.toLowerCase()] = t.nombre; }
      diseno = {
        version: 1, nombreDiseno: "Metropolitano 2026", aprobado: true,
        tamano: { ancho: 100, alto: 140 },
        imagenes: {},
        titulo: { texto: "XLVII TORNEO INTERNACIONAL\nMETROPOLITANO 2026\nSAN JOSÉ, COSTA RICA", color: "#1b2a4a" },
        nombre: { linea1: "{Apellidos}", linea2: "{Nombre}", propio: true },
        detalles: ["FIDE ID: {FIDE ID}", "Elo FIDE: {Elo}", "{Club}"],
        bandera: { plantilla: "{Federación}", texto: true },
        franja: { plantilla: "{Rol}" },
        iconos: [{ columna: "", dibujo: "telefono", imagen: null }, { columna: "", dibujo: "camara", imagen: null }],
        colores: { columna: "Color", valores: colores, etiquetas, omision: "#1d4ed8" },
        dorso: { vertical: "{Rol}", repetirLogos: true, qr: BASES, qrMarca: true, encabezados: ["Actividad", "Fecha", "Hora"], horario: [] },
        codigo: { plantilla: "{Código}", sinCodigoSi: "" },
        fuentes: { titulo: { id: "league-spartan" }, texto: { id: "quicksand" } },
        salida: { separarPor: "" },
      };
      try { diseno.imagenes.logoIzq = { nombre: "fca-logo.png", datos: await aDatos("img/fca-logo.png") }; } catch (e) { /* sin logo */ }
    }
    return Object.assign({}, diseno, { dorso: Object.assign({}, diseno.dorso, { horario: horarioDe(torneos) }) });
  }

  /* De una inscripción (como la manda la página o como la lee la base) a la
     fila del gafete. */
  function filaDe(x) {
    const torneos = x.torneos || [];
    const clasico = torneos.find((t) => t !== "BLITZ");
    let rol;
    if (clasico) rol = R().TORNEOS[clasico].nombre + (torneos.includes("BLITZ") ? " + Blitz" : "");
    else rol = R().TORNEOS.BLITZ.nombre;
    return {
      Apellidos: x.apellidos || "", Nombre: x.nombre || "",
      "FIDE ID": x.fide_id || (x.sin_fide ? "en trámite" : ""),
      Elo: x.elo_estandar ? String(x.elo_estandar) : (x.sin_fide ? "" : "sin Elo"),
      Club: x.club || "",
      // La bandera: la federación de FIDE o, sin FIDE, la nacionalidad.
      "Federación": x.federacion || x.nacionalidad || "",
      Rol: rol,
      Color: (clasico || "BLITZ").toLowerCase(),
      "Código": x.codigo || "",
    };
  }

  async function preparar(x, foto) {
    const d = await disenoDe(x.torneos || []);
    if (!recursos) recursos = await D().preparar(d);
    const g = D().gafetes(d, [filaDe(x)])[0];
    if (foto) { g.foto = foto; g.fotoClave = "foto"; }
    return { d, g };
  }

  // Pinta las dos caras en dos <canvas> (la vista previa).
  async function dibujar(x, foto, lienzoFrente, lienzoDorso) {
    const { d, g } = await preparar(x, foto);
    const frente = await D().cara(d, recursos, g, "frente");
    const dorso = await D().cara(d, recursos, g, "dorso");
    const css = lienzoFrente.parentElement.clientWidth || 280;
    const px = (css / d.tamano.ancho) * (window.devicePixelRatio || 1);
    D().pintar(lienzoFrente, d, frente, px);
    D().pintar(lienzoDorso, d, dorso, px);
    const quien = [x.nombre, x.apellidos].filter(Boolean).join(" ");
    lienzoFrente.setAttribute("aria-label", "Frente del gafete de " + quien + ": " + filaDe(x).Rol + (x.fide_id ? ", FIDE ID " + x.fide_id : ""));
    lienzoDorso.setAttribute("aria-label", "Dorso del gafete: el horario de " + filaDe(x).Rol + (x.codigo ? ", código " + x.codigo : ""));
    return [...new Set([...frente.avisos, ...dorso.avisos])];
  }

  // El PDF de un gafete (frente y dorso), como el de la imprenta.
  async function pdf(x, foto) {
    const { d, g } = await preparar(x, foto);
    const doc = window.GafetesPdf.nuevo(d.tamano.ancho, d.tamano.alto, "Gafete Metropolitano 2026 - " + [x.nombre, x.apellidos].join(" "));
    for (const lado of ["frente", "dorso"]) {
      const c = await D().cara(d, recursos, g, lado);
      await doc.agregar({ clave: c.clave, ...(await D().fondoJpeg(d, c, 300)), textos: c.textos });
    }
    return doc.cerrar();
  }

  return { filaDe, dibujar, pdf, horarioDe };
})();
