create or replace function public.apply_cloud_ink_sync_operation(
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
    or p_entity_id is null or length(p_entity_id) > 500
    or p_occurred_at is null then
    raise exception 'invalid sync operation';
  end if;

  if exists (
    select 1 from public.sync_operations
    where operation_id = p_operation_id and owner_id = current_owner
  ) then
    return true;
  end if;

  if p_entity_type = 'epubFile'
    or p_entity_type not in (
      'profile', 'book', 'chapter', 'readingProgress', 'bookmark',
      'highlight', 'annotation', 'marginalia'
    )
    or p_operation not in ('upsert', 'delete') then
    return false;
  end if;

  if p_entity_type = 'profile' then
    if p_operation <> 'upsert' or p_entity_id <> 'self' then
      raise exception 'invalid profile operation';
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

  elsif p_entity_type = 'book' then
    if p_operation = 'delete' then
      update public.books set deleted_at = p_occurred_at, updated_at = p_occurred_at
      where id = p_entity_id and owner_id = current_owner
        and (deleted_at is null or p_occurred_at >= deleted_at);
    else
      if p_entity_id is distinct from p_payload->>'id' then
        raise exception 'book id does not match payload';
      end if;
      insert into public.books (
        id, owner_id, title, english_title, author, language, description, source,
        status, cover_tone, added_at, last_opened_at, pinned_at, updated_at
      ) values (
        p_entity_id, current_owner,
        coalesce(nullif(p_payload->>'title', ''), '未题名'),
        nullif(p_payload->>'englishTitle', ''), coalesce(p_payload->>'author', ''),
        coalesce(p_payload->>'language', ''), coalesce(p_payload->>'description', ''),
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
        title = excluded.title, english_title = excluded.english_title,
        author = excluded.author, language = excluded.language,
        description = excluded.description, source = excluded.source,
        status = excluded.status, cover_tone = excluded.cover_tone,
        added_at = excluded.added_at, last_opened_at = excluded.last_opened_at,
        pinned_at = excluded.pinned_at, updated_at = excluded.updated_at
      where public.books.owner_id = current_owner
        and public.books.deleted_at is null
        and excluded.updated_at >= public.books.updated_at;
    end if;

  elsif p_entity_type = 'chapter' then
    if p_operation = 'delete' then
      update public.book_sections set deleted_at = p_occurred_at, updated_at = p_occurred_at
      where id = p_entity_id and owner_id = current_owner
        and (deleted_at is null or p_occurred_at >= deleted_at);
    else
      if p_entity_id is distinct from p_payload->>'id' then
        raise exception 'chapter id does not match payload';
      end if;
      insert into public.book_sections (
        id, owner_id, book_id, spine_index, title, href, content_html,
        content_text, content_hash, updated_at, deleted_at
      ) values (
        p_entity_id, current_owner, p_payload->>'bookId',
        (p_payload->>'index')::integer, coalesce(p_payload->>'title', ''),
        coalesce(p_payload->>'href', ''), coalesce(p_payload->>'html', ''),
        coalesce(p_payload->>'contentText', ''), nullif(p_payload->>'contentHash', ''),
        p_occurred_at, null
      )
      on conflict (id) do update set
        book_id = excluded.book_id, spine_index = excluded.spine_index,
        title = excluded.title, href = excluded.href,
        content_html = excluded.content_html, content_text = excluded.content_text,
        content_hash = excluded.content_hash, updated_at = excluded.updated_at,
        deleted_at = null
      where public.book_sections.owner_id = current_owner
        and public.book_sections.deleted_at is null
        and excluded.updated_at >= public.book_sections.updated_at;
    end if;

  elsif p_entity_type = 'readingProgress' then
    if p_operation = 'delete' then
      delete from public.reading_positions
      where book_id = p_entity_id and owner_id = current_owner;
    else
      if p_entity_id is distinct from p_payload->>'bookId' then
        raise exception 'reading position book id does not match payload';
      end if;
      insert into public.reading_positions (
        book_id, owner_id, locator, chapter_progress, total_progress, read_at, updated_at
      ) values (
        p_entity_id, current_owner, p_payload->'locator',
        greatest(0, least(100, coalesce((p_payload->>'chapterProgress')::integer, 0))),
        greatest(0, least(100, coalesce((p_payload->>'totalProgress')::integer, 0))),
        p_occurred_at, p_occurred_at
      )
      on conflict (book_id) do update set
        locator = excluded.locator, chapter_progress = excluded.chapter_progress,
        total_progress = excluded.total_progress, read_at = excluded.read_at,
        updated_at = excluded.updated_at
      where public.reading_positions.owner_id = current_owner
        and excluded.read_at >= public.reading_positions.read_at;
    end if;

  elsif p_entity_type = 'bookmark' then
    if p_entity_id is distinct from coalesce(p_payload->>'bookId', p_entity_id) then
      raise exception 'bookmark book id does not match payload';
    end if;
    insert into public.bookmarks (book_id, owner_id, locator, moved_at, deleted_at)
    values (
      p_entity_id, current_owner,
      case when p_operation = 'delete' then null else p_payload->'locator' end,
      p_occurred_at,
      case when p_operation = 'delete' then p_occurred_at else null end
    )
    on conflict (book_id) do update set
      locator = excluded.locator, moved_at = excluded.moved_at, deleted_at = excluded.deleted_at
    where public.bookmarks.owner_id = current_owner
      and excluded.moved_at >= public.bookmarks.moved_at;

  elsif p_entity_type = 'highlight' then
    if p_operation = 'delete' then
      update public.highlights set deleted_at = p_occurred_at, updated_at = p_occurred_at
      where id = p_entity_id and owner_id = current_owner
        and (deleted_at is null or p_occurred_at >= deleted_at);
    else
      if p_entity_id is distinct from p_payload->>'id' then
        raise exception 'highlight id does not match payload';
      end if;
      insert into public.highlights (
        id, owner_id, book_id, locator, color, created_at, updated_at, deleted_at
      ) values (
        p_entity_id, current_owner, p_payload->>'bookId', p_payload->'locator',
        case p_payload->>'color' when 'gold' then 'gold' when 'mint' then 'mint' else 'rose' end,
        coalesce((p_payload->>'createdAt')::timestamptz, p_occurred_at), p_occurred_at, null
      )
      on conflict (id) do update set
        book_id = excluded.book_id, locator = excluded.locator, color = excluded.color,
        created_at = excluded.created_at, updated_at = excluded.updated_at, deleted_at = null
      where public.highlights.owner_id = current_owner
        and public.highlights.deleted_at is null
        and excluded.updated_at >= public.highlights.updated_at;
    end if;

  elsif p_entity_type = 'annotation' then
    if p_operation = 'delete' then
      update public.annotations set deleted_at = p_occurred_at, updated_at = p_occurred_at
      where id = p_entity_id and owner_id = current_owner
        and (deleted_at is null or p_occurred_at >= deleted_at);
    else
      if p_entity_id is distinct from p_payload->>'id' then
        raise exception 'annotation id does not match payload';
      end if;
      insert into public.annotations (
        id, owner_id, book_id, highlight_id, locator, text, actor,
        created_at, updated_at, deleted_at
      ) values (
        p_entity_id, current_owner, p_payload->>'bookId', nullif(p_payload->>'highlightId', ''),
        p_payload->'locator', coalesce(p_payload->>'text', ''), 'user',
        coalesce((p_payload->>'createdAt')::timestamptz, p_occurred_at), p_occurred_at, null
      )
      on conflict (id) do update set
        book_id = excluded.book_id, highlight_id = excluded.highlight_id,
        locator = excluded.locator, text = excluded.text,
        created_at = excluded.created_at, updated_at = excluded.updated_at, deleted_at = null
      where public.annotations.owner_id = current_owner
        and public.annotations.deleted_at is null
        and excluded.updated_at >= public.annotations.updated_at;
    end if;

  elsif p_entity_type = 'marginalia' then
    if p_operation = 'delete' then
      update public.marginalia set deleted_at = p_occurred_at, updated_at = p_occurred_at
      where id = p_entity_id and owner_id = current_owner
        and (deleted_at is null or p_occurred_at >= deleted_at);
    else
      if p_entity_id is distinct from p_payload->>'id' then
        raise exception 'marginalia id does not match payload';
      end if;
      insert into public.marginalia (
        id, owner_id, book_id, annotation_id, highlight_id, locator, text, actor,
        visibility, session_id, idempotency_key, created_at, updated_at, deleted_at
      ) values (
        p_entity_id, current_owner, p_payload->>'bookId', nullif(p_payload->>'annotationId', ''),
        nullif(p_payload->>'highlightId', ''), p_payload->'locator',
        coalesce(p_payload->>'text', ''), 'companion',
        case p_payload->>'visibility' when 'reveal_on_reach' then 'reveal_on_reach' else 'immediate' end,
        nullif(p_payload->>'sessionId', ''),
        coalesce(nullif(p_payload->>'idempotencyKey', ''), p_entity_id),
        coalesce((p_payload->>'createdAt')::timestamptz, p_occurred_at), p_occurred_at, null
      )
      on conflict (id) do update set
        book_id = excluded.book_id, annotation_id = excluded.annotation_id,
        highlight_id = excluded.highlight_id, locator = excluded.locator,
        text = excluded.text, visibility = excluded.visibility,
        session_id = excluded.session_id, updated_at = excluded.updated_at, deleted_at = null
      where public.marginalia.owner_id = current_owner
        and public.marginalia.deleted_at is null
        and excluded.updated_at >= public.marginalia.updated_at;
    end if;
  end if;

  insert into public.sync_operations (
    operation_id, owner_id, entity_type, entity_id, occurred_at
  ) values (
    p_operation_id, current_owner, p_entity_type, p_entity_id, p_occurred_at
  );
  return true;
end;
$$;

revoke all on function public.apply_cloud_ink_sync_operation(text,text,text,text,timestamptz,jsonb)
  from public, anon;
grant execute on function public.apply_cloud_ink_sync_operation(text,text,text,text,timestamptz,jsonb)
  to authenticated;

comment on function public.apply_cloud_ink_sync_operation(text,text,text,text,timestamptz,jsonb)
  is 'Atomically and idempotently applies authenticated Cloud Ink structured records without bypassing RLS.';

create policy positions_delete on public.reading_positions for delete to authenticated
  using ((select auth.uid()) = owner_id);
grant delete on public.reading_positions to authenticated;
