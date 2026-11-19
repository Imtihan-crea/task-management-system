-- 025_client_leads.sql
-- 19 Nov 2026: Client Management — pipeline lead 6 tahap (Lead masuk, Potensial,
-- Proposal, Negosiasi, Deal, Batal) + riwayat catatan/perpindahan tahap per lead.
-- Berisi data pribadi kontak (nama, email, telepon): TIDAK ada akses langsung dari
-- aplikasi klien (anon/authenticated). Baca dan tulis hanya lewat server action
-- (service role) yang menjaga izin clients.view / clients.manage.
-- Tidak ada baris data yang diubah.
-- Rollback: database/migrations/down/025_client_leads.down.sql

create table if not exists public.client_leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null check (char_length(btrim(company_name)) between 1 and 150),
  contact_name text check (contact_name is null or char_length(contact_name) <= 120),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 30),
  source text check (source is null or char_length(source) <= 100),
  estimated_value numeric(16, 2) not null default 0 check (estimated_value >= 0),
  stage text not null default 'LEAD' check (stage in ('LEAD', 'POTENSIAL', 'PROPOSAL', 'NEGOSIASI', 'DEAL', 'BATAL')),
  owner_id uuid references public.profiles(id) on delete set null,
  notes text check (notes is null or char_length(notes) <= 5000),
  lost_reason text check (lost_reason is null or char_length(lost_reason) <= 1000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_leads_lost_reason_required
    check (stage <> 'BATAL' or char_length(btrim(coalesce(lost_reason, ''))) > 0)
);

create index if not exists client_leads_stage on public.client_leads (stage, updated_at desc);
create index if not exists client_leads_owner on public.client_leads (owner_id);

-- Riwayat: catatan bebas (body) dan/atau perpindahan tahap (from_stage -> to_stage).
create table if not exists public.client_lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.client_leads(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null default '' check (char_length(body) <= 2000),
  from_stage text check (from_stage is null or from_stage in ('LEAD', 'POTENSIAL', 'PROPOSAL', 'NEGOSIASI', 'DEAL', 'BATAL')),
  to_stage text check (to_stage is null or to_stage in ('LEAD', 'POTENSIAL', 'PROPOSAL', 'NEGOSIASI', 'DEAL', 'BATAL')),
  created_at timestamptz not null default now(),
  constraint client_lead_events_not_empty check (char_length(btrim(body)) > 0 or to_stage is not null)
);

create index if not exists client_lead_events_lead on public.client_lead_events (lead_id, created_at desc);

-- RLS aktif tanpa policy untuk anon/authenticated = ditolak semua; service role melewati RLS.
alter table public.client_leads enable row level security;
alter table public.client_lead_events enable row level security;
revoke all on public.client_leads from anon, authenticated;
revoke all on public.client_lead_events from anon, authenticated;

insert into public.app_migrations (version, name, note)
values ('025', '025_client_leads', 'tabel client_leads dan client_lead_events (Client Management)')
on conflict (version) do nothing;
