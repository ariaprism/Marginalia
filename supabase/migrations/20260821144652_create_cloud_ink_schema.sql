create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  user_name text not null default '小狐狸', companion_name text not null default '小G',
  companion_subject text not null default '她', updated_at timestamptz not null default now()
);
create table public.books (
  id text primary key, owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null, english_title text, author text not null default '', language text not null default '',
  description text not null default '', source text not null default 'marginalia' check (source in ('marginalia','weread')),
  status text not null default 'wish' check (status in ('wish','reading','finished')),
  cover_tone text, epub_path text, cover_path text, content_hash text,
  added_at timestamptz not null, last_opened_at timestamptz, pinned_at timestamptz,
  updated_at timestamptz not null, deleted_at timestamptz
);
create table public.book_sections (
  id text primary key, owner_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null references public.books(id), spine_index integer not null check (spine_index >= 0),
  title text not null default '', href text not null default '', content_html text not null default '',
  content_text text not null default '', content_hash text, updated_at timestamptz not null, deleted_at timestamptz,
  unique (book_id, spine_index)
);
create table public.reading_positions (
  book_id text primary key references public.books(id), owner_id uuid not null references auth.users(id) on delete cascade,
  locator jsonb not null, chapter_progress integer not null default 0 check (chapter_progress between 0 and 100),
  total_progress integer not null default 0 check (total_progress between 0 and 100),
  read_at timestamptz not null, updated_at timestamptz not null
);
create table public.bookmarks (
  book_id text primary key references public.books(id), owner_id uuid not null references auth.users(id) on delete cascade,
  locator jsonb, moved_at timestamptz not null, deleted_at timestamptz
);
create table public.highlights (
  id text primary key, owner_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null references public.books(id), locator jsonb not null,
  color text not null check (color in ('rose','gold','mint')),
  created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz
);
create table public.annotations (
  id text primary key, owner_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null references public.books(id), highlight_id text references public.highlights(id),
  locator jsonb not null, text text not null, actor text not null default 'user' check (actor = 'user'),
  created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz
);
create table public.marginalia (
  id text primary key, owner_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null references public.books(id), annotation_id text references public.annotations(id),
  highlight_id text references public.highlights(id), locator jsonb not null, text text not null,
  actor text not null default 'companion' check (actor = 'companion'),
  visibility text not null default 'immediate' check (visibility in ('immediate','reveal_on_reach')),
  session_id text, idempotency_key text not null, created_at timestamptz not null,
  updated_at timestamptz not null, deleted_at timestamptz, unique (owner_id, idempotency_key)
);
create table public.sync_operations (
  operation_id text primary key, owner_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null, entity_id text not null, occurred_at timestamptz not null,
  accepted_at timestamptz not null default now()
);
create table public.sync_changes (
  change_id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null, entity_id text not null,
  operation text not null check (operation in ('upsert','delete')), changed_at timestamptz not null default now()
);

create index books_owner_id_idx on public.books(owner_id);
create index book_sections_owner_book_idx on public.book_sections(owner_id, book_id, spine_index);
create index reading_positions_owner_id_idx on public.reading_positions(owner_id);
create index bookmarks_owner_id_idx on public.bookmarks(owner_id);
create index highlights_owner_book_idx on public.highlights(owner_id, book_id);
create index annotations_owner_book_idx on public.annotations(owner_id, book_id);
create index annotations_highlight_id_idx on public.annotations(highlight_id);
create index marginalia_owner_book_idx on public.marginalia(owner_id, book_id);
create index marginalia_annotation_id_idx on public.marginalia(annotation_id);
create index marginalia_highlight_id_idx on public.marginalia(highlight_id);
create index sync_operations_owner_id_idx on public.sync_operations(owner_id);
create index sync_changes_owner_cursor_idx on public.sync_changes(owner_id, change_id);

create or replace function private.record_sync_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare row_owner uuid; row_id text; row_deleted_at timestamptz;
begin
  row_owner := case when tg_op = 'DELETE' then old.owner_id else new.owner_id end;
  row_id := case when tg_op = 'DELETE' then old.id::text else new.id::text end;
  if row_owner is distinct from (select auth.uid()) then raise exception 'sync owner mismatch'; end if;
  if tg_op <> 'DELETE' then row_deleted_at := new.deleted_at; end if;
  insert into public.sync_changes(owner_id,entity_type,entity_id,operation)
  values (row_owner,tg_argv[0],row_id,case when tg_op='DELETE' or row_deleted_at is not null then 'delete' else 'upsert' end);
  return case when tg_op='DELETE' then old else new end;
end; $$;
revoke all on function private.record_sync_change() from public, anon, authenticated;

create or replace function private.record_profile_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is distinct from (select auth.uid()) then raise exception 'sync owner mismatch'; end if;
  insert into public.sync_changes(owner_id,entity_type,entity_id,operation)
  values (new.owner_id,'profile',new.owner_id::text,'upsert');
  return new;
end; $$;
revoke all on function private.record_profile_change() from public, anon, authenticated;

