"use client";
import React, { useState, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

// ===== 書類タイプ定義（記入ガイド付き） =====
const DOCUMENT_TYPES = [
    {
        id: "gensen",
        label: "前職の源泉徴収票",
        icon: "📋",
        description: "前の会社から受け取った源泉徴収票",
        acceptImages: true,
        guide: {
            purpose: "年末調整・住民税設定に使用します",
            fields: [
                { fieldName: "支払金額", location: "源泉徴収票の左上「支払金額」欄", usedFor: "前職の年間給与収入として年末調整の計算に使用", inputTarget: "（年末調整時にシステムへ入力）" },
                { fieldName: "源泉徴収税額", location: "源泉徴収票の「源泉徴収税額」欄", usedFor: "年末調整で精算する所得税額の計算に使用", inputTarget: "（年末調整時にシステムへ入力）" },
                { fieldName: "社会保険料等の金額", location: "源泉徴収票の「社会保険料等の金額」欄", usedFor: "年末調整の社会保険料控除額として使用", inputTarget: "（年末調整時にシステムへ入力）" },
                { fieldName: "住民税（特別徴収額）", location: "源泉徴収票には記載なし。市区町村から通知が来る", usedFor: "このシステムの従業員情報「住民税（月額）」欄に設定", inputTarget: "従業員一覧 → 該当者 → 住民税（月額）欄" },
            ],
        },
    },
    {
        id: "mynumber",
        label: "マイナンバー関係書類",
        icon: "🪪",
        description: "マイナンバーカードのコピー、または通知カード＋身分証",
        acceptImages: true,
        guide: {
            purpose: "社会保険の届出・年末調整・源泉徴収票の作成に必要",
            fields: [
                { fieldName: "個人番号（12桁）", location: "マイナンバーカード表面 または 通知カードの「個人番号」欄", usedFor: "社会保険（健康保険・厚生年金・雇用保険）の各届出書のマイナンバー欄", inputTarget: "各届出書に手書きで記入（本システムには入力不要）" },
                { fieldName: "氏名・生年月日・住所", location: "マイナンバーカード表面", usedFor: "各届出書の従業員情報欄と照合・転記", inputTarget: "届出書に手書きで記入。このシステムの従業員名と一致しているか確認" },
            ],
        },
    },
    {
        id: "fuyou",
        label: "扶養控除等（異動）申告書",
        icon: "👨‍👩‍👧",
        description: "入社時に本人が記入して提出する書類",
        acceptImages: true,
        guide: {
            purpose: "所得税の源泉徴収税額（毎月の天引き額）の計算に使用",
            fields: [
                { fieldName: "扶養親族の人数", location: "申告書の「控除対象扶養親族」欄に記載されている人数", usedFor: "毎月の所得税計算の「扶養人数」として使用", inputTarget: "従業員一覧 → 該当者 → 「扶養人数」欄" },
                { fieldName: "配偶者の有無", location: "申告書の「控除対象配偶者」欄", usedFor: "配偶者がいる場合は扶養人数に含める", inputTarget: "従業員一覧 → 該当者 → 「扶養人数」欄に含めてカウント" },
            ],
        },
    },
    {
        id: "resume",
        label: "履歴書・職務経歴書",
        icon: "📄",
        description: "採用書類として保管。給与設定の参考に",
        acceptImages: true,
        guide: {
            purpose: "直接給与計算には使いません。雇用契約の内容の根拠として保管",
            fields: [
                { fieldName: "前職の会社名・在職期間", location: "履歴書の職歴欄", usedFor: "雇用保険の加入期間確認（資格取得届の記入時に参照）", inputTarget: "雇用保険 被保険者資格取得届の「前職の有無」欄を確認" },
            ],
        },
    },
    {
        id: "other",
        label: "その他の書類",
        icon: "📁",
        description: "上記以外の書類（健康診断書、資格証明書 など）",
        acceptImages: true,
        guide: { purpose: "参考保管用", fields: [] },
    },
];

// ===== AI解析結果の表示コンポーネント =====
const AIResult = ({ result, documentType }) => {
    if (!result) return null;
    const { parsed, raw, error } = result;

    if (error) {
        return (
            <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, fontSize: 12, color: "#dc2626" }}>
                ⚠️ {error}
            </div>
        );
    }

    return (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "14px 16px", marginTop: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#15803d", marginBottom: 10 }}>
                🤖 AI解析結果
            </div>

            {/* 源泉徴収票の場合：整形表示 */}
            {documentType === "gensen" && parsed && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[
                        { label: "支払金額（年収）", key: "支払金額", unit: "円", highlight: true },
                        { label: "源泉徴収税額", key: "源泉徴収税額", unit: "円" },
                        { label: "社会保険料等の金額", key: "社会保険料等の金額", unit: "円" },
                        { label: "支払者（前職会社名）", key: "支払者名", unit: "" },
                        { label: "本人氏名（確認用）", key: "支払を受ける者の氏名", unit: "" },
                        { label: "扶養親族数", key: "控除対象扶養親族の数", unit: "人" },
                    ].map(({ label, key, unit, highlight }) => {
                        const val = parsed[key];
                        if (val === null || val === undefined) return null;
                        return (
                            <div key={key} style={{
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                padding: "6px 10px", background: highlight ? "#dcfce7" : "white",
                                border: "1px solid #bbf7d0", borderRadius: 6,
                            }}>
                                <span style={{ fontSize: 12, color: "#374151" }}>{label}</span>
                                <span style={{ fontSize: 13, fontWeight: 700, color: highlight ? "#15803d" : "#1e293b" }}>
                                    {typeof val === "number" ? `${val.toLocaleString()}${unit}` : `${val}${unit}`}
                                </span>
                            </div>
                        );
                    })}
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, padding: "6px 10px", background: "#eff6ff", borderRadius: 6, border: "1px solid #bfdbfe" }}>
                        ➡ <strong>次のアクション：</strong>源泉徴収税額・社会保険料等の金額は年末調整時に入力します。住民税は市区町村の「特別徴収税額決定通知書」を確認して従業員設定に入力してください。
                    </div>
                </div>
            )}

            {/* 扶養控除申告書の場合 */}
            {documentType === "fuyou" && parsed && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[
                        { label: "本人氏名", key: "氏名", unit: "" },
                        { label: "配偶者あり", key: "配偶者の有無", unit: "", isBool: true },
                        { label: "扶養親族人数", key: "控除対象扶養親族の人数", unit: "人" },
                        { label: "障害者控除", key: "障害者控除", unit: "", isBool: true },
                    ].map(({ label, key, unit, isBool }) => {
                        const val = parsed[key];
                        if (val === null || val === undefined) return null;
                        return (
                            <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "white", border: "1px solid #bbf7d0", borderRadius: 6 }}>
                                <span style={{ fontSize: 12, color: "#374151" }}>{label}</span>
                                <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                                    {isBool ? (val ? "あり" : "なし") : `${val}${unit}`}
                                </span>
                            </div>
                        );
                    })}
                    {parsed["控除対象扶養親族の人数"] !== null && (
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, padding: "6px 10px", background: "#eff6ff", borderRadius: 6, border: "1px solid #bfdbfe" }}>
                            ➡ <strong>次のアクション：</strong>扶養人数「{parsed["控除対象扶養親族の人数"]}人」+ 配偶者「{parsed["配偶者の有無"] ? "あり" : "なし"}」を確認して、従業員一覧の「扶養人数」欄に設定してください。
                        </div>
                    )}
                </div>
            )}

            {/* マイナンバー・履歴書・その他：生テキスト表示 */}
            {(documentType === "mynumber" || documentType === "resume" || documentType === "other" || !parsed) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {parsed && Object.entries(parsed).map(([key, val]) => (
                        val !== null && val !== undefined ? (
                            <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "6px 10px", background: "white", border: "1px solid #bbf7d0", borderRadius: 6, gap: 10 }}>
                                <span style={{ fontSize: 12, color: "#374151", flexShrink: 0 }}>{key}</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", textAlign: "right" }}>{String(val)}</span>
                            </div>
                        ) : null
                    ))}
                    {(!parsed || Object.keys(parsed).length === 0) && (
                        <div style={{ fontSize: 12, color: "#374151", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{raw}</div>
                    )}
                </div>
            )}
        </div>
    );
};

