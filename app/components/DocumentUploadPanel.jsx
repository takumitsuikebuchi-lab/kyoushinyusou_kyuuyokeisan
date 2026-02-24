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
        guide: {
            purpose: "年末調整・住民税設定に使用します",
            fields: [
                {
                    fieldName: "支払金額",
                    location: "源泉徴収票の左上「支払金額」欄",
                    usedFor: "前職の年間給与収入として年末調整の計算に使用",
                    inputTarget: "（年末調整時にシステムへ入力）",
                },
                {
                    fieldName: "源泉徴収税額",
                    location: "源泉徴収票の「源泉徴収税額」欄",
                    usedFor: "年末調整で精算する所得税額の計算に使用",
                    inputTarget: "（年末調整時にシステムへ入力）",
                },
                {
                    fieldName: "社会保険料等の金額",
                    location: "源泉徴収票の「社会保険料等の金額」欄",
                    usedFor: "年末調整の社会保険料控除額として使用",
                    inputTarget: "（年末調整時にシステムへ入力）",
                },
                {
                    fieldName: "住民税（特別徴収額）",
                    location: "源泉徴収票には記載なし。市区町村から通知が来る",
                    usedFor: "このシステムの従業員情報「住民税（月額）」欄に設定",
                    inputTarget: "従業員一覧 → 該当者 → 住民税（月額）欄",
                },
            ],
        },
    },
    {
        id: "mynumber",
        label: "マイナンバー関係書類",
        icon: "🪪",
        description: "マイナンバーカードのコピー、または通知カード＋身分証",
        guide: {
            purpose: "社会保険の届出・年末調整・源泉徴収票の作成に必要",
            fields: [
                {
                    fieldName: "個人番号（12桁）",
                    location: "マイナンバーカード表面 または 通知カードの「個人番号」欄",
                    usedFor: "社会保険（健康保険・厚生年金・雇用保険）の各届出書のマイナンバー欄",
                    inputTarget: "各届出書に手書きで記入（本システムには入力不要）",
                },
                {
                    fieldName: "氏名・生年月日・住所",
                    location: "マイナンバーカード表面",
                    usedFor: "各届出書の従業員情報欄と照合・転記",
                    inputTarget: "届出書に手書きで記入。このシステムの従業員名と一致しているか確認",
                },
            ],
        },
    },
    {
        id: "fuyou",
        label: "扶養控除等（異動）申告書",
        icon: "👨‍👩‍👧",
        description: "入社時に本人が記入して提出する書類",
        guide: {
            purpose: "所得税の源泉徴収税額（毎月の天引き額）の計算に使用",
            fields: [
                {
                    fieldName: "扶養親族の人数",
                    location: "申告書の「控除対象扶養親族」欄に記載されている人数",
                    usedFor: "毎月の所得税計算の「扶養人数」として使用",
                    inputTarget: "従業員一覧 → 該当者 → 「扶養人数」欄（入社登録フォームにも入力可）",
                },
                {
                    fieldName: "配偶者の有無",
                    location: "申告書の「控除対象配偶者」欄",
                    usedFor: "配偶者がいる場合は扶養人数に含める",
                    inputTarget: "従業員一覧 → 該当者 → 「扶養人数」欄に含めてカウント",
                },
            ],
        },
    },
    {
        id: "resume",
        label: "履歴書・職務経歴書",
        icon: "📄",
        description: "採用書類として保管。給与設定の参考に",
        guide: {
            purpose: "直接給与計算には使いません。雇用契約の内容の根拠として保管",
            fields: [
                {
                    fieldName: "前職の会社名・在職期間",
                    location: "履歴書の職歴欄",
                    usedFor: "雇用保険の加入期間確認（資格取得届の記入時に参照）",
                    inputTarget: "雇用保険 被保険者資格取得届の「前職の有無」欄を確認",
                },
            ],
        },
    },
    {
        id: "other",
        label: "その他の書類",
        icon: "📁",
        description: "上記以外の書類（健康診断書、資格証明書 など）",
        guide: {
            purpose: "参考保管用",
            fields: [],
        },
    },
];

