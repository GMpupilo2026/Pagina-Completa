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

/* ---------------- Las fichas, las 56, en una sola página ----------------
   Acá vive TODO el material de fichas: aperturas, defensas, temas tácticos y
   conceptos. Antes estaba partido en dos páginas —esta con las 24 de apertura
   y defensa, y entreno/fichas.html con las 56— y eran la misma página dos
   veces: el mismo banco, el mismo mapa, el mismo tablero y dos listas que
   había que mantener parejas. Se juntaron acá y aquella se fue; su dirección
   redirige a esta en `_redirects`, con su ?ficha= incluido, porque esos
   enlaces se compartían y un 404 no le dice a nadie a dónde ir.

   Sin pestañas, a propósito: las cuatro categorías se pintan una debajo de
   otra con su <h2>, así se salta de grupo en grupo con lector de pantalla y
   nadie tiene que elegir una pestaña antes de poder ver nada. */
const { FICHAS, CATEGORIAS } = window.FichasEstudio;
const sinTildes = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const textoDe = (F) => [F.titulo, F.subtitulo, F.resumen, F.diagrama, F.centro.join(' '),
                        F.bloques.map((b) => b.join(' ')).join(' ')].join(' ');
let busqueda = '';

/* Buscar mira las cuatro categorías y va sin tildes: "peon pasado" tiene que
   encontrar la ficha aunque se escriba sin acento. Lo que sobrevive se sigue
   pintando dentro de su grupo, así el árbol de encabezados no cambia según lo
   que se escriba. */
function loQueSeVe(){
  if(!busqueda) return FICHAS;
  const q = sinTildes(busqueda);
  return FICHAS.filter((F) => sinTildes(textoDe(F)).includes(q));
}

const GLYPH_B = { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', k:'♚' };
const NIVEL = {1:'Principiante', 2:'Intermedio', 3:'Avanzado'};
const visor = FichaRender.crear();

function pintarLista(){
  const box = document.getElementById('ficha-lista');
  box.innerHTML = '';
  const visibles = loQueSeVe();
  document.getElementById('cuantas').textContent = busqueda
    ? `${visibles.length} ficha${visibles.length === 1 ? '' : 's'} con «${busqueda}»`
    : `${FICHAS.length} fichas`;
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
  } else {
    practicar.style.display = 'none';
  }

  visor.abrir(F);
  ponerEnLaDireccion(F.id);
  window.scrollTo({ top: 0 });
}

document.getElementById('volver').addEventListener('click', (e) => { e.preventDefault(); mostrarLista(); });
document.getElementById('b-imprimir').addEventListener('click', () => window.print());
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
