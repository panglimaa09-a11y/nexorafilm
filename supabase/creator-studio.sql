-- NEXORA FILM - complete Creator Studio database setup
-- Run once in Supabase Dashboard > SQL Editor > New query.
-- Safe to re-run: tables, policies and bucket are created idempotently.

create extension if not exists pgcrypto;

create table if not exists public.creator_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  handle text not null unique check (handle ~ '^[a-z0-9_-]{3,30}$'),
  description text not null default '' check (char_length(description) <= 1000),
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_videos (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.creator_channels(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 150),
  description text not null default '' check (char_length(description) <= 5000),
  storage_path text not null,
  thumbnail_path text,
  status text not null default 'review' check (status in ('draft','review','published','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_videos_storage_path_unique unique (storage_path)
);

alter table public.creator_videos add column if not exists thumbnail_path text;
alter table public.creator_videos add column if not exists updated_at timestamptz not null default now();
alter table public.creator_channels add column if not exists updated_at timestamptz not null default now();

create index if not exists creator_channels_status_created_idx
  on public.creator_channels(status, created_at desc);
create index if not exists creator_videos_owner_created_idx
  on public.creator_videos(owner_id, created_at desc);
create index if not exists creator_videos_channel_status_created_idx
  on public.creator_videos(channel_id, status, created_at desc);

alter table public.creator_channels enable row level security;
alter table public.creator_videos enable row level security;

-- Remove policies with these names before recreating them.
drop policy if exists "creator_channels_read_active_or_owner" on public.creator_channels;
create policy "creator_channels_read_active_or_owner"
  on public.creator_channels for select to authenticated
  using (status = 'active' or user_id = (select auth.uid()));

drop policy if exists "creator_channels_insert_own" on public.creator_channels;
create policy "creator_channels_insert_own"
  on public.creator_channels for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');

drop policy if exists "creator_channels_update_own" on public.creator_channels;
create policy "creator_channels_update_own"
  on public.creator_channels for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "creator_videos_read_published_or_owner" on public.creator_videos;
create policy "creator_videos_read_published_or_owner"
  on public.creator_videos for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (
      status = 'published'
      and exists (
        select 1 from public.creator_channels c
        where c.id = channel_id and c.status = 'active'
      )
    )
  );

drop policy if exists "creator_videos_insert_own" on public.creator_videos;
create policy "creator_videos_insert_own"
  on public.creator_videos for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and status = 'review'
    and exists (
      select 1 from public.creator_channels c
      where c.id = channel_id and c.user_id = (select auth.uid()) and c.status = 'active'
    )
  );

drop policy if exists "creator_videos_update_own" on public.creator_videos;
create policy "creator_videos_update_own"
  on public.creator_videos for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "creator_videos_delete_own_unpublished" on public.creator_videos;
create policy "creator_videos_delete_own_unpublished"
  on public.creator_videos for delete to authenticated
  using (owner_id = (select auth.uid()) and status <> 'published');

-- Private bucket: uploads are not exposed as public URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creator-videos',
  'creator-videos',
  false,
  1073741824,
  array['video/mp4','video/webm','video/quicktime','image/jpeg','image/png','image/webp','image/gif','image/avif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 1073741824,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "creator_storage_read_own" on storage.objects;
create policy "creator_storage_read_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'creator-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "creator_storage_upload_own" on storage.objects;
create policy "creator_storage_upload_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'creator-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "creator_storage_update_own" on storage.objects;
create policy "creator_storage_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'creator-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'creator-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "creator_storage_delete_own" on storage.objects;
create policy "creator_storage_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'creator-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

comment on table public.creator_channels is 'NEXORA FILM creator channels and review status.';
comment on table public.creator_videos is 'Creator-uploaded video metadata and moderation status.';
comment on column public.creator_videos.thumbnail_path is 'Private Storage object path for creator-selected thumbnail.';
