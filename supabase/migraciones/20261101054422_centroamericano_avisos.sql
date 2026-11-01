-- Centroamericano 2026: los avisos entre los árbitros y la cuenta principal, y los
-- árbitros «por definir». Ver «Avisos y árbitros por definir» en
-- docs/decisiones/juegos-y-torneos.md.
--
-- centroamericano_avisos lleva dos cosas, las dos entre UN enlace de árbitro y la
-- organización:
--   - un PEDIDO DE AYUDA del árbitro («necesito al árbitro principal en la mesa 7»,
--     de = 'arbitro'): queda «abierto» hasta que alguien de la organización lo marca
--     «atendido». Lo escribe la Edge Function centroamericano-mesa (el árbitro no
--     tiene cuenta), con la mesa que dice el enlace.
--   - un MENSAJE de la organización al árbitro (de = 'organizacion'): se manda a uno,
--     a un torneo o a todos —una fila por enlace— y el árbitro lo marca leído con
--     «Entendido» (leido_en), para que la organización sepa quién lo vio.
-- Nadie edita ni borra el texto de un aviso: lo único que cambia es «estado» (la
-- organización) y «leido_en» (la función, por el árbitro).
--
-- Los árbitros «por definir»: un enlace puede crearse sin nombre (nombrado = false,
-- «Árbitro 3»); el árbitro pone el suyo al abrirlo, o la organización se lo pone. Por
-- eso quien organiza también puede cambiar el nombre y el rango de mesas de un enlace.

alter table public.centroamericano_asignaciones
  add column nombrado boolean not null default true;
comment on column public.centroamericano_asignaciones.nombrado is
  'false: el enlace se creó sin saber quién lo usa («Árbitro 3», por definir). Pasa a true cuando el árbitro pone su nombre al abrirlo o la organización se lo pone.';

-- Quien organiza ya podía crear un enlace y apagarlo; ahora también ponerle nombre y
-- cambiarle las mesas (la auditoría ya anota arbitro, mesa_desde y mesa_hasta).
grant update (arbitro, nombrado, mesa_desde, mesa_hasta) on public.centroamericano_asignaciones to authenticated;

create table public.centroamericano_avisos (
  id uuid primary key default gen_random_uuid(),
  creado timestamptz not null default now(),
  de text not null check (de in ('arbitro', 'organizacion')),
  asignacion_id uuid not null references public.centroamericano_asignaciones(id) on delete cascade,
  mesa integer check (mesa between 1 and 9999),
  texto text not null default '' check (length(texto) <= 500),
  estado text not null default 'abierto' check (estado in ('abierto', 'atendido')),
  atendido_en timestamptz,
  atendido_por uuid references public.profiles(id) on delete set null,
  leido_en timestamptz,
  creado_por uuid default auth.uid() references public.profiles(id) on delete set null,
  check (de = 'arbitro' or length(btrim(texto)) > 0)
);
comment on table public.centroamericano_avisos is
  'Los avisos entre un árbitro del Centroamericano y la organización: el pedido de ayuda del árbitro (de = arbitro; estado abierto o atendido) y el mensaje de la organización al árbitro (de = organizacion; leido_en cuando el árbitro toca «Entendido»). El texto no se edita.';
create index centroamericano_avisos_asignacion_idx on public.centroamericano_avisos (asignacion_id, creado);
create index centroamericano_avisos_abiertos_idx on public.centroamericano_avisos (creado) where de = 'arbitro' and estado = 'abierto';

alter table public.centroamericano_avisos enable row level security;
revoke all on public.centroamericano_avisos from public, anon, authenticated;
grant select on public.centroamericano_avisos to authenticated;
grant insert (de, asignacion_id, mesa, texto) on public.centroamericano_avisos to authenticated;
grant update (estado) on public.centroamericano_avisos to authenticated;

create policy centroamericano_avisos_ver on public.centroamericano_avisos
  for select to authenticated
  using ((select public.tengo_herramienta('mesa-arbitro')));
-- La organización solo escribe MENSAJES suyos; el pedido de ayuda lo escribe la función.
create policy centroamericano_avisos_enviar on public.centroamericano_avisos
  for insert to authenticated
  with check (de = 'organizacion' and creado_por = (select auth.uid()) and (select public.tengo_herramienta('mesa-arbitro')));
create policy centroamericano_avisos_atender on public.centroamericano_avisos
  for update to authenticated
  using (de = 'arbitro' and (select public.tengo_herramienta('mesa-arbitro')))
  with check (de = 'arbitro' and (select public.tengo_herramienta('mesa-arbitro')));

-- Quién atendió un pedido y cuándo lo pone la base, no el navegador.
create function public.centroamericano_avisos_atendido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = 'atendido' and old.estado <> 'atendido' then
    new.atendido_en := now();
    new.atendido_por := (select auth.uid());
  elsif new.estado = 'abierto' then
    new.atendido_en := null;
    new.atendido_por := null;
  end if;
  return new;
end;
$$;
revoke all on function public.centroamericano_avisos_atendido() from public, anon, authenticated;
create trigger atendido before update on public.centroamericano_avisos
  for each row execute function public.centroamericano_avisos_atendido();
