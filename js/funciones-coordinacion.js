/*
 * Las funciones de coordinación que el supervisor de una academia le puede
 * apagar a cada coordinador.
 *
 * La lista de claves está escrita DOS veces a la fuerza: aquí (el navegador) y
 * en public.funciones_coordinacion() (la base), que es la que manda —cada
 * política y cada función pregunta coordinador_puede('<clave>')—.
 * herramientas/verificar-academias.js falla si se separan: una clave que solo
 * existiera aquí sería una casilla que no apaga nada.
 *
 * Esto decide qué se PINTA. Si la consulta falla se dan todas por permitidas:
 * la base rechaza igual lo que no toca, y una página que esconde todo porque
 * la red falló deja a quien coordina sin trabajar por nada.
 */
(function () {
  const LISTA = [
    { clave: "formularios", titulo: "Formularios de inscripción", detalle: "Armar formularios, compartirlos y leer sus respuestas" },
    { clave: "altas",       titulo: "Dar de alta cuentas",        detalle: "Crear la cuenta de un alumno desde una respuesta de formulario" },
    { clave: "solicitudes", titulo: "Solicitudes para unirse",    detalle: "Aprobar o rechazar a quien pidió entrar a la Academia" },
    { clave: "cuentas",     titulo: "Corregir cuentas",           detalle: "Nombre, grupo, correo y profesores de cada cuenta" },
    { clave: "acceso",      titulo: "Reenviar el acceso",         detalle: "Mandar de nuevo el correo para entrar" },
    { clave: "roles",       titulo: "Cambiar el rol",             detalle: "Subir un alumno a profesor o bajar un profesor a alumno" },
    { clave: "cobros",      titulo: "Cobros",                     detalle: "Mensualidades, pagos, morosidad y avisos a las familias" },
    { clave: "equipos",     titulo: "Equipos",                    detalle: "Crear equipos y repartir sus alumnos y entrenadores" },
    { clave: "subgrupos",   titulo: "Subgrupos de los profesores", detalle: "Armarle a un profesor sus listas de alumnos" },
  ];

  // Qué página es de qué función: el panel esconde la tarjeta que no toca.
  const POR_PAGINA = {
    "formularios.html": "formularios",
    "solicitudes.html": "solicitudes",
    "cobros.html": "cobros",
  };

  let permitidas = null;

  async function cargar(sb) {
    try {
      const { data, error } = await sb.rpc("mis_funciones_coordinacion");
      if (error || !Array.isArray(data)) throw error || new Error("sin datos");
      permitidas = new Set(data);
    } catch (e) {
      console.warn("No se pudieron leer las funciones de coordinación; se muestran todas.", e);
      permitidas = new Set(LISTA.map((f) => f.clave));
    }
    return permitidas;
  }

  function puede(clave) {
    return !permitidas || permitidas.has(clave);
  }

  function permiteDestino(href) {
    const pagina = String(href || "").split("?")[0].split("/").pop();
    const clave = POR_PAGINA[pagina];
    return !clave || puede(clave);
  }

  /* El aviso de una página entera que no le toca. Dice QUIÉN se la quitó: sin
     eso, una página vacía se lee como una página rota. */
  function aviso(contenedor, clave) {
    const f = LISTA.find((x) => x.clave === clave);
    const div = document.createElement("div");
    div.className = "bg-white dark:bg-brand-900 rounded-2xl border border-brand-100 dark:border-brand-800 p-6 text-center";
    const t = document.createElement("p");
    t.className = "font-semibold text-brand-900 dark:text-white";
    t.textContent = (f ? f.titulo : "Esta sección") + " no está entre tus funciones de coordinación.";
    const d = document.createElement("p");
    d.className = "mt-2 text-sm text-brand-600 dark:text-brand-300";
    d.textContent = "Quien supervisa tu academia decide qué funciones tienes. Si la necesitas, pídesela.";
    const a = document.createElement("a");
    a.href = "clases.html";
    a.className = "inline-block mt-4 text-sm font-semibold text-accent-700 dark:text-accent-400 underline";
    a.textContent = "Volver al panel";
    div.append(t, d, a);
    contenedor.replaceChildren(div);
  }

  const api = { LISTA, POR_PAGINA, cargar, puede, permiteDestino, aviso };
  if (typeof window !== "undefined") window.FuncionesCoordinacion = api;
  if (typeof module !== "undefined") module.exports = api;
})();
