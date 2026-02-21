# きょうしん輸送 給与計算システム

> **最終更新: 2026-02-21**
> Next.js 15 / React 18 / Supabase / Vercel
> 開発・運用: Claude（Anthropic）との共同作業

---

## 目次

1. [システム概要](#1-システム概要)
2. [ファイル構成](#2-ファイル構成)
3. [ローカル開発環境の起動](#3-ローカル開発環境の起動)
4. [クラウドデプロイ（Vercel + Supabase）](#4-クラウドデプロイvercel--supabase)
5. [環境変数一覧](#5-環境変数一覧)
6. [主要な設計・実装メモ](#6-主要な設計実装メモ)
7. [月次給与計算の業務フロー](#7-月次給与計算の業務フロー)
8. [HRMOS連携の仕様](#8-hrmos連携の仕様)
9. [給与計算ロジック](#9-給与計算ロジック)
10. [既知の仕様・注意事項](#10-既知の仕様注意事項)
11. [今後の課題（残タスク）](#11-今後の課題残タスク)

---

## 1. システム概要

きょうしん輸送株式会社の社内専用給与計算システム。

| 項目 | 内容 |
|------|------|
| 対象会社 | きょうしん輸送株式会社（北海道） |
| 在籍従業員 | 渡会流雅（id:1）・渡曾羊一（id:2）・門馬将太（id:3） |
| 締め日 | 月末 |
| 支給日 | 翌月20日 |
| 社保徴収 | 翌月徴収 |
| 管轄税務署 | 岩見沢税務署 |
| 社会保険 | 協会管掌（北海道）健保5.155% / 介護0.795% / 厚年9.15% |
| 雇用保険 | 一般事業 0.55%（労働者負担） |

---

## 2. ファイル構成

```
/
├── app/
│   ├── page.jsx                    # メインUI（約3,500行）全ページを1ファイルで管理
│   ├── login/page.jsx              # ログイン画面
│   ├── globals.css                 # グローバルスタイル
│   └── api/
│       ├── state/route.js          # 状態保存・読込API（Supabase優先、ファイルフォールバック）
│       ├── state-history/route.js  # バックアップ・履歴API
│       ├── audit/route.js          # 操作ログAPI
│       ├── auth/callback/route.js  # Supabase OAuth コールバック
│       ├── hrmos/sync/route.js     # HRMOS勤怠取込API
│       └── payroll/run-monthly/route.js  # 月次自動計算API
├── lib/
│   ├── payroll-calc.js             # 給与計算ロジック（税額表・社保計算・残業計算）
│   └── supabase-client.js          # Supabaseブラウザクライアント
├── middleware.js                   # 認証ミドルウェア（全ルート保護）
├── supabase/setup.sql              # Supabaseテーブル定義
└── data/payroll-state.json         # ローカルフォールバック用（Vercel環境では使用不可）
```

### page.jsx の主要コンポーネント構成

```
App（ルート）
├── DashboardPage     ダッシュボード（支給日カウントダウン・アラート等）
├── PayrollPage       月次給与計算（HRMOS連携・勤怠入力・計算結果確認・確定）
├── HistoryPage       給与明細一覧（月次スナップショット・Excel/PDF出力）
├── EmployeesPage     従業員管理（マスタ編集・新規登録）
├── LeavePage         有給管理
└── SettingsPage      マスタ設定（会社情報・保険料率・労働条件）
```

---

## 3. ローカル開発環境の起動

```bash
npm install
npm run dev
```

`http://localhost:3000` で表示（`.env` がなければ認証スキップ）。

---

## 4. クラウドデプロイ（Vercel + Supabase）

### Step 1: Supabase セットアップ

1. [supabase.com](https://supabase.com) でプロジェクト作成
2. SQL Editor で `supabase/setup.sql` を実行
3. **Authentication > Providers > Email** → 「Enable Sign Up」を **OFF**（招待制）
4. **Authentication > Users > Add user** でユーザー作成
5. 以下をメモ:
   - **Settings > API**: Project URL（= `SUPABASE_URL`）
   - **Settings > API**: `anon public` key（= `NEXT_PUBLIC_SUPABASE_ANON_KEY`）
   - **Settings > API**: `service_role` key（= `SUPABASE_SERVICE_ROLE_KEY`）

### Step 2: Vercel デプロイ

1. [vercel.com](https://vercel.com) でリポジトリをインポート
2. Environment Variables に[環境変数](#5-環境変数一覧)を設定
3. Deploy → `https://xxxx.vercel.app` でアクセス可能

### デプロイ後の確認

- Vercel → **Deployments** タブで「Ready」になっていることを確認
- Vercel → **Logs** タブでエラーがないことを確認

---

## 5. 環境変数一覧

| 変数名 | 用途 | 必須 |
|--------|------|------|
| `SUPABASE_URL` | Supabase REST API ベースURL | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバーサイド専用キー（状態保存・監査ログ） | ✅ |
| `NEXT_PUBLIC_SUPABASE_URL` | クライアントサイド用（認証フロー） | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | クライアントサイド用（認証フロー） | ✅ |
| `SUPABASE_STATE_TABLE` | 状態保存テーブル名（省略時: `app_state`） | - |
| `SUPABASE_STATE_ROW_ID` | 状態保存レコードID（省略時: `singleton`） | - |

---

## 6. 主要な設計・実装メモ

### 状態管理

- **全データは `app/api/state` 経由で Supabase に1レコード（JSON）として保存**
- フロントエンドは 800ms デバウンスで自動保存（`useEffect` + `setTimeout`）
- ハイドレート直後 2 秒間は自動保存をスキップ（`hydratedAtRef`）
- 二重保存防止のため `isSavingRef` で排他制御

### 認証

- Supabase Auth によるメール/パスワード認証
- `middleware.js` が全ルートを保護（`/login`・`/api/auth/*`・`/icon.svg` は公開）
- ローカル開発時（環境変数なし）は認証スキップ

### スナップショット（確定データ）

給与を「確定」すると `monthlySnapshots[月]` に計算結果が保存される。

```js
// 保存される主要フィールド
toSnapshotRowFromCalc(emp, result, att) => {
  empId, name, basicPay, gross, health, kaigo, pension, employment,
  incomeTax, residentTax, totalDeduct, net,
  incomeTaxOverride,  // 固定所得税設定も保存
  legalOT, prescribedOT, nightOT, holidayOT, ...
}
```

過去スナップショットの読込時は `normalizeSnapshotRow()` で旧フォーマットとの後方互換を保つ。

### 所得税固定上書き（incomeTaxOverride）

従業員マスタの `incomeTaxOverride` フィールド：

- `null` → 月額税額表（甲欄）で自動計算
- 数値（例: `9400`）→ 毎月その金額を固定使用

設定箇所: 従業員管理 → 従業員編集 → 「所得税（固定上書き）」欄

現在の設定: **門馬将太 = 9,400円（税理士指示による手動固定）**

---

## 7. 月次給与計算の業務フロー

```
1. 月次給与計算ページを開く
        ↓
2. 「HRMOSから勤怠取込（プレビュー）」をクリック
        ↓
3. プレビュー内容を確認 → 「この内容を反映」
        ↓
4. 計算結果（総支給・控除・手取り）を目視確認
        ↓
5. 問題なければ「確定する」をクリック
        ↓
6. 給与明細一覧ページで明細を印刷・PDF出力
```

---

## 8. HRMOS連携の仕様

### 接続情報

- Base URL: `https://ieyasu.co`（固定）
- Company URL・API Key: システム内「給与計算」ページの HRMOS 設定欄に保存

### 社員番号の対応表

| 給与計算システムID | 氏名 | HRMOS社員番号 |
|---|---|---|
| 1 | 渡会流雅 | 3 |
| 2 | 渡曾羊一 | 22 |
| 3 | 門馬将太 | 20 |

**重要**: HRMOS上で社員番号（`number`フィールド）が未設定のユーザーは自動スキップされる。
スキップされたユーザーは Vercel Logs に `[HRMOS Skip]` として記録される。

### HRMOS APIから取得するフィールド

| フィールド名 | 内容 | 給与計算項目 |
|---|---|---|
| `excess_of_statutory_working_hours` | 法定外残業（平日） | legalOT の一部 |
| `excess_of_statutory_working_hours_in_holidays` | 法定外残業（休日） | legalOT の一部 |
| `hours_in_statutory_working_hours` | 法定内残業（所定外） | prescribedOT |
| `late_night_overtime_working_hours` | 深夜残業 | nightOT |
| `hours_in_statutory_working_hours_in_holidays` | 休日法定内労働 | holidayOT |
| `actual_working_hours` | 実労働時間 | workHours |

### HRMOS連携後のリセット項目

HRMOS取込時、以下フィールドは **毎回0にリセット**される（前月値の誤引継防止）:
- `otAdjust`（残業手当調整）
- `basicPayAdjust`（基本給調整）
- `otherAllowance`（その他手当）

必要な場合は取込後に手動で入力すること。

---

## 9. 給与計算ロジック

`lib/payroll-calc.js` に集約。MF給与との一致確認済み（2025-11/12支給分）。

### 残業代計算

```
時間単価 = (基本給 + 職務手当) ÷ 月平均所定労働時間
法定外残業代 = 時間単価 × 法定外OT時間 × 1.25
法定内残業代 = 時間単価 × 法定内OT時間 × 1.00
深夜残業代   = 時間単価 × 深夜OT時間   × 1.25
休日労働代   = 時間単価 × 休日OT時間   × 1.35
```

### 社会保険料計算（insRound = 五捨五超入）

```
健康保険料 = 標準報酬月額 × 5.155%（北海道）
介護保険料 = 標準報酬月額 × 0.795%（40歳以上）
厚生年金   = 標準報酬月額 × 9.15%
雇用保険   = 総支給額    × 0.55%（役員は対象外）
```

### 所得税計算

```
課税対象額 = 総支給額 - 社保合計 - 非課税通勤手当
所得税     = 月額税額表（甲欄）で算出（令和7年・8年両対応）
           ※ incomeTaxOverride が設定されている場合はその値を使用
```

### 税額表の切り替え

```js
// payroll-calc.js の taxYearFromPayMonth()
// 支給月が 2026年1月以降 → R8表を使用
// それより前 → R7表を使用
```

---

## 10. 既知の仕様・注意事項

### 渡曾羊一（id:2）について

- 年金受給者・短時間勤務のため雇用保険・厚生年金の対象外
- MF給与との連携で過去に問題があったが、HRMOS社員番号22番を設定後に解消
- HRMOS上の `user_id=22` は伊達良幸（社員番号未設定）のため競合しない

### 門馬将太（id:3）について

- 役員（2025年11月〜）のため雇用保険対象外
- 所得税を 9,400円に固定（税理士指示）→ `incomeTaxOverride: 9400` で設定

### 支給日カウントダウン

翌月20日払いのため、20日を過ぎると自動的に「翌々月20日」までの日数を表示する。

### HRMOS設定の保存

Vercel 環境変数ではなく Supabase の状態データに保存される。
デプロイ後も設定は引き継がれる（状態データが Supabase に保存されているため）。

---

## 11. 今後の課題（残タスク）

### 中優先度

| # | 内容 |
|---|------|
| M-1 | 伊達良幸（新入社員）のマスタ登録・HRMOS連携ID設定 |
| M-2 | 賞与計算UIの実装（計算ロジック自体は `calcBonus()` として実装済み） |
| M-3 | 年末調整UIの実装（ロジックは `calcYearEndAdjustment()` として実装済み） |
| M-4 | 有給管理の付与・消滅ルール自動化 |
| M-5 | 渡曾羊一の法定外残業時間がHRMOS連携で変化する件の継続確認（5.0hが正しい値の可能性大） |

### 低優先度（技術的負債）

| # | 内容 |
|---|------|
| L-1 | `app/page.jsx` の分割（現在約3,500行の単一ファイル） |
| L-2 | TypeScript 化 |
| L-3 | 定数の `constants.js` への抽出 |
| L-4 | 単体テストの追加（特に `payroll-calc.js`） |

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-02-21 | コード全体精査・整合性修正・README刷新 |
| 2026-02-21 | HRMOS社員番号未設定ユーザーの自動スキップ機能追加 |
| 2026-02-21 | 所得税固定上書き（incomeTaxOverride）機能追加 |
| 2026-02-21 | 勤怠入力UI統一（閉じた状態=表示のみ、開いた状態=編集可） |
| 2026-02-21 | 409競合エラーの完全廃止（楽観的ロック削除） |
| 2026-02-20 | 支給日カウントダウンの自動更新修正 |
| 2026-02-20 | HRMOS設定がデプロイ後リセットされる問題の修正 |
