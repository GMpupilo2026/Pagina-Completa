/* «Hablar con el jugador» del Centroamericano 2026: lo que no necesita navegador.

   1. js/centroamericano-frases.js: cada frase existe en los TRES idiomas, sin ids repetidos, con una regla de las Leyes que parece regla;
      el idioma que se sugiere por el país; el texto que queda en la bitácora.
   2. supabase/functions/centroamericano-traducir: la función SIN CUENTA se defiende sola (token del enlace, idiomas fijos, largo,
      topes por enlace y en total), no manda al modelo nada más que el mensaje, nunca imprime el mensaje y no lo guarda.
   3. La página lo carga (frases antes que el diálogo, antes que el árbitro) y la política de privacidad nombra al proveedor.

   Ver «Hablar con el jugador» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js centroamericano-idioma        */
"use strict";
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const leer = (...r) => fs.readFileSync(path.join(RAIZ, ...r), "utf8");
const F = require(path.join(RAIZ, "js", "centroamericano-frases.js"));

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
  else console.log("  ✓ " + nombre);
}

console.log("\n=== Las frases (js/centroamericano-frases.js) ===");
{
  const todas = [...F.FRASES, ...F.DEL_JUGADOR];
  const vacias = todas.filter((x) => ["es", "en", "fr"].some((i) => typeof x[i] !== "string" || x[i].trim().length < 2)).map((x) => x.id);
  igual("toda frase está en español, inglés y francés (ninguna a medias)", vacias, []);
  igual("ningún id se repite", new Set(todas.map((x) => x.id)).size, todas.length);
  const igualesEnEs = F.FRASES.filter((x) => x.en === x.es || x.fr === x.es).map((x) => x.id);
  igual("ninguna frase quedó sin traducir (igual al español); «Sí/No» sí pueden coincidir en «No.»", igualesEnEs.filter((i) => i !== "no"), []);
  igual("cada frase cuelga de un tema que existe", F.FRASES.filter((x) => !F.TEMAS.some((t) => t.id === x.tema)).map((x) => x.id), []);
  igual("toda regla citada parece un artículo de las Leyes (número, con puntos)", F.FRASES.filter((x) => x.art && !/^\d{1,2}(\.\d{1,2}){0,2}$/.test(x.art)).map((x) => x.id), []);
  igual("hay suficientes frases para los casos de la mesa (30 o más) y 9 respuestas del jugador", [F.FRASES.length >= 30, F.DEL_JUGADOR.length], [true, 9]);
  const fp = F.FRASES.filter((x) => x.tema === "fairplay");
  igual("hay un tema «Fair Play» con varias frases (5 o más)", [F.TEMAS.some((t) => t.id === "fairplay"), fp.length >= 5], [true, true]);
  igual("la frase pedida está: «Deberá esperar sentado, ya que le corresponde revisión de Fair Play.» en los tres idiomas",
    (() => { const x = F.FRASE.get("fp-esperar"); return [x.es, /remain seated/.test(x.en) && /Fair Play/.test(x.en), /rester assis/.test(x.fr) && /Fair Play/.test(x.fr)]; })(),
    ["Deberá esperar sentado, ya que le corresponde revisión de Fair Play.", true, true]);
  // verificar-voseo.py se salta este archivo (trae francés e inglés, y sus «-é», «-és» no son voseo): el español se revisa aquí.
  igual("el español de las frases es de tuteo (nada de voseo)", todas.filter((x) => /\b(podés|tenés|querés|sentate|sentáte|apagá|guardalo|mirá|decime|esperá|levantá|vení|andá|escribí|tocá|poné|dejá|usá|pedí|avisá|fijate|acordate|quedate|callate)\b/i.test(x.es)).map((x) => x.id), []);
  igual("el francés usa los signos de su ortografía (espacio antes de «:», «?» y «!») donde los hay",
    F.FRASES.concat(F.DEL_JUGADOR).filter((x) => /[^  ][?!:]( |$)/.test(x.fr)).map((x) => x.id), []);
  igual("los números de las frases cuadran entre idiomas (minutos, segundos, resultados)", F.FRASES.filter((x) => {
    const n = (t) => (t.match(/\d+/g) || []).join(",");
    return n(x.es) !== n(x.en) || n(x.es) !== n(x.fr);
  }).map((x) => x.id), []);
}

console.log("\n=== El idioma que se sugiere por el país ===");
{
  igual("países de habla inglesa → inglés", ["TTO", "JAM", "USA", "ENG", "BAR", "IND"].map(F.idiomaDeFed), ["en", "en", "en", "en", "en", "en"]);
  igual("países de habla francesa → francés", ["FRA", "HAI", "CAN", "SUI", "BEL"].map(F.idiomaDeFed), ["fr", "fr", "fr", "fr", "fr"]);
  igual("la región hispana, el neerlandés y lo desconocido → español (el árbitro cambia con un toque)", ["CRC", "GUA", "ESA", "PAN", "ESP", "SUR", "CUR", "XXX", "", null, undefined].map(F.idiomaDeFed), ["es", "es", "es", "es", "es", "es", "es", "es", "es", "es", "es"]);
  igual("no importa si viene en minúsculas o con espacios", [" fra ", "tto"].map(F.idiomaDeFed), ["fr", "en"]);
}

