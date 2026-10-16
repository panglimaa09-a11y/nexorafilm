-- ============================================================
-- NEXORA FILM — konversi SEKALI JALAN: sisa langganan aktif -> token
-- Keputusan Tuan 16 Okt 2026: "Konversi sisa langganan jadi token".
-- Cara pakai: JALANKAN SEKALI di Supabase SQL Editor, lalu JANGAN di-run lagi.
-- Rumus: token = max(1, round(nilai_sisa / 15000))
-- ============================================================

with conv as (
  select
    s.user_id,
    greatest(1, round(
      (
        extract(epoch from (s.current_period_end - now()))
        / nullif(
            coalesce(
              extract(epoch from (s.current_period_end - s.current_period_start)),
              30 * 24 * 3600
            ), 0)
      ) * p.price_monthly / 15000
    ))::int as tokens,
    s.id as subscription_id,
    p.name as plan_name
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.status = 'active'
    and s.current_period_end > now()
),
summed as (
  select user_id, sum(tokens)::int as tokens
  from conv
  group by user_id
),
upserted as (
  insert into public.token_balances(user_id, balance, updated_at)
  select user_id, tokens, now()
  from summed
  on conflict(user_id) do update
    set balance = public.token_balances.balance + excluded.balance,
        updated_at = now()
  returning user_id
)
insert into public.token_ledger(user_id, delta, reason, note)
select
  c.user_id,
  c.tokens,
  'conversion',
  'Konversi sisa langganan ' || string_agg(distinct c.plan_name, ', ')
from conv c
group by c.user_id, c.tokens;

update public.subscriptions s
   set status = 'converted'
  from conv c
 where s.id = c.subscription_id;

select
  (select count(*) from public.subscriptions where status = 'converted') as langganan_dikonversi,
  (select coalesce(sum(delta),0) from public.token_ledger where reason = 'conversion') as total_token_diberikan,
  (select count(distinct user_id) from public.token_ledger where reason = 'conversion') as user_terdampak;
