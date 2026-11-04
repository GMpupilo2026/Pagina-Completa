-- Cobros en pausa (4/11/2026), a pedido del dueño: quiere revisarlos antes de
-- que le vuelva a llegar ningún correo de cobro a las familias.
-- Se apagan, sin borrarse, las tres tareas de cobros:
--   cobros-generar                    (emite los cobros del día)
--   cobros-recordatorios              (los tres avisos automáticos por correo)
--   cobros-recordatorios-programados  (los recordatorios con día y hora)
-- Nada se pierde: emitir_cobros() emite hasta la fecha que recibe, así que al
-- volver a encenderlas se ponen al día solas. Para volver a activar:
--   select cron.alter_job(jobid, active := true) from cron.job
--    where jobname in ('cobros-generar','cobros-recordatorios','cobros-recordatorios-programados');
select cron.alter_job(jobid, active := false)
  from cron.job
 where jobname in ('cobros-generar', 'cobros-recordatorios', 'cobros-recordatorios-programados');
