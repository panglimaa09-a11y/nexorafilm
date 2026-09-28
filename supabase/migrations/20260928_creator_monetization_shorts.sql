-- NEXORA FILM: creator subscriptions, Shorts and monetization progress.
-- Apply this migration in Supabase SQL Editor before testing the pages.

alter table public.creator_videos
  add column if not exists video_type text not null default 'long'
    check (video_type in ('long', 'short')),
  add column if not exists view_count bigint not null default 0,
  add column if not exists duration_seconds integer;

create table if not exists public.creator_subscriptions (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.creator_channels(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (subscriber_id, channel_id),
  check (subscriber_id <> channel_id)
);

create index if not exists creator_subscriptions_channel_idx
  on public.creator_subscriptions(channel_id);

create table if not exists public.creator_watch_events (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null references public.creator_videos(id) on delete cascade,
  channel_id uuid not null references public.creator_channels(id) on delete cascade,
  watch_date date not null default (timezone('utc', now()))::date,
  watched_seconds integer not null default 0
    check (watched_seconds between 0 and 1800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (viewer_id, video_id, watch_date)
);

create index if not exists creator_watch_events_channel_date_idx
  on public.creator_watch_events(channel_id, watch_date);

create table if not exists public.creator_monetization_applications (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.creator_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(channel_id)
);

alter table public.creator_subscriptions enable row level security;
alter table public.creator_watch_events enable row level security;
alter table public.creator_monetization_applications enable row level security;

-- Do not expose subscriber rows or subscriber identities through direct SELECT.
-- Return only the aggregate count for active channels.
drop policy if exists "Read creator subscriber counts" on public.creator_subscriptions;

create or replace function public.get_creator_subscriber_count(
  p_channel_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::bigint
  from public.creator_subscriptions s
  join public.creator_channels c on c.id = s.channel_id
  where s.channel_id = p_channel_id
    and c.status = 'active';
$$;

revoke all on function public.get_creator_subscriber_count(uuid)
  from public, anon, authenticated;
grant execute on function public.get_creator_subscriber_count(uuid)
  to anon, authenticated;
drop policy if exists "Users subscribe as themselves" on public.creator_subscriptions;
create policy "Users subscribe as themselves"
  on public.creator_subscriptions for insert to authenticated
  with check (
    subscriber_id = (select auth.uid())
    and exists (
      select 1 from public.creator_channels c
      where c.id = channel_id
        and c.status = 'active'
        and c.user_id <> (select auth.uid())
    )
  );
drop policy if exists "Users unsubscribe themselves" on public.creator_subscriptions;
create policy "Users unsubscribe themselves"
  on public.creator_subscriptions for delete to authenticated
  using (subscriber_id = (select auth.uid()));

drop policy if exists "View own watch history" on public.creator_watch_events;
create policy "View own watch history"
  on public.creator_watch_events for select to authenticated
  using (viewer_id = (select auth.uid()));

drop policy if exists "Creator views own applications" on public.creator_monetization_applications;
create policy "Creator views own applications"
  on public.creator_monetization_applications for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Creator applies for monetization" on public.creator_monetization_applications;
create policy "Creator applies for monetization"
  on public.creator_monetization_applications for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.creator_channels c
      where c.id = channel_id
        and c.user_id = (select auth.uid())
        and c.status = 'active'
    )
  );

-- Prevent clients from writing arbitrary watch events directly.
revoke insert, update, delete on public.creator_watch_events from anon, authenticated;

create or replace function public.record_creator_watch(
  p_video_id uuid,
  p_watched_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_channel uuid;
  v_event_id uuid;
  v_watch_date date := (timezone('utc', now()))::date;
begin
  if v_user is null then
    raise exception 'Login diperlukan untuk mencatat progres jam tayang.';
  end if;

  if p_watched_seconds is null
     or p_watched_seconds < 1
     or p_watched_seconds > 1800 then
    raise exception 'Durasi tontonan tidak valid.';
  end if;

  select v.channel_id into v_channel
  from public.creator_videos v
  join public.creator_channels c on c.id = v.channel_id
  where v.id = p_video_id
    and v.status = 'published'
    and c.status = 'active';

  if v_channel is null then
    raise exception 'Video tidak tersedia.';
  end if;

  if exists (
    select 1 from public.creator_videos v
    where v.id = p_video_id and v.owner_id = v_user
  ) then
    return jsonb_build_object('recorded', false, 'reason', 'own_video');
  end if;

  insert into public.creator_watch_events
    (viewer_id, video_id, channel_id, watch_date, watched_seconds)
  values
    (v_user, p_video_id, v_channel, v_watch_date, p_watched_seconds)
  on conflict (viewer_id, video_id, watch_date)
  do nothing
  returning id into v_event_id;

  if v_event_id is not null then
    update public.creator_videos
    set view_count = view_count + 1
    where id = p_video_id;
  else
    update public.creator_watch_events
    set watched_seconds = greatest(watched_seconds, p_watched_seconds),
        updated_at = now()
    where viewer_id = v_user
      and video_id = p_video_id
      and watch_date = v_watch_date;
  end if;

  return jsonb_build_object(
    'recorded', true,
    'new_view', v_event_id is not null
  );
end;
$$;

revoke all on function public.record_creator_watch(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.record_creator_watch(uuid, integer)
  to authenticated;

-- Public can discover active channels and published video metadata.
drop policy if exists "Public read active creator channels" on public.creator_channels;
create policy "Public read active creator channels"
  on public.creator_channels for select to anon, authenticated
  using (status = 'active');

drop policy if exists "Public read published creator videos" on public.creator_videos;
create policy "Public read published creator videos"
  on public.creator_videos for select to anon, authenticated
  using (
    status = 'published'
    and exists (
      select 1 from public.creator_channels c
      where c.id = channel_id and c.status = 'active'
    )
  );

-- Monetization thresholds are configurable by environment variables in the app.
-- This migration does NOT activate payouts or calculate real monetary earnings.