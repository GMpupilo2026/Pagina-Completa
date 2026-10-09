/* ===== Verificador: el catálogo público del diagnóstico no quedó viejo =====
 *
 * `js/diagnostico-catalogo.js` es lo único del banco del diagnóstico que
 * sigue publicado (ver «Diagnóstico» en docs/decisiones/entrenamiento.md):
 * lo genera herramientas/diagnostico-sincronizar.js a partir de
 * js/diagnostico-items.js y no se edita a mano. Si alguien edita el banco
 * (una pregunta nueva, un peso que cambió con diagnostico-calibrar.js) y se
 * olvida de correr el generador, el catálogo publicado queda mintiendo sobre
 * qué preguntas hay — y con eso, examenes.html arma exámenes con ids que ya
 * no existen o no sabe de los que se agregaron. Este verificador no toca
 * nada: solo compara.
 *
 * No comprueba que la tabla de Supabase esté al día — eso no lo puede ver
 * sin credenciales de la base, así que es manual: correr
 * `node herramientas/diagnostico-sincronizar.js --migracion` y aplicar la
 * migración que escribe, cada vez que se toque el banco.
 *
 * Cómo se corre: node herramientas/verificar-diagnostico-catalogo.js
 */
const fs = require("fs");
const { CATALOGO, ITEMS, catalogoDe } = require("./diagnostico-sincronizar");

const fallos = [];
const mal = (msg) => fallos.push(msg);

let publicado;
try {
  // eval() de un archivo propio del repositorio (el mismo truco que ya usan
  // diagnostico-calibrar.js y verificar-diagnostico.js), nunca de nada que
  // venga de afuera.
  global.window = {};
  eval(fs.readFileSync(CATALOGO, "utf8"));
  publicado = global.window.DIAGNOSTICO_CATALOGO;
} catch (e) {
  mal(`No se pudo leer ${CATALOGO}: ${e.message}`);
  publicado = null;
}

if (publicado) {
  const esperado = catalogoDe(ITEMS);
  if (JSON.stringify(publicado) !== JSON.stringify(esperado)) {
    mal(
      "js/diagnostico-catalogo.js no coincide con js/diagnostico-items.js. " +
      "Corré: node herramientas/diagnostico-sincronizar.js"
    );
  }
  // Nada de enunciado, opciones, fen, correcta, solución ni explicación: si
  // alguna de esas llaves aparece, el generador se rompió y el catálogo
  // volvió a llevar contenido que no debería estar publicado.
  const permitidas = new Set(["id", "area", "peso", "tipo"]);
  publicado.forEach((it) => {
    Object.keys(it).forEach((k) => {
      if (!permitidas.has(k)) mal(`${it.id}: el catálogo público trae la llave "${k}", que no debería estar ahí.`);
    });
  });
}

if (fallos.length) {
  console.error("FALLÓ verificar-diagnostico-catalogo:\n- " + fallos.join("\n- "));
  process.exit(1);
}
console.log(`OK: js/diagnostico-catalogo.js está al día con js/diagnostico-items.js (${ITEMS.length} ítems).`);
