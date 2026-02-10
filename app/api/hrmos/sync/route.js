import { NextResponse } from "next/server";

/**
 * HRMOS認証: Secret KeyでBasic認証してトークンを取得
 */
async function authenticateHrmos(baseUrl, companyUrl, apiKey) {
  // Secret Keyはそのまま使用（既にBase64エンコード済みの形式）
  const authHeader = `Basic ${apiKey}`;
  const url = `${baseUrl}/api/${companyUrl}/v1/authentication/token`;

  console.log(`[HRMOS Auth] URL: ${url}`);
  console.log(`[HRMOS Auth] Authorization: Basic ${apiKey.substring(0, 10)}...`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`認証失敗: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  return data.token;
}

/**
 * 月次勤怠データを取得
 */
async function fetchMonthlyAttendance(baseUrl, companyUrl, token, month) {
  const url = `${baseUrl}/api/${companyUrl}/v1/work_outputs/monthly/${month}`;

  console.log(`[HRMOS Fetch] URL: ${url}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`勤怠データ取得失敗: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}

/**
 * 時間文字列（"HH:MM"）を分に変換
 */
function timeToMinutes(timeStr) {
  if (!timeStr || timeStr === '0:00' || timeStr === '00:00') return 0;
  const parts = timeStr.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

/**
 * HRMOSのデータを給与計算用フォーマットに変換
 * HRMOS APIは日次データを返すので、ユーザーごとに月次集計する
 */
function transformAttendanceData(hrmosData) {
  if (!Array.isArray(hrmosData)) {
    return [];
  }

  // ユーザーIDごとにグループ化
  const userMap = new Map();

  hrmosData.forEach(record => {
    const userId = record.user_id;

    if (!userMap.has(userId)) {
      userMap.set(userId, {
        employeeId: userId,
        employeeNumber: record.number, // HRMOS の従業員番号
        employeeName: record.full_name || record.user_name,
        workDays: 0,
        totalWorkMinutes: 0,
        overtimeMinutes: 0,
        lateNightMinutes: 0,
        absenceDays: 0,
        paidLeaveDays: 0,
        records: []
      });
    }

    const user = userMap.get(userId);

    // 実働時間がある日をカウント
    const actualWorkMinutes = timeToMinutes(record.actual_working_hours);
    if (actualWorkMinutes > 0) {
      user.workDays++;
    }

    // 各時間を累積
    user.totalWorkMinutes += actualWorkMinutes;
    user.overtimeMinutes += timeToMinutes(record.excess_of_statutory_working_hours);
    user.lateNightMinutes += timeToMinutes(record.late_night_overtime_working_hours);

    // 有給休暇のチェック（segment_titleが「有給」等の場合）
    if (record.segment_title && record.segment_title.includes('有給')) {
      user.paidLeaveDays++;
    }

    user.records.push(record);
  });

  // Map を配列に変換
  return Array.from(userMap.values()).map(user => {
    // HRMOS の number フィールドを従業員IDとして使用
    // number が利用できない場合は user_id をフォールバック
    const employeeId = user.employeeNumber || user.employeeId.toString();

    return {
      employeeId: employeeId,
      employeeName: user.employeeName,
      workDays: user.workDays,
      totalWorkHours: (user.totalWorkMinutes / 60).toFixed(1),
      overtimeHours: (user.overtimeMinutes / 60).toFixed(1),
      lateNightHours: (user.lateNightMinutes / 60).toFixed(1),
      absenceDays: user.absenceDays,
      paidLeaveDays: user.paidLeaveDays,
      rawData: user.records // デバッグ用に元データを保持
    };
  });
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { baseUrl, companyUrl, apiKey, targetMonth } = body;

    // バリデーション
    if (!baseUrl || !companyUrl || !apiKey) {
      return NextResponse.json(
        { ok: false, message: "HRMOS設定が不足しています（Base URL / Company URL / API Key）" },
        { status: 400 }
      );
    }

    // 対象月の設定（未指定の場合は当月）
    // HRMOS APIは YYYY-MM 形式を要求
    const month = targetMonth || new Date().toISOString().slice(0, 7);

    console.log(`[HRMOS Sync] 開始 - 対象月: ${month}, Company: ${companyUrl}`);

    // 1. 認証
    console.log('[HRMOS Sync] 認証中...');
    const token = await authenticateHrmos(baseUrl, companyUrl, apiKey);
    console.log('[HRMOS Sync] 認証成功');

    // 2. 月次勤怠データ取得
    console.log('[HRMOS Sync] 勤怠データ取得中...');
    const attendanceData = await fetchMonthlyAttendance(baseUrl, companyUrl, token, month);
    console.log(`[HRMOS Sync] データ取得成功: ${attendanceData.length || 0}件`);
    console.log('[HRMOS Sync] サンプルデータ:', JSON.stringify(attendanceData[0], null, 2));

    // 3. データ変換
    const transformedData = transformAttendanceData(attendanceData);
    console.log('[HRMOS Sync] 変換後データ:', JSON.stringify(transformedData, null, 2));

    return NextResponse.json({
      ok: true,
      message: `HRMOS同期完了: ${transformedData.length}件の勤怠データを取得`,
      syncedAt: new Date().toISOString(),
      month,
      data: transformedData,
      recordCount: transformedData.length
    });

  } catch (error) {
    console.error('[HRMOS Sync] エラー:', error);

    return NextResponse.json({
      ok: false,
      message: `HRMOS同期エラー: ${error.message}`,
      error: error.message,
      syncedAt: new Date().toISOString()
    }, { status: 500 });
  }
}
