# AI間引き継ぎドキュメント（Handoff）

> **最終更新**: 2026-02-22
> **最終更新者**: Antigravity
> **最終コミット**: 運用改善フェーズ1完了: PayrollPage import修正・確定ロック・月次チェックリスト追加
> **ステータス**: 運用改善フェーズ1完了。次は(D)賞与計算UIまたは(E)年末調整UIの実装。

---

## 🔁 引き継ぎルール（必読）

> **このセクションは Claude Code / Codex 共通のルールです。作業を開始する前に必ず読んでください。**

### ルール1: 作業開始時にこのファイルを読む

- 作業を始める前に、まずこの `HANDOFF.md` を最初に読むこと
- 「2. 現在の状況」を確認し、完了済みの修正を壊さないようにすること
- 「8. 過去の落とし穴」は必ず目を通す（同じミスを繰り返さないため）

### ルール2: 作業完了時にこのファイルを更新してコミットする

作業が終わったら（途中であっても中断する場合）、以下を更新してからコミット・プッシュすること：

1. **ヘッダー部分**: `最終更新`, `最終更新者`, `最終コミット`, `ステータス` を更新
2. **セクション2「現在の状況」**: 完了した項目を「完了済み」テーブルに移動。新たな残課題があれば追記
3. **セクション8「落とし穴」**: 作業中に発見した注意点があれば追記
4. **セクション9「変更履歴」**: 日付・変更内容を1行追加

### ルール3: 更新フォーマット

```markdown
> **最終更新**: YYYY-MM-DD
> **最終更新者**: [Claude Code / Codex]
> **最終コミット**: `コミットメッセージの要約`
> **ステータス**: [現在の状態を1行で記述]
```

### ルール4: コンフリクト防止

- **このファイルの既存の記述を削除しない**（追記のみ）
- 「完了済み」テーブルの項目は消さない
- 「落とし穴」は番号を継続して追記する

### ルール5: 中断時のルール

作業を完了できずに中断する場合：

- 「ステータス」に何の作業中だったかを明記する（例: `workDaysカウントのMF照合中 — segment_titleの分析まで完了`）
- 残課題テーブルに、中断した作業の具体的な続きを記載する

### ルール6: AI間同期パケットを必ず残す

作業完了時は、次のAIが最短で着手できるよう、`0. クイックステータス` を更新すること。

- `現在ブランチ`
- `最新コミット`
- `次に着手する課題`
- `プレビューURL`
- `検証結果`

---

## 0. クイックステータス（最短把握）

- 現在ブランチ: `main`
- 最新コミット: 運用改嚄フェーズ1: PayrollPage import修正・確定ロック・月次チェックリスト
- 次に着手する課題: (D) 賞与計算UI または (E) 年末調整UI
- プレビューURL: `http://localhost:3000`
- 検証結果: `npm run build` 成功（Next.js 15.5.12）。`npm audit` 脆弱性0件。Middleware 81.9 kB。

### AI間共通プロトコル（Codex / Cloud Code）

1. 作業開始直後に `git pull --ff-only` を実行。
2. このファイルの `0. クイックステータス` と `2. 現在の状況` だけ先に読む。
3. 残課題は「優先度 高 → 中 → 低」で着手し、対象1件を完了させる。
4. 完了時は `0. クイックステータス`、ヘッダー、`2`、`8`、`9` を更新。
5. コミットメッセージは `fix:` / `feat:` / `docs:` で始める。
6. push後、次のAI向けに「次の1アクション」を `ステータス` に1行で書く。

## 1. プロジェクト概要

きょうしん輸送の給与計算システム（Next.js 15.5.12 + React 18）。
**目的**: `HRMOS勤怠 → 本システム → 給与明細` でマネーフォワードクラウド給与と同一の計算結果を再現する。

### 技術スタック

- Next.js 15.5.12 (App Router) / React 18
- 計算ロジック: `lib/payroll-calc.js` に集約（月次・賞与・年末調整・税額表）
- データ永続化: `data/payroll-state.json` (JSONファイル) / Supabase対応準備済み
- 認証: Supabase Auth（middleware.js）/ ローカルはバイパス
- 外部連携: HRMOS勤怠 (IEYASU) REST API

---

## 2. 現在の状況（何が完了し、何が残っているか）

### 完了済み ✅

