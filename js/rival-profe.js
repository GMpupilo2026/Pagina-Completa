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
     (lo comprueba el verificador); `id` es el nombre de su grabación:
     herramientas/rival-profe/grabaciones/<id>.* → audio/rival-profe/<id>.mp3
     (herramientas/rival-profe-medios.py). Las marcadas «del profe» son frases
     suyas de verdad, de las que dice en clase. Van en primera persona y sin
     adjetivos con género, porque el mismo texto lo dice la profe Pame en su
     academia (con la voz del navegador: las grabaciones son del profe Oscar). */
  const FRASES = {
    saludo: [
      { id: "saludo-perder", cara: "hola", texto: "¿Vienes a perder otra vez? Tranqui, voy suave… pero solo al principio." },
      { id: "saludo-que-traes", cara: "burlon", texto: "A ver qué me traes hoy." },
      { id: "saludo-ya-se", cara: "brazos-cruzados", texto: "Mueve cuando quieras. Yo ya sé cómo termina esto." },
      { id: "saludo-valentia", cara: "risa", texto: "¡Jajaja! Qué valentía, retarme a mí." },
    ],
    regalo: [
      { id: "regalo-gracias", cara: "risa", texto: "¡Uh! Gracias por el regalito." },
      { id: "regalo-detalle", cara: "burlon", texto: "¿Esa pieza era para mí? Uf, qué detalle." },
      { id: "regalo-vagabundo", cara: "vagabundo", texto: "Tan vagabundo… la dejó solita." },
      { id: "regalo-pobrecillo", cara: "pobrecillo", texto: "Pobrecillo, ni la vio venir." },
      { id: "regalo-esa-no-era", cara: "esa-no-es", texto: "Esa no era. Te lo digo por si acaso." },
      { id: "regalo-nam", cara: "risa", texto: "Mmm… ¡ñam! Pieza gratis, lo mejor." },
    ],
    golpe: [
      { id: "golpe-esa-vara", cara: "esa-vara", texto: "¡Esa vara!" },                              // del profe
      { id: "golpe-de-donde-salio", cara: "wow", texto: "¿Y esa jugada de dónde salió?" },          // del profe
      { id: "golpe-no-puede-ser", cara: "no-puede-ser", texto: "¡No puede ser! ¿Quién te enseñó eso?" },
      { id: "golpe-no-la-tenia", cara: "esa-vara", texto: "¿Y esa vara? No la tenía calculada." },
      { id: "golpe-no-te-acostumbres", cara: "wow", texto: "Ok, ok… esa estuvo buena. Pero no te acostumbres." },
      { id: "golpe-un-descuido", cara: "mmm", texto: "Mmm… fue un descuido. Uno solo." },
      { id: "golpe-jugadon", cara: "que-jugadon", texto: "¡Qué jugadón! …pero no lo voy a repetir en voz alta." },
    ],
    jaqueTuyo: [
      { id: "jaque-tuyo-miedo", cara: "atencion", texto: "¿Jaque? Uy, qué miedo… ¿no?" },
      { id: "jaque-tuyo-plan", cara: "brazos-cruzados", texto: "Un jaque no es un plan, ¿eh?" },
      { id: "jaque-tuyo-despues", cara: "burlon", texto: "Bueno, ¿qué? ¿Y después del jaque? ¿Qué va a hacer?" },
    ],
    jaqueMio: [
      { id: "jaque-mio-esa-y-no-otra", cara: "atencion", texto: "Mmm… esa y no otra." },                    // del profe
      { id: "jaque-mio-sufrir", cara: "te-toca", texto: "Jaque. Te toca a ti… sufrir un poquito." },
      { id: "jaque-mio-ojo", cara: "atencion", texto: "¡Jaque! Ojo con ese rey, ¿ah?" },
      { id: "jaque-mio-viste", cara: "burlon", texto: "Jaque. ¿Lo viste venir?" },
    ],
    charla: [
      { id: "charla-huelo", cara: "mmm", texto: "Mmm… huelo, huelo, huelo peligro." },                // del profe
      { id: "charla-interesante", cara: "mmm", texto: "Mmmm… interesante. Mal, pero interesante." },
      { id: "charla-asuste", cara: "brazos-cruzados", texto: "Bueno, ¿qué? Sigo esperando una jugada que me asuste." },
      { id: "charla-facil", cara: "vagabundo", texto: "Bueno, creo que esto va a ser fácil." },
      { id: "charla-plan", cara: "idea", texto: "Tengo un plan… tengo un plan." },
      { id: "charla-mas-despacio", cara: "tu-puedes", texto: "¡Hágale, hágale, vamos! Usted puede perder un poquito más despacio… pero puede." },
    ],
    esperando: [
      { id: "espera-sin-prisa", cara: "brazos-cruzados", texto: "Estoy esperando… sin prisa. Bueno, con un poquito." },
      { id: "espera-ideas", cara: "tiempo", texto: "¿Se te acabaron las ideas?" },
    ],
    dormido: [
      { id: "dormido", cara: "dormidos", texto: "¿Te dormiste? Despiértame cuando juegues." },
    ],
    pista: [
      { id: "pista-huelo", cara: "mmm", texto: "Huelo que hay algo en la posición. ¿Lo ves?" },        // del profe
      { id: "pista-se-me-escapo", cara: "mmm", texto: "Uy… creo que algo se me escapó. ¿Lo ves?" },
      { id: "pista-flojo", cara: "esa-vara", texto: "Ups. Algo me quedó flojo por acá… a ver si lo encuentras." },
      { id: "pista-oportunidad", cara: "idea", texto: "Te voy a dar una oportunidad. Una sola. Búscala." },
    ],
    laViste: [
      { id: "la-viste-esa-y-no-otra", cara: "bien-hecho", texto: "¡Esa y no otra! Me cachaste." },     // del profe
      { id: "la-viste-mirar", cara: "bien-hecho", texto: "¡Me cachaste! Bien visto: eso es mirar el tablero." },
      { id: "la-viste-sin-defender", cara: "muy-bien", texto: "¡Eso! Esa pieza estaba sin defender. Así se juega." },
      { id: "la-viste-despierto", cara: "excelente", texto: "La viste. Ok, hoy sí vienes despierto." },
    ],
    noLaViste: [
      { id: "no-la-viste-servida", cara: "pobrecillo", texto: "Te la dejé servida y no la viste… pobrecillo." },
      { id: "no-la-viste-gratis", cara: "casi", texto: "¡Casi! Había una pieza gratis. Mira qué quedó sin defender." },
      { id: "no-la-viste-colgando", cara: "esa-no-es", texto: "Esa no era. Te había dejado algo colgando." },
    ],
    ganoYo: [
      { id: "gano-revancha", cara: "risa", texto: "¡Jajaja! Gané. ¿La revancha? Ya sé que sí." },
      { id: "gano-campeon", cara: "campeones", texto: "Campeón otra vez. El de siempre." },
      { id: "gano-cerca", cara: "pobrecillo", texto: "Estuvo cerca… bueno, no tanto." },
    ],
    ganasTu: [
      { id: "ganas-esa-vara", cara: "no-puede-ser", texto: "¡Esa vara! Me ganaste." },                 // del profe
      { id: "ganas-distraje", cara: "no-puede-ser", texto: "¡No puede ser! Seguro me distraje." },
      { id: "ganas-revancha", cara: "felicidades", texto: "Felicidades… esta vez. Quiero la revancha ya." },
      { id: "ganas-no-cuentes", cara: "wow", texto: "Ok, me ganaste. Pero no le cuentes a nadie." },
    ],
    tablas: [
      { id: "tablas-poquito", cara: "casi", texto: "Tablas. Te salvaste por poquito." },
      { id: "tablas-por-hoy", cara: "esa-vara", texto: "¿Tablas? Bueno… lo dejamos así, por hoy." },
    ],
    rendicion: [
      { id: "rendicion-otra", cara: "pobrecillo", texto: "¿Ya te rendiste? Pobrecillo… otra, va." },
      { id: "rendicion-sabia", cara: "risa", texto: "¡Jajaja! Sabia decisión." },
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

  function ruta(id) { return window.AvatarProfeOscar ? window.AvatarProfeOscar.ruta(id) : ""; }
  function altDe(id) { const a = window.AvatarProfeOscar && window.AvatarProfeOscar.porId(id); return a ? a.alt : ""; }

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
    nombre.textContent = (window.AvatarProfeOscar && window.AvatarProfeOscar.PROFES[window.AvatarProfeOscar.PROFE].nombre) || "El profe Oscar";
    globo = document.createElement("p");
    globo.className = "rival-globo rounded-xl px-3 py-2 text-sm bg-brand-100 dark:bg-brand-800 text-brand-800 dark:text-white";
    globo.setAttribute("aria-live", "polite");
    const cabeza = document.createElement("div");
    cabeza.className = "flex items-center justify-between gap-2 mb-1";
    nombre.classList.remove("mb-1");
    const botonVoz = document.createElement("button");
    botonVoz.type = "button";
    botonVoz.id = "rival-profe-voz";
    botonVoz.className = "text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors";
    botonVoz.addEventListener("click", () => {
      vozEncendida = !vozEncendida;
      try { localStorage.setItem(CLAVE_VOZ, vozEncendida ? "si" : "no"); } catch (e) { /* no importa */ }
      if (!vozEncendida) callar();
      pintarBotonVoz(botonVoz);
    });
    cabeza.append(nombre, botonVoz);
    caja.append(cabeza, globo);
    panel.append(imgCara, caja);
    status.parentNode.insertBefore(panel, status);
    // Las caras se bajan desde ya, para que el cambio de gesto sea al instante.
    const ids = new Set(["mmm"]);
    Object.values(FRASES).forEach((l) => l.forEach((f) => ids.add(f.cara)));
    ids.forEach((id) => {
      [ruta(id), rutaCuadro(id, "ojos"), rutaCuadro(id, "boca")].filter(Boolean).forEach((src) => { const i = new Image(); i.src = src; });
    });
    pintarBotonVoz(botonVoz);
  }

  /* ── La voz y la boca ────────────────────────────────────────────────────────
     Con la voz encendida (el botón del panel, encendida por omisión; queda en
     `rival_profe_voz_v1` de este navegador), cada frase se oye:
     - con la GRABACIÓN del profe si existe (audio/rival-profe/<id>.mp3; la
       lista la arma herramientas/rival-profe-medios.py en
       js/rival-profe-medios.js). Solo para el profe Oscar: la profe Pame no
       habla con la voz de él;
     - si no, con la voz del navegador, mientras faltan grabaciones.
     Mientras suena, la boca se mueve con el VOLUMEN de la grabación (Web Audio,
     un AnalyserNode): con el cuadro de boca abierta de esa cara si lo hay
     (img/avatar-profe-<profe>/cuadros/<cara>-boca.webp) y, si no, la cara se
     mece un poquito. Con la voz del navegador no hay volumen que medir: se mece
     el tiempo que más o menos dura la frase.
     Y parpadea sola cada 2,5 a 6 s si su cara tiene el cuadro de ojos cerrados
     (<cara>-ojos.webp). Con «reducir movimiento», ni se mece ni parpadea.
     La voz de todo el sitio (js/voz-pagina.js) no vuelve a leer el globo
     mientras la del profe está encendida (`data-voz-propia`). */
  const CLAVE_VOZ = "rival_profe_voz_v1";
  const MEDIOS = window.RivalProfeMedios || { voces: [], cuadros: {} };
  const PROFE_ACTUAL = (window.AvatarProfeOscar && window.AvatarProfeOscar.PROFE) || "oscar";
  const VOCES = new Set(PROFE_ACTUAL === "oscar" ? MEDIOS.voces || [] : []);
  const CUADROS = new Set((MEDIOS.cuadros || {})[PROFE_ACTUAL] || []);
  const UMBRAL_BOCA = 0.06;   // volumen (0-1) desde el que la boca se abre
  let vozEncendida = true;
  try { vozEncendida = window.localStorage.getItem(CLAVE_VOZ) !== "no"; } catch (e) { /* sin almacenamiento: encendida */ }
  let sonando = null, ctxAudio = null, medidor = null, finMecida = null, parpadeo = null;
  const sinMovimiento = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  function rutaCuadro(cara, tipo) {
    if (!CUADROS.has(cara + "-" + tipo) || !window.AvatarProfeOscar) return null;
    return window.AvatarProfeOscar.PROFES[PROFE_ACTUAL].carpeta + "/cuadros/" + cara + "-" + tipo + ".webp";
  }

  // La imagen que toca ahora: la cara, con la boca abierta o los ojos cerrados.
  let bocaAbierta = false, ojosCerrados = false;
  function pintarCuadro() {
    if (!imgCara) return;
    const cara = imgCara.dataset.cara;
    const src = (bocaAbierta && rutaCuadro(cara, "boca")) || (ojosCerrados && rutaCuadro(cara, "ojos")) || ruta(cara);
    if (imgCara.getAttribute("src") !== src) imgCara.setAttribute("src", src);
    imgCara.classList.toggle("rival-hablando", bocaAbierta && !rutaCuadro(cara, "boca") && !sinMovimiento());
  }

  function callar() {
    if (sonando) { try { sonando.pause(); } catch (e) { /* ya no estaba */ } sonando = null; }
    if (medidor) { cancelAnimationFrame(medidor); medidor = null; }
    clearTimeout(finMecida);
    bocaAbierta = false;
    pintarCuadro();
  }

  function medirVolumen(audio) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctxAudio = ctxAudio || new AC();
      if (ctxAudio.state === "suspended") ctxAudio.resume();
      const fuente = ctxAudio.createMediaElementSource(audio);
      const analizador = ctxAudio.createAnalyser();
      analizador.fftSize = 512;
      fuente.connect(analizador);
      analizador.connect(ctxAudio.destination);
      return analizador;
    } catch (e) { return null; }
  }

  function hablar(frase) {
    callar();
    if (!vozEncendida || !frase) return;
    if (VOCES.has(frase.id)) {
      const audio = new Audio("audio/rival-profe/" + frase.id + ".mp3");
      sonando = audio;
      const analizador = medirVolumen(audio);
      const datos = analizador ? new Uint8Array(analizador.fftSize) : null;
      const paso = () => {
        if (sonando !== audio) return;
        if (analizador) {
          analizador.getByteTimeDomainData(datos);
          let suma = 0;
          for (let i = 0; i < datos.length; i++) { const v = (datos[i] - 128) / 128; suma += v * v; }
          bocaAbierta = Math.sqrt(suma / datos.length) > UMBRAL_BOCA;
        } else bocaAbierta = !audio.paused;
        pintarCuadro();
        medidor = requestAnimationFrame(paso);
      };
      audio.addEventListener("play", () => { medidor = requestAnimationFrame(paso); });
      audio.addEventListener("ended", () => { if (sonando === audio) callar(); });
      audio.play().catch(() => { if (sonando === audio) callar(); });
      return;
    }
    // Sin grabación: la voz del navegador (sin el «(no)» y los demás paréntesis).
    const texto = frase.texto.replace(/\s*\([^)]*\)/g, "");
    let dicho = false;
    if (window.BlindNotation && BlindNotation.speak) dicho = BlindNotation.speak(texto, { siempre: true });
    else if (window.speechSynthesis) {
      try {
        const u = new SpeechSynthesisUtterance(texto);
        u.lang = "es-ES";
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
        dicho = true;
      } catch (e) { dicho = false; }
    }
    if (!dicho) return;
    bocaAbierta = true;
    pintarCuadro();
    finMecida = setTimeout(() => { bocaAbierta = false; pintarCuadro(); }, Math.min(6000, 600 + texto.length * 65));
  }

  function parpadear() {
    clearTimeout(parpadeo);
    parpadeo = setTimeout(() => {
      if (estado.enPartida && !bocaAbierta && !sinMovimiento() && imgCara && rutaCuadro(imgCara.dataset.cara, "ojos")) {
        ojosCerrados = true; pintarCuadro();
        setTimeout(() => { ojosCerrados = false; pintarCuadro(); }, 140);
      }
      parpadear();
    }, 2500 + azar() * 3500);
  }

  function pintarBotonVoz(boton) {
    boton.setAttribute("aria-pressed", vozEncendida ? "true" : "false");
    boton.textContent = vozEncendida ? "🔊 Con voz" : "🔇 Sin voz";
    if (globo) globo.toggleAttribute("data-voz-propia", vozEncendida);
  }

  // Reinicia una animación de CSS: quitar la clase, forzar el cálculo, ponerla.
  function animar(el, clase) {
    el.classList.remove("rival-salto", "rival-sacudida", "rival-entra");
    void el.offsetWidth;
    el.classList.add(clase);
  }

  function ponerCara(id, conAnimacion) {
    if (!imgCara) return;
    imgCara.dataset.cara = id;
    imgCara.alt = altDe(id);
    pintarCuadro();
    if (conAnimacion) animar(imgCara, SACUDIDA.has(id) ? "rival-sacudida" : "rival-salto");
  }

  function decir(evento) {
    if (!estado.enPartida || !globo) return null;
    const f = elegirFrase(evento);
    ponerCara(f.cara, true);
    globo.textContent = f.texto;
    globo.dataset.evento = evento;
    globo.dataset.frase = f.id;
    animar(globo, "rival-entra");
    hablar(f);
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
    parpadear();
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
