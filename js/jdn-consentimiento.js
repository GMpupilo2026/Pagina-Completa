/* La ficha de inscripción y consentimiento de los Juegos Deportivos Nacionales
 * 2027 (ICODER), llena con los datos del formulario de jdn.html. Hay dos: la
 * del ATLETA y la del ENTRENADOR (cuerpo técnico), cada una con su plantilla.
 *
 * LA PLANTILLA ES LA DEL ICODER, NO UNA COPIA ARMADA ACÁ:
 * documentos/jdn/consentimiento-jdn-2027.docx es el CONSENTIMIENTO.docx de la
 * carpeta «JDN 2027» del Drive, y consentimiento-entrenador-jdn-2027.docx su
 * «Consentimiento Entrenador», tal cual. Se abre (un .docx es un ZIP), se
 * escriben los datos en su document.xml y se vuelve a empaquetar. Así el
 * documento que se imprime es el oficial, con su logo y su letra; uno «parecido»
 * lo puede rechazar el Comité Cantonal. Si el ICODER cambia el formulario, se
 * reemplaza ese archivo y `verificar-jdn.js` dice qué ancla ya no está.
 *
 * Los datos van DESPUÉS del texto de cada pregunta, en un trozo subrayado, y las
 * opciones se marcan cambiando «( )» por «(X)». La fotografía de la persona va
 * en la ficha, debajo del punto 3. La fecha y las firmas quedan en
 * blanco: se firman en papel, a mano (el documento mismo dice que una firma
 * pegada como imagen no vale).
 *
 * LA CATEGORÍA SALE DEL AÑO DE NACIMIENTO, con la tabla de ajedrez de la
 * convocatoria (U-12: 2015 a 2020; U-16: 2011 a 2014; U-20: 2007 a 2010), no de
 * la edad de hoy: es lo que mira el ICODER. Ver «La ficha de los JDN 2027» en
 * docs/decisiones/cuentas-y-formularios.md.
 *
 * Corre igual en Node (verificar-jdn.js): no toca el DOM.
 */
