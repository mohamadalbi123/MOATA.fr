alter table public.assistants
add column if not exists business_email text,
add column if not exists notification_email text,
add column if not exists lead_destination text default 'Booking link';

create table if not exists public.customer_leads (
  id uuid primary key default gen_random_uuid(),
  assistant_id uuid references public.assistants(id) on delete cascade,
  customer_name text,
  customer_email text,
  customer_phone text,
  answers jsonb default '{}'::jsonb,
  recommendation text,
  created_at timestamptz default now()
);

alter table public.customer_leads enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
    and tablename = 'customer_leads'
    and policyname = 'customer_leads_owner_select'
  ) then
    create policy customer_leads_owner_select
    on public.customer_leads
    for select
    using (
      exists (
        select 1
        from public.assistants
        where assistants.id = customer_leads.assistant_id
        and assistants.user_id = auth.uid()
      )
    );
  end if;
end $$;

create index if not exists customer_leads_assistant_id_created_at_idx
on public.customer_leads (assistant_id, created_at desc);
