create extension if not exists pgcrypto;

create table if not exists public.profiles(id uuid primary key references auth.users(id) on delete cascade,display_name text,avatar_url text,role text not null default 'user',created_at timestamptz not null default now());
create table if not exists public.plans(id uuid primary key default gen_random_uuid(),name text not null unique,slug text not null unique,price_monthly numeric(12,2) not null default 0,video_quality text not null default 'HD',max_devices int not null default 1,features jsonb not null default '[]'::jsonb,active boolean not null default true,created_at timestamptz not null default now());
create table if not exists public.movies(id uuid primary key default gen_random_uuid(),title text not null,synopsis text,poster_url text,backdrop_url text,video_url text,video_path text,release_year int,content_type text not null default 'movie',published boolean not null default false,created_at timestamptz not null default now());
create table if not exists public.movie_plans(movie_id uuid references public.movies(id) on delete cascade,plan_id uuid references public.plans(id) on delete cascade,primary key(movie_id,plan_id));
create table if not exists public.subscriptions(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,plan_id uuid not null references public.plans(id),status text not null default 'pending',current_period_start timestamptz,current_period_end timestamptz,provider text,provider_subscription_id text,created_at timestamptz not null default now());
create table if not exists public.payments(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,plan_id uuid not null references public.plans(id),amount numeric(12,2) not null,status text not null default 'pending',provider text,provider_order_id text unique,raw_response jsonb,created_at timestamptz not null default now());
create table if not exists public.watch_history(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,movie_id uuid not null references public.movies(id) on delete cascade,progress_seconds int not null default 0,duration_seconds int not null default 0,updated_at timestamptz not null default now(),unique(user_id,movie_id));
create table if not exists public.watchlist(user_id uuid not null references auth.users(id) on delete cascade,movie_id uuid not null references public.movies(id) on delete cascade,created_at timestamptz not null default now(),primary key(user_id,movie_id));
alter table public.movies add column if not exists video_path text;

insert into public.plans(name,slug,price_monthly,video_quality,max_devices,features) values
('Mobile','mobile',39000,'HD',1,'["Streaming HD","1 perangkat","My List"]'),
('Standard','standard',69000,'Full HD',2,'["Streaming Full HD","2 perangkat","Download jika tersedia","My List"]'),
('Premium','premium',99000,'4K',4,'["Streaming 4K","4 perangkat","Download jika tersedia","My List"]'),
('Family','family',129000,'4K',6,'["Streaming 4K","6 perangkat","Profil keluarga","My List"]')
on conflict(slug) do nothing;


create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin'); $$;

alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.movies enable row level security;
alter table public.movie_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.watch_history enable row level security;
alter table public.watchlist enable row level security;

drop policy if exists "public plans" on public.plans;
create policy "public plans" on public.plans for select using(active=true);
drop policy if exists "admin manage plans" on public.plans;
create policy "admin manage plans" on public.plans for all using(public.is_admin()) with check(public.is_admin());

drop policy if exists "public movies" on public.movies;
create policy "public movies" on public.movies for select using(published=true);
drop policy if exists "admin manage movies" on public.movies;
create policy "admin manage movies" on public.movies for all using(public.is_admin()) with check(public.is_admin());

drop policy if exists "public movie plans" on public.movie_plans;
create policy "public movie plans" on public.movie_plans for select using(true);
drop policy if exists "admin manage movie plans" on public.movie_plans;
create policy "admin manage movie plans" on public.movie_plans for all using(public.is_admin()) with check(public.is_admin());

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all using(auth.uid()=id) with check(auth.uid()=id);

drop policy if exists "own subscription read" on public.subscriptions;
create policy "own subscription read" on public.subscriptions for select using(auth.uid()=user_id);

drop policy if exists "own history" on public.watch_history;
create policy "own history" on public.watch_history for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

drop policy if exists "own watchlist" on public.watchlist;
create policy "own watchlist" on public.watchlist for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

drop function if exists public.handle_new_user();
create or replace function public.handle_new_user() returns trigger language plpgsql security definer as $$ begin insert into public.profiles(id) values(new.id) on conflict do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
