# きょうしん輸送 給与計算システム

## ローカル開発
```bash
npm install
npm run dev
```
`http://localhost:3000` で表示されます（認証なしで動作）。

---

## クラウドデプロイ（Vercel + Supabase）

複数人がブラウザからアクセスできるクラウド運用方式です。

### Step 1: Supabase プロジェクト作成

1. [supabase.com](https://supabase.com) でアカウント作成 → 「New Project」
2. SQL Editor で `supabase/setup.sql` を実行（テーブル作成）
3. **Authentication > Providers > Email** で:
   - 「Enable Sign Up」を **OFF** にする（招待制にするため）
4. **Authentication > Users > Add user** で利用者のメール/パスワードを作成
5. 以下の値をメモ:
   - **Settings > API**: `Project URL`（= SUPABASE_URL）
   - **Settings > API**: `anon public` key（= NEXT_PUBLIC_SUPABASE_ANON_KEY）
   - **Settings > API**: `service_role` key（= SUPABASE_SERVICE_ROLE_KEY）

### Step 2: Vercel にデプロイ

1. [vercel.com](https://vercel.com) にGitHubアカウントでログイン
2. 「Import Project」→ このリポジトリを選択
3. **Environment Variables** に以下を設定:

| 変数名 | 値 |
|--------|-----|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...`（service_role key） |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co`（同じ値） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...`（anon key） |

4. 「Deploy」→ 完了後に `https://xxxx.vercel.app` でアクセス可能

### Step 3: 既存データを移行（任意）

ローカルに `data/payroll-state.json` がある場合:
```bash
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
npm run migrate:state:supabase -- data/payroll-state.json
```

### 運用URL

デプロイ完了後のURL（例）:
- `https://kyoshin-payroll.vercel.app`（Vercel自動割り当て）
- 独自ドメインも設定可能（Vercel > Settings > Domains）

---

## ローカル本番運用（macOS launchd）

Mac上で常駐運用する場合（従来方式）:

### 初回セットアップ
```bash
npm run service -- install
```
運用URL: `http://localhost:3000`

### 運用コマンド
```bash
npm run service -- status     # 状態確認
npm run service -- restart    # 再起動
npm run service -- stop       # 停止
npm run service -- logs       # ログ確認
npm run service -- uninstall  # サービス削除
```

### 更新反映
```bash
npm run deploy:local
```

---

## 認証

- クラウドデプロイ時: Supabase Auth によるメール/パスワード認証
- ローカル開発時（`.env` なし）: 認証なしで全ページアクセス可能
- ユーザー管理: Supabase Dashboard > Authentication > Users から追加/削除

## 構成
- `app/page.jsx`: メインUI・計算ロジック
- `app/login/page.jsx`: ログイン画面
- `middleware.js`: 認証ミドルウェア（全ルート保護）
- `app/api/state/route.js`: 状態保存API（Supabase優先）
- `app/api/hrmos/sync/route.js`: HRMOS勤怠同期API
- `lib/`: 給与計算・税額表・マッチング等の純粋ロジック

## 追加した機能
- Supabase Auth 認証（ログイン/ログアウト/API保護）
- 従業員一覧で「ドライバー簡易追加」「在籍/退職切替」「削除」
- マスタ設定に「HRMOS API連携設定」「手動同期」「月次自動計算実行」
- 給与明細一覧にExcel・PDF一括出力
- MF元CSV突合レポート
- 入退社ワークフロー
