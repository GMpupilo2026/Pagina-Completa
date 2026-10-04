-- La hora de un avance de Entrenamiento, y los resultados que llegan tarde.
--
-- «Ejercicios sin internet» (entreno/sin-internet.html) sube los ejercicios
-- resueltos sin señal cuando la conexión vuelve, con la hora en que se
-- resolvieron: así cuentan para la racha y para «Cómo viene» el día que se
-- hicieron, no el día que hubo señal.
--
-- Hasta ahora `created_at` se aceptaba tal cual lo mandara el navegador: nada
-- impedía ponerle a un ejercicio una fecha de hace un año o del mes que
-- viene. Ahora, para lo que escribe una persona, la base lo acota: hasta 7
-- días atrás (lo que dura una tanda sin señal) y nunca adelante; fuera de eso
-- vale la hora de la base. Lo que escribe una función con la clave de
-- servicio (auth.uid() nulo) no se toca.
--
-- Y un mismo resultado sin señal no se cuenta dos veces: si se subió y la
-- respuesta se perdió con la señal, la página lo vuelve a mandar, y el índice
-- único por `sin_internet_id` lo rechaza.
-- Ver «Ejercicios sin internet» en docs/decisiones/entrenamiento.md.

create or replace function interno.training_progress_hora()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if (select auth.uid()) is not null then
    if new.created_at is null or new.created_at > now() or new.created_at < now() - interval '7 days' then
      new.created_at := now();
    end if;
  end if;
  return new;
end $$;
revoke execute on function interno.training_progress_hora() from public, anon, authenticated;
create trigger training_progress_hora before insert on public.training_progress
  for each row execute function interno.training_progress_hora();

create unique index training_progress_sin_internet
  on public.training_progress ((detail->>'sin_internet_id'))
  where detail ? 'sin_internet_id';