(function (raiz) {
  "use strict";

  const CATEGORIAS = [
    { codigo: "U-12", edades: "7 a 12 años", desde: 2015, hasta: 2020 },
    { codigo: "U-16", edades: "13 a 16 años", desde: 2011, hasta: 2014 },
    { codigo: "U-20", edades: "17 a 20 años", desde: 2007, hasta: 2010 },
  ];

  // Las pruebas que van en la ficha, siempre las mismas.
  const PRUEBAS = ["Clásico", "Rápido", "Relámpago"];

  const ROLES = ["atleta", "entrenador"];

  // Las opciones de cada pregunta, escritas como en la plantilla (sin «( )»).
  const OPCIONES = {
    condicion: ["atleta", "paratleta"],
    tipoDocumento: ["Nacional", "Residente", "Pasaporte", "Residencia Temporal", "Refugiado", "Nacionalizado"],
    estadoCivil: ["Soltero(a)", "Casado(a)", "Divorciado(a)", "Separado(a)", "Viudo(a)", "Unión de hecho", "Desconocido"],
    sexo: ["hombre", "mujer"],
    lateralidad: ["Derecho", "Izquierdo"],
    parentesco: ["cónyuge", "Hijos", "Madre", "Padre", "Hermanos", "Patrono", "Otros"],
    discapacidad: [
      "Deterioro de la fuerza muscular", "Deterioro en el rango de movimiento pasivo",
      "Discapacidad en las extremidades", "Diferencia de longitud en las piernas", "Baja estatura",
      "Hipertonía", "Ataxia", "Atetosis", "Discapacidad visual", "Discapacidad intelectual",
    ],
    perroGuia: ["sí", "no"],
    silla: ["Convencional", "Deportiva", "Eléctrica"],
    tutorCondicion: ["padre", "madre", "tutor legal"],
    // Quien acompaña a la persona menor de edad si tiene que denunciar: el
    // entrenador. La plantilla dice «delegado – subdelegado»; la academia
    // inscribe a sus atletas con su entrenador (lo decidió el dueño del sitio).
    autorizadoRol: ["entrenador"],
  };

  /* ------------------------------------------------------------ fechas */

  // «2012-03-09» → [2012, 3, 9]. Un día de calendario no se lee con new Date().
  function partesDia(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  }

  function edad(nacimiento, hoy) {
    const n = partesDia(nacimiento), h = partesDia(hoy);
    if (!n || !h) return null;
    let e = h[0] - n[0];
    if (h[1] < n[1] || (h[1] === n[1] && h[2] < n[2])) e -= 1;
    return e;
  }

  function categoria(nacimiento) {
    const n = partesDia(nacimiento);
    if (!n) return null;
    return CATEGORIAS.find((c) => n[0] >= c.desde && n[0] <= c.hasta) || null;
  }

  // «09/03/2012», como lo pide la ficha (día/mes/año).
  function diaMesAnio(iso) {
    const n = partesDia(iso);
    return n ? String(n[2]).padStart(2, "0") + "/" + String(n[1]).padStart(2, "0") + "/" + n[0] : "";
  }

  /* ------------------------------------------------------------ los datos */

  const limpio = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  // «1-2345-0678» y «123450678» son la misma cédula; «José Pérez» y «jose  perez», el mismo nombre.
  const mismaCedula = (a, b) => { const x = String(a || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase(); return !!x && x === String(b || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase(); };
  const sinTildes = (v) => limpio(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const mismoNombre = (a, b) => !!sinTildes(a) && sinTildes(a) === sinTildes(b);

  // Lo que hace falta para que la ficha no lleve espacios en blanco (la
  // plantilla lo exige). Devuelve la lista de lo que falta, en palabras.
  // Un teléfono de Costa Rica: 8 dígitos, sin guiones ni espacios.
  const telefonoValido = (t) => /^\d{8}$/.test(String(t || ""));
  // Un correo con forma de correo: algo@dominio.algo, sin espacios. Que el
  // dominio exista (que reciba correo) lo comprueba la Edge Function.
  const correoValido = (c) => /^[^\s@,;]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(String(c || "").trim());

  function validar(d, hoy) {
    const f = [];
    const pide = (campo, nombre) => { if (!limpio(d[campo])) f.push(nombre); };
    const elige = (campo, lista, nombre) => { if (!lista.includes(d[campo])) f.push(nombre); };
    const atleta = d.rol !== "entrenador";
    elige("rol", ROLES, "si es atleta o entrenador");
    if (atleta) elige("condicion", OPCIONES.condicion, "si es atleta o paratleta");
    pide("comite", "el comité que representa");
    pide("identificacion", "el número de identificación");
    elige("tipoDocumento", OPCIONES.tipoDocumento, "el tipo de documento");
    pide("nombre", "el nombre y apellidos");
    if (!partesDia(d.nacimiento)) f.push("la fecha de nacimiento");
    else if (atleta && !categoria(d.nacimiento)) {
      f.push("una fecha de nacimiento entre 2007 y 2020 (las categorías de ajedrez son U-12, U-16 y U-20)");
    }
    pide("nacionalidad", "la nacionalidad");
    elige("estadoCivil", OPCIONES.estadoCivil, "el estado civil");
    if (!telefonoValido(d.telefono)) f.push("el teléfono (8 números, sin guiones)");
    elige("sexo", OPCIONES.sexo, "el sexo biológico");
    elige("lateralidad", OPCIONES.lateralidad, "la lateralidad");
    if (!correoValido(d.correo)) f.push("un correo electrónico válido");
    pide("escolaridad", "la escolaridad");
    pide("provincia", "la provincia");
    pide("canton", "el cantón");
    pide("distrito", "el distrito");
    pide("direccion", "la dirección exacta");
    pide("beneficiarioCedula", "la cédula del beneficiario de la póliza");
    pide("beneficiarioNombre", "el nombre del beneficiario de la póliza");
    elige("parentesco", OPCIONES.parentesco, "el parentesco del beneficiario");
    // El beneficiario de la póliza es OTRA persona: quien cobra si a quien se
    // inscribe le pasa algo. Con su misma cédula o su mismo nombre, la póliza
    // queda sin beneficiario.
    if ((limpio(d.beneficiarioCedula) && mismaCedula(d.beneficiarioCedula, d.identificacion)) ||
        (limpio(d.beneficiarioNombre) && mismoNombre(d.beneficiarioNombre, d.nombre))) {
      f.push("un beneficiario de la póliza que sea otra persona (no puede ser quien se inscribe)");
    }
    if (atleta && d.condicion === "paratleta") {
      if (!(d.discapacidad || []).some((x) => OPCIONES.discapacidad.includes(x))) f.push("el tipo de discapacidad");
      elige("perroGuia", OPCIONES.perroGuia, "si usa perro guía");
    }
    const e = edad(d.nacimiento, hoy);
    if (atleta && e != null && e < 18) {
      pide("tutorNombre", "el nombre del padre, madre o tutor");
      pide("tutorEstadoCivil", "el estado civil del tutor");
      pide("tutorProfesion", "la profesión del tutor");
      pide("tutorCedula", "la cédula del tutor");
      elige("tutorCondicion", OPCIONES.tutorCondicion, "si el tutor es padre, madre o tutor legal");
      pide("autorizadoNombre", "el entrenador al que autoriza el tutor");
    }
    return f;
  }

  /* ------------------------------------------------------------ el XML */

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const desc = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

  // Arial 10 como el resto de la ficha, sin negrita y subrayado: se ve escrito
  // en la raya, y no se confunde con el texto del formulario.
  const RPR_DATO = '<w:rPr><w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/>' +
    '<w:b w:val="0"/><w:bCs w:val="0"/><w:i w:val="0"/><w:iCs w:val="0"/><w:color w:val="000000"/>' +
    '<w:sz w:val="20"/><w:szCs w:val="20"/><w:u w:val="single"/></w:rPr>';
  const runDato = (t) => '<w:r>' + RPR_DATO + '<w:t xml:space="preserve">' + esc(t) + "</w:t></w:r>";

  function error(que) { throw new Error("La plantilla de la ficha no tiene " + que + ": ¿cambió el formulario del ICODER?"); }

  // El párrafo (de primer nivel) que tiene `ancla` en su texto: [inicio, fin).
  function parrafo(xml, ancla) {
    const i = xml.indexOf(esc(ancla));
    if (i < 0) error("«" + ancla + "»");
    const ini = Math.max(xml.lastIndexOf("<w:p ", i), xml.lastIndexOf("<w:p>", i));
    const fin = xml.indexOf("</w:p>", i);
    if (ini < 0 || fin < 0) error("el párrafo de «" + ancla + "»");
    return [ini, fin + 6];
  }

  function enParrafo(xml, ancla, fn) {
    const [a, z] = parrafo(xml, ancla);
    return xml.slice(0, a) + fn(xml.slice(a, z)) + xml.slice(z);
  }

  /* Escribe `valor` en el párrafo de `ancla`, en el run número `vez` (desde 1)
     que contiene `buscar`: lo parte en (antes)(buscar)(DATO)(después), o
     (antes)(DATO)(después) si `reemplaza`. El resto del run conserva su letra. */
  function poner(xml, ancla, buscar, valor, opciones) {
    const op = opciones || {};
    const vez = op.vez || 1;
    return enParrafo(xml, ancla, (p) => {
      const runs = /<w:r[ >][\s\S]*?<\/w:r>/g;
      let m, n = 0;
      while ((m = runs.exec(p))) {
        const run = m[0];
        const t = /<w:t(?: [^>]*)?>([^<]*)<\/w:t>/.exec(run);
        if (!t) continue;
        const texto = desc(t[1]);
        const k = texto.indexOf(buscar);
        if (k < 0 || ++n < vez) continue;
        const rpr = (/<w:rPr>[\s\S]*?<\/w:rPr>/.exec(run) || [""])[0];
        const trozo = (s) => (s ? '<w:r>' + rpr + '<w:t xml:space="preserve">' + esc(s) + "</w:t></w:r>" : "");
        const antes = texto.slice(0, k) + (op.reemplaza ? "" : buscar);
        let despues = texto.slice(k + buscar.length);
        // Los espacios que hacían de raya ya no hacen falta: con el dato
        // escrito, empujarían «Cantón» y «Distrito» a otra línea.
        if (op.recorta) despues = despues.replace(/^\s{4,}/, "     ");
        const v = limpio(valor);
        const dato = op.reemplaza ? v : (/\s$/.test(antes) ? "" : " ") + v;
        const nuevo = trozo(antes) + runDato(dato) + trozo(despues && !/^\s/.test(despues) && !op.reemplaza ? " " + despues : despues);
        return p.slice(0, m.index) + nuevo + p.slice(m.index + run.length);
      }
      return error("«" + buscar + "» junto a «" + ancla + "»");
    });
  }

  /* Marca «(X)» en la opción `opcion` del párrafo de `ancla`. Se busca en el
     TEXTO del párrafo, no en el XML: Word parte «( )», «Residencia» y
     «Temporal» —y hasta el «(» del «)»— en runs distintos. Se borran los
     espacios de adentro de los paréntesis y se escribe la X después del «(»,
     en el run donde esté. */
  function marcar(xml, ancla, opcion) {
    return enParrafo(xml, ancla, (p) => {
      const re = /(<w:t(?: [^>]*)?>)([^<]*)(<\/w:t>)/g;
      const trozos = [];
      let m;
      while ((m = re.exec(p))) trozos.push({ ini: m.index, fin: m.index + m[0].length, abre: m[1], letras: [...desc(m[2])] });
      const todo = trozos.map((t) => t.letras.join("")).join("");
      const hallado = new RegExp("\\((\\s*)\\)\\s*" + escRe(opcion) + "(?![A-Za-zÁÉÍÓÚáéíóúÑñ])").exec(todo);
      if (!hallado) error("la opción «" + opcion + "» junto a «" + ancla + "»");
      const abre = hallado.index, adentro = hallado[1].length;
      let pos = 0;
      for (const t of trozos) {
        t.letras = t.letras.map((c, i) => {
          const g = pos + i;
          if (g === abre) return c + "X";
          if (g > abre && g <= abre + adentro) return "";
          return c;
        });
        pos += t.letras.length;
      }
      let out = p;
      for (const t of trozos.slice().reverse()) {
        const abreT = /xml:space=/.test(t.abre) ? t.abre : t.abre.replace("<w:t", '<w:t xml:space="preserve"');
        out = out.slice(0, t.ini) + abreT + esc(t.letras.join("")) + "</w:t>" + out.slice(t.fin);
      }
      return out;
    });
  }

  // Cambia un trozo de texto del formulario, sin dato (los paréntesis de
  // «Yo (indicar nombre…) mayor», que ya no van cuando está el nombre).
  function retocar(xml, ancla, viejo, nuevo) {
    return enParrafo(xml, ancla, (p) => {
      if (!p.includes(viejo)) error("«" + viejo + "» junto a «" + ancla + "»");
      return p.replace(viejo, nuevo);
    });
  }

  // Lo que va en el recuadro de las pruebas (un cuadro de texto de la plantilla).
  function enRecuadro(xml, texto) {
    const i = xml.indexOf("<w:txbxContent>");
    if (i < 0) error("el recuadro de las pruebas");
    const fin = xml.indexOf("</w:p>", i);
    return xml.slice(0, fin) + runDato(texto).replace('<w:u w:val="single"/>', "") + xml.slice(fin);
  }


  /* La fotografía de la persona, debajo del punto 3 («Fotografía y cédula»):
     un párrafo centrado con la imagen, de hasta 3,5 × 4,5 cm, con un borde
     fino. Los renglones vacíos que la plantilla deja ahí se reemplazan por la
     foto, para que la hoja no crezca. `foto` = { rId, ancho, alto } (píxeles). */
  const EMU_CM = 360000;
  function conFoto(xml, foto) {
    const [, fin] = parrafo(xml, "otografía y cédula (frente");
    // Los párrafos vacíos que siguen (sin texto ni dibujo).
    let z = fin;
    const vacio = /^\s*<w:p(?: [^>]*)?>(?:(?!<\/w:p>)[\s\S])*<\/w:p>/;
    for (;;) {
      const m = vacio.exec(xml.slice(z));
      if (!m || /<w:t[ >]|<w:drawing|<w:pict/.test(m[0])) break;
      z += m[0].length;
    }
    const k = Math.min(3.5 * EMU_CM / foto.ancho, 4.5 * EMU_CM / foto.alto);
    const cx = Math.round(foto.ancho * k), cy = Math.round(foto.alto * k);
    const dibujo =
      '<w:p><w:pPr><w:spacing w:before="120" w:after="120"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing>' +
      '<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
      '<wp:docPr id="7301" name="Fotografía" descr="Fotografía de la persona inscrita"/>' +
      '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
      '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:nvPicPr><pic:cNvPr id="7301" name="foto-jdn.jpeg"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + foto.rId + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
      '<a:ln w="9525"><a:solidFill><a:srgbClr val="7F7F7F"/></a:solidFill></a:ln></pic:spPr>' +
      "</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>";
    return xml.slice(0, fin) + dibujo + xml.slice(z);
  }

  // La ficha del entrenador (cuerpo técnico): sin tutor, sin categoría.
  function llenarEntrenador(xml, d) {
    let x = xml;
    x = marcar(x, "ASISTENTE DE VIDA", "ENTRENADOR");
    x = poner(x, "deporte en", " el cual se inscribe:", "Ajedrez");
    x = poner(x, "-Indique el nombre del Comité", "con el cual se inscribe:", d.comite);
    x = poner(x, "-Número de identificación", ":", d.identificacion);
    x = marcar(x, "-Tipo de documento marque con", d.tipoDocumento);
    x = poner(x, "-Nombre y apellidos:", "-Nombre y apellidos:", d.nombre);
    x = poner(x, "-Fecha de nacimiento", ": ", diaMesAnio(d.nacimiento));
    x = poner(x, "-Nacionalidad", ": ", d.nacionalidad);
    x = marcar(x, "-Estado civil ", d.estadoCivil);
    x = poner(x, "-Teléfono: ", "-Teléfono: ", d.telefono);
    x = marcar(x, "-Sexo biológico marque", d.sexo);
    x = marcar(x, "-Lateralidad", d.lateralidad);
    x = poner(x, "-Correo electrónico", ":", d.correo);
    x = poner(x, "-Escolaridad", ":", d.escolaridad);
    x = poner(x, "Provincia", ":", d.distrito, { vez: 3, recorta: true });
    x = poner(x, "Provincia", ":", d.canton, { vez: 2, recorta: true });
    x = poner(x, "Provincia", ":", d.provincia, { vez: 1, recorta: true });
    x = poner(x, "Dirección exacta", ": ", d.direccion);
    x = poner(x, "-Beneficiario de la póliza número de cédula", ": ", d.beneficiarioCedula);
    x = poner(x, "-Nombre y apellidos del beneficiario", ":", d.beneficiarioNombre);
    x = marcar(x, "-Parentesco", d.parentesco);
    x = poner(x, "Deportes de conjunto indicar", ":", "No aplica (ajedrez)");
    x = poner(x, "Nombre del equipo:", "Nombre del equipo:", d.comite);
    return x;
  }

  // document.xml de la plantilla → el mismo, con los datos de `d`.
  function llenar(xml, d, hoy) {
    if (d.rol === "entrenador") return llenarEntrenador(xml, d);
    let x = xml;
    const cat = categoria(d.nacimiento);

    x = marcar(x, "Mi persona en condición de", d.condicion);

    const e = edad(d.nacimiento, hoy);
    if (e != null && e < 18) {
      x = retocar(x, "indicar nombre completo y calidades", ">Yo (<", ">Yo <");
      x = poner(x, "indicar nombre completo y calidades", "indicar nombre completo y calidades", d.tutorNombre, { reemplaza: true });
      x = retocar(x, ") mayor, ", ">) mayor, <", ">, mayor, <");
      x = poner(x, "indicar estado civil", "indicar estado civil", d.tutorEstadoCivil, { reemplaza: true });
      x = poner(x, "indicar profesión", "indicar profesión", d.tutorProfesion, { reemplaza: true });
      x = poner(x, "cédula de identidad ____", "_______________", d.tutorCedula, { reemplaza: true });
      x = poner(x, "en mi condición de (padre- madre-tutor)", "(padre- madre-tutor)", d.tutorCondicion, { reemplaza: true });
      x = poner(x, "patria potestad del atleta", "__________________", d.nombre, { reemplaza: true });
      x = poner(x, "autorizo a ____", "______________ (definir si delegado – subdelegado –)",
        limpio(d.autorizadoNombre) + " (entrenador)", { reemplaza: true });
    }

    x = poner(x, "1-Indique el deporte", "1-Indique el deporte en el cual se inscribe:", "Ajedrez");
    // El comité que representa va en la pregunta 2 y en «Nombre del equipo»
    // (punto 20). La rama queda para el entrenador; las pruebas, las tres de
    // siempre.
    x = poner(x, "2-Indique el nombre del Comité", "con el cual se inscribe:", d.comite);
    x = poner(x, "4-Número de identificación", ":", d.identificacion);
    x = marcar(x, "5-Tipo de documento", d.tipoDocumento);
    x = poner(x, "6-Nombre y apellidos", "6-Nombre y apellidos: ", d.nombre);
    x = poner(x, "7-Fecha de nacimiento", ": ", diaMesAnio(d.nacimiento));
    x = poner(x, "8-Nacionalidad", ": ", d.nacionalidad);
    // El estado civil está en dos párrafos: las dos últimas opciones van solas.
    x = marcar(x, ["Unión de hecho", "Desconocido"].includes(d.estadoCivil) ? "( ) Unión de hecho" : "9-Estado civil", d.estadoCivil);
    x = poner(x, "10-Teléfono", "10-Teléfono del atleta o tutor: ", d.telefono);
    x = marcar(x, "11-Sexo biológico", d.sexo);
    x = marcar(x, "12-Lateralidad", d.lateralidad);
    x = poner(x, "13-Correo electrónico", ":", d.correo);
    x = poner(x, "14-Escolaridad", ":", d.escolaridad);
    // Provincia, cantón y distrito comparten párrafo: de atrás para adelante,
    // para que el dato escrito no corra la cuenta de los «:».
    x = poner(x, "Provincia", ":", d.distrito, { vez: 3, recorta: true });
    x = poner(x, "Provincia", ":", d.canton, { vez: 2, recorta: true });
    x = poner(x, "Provincia", ":", d.provincia, { vez: 1, recorta: true });
    x = poner(x, "Dirección exacta", ": ", d.direccion);
    x = poner(x, "16-Número de cédula", ": ", d.beneficiarioCedula);
    x = poner(x, "17-Nombre y apellidos del beneficiario", ":", d.beneficiarioNombre);
    x = marcar(x, "18-Parentesco", d.parentesco);

    if (d.condicion === "paratleta") {
      for (const t of d.discapacidad || []) x = marcar(x, "Tipo de discapacidad", t);
      x = marcar(x, "Perro guía", d.perroGuia);
      if (OPCIONES.silla.includes(d.silla)) x = marcar(x, "Perro guía", d.silla);
    }

    x = poner(x, "Categoría Deportiva", ":", "Individual. Ajedrez " + (cat ? cat.codigo : ""));
    x = poner(x, "Deportes de conjunto indicar", ":", "No aplica (ajedrez)");
    x = poner(x, "Nombre del equipo:", "Nombre del equipo:", d.comite);
    x = enRecuadro(x, PRUEBAS.join(", ") + ".");
    return x;
  }

  /* ------------------------------------------------------------ el archivo */

  // Los bytes de la plantilla → los del .docx lleno. Usa el lector de ZIP de
  // js/reporte-excel.js y el empaquetador de js/reporte-docx.js.
  /* `foto` (opcional) = { bytes (JPEG), ancho, alto }: va como una parte más
     del .docx (word/media/foto-jdn.jpeg), con su relación y su tipo. */
  const ID_FOTO = "rIdFotoJdn";
  async function generar(plantilla, d, hoy, foto) {
    const buf = plantilla instanceof ArrayBuffer ? plantilla
      : plantilla.buffer.slice(plantilla.byteOffset, plantilla.byteOffset + plantilla.byteLength);
    const zip = await raiz.ReporteExcel.abrirZip(buf);
    const salida = new raiz.ReporteDOCX.Zip();
    for (const n of zip.nombres()) {
      if (n.endsWith("/")) continue;
      if (n === "word/document.xml") {
        let x = llenar(await zip.texto(n), d, hoy);
        if (foto) x = conFoto(x, { rId: ID_FOTO, ancho: foto.ancho, alto: foto.alto });
        salida.agregar(n, x);
      } else if (foto && n === "word/_rels/document.xml.rels") {
        salida.agregar(n, (await zip.texto(n)).replace("</Relationships>",
          '<Relationship Id="' + ID_FOTO + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/foto-jdn.jpeg"/></Relationships>'));
      } else if (foto && n === "[Content_Types].xml") {
        const ct = await zip.texto(n);
        salida.agregar(n, /Extension="jpeg"/i.test(ct) ? ct
          : ct.replace(/(<Types[^>]*>)/, '$1<Default Extension="jpeg" ContentType="image/jpeg"/>'));
      } else salida.agregar(n, await zip.bytes(n));
    }
    if (foto) salida.agregar("word/media/foto-jdn.jpeg", foto.bytes);
    return salida.cerrar();
  }

  // El nombre de la carpeta y de los archivos: el de la persona, sin lo que
  // Drive o una computadora no aceptan en un nombre de archivo.
  function nombreArchivo(nombre) {
    return limpio(nombre).replace(/[\\/:*?"<>|#%]/g, "").slice(0, 120);
  }

  const api = { CATEGORIAS, PRUEBAS, ROLES, OPCIONES, edad, categoria, diaMesAnio, telefonoValido, correoValido, validar, llenar, generar, nombreArchivo };
  raiz.JDNConsentimiento = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