| 項目 | 詳細 |
|------|------|
| HRMOS APIページネーション | `limit=100` + `X-Total-Page` ヘッダーで全ページ取得 |
| 法定内残業フィールド修正 | `hours_in_statutory_working_hours` (HH:MM形式) を使用 |
| 令和8年分月額税額表 | 232エントリのテーブルルックアップ + 740,000円以上は電算機計算の特例 |
| 自動計算のフロントエンド一本化 | `calcPayroll()` のみ使用、APIの重複ロジック廃止 |
| HRMOS同期→計算のタイミング修正 | `attendanceOverride` で直接渡し、React state未反映問題を回避 |
| スナップショット後方互換 | `normalizeSnapshotRow()` で旧形式→新形式変換 |
| 従業員IDの衝突防止 | `number` 空の場合 `hrmos_` プレフィックス付与 |
| workDays集計の休日除外 | `segment_title` が休日系（休日/祝日/公休/振替休日）の実労働日は `workDays` に加算しない |
| 引き継ぎプロトコル強化 | `0. クイックステータス` と `AI間共通プロトコル` を追加し、Codex/Cloud Code間の再説明コストを削減 |
| 新プレビューURL追加 | `app/preview-20260211/page.jsx` を追加し、確認用URLを固定化 |
| スナップショット更新導線追加 | 履歴画面に「この月を再計算して更新」ボタンを追加（現在対象月のみ有効） |
| 2026-01スナップショット更新確認 | プレビュー画面上で再計算実行後に情報反映を確認済み |
| HRMOS従業員名マッチング再実装 | ID不一致時に「1件だけ一致する氏名」で従業員IDへマッピングして勤怠反映 |
| 渡曾/門馬の主要照合チェック追加 | 履歴画面にMF照合チェックカードを追加（厚生年金/雇用保険/健保介護合算） |
| MF元CSV突合レポート実装 | 履歴画面でCSV取込時に総額差分（総支給/控除/差引）と従業員別差分を可視化。CSVのみ/システムのみの従業員も検知 |
| 伊達良幸の従業員仮登録 | HRMOS user_id=22 を `hrmos_22` IDで `payroll-state.json` に登録。基本給・保険は未設定（UIから編集可能） |
| run-monthly API廃止 | 旧計算ロジック(173行)を廃止スタブ(HTTP 410)に置換。フロントエンド `calcPayroll()` に完全一本化 |
| HRMOS未登録従業員の自動仮登録 | 同期時に未登録従業員を従業員マスタと有給残日数へ自動追加。IDはHRMOS employeeId（例: `hrmos_22`）を使用 |
| 2026-01例外条件の確認 | 渡会流雅（MINT出向）・門馬将太（役員報酬固定）はHRMOS連携値と一致しない前提でユーザー合意。通常月突合対象から除外 |
| 通常月CSV突合（2025-11/12支給） | 全3名（渡会流雅・渡曾羊一・門馬将太）× 2ヶ月 × 全項目（総支給・社保・所得税・住民税・差引支給）がMFと完全一致。R7税額表使用で検証 |
| 入退社ワークフロー追加 | 従業員一覧に「設定未完了一覧」「テンプレ即適用」「退社処理/在籍復帰」「退職日編集」を追加し、入退社運用の手戻りを削減 |
| UI/UX全面改善+不具合修正 | (1)新規登録IDの文字列ID安全対処 (2)従業員削除に確認ダイアログ (3)DetailPanelに休日OT表示追加 (4)`btn-outline`CSS追加 (5)設定ページ保存ボタンを自動保存バッジに修正 (6)insights控除額チェックロジック修正 (7)normalizeSnapshotRow冗長修正。UIは入退社ワークフローカード・従業員ステータスピル・有給色分け・空ステート・ダッシュボードリマインダー表示・給与計算ヘッダー・履歴ページアクション統合などを改善 |
| HRMOS A操作の堅牢化 | ID一致→プレビュー→適用→未紐付けキュー→自動計算のフローをf99ebedで実装。Supabaseバックエンド追加 |
| Supabase永続化サポート | `app/api/state/route.js` がSupabase優先・ローカルフォールバック。`supabase/app_state.sql`、`scripts/migrate-state-to-supabase.mjs` 追加 |
| launchd サービス管理 | `scripts/service-launchd.sh`（install/start/stop/restart/logs）、`scripts/deploy-local.sh`、`scripts/prepare-runtime.sh` |
| Next.js 14.2.35 アップデート | 14.2.26→14.2.35。CVE-2025-30218等のセキュリティ修正を適用。残りの脆弱性は16.x必要で保留 |
| lib/ Phase 1 リファクタ | 純粋ロジック（給与計算・税額表・等級表・日付ユーティリティ・HRMOS マッチング・CSVパーサー）を `lib/` に切り出し |
| コード品質改善 | preview-20260211のmetadata/useClient矛盾修正、API Key入力のpassword化、addDriverの勤怠初期化漏れ修正、PDF出力のfmt関数シャドウイング修正、auto-saveのデバウンス最適化(500→800ms) |
| Supabase Auth 認証機能 | `middleware.js` で全ルートを保護。未認証→`/login` リダイレクト、API→401。`@supabase/ssr` + `@supabase/supabase-js` 使用 |
| ログインUI | `app/login/page.jsx` にメール/パスワードログイン画面。きょうしん輸送ブランドデザイン。招待制（セルフサインアップなし想定） |
| ログアウト機能 | Nav にユーザーメール表示 + ログアウトボタン追加。`getSupabaseBrowserClient()` 経由で `signOut()` |
| API認証保護 | middleware で `/api/state`、`/api/hrmos/sync` 等を保護。未認証API呼び出しは 401 JSON |
| クラウドデプロイ対応 | `/api/state` のファイル書込を read-only FS 対応に改善。Supabase未設定時はエラーメッセージ明確化 |
| jsconfig.json パスエイリアス | `@/*` → `./*` のパスマッピング追加。`lib/` インポートを `@/lib/` 形式で統一 |
| lib/payroll-calc.js ロジック統合 | R7税額表（`TAX_TABLE_R7`）追加、`taxYearFromPayMonth()` で支給年ベースの税表切替、`calcBonus()` / `calcBonusTax()` 賞与計算、`calcYearEndAdjustment()` 年末調整。page.jsx の import を lib/ に切替済み |
| 監査ログ UI (AuditLogPanel) | `/api/audit` からSupabaseの監査ログを取得・表示するコンポーネント。Collapsible内に配置 |
| バックアップ/ロールバック UI (BackupPanel) | `/api/state-history` と連携。スナップショット保存・一覧表示・復元機能。App下部にCollapsible内配置 |
| /api/audit API | Supabase `audit_log` テーブルへのGET（一覧）・POST（書込）。未接続時は空配列返却 |
| /api/state-history API | Supabase `state_history` テーブルへのGET（一覧）・POST（保存+プルーニング）・PUT（復元）。MAX_HISTORY=50 |
| Next.js 15.5.12 アップグレード | 14.2.35→15.5.12。`npm audit` 脆弱性0件達成。ビルド成功確認済み（Middleware 82 kB） |
| app/icon.svg 追加 | ファビコンSVG追加 |
| supabase/setup.sql 更新 | `audit_log` / `state_history` テーブル定義を追加 |
| taxYearFromPayMonth 実接続（課題C） | page.jsx 内の全7箇所の `calcPayroll()` 呼出に `{ taxYear: taxYearFromPayMonth(month) }` を追加。`buildInsights` に `payrollMonth` 引数を追加。2025年支給→R7表、2026年支給→R8表が正しく適用される |
| Vercelデプロイ + Supabase本番セットアップ | vercel.json設定済み、Supabase Auth・DB・バックアップ機能実装済み。既存データ移行完了 |
| **page.jsx コンポーネント分割（D-1）** | Nav / HistoryPage / LeavePage / AuditLogPanel / BackupPanel を app/components/ に分割。1,625行 → 513行 |
| 運用改嚄フェーズ1 | ① PayrollPage の taxYearFromPayMonth importを正しい payroll-calc へ修正（ビルド警告解消）。② 確定取消に確認ダイアログ追加。③ 重大チェック時に「確定する」ボタンをブロック。④ 月次作業5ステップチェックリストUI追加。 |

