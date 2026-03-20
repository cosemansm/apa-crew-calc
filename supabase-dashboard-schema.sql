-- Projects table
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  client_name text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table projects enable row level security;
create policy "Users can manage own projects" on projects
  for all using (auth.uid() = user_id);

-- Project days table
create table if not exists project_days (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  day_number integer not null default 1,
  work_date date not null,
  role_name text not null,
  department text,
  agreed_rate integer not null,
  day_type text not null,
  day_of_week text not null,
  call_time text not null,
  wrap_time text not null,
  result_json jsonb,
  grand_total numeric(10,2) default 0,
  first_break_given boolean default true,
  first_break_time text,
  first_break_duration integer default 60,
  second_break_given boolean default true,
  second_break_time text,
  second_break_duration integer default 30,
  continuous_first_break_given boolean default true,
  continuous_additional_break_given boolean default true,
  travel_hours numeric(4,1) default 0,
  mileage numeric(6,1) default 0,
  previous_wrap text,
  is_bank_holiday boolean default false,
  created_at timestamptz default now()
);

alter table project_days enable row level security;
create policy "Users can manage own project days" on project_days
  for all using (project_id in (select id from projects where user_id = auth.uid()));

-- Favourite roles table
create table if not exists favourite_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role_name text not null,
  default_rate integer,
  created_at timestamptz default now(),
  unique(user_id, role_name)
);

alter table favourite_roles enable row level security;
create policy "Users can manage own favourites" on favourite_roles
  for all using (auth.uid() = user_id);
