import "../styles.css";

export const metadata = {
  title: "きょうしん輸送 給与計算システム",
  description: "勤怠連動型 給与計算WEBシステム プロトタイプ",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
