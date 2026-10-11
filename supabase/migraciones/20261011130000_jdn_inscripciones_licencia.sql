-- jdn_inscripciones pasa a ser una herramienta de arbitraje con licencia
-- (jdn-proyeccion.html, id «jdn-proyeccion»), no una página solo para quien
-- administra: el dueño del sitio sí quiere la cédula y la fecha de
-- nacimiento de cada persona (para identificar con certeza a quien se repite
-- de una edición a otra, en vez de solo por el nombre, y para calcular la
-- edad exacta de cara al siguiente ciclo).
--
-- Ver «Proyección JDN por comité» en docs/decisiones/juegos-y-torneos.md.

alter table public.jdn_inscripciones
  add column identificacion text check (identificacion is null or char_length(identificacion) between 1 and 20),
  add column nacimiento date;

comment on table public.jdn_inscripciones is
  'Inscritos a una fase de los JDN(P) tal como los exporta el sistema del ICODER: comité, categoría, estado del trámite, cédula y fecha de nacimiento. Herramienta de arbitraje con licencia (tengo_herramienta(''jdn-proyeccion'')), no una herramienta gratis ni solo para quien administra. Se llena a mano con cada export nuevo (herramientas/jdn-proyeccion/preparar.py).';

-- alter policy (no drop + create): el MCP de Supabase cancela en silencio un
-- «drop policy» suelto en esta sesión; renombrar y cambiarle el using sí pasa.
alter policy jdn_inscripciones_admin on public.jdn_inscripciones rename to jdn_inscripciones_con_herramienta;
alter policy jdn_inscripciones_con_herramienta on public.jdn_inscripciones
  using ((select public.tengo_herramienta('jdn-proyeccion')));
