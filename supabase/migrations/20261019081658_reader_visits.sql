-- Real visits reuse reader_sessions; no online-presence inference or simulated events.
alter table public.reader_sessions add column if not exists mode text not null default 'unknown' check(mode in ('reading','browsing','annotations','unknown'));
alter table public.reader_sessions add column if not exists start_locator jsonb;
alter table public.reader_sessions add column if not exists end_locator jsonb;
alter table public.reader_sessions add column if not exists viewed_annotation_ids text[] not null default '{}';
alter table public.reader_sessions add column if not exists updated_at timestamptz not null default now();
update public.reader_sessions set updated_at=coalesce(closed_at,started_at);
update public.reader_sessions s set end_locator=p.locator from public.reader_progress p
where s.owner_id=p.owner_id and s.reader_id=p.reader_id and s.book_id=p.book_id and s.end_cursor=p.cursor;

create or replace function private.touch_reader_visit() returns trigger
language plpgsql security invoker set search_path='' as $$ begin new.updated_at:=clock_timestamp(); return new; end; $$;
revoke all on function private.touch_reader_visit() from public,anon,authenticated;
create trigger reader_sessions_touch before update on public.reader_sessions for each row execute function private.touch_reader_visit();

create or replace function public.record_ai_reader_window(
 p_session_id uuid,p_owner_id uuid,p_reader_id text,p_book_id text,p_character_count integer,
 p_cursor text,p_locator jsonb,p_save_progress boolean,p_expected_cursor text
) returns boolean language plpgsql security invoker set search_path='' as $$
declare current_cursor text; visit_mode text;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner_id::text||':'||p_reader_id||':'||p_book_id,0));
 update public.reader_sessions set character_count=character_count+greatest(0,p_character_count),end_cursor=p_cursor,end_locator=p_locator
 where id=p_session_id and owner_id=p_owner_id and reader_id=p_reader_id and book_id=p_book_id and closed_at is null returning mode into visit_mode;
 if not found then raise exception 'reader session not found'; end if;
 if visit_mode in ('browsing','annotations') or not p_save_progress or p_character_count<=0 then return false; end if;
 select cursor into current_cursor from public.reader_progress
 where owner_id=p_owner_id and reader_id=p_reader_id and book_id=p_book_id for update;
 -- A slow, overlapping read must not overwrite a newer read or close.
 if current_cursor is distinct from p_expected_cursor then return false; end if;
 insert into public.reader_progress(owner_id,reader_id,book_id,cursor,locator,updated_at)
 values(p_owner_id,p_reader_id,p_book_id,p_cursor,p_locator,clock_timestamp())
 on conflict(owner_id,reader_id,book_id) do update set cursor=excluded.cursor,locator=excluded.locator,updated_at=excluded.updated_at;
 return true;
end; $$;
revoke all on function public.record_ai_reader_window(uuid,uuid,text,text,integer,text,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.record_ai_reader_window(uuid,uuid,text,text,integer,text,jsonb,boolean,text) to service_role;

create or replace function public.close_ai_reader_session(p_owner_id uuid,p_reader_id text,p_book_id text,p_cursor text,p_locator jsonb,p_state jsonb,p_session_id uuid,p_now timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
declare visit_mode text;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner_id::text||':'||p_reader_id||':'||p_book_id,0));
 if p_session_id is not null then
   select mode into visit_mode from public.reader_sessions where id=p_session_id and owner_id=p_owner_id and reader_id=p_reader_id and book_id=p_book_id and closed_at is null for update;
   if not found then raise exception 'reader session not found'; end if;
   if visit_mode in ('browsing','annotations') then
     update public.reader_sessions set closed_at=p_now,end_cursor=p_cursor,end_locator=p_locator,state_snapshot=p_state where id=p_session_id;
     return;
   end if;
 end if;
 insert into public.reader_progress(owner_id,reader_id,book_id,cursor,locator,updated_at) values(p_owner_id,p_reader_id,p_book_id,p_cursor,p_locator,p_now)
 on conflict(owner_id,reader_id,book_id) do update set cursor=excluded.cursor,locator=excluded.locator,updated_at=excluded.updated_at;
 insert into public.reader_states(owner_id,reader_id,book_id,understanding,feeling,questions,attention,cursor,locator,updated_at)
 values(p_owner_id,p_reader_id,p_book_id,coalesce(p_state->>'understanding',''),coalesce(p_state->>'feeling',''),coalesce(p_state->'questions','[]'::jsonb),coalesce(p_state->'attention','[]'::jsonb),p_cursor,p_locator,p_now)
 on conflict(owner_id,reader_id,book_id) do update set understanding=excluded.understanding,feeling=excluded.feeling,questions=excluded.questions,attention=excluded.attention,cursor=excluded.cursor,locator=excluded.locator,updated_at=excluded.updated_at;
 if p_session_id is not null then update public.reader_sessions set closed_at=p_now,end_cursor=p_cursor,end_locator=p_locator,state_snapshot=p_state where id=p_session_id and owner_id=p_owner_id and reader_id=p_reader_id and book_id=p_book_id and closed_at is null;
 if not found then raise exception 'reader session not found'; end if;
 else insert into public.reader_sessions(owner_id,reader_id,book_id,started_at,closed_at,start_cursor,end_cursor,start_locator,end_locator,state_snapshot,mode) values(p_owner_id,p_reader_id,p_book_id,p_now,p_now,p_cursor,p_cursor,p_locator,p_locator,p_state,'reading'); end if;
end; $$;
revoke all on function public.close_ai_reader_session(uuid,text,text,text,jsonb,jsonb,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.close_ai_reader_session(uuid,text,text,text,jsonb,jsonb,uuid,timestamptz) to service_role;

-- Existing clients may already have advanced past events for the previously ignored entity.
insert into public.sync_changes(owner_id,entity_type,entity_id,operation)
select owner_id,'readerSession',id::text,'upsert' from public.reader_sessions;
