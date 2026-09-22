alter table public.cobros_recordatorios_programados
  add column if not exists nota text;

comment on column public.cobros_recordatorios_programados.nota is
  'Qué pasó al procesar este recordatorio: a quién se le mandó, o por qué no se mandó nada.';
