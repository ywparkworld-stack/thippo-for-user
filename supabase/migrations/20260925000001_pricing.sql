-- 料金・手数料の DB 側の実装。
-- packages/core の PRICING / BOOKING_RULES / CANCEL_RULES と同じ値・同じ計算を持つ。
-- 一致していることは supabase/tests/test/pricing-parity.test.ts で確認している。

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create or replace function public.pricing_config()
returns table (
  slot_minutes integer,
  platform_fee_per_hour_excl_tax integer,
  half_cancel_platform_fee_per_hour_excl_tax integer,
  consumption_tax_rate_percent integer,
  stripe_fee_rate_basis_points integer,
  max_slots_per_booking integer,
  max_price_per_30min integer,
  booking_window_days integer,
  pending_order_ttl_minutes integer,
  full_refund_deadline_hours integer,
  cancel_count_window_hours integer,
  cancel_count_limit integer
)
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 30, 200, 100, 10, 360, 48, 1000000, 30, 15, 2, 24, 5
$$;

-- 予約1件分の手数料の内訳（packages/core の calcBookingFees と同じ）
create or replace function public.calc_booking_fees(p_price_per_30min integer, p_slots integer)
returns table (
  hours integer,
  total integer,
  platform_fee_excl_tax integer,
  platform_fee_tax integer,
  stripe_fee_estimated integer,
  application_fee integer,
  host_transfer integer
)
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  c record;
begin
  select * into c from public.pricing_config();
  if p_slots is null or p_slots < 1 or p_slots > c.max_slots_per_booking then
    raise exception 'slots must be in 1..%', c.max_slots_per_booking using errcode = '22023';
  end if;
  if p_price_per_30min is null or p_price_per_30min < 1 or p_price_per_30min > c.max_price_per_30min then
    raise exception 'price_per_30min must be in 1..%', c.max_price_per_30min using errcode = '22023';
  end if;

  total := p_price_per_30min * p_slots;
  hours := (p_slots * c.slot_minutes + 59) / 60;
  platform_fee_excl_tax := c.platform_fee_per_hour_excl_tax * hours;
  platform_fee_tax := platform_fee_excl_tax * c.consumption_tax_rate_percent / 100;
  stripe_fee_estimated := ((total::bigint * c.stripe_fee_rate_basis_points + 9999) / 10000)::integer;
  application_fee := platform_fee_excl_tax + platform_fee_tax + stripe_fee_estimated;
  host_transfer := total - application_fee;
  return next;
end;
$$;

-- 料金が設定可能か（packages/core の isPriceAllowed と同じ）。
-- min_slots 以上のすべての枠数で、通常利用・全額返金・半額返金のいずれでも
-- 貸出主の手取りがマイナスにならないこと。
create or replace function public.is_price_allowed(p_price_per_30min integer, p_min_slots integer)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  c record;
  f record;
  n integer;
  half_fee integer;
  refund integer;
  reversal integer;
begin
  select * into c from public.pricing_config();
  if p_min_slots is null or p_min_slots < 1 or p_min_slots > c.max_slots_per_booking then
    return false;
  end if;
  if p_price_per_30min is null or p_price_per_30min < 1 or p_price_per_30min > c.max_price_per_30min then
    return false;
  end if;
  for n in p_min_slots .. c.max_slots_per_booking loop
    select * into f from public.calc_booking_fees(p_price_per_30min, n);
    if f.host_transfer < 0 then
      return false;
    end if;
    half_fee := c.half_cancel_platform_fee_per_hour_excl_tax * f.hours;
    half_fee := half_fee + half_fee * c.consumption_tax_rate_percent / 100;
    refund := f.total / 2;
    reversal := refund - half_fee;
    if reversal < 0 or reversal > f.host_transfer then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- 30分あたりの料金の下限（packages/core の minPricePer30min と同じ）
create or replace function public.min_price_per_30min(p_min_slots integer)
returns integer
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  p integer;
  last_rejected integer := 0;
begin
  for p in 1 .. 2000 loop
    if not public.is_price_allowed(p, p_min_slots) then
      last_rejected := p;
    end if;
  end loop;
  return last_rejected + 1;
end;
$$;
