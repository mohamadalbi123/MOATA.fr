alter table public.assistants
add column if not exists brand_color text not null default '#050505';
