# きょうしん輸送 給与計算プロトタイプ

## 起動
```bash
npm install
npm run dev
```

`http://localhost:3000` で表示されます。

## Supabase運用（推奨）
状態保存API（`/api/state`）は Supabase を優先利用し、未設定時はローカルJSONにフォールバックします。

### 1. テーブル作成
Supabase SQL Editor で以下を実行:
- `supabase/app_state.sql`

### 2. 環境変数設定
`.env.example` を参考に、プロジェクト直下に `.env` を作成:
```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### 3. 既存データを1回移行（任意）
```bash
npm run migrate:state:supabase -- data/payroll-state.json
```

### 4. サービス再デプロイ
```bash
npm run deploy:local
```

これ以降、`http://localhost:3000` の操作内容は Supabase に保存されます。

## 本番運用（毎回手動起動しない）
このプロジェクトは macOS の `launchd` で常駐運用できます。

### 初回セットアップ
```bash
npm run service -- install
```

これでログイン時に自動起動し、停止しても自動再起動されます。  
運用URL: `http://localhost:3000`

補足:
- 実行本体は `~/kyoshin-payroll-runtime` に自動同期されます（Google Drive配下を直接常駐実行しないため）。
- 状態データは `~/kyoshin-payroll-runtime/data/payroll-state.json` を使用します。
- Supabase設定時も、同ファイルにローカルバックアップを保持します。

### 運用コマンド
```bash
# 状態確認
npm run service -- status

# 再起動
npm run service -- restart

# 停止
npm run service -- stop

# ログ確認
npm run service -- logs

# サービス削除
npm run service -- uninstall
```

### 更新反映（コード変更後）
```bash
npm run deploy:local
```
`build` 実行後にサービス再起動まで自動で行います。

## 構成
- `app/page.jsx`: クラウド版 `prototype.jsx` を移植した画面実装
- `app/layout.jsx`: ルートレイアウト
- `app/api/hrmos/sync/route.js`: HRMOS同期API（プロトタイプ）
- `app/api/payroll/run-monthly/route.js`: 月次自動計算API（プロトタイプ）
- `package.json`: Next.js 14 + React 18
- `きょうしん輸送_給与計算WEBシステム_要件定義書_v3.docx`: 要件定義書（原本）
- `きょうしん輸送_給与計算WEBシステム_要件定義書_v3.txt`: 要件定義書（テキスト版）

## 追加した機能
- 従業員一覧で「ドライバー簡易追加」「在籍/退職切替」「削除」
- マスタ設定に「HRMOS API連携設定」「手動同期」「月次自動計算実行」
