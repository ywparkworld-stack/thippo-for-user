-- 権限。方針:
--   * anon / authenticated にはまず何も許可せず、必要なテーブル・列・操作だけを GRANT する
--   * すべてのテーブルで RLS を有効にする
--   * 運営用データ・お金に関わるデータへの書き込みは、authenticated には直接許可しない。
--     サーバー（service role）か、権限を確認して audit_logs に記録する SECURITY DEFINER の RPC
--     （フェーズ 2 以降で追加）経由でのみ行う
--   * 運営（admin）として扱うのは、role = admin・status = active・2段階認証済み（aal2）のセッションだけ

-- ---------------------------------------------------------------------------
-- 既定の権限を取り消す（Supabase は public のテーブルを anon / authenticated に GRANT ALL する）
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- ポリシーから使う関数（RLS の再帰を避けるため SECURITY DEFINER）
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1 from public.profiles
       where id = auth.uid() and role = 'admin' and status = 'active' and deleted_at is null
     )
$$;

create or replace function public.is_host_member(p_host_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.host_members m
    join public.profiles p on p.id = m.user_id
    where m.host_id = p_host_id
      and m.user_id = auth.uid()
      and p.role = 'host'
      and p.status = 'active'
      and p.deleted_at is null
  )
$$;

create or replace function public.host_is_active(p_host_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.hosts where id = p_host_id and status = 'active' and deleted_at is null
  )
$$;

-- 利用者サイトに表示してよいスペースか（公開中で、貸出主が active）
create or replace function public.is_space_public(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.spaces s
    where s.id = p_space_id
      and s.status = 'published'
      and s.deleted_at is null
      and public.host_is_active(s.host_id)
  )
$$;

create or replace function public.can_manage_space(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.spaces s where s.id = p_space_id and public.is_host_member(s.host_id)
  )
$$;

create or replace function public.can_read_booking(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bookings b
    where b.id = p_booking_id
      and (b.guest_id = auth.uid() or public.is_host_member(b.host_id) or public.is_admin())
  )
$$;

create or replace function public.owns_cart(p_cart_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.carts where id = p_cart_id and guest_id = auth.uid())
$$;

grant execute on function
  public.is_admin(),
  public.is_host_member(uuid),
  public.host_is_active(uuid),
  public.is_space_public(uuid),
  public.can_manage_space(uuid),
  public.can_read_booking(uuid),
  public.owns_cart(uuid)
to anon, authenticated;

grant execute on function
  public.is_slot_aligned(timestamptz),
  public.is_valid_booking_period(tstzrange),
  public.period_slots(tstzrange),
  public.pricing_config(),
  public.calc_booking_fees(integer, integer),
  public.is_price_allowed(integer, integer),
  public.min_price_per_30min(integer)
to anon, authenticated;

-- ---------------------------------------------------------------------------
-- スペースの状態変更のガード
-- ---------------------------------------------------------------------------
create or replace function public.host_can_publish(p_host_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.hosts
    where id = p_host_id and status = 'active' and charges_enabled and payouts_enabled and deleted_at is null
  )
$$;

-- SECURITY DEFINER にしない（current_user で呼び出し元のロールを判定するため）
create or replace function public.guard_space_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_privileged boolean := current_user in ('service_role', 'postgres', 'supabase_admin') or public.is_admin();
begin
  -- 公開停止（suspended）の設定・解除は運営だけ
  if (tg_op = 'INSERT' and new.status = 'suspended')
     or (tg_op = 'UPDATE' and (old.status = 'suspended') <> (new.status = 'suspended')) then
    if not v_privileged then
      raise exception 'only admin can change a suspended space' using errcode = '42501';
    end if;
  end if;
  -- Stripe のオンボーディングが終わっていない貸出主は公開できない
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if not public.host_can_publish(new.host_id) then
      raise exception 'host_not_ready_to_publish' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
grant execute on function public.host_can_publish(uuid) to authenticated;

create trigger spaces_guard_status before insert or update of status on public.spaces
  for each row execute function public.guard_space_status();

-- ---------------------------------------------------------------------------
-- RLS を有効化
-- ---------------------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.identity_documents enable row level security;
alter table public.hosts enable row level security;
alter table public.host_members enable row level security;
alter table public.host_applications enable row level security;
alter table public.spaces enable row level security;
alter table public.space_photos enable row level security;
alter table public.availability_rules enable row level security;
alter table public.closures enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_fees enable row level security;
alter table public.refunds enable row level security;
alter table public.cancel_events enable row level security;
alter table public.monthly_statements enable row level security;
alter table public.stripe_events enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

-- ---------------------------------------------------------------------------
-- profiles: 本人は表示名・電話番号だけ変更できる。role / status / identity_status は変更不可
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (display_name, phone) on public.profiles to authenticated;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() and deleted_at is null)
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- identity_documents: 本人は提出（pending のみ）と閲覧。審査は運営の RPC で行う
-- ---------------------------------------------------------------------------
grant select on public.identity_documents to authenticated;
grant insert (user_id, storage_path) on public.identity_documents to authenticated;

create policy identity_documents_select on public.identity_documents for select to authenticated
  using ((user_id = auth.uid() and deleted_at is null) or public.is_admin());
create policy identity_documents_insert_self on public.identity_documents for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and storage_path like auth.uid()::text || '/%'
  );

-- ---------------------------------------------------------------------------
-- hosts / host_members: 所属する担当者と運営だけが閲覧。会社情報は担当者が更新できる
-- ---------------------------------------------------------------------------
grant select on public.hosts to authenticated;
grant update (company_name, invoice_registration_number) on public.hosts to authenticated;

