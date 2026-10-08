create policy ai_reader_access_keys_select on public.ai_reader_access_keys for select to authenticated using ((select auth.uid())=owner_id);
create index ai_reader_access_keys_owner_idx on public.ai_reader_access_keys(owner_id);
create index reader_progress_book_owner_idx on public.reader_progress(book_id,owner_id);
create index reader_states_book_owner_idx on public.reader_states(book_id,owner_id);
create index reader_sessions_book_owner_idx on public.reader_sessions(book_id,owner_id);
create index reader_traces_book_owner_idx on public.reader_traces(book_id,owner_id);
create index reader_traces_session_idx on public.reader_traces(session_id) where session_id is not null;
