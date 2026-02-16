-- =====================================================
-- Supabase Auth: ユーザー招待用SQL
-- =====================================================
-- Supabase Auth は自動的にユーザーテーブルを管理します。
-- ユーザーの追加は Supabase Dashboard > Authentication > Users から行えます。
--
-- 手順:
-- 1. Supabase Dashboard にログイン
-- 2. Authentication > Users > "Add user" > "Create new user"
-- 3. Email / Password を入力して作成
-- 4. 作成したユーザーに本システムのURLとログイン情報を共有
--
-- 注意:
-- - "Auto Confirm" をオンにすると、メール確認なしで即座にログイン可能
-- - 本システムは招待制（管理者がユーザーを作成する方式）を想定
-- - セルフサインアップを無効にする場合:
--   Dashboard > Authentication > Providers > Email > "Enable Sign Up" をOFF

-- app_state テーブル（状態保存用、既存）
create table if not exists public.app_state (
  id text primary key,
  version integer not null default 1,
  updated_at timestamptz not null default timezone('utc', now()),
  data jsonb
);

revoke all on table public.app_state from anon, authenticated;
grant all on table public.app_state to service_role;

-- =====================================================
-- state_history テーブル（バックアップ/ロールバック用）
-- =====================================================
-- 保存のたびにスナップショットを保持し、復元可能にする。
-- 最新50件のみ保持（アプリ側で古いデータを削除）。
create table if not exists public.state_history (
  id bigint generated always as identity primary key,
  saved_at timestamptz not null default timezone('utc', now()),
  saved_by text,              -- ユーザーのメールアドレス
  summary text,               -- 変更内容の要約
  data jsonb                  -- 全状態データのスナップショット
);

create index if not exists idx_state_history_saved_at on public.state_history (saved_at desc);

revoke all on table public.state_history from anon, authenticated;
grant all on table public.state_history to service_role;

-- =====================================================
-- audit_log テーブル（操作ログ/監査証跡）
-- =====================================================
-- 誰がいつ何を操作したかを記録。
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  ts timestamptz not null default timezone('utc', now()),
  user_email text,
  action text not null,       -- 例: 'save', 'login', 'hrmos_sync', 'confirm_payroll'
  detail text,                -- 詳細テキスト
  meta jsonb                  -- 追加情報（任意）
);

create index if not exists idx_audit_log_ts on public.audit_log (ts desc);

revoke all on table public.audit_log from anon, authenticated;
grant all on table public.audit_log to service_role;
