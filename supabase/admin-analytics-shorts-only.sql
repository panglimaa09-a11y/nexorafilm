-- NEXORA FILM: analytics support and enforce creator uploads as Shorts only.
-- Run in Supabase SQL Editor after creator-studio.sql.
begin;

alter table public.creator_videos
  add column if not exists video_type text not null default 'short',
  add column if not exists view_count bigint not null default 0,
  add column if not exists moderation_note text;

-- Existing community uploads are user uploads, so classify them as Shorts.
update public.creator_videos
set video_type = 'short'
where video_type is null or video_type <> 'short';

alter table public.creator_videos
  drop constraint if exists creator_videos_video_type_check;
alter table public.creator_videos
  add constraint creator_videos_video_type_check check (video_type = 'short');

alter table public.creator_videos
  drop constraint if exists creator_videos_view_count_check;
alter table public.creator_videos
  add constraint creator_videos_view_count_check check (view_count >= 0);

create index if not exists creator_videos_published_shorts_idx
  on public.creator_videos(status, video_type, created_at desc);

create index if not exists payments_status_created_idx
  on public.payments(status, created_at desc);

comment on column public.creator_videos.video_type is
  'Community uploads are Shorts only. Feature-length movies are managed by admins in public.movies.';
comment on column public.creator_videos.view_count is
  'Count of confirmed playback requests; not a monetization or payout ledger.';


-- Exact aggregates are calculated in PostgreSQL so analytics are not truncated
-- by the REST API row limit. Only authenticated admins may call this function.
create or replace function public.admin_revenue_analytics()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_revenue', coalesce(sum(p.amount) filter (where p.status = 'paid'), 0),
    'paid_count', count(*) filter (where p.status = 'paid'),
    'pending_count', count(*) filter (where p.status = 'pending'),
    'failed_count', count(*) filter (where lower(p.status) in ('cancelled','canceled','failed','expired')),
    'total_count', count(*),
    'monthly', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'month', to_char(m.month_start, 'YYYY-MM'),
          'revenue', m.revenue,
          'count', m.paid_count
        ) order by m.month_start
      )
      from (
        select
          date_trunc('month', created_at) as month_start,
          coalesce(sum(amount) filter (where status = 'paid'), 0) as revenue,
          count(*) filter (where status = 'paid') as paid_count
        from public.payments
        where created_at >= date_trunc('month', now()) - interval '5 months'
        group by date_trunc('month', created_at)
      ) m
    ), '[]'::jsonb)
  )
  into result
  from public.payments p;

  return result;
end;
$;

revoke all on function public.admin_revenue_analytics() from public;
revoke all on function public.admin_revenue_analytics() from anon;
grant execute on function public.admin_revenue_analytics() to authenticated;


commit;
