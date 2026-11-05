-- ABFM Grooming: database schema.
-- The tables mirror the tabs of the old Google Sheet, one text column per sheet column, so the same backend
-- logic (setup/grooming-backend.gs) runs unchanged in the "api" Edge Function. They live in the "grooming"
-- schema, which the public API does not expose: the app can only reach them through the Edge Function,
-- which checks each person's PIN, role and sites.

create schema if not exists grooming;
revoke all on schema grooming from public, anon, authenticated;
alter default privileges in schema grooming revoke all on tables from public, anon, authenticated;

create table grooming.sites (
  _pk bigint generated always as identity primary key,
  "id" text not null default '',
  "name" text not null default '',
  "active" text not null default ''
);

create table grooming.users (
  _pk bigint generated always as identity primary key,
  "id" text not null default '',
  "username" text not null default '',
  "name" text not null default '',
  "role" text not null default '',
  "pin" text not null default '',
  "sites" text not null default '',
  "active" text not null default '',
  "email" text not null default ''
);

create table grooming.employees (
  _pk bigint generated always as identity primary key,
  "id" text not null default '',
  "staff_no" text not null default '',
  "name" text not null default '',
  "trade" text not null default '',
  "site_id" text not null default '',
  "uniform_size" text not null default '',
  "shoe_size" text not null default '',
  "trained_on" text not null default '',
  "active" text not null default '',
  "baseline_on" text not null default '',
  "ppe_held" text not null default '',
  "missing" text not null default '',
  "accommodation" text not null default ''
);

create table grooming.checks (
  _pk bigint generated always as identity primary key,
  "id" text not null default '',
  "date" text not null default '',
  "type" text not null default '',
  "employee_id" text not null default '',
  "site_id" text not null default '',
  "status" text not null default '',
  "finding_no" text not null default '',
  "gaps" text not null default '',
  "note" text not null default '',
  "photo" text not null default '',
  "by" text not null default '',
  "time" text not null default ''
);

create table grooming.supply (
  _pk bigint generated always as identity primary key,
  "id" text not null default '',
  "employee_id" text not null default '',
  "site_id" text not null default '',
  "item" text not null default '',
  "requested_on" text not null default '',
  "issued_on" text not null default '',
  "check_id" text not null default '',
  "by" text not null default ''
);

create table grooming.submissions (
  _pk bigint generated always as identity primary key,
  "site_id" text not null default '',
  "date" text not null default '',
  "by" text not null default '',
  "time" text not null default '',
  "total" text not null default '',
  "passed" text not null default '',
  "gaps" text not null default '',
  "supply" text not null default '',
  "absent" text not null default ''
);

create table grooming.audits (
  _pk bigint generated always as identity primary key,
  "id" text not null default '',
  "site_id" text not null default '',
  "date" text not null default '',
  "auditor" text not null default '',
  "with_hse" text not null default '',
  "sample" text not null default '',
  "s_grooming" text not null default '',
  "s_ppe" text not null default '',
  "s_comm" text not null default '',
  "s_control" text not null default '',
  "notes" text not null default '',
  "report_on" text not null default '',
  "plan_on" text not null default '',
  "verified_on" text not null default ''
);

create table grooming.actions (
  _pk bigint generated always as identity primary key,
  "id" text not null default '',
  "audit_id" text not null default '',
  "finding" text not null default '',
  "employee_id" text not null default '',
  "action" text not null default '',
  "owner" text not null default '',
  "due_on" text not null default '',
  "closed_on" text not null default ''
);

create table grooming.incidents (
  _pk bigint generated always as identity primary key,
  "id" text not null default '',
  "date" text not null default '',
  "time" text not null default '',
  "site_id" text not null default '',
  "employee_id" text not null default '',
  "type" text not null default '',
  "location" text not null default '',
  "details" text not null default '',
  "action" text not null default '',
  "reported_by" text not null default '',
  "status" text not null default '',
  "ack_by" text not null default '',
  "ack_on" text not null default '',
  "closed_on" text not null default '',
  "outcome" text not null default ''
);

create table grooming.discipline (
  _pk bigint generated always as identity primary key,
  "id" text not null default '',
  "employee_id" text not null default '',
  "site_id" text not null default '',
  "date" text not null default '',
  "level" text not null default '',
  "action" text not null default '',
  "amount" text not null default '',
  "notes" text not null default '',
  "by" text not null default ''
);

create table grooming.activity (
  _pk bigint generated always as identity primary key,
  "time" text not null default '',
  "user" text not null default '',
  "role" text not null default '',
  "action" text not null default '',
  "details" text not null default ''
);

create table grooming.settings (
  _pk bigint generated always as identity primary key,
  "key" text not null default '',
  "value" text not null default ''
);

create index checks_date_idx on grooming.checks ("date");
create index checks_photo_idx on grooming.checks (photo) where photo <> '';
create index submissions_date_idx on grooming.submissions ("date");

-- Script settings that used to be Apps Script properties (e.g. the session signing secret).
create table grooming.props (key text primary key, value text not null);
-- Wrong-PIN counter per username (locks the username for 10 minutes after 6 wrong PINs).
create table grooming.login_fails (key text primary key, n integer not null, until timestamptz not null);

-- Check photos (private; the Edge Function reads and writes them).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('grooming-photos', 'grooming-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
