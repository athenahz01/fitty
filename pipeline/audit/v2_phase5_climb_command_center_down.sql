do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists "document vault owner can delete" on storage.objects;
    drop policy if exists "document vault owner can update" on storage.objects;
    drop policy if exists "document vault owner can upload" on storage.objects;
    drop policy if exists "document vault owner can read" on storage.objects;
  end if;

  if to_regclass('storage.buckets') is not null then
    delete from storage.buckets
    where id = 'admira-document-vault';
  end if;
end $$;

drop policy if exists "documents owner can delete" on public.documents;
drop policy if exists "documents owner can update" on public.documents;
drop policy if exists "documents owner can create" on public.documents;
drop policy if exists "documents owner can read" on public.documents;

drop policy if exists "requirement status owner can delete" on public.requirement_status;
drop policy if exists "requirement status owner can update" on public.requirement_status;
drop policy if exists "requirement status owner can create" on public.requirement_status;
drop policy if exists "requirement status owner can read" on public.requirement_status;

drop policy if exists "tasks owner can delete" on public.tasks;
drop policy if exists "tasks owner can update" on public.tasks;
drop policy if exists "tasks owner can create" on public.tasks;
drop policy if exists "tasks owner can read" on public.tasks;

drop trigger if exists requirement_status_touch_updated_at on public.requirement_status;
drop trigger if exists tasks_touch_updated_at on public.tasks;

drop table if exists public.documents;
drop table if exists public.requirement_status;
drop table if exists public.tasks;

drop policy if exists "application deadlines are public readable" on public.application_deadlines;
drop table if exists public.application_deadlines;

-- Keep public.admira_touch_updated_at if other phases have adopted it.
