/* ===== El informe que llega a la casa =====
 *
 *   node herramientas/verificar-informe-casa.js
 *
 * No necesita navegador, ni red, ni el sitio servido: `informe-html.ts` es una
 * función que recibe los datos de `public.informe_de_alumno()` y devuelve HTML,
 * así que se la llama y se mira qué contesta.
 *
 * POR QUÉ EXISTE. Lo que se rompe en este archivo no da ningún error: el correo
 * sale igual, Resend lo acepta, y a la casa le llega un informe al que le falta
 * media página o que dice "va bien" de un alumno que no entró en toda la
 * semana. Nadie se entera hasta que una madre pregunta.
 *
 * Lo que se comprueba es lo que decide el tono del correo:
 *
 *  - Que las CUATRO situaciones se distingan (va bien, practicó poco, no entró,
 *    tiene entregas vencidas) y que el orden de prioridad se respete: lo
 *    vencido manda aunque haya practicado todos los días.
 *  - Que los números de tareas y exámenes lleguen al HTML con los nombres que
 *    de verdad usa la base. Una clave mal escrita —`asignadas` por `puestas`—
 *    no rompe nada: la sección simplemente no aparece.
 *  - Que el periodo diario no hable de "practicó 1 día de 1", que se lee como
 *    un error de cuentas.
 *  - Que la foto de perfil salga al lado del nombre solo como `cid:` (adjunta
 *    en el correo) o `data:` (la vista previa), y que una DIRECCIÓN se rechace:
 *    sería un enlace a la foto de un menor suelto fuera de la plataforma.
 */
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const RAIZ = path.join(__dirname, "..");

/* Los datos van con las mismas claves que devuelve public.informe_de_alumno().
   Están copiadas de una llamada de verdad a la base, no inventadas: si alguien
   le cambia el nombre a una, esta prueba deja de encontrar su texto. */
const BASE = {
  alumno: "Sofía Muñoz", grupo: "7° B",
  desde: "2026-09-13T00:00:00Z", hasta: "2026-09-20T00:00:00Z",
  dias_del_periodo: 7, clases: 2, respuestas: 10, correctas: 8,
  minutos_clase: 55, minutos_ejercicios: 40,
  entreno: { mates: { cuantos: 25, mejor: null } },
  diagnostico: null,
};
const SIN_DEBERES = { puestas: 0, completadas: 0, vencidas: 0, sin_hacer_hoy: 0, pendientes: 0 };

