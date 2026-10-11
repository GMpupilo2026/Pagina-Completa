alter table public.jdn_inscripciones
  add column identificacion text check (identificacion is null or char_length(identificacion) between 1 and 20),
  add column nacimiento date;
