-- Table des codes de connexion gérantes
-- Chaque code est unique, lié à un profil gérante, et verrouillé à un seul appareil.
create table if not exists public.manager_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  device_id text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists manager_codes_code_idx on public.manager_codes(code);
create index if not exists manager_codes_profile_idx on public.manager_codes(profile_id);

alter table public.manager_codes enable row level security;

drop policy if exists "manager_codes_select" on public.manager_codes;
create policy "manager_codes_select" on public.manager_codes
  for select to authenticated using (public.is_owner());

drop policy if exists "manager_codes_insert" on public.manager_codes;
create policy "manager_codes_insert" on public.manager_codes
  for insert to authenticated with check (public.is_owner());

drop policy if exists "manager_codes_update" on public.manager_codes;
create policy "manager_codes_update" on public.manager_codes
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "manager_codes_delete" on public.manager_codes;
create policy "manager_codes_delete" on public.manager_codes
  for delete to authenticated using (public.is_owner());