### 検証結果（渡会流雅 2026年1月）

```
総支給額:   386,909円 ✅ (MF一致)
所得税:      11,490円 ✅ (MF一致)
差引支給額: 323,098円 ✅ (MF一致)
社会保険計:  39,321円 ✅ (MF一致)
```

### 検証結果（通常月CSV突合 2025-11/12支給）

```
■ 2025-11支給 (10月勤務分)
  渡会流雅: 総支給383,731 社保39,304 税12,100 差引319,327 ✅全項目MF一致
  渡曾羊一: 総支給100,000 社保5,361  税440    差引94,199  ✅全項目MF一致
  門馬将太: 総支給370,000 社保57,380 税9,400  差引303,220 ✅全項目MF一致

■ 2025-12支給 (11月勤務分)
  渡会流雅: 総支給339,380 社保39,060 税8,420  差引278,900 ✅全項目MF一致
  渡曾羊一: 総支給115,012 社保5,361  税1,240  差引108,411 ✅全項目MF一致
  門馬将太: 総支給370,000 社保57,380 税9,400  差引303,220 ✅全項目MF一致

※ 所得税は令和7年分の月額税額表（R2-R7共通）で照合。
   R7テーブル（TAX_TABLE_R7）はlib/payroll-calc.jsに実装済み。
   taxYearFromPayMonth()で支給年に応じR7/R8を自動切替。
```

