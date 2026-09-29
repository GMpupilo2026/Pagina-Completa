/* Las compras registradas de tienda.html: quién compró qué.

   Es lo que abre el candado de cada material. El worker le pregunta a la base
   `puede_bajar(producto)` antes de servir cursos/recursos/<producto>/ o
   material/<producto>/, y la base mira compras_tienda. Esta pantalla solo
   escribe esa tabla, y ni siquiera directo: la tabla no tiene política de
   escritura y la escribe registrar_compra(), que rechaza a quien no
   administra. Que la pantalla solo la vea administración es un filtro de
   pintado; el permiso de verdad está en la función. Ver «La tienda con
   permiso por producto» en docs/decisiones/cobros-acceso-y-tienda.md.

   Todo lo que escribió una persona (nombre, correo) va por textContent. */
(function () {
  const T = window.TiendaCatalogo;
  let elegida = null;          // { id, nombre } de la persona a la que se le registra
  let buscando = 0;            // para que una búsqueda vieja no pise a la nueva

  const $ = (id) => document.getElementById(id);
  const tituloDe = (producto) => {
    const p = T.PRODUCTOS.find((x) => x.id === producto);
    return p ? p.titulo : producto;
  };
  const nombreDe = (perfil) => (perfil && (perfil.full_name || perfil.email)) || "Cuenta sin nombre";

  function pintarProductos() {
    const sel = $("compra-producto");
    sel.innerHTML = "";
    const vacia = document.createElement("option");
    vacia.value = "";
    vacia.textContent = "Elige el material";
    sel.appendChild(vacia);
    T.PRODUCTOS.forEach((p) => {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.titulo;
      sel.appendChild(o);
    });
  }

  function elegir(perfil) {
    elegida = perfil ? { id: perfil.id, nombre: nombreDe(perfil) } : null;
    $("compra-elegida").textContent = elegida
      ? "Se le registra a: " + elegida.nombre + (perfil.email && perfil.full_name ? " (" + perfil.email + ")" : "")
      : "Todavía no elegiste a nadie.";
    $("compra-resultados").classList.add("hidden");
    $("compra-resultados").innerHTML = "";
  }

  /* La búsqueda la hace la base (ilike, de a diez), no el navegador con la
     lista entera: PostgREST corta a mil filas sin avisar. Las comas y los
     paréntesis se quitan porque son la sintaxis del `or` de PostgREST: un
     nombre con coma rompería el filtro en vez de buscar. */
  async function buscar() {
    const texto = $("compra-buscar").value.replace(/[,()%*\\]/g, " ").trim();
    const turno = ++buscando;
    const lista = $("compra-resultados");
    if (texto.length < 2) { lista.classList.add("hidden"); lista.innerHTML = ""; return; }
    const { data, error } = await sb.from("profiles")
      .select("id, full_name, email")
      .or("full_name.ilike.%" + texto + "%,email.ilike.%" + texto + "%")
      .order("full_name", { ascending: true })
      .limit(10);
    if (turno !== buscando) return;
    lista.innerHTML = "";
    const filas = error ? [] : (data || []);
    if (!filas.length) {
      const li = document.createElement("li");
      li.className = "px-3 py-2 text-sm text-brand-500 dark:text-brand-300";
      li.textContent = error ? "No se pudo buscar. Prueba de nuevo." : "No hay ninguna cuenta con ese nombre o correo.";
      lista.appendChild(li);
    }
    filas.forEach((perfil) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "w-full text-left px-3 py-2 text-sm hover:bg-brand-50 dark:hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500";
      const n = document.createElement("span");
      n.className = "font-semibold text-brand-800 dark:text-white";
      n.textContent = nombreDe(perfil);
      b.appendChild(n);
      if (perfil.email && perfil.full_name) {
        const c = document.createElement("span");
        c.className = "block text-xs text-brand-500 dark:text-brand-300";
        c.textContent = perfil.email;
        b.appendChild(c);
      }
      b.addEventListener("click", () => { elegir(perfil); $("compra-producto").focus(); });
      li.appendChild(b);
      lista.appendChild(li);
    });
    lista.classList.remove("hidden");
  }

  async function pintarCompras() {
    const { data, error } = await sb.from("compras_tienda")
      .select("profile_id, producto, creado_en")
      .order("creado_en", { ascending: false })
      .range(0, 999);
    const lista = $("compras-lista");
    lista.innerHTML = "";
    const filas = error ? [] : (data || []);
    $("compras-vacia").classList.toggle("hidden", filas.length > 0);
    if (error) $("compras-vacia").textContent = "No se pudieron leer las compras. Recarga la página.";
    if (!filas.length) return;

    const ids = Array.from(new Set(filas.map((f) => f.profile_id)));
    const { data: perfiles } = await sb.from("profiles").select("id, full_name, email").in("id", ids);
    const porId = new Map((perfiles || []).map((p) => [p.id, p]));

    filas.forEach((f) => {
      const li = document.createElement("li");
      li.className = "py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm";
      const quien = document.createElement("span");
      quien.className = "font-semibold text-brand-800 dark:text-white";
      quien.textContent = nombreDe(porId.get(f.profile_id));
      const que = document.createElement("span");
      que.className = "text-brand-600 dark:text-brand-200";
      que.textContent = tituloDe(f.producto);
      const cuando = document.createElement("span");
      cuando.className = "text-xs text-brand-500 dark:text-brand-300";
      cuando.textContent = new Date(f.creado_en).toLocaleDateString("es-CR", { timeZone: "America/Costa_Rica" });
      const quitar = document.createElement("button");
      quitar.type = "button";
      quitar.className = "ml-auto text-xs font-semibold text-red-700 dark:text-red-300 underline hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 rounded";
      quitar.textContent = "Quitar la compra";
      quitar.addEventListener("click", async () => {
        const si = await Avisos.confirmar(
          nombreDe(porId.get(f.profile_id)) + " ya no va a poder abrir «" + tituloDe(f.producto) + "» (salvo que tenga otro permiso que se lo abra).",
          { titulo: "¿Quitar esta compra?", aceptar: "Quitar la compra", cancelar: "Dejarla", peligro: true });
        if (!si) return;
        const { error: e } = await sb.rpc("registrar_compra", { p_profile: f.profile_id, p_producto: f.producto, p_registrar: false });
        if (e) { Avisos.avisar("No se pudo quitar: " + e.message, { tipo: "error" }); return; }
        pintarCompras();
      });
      li.append(quien, que, cuando, quitar);
      lista.appendChild(li);
    });
  }

  async function registrar(ev) {
    ev.preventDefault();
    const producto = $("compra-producto").value;
    if (!elegida) { Avisos.avisar("Primero busca a la persona y elígela de la lista.", { tipo: "info" }); $("compra-buscar").focus(); return; }
    if (!producto) { Avisos.avisar("Elige qué material compró.", { tipo: "info" }); $("compra-producto").focus(); return; }
    const { error } = await sb.rpc("registrar_compra", { p_profile: elegida.id, p_producto: producto, p_registrar: true });
    if (error) { Avisos.avisar("No se pudo registrar: " + error.message, { tipo: "error" }); return; }
    Avisos.avisar("Listo: " + elegida.nombre + " ya puede abrir «" + tituloDe(producto) + "».");
    $("compra-buscar").value = "";
    $("compra-producto").value = "";
    elegir(null);
    pintarCompras();
  }

  function iniciar() {
    pintarProductos();
    let espera = null;
    $("compra-buscar").addEventListener("input", () => {
      elegida = null;
      $("compra-elegida").textContent = "Todavía no elegiste a nadie.";
      clearTimeout(espera);
      espera = setTimeout(buscar, 250);
    });
    $("compra-form").addEventListener("submit", registrar);
    pintarCompras();
  }

  window.TiendaCompras = { iniciar };
})();
