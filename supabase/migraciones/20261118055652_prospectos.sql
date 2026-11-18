-- Interesados: el seguimiento de quien preguntó por clases, de WhatsApp, de un
-- colegio, de una recomendación o de unirse.html, hasta que se inscribe o se
-- descarta. La idea es la de los «prospectos» de Chessgora; acá es solo un
-- seguimiento INTERNO (lo decidió el dueño el 17/11/2026): no hay formulario
-- público nuevo, la entrada pública sigue siendo unirse.html.
--
-- Decisiones:
--
-- * Una fila por interesado, con su estado (nuevo, contactado, clase de
--   prueba, inscrito, descartado), notas y la fecha del próximo contacto, que
--   es lo que hace que sea un seguimiento y no una lista: la página pone
--   arriba a quien toca llamar hoy.
-- * Quién ve qué lo decide la RLS: quien administra, todos; el supervisor de
--   una academia, los de SUS academias. `academia_id` puede quedar nulo (un
--   interesado que todavía no es de ninguna): esos solo los ve administración.
--   El conjunto de academias del supervisor se arma una vez
--   (`academia_id in (select id from academias where supervisor_id = …)`), no
--   fila por fila.
-- * Un supervisor con varias academias ve las de todas: es una lista de
--   gente que todavía no es de ninguna academia en el sentido de la
--   supervisión (no son cuentas), y cada tarjeta dice de cuál es.
-- * No hay funciones: se lee y escribe la tabla directo, porque no reparte
--   permisos ni dinero. Lo que el navegador no puede tocar lo cuida un
--   trigger: quién lo creó, cuándo, y la hora del último cambio.
-- * Son datos personales de gente que no tiene cuenta: van en la página de
--   privacidad, y los descartados se borran solos a los 12 meses de su último
--   cambio (pg_cron, todos los días a las 3:20 de Costa Rica).

create table public.prospectos (
  id                uuid primary key default gen_random_uuid(),
  academia_id       uuid references public.academias(id) on delete set null,
  nombre            text not null check (char_length(btrim(nombre)) between 1 and 120),
  contacto          text not null default '' check (char_length(contacto) <= 120),
  para_quien        text check (para_quien in ('el_mismo', 'hijo', 'otro')),
  edad              integer check (edad between 3 and 100),
  origen            text not null default 'whatsapp'
                    check (origen in ('whatsapp', 'colegio', 'unirse', 'recomendacion', 'redes', 'torneo', 'otro')),
  estado            text not null default 'nuevo'
                    check (estado in ('nuevo', 'contactado', 'clase_prueba', 'inscrito', 'descartado')),
  proximo_contacto  date,
  notas             text not null default '' check (char_length(notas) <= 2000),
  creado_por        uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.prospectos is
  'Interesados: quien preguntó por clases y en qué va su seguimiento. Seguimiento interno (no hay formulario público). Lo ven quien administra (todos) y el supervisor de la academia (los de sus academias); academia_id nulo = solo administración.';
create index prospectos_academia on public.prospectos (academia_id);
create index prospectos_proximo on public.prospectos (proximo_contacto) where estado not in ('inscrito', 'descartado');

alter table public.prospectos enable row level security;
revoke all on public.prospectos from public, anon, authenticated;
grant select, insert, update, delete on public.prospectos to authenticated;

create policy prospectos_ver on public.prospectos for select to authenticated
  using ((select public.soy_admin())
         or academia_id in (select a.id from public.academias a where a.supervisor_id = (select auth.uid())));
create policy prospectos_agregar on public.prospectos for insert to authenticated
  with check ((select public.soy_admin())
              or academia_id in (select a.id from public.academias a where a.supervisor_id = (select auth.uid())));
create policy prospectos_cambiar on public.prospectos for update to authenticated
  using ((select public.soy_admin())
         or academia_id in (select a.id from public.academias a where a.supervisor_id = (select auth.uid())))
  with check ((select public.soy_admin())
              or academia_id in (select a.id from public.academias a where a.supervisor_id = (select auth.uid())));
create policy prospectos_borrar on public.prospectos for delete to authenticated
  using ((select public.soy_admin())
         or academia_id in (select a.id from public.academias a where a.supervisor_id = (select auth.uid())));

-- Lo que no se puede mandar desde el navegador: quién lo creó y las horas.
create or replace function interno.prospectos_sellar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
    new.created_at := now();
  else
    new.creado_por := old.creado_por;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function interno.prospectos_sellar() from public, anon, authenticated;

create trigger prospectos_sellar
  before insert or update on public.prospectos
  for each row execute function interno.prospectos_sellar();

-- Los descartados se borran a los 12 meses de su último cambio.
select cron.schedule('prospectos-purga-descartados', '20 9 * * *',
  $c$delete from public.prospectos where estado = 'descartado' and updated_at < now() - interval '12 months'$c$);
