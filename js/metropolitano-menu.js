/* Ajedrez Integral — los menús de la alimentación del Metropolitano 2026.
 *
 * Administración arma el menú de cada comida (desayuno, almuerzo y cena):
 * cada plato con su nombre, su descripción, su foto, su precio por día y la
 * cocina que lo prepara (una soda, una cocinera…). El mismo plato puede
 * ofrecerlo más de una cocina, cada una con su precio: aquí se juntan por
 * nombre, y quien se inscribe elige el plato y quién se lo prepara.
 *
 * Una sola copia, en español, inglés y francés (lo pinta este módulo en el
 * idioma de la página: va con data-no-traducir): la usa la inscripción, para
 * elegir (con «Sí») o solo para mirar (con «Aún no lo sé»). Las cuentas son
 * las mismas de interno.metropolitano_menu_costo() en la base: el plato por
 * los días de la alimentación, del primero al último, los dos incluidos.
 * La base no confía en estas: recalcula con sus precios.
 *
 * Ver «Los menús de la alimentación» en docs/decisiones/cuentas-y-formularios.md.
 */
window.MetroMenu = (function () {
  "use strict";
  const BUCKET = "metropolitano-menu";
  const COMIDAS = ["desayuno", "almuerzo", "cena"];
  const TX = {
    es: {
      comida: { desayuno: "Desayuno", almuerzo: "Almuerzo", cena: "Cena" },
      elige: { desayuno: "Elige el desayuno", almuerzo: "Elige el almuerzo", cena: "Elige la cena" },
      opciones: { desayuno: "Las opciones del desayuno", almuerzo: "Las opciones del almuerzo", cena: "Las opciones de la cena" },
      prepara: "Lo prepara", porDia: "por día", sinCosto: "sin costo", organizacion: "La organización",
      dias: (n) => (n === 1 ? "1 día" : n + " días"), vacio: "Todavía no hay platos en este menú.",
    },
    en: {
      comida: { desayuno: "Breakfast", almuerzo: "Lunch", cena: "Dinner" },
      elige: { desayuno: "Choose the breakfast", almuerzo: "Choose the lunch", cena: "Choose the dinner" },
      opciones: { desayuno: "Breakfast options", almuerzo: "Lunch options", cena: "Dinner options" },
      prepara: "Prepared by", porDia: "per day", sinCosto: "no cost", organizacion: "The organisers",
      dias: (n) => (n === 1 ? "1 day" : n + " days"), vacio: "There are no dishes on this menu yet.",
    },
    fr: {
      comida: { desayuno: "Petit-déjeuner", almuerzo: "Déjeuner", cena: "Dîner" },
      elige: { desayuno: "Choisissez le petit-déjeuner", almuerzo: "Choisissez le déjeuner", cena: "Choisissez le dîner" },
      opciones: { desayuno: "Les options du petit-déjeuner", almuerzo: "Les options du déjeuner", cena: "Les options du dîner" },
      prepara: "Préparé par", porDia: "par jour", sinCosto: "sans frais", organizacion: "L’organisation",
      dias: (n) => (n === 1 ? "1 jour" : n + " jours"), vacio: "Il n’y a pas encore de plats dans ce menu.",
    },
  };
  const T = (idioma) => TX[idioma] || TX.es;
  let platos = [];

  const dinero = (usd) => "$" + Number(usd).toFixed(2);
  const urlFoto = (ruta) => (ruta && window.sb ? window.sb.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl : "");
  function el(tag, clase, texto) { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; }

  /* Lee los platos que se ofrecen (sin cuenta). Sin la base, no hay menús:
     la alimentación queda como una solicitud, como antes. */
  async function cargar() {
    try {
      const { data, error } = await window.sb.rpc("metropolitano_menu_ver");
      platos = !error && Array.isArray(data) ? data : [];
    } catch (e) { platos = []; }
    return platos;
  }
  const poner = (lista) => { platos = Array.isArray(lista) ? lista : []; };
  const de = (comida) => platos.filter((p) => p.comida === comida);
  const hay = (comida) => de(comida).length > 0;
  const hayAlguno = () => platos.length > 0;
  const plato = (id) => platos.find((p) => p.id === id) || null;

  /* Los platos de una comida juntados por nombre: cada uno con las cocinas que lo preparan. */
  function agrupar(comida) {
    const grupos = [];
    de(comida).forEach((p) => {
      let g = grupos.find((x) => x.nombre.toLowerCase() === p.nombre.toLowerCase());
      if (!g) { g = { nombre: p.nombre, descripcion: p.descripcion, imagen: p.imagen, opciones: [] }; grupos.push(g); }
      if (!g.descripcion && p.descripcion) g.descripcion = p.descripcion;
      if (!g.imagen && p.imagen) g.imagen = p.imagen;
      g.opciones.push(p);
    });
    return grupos;
  }

  const dias = (desde, hasta) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde || "") || !/^\d{4}-\d{2}-\d{2}$/.test(hasta || "") || hasta < desde) return 0;
    return Math.round((Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10)) - Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10))) / 86400000) + 1;
  };

  /* Lo que cuesta: por cada comida marcada con platos en su menú, el plato
     elegido por los días. `faltan`: las comidas con menú sin plato elegido. */
  function costo(comidas, eleccion, desde, hasta, idioma) {
    const t = T(idioma), n = dias(desde, hasta), lineas = [], faltan = [];
    let usd = 0;
    COMIDAS.filter((c) => (comidas || []).includes(c) && hay(c)).forEach((c) => {
      const p = plato((eleccion || {})[c]);
      if (!p || p.comida !== c) { faltan.push(c); return; }
      const sub = Math.round(Number(p.precio_usd) * n * 100) / 100;
      usd += sub;
      lineas.push({ comida: c, id: p.id, usd: sub,
        texto: t.comida[c] + ": " + p.nombre + " (" + (p.cocina || t.organizacion) + "), " + dinero(p.precio_usd) + " × " + t.dias(n) });
    });
    return { usd: Math.round(usd * 100) / 100, lineas, faltan, dias: n };
  }

  /* Pinta el menú de una comida en `caja`. Con `nombre` (el name de los
     radios) se elige; sin él, solo se mira. `elegido`: el id marcado. */
  function pintar(caja, comida, o) {
    const t = T(o.idioma), grupos = agrupar(comida);
    caja.textContent = "";
    caja.setAttribute("data-no-traducir", "");
    caja.lang = o.idioma || "es";
    const fs = el(o.nombre ? "fieldset" : "div", "metro-menu space-y-2");
    fs.dataset.menuComida = comida;
    const tit = el(o.nombre ? "legend" : "p", "font-semibold text-sm", o.nombre ? t.elige[comida] : t.opciones[comida]);
    fs.append(tit);
    if (!grupos.length) { fs.append(el("p", "text-sm", t.vacio)); caja.append(fs); return; }
    const lista = el("div", "grid sm:grid-cols-2 gap-3");
    grupos.forEach((g) => {
      const tarjeta = el("div", "metro-plato");
      if (g.imagen) {
        const img = el("img", "metro-plato-foto"); img.src = urlFoto(g.imagen); img.alt = ""; img.loading = "lazy"; img.decoding = "async";
        tarjeta.append(img);
      }
      const cuerpo = el("div", "metro-plato-cuerpo");
      cuerpo.append(el("p", "metro-plato-nombre", g.nombre));
      if (g.descripcion) cuerpo.append(el("p", "metro-plato-desc", g.descripcion));
      const ops = el("div", "space-y-1 mt-2");
      g.opciones.forEach((p) => {
        const precio = Number(p.precio_usd) > 0 ? dinero(p.precio_usd) + " " + t.porDia : t.sinCosto;
        const quien = t.prepara + ": " + (p.cocina || t.organizacion);
        if (o.nombre) {
          const lab = el("label", "metro-plato-opcion");
          const r = el("input"); r.type = "radio"; r.name = o.nombre; r.value = p.id; r.dataset.menuPlato = comida;
          r.checked = o.elegido === p.id;
          const txt = el("span"); txt.append(el("span", "block", quien), el("span", "block font-semibold", precio));
          if (p.cocina_detalle) txt.append(el("span", "block text-xs", p.cocina_detalle));
          lab.append(r, txt);
          ops.append(lab);
        } else {
          const linea = el("p", "text-sm"); linea.append(el("span", "", quien + " · "), el("span", "font-semibold", precio));
          ops.append(linea);
        }
      });
      cuerpo.append(ops);
      tarjeta.append(cuerpo);
      lista.append(tarjeta);
    });
    fs.append(lista);
    caja.append(fs);
  }

  return { COMIDAS, TX, BUCKET, cargar, poner, de, hay, hayAlguno, plato, agrupar, dias, costo, pintar, urlFoto, dinero };
})();

/*! rev bfb5bbb0d2d82f9f */
