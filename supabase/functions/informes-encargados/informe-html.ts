// El informe que ve el encargado, en HTML.
//
// Se escribe una sola vez y sirve para las dos cosas: el correo y lo que la
// página enseña y deja descargar. Si estuviera duplicado, el papel y el correo
// se irían separando.
//
// Va con los estilos puestos a mano en cada etiqueta (`style="…"`), no con una
// hoja aparte: Gmail y compañía descartan <style> en el <head>, así que un CSS
// bonito se vería perfecto en el navegador y roto en el correo, que es donde de
// verdad se lee.
//
// EL TONO IMPORTA: esto lo lee una madre o un padre, no un colega. Nada de
// "filas", "registros" ni nombres de tabla; y cuando la semana viene vacía se
// dice sin regañar a nadie.

import type { Contacto } from "./contacto-academia.ts";

export type Frecuencia = "diario" | "semanal" | "mensual" | "anual";

// `esperados` es en cuántos días del periodo se considera que el alumno
// trabajó lo suficiente. No es una regla de la Academia ni una nota: es el
// umbral con el que este informe decide si le habla a la casa de "va bien" o
// de "le está costando". Diez minutos casi todos los días rinden más que dos
// horas de una vez, y eso es lo que estos números dicen.
export const PERIODOS: Record<Frecuencia, { dias: number; titulo: string; asunto: string; esperados: number }> = {
  diario:  { dias: 1,   titulo: "del día",      asunto: "Informe del día",    esperados: 1 },
  semanal: { dias: 7,   titulo: "de la semana", asunto: "Informe de la semana", esperados: 3 },
  mensual: { dias: 30,  titulo: "del mes",      asunto: "Informe del mes",    esperados: 8 },
  anual:   { dias: 365, titulo: "del año",      asunto: "Informe del año",    esperados: 60 },
};

// Cómo se llama cada actividad cuando se la cuenta alguien de la casa.
const ACTIVIDADES: Record<string, { nombre: string; unidad: string; emoji: string }> = {
  "4x4":           { nombre: "Ejercicios 4×4",        unidad: "resueltos",   emoji: "🧩" },
  aprender:        { nombre: "Lecciones de Aprender", unidad: "completadas", emoji: "🎓" },
  coordenadas:     { nombre: "Coordenadas",           unidad: "partidas",    emoji: "⚡" },
  practicar:       { nombre: "Series de Practicar",   unidad: "completadas", emoji: "🏆" },
  mates:           { nombre: "Mates",                 unidad: "resueltos",   emoji: "♚" },
  tactica:         { nombre: "Táctica",               unidad: "posiciones",  emoji: "⚔️" },
  temas:           { nombre: "Ejercicios por tema",   unidad: "resueltos",   emoji: "🎯" },
  concentracion:   { nombre: "Concentración",         unidad: "ejercicios",  emoji: "🧠" },
  curso:           { nombre: "Temas de curso",        unidad: "estudiados",  emoji: "🏛️" },
  diagnostico:     { nombre: "Diagnóstico de nivel",  unidad: "hecho",       emoji: "🧭" },
  aperturas:       { nombre: "Aperturas y celadas",   unidad: "líneas",      emoji: "📖" },
  confites:        { nombre: "Confites del caballo",  unidad: "partidas",    emoji: "🍬" },
  ilumina:         { nombre: "Ilumina el tablero",    unidad: "niveles",     emoji: "💡" },
  visualizacion:   { nombre: "Visualización",         unidad: "ejercicios",  emoji: "👁️" },
};

function escapar(t: unknown) {
  return String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function duracion(minutos: number) {
  const m = Math.round(Number(minutos) || 0);
  const h = Math.floor(m / 60), mm = m % 60;
  return h > 0 ? `${h} h ${mm} min` : `${mm} min`;
}

function fecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric" });
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "long" });
}

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

/* Cómo va, en una frase. Es lo primero que se lee y lo único que mucha gente
   va a leer, así que tiene que contestar sola la pregunta de la casa: ¿está
   trabajando o no?
   
   El orden de las reglas no es casual. Lo que está VENCIDO manda sobre todo lo
   demás —se puede haber practicado mucho y tener una tarea sin entregar— y
   quedarse en cero manda sobre "practicó poco". Ninguno de los tres textos
   regaña: el de abajo ofrece ayuda, porque quien lo lee puede ser una familia a
   la que se le complicó el mes. */
