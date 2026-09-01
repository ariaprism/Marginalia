create or replace function public.apply_profile_book_sync_operation(
  p_operation_id text,
  p_entity_type text,
  p_entity_id text,
  p_operation text,
  p_occurred_at timestamptz,
  p_payload jsonb
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_owner uuid := (select auth.uid());
begin
  if current_owner is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_operation_id is null or length(p_operation_id) > 200
    or p_entity_id is null or length(p_entity_id) > 500 then
    raise exception 'invalid sync operation';
  end if;

  -- A retried operation is a success, but must not create another row or change event.
  if exists (
    select 1 from public.sync_operations
    where operation_id = p_operation_id and owner_id = current_owner
  ) then
    return true;
  end if;

  -- This first vertical slice intentionally accepts only non-destructive profile/book data.
  if p_operation <> 'upsert' or p_entity_type not in ('profile', 'book') then
    return false;
  end if;

  if p_entity_type = 'profile' then
    if p_entity_id <> 'self' then
      raise exception 'invalid profile id';
    end if;

    insert into public.profiles (
      owner_id, user_name, companion_name, companion_subject, updated_at
    ) values (
      current_owner,
      coalesce(nullif(p_payload->>'userName', ''), '小狐狸'),
      coalesce(nullif(p_payload->>'companionName', ''), '小G'),
      case p_payload->>'companionPronoun'
        when '她' then '她' when '他' then '他' when 'TA' then 'TA' when 'name' then 'name'
        else '她'
      end,
      p_occurred_at
    )
    on conflict (owner_id) do update set
      user_name = excluded.user_name,
      companion_name = excluded.companion_name,
      companion_subject = excluded.companion_subject,
      updated_at = excluded.updated_at
    where excluded.updated_at >= public.profiles.updated_at;
  else
    if p_entity_id is distinct from p_payload->>'id' then
      raise exception 'book id does not match payload';
    end if;

    insert into public.books (
      id, owner_id, title, english_title, author, language, description, source,
      status, cover_tone, added_at, last_opened_at, pinned_at, updated_at
    ) values (
      p_entity_id,
      current_owner,
      coalesce(nullif(p_payload->>'title', ''), '未题名'),
      nullif(p_payload->>'englishTitle', ''),
      coalesce(p_payload->>'author', ''),
      coalesce(p_payload->>'language', ''),
      coalesce(p_payload->>'description', ''),
      case p_payload->>'source' when 'weread' then 'weread' else 'marginalia' end,
      case p_payload->>'status'
        when 'reading' then 'reading' when 'finished' then 'finished' else 'wish'
      end,
      case p_payload->>'coverTone'
        when 'rose' then 'rose' when 'blue' then 'blue' when 'green' then 'green'
        when 'ochre' then 'ochre' else null
      end,
      coalesce((p_payload->>'addedAt')::timestamptz, p_occurred_at),
      (p_payload->>'lastOpenedAt')::timestamptz,
      (p_payload->>'pinnedAt')::timestamptz,
      p_occurred_at
    )
    on conflict (id) do update set
      title = excluded.title,
      english_title = excluded.english_title,
      author = excluded.author,
      language = excluded.language,
      description = excluded.description,
      source = excluded.source,
      status = excluded.status,
      cover_tone = excluded.cover_tone,
      added_at = excluded.added_at,
      last_opened_at = excluded.last_opened_at,
      pinned_at = excluded.pinned_at,
      updated_at = excluded.updated_at
    where public.books.owner_id = current_owner
      and public.books.deleted_at is null
      and excluded.updated_at >= public.books.updated_at;
  end if;

  insert into public.sync_operations (
    operation_id, owner_id, entity_type, entity_id, occurred_at
  ) values (
    p_operation_id, current_owner, p_entity_type, p_entity_id, p_occurred_at
  );

  return true;
end;
$$;

revoke all on function public.apply_profile_book_sync_operation(text,text,text,text,timestamptz,jsonb)
  from public, anon;
grant execute on function public.apply_profile_book_sync_operation(text,text,text,text,timestamptz,jsonb)
  to authenticated;

comment on function public.apply_profile_book_sync_operation(text,text,text,text,timestamptz,jsonb)
  is 'Atomically and idempotently accepts the first Cloud Ink profile/book sync slice for auth.uid().';