create policy hosts_select on public.hosts for select to authenticated
  using (public.is_host_member(id) or public.is_admin());
create policy hosts_update_member on public.hosts for update to authenticated
  using (public.is_host_member(id) and status <> 'suspended')
  with check (public.is_host_member(id));

grant select on public.host_members to authenticated;
create policy host_members_select on public.host_members for select to authenticated
  using (public.is_host_member(host_id) or public.is_admin());

-- 掲載申込はサーバー（service role）が入力検証とレート制限をしてから保存する
grant select on public.host_applications to authenticated;
create policy host_applications_select_admin on public.host_applications for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- spaces と付随データ: 公開中のものは誰でも閲覧。貸出主は自社のものを管理
-- ---------------------------------------------------------------------------
grant select on public.spaces to anon, authenticated;
grant insert (host_id, name, description, amenities, address, area, capacity, price_per_30min, min_slots, status)
  on public.spaces to authenticated;
grant update (name, description, amenities, address, area, capacity, price_per_30min, min_slots, status, deleted_at)
  on public.spaces to authenticated;

create policy spaces_select_public on public.spaces for select to anon, authenticated
  using (status = 'published' and deleted_at is null and public.host_is_active(host_id));
create policy spaces_select_member on public.spaces for select to authenticated
  using (public.is_host_member(host_id) or public.is_admin());
create policy spaces_insert_member on public.spaces for insert to authenticated
  with check (public.is_host_member(host_id) and public.host_is_active(host_id));
create policy spaces_update_member on public.spaces for update to authenticated
  using (public.is_host_member(host_id))
  with check (public.is_host_member(host_id));

grant select on public.space_photos, public.availability_rules, public.closures to anon, authenticated;
grant insert, update, delete on public.space_photos, public.availability_rules, public.closures to authenticated;

create policy space_photos_select on public.space_photos for select to anon, authenticated
  using (public.is_space_public(space_id) or public.can_manage_space(space_id) or public.is_admin());
create policy space_photos_write on public.space_photos for all to authenticated
  using (public.can_manage_space(space_id)) with check (public.can_manage_space(space_id));

create policy availability_rules_select on public.availability_rules for select to anon, authenticated
  using (public.is_space_public(space_id) or public.can_manage_space(space_id) or public.is_admin());
create policy availability_rules_write on public.availability_rules for all to authenticated
  using (public.can_manage_space(space_id)) with check (public.can_manage_space(space_id));

create policy closures_select on public.closures for select to anon, authenticated
  using (public.is_space_public(space_id) or public.can_manage_space(space_id) or public.is_admin());
create policy closures_write on public.closures for all to authenticated
  using (public.can_manage_space(space_id)) with check (public.can_manage_space(space_id));

-- 予約済みの時間帯（空き枠の表示用）。予約の中身は返さず、期間だけを返す
create or replace function public.space_busy_periods(p_space_id uuid, p_from timestamptz, p_to timestamptz)
returns table (period tstzrange)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_to <= p_from or p_to - p_from > interval '32 days' then
    raise exception 'invalid range' using errcode = '22023';
  end if;
  if not (public.is_space_public(p_space_id) or public.can_manage_space(p_space_id) or public.is_admin()) then
    return;
  end if;
  return query
    select b.period from public.bookings b
    where b.space_id = p_space_id
      and b.status in ('pending', 'confirmed')
      and b.period && tstzrange(p_from, p_to, '[)')
    order by lower(b.period);
end;
$$;
grant execute on function public.space_busy_periods(uuid, timestamptz, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 予約カゴ: 本人だけ
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.carts to authenticated;
grant select, insert, delete on public.cart_items to authenticated;

create policy carts_own on public.carts for all to authenticated
  using (guest_id = auth.uid()) with check (guest_id = auth.uid());
create policy cart_items_select_own on public.cart_items for select to authenticated
  using (public.owns_cart(cart_id));
create policy cart_items_delete_own on public.cart_items for delete to authenticated
  using (public.owns_cart(cart_id));
-- 公開中のスペースだけカゴに入れられる
create policy cart_items_insert_own on public.cart_items for insert to authenticated
  with check (public.owns_cart(cart_id) and public.is_space_public(space_id));

-- ---------------------------------------------------------------------------
-- 注文・予約・お金: 閲覧のみ（利用者本人・その貸出主の担当者・運営）。書き込みは RPC / service role
-- ---------------------------------------------------------------------------
grant select on public.orders, public.bookings, public.booking_fees, public.refunds to authenticated;

create policy orders_select on public.orders for select to authenticated
  using (guest_id = auth.uid() or public.is_host_member(host_id) or public.is_admin());
create policy bookings_select on public.bookings for select to authenticated
  using (guest_id = auth.uid() or public.is_host_member(host_id) or public.is_admin());
create policy booking_fees_select on public.booking_fees for select to authenticated
  using (public.can_read_booking(booking_id));
create policy refunds_select on public.refunds for select to authenticated
  using (public.can_read_booking(booking_id));

grant select on public.cancel_events to authenticated;
create policy cancel_events_select on public.cancel_events for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

grant select on public.monthly_statements to authenticated;
create policy monthly_statements_select on public.monthly_statements for select to authenticated
  using (public.is_host_member(host_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- 運営用データ: 運営だけが閲覧。stripe_events は service role だけ
-- ---------------------------------------------------------------------------
grant select on public.notifications, public.audit_logs, public.app_settings to authenticated;
create policy notifications_select_admin on public.notifications for select to authenticated
  using (public.is_admin());
create policy audit_logs_select_admin on public.audit_logs for select to authenticated
  using (public.is_admin());
create policy app_settings_select_admin on public.app_settings for select to authenticated
  using (public.is_admin());
