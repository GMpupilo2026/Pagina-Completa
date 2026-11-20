/* ===== El profe Oscar como rival: el bot con cara y con lengua =====
 *
 * El bot de js/bot-oscar.js juega igual que siempre; esto le pone la cara del
 * profe al lado del tablero (los dibujos de js/avatar-profe-oscar.js) y una
 * personalidad: burlón, presumido y un poco insoportable, pero sano —lo
 * juegan niños—. La receta es la de los rivales animados de los programas de
 * ajedrez de antes, con un personaje y unas frases propias:
 *
 *   - comenta lo que de verdad pasó en el tablero, no frases al azar: se burla
 *     si le regalaste material, se queja si se lo ganaste, presume su jaque y
 *     se ríe del tuyo;
 *   - cambia de gesto con cada cosa (la cara salta o se sacude) y, mientras
 *     piensa, pone cara de «mmm»;
 *   - si tardas, se aburre («Estoy esperando…», «¿Te dormiste?»);
 *   - en los niveles 1 y 2, de vez en cuando deja una pieza colgando A
 *     PROPÓSITO y lo avisa con una pista: si la tomas, te felicita; si no,
 *     te dice que había algo gratis. Es el modo «sparring»: practicar a ver
 *     el regalo, que es lo que más le cuesta a quien empieza.
 *
 * Cómo sabe qué pasó sin saber las reglas de cada modalidad: igual que el bot,
 * le pregunta al adaptador (`material()`, «cuánto vale la posición para las
 * blancas, en peones»). Se mira desde el lado del bot: si después de su
 * respuesta tiene 2,5 peones más que antes de tu jugada, le regalaste algo;
 * si tiene 2,5 menos, se lo ganaste. Menos de eso es ruido (`material()`
 * también suma la posición de las piezas) y no se comenta.
 *
 * Solo lo ven las cuentas anotadas en vistas_en_prueba con «rival_profe» (se
 * anotan desde SQL; cada quien lee solo sus filas) y, entre ellas, quien deja
 * marcada la casilla de la pantalla de elegir partida. A los demás este
 * archivo no les hace nada: bot.js llama a RivalProfe.* solo si `activo`.
 *
 * Ver «El profe Oscar como rival» en docs/decisiones/juegos-y-torneos.md.
 * Lo revisa verificar-rival-profe.js.
 */
