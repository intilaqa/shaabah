-- سجل الحضور — قاعدة البيانات (لأكثر من أستاذة، والطالبات يدخلن بإيميلهن الجامعي)
-- انسخي كل هذا والصقيه في Supabase ← SQL Editor ثم Run. آمن لو نُفّذ أكثر من مرة، ويحدّث النسخة القديمة.
-- كل أستاذة: حسابها وبياناتها منفصلة. الطالبات: يقرأن الشعب والإعلانات ويرسلن الأعذار فقط.

-- ⚙️ نطاق إيميل الطالبات: الحساب الذي ينتهي بهذا النطاق = طالبة، ورقمها الجامعي هو ما قبل @
create or replace function public.student_domain() returns text language sql immutable as $$ select 'albaha.onmicrosoft.com' $$;
create or replace function public.is_student() returns boolean language sql stable as
$$ select coalesce(lower(auth.jwt()->>'email') like '%@'||public.student_domain(), false) $$;
grant execute on function public.is_student() to anon, authenticated;

create or replace function public.touch() returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;

-- ===== الجداول =====
create table if not exists public.docs(
  owner uuid default auth.uid(),
  path text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now());
alter table public.docs add column if not exists owner uuid default auth.uid();

create table if not exists public.sections_public(
  id text primary key, owner uuid default auth.uid(), name text, short text, teacher text,
  meetings jsonb, term_start date, weeks int, cancelled jsonb default '[]', updated_at timestamptz default now());
alter table public.sections_public add column if not exists owner uuid default auth.uid();
alter table public.sections_public add column if not exists cancelled jsonb default '[]';
alter table public.sections_public add column if not exists teacher text;

create table if not exists public.excuses(
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  teacher uuid,
  student_name text not null check (char_length(student_name) between 3 and 120),
  student_uid text not null check (student_uid ~ '^[0-9]{5,12}$'),
  section_id text not null,
  lecture_date date not null,
  meeting_id text,
  kind text check (char_length(kind) <= 40),
  body text not null check (char_length(body) between 2 and 2000),
  file_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reason text,
  decided_at timestamptz);
alter table public.excuses add column if not exists teacher uuid;
alter table public.excuses add column if not exists student_user uuid;

create table if not exists public.announcements(
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner uuid default auth.uid(),
  section_id text,
  body text not null check (char_length(body) between 2 and 500),
  until date);
alter table public.announcements add column if not exists owner uuid default auth.uid();

-- ===== ترقية من نسخة «أستاذة واحدة» إن وُجدت =====
do $$ declare o uuid; begin
  if to_regclass('public.app_owner') is not null then execute 'select uid from public.app_owner where id=1' into o; end if;
  if o is not null then
    update public.docs set owner=o where owner is null;
    update public.sections_public set owner=o where owner is null;
    update public.excuses set teacher=o where teacher is null;
    update public.announcements set owner=o where owner is null;
  end if;
end $$;
delete from public.docs where owner is null;
alter table public.docs alter column owner set not null;
do $$ begin
  if exists(select 1 from pg_constraint where conrelid='public.docs'::regclass and contype='p' and array_length(conkey,1)=1) then
    execute 'alter table public.docs drop constraint '||(select conname from pg_constraint where conrelid='public.docs'::regclass and contype='p');
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.docs'::regclass and contype='p') then
    alter table public.docs add primary key (owner, path);
  end if;
end $$;
create index if not exists docs_owner_updated on public.docs(owner, updated_at);
create index if not exists excuses_teacher on public.excuses(teacher, created_at);
create index if not exists excuses_student on public.excuses(student_user, created_at);

-- كل عذر يُربط تلقائيًا بالطالبة (من إيميلها) وبأستاذة الشعبة — لا يمكن تزويرهما
create or replace function public.excuse_teacher() returns trigger language plpgsql security definer set search_path=public as
$$ begin
  if not public.is_student() then raise exception 'students only'; end if;
  new.student_user := auth.uid();
  new.student_uid  := split_part(lower(auth.jwt()->>'email'),'@',1);
  select owner into new.teacher from public.sections_public where id = new.section_id;
  if new.teacher is null then raise exception 'unknown section'; end if;
  return new;
