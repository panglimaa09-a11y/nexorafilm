-- ============================================================
-- NEXORA FILM — sistem token (full token, langganan dihapus)
-- Keputusan Tuan 16 Okt 2026: 1 token = Rp15.000 = 1 film (48 jam).
-- File ini: tabel baru + RLS + RPC atomik. Idempoten, aman di-run ulang.
-- ============================================================

-- ---------- tabel ----------

create table if not exists public.token_balances(
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.token_ledger(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta int not null, -- +N kredit, -N pakai
  reason text not null, -- 'purchase' | 'spend' | 'conversion' | 'adjustment'
  movie_id uuid references public.movies(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists token_ledger_user_idx on public.token_ledger(user_id, created_at desc);
create unique index if not exists token_ledger_payment_unique
  on public.token_ledger(payment_id) where payment_id is not null;

create table if not exists public.token_unlocks(
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_id uuid not null references public.movies(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key(user_id, movie_id)
);
create index if not exists token_unlocks_expiry_idx on public.token_unlocks(expires_at);

-- payments: dukung pembelian token (plan_id jadi opsional)
alter table public.payments alter column plan_id drop not null;
alter table public.payments add column if not exists token_qty int;

-- ---------- RLS ----------
alter table public.token_balances enable row level security;
alter table public.token_ledger enable row level security;
alter table public.token_unlocks enable row level security;

drop policy if exists "own balance read" on public.token_balances;
create policy "own balance read" on public.token_balances
  for select using (auth.uid() = user_id);

drop policy if exists "own ledger read" on public.token_ledger;
create policy "own ledger read" on public.token_ledger
  for select using (auth.uid() = user_id);

drop policy if exists "own unlocks read" on public.token_unlocks;
create policy "own unlocks read" on public.token_unlocks
  for select using (auth.uid() = user_id);

-- ---------- RPC: pakai 1 token untuk 1 film (atomik) ----------
create or replace function public.spend_token_for_movie(
  p_user_id uuid,
  p_movie_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_balance int;
begin
  if not exists (
    select 1 from public.movies where id = p_movie_id and published = true
  ) then
    return 'movie_not_found';
  end if;

  if exists (
    select 1 from public.token_unlocks
     where user_id = p_user_id and movie_id = p_movie_id
       and expires_at > v_now
  ) then
    return 'unlocked';
  end if;

  select balance into v_balance
    from public.token_balances
   where user_id = p_user_id
   for update;

  if v_balance is null or v_balance < 1 then
    return 'insufficient';
  end if;

  update public.token_balances
     set balance = balance - 1, updated_at = v_now
   where user_id = p_user_id;

  insert into public.token_unlocks(user_id, movie_id, unlocked_at, expires_at)
  values (p_user_id, p_movie_id, v_now, v_now + interval '48 hours')
  on conflict(user_id, movie_id) do update
    set unlocked_at = v_now, expires_at = v_now + interval '48 hours';

  insert into public.token_ledger(user_id, delta, reason, movie_id, note)
  values (p_user_id, -1, 'spend', p_movie_id, 'Tonton film (48 jam)');

  return 'spent';
end;
$$;

-- ---------- RPC: kredit token dari pembayaran Pakasir ----------
create or replace function public.credit_tokens_for_payment(
  p_payment_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%ROWTYPE;
  v_qty int;
  v_now timestamptz := now();
begin
  select *
    into v_payment
    from public.payments
   where id = p_payment_id
     and provider = 'pakasir'
     and status = 'paid'
   for update;

  if not found then
    raise exception 'Verified Pakasir payment not found or not paid';
  end if;

  if exists (
    select 1 from public.token_ledger where payment_id = p_payment_id
  ) then
    return 0;
  end if;

  v_qty := coalesce(v_payment.token_qty, 0);
  if v_qty < 1 then
    v_qty := floor(v_payment.amount / 15000)::int;
  end if;
  if v_qty < 1 then
    raise exception 'Payment has no token quantity';
  end if;

  insert into public.token_balances(user_id, balance, updated_at)
  values (v_payment.user_id, v_qty, v_now)
  on conflict(user_id) do update
    set balance = public.token_balances.balance + v_qty,
        updated_at = v_now;

  insert into public.token_ledger(user_id, delta, reason, payment_id, note)
  values (v_payment.user_id, v_qty, 'purchase', p_payment_id,
          'Beli ' || v_qty || ' token via Pakasir');

  return v_qty;
end;
$$;

revoke all on function public.spend_token_for_movie(uuid, uuid) from public;
revoke all on function public.spend_token_for_movie(uuid, uuid) from anon;
revoke all on function public.spend_token_for_movie(uuid, uuid) from authenticated;
grant execute on function public.spend_token_for_movie(uuid, uuid) to service_role;

revoke all on function public.credit_tokens_for_payment(uuid) from public;
revoke all on function public.credit_tokens_for_payment(uuid) from anon;
revoke all on function public.credit_tokens_for_payment(uuid) from authenticated;
grant execute on function public.credit_tokens_for_payment(uuid) to service_role;
