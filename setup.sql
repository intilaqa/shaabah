-- سجل الحضور: إعداد قاعدة البيانات (انسخي كل هذا والصقيه في Supabase → SQL Editor ثم Run)

create table if not exists public.app_owner(id int primary key default 1 check (id=1), uid uuid not null);
alter table public.app_owner enable row level security;

create or replace function public.is_owner() returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from public.app_owner where uid = auth.uid()) $$;

create or replace function public.claim_owner() returns boolean language plpgsql security definer set search_path=public as
$$ begin
  if auth.uid() is null then return false; end if;
  insert into public.app_owner(id,uid) values(1,auth.uid()) on conflict (id) do nothing;
  return public.is_owner();
end $$;
grant execute on function public.claim_owner() to authenticated;
grant execute on function public.is_owner() to anon, authenticated;

create or replace function public.touch() returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;

-- بيانات السجل (لصاحبة السجل فقط)
create table if not exists public.docs(path text primary key, data jsonb, deleted boolean not null default false, updated_at timestamptz not null default now());
alter table public.docs enable row level security;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs for each row execute function public.touch();
drop policy if exists "owner docs" on public.docs;
create policy "owner docs" on public.docs for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- الشعب وأوقاتها فقط (بدون أسماء الطالبات) لتظهر في صفحة الأعذار
create table if not exists public.sections_public(id text primary key, name text, short text, meetings jsonb, term_start date, weeks int, cancelled jsonb default '[]', updated_at timestamptz default now());
alter table public.sections_public add column if not exists cancelled jsonb default '[]';
alter table public.sections_public add column if not exists teacher text;
alter table public.sections_public enable row level security;
drop policy if exists "read sections" on public.sections_public;
create policy "read sections" on public.sections_public for select to anon, authenticated using (true);
drop policy if exists "owner sections" on public.sections_public;
create policy "owner sections" on public.sections_public for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- الأعذار: الطالبات يرسلن فقط، ولا يقرأن شيئًا
create table if not exists public.excuses(
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
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
alter table public.excuses enable row level security;
drop policy if exists "students send" on public.excuses;
create policy "students send" on public.excuses for insert to anon, authenticated
  with check (status = 'pending' and reason is null and decided_at is null and lecture_date <= current_date + 1);
drop policy if exists "owner reads" on public.excuses;
create policy "owner reads" on public.excuses for select to authenticated using (public.is_owner());
drop policy if exists "owner decides" on public.excuses;
create policy "owner decides" on public.excuses for update to authenticated using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owner deletes" on public.excuses;
create policy "owner deletes" on public.excuses for delete to authenticated using (public.is_owner());

-- مرفقات الأعذار (خاصة، حد أقصى ٣ ميجا)
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('excuse-files','excuse-files',false,3145728,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
drop policy if exists "students upload" on storage.objects;
create policy "students upload" on storage.objects for insert to anon, authenticated with check (bucket_id = 'excuse-files');
drop policy if exists "owner reads files" on storage.objects;
create policy "owner reads files" on storage.objects for select to authenticated using (bucket_id = 'excuse-files' and public.is_owner());
drop policy if exists "owner deletes files" on storage.objects;
create policy "owner deletes files" on storage.objects for delete to authenticated using (bucket_id = 'excuse-files' and public.is_owner());

-- إعلانات للطالبات (يقرأنها، وأنتِ فقط تنشرين)
create table if not exists public.announcements(
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  section_id text,
  body text not null check (char_length(body) between 2 and 500),
  until date);
alter table public.announcements enable row level security;
drop policy if exists "read announcements" on public.announcements;
create policy "read announcements" on public.announcements for select to anon, authenticated using (until is null or until >= current_date or public.is_owner());
drop policy if exists "owner announcements" on public.announcements;
create policy "owner announcements" on public.announcements for all to authenticated using (public.is_owner()) with check (public.is_owner());
