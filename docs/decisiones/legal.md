# Lo legal: privacidad, términos y consentimiento

Verificador: `node herramientas/verificar-todo.js legal` (y `formularios`, que
prueba la casilla de `formulario.html` con su doble).

## Las páginas legales

`privacidad.html` y `terminos.html` son páginas públicas (se indexan, van en el
sitemap). Salieron de una revisión contra la ley costarricense:

- **Ley 8968** (datos personales) y su reglamento: el aviso del artículo 5 —quién
  es responsable, para qué se usan los datos, quién los recibe, cómo ejercer los
  derechos— tiene que estar **donde se piden los datos**. El sitio maneja datos
  de menores, cédulas, notas e informes, así que es lo más delicado.
- **Ley 7472** (consumidor) y su reglamento de comercio electrónico:
  identificación del comerciante, precio final, condiciones de cancelación y
  devolución escritas antes de pagar.
- **Ley 6683** (derechos de autor), para el material de los cursos y la tienda.

El responsable es **Oscar Angulo Cubero, cédula 1-1399-0053**, persona física
con el nombre comercial Ajedrez Integral. El domicilio es «San José, Costa
Rica», así, sin más detalle: lo decidió el dueño del sitio.

**Lo que dicen estas páginas es un compromiso**, no texto de relleno. Antes de
cambiar algo en el sitio, revisar si contradice lo que ya prometen:

- **Proveedores**: la privacidad nombra a cada servicio que recibe datos
  (Supabase, Cloudflare, Resend, Google —tipografías, Vision del Lector de
  planilla, notificaciones—, Anthropic para mejorar informes, Meet o Zoom y la
  consulta de cédula de Hacienda). **Un servicio nuevo que reciba datos de
  alumnos va a la lista**: sin eso, el envío al extranjero no está consentido
  (artículo 14).
  - La lista va **plegada** (`<details id="proveedores">`, «Ver la lista de
    proveedores»): el dueño del sitio no la quería a la vista. Plegada sí,
    borrada no: el artículo 5 obliga a informar quién recibe los datos. El
    párrafo del envío al extranjero queda afuera, siempre visible.
- **Anthropic recibe el texto del informe sin el nombre del alumno.** Si
  `mejorar-informe` empieza a mandar nombres, la política miente.
- **Cancelación de planes**: reembolso completo dentro de los **ocho días
  hábiles** siguientes al pago; después, sin reembolso, pero con el acceso hasta
  que venza. No hay cobros automáticos, y la página lo dice: si algún día los
  hay, cambian los términos.
- **Material digital**: no se devuelve una vez entregado, y se repone si llega
  mal. La aceptación queda escrita en el mismo mensaje de WhatsApp del pedido
  (`CONDICIONES_TIENDA` en `tienda.html`), con fecha y antes del pago.
- Plazos de respuesta: cinco días hábiles para los derechos de datos y para las
  quejas.

Al cambiar una promesa, se cambia también la fecha de «Última actualización» y,
si es importante, se avisa a las familias antes de que empiece a aplicar (así
lo dice la sección «Cambios» de las dos páginas).

## Los enlaces del pie

**Todo pie del sitio enlaza las dos páginas.** Los pone
`herramientas/legal-pie.py`, justo después del párrafo del «©», entre las marcas
`<!-- legal: inicio -->` y `<!-- legal: fin -->`, con la ruta relativa según la
carpeta (`../privacidad.html` en `entreno/`).

- El pie de la Academia lo reescribe entero `academia-cabecera.py`: por eso ese
  script **le pide el pedazo a `enlaces()` de `legal-pie.py`** en vez de
  escribirlo él. Correr uno u otro, en cualquier orden, deja el mismo archivo.
- Una página con pie pero sin «©» hace fallar el script: con un pie nuevo hay
  que decidir dónde van los enlaces, no quedarse sin ellos callado.
- Quedan fuera los generados (`cursos/recursos/`, `cursos/protegido/` y los dos
  documentos accesibles): tienen su generador y todos piden sesión.
