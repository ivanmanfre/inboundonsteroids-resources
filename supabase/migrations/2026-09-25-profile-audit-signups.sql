-- Link-based intake for the PROFILE audit (2026-09-25). The comment gate got 0 comments in 12h; the
-- 30-ideas link post got 2 founder sign-ups. Sign-ups land here, then become a marked Ivan-lane prospect
-- (enrichment_data.lm_gate_keyword='PROFILE', profile_gate.source='link') that the existing Profile Gate
-- Builder (9fq1BdbdmA6CFiW7) builds; delivery is by email instead of a DM draft.
create table if not exists public.profile_audit_signups (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  email text not null,
  linkedin_url text not null,
  linkedin_slug text not null,
  provider_id text,
  name text,
  prospect_id uuid,
  status text not null default 'received',  -- received | queued | held_other_tenant | blacklisted | resolve_failed | emailed
  status_detail text,
  is_test boolean not null default false,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_id text, referrer text,
  created_at timestamptz not null default now(),
  emailed_at timestamptz,
  resend_id text,
  unsubscribed_at timestamptz,
  unique (email, linkedin_slug)
);
alter table public.profile_audit_signups enable row level security;  -- no policies: service role only

insert into public.integration_config (key, value) values
  ('profile_audit_intake_armed', 'false'),
  ('profile_audit_test_allowlist', '["im@ivanmanfredi.com","im+paudit@ivanmanfredi.com"]'),
  ('profile_audit_daily_signup_cap', '10')
on conflict (key) do nothing;

-- rollback:
-- drop table public.profile_audit_signups;
-- delete from public.integration_config where key in ('profile_audit_intake_armed','profile_audit_test_allowlist','profile_audit_daily_signup_cap','profile_audit_email_template');
