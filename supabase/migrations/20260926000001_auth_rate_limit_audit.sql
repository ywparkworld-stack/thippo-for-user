-- フェーズ 2: レート制限と操作ログの記録

-- ---------------------------------------------------------------------------
-- レート制限（固定ウィンドウ）。キーは IP やメールアドレスのハッシュなど、個人情報をそのまま含めない
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key text not null check (char_length(key) <= 200),
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
create index rate_limits_window_idx on public.rate_limits (window_start);
alter table public.rate_limits enable row level security;
-- anon / authenticated には権限を与えない（サーバーが service role で呼ぶ）

create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, current_count integer, reset_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_key is null or p_key = '' or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit arguments' using errcode = '22023';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;
  allowed := v_count <= p_limit;
  current_count := v_count;
  reset_at := v_window + make_interval(secs => p_window_seconds);
  return next;
end;
$$;
revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- 古いウィンドウの削除（定期実行はフェーズ 10 で登録する）
create or replace function public.purge_rate_limits(p_older_than interval default interval '1 day')
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with d as (delete from public.rate_limits where window_start < now() - p_older_than returning 1)
  select count(*)::integer from d
$$;
revoke execute on function public.purge_rate_limits(interval) from public, anon, authenticated;
grant execute on function public.purge_rate_limits(interval) to service_role;

-- ---------------------------------------------------------------------------
-- 操作ログ
-- ---------------------------------------------------------------------------
alter table public.audit_logs
  add constraint audit_logs_action_format check (action ~ '^[a-z_]+(\.[a-z_]+)+$');

-- 運営のセッション（aal2）から記録する。actor は常に auth.uid()（引数で詐称できない）
create or replace function public.log_admin_action(
  p_action text,
  p_target_table text default null,
  p_target_id text default null,
  p_payload jsonb default '{}'
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  insert into public.audit_logs (actor_id, action, target_table, target_id, payload)
  values (auth.uid(), p_action, p_target_table, p_target_id, coalesce(p_payload, '{}'))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.log_admin_action(text, text, text, jsonb) from public, anon;
grant execute on function public.log_admin_action(text, text, text, jsonb) to authenticated;

-- サーバー（service role）から記録する。ログイン前後など、まだ aal2 のセッションがない操作に使う
create or replace function public.write_audit_log(
  p_actor_id uuid,
  p_action text,
  p_target_table text default null,
  p_target_id text default null,
  p_payload jsonb default '{}'
)
returns bigint
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, target_table, target_id, payload)
  values (p_actor_id, p_action, p_target_table, p_target_id, coalesce(p_payload, '{}'))
  returning id
$$;
revoke execute on function public.write_audit_log(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.write_audit_log(uuid, text, text, text, jsonb) to service_role;
