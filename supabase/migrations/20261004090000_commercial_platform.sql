-- Scenering commercial platform schema. The Node development server mirrors
-- this structure in .data/platform.json so accounts work without external
-- infrastructure; hosted deployments should use these tables with server-only access.
create table if not exists users (
  id uuid primary key default gen_random_uuid(), email text unique not null,
  password_hash text not null, display_name text not null, email_verified boolean not null default false,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table users add column if not exists role text not null default 'user' check (role in ('user','admin'));
create table if not exists plans (
  id uuid primary key default gen_random_uuid(), name text not null, slug text unique not null,
  description text not null default '', active boolean not null default true,
  config jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists plan_variants (
  id uuid primary key default gen_random_uuid(), plan_id uuid not null references plans(id),
  billing_interval text not null check (billing_interval in ('monthly','yearly')),
  price numeric(10,2) not null, currency text not null default 'USD', provider_variant_id text, checkout_url text,
  unique(plan_id,billing_interval)
);
create table if not exists memberships (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id), plan_id uuid not null references plans(id),
  status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id), provider text not null,
  provider_customer_id text, provider_subscription_id text unique, provider_product_id text, provider_variant_id text,
  plan_id uuid not null references plans(id), billing_interval text not null, status text not null,
  current_period_start timestamptz, current_period_end timestamptz, cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz, expires_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists entitlements (
  id uuid primary key default gen_random_uuid(), plan_id uuid not null references plans(id), feature_key text not null,
  enabled boolean not null default false, limit_value numeric, config jsonb not null default '{}'::jsonb,
  unique(plan_id,feature_key)
);
create table if not exists usage_records (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id), kind text not null,
  amount numeric not null default 1, duration_minutes numeric, format text check (format in ('short','long')), project_id text, created_at timestamptz not null default now()
);
create index if not exists usage_records_user_created on usage_records(user_id,created_at);
create table if not exists export_reservations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id), project_id text not null,
  duration_minutes numeric not null check (duration_minutes > 0), format text not null check (format in ('short','long')),
  status text not null default 'reserved' check (status in ('reserved','completed','cancelled')),
  creative_manifest jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null, completed_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists export_reservations_user_status on export_reservations(user_id,status,expires_at);
create table if not exists complimentary_grants (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id),
  plan_id uuid not null references plans(id), period text not null check (period in ('month','year')),
  status text not null default 'active' check (status in ('active','revoked','expired')),
  starts_at timestamptz not null, ends_at timestamptz not null, granted_by uuid not null references users(id),
  reason text, created_at timestamptz not null default now(), revoked_at timestamptz
);
create index if not exists complimentary_grants_user_status on complimentary_grants(user_id,status,ends_at);
create table if not exists complimentary_codes (
  id uuid primary key default gen_random_uuid(), code_hash text unique not null, code_prefix text not null,
  plan_id uuid not null references plans(id), period text not null check (period in ('month','year')),
  status text not null default 'active' check (status in ('active','redeemed','revoked','expired')),
  expires_at timestamptz not null, created_by uuid not null references users(id), created_at timestamptz not null default now(),
  redeemed_by uuid references users(id), redeemed_at timestamptz
);
create index if not exists complimentary_codes_status_expiry on complimentary_codes(status,expires_at);
alter table complimentary_grants add column if not exists access_code_id uuid references complimentary_codes(id);
alter table usage_records add column if not exists reservation_id uuid unique references export_reservations(id);
alter table usage_records add column if not exists format text check (format in ('short','long'));
alter table export_reservations add column if not exists creative_manifest jsonb not null default '{}'::jsonb;
create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(), provider_event_id text unique not null, event_name text not null,
  status text not null, payload jsonb not null, created_at timestamptz not null default now(), processed_at timestamptz
);
create table if not exists billing_events (
  id uuid primary key default gen_random_uuid(), user_id uuid references users(id), subscription_id uuid references subscriptions(id),
  event_name text not null, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists account_tokens (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id), purpose text not null,
  token_hash text unique not null, expires_at timestamptz not null, created_at timestamptz not null default now()
);
create table if not exists email_preferences (
  user_id uuid primary key references users(id), marketing_consent boolean not null default false,
  consent_timestamp timestamptz not null, consent_source text not null, consent_version text not null,
  training_step integer not null default 0, updated_at timestamptz not null default now()
);
create table if not exists contact_submissions (
  id uuid primary key default gen_random_uuid(), name text not null, email text not null, subject text not null,
  message text not null, category text not null, status text not null default 'new', created_at timestamptz not null default now()
);
create table if not exists marketing_assets (
  id uuid primary key default gen_random_uuid(), asset_key text unique not null, path text not null, alt_text text not null,
  active boolean not null default true, config jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
);
create table if not exists content_entries (
  id uuid primary key default gen_random_uuid(), content_type text not null, slug text not null, title text not null,
  body jsonb not null default '{}'::jsonb, active boolean not null default true, sort_order integer not null default 0,
  updated_at timestamptz not null default now(), unique(content_type,slug)
);

-- Projects become account-owned without deleting existing projects. Existing
-- rows remain assignable during migration; enforce NOT NULL after ownership backfill.
alter table projects add column if not exists user_id uuid references users(id) on delete set null;
create index if not exists projects_user_id on projects(user_id);

-- Exactly three initial plans. Normal price/limit changes update records rather
-- than application components; adding another plan is an explicit admin action.
insert into plans(name,slug,description) values
 ('Free','free','Create and export real basic videos — no payment required.'),
 ('SceneFlow','sceneflow','More creative control and regular production capacity.'),
 ('SceneForge','sceneforge','High-capacity production for busy publishing workflows.')
on conflict(slug) do update set name=excluded.name, description=excluded.description;

-- Commercial data is server-only. No anonymous/browser policies are created:
-- the backend service role bypasses RLS, while a leaked public anon key cannot
-- enumerate accounts, billing, usage, contacts, projects, or scenes.
alter table users enable row level security;
alter table plans enable row level security;
alter table plan_variants enable row level security;
alter table memberships enable row level security;
alter table subscriptions enable row level security;
alter table entitlements enable row level security;
alter table usage_records enable row level security;
alter table export_reservations enable row level security;
alter table complimentary_grants enable row level security;
alter table complimentary_codes enable row level security;
alter table webhook_events enable row level security;
alter table billing_events enable row level security;
alter table account_tokens enable row level security;
alter table email_preferences enable row level security;
alter table contact_submissions enable row level security;
alter table marketing_assets enable row level security;
alter table content_entries enable row level security;
alter table projects enable row level security;
alter table scenes enable row level security;