const CASOS = [
  { nombre: "va-bien", frecuencia: "semanal", datos: { ...BASE, dias_activos: 5,
      tareas: { ...SIN_DEBERES, puestas: 2, completadas: 2, pendientes: 1,
                proxima_vence: "2026-09-25T18:00:00Z", renglones: 4, cumplidos: 4 },
      examenes: { rendidos: 2, nota_media: 8.5, mejor_nota: 9, sin_hacer_hoy: 0, pendientes: 0 } } },
  { nombre: "practico-poco", frecuencia: "semanal", datos: { ...BASE, dias_activos: 1,
      tareas: { ...SIN_DEBERES, puestas: 1, completadas: 0, pendientes: 1 },
      examenes: { rendidos: 0, nota_media: null, sin_hacer_hoy: 0, pendientes: 0 } } },
  { nombre: "no-entro", frecuencia: "semanal", datos: { ...BASE, dias_activos: 0,
      clases: 0, respuestas: 0, correctas: 0, minutos_clase: 0, minutos_ejercicios: 0, entreno: {},
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 } } },
  // Practicó los siete días Y tiene cosas vencidas: lo vencido manda.
  { nombre: "vencido-aunque-practique", frecuencia: "semanal", datos: { ...BASE, dias_activos: 7,
      tareas: { ...SIN_DEBERES, puestas: 3, completadas: 1, vencidas: 2, sin_hacer_hoy: 2 },
      examenes: { rendidos: 1, nota_media: 4, mejor_nota: 4, sin_hacer_hoy: 1, pendientes: 0 } } },
  /* Con plan compartido. Es lo que la familia no veía: detrás de los minutos
     hay un diagnóstico por áreas y un plan con su objetivo medible, y nada de
     eso se nombraba en el correo. */
  { nombre: "con-plan", frecuencia: "semanal", datos: { ...BASE, dias_activos: 5,
      diagnostico: { nivel: "Intermedio", porcentaje: "62", fecha: "2026-09-01T10:00:00Z" },
      plan: {
        compartido_at: "2026-09-02T10:00:00Z",
        nota: "Empieza por los finales; el jueves los repasamos juntos.",
        rutina: "30 minutos al día, 5 días por semana",
        meta_elo: "Elo 1200 → 1250 en los próximos torneos",
        areas: [
          { titulo: "Semana 1 · 🏁 Finales", objetivo: "Subir finales por encima del 70%.",
            porque: "20% en el diagnóstico." },
          { titulo: "Semana 2 · ⚔️ Táctica", objetivo: "Subir táctica por encima del 70%.",
            porque: "40% en el diagnóstico." },
        ],
      },
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 } } },
  /* Con la marca de su academia: el color, el logo y el nombre en la cabecera.
     Y una marca con un color que no es color y un nombre con etiquetas, que es
     texto de la base metido en un style y en el cuerpo del correo. */
  { nombre: "con-marca", frecuencia: "semanal", marca: { nombre: "Academia San José", color: "#1b4332",
      logoUrl: "https://bgtijpimpcokxatxxbki.supabase.co/storage/v1/object/public/academia-marca/ac1/logo-abc.webp" },
    datos: { ...BASE, dias_activos: 5, tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 } } },
  { nombre: "marca-mala", frecuencia: "semanal", marca: { nombre: '<img src=x onerror=alert(1)>Reyes',
      color: 'red;background:url(https://malo.test/x)', logoUrl: 'javascript:alert(1)' },
    datos: { ...BASE, dias_activos: 5, tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 } } },
  /* Con premios de la clase (public.premios_de_alumno(), dentro de
     informe_de_alumno()): trofeos e insignias de la semana. El motivo lo
     escribe el profe y lleva HTML a propósito: tiene que llegar como texto. */
  { nombre: "con-premios", frecuencia: "semanal", datos: { ...BASE, dias_activos: 5,
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 },
      premios: {
        trofeos_periodo: 4, trofeos_total: 23, insignias_periodo: 3, insignias_total: 7,
        insignias: [
          { tipo: "buen_estudiante", nombre: "Estrella de buen estudiante", emoji: "⭐", periodo: 2, total: 5 },
          { tipo: "buen_comentario", nombre: "Buen comentario", emoji: "💬", periodo: 1, total: 1 },
          { tipo: "idea_creativa", nombre: "Idea creativa", emoji: "🎨", periodo: 0, total: 1 },
        ],
        ultimas: [
          { tipo: "buen_comentario", nombre: "Buen comentario", emoji: "💬",
            motivo: "Explicó <b>muy bien</b> la clavada", fecha: "2026-09-18T15:00:00Z" },
          { tipo: "buen_estudiante", nombre: "Estrella de buen estudiante", emoji: "⭐", motivo: "", fecha: "2026-09-16T15:00:00Z" },
        ],
      } } },
  // Premios en cero en el periodo (aunque tenga de antes): el bloque no sale.
  { nombre: "premios-viejos", frecuencia: "semanal", datos: { ...BASE, dias_activos: 5,
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 },
      premios: { trofeos_periodo: 0, trofeos_total: 23, insignias_periodo: 0, insignias_total: 7,
        insignias: [{ tipo: "buen_estudiante", nombre: "Estrella de buen estudiante", emoji: "⭐", periodo: 0, total: 5 }],
        ultimas: [] } } },
  /* Cómo viene con los ejercicios (public.entreno_comparado(), dentro de
     informe_de_alumno()): el periodo contra el anterior del mismo largo. */
  { nombre: "comparacion", frecuencia: "semanal", datos: { ...BASE, dias_activos: 5,
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 },
      comparacion: { esta: 48, esta_con: 40, esta_limpios: 28, anterior: 31, anterior_con: 29, anterior_limpios: 18 } } },
  { nombre: "comparacion-sin-anterior", frecuencia: "mensual", datos: { ...BASE, dias_activos: 5,
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 },
      comparacion: { esta: 1, esta_con: 0, esta_limpios: 0, anterior: 0, anterior_con: 0, anterior_limpios: 0 } } },
  { nombre: "comparacion-en-cero", frecuencia: "semanal", datos: { ...BASE, dias_activos: 0,
      clases: 0, respuestas: 0, correctas: 0, minutos_clase: 0, minutos_ejercicios: 0, entreno: {},
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 },
      comparacion: { esta: 0, esta_con: 0, esta_limpios: 0, anterior: 12, anterior_con: 10, anterior_limpios: 5 } } },
  // La foto de perfil: adjunta al correo (cid:), pegada en la vista previa
  // (data:), y una dirección de afuera o un atributo inyectado, rechazados.
  { nombre: "foto-cid", frecuencia: "semanal", foto: "cid:foto-alumno", datos: { ...BASE, dias_activos: 5,
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 } } },
  { nombre: "foto-data", frecuencia: "semanal", foto: "data:image/jpeg;base64,/9j/4AAQSkZJRg==", datos: { ...BASE, dias_activos: 5,
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 } } },
  { nombre: "foto-direccion", frecuencia: "semanal", foto: "https://bgtijpimpcokxatxxbki.supabase.co/storage/v1/object/sign/fotos-perfil/x.jpg?token=abc", datos: { ...BASE, dias_activos: 5,
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 } } },
  { nombre: "foto-inyectada", frecuencia: "semanal", foto: 'cid:x" onerror="alert(1)', datos: { ...BASE, dias_activos: 5,
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 } } },
  /* Su Elo oficial (public.elo_de_alumno(), dentro de informe_de_alumno()):
     el mes más reciente contra el anterior que haya. */
  { nombre: "elo", frecuencia: "mensual", datos: { ...BASE, dias_activos: 9,
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 },
      elo: { fide_id: "6501435", actual: { periodo: "2026-09-01", fide: 1523, nacional: 1610 },
             anterior: { periodo: "2026-08-01", fide: 1511, nacional: 1617 } } } },
  { nombre: "elo-igual-sin-fide", frecuencia: "semanal", datos: { ...BASE, dias_activos: 5,
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 },
      elo: { fide_id: "6530133", actual: { periodo: "2026-10-01", fide: 0, nacional: 1400 },
             anterior: { periodo: "2026-09-01", fide: null, nacional: 1400 } } } },
  { nombre: "elo-primer-mes", frecuencia: "semanal", datos: { ...BASE, dias_activos: 5,
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 },
      elo: { fide_id: "6501435", actual: { periodo: "2026-09-01", fide: 2152, nacional: 2268 }, anterior: null } } },
  { nombre: "elo-vacio", frecuencia: "semanal", datos: { ...BASE, dias_activos: 5,
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 },
      elo: { fide_id: "1<b>2", actual: { periodo: "2026-09-01", fide: null, nacional: null }, anterior: null } } },
  /* Unas palabras de su profe (public.mensajes_casa_de(), dentro de
     informe_de_alumno()). El texto lo escribe el profe y lleva HTML a
     propósito: tiene que llegar como texto. */
  { nombre: "con-mensaje", frecuencia: "semanal", datos: { ...BASE, dias_activos: 1,
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 },
      comparacion: { esta: 12, esta_con: 0, esta_limpios: 0, anterior: 30, anterior_con: 0, anterior_limpios: 0 },
      plan: { compartido_at: "2026-09-02T10:00:00Z", areas: [{ titulo: "Semana 1 · 🏁 Finales", objetivo: "x" }] },
      mensajes: [
        { texto: "Esta semana le costó <b>arrancar</b>.\nEl jueves lo vemos juntos.", autor: "Profe Oscar", fecha: "2026-09-18T15:00:00Z" },
        { texto: "   ", autor: "Nadie", fecha: "2026-09-18T15:00:00Z" },
      ] } },
  { nombre: "mensajes-vacios", frecuencia: "semanal", datos: { ...BASE, dias_activos: 5,
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 }, mensajes: [] } },
  { nombre: "diario-si", frecuencia: "diario", datos: { ...BASE, dias_del_periodo: 1, dias_activos: 1,
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 } } },
  { nombre: "diario-no", frecuencia: "diario", datos: { ...BASE, dias_del_periodo: 1, dias_activos: 0,
      clases: 0, respuestas: 0, correctas: 0, minutos_clase: 0, minutos_ejercicios: 0, entreno: {},
      tareas: SIN_DEBERES, examenes: { rendidos: 0, sin_hacer_hoy: 0, pendientes: 0 } } },
];

