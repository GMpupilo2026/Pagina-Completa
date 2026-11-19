/* Comprueba la llamada de voz de la clase en vivo (js/clase-llamada.js,
   sesion.html, la Edge Function clase-llamada). Ver «La llamada de voz de la
   clase» en docs/decisiones/clase-en-vivo.md.

   Lo que se rompe callado acá:

   1. QUE LA PALABRA SIGA AL TURNO DE LA CLASE. Si sesion.js deja de llamar a
      `llamada.sincronizar()` después de dar o terminar un turno (o clase-sacar
      después de sacar), la llamada se ve perfecta y el alumno al que le dieron
      la palabra no puede hablar —o el que terminó sigue hablando—.
   2. QUE QUIEN DECIDE SEA LA BASE CON EL TOKEN DE QUIEN PIDE: la función no
      puede usar la clave de servicio (se saltaría la RLS y la verificación en
      dos pasos), y la función de la base no puede quedar para `anon`.
   3. QUE EL MICRÓFONO SEA SOLO DE LA CLASE: `microphone=(self)` en /sesion y
      en ningún otro lado, y LiveKit en connect-src (sin eso no conecta, sin
      ningún error en la caja salvo «no se pudo entrar»).
   4. LA CAJA, EN UN NAVEGADOR, con un LiveKit y una función de mentira: lo que
      se anuncia, el micrófono bloqueado sin la palabra, la palabra dada y
      quitada, los atajos y el aviso de cuando no está configurada. Se mide si
      un botón se ve con checkVisibility(), no por el atributo.
   5. LO QUE SE AGREGÓ EL 18/11: los temas de la grabación (capítulos solos),
      el lugar del alumno en la fila de manos, los minutos que habló cada uno
      (y que la base no deje que un alumno se los ponga), los dos volúmenes
      aparte y volver sola a la llamada si se cae.

   No necesita el sitio servido: la caja se arma con el HTML de sesion.html.
   Uso:  node herramientas/verificar-clase-llamada.js                           */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
// Sin los \r de Windows (core.autocrlf): las expresiones buscan "\n".
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8").replace(/\r\n/g, "\n");
let fallos = 0;
const bien = (m) => console.log("  ✓ " + m);
const mal = (m) => { fallos++; console.log("  ✗ " + m); };
const si = (cond, m) => (cond ? bien(m) : mal(m));

/* ------------------------------------------------------------------ 1-3 */

