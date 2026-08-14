-- Complete the Slice 2 text hardening by treating Unicode line and paragraph
-- separators as line breaks in league names. C0/C1 controls were constrained
-- by the preceding migration; PostgreSQL text cannot contain NUL.

update public.leagues
set name = translate(name, U&'\2028\2029', '  ')
where name ~ U&'[\2028\2029]';

alter table public.leagues
  add constraint leagues_name_line_separators_check
    check (name !~ U&'[\2028\2029]');
