/* Las voces del audiolibro de los cuentos de Peonita.
 *
 * El guion (libro-ninos-pdf.js lo escribe en herramientas/libro-ninos/guion/)
 * dice quién lee cada trozo: el narrador o un personaje. Casi todos los
 * diálogos nombran a quien habla en el inciso («—dijo Don Lento»), y de ahí
 * sale solo: el primer personaje que nombra el inciso, buscando primero el
 * nombre más largo («el rey negro» antes que «el rey»). Si el diálogo viene
 * después de dos puntos dentro de un párrafo («El rey suspiró: —¡Gracias!»),
 * habla el sujeto de esa última oración.
 *
 * Lo que el texto no dice —«—Fácil. Mira la esquina…», «—dijo, satisfecho»—
 * va escrito a mano en HABLA, decidido leyendo el contexto: la clave es el
 * comienzo del párrafo. Si se corrige ese párrafo, la clave ya no aparece y
 * verificar-libro-ninos.js avisa (una tabla vieja daría la línea a quien no
 * es, sin ningún error).
 *
 * PERSONAJES describe cada voz para quien elija las voces de verdad (Google,
 * Piper…) o la grabe: el tipo de voz, la velocidad (1 = normal), cómo suena y,
 * si lo tiene, quién es («es», para el papel que lee quien lo graba:
 * libro-ninos-papel.js). Una voz por personaje en los tres libros: Peonita
 * suena igual en todos.
 */
"use strict";

const PERSONAJES = {
  narrador: { voz: "mujer adulta", velocidad: 0.95, como: "cálida y clara, como quien lee un cuento antes de dormir" },
  Peonita: {
    voz: "niña", velocidad: 1.0, como: "alegre y curiosa, la más pequeña del tablero",
    es: "Un peón blanco, la pieza más pequeñita del ajedrez, con un moño rosado. Vive con sus amigos en una caja de madera, en una escuela de Costa Rica. Es quien cuenta el cuento y aprende a jugar ajedrez con su maestro, Don Lento, un perezoso muy sabio. A veces se pone nerviosa, pero siempre se anima.",
  },
  "Tizón": { voz: "niño", velocidad: 1.05, como: "entusiasta y bromista, el mejor amigo de Peonita" },
  "Don Lento": { voz: "hombre mayor", velocidad: 0.8, como: "un perezoso sabio: habla muuuy despacio, con pausas" },
  "Doña Muralla": { voz: "mujer adulta", velocidad: 0.95, como: "la torre: firme y segura" },
  "Don Saleras": { voz: "hombre adulto", velocidad: 1.0, como: "el alfil: simpático, con gracia" },
  "Dama Estrella": { voz: "mujer adulta", velocidad: 1.0, como: "la dama: elegante y brillante" },
  "Rey Sereno": { voz: "hombre mayor", velocidad: 0.9, como: "el rey blanco: tranquilo y amable" },
  Galope: { voz: "hombre joven", velocidad: 1.1, como: "el caballo: enérgico, a saltos" },
  "Don Pillo": { voz: "hombre adulto", velocidad: 1.05, como: "el mapache: pícaro y travieso, pero buena gente" },
  Sandro: { voz: "niño pequeño", velocidad: 1.0, como: "un osito panda chiquito: vocecita dulce y viajera" },
  "Rey Carbón": { voz: "hombre adulto", velocidad: 0.95, como: "el rey negro: refunfuñón al principio, divertido al final" },
  coro: { voz: "varios niños", velocidad: 1.0, como: "cuando hablan todos a la vez («¡Te encontramos!»)" },
};

/* Cómo nombra el cuento a cada personaje, además de su nombre. */
const ALIAS_COMUNES = {
  "Peonita y Tizón": "coro",
  todos: "coro",
  perezoso: "Don Lento",
  "el alfil": "Don Saleras",
  "la dama": "Dama Estrella",
  "la torre": "Doña Muralla",
  relinch: "Galope",
};

