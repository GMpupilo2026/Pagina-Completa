/* Lo que comparten las salas de partida en línea: el reloj, la caída de
   bandera, volver a leer la sala y escuchar sus cambios. Lo usan estandar,
   niebla, crazyhouse, cartas y variante (los cinco con reloj) y, para la sala,
   también duelo.

   Eran seis copias de las mismas funciones, ya separadas entre sí: solo
   Estándar y Niebla decían de quién es cada reloj («Tu reloj, blancas: 4
   minutos 5 segundos»); en Crazyhouse, Cartas y las variantes el lector de
   pantalla leía «4:05» suelto, sin decir si era el propio o el del rival ni
   cuál estaba arriba. Una sola copia, y las cinco lo dicen.

   Lo único que cambia de un juego a otro es a quién se le pregunta de quién es
   el turno (board.game en las de tablero normal, engine en las variantes):
   por eso se pasa `turno`, ya calculado. Script clásico, sin estado propio:
   cada página sigue teniendo su `room`, su `myColor` y sus nombres. */
(function () {
  "use strict";

  const SEGUNDOS_POCOS = 30;

  function formatear(segundos) {
    if (segundos == null) return "";
    const s = Math.max(0, Math.ceil(segundos));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  /* De quién es el turno según la SALA guardada, no según el tablero. Mientras
     la jugada propia viaja a la base, el tablero ya la muestra (es el turno del
     rival), pero para la base el reloj que corre sigue siendo el propio: con el
     turno del tablero, el reloj del rival bajaba todo lo que uno había
     pensado, de golpe, hasta que llegaba la respuesta. En Cartas la posición va
     en cartas_state.fen (la columna fen no se actualiza), y Abrazos guarda la
     suya en JSON, con el turno en `t`. */
  function turnoDe(room) {
    const fen = String((room && room.cartas_state && room.cartas_state.fen) || (room && room.fen) || "");
    if (fen.charAt(0) === "{") {
      try { return JSON.parse(fen).t === "b" ? "b" : "w"; } catch (e) { return "w"; }
    }
    return fen.split(" ")[1] === "b" ? "b" : "w";
  }

  /* Cuán avanzada va una versión de la sala. Lo que Realtime entrega puede
     llegar tarde y desordenado (el eco de la jugada propia después de la
     respuesta del rival, una relectura que salió antes de una jugada y volvió
     después): sin esto, una versión vieja pisaba a una nueva y el tablero
     volvía atrás una jugada, o el reloj corría para quien ya había jugado. */
  function avance(room) {
    const d = room.duelo_state;
    const contar = (o) => (o ? (o.w ? 1 : 0) + (o.b ? 1 : 0) : 0);
    // Ajedrez para 4 (fourplayer_games): los listos y quién quedó fuera
    // (rendido o eliminado, que pasa sin jugada) van en cada asiento.
    const asientos = room.seats ? Object.values(room.seats).filter(Boolean) : null;
    return [
      room.status === "finished" ? 1 : 0,
      (room.moves || []).length,
      asientos ? asientos.filter((a) => a.status && a.status !== "active").length : 0,
      d ? (d.round || 0) * 10 + contar(d.commit) + contar(d.reveal) : 0,
      asientos ? asientos.filter((a) => a.ready).length : (room.white_ready ? 1 : 0) + (room.black_ready ? 1 : 0),
      room.clock_updated_at ? Date.parse(room.clock_updated_at) || 0 : 0,
    ];
  }
  // ¿`fila` es más vieja que `actual`? Igual no es más vieja: se aplica.
  function esAnterior(fila, actual) {
    if (!fila || !actual) return false;
    const a = avance(fila), b = avance(actual);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
  }
  function laMasNueva(actual, fila) { return fila && !esAnterior(fila, actual) ? fila : actual; }

  /* Lo que le queda a `color`, contando lo que corre desde la última jugada
     si es su turno. La hora es la del servidor (js/reloj-servidor.js): la del
     celular de cada uno puede estar adelantada. */
  /* `corren`, si viene, dice qué relojes corren ({ w, b }) en vez del turno:
     en Duelo Simultáneo los dos piensan a la vez y cada reloj se detiene
     cuando ese jugador confirma su jugada (ver js/duelo.js). */
  function restante(room, color, turno, corren) {
    const guardado = color === "w" ? room.white_time_left : room.black_time_left;
    if (guardado == null) return null;
    const corre = room.status === "playing" && room.clock_updated_at && (corren ? !!corren[color] : turno === color);
    if (!corre) return guardado;
    return Math.max(0, guardado - RelojServidor.desde(room.clock_updated_at));
  }

  /* De quién es cada reloj, dicho: "4:05" suelto no dice si es el tuyo o el
     del rival, y quien no ve la pantalla no sabe cuál está arriba. */
  function rotular(el, color, segundos, miColor, nombreDe) {
    const lado = color === "w" ? "blancas" : "negras";
    const dueno = miColor ? (color === miColor ? "tu reloj" : "reloj del rival") : "reloj de " + nombreDe(color);
    const tiempo = window.JuegosBlind && JuegosBlind.tiempoDicho ? JuegosBlind.tiempoDicho(segundos) : formatear(segundos);
    const etiqueta = dueno.charAt(0).toUpperCase() + dueno.slice(1) + ", " + lado + ": " + tiempo;
    if (el.getAttribute("aria-label") !== etiqueta) el.setAttribute("aria-label", etiqueta);
  }

  /* Los dos relojes (#top-clock y #bottom-clock). Abajo va el propio; quien
     mira la partida ve las blancas abajo. `nombreDe(color)` da el nombre del
     jugador de ese color, para el rótulo de quien mira. */
  function pintarRelojes(room, opciones) {
    const arriba = document.getElementById("top-clock");
    const abajo = document.getElementById("bottom-clock");
    if (!arriba || !abajo) return;
    if (room.initial_seconds == null) {
      arriba.classList.add("hidden");
      abajo.classList.add("hidden");
      return;
    }
    const colorAbajo = opciones.miColor || "w";
    const colorArriba = colorAbajo === "w" ? "b" : "w";
    const segArriba = restante(room, colorArriba, opciones.turno, opciones.corren);
    const segAbajo = restante(room, colorAbajo, opciones.turno, opciones.corren);
    arriba.textContent = formatear(segArriba);
    abajo.textContent = formatear(segAbajo);
    rotular(arriba, colorArriba, segArriba, opciones.miColor, opciones.nombreDe);
    rotular(abajo, colorAbajo, segAbajo, opciones.miColor, opciones.nombreDe);
    arriba.classList.remove("hidden");
    abajo.classList.remove("hidden");
    [[arriba, segArriba], [abajo, segAbajo]].forEach(([el, s]) => {
      const pocos = room.status === "playing" && s != null && s <= SEGUNDOS_POCOS;
      el.classList.toggle("text-red-600", pocos);
      el.classList.toggle("dark:text-red-400", pocos);
    });
  }

  /* Si al que le toca se le acabó el tiempo, la partida termina. La escritura
     solo pega si la partida sigue en juego (.eq("status", "playing")): los dos
     navegadores la ven caer a la vez y no se pisan.
     Si la base la rechaza («Todavía le queda tiempo»), lo que se ve está
     atrasado: casi siempre, una jugada del rival que no llegó. Se vuelve a leer
     la sala en vez de insistir cada 250 ms (cuatro pedidos por segundo por
     cada pantalla trabada, justo cuando la base anda lenta). */
  const banderaEnPausa = {};
  async function revisarBandera(room, salaId, turno) {
    if (room.status !== "playing" || room.initial_seconds == null) return;
    turno = turno || turnoDe(room);
    const quedan = restante(room, turno, turno);
    if (quedan === null || quedan > 0) return;
    if (banderaEnPausa[salaId] && Date.now() < banderaEnPausa[salaId]) return;
    banderaEnPausa[salaId] = Date.now() + 60000; // una a la vez
    const ganador = turno === "w" ? "black" : "white";
    const clave = turno === "w" ? "white_time_left" : "black_time_left";
    const { error } = await sb.from("game_rooms")
      .update({ status: "finished", result: ganador, [clave]: 0, updated_at: new Date().toISOString() })
      .eq("id", salaId).eq("status", "playing");
    banderaEnPausa[salaId] = Date.now() + (error ? 1000 : 250);
    if (error) {
      console.error(error);
      if (vigilantes[salaId]) vigilantes[salaId].refrescar();
    }
  }

  /* La sala como está en la base, tras una escritura que no quedó. */
  async function releer(salaId) {
    const { data: fila, error } = await sb.from("game_rooms").select("*").eq("id", salaId).single();
    if (error || !fila) { console.error(error); return null; }
    return fila;
  }

  /* Cada cambio de la sala, filtrado a ESTA sala (ver «Realtime escucha solo
     lo que la pantalla muestra»), y sin perderse ninguno (ver «Las jugadas
     llegan siempre» en docs/decisiones/juegos-y-torneos.md).

     Realtime solo avisa lo que pasa MIENTRAS el canal está conectado, y no
     dice nada de lo que se perdió: un celular que bloqueó la pantalla, una
     pestaña en segundo plano a la que el navegador le frenó el latido, un
     cambio de wifi a datos, o el propio Realtime atrasado con la base
     cargada. La jugada del rival quedaba guardada en la base y la pantalla no
     se enteraba nunca: el reloj del rival seguía corriendo en una pantalla
     mientras en la otra corría el propio. Por eso:
       · cada vez que el canal queda conectado (también al reconectarse, y la
         primera vez: entre leer la sala y quedar suscrito pudo pasar una
         jugada) se vuelve a leer la sala;
       · al volver a la pestaña, al recuperar la red y si el canal se cae;
       · y, de respaldo, si pasa un rato sin noticias con la partida en juego:
         5 s si se espera al rival, 15 s si es el turno propio, 3 s con el
         canal caído. Cada lectura es UNA fila por su llave.
     Lo que llega viejo o repetido no se aplica (esAnterior, y la misma fila
     dos veces no repinta nada).

     opciones: sala() → la sala que se ve; miColor() → "w", "b" o null (en
     Ajedrez para 4, el asiento); esperando() (opcional) → si se espera algo
     del otro lado; tabla y canal (opcionales) → para fourplayer_games;
     rapida (opcional) → abre además el canal rápido (abajo):
       jugar(sala, aviso) → los campos de la sala con la jugada del aviso
                            hecha con el motor de la página (fen, moves, …),
                            o null si no se puede comprobar;
       posicion(sala)     → (opcional) con qué se compara «la posición de la
                            que sale la jugada»; la fen, salvo en Cartas;
       enVuelo()          → si la jugada propia se está guardando.

     EL CANAL RÁPIDO (ver «La jugada viaja por Broadcast» en
     docs/decisiones/juegos-y-torneos.md). Por la base, la jugada tarda lo que
     tarda guardarla, más lo que tarda Realtime en revisar la RLS de cada
     cambio para cada quien escucha (en un solo hilo, con todas las partidas de
     la plataforma). Así que quien mueve la avisa ADEMÁS por un canal de
     Broadcast privado, `sala-juego:<id>` (la política de realtime.messages
     deja escuchar a quien puede ver la sala y mandar solo a quien la juega),
     y del otro lado se pinta de una vez como PROVISIONAL (`_provisional`):
     la base sigue mandando. Cuando llega la fila guardada, la reemplaza; si en
     unos segundos no llega, se vuelve a leer la sala, y lo que la base no
     tiene desaparece. El canal rápido va aparte: si no se puede abrir (una
     base sin la política), el de siempre sigue igual.

     Lo que el aviso trae no se cree: tiene que ser la jugada siguiente (`n`),
     salir de la posición que se ve (`antes`) y la página la rehace con su
     motor (`rapida.jugar`). El reloj lo calcula quien la recibe, con lo
     guardado y la hora `desde`, acotada entre el último reloj de la base y
     ahora: el aviso no puede regalar tiempo.

     La página, al mover: `const envio = await vigilante.jugada({ … })`
     (avisa, y si la sala era provisional espera a que la base tenga la
     jugada del rival: la propia se guarda sobre ella); si `envio.ok` es
     falso, la del rival no quedó y se vuelve a leer la sala. El reloj propio
     se cuenta con `SalaJuego.pensado(sala, envio)`. Y al terminar de
     guardar, `vigilante.despuesDeGuardar()`: aplica la del rival que llegó
     mientras tanto. */
  const vigilantes = {};
  const ESPERA_RIVAL_MS = 5000, ESPERA_PROPIA_MS = 15000, ESPERA_SIN_CANAL_MS = 3000, ESPERA_MIRANDO_MS = 8000;
  // Lo que se espera a que la base confirme una jugada provisional antes de
  // volver a leer la sala (y deshacerla si la base no la tiene).
  const ESPERA_PROVISIONAL_MS = 4000;

  function suscribir(salaId, alCambiar, opciones) {
    opciones = opciones || {};
    const sala = opciones.sala || (() => null);
    const tabla = opciones.tabla || "game_rooms";
    let canal = null, vuelta = 0, conectada = false, caidaDesde = Date.now(), ultimoContacto = Date.now(), leyendo = null;
    let rapido = null, rapidoListo = false, vueltaRapida = 0, plazoProvisional = null;
    const rapida = opciones.rapida || null;
    const posicion = (s) => (rapida && rapida.posicion ? rapida.posicion(s) : String((s && s.fen) || ""));
    let pendiente = null;      // una jugada rápida que llegó con la propia guardándose
    let esperanBase = [];      // quien espera a que la base confirme la provisional
    // Cuándo apareció en pantalla la posición que se ve (con la hora del
    // servidor), para devolver en el reloj lo que tardó en llegar la jugada del
    // rival (ver pensado). La que ya estaba al abrir la página no cuenta: `en`
    // queda en null y no se devuelve nada. Una sala sin reloj (el Relevo no
    // carga js/reloj-servidor.js) no anota nada: sin esto, cada jugada que
    // llegaba reventaba antes de pintarse.
    let vista = null;
    function anotarVista(fila) {
      if (!window.RelojServidor) return;
      if (!vista) vista = { pos: posicion(sala()), en: null };
      const pos = posicion(fila);
      if (pos !== vista.pos) {
        vista = { pos: pos, en: RelojServidor.ahora() };
        medir(fila);
      }
      if (fila.status === "finished") enviarMedida();
    }

    /* Cuánto tardó en aparecer cada jugada del rival: desde que la movió (si
       llegó por el canal rápido, la provisional trae esa hora) o desde que la
       base la guardó, hasta que se vio acá. Se manda a la base cada 20
       jugadas, al terminar y al irse (ver «Cómo andan las partidas en
       línea»). Solo quien juega, y solo en game_rooms. */
    const medida = { demoras: [], rapidas: 0, base: 0, enviadas: 0 };
    function medir(fila) {
      const color = opciones.miColor ? opciones.miColor() : null;
      if (tabla !== "game_rooms" || !color || !fila.clock_updated_at || turnoDe(fila) !== color) return;
      const demora = vista.en - Date.parse(fila.clock_updated_at);
      if (!(demora >= 0) || demora > 600000 || medida.demoras.length >= 2000) return;
      medida.demoras.push(Math.round(demora));
      if (fila._provisional) medida.rapidas++; else medida.base++;
      if (medida.demoras.length % 20 === 0) enviarMedida();
    }
    function enviarMedida() {
      if (!medida.demoras.length || medida.demoras.length === medida.enviadas) return;
      medida.enviadas = medida.demoras.length;
      const datos = Object.assign(resumenDemoras(medida.demoras), { rapidas: medida.rapidas, base: medida.base });
      try {
        sb.rpc("anotar_medicion_partida", { p_room_id: salaId, p_datos: datos }).then(null, () => {});
      } catch (e) { /* medir nunca rompe la partida */ }
    }
    window.addEventListener("pagehide", enviarMedida);

    // La sala dejó de ser provisional: sigue quien esperaba para guardar.
    function soltarEspera() {
      const actual = sala();
      if (!esperanBase.length || (actual && actual._provisional)) return;
      const listos = esperanBase;
      esperanBase = [];
      listos.forEach((f) => f());
    }

    /* Una fila de la BASE. Sobre una sala provisional (una jugada que llegó
       por el canal rápido y la base todavía no confirma), la fila guardada
       gana apenas tiene esas jugadas: su reloj es el de verdad. Una más vieja
       se deja pasar (la jugada se está guardando), salvo `forzar`: se acabó la
       espera y lo que diga la base es lo que hay. */
    function aplicar(fila, forzar) {
      ultimoContacto = Date.now();
      if (!fila) return;
      const actual = sala();
      if (actual && actual._provisional) {
        const alcanza = (fila.moves || []).length >= (actual.moves || []).length || fila.status === "finished";
        if (alcanza || forzar) { clearTimeout(plazoProvisional); anotarVista(fila); alCambiar(fila); soltarEspera(); }
        return;
      }
      if (actual && esAnterior(fila, actual)) return;
      if (actual && JSON.stringify(actual) === JSON.stringify(fila)) return;
      anotarVista(fila);
      alCambiar(fila);
    }

    function refrescar(forzar) {
      if (leyendo && !forzar) return leyendo;
      leyendo = (async () => {
        try {
          const { data, error } = await sb.from(tabla).select("*").eq("id", salaId).maybeSingle();
          if (error) console.error(error);
          else aplicar(data, forzar);
        } catch (e) { console.error(e); }
        ultimoContacto = Date.now();
        leyendo = null;
      })();
      return leyendo;
    }

    function pintarConexion() {
      const banner = document.getElementById("status-banner");
      if (!banner || !banner.parentNode) return;
      let aviso = document.getElementById("sala-conexion");
      const mostrar = !conectada && Date.now() - caidaDesde > 4000;
      if (!aviso) {
        if (!mostrar) return;
        aviso = document.createElement("p");
        aviso.id = "sala-conexion";
        aviso.setAttribute("role", "status");
        aviso.className = "mb-2 rounded-xl bg-brand-100 dark:bg-brand-900 px-4 py-2 text-sm text-brand-600 dark:text-brand-300";
        banner.parentNode.insertBefore(aviso, banner.nextSibling);
      }
      const texto = mostrar ? "📶 Reconectando… Las jugadas se siguen leyendo de la base cada pocos segundos." : "";
      if (aviso.textContent !== texto) aviso.textContent = texto;
      aviso.classList.toggle("hidden", !mostrar);
    }

    function abrir() {
      const propio = ++vuelta;
      canal = sb.channel((opciones.canal || "game-room-") + salaId + (propio > 1 ? "-" + propio : ""))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: tabla, filter: "id=eq." + salaId },
          (payload) => aplicar(payload.new))
        .subscribe((estado) => {
          if (propio !== vuelta) return; // un canal viejo que todavía no terminó de cerrarse
          if (estado === "SUBSCRIBED") {
            conectada = true;
            refrescar();
          } else if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT" || estado === "CLOSED") {
            // CHANNEL_ERROR y TIMED_OUT los reintenta solo la librería. CLOSED no:
            // ahí se abre otro canal.
            if (conectada) caidaDesde = Date.now();
            conectada = false;
            if (estado === "CLOSED") {
              setTimeout(() => {
                if (propio !== vuelta) return;
                try { sb.removeChannel(canal); } catch (e) {}
                abrir();
              }, 2000);
            }
          }
          pintarConexion();
        });
    }

    function abrirRapido() {
      const propio = ++vueltaRapida;
      rapidoListo = false;
      rapido = sb.channel("sala-juego:" + salaId, { config: { private: true, broadcast: { self: false } } })
        .on("broadcast", { event: "jugada" }, (mensaje) => {
          try { recibir(mensaje && mensaje.payload); } catch (e) { console.error(e); }
        })
        .subscribe((estado) => {
          if (propio !== vueltaRapida) return;
          rapidoListo = estado === "SUBSCRIBED";
          // Cerrado del todo (o sin permiso): se prueba otra vez más tarde. Las
          // jugadas siguen llegando por la base mientras tanto.
          if (estado === "CLOSED" || estado === "CHANNEL_ERROR") {
            setTimeout(() => {
              if (propio !== vueltaRapida) return;
              try { sb.removeChannel(rapido); } catch (e) {}
              abrirRapido();
            }, estado === "CLOSED" ? 2000 : 15000);
          }
        });
    }

    /* La jugada del rival que llegó por el canal rápido. Se pinta como
       provisional; si la base no la confirma a tiempo, se vuelve a leer la
       sala y gana lo que diga la base. */
    function recibir(aviso) {
      const actual = sala();
      if (!actual || !aviso || actual.status !== "playing") return;
      if (rapida.enVuelo && rapida.enVuelo()) { pendiente = aviso; return; }
      const jugadas = actual.moves || [];
      if (aviso.n !== jugadas.length + 1 || aviso.antes !== posicion(actual)) return;
      const campos = rapida.jugar(actual, aviso);
      if (!campos) return;
      const fila = Object.assign({}, actual, campos, { _provisional: true });
      if (actual.initial_seconds != null && actual.clock_updated_at) {
        const clave = turnoDe(actual) === "w" ? "white_time_left" : "black_time_left";
        const base = Date.parse(actual.clock_updated_at);
        const desde = Math.min(Math.max(Number(aviso.desde) || 0, base), RelojServidor.ahora());
        fila[clave] = Math.max(0, (actual[clave] || 0) - (desde - base) / 1000) + (actual.increment_seconds || 0);
        fila.clock_updated_at = new Date(desde).toISOString();
      }
      clearTimeout(plazoProvisional);
      plazoProvisional = setTimeout(() => {
        const ahora = sala();
        if (ahora && ahora._provisional) refrescar(true);
      }, ESPERA_PROVISIONAL_MS);
      anotarVista(fila);
      alCambiar(fila);
    }

    /* La jugada propia, a los que miran la sala, sin esperar a nada (si el
       canal no está, no se manda: la base la lleva igual). Si se jugó sobre
       una jugada PROVISIONAL del rival (la pre-jugada sale al instante), antes
       de guardarla la del rival tiene que estar en la base: la propia se
       guarda «sobre la posición de la que salió». Se espera a la fila
       guardada; si no llega a tiempo, se vuelve a leer la sala. `ok` dice si
       la posición de la que salió la jugada sigue siendo la de la sala. */
    async function jugada(datos) {
      const actual = sala();
      const antes = posicion(actual);
      const alMover = RelojServidor.ahora();
      if (rapido && rapidoListo) {
        try {
          const envio = rapido.send({ type: "broadcast", event: "jugada", payload: Object.assign({ n: ((actual && actual.moves) || []).length + 1, antes: antes, desde: alMover }, datos) });
          if (envio && envio.catch) envio.catch(() => {});
        } catch (e) { /* la base la lleva igual */ }
      }
      // Cuándo se vio la posición de la que sale esta jugada (null si no se sabe).
      const vistaEn = vista && vista.pos === antes ? vista.en : null;
      const ok = await esperarBase(antes);
      // Y que la jugada salga de verdad de la sala: rehecha sobre ella con el
      // mismo motor que la del rival, tiene que dar la posición del tablero.
      // Si el tablero y la sala se separaron (una escritura rechazada y vuelta
      // a leer mientras se movía, por ejemplo), guardar la lista de jugadas de
      // una con la posición de la otra dejaba en la base una partida que no se
      // puede rejugar. Entonces no se guarda: se vuelve a leer la sala.
      const coincide = !rapida || !datos || !!rapida.jugar(sala(), datos);
      return { alMover: alMover, vistaEn: vistaEn, ok: ok && coincide };
    }

    /* Antes de guardar cualquier cosa sobre una sala provisional (también una
       carta, en Cartas): que la base tenga la jugada del rival. Devuelve si la
       posición sigue siendo `antes` (la que se tenía a la vista). */
    async function esperarBase(antes) {
      const actual = sala();
      if (antes === undefined) antes = posicion(actual);
      if (actual && actual._provisional) {
        await new Promise((listo) => {
          esperanBase.push(listo);
          setTimeout(async () => {
            if (esperanBase.indexOf(listo) === -1) return;
            await refrescar(true);
            esperanBase = esperanBase.filter((f) => f !== listo);
            listo();
          }, ESPERA_PROVISIONAL_MS);
        });
      }
      return posicion(sala()) === antes;
    }

    function despuesDeGuardar() {
      if (!pendiente) return;
      const aviso = pendiente;
      pendiente = null;
      recibir(aviso);
    }

    setInterval(() => {
      pintarConexion();
      if (document.visibilityState === "hidden") return;
      const actual = sala();
      if (!actual || actual.status !== "playing") return;
      const color = opciones.miColor ? opciones.miColor() : null;
      let espera;
      if (!conectada) espera = ESPERA_SIN_CANAL_MS;
      else if (!color) espera = ESPERA_MIRANDO_MS;
      else if (opciones.esperando) espera = opciones.esperando() ? ESPERA_RIVAL_MS : ESPERA_PROPIA_MS;
      else espera = (!actual.white_ready || !actual.black_ready || turnoDe(actual) !== color) ? ESPERA_RIVAL_MS : ESPERA_PROPIA_MS;
      if (Date.now() - ultimoContacto >= espera) refrescar();
    }, 1000);

    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refrescar(); });
    window.addEventListener("online", () => refrescar());
    window.addEventListener("pageshow", (e) => { if (e.persisted) refrescar(); });

    vigilantes[salaId] = { refrescar, jugada, esperarBase, despuesDeGuardar };
    abrir();
    if (rapida) abrirRapido();
    // El rival que se desconecta (js/rival-ausente.js): en toda sala de a dos.
    if (tabla === "game_rooms" && window.RivalAusente && opciones.miColor) {
      window.RivalAusente.vigilar(salaId, { sala, miColor: opciones.miColor, refrescar });
    }
    return vigilantes[salaId];
  }

  /* Lo que se manda de las demoras de una partida: cuántas, la mitad, el
     95 % y la peor, en milisegundos. */
  function resumenDemoras(lista) {
    const orden = lista.slice().sort((a, b) => a - b);
    const en = (q) => orden[Math.min(orden.length - 1, Math.floor(q * orden.length))];
    return { jugadas: orden.length, mediana_ms: en(0.5), p95_ms: en(0.95), max_ms: orden[orden.length - 1] };
  }

  /* Lo que pensó quien acaba de mover, para su reloj (`envio` es lo que
     devuelve vigilante.jugada; un número solo, la hora de mover).

     · Hasta el momento de mover (`alMover`), no hasta que la jugada del rival
       quedó en la base. Pero el trigger del reloj tolera solo 2 s entre lo que
       se cuenta y su propia hora, y de eso vive también la red: si se esperó
       más de medio segundo, se cuenta hasta ahora, como siempre.
     · Desde que la jugada del rival apareció en pantalla (`vistaEn`), no desde
       que la base la guardó: lo que tardó en llegar no lo pensó nadie. Como en
       lichess, con tope: a lo sumo RETRASO_MAXIMO por jugada, el mismo que el
       trigger deja pasar de más (ver «El retraso de la red no se cobra en el
       reloj» en docs/decisiones/juegos-y-torneos.md). Si la jugada llegó antes
       de que la base la guardara (el canal rápido), no hay nada que devolver. */
  const RETRASO_MAXIMO_MS = 1000;
  function pensado(room, envio) {
    if (!room || !room.clock_updated_at) return 0;
    const alMover = typeof envio === "number" ? envio : envio && envio.alMover;
    const vistaEn = envio && typeof envio === "object" ? envio.vistaEn : null;
    const ahora = RelojServidor.ahora();
    const hasta = alMover && ahora - alMover <= 500 ? alMover : ahora;
    const base = Date.parse(room.clock_updated_at);
    const retraso = vistaEn ? Math.min(Math.max(0, vistaEn - base), RETRASO_MAXIMO_MS) : 0;
    return Math.max(0, (hasta - base - retraso) / 1000);
  }

  /* «Estoy listo». Si el rival ya estaba listo, esta confirmación es la que
     hace falta para arrancar: el reloj se pone en marcha en la misma
     actualización, para no depender de una segunda ida y vuelta (y para que
     los dos no intenten arrancarlo a la vez si confirman casi juntos).
     Devuelve { cambio, error }: lo que se escribió, para que la página lo
     sume a su `room` y repinte lo suyo. */
  async function marcarListo(room, salaId, miColor) {
    const cambio = { [miColor === "w" ? "white_ready" : "black_ready"]: true };
    const elOtroYaEstaba = miColor === "w" ? room.black_ready : room.white_ready;
    if (elOtroYaEstaba && room.initial_seconds != null && !room.clock_updated_at) {
      cambio.clock_updated_at = new Date().toISOString();
    }
    // Se pide la fila de vuelta: el reloj arranca con la hora de la BASE (la
    // pone el trigger), no con la de esta computadora.
    const { data, error } = await sb.from("game_rooms").update(cambio).eq("id", salaId).select("*");
    if (error) console.error(error);
    const fila = Array.isArray(data) ? data[0] : null;
    return { cambio: fila ? laMasNueva(room, fila) : cambio, error };
  }

  /* El botón «Rendirse» (#resign-btn). `sala()` y `miColor()` se leen al
     apretarlo, no al montarlo: la sala cambia con cada jugada. */
  function montarRendirse(opciones) {
    const boton = document.getElementById("resign-btn");
    if (!boton) return;
    boton.addEventListener("click", async () => {
      const miColor = opciones.miColor();
      if (!miColor || opciones.sala().status !== "playing") return;
      if (!(await Avisos.confirmar("La partida se termina y la gana tu rival.", { titulo: "¿Rendirte?", aceptar: "Rendirme", peligro: true }))) return;
      // El diálogo pudo quedar abierto un buen rato: si mientras tanto la partida
      // terminó (por ejemplo, al rival se le cayó la bandera), rendirse no puede
      // pisar ese resultado. Por eso se vuelve a mirar, y la base lo exige también.
      if (opciones.sala().status !== "playing") { opciones.decir("La partida ya había terminado."); return; }
      const resultado = miColor === "w" ? "black" : "white";
      const { data: rendida, error } = await sb.from("game_rooms")
        .update({ status: "finished", result: resultado, updated_at: new Date().toISOString() })
        .eq("id", opciones.salaId).eq("status", "playing").select("id");
      if (error) { console.error(error); opciones.decir("No se pudo registrar la rendición: " + error.message); return; }
      if (!rendida || !rendida.length) await opciones.releer("La partida ya había terminado: la rendición no se registró.");
    });
  }

  /* La jugada del rival que llegó por el canal rápido, rehecha con chess.js
     (Estándar y Niebla): tiene que ser legal y dar la posición que dice el
     aviso. Es `rapida.jugar` de suscribir. */
  function rehacerConChess(sala, aviso) {
    const prueba = new Chess(sala.fen);
    const m = typeof aviso.san === "string" ? prueba.move(aviso.san) : null;
    if (!m || prueba.fen() !== aviso.despues) return null;
    return { fen: prueba.fen(), moves: (sala.moves || []).concat([m.san]) };
  }

  const SALIDA = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  function esTripleRepeticion(jugadas, fen) {
    return !!window.Repeticion && Repeticion.esTriple(SALIDA, jugadas, (f) => new Chess(f), fen);
  }

  /* Cómo se dice un final en tablas, el mismo en las seis páginas. `motivo`:
     "repeticion" (la misma posición tres veces), "cincuenta" (50 jugadas de
     cada lado sin captura ni avance de peón) o nada (ahogado, material
     insuficiente, acuerdo). */
  function textoTablas(motivo) {
    if (motivo === "repeticion") return "Tablas por triple repetición.";
    if (motivo === "cincuenta") return "Tablas por la regla de las 50 jugadas.";
    return "Tablas.";
  }

  /* Si la partida es de un torneo y ya terminó, que el torneo se entere
     (js/torneo-sync.js: el resultado al cruce y, si era la última, cerrar la
     ronda). Cada página lo hace con lo que le llega por Realtime, pero eso no
     alcanza: cuando la jugada que termina la partida es la PROPIA, el eco
     llega idéntico a lo que la página ya tiene y se descarta (ver
     suscribir), así que solo avisaba la pantalla del rival; si el rival había
     cerrado la suya, el cruce se quedaba sin resultado y la ronda no se
     cerraba nunca. Se llama también después de guardar la jugada propia.
     onRoomUpdate es idempotente: solo toca un cruce todavía sin resultado. */
  function avisarTorneo(fila) {
    if (!fila || fila.status !== "finished" || !window.TorneoSync) return;
    try { TorneoSync.onRoomUpdate(sb, fila); } catch (e) { console.error(e); }
  }

  window.SalaJuego = { formatear, turnoDe, esAnterior, laMasNueva, restante, pintarRelojes, revisarBandera, releer, suscribir, pensado, rehacerConChess, marcarListo, montarRendirse, esTripleRepeticion, avisarTorneo, textoTablas, resumenDemoras };
})();