create or replace function private.record_book_keyed_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare row_owner uuid; row_book_id text; is_deleted boolean := false;
begin
  row_owner := case when tg_op='DELETE' then old.owner_id else new.owner_id end;
  row_book_id := case when tg_op='DELETE' then old.book_id else new.book_id end;
  if row_owner is distinct from (select auth.uid()) then raise exception 'sync owner mismatch'; end if;
  if tg_op <> 'DELETE' and tg_argv[1]='has_deleted_at' then is_deleted := new.deleted_at is not null; end if;
  insert into public.sync_changes(owner_id,entity_type,entity_id,operation)
  values (row_owner,tg_argv[0],row_book_id,case when tg_op='DELETE' or is_deleted then 'delete' else 'upsert' end);
  return case when tg_op='DELETE' then old else new end;
end; $$;
revoke all on function private.record_book_keyed_change() from public, anon, authenticated;

create trigger profiles_sync_change after insert or update on public.profiles for each row execute function private.record_profile_change();
create trigger books_sync_change after insert or update or delete on public.books for each row execute function private.record_sync_change('book');
create trigger sections_sync_change after insert or update or delete on public.book_sections for each row execute function private.record_sync_change('chapter');
create trigger positions_sync_change after insert or update or delete on public.reading_positions for each row execute function private.record_book_keyed_change('readingProgress','no_deleted_at');
create trigger bookmarks_sync_change after insert or update or delete on public.bookmarks for each row execute function private.record_book_keyed_change('bookmark','has_deleted_at');
create trigger highlights_sync_change after insert or update or delete on public.highlights for each row execute function private.record_sync_change('highlight');
create trigger annotations_sync_change after insert or update or delete on public.annotations for each row execute function private.record_sync_change('annotation');
create trigger marginalia_sync_change after insert or update or delete on public.marginalia for each row execute function private.record_sync_change('marginalia');

alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.book_sections enable row level security;
alter table public.reading_positions enable row level security;
alter table public.bookmarks enable row level security;
alter table public.highlights enable row level security;
alter table public.annotations enable row level security;
alter table public.marginalia enable row level security;
alter table public.sync_operations enable row level security;
alter table public.sync_changes enable row level security;

create policy profiles_select on public.profiles for select to authenticated using ((select auth.uid())=owner_id);
create policy profiles_insert on public.profiles for insert to authenticated with check ((select auth.uid())=owner_id);
create policy profiles_update on public.profiles for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy books_select on public.books for select to authenticated using ((select auth.uid())=owner_id);
create policy books_insert on public.books for insert to authenticated with check ((select auth.uid())=owner_id);
create policy books_update on public.books for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy sections_select on public.book_sections for select to authenticated using ((select auth.uid())=owner_id);
create policy sections_insert on public.book_sections for insert to authenticated with check ((select auth.uid())=owner_id);
create policy sections_update on public.book_sections for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy positions_select on public.reading_positions for select to authenticated using ((select auth.uid())=owner_id);
create policy positions_insert on public.reading_positions for insert to authenticated with check ((select auth.uid())=owner_id);
create policy positions_update on public.reading_positions for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy bookmarks_select on public.bookmarks for select to authenticated using ((select auth.uid())=owner_id);
create policy bookmarks_insert on public.bookmarks for insert to authenticated with check ((select auth.uid())=owner_id);
create policy bookmarks_update on public.bookmarks for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy highlights_select on public.highlights for select to authenticated using ((select auth.uid())=owner_id);
create policy highlights_insert on public.highlights for insert to authenticated with check ((select auth.uid())=owner_id);
create policy highlights_update on public.highlights for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy annotations_select on public.annotations for select to authenticated using ((select auth.uid())=owner_id);
create policy annotations_insert on public.annotations for insert to authenticated with check ((select auth.uid())=owner_id);
create policy annotations_update on public.annotations for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy marginalia_select on public.marginalia for select to authenticated using ((select auth.uid())=owner_id);
create policy marginalia_insert on public.marginalia for insert to authenticated with check ((select auth.uid())=owner_id);
create policy marginalia_update on public.marginalia for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy operations_select on public.sync_operations for select to authenticated using ((select auth.uid())=owner_id);
create policy operations_insert on public.sync_operations for insert to authenticated with check ((select auth.uid())=owner_id);
create policy changes_select on public.sync_changes for select to authenticated using ((select auth.uid())=owner_id);

revoke all on all tables in schema public from anon;
grant select,insert,update on public.profiles,public.books,public.book_sections,public.reading_positions,public.bookmarks,public.highlights,public.annotations,public.marginalia to authenticated;
grant select,insert on public.sync_operations to authenticated;
grant select on public.sync_changes to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('library','library',false,104857600,array['application/epub+zip','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy library_select on storage.objects for select to authenticated using (bucket_id='library' and (storage.foldername(name))[1]=(select auth.uid())::text and owner_id=(select auth.uid())::text);
create policy library_insert on storage.objects for insert to authenticated with check (bucket_id='library' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy library_update on storage.objects for update to authenticated using (bucket_id='library' and (storage.foldername(name))[1]=(select auth.uid())::text and owner_id=(select auth.uid())::text) with check (bucket_id='library' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy library_delete on storage.objects for delete to authenticated using (bucket_id='library' and (storage.foldername(name))[1]=(select auth.uid())::text and owner_id=(select auth.uid())::text);
