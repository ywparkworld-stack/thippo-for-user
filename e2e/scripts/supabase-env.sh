#!/usr/bin/env bash
# `supabase status` の値から、アプリと E2E テストに必要な環境変数を export 文として出力する。
# 使い方: eval "$(e2e/scripts/supabase-env.sh)"
set -euo pipefail
eval "$(supabase status -o env)"
cat <<OUT
export NEXT_PUBLIC_SUPABASE_URL='${API_URL}'
export NEXT_PUBLIC_SUPABASE_ANON_KEY='${ANON_KEY}'
export SUPABASE_URL='${API_URL}'
export SUPABASE_SERVICE_ROLE_KEY='${SERVICE_ROLE_KEY}'
export E2E_DATABASE_URL='${DB_URL}'
export MAILPIT_URL='${MAILPIT_URL:-${INBUCKET_URL:-http://127.0.0.1:54324}}'
export NEXT_PUBLIC_GUEST_URL='http://localhost:3000'
export NEXT_PUBLIC_HOST_URL='http://localhost:3001'
export ADMIN_URL='http://localhost:3002'
export ADMIN_ACCESS_MODE='none'
OUT
