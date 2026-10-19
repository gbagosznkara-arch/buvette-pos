/*
# Buvette — Schéma initial : tables principales + RLS

## Description
Caisse et gestion de buvette (offline-first PWA), deux rôles :
- Propriétaire (owner) : accès total, prix d'achat, marges, rapports.
- Gérante (manager) : ventes, dépenses, clôtures, stock (sans prix d'achat).

## Tables
1. profiles — profil + rôle (owner/manager), lié à auth.users.
2. categories — catégories de boissons.
3. mobile_operators — opérateurs Mobile Money (MTN, Moov, Celtiis, Wave).
4. products — boissons (SANS prix d'achat).
5. product_costs — prix d'achat (OWNER UNIQUEMENT).
6. sales — ventes (espèces/mobile/mixte/crédit, monnaie, statut).
7. sale_items — lignes de vente.
8. expenses — dépenses.
9. cash_sessions — clôtures de caisse.
10. stock_movements — entrées/casse/corrections.
11. consignments — consignes bouteilles/casiers.
12. notifications — notifications propriétaire.

## Sécurité
- RLS activée partout.
- Fonctions is_owner()/is_manager() sécurisent les politiques.
- product_costs invisible de la gérante.
- Ventes/dépenses/clôtures : la gérante ne voit que les siennes ; le propriétaire voit tout.
- UUID appareil (device_*_id) + index unique → anti-doublons à la synchronisation.

## Notes
- Trigger auto-crée le profil à l'inscription ; le premier inscrit devient owner, les suivants manager.
- Aucune suppression de ventes : les ventes annulées portent un statut.
*/

