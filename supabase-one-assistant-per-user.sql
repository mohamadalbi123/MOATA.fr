create unique index if not exists assistants_one_per_user_idx
on public.assistants (user_id);
