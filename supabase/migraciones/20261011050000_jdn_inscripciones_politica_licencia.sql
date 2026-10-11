alter policy jdn_inscripciones_admin on public.jdn_inscripciones rename to jdn_inscripciones_con_herramienta;
alter policy jdn_inscripciones_con_herramienta on public.jdn_inscripciones
  using ((select public.tengo_herramienta('jdn-proyeccion')));
