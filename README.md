# きょうしん輸送 給与計算プロトタイプ

## 起動
```bash
npm install
npm run dev
```

`http://localhost:3000` で表示されます。

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
