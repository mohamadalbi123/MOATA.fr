alter table public.assistants
add column if not exists assistant_language text not null default 'English';
