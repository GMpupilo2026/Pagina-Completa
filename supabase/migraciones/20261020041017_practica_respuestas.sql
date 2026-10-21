create table if not exists public.practica_claves (
  deck text not null check (deck ~ '^[a-z0-9-]{1,60}/[a-z0-9-]{1,40}$'),
  lamina integer not null check (lamina between 1 and 500),
  pregunta text not null check (pregunta ~ '^[a-z0-9_-]{1,40}$'),
  tipo text not null check (tipo in ('opciones', 'texto', 'planilla')),
  clave jsonb,
  modelo text check (modelo is null or char_length(modelo) <= 4000),
  primary key (deck, lamina, pregunta),
  constraint practica_claves_forma check (coalesce(case tipo
    when 'opciones' then jsonb_typeof(clave) = 'object' and jsonb_typeof(clave->'correcta') = 'string'
    when 'planilla' then jsonb_typeof(clave) = 'array' and jsonb_array_length(clave) between 1 and 80
    else clave is null end, false))
);
alter table public.practica_claves enable row level security;
revoke all on table public.practica_claves from public, anon;
revoke insert, update, delete, truncate, references, trigger on table public.practica_claves from authenticated;
grant select on table public.practica_claves to authenticated;

create policy practica_claves_select on public.practica_claves for select to authenticated
  using (coalesce((select p.role = 'profesor' or coalesce(p.is_admin, false)
                     from public.profiles p where p.id = (select auth.uid())), false));

create table if not exists public.practica_respuestas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  envio text not null check (char_length(envio) between 4 and 40),
  titulo text not null check (char_length(titulo) between 1 and 160),
  deck text not null,
  lamina integer not null,
  pregunta text not null,
  respuesta text not null check (char_length(respuesta) <= 4000),
  correcta boolean,
  buenas integer,
  total integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint practica_respuestas_una_por_pregunta unique (envio, student_id, deck, lamina, pregunta),
  constraint practica_respuestas_clave_fk foreign key (deck, lamina, pregunta)
    references public.practica_claves (deck, lamina, pregunta) on delete cascade
);
create index if not exists practica_respuestas_owner_idx on public.practica_respuestas (owner_id, envio);
create index if not exists practica_respuestas_student_idx on public.practica_respuestas (student_id);
create index if not exists practica_respuestas_clave_idx on public.practica_respuestas (deck, lamina, pregunta);
alter table public.practica_respuestas enable row level security;
revoke all on table public.practica_respuestas from public, anon;
revoke insert, update, delete, truncate, references, trigger on table public.practica_respuestas from authenticated;
grant select on table public.practica_respuestas to authenticated;

create policy practica_respuestas_select on public.practica_respuestas for select to authenticated
  using (owner_id = (select auth.uid())
         or coalesce((select mp.is_admin from public.my_profile() mp), false));

create or replace function interno.norma_jugada(p_jugada text)
returns text
language sql
immutable
set search_path = public
as $$
  select replace(lower(translate(regexp_replace(coalesce(p_jugada, ''), '[\s.·]', '', 'g'), '–—', '--')), '0', 'o');
$$;
revoke execute on function interno.norma_jugada(text) from public, anon, authenticated;

create or replace function public.responder_practica(
  p_envio text, p_deck text, p_lamina integer, p_pregunta text, p_respuesta text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
  v_owner uuid;
  v_practica jsonb;
  v_clave public.practica_claves%rowtype;
  v_correcta boolean;
  v_buenas integer;
  v_total integer;
  v_arr jsonb;
  v_extras boolean;
begin
  if yo is null or not coalesce(public.acceso_vigente(), false) then
    raise exception 'Sin acceso vigente.' using errcode = '42501';
  end if;
  if not coalesce((select p.role = 'alumno' and not coalesce(p.is_admin, false)
                     from public.profiles p where p.id = yo), false) then
    raise exception 'Solo el alumnado contesta la práctica.' using errcode = '42501';
  end if;
  if p_respuesta is null or char_length(p_respuesta) > 4000 then
    raise exception 'La respuesta no tiene la forma esperada.' using errcode = '22023';
  end if;

  select g.owner_id, g.practica into v_owner, v_practica
    from public.game_state g
   where g.practica->>'id' = p_envio and public.es_mi_profesor(g.owner_id)
   limit 1;
  if v_owner is null or v_practica->>'deck' is distinct from p_deck
     or not coalesce((v_practica->'laminas') @> to_jsonb(p_lamina), false) then
    raise exception 'Esa práctica ya no está en tu clase.' using errcode = '22023';
  end if;

  select * into v_clave from public.practica_claves
   where deck = p_deck and lamina = p_lamina and pregunta = p_pregunta;
  if not found then
    raise exception 'Esa pregunta no existe.' using errcode = '22023';
  end if;

  if btrim(p_respuesta) = '' or (v_clave.tipo = 'planilla' and p_respuesta in ('[]', '[""]')) then
    delete from public.practica_respuestas
     where envio = p_envio and student_id = yo and deck = p_deck and lamina = p_lamina and pregunta = p_pregunta;
    return jsonb_build_object('guardada', true);
  end if;

  if v_clave.tipo = 'opciones' then
    v_correcta := btrim(p_respuesta) = v_clave.clave->>'correcta';
  elsif v_clave.tipo = 'planilla' then
    begin
      v_arr := p_respuesta::jsonb;
    exception when others then
      raise exception 'La planilla no tiene la forma esperada.' using errcode = '22023';
    end;
    if jsonb_typeof(v_arr) <> 'array' or jsonb_array_length(v_arr) > 80 then
      raise exception 'La planilla no tiene la forma esperada.' using errcode = '22023';
    end if;
    v_total := jsonb_array_length(v_clave.clave);
    select count(*) into v_buenas
      from jsonb_array_elements_text(v_clave.clave) with ordinality k(jugada, i)
     where interno.norma_jugada(v_arr->>((k.i - 1)::int)) = interno.norma_jugada(k.jugada);
    select exists (
      select 1 from jsonb_array_elements_text(v_arr) with ordinality a(jugada, i)
       where a.i > v_total and interno.norma_jugada(a.jugada) <> '') into v_extras;
    v_correcta := v_buenas = v_total and not v_extras;
  end if;

  insert into public.practica_respuestas
    (owner_id, student_id, envio, titulo, deck, lamina, pregunta, respuesta, correcta, buenas, total)
  values (v_owner, yo, p_envio, v_practica->>'titulo', p_deck, p_lamina, p_pregunta, p_respuesta, v_correcta, v_buenas, v_total)
  on conflict (envio, student_id, deck, lamina, pregunta) do update
    set respuesta = excluded.respuesta, correcta = excluded.correcta,
        buenas = excluded.buenas, total = excluded.total, updated_at = now();
  return jsonb_build_object('guardada', true);
end;
$$;
revoke execute on function public.responder_practica(text, text, integer, text, text) from public, anon;
grant execute on function public.responder_practica(text, text, integer, text, text) to authenticated;

create or replace function public.mis_respuestas_practica(p_envio text)
returns table (deck text, lamina integer, pregunta text, respuesta text)
language sql
stable
security definer
set search_path = public
as $$
  select r.deck, r.lamina, r.pregunta, r.respuesta
    from public.practica_respuestas r
   where r.student_id = (select auth.uid()) and r.envio = p_envio;
$$;
revoke execute on function public.mis_respuestas_practica(text) from public, anon;
grant execute on function public.mis_respuestas_practica(text) to authenticated;