const r = spawnSync(process.execPath,
  ["--experimental-strip-types", "--no-warnings",
   path.join(__dirname, "casos-informe-casa.mts"), JSON.stringify(CASOS)],
  { cwd: RAIZ, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
if (r.status !== 0) {
  console.error("No se pudo generar el informe:\n" + (r.stderr || r.stdout));
  process.exit(1);
}
const { html, periodos, situaciones } = JSON.parse(r.stdout);

const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };
// Se mira el TEXTO que va a leer quien abre el correo, no las etiquetas: un
// informe puede tener el dato en el HTML y no enseñarlo.
const texto = (k) => html[k].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// ---------- Las cuatro situaciones ----------
ok(/Va bien/.test(texto("va-bien")), "quien practicó 5 de 7 días debería leer «Va bien»");
ok(/Practicó 5 días de 7/.test(texto("va-bien")), "no dice cuántos días practicó");
ok(/Practicó poco/.test(texto("practico-poco")), "quien practicó 1 de 7 días debería leer «Practicó poco»");
ok(/no entró a practicar/.test(texto("no-entro")), "quien no entró debería leerlo con todas las letras");
ok(/Sofía no entró/.test(texto("no-entro")), "el aviso de «no entró» debería llamar al alumno por su nombre");
ok(!/Va bien|Practicó poco/.test(texto("no-entro")), "a quien no entró no se le puede decir que va bien");

// El orden de prioridad: practicó los SIETE días y aun así lo vencido manda.
const v = texto("vencido-aunque-practique");
ok(/Se le pasó la fecha de 2 tareas y 1 examen/.test(v),
  "con cosas vencidas, el titular debería decir qué venció: " + v.slice(0, 200));
ok(!/Va bien/.test(v), "con entregas vencidas no se puede encabezar con «Va bien»");
ok(/Practicó 7 días de 7/.test(v), "lo vencido no debería tapar que sí practicó");

// El diario no cuenta días: "practicó 1 día de 1" se lee como un error.
ok(/Hoy sí se sentó a practicar/.test(texto("diario-si")), "el informe diario debería hablar de hoy");
ok(!/de 1\./.test(texto("diario-si")), "el informe diario no debería decir «de 1»");
ok(/Hoy no entró a practicar|no entró a practicar/.test(texto("diario-no")), "el informe diario en cero debería decirlo");

// ---------- Tareas y exámenes ----------
const b = texto("va-bien");
ok(/Sus tareas/.test(b), "falta la sección de tareas");
ok(/Le pusieron 2 tareas/.test(b), "no dice cuántas tareas le pusieron");
ok(/Terminó 2 de 2/.test(b), "no dice cuántas terminó");
ok(/la próxima vence el 25 de septiembre/.test(b), "no dice cuándo vence la próxima");
ok(/Sus exámenes/.test(b), "falta la sección de exámenes");
ok(/Hizo 2 exámenes/.test(b), "no dice cuántos exámenes hizo");
ok(/Nota promedio 8,50 de 10/.test(b), "la nota debería ir con coma decimal y sobre 10");
ok(/mejor: 9,00/.test(b), "con más de un examen debería decir la mejor nota");
ok(/Nota 8,50/.test(texto("practico-poco")) === false, "sin exámenes rendidos no debería inventar una nota");

// Un alumno sin nada no tiene por qué ver secciones vacías.
ok(!/Sus tareas|Sus exámenes/.test(texto("no-entro")),
  "sin tareas ni exámenes, esas secciones no deberían aparecer");

/* ---------- El plan, que es lo que la familia no veía ----------
   Lo que se comprueba no es que el HTML lo traiga: es que se LEA. Un informe
   puede tener el dato dentro de una etiqueta y no enseñarlo — por eso todo esto
   se mide sobre el texto pelado, igual que el resto. */
const cp = texto("con-plan");
ok(/Dónde está Sofía Muñoz y a dónde va/.test(cp), "falta el bloque del plan");
ok(/Nivel medido/.test(cp) && /Intermedio/.test(cp), "el bloque debería decir el nivel medido");
ok(/62% en el diagnóstico/.test(cp), "y de dónde sale ese nivel");
ok(/Medido el 1 de septiembre/.test(cp), "y cuándo se midió");
/* Lo más accionable que lleva el correo: una madre puede preguntar «¿cuánto
   tiene que practicar?» y esto se lo contesta. */
ok(/30 minutos al día, 5 días por semana/.test(cp), "no dice cuánto se espera que practique");
ok(/Semana 1 · 🏁 Finales/.test(cp) && /Semana 2 · ⚔️ Táctica/.test(cp),
  "no dice en qué áreas se está trabajando");
ok(/Subir finales por encima del 70%/.test(cp), "el objetivo de cada área debería ser medible y estar escrito");
ok(/Elo 1200 → 1250/.test(cp), "no dice la meta de Elo cuando la hay");
/* La nota es lo ÚNICO escrito a mano por el profesor, así que va destacada y
   con su nombre: "De su profe". */
ok(/De su profe/.test(cp), "la nota del profesor debería ir rotulada como suya");
ok(/Empieza por los finales/.test(cp), "y decir lo que el profesor escribió");
/* Qué se dice de dónde sale el plan. NO se le atribuye al profesor un trabajo
   que no hizo —nada de "dedicó horas"— pero tampoco se calla que fue él quien
   lo armó y lo compartió, que es lo que de verdad pasó. */
ok(/se lo armó su profe a partir del diagnóstico/.test(cp),
  "debería decir de dónde sale el plan, sin exagerar ni callarlo");
ok(!/(horas|dedicó|esfuerzo|much[oa]s? tiempo)/i.test(cp),
  "el correo no puede atribuirle al profesor un trabajo que nadie midió");

/* Y sin plan compartido, ni una palabra: prometerle a la casa un plan que no
   existe es peor que no nombrarlo, y una sección que diga "todavía no tiene
   plan" es ruido en todas las visitas menos una. Es la misma decisión que la
   bitácora. */
const sp = texto("va-bien");
ok(!/a dónde va|Cuánto practicar|De su profe/.test(sp),
  "sin plan compartido no debería aparecer ni el bloque ni sus rótulos");
/* Pero el nivel medido SÍ se sigue viendo sin plan: ese dato ya salía antes y
   no puede perderse al mudar el bloque. */
const conNivel = texto("con-plan");
ok(/Nivel medido/.test(conNivel), "el nivel no puede perderse al mudarse al bloque nuevo");

// ---------- La marca de la academia ----------
const cab = (k) => (html[k].match(/<tr><td style="background:[^"]*;padding:22px 24px">[\s\S]*?<\/td><\/tr>/) || [""])[0];
ok(/background:#102a43/.test(cab("va-bien")) && /Ajedrez Integral/.test(cab("va-bien")),
  "sin academia la cabecera tiene que ser la de siempre, azul y con Ajedrez Integral");
const cm = cab("con-marca");
ok(/background:#1b4332/.test(cm), "con academia la cabecera tiene que tomar su color");
ok(/Academia San José/.test(cm) && !/Ajedrez Integral/.test(cm), "y decir el nombre de la academia en vez del de siempre");
ok(/<img src="https:\/\/bgtijpimpcokxatxxbki\.supabase\.co\/storage\/v1\/object\/public\/academia-marca\/ac1\/logo-abc\.webp" alt=""/.test(cm),
  "y llevar el logo del bucket público, con alt vacío porque el nombre va escrito al lado");
ok(!/#f0b429/.test(cm), "sobre el color de la academia la etiqueta va en blanco: el ámbar no está medido contra ese fondo");
const cmala = cab("marca-mala");
ok(/background:#102a43/.test(cmala) && !/malo\.test/.test(html["marca-mala"]),
  "un color que no es #rrggbb no entra al style: se queda el de siempre");
ok(!/<img src=x/.test(html["marca-mala"]) && /&lt;img src=x/.test(cmala), "el nombre de la academia va escapado y se sigue viendo, literal");
ok(!/javascript:/.test(html["marca-mala"]), "un logo que no es https no se pinta");

// ---------- Los umbrales ----------
ok(periodos.semanal.esperados > 0 && periodos.semanal.esperados < periodos.semanal.dias,
  "el umbral semanal debería estar entre 1 y los días del periodo");
Object.keys(periodos).forEach((k) => {
  ok(periodos[k].esperados <= periodos[k].dias,
    `el umbral de ${k} (${periodos[k].esperados}) no cabe en sus ${periodos[k].dias} días`);
});

// ---------- Los premios de la clase ----------
const pr = texto("con-premios");
ok(/Sus premios en clase/.test(pr), "con premios en la semana falta el bloque «Sus premios en clase»");
ok(/4 trofeos esta semana/.test(pr), "no dice cuántos trofeos ganó esta semana: " + pr.slice(0, 300));
ok(/Estrella de buen estudiante 2 veces/.test(pr), "no dice cuántas estrellas de buen estudiante ganó");
ok(/Buen comentario 1 vez/.test(pr), "no dice «1 vez» para una sola insignia");
ok(!/Idea creativa/.test(pr), "una insignia de antes del periodo no va en el informe de la semana");
ok(/De su profe:<\/strong> «Explicó &lt;b&gt;muy bien&lt;\/b&gt; la clavada»/.test(html["con-premios"]),
  "el motivo del profe tiene que llegar escapado, como texto");
ok(/En total lleva 23 trofeos y 7 insignias/.test(pr), "no dice cuántos lleva en total");
ok(!/Sus premios en clase/.test(texto("premios-viejos")), "sin premios en el periodo el bloque no debería salir");
ok(!/Sus premios en clase/.test(texto("va-bien")), "sin la clave premios el bloque no debería salir");

// ---------- Cómo viene con los ejercicios ----------
ok(/Esta semana: 48 ejercicios \(la anterior, 31\) · 70 % le salieron sin error ni pista \(la anterior, 62 %\)\./.test(texto("comparacion")),
  "debería comparar la semana con la anterior, en ejercicios y en limpios: " + texto("comparacion").slice(0, 600));
ok(/Este mes: 1 ejercicio \(el anterior no entrenó\)\./.test(texto("comparacion-sin-anterior")),
  "el mensual habla del mes, en singular, y dice si el anterior no entrenó");
ok(!/sin error ni pista/.test(texto("comparacion-sin-anterior")), "sin ejercicios que digan cómo salieron no se inventa un porcentaje");
ok(!/Esta semana:/.test(texto("comparacion-en-cero")), "sin ejercicios en el periodo la línea no sale (el veredicto ya lo dice)");
ok(!/Esta semana:/.test(texto("va-bien")), "sin la clave comparacion (una base de antes) la línea no sale");

// ---------- La foto de perfil ----------
const imgs = (k) => (html[k].match(/<img\b[^>]*>/g) || []).filter((t) => !/logo/i.test(t));
ok(imgs("foto-cid").length === 1 && /src="cid:foto-alumno"/.test(imgs("foto-cid")[0]),
  "con la foto adjunta, el informe tiene que mostrarla con src=\"cid:foto-alumno\": " + imgs("foto-cid").join(" "));
ok(/alt=""/.test(imgs("foto-cid")[0] || ""), "la foto es decoración (el nombre va escrito al lado): alt vacío");
ok(/Sofía Muñoz/.test(texto("foto-cid")), "con la foto, el nombre sigue escrito");
ok(imgs("foto-data").length === 1 && /src="data:image\/jpeg;base64,/.test(imgs("foto-data")[0]),
  "en la vista previa la foto va pegada en data:");
ok(!/fotos-perfil|supabase\.co\/storage/.test(html["foto-direccion"]) && imgs("foto-direccion").length === 0,
  "una DIRECCIÓN a la foto no puede llegar al correo");
ok(imgs("foto-inyectada").length === 0 && !/onerror/.test(html["foto-inyectada"]),
  "un src con comillas no puede colar atributos");
ok(imgs("va-bien").length === 0, "sin foto no hay <img> del alumno");

// ---------- Su Elo oficial ----------
const el = texto("elo");
ok(/Su Elo oficial \(septiembre\)/.test(el), "falta el bloque del Elo con el mes de la lectura: " + el.slice(0, 400));
ok(/FIDE Estándar 1523 · subió 12 desde agosto/.test(el), "no dice que el FIDE subió 12 desde agosto");
ok(/Nacional \(Costa Rica\) 1610 · bajó 7 desde agosto/.test(el), "no dice que el nacional bajó 7 desde agosto");
ok(/Código FIDE 6501435/.test(el), "no dice con qué código FIDE se lee");
const ei = texto("elo-igual-sin-fide");
ok(/Nacional \(Costa Rica\) 1400 · igual que en septiembre/.test(ei), "sin cambio debería decir «igual que en septiembre»");
ok(!/FIDE Estándar/.test(ei), "quien no tiene FIDE Estándar no puede leer «FIDE Estándar» (ni un 0)");
const ep = texto("elo-primer-mes");
ok(/FIDE Estándar 2152/.test(ep) && /Nacional \(Costa Rica\) 2268/.test(ep), "el primer mes dice los dos números");
ok(!/(subió|bajó) \d|igual que en/.test(ep), "el primer mes no tiene contra qué comparar: no dice subió ni bajó");
ok(!/Su Elo oficial/.test(texto("elo-vacio")) && !/<b>2/.test(html["elo-vacio"]), "sin ningún Elo leído el bloque no sale");
ok(!/Su Elo oficial/.test(texto("va-bien")), "sin la clave elo (sin código FIDE, o una base de antes) el bloque no sale");

// ---------- Unas palabras de su profe ----------
const cmsj = texto("con-mensaje");
ok(/Unas palabras de su profe/.test(cmsj), "con un mensaje del profe falta el bloque «Unas palabras de su profe»");
ok(/— Profe Oscar, 18 de septiembre/.test(cmsj), "el mensaje debería decir quién lo escribió y cuándo: " + cmsj.slice(0, 500));
ok(/Esta semana le costó &lt;b&gt;arrancar&lt;\/b&gt;\./.test(html["con-mensaje"]), "el texto del profe tiene que llegar escapado, como texto");
ok(!/Nadie/.test(cmsj), "un mensaje en blanco no se pinta");
ok(cmsj.indexOf("Unas palabras de su profe") < cmsj.indexOf("a dónde va"),
  "el mensaje va arriba, pegado al veredicto, antes del plan");
ok(!/Unas palabras de su profe/.test(texto("mensajes-vacios")) && !/Unas palabras de su profe/.test(texto("va-bien")),
  "sin mensajes (o con una base de antes) el bloque no sale");

// ---------- Cómo viene, para las plantillas ----------
/* Las frases sugeridas salen de la MISMA regla que la franja del correo: si se
   separaran, el profe le escribiría «¡qué buena semana!» encima de «Practicó
   poco». */
const claves = { "va-bien": "bien", "practico-poco": "poco", "no-entro": "no_entro", "vencido-aunque-practique": "vencido" };
Object.entries(claves).forEach(([caso, clave]) => ok(situaciones[caso] && situaciones[caso].clave === clave,
  `la situación de «${caso}» para las plantillas debería ser «${clave}», es ${JSON.stringify(situaciones[caso])}`));
const sm = situaciones["con-mensaje"];
ok(sm && sm.nombre === "Sofía" && sm.dias === 1 && sm.dias_periodo === 7, "la situación debería traer el nombre de pila y los días: " + JSON.stringify(sm));
ok(sm && sm.ejercicios === 12 && sm.ejercicios_antes === 30, "y los ejercicios contra el periodo anterior");
ok(sm && sm.area === "Finales", "y el área del plan, sin «Semana 1 ·» ni emoji: " + JSON.stringify(sm && sm.area));
ok(situaciones["va-bien"].ejercicios === null && situaciones["va-bien"].area === null, "sin comparación ni plan, esos datos van en null");

if (fallos.length) {
  console.error(`❌ ${fallos.length} fallo(s):\n` + fallos.map((f) => "  - " + f).join("\n"));
  process.exit(1);
}
console.log("✅ El informe de la casa: todo bien.");
