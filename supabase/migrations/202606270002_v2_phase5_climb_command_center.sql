-- V2 Phase 5: Climb Roadmap + Application Command Center.
-- Reversible down path:
--   pipeline/audit/v2_phase5_climb_command_center_down.sql

create table if not exists public.application_deadlines (
  id uuid primary key default gen_random_uuid(),
  unitid integer not null references public.schools(unitid) on delete cascade,
  program_requirement_id uuid references public.program_requirements(id) on delete cascade,
  admission_system text check (
    admission_system is null
    or admission_system in ('common_app', 'coalition', 'ouac', 'direct', 'quebec_cegep')
  ),
  deadline_kind text not null check (
    deadline_kind in ('regular', 'early', 'priority', 'document', 'system')
  ),
  label text not null,
  deadline_date date not null,
  source_url text not null check (source_url ~* '^https?://'),
  source_name text,
  created_at timestamptz not null default now()
);

create index if not exists application_deadlines_unitid_idx
  on public.application_deadlines (unitid);

create index if not exists application_deadlines_program_requirement_idx
  on public.application_deadlines (program_requirement_id);

alter table public.application_deadlines enable row level security;

drop policy if exists "application deadlines are public readable" on public.application_deadlines;
create policy "application deadlines are public readable"
on public.application_deadlines
for select
to anon, authenticated
using (true);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null,
  unitid integer not null references public.schools(unitid) on delete cascade,
  program_requirement_id uuid references public.program_requirements(id) on delete set null,
  requirement_key text not null,
  title text not null,
  detail text,
  category text not null check (
    category in ('academic', 'testing', 'form', 'review', 'deadline', 'document')
  ),
  status text not null default 'todo' check (
    status in ('todo', 'in_progress', 'done')
  ),
  due_date date,
  source_url text check (source_url is null or source_url ~* '^https?://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, unitid, requirement_key)
);

create index if not exists tasks_subject_idx
  on public.tasks (subject_id);

create index if not exists tasks_subject_unitid_idx
  on public.tasks (subject_id, unitid);

create table if not exists public.requirement_status (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null,
  unitid integer not null references public.schools(unitid) on delete cascade,
  program_requirement_id uuid references public.program_requirements(id) on delete cascade,
  requirement_key text not null,
  status text not null default 'todo' check (
    status in ('todo', 'in_progress', 'done')
  ),
  source_url text check (source_url is null or source_url ~* '^https?://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, unitid, requirement_key)
);

create index if not exists requirement_status_subject_idx
  on public.requirement_status (subject_id);

create index if not exists requirement_status_subject_unitid_idx
  on public.requirement_status (subject_id, unitid);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null,
  unitid integer references public.schools(unitid) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  requirement_status_id uuid references public.requirement_status(id) on delete set null,
  requirement_key text,
  storage_bucket text not null default 'admira-document-vault',
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  status text not null default 'uploaded' check (
    status in ('uploaded', 'deleted')
  ),
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create index if not exists documents_subject_idx
  on public.documents (subject_id);

create index if not exists documents_subject_unitid_idx
  on public.documents (subject_id, unitid);

create or replace function public.admira_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
before update on public.tasks
for each row execute function public.admira_touch_updated_at();

drop trigger if exists requirement_status_touch_updated_at on public.requirement_status;
create trigger requirement_status_touch_updated_at
before update on public.requirement_status
for each row execute function public.admira_touch_updated_at();

alter table public.tasks enable row level security;
alter table public.requirement_status enable row level security;
alter table public.documents enable row level security;

drop policy if exists "tasks owner can read" on public.tasks;
create policy "tasks owner can read"
on public.tasks
for select
to authenticated
using (subject_id = auth.uid());

drop policy if exists "tasks owner can create" on public.tasks;
create policy "tasks owner can create"
on public.tasks
for insert
to authenticated
with check (subject_id = auth.uid());

drop policy if exists "tasks owner can update" on public.tasks;
create policy "tasks owner can update"
on public.tasks
for update
to authenticated
using (subject_id = auth.uid())
with check (subject_id = auth.uid());

drop policy if exists "tasks owner can delete" on public.tasks;
create policy "tasks owner can delete"
on public.tasks
for delete
to authenticated
using (subject_id = auth.uid());

drop policy if exists "requirement status owner can read" on public.requirement_status;
create policy "requirement status owner can read"
on public.requirement_status
for select
to authenticated
using (subject_id = auth.uid());

drop policy if exists "requirement status owner can create" on public.requirement_status;
create policy "requirement status owner can create"
on public.requirement_status
for insert
to authenticated
with check (subject_id = auth.uid());

drop policy if exists "requirement status owner can update" on public.requirement_status;
create policy "requirement status owner can update"
on public.requirement_status
for update
to authenticated
using (subject_id = auth.uid())
with check (subject_id = auth.uid());

drop policy if exists "requirement status owner can delete" on public.requirement_status;
create policy "requirement status owner can delete"
on public.requirement_status
for delete
to authenticated
using (subject_id = auth.uid());

drop policy if exists "documents owner can read" on public.documents;
create policy "documents owner can read"
on public.documents
for select
to authenticated
using (subject_id = auth.uid());

drop policy if exists "documents owner can create" on public.documents;
create policy "documents owner can create"
on public.documents
for insert
to authenticated
with check (subject_id = auth.uid());

drop policy if exists "documents owner can update" on public.documents;
create policy "documents owner can update"
on public.documents
for update
to authenticated
using (subject_id = auth.uid())
with check (subject_id = auth.uid());

drop policy if exists "documents owner can delete" on public.documents;
create policy "documents owner can delete"
on public.documents
for delete
to authenticated
using (subject_id = auth.uid());

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    )
    values (
      'admira-document-vault',
      'admira-document-vault',
      false,
      5242880,
      array[
        'application/pdf',
        'image/jpeg',
        'image/png',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ]
    )
    on conflict (id) do update
    set
      public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists "document vault owner can read" on storage.objects;
    create policy "document vault owner can read"
    on storage.objects
    for select
    to authenticated
    using (
      bucket_id = 'admira-document-vault'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

    drop policy if exists "document vault owner can upload" on storage.objects;
    create policy "document vault owner can upload"
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'admira-document-vault'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

    drop policy if exists "document vault owner can update" on storage.objects;
    create policy "document vault owner can update"
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'admira-document-vault'
      and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
      bucket_id = 'admira-document-vault'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

    drop policy if exists "document vault owner can delete" on storage.objects;
    create policy "document vault owner can delete"
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'admira-document-vault'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
  end if;
end $$;
