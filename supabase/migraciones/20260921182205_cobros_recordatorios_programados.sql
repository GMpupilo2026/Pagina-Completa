-- Un recordatorio de cobro programado para un día y hora exactos: lo mismo
-- que "Recordar ahora", pero para más tarde en vez de en el momento. No
-- reemplaza la tanda automática (tres días antes, al día siguiente, a los 15
-- días): es un envío suelto que decide quien coordina.
CREATE TABLE public.cobros_recordatorios_programados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  programado_para timestamptz NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviado', 'cancelado')),
  correos text[],
  enviado_at timestamptz,
  creado_por uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- La tanda que los manda solo mira los pendientes que ya llegaron a su hora.
CREATE INDEX cobros_recordatorios_programados_pendientes_idx
  ON public.cobros_recordatorios_programados (programado_para)
  WHERE estado = 'pendiente';

ALTER TABLE public.cobros_recordatorios_programados ENABLE ROW LEVEL SECURITY;

-- Mismo criterio que cobros: quien coordina maneja los de los alumnos bajo su
-- coordinación, nadie más ve ni programa nada.
CREATE POLICY cobros_recordatorios_programados_coordinacion
  ON public.cobros_recordatorios_programados
  FOR ALL
  USING (public.soy_coordinador() AND public.bajo_mi_coordinacion(student_id))
  WITH CHECK (public.soy_coordinador() AND public.bajo_mi_coordinacion(student_id));

-- Dispara la tanda de programados, igual que disparar_recordatorios_cobro()
-- pero para otra acción de la misma Edge Function y con su propio job de
-- pg_cron: los programados hay que revisarlos seguido, no una vez al día.
CREATE OR REPLACE FUNCTION public.disparar_recordatorios_programados()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  secreto text;
begin
  -- Nada pendiente que ya llegó a su hora: no vale la pena la llamada HTTP.
  if not exists (
    select 1 from public.cobros_recordatorios_programados
    where estado = 'pendiente' and programado_para <= now()
  ) then
    return;
  end if;

  select decrypted_secret into secreto
    from vault.decrypted_secrets where name = 'tanda_cobros_secreto';
  if secreto is null or secreto = '' then
    raise warning 'No hay secreto de tanda: no se mandaron los recordatorios programados.';
    return;
  end if;
  perform net.http_post(
    url := 'https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/cobros-recordatorios',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || secreto),
    body := jsonb_build_object('action', 'tanda_programados'),
    timeout_milliseconds := 120000
  );
end;
$function$;

-- Cada 5 minutos: bastante seguido para que "a las 3pm" de verdad salga cerca
-- de las 3pm, sin llamar a la Edge Function todo el tiempo cuando no hay nada
-- que mandar (el exists de arriba corta la mayoría de las corridas).
SELECT cron.schedule('cobros-recordatorios-programados', '*/5 * * * *',
  $$select public.disparar_recordatorios_programados();$$);
