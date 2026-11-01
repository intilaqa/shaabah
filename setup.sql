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

-- كشوف الشعب: الرقم الجامعي لكل طالبة في كل شعبة (الطالبة ترى سطرها فقط)
create table if not exists public.roster(
  section_id text not null, uid text not null, name text,
  owner uuid not null default auth.uid(),
  primary key (section_id, uid));
create index if not exists roster_uid on public.roster(uid);
create index if not exists roster_owner on public.roster(owner);

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
  if not exists(select 1 from public.roster r where r.section_id = new.section_id and r.uid = new.student_uid) then
    raise exception 'not in this section'; end if;
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
alter table public.roster enable row level security;

drop policy if exists "student sees self" on public.roster;
drop policy if exists "my roster" on public.roster;
create policy "student sees self" on public.roster for select to authenticated
  using (public.is_student() and uid = split_part(lower(auth.jwt()->>'email'),'@',1));
create policy "my roster" on public.roster for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid() and not public.is_student());

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
  with check (bucket_id = 'excuse-files' and public.is_student() and exists(select 1 from public.roster r where r.section_id = (storage.foldername(name))[1]
    and r.uid = split_part(lower(auth.jwt()->>'email'),'@',1)));
create policy "teacher reads files" on storage.objects for select to authenticated
  using (bucket_id = 'excuse-files' and exists(select 1 from public.sections_public sp where sp.id = (storage.foldername(name))[1] and sp.owner = auth.uid()));
create policy "teacher deletes files" on storage.objects for delete to authenticated
  using (bucket_id = 'excuse-files' and exists(select 1 from public.sections_public sp where sp.id = (storage.foldername(name))[1] and sp.owner = auth.uid()));

-- ===== الدرجات: كل طالبة ترى درجاتها فقط، وكل أستاذة تنشر درجات شعبها =====
create table if not exists public.grades(
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  section_id text not null,
  uid text not null,
  title text not null,
  items jsonb,
  total numeric,
  max numeric,
  published boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (section_id, title, uid));
create index if not exists grades_uid on public.grades(uid);
create index if not exists grades_owner on public.grades(owner, section_id);
drop trigger if exists grades_touch on public.grades;
create trigger grades_touch before insert or update on public.grades for each row execute function public.touch();
alter table public.grades enable row level security;
drop policy if exists "student sees own grades" on public.grades;
drop policy if exists "my grades" on public.grades;
create policy "student sees own grades" on public.grades for select to authenticated
  using (published and public.is_student() and uid = split_part(lower(auth.jwt()->>'email'),'@',1));
create policy "my grades" on public.grades for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid() and not public.is_student());

-- ===== الرسائل بين الطالبة وأستاذة شعبتها (نص فقط) =====
alter table public.sections_public add column if not exists hours_note text;

create table if not exists public.messages(
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  section_id text not null,
  teacher uuid,
  student_user uuid,
  student_uid text,
  student_name text,
  from_teacher boolean not null default false,
  body text not null check (char_length(body) between 1 and 1000),
  read_at timestamptz);
create index if not exists messages_teacher on public.messages(teacher, created_at);
create index if not exists messages_student on public.messages(student_user, created_at);

-- من يرسل؟ تُملأ الحقول تلقائيًا ولا يمكن تزويرها
create or replace function public.message_fill() returns trigger language plpgsql security definer set search_path=public as
$$ declare me_uid text; begin
  new.read_at := null; new.created_at := now();
  if public.is_student() then
    me_uid := split_part(lower(auth.jwt()->>'email'),'@',1);
    new.from_teacher := false; new.student_user := auth.uid(); new.student_uid := me_uid;
    select owner into new.teacher from public.sections_public where id = new.section_id;
    if new.teacher is null then raise exception 'unknown section'; end if;
    select name into new.student_name from public.roster where section_id = new.section_id and uid = me_uid;
    if not found then raise exception 'not in this section'; end if;
  else
    new.from_teacher := true; new.teacher := auth.uid();
    if not exists(select 1 from public.sections_public where id = new.section_id and owner = auth.uid()) then raise exception 'not your section'; end if;
    select student_uid, student_name into new.student_uid, new.student_name from public.messages
      where section_id = new.section_id and student_user = new.student_user and teacher = auth.uid() and not from_teacher limit 1;
    if new.student_uid is null then raise exception 'no conversation'; end if;
  end if;
  return new;
end $$;
drop trigger if exists messages_fill on public.messages;
create trigger messages_fill before insert on public.messages for each row execute function public.message_fill();

-- التعديل الوحيد المسموح: «قُرئت»
create or replace function public.message_lock() returns trigger language plpgsql as
$$ begin
  if new.body is distinct from old.body or new.section_id is distinct from old.section_id or new.teacher is distinct from old.teacher
     or new.student_user is distinct from old.student_user or new.from_teacher is distinct from old.from_teacher then
    raise exception 'only read status can change'; end if;
  return new;
end $$;
drop trigger if exists messages_lock on public.messages;
create trigger messages_lock before update on public.messages for each row execute function public.message_lock();