function comoVa(d: Record<string, any>, frecuencia: Frecuencia) {
  const periodo = PERIODOS[frecuencia] ?? PERIODOS.semanal;
  const nombre = String(d.alumno || "").split(" ")[0] || "Tu hijo o hija";
  const dias = Number(d.dias_activos) || 0;
  const tareas = (d.tareas ?? {}) as Record<string, number | null>;
  const examenes = (d.examenes ?? {}) as Record<string, number | null>;
  const atrasados = (Number(tareas.sin_hacer_hoy) || 0) + (Number(examenes.sin_hacer_hoy) || 0);

  const cuantosDias = frecuencia === "diario"
    ? (dias > 0 ? "Hoy sí se sentó a practicar." : "Hoy no entró a practicar.")
    : `Practicó ${plural(dias, "día", "días")} de ${periodo.dias}.`;

  if (atrasados > 0) {
    const partes: string[] = [];
    if (Number(tareas.sin_hacer_hoy)) partes.push(plural(Number(tareas.sin_hacer_hoy), "tarea", "tareas"));
    if (Number(examenes.sin_hacer_hoy)) partes.push(plural(Number(examenes.sin_hacer_hoy), "examen", "exámenes"));
    return {
      fondo: "#fef2f2", borde: "#dc2626",
      titulo: `Se le pasó la fecha de ${partes.join(" y ")}`,
      texto: `${cuantosDias} Lo que venció ya no se puede entregar solo: conviene que hable con quien le da clase para ponerse al día.`,
    };
  }
  if (dias === 0) {
    return {
      fondo: "#fffbea", borde: "#f0b429",
      titulo: `${nombre} no entró a practicar`,
      texto: "Si necesita ayuda para retomar, o si algo se complicó estos días, escríbenos y lo vemos juntos.",
    };
  }
  if (dias < periodo.esperados) {
    return {
      fondo: "#fffbea", borde: "#f0b429",
      titulo: "Practicó poco",
      texto: `${cuantosDias} Diez o quince minutos casi todos los días rinden mucho más que un rato largo de una sola vez.`,
    };
  }
  return {
    fondo: "#f0f4f8", borde: "#102a43",
    titulo: "Va bien",
    texto: `${cuantosDias} Así es como se avanza: poquito y seguido.`,
  };
}

