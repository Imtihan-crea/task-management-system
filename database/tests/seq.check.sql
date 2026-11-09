-- Hanya SELECT (dijalankan dengan --read-only). Dipakai npm run db:check-seq.
-- Per urutan kode: nilai urutan, kode numerik tertinggi di tabel, dan default kolom code.
select 'task' as nama, s.last_value, s.is_called,
  (select max(substring(code from '[0-9]+$')::int) from public.tasks) as max_kode,
  (select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a
     on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.tasks'::regclass and a.attname = 'code') as default_expr
from public.task_code_seq s
union all
select 'suggestion', s.last_value, s.is_called,
  (select max(substring(code from '[0-9]+$')::int) from public.task_suggestions),
  (select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a
     on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.task_suggestions'::regclass and a.attname = 'code')
from public.suggestion_code_seq s
union all
select 'meeting', s.last_value, s.is_called,
  (select max(substring(code from '[0-9]+$')::int) from public.meetings),
  (select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a
     on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.meetings'::regclass and a.attname = 'code')
from public.meeting_code_seq s
union all
select 'project', s.last_value, s.is_called,
  (select max(substring(code from '[0-9]+$')::int) from public.projects),
  (select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a
     on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.projects'::regclass and a.attname = 'code')
from public.project_code_seq s;