(function () {
  "use strict";

  const UMBRAL = 2.5;           // peones: menos que esto no se comenta
  const PRIMERA_ESPERA = 30000; // ms sin jugar hasta «Estoy esperando…»
  const SEGUNDA_ESPERA = 70000; // ms hasta «¿Te dormiste?»
  const CLAVE_PREFERENCIA = "rival_profe_activo_v1";

  /* Las frases, por lo que pasó. `cara` es un id de js/avatar-profe-oscar.js
     (lo comprueba el verificador). Van en primera persona y sin adjetivos con
     género, porque el mismo texto lo dice la profe Pame en su academia. */
  const FRASES = {
    saludo: [
      { cara: "hola", texto: "¿Vienes a perder otra vez? Tranqui, voy suave… al principio." },
      { cara: "burlon", texto: "A ver qué me traes hoy." },
      { cara: "brazos-cruzados", texto: "Mueve cuando quieras. Yo ya sé cómo termina esto." },
      { cara: "risa", texto: "¡Jajaja! Qué valentía, retarme a mí." },
    ],
    regalo: [
      { cara: "risa", texto: "¡Jajaja! Gracias por el regalo." },
      { cara: "burlon", texto: "¿Esa pieza era para mí? Qué detalle." },
      { cara: "vagabundo", texto: "Tan vagabundo… la dejaste solita." },
      { cara: "pobrecillo", texto: "Pobrecillo, ni la vio venir." },
      { cara: "esa-no-es", texto: "Esa no era. Te lo digo por si acaso." },
      { cara: "risa", texto: "¡Ñam! Pieza gratis, la más rica." },
    ],
    golpe: [
      { cara: "no-puede-ser", texto: "¡No puede ser! ¿Quién te enseñó eso?" },
      { cara: "esa-vara", texto: "¿Y esa vara? No la tenía calculada." },
      { cara: "wow", texto: "Ok, ok… esa estuvo buena. No te acostumbres." },
      { cara: "mmm", texto: "Mmm… fue un descuido. Uno solo, ¿eh?" },
      { cara: "que-jugadon", texto: "¡Qué jugadón! …pero no lo voy a repetir en voz alta." },
    ],
    jaqueTuyo: [
      { cara: "atencion", texto: "¿Jaque? Uy, qué miedo… (no)." },
      { cara: "brazos-cruzados", texto: "Un jaque no es un plan, ¿eh?" },
      { cara: "burlon", texto: "¿Y después del jaque, qué?" },
    ],
    jaqueMio: [
      { cara: "te-toca", texto: "Jaque. Te toca a ti… sufrir un poquito." },
      { cara: "atencion", texto: "¡Jaque! Ojo con ese rey." },
      { cara: "burlon", texto: "Jaque. ¿Lo viste venir?" },
    ],
    charla: [
      { cara: "mmm", texto: "Mmmm… interesante. Mal, pero interesante." },
      { cara: "brazos-cruzados", texto: "Sigo esperando una jugada que me asuste." },
      { cara: "vagabundo", texto: "Esto va a estar fácil." },
      { cara: "idea", texto: "Ya tengo un plan. No te lo voy a contar." },
      { cara: "tu-puedes", texto: "¡Tú puedes! …perder más despacio." },
    ],
    esperando: [
      { cara: "brazos-cruzados", texto: "Estoy esperando… sin prisa. Bueno, con un poquito." },
      { cara: "tiempo", texto: "¿Se te acabaron las ideas?" },
    ],
    dormido: [
      { cara: "dormidos", texto: "¿Te dormiste? Despiértame cuando juegues." },
    ],
    pista: [
      { cara: "mmm", texto: "Uy… creo que algo se me escapó. ¿Lo ves?" },
      { cara: "esa-vara", texto: "Ups. Algo me quedó flojo por acá… a ver si lo encuentras." },
      { cara: "idea", texto: "Te voy a dar una oportunidad. Una sola. Búscala." },
    ],
    laViste: [
      { cara: "bien-hecho", texto: "¡Me cachaste! Bien visto: eso es mirar el tablero." },
      { cara: "muy-bien", texto: "¡Eso! Esa pieza estaba sin defender. Así se juega." },
      { cara: "excelente", texto: "La viste. Ok, hoy sí vienes despierto." },
    ],
    noLaViste: [
      { cara: "pobrecillo", texto: "Te la dejé servida y no la viste… pobrecillo." },
      { cara: "casi", texto: "¡Casi! Había una pieza gratis. Mira qué quedó sin defender." },
      { cara: "esa-no-es", texto: "Esa no era. Te había dejado algo colgando." },
    ],
    ganoYo: [
      { cara: "risa", texto: "¡Jajaja! Gané. ¿La revancha? Ya sé que sí." },
      { cara: "campeones", texto: "Campeón otra vez. El de siempre." },
      { cara: "pobrecillo", texto: "Estuvo cerca… bueno, no tanto." },
    ],
    ganasTu: [
      { cara: "no-puede-ser", texto: "¡No puede ser! Seguro me distraje." },
      { cara: "felicidades", texto: "Felicidades… esta vez. Quiero la revancha ya." },
      { cara: "wow", texto: "Ok, me ganaste. Pero no le cuentes a nadie." },
    ],
    tablas: [
      { cara: "casi", texto: "Tablas. Te salvaste por poquito." },
      { cara: "esa-vara", texto: "¿Tablas? Bueno… lo dejamos así, por hoy." },
    ],
    rendicion: [
      { cara: "pobrecillo", texto: "¿Ya te rendiste? Pobrecillo… otra, va." },
      { cara: "risa", texto: "¡Jajaja! Sabia decisión." },
    ],
  };
  // Las caras que se sacuden en vez de saltar: las de susto o enojo.
  const SACUDIDA = new Set(["no-puede-ser", "esa-vara", "wow", "dormidos"]);

  /* ── Lo que pasó en el tablero (puro, sin pantalla: lo prueba el verificador) ──
     antes: el valor para el bot ANTES de tu jugada; despues: después de su
     respuesta (los dos ya con el signo del bot: más es mejor para él). */
  function juzgarIntercambio(antes, despues) {
    const d = despues - antes;
    if (d >= UMBRAL) return "regalo";
    if (d <= -UMBRAL) return "golpe";
    return null;
  }

  /* Una jugada del bot que deja algo colgando a propósito: una que el rival
     puede castigar ganando entre 2,5 y 6 peones (una pieza menor o una torre,
     no la dama: es para practicar, no para regalar la partida). Devuelve
     { jugada, valor, queda }: `valor` es lo que le queda al bot apenas se la
     comes (para saber si la viste) y `queda`, después de su mejor respuesta; o null.
     `signo` es +1 si el bot lleva blancas y -1 si lleva negras. */
  function buscarRegalo(ad, signo, azar) {
    const ahora = signo * ad.material();
    const jugadas = (ad.jugadas() || []).slice();
    // Barajadas: si no, siempre regalaría la misma.
    for (let i = jugadas.length - 1; i > 0; i--) {
      const k = Math.floor(azar() * (i + 1));
      const t = jugadas[i]; jugadas[i] = jugadas[k]; jugadas[k] = t;
    }
    // Una pieza que se puede comer pero está defendida no es un regalo: se
    // mira también la mejor respuesta del bot a la captura (la recaptura).
    // Solo para las capturas que ganan algo de entrada, que son pocas; con
    // un tope de tiempo, porque `probar()` es lo caro (ver js/bot-oscar.js).
    const hasta = Date.now() + 300;
    for (const j of jugadas) {
      if (Date.now() > hasta) return null;
      const tras = ad.probar(j);
      if (!tras) continue;
      const respuestas = tras.jugadas() || [];
      if (!respuestas.length) continue;           // da mate o ahoga: no es regalo
      let peor = ahora, alTomarla = ahora;
      for (const r of respuestas) {
        const otra = tras.probar(r);
        if (!otra) continue;
        const tomada = signo * otra.material();
        if (ahora - tomada < UMBRAL) continue;    // no come nada que valga
        let recaptura = tomada;
        for (const b of otra.jugadas() || []) {
          const x = otra.probar(b);
          if (x) recaptura = Math.max(recaptura, signo * x.material());
        }
        if (recaptura < peor) { peor = recaptura; alTomarla = tomada; }
      }
      const pierde = ahora - peor;
      if (pierde >= UMBRAL && pierde <= 6) return { jugada: j, valor: alTomarla, queda: peor };
    }
    return null;
  }

  /* ── El estado de la partida ─────────────────────────────────────────────── */
  const estado = {
    activo: false,       // la cuenta está en la prueba
    enPartida: false,    // la casilla estaba marcada al empezar
    signo: 1,
    nivel: 2,
    valorTrasBot: 0,     // valor para el bot después de su última jugada
    jugadasBot: 0,
    ultimoRegalo: -99,   // en qué jugada del bot dejó el último regalo
    regaloPendiente: null,
    ultimaFrase: "",
    espera: [],
  };
  let azar = Math.random;

  const valorDe = (ad) => estado.signo * ad.material();

  function elegirFrase(evento) {
    const lista = FRASES[evento];
    const opciones = lista.filter((f) => f.texto !== estado.ultimaFrase);
    const f = (opciones.length ? opciones : lista)[Math.floor(azar() * (opciones.length || lista.length))];
    estado.ultimaFrase = f.texto;
    return f;
  }

  /* ── La pantalla ─────────────────────────────────────────────────────────── */
  let panel = null, imgCara = null, globo = null;

  function ruta(id) { return window.AvatarProfeOscar ? AvatarProfeOscar.ruta(id) : ""; }
  function altDe(id) { const a = window.AvatarProfeOscar && AvatarProfeOscar.porId(id); return a ? a.alt : ""; }

  function crearPanel() {
    if (panel) return;
    const juego = document.getElementById("game-view");
    const status = document.getElementById("status");
    if (!juego || !status) return;
    panel = document.createElement("div");
    panel.id = "rival-profe";
    panel.className = "rival-profe hidden flex items-center gap-3 bg-white dark:bg-brand-900 rounded-2xl shadow-md p-3 mb-3";
    imgCara = document.createElement("img");
    imgCara.className = "rival-cara";
    imgCara.width = 112; imgCara.height = 112;
    const caja = document.createElement("div");
    caja.className = "min-w-0 flex-1";
    const nombre = document.createElement("p");
    nombre.className = "text-xs font-semibold uppercase tracking-wide text-brand-500 dark:text-brand-300 mb-1";
    nombre.textContent = (window.AvatarProfeOscar && AvatarProfeOscar.PROFES[AvatarProfeOscar.PROFE].nombre) || "El profe Oscar";
    globo = document.createElement("p");
    globo.className = "rival-globo rounded-xl px-3 py-2 text-sm bg-brand-100 dark:bg-brand-800 text-brand-800 dark:text-white";
    globo.setAttribute("aria-live", "polite");
    caja.append(nombre, globo);
    panel.append(imgCara, caja);
    status.parentNode.insertBefore(panel, status);
    // Las caras se bajan desde ya, para que el cambio de gesto sea al instante.
    const ids = new Set(["mmm"]);
    Object.values(FRASES).forEach((l) => l.forEach((f) => ids.add(f.cara)));
    ids.forEach((id) => { const i = new Image(); i.src = ruta(id); });
  }

  // Reinicia una animación de CSS: quitar la clase, forzar el cálculo, ponerla.
  function animar(el, clase) {
    el.classList.remove("rival-salto", "rival-sacudida", "rival-entra");
    void el.offsetWidth;
    el.classList.add(clase);
  }

  function ponerCara(id, conAnimacion) {
    if (!imgCara) return;
    imgCara.src = ruta(id);
    imgCara.alt = altDe(id);
    imgCara.dataset.cara = id;
    if (conAnimacion) animar(imgCara, SACUDIDA.has(id) ? "rival-sacudida" : "rival-salto");
  }

  function decir(evento) {
    if (!estado.enPartida || !globo) return null;
    const f = elegirFrase(evento);
    ponerCara(f.cara, true);
    globo.textContent = f.texto;
    globo.dataset.evento = evento;
    animar(globo, "rival-entra");
    return f;
  }

  /* ── Si tardas ───────────────────────────────────────────────────────────── */
  function pararEspera() { estado.espera.forEach(clearTimeout); estado.espera = []; }
  function esperarTuJugada() {
    pararEspera();
    estado.espera.push(setTimeout(() => decir("esperando"), PRIMERA_ESPERA));
    estado.espera.push(setTimeout(() => decir("dormido"), SEGUNDA_ESPERA));
  }

  /* ── Lo que llama bot.js ─────────────────────────────────────────────────── */

  function alEmpezar(ctx, ad) {
    pararEspera();
    estado.enPartida = estado.activo && casillaMarcada();
    if (panel) panel.classList.toggle("hidden", !estado.enPartida);
    if (!estado.enPartida) return;
    estado.signo = ctx.miColor === "w" ? -1 : 1;     // el bot lleva el otro color
    estado.nivel = ctx.nivel;
    estado.jugadasBot = 0;
    estado.ultimoRegalo = -99;
    estado.regaloPendiente = null;
    estado.valorTrasBot = ad ? valorDe(ad) : 0;
    decir("saludo");
    if (ctx.empiezaHumano) esperarTuJugada();
  }

  /* Tu jugada ya está hecha en `ad`; el bot todavía no contestó. */
  function trasTuJugada(ad, texto) {
    if (!estado.enPartida) return;
    pararEspera();
    const pendiente = estado.regaloPendiente;
    estado.regaloPendiente = null;
    if (pendiente) {
      // ¿La tomaste? Si quedaste igual o mejor que tomándola, sí.
      decir(valorDe(ad) <= pendiente.valor + 0.5 ? "laViste" : "noLaViste");
      return;
    }
    if (/\+$/.test(texto || "") && azar() < 0.6) { decir("jaqueTuyo"); return; }
    ponerCara("mmm", false);   // piensa
  }

  /* La jugada que el bot iba a hacer, o un regalo a propósito (niveles 1-2). */
  function elegirJugada(ad, normal) {
    if (!estado.enPartida || estado.nivel > 2 || !normal) return normal;
    const n = estado.jugadasBot;
    if (n < 5 || n - estado.ultimoRegalo < 8 || azar() >= 0.3) return normal;
    const regalo = buscarRegalo(ad, estado.signo, azar);
    if (!regalo) return normal;
    estado.ultimoRegalo = n;
    estado.regaloPendiente = regalo;
    return regalo.jugada;
  }

  /* La jugada del bot ya está hecha en `ad`. */
  function trasSuJugada(ad, texto) {
    if (!estado.enPartida) return;
    estado.jugadasBot++;
    const antes = estado.valorTrasBot;
    const ahora = valorDe(ad);
    estado.valorTrasBot = ahora;
    if (estado.regaloPendiente) decir("pista");
    else {
      const juicio = estado.jugadasBot > 1 ? juzgarIntercambio(antes, ahora) : null;
      if (juicio) decir(juicio);
      else if (/\+$/.test(texto || "")) decir("jaqueMio");
      else if (azar() < 0.18) decir("charla");
      else if (imgCara && imgCara.dataset.cara === "mmm") ponerCara("brazos-cruzados", false);
    }
    esperarTuJugada();
  }

  /* ganador: "w" | "b" | null (tablas). */
  function alTerminar(ganador, miColor) {
    if (!estado.enPartida) return;
    pararEspera();
    estado.regaloPendiente = null;
    decir(ganador === null ? "tablas" : ganador === miColor ? "ganasTu" : "ganoYo");
  }

  function alRendirte() {
    if (!estado.enPartida) return;
    pararEspera();
    decir("rendicion");
  }

  /* ── La casilla de la pantalla de elegir partida ─────────────────────────── */
  function casillaMarcada() {
    const c = document.getElementById("rival-profe-activo");
    return !!(c && c.checked);
  }

  function crearCasilla() {
    const boton = document.getElementById("empezar-btn");
    if (!boton || document.getElementById("rival-profe-activo")) return;
    let marcada = true;
    try { marcada = localStorage.getItem(CLAVE_PREFERENCIA) !== "no"; } catch (e) { /* sin almacenamiento: marcada */ }
    const caja = document.createElement("label");
    caja.className = "flex items-center gap-3 bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4 mb-4 cursor-pointer";
    const img = document.createElement("img");
    img.src = ruta("burlon");
    img.alt = "";
    img.width = 56; img.height = 56;
    img.className = "rival-miniatura";
    const c = document.createElement("input");
    c.type = "checkbox";
    c.id = "rival-profe-activo";
    c.checked = marcada;
    c.className = "w-5 h-5 shrink-0";
    c.addEventListener("change", () => { try { localStorage.setItem(CLAVE_PREFERENCIA, c.checked ? "si" : "no"); } catch (e) { /* no importa */ } });
    const texto = document.createElement("span");
    texto.className = "text-sm text-brand-700 dark:text-brand-200";
    const fuerte = document.createElement("strong");
    fuerte.textContent = "Que el profe me hable mientras juego";
    texto.append(fuerte, document.createElement("br"),
      document.createTextNode("Comenta cada jugada (y se burla un poquito). En los niveles 1 y 2, a veces deja una pieza colgando a propósito para que la encuentres."));
    caja.append(c, img, texto);
    boton.parentNode.insertBefore(caja, boton);
  }

  /* ── ¿Le toca a esta cuenta? ─────────────────────────────────────────────── */
  async function corresponde() {
    const sb = window.sb;
    if (!sb || !sb.auth) return false;
    const { data: ses } = await sb.auth.getSession();
    const uid = ses && ses.session && ses.session.user && ses.session.user.id;
    if (!uid) return false;
    const r = await sb.from("vistas_en_prueba").select("vista").eq("profile_id", uid).eq("vista", "rival_profe").maybeSingle();
    return !!(r && !r.error && r.data);
  }

  async function preparar() {
    try {
      if (!(await corresponde())) return;
    } catch (e) { return; }
    estado.activo = true;
    crearCasilla();
    crearPanel();
  }

  window.RivalProfe = {
    get activo() { return estado.activo; },
    FRASES, UMBRAL,
    juzgarIntercambio, buscarRegalo,
    alEmpezar, trasTuJugada, elegirJugada, trasSuJugada, alTerminar, alRendirte,
    // Para el verificador: activar sin base y fijar el azar.
    _probar(opciones) {
      estado.activo = true;
      if (opciones && opciones.azar) azar = opciones.azar;
      crearCasilla(); crearPanel();
    },
    _estado: estado,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", preparar);
  else preparar();
})();

/*! rev bfb5bbb0d2d82f9f */
