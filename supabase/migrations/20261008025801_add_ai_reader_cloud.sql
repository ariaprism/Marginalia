-- Applied remotely. See docs/AI_READER_MCP_PLAN.md for the reader contract.
create table public.ai_reader_access_keys (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  reader_id text not null check (length(reader_id) between 1 and 80), label text not null default 'Marginalia AI Reader',
  key_prefix text not null, key_hash text not null unique, created_at timestamptz not null default now(),
  last_used_at timestamptz, revoked_at timestamptz
);
create table public.reader_progress (
  owner_id uuid not null references auth.users(id) on delete cascade, reader_id text not null, book_id text not null,
  cursor text not null, locator jsonb not null, updated_at timestamptz not null,
  primary key(owner_id,reader_id,book_id), foreign key(book_id,owner_id) references public.books(id,owner_id) on delete cascade
);
create table public.reader_states (
  owner_id uuid not null references auth.users(id) on delete cascade, reader_id text not null, book_id text not null,
  understanding text not null default '', feeling text not null default '',
  questions jsonb not null default '[]'::jsonb check(jsonb_typeof(questions)='array'),
  attention jsonb not null default '[]'::jsonb check(jsonb_typeof(attention)='array'), updated_at timestamptz not null,
  primary key(owner_id,reader_id,book_id), foreign key(book_id,owner_id) references public.books(id,owner_id) on delete cascade
);
create table public.reader_sessions (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  reader_id text not null, book_id text not null, started_at timestamptz not null default now(), closed_at timestamptz,
  start_cursor text, end_cursor text, character_count integer not null default 0 check(character_count>=0),
  trace_count integer not null default 0 check(trace_count>=0), state_snapshot jsonb,
  foreign key(book_id,owner_id) references public.books(id,owner_id) on delete cascade
);
create table public.reader_traces (
  id text primary key, owner_id uuid not null references auth.users(id) on delete cascade, reader_id text not null,
  book_id text not null, kind text not null check(kind in ('highlight','annotation')), locator jsonb not null,
  text text, session_id uuid references public.reader_sessions(id) on delete set null,
  created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz,
  foreign key(book_id,owner_id) references public.books(id,owner_id) on delete cascade,
  check((kind='highlight' and text is null) or (kind='annotation' and length(trim(text))>0))
);
alter table public.ai_reader_access_keys enable row level security;
alter table public.reader_progress enable row level security;
alter table public.reader_states enable row level security;
alter table public.reader_traces enable row level security;
alter table public.reader_sessions enable row level security;
create policy reader_progress_select on public.reader_progress for select to authenticated using ((select auth.uid())=owner_id);
create policy reader_states_select on public.reader_states for select to authenticated using ((select auth.uid())=owner_id);
create policy reader_traces_select on public.reader_traces for select to authenticated using ((select auth.uid())=owner_id);
create policy reader_sessions_select on public.reader_sessions for select to authenticated using ((select auth.uid())=owner_id);
grant select on public.reader_progress,public.reader_states,public.reader_traces,public.reader_sessions to authenticated;
revoke all on public.ai_reader_access_keys from anon,authenticated;
grant select(id,owner_id,reader_id,label,key_prefix,created_at,last_used_at,revoked_at) on public.ai_reader_access_keys to authenticated;
create index reader_progress_owner_book_idx on public.reader_progress(owner_id,book_id);
create index reader_states_owner_book_idx on public.reader_states(owner_id,book_id);
create index reader_traces_owner_book_idx on public.reader_traces(owner_id,book_id,created_at);
create index reader_sessions_owner_book_idx on public.reader_sessions(owner_id,book_id,started_at desc);
create or replace function private.record_ai_reader_change() returns trigger language plpgsql security definer set search_path='' as $$
declare row_owner uuid; row_id text; is_deleted boolean:=false;
begin
 row_owner:=case when tg_op='DELETE' then old.owner_id else new.owner_id end;
 if tg_argv[0] in ('readerProgress','readerState') then row_id:=case when tg_op='DELETE' then old.reader_id||':'||old.book_id else new.reader_id||':'||new.book_id end;
 else row_id:=case when tg_op='DELETE' then old.id::text else new.id::text end; end if;
 if tg_op<>'DELETE' and tg_argv[1]='has_deleted_at' then is_deleted:=new.deleted_at is not null; end if;
 insert into public.sync_changes(owner_id,entity_type,entity_id,operation)
 values(row_owner,tg_argv[0],row_id,case when tg_op='DELETE' or is_deleted then 'delete' else 'upsert' end);
 return case when tg_op='DELETE' then old else new end;
end; $$;
revoke all on function private.record_ai_reader_change() from public,anon,authenticated;
create trigger reader_progress_sync_change after insert or update or delete on public.reader_progress for each row execute function private.record_ai_reader_change('readerProgress','no_deleted_at');
create trigger reader_states_sync_change after insert or update or delete on public.reader_states for each row execute function private.record_ai_reader_change('readerState','no_deleted_at');
create trigger reader_traces_sync_change after insert or update or delete on public.reader_traces for each row execute function private.record_ai_reader_change('readerTrace','has_deleted_at');
create trigger reader_sessions_sync_change after insert or update or delete on public.reader_sessions for each row execute function private.record_ai_reader_change('readerSession','no_deleted_at');
