-- A qué correo le llega el cobro de este alumno, cuando hay que decirlo a mano.
--
-- Hasta ahora eso no se podía tocar: correo_cobro() miraba los encargados
-- apuntados en Informes y, si no había, la cuenta del alumno. Los dos son
-- datos de OTRA cosa —a quién se le manda el informe de la casa, con qué
-- entra el alumno—, así que corregir a dónde va el recibo obligaba a cambiar
-- algo que no era. Y el caso de todos los días es tan tonto como una letra
-- mal escrita en el correo de la mamá.
--
-- Una fila acá MANDA sobre todo lo demás y es la ÚNICA dirección a la que se
-- le avisa de ese cobro. No se suma a los encargados: si se sumara, corregir
-- un correo equivocado seguiría mandándole el aviso al equivocado.
create table if not exists public.cobros_contacto (
  student_id      uuid primary key references public.profiles(id) on delete cascade,
  nombre          text,
  email           text not null,
  nota            text,
  actualizado_por uuid references public.profiles(id),
  actualizado_at  timestamptz not null default now(),
  constraint cobros_contacto_email_con_forma check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint cobros_contacto_nombre_corto check (nombre is null or length(nombre) <= 120),
  constraint cobros_contacto_nota_corta   check (nota   is null or length(nota)   <= 300)
);

alter table public.cobros_contacto enable row level security;

-- Es de cobros, así que es de quien coordina: un profesor no tiene por qué
-- ver a quién le cobra la Academia, igual que no ve cobros_vista.
create policy cobros_contacto_coordinacion on public.cobros_contacto for all
  using (public.soy_coordinador()) with check (public.soy_coordinador());

-- El alumno lee el suyo y nada más: en "Mis pagos" tiene que poder ver a qué
-- correo le están llegando los avisos. Escribirlo no puede —no tiene política
-- de insert ni de update—, porque entonces bastaría con cambiarlo para dejar
-- de recibirlos.
create policy cobros_contacto_lee_alumno on public.cobros_contacto for select
  using (student_id = auth.uid());

revoke all on public.cobros_contacto from anon;

-- El correo se guarda en minúscula y sin espacios, la fecha la pone el reloj
-- del servidor, y NO se acepta un usuario interno: ese dominio no tiene MX a
-- propósito, así que fijarlo acá sería mandar los avisos de cobro a un buzón
-- que no existe. Resend acepta el envío, el correo rebota y no falla nada.
create or replace function public.proteger_cobros_contacto()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  new.email := lower(btrim(new.email));
  if public.es_correo_interno(new.email) then
    raise exception 'Ese es un usuario de la Academia, no un correo: nunca le llegaría el aviso';
  end if;
  new.nombre := nullif(btrim(coalesce(new.nombre, '')), '');
  new.nota   := nullif(btrim(coalesce(new.nota, '')), '');
  new.actualizado_at  := now();
  new.actualizado_por := auth.uid();
  if tg_op = 'UPDATE' then
    new.student_id := old.student_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.proteger_cobros_contacto() from public;

drop trigger if exists cobros_contacto_protegido on public.cobros_contacto;
create trigger cobros_contacto_protegido
  before insert or update on public.cobros_contacto
  for each row execute function public.proteger_cobros_contacto();

-- El correo al que van los avisos de cobro. El que se fijó a mano manda sobre
-- todo; si no hay, sigue siendo lo de siempre.
create or replace function public.correo_cobro(p_alumno uuid)
returns text
language sql
stable
set search_path to ''
as $$
  select coalesce(
    (select c.email from public.cobros_contacto c where c.student_id = p_alumno),
    (select e.email from public.encargados e
      where e.student_id = p_alumno and e.activo
      order by e.created_at
      limit 1),
    (select p.email from public.profiles p
      where p.id = p_alumno and not public.es_correo_interno(p.email))
  );
$$;