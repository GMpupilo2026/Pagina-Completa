/* El código de entreno/estudio.html.

   Vivía escrito dentro de la página, en un <script> de 7 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

const gate = document.getElementById('gate');
const app = document.getElementById('app');
const gateChecking = document.getElementById('gate-checking');
const NEXT_PATH = 'entreno/estudio.html';

/* ---------------- Todas las fichas, en una sola página ----------------
   Acá vive TODO el material de fichas: aperturas, defensas, temas tácticos y
   conceptos. Antes estaba partido en dos páginas —esta con las 24 de apertura
   y defensa, y entreno/fichas.html con las 56— y eran la misma página dos
   veces: el mismo banco, el mismo mapa, el mismo tablero y dos listas que
   había que mantener parejas. Se juntaron acá y aquella se fue; su dirección
   redirige a esta en `_redirects`, con su ?ficha= incluido, porque esos
   enlaces se compartían y un 404 no le dice a nadie a dónde ir.

   Sin pestañas, a propósito: las categorías se pintan una debajo de
   otra con su <h2>, así se salta de grupo en grupo con lector de pantalla y
   nadie tiene que elegir una pestaña antes de poder ver nada. */
const { FICHAS, CATEGORIAS } = window.FichasEstudio;
const sinTildes = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const textoDe = (F) => [F.titulo, F.subtitulo, F.resumen, F.diagrama, F.centro.join(' '),
                        F.bloques.map((b) => b.join(' ')).join(' ')].join(' ');
let busqueda = '';

/* Con ?cat=<categoría> se ven solo las fichas de esa categoría: son las
   cuatro tarjetas del panel del alumno (Aperturas, Defensas, Táctica,
   Conceptos), que antes eran una sola, «Estudio», con las 56 adentro. Una
   categoría que no existe cae a todas, no a una lista vacía. «Ver todas» la
   suelta sin recargar. */
let categoria = (() => {
  const c = new URLSearchParams(window.location.search).get('cat');
  return CATEGORIAS.some((x) => x.id === c) ? c : null;
})();
const etiquetaDe = (id) => (CATEGORIAS.find((c) => c.id === id) || {}).etiqueta || '';

/* Buscar mira todas las categorías y va sin tildes: "peon pasado" tiene que
   encontrar la ficha aunque se escriba sin acento. Lo que sobrevive se sigue
   pintando dentro de su grupo, así el árbol de encabezados no cambia según lo
   que se escriba. */
function loQueSeVe(){
  const base = categoria ? FICHAS.filter((F) => F.categoria === categoria) : FICHAS;
  if(!busqueda) return base;
  const q = sinTildes(busqueda);
  return base.filter((F) => sinTildes(textoDe(F)).includes(q));
}

function soltarCategoria(){
  categoria = null;
  if(window.history && window.history.replaceState){
    const url = new URL(window.location.href);
    url.searchParams.delete('cat');
    window.history.replaceState({}, '', url);
  }
  pintarLista();
  mostrarLista();
  // El aviso con «Ver todas» se escondió con el botón que tenía el foco: al buscador, no al <body>.
  document.getElementById('buscar').focus();
}

