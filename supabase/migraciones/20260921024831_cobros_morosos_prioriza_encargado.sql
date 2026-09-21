-- El aviso de morosidad tiene que llegar a quien paga, no a quien juega.
-- correo_de_contacto() prioriza el correo propio del alumno (es la regla para
-- el resto del sitio: bienvenidas, recuperar acceso). Para cobros se quiere lo
-- contrario: el encargado activo primero, y el correo propio del alumno solo
-- si no tiene ningún encargado. Por eso una función aparte, no un cambio a
-- correo_de_contacto() que también usa recuperar-acceso.
CREATE OR REPLACE FUNCTION public.correo_cobro(p_alumno uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(
    (select e.email from public.encargados e
      where e.student_id = p_alumno and e.activo
      order by e.created_at
      limit 1),
    (select p.email from public.profiles p
      where p.id = p_alumno and not public.es_correo_interno(p.email))
  );
$function$;

CREATE OR REPLACE FUNCTION public.cobros_morosos()
 RETURNS TABLE(student_id uuid, alumno text, correo text, grupo text, moneda text, deuda numeric, cobros bigint, dias_atraso integer, vence_mas_viejo date)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    v.student_id,
    coalesce(p.full_name, p.email, 'Sin nombre'),
    public.correo_cobro(v.student_id),
    p.grupo,
    v.moneda,
    sum(v.saldo)::numeric,
    count(*),
    max(v.dias_atraso),
    min(v.vence)
  from public.cobros_vista v
  join public.profiles p on p.id = v.student_id
  where v.situacion = 'vencido'
  group by v.student_id, p.full_name, p.email, p.grupo, v.moneda
  order by max(v.dias_atraso) desc;
$function$;
