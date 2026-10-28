/* ===== inscripcion-jde.html — la inscripción de ajedrez de los JDE ===== */
/* La página que usa el docente para preparar la inscripción de su centro
 * educativo. Las reglas (categorías, equipos, cuerpo técnico, la revisión
 * contra la Normativa) están en js/inscripcion-jde-reglas.js; acá solo está lo
 * que se ve: el formulario, el banco de colegios, la revisión y los archivos.
 *
 * Nada se manda a ningún servidor: lo que se escribe (nombres de menores,
 * fechas de nacimiento, documentos) se guarda solo en el navegador
 * (localStorage) y en los archivos que la persona baja. Todo texto escrito por
 * una persona entra a la página por textContent o por .value, nunca como HTML.
 * Ver «La inscripción de los JDE» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
  "use strict";
  const I = window.InscripcionJde;
  const G = window.PareoGrupos;
  const F = window.JdeFases;
  const $ = (id) => document.getElementById(id);

  const CLAVE_BORRADOR = "ij_borrador_v1";
  const CLAVE_DESCARGA = "ij_descarga_v1";   // cuándo se bajó el borrador (.json) por última vez
  const HORA = 3600 * 1000;
  const CLAVE_PARA_PAREO = "ij_para_pareo_v1";  // la lista que Pareo Integral recoge (js/pareo/pagina.js)
  const MAX_ESTUDIANTES = 400;
  const MAX_CUERPO = 20;

  // ---------------------------------------------------------------- utilidades
  function el(etiqueta, propiedades, ...hijos) {
    const nodo = document.createElement(etiqueta);
    for (const [k, v] of Object.entries(propiedades || {})) {
      if (v == null || v === false) continue;
      if (k === "texto") nodo.textContent = v;
      else if (k === "clase") nodo.className = v;
      else if (k === "para") nodo.htmlFor = v;
      else if (k in nodo && k !== "list" && k !== "style") nodo[k] = v;
      else nodo.setAttribute(k, v === true ? "" : v);
    }
    for (const h of hijos) if (h != null) nodo.append(h);
    return nodo;
  }
  const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const fechaCorta = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? m[3] + "/" + m[2] + "/" + m[1] : ""; };
  const plural = (n, uno, varios) => n + " " + (n === 1 ? uno : varios);

  function avisar(texto, tipo) { if (window.Avisos) window.Avisos.avisar(texto, { tipo: tipo || "ok" }); }

  // ------------------------------------------------------------------- estado
  function leerBorrador() {
    try {
      const crudo = localStorage.getItem(CLAVE_BORRADOR);
      return crudo ? I.normalizar(JSON.parse(crudo)) : null;
    } catch (e) { return null; }
  }
  let estado = leerBorrador() || I.estadoNuevo();
  if (!estado.cuerpo.length) estado.cuerpo.push(I.personaNueva({ rol: "jefe" }), I.personaNueva({ rol: "tecnico" }));

  // Con tres estudiantes o más y sin haber bajado el borrador en la última hora, se
  // recuerda (solo se recuerda: nada se baja solo).
  function hayQueRecordar() {
    if (estado.estudiantes.filter((e) => e.nombre.trim()).length < 3) return false;
    let ultima = 0;
    try { ultima = Number(localStorage.getItem(CLAVE_DESCARGA)) || 0; } catch (e) { /* sin almacenamiento */ }
    return Date.now() - ultima > HORA;
  }
  let temporizador = null;
  function guardarPronto() {
    clearTimeout(temporizador);
    temporizador = setTimeout(guardarAhora, 400);
  }
  function guardarAhora() {
    const aviso = $("ij-guardado");
    try {
      localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(estado));
      aviso.textContent = "Guardado en este navegador a las " + window.HoraCR.hora(new Date()) + ". No sale de tu computadora." + (hayQueRecordar() ? " Todavía no has bajado el borrador (.json) en la última hora: bájalo para no perder lo que escribiste si cambias de computadora o borras los datos del navegador." : "");
      $("ij-bajar-borrador").classList.toggle("ij-primario", hayQueRecordar());
    } catch (e) {
      aviso.textContent = "Este navegador no deja guardar el borrador: baja el archivo (.json) para no perder lo que escribes.";
    }
  }

  // -------------------------------------------------------------------- banco
  const banco = { centros: [], estudiantes: new Map(), listo: false };
  async function cargarBanco() {
    try {
      const r = await fetch("data/jde-banco.json", { cache: "no-cache" });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      // [nombre, regional, torneos, último año, tipo («e» escuela, «c» colegio), circuito]
      banco.centros = d.instituciones.map((f, i) => ({ nombre: f[0], region: f[1] || "", participaciones: f[2] || 0, ultimo: f[3] || 0, tipo: f[4] === "e" ? "primaria" : f[4] === "c" ? "secundaria" : "", circuito: f[5] || "", idx: i }));
      for (const f of d.estudiantes) {
        if (!banco.estudiantes.has(f[1])) banco.estudiantes.set(f[1], []);
        banco.estudiantes.get(f[1]).push({ nombre: f[0], ultimo: f[2], sexo: f[3] === "w" ? "w" : "" });
      }
      banco.listo = true;
      document.documentElement.dataset.ijBanco = "listo";
      banco.actualizado = d.actualizado || "";
      banco.ayuda = "Banco de " + banco.centros.length.toLocaleString("es-CR") + " centros educativos (listados del MEP y torneos de chess-results" + (banco.actualizado ? ", al " + window.HoraCR.fecha(banco.actualizado) : "") + "). Si el tuyo no sale, escríbelo completo.";
      $("ij-centro-ayuda").textContent = banco.ayuda;
    } catch (e) {
      document.documentElement.dataset.ijBanco = "error";
      $("ij-centro-ayuda").textContent = "No se pudo cargar el banco de centros educativos: escribe el nombre y elige la Dirección Regional y el circuito a mano.";
    }
    llenarCircuitos();
    actualizarCentro();
  }
  // El centro del banco que se llama como lo escrito; si hay varios con el mismo
  // nombre (hay cientos de «Escuela Santa Elena»), el de la regional marcada.
  function centroDelBanco() {
    if (!banco.listo) return null;
    const k = I.claveBusqueda(estado.centro.nombre);
    if (!k) return null;
    const iguales = banco.centros.filter((c) => I.claveBusqueda(c.nombre) === k);
    return iguales.find((c) => c.region && c.region === estado.centro.region) || iguales[0] || null;
  }

  // ----------------------------------------------------------------- delegación
  function llenarSelect(sel, opciones, valor) {
    sel.textContent = "";
    for (const o of opciones) sel.append(el("option", { value: o.valor, texto: o.texto }));
    sel.value = valor;
  }
  function iniciarCentro() {
    const anios = F.anios().sort((a, b) => a - b);
    const extra = anios[anios.length - 1] + 1;
    llenarSelect($("ij-anio"), anios.concat(extra).map((a) => ({ valor: String(a), texto: a === extra ? a + " (aún sin Normativa publicada)" : String(a) })), String(estado.anio));
    llenarSelect($("ij-etapa"), I.ETAPAS.map((e) => ({ valor: e.id, texto: "Etapa " + e.nombre })), estado.etapa);
    llenarSelect($("ij-region"), [{ valor: "", texto: "— Elige tu Dirección Regional —" }].concat(G.JDE_DIRECCIONES.map((d) => ({ valor: d, texto: d }))), estado.centro.region);
    for (const r of document.querySelectorAll('input[name="ij-tipo"]')) r.checked = r.value === estado.centro.tipo;
    $("ij-centro").value = estado.centro.nombre;
    llenarCircuitos();
    $("ij-telefono").value = estado.centro.telefono;
    $("ij-correo").value = estado.centro.correo;
    $("ij-privado").checked = estado.centro.privado;
    $("ij-union").checked = estado.centro.union.activa;
    $("ij-union-centros").value = estado.centro.union.centros;
    $("ij-union-matricula").value = estado.centro.union.matricula;
    actualizarCentro();
  }
  const AYUDA_ETAPA = {
    institucional: "Abierta a toda la población estudiantil que quiera jugar. Clasifican a la Regional dos mujeres y dos en abierto por categoría, y dos equipos.",
    regional: "Juegan las categorías A, B, C, D y E. Inscribe a quienes clasificaron de tu etapa institucional.",
    interregional: "Solo juegan las categorías B y D, todos contra todos. Inscribe a quienes clasificaron de la Regional.",
    nacional: "Solo juegan las categorías B y D. Inscribe a quienes ganaron su Interregional.",
  };
  function actualizarCentro() {
    $("ij-etapa-ayuda").textContent = AYUDA_ETAPA[estado.etapa] || "";
    $("ij-union-campos").hidden = !estado.centro.union.activa;
    $("ij-union").setAttribute("aria-expanded", String(estado.centro.union.activa));
    const inter = I.interregionalDe(estado.centro.region);
    $("ij-region-ayuda").textContent = inter ? "Juega la " + inter.nombre + ": " + plural(inter.cupo, "persona clasifica", "personas clasifican") + " por torneo individual y " + plural(inter.cupo, "equipo", "equipos") + " por torneo." : "";
    $("ij-eq-inter").textContent = inter ? "En tu regional (la " + inter.nombre + ") clasifican " + plural(inter.cupo, "equipo", "equipos") + " por torneo y categoría a la Interregional (art. 66.1.j): con dos equipos por categoría y torneo ya inscribes a todos los que pueden clasificar." : "Elige tu Dirección Regional arriba y aquí verás cuántos equipos clasifican a la Interregional.";
    const c = centroDelBanco();
    $("ij-traer").disabled = !(c && (banco.estudiantes.get(c.idx) || []).length);
    if (banco.listo) {
      const filtro = { dre: estado.centro.region, tipo: estado.centro.tipo };
      let texto;
      if (c) {
        texto = "Está en el banco" + (c.participaciones ? ": " + plural(c.participaciones, "torneo", "torneos") + " de los JDE, el último en " + c.ultimo + "." : ".") + ($("ij-traer").disabled ? "" : " Puedes traer a sus estudiantes de otros años.");
      } else if (filtro.dre && filtro.tipo) {
        const n = I.centrosDe(banco.centros, filtro, "", 1).total;
        texto = n ? "Hay " + n.toLocaleString("es-CR") + (filtro.tipo === "primaria" ? " escuelas" : " colegios") + " de la regional " + filtro.dre + " en el banco: toca el campo para ver la lista o escribe para filtrar. Si el tuyo no está, escríbelo completo." : "No hay " + (filtro.tipo === "primaria" ? "escuelas" : "colegios") + " de la regional " + filtro.dre + " en el banco: escribe el nombre completo.";
      } else {
        texto = "Primero marca tu Dirección Regional y si es escuela o colegio, y se despliega la lista. " + banco.ayuda;
      }
      $("ij-centro-ayuda").textContent = texto;
    }
    const circ = estado.centro.circuito;
    $("ij-circuito-ayuda").textContent = !c ? "Si tu centro no está en la lista, elige tu circuito." : c.circuito && circ === c.circuito ? "Circuito " + circ + " según el listado del MEP; puedes cambiarlo si no es." : c.circuito ? "El MEP lista este centro en el circuito " + c.circuito + "." : "No sabemos el circuito de este centro: elígelo.";
  }

  // Los circuitos de la regional marcada (los del banco) y el que ya tiene elegido.
  function llenarCircuitos() {
    const sel = $("ij-circuito");
    let lista = banco.listo ? I.circuitosDe(banco.centros, estado.centro.region) : [];
    if (!lista.length) lista = Array.from({ length: 14 }, (_, i) => String(i + 1).padStart(2, "0"));
    if (estado.centro.circuito && !lista.includes(estado.centro.circuito)) lista = lista.concat(estado.centro.circuito);
    llenarSelect(sel, [{ valor: "", texto: "— Elige el circuito —" }].concat(lista.map((c) => ({ valor: c, texto: "Circuito " + c }))), estado.centro.circuito);
  }

  // La lista de centros: con la regional y el tipo marcados salen todos los de
  // esa regional; escribiendo, se filtran. Al elegir uno se llenan la regional,
  // el tipo y el circuito.
  let opcionActiva = -1;
  let resultados = [];
  function cerrarLista() {
    $("ij-centro-lista").hidden = true;
    $("ij-centro").setAttribute("aria-expanded", "false");
    $("ij-centro-abrir").setAttribute("aria-expanded", "false");
    $("ij-centro").removeAttribute("aria-activedescendant");
    opcionActiva = -1;
  }
  const TOPE_LISTA = 400;
  function abrirLista() {
    const lista = $("ij-centro-lista");
    lista.textContent = "";
    const texto = $("ij-centro").value;
    const filtro = { dre: estado.centro.region, tipo: estado.centro.tipo };
    // Sin escribir y sin marcar nada serían los 5 000 del país: no se despliegan.
    const hay = banco.listo && (texto.trim() || filtro.dre || filtro.tipo);
    const r = hay ? I.centrosDe(banco.centros, filtro, texto, TOPE_LISTA) : { centros: [], total: 0, enTodoElPais: false };
    resultados = r.centros;
    if (!resultados.length) { cerrarLista(); return; }
    if (r.enTodoElPais) lista.append(el("li", { role: "presentation", clase: "ij-opcion-nota", texto: "Ninguno de tu regional se llama así: estos son de todo el país." }));
    resultados.forEach((c, i) => {
      const partes = [];
      if (!filtro.dre || r.enTodoElPais) partes.push(c.region ? "DRE " + c.region : "regional sin identificar");
      partes.push(c.circuito ? "Circuito " + c.circuito : "circuito sin identificar");
      if (!filtro.tipo && c.tipo) partes.push(c.tipo === "primaria" ? "escuela" : "colegio");
      const li = el("li", { id: "ij-centro-op-" + i, role: "option", clase: "ij-opcion", "aria-selected": "false" },
        el("span", { clase: "font-semibold", texto: c.nombre }),
        el("span", { clase: "ij-opcion-sub", texto: partes.join(" · ") }));
      // mousedown y no click: el blur del campo cerraría la lista antes del click.
      li.addEventListener("mousedown", (ev) => { ev.preventDefault(); elegirCentro(c); });
      lista.append(li);
    });
    if (r.total > resultados.length) lista.append(el("li", { role: "presentation", clase: "ij-opcion-nota", texto: "Hay " + (r.total - resultados.length).toLocaleString("es-CR") + " más: escribe parte del nombre para filtrar." }));
    lista.hidden = false;
    $("ij-centro").setAttribute("aria-expanded", "true");
    $("ij-centro-abrir").setAttribute("aria-expanded", "true");
    $("ij-centro-ayuda").textContent = (r.total > resultados.length ? "Se muestran " + resultados.length + " de " + r.total.toLocaleString("es-CR") + " centros" : plural(r.total, "centro", "centros")) + ". Usa las flechas y Enter para elegir uno.";
    marcarOpcion(-1);
  }
  function marcarOpcion(i) {
    opcionActiva = i;
    [...$("ij-centro-lista").querySelectorAll("[role=option]")].forEach((li, k) => li.setAttribute("aria-selected", String(k === i)));
    if (i >= 0) {
      $("ij-centro").setAttribute("aria-activedescendant", "ij-centro-op-" + i);
      const op = $("ij-centro-op-" + i);
      if (op && op.scrollIntoView) op.scrollIntoView({ block: "nearest" });
    } else $("ij-centro").removeAttribute("aria-activedescendant");
  }
  function elegirCentro(c) {
    estado.centro.nombre = c.nombre;
    $("ij-centro").value = c.nombre;
    if (c.region) { estado.centro.region = c.region; $("ij-region").value = c.region; }
    if (c.tipo) { estado.centro.tipo = c.tipo; for (const r of document.querySelectorAll('input[name="ij-tipo"]')) r.checked = r.value === c.tipo; }
    // El circuito se llena solo; si el listado no lo trae, queda por elegir (nunca el de otro centro).
    estado.centro.circuito = c.circuito || "";
    llenarCircuitos();
    cerrarLista();
    cambio();
  }
  // Un centro que se eligió del banco y que ya no es de la regional o del tipo marcados se quita: lo escrito a mano se respeta.
  function revisarCentroElegido() {
    const c = centroDelBanco();
    if (!c) return;
    if ((c.region && estado.centro.region && c.region !== estado.centro.region) || (c.tipo && estado.centro.tipo && c.tipo !== estado.centro.tipo)) {
      estado.centro.nombre = "";
      estado.centro.circuito = "";
      $("ij-centro").value = "";
    }
  }

  function enlazarCentro() {
    const campo = $("ij-centro");
    campo.addEventListener("input", () => { estado.centro.nombre = campo.value; abrirLista(); cambio(); });
    campo.addEventListener("focus", abrirLista);
    campo.addEventListener("click", () => { if ($("ij-centro-lista").hidden) abrirLista(); });
    campo.addEventListener("blur", cerrarLista);
    // El botón ▾ abre y cierra la lista; mousedown para que el campo no pierda el foco antes.
    $("ij-centro-abrir").addEventListener("mousedown", (ev) => ev.preventDefault());
    $("ij-centro-abrir").addEventListener("click", () => {
      if (!$("ij-centro-lista").hidden) { cerrarLista(); return; }
      campo.focus();
      abrirLista();
    });
    campo.addEventListener("keydown", (ev) => {
      const abierta = !$("ij-centro-lista").hidden;
      if (ev.key === "ArrowDown") { ev.preventDefault(); if (!abierta) abrirLista(); else marcarOpcion((opcionActiva + 1) % resultados.length); }
      else if (ev.key === "ArrowUp" && abierta) { ev.preventDefault(); marcarOpcion((opcionActiva - 1 + resultados.length) % resultados.length); }
      else if (ev.key === "Enter" && abierta && opcionActiva >= 0) { ev.preventDefault(); elegirCentro(resultados[opcionActiva]); }
      else if (ev.key === "Escape" && abierta) { ev.preventDefault(); cerrarLista(); }
    });
    $("ij-anio").addEventListener("change", (ev) => { estado.anio = Number(ev.target.value); cambio(); });
    $("ij-etapa").addEventListener("change", (ev) => { estado.etapa = ev.target.value; cambio(); });
    $("ij-region").addEventListener("change", (ev) => { estado.centro.region = ev.target.value; revisarCentroElegido(); llenarCircuitos(); cambio(); });
    for (const r of document.querySelectorAll('input[name="ij-tipo"]')) r.addEventListener("change", () => { estado.centro.tipo = r.value; revisarCentroElegido(); llenarCircuitos(); cambio(); });
    $("ij-circuito").addEventListener("change", (ev) => { estado.centro.circuito = ev.target.value; cambio(); });
    $("ij-telefono").addEventListener("input", (ev) => { estado.centro.telefono = ev.target.value; cambio(); });
    $("ij-correo").addEventListener("input", (ev) => { estado.centro.correo = ev.target.value; cambio(); });
    $("ij-privado").addEventListener("change", (ev) => { estado.centro.privado = ev.target.checked; cambio(); });
    $("ij-union").addEventListener("change", (ev) => { estado.centro.union.activa = ev.target.checked; cambio(); });
    $("ij-union-centros").addEventListener("input", (ev) => { estado.centro.union.centros = ev.target.value; cambio(); });
    $("ij-union-matricula").addEventListener("input", (ev) => { estado.centro.union.matricula = ev.target.value.replace(/[^\d]/g, ""); ev.target.value = estado.centro.union.matricula; cambio(); });
  }

  // -------------------------------------------------------------- cuerpo técnico
  const refsCuerpo = new Map();
  function pintarCuerpo() {
    const caja = $("ij-cuerpo");
    caja.textContent = "";
    refsCuerpo.clear();
    estado.cuerpo.forEach((p, n) => {
      const id = "ij-p-" + p.id;
      const nombre = el("input", { id: id + "-n", type: "text", clase: "ae-control w-full", maxLength: 160, autocomplete: "off", value: p.nombre });
      const rol = el("select", { id: id + "-r", clase: "ae-control w-full" },
        el("option", { value: "jefe", texto: "Jefatura de delegación" }), el("option", { value: "tecnico", texto: "Cuerpo técnico" }));
      rol.value = p.rol;
      const sexo = el("select", { id: id + "-s", clase: "ae-control w-full" },
        el("option", { value: "", texto: "— Elige —" }), el("option", { value: "w", texto: "Mujer" }), el("option", { value: "m", texto: "Hombre" }));
      sexo.value = p.sexo;
      const tel = el("input", { id: id + "-t", type: "tel", clase: "ae-control w-full", maxLength: 30, autocomplete: "off", value: p.telefono });
      const func = el("input", { id: id + "-f", type: "checkbox", checked: p.funcionario });
      const quitar = el("button", { type: "button", clase: "ae-boton", texto: "Quitar", "aria-label": "Quitar a la persona " + (n + 1) + (p.nombre ? ": " + p.nombre : "") });
      nombre.addEventListener("input", () => { p.nombre = nombre.value; quitar.setAttribute("aria-label", "Quitar a la persona " + (n + 1) + (p.nombre ? ": " + p.nombre : "")); cambio(); });
      rol.addEventListener("change", () => { p.rol = rol.value; cambio(); });
      sexo.addEventListener("change", () => { p.sexo = sexo.value; cambio(); });
      tel.addEventListener("input", () => { p.telefono = tel.value; cambio(); });
      func.addEventListener("change", () => { p.funcionario = func.checked; cambio(); });
      quitar.addEventListener("click", () => { estado.cuerpo = estado.cuerpo.filter((x) => x !== p); pintarCuerpo(); cambio(); $("ij-cuerpo-mas").focus(); });
      const campo = (txt, para, control, extra) => el("div", { clase: "ij-campo" + (extra ? " " + extra : "") }, el("label", { para, clase: "ij-et", texto: txt }), control);
      caja.append(el("div", { clase: "ij-persona", role: "group", "aria-label": "Persona " + (n + 1) + " del cuerpo técnico" },
        campo("Nombre completo", id + "-n", nombre, "ij-ancho"),
        campo("Cargo", id + "-r", rol), campo("Sexo", id + "-s", sexo), campo("Teléfono", id + "-t", tel),
        el("div", { clase: "ij-campo" }, el("label", { clase: "ij-casilla" }, func, " Es persona funcionaria"), quitar)));
    });
  }

  // ------------------------------------------------------------------ estudiantes
  const refsEst = new Map();
  function opcionesDe(sel, lista, valor) {
    const firma = lista.map((o) => o.valor + "|" + o.texto + "|" + (o.deshabilitada ? 1 : 0)).join("§");
    if (sel.dataset.firma !== firma) {
      sel.textContent = "";
      for (const o of lista) sel.append(el("option", { value: o.valor, texto: o.texto, disabled: !!o.deshabilitada }));
      sel.dataset.firma = firma;
    }
    sel.value = valor;
  }

  // Un cambio que podría pasarse de lo permitido (más de dos individuales por
  // categoría y torneo, un integrante que por su edad no puede jugar en el
  // equipo…) se hace con `intentar()`: si deja pasarse, se deshace y se dice por
  // qué, y la pantalla vuelve a pintarse con lo que quedó.
  function conTopes(accion) {
    const r = I.intentar(estado, accion);
    if (!r.ok) {
      avisar(r.motivos[0], "error");
      repintarTodo();
    }
    cambio();
    return r;
  }
  function repintarTodo() { pintarEquipos(); pintarEstudiantes(); }

  // Los nombres de los estudiantes de este centro en los JDE de antes se ofrecen mientras
  // se escribe (un <datalist>), y quien viene del banco con el sexo seguro (jugó un torneo
  // femenino) lo trae puesto. Nunca se adivina: sin el dato seguro, no se toca.
  function llenarNombres() {
    let lista = document.getElementById("ij-nombres");
    if (!lista) { lista = el("datalist", { id: "ij-nombres" }); document.body.append(lista); }
    const c = centroDelBanco();
    const nombres = c ? (banco.estudiantes.get(c.idx) || []).map((x) => x.nombre) : [];
    const firma = c ? String(c.idx) : "";
    if (lista.dataset.firma === firma) return;
    lista.dataset.firma = firma;
    lista.textContent = "";
    for (const n of nombres) lista.append(el("option", { value: n }));
  }
  function sexoDelBanco(e) {
    const c = centroDelBanco();
    if (!c || e.sexo || !e.nombre.trim()) return false;
    const b = (banco.estudiantes.get(c.idx) || []).find((x) => clavePersona(x.nombre) === clavePersona(e.nombre));
    if (!b || b.sexo !== "w") return false;
    return I.intentar(estado, () => { e.sexo = "w"; }).ok && (cambio(), true);
  }

  // Un estudiante que juega solo.
  function crearTarjeta(e) {
    const id = "ij-e-" + e.id;
    const r = { id };
    r.titulo = el("h3", { clase: "font-semibold", id: id + "-h" });
    r.estadoTxt = el("span", { clase: "ij-chip" });
    r.quitar = el("button", { type: "button", clase: "ae-boton", texto: "Quitar" });
    r.agarrar = el("span", { clase: "ij-agarrar", draggable: "true", texto: "⠿ Arrastrar a un equipo", title: "Arrastra esta tarjeta sobre un equipo para pasar a este estudiante a él (también puedes hacerlo desde el equipo, con «Pasar a este equipo»)" });
    r.agarrar.addEventListener("dragstart", (ev) => { ev.dataTransfer.setData("text/plain", "ij-e:" + e.id); ev.dataTransfer.effectAllowed = "move"; });
    r.nombre = el("input", { id: id + "-n", type: "text", clase: "ae-control w-full", maxLength: 160, autocomplete: "off", value: e.nombre, placeholder: "Apellidos Nombre", list: "ij-nombres" });
    r.sexo = el("select", { id: id + "-s", clase: "ae-control w-full" }, el("option", { value: "", texto: "— Elige —" }), el("option", { value: "w", texto: "Mujer" }), el("option", { value: "m", texto: "Hombre" }));
    r.nacimiento = el("input", { id: id + "-f", type: "date", clase: "ae-control w-full", min: "1995-01-01", max: window.HoraCR.hoy(), value: e.nacimiento });
    r.categoria = el("select", { id: id + "-c", clase: "ae-control w-full" });
    r.catAyuda = el("p", { clase: "ij-ayuda", id: id + "-c-a" });
    r.categoria.setAttribute("aria-describedby", id + "-c-a");
    r.torneo = el("select", { id: id + "-t", clase: "ae-control w-full" });
    r.docTipo = el("select", { id: id + "-dt", clase: "ae-control w-full" }, ...I.DOCUMENTOS.map((d) => el("option", { value: d.id, texto: d.nombre })));
    r.documento = el("input", { id: id + "-d", type: "text", clase: "ae-control w-full", maxLength: 30, autocomplete: "off", value: e.documento, placeholder: "Número" });
    r.apoyo = el("input", { id: id + "-ap", type: "checkbox", checked: e.apoyo });
    r.problemas = el("ul", { clase: "ij-problemas" });
    const campo = (txt, control, extra) => el("div", { clase: "ij-campo" + (extra ? " " + extra : "") }, el("label", { para: control.id, clase: "ij-et", texto: txt }), control);

    r.sexo.value = e.sexo;
    r.docTipo.value = e.docTipo;

    r.nombre.addEventListener("input", () => { e.nombre = r.nombre.value; cambio(); });
    r.nombre.addEventListener("change", () => { if (sexoDelBanco(e)) { r.sexo.value = e.sexo; } });
    r.sexo.addEventListener("change", () => conTopes(() => { e.sexo = r.sexo.value; if (e.sexo !== "w") e.torneo = ""; }));
    r.nacimiento.addEventListener("change", () => conTopes(() => { e.nacimiento = I.anioDe(r.nacimiento.value) ? r.nacimiento.value : ""; }));
    r.categoria.addEventListener("change", () => conTopes(() => { e.categoria = r.categoria.value; }));
    r.torneo.addEventListener("change", () => conTopes(() => { e.torneo = r.torneo.value; }));
    r.docTipo.addEventListener("change", () => { e.docTipo = r.docTipo.value; cambio(); });
    r.documento.addEventListener("input", () => { e.documento = r.documento.value; cambio(); });
    r.apoyo.addEventListener("change", () => { e.apoyo = r.apoyo.checked; cambio(); });
    r.quitar.addEventListener("click", () => {
      estado.estudiantes = estado.estudiantes.filter((x) => x !== e);
      pintarEstudiantes();
      cambio();
      $("ij-est-mas").focus();
    });

    r.tarjeta = el("article", { clase: "ij-estudiante", "aria-labelledby": id + "-h" },
      el("div", { clase: "ij-cabecera" }, r.titulo, r.estadoTxt, r.agarrar, r.quitar),
      el("div", { clase: "ij-rejilla" },
        campo("Nombre completo", r.nombre, "ij-ancho"), campo("Sexo", r.sexo), campo("Fecha de nacimiento", r.nacimiento),
        el("div", { clase: "ij-campo" }, el("label", { para: id + "-c", clase: "ij-et", texto: "Categoría" }), r.categoria, r.catAyuda),
        campo("Torneo", r.torneo),
        campo("Documento de identificación", r.docTipo), el("div", { clase: "ij-campo" }, el("label", { para: id + "-d", clase: "ij-et", texto: "Número" }), r.documento),
        el("div", { clase: "ij-campo" }, el("label", { clase: "ij-casilla" }, r.apoyo, " Necesita apoyos por discapacidad (art. 66.2.i)"))),
      r.problemas);
    return r;
  }

  function pintarEstudiantes() {
    const caja = $("ij-est");
    caja.textContent = "";
    refsEst.clear();
    const solos = estado.estudiantes.filter((e) => !e.equipoId);
    solos.forEach((e) => {
      const r = crearTarjeta(e);
      refsEst.set(e.id, r);
      caja.append(r.tarjeta);
    });
    $("ij-est-vacio").hidden = solos.length > 0;
  }

  // Lo que depende de otros campos: categorías posibles, torneo, equipo, los problemas.
  function actualizarTarjetas(porId) {
    estado.estudiantes.filter((e) => !e.equipoId).forEach((e, n) => {
      const r = refsEst.get(e.id);
      if (!r) return;
      r.titulo.textContent = "Estudiante " + (n + 1) + (e.nombre.trim() ? ": " + e.nombre.trim() : "");
      r.quitar.setAttribute("aria-label", "Quitar a " + (e.nombre.trim() || "el estudiante " + (n + 1)));
      const pos = I.categoriasPosibles(e, estado);
      const auto = pos.propia
        ? { valor: "", texto: "Le corresponde la " + I.NOMBRE_CATEGORIA[pos.propia] }
        : { valor: "", texto: pos.opciones.length > 1 ? "Elige: " + pos.opciones.join(" o ") : "Falta la fecha de nacimiento", deshabilitada: !pos.opciones.length };
      const cats = pos.lista.filter((c) => c !== pos.propia).map((c) => ({ valor: c, texto: I.NOMBRE_CATEGORIA[c] + (pos.opciones.includes(c) ? "" : " — sube de categoría") }));
      opcionesDe(r.categoria, [auto].concat(cats), categoriaElegidaVale(e.categoria, pos) ? e.categoria : "");
      const efectiva = I.categoriaEfectiva(e, estado);
      r.catAyuda.textContent = efectiva ? "Juega en la categoría " + efectiva + "." : "";
      const torneos = e.sexo === "m" ? [{ valor: "", texto: "Abierto" }]
        : e.sexo === "w" ? [{ valor: "", texto: "Mujeres" }, { valor: "m", texto: "Abierto" }]
        : [{ valor: "", texto: "— Elige el sexo primero —", deshabilitada: true }];
      opcionesDe(r.torneo, torneos, e.sexo === "w" ? e.torneo : "");
      const problemas = porId.get(e.id) || [];
      r.problemas.textContent = "";
      for (const p of problemas) r.problemas.append(el("li", { clase: "ij-hallazgo ij-" + p.nivel }, el("strong", { clase: "ij-etiqueta", texto: p.nivel === "error" ? "Error:" : "Aviso:" }), " " + p.texto + (p.art ? " (" + p.art + ")" : "")));
      const errores = problemas.filter((p) => p.nivel === "error").length;
      const conAvisos = problemas.length - errores;
      r.estadoTxt.textContent = errores ? plural(errores, "error por corregir", "errores por corregir") : conAvisos ? "Con avisos" : (e.nombre.trim() ? "Listo" : "Sin llenar");
      r.estadoTxt.dataset.estado = errores ? "error" : conAvisos ? "aviso" : "ok";
      r.tarjeta.dataset.estado = r.estadoTxt.dataset.estado;
    });
  }
  // Una categoría elegida a mano solo vale si sigue entre las posibles.
  function categoriaElegidaVale(cat, pos) { return !!cat && pos.lista.includes(cat) && cat !== pos.propia; }

  // --------------------------------------------------------------------- equipos
  // Cada equipo es una tarjeta con sus integrantes. Lo que cambia la estructura
  // (crear, quitar, pasar a alguien) vuelve a pintar la lista; lo demás solo
  // actualiza textos en `actualizarEquipos()`. Todo lo que podría pasarse de lo
  // permitido va por `conTopes()`/`I.agregarIntegrante()`: si no cabe, no se agrega.
  const refsEq = new Map();
  const refsMiembro = new Map();
  const nombreEquipo = (t) => "Equipo " + I.NOMBRE_TORNEO[t.torneo] + " · categoría " + t.categoria + (t.numero > 1 ? " · equipo " + t.numero : "");

  function llenarCategoriasEquipo() {
    const etapa = I.ETAPAS.find((x) => x.id === estado.etapa) || I.ETAPAS[1];
    const sel = $("ij-eq-categoria");
    const antes = sel.value;
    opcionesDe(sel, etapa.categorias.map((c) => ({ valor: c, texto: I.NOMBRE_CATEGORIA[c] })), etapa.categorias.includes(antes) ? antes : etapa.categorias[0]);
  }

  function crearMiembroUI(e, t) {
    const id = "ij-m-" + e.id;
    const r = { id };
    r.titulo = el("h4", { clase: "font-semibold", id: id + "-h" });
    r.estadoTxt = el("span", { clase: "ij-chip" });
    r.sube = el("span", { clase: "ij-chip", "data-estado": "aviso" });
    r.nombre = el("input", { id: id + "-n", type: "text", clase: "ae-control w-full", maxLength: 160, autocomplete: "off", value: e.nombre, placeholder: "Apellidos Nombre", list: "ij-nombres" });
    r.sexo = el("select", { id: id + "-s", clase: "ae-control w-full" }, el("option", { value: "", texto: "— Elige —" }), el("option", { value: "w", texto: "Mujer" }), el("option", { value: "m", texto: "Hombre" }));
    r.nacimiento = el("input", { id: id + "-f", type: "date", clase: "ae-control w-full", min: "1995-01-01", max: window.HoraCR.hoy(), value: e.nacimiento });
    r.condicion = el("select", { id: id + "-c", clase: "ae-control w-full" }, el("option", { value: "t", texto: "Titular" }), el("option", { value: "s", texto: "Suplente" }));
    r.docTipo = el("select", { id: id + "-dt", clase: "ae-control w-full" }, ...I.DOCUMENTOS.map((d) => el("option", { value: d.id, texto: d.nombre })));
    r.documento = el("input", { id: id + "-d", type: "text", clase: "ae-control w-full", maxLength: 30, autocomplete: "off", value: e.documento, placeholder: "Número" });
    r.apoyo = el("input", { id: id + "-ap", type: "checkbox", checked: e.apoyo });
    r.sacar = el("button", { type: "button", clase: "ae-boton", texto: "Pasar a individual" });
    r.quitar = el("button", { type: "button", clase: "ae-boton", texto: "Quitar" });
    r.problemas = el("ul", { clase: "ij-problemas" });
    r.sexo.value = e.sexo;
    r.docTipo.value = e.docTipo;
    r.condicion.value = e.suplente ? "s" : "t";
    if (t.torneo === "w") { r.sexo.value = "w"; r.sexo.disabled = true; }
    const campo = (txt, control, extra) => el("div", { clase: "ij-campo" + (extra ? " " + extra : "") }, el("label", { para: control.id, clase: "ij-et", texto: txt }), control);

    r.nombre.addEventListener("input", () => { e.nombre = r.nombre.value; cambio(); });
    r.nombre.addEventListener("change", () => { if (sexoDelBanco(e)) r.sexo.value = e.sexo; });
    r.sexo.addEventListener("change", () => conTopes(() => { e.sexo = r.sexo.value; }));
    r.nacimiento.addEventListener("change", () => conTopes(() => { e.nacimiento = I.anioDe(r.nacimiento.value) ? r.nacimiento.value : ""; }));
    r.condicion.addEventListener("change", () => conTopes(() => { e.suplente = r.condicion.value === "s"; }));
    r.docTipo.addEventListener("change", () => { e.docTipo = r.docTipo.value; cambio(); });
    r.documento.addEventListener("input", () => { e.documento = r.documento.value; cambio(); });
    r.apoyo.addEventListener("change", () => { e.apoyo = r.apoyo.checked; cambio(); });
    r.sacar.addEventListener("click", () => {
      const res = I.sacarDelEquipo(estado, e.id);
      if (!res.ok) avisar(res.motivos[0], "error");
      repintarTodo();
      cambio();
    });
    r.quitar.addEventListener("click", () => {
      estado.estudiantes = estado.estudiantes.filter((x) => x !== e);
      repintarTodo();
      cambio();
      const q = refsEq.get(t.id);
      if (q) q.mas.focus();
    });

    r.tarjeta = el("div", { clase: "ij-miembro", role: "group", "aria-labelledby": id + "-h" },
      el("div", { clase: "ij-cabecera" }, r.titulo, r.sube, r.estadoTxt),
      el("div", { clase: "ij-rejilla" },
        campo("Nombre completo", r.nombre, "ij-ancho"), campo("Sexo", r.sexo), campo("Fecha de nacimiento", r.nacimiento), campo("Condición", r.condicion),
        campo("Documento de identificación", r.docTipo), el("div", { clase: "ij-campo" }, el("label", { para: id + "-d", clase: "ij-et", texto: "Número" }), r.documento),
        el("div", { clase: "ij-campo" }, el("label", { clase: "ij-casilla" }, r.apoyo, " Necesita apoyos por discapacidad (art. 66.2.i)"))),
      r.problemas,
      el("div", { clase: "flex flex-wrap gap-3" }, r.sacar, r.quitar));
    return r;
  }

  function crearEquipoUI(t) {
    const id = "ij-q-" + t.id;
    const r = { id };
    r.titulo = el("h3", { clase: "font-semibold", id: id + "-h" });
    r.estadoTxt = el("span", { clase: "ij-chip" });
    r.quitar = el("button", { type: "button", clase: "ae-boton", texto: "Quitar el equipo" });
    r.resumen = el("p", { clase: "ij-ayuda", id: id + "-r" });
    r.faltan = el("p", { clase: "ij-ayuda font-semibold", id: id + "-fa" });
    r.irPrimero = el("button", { type: "button", clase: "ae-boton", texto: "Ir al primero" });
    r.irPrimero.addEventListener("click", () => {
      const fa = I.faltantes(estado.estudiantes.filter((e) => e.equipoId === t.id));
      if (fa.length) irA({ campo: fa[0].campo, ids: fa[0].ids });
    });
    r.problemas = el("ul", { clase: "ij-problemas" });
    r.miembros = el("div", { clase: "grid gap-3" });
    r.mas = el("button", { type: "button", clase: "ae-boton ij-primario", texto: "+ Integrante nuevo" });
    r.aviso = el("p", { clase: "ij-ayuda", role: "status", "aria-live": "polite" });
    r.pasar = el("select", { id: id + "-p", clase: "ae-control w-full" });
    r.pasarEt = el("label", { para: id + "-p", clase: "ij-et", texto: "Pasar a este equipo a un estudiante individual" });

    r.mas.addEventListener("click", () => {
      if (estado.estudiantes.length >= MAX_ESTUDIANTES) { r.aviso.textContent = "Caben " + MAX_ESTUDIANTES + " estudiantes por inscripción."; return; }
      const res = I.agregarIntegrante(estado, t.id, {});
      if (!res.ok) { r.aviso.textContent = res.motivos[0]; return; }
      r.aviso.textContent = "";
      pintarEquipos();
      cambio();
      const m = refsMiembro.get(res.resultado.id);
      if (m) m.nombre.focus();
    });
    r.pasar.addEventListener("change", () => {
      const e = estado.estudiantes.find((x) => x.id === r.pasar.value);
      if (!e) return;
      const res = I.agregarIntegrante(estado, t.id, null, e);
      if (!res.ok) avisar(res.motivos[0], "error");
      repintarTodo();
      cambio();
    });
    r.quitar.addEventListener("click", async () => {
      const n = estado.estudiantes.filter((e) => e.equipoId === t.id && e.nombre.trim()).length;
      const dice = n ? "Se quita el equipo con sus " + plural(n, "integrante", "integrantes") + ". ¿Seguimos?" : "Se quita el equipo. ¿Seguimos?";
      if (!(await window.Avisos.confirmar(dice, { aceptar: "Quitar el equipo", cancelar: "Cancelar", peligro: true }))) return;
      I.quitarEquipo(estado, t.id);
      repintarTodo();
      cambio();
      $("ij-eq-crear").focus();
    });

    // Soltar a un estudiante individual sobre el equipo lo pasa al equipo (el selector de
    // abajo hace lo mismo para quien no arrastra).
    const aceptaSuelta = (ev) => Array.from(ev.dataTransfer ? ev.dataTransfer.types : []).includes("text/plain");
    const tarjetaEq = () => r.tarjeta;
    r.pintarSuelta = (si) => tarjetaEq().classList.toggle("ij-suelta", si);
    r.soltar = (ev) => {
      ev.preventDefault();
      r.pintarSuelta(false);
      const dato = ev.dataTransfer.getData("text/plain");
      const e = dato.startsWith("ij-e:") && estado.estudiantes.find((x) => x.id === dato.slice(5) && !x.equipoId);
      if (!e) return;
      const res = I.agregarIntegrante(estado, t.id, null, e);
      if (!res.ok) avisar(res.motivos[0], "error");
      repintarTodo();
      cambio();
    };
    r.tarjeta = el("article", { clase: "ij-equipo-tarjeta", "aria-labelledby": id + "-h" },
      el("div", { clase: "ij-cabecera" }, r.titulo, r.estadoTxt, r.quitar),
      r.resumen, el("div", { clase: "flex flex-wrap gap-3 items-center" }, r.faltan, r.irPrimero), r.problemas, r.miembros,
      el("div", { clase: "flex flex-wrap gap-3 items-end" }, r.mas, el("div", { clase: "ij-campo", style: "min-width:14rem;flex:1 1 14rem" }, r.pasarEt, r.pasar)),
      r.aviso);
    r.tarjeta.addEventListener("dragover", (ev) => { if (aceptaSuelta(ev)) { ev.preventDefault(); r.pintarSuelta(true); } });
    r.tarjeta.addEventListener("dragleave", (ev) => { if (!r.tarjeta.contains(ev.relatedTarget)) r.pintarSuelta(false); });
    r.tarjeta.addEventListener("drop", r.soltar);
    return r;
  }

  function pintarEquipos() {
    const caja = $("ij-equipos-lista");
    caja.textContent = "";
    refsEq.clear();
    refsMiembro.clear();
    const orden = estado.equipos.slice().sort((a, b) => a.categoria.localeCompare(b.categoria) || (a.torneo === "w" ? -1 : 1) - (b.torneo === "w" ? -1 : 1) || a.numero - b.numero);
    for (const t of orden) {
      const r = crearEquipoUI(t);
      refsEq.set(t.id, r);
      const miembros = estado.estudiantes.filter((e) => e.equipoId === t.id).sort((a, b) => Number(!!a.suplente) - Number(!!b.suplente));
      for (const e of miembros) {
        const m = crearMiembroUI(e, t);
        refsMiembro.set(e.id, m);
        r.miembros.append(m.tarjeta);
      }
      caja.append(r.tarjeta);
    }
    $("ij-eq-vacio").hidden = estado.equipos.length > 0;
  }

  // Los textos que dependen de otros datos: el conteo, los problemas, qué botones valen.
  function actualizarEquipos(porId) {
    for (const t of estado.equipos) {
      const r = refsEq.get(t.id);
      if (!r) continue;
      const ep = I.estadoDelEquipo(estado, t);
      const miembros = estado.estudiantes.filter((e) => e.equipoId === t.id);
      const ids = new Set(miembros.map((e) => e.id));
      const sinLlenar = miembros.filter((e) => !e.nombre.trim() && !e.nacimiento && !e.documento.trim()).length;
      const fa = I.faltantes(miembros);
      r.faltan.textContent = fa.length ? "Faltan: " + fa.map((x) => x.texto).join(", ") + "." : "";
      r.irPrimero.hidden = !fa.length;
      r.titulo.textContent = nombreEquipo(t);
      r.quitar.setAttribute("aria-label", "Quitar el " + nombreEquipo(t).toLowerCase());
      const lleno = ep.caben === 0;
      r.mas.setAttribute("aria-disabled", String(lleno));
      r.mas.classList.toggle("ij-apagado", lleno);
      r.mas.setAttribute("aria-describedby", r.resumen.id);
      r.resumen.textContent = ep.integrantes + " de " + I.TOPE_EQUIPO + " integrantes · " + plural(ep.titulares, "titular", "titulares") + (ep.suplentes ? " · 1 suplente" : "")
        + (lleno ? ". El equipo está completo: no caben más (art. 66.1.g)." : ".")
        + (sinLlenar ? " " + plural(sinLlenar, "lugar sin llenar", "lugares sin llenar") + "." : "");
      // Los problemas que tocan a varios del equipo se dicen una vez, arriba.
      const vistos = new Set();
      const delEquipo = [];
      for (const e of miembros) for (const p of porId.get(e.id) || []) {
        if (p.ids.length > 1 && p.ids.every((x) => ids.has(x)) && !vistos.has(p)) { vistos.add(p); delEquipo.push(p); }
      }
      r.problemas.textContent = "";
      for (const p of delEquipo) r.problemas.append(el("li", { clase: "ij-hallazgo ij-" + p.nivel }, el("strong", { clase: "ij-etiqueta", texto: p.nivel === "error" ? "Error:" : "Aviso:" }), " " + p.texto + (p.art ? " (" + p.art + ")" : "")));
      const errores = delEquipo.filter((p) => p.nivel === "error").length + miembros.reduce((s, e) => s + (porId.get(e.id) || []).filter((p) => p.nivel === "error" && p.ids.length === 1).length, 0);
      const avisos = delEquipo.length - delEquipo.filter((p) => p.nivel === "error").length;
      const pendiente = sinLlenar > 0 || ep.integrantes - sinLlenar < I.MIN_EQUIPO;
      r.estadoTxt.textContent = errores ? plural(errores, "error por corregir", "errores por corregir") : avisos || pendiente ? (sinLlenar ? "Faltan datos" : "Con avisos") : "Listo";
      r.estadoTxt.dataset.estado = errores ? "error" : avisos || pendiente ? "aviso" : "ok";
      r.tarjeta.dataset.estado = r.estadoTxt.dataset.estado;
      // Los individuales que podrían pasar a este equipo.
      const solos = estado.estudiantes.filter((e) => !e.equipoId && e.nombre.trim());
      opcionesDe(r.pasar, [{ valor: "", texto: solos.length ? "— Elige a quién —" : "No hay estudiantes individuales con nombre" }].concat(solos.map((e) => ({ valor: e.id, texto: e.nombre.trim() }))), "");
      r.pasar.disabled = lleno || !solos.length;

      miembros.forEach((e, n) => {
        const m = refsMiembro.get(e.id);
        if (!m) return;
        m.titulo.textContent = (e.suplente ? "Suplente" : "Titular") + ": " + (e.nombre.trim() || "integrante " + (n + 1));
        m.quitar.setAttribute("aria-label", "Quitar a " + (e.nombre.trim() || "el integrante " + (n + 1)) + " del equipo");
        m.sacar.setAttribute("aria-label", "Pasar a " + (e.nombre.trim() || "el integrante " + (n + 1)) + " a individual");
        const propios = (porId.get(e.id) || []).filter((p) => p.ids.length === 1);
        m.problemas.textContent = "";
        for (const p of propios) m.problemas.append(el("li", { clase: "ij-hallazgo ij-" + p.nivel }, el("strong", { clase: "ij-etiqueta", texto: p.nivel === "error" ? "Error:" : "Aviso:" }), " " + p.texto + (p.art ? " (" + p.art + ")" : "")));
        const err = propios.filter((p) => p.nivel === "error").length;
        m.estadoTxt.textContent = err ? plural(err, "error", "errores") : propios.length ? "Con avisos" : e.nombre.trim() ? "Listo" : "Sin llenar";
        m.estadoTxt.dataset.estado = err ? "error" : propios.length || !e.nombre.trim() ? "aviso" : "ok";
        const ops = G.categoriasDeNacimiento(I.anioDe(e.nacimiento), estado.anio);
        m.sube.textContent = ops.length && I.puedeJugarEn(ops, t.categoria) === "sube" ? "Sube de categoría (art. 18)" : "";
        m.sexo.value = t.torneo === "w" ? "w" : e.sexo;
        m.condicion.value = e.suplente ? "s" : "t";
      });
    }
  }

  // ------------------------------------------------------------- traer y pegar
  function abrirCaja(idCaja, idBoton, abrir) {
    $(idCaja).hidden = !abrir;
    if (idBoton) $(idBoton).setAttribute("aria-expanded", String(abrir));
  }
  const clavePersona = (s) => I.claveBusqueda(s);
  function prepararTraer() {
    const c = centroDelBanco();
    const lista = $("ij-traer-lista");
    lista.textContent = "";
    const yaEstan = new Set(estado.estudiantes.map((e) => clavePersona(e.nombre)));
    const candidatos = c ? (banco.estudiantes.get(c.idx) || []).filter((x) => !yaEstan.has(clavePersona(x.nombre))) : [];
    if (!candidatos.length) lista.append(el("p", { clase: "ij-ayuda", texto: "No hay más estudiantes de este colegio en el banco, o ya los agregaste todos." }));
    candidatos.forEach((x, i) => {
      const caja = el("input", { type: "checkbox", id: "ij-traer-" + i, value: String(i) });
      lista.append(el("label", { clase: "ij-casilla ij-traer-fila", para: "ij-traer-" + i }, caja, " " + x.nombre + " (" + x.ultimo + ")"));
    });
    lista._candidatos = candidatos;
  }
  // Agrega una lista a la inscripción sin pasarse de lo permitido: cada persona entra
  // si cabe (individual o en su equipo) y las que no caben se dicen con su motivo.
  // «Traer de un borrador anterior (.json)»: los estudiantes de otra inscripción (la del año
  // pasado, bajada con «Bajar el borrador») se ofrecen con todos sus datos y se agregan
  // sin reemplazar nada. Los que jugaban en un equipo vuelven a un equipo; la categoría se
  // calcula de nuevo si el año cambió.
  const ant = { lista: [], anio: 0 };
  async function leerAnterior(archivo) {
    if (!archivo) return;
    if (archivo.size > 5 * 1024 * 1024) { avisar("Ese archivo es demasiado grande para ser un borrador.", "error"); return; }
    let otro;
    try {
      const datos = JSON.parse(await archivo.text());
      if (!datos || datos.formato !== "inscripcion-jde") throw new Error("no es un borrador de esta herramienta");
      otro = I.normalizar(datos);
    } catch (err) { avisar("No se pudo abrir el borrador: " + err.message, "error"); return; }
    const yaEstan = new Set(estado.estudiantes.map((e) => clavePersona(e.nombre)));
    ant.anio = otro.anio;
    ant.lista = otro.estudiantes.filter((e) => e.nombre.trim() && !yaEstan.has(clavePersona(e.nombre))).map((e) => ({ e, equipo: I.equipoDe(e, otro) }));
    const lista = $("ij-ant-lista");
    lista.textContent = "";
    if (!ant.lista.length) lista.append(el("p", { clase: "ij-ayuda", texto: "Ese borrador no tiene estudiantes que no estén ya aquí." }));
    ant.lista.forEach((x, i) => {
      const donde = x.equipo ? "equipo " + I.NOMBRE_TORNEO[x.equipo.torneo] + " " + x.equipo.categoria : "individual";
      lista.append(el("label", { clase: "ij-casilla ij-traer-fila", para: "ij-ant-" + i }, el("input", { type: "checkbox", id: "ij-ant-" + i, value: String(i), checked: true }), " " + x.e.nombre + " (" + donde + ")"));
    });
    abrirCaja("ij-ant-caja", null, true);
  }
  function agregarDeAnterior() {
    const marcados = [...$("ij-ant-lista").querySelectorAll("input:checked")].map((i) => ant.lista[Number(i.value)]).filter(Boolean);
    if (!marcados.length) { avisar("Marca al menos un estudiante.", "info"); return; }
    const mismoAnio = ant.anio === estado.anio;
    const nuevos = marcados.map(({ e, equipo }) => {
      const n = I.estudianteNuevo({ nombre: e.nombre, sexo: e.sexo, nacimiento: e.nacimiento, documento: e.documento, docTipo: e.docTipo, apoyo: e.apoyo, torneo: equipo ? "" : e.torneo, categoria: equipo || !mismoAnio ? "" : e.categoria });
      n.destino = { equipo: !!equipo, torneo: equipo ? equipo.torneo : "m", categoria: equipo && mismoAnio ? equipo.categoria : "" };
      return n;
    });
    const n = agregarEstudiantes(nuevos);
    abrirCaja("ij-ant-caja", null, false);
    avisar("Se agregaron " + plural(n, "estudiante", "estudiantes") + " del borrador anterior." + (mismoAnio ? "" : " La categoría se calculó con el año " + estado.anio + ": revísala."));
  }

  function agregarEstudiantes(nuevos) {
    const sitio = Math.max(MAX_ESTUDIANTES - estado.estudiantes.length, 0);
    if (nuevos.length > sitio) { avisar("Caben " + MAX_ESTUDIANTES + " estudiantes por inscripción: se intentaron los primeros " + sitio + ".", "info"); nuevos = nuevos.slice(0, sitio); }
    const res = I.agregarLista(estado, nuevos);
    repintarTodo();
    cambio();
    if (res.rechazados.length) {
      const muestra = res.rechazados.slice(0, 3).map((x) => x.nombre + ": " + x.motivo).join(" · ");
      avisar("No se agregaron " + plural(res.rechazados.length, "estudiante", "estudiantes") + " porque no cabían: " + muestra + (res.rechazados.length > 3 ? " …" : ""), "error");
    }
    return res.agregados.length;
  }

  // ------------------------------------------------------------------- revisión
  let ultima = null;
  function pintarRevision(r) {
    const lista = $("ij-rev");
    lista.textContent = "";
    const orden = { error: 0, aviso: 1, info: 2 };
    const ETIQUETA = { error: "Error:", aviso: "Aviso:", info: "Dato:" };
    const todos = r.hallazgos.slice().sort((a, b) => orden[a.nivel] - orden[b.nivel]);
    for (const h of todos) lista.append(el("li", { clase: "ij-hallazgo ij-" + h.nivel }, el("strong", { clase: "ij-etiqueta", texto: ETIQUETA[h.nivel] }), el("span", { texto: " " + h.texto + (h.art ? " (" + h.art + ")" : "") })));
    const texto = !estado.estudiantes.length ? "Cuando agregues estudiantes, aquí se revisa todo contra la Normativa."
      : r.errores ? "Hay " + plural(r.errores, "error", "errores") + " por corregir antes de inscribir" + (r.avisos ? " y " + plural(r.avisos, "aviso", "avisos") + " para mirar." : ".")
      : "Sin errores: tu inscripción cumple lo que revisa esta herramienta" + (r.avisos ? ", con " + plural(r.avisos, "aviso", "avisos") + " para mirar." : ".");
    $("ij-rev-estado").textContent = texto;
  }

  function pintarResumen(r) {
    const cuerpo = $("ij-res").querySelector("tbody");
    cuerpo.textContent = "";
    const filas = I.resumen(estado);
    if (!filas.length) cuerpo.append(el("tr", {}, el("td", { colSpan: 5, clase: "ij-ayuda", texto: "Sin estudiantes con categoría todavía." })));
    for (const f of filas) cuerpo.append(el("tr", {}, el("th", { scope: "row", texto: "Categoría " + f.categoria }), ...[f.indMujeres, f.indAbierto, f.eqMujeres, f.eqAbierto].map((n) => el("td", { clase: "ae-n", texto: String(n) }))));
  }

  function pintarCifras(r) {
    const con = estado.estudiantes.filter((e) => e.nombre.trim());
    $("ij-c1").textContent = String(con.length);
    $("ij-c1-nota").textContent = con.length ? plural(con.filter((e) => e.sexo === "w").length, "mujer", "mujeres") + " · " + plural(con.filter((e) => e.sexo === "m").length, "hombre", "hombres") : "todavía no hay ninguno";
    $("ij-c2").textContent = String(estado.equipos.length);
    $("ij-c3").textContent = String(r.errores);
    $("ij-c3-nota").textContent = r.errores ? "errores que impiden inscribir" : "nada que impida inscribir";
    $("ij-c4").textContent = String(r.avisos);
  }

  // ------------------------------------------------- lo que falta y las ideas
  // Lleva a quien escribe al control donde falta algo: un control de la página, el
  // primer estudiante al que le falta ese dato o el botón de agregar de un equipo.
  function irA(p) {
    let ctl = null;
    if (p.control === "ij-cuerpo") {
      const persona = estado.cuerpo.find((x) => x.rol === (p.clave === "tecnico" ? "tecnico" : "jefe") && !x.nombre.trim()) || estado.cuerpo.find((x) => x.rol === (p.clave === "tecnico" ? "tecnico" : "jefe"));
      ctl = persona ? $("ij-p-" + persona.id + "-n") : $("ij-cuerpo-mas");
    } else if (p.control) ctl = $(p.control);
    else if (p.equipo) ctl = refsEq.get(p.equipo) && refsEq.get(p.equipo).mas;
    else if (p.campo) { const r = refsMiembro.get(p.ids[0]) || refsEst.get(p.ids[0]); ctl = r && $(r.id + "-" + p.campo); }
    if (!ctl) return;
    ctl.scrollIntoView({ block: "center" });
    ctl.focus();
  }

  function pintarPendientes() {
    const lista = $("ij-pend");
    lista.textContent = "";
    const todas = I.pendientes(estado);
    for (const p of todas) {
      const ir = el("button", { type: "button", clase: "ae-boton", texto: "Ir", "aria-label": "Ir a: " + p.texto });
      ir.addEventListener("click", () => irA(Object.assign({ clave: p.clave }, p)));
      lista.append(el("li", { clase: "ij-pendiente" }, el("span", { texto: p.texto }), ir));
    }
    $("ij-pend-estado").textContent = todas.length ? plural(todas.length, "cosa por hacer", "cosas por hacer") + " para dejar la inscripción lista." : "No falta nada: revisa abajo lo que dice la Normativa y baja tu nómina.";
  }
  function pintarSugerencias() {
    const ideas = I.sugerencias(estado);
    $("ij-sug-caja").hidden = !ideas.length;
    const lista = $("ij-sug");
    lista.textContent = "";
    for (const t of ideas) lista.append(el("li", { texto: t }));
  }

  function refrescar() {
    const r = I.revisar(estado, window.HoraCR.hoy());
    ultima = r;
    const porId = new Map();
    for (const h of r.hallazgos) for (const id of h.ids) { if (!porId.has(id)) porId.set(id, []); porId.get(id).push(h); }
    actualizarCentro();
    llenarNombres();
    pintarNormaCategorias();
    llenarCategoriasEquipo();
    actualizarEquipos(porId);
    actualizarTarjetas(porId);
    pintarRevision(r);
    pintarPendientes();
    pintarSugerencias();
    pintarResumen(r);
    pintarCifras(r);
    return r;
  }
  function cambio() { refrescar(); guardarPronto(); }

  // ------------------------------------------------------------------- archivos
  const slug = (s) => sinTildes(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "centro";
  function nombreArchivo(ext) { return "inscripcion-jde-" + estado.anio + "-" + slug(estado.centro.nombre) + "." + ext; }

  async function seguirAunqueHayaErrores(que, verbo, asi) {
    verbo = verbo || "bajar";
    const r = ultima || refrescar();
    if (!estado.estudiantes.some((e) => e.nombre.trim())) { avisar("Agrega al menos un estudiante antes de " + verbo + " " + que + ".", "error"); return false; }
    if (!r.errores) return true;
    return window.Avisos.confirmar("Todavía hay " + plural(r.errores, "error", "errores") + " por corregir. ¿Quieres " + verbo + " " + que + " de todos modos?", { aceptar: asi || "Bajarlo así", cancelar: "Seguir corrigiendo" });
  }

  async function bajarExcel() {
    if (!(await seguirAunqueHayaErrores("el Excel"))) return;
    const c = estado.centro;
    const etapa = (I.ETAPAS.find((x) => x.id === estado.etapa) || {}).nombre;
    window.TablaExcel.bajar(nombreArchivo("xlsx"), [
      { nombre: "Inscripción", filas: [I.ENCABEZADOS].concat(I.filasExcel(estado)) },
      { nombre: "Equipos", filas: [I.ENCABEZADOS_EQUIPOS].concat(I.filasEquipos(estado)) },
      { nombre: "Cuerpo técnico", filas: [["Nombre", "Cargo", "Sexo", "Persona funcionaria", "Teléfono"]].concat(estado.cuerpo.filter((p) => p.nombre.trim()).map((p) => [p.nombre.trim(), p.rol === "jefe" ? "Jefatura de delegación" : "Cuerpo técnico", p.sexo === "w" ? "MUJER" : p.sexo === "m" ? "HOMBRE" : "", p.funcionario ? "Sí" : "No", p.telefono])) },
      { nombre: "Delegación", filas: [["Dato", "Valor"], ["Año de los JDE", String(estado.anio)], ["Etapa", etapa || ""], ["Centro educativo", c.nombre], ["Dirección Regional", c.region], ["Circuito", c.circuito], ["Correo", c.correo], ["Teléfono", c.telefono], ["Centros unidos (art. 19)", c.union.activa ? c.union.centros : ""]] },
    ]);
    $("ij-sal-estado").textContent = "Excel armado. Ábrelo en Pareo Integral con «Subir una lista» o llévalo a tu reunión de coordinación.";
  }

  // «Abrir en Pareo Integral»: las mismas filas del Excel pasan a Pareo por el
  // almacenamiento del navegador (las dos páginas son del mismo sitio), sin bajar nada ni
  // mandar nada a ningún servidor. Pareo las lee una vez y las borra.
  async function abrirEnPareo() {
    if (!(await seguirAunqueHayaErrores("la lista en Pareo Integral", "abrir", "Abrirla así"))) return;
    const carga = { nombre: nombreArchivo("xlsx"), filas: [I.ENCABEZADOS].concat(I.filasExcel(estado)), hora: Date.now() };
    try { localStorage.setItem(CLAVE_PARA_PAREO, JSON.stringify(carga)); } catch (e) {
      avisar("Este navegador no deja pasar la lista a Pareo Integral: baja el Excel y súbelo allá con «Subir una lista».", "error");
      return;
    }
    location.href = "pareo.html#desde=inscripcion-jde";
  }

  function documentoPdf(r) {
    const c = estado.centro;
    const etapa = (I.ETAPAS.find((x) => x.id === estado.etapa) || {}).nombre;
    const inter = I.interregionalDe(c.region);
    const bloques = [];
    bloques.push({ tipo: "titulo", texto: "Delegación" });
    bloques.push({ tipo: "tabla", encabezados: ["Dato", "Valor"], anchos: [2, 5], filas: [
      ["Centro educativo", c.nombre], ["Dirección Regional", c.region ? "DRE " + c.region : ""], ["Interregional", inter ? inter.nombre : ""],
      ["Circuito", c.circuito], ["Correo", c.correo], ["Teléfono", c.telefono], ["Etapa", "Etapa " + etapa],
    ].concat(c.union.activa ? [["Centros unidos (art. 19)", c.union.centros + (c.union.matricula ? " — matrícula total " + c.union.matricula : "")]] : []) });
    const cuerpo = estado.cuerpo.filter((p) => p.nombre.trim());
    bloques.push({ tipo: "titulo", texto: "Jefatura de delegación y cuerpo técnico" });
    bloques.push(cuerpo.length
      ? { tipo: "tabla", encabezados: ["Nombre", "Cargo", "Sexo", "Funcionaria", "Teléfono"], anchos: [4, 3, 1.5, 1.6, 2], filas: cuerpo.map((p) => [p.nombre.trim(), p.rol === "jefe" ? "Jefatura de delegación" : "Cuerpo técnico", p.sexo === "w" ? "Mujer" : p.sexo === "m" ? "Hombre" : "", p.funcionario ? "Sí" : "No", p.telefono]) }
      : { tipo: "nota", texto: "Sin personas inscritas todavía." });

    // Los individuales por categoría y torneo; los equipos como los arma la revisión.
    const fila = (j, n, extra) => [String(n + 1), j.nombre, j.sexo === "w" ? "Mujer" : j.sexo === "m" ? "Hombre" : "", fechaCorta(j.nacimiento), j.documento || ""].concat(extra);
    const individuales = new Map();
    for (const e of estado.estudiantes) {
      if (e.equipoId || !e.nombre.trim()) continue;
      const k = (I.categoriaEfectiva(e, estado) || "?") + "|" + I.torneoEfectivo(e, estado);
      if (!individuales.has(k)) individuales.set(k, []);
      individuales.get(k).push(e);
    }
    bloques.push({ tipo: "titulo", texto: "Torneo individual" });
    if (!individuales.size) bloques.push({ tipo: "nota", texto: "Sin estudiantes en individual." });
    for (const k of [...individuales.keys()].sort()) {
      const [cat, t] = k.split("|");
      bloques.push({ tipo: "subtitulo", texto: "Individual " + I.NOMBRE_TORNEO[t] + " · categoría " + cat });
      bloques.push({ tipo: "tabla", encabezados: ["N.°", "Nombre", "Sexo", "Nacimiento", "Documento", "Apoyos"], anchos: [0.8, 5, 1.4, 2, 2.6, 1.2],
        filas: individuales.get(k).map((e, n) => fila({ nombre: e.nombre.trim(), sexo: e.sexo, nacimiento: e.nacimiento, documento: e.documento }, n, [e.apoyo ? "Sí" : ""])) });
    }
    bloques.push({ tipo: "titulo", texto: "Torneo por equipos" });
    if (!r.equipos.length) bloques.push({ tipo: "nota", texto: "Sin equipos." });
    for (const q of r.equipos) {
      bloques.push({ tipo: "subtitulo", texto: "Equipo " + I.NOMBRE_TORNEO[q.torneo] + " · categoría " + q.categoria + (q.numero > 1 ? " (equipo " + q.numero + ")" : "") + " — " + plural(q.integrantes.length, "integrante", "integrantes") });
      bloques.push({ tipo: "tabla", encabezados: ["N.°", "Nombre", "Sexo", "Nacimiento", "Documento", "Condición"], anchos: [0.8, 5, 1.4, 2, 2.6, 1.8],
        filas: q.integrantes.map((j, n) => fila(j, n, [j.suplente ? "Suplente" : "Titular"])) });
    }
    if (r.errores) bloques.push({ tipo: "nota", texto: "Esta nómina todavía tiene " + plural(r.errores, "error", "errores") + " por corregir según la revisión de la herramienta." });
    bloques.push({ tipo: "separador" });
    bloques.push({ tipo: "nota", texto: "Esta nómina sirve para preparar y revisar la inscripción; no reemplaza la Boleta de Inscripción Oficial que emite la Plataforma de los Juegos Deportivos Estudiantiles (art. 59). El orden de los tableros de los equipos se da en el Congresillo Técnico. Está prohibido solicitar o cobrar dinero por la inscripción (art. 16)." });
    bloques.push({ tipo: "parrafo", texto: " " });
    bloques.push({ tipo: "parrafo", texto: "______________________________          ______________________________" });
    bloques.push({ tipo: "nota", texto: "Persona jefa de delegación                                          Jefatura del centro educativo (firma y sello)" });
    return {
      titulo: "Nómina de inscripción — Ajedrez, JDE " + estado.anio,
      subtitulo: [c.nombre, c.region ? "DRE " + c.region : "", "Etapa " + etapa, window.HoraCR.fecha(new Date())].filter(Boolean).join(" · "),
      pie: "Inscripción de ajedrez para los JDE · Ajedrez Integral", autor: "Ajedrez Integral", bloques, fotos: [],
    };
  }

  async function bajarPdf() {
    if (!(await seguirAunqueHayaErrores("la nómina"))) return;
    try {
      const blob = await window.ReportePDF.generar(documentoPdf(ultima || refrescar()));
      const url = URL.createObjectURL(blob);
      const enlace = el("a", { href: url, download: nombreArchivo("pdf") });
      document.body.append(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      $("ij-sal-estado").textContent = "Nómina armada: imprímela, fírmala y llévala con la Boleta Oficial.";
    } catch (err) {
      avisar("No se pudo armar el PDF: " + (err.message || err), "error");
    }
  }

  function bajarBorrador() {
    try { localStorage.setItem(CLAVE_DESCARGA, String(Date.now())); } catch (e) { /* sin almacenamiento */ }
    guardarAhora();
    const blob = new Blob([JSON.stringify(Object.assign({ formato: "inscripcion-jde" }, estado), null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const enlace = el("a", { href: url, download: nombreArchivo("json") });
    document.body.append(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function reemplazarEstado(nuevo) {
    estado = nuevo;
    if (!estado.cuerpo.length) estado.cuerpo.push(I.personaNueva({ rol: "jefe" }), I.personaNueva({ rol: "tecnico" }));
    cerrarLista();
    iniciarCentro();
    pintarCuerpo();
    repintarTodo();
    cambio();
  }

  async function abrirBorrador(archivo) {
    if (!archivo) return;
    if (archivo.size > 5 * 1024 * 1024) { avisar("Ese archivo es demasiado grande para ser un borrador.", "error"); return; }
    let nuevo;
    try {
      const datos = JSON.parse(await archivo.text());
      if (!datos || datos.formato !== "inscripcion-jde") throw new Error("no es un borrador de esta herramienta");
      nuevo = I.normalizar(datos);
    } catch (err) { avisar("No se pudo abrir el borrador: " + err.message, "error"); return; }
    if (estado.estudiantes.length || estado.centro.nombre) {
      if (!(await window.Avisos.confirmar("Abrir el borrador reemplaza lo que tienes ahora en pantalla. ¿Seguimos?", { aceptar: "Reemplazar", cancelar: "Cancelar", peligro: true }))) return;
    }
    reemplazarEstado(nuevo);
    avisar("Borrador abierto: " + plural(nuevo.estudiantes.length, "estudiante", "estudiantes") + ".");
  }

  async function empezarDeCero() {
    if (estado.estudiantes.length || estado.centro.nombre) {
      if (!(await window.Avisos.confirmar("Se borra la inscripción que tienes en este navegador. Si quieres conservarla, baja antes el borrador. ¿Empezamos de cero?", { aceptar: "Sí, borrar todo", cancelar: "Cancelar", peligro: true }))) return;
    }
    try { localStorage.removeItem(CLAVE_BORRADOR); } catch (e) { /* sin almacenamiento */ }
    reemplazarEstado(I.estadoNuevo());
  }

  async function leerArchivoLista(archivo) {
    if (!archivo) return;
    if (archivo.size > 5 * 1024 * 1024) { avisar("Ese archivo es demasiado grande.", "error"); return; }
    try {
      const filas = (await window.ReporteExcel.leer(archivo)).filas;
      const nuevos = I.leerLista(filas);
      if (!nuevos.length) { avisar("No encontré estudiantes en ese archivo: revisa que tenga una columna «Nombre».", "error"); return; }
      const n = agregarEstudiantes(nuevos);
      avisar("Se agregaron " + plural(n, "estudiante", "estudiantes") + ". Revisa el sexo y la fecha de nacimiento de cada uno.");
    } catch (err) { avisar("No se pudo leer el archivo: " + (err.message || err), "error"); }
  }

  // «Crear el equipo»: el equipo con cuatro lugares de titulares vacíos. Si el centro ya
  // tiene los equipos que permite la Normativa en esa categoría y torneo, no se crea.
  function crearEquipoDesdeFormulario() {
    const estadoTxt = $("ij-eq-estado");
    const cat = $("ij-eq-categoria").value;
    const torneo = $("ij-eq-torneo").value === "w" ? "w" : "m";
    if (estado.estudiantes.length + 4 > MAX_ESTUDIANTES) { estadoTxt.textContent = "Caben " + MAX_ESTUDIANTES + " estudiantes por inscripción."; return; }
    const res = I.crearEquipo(estado, cat, torneo);
    if (!res.ok) { estadoTxt.textContent = res.motivos[0]; avisar(res.motivos[0], "error"); return; }
    for (let i = 0; i < 4; i++) I.agregarIntegrante(estado, res.resultado.id, {});
    estadoTxt.textContent = "Se creó: " + nombreEquipo(res.resultado) + ", con cuatro lugares de titulares.";
    pintarEquipos();
    cambio();
    const m = estado.estudiantes.find((e) => e.equipoId === res.resultado.id);
    if (m && refsMiembro.get(m.id)) refsMiembro.get(m.id).nombre.focus();
  }

  // ----------------------------------------------------------------------- inicio
  function enlazarBotones() {
    $("ij-cuerpo-mas").addEventListener("click", () => {
      if (estado.cuerpo.length >= MAX_CUERPO) { avisar("Caben " + MAX_CUERPO + " personas en el cuerpo técnico.", "info"); return; }
      estado.cuerpo.push(I.personaNueva());
      pintarCuerpo();
      cambio();
      const campos = $("ij-cuerpo").querySelectorAll("input[type=text]");
      if (campos.length) campos[campos.length - 1].focus();
    });
    $("ij-est-mas").addEventListener("click", () => {
      if (estado.estudiantes.length >= MAX_ESTUDIANTES) { avisar("Caben " + MAX_ESTUDIANTES + " estudiantes por inscripción.", "info"); return; }
      const e = I.estudianteNuevo();
      estado.estudiantes.push(e);
      pintarEstudiantes();
      cambio();
      refsEst.get(e.id).nombre.focus();
    });
    $("ij-traer").addEventListener("click", () => {
      const abrir = $("ij-traer-caja").hidden;
      if (abrir) prepararTraer();
      abrirCaja("ij-traer-caja", "ij-traer", abrir);
    });
    $("ij-traer-cerrar").addEventListener("click", () => { abrirCaja("ij-traer-caja", "ij-traer", false); $("ij-traer").focus(); });
    $("ij-traer-agregar").addEventListener("click", () => {
      const lista = $("ij-traer-lista");
      const marcados = [...lista.querySelectorAll("input:checked")].map((i) => lista._candidatos[Number(i.value)]).filter(Boolean);
      if (!marcados.length) { avisar("Marca al menos un estudiante.", "info"); return; }
      const n = agregarEstudiantes(marcados.map((x) => I.estudianteNuevo({ nombre: x.nombre, sexo: x.sexo })));
      abrirCaja("ij-traer-caja", "ij-traer", false);
      avisar("Se agregaron " + plural(n, "estudiante", "estudiantes") + ". Faltan su fecha de nacimiento, el sexo de quienes no lo tienen y su documento.");
    });
    $("ij-pegar").addEventListener("click", () => abrirCaja("ij-pegar-caja", "ij-pegar", $("ij-pegar-caja").hidden));
    $("ij-pegar-cerrar").addEventListener("click", () => { abrirCaja("ij-pegar-caja", "ij-pegar", false); $("ij-pegar").focus(); });
    $("ij-pegar-agregar").addEventListener("click", () => {
      const nuevos = I.leerLista($("ij-pegar-texto").value);
      if (!nuevos.length) { avisar("No encontré estudiantes en lo que pegaste: una fila por estudiante, con el nombre primero.", "error"); return; }
      const n = agregarEstudiantes(nuevos);
      $("ij-pegar-texto").value = "";
      abrirCaja("ij-pegar-caja", "ij-pegar", false);
      avisar("Se agregaron " + plural(n, "estudiante", "estudiantes") + ". Revisa el sexo y la fecha de nacimiento de cada uno.");
    });
    $("ij-pegar-archivo").addEventListener("change", async (ev) => { await leerArchivoLista(ev.target.files[0]); ev.target.value = ""; abrirCaja("ij-pegar-caja", "ij-pegar", false); });
    $("ij-anterior-archivo").addEventListener("change", async (ev) => { await leerAnterior(ev.target.files[0]); ev.target.value = ""; });
    $("ij-ant-agregar").addEventListener("click", agregarDeAnterior);
    $("ij-ant-todos").addEventListener("click", () => $("ij-ant-lista").querySelectorAll("input").forEach((i) => { i.checked = true; }));
    $("ij-ant-cerrar").addEventListener("click", () => abrirCaja("ij-ant-caja", null, false));
    $("ij-pareo").addEventListener("click", abrirEnPareo);
    $("ij-excel").addEventListener("click", bajarExcel);
    $("ij-pdf").addEventListener("click", bajarPdf);
    $("ij-bajar-borrador").addEventListener("click", bajarBorrador);
    $("ij-abrir-borrador").addEventListener("change", async (ev) => { await abrirBorrador(ev.target.files[0]); ev.target.value = ""; });
    $("ij-empezar").addEventListener("click", empezarDeCero);
  }

  // Los rangos de la Normativa del año de esta inscripción. Los de un año sin Normativa
  // publicada son los de 2026 corridos un año (`G.rangoCategoria`) y la página lo dice.
  let anioNorma = 0;
  function pintarNormaCategorias() {
    if (anioNorma === estado.anio) return;
    anioNorma = estado.anio;
    const ul = $("ij-norma-categorias");
    ul.textContent = "";
    for (const c of ["A", "B", "C", "D", "E"]) {
      const r = G.rangoCategoria(c, estado.anio);
      ul.append(el("li", { texto: "Categoría " + I.NOMBRE_CATEGORIA[c] + ": " + (r[0] == null ? "nacidos en " + r[1] + " o antes" : "nacidos de " + r[0] + " a " + r[1]) + "." }));
    }
    const dudosos = [];
    for (let a = estado.anio - 22; a <= estado.anio - 3; a++) if (G.categoriasDeNacimiento(a, estado.anio).length > 1) dudosos.push(a);
    if (dudosos.length) ul.append(el("li", { texto: "Por eso quien nació en " + dudosos.join(" o ") + " es de la B si estudia en escuela y de la C si estudia en colegio." }));
    ul.append(el("li", { texto: "En los eventos por equipos (no en individual) pueden subir a la categoría siguiente hasta tres estudiantes por equipo: de A a B, de C a D y de D a E. Un centro que se une a otros (art. 19) no puede subir de categoría." }));
    if (estado.anio !== G.JDE_ANIO_NORMATIVA) ul.append(el("li", { clase: "font-semibold", texto: "Estos rangos de " + estado.anio + " son los de la Normativa " + G.JDE_ANIO_NORMATIVA + " corridos un año: confírmalos cuando se publique la Normativa de " + estado.anio + "." }));
  }

  function iniciar() {
    enlazarCentro();
    enlazarBotones();
    pintarNormaCategorias();
    iniciarCentro();
    pintarCuerpo();
    $("ij-eq-crear").addEventListener("click", crearEquipoDesdeFormulario);
    repintarTodo();
    refrescar();
    cargarBanco();
  }
  iniciar();
})();