-- ============================================================
-- PROFILES
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'manager' check (role in ('owner','manager')),
  full_name text not null default '',
  phone text default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select
  to authenticated using (auth.uid() = id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles for insert
  to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles for update
  to authenticated using (auth.uid() = id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (auth.uid() = id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

drop policy if exists "profiles_delete" on public.profiles;
create policy "profiles_delete" on public.profiles for delete
  to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

-- Trigger : créer le profil auto à l'inscription.
-- Premier utilisateur = propriétaire, suivants = gérantes.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_meta_role text;
begin
  v_meta_role := coalesce(new.raw_app_meta_data->>'role', '');
  if v_meta_role in ('owner','manager') then
    v_role := v_meta_role;
  elsif exists (select 1 from public.profiles where role = 'owner') then
    v_role := 'manager';
  else
    v_role := 'owner';
  end if;
  insert into public.profiles (id, role, full_name, phone)
  values (new.id, v_role, coalesce(new.raw_user_meta_data->>'full_name',''), coalesce(new.raw_user_meta_data->>'phone',''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- FONCTIONS DE RÔLE (après création de profiles)
-- ============================================================

create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner');
$$;

create or replace function public.is_manager()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'manager');
$$;

-- ============================================================
-- CATEGORIES
-- ============================================================

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text default '',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

drop policy if exists "categories_select" on public.categories;
create policy "categories_select" on public.categories for select
  to authenticated using (true);

drop policy if exists "categories_insert" on public.categories;
create policy "categories_insert" on public.categories for insert
  to authenticated with check (public.is_owner());

drop policy if exists "categories_update" on public.categories;
create policy "categories_update" on public.categories for update
  to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "categories_delete" on public.categories;
create policy "categories_delete" on public.categories for delete
  to authenticated using (public.is_owner());

-- ============================================================
-- MOBILE OPERATORS
-- ============================================================

create table if not exists public.mobile_operators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text default '',
  color text default '#0ea5e9',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.mobile_operators enable row level security;

drop policy if exists "operators_select" on public.mobile_operators;
create policy "operators_select" on public.mobile_operators for select
  to authenticated using (true);

drop policy if exists "operators_insert" on public.mobile_operators;
create policy "operators_insert" on public.mobile_operators for insert
  to authenticated with check (public.is_owner());

drop policy if exists "operators_update" on public.mobile_operators;
create policy "operators_update" on public.mobile_operators for update
  to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "operators_delete" on public.mobile_operators;
create policy "operators_delete" on public.mobile_operators for delete
  to authenticated using (public.is_owner());

-- ============================================================
-- PRODUCTS (sans prix d'achat)
-- ============================================================

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text default '',
  category_id uuid references public.categories(id) on delete set null,
  format text not null default 'bouteille' check (format in ('bouteille','canette','sachet','verre','pack','casier','autre')),
  sell_price numeric(12,0) not null default 0,
  stock numeric(12,0) not null default 0,
  alert_threshold numeric(12,0) not null default 0,
  icon text default '',
  active boolean not null default true,
  allow_consignment boolean not null default false,
  consignment_amount numeric(12,0) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_category_idx on public.products(category_id);
create index if not exists products_active_idx on public.products(active);

alter table public.products enable row level security;

drop policy if exists "products_select" on public.products;
create policy "products_select" on public.products for select
  to authenticated using (true);

drop policy if exists "products_insert" on public.products;
create policy "products_insert" on public.products for insert
  to authenticated with check (public.is_owner());

drop policy if exists "products_update" on public.products;
create policy "products_update" on public.products for update
  to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "products_delete" on public.products;
create policy "products_delete" on public.products for delete
  to authenticated using (public.is_owner());

-- ============================================================
-- PRODUCT COSTS (prix d'achat — OWNER UNIQUEMENT)
-- ============================================================

create table if not exists public.product_costs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id) on delete cascade,
  buy_price numeric(12,0) not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.product_costs enable row level security;

drop policy if exists "costs_select" on public.product_costs;
create policy "costs_select" on public.product_costs for select
  to authenticated using (public.is_owner());

drop policy if exists "costs_insert" on public.product_costs;
create policy "costs_insert" on public.product_costs for insert
  to authenticated with check (public.is_owner());

drop policy if exists "costs_update" on public.product_costs;
create policy "costs_update" on public.product_costs for update
  to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "costs_delete" on public.product_costs;
create policy "costs_delete" on public.product_costs for delete
  to authenticated using (public.is_owner());

-- ============================================================
-- SALES
-- ============================================================

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  device_id text not null default '',
  device_sale_id text not null,
  manager_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  total numeric(12,0) not null default 0,
  payment_method text not null default 'cash' check (payment_method in ('cash','mobile','mixed','credit')),
  cash_amount numeric(12,0) not null default 0,
  mobile_amount numeric(12,0) not null default 0,
  operator_id uuid references public.mobile_operators(id) on delete set null,
  mobile_number text default '',
  change_given numeric(12,0) not null default 0,
  customer_name text default '',
  status text not null default 'paid' check (status in ('paid','held','cancelled','refunded')),
  cancel_reason text default '',
  created_at timestamptz not null default now(),
  synced_at timestamptz
);

create unique index if not exists sales_device_sale_unique on public.sales(device_id, device_sale_id);
create index if not exists sales_manager_idx on public.sales(manager_id);
create index if not exists sales_created_idx on public.sales(created_at);

alter table public.sales enable row level security;

drop policy if exists "sales_select" on public.sales;
create policy "sales_select" on public.sales for select
  to authenticated using (public.is_owner() or auth.uid() = manager_id);

drop policy if exists "sales_insert" on public.sales;
create policy "sales_insert" on public.sales for insert
  to authenticated with check (auth.uid() = manager_id);

drop policy if exists "sales_update" on public.sales;
create policy "sales_update" on public.sales for update
  to authenticated using (auth.uid() = manager_id)
  with check (auth.uid() = manager_id);

drop policy if exists "sales_delete" on public.sales;
create policy "sales_delete" on public.sales for delete
  to authenticated using (public.is_owner());

-- ============================================================
-- SALE ITEMS
-- ============================================================

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null default '',
  qty numeric(12,0) not null default 1,
  unit_price numeric(12,0) not null default 0,
  discount numeric(12,0) not null default 0
);

create index if not exists sale_items_sale_idx on public.sale_items(sale_id);

alter table public.sale_items enable row level security;

drop policy if exists "items_select" on public.sale_items;
create policy "items_select" on public.sale_items for select
  to authenticated using (
    public.is_owner() or exists (
      select 1 from public.sales s where s.id = sale_id and s.manager_id = auth.uid()
    )
  );

drop policy if exists "items_insert" on public.sale_items;
create policy "items_insert" on public.sale_items for insert
  to authenticated with check (
    exists (select 1 from public.sales s where s.id = sale_id and s.manager_id = auth.uid())
  );

drop policy if exists "items_delete" on public.sale_items;
create policy "items_delete" on public.sale_items for delete
  to authenticated using (public.is_owner());

-- ============================================================
-- EXPENSES
-- ============================================================

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  device_id text not null default '',
  device_expense_id text not null,
  manager_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  amount numeric(12,0) not null default 0,
  reason text not null default '',
  category text default '',
  created_at timestamptz not null default now(),
  synced_at timestamptz
);

create unique index if not exists expenses_device_unique on public.expenses(device_id, device_expense_id);

alter table public.expenses enable row level security;

drop policy if exists "expenses_select" on public.expenses;
create policy "expenses_select" on public.expenses for select
  to authenticated using (public.is_owner() or auth.uid() = manager_id);

drop policy if exists "expenses_insert" on public.expenses;
create policy "expenses_insert" on public.expenses for insert
  to authenticated with check (auth.uid() = manager_id);

drop policy if exists "expenses_delete" on public.expenses;
create policy "expenses_delete" on public.expenses for delete
  to authenticated using (public.is_owner());

-- ============================================================
-- CASH SESSIONS
-- ============================================================

create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id text not null default '',
  device_session_id text not null,
  manager_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  total_sales numeric(12,0) not null default 0,
  total_cash numeric(12,0) not null default 0,
  total_mobile numeric(12,0) not null default 0,
  operator_breakdown jsonb not null default '{}'::jsonb,
  sales_count int not null default 0,
  discounts numeric(12,0) not null default 0,
  refunds numeric(12,0) not null default 0,
  expenses_total numeric(12,0) not null default 0,
  expected_cash numeric(12,0) not null default 0,
  counted_cash numeric(12,0) not null default 0,
  cash_difference numeric(12,0) not null default 0,
  consignment_out numeric(12,0) not null default 0,
  consignment_in numeric(12,0) not null default 0,
  comment text default '',
  status text not null default 'closed' check (status in ('closed','validated')),
  created_at timestamptz not null default now(),
  synced_at timestamptz
);

create unique index if not exists cash_device_unique on public.cash_sessions(device_id, device_session_id);

alter table public.cash_sessions enable row level security;

drop policy if exists "cash_select" on public.cash_sessions;
create policy "cash_select" on public.cash_sessions for select
  to authenticated using (public.is_owner() or auth.uid() = manager_id);

drop policy if exists "cash_insert" on public.cash_sessions;
create policy "cash_insert" on public.cash_sessions for insert
  to authenticated with check (auth.uid() = manager_id);

drop policy if exists "cash_update" on public.cash_sessions;
create policy "cash_update" on public.cash_sessions for update
  to authenticated using (public.is_owner()) with check (public.is_owner());

-- ============================================================
-- STOCK MOVEMENTS
-- ============================================================

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  device_id text not null default '',
  device_mvmt_id text not null,
  product_id uuid not null references public.products(id) on delete cascade,
  type text not null check (type in ('entry','sale','breakage','correction','consignment_out','consignment_in')),
  quantity numeric(12,0) not null default 0,
  reason text default '',
  manager_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  synced_at timestamptz
);

