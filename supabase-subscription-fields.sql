alter table public.assistants
add column if not exists stripe_customer_id text,
add column if not exists stripe_subscription_id text,
add column if not exists subscription_status text not null default 'inactive',
add column if not exists billing_interval text,
add column if not exists subscription_current_period_end timestamptz;

create index if not exists assistants_stripe_subscription_id_idx
on public.assistants (stripe_subscription_id);