console.log("=== Los enganches de la clase ===");
{
  const sesion = leer("js/sesion.js");
  const darTurno = (sesion.match(/async function darTurno\([\s\S]*?\n        }\n/) || [""])[0];
  const terminar = (sesion.match(/async function terminarElegido\([\s\S]*?\n        }\n/) || [""])[0];
  si(/llamada\.sincronizar\(\)/.test(darTurno), "darTurno() acomoda la llamada (puede hablar quien recibe el turno)");
  si(/llamada\.sincronizar\(\)/.test(terminar), "terminarElegido() acomoda la llamada (se le apaga el micrófono)");
  si(/ClaseLlamada\.montar\(/.test(sesion), "sesion.js monta la llamada");
  const montaje = (sesion.match(/if \(window\.ClaseLlamada[\s\S]*?\n            }\n/) || [""])[0];
  si(/!esObservador/.test(montaje) && /!vistaPrevia/.test(montaje) && /!modoProyector/.test(montaje) && /!modoControl/.test(montaje),
    "…pero no para quien observa, la vista previa, el proyector ni el control remoto");
  si(/profile\.role === "profesor"/.test(montaje), "…y del lado del profe, solo quien da clase (no quien administra)");
  si(/alternarMano:[^\n]*setHandRaised\(!handRaised\)/.test(montaje), "la mano de la llamada es la mano de la clase (setHandRaised)");
  si(/update\(\{ llamada_sesion: valor, llamada_modo: "turno", llamada_grabando: Boolean\(abrirla\), llamada_grupos: null \}\)/.test(montaje) && /abrirla \? currentOpenSessionId : null/.test(montaje), "el profe abre la llamada en ESTA clase (llamada_sesion = la clase abierta) y la termina con null; las dos veces vuelve al turno, y al abrirla se graba sola");
  si(/update\(\{ llamada_grabando: Boolean\(encender\) \}\)/.test(montaje), "pausar o volver a grabar lo guarda el profe en game_state.llamada_grabando");
  si(/storage\.from\("clase-grabaciones"\)\.upload\(ruta, blob/.test(montaje) && /rpc\("guardar_parte_grabacion"/.test(montaje), "cada parte se sube al almacenamiento privado y se anota con guardar_parte_grabacion()");
  si(/const ruta = profile\.id \+ "\/" \+ clase \+ "\/"/.test(montaje), "…en la carpeta del profe y de ESA clase (la que traía la parte, no la abierta de ahora)");
  si(/update\(\{ llamada_modo: modo \}\)/.test(montaje), "quién puede hablar lo guarda el profe en game_state.llamada_modo");
  const aplicar = (sesion.match(/function applyGameStateRow\(row\) \{[\s\S]*?\n        }\n/) || [""])[0];
  si(/llamadaSesion = row\.llamada_sesion/.test(aplicar) && /llamada\.estado\(llamadaAbierta\(\), llamadaModo, llamadaGrabando, llamadaGrupos\)/.test(aplicar) && /llamadaModo = row\.llamada_modo/.test(aplicar) && /llamadaGrabando = Boolean\(row\.llamada_grabando\)/.test(aplicar), "cada cambio de game_state le dice a la caja si la llamada está abierta (al alumno le aparece y desaparece solo)");
  si(/llamadaSesion === currentOpenSessionId/.test(sesion), "…y abierta es SOLO en la clase de ahora (la de ayer no cuenta)");
  const sacar = (leer("js/clase-sacar.js").match(/async function sacarDeLaClase\([\s\S]*?\n}\n/) || [""])[0];
  si(/llamada\.sincronizar\(\)/.test(sacar), "sacar a alguien de la clase lo saca también de la llamada");
  const html = leer("sesion.html");
  const iLlamada = html.indexOf('src="js/clase-llamada.js"'), iSesion = html.indexOf('src="js/sesion.js"');
  si(iLlamada > 0 && iLlamada < iSesion, "js/clase-llamada.js carga antes que sesion.js");
}

console.log("\n=== La base y la función ===");
{
  // La ÚLTIMA migración que define la función es la que vale en la base.
  const mig = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).sort().filter((f) =>
    /create or replace function public\.llamada_de_la_clase/.test(leer("supabase/migraciones/" + f))).pop();
  const sql = mig ? leer("supabase/migraciones/" + mig) : "";
  /* Los permisos y el trigger no tienen por qué repetirse en la última: un
     `create or replace` conserva el execute de la función, y el trigger vive
     aparte. Se buscan en TODAS las migraciones que tocan la llamada
     (clase_solo_asignados redefine la función solo para pedir la lista). */
  const todas = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).sort()
    .map((f) => leer("supabase/migraciones/" + f))
    .filter((t) => /llamada_de_la_clase|llamada_sesion/.test(t)).join(" ");
  si(Boolean(mig), "la migración llamada_de_la_clase está guardada");
  si(/revoke execute on function public\.llamada_de_la_clase\(uuid\) from public, anon/.test(todas), "llamada_de_la_clase() se le quita a public y anon (es una API)");
  si(/grant execute on function public\.llamada_de_la_clase\(uuid\) to authenticated/.test(todas), "…y se deja a authenticated");
  si(/clase_sacados/.test(sql) && /devuelto_at is null/.test(sql), "quien el profe sacó no entra");
  si(/role = 'profesor'/.test(sql), "el profe tiene que ser profesor (quien administra no da clase)");
  si(/if v_rol = 'alumno' and not v_abierta then\s+return null;/.test(sql), "el alumno no recibe pase si el profe no abrió la llamada en esta clase");
  si(/new\.llamada_sesion := old\.llamada_sesion;/.test(todas) && /new\.llamada_modo := old\.llamada_modo;/.test(todas), "solo el profe abre o termina la llamada y elige quién habla (protect_game_state_teacher_columns)");
  si(/v_modo := case when v_abierta then coalesce\(v_modo, 'turno'\) else 'turno' end;/.test(sql), "quién puede hablar solo vale con la llamada abierta en esta clase");
  const fn = leer("supabase/functions/clase-llamada/index.ts");
  si(!/SERVICE_ROLE/.test(fn), "la función no usa la clave de servicio");
  si(/global: \{ headers: \{ Authorization: autorizacion \} \}/.test(fn) && /rpc\("llamada_de_la_clase"/.test(fn), "…pregunta a la base con el token de quien llama");
  si(/canPublishSources: \[fuente\]/.test(fn) && /permisos\(hablar, "microphone"\)/.test(fn) && /permisos\(hablar, "MICROPHONE"\)/.test(fn), "solo voz: el pase y el cambio de permiso dejan publicar únicamente el micrófono");
  si(/ll\.rol === "profe" \|\| puedeHablar\(ll, ll\.yo, ll\.permiso_voz === true, enGrupo\)/.test(fn) && /const hablar = puedeHablar\(ll, p\.identity, conPermiso\.has\(p\.identity\), grupo > 0\)/.test(fn), "el pase y «sincronizar» deciden quién habla con la misma regla");
  si(/if \(ll\.grabando && !conPermiso\) return false;/.test(fn), "mientras se graba, el alumno sin permiso de su familia no habla nunca (lo diga el turno o «Todos»)");
  si(/if \(enGrupo \|\| ll\.modo === "libre"\) return true;/.test(fn) && /if \(ll\.modo === "bloqueada"\) return false;/.test(fn) && /return identidad === ll\.elegido;/.test(fn), "…con turno habla quien lo tiene, con «Todos» cualquiera y con «Nadie» ningún alumno");
  si(/if \(ll\.rol !== "profe"\)/.test(fn), "solo el profe sincroniza");
  si(/can_publish \?\? p\.permission\?\.canPublish/.test(fn), "lee el permiso como lo contesta LiveKit (snake_case)");
  si(/sacados\.has\(p\.identity\) \|\| !ll\.abierta/.test(fn), "con la llamada terminada, «sincronizar» saca a todos menos al profe");
  si(/^clase-llamada\s+true\s/m.test(leer("supabase/esquema/funciones-desplegadas.txt")), "está en funciones-desplegadas.txt con verify_jwt en true");
  si(/"clase-llamada": \[\]/.test(leer("herramientas/funciones-armar.js")), "está en la lista de funciones-armar.js (se despliega sola)");
}

console.log("\n=== Las cabeceras y la privacidad ===");
{
  const h = leer("_headers");
  const csp = (h.match(/Content-Security-Policy:[^\n]*/) || [""])[0];
  const connect = ((csp.match(/connect-src ([^;]*)/) || [])[1] || "").split(/\s+/);
  si(connect.includes("wss://*.livekit.cloud") && connect.includes("https://*.livekit.cloud"), "connect-src deja pasar a LiveKit (wss y https)");
  // Cada bloque de rutas con su Permissions-Policy.
  const bloques = h.split(/\n(?=\/)/).map((b) => ({ ruta: b.split("\n")[0].trim(), pp: (b.match(/Permissions-Policy: ([^\n]*)/) || [])[1] || "" }));
  const conMic = bloques.filter((b) => /microphone=\(self\)/.test(b.pp)).map((b) => b.ruta).sort();
  si(JSON.stringify(conMic) === JSON.stringify(["/sesion", "/sesion.html"]), "el micrófono se permite SOLO en /sesion y /sesion.html (" + conMic.join(", ") + ")");
  const deSesion = bloques.filter((b) => b.ruta === "/sesion" || b.ruta === "/sesion.html");
  si(deSesion.length === 2 && deSesion.every((b) => /! Permissions-Policy/.test(h.split(b.ruta + "\n")[1].split("\n\n")[0])),
    "…quitando antes la regla de /* (si no, Cloudflare las junta y queda microphone=())");
  si(/<strong>LiveKit:<\/strong>[^<]*voz/.test(leer("privacidad.html")), "LiveKit está en la lista de proveedores de privacidad.html");
  const priv = leer("privacidad.html");
  si(/<strong>Grabación de la clase en vivo:<\/strong>/.test(priv) && /Se borra sola a los 90 días/.test(priv) && /no puede encender el micrófono mientras se graba/.test(priv),
    "privacidad.html dice que se graba, quién escucha, que se borra a los 90 días y que sin permiso no se habla");
  si(!/Grabación de la clase en vivo[^\n]*(Supabase|informe)/i.test(priv), "…sin nombrar el servicio de almacenamiento ni los informes (lo pidió el dueño)");
  si(/<strong>LiveKit no graba ni guarda la voz<\/strong>/.test(priv), "…y la línea de LiveKit ya no promete que la voz no se graba");
  si(/<strong>Minutos hablados en la llamada:<\/strong>/.test(priv) && /Solo se guarda el tiempo, nunca lo que se dijo/.test(priv) && /junto con la asistencia/.test(priv),
    "privacidad.html dice que se anotan los minutos hablados (solo el tiempo), quién los ve y que se guardan con la asistencia (lo aprobó el dueño)");
  si(/<strong>Marcas de la clase:<\/strong>/.test(priv) && /La ve solo quien la hizo/.test(priv), "…y las marcas de la clase: solo la hora, y las ve solo quien las hizo");

  console.log("\n=== La grabación: el permiso y escucharla ===");
  const conf = leer("js/configuracion.js");
  si(/rpc\("dar_permiso_grabar_voz", \{ p_version_privacidad: window\.LegalVersion\.PRIVACIDAD \}\)/.test(conf) && /rpc\("quitar_permiso_grabar_voz"\)/.test(conf),
    "Configuración da el permiso con la versión de la privacidad y lo quita");
  si(/profile\.role === "alumno" && !profile\.is_admin && !profile\._persona\) pintarPermisoVoz\(\)/.test(conf), "…solo el alumno, y no en «Ver como»");
  const confHtml = leer("configuracion.html");
  si(/id="voz-acepto"/.test(confHtml) && /href="privacidad\.html"/.test(confHtml.split('id="voz-permiso"')[1] || ""), "la casilla del permiso enlaza a la Política de privacidad");
  const rep = leer("js/repasar-clases.js");
  si(/from\('clase_grabaciones'\)/.test(rep) && /createSignedUrls\(/.test(rep) && /cargarGrabacion\(p\.class_session_id\)/.test(rep), "«Repasar mis clases» trae la grabación de la clase que se abre (firmada por una hora)");
  si(/catch \(e\) \{ console\.warn\('La grabación de la clase no se pudo cargar/.test(rep), "…y si falla, el visor sigue igual");
  si(/select\('id, ruta, parte, segundos, marcas, texto, profesor_id, creado_en'\)/.test(rep) && /addEventListener\('timeupdate', seguir\)/.test(rep) && /addEventListener\('seeked', seguir\)/.test(rep),
    "al escucharla, el tablero sigue a la grabación (también al saltar a otro minuto)");
  const seguir = (rep.match(/function seguirGrabacion\(marcas, t\)\{[\s\S]*?\n\}/) || [""])[0];
  si(/visor-grabacion-decir'\)\.checked/.test(seguir) && /if \(decir\) \{ mirar\(n\); return; \}/.test(seguir), "…y dice las jugadas solo si se marcó «Decir las jugadas mientras escucho»");
  si(/p_marcas: marcas && marcas\.length \? marcas : null/.test(leer("js/sesion.js")), "las marcas viajan con la parte a guardar_parte_grabacion()");
  const repHtml = leer("repasar-clases.html");
  si(repHtml.indexOf('src="js/reporte-transcribir.js"') > 0 && repHtml.indexOf('src="js/reporte-transcribir.js"') < repHtml.indexOf('src="js/repasar-clases.js"'), "«Repasar mis clases» carga la transcripción en el navegador (la misma de Reportes) antes que su código");
  const limp = leer("supabase/functions/clase-grabaciones-limpiar/index.ts");
  si(/rpc\("secreto_grabaciones_limpiar"\)/.test(limp) && /\.remove\(rutas\)/.test(limp) && limp.indexOf(".remove(rutas)") < limp.indexOf(".delete()"),
    "el borrado de los 90 días exige el secreto y borra primero el archivo y después la fila");
  si(/^clase-grabaciones-limpiar\s+false\s/m.test(leer("supabase/esquema/funciones-desplegadas.txt")) && /^limpiar-grabaciones\s+40 7 \* \* \*/m.test(leer("supabase/esquema/cron.txt")),
    "…está anotada (verify_jwt en false) y la tarea de pg_cron también");
}

console.log("\n=== Lo del 18/11: temas, fila de manos y minutos ===");
{
  const sesion = leer("js/sesion.js");
  const montaje = (sesion.match(/if \(window\.ClaseLlamada[\s\S]*?\n            }\n/) || [""])[0];
  si(/tema: temaDeLaClase,/.test(montaje), "la grabación pregunta de qué va la clase (temaDeLaClase)");
  const tema = (sesion.match(/function temaDeLaClase\(\) \{[\s\S]*?\n        }\n/) || [""])[0];
  si(["presentacionActual", "formacionActual", "tandaActual", "calentamientoActual", "estadoPensar", "board.startFen"].every((x) => tema.includes(x)),
    "…y los temas salen solos de la diapositiva, la práctica, la tanda, el calentamiento, el tiempo para pensar y la posición nueva");
  si(/rpc\("sumar_segundos_hablados", \{ p_clase: clase, p_segundos: tanda \}\)/.test(montaje) && /from\("llamada_participacion"\)/.test(montaje),
    "los minutos hablados se guardan con sumar_segundos_hablados() y se leen de llamada_participacion");
  // El lugar en la fila: la función tal cual está en sesion.js.
  const fnFila = (sesion.match(/function lugarEnLaFilaDeManos\(alumnos, yo\) \{[\s\S]*?\n        }\n/) || [""])[0];
  let lugar = null;
  try { lugar = new Function(fnFila + "; return lugarEnLaFilaDeManos;")(); } catch (e) { lugar = null; }
  if (lugar) {
    const m = new Map([
      ["ana", { hand_raised: true, hand_at: "2026-11-18T10:00:05Z" }],
      ["yo", { hand_raised: true, hand_at: "2026-11-18T10:00:03Z" }],
      ["beto", { hand_raised: false }],
      ["cata", { hand_raised: true, hand_at: "2026-11-18T10:00:01Z" }],
    ]);
    si(JSON.stringify(lugar(m, "yo")) === '{"lugar":2,"total":3}', "el alumno sabe su lugar en la fila: el orden en que levantaron la mano (" + JSON.stringify(lugar(m, "yo")) + ")");
    si(lugar(m, "beto") === null, "…y sin la mano levantada no tiene lugar");
  } else mal("no encontré lugarEnLaFilaDeManos() en sesion.js");
  si(/const llegada = \(info\) => \(info\.hand_at/.test(sesion) && /info\.hand_at/.test(fnFila), "…con el mismo hand_at con que el profe ordena su lista");
  si(/renderCompanerosList\(\); avisarLugarEnLaFila\(\); \}/.test(sesion), "…y se le vuelve a decir cada vez que cambia la presencia (al avanzar)");
  const mig = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).find((f) => /llamada_minutos_hablados/.test(f));
  const sql = mig ? leer("supabase/migraciones/" + mig) : "";
  si(/create table if not exists public\.llamada_participacion/.test(sql) && !/create policy [^\n]* for (insert|update|delete|all)/i.test(sql),
    "llamada_participacion no tiene política de escritura (la escribe solo la función)");
  si(/revoke execute on function public\.sumar_segundos_hablados\(uuid, jsonb\) from public, anon/.test(sql) && /coalesce\(yo is not null and exists/.test(sql),
    "sumar_segundos_hablados() no es de public ni anon, y sin sesión rechaza (coalesce)");
  si(/join public\.class_attendance a/.test(sql) && /least\(greatest\([^\n]*, 0\), 900\)/.test(sql), "…suma solo a quienes tienen asistencia en la clase, con un tope por tanda");
  const rep = leer("js/repasar-clases.js");
  si(/cargarHablado\(p\.class_session_id\)/.test(rep) && /const soyAlumno = nombre\.has\(yoId\)/.test(rep), "«Repasar mis clases» dice quién habló (al alumno, solo lo suyo)");
}

console.log("\n=== Lo del 18/11 (2): micrófono, señal, grupos y resumen ===");
{
  const mig = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).find((f) => /llamada_grupos/.test(f));
  const sql = mig ? leer("supabase/migraciones/" + mig) : "";
  si(/new\.llamada_grupos := old\.llamada_grupos;/.test(sql), "solo el profe arma los grupos (protect_game_state_teacher_columns): un alumno no se cambia de sala");
  si(/check \(llamada_grupos is null or jsonb_typeof\(llamada_grupos\) = 'object'\)/.test(sql), "…los grupos son un objeto o nada");
  si(/\^\(\[1-9\]\|1\[0-9\]\|20\)\$/.test(sql) && /'sala', v_sala \|\| case when v_grupo is not null then '-g' \|\| v_grupo else '' end/.test(sql),
    "…la base le da a cada alumno la sala de SU grupo (y un número raro no es un grupo)");
  si(/v_grupos := case when v_abierta and jsonb_typeof\(v_grupos\) = 'object' then v_grupos end;/.test(sql), "…y sin la llamada abierta en esta clase no hay grupos");
  const fn = leer("supabase/functions/clase-llamada/index.ts");
  si(/const sala = ll\.rol === "profe" \? salaDe\(ll, grupoPedido\) : ll\.sala;/.test(fn), "el alumno no elige su sala (la da la base); el profe sí elige a qué grupo entra");
  si(/grupoDe\(ll, p\.identity\) !== grupo/.test(fn) && /\.\.\.viejos/.test(fn), "«sincronizar» saca de cada sala a quien no es de ella, también de las de grupos que ya terminaron");
  const iRol = fn.indexOf('if (ll.rol !== "profe")');
  si(iRol > 0 && fn.indexOf('if (accion === "silenciar")') > iRol && /MutePublishedTrack/.test(fn), "apagar el micrófono de alguien: solo el profe, y lo hace el servidor (MutePublishedTrack)");
  const ll = leer("js/clase-llamada.js");
  const armar = (ll.match(/function mezclar\(lista\) \{[\s\S]*?\n        }\n/) || [""])[0] + (ll.match(/function armarGrupos\(alumnos, tam\) \{[\s\S]*?\n        }\n/) || [""])[0];
  let armarGrupos = null;
  try { armarGrupos = new Function(armar + "; return armarGrupos;")(); } catch (e) { armarGrupos = null; }
  if (armarGrupos) {
    const tamanos = (n, tam) => {
      const g = armarGrupos(Array.from({ length: n }, (_, k) => "a" + k), tam);
      const c = {};
      Object.values(g).forEach((x) => { c[x] = (c[x] || 0) + 1; });
      return Object.values(c).sort((a, b) => a - b).join(",");
    };
    si(tamanos(4, 2) === "2,2" && tamanos(5, 2) === "2,3" && tamanos(7, 3) === "3,4" && tamanos(6, 3) === "3,3" && tamanos(2, 4) === "2",
      "los grupos salen parejos y nadie queda solo: 4→2,2 · 5→2,3 · 7 de a 3→3,4 (" + [tamanos(4, 2), tamanos(5, 2), tamanos(7, 3)].join(" · ") + ")");
  } else mal("no encontré armarGrupos() en clase-llamada.js");
  si(/voiceIsolation: true/.test(ll) && /noiseSuppression: true/.test(ll), "el navegador quita el ruido de la casa: supresión de ruido y aislar la voz");
  si(/switchActiveDevice\("audioinput"/.test(ll) && /CLAVE_MIC/.test(ll), "se elige el micrófono (se recuerda) y se cambia dentro de la llamada");
  si(/webAudioMix: espacial \? \{ audioContext: ctxVoces \} : false/.test(ll) && /createStereoPanner/.test(ll), "las voces en su lugar van por WebAudio solo si se pidieron");
  const sesion = leer("js/sesion.js");
  si(/llamada_grabando: Boolean\(abrirla\), llamada_grupos: null/.test(sesion), "abrir o terminar la llamada la deja sin grupos");
  si(/llamada\.estado\(llamadaAbierta\(\), llamadaModo, llamadaGrabando, llamadaGrupos\)/.test(sesion), "…y los grupos le llegan a la llamada con el estado de la clase");
  const rep = leer("js/repasar-clases.js");
  const resumen = rep.slice(rep.indexOf("const PALABRAS_VACIAS"), rep.indexOf("function pintarResumen"));
  let frases = null;
  try { frases = new Function(resumen + "; return frasesPrincipales;")(); } catch (e) { frases = null; }
  if (frases) {
    const r = frases("Hoy vamos a ver la oposición en los finales de peones. La oposición es cuando los reyes se miran con una casilla en medio. Bueno, ahora juguemos un rato. La oposición en los finales de peones decide quién gana el final. ¿Alguien tiene una pregunta sobre la oposición en los finales?", 2);
    si(JSON.stringify(r) === JSON.stringify(["Hoy vamos a ver la oposición en los finales de peones.", "La oposición en los finales de peones decide quién gana el final."]),
      "el resumen elige las frases principales tal como se dijeron, en su orden (" + JSON.stringify(r) + ")");
    si(JSON.stringify(frases("", 5)) === "[]", "…y sin texto no inventa nada");
  } else mal("no encontré frasesPrincipales() en repasar-clases.js");
  si(/pintarResumen\(data\.filter/.test(rep) && /pintarResumen\(\[\]\)/.test(rep), "el resumen se arma con la grabación y se borra al cambiar de clase");
}

console.log("\n=== Lo del 19/11: reacciones, pregunta, marcas y avisos ===");
{
  const mig = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).find((f) => /clase_marcas/.test(f));
  const sql = mig ? leer("supabase/migraciones/" + mig) : "";
  si(/create policy clase_marcas_select [^;]*using \(persona_id = \(select auth\.uid\(\)\)\)/.test(sql) && !/for (insert|update|all)/i.test(sql),
    "las marcas: cada uno ve solo las suyas, y no hay política para escribirlas (las escribe la función)");
  si(/v_hora timestamptz := now\(\)/.test(sql) && /coalesce\(yo is not null and exists/.test(sql) && /c\.ended_at is null/.test(sql),
    "…la hora la pone la base, y solo marca quien está en una clase abierta (coalesce)");
  si(/revoke execute on function public\.marcar_momento_de_clase\(uuid\) from public, anon/.test(sql), "…y la función no es de public ni anon");
  const sesion = leer("js/sesion.js");
  si(/reaccion: reaccionPresencia \|\| undefined/.test(sesion) && /pregunta_si_no: preguntaPresencia \|\| undefined/.test(sesion) && /revisarReaccionesYPregunta\(state\)/.test(sesion),
    "las reacciones y la pregunta de sí o no van por la presencia de la clase (no se guardan)");
  si(/rpc\("marcar_momento_de_clase", \{ p_clase: currentOpenSessionId \}\)/.test(sesion), "«Marcar este momento» llama a marcar_momento_de_clase() con la clase abierta");
  const ll = leer("js/clase-llamada.js");
  si(/mediaStreamTrack\.clone\(\)/.test(ll) && /monitor\.pista\.stop\(\)/.test(ll), "el aviso de hablar callado escucha una copia de la pista y la suelta al salir");
  const rep = leer("js/repasar-clases.js");
  const donde = (rep.match(/function dondeCae\(partes, t\)\{[\s\S]*?\n\}\n/) || [""])[0];
  let dondeCae = null;
  try { dondeCae = new Function(donde + "; return dondeCae;")(); } catch (e) { dondeCae = null; }
  if (dondeCae) {
    const partes = [{ creado_en: "2026-11-19T15:05:00Z", segundos: 300 }, { creado_en: "2026-11-19T15:10:00Z", segundos: 300 }];
    const a = dondeCae(partes, Date.parse("2026-11-19T15:07:30Z"));
    const b = dondeCae(partes, Date.parse("2026-11-19T15:01:00Z"));
    const c = dondeCae(partes, Date.parse("2026-11-19T16:00:00Z"));
    si(a && a.i === 1 && a.s === 145 && b && b.i === 0 && b.s === 55 && c === null,
      "una marca cae en su parte y su minuto (5 s antes), y una de cuando no se grababa no lleva a ningún lado (" + JSON.stringify([a, b, c]) + ")");
  } else mal("no encontré dondeCae() en repasar-clases.js");
  si(/timeZone: 'America\/Costa_Rica'/.test(rep), "…y la hora de cada marca se muestra en hora de Costa Rica");
}

console.log("\n=== Lo del 19/11 (2): quién habla, turnos, sala de espera, batería y el mes ===");
{
  const sesion = leer("js/sesion.js");
  const plan = (sesion.match(/function planDelTurno\(e, ahora, esElProfe, yo\) \{[\s\S]*?\n        }\n/) || [""])[0];
  let planDelTurno = null;
  try { planDelTurno = new Function(plan + "; return planDelTurno;")(); } catch (e) { planDelTurno = null; }
  if (planDelTurno) {
    const t0 = Date.parse("2026-11-19T15:00:00Z");
    const e = { id: "ana", at: "x", hasta: "2026-11-19T15:01:00Z" };
    const profe = planDelTurno(e, t0, true, "profe");
    const ana = planDelTurno(e, t0, false, "ana");
    const otro = planDelTurno(e, t0, false, "beto");
    const corto = planDelTurno({ id: "ana", hasta: "2026-11-19T15:00:05Z" }, t0, true, "profe");
    const sin = planDelTurno({ id: "ana" }, t0, true, "profe");
    si(profe.aviso === 50000 && profe.fin === 60000 && ana.aviso === 50000 && ana.fin === null && otro.aviso === null && otro.fin === null,
      "un turno de 1 minuto: aviso a los 50 s al profe y al alumno del turno (no a los demás), y solo la página del profe lo termina (" + JSON.stringify([profe, ana, otro]) + ")");
    si(corto.aviso === null && corto.fin === 5000 && sin.aviso === null && sin.fin === null, "…con menos de 10 s no hay aviso, y un turno sin tiempo no se termina solo");
  } else mal("no encontré planDelTurno() en sesion.js");
  si(/if \(tiempoDeTurnoMs > 0\) elegido\.hasta = /.test(sesion) && /programarFinDeTurno\(elegidoActual\);/.test(sesion),
    "el tiempo viaja con el turno (game_state.elegido.hasta) y el reloj se arma también al recargar");
  si(/const siguiente = await siguienteMano\(\);/.test(sesion) && /info\.hand_raised && \(!elegidoActual \|\| id !== elegidoActual\.id\)/.test(sesion),
    "al acabarse el tiempo la palabra pasa a la siguiente mano de la fila (no a quien ya la tenía)");
  const ll = leer("js/clase-llamada.js");
  si(/navigator\.getBattery/.test(ll) && /bateria\.charging/.test(ll) && /pct <= 5 \? 5 : pct <= 15 \? 15 : 0/.test(ll), "la batería: avisa al 15 % y al 5 % si no está cargando");
  // La participación del mes: la función pura, tal cual está.
  const part = leer("js/participacion-llamada.js");
  let porMes = null;
  try { const w = {}; new Function("window", part)(w); porMes = w.ParticipacionLlamada.porMes; } catch (e) { porMes = null; }
  if (porMes) {
    const meses = porMes(
      [{ clase: "c1", inicio: "2026-11-03T15:00:00Z" }, { clase: "c2", inicio: "2026-11-10T15:00:00Z" }, { clase: "c3", inicio: "2026-11-17T15:00:00Z" }, { clase: "c0", inicio: "2026-10-27T15:00:00Z" }],
      [{ clase: "c1", inicio: "2026-11-03T15:00:00Z", segundos: 125 }, { clase: "c3", inicio: "2026-11-17T15:00:00Z", segundos: 300 }],
      (x) => x.slice(0, 7));
    si(meses.length === 2 && meses[0].mes === "2026-11" && meses[0].total === 425 && meses[0].hablo === 2 && meses[0].estuvo === 3 && meses[1].hablo === 0 && meses[1].estuvo === 1,
      "la participación del mes: minutos, en cuántas clases habló y en cuántas estuvo, del mes más nuevo al más viejo (" + JSON.stringify(meses.map((m) => [m.mes, m.total, m.hablo, m.estuvo])) + ")");
  } else mal("no se pudo leer ParticipacionLlamada.porMes");
  const inf = leer("js/informes.js");
  si((inf.match(/renderParticipacion\(/g) || []).length >= 3 && /src="js\/participacion-llamada\.js"/.test(leer("informes.html")),
    "…y está en el informe del alumno, en la vista del profe y en la propia");
}

console.log("\n=== Lo del 19/11 (3): tonos, guía, primera vez, práctica y quién falta ===");
{
  const ll = leer("js/clase-llamada.js");
  si(/if \(!volTonos\) return;/.test(ll) && /0\.12 \* volTonos/.test(ll) && /if \(!conVibracion\) return;/.test(ll), "los tonos se bajan, se suben o se apagan, y la vibración aparte");
  si(/localStorage\.getItem\(CLAVE_PRIMERA\) !== "1"/.test(ll) && /reconectando !== true && esPrimeraVez\(\)/.test(ll), "la explicación de la primera vez sale una sola vez por aparato (y no al volver solo)");
  si(/quizasNoVolvio\(p\)/.test(ll) && /yaVolvio\(p\)/.test(ll) && /}, 60000\)\);/.test(ll), "quien sale y no vuelve en un minuto se le dice al profe (y si vuelve, no)");
  si(/llamar_a: llamarA \|\| undefined/.test(leer("js/sesion.js")), "«Avisarle» va por la presencia de la clase");
}

console.log("\n=== Lo del 19/11 (4): ronda, en privado, jugada por voz y concentración ===");
{
  const ll = leer("js/clase-llamada.js");
  let jugadaDicha = null;
  try { const w = {}; new Function("window", "document", "localStorage", ll)(w, {}, { getItem: () => null, setItem() {} }); jugadaDicha = w.ClaseLlamada.jugadaDicha; } catch (e) { jugadaDicha = null; }
  if (jugadaDicha) {
    const casos = [["Caballo efe tres.", "caballo f3"], ["peón e cuatro", "peón e4"], ["Alfil be cinco", "alfil b5"], ["dama de ocho", "dama d8"], ["Torre a uno.", "torre a1"], ["Enroque corto.", "enroque corto"], ["", ""]];
    const mal = casos.filter(([d, e]) => jugadaDicha(d) !== e);
    si(!mal.length, "lo dicho se vuelve jugada para el cuadro: «Caballo efe tres» → «caballo f3», «peón e cuatro» → «peón e4»…" + (mal.length ? " (falló: " + mal.map(([d]) => d + " → " + jugadaDicha(d)).join(", ") + ")" : ""));
  } else mal("no se pudo leer ClaseLlamada.jugadaDicha");
  si(/src="js\/reporte-transcribir\.js"/.test(leer("sesion.html")) && /ReporteTranscribir\.transcribir\(/.test(ll), "la jugada por voz usa el Whisper del aparato (el audio no sale de acá)");
  si(/setTrackSubscriptionPermissions\(false, \[\{ participantIdentity: p\.identity, allowAll: true \}\]\)/.test(ll) && /new Set\(privadoCon \? \[\] : pistasDeAudio\(\)\)/.test(ll),
    "en privado: el servidor de LiveKit deja oír al profe solo a ese alumno, y la grabación queda en silencio");
  const sesion = leer("js/sesion.js");
  si(/await darTurno\(id, "profe"\);/.test(sesion) && /!onlineStudents\.has\(ronda\.ids\[ronda\.i\]\)/.test(sesion) && /rondaTermino = true;/.test(sesion),
    "la ronda pasa por todos, salta a quien se desconectó y se cierra sola al terminar (el turno queda como del profe)");
  si(/privado: privadoPresencia \|\| undefined/.test(sesion) && /input\.form\.requestSubmit\(\)/.test(sesion), "lo privado va por la presencia, y la jugada dicha entra al cuadro como si se escribiera");
}

/* ------------------------------------------------------------------ 4 */

// La caja, tal cual está en sesion.html.
function cajaDeSesion() {
  const html = leer("sesion.html");
  const m = html.match(/<section id="llamada"[\s\S]*?<\/section>(\s*<!--[\s\S]*?-->\s*<div id="llamada-practicar-caja"[\s\S]*?<\/div>)?/);
  if (!m) throw new Error("no encontré <section id=\"llamada\"> en sesion.html");
  return m[0];
}

/* Un LiveKit de mentira: una sala con un profe ya conectado, eventos que la
   prueba dispara a mano y un micrófono que solo se enciende si el permiso lo
   deja, como el de verdad. */
const LIVEKIT_FALSO = `
(function () {
  const RoomEvent = {};
  ["ParticipantConnected","ParticipantDisconnected","TrackSubscribed","TrackUnsubscribed","ParticipantPermissionsChanged",
   "LocalTrackPublished","LocalTrackUnpublished","ConnectionQualityChanged","Reconnecting","Reconnected","Disconnected","ActiveSpeakersChanged",
   "TrackMuted","TrackUnmuted"].forEach((k) => { RoomEvent[k] = k; });
  class Room {
    constructor() {
      this.state = "disconnected";
      this.handlers = {};
      this.remoteParticipants = new Map();
      this.activeSpeakers = [];
      const yo = this;
      this.localParticipant = {
        permissions: { canPublish: false },
        isMicrophoneEnabled: false,
        isSpeaking: false,
        audioTrackPublications: new Map(),
        async setTrackSubscriptionPermissions(todos, lista) { (window.__permisosSub = window.__permisosSub || []).push({ todos, lista }); },
        async setMicrophoneEnabled(v) {
          if (v && !this.permissions.canPublish) throw new Error("sin permiso");
          this.isMicrophoneEnabled = v;
          yo.emit(v ? "LocalTrackPublished" : "LocalTrackUnpublished");
        },
      };
      window.__sala = this;
    }
    on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
    emit(ev, ...a) { (this.handlers[ev] || []).forEach((fn) => fn(...a)); }
    async connect(url, token) {
      window.__conecto = { url, token };
      this.state = "connected";
      this.localParticipant.permissions.canPublish = token === "pase-con-palabra";
      // Entran desordenados: la lista tiene que salir igual (tú, el profe, los demás por nombre).
      const p = (name, rol, habla, identity) => ({ name, identity, attributes: { rol }, permissions: { canPublish: habla }, isSpeaking: false, audioTrackPublications: new Map() });
      this.remoteParticipants.set("zoe", p("Zoe Álvarez", "alumno", false, "u-zoe"));
      this.remoteParticipants.set("profe", p("Karina Rojas", "profe", true, "u-karina"));
      this.remoteParticipants.set("ana", p("ana Mora", "alumno", true, "u-ana2"));
    }
    async startAudio() {}
    async switchActiveDevice(tipo, id) { window.__dispositivo = { tipo, id }; }
    async disconnect() { this.state = "disconnected"; this.emit("Disconnected", 1); }
    // Lo que hace el servidor al cambiarle el permiso a alguien.
    __permiso(v) {
      const antes = { ...this.localParticipant.permissions };
      this.localParticipant.permissions = { canPublish: v };
      if (!v && this.localParticipant.isMicrophoneEnabled) { this.localParticipant.isMicrophoneEnabled = false; this.emit("LocalTrackUnpublished"); }
      this.emit("ParticipantPermissionsChanged", antes, this.localParticipant);
    }
  }
  window.LivekitClient = { Room, RoomEvent, ConnectionQuality: { Poor: "poor" },
    DisconnectReason: { CLIENT_INITIATED: 1, DUPLICATE_IDENTITY: 2, PARTICIPANT_REMOVED: 4, ROOM_DELETED: 5, SIGNAL_CLOSE: 9 } };
})();`;

function sbFalso(respuesta) {
  return `
window.__pedidos = [];
window.__sb = { functions: { async invoke(nombre, op) {
  window.__pedidos.push({ nombre, body: op.body });
  const r = ${JSON.stringify(respuesta)};
  if (r.status !== 200) return { data: null, error: { context: { json: async () => r.cuerpo } } };
  // Lo que la prueba quiere que conteste cada acción además (el grupo del pase, «silenciar»).
  return { data: Object.assign({}, r.cuerpo, (window.__extra || {})[op.body.accion] || {}), error: null };
} } };`;
}

async function abrir(browser, { esProfe = false, respuesta, abierta = true, grabando = false }) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.setContent(`<!doctype html><html lang="es"><body>${cajaDeSesion()}</body></html>`);
  await page.addScriptTag({ content: LIVEKIT_FALSO });
  await page.addScriptTag({ content: sbFalso(respuesta) });
  await page.addScriptTag({ path: path.join(RAIZ, "js/clase-llamada.js") });
  await page.evaluate(({ esProfe, abierta, grabando }) => {
    window.__manos = [];
    window.__abrir = [];
    window.__fuera = [];
    window.__modos = [];
    window.__grabar = [];
    window.__partes = [];
    window.__fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    window.__tema = { clave: "posicion:", texto: "Partida desde la posición inicial" };
    window.__hablado = [];
    let mano = false;
    window.__llamada = ClaseLlamada.montar({
      sb: window.__sb, profesorId: "u-profe", esProfe, miNombre: "Luis Pérez", yo: "u-ana",
      nombreDe: (id) => ({ "u-beto": "Beto Solís", "u-cata": "Cata Mora" })[id] || "",
      alumnosDeLaClase: () => window.__alumnos || ["u-a", "u-b", "u-c", "u-d", "u-e"],
      grupos: async (v) => { (window.__grupos = window.__grupos || []).push(v); window.__llamada.estado(true, "turno", false, v); return ""; },
      reaccionar: async (tipo) => { (window.__reacciones = window.__reacciones || []).push(tipo); return window.__preguntaAbierta && (tipo === "si" || tipo === "no") ? "respuesta" : "reaccion"; },
      preguntarSiNo: async (abrir) => { (window.__preguntas = window.__preguntas || []).push(abrir); return abrir ? null : { si: ["Ana"], no: ["Zoe"], faltan: [] }; },
      marcarMomento: async () => { window.__marcas = (window.__marcas || 0) + 1; return ""; },
      enfocarTablero: () => { window.__alTablero = (window.__alTablero || 0) + 1; return true; },
      siguienteMano: async () => window.__siguienteR || ({ nombre: window.__siguiente === undefined ? "Beto Solís" : window.__siguiente }),
      tiempoDeTurno: (ms) => { (window.__tiempos = window.__tiempos || []).push(ms); },
      llamarALaLlamada: async (id) => { (window.__llamados = window.__llamados || []).push(id); },
      ronda: async (empezar) => { (window.__rondas = window.__rondas || []).push(empezar); return empezar ? { nombre: "Ana Mora", total: 3 } : {}; },
      privado: async (id) => { (window.__privados = window.__privados || []).push(id); },
      jugarTexto: (t) => { (window.__jugadas = window.__jugadas || []).push(t); return ""; },
      alternarMano: async () => { mano = !mano; window.__manos.push(mano); return mano; },
      // Como sesion.js: abrir la llamada la deja grabando; terminarla, no.
      abrir: async (v) => { window.__abrir.push(v); window.__llamada.estado(v, "turno", v); return ""; },
      modo: async (m) => { window.__modos.push(m); return ""; },
      grabar: async (v) => { window.__grabar.push(v); return ""; },
      claseActual: () => "clase-1",
      // Ana tiene el permiso de su familia; Zoe no.
      permisosDeVoz: async (ids) => { window.__permisosPedidos = ids; return new Set(["u-ana2"]); },
      subirParte: async (blob, segundos, tipo, clase, marcas) => { window.__partes.push({ bytes: blob.size, tipo, clase, marcas }); return ""; },
      // La posición que ve la clase: la prueba la cambia mientras se graba.
      posicion: () => window.__fen,
      tema: () => window.__tema,
      sumarHablado: async (clase, tanda) => { window.__hablado.push({ clase, tanda }); return true; },
      // Zoe ya había hablado casi dos minutos antes (el profe recargó la página).
      hablaronAntes: async () => new Map([["u-zoe", 118]]),
      anunciarFuera: (t) => window.__fuera.push(t),
    });
    window.__llamada.estado(abierta, "turno", abierta && grabando);
  }, { esProfe, abierta, grabando });
  return { ctx, page, errores };
}

const anuncio = async (page) => { await page.waitForTimeout(150); return page.textContent("#llamada-estado"); };
const visible = (page, sel) => page.$eval(sel, (el) => el.checkVisibility());
const PASE = (token, permiso_voz = true) => ({ status: 200, cuerpo: { url: "wss://x.livekit.cloud", token, sala: "clase-1", rol: "alumno", yo: "u-ana", puede_hablar: token === "pase-con-palabra", permiso_voz } });

async function pruebas(browser) {
  console.log("\n=== La caja, en un navegador ===");

  // Sin la llamada abierta, al alumno no le sale nada; le aparece cuando el profe la abre.
  let r = await abrir(browser, { respuesta: PASE("pase-sin-palabra"), abierta: false });
  si(!(await visible(r.page, "#llamada")), "sin la llamada abierta, al alumno no le sale la caja");
  await r.page.evaluate(() => window.__llamada.estado(true));
  si(await visible(r.page, "#llamada") && /Tu profe abrió la llamada de la clase/.test(await anuncio(r.page)), "cuando el profe la abre, le aparece y se lo dice");
  await r.page.click("#llamada-entrar");
  await anuncio(r.page);
  await r.page.evaluate(() => window.__llamada.estado(false));
  await r.page.waitForTimeout(150);
  si(!(await visible(r.page, "#llamada")), "cuando el profe la termina, la caja se le esconde");
  si(await r.page.evaluate(() => window.__sala.state) === "disconnected", "…y sale de la sala aunque el servidor tarde");
  si(/Tu profe terminó la llamada de la clase\. Saliste de la llamada\./.test((await r.page.evaluate(() => window.__fuera)).join(" ")), "…y se lo dice fuera de la caja (su región viva se fue con ella)");
  await r.ctx.close();

  // El alumno sin la palabra.
  r = await abrir(browser, { respuesta: PASE("pase-sin-palabra") });
  si(await visible(r.page, "#llamada"), "la caja se ve al montarla");
  si(await visible(r.page, "#llamada-entrar") && !(await visible(r.page, "#llamada-mic")), "antes de entrar: «Entrar a la llamada», sin el botón del micrófono");
  await r.page.click("#llamada-entrar");
  let a = await anuncio(r.page);
  si(/Entraste a la llamada; hay 3 personas más/.test(a) && /levanta la mano con Alt Y/.test(a), "al entrar dice cuántos hay y cómo pedir la palabra: «" + a + "»");
  si(await visible(r.page, "#llamada-lista"), "ya dentro se ve la lista de quiénes están");
  si(await r.page.textContent("#llamada-gente-titulo") === "En la llamada (4)", "…con cuántos son, contándote");
  const nombres = await r.page.$$eval("#llamada-lista li", (lis) => lis.map((li) => li.children[0].textContent));
  si(JSON.stringify(nombres) === JSON.stringify(["Luis Pérez", "Karina Rojas", "ana Mora", "Zoe Álvarez"]),
    "…en orden: tú, el profe y los demás por nombre, sin importar mayúsculas ni el orden en que entraron (" + nombres.join(", ") + ")");
  const detalles = await r.page.$$eval("#llamada-lista li", (lis) => lis.map((li) => li.children[1].textContent));
  si(detalles[0] === "tú" && detalles[1] === "profe" && detalles[2] === "con la palabra" && detalles[3] === "", "…diciendo escrito quién es el profe y quién tiene la palabra (" + detalles.join(" | ") + ")");
  si(await r.page.getAttribute("#llamada-gente", "aria-live") === null, "…y la lista no es región viva (lo que cambia ya se anuncia aparte)");
  await r.page.evaluate(() => { const z = window.__sala.remoteParticipants.get("zoe"); z.isSpeaking = true; window.__sala.activeSpeakers = [z]; window.__sala.emit("ActiveSpeakersChanged", [z]); });
  si(/hablando/.test(await r.page.textContent("#llamada-lista li:nth-child(4)")), "quien habla lo dice la lista, sin anunciarlo");
  const pedido = await r.page.evaluate(() => window.__pedidos[0]);
  si(pedido && pedido.nombre === "clase-llamada" && pedido.body.accion === "pase" && pedido.body.profesor === "u-profe", "pide el pase a clase-llamada con el profesor de la clase");
  si(await visible(r.page, "#llamada-mic") && !(await visible(r.page, "#llamada-entrar")), "ya dentro: el micrófono a la vista y «Entrar» no");
  si(await r.page.evaluate(() => document.activeElement.id) === "llamada-mic", "el foco queda en el micrófono");
  await r.page.keyboard.press("Alt+KeyM");
  a = await anuncio(r.page);
  si(/Todavía no tienes la palabra/.test(a), "Alt+M sin la palabra no enciende nada y lo dice");
  si(await r.page.getAttribute("#llamada-mic", "aria-pressed") === "false", "…y el micrófono sigue apagado (aria-pressed)");
  await r.page.keyboard.press("Alt+KeyY");
  a = await anuncio(r.page);
  si(JSON.stringify(await r.page.evaluate(() => window.__manos)) === "[true]" && /Levantaste la mano/.test(a), "Alt+Y levanta la mano DE LA CLASE y lo dice");
  await r.page.evaluate(() => window.__sala.__permiso(true));
  a = await anuncio(r.page);
  si(/Tu profe te dio la palabra: enciende el micrófono con Alt M/.test(a), "cuando el servidor le da la palabra, se dice");
  si(await r.page.getAttribute("#llamada-mic", "aria-pressed") === "false", "…pero el micrófono NO se enciende solo");
  await r.page.keyboard.press("Alt+KeyM");
  a = await anuncio(r.page);
  si(/Micrófono encendido/.test(a) && await r.page.getAttribute("#llamada-mic", "aria-pressed") === "true", "con la palabra, Alt+M lo enciende (aria-pressed y anuncio)");
  si(/encendido/.test(await r.page.textContent("#llamada-mic")), "…y el botón lo dice escrito, no solo con el color");
  await r.page.evaluate(() => window.__sala.__permiso(false));
  a = await anuncio(r.page);
  si(/Se terminó tu turno: tu micrófono se apagó/.test(a) && await r.page.getAttribute("#llamada-mic", "aria-pressed") === "false", "al terminar el turno se apaga y se dice");
  await r.page.keyboard.press("Alt+KeyQ");
  a = await anuncio(r.page);
  si(/^En la llamada hay 4 contigo: Karina Rojas, el profe; ana Mora, con la palabra; Zoe Álvarez\.$/.test(a), "Alt+Q dice quién está, en el mismo orden que la lista: «" + a + "»");
  await r.page.keyboard.press("Alt+KeyW");
  si(/Está hablando Zoe Álvarez/.test(await anuncio(r.page)), "Alt+W dice quién habla");
  await r.page.evaluate(() => window.__sala.emit("Disconnected", 4));
  a = await anuncio(r.page);
  si(/Tu profe te sacó de la llamada/.test(a), "si el servidor lo saca, se lo dice");
  si(await visible(r.page, "#llamada-entrar") && await r.page.evaluate(() => document.activeElement.id) === "llamada-entrar", "…y vuelve a «Entrar», con el foco ahí");
  si(!(await visible(r.page, "#llamada-gente")), "…y la lista se esconde");
  si(!(await visible(r.page, "#llamada-modos")), "al alumno no se le muestra «Quién puede hablar»");
  si(!r.errores.length, "sin errores en la página" + (r.errores.length ? ": " + r.errores.join(" | ") : ""));
  await r.ctx.close();

  // El alumno sin permiso de su familia, con la clase grabándose.
  r = await abrir(browser, { respuesta: PASE("pase-con-palabra", false), grabando: true });
  si(await visible(r.page, "#llamada-grabando"), "al alumno también le sale «Se está grabando la clase»");
  await r.page.click("#llamada-entrar");
  a = await anuncio(r.page);
  si(/Esta clase se está grabando\. Mientras se graba no puedes encender el micrófono: tu familia todavía no dio permiso/.test(a), "al entrar sin permiso se le dice que se graba y por qué no puede hablar");
  si(!(await visible(r.page, "#llamada-grabar")), "al alumno no se le muestra «Pausar la grabación»");
  si(!/sin permiso de grabación/.test(await r.page.textContent("#llamada-lista")), "…ni quién tiene o no el permiso de grabación (eso es solo para el profe)");
  await r.page.evaluate(() => window.__sala.__permiso(false));
  await r.page.keyboard.press("Alt+KeyM");
  si(/tu familia todavía no dio permiso/.test(await anuncio(r.page)), "Alt+M se lo recuerda");
  await r.page.evaluate(() => window.__llamada.estado(true, "turno", false));
  si(/Se pausó la grabación de la clase/.test(await anuncio(r.page)) && !(await visible(r.page, "#llamada-grabando")), "cuando el profe pausa, se le dice y el aviso se quita");
  await r.ctx.close();

  // «Pasar a texto» en «Repasar mis clases»: las dos funciones tal cual están en
  // js/repasar-clases.js, con el motor de mentira de ReporteTranscribir.
  {
    const rep = leer("js/repasar-clases.js");
    const fn = (nombre) => (rep.match(new RegExp("function " + nombre + "\\([\\s\\S]*?\\n\\}\\n")) || [""])[0];
    const codigo = fn("textoPlegado") + fn("cajaDeTexto");
    for (const [yo, esperado, que] of [["u-profe", /quedó guardado y tus alumnos ya lo pueden leer/, "el profe"], ["u-ana", /queda solo en tu pantalla/, "el alumno"]]) {
      const ctx = await browser.newContext({ serviceWorkers: "block" });
      const page = await ctx.newPage();
      await page.route("**/parte.webm", (ruta) => ruta.fulfill({ status: 200, contentType: "audio/webm", body: "x" }));
      await page.setContent("<!doctype html><body><div id='aca'></div></body>");
      await page.addScriptTag({ path: path.join(RAIZ, "js/reporte-transcribir.js") });
      await page.evaluate(({ codigo, yo }) => {
        window.__guardado = null;
        window.sb = { rpc: async (n, a) => { window.__guardado = { n, a }; return { error: null }; } };
        window.yoId = yo;
        ReporteTranscribir.transcribir = async (blob, avance) => { avance({ detalle: "Transcribiendo…" }); return "  Hoy vemos la oposición.  "; };
        ReporteTranscribir.hayCómo = () => true;
        // eslint-disable-next-line no-new-func
        new Function("yoId", codigo + "; window.__caja = cajaDeTexto;")(yo);
        document.getElementById("aca").appendChild(window.__caja({ id: "g1", profesor_id: "u-profe", texto: null }, "https://grabacion.test/parte.webm", 0));
      }, { codigo, yo });
      await page.click("text=📝 Pasar a texto");
      await page.waitForTimeout(400);
      const texto = await page.textContent("#grabacion-texto-0").catch(() => "");
      const estado = await page.textContent("[role=status]");
      const guardado = await page.evaluate(() => window.__guardado);
      si(texto === "Hoy vemos la oposición." && esperado.test(estado), "«Pasar a texto», " + que + ": muestra el texto y «" + estado + "»");
      si(yo === "u-profe" ? (guardado && guardado.n === "guardar_texto_grabacion" && guardado.a.p_id === "g1") : guardado === null,
        yo === "u-profe" ? "…y el profe lo guarda (guardar_texto_grabacion)" : "…y el alumno NO lo guarda (no podría poner un texto falso para los demás)");
      await ctx.close();
    }
  }

  // El alumno se entera de quién puede hablar.
  r = await abrir(browser, { respuesta: PASE("pase-sin-palabra") });
  await r.page.click("#llamada-entrar");
  await anuncio(r.page);
  await r.page.evaluate(() => window.__llamada.estado(true, "bloqueada"));
  si(/Tu profe bloqueó los micrófonos/.test(await anuncio(r.page)), "cuando el profe bloquea, el alumno lo oye");
  await r.page.keyboard.press("Alt+KeyM");
  si(/bloqueó los micrófonos/.test(await anuncio(r.page)), "…y Alt+M le recuerda por qué no puede hablar");
  await r.page.evaluate(() => window.__llamada.estado(true, "libre"));
  si(/Tu profe abrió el micrófono para todos/.test(await anuncio(r.page)), "cuando abre el micrófono para todos, también");
  await r.page.evaluate(() => window.__llamada.estado(true, "turno"));
  si(/Tu profe volvió al turno/.test(await anuncio(r.page)), "…y cuando vuelve al turno");
  await r.ctx.close();

  // «Mantener para hablar».
  r = await abrir(browser, { respuesta: PASE("pase-con-palabra") });
  await r.page.click("#llamada-entrar");
  await anuncio(r.page);
  si(await visible(r.page, "#llamada-ptt-caja"), "dentro de la llamada se ve «Mantener para hablar»");
  await r.page.check("#llamada-ptt");
  si(/Mantén apretado para hablar/.test(await r.page.textContent("#llamada-mic")), "con «Mantener para hablar», el botón dice que hay que mantenerlo apretado");
  const micOn = () => r.page.evaluate(() => window.__sala.localParticipant.isMicrophoneEnabled);
  await r.page.keyboard.down("Alt");
  await r.page.keyboard.down("KeyP");
  await r.page.waitForTimeout(150);
  const conAltP = await micOn();
  await r.page.keyboard.up("KeyP");
  await r.page.keyboard.up("Alt");
  await r.page.waitForTimeout(150);
  si(conAltP === true && await micOn() === false, "Alt+P apretado enciende el micrófono, y al soltarlo se apaga");
  const caja = await r.page.$("#llamada-mic");
  const bb = await caja.boundingBox();
  await r.page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await r.page.mouse.down();
  await r.page.waitForTimeout(150);
  const conBoton = await micOn();
  await r.page.mouse.up();
  await r.page.waitForTimeout(150);
  si(conBoton === true && await micOn() === false, "el botón del micrófono, mantenido apretado, también (y soltarlo no lo deja encendido)");
  await r.page.focus("#llamada-mic");
  await r.page.keyboard.down("Space");
  await r.page.waitForTimeout(150);
  const conEspacio = await micOn();
  await r.page.keyboard.up("Space");
  await r.page.waitForTimeout(150);
  si(conEspacio === true && await micOn() === false, "…y con Espacio, con el foco en el botón");
  await r.page.evaluate(() => window.__sala.__permiso(false));
  await r.page.keyboard.down("Alt"); await r.page.keyboard.down("KeyP");
  await r.page.waitForTimeout(150);
  si(await micOn() === false && /Todavía no tienes la palabra/.test(await anuncio(r.page)), "sin la palabra, Alt+P no enciende nada y lo dice");
  await r.page.keyboard.up("KeyP"); await r.page.keyboard.up("Alt");
  await r.ctx.close();

  // El alumno que ya tenía el turno al entrar.
  r = await abrir(browser, { respuesta: PASE("pase-con-palabra") });
  await r.page.click("#llamada-entrar");
  si(/Tienes la palabra: enciende el micrófono/.test(await anuncio(r.page)), "quien entra con el turno se entera al entrar");
  si(await r.page.isHidden("#llamada-atajo-mano") === false, "al alumno se le muestra el atajo de la mano");
  await r.ctx.close();

  // El profe: entra, y al entrar acomoda la sala.
  r = await abrir(browser, { esProfe: true, abierta: false, respuesta: { status: 200, cuerpo: { url: "wss://x", token: "pase-con-palabra", sala: "clase-1", rol: "profe", yo: "u-profe", puede_hablar: true } } });
  si(await visible(r.page, "#llamada") && /Abrir la llamada a la clase/.test(await r.page.textContent("#llamada-entrar")), "al profe la caja le sale siempre, con «Abrir la llamada a la clase»");
  si(!(await visible(r.page, "#llamada-atajo-mano")), "al profe no se le muestra el atajo de la mano");
  await r.page.click("#llamada-entrar");
  await r.page.waitForTimeout(200);
  const acciones = await r.page.evaluate(() => window.__pedidos.map((p) => p.body.accion));
  si(JSON.stringify(acciones) === JSON.stringify(["pase", "sincronizar"]), "el profe al entrar pide su pase y acomoda la sala (" + acciones.join(", ") + ")");
  si(JSON.stringify(await r.page.evaluate(() => window.__abrir)) === "[true]", "…abriendo antes la llamada a la clase");
  await r.page.waitForTimeout(600);
  const filaZoe = await r.page.$$eval("#llamada-lista li", (lis) => (lis.find((li) => /Zoe/.test(li.textContent)) || {}).textContent || "");
  const filaAna = await r.page.$$eval("#llamada-lista li", (lis) => (lis.find((li) => /ana Mora/.test(li.textContent)) || {}).textContent || "");
  si(/sin permiso de grabación: no puede hablar/.test(filaZoe) && !/sin permiso/.test(filaAna), "el profe ve quién no tiene permiso de grabación, y que mientras se graba no puede hablar («" + filaZoe + "»)");
  si(JSON.stringify((await r.page.evaluate(() => window.__permisosPedidos)).sort()) === JSON.stringify(["u-ana2", "u-zoe"]), "…preguntando por los alumnos de la llamada, no por el profe");
  si(await visible(r.page, "#llamada-grabando") && await r.page.textContent("#llamada-grabar") === "⏸ Pausar la grabación", "al abrirla se graba sola: «Se está grabando la clase» a la vista y «Pausar la grabación»");
  await r.page.waitForTimeout(300);
  await r.page.evaluate(() => { window.__fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"; });
  await r.page.waitForTimeout(1300);
  await r.page.click("#llamada-grabar");
  await r.page.waitForTimeout(600);
  const partes = await r.page.evaluate(() => window.__partes);
  const marcas = (partes[0] && partes[0].marcas) || [];
  si(marcas.length === 2 && marcas[0].s === 0 && marcas[0].fen === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" && marcas[1].fen === "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1" && marcas[1].s > 0.5 && marcas[1].s < 2.5,
    "la parte se sube con las posiciones del tablero y el segundo de cada una (" + JSON.stringify(marcas.map((m) => m.s)) + ")");
  si(JSON.stringify(await r.page.evaluate(() => window.__grabar)) === "[false]" && partes.length === 1 && partes[0].bytes > 0 && partes[0].clase === "clase-1" && /^audio\//.test(partes[0].tipo),
    "pausar guarda la parte grabada (" + JSON.stringify(partes) + ") y lo anota para todos");
  si(!(await visible(r.page, "#llamada-grabando")) && await r.page.textContent("#llamada-grabar") === "⏺ Volver a grabar" && /Pausaste la grabación/.test(await anuncio(r.page)), "…el aviso se quita, el botón dice «Volver a grabar» y se dice");
  await r.page.click("#llamada-grabar");
  await r.page.waitForTimeout(300);
  si(JSON.stringify(await r.page.evaluate(() => window.__grabar)) === "[false,true]" && await visible(r.page, "#llamada-grabando"), "volver a grabar lo anota y vuelve el aviso");
  // Los temas: el profe pasa a una diapositiva y vuelve al tablero, sin marcar nada.
  await r.page.evaluate(() => {
    window.__tema = { clave: "diapositiva:d1:3", texto: "Diapositiva 3: La oposición" };
    const z = window.__sala.remoteParticipants.get("zoe"); z.isSpeaking = true;   // y Zoe habla
  });
  await r.page.waitForTimeout(1300);
  await r.page.evaluate(() => { window.__tema = { clave: "posicion:", texto: "Partida desde la posición inicial" }; });
  await r.page.waitForTimeout(1300);
  si(/habló 2 minutos/.test(await r.page.$$eval("#llamada-lista li", (lis) => (lis.find((li) => /Zoe/.test(li.textContent)) || {}).textContent || "")),
    "el profe ve cuánto habló cada alumno, sumando lo de antes de recargar («habló 2 minutos»)");
  si(await r.page.textContent("#llamada-salir") === "Terminar la llamada", "el profe no «sale»: «Terminar la llamada»");
  await r.page.keyboard.press("Alt+KeyY");
  await r.page.waitForTimeout(100);
  si(JSON.stringify(await r.page.evaluate(() => window.__manos)) === "[]", "Alt+Y no hace nada al profe");
  const cuentaSinc = () => r.page.evaluate(() => window.__pedidos.filter((p) => p.body.accion === "sincronizar").length);
  const antesSinc = await cuentaSinc();
  await r.page.evaluate(() => window.__llamada.sincronizar());
  si(await cuentaSinc() === antesSinc + 1, "sincronizar() del profe le pide a la función que acomode la sala");
  si(await visible(r.page, "#llamada-modos"), "dentro de la llamada, el profe ve «Quién puede hablar»");
  si(await r.page.textContent('[data-modo="turno"]') === "✓ Con turno" && await r.page.getAttribute('[data-modo="turno"]', "aria-pressed") === "true", "…empieza «Con turno», marcado con aria-pressed y escrito («✓»)");
  await r.page.click('[data-modo="bloqueada"]');
  await r.page.waitForTimeout(200);
  si(JSON.stringify(await r.page.evaluate(() => window.__modos)) === '["bloqueada"]' && await cuentaSinc() === antesSinc + 2,
    "«Nadie» lo guarda y le pide al servidor que les quite la palabra");
  si(/Micrófonos bloqueados: solo hablas tú/.test(await anuncio(r.page)) && await r.page.getAttribute('[data-modo="bloqueada"]', "aria-pressed") === "true", "…y lo dice");
  await r.page.click('[data-modo="libre"]');
  await r.page.waitForTimeout(200);
  si(/Micrófono libre: todos pueden hablar/.test(await anuncio(r.page)) && await r.page.textContent('[data-modo="libre"]') === "✓ Todos", "«Todos» también");
  await r.page.click("#llamada-salir");
  await r.page.waitForTimeout(200);
  si(JSON.stringify(await r.page.evaluate(() => window.__abrir)) === "[true,false]" && await cuentaSinc() === antesSinc + 4,
    "«Terminar la llamada» la cierra para todos (llamada_sesion en null) y le pide al servidor que saque a los demás");
  si((await r.page.evaluate(() => window.__partes)).length === 2, "al terminar la llamada se sube la última parte");
  const temas = ((await r.page.evaluate(() => window.__partes))[1].marcas || []).filter((m) => m.tema).map((m) => m.tema);
  si(JSON.stringify(temas) === JSON.stringify(["Partida desde la posición inicial", "Diapositiva 3: La oposición", "De vuelta a: Partida desde la posición inicial"]),
    "la grabación anota sola los temas de la clase: dónde empieza la parte, la diapositiva y la vuelta al tablero (" + temas.join(" | ") + ")");
  const hablado = await r.page.evaluate(() => window.__hablado);
  const deZoe = hablado.reduce((t, h) => t + (h.tanda["u-zoe"] || 0), 0);
  si(deZoe >= 2 && hablado.every((h) => h.clase === "clase-1" && !h.tanda["u-karina"] && !h.tanda["u-ana2"]),
    "al salir se mandan los segundos que habló cada alumno, de ESA clase y sin el profe (" + JSON.stringify(hablado) + ")");
  si(/Terminaste la llamada para toda la clase/.test(await anuncio(r.page)) && await r.page.evaluate(() => window.__sala.state) === "disconnected", "…sale de la sala y lo dice");
  await r.ctx.close();

  // Los dos volúmenes y volver sola a la llamada.
  r = await abrir(browser, { respuesta: PASE("pase-sin-palabra") });
  si(!(await visible(r.page, "#llamada-volumenes")), "antes de entrar no se ven los volúmenes");
  await r.page.click("#llamada-entrar");
  await anuncio(r.page);
  si(await visible(r.page, "#llamada-vol-llamada") && await visible(r.page, "#llamada-vol-voz"), "dentro de la llamada: el volumen de la llamada y el de la voz de las jugadas, aparte");
  await r.page.evaluate(() => {
    window.__vol = null;
    window.__sala.remoteParticipants.get("ana").audioTrackPublications.set("a", { track: { setVolume: (v) => { window.__vol = v; } } });
    const poner = (id, v) => { const el = document.getElementById(id); el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); };
    poner("llamada-vol-llamada", 50);
    poner("llamada-vol-voz", 40);
  });
  si(await r.page.evaluate(() => window.__vol) === 0.5 && await r.page.textContent("#llamada-vol-llamada-valor") === "50 %"
    && await r.page.getAttribute("#llamada-vol-voz", "aria-valuetext") === "40 %", "bajar la llamada baja las voces, y cada barra dice su valor escrito");
  // La página de prueba (about:blank) no tiene localStorage: se mira el código.
  si(/localStorage\.setItem\(CLAVE_VOL, JSON\.stringify\(\{ llamada: volLlamada, voz: volVoz \}\)\)/.test(leer("js/clase-llamada.js")), "…y se recuerdan en el aparato");
  const voz = await r.page.evaluate(() => {
    const u = new SpeechSynthesisUtterance("e4");
    try { window.speechSynthesis.speak(u); } catch (e) { /* sin voz en el navegador de prueba */ }
    return { volumen: Math.round(u.volume * 100) / 100, llamada: window.__vol };
  });
  si(voz.volumen === 0.4 && voz.llamada === 0.15, "la voz de las jugadas suena con su volumen, y mientras habla la llamada baja al 30 % del suyo (" + JSON.stringify(voz) + ")");
  // Se cae sin que nadie lo pida: vuelve sola, sin mover el foco.
  await r.page.evaluate(() => { document.getElementById("llamada-quien").focus(); window.__sala.emit("Disconnected", 9); });
  si(/Se cayó la llamada\. Volviendo a entrar en 2 segundos/.test(await anuncio(r.page)), "si la llamada se cae sola, lo dice y vuelve a entrar");
  await r.page.waitForTimeout(2400);
  si(await r.page.evaluate(() => window.__pedidos.filter((p) => p.body.accion === "pase").length) === 2 && await r.page.evaluate(() => window.__sala.state) === "connected",
    "…pide otro pase y queda otra vez en la llamada");
  si(await r.page.evaluate(() => document.activeElement.id) !== "llamada-mic", "…sin llevarse el foco al micrófono");
  // Sin red: espera a que vuelva.
  await r.ctx.setOffline(true);
  await r.page.evaluate(() => window.__sala.emit("Disconnected", 9));
  si(/no hay conexión/.test(await anuncio(r.page)), "sin red, dice que vuelve en cuanto regrese la conexión");
  await r.page.waitForTimeout(2500);
  si(await r.page.evaluate(() => window.__pedidos.filter((p) => p.body.accion === "pase").length) === 2, "…y mientras no hay red no lo intenta");
  await r.ctx.setOffline(false);
  await r.page.waitForTimeout(2600);
  si(await r.page.evaluate(() => window.__sala.state) === "connected" && await r.page.evaluate(() => window.__pedidos.filter((p) => p.body.accion === "pase").length) === 3,
    "…y cuando vuelve la red, entra sola");
  // Si sale por su cuenta, no vuelve.
  await r.page.click("#llamada-salir");
  await r.page.waitForTimeout(2600);
  si(await r.page.evaluate(() => window.__pedidos.filter((p) => p.body.accion === "pase").length) === 3 && /Saliste de la llamada/.test(await r.page.textContent("#llamada-estado")),
    "quien sale por su cuenta no vuelve solo");
  si(!r.errores.length, "sin errores en la página" + (r.errores.length ? ": " + r.errores.join(" | ") : ""));
  await r.ctx.close();

  // El micrófono, la señal, quién habló último, el profe que apaga tu micrófono y los grupos (alumno).
  r = await abrir(browser, { respuesta: PASE("pase-sin-palabra") });
  si(await visible(r.page, "#llamada-probar") && await visible(r.page, "#llamada-microfono"), "antes de entrar: elegir el micrófono y «Probar el micrófono»");
  await r.page.click("#llamada-espacial");
  si(/Al entrar, cada voz va a sonar en su lugar/.test(await anuncio(r.page)), "«Cada voz en su lugar» dice que vale al entrar");
  await r.page.click("#llamada-entrar");
  await anuncio(r.page);
  si(!(await visible(r.page, "#llamada-probar")) && await visible(r.page, "#llamada-microfono"), "dentro de la llamada la prueba se esconde (la llamada ya dice si se oye) y el micrófono se sigue eligiendo");
  // Las voces en su lugar: el profe al centro, los alumnos a los lados (por nombre).
  const pan = await r.page.evaluate(() => {
    window.__pan = {};
    for (const [id, p] of window.__sala.remoteParticipants) {
      p.audioTrackPublications.set("a", { track: { setVolume() {}, setWebAudioPlugins: (n) => { window.__pan[id] = n[0]; } } });
    }
    window.__sala.emit("TrackSubscribed", { kind: "audio", attach: () => document.createElement("audio") });
    const v = (id) => (window.__pan[id] ? Math.round(window.__pan[id].pan.value * 10) / 10 : null);
    return { profe: v("profe"), ana: v("ana"), zoe: v("zoe") };
  });
  si(pan.profe === 0 && pan.ana === -0.8 && pan.zoe === 0.8, "cada voz en su lugar: el profe al centro, Ana a la izquierda y Zoe a la derecha (" + JSON.stringify(pan) + ")");
  // La señal débil: se dice una vez, con su tono, y también cuando mejora.
  await r.page.evaluate(() => window.__sala.emit("ConnectionQualityChanged", "poor", window.__sala.localParticipant));
  si(/Tu conexión está débil/.test(await anuncio(r.page)), "si tu conexión se pone débil, se dice");
  await r.page.evaluate(() => window.__sala.emit("ConnectionQualityChanged", "good", window.__sala.localParticipant));
  si(/Tu conexión mejoró/.test(await anuncio(r.page)), "…y cuando mejora, también");
  await r.page.evaluate(() => window.__sala.emit("ConnectionQualityChanged", "poor", window.__sala.localParticipant));
  si(/Tu conexión mejoró/.test(await anuncio(r.page)), "…pero no se repite a cada rato (una vez por minuto como mucho)");
  si(/señal débil/.test(await r.page.textContent("#llamada-lista")), "…y en la lista dice «señal débil» junto a ti");
  // Quién habló último.
  await r.page.evaluate(() => { const z = window.__sala.remoteParticipants.get("zoe"); z.isSpeaking = true; window.__sala.activeSpeakers = [z]; window.__sala.emit("ActiveSpeakersChanged", [z]);
    z.isSpeaking = false; window.__sala.activeSpeakers = []; window.__sala.emit("ActiveSpeakersChanged", []); });
  await r.page.click("#llamada-habla");
  a = await anuncio(r.page);
  si(/Nadie está hablando ahora\. Lo último lo dijo Zoe Álvarez, hace \d+ segundos?/.test(a), "si nadie habla, «Quién habla» dice quién habló último: «" + a + "»");
  // Apagarlo uno mismo no es «tu profe lo apagó» (LiveKit avisa los dos igual).
  await r.page.evaluate(() => window.__sala.__permiso(true));
  await anuncio(r.page);
  await r.page.keyboard.press("Alt+KeyM");
  await anuncio(r.page);
  await r.page.keyboard.press("Alt+KeyM");
  await r.page.evaluate(() => window.__sala.emit("TrackMuted", { kind: "audio" }, window.__sala.localParticipant));
  a = await anuncio(r.page);
  si(/Micrófono apagado/.test(a) && !/Tu profe apagó/.test(a), "apagar tu propio micrófono no se confunde con que te lo apagó el profe: «" + a + "»");
  await r.page.waitForTimeout(2100);
  // El profe te apagó el micrófono (no fuiste tú).
  await r.page.evaluate(() => window.__sala.emit("TrackMuted", { kind: "audio" }, window.__sala.localParticipant));
  si(/Tu profe apagó tu micrófono/.test(await anuncio(r.page)), "si el profe te apaga el micrófono, se dice");
  // Los grupos: el profe arma grupos y la página se muda sola a la sala del suyo.
  const pases = () => r.page.evaluate(() => window.__pedidos.filter((p) => p.body.accion === "pase").length);
  const antesPases = await pases();
  await r.page.evaluate(() => { window.__extra = { pase: { grupo: 2 } }; window.__llamada.estado(true, "turno", false, { "u-ana": 2, "u-beto": 2, "u-cata": 1 }); });
  await r.page.waitForTimeout(400);
  a = await anuncio(r.page);
  si(await pases() === antesPases + 1 && /Estás en el grupo 2 con Beto Solís\. En el grupo pueden hablar todos/.test(a) && await r.page.evaluate(() => window.__sala.state) === "connected",
    "cuando el profe arma grupos, el alumno pasa solo a la sala de su grupo y se le dice con quién está: «" + a + "»");
  si(!/Saliste de la llamada/.test(a), "…sin decir «saliste» al mudarse");
  await r.page.evaluate(() => { window.__extra = { pase: { grupo: 0 } }; window.__llamada.estado(true, "turno", false, null); });
  await r.page.waitForTimeout(400);
  a = await anuncio(r.page);
  si(await pases() === antesPases + 2 && /Volviste a la sala grande/.test(a), "…y al terminar los grupos vuelve a la sala grande: «" + a + "»");
  si(!r.errores.length, "sin errores en la página" + (r.errores.length ? ": " + r.errores.join(" | ") : ""));
  await r.ctx.close();

  // Lo del 19/11, del lado del alumno: reacciones, la pregunta, solo el profe, marcar y saltar al tablero.
  r = await abrir(browser, { respuesta: PASE("pase-sin-palabra") });
  si(!(await visible(r.page, "#llamada-reacciones")) && !(await visible(r.page, "#llamada-marcar")), "fuera de la llamada no están las reacciones ni «Marcar este momento»");
  await r.page.click("#llamada-entrar");
  await anuncio(r.page);
  si(await visible(r.page, "#llamada-reacciones") && await visible(r.page, "#llamada-marcar") && await visible(r.page, "#llamada-solo-profe"), "dentro: «Decirle a tu profe», «Marcar este momento» y «Solo oír al profe»");
  await r.page.keyboard.press("Alt+Digit1");
  a = await anuncio(r.page);
  si(JSON.stringify(await r.page.evaluate(() => window.__reacciones)) === '["no_entendi"]' && /Le dijiste a tu profe que no entendiste/.test(a), "Alt+1 le dice al profe «no entendí» y lo confirma: «" + a + "»");
  await r.page.evaluate(() => { window.__preguntaAbierta = true; window.__llamada.pregunta(true); });
  a = await anuncio(r.page);
  si(/Tu profe hace una pregunta de sí o no: contesta con Alt 3/.test(a) && await r.page.textContent('[data-reaccion="si"]') === "Sí (contestar)", "cuando el profe pregunta, se dice cómo contestar y «Sí» dice que contesta");
  await r.page.keyboard.press("Alt+Digit3");
  si(/Contestaste sí a la pregunta de tu profe/.test(await anuncio(r.page)), "Alt+3 contesta sí");
  await r.page.evaluate(() => { window.__preguntaAbierta = false; window.__llamada.pregunta(false); });
  si(/Tu profe cerró la pregunta/.test(await anuncio(r.page)), "…y se dice cuando el profe la cierra");
  const vols = await r.page.evaluate(() => {
    window.__v = {};
    for (const [id, p] of window.__sala.remoteParticipants) p.audioTrackPublications.set("a", { track: { setVolume: (v) => { window.__v[id] = v; } } });
    const c = document.getElementById("llamada-solo-profe");
    c.checked = true;
    c.dispatchEvent(new Event("change", { bubbles: true }));
    return window.__v;
  });
  si(vols.profe === 1 && vols.ana === 0 && vols.zoe === 0, "«Solo oír al profe» deja al profe y silencia a los compañeros, solo en este aparato (" + JSON.stringify(vols) + ")");
  await r.page.keyboard.press("Alt+KeyK");
  si(await r.page.evaluate(() => window.__marcas) === 1 && /Marcaste este momento/.test(await anuncio(r.page)), "Alt+K marca este momento y lo dice");
  await r.page.focus("#llamada-quien");
  await r.page.keyboard.press("Alt+KeyT");
  si(await r.page.evaluate(() => window.__alTablero) === 1, "Alt+T desde la llamada lleva al tablero");
  // El tablero de mentira no se lleva el foco: se pone en un botón fuera de la llamada.
  await r.page.evaluate(() => { const b = document.createElement("button"); b.id = "afuera"; b.textContent = "Tablero"; document.body.prepend(b); b.focus(); });
  await r.page.keyboard.press("Alt+KeyT");
  si(await r.page.evaluate(() => document.activeElement.id) === "llamada-mic", "…y desde otra parte, a la llamada (el micrófono)");
  // Hablar con el micrófono apagado: un tono de prueba como «voz» en la copia de la pista.
  const callado = await r.page.evaluate(async () => {
    try {
      const ctx = new AudioContext();
      await ctx.resume();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.5;
      const dest = ctx.createMediaStreamDestination();
      osc.connect(g).connect(dest);
      osc.start();
      const track = dest.stream.getAudioTracks()[0];
      window.__sala.localParticipant.audioTrackPublications.set("mic", { track: { mediaStreamTrack: track } });
      window.__sala.emit("LocalTrackPublished");
      return true;
    } catch (e) { return String(e); }
  });
  await r.page.waitForTimeout(2200);
  a = await r.page.textContent("#llamada-estado");
  si(callado === true && /Estás hablando con el micrófono apagado: nadie te oye\. Para hablar, levanta la mano con Alt Y/.test(a), "si hablas con el micrófono apagado, se dice (y sin la palabra, cómo pedirla): «" + a + "»");
  si(!r.errores.length, "sin errores en la página" + (r.errores.length ? ": " + r.errores.join(" | ") : ""));
  await r.ctx.close();

  // La sala de práctica y la guía de atajos (alumno, sin llamada abierta).
  r = await abrir(browser, { respuesta: PASE("pase-sin-palabra"), abierta: false });
  si(await visible(r.page, "#llamada-practicar") && !(await visible(r.page, "#llamada")), "sin llamada abierta, el alumno puede «Practicar la llamada»");
  await r.page.click("#llamada-practicar");
  si(/Estás en la sala de práctica/.test(await anuncio(r.page)) && await visible(r.page, "#llamada-mic") && await r.page.textContent("#llamada-salir") === "Terminar la práctica"
    && !(await visible(r.page, "#llamada-practicar")), "la práctica abre la caja con el micrófono de práctica y «Terminar la práctica»");
  await r.page.keyboard.press("Alt+KeyM");
  si(/Micrófono encendido \(de práctica/.test(await anuncio(r.page)) && await r.page.getAttribute("#llamada-mic", "aria-pressed") === "true", "en la práctica, Alt+M «enciende» el micrófono y lo dice");
  await r.page.keyboard.press("Alt+KeyY");
  await anuncio(r.page);
  await r.page.keyboard.press("Alt+Digit1");
  si(/En la clase, tu profe oiría: no entendí/.test(await anuncio(r.page)), "…Alt+1 dice lo que oiría el profe");
  si(await r.page.evaluate(() => window.__pedidos.length) === 0 && JSON.stringify(await r.page.evaluate(() => window.__manos)) === "[]"
    && !(await r.page.evaluate(() => window.__reacciones)), "…y nada sale del aparato: ni un pedido, ni la mano de la clase, ni la reacción");
  await r.page.keyboard.press("Alt+KeyH");
  a = await anuncio(r.page);
  si(/^Atajos de la llamada, 1 de 4\. Alt M .*Alt Y levanta o baja la mano\. Alt H para seguir\.$/.test(a), "Alt+H dice la guía de atajos del alumno, de a un grupo: «" + a.slice(0, 60) + "…»");
  await r.page.keyboard.press("Alt+KeyH");
  si(/^2 de 4\. Para decirle algo a tu profe/.test(await anuncio(r.page)), "…y al volver a apretarla sigue con el siguiente");
  await r.page.click("#llamada-salir");
  si(/Terminaste la práctica/.test(await anuncio(r.page)) && await visible(r.page, "#llamada-practicar") && !(await visible(r.page, "#llamada")), "«Terminar la práctica» la cierra");
  // Los tonos apagados.
  await r.page.click("#llamada-practicar");
  await r.page.selectOption("#llamada-tonos", "0");
  si(/Tonos apagados: los avisos siguen escritos/.test(await anuncio(r.page)), "los tonos se pueden apagar, y se dice que los avisos siguen escritos");
  si(!r.errores.length, "sin errores en la página" + (r.errores.length ? ": " + r.errores.join(" | ") : ""));
  await r.ctx.close();

  // Concentración, en privado y la jugada por voz (alumno).
  r = await abrir(browser, { respuesta: PASE("pase-sin-palabra") });
  await r.page.click("#llamada-entrar");
  await r.page.waitForTimeout(2800);
  await r.page.click("#llamada-concentracion");
  await anuncio(r.page);
  await r.page.evaluate(() => { document.getElementById("llamada-estado").textContent = "";
    const p = { name: "Beto Solís", identity: "u-beto", attributes: { rol: "alumno" }, permissions: { canPublish: false }, isSpeaking: false, audioTrackPublications: new Map() };
    window.__sala.remoteParticipants.set("beto", p); window.__sala.emit("ParticipantConnected", p); });
  await r.page.waitForTimeout(200);
  si(await r.page.textContent("#llamada-estado") === "", "con el modo concentración no se avisa que entró un compañero");
  await r.page.evaluate(() => { const p = window.__sala.remoteParticipants.get("profe"); window.__sala.emit("ParticipantConnected", p); });
  si(/Entró a la llamada Karina Rojas, el profe/.test(await anuncio(r.page)), "…pero que entró el profe, sí");
  await r.page.evaluate(() => window.__llamada.privado("yo"));
  const sub = await r.page.evaluate(() => window.__permisosSub[window.__permisosSub.length - 1]);
  si(/Tu profe te habla solo a ti/.test(await anuncio(r.page)) && sub.todos === false && sub.lista.length === 1 && sub.lista[0].participantIdentity === "u-profe",
    "cuando el profe le habla en privado, el alumno lo sabe y su voz la recibe solo el profe (" + JSON.stringify(sub) + ")");
  await r.page.evaluate(() => window.__llamada.privado(null));
  const sub2 = await r.page.evaluate(() => window.__permisosSub[window.__permisosSub.length - 1]);
  si(/Tu profe volvió a hablarle a todos/.test(await anuncio(r.page)) && sub2.todos === true, "…y al terminar, todos vuelven a oírlo");
  await r.page.evaluate(() => window.__llamada.privado("otro"));
  si(/Tu profe está ayudando a un compañero en privado/.test(await anuncio(r.page)), "a los demás se les dice que el profe está ayudando a un compañero");
  // La jugada por voz, con un transcriptor y un micrófono de mentira.
  si(await visible(r.page, "#llamada-dictar"), "dentro de la llamada está «Decir una jugada»");
  await r.page.evaluate(() => {
    window.ReporteTranscribir = { hayCómo: () => true, transcribir: async (blob) => { window.__blobDictado = blob.size; return "Caballo efe tres."; } };
    // about:blank no es un contexto seguro: no trae mediaDevices, se pone uno.
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => {
      const ctx = new AudioContext(); const osc = ctx.createOscillator(); const dest = ctx.createMediaStreamDestination(); osc.connect(dest); osc.start(); return dest.stream;
    } } });
  });
  await r.page.keyboard.press("Alt+KeyJ");
  await r.page.waitForTimeout(6200);
  si(JSON.stringify(await r.page.evaluate(() => window.__jugadas)) === '["caballo f3"]' && /Entendí: caballo f3/.test(await r.page.textContent("#llamada-estado")),
    "Alt+J graba, lo pasa a texto en el aparato y «caballo efe tres» entra al cuadro como «caballo f3»");
  si(!r.errores.length, "sin errores en la página" + (r.errores.length ? ": " + r.errores.join(" | ") : ""));
  await r.ctx.close();

  // Su profe lo espera en la llamada (alumno con la llamada abierta, sin entrar).
  r = await abrir(browser, { respuesta: PASE("pase-sin-palabra") });
  await r.page.evaluate(() => window.__llamada.teLlaman());
  si(/Tu profe te espera en la llamada/.test(await anuncio(r.page)), "cuando el profe le avisa, al alumno se le dice que lo espera en la llamada");
  await r.ctx.close();

  // Decir quién empieza a hablar y la sala de espera (alumno).
  r = await abrir(browser, { respuesta: PASE("pase-sin-palabra") });
  await r.page.click("#llamada-decir-quien");
  await r.page.click("#llamada-entrar");
  await r.page.waitForTimeout(2800);
  const hablar = (id, si) => r.page.evaluate(({ id, si }) => {
    const p = window.__sala.remoteParticipants.get(id);
    p.isSpeaking = si;
    window.__sala.activeSpeakers = si ? [p] : [];
    window.__sala.emit("ActiveSpeakersChanged", window.__sala.activeSpeakers);
  }, { id, si });
  await hablar("zoe", true);
  await r.page.waitForTimeout(900);
  si(await r.page.textContent("#llamada-estado") === "Habla Zoe Álvarez.", "con «Decir quién empieza a hablar», se dice el nombre de quien habla");
  await r.page.evaluate(() => { document.getElementById("llamada-estado").textContent = ""; });
  await hablar("zoe", false);
  await hablar("zoe", true);
  await r.page.waitForTimeout(900);
  si(await r.page.textContent("#llamada-estado") === "", "…y no se repite si la misma persona sigue hablando enseguida");
  await hablar("zoe", false);
  await hablar("profe", true);
  await r.page.waitForTimeout(900);
  si(await r.page.textContent("#llamada-estado") === "Habla Karina Rojas, el profe.", "…y cuando la voz pasa a otro, se dice (el profe, como profe)");
  await hablar("profe", false);
  // La sala de espera: el profe sale de la sala grande.
  await r.page.evaluate(() => { const p = window.__sala.remoteParticipants.get("profe"); window.__sala.remoteParticipants.delete("profe"); window.__sala.emit("ParticipantDisconnected", p); });
  await r.page.waitForTimeout(1800);
  si(/Tu profe salió de la llamada: te aviso cuando vuelva/.test(await r.page.textContent("#llamada-estado")), "si el profe sale de la llamada, el alumno lo sabe");
  si(!r.errores.length, "sin errores en la página" + (r.errores.length ? ": " + r.errores.join(" | ") : ""));
  await r.ctx.close();

  // Lo del 19/11, del lado del profe: las reacciones le llegan y la pregunta de sí o no.
  r = await abrir(browser, { esProfe: true, respuesta: PASE("pase-con-palabra"), abierta: false });
  await r.page.click("#llamada-entrar");
  await anuncio(r.page);
  si(!(await visible(r.page, "#llamada-reacciones")) && await visible(r.page, "#llamada-pregunta"), "el profe no tiene «Decirle a tu profe», y sí «Preguntar sí o no»");
  await r.page.evaluate(() => window.__llamada.reaccion("u-ana2", "ana Mora", "lento", false));
  a = await anuncio(r.page);
  si(/ana Mora pide ir más lento/.test(a) && /pide más lento/.test(await r.page.textContent("#llamada-lista")), "al profe le llega «pide ir más lento», con su tono, y queda en la lista: «" + a + "»");
  await r.page.click("#llamada-pregunta-btn");
  si(JSON.stringify(await r.page.evaluate(() => window.__preguntas)) === "[true]" && /Abriste una pregunta de sí o no/.test(await anuncio(r.page))
    && await r.page.getAttribute("#llamada-pregunta-btn", "aria-pressed") === "true", "«Preguntar sí o no» la abre (aria-pressed) y lo dice");
  await r.page.evaluate(() => window.__llamada.respuestas({ si: ["Ana"], no: [], faltan: ["Zoe"] }));
  si(await r.page.textContent("#llamada-pregunta-estado") === "Respuestas: 1 sí, 0 no; falta Zoe.", "…muestra el conteo y quién falta");
  await r.page.evaluate(() => window.__llamada.respuestas({ si: ["Ana"], no: ["Zoe"], faltan: [] }));
  si(/Contestaron todos: 1 sí, 1 no/.test(await anuncio(r.page)), "…y dice cuando contestaron todos");
  await r.page.click("#llamada-pregunta-btn");
  si(/Cerraste la pregunta: 1 sí, 1 no/.test(await anuncio(r.page)), "al cerrarla dice el conteo final");
  // La ronda y hablar en privado (el profe).
  await r.page.click("#llamada-ronda");
  si(/Empezó la ronda: habla Ana Mora \(1 de 3\)/.test(await anuncio(r.page)) && await r.page.getAttribute("#llamada-ronda", "aria-pressed") === "true", "«Ronda» la empieza (aria-pressed) y dice a quién le toca");
  await r.page.evaluate(() => { window.__siguienteR = { nombre: "Beto Solís", enRonda: true, lugar: 2, total: 3 }; });
  await r.page.keyboard.press("Alt+KeyN");
  si(/Le diste la palabra a Beto Solís \(2 de 3 en la ronda\)/.test(await anuncio(r.page)), "Alt+N pasa al siguiente de la ronda");
  await r.page.evaluate(() => { window.__siguienteR = { nombre: null, finRonda: true }; });
  await r.page.keyboard.press("Alt+KeyN");
  si(/Terminó la ronda: hablaron todos/.test(await anuncio(r.page)) && await r.page.textContent("#llamada-ronda") === "🔄 Ronda (todos, por turno)", "…y al terminar lo dice y el botón vuelve");
  await r.page.evaluate(() => { window.__siguienteR = null; });
  await r.page.click('#llamada-lista button[aria-label="Hablarle en privado a Zoe Álvarez"]');
  const subP = await r.page.evaluate(() => window.__permisosSub[window.__permisosSub.length - 1]);
  si(subP.todos === false && subP.lista[0].participantIdentity === "u-zoe" && JSON.stringify(await r.page.evaluate(() => window.__privados)) === '["u-zoe"]'
    && /Le hablas solo a Zoe Álvarez/.test(await anuncio(r.page)) && await visible(r.page, "#llamada-privado-fin"), "«En privado»: solo Zoe recibe la voz del profe, se avisa a la clase y aparece «Volver a hablarle a todos»");
  await r.page.click("#llamada-privado-fin");
  const subP2 = await r.page.evaluate(() => window.__permisosSub[window.__permisosSub.length - 1]);
  si(subP2.todos === true && JSON.stringify(await r.page.evaluate(() => window.__privados)) === '["u-zoe",null]' && /Volviste a hablarle a todos/.test(await anuncio(r.page)), "…y «Volver a hablarle a todos» lo deshace");
  // Quién está en la clase pero no en la llamada, y «Avisarle».
  await r.page.evaluate(() => { window.__alumnos = ["u-zoe", "u-beto"]; window.__llamada.refrescar(); });
  const faltan = await r.page.$$eval("#llamada-faltan-lista li span", (s) => s.map((x) => x.textContent));
  si(await visible(r.page, "#llamada-faltan") && JSON.stringify(faltan) === '["Beto Solís"]', "el profe ve quién está en la clase pero no en la llamada (" + faltan.join(", ") + ")");
  await r.page.click('#llamada-faltan-lista button[aria-label="Avisarle a Beto Solís que lo esperas en la llamada"]');
  si(JSON.stringify(await r.page.evaluate(() => window.__llamados)) === '["u-beto"]' && /Le avisaste a Beto Solís/.test(await anuncio(r.page)), "«Avisarle» le manda el aviso y lo dice");
  await r.page.click("#llamada-quien");
  si(/En la clase pero no en la llamada: Beto Solís\./.test(await anuncio(r.page)), "…y «Quién está» también dice quién no entró");
  await r.page.evaluate(() => { window.__alumnos = []; window.__llamada.refrescar(); });
  // Siguiente mano y el tiempo de cada turno.
  si(await visible(r.page, "#llamada-siguiente") && await visible(r.page, "#llamada-turno-tiempo"), "el profe tiene «Siguiente mano» y «Tiempo para cada turno»");
  await r.page.keyboard.press("Alt+KeyN");
  si(/Le diste la palabra a Beto Solís/.test(await anuncio(r.page)), "Alt+N le da la palabra a la siguiente mano y lo dice");
  await r.page.evaluate(() => { window.__siguiente = null; });
  await r.page.click("#llamada-siguiente");
  si(/No hay manos levantadas/.test(await anuncio(r.page)), "…y sin manos levantadas, lo dice");
  await r.page.selectOption("#llamada-turno-tiempo", "60");
  si(JSON.stringify(await r.page.evaluate(() => window.__tiempos)) === "[0,60000]" && /Cada turno va a durar 1 minuto/.test(await anuncio(r.page)),
    "elegir 1 minuto por turno se lo dice a la clase (sesion.js cuenta el tiempo) y lo anuncia");
  si(!r.errores.length, "sin errores en la página" + (r.errores.length ? ": " + r.errores.join(" | ") : ""));
  await r.ctx.close();

  // Los grupos y apagar un micrófono, del lado del profe.
  r = await abrir(browser, { esProfe: true, respuesta: PASE("pase-con-palabra"), abierta: false });
  await r.page.click("#llamada-entrar");
  await anuncio(r.page);
  si(await visible(r.page, "#llamada-grupos") && await r.page.textContent("#llamada-grupos-armar") === "Armar grupos", "el profe, dentro de la llamada, ve «Grupos»");
  await r.page.click("#llamada-grupos-armar");
  await r.page.waitForTimeout(200);
  const armados = (await r.page.evaluate(() => window.__grupos))[0] || {};
  si(Object.keys(armados).length === 5 && Object.values(armados).every((n) => n === 1 || n === 2), "«Armar grupos» reparte en parejas a los alumnos de la clase (5 → un grupo de 2 y uno de 3)");
  si(/Armaste 2 grupos/.test(await anuncio(r.page)), "…y lo dice");
  const botones = await r.page.$$eval("#llamada-grupos-lista button", (bs) => bs.map((b) => ({ t: b.textContent, p: b.getAttribute("aria-pressed") })));
  si(botones.length === 3 && botones[0].t === "✓ Sala grande (estás aquí)" && botones[0].p === "true" && /^Grupo 1: /.test(botones[1].t),
    "un botón por sala; la suya dice «✓ … (estás aquí)» y lleva aria-pressed (" + botones.map((b) => b.t).join(" | ") + ")");
  await r.page.click("#llamada-grupos-lista button:nth-child(2)");
  await r.page.waitForTimeout(400);
  const ultimoPase = await r.page.evaluate(() => window.__pedidos.filter((p) => p.body.accion === "pase").pop().body);
  si(ultimoPase.grupo === 1 && /Entraste al grupo 1/.test(await anuncio(r.page)), "el profe entra a un grupo: pide el pase de ese grupo y lo dice");
  // Apagar el micrófono de quien mete ruido.
  await r.page.evaluate(() => { window.__extra = { silenciar: { silenciado: true } }; const z = window.__sala.remoteParticipants.get("zoe"); z.isMicrophoneEnabled = true; window.__sala.emit("TrackUnmuted", {}, z); });
  const apagar = await r.page.$('#llamada-lista button[aria-label="Apagar el micrófono de Zoe Álvarez"]');
  si(Boolean(apagar), "junto a quien tiene el micrófono encendido, el profe tiene «Apagar su micrófono» (y dice de quién)");
  if (apagar) await apagar.click();
  await r.page.waitForTimeout(200);
  const sil = await r.page.evaluate(() => window.__pedidos.filter((p) => p.body.accion === "silenciar").pop());
  si(sil && sil.body.persona === "u-zoe" && /Apagaste el micrófono de Zoe Álvarez/.test(await anuncio(r.page)), "…se lo pide al servidor y lo dice");
  await r.page.click("#llamada-grupos-terminar");
  await r.page.waitForTimeout(400);
  const fin = await r.page.evaluate(() => ({ g: window.__grupos[window.__grupos.length - 1], pase: window.__pedidos.filter((p) => p.body.accion === "pase").pop().body }));
  si(fin.g === null && fin.pase.grupo === 0, "«Terminar los grupos» los borra y el profe vuelve a la sala grande");
  si(!r.errores.length, "sin errores en la página" + (r.errores.length ? ": " + r.errores.join(" | ") : ""));
  await r.ctx.close();

  // Los temas como capítulos en «Repasar mis clases»: las funciones tal cual están.
  {
    const rep = leer("js/repasar-clases.js");
    const fn = (nombre) => (rep.match(new RegExp("function " + nombre + "\\([\\s\\S]*?\\n\\}\\n")) || [""])[0];
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    const page = await ctx.newPage();
    await page.setContent("<!doctype html><body><audio id='au'></audio><div id='aca'></div></body>");
    const filas = await page.evaluate((codigo) => {
      // eslint-disable-next-line no-new-func
      const temasDeLaParte = new Function(codigo + "; return temasDeLaParte;")();
      const caja = temasDeLaParte([{ s: 0, fen: "x", tema: "Partida desde la posición inicial" }, { s: 4, fen: "y" }, { s: 75.4, tema: "Diapositiva 2: <b>Clavada</b>" }], document.getElementById("au"), 0);
      document.getElementById("aca").appendChild(caja);
      return { botones: [...caja.querySelectorAll("button")].map((b) => b.textContent), resumen: caja.querySelector("summary").textContent, negrita: caja.querySelectorAll("b").length, sinTemas: temasDeLaParte([{ s: 0, fen: "x" }], document.getElementById("au"), 1) };
    }, fn("minutoYSegundo") + fn("temasDeLaParte"));
    si(JSON.stringify(filas.botones) === JSON.stringify(["0:00 · Partida desde la posición inicial", "1:15 · Diapositiva 2: <b>Clavada</b>"]) && filas.resumen === "Temas de esta parte (2)",
      "«Repasar mis clases» muestra los temas como capítulos, con su minuto (" + filas.botones.join(" | ") + ")");
    si(filas.negrita === 0, "…escritos como texto (un título con < > no se vuelve HTML)");
    si(filas.sinTemas === null, "…y una parte sin temas (las de antes) no muestra nada");
    await ctx.close();
  }

  // Sin la llamada configurada.
  r = await abrir(browser, { respuesta: { status: 503, cuerpo: { error: "La llamada de la clase todavía no está disponible.", sin_configurar: true } } });
  await r.page.click("#llamada-entrar");
  a = await anuncio(r.page);
  si(/todavía no está disponible/.test(a), "sin configurar dice que todavía no está disponible: «" + a + "»");
  si(await visible(r.page, "#llamada-entrar") && !(await r.page.isDisabled("#llamada-entrar")), "…y deja «Entrar» listo para intentar otra vez");
  await r.ctx.close();

  // El alumno no sincroniza nada aunque se llame.
  r = await abrir(browser, { respuesta: PASE("pase-sin-palabra") });
  await r.page.evaluate(() => window.__llamada.sincronizar());
  si(await r.page.evaluate(() => window.__pedidos.length) === 0, "sincronizar() de un alumno no pide nada");
  await r.ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try { await pruebas(browser); } finally { await browser.close(); }
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : "\nTodo bien: la llamada sigue al turno de la clase.");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