### 残課題 / 今後の作業 📋

| 優先度 | ID | 項目 | 詳細 |
|--------|-----|------|------|
| **中** | D | **賞与計算 UI ページ** | `calcBonus()` / `calcBonusTax()` は lib/payroll-calc.js に実装済み。Nav に「賞与」タブ追加、賞与額入力→計算→明細表示の画面を作成 |
| **中** | E | **年末調整 UI ページ** | `calcYearEndAdjustment()` は lib/payroll-calc.js に実装済み。年間集計→控除入力→過不足精算の画面を作成 |
| **中** | G | **データ定数の lib/ 移動** | `INITIAL_EMPLOYEES`, `INITIAL_ATTENDANCE`, `INITIAL_MASTER_SETTINGS` 等がpage.jsx内に残存。`lib/constants.js` へ移動 |
| **中** | — | 伊達良幸の正式データ設定 | 仮登録済み（ID: `hrmos_22`）。ユーザーから正式値共有後に基本給・標準報酬・保険を更新する |
| **低** | J | State管理改善 | App本体のuseState群（20以上）を useReducer/Zustand 等で整理 |
| **低** | K | Next.js 16.x 移行検討 | 15.5.12で脆弱性0件達成済み。16.xは破壊的変更あり、現時点で緊急性なし |
| **低** | — | カスタムドメイン設定 | Vercelデプロイ後、独自ドメイン（例: payroll.kyoshin-yusou.co.jp）をDNS設定で紐付け |

### ユーザー提供済みデータ（通常月検証用）

- `/Users/takumitsu/Downloads/確定結果_2025年11月20日支給 (1).csv`（2025-10勤務分）
- `/Users/takumitsu/Downloads/確定結果_2025年12月20日支給 (1).csv`（2025-11勤務分）
- `/Users/takumitsu/Downloads/確定結果_2026年01月20日支給.csv`（2025-12勤務分、ただし渡会/門馬の例外条件あり）

---

## 3. アーキテクチャ・ファイル構成

```
app/
  page.jsx                          ← メイン（UI・状態管理。計算ロジックは lib/ から import）
  layout.jsx                        ← RootLayout（metadata・フォント）
  login/page.jsx                    ← ログイン画面（Supabase Auth）
  login/layout.jsx                  ← ログインレイアウト
  preview-20260211/page.jsx         ← プレビュー用ルート
  icon.svg                          ← ファビコン
  api/
    audit/route.js                  ← 監査ログAPI（Supabase audit_log）
    auth/callback/route.js          ← OAuth/マジックリンクコールバック
    hrmos/sync/route.js             ← HRMOS API連携（認証・取得・変換）
    payroll/run-monthly/route.js    ← 旧自動計算API（410 Gone スタブ）
    state/route.js                  ← 状態保存（Supabase優先・ファイルフォールバック）
    state-history/route.js          ← バックアップ/ロールバックAPI（Supabase state_history）
middleware.js                       ← 認証ミドルウェア（全ルート保護）
lib/
  index.js                          ← バレルエクスポート
  payroll-calc.js                   ← 給与計算エンジン・R7/R8税額表・等級表・賞与計算・年末調整
  date-utils.js                     ← 日付ユーティリティ・汎用ヘルパー
  hrmos-matching.js                 ← HRMOSマッチングロジック
  csv-parser.js                     ← CSVパーサー
  supabase-client.js                ← ブラウザ用Supabaseクライアント（シングルトン）
  supabase-server.js                ← サーバー用Supabaseクライアント（Cookie管理）
scripts/
  deploy-local.sh                   ← ローカルデプロイ
  prepare-runtime.sh                ← ランタイム準備
  service-launchd.sh                ← launchd サービス管理
  run-prod.sh                       ← 本番起動
  migrate-state-to-supabase.mjs     ← JSON→Supabase移行
supabase/
  app_state.sql                     ← Supabaseテーブル定義
  setup.sql                         ← Auth + テーブル セットアップガイド
data/
  payroll-state.json                ← 全データ永続化（ローカルバックアップ）
```