end $$;

drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs for each row execute function public.touch();
drop trigger if exists excuses_teacher on public.excuses;
create trigger excuses_teacher before insert on public.excuses for each row execute function public.excuse_teacher();

-- ===== الصلاحيات =====
alter table public.docs enable row level security;
alter table public.sections_public enable row level security;
alter table public.excuses enable row level security;
alter table public.announcements enable row level security;

-- بيانات كل أستاذة لها وحدها
drop policy if exists "owner docs" on public.docs;
drop policy if exists "my docs" on public.docs;
create policy "my docs" on public.docs for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid() and not public.is_student());

-- الشعب: يقرأها الجميع، وكل أستاذة تعدّل شعبها فقط
drop policy if exists "read sections" on public.sections_public;
drop policy if exists "owner sections" on public.sections_public;
drop policy if exists "my sections" on public.sections_public;
create policy "read sections" on public.sections_public for select to anon, authenticated using (true);
create policy "my sections" on public.sections_public for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid() and not public.is_student());

-- الأعذار: الطالبات يرسلن فقط، وكل أستاذة ترى أعذار شعبها فقط
drop policy if exists "students send" on public.excuses;
drop policy if exists "owner reads" on public.excuses;
drop policy if exists "owner decides" on public.excuses;
drop policy if exists "owner deletes" on public.excuses;
drop policy if exists "teacher reads" on public.excuses;
drop policy if exists "teacher decides" on public.excuses;
drop policy if exists "teacher deletes" on public.excuses;
drop policy if exists "student reads own" on public.excuses;
create policy "students send" on public.excuses for insert to authenticated
  with check (public.is_student() and student_user = auth.uid() and status = 'pending' and reason is null and decided_at is null and lecture_date <= current_date + 1);
create policy "student reads own" on public.excuses for select to authenticated using (student_user = auth.uid());
create policy "teacher reads" on public.excuses for select to authenticated using (teacher = auth.uid());
create policy "teacher decides" on public.excuses for update to authenticated using (teacher = auth.uid()) with check (teacher = auth.uid());
create policy "teacher deletes" on public.excuses for delete to authenticated using (teacher = auth.uid());

-- الإعلانات: يقرأها الجميع، وكل أستاذة تنشر وتحذف إعلاناتها فقط
drop policy if exists "read announcements" on public.announcements;
drop policy if exists "owner announcements" on public.announcements;
drop policy if exists "my announcements" on public.announcements;
create policy "read announcements" on public.announcements for select to anon, authenticated
  using (until is null or until >= current_date or owner = auth.uid());
create policy "my announcements" on public.announcements for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid() and not public.is_student());

-- ===== مرفقات الأعذار (خاصة، حد أقصى ٣ ميجا) =====
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('excuse-files','excuse-files',false,3145728,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
drop policy if exists "students upload" on storage.objects;
drop policy if exists "owner reads files" on storage.objects;
drop policy if exists "owner deletes files" on storage.objects;
drop policy if exists "teacher reads files" on storage.objects;
drop policy if exists "teacher deletes files" on storage.objects;
create policy "students upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'excuse-files' and public.is_student() and exists(select 1 from public.sections_public sp where sp.id = (storage.foldername(name))[1]));
create policy "teacher reads files" on storage.objects for select to authenticated
  using (bucket_id = 'excuse-files' and exists(select 1 from public.sections_public sp where sp.id = (storage.foldername(name))[1] and sp.owner = auth.uid()));
create policy "teacher deletes files" on storage.objects for delete to authenticated
  using (bucket_id = 'excuse-files' and exists(select 1 from public.sections_public sp where sp.id = (storage.foldername(name))[1] and sp.owner = auth.uid()));