export function informeHtml(
  d: Record<string, any>, frecuencia: Frecuencia, sitio: string, contacto?: Contacto | null,
) {
  const periodo = PERIODOS[frecuencia] ?? PERIODOS.semanal;
  const minutos = (Number(d.minutos_clase) || 0) + (Number(d.minutos_ejercicios) || 0);
  const entreno = (d.entreno ?? {}) as Record<string, { cuantos: number; mejor: number | null }>;
  const tareas = (d.tareas ?? {}) as Record<string, any>;
  const examenes = (d.examenes ?? {}) as Record<string, any>;

  const lineas = Object.keys(entreno)
    .filter((k) => ACTIVIDADES[k] && (entreno[k]?.cuantos ?? 0) > 0)
    .sort((a, b) => (entreno[b].cuantos ?? 0) - (entreno[a].cuantos ?? 0))
    .map((k) => {
      const a = ACTIVIDADES[k];
      const marca = k === "coordenadas" && entreno[k].mejor != null
        ? ` <span style="color:#55708a">· mejor marca: ${entreno[k].mejor}</span>` : "";
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eef2f6;color:#243b53">${a.emoji} ${a.nombre}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eef2f6;text-align:right;color:#102a43;font-weight:600;white-space:nowrap">${entreno[k].cuantos} ${a.unidad}${marca}</td>
      </tr>`;
    }).join("");

  const hizoAlgo = lineas || minutos > 0 || (d.clases ?? 0) > 0 || (d.respuestas ?? 0) > 0;
  const estado = comoVa(d, frecuencia);

  const tarjeta = (valor: string, etiqueta: string) => `
    <td style="padding:12px;background:#f0f4f8;border-radius:10px;text-align:center;width:33%">
      <div style="font-size:22px;font-weight:700;color:#102a43">${valor}</div>
      <div style="font-size:11px;color:#55708a;margin-top:2px">${etiqueta}</div>
    </td>`;

  const precision = (d.respuestas ?? 0) > 0
    ? Math.round(((d.correctas ?? 0) / d.respuestas) * 100) + "%" : "—";

  const renglon = (izq: string, der: string) => `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #eef2f6;color:#243b53">${izq}</td>
    <td style="padding:8px 0;border-bottom:1px solid #eef2f6;text-align:right;color:#102a43;font-weight:600;white-space:nowrap">${der}</td>
  </tr>`;

  // ---- Sus tareas ----
  // Se dice qué le pusieron y qué entregó. Nunca el título de la tarea ni de
  // quién es: el informe cuenta las de TODOS sus profesores, y el trabajo de
  // cada profesor sigue siendo suyo.
  const filasTareas: string[] = [];
  if (Number(tareas.puestas) > 0) {
    filasTareas.push(renglon("Le pusieron", plural(Number(tareas.puestas), "tarea", "tareas")));
    filasTareas.push(renglon("Terminó", `${Number(tareas.completadas) || 0} de ${Number(tareas.puestas)}`));
  }
  if (Number(tareas.sin_hacer_hoy) > 0) {
    filasTareas.push(renglon("⚠️ Se le pasó la fecha de",
      `<span style="color:#b91c1c">${plural(Number(tareas.sin_hacer_hoy), "tarea", "tareas")}</span>`));
  }
  if (Number(tareas.pendientes) > 0) {
    filasTareas.push(renglon("Todavía por hacer",
      plural(Number(tareas.pendientes), "tarea", "tareas") +
      (tareas.proxima_vence ? ` · la próxima vence el ${fechaCorta(tareas.proxima_vence)}` : "")));
  }

  // ---- Sus exámenes ----
  const filasExamenes: string[] = [];
  if (Number(examenes.rendidos) > 0) {
    filasExamenes.push(renglon("Hizo", plural(Number(examenes.rendidos), "examen", "exámenes")));
    if (examenes.nota_media != null) {
      const media = Number(examenes.nota_media).toFixed(2).replace(".", ",");
      const mejor = examenes.mejor_nota != null && Number(examenes.rendidos) > 1
        ? ` <span style="color:#55708a">· mejor: ${Number(examenes.mejor_nota).toFixed(2).replace(".", ",")}</span>` : "";
      filasExamenes.push(renglon(Number(examenes.rendidos) > 1 ? "Nota promedio" : "Nota", `${media} de 10${mejor}`));
    }
  }
  if (Number(examenes.sin_hacer_hoy) > 0) {
    filasExamenes.push(renglon("⚠️ Se le pasó la fecha de",
      `<span style="color:#b91c1c">${plural(Number(examenes.sin_hacer_hoy), "examen", "exámenes")}</span>`));
  }
  if (Number(examenes.pendientes) > 0) {
    filasExamenes.push(renglon("Por rendir",
      plural(Number(examenes.pendientes), "examen", "exámenes") +
      (examenes.proximo_vence ? ` · hasta el ${fechaCorta(examenes.proximo_vence)}` : "")));
  }

  /* ---- Dónde está y a dónde va ----
     El correo contaba minutos, clases y ejercicios pero no decía UNA palabra
     del plan: la familia no tenía forma de saber que detrás hay un diagnóstico
     por áreas y un plan de cuatro semanas con su objetivo medible. El trabajo
     estaba hecho y era invisible.

     Va ARRIBA, pegado al veredicto y antes de los números, porque es el marco
     de todo lo que sigue: primero qué se está haciendo y por qué, después
     cuánto. Y el nivel medido se sube acá con él — estaba solo al final, que es
     donde no lo lee nadie.

     SOLO SALE SI EL PROFESOR LO COMPARTIÓ (lo filtra `informe_de_alumno()`).
     Una sección que dijera "todavía no tiene plan" sería ruido en todas las
     visitas menos una, la misma decisión que la bitácora; y prometer un plan
     que no existe sería peor que no nombrarlo. */
  const plan = (d.plan ?? null) as Record<string, any> | null;
  const areasPlan = Array.isArray(plan?.areas) ? plan!.areas : [];
  const diag = (d.diagnostico ?? null) as Record<string, any> | null;

  const filaPlan = (etiqueta: string, valor: string) => `
    <tr>
      <td style="padding:6px 0;color:#55708a;font-size:13px;white-space:nowrap;vertical-align:top">${etiqueta}</td>
      <td style="padding:6px 0 6px 12px;color:#243b53;font-size:13px;line-height:1.5">${valor}</td>
    </tr>`;

  const bloquePlan = (plan || (diag && diag.nivel)) ? `
    <div style="margin:0 0 20px;padding:16px;background:#ffffff;border:1px solid #d9e2ec;border-radius:10px">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#243b53">
        🧭 Dónde está ${escapar(d.alumno)} y a dónde va
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${diag && diag.nivel ? filaPlan("Nivel medido",
            `<strong>${escapar(diag.nivel)}</strong>` +
            (diag.porcentaje ? ` · ${escapar(diag.porcentaje)}% en el diagnóstico` : "") +
            (diag.fecha ? `<br><span style="color:#55708a">Medido el ${fecha(diag.fecha)}.</span>` : "")) : ""}
        ${plan && plan.rutina ? filaPlan("Cuánto practicar", `<strong>${escapar(plan.rutina)}</strong>`) : ""}
        ${plan && plan.meta_elo ? filaPlan("Meta", escapar(plan.meta_elo)) : ""}
        ${areasPlan.length ? filaPlan("En qué se está trabajando",
            areasPlan.map((a: Record<string, any>) =>
              `<strong>${escapar(a.titulo)}</strong><br>` +
              `<span style="color:#55708a">${escapar(a.objetivo ?? "")}</span>`
            ).join('<br style="line-height:10px">')) : ""}
      </table>
      ${plan && plan.nota ? `
      <div style="margin:12px 0 0;padding:12px 14px;background:#fffbeb;border-left:3px solid #f0b429;border-radius:6px">
        <div style="font-size:11px;font-weight:700;color:#a85a0d;letter-spacing:.04em;text-transform:uppercase">De su profe</div>
        <div style="font-size:14px;color:#243b53;margin-top:4px;line-height:1.5">${escapar(plan.nota)}</div>
      </div>` : ""}
      ${plan && plan.compartido_at ? `
      <p style="margin:10px 0 0;font-size:12px;color:#55708a;line-height:1.5">
        Este plan se lo armó su profe a partir del diagnóstico, y ${escapar(d.alumno)} lo tiene en su cuenta desde el ${fecha(plan.compartido_at)}.
      </p>` : ""}
    </div>` : "";

  const bloque = (titulo: string, filas: string[]) => filas.length ? `
    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#243b53">${titulo}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:20px">${filas.join("")}</table>` : "";

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Informe ${escapar(periodo.titulo)} de ${escapar(d.alumno)}</title></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">

  <tr><td style="background:#102a43;padding:22px 24px">
    <div style="color:#f0b429;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Ajedrez Integral</div>
    <div style="color:#ffffff;font-size:20px;font-weight:700;margin-top:4px">Informe ${escapar(periodo.titulo)}</div>
  </td></tr>

  <tr><td style="padding:24px">
    <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#102a43">${escapar(d.alumno)}</p>
    <p style="margin:0 0 20px;font-size:13px;color:#55708a">
      ${d.grupo ? escapar(d.grupo) + " · " : ""}del ${fecha(d.desde)} al ${fecha(d.hasta)}
    </p>

    <div style="margin:0 0 20px;padding:14px 16px;background:${estado.fondo};border-left:4px solid ${estado.borde};border-radius:8px">
      <div style="font-size:15px;font-weight:700;color:#102a43">${escapar(estado.titulo)}</div>
      <div style="font-size:14px;color:#243b53;margin-top:4px;line-height:1.5">${escapar(estado.texto)}</div>
    </div>

    ${bloquePlan}

    ${hizoAlgo ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin-bottom:20px">
      <tr>
        ${tarjeta(duracion(minutos), "practicando")}
        ${tarjeta(String(d.clases ?? 0), (d.clases ?? 0) === 1 ? "clase" : "clases")}
        ${tarjeta(precision, "precisión en clase")}
      </tr>
    </table>` : ""}

    ${bloque("Sus tareas", filasTareas)}
    ${bloque("Sus exámenes", filasExamenes)}

    ${lineas ? `
    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#243b53">En qué trabajó</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:20px">${lineas}</table>` : ""}

    ${contacto ? `
    <p style="margin:0;font-size:13px;color:#55708a;line-height:1.6">
      Cualquier consulta, respondemos por WhatsApp al
      <a href="${contacto.enlace}" style="color:#a85a0d">${escapar(contacto.texto)}</a>.
    </p>` : `
    <p style="margin:0;font-size:13px;color:#55708a;line-height:1.6">
      Cualquier consulta, respóndenos este mismo correo.
    </p>`}
  </td></tr>

  <tr><td style="background:#f0f4f8;padding:16px 24px;font-size:11px;color:#55708a;line-height:1.6">
    Recibes este correo porque en la Academia figuras como persona encargada de ${escapar(d.alumno)}.
    Si prefieres dejar de recibirlo, o quieres cambiar cada cuánto llega, respondele a quien le da clase.
    <br><a href="${sitio}" style="color:#55708a">${sitio.replace(/^https:\/\//, "")}</a>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/* ---- Invitación a practicar (aviso de inactividad) ----
   Botón de un clic desde la lista de "sin entrenar" en informes.html: el
   profesor no escribe nada, solo aprieta, y la casa recibe una invitación
   cálida, no un regaño — mismo criterio de tono que el resto de este archivo.
   No lleva números de actividad ni comparaciones: es un empujón puntual, no
   un informe. Reutiliza el mismo envoltorio visual (cabecera azul marino,
   franja de color, pie con el contacto) para que se sienta del mismo sitio. */
export function invitarPracticarHtml(
  nombreCompleto: string, dias: number | null, sitio: string, contacto?: Contacto | null,
) {
  const nombre = String(nombreCompleto || "").trim() || "Tu hijo o hija";
  const primerNombre = nombre.split(" ")[0];
  const cuantoTiempo = dias == null
    ? `${primerNombre} todavía no ha entrado a practicar a la plataforma.`
    : `${primerNombre} lleva ${plural(dias, "día", "días")} sin entrar a practicar a la plataforma.`;

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Un empujoncito para ${escapar(primerNombre)} — Ajedrez Integral</title></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">

  <tr><td style="background:#102a43;padding:22px 24px">
    <div style="color:#f0b429;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Ajedrez Integral</div>
    <div style="color:#ffffff;font-size:20px;font-weight:700;margin-top:4px">Un empujoncito para ${escapar(primerNombre)}</div>
  </td></tr>

  <tr><td style="padding:24px">
    <p style="margin:0 0 20px;font-size:14px;color:#243b53;line-height:1.6">Hola,</p>

    <div style="margin:0 0 20px;padding:14px 16px;background:#fffbea;border-left:4px solid #f0b429;border-radius:8px">
      <div style="font-size:15px;font-weight:700;color:#102a43">${escapar(cuantoTiempo)}</div>
    </div>

    <p style="margin:0 0 16px;font-size:14px;color:#243b53;line-height:1.6">
      Te escribimos porque creemos que unos minutos hoy pueden hacer una gran diferencia:
      <strong>la constancia es, de lejos, la clave del éxito en el ajedrez</strong>. Diez o quince
      minutos casi todos los días rinden mucho más que un rato largo de vez en cuando.
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#243b53;line-height:1.6">
      Te invitamos a animar a ${escapar(primerNombre)} a que entre hoy mismo a practicar un rato.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
      <tr><td style="background:#f0b429;border-radius:10px">
        <a href="${sitio}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:700;color:#102a43;text-decoration:none">Entrar a practicar →</a>
      </td></tr>
    </table>

    ${contacto ? `
    <p style="margin:0;font-size:13px;color:#55708a;line-height:1.6">
      Cualquier consulta, respondemos por WhatsApp al
      <a href="${contacto.enlace}" style="color:#a85a0d">${escapar(contacto.texto)}</a>.
    </p>` : `
    <p style="margin:0;font-size:13px;color:#55708a;line-height:1.6">
      Cualquier consulta, respondenos este mismo correo.
    </p>`}
  </td></tr>

  <tr><td style="background:#f0f4f8;padding:16px 24px;font-size:11px;color:#55708a;line-height:1.6">
    Recibes este correo porque en la Academia figuras como persona encargada de ${escapar(nombre)}. Lo manda quien le da clase.
    <br><a href="${sitio}" style="color:#55708a">${sitio.replace(/^https:\/\//, "")}</a>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}
