-- NexoraFilm: creator follows, analytics, monetization eligibility and safety scan metadata.
-- Run after creator-studio.sql and admin-analytics-shorts-only.sql.

begin;

create table if not exists public.creator_follows (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.creator_channels(id) on delete cascade,
  follower_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint creator_follows_unique unique(channel_id, follower_id)
);
create index if not exists creator_follows_channel_created_idx
  on public.creator_follows(channel_id, created_at desc);
create index if not exists creator_follows_follower_idx
  on public.creator_follows(follower_id, created_at desc);

alter table public.creator_follows enable row level security;
drop policy if exists "creator_follows_read_signed_in" on public.creator_follows;
create policy "creator_follows_read_signed_in"
  on public.creator_follows for select to authenticated using (true);
drop policy if exists "creator_follows_follow_self" on public.creator_follows;
create policy "creator_follows_follow_self"
  on public.creator_follows for insert to authenticated
  with check (follower_id = (select auth.uid()));
drop policy if exists "creator_follows_unfollow_self" on public.creator_follows;
create policy "creator_follows_unfollow_self"
  on public.creator_follows for delete to authenticated
  using (follower_id = (select auth.uid()));

alter table public.creator_videos
  add column if not exists scan_status text not null default 'pending',
  add column if not exists scan_provider text,
  add column if not exists scan_result jsonb,
  add column if not exists scanned_at timestamptz;

alter table public.creator_videos
  drop constraint if exists creator_videos_scan_status_check;
alter table public.creator_videos
  add constraint creator_videos_scan_status_check
  check (scan_status in ('pending','safe','blocked','review','unavailable'));

-- Existing videos are not retroactively declared safe: they require a fresh scan.
update public.creator_videos
set scan_status = 'pending'
where scan_status is null or scan_status not in ('pending','safe','blocked','review','unavailable');

create index if not exists creator_videos_scan_status_idx
  on public.creator_videos(scan_status, status, created_at desc);

create or replace function public.increment_creator_video_view(p_video_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.creator_videos
  set view_count = coalesce(view_count, 0) + 1
  where id = p_video_id
    and status = 'published'
    and video_type = 'short'
    and scan_status = 'safe';
end;
$$;

revoke all on function public.increment_creator_video_view(uuid) from public;
revoke all on function public.increment_creator_video_view(uuid) from anon;
revoke all on function public.increment_creator_video_view(uuid) from authenticated;
grant execute on function public.increment_creator_video_view(uuid) to service_role;

-- Only safe-scanned creator uploads can be published through the admin workflow.
create or replace function public.guard_creator_video_safe_publish()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'published' and new.scan_status is distinct from 'safe' then
    raise exception 'Video must pass automated safety scan before publication' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists creator_video_safe_publish_guard on public.creator_videos;
create trigger creator_video_safe_publish_guard
before insert or update of status, scan_status on public.creator_videos
for each row execute function public.guard_creator_video_safe_publish();

commit;
