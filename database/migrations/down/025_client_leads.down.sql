-- Rollback 025_client_leads.sql (MENGHAPUS semua lead dan riwayatnya; backup dulu)
drop table if exists public.client_lead_events;
drop table if exists public.client_leads;
delete from public.app_migrations where version = '025';
