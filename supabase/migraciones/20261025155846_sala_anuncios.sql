-- Los avisos de la organización de una sala de Torneos (el Centroamericano
-- 2026): quien administra escribe un mensaje («la ronda 6 se atrasa 30
-- minutos», «el bus sale a las 7:00») y queda arriba en la página del torneo y
-- les llega al celular a todos los aparatos que activaron «Avisarme en este
-- celular» en esa sala. Lo pidió el dueño del sitio.
--
-- - Los escribe solo quien administra (soy_admin()), por dos funciones que
--   validan: sala_anuncio_publicar() y sala_anuncio_quitar(). La tabla no tiene
--   política de escritura.
-- - Los lee cualquiera, solo los vigentes (no quitados y antes de «hasta») de
--   una sala visible, y sin la columna de quién lo escribió.
-- - En inglés, si se escribe: el aviso al celular sale en el idioma que eligió
--   ese aparato (y en español si no hay texto en inglés).
-- - Al publicar se dispara de una vez la revisión de los avisos
--   (disparar_sala_avisos(), la misma de pg_cron), así no espera los 5 minutos
--   ni la ventana del 1 al 8 de noviembre. La Edge Function sala-jugadores lo
--   manda una vez a cada aparato que ya estaba suscrito cuando se publicó,
--   anotado en sala_avisos_push_enviados con tipo «anuncio», no = 0 y el id
--   del aviso en «ronda».
--
-- Ver «Los avisos de la organización» en docs/decisiones/juegos-y-torneos.md.

create table public.sala_anuncios (
  id bigint generated always as identity primary key,
  sala text not null references public.salas_torneo (clave) on update cascade on delete cascade,
  texto text not null check (char_length(btrim(texto)) between 3 and 280),
  texto_en text check (texto_en is null or char_length(btrim(texto_en)) between 3 and 280),
  creado timestamptz not null default now(),
  hasta timestamptz not null,
  creado_por uuid references public.profiles (id) on delete set null,
  quitado timestamptz,
  check (hasta > creado and hasta <= creado + interval '72 hours')
);

comment on table public.sala_anuncios is
  'Los avisos de la organización de una sala de Torneos (Centroamericano 2026): arriba en su página y al celular de quien activó los avisos. Los escriben sala_anuncio_publicar() y sala_anuncio_quitar().';

create index sala_anuncios_sala_creado on public.sala_anuncios (sala, creado desc);

alter table public.sala_anuncios enable row level security;
revoke all on public.sala_anuncios from public, anon, authenticated;
grant select (id, sala, texto, texto_en, creado, hasta) on public.sala_anuncios to anon, authenticated;

create policy sala_anuncios_ver on public.sala_anuncios for select to anon, authenticated
  using (quitado is null and hasta > now()
         and exists (select 1 from public.salas_torneo s where s.clave = sala_anuncios.sala and s.visible));

-- ---- publicar y quitar: solo quien administra ----
create or replace function public.sala_anuncio_publicar(p_sala text, p_texto text, p_texto_en text default null, p_horas integer default 24)
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id bigint;
  v_en text := nullif(btrim(coalesce(p_texto_en, '')), '');
begin
  if not coalesce((select public.soy_admin()), false) then
    raise exception 'Solo quien administra puede publicar avisos.' using errcode = '42501';
  end if;
  if p_horas is null or p_horas < 1 or p_horas > 72 then
    raise exception 'El aviso dura de 1 a 72 horas.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.salas_torneo where clave = p_sala and visible) then
    raise exception 'Esa sala no existe o no está publicada.' using errcode = '22023';
  end if;
  insert into public.sala_anuncios (sala, texto, texto_en, hasta, creado_por)
  values (p_sala, btrim(p_texto), v_en, now() + make_interval(hours => p_horas), (select auth.uid()))
  returning id into v_id;
  -- Que salga ya al celular, sin esperar la vuelta de pg_cron.
  perform public.disparar_sala_avisos();
  return v_id;
end;
$$;
revoke execute on function public.sala_anuncio_publicar(text, text, text, integer) from public, anon;
grant execute on function public.sala_anuncio_publicar(text, text, text, integer) to authenticated;

create or replace function public.sala_anuncio_quitar(p_id bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not coalesce((select public.soy_admin()), false) then
    raise exception 'Solo quien administra puede quitar avisos.' using errcode = '42501';
  end if;
  update public.sala_anuncios set quitado = now() where id = p_id and quitado is null;
end;
$$;
revoke execute on function public.sala_anuncio_quitar(bigint) from public, anon;
grant execute on function public.sala_anuncio_quitar(bigint) to authenticated;

-- ---- el aviso al celular, una vez por aparato ----
alter table public.sala_avisos_push_enviados drop constraint sala_avisos_push_enviados_tipo_check;
alter table public.sala_avisos_push_enviados add constraint sala_avisos_push_enviados_tipo_check
  check (tipo in ('pareo', 'resultado', 'recordatorio', 'delegacion', 'anuncio'));
alter table public.sala_avisos_push_enviados drop constraint sala_avisos_push_enviados_no_check;
alter table public.sala_avisos_push_enviados add constraint sala_avisos_push_enviados_no_check
  check (no > 0 or (tipo in ('recordatorio', 'delegacion', 'anuncio') and no = 0));
