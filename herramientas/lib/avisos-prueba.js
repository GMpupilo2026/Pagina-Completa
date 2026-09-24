/* Los avisos de js/avisos.js, contestados solos en un verificador.
 *
 * Antes las páginas usaban alert(), confirm() y prompt() del navegador, y los
 * verificadores los contestaban con `page.on("dialog", d => d.accept())` o
 * pisando `window.confirm = () => true`. Los diálogos de js/avisos.js son
 * parte de la página (un <dialog> con sus botones), así que acá se contestan
 * como lo haría una persona: apretando el botón.
 *
 *   await instalarAvisos(page)     // ANTES del goto: va como init script
 *
 * En la página queda:
 *   window.__avisos       todo lo que se mostró (mensajes y diálogos), en texto
 *   window.__respuestas   lo que se escribe en los diálogos que piden algo:
 *                         un texto para Avisos.pedir(), o un objeto
 *                         { campo: valor } para Avisos.formulario(). Sin
 *                         respuesta preparada, esos diálogos se cancelan
 *                         (como el prompt() que devolvía null).
 *   window.__cancelarAvisos = true   para que las confirmaciones digan que no.
 *
 * Los diálogos se aprietan de verdad, con click(): si un día el botón no está
 * o el diálogo no se abre, la prueba lo nota.
 */
function contestarAvisos() {
  window.__avisos = window.__avisos || [];
  window.__respuestas = window.__respuestas || [];
  const contestar = (d) => {
    window.__avisos.push(d.textContent.replace(/\s+/g, " ").trim());
    const campos = [...d.querySelectorAll("input, select")];
    const clase = d.dataset.avisos;
    if (clase === "pedir" || clase === "formulario") {
      if (!window.__respuestas.length) { d.querySelector("[data-avisos-cancelar]").click(); return; }
      const r = window.__respuestas.shift();
      if (r === null) { d.querySelector("[data-avisos-cancelar]").click(); return; }
      if (typeof r === "object") campos.forEach((c) => { if (c.name in r) c.value = r[c.name]; });
      else campos[0].value = r;
    }
    if (clase === "confirmar" && window.__cancelarAvisos) { d.querySelector("[data-avisos-cancelar]").click(); return; }
    d.querySelector("[data-avisos-aceptar]").click();
  };
  const mirar = () => {
    document.querySelectorAll("dialog[data-avisos][open]:not([data-contestado])").forEach((d) => {
      d.dataset.contestado = "1";
      setTimeout(() => contestar(d), 0);
    });
    document.querySelectorAll(".avisos-mensaje:not([data-leido])").forEach((m) => {
      m.dataset.leido = "1";
      window.__avisos.push(m.textContent.replace(/\s+/g, " ").trim());
    });
  };
  const empezar = () => new MutationObserver(mirar).observe(document.documentElement,
    { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
  if (document.documentElement) empezar();
  else document.addEventListener("DOMContentLoaded", empezar);
}

async function instalarAvisos(page) {
  await page.addInitScript(contestarAvisos);
}

/* El texto de los mensajes que se VEN ahora mismo (sin el ✕ ni «Deshacer»),
   uno por renglón. Se mide con checkVisibility(): un mensaje que está en el
   DOM pero no se ve no cuenta. No hace falta instalar nada antes. */
async function mensajesVisibles(page) {
  return page.evaluate(() => [...document.querySelectorAll(".avisos-mensaje")]
    .filter((m) => m.checkVisibility())
    .map((m) => m.querySelector("p").textContent.trim())
    .join("\n"));
}

module.exports = { instalarAvisos, contestarAvisos, mensajesVisibles };