const GLYPH_B = { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', k:'♚' };
const NIVEL = {1:'Principiante', 2:'Intermedio', 3:'Avanzado'};
const visor = FichaRender.crear();

function pintarLista(){
  const box = document.getElementById('ficha-lista');
  box.innerHTML = '';
  const visibles = loQueSeVe();
  const deCat = categoria ? ` de ${etiquetaDe(categoria)}` : '';
  document.getElementById('cuantas').textContent = busqueda
    ? `${visibles.length} ficha${visibles.length === 1 ? '' : 's'}${deCat} con «${busqueda}»`
    : `${categoria ? visibles.length : FICHAS.length} fichas${deCat}`;
  const aviso = document.getElementById('solo-cat');
  aviso.hidden = !categoria;
  if(categoria) document.getElementById('solo-cat-texto').textContent = `Estás viendo solo las fichas de ${etiquetaDe(categoria)}.`;
  document.getElementById('volver').textContent = categoria ? `← Las fichas de ${etiquetaDe(categoria)}` : '← Todas las fichas';
  if(!visibles.length){
    const p = document.createElement('p');
    p.className = 'vacio';
    p.textContent = 'Ninguna ficha dice eso. Prueba con otra palabra.';
    box.appendChild(p);
    return;
  }
  // Un <h2> por categoría para poder saltar de grupo en grupo con lector de
  // pantalla — antes eran pestañas, y elegir una antes de poder ver nada era
  // un paso de más.
  CATEGORIAS.forEach((cat) => {
    const fichas = visibles.filter((F) => F.categoria === cat.id);
    if(!fichas.length) return;
    const titulo = document.createElement('h2');
    titulo.className = 'study-group-title';
    titulo.textContent = cat.etiqueta;
    box.appendChild(titulo);
    const grid = document.createElement('div');
    grid.className = 'ficha-lista';
    fichas.forEach((F) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ficha-item';
      btn.dataset.ficha = F.id;
      btn.style.setProperty('--cat-color', `var(--cat-${F.categoria})`);
      btn.innerHTML = `
        <span class="mark" aria-hidden="true">${GLYPH_B[F.pieza]}</span>
        <span>
          <span class="name">${F.titulo}</span>
          <span class="desc">${cat.sub} · ${NIVEL[F.nivel]} · ${F.subtitulo}</span>
          <span class="desc">${F.resumen}</span>
        </span>`;
      btn.addEventListener('click', () => abrirFicha(F));
      grid.appendChild(btn);
    });
    box.appendChild(grid);
  });
}

function mostrarLista(){
  document.getElementById('ficha-vista').style.display = 'none';
  document.getElementById('lista-vista').style.display = 'block';
  document.querySelector('.buscador').style.display = '';
  document.querySelector('.intro').style.display = '';
  ponerEnLaDireccion(null);
}

/* El enlace de la ficha abierta: se puede mandar por WhatsApp y abre esa
   ficha, no la lista. Un id que ya no existe cae a la lista en vez de dejar la
   página a medio pintar. */
function ponerEnLaDireccion(id){
  if(!window.history || !window.history.replaceState) return;
  const url = new URL(window.location.href);
  if(id) url.searchParams.set('ficha', id); else url.searchParams.delete('ficha');
  window.history.replaceState({}, '', url);
}

function abrirFicha(F){
  document.getElementById('lista-vista').style.display = 'none';
  document.getElementById('ficha-vista').style.display = 'block';
  document.querySelector('.buscador').style.display = 'none';
  document.querySelector('.intro').style.display = 'none';
  const cat = CATEGORIAS.find((c) => c.id === F.categoria);
  const etiqueta = document.getElementById('ficha-etiqueta');
  etiqueta.textContent = cat.etiqueta;
  etiqueta.style.setProperty('--cat-color', `var(--cat-${F.categoria})`);
  document.getElementById('ficha-nivel').textContent = NIVEL[F.nivel];
  document.getElementById('ficha-titulo').textContent = F.titulo;
  document.getElementById('ficha-sub').textContent = F.subtitulo + ' — ' + F.resumen;

  /* El botón de practicar solo sale cuando esa línea existe de verdad en el
     banco de entreno/aperturas.html: las de apertura y defensa siempre la
     tienen; las de táctica y conceptos pueden partir de una FEN de estudio.
     Un botón que promete practicar algo que no está no da ningún error: lleva
     a la lista y quien lo aprieta no entiende por qué. */
  const practicar = document.getElementById('b-practicar');
  const linea = visor.lineaDe(F);
  if(linea){
    practicar.style.display = '';
    practicar.href = 'aperturas.html?linea=' + encodeURIComponent(linea.id);
    practicar.textContent = `🎯 Practicarla con ${linea.color === 'w' ? 'blancas' : 'negras'}`;
  } else if(F.temaPractica){
    /* Las de táctica y conceptos se practican en Ejercicios por tema: el
       ?tema= abre directo ese tema (el mismo enlace que usan las tareas).
       Que la clave exista y sea el tema que nombra el texto lo comprueba
       herramientas/verificar-fichas.js. */
    practicar.style.display = '';
    practicar.href = 'temas.html?tema=' + encodeURIComponent(F.temaPractica);
    practicar.textContent = '🎯 Practicar este tema';
  } else {
    practicar.style.display = 'none';
  }

  visor.abrir(F);
  ponerEnLaDireccion(F.id);
  window.scrollTo({ top: 0 });
}

