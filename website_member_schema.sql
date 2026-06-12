-- POPS website/account-side core schema
-- Website = membership, checkout, newsletter, events, downloads, license access
-- Desktop POPS = local workstation + token/license validation only

create table if not exists members (
  id text primary key,
  email text not null unique,
  name text not null,
  password_auth_id text,
  auth_provider_id text,
  role text not null default 'member',
  access_tier text not null default 'standard',
  license_status text not null default 'inactive',
  created_at text not null,
  last_login_at text
);

create table if not exists member_profiles (
  member_id text primary key,
  state text,
  pro_se_status text,
  general_need_level text,
  newsletter_opt_in integer not null default 0,
  newsletter_opt_in_at text,
  newsletter_opt_in_source text,
  unsubscribe_status integer not null default 0,
  unsubscribe_at text,
  sms_opt_in integer not null default 0,
  sms_opt_in_at text,
  foreign key (member_id) references members(id) on delete cascade
);

create table if not exists payments (
  id text primary key,
  member_id text not null,
  stripe_customer_id text,
  stripe_checkout_session_id text,
  tier text not null,
  amount integer not null,
  status text not null,
  paid_at text,
  created_at text not null,
  foreign key (member_id) references members(id) on delete cascade
);

create table if not exists licenses (
  id text primary key,
  member_id text not null,
  license_key text not null unique,
  product text not null,
  status text not null,
  download_allowed integer not null default 0,
  issued_at text not null,
  expires_at text,
  foreign key (member_id) references members(id) on delete cascade
);

create table if not exists lifeline_requests (
  id text primary key,
  member_id text not null,
  request_status text not null,
  short_statement text,
  reviewed_by text,
  reviewed_at text,
  decision_notes text,
  created_at text not null,
  updated_at text not null,
  foreign key (member_id) references members(id) on delete cascade
);

create table if not exists sponsorships (
  id text primary key,
  sponsor_member_id text not null,
  amount integer not null,
  purpose text not null,
  sponsored_license_id text,
  created_at text not null,
  foreign key (sponsor_member_id) references members(id) on delete cascade,
  foreign key (sponsored_license_id) references licenses(id) on delete set null
);

create table if not exists events (
  id text primary key,
  title text not null,
  date text not null,
  type text not null,
  description text,
  registration_url text,
  visibility text not null default 'public',
  replay_url text,
  resource_download_url text,
  created_at text not null
);

create table if not exists event_registrations (
  id text primary key,
  event_id text not null,
  member_id text not null,
  status text not null,
  registered_at text not null,
  unique(event_id, member_id),
  foreign key (event_id) references events(id) on delete cascade,
  foreign key (member_id) references members(id) on delete cascade
);
