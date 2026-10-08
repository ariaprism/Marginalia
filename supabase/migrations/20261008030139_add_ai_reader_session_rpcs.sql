create or replace function public.advance_ai_reader_session(p_session_id uuid,p_owner_id uuid,p_character_count integer)
returns void language plpgsql security invoker set search_path='' as $$ begin
 update public.reader_sessions set character_count=character_count+greatest(0,p_character_count) where id=p_session_id and owner_id=p_owner_id and closed_at is null;
 if not found then raise exception 'reader session not found'; end if;
end; $$;
revoke all on function public.advance_ai_reader_session(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.advance_ai_reader_session(uuid,uuid,integer) to service_role;
create or replace function public.increment_ai_reader_session_trace(p_session_id uuid,p_owner_id uuid)
returns void language plpgsql security invoker set search_path='' as $$ begin
 update public.reader_sessions set trace_count=trace_count+1 where id=p_session_id and owner_id=p_owner_id and closed_at is null;
 if not found then raise exception 'reader session not found'; end if;
end; $$;
revoke all on function public.increment_ai_reader_session_trace(uuid,uuid) from public,anon,authenticated;
grant execute on function public.increment_ai_reader_session_trace(uuid,uuid) to service_role;
create or replace function public.close_ai_reader_session(p_owner_id uuid,p_reader_id text,p_book_id text,p_cursor text,p_locator jsonb,p_state jsonb,p_session_id uuid,p_now timestamptz)
returns void language plpgsql security invoker set search_path='' as $$ begin
 insert into public.reader_progress(owner_id,reader_id,book_id,cursor,locator,updated_at) values(p_owner_id,p_reader_id,p_book_id,p_cursor,p_locator,p_now)
 on conflict(owner_id,reader_id,book_id) do update set cursor=excluded.cursor,locator=excluded.locator,updated_at=excluded.updated_at;
 insert into public.reader_states(owner_id,reader_id,book_id,understanding,feeling,questions,attention,updated_at)
 values(p_owner_id,p_reader_id,p_book_id,coalesce(p_state->>'understanding',''),coalesce(p_state->>'feeling',''),coalesce(p_state->'questions','[]'::jsonb),coalesce(p_state->'attention','[]'::jsonb),p_now)
 on conflict(owner_id,reader_id,book_id) do update set understanding=excluded.understanding,feeling=excluded.feeling,questions=excluded.questions,attention=excluded.attention,updated_at=excluded.updated_at;
 if p_session_id is not null then update public.reader_sessions set closed_at=p_now,end_cursor=p_cursor,state_snapshot=p_state where id=p_session_id and owner_id=p_owner_id and reader_id=p_reader_id and book_id=p_book_id and closed_at is null;
 if not found then raise exception 'reader session not found'; end if;
 else insert into public.reader_sessions(owner_id,reader_id,book_id,started_at,closed_at,start_cursor,end_cursor,state_snapshot) values(p_owner_id,p_reader_id,p_book_id,p_now,p_now,p_cursor,p_cursor,p_state); end if;
end; $$;
revoke all on function public.close_ai_reader_session(uuid,text,text,text,jsonb,jsonb,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.close_ai_reader_session(uuid,text,text,text,jsonb,jsonb,uuid,timestamptz) to service_role;
