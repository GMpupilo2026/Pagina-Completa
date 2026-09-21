
create table public.tareas (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references public.profiles(id) on delete cascade,
  alumno_id uuid not null references public.profiles(id) on delete cascade,
  titulo text not null,
  instrucciones text not null,
  material_tipo text not null check (material_tipo in ('curso','herramienta')),
  material_slug text not null,
  material_label text not null,
  material_href text not null,
  leccion integer,
  vence_at timestamptz not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','completada')),
  completada_at timestamptz,
  created_at timestamptz not null default now()
);

create index tareas_alumno_idx on public.tareas (alumno_id, estado);
create index tareas_profesor_idx on public.tareas (profesor_id);

alter table public.tareas enable row level security;

-- Mismo aislamiento que class_sessions y game_state: cada profesor ve las
-- tareas que ÉL mandó, no las de un colega que comparte el mismo alumno.
create policy tareas_select on public.tareas for select
  using (
    (select is_admin from public.my_profile())
    or profesor_id = auth.uid()
    or alumno_id = auth.uid()
  );

create policy tareas_insert on public.tareas for insert
  with check (
    (select is_admin from public.my_profile())
    or (
      (select role from public.my_profile()) = 'profesor'
      and profesor_id = auth.uid()
      and soy_profesor_de(alumno_id)
    )
  );

-- El alumno también puede "actualizar" (marcar hecha) su propia tarea; lo
-- que puede tocar de verdad lo recorta el trigger de abajo, no esta política.
create policy tareas_update on public.tareas for update
  using (
    (select is_admin from public.my_profile())
    or profesor_id = auth.uid()
    or alumno_id = auth.uid()
  )
  with check (
    (select is_admin from public.my_profile())
    or profesor_id = auth.uid()
    or alumno_id = auth.uid()
  );

create policy tareas_delete on public.tareas for delete
  using (
    (select is_admin from public.my_profile())
    or profesor_id = auth.uid()
  );

-- Mismo patrón que protect_answer_grading: el alumno solo puede marcar y
-- desmarcar que la hizo. Todo lo demás vuelve a su valor de antes, así no
-- puede reescribirse la tarea ni cambiarse el plazo a sí mismo.
create or replace function public.proteger_tareas_alumno()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() = old.alumno_id and auth.uid() is distinct from old.profesor_id then
    new.profesor_id := old.profesor_id;
    new.alumno_id := old.alumno_id;
    new.titulo := old.titulo;
    new.instrucciones := old.instrucciones;
    new.material_tipo := old.material_tipo;
    new.material_slug := old.material_slug;
    new.material_label := old.material_label;
    new.material_href := old.material_href;
    new.leccion := old.leccion;
    new.vence_at := old.vence_at;
    new.created_at := old.created_at;
    if new.estado not in ('pendiente', 'completada') then
      new.estado := old.estado;
    end if;
    new.completada_at := case when new.estado = 'completada' then coalesce(new.completada_at, now()) else null end;
  end if;
  return new;
end;
$function$;

create trigger tareas_protege_alumno
before update on public.tareas
for each row execute function public.proteger_tareas_alumno();

-- Aviso push al crearla, mismo patrón que avisar_desafio/avisar_clase_abierta.
create or replace function public.avisar_tarea_asignada()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  profe text;
begin
  select coalesce(p.full_name, 'Tu profe') into profe
    from public.profiles p where p.id = new.profesor_id;

  perform public.avisar_push(
    array[new.alumno_id],
    'Nueva tarea',
    profe || ' te asignó «' || new.titulo || '». Vence el ' ||
      to_char(new.vence_at at time zone 'America/Costa_Rica', 'DD/MM HH24:MI') || '.',
    '/tareas.html',
    'tarea');
  return new;
end;
$function$;

create trigger tareas_avisa_push
after insert on public.tareas
for each row execute function public.avisar_tarea_asignada();
