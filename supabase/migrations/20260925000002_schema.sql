-- テーブル・制約・トリガー。権限（GRANT / RLS）は 20260925000003_rls.sql にまとめている。

-- ---------------------------------------------------------------------------
-- 列挙型
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('guest', 'host', 'admin');
create type public.identity_status as enum ('unsubmitted', 'pending', 'approved', 'rejected');
create type public.identity_document_status as enum ('pending', 'approved', 'rejected');
create type public.account_status as enum ('active', 'suspended');
create type public.host_status as enum ('applied', 'active', 'suspended');
create type public.host_application_status as enum ('pending', 'approved', 'rejected');
create type public.space_status as enum ('draft', 'published', 'suspended');
create type public.order_status as enum ('pending', 'paid', 'expired', 'failed');
create type public.booking_status as enum ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');
create type public.cancel_actor as enum ('guest', 'host', 'admin');
create type public.cancel_policy as enum ('full', 'half', 'none');
create type public.refund_status as enum ('pending', 'succeeded', 'failed');
create type public.notification_status as enum ('queued', 'sent', 'failed');

-- ---------------------------------------------------------------------------
-- 共通トリガー関数
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 30分刻みかどうか（UTC と Asia/Tokyo の差は9時間ちょうどなので UTC で判定してよい）
create or replace function public.is_slot_aligned(p_ts timestamptz)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_ts is not null
     and extract(epoch from p_ts) % ((select slot_minutes from public.pricing_config()) * 60) = 0
$$;

-- 予約期間として正しい範囲か: 有限・下端を含み上端を含まない・30分刻み
create or replace function public.is_valid_booking_period(p_period tstzrange)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_period is not null
     and not isempty(p_period)
     and not lower_inf(p_period) and not upper_inf(p_period)
     and lower_inc(p_period) and not upper_inc(p_period)
     and public.is_slot_aligned(lower(p_period))
     and public.is_slot_aligned(upper(p_period))
$$;

-- 期間が1つの暦日（Asia/Tokyo）に収まっているか。24:00 ちょうどに終わるのは同じ日とみなす。
-- 日をまたぐ予約は受け付けない（日をまたいで利用したい場合は日ごとに別々に予約する）
create or replace function public.is_single_jst_day(p_period tstzrange)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_period is not null
     and upper(p_period) > lower(p_period)
     and upper(p_period) <= (((lower(p_period) at time zone 'Asia/Tokyo')::date + 1)::timestamp
                             at time zone 'Asia/Tokyo')
$$;

create or replace function public.period_slots(p_period tstzrange)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (extract(epoch from upper(p_period) - lower(p_period))
          / ((select slot_minutes from public.pricing_config()) * 60))::integer
$$;

-- ---------------------------------------------------------------------------
-- 設定値
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb,
  description text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value, description) values
  ('identity_document_retention_days', null,
   'TODO(要確認): 退会したユーザーの本人確認書類の保存期間（日）。null の間は削除しない'),
  ('platform_invoice_registration_number', null,
   'TODO(要確認): 運営の適格請求書発行事業者の登録番号（T + 13桁）'),
  ('contact_email', null,
   'TODO(要確認): お問い合わせ先のメールアドレス');

-- ---------------------------------------------------------------------------
-- 利用者
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'guest',
  display_name text not null default '' check (char_length(display_name) <= 100),
  email text not null,
  phone text check (phone is null or phone ~ '^[0-9+\-]{6,20}$'),
  identity_status public.identity_status not null default 'unsubmitted',
  status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index profiles_email_idx on public.profiles (lower(email));
create index profiles_role_idx on public.profiles (role);
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- admin ロールの付与・剥奪は DB に直接接続したときだけ許可する（docs/admin-access.md）。
-- service role（アプリのサーバー）や SECURITY DEFINER の関数経由でも変更できない。
create or replace function public.guard_admin_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.role = 'admin' and (tg_op = 'INSERT' or old.role is distinct from 'admin'))
     or (tg_op = 'UPDATE' and old.role = 'admin' and new.role is distinct from 'admin') then
    if session_user not in ('postgres', 'supabase_admin') then
      raise exception 'admin role can only be changed directly in the database'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_guard_admin_role before insert or update of role on public.profiles
  for each row execute function public.guard_admin_role();

