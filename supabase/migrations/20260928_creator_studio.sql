-- NEXORA FILM Creator Studio
-- Review this migration before applying it in Supabase SQL Editor.

create table if not exists public.creator_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  handle text not null unique check (handle ~ '^[a-z0-9_-]{3,30}$'),
  description text not null default '',
  status text not null default 'pending'
    check (status in ('pending','active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_videos (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.creator_channels(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 150),
  description text not null default '',
  storage_path text not null,
  status text not null default 'review'
    check (status in ('draft','review','published','rejected')),
  moderation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_video_path_owner check (
    storage_path like owner_id::text || '/%'
  )
);

create index if not exists creator_videos_owner_created_idx
  on public.creator_videos(owner_id, created_at desc);
create index if not exists creator_videos_status_idx
  on public.creator_videos(status);

alter table public.creator_channels enable row level security;
alter table public.creator_videos enable row level security;

drop policy if exists "creator channel read" on public.creator_channels;
create policy "creator channel read" on public.creator_channels
  for select to authenticated
  using (user_id = auth.uid() or status = 'active');

drop policy if exists "creator channel create own" on public.creator_channels;
create policy "creator channel create own" on public.creator_channels
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "creator channel admin manage" on public.creator_channels;
create policy "creator channel admin manage" on public.creator_channels
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "creator video read" on public.creator_videos;
create policy "creator video read" on public.creator_videos
  for select to authenticated
  using (owner_id = auth.uid() or status = 'published');

drop policy if exists "creator video insert own" on public.creator_videos;
create policy "creator video insert own" on public.creator_videos
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and status in ('draft','review')
    and exists (
      select 1 from public.creator_channels c
      where c.id = channel_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "creator video update own" on public.creator_videos;
create policy "creator video update own" on public.creator_videos
  for update to authenticated
  using (owner_id = auth.uid() and status <> 'published')
  with check (
    owner_id = auth.uid()
    and status in ('draft','review','rejected')
  );

drop policy if exists "creator video delete own" on public.creator_videos;
create policy "creator video delete own" on public.creator_videos
  for delete to authenticated
  using (owner_id = auth.uid() and status <> 'published');

drop policy if exists "creator video admin manage" on public.creator_videos;
create policy "creator video admin manage" on public.creator_videos
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Private bucket: uploads are not publicly accessible by URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creator-videos',
  'creator-videos',
  false,
  1073741824,
  array['video/mp4','video/webm','video/quicktime']
)
on conflict (id) do nothing;

drop policy if exists "creator upload own video" on storage.objects;
create policy "creator upload own video" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'creator-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "creator read own video object" on storage.objects;
create policy "creator read own video object" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'creator-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "creator delete own video object" on storage.objects;
create policy "creator delete own video object" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'creator-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Intentionally no user-facing earnings balance here.
-- Earnings must be derived from verified payments and auditable accounting.