### 計算フロー

```
HRMOS API → sync/route.js (認証→取得→変換) → page.jsx onHrmosSync()
  → attendance state更新 → calcPayroll() → スナップショット保存
```

### 重要な関数

| 関数 | ファイル | 役割 |
|------|---------|------|
| `calcPayroll(emp, att, settings, options?)` | lib/payroll-calc.js | **唯一の給与計算エンジン**。`options.taxYear` で税表切替 |
| `estimateTax(taxable, deps, taxYear?)` | lib/payroll-calc.js | R7/R8月額税額表ルックアップ。taxYear未指定時はR8 |
| `taxYearFromPayMonth(payMonth)` | lib/payroll-calc.js | 支給月→税年判定（暦年ベース） |
| `calcBonus(emp, bonusAmt, prevGross, settings)` | lib/payroll-calc.js | 賞与計算（社保・税額・手取） |
| `calcBonusTax(bonusAmt, prevSocialDeducted, deps, settings, emp)` | lib/payroll-calc.js | 賞与の源泉徴収税額 |
| `calcYearEndAdjustment(annualIncome, ...)` | lib/payroll-calc.js | 年末調整の過不足額計算 |
| `onHrmosSync()` | app/page.jsx | HRMOS同期+勤怠データ反映 |
| `onRunAutoCalc(attendanceOverride?)` | app/page.jsx | フロントエンド自動計算 |
| `transformAttendanceData(hrmosData)` | api/hrmos/sync/route.js | HRMOS日次→月次集計 |

---

## 4. HRMOS APIフィールドマッピング（実データ検証済み）

> ⚠️ **重要**: フィールド名は実際のHRMOS APIレスポンスで確認済み。推測ではない。

| HRMOSフィールド | 型 | 意味 | マッピング先 |
|-----------------|-----|------|-------------|
| `hours_in_statutory_working_hours` | "HH:MM" | **法定内残業（所定外・法定内）** | `prescribedOT` |
| `excess_of_statutory_working_hours` | "HH:MM" | **法定外残業（平日）** | `legalOT` |
| `excess_of_statutory_working_hours_in_holidays` | "HH:MM" | 法定外残業（休日） | `legalOT` に加算 |
| `late_night_overtime_working_hours` | "HH:MM" | **深夜残業** | `nightOT` |
| `hours_in_statutory_working_hours_in_holidays` | "HH:MM" | 休日法定内労働 | `holidayOT` |
| `actual_working_hours` | "HH:MM" | 実労働時間 | workDays判定に使用 |
| `hours_in_prescribed_working_hours` | "HH:MM" | 所定内労働時間 | 未使用 |
| `daytime_prescribed_work_time` | number(秒) | 所定内労働時間(秒) | **使用しない**（25200=7h） |
| `segment_title` | string | 勤務区分名 | 休日/有給/欠勤判定 |
| `number` | string | HRMOS従業員番号 | employeeId |
| `user_id` | number | HRMOSユーザーID | フォールバックID |

### 残業の計算方式（MFと同一）

```
法定外残業手当 = hourly × legalOT × 1.25
法定内残業手当 = hourly × prescribedOT × 1.00
深夜残業手当   = hourly × nightOT × 1.25
休日労働手当   = hourly × holidayOT × 1.35
hourly = (basicPay + dutyAllowance) / avgMonthlyHours
```

---

## 5. 税額計算

### 税額表（`estimateTax` 関数 — lib/payroll-calc.js）

- **令和7年分 (`TAX_TABLE_R7`)**: 2025年支給分に適用
- **令和8年分 (`TAX_TABLE_R8`)**: 2026年支給分に適用
- `taxYearFromPayMonth(payMonth)` で支給年から自動判定（暦年ベース）
- **R7**: 88,000円未満は税額0、テーブル236エントリ、扶養1人あたり△1,580円、電算機特例の基礎控除40,000円/月
- **R8**: 105,000円未満は税額0、テーブル232エントリ、扶養1人あたり△1,610円、電算機特例の基礎控除48,334円/月
- **740,000円以上**: 電算機計算の特例（速算表は共通、基礎控除が税年で異なる）

### 賞与の税額（`calcBonusTax` / `calcBonus` — lib/payroll-calc.js）

- `BONUS_TAX_RATE_TABLE` で前月社保控除後給与に応じた税率を決定
- 標準賞与額（千円未満切捨て）に社保料率を適用
- ⚠️ **UI未実装** — ロジックのみ。画面は課題D

