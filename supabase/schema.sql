-- Execute este arquivo no SQL Editor do projeto Supabase.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'employee' check (role in ('owner','employee')),
  created_at timestamptz not null default now()
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  code text null,
  name text not null,
  location text not null check (location in (
    'A1','A2','A3','A4','B1','B2','B3','B4','C1','C2','C3','C4',
    'D1','D2','D3','D4','E1','E2','E3','E4'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, role) values (new.id, 'employee')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute procedure public.create_profile_for_new_user();

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner'
  );
$$;

alter table public.profiles enable row level security;
alter table public.materials enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
for select to authenticated using (id = auth.uid());

drop policy if exists "authenticated users read materials" on public.materials;
create policy "authenticated users read materials" on public.materials
for select to authenticated using (true);

drop policy if exists "owners insert materials" on public.materials;
create policy "owners insert materials" on public.materials
for insert to authenticated with check (public.is_owner());

drop policy if exists "owners update materials" on public.materials;
create policy "owners update materials" on public.materials
for update to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "owners delete materials" on public.materials;
create policy "owners delete materials" on public.materials
for delete to authenticated using (public.is_owner());

-- Depois de criar seu usuário de administrador no Authentication > Users,
-- substitua o UUID abaixo pelo ID desse usuário e execute:
-- update public.profiles set role = 'owner' where id = 'UUID-DO-SEU-USUARIO';
