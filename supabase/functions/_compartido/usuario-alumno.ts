// El usuario de un alumno que no tiene correo propio.
//
// POR QUÉ EXISTE ESTO
// Una familia con dos hijos pequeños tiene UN correo, el de la mamá o el papá,
// y quiere inscribir a los dos con él. No se puede: Supabase Auth exige correo
// único (`users_email_partial_key`), porque el correo ES la llave con la que se
// inicia sesión. Y el intento sale caro — antes de esto, dar de alta al segundo
// hermano con el mismo correo REUSABA la cuenta del primero y le escribía
// encima el nombre: el primer hijo desaparecía con todo su progreso, y la
// pantalla decía "listo".
//
// La salida no es darle un buzón al niño de siete años, es dejar de pedírselo:
// se le da un USUARIO del dominio de la academia, que nunca recibe correo, y
// todo lo que el sitio le escribe a esa familia va al correo de la persona
// encargada. Así los dos hermanos tienen cuentas distintas y la mamá recibe las
// dos bienvenidas y los dos informes en su único correo.
//
// EL DOMINIO ESTÁ ESCRITO DOS VECES, A LA FUERZA
// Aquí y en `public.es_correo_interno()` de la base. Una Edge Function no puede
// leer una función de Postgres al vuelo, así que no hay forma de tener una sola
// copia. Lo que sí hay es una comprobación: `verificar-alumno-sin-correo.js`
// falla si las dos no dicen lo mismo. Separadas, el sitio crearía usuarios en
// un dominio que la base no reconoce como interno y volvería a mandarles correo
// a un buzón que no existe — sin dar ningún error, solo rebotes que nadie mira.

/** El dominio de los usuarios sin buzón. NO tiene MX y no debe tenerlo: su
 *  razón de ser es que nada le llegue nunca. */
export const DOMINIO_ALUMNO = "alumno.ajedrez-integral.com";

/** Si ese correo es un usuario de la academia y no una dirección que reciba
 *  correo. Tiene que dar lo mismo que `public.es_correo_interno()`. */
export function esCorreoInterno(email?: string | null): boolean {
  return !!email && email.toLowerCase().endsWith("@" + DOMINIO_ALUMNO);
}

/* Las tildes y la eñe se quitan del USUARIO, no del nombre: el nombre se
   guarda como la familia lo escribió. Un usuario con tilde se puede escribir de
   dos formas distintas y el niño no sabría cuál le toca — y para escribirlo en
   el celular tendría que ir a buscar el acento. "Muñoz" entra como "munoz". */
function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ñ/gi, "n");
}

/**
 * La parte de antes del arroba, sacada del nombre: primer nombre y primer
 * apellido. "Sofía Muñoz Pérez" es "sofia.munoz" y "José Andrés Rodríguez
 * Mora" es "jose.rodriguez". Dos pedazos y no cuatro porque el usuario hay que
 * poder dictarlo por teléfono y escribirlo en un celular.
 *
 * CUÁL ES EL APELLIDO SE ADIVINA, ASÍ QUE SE ENSEÑA ANTES DE CREARLO
 * Acá se nombra completo —Nombre1 [Nombre2] Apellido1 Apellido2—, así que con
 * cuatro pedazos el apellido es el tercero y con dos o tres es el segundo. Eso
 * acierta casi siempre y se equivoca alguna vez (un apellido compuesto, alguien
 * que se anotó con un solo nombre). Por eso las dos pantallas de alta lo
 * muestran y dejan corregirlo antes de crear la cuenta: el usuario es lo que el
 * niño va a escribir todos los días y después no se cambia solo.
 */