create unique index if not exists stock_mvmt_device_unique on public.stock_movements(device_id, device_mvmt_id);
create index if not exists stock_mvmt_product_idx on public.stock_movements(product_id);

alter table public.stock_movements enable row level security;

drop policy if exists "stock_mvmt_select" on public.stock_movements;
create policy "stock_mvmt_select" on public.stock_movements for select
  to authenticated using (public.is_owner() or auth.uid() = manager_id);

drop policy if exists "stock_mvmt_insert" on public.stock_movements;
create policy "stock_mvmt_insert" on public.stock_movements for insert
  to authenticated with check (public.is_owner() or auth.uid() = manager_id);

-- ============================================================
-- CONSIGNMENTS
-- ============================================================

create table if not exists public.consignments (
  id uuid primary key default gen_random_uuid(),
  device_id text not null default '',
  device_consignment_id text not null,
  product_id uuid not null references public.products(id) on delete cascade,
  direction text not null check (direction in ('out','in')),
  quantity numeric(12,0) not null default 1,
  amount numeric(12,0) not null default 0,
  manager_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  synced_at timestamptz
);

create unique index if not exists consignment_device_unique on public.consignments(device_id, device_consignment_id);

alter table public.consignments enable row level security;

drop policy if exists "consignment_select" on public.consignments;
create policy "consignment_select" on public.consignments for select
  to authenticated using (public.is_owner() or auth.uid() = manager_id);

drop policy if exists "consignment_insert" on public.consignments;
create policy "consignment_insert" on public.consignments for insert
  to authenticated with check (public.is_owner() or auth.uid() = manager_id);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'info',
  title text not null default '',
  message text not null default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notif_user_idx on public.notifications(user_id);

alter table public.notifications enable row level security;

drop policy if exists "notif_select" on public.notifications;
create policy "notif_select" on public.notifications for select
  to authenticated using (auth.uid() = user_id);

drop policy if exists "notif_update" on public.notifications;
create policy "notif_update" on public.notifications for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "notif_insert" on public.notifications;
create policy "notif_insert" on public.notifications for insert
  to authenticated with check (public.is_owner() or auth.uid() = user_id);

drop policy if exists "notif_delete" on public.notifications;
create policy "notif_delete" on public.notifications for delete
  to authenticated using (public.is_owner() or auth.uid() = user_id);

-- ============================================================
-- DONNÉES INITIALES (catégories + opérateurs Bénin)
-- ============================================================

insert into public.categories (name, icon, sort_order) values
  ('Bières', 'beer', 1),
  ('Sodas', 'soda', 2),
  ('Eau minérale', 'water', 3),
  ('Jus naturels', 'juice', 4),
  ('Boissons énergisantes', 'energy', 5),
  ('Glacés', 'ice', 6),
  ('Autres', 'other', 7)
on conflict do nothing;

insert into public.mobile_operators (name, code, color) values
  ('MTN Mobile Money', 'mtn', '#ffcc00'),
  ('Moov Money', 'moov', '#0066cc'),
  ('Celtiis Cash', 'celtiis', '#00aa55'),
  ('Wave', 'wave', '#1e90ff')
on conflict do nothing;
