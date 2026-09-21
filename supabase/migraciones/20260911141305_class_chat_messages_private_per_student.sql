alter table public.class_chat_messages
  add column student_id uuid not null references public.profiles(id);

drop policy if exists class_chat_messages_select_authenticated on public.class_chat_messages;
drop policy if exists class_chat_messages_insert_own on public.class_chat_messages;
drop policy if exists class_chat_messages_delete_profesor on public.class_chat_messages;

-- Cada fila pertenece a la conversación privada de un alumno con el profesor
-- (student_id identifica esa conversación, la haya escrito el alumno o el profesor).
create policy class_chat_messages_select_own_thread
  on public.class_chat_messages for select
  to authenticated
  using (
    auth.uid() = student_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
  );

create policy class_chat_messages_insert_own_thread
  on public.class_chat_messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and (
      sender_id = student_id
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor')
    )
  );

create policy class_chat_messages_delete_profesor
  on public.class_chat_messages for delete
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor'));

create index class_chat_messages_student_id_idx on public.class_chat_messages (student_id, created_at);