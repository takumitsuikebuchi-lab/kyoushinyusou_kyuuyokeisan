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
