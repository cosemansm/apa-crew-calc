-- CrewRate Supabase Schema
-- Run this in the Supabase SQL editor to set up the database

-- Enable RLS
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;

-- Calculations table (stores saved crew cost calculations)
create table if not exists public.calculations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now() not null,
  project_name text not null default 'Untitled',
  role_name text not null,
  department text,
  agreed_rate integer not null,
  day_type text not null,
  day_of_week text not null,
  call_time text not null,
  wrap_time text not null,
  result_json jsonb,
  grand_total numeric(10,2) not null default 0
);

-- Enable Row Level Security
alter table public.calculations enable row level security;

-- Users can only see/edit their own calculations
create policy "Users can view own calculations"
  on public.calculations for select
  using (auth.uid() = user_id);

create policy "Users can insert own calculations"
  on public.calculations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own calculations"
  on public.calculations for update
  using (auth.uid() = user_id);

create policy "Users can delete own calculations"
  on public.calculations for delete
  using (auth.uid() = user_id);

-- Index for faster queries
create index if not exists idx_calculations_user_id on public.calculations(user_id);
create index if not exists idx_calculations_created_at on public.calculations(created_at);

-- 1-year data retention: Supabase pg_cron job to delete old records
-- Run this to set up automatic cleanup (requires pg_cron extension)
-- Note: You need to enable pg_cron in your Supabase project settings first

-- Create the cleanup function
create or replace function delete_old_calculations()
returns void as $$
begin
  delete from public.calculations
  where created_at < now() - interval '1 year';
end;
$$ language plpgsql security definer;

-- Schedule it to run daily at midnight (enable pg_cron first in Supabase dashboard)
-- select cron.schedule('cleanup-old-calculations', '0 0 * * *', 'select delete_old_calculations()');