### 社会保険料

```
健康保険 = insRound(stdMonthly × 5.155%)
介護保険 = insRound(stdMonthly × 0.795%)  ※hasKaigo=trueの場合のみ
厚生年金 = insRound(stdMonthly × 9.15%)   ※hasPension=trueの場合のみ
雇用保険 = insRound(gross × 0.55%)        ※hasEmployment=trueの場合のみ
```

`insRound` = 五捨五超入（50銭以下切捨て、50銭超切上げ）

---

## 6. 従業員データ

| ID | 名前 | 基本給 | 職務手当 | 月平均H | 標準報酬 | 備考 |
|----|------|--------|----------|---------|----------|------|
| 3 | 渡会流雅 | 210,000 | 10,000 | 173 | 260,000 | ドライバー、検証済み |
| 22 | 渡曾羊一 | 100,000 | 0 | 89.1 | 104,000 | 短時間勤務、年金受給者 |
| 20 | 門馬将太 | 370,000 | 0 | 173 | 380,000 | 役員、介護保険あり |

### HRMOS IDマッピング

| 本システムID | HRMOSユーザーID | HRMOS number | 名前 |
|-------------|----------------|-------------|------|
| 3 | 7 | 3 | 渡会流雅 |
| 22 | 21 | 22 | 渡曾羊一 |
| 20 | 25 | 20 | 門馬将太 |
| (未登録) | 22 | (空) | 伊達良幸 → hrmos_22 |

---

## 7. 開発環境

```bash
# 開発サーバー起動
cd "マイドライブ/Arenge Work/システム関係/給与計算システム"
npm run dev
# → http://localhost:3000

# HRMOS同期テスト（API直接呼び出し）
curl -s -X POST http://localhost:3000/api/hrmos/sync \
  -H 'Content-Type: application/json' \
  -d '{"baseUrl":"https://ieyasu.co","companyUrl":"kyou1122_-","apiKey":"[payroll-state.jsonのapiKey]","targetMonth":"2026-01"}'
```

---

## 8. 過去の落とし穴・注意点

