create table public.class_chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.class_chat_messages enable row level security;

create policy class_chat_messages_select_authenticated
  on public.class_chat_messages for select
  to authenticated
  using (true);

create policy class_chat_messages_insert_own
  on public.class_chat_messages for insert
  to authenticated
  with check (auth.uid() = sender_id);

create policy class_chat_messages_delete_profesor
  on public.class_chat_messages for delete
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'profesor'));

alter publication supabase_realtime add table public.class_chat_messages;