export function baseDeUsuario(nombre?: string | null): string {
  const pedazos = sinTildes(String(nombre ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!pedazos.length) return "";
  // Sin nombre no hay de dónde sacarlo; quien llama decide si eso es un error.
  const apellido = pedazos.length >= 4 ? pedazos[2] : pedazos[1];
  return [pedazos[0], apellido].filter(Boolean).join(".").slice(0, 40);
}

/** El usuario completo para ese nombre, ya con el dominio. */
export function usuarioPara(nombre: string | null | undefined, sufijo = ""): string {
  return `${baseDeUsuario(nombre)}${sufijo}@${DOMINIO_ALUMNO}`;
}

type BuscadorDeCorreo = (email: string) => Promise<boolean>;

/**
 * Un usuario que no esté tomado. Dos "José Rodríguez" en la misma academia no
 * son ninguna rareza, así que el choque se resuelve numerando —`jose.rodriguez`,
 * `jose.rodriguez2`, `jose.rodriguez3`— y no con un id al azar: el usuario se lo
 * tiene que aprender un niño, y `jose.rodriguez.a7f3` no se lo aprende nadie.
 *
 * `estaTomado` pregunta por el correo en la base. El tope de intentos existe
 * para que un fallo de esa consulta no deje esto dando vueltas para siempre;
 * si se llega ahí, se devuelve null y quien llama lo dice, en vez de inventar
 * un usuario que quizá ya es de otro alumno.
 */
export async function usuarioLibre(
  nombre: string | null | undefined,
  estaTomado: BuscadorDeCorreo,
  tope = 50,
): Promise<string | null> {
  if (!baseDeUsuario(nombre)) return null;
  for (let i = 1; i <= tope; i++) {
    const candidato = usuarioPara(nombre, i === 1 ? "" : String(i));
    if (!(await estaTomado(candidato))) return candidato;
  }
  return null;
}

/**
 * Qué tiene de malo esa contraseña, o null si sirve. La misma regla en las
 * tres puertas que le ponen contraseña a un alumno con usuario —las dos de
 * alta y «Su contraseña» de `correos-alumno`—: escrita tres veces, una se
 * aflojaría y la otra rechazaría lo que la primera dejó pasar.
 *
 * Ocho como mínimo, lo mismo que pide bienvenida.html. El tope es el de
 * bcrypt, que corta en silencio lo que pase de 72 bytes: la contraseña
 * "funcionaría" escrita a medias. Y sin espacios en las puntas, que en el
 * celular se cuelan solos y después no se ven.
 */
export function problemaDeContrasena(clave: string): string | null {
  if (clave.length < 8) return "La contraseña tiene que tener al menos 8 caracteres";
  if (new TextEncoder().encode(clave).length > 72) return "Esa contraseña es demasiado larga";
  if (clave.trim() !== clave) return "La contraseña no puede empezar ni terminar con espacios";
  return null;
}

/* Las palabras de la contraseña provisional. Del ajedrez, sin tildes ni eñe:
   se dicta por teléfono y se escribe en un celular. */
const PALABRAS_CLAVE = [
  "torre", "alfil", "caballo", "dama", "jaque", "enroque", "tablero", "peon",
  "reina", "casilla", "columna", "fila", "gambito", "apertura", "final",
  "tablas", "reloj", "torneo", "diagonal", "corona",
];

/**
 * La contraseña provisional que lleva el correo de bienvenida: dos palabras
 * del ajedrez y cuatro números («torre-alfil-4821»). Se puede leer en voz alta
 * y escribir en un celular, y son cuatro millones de combinaciones, no las
 * diez mil de una palabra y tres números: esta viaja por correo y nadie la
 * eligió. Los números salen de `crypto`, nunca de `Math.random`. Siempre pasa
 * `problemaDeContrasena()`.
 */
export function contrasenaProvisional(): string {
  const n = new Uint32Array(3);
  crypto.getRandomValues(n);
  const a = PALABRAS_CLAVE[n[0] % PALABRAS_CLAVE.length];
  const b = PALABRAS_CLAVE[n[1] % PALABRAS_CLAVE.length];
  return `${a}-${b}-${String(n[2] % 10000).padStart(4, "0")}`;
}

type ClienteAdminCrear = {
  auth: {
    admin: {
      createUser: (opts: unknown) => Promise<{ data: { user: unknown } | null; error: { message: string } | null }>;
    };
  };
};

/**
 * Crea la cuenta de un alumno con usuario de la academia y la contraseña ya
 * puesta: entra hoy mismo, sin que nadie abra ningún correo.
 *
 * Es la salida para la familia que no tiene correo, o que lo tiene y no lo
 * abre: quien le da clase le pone usuario y contraseña al crearlo y se los da
 * en la clase. `email_confirm: true` porque sin confirmar GoTrue no la deja
 * entrar ni con la contraseña buena, y el enlace que la confirmaría no sale.
 * `full_name` va en la metadata igual que en la invitación; el perfil lo
 * escribe después quien llama, como con la invitación.
 */
export async function crearConContrasena(
  adminClient: ClienteAdminCrear,
  usuario: string,
  clave: string,
  fullName?: string | null,
  /** La contraseña es la provisional del correo de bienvenida: al entrar, el
   *  sitio le ofrece cambiarla (ver `contrasena_provisional` en login.js). La
   *  que pone quien le da clase no lo es: se la dio en la mano y es la suya. */
  provisional = false,
): Promise<{ user: { id: string; email?: string } | null; error: string | null }> {
  const metadata: Record<string, unknown> = {};
  if (fullName) metadata.full_name = fullName;
  if (provisional) metadata.contrasena_provisional = true;
  const { data, error } = await adminClient.auth.admin.createUser({
    email: usuario,
    password: clave,
    email_confirm: true,
    user_metadata: Object.keys(metadata).length ? metadata : undefined,
  });
  return {
    user: (data?.user as { id: string; email?: string } | null) ?? null,
    error: error?.message ?? (data?.user ? null : "No se pudo crear la cuenta"),
  };
}
