/* Contestar, en una prueba de Pareo Integral, el diálogo de la etapa de los
 * JDE que abre «Crear los torneos» (con la configuración de los JDE marcada)
 * y el botón «Aplicar la configuración de los JDE»: dos Avisos.formulario
 * seguidos, la etapa y después el lugar. Lo usan verificar-pareo-grupos.js y
 * verificar-pareo-equipos.js.
 *
 *   await contestarEtapa(page, "regional", "Alajuela")
 *   await contestarEtapa(page, "interregional", "III")
 *   await contestarEtapa(page, "institucional", "Liceo de Prueba")
 */
async function contestarEtapa(page, etapa, lugar) {
  const dialogo = 'dialog[data-avisos="formulario"][open]';
  await page.waitForSelector(dialogo);
  await page.selectOption(dialogo + ' select[name="etapa"]', etapa);
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForFunction((d) => { const x = document.querySelector(d); return x && x.querySelector('[name="lugar"]'); }, dialogo);
  const campo = dialogo + ' [name="lugar"]';
  if (etapa === "institucional") await page.fill(campo, lugar || "");
  else await page.selectOption(campo, lugar);
  await page.click(dialogo + " [data-avisos-aceptar]");
}

module.exports = { contestarEtapa };
