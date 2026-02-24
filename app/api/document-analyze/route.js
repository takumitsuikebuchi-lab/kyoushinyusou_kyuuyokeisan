import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

// ===== Claude API クライアント =====
function getAnthropicClient() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY が設定されていません");
    return new Anthropic({ apiKey });
}

// ===== 書類タイプ別プロンプト =====
const PROMPTS = {
    gensen: `この画像は日本の「源泉徴収票」です。以下の情報を正確に読み取って、JSON形式で返してください。
読み取れない場合は null にしてください。

{
  "支払金額": 数値（円）,
  "源泉徴収税額": 数値（円）,
  "社会保険料等の金額": 数値（円）,
  "生命保険料の控除額": 数値（円）または null,
  "地震保険料の控除額": 数値（円）または null,
  "支払者名": 文字列（会社名）,
  "支払を受ける者の氏名": 文字列（本人名）,
  "支払を受ける者の住所": 文字列または null,
  "控除対象配偶者の有無等": 文字列または null,
  "控除対象扶養親族の数": 数値または null
}

JSONのみを返してください。説明文や前置きは不要です。`,

    mynumber: `この画像はマイナンバー関係書類（マイナンバーカードまたは通知カード）です。以下の情報を読み取ってJSON形式で返してください。
個人番号（マイナンバー）は**セキュリティのため読み取らないでください**。

{
  "氏名": 文字列,
  "生年月日": 文字列（YYYY-MM-DD形式）,
  "住所": 文字列または null,
  "書類種別": "マイナンバーカード" または "通知カード" または "その他"
}

JSONのみを返してください。`,

    fuyou: `この画像は「給与所得者の扶養控除等（異動）申告書」です。以下の情報を読み取ってJSON形式で返してください。

{
  "氏名": 文字列,
  "配偶者の有無": true または false,
  "控除対象扶養親族の人数": 数値,
  "扶養親族一覧": [{"氏名": 文字列, "続柄": 文字列, "生年月日": 文字列}] または [],
  "障害者控除": true または false,
  "寡婦（寡夫）控除": true または false
}

JSONのみを返してください。`,

    resume: `この画像は日本の履歴書または職務経歴書です。以下の情報を読み取ってJSON形式で返してください。

{
  "氏名": 文字列,
  "生年月日": 文字列（YYYY-MM-DD形式）または null,
  "住所": 文字列または null,
  "最終学歴": 文字列または null,
  "前職会社名": 文字列または null（最新の職歴）,
  "前職在職期間": 文字列または null（例: "2018年4月〜2024年3月"）,
  "前職退職理由": 文字列または null
}

JSONのみを返してください。`,

    other: `この書類の内容を簡潔に日本語で要約してください。
書類の種類、主要な情報（金額・日付・氏名など）を箇条書きで返してください。
200文字以内でお願いします。`,
};

// ===== Supabase Storage からファイル取得 =====
async function fetchFileFromSupabase(storagePath) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) return null;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.storage
        .from("employee-documents")
        .download(storagePath);

    if (error || !data) return null;
    return data; // Blob
}

// ===== メインハンドラー =====
export async function POST(req) {
    try {
        const body = await req.json();
        const { storagePath, fileBase64, mimeType, documentType } = body;

        // バリデーション
        if (!documentType) {
            return Response.json({ error: "documentType が必要です" }, { status: 400 });
        }
        if (!fileBase64 && !storagePath) {
            return Response.json({ error: "fileBase64 または storagePath が必要です" }, { status: 400 });
        }

        let imageBase64 = fileBase64;
        let imageMimeType = mimeType || "image/jpeg";

        // Supabase Storage からファイルを取得（fileBase64 がない場合）
        if (!imageBase64 && storagePath) {
            const blob = await fetchFileFromSupabase(storagePath);
            if (!blob) {
                return Response.json({ error: "ファイルの取得に失敗しました" }, { status: 404 });
            }
            const arrayBuffer = await blob.arrayBuffer();
            imageBase64 = Buffer.from(arrayBuffer).toString("base64");
            imageMimeType = blob.type || "application/octet-stream";
        }

        // PDF の場合は直接テキストとして扱う（Claude の vision は画像のみ）
        const isPdf = imageMimeType === "application/pdf" || imageMimeType.includes("pdf");
        if (isPdf) {
            return Response.json({
                success: false,
                error: "PDFファイルは現在サポートされていません。JPG・PNG・GIF 形式の画像に変換してからアップロードしてください。",
                type: documentType,
            });
        }

        const anthropic = getAnthropicClient();
        const prompt = PROMPTS[documentType] || PROMPTS.other;

        // Claude API 呼び出し（vision モード）
        const message = await anthropic.messages.create({
            model: "claude-opus-4-5",
            max_tokens: 1024,
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "image",
                            source: {
                                type: "base64",
                                media_type: imageMimeType,
                                data: imageBase64,
                            },
                        },
                        {
                            type: "text",
                            text: prompt,
                        },
                    ],
                },
            ],
        });

        const rawText = message.content[0]?.text || "";

        // JSON パース試行
        let parsed = null;
        let parseError = null;
        if (documentType !== "other") {
            try {
                // JSON ブロックを抽出（```json ... ``` などの場合も対応）
                const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    parsed = JSON.parse(jsonMatch[0]);
                }
            } catch (e) {
                parseError = "JSON パースに失敗しました";
            }
        }

        return Response.json({
            success: true,
            type: documentType,
            raw: rawText,
            parsed,
            parseError,
        });

    } catch (err) {
        const isApiKeyError = err.message?.includes("API_KEY") || err.status === 401;
        return Response.json({
            success: false,
            error: isApiKeyError
                ? "ANTHROPIC_API_KEY が設定されていないか無効です。Vercel の環境変数を確認してください。"
                : err.message || "解析中にエラーが発生しました",
        }, { status: 500 });
    }
}