-- auth.users に登録されたら profiles を作る。ロールは常に guest（メタデータのロールは信用しない）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 100)
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.identity_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null check (storage_path <> ''),
  status public.identity_document_status not null default 'pending',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint identity_documents_review_consistency check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  ),
  constraint identity_documents_reject_reason check (
    status <> 'rejected' or coalesce(btrim(reject_reason), '') <> ''
  )
);
create index identity_documents_user_idx on public.identity_documents (user_id, created_at desc);
create index identity_documents_pending_idx on public.identity_documents (created_at) where status = 'pending';
create trigger identity_documents_set_updated_at before update on public.identity_documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 貸出主
-- ---------------------------------------------------------------------------
create table public.hosts (
  id uuid primary key default gen_random_uuid(),
  company_name text not null check (btrim(company_name) <> ''),
  invoice_registration_number text check (invoice_registration_number ~ '^T[0-9]{13}$'),
  status public.host_status not null default 'applied',
  stripe_account_id text unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger hosts_set_updated_at before update on public.hosts
  for each row execute function public.set_updated_at();

create table public.host_members (
  host_id uuid not null references public.hosts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (host_id, user_id)
);
create index host_members_user_idx on public.host_members (user_id);

create table public.host_applications (
  id uuid primary key default gen_random_uuid(),
  company_name text not null check (btrim(company_name) <> ''),
  contact_name text not null check (btrim(contact_name) <> ''),
  contact_email text not null check (contact_email ~ '^[^@\s]+@[^@\s]+$'),
  contact_phone text,
  address text not null,
  note text not null default '',
  status public.host_application_status not null default 'pending',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_note text,
  host_id uuid references public.hosts (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index host_applications_status_idx on public.host_applications (status, created_at);
create trigger host_applications_set_updated_at before update on public.host_applications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- スペース
-- ---------------------------------------------------------------------------
create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts (id),
  name text not null check (btrim(name) <> '' and char_length(name) <= 100),
  description text not null default '',
  amenities text[] not null default '{}',
  address text not null default '',
  area text not null default '',
  capacity integer not null check (capacity between 1 and 10000),
  price_per_30min integer not null,
  min_slots integer not null default 1,
  status public.space_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint spaces_min_slots_range check (
    min_slots between 1 and 48
  ),
  -- 30分 300 円以上で、半額キャンセルでも貸出主の手取りがマイナスにならない料金だけを許可する
  constraint spaces_price_allowed check (public.is_price_allowed(price_per_30min, min_slots))
);
create index spaces_host_idx on public.spaces (host_id);
create index spaces_published_idx on public.spaces (area, capacity) where status = 'published' and deleted_at is null;
create trigger spaces_set_updated_at before update on public.spaces
  for each row execute function public.set_updated_at();

create table public.space_photos (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index space_photos_space_idx on public.space_photos (space_id, sort_order);

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  -- 0 = 日曜 … 6 = 土曜（extract(dow) と packages/core の weekday と同じ）
  weekday smallint not null check (weekday between 0 and 6),
  open_time time not null,
  close_time time not null,
  created_at timestamptz not null default now(),
  constraint availability_rules_order check (open_time < close_time),
  constraint availability_rules_aligned check (
    extract(epoch from open_time)::integer % 1800 = 0
    and extract(epoch from close_time)::integer % 1800 = 0
  )
);
create index availability_rules_space_idx on public.availability_rules (space_id, weekday);

create table public.closures (
  space_id uuid not null references public.spaces (id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  primary key (space_id, date)
);

-- ---------------------------------------------------------------------------
-- 予約カゴ
-- ---------------------------------------------------------------------------
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null unique references public.profiles (id) on delete cascade,
  -- カゴに入っているスペースの貸出主（1つの注文は1つの貸出主だけ）
  host_id uuid references public.hosts (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger carts_set_updated_at before update on public.carts
  for each row execute function public.set_updated_at();

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  space_id uuid not null references public.spaces (id),
  period tstzrange not null check (public.is_valid_booking_period(period)),
  slots integer generated always as (public.period_slots(period)) stored,
  created_at timestamptz not null default now(),
  constraint cart_items_slots_range check (slots between 1 and 48),
  constraint cart_items_single_day check (public.is_single_jst_day(period))
);
create index cart_items_cart_idx on public.cart_items (cart_id);

-- 別の貸出主のスペースは同じカゴに入れられない（アプリは SQLSTATE 'P0001' / 'cart_host_mismatch' を見て案内を出す）
create or replace function public.guard_cart_single_host()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space_host uuid;
  v_cart_host uuid;
  v_item_count integer;
begin
  select host_id into v_space_host from public.spaces where id = new.space_id;
  -- 同じカゴへの同時追加で判定が崩れないようにカゴをロックする
  select host_id into v_cart_host from public.carts where id = new.cart_id for update;
  select count(*) into v_item_count from public.cart_items where cart_id = new.cart_id and id <> new.id;
  if v_item_count = 0 then
    update public.carts set host_id = v_space_host where id = new.cart_id;
  elsif v_cart_host is distinct from v_space_host then
    raise exception 'cart_host_mismatch' using detail = '予約カゴを分けて購入する必要があります';
  end if;
  return new;
end;
$$;
create trigger cart_items_guard_single_host before insert or update of space_id on public.cart_items
  for each row execute function public.guard_cart_single_host();

-- ---------------------------------------------------------------------------
-- 注文・予約
-- ---------------------------------------------------------------------------
create sequence public.order_number_seq;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique
    default ('T-' || lpad(nextval('public.order_number_seq')::text, 8, '0')),
  guest_id uuid not null references public.profiles (id),
  host_id uuid not null references public.hosts (id),
  total integer not null check (total >= 0),
  application_fee_amount integer not null check (application_fee_amount >= 0),
  status public.order_status not null default 'pending',
  stripe_payment_intent_id text unique,
  stripe_charge_id text unique,
  stripe_transfer_id text unique,
  -- balance_transaction から取得した実際の Stripe 手数料（見込み額との差は運営が吸収）
  stripe_fee_actual integer check (stripe_fee_actual >= 0),
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_fee_le_total check (application_fee_amount <= total),
  constraint orders_paid_consistency check ((status = 'paid') = (paid_at is not null))
);
create index orders_guest_idx on public.orders (guest_id, created_at desc);
create index orders_host_idx on public.orders (host_id, created_at desc);
create index orders_pending_idx on public.orders (expires_at) where status = 'pending';
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  space_id uuid not null references public.spaces (id),
  -- RLS と集計のために注文から複製して持つ（トリガーで整合性を保証）
  host_id uuid not null references public.hosts (id),
  guest_id uuid not null references public.profiles (id),
  period tstzrange not null,
  slots integer not null,
  -- 確定時の30分あたりの料金（スペースの料金を変えても過去の予約の金額は変わらない）
  price_per_30min integer not null check (price_per_30min > 0),
  total integer not null,
  status public.booking_status not null default 'pending',
  cancelled_by public.cancel_actor,
  cancelled_at timestamptz,
  cancel_policy public.cancel_policy,
  cancel_reason text,
  no_show_recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_period_valid check (public.is_valid_booking_period(period)),
  constraint bookings_single_day check (public.is_single_jst_day(period)),
  constraint bookings_slots_match check (slots = public.period_slots(period) and slots between 1 and 48),
  constraint bookings_total_match check (total = price_per_30min * slots),
  constraint bookings_cancel_consistency check (
    (status = 'cancelled') = (cancelled_by is not null and cancelled_at is not null and cancel_policy is not null)
  ),
  constraint bookings_host_cancel_reason check (
    cancelled_by is distinct from 'host' or coalesce(btrim(cancel_reason), '') <> ''
  ),
  constraint bookings_no_show_consistency check ((status = 'no_show') = (no_show_recorded_at is not null)),
  -- ダブルブッキングの防止（SPEC 4.1）
  constraint bookings_no_overlap exclude using gist (space_id with =, period with &&)
    where (status in ('pending', 'confirmed'))
);
create index bookings_order_idx on public.bookings (order_id);
create index bookings_guest_idx on public.bookings (guest_id, lower(period) desc);
create index bookings_host_idx on public.bookings (host_id, lower(period) desc);
create index bookings_confirmed_end_idx on public.bookings (upper(period)) where status = 'confirmed';
create trigger bookings_set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

create or replace function public.guard_booking_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  v_space_host uuid;
begin
  select guest_id, host_id into o from public.orders where id = new.order_id;
  select host_id into v_space_host from public.spaces where id = new.space_id;
  if o.guest_id is distinct from new.guest_id or o.host_id is distinct from new.host_id
     or v_space_host is distinct from new.host_id then
    raise exception 'booking does not match its order or space' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger bookings_guard_consistency before insert or update of order_id, space_id, host_id, guest_id
  on public.bookings for each row execute function public.guard_booking_consistency();

-- 予約1件ごとの手数料の内訳（確定時の値を保存する）
create table public.booking_fees (
  booking_id uuid primary key references public.bookings (id),
  hours integer not null check (hours >= 1),
  platform_fee_excl_tax integer not null check (platform_fee_excl_tax >= 0),
  platform_fee_tax integer not null check (platform_fee_tax >= 0),
  stripe_fee_estimated integer not null check (stripe_fee_estimated >= 0),
  application_fee integer not null,
  created_at timestamptz not null default now(),
  constraint booking_fees_sum check (
    application_fee = platform_fee_excl_tax + platform_fee_tax + stripe_fee_estimated
  )
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  policy public.cancel_policy not null check (policy in ('full', 'half')),
  refund_amount integer not null check (refund_amount > 0),
  transfer_reversal_amount integer not null check (transfer_reversal_amount >= 0),
  stripe_refund_id text unique,
  stripe_transfer_reversal_id text unique,
  status public.refund_status not null default 'pending',
  failure_reason text,
  attempts integer not null default 0,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 1つの予約の返金は1件だけ（再実行は同じ行を更新する）
create unique index refunds_booking_uidx on public.refunds (booking_id);
create index refunds_failed_idx on public.refunds (created_at) where status = 'failed';
create trigger refunds_set_updated_at before update on public.refunds
  for each row execute function public.set_updated_at();

-- 利用者自身のキャンセルの記録（キャンセル回数の判定に使う。貸出主・運営のキャンセルと no_show は記録しない）
create table public.cancel_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id),
  booking_id uuid not null unique references public.bookings (id),
  created_at timestamptz not null default now()
);
create index cancel_events_user_time_idx on public.cancel_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 月次明細
-- ---------------------------------------------------------------------------
create table public.monthly_statements (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts (id),
  -- 対象月の1日（Asia/Tokyo）
  month date not null check (extract(day from month) = 1),
  gross bigint not null,
  platform_fee_excl_tax bigint not null,
  platform_fee_tax bigint not null,
  stripe_fee bigint not null,
  net bigint not null,
  pdf_path text,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  unique (host_id, month)
);

-- ---------------------------------------------------------------------------
-- 外部連携・記録
-- ---------------------------------------------------------------------------
create table public.stripe_events (
  event_id text primary key,
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id),
  to_email text not null,
  template text not null,
  subject text not null,
  payload jsonb not null default '{}',
  status public.notification_status not null default 'queued',
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id),
  action text not null,
  target_table text,
  target_id text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_target_idx on public.audit_logs (target_table, target_id);

-- 操作ログは追記のみ（service role でも更新・削除できない）
create or replace function public.guard_audit_logs_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;
create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function public.guard_audit_logs_append_only();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function public.guard_audit_logs_append_only();