1. **`daytime_prescribed_work_time` は法定内残業ではない** — 所定内労働時間(秒単位)。法定内残業は `hours_in_statutory_working_hours`。
2. **HRMOS APIのデフォルトlimitは25** — `?limit=100&page=N` が必須。ページネーションなしだと月のデータが欠損する。
3. **React stateは即座に反映されない** — `setAttendance()` 直後に `attendance` を参照すると古い値。`attendanceOverride` を直接渡す。
4. **MFは月額税額表を使う** — 電算機計算の特例ではない。特に中間的な金額帯で数千円の差が出る。
5. **従業員IDの衝突** — HRMOS `number` が空の従業員の `user_id` が他従業員の `number` と偶然一致しうる。
6. **timeToMinutes は型チェック必須** — HRMOSは同じ概念のフィールドでも "HH:MM" 文字列と秒数(number)が混在する。
7. **workDaysはactual_working_hoursだけで判定しない** — MF表示合わせでは休日系勤務区分（休日/祝日/公休/振替休日）を出勤日数から除外する。
8. **プレビュー崩れ時は新ルートで切り分ける** — 既存URLで表示崩れが出た場合は `/preview-YYYYMMDD` を追加して同一実装を別URLで確認する。
9. **履歴画面の再計算は現在対象月のみ** — 過去月の正確な再計算に必要な当時勤怠がないため、ボタンは `payrollTargetMonth` 以外では無効化している。
10. **氏名マッチングは一意一致のみ使用** — 同姓同名などで複数一致する場合は誤紐付けを避けるためIDマッチのみで処理する。
11. **門馬の健保+介護22,610円チェックは2026-01専用** — 料率変更が入る月では期待値が変わるため固定値判定は月指定で使う。
12. **CSV突合は「選択中の月優先」で判定する** — 取込ファイルに選択中の月がなければ先頭CSVの月で突合するため、メッセージの「突合: YYYY年MM月」を必ず確認する。
13. **伊達良幸のIDは文字列 `hrmos_22`** — HRMOS `number` が空のため `hrmos_` プレフィックス付きuser_id。従業員マスタのIDも文字列型で統一すること。
14. **run-monthly APIは廃止済み** — `/api/payroll/run-monthly` は HTTP 410 を返すスタブに置換済み。給与計算は必ずフロントエンドの `calcPayroll()` を使用する。
15. **自動仮登録直後は必ず正式値に更新する** — 自動仮登録は `基本給=0 / 標準報酬月額=0 / 保険OFF` のため、そのまま計算すると過小計算になる。従業員一覧で正式値を入力してから確定すること。
16. **2026-01は通常突合に使わない** — 渡会流雅（MINT出向）と門馬将太（役員報酬固定）はHRMOS連携と一致しない業務運用。通常月連携の検証母集団から除外する。
17. **支給日CSVと勤務月の対応に注意** — 例: `2025-11-20支給` は `2025-10勤務分`。履歴画面の対象月選択とCSV月の対応を揃えて比較すること。
18. **税額表は支給年で切り替わる** — 2025年支給は令和7年分（R2-R7共通）、2026年支給は令和8年分。R7/R8両方実装済み。`taxYearFromPayMonth()` で支給年に応じ自動切替。全 `calcPayroll()` 呼出に `{ taxYear }` を接続済み。
19. **MFのCSV「健康保険料」欄は介護保険込みの場合がある** — 門馬将太のように介護保険ありの従業員では、CSV「健康保険料」列に健保+介護の合算値が入り「介護保険料」列は空になる。突合時は合算で比較すること。
20. **退社処理ボタンは雇用保険を自動OFFにする** — 従業員一覧の「退社処理」は `status=退職` と `leaveDate` 設定に加え `hasEmployment=false` に変更する。退職後の雇保控除を防ぐため。
21. **新規登録のID採番は数値IDのみを参照する** — `hrmos_22` のような文字列IDが混在するため、`Math.max()` の対象を `typeof e.id === "number"` でフィルタすること。修正済み（v3.1）。
22. **preview-20260211/page.jsx でmetadataを定義しない** — `use client` コンポーネントをimportするページで`export const metadata` を使うとエラー。修正済み。
23. **exportAllPayslipsPdfの中でfmt関数を再宣言しない** — module スコープの `fmt` と衝突してPDF出力で数値フォーマットが壊れる可能性がある。`fmtCell` に改名済み。
24. **addDriverの勤怠初期化はEMPTY_ATTENDANCEを使う** — `{workDays:0, legalOT:0, ...}` のように一部フィールドだけ指定すると `scheduledDays`, `workHours` 等が undefined になりNaN表示の原因。修正済み。
25. **Supabase環境変数はlaunchd plistに含まれない** — `.env` ファイルをプロジェクトルートに置けばNext.jsが自動読み込み。`prepare-runtime.sh` が `.env` をrsync対象に含むことを確認済み。
26. **lib/ の関数は page.jsx 内にもコピーが残っている** — Phase 1では `lib/` に分離コピーを作成。page.jsxからの import 切替は Phase 2 以降で段階的に実施予定。切替時にテスト回帰に注意。
27. **Supabase環境変数は2種類必要** — server-side用（`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`）と client-side用（`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`）。`NEXT_PUBLIC_` 接頭辞がないとブラウザで参照不可。
28. **認証なしのローカル開発も可能** — `NEXT_PUBLIC_SUPABASE_URL` が未設定なら middleware は認証チェックをスキップする。ローカルで `.env` を設定しなければ従来通り認証なしで動作。
29. **Vercelはファイルシステムが読み取り専用** — `/api/state` の PUT はSupabase書込成功後のローカルバックアップ書込が失敗しても無視する。Supabase未設定のまま Vercel にデプロイするとデータ保存できない。
30. **セルフサインアップは無効にすること** — Supabase Dashboard > Authentication > Providers > Email > "Enable Sign Up" をOFFにしないと誰でもアカウント作成可能になる。招待制運用を想定。
31. **taxYearFromPayMonth は接続済み** — 全7箇所の `calcPayroll()` 呼出に `{ taxYear: taxYearFromPayMonth(month) }` を追加済み（課題C完了）。`buildInsights` にも `payrollMonth` 引数を追加。
32. **calcBonus / calcYearEndAdjustment は UI 未実装** — lib/payroll-calc.js にロジックのみ存在。page.jsx にはまだ賞与入力画面・年末調整画面がない。

---

## 9. 変更履歴

