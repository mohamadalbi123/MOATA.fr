alter table public.assistants
add column if not exists public_token text unique;

update public.assistants
set public_token = id::text
where public_token is null;