/* «← Todas las fichas» desaparece con la ficha y el foco caía al <body>:
   quien no ve no sabía que había vuelto a la lista. Va al buscador, que es
   lo primero de la lista y dice qué es. */
document.getElementById('volver').addEventListener('click', (e) => { e.preventDefault(); mostrarLista(); document.getElementById('buscar').focus(); });
document.getElementById('solo-cat-todas').addEventListener('click', soltarCategoria);
document.getElementById('b-imprimir').addEventListener('click', () => window.print());

/* ---------------- Las flechas del mapa ----------------
   Se trazan midiendo dónde quedó cada caja, no con coordenadas fijas: el mapa
   se arma distinto en pantalla ancha y en el papel (ahí el tablero va en el
   medio), y unas líneas en porcentajes apuntaban al vacío en una de las dos.
   De la idea principal baja una flecha a la pieza; de la pieza salen las de
   los dos bloques de arriba y, en el papel, las de abajo salen del tablero
   (`--centro-abajo: tablero` en la hoja de impresión). Cada una lleva el color
   de su bloque, que también tiene su título escrito: el color no dice nada solo.
   Al imprimir se vuelven a trazar en el aviso de `matchMedia("print")`, que
   corre con la maqueta de la hoja ya armada (ver js/coordenadas-tablero.js). */
const SVG_NS = 'http://www.w3.org/2000/svg';
function bordeHacia(r, hacia, redondo){
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const dx = hacia.x - cx, dy = hacia.y - cy;
  if(!dx && !dy) return { x: cx, y: cy };
  const k = redondo
    ? (r.width / 2) / Math.hypot(dx, dy)
    : Math.min(dx ? (r.width / 2) / Math.abs(dx) : Infinity, dy ? (r.height / 2) / Math.abs(dy) : Infinity);
  return { x: cx + dx * k, y: cy + dy * k };
}
const centroDe = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
function trazarFlechas(){
  const svg = document.querySelector('.mapa-lineas');
  const nodo = document.getElementById('nodo');
  if(!svg || !nodo || !svg.getClientRects().length) return;
  const base = svg.getBoundingClientRect();
  const rn = nodo.getBoundingClientRect();
  if(!base.width || !rn.width) { svg.replaceChildren(); return; }
  const abajo = getComputedStyle(svg).getPropertyValue('--centro-abajo').trim() === 'tablero'
    ? document.getElementById('tablero') : nodo;
  const rt = abajo.getBoundingClientRect();
  const defs = document.createElementNS(SVG_NS, 'defs');
  const trazos = [];
  [['caja-idea', '--b-idea', null], ['caja-1', '--b-1', rn], ['caja-2', '--b-2', rn],
   ['caja-3', '--b-3', abajo === nodo ? rn : 'tablero'], ['caja-4', '--b-4', abajo === nodo ? rn : 'tablero']].forEach(([clase, color, eje], i) => {
    const caja = document.querySelector('.' + clase);
    const rc = caja && caja.getBoundingClientRect();
    if(!rc || !rc.width) return;
    // La de la idea va de la caja a la pieza; las demás, del eje a la caja.
    // Cuando el eje es el tablero (en el papel), la flecha sale derecha del
    // costado, por fuera de los números de las filas, a la altura de la caja.
    let p1, p2;
    if(eje === 'tablero'){
      const izquierda = rc.left + rc.width / 2 < rt.left + rt.width / 2;
      const y = Math.min(Math.max(rc.top + rc.height / 2, rt.top + 12), rt.bottom - 12);
      p1 = { x: izquierda ? rt.left - 18 : rt.right + 2, y };
      p2 = { x: izquierda ? rc.right : rc.left, y };
    } else {
      const desde = eje || rc, hasta = eje ? rc : rn;
      p1 = bordeHacia(desde, centroDe(hasta), desde === rn);
      p2 = bordeHacia(hasta, centroDe(desde), hasta === rn);
    }
    const largo = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if(largo < 12) return;
    // Que la punta no se meta en el borde de la caja.
    const ux = (p2.x - p1.x) / largo, uy = (p2.y - p1.y) / largo;
    const x1 = p1.x + ux * 3 - base.left, y1 = p1.y + uy * 3 - base.top;
    const x2 = p2.x - ux * 4 - base.left, y2 = p2.y - uy * 4 - base.top;
    const id = 'flecha-' + i;
    const marca = document.createElementNS(SVG_NS, 'marker');
    marca.setAttribute('id', id);
    marca.setAttribute('viewBox', '0 0 10 10');
    marca.setAttribute('refX', '9'); marca.setAttribute('refY', '5');
    marca.setAttribute('markerWidth', '7'); marca.setAttribute('markerHeight', '7');
    marca.setAttribute('orient', 'auto');
    const punta = document.createElementNS(SVG_NS, 'path');
    punta.setAttribute('d', 'M0,0 L10,5 L0,10 z');
    punta.style.fill = 'var(' + color + ')';
    marca.appendChild(punta);
    defs.appendChild(marca);
    // Una curva suave y no una recta: se lee como un mapa hecho a mano.
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const curva = eje === 'tablero' ? 0 : Math.min(24, largo / 6);
    const cx = mx - uy * curva, cy = my + ux * curva;
    const linea = document.createElementNS(SVG_NS, 'path');
    linea.setAttribute('d', `M${x1.toFixed(1)},${y1.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`);
    linea.setAttribute('fill', 'none');
    linea.setAttribute('stroke-width', '1.8');
    linea.setAttribute('stroke-linecap', 'round');
    linea.style.stroke = 'var(' + color + ')';
    linea.setAttribute('marker-end', 'url(#' + id + ')');
    trazos.push(linea);
  });
  svg.setAttribute('viewBox', `0 0 ${base.width.toFixed(1)} ${base.height.toFixed(1)}`);
  svg.replaceChildren(defs, ...trazos);
}
let flechasPedidas = 0;
function pedirFlechas(){
  if(flechasPedidas) return;
  flechasPedidas = requestAnimationFrame(() => { flechasPedidas = 0; trazarFlechas(); });
}
if(window.ResizeObserver) new ResizeObserver(pedirFlechas).observe(document.getElementById('ficha-vista'));
new MutationObserver(pedirFlechas).observe(document.getElementById('mapa'), { childList: true, subtree: true, characterData: true });
window.addEventListener('resize', pedirFlechas);
if(document.fonts && document.fonts.ready) document.fonts.ready.then(pedirFlechas);