const LIBROS = {
  peonita: {
    alias: { "el rey": "Rey Sereno" },
    habla: {
      "—¿Dónde estamos?": "Peonita",
      "—Fácil. Mira la esquina": "Don Lento",
      "—¿Vienen a pelear?": "Peonita",
      "—Hola, me llamo Tizón": "Tizón",
      "—Yo camino derecho": "Doña Muralla",
      "—Si es de mi color": "Doña Muralla",
      "—Yo camino inclinado": "Don Saleras",
      "—Yo soy la pieza más poderosa": "Dama Estrella",
      "—En forma de L": "Galope",
      "—Hoy… te toca a ti": "Don Lento",
      "—Pero en tu primera salida": "Don Lento",
      "—Ahí está lo curioso": "Don Lento",
      "—Si un peón camina": "Don Lento",
      "—¿Y cómo lo salvo?": "Peonita",
      "—Hay tres formas": "Don Lento",
      "—¡Qué buena partida!": "Tizón",
      "—Les voy a contar… dos secretos": "Don Lento",
      "—El primero se llama enroque": "Don Lento",
      "—No. Solo si el rey": "Don Lento",
      "—Uno: mueve los peones": "Don Lento",
      "—Dos: saca pronto": "Don Lento",
      "—Tres: enroca temprano": "Don Lento",
      "—Al empezar y al terminar": "Don Lento",
      "—Sin ti, no habría aprendido": "Tizón",
      "—Don Lento —susurró": "Peonita",
      "—Mañana… y todos los días": "Don Lento",
    },
  },
  "peonita-trucos": {
    alias: { "el rey": "Rey Sereno" },
    habla: {
      "—¿Y cómo sabe cuáles nadie cuida?": "Peonita",
      "—Se fija en las que están sin cuidar": "Don Lento",
      "—¡Exacto! Un tenedor": "Galope",
      "—¡Jaque! —dijo—. El rey tiene que escaparse": "Galope",
      "—Por eso soy la mejor": "Dama Estrella",
      "—Galope hace tenedores": "Peonita",
      "—Peonita… ¿cómo come un peón?": "Don Lento",
      "—En diagonal, hacia adelante": "Peonita",
      "—Entonces… un peón ataca": "Don Lento",
      "—Les voy a enseñar mi truco favorito": "Don Saleras",
      "—Ahora el caballo no se puede mover": "Don Saleras",
      "—Y lo mejor viene ahora": "Don Saleras",
      "—En la clavada, la pieza de adelante": "Doña Muralla",
      "—Aquí nadie me puede molestar": "Rey Sereno",
      "—Con una ventanita": "Don Lento",
      "—Ya sé que aprendieron trucos": "Don Pillo",
      "—Don Pillo sabe muchos trucos": "Peonita",
      "—Antes de cada jugada… mira": "Don Lento",
      "—¡Jaque! —dijo, con un tenedor perfecto": "Peonita",
      "—¡Me ganaste con mi propio truco!": "Don Pillo",
    },
  },
  "peonita-rey": {
    alias: { "rey negro": "Rey Carbón", "el Rey Sereno": "Rey Sereno", "rey blanco": "Rey Sereno" },
    habla: {
      "—Siempre es lo mismo": "Rey Carbón",
      "—Hola —dijo con una vocecita": "Sandro",
      "—Mi mapa dice que el volcán": "Sandro",
      "—Yo sé un mate muy bonito": "Doña Muralla",
      "—Yo me encargo": "Dama Estrella",
      "—No estoy en jaque": "Rey Carbón",
      "—Hoy lo dejé ahogado": "Dama Estrella",
      "—Yo te enseño uno": "Rey Sereno",
      "—Desde tan cerquita": "Rey Sereno",
      "—La Dama Estrella puede hacer cajas": "Doña Muralla",
      "—Primero buscas una jugada": "Don Lento",
      "—¡Qué divertido!": "Rey Carbón",
    },
  },
};

module.exports = { PERSONAJES, ALIAS_COMUNES, LIBROS };
