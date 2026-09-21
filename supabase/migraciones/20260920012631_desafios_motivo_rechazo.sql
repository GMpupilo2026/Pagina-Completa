alter table public.desafios
  add column motivo_rechazo text
  constraint desafios_motivo_rechazo_largo check (motivo_rechazo is null or char_length(motivo_rechazo) <= 140);

comment on column public.desafios.motivo_rechazo is
  'Motivo opcional que escribe quien rechaza un reto (ej. "Estoy estudiando"), para que a quien retó no le quede la duda de por qué. Solo se usa junto con estado = rechazado.';
