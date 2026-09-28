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

commit;