console.log("\n=== Lo que queda en la bitácora ===");
{
  const t = F.textoComunicado({ jugador: "Hopkins John", color: "blancas", idioma: "en", es: "Apaga el celular.", traducido: "Switch off your phone." });
  igual("dice a quién, en qué idioma (en español) y lo dicho con su original", t, "Se le comunicó a Hopkins John (blancas) en inglés: «Switch off your phone.» (en español: «Apaga el celular.»)");
  igual("nunca pasa de 2000 caracteres (el tope de una nota)", F.textoComunicado({ jugador: "X", color: "negras", idioma: "fr", es: "a".repeat(3000), traducido: "b".repeat(3000) }).length <= 2000, true);
}

console.log("\n=== La función que traduce (centroamericano-traducir) se defiende sola ===");
{
  const fn = leer("supabase/functions/centroamericano-traducir/index.ts");
  igual("pide el token del enlace de 64 caracteres y rechaza enlaces apagados o vencidos", [/\[0-9a-f\]\{64\}/.test(fn), /asig\.revocada/.test(fn), /asig\.vence/.test(fn)], [true, true, true]);
  igual("solo español, inglés y francés, de uno a otro distinto, y el mensaje con tope de largo", [/es: "español", en: "inglés", fr: "francés"/.test(fn), /de === a/.test(fn), /MAX_CARACTERES = 500;/.test(fn)], [true, true, true]);
  igual("topes por minuto, por día en el enlace y por día en total, ANTES de llamar al proveedor", [/POR_MINUTO = 20, POR_DIA = 500, TOTAL_DIA = 4000/.test(fn), fn.indexOf("TOTAL_DIA)") < fn.indexOf("cliente.messages.create")], [true, true]);
  igual("al modelo solo le llega el mensaje y los idiomas (nada del cuerpo, del nombre ni de la mesa)", [/content: "Idioma de origen: "/.test(fn), !/cuerpo\.(nombre|jugador|mesa|blancas|negras)/.test(fn)], [true, true]);
  igual("el mensaje va entre etiquetas y se le quitan las etiquetas falsas (no puede cerrar el bloque para colar instrucciones)", [/<texto>/.test(fn), /replace\(\/<\\\/\?texto>\/gi, ""\)/.test(fn), /NUNCA instrucciones/.test(fn)], [true, true, true]);
  igual("la tabla de topes guarda solo cifras (caracteres, tokens, costo), nunca el texto", [/caracteres: texto\.length/.test(fn), !/insert\(\{[^}]*texto[^l]/.test(fn.replace(/caracteres: texto\.length/g, ""))], [true, true]);
  igual("no imprime el mensaje ni la traducción en los registros: los console.error no los nombran", fn.split("\n").filter((l) => /console\.(log|error|warn)/.test(l) && /(texto|traduccion|cuerpo)\b/.test(l.replace(/centroamericano-traducir/g, ""))), []);
  igual("la clave del proveedor sale del entorno, no del código", [/Deno\.env\.get\("ANTHROPIC_API_KEY"\)/.test(fn), !/sk-ant-/.test(fn)], [true, true]);
  const mig = fs.readdirSync(path.join(RAIZ, "supabase", "migraciones")).filter((f) => /centroamericano_traducciones/.test(f)).map((f) => leer("supabase/migraciones", f)).join("\n");
  igual("la tabla de topes no se lee desde afuera: RLS activada y sin políticas, sin permisos para anon ni authenticated", [/enable row level security/i.test(mig), !/create policy/i.test(mig), /revoke all on .*centroamericano_traducciones.* from .*anon/i.test(mig.replace(/\n/g, " "))], [true, true, true]);
}

console.log("\n=== La página y la política de privacidad ===");
{
  const html = leer("centroamericano-arbitro.html");
  const a = html.indexOf("js/centroamericano-frases.js"), b = html.indexOf("js/centroamericano-hablar.js"), c = html.lastIndexOf("js/centroamericano-arbitro.js");
  igual("la página carga las frases, luego el diálogo y luego la página del árbitro", a > 0 && b > a && c > b, true);
  const priv = leer("privacidad.html");
  igual("la política de privacidad nombra el traductor: qué se manda, que sin nombres y que no se guarda", [/Anthropic/.test(priv), /traduc/i.test(priv.slice(priv.indexOf('id="proveedores"')))], [true, true]);
}

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);