// ===== メインコンポーネント =====
export const DocumentUploadPanel = ({ employeeId, employeeName }) => {
    const [selectedType, setSelectedType] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [errorMsg, setErrorMsg] = useState("");
    const [showGuide, setShowGuide] = useState(null);
    const fileInputRef = useRef(null);

    // ファイルを base64 に変換
    const toBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file || !selectedType) return;
        setErrorMsg("");
        setUploading(true);

        try {
            const base64 = await toBase64(file);
            let storagePath = null;

            // Supabase Storage へアップロード
            try {
                const supabase = getSupabaseBrowserClient();
                if (supabase) {
                    const ext = file.name.split(".").pop();
                    storagePath = `documents/${employeeId || "unknown"}/${selectedType}/${Date.now()}.${ext}`;
                    await supabase.storage.from("employee-documents").upload(storagePath, file, { upsert: false });
                }
            } catch (_) { /* Supabase未設定でも続行 */ }

            setUploadedFiles(prev => [...prev, {
                name: file.name,
                type: selectedType,
                mimeType: file.type,
                base64,
                storagePath,
                size: file.size,
                uploadedAt: new Date().toISOString(),
                aiResult: null,
            }]);
        } catch (err) {
            setErrorMsg(`ファイルの読み込みに失敗しました: ${err.message}`);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    // AI解析を実行
    const handleAnalyze = async (fileIndex) => {
        const f = uploadedFiles[fileIndex];
        if (!f) return;
        setAnalyzing(true);
        setErrorMsg("");

        try {
            const res = await fetch("/api/document-analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fileBase64: f.base64,
                    mimeType: f.mimeType,
                    storagePath: f.storagePath,
                    documentType: f.type,
                }),
            });
            const data = await res.json();
            setUploadedFiles(prev => prev.map((item, i) =>
                i === fileIndex ? { ...item, aiResult: data } : item
            ));
            // 解析結果を自動展開
            setShowGuide(fileIndex);
        } catch (err) {
            setErrorMsg(`AI解析中にエラーが発生しました: ${err.message}`);
        } finally {
            setAnalyzing(false);
        }
    };

    const selectedTypeData = DOCUMENT_TYPES.find(t => t.id === selectedType);

    return (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, marginTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#1e293b", marginBottom: 4 }}>
                📂 書類アップロード＆AI入力サポート
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
                {employeeName ? `【${employeeName}】の書類` : "入社者から受け取った書類"}をアップロードすると、🤖 AIが内容を読み取り「どの欄に何を入力するか」を具体的に案内します。
            </div>

            {/* 書類タイプ選択 */}
            <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>① アップロードする書類の種類を選択</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {DOCUMENT_TYPES.map(t => (
                        <button key={t.id} onClick={() => { setSelectedType(t.id); setShowGuide(null); }}
                            style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                                fontWeight: 600, fontSize: 12,
                                background: selectedType === t.id ? "#dbeafe" : "white",
                                border: `1.5px solid ${selectedType === t.id ? "#2563eb" : "#e2e8f0"}`,
                                color: selectedType === t.id ? "#1d4ed8" : "#374151",
                                transition: "all 0.15s",
                            }}>
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 選択された書類の説明 */}
            {selectedTypeData && (
                <div style={{ padding: "10px 14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, marginBottom: 14, fontSize: 12, color: "#1d4ed8" }}>
                    {selectedTypeData.icon} <strong>{selectedTypeData.label}</strong>：{selectedTypeData.description}
                    <span style={{ marginLeft: 8, fontSize: 11, background: "#dbeafe", borderRadius: 4, padding: "1px 6px" }}>
                        JPG / PNG 推奨（PDF不可）
                    </span>
                </div>
            )}

            {/* ファイルアップロード */}
            {selectedType && (
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>② ファイルを選択してアップロード → AIが自動解析</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.gif,.webp"
                            onChange={handleFileSelect} style={{ display: "none" }} id="doc-upload-input" />
                        <label htmlFor="doc-upload-input" style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            padding: "8px 16px", background: uploading ? "#94a3b8" : "#2563eb",
                            color: "white", borderRadius: 8, cursor: uploading ? "not-allowed" : "pointer",
                            fontWeight: 600, fontSize: 13, transition: "background 0.15s",
                        }}>
                            {uploading ? "⏳ 読み込み中..." : "📎 画像ファイルを選択"}
                        </label>
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>アップロード後、すぐにAI解析を実行できます</span>
                    </div>
                    {errorMsg && <div style={{ marginTop: 6, fontSize: 12, color: "#dc2626", fontWeight: 600 }}>{errorMsg}</div>}
                </div>
            )}

            {/* アップロード済み書類一覧 */}
            {uploadedFiles.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>アップロード済み書類</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {uploadedFiles.map((f, i) => {
                            const typeData = DOCUMENT_TYPES.find(t => t.id === f.type);
                            const hasResult = !!f.aiResult;
                            return (
                                <div key={i} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                                    {/* ファイルヘッダー */}
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", gap: 8, flexWrap: "wrap" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                            <span style={{ fontSize: 16 }}>{typeData?.icon || "📁"}</span>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                                                <div style={{ fontSize: 11, color: "#64748b" }}>{typeData?.label} {f.storagePath ? "✓ Supabase保存済み" : "（ローカル）"}</div>
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                            {/* AI解析ボタン */}
                                            <button
                                                onClick={() => handleAnalyze(i)}
                                                disabled={analyzing}
                                                style={{
                                                    fontSize: 11, padding: "5px 12px",
                                                    background: hasResult ? "#d1fae5" : "#1d4ed8",
                                                    border: `1px solid ${hasResult ? "#6ee7b7" : "#1e40af"}`,
                                                    borderRadius: 6, cursor: analyzing ? "not-allowed" : "pointer",
                                                    fontWeight: 700, color: hasResult ? "#065f46" : "white",
                                                    transition: "all 0.15s",
                                                }}
                                            >
                                                {analyzing ? "⏳ 解析中..." : hasResult ? "✅ 解析済み（再解析）" : "🤖 AI解析"}
                                            </button>
                                            {/* ガイドボタン */}
                                            <button
                                                onClick={() => setShowGuide(showGuide === i ? null : i)}
                                                style={{
                                                    fontSize: 11, padding: "5px 10px",
                                                    background: showGuide === i ? "#dbeafe" : "#f1f5f9",
                                                    border: `1px solid ${showGuide === i ? "#bfdbfe" : "#e2e8f0"}`,
                                                    borderRadius: 6, cursor: "pointer", fontWeight: 600,
                                                    color: showGuide === i ? "#1d4ed8" : "#374151",
                                                }}
                                            >
                                                📖 ガイド {showGuide === i ? "▲" : "▼"}
                                            </button>
                                        </div>
                                    </div>

                                    {/* ガイド＋AI結果 */}
                                    {showGuide === i && (
                                        <div style={{ padding: "0 12px 12px" }}>
                                            {/* AI解析結果 */}
                                            {f.aiResult && <AIResult result={f.aiResult} documentType={f.type} />}

                                            {/* 静的ガイド */}
                                            {typeData?.guide && (
                                                <div style={{ marginTop: f.aiResult ? 12 : 0, padding: "12px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8 }}>
                                                    <div style={{ fontWeight: 700, fontSize: 12, color: "#92400e", marginBottom: 6 }}>
                                                        📌 記入ガイド：{typeData.guide.purpose}
                                                    </div>
                                                    {typeData.guide.fields.map((field, fi) => (
                                                        <div key={fi} style={{ background: "white", border: "1px solid #fde68a", borderRadius: 6, padding: "8px 10px", marginBottom: 6 }}>
                                                            <div style={{ fontWeight: 700, fontSize: 11, color: "#1e293b" }}>📋 {field.fieldName}</div>
                                                            <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.6 }}>
                                                                <div>🔍 {field.location}</div>
                                                                <div>💡 {field.usedFor}</div>
                                                                <div style={{ marginTop: 3, padding: "3px 6px", background: "#dbeafe", borderRadius: 4, color: "#1d4ed8", fontWeight: 600, display: "inline-block" }}>
                                                                    ➡ {field.inputTarget}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 書類タイプのみのガイド（アップロード前） */}
            {selectedType && uploadedFiles.filter(f => f.type === selectedType).length === 0 && selectedTypeData && (
                <div>
                    <button onClick={() => setShowGuide(showGuide === "preview" ? null : "preview")}
                        style={{ fontSize: 12, padding: "5px 12px", background: "white", border: "1px solid #fde68a", borderRadius: 6, cursor: "pointer", fontWeight: 600, color: "#92400e" }}>
                        📖 入力ガイドを確認 {showGuide === "preview" ? "▲" : "▼"}
                    </button>
                    {showGuide === "preview" && selectedTypeData.guide.fields.length > 0 && (
                        <div style={{ marginTop: 8, padding: "12px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8 }}>
                            <div style={{ fontWeight: 700, fontSize: 12, color: "#92400e", marginBottom: 6 }}>
                                📌 {selectedTypeData.guide.purpose}
                            </div>
                            {selectedTypeData.guide.fields.map((field, fi) => (
                                <div key={fi} style={{ background: "white", border: "1px solid #fde68a", borderRadius: 6, padding: "8px 10px", marginBottom: 6 }}>
                                    <div style={{ fontWeight: 700, fontSize: 11, color: "#1e293b" }}>📋 {field.fieldName}</div>
                                    <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.6 }}>
                                        <div>🔍 {field.location}</div>
                                        <div>💡 {field.usedFor}</div>
                                        <div style={{ marginTop: 3, padding: "3px 6px", background: "#dbeafe", borderRadius: 4, color: "#1d4ed8", fontWeight: 600, display: "inline-block" }}>
                                            ➡ {field.inputTarget}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
