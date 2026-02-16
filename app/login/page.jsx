"use client";

import React, { useState, useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState(""); // "error" | "success"

  // If already logged in, redirect to home
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      // Supabase not configured – redirect to home (local dev mode)
      window.location.href = "/";
      return;
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) window.location.href = "/";
    });
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("認証サービスが設定されていません。");
      setMessageType("error");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage(
        error.message === "Invalid login credentials"
          ? "メールアドレスまたはパスワードが正しくありません。"
          : `ログインエラー: ${error.message}`
      );
      setMessageType("error");
    } else {
      setMessage("ログイン成功！リダイレクトしています...");
      setMessageType("success");
      // Get redirect param
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get("redirect") || "/";
      setTimeout(() => {
        window.location.href = redirect;
      }, 500);
    }
    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>K</div>
          <h1 style={styles.title}>きょうしん輸送</h1>
          <p style={styles.subtitle}>給与計算システム</p>
        </div>

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
              style={styles.input}
              autoComplete="email"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={styles.input}
              autoComplete="current-password"
            />
          </div>

          {message && (
            <div
              style={{
                ...styles.message,
                backgroundColor: messageType === "error" ? "#fef2f2" : "#f0fdf4",
                color: messageType === "error" ? "#dc2626" : "#16a34a",
                borderColor: messageType === "error" ? "#fecaca" : "#bbf7d0",
              }}
            >
              {message}
            </div>
          )}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? "ログイン中..." : "ログイン"}
          </button>
        </form>

        <div style={styles.footer}>
          <p style={styles.footerText}>
            アカウントをお持ちでない場合は管理者にお問い合わせください。
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)",
    padding: 16,
    fontFamily: "'Noto Sans JP', sans-serif",
  },
  card: {
    background: "#fff",
    borderRadius: 16,
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
    padding: "40px 36px",
    width: "100%",
    maxWidth: 400,
  },
  logo: {
    textAlign: "center",
    marginBottom: 32,
  },
  logoIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    background: "linear-gradient(135deg, #2563eb, #7c3aed)",
    color: "#fff",
    fontSize: 24,
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: "#0f172a",
    margin: "4px 0 0",
  },
  subtitle: {
    fontSize: 13,
    color: "#64748b",
    margin: "4px 0 0",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
  },
  input: {
    padding: "10px 14px",
    border: "1.5px solid #e2e8f0",
    borderRadius: 10,
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.2s",
    fontFamily: "'Noto Sans JP', sans-serif",
  },
  message: {
    padding: "10px 14px",
    borderRadius: 10,
    fontSize: 13,
    border: "1px solid",
  },
  button: {
    padding: "12px 0",
    background: "linear-gradient(135deg, #2563eb, #7c3aed)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'Noto Sans JP', sans-serif",
    transition: "opacity 0.2s",
  },
  footer: {
    marginTop: 24,
    textAlign: "center",
  },
  footerText: {
    fontSize: 12,
    color: "#94a3b8",
    margin: 0,
  },
};