// ===== メインコンポーネント =====
export const DocumentUploadPanel = ({ employeeId, employeeName }) => {
    const [selectedType, setSelectedType] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [errorMsg, setErrorMsg] = useState("");
    const [showGuide, setShowGuide] = useState(null);
    const fileInputRef = useRef(null);

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file || !selectedType) return;
        setErrorMsg("");
        setUploading(true);

        try {
            const supabase = getSupabaseBrowserClient();
            if (!supabase) {
                // Supabase未接続の場合はローカルで記録のみ
                setUploadedFiles(prev => [...prev, {
                    name: file.name,
                    type: selectedType,
                    size: file.size,
                    uploadedAt: new Date().toISOString(),
                    local: true,
                }]);
                setUploading(false);
                return;
            }

            const ext = file.name.split(".").pop();
            const path = `documents/${employeeId || "unknown"}/${selectedType}/${Date.now()}.${ext}`;
            const { error } = await supabase.storage.from("employee-documents").upload(path, file, { upsert: false });

            if (error) {
                setErrorMsg(`アップロードに失敗しました: ${error.message}`);
            } else {
                setUploadedFiles(prev => [...prev, {
                    name: file.name,
                    type: selectedType,
                    path,
                    size: file.size,
                    uploadedAt: new Date().toISOString(),
                }]);
            }
        } catch (err) {
            setErrorMsg(`エラー: ${err.message}`);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const selectedTypeData = DOCUMENT_TYPES.find(t => t.id === selectedType);

    return (
        <div style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 20,
            marginTop: 16,
        }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#1e293b", marginBottom: 4 }}>
                📂 書類アップロード＆入力サポート
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
                {employeeName ? `【${employeeName}】の書類` : "入社者から受け取った書類"}をアップロードすると、どの欄に何を入力すればいいか案内します。
            </div>

            {/* 書類タイプ選択 */}
            <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>① アップロードする書類の種類を選択</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {DOCUMENT_TYPES.map(t => (
                        <button
                            key={t.id}
                            onClick={() => { setSelectedType(t.id); setShowGuide(null); }}
                            style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                                fontWeight: 600, fontSize: 12,
                                background: selectedType === t.id ? "#dbeafe" : "white",
                                border: `1.5px solid ${selectedType === t.id ? "#2563eb" : "#e2e8f0"}`,
                                color: selectedType === t.id ? "#1d4ed8" : "#374151",
                                transition: "all 0.15s",
                            }}
                        >
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 選択された書類の説明 */}
            {selectedTypeData && (
                <div style={{
                    padding: "10px 14px", background: "#eff6ff",
                    border: "1px solid #bfdbfe", borderRadius: 8, marginBottom: 14,
                    fontSize: 12, color: "#1d4ed8",
                }}>
                    {selectedTypeData.icon} <strong>{selectedTypeData.label}</strong>：{selectedTypeData.description}
                </div>
            )}

            {/* ファイルアップロード */}
            {selectedType && (
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>② ファイルを選択してアップロード</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc"
                            onChange={handleFileSelect}
                            style={{ display: "none" }}
                            id="doc-upload-input"
                        />
                        <label
                            htmlFor="doc-upload-input"
                            style={{
                                display: "inline-flex", alignItems: "center", gap: 6,
                                padding: "8px 16px", background: "#2563eb", color: "white",
                                borderRadius: 8, cursor: uploading ? "not-allowed" : "pointer",
                                fontWeight: 600, fontSize: 13,
                                opacity: uploading ? 0.6 : 1,
                                transition: "opacity 0.15s",
                            }}
                        >
                            {uploading ? "⏳ アップロード中..." : "📎 ファイルを選択"}
                        </label>
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>PDF / 画像 / Word / Excel 対応</span>
                    </div>
                    {errorMsg && <div style={{ marginTop: 6, fontSize: 12, color: "#dc2626", fontWeight: 600 }}>{errorMsg}</div>}
                </div>
            )}

            {/* アップロード済み書類一覧 */}
            {uploadedFiles.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>アップロード済み書類</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {uploadedFiles.map((f, i) => {
                            const typeData = DOCUMENT_TYPES.find(t => t.id === f.type);
                            return (
                                <div key={i} style={{
                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                    padding: "8px 12px", background: "white", border: "1px solid #e2e8f0",
                                    borderRadius: 8, gap: 8, flexWrap: "wrap",
                                }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                        <span style={{ fontSize: 16 }}>{typeData?.icon || "📁"}</span>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                                            <div style={{ fontSize: 11, color: "#64748b" }}>{typeData?.label} {f.local ? "（ローカル記録のみ）" : "✓ Supabase保存済み"}</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowGuide(showGuide === i ? null : i)}
                                        style={{
                                            flexShrink: 0, fontSize: 11, padding: "4px 10px",
                                            background: showGuide === i ? "#dbeafe" : "#f1f5f9",
                                            border: `1px solid ${showGuide === i ? "#bfdbfe" : "#e2e8f0"}`,
                                            borderRadius: 6, cursor: "pointer", fontWeight: 600,
                                            color: showGuide === i ? "#1d4ed8" : "#374151",
                                        }}
                                    >
                                        📖 入力ガイド {showGuide === i ? "▲" : "▼"}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 入力ガイド表示 */}
            {showGuide !== null && uploadedFiles[showGuide] && (() => {
                const f = uploadedFiles[showGuide];
                const typeData = DOCUMENT_TYPES.find(t => t.id === f.type);
                if (!typeData) return null;
                return (
                    <div style={{
                        padding: "14px 16px", background: "#fffbeb",
                        border: "1px solid #fde68a", borderRadius: 10,
                        marginBottom: 12,
                    }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#92400e", marginBottom: 8 }}>
                            {typeData.icon} {typeData.label} の入力ガイド
                        </div>
                        <div style={{ fontSize: 12, color: "#78350f", marginBottom: 10 }}>
                            📌 目的：{typeData.guide.purpose}
                        </div>
                        {typeData.guide.fields.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {typeData.guide.fields.map((field, fi) => (
                                    <div key={fi} style={{
                                        background: "white", border: "1px solid #fde68a",
                                        borderRadius: 8, padding: "10px 12px",
                                    }}>
                                        <div style={{ fontWeight: 700, fontSize: 12, color: "#1e293b", marginBottom: 4 }}>
                                            📋 {field.fieldName}
                                        </div>
                                        <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.6 }}>
                                            <div>🔍 <strong>書類上の場所：</strong>{field.location}</div>
                                            <div>💡 <strong>何に使うか：</strong>{field.usedFor}</div>
                                            <div style={{ marginTop: 4, padding: "4px 8px", background: "#dbeafe", borderRadius: 5, color: "#1d4ed8", fontWeight: 600 }}>
                                                ➡ 入力先：{field.inputTarget}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ fontSize: 12, color: "#78350f" }}>この書類は参考保管用です。直接給与計算への入力は不要です。</div>
                        )}
                    </div>
                );
            })()}

            {/* 書類タイプのみのガイド（アップロード前でも参照可） */}
            {selectedType && !uploadedFiles.some(f => f.type === selectedType) && selectedTypeData && (
                <div>
                    <button
                        onClick={() => setShowGuide(showGuide === "preview" ? null : "preview")}
                        style={{
                            fontSize: 12, padding: "5px 12px",
                            background: "white", border: "1px solid #fde68a",
                            borderRadius: 6, cursor: "pointer", fontWeight: 600, color: "#92400e",
                        }}
                    >
                        📖 アップロード前に入力ガイドを確認 {showGuide === "preview" ? "▲" : "▼"}
                    </button>
                    {showGuide === "preview" && (
                        <div style={{
                            marginTop: 8, padding: "14px 16px", background: "#fffbeb",
                            border: "1px solid #fde68a", borderRadius: 10,
                        }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: "#92400e", marginBottom: 8 }}>
                                {selectedTypeData.icon} {selectedTypeData.label} の入力ガイド
                            </div>
                            <div style={{ fontSize: 12, color: "#78350f", marginBottom: 10 }}>
                                📌 目的：{selectedTypeData.guide.purpose}
                            </div>
                            {selectedTypeData.guide.fields.length > 0 ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {selectedTypeData.guide.fields.map((field, fi) => (
                                        <div key={fi} style={{
                                            background: "white", border: "1px solid #fde68a",
                                            borderRadius: 8, padding: "10px 12px",
                                        }}>
                                            <div style={{ fontWeight: 700, fontSize: 12, color: "#1e293b", marginBottom: 4 }}>
                                                📋 {field.fieldName}
                                            </div>
                                            <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.6 }}>
                                                <div>🔍 <strong>書類上の場所：</strong>{field.location}</div>
                                                <div>💡 <strong>何に使うか：</strong>{field.usedFor}</div>
                                                <div style={{ marginTop: 4, padding: "4px 8px", background: "#dbeafe", borderRadius: 5, color: "#1d4ed8", fontWeight: 600 }}>
                                                    ➡ 入力先：{field.inputTarget}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ fontSize: 12, color: "#78350f" }}>この書類は参考保管用です。直接給与計算への入力は不要です。</div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
