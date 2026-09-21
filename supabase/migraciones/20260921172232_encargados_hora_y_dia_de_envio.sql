-- A qué hora (y, para el informe semanal, en qué día) le llega el correo a
-- cada encargado. Antes salía siempre a las 7 de la mañana de Costa Rica,
-- que era la única hora que corría el cron; ahora el cron corre cada hora y
-- cada encargado se sirve solo en la suya.
alter table public.encargados
  add column if not exists hora_envio smallint not null default 7,
  add column if not exists dia_semana smallint;

alter table public.encargados
  drop constraint if exists encargados_hora_valida,
  add constraint encargados_hora_valida check (hora_envio between 0 and 23);

alter table public.encargados
  drop constraint if exists encargados_dia_semana_valido,
  add constraint encargados_dia_semana_valido check (dia_semana is null or dia_semana between 0 and 6);

comment on column public.encargados.hora_envio is
  'Hora de Costa Rica (0-23) a la que le llega el correo a este encargado.';
comment on column public.encargados.dia_semana is
  'Solo importa con frecuencia = semanal: 0=domingo … 6=sábado. NULL = el día que caiga, como antes de esta columna.';

-- El cron pasa de correr una vez al día a correr una vez por hora: cada
-- encargado se manda solo cuando la hora de Costa Rica coincide con la suya
-- (lo decide la Edge Function, filtrando por hora_envio). Mismo job, mismo
-- disparador — lo único que cambia es cuándo se dispara.
select cron.unschedule('informes-a-encargados')
where exists (select 1 from cron.job where jobname = 'informes-a-encargados');

select cron.schedule('informes-a-encargados', '0 * * * *',
                     $$select public.disparar_informes_encargados();$$);
