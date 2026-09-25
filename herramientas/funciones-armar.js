#!/usr/bin/env node
/*
 * Arma los archivos de cada Edge Function tal como hay que subirlos.
 *
 * POR QUÉ HACE FALTA UN PASO DE ARMADO
 * Cada Edge Function se despliega sola, con SUS archivos: no hay forma de que
 * dos funciones importen el mismo archivo de una carpeta hermana. Pero el
 * correo de bienvenida es el mismo para las dos puertas de alta —el formulario
 * de inscripción y la invitación directa del profesor—, y dos copias del mismo
 * texto se van separando a la primera corrección: la mitad de las familias
 * recibiría la versión vieja sin que nada falle.
 *
 * Así que la fuente es UNA (`supabase/functions/_compartido/`) y lo desplegado
 * es derivado: este script copia cada archivo compartido dentro de la carpeta
 * de la función que lo importa, con el nombre con el que lo importa. Misma
 * idea que el resto de `herramientas/`: se escribe en un lugar, se genera en
 * los que hagan falta.
 *
 *   node herramientas/funciones-armar.js            # deja todo en /tmp y lo resume
 *   node herramientas/funciones-armar.js --json     # imprime lo que hay que subir
 *
 * Lo que imprime `--json` es exactamente el arreglo de `files` que espera la
 * API de despliegue de Supabase: [{ name, content }].
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const RAIZ = path.join(__dirname, "..", "supabase", "functions");
const COMPARTIDO = path.join(RAIZ, "_compartido");

/* Qué archivo compartido necesita cada función. Se declara aquí y no se
 * adivina leyendo los imports: si mañana una función importa algo que no está
 * declarado, es mejor que falle el armado a que se despliegue a medias. */
const FUNCIONES = {
  // Su instrucciones-email.ts es suyo y vive en su carpeta: no lo usa nadie
  // más. Va en esta lista igual, para que se despliegue con el resto y no
  // haya que acordarse de subirla aparte.
  "admin-manage-users": ["usuario-alumno.ts"],
  "create-student": ["invitacion-email.ts", "usuario-alumno.ts", "profesor-elegido.ts"],
  "inscribir-alumno": ["invitacion-email.ts", "usuario-alumno.ts", "profesor-elegido.ts"],
  "recuperar-acceso": ["usuario-alumno.ts", "recuperacion-email.ts"],
  "reenviar-acceso": ["usuario-alumno.ts", "recuperacion-email.ts"],
  "correos-alumno": ["usuario-alumno.ts"],
  // Su examen-html.ts es suyo y vive en su carpeta; lo único compartido es el
  // número al que la casa escribe, que es el mismo en los tres correos.
  "informe-examen": ["contacto-academia.ts", "remitente-academia.ts", "marca-correo.ts"],
  "informes-encargados": ["contacto-academia.ts", "remitente-academia.ts", "marca-correo.ts"],
  "cobros-recordatorios": ["usuario-alumno.ts", "contacto-academia.ts", "remitente-academia.ts", "marca-correo.ts"],
  "mejorar-informe": [],
};

function armar(nombre) {
  const dir = path.join(RAIZ, nombre);
  if (!fs.existsSync(dir)) throw new Error(`No existe la función ${nombre} en ${dir}`);

  const archivos = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".ts")) continue;
    archivos.push({ name: f, content: fs.readFileSync(path.join(dir, f), "utf8") });
  }

  for (const compartido of FUNCIONES[nombre]) {
    const origen = path.join(COMPARTIDO, compartido);
    if (!fs.existsSync(origen)) throw new Error(`Falta el compartido ${compartido}`);
    if (archivos.some((a) => a.name === compartido)) {
      throw new Error(
        `${nombre}/${compartido} existe a mano y también es compartido: ` +
        "sobraría una copia, que es justo lo que este script evita.",
      );
    }
    archivos.push({ name: compartido, content: fs.readFileSync(origen, "utf8") });
  }

  // El index tiene que importar de verdad lo que se le copia, o el despliegue
  // sube un archivo que nadie usa y el correo sale del código viejo.
  const index = archivos.find((a) => a.name === "index.ts");
  if (!index) throw new Error(`${nombre} no tiene index.ts`);
  for (const compartido of FUNCIONES[nombre]) {
    if (!index.content.includes(`./${compartido}`)) {
      throw new Error(`${nombre}/index.ts no importa "./${compartido}"`);
    }
  }

  return archivos;
}

const todo = {};
for (const nombre of Object.keys(FUNCIONES)) todo[nombre] = armar(nombre);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(todo, null, 2));
} else {
  const salida = fs.mkdtempSync(path.join(os.tmpdir(), "funciones-"));
  for (const [nombre, archivos] of Object.entries(todo)) {
    const dir = path.join(salida, nombre);
    fs.mkdirSync(dir, { recursive: true });
    for (const a of archivos) fs.writeFileSync(path.join(dir, a.name), a.content);
    console.log(`${nombre}: ${archivos.map((a) => a.name).join(", ")}`);
  }
  console.log(`\nListo en ${salida}`);
  console.log("Para desplegar: se suben esos archivos a cada función del proyecto AjedrezIntegral.");
}