alter table public.messages enable row level security;
drop policy if exists "read my messages" on public.messages;
drop policy if exists "send messages" on public.messages;
drop policy if exists "mark read" on public.messages;
create policy "read my messages" on public.messages for select to authenticated
  using (student_user = auth.uid() or teacher = auth.uid());
create policy "send messages" on public.messages for insert to authenticated
  with check ((public.is_student() and student_user = auth.uid() and not from_teacher) or (not public.is_student() and teacher = auth.uid() and from_teacher));
create policy "mark read" on public.messages for update to authenticated
  using ((teacher = auth.uid() and not from_teacher) or (student_user = auth.uid() and from_teacher))
  with check ((teacher = auth.uid() and not from_teacher) or (student_user = auth.uid() and from_teacher));

-- ===== إشعارات الجوال: قبل المحاضرة بـ 15 دقيقة، وعند نشر إعلان =====
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- إعدادات خاصة (لا تُقرأ من التطبيق أبدًا)
create table if not exists public.app_secrets(k text primary key, v text not null);
alter table public.app_secrets enable row level security;

-- جوالات الطالبات المفعّلة للإشعارات
create table if not exists public.push_subs(
  endpoint text primary key,
  user_id uuid not null default auth.uid(),
  uid text,
  sub jsonb not null,
  created_at timestamptz not null default now());
create index if not exists push_subs_uid on public.push_subs(uid);
create or replace function public.push_sub_fill() returns trigger language plpgsql security definer set search_path=public as
$$ begin
  if not public.is_student() then raise exception 'students only'; end if;
  new.user_id := auth.uid(); new.uid := split_part(lower(auth.jwt()->>'email'),'@',1); return new;
end $$;
drop trigger if exists push_sub_fill on public.push_subs;
create trigger push_sub_fill before insert or update on public.push_subs for each row execute function public.push_sub_fill();
alter table public.push_subs enable row level security;
drop policy if exists "my push" on public.push_subs;
create policy "my push" on public.push_subs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- حتى لا يتكرر إشعار المحاضرة نفسها
create table if not exists public.push_log(key text primary key, at timestamptz not null default now());
alter table public.push_log enable row level security;

-- استدعاء خدمة الإرسال
create or replace function public.notify_call(payload jsonb) returns void language plpgsql security definer set search_path=public as
$$ declare u text; s text; begin
  select v into u from public.app_secrets where k = 'notify_url';
  select v into s from public.app_secrets where k = 'notify_secret';
  if u is null or s is null then return; end if;
  perform net.http_post(url := u, body := payload, headers := jsonb_build_object('Content-Type','application/json','x-notify-secret',s));
end $$;
revoke execute on function public.notify_call(jsonb) from public, anon, authenticated;

-- إعلان جديد → إشعار
create or replace function public.ann_notify() returns trigger language plpgsql security definer set search_path=public as
$$ begin perform public.notify_call(jsonb_build_object('type','announcement','record',to_jsonb(new))); return new; end $$;
drop trigger if exists ann_notify on public.announcements;
create trigger ann_notify after insert on public.announcements for each row execute function public.ann_notify();

-- كل 5 دقائق: من عندها محاضرة بعد 15 دقيقة؟
do $$ begin perform cron.unschedule('lecture-reminders'); exception when others then null; end $$;
select cron.schedule('lecture-reminders', '*/5 * * * *', $$ select public.notify_call('{"type":"tick"}'::jsonb) $$);

-- ===== حضور كل طالبة (تراه هي فقط) + إشعار عند الإنذار أو الحرمان =====
create table if not exists public.attendance_public(
  section_id text not null,
  uid text not null,
  owner uuid not null default auth.uid(),
  att_pct numeric, abs_h numeric, planned numeric, max_abs numeric, left_h numeric,
  level int not null default 0, cut boolean not null default false,
  min_attend int, items jsonb,
  updated_at timestamptz not null default now(),
  primary key (section_id, uid));
create index if not exists attendance_public_uid on public.attendance_public(uid);
drop trigger if exists attendance_touch on public.attendance_public;
create trigger attendance_touch before insert or update on public.attendance_public for each row execute function public.touch();
alter table public.attendance_public enable row level security;
drop policy if exists "student sees own attendance" on public.attendance_public;
drop policy if exists "my attendance" on public.attendance_public;
create policy "student sees own attendance" on public.attendance_public for select to authenticated
  using (public.is_student() and uid = split_part(lower(auth.jwt()->>'email'),'@',1));
create policy "my attendance" on public.attendance_public for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid() and not public.is_student());

create or replace function public.att_notify() returns trigger language plpgsql security definer set search_path=public as
$$ begin
  if new.level > coalesce(case when tg_op='UPDATE' then old.level end,0)
     or (new.cut and not coalesce(case when tg_op='UPDATE' then old.cut end,false)) then
    perform public.notify_call(jsonb_build_object('type','warn','record',to_jsonb(new)));
  end if;
  return new;
end $$;
drop trigger if exists att_notify on public.attendance_public;
create trigger att_notify after insert or update on public.attendance_public for each row execute function public.att_notify();