- Las páginas sin pie que piden o reciben datos (`unirse.html`,
  `elegir-plan.html`, `login.html`, `bienvenida.html`) llevan los enlaces junto
  al formulario.

`verificar-legal.js` corre `legal-pie.py --comprobar`: una página nueva con pie
y sin los enlaces falla en el CI.

## El consentimiento, antes que los datos

Cada formulario público que manda datos pide aceptar la Política de privacidad
**antes** de enviar:

| Página | Casilla | Quién la hace cumplir |
|---|---|---|
| `unirse.html` | `#acepto-datos`, `required` | el navegador (el form no es `novalidate`) |
| `formulario.html` | `#acepto-datos` | el `submit`, porque el form es `novalidate` |
| `encuesta-curso.html` | `#acepto-datos` | el `submit` (form `novalidate`), que lo pone en el resumen de lo que falta |
| `inscripcion.html` | `#aceptoDatos`, `required` (ya estaba; ahora enlaza la política) | el navegador |
| `elegir-plan.html` | `#acepto-terminos` (Términos + privacidad) | el clic de cada botón de plan |

- En `formulario.html` la casilla se mira **antes de subir los adjuntos**: subir
  un archivo ya es tratar el dato.
- Los enlaces de las casillas abren en **otra pestaña**: el que abre la política
  para leerla no pierde lo que ya escribió.
- Una casilla que se ve pero que el botón no mira deja mandar todo igual, y no
  da ningún error. Por eso se prueba en el navegador (`verificar-legal.js` y
  `verificar-formularios.js`), no por el HTML.

## El consentimiento queda guardado

Desde `20260924214817_consentimiento_guardado` la aceptación **queda en la base**,
en la misma fila del envío: qué versión se aceptó y a qué hora (la del
servidor, `now()`, no la del navegador). La ley pone en el responsable la
carga de probar el consentimiento, y una casilla marcada en una pantalla no
prueba nada.

| Función | Página | Guarda |
|---|---|---|
| `solicitar_academia` | `unirse.html` | `solicitudes_academia.privacidad_version` y `privacidad_aceptada_en` |
| `responder_formulario` | `formulario.html` | `formulario_respuestas.privacidad_version` y `privacidad_aceptada_en` |
| `responder_encuesta_curso` | `encuesta-curso.html` | `encuesta_curso_respuestas.privacidad_version` y `privacidad_aceptada_en` |
| `elegir_plan` | `elegir-plan.html` | `solicitudes_academia.terminos_version` y `terminos_aceptados_en` (y la privacidad, si la solicitud no la tenía) |

- **Lo exige la base, no la pantalla.** Sin una versión válida, las tres
  funciones rechazan el envío antes de escribir nada. La casilla de la página
  es la cortesía; el `if` que importa es el de la función.
- **La versión es la fecha de «Última actualización»** de la página
  (AAAA-MM-DD) y vive en **una sola copia**, `js/legal-version.js`.
  `verificar-legal.js` comprueba que coincida con la fecha impresa en cada
  página. **Al cambiar una página legal se cambian las dos cosas**: si no,
  la base guarda que la gente aceptó un texto que ya no es el publicado.
- La base **no compara** con la versión vigente, solo exige una fecha real y
  que no sea del futuro (`interno.version_legal_valida`). Compararla sería
  una segunda copia de `js/legal-version.js` dentro de la base, y el día que
  alguien cambiara una sin la otra se rechazarían todos los envíos.
- Las filas anteriores al 24 de setiembre de 2026 quedan en null: se
  enviaron antes de que existieran las páginas legales.
- `verificar-legal.js` lee la **última migración** de cada función (la que
  vale en la base) y comprueba que reciba la versión, la exija antes de
  escribir y la guarde. Una migración futura que vuelva a crear la función
  copiando una versión vieja borraría la exigencia sin ningún error.
- La inscripción a torneos (`inscripcion.html`) va a la otra base (la de
  colegios), cuya función `smart-function` ya guardaba `acepto_datos`.

## La revisión

La revisión del abogado ya se hizo (setiembre de 2026). Si cambia una
promesa de las páginas (un plazo, un reembolso, la cláusula del material
digital), conviene que la vuelva a ver.
