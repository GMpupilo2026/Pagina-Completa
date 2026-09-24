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
con el nombre comercial Ajedrez Integral. La dirección publicada es solo «San
José, Costa Rica».

**Lo que dicen estas páginas es un compromiso**, no texto de relleno. Antes de
cambiar algo en el sitio, revisar si contradice lo que ya prometen:

- **Proveedores**: la privacidad nombra a cada servicio que recibe datos
  (Supabase, Cloudflare, Resend, Google —tipografías, Vision del Lector de
  planilla, notificaciones—, Anthropic para mejorar informes, Meet o Zoom y la
  consulta de cédula de Hacienda). **Un servicio nuevo que reciba datos de
  alumnos va a la lista**: sin eso, el envío al extranjero no está consentido
  (artículo 14).
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
| `inscripcion.html` | `#aceptoDatos`, `required` (ya estaba; ahora enlaza la política) | el navegador |
| `elegir-plan.html` | `#acepto-terminos` (Términos + privacidad) | el clic de cada botón de plan |

- En `formulario.html` la casilla se mira **antes de subir los adjuntos**: subir
  un archivo ya es tratar el dato.
- Los enlaces de las casillas abren en **otra pestaña**: el que abre la política
  para leerla no pierde lo que ya escribió.
- Una casilla que se ve pero que el botón no mira deja mandar todo igual, y no
  da ningún error. Por eso se prueba en el navegador (`verificar-legal.js` y
  `verificar-formularios.js`), no por el HTML.

## Lo que falta

- **El consentimiento no queda guardado en la base.** Hoy lo exige la pantalla,
  pero ninguna fila dice quién aceptó, cuándo ni qué versión. La ley pone en el
  responsable la carga de probar el consentimiento: lo correcto es que
  `solicitar_academia`, `responder_formulario` y `elegir_plan` reciban y guarden
  la aceptación con su fecha y la versión de la política.
- Falta la **dirección exacta** del domicilio.
- El recibo de `cobros` es **interno**: si el responsable está inscrito en
  Hacienda, no sustituye el comprobante electrónico.
- Todo esto necesita la **revisión de un abogado**. En particular, la Ley 7472
  dice que los derechos del consumidor son irrenunciables, así que la cláusula
  de no devolver el material digital entregado tiene que confirmarla.
