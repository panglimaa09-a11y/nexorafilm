-- Creator Studio video editor migration
-- Safe to run repeatedly in the Supabase SQL Editor.
alter table public.creator_videos
  add column if not exists thumbnail_path text;

comment on column public.creator_videos.thumbnail_path is
  'Private Supabase Storage object path for the creator-selected video thumbnail.';
