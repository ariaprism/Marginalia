create unique index books_id_owner_unique on public.books(id, owner_id);
create unique index highlights_id_owner_unique on public.highlights(id, owner_id);
create unique index annotations_id_owner_unique on public.annotations(id, owner_id);

alter table public.book_sections
  add constraint book_sections_book_owner_fkey foreign key (book_id, owner_id) references public.books(id, owner_id);
alter table public.reading_positions
  add constraint reading_positions_book_owner_fkey foreign key (book_id, owner_id) references public.books(id, owner_id);
alter table public.bookmarks
  add constraint bookmarks_book_owner_fkey foreign key (book_id, owner_id) references public.books(id, owner_id);
alter table public.highlights
  add constraint highlights_book_owner_fkey foreign key (book_id, owner_id) references public.books(id, owner_id);
alter table public.annotations
  add constraint annotations_book_owner_fkey foreign key (book_id, owner_id) references public.books(id, owner_id);
alter table public.annotations
  add constraint annotations_highlight_owner_fkey foreign key (highlight_id, owner_id) references public.highlights(id, owner_id);
alter table public.marginalia
  add constraint marginalia_book_owner_fkey foreign key (book_id, owner_id) references public.books(id, owner_id);
alter table public.marginalia
  add constraint marginalia_annotation_owner_fkey foreign key (annotation_id, owner_id) references public.annotations(id, owner_id);
alter table public.marginalia
  add constraint marginalia_highlight_owner_fkey foreign key (highlight_id, owner_id) references public.highlights(id, owner_id);

create index book_sections_book_id_idx on public.book_sections(book_id);
create index reading_positions_book_id_idx on public.reading_positions(book_id);
create index bookmarks_book_id_idx on public.bookmarks(book_id);
create index highlights_book_id_idx on public.highlights(book_id);
create index annotations_book_id_idx on public.annotations(book_id);
create index marginalia_book_id_idx on public.marginalia(book_id);