/* ---------------- El logo de la academia, en la esquina del papel ----------------
   El mismo que lleva el encabezado: el de la academia activa si la cuenta es
   de una (lo pone js/marca-academia.js, que llega después), o el de Ajedrez
   Integral si no. Una academia sin logo pone su nombre escrito. Se copia
   cuando cambia el encabezado, no al imprimir: una imagen que se empieza a
   pedir en el momento de imprimir no llega al papel. */
function copiarLogoEsquina(){
  const esquina = document.getElementById('logo-esquina');
  const enlace = document.getElementById('marca-enlace');
  if(!esquina || !enlace) return;
  const img = enlace.querySelector('img');
  if(img && img.getAttribute('src')){
    const copia = document.createElement('img');
    copia.src = img.src;
    copia.alt = '';
    copia.addEventListener('error', () => copia.remove());
    esquina.replaceChildren(copia);
  } else {
    const nombre = enlace.querySelector('.font-serif');
    esquina.textContent = nombre ? nombre.textContent.trim() : '';
  }
}
copiarLogoEsquina();
if(document.getElementById('marca-enlace')){
  new MutationObserver(copiarLogoEsquina).observe(document.getElementById('marca-enlace'), { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
}
if(window.matchMedia){
  const impresion = window.matchMedia('print');
  if(impresion.addEventListener) impresion.addEventListener('change', trazarFlechas);
  else if(impresion.addListener) impresion.addListener(trazarFlechas);
}
window.addEventListener('afterprint', pedirFlechas);

/* En pantalla la ficha abre en la posición de salida, para recorrer la línea
   jugada a jugada. En el papel eso es un tablero con las piezas en su casilla
   de siempre debajo de un pie que cuenta otra cosa («las blancas armaron el
   centro…»): se imprime la posición del final de la línea, que es la que
   describe el pie. Si se fue a una jugada en particular, se imprime esa. Al
   terminar vuelve a donde estaba. */
let volverAlInicio = false;
window.addEventListener('beforeprint', () => {
  const F = visor.ficha();
  const n = F ? FichaRender.jugadasDe(F).length : 0;
  volverAlInicio = !!n && visor.indice() === 0;
  if(volverAlInicio) visor.irA(n);
});
window.addEventListener('afterprint', () => {
  if(volverAlInicio) visor.irA(0);
  volverAlInicio = false;
});
document.getElementById('buscar').addEventListener('input', (e) => {
  busqueda = e.target.value.trim();
  pintarLista();
  mostrarLista();
});

/* ---------------- Arranque ---------------- */
async function unlock(){
  gate.classList.add('hidden');
  app.classList.remove('hidden');
  pintarLista();
  // Con ?ficha=<id> se abre esa ficha directo: son los enlaces que se
  // comparten, y los que llegan redirigidos desde la dirección vieja de
  // Fichas. Un id que ya no existe cae a la lista, no a una ficha vacía.
  const pedida = new URLSearchParams(window.location.search).get('ficha');
  const F = pedida ? FICHAS.find((x) => x.id === pedida) : null;
  if(F) abrirFicha(F); else mostrarLista();
  mostrarPapelSiPuedeBajarlo();
}

/* El libro y las cartas para recortar (material/fichas-de-estudio/) los baja
   quien administra y quien los compró en la tienda: el worker se los niega a
   cualquier otra cuenta, así que ofrecérselos sería un enlace que da «se
   compra aparte». Como todo filtro de pantalla, esto decide qué se PINTA; el
   candado es el del worker, que hace la misma pregunta: puede_bajar() con el
   nombre de la carpeta y sin que baste el acceso a la Academia.
   Respeta «Ver como»: quien administra mirando como alumno o como profesor no
   lo ve, porque ellos no lo ven sin comprarlo (ModoVista.perfilVisto le apaga
   is_admin; a quien administra puede_bajar() siempre le dice que sí, por eso
   no se le pregunta). Se espera al DOMContentLoaded porque js/modo-vista.js
   llega con defer, después que este archivo. */
const PRODUCTO_PAPEL = 'fichas-de-estudio';
async function mostrarPapelSiPuedeBajarlo(){
  try {
    if(document.readyState === 'loading') await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
    const { data: ses } = await sb.auth.getSession();
    const uid = ses && ses.session && ses.session.user && ses.session.user.id;
    if(!uid) return;
    const { data } = await sb.from('profiles').select('id, role, is_admin, es_supervisor').eq('id', uid).maybeSingle();
    if(!data) return;
    let quien = null;
    if(data.is_admin === true){
      const visto = window.ModoVista ? ModoVista.perfilVisto(data) : data;
      if(visto && visto.is_admin === true) quien = 'admin';
    } else {
      const { data: puede, error } = await sb.rpc('puede_bajar', { p_producto: PRODUCTO_PAPEL, p_basta_acceso: false });
      if(!error && puede === true) quien = 'compra';
    }
    if(!quien) return;
    document.getElementById('papel-quien').textContent = quien === 'admin'
      ? 'Solo para administración.'
      : 'Los compraste en la tienda: aquí los bajas cuando quieras.';
    document.getElementById('papel-admin').hidden = false;
  } catch (e) { /* si no se puede saber, no se muestra */ }
}

// Entrenamiento exige sesión iniciada en el sitio (Academia) — así el
// tiempo de estudio queda visible para el profesor en Informes.
async function requireLoginThenGate(){
  let hasSession = false;
  try {
    const { data } = await sb.auth.getSession();
    hasSession = !!(data && data.session);
  } catch (e) {
    hasSession = false;
  }
  if(!hasSession){
    gateChecking.textContent = 'Necesitas iniciar sesión en el sitio para entrar. Redirigiendo a iniciar sesión…';
    window.location.href = '../login.html?next=' + encodeURIComponent(NEXT_PATH);
    return;
  }
  gateChecking.classList.add('hidden');
  unlock();
}

requireLoginThenGate();