| 日付 | 変更内容 |
|------|---------|
| 2026-02-17 | **課題C完了: taxYearFromPayMonth 実接続**: page.jsx 内の全7箇所の `calcPayroll()` 呼出に `{ taxYear: taxYearFromPayMonth(month) }` を追加。`buildInsights` に `payrollMonth` 引数を追加。HANDOFF.md のコミットハッシュ `e7c4191` 追記、Next.js 15.5.12 表記統一、セクション5の税額表パラメータ詳細化、落とし穴#18/#31更新。lib/payroll-calc.js の全項目精査完了（R7税表・taxYearFromPayMonth・calcBonus・calcBonusTax・calcYearEndAdjustment — 全てOK） |
| 2026-02-16 | **大規模リファクタリング**: lib/payroll-calc.js に R7税表・taxYearFromPayMonth・calcBonus・calcBonusTax・calcYearEndAdjustment を追加。page.jsx から lib/ の import に切替。AuditLogPanel・BackupPanel UI 追加。/api/audit・/api/state-history API 新設。Next.js 14.2.35→15.5.12（脆弱性0件）。app/icon.svg・supabase/setup.sql 更新。styles.css に監査ログ/バックアップ用スタイル追加 |
| 2026-02-16 | Supabase Auth 認証機能追加: `middleware.js`（全ルート保護）、`app/login/page.jsx`（ログインUI）、`lib/supabase-client.js`/`supabase-server.js`（Supabaseクライアント）、`app/api/auth/callback/route.js`（OAuthコールバック） |
| 2026-02-16 | クラウドデプロイ対応: Nav にログアウトボタン追加、`/api/state` のread-only FS対応、`jsconfig.json` に `@/` パスエイリアス追加、`.env.example` にクライアント側変数追加 |
| 2026-02-16 | `@supabase/supabase-js` + `@supabase/ssr` パッケージ追加。バージョン v3.1→v3.2 |
| 2026-02-16 | Next.js 14.2.26→14.2.35 セキュリティアップデート（CVE-2025-30218他、14.x系最新） |
| 2026-02-16 | Phase 1 リファクタ: 純粋ロジックを `lib/` に切り出し（payroll-calc.js, date-utils.js, hrmos-matching.js, csv-parser.js） |
| 2026-02-16 | バグ修正: preview-20260211の metadata/useClient矛盾、addDriver勤怠初期化不完全、PDF出力のfmt関数シャドウイング |
| 2026-02-16 | セキュリティ改善: HRMOS API Key入力をpassword typeに変更 |
| 2026-02-16 | 品質改善: auto-saveデバウンス500ms→800ms、migrate-state-to-supabase.mjsのエラーハンドリング強化 |
| 2026-02-16 | HANDOFF.md を全面更新: Supabase/launchd/lib構成/残課題を追記。アーキテクチャ図を最新化 |
| 2026-02-13 | UI/UX全面改善: ワークフローカード刷新、ステータスピル追加、有給色分け、空ステート改善、DetailPanel休日OT追加、不具合7件修正（ID安全化・削除確認・CSS・insights・設定保存・snapshot正規化） |
| 2026-02-13 | 従業員一覧に入退社ワークフローを追加（設定未完了一覧、テンプレ即適用、退社処理/在籍復帰、退職日編集） |
| 2026-02-13 | 通常月CSV突合完了: 2025-11/12支給（10/11月勤務分）全3名×全項目MF完全一致。R7税額表（国税庁Excel）で所得税も検証 |
| 2026-02-13 | 1月給与の例外条件（渡会/門馬）を明記し、通常月突合の対象を2025-10/2025-11勤務分CSVに更新 |
| 2026-02-13 | HRMOS同期時、未登録従業員を自動仮登録する処理を追加（従業員マスタ・有給残日数へ自動追加） |
| 2026-02-13 | 伊達良幸を従業員マスタに仮登録（hrmos_22、基本給・保険未設定）。run-monthly APIを廃止スタブに置換 |
| 2026-02-11 | 履歴画面にMF元CSV突合レポートを追加（総額差分・従業員別差分、CSV片側欠損の検知） |
| 2026-02-11 | 履歴画面にMF照合チェック（渡曾/門馬の主要項目）を追加 |
| 2026-02-11 | HRMOS同期で従業員名マッチングを再実装（ID不一致時の一意氏名マッチを許可） |
| 2026-02-11 | 履歴画面に「この月を再計算して更新」ボタンを追加し、現在対象月のスナップショット更新導線を実装 |
| 2026-02-11 | AI間引き継ぎプロトコルを強化（クイックステータス/共通プロトコル整備）、新プレビュールート `/preview-20260211` 追加 |
| 2026-02-11 | workDays集計ロジックを修正（休日系segment_titleを出勤日数から除外） |
| 2026-02-11 | ページネーション対応、法定内残業フィールド修正、R8税額表、フロント一本化、ID衝突防止 |
| 2026-02-10 | 初期HRMOS連携実装、基本的な勤怠データ取得 |
